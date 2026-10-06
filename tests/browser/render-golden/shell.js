/*
 * render-golden/shell.js: src/render/shell.js. The shared shadow depth
 * materials and which instanced casters get one; a map's dispose walk
 * (what it frees, in what order, what it keeps, what it reports); and the
 * session shell: its renderer and camera, resizing, the published craft
 * handles, swapping the airframe under a parent with a map's look on it,
 * repainting and refitting round that look, the paint read back, and the
 * session roots a map must hand back before its dispose.
 *
 * Craft models come from the real builders; the cases read what the shell
 * does with them (which object is where, which handle points at what,
 * what was freed) rather than describing the models.
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

import * as THREE from 'three';
import { shareInstancedDepth, disposeSceneGraph, buildShell } from '../../../src/render/shell.js';

/* Every dispose while `fn` runs, as [kind, name], in order. */
function recordDisposals(fn) {
  const seen = [];
  const kinds = [['material', THREE.Material], ['geometry', THREE.BufferGeometry], ['texture', THREE.Texture], ['target', THREE.WebGLRenderTarget]];
  const reals = kinds.map(([, K]) => K.prototype.dispose);
  kinds.forEach(([kind, K], i) => {
    K.prototype.dispose = function dispose() {
      seen.push([kind, this.name || this.type || this.constructor.name]);
      return reals[i].call(this);
    };
  });
  try {
    return [fn(), seen];
  } finally {
    kinds.forEach(([, K], i) => { K.prototype.dispose = reals[i]; });
  }
}

function instanced(name, opts = {}) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  if (opts.morph) {
    geo.morphAttributes.position = [geo.attributes.position.clone()];
  }
  const mat = opts.material ?? new THREE.MeshLambertMaterial(opts.mat || {});
  const m = new THREE.InstancedMesh(geo, mat, 3);
  m.name = name;
  m.castShadow = opts.cast ?? true;
  if (opts.color) {
    m.setColorAt(0, new THREE.Color(1, 0, 0));
  }
  if (opts.custom) {
    m.customDepthMaterial = new THREE.MeshDepthMaterial();
  }
  return m;
}

function depthScene() {
  const root = new THREE.Group();
  const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  root.add(
    instanced('plain'),
    instanced('coloured', { color: true }),
    instanced('plain2'),
    instanced('notCasting', { cast: false }),
    instanced('custom', { custom: true }),
    instanced('arrayMat', { material: [new THREE.MeshLambertMaterial(), new THREE.MeshLambertMaterial()] }),
    instanced('morph', { morph: true }),
    instanced('alphaTested', { mat: { map: tex, alphaTest: 0.5 } }),
    instanced('alphaMapNoTest', { mat: { alphaMap: tex } }),
    instanced('displaced', { material: new THREE.MeshStandardMaterial({ displacementMap: tex, displacementScale: 1 }) }),
    instanced('displacedZero', { material: new THREE.MeshStandardMaterial({ displacementMap: tex, displacementScale: 0 }) }),
    instanced('clipped', { mat: { clippingPlanes: [plane], clipShadows: true } }),
    instanced('clipNoShadow', { mat: { clippingPlanes: [plane], clipShadows: false } }),
  );
  const plainMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial());
  plainMesh.name = 'notInstanced';
  plainMesh.castShadow = true;
  root.add(plainMesh);
  const batched = new THREE.BatchedMesh(4, 100, 100, new THREE.MeshLambertMaterial());
  batched.name = 'batched';
  batched.castShadow = true;
  root.add(batched);
  return root;
}

/* Depth materials named by first appearance across every call, so that
 * sharing between calls is pinned too. */
const depthIds = new Map();
function depthId(m) {
  if (!m) {
    return null;
  }
  if (!depthIds.has(m)) {
    depthIds.set(m, `d${depthIds.size}`);
  }
  return depthIds.get(m);
}

function describeDepth(root, count) {
  return {
    count,
    meshes: root.children.map((o) => [o.name, depthId(o.customDepthMaterial), o.customDepthMaterial ? [o.customDepthMaterial.type, o.customDepthMaterial.depthPacking] : null]),
  };
}

function disposableScene() {
  const root = new THREE.Scene();
  const shared = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  shared.name = 'shared';
  const kept = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  kept.name = 'kept';
  const inUniform = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  inUniform.name = 'uniform';
  const geo = new THREE.BoxGeometry();
  geo.name = 'sharedGeo';
  const a = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: shared, name: 'a' }));
  const b = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: shared, emissiveMap: kept, name: 'b' }));
  const c = new THREE.Mesh(new THREE.SphereGeometry(), [new THREE.MeshBasicMaterial({ name: 'c0', alphaMap: shared }), new THREE.MeshBasicMaterial({ name: 'c1' })]);
  c.geometry.name = 'sphere';
  const d = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.ShaderMaterial({ name: 'd', uniforms: { tex: { value: inUniform }, n: { value: 1 }, empty: null } }));
  d.geometry.name = 'plane';
  const nested = new THREE.Group();
  nested.add(new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ name: 'points' })));
  nested.children[0].geometry.name = 'points';
  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;
  sun.shadow.map = new THREE.WebGLRenderTarget(4, 4);
  sun.shadow.map.texture.name = 'shadowTex';
  const lamp = new THREE.PointLight();
  root.add(a, b, c, d, nested, sun, lamp, new THREE.Object3D());
  return { root, kept };
}

function handles(shell, built) {
  const same = (k, v) => shell[k] === v;
  return {
    quad: same('quad', built.group),
    discs: same('discs', built.discs),
    blades: same('blades', built.blades),
    cameraMount: same('cameraMount', built.cameraMount),
    propSpin: shell.propSpin === built.propSpin,
    optional: ['setSurfaces', 'setProp', 'setChute', 'setFlaps', 'setGear', 'launcher', 'launcherRest'].map((k) => [k, shell[k] === null ? null : shell[k] === (built[k] ?? null)]),
  };
}

function shellSession(opts) {
  const canvas = document.createElement('canvas');
  canvas.style.width = '123px';
  canvas.style.height = '45px';
  document.body.appendChild(canvas);
  const rows = {};
  const shell = buildShell(canvas, opts);
  const r = shell.renderer;
  const attrs = r.getContext().getContextAttributes();
  rows.renderer = {
    attrs: { antialias: attrs.antialias, depth: attrs.depth, stencil: attrs.stencil, powerPreference: attrs.powerPreference, failIfMajorPerformanceCaveat: attrs.failIfMajorPerformanceCaveat, desynchronized: attrs.desynchronized },
    ratio: r.getPixelRatio(),
    pixelRatio: shell.pixelRatio,
    colorSpace: r.outputColorSpace,
    toneMapping: r.toneMapping,
    shadows: r.shadowMap.enabled,
    size: [canvas.width, canvas.height],
    style: [canvas.style.width, canvas.style.height],
  };
  rows.camera = { fov: shell.camera.fov, near: shell.camera.near, far: shell.camera.far, aspect: shell.camera.aspect, layers: shell.camera.layers.mask };
  rows.keys = Object.keys(shell).sort();
  rows.canvas = shell.canvas === canvas;
  canvas.style.width = '10px';
  rows.resize = shell.resize();
  rows.resizedStyle = [canvas.style.width, canvas.style.height];

  /* A map's scene holding the craft one level down, the ghost two down,
   * and a root registered but never parented. */
  const scene = new THREE.Scene();
  const holder = new THREE.Group();
  scene.add(holder);
  holder.add(shell.quad);
  const ghost = new THREE.Group();
  const ghostHolder = new THREE.Group();
  ghostHolder.add(ghost);
  holder.add(ghostHolder);
  rows.keep = [shell.keepAcrossMaps(ghost) === ghost, shell.keepAcrossMaps(null), shell.keepAcrossMaps(new THREE.Group()) instanceof THREE.Group];

  /* A look that tints and records its undos. */
  const looks = [];
  const look = (craft) => {
    looks.push(['look', craft.group === shell.quad, craft.group.name]);
    return () => looks.push(['undo', craft.group.name]);
  };
  shell.setCraftLook(look);
  shell.setCraftLook(look);
  const other = { group: new THREE.Group() };
  other.group.name = 'other';
  rows.lookOther = shell.lookCraft(other) !== null;

  shell.quad.position.set(1, 2, 3);
  shell.quad.quaternion.set(0, 0.6, 0, 0.8);
  shell.quad.visible = false;
  const oldGroup = shell.quad;
  const owned = new Set();
  oldGroup.traverse((o) => {
    if (o.geometry) {
      owned.add(o.geometry);
    }
    for (const m of [o.material].flat()) {
      if (m) {
        owned.add(m);
      }
    }
  });
  const freed = new Set();
  const [next] = recordDisposals(() => {
    const realGeo = THREE.BufferGeometry.prototype.dispose;
    const realMat = THREE.Material.prototype.dispose;
    THREE.BufferGeometry.prototype.dispose = function dispose() {
      freed.add(this);
      return realGeo.call(this);
    };
    THREE.Material.prototype.dispose = function dispose() {
      freed.add(this);
      return realMat.call(this);
    };
    try {
      return shell.swapCraft('7inch');
    } finally {
      THREE.BufferGeometry.prototype.dispose = realGeo;
      THREE.Material.prototype.dispose = realMat;
    }
  });
  rows.swap = {
    returned: next.group === shell.quad,
    inOldParent: shell.quad.parent === holder,
    oldDetached: oldGroup.parent === null,
    pose: [...shell.quad.position.toArray(), ...shell.quad.quaternion.toArray(), shell.quad.visible],
    handles: handles(shell, next),
    /* Everything the old airframe owned is freed; what building the new one
     * freed along the way is the builder's business. */
    oldFreed: [...owned].every((x) => freed.has(x)),
    newKept: (() => {
      let kept = true;
      shell.quad.traverse((o) => {
        if ((o.geometry && freed.has(o.geometry)) || [o.material].flat().some((m) => m && freed.has(m) && !owned.has(m))) {
          kept = false;
        }
      });
      return kept;
    })(),
  };
  shell.repaintCraft('7inch');
  shell.redressCraft('7inch');
  /* The paint read back is the livery's and the parts' business; what the
   * shell owns is its shape and the drawn colours' collection. */
  const paint = shell.craftPaint('7inch');
  const hexes = (list) => Array.isArray(list) && list.every((c) => /^#[0-9a-f]{6}$/.test(c));
  rows.paint = {
    keys: Object.keys(paint),
    id: paint.id,
    regions: paint.regions === null ? null : hexes(Object.values(paint.regions)),
    drawn: hexes(paint.drawn) && paint.drawn.join() === [...new Set(paint.drawn)].sort().join(),
  };
  shell.setCraftLook(null);
  rows.lookOtherOff = shell.lookCraft(other);
  rows.looks = looks;

  const unparented = new THREE.Group();
  shell.keepAcrossMaps(unparented);
  rows.evict = [shell.evictSessionRoots(null), shell.evictSessionRoots(scene), shell.quad.parent === null, ghost.parent === null, ghostHolder.parent === holder, shell.evictSessionRoots(scene)];

  /* A swap with no parent. */
  const loose = shell.swapCraft('interceptor');
  rows.looseSwap = { parent: loose.group.parent === null, handles: handles(shell, loose) };
  /* Aircraft with the optional handles: surfaces, a folding prop, a
   * parachute and a launch rail; flaps; retracts. */
  rows.optionalSwaps = ['bramor2300', 'timber1500', 'p51d1450', 'interceptor'].map((id) => handles(shell, shell.swapCraft(id)));
  canvas.remove();
  r.dispose();
  return rows;
}

export function cases() {
  return {
    depth: () => {
      const a = depthScene();
      const first = describeDepth(a, shareInstancedDepth(a));
      const again = shareInstancedDepth(a);
      const b = depthScene();
      const second = describeDepth(b, shareInstancedDepth(b));
      return { first, again, second };
    },
    dispose: () => {
      const { root, kept } = disposableScene();
      const [stats, disposed] = recordDisposals(() => disposeSceneGraph(root, new Set([kept])));
      const plain = disposableScene();
      const [statsNoKeep, disposedNoKeep] = recordDisposals(() => disposeSceneGraph(plain.root));
      return { stats, disposed, cleared: root.children.length, statsNoKeep, disposedNoKeep };
    },
    shellDefault: () => shellSession({ airframe: 'interceptor' }),
    shellOptions: () => shellSession({ airframe: '10inch', pixelRatio: 0.75, powerPreference: 'low-power', desynchronized: true }),
  };
}
