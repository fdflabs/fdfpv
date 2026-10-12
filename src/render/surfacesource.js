/*
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

/*
 * The shell's answer to "how big are this aircraft's control surfaces":
 * a function of an airframe id returning configs/surfaces.js surfaceGrowth,
 * { a, e, r } chord ratios, or null for stock, which the craft builders
 * take as opts.surfaces. Null until the shell sets it, so a model built
 * by a check or a page with no settings has stock surfaces. The hangar's
 * Surfaces tab shows a choice before it is saved through a preview, which
 * wins over the source while it is set.
 */
let source = null;
const previews = new Map();

export function setSurfacesSource(fn) {
  source = typeof fn === 'function' ? fn : null;
}

export function previewSurfaces(airframeId, growth) {
  if (growth === undefined) {
    previews.delete(airframeId);
  } else {
    previews.set(airframeId, growth);
  }
}

export function surfacesFor(airframeId) {
  if (previews.has(airframeId)) {
    return previews.get(airframeId);
  }
  return source ? source(airframeId) : null;
}

/* How long each moving surface is drawn along the chord, metres, for the
 * checks: its mesh's own box under the pivot, whatever the pose. */
export function drawnChords(group) {
  const out = {};
  for (const name of ['aileron-right', 'elevator', 'rudder']) {
    const pivot = group.getObjectByName(name);
    const mesh = pivot ? pivot.children.find((c) => c.isMesh) : null;
    if (mesh) {
      mesh.geometry.computeBoundingBox();
      out[name] = mesh.geometry.boundingBox.max.z - mesh.geometry.boundingBox.min.z;
    }
  }
  return out;
}
