/*
 * ground.js: the terrain's material. The satellite's colour, swiss2's
 * photographed detail under it.
 *
 * WHAT THE GROUND IS MADE OF. Colour is Sentinel-2's (imagery/hero.jpg at
 * 10 m over the hero, imagery/ring.jpg at 40 m over the ring), already
 * display sRGB by the pipeline's fixed curve, so the map never guesses an
 * exposure. Close to, a 10 m pixel is a blur, so the detail comes from
 * swiss2's CC0 terrain photographs (src/maps/swiss2/assets.js LAYERS),
 * chosen per texel by package A's splat masks (masks/*.png: forest,
 * field, red soil, urban, summing to 255): the forest floor, the meadow,
 * the worn earth (tinted red by the colour above it: the region's terra
 * roxa), and the fine gravel for what is paved. Rock on anything too
 * steep for the photograph from above to mean much.
 *
 * THE COLOUR IS A REFLECTANCE. The pipeline wrote each pixel as the sRGB
 * transfer of min(1, reflectance / white) (manifest imagery.colour: white
 * 0.28), a print stretched so the land fills the range. Decoded to
 * linear and multiplied back by white, a texel is the ground's own
 * reflectance again, which is the albedo a lit material wants: the sun
 * and the post chain's metered exposure then make it look as bright as
 * it is, and the satellite's stretch is not applied twice.
 *
 * THE DETAIL TAKES ITS COLOUR FROM THE SATELLITE. A photograph's colour
 * divided by its own mean (its last mip) is a pattern round 1; the
 * satellite's colour times that pattern is the satellite's colour with the
 * photograph's grain, so a field is the field's colour at every distance
 * and the mipmaps fade the grain into it with no seam. A little of the
 * photograph's own hue is kept (DETAIL_HUE), so a meadow's blades are
 * greener than its bare patches.
 *
 * The masks are decoded unpremultiplied (package A's note): a texel whose
 * urban weight is 0 has alpha 0, and a premultiplied decode zeroes the
 * other three weights with it.
 *
 * ROUND 1 OF THE LOOP (docs/ITAIPU-LOOP.md targets 5, 6 and 8), what the
 * satellite alone could not give, from the air down:
 *
 * The edges. Seen from the air the hero's 10 m pixels are magnified, so
 * every field and forest edge was a 10 m bilinear blur. The satellite is
 * sharpened against its own blur a mip and a half down, and each class's
 * weight is sharpened (raised to a power, on a jittered edge), with the
 * colour moved by what the class means say the sharper weights change:
 * the satellite's colour is its class mean plus what is local to the
 * pixel, and only the first part is moved. Both fade out as the pixel
 * grows past the texel, where there is no edge left to sharpen.
 *
 * The grade. Measured over round 0's frames against the photographs
 * (tools/swiss2-loop/colour.py): saturation 0.13 against 0.26, the greens
 * 0.17 against 0.29, the grass grey where the photographs' is yellow
 * green. Sentinel-2's December reflectance is a dull, bluish green under
 * a bluish sky; each class's colour is scaled toward what the
 * photographs show (GRADE: deeper olive forest, yellower pasture, terra
 * roxa that is red), the class means (CLASS_MEAN) being data v2's, over
 * pixels of one class at more than 0.8 and not water.
 *
 * The middle distance. Past a kilometre the photographs' grain has gone
 * to its mean, and the ground was the 10 m satellite and nothing else.
 * Value noise at the scales a pixel there still resolves, each faded out
 * as a pixel reaches it: a stand's clumps and gaps in forest, crop rows
 * and strips in field, clods in red soil, lots in town; and under all of
 * it, a slow patchiness hundreds of metres across, lush to dry.
 *
 * The basalt (target 5). Below the dam the Parana runs in a canyon of
 * stepped basalt flows; the 10 m ground has its walls as 25 to 45 degree
 * slopes, which read as grass. Any slope in the canyon's band of height
 * steeper than about 20 degrees is rock, drawn as the flows: a step every
 * FLOW_M or so, each a dark riser of columns and a lit ledge where soil
 * and scrub hold, by the normal and the colour alone. The ground a craft
 * meets is unchanged: the relief is shading, because the terrain's 10 m
 * cells cannot carry steps of a few metres and a displaced surface would
 * no longer be the ground the craft stands on (terrain/index.js). Under a
 * few metres over the river, everything is the wet dark rock the
 * tailwater washes.
 *
 * The shore (target 8). The reservoir's margin, from a little under its
 * level to a couple of metres over, is rip rap in some reaches and bare
 * red earth in others, not a lawn down to the water. The rockfill dam's
 * faces (loadSite, below) are dumped dark basalt, the wet upstream one a
 * little greyer.
 *
 * WHAT THE PLACE ADDS (loadSite). The reservoir's outline, as a mask
 * over the ring. The shore is the ground a few metres over the water it
 * stands by, and the reservoir (219 m) and the river (103.5 m) are 115 m
 * apart, so which water a point stands by is all the material needs: the
 * river's banks are in the canyon, under any ground the reservoir's level
 * could reach, and the reservoir's outline (water.json) says where 219 m
 * is the water's edge rather than a field on the plateau at the same
 * height. The outline is loose (it holds dry ground higher than the
 * water, water.json notes), which the height band sorts out.
 *
 * The rockfill dam's axis. Its faces are terrain (package A burns them
 * in; dam/index.js draws only the crest), so they are the ground's to
 * finish: dumped basalt, not the satellite's grey smear. The axis is the
 * crest road's line from dam.json; a face is ground farther from it than
 * the crest's half width, over the dam's base, and sloped.
 *
 * Both files are fetched by the look as well as by the map (itaipu.js
 * readData), because the look is made before the data is read and in
 * parallel with it; the browser's cache serves the second fetch.
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
import { LAYERS } from '../../swiss2/assets.js';

/* Each mask channel's layer, by name, and the rock for the faces. */
const LAYER = {
  forest: LAYERS.indexOf('forest'),
  field: LAYERS.indexOf('meadow'),
  soil: LAYERS.indexOf('path'),
  urban: LAYERS.indexOf('shore'),
  rock: LAYERS.indexOf('rock'),
  rubble: LAYERS.indexOf('scree'),
};
/* Metres a tile of each covers: swiss2/ground.js's TILE for the same
 * photographs. */
const TILE = {
  forest: 2.4, field: 1.9, soil: 2.6, urban: 3.0, rock: 30, rubble: 3.6,
};
const DETAIL_HUE = 0.3;
/* Where the grain has faded into its mean and is not worth reading. */
const DETAIL_FAR = 1800;

/* Linear reflectance per class (forest, field, red soil, urban): data
 * v2's hero means, and the colour each is graded to. */
const CLASS_MEAN = [[0.0267, 0.0516, 0.028], [0.0584, 0.0761, 0.0447], [0.0904, 0.0794, 0.0582], [0.1512, 0.1406, 0.117]];
const CLASS_TARGET = [[0.029, 0.05, 0.017], [0.07, 0.083, 0.03], [0.125, 0.079, 0.05], [0.15, 0.139, 0.112]];
const GRADE = CLASS_TARGET.map((target, k) => target.map((t, c) => t / CLASS_MEAN[k][c]));
/* The forest's multiplier, for the canopy over it (vegetation/draw.js),
 * so the canopy and the ground under its edge are graded alike. */
export const FOREST_GRADE = GRADE[0];

/* Basalt, linear reflectance: the flows' faces (dark, weathered brown),
 * the wet rock at the river, the rockfill's dumped blocks and the rip rap. */
const BASALT = [0.046, 0.036, 0.031];
const BASALT_WET = [0.026, 0.022, 0.02];
const ROCKFILL = [0.05, 0.035, 0.03];
const RIPRAP = [0.07, 0.058, 0.05];
const RED_EARTH = [0.15, 0.075, 0.042];
/* A basalt flow's step, m, and the height under which the canyon is. */
const FLOW_M = 9;
const CANYON_TOP = 192;
/* How far from its axis the rockfill's burned downstream face reaches
 * before it flattens into the ground (measured across the hero's 10 m
 * ground at three places: 120 to 130 m). */
const FILL_REACH = 150;

const v3 = (c) => `vec3(${c.map((x) => x.toFixed(4)).join(', ')})`;

/* An image from the data folder as a texture, decoded as the pipeline
 * wrote it: no colour management and no premultiplication (fetchBitmap in
 * swiss2/assets.js says why). Rows stay top first: v runs north to south,
 * which is the imagery's own order (pixel (0, 0) is the north west
 * corner). */
export async function loadImage(url, srgb, anisotropy) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`itaipu: ${url}: HTTP ${res.status}`);
  }
  const bitmap = await createImageBitmap(await res.blob(), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
  const t = new THREE.Texture(bitmap);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.flipY = false;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  t.addEventListener('dispose', () => bitmap.close());
  return t;
}

/* The outline's raster, over the ring: 40 m a texel, the ring imagery's. */
const OUTLINE_PX = 1024;

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`itaipu look: ${url}: HTTP ${res.status}`);
  }
  return res.json();
}

function outlineMask(outline, ringHalf) {
  const canvas = new OffscreenCanvas(OUTLINE_PX, OUTLINE_PX);
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const k = OUTLINE_PX / (2 * ringHalf);
  g.fillStyle = '#fff';
  g.beginPath();
  outline.forEach(([x, z], i) => {
    const px = (x + ringHalf) * k;
    const py = (z + ringHalf) * k;
    if (i === 0) {
      g.moveTo(px, py);
    } else {
      g.lineTo(px, py);
    }
  });
  g.closePath();
  g.fill();
  const rgba = g.getImageData(0, 0, OUTLINE_PX, OUTLINE_PX).data;
  const data = new Uint8Array(OUTLINE_PX * OUTLINE_PX);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = rgba[i * 4];
  }
  /* Rows top first, north first, as the imagery. */
  const t = new THREE.DataTexture(data, OUTLINE_PX, OUTLINE_PX, THREE.RedFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/*
 * Read the site from the data folder at `base`. Returns { reservoir,
 * reservoirY, riverY, rockfill: { axis: [THREE.Vector2], crestHalf,
 * toeY } }; the caller owns reservoir, a texture.
 */
export async function loadSite(base, ringHalf) {
  const [water, dam] = await Promise.all([
    fetchJson(`${base}water.json`),
    fetchJson(`${base}dam.json`),
  ]);
  const body = (name) => {
    const b = water.find((w) => w.name === name);
    if (!b) {
      throw new Error(`itaipu look: water.json has no body "${name}"`);
    }
    return b;
  };
  const fill = dam.find((p) => p.part === 'rockfill dam');
  if (!fill || !fill.axis || !fill.sections.length) {
    throw new Error('itaipu look: dam.json has no rockfill dam axis and section');
  }
  const reservoir = body('reservoir');
  return {
    reservoir: outlineMask(reservoir.outline, ringHalf),
    reservoirY: reservoir.y,
    riverY: body('river').y,
    rockfill: {
      axis: fill.axis.map(([x, z]) => new THREE.Vector2(x, z)),
      crestHalf: fill.sections[0].crestWidth / 2,
      toeY: fill.baseY,
    },
  };
}

const parsFor = (axisN) => /* glsl */ `
  uniform sampler2D uHeroCol;
  uniform sampler2D uRingCol;
  uniform sampler2D uHeroMask;
  uniform sampler2D uRingMask;
  uniform sampler2D uReservoir;
  uniform sampler2D uNoise;
  uniform highp sampler2DArray uLayerCol;
  uniform highp sampler2DArray uLayerNrh;
  uniform vec2 uHalf;
  uniform float uWhite;
  uniform vec2 uWater;
  uniform vec3 uWaterCol;
  uniform vec2 uFill[${axisN}];
  uniform vec4 uFillBox;
  uniform vec3 uFillShape;
  varying vec3 vItWorld;
  varying vec3 vItNormal;
  vec3 itNrm = vec3(0.0, 1.0, 0.0);
  float itRough = 0.92;

  /* A layer's grain round 1, and its normal's tangent part. */
  vec3 itGrain(float k, vec2 uv, out vec3 tn) {
    vec3 col = texture(uLayerCol, vec3(uv, k)).rgb;
    vec3 mean = textureLod(uLayerCol, vec3(0.5, 0.5, k), 12.0).rgb;
    vec3 ratio = col / max(mean, vec3(0.02));
    float l = dot(ratio, vec3(0.3, 0.59, 0.11));
    vec4 nh = texture(uLayerNrh, vec3(uv, k));
    vec2 xy = nh.rg * 2.0 - 1.0;
    xy.y = -xy.y;
    tn = vec3(xy, sqrt(max(0.0, 1.0 - dot(xy, xy))));
    return mix(vec3(l), ratio, ${DETAIL_HUE.toFixed(2)});
  }
  /* A layer's lightness pattern round 1. */
  float itPattern(float k, vec2 uv) {
    vec3 col = texture(uLayerCol, vec3(uv, k)).rgb;
    vec3 mean = textureLod(uLayerCol, vec3(0.5, 0.5, k), 12.0).rgb;
    return dot(col / max(mean, vec3(0.02)), vec3(0.3, 0.59, 0.11));
  }
  float itHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  /* The satellite at uv on a map of texel metres, sharpened against its
   * blur a mip and a half down while a pixel is under a texel. */
  vec3 itSat(sampler2D t, vec2 uv, float texel, float pix) {
    vec3 c = texture2D(t, uv).rgb;
    float k = 0.7 * (1.0 - smoothstep(0.5 * texel, 2.0 * texel, pix));
    if (k <= 0.0) {
      return c;
    }
    vec3 b = textureLod(t, uv, log2(max(pix / texel, 1.0)) + 1.5).rgb;
    return max(c + k * (c - b), c * 0.5);
  }
  /* Broken blocks, cells round 1 across: the block's lightness with a
   * dark crack round it (x), and its tilt (yz), so each is lit as its own
   * face. */
  vec3 itBlocks(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float d1 = 8.0;
    float d2 = 8.0;
    vec2 id = vec2(0.0);
    for (int j = -1; j <= 1; j++) {
      for (int k = -1; k <= 1; k++) {
        vec2 b = vec2(float(k), float(j));
        vec2 c = b + 0.15 + 0.7 * vec2(itHash(i + b), itHash(i + b + 17.1)) - f;
        float d = dot(c, c);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          id = i + b;
        } else if (d < d2) {
          d2 = d;
        }
      }
    }
    float crack = smoothstep(0.0, 0.22, sqrt(d2) - sqrt(d1));
    return vec3((0.15 + 0.85 * crack) * (0.6 + 0.8 * itHash(id + 3.3)), itHash(id + 5.7) - 0.5, itHash(id + 9.1) - 0.5);
  }
  /* itBlocks while a block is a few pixels across, faded to a plain
   * face (1, no tilt) as it shrinks, and not computed at all past that. */
  vec3 itBlocksNear(vec2 p, float size, float pix) {
    float k = 1.0 - smoothstep(0.25 * size, 0.7 * size, pix);
    if (k <= 0.0) {
      return vec3(1.0, 0.0, 0.0);
    }
    return mix(vec3(1.0, 0.0, 0.0), itBlocks(p / size), k);
  }
  /* The nearest distance from w to the rockfill's axis. */
  float itFillDist(vec2 w) {
    float d = 1e9;
    for (int i = 0; i < ${axisN - 1}; i++) {
      vec2 a = uFill[i];
      vec2 ab = uFill[i + 1] - a;
      float t = clamp(dot(w - a, ab) / dot(ab, ab), 0.0, 1.0);
      d = min(d, distance(w, a + ab * t));
    }
    return d;
  }
`;

/*
 * The ground's colour. The noise is one texture of four independent
 * channels (noiseTexture) read at five scales; its mipmaps take each
 * scale to its mean as a pixel outgrows it, so nothing finer than the
 * screen shimmers, and a scale costs one fetch however far it is.
 */
const ALBEDO = /* glsl */ `
  {
    vec2 w = vItWorld.xz;
    float y = vItWorld.y;
    float pix = max(length(fwidth(vItWorld)), 0.01);
    /* The pixel's geometric mean size: on a face seen at a slant the
     * larger derivative is along the view and would fade a block that
     * still reads across it. */
    float pixA = max(sqrt(length(dFdx(vItWorld)) * length(dFdy(vItWorld))), 0.01);
    vec2 hu = (w + uHalf.x) / (2.0 * uHalf.x);
    vec2 ru = (w + uHalf.y) / (2.0 * uHalf.y);
    float edge = max(abs(w.x), abs(w.y));
    float inHero = 1.0 - smoothstep(uHalf.x - 320.0, uHalf.x - 20.0, edge);
    float outRing = smoothstep(uHalf.y, uHalf.y + 4000.0, edge);
    vec3 macro = itSat(uRingCol, ru, 40.0, pix);
    vec4 mask = texture2D(uRingMask, ru);
    if (inHero > 0.0) {
      macro = mix(macro, itSat(uHeroCol, hu, 10.0, pix), inHero);
      mask = mix(mask, texture2D(uHeroMask, hu), inHero);
    }
    /* Past the ring, the ring's own mean colour and a field's grain. */
    macro = mix(macro, textureLod(uRingCol, vec2(0.5), 12.0).rgb, outRing);
    mask = mix(mask, vec4(0.2, 0.6, 0.2, 0.0), outRing);
    mask /= max(dot(mask, vec4(1.0)), 1e-3);
    macro *= uWhite;

    vec3 n = normalize(vItNormal);
    float res = texture2D(uReservoir, ru).r;
    /* The beds under the water (the pipeline's, three metres down),
     * which the water veils: their colour and none of the detail. */
    bool bed = y < uWater.y - 1.0 || (res > 0.5 && y < uWater.x - 1.0);
    vec3 albedo = macro;
    vec3 nOut = n;
    vec3 tsum = vec3(0.0, 0.0, 1.0);
    float rough = 0.9;
    float bare = 1.0;
    if (!bed) {
      vec4 n1 = texture2D(uNoise, w / 8.3);
      vec4 n2 = texture2D(uNoise, w / 23.0 + 0.37);
      vec4 n3 = texture2D(uNoise, w / 71.0 + 0.61);
      vec4 n4 = texture2D(uNoise, w / 290.0 + 0.13);
      vec4 n5 = texture2D(uNoise, w / 870.0 + 0.29);

      /* The classes' edges sharpened on a jittered line while a pixel is
       * under a texel; the colour moved by what the class means say the
       * sharper weights change. */
      float texel = mix(40.0, 10.0, inHero);
      float sharpK = 1.0 - smoothstep(0.6 * texel, 2.5 * texel, pix);
      vec4 sw = mask;
      if (sharpK > 0.0) {
        sw = mask * (0.3 + 1.4 * vec4(n1.r, n2.g, n1.b, n2.a));
        sw *= sw;
        sw *= sw;
        sw /= max(dot(sw, vec4(1.0)), 1e-5);
        sw = mix(mask, sw, sharpK);
      }
      mat4 means = mat4(${CLASS_MEAN.map((c) => `vec4(${v3(c)}, 0.0)`).join(', ')});
      mat4 grade = mat4(${GRADE.map((g) => `vec4(${v3(g)}, 0.0)`).join(', ')});
      vec3 col = max(macro + (means * (sw - mask)).rgb, macro * 0.4);
      col *= (grade * sw).rgb;
      /* Where the imagery has the water's own fill (manifest colour.water)
       * over ground the terrain has dry, the masks say red soil (the bed
       * is soil), which graded is a pink beach: it is the wet bank. */
      float watery = 1.0 - smoothstep(0.004, 0.011, distance(macro, uWaterCol));
      col = mix(col, macro, watery);

      /* The slow patchiness, lush to dry, hundreds of metres across. */
      col *= 0.88 + 0.24 * (0.6 * n5.r + 0.4 * n4.r);
      float dry = smoothstep(0.42, 0.75, n5.g * 0.6 + n4.g * 0.4);
      col = mix(col, col * vec3(1.2, 1.05, 0.7), dry * (sw.g + 0.5 * sw.b) * 0.6);

      /* Fields: strips turned per block and rows along them, over the
       * ring; the hero's 10 m satellite has the real parcels, so there only
       * a trace. Forest: crowns in clumps with dark gaps between. Red soil:
       * clods and the plough's lines. Town: lots and roofs. */
      float ringK = mix(1.0, 0.25, inHero);
      float ang = itHash(floor(w / 1600.0) + 0.5) * 3.1416;
      vec2 dir = vec2(cos(ang), sin(ang));
      vec2 r = vec2(dot(w, dir), dot(w, vec2(-dir.y, dir.x)));
      float stripW = 70.0 + 60.0 * itHash(floor(r.x / 260.0) + vec2(4.1, 9.3));
      vec2 strip = floor(r / vec2(260.0, stripW));
      float stripK = (1.0 - smoothstep(25.0, 70.0, pix)) * ringK;
      float period = mix(4.0, 9.0, itHash(strip + 3.0));
      float rowsK = (1.0 - smoothstep(0.2 * period, 0.45 * period, pix)) * ringK;
      float rows = sin(r.y * 6.2832 / period);
      float fieldTex = mix(1.0, 0.84 + 0.32 * itHash(strip + 7.0), stripK) * (1.0 + 0.07 * rows * rowsK) * (0.86 + 0.28 * n2.r);
      float crowns = n1.g * 0.55 + n2.b * 0.45;
      float forestTex = mix(0.55, 1.18, smoothstep(0.3, 0.62, crowns)) * (0.78 + 0.44 * n3.g);
      float soilTex = (0.82 + 0.36 * n1.a) * (1.0 + 0.06 * rows * rowsK);
      float urbanTex = mix(1.0, 0.8 + 0.4 * itHash(floor(w / 17.0) + 0.3), 1.0 - smoothstep(4.0, 9.0, pix));
      col *= dot(sw, vec4(forestTex, fieldTex, soilTex, urbanTex));

      float dist = distance(vItWorld, cameraPosition);
      float near = 1.0 - smoothstep(${(DETAIL_FAR / 3).toFixed(1)}, ${DETAIL_FAR.toFixed(1)}, dist);
      vec3 grain = vec3(1.0);
      tsum = vec3(0.0, 0.0, 1.0);
      if (near > 0.0) {
        vec3 tn;
        vec3 g = vec3(0.0);
        tsum = vec3(0.0);
        g += itGrain(${LAYER.forest.toFixed(1)}, w / ${TILE.forest.toFixed(2)}, tn) * sw.r; tsum += tn * sw.r;
        g += itGrain(${LAYER.field.toFixed(1)}, w / ${TILE.field.toFixed(2)}, tn) * sw.g; tsum += tn * sw.g;
        g += itGrain(${LAYER.soil.toFixed(1)}, w / ${TILE.soil.toFixed(2)}, tn) * sw.b; tsum += tn * sw.b;
        g += itGrain(${LAYER.urban.toFixed(1)}, w / ${TILE.urban.toFixed(2)}, tn) * sw.a; tsum += tn * sw.a;
        /* A second read five times the size under the first, so a field is
         * not a thousand copies of one tile. */
        vec3 tb;
        vec3 big = itGrain(${LAYER.field.toFixed(1)}, w / ${(TILE.field * 5.3).toFixed(2)} + vec2(0.37, 0.71), tb);
        g *= mix(vec3(1.0), big, 0.35 * (sw.g + sw.r));
        grain = mix(vec3(1.0), g, near);
        tsum = mix(vec3(0.0, 0.0, 1.0), tsum, near);
      }
      albedo = col * grain;
      rough = mix(0.93, 0.82, sw.a);
      bare = 0.0;

      /* The canyon's basalt: slopes in its band of height, and anything
       * too steep for a photograph from above to mean much; under a few
       * metres over the river, all of it the tailwater's rock. */
      float slope = sqrt(max(0.0, 1.0 - n.y * n.y)) / max(n.y, 0.05);
      float wob = n3.r - 0.5;
      float canyon = 1.0 - smoothstep(${(CANYON_TOP - 14).toFixed(1)}, ${CANYON_TOP.toFixed(1)}, y + 20.0 * wob);
      float rockW = max(canyon * smoothstep(0.36, 0.48, slope + 0.4 * wob), smoothstep(1.6, 3.0, slope));
      /* Not on the bed under the water, which the water hides. */
      float margin = (1.0 - smoothstep(uWater.y + 4.0, uWater.y + 9.0, y + 6.0 * wob)) * step(uWater.y - 1.0, y);
      margin = max(margin, watery * canyon);
      rockW = max(rockW, margin);
      if (rockW > 0.0) {
        /* The flows, one every FLOW_M or so and wandering: most of a step
         * is its riser of columns, dark; a ledge on its top, broken, holds
         * soil and scrub. Faded to their mean as a step shrinks under a
         * few pixels. */
        float s = (y + 6.0 * n3.b + 3.0 * n2.g) / ${FLOW_M.toFixed(1)};
        float f = fract(s);
        float stepK = (1.0 - smoothstep(0.1, 0.35, fwidth(s))) * (1.0 - margin);
        float broken = smoothstep(0.25, 0.45, n2.r);
        float ledge = mix(0.08, smoothstep(0.88, 0.93, f) * broken, stepK);
        vec2 across = normalize(vec2(-n.z, n.x) + vec2(1e-4, 0.0));
        float t = dot(w, across);
        /* The columns: vertical joints a metre or two apart, a new set in
         * each flow; the gradient is t's alone, so the flow's edge does not
         * jump a mip. */
        vec2 cu = vec2(t / 1.3, floor(s) * 7.31);
        float cols = mix(0.55, 1.1, smoothstep(0.3, 0.6, textureGrad(uNoise, cu, vec2(dFdx(t) / 1.3, 0.0), vec2(dFdy(t) / 1.3, 0.0)).r));
        vec2 side = abs(n.x) > abs(n.z) ? vItWorld.zy : vItWorld.xy;
        float face = mix(1.0, itPattern(${LAYER.rock.toFixed(1)}, side / 9.0), 0.6);
        vec3 rock = ${v3(BASALT)} * face * mix(1.0, cols, stepK) * (0.78 + 0.44 * n2.a);
        rock = mix(rock, rock * vec3(1.3, 1.0, 0.85), smoothstep(0.45, 0.7, n4.b));
        /* Scrub holds on the ledges and in patches down the faces. */
        float scrub = max(ledge, smoothstep(0.68, 0.8, n2.b) * 0.7) * (1.0 - margin);
        vec3 basalt = mix(rock, col * 0.85, scrub);
        /* The river's margin: loose wet blocks. */
        if (margin > 0.0) {
          vec3 bl = itBlocksNear(w, 1.8, pixA);
          vec3 wet = mix(${v3(BASALT_WET)}, ${v3(BASALT)}, smoothstep(uWater.y + 0.5, uWater.y + 5.0, y));
          vec3 loose = mix(wet * bl.x * (0.8 + 0.4 * n1.g), col * 0.8, smoothstep(0.66, 0.8, n2.b) * smoothstep(uWater.y + 3.0, uWater.y + 6.0, y));
          basalt = mix(basalt, loose, margin);
        }
        vec3 riser = normalize(vec3(n.x, n.y * 0.35, n.z));
        vec3 shelfN = normalize(mix(n, vec3(0.0, 1.0, 0.0), 0.8));
        vec3 nb = normalize(mix(n, mix(riser, shelfN, ledge), stepK));
        albedo = mix(albedo, basalt, rockW);
        nOut = normalize(mix(nOut, nb, rockW));
        rough = mix(rough, mix(0.9, 0.65, margin), rockW);
        bare = max(bare, rockW * (1.0 - scrub));
      }

      /* The reservoir's margin, a strip a few metres wide from a little
       * under the water to a little over: rip rap in some reaches, bare red
       * earth in others. Its height scales with the slope, so the strip
       * keeps its width on a gentle shore. */
      if (res > 0.0) {
        float over = clamp(slope * 6.0, 0.8, 2.4);
        float band = (1.0 - smoothstep(uWater.x + 0.6 * over, uWater.x + over, y + 0.4 * over * wob)) * step(uWater.x - 0.8, y);
        float shore = res * max(band, watery * (1.0 - smoothstep(uWater.x + 3.0, uWater.x + 5.0, y)));
        if (shore > 0.0) {
          float rip = smoothstep(0.25, 0.45, n4.a + 0.3 * sw.a);
          vec3 bl = itBlocksNear(w, 1.1, pixA);
          vec3 rr = ${v3(RIPRAP)} * bl.x * (0.8 + 0.4 * n1.g);
          vec3 earth = ${v3(RED_EARTH)} * (0.8 + 0.4 * n1.a) * grain;
          vec3 bank = mix(earth, rr, rip);
          /* Darker where the waves wet it. */
          bank *= mix(0.6, 1.0, smoothstep(uWater.x - 0.2, uWater.x + 0.5, y));
          albedo = mix(albedo, bank, shore);
          nOut = normalize(mix(nOut, normalize(n + vec3(bl.y, 0.0, bl.z) * 0.9 * rip), shore));
          rough = mix(rough, 0.8, shore);
          bare = max(bare, shore);
        }
      }

      /* The rockfill dam's faces: dumped dark basalt, greyer where the
       * reservoir wets the upstream one; where the burned slope flattens
       * into the ground at its foot, grass again. */
      if (w.x > uFillBox.x && w.x < uFillBox.z && w.y > uFillBox.y && w.y < uFillBox.w && y > uFillShape.z - 5.0) {
        float d = itFillDist(w);
        float fill = smoothstep(uFillShape.x - 0.5, uFillShape.x + 1.5, d) * (1.0 - smoothstep(uFillShape.y - 15.0, uFillShape.y + 5.0, d)) * smoothstep(0.06, 0.14, slope);
        if (fill > 0.0) {
          vec3 bl = itBlocksNear(w, 1.5, pixA);
          vec3 dumped = mix(${v3(ROCKFILL)}, ${v3(RIPRAP)}, res) * bl.x * (0.75 + 0.5 * n1.g) * (0.85 + 0.3 * n3.a);
          albedo = mix(albedo, dumped, fill);
          nOut = normalize(mix(nOut, normalize(n + vec3(bl.y, 0.0, bl.z) * 1.6), fill));
          rough = mix(rough, 0.9, fill);
          bare = max(bare, fill);
        }
      }
    }

    diffuseColor.rgb *= albedo;
    /* The whiteout blend on the ground plane (swiss2/ground.js
     * s2Whiteout, plan axis), in the world, then into view space; the
     * photographs' normals are the soil's, not the rock's. */
    tsum = mix(tsum, vec3(0.0, 0.0, 1.0), bare);
    vec3 wn = normalize(vec3(tsum.x * 0.8 + nOut.x, abs(tsum.z) * nOut.y, tsum.y * 0.8 + nOut.z));
    itNrm = wn;
    itRough = rough;
  }
`;

/*
 * Four channels of independent noise, NOISE_PX square, tiling, with
 * mipmaps: the ground's value noise at every scale in one fetch, from a
 * fixed seed so every run draws the same ground.
 */
const NOISE_PX = 256;
function noiseTexture(anisotropy) {
  const data = new Uint8Array(NOISE_PX * NOISE_PX * 4);
  let x = 0x9e3779b9;
  for (let i = 0; i < data.length; i += 1) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    data[i] = x & 255;
  }
  const t = new THREE.DataTexture(data, NOISE_PX, NOISE_PX, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  return t;
}

/*
 * The material. `tex` is { heroCol, ringCol, heroMask, ringMask } from
 * loadImage, `arrays` swiss2's loadTerrainArrays and `site` loadSite's;
 * the caller owns them. `white` is the reflectance the imagery's full
 * scale stands for, and `water` the colour its pipeline
 * filled water with, [r, g, b] of 255 (manifest imagery.colour). The
 * noise texture is the material's own and goes with it.
 */
export function groundMaterial({
  tex, arrays, site, heroHalf, ringHalf, white, water, anisotropy,
}) {
  /* The imagery's water fill as the shader decodes it: linear, times white. */
  const waterCol = new THREE.Color().setRGB(...water.map((v) => v / 255), THREE.SRGBColorSpace);
  const waterRefl = new THREE.Vector3(waterCol.r, waterCol.g, waterCol.b).multiplyScalar(white);
  const axis = site.rockfill.axis;
  const box = new THREE.Box2().setFromPoints(axis).expandByScalar(FILL_REACH + 10);
  const noise = noiseTexture(anisotropy);
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uHeroCol = { value: tex.heroCol };
    shader.uniforms.uRingCol = { value: tex.ringCol };
    shader.uniforms.uHeroMask = { value: tex.heroMask };
    shader.uniforms.uRingMask = { value: tex.ringMask };
    shader.uniforms.uReservoir = { value: site.reservoir };
    shader.uniforms.uNoise = { value: noise };
    shader.uniforms.uLayerCol = { value: arrays.col };
    shader.uniforms.uLayerNrh = { value: arrays.nrh };
    shader.uniforms.uHalf = { value: new THREE.Vector2(heroHalf, ringHalf) };
    shader.uniforms.uWhite = { value: white };
    shader.uniforms.uWater = { value: new THREE.Vector2(site.reservoirY, site.riverY) };
    shader.uniforms.uWaterCol = { value: waterRefl };
    shader.uniforms.uFill = { value: axis };
    shader.uniforms.uFillBox = { value: new THREE.Vector4(box.min.x, box.min.y, box.max.x, box.max.y) };
    shader.uniforms.uFillShape = { value: new THREE.Vector3(site.rockfill.crestHalf, FILL_REACH, site.rockfill.toeY) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vItWorld;\nvarying vec3 vItNormal;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vItWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vItNormal = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${parsFor(axis.length)}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${ALBEDO}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = itRough;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(itNrm, 0.0)).xyz);');
  };
  m.customProgramCacheKey = () => 'itaipu-ground';
  m.name = 'itaipu-ground';
  m.addEventListener('dispose', () => noise.dispose());
  return m;
}
