/*
 * steam.js: steam, as instanced puffs moved in the vertex shader.
 *
 * Every steaming thing, a pinhole fumarole, a hot pool, Excelsior's crater,
 * a geyser's plume, the Firehole where it runs warm, the far column over a
 * basin, is a vent with a handful of puffs cycling up from it. A puff's
 * whole life is a function of the shared clock and its own attributes:
 * where its vent is, when in the cycle it started, how long it lives, how
 * big it gets and how high it climbs. So a region's steam is one draw, and
 * nothing is touched per frame but one uniform.
 *
 * `uGain` fades a whole mesh's plume up and down (a geyser that has gone
 * quiet steams less), by hiding the puffs whose gate is above it rather
 * than thinning them all, so what remains still reads as solid steam.
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
import { particleMaterial, particleMesh } from './paint.js';

const STEAM_MOTION = /* glsl */ `
  float life = aPuff.y;
  float cyc = uTime / life + aPuff.x;
  float t = fract(cyc);
  float n = floor(cyc);
  /* A fresh lean and offset every cycle, so a vent does not loop one puff. */
  float h1 = ysHash(vec2(n, aPuff.x * 97.0));
  float h2 = ysHash(vec2(aPuff.x * 53.0, n + 0.5));
  float ang = h1 * 6.2832;
  vec2 off = vec2(cos(ang), sin(ang)) * aVent.w * sqrt(h2);
  float climb = aPuff.w * (1.0 - (1.0 - t) * (1.0 - t));
  /* The wind takes the plume more as it climbs out of the shelter of the
   * basin floor. */
  vec2 drift = uWind * life * t * (0.35 + 0.65 * t);
  centre = vec3(aVent.x + off.x + drift.x, aVent.y + climb, aVent.z + off.y + drift.y);
  /* Grows as it leaves the vent, then dissolves by shrinking rather than
   * by going clear: overlapping see through spheres read as soap
   * bubbles, every one of their outlines showing through the others,
   * where nearly opaque ones read as one drawn cloud. */
  size = aPuff.z * (0.3 + 0.7 * smoothstep(0.0, 0.4, t)) * (1.0 - 0.65 * smoothstep(0.5, 1.0, t)) * (0.8 + 0.4 * h2);
  /* A puff is on when the mesh's gain passes its gate, and the whole
   * plume swells with the gain, so a weak steam phase is a smaller plume
   * rather than a sparse string of beads. */
  float on = step(aGate, uGain);
  size *= 0.45 + 0.55 * clamp(uGain, 0.0, 1.0);
  alpha = min(1.0, 1.25 * aTint.a) * on * smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.72, 1.0, t));
  size *= on;
  tint = aTint.rgb;
`;

/*
 * Collects vents, then makes the mesh. One builder per mesh: a region's
 * steam, a landmark's plume, the park's far columns.
 */
export class SteamBuilder {
  constructor() {
    this.cols = { aVent: [], aPuff: [], aTint: [], aGate: [] };
    this.count = 0;
    this.box = new THREE.Box3();
  }

  /*
   * A vent: x, y, z; spread (m, the radius puffs start within); count;
   * size (m, a puff's radius when grown); rise (m over a life); life (s);
   * tint (0xRRGGBB, multiplied in); alpha; gate0 to gate1, the range of uGain
   * over which this vent's puffs switch on (a hero spreads its puffs over
   * it); rng, a [0, 1) generator for phases.
   */
  vent({ x, y, z, spread = 1, count = 3, size = 2, rise = 8, life = 8, tint = 0xffffff, alpha = 0.6, gate0 = 0, gate1 = 0, rng }) {
    const c = new THREE.Color(tint);
    for (let k = 0; k < count; k += 1) {
      this.cols.aVent.push(x, y, z, spread);
      this.cols.aPuff.push(rng(), life * (0.8 + 0.4 * rng()), size, rise * (0.75 + 0.5 * rng()));
      this.cols.aTint.push(c.r, c.g, c.b, alpha);
      this.cols.aGate.push(count > 1 ? gate0 + ((gate1 - gate0) * k) / (count - 1) : gate0);
    }
    this.count += count;
    this.box.expandByPoint(new THREE.Vector3(x - spread - size, y - size, z - spread - size));
    this.box.expandByPoint(new THREE.Vector3(x + spread + size, y + rise * 1.3 + size, z + spread + size));
  }

  /*
   * Two meshes from one builder: the puffs of at least `cut` metres with
   * eighty faces, where a puff a few metres off is big on screen and twenty
   * faces show as a hexagon, and the small ones with twenty, which is most
   * of a basin's puffs and a quarter of the triangles.
   */
  buildSplit(env, { cut = 2, name = 'steam', fade = null } = {}) {
    const big = new SteamBuilder();
    const small = new SteamBuilder();
    for (let k = 0; k < this.count; k += 1) {
      const to = this.cols.aPuff[k * 4 + 2] >= cut ? big : small;
      for (const key of Object.keys(this.cols)) {
        const n = key === 'aGate' ? 1 : 4;
        to.cols[key].push(...this.cols[key].slice(k * n, k * n + n));
      }
      to.count += 1;
    }
    big.box.copy(this.box);
    small.box.copy(this.box);
    return [
      big.build(env, { detail: 1, name: `${name}-big`, fade }),
      small.build(env, { detail: 0, name: `${name}-small`, fade }),
    ].filter(Boolean);
  }

  /* The mesh, or null when nothing was added. `env` carries the shared clock
   * and wind uniforms and the sun, so every steam mesh moves together. */
  build(env, { detail = 0, name = 'steam', opacity = 0.999, fade = null, squash = 1 } = {}) {
    if (this.count === 0) {
      return null;
    }
    /* The wind carries a puff up to its life times the wind speed; the
     * bounding sphere has to hold the whole drifted plume or a plume half
     * in view is culled. */
    let maxLife = 0;
    for (let k = 1; k < this.cols.aPuff.length; k += 4) {
      maxLife = Math.max(maxLife, this.cols.aPuff[k]);
    }
    const reach = maxLife * env.windSpeed();
    const sphere = this.box.getBoundingSphere(new THREE.Sphere());
    sphere.radius += reach;
    const mat = steamMaterial(env, opacity);
    const table = {
      aVent: [4, new Float32Array(this.cols.aVent)],
      aPuff: [4, new Float32Array(this.cols.aPuff)],
      aTint: [4, new Float32Array(this.cols.aTint)],
      aGate: [1, new Float32Array(this.cols.aGate)],
    };
    if (fade) {
      mat.uniforms.uFade.value.set(fade[0], fade[1]);
    }
    /* Steam lying over warm water or a big pool is a sheet, not a column:
     * its puffs are flattened. */
    mat.uniforms.uSquash.value = squash;
    const mesh = particleMesh(detail, mat, table, this.count, sphere, name);
    mesh.userData.gain = mat.uniforms.uGain;
    return mesh;
  }
}

/* A steam material with its own gain, sharing the clock and the wind. */
function steamMaterial(env, opacity) {
  const mat = particleMaterial({
    key: 'steam',
    attrs: ['vec4 aVent', 'vec4 aPuff', 'vec4 aTint', 'float aGate'],
    uniforms: { uWind: env.wind, uGain: { value: 1 } },
    motion: STEAM_MOTION,
    opacity,
    lit: 0xfbfcfd,
    shade: 0xaebdd2,
    sunDir: env.sunDir,
  });
  mat.uniforms.uTime = env.clock;
  mat.uniforms.uWind = env.wind;
  return mat;
}
