/*
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

/*
 * The control surface tiers' numbers, docs/SURFACES-STAGE1.md, from
 * configs/surfaces.js's geometry:
 *
 *   node scripts/surfaces-derive.js           print the table
 *   node scripts/surfaces-derive.js --write   write configs/surfaces-tiers.js
 *   node scripts/surfaces-derive.js --check   fail when that file differs
 *
 * Per surface and tier, the chord fraction cf and throw climb from the
 * stock aircraft's toward configs/surfaces.js REFERENCE, and:
 *
 *   k   the plant's control terms' multiplier, tau(cf) K'(throw) over the
 *       stock's: Glauert's thin aerofoil flap effectiveness, tau = 1 -
 *       (theta - sin theta) / pi with cos theta = 2 cf - 1 (Glauert, ARC
 *       R&M 1095, 1927; Abbott and von Doenhoff, Theory of Wing Sections,
 *       sec. 8.2), and Roskam's plain flap K' at the full throw (Airplane
 *       Design VI fig. 10.7, Mason's fit), which every table's derivatives
 *       fold in at full throw (scripts/extra-derive.js). A ratio, so the
 *       viscous correction both share drops out to first order, and the
 *       table's own figure, whatever its source, is what it multiplies.
 *   cd  the deflected surface's drag over the stock one's, on the wing's
 *       area, per unit of plant_wing.c's plain flap shape (fitted to
 *       Roskam VI fig. 4.44, linear in cf): (cf - cf_stock) times the
 *       share of the wing's area the surface runs along.
 *   servo  the hinge moment, C_h q S_f c_f delta, at the same airspeed
 *       and hinge moment coefficient: S_f and c_f both go with cf on the
 *       same span, so it grows as cf^2 times the throw. The stock servo
 *       is taken as just covering the stock surface (ESTIMATED: a kit's
 *       servo has some margin, so this sizes up a little early), and the
 *       lightest catalogue servo covering the tier's is fitted.
 *   dKg the servos' mass over the stock ones'.
 *
 * A surface whose Extreme tier would add less than OFFER_MIN of control
 * power over stock (the aircraft already flies surfaces near the
 * reference, the Extra's rudder) is not offered: the hangar leaves it
 * stock rather than sell a heavier servo for a tier that does nothing.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TIERS, TIER_STEP, SURFACE_KEYS, REFERENCE, SERVOS, SERVO_ORDER, SURFACES } from '../configs/surfaces.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(root, 'configs/surfaces-tiers.js');

export const tauOf = (cf) => {
  const th = Math.acos(1 - 2 * (1 - cf));
  return 1 - (th - Math.sin(th)) / Math.PI;
};
/* Roskam's K', as scripts/extra-derive.js has it: 1 under 15 deg. */
export const kPrime = (deg) => (deg < 15 ? 1 : 4e-7 * deg ** 4 - 7e-5 * deg ** 3 + 0.0047 * deg ** 2 - 0.1453 * deg + 2.3167);

const OFFER_MIN = 1.10;

/*
 * Roskam, Airplane Design VI, fig. 4.44: a plain flap's section profile
 * drag increment against its chord fraction at 15 and at 60 deg, as
 * FAST-GA digitised it (supaero-aircraft-design/FAST-GA,
 * src/fastga/models/aerodynamics/components/resources/
 * delta_drag_plain_flap.csv), rounded to four places: cf at 15 deg, the
 * drag there, cf at 60 deg, the drag there.
 */
const ROSKAM_444 = [
  [0.1, 0.0082, 0.1007, 0.0625],
  [0.1253, 0.0103, 0.126, 0.0804],
  [0.1507, 0.0125, 0.1507, 0.0978],
  [0.1753, 0.0152, 0.176, 0.1163],
  [0.2, 0.0174, 0.2007, 0.1353],
  [0.2253, 0.0207, 0.2253, 0.1549],
  [0.2493, 0.0228, 0.25, 0.1761],
  [0.274, 0.0261, 0.274, 0.1973],
  [0.3, 0.0299, 0.3, 0.2196],
];

/* plant_wing.c's SURF_DRAG_A and _B: the least squares fit of
 * cd = cf (A |delta| + B delta^2) to those points, and its worst error. */
export function fitSurfDrag() {
  const pts = [];
  for (const [c15, d15, c60, d60] of ROSKAM_444) {
    pts.push([c15, 15 * Math.PI / 180, d15], [c60, 60 * Math.PI / 180, d60]);
  }
  let s11 = 0, s12 = 0, s22 = 0, t1 = 0, t2 = 0;
  for (const [c, d, y] of pts) {
    const f1 = c * d, f2 = c * d * d;
    s11 += f1 * f1; s12 += f1 * f2; s22 += f2 * f2; t1 += f1 * y; t2 += f2 * y;
  }
  const det = s11 * s22 - s12 * s12;
  const A = Math.round((t1 * s22 - t2 * s12) / det * 1e4) / 1e4;
  const B = Math.round((s11 * t2 - s12 * t1) / det * 1e4) / 1e4;
  const worst = Math.max(...pts.map(([c, d, y]) => Math.abs(c * (A * d + B * d * d) / y - 1)));
  return { A, B, worst };
}

const r4 = (x) => Math.round(x * 1e4) / 1e4;
const r6 = (x) => Math.round(x * 1e6) / 1e6;

function servoFor(kgcm, stockModel) {
  const from = SERVO_ORDER.indexOf(stockModel);
  for (const id of SERVO_ORDER.slice(from)) {
    if (SERVOS[id].kgcm >= kgcm) {
      return id;
    }
  }
  return null;
}

export function deriveSurface(id, key) {
  const s = SURFACES[id];
  const cf0 = s.cf[key];
  const th0 = s.throwDeg[key];
  const cfTop = Math.max(cf0, REFERENCE.cf[key]);
  const thTop = Math.max(th0, REFERENCE.throwDeg[key]);
  const stock = SERVOS[s.servo.model];
  const n = s.servo[key].n;
  return TIERS.map((tier, i) => {
    const f = TIER_STEP[i];
    const cf = cf0 + f * (cfTop - cf0);
    const throwDeg = th0 + f * (thTop - th0);
    const k = (tauOf(cf) * kPrime(throwDeg)) / (tauOf(cf0) * kPrime(th0));
    const cd = (cf - cf0) * s.flapped[key];
    const hinge = (cf / cf0) ** 2 * (throwDeg / th0);
    const servo = servoFor(stock.kgcm * hinge, s.servo.model);
    if (!servo) {
      throw new Error(`${id} ${key} ${tier}: no catalogue servo covers ${(stock.kgcm * hinge).toFixed(1)} kg-cm`);
    }
    return {
      tier,
      cf: r4(cf),
      throwDeg: r4(throwDeg),
      k: r6(k),
      cd: r6(cd),
      hinge: r4(hinge),
      servo,
      dKg: r6(n * (SERVOS[servo].kg - stock.kg)),
      /* The control power at full stick over the stock's: k times the throw. */
      power: r4(k * throwDeg / th0),
    };
  });
}

export function deriveAll() {
  const out = {};
  for (const id of Object.keys(SURFACES)) {
    out[id] = { offered: {} };
    for (const key of SURFACE_KEYS) {
      out[id][key] = deriveSurface(id, key);
      out[id].offered[key] = out[id][key][TIERS.length - 1].power >= OFFER_MIN;
    }
  }
  return out;
}

function fileText(table) {
  const header = [
    '/*',
    ' * This file is part of the Paraguayan Drone Combat Simulator.',
    ' *',
    ' * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify',
    ' * it under the terms of the GNU General Public License as published by',
    ' * the Free Software Foundation, either version 3 of the License, or (at',
    ' * your option) any later version.',
    ' *',
    ' * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but',
    ' * WITHOUT ANY WARRANTY, without even the implied warranty of',
    ' * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU',
    ' * General Public License for more details.',
    ' *',
    ' * You should have received a copy of the GNU General Public License',
    ' * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.',
    ' */',
    '',
    '/* WRITTEN BY scripts/surfaces-derive.js --write; do not edit. Per aircraft,',
    ' * surface (a e r) and tier (stock sport 3d extreme): docs/SURFACES-STAGE1.md. */',
  ];
  return `${header.join('\n')}\nexport const SURFACE_TIERS = ${JSON.stringify(table, null, 2)};\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const table = deriveAll();
  for (const [id, surf] of Object.entries(table)) {
    console.log(`\n${id}`);
    console.log('surface tier      cf     throw    k       power   cd        servo   dKg');
    for (const key of SURFACE_KEYS) {
      if (!surf.offered[key]) {
        console.log(`${key}       not offered: Extreme adds ${((surf[key][TIERS.length - 1].power - 1) * 100).toFixed(1)} percent, under ${((OFFER_MIN - 1) * 100).toFixed(0)}`);
      }
      for (const row of surf[key]) {
        console.log(`${key}       ${row.tier.padEnd(8)}  ${row.cf.toFixed(3)}  ${row.throwDeg.toFixed(2).padStart(6)}  ${row.k.toFixed(4)}  ${row.power.toFixed(3)}  ${row.cd.toFixed(5)}  ${row.servo.padEnd(7)} ${(row.dKg * 1000).toFixed(1)} g`);
      }
    }
  }
  const text = fileText(table);
  if (process.argv.includes('--write')) {
    await writeFile(OUT, text);
    console.log(`\nwrote ${OUT}`);
  }
  const fit = fitSurfDrag();
  console.log(`\nplain flap drag fit, Roskam VI fig. 4.44: A ${fit.A}, B ${fit.B}, worst ${(fit.worst * 100).toFixed(1)} percent`);
  if (process.argv.includes('--check')) {
    const c = await readFile(join(root, 'src/native/plant_wing.c'), 'utf8');
    const def = (name) => Number((c.match(new RegExp(`#define ${name} ([0-9.]+)`)) || [])[1]);
    if (def('SURF_DRAG_A') !== fit.A || def('SURF_DRAG_B') !== fit.B) {
      console.error(`surfaces:derive --check: plant_wing.c SURF_DRAG_A ${def('SURF_DRAG_A')}, SURF_DRAG_B ${def('SURF_DRAG_B')}; the fit gives ${fit.A}, ${fit.B}`);
      process.exit(1);
    }
    const now = await readFile(OUT, 'utf8');
    if (now !== text) {
      console.error('\nsurfaces:derive --check: configs/surfaces-tiers.js is not what the derivation gives; run --write and review');
      process.exit(1);
    }
    console.log('\nsurfaces:derive --check: configs/surfaces-tiers.js and plant_wing.c SURF_DRAG_A/_B match');
  }
}
