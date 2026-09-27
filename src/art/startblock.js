/*
 * startblock.js: the launch stand a 5 inch race actually uses.
 *
 * WHAT THIS IS. A MultiGP start block is not a floor tile. It is a small
 * wooden (or powder coated aluminium) stand with TWO PARALLEL RAILS, a gap
 * down the middle for the battery, foam on the rails so the front arms
 * grip, and a lip at the low end so the craft does not slide off when the
 * pilot pitches it forward. GetFPV's DIY writeup is the n-shaped timber
 * version (two 25 cm rails, about 9 cm apart, foam on top). The printed
 * "start block" stands add a 25 to 30 degree tilt and triangular side
 * plates. This mesh is that object: a plywood base, two wedge cheeks, two
 * foam-topped rails on the slope, a rear brace, and a front lip.
 *
 * WHY IT IS SHARED AND WHY IT LIVES HERE. src/render/scene.js dresses the
 * world with it and src/trackbuilder/view3d.js dresses the author's preview
 * with it, so a stand on the field and a stand in the builder are the same
 * shape. The builder is not allowed to import the simulator, so the mesh
 * cannot live in src/render. It is not a course dimension (those stay in
 * elements.js as pads, spacing, padSize) and it is not the game: it is the
 * art both of them draw from.
 *
 * LOCAL FRAME, Y up, matching Three.js. +X is across the start line, +Y is
 * up, +Z is toward the spawn (behind the line). The low end of the ramp is
 * -Z, which is the way the quad sets off. Callers that live in a Z-up
 * document rotate the returned group once; they do not rebuild the parts.
 *
 * THREE.JS IS PASSED IN. view3d.js loads Three lazily so a dead CDN cannot
 * take the 2D authoring view down with it. This file must not import three.
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


/*
 * The stand's own sizes, scaled so a default 0.6 m pad footprint still
 * holds a readable object. Real timber is closer to 0.25 m by 0.19 m; at
 * the third person camera that disappears into the grass, so the default
 * is a touch larger with the same proportions.
 */
/*
 * THE FLOOR CAME DOWN FROM 0.4 TO 0.15 FOR THE WHOOP.
 *
 * 0.4 is not a mesh safety limit, it is the note above this: a stand at real
 * timber sizes disappears into the grass at the third person camera, so the
 * smallest one ever DRAWN was kept legible. That reasoning is about a 60 m
 * field and a camera four metres behind a quad that sweeps 0.35 m.
 *
 * A RaceGOW start pad is 0.10 m, which under the old floor came out at 0.4
 * and therefore 0.152 m of rail: a launch stand twice as long as the whole
 * aircraft, on a floor where the camera is two hundred millimetres away.
 * The legibility argument runs the other way at that distance. 0.15 lets a
 * 0.10 m pad ask for what it is, about 63 mm of rail, which is a real foam
 * launch pad and is the same size as the machine standing on it.
 */
export function startBlockDims(padSize) {
  const k = Math.max(0.15, (Number(padSize) > 0 ? padSize : 0.6) / 0.6);
  const railLen = 0.38 * k;
  const tilt = 28 * Math.PI / 180;
  const railW = 0.056 * k;
  const gap = 0.10 * k;
  const wedgeT = 0.018 * k;
  return {
    railLen,
    tilt,
    rise: railLen * Math.tan(tilt),
    railW,
    gap,
    wedgeT,
    railT: 0.018 * k,
    foamT: 0.011 * k,
    baseH: 0.016 * k,
    braceT: 0.022 * k,
    braceH: 0.040 * k,
    lipAlong: 0.030 * k,
    lipH: 0.024 * k,
    railX: gap / 2 + railW / 2,
    wedgeX: gap / 2 + railW + wedgeT / 2,
    spanAcross: gap + 2 * railW + 2 * wedgeT,
    slopeLen: railLen / Math.cos(tilt),
  };
}


/*
 * Which lane a lone pilot sits on: the pad nearest the middle of the
 * grid. Four pads at 1.5 m are not a single point, and parking at the
 * element's own origin put the craft in the grass between two stands.
 */
export function startBlockLaneOffset(dims) {
  const n = Math.max(1, Math.round(dims.pads || 1));
  const spacing = Number(dims.spacing) > 0 ? dims.spacing : 1.5;
  const i = Math.floor((n - 1) / 2);
  return (i - (n - 1) / 2) * spacing;
}

