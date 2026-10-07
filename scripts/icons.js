/*
 * icons.js: draws the family mark (a quad seen from above) and writes the
 * icon files browsers ask for: icon.svg, favicon.ico (16, 32, 48) and
 * apple-touch-icon.png (180). Run `node scripts/icons.js <accent> <outdir>`,
 * or `npm run gen:icons` for the simulator's set in the repo root.
 *
 * A script rather than checked-in binaries because an .ico is opaque: nobody
 * can see what it draws or change a colour without a paint program. The mark
 * is a few lines of arithmetic, so the geometry below is the single source of
 * truth and every file is derived from it. No image library either: signed
 * distances, a box filter and node's zlib are about a hundred lines, a
 * dependency would be megabytes.
 *
 * One mark, three tints, because a pilot keeps sim and board open in two tabs
 * and at 16 px a tab is the icon plus four letters. sakura is the simulator
 * (its wordmark and the family chrome colour), mint is the board (its chrome
 * is sakura too, and two identical tabs defeat the point, so it takes the
 * colour it paints a record in), cream is the landing page, which owns no
 * product's accent. This is deliberately not the landing page's card mapping:
 * a card only has to differ from its row neighbours, an icon has to survive
 * beside its own page. DEPLOY.md tabulates the same three and lists the
 * commands that write the board's and landing page's sets into their sibling
 * checkouts.
 *
 * The output is committed and nothing checks it, so change a number here and
 * rerun, or the SVG and the rasters draw different pictures. Pixels are
 * deterministic; the files are not quite, since IDAT is whatever the linked
 * zlib emits, so a Node upgrade may rewrite them for an unchanged mark. That
 * is still no reason to generate at deploy time: none of the three services
 * has a build step.
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
import path from 'node:path';
import zlib from 'node:zlib';

/*
 * The :root tokens every page declares. One table for both the SVG and the
 * rasters, because two would drift and put a favicon.ico and an icon.svg of
 * different colours on the same page.
 */
const HEX = { deep: '#141c16', cream: '#f3ead4', sakura: '#e8a8b8', mint: '#7dffb4' };
const RGB = Object.fromEntries(Object.entries(HEX).map(([name, hex]) => [
  name,
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)),
]));

/*
 * Checked against this list, never by looking the name up in HEX: `constructor`
 * once resolved through Object.prototype, the NaN colour went into a
 * Uint8Array as 0 and three valid, wrong files were written with success.
 */
const ACCENTS = ['cream', 'sakura', 'mint'];

/* A 32 unit square, the SVG's own size; every raster samples it. */
const VIEW = 32;
const MID = VIEW / 2;
const PLATE_RADIUS = 7;
const NEAR = 10.4;
const FAR = 21.6;
const MOTORS = [[NEAR, NEAR], [FAR, NEAR], [NEAR, FAR], [FAR, FAR]];
/* Leaves a clear gap to the plate corner; pushed into the corners it reads as a ring. */
const MOTOR_RADIUS = 4.25;
const ARM_RADIUS = 1.8;
/*
 * Solid arms compete with the props and the mark becomes a filled square;
 * much fainter and they vanish below 32 px, leaving four unexplained dots.
 */
const ARM_OPACITY = 0.52;
const HUB_SIDE = 5.4;
const HUB_RADIUS = 1.5;

const SUPERSAMPLE = 4;
const ICO_SIZES = [16, 32, 48];
const TOUCH_SIZE = 180;

function roundRect(cx, cy, w, h, r) {
  return (x, y) => {
    const qx = Math.abs(x - cx) - (w / 2 - r);
    const qy = Math.abs(y - cy) - (h / 2 - r);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  };
}

function disc(cx, cy, r) {
  return (x, y) => Math.hypot(x - cx, y - cy) - r;
}

function capsule([ax, ay], [bx, by], r) {
  const ex = bx - ax;
  const ey = by - ay;
  const len2 = ex * ex + ey * ey;
  return (x, y) => {
    const px = x - ax;
    const py = y - ay;
    const t = Math.min(Math.max((px * ex + py * ey) / len2, 0), 1);
    return Math.hypot(px - ex * t, py - ey * t) - r;
  };
}

function layers(accent) {
  return [
    { d: roundRect(MID, MID, VIEW, VIEW, PLATE_RADIUS), c: RGB.deep, a: 1 },
    { d: capsule(MOTORS[0], MOTORS[3], ARM_RADIUS), c: RGB[accent], a: ARM_OPACITY },
    { d: capsule(MOTORS[1], MOTORS[2], ARM_RADIUS), c: RGB[accent], a: ARM_OPACITY },
    ...MOTORS.map(([x, y]) => ({ d: disc(x, y, MOTOR_RADIUS), c: RGB[accent], a: 1 })),
    { d: roundRect(MID, MID, HUB_SIDE, HUB_SIDE, HUB_RADIUS), c: RGB.cream, a: 1 },
  ];
}

/*
 * Supersampled rather than antialiased from the distance: six overlapping
 * shapes blended pairwise leave seams where an arm meets a propeller, while
 * sampling the finished picture has none. Colour is averaged over covered
 * samples only, so the empty corners do not drag the plate edge to black.
 */
function raster(size, accent) {
  const stack = layers(accent);
  const plate = stack[0].d;
  const out = new Uint8Array(size * size * 4);
  const samples = SUPERSAMPLE * SUPERSAMPLE;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const sum = [0, 0, 0];
      let cover = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const u = ((px + (sx + 0.5) / SUPERSAMPLE) / size) * VIEW;
          const v = ((py + (sy + 0.5) / SUPERSAMPLE) / size) * VIEW;
          if (plate(u, v) > 0) {
            continue;
          }
          const c = sample(stack, u, v);
          sum[0] += c[0];
          sum[1] += c[1];
          sum[2] += c[2];
          cover++;
        }
      }
      const o = (py * size + px) * 4;
      for (let k = 0; k < 3; k++) {
        out[o + k] = cover > 0 ? Math.round(sum[k] / cover) : 0;
      }
      out[o + 3] = Math.round((cover / samples) * 255);
    }
  }
  return out;
}

function sample(stack, u, v) {
  const c = [0, 0, 0];
  for (const layer of stack) {
    if (layer.d(u, v) > 0) {
      continue;
    }
    for (let k = 0; k < 3; k++) {
      c[k] = layer.c[k] * layer.a + c[k] * (1 - layer.a);
    }
  }
  return c;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  /*
   * Rows come from the typed array's own view, offset included: a pooled
   * Buffer or a subarray starts part way into its ArrayBuffer, and reading
   * from zero still yields a valid PNG with correct CRCs, of the wrong bytes.
   * Filter 0 throughout: the mark is flat colour and deflate finds the runs.
   */
  const pixels = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  const stride = size * 4;
  const rows = [];
  for (let y = 0; y < size; y++) {
    rows.push(Buffer.from([0]), pixels.subarray(y * stride, (y + 1) * stride));
  }
  const idat = zlib.deflateSync(Buffer.concat(rows), { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/*
 * PNG payloads, not DIB: every shipping browser reads PNG in ICO, and a DIB
 * needs a bottom-up bitmap plus an AND mask nothing has read in 20 years.
 */
function ico(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = 6 + 16 * entries.length;
  const dir = entries.map(({ size, png: data }) => {
    const e = Buffer.alloc(16);
    /* The directory stores sizes in a byte, and 0 means 256. */
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...dir, ...entries.map((e) => e.png)]);
}

/*
 * The SVG is a text file this project ships, so it carries a licence notice
 * (an .ico or .png has nowhere a browser reliably ignores). It sits after the
 * root element so nothing has to parse a prolog to find the drawing.
 */
const NOTICE = `<!--
    The Paraguayan Drone Combat Simulator mark. Generated by
    scripts/icons.js in fdflabs/fdfpv; edit
    the geometry there and regenerate, not here.

    This file is part of the Paraguayan Drone Combat Simulator.

    The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or (at
    your option) any later version.

    The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
    WITHOUT ANY WARRANTY, without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
    General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
  -->`;

function svg(accent) {
  const a = HEX[accent];
  const [m0, m1, m2, m3] = MOTORS;
  const circles = MOTORS.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${MOTOR_RADIUS}"/>`).join('');
  const hub = MID - HUB_SIDE / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}" width="${VIEW}" height="${VIEW}" role="img" aria-label="Paraguayan Drone Combat Simulator">
  ${NOTICE}
  <rect width="${VIEW}" height="${VIEW}" rx="${PLATE_RADIUS}" fill="${HEX.deep}"/>
  <path d="M${m0[0]} ${m0[1]}L${m3[0]} ${m3[1]}M${m1[0]} ${m1[1]}L${m2[0]} ${m2[1]}" stroke="${a}" stroke-width="${ARM_RADIUS * 2}" stroke-linecap="round" opacity="${ARM_OPACITY}"/>
  <g fill="${a}">${circles}</g>
  <rect x="${hub}" y="${hub}" width="${HUB_SIDE}" height="${HUB_SIDE}" rx="${HUB_RADIUS}" fill="${HEX.cream}"/>
</svg>
`;
}

function main() {
  const [accent, outdir] = process.argv.slice(2);
  if (!ACCENTS.includes(accent) || !outdir) {
    process.stderr.write(`usage: node scripts/icons.js <${ACCENTS.join('|')}> <outdir>\n`);
    process.exit(2);
  }
  const out = path.resolve(outdir);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'icon.svg'), svg(accent));
  const entries = ICO_SIZES.map((size) => ({ size, png: png(size, raster(size, accent)) }));
  fs.writeFileSync(path.join(out, 'favicon.ico'), ico(entries));
  fs.writeFileSync(path.join(out, 'apple-touch-icon.png'), png(TOUCH_SIZE, raster(TOUCH_SIZE, accent)));
  console.log(`${accent} mark written to ${out}: icon.svg, favicon.ico, apple-touch-icon.png`);
}

main();
