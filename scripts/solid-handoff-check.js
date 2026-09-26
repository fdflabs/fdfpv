/*
 * solid-handoff-check.js: a solid the host meets must be one the plant
 * holds, or the craft goes through it. In Node, against dist/sim.wasm.
 *
 *   node scripts/solid-handoff-check.js
 *
 * With crash damage on, the module drops a host's obstacle contact when
 * any solid it was told of (sim_obstacle_*) lies along the contact's
 * normal within the craft's reach (crash.c crash_contact_known): the
 * parts meet that solid with their own springs. It cannot know which
 * solid the host met. The plant holds 64 solids, the ones nearest the
 * craft, and a turned building is many more (swiss2's gondola station is
 * 148 wall columns), so the host could meet a column the plant did not
 * hold while one it did hold stood behind, have the contact dropped, and
 * no one stopped the craft: a Skyhunter ended 3.5 m inside the station at
 * 13.3 m/s. src/main.js (plantMustHold) now declares the met solid to the
 * plant before the contact.
 *
 * Here a host that sweeps the parts' hull against a wall, as the shell's
 * does, flies the real plant into it with the plant told only of a plate
 * 0.4 m behind the face. Two ways:
 *
 *   as it was: the wall is not declared. Reported, not judged: it shows the
 *   module's rule, and whether the craft still goes through with it.
 *   as the shell does now: the wall is declared at the host's first
 *   contact on it. Judged: the craft must never be past the wall's face by
 *   more than a part's own spring travel (0.1 m).
 *
 * At several offsets across the wall, for the Skyhunter and the Cub, at
 * 13.3 m/s (the station's) and 20 m/s. Exits 1 on any failure.
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

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim } from '../tests/lib/simmod.js';
import { Rig } from './lib/crash-scenarios.js';
import { PART_STATE_DOUBLES, SURFACE } from '../configs/parts.js';
import { airframeHull, bodyAxes, hullContact, hullFromPartsState, sweepPartBox, PLANT_BODY } from '../src/game/airframehull.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasm = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const cfg = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');

/* Plant frame, z up. The wall's face is x = 0, the craft comes from -x. */
const Z = 20;
const WALL = [0, -6, 0, 11, 6, 40];
/* Past the face by more than this is through it: a part's spring travel. */
const THROUGH = 0.1;
/* The shell's obstacle pass runs every 4 steps (src/main.js OBSTACLE_STEP). */
const PASS_MS = 4;

const declare = (sim, b) => sim.e.sim_obstacle_box(
  (b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2,
  (b[3] - b[0]) / 2, (b[4] - b[1]) / 2, (b[5] - b[2]) / 2,
  1, 0, 0, 0, SURFACE.concrete,
);

async function fly(id, speed, yOff, holdMet) {
  const r = await Rig.create(loadSim, wasm, cfg, { id, ground: null });
  const { sim } = r;
  /* The plate the plant is told of, behind the face on the craft's line. */
  const plate = [0.4, yOff - 0.5, Z - 3, 0.42, yOff + 0.5, Z + 1];
  const boxes = [WALL, plate];
  const held = new Set([1]);
  declare(sim, plate);
  r.pose([-2.5, yOff, Z], [1, 0, 0, 0]);
  r.launch(speed);
  const hull = airframeHull(r.parts, PLANT_BODY, 1);
  const ax = new Float64Array(9);
  const got = hullContact();
  const ps = new Float64Array(r.n * PART_STATE_DOUBLES);
  let prev = r.state();
  let deepest = -Infinity;
  let dropped = 0;
  for (let ms = 0; ms < 1500; ms += PASS_MS) {
    r.run(PASS_MS, [0, 0, 0, 0.45]);
    const s = r.state();
    r.partsState().forEach((p, i) => {
      ps[i * PART_STATE_DOUBLES] = p.status;
      ps[i * PART_STATE_DOUBLES + 2] = p.pos[0];
      ps[i * PART_STATE_DOUBLES + 3] = p.pos[1];
      ps[i * PART_STATE_DOUBLES + 4] = p.pos[2];
    });
    hullFromPartsState(hull, ps, PART_STATE_DOUBLES, 0, 2, sim.readState().state);
    bodyAxes(prev[8], prev[9], prev[10], prev[7], ax);
    let best = null;
    for (let k = 0; k < hull.n; k += 1) {
      if (!hull.live[k]) {
        continue;
      }
      for (let b = 0; b < boxes.length; b += 1) {
        const box = boxes[b];
        const t = sweepPartBox(hull, k, ax, prev[1], prev[2], prev[3], s[1] - prev[1], s[2] - prev[2], s[3] - prev[3],
          [box[0], box[1], box[2]], [box[3], box[4], box[5]], got);
        if (t >= 0 && (!best || t < best.t)) {
          best = { ...got, t, b };
        }
      }
    }
    if (best && s[4] * best.nx + s[5] * best.ny + s[6] * best.nz < -0.05) {
      if (holdMet && !held.has(best.b)) {
        held.add(best.b);
        declare(sim, boxes[best.b]);
      }
      const cx = prev[1] + (s[1] - prev[1]) * best.t;
      const cy = prev[2] + (s[2] - prev[2]) * best.t;
      const cz = prev[3] + (s[3] - prev[3]) * best.t;
      const sep = 0.008;
      const x0 = r.state()[1];
      sim.e.sim_contact_part(best.part);
      sim.e.sim_contact_at_mat(best.nx, best.ny, best.nz, SURFACE.concrete,
        cx + best.nx * sep, cy + best.ny * sep, cz + best.nz * sep,
        0, 0, 0, best.px - cx, best.py - cy, best.pz - cz);
      r.prev = r.state();
      if (r.state()[1] === x0) {
        dropped += 1;
      }
    }
    prev = r.state();
    deepest = Math.max(deepest, prev[1]);
  }
  const s = r.state();
  return { deepest, x: s[1], v: Math.hypot(s[4], s[5], s[6]), dropped };
}

let failed = 0;
for (const [name, id] of [['Skyhunter', 3], ['Cub', 4]]) {
  for (const speed of [13.3, 20]) {
    for (const holdMet of [false, true]) {
      let worst = -Infinity;
      let through = 0;
      let dropped = 0;
      const offsets = [-0.4, -0.2, 0, 0.2, 0.4];
      for (const y of offsets) {
        const o = await fly(id, speed, y, holdMet);
        worst = Math.max(worst, o.deepest);
        through += o.deepest > THROUGH ? 1 : 0;
        dropped += o.dropped;
      }
      const judged = holdMet;
      const ok = !judged || through === 0;
      failed += ok ? 0 : 1;
      console.log(`${judged ? (ok ? 'PASS' : 'FAIL') : 'info'} ${name} at ${speed} m/s, ${holdMet ? 'the met wall declared (the shell now)' : 'the wall not declared (as it was)'}: `
        + `${through} of ${offsets.length} through, deepest ${worst.toFixed(2)} m past the face, ${dropped} host contacts dropped`);
    }
  }
}
if (failed) {
  console.log(`${failed} failed`);
  process.exit(1);
}
console.log('a wall the host meets is held by the plant and never passed');
