/*
 * clouds.js: the low cloud in the valley.
 *
 * The photographs of this valley are made by cloud that sits in it:
 * banks of cumulus and stratus half way up the walls, torn on the
 * ridges, and mist lying in the forest on the slopes. The sky dome is a
 * photograph of the sky over the valley and holds none of that, so it is
 * drawn here, as a volume the post chain marches through:
 *
 *   The bank. A layer whose base wanders between about 600 and 900 m
 *   (the walls stand 1400 m over the floor), as deep as the cloud is
 *   thick, its cover a noise a kilometre across drifting on a slow wind,
 *   eroded at its edges by a billowing noise so a cloud is heaped at the
 *   top and torn at the sides. Where it runs into a wall the wall's own
 *   depth cuts it, so it clings.
 *
 *   The stratus. A thin sheet under the bank, long down the valley and
 *   torn into strands across it.
 *
 *   The mist. Thin wisps within a few tens of metres of the ground, on
 *   the forested middle of the walls only, in patches, stretched along
 *   the contour the way valley mist lies.
 *
 * Why a march in the post chain and not billboards: a cloud that clings
 * to a wall is cut by the wall, and a billboard cut by the ground shows
 * the cut as a line unless every puff reads the scene's depth anyway.
 * Marching from the depth the scene already wrote costs one full screen
 * draw and no geometry, is cut by the terrain per pixel, is fogged by
 * the same air as the ground behind it, and lets a craft fly through a
 * cloud with the cloud all round it (it is only light: nothing collides). It runs at half resolution into a target of its
 * own and is brought up to full size by post.js with the depth as guide.
 *
 * Each sample is lit by the sun (through the cloud toward it, and past
 * the ridges by light.js's baked terrain shadow, so a bank in a wall's
 * shadow is grey and blue) and by the sky, brighter at the top of a cloud
 * than under it. The bank's shadow on the ground is light.js's: it reads
 * the same cover (LOW_COVER_GLSL), so a cloud and its shadow agree.
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
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { HALF, FIELD, CELL, CELLS } from '../alps/terrain.js';
import { AIR_GLSL } from './post.js';

/*
 * The bank. LOW_BASE is its lowest base in metres, LOW_LIFT how much
 * higher the noise can carry it, LOW_THICK its greatest depth. LOW_COVER
 * is the share of the sky over the valley the bank covers, LOW_SIZE its
 * noise's scale in metres. LOW_WIND is its drift in m/s, slower than the
 * deck's high above (light.js), as a valley's air is. LOW_START is where
 * the noise stands at the first frame, chosen as light.js chose the
 * deck's: over the first two hundred seconds (longer than the loop's
 * views take) no fixed view's near foreground lies in a bank's shadow,
 * and within that, the start whose banks hang where the references'
 * do. The first choice put meadow-eye's meadow in shade, and a view that
 * opens in shade says nothing about the ground it was meant to show.
 */
export const LOW_BASE = 600;
export const LOW_LIFT = 300;
export const LOW_THICK = 420;
export const LOW_COVER = 0.48;
export const LOW_SIZE = 1300;
const LOW_WIND = new THREE.Vector2(-1.6, 0.9);
const LOW_START = new THREE.Vector2(750, 3500);
/* Extinction per metre in the densest cloud and in the mist: a cumulus's
 * mean free path is some tens of metres, a valley mist's a few hundred. */
const SIGMA_BANK = 0.028;
const SIGMA_MIST = 0.005;
/* The stratus sheet under the bank: its base, its depth, its extinction.
 * It is thin enough that its shadow is left out (light.js takes the
 * bank's only), which saves every lit material a second cover. */
const SHEET_Y = 430;
const SHEET_THICK = 110;
const SIGMA_SHEET = 0.009;
/* The march goes no further than this, in metres: the bank ends a
 * little past the field (s2LowCover), and from any point in the field
 * that is inside this. */
const MARCH_FAR = 9500;
/* Where the bank's shadow is taken on the ground: through its middle. */
export const LOW_SHADOW_Y = LOW_BASE + 0.5 * LOW_LIFT + 0.4 * LOW_THICK;
/* How much of the sun the thickest bank stops on the ground below. */
export const LOW_SHADOW_DEPTH = 0.78;

/* The noise volume, NOISE_PX a side, tiling. */
const NOISE_PX = 64;

/*
 * The bank's cover over the ground, 0 to 1, and a second noise for its
 * base's height, shared by the march and the ground's shadow. Plain value
 * noise off a hash: every lit material in swiss2 carries a copy, so it
 * reads no texture.
 */
export const LOW_COVER_GLSL = /* glsl */ `
  uniform vec2 uS2LowAt;
  float s2lHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float s2lNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(s2lHash(i), s2lHash(i + vec2(1.0, 0.0)), u.x),
               mix(s2lHash(i + vec2(0.0, 1.0)), s2lHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  /* (cover, lift): the share of cloud over xz, and how far above
   * LOW_BASE the bank's base stands there, 0 to 1. A valley's cloud
   * forms on its slopes and hangs along its walls, so the cover is
   * thinned over the middle of the floor (the axis is terrain.js's
   * valleyAxis), and it ends a little past the field, where the ground
   * it would hang on ends. */
  vec2 s2LowCover(vec2 xz) {
    vec2 q = (xz + uS2LowAt) / ${LOW_SIZE.toFixed(1)};
    float n = s2lNoise(q) * 0.6 + s2lNoise(q * 2.13 + 3.1) * 0.28 + s2lNoise(q * 4.37 + 7.7) * 0.12;
    float axis = 180.0 * sin(xz.y / 1500.0) + 60.0 * sin(xz.y / 430.0 + 1.2);
    float wall = mix(0.55, 1.0, smoothstep(300.0, 1100.0, abs(xz.x - axis)));
    vec2 out2 = abs(xz) - ${(HALF + 600).toFixed(1)};
    float inside = 1.0 - smoothstep(0.0, 900.0, max(out2.x, out2.y));
    float cover = smoothstep(${(1 - LOW_COVER - 0.08).toFixed(3)}, ${(1 - LOW_COVER + 0.2).toFixed(3)}, n * wall) * inside;
    return vec2(cover, s2lNoise(xz / 2300.0 + 11.0));
  }
`;

/*
 * The noise volume: red a smooth fractal value noise, green a billowing
 * one (inverted cellular noise, three octaves), both tiling, so a cloud
 * is heaped where green is high and wispy where only red is.
 */
function noiseVolume() {
  const n = NOISE_PX;
  const data = new Uint8Array(n * n * n * 2);
  const hash = (x, y, z, s) => {
    let h = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 1274126177) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const wrap = (v, g) => ((v % g) + g) % g;
  const value = (x, y, z, g, s) => {
    const fx = (x / n) * g;
    const fy = (y / n) * g;
    const fz = (z / n) * g;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const iz = Math.floor(fz);
    const sm = (t) => t * t * (3 - 2 * t);
    const ux = sm(fx - ix);
    const uy = sm(fy - iy);
    const uz = sm(fz - iz);
    const c = (dx, dy, dz) => hash(wrap(ix + dx, g), wrap(iy + dy, g), wrap(iz + dz, g), s);
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(c(0, 0, 0), c(1, 0, 0), ux), l(c(0, 1, 0), c(1, 1, 0), ux), uy),
      l(l(c(0, 0, 1), c(1, 0, 1), ux), l(c(0, 1, 1), c(1, 1, 1), ux), uy),
      uz,
    );
  };
  const cells = (x, y, z, g, s) => {
    const fx = ((x + 0.5) / n) * g;
    const fy = ((y + 0.5) / n) * g;
    const fz = ((z + 0.5) / n) * g;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const iz = Math.floor(fz);
    let best = 9;
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const cx = ix + dx;
          const cy = iy + dy;
          const cz = iz + dz;
          const wx = wrap(cx, g);
          const wy = wrap(cy, g);
          const wz = wrap(cz, g);
          const px = cx + hash(wx, wy, wz, s) - fx;
          const py = cy + hash(wx, wy, wz, s + 1) - fy;
          const pz = cz + hash(wx, wy, wz, s + 2) - fz;
          best = Math.min(best, px * px + py * py + pz * pz);
        }
      }
    }
    return Math.min(1, Math.sqrt(best));
  };
  for (let z = 0; z < n; z += 1) {
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        const v = value(x, y, z, 4, 1) * 0.5 + value(x, y, z, 8, 2) * 0.28 + value(x, y, z, 16, 3) * 0.14 + value(x, y, z, 32, 4) * 0.08;
        const w = 1 - (cells(x, y, z, 3, 5) * 0.62 + cells(x, y, z, 6, 8) * 0.26 + cells(x, y, z, 12, 11) * 0.12);
        const k = ((z * n + y) * n + x) * 2;
        data[k] = Math.round(Math.max(0, Math.min(1, v)) * 255);
        data[k + 1] = Math.round(Math.max(0, Math.min(1, w)) * 255);
      }
    }
  }
  const t = new THREE.Data3DTexture(data, n, n, n);
  t.format = THREE.RGFormat;
  t.type = THREE.UnsignedByteType;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.wrapR = THREE.RepeatWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

const MarchShader = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: (steps) => /* glsl */ `
    #include <common>
    precision highp sampler3D;
    varying vec2 vUv;
    uniform highp sampler2D tDepth;
    uniform highp sampler3D uNoise;
    uniform highp sampler2D uHeight;
    uniform highp sampler2D uShadow;
    uniform float uReady;
    uniform mat4 uProjInv;
    uniform mat4 uCamWorld;
    uniform vec2 uTexel;
    uniform float uDrift;
    uniform vec3 uSunRad;
    uniform vec3 uSkyRad;
    ${AIR_GLSL}
    ${LOW_COVER_GLSL}

    /* The field's heights, a texel centred on each vertex of the grid;
     * outside the field the ground is far below any mist. */
    float groundAt(vec2 xz) {
      vec2 f = (xz + ${HALF.toFixed(1)}) / ${CELL.toFixed(4)};
      if (f.x < 0.0 || f.y < 0.0 || f.x > ${CELLS.toFixed(1)} || f.y > ${CELLS.toFixed(1)}) {
        return -1e4;
      }
      return texture2D(uHeight, (f + 0.5) / ${(CELLS + 1).toFixed(1)}).r;
    }
    /* light.js's s2TerrainSun, on the same baked texture. */
    float sunPastRidges(vec3 p) {
      vec2 uv = (p.xz + ${HALF.toFixed(1)}) / ${FIELD.toFixed(1)};
      if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
        return 1.0;
      }
      vec2 s = texture2D(uShadow, uv).rg;
      float w = 8.0 + s.y * 0.0047;
      return smoothstep(s.x - w, s.x + w, p.y);
    }

    /* Extinction per metre at p, and how far up its cloud p stands (0 at
     * the base, 1 at the top), for the sky's light. */
    vec2 density(vec3 p, bool mist) {
      vec2 cv = s2LowCover(p.xz);
      float base = ${LOW_BASE.toFixed(1)} + ${LOW_LIFT.toFixed(1)} * cv.y;
      float thick = ${LOW_THICK.toFixed(1)} * (0.3 + 0.7 * cv.x);
      float bank = 0.0;
      float h = -1.0;
      if (p.y > base - 90.0 && p.y < base + thick && cv.x > 0.01) {
        vec3 q = p + vec3(uDrift, 0.0, -0.6 * uDrift);
        vec2 big = texture(uNoise, q / vec3(560.0, 330.0, 560.0)).rg;
        /* A base that sags and lifts with the billows over it rather than
         * a ruled line, and a top as uneven. */
        h = (p.y - base + 90.0 * (big.r - 0.5)) / thick;
        float top = 0.45 + 0.55 * big.g;
        float profile = smoothstep(0.0, 0.18, h) * (1.0 - smoothstep(top * 0.55, top, h));
        vec2 fine = texture(uNoise, q / vec3(150.0, 110.0, 150.0)).rg;
        float shape = cv.x * profile - (1.0 - (big.g * 0.65 + big.r * 0.2 + fine.g * 0.15)) * 0.7;
        /* The edges torn finer than the body: where the shape is thin, a
         * noise a few tens of metres across eats into it. */
        if (shape > -0.1 && shape < 0.25) {
          float tear = texture(uNoise, q / vec3(55.0, 40.0, 55.0) + vec3(0.37)).g;
          shape -= (1.0 - tear) * 0.22 * (1.0 - smoothstep(0.0, 0.25, shape));
        }
        bank = clamp(shape * 3.4, 0.0, 1.0) * ${SIGMA_BANK.toFixed(4)};
      }
      /* The stratus: a thin sheet lower down, long along the valley and
       * short across it, torn into strands. */
      float sheetH = (p.y - ${SHEET_Y.toFixed(1)} - 90.0 * cv.y) / ${SHEET_THICK.toFixed(1)};
      if (sheetH > 0.0 && sheetH < 1.0) {
        vec2 sq = (p.xz + uS2LowAt * 0.7) / vec2(900.0, 2600.0);
        float lay = smoothstep(0.5, 0.8, s2lNoise(sq + 41.0) * 0.7 + s2lNoise(sq * 3.1 + 5.0) * 0.3);
        if (lay > 0.01) {
          float strand = texture(uNoise, (p + vec3(0.0, 0.0, uDrift)) / vec3(420.0, 50.0, 900.0)).r;
          float prof = smoothstep(0.0, 0.35, sheetH) * (1.0 - smoothstep(0.55, 1.0, sheetH));
          bank += clamp((lay * prof - (1.0 - strand) * 0.75) * 2.8, 0.0, 1.0) * ${SIGMA_SHEET.toFixed(4)};
        }
      }
      float m = 0.0;
      if (mist && p.y < 1300.0) {
        float g = groundAt(p.xz);
        float above = p.y - g;
        /* On the middle of the walls, where the forest is, in patches. */
        float wall = smoothstep(200.0, 360.0, g) * (1.0 - smoothstep(850.0, 1100.0, g));
        float patches = smoothstep(0.52, 0.8, s2lNoise((p.xz + 0.4 * uS2LowAt) / 380.0 + 21.0));
        float lie = smoothstep(0.0, 12.0, above) * (1.0 - smoothstep(15.0, 70.0, above));
        float here = wall * patches * lie;
        if (here > 0.01) {
          /* Stretched along the contour and torn across it. */
          vec3 wq = p + vec3(uDrift, 0.0, 0.0);
          float wisp = texture(uNoise, wq / vec3(300.0, 45.0, 300.0)).r * 0.7 + texture(uNoise, wq / vec3(90.0, 30.0, 90.0)).g * 0.3;
          m = clamp((here - (1.0 - wisp) * 1.1) * 2.6, 0.0, 1.0) * ${SIGMA_MIST.toFixed(4)};
        }
      }
      return vec2(bank + m, clamp(h, 0.0, 1.0) * step(m, bank));
    }

    void main() {
      if (uReady < 0.5) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }
      /* One full resolution texel stands for this half resolution one;
       * post.js reads the depth at the same texel to bring it up. */
      vec2 uv0 = (floor(vUv / uTexel / 2.0) * 2.0 + 0.5) * uTexel;
      float d = texture2D(tDepth, uv0).x;
      vec4 vp = uProjInv * vec4(uv0 * 2.0 - 1.0, (d < 1.0 ? d : 0.9999) * 2.0 - 1.0, 1.0);
      vp /= vp.w;
      vec3 wp = (uCamWorld * vec4(vp.xyz, 1.0)).xyz;
      vec3 ro = uCamPos;
      vec3 rd = normalize(wp - ro);
      float tEnd = d < 1.0 ? length(wp - ro) : 1e5;
      /* Only the slab the cloud can be in. */
      const float Y0 = ${Math.min(SHEET_Y, 200).toFixed(1)};
      const float Y1 = ${(LOW_BASE + LOW_LIFT + LOW_THICK + 20).toFixed(1)};
      float t0 = 0.0;
      float t1 = tEnd;
      if (abs(rd.y) > 1e-4) {
        float ta = (Y0 - ro.y) / rd.y;
        float tb = (Y1 - ro.y) / rd.y;
        t0 = max(t0, min(ta, tb));
        t1 = min(t1, max(ta, tb));
      } else if (ro.y < Y0 || ro.y > Y1) {
        t1 = -1.0;
      }
      t1 = min(t1, ${MARCH_FAR.toFixed(1)});
      if (t1 <= t0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }
      /* Steps finer near the camera, where a cloud is big on the screen,
       * each started at a per pixel offset so the banding is noise. */
      float jitter = s2lHash(gl_FragCoord.xy * 1.37 + 0.5);
      const int N = ${steps};
      float mu = dot(rd, uSunDir);
      const float g1 = 0.6;
      const float g2 = -0.2;
      float hg1 = (1.0 - g1 * g1) / (4.0 * PI * pow(1.0 + g1 * g1 - 2.0 * g1 * mu, 1.5));
      float hg2 = (1.0 - g2 * g2) / (4.0 * PI * pow(1.0 + g2 * g2 - 2.0 * g2 * mu, 1.5));
      float phase = mix(hg2, hg1, 0.55);
      vec3 L = vec3(0.0);
      float T = 1.0;
      float tw = 0.0;
      float wsum = 0.0;
      float span = t1 - t0;
      float prev = t0;
      for (int i = 0; i < N; i++) {
        float u = (float(i) + jitter) / float(N);
        float t = t0 + span * u * u;
        float dt = max(t - prev, 1.0);
        prev = t;
        vec3 p = ro + rd * t;
        vec2 dn = density(p, true);
        if (dn.x < 1e-5) {
          continue;
        }
        /* Toward the sun, two taps through the cloud. */
        float od = density(p + uSunDir * 50.0, false).x * 50.0 + density(p + uSunDir * 180.0, false).x * 130.0;
        float sun = exp(-od) * sunPastRidges(p);
        /* Light scattered many times inside a cloud does not keep the
         * sun's phase: a floor of it keeps a cloud's shaded side from
         * going black. */
        vec3 S = uSunRad * sun * (phase + 0.06) + uSkyRad * mix(0.45, 0.9, dn.y);
        float a = 1.0 - exp(-dn.x * dt);
        L += T * a * S;
        tw += T * a * t;
        wsum += T * a;
        T *= 1.0 - a;
        if (T < 0.02) {
          break;
        }
      }
      if (wsum > 0.0) {
        /* The air in front of the cloud, as it would veil a surface at
         * the cloud's mean depth. */
        vec3 at = ro + rd * (tw / wsum);
        L = airOver(L, at, wsum);
      }
      gl_FragColor = vec4(L, T);
    }
  `,
};

/*
 * The march, as a composer pass that does not swap: it reads the scene's
 * depth and writes its own half resolution target, which post.js reads.
 */
class CloudPass extends Pass {
  constructor(camera, uniforms, steps, w, h) {
    super();
    this.needsSwap = false;
    this.camera = camera;
    this.target = new THREE.WebGLRenderTarget(Math.max(1, w >> 1), Math.max(1, h >> 1), {
      type: THREE.HalfFloatType,
      depthBuffer: false,
    });
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        ...uniforms,
        tDepth: { value: null },
        uProjInv: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
        uCamPos: { value: new THREE.Vector3() },
        uTexel: { value: new THREE.Vector2(1 / w, 1 / h) },
      },
      vertexShader: MarchShader.vertexShader,
      fragmentShader: MarchShader.fragmentShader(steps),
      depthTest: false,
      depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }

  setSize(w, h) {
    this.target.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.material.uniforms.uTexel.value.set(1 / w, 1 / h);
  }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.material.uniforms;
    u.tDepth.value = readBuffer.depthTexture;
    u.uProjInv.value.copy(this.camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(this.camera.matrixWorld);
    u.uCamPos.value.setFromMatrixPosition(this.camera.matrixWorld);
    renderer.setRenderTarget(this.target);
    this.fsQuad.render(renderer);
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
  }
}

/*
 * Make the clouds. `sun` is { direction, color, irradiance } and `sky`
 * the sky's radiance for the cloud's ambient light. The noise volume is
 * made now; the terrain's heights and shadow are handed over with
 * setTerrain once the bake has run, and until then the march draws
 * nothing. `uniforms.uS2LowAt` is the drift, shared with light.js so the
 * ground's shadow moves with its cloud.
 */
export function makeClouds({ sun, sky, air }) {
  const noise = noiseVolume();
  const uniforms = {
    uS2LowAt: { value: new THREE.Vector2().copy(LOW_START) },
    uDrift: { value: 0 },
    uNoise: { value: noise },
    uHeight: { value: null },
    uShadow: { value: null },
    uReady: { value: 0 },
    uSunDir: { value: sun.direction.clone() },
    uSunCol: { value: sun.color.clone() },
    uSunRad: { value: sun.color.clone().multiplyScalar(sun.irradiance) },
    uSkyRad: { value: sky.clone() },
    uHaze: { value: air.haze.clone() },
    uBeta: { value: air.beta.clone() },
    uScaleH: { value: air.scaleHeight },
    uMie: { value: air.mie },
  };
  return {
    uniforms,
    setTerrain(height, shadow) {
      uniforms.uHeight.value = height;
      uniforms.uShadow.value = shadow;
      uniforms.uReady.value = 1;
    },
    /* Where the bank has drifted to, `seconds` after the valley was first
     * drawn; the billows turn over slowly as it goes. */
    setClock(seconds) {
      uniforms.uS2LowAt.value.copy(LOW_START).addScaledVector(LOW_WIND, -seconds);
      uniforms.uDrift.value = seconds * 0.8;
    },
    pass(camera, q, w, h) {
      return new CloudPass(camera, uniforms, q.id === 'high' ? 72 : 36, w, h);
    },
    dispose() {
      noise.dispose();
    },
  };
}
