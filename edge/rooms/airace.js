/*
 * airace.js: a race room's AI pilots on the real plant (docs/AI-PILOTS-
 * RACES-CONTRACT.md, redesign phase 18 slice 3). roombots.js gives each a
 * seat; this flies it: src/game/aiopponent.js, src/game/aipilot.js's
 * person on a dist/sim.wasm of its own, chasing a ghost round the room's
 * track, judged gate by gate by its own src/game/race.js Race.
 *
 * THE GHOST. Before an AI pilot is seated the room finds the lap it will
 * chase, once per map, track and level for the process: the board's best
 * quad lap with a ghost on this track (fetched from ROOMS_BOARD_ORIGIN,
 * the board's own address, when the server has one), else a reference
 * lap the room flies itself (tests/lib/aireference.js, the harness's
 * reference pilot on a smooth line through every gate) at the level's
 * pace. The levels are the ghost's pace (RACE_PACES): a ghost faster than
 * its level's pace along its own path is slowed to it, never sped up.
 * Each is proved before it is taken: an AI pilot from the grid's first
 * place, on the room's ground and gate frames, must close PROOF_LAPS laps
 * behind it. A board lap it cannot follow gives way to the reference; a
 * track neither proves on seats no AI pilot.
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
 * course's structures, each built from its own geometry as the race
 * carries it (src/builder/course.js structureOf, every opening's `frame`),
 * in the page's capsules where the page has them (src/render/pylons.js):
 * four bars of the frame's tube round a rectangular opening, as
 * aipilot:harness frames them; a hoop's rim as RIM_SEGMENTS straight
 * tubes round its circle, firm ('gate') for a quad hoop and soft ('hoop')
 * for a plane's; a pylon's cone as PYLON_SEGMENTS posts up its axis, each
 * the cone's radius at its middle. The page builds these with three.js,
 * which a server has not got, so the numbers are repeated here. A gate's
 * every other member (a ladder's rungs, a flag pole) is not a solid here.
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
 * 'finish', ... }. Its pose goes out every tick as a pilot's POSE bytes,
 * through core.js judge.
 *
 * A CRASH (aiopponent.js: upside down on the ground for a second, or a
 * part broken in a mid air) is a person's wreck and R in a room race
 * (src/main.js, src/share/roomrace.js): the lap in flight is over, the
 * aircraft goes back to its own place on the grid, the laps already flown
 * stay flown, and its clock runs on. The person presses R when they are
 * ready; the AI pilot is put back on the tick its crash is called. The
 * room hears what it hears of a person: nothing at the wreck, then a pass
 * of the timing gate at a lower count than the last, which edge/rooms/
 * race.js takes as a lap a wreck voided.
 *
 * NEVER ON THE RECORD. Its Race's record write is a no-op (aiopponent.js),
 * and the room posts nothing to any board.
 *
 * KEPT (save, roombots.js store): while a race is on, every racer's plant
 * as journal.js keeps one (the region between the stack and the heap,
 * which is the whole plant, deflated: about 100 kB a seat), its
 * opponent's flight and its Race's lap state, with the module's build.
 * A room restored mid race (a restart, a drain past its cap) seats each
 * one again on a plant of its own, that region written in (malloc's own
 * bytes left as the new module has them, src/replay/refly.js's rule),
 * and it flies on from there once its ghost is flown again in this
 * process. The room's clock ran on meanwhile: what it missed is a stall
 * (THE CLOCK), not caught up. What is not kept is the pilot's own memory
 * (src/game/aipilot.js: its eyes' last 200 ms and its loops' trims),
 * which that file keeps to itself: the restored racer sees afresh, holds
 * its sticks for its eyes' delay, and closes on its line again. A kept
 * plant from another build, or none, is today's: the AI seat is dropped,
 * marked left, and the room fills again.
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
import { Race } from '../../src/game/race.js';
import { ELEMENTS } from '../../src/trackbuilder/elements.js';
import { Colliders, setCraftAirframe } from '../../src/game/collide.js';
import { BUILT_FRAME_TUBE_OD } from '../../src/game/track.js';
import { decodeGhost, encodeGhost, ghostFromBase64 } from '../../src/share/ghostdata.js';
import { fetchGhost, fetchTrackTimes } from '../../src/share/board.js';
import { simQuatToThree, threeDirToSim, threePosToSim } from '../../src/render/frame.js';
import { FLAG_AIRBORNE, FLAG_CRASHED, FLAG_QUAD, encodePose } from '../../src/share/roomwire.js';
import { allocatorSpans, wasmBuild } from '../../src/replay/journal.js';

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
/* Laps an AI pilot must close behind a ghost before the room takes it,
 * and the longest lap the room will prove, ms (a ghost's own length is
 * the board's to allow, up to ghostdata.js GHOST_MAX_MS). */
export const PROOF_LAPS = 2;
const PROOF_LAP_MAX_MS = 120000;
/* The proof flies this much plant between yields, ms: about 5 ms of CPU
 * here (2.45 ms per second flown, rooms:selftest 2026-10-13). */
const PROOF_SLICE_MS = 2000;
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
    const zlib = process.getBuiltinModule('node:zlib');
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
    /* The module's name (journal.js wasmBuild): a kept plant flies on only
     * on the build that kept it. */
    const build = await wasmBuild(wasm);
    Object.assign(kit, {
      ready: true, why: null, wasm, tune, build, zlib, ...opponent, aiPilot: pilot.aiPilot, ...reference, loadSim: simmod.loadSim,
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

/* A track's content hash, once per track object: the room asks for its
 * ghost several times a tick, and a document is up to 64 kB. */
const HASHES = new WeakMap();
function hashOf(track) {
  if (!HASHES.has(track)) {
    const text = JSON.stringify(track.doc);
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    }
    HASHES.set(track, (h >>> 0).toString(36));
  }
  return HASHES.get(track);
}

/*
 * The ghosts, per map, track and pace, for the process: key -> { state:
 * 'pending' | 'ready' | 'none', ghost, course, colliders, cpuMs }. The
 * PREPARED_MAX most recently asked for are kept (a ghost with its frames
 * is tens of kB); a room flying one asks every tick, so only a track no
 * room is on is dropped, and flown again when a room next asks.
 */
const PREPARED = new Map();
const PREPARED_MAX = 64;

/* src/render/pylons.js RIM_SEGMENTS and PYLON_SEGMENTS: the page's own
 * capsule counts for a hoop's rim and a pylon's cone. */
export const RIM_SEGMENTS = 24;
export const PYLON_SEGMENTS = 4;

/* One cone of a pylon (course.js structureOf's { x, y0, h, r0, r1 }, in
 * its opening's frame) as the page's posts, src/render/pylons.js cone(). */
function conePosts(at, c, add) {
  const step = c.h / PYLON_SEGMENTS;
  for (let k = 0; k < PYLON_SEGMENTS; k += 1) {
    const r = c.r0 + ((c.r1 - c.r0) * (k + 0.5)) / PYLON_SEGMENTS;
    add('pylon', at(c.x, c.y0 + k * step), at(c.x, c.y0 + (k + 1) * step), r);
  }
}

/* The course's solids: every race gate's structure from its opening's
 * `frame` (src/game/race.js structureGap reads the same). A gate placed
 * once per lap is one structure, so a gate flown twice is framed once. */
export function framesOf(course) {
  const col = new Colliders();
  const add = (kind, a, b, r) => col.add(kind, ...a, ...b, r);
  const done = new Set();
  for (const g of new Race(course.gates, course.trackClass).gates) {
    for (const ap of g.apertures) {
      const id = JSON.stringify([g.x, g.y, g.z, ap.centreY, ap.frame]);
      if (done.has(id)) {
        continue;
      }
      done.add(id);
      /* A point (u across, v up) of the opening's own frame, in the scene. */
      const at = (u, v) => [
        g.x + u * g.ax.x + v * g.ay.x, g.y + ap.centreY + u * g.ax.y + v * g.ay.y, g.z + u * g.ax.z + v * g.ay.z,
      ];
      const f = ap.frame ?? { kind: 'box', hw: ap.clearW / 2 + BUILT_FRAME_TUBE_OD, hh: ap.clearH / 2 + BUILT_FRAME_TUBE_OD };
      if (f.kind === 'ring') {
        /* f.r is the rim's outside, the opening's half plus two tube
         * radii (course.js structureOf): the tube's centre runs one radius
         * in, src/render/pylons.js Rc. */
        const t = (f.r - ap.clearW / 2) / 2;
        const rc = f.r - t;
        const kind = ELEMENTS[g.kindName] && ELEMENTS[g.kindName].plane ? 'hoop' : 'gate';
        for (let k = 0; k < RIM_SEGMENTS; k += 1) {
          const a0 = (2 * Math.PI * k) / RIM_SEGMENTS;
          const a1 = (2 * Math.PI * (k + 1)) / RIM_SEGMENTS;
          add(kind, at(rc * Math.cos(a0), rc * Math.sin(a0)), at(rc * Math.cos(a1), rc * Math.sin(a1)), t);
        }
      } else if (f.kind === 'cones') {
        f.cones.forEach((c) => conePosts(at, c, add));
      } else if (f.kind === 'cone') {
        conePosts(at, f.cone, add);
      } else {
        /* The tube's centre half its width inside the frame's outside. */
        const r = (f.hw - ap.clearW / 2) / 2;
        const ring = [at(-(f.hw - r), -(f.hh - r)), at(f.hw - r, -(f.hh - r)), at(f.hw - r, f.hh - r), at(-(f.hw - r), f.hh - r)];
        ring.forEach((a, i) => add('gate', a, ring[(i + 1) % 4], r));
      }
    }
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

/* A ghost's mean speed along its own path, m/s. */
function paceOf(data) {
  let len = 0;
  const p = data.pos;
  for (let i = 3; i < 3 * data.count; i += 3) {
    len += Math.hypot(p[i] - p[i - 3], p[i + 1] - p[i - 2], p[i + 2] - p[i - 1]);
  }
  return len / (data.durationMs / 1000);
}

/* The lap `data` holds, slowed by `k` (1 or more): the same path, each
 * sample k times later. */
function slowed(data, k) {
  const lap = new GhostLap(data, { label: 'AI' });
  return {
    durationMs: lap.durationMs * k,
    rateHz: lap.rateHz / k,
    sample: (t, out) => lap.sample(t / k, out),
  };
}

/* The seat every AI racer is seated as. */
function seatPlant() {
  return kit.seatOpponent(() => kit.loadSim(kit.wasm), {
    simId: af.simId, tuneText: kit.tune, gravity: af.gravityBase, cellVoltage: CELL_VOLTS, rates: RATE_DEFAULTS,
  });
}

/* The board's best quad lap with a ghost on this track, decoded, or null
 * (no board here, none posted, the board down or saying nonsense). */
async function boardGhost(track, origin) {
  if (!origin) {
    return null;
  }
  try {
    const best = (await fetchTrackTimes(track.id, origin)).filter((t) => t.hasGhost && !t.craft)
      .sort((a, b) => a.lapMs - b.lapMs)[0];
    if (!best) {
      return null;
    }
    const got = await fetchGhost(track.id, best.id, origin);
    return decodeGhost(ghostFromBase64(got.ghost));
  } catch (e) {
    console.error(`airace: no board ghost for ${track.id}:`, e && e.message ? e.message : e);
    return null;
  }
}

async function prepare(entry, track, pace, groundAt, origin) {
  const t0 = performance.now();
  const course = raceFromDocument(track.doc);
  const colliders = framesOf(course);
  const bench = kit.aiBench({ wasm: kit.wasm, af, tune: kit.tune, course, rates: RATE_DEFAULTS });
  kit.learnt ??= await bench.learn();
  const { learnt } = kit;
  /* aireference.js referenceGhost, on the line kept over the ground. */
  const reference = async () => {
    const line = overGround(bench.referenceLine(pace), groundAt);
    const { ghost } = await bench.fly({
      line,
      learnt,
      laps: 2,
      recordLap: 2,
      pilot: kit.aiPilot({
        line, rates: RATE_DEFAULTS, learnt, startMs: kit.START_MS, person: kit.REFERENCE_PERSON, quantise: false,
      }),
    });
    return ghost && decodeGhost(encodeGhost(ghost));
  };
  const proving = await seatPlant();
  for (const [source, find] of [['board', () => boardGhost(track, origin)], ['reference', reference]]) {
    const data = await find();
    if (!data) {
      continue;
    }
    const lap = slowed(data, Math.max(1, paceOf(data) / pace));
    if (lap.durationMs > PROOF_LAP_MAX_MS) {
      continue;
    }
    const op = new kit.AiOpponent({
      seated: proving,
      lap: behind(lap, GRID_LEAD_MS),
      gates: course.gates,
      trackClass: course.trackClass,
      world: worldOf(groundAt, colliders),
    });
    /* In slices, the process's other rooms ticking between them. */
    const end = GRID_LEAD_MS - kit.START_MS + (PROOF_LAPS + 0.5) * lap.durationMs;
    while (op.ms < end && !op.crashed && op.laps().length < PROOF_LAPS) {
      op.stepTo(Math.min(end, op.ms + PROOF_SLICE_MS));
      await new Promise((go) => { setTimeout(go, 0); });
    }
    if (op.laps().length >= PROOF_LAPS) {
      Object.assign(entry, {
        state: 'ready', source, course, colliders, lap, data,
      });
      break;
    }
  }
  entry.cpuMs = performance.now() - t0;
  if (entry.state !== 'ready') {
    entry.state = 'none';
  }
}

/* The board's address for this server, read when asked. */
function boardOrigin() {
  const env = globalThis.process && process.env ? process.env : {};
  return String(env.ROOMS_BOARD_ORIGIN || '').replace(/\/+$/, '');
}

/* The ghost for `track` on `map` at `pace`, started on first ask. */
export function preparedFor(track, map, pace) {
  const origin = boardOrigin();
  const key = `${map}:${track.id}:${hashOf(track)}:${pace}:${origin}`;
  let entry = PREPARED.get(key);
  if (entry) {
    PREPARED.delete(key);
    PREPARED.set(key, entry);
  } else {
    entry = { state: 'pending', key };
    PREPARED.set(key, entry);
    entry.done = prepare(entry, track, pace, groundOf(map), origin).catch((e) => {
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

/* What an opponent and its Race are, past their plant, when kept: what
 * aiopponent.js stepTo and race.js reset() move. */
const OP_KEPT = ['ms', 'crashed', 'downMs', 'held', 'prev', 'sweepFrom', 'normal'];
const RACE_KEPT = ['next', 'lap', 'lapStartMs', 'lastLapMs', 'prevSimMs', 'banner', 'splits', 'lastSplits', 'log', 'laps',
  'lapPoints', 'lastLapScore', 'runScore', 'call', 'leaving', 'recordAtStart'];

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
    /* The race's ms at which this.op's clock read zero: its passes are
     * times since the race's go on its own clock, across its rebirths. */
    this.bornMs = 0;
  }

  /* A fresh opponent on the ghost for what the room is doing, nothing
   * flown or scored. */
  build(entry, key) {
    this.key = key;
    this.lapsDone = 0;
    this.said = false;
    this.flownTo = 0;
    this.place(entry, 0);
  }

  /* A crash: back on its grid place as a person's R puts them on their
   * slot, at race ms `bornMs`, the laps it closed kept. */
  reborn(entry) {
    this.place(entry, this.bornMs + this.op.ms);
  }

  /* Where it is, for the room's storage. */
  save() {
    const op = this.op;
    const { lo, hi } = this.seated.journal.region;
    const mem = new Uint8Array(this.seated.sim.e.memory.buffer, lo, hi - lo);
    return {
      slot: this.slot,
      key: this.key,
      lapsDone: this.lapsDone,
      said: this.said,
      flownTo: this.flownTo,
      bornMs: this.bornMs,
      op: Object.fromEntries(OP_KEPT.map((k) => [k, structuredClone(op[k])])),
      race: Object.fromEntries(RACE_KEPT.map((k) => [k, structuredClone(op.race[k])])),
      region: kit.zlib.deflateRawSync(mem, { level: 1 }),
    };
  }

  /* A kept racer (save) flying on: an opponent on the same ghost with the
   * kept plant written into its module. */
  resume(entry, key, kept) {
    this.key = key;
    this.lapsDone = kept.lapsDone;
    this.said = kept.said;
    this.flownTo = kept.flownTo;
    this.place(entry, kept.bornMs);
    const { sim, journal } = this.seated;
    const region = kit.zlib.inflateRawSync(kept.region);
    if (region.length !== journal.region.hi - journal.region.lo) {
      throw new Error(`a kept plant of ${region.length} bytes, this module's is ${journal.region.hi - journal.region.lo}`);
    }
    /* malloc's bookkeeping is in the region too, and it is this module's. */
    const spans = allocatorSpans(sim.e, journal.region);
    const mem = new Uint8Array(sim.e.memory.buffer, journal.region.lo, region.length);
    const live = spans.map(([a, z]) => mem.slice(a, z));
    mem.set(region);
    spans.forEach(([a], i) => mem.set(live[i], a));
    Object.assign(this.op, kept.op);
    Object.assign(this.op.race, kept.race);
    this.op.state = sim.readState().state;
    this.op.prevState = this.op.state;
  }

  /* An opponent at its grid place, its clock zero at race ms `bornMs`. */
  place(entry, bornMs) {
    this.bornMs = bornMs;
    this.passes = [];
    this.op = new kit.AiOpponent({
      seated: this.seated,
      lap: behind(entry.lap, GRID_LEAD_MS + this.slot * GRID_MS),
      gates: entry.course.gates,
      trackClass: entry.course.trackClass,
      world: worldOf(this.ground, entry.colliders),
    });
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
        t: this.bornMs + crossMs,
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

  /* A seat for an AI racer; its plant is seated as soon as it can be.
   * `kept`, a racer save() kept, flies on from there (restore). */
  add(seat, kept = null) {
    const used = new Set([...this.racers.values()].map((r) => r.slot));
    let slot = kept ? kept.slot : 0;
    while (!kept && used.has(slot)) {
      slot += 1;
    }
    const racer = new Racer(slot);
    racer.kept = kept;
    this.racers.set(seat, racer);
    racer.ready = seatPlant().then((seated) => {
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

  /*
   * What the room keeps of its racers in a race on (roombots.js store), or
   * null when there is nothing to fly on from: no race flying, or a
   * module with no name.
   */
  save() {
    const flying = [...this.racers].filter(([, r]) => r.op && r.key && r.key.startsWith('race:'));
    if (!kit.ready || !kit.build || !flying.length) {
      return null;
    }
    return { build: kit.build, racers: flying.map(([seat, r]) => ({ seat, ...r.save() })) };
  }

  /* The racer `seat` a restored room's store kept, when this process can
   * fly it on: the race it was in is still on, and the plant is this
   * build's. Null otherwise. */
  static kept(saved, seat, core) {
    const r = core.race.race;
    const kept = saved && kit.ready && saved.build === kit.build ? saved.racers.find((x) => x.seat === seat) : null;
    return kept && r && r.state === 'on' && kept.key.startsWith(`race:${r.id}:`) && r.racers.includes(seat) ? kept : null;
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
      if (racer.key !== key && racer.kept && racer.kept.key === key) {
        racer.resume(entry, key, racer.kept);
      } else if (racer.key !== key) {
        racer.build(entry, key);
      }
      racer.kept = null;
      if (!racing) {
        out.push(...core.race.message(core, at.conn, at.s, {
          type: 'race', op: 'ready', track: track.id, ready: true,
        }, now));
      } else if (roomNow >= r.goAt) {
        out.push(...this.fly(core, now, racer, r, roomNow, at, entry));
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
  fly(core, now, racer, r, roomNow, at, entry) {
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
      racer.reborn(entry);
    }
    return out;
  }
}
