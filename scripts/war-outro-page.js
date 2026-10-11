/*
 * war-outro-page.js: First Light's outro (src/share/war/films/
 * first-light-outro.js) on the real shell, as a win starts it: one pilot
 * live in First Light against a local rooms server (never the VM), the
 * room's war messages then dropped in the page and the room's won view
 * handed to it as the room would send it (winning for real is a ten minute fight). npm run
 * war:outropage [-- outdir]. What must hold: the outro starts on the win,
 * on the room's clock from the end; the war HUD and its end card step
 * aside while it plays; every shot is reached, a picture of each written;
 * its first line is the win debrief and the radio does not also say it;
 * the HUD comes back with the end banner after; no page error. That a
 * loss plays none is warradio's and the frame's `v.state === 'won'`.
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

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { openPage } from '../tests/lib/page.js';
import { startRooms } from '../edge/rooms/node.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) || join(tmpdir(), 'war-outro'));
await mkdir(outDir, { recursive: true });

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
}

const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, '7inch');
Object.assign(s, {
  map: 'itaipu', freestyleMap: 'itaipu', graphics: 'low', flightMode: 'angle', fpsCap: 0, airframeAsked: true, warConsent: true,
});
const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, ${JSON.stringify(s)});
  localStorage.setItem(k, JSON.stringify(s));
} catch (e) { /* storage refused */ }`,
/* The room's war messages dropped once window.__muteWar is set: the link
 * stays up (the shell plays a war only on one), but what the page shows
 * of the war is only the view handed to it. */
`(() => {
  const W = window.WebSocket;
  window.WebSocket = class extends W {
    set onmessage(f) {
      super.onmessage = (ev) => {
        if (window.__muteWar && typeof ev.data === 'string' && ev.data.includes('"type":"war"')) {
          return;
        }
        f(ev);
      };
    }

    get onmessage() {
      return super.onmessage;
    }
  };
})()`];

const dir = await mkdtemp(join(tmpdir(), 'war-outro-'));
/* devMissions: First Light is held in development (src/game/campaign.js). */
const server = await startRooms({ db: join(dir, 'rooms.db'), port: 0, devMissions: true });
const rooms = `http://127.0.0.1:${server.port}`;
const page = await openPage({ root, url: `/index.html?rooms=${encodeURIComponent(rooms)}`, width: 1280, height: 720, seed });
const intro = () => page.evaluate('JSON.stringify(window.__warIntro())').then(JSON.parse);
const hud = () => page.evaluate('JSON.stringify(window.__war().hud)').then(JSON.parse);
const shot = async (name) => {
  const r = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(outDir, `${name}.png`), Buffer.from(r.data, 'base64'));
};
/* The room's last view, its state turned to `to` at its room ms now. */
const end = (to) => page.evaluate(`(() => {
  const v = window.__war().view;
  const t = window.__rooms().roomNow;
  window.__warHear({ type: 'war', war: { ...v, state: ${JSON.stringify(to)}, endAt: t, why: 'waves' } });
  return t;
})()`);

try {
  await page.until('window.__shellReady === true', 300000);
  await page.until('window.__map && window.__map().ready', 600000);
  await page.evaluate("window.__roomCreate({ map: 'itaipu' })");
  await page.until("window.__rooms().phase === 'open' && window.__rooms().roomNow != null", 30000);
  await page.evaluate("window.__ui.act('friends'); true");
  await page.sleep(500);
  await page.evaluate("window.__warDo('start', 'itaipu-1')");
  await page.until("window.__war().view.state === 'live'", 240000);
  /* The room's war goes quiet: what the page shows next is only the view
   * handed to it. */
  await page.evaluate('window.__muteWar = true');
  await page.sleep(1500);
  await end('won');
  await page.until("window.__warIntro() && String(window.__warIntro().for).startsWith('outro:')", 20000).catch(() => {});
  const first = await intro();
  if (!first) {
    console.log(`  view after the win: ${await page.evaluate("JSON.stringify((({ state, mission, endAt, id }) => ({ state, mission, endAt, id }))(window.__war().view))")}, mode ${await page.evaluate('window.__craftState().mode')}, room ${await page.evaluate('JSON.stringify({ phase: window.__rooms().phase })')}`);
  }
  check('the win starts the outro', Boolean(first) && first.film === 'first-light-outro', JSON.stringify(first && { for: first.for, film: first.film }));
  check('on the room\'s clock from the end', Boolean(first) && first.t < 3000, String(first && first.t));
  const shots = first ? first.shots.map((s) => s.id) : [];
  const seen = new Set();
  let hudUp = false;
  let said = false;
  while (first && !(await page.evaluate('!window.__warIntro()'))) {
    const s = await intro();
    if (!s) {
      break;
    }
    const id = shots[s.shot];
    if (id && !seen.has(id) && s.t > (first.shots[s.shot].start + first.shots[s.shot].ms / 2)) {
      seen.add(id);
      await shot(`outro-${id}`);
    }
    /* Read with the film in the same breath: at its end the HUD comes
     * back, and a read just after must not count against it. */
    const both = JSON.parse(await page.evaluate('JSON.stringify({ on: Boolean(window.__warIntro()), h: window.__war().hud })'));
    const h = both.h;
    hudUp = hudUp || (both.on && (h.banner !== '' || h.objectives.length > 0));
    said = said || /dam's still ours/.test(h.subtitle);
    await page.sleep(250);
  }
  check('every shot is reached', shots.length > 0 && shots.every((id) => seen.has(id)), `${[...seen].join(' ')} of ${shots.join(' ')}`);
  check('its first line is the win debrief', first && first.lines[0]?.line === 'debrief-itaipu-1-win', JSON.stringify(first && first.lines[0]));
  check('the war HUD and its end banner step aside while it plays', !hudUp);
  check('the radio does not say the debrief over the film', !said);
  await page.sleep(1500);
  const after = await hud();
  check('the HUD comes back with the end banner after', after.banner !== '', after.banner);
  const err1 = page.errors.filter((e) => !e.startsWith('network:'));
  check('no page error', err1.length === 0, err1.slice(0, 3).join(' | '));
  console.log(`  pictures: ${outDir}`);
} finally {
  await page.close();
  await server.stop();
  await rm(dir, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
