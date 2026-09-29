/*
 * modecards.js: the pictures on the title's two room game cards, drawn by
 * the game, the way scripts/friendscard.js draws Fly with friends': pages
 * of the real shell in one room on the Swiss valley, against a running
 * rooms server, and one frame of one of them.
 *
 *   ROOMS_DB=/tmp/rooms.db PORT=8797 node edge/rooms/node.js
 *   SIM_GPU=1 npm run gen:modecards -- http://127.0.0.1:8797 [combat|ace]
 *
 * combat.jpg: a red Cub cutting a blue P-51's toilet paper. The P-51 is
 * held in the air with its paper hanging, the Cub is let go through the
 * paper a few metres under it, the way scripts/combat-two-page.js makes
 * its cut, and the frame is the Cub's page at the cut: both aircraft,
 * both papers, the burst.
 *
 * ace.jpg: Catch the Ace with three pilots. Whoever the room draws the
 * Ace is held ahead with the crown over it, the two hunters are held
 * behind it closing in, and the frame is a hunter's page from behind the
 * pair (a page draws the crown over another pilot's aircraft).
 *
 * The aircraft are held rather than flown so the frame is the same on
 * every regeneration but the picker names, which are drawn per run.
 * SIM_GPU=1 for the photoreal valley, as for the other cards. Same size
 * and quality as scripts/gatecards.js.
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
import { mkdir, writeFile } from 'node:fs/promises';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const rooms = process.argv[2] || 'http://127.0.0.1:8797';
const only = process.argv[3] || null;

/* gatecards.js's size and quality. */
const W = 900;
const H = 560;
const QUALITY = 82;

function seedFor(id, colour) {
  const s = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, id);
  s.map = 'swiss2';
  s.freestyleMap = 'swiss2';
  s.graphics = 'high';
  s.flightMode = 'angle';
  s.fpsCap = 0;
  s.airframeAsked = true;
  s.crashDamage = false;
  s.livery = { [id]: { regions: { wing: colour, fuselage: colour, tail: colour } } };
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    if (!s.modeCardSeeded) {
      Object.assign(s, ${JSON.stringify(s)}, { modeCardSeeded: true });
      localStorage.setItem(k, JSON.stringify(s));
    }
    localStorage.setItem('webfpv.airhint.v2', '1');
  } catch (e) { /* storage refused */ }`];
}

/* Everything the shell draws over the world: every element that is not
 * the canvas and does not hold it. */
const HIDE_OVERLAY = `(() => {
  for (const n of document.body.querySelectorAll('*')) {
    if (n.tagName !== 'CANVAS' && !n.querySelector('canvas')) {
      n.style.visibility = 'hidden';
    }
  }
  return true;
})()`;

const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;

/* Pages in one room, everybody flying. The first made the room. */
async function room(seeds) {
  const pages = [];
  for (const seed of seeds) {
    pages.push(await openPage({ root, url, width: W, height: H, seed }));
  }
  for (const p of pages) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__map && window.__map().ready', 400000);
  }
  const code = await pages[0].evaluate('window.__roomCreate()');
  await pages[0].until("window.__rooms().phase === 'open'", 30000);
  for (const [i, p] of pages.slice(1).entries()) {
    await p.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
    await p.until(`window.__rooms().phase === 'open' && window.__rooms().seat === ${i + 2}`, 30000);
  }
  for (const p of pages) {
    await p.until(`window.__rooms().peers.length === ${pages.length - 1} && window.__rooms().roomNow != null`, 30000);
    await p.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  }
  for (const p of pages) {
    await p.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  }
  return pages;
}

async function capture(page, cam, name) {
  await page.evaluate(HIDE_OVERLAY);
  await page.evaluate(`(window.__setCam(${cam.join(',')}), window.__cardFrame = window.__boot().frames, true)`);
  await page.until('window.__boot().frames > window.__cardFrame + 3', 30000);
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: QUALITY }, page.sessionId);
  const out = join(root, 'assets', 'gate', `${name}.jpg`);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, Buffer.from(data, 'base64'));
  console.log(`${name}.jpg -> ${out}`);
}

async function done(pages) {
  const errs = pages.flatMap((p) => p.errors).filter((e) => !e.startsWith('network:'));
  for (const p of pages) {
    await p.close();
  }
  if (errs.length) {
    throw new Error(`page errors: ${errs.slice(0, 3).join(' | ')}`);
  }
}

/* Metres under the P-51 the Cub goes through its paper, and how fast. */
const CUT_DOWN_M = 7;
const CUT_SPEED = 10;

async function combat() {
  const pages = await room([seedFor('cub1400', '#e03a2c'), seedFor('p51d1450', '#2f6fe0')]);
  const [a, b] = pages;
  try {
    /* The P-51 up and held, nose toward -x, its paper hanging. */
    const at = await b.evaluate(`(() => {
      const s = window.__craftState();
      const x = s.worldX + 40, z = s.worldZ + 40;
      const y = window.__heightAt(x, z) + 45;
      window.__crashThrow({ x, y, z, yaw: 90, pitch: 0, roll: 0, vx: 0, vy: 0, vz: 0, hold: true, fresh: true });
      return { x, y, z };
    })()`);
    await a.evaluate('window.__combatStart(3); true');
    await a.until("window.__combat().round.state === 'on'", 60000);
    await b.until("window.__combat().round.state === 'on'", 60000);
    await a.sleep(1500);
    /* The Cub level, 8 m to the +x side of the paper, flying at it. The
     * throw is a teleport, which makes it untouchable for five seconds, so
     * it is held out the wait first (combat-two-page.js). */
    await a.evaluate(`(() => {
      const c = window.__combat().peers[0].chains[0];
      const x = c.head[0], z = c.head[2], y = c.head[1] - ${CUT_DOWN_M};
      return window.__crashThrow({ x: x + 8, y, z, yaw: 90, pitch: 0, roll: 0, vx: -${CUT_SPEED}, vy: 0, vz: 0, hold: true, fresh: false });
    })()`);
    await a.sleep(6500);
    await a.evaluate('window.__releasePose(); true');
    await a.until('window.__combat().cuts.length > 0', 8000);
    const p = (await a.evaluate('window.__combat()')).cuts[0].p;
    /* Off the pair's side, a little under the cut, looking up past it to
     * the P-51: the Cub and the burst low, the P-51 and its paper above. */
    await capture(a, [p[0] - 6, p[1] - 0.5, p[2] + 10, p[0] - 3.5, (p[1] + at.y) / 2 - 0.5, p[2], 62], 'combat');
  } finally {
    await done(pages);
  }
}

async function ace() {
  const pages = await room([seedFor('cub1400', '#d8432f'), seedFor('p51d1450', '#2f6fd6'), seedFor('edge1524', '#f2c14e')]);
  try {
    await pages[0].evaluate("window.__roomTagDo('tag-start', 300)");
    for (const p of pages) {
      await p.until("['ace', 'hunter'].includes(window.__roomTag().role)", 60000);
    }
    const roles = [];
    for (const p of pages) {
      roles.push(await p.evaluate('window.__roomTag().role'));
    }
    const acePage = pages[roles.indexOf('ace')];
    const hunters = pages.filter((p) => p !== acePage);
    const base = await pages[0].evaluate(`(() => {
      const s = window.__craftState();
      const x = s.worldX + 30, z = s.worldZ + 60;
      return { x, y: window.__heightAt(x, z) + 30, z };
    })()`);
    /* Nose toward +x, down the valley: the Ace ahead, the hunters 8 m
     * behind it and 2.6 m either side, a little lower, closing. */
    const hold = (p, x, y, z) => p.evaluate(`window.__crashThrow({ x: ${x}, y: ${y}, z: ${z}, yaw: -90, pitch: 0, roll: 0, vx: 0, vy: 0, vz: 0, hold: true, showCraft: true })`);
    await hold(acePage, base.x, base.y, base.z);
    await hold(hunters[0], base.x - 8, base.y - 0.8, base.z + 2.6);
    await hold(hunters[1], base.x - 8.5, base.y - 0.3, base.z - 2.6);
    const cam = hunters[0];
    await cam.until('window.__rooms().peers.every((q) => q.drawn)', 30000);
    await cam.sleep(2500);
    /* Behind the hunters and under them, up the line to the Ace, so the
     * valley and the sky are behind the three rather than the village. */
    await capture(cam, [base.x - 18, base.y - 2.2, base.z + 0.8, base.x + 10, base.y + 2.4, base.z, 44], 'ace');
  } finally {
    await done(pages);
  }
}

if (!only || only === 'combat') {
  await combat();
}
if (!only || only === 'ace') {
  await ace();
}
