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
 * pitched half a radian down), off its 0.86 m half opening. A pace the
 * reference itself cannot lap gives no ghost, and is printed as such.
 *
 * THE GATE. The pilot is handed the referee's next gate (its centre and
 * travel axis, as the pilot sees it ahead), and flies the opening on the
 * last stretch to it (src/game/aipilot.js gateAim).
 *
 * NEGATIVE CONTROL. The same plant on the same line, the sticks centred
 * at the hover throttle: no gate, no lap.
 *
 * SEATING. The rates are configs/rates.js RATE_DEFAULTS, the tune the
 * airframe's default composed as the page composes one (composeConfig),
 * Betaflight's ANGLE mode on; learnSticks() measures the hover, the
 * tilt's and the climb's lags and the climb's gain, and the half stick
 * tilt is checked against ANGLE_LIMIT_DEG within the tilt one fiftieth
 * of stick moves it, the hand's resolution.
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

import { loadSim } from '../tests/lib/simmod.js';
import { aiBench, REFERENCE_PERSON, START_MS } from '../tests/lib/aireference.js';
import { PERSON } from '../tests/lib/personpilot.js';
import { airframeById } from '../configs/airframes.js';
import { RATE_DEFAULTS, rateAxis } from '../configs/rates.js';
import { composeConfig } from '../src/fc/dump.js';
import { angleRateDeg } from '../src/fc/ratescurve.js';
import { raceFromDocument } from '../src/game/verify.js';
import { GhostLap } from '../src/game/ghost.js';
import { decodeGhost, encodeGhost, GHOST_RATE_HZ } from '../src/share/ghostdata.js';
import { simQuatToThree, threeDirToSim, threePosToSim } from '../src/render/frame.js';
import { AiOpponent, seatOpponent } from '../src/game/aiopponent.js';
import { Colliders, setCraftAirframe } from '../src/game/collide.js';
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
const PACES = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16];
const LAPS = 4;
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
/* As the page composes it (src/fc/dump.js), the menu's default rates. */
const tune = composeConfig(await readFile(join(root, `configs/${af.defaultTune}.diff`), 'utf8'), RATE_DEFAULTS);
const course = raceFromDocument(JSON.parse(await readFile(join(root, COURSE), 'utf8')));
const bench = aiBench({ wasm, af, tune, course, rates: RATE_DEFAULTS });
const { seat, referee, referenceLine, fly } = bench;

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
const flown = [];
for (const pace of PACES) {
  const ref = referenceLine(pace);
  const reference = await fly({
    line: ref, learnt, laps: 2, recordLap: 2,
    pilot: aiPilot({ line: ref, rates: RATE_DEFAULTS, learnt, startMs: START_MS, person: REFERENCE_PERSON, quantise: false }),
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
  flown.push({ pace, ghostMs: lap.durationMs, ai, after, off, record: reference.ghost });
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
if (!ceiling) console.log(`no ceiling found up to ${PACES[PACES.length - 1]} m/s`);
else if (ceiling.ghostMs === null) console.log(`no ceiling below ${ceiling.pace} m/s, the first pace the reference cannot lap`);
else console.log(`ceiling on this track: ${ceiling.pace} m/s is the first pace the AI pilot does not follow through every gate`);

/* The negative control, on the slowest ghost's line. */
if (slow.ghostMs !== null) {
  const ref = referenceLine(slow.pace);
  const idle = await fly({ line: ref, learnt, laps: 1, pilot: null });
  check('centred sticks at the hover on the same line: no gate, no lap', idle.race.laps.length === 0 && idle.race.lapStartMs === null,
    `${idle.race.laps.length} laps, lap ${idle.race.lapStartMs === null ? 'never opened' : 'opened'}`);
}

/*
 * THE OPPONENT (src/game/aiopponent.js), the pilot as the page races it:
 * its own plant seated by seatOpponent, the ground raised into it every
 * step (here a floor far below the course), the hull swept through the
 * course's solids. Each gate is framed (four bars round its opening, as
 * the gate's own frame stands); behind the OPPONENT_PACE ghost it takes
 * every gate and touches no frame. Then a wall in front of the wide gate
 * (el-3, square to the world): the opponent meets it (one contact
 * at least) and closes no lap past it. The frame is the plant's
 * contact, never a moved pose.
 */
const OPPONENT_PACE = 8;
const BAR_R = 0.05;
/* The wall stands this far before the gate's plane, out of the 0.5 m deep
 * box race.js scores a quad's pass in (CLASS_BOX.full), and twice the
 * opening across, so only a pass through it could take the gate. */
const WALL_AHEAD = 1;
setCraftAirframe(af.dims);
function solids(wall) {
  const col = new Colliders();
  for (const g of referee().gates) {
    const ap = g.apertures[0];
    if (g.virtual) continue;
    const c = [g.x, g.y + ap.centreY, g.z];
    const corner = (u, v) => c.map((x, k) => x + u * (ap.clearW / 2 + BAR_R) * [g.ax.x, g.ax.y, g.ax.z][k]
      + v * (ap.clearH / 2 + BAR_R) * [g.ay.x, g.ay.y, g.ay.z][k]);
    const ring = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
    ring.forEach((a, i) => col.add('gate', ...a, ...ring[(i + 1) % 4], BAR_R));
    if (wall && g.idx === wall) {
      const z = c[2] - g.az.z * WALL_AHEAD;
      col.addBox('wall', c[0] - ap.clearW, c[1] - ap.clearH, z - 0.05, c[0] + ap.clearW, c[1] + ap.clearH, z + 0.05);
    }
  }
  col.build();
  return col;
}
const identity = {
  toSim: (x, y, z, out) => threePosToSim(x, y, z, out),
  dirToSim: (x, y, z, out) => threeDirToSim(x, y, z, out),
  fromSim: (st, out) => {
    out.x = -st[2];
    out.y = st[3];
    out.z = -st[1];
    return out;
  },
  worldQuat: (st, out) => simQuatToThree(st[7], st[8], st[9], st[10], { set(a, b, c, d) { Object.assign(out, { x: a, y: b, z: c, w: d }); return out; } }),
  floorHeight: () => -1000,
  groundNormal: (x, z, y, out) => Object.assign(out, { x: 0, y: 1, z: 0 }),
};
const opPace = flown.find((f) => f.pace === OPPONENT_PACE);
async function race(col) {
  const seated = await seatOpponent(() => loadSim(wasm), {
    simId: af.simId, tuneText: tune, gravity: af.gravityBase, cellVoltage: 4.2, rates: RATE_DEFAULTS,
  });
  const lap = new GhostLap(decodeGhost(encodeGhost(opPace.record)), { label: 'reference' });
  const op = new AiOpponent({ seated, lap, gates: course.gates, trackClass: course.trackClass, world: { ...identity, colliders: () => col } });
  const t0 = performance.now();
  op.stepTo((LAPS + 2) * lap.durationMs - START_MS);
  return { op, ms: performance.now() - t0, lap };
}
if (opPace?.record) {
  const framed = await race(solids(null));
  const wide = referee().gates.find((g) => !g.virtual && g.apertures[0].clearW >= 3);
  const walled = await race(solids(wide.idx));
  console.log(`opponent behind the ${OPPONENT_PACE} m/s ghost: laps ${framed.op.laps().map(ms3).join(', ') || 'none'}, `
    + `${framed.op.touched || 0} contacts, ${(framed.op.sticks().length / 4)} stick rows, ${framed.ms.toFixed(0)} ms of CPU for `
    + `${ms3(framed.op.ms)} s flown; walled: laps ${walled.op.laps().length}, ${walled.op.touched || 0} contacts`);
  check(`the opponent closes ${LAPS} laps through the framed gates, touching no frame`,
    framed.op.laps().length >= LAPS && !framed.op.touched, `${framed.op.laps().length} laps, ${framed.op.touched || 0} contacts`);
  check('a wall before the wide gate: the opponent meets it and closes no lap',
    walled.op.touched > 0 && walled.op.laps().length === 0, `${walled.op.touched || 0} contacts, ${walled.op.laps().length} laps`);
  check('every 4 ms row of its sticks is kept', framed.op.sticks().length / 4 === Math.ceil(framed.op.ms / AI_STEP_MS),
    `${framed.op.sticks().length / 4} rows over ${framed.op.ms} ms`);
}

console.log(`\naipilot harness: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
