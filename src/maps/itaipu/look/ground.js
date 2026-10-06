/*
 * ground.js: the terrain's material. The satellite's colour, swiss2's
 * photographed detail under it.
 *
 * WHAT THE GROUND IS MADE OF. Colour is Sentinel-2's (imagery/hero.jpg at
 * 10 m over the hero, imagery/ring.jpg at 40 m over the ring), already
 * display sRGB by the pipeline's fixed curve, so the map never guesses an
 * exposure. Close to, a 10 m pixel is a blur, so the detail comes from
 * CC0 terrain photographs (LAYERS below, docs/ITAIPU-ASSETS.md), chosen
 * per texel by package A's splat masks (masks/*.png: forest, field, red
 * soil, urban, summing to 255): the forest floor's dry leaves, the
 * pasture, the red laterite, and the fine gravel for what is paved. Rock
 * on anything too steep for the photograph from above to mean much.
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
 * The roads (osm/roads.json), so the turf (makeTurf) keeps off them.
 *
 * The files are fetched by the look as well as by the map (itaipu.js
 * readData), because the look is made before the data is read and in
 * parallel with it; the browser's cache serves the second fetch.
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
import { DRESSED } from '../town/roads.js';
import { thermalKind } from '../../../render/thermal.js';
import { decodePng } from '../vegetation/plant.js';

/*
 * THE PHOTOGRAPHS (round 4). Swiss2's were a Bernese valley's: a beech
 * wood's litter, an alpine meadow, a grey trail. Itaipu's own are the
 * place's (docs/ITAIPU-ASSETS.md, every one CC0 from Poly Haven): a
 * subtropical forest's dry broad leaves, a leafy pasture and a sparse one,
 * red laterite with its stones, and red mud rutted by tyres for the
 * tracks; the gravel and the canyon's rock are still swiss2's files. Only
 * the layers the ground reads are loaded: seven, where swiss2's arrays
 * were nine. `tile` is the photograph's own size in metres, as Poly Haven
 * gives it, so a leaf or a stone is its real size.
 */
const ITAIPU_ASSETS = new URL('../../../../assets/itaipu/ground/', import.meta.url);
const SWISS2_ASSETS = new URL('../../../../assets/swiss2/', import.meta.url);
const LAYERS = [
  { name: 'forest', file: 'litter', base: ITAIPU_ASSETS, tile: 2.0 },
  { name: 'field', file: 'grass', base: ITAIPU_ASSETS, tile: 2.0 },
  { name: 'sparse', file: 'grass_sparse', base: ITAIPU_ASSETS, tile: 2.0 },
  { name: 'soil', file: 'laterite', base: ITAIPU_ASSETS, tile: 2.0 },
  { name: 'tracks', file: 'tracks', base: ITAIPU_ASSETS, tile: 2.25 },
  { name: 'urban', file: 'shore', base: SWISS2_ASSETS, tile: 3.0 },
  { name: 'rock', file: 'rock', base: SWISS2_ASSETS, tile: 30 },
];
const LAYER = Object.fromEntries(LAYERS.map((l, k) => [l.name, k]));
const TILE = Object.fromEntries(LAYERS.map((l) => [l.name, l.tile]));
const DETAIL_HUE = 0.3;

/*
 * The layers as two texture arrays, `size` square a layer: the albedo
 * (sRGB) and the normal and height (data), packed as swiss2's are
 * (swiss2/assets.js loadTerrainArrays, whose decoding this follows: no
 * colour management, rows top first). Returns { col, nrh }.
 */
export async function loadGroundArrays(size, anisotropy) {
  const fetchBitmap = async (url) => {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`itaipu ground: ${url}: HTTP ${res.status}`);
    }
    return createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  };
  const bitmaps = await Promise.all(LAYERS.flatMap((l) => ['col', 'nrh'].map((m) => fetchBitmap(new URL(`${l.file}_${m}.jpg`, l.base)))));
  const canvas = new OffscreenCanvas(size, size);
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const layer = size * size * 4;
  const col = new Uint8Array(layer * LAYERS.length);
  const nrh = new Uint8Array(layer * LAYERS.length);
  LAYERS.forEach((l, k) => {
    for (const [bmp, out] of [[bitmaps[k * 2], col], [bitmaps[k * 2 + 1], nrh]]) {
      g.clearRect(0, 0, size, size);
      g.drawImage(bmp, 0, 0, size, size);
      out.set(g.getImageData(0, 0, size, size).data, k * layer);
      bmp.close();
    }
  });
  const make = (data, srgb) => {
    const t = new THREE.DataArrayTexture(data, size, size, LAYERS.length);
    t.format = THREE.RGBAFormat;
    t.type = THREE.UnsignedByteType;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = anisotropy;
    t.needsUpdate = true;
    return t;
  };
  return { col: make(col, true), nrh: make(nrh, false) };
}
/* Where the grain has faded into its mean and is not worth reading. */
const DETAIL_FAR = 1800;

/* Linear reflectance per class (forest, field, red soil, urban): data
 * v2's hero means, and the colour each is graded to. Red soil (round 4):
 * the Alto Parana photographs' bare terra roxa (refs/ground, measured with
 * tools/swiss2-loop/ground.py) is 1.6 to 1.9 red over green and 0.25 to
 * 0.45 blue over green in linear light; round 1's 0.63 blue over green
 * was the salmon pink the renders had, so the blue is taken down and the
 * lightness kept. */
const CLASS_MEAN = [[0.0267, 0.0516, 0.028], [0.0584, 0.0761, 0.0447], [0.0904, 0.0794, 0.0582], [0.1512, 0.1406, 0.117]];
const CLASS_TARGET = [[0.029, 0.05, 0.017], [0.07, 0.083, 0.03], [0.135, 0.075, 0.032], [0.15, 0.139, 0.112]];
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
const RED_EARTH = [0.15, 0.08, 0.034];
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
 * THE CROPS (round 4). The masks have one class for a field, and most
 * of the hero's is pasture; but the parcels south of the river and east
 * of the town are soy and corn, and in December, the imagery's month, a
 * crop in full leaf is a deeper green than any pasture: over the hero's
 * field texels, green over red in linear light is 1.1 to 1.4 on the
 * pastures by the dam and 1.8 to 2.3 on those parcels (measured on data
 * v2's hero.jpg). A field texel well inside the field class whose green
 * over red, over 50 m, is past CROP_GR is a crop. OpenStreetMap maps
 * landuse=farmland over about a square kilometre of the hero, under half
 * of what this finds, so it is not used.
 *
 * Each parcel (a connected run of crop texels) gets its rows along its
 * long axis, the way a field is drilled: the principal axis of its
 * texels. Written as a texture over the hero, a texel a mask texel: the
 * crop's weight (r), the rows' direction as cos and sin of twice its
 * angle (g, b, so a direction and its reverse are one), and a number of
 * the parcel's own (a) for its crop and its growth.
 */
const CROP_GR = [1.6, 2.0];
const CROP_FIELD = [0.75, 0.95];
/* Texels a parcel needs before it is drilled (0.4 ha). */
const CROP_MIN = 40;

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function cropRaster(base, hero) {
  const [colRes, maskRes] = await Promise.all([fetch(`${base}${hero.file}`), fetch(`${base}${hero.masks}`)]);
  if (!colRes.ok || !maskRes.ok) {
    throw new Error(`itaipu look: ${hero.file} or ${hero.masks}: HTTP ${colRes.status}, ${maskRes.status}`);
  }
  const bitmap = await createImageBitmap(await colRes.blob(), { colorSpaceConversion: 'none' });
  const n = bitmap.width;
  const canvas = new OffscreenCanvas(n, n);
  const g2 = canvas.getContext('2d', { willReadFrequently: true });
  g2.drawImage(bitmap, 0, 0);
  bitmap.close();
  const rgb = g2.getImageData(0, 0, n, n).data;
  /* The mask's alpha is a class's weight, which a canvas would
   * premultiply away: decoded by hand, as the vegetation does. */
  const mask = await decodePng(new Uint8Array(await maskRes.arrayBuffer()), inflate);
  if (mask.w !== n || mask.h !== n) {
    throw new Error(`itaipu look: the hero mask is ${mask.w} x ${mask.h}, the imagery ${n} square`);
  }
  const lin = new Float32Array(256).map((v, i) => {
    const c = i / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const N = n * n;
  const red = new Float32Array(N);
  const green = new Float32Array(N);
  const field = new Float32Array(N);
  for (let i = 0; i < N; i += 1) {
    red[i] = lin[rgb[i * 4]];
    green[i] = lin[rgb[i * 4 + 1]];
    field[i] = mask.data[i * 4 + 1] / 255;
  }
  /* Over 50 m: a 5 x 5 box, rows then columns. */
  const box = (a) => {
    const t = new Float32Array(N);
    const out = new Float32Array(N);
    for (let j = 0; j < n; j += 1) {
      for (let i = 0; i < n; i += 1) {
        let s = 0;
        for (let k = -2; k <= 2; k += 1) {
          s += a[j * n + Math.min(n - 1, Math.max(0, i + k))];
        }
        t[j * n + i] = s / 5;
      }
    }
    for (let j = 0; j < n; j += 1) {
      for (let i = 0; i < n; i += 1) {
        let s = 0;
        for (let k = -2; k <= 2; k += 1) {
          s += t[Math.min(n - 1, Math.max(0, j + k)) * n + i];
        }
        out[j * n + i] = s / 5;
      }
    }
    return out;
  };
  const rB = box(red);
  const gB = box(green);
  const fB = box(field);
  const step = (e, x) => {
    const t = Math.min(1, Math.max(0, (x - e[0]) / (e[1] - e[0])));
    return t * t * (3 - 2 * t);
  };
  const weight = new Float32Array(N);
  for (let i = 0; i < N; i += 1) {
    weight[i] = step(CROP_GR, gB[i] / Math.max(rB[i], 1e-4)) * step(CROP_FIELD, fB[i]);
  }
  /* The parcels, and each one's long axis. */
  const label = new Int32Array(N).fill(-1);
  const queue = new Int32Array(N);
  const out = new Uint8Array(N * 4);
  for (let i = 0; i < N; i += 1) {
    out[i * 4] = Math.round(255 * weight[i]);
    out[i * 4 + 1] = 128;
    out[i * 4 + 2] = 128;
  }
  let parcels = 0;
  for (let s = 0; s < N; s += 1) {
    if (label[s] >= 0 || weight[s] < 0.5) {
      continue;
    }
    let head = 0;
    let tail = 0;
    queue[tail++] = s;
    label[s] = parcels;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    while (head < tail) {
      const p = queue[head++];
      const x = p % n;
      const y = (p - x) / n;
      sx += x;
      sy += y;
      sxx += x * x;
      syy += y * y;
      sxy += x * y;
      for (const q of [x > 0 ? p - 1 : -1, x < n - 1 ? p + 1 : -1, y > 0 ? p - n : -1, y < n - 1 ? p + n : -1]) {
        if (q >= 0 && label[q] < 0 && weight[q] >= 0.5) {
          label[q] = parcels;
          queue[tail++] = q;
        }
      }
    }
    if (tail >= CROP_MIN) {
      const mx = sx / tail;
      const my = sy / tail;
      /* Twice the major axis's angle, in the image's x (east) and y
       * (south, the world's z). */
      const a2 = Math.atan2(2 * (sxy / tail - mx * my), (sxx / tail - mx * mx) - (syy / tail - my * my));
      const own = Math.round(255 * (((Math.sin(mx * 12.9898 + my * 78.233) * 43758.5453) % 1 + 1) % 1));
      for (let k = 0; k < tail; k += 1) {
        const p = queue[k];
        out[p * 4 + 1] = Math.round(127.5 + 127.5 * Math.cos(a2));
        out[p * 4 + 2] = Math.round(127.5 + 127.5 * Math.sin(a2));
        out[p * 4 + 3] = own;
      }
    }
    parcels += 1;
  }
  /* The direction carried two texels past each parcel's edge, so the
   * filtered texture's rows keep their line to where the weight ends. */
  for (let pass = 0; pass < 2; pass += 1) {
    const src = out.slice();
    for (let i = 0; i < N; i += 1) {
      if (src[i * 4 + 1] !== 128 || src[i * 4 + 2] !== 128) {
        continue;
      }
      const x = i % n;
      for (const q of [x > 0 ? i - 1 : -1, x < n - 1 ? i + 1 : -1, i - n, i + n]) {
        if (q >= 0 && q < N && (src[q * 4 + 1] !== 128 || src[q * 4 + 2] !== 128)) {
          out[i * 4 + 1] = src[q * 4 + 1];
          out[i * 4 + 2] = src[q * 4 + 2];
          out[i * 4 + 3] = src[q * 4 + 3];
          break;
        }
      }
    }
  }
  return { data: out, size: n };
}

/*
 * Read the site from the data folder at `base`. Returns { reservoir,
 * reservoirY, riverY, crops: { data, size } (cropRaster's, which
 * groundMaterial makes its texture of), rockfill: { axis:
 * [THREE.Vector2], crestHalf, toeY }, roads: [{ points: [[x, z]], width
 * }] }; the caller owns reservoir, a texture.
 */
export async function loadSite(base, ringHalf) {
  const [water, dam, roads, manifest] = await Promise.all([
    fetchJson(`${base}water.json`),
    fetchJson(`${base}dam.json`),
    fetchJson(`${base}osm/roads.json`),
    fetchJson(`${base}manifest.json`),
  ]);
  const crops = await cropRaster(base, manifest.imagery.hero);
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
    crops,
    rockfill: {
      axis: fill.axis.map(([x, z]) => new THREE.Vector2(x, z)),
      crestHalf: fill.sections[0].crestWidth / 2,
      toeY: fill.baseY,
    },
    /* Where no grass stands up through the paving (makeTurf): every
     * road but a tunnel, the dam's crest roads included, a dressed one
     * at the width town/roads.js draws it with its verges. */
    roads: roads.features.filter((f) => !f.tunnel).map((f) => {
      const dressed = DRESSED[f.id];
      return { points: f.points, width: dressed ? dressed.width + 2 * dressed.verge : f.width };
    }),
  };
}

/* The hashes and noises the ground and the turf (makeTurf) share: the
 * turf reads the ground's patches, so its blades stand where the ground
 * under them is grass. Needs uNoise. */
const NOISE_GLSL = /* glsl */ `
  float itHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  /* Smooth value noise, a unit a feature, and with its gradient (after
   * Quilez). Hashed rather than read from uNoise, so it has no mips: every
   * use fades it out by the pixel's size itself. */
  float itNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(itHash(i), itHash(i + vec2(1.0, 0.0)), u.x),
               mix(itHash(i + vec2(0.0, 1.0)), itHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  vec3 itNoiseD(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    vec2 du = 6.0 * f * (1.0 - f);
    float a = itHash(i);
    float b = itHash(i + vec2(1.0, 0.0));
    float c = itHash(i + vec2(0.0, 1.0));
    float d = itHash(i + vec2(1.0, 1.0));
    float k = a - b - c + d;
    return vec3(a + (b - a) * u.x + (c - a) * u.y + k * u.x * u.y, du * (vec2(b - a, c - a) + k * u.yx));
  }
  /* A wheel's rut w wide about x == 0, worn most down its middle; a pixel
   * wide at its average once it is narrower than one (swiss2's s2Rut). */
  float itRut(float x, float w, float px) {
    float wide = max(w, px);
    return (1.0 - smoothstep(0.1 * wide, 0.5 * wide + 0.5 * px, abs(x))) * (w / wide);
  }
  /* The noise texture as value noise with features m metres across: its
   * mipmaps take it to its mean as a pixel outgrows m, so it needs no fade. */
  vec4 itTex(vec2 w, float m, float o) {
    return texture(uNoise, w / (256.0 * m) + o);
  }
  /* The ground's patches at w, each spread round 0.5: x dry against lush,
   * metres across; y clover and undergrowth, z bare earth, and tufts on
   * soil, a metre or two; w a spare at that scale. Two octaves turned
   * against each other, so the texture's grid does not show. */
  vec4 itPatches(vec2 w) {
    vec2 wr = mat2(0.8, 0.6, -0.6, 0.8) * w;
    vec4 big = itTex(w, 9.0, 0.13) * 0.65 + itTex(wr, 3.4, 0.47) * 0.35;
    vec4 mid = itTex(w, 1.3, 0.71) * 0.6 + itTex(wr, 0.55, 0.29) * 0.4;
    /* The sum of two octaves has half the spread of one. */
    return vec4(0.5 + 1.6 * (big.r - 0.5), 0.5 + 1.6 * (mid.g - 0.5), 0.5 + 1.6 * (mid.b - 0.5), mid.a);
  }
  /* Where the grass is dry and thin enough to show the earth. */
  float itBare(vec4 pt) {
    return pt.z * 0.35 + pt.x * 0.65;
  }
  /* The vehicle tracks: a line where a slow noise crosses its middle,
   * broken where a slower one says no one drives there (more of them on
   * bare soil, soilW). Returns the signed metres from the line (x),
   * whether it is driven (y), and the noise's gradient (zw). */
  vec4 itTrack(vec2 w, float soilW) {
    vec3 ta = itNoiseD(w / 210.0 + 13.1);
    vec3 tb = itNoiseD(w / 64.0 + 5.3);
    vec2 g = ta.yz / 210.0 + 0.2 * tb.yz / 64.0;
    float d = (ta.x + 0.2 * tb.x - 0.6) / max(length(g), 1e-4);
    float used = smoothstep(0.35, 0.6, textureLod(uNoise, w / (256.0 * 60.0) + 0.9, 0.0).g + 0.25 * soilW);
    return vec4(d, used, g);
  }
`;

const parsFor = (axisN) => /* glsl */ `
  /* The land cover and the wet, for the thermal picture (thermal.js's
   * ground kind): forest, field, bare soil and rock, town. */
  vec4 itThCover = vec4(0.0, 1.0, 0.0, 0.0);
  float itThWet = 0.0;
  uniform sampler2D uHeroCol;
  uniform sampler2D uRingCol;
  uniform sampler2D uHeroMask;
  uniform sampler2D uRingMask;
  uniform sampler2D uReservoir;
  uniform sampler2D uNoise;
  uniform sampler2D uCrops;
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
  /* How much of the ground is a crop (CROPS), for the eye level detail. */
  float itCrop = 0.0;
  vec3 itCropT = vec3(1.0);
${NOISE_GLSL}
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
 * ROUND 2 (docs/ITAIPU-LOOP.md target 2): the ground at eye level. Under
 * a few hundred metres the satellite and one photograph a class were a
 * lawn: even, one green, the same everywhere. What a photograph of the
 * place has there, per class, as multipliers on the colour above so the
 * satellite still says what the ground is:
 *
 *   pasture   dry straw and lush green in patches metres across, clover,
 *             tufts with dark gaps between, bare terra roxa showing
 *             through, and red dirt tracks winding across it: a band
 *             of bare earth with a rut either side;
 *   red soil  clods, damp dark hollows, grass come back in tufts, and
 *             the same tracks, more of them;
 *   town      concrete slabs where the satellite is bright, laterite
 *             gravel where it is not, and a gravel verge where town
 *             meets grass;
 *   forest    leaf litter, brown and orange, with green undergrowth.
 *
 * Each pattern fades to its mean as a pixel outgrows it, and the whole
 * fades out over the second half of NEAR_FAR, so where it ends is a
 * gradient into round 1's colour, not a line. Under a few metres a pixel
 * the satellite's own blots are flattened toward their classes' colour
 * too, and its lookup wandered, so the patches carry the variation there
 * rather than a magnified 10 m pixel.
 */
/* Where the eye-level detail has faded out and is not worked out. */
const NEAR_FAR = 700;
/* Tints on the graded class colour. The straw was 1.28, 1.1, 0.66 in
 * round 2: its patches, metres across and hard edged, read from a drone
 * at 12 to 25 m as yellow camouflage painted on a lawn (round 4's
 * ground-field-low and ground-pasture-low); a December pasture is green
 * with drier patches, not straw, so they are half as far from the lush. */
const STRAW = [1.14, 1.06, 0.8];
const LUSH = [0.9, 1.02, 0.86];
const CLOVER = [0.82, 1.12, 0.98];
/* The pasture's tint over its patches, about one straw to six lush
 * (dry = smoothstep(0.5, 0.8) of a patch value spread round 0.5): the
 * tint is divided by it, so the pasture's mean is round 1's colour and
 * where the detail fades out the colour does not move. */
const GRASS_MEAN = LUSH.map((l, c) => l + (STRAW[c] - l) * 0.15);
/* Saturation on the pasture near the lens, and on its blades. Under the
 * round 2 sun (#231) the eye-level views' greens measured 0.29 against
 * the photographs' 0.34 (tools/swiss2-loop/colour.py Sg, over the ten
 * eye-level views), the pastures most: powerlines 0.34 against 0.51.
 * At 1.2 the mean is 0.33; 1.3 overshot to 0.36, the lawns at the
 * reservoir and the canyon well past their photographs. */
const PASTURE_SAT = 1.2;
/* Bare terra roxa in a pasture and on its tracks, at a pasture's
 * lightness: a deeper, less blue red than the shore's red earth, which
 * at this lightness read pink. */
const TERRA = [0.13, 0.065, 0.027];
const UNDERGROWTH = [0.7, 1.45, 0.62];
const LITTER = [1.22, 0.95, 0.72];
/* The graded field and soil colours, for bare soil in a pasture and
 * grass on bare soil. */
const FIELD_COL = CLASS_TARGET[1];
const SOIL_COL = CLASS_TARGET[2];
const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];

const NEAR = /* glsl */ `
      float nearK = 1.0 - smoothstep(${(NEAR_FAR * 0.5).toFixed(1)}, ${NEAR_FAR.toFixed(1)}, dist);
      if (nearK > 0.0) {
        float kPatch = 1.0 - smoothstep(1.0, 4.0, pix);
        /* The satellite's own blots, magnified, are a smear, and the
         * patches below say more at this range: the pixel's difference
         * from its classes' colour is taken down, in ratio. */
        vec3 classCol = (grade * sw).rgb * (means * sw).rgb;
        float flatK = 0.45 * (1.0 - smoothstep(1.5, 6.0, pix)) * nearK;
        col = classCol * pow(max(col, vec3(1e-4)) / max(classCol, vec3(1e-4)), vec3(1.0 - flatK));
        float lumC = dot(col, vec3(0.3, 0.59, 0.11));
        /* Patches metres across (dry or lush), a metre or two (clover,
         * bare soil, undergrowth), and the finest: the noise texture at
         * each scale, two octaves turned against each other so its grid
         * does not show, faded by its own mipmaps. */
        vec2 wr = mat2(0.8, 0.6, -0.6, 0.8) * w;
        vec4 pt = itPatches(w);
        vec4 fine = itTex(w, 0.11, 0.53);
        vec4 clump = itTex(wr, 0.38, 0.21);
        float mWide = pt.x;
        float mPatch = pt.y;
        float mAlt = pt.z;
        float pAlt = pt.w;

        /* Pasture. */
        float dry = smoothstep(0.5, 0.8, mWide);
        vec3 grass = mix(${v3(LUSH)}, ${v3(STRAW)}, dry) / ${v3(GRASS_MEAN)};
        grass = mix(grass, ${v3(CLOVER)}, smoothstep(0.6, 0.72, mPatch) * (1.0 - dry) * kPatch);
        grass *= 0.7 + 0.6 * (0.55 * fine.g + 0.45 * clump.a);
        /* Bare earth where the grass is dry and thin, ragged at its edge
         * and with tufts left standing in it. */
        float bareF = smoothstep(0.74, 0.82, itBare(pt) + 0.25 * (clump.r - 0.5)) * (1.0 - smoothstep(0.1, 0.35, pix)) * (1.0 - 0.6 * smoothstep(0.55, 0.7, fine.a));
        vec3 soilHere = ${v3(TERRA)} * (lumC / ${lum(FIELD_COL).toFixed(4)}) / max(col, vec3(0.005));
        grass = mix(grass, soilHere * (0.75 + 0.5 * fine.r), bareF);
        /* A crop is one stand of one plant, sown on one day: none of the
         * pasture's patches, only its leaves' grain (the rows are CROPS'). */
        grass = mix(grass, vec3(0.92 + 0.16 * fine.g), itCrop);

        /* Red soil. */
        vec3 soil = vec3(0.8 + 0.4 * fine.b) * (0.85 + 0.3 * clump.g);
        soil *= mix(1.0, 0.78, smoothstep(0.62, 0.8, mWide));
        float tuftS = smoothstep(0.64, 0.74, mAlt) * kPatch;
        vec3 grassHere = ${v3(FIELD_COL)} * (lumC / ${lum(SOIL_COL).toFixed(4)}) / max(col, vec3(0.005));
        soil = mix(soil, grassHere * (0.7 + 0.6 * fine.g), tuftS);

        /* Town: slabs where the satellite is bright, laterite gravel where
         * it is not. */
        float slabsK = smoothstep(1.05, 1.3, lumC / ${lum(CLASS_TARGET[3]).toFixed(4)}) * smoothstep(0.5, 0.8, mask.a);
        vec2 sc = w / 2.8;
        vec2 sf = abs(fract(sc) - 0.5) * 2.8;
        float joint = 1.0 - smoothstep(1.38 - max(0.03, pix), 1.4, max(sf.x, sf.y));
        joint *= 1.0 - smoothstep(0.1, 0.4, pix);
        vec3 slab = vec3((0.9 + 0.2 * itHash(floor(sc) + 0.7)) * (1.0 - 0.45 * joint) * (0.85 + 0.3 * mPatch));
        vec3 gravel = mix(vec3(1.0), ${v3(RED_EARTH)} / max(col, vec3(0.01)) * lumC / ${lum(RED_EARTH).toFixed(4)}, 0.3) * (0.8 + 0.4 * fine.a);
        vec3 town = mix(gravel, slab, slabsK);

        /* Forest floor. */
        vec3 litter = mix(vec3(0.85, 0.9, 0.85), ${v3(LITTER)}, fine.r) * (0.65 + 0.7 * fine.g);
        litter = mix(litter, ${v3(UNDERGROWTH)} * (0.7 + 0.6 * clump.b), smoothstep(0.58, 0.7, mPatch) * kPatch);

        vec3 tint = sw.r * litter + sw.g * grass + sw.b * soil + sw.a * town;

        /* Where town meets grass or soil, a verge of gravel and dust. */
        float verge = smoothstep(0.1, 0.25, mask.a) * (1.0 - smoothstep(0.4, 0.6, mask.a)) * (1.0 - mask.r) * kPatch;
        tint = mix(tint, gravel * mix(1.0, 0.85, fine.b), verge * smoothstep(0.35, 0.55, mAlt));

        /* Vehicle tracks across pasture and bare soil (itTrack), the red
         * dirt tracks the photographs have winding through every lawn: a
         * band of bare earth, grass come back down its middle, and a rut
         * worn deeper either side. */
        float open = sw.g + sw.b;
        float kTrack = (1.0 - smoothstep(2.5, 8.0, pix)) * smoothstep(0.5, 0.8, open) * (1.0 - smoothstep(0.2, 0.35, slope0)) * (1.0 - itCrop);
        if (kTrack > 0.0) {
          vec4 tr = itTrack(w, sw.b);
          float d = tr.x;
          float used = tr.y;
          vec2 tg = tr.zw;
          float ad = abs(d);
          float band = 1.0 - smoothstep(1.3, 1.6 + pix, ad);
          float rut = itRut(ad - 0.85, 0.38 + 0.1 * pAlt, pix);
          float trackK = kTrack * used * step(ad, 3.0 + pix);
          float middle = (1.0 - smoothstep(0.2, 0.45, ad)) * 0.6 * (1.0 - smoothstep(0.3, 1.0, pix));
          vec3 rutCol = soilHere * mix(0.62, 0.9, fine.b);
          /* The band is the tyre rutted mud's photograph, laid along the
           * track. */
          vec2 along = normalize(vec2(-tg.y, tg.x) + 1e-6);
          float mud = itPattern(${LAYER.tracks.toFixed(1)}, vec2(dot(w, along), d) / ${TILE.tracks.toFixed(2)});
          tint = mix(tint, soilHere * (0.85 + 0.3 * fine.a) * mud, band * trackK * (1.0 - middle));
          tint = mix(tint, rutCol, rut * trackK);
          /* The rut's sides face into it. */
          vec2 across = normalize(tg + 1e-6) * sign(d) * sign(ad - 0.85);
          nearTilt += vec3(across.x, 0.0, across.y) * 0.45 * rut * trackK * (1.0 - smoothstep(0.1, 0.3, pix));
        }
        /* Tufts: each clump of blades lit as its own little face. */
        nearTilt += vec3(clump.g - 0.5, 0.0, clump.a - 0.5) * 1.2 * sw.g * (1.0 - smoothstep(0.15, 0.6, pix)) * (1.0 - bareF);
        col *= mix(vec3(1.0), tint, nearK);
        /* The pasture's green, a little deeper close to (PASTURE_SAT). */
        float lumP = dot(col, vec3(0.3, 0.59, 0.11));
        col = max(vec3(lumP) + (col - lumP) * (1.0 + ${(PASTURE_SAT - 1).toFixed(2)} * sw.g * nearK), vec3(0.0));
      }
`;

/*
 * THE CROPS' ROWS (round 4), over cropRaster's parcels: soy drilled at
 * SOY_ROW and corn at CORN_ROW (the region's spacings, a parcel's own
 * number picks which and how far its leaves have closed over the
 * ground), the sprayer's tramlines, a pair of wheel tracks every TRAM_M
 * across the rows that every aerial of a Parana soy field has, and on a
 * field that slopes the terraces (terracos em nivel), a grassed bank
 * along the contour every TERRACE_H of height. All of it multiplies the
 * satellite's colour by a tint whose mean is one, so the parcel is its
 * own colour from the air, and each fades as it shrinks under a pixel.
 */
const SOY_ROW = 0.45;
const CORN_ROW = 0.8;
const TRAM_M = 27;
const TERRACE_H = 2.0;
/* How the rows move the crop's colour, per unit of their wave: the
 * plants lighter and greener, the gaps between darker and redder with
 * the soil and the shade in them. In a wheel track, the soil in the sun
 * and the flattened leaves, against the crop's mean. */
const ROW_TINT = [0.4, 0.6, 0.6];
const WHEEL = [2.1, 1.05, 1.1];
const CROPS = /* glsl */ `
      if (inHero > 0.0) {
        vec4 cr = texture2D(uCrops, (w + uHalf.x) / (2.0 * uHalf.x));
        float cropW = smoothstep(0.45, 0.8, cr.r) * sw.g * inHero;
        vec2 c2 = cr.gb * 2.0 - 1.0;
        float l2 = length(c2);
        if (cropW > 0.0 && l2 > 0.3) {
          /* The rows' direction from twice its angle. */
          c2 /= l2;
          vec2 dir = vec2(sqrt(max(0.5 + 0.5 * c2.x, 0.0)), sign(c2.y) * sqrt(max(0.5 - 0.5 * c2.x, 0.0)));
          float across = dot(w, vec2(-dir.y, dir.x));
          float ph = across / mix(${SOY_ROW.toFixed(2)}, ${CORN_ROW.toFixed(2)}, step(0.62, cr.a));
          /* The rows as the first two harmonics of their profile, each
           * faded as a pixel spans more of its cycle (near enough a box
           * filter's loss): the mean is one at any distance and nothing
           * aliases. The more open the canopy, the stronger the rows. */
          float fw = fwidth(ph);
          float cover = mix(0.5, 0.85, fract(cr.a * 7.31));
          float rows = (0.35 * (1.0 - cover) + 0.25) * (cos(6.2832 * ph) * exp(-24.0 * fw * fw) + 0.35 * cos(12.566 * ph) * exp(-96.0 * fw * fw));
          vec3 cropT = vec3(1.0) + rows * ${v3(ROW_TINT)};
          float tram = abs(fract(across / ${TRAM_M.toFixed(1)} + 0.37) - 0.5) * ${TRAM_M.toFixed(1)};
          float wheel = itRut(abs(tram - 0.9), 0.45, max(fwidth(across), 0.01));
          cropT = mix(cropT, ${v3(WHEEL)}, wheel);
          float terraced = smoothstep(0.02, 0.05, slope0);
          if (terraced > 0.0) {
            float level = (y + 1.2 * (n3.g - 0.5)) / ${TERRACE_H.toFixed(1)};
            float bank = abs(fract(level + 0.5) - 0.5) * ${TERRACE_H.toFixed(1)} / max(slope0, 0.01);
            cropT *= mix(vec3(1.0), vec3(1.1, 1.08, 0.9), itRut(bank, 2.2, pix) * terraced);
          }
          itCropT = cropT;
          itCrop = cropW;
        }
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
    float dist = distance(vItWorld, cameraPosition);
    /* Near the eye the hero's 10 m pixels are magnified into soft round
     * blots; the lookup is wandered a few metres, so a blot's edge is as
     * ragged as the patch of ground it stands for. */
    vec2 wq = w;
    float warpK = 1.0 - smoothstep(2.5, 9.0, pix);
    if (warpK > 0.0) {
      wq += (itTex(w, 4.0, 0.31).rg - 0.5) * 9.0 * warpK;
      wq += (itTex(w, 1.3, 0.77).ba - 0.5) * 3.0 * warpK;
    }
    vec2 hu = (wq + uHalf.x) / (2.0 * uHalf.x);
    vec2 ru = (wq + uHalf.y) / (2.0 * uHalf.y);
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
    itThWet = bed ? 1.0 : 0.0;
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
      float slope0 = sqrt(max(0.0, 1.0 - n.y * n.y)) / max(n.y, 0.05);
      vec3 nearTilt = vec3(0.0);
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
      itThCover = mask;
      itThWet = watery;
${CROPS}
${NEAR}
      /* After the eye level detail, which flattens the satellite's blots
       * toward their class and would take the rows down with them. */
      col *= mix(vec3(1.0), itCropT, itCrop);

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
        /* A second photograph five times the size under the first, the
         * sparse pasture's thin and bare patches, so a field is not a
         * thousand copies of one tile. */
        vec3 tb;
        vec3 big = itGrain(${LAYER.sparse.toFixed(1)}, mat2(0.8, 0.6, -0.6, 0.8) * w / ${(TILE.sparse * 5.3).toFixed(2)} + vec2(0.37, 0.71), tb);
        g *= mix(vec3(1.0), big, 0.35 * (sw.g + sw.r));
        grain = mix(vec3(1.0), g, near);
        tsum = mix(vec3(0.0, 0.0, 1.0), tsum, near);
      }
      albedo = col * grain;
      nOut = normalize(nOut + nearTilt);
      rough = mix(0.93, 0.82, sw.a);
      bare = 0.0;

      /* The canyon's basalt: slopes in its band of height, and anything
       * too steep for a photograph from above to mean much; under a few
       * metres over the river, all of it the tailwater's rock. */
      float slope = slope0;
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
        /* The river's margin: loose wet blocks, boulders in some reaches
         * and cobbles in gravel in others (round 2: one size of block
         * everywhere read as a paved yard), each block lit as its face. */
        vec3 bl = vec3(1.0, 0.0, 0.0);
        if (margin > 0.0) {
          float boulders = smoothstep(0.4, 0.6, itTex(w, 7.0, 0.83).r * 0.7 + itTex(w, 2.2, 0.37).g * 0.3);
          bl = mix(itBlocksNear(w + 3.7, 0.7, pixA), itBlocksNear(w, 2.4, pixA), boulders);
          float gravel = (0.5 + 0.35 * itTex(w, 0.07, 0.11).b) * mix(0.75, 0.45, boulders);
          vec3 wet = mix(${v3(BASALT_WET)}, ${v3(BASALT)}, smoothstep(uWater.y + 0.5, uWater.y + 5.0, y));
          vec3 loose = mix(wet * max(bl.x, gravel) * (0.8 + 0.4 * n1.g), col * 0.8, smoothstep(0.66, 0.8, n2.b) * smoothstep(uWater.y + 3.0, uWater.y + 6.0, y));
          basalt = mix(basalt, loose, margin);
        }
        vec3 riser = normalize(vec3(n.x, n.y * 0.35, n.z));
        vec3 shelfN = normalize(mix(n, vec3(0.0, 1.0, 0.0), 0.8));
        vec3 nb = normalize(mix(n, mix(riser, shelfN, ledge), stepK) + vec3(bl.y, 0.0, bl.z) * 1.2 * margin);
        albedo = mix(albedo, basalt, rockW);
        nOut = normalize(mix(nOut, nb, rockW));
        rough = mix(rough, mix(0.9, 0.65, margin), rockW);
        bare = max(bare, rockW * (1.0 - scrub));
        itThCover = mix(itThCover, vec4(0.0, 0.0, 1.0, 0.0), rockW * (1.0 - scrub));
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
export function noiseTexture(anisotropy) {
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
 * filled water with, [r, g, b] of 255 (manifest imagery.colour). `noise`
 * is noiseTexture's, which the turf reads too; the caller owns it.
 */
export function groundMaterial({
  tex, arrays, site, heroHalf, ringHalf, white, water, noise,
}) {
  /* The imagery's water fill as the shader decodes it: linear, times white. */
  const waterCol = new THREE.Color().setRGB(...water.map((v) => v / 255), THREE.SRGBColorSpace);
  const waterRefl = new THREE.Vector3(waterCol.r, waterCol.g, waterCol.b).multiplyScalar(white);
  const axis = site.rockfill.axis;
  const box = new THREE.Box2().setFromPoints(axis).expandByScalar(FILL_REACH + 10);
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  const crops = new THREE.DataTexture(site.crops.data, site.crops.size, site.crops.size, THREE.RGBAFormat, THREE.UnsignedByteType);
  crops.magFilter = THREE.LinearFilter;
  crops.minFilter = THREE.LinearFilter;
  crops.generateMipmaps = false;
  crops.needsUpdate = true;
  m.addEventListener('dispose', () => crops.dispose());
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uCrops = { value: crops };
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
  return thermalKind(m, 'ground');
}

/*
 * THE TURF. Seen from a metre or two, a pasture is blades, not a
 * photograph of blades laid flat: the grass stands up against the light,
 * its tips paler than its roots, and the ground between shows only in
 * the gaps. So round the camera the ground grows real blades, a clump on
 * each cell of a TURF_STEP grid out to TURF_RADIUS, as swiss2's meadow
 * does (swiss2/vegetation/grass.js), but worked out on the GPU from what
 * the ground's own shader reads, so no tile is built in JavaScript and it
 * is one draw:
 *
 *   where     the masks and the ground's patches (itPatches, itBare,
 *             itTrack): thick in pasture, gone on its bare earth and in
 *             the ruts, in tufts on red soil where the ground shows them,
 *             sparse undergrowth in forest, nothing in town, on the shore
 *             or by the river;
 *   colour    the ground's graded colour under it, dry or lush as the
 *             ground's patch is;
 *   height    on the hero's 10 m heights (look/index.js setHeights),
 *             interpolated over the same triangles the terrain draws
 *             (terrain/engine.js tri), so a clump stands on
 *             the ground rather than in it.
 *
 * The instances are a fixed disc of cell offsets from the camera's cell,
 * and a clump's jitter, turn and height are hashed from its cell in the
 * world, so the camera moving refills nothing and the grass stays where
 * it grew. A blade is a pixel or so wide however far it is (narrower ones
 * shimmer), and the far ring draws fewer of them, wider. Over
 * TURF_CEILING above the ground a craft sees only the tops of the
 * nearest clumps, and the ground's tufts carry it, so the turf is not
 * drawn at all: no call and no triangles in the aerial views.
 */
const TURF_STEP = 0.26;
const TURF_RADIUS = 16;
const TURF_CEILING = 24;
/* Blades a clump, near; five vertices each, three triangles. */
const TURF_BLADES = 9;
/* The blades against the ground's average colour. Seen from the side
 * and lit through, a blade is paler than the turf seen from above, soil
 * and shade and all; and the post chain's occlusion (swiss2/post.js
 * AoPass), which reads the blades as a crevice a hand deep, takes about
 * a fifth off the turf as a whole (measured: the band of turf in
 * rockfill-road was 0.82 of the same ground without it at 1.15). */
const TURF_GAIN = 1.6;

/* The roads round the camera, stroked into a small mask for the turf
 * to keep off: ROADS_PX a side over ROADS_SPAN metres (a quarter metre a
 * texel), redrawn round the camera once it has moved ROADS_MOVE from where
 * it was last drawn round, which the turf's radius leaves room for. */
const ROADS_PX = 256;
const ROADS_SPAN = 64;
const ROADS_MOVE = 10;
/* The grass stands this far off a road's edge, metres. */
const ROADS_VERGE = 0.6;

function turfGeometry() {
  const pos = [];
  const idx = [];
  for (let k = 0; k < TURF_BLADES; k += 1) {
    const b = k * 5;
    pos.push(-1, 0, k, 1, 0, k, -1, 0.55, k, 1, 0.55, k, 0, 1, k);
    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2, b + 2, b + 3, b + 4);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const cells = [];
  const n = Math.ceil(TURF_RADIUS / TURF_STEP) + 1;
  for (let j = -n; j <= n; j += 1) {
    for (let i = -n; i <= n; i += 1) {
      if (Math.hypot(i, j) * TURF_STEP <= TURF_RADIUS + TURF_STEP) {
        cells.push(i, j);
      }
    }
  }
  g.setAttribute('aCell', new THREE.InstancedBufferAttribute(new Float32Array(cells), 2));
  g.instanceCount = cells.length / 2;
  return g;
}

const TURF_VERTEX = /* glsl */ `
  {
    vec2 cell = uTurfSnap + aCell;
    float h1 = itHash(cell + 0.5);
    float h2 = itHash(cell + 7.3);
    float h3 = itHash(cell + 13.9);
    float h4 = itHash(cell + 21.1);
    vec2 base = (cell + 0.15 + 0.7 * vec2(h1, h2)) * ${TURF_STEP.toFixed(3)};
    float dist = distance(base, cameraPosition.xz);
    vec2 hu = (base + uHalf.x) / (2.0 * uHalf.x);
    vec4 mask = textureLod(uHeroMask, hu, 0.0);
    mask /= max(dot(mask, vec4(1.0)), 1e-3);
    vec4 pt = itPatches(base);
    float bare = smoothstep(0.74, 0.82, itBare(pt));
    float dry = smoothstep(0.5, 0.8, pt.x);
    float density = mask.g * (1.0 - bare)
      + mask.b * smoothstep(0.64, 0.74, pt.z)
      + mask.r * 0.4 * smoothstep(0.58, 0.7, pt.y);
    density *= 1.0 - smoothstep(0.08, 0.25, mask.a);
    vec4 tr = itTrack(base, mask.b);
    float open = step(0.5, mask.g + mask.b);
    float ad = abs(tr.x);
    float band = (1.0 - smoothstep(1.3, 1.6, ad)) * tr.y * open;
    density *= 1.0 - band * smoothstep(0.35, 0.5, ad);

    /* The ground under it, on the terrain's own triangles. */
    vec2 g = (base + uTurfGrid.x) / uTurfGrid.y;
    ivec2 gi = ivec2(floor(g));
    vec2 f = fract(g);
    float h00 = texelFetch(uTurfHeights, gi, 0).r;
    float h10 = texelFetch(uTurfHeights, gi + ivec2(1, 0), 0).r;
    float h01 = texelFetch(uTurfHeights, gi + ivec2(0, 1), 0).r;
    float h11 = texelFetch(uTurfHeights, gi + ivec2(1, 1), 0).r;
    float gy = f.x + f.y <= 1.0
      ? h00 + (h10 - h00) * f.x + (h01 - h00) * f.y
      : h11 + (h01 - h11) * (1.0 - f.x) + (h10 - h11) * (1.0 - f.y);
    /* Not on anything steeper than a bank a mower could cross, not on the
     * reservoir's margin or under it, not by the river. */
    float slope = max(abs(h10 - h00), abs(h01 - h00)) / uTurfGrid.y;
    density *= 1.0 - smoothstep(0.35, 0.5, slope);
    float res = textureLod(uReservoir, (base + uHalf.y) / (2.0 * uHalf.y), 0.0).r;
    density *= 1.0 - res * (1.0 - smoothstep(uWater.x + 0.5, uWater.x + 1.1, gy));
    density *= smoothstep(uWater.y + 5.0, uWater.y + 8.0, gy);
    density *= 1.0 - smoothstep(0.1, 0.4, textureLod(uTurfRoads, (base - uTurfRoadsAt) / ${ROADS_SPAN.toFixed(1)} + 0.5, 0.0).r);

    float edge = ${TURF_RADIUS.toFixed(1)} * (0.7 + 0.3 * h3);
    float grow = (1.0 - smoothstep(edge * 0.6, edge, dist)) * step(h4, density * 1.15);
    /* The far ring: fewer blades, each still a pixel or so wide. */
    float k = position.z;
    float kept = mix(${TURF_BLADES.toFixed(1)}, 3.0, smoothstep(3.0, 11.0, dist));
    grow *= step(k + 0.5, kept);
    float pix = dist * uTurfPix;

    float hb1 = itHash(cell + k * 1.73 + 3.1);
    float hb2 = itHash(cell + k * 2.91 + 5.7);
    float hb3 = itHash(cell + k * 4.37 + 9.2);
    float tall = mix(0.2, 0.46, dry) * mix(1.0, 0.45, band) * mix(0.55, 1.0, min(density, 1.0));
    /* Lower toward the ring's edge, so it thins into the ground's tufts
     * rather than ending, and the occlusion finds less to darken there. */
    tall *= mix(1.0, 0.55, smoothstep(5.0, 14.0, dist));
    float hk = tall * (0.55 + 0.45 * hb1) * (0.8 + 0.4 * h3) * grow;
    float a = 6.2832 * hb2;
    vec2 root = base + (0.03 + 0.07 * hb3) * vec2(cos(a), sin(a));
    float turn = a + 1.3 * (hb1 - 0.5);
    vec2 lean = vec2(cos(turn), sin(turn)) * (0.3 + 0.5 * hb3);
    vec2 side = vec2(-sin(a + 2.0 * hb1), cos(a + 2.0 * hb1));
    float t = position.y;
    float wide = max(0.02 * (0.7 + 0.6 * hb2), 0.9 * pix * (${TURF_BLADES.toFixed(1)} / kept));
    float wx = position.x * 0.5 * wide * pow(1.0 - t, 0.8);
    vec2 xz = root + side * wx + lean * hk * t * t;
    turfAt = vec3(xz.x, gy - 0.04 + hk * t * (1.0 - 0.25 * dot(lean, lean) * t), xz.y);
    if (hk <= 0.0) {
      turfAt = vec3(base.x, gy - 1.0, base.y);
    }
    objectNormal = normalize(vec3(side.x * 0.35 - lean.x * 0.5, 1.0, side.y * 0.35 - lean.y * 0.5));

    /* Its colour: the ground's graded field colour, or on a texel that is
     * not field the field's own colour at the ground's lightness. */
    vec3 macro = textureLod(uHeroCol, hu, 0.0).rgb * uWhite;
    float lumM = dot(macro, vec3(0.3, 0.59, 0.11));
    vec3 field = macro * ${v3(GRADE[1])};
    vec3 other = ${v3(FIELD_COL)} * clamp(lumM / ${lum(CLASS_MEAN[1]).toFixed(4)}, 0.7, 1.3);
    vec3 c = mix(other, field, clamp(mask.g * 1.6, 0.0, 1.0));
    vec4 n4 = textureLod(uNoise, base / 290.0 + 0.13, 0.0);
    vec4 n5 = textureLod(uNoise, base / 870.0 + 0.29, 0.0);
    c *= 0.88 + 0.24 * (0.6 * n5.r + 0.4 * n4.r);
    c *= mix(${v3(LUSH)}, ${v3(STRAW)}, dry) / ${v3(GRASS_MEAN)} * (0.85 + 0.3 * hb1);
    float lumT = dot(c, vec3(0.3, 0.59, 0.11));
    c = max(vec3(lumT) + (c - lumT) * ${PASTURE_SAT.toFixed(2)}, vec3(0.0));
    vTurfCol = c * ${TURF_GAIN.toFixed(2)};
    /* Past a few metres a blade is a pixel or two and its dark root
     * would make it a dark speck: lit to its root there. */
    vTurfUp = mix(t, 1.0, 0.7 * smoothstep(4.0, 12.0, dist));
  }
`;

function roadMask(site) {
  /* Every segment, with its reach (half the road and the verge) and its
   * box, so a redraw looks only at the few that cross the window. */
  const segs = [];
  const addLine = (points, width) => {
    const r = width / 2 + ROADS_VERGE;
    for (let i = 1; i < points.length; i += 1) {
      const [ax, az] = points[i - 1];
      const [bx, bz] = points[i];
      segs.push({
        ax, az, bx, bz, r, box: [Math.min(ax, bx) - r, Math.min(az, bz) - r, Math.max(ax, bx) + r, Math.max(az, bz) + r],
      });
    }
  };
  for (const road of site.roads) {
    addLine(road.points, road.width);
  }
  addLine(site.rockfill.axis.map((v) => [v.x, v.y]), 2 * site.rockfill.crestHalf);
  const data = new Uint8Array(ROADS_PX * ROADS_PX);
  /* Rows top first, z growing down them, as the imagery. */
  const texture = new THREE.DataTexture(data, ROADS_PX, ROADS_PX, THREE.RedFormat, THREE.UnsignedByteType);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const at = new THREE.Vector2(Infinity, Infinity);
  const texel = ROADS_SPAN / ROADS_PX;
  return {
    texture,
    at,
    /* Each texel the distance to the nearest segment against its reach,
     * a texel's width of edge; by hand, on the segments' boxes (a 2D
     * canvas here made the trees stop drawing, for reasons not found). */
    update(x, z) {
      if (Math.hypot(x - at.x, z - at.y) < ROADS_MOVE) {
        return;
      }
      at.set(x, z);
      const x0 = x - ROADS_SPAN / 2;
      const z0 = z - ROADS_SPAN / 2;
      data.fill(0);
      for (const sg of segs) {
        const [bx0, bz0, bx1, bz1] = sg.box;
        if (bx1 < x0 || bz1 < z0 || bx0 > x0 + ROADS_SPAN || bz0 > z0 + ROADS_SPAN) {
          continue;
        }
        const i0 = Math.max(0, Math.floor((bx0 - x0) / texel));
        const i1 = Math.min(ROADS_PX - 1, Math.ceil((bx1 - x0) / texel));
        const j0 = Math.max(0, Math.floor((bz0 - z0) / texel));
        const j1 = Math.min(ROADS_PX - 1, Math.ceil((bz1 - z0) / texel));
        const dx = sg.bx - sg.ax;
        const dz = sg.bz - sg.az;
        const len2 = Math.max(dx * dx + dz * dz, 1e-6);
        for (let j = j0; j <= j1; j += 1) {
          const pz = z0 + (j + 0.5) * texel;
          for (let i = i0; i <= i1; i += 1) {
            const px = x0 + (i + 0.5) * texel;
            const t = Math.max(0, Math.min(1, ((px - sg.ax) * dx + (pz - sg.az) * dz) / len2));
            const d = Math.hypot(px - sg.ax - dx * t, pz - sg.az - dz * t);
            const v = Math.round(255 * Math.max(0, Math.min(1, (sg.r - d) / texel + 0.5)));
            const k = j * ROADS_PX + i;
            if (v > data[k]) {
              data[k] = v;
            }
          }
        }
      }
      texture.needsUpdate = true;
    },
  };
}

/*
 * The turf round the camera. `tex` and `site` as groundMaterial's, `noise`
 * noiseTexture's, `heights` the look's { texture, grid } uniforms, which
 * setHeights fills. Returns the mesh, update(camera, groundAt) for each
 * frame and dispose().
 */
export function makeTurf({
  tex, site, noise, heights, heroHalf, ringHalf, white, renderer,
}) {
  const geo = turfGeometry();
  const roads = roadMask(site);
  const uniforms = {
    uHeroCol: { value: tex.heroCol },
    uHeroMask: { value: tex.heroMask },
    uReservoir: { value: site.reservoir },
    uNoise: { value: noise },
    uHalf: { value: new THREE.Vector2(heroHalf, ringHalf) },
    uWhite: { value: white },
    uWater: { value: new THREE.Vector2(site.reservoirY, site.riverY) },
    uTurfSnap: { value: new THREE.Vector2() },
    uTurfPix: { value: 0.001 },
    uTurfHeights: heights.texture,
    uTurfGrid: heights.grid,
    uTurfRoads: { value: roads.texture },
    uTurfRoadsAt: { value: roads.at },
  };
  const mat = thermalKind(new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.8, metalness: 0, side: THREE.DoubleSide,
  }), 'vegetation');
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aCell;
        uniform sampler2D uHeroCol;
        uniform sampler2D uHeroMask;
        uniform sampler2D uReservoir;
        uniform sampler2D uNoise;
        uniform highp sampler2D uTurfHeights;
        uniform vec3 uTurfGrid;
        uniform vec2 uHalf;
        uniform float uWhite;
        uniform vec2 uWater;
        uniform vec2 uTurfSnap;
        uniform float uTurfPix;
        uniform sampler2D uTurfRoads;
        uniform vec2 uTurfRoadsAt;
        varying vec3 vTurfCol;
        varying float vTurfUp;
        ${NOISE_GLSL}`)
      .replace('#include <beginnormal_vertex>', `vec3 objectNormal;\nvec3 turfAt;\n${TURF_VERTEX}`)
      .replace('#include <begin_vertex>', 'vec3 transformed = turfAt;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTurfCol;\nvarying float vTurfUp;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        /* Dark at the roots, where the blades shade each other. */
        diffuseColor.rgb *= vTurfCol * mix(0.7, 1.0, smoothstep(0.0, 0.6, vTurfUp));`)
      .replace('#include <normal_fragment_begin>', `
        float faceDirection = 1.0;
        vec3 normal = normalize(vNormal);
        vec3 nonPerturbedNormal = normal;`);
  };
  mat.customProgramCacheKey = () => 'itaipu-turf';
  mat.name = 'itaipu-turf';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'itaipu-turf';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.visible = false;
  const at = new THREE.Vector3();
  const size = new THREE.Vector2();
  /* Whether the camera is over dry ground in the hero, where the turf can
   * grow: over the water (the reservoir's outline with the ground under
   * its level, or the river's bed) its triangles would all be drawn and
   * none seen, which in reservoir-dam was 0.66 M of them. */
  const outline = site.reservoir.image.data;
  const overLand = (x, z, groundAt) => {
    const lim = heroHalf - TURF_RADIUS - ROADS_MOVE;
    if (Math.abs(x) > lim || Math.abs(z) > lim) {
      return false;
    }
    const y = groundAt(x, z);
    if (y < site.riverY + 2) {
      return false;
    }
    const i = Math.floor(((x + ringHalf) / (2 * ringHalf)) * OUTLINE_PX);
    const j = Math.floor(((z + ringHalf) / (2 * ringHalf)) * OUTLINE_PX);
    return !(outline[j * OUTLINE_PX + i] > 127 && y < site.reservoirY + 0.5);
  };
  return {
    mesh,
    /* `groundAt(x, z)` the ground's height, null until the terrain is in. */
    update(camera, groundAt) {
      camera.getWorldPosition(at);
      mesh.visible = Boolean(groundAt) && heights.texture.value !== null && overLand(at.x, at.z, groundAt)
        && at.y - groundAt(at.x, at.z) < TURF_CEILING;
      if (!mesh.visible) {
        return;
      }
      uniforms.uTurfSnap.value.set(Math.floor(at.x / TURF_STEP), Math.floor(at.z / TURF_STEP));
      roads.update(at.x, at.z);
      renderer.getDrawingBufferSize(size);
      uniforms.uTurfPix.value = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / size.y;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      roads.texture.dispose();
    },
  };
}
