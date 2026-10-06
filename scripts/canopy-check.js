/*
 * canopy-check.js: the contact pass's canopy call, in the real shell.
 *
 *   node scripts/canopy-check.js
 *
 * docs/ITAIPU-PLAN.md section 9 and 14, package C: a map may answer
 * canopyAt(x, z), the top of its forest there or -Infinity, and a craft
 * below that top is in the canopy whether or not a tree collider was built
 * there. No shipped map has a forest volume yet, so this loads the alps
 * (no canopyAt of its own) and lays a flat synthetic canopy over it
 * through window.__canopyTop, 20 m over the ground at the spawn:
 *
 *   a quad thrown 5 m under the top gets a canopy contact;
 *   one thrown 1 m over it and climbing away does not;
 *   and one 5 m under a canopy of -Infinity, which is no forest, does not.
 *
 * Headless Chromium through tests/lib/page.js. Exits 1 on any failure.
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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
/* The canopy's top over the ground at the spawn, m. */
const TOP_AGL = 20;

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};

const settings = {
  ...seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'interceptor'),
  airframeAsked: true,
  map: 'alps',
  graphics: 'low',
  graphicsAuto: false,
  sound: false,
};
const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, ${JSON.stringify(settings)});
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.airhint.v2', '1');
} catch (e) { /* Storage refused; the run boots on its defaults. */ }`];

const STATE = `JSON.stringify((() => { const c = window.__craftState();
  return { t: window.__crash().simT, y: c.worldY, kind: c.lastHitKind, crashed: c.crashed }; })())`;

/* Throw the quad at `y` over the spawn with the throttle at `throttle`,
 * and watch `seconds` of the sim's clock: every kind of contact seen, and
 * the lowest it went. */
async function throwAt(page, sp, y, throttle, seconds) {
  await page.evaluate(`window.__stick(0, 0, 0, ${throttle})`);
  await page.evaluate(`window.__crashThrow(${JSON.stringify({ fresh: true, x: sp.x, y, z: sp.z, yaw: 0, vy: throttle > 0.5 ? 2 : 0 })})`);
  const first = JSON.parse(await page.evaluate(STATE));
  const kinds = new Set([first.kind]);
  let low = first.y;
  let st = first;
  const wall = Date.now();
  while (st.t - first.t < seconds && Date.now() - wall < 120000) {
    await page.sleep(30);
    st = JSON.parse(await page.evaluate(STATE));
    kinds.add(st.kind);
    low = Math.min(low, st.y);
  }
  return { kinds: [...kinds], low, end: st, simS: st.t - first.t };
}

const page = await openPage({ root, width: 960, height: 540, url: '/index.html?map=alps', seed });
try {
  await page.until('window.__shellReady && window.__map && window.__map().ready', 300000);
  await page.sleep(1000);
  const sp = JSON.parse(await page.evaluate('JSON.stringify(window.__map().spawn)'));
  const ground = await page.evaluate(`window.__heightAt(${sp.x}, ${sp.z})`);
  const top = ground + TOP_AGL;
  await page.evaluate(`window.__canopyTop(${top})`);

  const under = await throwAt(page, sp, top - 5, 0, 0.5);
  check('a quad 5 m under the canopy\'s top gets a canopy contact',
    under.kinds.includes('canopy'),
    `thrown at y ${(top - 5).toFixed(2)} m, under a top at ${top.toFixed(2)}; contacts ${under.kinds.join(', ')} over ${under.simS.toFixed(2)} s`);

  const over = await throwAt(page, sp, top + 1, 1, 1.0);
  check('one 1 m over it, climbing away, does not',
    !over.kinds.includes('canopy') && over.low > top,
    `thrown at y ${(top + 1).toFixed(2)} m; contacts ${over.kinds.join(', ')}; lowest ${over.low.toFixed(2)} m, ${(over.low - top).toFixed(2)} over the top, over ${over.simS.toFixed(2)} s`);

  await page.evaluate('window.__canopyTop(-Infinity)');
  const none = await throwAt(page, sp, top - 5, 0, 0.5);
  check('and a canopy of -Infinity, no forest, gives none',
    !none.kinds.includes('canopy'),
    `thrown at y ${(top - 5).toFixed(2)} m; contacts ${none.kinds.join(', ')}`);

  const errors = page.errors ? page.errors.filter((e) => !/favicon/.test(e)) : [];
  check('with no page error', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');
} finally {
  await page.close();
}

const failed = checks.filter((c) => !c.ok).length;
console.log(`${checks.length - failed} of ${checks.length} passed`);
process.exit(failed ? 1 : 0);
