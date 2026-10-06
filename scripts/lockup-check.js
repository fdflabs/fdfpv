/*
 * lockup-check.js: the name on the title, the owner's lockup of 2 October
 * (index.html, .screen-title .lockup), laid out at every window it has to
 * survive, with a rooms server of its own so the rooms panel is up beside
 * it (never the live one):
 *
 *   SIM_GPU=1 node scripts/lockup-check.js [outdir]
 *
 * The rooms server is edge/rooms/node.js on a port the system hands out
 * (python3 binds port 0 and reports it) and a database in a temporary
 * directory, both gone when the check ends: a fixed port collides with
 * whatever else on the machine is running a rooms server.
 *
 * On the gate, at 1280 by 720, 1920 by 1080, 2560 by 1440, 3840 by 2160
 * and the phone sizes the cards check uses: both of the name's faces
 * loaded and drawn in Saira, DRONE COMBAT on one line and not cut, the
 * lockup and the Beta line inside the window, above the cards and clear
 * of every card, every row clear of the rooms panel and the corner
 * chips (on a phone PARAGUAYAN stands level with them), no sideways
 * scroll, and the name as wide as the box the title gives it. Then the
 * title past the gate (the free flight menu over the valley, by a link
 * that names the map and the aircraft), where the same
 * heading stands over the menu: inside the window and on one line.
 *
 * Pictures in outdir, not in the repository.
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

import { execFileSync, spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { AIRFRAME_IDS } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = process.argv[2] || join(root, 'build', 'lockup');

/* Free the moment python3 exits, so a race is possible but needs another
 * process to bind the same port within the next few milliseconds. */
const port = Number(execFileSync('python3', ['-c',
  'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()'],
{ encoding: 'utf8' }).trim());
const dbDir = await mkdtemp(join(tmpdir(), 'lockup-rooms-'));
const roomsProc = spawn(process.execPath, [join(root, 'edge/rooms/node.js')], {
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', ROOMS_DB: join(dbDir, 'rooms.db') },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve, reject) => {
  let said = '';
  roomsProc.stdout.on('data', (b) => {
    said += b;
    if (said.includes('fdfpv rooms on')) {
      resolve();
    }
  });
  roomsProc.once('exit', (code) => reject(new Error(`the rooms server exited with ${code} before listening`)));
});
async function stopRooms() {
  const exited = roomsProc.exitCode !== null ? Promise.resolve() : new Promise((done) => roomsProc.once('exit', done));
  roomsProc.kill('SIGTERM');
  await exited;
  await rm(dbDir, { recursive: true, force: true });
}
const rooms = `http://127.0.0.1:${port}`;

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
    boxBox: box(document.querySelector('.screen-title .lockup-box')),
    nameCut: name.scrollWidth > name.clientWidth + 1,
    lockup: box(document.querySelector('.screen-title .lockup')),
    /* What is drawn, row by row: the flag and PARAGUAYAN (the range leaves
       out the rule after it, a pseudo element), the name, SIMULATOR and its
       rules. The heading's own box is wider than its first row. */
    drawn: (() => {
      const over = document.createRange();
      over.selectNodeContents(document.querySelector('.screen-title .lockup-over'));
      const r = over.getBoundingClientRect();
      return [[Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
        box(name), box(document.querySelector('.screen-title .lockup-under')),
        box(document.querySelector('.screen-title .beta-note'))].filter(Boolean);
    })(),
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

/* The component is sized by its box alone (wordmark() in src/ui/ui.js). */
function fills(v) {
  const name = v.nameBox[2] - v.nameBox[0];
  const box = v.boxBox[2] - v.boxBox[0];
  return Math.abs(name - box) <= 0.03 * box;
}

/* Flight Club, at every size, with the rooms panel up beside the name. */
async function gate(rooms) {
  const page = await openPage({ root, url: `/index.html?rooms=${encodeURIComponent(rooms)}`, width: 1280, height: 720 });
  try {
    await page.until('window.__shellReady === true', 300000);
    await page.until("window.__ui.onGate() && document.querySelectorAll('.screen-title .gate-card').length > 0", 60000);
    /* The rooms panel is Flight Club's (src/ui/ui.js HUBS): its hub, where
     * the panel stands beside the name, is the tight case. */
    await page.evaluate("(() => { window.__ui.openHub('club'); return true; })()");
    await page.until("window.__ui.hub === 'club' && document.querySelector('.screen-title .gate-rooms') && !document.querySelector('.screen-title .gate-rooms').hidden", 30000);
    await page.until('document.fonts.status === "loaded"', 30000);

    const first = await page.evaluate(LAYOUT);
    check('both of the name\'s faces loaded', first.faces.sort().join() === '300:loaded,800:loaded', first.faces.join());
    check('the name is set in Saira', /^"?Saira Lockup"?,/.test(first.family), first.family);

    for (const [w, h] of [[1280, 720], [1920, 1080], [2560, 1440], [3840, 2160], [1024, 768], [768, 1024], [600, 960], [390, 844], [360, 640], [844, 390]]) {
      await resize(page, w, h);
      const v = await page.evaluate(LAYOUT);
      const brand = union(v.lockup, v.beta);
      check(`${w} by ${h}: DRONE COMBAT on one line, not cut`, oneLine(v), `name ${JSON.stringify(v.nameBox)} at ${v.size}px`);
      check(`${w} by ${h}: the name fills the width its box is given, within 3 percent`, fills(v),
        `name ${JSON.stringify(v.nameBox)} box ${JSON.stringify(v.boxBox)}`);
      check(`${w} by ${h}: the lockup and the Beta line inside the window, no sideways scroll`,
        inside(brand, v) && v.sw <= v.w, `brand ${JSON.stringify(brand)} scroll ${v.sw}`);
      check(`${w} by ${h}: clear of every card and above them`,
        v.cards.length > 0 && v.cards.every((c) => apart(brand, c) && brand[3] <= c[1]),
        `brand ${JSON.stringify(brand)} first card ${JSON.stringify(v.cards[0])}`);
      check(`${w} by ${h}: every row of it clear of the rooms panel and the corner chips`,
        Boolean(v.panel) && v.drawn.every((d) => apart(d, v.panel) && v.chips.every((c) => apart(d, c))),
        `rows ${JSON.stringify(v.drawn)} panel ${JSON.stringify(v.panel)} chips ${JSON.stringify(v.chips)}`);
      console.log(`    name ${v.size}px, ${v.nameBox[2] - v.nameBox[0]} px wide, ${Math.round(100 * (v.nameBox[2] - v.nameBox[0]) / w)} percent of the window`);
      await shot(page, `gate-${w}x${h}`);
    }
    return page.errors;
  } finally {
    await page.close();
  }
}

/* Past the gate: the free flight menu over the valley, by a link that
 * names the map and the aircraft. */
async function pastGate(rooms) {
  const craft = AIRFRAME_IDS.includes('skyhunter') ? 'skyhunter' : AIRFRAME_IDS[0];
  const url = `/index.html?rooms=${encodeURIComponent(rooms)}&map=swiss2&craft=${craft}`;
  const menu = await openPage({ root, url, width: 1280, height: 720 });
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
    return menu.errors;
  } finally {
    await menu.close();
  }
}

console.log(`the title lockup, rooms at ${rooms}`);
try {
  const errors = [...await gate(rooms), ...await pastGate(rooms)];
  check('no page error', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await stopRooms();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
