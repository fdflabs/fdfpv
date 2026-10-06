/*
 * biplane.js: a biplane's two wings as two lifting lines in each other's
 * flow, the arithmetic behind the plant's second wing (FixedWingParams
 * bip_*, plant_wing.c biplane_lift, docs/PITTS-STAGE1.md). It is
 * scripts/pitts-derive.js's solution taken out whole, formula for formula,
 * so every biplane's derivation runs the one solver: Prandtl's induced drag
 * of the pair on the Trefftz plane (NACA TN 182, 1924), Munk's span factor,
 * each wing's own lift slope and share of the cell's lift in the other's
 * trailing sheet and bound vortex, and the plant's bip_* from them. It
 * never loads the plant. Harness arithmetic in JS maths, which is allowed
 * here because nothing it prints is hashed.
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

const RHO = 1.225;

/*
 * A wing's trailing sheet in the Trefftz plane: n equal strips along the
 * span, the elliptic circulation at their ends, the shed vorticity between
 * two nodes the circulation's drop, at the strip's middle; zAt(y) its
 * height at y (a dihedral raises it).
 */
function sheet(span, zAt, n, gamma0) {
  const pts = [];
  const h = span / n;
  const circ = (y) => gamma0 * Math.sqrt(Math.max(0, 1 - (2 * y / span) ** 2));
  for (let i = 0; i < n; i += 1) {
    const y0 = -span / 2 + i * h, y1 = y0 + h;
    const ym = (y0 + y1) / 2;
    pts.push({ y: ym, z: zAt(ym), g: circ(y0) - circ(y1), h });
  }
  return { pts, lift: (V) => RHO * V * gamma0 * Math.PI * span / 4 };
}
/* The induced drag of two sets of shed vorticity: -rho / (4 pi) times the
 * double sum of gamma_k gamma_l ln r_kl, a point vortex's own term a strip
 * of width h's mean ln, ln h - 3/2. */
function trefftz(a, bSheet) {
  let d = 0;
  for (const p of a.pts) {
    for (const q of bSheet.pts) {
      const r = Math.hypot(p.y - q.y, p.z - q.z);
      const lr = a === bSheet && p === q ? Math.log(p.h) - 1.5 : Math.log(r);
      d += p.g * q.g * lr;
    }
  }
  return -RHO / (4 * Math.PI) * d;
}

/*
 * The cell. Index 1 is the top wing and 2 the bottom one, as the plant's
 * bip_* index 0 and 1 are. Each wing: its span b, its chord c (the mean,
 * for the bound vortex's reach), its area S, its height z over the thrust
 * line at the root, its dihedral (rad, raising its sheet towards the
 * tips), and its aerodynamic centre xAc (m forward of the CG). S is the
 * reference area, eSpan the planform's and the fuselage's efficiency on
 * top of the pair's own (Pitts: 0.85, ESTIMATED). Both wings are taken
 * rigged at one incidence, as the plant takes them.
 *
 * Each wing's section lifts at a0 = 2 pi on its angle less the induced
 * angles: its own trailing sheet's, CL S / (pi b^2) for an elliptic load,
 * the other's, sigma CL' S' / (pi b1 b2) (Prandtl's mutual term shared
 * equally, as his theory takes it); and the bound vortex of the other
 * wing, which Munk's theorem moves between them without changing their
 * sum: the wing ahead sits in the upwash of the one behind's bound vortex
 * and the one behind in the downwash of the one ahead's, a 2D vortex's
 * c CL s / (4 pi r^2) with s the stagger of the quarter chords and r their
 * distance (an upper bound: a finite wing's bound vortex induces less).
 */
export function biplaneCell({ w1, w2, S, eSpan, n = 900 }) {
  const { b: b1, c: c1, S: S1, z: z1, dihedral: d1, xAc: xAc1 } = w1;
  const { b: b2, c: c2, S: S2, z: z2, dihedral: d2, xAc: xAc2 } = w2;
  const Vt = 10, qt = 0.5 * RHO * Vt * Vt;
  const s1 = sheet(b1, (y) => z1 + Math.abs(y) * Math.tan(d1), n, 1.0);
  const s2 = sheet(b2, (y) => z2 + Math.abs(y) * Math.tan(d2), n, 1.0);
  const L1t = s1.lift(Vt), L2t = s2.lift(Vt);
  const D11 = trefftz(s1, s1), D12 = trefftz(s1, s2);
  const selfCheck = D11 / (L1t * L1t / (Math.PI * qt * b1 * b1));
  const sigma = (2 * D12) * Math.PI * qt * b1 * b2 / (2 * L1t * L2t);
  const gap = z1 - z2;
  /* A common curve fit of Prandtl's chart for equal spans, a cross check. */
  const gOverB = gap / ((b1 + b2) / 2);
  const sigmaFit = (1 - 0.66 * gOverB) / (1.055 + 3.7 * gOverB);
  /* Munk's span factor at the split that minimises Prandtl's form. */
  const splitOpt = (1 / (b2 * b2) - sigma / (b1 * b2)) / (1 / (b1 * b1) - sigma / (b1 * b2));
  const kMunk = (() => {
    const l1 = splitOpt / (1 + splitOpt), l2 = 1 / (1 + splitOpt);
    const f = l1 * l1 / (b1 * b1) + 2 * sigma * l1 * l2 / (b1 * b2) + l2 * l2 / (b2 * b2);
    return 1 / (b1 * Math.sqrt(f));
  })();

  const a0 = 2 * Math.PI;
  const stagger = xAc1 - xAc2;
  const r2 = stagger * stagger + gap * gap;
  const kappa1 = c2 * stagger / (4 * Math.PI * r2), kappa2 = c1 * stagger / (4 * Math.PI * r2);
  const own1 = S1 / (Math.PI * b1 * b1), own2 = S2 / (Math.PI * b2 * b2);
  const mut1 = sigma * S2 / (Math.PI * b1 * b2) - kappa1;
  const mut2 = sigma * S1 / (Math.PI * b1 * b2) + kappa2;
  /* CL1 = a0 (alpha - own1 CL1 - mut1 CL2), CL2 = a0 (alpha - own2 CL2 - mut2 CL1). */
  const M11 = 1 / a0 + own1, M22 = 1 / a0 + own2;
  const det = M11 * M22 - mut1 * mut2;
  const A1 = (M22 - mut1) / det, A2 = (M11 - mut2) / det;
  const aw = (S1 * A1 + S2 * A2) / S;
  const share1 = S1 * A1 / (S * aw), share2 = S2 * A2 / (S * aw);
  const r1 = A1 / aw, r2w = A2 / aw;
  /* A wing's own slope with the other held, times the mutual term: what
   * a change in the other's lift, a stall, moves it by. */
  const aOwn1 = a0 / (1 + a0 * own1), aOwn2 = a0 / (1 + a0 * own2);
  const bipM = [aOwn1 * mut1, aOwn2 * mut2];
  const xAc = share1 * xAc1 + share2 * xAc2;
  const cbar = (S1 * c1 + S2 * c2) / (S1 + S2);
  const bipX = [(xAc1 - xAc) / cbar, (xAc2 - xAc) / cbar];
  const kIndOf = (l1, l2) => (l1 * l1 / (b1 * b1) + 2 * sigma * l1 * l2 / (b1 * b2) + l2 * l2 / (b2 * b2)) / (Math.PI * eSpan) * S;
  const kInduced = kIndOf(share1, share2);
  const kSpanCarried = 1 / Math.sqrt(kInduced * Math.PI * eSpan / S) / b1;
  const bipKi = [S1 / S * S1 / (Math.PI * eSpan * b1 * b1), S2 / S * S2 / (Math.PI * eSpan * b2 * b2)];
  const bipKx = [S1 / S * sigma * S2 / (Math.PI * eSpan * b1 * b2), S2 / S * sigma * S1 / (Math.PI * eSpan * b1 * b2)];
  const AR = b1 * b1 / S;
  const awMono = 2 * Math.PI * AR / (AR + 2), kMono = 1 / (Math.PI * eSpan * AR);
  return {
    gap, stagger, gOverB, selfCheck, sigma, sigmaFit, kMunk, kSpanCarried,
    kappa1, kappa2, own1, own2, mut1, mut2, A1, A2, aw, share1, share2, r1, r2: r2w,
    bipW: [share1, share2], bipR: [r1, r2w], bipM, bipX, bipKi, bipKx,
    kInduced, xAc, cbar, awMono, kMono,
  };
}
