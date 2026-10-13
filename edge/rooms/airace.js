/*
 * airace.js: a race room's AI pilots on the real plant (docs/AI-PILOTS-
 * RACES-CONTRACT.md, redesign phase 18 slice 3). roombots.js gives each a
 * seat; this flies it: src/game/aiopponent.js, src/game/aipilot.js's
 * person on a dist/sim.wasm of its own, chasing a ghost round the room's
 * track, judged gate by gate by its own src/game/race.js Race.
 *
 * THE GHOST. Before an AI pilot is seated the room flies the reference
 * lap itself (tests/lib/aireference.js, the harness's reference pilot on a
 * smooth line through every gate) at the level's pace (RACE_PACES), once
 * per track and level for the process. A track the reference cannot lap at
 * that pace gives no ghost, and the room seats no AI pilot on it.
 *
 * THE PLANT. The interceptor (configs/airframes.js DEFAULT_AIRFRAME, the
 * racer a blank profile gets and the harness's quad), its default tune
 * with the menu's default rates, ANGLE mode, a full pack, seated and
 * learnt (aiopponent.js seatOpponent) when its seat is made, never on the
 * tick. The plant's origin is the scene's (frame.js), so a state's
 * position is the scene's through frame.js alone, as aipilot:harness flies
 * it.
 *
 * THE WORLD. The ground under it is the page's (grounds.js groundOf), its
 * slope sampled as src/main.js sampleGroundNormal does; the solids are the
 * gate frames, four bars of the built tube (src/game/track.js
 * BUILT_FRAME_TUBE_OD) round each rectangular opening, as aipilot:harness
 * frames them. The page's own frame capsules come from src/render/scene.js,
 * which needs three.js, so these are the opening's frame and not the
 * drawn gate's every member; a hoop and a pylon have none here.
 *
 * THE GRID. AI pilot k (in the order seated) chases the same ghost k
 * GRID_MS behind, so the AI pilots line up one behind another on the line
 * before the timing gate and never share a point of it.
 *
 * THE CLOCK. Before the race's goAt the plant waits, held, where it was
 * put. From goAt it flies on the room's tick, the elapsed room time each
 * tick and at most warhunt.js GAP_MS of it: a stall longer than that is
 * not caught up, so its clock falls behind the room's by the rest, and its
 * times are its own clock's, as a person's are measured by the person.
 *
 * WHAT IT SENDS. Every pass its Race scores becomes the message a page
 * sends for its own (src/share/roomrace.js pass), handed to the room's
 * race (edge/rooms/race.js) as that seat's: { type: 'event', kind, race,
 * lap, gate, t, points: 0 }, and the last lap's close { type: 'race', op:
 * 'finish', ... }. A crash (aiopponent.js: upside down on the ground for a
 * second, or a part broken in a mid air) is a retire. Its pose goes out
 * every tick as a pilot's POSE bytes, through core.js judge.
 *
 * NEVER ON THE RECORD. Its Race's record write is a no-op (aiopponent.js),
 * and the room posts nothing to any board.
 *
 * NOT YET (the contract): reborn on its last gate after a crash, the
 * board's best lap as its ghost, a restore mid race flying on from the
 * kept plant state. A room restored from storage drops its AI racers
 * (roombots.js reseat) and fills again.
 *
 * LOADED LATE. aiopponent.js and the reference read tests/lib (the plant's
 * loader) and dist/sim.wasm, which a server without them does not have:
 * they are imported here once, at load, and caught, so such a server seats
 * no AI racer and keeps every other room running.
 *
 * WHAT OWNS WHAT. An AiRace lives in one RoomBots inside one RoomCore,
 * which runs one event at a time. The ghosts are shared by every room in
 * the process (prepared below), read only once made.
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

import { groundOf } from './grounds.js';
import { GAP_MS } from './warhunt.js';
import { DEFAULT_AIRFRAME, airframeById } from '../../configs/airframes.js';
import { RATE_DEFAULTS } from '../../configs/rates.js';
import { composeConfig } from '../../src/fc/dump.js';
import { raceFromDocument } from '../../src/game/verify.js';
import { GhostLap } from '../../src/game/ghost.js';
import { Colliders, setCraftAirframe } from '../../src/game/collide.js';
import { BUILT_FRAME_TUBE_OD } from '../../src/game/track.js';
import { decodeGhost, encodeGhost } from '../../src/share/ghostdata.js';
import { simQuatToThree, threeDirToSim, threePosToSim } from '../../src/render/frame.js';
import { FLAG_AIRBORNE, FLAG_CRASHED, FLAG_QUAD, encodePose } from '../../src/share/roomwire.js';

/* The quad every AI racer flies. */
export const AI_RACE_AIRFRAME = DEFAULT_AIRFRAME;
/*
 * The ghost's pace for each level, m/s along the reference line: the
 * levels are the ghost's pace, the pilot behind it is the same person.
 * Chosen under the pilot's measured ceiling on tests/fixtures/
 * map-track-v4.json (aipilot:harness, 2026-10-13: every gate followed up
 * to 13 m/s, none at 14; the worst gate miss 25% of the half opening at
 * 6, 24% at 8, 43% at 10).
 */
export const RACE_PACES = Object.freeze({ easy: 6, normal: 8, hard: 10 });
/* How far behind the one before it each AI pilot starts, ms of its line,
 * and how much further back than aiopponent.js START_MS the first does.
 * From a hover the person closes on the moving line slowly (its outer
 * loop is a quarter of the tilt's crossover): on tests/fixtures/
 * map-track-v4.json stood on the swiss2 ground at 8 m/s it was still
 * 1.7 m off the line 6 s after letting go and touched the timing gate's
 * frame (lead 3000), and 0.45 m off at 8.5 s; with 6000 every pace of
 * RACE_PACES took the timing gate first time, no frame touched
 * (2026-10-13). */
export const GRID_MS = 1000;
export const GRID_LEAD_MS = 6000;
/* The pack the plant is seated with, volts per cell: a full one. */
const CELL_VOLTS = 4.2;
const RPM_PER_RAD_S = 60 / (2 * Math.PI);
/* main.js sampleGroundNormal's stencil, metres. */
const STENCIL = 0.35;

const af = airframeById(AI_RACE_AIRFRAME);

/* What the plant needs, or null with why (kit.why) on a server without
 * it. */
const kit = { ready: false, why: 'loading' };
export const kitLoaded = (async () => {
  try {
    const fs = globalThis.process && process.getBuiltinModule ? process.getBuiltinModule('node:fs') : null;
    if (!fs) {
      throw new Error('no filesystem');
    }
    const [opponent, pilot, reference, simmod] = await Promise.all([
      import('../../src/game/aiopponent.js'),
      import('../../src/game/aipilot.js'),
      import('../../tests/lib/aireference.js'),
      import('../../tests/lib/simmod.js'),
    ]);
    const wasm = new Uint8Array(fs.readFileSync(new URL('../../dist/sim.wasm', import.meta.url)));
    const tune = composeConfig(fs.readFileSync(new URL(`../../configs/${af.defaultTune}.diff`, import.meta.url), 'utf8'), RATE_DEFAULTS);
    /* The hull the sweep uses is the module's one craft: the only one this
     * process sweeps. */
    setCraftAirframe(af.dims);
    Object.assign(kit, {
      ready: true, why: null, wasm, tune, ...opponent, aiPilot: pilot.aiPilot, ...reference, loadSim: simmod.loadSim,
    });
  } catch (e) {
    kit.why = String(e && e.message ? e.message : e);
    console.error(`airace: this server seats no AI racer: ${kit.why}`);
  }
})();

/* Why this process cannot fly AI racers, or null when it can. */
export function aiRaceUnavailable() {
  return kit.ready ? null : kit.why;
}

function hashOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return (h >>> 0).toString(36);
}

/*
 * The ghosts, per map, track and pace, for the process: key -> { state:
 * 'pending' | 'ready' | 'none', ghost, course, colliders, cpuMs }. The
 * newest PREPARED_MAX are kept (a ghost with its frames is tens of kB);
 * a room whose track was dropped flies it again when it next asks.
 */
const PREPARED = new Map();
const PREPARED_MAX = 64;

function frames(course) {
  const r = BUILT_FRAME_TUBE_OD / 2;
  const col = new Colliders();
  const referee = kit.aiBench({ wasm: kit.wasm, af, tune: kit.tune, course, rates: RATE_DEFAULTS }).referee();
  for (const g of referee.gates) {
    const ap = g.apertures[0];
    if (g.virtual || ap.round) {
      continue;
    }
    const c = [g.x, g.y + ap.centreY, g.z];
    const corner = (u, v) => c.map((x, k) => x + u * (ap.clearW / 2 + r) * [g.ax.x, g.ax.y, g.ax.z][k]
      + v * (ap.clearH / 2 + r) * [g.ay.x, g.ay.y, g.ay.z][k]);
    const ring = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
    ring.forEach((a, i) => col.add('gate', ...a, ...ring[(i + 1) % 4], r));
  }
  col.build();
  return col;
}

/*
 * The reference line kept LINE_CLEAR over the ground: the harness's line
 * runs on along a pitched gate's axis and between gates on curves that
 * can pass under a course that stands on the ground (a dive gate's exit,
 * 4 m down at half a radian). Where it would, its point is lifted to
 * LINE_CLEAR over the ground under it, and its speed and acceleration are
 * the lifted points' differences over the reference's own 20 ms.
 */
const LINE_CLEAR = 0.8;
function overGround(line, groundAt) {
  const H = 20;
  const lift = (t) => {
    const p = line.at(t).p.slice();
    const floor = groundAt(-p[1], -p[0]) + LINE_CLEAR;
    if (p[2] < floor) {
      p[2] = floor;
    }
    return p;
  };
  return {
    durationMs: line.durationMs,
    at(t) {
      const p = lift(t);
      const a = lift(t - H);
      const b = lift(t + H);
      const s = (H / 1000) ** 2;
      return {
        p,
        v: [0, 1, 2].map((k) => (b[k] - a[k]) / ((2 * H) / 1000)),
        a: [0, 1, 2].map((k) => (b[k] - 2 * p[k] + a[k]) / s),
      };
    },
  };
}

async function prepare(entry, track, pace, groundAt) {
  const t0 = performance.now();
  const course = raceFromDocument(track.doc);
  const bench = kit.aiBench({ wasm: kit.wasm, af, tune: kit.tune, course, rates: RATE_DEFAULTS });
  kit.learnt ??= await bench.learn();
  const { learnt } = kit;
  /* aireference.js referenceGhost, on the line kept over the ground. */
  const line = overGround(bench.referenceLine(pace), groundAt);
  const { ghost: record } = await bench.fly({
    line,
    learnt,
    laps: 2,
    recordLap: 2,
    pilot: kit.aiPilot({
      line, rates: RATE_DEFAULTS, learnt, startMs: kit.START_MS, person: kit.REFERENCE_PERSON, quantise: false,
    }),
  });
  entry.cpuMs = performance.now() - t0;
  if (!record) {
    entry.state = 'none';
    return;
  }
  Object.assign(entry, {
    state: 'ready', course, colliders: frames(course), ghost: decodeGhost(encodeGhost(record)),
  });
}

/* The ghost for `track` on `map` at `pace`, started on first ask. */
export function preparedFor(track, map, pace) {
  const key = `${map}:${track.id}:${hashOf(JSON.stringify(track.doc))}:${pace}`;
  let entry = PREPARED.get(key);
  if (!entry) {
    entry = { state: 'pending', key };
    PREPARED.set(key, entry);
    entry.done = prepare(entry, track, pace, groundOf(map)).catch((e) => {
      entry.state = 'none';
      console.error(`airace: the reference lap of ${key} failed:`, e);
    });
    for (const [old, was] of PREPARED) {
      if (PREPARED.size <= PREPARED_MAX) {
        break;
      }
      if (was.state !== 'pending') {
        PREPARED.delete(old);
      }
    }
  }
  return entry;
}

/* The ghost `shift` ms later on its own loop: the same line, behind. */
function behind(lap, shift) {
  const d = lap.durationMs;
  return {
    durationMs: d,
    rateHz: lap.rateHz,
    sample: (t, out) => lap.sample((((t - shift) % d) + d) % d, out),
  };
}

/* The room's world as aiopponent.js reads it: the scene is the plant's
 * frame through frame.js, the ground the page's. */
function worldOf(groundAt, colliders) {
  const floorHeight = (x, z) => groundAt(x, z);
  const limit = (a, b) => (a * b <= 0 ? 0 : (Math.abs(a) < Math.abs(b) ? a : b));
  return {
    toSim: (x, y, z, out) => threePosToSim(x, y, z, out),
    dirToSim: (x, y, z, out) => threeDirToSim(x, y, z, out),
    fromSim: (st, out) => {
      out.x = -st[2];
      out.y = st[3];
      out.z = -st[1];
      return out;
    },
    worldQuat: (st, out) => simQuatToThree(st[7], st[8], st[9], st[10], {
      set(a, b, c, d) {
        Object.assign(out, {
          x: a, y: b, z: c, w: d,
        });
        return out;
      },
    }),
    floorHeight,
    groundNormal: (x, z, y, out) => {
      const here = floorHeight(x, z);
      const sx = limit(here - floorHeight(x + STENCIL, z), floorHeight(x - STENCIL, z) - here);
      const sz = limit(here - floorHeight(x, z + STENCIL), floorHeight(x, z - STENCIL) - here);
      const len = Math.sqrt(sx * sx + STENCIL * STENCIL + sz * sz);
      return Object.assign(out, { x: sx / len, y: STENCIL / len, z: sz / len });
    },
    colliders: () => colliders,
  };
}

/* A plant state as a pose for roomwire.js encodePose, the page's fields
 * (src/main.js): the scene's position, attitude and velocity, the body's
 * rates in the model's axes, the rotors in rad/s. */
function poseOf(sim, st, t, seq, crashed) {
  const q = simQuatToThree(st[7], st[8], st[9], st[10], {
    set(a, b, c, d) {
      return {
        x: a, y: b, z: c, w: d,
      };
    },
  });
  const rotors = [st[14], st[15], st[16], st[17]].map((rpm) => rpm / RPM_PER_RAD_S);
  const airborne = sim.e.sim_ground_contacts() === 0;
  return {
    flags: FLAG_QUAD | (airborne && !crashed ? FLAG_AIRBORNE : 0) | (crashed ? FLAG_CRASHED : 0),
    seq,
    t,
    px: -st[2],
    py: st[3],
    pz: -st[1],
    qx: q.x,
    qy: q.y,
    qz: q.z,
    qw: q.w,
    vx: -st[5],
    vy: st[6],
    vz: -st[4],
    wx: -st[12],
    wy: st[13],
    wz: -st[11],
    c0: rotors[0],
    c1: rotors[1],
    c2: rotors[2],
    c3: rotors[3],
    motor: (rotors[0] + rotors[1] + rotors[2] + rotors[3]) / 4,
  };
}

/*
 * One AI racer: its seated plant (async, from add) and, once that is
 * there, an AiOpponent for what the room is doing: `lobby:<ghost>` holding
 * on its grid place, `race:<id>:<ghost>` flying a race it is in.
 */
class Racer {
  constructor(slot) {
    this.slot = slot;
    this.seated = null;
    this.op = null;
    this.key = null;
    this.passes = [];
    this.lapsDone = 0;
    this.said = false;
    this.flownTo = 0;
  }

  /* A fresh opponent on the ghost, back at its grid place. */
  build(entry, key) {
    const lap = new GhostLap(entry.ghost, { label: 'AI' });
    this.op = new kit.AiOpponent({
      seated: this.seated,
      lap: behind(lap, GRID_LEAD_MS + this.slot * GRID_MS),
      gates: entry.course.gates,
      trackClass: entry.course.trackClass,
      world: worldOf(this.ground, entry.colliders),
    });
    this.key = key;
    this.passes = [];
    this.lapsDone = 0;
    this.said = false;
    this.flownTo = 0;
    /* Every pass its Race scores, with the lap's state as it leaves it:
     * what src/main.js roomRacePass reads of the page's own race. */
    const race = this.op.race;
    const pass = race.pass.bind(race);
    race.pass = (g, curr, crossMs, award, wallMs) => {
      const before = race.laps.length;
      const passed = pass(g, curr, crossMs, award, wallMs);
      this.passes.push({
        lapDone: race.laps.length > before,
        gate: race.lapStartMs != null ? race.splits.length + 1 : 0,
        hoop: Boolean(race.gates[passed].apertures[0].round),
        t: crossMs,
      });
      return passed;
    };
  }
}

export class AiRace {
  constructor() {
    /* seat -> Racer. */
    this.racers = new Map();
    /* The pace of each level; a check may set its own. */
    this.paces = RACE_PACES;
  }

  /*
   * Whether AI racers can fly this room's track at `level` now: 'ready',
   * 'pending' (its ghost is being flown), or null (they cannot: no plant
   * on this server, no ground for the map, no track, no level, or a track
   * the reference cannot lap).
   */
  status(core, level) {
    const track = core.race.track;
    const pace = this.paces[level];
    if (!kit.ready || !pace || !track || !groundOf(core.meta.map)) {
      return null;
    }
    const entry = preparedFor(track, core.meta.map, pace);
    return entry.state === 'none' ? null : entry.state;
  }

  /* A seat for an AI racer; its plant is seated as soon as it can be. */
  add(seat) {
    const used = new Set([...this.racers.values()].map((r) => r.slot));
    let slot = 0;
    while (used.has(slot)) {
      slot += 1;
    }
    const racer = new Racer(slot);
    this.racers.set(seat, racer);
    racer.ready = kit.seatOpponent(() => kit.loadSim(kit.wasm), {
      simId: af.simId, tuneText: kit.tune, gravity: af.gravityBase, cellVoltage: CELL_VOLTS, rates: RATE_DEFAULTS,
    }).then((seated) => {
      racer.seated = seated;
    }).catch((e) => {
      console.error(`airace: seat ${seat}'s plant failed:`, e);
    });
    return racer;
  }

  remove(seat) {
    this.racers.delete(seat);
  }

  has(seat) {
    return this.racers.has(seat);
  }

  /* Settled when every racer's plant is seated: for the checks. */
  settled() {
    return Promise.all([...this.racers.values()].map((r) => r.ready));
  }

  /* A mid air broke a part of it (roombots.js hits). */
  crash(seat) {
    const racer = this.racers.get(seat);
    if (racer && racer.op) {
      racer.op.crashed = true;
    }
  }

  /*
   * The room's tick: every AI racer to what the room is doing, its passes
   * and finish to the room's race as its own messages, its pose through
   * core.js judge. seats: seat -> { conn, s }.
   */
  tick(core, now, level, seats) {
    const track = core.race.track;
    const pace = this.paces[level];
    const ground = groundOf(core.meta.map);
    const entry = track && pace && kit.ready && ground ? preparedFor(track, core.meta.map, pace) : null;
    if (!entry || entry.state !== 'ready') {
      return [];
    }
    const r = core.race.race;
    const roomNow = core.roomMs(now);
    const out = [];
    for (const [seat, racer] of this.racers) {
      const at = seats.get(seat);
      if (!at || !racer.seated) {
        continue;
      }
      racer.ground = ground;
      const racing = r && r.state === 'on' && r.racers.includes(seat);
      const key = racing ? `race:${r.id}:${entry.key}` : `lobby:${entry.key}`;
      if (racer.key !== key) {
        racer.build(entry, key);
      }
      if (!racing) {
        out.push(...core.race.message(core, at.conn, at.s, {
          type: 'race', op: 'ready', track: track.id, ready: true,
        }, now));
      } else if (roomNow >= r.goAt) {
        out.push(...this.fly(core, now, racer, r, roomNow, at));
      }
      at.s.seq = (at.s.seq + 1) & 0xffff;
      const pose = poseOf(racer.op.sim, racer.op.state, Math.floor(roomNow), at.s.seq, racer.op.crashed);
      out.push(...core.judge(at.s, encodePose(pose), now));
    }
    return out;
  }

  /* Flies on to the room's now and says what it scored. Past its finish
   * it flies on round the line until the race's results, as a person
   * does, and what it scores there is not news. */
  fly(core, now, racer, r, roomNow, at) {
    const op = racer.op;
    const out = [];
    const since = racer.flownTo || r.goAt;
    op.stepTo(op.ms + Math.min(GAP_MS, Math.max(0, roomNow - since)));
    racer.flownTo = roomNow;
    if (racer.said) {
      racer.passes.length = 0;
      return out;
    }
    for (const p of racer.passes.splice(0)) {
      if (p.lapDone) {
        racer.lapsDone += 1;
      }
      const msg = racer.lapsDone >= r.laps
        ? { type: 'race', op: 'finish', race: r.id, ms: p.t, lap: racer.lapsDone, points: 0 }
        : { type: 'event', kind: p.hoop ? 'hoop' : 'gate', race: r.id, lap: racer.lapsDone, gate: p.gate, t: p.t, points: 0 };
      out.push(...core.race.message(core, at.conn, at.s, msg, now));
      if (racer.lapsDone >= r.laps) {
        racer.said = true;
        break;
      }
    }
    if (op.crashed && !racer.said) {
      racer.said = true;
      out.push(...core.race.message(core, at.conn, at.s, { type: 'race', op: 'retire', race: r.id }, now));
    }
    return out;
  }
}
