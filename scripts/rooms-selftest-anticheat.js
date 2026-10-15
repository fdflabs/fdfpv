/*
 * rooms-selftest-anticheat.js: the race witness section of npm run
 * rooms:selftest (edge/rooms/anticheat.js, docs/redesign/COMPLETENESS.md
 * item 62), in two halves.
 *
 * THE ROOM. Two pilots race two laps of tests/fixtures/map-track-v4.json
 * through RoomCore as a platform drives it, sending poses at 30 Hz along a
 * line through every gate's opening and their passes and finish at the
 * times that line crosses them, each claim sent before the poses of its
 * own frame (the order that makes the room wait). Honest, every pass is
 * relayed and both finishes stand. Then the forgeries, each refused
 * without anybody being removed from the room: passes and a finish for
 * gates the poses never went near, a finish a second and a half before
 * the poses crossed the line, and a racer whose poses stop a hundred
 * metres short and claims the line two tenths of a second later. And what
 * the room must let through: a gap of two seconds in the poses across a
 * gate, poses that stop at the line before the finish, a plane's pass
 * within PLANE_REACH of a pylon but outside its opening, and a racer that
 * sent no pose at all (the witness's stated limit).
 *
 * THE RECORDED FLIGHTS. Every stick recording in tests/inputs (the quad's
 * baseline and every plane's, the browser wing harness's table) flown on
 * the real plant at 1 kHz, as the shell flies it: a course is hung across
 * its path, a gate at the aircraft every few seconds facing its way, the
 * shell's own Race scores it frame by frame at 60 Hz with the reach the
 * shell gives that aircraft, and each pass is claimed as src/main.js
 * roomRacePass claims it. The room's witness sees the same flight as
 * 30 Hz poses and must refuse none of it.
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

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HERE_MS, RoomCore, TICK_MS } from '../edge/rooms/core.js';
import { COUNTDOWN_MS } from '../edge/rooms/race.js';
import { FINISH_RESEND_MS, createRoomRace } from '../src/share/roomrace.js';
import { CLAIM_WINDOW_MS, Witness, gateDistance } from '../edge/rooms/anticheat.js';
import { PLANE_REACH, Race } from '../src/game/race.js';
import { simPosToThree } from '../src/render/frame.js';
import {
  FLAG_AIRBORNE, PROTO, ROOM_LEVEL, encodePose,
} from '../src/share/roomwire.js';
import { loadSim } from '../tests/lib/simmod.js';
import { ST, must } from '../tests/lib/replay.js';
import { decodeRec } from '../tests/lib/recfile.js';
import {
  bombshellGroundPrelude, bramorChutePrelude, bramorPrelude, capGroundPrelude, cubGroundPrelude, dlgRecPrelude, extraGroundPrelude,
  f16GroundPrelude, gliderRecPrelude, herculesGroundPrelude, kadetGroundPrelude, nighttimberGroundPrelude, p51AirPrelude, p51RecPrelude,
  skyPrelude, slickGroundPrelude, slowstickGroundPrelude, tigermothGroundPrelude, timberFloatRecPrelude, timberRecPrelude,
  uglystikGroundPrelude, wingPrelude, zagiPrelude,
} from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const TRACK = JSON.parse(readFileSync(join(root, 'tests/fixtures/map-track-v4.json'), 'utf8'));
const LAPS = 2;
const SPEED = 20;
const POSE_MS = 1000 / 30;

/* A private race room on swiss2 with pilots on `airframes`, the host's
 * track loaded and everybody ready. */
function room(airframes) {
  const r = new RoomCore({
    code: 'WITNES', cap: 8, friendly: true, map: 'swiss2', epoch: 0, public: false, mode: 'race', name: null, pick: [1, 1], mission: null, hidden: false,
  });
  let tokens = 0;
  const env = { r, socks: [], clock: 0 };
  env.apply = (actions) => {
    for (const x of actions) {
      if (x.send && x.send.got) {
        x.send.got.push(typeof x.data === 'string' ? JSON.parse(x.data) : x.data);
      }
      if (x.close && x.close.got) {
        x.close.closed = x.code;
      }
    }
  };
  env.say = (i, obj) => env.apply(r.message(env.socks[i], JSON.stringify(obj), env.clock, env.socks[i].address));
  airframes.forEach((airframe, i) => {
    const so = { name: `p${i}`, address: `10.7.7.${i + 1}`, got: [] };
    env.socks[i] = so;
    env.apply(r.open(so, env.clock));
    env.apply(r.message(so, JSON.stringify({
      type: 'hello', proto: PROTO, build: 't', level: ROOM_LEVEL, name: [i, i, 40 + i], profile: { airframe, map: 'swiss2', figure: 1, livery: null, parts: null },
    }), env.clock, so.address, () => (tokens += 1).toString(16).padStart(32, '0')));
  });
  env.say(0, { type: 'track', doc: TRACK });
  airframes.forEach((_, i) => env.say(i, { type: 'race', op: 'ready', track: r.race.track.id, ready: true }));
  env.say(0, { type: 'race', op: 'start', laps: LAPS });
  env.seat = (i) => r.seats.get(env.socks[i]).seat;
  env.pose = (i, t, p) => {
    env.seq = ((env.seq ?? 0) + 1) & 0xffff;
    env.apply(r.message(env.socks[i], encodePose({
      flags: FLAG_AIRBORNE, seq: env.seq, t, px: p.x, py: p.y, pz: p.z, qx: 0, qy: 0, qz: 0, qw: 1, vx: p.vx ?? 0, vy: p.vy ?? 0, vz: p.vz ?? 0, wx: 0, wy: 0, wz: 0, c0: 0, c1: 0, c2: 0, c3: 0, motor: 0, flaps: 0,
    }), env.clock, env.socks[i].address));
  };
  return env;
}

/* The opening's centre of each station, in flying order. */
function centres(w) {
  return w.gates.map((g) => {
    const ap = g.apertures[0];
    return { x: g.x, y: g.y + ap.centreY, z: g.z };
  });
}

/*
 * A flight along straight lines at SPEED through every waypoint, from 20 m
 * before the timing gate: positions by room ms, and the room ms each
 * waypoint is reached. `route` is a list of points.
 */
function lineFlight(route, t0) {
  const legs = [];
  let t = t0;
  for (let i = 1; i < route.length; i += 1) {
    const a = route[i - 1];
    const b = route[i];
    const ms = (Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / SPEED) * 1000;
    legs.push({ a, b, t, ms });
    t += ms;
  }
  const at = (time) => {
    const leg = legs.find((l) => time <= l.t + l.ms) ?? legs[legs.length - 1];
    const u = leg.ms > 0 ? Math.max(0, Math.min(1, (time - leg.t) / leg.ms)) : 1;
    return {
      x: leg.a.x + (leg.b.x - leg.a.x) * u,
      y: leg.a.y + (leg.b.y - leg.a.y) * u,
      z: leg.a.z + (leg.b.z - leg.a.z) * u,
      vx: ((leg.b.x - leg.a.x) / leg.ms) * 1000,
      vy: ((leg.b.y - leg.a.y) / leg.ms) * 1000,
      vz: ((leg.b.z - leg.a.z) / leg.ms) * 1000,
    };
  };
  return { at, reached: [t0, ...legs.map((l) => l.t + l.ms)], end: t };
}

/* The honest route: the start, then each station's opening for LAPS laps
 * and the timing gate to finish. Returns the route and, per waypoint after
 * the start, the claim an honest client makes there. */
function honestRoute(w) {
  const c = centres(w);
  const n = c.length;
  const g0 = w.gates[w.timingIdx];
  const route = [{ x: c[w.timingIdx].x - g0.az.x * 20, y: c[w.timingIdx].y - g0.az.y * 20, z: c[w.timingIdx].z - g0.az.z * 20 }];
  const claims = [];
  let laps = 0;
  for (let k = 0; k <= LAPS * n; k += 1) {
    const idx = (w.timingIdx + k) % n;
    route.push(c[idx]);
    if (k > 0 && idx === w.timingIdx) {
      laps += 1;
    }
    claims.push(laps === LAPS ? { finish: true, lap: laps } : { lap: laps, gate: idx === w.timingIdx ? 1 : ((idx - w.timingIdx + n) % n) + 1 });
  }
  return { route, claims };
}

/*
 * Flies pilot i along `flight` from the race's go, sending a claim at each
 * of `claims` (room ms `at`) before the poses of its tick, and poses at
 * 30 Hz while `posing(t)` holds. Runs until `until`.
 */
function fly(e, i, flight, claims, until, posing = () => true) {
  const race = e.r.race.race;
  let nextPose = race.goAt - 500;
  const queue = [...claims].sort((a, b) => a.at - b.at);
  while (e.clock < until) {
    e.clock += TICK_MS;
    while (queue.length && queue[0].at <= e.clock) {
      const c = queue.shift();
      const t = Math.round(c.at - race.goAt);
      e.say(i, c.finish
        ? { type: 'race', op: 'finish', race: race.id, ms: t, lap: c.lap, points: 0 }
        : { type: 'event', kind: 'gate', race: race.id, lap: c.lap, gate: c.gate, t, points: 0 });
    }
    while (nextPose <= e.clock) {
      const t = Math.round(nextPose);
      if (posing(t)) {
        e.pose(i, t, flight.at(Math.max(t, race.goAt)));
      }
      nextPose += POSE_MS;
    }
    e.apply(e.r.tick(e.clock));
  }
}

/* The passes pilot `from` was told of, from seat `seat`. */
function relayed(e, from, seat) {
  return e.socks[from].got.filter((m) => m.type === 'event' && m.kind === 'gate' && m.seat === seat);
}

function roomHalf(check) {
  {
    const e = room(['interceptor', 'interceptor']);
    const w = e.r.race.witness;
    const race = e.r.race.race;
    const { route, claims } = honestRoute(w);
    const f = lineFlight(route, race.goAt);
    const timed = claims.map((c, k) => ({ ...c, at: f.reached[k + 1] }));
    fly(e, 1, f, timed, f.end + 3000);
    const passes = relayed(e, 0, e.seat(1));
    check('an honest racer\'s every pass reaches the others, though each is sent before the poses that show it',
      passes.length === timed.length - 1 && w.flagged === 0,
      `${passes.length} of ${timed.length - 1} relayed; ${w.flagged} refused`);
    check('and its finish stands at the time it claimed',
      race.finish[e.seat(1)] && race.finish[e.seat(1)].ms === Math.round(f.end - race.goAt) && !race.out[e.seat(1)],
      JSON.stringify(race.finish[e.seat(1)] ?? race.out[e.seat(1)]));
    check('the room decided every one of its claims and refused none', w.judged === timed.length && w.flagged === 0, `${w.judged} decided, ${w.flagged} refused`);
  }
  {
    const e = room(['interceptor', 'interceptor']);
    const w = e.r.race.witness;
    const race = e.r.race.race;
    const { route, claims } = honestRoute(w);
    const honest = lineFlight(route, race.goAt);
    /* It flies to the timing gate and circles it, and claims the honest
     * racer's times. */
    const g0 = centres(w)[w.timingIdx];
    const loop = [route[0]];
    for (let k = 0; k < 40; k += 1) {
      loop.push({ x: g0.x + 10 * Math.cos(k), y: g0.y + 5, z: g0.z + 10 * Math.sin(k) });
    }
    const f = lineFlight(loop, race.goAt);
    const timed = claims.map((c, k) => ({ ...c, at: honest.reached[k + 1] }));
    fly(e, 1, f, timed, honest.end + 3000);
    const seat = e.seat(1);
    check('passes for gates the racer\'s poses never went near are not relayed',
      relayed(e, 0, seat).every((m) => m.gate === 1 && m.lap === 0) && w.flags.some((x) => x.why === 'gate_not_flown'),
      `${relayed(e, 0, seat).map((m) => `${m.lap}:${m.gate}`).join(' ')}; ${w.flags.map((x) => x.why).join(' ')}`);
    check('and a finish of laps it never flew retires it from the race', race.out[seat] === 'retired' && !race.finish[seat], JSON.stringify(race.out));
    check('nobody is removed from the room for it', e.r.seats.has(e.socks[1]) && !e.socks[1].closed, `seated ${e.r.seats.has(e.socks[1])}`);
    /* The cheater's page (src/share/roomrace.js) read the room's word on
     * its finish: out, the reason on its row, and no finish resent. */
    const told = e.socks[1].got.filter((m) => m.type === 'race' && m.race).at(-1);
    const sent = [];
    const rr = createRoomRace((m) => sent.push(m));
    rr.onWelcome({ seat, race: { ...told.race, state: 'on', standings: [] } });
    const roomNow = e.r.roomMs(e.clock);
    for (let lap = 0; lap < LAPS; lap += 1) {
      rr.pass({ lapDone: true, gate: 1 }, roomNow);
    }
    rr.onMessage(told);
    for (let k = 1; k <= 4; k += 1) {
      rr.frame(roomNow + k * FINISH_RESEND_MS);
    }
    const mine = told.race.standings.find((row) => row.seat === seat);
    check('the room tells the page why: its row retired, laps_not_flown, and the page shows itself out and stops resending the finish',
      mine.out === 'retired' && mine.why === 'laps_not_flown' && rr.role(roomNow) === 'out'
      && sent.filter((m) => m.op === 'finish').length === 1 && rr.standings().find((row) => row.seat === seat).ms == null,
      `${JSON.stringify(mine)}; role ${rr.role(roomNow)}; ${sent.filter((m) => m.op === 'finish').length} finish sent`);
  }
  {
    const e = room(['interceptor', 'interceptor']);
    const w = e.r.race.witness;
    const race = e.r.race.race;
    const { route, claims } = honestRoute(w);
    const f = lineFlight(route, race.goAt);
    const timed = claims.map((c, k) => ({ ...c, at: f.reached[k + 1] - (c.finish ? 1500 : 0) }));
    fly(e, 1, f, timed, f.end + 3000);
    check('a finish claimed a second and a half before its poses cross the line is refused',
      race.out[e.seat(1)] === 'retired' && w.flags.length === 1 && w.flags[0].why === 'laps_not_flown',
      `${JSON.stringify(race.out)}; ${JSON.stringify(w.flags)}`);
  }
  {
    const e = room(['interceptor', 'interceptor']);
    const w = e.r.race.witness;
    const race = e.r.race.race;
    const { route, claims } = honestRoute(w);
    const f = lineFlight(route, race.goAt);
    const timed = claims.map((c, k) => ({ ...c, at: f.reached[k + 1] }));
    /* No pose for a second either side of the second lap's third gate. */
    const hole = timed[timed.length - 3].at;
    fly(e, 1, f, timed, f.end + 3000, (t) => Math.abs(t - hole) > 1000);
    check('two seconds without a pose across a gate: the room gives the racer what it could have flown, and refuses nothing',
      relayed(e, 0, e.seat(1)).length === timed.length - 1 && race.finish[e.seat(1)] && w.flagged === 0,
      `${relayed(e, 0, e.seat(1)).length} relayed; ${w.flagged} refused`);
  }
  {
    const e = room(['interceptor', 'interceptor']);
    const w = e.r.race.witness;
    const race = e.r.race.race;
    const { route, claims } = honestRoute(w);
    const f = lineFlight(route, race.goAt);
    const timed = claims.map((c, k) => ({ ...c, at: f.reached[k + 1] }));
    /* Its page goes to the results the frame it crosses: no pose after. */
    fly(e, 1, f, timed, f.end + 3000, (t) => t <= f.end - 20);
    check('poses that stop at the line before the finish arrives: the finish stands once the racer has been quiet HERE_MS',
      race.finish[e.seat(1)] && w.flagged === 0, `${JSON.stringify(race.finish[e.seat(1)] ?? race.out)}; ${w.flagged} refused`);
  }
  {
    const e = room(['interceptor', 'interceptor']);
    const w = e.r.race.witness;
    const race = e.r.race.race;
    const { route, claims } = honestRoute(w);
    const f = lineFlight(route, race.goAt);
    /* The last lap's gate two before the line. */
    const stop = f.reached[f.reached.length - 3];
    const lead = gateDistance(w.gates[w.timingIdx], f.at(stop), 0);
    const timed = claims.map((c, k) => ({ ...c, at: c.finish ? stop + 200 : f.reached[k + 1] })).filter((c) => c.at <= stop + 200);
    fly(e, 1, f, timed, stop + 200 + HERE_MS + 2000, (t) => t <= stop);
    check(`poses that stop ${lead.toFixed(0)} m from the line, a finish claimed 0.2 s later: farther than ${((0.2 + CLAIM_WINDOW_MS / 1000) * 100).toFixed(0)} m at 100 m/s, refused`,
      lead > 0.6 * 100 && race.out[e.seat(1)] === 'retired' && w.flags.some((x) => x.kind === 'finish'),
      `${JSON.stringify(race.out)}; ${JSON.stringify(w.flags)}`);
  }
  {
    const e = room(['cub1400', 'interceptor']);
    const w = e.r.race.witness;
    const race = e.r.race.race;
    /* The Cub passes the timing gate 30 m to its side, the reach the shell
     * gives a plane (race.js PLANE_REACH 40, from the structure). */
    const c0 = centres(w)[w.timingIdx];
    const g0 = w.gates[w.timingIdx];
    const side = { x: c0.x + g0.ax.x * 30, y: c0.y, z: c0.z + g0.ax.z * 30 };
    const route = [{ x: side.x - g0.az.x * 20, y: side.y, z: side.z - g0.az.z * 20 }, side, { x: side.x + g0.az.x * 20, y: side.y, z: side.z + g0.az.z * 20 }];
    const f = lineFlight(route, race.goAt);
    fly(e, 0, f, [{ lap: 0, gate: 1, at: f.reached[1] }], f.end + 1000);
    check('a plane\'s pass 30 m to the side of the timing gate, inside its reach, stands', relayed(e, 1, e.seat(0)).length === 1 && w.flagged === 0, `${relayed(e, 1, e.seat(0)).length} relayed; ${w.flagged} refused`);
  }
  {
    const e = room(['interceptor', 'interceptor']);
    const w = e.r.race.witness;
    const race = e.r.race.race;
    const { claims } = honestRoute(w);
    const timed = claims.map((c, k) => ({ ...c, at: race.goAt + 3000 + 500 * k }));
    fly(e, 1, null, timed, race.goAt + 3000 + 500 * claims.length + 2000, () => false);
    check('a racer that sends no pose is not judged: its claims stand (the witness\'s limit, anticheat.js)',
      race.finish[e.seat(1)] && w.flagged === 0, JSON.stringify(race.finish[e.seat(1)] ?? race.out));
  }
}

/* Every stick recording, with what the browser wing harness seats it on. */
const RECORDINGS = [
  { rec: 'baseline.rec', airframe: 'interceptor', prelude: null },
  { rec: 'wing-baseline.rec', prelude: wingPrelude },
  { rec: 'sky-baseline.rec', prelude: skyPrelude },
  { rec: 'cub-baseline.rec', prelude: (sim) => cubGroundPrelude(sim) },
  { rec: 'glider-baseline.rec', prelude: gliderRecPrelude },
  { rec: 'bramor-baseline.rec', prelude: bramorPrelude },
  { rec: 'bramor-chute.rec', prelude: bramorChutePrelude },
  { rec: 'slowstick-baseline.rec', prelude: (sim) => slowstickGroundPrelude(sim) },
  { rec: 'timber-baseline.rec', prelude: timberRecPrelude },
  { rec: 'timberf-baseline.rec', prelude: timberFloatRecPrelude },
  { rec: 'bombshell-baseline.rec', prelude: (sim) => bombshellGroundPrelude(sim) },
  { rec: 'kadet-baseline.rec', prelude: (sim) => kadetGroundPrelude(sim) },
  { rec: 'uglystik-baseline.rec', prelude: (sim) => uglystikGroundPrelude(sim) },
  { rec: 'dlg-baseline.rec', prelude: dlgRecPrelude },
  { rec: 'tigermoth-baseline.rec', prelude: (sim) => tigermothGroundPrelude(sim) },
  { rec: 'extra-baseline.rec', prelude: (sim) => extraGroundPrelude(sim) },
  { rec: 'hercules-baseline.rec', prelude: (sim) => herculesGroundPrelude(sim) },
  { rec: 'slick-baseline.rec', prelude: (sim) => slickGroundPrelude(sim) },
  { rec: 'nighttimber-baseline.rec', prelude: (sim) => nighttimberGroundPrelude(sim, { flaps: 1 }) },
  { rec: 'cap580-baseline.rec', prelude: (sim) => capGroundPrelude(sim) },
  { rec: 'f16-baseline.rec', prelude: (sim) => f16GroundPrelude(sim) },
  { rec: 'p51-baseline.rec', prelude: p51RecPrelude },
  { rec: 'p51-air.rec', prelude: p51AirPrelude },
  { rec: 'zagi-baseline.rec', prelude: (sim) => zagiPrelude(sim) },
];
const GATE_EVERY_MS = 3000;
const FRAME_MS = 1000 / 60;

/* The recording flown on the plant: the scene position at every whole ms. */
async function flown(wasm, config, entry) {
  const rec = decodeRec(new Uint8Array(readFileSync(join(root, 'tests/inputs', entry.rec))));
  const sim = await loadSim(wasm);
  must(sim.init(config), 'sim_init');
  if (entry.prelude) {
    entry.prelude(sim);
  }
  const endMs = Math.round((rec.count * 1000) / rec.rateHz);
  const pos = new Float64Array((endMs + 1) * 3);
  const into = (at) => ({
    set(x, y, z) {
      pos[at] = x;
      pos[at + 1] = y;
      pos[at + 2] = z;
    },
  });
  let next = 0;
  for (let ms = 0; ms <= endMs; ms += 1) {
    while (next < rec.count && Math.floor(rec.samples[next].tUs / 1000) <= ms) {
      const s = rec.samples[next];
      must(sim.input(s.tUs / 1e6, s.roll, s.pitch, s.yaw, s.throttle), 'sim_input');
      next += 1;
    }
    const read = sim.readState();
    must(read.code, 'sim_state');
    const st = read.state;
    simPosToThree(st[ST.PX], st[ST.PY], st[ST.PZ], into(ms * 3));
    if (ms < endMs) {
      must(sim.step(1), 'sim_step');
    }
  }
  return { endMs, at: (ms) => ({ x: pos[ms * 3], y: pos[ms * 3 + 1], z: pos[ms * 3 + 2] }) };
}

/* A gate at the aircraft every GATE_EVERY_MS while it moves at 3 m/s or
 * more, facing its way, a standard gate's opening (the fixture's 1.75 m). */
function courseOver(flight) {
  const gates = [];
  for (let t = 2000; t + 500 < flight.endMs; t += GATE_EVERY_MS) {
    const a = flight.at(t - 50);
    const b = flight.at(t + 50);
    const vx = (b.x - a.x) * 10;
    const vz = (b.z - a.z) * 10;
    if (Math.hypot(vx, vz) < 3) {
      continue;
    }
    const p = flight.at(t);
    const ap = { centreY: 0.8763, clearW: 1.7526, clearH: 1.7526 };
    gates.push({
      position: { x: p.x, y: p.y - ap.centreY, z: p.z }, heading: Math.atan2(-vx, -vz), pitch: 0, flyOrder: gates.length, apertures: [ap], aperture: ap,
    });
  }
  return gates;
}

/*
 * The shell's Race over the flight frame by frame, each pass claimed as
 * src/main.js roomRacePass claims it, and the witness on 30 Hz poses, each
 * frame's claims judged before its poses arrive, each claimed `early` ms
 * before the crossing (0, as the shell claims). Returns the counts.
 */
function witnessFlight(flight, gates, airframe, early = 0) {
  const plane = airframe !== 'interceptor';
  const race = new Race(gates, 'full', { reach: plane ? PLANE_REACH : 0 });
  const w = new Witness();
  w.gates = race.gates;
  w.timingIdx = race.timingIdx;
  w.goAt = 0;
  const pending = [];
  const settle = (now) => {
    for (let i = 0; i < pending.length; i += 1) {
      const v = w.judge(pending[i], now);
      if (v === 'wait') {
        return;
      }
      w.record(pending[i], v);
      pending.splice(i, 1);
      i -= 1;
    }
  };
  let prev = flight.at(0);
  let prevMs = 0;
  let nextPose = 0;
  let claims = 0;
  for (let f = 1; prevMs < flight.endMs; f += 1) {
    const ms = Math.min(flight.endMs, Math.floor(f * FRAME_MS));
    const curr = flight.at(ms);
    const res = race.update(prev, curr, ms, 0);
    if (res.passed != null) {
      const cross = race.lapStartMs + (race.splits.length ? race.splits[race.splits.length - 1] : 0);
      claims += 1;
      pending.push({
        seat: 1, at: Math.round(cross) - early, finish: false, laps: race.laps.length, gate: race.lapStartMs != null ? race.splits.length + 1 : 0, heardAt: ms,
      });
      settle(ms);
    }
    while (nextPose <= ms) {
      const t = Math.round(nextPose);
      const p = flight.at(t);
      w.sample(1, airframe, { t, px: p.x, py: p.y, pz: p.z }, ms);
      settle(ms);
      nextPose += POSE_MS;
    }
    prev = curr;
    prevMs = ms;
  }
  settle(flight.endMs + HERE_MS + 1);
  return { claims, judged: w.judged, flagged: w.flagged, flags: w.flags, waiting: pending.length };
}

async function recordedHalf(check) {
  const wasm = readFileSync(join(root, 'dist/sim.wasm'));
  const config = readFileSync(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
  let claims = 0;
  const early = { quad: [0, 0], plane: [0, 0] };
  const bad = [];
  for (const entry of RECORDINGS) {
    const airframe = entry.airframe ?? 'cub1400';
    const flight = await flown(wasm, config, entry);
    const gates = courseOver(flight);
    const got = witnessFlight(flight, gates, airframe);
    claims += got.claims;
    const forged = witnessFlight(flight, gates, airframe, 1000);
    const kind = airframe === 'interceptor' ? 'quad' : 'plane';
    early[kind][0] += forged.flagged;
    early[kind][1] += forged.claims;
    if (got.flagged || got.waiting || got.judged !== got.claims) {
      bad.push(`${entry.rec}: ${got.flagged} refused of ${got.claims} (${got.flags.map((x) => `${x.why}@${x.t}`).join(' ')}), ${got.waiting} undecided`);
    }
    console.log(`  ${entry.rec}: ${gates.length} gates, ${got.claims} passes claimed, ${got.flagged} refused; a second early, ${forged.flagged} refused`);
  }
  check(`every recorded flight (${RECORDINGS.length}), scored by the shell's Race at 60 Hz: the witness on 30 Hz poses refuses none of its ${claims} passes`,
    bad.length === 0 && claims > 0, bad.join('; ') || `${claims} passes`);
  /* A plane's gate counts within PLANE_REACH of its structure and the
   * witness takes no direction, so a glider circling in a thermal near a
   * gate is credited it early, as the witness means to err; a quad's
   * opening is its own. Half is a floor that says the check still bites. */
  check('negative control: the same passes each claimed a second before the poses cross the gate: a quad\'s all refused, a plane\'s most',
    early.quad[1] > 0 && early.quad[0] === early.quad[1] && early.plane[0] * 2 > early.plane[1],
    `quad ${early.quad[0]} of ${early.quad[1]}, planes ${early.plane[0]} of ${early.plane[1]} refused`);
}

export async function anticheatSection(check) {
  console.log('the race witness (anticheat.js)');
  roomHalf(check);
  await recordedHalf(check);
}
