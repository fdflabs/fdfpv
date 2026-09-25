/*
 * spray.js: what an aircraft on floats throws up and leaves behind on a
 * lake with waves (lakewaves.js): the spray off its floats, its wake, and
 * the splash when it comes down on the water.
 *
 * Render only. It reads what the plant did on the last step,
 * sim_float_state (the buoyancy, the planing force, each float's wetted
 * length), with the aircraft's drawn pose and its velocity, and draws on
 * the waves the lake is drawn with; nothing here reaches the plant. The
 * plant models none of this (docs/FLOATS-STAGE1.md, "What it does not
 * model": the hump's closure stands for the spray, the bow wave and the
 * wake), so this is the picture of what its numbers say is happening:
 *
 *   A float wet at speed throws its whisker spray from where the water
 *   meets it, the front of its wetted length, out past its chines and
 *   up, at a share of the speed through the water; more of it the
 *   faster, none below a walking pace.
 *
 *   The wake is Kelvin's: two arms from the bows at 19.5 degrees either
 *   side of the track at displacement speeds, closing as the float gets
 *   on the step, as a planing hull's wake narrows with its length Froude
 *   number (Rabaud and Moisy 2013, angle 0.18 / Fr past Fr 0.5); behind
 *   a planing float a churned white trail as wide as the floats; each
 *   drawn on the waves where they are now, from the track as it was.
 *
 *   A float that goes from dry to wet coming down, or fast, splashes:
 *   a ring of droplets round where it touched, more the harder it hit.
 *
 * Droplets fly ballistically under g on the sim clock, so a paused sim
 * holds them in the air, and die where they meet the water.
 *
 *   buildSpray({ waves, color, wakeColor, strength })
 *     -> { group, update(t, craft, camera, renderer), clear(), dispose(), stats }
 *
 * `craft` is null, or { position, quaternion (the drawn craft's, in the
 * craft frame: x right, y up, z aft), velocity {x, y, z}, state (the ten
 * numbers of sim_float_state), floats (the float geometry in the body
 * frame, floatset.js's) }.
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
import { injectWaves } from './lakewaves.js';

const G = 9.81;
const DROPS = 1600;
const TRAIL = 120;
/* Kelvin's half angle, and the length a float's Froude number is on. */
const KELVIN = Math.asin(1 / 3);
/* How long the churned water and the arms last, s. */
const CHURN_S = 0.7;
const ARM_S = 5;

/* A small repeatable generator, so two runs of the same flight throw the
 * same spray: this is a picture, not physics, but a picture that changes
 * between two identical runs cannot be compared. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function dropMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color.clone() }, uScale: { value: 500 } },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aAlpha;
      uniform float uScale;
      varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float px = aSize * uScale / max(-mv.z, 0.05);
        gl_PointSize = clamp(px, 1.0, 48.0);
        /* A droplet under a pixel dims rather than holding a pixel. */
        vAlpha = aAlpha * clamp(px, 0.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        vec2 d = gl_PointCoord * 2.0 - 1.0;
        float r = dot(d, d);
        if (r > 1.0) {
          discard;
        }
        gl_FragColor = vec4(uColor, vAlpha * (1.0 - r * r));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
}

export function buildSpray({ waves, color = new THREE.Color(0.9, 0.93, 0.95), wakeColor = color, strength = 1, order = 10 }) {
  const group = new THREE.Group();
  group.name = 'float-spray';
  const rand = rng(20260925);

  /* The droplets: position, velocity, age and life, size. */
  const pos = new Float32Array(DROPS * 3);
  const vel = new Float32Array(DROPS * 3);
  const age = new Float32Array(DROPS);
  const life = new Float32Array(DROPS);
  const size = new Float32Array(DROPS);
  const alpha = new Float32Array(DROPS);
  let live = 0;
  const dropGeo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const sizeAttr = new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage);
  const alphaAttr = new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage);
  dropGeo.setAttribute('position', posAttr);
  dropGeo.setAttribute('aSize', sizeAttr);
  dropGeo.setAttribute('aAlpha', alphaAttr);
  dropGeo.setDrawRange(0, 0);
  const dropMat = dropMaterial(color);
  const drops = new THREE.Points(dropGeo, dropMat);
  drops.name = 'float-spray-drops';
  drops.frustumCulled = false;
  drops.renderOrder = order + 1;
  group.add(drops);

  function emit(x, y, z, vx, vy, vz, l, s) {
    if (live >= DROPS) {
      return;
    }
    const i = live;
    live += 1;
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    vel[i * 3] = vx;
    vel[i * 3 + 1] = vy;
    vel[i * 3 + 2] = vz;
    age[i] = 0;
    life[i] = l;
    size[i] = s;
  }

  function stepDrops(dt) {
    let j = 0;
    const drag = Math.exp(-1.2 * dt);
    for (let i = 0; i < live; i += 1) {
      const a = age[i] + dt;
      let x = pos[i * 3];
      let y = pos[i * 3 + 1];
      let z = pos[i * 3 + 2];
      const vx = vel[i * 3] * drag;
      const vy = vel[i * 3 + 1] * drag - G * dt;
      const vz = vel[i * 3 + 2] * drag;
      x += vx * dt;
      y += vy * dt;
      z += vz * dt;
      const surface = waves.height(x, z);
      if (a >= life[i] || (vy < 0 && surface !== null && y < surface)) {
        continue;
      }
      pos[j * 3] = x;
      pos[j * 3 + 1] = y;
      pos[j * 3 + 2] = z;
      vel[j * 3] = vx;
      vel[j * 3 + 1] = vy;
      vel[j * 3 + 2] = vz;
      age[j] = a;
      life[j] = life[i];
      size[j] = size[i];
      alpha[j] = 0.7 * (1 - (a / life[i]) ** 2);
      j += 1;
    }
    live = j;
  }

  /* The wake: a ring of the track's points, newest last. */
  const trail = [];
  const WAKE_V = TRAIL * 12;
  const wakePos = new Float32Array(WAKE_V * 3);
  const wakeCol = new Float32Array(WAKE_V * 4);
  const wakeIdx = new Uint16Array((TRAIL - 1) * 8 * 6);
  const wakeGeo = new THREE.BufferGeometry();
  const wakePosAttr = new THREE.BufferAttribute(wakePos, 3).setUsage(THREE.DynamicDrawUsage);
  const wakeColAttr = new THREE.BufferAttribute(wakeCol, 4).setUsage(THREE.DynamicDrawUsage);
  wakeGeo.setAttribute('position', wakePosAttr);
  wakeGeo.setAttribute('color', wakeColAttr);
  const wakeIdxAttr = new THREE.BufferAttribute(wakeIdx, 1).setUsage(THREE.DynamicDrawUsage);
  wakeGeo.setIndex(wakeIdxAttr);
  wakeGeo.setDrawRange(0, 0);
  const wakeMat = injectWaves(new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  }), waves, { res: 0.1, normals: false });
  const wake = new THREE.Mesh(wakeGeo, wakeMat);
  wake.name = 'float-wake';
  wake.frustumCulled = false;
  wake.renderOrder = order;
  group.add(wake);

  const stats = { drops: 0, trail: 0, splashes: 0, spraying: 0 };
  let tPrev = null;
  let wetPrev = [false, false];
  /* The speed the wake is laid at, s smoothed over most of a second: a
   * wave train takes that long to form behind a hull that speeds up, and
   * an arm laid from the raw speed on a take off run jogs outward where
   * the speed jumped. */
  let wakeV = 0;
  const q = new THREE.Quaternion();
  const v3 = new THREE.Vector3();
  const bow = new THREE.Vector3();
  const stern = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  /* A body frame point (x forward, y left, z up) of the craft into the
   * map: the craft frame is x right, y up, z aft. */
  function bodyToMap(craft, bx, by, bz, out) {
    out.set(-by, bz, -bx).applyQuaternion(q).add(craft.position);
    return out;
  }

  function buildWake(t) {
    let v = 0;
    let n = 0;
    const put = (x, y, z, a) => {
      wakePos[v * 3] = x;
      wakePos[v * 3 + 1] = y;
      wakePos[v * 3 + 2] = z;
      wakeCol[v * 4] = wakeColor.r;
      wakeCol[v * 4 + 1] = wakeColor.g;
      wakeCol[v * 4 + 2] = wakeColor.b;
      wakeCol[v * 4 + 3] = a;
      v += 1;
    };
    /* The wake's vertices are tens of centimetres apart, and the water
     * between them rises and falls with every wave shorter than a few of
     * those: the wake follows the long waves and rides over the crests
     * of the short ones, or the water hides it in stretches. */
    let lift = 0.004;
    for (const c of waves.body ? waves.body.comps : []) {
      lift += Math.hypot(c.kx, c.kz) > 3 ? c.a : 0;
    }
    const base = (waves.body ? waves.body.y0 : 0) + lift;
    /* Each point is four cross sections of three vertices, a soft edge,
     * a crest and a soft edge: the two arms, and the churned water behind
     * each float. A run of the track fades in over its first points, so a
     * wake does not start on a hard edge. */
    const first = [];
    const section = (x, z, nx, nz, w, a) => {
      put(x + nx * w, base, z + nz * w, 0);
      put(x, base, z, a);
      put(x - nx * w, base, z - nz * w, 0);
    };
    for (let i = 0; i < trail.length; i += 1) {
      const p = trail[i];
      const a = t - p.t;
      const nx = -p.dz;
      const nz = p.dx;
      const lead = Math.min(1, p.run / 4);
      /* The arms: out from the bows at the wake's angle, as far as the
       * bows have gone since, widening and fading, broken along their
       * length as the crests of a real one are. */
      const spread = p.w + Math.tan(p.angle) * p.v * a;
      const armW = 0.03 + 0.02 * a;
      const armA = p.wet ? 0.3 * strength * lead * (0.55 + 0.45 * p.j) * Math.min(1, p.v / 2) * Math.exp(-a / ARM_S) * Math.min(1, a / 0.2) : 0;
      /* Behind each float on the step: as wide as its beam, spreading and
       * thinning. */
      const churnW = p.beam * (0.6 + 1.2 * a);
      const churnA = p.wet ? 0.45 * strength * lead * p.plane * (0.5 + 0.5 * p.j) * Math.exp(-a / CHURN_S) : 0;
      first.push(v);
      section(p.bx + nx * spread, p.bz + nz * spread, nx, nz, armW, armA);
      section(p.bx - nx * spread, p.bz - nz * spread, nx, nz, armW, armA);
      section(p.sx + nx * p.fy, p.sz + nz * p.fy, nx, nz, churnW, churnA);
      section(p.sx - nx * p.fy, p.sz - nz * p.fy, nx, nz, churnW, churnA);
    }
    for (let i = 1; i < trail.length; i += 1) {
      if (trail[i].gap) {
        continue;
      }
      const a = first[i - 1];
      const b = first[i];
      for (let k = 0; k < 12; k += 3) {
        for (const l of [k, k + 1]) {
          const r = l + 1;
          wakeIdx.set([a + l, b + l, a + r, a + r, b + l, b + r], n);
          n += 6;
        }
      }
    }
    wakePosAttr.needsUpdate = true;
    wakeColAttr.needsUpdate = true;
    wakeIdxAttr.needsUpdate = true;
    wakeGeo.setDrawRange(0, n);
    /* three still issues a draw for an empty range. */
    wake.visible = n > 0;
  }

  function clear() {
    live = 0;
    wakeV = 0;
    trail.length = 0;
    wetPrev = [false, false];
    tPrev = null;
    dropGeo.setDrawRange(0, 0);
    wakeGeo.setDrawRange(0, 0);
    drops.visible = false;
    wake.visible = false;
  }

  function update(t, craft, camera, renderer) {
    if (tPrev === null || t < tPrev - 1e-6) {
      /* The first frame, or the sim clock went back: a reset. */
      clear();
      tPrev = t;
    }
    const dt = Math.min(0.05, t - tPrev);
    tPrev = t;
    if (renderer && camera) {
      const h = renderer.getDrawingBufferSize(tmp).y;
      dropMat.uniforms.uScale.value = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
    }
    if (craft && craft.floats && craft.state && waves.body && dt > 0) {
      q.copy(craft.quaternion);
      const f = craft.floats;
      const st = craft.state;
      const vx = craft.velocity.x;
      const vy = craft.velocity.y;
      const vz = craft.velocity.z;
      const speed = Math.hypot(vx, vz);
      const hx = speed > 0.05 ? vx / speed : 0;
      const hz = speed > 0.05 ? vz / speed : 0;
      const wetL = st[4];
      const wetR = st[5];
      const wet = wetL + wetR > 0;
      const len = f.xBow - f.xStern;
      /* The planing force against the buoyancy: 0 afloat, 1 when the
       * water's lift is all dynamic. */
      const plane = Math.max(0, Math.min(1, st[1] / Math.max(1e-3, st[0] + st[1])));
      stats.spraying = 0;
      [[wetL, 1], [wetR, -1]].forEach(([wl, side], k) => {
        const wasWet = wetPrev[k];
        wetPrev[k] = wl > 0;
        if (wl <= 0) {
          return;
        }
        const planing = speed > 2.5;
        const xf = Math.min(f.xBow, (planing ? f.xStep : f.xStern) + wl);
        const zf = f.zKeel + Math.max(0, xf - f.xKnee) * f.bowRise / Math.max(1e-3, f.xBow - f.xKnee);
        /* Touchdown: dry to wet, coming down or fast. */
        if (!wasWet && (vy < -0.2 || speed > 3)) {
          const hit = Math.hypot(vy, speed);
          const count = Math.min(300, Math.round(20 + 25 * hit));
          stats.splashes += 1;
          for (let i = 0; i < count; i += 1) {
            const x = f.xStern + rand() * (xf - f.xStern);
            bodyToMap(craft, x, side * f.y + (rand() - 0.5) * f.beam, f.zKeel + 0.01, v3);
            const ang = rand() * Math.PI * 2;
            const out = (0.15 + 0.35 * rand()) * hit;
            emit(v3.x, v3.y, v3.z,
              vx * 0.4 + Math.cos(ang) * out, (0.25 + 0.5 * rand()) * hit + 0.3, vz * 0.4 + Math.sin(ang) * out,
              0.5 + 0.7 * rand(), 0.005 + 0.012 * rand());
          }
        }
        /* The whisker spray, off both chines at the front of the wetted
         * length. */
        const through = Math.max(0, speed - 0.8);
        const rate = Math.min(600, 14 * through * through) * Math.min(1, wl / 0.1);
        let n = rate * dt;
        const whole = Math.floor(n);
        n = whole + (rand() < n - whole ? 1 : 0);
        stats.spraying += n;
        for (let i = 0; i < n; i += 1) {
          const outward = rand() < 0.7 ? side : -side;
          bodyToMap(craft, xf, side * f.y + outward * f.beam * 0.5, zf + 0.01, v3);
          /* Out across the track, forward with the float a little, up. */
          const lat = (0.25 + 0.25 * rand()) * speed;
          const lx = -hz * outward * lat;
          const lz = hx * outward * lat;
          emit(v3.x, v3.y, v3.z,
            vx * (0.45 + 0.2 * rand()) + lx, (0.12 + 0.12 * rand()) * speed + 0.2, vz * (0.45 + 0.2 * rand()) + lz,
            0.25 + 0.45 * rand(), 0.004 + 0.009 * rand());
        }
      });

      /* The track, when the floats move through the water. */
      bodyToMap(craft, f.xBow, 0, f.zKeel, bow);
      bodyToMap(craft, f.xStep, 0, f.zKeel, stern);
      wakeV += (speed - wakeV) * (1 - Math.exp(-dt / 0.8));
      const last = trail[trail.length - 1];
      const moved = last ? Math.hypot(bow.x - last.bx, bow.z - last.bz) : Infinity;
      if (wet && speed > 0.3 && moved > Math.max(0.15, speed * 0.06)) {
        const fr = wakeV / Math.sqrt(G * len);
        const angle = fr > 0.5 ? Math.min(KELVIN, 0.18 / fr) : KELVIN;
        const gap = !last || !last.wet || moved > 3;
        trail.push({
          t, bx: bow.x, bz: bow.z, sx: stern.x, sz: stern.z, dx: hx, dz: hz, v: wakeV, angle,
          w: f.y + f.beam * 0.5, fy: f.y, beam: f.beam, plane: speed > 2 ? plane : 0, wet: true, gap,
          run: gap ? 0 : last.run + 1, j: rand(),
        });
      } else if (!wet && last && last.wet) {
        trail.push({ ...last, t, wet: false, gap: true });
      }
      while (trail.length > TRAIL || (trail.length && t - trail[0].t > ARM_S * 3)) {
        trail.shift();
      }
    } else if (!craft) {
      wetPrev = [false, false];
    }
    if (dt > 0) {
      stepDrops(dt);
    }
    posAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
    dropGeo.setDrawRange(0, live);
    drops.visible = live > 0;
    buildWake(t);
    stats.drops = live;
    stats.trail = trail.length;
  }

  return {
    group,
    update,
    clear,
    stats,
    dispose() {
      group.removeFromParent();
      dropGeo.dispose();
      dropMat.dispose();
      wakeGeo.dispose();
      wakeMat.dispose();
    },
  };
}
