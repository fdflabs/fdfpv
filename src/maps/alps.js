/*
 * alps.js: a Swiss valley for the wing.
 *
 * The airfield is flat because a first wing needs nothing in the way.
 * This is the opposite: a glacial valley six kilometres long, a floor of
 * meadow four hundred metres across with a grass strip and a village on
 * it, pine on the lower slopes, rock above, snow on the ridges a
 * kilometre and more over the floor, a side valley opening off the east
 * wall and a lake at the southern foot. A wing at cruise crosses the
 * floor in twenty seconds and needs the whole length to climb to a
 * ridge, which is what a valley is for.
 *
 * Everything is one heightfield. The mesh, the colour, the tree line,
 * the collider under the craft and the title's loop all read the same
 * function, so the ground the wing lands on is the ground it sees. The
 * shell samples height(x, z) under the craft every step and lays the
 * physics plane on it with the slope it finds there, so a hillside is a
 * hillside to the contact code and nothing here has to know about it.
 *
 * Shapes are procedural and seeded, so the valley is the same valley on
 * every load, and none of it touches the step clock: the plant never
 * reads this file.
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
import { Colliders } from '../game/collide.js';
import { disposeSceneGraph } from '../render/shell.js';
import { SESSION_TEXTURES } from '../render/session-textures.js';
import { celMaterial, updateCelTime } from '../render/celmat.js';
import { skyDome } from '../render/scene.js';
import { attachComposer } from './field.js';
import { yieldToPaint } from '../ui/loading.js';
import { qualityFor } from '../render/quality.js';
import { str } from '../strings/index.js';

/* The heightfield: a square this many metres on a side, centred on the
 * origin, sampled on a grid this fine. Thirty metre cells are coarse for a
 * hillside under a landing wing, which is why the floor near the strip is
 * flattened analytically rather than trusted to the grid. */
const FIELD = 6000;
const HALF = FIELD / 2;
const CELLS = 200;
const CELL = FIELD / CELLS;

/* The valley runs along z. Its floor is this wide before the walls start,
 * the walls reach the ridge line this far out, and the ridge stands this
 * high over the floor before the peaks are put on it. The Lauterbrunnen
 * floor is about a kilometre wide with walls of the same height; this is
 * a little tighter so a wing sees both walls at once. */
const FLOOR_HALF = 220;
const WALL_REACH = 2100;
const RIDGE = 1150;

/* The strip: grass, this long along the valley and this wide, at the
 * origin, and the village beside it. */
const STRIP_L = 160;
const STRIP_W = 12;
const STRIP_Y = 0.02;

/* The lake fills the basin at the south end; its surface is a hair below
 * the meadow so the shore reads. */
const LAKE_Z = 2150;
const LAKE_Y = -1.5;

/* Snow from here up on the average, wandering a hundred and fifty metres
 * either way with the noise, and never on a face steeper than this. */
const SNOW_LINE = 920;
const SNOW_MAX_SLOPE = 1.6;

/* The wing spawns on the strip facing north, down the valley. Yaw 0 is
 * forward along -z, see src/render/frame.js. */
const SPAWN = { x: 0, z: 40, yaw: 0 };

/* Alpine haze: the sky the field flies under, a longer fog so the far
 * ridges dissolve rather than end, and a camera that can see them. */
const HORIZON = 0xe9eef5;
const SUN_DIR = new THREE.Vector3(0.45, 0.62, 0.64).normalize();
const FOG_NEAR = 1200;
const FOG_FAR = 9000;
const CAMERA_FAR = 14000;

/* Deterministic, so it is the same valley every load. */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/*
 * Value noise on an integer lattice with a hash, and a few octaves of it.
 * Nothing here needs to be pretty at the texel level: the terrain is read
 * at thirty metres and the colour at six.
 */
function hash2(ix, iz) {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function smooth(t) {
  return t * t * (3 - 2 * t);
}
function noise2(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smooth(x - ix);
  const fz = smooth(z - iz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fz;
}
function fbm(x, z, octaves) {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += amp * (noise2(x * f + 17.3 * i, z * f - 9.1 * i) * 2 - 1);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}
function smoothstep(a, b, v) {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/*
 * The valley, analytically. The axis meanders a little so neither wall is
 * a ruler; the walls rise from the floor as a power so the foot is gentle
 * pasture and the top is rock; the ridge line carries peaks from the
 * noise; a side valley is cut out of the east wall; the south end drops
 * into the lake basin; and the strip's own ground is held dead flat.
 */
function terrainHeight(x, z) {
  const axis = 180 * Math.sin(z / 1500) + 60 * Math.sin(z / 430 + 1.2);
  const dx = x - axis;
  const across = Math.abs(dx);
  const wall = smoothstep(FLOOR_HALF, WALL_REACH, across);
  let h = Math.pow(wall, 1.35) * RIDGE;
  /* Peaks and shoulders on the walls, more the higher they stand. */
  h += (260 * fbm(x / 900, z / 900, 4) + 90 * fbm(x / 260, z / 260, 3)) * Math.pow(wall, 0.8);
  /* The side valley: a trough into the east wall a kilometre and a bit
   * north of the strip, deep where the wall is high. */
  if (dx > 0) {
    const t = Math.exp(-Math.pow((z + 1300) / 420, 2));
    h -= 0.55 * h * t;
  }
  /* The floor: pasture with a roll to it, and the lake basin at the
   * south end going below the water. */
  const floor = 1 - wall;
  h += floor * (7 * fbm(x / 300, z / 300, 3) + 3);
  const basin = smoothstep(LAKE_Z - 900, LAKE_Z - 150, z) * (1 - smoothstep(FLOOR_HALF + 150, FLOOR_HALF + 500, across));
  h -= basin * 22;
  /* The strip and the village stand on ground held flat. */
  const flat = (1 - smoothstep(STRIP_L / 2 + 40, STRIP_L / 2 + 220, Math.abs(z))) * (1 - smoothstep(60, 220, Math.abs(x)));
  h = h * (1 - flat) + 0 * flat;
  return h;
}

/*
 * The heightfield the mesh and the collider read, sampled once from the
 * analytic terrain and read back bilinearly. Bilinear so the plane the
 * shell lays under the craft is continuous across a cell edge; a step
 * there would read as a kerb to a landing wing.
 */
function buildHeightfield() {
  const n = CELLS + 1;
  const data = new Float32Array(n * n);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      data[j * n + i] = terrainHeight(-HALF + i * CELL, -HALF + j * CELL);
    }
  }
  const at = (i, j) => data[Math.max(0, Math.min(CELLS, j)) * n + Math.max(0, Math.min(CELLS, i))];
  const height = (x, z) => {
    const u = (x + HALF) / CELL;
    const v = (z + HALF) / CELL;
    const i = Math.floor(u);
    const j = Math.floor(v);
    const fu = Math.max(0, Math.min(1, u - i));
    const fv = Math.max(0, Math.min(1, v - j));
    const h00 = at(i, j);
    const h10 = at(i + 1, j);
    const h01 = at(i, j + 1);
    const h11 = at(i + 1, j + 1);
    return (h00 + (h10 - h00) * fu) + ((h01 + (h11 - h01) * fu) - (h00 + (h10 - h00) * fu)) * fv;
  };
  return { data, n, height };
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/*
 * The ground's colour, painted from the same terrain: meadow on the floor,
 * pasture above it, pine on the lower slopes where they are not too
 * steep, rock where they are and above the trees, snow over the line on
 * anything that would hold it. One texel is six metres.
 */
function groundTexture(field) {
  const PX = 1024;
  const step = FIELD / PX;
  return canvasTexture(PX, PX, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    const px = img.data;
    const meadow = [0x6f, 0x9a, 0x3e];
    const pasture = [0x8f, 0xa8, 0x52];
    const pine = [0x2c, 0x54, 0x2a];
    const rock = [0x7a, 0x78, 0x74];
    const scree = [0x97, 0x94, 0x8c];
    const snow = [0xf3, 0xf5, 0xf9];
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    for (let j = 0; j < h; j += 1) {
      const z = -HALF + (j + 0.5) * step;
      for (let i = 0; i < w; i += 1) {
        const x = -HALF + (i + 0.5) * step;
        const y = field.height(x, z);
        const sx = (field.height(x + step, z) - field.height(x - step, z)) / (2 * step);
        const sz = (field.height(x, z + step) - field.height(x, z - step)) / (2 * step);
        const slope = Math.hypot(sx, sz);
        const grain = fbm(x / 80, z / 80, 2);
        let c = mix(meadow, pasture, smoothstep(60, 500, y));
        const treeBand = smoothstep(40, 120, y) * (1 - smoothstep(620, 780, y + 60 * grain)) * (1 - smoothstep(0.55, 0.85, slope));
        c = mix(c, pine, treeBand);
        const rockiness = Math.max(smoothstep(0.7, 1.05, slope), smoothstep(780, 950, y + 40 * grain));
        c = mix(c, mix(rock, scree, 0.5 + 0.5 * grain), rockiness);
        const snowy = smoothstep(SNOW_LINE - 120, SNOW_LINE + 120, y + 150 * grain) * (1 - smoothstep(SNOW_MAX_SLOPE - 0.3, SNOW_MAX_SLOPE + 0.3, slope));
        c = mix(c, snow, snowy);
        const k = (j * w + i) * 4;
        const tone = 1 + 0.05 * grain;
        px[k] = Math.max(0, Math.min(255, c[0] * tone));
        px[k + 1] = Math.max(0, Math.min(255, c[1] * tone));
        px[k + 2] = Math.max(0, Math.min(255, c[2] * tone));
        px[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

/* The terrain mesh from the heightfield, a plane on its side with every
 * vertex lifted, normals computed so the cel shading reads the relief. */
function terrainMesh(field, tex) {
  const geo = new THREE.PlaneGeometry(FIELD, FIELD, CELLS, CELLS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position');
  for (let k = 0; k < pos.count; k += 1) {
    pos.setY(k, field.height(pos.getX(k), pos.getZ(k)));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, celMaterial({ color: 0xffffff, rim: 0.12, map: tex, key: 'alps-ground' }));
  mesh.receiveShadow = true;
  return mesh;
}

/*
 * Pines: one instanced cone, a few thousand of them on the lower slopes
 * where the ground colour says forest, thinning with height the way a
 * tree line does. Placed by the same noise as the paint so the trees stand
 * on the dark green rather than beside it. Colliders only within reach of
 * the strip: a wing that flies into the far forest hits the hillside first.
 */
function pines(field, rng, colliders) {
  const count = 3200;
  const geo = new THREE.ConeGeometry(4.2, 11, 6);
  geo.translate(0, 5.5, 0);
  const mat = celMaterial({ color: 0x2f5c2c, rim: 0.15 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  let placed = 0;
  let tries = 0;
  while (placed < count && tries < count * 40) {
    tries += 1;
    const x = (rng() - 0.5) * FIELD * 0.9;
    const z = (rng() - 0.5) * FIELD * 0.9;
    const y = field.height(x, z);
    if (y < 45 || y > 720) {
      continue;
    }
    const sx = (field.height(x + 12, z) - field.height(x - 12, z)) / 24;
    const sz = (field.height(x, z + 12) - field.height(x, z - 12)) / 24;
    if (Math.hypot(sx, sz) > 0.7) {
      continue;
    }
    if (Math.abs(x) < 140 && Math.abs(z) < STRIP_L / 2 + 120) {
      continue;
    }
    const density = (1 - smoothstep(560, 720, y)) * (0.55 + 0.45 * fbm(x / 140, z / 140, 2));
    if (rng() > density) {
      continue;
    }
    const scale = 0.8 + rng() * 0.6;
    p.set(x, y - 0.3, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);
    s.set(scale, scale * (0.9 + rng() * 0.3), scale);
    m.compose(p, q, s);
    mesh.setMatrixAt(placed, m);
    if (Math.hypot(x, z) < 600) {
      colliders.addPost('tree', x, z, y, y + 11 * s.y, 3.2 * scale);
    }
    placed += 1;
  }
  mesh.count = placed;
  mesh.castShadow = true;
  return { mesh, placed };
}

/*
 * A chalet: a stone lower floor, a timber upper, and a wide gable roof
 * with the eaves out past the walls, the one silhouette that says where
 * this is. The roof is a box on its edge, which at this scale reads as
 * a gable and costs six faces.
 */
function chalet(x, z, y, yaw, rng, mats) {
  const g = new THREE.Group();
  const w = 8 + rng() * 4;
  const d = 10 + rng() * 5;
  const stone = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, d), mats.stone);
  stone.position.y = 1.1;
  stone.castShadow = true;
  stone.receiveShadow = true;
  g.add(stone);
  const timber = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 2.6, d + 0.6), mats.timber);
  timber.position.y = 2.2 + 1.3;
  timber.castShadow = true;
  g.add(timber);
  const roofH = w * 0.55;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.78, w * 0.78, d + 2.4), mats.roof);
  roof.rotation.z = Math.PI / 4;
  roof.position.y = 4.8 + roofH * 0.35;
  roof.castShadow = true;
  g.add(roof);
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  return { group: g, w, d, top: 4.8 + roofH };
}

function church(x, z, y, mats) {
  const g = new THREE.Group();
  const nave = new THREE.Mesh(new THREE.BoxGeometry(9, 6, 16), mats.stone);
  nave.position.y = 3;
  nave.castShadow = true;
  g.add(nave);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(7, 7, 17.5), mats.roof);
  roof.rotation.z = Math.PI / 4;
  roof.position.y = 7.2;
  roof.castShadow = true;
  g.add(roof);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(4, 16, 4), mats.stone);
  tower.position.set(0, 8, -9);
  tower.castShadow = true;
  g.add(tower);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(2.9, 9, 4), mats.spire);
  spire.position.set(0, 20.5, -9);
  spire.rotation.y = Math.PI / 4;
  spire.castShadow = true;
  g.add(spire);
  g.position.set(x, y, z);
  return g;
}

function windsock(mastMat) {
  const g = new THREE.Group();
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 4.5, 8), mastMat);
  mast.position.y = 2.25;
  mast.castShadow = true;
  g.add(mast);
  const pivot = new THREE.Group();
  pivot.position.y = 4.5;
  const geo = new THREE.CylinderGeometry(0.28, 0.09, 1.8, 10, 1, true);
  geo.translate(0, -0.9, 0);
  geo.rotateZ(-Math.PI / 2);
  const sock = new THREE.Mesh(geo, celMaterial({ color: 0xf07a1a, rim: 0.1, side: THREE.DoubleSide }));
  sock.castShadow = true;
  pivot.add(sock);
  g.add(pivot);
  return { group: g, pivot };
}

async function buildAlps(shell, progress, q) {
  const renderer = shell.renderer;
  const camera = shell.camera;
  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(HORIZON);
  scene.fog = new THREE.Fog(HORIZON, FOG_NEAR, FOG_FAR);
  const sky = skyDome();
  sky.layers.set(1);
  scene.add(sky);
  camera.far = CAMERA_FAR;
  camera.updateProjectionMatrix();

  const sun = new THREE.DirectionalLight(0xfff1dc, 1.5);
  sun.castShadow = q.shadows;
  const shadowMap = q.field.shadowMap || 2048;
  const shadowHalf = q.field.shadowHalf || 72;
  sun.shadow.mapSize.set(shadowMap, shadowMap);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 600;
  sun.shadow.camera.left = -shadowHalf;
  sun.shadow.camera.right = shadowHalf;
  sun.shadow.camera.top = shadowHalf;
  sun.shadow.camera.bottom = -shadowHalf;
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 0.05;
  scene.add(sun);
  scene.add(sun.target);
  scene.add(new THREE.HemisphereLight(0xa9c4e6, 0x55703a, 0.5));
  progress(0.1);
  await yieldToPaint();

  const field = buildHeightfield();
  const ground = terrainMesh(field, groundTexture(field));
  scene.add(ground);
  progress(0.45);
  await yieldToPaint();

  /* The lake: a plane at its level inside the basin the terrain dips
   * into. The floor under it is painted meadow, which the water hides. */
  const lake = new THREE.Mesh(
    new THREE.PlaneGeometry(1500, 1500),
    celMaterial({ color: 0x3e6f8e, rim: 0.35, rimColor: 0xdfeeff }),
  );
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(0, LAKE_Y, LAKE_Z);
  scene.add(lake);

  /* The strip, on the flat the terrain holds for it. */
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(STRIP_W, STRIP_L),
    celMaterial({ color: 0x8fb04a, rim: 0 }),
  );
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(0, STRIP_Y, 0);
  strip.receiveShadow = true;
  scene.add(strip);

  const colliders = new Colliders();
  const rng = makeRng(20260924);
  const forest = pines(field, rng, colliders);
  scene.add(forest.mesh);
  progress(0.7);
  await yieldToPaint();

  /* The village: a dozen chalets west of the strip and a church at its
   * head, each on the ground it stands on. */
  const mats = {
    stone: celMaterial({ color: 0xbfb8ad, rim: 0.12 }),
    timber: celMaterial({ color: 0x8a5a33, rim: 0.12 }),
    roof: celMaterial({ color: 0x5b4636, rim: 0.1 }),
    spire: celMaterial({ color: 0x6a6d72, rim: 0.2 }),
  };
  let houses = 0;
  for (let i = 0; i < 12; i += 1) {
    const x = -60 - (i % 3) * 26 - rng() * 6;
    const z = -70 + Math.floor(i / 3) * 34 + rng() * 8;
    const y = field.height(x, z);
    const h = chalet(x, z, y, (rng() - 0.5) * 0.6, rng, mats);
    scene.add(h.group);
    colliders.addBox('wall', x - h.w / 2 - 0.5, y, z - h.d / 2 - 0.5, x + h.w / 2 + 0.5, y + h.top, z + h.d / 2 + 0.5);
    houses += 1;
  }
  const churchZ = -STRIP_L / 2 - 60;
  const churchY = field.height(-40, churchZ);
  scene.add(church(-40, churchZ, churchY, mats));
  colliders.addBox('wall', -45, churchY, churchZ - 9, -35, churchY + 10, churchZ + 8);
  colliders.addBox('wall', -42, churchY, churchZ - 11, -38, churchY + 25, churchZ - 7);

  const mastMat = celMaterial({ color: 0xd7dbe0, rim: 0.2 });
  const sock = windsock(mastMat);
  sock.group.position.set(STRIP_W / 2 + 6, field.height(STRIP_W / 2 + 6, 30), 30);
  scene.add(sock.group);
  colliders.addPost('pole', STRIP_W / 2 + 6, 30, sock.group.position.y, sock.group.position.y + 4.5, 0.045);
  colliders.build();
  progress(0.9);
  await yieldToPaint();

  scene.add(shell.quad);
  renderer.compile(scene, camera);
  progress(1);

  const shadowTexel = q.field.shadowMap > 0 ? (2 * shadowHalf) / q.field.shadowMap : 0;
  const shadowFocus = new THREE.Vector3();
  function updateShadowFocus(target) {
    if (shadowTexel > 0) {
      shadowFocus.set(
        Math.round(target.x / shadowTexel) * shadowTexel,
        Math.round(target.y / shadowTexel) * shadowTexel,
        Math.round(target.z / shadowTexel) * shadowTexel,
      );
    } else {
      shadowFocus.copy(target);
    }
    sun.position.copy(shadowFocus).addScaledVector(SUN_DIR, 260);
    sun.target.position.copy(shadowFocus);
    sun.target.updateMatrixWorld();
  }

  /* Wall clock decoration only: the sock swings to a valley wind that
   * blows up the valley by day. Nothing here is solid. */
  function updateWind(t) {
    updateCelTime(t);
    sock.pivot.rotation.y = Math.PI * 0.5 + Math.sin(t * 0.31) * 0.3 + Math.sin(t * 1.7) * 0.05;
    sock.pivot.rotation.z = -0.25 + Math.sin(t * 0.57) * 0.12;
  }

  /*
   * The title shot: a long loop up the valley and back at a hundred and
   * fifty metres over whatever is under it, so the strip, the village,
   * the lake and the side valley each cross the frame once a lap.
   * scripts/attract-check.js walks it against the terrain.
   */
  const attractPath = [];
  for (let i = 0; i < 36; i += 1) {
    const a = (i / 36) * Math.PI * 2;
    const x = Math.sin(a) * 260;
    const z = Math.cos(a) * 1500 + 200;
    attractPath.push({ x, y: field.height(x, z) + 150, z });
  }

  /* The relief the world is claimed to have, measured off the built
   * field rather than restated from the constants. */
  let floorWidth = 0;
  for (let x = -HALF; x <= HALF; x += CELL) {
    if (field.height(x, SPAWN.z) < 60) {
      floorWidth += CELL;
    }
  }
  let ridge = 0;
  for (let k = 0; k < field.data.length; k += 1) {
    ridge = Math.max(ridge, field.data[k]);
  }

  const AIM = { active: false, sceneIndex: -1, correct: true, distance: 0 };
  return {
    id: 'alps',
    name: str('registry.the_alps'),
    mode: 'freestyle',
    graphics: q.id,
    scene,
    colliders,
    gates: [],
    curve: null,
    spawn: SPAWN,
    notes: [],
    attract: {
      path: attractPath,
      speed: 22,
      lookAhead: 40,
      aimDrop: 8,
    },
    /* The terrain itself, plus the strip's two centimetres and the lake's
     * surface: a wing that lands on the water rests on it rather than in
     * the basin. fromY is taken for the shell's call shape and ignored:
     * nothing here is a deck a craft could be under. */
    height: (x, z) => {
      const h = field.height(x, z);
      if (Math.abs(x) <= STRIP_W / 2 && Math.abs(z) <= STRIP_L / 2) {
        return Math.max(h, STRIP_Y);
      }
      return h < LAKE_Y ? LAKE_Y : h;
    },
    setNextGate() {},
    targetAim: () => AIM,
    approachSide: () => null,
    hasRacingLine: false,
    setRacingLine() {},
    updateRacingLine() { return null; },
    updateShadowFocus,
    updateWind,
    updateAnim() {},
    references: {
      valleyFloorWidth: {
        measured: floorWidth,
        unit: 'm',
        real: str('references.400_to_1000'),
      },
      ridgeOverFloor: {
        measured: Math.round(ridge),
        unit: 'm',
        real: str('references.1000_to_1500'),
      },
      stripLength: {
        measured: strip.geometry.parameters.height,
        unit: 'm',
        real: '160',
      },
    },
    stats: () => ({
      colliders: colliders.stats(),
      pines: forest.placed,
      houses,
    }),
    dispose() {
      shell.evictSessionRoots(scene);
      disposeSceneGraph(scene, SESSION_TEXTURES);
    },
  };
}

/* The race field's composer on top, and its dispose folded into ours, the
 * same as the airfield. */
export async function buildMap(shell, onProgress, options) {
  const progress = onProgress ?? (() => {});
  const q = qualityFor(options && options.quality);
  return attachComposer(shell, await buildAlps(shell, progress, q), q);
}
