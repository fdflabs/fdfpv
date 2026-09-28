/*
 * friendscard.js: the picture on the title's Fly with friends card, drawn
 * by the game.
 *
 * The other two cards are single frames of the renderer (scripts/
 * gatecards.js). This one cannot be: what it shows is other people, and
 * the only thing that draws another pilot's aircraft and the pilot
 * standing behind it is a room (src/main.js, #128). So it is four
 * headless pages of the real shell in one room on the Swiss valley's
 * strip, the way scripts/rooms-two-page.js checks it, and the frame is
 * the fourth page's: seat 1's P-51 and seat 3's Cub side by side, and
 * three pilots on the flight line behind them. The camera is a page of
 * its own because a page never draws its own aircraft under a parked
 * camera in flight, and it has to be in the room to draw the others.
 *
 * REGENERATE, DO NOT EDIT, against a running rooms Worker:
 *
 *   npx wrangler dev --config edge/rooms/wrangler.toml --port 8797
 *   SIM_GPU=1 npm run gen:friendscard -- http://127.0.0.1:8797
 *
 * SIM_GPU=1 for the same reason as the Free Flight card: the CPU
 * rasteriser does not draw the photoreal look. Same size and quality as
 * gatecards.js, so the three cards are one set.
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
const out = join(root, 'assets', 'gate', 'friends.jpg');

/* gatecards.js's size and quality. */
const W = 900;
const H = 560;
const QUALITY = 82;

/* Seats 1 and 3 are the two in the picture, seat 2 is out of it on the
 * other side of seat 1, and seat 4 is the camera. */
const SEATS = ['p51d1450', 'edge1524', 'cub1400', 'sky1800'];

function seedFor(id) {
  const s = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, id);
  s.map = 'swiss2';
  s.freestyleMap = 'swiss2';
  s.graphics = 'high';
  s.flightMode = 'angle';
  s.fpsCap = 0;
  s.airframeAsked = true;
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    if (!s.friendsCardSeeded) {
      Object.assign(s, ${JSON.stringify(s)}, { friendsCardSeeded: true });
      localStorage.setItem(k, JSON.stringify(s));
    }
  } catch (e) { /* storage refused */ }`];
}

/*
 * The camera and the point it looks at, in the spawn's own frame: metres
 * right, forward and up from seat 1's slot, then the vertical fov. Seat 3's
 * slot is 8 m to its left and the pilots of seats 1 to 3 stand on the
 * flight line 12 m back, 10.5, 7.5 and 4.5 m to its left
 * (src/game/slots.js). So this is in front of the row, a little nearer
 * the P-51, at a standing pilot's knee, looking down the strip between the
 * two aircraft to the three pilots. Chosen from eighteen framings by eye;
 * a wider pair of aircraft cannot both be large, they are 8 m apart.
 */
const FRAME = { cam: [-2.5, 5.5, 1.0], at: [-5, -6, 0.9], fov: 56 };

/* Park the camera on `frame` and take the picture. The spawn's axes are
 * read off the slots rather than its yaw, so this uses the same geometry
 * the room places everybody with. */
async function shoot(page, frame) {
  const pose = await page.evaluate(`(() => {
    const s = window.__roomSlots();
    const o = s.slots[0];
    const r = [(o.x - s.slots[2].x) / 8, (o.z - s.slots[2].z) / 8];
    const st = s.stations[0];
    const f = [-(st.x - o.x + r[0] * 10.5) / 12, -(st.z - o.z + r[1] * 10.5) / 12];
    const at = ([right, fwd, up]) => [o.x + r[0] * right + f[0] * fwd, o.y + up, o.z + r[1] * right + f[1] * fwd];
    return [...at(${JSON.stringify(frame.cam)}), ...at(${JSON.stringify(frame.at)})];
  })()`);
  await page.evaluate(`(window.__setCam(${[...pose, frame.fov].join(',')}), window.__friendsFrame = window.__boot().frames, true)`);
  /* Frames, not milliseconds, as in gatecards.js. */
  await page.until('window.__boot().frames > window.__friendsFrame + 8', 30000);
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: QUALITY }, page.sessionId);
  return Buffer.from(data, 'base64');
}

/* Everything the shell draws over the world, whatever screen it is: every
 * element that is not the canvas and does not hold it. */
const HIDE_OVERLAY = `(() => {
  for (const n of document.body.querySelectorAll('*')) {
    if (n.tagName !== 'CANVAS' && !n.querySelector('canvas')) {
      n.style.visibility = 'hidden';
    }
  }
  return true;
})()`;

const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;
const pages = [];
try {
  for (const id of SEATS) {
    pages.push(await openPage({ root, url, width: W, height: H, seed: seedFor(id) }));
  }
  for (const p of pages) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__map && window.__map().ready', 400000);
  }
  const [a, ...rest] = pages;
  const cam = pages[pages.length - 1];
  const code = await a.evaluate('window.__roomCreate()');
  await a.until("window.__rooms().phase === 'open'", 30000);
  /* One at a time, so the seats are 2, 3 and 4 in SEATS order. */
  for (const [i, p] of rest.entries()) {
    await p.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
    await p.until(`window.__rooms().phase === 'open' && window.__rooms().seat === ${i + 2}`, 30000);
  }
  for (const p of pages) {
    await p.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  }
  for (const p of pages) {
    await p.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  }
  await cam.until(`window.__rooms().peers.length === ${SEATS.length - 1}`
    + ' && window.__rooms().peers.every((q) => q.drawn && q.figure)', 60000);
  await cam.evaluate(HIDE_OVERLAY);
  const data = await shoot(cam, FRAME);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, data);
  console.log(`friends.jpg -> ${out}`);
  const errs = pages.flatMap((p) => p.errors).filter((e) => !e.startsWith('network:'));
  if (errs.length) {
    throw new Error(`page errors: ${errs.slice(0, 3).join(' | ')}`);
  }
} finally {
  for (const p of pages) {
    await p.close();
  }
}
