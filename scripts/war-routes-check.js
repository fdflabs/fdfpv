/*
 * war-routes-check.js: every attacker of mission 1 clears the ground, the
 * water and the dam until its terminal run (docs/WARFARE-PLAN.md section
 * 4.2; src/share/war/missions/itaipu-1.js).
 *
 * For every wave, at 1 to 8 pilots (so every size the room can send), for
 * every attacker k of it and at no error and both ends of its spread, it
 * plans the attacker as the room does (routes.js planAgent, index.js
 * waveSize and waveTarget) and samples its pose every SAMPLE_MS against
 * the hunters' floor (src/share/war/itaipu-height.bin, warhunt.js
 * loadHeight: the higher of ground and water, with the dam in it):
 *
 *   flying kinds  at least MIN_CLEAR_M over the floor until the terminal
 *                 run: the last leg onto the target for a Striker or an
 *                 FPV, the dive for a Loiterer; a Scout has none, so all
 *                 of it, its circle and its way out, must clear
 *   boats         on water (the floor is the reservoir's 219.0 m) until
 *                 the last leg, which runs on to the upstream face
 *   hunters       born at least MIN_CLEAR_M over the floor (the room
 *                 steers them from there, over the same floor)
 *
 * and, the whole flight through, terminal run too, no attacker goes under
 * the reservoir's surface (WATER_Y, less SURFACE_TOL_M of rounding): one
 * may be lower than it only where it got there over lower ground, the
 * gorge below the dam. The terminal run is exempt from the floor above
 * because the floor is 40 m cells, the dam in it smeared 40 to 90 m out
 * over the water; the surface is exact. A Striker once ran its last leg
 * to a spillway gate's middle at 212.3 m and went into the water 130 m
 * short (bug-552ecdab), which the floor rule could not see.
 *
 * It prints each wave's lowest clearance before the terminal run and in
 * it, and how deep under the surface it goes. Exit 1 on any failure.
 *
 *   node scripts/war-routes-check.js
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

import { readFileSync } from 'node:fs';

import { loadHeight } from '../edge/rooms/warhunt.js';
import { KIND, planAgent, poseAt } from '../src/share/war/routes.js';
import { waveSize, waveTarget } from '../src/share/war/missions/index.js';
import { MISSIONS } from '../src/share/war/missions/index.js';

const MIN_CLEAR_M = 15;
const WATER_Y = 219;
const SURFACE_TOL_M = 0.01;
const SAMPLE_MS = 50;
const PILOTS = [1, 2, 3, 4, 5, 6, 7, 8];

const floor = loadHeight(readFileSync(new URL('../src/share/war/itaipu-height.bin', import.meta.url)));

/* The room ms from which an attacker is on its terminal run, or Infinity
 * for one that has none. */
function terminalFrom(plan, kind) {
  if (kind === 'loiter') {
    return plan.end === 'arrive' ? plan.phases[plan.phases.length - 1].t0 : Infinity;
  }
  if (plan.end !== 'arrive') {
    return Infinity;
  }
  const path = plan.phases[0];
  const last = path.legs[path.legs.length - 1];
  return path.t0 + (last.s / path.speed) * 1000;
}

const failures = [];
let worstAll = Infinity;
for (const mission of Object.values(MISSIONS)) {
  console.log(`mission ${mission.id}: ${mission.waves.length} waves, 1 to 8 pilots, every attacker at err 0 and +-spread, every ${SAMPLE_MS} ms`);
  console.log('  wave  at   kind    route             n(1..8)          before terminal   in terminal   terminal m under water');
  for (const [i, w] of mission.waves.entries()) {
    let before = Infinity;
    let inside = Infinity;
    let boatDry = 0;
    let termM = 0;
    let where = null;
    let wet = 0;
    let wetAt = null;
    const sizes = PILOTS.map((p) => waveSize(w, p));
    for (const n of new Set(sizes)) {
      for (let k = 0; k < n; k += 1) {
        for (const err of w.spread ? [-w.spread, 0, w.spread] : [0]) {
          const agent = {
            id: 1, kind: w.kind, route: w.route, t0: 0, k, n, err, target: waveTarget(w, k),
          };
          const plan = planAgent(mission, agent);
          if (w.kind === 'hunter') {
            const p = poseAt(plan, 0).p;
            const c = p[1] - floor.floorAt(p[0], p[2]);
            if (c < before) {
              before = c;
              where = p;
            }
            continue;
          }
          const tt = terminalFrom(plan, w.kind);
          const end = Number.isFinite(plan.tEnd) ? plan.tEnd : 0;
          if (Number.isFinite(tt)) {
            termM = Math.max(termM, ((end - tt) / 1000) * (w.kind === 'loiter' ? KIND.loiter.dive : KIND[w.kind].speed));
          }
          /* Under the surface over lower ground (the gorge): allowed, and
           * carried on while it stays under. */
          let lowOver = false;
          for (let t = 0; t <= end; t += SAMPLE_MS) {
            const p = poseAt(plan, t).p;
            const f = floor.floorAt(p[0], p[2]);
            const c = p[1] - f;
            const under = p[1] < WATER_Y - SURFACE_TOL_M;
            lowOver = under && (lowOver || f < WATER_Y - SURFACE_TOL_M);
            if (under && !lowOver && WATER_Y - p[1] > wet) {
              wet = WATER_Y - p[1];
              wetAt = p.slice();
            }
            if (t < tt) {
              if (w.kind === 'boat') {
                boatDry = Math.max(boatDry, f - WATER_Y);
                if (f - WATER_Y > 0.01 && !where) {
                  where = p;
                }
              } else if (c < before) {
                before = c;
                where = p;
              }
            } else {
              inside = Math.min(inside, c);
            }
          }
        }
      }
    }
    const fmt = (v) => (Number.isFinite(v) ? `${v.toFixed(1)} m` : '-');
    const beforeText = w.kind === 'boat' ? `on water, ${boatDry.toFixed(2)} m dry` : fmt(before);
    console.log(`  ${String(i + 1).padStart(4)} ${String(w.at).padStart(4)}  ${w.kind.padEnd(7)} ${w.route.padEnd(17)} ${sizes.join(',').padEnd(16)} ${beforeText.padEnd(17)} ${fmt(inside).padEnd(13)} ${(termM ? termM.toFixed(0) : '-').padEnd(10)} ${wet ? `${wet.toFixed(1)} m` : '-'}`);
    if (wet) {
      failures.push(`${mission.id} wave ${i + 1} (${w.kind}, ${w.route}): ${wet.toFixed(1)} m under the reservoir's surface near (${wetAt.map((v) => v.toFixed(0)).join(', ')})`);
    }
    if (w.kind === 'boat') {
      if (boatDry > 0.01) {
        failures.push(`${mission.id} wave ${i + 1} (${w.kind}, ${w.route}): a boat is on ground ${boatDry.toFixed(2)} m over the water near (${where.map((v) => v.toFixed(0)).join(', ')})`);
      }
      continue;
    }
    worstAll = Math.min(worstAll, before);
    if (!(before >= MIN_CLEAR_M)) {
      failures.push(`${mission.id} wave ${i + 1} (${w.kind}, ${w.route}): ${before.toFixed(1)} m over the floor near (${where.map((v) => v.toFixed(0)).join(', ')}), under ${MIN_CLEAR_M} m`);
    }
  }
}
console.log('');
if (failures.length) {
  for (const f of failures) {
    console.log(`  FAIL ${f}`);
  }
  console.error(`FAIL, ${failures.length} route problem(s)`);
  process.exitCode = 1;
} else {
  console.log(`PASS, every flying attacker clears the floor by ${worstAll.toFixed(1)} m or more until its terminal run (at least ${MIN_CLEAR_M}), every boat sails on the water, and nothing goes under the reservoir's ${WATER_Y} m surface (within ${SURFACE_TOL_M} m), terminal run included`);
}
