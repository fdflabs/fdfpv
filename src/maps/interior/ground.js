/*
 * ground.js: the Interior's ground material, coloured from the land cover
 * (src/share/interior/land.bin with places.js's painting over it), never
 * from a satellite photograph.
 *
 * WHY NOT IMAGERY. Itaipu's ground is a Sentinel-2 picture, which is the
 * right answer for a real place and the wrong one here: at 10 m it shows
 * the source area's real roads, farmsteads and field tracks, which the
 * owner's rule forbids (docs/campaign/interior/PLAN.md section 1) and
 * which would let anyone lay the map over the real land. So the ground
 * is the land cover's classes, each a measured colour, with the farm
 * laid over them invented: fields, paddocks, tracks and tree lines drawn
 * from hashes, so nothing in them is the source's. Roads, the river and
 * everything built are drawn on top (ribbons.js, built.js),
 * where places.js puts them.
 *
 * THE FARM. The cropland and pasture are cut into fields the way the
 * region's land is: blocks a few kilometres across (a jittered grid's
 * nearest cells), each turned to its own bearing and cut into strips a
 * few hundred metres wide, each strip into fields of its own length. A
 * field is ploughed red earth, stubble, young soy or maize on cropland,
 * a paddock grazed hard or lightly on pasture. Its edges are fence
 * lines, earth tracks or tree lines, the tree lines throwing the low
 * sun's shadow. Inside a field the rows and furrows run along it, the
 * headlands across, at two scales: the metre rows a pilot sees low, the
 * passes of a tractor ten metres apart that a survey camera sees.
 *
 * DETAIL BY FOOTPRINT. Which detail draws is chosen by how many metres a
 * pixel covers (fwidth of the world position), not by the camera's
 * distance: the camera ball's 8x at 500 m sees the grain a man at 2 m
 * does, and a stripe fades to its mean before it is fine enough to
 * alias.
 *
 * PAST THE DATA'S SQUARE the land cover is invented from noise in the
 * same classes, blended in over the square's last kilometre, so the
 * ground runs on to the horizon instead of repeating its edge cells.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';
import { HALF, L_CELL, L_N } from '../../share/interior/frame.js';
import { LAND } from '../../share/interior/world.js';
import { thermalKind } from '../../render/thermal.js';

/*
 * Linear reflectance per class, and the photographed layer
 * (itaipu/look/ground.js LAYERS: 0 litter, 1 grass, 2 sparse grass,
 * 3 laterite, 4 tracks) that gives it its grain close up. Crop and
 * pasture are the farm's (inCrop, inPasture); their col is the mean the
 * invented land past the square uses for its far blend.
 */
const CLASS = [];
CLASS[LAND.water] = { col: [0.1, 0.075, 0.05], layer: 3 };
CLASS[LAND.forest] = { col: [0.03, 0.048, 0.018], layer: 0 };
CLASS[LAND.pasture] = { col: [0.085, 0.088, 0.04], layer: 1 };
CLASS[LAND.crop] = { col: [0.11, 0.085, 0.05], layer: 2 };
CLASS[LAND.shrub] = { col: [0.06, 0.068, 0.03], layer: 2 };
CLASS[LAND.wetland] = { col: [0.05, 0.07, 0.038], layer: 1 };
CLASS[LAND.bare] = { col: [0.15, 0.082, 0.046], layer: 3 };
CLASS[LAND.built] = { col: [0.16, 0.09, 0.05], layer: 4 };
CLASS[LAND.burned] = { col: [0.05, 0.04, 0.031], layer: 3 };

const v3 = (c) => `vec3(${c.map((x) => x.toFixed(4)).join(', ')})`;
const f1 = (x) => x.toFixed(1);

const GLSL = /* glsl */ `
uniform highp usampler2D uLand;
uniform sampler2D uNoise;
uniform highp sampler2DArray uLayerCol;
uniform vec3 uSunDir;
varying vec3 vInWorld;

float inHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec4 inTex(vec2 w, float m, float o) {
  return texture(uNoise, w / (256.0 * m) + o);
}
/* Value noise in three octaves, 0 to 1, its coarsest m metres a texel. */
float inFbm(vec2 w, float m) {
  return inTex(w, m, 0.13).r * 0.5 + inTex(w, m * 0.43, 0.61).g * 0.3 + inTex(w, m * 0.19, 0.37).b * 0.2;
}
/* A stripe of period p metres across coordinate s, -1 to 1, faded to
 * nothing as a pixel's footprint fp nears the period. */
float inRows(float s, float p, float fp) {
  float fade = 1.0 - smoothstep(0.2 * p, 0.55 * p, fp);
  return fade > 0.0 ? sin(s * 6.2831853 / p) * fade : 0.0;
}
/* How much of a pixel of footprint fp a band of half width hw centred
 * at distance 0 covers, at distance d from its centre line. */
float inBand(float d, float hw, float fp) {
  float e = max(fp, 0.05);
  return clamp((hw + e * 0.5 - abs(d)) / e, 0.0, 1.0) * min(1.0, 2.0 * hw / e + 0.15);
}

/* The farm at w: which field, its local frame and its edges. */
struct InField {
  vec2 id;      /* the field's own hash key */
  vec2 uv;      /* metres in the block's frame: u across the strips, v along */
  float eu;     /* metres to the strip's side edge, signed into the field */
  float ev;     /* metres to the field's end edge */
  float eb;     /* metres to the block's edge */
  vec2 nu;      /* the strips' across direction, world xz */
  vec2 nb;      /* the block edge's normal, toward this block */
  float su;     /* which side of the strip edge: -1 or 1 */
  float sv;     /* which end of the field: -1 or 1 */
  float sb;     /* the hash of the block edge */
  float side;   /* the hash of the nearer strip edge */
  float end;    /* the hash of the nearer end edge */
  float wide;   /* the strip's width */
  vec2 centre;  /* the field's middle, world xz */
};

InField inFarm(vec2 w) {
  /* The blocks: nearest of a jittered 2.6 km grid, and the distance to
   * the edge with the next nearest. */
  vec2 g = w / 2600.0;
  vec2 c0 = floor(g);
  float best = 1e9;
  vec2 bid = c0;
  vec2 bp = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = c0 + vec2(float(i), float(j));
      vec2 p = c + 0.15 + 0.7 * vec2(inHash(c + 3.1), inHash(c + 7.7));
      float d = dot(g - p, g - p);
      if (d < best) { best = d; bid = c; bp = p; }
    }
  }
  float eb = 1e9;
  vec2 nb = vec2(1.0, 0.0);
  float sb = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = c0 + vec2(float(i), float(j));
      if (c == bid) { continue; }
      vec2 p = c + 0.15 + 0.7 * vec2(inHash(c + 3.1), inHash(c + 7.7));
      vec2 n = normalize(bp - p);
      float d = dot(g - (bp + p) * 0.5, n) * 2600.0;
      if (d < eb) { eb = d; nb = n; sb = inHash(bid + c + 51.0); }
    }
  }
  /* The block's bearing, mostly near the roads' north east run, and its
   * strips. */
  float a = 0.35 + (inHash(bid + 11.0) - 0.5) * 1.3;
  vec2 nu = vec2(cos(a), sin(a));
  vec2 nv = vec2(-nu.y, nu.x);
  vec2 uv = vec2(dot(w, nu), dot(w, nv)) + inHash(bid + 5.0) * 977.0;
  float W = mix(180.0, 460.0, inHash(bid + 23.0));
  float col = floor(uv.x / W);
  float fu = uv.x / W - col;
  float L = mix(260.0, 1100.0, inHash(vec2(col, 0.5) + bid * 13.0));
  float vv = uv.y + inHash(vec2(col, 1.5) + bid * 13.0) * L;
  float row = floor(vv / L);
  float fv = vv / L - row;
  InField f;
  f.id = bid * 61.0 + vec2(col, row);
  f.uv = uv;
  f.eu = min(fu, 1.0 - fu) * W;
  f.su = fu < 0.5 ? -1.0 : 1.0;
  f.ev = min(fv, 1.0 - fv) * L;
  f.sv = fv < 0.5 ? -1.0 : 1.0;
  f.eb = eb;
  f.nu = nu;
  f.nb = nb;
  f.sb = sb;
  f.side = inHash(bid * 7.0 + vec2(col + (fu < 0.5 ? 0.0 : 1.0), 9.5));
  f.end = inHash(bid * 7.0 + vec2(col, row + (fv < 0.5 ? 0.0 : 1.0)) + 0.5);
  f.wide = W;
  vec2 cuv = vec2((col + 0.5) * W, (row + 0.5) * L - inHash(vec2(col, 1.5) + bid * 13.0) * L) - inHash(bid + 5.0) * 977.0;
  f.centre = nu * cuv.x + nv * cuv.y;
  return f;
}

/* The red earth of the region's tracks and ploughed land. */
const vec3 IN_EARTH = vec3(0.13, 0.071, 0.043);
const vec3 IN_DUST = vec3(0.17, 0.115, 0.075);

/* Cropland: what the field is this week of the dry season's end, and the
 * rows across it. */
vec3 inCrop(InField f, vec2 w, float fp) {
  float h = inHash(f.id + 17.0);
  /* Rows along the field, the headlands' passes across its ends. */
  bool head = f.ev < 14.0;
  float s = head ? f.uv.y : f.uv.x;
  float pass = inRows(s, 11.0, fp);
  float rows = inRows(s, 0.76, fp);
  float moist = inFbm(w, 31.0);
  vec3 col;
  if (h < 0.22) {
    /* Ploughed or no-till red earth, darker where it holds moisture. */
    col = IN_EARTH * (0.78 + 0.32 * moist) * (1.0 + 0.07 * pass + 0.22 * rows);
  } else if (h < 0.55) {
    /* Stubble: the harvester's swaths alternately catching the light,
     * more in some places than others. */
    vec3 straw = vec3(0.16, 0.125, 0.075);
    float sheen = 0.04 + 0.08 * inFbm(w, 19.0);
    col = straw * (0.85 + 0.22 * moist) * (1.0 + sheen * inRows(s, 9.0, fp) + 0.03 * rows);
  } else if (h < 0.82) {
    /* Young soy in rows over the red earth, fuller where it is wetter. */
    vec3 leaf = vec3(0.05, 0.085, 0.03);
    float cover = clamp(0.45 + 0.4 * moist + 0.45 * rows, 0.0, 1.0);
    col = mix(IN_EARTH * 0.9, leaf, cover) * (1.0 + 0.05 * pass);
  } else {
    /* Maize or wheat, green going to straw. */
    vec3 green = vec3(0.07, 0.09, 0.035);
    vec3 dry = vec3(0.13, 0.11, 0.06);
    col = mix(green, dry, inHash(f.id + 4.0)) * (0.9 + 0.15 * moist) * (1.0 + 0.06 * pass + 0.12 * rows);
  }
  return col;
}

/* Pasture: a paddock grazed its own way, the cattle's tracks wandering
 * across it, bare ground at the gate, termite mounds. */
vec3 inPasture(InField f, vec2 w, float fp) {
  float h = inHash(f.id + 29.0);
  vec3 green = vec3(0.07, 0.092, 0.036);
  vec3 straw = vec3(0.12, 0.105, 0.058);
  float big = inFbm(w, 47.0);
  vec3 col = mix(green, straw, clamp(h * 1.1 - 0.15 + (big - 0.5) * 1.1, 0.0, 1.0));
  col *= 0.88 + 0.24 * inTex(w, 3.1, 0.41).b;
  /* Tracks: contour lines of a slow noise, a metre wide. */
  float n = inTex(w, 70.0, 0.27).r * 0.65 + inTex(w, 23.0, 0.83).g * 0.35;
  float grad = max(fwidth(n) / max(fp, 0.01), 2e-4);
  float track = 0.0;
  for (int k = 0; k < 3; k++) {
    float lev = 0.38 + 0.12 * float(k);
    track = max(track, inBand((n - lev) / grad, 0.55, fp));
  }
  col = mix(col, IN_DUST * 0.85, track * 0.75);
  /* Trodden bare round the paddock's corners, where the gate and the
   * water are. */
  float corner = length(vec2(f.eu, f.ev));
  col = mix(col, IN_DUST * 0.8, (1.0 - smoothstep(12.0, 45.0 + 20.0 * big, corner)) * 0.8);
  /* Termite mounds, a metre across, one in a 14 m square now and then. */
  vec2 mc = floor(w / 14.0);
  if (inHash(mc + 71.0) > 0.86) {
    vec2 mp = (mc + 0.2 + 0.6 * vec2(inHash(mc + 2.0), inHash(mc + 5.0))) * 14.0;
    col = mix(col, IN_EARTH * 1.1, inBand(length(w - mp), 0.55, fp));
  }
  return col;
}

/* The forest from above where no tree is drawn: crowns' light and shade
 * at their own scale, toward the canopy's mean colour as the pixel grows. */
vec3 inForest(vec2 w, float fp) {
  float crowns = inTex(w, 4.5, 0.53).r * 0.6 + inTex(w, 1.9, 0.19).g * 0.4;
  float fade = 1.0 - smoothstep(3.0, 12.0, fp);
  float patchy = inFbm(w, 37.0);
  vec3 col = ${v3(CLASS[LAND.forest].col)} * (0.8 + 0.45 * patchy);
  return col * (1.0 + (crowns - 0.5) * 0.9 * fade);
}

bool inIsFarm(uint k) {
  return k == ${LAND.crop}u || k == ${LAND.pasture}u;
}
vec3 inClass(uint k, vec3 farm, vec2 w, float fp) {
  if (inIsFarm(k)) { return farm; }
  if (k == ${LAND.forest}u) { return inForest(w, fp); }
  if (k == ${LAND.burned}u) { return ${v3(CLASS[LAND.burned].col)} * (0.7 + 0.6 * inFbm(w, 6.0)); }
  ${CLASS.map((c, k) => `if (k == ${k}u) { return ${v3(c.col)}; }`).join('\n  ')}
  return vec3(0.08);
}
int inLayer(uint k) {
  ${CLASS.map((c, k) => `if (k == ${k}u) { return ${c.layer}; }`).join('\n  ')}
  return 1;
}

/* The invented land past the data's square: forest, pasture and crop
 * from slow noise, in about the square's own shares. */
uint inBeyond(vec2 w) {
  float n = inFbm(w, 260.0) * 0.7 + inFbm(w + 913.0, 61.0) * 0.3;
  if (n > 0.55) { return ${LAND.forest}u; }
  return inFbm(w + 377.0, 410.0) > 0.56 ? ${LAND.crop}u : ${LAND.pasture}u;
}
uint inCell(ivec2 c, vec2 w) {
  ivec2 hi = ivec2(${L_N - 1});
  if (any(lessThan(c, ivec2(0))) || any(greaterThan(c, hi))) {
    return inBeyond(w);
  }
  return texelFetch(uLand, c, 0).r;
}

/* What lines a field's edge: a fence's uncut grass, an earth track or a
 * tree line, by the edge's hash; the colour over col and the shadow a
 * tree line throws on the side away from the sun. */
vec3 inEdge(vec3 col, float d, vec2 n, float h, float fp, float isField, inout float shade) {
  if (h < 0.18) {
    /* A tree line, its trees about 12 m tall. */
    float hw = 4.0;
    col = mix(col, ${v3(CLASS[LAND.forest].col)} * 1.3, inBand(d, hw, fp));
    vec2 s = normalize(uSunDir.xz + vec2(1e-4));
    float toward = dot(n, s);
    /* d grows into the field from the line; the shadow lies on the side
     * the sun is not, as long as the trees' height over the sun's
     * tangent, foreshortened by the line's bearing to the sun. */
    float len = 12.0 / max(uSunDir.y, 0.08) * abs(toward);
    if (toward < 0.0 && d > hw) {
      shade *= mix(1.0, 0.72, 1.0 - smoothstep(len * 0.5, len, d - hw));
    }
  } else if (h < 0.45 && isField > 0.5) {
    /* An earth track, its dusty verge either side. */
    col = mix(col, IN_DUST, inBand(d, 3.8, fp) * 0.7);
    col = mix(col, IN_EARTH * 1.15, inBand(d, 2.0, fp));
  } else {
    col = mix(col, vec3(0.06, 0.075, 0.032), inBand(d, 1.2, fp) * 0.6);
  }
  return col;
}
`;

/* The land cover as an unsigned byte texture, one texel a 10 m cell, row
 * 0 the data's north edge (z = -HALF). */
export function landTexture(cells) {
  const t = new THREE.DataTexture(cells, L_N, L_N, THREE.RedIntegerFormat, THREE.UnsignedByteType);
  t.internalFormat = 'R8UI';
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}

/*
 * The land cover cells with places.js's painting over them (Pista Cero's
 * strip, the burned field, the camp's clearing, the colonia's yards), so
 * the ground draws what world.landAt tells the room. `world` is
 * world.js's makeWorld with `edits`. About 0.1 s: once, at load.
 */
export function paintedLand(world) {
  const out = new Uint8Array(world.land);
  for (let j = 0; j < L_N; j += 1) {
    const z = -HALF + (j + 0.5) * L_CELL;
    for (let i = 0; i < L_N; i += 1) {
      out[j * L_N + i] = world.landAt(-HALF + (i + 0.5) * L_CELL, z);
    }
  }
  return out;
}

/*
 * The material: `land` landTexture's, `arrays` itaipu/look/ground.js
 * loadGroundArrays's, `noise` its noiseTexture's, `sunDir` the live
 * Vector3 toward the sun (look.js moves it); the caller owns them.
 */
export function groundMaterial({
  land, arrays, noise, sunDir,
}) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uLand = { value: land };
    shader.uniforms.uNoise = { value: noise };
    shader.uniforms.uLayerCol = { value: arrays.col };
    shader.uniforms.uSunDir = { value: sunDir };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vInWorld;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vInWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec2 w = vInWorld.xz;
          /* Metres a pixel covers, the detail's measure. */
          vec2 dw = fwidth(w);
          float fp = max(dw.x, dw.y);
          InField f = inFarm(w);
          /* The lookup bent up to 7 m, so an edge on the 10 m cells is ragged. */
          vec2 bend = (vec2(inTex(w, 23.0, 0.31).r, inTex(w, 23.0, 0.77).g) - 0.5) * 14.0;
          vec2 g = (w + bend + ${f1(HALF)}) / ${f1(L_CELL)} - 0.5;
          ivec2 c = ivec2(floor(g));
          vec2 t = fract(g);
          uint k00 = inCell(c, w);
          uint k10 = inCell(c + ivec2(1, 0), w);
          uint k01 = inCell(c + ivec2(0, 1), w);
          uint k11 = inCell(c + ivec2(1, 1), w);
          /* Past the square the invented land, blended in over its last
           * kilometre so no edge shows. */
          float beyond = smoothstep(${f1(HALF - 1000)}, ${f1(HALF)}, max(abs(w.x), abs(w.y)));
          if (beyond > 0.0) {
            uint kb = inBeyond(w);
            float pick = inTex(w, 9.0, 0.71).a;
            if (pick < beyond) { k00 = kb; k10 = kb; k01 = kb; k11 = kb; }
          }
          uint kk = t.x < 0.5 ? (t.y < 0.5 ? k00 : k01) : (t.y < 0.5 ? k10 : k11);
          /* A field is one thing from edge to edge: crop or pasture as
           * the land cover has its middle, wherever the cover says farm. */
          uint kf = inCell(ivec2(floor((f.centre + ${f1(HALF)}) / ${f1(L_CELL)})), f.centre);
          if (!inIsFarm(kf)) { kf = kk == ${LAND.crop}u ? kk : ${LAND.pasture}u; }
          vec3 farm = kf == ${LAND.crop}u ? inCrop(f, w, fp) : inPasture(f, w, fp);
          vec3 col = mix(mix(inClass(k00, farm, w, fp), inClass(k10, farm, w, fp), t.x),
            mix(inClass(k01, farm, w, fp), inClass(k11, farm, w, fp), t.x), t.y);
          float shade = 1.0;
          if (inIsFarm(kk)) {
            float isCrop = kf == ${LAND.crop}u ? 1.0 : 0.0;
            /* The nearest edge of the three, each lined its own way. */
            col = inEdge(col, f.eu, f.nu * -f.su, f.side, fp, 1.0, shade);
            col = inEdge(col, f.ev, vec2(-f.nu.y, f.nu.x) * -f.sv, f.end + 0.25 * (1.0 - isCrop), fp, isCrop, shade);
            col = inEdge(col, f.eb, f.nb, f.sb * 0.6, fp, 1.0, shade);
          }
          /* Patches: dry against lush over tens of metres. */
          float big = inTex(w, 41.0, 0.13).r * 0.6 + inTex(w, 13.0, 0.57).g * 0.4;
          col *= mix(vec3(0.92, 1.03, 0.95), vec3(1.1, 1.03, 0.92), smoothstep(0.25, 0.75, big));
          /* Clumps and bare spots at a metre or two, for the zooms. */
          float clump = inTex(w, 0.9, 0.29).g * 0.6 + inTex(w, 0.37, 0.91).r * 0.4;
          col *= 1.0 + (clump - 0.5) * 0.35 * (1.0 - smoothstep(0.6, 3.0, fp));
          /* The photographed grain at a few centimetres a pixel, as a
           * ratio to its own mean so the class's colour holds. */
          float near = 1.0 - smoothstep(0.06, 0.45, fp);
          if (near > 0.0) {
            int layer = inLayer(kk);
            vec3 grain = texture(uLayerCol, vec3(w / 2.0, float(layer))).rgb;
            vec3 mean = textureLod(uLayerCol, vec3(0.5, 0.5, float(layer)), 12.0).rgb;
            col *= mix(vec3(1.0), clamp(grain / max(mean, vec3(0.01)), 0.3, 2.2), near * 0.8);
          }
          diffuseColor.rgb = col * shade;
        }`);
  };
  m.customProgramCacheKey = () => 'interior-ground';
  m.name = 'interior-ground';
  return thermalKind(m, 'vegetation');
}
