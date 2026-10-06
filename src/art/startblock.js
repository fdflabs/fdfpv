/*
 * startblock.js: the sizes of the launch stand a race starts from.
 *
 * A club start block is a small stand, not a floor tile: a base, two
 * wedge cheeks, two foam topped rails on a slope about 28 degrees up with
 * a gap between them for the battery, a brace at the back and a lip at the
 * low end so the craft does not slide off when the pilot tips it forward.
 * The world (src/render/scene.js) and the track builder's preview
 * (src/trackbuilder/view3d.js) both build it from these numbers, and the
 * builder may not import the simulator, so they live with the shared art.
 *
 * In the stand's own frame Y is up, X runs across the start line and +Z
 * back toward the spawn; the low end of the ramp, where the craft leaves,
 * is -Z. Nothing here imports three.
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

/* The stand drawn on the default 0.6 m pad, metres. A real timber stand is
 * nearer 0.25 m long; at a third person camera that vanishes in the grass,
 * so the default is larger at the same proportions. */
const DEFAULT_PAD = 0.6;
const ON_DEFAULT_PAD = {
  railLen: 0.38,
  railW: 0.056,
  gap: 0.10,
  wedgeT: 0.018,
  railT: 0.018,
  foamT: 0.011,
  baseH: 0.016,
  braceT: 0.022,
  braceH: 0.040,
  lipAlong: 0.030,
  lipH: 0.024,
};
const TILT = 28 * Math.PI / 180;

/* The smallest scale drawn. A whoop's 0.10 m pad asks for about 63 mm of
 * rail, a real foam launch pad as long as the machine on it; legibility
 * at field distances is not the question with the camera this close. */
const MIN_SCALE = 0.15;

/*
 * Every size of the stand for a pad of `padSize` metres (missing or not
 * positive means the default), plus what follows from them: how high the
 * rails rise, where the rails and cheeks sit across, the whole width and
 * the length along the slope.
 */
export function startBlockDims(padSize) {
  const pad = Number(padSize) > 0 ? padSize : DEFAULT_PAD;
  const k = Math.max(MIN_SCALE, pad / DEFAULT_PAD);
  const d = Object.fromEntries(Object.entries(ON_DEFAULT_PAD).map(([name, metres]) => [name, metres * k]));
  return {
    ...d,
    tilt: TILT,
    rise: d.railLen * Math.tan(TILT),
    railX: d.gap / 2 + d.railW / 2,
    wedgeX: d.gap / 2 + d.railW + d.wedgeT / 2,
    spanAcross: d.gap + 2 * d.railW + 2 * d.wedgeT,
    slopeLen: d.railLen / Math.cos(TILT),
  };
}

/*
 * Where a lone pilot is seated across a start grid of `dims.pads` stands
 * `dims.spacing` apart (1.5 m when not given): on the stand nearest the
 * middle, not at the grid's origin between two stands.
 */
export function startBlockLaneOffset(dims) {
  const pads = Math.max(1, Math.round(dims.pads || 1));
  const spacing = Number(dims.spacing) > 0 ? dims.spacing : 1.5;
  const middle = (pads - 1) / 2;
  return (Math.floor(middle) - middle) * spacing;
}
