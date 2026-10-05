/*
 * tint.js: per instance colours that reach only the parts they belong to,
 * for the Interior's instanced people and vehicles (figures.js,
 * vehicles.js). three's instanceColor multiplies every vertex of an
 * instance, so a dark olive shirt would darken the face and the boots
 * with it and a red tank would redden the tyres. Here each vertex says
 * which slot paints it (its `slot` attribute: 0 its own colour only, 1
 * the instance colour, 2 and 3 two more per instance colours, `tintB`
 * and `tintC`), and the vertex colour is multiplied by that slot alone.
 *
 * The patch runs after color_vertex, so the thermal chunk's own lines in
 * it (src/render/thermal.js) are untouched and the visible albedo it
 * reads in the fragment is the tinted one.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

/* Give `material` the slot tints; its meshes are InstancedMeshes whose
 * geometry carries `slot` and which have instanceColor, tintB and tintC. */
export function slotTint(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <color_pars_vertex>', `#include <color_pars_vertex>
attribute float slot;
attribute vec3 tintB;
attribute vec3 tintC;`)
      .replace('#include <color_vertex>', `#include <color_vertex>
{
  vec3 slotTint = slot < 0.5 ? vec3(1.0) : slot < 1.5 ? instanceColor.rgb : slot < 2.5 ? tintB : tintC;
  vColor.rgb = color.rgb * slotTint;
}`);
  };
  material.customProgramCacheKey = () => 'interior-slot-tint';
  return material;
}

/* The two extra per instance attributes for an InstancedMesh of `cap`. */
export function addSlotTints(THREE, mesh, cap) {
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  mesh.geometry.setAttribute('tintB', new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3));
  mesh.geometry.setAttribute('tintC', new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3));
}

/* Write instance k's three colours. */
export function setSlotTints(mesh, k, a, b, c) {
  mesh.instanceColor.setXYZ(k, a[0], a[1], a[2]);
  mesh.geometry.attributes.tintB.setXYZ(k, b[0], b[1], b[2]);
  mesh.geometry.attributes.tintC.setXYZ(k, c[0], c[1], c[2]);
}

/* Mark the per instance colours changed. */
export function slotTintsChanged(mesh) {
  mesh.instanceColor.needsUpdate = true;
  mesh.geometry.attributes.tintB.needsUpdate = true;
  mesh.geometry.attributes.tintC.needsUpdate = true;
}
