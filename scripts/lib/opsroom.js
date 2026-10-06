/*
 * opsroom.js: a headless room running an ops mission (edge/rooms/ops.js)
 * for the checks: real RoomCore, real messages, a millisecond clock the
 * check drives, and scripted pilots that send poses and camera reports
 * the way a screen does (docs/campaign/interior/CONTRACT-P0.md). Used by
 * scripts/contacts-selftest.js, roles-deal.js and interior-stages-selftest.js.
 *
 *   const e = opsRoom(mission, { n, seed, world, map, lagMs, devMissions })
 *   e.paths[i] = (t) => [x, y, z]     where pilot i flies, ops frame (z up)
 *   e.cams[i] = (t) => ({ aim, tanHalf, aspect }) or null
 *   e.air[i] = (t) => bool            airborne (default true)
 *   e.fly(until)                      the clock to `until`, poses at 30 Hz,
 *                                     cams at 2 Hz, the room tick at 30 Hz
 *   e.say(i, msg), e.view(i), e.cues(i), e.errors(i)
 *   e.join(i), e.drop(i)              a pilot arriving, a socket closing
 *
 * lagMs delays every pose and camera report by that much (each pilot by a
 * little more than the one before), still inside the room's frontier
 * wait, for the laggy run a check compares with the prompt one.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import {
  FLAG_AIRBORNE, FLAG_CRASHED, PROTO, encodePose,
} from '../../src/share/roomwire.js';
import { PRIVATE_CAP, RoomCore } from '../../edge/rooms/core.js';
import { docPosToThree } from '../../src/render/frame.js';

/* An ops frame point as the scene's, through frame.js. */
export function toScene(p) {
  const out = { set(x, y, z) { this.v = [x, y, z]; return this; } };
  return docPosToThree(p[0], p[1], p[2], out).v;
}

export function opsRoom(mission, {
  n = 1, seed = 0.25, world, map = 'test', lagMs = 0, devMissions = false, start = true, extraMissions = {},
} = {}) {
  const meta = {
    code: 'OPS000', cap: PRIVATE_CAP, friendly: false, map, epoch: 0,
  };
  const e = {
    socks: [], paths: [], cams: [], air: [], crashed: [], clock: 0, stored: null, queue: [], tokens: [], meta,
  };
  const make = () => {
    const r = new RoomCore(meta, { devMissions });
    r.ops.missions = { ...r.ops.missions, ...extraMissions, ...(mission ? { [mission.id]: mission } : {}) };
    if (world) {
      r.ops.world = world;
    }
    r.ops.random = () => seed;
    return r;
  };
  e.r = make();
  e.apply = (actions) => {
    for (const x of actions) {
      if (x.send) {
        x.send.got.push(typeof x.data === 'string' ? JSON.parse(x.data) : x.data);
      } else if (x.store === 'ops') {
        e.stored = JSON.parse(JSON.stringify(x.value));
      }
    }
  };
  let tokens = 0;
  e.join = (i, token = null) => {
    const so = { name: `ops${i}`, address: `10.7.0.${i + 1}`, got: [] };
    e.socks[i] = so;
    e.apply(e.r.open(so, e.clock));
    const tk = token ?? (tokens += 1).toString(16).padStart(32, '0');
    e.tokens[i] = tk;
    e.apply(e.r.message(so, JSON.stringify({
      type: 'hello', proto: PROTO, build: 't', name: [i, i, 20 + i], ...(token ? { token } : {}), profile: {
        airframe: 'bramor2300', map, figure: 1, livery: null, parts: null,
      },
    }), e.clock, so.address, () => tk));
    return so;
  };
  e.drop = (i) => {
    e.apply(e.r.close(e.socks[i], e.clock, 1006));
    e.socks[i] = null;
  };
  e.seatOf = (i) => e.r.seats.get(e.socks[i])?.seat ?? null;
  for (let i = 0; i < n; i += 1) {
    e.join(i);
  }
  e.say = (i, obj) => e.apply(e.r.message(e.socks[i], JSON.stringify(obj), e.clock, e.socks[i].address));
  /* A message sent with the pilot's lag, as its poses are. */
  e.sayLate = (i, obj) => e.queue.push({
    at: e.clock + (lagMs ? lagMs + 37 * i : 0), k: k += 1, i, data: JSON.stringify(obj),
  });
  let k = 0;
  /* Deliver what is due by the clock: the queued poses and reports. */
  const deliver = () => {
    e.queue.sort((a, b) => a.at - b.at || a.k - b.k);
    while (e.queue.length && e.queue[0].at <= e.clock) {
      const q = e.queue.shift();
      const so = e.socks[q.i];
      if (so && e.r.seats.has(so)) {
        e.apply(e.r.message(so, q.data, e.clock, so.address));
      }
    }
  };
  e.fly = (until) => {
    for (let t = e.clock + 1; t <= until; t += 1) {
      e.clock = t;
      for (let i = 0; i < e.socks.length; i += 1) {
        const so = e.socks[i];
        if (!so || !e.r.seats.has(so) || !e.paths[i]) {
          continue;
        }
        const lag = lagMs ? lagMs + 37 * i : 0;
        if ((t + 7 * i) % 33 === 0) {
          const s = toScene(e.paths[i](t));
          const flags = ((e.air[i] ? e.air[i](t) : true) ? FLAG_AIRBORNE : 0) | ((e.crashed[i] && e.crashed[i](t)) ? FLAG_CRASHED : 0);
          e.queue.push({
            at: t + lag, k: k += 1, i, data: encodePose({
              wx: 0, wy: 0, wz: 0, c0: 0, c1: 0, c2: 0, c3: 0, motor: 0, flaps: 0, seq: 1, px: s[0], py: s[1], pz: s[2], vx: 0, vy: 0, vz: 0, qx: 0, qy: 0, qz: 0, qw: 1, flags, t,
            }),
          });
        }
        if ((t + 11 * i) % 500 === 0 && e.cams[i]) {
          const c = e.cams[i](t);
          if (c) {
            e.queue.push({ at: t + lag, k: k += 1, i, data: JSON.stringify({ type: 'ops', op: 'cam', t, ...c }) });
          }
        }
      }
      deliver();
      if (t % 33 === 0) {
        e.apply(e.r.tick(t));
      }
    }
  };
  e.of = (i, pred) => (e.socks[i]?.got ?? []).filter((m) => m && m.type === 'ops' && pred(m));
  e.view = (i = 0) => e.of(i, (m) => m.ops).at(-1)?.ops ?? null;
  e.cues = (i = 0) => e.of(i, (m) => m.op === 'cue').flatMap((m) => m.cues);
  e.errors = (i = 0) => e.of(i, (m) => m.error);
  /* A restart: a new core restored from what was stored, the same sockets
   * back on their seats from their attachments, as host.js does. */
  e.restart = () => {
    const atts = e.socks.map((so) => (so && e.r.seats.has(so) ? e.r.attachmentOf(e.r.seats.get(so)) : null));
    const meta2 = JSON.parse(JSON.stringify(e.r.meta));
    const stored = e.stored;
    e.r = make();
    e.r.meta = meta2;
    e.r.ops.meta = meta2;
    e.r.ops.restore(JSON.parse(JSON.stringify(stored)));
    e.r.restore(e.socks.map((so, i) => ({ conn: so, attachment: atts[i] })).filter((x) => x.conn && x.attachment));
  };
  if (start && mission) {
    e.say(0, { type: 'ops', op: 'start', mission: mission.id });
  }
  return e;
}

/* A camera aimed at a contact from the newest view: where its route puts
 * it, the way a screen would draw it. */
export function aimAt(e, world, id, tanHalf = 0.08, aspect = 16 / 9, i = 0) {
  return (t) => {
    const c = e.view(i)?.contacts.find((x) => x.id === id);
    if (!c) {
      return null;
    }
    const p = world.poseOnRoute(c.route, t - c.t0);
    return p ? { aim: [p.x, p.y, p.z + 0.8], tanHalf, aspect } : null;
  };
}

let passed = 0;
let failed = 0;
export function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}
export function finish() {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
