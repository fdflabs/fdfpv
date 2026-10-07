/*
 * pixels.js: measures patches of a captured frame, so a claim like "the gate
 * ring is the same value as the grass behind it" is a number, not a look.
 * Decodes the PNG with node's zlib and prints the mean colour and relative
 * luminance of named rectangles, plus two edge measurements (walk, stair).
 * Luminance is Rec. 709 on linearised sRGB, the quantity a bloom high-pass
 * thresholds on, so the numbers compare directly with the bloom threshold in
 * src/render/post.js. Nothing imports this; src/main.js points at it.
 *
 *   node scripts/pixels.js FRAME.png name=x,y,w,h [name=x,y,w,h ...]
 *   node scripts/pixels.js FRAME.png name=walk:x,y,dx,dy,n
 *   node scripts/pixels.js FRAME.png name=stair:x,y,w,rows,level
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import fs from 'node:fs';
import zlib from 'node:zlib';

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
const CHANNELS = { 2: 3, 6: 4 };

function paeth(a, b, c) {
  const pa = Math.abs(b - c);
  const pb = Math.abs(a - c);
  const pc = Math.abs(a + b - 2 * c);
  if (pa <= pb && pa <= pc) {
    return a;
  }
  return pb <= pc ? b : c;
}

/* Indexed by filter type: the predictor from left (a), above (b), above-left (c). */
const PREDICT = [
  () => 0,
  (a) => a,
  (a, b) => b,
  (a, b) => Math.floor((a + b) / 2),
  paeth,
];

/*
 * Only 8 bit RGB or RGBA, non-interlaced: what Chromium's
 * Page.captureScreenshot writes. Anything else fails loudly rather than
 * producing plausible numbers from misread bytes.
 */
function decode(buf) {
  if (!PNG_MAGIC.every((byte, i) => buf[i] === byte)) {
    throw new Error('not a PNG');
  }
  let width = 0;
  let height = 0;
  let depth = 8;
  let colourType = 6;
  const idat = [];
  let at = 8;
  while (at + 8 <= buf.length) {
    const length = buf.readUInt32BE(at);
    const type = buf.toString('ascii', at + 4, at + 8);
    const data = buf.subarray(at + 8, at + 8 + length);
    at += 12 + length;
    if (type === 'IEND') {
      break;
    }
    if (type === 'IDAT') {
      idat.push(data);
    }
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colourType = data[9];
      if (data[12] !== 0) {
        throw new Error('interlaced PNG not supported');
      }
    }
  }
  const channels = CHANNELS[colourType];
  if (depth !== 8 || !channels) {
    throw new Error(`unsupported PNG: depth ${depth} colour type ${colourType}`);
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const predict = PREDICT[filter];
    if (!predict) {
      throw new Error(`bad PNG filter ${filter}`);
    }
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? pixels[row + i - channels] : 0;
      const b = y > 0 ? pixels[row - stride + i] : 0;
      const c = i >= channels && y > 0 ? pixels[row - stride + i - channels] : 0;
      pixels[row + i] = (raw[src + i] + predict(a, b, c)) & 0xff;
    }
  }
  return { width, height, channels, pixels };
}

function linear(u) {
  const c = u / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function rgbAt(img, x, y) {
  const o = (y * img.width + x) * img.channels;
  return [img.pixels[o], img.pixels[o + 1], img.pixels[o + 2]];
}

function lumAt(img, x, y) {
  const [r, g, b] = rgbAt(img, x, y);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function inside(img, x, y) {
  return x >= 0 && y >= 0 && x < img.width && y < img.height;
}

/*
 * Prints the run rather than a summary: an aliased edge steps in one pixel,
 * an antialiased one has a real intermediate, and a reviewer walking any edge
 * must be able to find that coverage pixel.
 */
function walk(img, name, spec) {
  const [x, y, dx, dy, n] = spec.split(',').map(Number);
  const values = [];
  for (let i = 0; i < n; i++) {
    const px = x + dx * i;
    const py = y + dy * i;
    if (!inside(img, px, py)) {
      break;
    }
    values.push(lumAt(img, px, py).toFixed(3));
  }
  console.log(`${name.padEnd(16)} walk ${x},${y} step ${dx},${dy}: ${values.join(' ')}`);
}

/* Sub-pixel x where the row's luminance first crosses level, or null. */
function crossing(img, x0, y, w0, level) {
  let prev = lumAt(img, x0, y);
  for (let i = 1; i < w0 && x0 + i < img.width; i++) {
    const cur = lumAt(img, x0 + i, y);
    if ((prev - level) * (cur - level) <= 0 && prev !== cur) {
      return x0 + i - 1 + (level - prev) / (cur - prev);
    }
    prev = cur;
  }
  return null;
}

/*
 * The second difference of the crossing position separates antialiasing from
 * blur. Blur leaves the edge on one integer column for several rows and then
 * jumps; coverage moves it a fraction per row. The first difference is the
 * slope, the second is the staircase: low is smooth, high is stepped.
 */
function stair(img, name, spec) {
  const [x0, y0, w0, rows, level] = spec.split(',').map(Number);
  const at = [];
  for (let ry = 0; ry < rows && y0 + ry < img.height; ry++) {
    at.push(crossing(img, x0, y0 + ry, w0, level));
  }
  const good = at.filter((v) => v !== null).length;
  let sum = 0;
  let count = 0;
  let worst = 0;
  for (let i = 1; i < at.length - 1; i++) {
    if (at[i - 1] === null || at[i] === null || at[i + 1] === null) {
      continue;
    }
    const d2 = at[i + 1] - 2 * at[i] + at[i - 1];
    sum += d2 * d2;
    count++;
    worst = Math.max(worst, Math.abs(d2));
  }
  const rms = count > 0 ? Math.sqrt(sum / count).toFixed(3) : 'n/a';
  console.log(`${name.padEnd(16)} stair rows=${good}/${at.length} secondDiffRMS ${rms} worst ${worst.toFixed(2)} px`);
  const marks = at.map((v) => (v === null ? '-' : v.toFixed(2)));
  console.log(`${' '.repeat(17)}crossings: ${marks.join(' ')}`);
}

function rect(img, name, spec) {
  const [x, y, w, h] = spec.split(',').map(Number);
  const sum = [0, 0, 0];
  let lum = 0;
  let n = 0;
  for (let yy = y; yy < Math.min(y + h, img.height); yy++) {
    for (let xx = x; xx < Math.min(x + w, img.width); xx++) {
      const rgb = rgbAt(img, xx, yy);
      sum[0] += rgb[0];
      sum[1] += rgb[1];
      sum[2] += rgb[2];
      lum += lumAt(img, xx, yy);
      n++;
    }
  }
  const [r, g, b] = sum.map((s) => (s / n).toFixed(0).padStart(3));
  console.log(`${name.padEnd(16)} rgb ${r} ${g} ${b}   linear luminance ${(lum / n).toFixed(3)}   ${n} pixels`);
}

const KINDS = { 'walk:': walk, 'stair:': stair };

function measure(img, arg) {
  const [name, spec] = arg.split('=');
  const prefix = Object.keys(KINDS).find((p) => spec.startsWith(p));
  if (prefix) {
    KINDS[prefix](img, name, spec.slice(prefix.length));
    return;
  }
  rect(img, name, spec);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    process.stderr.write('usage: node scripts/pixels.js FRAME.png name=x,y,w,h [...]\n');
    process.stderr.write('       node scripts/pixels.js FRAME.png name=walk:x,y,dx,dy,n\n');
    process.exit(2);
  }
  const img = decode(fs.readFileSync(args[0]));
  console.log(`${args[0]} ${img.width} by ${img.height}`);
  for (const arg of args.slice(1)) {
    measure(img, arg);
  }
}

main();
