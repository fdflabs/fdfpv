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
 *   The stratus. A thinner, paler layer under the bank, in bands long
 *   down the valley and short across it.
 *
 *   The mist. Faint puffs within a few tens of metres of the ground, on
 *   the forested middle of the walls only, in patches.
 *
 * The bank and the stratus are both shaped as heaped cloud, not as
 * slabs (heap in the march): a billowing noise cut by the cover, domed,
 * its edges eroded and faded, so no layer ends on a ruled line.
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
 * Each sample is lit by the sun (through the cloud toward it, in three
 * orders of scattering so a rim against the sun is silver and a shaded
 * flank grey, and past the ridges by light.js's baked terrain shadow, so
 * a bank in a wall's shadow is grey and blue) and by the sky, full at the
 * top of a cloud and dim under it. The bank's shadow on the ground is light.js's: it reads
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
const LOW_START = new THREE.Vector2(0, 12250);
/* Extinction per metre in the densest cloud and in the mist: a cumulus's
 * mean free path is some tens of metres, a valley mist's a few hundred. */
const SIGMA_BANK = 0.028;
const SIGMA_MIST = 0.006;
/* The stratus under the bank: its base, its greatest depth, its
 * extinction. It is broken and pale enough that its shadow is left out
 * (light.js takes the bank's only), which saves every lit material a
 * second cover. */
const SHEET_Y = 430;
const SHEET_THICK = 200;
const SIGMA_SHEET = 0.012;
/* The march goes no further than this, in metres: the bank ends a
 * little past the field (s2LowCover), and from any point in the field
 * that is inside this. */
const MARCH_FAR = 9500;
/* Where the bank's shadow is taken on the ground: through its middle. */
export const LOW_SHADOW_Y = LOW_BASE + 0.5 * LOW_LIFT + 0.4 * LOW_THICK;
/* How much of the sun the thickest bank stops on the ground below. */
export const LOW_SHADOW_DEPTH = 0.78;

/*
 * The march at each preset: its steps along the view, its taps toward the
 * sun (the first tap0 metres out, each next tapGrow times further), and
 * whether the edges are eroded. High spends about what the frame can
 * spare on the look; Medium and Low give up the self shadow's depth and
 * then the fine edges before they give up the cloud.
 */
const MARCH = {
  high: { steps: 112, taps: 4, tap0: 20, tapGrow: 2.2, fine: true },
  medium: { steps: 56, taps: 2, tap0: 40, tapGrow: 3.5, fine: true },
  low: { steps: 32, taps: 1, tap0: 90, tapGrow: 1, fine: false },
};

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
  float s2LowLift(vec2 xz) {
    return s2lNoise(xz / 2300.0 + 11.0);
  }
  vec2 s2LowCover(vec2 xz) {
    vec2 q = (xz + uS2LowAt) / ${LOW_SIZE.toFixed(1)};
    float n = s2lNoise(q) * 0.6 + s2lNoise(q * 2.13 + 3.1) * 0.28 + s2lNoise(q * 4.37 + 7.7) * 0.12;
    float axis = 180.0 * sin(xz.y / 1500.0) + 60.0 * sin(xz.y / 430.0 + 1.2);
    float wall = mix(0.55, 1.0, smoothstep(300.0, 1100.0, abs(xz.x - axis)));
    vec2 out2 = abs(xz) - ${(HALF + 600).toFixed(1)};
    float inside = 1.0 - smoothstep(0.0, 900.0, max(out2.x, out2.y));
    float cover = smoothstep(${(1 - LOW_COVER - 0.08).toFixed(3)}, ${(1 - LOW_COVER + 0.2).toFixed(3)}, n * wall) * inside;
    return vec2(cover, s2LowLift(xz));
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
  fragmentShader: (q) => /* glsl */ `
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

    float remap01(float x, float lo, float hi) {
      return clamp((x - lo) / max(hi - lo, 1e-4), 0.0, 1.0);
    }

    /*
     * A layer of heaped cloud at p: 0 to 1 of its densest, and how far up
     * in it p stands, 0 at the base and 1 at the top. cover is the layer's
     * share of the sky over p, base and thick where it stands, and q is p
     * in the noise's own units (each layer stretches and drifts its noise
     * its own way). With fine, the edges are eroded; the taps toward the
     * sun leave that out, which only makes the cloud they pass a little
     * denser.
     *
     * The shape is a cumulus's, not a slab's. A billowing noise is cut by
     * the cover, so where the cover is thin only its heaps stand and a
     * layer's edge breaks into separate puffs instead of ending on a
     * line. A heap is taller the deeper into the cover it stands, so it
     * rounds into a dome, and its base curls up at the rim and sags and
     * lifts with the billows over it. The fine noise then eats the edges:
     * billows at the top, where a cumulus is heaped, and stretched wisps
     * underneath, where it is ragged and torn. Density rises over a wide
     * ramp from the edge in, so an edge is a fade and not a skin.
     *
     * Where the cover is thin there is no heap to build: the cloud there
     * is a torn, pale wisp, shaped by the smooth noise and eroded by the
     * stretched one. Small dense billows on their own, which is what the
     * cumulus shape makes of a thin cover, read as popcorn.
     */
    float dome(float h) {
      return (0.08 + 0.95 * h * h + 0.35 * (1.0 - smoothstep(0.0, 0.14, h)) + step(h, -0.02)) * 0.55;
    }
    vec2 heap(vec3 q, float y, float base, float thick, float cover, bool fine) {
      vec2 big = texture(uNoise, q).rg;
      float h = (y - base + 0.4 * thick * (big.r - 0.5)) / thick;
      float heaped = smoothstep(0.2, 0.7, cover);
      float shape = mix(big.r, big.g * 0.62 + big.r * 0.38, heaped);
      float body = remap01(shape, 1.0 - cover * 0.9, 1.0) * sqrt(cover);
      float d = body - dome(h);
      if (fine && d > -0.15) {
        vec2 fn = texture(uNoise, q * 3.7 + vec3(0.21, 0.0, 0.53)).rg;
        vec2 wisp = texture(uNoise, q * vec3(9.0, 15.0, 9.0) + vec3(0.37)).rg;
        /* The base sags into rags a few tens of metres deep. */
        h += (fn.r - 0.55) * 0.3 * (1.0 - smoothstep(0.0, 0.35, h));
        d = body - dome(h);
        float up = smoothstep(0.1, 0.5, h) * heaped;
        float e = mix(fn.r * 0.55 + wisp.r * 0.45, fn.g * 0.7 + wisp.g * 0.3, up);
        d -= (1.0 - e) * 0.34 * (1.0 - smoothstep(0.0, 0.3, d));
      }
      return vec2(smoothstep(0.0, 0.45, d) * mix(0.3, 1.0, heaped), clamp(h, 0.0, 1.0));
    }

    /* The low bank, from s2LowCover's cover and lift over p (cv), which
     * change over kilometres, so the taps toward the sun reuse the
     * sample's. */
    vec2 bank(vec3 p, vec2 cv, bool fine) {
      float base = ${LOW_BASE.toFixed(1)} + ${LOW_LIFT.toFixed(1)} * cv.y;
      float thick = ${LOW_THICK.toFixed(1)} * (0.35 + 0.65 * cv.x);
      if (cv.x < 0.02 || p.y < base - 80.0 || p.y > base + thick + 60.0) {
        return vec2(0.0);
      }
      vec3 q = (p + vec3(uDrift, 0.0, -0.6 * uDrift)) / vec3(640.0, 400.0, 640.0);
      vec2 b = heap(q, p.y, base, thick, cv.x, fine);
      return vec2(b.x * ${SIGMA_BANK.toFixed(4)}, b.y);
    }

    /* The stratus under it: the same heaped cloud, lower, thinner and
     * paler, in bands long down the valley and short across it (lay, the
     * layer's own cover, which like the bank's changes slowly). */
    float strataLay(vec2 xz) {
      vec2 sq = (xz + uS2LowAt * 0.7) / vec2(520.0, 1200.0);
      return 0.95 * smoothstep(0.38, 0.85, s2lNoise(sq + 41.0) * 0.7 + s2lNoise(sq * 3.1 + 5.0) * 0.3);
    }
    vec2 strata(vec3 p, vec2 cv, float lay, bool fine) {
      float base = ${SHEET_Y.toFixed(1)} + 90.0 * cv.y;
      float thick = ${SHEET_THICK.toFixed(1)} * (0.5 + 0.8 * lay);
      if (lay < 0.02 || p.y < base - 60.0 || p.y > base + thick + 40.0) {
        return vec2(0.0);
      }
      vec3 q = (p + vec3(0.0, 0.0, uDrift)) / vec3(380.0, 240.0, 700.0) + vec3(0.5, 0.31, 0.17);
      vec2 b = heap(q, p.y, base, thick, lay, fine);
      return vec2(b.x * ${SIGMA_SHEET.toFixed(4)}, b.y);
    }

    /*
     * The mist: on the middle of the walls, in patches, in puffs that lie
     * in the trees and rise a little off them. Not a film over the ground:
     * a layer of even mist a few tens of metres deep, seen along a wall,
     * is a long path through it and paints the wall white, which reads as
     * snow. Only the billows of a noise a few hundred metres across
     * stand, faintly, so the wall shows between them. It keeps off the cliffs, which are too
     * steep for the forest it rises from.
     */
    float mist(vec3 p) {
      if (p.y > 1200.0) {
        return 0.0;
      }
      float g = groundAt(p.xz);
      float above = p.y - g;
      float wall = smoothstep(200.0, 360.0, g) * (1.0 - smoothstep(850.0, 1100.0, g));
      float patches = smoothstep(0.5, 0.78, s2lNoise((p.xz + 0.4 * uS2LowAt) / 380.0 + 21.0));
      float lie = smoothstep(0.0, 10.0, above) * (1.0 - smoothstep(25.0, 95.0, above));
      float here = wall * patches * lie;
      if (here < 0.01) {
        return 0.0;
      }
      vec2 slope = vec2(groundAt(p.xz + vec2(${CELL.toFixed(4)}, 0.0)) - g, groundAt(p.xz + vec2(0.0, ${CELL.toFixed(4)})) - g) / ${CELL.toFixed(4)};
      here *= 1.0 - smoothstep(1.0, 1.5, length(slope));
      vec3 wq = (p + vec3(uDrift, -0.3 * uDrift, 0.0)) / vec3(280.0, 90.0, 280.0);
      vec2 puff = texture(uNoise, wq).rg;
      float w = texture(uNoise, wq * 2.9 + vec3(0.19)).g;
      float body = puff.g * 0.75 + puff.r * 0.25 - (1.0 - w) * 0.18;
      return smoothstep(0.42, 0.85, body * (0.6 + 0.4 * here)) * here * ${SIGMA_MIST.toFixed(4)};
    }

    /* The two lobed phase function at cos angle mu, its forward lobe
     * narrowed by k: light scattered many times inside a cloud forgets
     * the sun's direction, so each later order of scattering is rounder. */
    float phase(float mu, float k) {
      float g1 = 0.72 * k;
      float g2 = -0.22 * k;
      float hg1 = (1.0 - g1 * g1) / (4.0 * PI * pow(1.0 + g1 * g1 - 2.0 * g1 * mu, 1.5));
      float hg2 = (1.0 - g2 * g2) / (4.0 * PI * pow(1.0 + g2 * g2 - 2.0 * g2 * mu, 1.5));
      return mix(hg2, hg1, 0.6);
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
      const int N = ${q.steps};
      float mu = dot(rd, uSunDir);
      /* The sun's light at a sample in three orders of scattering: the
       * first keeps the sun's forward lobe (a cloud's rim against the sun
       * is silver) and is put out quickly by the cloud toward the sun;
       * the later ones are rounder and get through deeper, which is what
       * keeps a shaded flank grey rather than black (Wrenninge's
       * approximation: each order half as strong as the last, its
       * extinction 0.35 of the last's, its forward lobe narrower). */
      float ph0 = phase(mu, 1.0);
      float ph1 = phase(mu, 0.55) * 0.5;
      float ph2 = phase(mu, 0.3) * 0.25;
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
        /* The cover and the stratus's bands cost more than the rest of a
         * step, so they are only worked out at the heights their layers
         * can be at over p. */
        float lift = s2LowLift(p.xz);
        float yb = p.y - ${LOW_BASE.toFixed(1)} - ${LOW_LIFT.toFixed(1)} * lift;
        float ys = p.y - ${SHEET_Y.toFixed(1)} - 90.0 * lift;
        bool inStrata = ys > -60.0 && ys < ${(SHEET_THICK * 1.3 + 40).toFixed(1)};
        vec2 cv = vec2(0.0, lift);
        if (inStrata || (yb > -80.0 && yb < ${(LOW_THICK + 60).toFixed(1)})) {
          cv.x = s2LowCover(p.xz).x;
        }
        float lay = inStrata ? strataLay(p.xz) : 0.0;
        vec2 bk = bank(p, cv, ${q.fine ? 'true' : 'false'});
        vec2 st = strata(p, cv, lay, ${q.fine ? 'true' : 'false'});
        float ms = mist(p);
        float sigma = bk.x + st.x + ms;
        if (sigma < 1e-5) {
          continue;
        }
        /* Toward the sun through the bank and the stratus, taps spread
         * wider as they go (a cone's worth of cloud for the cost of a
         * line). */
        float od = 0.0;
        float s0 = 0.0;
        for (int k = 0; k < ${q.taps}; k++) {
          float s1 = ${q.tap0.toFixed(1)} * pow(${q.tapGrow.toFixed(2)}, float(k));
          vec3 pk = p + uSunDir * (0.5 * (s0 + s1));
          od += (bank(pk, cv, false).x + strata(pk, cv, lay, false).x) * (s1 - s0);
          s0 = s1;
        }
        float sun = sunPastRidges(p);
        /* The sky's light: full at the top of a heap, less under it, where
         * the cloud above hides the sky and what comes up is the valley's
         * green and shade. The mist sits in the forest and sees half the
         * sky. */
        float up = (bk.x * bk.y + st.x * st.y + ms * 0.6) / sigma;
        vec3 amb = uSkyRad * mix(0.3, 1.0, smoothstep(0.0, 0.85, up)) + uSunRad * vec3(0.022, 0.028, 0.018) * (1.0 - up);
        /* Seen with the sun behind, a cloud's creases and thin edges are
         * darker than its heaped body: light enters a thin part and
         * mostly leaves it on the far side (the "powder" term). Toward
         * the sun it is the other way, and the edges are the bright ones. */
        float powder = mix(1.0, 1.0 - exp(-sigma * 120.0), 0.6 * clamp(0.5 - 0.5 * mu, 0.0, 1.0));
        vec3 S = uSunRad * sun * powder * (ph0 * exp(-od) + ph1 * exp(-0.35 * od) + ph2 * exp(-0.12 * od)) + amb;
        float a = 1.0 - exp(-sigma * dt);
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
  constructor(camera, uniforms, march, w, h) {
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
      fragmentShader: MarchShader.fragmentShader(march),
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
      const march = MARCH[q.id];
      if (!march) {
        throw new Error(`swiss2 clouds: no march for the ${q.id} preset; say what it spends in src/maps/swiss2/clouds.js`);
      }
      return new CloudPass(camera, uniforms, march, w, h);
    },
    dispose() {
      noise.dispose();
    },
  };
}
