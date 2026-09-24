/*
 * craft-preview.js: the page side of scripts/craft-preview.js.
 *
 * Builds one aircraft, named by ?craft=, on a plain grey stage under the
 * showcase's two lights, drawn through the game's own post pass so the ink
 * lines are the ones the pilot sees. window.__preview poses the camera and
 * the surfaces, spins the prop, and counts what the model costs.
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

import * as THREE from 'three';
import { buildComposer } from '../../src/render/post.js';
import { buildSkyCraft, SKY_DIMS } from '../../src/render/skycraft.js';
import { buildWingCraft } from '../../src/render/wingcraft.js';

const BUILDERS = { sky: buildSkyCraft, wing: buildWingCraft };
const params = new URLSearchParams(location.search);
const which = params.get('craft') ?? 'sky';
const lite = params.get('lite') === '1';

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb9c7cf);
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.02, 50);
scene.add(new THREE.HemisphereLight(0xf0e6d0, 0x2a3828, 0.82));
const sun = new THREE.DirectionalLight(0xffe2b8, 2.45);
sun.position.set(0.48, 0.92, -0.52);
scene.add(sun);

const craft = BUILDERS[which]({ name: 'preview', fog: false, lite });
scene.add(craft.group);
const composer = buildComposer(renderer, scene, camera, null);

/* What the model alone costs: every visible mesh with triangles in it is
 * one draw, outline hulls included, because the renderer draws them. */
function count() {
  let tris = 0;
  let draws = 0;
  craft.group.traverseVisible((o) => {
    if (!o.isMesh) {
      return;
    }
    const g = o.geometry;
    const n = g.index ? g.index.count : (g.attributes.position?.count ?? 0);
    if (n === 0) {
      return;
    }
    draws += 1;
    tris += n / 3;
  });
  return { tris, draws };
}

window.__preview = {
  dims: which === 'sky' ? SKY_DIMS : null,
  /* Camera by azimuth and elevation in degrees about a target, at dist
   * metres. Azimuth 0 looks at the nose from ahead, 90 from the right. */
  view(az, el, dist, tx = 0, ty = 0, tz = 0.2, fov = 30) {
    const a = (az * Math.PI) / 180;
    const e = (el * Math.PI) / 180;
    camera.fov = fov;
    camera.updateProjectionMatrix();
    camera.position.set(
      tx + dist * Math.cos(e) * Math.sin(a),
      ty + dist * Math.sin(e),
      tz - dist * Math.cos(e) * Math.cos(a),
    );
    camera.up.set(0, 1, 0);
    if (Math.abs(el) > 89) {
      camera.up.set(0, 0, -1);
    }
    camera.lookAt(tx, ty, tz);
    composer.render();
    return true;
  },
  surfaces(...rad) {
    craft.setSurfaces(...rad);
    return true;
  },
  spin(angle, blur) {
    craft.blades[0].rotation.y = angle;
    craft.discs[0].visible = blur;
    craft.blades[0].visible = !blur;
    return true;
  },
  count,
  /* How far the drawn machine reaches, from every vertex of every visible
   * mesh, minus the outline hulls (paint) and the antenna (wire), which is
   * scripts/craft-check.js's rule. The disc is included: it is where the
   * blades go. */
  extents() {
    craft.group.updateMatrixWorld(true);
    const e = { xMax: 0, yMax: -1, yMin: 1, zMin: 1, zMax: -1 };
    const v = new THREE.Vector3();
    craft.group.traverse((o) => {
      if (!o.isMesh || o.material.userData.hullColor !== undefined || o.name === 'antenna') {
        return;
      }
      let shown = true;
      o.traverseAncestors((p) => { shown = shown && p.visible; });
      if (!shown || (!o.visible && !craft.discs.includes(o))) {
        return;
      }
      const pos = o.geometry.attributes.position;
      if (!pos) {
        return;
      }
      for (let i = 0; i < pos.count; i += 1) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        e.xMax = Math.max(e.xMax, Math.abs(v.x));
        e.yMax = Math.max(e.yMax, v.y);
        e.yMin = Math.min(e.yMin, v.y);
        e.zMin = Math.min(e.zMin, v.z);
        e.zMax = Math.max(e.zMax, v.z);
      }
    });
    return e;
  },
  /* The craft frame box of a named part, so a hinge's direction can be
   * read as a number and not only off a picture. */
  box(name) {
    const o = craft.group.getObjectByName(name);
    const b = new THREE.Box3().setFromObject(o);
    return { min: b.min.toArray(), max: b.max.toArray() };
  },
};
window.__previewReady = true;
