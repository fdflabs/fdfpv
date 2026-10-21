/*
 * servo-derive.js: each aircraft's hinge_hold (plant_wing.c, servo blow
 * back), from its surfaces' geometry, its servos' published stall torque
 * and NACA's plain flap hinge moments (scripts/lib/hinge.js).
 *
 *   node scripts/servo-derive.js           print the table and the speeds
 *   node scripts/servo-derive.js --check   fail when a table's hinge_hold
 *                                          is not what this derives
 *
 * Per surface, one panel: span, its flap chord's root mean square, the
 * chord fraction, the aspect ratio of the surface it hinges on, the
 * table's throw, the servos on the panel and their torque at the voltage
 * it was published at, taken at the receiver's voltage where the maker
 * publishes a figure for it. A torque published at 4.8 V alone is taken
 * at 4.8 V, the maker's own 6.0 V figure not assumed. The Bramor is the
 * one table held here since the other aircraft with servos to derive
 * left the module on 2026-10-20.
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

import { hold, blowBackSpeed, hingeSlope, hingeAlpha, shapeDeg, shapeInv } from './lib/hinge.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/*
 * The class a kit that names no servo is given, ESTIMATED by its size,
 * its torque as published; an electric aircraft's receiver runs off its
 * ESC's BEC, taken at the 6.0 V figure where one is published.
 */
const HS311_60 = { id: 'hs311', kgcm: 3.5, volts: 6.0, source: 'Hitec HS-311 class, ESTIMATED for a standard size electric kit naming none: "3.0 ~ 3.5 kg-cm" over 4.8 to 6.0 V (hitecrcd.com, HS-311)' };

/*
 * The fleet. Each `a` is one aileron (or one elevon), `e` the elevator
 * (both halves on one servo unless servosPerPanel says otherwise, one
 * half each), `r` the rudder.
 */
export const FLEET = {
  /* scripts/bramor-derive.js: each elevon 0.45 to 1.10 m, a quarter of
   * the local chord, AR 8.95, one servo each (C-Astral publishes neither,
   * ESTIMATED); a 4 to 5 kg survey wing's standard size servos. */
  FW_BRAMOR2300: {
    a: { cf: 0.25, ar: 8.95, span: 0.65, chordRms: 0.0461, servosPerPanel: 1, servo: HS311_60 },
  },
};

/*
 * No hold, and why: FW_WING1000, retired; FW_STRIKER_PROP and
 * FW_STRIKER_JET, a Shahed class drone whose servos nothing publishes
 * nor bounds.
 */
export const UNHELD = ['FW_WING1000', 'FW_STRIKER_PROP', 'FW_STRIKER_JET'];

const DEG = 180 / Math.PI;
const r1 = (x) => Math.round(x * 10) / 10;

/* The table's throw for each slot, deg, and its top speed where a
 * comment carries it, read from the C. */
function tableOf(c, name) {
  const i = c.indexOf(`const FixedWingParams ${name} = {`);
  if (i < 0) throw new Error(`servo-derive: no table ${name} in plant_wing.c`);
  const body = c.slice(i, c.indexOf('\n};', i));
  const deg = (f) => {
    const m = new RegExp(`\\.${f} = ([0-9.]+) \\* WING_PI / 180\\.0`).exec(body);
    return m ? Number(m[1]) : 0;
  };
  const h = /\.hinge_hold = \{ ([^}]*) \}/.exec(body);
  const ha = /\.hinge_alpha = \{ ([^}]*) \}/.exec(body);
  return {
    alpha: ha ? ha[1].split(',').map((s) => Number(s.trim())) : [0, 0, 0],
    /* An elevon travels to surface_max, its two sticks' sum. */
    throwDeg: { a: /FW_MIX_ELEVON/.test(body) ? deg('surface_max') : deg('throw_a'), e: deg('throw_e'), r: deg('throw_r') },
    hold: h ? h[1].split(',').map((s) => Number(s.trim())) : [0, 0, 0],
  };
}

export function deriveAll(c) {
  const out = {};
  for (const [name, surf] of Object.entries(FLEET)) {
    const t = tableOf(c, name);
    const row = { hold: [0, 0, 0], alpha: [0, 0, 0], surfaces: {}, inC: t.hold, alphaInC: t.alpha };
    ['a', 'e', 'r'].forEach((k, i) => {
      const s = surf[k];
      if (!s || !(t.throwDeg[k] > 0)) return;
      const h = r1(hold({ ...s, throwDeg: t.throwDeg[k], kgcm: s.servo.kgcm }));
      row.hold[i] = h;
      row.alpha[i] = Math.round(hingeAlpha(s.cf, s.ar) * 1e4) / 1e4;
      row.surfaces[k] = { throwDeg: t.throwDeg[k], chd: hingeSlope(s.cf, s.ar), hold: h, vBlow: blowBackSpeed(h, t.throwDeg[k]) };
    });
    out[name] = row;
  }
  return out;
}

/* The angle a panel holds at airspeed V, deg. */
export function heldAt(h, throwDeg, V, rho = 1.225) {
  const q = 0.5 * rho * V * V;
  return Math.min(throwDeg, shapeInv(Math.min(shapeDeg(throwDeg), h / q * DEG)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const c = readFileSync(join(root, 'src/native/plant_wing.c'), 'utf8');
  const all = deriveAll(c);
  let bad = 0;
  for (const [name, row] of Object.entries(all)) {
    console.log(`${name.padEnd(20)} hinge_hold ${row.hold.join(', ')} Pa rad; hinge_alpha ${row.alpha.join(', ')}`);
    for (const [k, s] of Object.entries(row.surfaces)) {
      const top = [15, 20, 25, 30, 40].map((V) => `${V}: ${heldAt(s.hold, s.throwDeg, V).toFixed(1)}`).join('  ');
      console.log(`  ${k}  dCh/d delta ${s.chd.toFixed(3)} per rad, full ${s.throwDeg} deg held to ${s.vBlow.toFixed(1)} m/s; held deg at m/s  ${top}`);
    }
    if (row.hold.some((h, i) => h !== row.inC[i]) || row.alpha.some((a, i) => a !== row.alphaInC[i])) {
      bad += 1;
      console.log(`  DIFFERS: plant_wing.c has { ${row.inC.join(', ')} } and { ${row.alphaInC.join(', ')} }`);
    }
  }
  if (process.argv.includes('--check') && bad > 0) {
    console.error(`servo-derive --check: ${bad} table(s) differ from their derivation`);
    process.exit(1);
  }
}
