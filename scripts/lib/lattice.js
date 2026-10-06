/*
 * lattice.js: a vortex lattice on a planar flying wing with winglets, and
 * its stability derivatives by central differences. It is
 * scripts/zagi-derive.js's solver taken out whole, formula for formula, so
 * every flying wing's derivation runs the one lattice (the Zagi's, and the
 * Striker's in scripts/combat-derive.js). It never loads the plant.
 * Harness arithmetic in JS maths, which is allowed here because nothing it
 * prints is hashed.
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

/*
 * THE VORTEX LATTICE, in its own axes: x aft, y to the right, z up, in
 * whatever unit the geometry is given in. The wing is planar: le(y) and
 * te(y) its leading and trailing edges at |y|, flap(y) the elevon's chord
 * there, 0 where there is none; each half ns strips, sine spaced so the
 * tip is resolved, each strip nc chordwise panels ahead of the hinge and
 * nf on the elevon. A winglet, when given, stands on each tip: root chord
 * at the tip's leading edge, top chord, height and the sweep of its
 * leading edge, nw strips up it. A horseshoe's bound leg is at its
 * panel's quarter chord and its control point at three quarters; the
 * trailing legs run aft, 1e4 half spans long.
 *
 * The air meets the aircraft at U = (cos a cos b, -sin b, sin a cos b), a
 * wind from the right for a positive sideslip b, and rotating at (p, q, r)
 * (right wing down, nose up, nose right; in these axes the rotation
 * vector is (-p, q, -r)) each point also meets -omega x (point - ref). A
 * panel's boundary condition: that air and what every vortex induces
 * have no component along its normal, the elevon's deflection (trailing
 * edge down positive) tilting a flap panel's normal back by it. Force on
 * each bound leg, Kutta and Joukowski, Gamma (U_local x l), U_local the
 * air there without the induced part, so the force is linear in Gamma.
 */
export function lattice({ le, te, flap, half, winglet = null, ns = 24, nc = 6, nf = 2, nw = 8 }) {
  const panels = [];
  const ys = [];
  for (let i = 0; i <= ns; i += 1) ys.push(half * Math.sin((Math.PI / 2) * i / ns));
  const stations = (y) => {
    const x0 = le(y), x1 = te(y), cf = flap(y);
    const out = [];
    const xe = x1 - cf;
    const n = cf > 0 ? nc : nc + nf;
    for (let k = 0; k < n; k += 1) out.push([x0 + (xe - x0) * k / n, x0 + (xe - x0) * (k + 1) / n, 0]);
    if (cf > 0) for (let k = 0; k < nf; k += 1) out.push([xe + cf * k / nf, xe + cf * (k + 1) / nf, 1]);
    return out;
  };
  for (const side of [-1, 1]) {
    for (let i = 0; i < ns; i += 1) {
      const ya = ys[i], yb = ys[i + 1], ym = 0.5 * (ya + yb);
      const sa = stations(ya), sb = stations(yb), sm = stations(ym);
      for (let k = 0; k < sa.length; k += 1) {
        const xa = sa[k][0] + 0.25 * (sa[k][1] - sa[k][0]);
        const xb = sb[k][0] + 0.25 * (sb[k][1] - sb[k][0]);
        const xc = sm[k][0] + 0.75 * (sm[k][1] - sm[k][0]);
        /* Bound legs run left to right, y increasing, so a positive Gamma lifts. */
        const A = side > 0 ? [xa, ya, 0] : [xb, -yb, 0];
        const B = side > 0 ? [xb, yb, 0] : [xa, -ya, 0];
        panels.push({ A, B, C: [xc, side * ym, 0], n: [0, 0, 1], side, flap: sa[k][2] === 1 && sb[k][2] === 1, strip: i, ya, yb });
      }
    }
  }
  if (winglet) {
    const { root, top, h, sweep } = winglet;
    const xl = le(half);
    for (const side of [-1, 1]) {
      for (let i = 0; i < nw; i += 1) {
        const za = h * i / nw, zb = h * (i + 1) / nw, zm = 0.5 * (za + zb);
        const at = (z) => ({ x0: xl + sweep * z / h, ch: root + (top - root) * z / h });
        for (let k = 0; k < nc; k += 1) {
          const pa = at(za), pb = at(zb), pm = at(zm);
          const xa = pa.x0 + pa.ch * (k + 0.25) / nc, xb = pb.x0 + pb.ch * (k + 0.25) / nc;
          const xc = pm.x0 + pm.ch * (k + 0.75) / nc;
          /* Upward on the right winglet, downward on the left, so the two
           * are mirror images; the normal points outboard on both. */
          const A = side > 0 ? [xa, half, za] : [xb, -half, zb];
          const B = side > 0 ? [xb, half, zb] : [xa, -half, za];
          panels.push({ A, B, C: [xc, side * half, zm], n: [0, side, 0], side, flap: false, fin: true });
        }
      }
    }
  }
  const N = panels.length;
  const far = 1e4 * half;
  const seg = (P, P1, P2) => {
    const r1 = [P[0] - P1[0], P[1] - P1[1], P[2] - P1[2]];
    const r2 = [P[0] - P2[0], P[1] - P2[1], P[2] - P2[2]];
    const r0 = [P2[0] - P1[0], P2[1] - P1[1], P2[2] - P1[2]];
    const c = [r1[1] * r2[2] - r1[2] * r2[1], r1[2] * r2[0] - r1[0] * r2[2], r1[0] * r2[1] - r1[1] * r2[0]];
    const c2 = c[0] * c[0] + c[1] * c[1] + c[2] * c[2];
    const n1 = Math.hypot(...r1), n2 = Math.hypot(...r2);
    /* On the segment's own line, where the field is singular, nothing. */
    if (n1 < 1e-12 || n2 < 1e-12 || c2 < 1e-12 * (n1 * n2) ** 2) return [0, 0, 0];
    const k = (r0[0] * (r1[0] / n1 - r2[0] / n2) + r0[1] * (r1[1] / n1 - r2[1] / n2) + r0[2] * (r1[2] / n1 - r2[2] / n2)) / (4 * Math.PI * c2);
    return [c[0] * k, c[1] * k, c[2] * k];
  };
  const horseshoe = (P, pj) => {
    const FA = [pj.A[0] + far, pj.A[1], pj.A[2]], FB = [pj.B[0] + far, pj.B[1], pj.B[2]];
    const v1 = seg(P, FA, pj.A), v2 = seg(P, pj.A, pj.B), v3 = seg(P, pj.B, FB);
    return [v1[0] + v2[0] + v3[0], v1[1] + v2[1] + v3[1], v1[2] + v2[2] + v3[2]];
  };
  const dot = (a, bb) => a[0] * bb[0] + a[1] * bb[1] + a[2] * bb[2];
  /* LU once, solve for every right hand side. */
  const LU = panels.map((pi) => panels.map((pj) => dot(horseshoe(pi.C, pj), pi.n)));
  const piv = [...Array(N).keys()];
  for (let i = 0; i < N; i += 1) {
    let p = i;
    for (let r = i + 1; r < N; r += 1) if (Math.abs(LU[r][i]) > Math.abs(LU[p][i])) p = r;
    [LU[i], LU[p]] = [LU[p], LU[i]];
    [piv[i], piv[p]] = [piv[p], piv[i]];
    for (let r = i + 1; r < N; r += 1) {
      const f = LU[r][i] / LU[i][i];
      LU[r][i] = f;
      for (let j = i + 1; j < N; j += 1) LU[r][j] -= f * LU[i][j];
    }
  }
  /* What every horseshoe induces at each bound leg's middle, for the
   * forces: the downwash that tilts the lift back is the induced drag,
   * and a wing's difference in it is the elevons' adverse yaw. */
  const mids = panels.map((pn) => [0.5 * (pn.A[0] + pn.B[0]), 0.5 * (pn.A[1] + pn.B[1]), 0.5 * (pn.A[2] + pn.B[2])]);
  const Vm = mids.map((P) => panels.map((pj) => horseshoe(P, pj)));
  const solve = (rhs) => {
    const bb = piv.map((i) => rhs[i]);
    for (let i = 0; i < N; i += 1) for (let j = 0; j < i; j += 1) bb[i] -= LU[i][j] * bb[j];
    for (let i = N - 1; i >= 0; i -= 1) {
      for (let j = i + 1; j < N; j += 1) bb[i] -= LU[i][j] * bb[j];
      bb[i] /= LU[i][i];
    }
    return bb;
  };
  /*
   * One case, unit airspeed: alpha, beta, the elevons (right and left,
   * trailing edge down positive, rad), the rates as p b/2V, q c/2V and
   * r b/2V against the references. Returns the coefficients on them, the
   * aircraft's conventions: CL up, CY to the right, Cl right wing down,
   * Cm nose up, Cn nose right, the moments about (xref, 0, 0).
   */
  return (ref, { alpha = 0, beta = 0, dR = 0, dL = 0, pHat = 0, qHat = 0, rHat = 0 } = {}) => {
    const om = [-pHat * 2 / ref.b, qHat * 2 / ref.c, -rHat * 2 / ref.b];
    const U0 = [Math.cos(alpha) * Math.cos(beta), -Math.sin(beta), Math.sin(alpha) * Math.cos(beta)];
    const air = (P) => {
      const r = [P[0] - ref.xref, P[1], P[2]];
      const w = [om[1] * r[2] - om[2] * r[1], om[2] * r[0] - om[0] * r[2], om[0] * r[1] - om[1] * r[0]];
      return [U0[0] - w[0], U0[1] - w[1], U0[2] - w[2]];
    };
    const rhs = panels.map((pn) => {
      const d = pn.flap ? (pn.side > 0 ? dR : dL) : 0;
      return -(dot(air(pn.C), pn.n) + d);
    });
    const G = solve(rhs);
    const F = [0, 0, 0], M = [0, 0, 0];
    for (let i = 0; i < N; i += 1) {
      const pn = panels[i];
      const mid = mids[i];
      const l = [pn.B[0] - pn.A[0], pn.B[1] - pn.A[1], pn.B[2] - pn.A[2]];
      const U = air(mid);
      for (let j = 0; j < N; j += 1) {
        U[0] += Vm[i][j][0] * G[j];
        U[1] += Vm[i][j][1] * G[j];
        U[2] += Vm[i][j][2] * G[j];
      }
      const f = [G[i] * (U[1] * l[2] - U[2] * l[1]), G[i] * (U[2] * l[0] - U[0] * l[2]), G[i] * (U[0] * l[1] - U[1] * l[0])];
      const r = [mid[0] - ref.xref, mid[1], mid[2]];
      F[0] += f[0]; F[1] += f[1]; F[2] += f[2];
      M[0] += r[1] * f[2] - r[2] * f[1];
      M[1] += r[2] * f[0] - r[0] * f[2];
      M[2] += r[0] * f[1] - r[1] * f[0];
    }
    const qS = 0.5 * ref.S;
    /* Lift square to the air in the x z plane; the moments turned to the
     * aircraft's senses: roll about -x, pitch about +y, yaw about -z. */
    const CL = (F[2] * Math.cos(alpha) - F[0] * Math.sin(alpha)) / qS;
    /* The right wing's span loading, cl c = 2 Gamma, strip by strip. */
    const load = [];
    for (let i = 0; i < N; i += 1) {
      const pn = panels[i];
      if (pn.fin || pn.side < 0) continue;
      load[pn.strip] = load[pn.strip] || { ya: pn.ya, yb: pn.yb, clc: 0 };
      load[pn.strip].clc += 2 * G[i];
    }
    return { CL, CY: F[1] / qS, Cl: -M[0] / (qS * ref.b), Cm: M[1] / (qS * ref.c), Cn: -M[2] / (qS * ref.b), load };
  };
}

/* Derivatives by central differences on a solved lattice, about a base. */
export function derivatives(run, ref, base = {}) {
  const h = 0.01;
  const d = (key, sel) => {
    const up = run(ref, { ...base, [key]: (base[key] || 0) + h });
    const dn = run(ref, { ...base, [key]: (base[key] || 0) - h });
    return (up[sel] - dn[sel]) / (2 * h);
  };
  const elev = (sel) => (run(ref, { ...base, dR: h, dL: h })[sel] - run(ref, { ...base, dR: -h, dL: -h })[sel]) / (2 * h);
  /* Right trailing edge up and left down, a roll to the right. */
  const ail = (sel) => (run(ref, { ...base, dR: -h, dL: h })[sel] - run(ref, { ...base, dR: h, dL: -h })[sel]) / (2 * h);
  return {
    CLa: d('alpha', 'CL'), Cma: d('alpha', 'Cm'),
    CLq: d('qHat', 'CL'), Cmq: d('qHat', 'Cm'),
    CYb: d('beta', 'CY'), Clb: d('beta', 'Cl'), Cnb: d('beta', 'Cn'),
    Clp: d('pHat', 'Cl'), Cnp: d('pHat', 'Cn'),
    Clr: d('rHat', 'Cl'), Cnr: d('rHat', 'Cn'),
    CLde: elev('CL'), Cmde: elev('Cm'), Clda: ail('Cl'), Cnda: ail('Cn'),
  };
}
