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
import { buildCubCraft, CUB_DIMS } from '../../src/render/cubcraft.js';
import { buildGliderCraft, GLIDER_DIMS } from '../../src/render/glidercraft.js';
import { buildBramorCraft, BRAMOR_DIMS } from '../../src/render/bramorcraft.js';

const BUILDERS = { sky: buildSkyCraft, cub: buildCubCraft, glider: buildGliderCraft, bramor: buildBramorCraft };
const DIMS = { sky: SKY_DIMS, cub: CUB_DIMS, glider: GLIDER_DIMS, bramor: BRAMOR_DIMS };
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

/* A ground under a taildragger at rest, hidden until rest() asks for it. */
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(3, 3).rotateX(-Math.PI / 2),
  new THREE.MeshLambertMaterial({ color: 0x8e9a7c }),
);
ground.visible = false;
scene.add(ground);
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

/* The fold the last prop() left the blades at. */
let lastFold = null;

window.__preview = {
  dims: DIMS[which] ?? null,
  /* Sit the craft on its wheels at the attitude its dims say it rests at,
   * nose up about +x, with the ground drawn under it; or put it back level
   * at the origin. The camera still targets craft frame numbers, which at
   * rest are near enough the same place. */
  rest(on) {
    const r = DIMS[which]?.rest;
    if (!on || !r) {
      craft.group.rotation.set(0, 0, 0);
      craft.group.position.set(0, 0, 0);
      ground.visible = false;
      return true;
    }
    craft.group.rotation.set(r.pitch, 0, 0);
    craft.group.position.set(0, r.cgHeight, 0);
    ground.visible = true;
    return true;
  },
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
  /* A craft with a folding prop: the motor's rate, called enough times for
   * the blades to finish swinging, then the rotor at angle if it is open.
   * Returns the fold, 0 open to 1 folded. */
  prop(omega, angle = 0.6) {
    if (!craft.setProp) {
      return null;
    }
    let f = 0;
    for (let i = 0; i < 60; i += 1) {
      f = craft.setProp(omega);
    }
    lastFold = f;
    if (omega > 0) {
      craft.blades[0].rotation.y = angle;
    }
    craft.blades[0].visible = true;
    return f;
  },
  count,
  /* Where a point one blade length up the rotor's blade axis goes, in the
   * craft frame, after the shell's spin turns it by a small positive step
   * times propSpin: so the spin's sense can be read as a number. */
  spinProbe() {
    const rotor = craft.blades[0];
    const at = (turn) => {
      rotor.rotation.y = turn;
      craft.group.updateMatrixWorld(true);
      const p = rotor.localToWorld(new THREE.Vector3(0, 0, 0.1));
      return craft.group.worldToLocal(p).toArray();
    };
    const before = at(0);
    const after = at(0.2 * craft.propSpin[0]);
    const axis = craft.group.worldToLocal(rotor.localToWorld(new THREE.Vector3(0, 1, 0)))
      .sub(craft.group.worldToLocal(rotor.localToWorld(new THREE.Vector3(0, 0, 0)))).toArray();
    rotor.rotation.y = 0;
    return { before, after, axis };
  },
  /* The lowest vertex of a named mesh, in the craft frame, on the side of
   * x that side picks (0 for either), since merged parts share a mesh. */
  lowest(name, side = 0) {
    const o = craft.group.getObjectByName(name);
    craft.group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(craft.group.matrixWorld).invert();
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const pos = o.geometry.attributes.position;
    const v = new THREE.Vector3();
    let low = null;
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      if (side * v.x < 0) {
        continue;
      }
      if (!low || v.y < low[1]) {
        low = v.toArray();
      }
    }
    return low;
  },
  /* How far the drawn machine reaches, from every vertex of every visible
   * mesh, minus the outline hulls (paint) and the antenna (wire), which is
   * scripts/craft-check.js's rule. The disc is included: it is where the
   * blades go, on a fixed prop; a folding one is measured folded. */
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
      /* A folding prop's disc is only where the blades go while it is
       * open; folded, the blades are along the nose and it is hidden. */
      if (!shown || (!o.visible && !(craft.discs.includes(o) && !craft.setProp))) {
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
  /* Where the folding prop's blades are, in the craft frame: the fold, the
   * disc, the blades' fore and aft reach and how far any blade vertex
   * stands off the thrust line. */
  bladeExtent() {
    craft.group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(craft.group.matrixWorld).invert();
    const v = new THREE.Vector3();
    const d = DIMS[which];
    const e = { zMin: 1, zMax: -1, rMax: 0 };
    craft.blades[0].traverse((o) => {
      if (!o.isMesh || o.name === 'spinner') {
        return;
      }
      const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 1) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m);
        e.zMin = Math.min(e.zMin, v.z);
        e.zMax = Math.max(e.zMax, v.z);
        e.rMax = Math.max(e.rMax, Math.hypot(v.x, v.y - d.thrustY));
      }
    });
    e.fold = lastFold;
    e.disc = craft.discs[0].visible;
    return e;
  },
  /* The craft frame box of a named part, so a hinge's direction can be
   * read as a number and not only off a picture. */
  box(name) {
    const o = craft.group.getObjectByName(name);
    /* Box3 updates the part's own matrices and not its parents', so a
     * group moved since the last frame, as the launcher view moves it,
     * would be measured where it was. */
    craft.group.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(o);
    return { min: b.min.toArray(), max: b.max.toArray() };
  },
  /* The Bramor's extras: the canopy open over it (hanging straight up from
   * a level aircraft) or lying on the grass, and the catapult under it,
   * pitched up on the rail with the ground drawn. A craft without them
   * ignores the call. */
  chute(open, grounded = false) {
    if (!craft.setChute) return true;
    craft.setChute(open, [0, 1, 0], [0, -1, 0], grounded ? 0.065 : null);
    return true;
  },
  launcher(on) {
    if (!craft.launcher) return true;
    const cat = DIMS[which]?.catapult;
    craft.launcher.visible = on;
    if (on && cat) {
      craft.group.rotation.set((cat.pitchDeg * Math.PI) / 180, 0, 0);
      craft.group.position.set(0, cat.height, 0);
      ground.visible = true;
      ground.scale.setScalar(2);
    } else {
      ground.scale.setScalar(1);
    }
    return true;
  },
};
window.__previewReady = true;
