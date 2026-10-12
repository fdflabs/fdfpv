/*
 * daytime-frame-check.js: the frame's one daytime in the real shell
 * (docs/DAYTIME-CONTRACT.md, src/share/daytime.js daytimeNow). Detection's
 * light (avxEnv.light), the world's sounds (the time the world audio sang
 * with) and the map's own night flag agree in every frame sampled, and go
 * to night together:
 *
 *   the Interior   flown at the Time of day setting's golden, then switched
 *                  to night mid flight (its sun moves, no rebuild), then to
 *                  the world's own: every sampled frame agrees, the night
 *                  is the 0.05 light and the night sounds, and the hour
 *                  told the map is the setting's
 *   Itaipu         ?time=night solo: the light is 0.05 and the sounds the
 *                  night's (before: perception had full daylight outside
 *                  a war room)
 *   the Swiss      ?time=night solo: a valley that cannot draw night stays
 *   valley         day for the light and the sounds, as its sky does
 *                  (before: night sounds over a day sky)
 *
 *     node scripts/daytime-frame-check.js      (npm run daytime:frame)
 *
 * Exit 0 on a pass, 1 otherwise.
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
import { TIME_HOUR } from '../src/share/daytime.js';
import { M1_CLOCK } from '../src/share/interior/clock.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const seedFor = (map, timeOfDay) => [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, { map: ${JSON.stringify(map)}, graphics: 'low', graphicsAuto: false, sound: false, airframeAsked: true, timeOfDay: ${JSON.stringify(timeOfDay)} });
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.airhint.v2', '1');
} catch (e) { /* Storage refused; the run boots on its defaults. */ }`];

let failed = 0;
const check = (name, ok, detail) => {
  if (!ok) failed += 1;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

/* `n` frames of the hook, one per animation frame. */
const frames = async (p, n) => JSON.parse(await p.evaluate(`(async () => {
  const out = [];
  for (let i = 0; i < ${n}; i += 1) {
    await new Promise((r) => requestAnimationFrame(r));
    out.push(window.__daytime());
  }
  return JSON.stringify(out);
})()`));

/* Every reader agrees with the flag, frame by frame. */
const agree = (list) => list.filter((d) => {
  const night = d.flag === 'night';
  return d.night !== night || (d.light === 0.05) !== night || (d.audio === 'night') !== night || (d.time === 'night') !== night;
});
const show = (d) => (d ? `flag ${d.flag}, light ${d.light}, audio ${d.audio}, time ${d.time}, hour ${d.hour}, built ${d.built}` : 'none');

const boot = async (url, map, timeOfDay) => {
  const p = await openPage({ root, url, width: 960, height: 540, seed: seedFor(map, timeOfDay) });
  open = p;
  await p.until('window.__shellReady === true', BOOT_MS);
  await p.until(`window.__map && window.__map().ready && window.__map().id === '${map}'`, BOOT_MS);
  await p.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await p.until("window.__craftState && window.__craftState().mode === 'flight'", BOOT_MS);
  return p;
};

/* A hard limit on the whole check, so a world that never builds fails it
 * rather than holding its slot: three boots, measured at 135 s with every
 * check slot busy (2026-10-11), given 30 min, since a runner boot can take 600 s (below). The open page is closed first. */
/* A boot's budget: on the GitHub runner (software GL, #967 shard-4 job
 * 114614123276) the Interior's boot took 194 s and Itaipu's map was not ready
 * in 180 s; perf-play gives Itaipu 600 s on the same runners. Locally a boot
 * is about 45 s. */
const BOOT_MS = 600000;
const LIMIT_MS = 30 * 60000;
let open = null;
setTimeout(async () => {
  console.log(`  FAIL  the check ran past its hard limit of ${LIMIT_MS / 60000} min`);
  setTimeout(() => process.exit(1), 10000).unref();
  await Promise.allSettled([open && open.close()]);
  process.exit(1);
}, LIMIT_MS).unref();

const refused = /^network: .*ERR_CONNECTION_REFUSED/;
const quiet = (p) => p.errors.filter((e) => !refused.test(e));

console.log('the Interior: golden, night mid flight, its own');
{
  const p = await boot('/index.html?map=interior', 'interior', 'golden');
  try {
    const golden = await frames(p, 20);
    const g = golden.at(-1);
    check('golden: day for every reader, the hour told is golden\'s', agree(golden).length === 0 && g.flag === 'day' && g.light === 1
      && g.audio === 'golden' && g.hour === TIME_HOUR.golden, show(g));
    await p.evaluate("window.__ui.settings.timeOfDay = 'night'; true");
    const turning = await frames(p, 40);
    const n = turning.at(-1);
    check('switched to night mid flight: every reader turns in the same frame as the sky', agree(turning).length === 0,
      `${agree(turning).length} frames disagree, first ${show(agree(turning)[0])}`);
    check('night: the 0.05 light, the night sounds, the hour 22, no rebuild', n.flag === 'night' && n.light === 0.05 && n.audio === 'night'
      && n.hour === TIME_HOUR.night && turning.every((d) => d.ready), show(n));
    await p.evaluate("window.__ui.settings.timeOfDay = 'own'; true");
    const own = await frames(p, 20);
    const o = own.at(-1);
    check('the world\'s own again: its own hour (16:40), day for every reader', agree(own).length === 0 && o.flag === 'day' && o.light === 1
      && o.hour === M1_CLOCK.startHour && o.clock === null, show(o));
    check('no page error', quiet(p).length === 0, quiet(p).slice(0, 3).join(' | ').slice(0, 600));
  } finally {
    await p.close();
  }
}

console.log('Itaipu ?time=night, solo');
{
  const p = await boot('/index.html?map=itaipu&time=night', 'itaipu', 'own');
  try {
    const list = await frames(p, 20);
    const d = list.at(-1);
    check('built at night, and detection and the sounds are night with it', agree(list).length === 0 && d.look === 'night'
      && d.flag === 'night' && d.light === 0.05 && d.audio === 'night', show(d));
    check('no page error', quiet(p).length === 0, quiet(p).slice(0, 3).join(' | ').slice(0, 600));
  } finally {
    await p.close();
  }
}

console.log('the Swiss valley ?time=night, solo');
{
  const p = await boot('/index.html?map=swiss2&time=night', 'swiss2', 'own');
  try {
    const list = await frames(p, 20);
    const d = list.at(-1);
    check('a valley that draws no night stays day for the light and the sounds, as its sky does', agree(list).length === 0
      && d.flag === null && d.light === 1 && d.audio === 'day' && d.night === false, show(d));
    check('no page error', quiet(p).length === 0, quiet(p).slice(0, 3).join(' | ').slice(0, 600));
  } finally {
    await p.close();
  }
}

console.log(failed === 0 ? 'PASS' : 'FAIL');
if (failed > 0) {
  process.exitCode = 1;
}
