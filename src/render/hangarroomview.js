/*
 * hangarroomview.js: the walkable hangar drawn (docs/HANGAR-ROOM.md). The
 * floor plan and the walk are src/game/hangarroom.js's; this builds what
 * they describe and draws it into the shell's own canvas.
 *
 * CHEAP BY CONSTRUCTION. Every wall, beam and piece of furniture is
 * merged at build into one mesh per material: a lit one, flat shaded with
 * vertex colours and no texture, and an unlit one for what gives light
 * (screens, lamps, the daylight through the door). So the room is three
 * draws however much furniture stands in it, and a layout change is a
 * rebuild, which is rare. The pilot is the Interior's people
 * (src/render/interior/figures.js), one instance, one draw. The aircraft
 * on its stand is the flown model, one draw a part.
 *
 * NO SECOND CONTEXT, as carousel3d.js: the shell's renderer draws the room
 * into a target with a depth buffer (the canvas has none) and the target
 * is copied to the canvas, converted to sRGB by hand since the map's post
 * chain owns the renderer's output space. The renderer's state is put
 * back as it was found.
 *
 * `naive` builds one mesh per piece with its own material, the way a room
 * is usually first written: scripts/hangar-room-perf.js draws both to
 * show what the merge saves. Nothing else asks for it.
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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  CELL, ROOMS, LAYOUTS, frontHeading, placement,
} from '../game/hangarroom.js';
import { makeFigures } from './interior/figures.js';

/* Linear colours. The worlds outside are pale sky over olive ground
 * (assets/gate/hangar.jpg); inside, bare concrete, pale corrugated steel,
 * dark steel, plywood, and the red the stock planes wear. */
const C = {
  floor: [0.32, 0.31, 0.29],
  floorB: [0.29, 0.285, 0.27],
  wall: [0.42, 0.47, 0.5],
  wallB: [0.36, 0.41, 0.44],
  skirt: [0.08, 0.085, 0.09],
  steel: [0.06, 0.065, 0.07],
  ceiling: [0.12, 0.13, 0.14],
  wood: [0.36, 0.22, 0.11],
  ply: [0.55, 0.42, 0.26],
  red: [0.55, 0.06, 0.04],
  olive: [0.2, 0.2, 0.08],
  blue: [0.06, 0.12, 0.25],
  black: [0.02, 0.02, 0.022],
  gold: [0.62, 0.42, 0.1],
  silver: [0.5, 0.52, 0.55],
  plinth: [0.1, 0.11, 0.12],
  door: [0.3, 0.33, 0.33],
};
/* Unlit colours, linear: what is seen through the door, a lamp, a screen. */
const L = {
  skyTop: [0.5, 0.62, 0.78],
  skyLow: [0.72, 0.78, 0.84],
  ground: [0.2, 0.2, 0.08],
  lamp: [1.6, 1.55, 1.4],
  screen: [0.08, 0.16, 0.22],
  ring: [0.25, 1.0, 0.55],
};

/* The roller door's opening, m: wide enough to carry the Bramor out. */
const DOOR_W = { garage: 2.6, workshop: 3.6, airfield: 14 };
const DOOR_H = { garage: 2.2, workshop: 3.2, airfield: 5.6 };
/* The stand's deck height, m. */
export const STAND_TOP = 0.55;

/* The follow camera: behind the pilot and above, looking at the chest. */
const CAM_BACK = 3.0;
const CAM_UP = 1.7;
const LOOK_UP = 1.15;
const CAM_FOV = 60;
/* The follow spring, radians a second. */
const CAM_OMEGA = 6;

/*
 * A piece list: boxes and cylinders, each with a colour, put in a frame.
 * Built non indexed with a colour per vertex, so the whole room merges
 * into one geometry.
 */
function pieces() {
  const list = [];
  const m = new THREE.Matrix4();
  const add = (g, colour, x, y, z, ry = 0) => {
    const ng = g.index ? g.toNonIndexed() : g;
    ng.deleteAttribute('uv');
    m.makeRotationY(ry).setPosition(x, y, z);
    ng.applyMatrix4(m);
    const n = ng.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      col.set(colour, i * 3);
    }
    ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
    list.push(ng);
    return ng;
  };
  return {
    list,
    /* A box by its size and the centre of its base. */
    box: (w, h, d, colour, x, y, z, ry) => add(new THREE.BoxGeometry(w, h, d), colour, x, y + h / 2, z, ry),
    cyl: (r, h, colour, x, y, z, seg = 8) => add(new THREE.CylinderGeometry(r, r, h, seg), colour, x, y + h / 2, z),
    /* A flat quad facing +z, by its centre. */
    quad: (w, h, colour, x, y, z, ry = 0) => add(new THREE.PlaneGeometry(w, h), colour, x, y, z, ry),
    raw: (g, colour) => add(g, colour, 0, 0, 0),
  };
}

/*
 * The furniture, each in its own frame: the footprint's centre on the
 * floor, its front to +z, sizes w by d in metres. `lit` takes the solid
 * parts, `glow` what gives light.
 */
const FURNITURE = {
  stand(lit, glow) {
    lit.cyl(0.95, STAND_TOP - 0.02, C.plinth, 0, 0, 0, 12);
    lit.cyl(0.9, 0.02, C.steel, 0, STAND_TOP - 0.02, 0, 12);
    const ring = new THREE.RingGeometry(0.86, 0.9, 32).rotateX(-Math.PI / 2).translate(0, STAND_TOP + 0.002, 0);
    glow.raw(ring, L.ring);
  },
  bench(lit) {
    lit.box(1.95, 0.05, 0.8, C.ply, 0, 0.86, 0.05);
    for (const x of [-0.9, 0.9]) {
      for (const z of [-0.28, 0.38]) {
        lit.box(0.06, 0.86, 0.06, C.steel, x, 0, z);
      }
    }
    lit.box(1.85, 0.03, 0.6, C.wood, 0, 0.18, 0.05);
    /* A pegboard on the wall behind, tools on it, a vise on the top. */
    lit.box(1.9, 0.9, 0.03, C.ply, 0, 1.0, -0.46);
    for (const [x, y, w, h, c] of [[-0.7, 1.3, 0.05, 0.35, C.red], [-0.55, 1.35, 0.04, 0.3, C.black], [-0.4, 1.32, 0.05, 0.25, C.blue],
      [0.1, 1.15, 0.5, 0.04, C.steel], [0.1, 1.5, 0.4, 0.04, C.steel], [0.6, 1.25, 0.18, 0.35, C.red]]) {
      lit.box(w, h, 0.04, c, x, y, -0.43);
    }
    lit.box(0.18, 0.12, 0.2, C.blue, 0.75, 0.91, 0.2);
    lit.box(0.3, 0.08, 0.22, C.olive, -0.4, 0.91, 0.15);
  },
  shelf(lit) {
    for (const x of [-0.72, 0.72]) {
      lit.box(0.04, 2.0, 0.42, C.steel, x, 0, -0.02);
    }
    const bins = [C.red, C.olive, C.blue, C.ply];
    for (let k = 0; k < 4; k += 1) {
      const y = 0.12 + k * 0.5;
      lit.box(1.44, 0.03, 0.42, C.steel, 0, y, -0.02);
      for (let b = 0; b < 3; b += 1) {
        lit.box(0.36, 0.2, 0.32, bins[(k + b) % 4], -0.45 + b * 0.45, y + 0.03, 0);
      }
    }
  },
  shop(lit, glow) {
    lit.box(0.95, 0.04, 0.48, C.ply, 0, 0.74, 0);
    for (const x of [-0.43, 0.43]) {
      lit.box(0.04, 0.74, 0.44, C.steel, x, 0, 0);
    }
    lit.box(0.36, 0.02, 0.24, C.black, 0, 0.78, 0.06);
    lit.box(0.36, 0.24, 0.015, C.black, 0, 0.79, -0.07, 0);
    glow.quad(0.32, 0.2, L.screen, 0, 0.91, -0.06);
  },
  trophies(lit) {
    lit.box(1.9, 1.3, 0.04, C.wood, 0, 0.9, -0.21);
    for (let k = 0; k < 3; k += 1) {
      const y = 1.05 + k * 0.38;
      lit.box(1.8, 0.03, 0.2, C.wood, 0, y, -0.1);
      for (let t = 0; t < 4; t += 1) {
        const x = -0.66 + t * 0.44;
        lit.cyl(0.04, 0.05, C.black, x, y + 0.03, -0.1);
        lit.cyl(0.05, 0.16, (t + k) % 3 ? C.silver : C.gold, x, y + 0.08, -0.1, 7);
      }
    }
  },
  tv(lit, glow) {
    lit.box(1.45, 0.48, 0.42, C.wood, 0, 0, 0);
    lit.box(1.25, 0.74, 0.05, C.black, 0, 0.62, -0.08);
    glow.quad(1.17, 0.66, L.screen, 0, 0.99, -0.05);
  },
  chest(lit) {
    lit.box(0.86, 1.0, 0.44, C.red, 0, 0.06, 0);
    for (let k = 0; k < 5; k += 1) {
      lit.box(0.8, 0.012, 0.01, C.black, 0, 0.2 + k * 0.17, 0.225);
    }
    for (const x of [-0.36, 0.36]) {
      lit.cyl(0.03, 0.06, C.black, x, 0, 0.16);
    }
  },
  couch(lit) {
    lit.box(1.9, 0.42, 0.85, C.olive, 0, 0, 0.02);
    lit.box(1.9, 0.5, 0.2, C.olive, 0, 0.42, -0.31);
    for (const x of [-0.88, 0.88]) {
      lit.box(0.16, 0.22, 0.85, C.olive, x, 0.42, 0.02);
    }
  },
  crates(lit) {
    lit.box(0.95, 0.6, 0.95, C.ply, 0, 0, 0);
    lit.box(0.7, 0.45, 0.6, C.wood, 0.05, 0.6, 0.05, 0.3);
  },
};

/* The room's shell: floor, walls with the door in the +z one, a ceiling
 * or roof beams, lamps, and what the door looks out on. */
function buildShell(tier, lit, glow) {
  const room = ROOMS[tier];
  const W = room.w * CELL;
  const D = room.d * CELL;
  const H = room.h;
  /* Floor slabs a metre square, alternately a shade apart. */
  for (let x = 0; x < W; x += 1) {
    for (let z = 0; z < D; z += 1) {
      const w = Math.min(1, W - x);
      const d = Math.min(1, D - z);
      lit.box(w, 0.02, d, (Math.floor(x) + Math.floor(z)) % 2 ? C.floor : C.floorB, x + w / 2 - W / 2, -0.02, z + d / 2 - D / 2);
    }
  }
  /* Walls: corrugated, strips a quarter metre wide in two shades. */
  const strips = (len, ry, place) => {
    for (let s = 0; s < len; s += 0.5) {
      const w = Math.min(0.5, len - s);
      place(s, w, ry);
    }
  };
  strips(W, 0, (s, w) => {
    lit.box(w / 2, H, 0.04, C.wall, s + w / 4 - W / 2, 0, -D / 2 - 0.02);
    lit.box(w / 2, H, 0.04, C.wallB, s + (3 * w) / 4 - W / 2, 0, -D / 2 - 0.01);
  });
  for (const side of [-1, 1]) {
    strips(D, 0, (s, w) => {
      lit.box(0.04, H, w / 2, C.wall, side * (W / 2 + 0.02), 0, s + w / 4 - D / 2);
      lit.box(0.04, H, w / 2, C.wallB, side * (W / 2 + 0.01), 0, s + (3 * w) / 4 - D / 2);
    });
  }
  const dw = DOOR_W[tier];
  const dh = DOOR_H[tier];
  const side = (W - dw) / 2;
  lit.box(side, H, 0.06, C.wall, -W / 2 + side / 2, 0, D / 2);
  lit.box(side, H, 0.06, C.wall, W / 2 - side / 2, 0, D / 2);
  lit.box(dw, H - dh, 0.06, C.wall, 0, dh, D / 2);
  /* The door rolled up into its drum, and its frame. */
  lit.box(dw + 0.2, 0.3, 0.3, C.door, 0, dh, D / 2 - 0.1);
  for (const sx of [-1, 1]) {
    lit.box(0.1, dh, 0.12, C.steel, sx * (dw / 2 + 0.05), 0, D / 2);
  }
  /* A dark skirting all round. */
  lit.box(W, 0.12, 0.02, C.skirt, 0, 0, -D / 2 + 0.01);
  for (const sx of [-1, 1]) {
    lit.box(0.02, 0.12, D, C.skirt, sx * (W / 2 - 0.01), 0, 0);
  }
  /* The ceiling, and in the bigger rooms steel beams under it every few
   * metres. */
  lit.box(W, 0.04, D, C.ceiling, 0, H, 0);
  if (tier !== 'garage') {
    const step = tier === 'airfield' ? 4 : 2.5;
    for (let z = -D / 2 + step; z < D / 2 - 0.1; z += step) {
      lit.box(W, 0.25, 0.12, C.steel, 0, H - 0.25, z);
    }
  }
  /* Lamps: strips under the ceiling over the floor's long axis. */
  const lampRows = tier === 'airfield' ? 4 : 2;
  for (let r = 0; r < lampRows; r += 1) {
    const x = -W / 2 + ((r + 0.5) * W) / lampRows;
    glow.raw(new THREE.PlaneGeometry(0.18, D * 0.7).rotateX(Math.PI / 2).translate(x, H - 0.3, 0), L.lamp);
  }
  /* Outside the door: olive ground to a pale horizon. Unlit, so the open
   * door is the brightest thing in the room. */
  const far = D / 2 + 6;
  const sky = new THREE.PlaneGeometry(dw * 4, dh * 3, 1, 2).rotateY(Math.PI).translate(0, dh * 1.5, far);
  const g = glow.raw(sky, L.skyTop);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const t = Math.min(1, pos.getY(i) / (dh * 3));
    g.attributes.color.setXYZ(i, ...L.skyLow.map((v, k) => v + (L.skyTop[k] - v) * t));
  }
  glow.raw(new THREE.PlaneGeometry(dw * 4, 6).rotateX(-Math.PI / 2).translate(0, -0.01, D / 2 + 3), L.ground);
}

function build(tier, layout, { naive = false } = {}) {
  const lit = pieces();
  const glow = pieces();
  buildShell(tier, lit, glow);
  const shellCount = { lit: lit.list.length, glow: glow.list.length };
  const room = ROOMS[tier];
  const perPiece = [];
  for (const item of layout) {
    const before = { lit: lit.list.length, glow: glow.list.length };
    const p = placement(room, item);
    const ry = Math.PI - frontHeading(item);
    const pl = pieces();
    const pg = pieces();
    FURNITURE[item.kind](pl, pg);
    const m = new THREE.Matrix4().makeRotationY(ry).setPosition(p.x, 0, p.z);
    for (const g of pl.list) {
      lit.list.push(g.applyMatrix4(m));
    }
    for (const g of pg.list) {
      glow.list.push(g.applyMatrix4(m));
    }
    perPiece.push({ lit: lit.list.slice(before.lit), glow: glow.list.slice(before.glow) });
  }
  const group = new THREE.Group();
  group.name = 'hangar-room';
  const litMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, flatShading: true });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const materials = [litMat, glowMat];
  const add = (geos, mat, casts) => {
    if (!geos.length) {
      return;
    }
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    mesh.receiveShadow = mat.isMeshStandardMaterial;
    mesh.castShadow = casts;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  };
  /* The walls and ceiling take shadows and cast none: the light is the
   * lamps', from under the ceiling, which a ceiling that cast would put
   * the whole room in the shade of. */
  if (!naive) {
    add(lit.list.slice(0, shellCount.lit), litMat, false);
    add(lit.list.slice(shellCount.lit), litMat, true);
    add(glow.list, glowMat, false);
  } else {
    add(lit.list.slice(0, shellCount.lit), litMat, false);
    add(glow.list.slice(0, shellCount.glow), glowMat, false);
    for (const part of perPiece) {
      for (const g of part.lit) {
        const mat = litMat.clone();
        materials.push(mat);
        add([g], mat, true);
      }
      for (const g of part.glow) {
        add([g], glowMat, false);
      }
    }
  }
  return {
    group,
    dispose() {
      group.traverse((o) => o.geometry && o.geometry.dispose());
      materials.forEach((mat) => mat.dispose());
    },
  };
}

const BLIT_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;
const BLIT_FRAG = `
uniform sampler2D map;
varying vec2 vUv;
vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
void main() {
  gl_FragColor = vec4(toSrgb(clamp(texture2D(map, vUv).rgb, 0.0, 1.0)), 1.0);
}`;

/*
 * The room's view: { scene, camera, setRoom(tier, layout), setCraft(obj),
 * update(dt, pose, ms, orbit), draw(), stats(), dispose() }. graphics is
 * the quality preset (src/render/quality.js): multisampling off and no
 * shadow map on Low.
 */
export function createRoomView(renderer, { graphics, naive = false } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0, 0, 0);
  const camera = new THREE.PerspectiveCamera(CAM_FOV, 1, 0.05, 120);
  scene.add(new THREE.HemisphereLight(0xd8e2ea, 0x3a3a26, 1.1));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.0);
  scene.add(sun, sun.target);
  const shadows = graphics.shadows;
  sun.castShadow = shadows;
  if (shadows) {
    sun.shadow.mapSize.set(graphics.field.shadowMap, graphics.field.shadowMap);
    sun.shadow.bias = -0.0005;
  }
  const pilot = makeFigures(THREE, { cap: 1 });
  scene.add(pilot.group);
  const craftSlot = new THREE.Group();
  scene.add(craftSlot);

  let built = null;
  let tier = null;
  const samples = graphics.id === 'low' ? 0 : 4;
  const target = new THREE.WebGLRenderTarget(2, 2, { samples, depthBuffer: true, type: THREE.HalfFloatType });
  const blitMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: target.texture } }, vertexShader: BLIT_VERT, fragmentShader: BLIT_FRAG, depthTest: false, depthWrite: false,
  });
  const blit = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blitMat);
  blit.frustumCulled = false;
  const blitScene = new THREE.Scene();
  blitScene.add(blit);
  const blitCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const size = new THREE.Vector2();
  const cam = { x: 0, y: CAM_UP, z: 0, vx: 0, vy: 0, vz: 0, placed: false };
  const look = new THREE.Vector3();
  const info = { calls: 0, triangles: 0 };

  function setRoom(nextTier, layout = LAYOUTS[nextTier]) {
    if (built) {
      built.dispose();
      scene.remove(built.group);
    }
    tier = nextTier;
    built = build(tier, layout, { naive });
    scene.add(built.group);
    const room = ROOMS[tier];
    const W = room.w * CELL;
    const D = room.d * CELL;
    /* The lamps' light, from under the ceiling and a little toward the
     * door, so a shadow falls just behind what casts it. */
    sun.position.set(-W * 0.08, room.h - 0.2, D * 0.12);
    sun.target.position.set(0, 0, -D * 0.05);
    if (shadows) {
      const half = Math.max(W, D) * 0.6;
      Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 0.05, far: room.h * 2 });
      sun.shadow.camera.updateProjectionMatrix();
    }
    const stand = layout.find((it) => it.kind === 'stand');
    if (stand) {
      const p = placement(room, stand);
      craftSlot.position.set(p.x, STAND_TOP, p.z);
    }
    cam.placed = false;
  }

  /*
   * The aircraft on the stand, nose to the door, its lowest point on the
   * deck: a craft builder's object (src/render/craft.js), parked as the
   * picker parks it (no launcher, chute or prop blur). It stands still,
   * so what is drawn is a copy merged into one mesh per material: the
   * Bramor's 51 shown parts are 51 draws and 51 more for its shadow
   * otherwise, more than the whole room. The caller keeps the original;
   * a repaint is a new setCraft.
   */
  let parked = null;
  function setCraft(craft) {
    if (parked) {
      /* A loose part's geometry is the caller's craft's. */
      parked.traverse((o) => o.geometry && !o.userData.borrowed && o.geometry.dispose());
      parked = null;
    }
    craftSlot.clear();
    if (!craft) {
      return;
    }
    if (craft.launcher) {
      craft.launcher.visible = false;
    }
    if (craft.setChute) {
      craft.setChute(0);
    }
    for (const d of craft.discs || []) {
      d.visible = false;
    }
    const g = craft.group;
    g.updateMatrixWorld(true);
    const toCraft = new THREE.Matrix4().copy(g.matrixWorld).invert();
    const buckets = new Map();
    const loose = [];
    g.traverse((o) => {
      if (!o.isMesh) {
        return;
      }
      for (let p = o; p && p !== g.parent; p = p.parent) {
        if (!p.visible) {
          return;
        }
      }
      const m = new THREE.Matrix4().multiplyMatrices(toCraft, o.matrixWorld);
      if (o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material)) {
        loose.push(o);
        return;
      }
      const geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(m);
      if (!buckets.has(o.material)) {
        buckets.set(o.material, []);
      }
      buckets.get(o.material).push(geo);
    });
    parked = new THREE.Group();
    for (const [mat, geos] of buckets) {
      /* Only the attributes every part has, so the parts merge. */
      const names = Object.keys(geos[0].attributes).filter((n) => geos.every((x) => x.attributes[n]));
      for (const x of geos) {
        Object.keys(x.attributes).filter((n) => !names.includes(n)).forEach((n) => x.deleteAttribute(n));
        x.morphAttributes = {};
      }
      const merged = mergeGeometries(geos);
      const parts = merged ? [merged] : geos;
      if (merged) {
        geos.forEach((x) => x.dispose());
      }
      for (const geo of parts) {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        parked.add(mesh);
      }
    }
    for (const o of loose) {
      const c = o.clone();
      c.userData.borrowed = true;
      new THREE.Matrix4().multiplyMatrices(toCraft, o.matrixWorld).decompose(c.position, c.quaternion, c.scale);
      parked.add(c);
    }
    const box = new THREE.Box3().setFromObject(parked, true);
    parked.rotation.set(0, Math.PI, 0);
    parked.position.y = Number.isFinite(box.min.y) ? -box.min.y : 0;
    craftSlot.add(parked);
  }

  /* The camera's spring toward where it wants to be: behind the pilot,
   * turned by `orbit` radians, kept inside the walls and under the
   * ceiling. */
  function follow(dt, pose, orbit) {
    const room = ROOMS[tier];
    const W = (room.w * CELL) / 2 - 0.15;
    const D = (room.d * CELL) / 2 - 0.15;
    const h = pose.heading + orbit;
    let bx = -Math.sin(h) * CAM_BACK;
    let bz = Math.cos(h) * CAM_BACK;
    /* Pulled in along the line to the pilot when a wall is in the way. */
    let s = 1;
    if (Math.abs(pose.x + bx) > W) {
      s = Math.min(s, (W * Math.sign(bx) - pose.x) / bx);
    }
    if (Math.abs(pose.z + bz) > D) {
      s = Math.min(s, (D * Math.sign(bz) - pose.z) / bz);
    }
    s = Math.max(0.25, s);
    bx *= s;
    bz *= s;
    const want = [pose.x + bx, Math.min(room.h - 0.25, CAM_UP + (1 - s) * 0.6), pose.z + bz];
    if (!cam.placed) {
      [cam.x, cam.y, cam.z] = want;
      cam.vx = 0;
      cam.vy = 0;
      cam.vz = 0;
      cam.placed = true;
    }
    /* Critically damped, as hangarstage.js's rig. */
    const k = CAM_OMEGA * CAM_OMEGA;
    const c = 2 * CAM_OMEGA;
    const step = Math.min(dt, 0.05);
    for (const [p, v, w] of [['x', 'vx', want[0]], ['y', 'vy', want[1]], ['z', 'vz', want[2]]]) {
      cam[v] += (k * (w - cam[p]) - c * cam[v]) * step;
      cam[p] += cam[v] * step;
    }
    camera.position.set(cam.x, cam.y, cam.z);
    look.set(pose.x, LOOK_UP, pose.z);
    camera.lookAt(look);
  }

  return {
    scene,
    camera,
    craftSlot,
    setRoom,
    setCraft,
    /* pose { x, z, heading, moving } from hangarroom.js's walk; ms the
     * clock for the stride. */
    update(dt, pose, ms, orbit = 0) {
      pilot.set([{
        x: pose.x, y: 0, z: pose.z, heading: pose.heading, action: pose.moving ? 'walk' : 'stand', tint: [0.1, 0.13, 0.15], seed: 2,
      }], ms);
      follow(dt, pose, orbit);
    },
    draw() {
      renderer.getDrawingBufferSize(size);
      if (target.width !== size.x || target.height !== size.y) {
        target.setSize(size.x, size.y);
      }
      camera.aspect = size.x / Math.max(1, size.y);
      camera.updateProjectionMatrix();
      const was = {
        target: renderer.getRenderTarget(),
        autoClear: renderer.autoClear,
        shadows: renderer.shadowMap.enabled,
      };
      renderer.shadowMap.enabled = shadows;
      renderer.autoClear = true;
      renderer.setRenderTarget(target);
      /* Counted by hand round the draw: three resets its counters after
       * the shadow pass, which would leave that pass out. */
      const autoReset = renderer.info.autoReset;
      renderer.info.autoReset = false;
      const c0 = renderer.info.render.calls;
      const t0 = renderer.info.render.triangles;
      renderer.render(scene, camera);
      info.calls = renderer.info.render.calls - c0;
      info.triangles = renderer.info.render.triangles - t0;
      renderer.info.autoReset = autoReset;
      renderer.setRenderTarget(null);
      renderer.render(blitScene, blitCam);
      renderer.setRenderTarget(was.target);
      renderer.autoClear = was.autoClear;
      renderer.shadowMap.enabled = was.shadows;
    },
    stats: () => ({ ...info, tier }),
    dispose() {
      if (built) {
        built.dispose();
      }
      setCraft(null);
      pilot.dispose();
      sun.shadow.dispose();
      target.dispose();
      blitMat.dispose();
      blit.geometry.dispose();
    },
  };
}
