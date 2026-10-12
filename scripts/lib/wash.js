/*
 * wash.js: a propeller's slipstream over the tail and the ailerons by
 * momentum theory, the arithmetic behind the plant's slip_* terms
 * (FixedWingParams in src/native/sim_internal.h, plant_wing.c, revived
 * from the removed Extra 300's, docs/EXTRA-STAGE1.md in git at 1c0872b3^,
 * and docs/FLIGHTMODEL.md). shares() turns an aircraft's drawn geometry
 * into the table's slip_* numbers with scripts/pitts-derive.js's formulas
 * (in git at 1c0872b3^); wash() is the plant's own disc, contraction and
 * shares, formula for formula, so a derivation can put the wash into what
 * it predicts. It never loads the plant. Harness arithmetic in JS maths,
 * which is allowed here because nothing it prints is hashed.
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

const RHO = 1.225;

/*
 * THE STATIC SLIPSTREAM AT THE TAIL. Deters, Ananda and Selig 2015,
 * "Slipstream Measurements of Small-Scale Propellers at Low Reynolds
 * Numbers", AIAA 2015-2265: seven hole probe surveys behind small props.
 * Static, the jet spreads 6 to 8 deg from x/D 0.5 and its peak moves in to
 * the axis; at J 0.52 (fig. 22a) the slipstream holds its far wake speed
 * V + 2 v_i to x/D 3, the furthest station, as Stuper (NACA TM 874, fig.
 * 25) found to x/D 2. The static axial speed over 2 v_i against y/R, read
 * from the PDF's own plotted paths (~/Desktop/fdfpv-loop/research/wash-speed/,
 * digitise.py): the GWS 5 x 4.3 at 5,000 rpm, C_T0 0.15 (fig. 15a), and the
 * APC 4.2 x 2 at 9,000 rpm, C_T0 0.082 (fig. 17a), Re about 22,000 at
 * 0.75 R. Each profile's momentum flux closes on its measured thrust
 * within 11 percent, but for the APC's at x/D 3, 0.70 (its survey stops at
 * 1.19 R), which is left out.
 */
const STATIC_WAKE = [
  [1, [
    [[0, 0.679], [0.05, 0.719], [0.099, 0.809], [0.15, 0.881], [0.199, 0.835], [0.25, 0.876], [0.3, 1.056], [0.349, 1.051], [0.4, 1.079], [0.449, 1.072],
      [0.5, 1.034], [0.549, 0.945], [0.599, 0.877], [0.65, 0.703], [0.699, 0.621], [0.75, 0.442], [0.799, 0.372], [0.849, 0.227], [0.9, 0.173], [0.949, 0.113]],
    [[0, 0.668], [0.059, 0.842], [0.118, 0.937], [0.178, 1.054], [0.238, 1.114], [0.297, 1.147], [0.357, 1.14], [0.416, 1.158], [0.475, 1.092], [0.535, 0.962],
      [0.595, 0.808], [0.654, 0.664], [0.714, 0.579], [0.773, 0.444], [0.833, 0.313], [0.892, 0.247]],
  ]],
  [2, [
    [[0, 0.709], [0.05, 0.765], [0.099, 0.787], [0.15, 0.855], [0.199, 0.895], [0.25, 0.944], [0.3, 0.961], [0.349, 0.952], [0.4, 0.963], [0.449, 0.914],
      [0.5, 0.842], [0.549, 0.834], [0.599, 0.736], [0.65, 0.668], [0.699, 0.661], [0.75, 0.522], [0.799, 0.496], [0.849, 0.457], [0.9, 0.362], [0.949, 0.359],
      [1, 0.282], [1.05, 0.306], [1.099, 0.246], [1.15, 0.215], [1.199, 0.244]],
    [[0, 0.853], [0.059, 0.885], [0.118, 0.965], [0.178, 1.019], [0.238, 1.005], [0.297, 1.007], [0.357, 0.954], [0.416, 0.923], [0.475, 0.863], [0.535, 0.785],
      [0.595, 0.697], [0.654, 0.637], [0.714, 0.561], [0.773, 0.511], [0.833, 0.411], [0.892, 0.388], [0.952, 0.317], [1.011, 0.281], [1.071, 0.218], [1.131, 0.178]],
  ]],
  [3, [
    [[0, 0.745], [0.099, 0.791], [0.15, 0.796], [0.199, 0.807], [0.25, 0.814], [0.3, 0.814], [0.349, 0.806], [0.4, 0.788], [0.449, 0.789], [0.5, 0.783],
      [0.549, 0.718], [0.599, 0.645], [0.65, 0.678], [0.699, 0.633], [0.75, 0.537], [0.799, 0.522], [0.849, 0.526], [0.9, 0.465], [0.949, 0.426], [1, 0.391],
      [1.05, 0.367], [1.099, 0.333], [1.15, 0.29], [1.199, 0.252], [1.25, 0.266], [1.3, 0.228], [1.349, 0.203], [1.4, 0.187], [1.449, 0.156]],
  ]],
];

/* The integral of (u / 2 v_i)^2 from the axis out to y (in R) over one
 * profile, straight between its points; past the last the jet has ended. */
function q2(p, y) {
  let s = 0;
  for (let i = 1; i < p.length && p[i - 1][0] < y; i += 1) {
    const [y0, u0] = p[i - 1], [y1, u1] = p[i];
    const ye = Math.min(y, y1), ue = u0 + (u1 - u0) * (ye - y0) / (y1 - y0);
    s += 0.5 * (u0 * u0 + ue * ue) * (ye - y0);
  }
  return s;
}

/*
 * The share of the plant's far wake excess dynamic pressure, dp over the
 * contracted radius R / sqrt 2, that a surface through the static jet's
 * axis meets: from lo below the axis to hi above it, in R, xd prop
 * diameters behind the disc. The measured q integral over the surface's
 * own span against the plant's, the profiles at each station averaged,
 * straight between the stations and held past x/D 1 and 3, the last
 * FITTED: no survey goes further. A surface outside the contracted wash
 * altogether keeps 1, there being nothing of the plant's to scale.
 */
export function tailKeep(xd, lo, hi) {
  const plant = Math.min(lo, Math.SQRT1_2) + Math.min(hi, Math.SQRT1_2);
  if (!(plant > 0)) return 1;
  const at = STATIC_WAKE.map(([x, ps]) => [x, ps.reduce((s, p) => s + (q2(p, lo) + q2(p, hi)) / plant, 0) / ps.length]);
  if (xd <= at[0][0]) return at[0][1];
  for (let i = 1; i < at.length; i += 1) {
    if (xd <= at[i][0]) return at[i - 1][1] + (at[i][1] - at[i - 1][1]) * (xd - at[i - 1][0]) / (at[i][0] - at[i - 1][0]);
  }
  return at[at.length - 1][1];
}

/*
 * THE STATIC SWIRL AT THE FIN, the same surveys (figs. 15a and 15b): the
 * GWS's axial speed times its swirl, u v, over the plant's 2 v_i times
 * Omega R, Omega the plant's solid body 2 Q / (mdot rw^2) on the paper's
 * C_P0 0.080, on a 0.05 R grid from the axis out to where both surveys end
 * (~/Desktop/fdfpv-loop/research/wash-speed/swirlprofile.py). Its angular
 * momentum closes on the torque at x/D 0.5 and 1 (1.06, 0.98); at 2 and 3
 * it closes 0.72 and 0.61, the shortfall at the large radii past 1.45 R
 * and the probe's 56 deg, where no fin is, so the fin's integral stands.
 * The APC's swirl brackets it (its C_P read off fig. 16, ESTIMATED) and is
 * left out.
 */
const STATIC_SWIRL = [
  [0.5, [0.0961, 0.178, 0.2544, 0.2945, 0.331, 0.4434, 0.5496, 0.5336, 0.3668, 0.4799, 0.4936, 0.553, 0.5264, 0.4118, 0.3927, 0.1784, 0.0673]],
  [1, [0.0496, 0.2191, 0.2832, 0.363, 0.3529, 0.3814, 0.5099, 0.5515, 0.4978, 0.5234, 0.452, 0.4312, 0.4369, 0.3526, 0.2202, 0.1355, 0.1239, 0.0421, 0.0283]],
  [2, [0.1412, 0.2265, 0.2218, 0.3104, 0.3017, 0.3409, 0.3175, 0.3046, 0.2532, 0.263, 0.2221, 0.1805, 0.1761, 0.151, 0.1355, 0.0829, 0.0877, 0.0817, 0.0564,
    0.0636, 0.0359, 0.0405, 0.0173, 0.0159]],
  [3, [0.1278, 0.175, 0.1941, 0.2243, 0.2005, 0.194, 0.1887, 0.1624, 0.1558, 0.1328, 0.1243, 0.1247, 0.109, 0.0947, 0.0938, 0.0831, 0.0812, 0.0626, 0.0605,
    0.0449, 0.0447, 0.0282, 0.0308, 0.0193, 0.0076, 0.0141, 0.0103, 0.0054, 0.0056]],
];

/* The integral of one u v profile from the axis out to y (in R). */
function uv(g, y) {
  let s = 0;
  for (let i = 1; i < g.length && 0.05 * (i - 1) < y; i += 1) {
    const ye = Math.min(y, 0.05 * i), ge = g[i - 1] + (g[i] - g[i - 1]) * (ye - 0.05 * (i - 1)) / 0.05;
    s += 0.5 * (g[i - 1] + ge) * (ye - 0.05 * (i - 1));
  }
  return s;
}

/*
 * The share of the plant's swirl force a fin through the static jet's axis
 * meets, from lo below the axis to hi above it (in R), xd prop diameters
 * behind the disc: the swirl blows the two sides opposite ways, so each is
 * the integral above less the integral below, the measured over the
 * plant's solid body inside R / sqrt 2. Straight between the stations,
 * held before x/D 0.5 and past 3, the last FITTED. A fin whose wash the
 * plant gives no net swirl keeps 1.
 */
export function swirlKeep(xd, lo, hi) {
  const a = Math.min(hi, Math.SQRT1_2), b = Math.min(lo, Math.SQRT1_2);
  const plant = (a * a - b * b) / 2;
  if (!(Math.abs(plant) > 1e-9)) return 1;
  const at = STATIC_SWIRL.map(([x, g]) => [x, (uv(g, hi) - uv(g, lo)) / plant]);
  if (xd <= at[0][0]) return at[0][1];
  for (let i = 1; i < at.length; i += 1) {
    if (xd <= at[i][0]) return at[i - 1][1] + (at[i][1] - at[i - 1][1]) * (xd - at[i - 1][0]) / (at[i][0] - at[i - 1][0]);
  }
  return at[at.length - 1][1];
}

/*
 * The table's slip_* from the drawn geometry. g: propR, the prop's radius;
 * S, b, the wing's reference; Sh, bh, the stabiliser's area and span; Sv,
 * the fin's area; hv, the fin's height over and under the thrust line; ya,
 * the ailerons' inner and outer stations; at and av, the stabiliser's and
 * fin's lift slopes; eta, the tail's dynamic pressure ratio; deda, the
 * downwash; VH and VV, the tail volumes; lv, the fin's arm; ClbFin, the
 * fin's roll per sideslip; a0, the body's angle of attack at the cruise
 * trim, where the stabiliser is taken to carry no lift (cm_0 is set for
 * it, so the wash leaves the trim where it was); xh and xv, the
 * stabiliser's and the fin's quarter chords behind the disc, m, whose
 * static wash slip_loss takes (tailKeep).
 */
export function shares(g) {
  return {
    slip_r: g.propR,
    slip_yh: g.bh / 2,
    slip_hv: g.hv,
    slip_ya: g.ya,
    slip_a0: g.a0,
    slip_cl_a: g.at * (g.Sh / g.S) * g.eta * (1 - g.deda),
    slip_cm_a: -g.eta * g.VH * g.at * (1 - g.deda),
    slip_cn_b: g.av * g.VV,
    slip_cn_r: -2 * g.av * g.VV * g.lv / g.b,
    slip_cy_b: -g.av * g.Sv / g.S,
    slip_cl_b: g.ClbFin,
    slip_loss: slipLoss(g),
  };
}

/* The table's slip_loss from shares()'s propR, bh, hv, xh and xv: the
 * stabiliser's dp, the fin's, and the fin's swirl. */
export function slipLoss(g) {
  const D = 2 * g.propR, yh = g.bh / 2 / g.propR, lo = g.hv[1] / g.propR, hi = g.hv[0] / g.propR;
  return [1 - tailKeep(g.xh / D, yh, yh), 1 - tailKeep(g.xv / D, lo, hi), 1 - swirlKeep(g.xv / D, lo, hi)];
}

/*
 * The share of dp the stabiliser's and the fin's controls meet, keepH and
 * keepV, and of the swirl the fin meets, keepS, a table's slip_loss
 * weighted by the jet's mixing ratio v_i / (u + v_i), and the wash's
 * speed over each surface, vwH and vwV, whose dynamic
 * pressure is the free stream's and that share of dp (plant_wing.c, the
 * wash at the tail).
 */
export function tailWash(loss, vi, u) {
  const lam = vi / (u + vi), ex = 4 * vi * (u + vi);
  const keepH = 1 - loss[0] * lam, keepV = 1 - loss[1] * lam, keepS = 1 - loss[2] * lam;
  return { keepH, keepV, keepS, vwH: Math.sqrt(u * u + keepH * ex), vwV: Math.sqrt(u * u + keepV * ex) };
}

/*
 * The wash at thrust T (N) and forward speed u (m/s) for a table's slip_*:
 * the disc's pressure jump dp, the induced speed vi, the contracted radius
 * rw, and the stabiliser's, fin's and ailerons' shares fh, fv and fa, as
 * plant_wing.c takes them; and tailWash()'s keepH, keepV, vwH and vwV.
 */
export function wash(slip, T, u) {
  const up = Math.max(0, u);
  const dp = T / (Math.PI * slip.slip_r * slip.slip_r);
  const vi = 0.5 * (Math.sqrt(up * up + 2 * dp / RHO) - up);
  const rw = slip.slip_r * Math.sqrt((up + vi) / (up + 2 * vi));
  const fh = Math.min(1, rw / slip.slip_yh);
  const [h0, h1] = slip.slip_hv;
  const fv = (Math.min(rw, h0) + Math.min(rw, h1)) / (h0 + h1);
  const [y0, y1] = slip.slip_ya;
  const ye = Math.min(rw, y1);
  const fa = rw > y0 ? (ye * ye - y0 * y0) / (y1 * y1 - y0 * y0) : 0;
  return { dp, vi, rw, fh, fv, fa, ...tailWash(slip.slip_loss, vi, up) };
}

/* A control's gain in the wash over the free stream's alone at speed V:
 * the elevator's with share fh, the rudder's with fv. */
export function gain(dp, share, V) {
  return 1 + dp * share / (0.5 * RHO * V * V);
}

/*
 * A table as the plant has it, read from src/native/plant_wing.c: its
 * numeric fields, scalars and { } arrays, WING_PI expressions evaluated;
 * and the plant's SWIRL_KEEP. For a
 * derivation that puts the prop's torque and swirl into what it predicts.
 */
const PLANT_WING = new URL('../../src/native/plant_wing.c', import.meta.url);
export function planeTable(name) {
  const src = readFileSync(PLANT_WING, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const body = new RegExp(`const FixedWingParams ${name} = \\{([\\s\\S]*?)\\n\\};`).exec(src)[1];
  const num = (e) => Function('WING_PI', `return (${e});`)(Math.PI);
  const out = {};
  for (const m of body.matchAll(/\.(\w+)\s*=\s*(\{[^}]*\}|[^,{}\n]+),/g)) {
    const e = m[2].trim();
    if (e.startsWith('{')) out[m[1]] = e.slice(1, -1).split(',').map((x) => x.trim()).filter(Boolean).map(num);
    else if (/^[-+*/().\s\dWING_PIe]+$/.test(e)) out[m[1]] = num(e);
  }
  const keep = Number(/#define SWIRL_KEEP ([\d.]+)/.exec(src)[1]);
  return { fw: new Proxy(out, { get: (o, k) => (k in o ? o[k] : 0) }), keep };
}

/* A curve at mu, plant_wing.c prop_curve: straight between the tenths and
 * on along the last two. */
function curveAt(c, mu) {
  const x = Math.max(0, mu) * 10, i = Math.min(c.length - 2, Math.floor(x));
  return c[i] + (x - i) * (c[i + 1] - c[i]);
}

/*
 * The prop's steady moments on the airframe at a driven speed n (of full)
 * and forward speed u, wings level, no sideslip and no rates, as
 * plant_wing.c takes them: the prop's torque Q = Q_f n^2 torque_curve against
 * the airframe; the wing root's (1 - SWIRL_KEEP) of it back; the swirl at
 * the fin, a sideways speed SWIRL_KEEP Q (up - dn) / (mdot rw^2), through
 * the fin's slip terms. Aero convention: L roll right, N nose right, Y to
 * the right, N m and N.
 */
export function propMoments(t, n, u) {
  const fw = t.fw;
  const mu = Math.max(0, u) / (fw.pitch_speed * n);
  const T = Math.max(0, fw.thrust_static * n * n * curveAt(fw.axial_curve, mu));
  const Q = fw.torque_arm * fw.thrust_static * n * n * curveAt(fw.torque_curve, mu);
  if (!(fw.slip_r > 0) || !(T > 0)) return { L: -Q, N: 0, Y: 0, Q, T };
  const w = wash(fw, T, u);
  const up = Math.max(0, u);
  const mdot = RHO * Math.PI * fw.slip_r * fw.slip_r * (up + w.vi);
  const keep = fw.slip_pusher ? 1 : t.keep;
  const xs = w.keepS * keep * Q * (Math.min(w.rw, fw.slip_hv[0]) - Math.min(w.rw, fw.slip_hv[1])) / (mdot * w.rw * w.rw);
  const kv = RHO * w.vi * w.fv;
  /* The swirl meets the whole stream, 1/2 rho (u + 2 v_i) per unit of it,
   * as plant_wing.c takes it. */
  const xb = -xs * (up + 2 * w.vi) / (2 * w.vi);
  return {
    L: -Q + fw.area * fw.span * kv * fw.slip_cl_b * xb + (1 - keep) * Q,
    N: fw.area * fw.span * kv * fw.slip_cn_b * xb,
    Y: fw.area * kv * fw.slip_cy_b * xb,
    Q, T,
  };
}
