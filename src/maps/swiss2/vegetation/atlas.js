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
 * Colour and coverage are drawn on two canvases and merged, so a texel
 * outside a leaf carries the foliage's own dark green rather than black
 * and the alpha tested edge never shows a halo. The mip chain is built
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
const GRASS_PX = 1024;
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
};

/* A rectangle in pixels as a uv rectangle with v up: u0, v0 at the
 * region's bottom left, and its size. */
function uvRects(rects, px) {
  const out = {};
  for (const [k, [x, y, w, h]] of Object.entries(rects)) {
    out[k] = { u0: x / px, v0: 1 - (y + h) / px, du: w / px, dv: h / px };
  }
  return out;
}
export const REGIONS = uvRects(FOLIAGE_RECTS, FOLIAGE_PX);
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
 * Something drawn twice: once in colour over the foliage's own ground
 * colour, once as a white silhouette on black, and the two merged into
 * one RGBA image. `paint(ctx, pass)` draws the same things both times;
 * pass is 'colour' or 'mask', and the mask pass has the silhouette filter
 * already set, so paint only has to leave ctx.filter alone on it.
 */
function twoPass(w, h, ground, paint) {
  const col = canvas(w, h);
  const cc = col.getContext('2d');
  cc.fillStyle = ground;
  cc.fillRect(0, 0, w, h);
  paint(cc, 'colour');
  const mask = canvas(w, h);
  const mc = mask.getContext('2d');
  mc.fillStyle = '#000';
  mc.fillRect(0, 0, w, h);
  mc.filter = 'brightness(0) invert(1)';
  paint(mc, 'mask');
  const img = cc.getImageData(0, 0, w, h);
  const m = mc.getImageData(0, 0, w, h).data;
  for (let k = 3; k < img.data.length; k += 4) {
    img.data[k] = m[k - 3];
  }
  cc.putImageData(img, 0, 0);
  return col;
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
function stem(ctx, pass, x0, y0, x1, y1, w0, w1, colour, rng) {
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
    ctx.strokeStyle = pass === 'mask' ? '#fff' : colour;
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
function spray(ctx, pass, twig, rect, spec, seed) {
  const rng = makeRng(seed);
  const [x, y, w, h] = rect;
  const cx = x + w / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  if (pass === 'colour') {
    ctx.filter = spec.filter;
  }
  stem(ctx, pass, cx, y + h - 2, cx, y + 40, spec.stemW, 2, '#4b3524', rng);
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
function tufts(ctx, pass, twig, rect, seed) {
  const rng = makeRng(seed);
  const [x, y, w, h] = rect;
  const cx = x + w / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  stem(ctx, pass, cx, y + h - 2, cx + 10, y + 30, 7, 2, '#6b4a33', rng);
  for (let k = 0; k < 16; k += 1) {
    const t = 0.05 + 0.9 * (k / 16);
    const bx = cx + 10 * t + (rng() - 0.5) * 50;
    const by = y + h - t * h;
    /* A side twig drooping out, with rosettes along it. */
    const side = k % 2 === 0 ? -1 : 1;
    const len = (0.35 - 0.25 * t) * w;
    const ex = bx + side * len;
    const ey = by + len * 0.25;
    stem(ctx, pass, cx + 10 * t, by, ex, ey, 3, 1, '#6b4a33', rng);
    if (pass === 'colour') {
      ctx.filter = 'brightness(1.3) saturate(1.1) hue-rotate(-9deg)';
    }
    for (let r = 0; r < 5; r += 1) {
      const u = (r + 0.5) / 5;
      const rx = cx + 10 * t + (ex - cx - 10 * t) * u;
      const ry = by + (ey - by) * u;
      for (let q = 0; q < 5; q += 1) {
        const box = TWIGS[SMALL_TWIGS[(k + q) % 3]];
        stamp(ctx, twig, box, rx, ry, (q / 5) * Math.PI * 2 + rng(), 26 + rng() * 22, rng() < 0.5);
      }
    }
    if (pass === 'colour') {
      ctx.filter = 'none';
    }
  }
  ctx.restore();
}

/* Hanging branchlets for under a spruce's branch: a stem along the top
 * edge (the branch), twigs hanging from it to the bottom. */
function curtain(ctx, pass, twig, rect, seed) {
  const rng = makeRng(seed);
  const [x, y, w, h] = rect;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  if (pass === 'colour') {
    ctx.filter = 'brightness(0.88) saturate(0.9) hue-rotate(8deg)';
  }
  for (let k = 0; k < 11; k += 1) {
    const px = x + ((k + 0.5) / 11) * w + (rng() - 0.5) * 16;
    const len = h * (0.55 + rng() * 0.4);
    const box = TWIGS[BIG_TWIGS[Math.floor(rng() * 4)]];
    stamp(ctx, twig, box, px, y + 4, Math.PI + (rng() - 0.5) * 0.25, len * 0.98, rng() < 0.5);
  }
  ctx.restore();
}

/* A cluster of leaves on twigs fanning up from the bottom middle of
 * rect. `lobed` draws a five lobed maple leaf by clipping the leaf
 * photograph to that outline. */
function leafCluster(ctx, pass, leaves, rect, spec, seed) {
  const rng = makeRng(seed);
  const [x, y, w, h] = rect;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const twigs = [];
  for (let k = 0; k < 7; k += 1) {
    const a = -1.2 + (2.4 * k) / 6 + (rng() - 0.5) * 0.25;
    const len = h * (0.55 + rng() * 0.35);
    const x0 = x + w / 2;
    const y0 = y + h - 4;
    const x1 = x0 + Math.sin(a) * len;
    const y1 = y0 - Math.cos(a) * len;
    stem(ctx, pass, x0, y0, x1, y1, 7, 2, '#5d5347', rng);
    twigs.push([x0, y0, x1, y1, a]);
  }
  if (pass === 'colour') {
    ctx.filter = spec.filter;
  }
  for (let k = 0; k < spec.count; k += 1) {
    const [x0, y0, x1, y1, a] = twigs[k % twigs.length];
    const t = 0.25 + 0.75 * rng();
    const px = x0 + (x1 - x0) * t;
    const py = y0 + (y1 - y0) * t;
    const side = rng() < 0.5 ? -1 : 1;
    const ang = a + side * (0.5 + rng() * 0.9);
    const len = spec.leafLen * (0.75 + rng() * 0.4) * (1.1 - 0.3 * t);
    const box = LEAVES[Math.floor(rng() * LEAVES.length)];
    if (spec.lobed) {
      mapleLeaf(ctx, leaves, box, px, py, ang, len, rng);
    } else {
      stamp(ctx, leaves, box, px, py, ang, len, rng() < 0.5);
    }
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
function barkStrip(ctx, pass, rect, seed) {
  const rng = makeRng(seed);
  const [x, y, w, h] = rect;
  ctx.fillStyle = pass === 'mask' ? '#fff' : '#4e4034';
  ctx.fillRect(x, y, w, h);
  if (pass === 'mask') {
    return;
  }
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
function clump(ctx, pass, blades, rect, seed, dryShare) {
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
    if (pass === 'colour') {
      const b = 0.7 + rng() * 0.35;
      ctx.filter = dry ? `brightness(${b * 0.9}) saturate(0.7)` : `brightness(${b}) saturate(${1.1 + rng() * 0.3}) hue-rotate(${2 + rng() * 14}deg)`;
    }
    /* The photographed blades are a hand's width: drawn at a third of
     * it they are a grass blade's. */
    stamp(ctx, blades, box, bx, y + h + 2, lean, len, rng() < 0.5, 0.32);
  }
  ctx.restore();
}

/* Meadow flowers on thin stalks from the bottom of rect: buttercup,
 * ox eye daisy, red clover, harebell and the white umbels of wild
 * carrot, the Bernese hay meadow's commonest. */
function flowers(ctx, pass, rect, kind, seed) {
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
    ctx.strokeStyle = pass === 'mask' ? '#fff' : '#5b7a35';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(bx, y + h);
    ctx.quadraticCurveTo(bx, (top + y + h) / 2, hx, top);
    ctx.stroke();
    const col = (c) => (pass === 'mask' ? '#fff' : c);
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
  const foliageCanvas = twoPass(FOLIAGE_PX, FOLIAGE_PX, '#223219', (ctx, pass) => {
    spray(ctx, pass, twig, R.spruce, {
      angle: 1.0, count: 22, len0: 0.34, len1: 0.16, stemW: 10, fill: 0.7,
      filter: 'brightness(1.0) saturate(0.95) hue-rotate(6deg)',
    }, 11);
    spray(ctx, pass, twig, R.fir, {
      angle: 1.35, count: 26, len0: 0.3, len1: 0.14, stemW: 9, fill: 0.3,
      filter: 'brightness(0.9) saturate(1.05) hue-rotate(2deg) contrast(1.05)',
    }, 23);
    tufts(ctx, pass, twig, R.larch, 37);
    curtain(ctx, pass, twig, R.curtain, 41);
    barkStrip(ctx, pass, R.bark, 43);
    leafCluster(ctx, pass, leaves, R.beech, {
      count: 150, leafLen: 150, filter: 'brightness(0.85) saturate(1.15) hue-rotate(10deg)',
    }, 53);
    leafCluster(ctx, pass, leaves, R.maple, {
      count: 160, leafLen: 150, lobed: true, filter: 'brightness(0.8) saturate(1.2) hue-rotate(16deg)',
    }, 59);
  });
  const G = GRASS_RECTS;
  const kinds = ['buttercup', 'daisy', 'clover', 'harebell', 'umbel'];
  const grassCanvas = twoPass(GRASS_PX, GRASS_PX, '#3e5226', (ctx, pass) => {
    for (let k = 0; k < 6; k += 1) {
      clump(ctx, pass, blades, G[`clump${k}`], 101 + k * 7, k < 3 ? 0.02 : 0.06);
    }
    for (let k = 0; k < 4; k += 1) {
      clump(ctx, pass, blades, G[`flower${k}`], 201 + k, 0.05);
      flowers(ctx, pass, G[`flower${k}`], kinds[k], 301 + k);
      if (k === 1) {
        flowers(ctx, pass, G[`flower${k}`], kinds[4], 311);
      }
    }
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
