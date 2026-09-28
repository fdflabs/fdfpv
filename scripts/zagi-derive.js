/*
 * zagi-derive.js: the arithmetic behind docs/ZAGI-STAGE1.md, from Zagi's
 * published figures for the Zagi HP (span, area, weight, airfoil, CG,
 * throws, pack, motor, prop and its bench point: the kit manual and
 * zagi.com's product pages) and the planform Trick R/C drew to scale in
 * its Zagi-400 X manual, to every coefficient and every derived band.
 *
 * A flying wing has no tail to take the derivatives from with Nelson's
 * forms, so they are a vortex lattice's, lattice() below: horseshoe
 * vortices on the wing and on its two winglets, the elevons the last
 * chordwise panels, solved for alpha, sideslip, the three rates and the
 * elevons. It is checked on two textbook wings first, and run on the Zagi
 * Hendricks measured and put through AVL (BYU ECEn 674, 2014) for
 * comparison.
 *
 * It never loads the plant: this is what the plant is checked against,
 * so it has to stand apart from it. Harness arithmetic in JS maths, which
 * is allowed here because nothing it prints is hashed. It follows
 * scripts/p51-derive.js where the aircraft are alike. Run with
 * npm run zagi:derive.
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

const DEG = 180 / Math.PI;
const rho = 1.225;
const g = 9.81;
const IN = 0.0254;
const OZ = 0.028349523125;
const FT2 = 0.09290304;

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
function lattice({ le, te, flap, half, winglet = null, ns = 24, nc = 6, nf = 2, nw = 8 }) {
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
        panels.push({ A, B, C: [xc, side * ym, 0], n: [0, 0, 1], side, flap: sa[k][2] === 1 && sb[k][2] === 1 });
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
    return { CL, CY: F[1] / qS, Cl: -M[0] / (qS * ref.b), Cm: M[1] / (qS * ref.c), Cn: -M[2] / (qS * ref.b) };
  };
}

/* Derivatives by central differences on a solved lattice, about a base. */
function derivatives(run, ref, base = {}) {
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

/*
 * The lattice on two textbook wings first: a rectangular wing of aspect
 * ratio 5, whose lifting surface slope Helmbold's formula gives, 2 pi A /
 * (2 + sqrt(A^2 + 4)), and whose aerodynamic centre is near the quarter
 * chord; and a wing swept 45 deg at the leading edge, A 5, taper 0.5.
 */
const rectRun = lattice({ le: () => 0, te: () => 1, flap: () => 0, half: 2.5, nc: 8, nf: 0 });
const rectD = derivatives(rectRun, { S: 5, c: 1, b: 5, xref: 0 });
const helmbold = 2 * Math.PI * 5 / (2 + Math.sqrt(29));
const sweptRun = lattice({ le: (y) => y, te: (y) => y + 4 / 3 - (2 / 3) * y / 2.5, flap: () => 0, half: 2.5, nc: 8, nf: 0 });
const sweptD = derivatives(sweptRun, { S: 5, c: 1, b: 5, xref: 0 });
const sweptMac = (2 / 3) * (4 / 3) * 1.75 / 1.5, sweptMacLE = (2.5 / 3) * 2 / 1.5;

/*
 * HENDRICKS'S ZAGI, measured and run through AVL 3 for Beard's ECEn 674
 * (A. Hendricks, "ECEn 674 Final Project", BYU, December 2014, the
 * geometry file Zagi.txt and its output zagicoeff.txt, linked from the
 * uavbook repository's README). Inches: the wing 15 in at the root, 5.5
 * at the tip, 23.5 out and 17.5 aft; the elevons a surface of their own
 * behind the wing's trailing edge from 3.75 in out (1 in chord) to the
 * tip (2 in); the winglets 5.5 in at the root, 2.5 at the top, 5 in tall,
 * swept 3 in; the references Sref 225.87, Cref 9.75, Bref 47, Xref 9.6.
 * AVL's stability derivatives at alpha 0: CLa 8.566467, Cma -1.344343,
 * Clp -0.880695, Cmq -6.035727, CYb -0.313003, Clb -0.073745, Cnb
 * 0.067539, Cnr -0.037605, and per degree CLd2 (elevator) 0.026185, Cmd2
 * -0.023072, Cld1 (aileron, AVL's sign) -0.006849; neutral point
 * 11.130075.
 */
const hkWinglet = { root: 5.5, top: 2.5, h: 5.0, sweep: 3.0 };
const hk = {
  le: (y) => 17.5 * y / 23.5,
  wingTe: (y) => 15 + (17.5 + 5.5 - 15) * y / 23.5,
  flap: (y) => (y < 3.75 ? 0 : 1 + (y - 3.75) / (23.5 - 3.75)),
};
const hkRun = lattice({ le: hk.le, te: (y) => hk.wingTe(y) + hk.flap(y), flap: hk.flap, half: 23.5, winglet: hkWinglet });
const hkRef = { S: 225.87, c: 9.75, b: 47, xref: 9.6 };
const hkD = derivatives(hkRun, hkRef);
const hkNP = hkRef.xref - hkRef.c * hkD.Cma / hkD.CLa;
const hkAVL = {
  CLa: 8.566467, Cma: -1.344343, Clp: -0.880695, Cmq: -6.035727, CYb: -0.313003, Clb: -0.073745, Cnb: 0.067539, Cnr: -0.037605,
  CLde: 0.026185 * DEG, Cmde: -0.023072 * DEG, Clda: 0.006849 * DEG, np: 11.130075,
};

/*
 * THE ZAGI HP, zagi.com and its manual (Zagi HP Assembly Manual, stock
 * ZH402): span 48 in, wing area 2.8 sq ft, flying weight 25.5 oz, the
 * Zagi 101.4 airfoil, balanced 8 in back from the nose, the elevons 3/8
 * in up and down on either stick. The planform is the one Trick R/C drew
 * to scale for the Zagi-400 X (its manual, figs. 2 and 3, 300 dpi, 37.75
 * px to the inch across the 48 in span): the root chord 12.17 in, the tip
 * 5.06 in, the leading edge 13.06 in aft at the tip, a sweep of tan 0.543;
 * that is 2.87 sq ft, the THL's and the 400's published 2.83. The HP's
 * 2.8 sq ft is taken on the same sweep with the chords scaled by the
 * areas. The elevons are HP's "constant cord" balsa, 1.5 in, Hendricks's
 * measured 1 to 2 in; from the motor bay's edge, 2.5 in out, to the tip.
 * The winglets are Zagi's plastic ones, Hendricks's measured.
 */
const b = 48 * IN, S = 2.8 * FT2, m = 25.5 * OZ, W = m * g, c = S / b, AR = b * b / S;
const drawn = { cr: 12.17, ct: 5.06, tanLE: 0.543 };
const areaDrawn = (drawn.cr + drawn.ct) / 2 * 48;
const kc = (S / (IN * IN)) / areaDrawn;
const cr = drawn.cr * kc, ct = drawn.ct * kc, taper = ct / cr;
const xCG = 8.0;                                 /* in, behind the nose */
const flapC = 1.5, flapIn = 2.5;
const winglet = hkWinglet;
const hp = {
  le: (y) => drawn.tanLE * y,
  te: (y) => drawn.tanLE * y + cr - (cr - ct) * y / 24,
  flap: (y) => (y < flapIn ? 0 : flapC),
};
const chordIn = (y) => cr - (cr - ct) * Math.abs(y) / 24;
const mac = (2 / 3) * cr * (1 + taper + taper * taper) / (1 + taper);
const yMac = (24 / 3) * (1 + 2 * taper) / (1 + taper);
const xMacLE = drawn.tanLE * yMac;
const hCG = (xCG - xMacLE) / mac;
const tanC4 = drawn.tanLE - 0.25 * (cr - ct) / 24;
/* The plant's references: S, S/b and b, in inches for the lattice. */
const hpRef = { S: S / (IN * IN), c: c / IN, b: 48, xref: xCG };
const hpRun = lattice({ le: hp.le, te: hp.te, flap: hp.flap, half: 24, winglet });
const hpBare = lattice({ le: hp.le, te: hp.te, flap: hp.flap, half: 24 });
const bareD = derivatives(hpBare, hpRef);
const bareNP = xCG - hpRef.c * bareD.Cma / bareD.CLa;

/*
 * The section and the wing's lift. The Zagi 101.4 is not published; it
 * is a reflexed flying wing section, the class of the MH45, which
 * Hendricks ran his Zagi on. The MH45's measured CL max at 2e5 (UIUC,
 * Summary of Low-Speed Airfoil Data vol. 1, fig. 4.61) is 1.14; the
 * wing's is 0.9 of the section's times cos of the quarter chord's sweep
 * (Raymer, eq. 12.15).
 */
const clmaxSection = 1.14;
const CLmax = 0.9 * clmaxSection * Math.cos(Math.atan(tanC4));
const Vs = Math.sqrt(2 * W / (rho * S * CLmax));
/* The lateral derivatives depend on the lift: taken at the cruise, 1.4
 * times the stall. */
const Vcruise = 1.4 * Vs;
const CLcruise = W / (0.5 * rho * Vcruise * Vcruise * S);
const D0 = derivatives(hpRun, hpRef);
const alphaCruise = CLcruise / D0.CLa;
const D = derivatives(hpRun, hpRef, { alpha: alphaCruise });
const CLa = D0.CLa;
/*
 * The neutral point, FITTED. The lattice puts it 0.31 in behind the 8 in
 * CG, a margin of 3.5 percent of the MAC, which would make CRRC's 8 1/4
 * in "optimum" for the same planform (the THL) all but neutral and its 8
 * 1/2 unstable. AVL on Hendricks's measured Zagi puts that wing's 0.52 in
 * further aft than the lattice does on the same geometry, the thickness
 * and camber a thin plate leaves out; that difference is taken here.
 */
const xNPlattice = xCG - hpRef.c * D0.Cma / CLa;
const npShift = hkAVL.np - hkNP;
const xNP = xNPlattice + npShift;
const SM = (xNP - xCG) / hpRef.c;                /* on the plant's chord S/b */
const SMmac = (xNP - xCG) / mac;
const Cma = -CLa * SM;

/*
 * Drag: a component build up (Raymer, eq. 12.24), ESTIMATED. The wing's
 * skin friction at 2e5, 0.0060 for a taped foam surface part laminar, its
 * form factor 1 + 0.6 (t/c)/(x/c)m + 100 (t/c)^4 for a 9 percent section
 * with its thickest point at 0.25, times cos^0.28 of the sweep, on a
 * wetted area 2.04 S; the two winglets' 40 sq in a side at 0.008; the
 * canopy and motor tray 0.0015 and the pusher's interference 0.0010.
 */
const tc = 0.09;
const FF = (1 + 0.6 / 0.25 * tc + 100 * tc ** 4) * Math.cos(Math.atan(tanC4)) ** 0.28;
const Sv = (winglet.root + winglet.top) / 2 * winglet.h;           /* sq in, one winglet */
const CD0 = 0.0060 * FF * 2.04 + 0.008 * 2 * 2 * Sv / (S / (IN * IN)) + 0.0015 + 0.0010;
/* Oswald's e for a swept wing, Raymer eq. 12.49. */
const e = 4.61 * (1 - 0.045 * AR ** 0.68) * Math.cos(Math.atan(drawn.tanLE)) ** 0.15 - 3.1;
const k = 1 / (Math.PI * e * AR);

/* Yaw damping: the lattice's, plus the wing's profile drag, CD0 / 4. */
const Cnr = D.Cnr - CD0 / 4;

/*
 * The throws: 3/8 in each way on either stick, measured, as the 400-X's
 * manual says, an inch in from the tip, on the 1.5 in elevon; one set, no
 * dual rate. Surfaces clip at the aileron throw, the 1000 mm wing's
 * convention.
 */
const throwA = Math.asin(0.375 / flapC), throwE = throwA;

/*
 * The motor: zagi.com's "3100 Kv, 28 X 35mm, Brushless Inrunner" on 3S,
 * which "turns the prop over 22,000 rpm at only 30 amps in static
 * testing", on Zagi's 5 x 5 carbon prop, which the HP manual says the
 * system turns at 22,000 rpm. The shaft power is the motor's torque at 30
 * A times its speed, Kt (I - I0) omega, the no load current ESTIMATED at
 * 1.5 A; the static thrust, that power through the disc at an APC 5 x 5E's
 * figure of merit there (APC PER3_5x5E.dat: 0.553 at 22,000 rpm static,
 * where it absorbs 142 W; the spoon shaped carbon prop absorbs more). The
 * pitch speed is the plant's rule on the published loaded rpm.
 */
const kv = 3100, rpmLoaded = 22000, ampsStatic = 30, i0 = 1.5;
const propR = 2.5 * IN, pitchIn = 5;
const Kt = 60 / (2 * Math.PI * kv);
const omegaLoaded = rpmLoaded * 2 * Math.PI / 60;
const Pshaft = Kt * (ampsStatic - i0) * omegaLoaded;
const FOM = 0.553;
const Ts = Math.pow(Pshaft * FOM * Math.sqrt(2 * rho * Math.PI * propR * propR), 2 / 3);
const rpmNL = rpmLoaded / 0.85;
const Vp = rpmLoaded / 60 * pitchIn * IN;
const torqueArm = Kt * (ampsStatic - i0) / Ts;  /* shaft torque per newton */
/* The prop and the rotor as a gyroscope: the carbon blades 4 g each on
 * 63.5 mm, m L^2 / 3, the adapter and the inrunner's rotor 25 g at 6 mm,
 * m r^2 / 2, ESTIMATED. */
const jProp = 2 * 0.004 * propR * propR / 3 + 0.025 * 0.006 * 0.006 / 2;

/* Performance, the plant's own motor and drag model. */
const T = (V, d) => Math.max(0, Ts * d * d * (1 - V / (Vp * d)));
const Dr = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return q * S * (CD0 + k * CL * CL); };
const level = (d) => {
  let ok = false;
  for (let V = 6; V < 60; V += 0.1) if (T(V, d) > Dr(V)) ok = true;
  if (!ok) return null;
  let lo = 6, hi = 60;
  for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (T(mid, d) > Dr(mid)) lo = mid; else hi = mid; }
  return lo;
};
const CLopt = Math.sqrt(CD0 / k), LDmax = CLopt / (2 * CD0), Vmd = Math.sqrt(2 * W / (rho * S * CLopt));
const ld = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return CL / (CD0 + k * CL * CL); };
let best = { vz: -1, V: 0 };
for (let V = 8; V < 30; V += 0.02) { const vz = (T(V, 1) - Dr(V)) * V / W; if (vz > best.vz) best = { vz, V }; }
let minSink = { sink: 99, V: 0 };
for (let V = Vs * 1.05; V < 25; V += 0.01) { const s2 = V / ld(V); if (s2 < minSink.sink) minSink = { sink: s2, V }; }

/*
 * The trim, and Cm0: the manual's glide test, trims centred, "flies
 * straight ahead with a slow sink rate", so with the elevons neutral the
 * wing trims power off at its best glide's CL. The reflex is the
 * section's: the HP's elevons are set flush with the bottom of the wing.
 */
const Cm0 = -Cma * CLopt / CLa;
/* The elevon, the plant's signs (trailing edge up positive, nose up
 * positive), and the roll. */
const clDe = -D0.CLde, cmDe = -D0.Cmde, clDa = D.Clda;
const Clp = D.Clp, Cmq = D0.Cmq;
const Clb = D.Clb, Cnb = D.Cnb, CYb = D.CYb;
/* The plant takes the roll due to yaw and the yaw due to roll as a
 * multiple of the step's CL, and the elevons' adverse yaw likewise. */
const ClrPerCL = D.Clr / CLcruise, CnpPerCL = D.Cnp / CLcruise, CndaPerCL = D.Cnda / CLcruise;

/*
 * Mass and inertia, ESTIMATED: Zagi's 25.5 oz as the pack (a 3S 2200,
 * 180 g, CNHL's 30C), the motor (70 g) and its mount and canopy (25 g) at the bay
 * behind the CG, the ESC (35 g), two HS-81 servos (16.6 g, Hitec), the
 * receiver (10 g), the winglets (10 g each at the tips), and the rest the
 * EPP wing, spread as the section's area, chord squared. The pack slides
 * in its bay to balance at 8 in, as the manual says to do.
 */
const parts = {
  motor: { m: 0.070, x: 10.9 },
  mount: { m: 0.025, x: 10.0 },
  esc: { m: 0.035, x: 7.0 },
  servos: { m: 0.0166, x: 8.5 },
  rx: { m: 0.010, x: 5.5 },
  winglets: { m: 0.020, x: hp.le(24) + 3.0 },
};
const mPack = 0.180;
const mWing = m - mPack - Object.values(parts).reduce((s2, p) => s2 + p.m, 0);
const NW = 4000;
let wSum = 0, wX = 0, wIxx = 0, wIyy = 0;
for (let i = 0; i < NW; i += 1) {
  const y = 24 * (i + 0.5) / NW, cy = chordIn(y), w8 = cy * cy;
  /* A section's own centroid, 0.42 of its chord (a 9 percent section). */
  const xs = hp.le(y) + 0.42 * cy;
  wSum += w8; wX += w8 * xs; wIxx += w8 * y * y; wIyy += w8 * (xs * xs + cy * cy * 0.06);
}
const wingX = wX / wSum;
const others = Object.values(parts).reduce((s2, p) => s2 + p.m * p.x, 0);
const packX = (m * xCG - mWing * wingX - others) / mPack;
const toM = (xin) => (xCG - xin) * IN;      /* body x, forward of the CG, m */
const Ixx = mWing * (wIxx / wSum) * IN * IN + parts.winglets.m * (24 * IN) ** 2 + parts.servos.m * (3.5 * IN) ** 2 + 0.002;
const Iyy = mWing * ((wIyy / wSum) - 2 * wingX * xCG + xCG * xCG) * IN * IN
  + Object.values(parts).reduce((s2, p) => s2 + p.m * toM(p.x) ** 2, 0) + mPack * toM(packX) ** 2;
const Izz = Ixx + Iyy;

/* The strips past the stall: their chords over the mean chord, and the
 * Schrenk loading the plant gives each. */
const strips = [0.125, 0.375, 0.625, 0.875];
const stripC = strips.map((e2) => chordIn(e2 * 24) / hpRef.c);
const schrenk = strips.map((e2, i) => 0.5 * (1 + 4 / Math.PI * Math.sqrt(1 - e2 * e2) / stripC[i]));
/* The MH45 past its stall at the cruise's Reynolds number on the MAC,
 * between UIUC's 1e5 (held +2.5 deg, then 0.80) and 2e5 (+2.8, 0.92). */
const re = Vcruise * mac * IN * rho / 1.81e-5;
const fr = Math.min(1, Math.max(0, (re - 1e5) / 1e5));
const stallTop = 2.5 + (2.8 - 2.5) * fr, stallK = 0.80 + (0.92 - 0.80) * fr;
/* On a flying wing the lift of the linear model acts at the neutral
 * point: stall_arm_ac is minus the static margin; the flat plate's centre
 * of pressure 0.40 of the plant's chord behind the aerodynamic centre. */
const stallArmAc = -SM;
const stallArmCp = 0.40 - (0.25 - SM);
const stallAsym = 0.001 / c;

/* Roll: the steady rate of full elevon, pb/2V = -Clda da / Clp. */
const pb2v = -clDa * throwA / Clp;
const rollAt = (V) => pb2v * 2 * V / b * DEG;
/* Pitch: the short period from the plant's terms, the approximation
 * s^2 - (Mq + Zw) s + (Zw Mq - Ma) = 0. */
function shortPeriod(V) {
  const q = 0.5 * rho * V * V;
  const Zw = -q * S * CLa / (m * V);
  const Ma = q * S * c * Cma / Iyy, Mq = q * S * c * Cmq * c / (2 * V) / Iyy;
  const wn2 = Zw * Mq - Ma;
  const wn = Math.sqrt(wn2);
  const zeta = -(Mq + Zw) / (2 * wn);
  return { wn, zeta, period: zeta < 1 ? 2 * Math.PI / (wn * Math.sqrt(1 - zeta * zeta)) : null };
}
/* The steady pull a stick gives: the CL a radian of elevon trims to,
 * -Cm_de / Cm_alpha times CL_alpha plus its own lift, as g at a speed.
 * A tailless wing with a small margin has a large one: pitch sensitivity. */
const dclPerRad = -cmDe / Cma * CLa + clDe;
const gPerRad = (V) => 0.5 * rho * V * V * S * dclPerRad / W;
/* The elevon that holds the stall, from the cruise's trim. */
const deStall = (CLmax - CLopt) / dclPerRad;
/* A hand throw's speed: Zagi's "a good strong throw", 1.4 Vs. */
const Vthrow = 1.4 * Vs;
const turnR = (V) => V * V / (g * Math.tan(60 / DEG));

/* The hull, from the drawn planform, body frame m. */
const hull = { nose: toM(0), tipTE: toM(hp.te(24)), tipLE: toM(hp.le(24)), rootTE: toM(hp.te(0)) };

const f = (x, n = 4) => (x === null || x === undefined ? 'none' : Number(x).toFixed(n));
const rows = [
  ['lattice: rectangle A 5 CLa (Helmbold), x ac/c', `${f(rectD.CLa)} (${f(helmbold)}) ${f(-rectD.Cma / rectD.CLa)}`],
  ['lattice: 45 deg sweep A 5 CLa, NP per MAC', `${f(sweptD.CLa)} ${f((-sweptD.Cma / sweptD.CLa - sweptMacLE) / sweptMac)}`],
  ['Hendricks AVL: CLa Cma Clp Cmq', `${f(hkAVL.CLa)} ${f(hkAVL.Cma)} ${f(hkAVL.Clp)} ${f(hkAVL.Cmq)}`],
  ['   the lattice', `${f(hkD.CLa)} ${f(hkD.Cma)} ${f(hkD.Clp)} ${f(hkD.Cmq)}`],
  ['   AVL CYb Clb Cnb Cnr', `${f(hkAVL.CYb)} ${f(hkAVL.Clb)} ${f(hkAVL.Cnb)} ${f(hkAVL.Cnr)}`],
  ['   the lattice', `${f(hkD.CYb)} ${f(hkD.Clb)} ${f(hkD.Cnb)} ${f(hkD.Cnr)}`],
  ['   AVL CLde Cmde Clda per rad', `${f(hkAVL.CLde)} ${f(hkAVL.Cmde)} ${f(hkAVL.Clda)}`],
  ['   the lattice', `${f(hkD.CLde)} ${f(hkD.Cmde)} ${f(hkD.Clda)}`],
  ['   neutral point in (AVL, lattice)', `${f(hkAVL.np, 3)} ${f(hkNP, 3)}`],
  ['HP: b m, S m2, c=S/b, AR, m kg, W/S', `${f(b)} ${f(S, 5)} ${f(c, 5)} ${f(AR, 3)} ${f(m)} ${f(W / S, 2)}`],
  ['   root, tip in, taper, tan c/4, MAC in, MAC LE in, y MAC', `${f(cr, 3)} ${f(ct, 3)} ${f(taper)} ${f(tanC4)} ${f(mac, 3)} ${f(xMacLE, 3)} ${f(yMac, 3)}`],
  ['   CG per MAC; NP in: lattice (bare), shifted; SM on S/b, on MAC', `${f(hCG)} ${f(xNPlattice, 3)} (${f(bareNP, 3)}) ${f(xNP, 3)}; ${f(SM)} ${f(SMmac)}`],
  ['   the CRRC 8 1/4 and 8 1/2 in CGs, margin on MAC', `${f((xNP - 8.25) / mac)} ${f((xNP - 8.5) / mac)}`],
  ['   CLa, Cma, Cmq, CLq', `${f(CLa)} ${f(Cma)} ${f(Cmq)} ${f(D0.CLq)}`],
  ['   cl_de, cm_de (plant signs), Clda, Clp', `${f(clDe)} ${f(cmDe)} ${f(clDa)} ${f(Clp)}`],
  ['   CLmax, alpha stall deg, Vs; cruise V, CL, alpha deg', `${f(CLmax)} ${f(CLmax / CLa * DEG, 2)} ${f(Vs, 3)}; ${f(Vcruise, 3)} ${f(CLcruise)} ${f(alphaCruise * DEG, 2)}`],
  ['   FF, CD0, e, k', `${f(FF)} ${f(CD0)} ${f(e)} ${f(k)}`],
  ['   CYb, Clb, Cnb; Cnr (with CD0/4)', `${f(CYb)} ${f(Clb)} ${f(Cnb)}; ${f(Cnr)}`],
  ['   Clr, Cnp, Cnda; per CL', `${f(D.Clr)} ${f(D.Cnp)} ${f(D.Cnda)}; ${f(ClrPerCL)} ${f(CnpPerCL)} ${f(CndaPerCL)}`],
  ['   Cm0 (trim at best glide CL, elevons neutral)', `${f(Cm0)} (CL ${f(CLopt)})`],
  ['throws deg, rad', `${f(throwA * DEG)} ${throwA.toPrecision(17)}`],
  ['motor: Kt, omega, P shaft W, Ts N, T/W', `${f(Kt, 6)} ${f(omegaLoaded, 1)} ${f(Pshaft, 1)} ${f(Ts)} ${f(Ts / W, 3)}`],
  ['   rpm NL (rule), Vp m/s, torque arm m, J prop', `${f(rpmNL, 1)} ${f(Vp)} ${f(torqueArm, 5)} ${jProp.toPrecision(4)}`],
  ['level at 100, 75, 65, 50 percent', `${f(level(1), 2)} ${f(level(0.75), 2)} ${f(level(0.65), 2)} ${f(level(0.5), 2)}`],
  ['glide: L/D max at V; L/D at 12', `${f(LDmax, 2)} ${f(Vmd, 2)}; ${f(ld(12), 2)}`],
  ['min sink m/s at V', `${f(minSink.sink, 3)} ${f(minSink.V, 2)}`],
  ['best climb m/s at V', `${f(best.vz, 2)} ${f(best.V, 2)}`],
  ['roll pb/2V; deg/s at 12, 15, 20 m/s', `${f(pb2v)} ${f(rollAt(12), 0)} ${f(rollAt(15), 0)} ${f(rollAt(20), 0)}`],
  ['pitch: dCL per rad elevon; g per rad at 12, 15; stall elevon deg', `${f(dclPerRad, 3)} ${f(gPerRad(12), 2)} ${f(gPerRad(15), 2)} ${f(deStall * DEG, 2)}`],
  ['short period at 12, 15 m/s (wn, zeta, period)', `${JSON.stringify(shortPeriod(12), (kk, v) => (typeof v === 'number' ? +v.toFixed(3) : v))} ${JSON.stringify(shortPeriod(15), (kk, v) => (typeof v === 'number' ? +v.toFixed(3) : v))}`],
  ['throw speed 1.4 Vs, turn R at 60 deg at 15', `${f(Vthrow, 2)} ${f(turnR(15), 2)}`],
  ['masses: wing, pack; wing x, pack x in', `${f(mWing)} ${f(mPack)} ${f(wingX, 3)} ${f(packX, 3)}`],
  ['Inertia Ixx Iyy Izz', `${f(Ixx)} ${f(Iyy)} ${f(Izz)}`],
  ['hull m: nose, root TE, tip LE, tip TE', `${f(hull.nose)} ${f(hull.rootTE)} ${f(hull.tipLE)} ${f(hull.tipTE)}`],
  ['strips: c/cmean', stripC.map((x) => x.toFixed(4)).join(', ')],
  ['   Schrenk r', schrenk.map((x) => x.toFixed(4)).join(', ')],
  ['   Re, stall_top deg, stall_k', `${f(re, 0)} ${f(stallTop, 2)} ${f(stallK, 3)}`],
  ['   stall_arm_ac, stall_arm_cp, stall_asym', `${f(stallArmAc)} ${f(stallArmCp)} ${f(stallAsym, 5)}`],
];
for (const [name, v] of rows) {
  console.log(`${name.padEnd(62)} ${v}`);
}
