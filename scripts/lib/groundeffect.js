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
  let R = 0;
  if (g.tail) {
    const semi = g.b / 2;
    const dx = g.tail[0] - g.wing[0], dz = g.tail[1] - g.wing[1];
    const sb = Math.sin(alphaBody), cb = Math.cos(alphaBody);
    const x = (-dx * cb + dz * sb) / semi, m = (dx * sb + dz * cb) / semi;
    if (x > 0) R = tailR(x, m, h / semi) * (1 - smoothstep(0.5, GE_HB_MAX, h / g.b));
  }
  const dTail = g.dd * R * clw / g.aw - dAlpha;
  return { sigma, dAlpha, clw, dTail, dCd: clw * dAlpha, R };
}
