/*
 * avionics-layout.js: the Avionics HUD (src/ui/avionicshud.js,
 * docs/AVIONICS-HUD.md) on the real shell, at 1280x720 and 1920x1080:
 *
 *   SIM_GPU=1 npm run check:avionics-layout [-- outdir]
 *
 * One page at a time. Per size, the 7 inch (a combat airframe) seated on
 * Itaipu in a private room with this pilot alone in it, and what must
 * hold on the boxes the page itself drew:
 *
 *   - the Avionics HUD is what a combat airframe flies with by default
 *   - every panel and tape is inside the window
 *   - no two of them overlap
 *   - none meets the game's own furniture (chips, music dock, gimbals)
 *   - then in a live war, all of that again, and no panel meets the war
 *     HUD's box, its callouts or the markers' radar
 *
 * And the per airframe default and override, at 1280x720: the 5 inch
 * flies with the FPV OSD; a pilot who sets the 7 inch to the FPV OSD gets
 * it after a reload.
 *
 * Pictures go in outdir (build/avionics-layout by default); look at them.
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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = process.argv.slice(2).find((a) => !a.startsWith('--')) || join(root, 'build', 'avionics-layout');
const SIZES = [[1280, 720], [1920, 1080]];

/* The radar's geometry, from warmarkers.js, and the copy avionicshud.js
 * keeps of it: they must agree, or the panels dodge a radar that is not
 * there. */
const constOf = (file, name) => {
  const m = new RegExp(`const ${name} = (\\d+);`).exec(readFileSync(join(root, file), 'utf8'));
  if (!m) {
    throw new Error(`${file} has no ${name}`);
  }
  return Number(m[1]);
};
const RADAR_PX = constOf('src/ui/warmarkers.js', 'RADAR_PX');
const RADAR_TOP_PX = constOf('src/ui/warmarkers.js', 'RADAR_TOP_PX');

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

const meets = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
const box = (r) => `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}x${Math.round(r.h)}`;

function seed(airframe) {
  const s = seatAirframe({ airframe, rates: airframeById(airframe).rates }, airframe);
  s.map = 'itaipu';
  s.freestyleMap = 'itaipu';
  s.graphics = 'low';
  s.flightMode = 'angle';
  s.fpsCap = 0;
  s.airframeAsked = true;
  s.crashDamage = true;
  s.warConsent = true;
  s.parts = {};
  /* Written once: a reload keeps what the page stored since. */
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    if (!s.avxSeeded) {
      Object.assign(s, ${JSON.stringify(s)}, { avxSeeded: true });
      localStorage.setItem(k, JSON.stringify(s));
    }
    localStorage.setItem('webfpv.airhint.v2', '1');
  } catch (e) { /* storage refused */ }`];
}

async function fly(page) {
  await page.until('window.__shellReady === true', 300000);
  await page.until('window.__map && window.__map().ready', 600000);
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
}

const READ = `JSON.stringify({
  avx: window.__avionicsHud(),
  osd: window.__fpvOsd().on,
  furniture: [...document.querySelectorAll('.bug-chip, .music-dock, .osd-gimbal, .osd-sticks, .osd-air')]
    .filter((e) => getComputedStyle(e).display !== 'none')
    .map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0)
    .map((r) => ({ x: r.left, y: r.top, w: r.width, h: r.height })),
  war: [...document.querySelectorAll('.war-hud, .war-calls')]
    .filter((e) => getComputedStyle(e).display !== 'none')
    .map((e) => [e.className, e.getBoundingClientRect()]).filter(([, r]) => r.width > 0 && r.height > 0)
    .map(([c, r]) => ({ c, x: r.left, y: r.top, w: r.width, h: r.height })),
  vw: innerWidth, vh: innerHeight,
})`;

/* The panels and tapes against the window, each other and the furniture. */
function judge(got, label) {
  const items = [
    ...Object.entries(got.avx.panels).map(([id, r]) => ({ id, ...r })),
    ...Object.entries(got.avx.tapes).map(([id, r]) => ({ id: `${id} tape`, ...r })),
  ];
  console.log(`  info  ${items.map((r) => `${r.id} ${box(r)}`).join('; ')}`);
  const out = items.filter((r) => r.x < 0 || r.y < 0 || r.x + r.w > got.vw || r.y + r.h > got.vh);
  check(`${label}: every panel and tape is inside the window`, out.length === 0, out.map((r) => `${r.id} ${box(r)}`).join(' | '));
  const pairs = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      if (meets(items[i], items[j])) {
        pairs.push(`${items[i].id} x ${items[j].id}`);
      }
    }
  }
  check(`${label}: no two overlap`, pairs.length === 0, pairs.join(' | '));
  const panels = items.filter((r) => !r.id.endsWith('tape'));
  const hit = [];
  for (const p of panels) {
    for (const f of got.furniture) {
      if (meets(p, f)) {
        hit.push(`${p.id} x ${box(f)}`);
      }
    }
  }
  check(`${label}: no panel meets the game's chips, dock or gimbals`, hit.length === 0, hit.join(' | '));
  return panels;
}

async function shot(page, name) {
  await mkdir(outDir, { recursive: true });
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  const path = join(outDir, `${name}.png`);
  await writeFile(path, Buffer.from(data, 'base64'));
  console.log(`  shot ${path}`);
}

async function layout(width, height, rooms) {
  console.log(`${width}x${height}, 7 inch`);
  const page = await openPage({ root, url: `/index.html?rooms=${encodeURIComponent(rooms)}`, width, height, seed: seed('7inch') });
  try {
    await page.until('window.__shellReady === true', 300000);
    await page.until('window.__map && window.__map().ready && window.__crashCam', 600000);
    const code = await page.evaluate("window.__roomCreate({ map: 'itaipu' })");
    await page.until("window.__rooms().phase === 'open' && window.__rooms().roomNow != null", 30000);
    await fly(page);
    await page.until('window.__avionicsHud().on', 30000).catch(() => {});
    await page.sleep(1500);
    let got = JSON.parse(await page.evaluate(READ));
    check('a combat airframe flies with the Avionics HUD by default', got.avx.on && !got.osd, `avionics ${got.avx.on}, FPV OSD ${got.osd}, room ${code}`);
    judge(got, 'alone');
    await shot(page, `avionics-${width}x${height}-alone`);

    await page.evaluate("window.__warDo('start', 'itaipu-1')");
    await page.until("window.__war().view.state === 'live' && window.__war().hud.output !== ''", 30000);
    await page.until('window.__war().view.alive > 0 && window.__war().markers.on', 60000);
    /* The panels are placed once a second, from what is up. */
    await page.sleep(2500);
    got = JSON.parse(await page.evaluate(READ));
    check('still the Avionics HUD in a war', got.avx.on, `state ${got.avx.state}`);
    const panels = judge(got, 'war');
    const radar = { c: 'radar', x: got.vw - RADAR_PX * 2 - 18, y: RADAR_TOP_PX - 20, w: RADAR_PX * 2, h: RADAR_PX * 2 + 20 };
    const hud = got.war.find((r) => r.c === 'war-hud');
    check('the war HUD is up', Boolean(hud), got.war.map((r) => `${r.c} ${box(r)}`).join(' | '));
    const hit = [];
    for (const p of panels) {
      for (const w of [...got.war, radar]) {
        if (meets(p, w)) {
          hit.push(`${p.id} ${box(p)} x ${w.c} ${box(w)}`);
        }
      }
    }
    check('war: no panel meets the war HUD, its callouts or the radar', hit.length === 0, hit.join(' | '));
    const left = got.avx.tapes.speed;
    check('war: the speed tape clears the war HUD\'s column', !hud || hud.x + hud.w <= left.x, hud ? `HUD to x ${Math.round(hud.x + hud.w)}, tape from x ${Math.round(left.x)}` : '');
    await shot(page, `avionics-${width}x${height}-war`);
    const errs = page.errors.filter((e) => !e.startsWith('network:'));
    check('no page error', errs.length === 0, errs.slice(0, 3).join(' | '));
  } finally {
    await page.close();
  }
}

async function defaults() {
  console.log('1280x720, the default and the override');
  let page = await openPage({ root, width: 1280, height: 720, seed: seed('5inch') });
  try {
    await fly(page);
    await page.until('window.__fpvOsd().on || window.__avionicsHud().on', 30000).catch(() => {});
    const got = JSON.parse(await page.evaluate(READ));
    check('the 5 inch flies with the FPV OSD', got.osd && !got.avx.on, `FPV OSD ${got.osd}, avionics ${got.avx.on}`);
  } finally {
    await page.close();
  }
  page = await openPage({ root, width: 1280, height: 720, seed: seed('7inch') });
  try {
    await fly(page);
    await page.until('window.__avionicsHud().on', 30000).catch(() => {});
    let got = JSON.parse(await page.evaluate(READ));
    check('the 7 inch flies with the Avionics HUD', got.avx.on && !got.osd, `FPV OSD ${got.osd}, avionics ${got.avx.on}`);
    /* What the menu's HUD style row writes for the seated airframe. */
    await page.evaluate(`(() => {
      const s = window.__ui.settings;
      s.hudStyleBy = { ...s.hudStyleBy, [s.airframe]: 'osd' };
      window.__ui.persistSettings();
      return true;
    })()`);
    await page.cdp.send('Page.reload', {}, page.sessionId);
    await page.sleep(1000);
    await fly(page);
    await page.until('window.__fpvOsd().on || window.__avionicsHud().on', 30000).catch(() => {});
    got = JSON.parse(await page.evaluate(READ));
    check('the pilot\'s choice for the 7 inch sticks after a reload', got.osd && !got.avx.on, `FPV OSD ${got.osd}, avionics ${got.avx.on}`);
  } finally {
    await page.close();
  }
}

const avx = readFileSync(join(root, 'src/ui/avionicshud.js'), 'utf8');
check('avionicshud.js keeps warmarkers.js\'s radar geometry',
  avx.includes(`const RADAR_PX = ${RADAR_PX};`) && avx.includes(`const RADAR_TOP_PX = ${RADAR_TOP_PX};`), `RADAR_PX ${RADAR_PX}, RADAR_TOP_PX ${RADAR_TOP_PX}`);

const scratch = mkdtempSync(join(tmpdir(), 'fdfpv-avx-'));
const { startRooms } = await import('../edge/rooms/node.js');
const server = await startRooms({ db: join(scratch, 'rooms.db'), port: 0 });
try {
  for (const [w, h] of SIZES) {
    await layout(w, h, `http://127.0.0.1:${server.port}`);
  }
  await defaults();
} catch (e) {
  failed += 1;
  console.log(`  FAIL  ${e.stack || e}`);
} finally {
  await server.stop();
  rmSync(scratch, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
