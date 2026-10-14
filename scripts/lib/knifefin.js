/*
 * knifefin.js: the fin and rudder in a knife edge as plant_wing.c flies
 * them on a hi_alpha table, for the knife edge derivations (extra, cap580,
 * slick and nighttimber-derive.js). Their balance took the rudder as
 * Cndr dr and the fin as its linear Cnb, where the plant puts the fin's
 * angle and the rudder's equivalent angle on one surface that saturates on
 * a flat plate's normal force (plate_ratio, tail_cn), in the free stream on
 * the sideslip and in the wash on its own angle, the crossflow over the
 * speed the wash reaches the fin at. The linear form asked 93 percent of
 * the Extra's rudder where the plant ran out at full (w38-crossflow-moment).
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

const plate = (x, cn) => x / Math.sqrt(Math.sqrt(1 + (x / cn) ** 4));

/*
 * The fin's yawing moment and side force, N m and N, with the rudder at dr
 * rad, flying at V with sin(beta) sb and the body's axial speed u in the
 * wash w (scripts/lib/wash.js). f: the table's fin, { av: tail_av, cn:
 * tail_cn, cnb: slip_cn_b, cyb: slip_cy_b, cndr: cn_dr, cydr: cy_dr }, per
 * radian on the wing's S and b. The free stream's share is the plant's
 * cnb - slip_cn_b (1 - rv) and cn_dr rv, rv on tail_av sb + ar; the
 * wash's is rho v_i fv on the crossflow and dp keep fv on the rudder,
 * each times its own rv.
 *
 * With the prop's jet normal force (jet: { kj: jet_kj, R: slip_r, x:
 * prop_x, T: thrust }), as plant_wing.c has it (Selig, AIAA 2010-7938,
 * eqs. 13 to 16): the disc takes k_j rho A w0 v_i / (u + v_i) of the
 * sideways speed as a force at prop_x, which yaws the nose with the
 * sideslip and lifts with the body's side force; and the wash the fin
 * meets keeps 1 - k_j w0 v_i / (u + v_i)^2 of the crossflow, the share
 * the disc has turned onto its axis (w38-hover-yaw).
 *
 * With the prop's swirl at the fin (xs, m/s: wash.js finSwirl's xs, the
 * swirl's mean sideways speed over the fin's span in the wash), as
 * plant_wing.c takes it: the fin's angle in the wash, which saturates it,
 * is the crossflow less the swirl's own speed, and its force meets the
 * swirl on the whole stream, xs (u + 2 v_i) / (2 v_i) (Deters, Ananda and
 * Selig 2015, AIAA 2015-2265, fig. 22b). Left out until 2026-10-13, it
 * was the one term of the plant's knife edge yaw budget the derivation
 * lacked (scripts/knife-budget.js): 0.17 N m of the Extra's 13 at E12,
 * 1.1 of the CAP's 31 at C12 and 4.8 of the Slick's 205 at S12, two
 * percent of the rudder's throw on each of the last two. Zero keeps the
 * arithmetic as it was.
 */
export function knifeFin(f, { rho, V, u, sb, w, S, b, jet = null, xs = 0 }, dr) {
  const qb = 0.5 * rho * V * V;
  const vv = f.cnb / f.av;
  const ar = f.cndr * dr / vv;
  const x = f.av * sb + ar;
  const rv = x === 0 ? 1 : plate(x, f.cn) / x;
  let k = 0, turned = 0;
  if (jet && jet.kj > 0 && jet.T > 0) {
    const A = Math.PI * jet.R * jet.R;
    const w0 = Math.sqrt(jet.T / (2 * rho * A));
    k = jet.kj * rho * A * w0 * w.vi / (u + w.vi);
    turned = jet.kj * w0 * w.vi / ((u + w.vi) * (u + w.vi));
  }
  const vw = V * sb * (1 - turned) - xs;
  const vwF = V * sb * (1 - turned) - xs * (u + 2 * w.vi) / (2 * w.vi);
  const xw = f.av * vw / Math.sqrt(u * u + w.keepV * 4 * w.vi * (u + w.vi)) + ar;
  const rw = xw === 0 ? 1 : plate(xw, f.cn) / xw;
  const n = qb * S * b * (f.cnb * sb + f.cndr * dr) * rv
    + S * b * (rho * w.vi * w.fv * f.cnb * vwF + w.dp * w.keepV * w.fv * f.cndr * dr) * rw
    - (jet ? jet.x : 0) * k * V * sb;
  const y = qb * S * (f.cyb * sb + f.cydr * dr) * rv
    + S * (rho * w.vi * w.fv * f.cyb * vwF + w.dp * w.keepV * w.fv * f.cydr * dr) * rw
    - k * V * sb;
  return { n, y, rv, rw };
}

/* The rudder that zeroes the yawing moment rest + the fin's, by bisection
 * out to three throws either way: the moment rises with the rudder's
 * equivalent angle through the plate's whole curve. */
export function knifeRudder(f, p, rest, throwR) {
  let lo = -3 * throwR, hi = 3 * throwR;
  const sum = (dr) => rest + knifeFin(f, p, dr).n;
  if (Math.sign(sum(lo)) === Math.sign(sum(hi))) return null;
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    if (Math.sign(sum(mid)) === Math.sign(sum(lo))) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
