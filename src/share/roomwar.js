/*
 * roomwar.js: Defend Itaipu, the client's half of a room's war
 * (docs/WARFARE-PLAN.md section 5.2; the room's half is edge/rooms/war.js).
 *
 * The room flies the attackers and judges every detonation; this module
 * keeps what the room has said, and answers where every live attacker is
 * at any room millisecond:
 *
 *   scripted  born from a { op: 'born' } record and flown here by
 *             src/share/war/routes.js, the same function on the same
 *             numbers as the room, so every screen draws the same path
 *             and the room never sends their poses
 *   hunters   the room steers them, so their poses come in AGENTS (0xA0)
 *             frames; drawn between the two samples either side of the
 *             asked millisecond, or carried on from the newest at its
 *             velocity for at most EXTRAP_MAX_MS (src/game/peer.js's cap)
 *             and held there after
 *
 * A death is the room's word, applied when it is heard: the attacker goes,
 * and the shell hears of it once through takeEvents(), with where it was,
 * for its burst and its callout. A scripted attacker past the end of its
 * route is not drawn even before its death is heard, since the room has
 * taken it off by then.
 *
 * What the shell reads: view() (the room's: state, wave, output, rack,
 * scores), attackersAt(roomMs), takeEvents(), and mine() for this pilot's
 * own score row. What it sends: start(mission) and end() (the host's) and
 * sendLost() (the pilot's airframe lost to its link, section 6.4).
 *
 * Pure: no DOM, no timers, no three.js, the room clock handed in, so a
 * check in Node can drive it against edge/rooms/core.js.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { decodeAgents } from './roomwire.js';
import { KINDS, planAgent, poseAt } from './war/routes.js';
import { EXTRAP_MAX_MS } from '../game/peer.js';
import itaipu1 from './war/missions/itaipu-1.js';

/* The missions this client can draw, by id: the room's MISSIONS
 * (edge/rooms/war.js) must be a subset, or a war starts that no screen
 * can fly. */
export const MISSIONS = { [itaipu1.id]: itaipu1 };

/* A hunter's samples older than this behind its newest are dropped: the
 * far interest band sends one a second, and the shell draws near now. */
const KEEP_MS = 3000;

const LIVE = new Set(['countdown', 'live']);

/* a + (b - a) u on quaternions, the short way, normalised. */
function nlerp(a, b, u, out) {
  const s = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
  let n = 0;
  for (let i = 0; i < 4; i += 1) {
    out[i] = a[i] + (b[i] * s - a[i]) * u;
    n += out[i] * out[i];
  }
  n = Math.sqrt(n);
  for (let i = 0; i < 4; i += 1) {
    out[i] /= n;
  }
  return out;
}

/*
 * A hunter's pose at t from its samples [{ t, p, q }], oldest first, into
 * out { p, q }: between the two either side, or on from the newest at the
 * last two samples' velocity for at most EXTRAP_MAX_MS, or the oldest
 * before it. Returns out.
 */
export function trackAt(s, t, out) {
  const last = s[s.length - 1];
  if (t >= last.t) {
    const prev = s.length > 1 ? s[s.length - 2] : null;
    const ahead = Math.min(t - last.t, EXTRAP_MAX_MS) / 1000;
    const dt = prev ? (last.t - prev.t) / 1000 : 0;
    for (let i = 0; i < 3; i += 1) {
      out.p[i] = last.p[i] + (dt > 0 ? (last.p[i] - prev.p[i]) / dt : 0) * ahead;
    }
    out.q = last.q.slice();
    return out;
  }
  if (t <= s[0].t) {
    out.p = s[0].p.slice();
    out.q = s[0].q.slice();
    return out;
  }
  let i = s.length - 1;
  while (s[i - 1].t > t) {
    i -= 1;
  }
  const a = s[i - 1];
  const b = s[i];
  const u = (t - a.t) / (b.t - a.t);
  for (let k = 0; k < 3; k += 1) {
    out.p[k] = a.p[k] + (b.p[k] - a.p[k]) * u;
  }
  nlerp(a.q, b.q, u, out.q);
  return out;
}

/* send(obj) puts one text message on the room's socket. */
export function createRoomWar(send) {
  let seat = null;
  let war = { state: 'lobby' };
  let error = null;
  /* id -> { a (birth record), plan, samples ([{ t, p, q }], hunters) }. */
  let agents = new Map();
  /* What happened since the shell last asked, oldest first. */
  let events = [];
  let lostSent = null;

  function mission() {
    return war.mission ? MISSIONS[war.mission] ?? null : null;
  }

  /* A new match, or none: nothing of the old one is drawn. */
  function reset() {
    agents = new Map();
    lostSent = null;
  }

  function adopt(list) {
    const m = mission();
    if (!m) {
      /* A mission this build does not have: nothing can be flown, and
       * saying so is better than drawing nothing silently. */
      error = 'mission';
      return;
    }
    const born = [];
    for (const a of list) {
      if (agents.has(a.id)) {
        continue;
      }
      agents.set(a.id, { a, plan: planAgent(m, a), samples: [] });
      born.push(a);
    }
    if (born.length) {
      events.push({ type: 'born', agents: born });
    }
  }

  /* Where attacker x is at t, { p, q }, or null before its birth. A
   * hunter the room has not sent yet is where it is born. */
  function poseOf(x, t) {
    if (x.samples.length) {
      return trackAt(x.samples, t, { p: [0, 0, 0], q: [0, 0, 0, 1] });
    }
    const o = poseAt(x.plan, t);
    return o ? { p: o.p, q: o.q } : null;
  }

  function dead(m) {
    const at = m.at;
    const list = [];
    for (const id of m.ids || []) {
      const x = agents.get(id);
      if (!x) {
        continue;
      }
      const o = poseOf(x, at);
      list.push({ id, kind: x.a.kind, p: o ? o.p : m.p.slice() });
      agents.delete(id);
    }
    events.push({
      type: 'dead', ids: m.ids || [], agents: list, at, by: m.by, why: m.why, p: m.p, target: m.target ?? null, hit: m.hit === true,
      mw: m.target && mission() && mission().targets[m.target] ? mission().targets[m.target].mw : 0,
      mine: m.why === 'boom' && m.by === seat,
    });
  }

  const api = {
    onWelcome(w) {
      seat = w.seat;
      error = null;
      const next = w.war || { state: 'lobby' };
      if (next.id !== war.id) {
        reset();
      }
      war = next;
    },

    /* A room message this module owns. Returns true when it was one. */
    onMessage(m) {
      if (m.type !== 'war') {
        return false;
      }
      if (m.error) {
        error = m.error;
        return true;
      }
      if (m.war) {
        error = null;
        if (m.war.id !== war.id) {
          reset();
        }
        const was = war.state;
        war = m.war;
        if (was !== war.state) {
          events.push({ type: 'state', from: was, to: war.state, why: war.why ?? null });
        }
        return true;
      }
      if (m.op === 'born') {
        adopt(m.agents || []);
      } else if (m.op === 'dead') {
        dead(m);
      } else if (m.op === 'boom') {
        events.push({
          type: 'boom', seat: m.seat, at: m.at, p: m.p, mine: m.seat === seat,
        });
      }
      return true;
    },

    /* An AGENTS frame. Returns true when it was one. */
    onBinary(bytes) {
      const got = decodeAgents(bytes);
      if (!got) {
        return false;
      }
      for (const h of got.agents) {
        const x = agents.get(h.id);
        /* A hunter this client has no birth for (a frame that crossed its
         * death, or one from before a welcome): not drawn. */
        if (!x || x.a.kind !== KINDS[h.kind]) {
          continue;
        }
        const s = x.samples;
        if (s.length && got.roomMs <= s[s.length - 1].t) {
          continue;
        }
        s.push({ t: got.roomMs, p: h.p, q: h.q });
        while (s.length > 2 && s[0].t < got.roomMs - KEEP_MS) {
          s.shift();
        }
      }
      return true;
    },

    /*
     * Every attacker alive at room ms t: [{ id, kind, p: [x, y, z], q:
     * [x, y, z, w] }], scene world metres, y up, in id order. Only while a
     * war is live; none before its birth or past its route's end.
     */
    attackersAt(t) {
      const out = [];
      if (war.state !== 'live' || t == null) {
        return out;
      }
      for (const x of agents.values()) {
        if (t < x.a.t0 || t > x.plan.tEnd) {
          continue;
        }
        const o = poseOf(x, t);
        if (o) {
          out.push({ id: x.a.id, kind: x.a.kind, p: o.p, q: o.q });
        }
      }
      return out.sort((a, b) => a.id - b.id);
    },

    /* What happened since the last call, oldest first, each once:
     *   { type: 'born', agents }
     *   { type: 'dead', ids, agents: [{ id, kind, p }], at, by, why, p,
     *     target, hit, mw, mine }
     *   { type: 'boom', seat, at, p, mine }    mine: break this craft
     *   { type: 'state', from, to, why } */
    takeEvents() {
      const out = events;
      events = [];
      return out;
    },

    view() {
      return war;
    },
    seat() {
      return seat;
    },
    error() {
      return error;
    },
    on() {
      return LIVE.has(war.state);
    },
    live() {
      return war.state === 'live';
    },
    mission,
    /* This pilot's row of the scores, or null. */
    mine() {
      return (war.scores || []).find((r) => r.seat === seat) ?? null;
    },

    /* Host only, the room checks. */
    start(missionId) {
      send({ type: 'war', op: 'start', mission: missionId });
    },
    end() {
      send({ type: 'war', op: 'end' });
    },
    /* This pilot's airframe lost to its link: once a life, while the war
     * is live. `life` is anything that changes on a respawn (the shell's
     * reset count), so a second loss after a respawn is sent. */
    sendLost(life = 0) {
      if (war.state !== 'live' || lostSent === `${war.id}:${life}`) {
        return false;
      }
      lostSent = `${war.id}:${life}`;
      send({ type: 'war', op: 'lost' });
      return true;
    },

    clear() {
      seat = null;
      war = { state: 'lobby' };
      error = null;
      events = [];
      reset();
    },
  };
  return api;
}
