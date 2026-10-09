/*
 * stab-hold-derive.js: the Stabilised level hold's roll gains for the two
 * aircraft that roll on the rudder alone, the Bombshell and the Slow Stick,
 * retuned for the prop's wash over that rudder (docs/FLIGHTMODEL.md). The
 * hold's gains were tuned on a rudder in the free stream alone; in the wash
 * the same rudder at the trim's throttle and speed has 1 + dp fv / q of its
 * old authority (scripts/lib/wash.js, the plant's arithmetic), so the loop
 * gain rose by that much and the hold took back more of the pilot's own
 * rudder than it was built to. Each gain is its old value over that ratio:
 * the loop as tuned, on the aircraft as it now flies. The trim is
 * stab:glide's cruise (the stick and speed that fly it level). With
 * --check it fails when a table differs from what it derives. Run with
 * npm run stab:hold.
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

import { wash, gain } from './lib/wash.js';
import { derive } from './wash-derive.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* The table's thrust line at a duty and speed, plant_wing.c's; the duty a
 * glow engine's stick gives over its idle. The trim and the tuned gains
 * are the values before the wash (git b0eb3c29^). */
const HOLDS = {
  FW_BOMBSHELL1118: { Ts: 2.824, Vp: 13.85, idle: 0.40, stick: 0.732, V: 7.93, kp: 1.6, kd: 0.6 },
  FW_SLOWSTICK1180: { Ts: 2.69, Vp: 11.18, idle: 0, stick: 0.739, V: 5.44, kp: 2.0, kd: 0.8 },
};

const r2 = (x) => Number(x.toFixed(2));
const src = await readFile(join(root, 'src/native/plant_wing.c'), 'utf8');
const check = process.argv.includes('--check');
let bad = 0;
for (const [name, h] of Object.entries(HOLDS)) {
  const d = h.idle + (1 - h.idle) * h.stick;
  const T = h.Ts * d * d * (1 - h.V / (h.Vp * d));
  const w = wash(derive(name), T, h.V);
  const g = gain(w.dp, w.fv, h.V);
  const kp = r2(h.kp / g), kd = r2(h.kd / g);
  const body = src.slice(src.indexOf(`const FixedWingParams ${name} = {`)).split('\n};')[0];
  const ok = body.includes(`.stab_roll_kp = ${kp},`) && body.includes(`.stab_roll_kd = ${kd},`);
  console.log(`${name.padEnd(18)} thrust ${T.toFixed(3)} N at ${h.V} m/s, rudder gain ${g.toFixed(3)}: kp ${h.kp} -> ${kp}, kd ${h.kd} -> ${kd}${check && !ok ? '  DIFFERS' : ''}`);
  if (!ok) bad += 1;
}
if (check && bad) {
  console.log(`${bad} table(s) differ from their derivation`);
  process.exit(1);
}
