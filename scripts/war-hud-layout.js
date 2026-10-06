/*
 * war-hud-layout.js: the war HUD (src/ui/warhud.js) against the rest of
 * the flight screen, on the real shell in a live war, at 1280x720 and at
 * 1920x1080:
 *
 *   SIM_GPU=1 npm run war:hudlayout [-- outdir]
 *
 * One page at a time, a private room on Itaipu with this pilot alone in
 * it (the room's own "alone" notice, where the shell shows it in a war),
 * and two more pilots named
 * as here but not flying: src/ui/peermarks.js is given their lines through
 * its own away() each frame, since a page that is here and not flying is
 * all such a line needs, and a third browser for it is not worth the
 * memory. What must hold, on the boxes the page itself drew:
 *
 *   - the war HUD's box meets none of the room's lines (the notice and
 *     each away line, as peermarks drew them this frame)
 *   - nor the markers' radar (src/ui/warmarkers.js, top right)
 *   - nor the band the left edge arrows and their words are drawn in
 *   - nor the FPV OSD's left horizon sidebar, measured off these frames
 *     at 0.37 of the height left of the middle (src/ui/fpvhud.js keeps its
 *     PAL grid to the height), when the OSD is up
 *   - nor the flight screen's own readouts (.osd-corner, .osd-sticks)
 *   - it is all on screen
 *
 * Pictures go in outdir (build/war-hud-layout by default); look at them.
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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = process.argv.slice(2).find((a) => !a.startsWith('--')) || join(root, 'build', 'war-hud-layout');
const SIZES = [[1280, 720], [1920, 1080]];
/* Both of the flight screen's styles: the FPV OSD and the game's HUD. */
const STYLES = ['osd', 'game'];

/* The markers' geometry, read from warmarkers.js so this check follows it:
 * the radar's radius and top, and the edge arrows' inset. */
const markersSrc = readFileSync(join(root, 'src/ui/warmarkers.js'), 'utf8');
const constOf = (name) => {
  const m = new RegExp(`const ${name} = (\\d+);`).exec(markersSrc);
  if (!m) {
    throw new Error(`warmarkers.js has no ${name}`);
  }
  return Number(m[1]);
};
const RADAR_PX = constOf('RADAR_PX');
const RADAR_TOP_PX = constOf('RADAR_TOP_PX');
const EDGE_PX = constOf('EDGE_PX');
/* warmarkers.js arrow(): the tip 20 px out (23 when pulsing big), the
 * words centred 34 px in, 12 px type; the widest word a mission can put
 * there, "SEA DRONE", is about 80 px, so 45 either side with the halo. */
const ARROW_BAND = EDGE_PX + 34 + 45;

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

const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const box = (r) => `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}x${Math.round(r.h)}`;

function seed(hudStyle) {
  const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, '7inch');
  s.map = 'itaipu';
  s.freestyleMap = 'itaipu';
  s.graphics = 'low';
  s.flightMode = 'angle';
  s.fpsCap = 0;
  s.airframeAsked = true;
  s.crashDamage = true;
  s.warConsent = true;
  s.parts = {};
  s.hudStyle = hudStyle;
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    if (!s.roomsSeeded) {
      Object.assign(s, ${JSON.stringify(s)}, { roomsSeeded: true });
      localStorage.setItem(k, JSON.stringify(s));
    }
    localStorage.setItem('webfpv.airhint.v2', '1');
  } catch (e) { /* storage refused */ }`];
}

/* In the page: two pilots here but not flying, through peermarks' own
 * away(), and what drawAway drew, row by row, kept for the check. */
const AWAY = `(async () => {
  const { PeerMarks } = await import('/src/ui/peermarks.js');
  const { str } = await import('/src/strings/index.js');
  const begin = PeerMarks.prototype.begin;
  PeerMarks.prototype.begin = function (...args) {
    begin.apply(this, args);
    this.away(2, str('rooms.away_idle', { name: 'Tough Robin 79' }));
    this.away(3, str('rooms.away_menu', { name: 'Brave Turtle 17' }));
  };
  const drawAway = PeerMarks.prototype.drawAway;
  PeerMarks.prototype.drawAway = function (g, s) {
    drawAway.call(this, g, s);
    const line = (this.osd ? this.osdPx * 1.25 : 13) + 4;
    window.__awayRows = this.marks.filter((m) => m.awayUsed).map((m, i) => ({
      text: m.awayText, x: m.awayX, y: m.awayY, w: (i > 0 ? 12 : 0) + m.awayW, h: line,
    }));
  };
  return true;
})()`;

async function one(width, height, style, rooms) {
  console.log(`${width}x${height}, ${style}`);
  const page = await openPage({ root, url: `/index.html?rooms=${encodeURIComponent(rooms)}`, width, height, seed: seed(style) });
  try {
    await page.until('window.__shellReady === true', 300000);
    await page.until('window.__map && window.__map().ready && window.__crashCam', 600000);
    await page.evaluate(AWAY);
    const code = await page.evaluate("window.__roomCreate({ map: 'itaipu' })");
    await page.until("window.__rooms().phase === 'open' && window.__rooms().roomNow != null", 30000);
    await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
    await page.evaluate("window.__warDo('start', 'itaipu-1')");
    await page.until("window.__war().view.state === 'live' && window.__war().hud.output !== ''", 30000);
    /* The first waves on screen and the callouts settled. */
    await page.until("window.__war().view.alive > 0 && window.__war().markers.on", 60000);
    await page.sleep(1500);
    const got = JSON.parse(await page.evaluate(`JSON.stringify({
      hud: (() => { const r = document.querySelector('.war-hud').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })(),
      rows: window.__awayRows || [],
      note: window.__peerMarks().note,
      readouts: [...document.querySelectorAll('.osd-corner, .osd-sticks')].map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0).map((r) => ({ x: r.left, y: r.top, w: r.width, h: r.height })),
      markers: { w: window.__war().markers.w, arrows: window.__war().markers.arrows.map((a) => [Math.round(a.x), Math.round(a.y)]) },
      osd: document.getElementById('ui').classList.contains('fpv-osd-on'),
      vw: innerWidth, vh: innerHeight,
    })`));
    console.log(`  info  room ${code}; HUD ${box(got.hud)}; ${got.rows.length} room lines; ${got.markers.arrows.length} edge arrows ${JSON.stringify(got.markers.arrows)}`);
    const radar = { x: got.vw - RADAR_PX * 2 - 18, y: RADAR_TOP_PX - 20, w: RADAR_PX * 2, h: RADAR_PX * 2 + 20 };
    const band = { x: 0, y: 0, w: ARROW_BAND, h: got.vh };
    /* The room's own notice is the shell's to show or hide in a game
     * (#233 hides it while one is on); the pilots' lines are always up. */
    check('the two not flying lines are drawn', got.rows.filter((r) => r.text !== got.note).length === 2,
      `notice ${got.note ? 'up' : 'hidden'}; ${got.rows.map((r) => `${r.text} @ ${box(r)}`).join(' | ')}`);
    const hit = got.rows.filter((r) => meets(r, got.hud));
    check('the war HUD meets none of the room\'s lines', hit.length === 0, hit.map((r) => `${r.text} @ ${box(r)}`).join(' | ') || `lowest line ends at y ${Math.round(Math.max(...got.rows.map((r) => r.y + r.h)))}, HUD top ${Math.round(got.hud.y)}`);
    check('nor the markers\' radar', !meets(radar, got.hud), `radar ${box(radar)}`);
    const sidebar = { x: got.vw / 2 - 0.37 * got.vh - 8, y: 0, w: 16, h: got.vh };
    check('nor the FPV OSD\'s left sidebar', !got.osd || !meets(sidebar, got.hud), `${got.osd ? 'OSD up' : 'no OSD'}, sidebar at x ${Math.round(sidebar.x)}, HUD to x ${Math.round(got.hud.x + got.hud.w)}`);
    check('nor the left edge arrows\' band', !meets(band, got.hud), `band x < ${ARROW_BAND}, HUD from x ${Math.round(got.hud.x)}`);
    const over = got.readouts.filter((r) => meets(r, got.hud));
    check('nor the flight screen\'s readouts', over.length === 0, over.map(box).join(' | '));
    check('and it is all on screen', got.hud.x >= 0 && got.hud.y >= 0 && got.hud.x + got.hud.w <= got.vw && got.hud.y + got.hud.h <= got.vh, box(got.hud));
    await mkdir(outDir, { recursive: true });
    const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
    const path = join(outDir, `war-hud-${width}x${height}-${style}.png`);
    await writeFile(path, Buffer.from(data, 'base64'));
    console.log(`  shot ${path}`);
    const errs = page.errors.filter((e) => !e.startsWith('network:'));
    check('no page error', errs.length === 0, errs.slice(0, 3).join(' | '));
  } finally {
    await page.close();
  }
}

const scratch = mkdtempSync(join(tmpdir(), 'fdfpv-warhud-'));
const { startRooms } = await import('../edge/rooms/node.js');
const server = await startRooms({ db: join(scratch, 'rooms.db'), port: 0 });
try {
  for (const [w, h] of SIZES) {
    for (const style of STYLES) {
      await one(w, h, style, `http://127.0.0.1:${server.port}`);
    }
  }
} catch (e) {
  failed += 1;
  console.log(`  FAIL  ${e.stack || e}`);
} finally {
  await server.stop();
  rmSync(scratch, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
