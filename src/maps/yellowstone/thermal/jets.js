/*
 * jets.js: water in the air. A geyser's column, its spray and its splashing
 * preplay, and the plop of a mud pot, as instanced drops on ballistic paths
 * computed in the vertex shader.
 *
 * A drop is launched, flies under gravity, and falls back round the vent;
 * then it is launched again. How hard it is launched is the geyser's power
 * AT ITS LAUNCH TIME, not now, or a column would bend like a hose when the
 * power changes mid flight. For a hero geyser the schedule is JavaScript
 * (schedule.js), so the last eight seconds of power are handed to the
 * shader as a short history, sampled from the pure schedule every frame;
 * a drop reads the entry for its own launch. A drop that goes to a height
 * h leaves at sqrt(2 g h), so a column filled by drops whose speeds spread
 * from half to all of the launch speed fills from the vent to the top.
 *
 * The inventory's small geysers have no JavaScript schedule each: their
 * periodic envelope is evaluated in the shader from per instance interval,
 * duration and offset, so every minor geyser of a region is one draw.
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

/* Twenty samples a fifth of a second apart and then some: a drop to 61 m
 * is 7.1 s in the air. */
export const HIST = 24;
export const HIST_DT = 0.35;

const HERO_MOTION = /* glsl */ `
  float v0 = sqrt(2.0 * 9.81 * uPeak);
  float flight = 2.0 * v0 / 9.81 + 0.6;
  float t = fract(uTime / flight + aDrop.x) * flight;
  /* Power at this drop's launch, from the history, linearly between
   * samples. */
  float hi = t / uHistDt;
  int i0 = int(floor(hi));
  float p = 0.0;
  if (i0 < ${HIST - 1}) {
    float a = uHist[i0];
    float b = uHist[i0 + 1];
    p = mix(a, b, hi - float(i0));
  }
  float v = v0 * sqrt(max(p, 0.0)) * aDrop.y;
  float ang = aDrop.z * 6.2832;
  vec3 side = vec3(cos(ang), 0.0, sin(ang)) * aDrop.w;
  vec3 vel = uDir * v + side * v * uSpread;
  vec3 at = vel * t;
  at.y -= 0.5 * 9.81 * t * t;
  /* Spray is carried off downwind the higher it has gone. */
  at.xz += uWind * t * 0.45 * clamp(at.y / 20.0, 0.0, 1.0);
  centre = uVent + side * uWidth + at;
  float live = step(0.004, p) * step(-2.0, at.y);
  float up = clamp(at.y / max(1.0, uPeak), 0.0, 1.0);
  size = aSize * live * (0.7 + 1.9 * up) * (0.55 + 0.45 * aDrop.y);
  alpha = live;
`;

const MINOR_MOTION = /* glsl */ `
  float peak = aSched.w;
  float v0 = sqrt(2.0 * 9.81 * peak);
  float flight = 2.0 * v0 / 9.81 + 0.4;
  float t = fract(uTime / flight + aDrop.x) * flight;
  float launch = uTime - t + aSched.z;
  float ph = mod(launch, aSched.x);
  float p = smoothstep(0.0, 3.0, ph) * (1.0 - smoothstep(aSched.y * 0.75, aSched.y, ph));
  p *= 0.8 + 0.2 * sin(launch * 2.7 + aSched.z);
  float v = v0 * sqrt(max(p, 0.0)) * aDrop.y;
  float ang = aDrop.z * 6.2832;
  vec3 side = vec3(cos(ang), 0.0, sin(ang)) * aDrop.w;
  vec3 at = (vec3(0.0, 1.0, 0.0) * v + side * v * 0.12) * t;
  at.y -= 0.5 * 9.81 * t * t;
  centre = aVent.xyz + side * aVent.w + at;
  float live = step(0.01, p) * step(-0.5, at.y);
  size = aSize * live * (0.8 + 1.2 * clamp(at.y / max(1.0, peak), 0.0, 1.0));
  alpha = live;
`;

/* A mud pot: a blob of mud swells on the surface and pops, over and over,
 * at a spot that moves each time. */
const MUD_MOTION = /* glsl */ `
  float life = aSched.x;
  float cyc = uTime / life + aDrop.x;
  float t = fract(cyc);
  float n = floor(cyc);
  float ang = ysHash(vec2(n, aDrop.x * 31.0)) * 6.2832;
  float rr = sqrt(ysHash(vec2(aDrop.x * 17.0, n))) * aVent.w;
  float swell = smoothstep(0.0, 0.8, t) * (1.0 - step(0.9, t));
  /* The pop throws a little mud up for the last tenth. */
  float pop = step(0.9, t) * (t - 0.9) * 10.0;
  centre = aVent.xyz + vec3(cos(ang) * rr, -0.15 * aSize + pop * 0.6 * aSize, sin(ang) * rr);
  size = aSize * (0.25 + 0.75 * swell) * (1.0 - pop);
  alpha = step(0.001, size);
  tint = aTint.rgb;
`;

export function historyUniform() {
  return { value: new Float32Array(HIST) };
}

/*
 * A hero geyser's water: `drops` instances launched from (x, y, z) along
 * dir (unit, straight up unless the geyser leans), spreading sideways by
 * `spread` of their speed from a vent `width` across. The returned object
 * carries `update(schedule, t)`, which refills the history.
 */
export function heroJet(env, { x, y, z, peak, drops = 420, size = 0.9, spread = 0.1, width = 0.6, dir = [0, 1, 0], name, rng }) {
  const aDrop = new Float32Array(drops * 4);
  const aSize = new Float32Array(drops);
  for (let k = 0; k < drops; k += 1) {
    aDrop[k * 4] = rng();
    /* Speeds from about half to all of the launch speed, weighted to the
     * top so the head of the column is full. */
    aDrop[k * 4 + 1] = 0.45 + 0.55 * Math.sqrt(rng());
    aDrop[k * 4 + 2] = rng();
    aDrop[k * 4 + 3] = rng() ** 0.7;
    aSize[k] = size * (0.6 + 0.8 * rng());
  }
  const hist = historyUniform();
  const d = new THREE.Vector3(...dir).normalize();
  const mat = particleMaterial({
    key: 'hero-jet',
    attrs: ['vec4 aDrop', 'float aSize'],
    uniforms: {
      uWind: env.wind,
      uVent: { value: new THREE.Vector3(x, y, z) },
      uDir: { value: d },
      uPeak: { value: peak },
      uSpread: { value: spread },
      uWidth: { value: width },
      uHistDt: { value: HIST_DT },
    },
    glsl: `uniform float uHist[${HIST}];`,
    motion: HERO_MOTION,
    lit: 0xffffff,
    shade: 0xb9c9dc,
    sunDir: env.sunDir,
  });
  mat.uniforms.uTime = env.clock;
  mat.uniforms.uHist = hist;
  const reach = peak * 1.2 + 10;
  const sphere = new THREE.Sphere(new THREE.Vector3(x + d.x * peak * 0.5, y + reach / 2, z + d.z * peak * 0.5), reach);
  const mesh = particleMesh(0, mat, { aDrop: [4, aDrop], aSize: [1, aSize] }, drops, sphere, name ?? 'jet');
  return {
    mesh,
    /* The history is sampled from the pure schedule at t, t - dt, ...: a
     * drop launched i * dt ago reads entry i. */
    update(schedule, t) {
      const h = hist.value;
      for (let i = 0; i < HIST; i += 1) {
        h[i] = schedule.at(t - i * HIST_DT).power;
      }
    },
    /* Whether any drop launched in the history is still in the air: a
     * quiet geyser's column is not drawn at all. */
    live() {
      return hist.value.some((p) => p > 0.004);
    },
  };
}

/*
 * Collects the small geysers and the mud pots of a region, each kind one
 * mesh.
 */
export class JetBuilder {
  constructor(kind) {
    this.kind = kind;
    this.cols = { aVent: [], aDrop: [], aSize: [], aSched: [], aTint: [] };
    this.count = 0;
    this.box = new THREE.Box3();
  }

  /* A small geyser: interval and duration in seconds, peak in metres. */
  geyser({ x, y, z, width, peak, interval, duration, offset, drops, size, rng }) {
    for (let k = 0; k < drops; k += 1) {
      this.cols.aVent.push(x, y, z, width);
      this.cols.aDrop.push(rng(), 0.45 + 0.55 * Math.sqrt(rng()), rng(), rng());
      this.cols.aSize.push(size * (0.6 + 0.8 * rng()));
      this.cols.aSched.push(interval, duration, offset, peak);
      this.cols.aTint.push(1, 1, 1, 1);
    }
    this.count += drops;
    this.box.expandByPoint(new THREE.Vector3(x - peak * 0.4, y - 1, z - peak * 0.4));
    this.box.expandByPoint(new THREE.Vector3(x + peak * 0.4, y + peak * 1.3, z + peak * 0.4));
  }

  /* A mud pot: `blobs` bubbles across a pot `r` across, each cycling in
   * `life` seconds, in the pot's mud colour. */
  mud({ x, y, z, r, blobs, size, life, tint, rng }) {
    const c = new THREE.Color(tint);
    for (let k = 0; k < blobs; k += 1) {
      this.cols.aVent.push(x, y, z, r * 0.8);
      this.cols.aDrop.push(rng(), 1, 0, 0);
      this.cols.aSize.push(size * (0.5 + rng()));
      this.cols.aSched.push(life * (0.6 + 0.8 * rng()), 0, 0, 0);
      this.cols.aTint.push(c.r, c.g, c.b, 1);
    }
    this.count += blobs;
    this.box.expandByPoint(new THREE.Vector3(x - r - 1, y - 1, z - r - 1));
    this.box.expandByPoint(new THREE.Vector3(x + r + 1, y + 1.5, z + r + 1));
  }

  build(env, name) {
    if (this.count === 0) {
      return null;
    }
    const mud = this.kind === 'mud';
    const mat = particleMaterial({
      key: mud ? 'mud' : 'minor-jet',
      attrs: ['vec4 aVent', 'vec4 aDrop', 'float aSize', 'vec4 aSched', 'vec4 aTint'],
      uniforms: { uWind: env.wind },
      motion: mud ? MUD_MOTION : MINOR_MOTION,
      shade: mud ? 0x8a8a96 : 0xb9c9dc,
      sunDir: env.sunDir,
    });
    mat.uniforms.uTime = env.clock;
    const table = {
      aVent: [4, new Float32Array(this.cols.aVent)],
      aDrop: [4, new Float32Array(this.cols.aDrop)],
      aSize: [1, new Float32Array(this.cols.aSize)],
      aSched: [4, new Float32Array(this.cols.aSched)],
      aTint: [4, new Float32Array(this.cols.aTint)],
    };
    const sphere = this.box.getBoundingSphere(new THREE.Sphere());
    return particleMesh(0, mat, table, this.count, sphere, name);
  }
}

