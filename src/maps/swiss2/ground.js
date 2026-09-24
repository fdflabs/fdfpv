/*
 * ground.js: the photographic valley's ground.
 *
 * One standard material over the alps' own terrain geometry, whose
 * albedo, normal and roughness are blended per pixel from eight
 * photographed layers: meadow, pasture, forest floor, scree, rock with
 * strata, snow, the gravel shore and worn earth. Where each layer lies is
 * decided the way the cel paint decides it, from groundZone in
 * src/maps/alps/terrain.js sampled into two small masks, sharpened per
 * pixel by the slope and the height the fragment actually has, and
 * broken up along each boundary by the layers' own heights, so grass
 * gives way to rock between the stones rather than along a smooth line.
 *
 * It never tiles visibly from the air: each layer is read at two scales,
 * the whole ground is tinted by a noise two hundred metres across, and
 * rock is projected from three sides so a cliff is not a smear.
 *
 * The same material draws the range beyond the field, where there are no
 * masks and forest, rock and snow are laid by height and noise the way
 * farRange colours its vertices.
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
import { FIELD, HALF, LAKE_Y, SIDE_Z, groundZone, groundPaths } from '../alps/terrain.js';
import { LAYERS } from './assets.js';

/* Per layer, in LAYERS order: metres a texture tile covers, a tint on
 * the photograph's own albedo (linear), the roughness, and how hard the
 * normal map bites. The tints bring eight photographs taken in eight
 * places to one valley: the meadow greener, the pasture a drier green,
 * the snow up to the albedo snow has. */
const TILE = [1.9, 2.6, 2.4, 3.6, 30, 4.5, 3.0, 2.6, 60];
const TINT = [
  [0.72, 0.86, 0.62],
  [0.38, 0.52, 0.3],
  [0.4, 0.75, 0.45],
  [1.02, 1.0, 1.0],
  [1.0, 1.0, 1.02],
  [2.15, 2.18, 2.2],
  [1.0, 1.0, 1.0],
  [0.85, 0.85, 0.85],
  [0.72, 0.86, 0.72],
];
const ROUGH = [0.96, 0.95, 0.92, 0.86, 0.82, 0.62, 0.86, 0.92, 0.9];
const BUMP = [0.7, 0.75, 0.85, 1.0, 1.0, 0.5, 1.0, 0.85, 0.9];

/* The zone masks are this many texels a side over the field: 23 m a
 * texel, the cel paint's own block, because nothing groundZone reads is
 * finer than the 30 m heightfield. The fragment sharpens what it can see
 * for itself, the slope and the height. */
const ZONES = 256;
/* The worn earth along the paths, 2.9 m a texel, stroked wider than the
 * path so the ribbon lies on trodden ground. */
const PATH_PX = 2048;
const PATH_WIDTH_M = 5;

function dataTexture(data, size, format) {
  const t = new THREE.DataTexture(data, size, size, format, THREE.UnsignedByteType);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

/*
 * The two zone masks, row j at z = -HALF + (j + 0.5) * cell so the
 * texture's v runs with z:
 *   zone1 = forest, bloom, scree, shore
 *   zone2 = hay, plateau, snow, rock
 */
export function groundMasks(field) {
  const step = FIELD / ZONES;
  const z1 = new Uint8Array(ZONES * ZONES * 4);
  const z2 = new Uint8Array(ZONES * ZONES * 4);
  const zone = {};
  const b = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  for (let j = 0; j < ZONES; j += 1) {
    const z = -HALF + (j + 0.5) * step;
    for (let i = 0; i < ZONES; i += 1) {
      const x = -HALF + (i + 0.5) * step;
      groundZone(field, x, z, step, zone);
      const k = (j * ZONES + i) * 4;
      z1[k] = b(zone.forest);
      z1[k + 1] = b(zone.bloom);
      z1[k + 2] = b(zone.scree);
      z1[k + 3] = b(zone.shore);
      z2[k] = b(zone.hay);
      z2[k + 1] = b(zone.flat);
      z2[k + 2] = b(zone.snow);
      z2[k + 3] = b(zone.rock);
    }
  }
  return { zone1: dataTexture(z1, ZONES, THREE.RGBAFormat), zone2: dataTexture(z2, ZONES, THREE.RGBAFormat) };
}

/*
 * Put the forest floor where the trees actually stand. The zone mask's
 * forest is forestDensity, which the vegetation plants from but thins and
 * steepens in its own way, so on a slope it leaves bare, the floor
 * painted from the density showed as dark blots with no tree on them.
 * Counted off the planted trunks instead, a texel as full as the closest
 * stands are counts as closed forest, and the count is blurred over its
 * neighbours so the floor runs a little past the last trunk as a real
 * forest's shade and needles do.
 */
export function floorUnderTrees(zones, forest) {
  const step = FIELD / ZONES;
  const count = new Float32Array(ZONES * ZONES);
  for (let t = 0; t < forest.count; t += 1) {
    const i = Math.floor((forest.x[t] + HALF) / step);
    const j = Math.floor((forest.z[t] + HALF) / step);
    if (i >= 0 && j >= 0 && i < ZONES && j < ZONES) {
      count[j * ZONES + i] += 1;
    }
  }
  let full = 1;
  for (let k = 0; k < count.length; k += 1) {
    full = Math.max(full, count[k]);
  }
  const data = zones.zone1.image.data;
  for (let j = 0; j < ZONES; j += 1) {
    for (let i = 0; i < ZONES; i += 1) {
      let sum = 0;
      for (let dj = -1; dj <= 1; dj += 1) {
        for (let di = -1; di <= 1; di += 1) {
          const a = Math.max(0, Math.min(ZONES - 1, i + di));
          const b = Math.max(0, Math.min(ZONES - 1, j + dj));
          sum += count[b * ZONES + a] * (di === 0 && dj === 0 ? 4 : 1);
        }
      }
      data[(j * ZONES + i) * 4] = Math.round(255 * Math.min(1, sum / 12 / (0.45 * full)));
    }
  }
  zones.zone1.needsUpdate = true;
}

/* The trodden earth either side of the hiking paths, as a single channel
 * mask the ground reads for its path layer. */
export function pathMask() {
  const c = document.createElement('canvas');
  c.width = PATH_PX;
  c.height = PATH_PX;
  const g = c.getContext('2d', { willReadFrequently: true });
  const px = FIELD / PATH_PX;
  g.fillStyle = '#000';
  g.fillRect(0, 0, PATH_PX, PATH_PX);
  g.filter = 'blur(1.5px)';
  g.strokeStyle = '#fff';
  g.lineWidth = PATH_WIDTH_M / px;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  for (const path of groundPaths()) {
    g.beginPath();
    path.forEach((p, k) => {
      const u = (p.x + HALF) / px;
      const v = (p.z + HALF) / px;
      if (k === 0) {
        g.moveTo(u, v);
      } else {
        g.lineTo(u, v);
      }
    });
    g.stroke();
  }
  const rgba = g.getImageData(0, 0, PATH_PX, PATH_PX).data;
  const r = new Uint8Array(PATH_PX * PATH_PX);
  for (let k = 0; k < r.length; k += 1) {
    r[k] = rgba[k * 4];
  }
  return dataTexture(r, PATH_PX, THREE.RedFormat);
}

/*
 * The valley floor's farming, shared with the meadow's blades (grass.js)
 * so the grass drawn near the camera is the colour and the height of the
 * field it stands in. s2Meadow(xz, dist) gives a multiplier for the
 * grass's colour, how freshly mown the field is (0 to 1), and how much of
 * a field boundary the point is on.
 *
 * What a Swiss floor is from the air: long parcels across the valley,
 * split into strips each farmed on its own day. Hay meadows uncut
 * (deep, blue green, flowering), cut this week (yellow, the windrows of
 * drying hay in lines along the strip), grown back (a fresh even green);
 * pastures darker, blotched where the cattle have grazed and not, with
 * their trodden paths; the odd dry, burnt strip. Hedges and lines of
 * scrub on some boundaries, a darker seam on the rest. The ground by the
 * stream stays damp, darker and lusher, and is not mown. Over all of it
 * a drift of hue a kilometre across, so no two ends of the valley are
 * the same green. Every line finer than a pixel fades with distance
 * rather than shimmering.
 */
export const MEADOW_GLSL = /* glsl */ `
  float s2Hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float s2Noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(s2Hash(i), s2Hash(i + vec2(1.0, 0.0)), u.x),
               mix(s2Hash(i + vec2(0.0, 1.0)), s2Hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float s2Fbm(vec2 p) {
    return s2Noise(p) * 0.55 + s2Noise(p * 2.07 + 17.1) * 0.3 + s2Noise(p * 4.13 + 3.7) * 0.15;
  }
  /* src/maps/alps/terrain.js streamX, for the damp ground along it. */
  float s2StreamX(float z) {
    float axis = 180.0 * sin(z / 1500.0) + 60.0 * sin(z / 430.0 + 1.2);
    float t = (z - ${SIDE_Z.toFixed(1)}) / 3350.0;
    float side = t < 0.25 ? 1.0 - t / 0.25 : 0.0;
    return axis - 95.0 - 30.0 * sin(z / 260.0) + side * side * 700.0;
  }

  struct S2Meadow { vec3 tint; float mown; float edge; };

  S2Meadow s2Meadow(vec2 xz, float dist) {
    /* A pixel's width on the ground, near enough, for fading lines. */
    float px = max(dist * 0.0011, 0.02);
    /* Boundaries follow old walls and ditches, never a ruler: the
     * parcel grid is warped a few metres by the noise. */
    vec2 fq = mat2(0.97, -0.24, 0.24, 0.97) * xz;
    fq.y += 28.0 * sin(fq.x / 260.0) + 12.0 * sin(fq.x / 97.0 + 1.3);
    fq += 9.0 * vec2(s2Noise(xz / 70.0 + 2.0), s2Noise(xz / 63.0 + 9.0)) - 4.5;
    float band = floor(fq.y / 150.0);
    float inBand = fract(fq.y / 150.0);
    /* Some parcels are split along their depth as well. */
    float cutAt = 0.3 + 0.4 * s2Hash(vec2(band, 9.2));
    float split = step(0.55, s2Hash(vec2(band, 5.7)));
    float half2 = split * step(cutAt, inBand);
    float across = split > 0.5 ? (half2 > 0.5 ? (inBand - cutAt) / (1.0 - cutAt) : inBand / cutAt) : inBand;
    float depth = 150.0 * (split > 0.5 ? (half2 > 0.5 ? 1.0 - cutAt : cutAt) : 1.0);
    vec2 bid = vec2(band, half2);
    float pw = 22.0 + 60.0 * s2Hash(bid + 7.1);
    float along = (fq.x + s2Hash(bid + 3.3) * pw) / pw;
    vec2 fid = vec2(floor(along), band * 2.0 + half2);
    float eAlong = (0.5 - abs(fract(along) - 0.5)) * pw;
    float eAcross = (0.5 - abs(across - 0.5)) * depth;
    float edge = min(eAlong, eAcross);

    /* The plateau the strip and the village stand on (terrain.js holds
     * it flat) is village greens and the strip's own grass: kept short
     * and even, with no hedges and only a faint seam. */
    float plateau = (1.0 - smoothstep(140.0, 340.0, abs(xz.y))) * (1.0 - smoothstep(150.0, 320.0, abs(xz.x + 60.0)));
    float kind = s2Hash(fid + 4.4);
    float lum = 0.94 + 0.12 * s2Hash(fid + 8.8);
    vec3 tint;
    float mown = 0.0;
    float rowsDir = step(0.5, s2Hash(fid + 2.2));
    /* Rows along the strip, or across it on some. */
    float rowCoord = rowsDir > 0.5 ? fq.x : fq.y;
    float rowFade = 1.0 - smoothstep(0.35, 0.9, px / 1.2);
    if (kind < 0.28) {
      /* Uncut hay: deep, bluish, flowering. */
      float bloom = s2Fbm(xz / 6.0 + fid);
      tint = mix(vec3(0.8, 0.9, 0.76), vec3(0.98, 0.98, 0.86), 0.35 * bloom);
    } else if (kind < 0.5) {
      /* Grown back after a cut: an even fresh green. */
      tint = vec3(1.0, 1.04, 0.86);
      mown = 0.55;
    } else if (kind < 0.7) {
      /* Cut this week: the stubble yellow, and the hay lying to dry in
       * windrows. */
      float row = 1.0 - smoothstep(0.08, 0.2, abs(fract(rowCoord / 5.5) - 0.5));
      tint = mix(vec3(1.2, 1.12, 0.72), vec3(1.42, 1.22, 0.6), row * rowFade);
      mown = 1.0;
    } else if (kind < 0.93) {
      /* Pasture: grazed short in patches, the rejected tufts darker,
       * and the cattle's paths worn pale. */
      float graze = s2Fbm(xz / 11.0 + fid * 3.1);
      tint = mix(vec3(0.7, 0.8, 0.64), vec3(0.95, 1.0, 0.8), smoothstep(0.3, 0.7, graze));
      vec2 w = xz + 14.0 * vec2(s2Noise(xz / 37.0), s2Noise(xz / 41.0 + 5.0));
      float trod = 1.0 - smoothstep(0.35, 0.9, abs(fract(dot(w, vec2(0.6, 0.8)) / 23.0) - 0.5) * 23.0);
      tint = mix(tint, vec3(1.08, 1.0, 0.8), 0.25 * trod * (1.0 - smoothstep(0.3, 0.8, px)));
      mown = 0.7 * smoothstep(0.35, 0.65, graze);
    } else {
      /* A dry strip, burnt by a hot week on thin soil. */
      tint = vec3(1.28, 1.12, 0.7);
      mown = 0.8;
    }
    tint *= lum;

    /* Damp ground along the stream: lusher, darker, left uncut. */
    float sd = abs(xz.x - s2StreamX(xz.y)) + 25.0 * (s2Noise(xz / 45.0) - 0.5);
    float damp = 1.0 - smoothstep(18.0, 75.0, sd);
    tint = mix(tint, vec3(0.72, 0.86, 0.74), 0.75 * damp);
    mown *= 1.0 - damp;

    /* Hedges on some parcel ends and strip sides, broken by gaps, and a
     * darker seam on every other boundary. A line narrower than a pixel
     * is drawn a pixel wide at the contrast it would average to. */
    float hedgeW = 3.5 + 2.5 * s2Noise(xz / 9.0);
    float hedgeOn = step(0.5, s2Hash(vec2(band, half2 + 11.0))) * step(eAcross, eAlong)
      + step(0.78, s2Hash(fid + 13.0)) * step(eAlong, eAcross);
    hedgeOn *= step(0.3, s2Noise(xz / 23.0));
    hedgeOn *= 1.0 - plateau;
    float wide = max(hedgeW, px * 1.5);
    float hedge = hedgeOn * (1.0 - smoothstep(wide * 0.6, wide, edge)) * (hedgeW / wide);
    float seam = (1.0 - smoothstep(0.3, max(1.6, px * 1.5), edge)) * min(1.0, 1.6 / max(1.6, px * 1.5));
    tint *= 1.0 - 0.12 * seam * (1.0 - 0.7 * plateau);
    tint = mix(tint, vec3(0.5, 0.6, 0.42), 0.85 * clamp(hedge, 0.0, 1.0));

    tint = mix(tint, vec3(1.0, 1.03, 0.88), 0.6 * plateau);

    /* The drift of hue across the valley. */
    float drift = s2Fbm(xz / 900.0 + 31.0);
    tint *= mix(vec3(0.97, 1.0, 0.9), vec3(1.09, 1.02, 0.82), drift);

    S2Meadow m;
    m.tint = tint;
    m.mown = mown;
    m.edge = clamp(hedge + seam, 0.0, 1.0);
    return m;
  }
`;

const GROUND_PARS = /* glsl */ `
  uniform sampler2D uS2Zone1;
  uniform sampler2D uS2Zone2;
  uniform sampler2D uS2Path;
  uniform highp sampler2DArray uS2Col;
  uniform highp sampler2DArray uS2Nrh;
  uniform float uS2Tile[9];
  uniform vec3 uS2Tint[9];
  uniform float uS2Rough[9];
  uniform float uS2Bump[9];
  uniform float uS2LakeY;
  uniform float uS2Strip;
  uniform float uS2Only;
  varying vec3 vS2WNormal;

  ${MEADOW_GLSL}
  /* Value noise with its gradient, for relief the thirty metre grid
   * cannot hold. */
  vec3 s2NoiseD(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    vec2 du = 6.0 * f * (1.0 - f);
    float a = s2Hash(i);
    float b = s2Hash(i + vec2(1.0, 0.0));
    float c = s2Hash(i + vec2(0.0, 1.0));
    float d = s2Hash(i + vec2(1.0, 1.0));
    float k = a - b - c + d;
    return vec3(a + (b - a) * u.x + (c - a) * u.y + k * u.x * u.y, du * (vec2(b - a, c - a) + k * u.yx));
  }
  /*
   * The slope of a relief laid over the mesh, in metres per metre: gullies
   * and ribs a hundred metres to ten across, the kind a real wall is made
   * of and a thirty metre grid smooths away. Deep on steep ground, faint
   * on the floor. Octaves too fine for the distance are dropped, so the
   * far walls do not shimmer.
   */
  vec2 s2Relief(vec2 p, float amp, float dist) {
    vec2 g = vec2(0.0);
    float a = amp;
    float fq = 1.0 / 110.0;
    for (int o = 0; o < 4; o++) {
      /* A pixel is about dist / 1070 metres across at the default lens;
       * an octave goes before its wavelength is eight pixels. */
      float keep = 1.0 - smoothstep(0.12, 0.25, dist * 0.00093 * fq);
      vec3 nd = s2NoiseD(p * fq + float(o) * 17.3);
      g += nd.yz * a * fq * keep;
      a *= 0.48;
      fq *= 2.13;
    }
    return g;
  }
  /* Rows were uploaded top first, so the map's green, which points up
   * the photograph, points down its v. */
  vec3 s2Tangent(vec4 t, float bump) {
    vec2 xy = (t.rg * 2.0 - 1.0) * bump;
    xy.y = -xy.y;
    return vec3(xy, sqrt(max(0.0, 1.0 - dot(xy, xy))));
  }

  struct S2Ground { vec3 albedo; vec3 normal; float rough; float ao; };

  S2Ground s2Ground(vec3 p, vec3 n) {
    vec2 fuv = (p.xz + uS2Field.x) / uS2Field.y;
    float inside = step(0.0, fuv.x) * step(fuv.x, 1.0) * step(0.0, fuv.y) * step(fuv.y, 1.0);
    vec4 z1 = texture2D(uS2Zone1, fuv) * inside;
    vec4 z2 = texture2D(uS2Zone2, fuv) * inside;
    float path = texture2D(uS2Path, fuv).r * inside;
    float dist = length(p - cameraPosition);
    float macro = s2Fbm(p.xz / 190.0);
    float meso = s2Fbm(p.xz / 41.0);
    float fine = s2Noise(p.xz / 7.0);
    /* The relief first, so the rock finds the ribs it makes. */
    float steep0 = smoothstep(0.2, 0.9, sqrt(max(0.0, 1.0 - n.y * n.y)) / max(n.y, 0.05));
    vec2 rg = s2Relief(p.xz, mix(1.5, 24.0, steep0) * (1.0 - z2.g), dist);
    /* Half the relief decides where rock shows, all of it how the light
     * falls: ribs in shadow and gullies lit, without the whole wall
     * turning to bare rock. */
    vec3 nCov = normalize(vec3(n.x - 0.5 * rg.x, n.y, n.z - 0.5 * rg.y));
    n = normalize(vec3(n.x - rg.x, n.y, n.z - rg.y));
    float tanS = sqrt(max(0.0, 1.0 - nCov.y * nCov.y)) / max(nCov.y, 0.05);

    /* Coverage per layer, from nought to one, before the heights break
     * its edges. Outside the field there are no masks, and the range is
     * laid by height as farRange lays its colours. */
    float cov[9];
    cov[0] = 1.0;
    cov[1] = clamp(smoothstep(80.0, 520.0, p.y + 150.0 * (macro - 0.5)) + z1.g * 0.3, 0.0, 1.0);
    float forestOut = (1.0 - inside) * smoothstep(0.42, 0.56, macro) * smoothstep(60.0, 140.0, p.y) * (1.0 - smoothstep(520.0, 800.0, p.y + 160.0 * meso));
    /* Under the planted trees (floorUnderTrees fills the mask after the
     * vegetation is built); before that it is forestDensity. */
    cov[2] = clamp(smoothstep(0.15, 0.6, z1.r) + forestOut, 0.0, 1.0);
    cov[3] = z1.b;
    /* Bare rock on the faces too steep to hold soil; above the trees the
     * broken alpine ground of rock and turf the aerial photograph is. */
    cov[4] = smoothstep(0.78 + 0.3 * fine, 1.1 + 0.25 * fine, tanS);
    float rockHigh = inside > 0.5 ? z2.a : smoothstep(650.0, 950.0, p.y + 200.0 * macro);
    cov[8] = rockHigh;
    float snowHigh = inside > 0.5 ? z2.b : smoothstep(1350.0, 1800.0, p.y + 260.0 * macro);
    cov[5] = smoothstep(0.3, 0.7, (snowHigh - 0.5) * 1.7 + 0.5 + (meso - 0.5) * 0.5 + (fine - 0.5) * 0.3) * (1.0 - smoothstep(1.0, 1.55, tanS));
    cov[6] = z1.a;
    cov[7] = path * 0.9;
    /* A boulder, a snow patch: one layer and nothing else. */
    if (uS2Only >= 0.0) {
      for (int k = 1; k < 9; k++) {
        cov[k] = float(k) == uS2Only ? 1.0 : 0.0;
      }
    }

    /* Every derivative taken here, where every pixel of the quad runs:
     * inside the loop the branches differ from pixel to pixel and a
     * derivative there is undefined. */
    vec3 dpx = dFdx(p);
    vec3 dpy = dFdy(p);
    vec2 duvx = dpx.xz;
    vec2 duvy = dpy.xz;
    vec3 bw = pow(abs(n), vec3(4.0));
    bw /= (bw.x + bw.y + bw.z);

    vec3 albedo = vec3(0.0);
    vec3 tnormal = vec3(0.0);
    vec3 rockNormal = vec3(0.0);
    float rockW = 0.0;
    float rough = 0.0;
    float hsum = 0.0;
    float remaining = 1.0;
    float fade = 1.0 - 0.65 * smoothstep(60.0, 700.0, dist);

    /* Top layer first: what lies on top is laid first and takes its share,
     * and the layers under it get what is left. Worn earth and the shore
     * over everything, snow over rock, rock over the alpine turf, and the
     * meadow under all of it. */
    const int S2_ORDER[9] = int[9](7, 6, 5, 4, 8, 3, 2, 1, 0);
    for (int i = 0; i < 9; i++) {
      int k = S2_ORDER[i];
      float c = cov[k];
      if (c < 0.004 || remaining < 0.004) {
        continue;
      }
      float s = 1.0 / uS2Tile[k];
      vec3 col;
      vec4 nh;
      float lk = float(k);
      if (k == 4) {
        /* Rock from three sides, so a cliff reads as a cliff. */
        vec2 ux = p.zy * s;
        vec2 uy = p.xz * s;
        vec2 uz = p.xy * s;
        vec4 nx = textureGrad(uS2Nrh, vec3(ux, lk), dpx.zy * s, dpy.zy * s);
        vec4 ny = textureGrad(uS2Nrh, vec3(uy, lk), duvx * s, duvy * s);
        vec4 nz = textureGrad(uS2Nrh, vec3(uz, lk), dpx.xy * s, dpy.xy * s);
        col = textureGrad(uS2Col, vec3(ux, lk), dpx.zy * s, dpy.zy * s).rgb * bw.x
            + textureGrad(uS2Col, vec3(uy, lk), duvx * s, duvy * s).rgb * bw.y
            + textureGrad(uS2Col, vec3(uz, lk), dpx.xy * s, dpy.xy * s).rgb * bw.z;
        nh = nx * bw.x + ny * bw.y + nz * bw.z;
        /* The face the cliff mostly shows, read again at a quarter of the
         * scale and blended in, so a kilometre of wall is not a thousand
         * copies of one tile. */
        bool side = bw.y < max(bw.x, bw.z);
        vec2 up2 = side ? (bw.x > bw.z ? p.zy : p.xy) : p.xz;
        vec2 ugx = side ? (bw.x > bw.z ? dpx.zy : dpx.xy) : dpx.xz;
        vec2 ugy = side ? (bw.x > bw.z ? dpy.zy : dpy.xy) : dpy.xz;
        float s2 = s * 0.23;
        col = mix(col, textureGrad(uS2Col, vec3(up2 * s2 + vec2(0.31, 0.57), lk), ugx * s2, ugy * s2).rgb, 0.45);
        /* Whiteout blend per projection, after Golus. */
        vec3 tx = s2Tangent(nx, uS2Bump[k] * fade);
        vec3 ty = s2Tangent(ny, uS2Bump[k] * fade);
        vec3 tz = s2Tangent(nz, uS2Bump[k] * fade);
        vec3 wx = vec3(tx.xy + n.zy, abs(tx.z) * n.x).zyx;
        vec3 wy = vec3(ty.xy + n.xz, abs(ty.z) * n.y).xzy;
        vec3 wz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
        vec3 rn = normalize(wx * bw.x + wy * bw.y + wz * bw.z);
        /* Strata: a darker band in every three, thirty metres tall,
         * warped by the noise so they never read as contour lines. */
        float band = fract((p.y + 22.0 * meso + 9.0 * fine) / 31.0);
        col *= 1.0 - 0.16 * smoothstep(0.0, 0.05, band) * (1.0 - smoothstep(0.24, 0.32, band));
        col *= (0.8 + 0.4 * macro) * mix(vec3(1.0), vec3(0.8, 0.76, 0.7), smoothstep(0.4, 0.8, meso));
        /* Water streaks down the face: long dark stains, narrow across
         * and tall, where the runoff has darkened the limestone. */
        vec2 fall = normalize(n.xz + vec2(1e-4, 0.0));
        float streak = s2Fbm(vec2(dot(p.xz, vec2(-fall.y, fall.x)) / 9.0, p.y / 140.0));
        col *= 1.0 - 0.3 * smoothstep(0.52, 0.78, streak) * smoothstep(0.6, 1.2, tanS);
        float h = nh.b;
        float cc = clamp(c + (h - 0.5) * 3.2 * c * (1.0 - c), 0.0, 1.0);
        float w = cc * remaining;
        remaining -= w;
        albedo += col * uS2Tint[k] * w;
        rockNormal += rn * w;
        rockW += w;
        rough += uS2Rough[k] * w;
        hsum += h * w;
        continue;
      }
      vec2 uv = p.xz * s;
      nh = textureGrad(uS2Nrh, vec3(uv, lk), duvx * s, duvy * s);
      float h = nh.b;
      float cc = k == 0 ? 1.0 : clamp(c + (h - 0.5) * 3.2 * c * (1.0 - c), 0.0, 1.0);
      /* The pasture shades into the meadow over tens of metres; the rest
       * meet at an edge the heights break up. */
      cc = k == 0 ? 1.0 : k == 1 ? cc : smoothstep(0.18, 0.82, cc);
      float w = cc * remaining;
      if (w < 0.004) {
        continue;
      }
      remaining -= w;
      col = textureGrad(uS2Col, vec3(uv, lk), duvx * s, duvy * s).rgb;
      /* A second read at a third of the scale, turned, so the tile's
       * pattern does not repeat from the air. */
      vec2 uv2 = mat2(0.8, -0.6, 0.6, 0.8) * p.xz * (s * 0.29) + vec2(0.37, 0.71);
      vec3 col2 = textureGrad(uS2Col, vec3(uv2, lk), mat2(0.8, -0.6, 0.6, 0.8) * duvx * (s * 0.29), mat2(0.8, -0.6, 0.6, 0.8) * duvy * (s * 0.29)).rgb;
      col = mix(col, col2, 0.28);
      albedo += col * uS2Tint[k] * w;
      tnormal += s2Tangent(nh, uS2Bump[k] * fade) * w;
      rough += uS2Rough[k] * w;
      hsum += h * w;
    }

    /* The meadow's life: hayfields a yellower green, a hue that wanders
     * across the valley, and the mown fields on the village plateau and
     * the strip striped the way a mower leaves them. */
    float grass = clamp(1.0 - cov[2] - cov[3] - cov[4] - cov[5] - cov[6] - cov[8], 0.0, 1.0);
    vec3 hue = mix(vec3(0.92, 1.04, 0.86), vec3(1.1, 1.0, 0.78), meso);
    hue = mix(hue, vec3(1.16, 1.04, 0.72), z2.r * (1.0 - smoothstep(60.0, 300.0, p.y)) * 0.8);
    albedo *= mix(vec3(1.0), hue, grass);
    /* The farmed floor (MEADOW_GLSL), and on mown ground the rows the
     * mower left, lighter looking down them and darker looking against
     * the lie of the grass, so a field changes as the camera turns. */
    float farm = grass * (1.0 - smoothstep(50.0, 140.0, p.y)) * (1.0 - smoothstep(0.12, 0.3, tanS)) * (1.0 - cov[1]);
    S2Meadow meadow = s2Meadow(p.xz, dist);
    vec2 fq = mat2(0.97, -0.24, 0.24, 0.97) * p.xz;
    float rows = step(0.5, fract(fq.y / 3.6)) * 2.0 - 1.0;
    vec2 look = normalize(p.xz - cameraPosition.xz + vec2(1e-3, 0.0));
    float lie = rows * dot(look, vec2(0.97, -0.24));
    float sheen = 1.0 + 0.035 * lie * max(smoothstep(0.8, 1.0, meadow.mown), uS2Strip) * (1.0 - smoothstep(120.0, 450.0, dist));
    albedo *= mix(vec3(1.0), meadow.tint * sheen, farm);
    albedo *= mix(1.0, sheen, uS2Strip * grass);
    /* Close to, a meadow is never one green: clover and trodden patches
     * a few metres across, some darker and bluer, some yellower. */
    /* And the gaps between the blades are dark: the photograph's own
     * height, read as how deep in the sward a texel is. */
    albedo *= mix(1.0, 0.55 + 0.6 * clamp(hsum, 0.0, 1.0), grass * 0.7 * (1.0 - smoothstep(25.0, 140.0, dist)));
    float blotch = s2Fbm(p.xz / 5.5 + 3.7);
    albedo *= mix(vec3(1.0), mix(vec3(0.84, 0.9, 0.86), vec3(1.12, 1.07, 0.86), blotch), grass * (1.0 - smoothstep(60.0, 350.0, dist)));
    albedo *= 0.8 + 0.4 * macro;

    /* The wet line along the shore and the bed going dark under water. */
    float wet = 1.0 - smoothstep(uS2LakeY + 0.2, uS2LakeY + 1.1, p.y);
    albedo *= 1.0 - 0.35 * wet;
    rough = mix(rough, 0.35, wet * 0.8);
    albedo *= 1.0 - 0.6 * smoothstep(uS2LakeY - 1.0, uS2LakeY - 9.0, p.y);

    vec3 tn = normalize(tnormal + vec3(0.0, 0.0, 1e-4));
    vec3 planar = normalize(vec3(tn.x + n.x, abs(tn.z) * n.y, tn.y + n.z));
    vec3 outN = rockW > 0.001 ? normalize(mix(planar, normalize(rockNormal), rockW)) : planar;

    S2Ground g;
    g.albedo = albedo;
    g.normal = outN;
    g.rough = rough;
    g.ao = mix(1.0, 0.5 + 0.5 * clamp(hsum * 1.3, 0.0, 1.0), 0.65);
    return g;
  }
`;

/*
 * The ground material. `only` draws a single layer, by its index in
 * LAYERS, wherever the material is (a boulder is rock, a drift is snow);
 * `strip` stripes the mown grass everywhere. `lit` is light.js's
 * injector: the ground is lit the same way everything else in swiss2 is,
 * and its declarations land ahead of the splat's, so vS2World is declared
 * by the time the splat reads it.
 */
export function groundMaterial({ arrays, zones, path, lit, only = -1, strip = 0 }) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  const uniforms = {
    uS2Zone1: { value: zones.zone1 },
    uS2Zone2: { value: zones.zone2 },
    uS2Path: { value: path },
    uS2Col: { value: arrays.col },
    uS2Nrh: { value: arrays.nrh },
    uS2Tile: { value: TILE },
    uS2Tint: { value: TINT.map((t) => new THREE.Vector3(...t)) },
    uS2Rough: { value: ROUGH },
    uS2Bump: { value: BUMP },
    uS2LakeY: { value: LAKE_Y },
    uS2Strip: { value: strip },
    uS2Only: { value: only },
  };
  if (LAYERS.length !== TILE.length) {
    throw new Error('swiss2 ground: one tile size per layer');
  }
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    const need = (src, what) => {
      if (!src.includes(what)) {
        throw new Error(`swiss2 ground: three's shader has no ${what}; the splat would not be drawn`);
      }
    };
    need(shader.vertexShader, '#include <beginnormal_vertex>');
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vS2WNormal;')
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        #ifdef USE_INSTANCING
          vS2WNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
        #else
          vS2WNormal = normalize(mat3(modelMatrix) * objectNormal);
        #endif`);
    for (const chunk of ['#include <map_fragment>', '#include <roughnessmap_fragment>', '#include <normal_fragment_maps>', '#include <aomap_fragment>']) {
      need(shader.fragmentShader, chunk);
    }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GROUND_PARS}`)
      .replace('#include <map_fragment>', 'S2Ground s2g = s2Ground(vS2World, normalize(vS2WNormal));\ndiffuseColor.rgb *= s2g.albedo;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * s2g.rough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(s2g.normal, 0.0)).xyz);')
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= s2g.ao;\nreflectedLight.indirectSpecular *= s2g.ao;');
  };
  mat.customProgramCacheKey = () => 's2-ground';
  lit(mat);
  mat.userData.s2Ground = uniforms;
  return mat;
}
