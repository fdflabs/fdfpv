/*
 * traffic-check.js: a car that strikes a wreck strikes it the same way at
 * any frame rate.
 *
 *   SIM_GPU=1 npm run check:traffic
 *
 * The Swiss valley's cars are moving boxes in the colliders (alps/life.js),
 * and the shell's contact pass meets them every OBSTACLE_STEP ms of sim
 * time. The map used to move them once a drawn frame, so the pass met a
 * car where the last frame boundary had left it, swept over the last
 * frame's length: the same wreck on the road, thrown the same way at the
 * same lap clock, was struck at step 2885 on one pacing of the frames and
 * at 2921 or 2953 on another, and the step traces parted there, "state
 * in". That was check 0 of crashcam:e2e failing on a loaded machine.
 *
 * This throws a hands off Skyhunter down the road at lap clock CLOCK_MS,
 * so that it comes down on the road as a southbound car arrives, three
 * times: with the frames as they come, with every other frame held up
 * 40 ms, and with every fifth held up 90 ms (a busy wait in the frame
 * callback, before the shell's own). It fails unless a car struck the
 * wreck in every throw and the three step traces (window.__stepTrace)
 * are the same over the first TRACE_STEPS steps.
 *
 * The throw's point and clock were found by throwing there at a sweep of
 * clocks: a car meets the wreck from about 6400 to 6800 ms. If the road
 * or the timetable moves, "no car struck the wreck" is the failure, and
 * the point wants finding again.
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
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const AIRFRAME = 'sky1800';
const ROAD = { x: 145.5, z: 1450 };
const CLOCK_MS = 6600;
const TRACE_STEPS = 3000;
const PACINGS = [
  { name: 'as they come', every: 0, ms: 0 },
  { name: 'every other frame held 40 ms', every: 2, ms: 40 },
  { name: 'every fifth frame held 90 ms', every: 5, ms: 90 },
];

function seed() {
  const settings = {
    ...seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, AIRFRAME),
    airframeAsked: true,
    map: 'swiss2',
    graphics: 'low',
    graphicsAuto: false,
    crashDamage: true,
  };
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(settings)});
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.airhint.v2', '1');
  } catch (e) { /* Storage refused; the run boots on its defaults. */ }`,
  /* The pacing: a frame callback held up before the shell's own runs, so
   * the shell reads a longer frame and steps more of the plant in it. */
  `(() => {
    const raf = window.requestAnimationFrame.bind(window);
    let n = 0;
    window.__pace = { every: 0, ms: 0 };
    window.requestAnimationFrame = (cb) => raf((t) => {
      n += 1;
      const p = window.__pace;
      if (p.every > 0 && n % p.every === 0) {
        const end = performance.now() + p.ms;
        while (performance.now() < end) { /* held */ }
      }
      cb(t);
    });
  })();`];
}

const WAIT = 120000;

async function main() {
  console.log('traffic: a car strikes a wreck the same way at any frame rate');
  const page = await openPage({ root, width: 960, height: 540, url: '/index.html?map=swiss2', seed: seed() });
  let failed = 0;
  try {
    await page.until('window.__shellReady && window.__map && window.__map().ready && window.__boot', 180000);
    const f0 = await page.evaluate('window.__boot().frames');
    await page.until(`window.__boot().frames >= ${f0 + 3}`, WAIT);
    await page.evaluate('window.__drawOff(true)');
    const g = await page.evaluate(`window.__heightAt(${ROAD.x}, ${ROAD.z})`);
    const runs = [];
    for (const pace of PACINGS) {
      await page.evaluate(`(window.__pace = ${JSON.stringify({ every: pace.every, ms: pace.ms })}, true)`);
      await page.evaluate('window.__stick(0, 0, 0, 0)');
      const thrown = await page.evaluate(`window.__crashThrow({ fresh: true, hold: true, clockMs: ${CLOCK_MS}, x: ${ROAD.x}, y: ${g + 20}, z: ${ROAD.z}, yaw: 0, pitch: -25, vx: 0, vy: 0, vz: -18, showCraft: false }).ok`);
      if (!thrown) {
        throw new Error('the throw was refused');
      }
      const f1 = await page.evaluate('window.__boot().frames');
      await page.until(`window.__boot().frames >= ${f1 + 2}`, WAIT);
      await page.evaluate('window.__releasePose()');
      await page.until(`window.__stepTrace().n >= ${TRACE_STEPS}`, WAIT);
      const r = await page.evaluate(`(() => {
        const t = window.__stepTrace();
        const car = window.__contacts().log.filter((c) => c.moving >= 0);
        return { n: t.n, pre: t.pre, plane: t.plane, post: t.post, car: car.length, carT: car.length ? car[0].t : null };
      })()`);
      runs.push(r);
      console.log(`  ${pace.name}: ${r.car} contacts with a car${r.car ? `, the first at sim ${r.carT.toFixed(3)} s` : ''}`);
    }
    const struck = runs.every((r) => r.car > 0);
    console.log(`  ${struck ? 'pass' : 'FAIL'}  a car struck the wreck in every throw${struck ? '' : ' (no car struck the wreck: the point or the clock wants finding again)'}`);
    failed += struck ? 0 : 1;
    for (let j = 1; j < runs.length; j += 1) {
      const a = runs[0];
      const b = runs[j];
      let part = '';
      for (let k = 0; k < TRACE_STEPS && !part; k += 1) {
        if (a.pre[k] !== b.pre[k]) {
          part = `they part at step ${k + 1}, state in`;
        } else if (a.plane[k] !== b.plane[k]) {
          part = `they part at step ${k + 1}, ground plane`;
        } else if (a.post[k] !== b.post[k]) {
          part = `they part at step ${k + 1}, state out`;
        }
      }
      console.log(`  ${part ? 'FAIL' : 'pass'}  ${PACINGS[j].name}, the trace of ${PACINGS[0].name}  (${part || `identical over ${TRACE_STEPS} steps`})`);
      failed += part ? 1 : 0;
    }
    const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e));
    console.log(`  ${errs.length ? 'FAIL' : 'pass'}  no page errors${errs.length ? `  (${errs.slice(0, 3).join(' | ')})` : ''}`);
    failed += errs.length ? 1 : 0;
  } finally {
    await page.close();
  }
  if (failed) {
    console.log(`check:traffic FAILED (${failed})`);
    process.exit(1);
  }
  console.log('check:traffic ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
