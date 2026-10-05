/*
 * lake.js: the lake at the valley's southern foot, and the mirror it
 * holds up to the valley.
 *
 * The water is a grid five metres a cell over the basin, kept wherever
 * the ground under it is below the surface or near it, each vertex
 * carrying how deep the water is there (LAKE_Y less the ground), so the
 * shore is wherever the terrain comes up through it and the shallows are
 * as clear as they are shallow. The terrain hides the grid past the
 * shore.
 *
 * The mirror is the scene rendered again from under the water, through
 * an oblique clip plane at the surface, into a half resolution half
 * float target, once a frame in update(): three's Reflector does the same
 * from its own draw, which under a composer with more than one scene pass
 * would render the mirror once for each. Everything the lake's own
 * group holds, and the meadow, is hidden for it.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';
import { LAKE_Y } from '../../alps/terrain.js';

const CELL = 5;

/* How far from where `matrix` puts it a water fragment may read the
 * mirror, in texture coordinates: surface.js moves the read by its
 * ripples' slope times 0.06, and a slope of 1.5 is a 56 degree face,
 * steeper than any wave the lake draws. */
const SAMPLE_REACH = 0.09;
/* A box corner's index has a bit per axis: x 1, y 2, z 4. */
const AXIS_BITS = [1, 2, 4];

/* The lake's water: a grid over the shore's box, cells kept where any
 * corner is under water or within half a metre of it. */
export function lakeGeometry(heightAt, shore) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const p of shore) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    z0 = Math.min(z0, p.z);
    z1 = Math.max(z1, p.z);
  }
  x0 -= 20;
  z0 -= 20;
  x1 += 20;
  z1 += 20;
  const nx = Math.ceil((x1 - x0) / CELL);
  const nz = Math.ceil((z1 - z0) / CELL);
  const depth = new Float32Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j += 1) {
    for (let i = 0; i <= nx; i += 1) {
      depth[j * (nx + 1) + i] = LAKE_Y - heightAt(x0 + i * CELL, z0 + j * CELL);
    }
  }
  const index = new Int32Array((nx + 1) * (nz + 1)).fill(-1);
  const pos = [];
  const water = [];
  const idx = [];
  const vert = (i, j) => {
    const k = j * (nx + 1) + i;
    if (index[k] < 0) {
      index[k] = pos.length / 3;
      pos.push(x0 + i * CELL, LAKE_Y, z0 + j * CELL);
      water.push(depth[k], 0, 0, 0);
    }
    return index[k];
  };
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const d = Math.max(depth[j * (nx + 1) + i], depth[j * (nx + 1) + i + 1], depth[(j + 1) * (nx + 1) + i], depth[(j + 1) * (nx + 1) + i + 1]);
      if (d < -0.5) {
        continue;
      }
      const a = vert(i, j);
      const b = vert(i + 1, j);
      const c = vert(i, j + 1);
      const e = vert(i + 1, j + 1);
      idx.push(a, c, b, b, c, e);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('aWater', new THREE.Float32BufferAttribute(water, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  /* The depth on every grid corner, for the dense patch the near water is
   * drawn on when the lake has waves (index.js), which has none of its
   * own. */
  g.userData.depth = { data: depth, w: nx + 1, h: nz + 1, x0, z0, cell: CELL };
  return g;
}

/*
 * A planar mirror at height y. `scale` is its resolution against the
 * renderer's drawing buffer. render(renderer, scene, camera, hide, bounds)
 * draws it for this frame, with `hide` (objects) invisible. setLevel(y)
 * moves it, for water whose level is not one height (Itaipu's flood).
 *
 * `bounds`, a world Box3 round every surface that reads the mirror, keeps
 * the draw to the part of the target those surfaces can sample: a water
 * fragment reads the mirror where `matrix` puts it, so the box's corners
 * through `matrix` bound every texel any of them reads, and the rest of
 * the target is never looked at. Low over the valley the lake is a strip
 * along the horizon, and the mirror's draw is a strip with it. Without
 * `bounds` the whole target is drawn, as it always was.
 */
export function planarMirror(level, scale = 0.5) {
  let y = level;
  const target = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, samples: 0 });
  target.texture.generateMipmaps = false;
  const matrix = new THREE.Matrix4();
  const cam = new THREE.PerspectiveCamera();
  const normal = new THREE.Vector3(0, 1, 0);
  const plane = new THREE.Plane();
  const clip = new THREE.Vector4();
  const q = new THREE.Vector4();
  const at = new THREE.Vector3();
  const eye = new THREE.Vector3();
  const look = new THREE.Vector3();
  const tgt = new THREE.Vector3();
  const rot = new THREE.Matrix4();
  const size = new THREE.Vector2();
  const corners = Array.from({ length: 8 }, () => new THREE.Vector4());
  const rect = new THREE.Vector4();
  /* The share of the target the last draw covered. */
  let share = 0;
  /* The texels of `target` the box's surfaces read, into rect as a
   * scissor (x, y, w, h); false when they read none. */
  const scissorFor = (box, near) => {
    for (let k = 0; k < 8; k += 1) {
      corners[k].set(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z, 1).applyMatrix4(matrix);
    }
    let u0 = Infinity;
    let v0 = Infinity;
    let u1 = -Infinity;
    let v1 = -Infinity;
    const take = (s, t, w) => {
      u0 = Math.min(u0, s / w);
      u1 = Math.max(u1, s / w);
      v0 = Math.min(v0, t / w);
      v1 = Math.max(v1, t / w);
    };
    /* The box clipped at the mirror camera's near plane (w is the depth
     * in front of it): the corners in front, and where each of the twelve
     * edges crosses the plane. */
    for (let a = 0; a < 8; a += 1) {
      const p = corners[a];
      if (p.w >= near) {
        take(p.x, p.y, p.w);
      }
      for (const bit of AXIS_BITS) {
        const q = corners[a | bit];
        if ((a & bit) || (p.w >= near) === (q.w >= near)) {
          continue;
        }
        const f = (near - p.w) / (q.w - p.w);
        take(p.x + (q.x - p.x) * f, p.y + (q.y - p.y) * f, near);
      }
    }
    u0 = Math.max(0, u0 - SAMPLE_REACH);
    v0 = Math.max(0, v0 - SAMPLE_REACH);
    u1 = Math.min(1, u1 + SAMPLE_REACH);
    v1 = Math.min(1, v1 + SAMPLE_REACH);
    if (!(u1 > u0 && v1 > v0)) {
      return false;
    }
    const x = Math.floor(u0 * target.width);
    const y0 = Math.floor(v0 * target.height);
    rect.set(x, y0, Math.ceil(u1 * target.width) - x, Math.ceil(v1 * target.height) - y0);
    return true;
  };
  const render = (renderer, scene, camera, hide, bounds = null) => {
    renderer.getDrawingBufferSize(size);
    const w = Math.max(16, Math.round(size.x * scale));
    const h = Math.max(16, Math.round(size.y * scale));
    if (target.width !== w || target.height !== h) {
      target.setSize(w, h);
    }
    camera.updateMatrixWorld();
    eye.setFromMatrixPosition(camera.matrixWorld);
    if (eye.y < y) {
      return false;
    }
    at.set(eye.x, y, eye.z);
    /* The eye reflected in the plane, looking at the reflection of what
     * the camera looks at, its up vector reflected too. */
    const view = at.clone().sub(eye).reflect(normal).negate().add(at);
    rot.extractRotation(camera.matrixWorld);
    look.set(0, 0, -1).applyMatrix4(rot).add(eye);
    tgt.subVectors(at, look).reflect(normal).negate().add(at);
    cam.position.copy(view);
    cam.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal);
    cam.lookAt(tgt);
    cam.far = camera.far;
    cam.near = camera.near;
    cam.updateMatrixWorld();
    cam.projectionMatrix.copy(camera.projectionMatrix);
    cam.layers.mask = camera.layers.mask;
    matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    matrix.multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    /* The oblique near plane (Lengyel): nothing under the water draws
     * into its reflection. */
    plane.setFromNormalAndCoplanarPoint(normal, at).applyMatrix4(cam.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const e = cam.projectionMatrix.elements;
    q.x = (Math.sign(clip.x) + e[8]) / e[0];
    q.y = (Math.sign(clip.y) + e[9]) / e[5];
    q.z = -1;
    q.w = (1 + e[10]) / e[14];
    clip.multiplyScalar(2 / clip.dot(q));
    e[2] = clip.x;
    e[6] = clip.y;
    e[10] = clip.z + 1 - 0.003;
    e[14] = clip.w;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    if (bounds) {
      if (!scissorFor(bounds, cam.near)) {
        share = 0;
        return false;
      }
      target.scissor.copy(rect);
    }
    share = bounds ? (rect.z * rect.w) / (target.width * target.height) : 1;
    target.scissorTest = Boolean(bounds);

    const was = hide.map((o) => o.visible);
    hide.forEach((o) => { o.visible = false; });
    const prevTarget = renderer.getRenderTarget();
    const prevXr = renderer.xr.enabled;
    const prevShadow = renderer.shadowMap.autoUpdate;
    renderer.xr.enabled = false;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(target);
    renderer.state.buffers.depth.setMask(true);
    if (renderer.autoClear === false) {
      renderer.clear();
    }
    renderer.render(scene, cam);
    renderer.xr.enabled = prevXr;
    renderer.shadowMap.autoUpdate = prevShadow;
    renderer.setRenderTarget(prevTarget);
    hide.forEach((o, k) => { o.visible = was[k]; });
    return true;
  };
  return {
    texture: target.texture,
    matrix,
    render,
    share: () => share,
    setLevel: (v) => { y = v; },
    dispose: () => target.dispose(),
  };
}
