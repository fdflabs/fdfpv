/*
 * grass.js: the meadow under the camera, blade by blade near and gone by
 * the time the terrain's own paint can carry it.
 *
 * Clumps of grass (three crossed cards from the grass atlas, some of them
 * carrying the meadow's flowers) are scattered on tiles round the camera,
 * in two layers: the blades, on tiles sixteen metres square out to forty
 * metres, and past them the middle distance, clumps twice as wide on a
 * grid three times as coarse on tiles of thirty two, out to a couple of
 * hundred metres and only in the camera's view. A tile is worked out
 * once, when it first comes into range, and kept: its clumps' positions,
 * turns, heights and tints. The instanced draw is refilled from the
 * tiles in range whenever the camera crosses into a new tile (or, for
 * the middle layer, turns onto new ones). In the shader a clump shrinks
 * into the ground over the outer third of its layer's radius, and the
 * middle layer grows in where the blades thin out, so neither edge is a
 * line.
 *
 * What grows where: hay meadow knee high on the valley floor, mown short
 * on the village's plateau and the strip, thin and short under the
 * forest, alpine turf above the tree line, nothing on rock, snow, water,
 * the road or the buildings (layout.coverOff), tufts breaking up over the
 * lake's upper beach, and lush along the stream's banks. On the floor
 * each field grows as the paint farms it (zones.js's meadowField):
 * standing hay thigh high and gone to seed, windrows on a field cut this
 * week, a pasture tufted and worn along the cattle's paths. Flowers in
 * drifts of one colour where the paint puts its flower patches. What the
 * mower leaves, the road's verge past its cut shoulder and a metre either
 * side of the line between two fields, stands waist high in seeding
 * grass with hogweed, dock, nettles and knapweed through it.
 *
 * The cards' normals are the ground's, tipped a little toward the card:
 * lit like the turf it stands in rather than like a stack of paper.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';
import { makeRng, noise2, smoothstep } from '../../alps/noise.js';
import {
  LAKE_Y, STRIP_L, TREE_LINE, SNOW_LINE, forestDensity, treeLine, valleyAxis,
} from '../../alps/terrain.js';
import { ALPHA_CUT, GRASS_REGIONS } from './atlas.js';
import { thermalKind } from '../../../render/thermal.js';
import { LEAF_SPEC_GLSL } from './plantmat.js';
import { MEADOW_GLSL, CRAFT_GLSL, craftUniforms } from '../ground.js';
import {
  meadowFieldInto, airfield, s2Noise, beachTop, ROAD_DX, ROAD_END,
} from './zones.js';

const REGION_KEYS = ['clump0', 'clump1', 'clump2', 'clump3', 'clump4', 'clump5', 'flower0', 'flower1', 'flower2', 'flower3', 'weed0', 'weed1', 'weed2', 'weed3',
  'flat0', 'flat1', 'flat2', 'flat3'];
const WEED0 = REGION_KEYS.indexOf('weed0');
/* The regions laid flat on the turf rather than stood up in it. */
const FLAT0 = REGION_KEYS.indexOf('flat0');
/* Added to a clump's region where it stands in a margin the mower
 * leaves, so the shader does not cut it with the field round it. */
const UNMOWN = 32;
/* Floats per clump: x, y, z, yaw, height, width, region, tint. */
const STRIDE = 8;
/* Where a tile's ground is read for its box: the corners and the middle,
 * as u, v pairs over the tile. */
const BOX_SAMPLES = [0, 0, 1, 0, 0, 1, 1, 1, 0.5, 0.5];

/* Three cards crossed at sixty degrees, a metre wide and a metre high,
 * standing on the origin; the instance scales them. */
function clumpGeometry() {
  const pos = [];
  const uv = [];
  const nrm = [];
  const idx = [];
  for (let k = 0; k < 3; k += 1) {
    const a = (k / 3) * Math.PI + 0.3;
    const cx = Math.cos(a) * 0.5;
    const cz = Math.sin(a) * 0.5;
    const nx = -Math.sin(a);
    const nz = Math.cos(a);
    const base = pos.length / 3;
    for (let r = 0; r <= 1; r += 1) {
      const y = r;
      pos.push(-cx, y, -cz, cx, y, cz);
      uv.push(0, y, 1, y);
      for (let q = 0; q < 2; q += 1) {
        nrm.push(nx * 0.35, 1, nz * 0.35);
      }
    }
    for (let r = 0; r < 1; r += 1) {
      const a0 = base + r * 2;
      idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

/* The verge's mown shoulder, from the road's middle: to VERGE[0] cut
 * short, from there to VERGE[1] left to grow. */
const VERGE = [4.9, 8.5];

/* How far (x, z) is from the nearest of `lines` ({ ax, az, bx, bz }). */
function fenceDist(x, z, lines) {
  let best = Infinity;
  for (const l of lines) {
    const dx = l.bx - l.ax;
    const dz = l.bz - l.az;
    const t = Math.max(0, Math.min(1, ((x - l.ax) * dx + (z - l.az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - l.ax - dx * t, z - l.az - dz * t));
  }
  return best;
}

/* coverAt's answer and the field it reads, one of each, filled in place:
 * a tile build asks for every clump, and an object made per call was
 * the meadow's largest garbage (docs/PERF.md P8). A build reads the
 * answer before it asks again, and never yields between the two. */
const COVER = {
  p: 0, h: 0, bloom: 0, tone: 0, seeds: 0, pasture: false, forest: 0, weeds: 0, unmown: false, flat: 0, bare: 0,
};
const FIELD = { own: [0, 0] };
function cover(p, h, bloom, tone, seeds, pasture, forest, flat, bare) {
  COVER.p = p;
  COVER.h = h;
  COVER.bloom = bloom;
  COVER.tone = tone;
  COVER.seeds = seeds;
  COVER.pasture = pasture;
  COVER.forest = forest;
  COVER.weeds = 0;
  COVER.unmown = false;
  COVER.flat = flat;
  COVER.bare = bare;
  return COVER;
}

/*
 * What the ground at (x, z) grows: the chance a clump stands, its height
 * in metres, and the share of flower clumps. Null where nothing grows.
 * The answer is COVER, good until the next call.
 */
function coverAt(x, z, heightAt, layout) {
  /* The strip is grass too, a mown one: clover and daisies in turf cut
   * to the ankle, which at eye height is what tells a grass strip from a
   * painted one, thinner down the wheel tracks and where the aircraft
   * turn (zones.js airfield, as the paint lays them). */
  const air = Math.abs(x) < 50 && Math.abs(z) < STRIP_L / 2 + 40 ? airfield(x, z) : null;
  if (air && air.paved) {
    return null;
  }
  if (air && air.runway > 0.5) {
    /* Thicker and thinner in patches a few metres across, so the cut
     * turf is not an even pile of clumps. */
    const thick = noise2(x / 3.3 + 7.7, z / 3.3 + 1.9);
    return cover(
      0.9 * (0.55 + 0.45 * thick) * (1 - 0.65 * air.track) * (1 - 0.35 * air.worn),
      0.27 * (0.8 + 0.4 * noise2(x / 5.1 + 3.1, z / 5.1 + 6.2)),
      0.22,
      1,
      0,
      true,
      0,
      0.3 + 0.1 * air.track + 0.1 * air.worn,
      0.04 + 0.3 * Math.max(air.track, air.worn),
    );
  }
  if (layout.coverOff(x, z)) {
    return null;
  }
  if (layout.lakeWet(x, z)) {
    /* The turf does not stop in a line at the beach: it breaks up into
     * tufts over the upper gravel, the last of them a metre or so above
     * the water. */
    const y = heightAt(x, z);
    const below = beachTop(x, z) - 0.3 - y;
    if (y < LAKE_Y + 0.35 || below > 0.9) {
      return null;
    }
    return cover(0.55 * (1 - below / 0.9), 0.2, 0.05, 1, 0, false, 0, 0, 0);
  }
  const bank = layout.streamDist(x, z);
  if (bank < 3.2) {
    return null;
  }
  const y = heightAt(x, z);
  if (y > SNOW_LINE - 40) {
    return null;
  }
  const sx = (heightAt(x + 2, z) - heightAt(x - 2, z)) / 4;
  const sz = (heightAt(x, z + 2) - heightAt(x, z - 2)) / 4;
  const s = Math.hypot(sx, sz);
  if (s > 1.0) {
    return null;
  }
  const rocky = smoothstep(0.7, 1.0, s);
  const forest = forestDensity(x, y, z, s, sz);
  const line = treeLine(x, z);
  const alpine = smoothstep(line - 60, line + 120, y);
  /* The plateau the terrain holds flat for the strip and the village is
   * mown; its footprint is terrain.js's flat term. */
  const mown = (1 - smoothstep(STRIP_L / 2 + 60, STRIP_L / 2 + 260, Math.abs(z))) * (1 - smoothstep(150, 320, Math.abs(x + 60)));
  let p = 0.95 * (1 - rocky * 0.85) * (1 - 0.7 * forest);
  /* Grazed and mown pasture, ankle high, with hay meadow standing
   * to the knee in patches. */
  const hay = smoothstep(0.55, 0.7, noise2(x / 140 + 3.3, z / 140 + 8.8));
  let h = (0.26 + 0.24 * hay) * (1 - 0.4 * alpine) * (1 - 0.5 * forest);
  h = h * (1 - mown) + 0.22 * mown;
  if (bank < 9) {
    h *= 1.3;
  }
  if (y > TREE_LINE + 250) {
    p *= 0.6;
  }
  /* The field the paint lays here (zones.js's meadowField, the paint's
   * own parcels): standing hay is knee to thigh high and gone to seed,
   * a pasture is tufted where the cattle left it and worn along their
   * paths, and flowers stand in drifts of one colour, which is how a
   * meadow flowers: a sheet of buttercup yellow here, ox eye white or
   * clover pink there, sown by the last year's seed where it fell. */
  const field = y < 60 ? meadowFieldInto(x, z, FIELD) : null;
  const kind = field ? field.kind : 'regrown';
  let seeds = 0;
  if (kind === 'uncut') {
    h *= 1 + 0.55 * (1 - mown);
    seeds = 0.35;
  } else if (kind === 'pasture') {
    const w0 = x + 14 * s2Noise(x / 37, z / 37);
    const w1 = z + 14 * s2Noise(x / 41 + 5, z / 41 + 5);
    const v = (w0 * 0.6 + w1 * 0.8) / 23;
    const trod = 1 - smoothstep(0.35, 0.9, Math.abs(v - Math.floor(v) - 0.5) * 23);
    p *= 1 - 0.15 * trod;
    h *= 1 - 0.4 * trod;
  } else if (kind === 'cut') {
    /* Cut this week: the hay lies in windrows along the paint's rows,
     * stubble between them. */
    const r = (field.rowsOnU ? field.u : field.v) / 5.5;
    const row = 1 - smoothstep(0.08, 0.2, Math.abs(r - Math.floor(r) - 0.5));
    p *= 0.8 + 0.2 * row;
    h *= 0.6 + 1.0 * row;
  } else if (kind === 'dry') {
    p *= 0.7;
  }
  const drift = smoothstep(0.55, 0.72, noise2(x / 34 + 9.1, z / 34 + 3.7)) * (1 - forest) * (1 - mown * 0.8);
  const hue = noise2(x / 71 + 1.1, z / 71 + 7.3);
  const tone = hue < 0.4 ? 0 : hue < 0.52 ? 1 : hue < 0.64 ? 2 : 3;
  const flowering = kind === 'uncut' ? 1 : kind === 'pasture' ? 0.55 : kind === 'regrown' ? 0.5 : kind === 'cut' ? 0.15 : 0.2;
  const c = cover(
    p,
    h,
    (0.2 + 0.8 * drift) * flowering,
    tone,
    seeds,
    kind === 'pasture',
    forest,
    kind === 'pasture' ? 0.05 : 0.025 * mown,
    kind === 'pasture' ? 0.12 : 0.04,
  );
  /* What the mower leaves: the road's verge past the strip mown at the
   * tarmac's edge, and a metre either side of the line between two
   * fields (under the fence, where there is one). Both stand knee to
   * waist high in seeding grass, with the verge's weeds through it:
   * hogweed and cow parsley, dock, nettles, knapweed. */
  const roadOff = Math.abs(x - (valleyAxis(z) + ROAD_DX));
  const verge = z > -2720 && z < ROAD_END + 4 && roadOff < VERGE[1] ? smoothstep(VERGE[0], VERGE[0] + 0.8, roadOff) : 0;
  const edge = Math.min(field ? field.edge : Infinity, fenceDist(x, z, layout.margins || []));
  const margin = field && field.plateau < 0.2 && !layout.lakeWet(x, z) ? 1 - smoothstep(0.6, 1.2, edge) : 0;
  const wild = Math.max(verge, margin) * (1 - forest);
  if (wild > 0.5) {
    c.h = Math.max(h, 0.55 + 0.25 * noise2(x / 9 + 1.7, z / 9 + 4.1));
    c.seeds = 0.05;
    c.weeds = 0.28 * smoothstep(0.4, 0.75, noise2(x / 13 + 5.5, z / 13 + 2.2) + 0.25);
    c.bloom = Math.max(c.bloom, 0.35);
    c.unmown = true;
  } else if (z > -2720 && z < ROAD_END + 4 && roadOff < VERGE[0] + 0.8) {
    c.h = 0.22;
    c.seeds = 0;
  }
  /* Beside the runway the grass is left long, knee high and flowering,
   * and where the aircraft stand and taxi it is trodden short. */
  if (air && air.rough > 0.3) {
    c.h = Math.max(c.h, 0.3 + 0.25 * air.rough * noise2(x / 6 + 2.3, z / 6 + 8.1));
    c.bloom = Math.max(c.bloom, 0.45 * air.rough);
    c.seeds = Math.max(c.seeds, 0.05 * air.rough);
    c.pasture = false;
  }
  if (air && air.worn > 0.3) {
    c.p *= 1 - 0.4 * air.worn;
    c.h = Math.min(c.h, 0.16);
  }
  return c;
}


/* A tile's clumps. `wide` scales the clumps' width, for the middle
 * distance's layer, whose clumps stand for a patch of meadow each. A
 * generator that yields after each row of its grid and returns the
 * clumps, so a tile can be worked out over several frames: one rng
 * drawn in the same order either way, so the clumps are the same
 * however many frames it took. */
function* buildTile(ti, tj, heightAt, layout, tile, spacing, wide) {
  const rng = makeRng((ti * 73856093) ^ (tj * 19349663) ^ 0x5bd1e995 ^ Math.round(tile * 7919));
  const out = [];
  const n = Math.floor(tile / spacing);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const x = ti * tile + (i + rng()) * spacing;
      const z = tj * tile + (j + rng()) * spacing;
      const c = coverAt(x, z, heightAt, layout);
      if (!c || rng() > c.p) {
        continue;
      }
      /* The middle distance's clumps each stand for a patch: in a drift
       * more of them are the drift's flowers. */
      const flower = rng() < c.bloom * (wide > 1 ? 0.65 : 0.4);
      /* In a drift most flowers are the drift's; a pasture's are
       * mostly dandelion and white clover (buttercup and daisy on the
       * atlas), with red clover and the odd harebell. */
      let tone = rng() < 0.75 ? c.tone : Math.floor(rng() * 4);
      if (c.pasture) {
        const t = rng();
        tone = t < 0.4 ? 0 : t < 0.75 ? 1 : t < 0.92 ? 2 : 3;
      } else if (c.unmown && tone === 1 && rng() < 0.7) {
        /* A margin's flowers are the tall coloured ones more than the
         * daisies: white in every clump read from the road as a verge
         * gone to seed. */
        tone = rng() < 0.5 ? 2 : 3;
      }
      const hay = rng() < c.seeds;
      const weed = !flower && rng() < c.weeds;
      let region = flower ? 6 + tone : hay ? 4 + Math.floor(rng() * 2) : Math.floor(rng() * 4);
      let h = (flower ? Math.max(0.3, c.h * 1.05) : c.h) * (0.7 + rng() * 0.6);
      let w = (flower ? 0.45 : 0.85 + rng() * 0.45) * wide;
      if (weed) {
        /* Dock and nettle, green, more often than the white umbels and
         * the knapweed. */
        const w4 = rng();
        region = WEED0 + (w4 < 0.14 ? 0 : w4 < 0.44 ? 1 : w4 < 0.76 ? 2 : 3);
        h = 0.85 + 0.65 * rng();
        w = (0.5 + 0.25 * rng()) * wide;
      }
      /* Seed heads a little darker than the blades' tint makes them: the
       * atlas's straw read nearly white in the sun. */
      const tint = (0.82 + rng() * 0.3) * (1 - 0.3 * c.forest) * (hay && region < WEED0 ? 0.85 : 1);
      out.push(x, heightAt(x, z) - 0.03, z, rng() * Math.PI * 2, h, w, region + (c.unmown ? UNMOWN : 0), tint);
      /* What lies flat under the blades, close to: the rosettes of a
       * plantain and a dandelion, clover creeping through, and where
       * the turf is cut and trodden short a bare scrape. Only where it
       * is short enough for them to be seen, and only in the near layer. */
      if (wide === 1 && c.h < 0.32 && rng() < c.flat) {
        const f = rng();
        const kind = f < c.bare ? 3 : f < c.bare + 0.3 ? 2 : f < c.bare + 0.62 ? 0 : 1;
        const size = kind === 3 ? 0.35 + 0.4 * rng() : kind === 2 ? 0.45 + 0.5 * rng() : 0.28 + 0.2 * rng();
        const fx = x + (rng() - 0.5) * spacing;
        const fz = z + (rng() - 0.5) * spacing;
        out.push(fx, heightAt(fx, fz) + 0.035, fz, rng() * Math.PI * 2, 1, size, FLAT0 + kind, 0.85 + 0.25 * rng());
      }
    }
    yield;
  }
  return Float32Array.from(out);
}

function finish(job) {
  for (;;) {
    const r = job.next();
    if (r.done) {
      return r.value;
    }
  }
}

/*
 * A layer of the meadow round the camera. `radius` is where it has
 * shrunk to nothing, `inner` the band [from, to] it grows in over from
 * nothing (none for the near layer, which starts at the camera),
 * `spacing` the jittered grid it is scattered on in tiles `tile` metres
 * square, `wide` the clumps' width against the near layer's, `cap` the
 * most clumps drawn at once, `cull` whether only the tiles in the
 * camera's view are drawn (the near layer draws round the camera, so a
 * turn needs no refill), `perFrame` how many new tiles that can show may
 * be worked out in one frame, `ceiling` the height over the ground it is
 * drawn up to, `ahead` how far past the drawn ring tiles are worked out
 * before they are needed and `buildMs` the main thread time a frame
 * gives that (see WORKED OUT AHEAD below). Returns the mesh (added to
 * group), update(camera), stats and dispose().
 */
export function buildGrass({
  heightAt, layout, atlas, wind, radius, spacing, cap, group, tint = [0.82, 0.95, 0.72],
  tile = 16, inner = [-2, -1], wide = 1, cull = false, perFrame = Infinity, ceiling = radius, name = 'swiss2-grass',
  craft = craftUniforms(), ahead = tile * 2, buildMs = 1,
}) {
  const base = clumpGeometry();
  const geo = new THREE.InstancedBufferGeometry();
  for (const k of ['position', 'uv', 'normal']) {
    geo.setAttribute(k, base.getAttribute(k));
  }
  geo.setIndex(base.getIndex());
  const data = new Float32Array(cap * STRIDE);
  const buf = new THREE.InstancedInterleavedBuffer(data, STRIDE);
  buf.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aClump', new THREE.InterleavedBufferAttribute(buf, 4, 0));
  geo.setAttribute('aClump2', new THREE.InterleavedBufferAttribute(buf, 4, 4));
  geo.instanceCount = 0;

  const mat = new THREE.MeshStandardMaterial({
    map: atlas,
    alphaTest: ALPHA_CUT,
    side: THREE.DoubleSide,
    roughness: 0.82,
    metalness: 0,
    envMapIntensity: 0.8,
  });
  const regions = REGION_KEYS.map((k) => {
    const r = GRASS_REGIONS[k];
    return new THREE.Vector4(r.u0, r.v0, r.du, r.dv);
  });
  const uniforms = {
    ...wind,
    uRegions: { value: regions },
    uRadius: { value: radius },
    uInner: { value: new THREE.Vector2(...inner) },
    uTint: { value: new THREE.Color(...tint) },
    ...craft,
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aClump;
        attribute vec4 aClump2;
        uniform float uTime;
        uniform vec2 uWindDir;
        uniform float uWind;
        uniform vec4 uRegions[${REGION_KEYS.length}];
        uniform float uRadius;
        uniform vec2 uInner;
        uniform vec3 uTint;
        ${MEADOW_GLSL}
        ${CRAFT_GLSL}
        varying vec3 vGrassTint;
        varying float vGrassUp;
        varying float vGrassCut;
        varying vec4 vGrassBloom;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        float gUnmown = step(${UNMOWN - 0.5}, aClump2.z);
        float gRegion = aClump2.z - ${UNMOWN}.0 * gUnmown;
        vec4 reg = uRegions[int(gRegion + 0.5)];
        vMapUv = reg.xy + uv * reg.zw;
        /* A flat plant is the first card laid on the turf; the other two
         * fold to nothing. */
        float gFlat = step(${FLAT0 - 0.5}, gRegion);`)
      .replace('#include <beginnormal_vertex>', `
        float gc = cos(aClump.w);
        float gs = sin(aClump.w);
        vec3 objectNormal = mix(vec3(gc * normal.x + gs * normal.z, normal.y, -gs * normal.x + gc * normal.z), vec3(0.0, 1.0, 0.0), gFlat);`)
      .replace('#include <begin_vertex>', `
        float gDist = distance(cameraPosition.xz, aClump.xz);
        /* Each clump has its own edge between two thirds of the radius
         * and all of it, so the meadow thins out rather than stopping. */
        float edge = uRadius * (0.67 + 0.33 * fract(aClump.x * 12.9898 + aClump.z * 78.233));
        float grow = (1.0 - smoothstep(edge * 0.75, edge, gDist)) * smoothstep(uInner.x, uInner.y, gDist);
        /* The field it stands in, as the ground paints it: its colour,
         * and on the valley floor cut short where the field is mown.
         * Worked out only for a clump that is drawn: one grown to
         * nothing, or a flat plant past where it shows, is folded to its
         * root below whatever the field says, and the field is most of
         * what this shader costs, once for every vertex. */
        bool gDrawn = gFlat > 0.5 ? smoothstep(14.0, 20.0, gDist) < 1.0 : grow > 0.0;
        S2Meadow field = S2Meadow(vec3(1.0), 0.0, 0.0, 0.0, 0.0, vec2(1.0, 0.0), 0.0, 0.0, vec2(0.0));
        if (gDrawn) {
          field = s2Meadow(aClump.xz, gDist);
        }
        float farmed = 1.0 - smoothstep(50.0, 140.0, aClump.y);
        float cut = mix(1.0, 0.32, field.mown * farmed * (1.0 - gUnmown));
        /* Pressed down under a craft at rest, and in its shade. */
        float gCraft = s2UnderCraft(aClump.xyz);
        grow *= cut * (1.0 - 0.6 * gCraft);
        /* A clump cut to the ankle is narrower too: cards a metre wide and
         * a hand high read from above as a floor of scalloped tiles. */
        vec3 p = position * vec3(aClump2.y * mix(0.45, 1.0, cut), aClump2.x * grow, aClump2.y * mix(0.45, 1.0, cut));
        if (gFlat > 0.5) {
          /* Seen only close to: past twenty metres a leaf on the turf is
           * the paint's business. */
          float gShown = (1.0 - smoothstep(14.0, 20.0, gDist)) * step(float(gl_VertexID), 3.5);
          p = vec3(uv.x - 0.5, 0.0, uv.y - 0.5) * aClump2.y * gShown;
          grow = gShown;
        }
        vec3 transformed = aClump.xyz + vec3(gc * p.x + gs * p.z, p.y, -gs * p.x + gc * p.z);
        /* Wind: waves of gusts rolling across the meadow downwind, the
         * blade tips bending most. */
        float along = dot(aClump.xz, uWindDir);
        float wave = 0.5 + 0.5 * sin(along * 0.23 - uTime * 2.1) * sin(along * 0.061 - uTime * 0.7 + aClump.x * 0.02);
        float bend = uv.y * uv.y * aClump2.x * uWind * (0.25 + 0.75 * wave) * 0.55;
        bend += uv.y * aClump2.x * 0.06 * sin(uTime * 3.3 + aClump.x * 1.3 + aClump.z * 1.7);
        bend *= 1.0 - gFlat;
        transformed.xz += uWindDir * bend;
        transformed.y -= abs(bend) * 0.35 * uv.y;
        vGrassTint = uTint * aClump2.w * mix(vec3(1.0), field.tint, farmed) * (1.0 - 0.5 * gCraft);
        /* Turf cut short is lit to its roots: dark at the foot, each short
         * clump read from above as a dark tuft. */
        vGrassUp = mix(mix(uv.y, 0.35 + 0.65 * uv.y, (1.0 - cut) / 0.68), 0.85, gFlat);
        /* A flower clump seen from afar is its flowers' colour more than
         * its leaves': in a hay meadow at a hundred metres the drifts
         * of buttercup, ox eye and clover read as colour laid over the
         * green, which the atlas's few heads, averaged to a pixel, lose. */
        float gTone = gRegion - 6.0;
        vec3 gBloom = gTone < 0.5 ? vec3(0.62, 0.46, 0.03) : gTone < 1.5 ? vec3(0.62, 0.62, 0.55) : gTone < 2.5 ? vec3(0.42, 0.13, 0.24) : vec3(0.2, 0.2, 0.46);
        vGrassBloom = vec4(gBloom, step(-0.5, gTone) * step(gTone, 3.5) * smoothstep(15.0, 80.0, gDist) * 0.7 * smoothstep(0.25, 0.85, uv.y));
        /* Turf cut this week shows the cut: the blades' tips straw. */
        vGrassCut = (1.0 - cut) / 0.68 * (1.0 - gFlat) * smoothstep(0.55, 1.0, uv.y);
        if (grow <= 0.0) transformed = aClump.xyz;`)
      .replace('#include <project_vertex>', `
        vec4 mvPosition = viewMatrix * vec4(transformed, 1.0);
        gl_Position = projectionMatrix * mvPosition;`)
      .replace('#include <worldpos_vertex>', `
        #if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
          vec4 worldPosition = vec4(transformed, 1.0);
        #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrassTint;\nvarying float vGrassUp;\nvarying float vGrassCut;\nvarying vec4 vGrassBloom;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= vGrassTint * mix(0.38, 1.0, smoothstep(0.0, 0.75, vGrassUp));
        diffuseColor.rgb *= mix(vec3(1.0), vec3(1.35, 1.2, 0.72), 0.45 * vGrassCut);
        diffuseColor.rgb = mix(diffuseColor.rgb, vGrassBloom.rgb, vGrassBloom.a);`)
      .replace('#include <normal_fragment_begin>', `
        float faceDirection = gl_FrontFacing ? 1.0 : -1.0;
        vec3 normal = normalize(vNormal);
        vec3 nonPerturbedNormal = normal;`)
      .replace('#include <lights_physical_fragment>', LEAF_SPEC_GLSL)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        #if NUM_DIR_LIGHTS > 0
        {
          vec3 L = directionalLights[0].direction;
          float into = pow(saturate(dot(-geometryViewDir, L)), 3.0);
          reflectedLight.directDiffuse += directionalLights[0].color * material.diffuseColor * 0.3 * (0.2 + into);
        }
        #endif`);
  };
  mat.customProgramCacheKey = () => 'swiss2-grass';
  thermalKind(mat, 'vegetation');
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = name;
  group.add(mesh);

  /* Tiles worked out, by tileId. A number, not a string: the ring ahead
   * is looked up every frame. i and j stay inside +-32767 on a valley
   * of a few kilometres. */
  const tiles = new Map();
  const tileId = (ti, tj) => (ti + 32768) * 65536 + (tj + 32768);
  /* The tile the ring was last chosen from (NaN: none), the ring
   * chosen then, and this frame's, as ti, tj pairs with their lengths.
   * Kept arrays, not a key string: the ring is looked at every frame,
   * and building its key was garbage every frame (docs/PERF.md P8). */
  const span = Math.ceil(radius / tile) + 1;
  let lastCi = NaN;
  let lastCj = NaN;
  const drawn = new Int32Array(2 * (2 * span + 1) ** 2);
  const wanted = new Int32Array(drawn.length);
  let drawnN = 0;
  let wantedN = 0;
  /* The draw holds what it should: false after a tile it draws was
   * worked out in the background, or a tile it should draw could not be. */
  let current = false;
  const wantedIds = new Set();
  /* The drawn ring's tiles left to the background because they could
   * not show when it was filled, as ti, tj pairs: watched each frame in
   * case the camera moved close enough for one to show before it was
   * worked out. */
  const waiting = [];
  const stats = {
    clumps: 0, tiles: 0, pending: 0, built: 0, forced: 0, buildMs: 0, maxFrameMs: 0,
  };
  const frustum = new THREE.Frustum();
  const viewProj = new THREE.Matrix4();
  const box = new THREE.Box3();
  const pos = new THREE.Vector3();
  /* A tile's box, from its corners' and middle's ground and the tallest
   * clump, for the frustum. */
  const tileBox = (ti, tj) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let k = 0; k < BOX_SAMPLES.length; k += 2) {
      const y = heightAt((ti + BOX_SAMPLES[k]) * tile, (tj + BOX_SAMPLES[k + 1]) * tile);
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
    box.min.set(ti * tile, lo - 2, tj * tile);
    box.max.set((ti + 1) * tile, hi + 3, (tj + 1) * tile);
    return box;
  };
  /*
   * WHICH TILES CAN SHOW. A clump is folded to its root in the shader
   * once it is further than its edge from the camera, and no edge is
   * past `radius`, so a tile whose nearest point is further than that
   * draws no pixel. Clumps stand inside their tile and the flat plants
   * up to half a spacing outside it, hence the pad. Every draw of this
   * mesh is from the camera update() is handed (the sensor view draws
   * the shell's camera, the lake's mirror reflects it in a level plane),
   * so a tile that cannot show here cannot show in any of them.
   */
  const canShow = (ti, tj, px, pz) => {
    const dx = Math.max(ti * tile - spacing - px, 0, px - (ti + 1) * tile - spacing);
    const dz = Math.max(tj * tile - spacing - pz, 0, pz - (tj + 1) * tile - spacing);
    return Math.hypot(dx, dz) < radius;
  };
  /*
   * WORKED OUT AHEAD, IN THE BACKGROUND. Every tile out to `ahead`
   * metres past the drawn ring is worked out a few rows at a time
   * within `buildMs` of each frame, nearest first, so by the time a
   * tile can show it is already there. A tile that can show and is not
   * there yet (a respawn, a camera cut, flying faster than the
   * background keeps up) is worked out in the frame that needs it, as
   * it always was, so what is drawn never waits on the background.
   * The candidates are listed again only when the camera crosses into
   * another tile; `job` is the one tile in progress.
   */
  const reach = radius + tile * 0.75 + ahead;
  const budget = { ms: buildMs };
  let candidates = [];
  let next = 0;
  let candCi = NaN;
  let candCj = NaN;
  let job = null;
  const listCandidates = (ci, cj, px, pz) => {
    candCi = ci;
    candCj = cj;
    const span = Math.ceil(reach / tile) + 1;
    const list = [];
    for (let dj = -span; dj <= span; dj += 1) {
      for (let di = -span; di <= span; di += 1) {
        const d = Math.hypot((ci + di + 0.5) * tile - px, (cj + dj + 0.5) * tile - pz);
        if (d <= reach) {
          list.push([d, ci + di, cj + dj]);
        }
      }
    }
    list.sort((a, b) => a[0] - b[0]);
    candidates = list;
    next = 0;
  };
  const background = () => {
    const t0 = performance.now();
    while (performance.now() - t0 < budget.ms) {
      if (!job) {
        while (next < candidates.length && tiles.has(tileId(candidates[next][1], candidates[next][2]))) {
          next += 1;
        }
        if (next >= candidates.length) {
          break;
        }
        const [, ti, tj] = candidates[next];
        job = { id: tileId(ti, tj), rows: buildTile(ti, tj, heightAt, layout, tile, spacing, wide) };
      }
      const r = job.rows.next();
      if (r.done) {
        tiles.set(job.id, r.value);
        stats.built += 1;
        if (wantedIds.has(job.id)) {
          current = false;
        }
        job = null;
      }
    }
    const ms = performance.now() - t0;
    stats.buildMs += ms;
    stats.maxFrameMs = Math.max(stats.maxFrameMs, ms);
  };
  /* A tile the draw needs now: the one in progress finished, or a new
   * one worked out whole. */
  const buildNow = (ti, tj, id) => {
    const t0 = performance.now();
    let t;
    if (job && job.id === id) {
      t = finish(job.rows);
      job = null;
    } else {
      t = finish(buildTile(ti, tj, heightAt, layout, tile, spacing, wide));
    }
    tiles.set(id, t);
    stats.built += 1;
    stats.forced += 1;
    const ms = performance.now() - t0;
    stats.buildMs += ms;
    stats.maxFrameMs = Math.max(stats.maxFrameMs, ms);
    return t;
  };
  const update = (camera) => {
    camera.getWorldPosition(pos);
    const px = pos.x;
    const pz = pos.z;
    const ci = Math.floor(px / tile);
    const cj = Math.floor(pz / tile);
    const above = pos.y - heightAt(px, pz);
    /* Up to `ahead` over the ceiling the tiles round the camera are
     * still worked out in the background: a wing cruising just over it
     * dips under, and found every tile in reach to work out at once. */
    if (above <= ceiling + ahead) {
      if (ci !== candCi || cj !== candCj) {
        listCandidates(ci, cj, px, pz);
      }
      background();
    }
    /* Above the ceiling there is nothing to draw, or nothing worth it:
     * a clump seen from above is a star of cards, not a tuft. */
    if (above > ceiling) {
      geo.instanceCount = 0;
      lastCi = NaN;
      return;
    }
    wantedN = 0;
    if (cull) {
      camera.updateMatrixWorld();
      viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(viewProj);
    }
    for (let dj = -span; dj <= span; dj += 1) {
      for (let di = -span; di <= span; di += 1) {
        const ti = ci + di;
        const tj = cj + dj;
        const cx = (ti + 0.5) * tile - px;
        const cz = (tj + 0.5) * tile - pz;
        if (Math.hypot(cx, cz) > radius + tile * 0.75) {
          continue;
        }
        if (cull && !frustum.intersectsBox(tileBox(ti, tj))) {
          continue;
        }
        wanted[wantedN] = ti;
        wanted[wantedN + 1] = tj;
        wantedN += 2;
      }
    }
    let same = ci === lastCi && cj === lastCj;
    if (same && cull) {
      same = wantedN === drawnN;
      for (let k = 0; same && k < wantedN; k += 1) {
        same = wanted[k] === drawn[k];
      }
    }
    for (let k = 0; current && k < waiting.length; k += 2) {
      if (!tiles.has(tileId(waiting[k], waiting[k + 1])) && canShow(waiting[k], waiting[k + 1], px, pz)) {
        current = false;
      }
    }
    if (same && current) {
      return;
    }
    /* The ring drawn is the one worked out when the camera crossed into
     * its tile (or, culled, turned onto new ones), as it always was:
     * a refill for a tile the background finished uses that ring, not
     * one round where the camera has got to since, which would draw
     * tiles at the ring's leading edge a crossing early, at a moment
     * that depends on how fast the background ran. */
    if (!same) {
      lastCi = ci;
      lastCj = cj;
      for (let k = 0; k < wantedN; k += 1) {
        drawn[k] = wanted[k];
      }
      drawnN = wantedN;
    }
    let n = 0;
    let built = 0;
    let pending = 0;
    let retry = false;
    wantedIds.clear();
    waiting.length = 0;
    for (let k = 0; k < drawnN; k += 2) {
      const ti = drawn[k];
      const tj = drawn[k + 1];
      const id = tileId(ti, tj);
      wantedIds.add(id);
      let t = tiles.get(id);
      if (!t) {
        /* One that cannot show is left to the background. One that can
         * is worked out now, a few a frame where `perFrame` says so, so
         * a fast pass over new ground fills in over a few frames
         * instead of stalling one. */
        if (!canShow(ti, tj, px, pz)) {
          waiting.push(ti, tj);
          pending += 1;
          continue;
        }
        if (built >= perFrame) {
          retry = true;
          pending += 1;
          continue;
        }
        t = buildNow(ti, tj, id);
        built += 1;
      }
      const room = Math.min(t.length, (cap - n) * STRIDE);
      data.set(t.subarray(0, room), n * STRIDE);
      n += room / STRIDE;
    }
    current = !retry;
    /* Tiles well out of range are forgotten, so a long flight does not
     * keep the whole valley's grass. What is kept is what the draw and
     * the ring ahead want. */
    if (tiles.size > Math.max(wantedIds.size, candidates.length, 64) * 3) {
      const keep = new Set(wantedIds);
      for (const [, ti, tj] of candidates) {
        keep.add(tileId(ti, tj));
      }
      for (const k of tiles.keys()) {
        if (!keep.has(k)) {
          tiles.delete(k);
        }
      }
    }
    geo.instanceCount = n;
    buf.clearUpdateRanges();
    buf.addUpdateRange(0, n * STRIDE);
    buf.needsUpdate = true;
    stats.clumps = n;
    stats.tiles = wantedIds.size;
    stats.pending = pending;
  };
  /* For scripts/perf-play.js and the checks, which find the layer by
   * its mesh's name. */
  mesh.userData.grassStats = stats;
  /* scripts/perf-grass-check.js slows the background with this, so the
   * drawn ring's tiles finish mid tile and the refills that follow are
   * exercised every run rather than when the timing happens to fall so. */
  mesh.userData.grassBudget = budget;
  return {
    mesh,
    update,
    stats,
    dispose() {
      geo.dispose();
      base.dispose();
      mat.dispose();
    },
  };
}
