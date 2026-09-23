/*
 * airfield.js: a flat field for a fixed wing.
 *
 * A five inch course is sixty metres with gates you can hover through. A
 * 1000 mm wing cruises at 15 to 25 m/s and turns in about 20 m, so it
 * needs room rather than furniture: five hundred metres of mown grass, a
 * tarmac strip down the middle to take off from and land on, a row of
 * pylons along one side to fly round, a hedge on the far edge so the
 * horizon has an edge in it, and a windsock, because an airfield without
 * one is a paddock.
 *
 * FREESTYLE, FOR NOW. No gates, no lap, no clock, the same shape of map as
 * the town: the shell scores tricks on a freestyle map and nothing else.
 * The wing's own track class, gate size and pass depth are stage 7 of
 * docs/WING-PLAN.md and land in the builder, not here.
 *
 * FLAT, ON PURPOSE. The race field carries a height field because a cross
 * country circuit wants a valley; a belly landing wants a surface that is
 * the same everywhere, and the contact query here is a rectangle test for
 * the runway's two centimetres over zero. Everything solid is a collider:
 * the six pylons and the windsock's mast as posts, the hedge as a box, so
 * a wing that clips a pylon at 20 m/s hits it rather than the picture of
 * it.
 *
 * BUILT LAZILY AND FREED. registry.js loads this module by dynamic import
 * the first time the map is chosen, and dispose() gives every geometry,
 * material, texture and shadow map back through the shell's own walker.
 * scripts/memory-check.js measures both halves.
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

import * as THREE from 'three';
import { Colliders } from '../game/collide.js';
import { disposeSceneGraph } from '../render/shell.js';
import { SESSION_TEXTURES } from '../render/session-textures.js';
import { celMaterial, updateCelTime, FLAG_SAIL_CLOTH } from '../render/celmat.js';
import { skyDome } from '../render/scene.js';
import { attachComposer } from './field.js';
import { yieldToPaint } from '../ui/loading.js';
import { qualityFor } from '../render/quality.js';
import { str } from '../strings/index.js';

/* The field is a square this many metres on a side, centred on the origin.
 * The hedge stands on its far edge and the plain grass beyond it runs out
 * into the fog. */
const FIELD = 500;
const HALF = FIELD / 2;

/* The strip, along z through the origin. Two centimetres proud of the
 * grass so the surface can be seen as a surface and so a craft resting on
 * it rests ON it: height() returns this over the rectangle. */
const RUNWAY_L = 120;
const RUNWAY_W = 12;
const RUNWAY_Y = 0.02;

/* Six pylons 60 m apart down the east side of the strip, far enough out
 * that a wing turning in 20 m can round one without crossing the runway
 * centreline. The row is centred on the runway so the last pylon is a
 * turn's worth past its end at either side. */
const PYLON_COUNT = 6;
const PYLON_PITCH = 60;
const PYLON_X = 70;
const PYLON_H = 9;
const PYLON_R = 0.12;

/* The hedge: at the far edge, low enough that a wing on final over it has
 * the whole strip ahead, tall enough to read as a line from the other end. */
const HEDGE_Z = -HALF + 5;
const HEDGE_H = 2.2;
const HEDGE_T = 1.6;

/* Beside the threshold the pilot spawns at, where a windsock is put so it
 * can be read before the take off roll. */
const SOCK_X = -16;
const SOCK_Z = 46;
const SOCK_H = 4.5;

/* On the strip, a few metres in from its south threshold, facing north
 * down it. Yaw 0 is forward along -z, see src/render/frame.js. */
const SPAWN = { x: 0, z: RUNWAY_L / 2 - 8, yaw: 0 };

/* The same sky the race field flies under, so the two outdoor worlds do
 * not disagree about the colour of the horizon. skyDome reads these from
 * scene.js; the fog and hemisphere here restate them so a fogged far edge
 * dissolves into the dome rather than sitting on it. */
const HORIZON = 0xf2e3cb;
const SUN_DIR = new THREE.Vector3(0.60, 0.50, 0.62).normalize();
const FOG_NEAR = 220;
const FOG_FAR = 1500;
const CAMERA_FAR = 2600;

/* Deterministic, so the hedge is the same hedge every load. */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
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
 * Mown stripes: two greens a mower's width apart, running the length of
 * the strip. One texture of two stripes repeated across the field is what
 * makes a flat plane read as a size: a wing at 15 m/s crosses a stripe in
 * under half a second and the ground visibly moves.
 */
function grassTexture(renderer) {
  const tex = canvasTexture(64, 4, (ctx, w, h) => {
    ctx.fillStyle = '#5f8f3a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#699c42';
    ctx.fillRect(0, 0, w / 2, h);
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  /* Two stripes per tile, each a 6 m mower pass. */
  tex.repeat.set(FIELD / 12, 1);
  tex.magFilter = THREE.NearestFilter;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

/*
 * The strip: tarmac with a centreline, edge lines and a bar of piano keys
 * at each threshold, painted at 20 pixels to the metre so a 0.3 m line is
 * six pixels rather than an anti aliased smear.
 */
function runwayTexture() {
  const PX = 20;
  return canvasTexture(RUNWAY_W * PX, RUNWAY_L * PX, (ctx, w, h) => {
    ctx.fillStyle = '#4b4d52';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#e8e6df';
    const line = 0.3 * PX;
    ctx.fillRect(0.4 * PX, 0, line, h);
    ctx.fillRect(w - 0.4 * PX - line, 0, line, h);
    const dash = 3 * PX;
    for (let y = 10 * PX; y < h - 10 * PX; y += dash * 2) {
      ctx.fillRect(w / 2 - line / 2, y, line, dash);
    }
    /* Eight keys a metre wide, the threshold bar 4 m deep, 2 m in from
     * either end. */
    for (const y0 of [2 * PX, h - 6 * PX]) {
      for (let k = 0; k < 8; k += 1) {
        ctx.fillRect((1.7 + k * 1.1) * PX, y0, 0.6 * PX, 4 * PX);
      }
    }
  });
}

/*
 * A flag that flies. The cloth wave lives in the cel material's vertex
 * shader and reads aCloth: x is the distance from the pole, 0 on the seam,
 * so the seam never leaves the mast. The reverse faces are in the geometry
 * with the front's normals copied across, the same construction as the
 * race field's banners: DoubleSide is invisible to the outline prepass and
 * a flag with no back is transparent from behind.
 */
function flagGeometry(w, h, cols = 8, rows = 4) {
  const pos = [];
  const cloth = [];
  for (let r = 0; r <= rows; r += 1) {
    for (let c = 0; c <= cols; c += 1) {
      const u = c / cols;
      const v = r / rows;
      pos.push(u * w, v * h, 0);
      cloth.push(u, v);
    }
  }
  const stride = cols + 1;
  const idx = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const a = r * stride + c;
      idx.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride);
    }
  }
  const n = pos.length / 3;
  const back = [];
  for (let i = 0; i < idx.length; i += 3) {
    back.push(n + idx[i], n + idx[i + 2], n + idx[i + 1]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos.concat(pos), 3));
  geo.setAttribute('aCloth', new THREE.Float32BufferAttribute(cloth.concat(cloth), 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const nrm = geo.getAttribute('normal');
  for (let i = 0; i < n; i += 1) {
    nrm.setXYZ(n + i, nrm.getX(i), nrm.getY(i), nrm.getZ(i));
  }
  nrm.needsUpdate = true;
  geo.setIndex(idx.concat(back));
  return geo;
}

function pylon(x, z, flagMat, mastMat, flagGeo) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(PYLON_R * 0.7, PYLON_R, PYLON_H, 8), mastMat);
  mast.position.y = PYLON_H / 2;
  mast.castShadow = true;
  g.add(mast);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(PYLON_R * 3, PYLON_R * 3.6, 0.08, 8), mastMat);
  foot.position.y = 0.04;
  g.add(foot);
  const flag = new THREE.Mesh(flagGeo, flagMat);
  flag.position.set(PYLON_R * 0.7, PYLON_H - 1.0, 0);
  flag.castShadow = true;
  g.add(flag);
  return g;
}

/*
 * The hedge, as one long box with a row of squashed spheres along its top
 * so the line has a top edge that is not a ruler. One instanced draw for
 * the bumps, whatever the count.
 */
function hedge(rng) {
  const g = new THREE.Group();
  const mat = celMaterial({ color: 0x3f6b2a, rim: 0.18 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(FIELD, HEDGE_H - 0.4, HEDGE_T), mat);
  body.position.set(0, (HEDGE_H - 0.4) / 2, HEDGE_Z);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  const count = Math.floor(FIELD / 3.2);
  const bumps = new THREE.InstancedMesh(new THREE.SphereGeometry(1.35, 7, 5), mat, count);
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  for (let i = 0; i < count; i += 1) {
    p.set(-HALF + 1.6 + i * 3.2 + (rng() - 0.5) * 1.2, HEDGE_H - 1.05 + rng() * 0.25, HEDGE_Z + (rng() - 0.5) * 0.4);
    s.set(1.05 + rng() * 0.25, 0.62 + rng() * 0.18, 0.62);
    m.compose(p, q, s);
    bumps.setMatrixAt(i, m);
  }
  bumps.castShadow = true;
  g.add(bumps);
  return g;
}

function windsock(mastMat) {
  const g = new THREE.Group();
  g.position.set(SOCK_X, 0, SOCK_Z);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, SOCK_H, 8), mastMat);
  mast.position.y = SOCK_H / 2;
  mast.castShadow = true;
  g.add(mast);
  /* The sock hangs off a pivot at the mast head so the whole thing can
   * swing to the wind in updateWind. Mouth at the pivot, tail out along
   * +x in the pivot's own frame. */
  const pivot = new THREE.Group();
  pivot.position.y = SOCK_H;
  const geo = new THREE.CylinderGeometry(0.28, 0.09, 1.8, 10, 1, true);
  geo.translate(0, -0.9, 0);
  geo.rotateZ(-Math.PI / 2);
  const sock = new THREE.Mesh(geo, celMaterial({ color: 0xf07a1a, rim: 0.1, side: THREE.DoubleSide }));
  sock.castShadow = true;
  pivot.add(sock);
  g.add(pivot);
  return { group: g, pivot };
}

async function buildAirfield(shell, progress, q) {
  const renderer = shell.renderer;
  const camera = shell.camera;

  /* The race field's shadow setup, because this is an outdoor world drawn
   * with the field's own composer and cel materials. The town sets its own. */
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

  const sun = new THREE.DirectionalLight(0xffe9c4, 1.45);
  sun.castShadow = q.shadows;
  const shadowMap = q.field.shadowMap || 2048;
  const shadowHalf = q.field.shadowHalf || 72;
  sun.shadow.mapSize.set(shadowMap, shadowMap);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 320;
  sun.shadow.camera.left = -shadowHalf;
  sun.shadow.camera.right = shadowHalf;
  sun.shadow.camera.top = shadowHalf;
  sun.shadow.camera.bottom = -shadowHalf;
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);
  scene.add(new THREE.HemisphereLight(0x8fb8e8, 0x4a6b34, 0.42));
  progress(0.1);
  await yieldToPaint();

  /* The ground: the mown square, and a plain green apron under it out to
   * the fog so the field has a beyond rather than an edge. */
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(FIELD, FIELD),
    celMaterial({ color: 0xffffff, rim: 0, map: grassTexture(renderer), key: 'airfield-grass' }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  scene.add(grass);
  const beyond = new THREE.Mesh(
    new THREE.PlaneGeometry(FOG_FAR * 2, FOG_FAR * 2),
    celMaterial({ color: 0x5a8a38, rim: 0 }),
  );
  beyond.rotation.x = -Math.PI / 2;
  beyond.position.y = -0.05;
  scene.add(beyond);

  const runwayGeo = new THREE.PlaneGeometry(RUNWAY_W, RUNWAY_L);
  const runway = new THREE.Mesh(
    runwayGeo,
    celMaterial({ color: 0xffffff, rim: 0, map: runwayTexture(), key: 'airfield-runway' }),
  );
  runway.rotation.x = -Math.PI / 2;
  runway.position.y = RUNWAY_Y;
  runway.receiveShadow = true;
  scene.add(runway);
  progress(0.5);
  await yieldToPaint();

  const colliders = new Colliders();
  const mastMat = celMaterial({ color: 0xd7dbe0, rim: 0.2 });
  const flagGeo = flagGeometry(1.5, 1.0);
  const flagMats = [
    celMaterial({ color: 0xd8402a, rim: 0, cloth: FLAG_SAIL_CLOTH }),
    celMaterial({ color: 0xf2c53d, rim: 0, cloth: FLAG_SAIL_CLOTH }),
  ];
  const pylonZ = [];
  for (let i = 0; i < PYLON_COUNT; i += 1) {
    const z = (i - (PYLON_COUNT - 1) / 2) * PYLON_PITCH;
    pylonZ.push(z);
    scene.add(pylon(PYLON_X, z, flagMats[i % 2], mastMat, flagGeo));
    colliders.addPost('pole', PYLON_X, z, 0, PYLON_H, PYLON_R);
  }

  const rng = makeRng(20260923);
  scene.add(hedge(rng));
  /* Foliage, so a wing that mushes into it gets the tree's grip rather
   * than a wall's bounce. */
  const hedgeIndex = colliders.addBox(
    'canopy',
    -HALF, 0, HEDGE_Z - HEDGE_T / 2,
    HALF, HEDGE_H, HEDGE_Z + HEDGE_T / 2,
  );

  const sock = windsock(mastMat);
  scene.add(sock.group);
  colliders.addPost('pole', SOCK_X, SOCK_Z, 0, SOCK_H, 0.045);
  colliders.build();
  progress(0.8);
  await yieldToPaint();

  scene.add(shell.quad);
  renderer.compile(scene, camera);
  progress(1);

  /*
   * Shadows follow the craft, snapped to the shadow map's own texel so the
   * sampling grid does not crawl under the world as the craft moves. Same
   * rule as the race field, same reason.
   */
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
    sun.position.copy(shadowFocus).addScaledVector(SUN_DIR, 130);
    sun.target.position.copy(shadowFocus);
    sun.target.updateMatrixWorld();
  }

  /*
   * Wall clock decoration only: the flags' cloth wave and the sock's
   * swing. Nothing here is solid, so nothing here is on the step clock.
   * The sock points downwind of a breeze from the north west that wanders
   * a little, and droops between gusts.
   */
  function updateWind(t) {
    updateCelTime(t);
    sock.pivot.rotation.y = -Math.PI * 0.75 + Math.sin(t * 0.37) * 0.35 + Math.sin(t * 1.9) * 0.06;
    sock.pivot.rotation.z = -0.22 + Math.sin(t * 0.61) * 0.12;
  }

  /*
   * The title shot: a wide left hand circuit of the field at pylon height
   * and a wing's cruise, so the strip, the row and the hedge each cross
   * the frame once a lap. The camera clears the pylons by their height
   * again and the hedge by more; scripts/attract-check.js walks it.
   */
  const attractPath = [];
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2;
    attractPath.push({ x: Math.sin(a) * 125, y: 18, z: Math.cos(a) * 180 });
  }

  const AIM = { active: false, sceneIndex: -1, correct: true, distance: 0 };

  return {
    id: 'airfield',
    name: str('registry.airfield'),
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
      speed: 20,
      lookAhead: 30,
      aimDrop: 6,
    },
    /* One flat surface, plus the strip's two centimetres. fromY is taken
     * for the shell's one call shape and ignored: nothing here is a deck a
     * craft could be under. */
    height: (x, z) => (
      Math.abs(x) <= RUNWAY_W / 2 && Math.abs(z) <= RUNWAY_L / 2 ? RUNWAY_Y : 0
    ),
    setNextGate() {},
    targetAim: () => AIM,
    approachSide: () => null,
    hasRacingLine: false,
    setRacingLine() {},
    updateRacingLine() { return null; },
    updateShadowFocus,
    updateWind,
    updateAnim() {},
    /* Measured off what was built, not restated from the constants, so a
     * change that shortens the strip or moves a pylon shows up here. */
    references: {
      runwayLength: {
        measured: runwayGeo.parameters.height,
        unit: 'm',
        real: '120',
      },
      pylonPitch: {
        measured: pylonZ.length > 1 ? pylonZ[1] - pylonZ[0] : 0,
        unit: 'm',
        real: '60',
      },
      hedgeHeight: {
        measured: colliders.fby[hedgeIndex] - colliders.fay[hedgeIndex],
        unit: 'm',
        real: str('references.1_80_to_2_40'),
      },
    },
    stats: () => ({
      colliders: colliders.stats(),
      pylons: pylonZ.length,
    }),
    dispose() {
      shell.evictSessionRoots(scene);
      disposeSceneGraph(scene, SESSION_TEXTURES);
    },
  };
}

/* The race field's composer on top, and its dispose folded into ours, the
 * same seven lines custom.js borrows. */
export async function buildMap(shell, onProgress, options) {
  const progress = onProgress ?? (() => {});
  const q = qualityFor(options && options.quality);
  return attachComposer(shell, await buildAirfield(shell, progress, q), q);
}
