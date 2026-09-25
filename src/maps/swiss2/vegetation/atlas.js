/*
 * atlas.js: the textures the valley's plants are drawn with.
 *
 * Three photographed CC0 sources (docs/SWISS2-ASSETS-VEG.md) are composed
 * at load into two atlases on a canvas: fir twigs laid along a stem make
 * the spruce, fir and larch branch sprays and the hanging curtains under
 * a spruce's branches; leaves laid along twigs make the beech and maple
 * clusters; grass blades fanned from a root make the meadow clumps, with
 * the flowers of an alpine hay meadow painted over some of them. What is
 * shipped is the photographs; the arrangement is code, so a spray can
 * change shape without a new file.
 *
 * Everything is drawn once on a clear canvas, whose alpha is the
 * coverage, then laid over the foliage's own dark green for the colour,
 * so a texel outside a leaf carries that green rather than black and the
 * alpha tested edge never shows a halo. The species' colours are the
 * photographs through canvas filters, applied once to a copy of each
 * photograph rather than on every stamp: a filter per stamp was a second
 * and a half of load. The mip chain is built
 * here too, with each level's alpha rescaled so it covers as much as the
 * full size level does: with the GPU's own mips a spruce thinned to a
 * skeleton a hundred metres out.
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
import { makeRng } from '../../alps/noise.js';

const BASE = new URL('../../../../assets/swiss2/vegetation/', import.meta.url);
export const assetUrl = (name) => new URL(name, BASE).href;

/* The alpha test every foliage material cuts at, which the mips keep
 * their coverage against. */
export const ALPHA_CUT = 0.5;

/* The seven twig sprays in fir-twig.webp, as (u0, v0, u1, v1) with v
 * down, each with its stem's foot at the bottom middle of its box. */
const TWIGS = [
  [0.5872, 0.0133, 0.9447, 0.4181],
  [0.0037, 0.0205, 0.3047, 0.3470],
  [0.4435, 0.0855, 0.5061, 0.2446],
  [0.3870, 0.2843, 0.5590, 0.4566],
  [0.2531, 0.3205, 0.3440, 0.4349],
  [0.1511, 0.4566, 0.5762, 0.9193],
  [0.5639, 0.5217, 0.9705, 0.9867],
];
const BIG_TWIGS = [0, 1, 5, 6];
const SMALL_TWIGS = [2, 3, 4];
/* The eight leaves in leaves.webp, stalk at the bottom. */
const LEAVES = [
  [0.4971, 0.0000, 0.6484, 0.3623],
  [0.0156, 0.0195, 0.1445, 0.5098],
  [0.1641, 0.0195, 0.3369, 0.3916],
  [0.6934, 0.0195, 0.8154, 0.4131],
  [0.3604, 0.0303, 0.4824, 0.3604],
  [0.2168, 0.5762, 0.3545, 0.9990],
  [0.4219, 0.6025, 0.5605, 0.9990],
  [0.0166, 0.6289, 0.1816, 0.9990],
];
/* The upright grass blades in grass-blades.webp, root at the bottom; the
 * last three are the dry ones. */
const BLADES = [
  [0.0312, 0.0166, 0.1729, 0.9648],
  [0.8584, 0.0225, 0.9795, 0.9990],
  [0.1475, 0.1641, 0.3008, 0.9727],
  [0.6699, 0.1709, 0.8281, 0.8936],
  [0.3594, 0.2314, 0.4072, 0.7256],
  [0.8086, 0.7295, 0.8535, 0.9980],
  [0.4502, 0.0557, 0.6123, 0.7617],
  [0.7949, 0.2598, 0.8496, 0.6191],
  [0.5508, 0.4463, 0.6318, 0.8037],
];
const GREEN_BLADES = 6;

/*
 * The foliage atlas, 2048 square, in pixels (x, y, w, h), y down as the
 * canvas draws it. Geometry reads these through REGIONS as uv rectangles
 * with v up, which is what THREE's flipY upload makes of them.
 */
const FOLIAGE_PX = 2048;
const FOLIAGE_RECTS = {
  spruce: [0, 0, 512, 1024],
  fir: [512, 0, 512, 1024],
  larch: [1024, 0, 512, 1024],
  curtain: [1536, 0, 448, 1024],
  bark: [1984, 0, 64, 1024],
  beech: [0, 1024, 1024, 1024],
  maple: [1024, 1024, 1024, 1024],
};
/* The grass atlas is 1024 wide and 1792 high: the meadow's clumps and
 * flowers in the top 1024, under them the tall weeds of a verge or a
 * field's unmown margin, each a card twice as high as it is wide, and at
 * the foot what lies flat in turf, seen from above: a plantain's and a
 * dandelion's rosettes, a patch of white clover, a bare scrape. */
const GRASS_PX = [1024, 1792];
const GRASS_RECTS = {
  clump0: [0, 0, 512, 256],
  clump1: [512, 0, 512, 256],
  clump2: [0, 256, 512, 256],
  clump3: [512, 256, 512, 256],
  clump4: [0, 512, 512, 256],
  clump5: [512, 512, 512, 256],
  flower0: [0, 768, 256, 256],
  flower1: [256, 768, 256, 256],
  flower2: [512, 768, 256, 256],
  flower3: [768, 768, 256, 256],
  weed0: [0, 1024, 256, 512],
  weed1: [256, 1024, 256, 512],
  weed2: [512, 1024, 256, 512],
  weed3: [768, 1024, 256, 512],
  flat0: [0, 1536, 256, 256],
  flat1: [256, 1536, 256, 256],
  flat2: [512, 1536, 256, 256],
  flat3: [768, 1536, 256, 256],
};

/* A rectangle in pixels as a uv rectangle with v up: u0, v0 at the
 * region's bottom left, and its size, on an atlas [pw, ph] pixels. */
function uvRects(rects, [pw, ph]) {
  const out = {};
  for (const [k, [x, y, w, h]] of Object.entries(rects)) {
    out[k] = { u0: x / pw, v0: 1 - (y + h) / ph, du: w / pw, dv: h / ph };
  }
  return out;
}
export const REGIONS = uvRects(FOLIAGE_RECTS, [FOLIAGE_PX, FOLIAGE_PX]);
export const GRASS_REGIONS = uvRects(GRASS_RECTS, GRASS_PX);

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`swiss2 vegetation: could not load ${url}`));
    img.src = url;
  });
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/*
 * Paint on a clear canvas, then give the result the colour it has over
 * `ground` and the alpha it has over nothing.
 */
function flatten(w, h, ground, paint) {
  const layer = canvas(w, h);
  const lc = layer.getContext('2d');
  paint(lc);
  const col = canvas(w, h);
  const cc = col.getContext('2d');
  cc.fillStyle = ground;
  cc.fillRect(0, 0, w, h);
  cc.drawImage(layer, 0, 0);
  const img = cc.getImageData(0, 0, w, h);
  const a = lc.getImageData(0, 0, w, h).data;
  for (let k = 3; k < img.data.length; k += 4) {
    img.data[k] = a[k];
  }
  cc.putImageData(img, 0, 0);
  return col;
}

/* A photograph through a canvas filter, made once per filter. */
const tints = new WeakMap();
function tint(img, filter) {
  let byFilter = tints.get(img);
  if (!byFilter) {
    byFilter = new Map();
    tints.set(img, byFilter);
  }
  let c = byFilter.get(filter);
  if (!c) {
    c = canvas(img.width, img.height);
    const x = c.getContext('2d');
    x.filter = filter;
    x.drawImage(img, 0, 0);
    byFilter.set(filter, c);
  }
  return c;
}

/*
 * A mip chain for an alpha tested texture. Each level is the one above
 * it halved on a canvas, then its alpha scaled so the fraction of texels
 * over ALPHA_CUT is the full level's fraction (Castano's coverage
 * preserving mips): read the level's alpha histogram, find the alpha
 * above which that fraction lies, and scale so that alpha lands on the
 * cut.
 */
function coverageMips(top, maxScale) {
  const count = (data, cut) => {
    let n = 0;
    for (let k = 3; k < data.length; k += 4) {
      n += data[k] > cut ? 1 : 0;
    }
    return n;
  };
  const cut = ALPHA_CUT * 255;
  const d0 = top.getContext('2d').getImageData(0, 0, top.width, top.height).data;
  const coverage = count(d0, cut) / (d0.length / 4);
  const levels = [top];
  let prev = top;
  while (prev.width > 1 || prev.height > 1) {
    const w = Math.max(1, prev.width >> 1);
    const h = Math.max(1, prev.height >> 1);
    const c = canvas(w, h);
    const x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(prev, 0, 0, w, h);
    const img = x.getImageData(0, 0, w, h);
    const hist = new Uint32Array(256);
    for (let k = 3; k < img.data.length; k += 4) {
      hist[img.data[k]] += 1;
    }
    const want = coverage * w * h;
    let above = 0;
    let t = 255;
    while (t > 1 && above + hist[t] < want) {
      above += hist[t];
      t -= 1;
    }
    const scale = Math.min(maxScale, Math.max(1, cut / Math.max(1, t)));
    if (scale > 1.001) {
      for (let k = 3; k < img.data.length; k += 4) {
        img.data[k] = Math.min(255, img.data[k] * scale);
      }
      x.putImageData(img, 0, 0);
    }
    levels.push(c);
    prev = c;
  }
  return levels;
}

/* maxScale caps the alpha lift: a grass card's blades are so dense at
 * the root that a full lift turned its lower half into a solid sheet a
 * few metres out. */
function mippedTexture(top, maxScale = 4) {
  const tex = new THREE.Texture(top);
  tex.mipmaps = coverageMips(top, maxScale);
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/* Draw the sub image `box` (uv, v down) of img with its bottom middle
 * at (x, y), pointing along `angle` (0 up, positive clockwise), `len`
 * pixels long; `flip` mirrors it across its own stem. */
function stamp(ctx, img, box, x, y, angle, len, flip = false, thin = 1) {
  const sx = box[0] * img.width;
  const sy = box[1] * img.height;
  const sw = (box[2] - box[0]) * img.width;
  const sh = (box[3] - box[1]) * img.height;
  const s = len / sh;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(flip ? -thin : thin, 1);
  ctx.drawImage(img, sx, sy, sw, sh, (-sw * s) / 2, -sh * s, sw * s, sh * s);
  ctx.restore();
}

/* A tapering stem from (x0, y0) to (x1, y1), drawn as a stroked
 * polyline with a little wander. */
function stem(ctx, x0, y0, x1, y1, w0, w1, colour, rng) {
  const n = 8;
  let px = x0;
  let py = y0;
  for (let k = 1; k <= n; k += 1) {
    const t = k / n;
    const x = x0 + (x1 - x0) * t + (k < n ? (rng() - 0.5) * 3 : 0);
    const y = y0 + (y1 - y0) * t;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(x, y);
    ctx.lineWidth = w0 + (w1 - w0) * t;
    ctx.strokeStyle = colour;
    ctx.lineCap = 'round';
    ctx.stroke();
    px = x;
    py = y;
  }
}

/*
 * A conifer's branch spray in the rectangle (x, y, w, h): the branch
 * runs up the middle from the bottom edge (the trunk end) to the top
 * (the tip), with twigs off both sides, longer at the base, and a spray
 * at the tip. `spec` sets the angle the twigs leave at, how many, how
 * long, and the colour filter that turns the fir's green into the
 * species'.
 */
function spray(ctx, photo, rect, spec, seed) {
  const rng = makeRng(seed);
  const [x, y, w, h] = rect;
  const cx = x + w / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const twig = tint(photo, spec.filter);
  stem(ctx, cx, y + h - 2, cx, y + 40, spec.stemW, 2, '#4b3524', rng);
  const n = spec.count;
  for (let k = 0; k < n; k += 1) {
    const t = 0.04 + (0.9 * k) / n;
    const py = y + h - t * h + (rng() - 0.5) * 8;
    const side = k % 2 === 0 ? -1 : 1;
    const len = (spec.len0 + (spec.len1 - spec.len0) * t) * (0.8 + rng() * 0.35) * h;
    const a = side * (spec.angle + (rng() - 0.5) * 0.3);
    const pick = t > 0.75 && rng() < 0.6 ? SMALL_TWIGS : BIG_TWIGS;
    const box = TWIGS[pick[Math.floor(rng() * pick.length)]];
    stamp(ctx, twig, box, cx + side * 2, py, a, len, rng() < 0.5);
    if (spec.fill && rng() < spec.fill) {
      /* A second, shorter twig over the stem, forward and up: a real
       * spray is thicker along its axis than a flat comb. */
      stamp(ctx, twig, TWIGS[SMALL_TWIGS[k % 3]], cx, py, (rng() - 0.5) * 0.5, len * 0.55, rng() < 0.5);
    }
  }
  stamp(ctx, twig, TWIGS[BIG_TWIGS[seed % 4]], cx, y + h * 0.16, 0, h * 0.2);
  ctx.restore();
}

/* Tufts for the larch: short needles in rosettes along a thin stem. */
function tufts(ctx, photo, rect, seed) {
  const rng = makeRng(seed);
  const [x, y, w, h] = rect;
  const cx = x + w / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  stem(ctx, cx, y + h - 2, cx + 10, y + 30, 7, 2, '#6b4a33', rng);
  for (let k = 0; k < 16; k += 1) {
    const t = 0.05 + 0.9 * (k / 16);
    const bx = cx + 10 * t + (rng() - 0.5) * 50;
    const by = y + h - t * h;
    /* A side twig drooping out, with rosettes along it. */
    const side = k % 2 === 0 ? -1 : 1;
    const len = (0.35 - 0.25 * t) * w;
    const ex = bx + side * len;
    const ey = by + len * 0.25;
    stem(ctx, cx + 10 * t, by, ex, ey, 3, 1, '#6b4a33', rng);
    const twig = tint(photo, 'brightness(1.3) saturate(1.1) hue-rotate(-9deg)');
    for (let r = 0; r < 5; r += 1) {
      const u = (r + 0.5) / 5;
      const rx = cx + 10 * t + (ex - cx - 10 * t) * u;
      const ry = by + (ey - by) * u;
      for (let q = 0; q < 5; q += 1) {
        const box = TWIGS[SMALL_TWIGS[(k + q) % 3]];
        stamp(ctx, twig, box, rx, ry, (q / 5) * Math.PI * 2 + rng(), 26 + rng() * 22, rng() < 0.5);
      }
    }
  }
  ctx.restore();
}

/* Hanging branchlets for under a spruce's branch: a stem along the top
 * edge (the branch), twigs hanging from it to the bottom. */
function curtain(ctx, photo, rect, seed) {
  const rng = makeRng(seed);
  const [x, y, w, h] = rect;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const twig = tint(photo, 'brightness(0.88) saturate(0.9) hue-rotate(8deg)');
  for (let k = 0; k < 11; k += 1) {
    const px = x + ((k + 0.5) / 11) * w + (rng() - 0.5) * 16;
    const len = h * (0.55 + rng() * 0.4);
    const box = TWIGS[BIG_TWIGS[Math.floor(rng() * 4)]];
    stamp(ctx, twig, box, px, y + 4, Math.PI + (rng() - 0.5) * 0.25, len * 0.98, rng() < 0.5);
  }
  ctx.restore();
}

/* A leafy spray: a twig up the middle of rect from its bottom edge with
 * side twigs forking off it, and leaves set alternately along all of
 * them, so the card is a spray with light between its twigs rather than
 * a mat. Each leaf takes one of `spec.tones` filters, lighter or darker,
 * as leaves turned more or less to the light are. `lobed` draws a five
 * lobed maple leaf by clipping the leaf photograph to that outline. */
function leafCluster(ctx, photo, rect, spec, seed) {
  const rng = makeRng(seed);
  const [x, y, w, h] = rect;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const x0 = x + w / 2;
  const y0 = y + h - 4;
  const twigs = [[x0, y0, x0 + (rng() - 0.5) * w * 0.1, y + h * 0.06, 0]];
  stem(ctx, ...twigs[0].slice(0, 4), 9, 2, '#554b40', rng);
  for (let k = 0; k < spec.sides; k += 1) {
    const t = 0.12 + (0.7 * k) / spec.sides + rng() * 0.05;
    const side = k % 2 === 0 ? -1 : 1;
    const a = side * (0.55 + rng() * 0.45);
    const bx = x0 + (twigs[0][2] - x0) * t;
    const by = y0 + (twigs[0][3] - y0) * t;
    const len = h * (0.52 - 0.3 * t) * (0.85 + rng() * 0.3);
    const ex = bx + Math.sin(a) * len;
    const ey = by - Math.cos(a) * len;
    stem(ctx, bx, by, ex, ey, 5, 1.5, '#554b40', rng);
    twigs.push([bx, by, ex, ey, a]);
  }
  const tones = spec.tones.map((f) => tint(photo, f));
  for (const [tx0, ty0, tx1, ty1, a] of twigs) {
    const tlen = Math.hypot(tx1 - tx0, ty1 - ty0);
    const n = Math.round(tlen / (spec.leafLen * 0.27));
    for (let k = 0; k < n; k += 1) {
      const t = 0.12 + (0.88 * (k + rng() * 0.5)) / n;
      const px = tx0 + (tx1 - tx0) * t;
      const py = ty0 + (ty1 - ty0) * t;
      const side = k % 2 === 0 ? -1 : 1;
      const ang = a + side * (0.7 + rng() * 0.5);
      const len = spec.leafLen * (0.7 + rng() * 0.4) * (1.1 - 0.35 * t);
      const box = LEAVES[Math.floor(rng() * LEAVES.length)];
      const leaves = tones[Math.floor(rng() * tones.length)];
      if (spec.lobed) {
        mapleLeaf(ctx, leaves, box, px, py, ang, len, rng);
      } else {
        stamp(ctx, leaves, box, px, py, ang, len, rng() < 0.5);
      }
    }
    /* A leaf at the tip, pointing on. */
    const box = LEAVES[Math.floor(rng() * LEAVES.length)];
    stamp(ctx, tones[0], box, tx1, ty1, a, spec.leafLen * 0.7, rng() < 0.5);
  }
  ctx.restore();
}

function mapleLeaf(ctx, leaves, box, x, y, angle, len, rng) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const r = len * 0.5;
  ctx.beginPath();
  /* Five lobes round a centre half a leaf up the stalk. */
  const cy = -r * 1.05;
  for (let k = 0; k <= 60; k += 1) {
    const a = (k / 60) * Math.PI * 2;
    const lobe = 0.5 + 0.5 * Math.pow(Math.abs(Math.cos(a * 2.5)), 3.0);
    const rr = r * lobe * (a > Math.PI * 0.8 && a < Math.PI * 1.2 ? 0.6 : 1);
    const px = Math.sin(a) * rr;
    const py = cy - Math.cos(a) * rr;
    if (k === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
  ctx.clip();
  const sx = box[0] * leaves.width;
  const sy = box[1] * leaves.height;
  const sw = (box[2] - box[0]) * leaves.width;
  const sh = (box[3] - box[1]) * leaves.height;
  ctx.drawImage(leaves, sx + sw * 0.2, sy + sh * 0.2, sw * 0.6, sh * 0.5, -r, cy - r, 2 * r, 2 * r);
  ctx.restore();
  if (rng() < 0.5) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.strokeStyle = 'rgba(80, 60, 40, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -r * 0.2);
    ctx.stroke();
    ctx.restore();
  }
}

/* Bark as a strip for trunks too far off to earn the tiled bark. */
function barkStrip(ctx, rect, seed) {
  const rng = makeRng(seed);
  const [x, y, w, h] = rect;
  ctx.fillStyle = '#4e4034';
  ctx.fillRect(x, y, w, h);
  for (let k = 0; k < 220; k += 1) {
    const g = 50 + Math.floor(rng() * 40);
    ctx.fillStyle = `rgb(${g + 12}, ${g}, ${g - 10})`;
    ctx.fillRect(x + rng() * w, y + rng() * h, 2 + rng() * 10, 4 + rng() * 26);
  }
}

/*
 * A clump of meadow grass in rect: blades rooted along the bottom edge's
 * middle half, fanning out, taller in the middle, a few dry ones among
 * them; `flowers` paints what is in bloom over the top.
 */
/* The meadow's shades: eight greens and two straws. */
const GREEN_TINTS = Array.from({ length: 8 }, (_, k) => `brightness(${(0.7 + 0.045 * k).toFixed(3)}) saturate(${(1.1 + 0.1 * (k % 4)).toFixed(2)}) hue-rotate(${2 + ((k * 5) % 14)}deg)`);
const DRY_TINTS = ['brightness(0.72) saturate(0.7)', 'brightness(0.9) saturate(0.7)'];

function clump(ctx, blades, rect, seed, dryShare) {
  const rng = makeRng(seed);
  const [x, y, w, h] = rect;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const n = 150;
  for (let k = 0; k < n; k += 1) {
    const u = rng();
    const bx = x + w * (0.12 + 0.76 * u);
    const centre = 1 - Math.abs(u - 0.5) * 1.2;
    const len = h * (0.45 + 0.55 * centre) * (0.7 + rng() * 0.4);
    const lean = (u - 0.5) * 0.9 + (rng() - 0.5) * 0.35;
    const dry = rng() < dryShare;
    const box = BLADES[dry ? GREEN_BLADES + Math.floor(rng() * 3) : Math.floor(rng() * GREEN_BLADES)];
    const shade = dry ? DRY_TINTS[Math.floor(rng() * DRY_TINTS.length)] : GREEN_TINTS[Math.floor(rng() * GREEN_TINTS.length)];
    /* The photographed blades are a hand's width: drawn at a third of
     * it they are a grass blade's. */
    stamp(ctx, tint(blades, shade), box, bx, y + h + 2, lean, len, rng() < 0.5, 0.32);
  }
  ctx.restore();
}

/* The seed heads of an uncut hay meadow in July: cocksfoot, oat grass
 * and timothy gone to seed, pale straw panicles on stems over the
 * blades, which is what makes a standing hay field silver in the wind
 * where a pasture is green. */
function seedHeads(ctx, rect, seed) {
  const rng = makeRng(seed);
  const [x, y, w, h] = rect;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  for (let k = 0; k < 34; k += 1) {
    const bx = x + w * (0.1 + 0.8 * rng());
    const top = y + h * (0.03 + 0.3 * rng());
    const hx = bx + (bx - (x + w / 2)) * 0.25 + (rng() - 0.5) * 30;
    ctx.strokeStyle = `hsl(${55 + rng() * 20}, 30%, ${38 + rng() * 14}%)`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(bx, y + h);
    ctx.quadraticCurveTo(bx, (top + y + h) / 2, hx, top);
    ctx.stroke();
    /* The panicle: a spindle of grains down the stem's last hand span,
     * nodding to one side. */
    const len = 22 + rng() * 26;
    const lean = (rng() - 0.5) * 0.7;
    for (let g = 0; g < 16; g += 1) {
      const f = g / 15;
      const gx = hx + Math.sin(lean) * len * f + (rng() - 0.5) * 7 * Math.sin(f * Math.PI);
      const gy = top + Math.cos(lean) * len * f;
      ctx.fillStyle = `hsl(${40 + rng() * 14}, ${22 + rng() * 18}%, ${66 + rng() * 18}%)`;
      ctx.beginPath();
      ctx.ellipse(gx, gy, 2.2, 3.6, lean, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/* Meadow flowers on thin stalks from the bottom of rect: buttercup,
 * ox eye daisy, red clover, harebell and the white umbels of wild
 * carrot, the Bernese hay meadow's commonest. */
function flowers(ctx, rect, kind, seed) {
  const rng = makeRng(seed);
  const [x, y, w, h] = rect;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const n = kind === 'umbel' ? 3 : 6;
  for (let k = 0; k < n; k += 1) {
    const bx = x + w * (0.15 + 0.7 * rng());
    const top = y + h * (0.12 + 0.45 * rng());
    const hx = bx + (rng() - 0.5) * 40;
    ctx.strokeStyle = '#5b7a35';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(bx, y + h);
    ctx.quadraticCurveTo(bx, (top + y + h) / 2, hx, top);
    ctx.stroke();
    const col = (c) => c;
    const s = 7 + rng() * 5;
    if (kind === 'buttercup') {
      for (let p = 0; p < 5; p += 1) {
        const a = (p / 5) * Math.PI * 2 + rng();
        ctx.fillStyle = col(`hsl(${50 + rng() * 6}, 95%, ${52 + rng() * 10}%)`);
        ctx.beginPath();
        ctx.ellipse(hx + Math.cos(a) * s * 0.55, top + Math.sin(a) * s * 0.45, s * 0.55, s * 0.4, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = col('#c9a019');
      ctx.beginPath();
      ctx.arc(hx, top, s * 0.28, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === 'daisy') {
      const r = s * 1.4;
      for (let p = 0; p < 18; p += 1) {
        const a = (p / 18) * Math.PI * 2;
        ctx.fillStyle = col(`hsl(60, 20%, ${90 + rng() * 8}%)`);
        ctx.beginPath();
        ctx.ellipse(hx + Math.cos(a) * r * 0.6, top + Math.sin(a) * r * 0.35, r * 0.5, r * 0.13, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = col('#e2b21c');
      ctx.beginPath();
      ctx.ellipse(hx, top, r * 0.3, r * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === 'clover') {
      for (let p = 0; p < 26; p += 1) {
        const a = rng() * Math.PI * 2;
        const rr = rng() * s * 0.8;
        ctx.fillStyle = col(`hsl(${320 + rng() * 20}, ${45 + rng() * 20}%, ${50 + rng() * 18}%)`);
        ctx.beginPath();
        ctx.ellipse(hx + Math.cos(a) * rr, top + Math.sin(a) * rr * 1.1, 2.6, 4.2, a, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (kind === 'harebell') {
      ctx.fillStyle = col(`hsl(${238 + rng() * 14}, 55%, ${55 + rng() * 10}%)`);
      ctx.beginPath();
      ctx.moveTo(hx - s * 0.5, top);
      ctx.quadraticCurveTo(hx - s * 0.7, top + s * 1.4, hx - s * 0.9, top + s * 1.6);
      ctx.lineTo(hx + s * 0.9, top + s * 1.6);
      ctx.quadraticCurveTo(hx + s * 0.7, top + s * 1.4, hx + s * 0.5, top);
      ctx.closePath();
      ctx.fill();
    } else {
      for (let p = 0; p < 14; p += 1) {
        const a = rng() * Math.PI * 2;
        const rr = Math.sqrt(rng()) * s * 2;
        ctx.fillStyle = col(`hsl(70, 15%, ${88 + rng() * 10}%)`);
        ctx.beginPath();
        ctx.arc(hx + Math.cos(a) * rr, top + Math.sin(a) * rr * 0.4, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

/*
 * The tall weeds of a Swiss verge and field margin in summer, each in a
 * rect twice as high as wide, rooted on its bottom edge.
 *
 * Hogweed and cow parsley: a few stout stems to near the top, each
 * opening into a flat topped umbel of white florets on rays, with the
 * divided leaves low down.
 */
function umbellifer(ctx, leaves, rect, seed) {
  const rng = makeRng(seed);
  const [x, y, w, h] = rect;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const leaf = tint(leaves, 'brightness(0.62) saturate(1.2) hue-rotate(18deg)');
  for (let k = 0; k < 3; k += 1) {
    const bx = x + w * (0.3 + 0.4 * rng());
    const tx = bx + (rng() - 0.5) * w * 0.35;
    const ty = y + h * (0.08 + 0.25 * rng());
    stem(ctx, bx, y + h, tx, ty + 10, 5, 3, '#5f7340', rng);
    for (let q = 0; q < 4; q += 1) {
      const t = 0.15 + 0.3 * rng();
      const lx = bx + (tx - bx) * t;
      const ly = y + h - (y + h - ty) * t;
      stamp(ctx, leaf, LEAVES[Math.floor(rng() * LEAVES.length)], lx, ly, (rng() < 0.5 ? -1 : 1) * (0.9 + rng() * 0.6), 40 + rng() * 30, rng() < 0.5);
    }
    /* The rays, then an umbellet at the end of each, in a shallow dome. */
    const R = w * (0.13 + 0.06 * rng());
    const rays = 11 + Math.floor(rng() * 6);
    for (let r = 0; r < rays; r += 1) {
      const u = ((r + rng()) / rays) * 2 - 1;
      const ex = tx + u * R;
      const ey = ty - R * 0.12 - Math.sqrt(1 - u * u) * R * 0.3 * (0.4 + 0.6 * rng());
      ctx.strokeStyle = '#6d8048';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(tx, ty + 10);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      for (let f = 0; f < 16; f += 1) {
        ctx.fillStyle = `hsl(${50 + rng() * 20}, ${12 + rng() * 10}%, ${84 + rng() * 12}%)`;
        ctx.beginPath();
        ctx.arc(ex + (rng() - 0.5) * 14, ey + (rng() - 0.5) * 8, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

/* Broad leaved dock, the weed every Swiss farmer pulls: big leaves at
 * the root and tall stems of rust brown seed whorls. */
function dock(ctx, leaves, rect, seed) {
  const rng = makeRng(seed);
  const [x, y, w, h] = rect;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  for (let k = 0; k < 2; k += 1) {
    const bx = x + w * (0.35 + 0.3 * rng());
    const tx = bx + (rng() - 0.5) * 40;
    const ty = y + h * (0.05 + 0.2 * rng());
    stem(ctx, bx, y + h, tx, ty, 4, 2, '#6a4a30', rng);
    for (let g = 0; g < 40; g += 1) {
      const t = rng() * 0.55;
      const gx = tx + (bx - tx) * t + (rng() - 0.5) * 18 * (1 - t);
      const gy = ty + (y + h - ty) * t;
      ctx.fillStyle = `hsl(${12 + rng() * 16}, ${40 + rng() * 20}%, ${24 + rng() * 14}%)`;
      ctx.beginPath();
      ctx.ellipse(gx, gy, 3.4, 2.4, rng(), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const leaf = tint(leaves, 'brightness(0.66) saturate(1.1) hue-rotate(8deg)');
  for (let k = 0; k < 7; k += 1) {
    const a = (rng() - 0.5) * 2.4;
    stamp(ctx, leaf, LEAVES[Math.floor(rng() * LEAVES.length)], x + w * (0.4 + 0.2 * rng()), y + h - 2, a, h * (0.28 + 0.12 * rng()), rng() < 0.5, 1.3);
  }
  ctx.restore();
}

/* Stinging nettles, in a patch: upright stems set with pairs of dark,
 * narrowing leaves. */
function nettle(ctx, leaves, rect, seed) {
  const rng = makeRng(seed);
  const [x, y, w, h] = rect;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const shades = ['brightness(0.5) saturate(1.3) hue-rotate(22deg)', 'brightness(0.62) saturate(1.25) hue-rotate(20deg)'].map((f) => tint(leaves, f));
  for (let k = 0; k < 6; k += 1) {
    const bx = x + w * (0.15 + 0.7 * rng());
    const tx = bx + (rng() - 0.5) * 30;
    const ty = y + h * (0.12 + 0.35 * rng());
    stem(ctx, bx, y + h, tx, ty, 3.5, 1.5, '#4b5a30', rng);
    for (let t = 0.1; t < 0.98; t += 0.09 + 0.03 * rng()) {
      const px = bx + (tx - bx) * t;
      const py = y + h - (y + h - ty) * t;
      const len = 74 * (1.1 - 0.6 * t);
      for (const side of [-1, 1]) {
        stamp(ctx, shades[Math.floor(rng() * 2)], LEAVES[Math.floor(rng() * LEAVES.length)], px, py, side * (1.0 + rng() * 0.5), len, side < 0);
      }
    }
  }
  ctx.restore();
}

/* The tall flowers of a margin left uncut: knapweed and field scabious
 * over the seeding grass, and yarrow's small white heads. */
function tallFlowers(ctx, rect, seed) {
  const rng = makeRng(seed);
  const [x, y, w, h] = rect;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  for (let k = 0; k < 9; k += 1) {
    const bx = x + w * (0.1 + 0.8 * rng());
    const tx = bx + (rng() - 0.5) * 50;
    const ty = y + h * (0.1 + 0.4 * rng());
    ctx.strokeStyle = '#5b7236';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx, y + h);
    ctx.quadraticCurveTo(bx, (ty + y + h) / 2, tx, ty);
    ctx.stroke();
    const kind = k % 3;
    if (kind === 0) {
      ctx.fillStyle = `hsl(${295 + rng() * 20}, 45%, ${40 + rng() * 10}%)`;
      ctx.beginPath();
      ctx.ellipse(tx, ty, 8, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === 1) {
      ctx.fillStyle = `hsl(${250 + rng() * 20}, 40%, ${66 + rng() * 10}%)`;
      ctx.beginPath();
      ctx.ellipse(tx, ty, 11, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      for (let f = 0; f < 16; f += 1) {
        ctx.fillStyle = `hsl(60, 10%, ${86 + rng() * 10}%)`;
        ctx.beginPath();
        ctx.arc(tx + (rng() - 0.5) * 22, ty + (rng() - 0.5) * 6, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

/*
 * What lies flat in a mown turf, seen from above, each round the middle
 * of its rect. A leaf is a pointed oval from the centre out along
 * `angle`, `len` long and `wide` across, with its midrib, and on a
 * plantain the ribs running its length.
 */
function flatLeaf(ctx, cx, cy, angle, len, wide, fill, { ribs = 0, teeth = 0 } = {}) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  const n = teeth > 0 ? teeth * 2 : 1;
  for (let k = 1; k <= n; k += 1) {
    const t = k / n;
    const w = wide * Math.sin(Math.PI * Math.min(1, t * 1.1)) * (teeth > 0 && k % 2 ? 0.45 : 1);
    ctx.lineTo(len * t - (teeth > 0 && k % 2 ? len * 0.03 : 0), -w / 2);
  }
  ctx.lineTo(len, 0);
  for (let k = n; k >= 1; k -= 1) {
    const t = k / n;
    const w = wide * Math.sin(Math.PI * Math.min(1, t * 1.1)) * (teeth > 0 && k % 2 ? 0.45 : 1);
    ctx.lineTo(len * t - (teeth > 0 && k % 2 ? len * 0.03 : 0), w / 2);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(160, 180, 120, 0.18)';
  ctx.lineWidth = 1.2;
  for (let r = -ribs; r <= ribs; r += 1) {
    ctx.beginPath();
    ctx.moveTo(len * 0.05, 0);
    ctx.quadraticCurveTo(len * 0.5, (r * wide) / (2 * ribs + 2), len * 0.95, 0);
    ctx.stroke();
  }
  if (!ribs) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(len * 0.9, 0);
    ctx.stroke();
  }
  ctx.restore();
}

function rosettes(ctx, rect, kind, seed) {
  const rng = makeRng(seed);
  const [x, y, w, h] = rect;
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  if (kind === 'plantain') {
    /* Broadleaf plantain: a flat rosette of broad ribbed ovals, the old
     * leaves outside and darker, a seed spike or two lying over it. */
    for (let k = 0; k < 9; k += 1) {
      const a = (k / 9) * Math.PI * 2 + rng() * 0.5;
      const old = k % 3 === 0;
      flatLeaf(ctx, cx, cy, a, w * (0.26 + 0.14 * rng()) * (old ? 1.1 : 0.85), w * (0.13 + 0.05 * rng()),
        `hsl(${76 + rng() * 14}, ${26 + rng() * 12}%, ${old ? 17 + rng() * 4 : 22 + rng() * 7}%)`, { ribs: 2 });
    }
    ctx.strokeStyle = '#6b6a3a';
    ctx.lineWidth = 3;
    for (let k = 0; k < 2; k += 1) {
      const a = rng() * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * w * 0.45, cy + Math.sin(a) * h * 0.45);
      ctx.stroke();
    }
  } else if (kind === 'dandelion') {
    /* A dandelion cut with the turf: long toothed leaves lying out
     * flat, and the one yellow head the mower missed. */
    for (let k = 0; k < 9; k += 1) {
      const a = (k / 9) * Math.PI * 2 + rng() * 0.5;
      flatLeaf(ctx, cx, cy, a, w * (0.28 + 0.14 * rng()), w * (0.12 + 0.04 * rng()),
        `hsl(${80 + rng() * 12}, ${28 + rng() * 12}%, ${20 + rng() * 8}%)`, { teeth: 3 });
    }
    if (rng() < 0.9) {
      for (let p = 0; p < 40; p += 1) {
        const a = rng() * Math.PI * 2;
        const r = Math.sqrt(rng()) * w * 0.06;
        ctx.fillStyle = `hsl(${46 + rng() * 8}, 95%, ${48 + rng() * 12}%)`;
        ctx.beginPath();
        ctx.ellipse(cx + w * 0.08 + Math.cos(a) * r, cy - h * 0.05 + Math.sin(a) * r, 3, 1.6, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (kind === 'clover') {
    /* White clover creeping through the turf: trefoils with their pale
     * chevrons in a loose patch, and a few round white heads. */
    for (let k = 0; k < 34; k += 1) {
      const r = Math.sqrt(rng()) * w * 0.4;
      const a = rng() * Math.PI * 2;
      const lx = cx + Math.cos(a) * r;
      const ly = cy + Math.sin(a) * r;
      const s = 10 + 7 * rng();
      const turn = rng() * Math.PI * 2;
      const shade = 15 + 8 * rng();
      for (let q = 0; q < 3; q += 1) {
        const b = turn + (q / 3) * Math.PI * 2;
        ctx.fillStyle = `hsl(${92 + rng() * 15}, 28%, ${shade}%)`;
        ctx.beginPath();
        ctx.ellipse(lx + Math.cos(b) * s * 0.55, ly + Math.sin(b) * s * 0.55, s * 0.55, s * 0.45, b, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `hsla(90, 25%, ${shade + 22}%, 0.6)`;
        ctx.beginPath();
        ctx.ellipse(lx + Math.cos(b) * s * 0.5, ly + Math.sin(b) * s * 0.5, s * 0.25, s * 0.1, b + Math.PI / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (let k = 0; k < 2; k += 1) {
      const hx = cx + (rng() - 0.5) * w * 0.5;
      const hy = cy + (rng() - 0.5) * h * 0.5;
      for (let p = 0; p < 24; p += 1) {
        const a = rng() * Math.PI * 2;
        const r = Math.sqrt(rng()) * 6;
        ctx.fillStyle = `hsl(${40 + rng() * 40}, 18%, ${62 + rng() * 26}%)`;
        ctx.beginPath();
        ctx.ellipse(hx + Math.cos(a) * r, hy + Math.sin(a) * r, 2.2, 3.4, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    /* A worn scrape: dark earth trodden through the turf, its edge
     * ragged where the grass still holds, grass coming through it, grit,
     * and a few cut stems lying on it. */
    for (let k = 0; k < 160; k += 1) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * w * 0.34;
      ctx.fillStyle = `hsl(${30 + rng() * 14}, ${14 + rng() * 12}%, ${20 + rng() * 10}%)`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8, 4 + rng() * 7, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let k = 0; k < 500; k += 1) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * w * 0.36;
      const green = rng() < 0.6;
      ctx.fillStyle = green ? `hsl(${78 + rng() * 20}, 30%, ${14 + rng() * 10}%)` : `hsl(${28 + rng() * 20}, ${10 + rng() * 15}%, ${20 + rng() * 22}%)`;
      ctx.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8, green ? 1.5 : 1.5 + rng() * 2, green ? 4 + rng() * 5 : 1.5 + rng() * 2);
    }
    ctx.lineWidth = 1;
    for (let k = 0; k < 14; k += 1) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * w * 0.3;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r * 0.8;
      const b = rng() * Math.PI;
      const l = 4 + rng() * 8;
      ctx.strokeStyle = `hsl(${45 + rng() * 10}, ${20 + rng() * 15}%, ${38 + rng() * 14}%)`;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(b) * l, py + Math.sin(b) * l);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/*
 * Load the photographs and compose both atlases, and the conifer bark.
 * Returns { foliage, grass, bark: { map, normalMap } } as textures,
 * ready for materials; dispose() frees them all.
 */
export async function loadAtlases() {
  const [twig, leaves, blades] = await Promise.all([
    loadImage(assetUrl('fir-twig.webp')),
    loadImage(assetUrl('leaves.webp')),
    loadImage(assetUrl('grass-blades.webp')),
  ]);
  const R = FOLIAGE_RECTS;
  const foliageCanvas = flatten(FOLIAGE_PX, FOLIAGE_PX, '#223219', (ctx) => {
    spray(ctx, twig, R.spruce, {
      angle: 1.0, count: 22, len0: 0.34, len1: 0.16, stemW: 10, fill: 0.7,
      filter: 'brightness(0.92) saturate(0.85) hue-rotate(12deg)',
    }, 11);
    spray(ctx, twig, R.fir, {
      angle: 1.35, count: 26, len0: 0.3, len1: 0.14, stemW: 9, fill: 0.3,
      filter: 'brightness(0.9) saturate(1.05) hue-rotate(2deg) contrast(1.05)',
    }, 23);
    tufts(ctx, twig, R.larch, 37);
    curtain(ctx, twig, R.curtain, 41);
    barkStrip(ctx, R.bark, 43);
    leafCluster(ctx, leaves, R.beech, {
      sides: 7,
      leafLen: 120,
      tones: ['brightness(1.0) saturate(1.15) hue-rotate(10deg)', 'brightness(0.84) saturate(1.15) hue-rotate(12deg)', 'brightness(0.7) saturate(1.1) hue-rotate(14deg)', 'brightness(1.12) saturate(1.05) hue-rotate(6deg)'],
    }, 53);
    leafCluster(ctx, leaves, R.maple, {
      sides: 6,
      leafLen: 150,
      lobed: true,
      tones: ['brightness(0.92) saturate(1.2) hue-rotate(16deg)', 'brightness(0.78) saturate(1.2) hue-rotate(18deg)', 'brightness(0.66) saturate(1.15) hue-rotate(20deg)', 'brightness(1.05) saturate(1.1) hue-rotate(12deg)'],
    }, 59);
  });
  const G = GRASS_RECTS;
  const kinds = ['buttercup', 'daisy', 'clover', 'harebell', 'umbel'];
  const grassCanvas = flatten(GRASS_PX[0], GRASS_PX[1], '#3e5226', (ctx) => {
    for (let k = 0; k < 6; k += 1) {
      clump(ctx, blades, G[`clump${k}`], 101 + k * 7, k < 3 ? 0.02 : 0.06);
    }
    /* clump4 and clump5 are the standing hay, gone to seed. */
    seedHeads(ctx, G.clump4, 131);
    seedHeads(ctx, G.clump5, 137);
    for (let k = 0; k < 4; k += 1) {
      clump(ctx, blades, G[`flower${k}`], 201 + k, 0.05);
      flowers(ctx, G[`flower${k}`], kinds[k], 301 + k);
      if (k === 1) {
        flowers(ctx, G[`flower${k}`], kinds[4], 311);
      }
    }
    clump(ctx, blades, G.weed0, 401, 0.08);
    umbellifer(ctx, leaves, G.weed0, 411);
    clump(ctx, blades, G.weed1, 403, 0.12);
    dock(ctx, leaves, G.weed1, 413);
    clump(ctx, blades, G.weed2, 405, 0.05);
    nettle(ctx, leaves, G.weed2, 417);
    clump(ctx, blades, G.weed3, 407, 0.15);
    seedHeads(ctx, G.weed3, 419);
    tallFlowers(ctx, G.weed3, 421);
    ['plantain', 'dandelion', 'clover', 'bare'].forEach((kind, k) => rosettes(ctx, G[`flat${k}`], kind, 501 + k));
  });
  const foliage = mippedTexture(foliageCanvas);
  const grass = mippedTexture(grassCanvas, 1.4);
  const loader = new THREE.TextureLoader();
  const [barkMap, barkNormal] = await Promise.all([
    loader.loadAsync(assetUrl('bark-diff.webp')),
    loader.loadAsync(assetUrl('bark-normal.webp')),
  ]);
  for (const t of [barkMap, barkNormal]) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
  }
  barkMap.colorSpace = THREE.SRGBColorSpace;
  return {
    foliage,
    grass,
    bark: { map: barkMap, normalMap: barkNormal },
    dispose() {
      for (const t of [foliage, grass, barkMap, barkNormal]) {
        t.dispose();
      }
    },
  };
}
