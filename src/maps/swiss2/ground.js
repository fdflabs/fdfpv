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
import {
  FIELD, HALF, LAKE_Y, LAKE_N, SIDE_Z, TREE_LINE, groundZone, groundPaths,
} from '../alps/terrain.js';
import { LAYERS, SUN_U } from './assets.js';

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
/* The sun's bearing on the ground, for the faces snow lingers on (the
 * photograph's sun, as light.js takes it). */
const SUN_XZ = [Math.cos((SUN_U - 0.5) * 2 * Math.PI), Math.sin((SUN_U - 0.5) * 2 * Math.PI)];
/* The heights of the walls' two cliff bands, in metres (the walls rise
 * to about 1400, the trees stop about 700). */
const CLIFF_LOW = 420;
const CLIFF_HIGH = 1010;
/* How much of the sun's light a meadow looked at straight into the sun
 * loses to the blades' own shade. */
const BACKLIT = 0.5;
/* How much of a meadow's sheen its blades hide seen at a grazing angle. */
const GRAZE_MASK = 0.8;
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
 * The ground at the foot of the village's walls. A house does not stand
 * on a lawn: the eaves drip a strip of gravel or bare earth along every
 * wall, and the grass for a few metres out is darker and ranker for the
 * water and the shade. The walls are only known once the village is up,
 * so the ground reads them through a shared uniform that starts as a
 * texture saying "no wall anywhere" and is filled in by wallMask. The
 * mask is a metre a texel over the WALL_SPAN metres square centred on
 * the village plateau (the farms further out keep their lawn), and holds
 * the distance to the nearest wall over WALL_REACH metres.
 */
export const WALL_SPAN = 1024;
export const WALL_REACH = 4;
export const WALL_ORIGIN = new THREE.Vector2(-647, -497);
const WALL_MIN_AREA = 16;

export function wallUniform() {
  const t = new THREE.DataTexture(new Uint8Array([255]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType);
  t.needsUpdate = true;
  return { value: t };
}

export function wallMask(footprints) {
  const n = WALL_SPAN;
  const d = new Uint8Array(n * n).fill(255);
  for (const f of footprints) {
    /* A parked car or a bench is a wall to the colliders, not a house. */
    if ((f.maxX - f.minX) * (f.maxZ - f.minZ) < WALL_MIN_AREA) {
      continue;
    }
    const i0 = Math.max(0, Math.floor(f.minX - WALL_ORIGIN.x - WALL_REACH));
    const i1 = Math.min(n - 1, Math.ceil(f.maxX - WALL_ORIGIN.x + WALL_REACH));
    const j0 = Math.max(0, Math.floor(f.minZ - WALL_ORIGIN.y - WALL_REACH));
    const j1 = Math.min(n - 1, Math.ceil(f.maxZ - WALL_ORIGIN.y + WALL_REACH));
    for (let j = j0; j <= j1; j += 1) {
      const z = WALL_ORIGIN.y + j + 0.5;
      const dz = Math.max(f.minZ - z, 0, z - f.maxZ);
      for (let i = i0; i <= i1; i += 1) {
        const x = WALL_ORIGIN.x + i + 0.5;
        const dx = Math.max(f.minX - x, 0, x - f.maxX);
        const v = Math.min(255, Math.round((Math.hypot(dx, dz) / WALL_REACH) * 255));
        if (v < d[j * n + i]) {
          d[j * n + i] = v;
        }
      }
    }
  }
  const t = new THREE.DataTexture(d, n, n, THREE.RedFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

/*
 * The valley floor's farming, shared with the meadow's blades (grass.js)
 * so the grass drawn near the camera is the colour and the height of the
 * field it stands in. s2Meadow(xz, dist) gives a multiplier for the
 * grass's colour, how freshly mown the field is (0 to 1), and how much of
 * a field boundary the point is on.
 *
 * What a Swiss floor is from the air: long strips across the valley,
 * split into fields each farmed on its own day. Hay meadows uncut
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

  /*
   * The parcels. A Swiss floor is divided by inheritance, not surveyed:
   * long strips running across the valley from the stream, each a
   * different width, their sides bending with the ground, cut along
   * their length here and there into fields a farmer mows on his own
   * day. So the floor is laid in a frame that bends with the stream (u
   * across the valley from its bank, v down it), warped again by the
   * noise so no side is straight for long. Down the valley the strips
   * are cut at irregular places, some cuts left out so neighbouring
   * strips are farmed as one; each strip is cut into fields at its own
   * irregular places, on a slant of its own. Returns the field's id, the
   * id across the nearest boundary, the distance to it in metres, the
   * point in the strip's frame, which the mown rows run along, the
   * strip's slant, and the way to the nearest boundary on the ground
   * (near enough: the bend of the stream is left out).
   */
  struct S2Parcel { vec2 own; vec2 other; float edge; vec2 q; float slant; vec2 toEdge; };
  /* Where the kth cut falls along a line of cells w metres apart, or
   * a very long way off when that cut is left out. */
  float s2Cut(float k, float w, float seed) {
    return s2Hash(vec2(k, seed)) < 0.3 ? 1e7 : (k + 0.8 * (s2Hash(vec2(k, seed + 1.3)) - 0.5)) * w;
  }
  /* The cuts either side of x on that line: (below, above, index below). */
  vec3 s2Cuts(float x, float w, float seed) {
    float k0 = floor(x / w);
    float lo = -1e7;
    float hi = 1e7;
    float klo = k0 - 4.0;
    for (int i = -3; i <= 4; i++) {
      float k = k0 + float(i);
      float c = s2Cut(k, w, seed);
      if (c > 1e6) {
        continue;
      }
      if (c <= x && c > lo) {
        lo = c;
        klo = k;
      }
      if (c > x && c < hi) {
        hi = c;
      }
    }
    return vec3(lo, hi, klo);
  }
  S2Parcel s2Parcel(vec2 xz) {
    vec2 q = vec2(xz.x - s2StreamX(xz.y), xz.y);
    q.y += 60.0 * (s2Noise(xz / 700.0 + 4.0) - 0.5) + 14.0 * (s2Noise(xz / 140.0 + 9.0) - 0.5);
    q.x += 40.0 * (s2Noise(xz / 520.0 + 7.0) - 0.5);
    /* The strips, 42 m apart on average before the merges. */
    vec3 sv = s2Cuts(q.y, 42.0, 5.7);
    float strip = sv.z;
    /* Across the strip, each cut on the strip's own slant. */
    float slant = 0.9 * (s2Hash(vec2(strip, 2.9)) - 0.5);
    float u = q.x + slant * (q.y - 0.5 * (sv.x + sv.y));
    float wu = 90.0 + 140.0 * s2Hash(vec2(strip, 6.1));
    vec3 su = s2Cuts(u + wu * s2Hash(vec2(strip, 3.3)), wu, strip * 1.7 + 0.4);
    S2Parcel r;
    r.own = vec2(su.z, strip);
    r.q = vec2(u, q.y);
    float eAcross = min(q.y - sv.x, sv.y - q.y);
    float eAlong = min(u + wu * s2Hash(vec2(strip, 3.3)) - su.x, su.y - u - wu * s2Hash(vec2(strip, 3.3))) / sqrt(1.0 + slant * slant);
    r.edge = min(eAcross, eAlong);
    r.other = eAcross < eAlong ? vec2(su.z, strip + (q.y - sv.x < sv.y - q.y ? -1.0 : 1.0) * 97.0) : vec2(su.z + 1.0, strip);
    r.slant = slant;
    r.toEdge = eAcross < eAlong ? vec2(0.0, q.y - sv.x < sv.y - q.y ? -1.0 : 1.0)
      : normalize(vec2(1.0, slant)) * (u + wu * s2Hash(vec2(strip, 3.3)) - su.x < su.y - u - wu * s2Hash(vec2(strip, 3.3)) ? -1.0 : 1.0);
    return r;
  }

  /* What s2Meadow makes of a field: the colour, how mown (0 to 1), how
   * much of a boundary the point is on, whether that boundary is a
   * hedge, and the mown rows: the coordinate across them in metres and
   * the way they run on the ground. */
  struct S2Meadow { vec3 tint; float mown; float edge; float hedgeOn; float across; vec2 along; };

  S2Meadow s2MeadowAt(S2Parcel pc, vec2 xz, float dist) {
    /* A pixel's width on the ground, near enough, for fading lines. */
    float px = max(dist * 0.0011, 0.02);
    vec2 fid = pc.own;
    float edge = pc.edge;
    vec2 fq = pc.q;

    /* The plateau the strip and the village stand on (terrain.js holds
     * it flat) is village greens and the strip's own grass: kept short
     * and even, with no hedges and only a faint seam. */
    float plateau = (1.0 - smoothstep(140.0, 340.0, abs(xz.y))) * (1.0 - smoothstep(150.0, 320.0, abs(xz.x + 60.0)));
    float kind = s2Hash(fid + 4.4);
    float lum = 0.78 + 0.42 * s2Hash(fid + 8.8);
    vec3 tint;
    float mown = 0.0;
    float rowsDir = step(0.5, s2Hash(fid + 2.2));
    /* Rows along the strip, or across it on some. */
    float rowCoord = rowsDir > 0.5 ? fq.x : fq.y;
    float rowFade = 1.0 - smoothstep(0.35, 0.9, px / 1.2);
    if (kind < 0.28) {
      /* Uncut hay: deep, bluish, flowering. */
      float bloom = s2Fbm(xz / 6.0 + fid);
      tint = mix(vec3(0.66, 0.8, 0.68), vec3(0.9, 0.94, 0.84), 0.35 * bloom);
    } else if (kind < 0.5) {
      /* Grown back after a cut: an even fresh green. */
      tint = vec3(1.06, 1.1, 0.86);
      mown = 0.55;
    } else if (kind < 0.7) {
      /* Cut this week: the stubble yellow, and the hay lying to dry in
       * windrows. */
      float row = 1.0 - smoothstep(0.08, 0.2, abs(fract(rowCoord / 5.5) - 0.5));
      tint = mix(vec3(1.1, 1.06, 0.8), vec3(1.3, 1.16, 0.7), row * rowFade);
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
      tint = vec3(1.16, 1.07, 0.8);
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
    float hedgeOn = step(0.66, s2Hash(pc.own + pc.other + 13.0));
    hedgeOn *= step(0.3, s2Noise(xz / 23.0));
    hedgeOn *= 1.0 - plateau;
    float wide = max(hedgeW, px * 1.5);
    float hedge = hedgeOn * (1.0 - smoothstep(wide * 0.6, wide, edge)) * (hedgeW / wide);
    float seam = (1.0 - smoothstep(0.3, max(1.6, px * 1.5), edge)) * min(1.0, 1.6 / max(1.6, px * 1.5));
    tint *= 1.0 - 0.12 * seam * (1.0 - 0.7 * plateau);
    tint = mix(tint, vec3(0.5, 0.6, 0.42), 0.85 * clamp(hedge, 0.0, 1.0));

    tint = mix(tint, vec3(1.0, 1.03, 0.88), 0.35 * plateau);

    /* The drift of hue across the valley. */
    float drift = s2Fbm(xz / 900.0 + 31.0);
    tint *= mix(vec3(0.95, 1.0, 0.96), vec3(1.06, 1.02, 0.88), drift);

    S2Meadow m;
    m.tint = tint;
    m.mown = mown;
    m.edge = clamp(hedge + seam, 0.0, 1.0);
    m.hedgeOn = hedgeOn;
    m.across = rowCoord;
    m.along = rowsDir > 0.5 ? normalize(vec2(-pc.slant, 1.0)) : vec2(1.0, 0.0);
    return m;
  }
  S2Meadow s2Meadow(vec2 xz, float dist) {
    return s2MeadowAt(s2Parcel(xz), xz, dist);
  }
`;

/*
 * The far ridges' crests, broken. The heightfield's thirty metre cells
 * draw every ridgeline as a run of straight edges, sixteen pixels long
 * each at two kilometres, and snowcaps as soft blankets. Above the snow
 * line the drawn ground is raised by up to RIDGE_M metres of ridged
 * noise seventy metres across, so the skyline is jagged, but only past
 * RIDGE_NEAR metres from the camera, faded in over the next 1200 m:
 * wherever a craft can reach the ground in the next few seconds it is
 * drawn exactly where the collider has it. Up only, so nothing a craft
 * could hit is ever drawn below where it is. The grid still sets the
 * limit: a crest has a vertex every thirty metres, and the noise can
 * only move those.
 */
const RIDGE_FROM = 950;
const RIDGE_M = 30;
const RIDGE_NEAR = 800;
const RIDGE_GLSL = /* glsl */ `
  uniform float uS2Ridge;
  float s2rHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float s2rNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(s2rHash(i), s2rHash(i + vec2(1.0, 0.0)), u.x),
               mix(s2rHash(i + vec2(0.0, 1.0)), s2rHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float s2Ridge(vec3 w) {
    float high = smoothstep(${RIDGE_FROM.toFixed(1)}, ${(RIDGE_FROM + 350).toFixed(1)}, w.y);
    float far = smoothstep(${RIDGE_NEAR.toFixed(1)}, ${(RIDGE_NEAR + 1200).toFixed(1)}, distance(w, cameraPosition));
    vec2 q = w.xz / 70.0;
    float r1 = 1.0 - abs(2.0 * s2rNoise(q) - 1.0);
    float r2 = 1.0 - abs(2.0 * s2rNoise(q * 2.3 + 5.1) - 1.0);
    return ${RIDGE_M.toFixed(1)} * high * far * (r1 * r1 * 0.7 + r2 * r2 * 0.3);
  }
`;

const GROUND_PARS = /* glsl */ `
  uniform sampler2D uS2Zone1;
  uniform sampler2D uS2Zone2;
  uniform sampler2D uS2Path;
  uniform sampler2D uS2Walls;
  uniform vec2 uS2WallAt;
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
  /* Value noise in three dimensions with its gradient (after Quilez). */
  float s2Hash3(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }
  vec3 s2NoiseG3(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    vec3 u = f * f * (3.0 - 2.0 * f);
    vec3 du = 6.0 * f * (1.0 - f);
    float a = s2Hash3(i);
    float b = s2Hash3(i + vec3(1.0, 0.0, 0.0));
    float c = s2Hash3(i + vec3(0.0, 1.0, 0.0));
    float d = s2Hash3(i + vec3(1.0, 1.0, 0.0));
    float e = s2Hash3(i + vec3(0.0, 0.0, 1.0));
    float g = s2Hash3(i + vec3(1.0, 0.0, 1.0));
    float h = s2Hash3(i + vec3(0.0, 1.0, 1.0));
    float k = s2Hash3(i + vec3(1.0, 1.0, 1.0));
    float k4 = a - b - c + d;
    float k5 = a - c - e + h;
    float k6 = a - b - e + g;
    float k7 = -a + b + c - d + e - g - h + k;
    return du * vec3(b - a + k4 * u.y + k6 * u.z + k7 * u.y * u.z,
                     c - a + k5 * u.z + k4 * u.x + k7 * u.z * u.x,
                     e - a + k6 * u.x + k5 * u.y + k7 * u.x * u.y);
  }
  /*
   * The gradient of a relief laid over the mesh, in metres per metre:
   * gullies and ribs a hundred metres to ten across, the kind a real wall
   * is made of and a thirty metre grid smooths away. Deep on steep
   * ground, faint on the floor. It is a field in space, not a pattern
   * laid on the ground's plan: read off the plan, a wall steeper than
   * about fifty degrees saw each bump drawn out down its fall line, and
   * the faces were smeared in long streaks. Octaves too fine for the
   * distance are dropped, so the far walls do not shimmer.
   */
  vec3 s2Relief(vec3 p, float amp, float dist) {
    vec3 g = vec3(0.0);
    float a = amp;
    float fq = 1.0 / 110.0;
    for (int o = 0; o < 4; o++) {
      /* A pixel is about dist / 1070 metres across at the default lens;
       * an octave goes before its wavelength is eight pixels. */
      float keep = 1.0 - smoothstep(0.12, 0.25, dist * 0.00093 * fq);
      g += s2NoiseG3(p * fq + float(o) * 17.3) * a * fq * keep;
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

  /*
   * The two planes a point of ground is read on (biplanar mapping, after
   * Quilez): the one the face looks along most, and the next. Anything
   * gentler than thirty five degrees is read on the plan alone, exactly
   * as before: vegetation/zones.js repeats some of what is read there in
   * JavaScript. Steeper faces are read more and more from the side, so
   * neither a texture nor a noise is drawn out down them into streaks. w is how much
   * each plane counts, and sums to one.
   */
  struct S2Planes { int a; int b; vec2 w; };
  S2Planes s2Planes(vec3 n) {
    vec3 an = abs(n);
    S2Planes r;
    r.a = an.x > an.y && an.x > an.z ? 0 : an.y > an.z ? 1 : 2;
    int lo = an.x < an.y && an.x < an.z ? 0 : an.y < an.z ? 1 : 2;
    r.b = 3 - lo - r.a;
    vec2 w = clamp((vec2(an[r.a], an[r.b]) - 0.5773) / (1.0 - 0.5773), 0.0, 1.0);
    w *= w;
    r.w = w / (w.x + w.y);
    return r;
  }
  vec2 s2On(vec3 v, int a) {
    return a == 0 ? v.zy : a == 1 ? v.xz : v.xy;
  }
  /* A tangent space normal read on plane a, into the world about the
   * ground's normal n (the whiteout blend, after Golus). */
  vec3 s2Whiteout(vec3 t, vec3 n, int a) {
    return a == 0 ? vec3(abs(t.z) * n.x, t.y + n.y, t.x + n.z)
         : a == 1 ? vec3(t.x + n.x, abs(t.z) * n.y, t.y + n.z)
         : vec3(t.x + n.x, t.y + n.y, abs(t.z) * n.z);
  }
  float s2FbmOn(vec3 p, S2Planes pl, float scale) {
    float v = s2Fbm(s2On(p, pl.a) / scale) * pl.w.x;
    if (pl.w.y > 0.0) {
      v += s2Fbm(s2On(p, pl.b) / scale) * pl.w.y;
    }
    return v;
  }
  float s2NoiseOn(vec3 p, S2Planes pl, float scale) {
    float v = s2Noise(s2On(p, pl.a) / scale) * pl.w.x;
    if (pl.w.y > 0.0) {
      v += s2Noise(s2On(p, pl.b) / scale) * pl.w.y;
    }
    return v;
  }

  /* A band w metres wide about x == 0, drawn a pixel wide at the
   * contrast it would average to once it is narrower than one. */
  float s2Band(float x, float w, float px) {
    float wide = max(w, px);
    return (1.0 - smoothstep(0.5 * (wide - px), 0.5 * (wide + px), abs(x))) * (w / wide);
  }
  /* Stripes of period one, plus and minus one, seen through a pixel fw
   * periods wide: their edges a pixel soft, and gone before they are
   * fine enough to shimmer. */
  float s2Stripes(float x, float fw) {
    float t = abs(fract(x) - 0.5) * 4.0 - 1.0;
    return clamp(t / max(2.0 * fw, 1e-3), -1.0, 1.0) * (1.0 - smoothstep(0.2, 0.4, fw));
  }

  /*
   * A field as it looks from the air. What made the floor read as lawn
   * past the near grass was that every field was one flat colour with a
   * ruled edge. A real one is textured at every scale down to the
   * pixel: the mower's passes, each laying the grass one way so that
   * alternate passes are light and dark as seen along them; the
   * headland round the edge, mown last and round the field, with a
   * darker line where the tractor turned; streaks along the passes where
   * the cut grass lay thicker, clumps, and a drift of colour across the
   * field where the ground is wetter or thinner. Where two fields meet
   * the edge is uneven and neither colour stops dead. Some fields have a
   * track along an edge, and a hedge throws its shadow away from the
   * sun. The tint multiplies the albedo, the tilt leans the normal along
   * the lie of the grass, the track is its two ruts and the shade is the
   * hedge's shadow. fx and fy are the pixel's steps across the ground:
   * a pattern is filtered by the pixel's reach across it, which looking
   * along the ground is many times its reach the other way.
   */
  struct S2Field { vec3 tint; vec3 tilt; float track; float shade; };
  float s2Reach(vec2 fx, vec2 fy, vec2 across) {
    return max(abs(dot(fx, across)) + abs(dot(fy, across)), 0.02);
  }
  S2Field s2Field(vec2 xz, float dist, vec2 look, vec2 fx, vec2 fy) {
    float px = max(max(length(fx), length(fy)), 0.02);
    S2Parcel pc = s2Parcel(xz);
    S2Meadow m = s2MeadowAt(pc, xz, dist);
    S2Field f;
    f.tint = m.tint;
    float pxEdge = s2Reach(fx, fy, pc.toEdge);
    float edge = pc.edge + 3.0 * (s2Noise(xz / 9.0 + 2.3) - 0.5);
    /* Neither colour stops dead: over the last few metres each field
     * goes halfway to its neighbour's, read just across the boundary. */
    float soft = 0.5 * (1.0 - smoothstep(0.0, 3.0 + pxEdge, edge));
    if (soft > 0.01) {
      vec2 over = xz + pc.toEdge * (2.0 * max(pc.edge, 0.0) + 0.6);
      f.tint = mix(f.tint, s2Meadow(over, dist).tint, soft);
    }
    float mownK = smoothstep(0.4, 0.9, m.mown);
    float headW = 5.5 + 3.0 * s2Hash(pc.own + 5.1);
    bool head = edge < headW;
    float across = head ? edge : m.across;
    vec2 along = head ? vec2(-pc.toEdge.y, pc.toEdge.x) : m.along;
    float pxAcross = s2Reach(fx, fy, vec2(-along.y, along.x));
    /* The passes, 2.7 m wide, each laid the other way. */
    float lie = s2Stripes(across / 5.4, pxAcross / 5.4);
    float g = 1.0 + (0.11 * mownK + 0.03) * lie * dot(look, along);
    f.tilt = vec3(along.x, 0.0, along.y) * lie * 0.18 * mownK;
    g *= 1.0 - 0.1 * mownK * s2Band(edge - headW, 1.4, pxEdge);
    /* Streaks along the passes and clumps, each gone before it would
     * shimmer. */
    float streak = s2Noise(vec2(across / 3.0, dot(xz, along) / 26.0) + pc.own * 1.7);
    g *= 1.0 + 0.2 * (streak - 0.5) * (1.0 - smoothstep(0.8, 1.6, pxAcross));
    g *= 1.0 + 0.16 * (s2Noise(xz / 4.5 + 7.1) - 0.5) * (1.0 - smoothstep(0.9, 1.8, px));
    g *= 1.0 + 0.2 * (s2Noise(xz / 14.0 + pc.own * 2.3) - 0.5) * (1.0 - smoothstep(2.5, 5.0, px));
    g *= 1.0 + 0.3 * (s2Fbm(xz / 38.0 + pc.own * 1.1) - 0.5);
    float wet = s2Noise(xz / 85.0 + pc.own * 3.7);
    f.tint *= g * mix(vec3(0.93, 0.99, 0.97), vec3(1.07, 1.01, 0.9), wet);
    /* A track inside some fields' edges: two ruts a tractor's gauge
     * apart. */
    float trackOn = step(0.8, s2Hash(pc.own + pc.other + 29.0)) * (1.0 - m.hedgeOn);
    f.track = trackOn * max(s2Band(pc.edge - 1.2, 0.5, pxEdge), s2Band(pc.edge - 3.0, 0.5, pxEdge));
    /* The hedge's shadow, on the side away from the sun, as long as a
     * hedge two to six metres tall throws it: a hedge is a row of
     * bushes and trees, not a wall. */
    vec2 sunXZ = uS2SunDir.xz;
    float sunward = dot(pc.toEdge, normalize(sunXZ + vec2(1e-4, 0.0)));
    float tall = 2.0 + 4.0 * s2Noise(xz / 7.0 + 4.1);
    float reach = tall * length(sunXZ) / max(uS2SunDir.y, 0.15) * max(sunward, 0.0);
    f.shade = m.hedgeOn * (1.0 - smoothstep(reach * 0.5 + 2.0, reach + 2.0 + pxEdge, pc.edge)) * smoothstep(0.0, 0.3, sunward);
    return f;
  }

  struct S2Ground { vec3 albedo; vec3 normal; float rough; float ao; float backlit; float sheen; };

  S2Ground s2Ground(vec3 p, vec3 n) {
    vec2 fuv = (p.xz + uS2Field.x) / uS2Field.y;
    float inside = step(0.0, fuv.x) * step(fuv.x, 1.0) * step(0.0, fuv.y) * step(fuv.y, 1.0);
    vec4 z1 = texture2D(uS2Zone1, fuv) * inside;
    vec4 z2 = texture2D(uS2Zone2, fuv) * inside;
    float path = texture2D(uS2Path, fuv).r * inside;
    float dist = length(p - cameraPosition);
    vec3 n0 = n;
    vec3 toEye = normalize(cameraPosition - p);
    S2Planes pl = s2Planes(n);
    float macro = s2FbmOn(p, pl, 190.0);
    float meso = s2FbmOn(p, pl, 41.0);
    float fine = s2NoiseOn(p, pl, 7.0);
    /* The relief first, so the rock finds the ribs it makes. */
    float steep0 = smoothstep(0.2, 0.9, sqrt(max(0.0, 1.0 - n.y * n.y)) / max(n.y, 0.05));
    /* Above the trees the mountain is bare and the relief is all there
     * is to see: deeper there, so a snowfield is not a sheet. */
    float bare = smoothstep(${TREE_LINE.toFixed(1)}, ${(TREE_LINE + 400).toFixed(1)}, p.y);
    vec3 rg = s2Relief(p, mix(1.5, 24.0, max(steep0, 0.6 * bare)) * (1.0 - z2.g), dist);
    /* Gullies and the ribs between them, running down the face: a
     * mountain face is fluted, and the thirty metre grid is not. Grooves
     * about twenty metres across and deep to match, cut into the normal,
     * and kept as where the snow collects and where the wind strips it.
     * Read on the two upright planes, weighted by the way the face turns,
     * so the grooves stay put as the normal swings: read across the
     * normal's own bearing, far from the origin a degree of turn slid
     * them a whole groove and the face swirled like wood grain. A groove
     * runs three times as long as it is wide and wanders: drawn seven
     * times as long and straight, a far face was brushed in streaks. */
    vec2 gw = n.xz * n.xz + 1e-4;
    gw /= gw.x + gw.y;
    float wander = 0.9 * (meso - 0.5);
    vec3 gx = s2NoiseD(vec2(p.z / 23.0 + wander, p.y / 70.0 + 0.3 * meso));
    vec3 gz = s2NoiseD(vec2(p.x / 23.0 + 7.7 + wander, p.y / 70.0 + 0.3 * meso));
    float gully = gx.x * gw.x + gz.x * gw.y;
    float gullyKeep = 1.0 - smoothstep(0.12, 0.25, dist * 0.00093 / 23.0);
    float couloir = smoothstep(0.52, 0.8, gully) * steep0;
    float rib = smoothstep(0.45, 0.2, gully) * steep0;
    rg += vec3(gz.y * gw.y, 0.0, gx.y * gw.x) * (9.0 / 23.0) * steep0 * max(bare, 0.4) * gullyKeep;
    /* The relief's slope along the face only: what points out of it
     * would tilt nothing. */
    rg -= n * dot(n, rg);
    /* Half the relief decides where rock shows, all of it how the light
     * falls: ribs in shadow and gullies lit, without the whole wall
     * turning to bare rock. */
    vec3 nCov = normalize(n - 0.5 * rg);
    n = normalize(n - rg);
    float tanS = sqrt(max(0.0, 1.0 - nCov.y * nCov.y)) / max(nCov.y, 0.05);
    /*
     * A real wall changes with height. Two bands of pale limestone cliff
     * run along each wall, at heights that wander with the noise and
     * broken where the noise says, the lower one about ${CLIFF_LOW} m up and the
     * upper one about ${CLIFF_HIGH} m; the grid's slope is a smooth ramp there, so
     * the band's light is turned toward the cliff it stands for. Under
     * each, a fan of scree down the gullies it sheds into.
     */
    float wallTo = smoothstep(0.3, 0.6, tanS) * inside * step(uS2Only, -0.5);
    /* The ravines: the gullies' pattern again at five times the size, a
     * few on each face, which is the scale the scrub, the scree and the
     * turf's edges follow. The gullies themselves are too fine for that
     * and brushed the whole face in streaks. */
    float ravine = s2Noise(vec2(p.z / 130.0 + 0.5 * wander, p.y / 330.0 + 0.4 * macro)) * gw.x + s2Noise(vec2(p.x / 130.0 + 3.1 + 0.5 * wander, p.y / 330.0 + 0.4 * macro)) * gw.y;
    float b1 = ${CLIFF_LOW.toFixed(1)} + 150.0 * (s2Noise(p.xz / 1400.0 + 3.3) - 0.5);
    float b2 = ${CLIFF_HIGH.toFixed(1)} + 130.0 * (s2Noise(p.xz / 1700.0 + 8.1) - 0.5);
    float bw1 = 35.0 + 35.0 * meso;
    float bw2 = 45.0 + 45.0 * s2Noise(p.xz / 300.0 + 2.9);
    float warp = 25.0 * (meso - 0.5) + 8.0 * (fine - 0.5);
    float d1 = abs(p.y + warp - b1);
    float d2 = abs(p.y + warp - b2);
    float cliff = max((1.0 - smoothstep(bw1 * 0.55, bw1, d1)) * smoothstep(0.38, 0.55, s2Noise(p.xz / 330.0 + 1.7)),
                      (1.0 - smoothstep(bw2 * 0.55, bw2, d2)) * smoothstep(0.3, 0.5, s2Noise(p.xz / 410.0 + 6.2)));
    cliff *= wallTo;
    float under1 = (b1 - bw1) - (p.y + warp);
    float under2 = (b2 - bw2) - (p.y + warp);
    float shed = max(smoothstep(0.0, 25.0, under1) * (1.0 - smoothstep(60.0, 190.0, under1)),
                     smoothstep(0.0, 25.0, under2) * (1.0 - smoothstep(80.0, 260.0, under2)));
    float screeFan = shed * smoothstep(0.5, 0.7, ravine + 0.2 * (meso - 0.5)) * wallTo;
    n = normalize(vec3(n.x * (1.0 + 1.6 * cliff), n.y, n.z * (1.0 + 1.6 * cliff)));

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
    /* Bare rock is the cliffs, the ribs and the faces too steep for any
     * turf (a fifty degree slope in the Alps is grass); above the trees,
     * the broken alpine ground of rock and turf the aerial photograph
     * is. */
    float rockFace = smoothstep(1.05 + 0.3 * fine, 1.45 + 0.25 * fine, tanS);
    float ribRock = smoothstep(0.35, 0.2, ravine) * smoothstep(0.75, 1.1, tanS + 0.3 * (meso - 0.5));
    cov[4] = max(max(rockFace, 0.85 * ribRock), cliff);
    cov[3] = max(cov[3], screeFan);
    float rockHigh = inside > 0.5 ? z2.a : smoothstep(650.0, 950.0, p.y + 200.0 * macro);
    /* Above the trees the mountain is not all broken rock: turf holds on
     * everything but the steep and the highest ground, in sweeps the
     * noise lays out, and the broken ground keeps the ribs and the
     * steep. */
    float turf = (1.0 - smoothstep(1.0, 1.5, tanS + 0.7 * (macro - 0.5) + 0.45 * (meso - 0.5) - 0.5 * (ravine - 0.5)))
      * (1.0 - smoothstep(1150.0, 1400.0, p.y + 200.0 * macro));
    cov[8] = rockHigh * (1.0 - 0.85 * turf);
    float snowHigh = inside > 0.5 ? z2.b : smoothstep(1350.0, 1800.0, p.y + 260.0 * macro);
    /* Snow lies where it can hold: on anything gentler than about forty
     * degrees, steeper in the gullies it fills, and stripped by the wind
     * off the ribs and the steep faces, so the rock shows through in
     * bands down the face. It lies longer on the faces turned from the
     * sun, and its edge is broken by the ground's own heights. */
    float shade = -dot(nCov.xz, vec2(${SUN_XZ[0].toFixed(3)}, ${SUN_XZ[1].toFixed(3)})) / max(length(nCov.xz), 0.05) * smoothstep(0.1, 0.5, tanS);
    float snowLie = (snowHigh - 0.5) * 1.7 + 0.5 + (meso - 0.5) * 0.5 + (fine - 0.5) * 0.3 + 0.18 * shade + 0.2 * couloir - 0.3 * rib * smoothstep(0.3, 0.9, tanS);
    float hold = 1.0 - smoothstep(0.8 + 0.5 * couloir - 0.2 * rib, 1.3 + 0.5 * couloir, tanS + 0.2 * (fine - 0.5));
    cov[5] = smoothstep(0.3, 0.7, snowLie) * hold;
    /* The shore: a gravel beach up from the water, as wide as the
     * ground is flat, its top wandering half a metre to two over the
     * water, so the lake is edged by a strand and not a drawn line. The
     * mask alone is 23 m a texel and left a thin band. The bed under
     * the water is the same gravel. */
    float lakeSide = inside * step(${(LAKE_N - 60).toFixed(1)}, p.z);
    float beachTop = uS2LakeY + 0.5 + 1.6 * meso + 0.7 * (fine - 0.5);
    cov[6] = max(z1.a, lakeSide * (1.0 - smoothstep(beachTop - 0.6, beachTop, p.y)));
    /* How far to the nearest wall, in metres, WALL_REACH and beyond
     * meaning none. */
    vec2 wuv = (p.xz - uS2WallAt) / ${WALL_SPAN.toFixed(1)};
    float wallD = any(greaterThan(abs(wuv - 0.5), vec2(0.5))) ? ${WALL_REACH.toFixed(1)} : ${WALL_REACH.toFixed(1)} * texture2D(uS2Walls, wuv).r;
    float drip = (1.0 - smoothstep(0.25, 0.7, wallD + 0.3 * (fine - 0.5))) * inside;
    cov[7] = max(path * 0.9, drip);
    /* A boulder, a snow patch: one layer and nothing else. */
    if (uS2Only >= 0.0) {
      for (int k = 1; k < 9; k++) {
        cov[k] = float(k) == uS2Only ? 1.0 : 0.0;
      }
    }
    /* The farmed floor (MEADOW_GLSL and s2Field). */
    float grass = clamp(1.0 - cov[2] - cov[3] - cov[4] - cov[5] - cov[6] - cov[8], 0.0, 1.0);
    float farm = grass * (1.0 - smoothstep(50.0, 140.0, p.y)) * (1.0 - smoothstep(0.12, 0.3, tanS)) * (1.0 - cov[1]);
    vec2 look = normalize(p.xz - cameraPosition.xz + vec2(1e-3, 0.0));
    /* Every derivative taken here, where every pixel of the quad runs:
     * inside a branch that goes differently from pixel to pixel, as the
     * field's and the layer loop's do, a derivative is undefined. */
    vec3 dpx = dFdx(p);
    vec3 dpy = dFdy(p);
    S2Field field = S2Field(vec3(1.0), vec3(0.0), 0.0, 0.0);
    if (farm > 0.0) {
      field = s2Field(p.xz, dist, look, dpx.xz, dpy.xz);
    }

    vec2 uA = s2On(p, pl.a);
    vec2 uB = s2On(p, pl.b);
    vec2 dAx = s2On(dpx, pl.a);
    vec2 dAy = s2On(dpy, pl.a);
    vec2 dBx = s2On(dpx, pl.b);
    vec2 dBy = s2On(dpy, pl.b);
    /* A second read of each layer at a few times the scale, turned, so
     * the tile's pattern does not repeat from the air. */
    const mat2 TURN = mat2(0.8, -0.6, 0.6, 0.8);

    vec3 albedo = vec3(0.0);
    vec3 wnormal = vec3(0.0);
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
      float lk = float(k);
      vec4 nh = textureGrad(uS2Nrh, vec3(uA * s, lk), dAx * s, dAy * s);
      vec4 nhB = nh;
      if (pl.w.y > 0.0) {
        nhB = textureGrad(uS2Nrh, vec3(uB * s, lk), dBx * s, dBy * s);
      }
      float h = mix(nh.b, nhB.b, pl.w.y);
      float cc = k == 0 ? 1.0 : clamp(c + (h - 0.5) * 3.2 * c * (1.0 - c), 0.0, 1.0);
      /* The pasture shades into the meadow over tens of metres, the rock
       * breaks up by its own heights alone; the rest meet at an edge the
       * heights break up. */
      cc = k == 0 || k == 1 || k == 4 ? cc : smoothstep(0.18, 0.82, cc);
      float w = cc * remaining;
      if (w < 0.004) {
        continue;
      }
      remaining -= w;
      vec3 col = textureGrad(uS2Col, vec3(uA * s, lk), dAx * s, dAy * s).rgb;
      if (pl.w.y > 0.0) {
        col = mix(col, textureGrad(uS2Col, vec3(uB * s, lk), dBx * s, dBy * s).rgb, pl.w.y);
      }
      /* Rock's second read is larger and counts for more: a kilometre
       * of wall is not a thousand copies of one tile. */
      float s2 = s * (k == 4 ? 0.23 : 0.29);
      col = mix(col, textureGrad(uS2Col, vec3(TURN * uA * s2 + vec2(0.37, 0.71), lk), TURN * dAx * s2, TURN * dAy * s2).rgb, k == 4 ? 0.45 : 0.28);
      vec3 wn = s2Whiteout(s2Tangent(nh, uS2Bump[k] * fade), n, pl.a) * pl.w.x;
      if (pl.w.y > 0.0) {
        wn += s2Whiteout(s2Tangent(nhB, uS2Bump[k] * fade), n, pl.b) * pl.w.y;
      }
      if (k == 4) {
        /* Strata: a darker band in every three, thirty metres tall,
         * warped by the noise so they never read as contour lines. */
        float band = fract((p.y + 22.0 * meso + 9.0 * fine) / 31.0);
        col *= 1.0 - 0.16 * smoothstep(0.0, 0.05, band) * (1.0 - smoothstep(0.24, 0.32, band));
        col *= (0.8 + 0.4 * macro) * mix(vec3(1.0), vec3(0.8, 0.76, 0.7), smoothstep(0.4, 0.8, meso));
        /* Water streaks down the face: long dark stains, narrow across
         * and tall, where the runoff has darkened the limestone. */
        vec2 fall = normalize(n.xz + vec2(1e-4, 0.0));
        float streak = s2Fbm(vec2(dot(p.xz, vec2(-fall.y, fall.x)) / 9.0, p.y / 60.0));
        col *= 1.0 - 0.3 * smoothstep(0.52, 0.78, streak) * smoothstep(0.6, 1.2, tanS);
        /* The gullies shaded and damp, the ribs weathered pale. */
        col *= 1.0 - 0.22 * couloir + 0.12 * rib;
        /* The cliff bands are limestone, paler and warmer than the
         * broken rock round them. */
        col *= mix(vec3(1.0), vec3(1.55, 1.48, 1.34), cliff);
      }
      albedo += col * uS2Tint[k] * w;
      wnormal += wn * w;
      rough += uS2Rough[k] * w;
      hsum += h * w;
    }

    /* The meadow's life: hayfields a yellower green, a hue that wanders
     * across the valley, and the mown fields on the village plateau and
     * the strip striped the way a mower leaves them. */
    vec3 hue = mix(vec3(0.92, 1.04, 0.86), vec3(1.1, 1.0, 0.78), meso);
    hue = mix(hue, vec3(1.16, 1.04, 0.72), z2.r * (1.0 - smoothstep(60.0, 300.0, p.y)) * 0.8);
    albedo *= mix(vec3(1.0), hue, grass);
    /* The turf above the trees: gold and brown where the sun has dried
     * it, a cooler green on the faces turned from it, in patches. And in
     * the gullies of the middle wall the dark green of alder scrub, so
     * the wall is fingered up its gullies rather than one green. */
    float alpine = smoothstep(560.0, 780.0, p.y + 90.0 * meso) * grass;
    vec3 dry = mix(vec3(1.5, 1.14, 0.55), vec3(1.35, 0.95, 0.6), smoothstep(0.45, 0.7, s2Fbm(p.xz / 120.0 + 5.5)));
    vec3 alpTint = mix(dry, vec3(0.92, 1.0, 0.82), clamp(0.5 + 1.2 * shade, 0.0, 1.0));
    albedo *= mix(vec3(1.0), alpTint, alpine);
    float scrub = smoothstep(0.6, 0.78, ravine + 0.2 * (meso - 0.5)) * smoothstep(220.0, 380.0, p.y) * (1.0 - smoothstep(900.0, 1100.0, p.y)) * steep0 * grass * inside;
    albedo *= mix(vec3(1.0), vec3(0.42, 0.56, 0.36), 0.85 * scrub);
    albedo *= mix(vec3(1.0), field.tint, farm);
    albedo *= 1.0 - 0.35 * field.shade * farm;
    /* The track's ruts are bare earth. Not the worn earth layer: its
     * edge is broken by the photograph's heights, and a rut narrower
     * than a pixel broke into dashes. */
    albedo = mix(albedo, vec3(0.25, 0.21, 0.155) * (0.85 + 0.3 * fine), 0.75 * field.track * farm);
    /* The strip's lawn, striped the way its mower leaves it. */
    vec2 fq = mat2(0.97, -0.24, 0.24, 0.97) * p.xz;
    float rows = step(0.5, fract(fq.y / 3.6)) * 2.0 - 1.0;
    float lie = rows * dot(look, vec2(0.97, -0.24));
    albedo *= 1.0 + 0.07 * lie * uS2Strip * grass * (1.0 - smoothstep(120.0, 450.0, dist));
    /* Close to, a meadow is never one green: clover and trodden patches
     * a few metres across, some darker and bluer, some yellower. */
    /* And the gaps between the blades are dark: the photograph's own
     * height, read as how deep in the sward a texel is. */
    albedo *= mix(1.0, 0.55 + 0.6 * clamp(hsum, 0.0, 1.0), grass * 0.7 * (1.0 - smoothstep(25.0, 140.0, dist)));
    float blotch = s2Fbm(p.xz / 5.5 + 3.7);
    albedo *= mix(vec3(1.0), mix(vec3(0.84, 0.9, 0.86), vec3(1.12, 1.07, 0.86), blotch), grass * (1.0 - smoothstep(60.0, 350.0, dist)));
    albedo *= 0.8 + 0.4 * macro;
    /* A sward is not a flat colour either. Looked down into, a camera
     * sees the shade between the blades and the ground under them;
     * looked along, only the blades' sides and their dry tips, so a
     * meadow goes lighter and yellower toward the horizon and darker and
     * bluer under the eye. */
    float graze = 1.0 - clamp(dot(toEye, n0), 0.0, 1.0);
    albedo *= mix(vec3(1.0), mix(vec3(0.86, 0.9, 0.95), vec3(1.14, 1.06, 1.0), smoothstep(0.35, 0.97, graze)), grass);
    /* The rank, shaded grass along a wall. */
    float lee = (1.0 - smoothstep(0.6, 2.6 + 1.2 * fine, wallD)) * grass;
    albedo *= mix(vec3(1.0), vec3(0.8, 0.88, 0.78), lee);
    /* And the drip line itself wet and dark, not a raked path. */
    albedo *= mix(1.0, 0.6, drip);

    /* The wet line along the shore and the bed going dark under water. */
    float wet = 1.0 - smoothstep(uS2LakeY + 0.2, uS2LakeY + 1.1, p.y);
    albedo *= 1.0 - 0.35 * wet;
    rough = mix(rough, 0.35, wet * 0.8);
    /* Seen through the water, the bed loses its red first: light gravel
     * a metre down is the turquoise of a glacier lake, and it goes to
     * blue green and dark with depth. Down and back up, per metre. */
    float under = max(uS2LakeY - p.y, 0.0);
    albedo *= exp(-under * vec3(0.9, 0.2, 0.14));

    vec3 outN = normalize(normalize(wnormal + n * 1e-4) + field.tilt * farm);

    S2Ground g;
    g.albedo = albedo;
    g.normal = outN;
    g.rough = rough;
    g.ao = mix(1.0, 0.5 + 0.5 * clamp(hsum * 1.3, 0.0, 1.0), 0.65);
    /* Grass is not a matt plane. Looked at with the sun behind the eye
     * every blade shows its lit side; looked at toward the sun, the sides
     * a camera sees are the ones in the blades' own shade, and a sunlit
     * meadow goes darker and deeper the further the view turns into the
     * light (the reason a photograph into the sun has a dark floor and
     * one with it a pale one). Taken off the sun's light on the grass
     * only, from nothing at right angles to the sun to BACKLIT straight
     * into it. */
    float into = -dot(toEye, uS2SunDir);
    g.backlit = 1.0 - ${BACKLIT.toFixed(2)} * grass * smoothstep(0.0, 0.75, into);
    /* And toward the sun a sward shows none of the glare a plane has
     * there. Three draws a rough plane's grazing reflection strongest
     * exactly where the sky is brightest, round the sun, and the meadow
     * into the light was a pale sheet of it; in a real sward both the
     * view and that reflection run into the blades. Only toward the sun:
     * away from it the sheen is the pale cast a meadow does have, and
     * the floor's colour was matched to the photographs with it. */
    g.sheen = 1.0 - ${GRAZE_MASK.toFixed(2)} * grass * (1.0 - smoothstep(0.05, 0.5, dot(toEye, n))) * smoothstep(0.0, 0.75, into);
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
export function groundMaterial({ arrays, zones, path, walls, lit, only = -1, strip = 0 }) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  const uniforms = {
    uS2Zone1: { value: zones.zone1 },
    uS2Zone2: { value: zones.zone2 },
    uS2Path: { value: path },
    uS2Walls: walls,
    uS2WallAt: { value: WALL_ORIGIN },
    uS2Col: { value: arrays.col },
    uS2Nrh: { value: arrays.nrh },
    uS2Tile: { value: TILE },
    uS2Tint: { value: TINT.map((t) => new THREE.Vector3(...t)) },
    uS2Rough: { value: ROUGH },
    uS2Bump: { value: BUMP },
    uS2LakeY: { value: LAKE_Y },
    uS2Strip: { value: strip },
    uS2Only: { value: only },
    uS2Ridge: { value: only < 0 && !strip ? 1 : 0 },
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
    need(shader.vertexShader, '#include <begin_vertex>');
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vS2WNormal;\n${RIDGE_GLSL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifndef USE_INSTANCING
          transformed.y += s2Ridge((modelMatrix * vec4(transformed, 1.0)).xyz) * uS2Ridge;
        #endif`)
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
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= s2g.ao;\nreflectedLight.indirectSpecular *= s2g.ao;\nreflectedLight.directDiffuse *= s2g.backlit;\nreflectedLight.directSpecular *= s2g.sheen;\nreflectedLight.indirectSpecular *= s2g.sheen;');
  };
  mat.customProgramCacheKey = () => 's2-ground';
  lit(mat);
  mat.userData.s2Ground = uniforms;
  return mat;
}
