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
 * The table's slip_* from the drawn geometry. g: propR, the prop's radius;
 * S, b, the wing's reference; Sh, bh, the stabiliser's area and span; Sv,
 * the fin's area; hv, the fin's height over and under the thrust line; ya,
 * the ailerons' inner and outer stations; at and av, the stabiliser's and
 * fin's lift slopes; eta, the tail's dynamic pressure ratio; deda, the
 * downwash; VH and VV, the tail volumes; lv, the fin's arm; ClbFin, the
 * fin's roll per sideslip; a0, the body's angle of attack at the cruise
 * trim, where the stabiliser is taken to carry no lift (cm_0 is set for
 * it, so the wash leaves the trim where it was).
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
  };
}

/*
 * The wash at thrust T (N) and forward speed u (m/s) for a table's slip_*:
 * the disc's pressure jump dp, the induced speed vi, the contracted radius
 * rw, and the stabiliser's, fin's and ailerons' shares fh, fv and fa, as
 * plant_wing.c takes them.
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
  return { dp, vi, rw, fh, fv, fa };
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
  const xs = keep * Q * (Math.min(w.rw, fw.slip_hv[0]) - Math.min(w.rw, fw.slip_hv[1])) / (mdot * w.rw * w.rw);
  const kv = RHO * w.vi * w.fv;
  const xb = -xs;
  return {
    L: -Q + fw.area * fw.span * kv * fw.slip_cl_b * xb + (1 - keep) * Q,
    N: fw.area * fw.span * kv * fw.slip_cn_b * xb,
    Y: fw.area * kv * fw.slip_cy_b * xb,
    Q, T,
  };
}
