/*
 * aipilot-harness.js: the first AI pilot (src/game/aipilot.js) racing a
 * ghost on the real plant, judged by the race referee. npm run
 * aipilot:harness [-- --airframe <id>].
 *
 * THE GHOST. A lap the plant itself flew: a reference pilot (the same law
 * with no delay and no hand, looking every step) flies a smooth line
 * through every gate of tests/fixtures/map-track-v4.json at a set pace,
 * and its second lap (the first starts from a hover) is recorded the way
 * src/main.js records a lap (GhostRecorder from the timing gate, the
 * frame past the line closing it) and handed over as the board hands a
 * ghost over, through encodeGhost and decodeGhost. Its lap time is the
 * plant's, not the line's.
 *
 * THE AI PILOT. The person of tests/lib/personpilot.js: 0.2 s late eyes,
 * ten looks a second, fiftieths of stick, starting from a hover on the
 * line three seconds before the timing gate and chasing the ghost round
 * for four laps. src/game/race.js judges it gate by gate: a lap closes
 * only when every gate was flown through in order.
 *
 * THE BAND. A follower that keeps up flies the ghost's lap with a steady
 * lag, so its lap time is the ghost's and only the lag's change between
 * two crossings of the timing gate shows. The person acts only on the
 * hand's beat, so the lag can move by one hold, PERSON.everyMs, and the
 * line it follows is the ghost's grid, so by one grid step,
 * 1000 / GHOST_RATE_HZ: every lap after the first (which carries the
 * start from a hover) within 100 + 33.3 ms of the ghost's. Derived, not
 * fitted; the measured laps sit well inside it.
 *
 * THE PACE. The ghost's pace is the scenario, not the result. The pilot
 * is held to the band at PACES[0], the slowest; every pace is flown and
 * printed, gates taken, laps, worst miss off a gate's centre in the
 * gate's own axes, and the first pace whose ghost it cannot follow
 * through every gate is the pilot's ceiling on this course, a
 * measurement. On this course the misses are at the dive gate (el-2,
 * pitched half a radian down), off its 0.86 m half opening.
 *
 * NEGATIVE CONTROL. The same plant on the same line, the sticks centred
 * at the hover throttle: no gate, no lap.
 *
 * SEATING. The rates are configs/rates.js RATE_DEFAULTS, the tune the
 * airframe's default, Betaflight's ANGLE mode on; learnSticks() measures
 * the hover, the tilt's and the climb's lags and the climb's gain, and
 * the half stick tilt is checked against ANGLE_LIMIT_DEG within the tilt
 * one fiftieth of stick moves it, the hand's resolution.
 *
 * Free air at the course's own heights, no ground plane and no gate
 * frames to hit: the referee sees only the aperture.
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

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { PERSON } from '../tests/lib/personpilot.js';
import { airframeById } from '../configs/airframes.js';
import { RATE_DEFAULTS, rateAxis, ratesDiff } from '../configs/rates.js';
import { angleRateDeg } from '../src/fc/ratescurve.js';
import { Race } from '../src/game/race.js';
import { raceFromDocument } from '../src/game/verify.js';
import { GhostLap, GhostRecorder } from '../src/game/ghost.js';
import { decodeGhost, encodeGhost, GHOST_RATE_HZ } from '../src/share/ghostdata.js';
import { simPosToThree, simQuatToThree, threePosToSim } from '../src/render/frame.js';
import {
  AI_STEP_MS, ANGLE_LIMIT_DEG, aiPilot, learnSticks, lineFromGhost, stickFor,
} from '../src/game/aipilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const arg = (k) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : null;
};
const af = airframeById(arg('--airframe') ?? 'interceptor');
if (af.fixedWing) throw new Error(`aipilot:harness flies multirotors; ${af.id} is a fixed wing`);
const COURSE = 'tests/fixtures/map-track-v4.json';
/* m/s along the reference line. */
const PACES = [5, 6, 7, 8, 9, 10];
const LAPS = 4;
const START_MS = -3000;
/* The reference line runs straight this far either side of a gate. */
const GATE_RUN = 4;
const BAND_MS = PERSON.everyMs + 1000 / GHOST_RATE_HZ;
const DEG = 180 / Math.PI;

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
}

const wasm = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const tune = (await readFile(join(root, `configs/${af.defaultTune}.diff`), 'utf8')) + ratesDiff(RATE_DEFAULTS);
async function seat() {
  const sim = await loadSim(wasm);
  const must = (code, what) => {
    if (code !== SIM_OK) throw new Error(`${what} returned ${code}`);
  };
  must(sim.e.sim_set_airframe(af.simId), 'sim_set_airframe');
  must(sim.init(tune), 'sim_init');
  must(sim.e.sim_set_gravity(af.gravityBase), 'sim_set_gravity');
  must(sim.reset(), 'sim_reset');
  must(sim.setCellVoltage(4.2), 'sim_set_cell_voltage');
  must(sim.setAngleMode(true), 'sim_set_angle_mode');
  return sim;
}

const course = raceFromDocument(JSON.parse(await readFile(join(root, COURSE), 'utf8')));
const referee = () => {
  const race = new Race(course.gates, course.trackClass);
  race.saveRecord = () => {};
  return race;
};

/*
 * The reference line, scene frame: in flying order from the timing gate,
 * straight through each gate along its travel axis for GATE_RUN either
 * side, cubic Hermite curves between (tangent length the chord), flown
 * at `pace` along its length. Line time 0 is the timing gate's centre.
 */
function referenceLine(pace) {
  const order = course.gates.length ? referee().gates : [];
  const start = order.findIndex((g) => !g.virtual);
  const knots = [];
  for (let k = 0; k < order.length; k += 1) {
    const g = order[(start + k) % order.length];
    const c = [g.x, g.y + g.apertures[0].centreY, g.z];
    const t = [g.az.x, g.az.y, g.az.z];
    knots.push({ p: c.map((v, i) => v - t[i] * GATE_RUN), t }, { p: c.map((v, i) => v + t[i] * GATE_RUN), t });
  }
  const segs = knots.map((A, i) => {
    const B = knots[(i + 1) % knots.length];
    const L = Math.hypot(...B.p.map((v, j) => v - A.p[j]));
    const f = (u) => {
      const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
      const h10 = u ** 3 - 2 * u ** 2 + u;
      const h01 = -2 * u ** 3 + 3 * u ** 2;
      const h11 = u ** 3 - u ** 2;
      return [0, 1, 2].map((k) => h00 * A.p[k] + h10 * L * A.t[k] + h01 * B.p[k] + h11 * L * B.t[k]);
    };
    const tab = [[0, 0]];
    let len = 0;
    let prev = f(0);
    for (let j = 1; j <= 200; j += 1) {
      const q = f(j / 200);
      len += Math.hypot(q[0] - prev[0], q[1] - prev[1], q[2] - prev[2]);
      tab.push([j / 200, len]);
      prev = q;
    }
    return { f, len, tab };
  });
  const total = segs.reduce((s, x) => s + x.len, 0);
  const scene = (tMs) => {
    let s = ((((tMs / 1000) * pace + GATE_RUN) % total) + total) % total;
    let i = 0;
    while (i < segs.length - 1 && s > segs[i].len) {
      s -= segs[i].len;
      i += 1;
    }
    const { tab } = segs[i];
    let j = 1;
    while (j < tab.length - 1 && tab[j][1] < s) j += 1;
    const span = tab[j][1] - tab[j - 1][1];
    return segs[i].f(tab[j - 1][0] + ((tab[j][0] - tab[j - 1][0]) * (s - tab[j - 1][1])) / (span || 1));
  };
  const out = { x: 0, y: 0, z: 0 };
  const sim = (tMs) => {
    const q = scene(tMs);
    threePosToSim(q[0], q[1], q[2], out);
    return [out.x, out.y, out.z];
  };
  const H = 20;
  return {
    durationMs: (total / pace) * 1000,
    at(tMs) {
      const p = sim(tMs);
      const a = sim(tMs - H);
      const b = sim(tMs + H);
      const s = (H / 1000) ** 2;
      return {
        p,
        v: [0, 1, 2].map((k) => (b[k] - a[k]) / ((2 * H) / 1000)),
        a: [0, 1, 2].map((k) => (b[k] - 2 * p[k] + a[k]) / s),
      };
    },
  };
}

/* Per gate, the worst miss of the craft's centre off the opening's centre
 * at its crossings of the gate's plane, in the gate's axes; the flight
 * counts it from its first lap's close, past the start from a hover. */
function crossings(race, prev, curr, worst) {
  for (const g of race.gates) {
    const ap = g.apertures[0];
    const local = (P) => {
      const d = [P.x - g.x, P.y - (g.y + ap.centreY), P.z - g.z];
      const dot = (a) => d[0] * a.x + d[1] * a.y + d[2] * a.z;
      return [dot(g.ax), dot(g.ay), dot(g.az)];
    };
    const a = local(prev);
    const b = local(curr);
    if (!(a[2] < 0 && b[2] >= 0) || Math.hypot(b[0], b[1]) > 20) continue;
    const off = Math.max(Math.abs(b[0]) / (ap.clearW / 2), Math.abs(b[1]) / (ap.clearH / 2));
    if (!(worst.get(g.idx)?.off >= off)) worst.set(g.idx, { off, gate: g.idx, x: b[0], y: b[1], half: ap.clearW / 2 });
  }
}

/*
 * One flight from a hover on `line` START_MS before its zero, `pilot` on
 * the sticks (null: centred at the hover), until `laps` laps close or the
 * line has gone round laps + 2 times. Every step's pose goes through
 * frame.js to the referee, and to `record` (main.js's recorder order) if
 * given, which keeps lap `recordLap` (1 based).
 */
async function fly({ line, pilot, learnt, laps, recordLap = 0 }) {
  const sim = await seat();
  const at = line.at(START_MS);
  const to = line.at(START_MS + 100);
  const psi = Math.atan2(to.p[1] - at.p[1], to.p[0] - at.p[0]);
  sim.e.sim_set_pose(at.p[0], at.p[1], at.p[2], Math.cos(psi / 2), 0, 0, Math.sin(psi / 2));
  const race = referee();
  const rec = new GhostRecorder();
  const worst = new Map();
  const v = { x: 0, y: 0, z: 0, w: 1, set(a, b, c, d) { Object.assign(this, { x: a, y: b, z: c, w: d }); return this; } };
  let ghost = null;
  let prev = null;
  const endMs = (laps + 2) * line.durationMs - START_MS;
  for (let ms = 0; ms < endMs && race.laps.length < laps; ms += AI_STEP_MS) {
    const sticks = pilot ? pilot.sticks(ms, sim.readState().state) : [0, 0, 0, learnt.hover];
    sim.input(ms / 1000, ...sticks);
    sim.step(AI_STEP_MS);
    const s = sim.readState().state;
    simPosToThree(s[1], s[2], s[3], v);
    const curr = { x: v.x, y: v.y, z: v.z };
    simQuatToThree(s[7], s[8], s[9], s[10], v);
    const q = [v.x, v.y, v.z, v.w];
    const t = ms + AI_STEP_MS;
    if (prev) {
      const lapsBefore = race.laps.length;
      const startBefore = race.lapStartMs;
      race.update(prev, curr, t, 0);
      if (race.laps.length > 0) crossings(race, prev, curr, worst);
      if (recordLap) {
        if (race.laps.length > lapsBefore && race.laps.length === recordLap) {
          rec.push(t - race.lapStartMs + race.lastLapMs, curr.x, curr.y, curr.z, ...q);
          ghost = rec.finish(race.lastLapMs, race.lastSplits);
        }
        if (race.lapStartMs !== startBefore && race.laps.length === recordLap - 1) {
          rec.begin();
          rec.push(prev.t - race.lapStartMs, prev.x, prev.y, prev.z, ...prev.q);
        }
        if (rec.armed) rec.push(t - race.lapStartMs, curr.x, curr.y, curr.z, ...q);
      }
    }
    prev = { ...curr, t, q };
  }
  return { race, ghost, worst };
}

const ms3 = (x) => (x / 1000).toFixed(3);

/* The seat: what the pilot learns, and the tilt's law it flies by. */
const learnt = learnSticks(await seat(), RATE_DEFAULTS);
const half = stickFor(RATE_DEFAULTS, 'roll', 0.5);
const tiltAt = (stick) => (ANGLE_LIMIT_DEG * angleRateDeg(RATE_DEFAULTS.type, rateAxis(RATE_DEFAULTS, 'roll'), stick))
  / angleRateDeg(RATE_DEFAULTS.type, rateAxis(RATE_DEFAULTS, 'roll'), 1);
const lo = tiltAt(half - 1 / PERSON.steps);
const hi = tiltAt(half + 1 / PERSON.steps);
console.log(`${af.id}: hover ${learnt.hover.toFixed(3)}, tilt lag ${learnt.tiltLag.toFixed(3)} s, climb lag ${learnt.climbLag.toFixed(3)} s, `
  + `climb ${learnt.climbGain.toFixed(1)} m/s2 per unit throttle`);
check(`half stick asks ${ANGLE_LIMIT_DEG / 2} deg, the plant tilts within a fiftieth of stick`,
  learnt.halfStickTilt * DEG > lo && learnt.halfStickTilt * DEG < hi,
  `${(learnt.halfStickTilt * DEG).toFixed(2)} deg, band ${lo.toFixed(2)} to ${hi.toFixed(2)}`);

/* Every pace: the reference's ghost, then the person behind it. */
const person = { delayMs: 0, everyMs: AI_STEP_MS };
const flown = [];
for (const pace of PACES) {
  const ref = referenceLine(pace);
  const reference = await fly({
    line: ref, learnt, laps: 2, recordLap: 2,
    pilot: aiPilot({ line: ref, rates: RATE_DEFAULTS, learnt, startMs: START_MS, person, quantise: false }),
  });
  if (!reference.ghost) {
    flown.push({ pace, ghostMs: null });
    console.log(`${pace} m/s: the reference closed ${reference.race.laps.length} of 2 laps, no ghost`);
    continue;
  }
  const lap = new GhostLap(decodeGhost(encodeGhost(reference.ghost)), { label: 'reference' });
  const line = lineFromGhost(lap);
  const ai = await fly({ line, learnt, laps: LAPS, pilot: aiPilot({ line, rates: RATE_DEFAULTS, learnt, startMs: START_MS }) });
  const worst = [...ai.worst.values()].reduce((w, x) => (x.off > w.off ? x : w), { off: -1 });
  const after = ai.race.laps.slice(1);
  const off = after.map((t) => t - lap.durationMs);
  flown.push({ pace, ghostMs: lap.durationMs, ai, after, off });
  console.log(`${pace} m/s: ghost ${ms3(lap.durationMs)} s; AI laps ${ai.race.laps.map(ms3).join(', ') || 'none'}; `
    + `gate ${ai.race.next} next; `
    + (worst.off < 0 ? 'no lap closed' : `worst gate miss ${(worst.off * 100).toFixed(0)}% of the half opening`
      + ` (gate ${worst.gate}: ${worst.x.toFixed(2)}, ${worst.y.toFixed(2)} m of ${worst.half.toFixed(2)})`));
}

const slow = flown[0];
check(`the reference flies a ghost at ${slow.pace} m/s`, slow.ghostMs !== null);
if (slow.ghostMs !== null) {
  check(`the AI pilot closes ${LAPS} laps behind the ${slow.pace} m/s ghost, every gate in order`,
    slow.ai.race.laps.length === LAPS, `${slow.ai.race.laps.length} laps`);
  check(`laps 2 to ${LAPS} within ${BAND_MS.toFixed(1)} ms of the ghost's ${ms3(slow.ghostMs)} s`,
    slow.after.length === LAPS - 1 && slow.off.every((d) => Math.abs(d) <= BAND_MS),
    slow.off.map((d) => `${d >= 0 ? '+' : ''}${d.toFixed(1)} ms`).join(', '));
}
const ceiling = flown.find((f) => f.ghostMs === null || f.ai.race.laps.length < LAPS);
console.log(ceiling
  ? `ceiling on this course: ${ceiling.pace} m/s is the first pace the AI pilot does not follow through every gate`
  : `no ceiling found up to ${PACES[PACES.length - 1]} m/s`);

/* The negative control, on the slowest ghost's line. */
if (slow.ghostMs !== null) {
  const ref = referenceLine(slow.pace);
  const idle = await fly({ line: ref, learnt, laps: 1, pilot: null });
  check('centred sticks at the hover on the same line: no gate, no lap', idle.race.laps.length === 0 && idle.race.lapStartMs === null,
    `${idle.race.laps.length} laps, lap ${idle.race.lapStartMs === null ? 'never opened' : 'opened'}`);
}

console.log(`\naipilot harness: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
