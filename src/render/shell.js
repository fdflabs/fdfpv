/*
 * shell.js: the session, which outlives every map.
 *
 * Each map (the Alps, the Swiss valley, Itaipu, the Interior) builds its
 * own world and post chain. What they share is one renderer and canvas,
 * one camera and one airframe, and none of those is rebuilt on a map
 * change: a WebGL context is expensive, the post chains read the camera's
 * layer mask, and a new craft would recompile its cel materials for
 * nothing. A map owns its scene, post chain, colliders and contact data
 * and frees all of them when it is swapped out, so only one map's render
 * targets are alive at a time (src/maps/README.md has the contract).
 *
 * Renderer state that maps disagree about (shadow filtering, clear
 * colour) is deliberately not set here: each map applies its own, so no
 * map silently inherits the last one's.
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
import { buildCraft } from './craft.js';
import { dressLivery } from './livery.js';
import { readDecals } from './decals.js';
import { readFinish, readWear } from './finish.js';
import { dressParts } from './partsfit.js';
import { CAMERA_FOV_DEFAULT } from './lens.js';

/*
 * Shadow depth materials shared per kind of instanced caster.
 *
 * three r160 draws plain shadow casters with one MeshDepthMaterial whose
 * program depends on whether the object is instanced, instance coloured or
 * batched, so a shadow pass alternating between kinds rebuilds that
 * program's parameters at every switch (29 times a frame in the Swiss
 * valley: about 0.3 ms and 1.4 MB/s of garbage). One copy per kind ends the
 * switching with the same pixels, since it is the material three would use
 * and three still copies side, map and alpha onto it each draw. Materials
 * that need three's own per material copy (alpha tested maps, displacement,
 * shadow clipping) are left to it. Index: 1 instanced, 2 instance colours,
 * 4 batched.
 */
const DEPTH_BY_KIND = [];

function needsOwnDepth(m) {
  const clips = m.clipShadows === true && Array.isArray(m.clippingPlanes) && m.clippingPlanes.length !== 0;
  const displaces = Boolean(m.displacementMap) && m.displacementScale !== 0;
  const cutsOut = Boolean(m.alphaMap || m.map) && m.alphaTest > 0;
  return clips || displaces || cutsOut;
}

/* Gives every eligible instanced or batched shadow caster under `root` its
 * kind's shared depth material, and returns how many it gave one to. */
export function shareInstancedDepth(root) {
  let count = 0;
  root.traverse((o) => {
    const eligible = (o.isInstancedMesh || o.isBatchedMesh)
      && o.castShadow
      && !o.customDepthMaterial
      && !Array.isArray(o.material)
      && !o.isSkinnedMesh
      && !o.geometry.morphAttributes.position
      && !needsOwnDepth(o.material);
    if (!eligible) {
      return;
    }
    const kind = (o.isInstancedMesh ? 1 : 0) | (o.instanceColor ? 2 : 0) | (o.isBatchedMesh ? 4 : 0);
    DEPTH_BY_KIND[kind] ??= new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    o.customDepthMaterial = DEPTH_BY_KIND[kind];
    count += 1;
  });
  return count;
}

/* Every texture a material holds, in its own properties or its uniforms. */
function texturesOf(material) {
  const found = Object.values(material).filter((v) => v && v.isTexture);
  for (const uniform of Object.values(material.uniforms || {})) {
    const v = uniform && uniform.value;
    if (v && v.isTexture) {
      found.push(v);
    }
  }
  return found;
}

/*
 * Frees every GPU resource a map's scene graph holds, which is what makes
 * "only the active map exists" true: three keeps buffers and textures until
 * dispose is called, whatever the garbage collector does. Each resource is
 * freed once however many meshes share it. Shadow maps are found through
 * their lights, since nothing else reaches them, and missing them leaked a
 * 33.5 MB target per map change. `keepTextures` names textures that belong
 * to the session (the cel ramp every cel material shares, the craft's
 * included). The craft and other session roots must be handed back
 * (evictSessionRoots) before this runs. Returns what was freed.
 */
export function disposeSceneGraph(root, keepTextures) {
  const found = { geometries: new Set(), materials: new Set(), textures: new Set(), shadowMaps: new Set() };
  root.traverse((o) => {
    if (o.isLight && o.shadow && o.shadow.map) {
      found.shadowMaps.add(o.shadow.map);
    }
    if (o.geometry) {
      found.geometries.add(o.geometry);
    }
    for (const material of o.material ? [o.material].flat() : []) {
      found.materials.add(material);
      texturesOf(material).forEach((t) => found.textures.add(t));
    }
  });
  found.geometries.forEach((g) => g.dispose());
  found.materials.forEach((m) => m.dispose());
  const kept = [...found.textures].filter((t) => keepTextures && keepTextures.has(t));
  found.textures.forEach((t) => {
    if (!kept.includes(t)) {
      t.dispose();
    }
  });
  found.shadowMaps.forEach((target) => target.dispose());
  root.clear();
  return {
    geometries: found.geometries.size,
    materials: found.materials.size,
    textures: found.textures.size - kept.length,
    keptTextures: kept.length,
    shadowMaps: found.shadowMaps.size,
  };
}

/* Frees a replaced airframe. Nothing in a craft is shared: its meshes and
 * cel materials are made per build. */
function freeCraft(group) {
  group.traverse((o) => {
    o.geometry?.dispose();
    for (const m of o.material ? [o.material].flat() : []) {
      m?.dispose?.();
    }
  });
}

/* The craft's optional handles, each null on an aircraft without it:
 * control surfaces, a folding prop, the Bramor's parachute, flaps,
 * retracts, and a launch rail with its pose. */
const OPTIONAL_HANDLES = ['setSurfaces', 'setProp', 'setChute', 'setFlaps', 'setGear', 'launcher', 'launcherRest'];

/*
 * The session: renderer, camera and the flown airframe.
 *
 * opts.airframe is the aircraft to build. opts.pixelRatio and
 * opts.powerPreference are for the orbit thumbnail page, which must not
 * take a retina buffer or the high-performance GPU for a 480p clip, and
 * opts.desynchronized lets the canvas skip the compositor's frame queue
 * (felt in the sticks, invisible in the frame rate) at the cost of tearing;
 * it stays off unless asked, because the thumbnail page reads its frames
 * back and a buffer bypassing the compositor may read empty.
 */
export function buildShell(canvas, opts) {
  const options = opts || {};
  /*
   * The default framebuffer only ever receives a map's final full screen
   * quad, so it gets no depth or stencil (a browser's default D24S8 is
   * 8.3 MB of the 120 MB target budget nobody reads) and no antialiasing
   * (the post chains keep their own targets). high-performance, because
   * on a laptop with two GPUs "default" often wakes the integrated one;
   * a machine with only a software rasteriser still boots.
   */
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: options.powerPreference || 'high-performance',
    failIfMajorPerformanceCaveat: false,
    desynchronized: Boolean(options.desynchronized),
  });
  const pixelRatio = options.pixelRatio != null ? options.pixelRatio : Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  /* No filmic curve: it greys out the flat saturated colour the looks are
   * built on, and each map's last pass converts colour space itself. */
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;

  /*
   * Near 0.2 m: the eye is inside a 150 mm airframe, and a 4 cm near plane
   * left distant outlines without depth precision. The far plane is each
   * map's to set; 2600 m is the boot value. The lens starts at the default
   * until the pilot's settings apply (lens.js). Layers 1 (no ink) and 2
   * stay on so one camera suits every post chain.
   */
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEFAULT, 1, 0.2, 2600);
  camera.layers.enable(1);
  camera.layers.enable(2);

  let craft = buildCraft(options.airframe);

  /*
   * A map may restyle the airframe in its own look (swiss2 draws it
   * physically based; the rest keep the builders' cel): a function of a
   * built craft that restyles it and returns its undo. It goes on every
   * craft this shell builds and comes off before one is freed, repainted
   * or refitted, so no builder knows looks exist. The ghost is never
   * dressed.
   */
  const dress = { look: null, undo: null };
  function undress() {
    if (dress.undo) {
      dress.undo();
    }
  }
  function redress() {
    dress.undo = dress.look ? dress.look(craft) : null;
  }
  function setCraftLook(look) {
    undress();
    dress.look = look;
    redress();
  }

  /* The canvas fills the window by its stylesheet; inline sizes left by a
   * setSize that styled it would pin it, so they are cleared and the
   * window measured. */
  function resize() {
    canvas.style.width = '';
    canvas.style.height = '';
    const size = { w: Math.max(1, window.innerWidth), h: Math.max(1, window.innerHeight) };
    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
    return size;
  }
  resize();

  /*
   * Session roots: groups that live across maps but sit in a map's scene
   * while it is up (the craft, the ghost rig). A map's dispose calls
   * evictSessionRoots before freeing its graph, or it frees the aircraft
   * still being flown. The craft is always one, read when evicting rather
   * than registered, because swapCraft replaces its group; registering it
   * once would protect only the boot airframe.
   */
  const roots = new Set();
  function keepAcrossMaps(group) {
    if (group) {
      roots.add(group);
    }
    return group;
  }

  /* Detaches every session root found anywhere under `scene` (not only as
   * a direct child) and returns how many. */
  function evictSessionRoots(scene) {
    if (!scene) {
      return 0;
    }
    let detached = 0;
    for (const root of [craft.group, ...roots]) {
      let up = root ? root.parent : null;
      while (up && up !== scene) {
        up = up.parent;
      }
      if (up === scene) {
        root.removeFromParent();
        detached += 1;
      }
    }
    return detached;
  }

  const api = {
    renderer,
    camera,
    canvas,
    pixelRatio,
    resize,
    swapCraft,
    repaintCraft,
    redressCraft,
    craftPaint,
    setCraftLook,
    /* The seated map's look on another craft (the crash cam's replay
     * craft), returning its undo, or null with no look. */
    lookCraft: (other) => (dress.look ? dress.look(other) : null),
    keepAcrossMaps,
    evictSessionRoots,
  };
  /* The handles the shell publishes for the craft, set again on every
   * swap so nobody animates a freed rotor. */
  function publish(built) {
    api.quad = built.group;
    api.discs = built.discs;
    api.blades = built.blades;
    api.cameraMount = built.cameraMount;
    api.propSpin = built.propSpin;
    for (const name of OPTIONAL_HANDLES) {
      api[name] = built[name] ?? null;
    }
  }
  publish(craft);

  /*
   * Another aircraft, in the old one's place: same parent, pose and
   * visibility, the old one detached and freed, the look moved across.
   * Between runs only; main.js never swaps the aircraft under a pilot.
   */
  function swapCraft(airframeId) {
    const old = craft.group;
    const next = buildCraft(airframeId);
    next.group.position.copy(old.position);
    next.group.quaternion.copy(old.quaternion);
    next.group.visible = old.visible;
    if (old.parent) {
      const parent = old.parent;
      parent.add(next.group);
      parent.remove(old);
    }
    undress();
    freeCraft(old);
    craft = next;
    redress();
    publish(next);
    return next;
  }

  /* The craft painted again in its airframe's current livery, or fitted
   * with its current parts, in place: same meshes, so a wreck sharing its
   * materials follows. The look made its twins from the old state, so it
   * comes off first and goes back on after. */
  function repaintCraft(airframeId) {
    undress();
    dressLivery(craft, airframeId);
    redress();
  }

  function redressCraft(airframeId) {
    undress();
    dressParts(craft, airframeId);
    redress();
  }

  /* The paint read back for checks, as #rrggbb: each livery region, every
   * colour on a mesh drawn now (under a look, the look's twins), and the
   * finish, decals and wear. */
  function craftPaint(airframeId) {
    const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
    const drawn = new Set();
    craft.group.traverse((o) => {
      const m = o.material;
      if (o.isMesh && o.visible && m && !Array.isArray(m) && m.color) {
        drawn.add(hex(m.color.getHex()));
      }
    });
    const regions = craft.livery ? craft.livery.read() : null;
    return {
      id: airframeId,
      regions: regions && Object.fromEntries(Object.entries(regions).map(([k, v]) => [k, hex(v)])),
      drawn: [...drawn].sort(),
      finishes: readFinish(craft),
      decals: readDecals(craft),
      wear: readWear(craft),
    };
  }

  return api;
}
