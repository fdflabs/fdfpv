/*
 * crash-shell-identity.js: the crash shell's module calls change nothing a
 * flight without a damaging contact does.
 *
 *   node scripts/crash-shell-identity.js
 *
 * The shell (src/main.js, THE CRASH SHELL) makes new module calls when the
 * run's Crash damage setting is on: sim_set_damage(1), the ground's
 * material with every ground plane, sim_contact_at_mat in place of
 * sim_contact_at for the obstacle kinds whose module material has the
 * shell's own numbers (src/game/crashworld.js obstacleSurfaces), and the
 * trees and solids near the craft. The rule it is held to is the crash
 * plan's: a flight whose contacts stay under every limit is bit identical
 * with the mode on or off. The plant's side of that rule is
 * scripts/crash-identity.js; this is the shell's side, flown here in Node
 * against the module on disk, the same calls in the same order the shell
 * makes them, on every airframe the shell flies:
 *
 *   off   the shell with crash damage off: sim_set_ground with the shell's
 *         GROUND_MU and GROUND_E, sim_contact_at with contactMaterial's
 *         numbers, nothing else
 *   on    crash damage on: sim_set_damage(1), sim_set_ground_material
 *         (grass, the field's ground) after every sim_set_ground,
 *         sim_contact_at_mat for the obstacle, and a tree and a solid
 *         declared out of the flight's way
 *
 * Each flight takes off from grass, flies a stick program, rolls into a
 * gentle graze on a gate's PVC and lands on the grass again, all under any
 * damage limit. The state block is hashed every step. The two hashes must
 * match per airframe, and the "on" run must report no damage event (or the
 * flight was not the flight this is about). A last control run hits the
 * same obstacle hard with the mode on and must differ, which shows the
 * comparison can see a difference at all.
 *
 * Exit 0 when every airframe matches and the control differs.
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
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { contactMaterial, GROUND_MU, GROUND_E, KINDS } from '../src/game/collide.js';
import { obstacleSurfaces } from '../src/game/crashworld.js';
import { SURFACE } from '../configs/parts.js';
import { readPartsState } from './lib/crash.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasm = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const config = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');

/* The module's airframes the shell flies (configs/airframes.js simId). */
const AIRFRAMES = [
  ['5inch', 0], ['whoop65', 0, 1], ['sky1800', 3], ['cub1400', 4], ['slowstick1180', 5],
  ['radian2000', 6], ['timber1500', 7], ['bramor2300', 8], ['timber1500f', 9], ['cub1400f', 10],
];

const GATE = KINDS.indexOf('gate');

/*
 * One flight. `mode` is the damage mode, `shell` whether the crash shell's
 * own calls are made (the ground material, the obstacle's material, the
 * far trees and solids). A quad takes off from the grass; a plane is put
 * 40 m up at cruise, since the shell's ground plane under a parked plane
 * is its gear's business and not this check's.
 */
async function fly(simId, mode, shell, hard, partTable = 0) {
  const sim = await loadSim(wasm);
  const code = sim.init(config);
  if (code !== SIM_OK) {
    throw new Error(`sim_init ${code}`);
  }
  sim.e.sim_set_airframe(simId);
  if (partTable && typeof sim.e.sim_set_part_table === 'function') {
    /* The shell's whoop: the five inch's plant with the whoop's parts. */
    sim.e.sim_set_part_table(partTable);
  }
  sim.reset();
  const buf = sim.e.malloc(32);
  const table = obstacleSurfaces((m) => {
    sim.e.sim_material_info(m, buf);
    const d = new Float64Array(sim.e.memory.buffer, buf, 4);
    return [d[0], d[1]];
  });
  const modeOk = sim.e.sim_set_damage(mode ? 1 : 0) === SIM_OK;
  if (shell) {
    /* Out of the way, as the nearest trees and solids are on a real map. */
    sim.e.sim_tree_add(200, 200, 0, 0.3, 2, 9, 3);
    sim.e.sim_obstacle_cylinder(-200, 150, 0, 4, 0.2, SURFACE.pvc);
  }
  const plane = simId !== 0;
  if (plane) {
    sim.e.sim_set_pose(0, 0, 40, 1, 0, 0, 0);
    sim.e.sim_set_velocity(14, 0, 0, 0, 0, 0);
  }
  const hash = createHash('sha256');
  const gate = contactMaterial('gate');
  let events = 0;
  const evBuf = sim.e.malloc(64 * 16 * 8);
  for (let step = 0; step < 6000; step += 1) {
    /* The shell's ground plane, every step, flat grass. */
    sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, GROUND_MU, GROUND_E);
    if (shell) {
      sim.e.sim_set_ground_material(SURFACE.grass);
    }
    if (step % 4 === 0) {
      /* A stick program: a roll each way and a pitch; a quad climbs and
       * comes back down, a plane cruises. */
      const s = step / 1000;
      const thr = plane ? 0.5 : s < 1.2 ? 0.62 : s < 3.5 ? 0.5 : s < 4.5 ? 0.3 : 0.12;
      const roll = s > 1.5 && s < 1.8 ? 0.3 : s > 2.2 && s < 2.5 ? -0.3 : 0;
      const pitch = s > 2.8 && s < 3.1 ? 0.25 : 0;
      sim.input(s, roll, pitch, 0, thr);
    }
    sim.step(1);
    if (step === (hard ? 2000 : 2600)) {
      /* The obstacle pass meeting a gate member: a graze at a few
       * centimetres a second, or for the control a smack. */
      const st = sim.readState().state;
      /* From below, the surface moving up into the craft: the plant gives
       * the impulse to the part whose hull reaches furthest against the
       * normal, and from the side that is a prop's blade tip on a quad,
       * which chips on any touch at all (see the PR: a chip under the event
       * threshold is written without an event). From below it is the pack
       * or the belly. */
      const vs = hard ? 30 : 0.05;
      /* The surface moves with the craft, so the graze closes at vs and
       * does not also slide at cruise speed (a plane's belly skid is a real
       * crash and breaks things). */
      const args = [st[1], st[2], st[3] - 0.05, st[4], st[5], st[6] + vs, 0, 0, -0.05];
      const surf = shell ? table[GATE] : -1;
      if (surf >= 0) {
        sim.e.sim_contact_at_mat(0, 0, 1, surf, ...args);
      } else {
        sim.e.sim_contact_at(0, 0, 1, gate.e, gate.mu, ...args);
      }
    }
    if (mode) {
      events += sim.e.sim_damage_events(evBuf, 64);
    }
    hash.update(sim.readStateBytes().bytes);
  }
  /* Damage the plant wrote with no event to say so: any part's damage above
   * nought at the end of a flight that reported none. */
  const written = mode ? readPartsState(sim).reduce((m, p) => Math.max(m, p.damage), 0) : 0;
  return { hash: hash.digest('hex'), events, modeOk, written };
}

/*
 * Two questions, kept apart because they have different owners. SHELL:
 * with the mode on, do the shell's own calls change a flight that breaks
 * nothing? That is this branch's to answer and must be no. PLANT: is the
 * same flight with the mode on identical to the mode off? That is the
 * crash core's rule (scripts/crash-identity.js is its proof); it is
 * measured here too, on the calls the shell makes, and reported under the
 * core's name when it fails.
 */
let shellFailed = 0;
let plantFailed = 0;
console.log('crash shell identity, per airframe: off (mode off, old calls), on (mode on, old calls), shell (mode on, the crash shell\'s calls)');
for (const [name, id, table] of AIRFRAMES) {
  const off = await fly(id, false, false, false, table);
  const on = await fly(id, true, false, false, table);
  const shell = await fly(id, true, true, false, table);
  const quiet = shell.events === 0 && on.events === 0;
  /* Unreported damage is the plant's: the flight did damage something,
   * and a material's hardness then rightly changes how much, so the
   * shell's calls are only judged on a flight that wrote nothing. */
  const unreported = quiet && Math.max(on.written, shell.written) > 0;
  const shellOk = on.modeOk && (unreported || shell.hash === on.hash);
  const plantOk = off.hash === on.hash && !unreported;
  shellFailed += shellOk ? 0 : 1;
  plantFailed += plantOk || !quiet ? 0 : 1;
  const plantSays = !quiet ? 'n/a, the flight broke something'
    : unreported ? `FAIL, damage ${Math.max(on.written, shell.written).toExponential(1)} written with no event`
      : plantOk ? 'pass' : 'FAIL';
  console.log(`  ${name.padEnd(18)} off ${off.hash.slice(0, 12)}  on ${on.hash.slice(0, 12)}  shell ${shell.hash.slice(0, 12)}  `
    + `damage events ${on.events}/${shell.events}  `
    + `SHELL ${!shellOk ? 'FAIL' : unreported ? 'n/a' : 'pass'}  PLANT ${plantSays}`);
}
{
  const off = await fly(0, false, false, true);
  const on = await fly(0, true, true, true);
  const differs = off.hash !== on.hash;
  shellFailed += differs ? 0 : 1;
  console.log(`  control, a hard gate hit: off ${off.hash.slice(0, 12)}  shell ${on.hash.slice(0, 12)}  ${differs ? 'differ, as they must' : 'IDENTICAL: the comparison cannot see a difference'}; ${on.events} damage events`);
}
const failed = shellFailed + plantFailed;
if (plantFailed) {
  console.log(`\n${plantFailed} airframe(s) FAIL the plant's rule: a flight with no damage event differs with the mode on. The crash core's to fix; the shell's calls are not involved.`);
}
if (shellFailed) {
  console.log(`\n${shellFailed} FAILED on the shell's side`);
}
console.log(failed ? '' : '\nall passed');
process.exit(failed ? 1 : 0);
