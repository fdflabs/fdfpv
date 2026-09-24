/*
 * swiss2-nature-preview.js: the page behind swiss2-nature-preview.html.
 *
 * A stand in for swiss2's render pipeline, as close as a page can get
 * without it: ACES tone mapping, a Poly Haven HDRI as the sky and the
 * image based light, a sun placed where the HDRI's sun is with soft
 * shadows following the camera, exponential haze, and the alps
 * heightfield with its own painted ground under a standard material. On
 * it, buildVegetation and buildWater exactly as the map will call them.
 *
 * ?q=low|medium|high picks the tier, ?water=0 or ?veg=0 leaves one out,
 * ?hdri= names a Poly Haven HDRI (alps_field by default).
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
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { FIELD, CELLS, buildHeightfield, groundTexture, farRange } from '../../src/maps/alps/terrain.js';
import { makeRng } from '../../src/maps/alps/noise.js';
import { buildVegetation } from '../../src/maps/swiss2/vegetation/index.js';

const params = new URLSearchParams(location.search);
const quality = params.get('q') || 'high';
const hdri = params.get('hdri') || 'alps_field';

async function main() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = Number(params.get('exposure') || 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.3, 24000);

  /* The sky and its light. */
  const hdr = await new RGBELoader().loadAsync(`https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/${hdri}_2k.hdr`);
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(hdr).texture;
  scene.environment = env;
  scene.background = hdr;
  /* The sun: the HDRI's brightest texel, as a direction. */
  const { data, width, height } = hdr.image;
  let best = 0;
  let bi = 0;
  for (let k = 0; k < width * height; k += 1) {
    const l = data[k * 4] + data[k * 4 + 1] + data[k * 4 + 2];
    if (l > best) {
      best = l;
      bi = k;
    }
  }
  /* three's equirect lookup is u = atan(dir.z, dir.x) / 2pi + 0.5 and
   * v = asin(dir.y) / pi + 0.5, and the loader flips rows, so row 0 is
   * the zenith. */
  const lon = (((bi % width) + 0.5) / width - 0.5) * Math.PI * 2;
  const lat = (0.5 - (Math.floor(bi / width) + 0.5) / height) * Math.PI;
  const sunDir = new THREE.Vector3(Math.cos(lon) * Math.cos(lat), Math.sin(lat), Math.sin(lon) * Math.cos(lat));
  if (params.get('sun')) {
    const [x, y, z] = params.get('sun').split(',').map(Number);
    sunDir.set(x, y, z).normalize();
  }
  const sun = new THREE.DirectionalLight(0xfff3e2, Number(params.get('sunI') || 3.2));
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const SH = 160;
  Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 1600 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);
  scene.fog = new THREE.FogExp2(new THREE.Color(0.62, 0.7, 0.8), Number(params.get('fog') || 0.00011));

  /* The ground: the alps heightfield and its own paint, standard lit. */
  const field = buildHeightfield();
  const heightAt = (x, z) => field.height(x, z);
  const geo = new THREE.PlaneGeometry(FIELD, FIELD, CELLS, CELLS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position');
  for (let k = 0; k < pos.count; k += 1) {
    pos.setY(k, field.height(pos.getX(k), pos.getZ(k)));
  }
  geo.computeVertexNormals();
  /* The alps paint is cel bright; a real meadow's albedo is a fifth
   * of that green. */
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: groundTexture(field), roughness: 0.95, color: new THREE.Color(params.get("ground") === "red" ? 0xff0000 : 0x7f8a74) }));
  ground.receiveShadow = true;
  scene.add(ground);
  const far = farRange(field).mesh;
  far.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  scene.add(far);

  const ctx = {
    scene, renderer, camera, quality, heightAt, envMap: env, sunDirection: sunDir, rng: makeRng(20260924),
  };
  const parts = [];
  const t0 = performance.now();
  if (params.get('veg') !== '0') {
    const veg = await buildVegetation(ctx);
    scene.add(veg.group);
    parts.push(veg);
    window.__veg = veg;
  }
  if (params.get('water') !== '0') {
    const { buildWater } = await import('../../src/maps/swiss2/water/index.js');
    const grass = window.__veg && window.__veg.group.getObjectByName('swiss2-grass');
    const water = await buildWater({ ...ctx, mirrorHide: grass ? [grass] : [] });
    scene.add(water.group);
    parts.push(water);
    window.__water = water;
  }
  const buildMs = performance.now() - t0;

  const target = new THREE.Vector3();
  /* The frame's draws are counted across every pass in it, the lake's
   * mirror and the shadow map included, not only the last render call. */
  renderer.info.autoReset = false;
  const frame = (dt) => {
    renderer.info.reset();
    for (const p of parts) {
      p.update(dt, camera);
    }
    sun.position.copy(target).addScaledVector(sunDir, 800);
    sun.target.position.copy(target);
    sun.target.updateMatrixWorld();
    renderer.render(scene, camera);
  };
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  window.__preview = {
    heightAt,
    sunDir: sunDir.toArray(),
    buildMs,
    /* Stand the camera at (x, y, z) looking at (tx, ty, tz). */
    view(x, y, z, tx, ty, tz, fov = 60) {
      camera.position.set(x, y, z);
      camera.fov = fov;
      camera.updateProjectionMatrix();
      camera.lookAt(tx, ty, tz);
      camera.updateMatrixWorld();
      /* The shadow follows what is looked at, within reach of the eye. */
      const d = Math.min(camera.position.distanceTo(new THREE.Vector3(tx, ty, tz)), 120);
      target.copy(camera.position).add(new THREE.Vector3(tx, ty, tz).sub(camera.position).normalize().multiplyScalar(d * 0.6));
    },
    /* The same, with heights given over the ground under each point. */
    eye(x, z, dh, tx, tz, tdh, fov = 60) {
      this.view(x, heightAt(x, z) + dh, z, tx, heightAt(tx, tz) + tdh, tz, fov);
    },
    async settle(n = 4) {
      for (let k = 0; k < n; k += 1) {
        await raf();
        frame(16.7);
      }
      await raf();
      return true;
    },
    stats() {
      const i = renderer.info;
      return {
        calls: i.render.calls,
        triangles: i.render.triangles,
        points: i.render.points,
        geometries: i.memory.geometries,
        textures: i.memory.textures,
        parts: parts.map((p) => p.stats),
      };
    },
    /* Frame time: n frames back to back, each finished on the GPU before
     * the next (a one pixel read), so the number is the frame, not the
     * queue. */
    bench(n = 30) {
      const gl = renderer.getContext();
      const px = new Uint8Array(4);
      frame(16.7);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const times = [];
      for (let k = 0; k < n; k += 1) {
        const a = performance.now();
        frame(16.7);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        times.push(performance.now() - a);
      }
      times.sort((p, q) => p - q);
      return { median: times[Math.floor(n / 2)], p90: times[Math.floor(n * 0.9)], calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    },
    /* The GPU's own time for a frame, from a timer query round it: the
     * wall clock above is at the mercy of whatever else the box is
     * running, this is not. Median of n frames, in milliseconds. */
    async gpu(n = 20) {
      const gl = renderer.getContext();
      const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      if (!ext) {
        return null;
      }
      const times = [];
      for (let k = 0; k < n; k += 1) {
        const q = gl.createQuery();
        gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
        frame(16.7);
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        for (;;) {
          await raf();
          if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
            break;
          }
        }
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) {
          times.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
        }
        gl.deleteQuery(q);
      }
      times.sort((p, q) => p - q);
      return times[Math.floor(times.length / 2)];
    },
  };
  window.__previewReady = true;
}

main().catch((e) => {
  window.__previewError = e.stack || String(e);
  console.error(window.__previewError);
});
