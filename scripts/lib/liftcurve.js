/*
 * liftcurve.js: the plant's lift curve for a whole wing, plant_wing.c
 * wing_lift (docs/FLIGHTMODEL.md, docs/STALL-STAGE1.md), formula for
 * formula, so a derivation predicts on the curve the plant flies: the
 * linear line, the parabola that leaves it below a stall_blend short of
 * the stall angle and tops out at CL max a stall_blend past it, CL max
 * held for stall_top and then falling to stall_k of it and on to the
 * plate (Viterna and Corrigan), all brought in over the stall blends the
 * plant uses. extra is the lift that rides on the wing's (the elevator's,
 * the flaps'); shift is the flaps' angle, dcl_f over CL alpha. fre is the
 * Reynolds number's share, 1 above the section data's reach and 0 under
 * it, where the plate is taken instead of the stalled section. It never
 * loads the plant. Harness arithmetic in JS maths, which is allowed here
 * because nothing it prints is hashed.
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

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/*
 * w: { cla, clmax, blend, top, k }, the table's cl_alpha, CL max (flaps'
 * and slats' in), stall_blend, stall_top and stall_k. alpha: the zero lift
 * line's angle, rad. Returns CL, and the blends: sigma (the plate's drag
 * and the stall's moments), past and fall, and the stalled lift clSt and
 * the curve short of it clOld, as the plant's cm_post reads them.
 */
export function wingLift(w, alpha, { extra = 0, shift = 0, fre = 1 } = {}) {
  const aStall = w.clmax / w.cla;
  const aw = alpha + shift;
  const aa = Math.abs(aw);
  const sigma = smooth(aStall - w.blend, aStall + w.blend, aa);
  const a0 = aStall - w.blend, a1 = aStall + w.blend;
  let wing = w.clmax;
  if (aa < a0) {
    wing = w.cla * aa;
  } else if (aa < a1) {
    wing = w.clmax - w.cla * (a1 - aa) * (a1 - aa) / (4 * w.blend);
  }
  const plate = 2 * Math.sin(alpha) * Math.cos(alpha);
  const peak = (aw < 0 ? -wing : wing) + extra;
  const sHi = smooth(a1, a1 + 2 * w.blend, aa);
  const clOld = (1 - sHi) * peak + sHi * plate;
  if (!(sigma > 0) || !(fre > 0)) {
    return { CL: clOld, sigma, past: 0, fall: 0, clSt: clOld, clOld };
  }
  const hold = aw < 0 ? w.clmax - extra : w.clmax + extra;
  const past = smooth(aStall, aStall + w.blend, aa);
  const s0 = aStall + w.top, s1 = s0 + 2 * w.blend;
  const fall = smooth(s0, s1, aa);
  let viterna = 0;
  if (Math.cos(alpha) > 0 && Math.abs(Math.sin(alpha)) > 0.05) {
    const st = Math.max(-0.5, Math.min(0.5, s1 - shift));
    const a2 = (w.k * hold - 2 * Math.sin(st) * Math.cos(st)) * Math.sin(st) / Math.cos(st) ** 2;
    viterna = a2 * Math.cos(alpha) ** 2 / Math.sin(alpha);
  }
  const clSt = (1 - fall) * (aw < 0 ? -1 : 1) * hold + fall * (plate + viterna);
  return { CL: clOld + fre * past * (clSt - clOld), sigma, past, fall, clSt, clOld };
}
