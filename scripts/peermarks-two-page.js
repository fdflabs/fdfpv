/*
 * peermarks-two-page.js: two headless pages of the real shell in one room
 * on the Swiss valley, and what A's peer marks say about B in the four
 * cases the marks exist for, in the chase view and in the FPV view with
 * the FPV OSD. By hand, against a running rooms Worker:
 *
 *   npx wrangler dev --config edge/rooms/wrangler.toml --port 8797
 *   SIM_GPU=1 node scripts/peermarks-two-page.js http://127.0.0.1:8797 [outdir] [width] [height] [touch]
 *
 * A flies a Cub and stays parked on the spawn, so its camera holds still;
 * B flies a P-51 and is put, and held, at each place in turn, worked out
 * from A's camera as the marks see it:
 *
 *   (a) close and clear: near enough ahead to stand 70 px tall on this
 *       screen, a little right. No mark, the name tag.
 *   (b) far and small: 400 m ahead, 25 m up. A full caret with name and range.
 *   (c) behind a hill: the nearest point in frame that the terrain hides
 *       from A's camera. A hollow caret, full strength.
 *   (d) behind the camera: 60 m behind, 8 m up. An arrow on the frame
 *       edge, off the centre and off every readout.
 *
 * Pictures of each in outdir, which is not in the repository: a picture is
 * evidence for one round.
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
import { MARK } from '../src/ui/peermarks.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const rooms = process.argv[2] || 'http://127.0.0.1:8797';
const outDir = process.argv[3] || join(root, 'build', 'peermarks-two-page');
const W = Number(process.argv[4]) || 1280;
const H = Number(process.argv[5]) || 720;
/* 'touch' lays the page out for thumbs, as a phone does. */
const TOUCH = process.argv[6] === 'touch';

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

function seedFor(id, colour) {
  const s = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, id);
  s.map = 'swiss2';
  s.freestyleMap = 'swiss2';
  s.flightMode = 'angle';
  s.fpsCap = 0;
  s.airframeAsked = true;
  s.livery = { [id]: { regions: { wing: colour, fuselage: colour, tail: colour } } };
  s.parts = {};
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    if (!s.marksSeeded) {
      Object.assign(s, ${JSON.stringify(s)}, { marksSeeded: true });
      localStorage.setItem(k, JSON.stringify(s));
    }
  } catch (e) { /* storage refused */ }`];
}

async function shot(page, name) {
  await mkdir(outDir, { recursive: true });
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  const path = join(outDir, `${name}.png`);
  await writeFile(path, Buffer.from(data, 'base64'));
  console.log(`  shot ${path}`);
}

/* Hold B at a world point: placed again every 150 ms, since a plane at
 * rest in the air falls, until stop() is called. */
function holdB(b, p) {
  let on = true;
  const loop = (async () => {
    while (on) {
      await b.evaluate(`window.__placeCraft(${p[0]}, ${p[1]}, ${p[2]}); true`);
      await b.sleep(150);
    }
  })();
  return async () => {
    on = false;
    await loop;
  };
}

/* A's camera as the marks see it. */
async function camOf(a) {
  return (await a.evaluate('window.__peerMarks()')).cam;
}

/* A point a metres along the camera's level forward, r to its right, u up. */
function ahead(cam, a, r, u) {
  const fl = Math.hypot(cam.fx, cam.fz) || 1;
  const fx = cam.fx / fl;
  const fz = cam.fz / fl;
  return [cam.px + fx * a - fz * r, cam.py + u, cam.pz + fz * a + fx * r];
}

/* The nearest place in A's frame the terrain hides from its camera, found
 * in the page against its own ground: 4 m over the ground, in the middle
 * two thirds of the frame, behind a rise of the ground itself rather
 * than a roof. */
async function hiddenSpot(a) {
  return a.evaluate(`(() => {
    const cam = window.__peerMarks().cam;
    const h = window.__heightAt;
    const fl = Math.hypot(cam.fx, cam.fz) || 1;
    const fx = cam.fx / fl;
    const fz = cam.fz / fl;
    const half = Math.atan(cam.tanHalf * cam.aspect) * 0.66;
    let best = null;
    for (let d = 60; d <= 1500 && !best; d += 20) {
      for (let k = 0; k <= 20 && !best; k += 1) {
        /* Left of centre only: on the Swiss valley's strip the hangar
         * stands to the right, and its flat roof would pass for a hill. */
        const yaw = -(k / 20) * half;
        const c = Math.cos(yaw);
        const s = Math.sin(yaw);
        const dx = fx * c - fz * s;
        const dz = fz * c + fx * s;
        const x = cam.px + dx * d;
        const z = cam.pz + dz * d;
        const y = h(x, z) + 4;
        let hid = false;
        for (let i = 1; i < 40; i += 1) {
          const t = i / 40 * (1 - 5 / d);
          const lx = cam.px + (x - cam.px) * t;
          const lz = cam.pz + (z - cam.pz) * t;
          const g = h(lx, lz);
          /* A roof steps up metres in a metre or two; a hill does not.
           * The case is a hill, so a building in the way is passed over. */
          const step = Math.max(Math.abs(h(lx + 2, lz) - g), Math.abs(h(lx - 2, lz) - g), Math.abs(h(lx, lz + 2) - g), Math.abs(h(lx, lz - 2) - g));
          if (g > cam.py + (y - cam.py) * t + 3 && step < 1.5) {
            hid = true;
            break;
          }
        }
        if (hid) {
          best = [x, y, z];
        }
      }
    }
    return best;
  })()`);
}

async function markOf(a) {
  const s = await a.evaluate('window.__peerMarks()');
  return { s, m: s.marks[0] || null };
}

/*
 * What is on A's screen that an arrow must not cover, read from the page
 * independently of what the marks were given: every visible element of
 * the flight HUD, and with the FPV OSD up each of its placed readouts.
 */
async function readouts(a) {
  return a.evaluate(`(() => {
    const out = [];
    const o = document.getElementById('view').getBoundingClientRect();
    for (const el of document.querySelectorAll('.osd-top, .osd-corner, .osd-sticks, .osd-air, .osd-gimbal, .bug-chip, .music-dock')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') {
        out.push([r.left - o.left, r.top - o.top, r.width, r.height, el.className]);
      }
    }
    const osd = window.__fpvOsd && window.__fpvOsd();
    if (osd && osd.on) {
      for (const r of osd.layout.readouts) {
        out.push([r.x, r.y, r.w, r.h, 'osd ' + r.id]);
      }
    }
    return out;
  })()`);
}

/* The arrow and its label against the centre zone and those readouts. */
function arrowClear(s, m, rects) {
  const cx = s.screen.w / 2;
  const cy = s.screen.h / 2;
  const [x0, y0, x1, y1] = m.box;
  const nx = Math.max(x0, Math.min(cx, x1));
  const ny = Math.max(y0, Math.min(cy, y1));
  const off = Math.hypot(nx - cx, ny - cy) >= MARK.CENTRE * Math.min(s.screen.w, s.screen.h);
  const on = rects.filter((r) => r[0] < x1 && x0 < r[0] + r[2] && r[1] < y1 && y0 < r[1] + r[3]).map((r) => r[4]);
  return { off, on };
}

const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;
console.log(`peer marks, two pages in one room at ${W}x${H}${TOUCH ? ' touch' : ''}, rooms at ${rooms}`);
const a = await openPage({ root, url, width: W, height: H, touch: TOUCH, seed: seedFor('cub1400', '#d8432f') });
const b = await openPage({ root, url, width: W, height: H, seed: seedFor('p51d1450', '#2f6fd6') });
try {
  for (const p of [a, b]) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__map && window.__map().ready', 400000);
  }
  const code = await a.evaluate('window.__roomCreate()');
  check('A makes a room', /^[A-Z0-9]{6}$/.test(code), code);
  await a.until("window.__rooms().phase === 'open'", 30000);
  await b.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  for (const p of [a, b]) {
    await p.until("window.__rooms().phase === 'open' && window.__rooms().peers.length === 1 && window.__rooms().roomNow != null", 30000);
  }
  for (const p of [a, b]) {
    await p.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  }
  for (const p of [a, b]) {
    await p.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  }
  await a.until('window.__rooms().peers[0].drawn', 30000);
  /* The pad shot, over before any picture. */
  await a.until('(() => { const i = window.__intro(); return !i.orbiting && !i.approaching && !i.zooming; })()', 60000);
  const first = await a.evaluate('window.__peerMarks()');
  check('marks are live in flight, default On', first.live && first.style === 'on', `${first.live} ${first.style}`);

  for (const view of ['chase', 'fpv']) {
    await a.evaluate(`window.__ui.settings.wingView = ${JSON.stringify(view)}; window.__ui.settings.hudStyle = 'osd'; true`);
    await a.sleep(1500);
    const cam = await camOf(a);
    const osd = (await a.evaluate('window.__peerMarks()')).osd;
    check(`${view}: the FPV OSD type ${view === 'fpv' ? 'is' : 'is not'} used`, osd === (view === 'fpv'));

    /* Close enough to be CLEAR on this screen and lens: the P-51 at
     * 70 px, twice the clear size over sky, measured by standing it 15 m
     * out first. A phone's short screen needs it nearer than a desktop. */
    const probe = holdB(b, ahead(cam, 15, 0, 1));
    await a.sleep(1500);
    const seen = (await markOf(a)).m;
    await probe();
    const near = seen && seen.sizePx > 0 ? Math.max(5, Math.min(15, (15 * seen.sizePx) / 70)) : 15;
    const cases = [
      ['a-close', ahead(cam, near, near * 0.25, 1)],
      ['b-far', ahead(cam, 400, 20, 25)],
      ['c-hill', await hiddenSpot(a)],
      ['d-behind', ahead(cam, -60, -6, 8)],
    ];
    for (const [name, at] of cases) {
      if (!at) {
        check(`${view} ${name}: a place for B`, false, 'none found');
        continue;
      }
      const stop = holdB(b, at);
      await a.until(`(() => { const p = window.__rooms().peers[0]; return p.drawn && Math.hypot(p.at[0] - ${at[0]}, p.at[2] - ${at[2]}) < 5; })()`, 15000).catch(() => {});
      await a.sleep(1200);
      const { s, m } = await markOf(a);
      const rects = await readouts(a);
      await shot(a, `${view}-${name}`);
      await stop();
      if (!m) {
        check(`${view} ${name}: B has a mark record`, false);
        continue;
      }
      const detail = `${m.kind} ${m.side} alpha ${m.alpha.toFixed(2)}, ${m.sizePx.toFixed(1)} px, ${m.dist.toFixed(0)} m${m.hidden ? ', hidden' : ''}${m.ground ? ', over ground' : ''}, "${m.label}" ${m.range}`;
      if (name === 'a-close') {
        check(`${view} (a) close and clear: in frame, no mark`, m.kind === 'over' && m.alpha < MARK.MIN_ALPHA, detail);
      } else if (name === 'b-far') {
        check(`${view} (b) 400 m away: in frame, full mark, a few pixels`, m.kind === 'over' && m.alpha > 0.95 && m.sizePx < 10, detail);
      } else if (name === 'c-hill') {
        check(`${view} (c) behind a hill: hidden, full mark`, m.kind === 'over' && m.hidden && m.alpha > 0.95, detail);
      } else {
        check(`${view} (d) behind the camera: an arrow at the edge`, m.kind === 'edge' && m.alpha > 0.95, detail);
        const c = m.box ? arrowClear(s, m, rects) : { off: false, on: ['no box'] };
        check(`${view} (d) arrow and label off the centre and off all ${rects.length} readouts`, c.off && c.on.length === 0, JSON.stringify(c));
      }
    }
  }

  /* The role hook a game mode uses: close and clear, and marked anyway. */
  await a.evaluate("window.__ui.settings.wingView = 'chase'; true");
  await a.sleep(800);
  const cam = await camOf(a);
  const seat = (await a.evaluate('window.__rooms()')).peers[0].seat;
  await a.evaluate(`window.__peerMarkRole(${seat}, 'ace'); true`);
  const stop = holdB(b, ahead(cam, 15, 3, 4));
  await a.sleep(1500);
  const { m: ace } = await markOf(a);
  await shot(a, 'chase-role-ace');
  await stop();
  check('a role marks B close and clear', ace && ace.role === 'ace' && ace.kind === 'over' && ace.alpha > 0.95, ace ? `${ace.kind} ${ace.alpha.toFixed(2)}` : '');
  await a.evaluate(`window.__peerMarkRole(${seat}, null); true`);

  /* Off is off. */
  await a.evaluate("window.__ui.settings.peerMarks = 'off'; true");
  const stopFar = holdB(b, ahead(cam, 400, 20, 25));
  await a.sleep(1200);
  const off = await a.evaluate('window.__peerMarks()');
  await stopFar();
  check('Off draws nothing', off.marks.length === 0 && off.stats.over === 0 && off.stats.edge === 0, JSON.stringify(off.stats));
  await a.evaluate("window.__ui.settings.peerMarks = 'on'; true");

  const errs = [...a.errors, ...b.errors].filter((e) => !e.startsWith('network:'));
  check('no page error on either page', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await a.close();
  await b.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
