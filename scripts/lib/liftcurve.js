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
 * w: { cla, clmax, blend, top, k, claWing, plateCn }, the table's
 * cl_alpha, CL max (flaps' and slats' in), stall_blend, stall_top, stall_k,
 * the wing's own slope cl_alpha_wing (the stall angle is CL max over it,
 * and the tail's share of the slope, cla less it, lifts on past the
 * wing's stall as the plant's sin cos term), cla where the table gives
 * none, and the finite wing's broadside normal force plateCnOf below.
 * alpha: the zero lift line's angle, rad. Returns CL, and the blends:
 * sigma (the plate's drag and the stall's moments), past and fall, and the
 * stalled lift clSt and the curve short of it clOld, as the plant's
 * cm_post reads them.
 */
export function wingLift(w, alpha, { extra = 0, shift = 0, fre = 1 } = {}) {
  if (!(w.plateCn > 0)) throw new Error('liftcurve: plateCn is the plant\'s plate_cn, plateCnOf(span, area)');
  const claW = w.claWing > 0 ? w.claWing : w.cla;
  const tail = (w.cla - claW) * Math.sin(alpha) * Math.cos(alpha);
  const aStall = w.clmax / claW;
  const aw = alpha + shift;
  const aa = Math.abs(aw);
  const sigma = smooth(aStall - w.blend, aStall + w.blend, aa);
  const a0 = aStall - w.blend, a1 = aStall + w.blend;
  let wing = w.clmax;
  if (aa < a0) {
    wing = claW * aa;
  } else if (aa < a1) {
    wing = w.clmax - claW * (a1 - aa) * (a1 - aa) / (4 * w.blend);
  }
  const plate = w.plateCn * Math.sin(alpha) * Math.cos(alpha);
  const peak = (aw < 0 ? -wing : wing) + extra;
  const sHi = smooth(a1, a1 + 2 * w.blend, aa);
  const clOld = (1 - sHi) * peak + sHi * plate;
  if (!(sigma > 0) || !(fre > 0)) {
    return { CL: clOld + tail, sigma, past: 0, fall: 0, clSt: clOld, clOld };
  }
  const hold = aw < 0 ? w.clmax - extra : w.clmax + extra;
  const past = smooth(aStall, aStall + w.blend, aa);
  const s0 = aStall + w.top, s1 = s0 + 2 * w.blend;
  const fall = smooth(s0, s1, aa);
  let viterna = 0;
  if (Math.cos(alpha) > 0 && Math.abs(Math.sin(alpha)) > 0.05) {
    const st = Math.max(-0.5, Math.min(0.5, s1 - shift));
    const a2 = (w.k * hold - w.plateCn * Math.sin(st) * Math.cos(st)) * Math.sin(st) / Math.cos(st) ** 2;
    viterna = a2 * Math.cos(alpha) ** 2 / Math.sin(alpha);
  }
  const clSt = (1 - fall) * (aw < 0 ? -1 : 1) * hold + fall * (plate + viterna);
  return { CL: clOld + fre * past * (clSt - clOld) + tail, sigma, past, fall, clSt, clOld };
}

/*
 * The finite wing's broadside normal force, plant_wing.c plate_cn: 1.11 +
 * 0.018 AR (Viterna and Janetzke, NASA TM-82944), not the infinite
 * plate's 2.0.
 */
export function plateCnOf(span, area) {
  const ar = span * span / area;
  return 1.11 + 0.018 * Math.min(ar, 50);
}

/*
 * The plant's drag at alpha, short of and past the stall blend
 * (plant_wing.c, no flaps): the linear wing's cd0 + k CL_lin^2 blended into
 * Viterna's CDmax sin^2 + B2 cos, B2 taking the drag at the stall angle,
 * cd0 + k CLmax^2 (NASA TM-82944 eqs. 15 and 17). Its B2 term for the
 * stalled moment's normal force is returned with it, and the plate's share
 * of the drag.
 */
export function wingDrag(w, alpha, { cd0, k, clLin }) {
  const lc = wingLift(w, alpha);
  const claW = w.claWing > 0 ? w.claWing : w.cla;
  const aS = w.clmax / claW;
  const b2 = (k * w.clmax * w.clmax - w.plateCn * Math.sin(aS) ** 2) / Math.cos(aS);
  const b2c = Math.cos(alpha) > 0 ? b2 * Math.cos(alpha) : 0;
  const cdFlat = cd0 + w.plateCn * Math.sin(alpha) ** 2 + b2c;
  /* cdPlate: the plate's share, which goes with the lift in a sideslip
   * (plant_wing.c, THE PLATE'S FORCE IN A SIDESLIP). */
  return { CD: (1 - lc.sigma) * (cd0 + k * clLin * clLin) + lc.sigma * cdFlat, b2c, sigma: lc.sigma, cdPlate: lc.sigma * (w.plateCn * Math.sin(alpha) ** 2 + b2c) };
}
