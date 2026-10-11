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
