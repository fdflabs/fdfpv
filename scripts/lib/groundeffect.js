/*
 * groundeffect.js: the plant's ground effect on a wing, plant_wing.c
 * GROUND EFFECT, formula for formula, so a derivation that flies near the
 * ground predicts on the term the plant flies. It never loads the plant.
 * Harness arithmetic in JS maths, which is allowed here because nothing it
 * prints is hashed.
 *
 * The wing: Prandtl's fit to Wieselsberger's image wing (NACA TM 77,
 * 1922, eq. 4), the share of the induced drag the ground takes away,
 * written in the wing's height over the ground (TM 77's h is the wing to
 * its image, twice the height):
 *   sigma = (1 - 1.32 h/b) / (1.05 + 7.4 h/b), none from h/b = 1 / 1.32.
 * The same upwash takes sigma CL / (pi A) off the angle a lift needs
 * (Katzoff and Sweberg, NACA Report 738, 1943, p. 10: the induced angle's
 * reduction alone accounts for the measured lift), so the wing stalls at
 * its own CL max at a lower angle, and the drag falls by CL times it,
 * TM 77 eq. 5.
 *
 * The tail: Report 738's method, the wing's downwash at the tail less its
 * image's, read across the image's distance (2 z + m, z the wake's origin
 * over the ground, m the tail over the wake), on the flat elliptic vortex
 * sheet of Silverstein and Katzoff (NACA Report 648, 1939, the first
 * approximation: elementary horseshoes from the lifting line on to
 * infinity). The wake's displacement and the reflected bound vortex are
 * left out, as Report 738 takes the bound vortex's two effects to cancel.
 * The tail's share is faded out between h/b 0.5 and the wing's zero, the
 * plant's FITTED end to it.
 *
 * A biplane (biplaneGroundTerms): TM 77's four terms (p. 6, eq. 7), each
 * wing's own image and each wing in the other's, sigma_12 at the wings'
 * mean height; each wing at its angle plus its upwash, the two lifts
 * solved together, and Report 738's tail image for each wing's sheet,
 * weighted by its lift (plant_wing.c biplane_ground_terms).
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

const WING_C = join(dirname(dirname(dirname(fileURLToPath(import.meta.url)))), 'src/native/plant_wing.c');

/* A table's surfaces as the plant takes them (ge_wing, ge_tail, npm run
 * ge:derive), [x, z] from the CG, m; the tail null on a tailless table,
 * wing2 a biplane's bottom wing (ge_wing2), else null. Throws where the
 * table does not take the term. */
export function wingGround(table) {
  const src = readFileSync(WING_C, 'utf8');
  const m = new RegExp(`const FixedWingParams ${table} = \\{([\\s\\S]*?)\\n\\};`).exec(src);
  if (!m || !/\.ground_effect = 1/.test(m[1])) throw new Error(`groundeffect: ${table} does not take the term`);
  const vec = (name) => {
    const v = new RegExp(`\\.${name} = \\{([^}]*)\\}`).exec(m[1]);
    return v ? v[1].split(',').map(Number) : null;
  };
  const w = vec('ge_wing'), t = vec('ge_tail'), w2 = vec('ge_wing2');
  return { wing: [w[0], w[2]], tail: t && t[0] < 0 ? [t[0], t[2]] : null, wing2: w2 ? [w2[0], w2[2]] : null };
}

/* The height over the span past which the wing meets no ground: TM 77's
 * sigma is zero there. */
export const GE_HB_MAX = 1 / 1.32;

export function sigmaOf(hb) {
  const x = Math.max(0, hb);
  return x >= GE_HB_MAX ? 0 : (1 - 1.32 * x) / (1.05 + 7.4 * x);
}

/* The quadrature: the sheet's elementary horseshoes at semispan s =
 * sin(theta), theta's midpoints over a quarter turn, where the elliptic
 * sheet's strength per ds, s / sqrt(1 - s^2), is regular. */
export const GE_NODES = 32;
const S_NODE = Array.from({ length: GE_NODES }, (_, i) => Math.sin((i + 0.5) / GE_NODES * Math.PI / 2));

/* The sheet's downwash in its plane of symmetry, x behind the lifting line
 * and z off the sheet, in semispans; a scale the ratio below cancels. */
export function sheetW(x, z) {
  const z2 = z * z, d2 = x * x + z2;
  let sum = 0;
  for (const s of S_NODE) {
    const s2 = s * s;
    sum += s * (s / (s2 + z2) * (1 + x / Math.sqrt(x * x + s2 + z2)) + s * x / (d2 * Math.sqrt(s2 + d2)));
  }
  return sum;
}

const smoothstep = (a, b, x) => {
  if (x <= a) return 0;
  if (x >= b) return 1;
  const t = (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

/* The share of the wing's downwash at the tail its image takes away. */
export const tailR = (x, m, z) => sheetW(x, 2 * z + m) / sheetW(x, m);

/* The same for a wing at [x, z] h over the ground, faded as the plant
 * fades it; zero without a tail or with the tail ahead of the sheet. */
function tailShare(g, wing, h, alphaBody) {
  if (!g.tail) return 0;
  const semi = g.b / 2;
  const dx = g.tail[0] - wing[0], dz = g.tail[1] - wing[1];
  const sb = Math.sin(alphaBody), cb = Math.cos(alphaBody);
  const x = (-dx * cb + dz * sb) / semi, m = (dx * sb + dz * cb) / semi;
  return x > 0 ? tailR(x, m, h / semi) * (1 - smoothstep(0.5, GE_HB_MAX, h / g.b)) : 0;
}

/*
 * The terms at one state. g: { b, S, aw, dd, clmax, wing: [x, z], tail:
 * [x, z] } (body frame from the CG, m), h the wing's height over the
 * ground (m), alphaBody the body's angle to the wind (rad), alphaW the
 * wing's own angle of its zero lift line with the flaps' share. Returns
 * dAlpha (rad, added to the wing's angle), clw (the wing's lift it is
 * taken on), dTail (rad, the tail's angle over what the whole aircraft's
 * curve at the shifted angle gives it) and dCd (the drag taken off).
 */
export function groundTerms(g, h, alphaBody, alphaW) {
  const sigma = sigmaOf(h / g.b);
  if (!(sigma > 0)) return { sigma: 0, dAlpha: 0, clw: 0, dTail: 0, dCd: 0, R: 0 };
  const piA = Math.PI * g.b * g.b / g.S;
  const lin = g.aw * alphaW / (1 - sigma * g.aw / piA);
  const clw = Math.max(-g.clmax, Math.min(g.clmax, lin));
  const dAlpha = sigma * clw / piA;
  const R = tailShare(g, g.wing, h, alphaBody);
  const dTail = g.dd * R * clw / g.aw - dAlpha;
  return { sigma, dAlpha, clw, dTail, dCd: clw * dAlpha, R };
}

