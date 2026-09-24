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
import { makeVehicle, CAR } from './city/vendored/world/vehicles.js';
import {
  villageMaterials, makeBake, bakeAll, chalet, barn, church, hangar, fence, cow,
  pineForest, broadleafGrove, ribbon, alongRibbon,
} from './alps-kit.js';

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
const RIDGE = 1400;

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
const SNOW_LINE = 700;
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
function valleyAxis(z) {
  return 180 * Math.sin(z / 1500) + 60 * Math.sin(z / 430 + 1.2);
}

function terrainHeight(x, z) {
  const axis = valleyAxis(z);
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
  /* The strip, the hangar and the village stand on ground held flat: a
   * plateau from the east apron to the church, longer than the strip. */
  const flat = (1 - smoothstep(STRIP_L / 2 + 60, STRIP_L / 2 + 260, Math.abs(z))) * (1 - smoothstep(150, 320, Math.abs(x + 60)));
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

/*
 * THE RANGE BEYOND. The valley's own field ends at three kilometres, and
 * a valley in the Alps does not: past every ridge there is a higher one.
 * A coarse ring of peaks, twenty four kilometres across, snow above the
 * rock, stands outside the field to fill the horizon. It has no collider
 * and nothing lands on it; the fog takes it before the field's edge is
 * noticed, and the sky dome takes it before the far plane does.
 */
function farRange() {
  const size = 24000;
  const n = 96;
  const geo = new THREE.PlaneGeometry(size, size, n, n);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position');
  const colour = new Float32Array(pos.count * 3);
  const rock = new THREE.Color(0x7d7b77);
  const snow = new THREE.Color(0xf4f6fa);
  const green = new THREE.Color(0x4f7a3a);
  const c = new THREE.Color();
  for (let k = 0; k < pos.count; k += 1) {
    const x = pos.getX(k);
    const z = pos.getZ(k);
    const r = Math.hypot(x, z);
    /* Nothing inside the field, a rising skirt across the field's edge,
     * peaks to two and a half kilometres beyond it. */
    const skirt = smoothstep(HALF - 600, HALF + 1800, r);
    const h = skirt * (1500 + 900 * fbm(x / 2200, z / 2200, 4) + 350 * fbm(x / 700, z / 700, 3)) - 40 * (1 - skirt);
    pos.setY(k, h);
    const t = smoothstep(1300, 1900, h + 200 * fbm(x / 900, z / 900, 2));
    c.copy(green).lerp(rock, smoothstep(700, 1300, h)).lerp(snow, t);
    colour[k * 3] = c.r;
    colour[k * 3 + 1] = c.g;
    colour[k * 3 + 2] = c.b;
  }
  pos.needsUpdate = true;
  geo.setAttribute('color', new THREE.BufferAttribute(colour, 3));
  geo.computeVertexNormals();
  const mat = celMaterial({ color: 0xffffff, rim: 0.1 });
  mat.vertexColors = true;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'far-range';
  return mesh;
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
  scene.add(farRange());
  const mats = villageMaterials();
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
  const heightAt = (x, z) => field.height(x, z);

  /*
   * THE ROAD, down the east side of the floor from the head of the valley
   * to the lake shore, two lanes of asphalt with a painted centre line,
   * following the valley's own axis. The village street branches off it
   * across the south end of the strip.
   */
  const roadPts = [];
  for (let z = -2700; z <= 1950; z += 50) {
    roadPts.push({ x: valleyAxis(z) + 55, z });
  }
  const road = ribbon(roadPts, 6.5, 0.06, heightAt, mats.asphalt);
  scene.add(road.mesh);
  scene.add(ribbon(roadPts, 0.18, 0.09, heightAt, mats.paint).mesh);
  const streetPts = [];
  for (let x = valleyAxis(115) + 55; x >= -200; x -= 20) {
    streetPts.push({ x, z: 115 });
  }
  scene.add(ribbon(streetPts, 5, 0.06, heightAt, mats.asphalt).mesh);

  /*
   * THE STREAM, out of the side valley and down the floor to the lake,
   * west of the strip. Water a hair over the meadow; the meadow's own
   * roll gives it its bends.
   */
  const streamPts = [];
  for (let k = 0; k <= 40; k += 1) {
    const t = k / 40;
    const z = -1300 + t * 3350;
    const side = t < 0.25 ? (1 - t / 0.25) : 0;
    streamPts.push({ x: valleyAxis(z) - 95 - 30 * Math.sin(z / 260) + side * side * 700, z });
  }
  scene.add(ribbon(streamPts, 5, 0.1, heightAt, celMaterial({ color: 0x3d7a97, rim: 0.4, rimColor: 0xe6f3ff })).mesh);
  progress(0.55);
  await yieldToPaint();

  /*
   * THE VILLAGE: chalets along both sides of the street, a second row
   * behind, the church at the west end, two barns out in the pasture, the
   * hangar across the strip with its door on the apron. The plateau under
   * it is flat to a few centimetres, so the whole village is baked at one
   * height and drawn as one mesh per material.
   */
  const village = makeBake();
  const walls = [];
  let houses = 0;
  const villageY = heightAt(-90, 115);
  const placeChalet = (x, z, ry, w, d) => {
    const h = chalet(village, rng, { x, z, ry, w, d });
    walls.push({ x0: x - h.halfW, z0: z - h.halfD, x1: x + h.halfW, z1: z + h.halfD, top: h.top, y: villageY });
    houses += 1;
  };
  for (let k = 0; k < 7; k += 1) {
    const x = -38 - k * 24 - rng() * 4;
    placeChalet(x, 128 + rng() * 6, Math.PI / 2 + (rng() - 0.5) * 0.25, 8.5 + rng() * 2.5, 11 + rng() * 4);
    placeChalet(x - 6, 96 - rng() * 6, -Math.PI / 2 + (rng() - 0.5) * 0.25, 8.5 + rng() * 2.5, 11 + rng() * 4);
  }
  for (let k = 0; k < 5; k += 1) {
    const x = -50 - k * 30 - rng() * 6;
    placeChalet(x, 162 + rng() * 10, (rng() - 0.5) * 0.4, 8 + rng() * 2, 10 + rng() * 3);
    placeChalet(x - 8, 60 - rng() * 10, Math.PI + (rng() - 0.5) * 0.4, 8 + rng() * 2, 10 + rng() * 3);
  }
  const kirche = church(village, { x: -232, z: 112, ry: Math.PI / 2 });
  walls.push({ x0: -232 - kirche.halfD, z0: 112 - kirche.halfW, x1: -232 + kirche.halfD, z1: 112 + kirche.halfW, top: 9, y: villageY });
  walls.push({ x0: kirche.towerX - 3, z0: kirche.towerZ - 3, x1: kirche.towerX + 3, z1: kirche.towerZ + 3, top: kirche.top, y: villageY });
  for (const b of [{ x: -150, z: 240, ry: 0.3 }, { x: -60, z: -195, ry: -0.2 }]) {
    const h = barn(village, b);
    walls.push({ x0: b.x - h.halfW, z0: b.z - h.halfD, x1: b.x + h.halfW, z1: b.z + h.halfD, top: h.top, y: villageY });
  }
  const hang = hangar(village, { x: 42, z: -70, ry: -Math.PI / 2 });
  walls.push({ x0: 42 - hang.halfD, z0: -70 - hang.halfW, x1: 42 + hang.halfD, z1: -70 + hang.halfW, top: hang.top, y: villageY });
  /* Fields: fence lines round the pastures the cattle stand in. Fences
   * and cattle stand on the real ground, so they carry their own height
   * and the bake's shared height is taken back off them. */
  const onGround = (x, z) => heightAt(x, z) - villageY;
  fence(village, onGround, -40, 195, -260, 205);
  fence(village, onGround, -260, 205, -270, 335);
  fence(village, onGround, -270, 335, -30, 325);
  fence(village, onGround, -30, 325, -40, 195);
  fence(village, onGround, -10, -145, -230, -155);
  fence(village, onGround, -230, -155, -240, -295);
  for (let k = 0; k < 34; k += 1) {
    const inNorth = k >= 20;
    const x = inNorth ? -40 - rng() * 170 : -60 - rng() * 190;
    const z = inNorth ? -165 - rng() * 120 : 215 + rng() * 100;
    cow(village, rng, { x, y: onGround(x, z), z, ry: rng() * Math.PI * 2 });
  }
  const villageGroup = bakeAll(village, mats);
  villageGroup.position.y = villageY;
  scene.add(villageGroup);
  for (const wl of walls) {
    colliders.addBox('wall', wl.x0, wl.y, wl.z0, wl.x1, wl.y + wl.top, wl.z1);
  }
  progress(0.7);
  await yieldToPaint();

  /*
   * CARS: the town's, parked along the village street and outside the
   * hangar, and a handful driving the valley road on the wall clock.
   */
  const kinds = ['hatch', 'sedan', 'wagon', 'minivan', 'van', 'kei', 'keitruck', 'boxtruck'];
  const colours = [CAR.white, CAR.silver, CAR.wine, CAR.forest, CAR.skyblue, CAR.cream, CAR.slate];
  let parked = 0;
  const parkAt = (x, z, ry) => {
    const kind = kinds[Math.floor(rng() * kinds.length)];
    const y = heightAt(x, z);
    scene.add(makeVehicle({ kind, color: colours[Math.floor(rng() * colours.length)], x, y: y + 0.02, z, ry }));
    colliders.addBox('wall', x - 2.3, y, z - 2.3, x + 2.3, y + 1.6, z + 2.3);
    parked += 1;
  };
  for (let k = 0; k < 7; k += 1) {
    parkAt(-45 - k * 26, 120.5, Math.PI + (rng() - 0.5) * 0.2);
  }
  parkAt(64, -46, Math.PI / 2);
  parkAt(64, -52, Math.PI / 2);
  parkAt(14, 92, 0);
  const movers = [];
  for (let k = 0; k < 6; k += 1) {
    const dir = k % 2 === 0 ? 1 : -1;
    const kind = kinds[Math.floor(rng() * 5)];
    const v = makeVehicle({ kind, color: colours[Math.floor(rng() * colours.length)], x: 0, y: 0, z: 0, ry: 0 });
    scene.add(v);
    movers.push({ group: v, dir, offset: k * 780 + rng() * 200, lane: dir * 1.7 });
  }
  const roadLen = road.dist[road.dist.length - 1];
  function placeMovers(tMs) {
    for (const mv of movers) {
      const run = (mv.offset + tMs * 0.014) % roadLen;
      const at = alongRibbon(road, mv.dir > 0 ? run : roadLen - run);
      const nx = -Math.sin(at.yaw);
      const nz = -Math.cos(at.yaw);
      const px = at.x + nx * mv.lane;
      const pz = at.z + nz * mv.lane;
      mv.group.position.set(px, heightAt(px, pz) + 0.08, pz);
      mv.group.rotation.y = at.yaw + (mv.dir > 0 ? 0 : Math.PI);
    }
  }
  placeMovers(0);

  /*
   * TREES. Pines on the slopes where the paint says forest, thinning to
   * the tree line; broadleaf on the floor along the stream and round the
   * village. Both instanced, three draw calls each. Colliders only within
   * reach of the strip: further out the hillside is the first thing hit.
   */
  const pinePlaces = [];
  let tries = 0;
  while (pinePlaces.length < 3400 && tries < 200000) {
    tries += 1;
    const x = (rng() - 0.5) * FIELD * 0.92;
    const z = (rng() - 0.5) * FIELD * 0.92;
    const y = heightAt(x, z);
    if (y < 40 || y > 720) {
      continue;
    }
    const sx = (heightAt(x + 12, z) - heightAt(x - 12, z)) / 24;
    const sz = (heightAt(x, z + 12) - heightAt(x, z - 12)) / 24;
    if (Math.hypot(sx, sz) > 0.72) {
      continue;
    }
    const density = (1 - smoothstep(560, 720, y)) * (0.55 + 0.45 * fbm(x / 140, z / 140, 2));
    if (rng() > density) {
      continue;
    }
    const scale = 0.75 + rng() * 0.7;
    pinePlaces.push({ x, y, z, yaw: rng() * Math.PI * 2, scale, tall: 0.9 + rng() * 0.35 });
    if (Math.hypot(x, z) < 700) {
      colliders.addPost('tree', x, z, y, y + 14 * scale, 3.2 * scale);
    }
  }
  scene.add(pineForest(pinePlaces));
  const grove = [];
  for (let k = 0; k < 220; k += 1) {
    let x;
    let z;
    if (rng() < 0.6) {
      const at = streamPts[Math.floor(rng() * streamPts.length)];
      x = at.x + (rng() - 0.5) * 40;
      z = at.z + (rng() - 0.5) * 80;
    } else {
      x = -60 - rng() * 250;
      z = -300 + rng() * 700;
    }
    if (Math.abs(x) < 20 && Math.abs(z) < STRIP_L / 2 + 40) {
      continue;
    }
    const y = heightAt(x, z);
    if (y > 60) {
      continue;
    }
    grove.push({ x, y, z, yaw: rng() * Math.PI * 2, scale: 0.7 + rng() * 0.8 });
    if (Math.hypot(x, z) < 500) {
      colliders.addSphere('canopy', x, y + 5.4, z, 3.2);
    }
  }
  scene.add(broadleafGrove(grove));

  const sock = windsock(mats.metal);
  sock.group.position.set(STRIP_W / 2 + 6, heightAt(STRIP_W / 2 + 6, 30), 30);
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
    updateAnim(stepMs) { placeMovers(stepMs); },
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
      pines: pinePlaces.length,
      broadleaf: grove.length,
      houses,
      cars: movers.length + parked,
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
