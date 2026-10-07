/*
 * memory-check.js: a world costs nothing until it is chosen and gives its
 * memory back when it is left. Boots on the Alps, asserts no lazily loaded
 * world's modules were fetched at boot, then for each lazily loaded world
 * switches to it, asserts it fetched its own modules and no other world's
 * (declared shared code aside), switches back and asserts the live three.js
 * geometry and texture counts return to about the baseline.
 *
 *     node scripts/memory-check.js                  (npm run lint:memory)
 *     node scripts/memory-check.js --map=swiss2     (one world)
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

/*
 * On a laptop a world is dozens of source files, thousands of meshes,
 * photographs and baked textures. A pilot who only flies one valley must not
 * pay for another, and one who tries a world and goes back must not keep
 * paying. Both halves break easily and invisibly until a tab runs out of
 * memory somewhere else.
 *
 * verify's check 16 is the reference for the Swiss valley: not fetched while
 * the Alps are selected, a full graph once chosen, MAP_MODULE_COUNT matching
 * the browser's fetches, the Alps' draw cost unchanged. This does not repeat
 * it. It adds the other lazily loaded worlds, that choosing one drags in no
 * other world's directory, and release: a lazy load that never frees is a
 * leak with extra steps. It is not in CI because verify builds the WASM and
 * this has nothing to say about the flight model.
 *
 * Resource timing is the witness: it is the browser's own record of every
 * URL fetched, and a loader
 * that believes it fetched nothing cannot fool it. It is cumulative for the
 * page's life, so every question is asked about the slice of entries since a
 * mark taken just before the switch.
 */

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/*
 * The baseline is the world loaded at boot, the smallest there is. It is
 * named in the address because a page naming no world opens on the title's
 * own valley (src/boot.js), and this measures what boot fetches with the
 * baseline selected. It is never measured as lazily loaded: the title always
 * has a world. It was the race field, then the airfield, until each was
 * retired.
 */
const BASELINE = 'alps';
const LAZY = ['swiss2', 'itaipu'];

/*
 * swiss2 is the Alps' valley drawn in a second style by the Alps' own
 * builders (src/maps/swiss2.js), so choosing it fetches src/maps/alps.js and
 * src/maps/alps/; copying them would keep six thousand lines twice. Itaipu
 * is swiss2's look on purpose (docs/ITAIPU-PLAN.md section 1, point 5), and
 * its terrain engine, src/maps/terrain/, is no world's. Only a declared
 * dependency is let through: swiss2 pulling in Itaipu is still a fault, and
 * so is the Alps pulling in swiss2, which the boot half catches.
 */
const SHARES = {
  swiss2: ['alps'],
  itaipu: ['swiss2'],
};

const ofWorld = (id) => (url) => url.includes(`/src/maps/${id}/`) || url.endsWith(`/src/maps/${id}.js`);

const OFFLINE = /net::ERR_|Failed to load resource/;

/*
 * The browser keeps 250 resource timing entries by default and silently
 * drops the rest. Boot plus one big world's graph went past that, so a later
 * world's fetches were never recorded and it read as fetching nothing. The
 * buffer is raised before the app runs.
 */
const seeds = [
  `try {
    const s = JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) || '{}');
    s.map = ${JSON.stringify(BASELINE)};
    s.graphics = 'low';
    s.graphicsAuto = false;
    localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, JSON.stringify(s));
  } catch (e) {}`,
  'performance.setResourceTimingBufferSize(20000);',
];

const urlsSince = (mark) => `JSON.stringify(performance.getEntriesByType('resource').slice(${mark}).map((e) => e.name))`;
const ENTRY_COUNT = `performance.getEntriesByType('resource').length`;
const GPU = 'JSON.stringify(window.__gpuMemory())';

function worldList() {
  let list = LAZY;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--map=')) {
      list = [arg.slice('--map='.length)];
    }
  }
  return list;
}

/* The pinned 2.5 s lets the title settle so a reading is a steady state,
 * not a frame mid-build. */
async function switchTo(page, id) {
  await page.evaluate(`window.__setMap(${JSON.stringify(id)})`);
  await page.until('window.__shellReady === true', 180000);
  await page.sleep(2500);
}

async function main() {
  const failures = [];
  const page = await openPage({
    root, width: 1280, height: 720, url: `/index.html?map=${BASELINE}`, seed: seeds,
  });
  try {
    await page.until('window.__shellReady === true', 120000);
    await page.until('typeof window.__gpuMemory === "function"', 10000);
    await page.sleep(2000);

    const bootUrls = JSON.parse(await page.evaluate(urlsSince(0)));
    const base = JSON.parse(await page.evaluate(GPU));
    console.log(`baseline, ${BASELINE} selected: ${base.geometries} geometries, ${base.textures} textures, ${bootUrls.length} requests`);
    for (const w of LAZY) {
      const hits = bootUrls.filter(ofWorld(w));
      if (hits.length) {
        failures.push(`${hits.length} ${w} module(s) fetched with the ${BASELINE} selected, first ${hits[0]}`);
      }
    }
    if (!failures.length) {
      console.log(`none of ${LAZY.join(', ')} fetched at boot`);
    }

    /* Generous on purpose: the shell keeps a session-lived airframe and a
     * shared cel ramp, and a few objects differ between the first and second
     * baseline builds. It still catches a whole world staying resident. The
     * texture count is held to the same allowance. */
    const allowance = Math.max(40, Math.round(0.15 * base.geometries));
    const visited = new Set();
    for (const id of worldList()) {
      const mark = await page.evaluate(ENTRY_COUNT);
      await switchTo(page, id);
      const slice = JSON.parse(await page.evaluate(urlsSince(mark)));
      const mine = slice.filter(ofWorld(id));
      const loaded = JSON.parse(await page.evaluate(GPU));
      /* A world already visited comes from the module cache and fetches
       * nothing the second time. */
      if (!mine.length && !visited.has(id)) {
        failures.push(`${id}: choosing it fetched no ${id} module at all, so the first half proves nothing`);
      }
      visited.add(id);
      const allowed = SHARES[id] || [];
      for (const other of LAZY) {
        if (other === id || allowed.includes(other)) {
          continue;
        }
        const bled = slice.filter(ofWorld(other));
        if (bled.length) {
          failures.push(`${id}: pulled in ${bled.length} ${other} module(s), first ${bled[0]}`);
        }
      }
      await switchTo(page, BASELINE);
      const back = JSON.parse(await page.evaluate(GPU));
      for (const kind of ['geometries', 'textures']) {
        const leak = back[kind] - base[kind];
        if (leak > allowance) {
          failures.push(`${id}: ${leak} ${kind} still live after leaving it (${base[kind]} at boot, ${loaded[kind]} loaded, ${back[kind]} back on the ${BASELINE})`);
        }
      }
      const run = (kind, width) => [base, loaded, back].map((m) => String(m[kind]).padStart(width)).join(' -> ');
      console.log(`  ${id.padEnd(7)} ${String(mine.length).padStart(3)} modules  geometries ${run('geometries', 5)}  textures ${run('textures', 4)}`);
    }

    /* No board runs here, so refused fetches are expected and only noted. */
    const offline = page.errors.filter((e) => OFFLINE.test(e));
    if (offline.length) {
      console.log(`note: ${offline.length} network fetch(es) refused, the board is not running here`);
    }
    for (const e of page.errors) {
      if (!OFFLINE.test(e)) {
        failures.push(`console: ${e}`);
      }
    }
  } finally {
    await page.close();
  }

  console.log('');
  if (failures.length) {
    console.error(`FAIL, ${failures.length} problem(s):`);
    for (const f of failures) {
      console.error(`  ${f}`);
    }
    return 1;
  }
  console.log('PASS, every world is lazy and every world is freed');
  return 0;
}

try {
  process.exitCode = await main();
} catch (e) {
  console.error(e && e.stack ? e.stack : e);
  process.exitCode = 1;
}
