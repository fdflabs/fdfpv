/*
 * water-page.js: the Itaipu flood in the real page (docs/FLOOD.md), fed an
 * opening as the war's damage feeds one (map.onOpening, through the
 * harness's __mapOpening): Free Flight's spill is loaded with the map,
 * the opening turns it to a war's water, which steps on the map's clock, gate 3's water is gauged, and its discharge
 * reaches the world's sound (src/render/world-audio.js flow) every frame
 * without a page error.
 *
 *     SIM_GPU=1 node scripts/water-page.js
 *
 * Needs the Itaipu data folder (FDFPV_ITAIPU_DATA). One headless browser.
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
import { SETTINGS_KEY } from '../src/ui/ui.js';
import { START } from '../src/maps/itaipu/water/flood.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}${detail ? `  (${detail})` : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  s.graphics = 'high';
  s.graphicsAuto = false;
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.airhint.v2', '1');
  localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
} catch (e) { /* Storage refused; the run boots on its defaults. */ }`];

const page = await openPage({
  root, width: 960, height: 540, url: '/index.html?map=itaipu', seed,
});
try {
  await page.until('window.__shellReady && window.__map && window.__map().ready && window.__map().id === "itaipu"', 300000);
  const flood = () => page.evaluate('JSON.stringify(window.__map().parts.water.flood)').then(JSON.parse);
  await page.until('window.__map().parts.water.flood.state === "ready"', 60000);
  const before = await flood();
  check(`Free Flight's spill loads with the map, every gate ${START.spill} m open, not stepped`, before.mode === 'free' && before.lips.every((v) => v === START.spill) && before.step === 0,
    `${before.state} ${before.mode} step ${before.step}`);
  const at = await page.evaluate('window.__animMs()');
  /* The DAMAGE agent's first opening, gate 3's notch, at the map's
   * clock now. */
  const ok = await page.evaluate(`(() => {
    return window.__mapOpening({ id: 'gate-3', target: 'gate-3', kind: 'gate', at: ${at},
      sill: [-1051.9, 212.33, -984.6], width_m: 10, height_m: 8.17, normal: [0, 0, 1], upstream_cell: null, downstream_cell: null });
  })()`);
  check('the map takes the opening', ok === true);
  await page.until('window.__map().parts.water.flood.mode === "war" && window.__map().parts.water.flood.state === "ready"', 60000);
  await page.until(`window.__map().parts.water.flood.step > ${20000 / 20}`, 120000);
  const after = await flood();
  check('the flood loads its files and steps on the map\'s clock', after.state === 'ready' && after.step > 0, `step ${after.step}, ${after.behind} behind, origin ${after.origin}, clock ${after.clockMs}`);
  const flows = await page.evaluate('JSON.stringify(window.__mapFlows())').then(JSON.parse);
  check('gate 3\'s water is gauged and handed to the sound', Array.isArray(flows) && flows.length === 1 && flows[0].key === 3 && flows[0].q > 50,
    flows ? flows.map((f) => `${f.id} key ${f.key} ${f.q.toFixed(0)} m3/s at (${f.x.toFixed(0)}, ${f.y.toFixed(1)}, ${f.z.toFixed(0)})`).join('; ') : 'none');
  const errs = page.errors.filter((e) => !/net::ERR|Failed to load resource/.test(e));
  check('no page error', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await page.close();
}
console.log(`\nwater-page: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
