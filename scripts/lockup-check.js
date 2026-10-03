/*
 * lockup-check.js: the name on the title, the owner's lockup of 2 October
 * (index.html, .screen-title .lockup), laid out at every window it has to
 * survive, against a running rooms server so the rooms panel is up beside
 * it (never the live one):
 *
 *   ROOMS_DB=/tmp/rooms.db PORT=8797 node edge/rooms/node.js
 *   SIM_GPU=1 node scripts/lockup-check.js http://127.0.0.1:8797 [outdir]
 *
 * On the gate, at 1280 by 720, 1920 by 1080, 2560 by 1440, 3840 by 2160
 * and the phone sizes the cards check uses: both of the name's faces
 * loaded and drawn in Saira, DRONE COMBAT on one line and not cut, the
 * lockup and the Beta line inside the window, above the cards and clear
 * of every card, the rooms panel and the corner chips, and no sideways
 * scroll. Then the title past the gate (the free flight menu over the
 * valley, by a link that names the map and the aircraft), where the same
 * heading stands over the menu: inside the window and on one line.
 *
 * Pictures in outdir, not in the repository.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { AIRFRAME_IDS } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const rooms = process.argv[2] || 'http://127.0.0.1:8797';
const outDir = process.argv[3] || join(root, 'build', 'lockup');

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
}

async function shot(page, name) {
  await mkdir(outDir, { recursive: true });
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  const path = join(outDir, `${name}.png`);
  await writeFile(path, Buffer.from(data, 'base64'));
  console.log(`  shot ${path}`);
}

async function resize(page, width, height) {
  await page.cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: false,
  }, page.sessionId);
  await page.until(`window.innerWidth === ${width} && window.innerHeight === ${height}`, 10000);
  await page.sleep(600);
}

/* Boxes as [left, top, right, bottom], rounded to the pixel. */
const LAYOUT = `(() => {
  const box = (n) => {
    if (!n || n.hidden || n.getClientRects().length === 0) {
      return null;
    }
    const r = n.getBoundingClientRect();
    return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)];
  };
  const name = document.querySelector('.screen-title .lockup-name');
  const faces = [...document.fonts].filter((f) => f.family.replace(/"/g, '') === 'Saira Lockup');
  return {
    w: window.innerWidth, h: window.innerHeight, sw: document.documentElement.scrollWidth,
    faces: faces.map((f) => f.weight + ':' + f.status),
    family: getComputedStyle(name).fontFamily,
    size: parseFloat(getComputedStyle(name).fontSize),
    nameBox: box(name),
    nameCut: name.scrollWidth > name.clientWidth + 1,
    lockup: box(document.querySelector('.screen-title .lockup')),
    beta: box(document.querySelector('.screen-title .beta-note')),
    panel: box(document.querySelector('.screen-title .gate-rooms')),
    cards: [...document.querySelectorAll('.screen-title .gate-card')].map(box).filter(Boolean),
    chips: [...document.querySelectorAll('.signin-chip, .music-dock')].map(box).filter((b) => b && b[2] > b[0]),
    menu: box(document.querySelector('.screen-title .menu-stage')),
  };
})()`;

const apart = (a, b) => a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1];
const inside = (b, v) => b[0] >= 0 && b[1] >= 0 && b[2] <= v.w && b[3] <= v.h;
const union = (a, b) => (b ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : a);

function oneLine(v) {
  /* One line of capitals is 0.69 of the em tall (the CSS's line height). */
  return Boolean(v.nameBox) && v.nameBox[3] - v.nameBox[1] <= Math.ceil(v.size * 0.75) && !v.nameCut;
}

const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;
console.log(`the title lockup, rooms at ${rooms}`);
const page = await openPage({ root, url, width: 1280, height: 720 });
try {
  await page.until('window.__shellReady === true', 300000);
  await page.until("window.__ui.onGate() && document.querySelectorAll('.screen-title .gate-card').length > 0", 60000);
  await page.until('document.fonts.status === "loaded"', 30000);

  const first = await page.evaluate(LAYOUT);
  check('both of the name\'s faces loaded', first.faces.sort().join() === '300:loaded,800:loaded', first.faces.join());
  check('the name is set in Saira', /^"?Saira Lockup"?,/.test(first.family), first.family);

  for (const [w, h] of [[1280, 720], [1920, 1080], [2560, 1440], [3840, 2160], [1024, 768], [390, 844], [360, 640], [844, 390]]) {
    await resize(page, w, h);
    const v = await page.evaluate(LAYOUT);
    const brand = union(v.lockup, v.beta);
    check(`${w} by ${h}: DRONE COMBAT on one line, not cut`, oneLine(v), `name ${JSON.stringify(v.nameBox)} at ${v.size}px`);
    check(`${w} by ${h}: the lockup and the Beta line inside the window, no sideways scroll`,
      inside(brand, v) && v.sw <= v.w, `brand ${JSON.stringify(brand)} scroll ${v.sw}`);
    check(`${w} by ${h}: clear of every card and above them`,
      v.cards.length > 0 && v.cards.every((c) => apart(brand, c) && brand[3] <= c[1]),
      `brand ${JSON.stringify(brand)} first card ${JSON.stringify(v.cards[0])}`);
    check(`${w} by ${h}: clear of the rooms panel and the corner chips`,
      Boolean(v.panel) && apart(brand, v.panel) && v.chips.every((c) => apart(brand, c)),
      `brand ${JSON.stringify(brand)} panel ${JSON.stringify(v.panel)} chips ${JSON.stringify(v.chips)}`);
    console.log(`    name ${v.size}px, ${v.nameBox[2] - v.nameBox[0]} px wide, ${Math.round(100 * (v.nameBox[2] - v.nameBox[0]) / w)} percent of the window`);
    await shot(page, `gate-${w}x${h}`);
  }
} finally {
  await page.close();
}

/* Past the gate: the free flight menu over the valley. */
const craft = AIRFRAME_IDS.includes('skyhunter') ? 'skyhunter' : AIRFRAME_IDS[0];
const menuUrl = `/index.html?rooms=${encodeURIComponent(rooms)}&map=swiss2&craft=${craft}`;
const menu = await openPage({ root, url: menuUrl, width: 1280, height: 720 });
try {
  await menu.until('window.__shellReady === true', 300000);
  await menu.until("window.__ui.screen === 'title' && !window.__ui.onGate()", 120000);
  await menu.until('document.fonts.status === "loaded"', 30000);
  for (const [w, h] of [[1280, 720], [1920, 1080], [2560, 1440]]) {
    await resize(menu, w, h);
    const v = await menu.evaluate(LAYOUT);
    check(`menu ${w} by ${h}: DRONE COMBAT on one line, not cut`, oneLine(v), `name ${JSON.stringify(v.nameBox)} at ${v.size}px`);
    check(`menu ${w} by ${h}: the lockup inside the window and clear of the menu`,
      inside(v.lockup, v) && (!v.menu || apart(v.lockup, v.menu)) && v.chips.every((c) => apart(v.lockup, c)),
      `lockup ${JSON.stringify(v.lockup)} menu ${JSON.stringify(v.menu)}`);
    await shot(menu, `menu-${w}x${h}`);
  }
} finally {
  await menu.close();
}

const errors = [...page.errors, ...menu.errors];
check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
