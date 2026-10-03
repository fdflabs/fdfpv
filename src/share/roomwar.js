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
 *             and held there after; each AGENTS is followed by a HUNTS
 *             (0xA1) with every hunter's target seat, `hunts` in
 *             attackersAt(), undefined until one is heard (a room from
 *             before HUNTS never sends one)
 *
 * A death is the room's word, applied when it is heard: the attacker goes,
 * and the shell hears of it once through takeEvents(), with where it was,
 * for its burst and its callout. A scripted attacker past the end of its
 * route is not drawn even before its death is heard, since the room has
 * taken it off by then.
 *
 * What the shell reads: view() (the room's: state, wave, output, rack,
 * scores), attackersAt(roomMs), takeEvents(), and mine() for this pilot's
 * own score row. What it sends: start(mission) and end(), the host's.
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

import { decodeAgents, decodeHunts } from './roomwire.js';
import { KINDS, planAgent, poseAt } from './war/routes.js';
import { EXTRAP_MAX_MS } from '../game/peer.js';
import { MISSIONS } from './war/missions/index.js';

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
  /* The room's code: a war's id counts from 1 in every room, so the
   * code and the id together are what tell one war from another. */
  let room = null;
  let war = { state: 'lobby' };
  let error = null;
  /* id -> { a (birth record), plan, samples ([{ t, p, q }], hunters),
   * hunts (a hunter's target seat, null for none, undefined unheard) }. */
  let agents = new Map();
  /* What happened since the shell last asked, oldest first. */
  let events = [];

  function mission() {
    return war.mission ? MISSIONS[war.mission] ?? null : null;
  }

  /* A new match, or none: nothing of the old one is drawn. */
  function reset() {
    agents = new Map();
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
    if (m.scouts === true) {
      events.push({ type: 'scouts', at, by: m.by });
    }
  }

  const api = {
    onWelcome(w) {
      seat = w.seat;
      error = null;
      const next = w.war || { state: 'lobby' };
      if (next.id !== war.id || (w.code ?? null) !== room) {
        reset();
      }
      room = w.code ?? null;
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
        const stageWas = war.stage ? `${war.stage.id}@${war.stage.at}` : null;
        war = m.war;
        if (was !== war.state) {
          events.push({ type: 'state', from: was, to: war.state, why: war.why ?? null });
        }
        /* A stage entered (src/share/war/stages.js): the HUD's lower
         * third. Keyed by its entry too, so a stage entered again is
         * told again. */
        const stageNow = war.stage ? `${war.stage.id}@${war.stage.at}` : null;
        if (stageNow && stageNow !== stageWas) {
          events.push({
            type: 'stage', id: war.stage.id, n: war.stage.n, at: war.stage.at, title: war.stage.title ?? null,
          });
        }
        return true;
      }
      if (m.op === 'born') {
        adopt(m.agents || []);
      } else if (m.op === 'dead') {
        dead(m);
      } else if (m.op === 'stall') {
        /* An EMP stalled these (war.js): their routes wait m.ms from m.at,
         * the same on every screen. */
        const mi = mission();
        for (const id of m.ids || []) {
          const x = agents.get(id);
          if (x && mi && x.a.kind !== 'hunter') {
            x.a = { ...x.a, stalls: [...(x.a.stalls || []), [m.at, m.ms]] };
            x.plan = planAgent(mi, x.a);
          }
        }
        events.push({
          type: 'stall', ids: m.ids || [], at: m.at, ms: m.ms,
        });
      } else if (m.op === 'boom') {
        events.push({
          type: 'boom', seat: m.seat, at: m.at, p: m.p, mine: m.seat === seat,
        });
      } else if (m.op === 'cue') {
        /* The stage's cues (src/share/war/stages.js), told when due: the
         * shell plays the radio and the music, and the cutaways. */
        for (const c of m.cues || []) {
          events.push({ type: 'cue', ...c });
        }
      }
      return true;
    },

    /* An AGENTS or a HUNTS frame. Returns true when it was one. */
    onBinary(bytes) {
      const hunts = decodeHunts(bytes);
      if (hunts) {
        for (const h of hunts.agents) {
          const x = agents.get(h.id);
          if (x && x.a.kind === 'hunter') {
            x.hunts = h.target;
          }
        }
        return true;
      }
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
     * [x, y, z, w] }], scene world metres, y up, in id order, and on a
     * hunter whose HUNTS has been heard, hunts: the seat it chases or
     * null. Only while a war is live; none before its birth or past its
     * route's end.
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
          const a = { id: x.a.id, kind: x.a.kind, p: o.p, q: o.q };
          if (x.hunts !== undefined) {
            a.hunts = x.hunts;
          }
          out.push(a);
        }
      }
      return out.sort((a, b) => a.id - b.id);
    },

    /* What happened since the last call, oldest first, each once:
     *   { type: 'born', agents }
     *   { type: 'dead', ids, agents: [{ id, kind, p }], at, by, why, p,
     *     target, hit, mw, mine }
     *   { type: 'boom', seat, at, p, mine }    mine: break this craft
     *   { type: 'scouts', at, by }             that dead was a scout
     *                                          wave's last: later waves
     *                                          fly with their error
     *   { type: 'state', from, to, why }
     *   { type: 'stage', id, n, at, title } a stage entered, at its room ms
     *   { type: 'cue', at, stage, radio | music | cutaway | text }
     *                                          a stage's cue, at its room
     *                                          ms (stages.js) */
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
    /* Which war this is, unique across rooms, or null with none: what
     * the shell keys its once per war work on (the intro, the begin, a
     * round's restart). The id alone repeats: a campaign's mission 2 is
     * a new room's war 1, as mission 1 was, so the shell took it for the
     * war whose intro it had already played (2026-10-01). */
    match() {
      return war.id == null ? null : `${room}:${war.id}`;
    },
    /* The mission's night flag (itaipu-4): the lighting hook reads it. */
    night() {
      return Boolean(mission()?.night);
    },
    /* This pilot's row of the scores, or null. */
    mine() {
      return (war.scores || []).find((r) => r.seat === seat) ?? null;
    },

    /* Host only, the room checks. With intro, the room holds a briefing
     * of INTRO_MS (src/share/war/intro.js) before the countdown, for
     * every screen to play the intro over; skipIntro cuts it short. */
    start(missionId, { intro = false } = {}) {
      send({
        type: 'war', op: 'start', mission: missionId, ...(intro ? { intro: true } : {}),
      });
    },
    skipIntro() {
      send({ type: 'war', op: 'skipIntro' });
    },
    /* Any pilot: ready for what comes next (a stage's { ready }). */
    ready() {
      send({ type: 'war', op: 'ready' });
    },
    /* The stage the room is in (war.js view stage), or null. */
    stage() {
      return war.stage ?? null;
    },
    end() {
      send({ type: 'war', op: 'end' });
    },
    clear() {
      seat = null;
      room = null;
      war = { state: 'lobby' };
      error = null;
      events = [];
      reset();
    },
  };
  return api;
}
