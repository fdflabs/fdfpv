/*
 * war-stage-screen-check.js: what a war stage puts on the screen, in the
 * real page on the Itaipu map (src/share/war/stages.js on the room, drawn
 * by src/ui/warhud.js and src/render/warcutaway.js). The four Act 1
 * missions so far are rounds with no objectives, titles or cutaways, so
 * the war checks that fly them see none of this. npm run war:stagescreen.
 *
 *     SIM_GPU=1 node scripts/war-stage-screen-check.js [OUT_DIR]
 *
 * It imports the HUD and the cutaway into the page and hands them what
 * the room would (a view with a stage, a stage event, a cutaway cue):
 *
 *   HUD       the stage's line and each objective with its state, a count
 *             and a hold's bar counting on the page's clock; the stage's
 *             title as a lower third that goes after its 3 s; the next
 *             wave from the room's drawn time
 *   cutaway   a pilot in control gets the picture in picture: the corner
 *             drawn from the cutaway's camera (its pixels differ from the
 *             main view's there), the main view untouched, and gone after
 *             its ms; a pilot not in control gets the cut: the shell's
 *             camera moved to the place, the letterbox up, then given back
 *   console   no page error
 *
 * OUT_DIR (default the system temp dir's war-stage-screen) gets a frame of
 * each, for a person to look at. Never inside the repository.
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
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = resolve(process.argv[2] || join(tmpdir(), 'war-stage-screen'));
if (outDir === root || outDir.startsWith(`${root}/`)) {
  throw new Error(`war-stage-screen: ${outDir} is inside the repository; frames go outside it`);
}
await mkdir(outDir, { recursive: true });

const failures = [];
const row = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) {
    failures.push(name);
  }
};

const seed = [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.graphics = 'high';
    s.graphicsAuto = false;
    s.airframeAsked = true;
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
    localStorage.setItem('webfpv.lang', 'en');
  } catch (e) { /* Storage refused. */ }`];

const page = await openPage({
  root, width: 1600, height: 900, url: '/index.html?map=itaipu', seed,
});
async function shot(name) {
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 }, page.sessionId);
  await writeFile(join(outDir, `${name}.jpg`), Buffer.from(data, 'base64'));
}

try {
  await page.until('window.__map && window.__map().id === "itaipu" && window.__map().ready', 300000);
  await page.until('window.__shellReady === true', 60000);
  await page.evaluate('(document.getElementById("ui").style.display = "none", "")');

  console.log('the HUD');
  /* A live view of a story stage, as the room sends it, the room's clock
   * standing at 100 s. */
  await page.evaluate(`(async () => {
    const { createWarHud } = await import('/src/ui/warhud.js');
    const hud = createWarHud((seat) => 'pilot ' + seat);
    const now = 100000;
    const v = {
      state: 'live', id: 1, mission: 'itaipu-1', goAt: 10000, output: 12000, floor: 7700, down: [], wave: 2, waves: 6,
      rack: 3, rackMax: 4, round: 1, rounds: 1, roundState: 'live', roundAt: 90000, nextAt: now + 12400, alive: 2, airframes: 4, spent: {}, earned: {},
      scores: [{ seat: 1, kills: 2, assists: 0, mw: 0 }], fuze: {}, blast: 6,
      stage: {
        id: 'probe', n: 1, at: 90000, title: 'war.mission.itaipu_2', text: 'war.mission.itaipu_3', music: null, ready: [],
        objectives: [
          { id: 'a', text: 'war.mission.itaipu_1', kind: 'protect', state: 'active' },
          { id: 'b', text: 'war.mission.itaipu_2', kind: 'kill', state: 'done', progress: [3, 3] },
          { id: 'c', text: 'war.mission.itaipu_4', kind: 'hold', state: 'active', ms: 20000, heldFrom: now - 5000, heldMs: 5000 },
          { id: 'd', text: 'war.mission.itaipu_3', kind: 'protect', state: 'failed' },
        ],
      },
    };
    window.__stageHud = { hud, v, now };
    hud.drawn(true);
    hud.update(v, 1, now, 14000, null);
    hud.events([{ type: 'stage', id: 'probe', n: 1, at: 90000, title: 'war.mission.itaipu_2' }]);
    return true;
  })()`);
  await page.sleep(400);
  const a = await page.evaluate('({ shown: window.__stageHud.hud.shown(), lower: document.querySelector(".war-stage-title") && document.querySelector(".war-stage-title").textContent, lowerOp: document.querySelector(".war-stage-title") && getComputedStyle(document.querySelector(".war-stage-title")).opacity })');
  await shot('hud');
  row('the stage\'s line over its objectives, each marked by its state', a.shown.objectives.length === 5 && /intakes/i.test(a.shown.objectives[1])
    && a.shown.objectives[2].includes('3/3') && /^✗/.test(a.shown.objectives[4]), JSON.stringify(a.shown.objectives));
  row('a hold counts its seconds and draws its bar', /5\/20 s/.test(a.shown.objectives[3]) && Boolean(await page.evaluate('document.querySelector(".war-objectives [data-state=active] div div")')),
    a.shown.objectives[3]);
  row('the next wave from the room\'s drawn time', a.shown.status === 'NEXT WAVE IN 0:13', a.shown.status);
  row('the stage title as a lower third', Boolean(a.lower) && Number(a.lowerOp) > 0.5, `${a.lower} at ${a.lowerOp}`);
  await page.evaluate('(window.__stageHud.hud.update(window.__stageHud.v, 1, window.__stageHud.now + 3000, 14000, null), true)');
  const held = await page.evaluate('window.__stageHud.hud.shown().objectives[3]');
  row('the hold counts on the page\'s clock between the room\'s views', /8\/20 s/.test(held), held);
  await page.sleep(3200);
  const gone = await page.evaluate('getComputedStyle(document.querySelector(".war-stage-title")).opacity');
  row('and the lower third goes after its 3 s', Number(gone) < 0.05, gone);
  await page.evaluate('(window.__stageHud.hud.update(null), true)');

  console.log('the cutaway');
  /* The shell's own cutaway (main.js), handed a cue as the room sends one,
   * with whether this pilot is in control said for it
   * (window.__warCutawayTest). */
  const ahead = [59, 230, -1672];
  await page.evaluate(`window.__setCam(-1500, 600, 1500, 0, 200, -1000, 50)`);
  await page.sleep(500);
  await page.evaluate('window.__setCam(null)');
  await page.evaluate(`window.__warCutawayTest({ at: ${JSON.stringify(ahead)}, ms: 2500 }, true)`);
  await page.sleep(700);
  const pip = await page.evaluate('({ s: window.__warCutaway(), frame: getComputedStyle(document.querySelector(".war-cutaway")).display, bars: getComputedStyle(document.querySelector(".war-cutaway-bars")).display })');
  await shot('cutaway-pip');
  row('a pilot in control: a picture in picture, framed, and no letterbox', pip.s.shot && pip.s.shot.pip && pip.frame === 'block' && pip.bars === 'none', JSON.stringify(pip));
  await page.sleep(2300);
  const pipGone = await page.evaluate('({ s: window.__warCutaway(), frame: getComputedStyle(document.querySelector(".war-cutaway")).display })');
  row('and gone after its ms', !pipGone.s.shot && pipGone.frame === 'none', JSON.stringify(pipGone));
  const before = await page.evaluate('window.__camGround()');
  await page.evaluate(`window.__warCutawayTest({ at: ${JSON.stringify(ahead)}, ms: 2500 }, false)`);
  await page.sleep(700);
  const cut = await page.evaluate('({ s: window.__warCutaway(), cam: window.__camGround(), bars: getComputedStyle(document.querySelector(".war-cutaway-bars")).display })');
  await shot('cutaway-cut');
  const far = (c) => Math.hypot(c.x - ahead[0], c.z - ahead[2]);
  row('a pilot not in control: the cut, the camera at the place, the letterbox up', cut.s.shot && !cut.s.shot.pip && cut.bars === 'block' && far(cut.cam) < 300,
    `${far(cut.cam).toFixed(0)} m from the place; before ${far(before).toFixed(0)}`);
  await page.sleep(2300);
  const back = await page.evaluate('({ s: window.__warCutaway(), cam: window.__camGround(), bars: getComputedStyle(document.querySelector(".war-cutaway-bars")).display })');
  /* The title's flythrough moves on its own meanwhile, so given back is
   * back to its own path, far from the place again. */
  row('and the camera given back after it', !back.s.shot && back.bars === 'none' && far(back.cam) > 600,
    `${far(back.cam).toFixed(0)} m from the place`);
  row('no console errors', page.errors.length === 0, page.errors.slice(0, 5).join(' | ') || 'none');
} finally {
  await page.close();
}

console.log(`\nframes -> ${outDir}`);
if (failures.length) {
  console.error(`FAIL, ${failures.length} of the checks above`);
  process.exitCode = 1;
} else {
  console.log('PASS');
}
