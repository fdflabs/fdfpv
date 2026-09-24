/*
 * yellowstone-thermal.js: the page side of
 * scripts/yellowstone-thermal-preview.js.
 *
 * Builds the thermal features and the water on the stand in ground under
 * the Alps' light and haze, through the game's own post pass, so the ink
 * and the grade are the ones the pilot sees. window.__ys loads the data,
 * moves the ground window to a landmark and loads its region, poses the
 * camera, sets the step clock, and measures what the features cost with
 * the stand in ground and the sky taken out of the count.
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
import { skyDome } from '../../src/render/scene.js';
import { updateCelTime } from '../../src/render/celmat.js';
import { buildThermal } from '../../src/maps/yellowstone/thermal/index.js';
import { regionOf } from '../../src/maps/yellowstone/thermal/catalog.js';
import { buildWater } from '../../src/maps/yellowstone/water/index.js';
import { readHydro } from '../../src/maps/yellowstone/water/hydro.js';
import { makeStandin } from './yellowstone-standin.js';

const W = innerWidth;
const H = innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.shadowMap.enabled = false;
renderer.info.autoReset = false;
document.body.appendChild(renderer.domElement);

const HORIZON = 0xe9eef5;
const SUN_DIR = new THREE.Vector3(0.45, 0.62, 0.64).normalize();
const scene = new THREE.Scene();
scene.background = new THREE.Color(HORIZON);
scene.fog = new THREE.Fog(HORIZON, 3000, 38000);
const sky = skyDome();
sky.layers.set(1);
scene.add(sky);
const camera = new THREE.PerspectiveCamera(60, W / H, 0.2, 60000);
camera.layers.enable(1);
const sun = new THREE.DirectionalLight(0xfff1dc, 1.5);
sun.position.copy(SUN_DIR).multiplyScalar(1000);
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xa9c4e6, 0x55703a, 0.5));

let composer = null;
let standin = null;
let thermal = null;
let water = null;
let groundGroup = null;
const loaded = new Set();

/* The step clock in seconds, and the wall clock the cel materials read. */
function setTime(t) {
  thermal.updateAnim(t * 1000);
  water.updateAnim(t * 1000);
  updateCelTime(t);
}

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) {
    throw new Error(`${url}: ${r.status}`);
  }
  return r.json();
}

window.__ys = {
  /* Data from the fixtures, or handed in by the driver (the real files). */
  async setup({ thermalJson, hydroJson } = {}) {
    const tj = thermalJson ?? await fetchJson('/tests/fixtures/yellowstone/thermal-sample.json');
    const hj = hydroJson ?? await fetchJson('/tests/fixtures/yellowstone/hydro-sample.json');
    const hydro = readHydro(hj);
    standin = makeStandin(hydro);
    const heightAt = (x, z) => standin.heightAt(x, z);
    thermal = buildThermal({ scene, heightAt, thermal: tj, rivers: hydro.rivers, sunDir: SUN_DIR });
    water = buildWater({
      scene, heightAt, hydro: hj, sunDir: SUN_DIR, clock: thermal.env.clock, wind: thermal.env.wind, warmAt: thermal.warmAt, drawnBy: thermal.drawsLake,
    });
    composer = buildComposer(renderer, scene, camera, null);
    composer.setSize(W, H);
    setTime(0);
    return { thermal: thermal.catalog.counts, hydro: water.counts, plumes: thermal.plumes, farParticles: thermal.farParticles };
  },
  /* The ground window and the region round (x, z): the one live region of
   * the preview, as the engine would have it. */
  look(x, z, fineHalf = 1500, coarseHalf = 6000) {
    if (groundGroup) {
      scene.remove(groundGroup);
      groundGroup.traverse((o) => o.geometry && o.geometry.dispose());
    }
    groundGroup = standin.groundAround(x, z, fineHalf, coarseHalf);
    scene.add(groundGroup);
    /* The ground moved, so every region built on the old one is rebuilt:
     * the regions the stand in draws round here, as the engine would have
     * its finest level loaded round the camera. */
    for (const key of loaded) {
      thermal.unloadRegion(key);
      water.unloadRegion(key);
    }
    loaded.clear();
    const reach = Math.min(coarseHalf, 4000);
    const regs = new Map();
    for (const [dx, dz] of [[0, 0], [-reach, -reach], [reach, -reach], [-reach, reach], [reach, reach], [0, -reach], [0, reach], [-reach, 0], [reach, 0]]) {
      const r = regionOf(x + dx, z + dz);
      regs.set(r.key, r);
    }
    const t0 = performance.now();
    const ts = {};
    for (const [key, r] of regs) {
      ts[key] = thermal.loadRegion(r);
      loaded.add(key);
    }
    const t1 = performance.now();
    const ws = {};
    for (const [key, r] of regs) {
      ws[key] = water.loadRegion(r);
    }
    const t2 = performance.now();
    return { region: regionOf(x, z).key, regions: [...regs.keys()], thermal: ts[regionOf(x, z).key], water: ws[regionOf(x, z).key], ms: { thermal: Math.round(t1 - t0), water: Math.round(t2 - t1) } };
  },
  hero(id) {
    const f = thermal.catalog.heroes[id];
    return { x: f.x, z: f.z, y: standin.heightAt(f.x, f.z) };
  },
  heroFocus(id) {
    const h = thermal.hero(id);
    return h ? h.focus : null;
  },
  /* A landmark that knows where it is best seen from says so. */
  heroViews(id) {
    const h = thermal.hero(id);
    return h && h.views ? h.views : null;
  },
  heightAt: (x, z) => standin.heightAt(x, z),
  /* The drawn stand in ground's height at (x, z), by ray: heightAt must
   * agree with it or everything placed on heightAt is wrong. */
  drawnHeight(x, z) {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 5000, z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(groundGroup, true)[0];
    return hit ? hit.point.y : null;
  },
  /* Show or hide the stand in ground, to see what is under it. */
  showGround(on) {
    groundGroup.visible = on;
    return true;
  },
  time(t) {
    setTime(t);
    return true;
  },
  state(id, t) {
    const h = thermal.hero(id);
    if (!h || !h.geyser) {
      return null;
    }
    const s = h.geyser.schedule.at(t);
    return { phase: s.phase, height: s.height, power: s.power, steam: s.steam, water: s.water ?? null, next: h.geyser.schedule.nextStart(t) };
  },
  demo(on) {
    thermal.setDemo(on);
    return true;
  },
  cam(x, y, z, tx, ty, tz, fov = 60) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
    camera.position.set(x, y, z);
    camera.up.set(0, 1, 0);
    camera.lookAt(tx, ty, tz);
    camera.updateMatrixWorld();
    return true;
  },
  render() {
    composer.render();
    return true;
  },
  /*
   * What the thermal features and the water cost in this view: the whole
   * frame (prepass, colour, post) with them, less the same frame without,
   * so the stand in ground and the sky are not counted. Draw calls and
   * triangles as renderer.info counts them, which is what __renderStats
   * reads in the shell.
   */
  cost() {
    const frame = () => {
      renderer.info.reset();
      composer.render();
      return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
    };
    const all = frame();
    thermal.root.visible = false;
    water.root.visible = false;
    const none = frame();
    thermal.root.visible = true;
    water.root.visible = true;
    return { calls: all.calls - none.calls, tris: all.tris - none.tris, particles: visibleParticles() };
  },
  /* The meshes of the features and the water the camera can see, by
   * name, whether the ink prepass draws them again, and their triangles
   * counted as the renderer does (twice for an inked mesh): what the
   * budget numbers are made of. */
  drawn() {
    camera.updateMatrixWorld();
    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );
    const out = {};
    for (const rootObj of [thermal.root, water.root]) {
      rootObj.traverseVisible((o) => {
        if (!o.isMesh) {
          return;
        }
        if (!o.geometry.boundingSphere) {
          o.geometry.computeBoundingSphere();
        }
        const sph = o.geometry.boundingSphere.clone().applyMatrix4(o.matrixWorld);
        if (o.frustumCulled && !frustum.intersectsSphere(sph)) {
          return;
        }
        const key = `${o.name}${(o.layers.mask & 1) ? ' (+ink)' : ''}`;
        const g = o.geometry;
        const tris = ((g.index ? g.index.count : g.attributes.position.count) / 3) * (g.isInstancedBufferGeometry ? g.instanceCount : 1);
        const e = out[key] ?? (out[key] = { draws: 0, tris: 0 });
        e.draws += 1;
        e.tris += Math.round(tris * ((o.layers.mask & 1) ? 2 : 1));
      });
    }
    return out;
  },
  stats() {
    return { heroes: thermal.heroes() };
  },
};

/* Particles in drawn particle meshes whose bounds the camera can see. */
function visibleParticles() {
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  );
  let n = 0;
  scene.traverseVisible((o) => {
    if (o.isMesh && o.userData.particles && o.geometry.boundingSphere) {
      const s = o.geometry.boundingSphere.clone().applyMatrix4(o.matrixWorld);
      if (frustum.intersectsSphere(s)) {
        n += o.userData.particles;
      }
    }
  });
  return n;
}

window.__ysReady = true;
