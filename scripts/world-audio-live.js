/*
 * world-audio-live.js: the valley's traffic heard on the real shell
 * (docs/AUDIO.md section 12). One headless page boots the Swiss valley,
 * a key wakes the audio as a pilot's first press does, and the world's
 * worklet must say it is voicing the traffic src/maps/alps/life.js drives:
 *
 *   SIM_GPU=1 npm run world:live
 *   SIM_GPU=1 npm run world:live -- --night      the same at ?time=night,
 *                                                its crickets and frogs
 *
 * What must hold:
 *   - the world's node is on the mix and the graph is within its 64 nodes
 *   - the worklet has the valley's sources (the bus, the cars on both
 *     lanes, the tractor, the gondola's cabins and drive, the lake's boat,
 *     the cows) as tracks, and voices some of them, and the ambience (the
 *     stream, the bells, the birds round the listener)
 *   - its load guard has not had to shed (the valley is far under budget)
 *   - no page error
 *
 * Local, not in CI: it boots the whole shell and its map, as war:boom does.
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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
/* src/render/audio.js: the page's ceiling on live nodes (#218). */
const AUDIO_NODES_MAX = 64;
/* The valley's sources: the bus, at least the five northbound cars, the
 * tractor, the drive and at least ten cabins, the boat. */
const TRACKS_MIN = 18;

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  failed += ok ? 0 : 1;
}

async function main() {
  console.log(`world audio, live: the Swiss valley's traffic heard on the shell${process.argv.includes('--night') ? ', at night' : ''}`);
  const seed = [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, { map: 'swiss2', graphics: 'low', graphicsAuto: false, sound: true });
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.airhint.v2', '1');
  } catch (e) { /* Storage refused; the run boots on its defaults. */ }`];
  const night = process.argv.includes('--night');
  const page = await openPage({ root, width: 960, height: 540, url: `/index.html?map=swiss2${night ? '&time=night' : ''}`, seed });
  try {
    await page.until('window.__shellReady && window.__map && window.__map().ready && window.__boot', 180000);
    await page.tap('Space');
    await page.until('window.__audio && window.__audio.ctx', 30000);
    await page.until('window.__traffic().sound && window.__traffic().sound.tracks > 0', 60000);
    /* A few seconds of it, so the pool has chosen and the guard measured. */
    const f0 = await page.evaluate('window.__boot().frames');
    await page.until(`window.__boot().frames >= ${f0 + 60}`, 120000);
    const s = await page.evaluate('window.__traffic().sound');
    const nodes = await page.evaluate('window.__audio.nodeCount()');
    console.log(`  the worklet: ${JSON.stringify(s)}; the graph: ${nodes} nodes`);
    check(`the graph within its ${AUDIO_NODES_MAX} nodes, the world's node in it`, nodes <= AUDIO_NODES_MAX && nodes > 0, `${nodes}`);
    check(`the valley's sources are tracked, at least ${TRACKS_MIN}`, s.tracks >= TRACKS_MIN, `${s.tracks}`);
    check('some of them voiced', s.voicedMax > 0, `${s.voicedMax} at most at once`);
    check('the ambience voiced (the stream, the cows\' bells, the birds)', s.bedsMax > 0, `${s.bedsMax} at most at once`);
    check('the load guard never shed', s.stepMax === 0, `step ${s.stepMax}, load ${s.load}`);
  } finally {
    check('no page error', page.errors.length === 0, page.errors.join(' | '));
    await page.close();
  }
  console.log(failed ? `world:live: ${failed} FAILED` : 'world:live: all passed');
  process.exit(failed ? 1 : 0);
}

await main();
