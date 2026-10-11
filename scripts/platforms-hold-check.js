#!/usr/bin/env node
/*
 * platforms-hold-check.js: `SIM_GPU=1 npm run platforms:hold-ui -- <outdir>`,
 * platform holds in the real shell (docs/campaign/interior/CONTRACT-HOLDS.md,
 * src/main.js PLATFORM HOLDS). One headless page, a live ops view
 * injected in which seat 1 holds two roles, isr on the Bramor 2300 and
 * recon on the 7 inch:
 *   - the Bramor in the air, ] pressed (a real key event): the room is
 *     asked for recon; the room's answer seats the 7 inch where the
 *     Bramor was, no jump, and the Bramor goes on an orbit, drawn
 *   - five seconds on, the Bramor's hold is on its circle and its model
 *     where the hold has it
 *   - the HUD's strip lists both with their states and heights, inside
 *     the window and clear of the other panels at three sizes, and a tap
 *     on a row (a real pointer) asks the room for that aircraft
 *   - [ pressed: back to the Bramor at the point of its orbit, no jump,
 *     and the 7 inch hovers where it was left
 *   - the room is told of each hold (op hold, its pose); another seat's
 *     hold in the room's view is drawn where it says
 *   - the role board's FLY THIS (a real pointer) asks the room the same
 *   - no page errors
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

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outArg = process.argv[2];
if (!outArg) {
  throw new Error('platforms-hold-check: name a folder for the pictures, outside the repository');
}
const outDir = resolve(outArg);
if (outDir === root || outDir.startsWith(`${root}/`)) {
  throw new Error(`platforms-hold-check: ${outDir} is inside the repository; pictures go outside it`);
}
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

const seated = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'bramor2300');
Object.assign(seated, {
  map: 'swiss2', graphics: 'low', graphicsAuto: false, fpsCap: 0, airframeAsked: true, interiorConsent: true,
});
const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, ${JSON.stringify(seated)});
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
} catch (e) { /* storage refused */ }`];

const view = (active) => ({
  state: 'live',
  id: 9,
  mission: 'interior-1',
  campaign: 'interior',
  goAt: 0,
  briefAt: null,
  f: 0,
  endAt: null,
  why: null,
  stage: {
    id: 'M1_CP_CONTACT_FOUND', n: 3, at: 1000, title: 'ops.interior.m1.s4', text: null, music: null, lockRoles: false,
  },
  cards: [],
  contacts: [],
  sites: {},
  captures: [],
  flags: {},
  search: [],
  boundary: {},
  roles: {
    defs: [{
      id: 'isr', core: true, guide: 'IBARRA', platforms: ['bramor2300'],
    }, {
      id: 'recon', core: true, guide: 'IBARRA', platforms: ['7inch'],
    }],
    held: { 1: ['isr', 'recon'] },
    active: { 1: active },
    locked: false,
    beat: null,
    swaps: [],
  },
  dials: {
    conceal: 'west', mark: 's1', road: 'north', firstOut: 'n',
  },
  result: null,
  checkpoint: null,
  restarted: null,
});
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const swapJump = (s) => dist([s.before.x, s.before.y, s.before.z], [s.after.x, s.after.y, s.after.z]);

const page = await openPage({
  root, width: 1280, height: 720, url: '/index.html?rooms=off', seed,
});
async function shot(name) {
  const r = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(outDir, name), Buffer.from(r.data, 'base64'));
}
const inject = (active) => page.evaluate(`(window.__ops.inject({ type: 'ops', ops: ${JSON.stringify(view(active))} }), true)`);
const lastSent = () => page.evaluate('window.__ops.sent().slice(-1)[0] || null');

try {
  await page.until('!!window.__shellReady', 300000);
  await page.until('window.__map && window.__map().ready', 400000);
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight' && window.__map().ready", 400000);
  /* No room here: its clock stood in by the page's. */
  await page.evaluate('(window.__ops.useClock(() => performance.now()), true)');
  await page.evaluate(`(window.__ops.welcome({ seat: 1, code: 'HLD000', ops: ${JSON.stringify(view('isr'))} }), true)`);
  await page.sleep(1500);
  await page.until("window.__craftState().mode === 'flight'", 60000);
  check('the match begun on the isr role', (await page.evaluate('window.__ops.holds().flown')) === 'isr');

  /* The Bramor thrown level at 20 m/s, 150 m over where it stands. */
  const thrown = await page.evaluate(`(() => {
    const c = window.__craftState();
    return window.__crashThrow({ x: c.worldX, y: c.worldY + 150, z: c.worldZ, vx: 0, vy: 0, vz: -20, yaw: 0 });
  })()`);
  check('the Bramor in the air', thrown && thrown.ok !== false, JSON.stringify(thrown));
  await page.sleep(800);

  await page.tap('BracketRight');
  await page.sleep(200);
  const asked = await lastSent();
  check('] asks the room for the other role', asked && asked.op === 'active' && asked.key === 'recon', JSON.stringify(asked));
  await inject('recon');
  await page.until("window.__ops.flown() === '7inch'", 20000);
  const told = await page.evaluate("window.__ops.sent().filter((m) => m.op === 'hold').slice(-1)[0] || null");
  check('the room told of the Bramor left on its hold', told && told.key === 'isr' && Number.isInteger(told.t) && told.pose.airborne === true && told.pose.p.length === 3, JSON.stringify(told));
  const s1 = await page.evaluate('window.__lastSwap()');
  check('the 7 inch seated where the Bramor was, no jump', swapJump(s1) < 0.1 && s1.rule === 'air', `${swapJump(s1).toFixed(3)} m, ${s1.rule}`);
  let h = await page.evaluate('window.__ops.holds()');
  const bram = h.held.find((x) => x.key === 'isr');
  check('the Bramor on an orbit, drawn', h.flown === 'recon' && bram && bram.kind === 'orbit' && bram.shown, JSON.stringify(h));
  await shot('hold-orbit-start.png');

  await page.sleep(5000);
  h = await page.evaluate('window.__ops.holds()');
  const b2 = h.held.find((x) => x.key === 'isr');
  /* p is the scene frame (y up); the hold's centre is the ops frame. */
  const off = Math.abs(Math.hypot(b2.p[0] - b2.c[0], -b2.p[2] - b2.c[1]) - b2.r);
  const moved = dist(b2.p, bram.p);
  check('five seconds on: the Bramor on its circle, moved along it', off < 0.01 && moved > 50, `radius error ${off.toExponential(2)} m, moved ${moved.toFixed(1)} m`);
  check('its model where its hold has it', dist(b2.drawn, b2.p) < 2, `${dist(b2.drawn, b2.p).toFixed(2)} m`);
  await shot('hold-orbit-5s.png');

  await page.tap('BracketLeft');
  await page.sleep(200);
  const asked2 = await lastSent();
  check('[ asks the room for the Bramor back', asked2 && asked2.op === 'active' && asked2.key === 'isr', JSON.stringify(asked2));
  await inject('isr');
  await page.until("window.__ops.flown() === 'bramor2300'", 20000);
  const s2 = await page.evaluate('window.__lastSwap()');
  const onCircle = Math.abs(Math.hypot(s2.before.x - b2.c[0], -s2.before.z - b2.c[1]) - b2.r);
  check('the Bramor taken back at its orbit point, no jump', swapJump(s2) < 0.1 && onCircle < 0.5, `jump ${swapJump(s2).toFixed(3)} m, ${onCircle.toFixed(3)} m off its circle`);
  const h3 = await page.evaluate('window.__ops.holds()');
  const q = h3.held.find((x) => x.key === 'recon');
  await page.sleep(3000);
  const q2 = (await page.evaluate('window.__ops.holds()')).held.find((x) => x.key === 'recon');
  check('the 7 inch hovers where it was left', q && q.kind === 'hover' && dist(q.p, [s2.before.x, s2.before.y, s2.before.z]) > 1 && dist(q.p, q2.p) < 0.5, JSON.stringify(q));
  await shot('hold-hover.png');

  /* The HUD's aircraft strip: both, their states, and a tap flies one. */
  /* The first flight's card dismissed as its button says, with Enter. */
  await page.tap('Enter');
  await page.sleep(400);
  const hud = await page.evaluate('window.__opsHud()');
  const rows = hud.fleet;
  check('the HUD lists both aircraft, the Bramor flying and the 7 inch hovering with its height', rows.length === 2
    && rows.find((r) => r.key === 'isr')?.flown && /HOVER \d+ m/.test(rows.find((r) => r.key === 'recon')?.text ?? ''), JSON.stringify(rows));
  for (const [w, hh] of [[1280, 720], [390, 844], [844, 390]]) {
    await page.cdp.send('Emulation.setDeviceMetricsOverride', {
      width: w, height: hh, deviceScaleFactor: 1, mobile: w < 900,
    }, page.sessionId);
    await page.sleep(900);
    const rr = (await page.evaluate('window.__opsHud()')).rects;
    const f = rr.fleet;
    const clash = Object.entries(rr).filter(([k, b]) => k !== 'fleet' && b && f && b.x < f.x + f.w && f.x < b.x + b.w && b.y < f.y + f.h && f.y < b.y + b.h).map(([k]) => k);
    check(`${w}x${hh}: the strip inside the window and clear of the other panels`, f && f.x >= -1 && f.y >= -1 && f.x + f.w <= w + 1 && f.y + f.h <= hh + 1 && !clash.length, JSON.stringify({ f, clash }));
    await shot(`hold-strip-${w}x${hh}.png`);
  }
  await page.cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280, height: 720, deviceScaleFactor: 1, mobile: false,
  }, page.sessionId);
  await page.sleep(900);
  const rowAt = await page.evaluate(`(() => {
    const b = document.querySelector('.ops-fleet button[data-act="fly:recon"]');
    if (!b) { return null; }
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (rowAt) {
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await page.cdp.send('Input.dispatchMouseEvent', { type, ...rowAt, button: 'left', clickCount: 1 }, page.sessionId);
    }
    await page.sleep(200);
  }
  const tapped = await lastSent();
  check('a tap on the 7 inch\'s row asks the room for it', Boolean(rowAt) && tapped && tapped.op === 'active' && tapped.key === 'recon', JSON.stringify(tapped));

  /* Another seat's hold in the room's view: drawn where it says. */
  {
    const v = view('isr');
    v.roles.held[2] = [];
    v.holds = {
      2: {
        'isr:2': {
          airframe: 'bramor2300', cam: null, hold: { kind: 'hover', t0: 0, p0: [b2.c[0], b2.c[1], b2.c[2] + 40] },
        },
      },
    };
    await page.evaluate(`(window.__ops.inject({ type: 'ops', ops: ${JSON.stringify(v)} }), true)`);
    await page.sleep(500);
    const peers = (await page.evaluate('window.__ops.holds()')).peers;
    const pp = peers[0];
    check('another seat\'s hold from the view is drawn where it says', peers.length === 1 && pp.shown && dist(pp.drawn, [b2.c[0], b2.c[2] + 40, -b2.c[1]]) < 0.01, JSON.stringify(peers));
    await shot('hold-peer.png');
    await inject('isr');
  }

  /* The role board's FLY THIS, by pointer. */
  const at = (sel) => page.evaluate(`(() => {
    const b = document.querySelector(${JSON.stringify(sel)});
    if (!b) { return null; }
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  const press = async (p) => {
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await page.cdp.send('Input.dispatchMouseEvent', { type, ...p, button: 'left', clickCount: 1 }, page.sessionId);
    }
  };
  const sentBefore = (await page.evaluate('window.__ops.sent()')).length;
  const opener = await at('.roles-open');
  if (opener) {
    await press(opener);
  }
  await page.sleep(400);
  const btn = await page.evaluate(`(() => {
    const b = document.querySelector('.roles-box button[data-act="active:recon"]');
    if (!b) { return null; }
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (btn) {
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await page.cdp.send('Input.dispatchMouseEvent', { type, ...btn, button: 'left', clickCount: 1 }, page.sessionId);
    }
    await page.sleep(300);
  }
  const asked3 = await lastSent();
  console.log(`  (board: opener ${JSON.stringify(opener)}, button ${JSON.stringify(btn)}, ${JSON.stringify(await page.evaluate('window.__rolesBoard ? window.__rolesBoard() : null'))})`);
  check('the role board\'s FLY THIS asks the room the same', Boolean(btn) && (await page.evaluate('window.__ops.sent()')).length === sentBefore + 1 && asked3 && asked3.op === 'active' && asked3.key === 'recon', JSON.stringify(asked3));

  const errs = page.errors.filter((e) => !e.startsWith('network:'));
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await page.close();
}
console.log(`\n${passed} passed, ${failed} failed (pictures in ${outDir})`);
process.exit(failed ? 1 : 0);
