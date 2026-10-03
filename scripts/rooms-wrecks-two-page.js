/*
 * rooms-wrecks-two-page.js: Phase 2's proof (docs/MULTIPLAYER-PLAN.md
 * section 6.5). Two headless pages of the real shell in one room on the
 * Swiss valley. A's red Cub is thrown into the ground, then into a tree
 * trunk; each time B must see A's pieces come off, fall and lie where A's
 * own screen has them, to TOLERANCE_M, and see them gone when A starts
 * again. By hand, against a running rooms Worker:
 *
 *   npx wrangler dev --config edge/rooms/wrangler.toml --port 8797
 *   SIM_GPU=1 node scripts/rooms-wrecks-two-page.js http://127.0.0.1:8797 [outdir]
 *
 * Why the tolerance is what it is: A sends a piece again only once it has
 * moved STILL_M (3 mm, src/share/roomwrecks.js) from where it was last
 * sent, and the wire carries positions as float32 and attitudes to 16
 * bits, so where B draws a resting piece differs from where A draws it by
 * at most those 3 mm plus rounding. The check allows 1 cm.
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
const outDir = process.argv[3] || join(root, 'build', 'rooms-wrecks');
const TOLERANCE_M = 0.01;

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
  const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, id);
  s.map = 'swiss2';
  s.freestyleMap = 'swiss2';
  s.graphics = 'low';
  s.flightMode = 'angle';
  s.fpsCap = 0;
  s.airframeAsked = true;
  s.crashDamage = true;
  s.livery = { [id]: { regions: { wing: colour, fuselage: colour, tail: colour } } };
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    if (!s.roomsSeeded) {
      Object.assign(s, ${JSON.stringify(s)}, { roomsSeeded: true });
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

/* A's pieces as A draws them, once they have lain still for 1.5 s. */
async function settled(a) {
  let prev = null;
  let stillSince = Date.now();
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    const now = await a.evaluate('window.__rooms().ownWreck');
    const same = prev && now.length === prev.length && now.every((p, k) => Math.hypot(p.x - prev[k].x, p.y - prev[k].y, p.z - prev[k].z) < 0.001);
    if (!same) {
      stillSince = Date.now();
    }
    if (now.length && Date.now() - stillSince > 1500) {
      return now;
    }
    prev = now;
    await a.sleep(200);
  }
  return prev || [];
}

/* Where B draws A's pieces, and how far each is from where A has it. */
async function compare(b, own) {
  await b.sleep(800);
  const peer = (await b.evaluate('window.__rooms()')).peers[0];
  const seen = peer.wreck || [];
  let worst = 0;
  let missing = 0;
  for (const p of own) {
    const q = seen.find((s) => s.part === p.part);
    if (!q) {
      missing += 1;
      continue;
    }
    worst = Math.max(worst, Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z));
  }
  return { seen, worst, missing };
}

/* B's camera on the pieces' middle, from a few metres off. */
async function lookAt(page, pts, dx, dy, dz) {
  const c = pts.reduce((m, p) => [m[0] + p.x / pts.length, m[1] + p.y / pts.length, m[2] + p.z / pts.length], [0, 0, 0]);
  await page.evaluate(`window.__setCam(${c[0] + dx}, ${c[1] + dy}, ${c[2] + dz}, ${c[0]}, ${c[1]}, ${c[2]}, 50); true`);
  await page.sleep(1200);
}

async function scenario(a, b, name, throwExpr, view) {
  console.log(name);
  const thrown = await a.evaluate(`(() => { const t = (${throwExpr})(); window.__crashThrow({ ...t, fresh: true }); return t; })()`);
  /* B sees them fall: pieces drawn before A's have settled. */
  await b.until('(() => { const p = window.__rooms().peers[0]; return p.wreck && p.wreck.length > 0; })()', 20000).catch(() => {});
  const falling = (await b.evaluate('window.__rooms()')).peers[0].wreck || [];
  check(`${name}: B draws A's pieces as they come off`, falling.length > 0, `${falling.length} while falling`);
  const own = await settled(a);
  check(`${name}: A's own crash broke pieces off`, own.length > 0, `${own.length} pieces: ${own.map((p) => p.part).join(',')}`);
  const got = await compare(b, own);
  check(`${name}: B draws every one of them`, got.missing === 0 && got.seen.length === own.length, `${got.seen.length} of ${own.length}`);
  check(`${name}: each where A has it, within ${TOLERANCE_M * 100} cm`, got.worst <= TOLERANCE_M, `worst ${(got.worst * 1000).toFixed(1)} mm`);
  await lookAt(b, own, ...view);
  await shot(b, `b-sees-a-${name}`);
  await lookAt(a, own, ...view);
  await shot(a, `a-own-${name}`);
  await b.evaluate('window.__setCam(null); true');
  await a.evaluate('window.__setCam(null); true');
  return thrown;
}

const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;
console.log(`shared wrecks, two pages, rooms at ${rooms}`);
const a = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('cub1400', '#d8432f') });
const b = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('p51d1450', '#2f6fd6') });
try {
  for (const p of [a, b]) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__map && window.__map().ready', 400000);
  }
  const code = await a.evaluate('window.__roomCreate()');
  await a.until("window.__rooms().phase === 'open'", 30000);
  await b.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  for (const p of [a, b]) {
    await p.until("window.__rooms().phase === 'open' && window.__rooms().peers.length === 1 && window.__rooms().roomNow != null", 30000);
    await p.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  }
  for (const p of [a, b]) {
    await p.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
    await p.until('window.__rooms().peers[0].drawn', 30000);
  }
  check('in one room, flying, each drawing the other', true, code);

  await scenario(a, b, 'ground', `() => {
    const s = window.__craftState();
    const x = s.worldX + 30, z = s.worldZ - 20, y = window.__heightAt(x, z) + 1.9;
    return { x, y, z, yaw: 90, pitch: -25, roll: 75, vx: -24, vy: -8, vz: 0 };
  }`, [6, 3, 6]);

  await a.tap('KeyR');
  await b.until('(() => { const p = window.__rooms().peers[0]; return !p.wreck || p.wreck.length === 0; })()', 15000).catch(() => {});
  const cleared = (await b.evaluate('window.__rooms()')).peers[0].wreck;
  check('A starts again and B\'s drawing of the wreck is gone', !cleared || cleared.length === 0, `${cleared ? cleared.length : 0} left`);
  const whole = (await b.evaluate('window.__rooms()')).peers[0];
  check('and A is whole on B\'s screen again', whole.drawn && whole.drawnAirframe === 'cub1400');

  await scenario(a, b, 'tree', `() => {
    const s = window.__craftState();
    const trunks = window.__crashSolids(s.worldX, s.worldZ, 3000, 'tree').filter((c) => !c.box);
    const t = trunks[0];
    const y = t.a[1] + 1.2;
    return { x: t.a[0] + 9, y, z: t.a[2], yaw: 90, pitch: 0, vx: -22, vy: 0, vz: 0 };
  }`, [2, 7, 6]);

  const errs = [...a.errors, ...b.errors].filter((e) => !e.startsWith('network:'));
  check('no page error on either page', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await a.close();
  await b.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
