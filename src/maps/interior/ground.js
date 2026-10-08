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
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';
import { HALF, L_CELL, L_N } from '../../share/interior/frame.js';
import { LAND } from '../../share/interior/world.js';
import { LAND_EDITS, opened } from '../../share/interior/places.js';
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
CLASS[LAND.forest] = { col: [0.034, 0.052, 0.02], layer: 0 };
CLASS[LAND.pasture] = { col: [0.06, 0.098, 0.034], layer: 1 };
CLASS[LAND.crop] = { col: [0.11, 0.085, 0.05], layer: 2 };
CLASS[LAND.shrub] = { col: [0.06, 0.068, 0.03], layer: 2 };
CLASS[LAND.wetland] = { col: [0.05, 0.07, 0.038], layer: 1 };
CLASS[LAND.bare] = { col: [0.12, 0.06, 0.032], layer: 3 };
CLASS[LAND.built] = { col: [0.16, 0.09, 0.05], layer: 4 };
CLASS[LAND.burned] = { col: [0.058, 0.05, 0.04], layer: 3 };

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
/* The same rows as the planter leaves them: their line bent a little by
 * a slow noise, and coming and going over a few metres where the earth
 * is cloddy or the crop has closed, so no field is a perfect ruled
 * sheet (round 5's zooms were). */
float inRowsWorn(float s, float p, float fp, vec2 w) {
  float bent = s + (inTex(w, 6.0, 0.23).r - 0.5) * p * 1.6;
  float keep = smoothstep(0.25, 0.7, inFbm(w + 97.0, 3.5));
  return inRows(bent, p, fp) * (0.2 + 0.8 * keep) * 0.7;
}
/* The ground at a zoom's scale, between the clumps at a metre and the
 * patches at tens of metres: worn bare patches, clods and the damp's
 * darker hollows at 2 to 8 m, as a ratio round 1, fully there under a
 * metre a pixel and faded, never gone, by 8 m. */
float inMottle(vec2 w, float fp) {
  float n = inFbm(w + 31.0, 7.0);
  return 1.0 + (n - 0.5) * 0.7 * (1.0 - 0.6 * smoothstep(1.0, 8.0, fp));
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
  float tu;     /* metres across to the field's own track along it */
  float track;  /* whether the field has a track, 0 or 1 */
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
  /* A strip is sometimes one field with the next, and a field with the
   * one beyond its end, so a block's fields are not all one width and
   * the sizes run from one strip's to four times it (round 3's equal
   * strips read as a printed grid at range). */
  float col = floor(uv.x / W);
  float pairU = floor(col * 0.5);
  float spanU = inHash(vec2(pairU, 2.5) + bid * 13.0) < 0.35 ? 2.0 : 1.0;
  col = spanU > 1.5 ? pairU * 2.0 : col;
  float fu = (uv.x / W - col) / spanU;
  float L = mix(260.0, 1100.0, inHash(vec2(col, 0.5) + bid * 13.0));
  float vv = uv.y + inHash(vec2(col, 1.5) + bid * 13.0) * L;
  float row = floor(vv / L);
  float pairV = floor(row * 0.5);
  float spanV = inHash(vec2(col, pairV) + bid * 17.0) < 0.3 ? 2.0 : 1.0;
  row = spanV > 1.5 ? pairV * 2.0 : row;
  float fv = (vv / L - row) / spanV;
  InField f;
  f.id = bid * 61.0 + vec2(col, row);
  f.uv = uv;
  f.eu = min(fu, 1.0 - fu) * W * spanU;
  f.su = fu < 0.5 ? -1.0 : 1.0;
  f.ev = min(fv, 1.0 - fv) * L * spanV;
  f.sv = fv < 0.5 ? -1.0 : 1.0;
  f.eb = eb;
  f.nu = nu;
  f.nb = nb;
  f.sb = sb;
  f.side = inHash(bid * 7.0 + vec2(col + (fu < 0.5 ? 0.0 : spanU), 9.5));
  f.end = inHash(bid * 7.0 + vec2(col, row + (fv < 0.5 ? 0.0 : spanV)) + 0.5);
  f.wide = W * spanU;
  f.tu = (fu - (0.2 + 0.6 * inHash(f.id + 83.0))) * W * spanU;
  f.track = inHash(f.id + 89.0) < 0.35 ? 1.0 : 0.0;
  vec2 cuv = vec2((col + 0.5 * spanU) * W, (row + 0.5 * spanV) * L - inHash(vec2(col, 1.5) + bid * 13.0) * L) - inHash(bid + 5.0) * 977.0;
  f.centre = nu * cuv.x + nv * cuv.y;
  return f;
}

/* The red earth of the region's tracks and ploughed land: a dry, dusty
 * red brown. Round 3's (0.13, 0.071, 0.043) printed maroon blocks at
 * range once the grade's saturation was on it; the reference aerials'
 * worked fields are a browner red, paler where they are dry. */
const vec3 IN_EARTH = vec3(0.145, 0.1, 0.07);
const vec3 IN_DUST = vec3(0.19, 0.14, 0.095);
/* The cattle's trodden earth in a paddock, darker than a track's packed
 * dust: at the dust's lightness the paddocks' trails printed as contour
 * lines across low-colonia's pasture. */
const vec3 IN_TRAIL = vec3(0.17, 0.115, 0.075);

/*
 * What a field shows a survey camera, a kilometre off at 2 to 10 m a
 * pixel, where its rows and passes have faded to their mean: the soil
 * and the crop's own patches over a hundred metres and more (wetter
 * hollows, a sandier rise, a corner sown late), stronger in some fields
 * than others, and the harvester's or the planter's swaths, pairs of
 * passes 30 m across that catch the low sun alternately. Round 3 had
 * neither at that scale, so each field was one flat colour at range.
 */
float inPatches(InField f, vec2 w) {
  float k = 0.16 + 0.24 * inHash(f.id + 41.0);
  float n = inFbm(w + f.id * 3.7, 150.0) * 0.5 + inFbm(w, 55.0) * 0.3 + inFbm(w + 53.0, 20.0) * 0.2;
  return 1.0 + (n - 0.5) * 2.0 * k;
}

/* Contour terraces in a sloping field, now and then: the level lines of
 * a slow noise every few tens of metres, a low bank of darker earth and
 * weeds each, faded before a pixel is too large to hold the spacing. */
float inTerraces(InField f, vec2 w) {
  if (inHash(f.id + 53.0) > 0.18) {
    return 0.0;
  }
  float q = (inTex(w, 420.0, 0.47).r * 0.8 + inTex(w, 160.0, 0.11).g * 0.2) * 24.0;
  float dq = max(fwidth(q), 1e-4);
  float toLevel = abs(fract(q + 0.5) - 0.5);
  float line = 1.0 - smoothstep(0.04, 0.04 + dq, toLevel);
  return line * (1.0 - smoothstep(0.08, 0.3, dq));
}

/* The farm's own track across a field, along it from gate to gate,
 * packed pale by the pickup and the tractor, in a field now and then:
 * the lines the reference aerials show crossing their fields. */
vec3 inFieldTrack(vec3 col, InField f, float fp) {
  if (f.track < 0.5) { return col; }
  float d = f.tu + (inTex(vec2(f.uv.y, 1.0), 40.0, 0.33).g - 0.5) * 4.0;
  col = mix(col, IN_DUST * 1.0, inBand(d, 3.5, fp) * 0.45);
  return mix(col, IN_DUST * 1.2, inBand(d, 1.6, fp) * 0.85);
}

/* Cropland: what the field is this week of the dry season's end, and the
 * rows across it. */
vec3 inCrop(InField f, vec2 w, float fp) {
  float h = inHash(f.id + 17.0);
  /* Rows along the field, the headlands' passes across its ends. */
  bool head = f.ev < 14.0;
  float s = head ? f.uv.y : f.uv.x;
  float pass = inRows(s, 11.0, fp);
  float rows = inRowsWorn(s, 0.76, fp, w);
  float swath = inRows(s + inHash(f.id + 8.0) * 30.0, 30.0, fp) * smoothstep(0.3, 0.7, inFbm(w + 211.0, 70.0));
  float moist = inFbm(w, 31.0);
  vec3 col;
  if (h < 0.2) {
    /* Ploughed or no-till red earth, darker where it holds moisture. */
    col = IN_EARTH * (0.86 + 0.24 * moist) * (1.0 + 0.07 * pass + 0.22 * rows + 0.04 * swath);
  } else if (h < 0.55) {
    /* Stubble: the harvester's swaths alternately catching the light,
     * more in some places than others, the straw grey or gold by the
     * crop and the days since. */
    vec3 straw = mix(vec3(0.15, 0.125, 0.085), vec3(0.165, 0.13, 0.075), inHash(f.id + 6.0));
    float sheen = 0.015 + 0.055 * inFbm(w, 19.0);
    col = straw * (0.85 + 0.22 * moist) * (1.0 + sheen * inRows(s, 9.0, fp) + 0.03 * rows + 0.08 * swath);
  } else if (h < 0.8) {
    /* Young soy in rows over the red earth, fuller where it is wetter,
     * some fields further on than others. */
    vec3 leaf = vec3(0.052, 0.08, 0.032);
    float grown = inHash(f.id + 2.0) * 0.4 - 0.15;
    float cover = clamp(0.45 + grown + 0.4 * moist + 0.45 * rows, 0.0, 1.0);
    col = mix(IN_EARTH * 0.95, leaf, cover) * (1.0 + 0.05 * pass + 0.03 * swath);
  } else {
    /* Maize or wheat, green going to straw. */
    vec3 green = vec3(0.068, 0.085, 0.036);
    vec3 dry = vec3(0.13, 0.112, 0.068);
    col = mix(green, dry, inHash(f.id + 4.0)) * (0.9 + 0.15 * moist) * (1.0 + 0.06 * pass + 0.12 * rows + 0.05 * swath);
  }
  col *= inPatches(f, w) * inMottle(w, fp);
  col = mix(col, IN_EARTH * 0.85, inTerraces(f, w) * 0.45);
  col = inFieldTrack(col, f, fp);
  return col;
}

/* Pasture: a paddock grazed its own way, the cattle's tracks wandering
 * across it, bare ground at the gate, termite mounds. */
vec3 inPasture(InField f, vec2 w, float fp) {
  float h = inHash(f.id + 29.0);
  /* Most paddocks green, a third going to straw: under the 16:40 sun
   * and the grade's warm middle tones a grass with red near green
   * printed as dead brown, where the photographs' pasture is green. */
  vec3 green = vec3(0.05, 0.1, 0.03);
  vec3 straw = vec3(0.12, 0.105, 0.058);
  float big = inFbm(w, 47.0);
  vec3 col = mix(green, straw, clamp(h * 0.9 - 0.45 + (big - 0.5) * 1.0, 0.0, 1.0));
  col *= 0.88 + 0.24 * inTex(w, 3.1, 0.41).b;
  col *= inPatches(f, w) * inMottle(w, fp);
  /* Tufts and scrub: the tussocks the cattle leave, darker and greener,
   * a metre or two across, and the bare trodden earth between where the
   * grazing is hard; both fade as a pixel grows past them. */
  float tuft = smoothstep(0.55, 0.75, inTex(w, 1.6, 0.67).r * 0.7 + inTex(w, 0.6, 0.13).g * 0.3);
  float fine = 1.0 - smoothstep(0.8, 4.0, fp);
  col = mix(col, green * 0.8, tuft * 0.5 * fine);
  float bare = smoothstep(0.62, 0.8, inFbm(w + 7.0, 4.0)) * smoothstep(0.3, 0.8, h);
  col = mix(col, IN_TRAIL * 0.9, bare * 0.6 * (1.0 - 0.5 * smoothstep(2.0, 10.0, fp)));
  col = inFieldTrack(col, f, fp);
  /* Tracks: contour lines of a slow noise, a metre wide. */
  float n = inTex(w, 70.0, 0.27).r * 0.65 + inTex(w, 23.0, 0.83).g * 0.35;
  float grad = max(fwidth(n) / max(fp, 0.01), 2e-4);
  float track = 0.0;
  for (int k = 0; k < 3; k++) {
    float lev = 0.38 + 0.12 * float(k);
    track = max(track, inBand((n - lev) / grad, 0.55, fp));
  }
  col = mix(col, IN_TRAIL * 0.85, track * 0.75);
  /* Trodden bare round the paddock's corners, where the gate and the
   * water are. */
  float corner = length(vec2(f.eu, f.ev));
  col = mix(col, IN_TRAIL * 0.8, (1.0 - smoothstep(12.0, 45.0 + 20.0 * big, corner)) * 0.8);
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
  col *= 1.0 + (crowns - 0.5) * 0.9 * fade;
  /* Past the drawn trees (the far tier ends at about 11.5 km, and none
   * stand past the data's square) the ground is the forest, and lit
   * flat it was a dark grey slab beside the drawn crowns, which the low
   * sun lights on their sides: so at a footprint no drawn tree reaches it
   * takes the crowns' lighter, yellower mean. */
  return mix(col, vec3(0.055, 0.07, 0.026) * (0.85 + 0.3 * patchy), smoothstep(6.0, 20.0, fp));
}

/* A yard: earth trodden bare round the house and the gate, the grass
 * worn to patches between, the paths across it packed paler, a scrap of
 * litter now and then. Round 5's yards were one flat colour. */
vec3 inYard(vec2 w, float fp) {
  vec3 earth = ${v3(CLASS[LAND.built].col)};
  vec3 grass = vec3(0.075, 0.088, 0.04);
  float worn = inFbm(w + 13.0, 5.0) * 0.6 + inFbm(w, 1.4) * 0.4;
  vec3 col = mix(grass, earth, smoothstep(0.35, 0.6, worn));
  col *= 0.86 + 0.28 * inTex(w, 2.2, 0.49).b;
  float n = inTex(w, 9.0, 0.37).r;
  float grad = max(fwidth(n) / max(fp, 0.01), 2e-4);
  float path = inBand((n - 0.5) / grad, 0.6, fp);
  col = mix(col, IN_DUST * 1.05, path * 0.6);
  vec2 lc = floor(w / 2.5);
  if (inHash(lc + 43.0) > 0.93) {
    vec2 lp = (lc + 0.2 + 0.6 * vec2(inHash(lc + 1.0), inHash(lc + 4.0))) * 2.5;
    col = mix(col, vec3(0.2, 0.19, 0.17), inBand(length(w - lp), 0.2, fp) * 0.7);
  }
  return col * inMottle(w, fp);
}

bool inIsFarm(uint k) {
  return k == ${LAND.crop}u || k == ${LAND.pasture}u;
}
vec3 inClass(uint k, vec3 farm, vec2 w, float fp) {
  if (inIsFarm(k)) { return farm; }
  if (k == ${LAND.forest}u) { return inForest(w, fp); }
  if (k == ${LAND.burned}u) { return ${v3(CLASS[LAND.burned].col)} * (0.7 + 0.6 * inFbm(w, 6.0)); }
  if (k == ${LAND.built}u) { return inYard(w, fp); }
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
  } else if (h < 0.5 && isField > 0.5) {
    /* An earth track, packed pale by the trucks, its wheel ruts redder
     * close up and a dusty verge either side: from a survey's altitude
     * the pale line between the fields that ties them into a network,
     * as the reference aerials' tracks do. Round 3's tracks were the
     * ploughed earth's own colour and vanished between ploughed fields. */
    col = mix(col, IN_DUST * 0.9, inBand(d, 6.0, fp) * 0.5);
    col = mix(col, IN_DUST * 1.15, inBand(d, 3.0, fp));
    col = mix(col, IN_EARTH * 1.1, inBand(abs(d) - 1.0, 0.3, fp) * 0.6);
  } else {
    /* A fence's strip of uncut grass: at a survey's footprint inBand
     * still covers a whole pixel, which ruled every field with a dark
     * line, so past a couple of metres a pixel it fades to a faint
     * tonal edge. */
    float far = 1.0 - 0.75 * smoothstep(1.5, 6.0, fp);
    col = mix(col, vec3(0.06, 0.075, 0.032), inBand(d, 1.2, fp) * 0.6 * far);
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
  return clearedLand(out);
}

/*
 * FOREST LAND AN OPENING CLEARS is grass. The land cover has Pista Cero's
 * field as forest, and places.js opens it (no crown stands there), so
 * the ground under it was the litter of a forest floor with no roof over
 * it: a dark smear at a man's height. A forest cell whose middle and the
 * points CLEAR_M either side of it all lie inside an opening (an opening
 * a few metres wide, a gap or a road, has none) is drawn as pasture.
 * What the room reads (world.landAt) is not changed.
 */
const CLEAR_M = 10;
function clearedLand(cells) {
  const inside = (x, z) => opened(x, z, 0);
  for (let j = 0; j < L_N; j += 1) {
    const z = -HALF + (j + 0.5) * L_CELL;
    for (let i = 0; i < L_N; i += 1) {
      const k = j * L_N + i;
      if (cells[k] !== LAND.forest) {
        continue;
      }
      const x = -HALF + (i + 0.5) * L_CELL;
      if (inside(x, z) && inside(x + CLEAR_M, z) && inside(x - CLEAR_M, z) && inside(x, z + CLEAR_M) && inside(x, z - CLEAR_M)) {
        cells[k] = LAND.pasture;
      }
    }
  }
  return cells;
}

/*
 * THE FAR GROUND IS THE AIR. Past FAR_AIR[0] metres the ground gives way
 * to the air's own light, wholly by FAR_AIR[1], short of the apron's end
 * (terrain.js APRON). Two reasons. The post chain veils a pixel by the
 * air only where the depth buffer holds less than 1 (swiss2/post.js), and
 * at a hundred kilometres and more it rounds to 1, so the apron's last
 * hills were drawn unveiled: the dark dashes along the horizon in every
 * survey view. And the thinned air (look.js AIR_THIN), right for the
 * fields at five kilometres, left the land at fifty as clear as at five,
 * where the reference aerials and the owner's mocks fade it into a haze
 * that glows toward the sun. The air's light is the post chain's own
 * (post.js airT: the haze plus the sun's colour times the glow's share,
 * through the same phase function), so the ground fades into the sky
 * below the horizon with no line, and toward the sun it glows.
 */
const FAR_AIR = [20000, 140000];

/*
 * NEAR THE CAMERA, what a man standing on bare earth sees that the
 * paint above leaves to a pixel's mean: on places.js's bare strips
 * (Pista Cero's), the truck's wheel ruts along it, two pairs wandering a
 * little, darker and redder where they are pressed and damp, the tread
 * across them, pale dry patches between, and the laterite's gravel. The
 * detail is a ratio round the colour the paint gives, so the strip's
 * mean holds, and it fades out between NEAR_M's distances from the
 * camera: no view but a low one changes.
 */
const NEAR_M = [40, 90];
function nearGround() {
  const strips = LAND_EDITS.filter((e) => e.cls === LAND.bare && e.strip)
    .map(({ strip: { points: [[ax, az], [bx, bz]] } }) => new THREE.Vector4(ax, az, bx, bz));
  const glsl = /* glsl */ `
uniform vec4 uInStrips[${strips.length}];
vec3 inNear(vec3 col, vec2 w, uint k, float fp) {
  float kn = 1.0 - smoothstep(${f1(NEAR_M[0])}, ${f1(NEAR_M[1])}, length(vInWorld - cameraPosition));
  if (kn <= 0.0 || k != ${LAND.bare}u) { return col; }
  float across = 1e9;
  float along = 0.0;
  for (int i = 0; i < ${strips.length}; i++) {
    vec2 a = uInStrips[i].xy;
    vec2 t = normalize(uInStrips[i].zw - a);
    vec2 r = w - a;
    float c = t.x * r.y - t.y * r.x;
    if (abs(c) < abs(across)) { across = c; along = dot(r, t); }
  }
  /* The wheels' line wanders a metre and a half over tens of metres. */
  float wander = (inTex(vec2(along, 3.0), 30.0, 0.21).r - 0.5) * 3.0;
  float s1 = across + wander;
  float s2 = across + wander * 0.6 - 4.6;
  float rut = max(inBand(abs(s1) - 0.95, 0.3, fp), 0.6 * inBand(abs(s2) - 0.95, 0.26, fp));
  float worn = max(inBand(s1, 1.7, fp), 0.6 * inBand(s2, 1.6, fp));
  float dust = inFbm(w, 1.9);
  vec3 c2 = col * (0.86 + 0.3 * dust);
  c2 = mix(c2, col * vec3(1.2, 1.12, 1.02), smoothstep(0.58, 0.78, dust) * 0.55 * (1.0 - worn));
  c2 = mix(c2, col * vec3(1.08, 1.0, 0.95), worn * 0.4);
  vec3 mud = col * vec3(0.74, 0.58, 0.52) * (0.9 + 0.2 * inFbm(w, 0.7));
  c2 = mix(c2, mud, rut * 0.85);
  c2 *= 1.0 + 0.14 * inRows(along, 0.2, fp) * rut;
  /* Gravel: a nodule of laterite a few centimetres across, now and then. */
  vec2 gc = floor(w / 0.3);
  if (inHash(gc + 19.0) > 0.9) {
    vec2 gp = (gc + 0.25 + 0.5 * vec2(inHash(gc + 3.0), inHash(gc + 9.0))) * 0.3;
    c2 = mix(c2, col * vec3(1.3, 0.95, 0.8), inBand(length(w - gp), 0.035, fp) * 0.8);
  }
  return mix(col, c2, kn);
}
`;
  return { glsl, uniforms: { uInStrips: { value: strips } } };
}

/*
 * The material: `land` landTexture's, `arrays` itaipu/look/ground.js
 * loadGroundArrays's, `noise` its noiseTexture's, `sunDir` the live
 * Vector3 toward the sun (look.js moves it), `air` the live { haze, glow }
 * the air is made of (the sky's uHaze and uAirSun, look.js); the caller
 * owns them.
 */
export function groundMaterial({
  land, arrays, noise, sunDir, air,
}) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  const near = nearGround();
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, near.uniforms);
    shader.uniforms.uLand = { value: land };
    shader.uniforms.uNoise = { value: noise };
    shader.uniforms.uLayerCol = { value: arrays.col };
    shader.uniforms.uSunDir = { value: sunDir };
    shader.uniforms.uAirHaze = { value: air.haze };
    shader.uniforms.uAirGlow = { value: air.glow };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vInWorld;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vInWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL}\n${near.glsl}\nuniform vec3 uAirHaze;\nuniform vec3 uAirGlow;\nfloat inFar = 0.0;`)
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
            col = inEdge(col, f.eb, f.nb, f.sb * 0.52, fp, 1.0, shade);
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
          col = inNear(col, w, kk, fp);
          inFar = smoothstep(${f1(FAR_AIR[0])}, ${f1(FAR_AIR[1])}, length(vInWorld - cameraPosition));
          diffuseColor.rgb = col * shade * (1.0 - inFar);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (inFar > 0.0) {
          vec3 toward = normalize(vInWorld - cameraPosition);
          const float g = 0.72;
          float mu = dot(toward, uSunDir);
          float hg = (1.0 - g * g) / (4.0 * PI * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
          totalEmissiveRadiance += (uAirHaze + uAirGlow * hg) * inFar;
        }`);
  };
  m.customProgramCacheKey = () => 'interior-ground';
  m.name = 'interior-ground';
  return thermalKind(m, 'vegetation');
}
