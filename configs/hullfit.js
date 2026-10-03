/*
 * hullfit.js: where an aircraft's mid air hull is not its crash parts'
 * boxes as the plant has them, and why. The second input of
 * scripts/hulls-gen.js, which writes configs/hulls.js from dist/sim.wasm's
 * part table and then these.
 *
 * WHY THERE IS A SECOND INPUT. The rooms' referee (src/game/midair.js)
 * meets another aircraft with the parts the plant breaks, so a hit lands
 * on a part the plant has. But the audit (scripts/collide-audit-air.js,
 * hulls, --three) measured five airframes whose parts stand more than
 * 10 percent taller or shorter than the machine as drawn, and the drawing
 * is what the other pilot sees and aims at: a Zagi's prop disc hung 4 cm
 * under a belly nobody could see it under, and an Ugly Stik's wheels were
 * nothing at all. Changing src/native/crash_parts.h would change how
 * those parts meet the ground, which is flight (npm run crash:identity
 * holds flights byte identical), so a fit is made here, for the mid air
 * alone. Each keeps its part's index, so a hit still names the plant's
 * part and breaks it; it moves or grows a box, or marks a part that folds.
 *
 * Each entry: part, the index in the plant's table, and kind, its kind
 * (configs/parts.js PART_KINDS), which the generator checks; then either
 * min and max, the box as drawn (plant body frame, metres: x forward,
 * y left, z up, origin at the CG), read off the built meshes' bounding
 * boxes (src/render/craft.js, as the audit's --three reads them), or
 * folds: true, a prop the plant folds when its motor stops (the referee
 * leaves it out while the pose's motor reads zero, as the drawing does).
 *
 * Whether the plant's own boxes should follow the drawing too is a
 * flight change, and a decision of its own; each difference is named
 * below.
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

export const HULL_FIT = {
  /* The prop folds back along the nose when the motor stops, and the
   * drawing draws its disc only while it turns; the plant's disc is
   * always open, 8 cm under the nose. */
  radian2000: [
    { part: 11, kind: 'prop', folds: true },
  ],
  /* The pusher's hub is 52 mm over the CG on its pylon (zagicraft.js
   * PROP_Z), the plant's 10 mm, so the plant's disc hung 4 cm under the
   * belly: the motor and the disc as drawn, the motor's box down its
   * pylon. */
  zagi1219: [
    { part: 7, kind: 'motor', min: [-0.0977, -0.0138, 0.0060], max: [-0.0627, 0.0138, 0.0660] },
    { part: 8, kind: 'prop', min: [-0.1108, -0.0635, -0.0115], max: [-0.1096, 0.0635, 0.1155] },
  ],
  /* The plant's gear is the legs, the drawn one stands on wheels 4 cm
   * lower: each leg's box grown to take its wheel. */
  uglystik1567: [
    { part: 12, kind: 'gear', min: [-0.0698, 0, -0.2032], max: [0.0191, 0.2169, -0.053] },
    { part: 13, kind: 'gear', min: [-0.0698, -0.2169, -0.2032], max: [0.0191, 0, -0.053] },
    { part: 14, kind: 'gear', min: [0.2394, -0.02, -0.1955], max: [0.3092, 0.02, -0.053] },
  ],
};
