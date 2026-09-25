/*
 * pick.js: what the builder's crosshair is pointing at, read off the
 * picture the GPU draws rather than off a copy of the world.
 *
 * WHY THE GPU. The swiss2 valley is about a million triangles in a few
 * hundred meshes, a streamed BatchedMesh of carved rock among them, and
 * three's Raycaster walked all of it in 28 to 190 ms a ray, measured from
 * above the strip on the development machine. The rock is also
 * streamed at a level of detail picked from the camera, so a CPU copy of it
 * would disagree with the rock on screen by however much the level differs.
 *
 * So the scene is drawn once more, from the camera, into ONE pixel through a
 * lens a twentieth of a degree wide, with a material that writes the
 * distance and the surface normal instead of a colour. Frustum culling
 * throws away everything the ray cannot touch, so the pass draws a handful
 * of objects, and what it hits is exactly what the valley draws there:
 * terrain, cliff faces, walls, roofs, the lake.
 *
 * WHAT IT SKIPS. Anything whose vertex shader this material cannot
 * reproduce, because drawn with it the object would stand somewhere it is
 * not: a ShaderMaterial (the sky, the grass), an InstancedBufferGeometry (the
 * forest's impostors), points, lines and sprites. Anything that renders
 * something else first (an onBeforeRender of its own: a mirror would
 * redraw itself for this camera). Small instanced clutter (flowers, reeds, posts),
 * so a gate stood on a meadow stands on the ground under the flowers. Things
 * that move and are never culled (the herd, the gondola's cabins). And
 * whatever the caller names: the craft, and the builder's own gates.
 *
 * Within RIDGE_NEAR of the camera (800 m, src/maps/swiss2/ground.js) the
 * valley's ground is drawn exactly where its vertices are, so the pick
 * range stops short of it and the ridge noise this material does not add
 * never matters.
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

/* Metres. See the header: short of the ridge noise's 800 m. */
export const PICK_RANGE = 780;

/* An instanced mesh whose one instance fits in a sphere this small is
 * clutter a gate should stand through, not on. */
const CLUTTER_R = 1.2;

const VERT = /* glsl */ `
#include <common>
#include <batching_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
varying float vDepth;
varying vec3 vNormalV;
void main() {
  #include <batching_vertex>
  #include <beginnormal_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  vDepth = -mvPosition.z;
  vNormalV = transformedNormal;
}
`;

const FRAG = /* glsl */ `
varying float vDepth;
varying vec3 vNormalV;
void main() {
  vec3 n = normalize(vNormalV);
  gl_FragColor = vec4(gl_FrontFacing ? n : -n, vDepth);
}
`;

function skipped(o) {
  if (o.isPoints || o.isLine || o.isSprite) {
    return true;
  }
  if (!(o.isMesh)) {
    return false;
  }
  const mats = Array.isArray(o.material) ? o.material : [o.material];
  if (mats.some((m) => m && (m.isShaderMaterial || m.isRawShaderMaterial))) {
    return true;
  }
  if (o.geometry && o.geometry.isInstancedBufferGeometry) {
    return true;
  }
  /* An onBeforeRender given to this one object, like the sky's. A class's
   * own is three's, and the rock's BatchedMesh culls its chunks in it: skip
   * that and the pass draws no rock at all. */
  if (Object.prototype.hasOwnProperty.call(o, 'onBeforeRender')) {
    return true;
  }
  if (o.isInstancedMesh) {
    if (!o.frustumCulled) {
      return true;
    }
    if (!o.geometry.boundingSphere) {
      o.geometry.computeBoundingSphere();
    }
    return o.geometry.boundingSphere.radius < CLUTTER_R;
  }
  return false;
}

/*
 * The first crossing of the ray with the map's height function, for while
 * the camera is moving and the GPU is not asked (see request). It is the
 * collider's ground and the lake, not the drawn rock or a roof, so the
 * ghost can sit a little off a carved face until the camera stops and the
 * exact reading replaces it. Steps start at STEP metres and grow by GROW
 * of the distance, about sixty to the end of the range where fixed steps
 * took two hundred on every frame the camera moved, then halve down to a
 * centimetre where the ray went under. Null when it stays above.
 */
const STEP = 2;
const GROW = 0.05;
export function marchHeight(heightAt, origin, dir, range = PICK_RANGE) {
  const above = (t) => origin.y + dir.y * t - heightAt(origin.x + dir.x * t, origin.z + dir.z * t);
  if (above(0) <= 0) {
    return null;
  }
  let lo = 0;
  let hi = -1;
  for (let t = STEP; t <= range; t += STEP + t * GROW) {
    if (above(t) <= 0) {
      hi = t;
      break;
    }
    lo = t;
  }
  if (hi < 0) {
    return null;
  }
  while (hi - lo > 0.01) {
    const mid = (lo + hi) / 2;
    if (above(mid) > 0) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const x = origin.x + dir.x * hi;
  const z = origin.z + dir.z * hi;
  const e = 0.5;
  const n = new THREE.Vector3(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize();
  if (n.dot(dir) > 0) {
    n.negate();
  }
  return {
    point: new THREE.Vector3(x, origin.y + dir.y * hi, z), normal: n, distance: hi,
  };
}

export function createPicker(renderer) {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.FloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
  });
  const lens = new THREE.PerspectiveCamera(0.05, 1, 0.1, PICK_RANGE);
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.DoubleSide,
  });
  const px = new Float32Array(4);
  const clear = new THREE.Color();
  const hidden = [];
  const look = new THREE.Vector3();
  /* The objects to hide, found by walking the scene. The walk is cheap next
   * to a frame but not free, and the scene changes rarely (the rock joins
   * on the valley's first frame), so it is redone when asked and at most
   * once a second. */
  let skipList = [];
  let skipScene = null;
  let skipAt = -Infinity;

  function refreshSkips(scene, now) {
    if (scene === skipScene && now - skipAt < 1000) {
      return;
    }
    skipScene = scene;
    skipAt = now;
    skipList = [];
    scene.traverse((o) => {
      if (o !== scene && skipped(o)) {
        skipList.push(o);
      }
    });
  }

  /*
   * Draw the one pixel for the ray from origin along unit dir, leaving it in
   * the target. The objects the skip rules name, and `also` on top, are
   * hidden for the pass and put back.
   */
  function draw(scene, origin, dir, also) {
    refreshSkips(scene, performance.now());
    lens.position.copy(origin);
    look.copy(origin).add(dir);
    /* Any up that is not the ray itself. */
    lens.up.set(0, 1, 0);
    if (Math.abs(dir.y) > 0.99) {
      lens.up.set(0, 0, 1);
    }
    lens.lookAt(look);
    lens.updateMatrixWorld();

    hidden.length = 0;
    for (const list of [skipList, also]) {
      for (const o of list) {
        if (o.visible) {
          o.visible = false;
          hidden.push(o);
        }
      }
    }
    const prevTarget = renderer.getRenderTarget();
    const prevAlpha = renderer.getClearAlpha();
    renderer.getClearColor(clear);
    const prevOverride = scene.overrideMaterial;
    const prevBackground = scene.background;
    /* The shadow maps are the frame's, drawn from the sun for the camera the
     * pilot sees. This pass must not redraw them for its own lens. Held off
     * by their update flags, not by switching shadows off: that switch is in
     * every material's program key, so flipping it twice a frame sent every
     * material in the valley back through program selection on the next
     * real frame. */
    const shadow = renderer.shadowMap;
    const prevAuto = shadow.autoUpdate;
    const prevNeeds = shadow.needsUpdate;
    shadow.autoUpdate = false;
    shadow.needsUpdate = false;
    scene.overrideMaterial = material;
    scene.background = null;
    try {
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, false);
      renderer.render(scene, lens);
    } finally {
      renderer.setClearColor(clear, prevAlpha);
      shadow.autoUpdate = prevAuto;
      shadow.needsUpdate = prevNeeds;
      scene.overrideMaterial = prevOverride;
      scene.background = prevBackground;
      for (const o of hidden) {
        o.visible = true;
      }
    }
    return prevTarget;
  }

  /* A read pixel into a hit, measured along the ray it was drawn for. */
  function hitFrom(buf, origin, dir, frame) {
    /* Alpha is the view depth, and the clear left it at zero: nothing there. */
    const depth = buf[3];
    if (!(depth > 0)) {
      return null;
    }
    const n = new THREE.Vector3(buf[0], buf[1], buf[2]).transformDirection(frame);
    return {
      point: new THREE.Vector3().copy(origin).addScaledVector(dir, depth),
      normal: n,
      distance: depth,
    };
  }

  /*
   * The first surface along the ray, now: { point, normal, distance } in the
   * scene with the normal facing back along the ray, or null. This one
   * waits for the GPU, a few milliseconds, so it is for the moment a gate is
   * actually put down; the crosshair's own reading every frame is request
   * and poll below.
   */
  function pick(scene, origin, dir, also = []) {
    const prev = draw(scene, origin, dir, also);
    try {
      renderer.readRenderTargetPixels(target, 0, 0, 1, 1, px);
    } finally {
      renderer.setRenderTarget(prev);
    }
    return hitFrom(px, origin, dir, lens.matrixWorld);
  }

  /*
   * THE SAME READING WITHOUT WAITING FOR IT, which is not the same as free.
   *
   * A synchronous read makes the CPU wait until the GPU has drawn everything
   * queued before it: measured on this machine's GPU at 3.6 ms a pick
   * against 0.74 ms to issue the draw. So the pixel is copied into a pixel
   * pack buffer on the GPU's own time and a fence marks when that is done.
   * But fetching the buffer is still a synchronous trip to Chrome's GPU
   * process, even after the fence has signalled, and with the GPU busy that
   * trip measured 57 to 75 ms. The builder therefore asks only when the
   * camera has come to rest (buildmode.js), where one such wait is one
   * frame, and reads the height field while it moves.
   */
  const gl = renderer.getContext();
  let pbo = null;
  let pending = null;
  const pendBuf = new Float32Array(4);

  function request(scene, origin, dir, also = []) {
    if (pending) {
      return false;
    }
    const prev = draw(scene, origin, dir, also);
    try {
      pbo ??= gl.createBuffer();
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, 16, gl.STREAM_READ);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, 0);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      pending = {
        fence,
        origin: origin.clone(),
        dir: dir.clone(),
        frame: lens.matrixWorld.clone(),
      };
    } finally {
      renderer.setRenderTarget(prev);
    }
    return true;
  }

  /* The finished request as { hit, origin, dir }, hit null for a miss, or
   * undefined while the GPU has not got to it yet. The ray is the one the
   * request was drawn for, which a moving camera has already left. */
  function poll() {
    if (!pending) {
      return undefined;
    }
    if (gl.getSyncParameter(pending.fence, gl.SYNC_STATUS) !== gl.SIGNALED) {
      return undefined;
    }
    gl.deleteSync(pending.fence);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pendBuf);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    const p = pending;
    pending = null;
    return { hit: hitFrom(pendBuf, p.origin, p.dir, p.frame), origin: p.origin, dir: p.dir };
  }

  function dispose() {
    if (pending) {
      gl.deleteSync(pending.fence);
      pending = null;
    }
    if (pbo) {
      gl.deleteBuffer(pbo);
    }
    target.dispose();
    material.dispose();
  }

  return { pick, request, poll, dispose };
}
