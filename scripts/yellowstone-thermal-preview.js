/*
 * yellowstone-thermal-preview.js: pictures and numbers for Yellowstone's
 * thermal features and water, headless, without the shell or the terrain
 * engine.
 *
 * Loads tests/browser/yellowstone-thermal.html, which builds everything on
 * a stand in ground in the contract's frame, then for each hero landmark
 * takes a picture from the ground and one from a hundred metres, takes Old
 * Faithful's eruption as a sequence (before, splashing, full column,
 * dying), measures the draw calls, triangles and particles of the two
 * budget views over the Upper Geyser Basin against docs/YELLOWSTONE-PLAN.md,
 * and fails on any page error.
 *
 *   node scripts/yellowstone-thermal-preview.js [outDir] [--only=a,b] [--data=dir] [--no-shots]
 *
 * --data points at a folder holding thermal.json and hydro.json (the real
 * ones in ~/Desktop/fdfpv-yellowstone-data); without it the fixtures in
 * tests/fixtures/yellowstone are used. Pictures go to outDir, by default a
 * folder under the system temp, and are not committed (CLAUDE.md).
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
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { openPage } from '../tests/lib/page.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const flag = (name) => {
  const a = process.argv.find((v) => v.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
};
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const outDir = args[0] ?? join(tmpdir(), 'yellowstone-thermal-preview');
const only = flag('only') ? flag('only').split(',') : null;
const dataDir = flag('data');
const shots = !process.argv.includes('--no-shots');

/*
 * THE BUDGETS, for the thermal features and the water alone (the ground,
 * the sky and the post passes are subtracted out by the page). Draw calls
 * and triangles as renderer.info counts a whole frame, prepass included,
 * which is what the shell's __renderStats reads; particles are instances
 * in particle meshes whose bounds are in view. Reasoning in
 * docs/YELLOWSTONE-PLAN.md.
 */
const BUDGETS = {
  'ugb-100m': { calls: 60, tris: 400000, particles: 9000 },
  'ugb-1km': { calls: 60, tris: 500000, particles: 12000 },
};

/*
 * The heroes and how to look at each: the ground view from `ground`
 * metres out at eye height, turned `az` degrees round from the south
 * (0 looks north), aimed `aim` metres up; the air view from 100 m over the
 * ground, `air` metres out.
 */
const HEROES = [
  { id: 'old-faithful', ground: 105, az: 10, aim: 14, air: 190 },
  { id: 'grand-prismatic', ground: 95, az: 60, aim: 3, air: 210 },
  { id: 'excelsior', ground: 70, az: 250, aim: 2, air: 170 },
  { id: 'morning-glory', ground: 13, az: 30, aim: -1, air: 90 },
  { id: 'castle', ground: 60, az: 200, aim: 6, air: 170 },
  { id: 'grand', ground: 60, az: 150, aim: 8, air: 170 },
  { id: 'riverside', ground: 55, az: 90, aim: 5, air: 170 },
  { id: 'beehive', ground: 40, az: 180, aim: 3, air: 150 },
  { id: 'paint-pot', ground: 22, az: 20, aim: 0, air: 110 },
  { id: 'mammoth', ground: 320, az: 70, aim: 20, air: 420 },
  { id: 'lower-falls', ground: 380, az: 30, aim: -40, air: 520 },
];

const page = await openPage({ root, width: 1280, height: 720, url: '/tests/browser/yellowstone-thermal.html' });
let failed = false;
const fail = (msg) => {
  console.log(`FAIL ${msg}`);
  failed = true;
};
try {
  await page.until('window.__ysReady === true', 60000);
  await mkdir(outDir, { recursive: true });
  let setupArg = '';
  if (dataDir) {
    const tj = await readFile(join(dataDir, 'thermal.json'), 'utf8');
    const hj = await readFile(join(dataDir, 'hydro.json'), 'utf8');
    setupArg = `{ thermalJson: ${tj}, hydroJson: ${hj} }`;
  }
  const setup = await page.evaluate(`window.__ys.setup(${setupArg})`);
  console.log(`data: ${JSON.stringify(setup)}`);

  const shot = async (name) => {
    await page.evaluate('window.__ys.render()');
    if (!shots) {
      return;
    }
    const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
    const path = join(outDir, `${name}.png`);
    await writeFile(path, Buffer.from(data, 'base64'));
    console.log(`shot ${path}`);
  };

  for (const h of HEROES) {
    if (only && !only.includes(h.id)) {
      continue;
    }
    const at = await page.evaluate(`window.__ys.hero('${h.id}')`);
    const loaded = await page.evaluate(`window.__ys.look(${at.x}, ${at.z})`);
    console.log(`${h.id}: region ${loaded.region}, build ${loaded.ms.thermal} ms thermal, ${loaded.ms.water} ms water, ${JSON.stringify(loaded.thermal)}`);
    const focus = (await page.evaluate(`window.__ys.heroFocus('${h.id}')`)) ?? { x: at.x, y: at.y, z: at.z };
    await page.evaluate('window.__ys.time(30)');
    const views = await page.evaluate(`window.__ys.heroViews('${h.id}')`);
    const a = (h.az * Math.PI) / 180;
    const gx = focus.x + Math.sin(a) * h.ground;
    const gz = focus.z + Math.cos(a) * h.ground;
    const gy = (await page.evaluate(`window.__ys.heightAt(${gx}, ${gz})`)) + 1.7;
    const groundCam = views ? views.ground : [gx, gy, gz, focus.x, at.y + h.aim, focus.z];
    await page.evaluate(`window.__ys.cam(${groundCam.join(',')}, 60)`);
    await shot(`${h.id}-ground`);
    const ax = focus.x + Math.sin(a) * h.air;
    const az = focus.z + Math.cos(a) * h.air;
    const ay = (await page.evaluate(`window.__ys.heightAt(${ax}, ${az})`)) + 100;
    const airCam = views ? views.air : [ax, ay, az, focus.x, at.y, focus.z];
    await page.evaluate(`window.__ys.cam(${airCam.join(',')}, 60)`);
    await shot(`${h.id}-100m`);
    if (h.id === 'old-faithful') {
      /* The eruption as a sequence on the real schedule: find the next
       * start after an hour of clock and step through it. */
      const s0 = await page.evaluate("window.__ys.state('old-faithful', 3600)");
      const start = s0.next;
      const full = await page.evaluate(`window.__ys.state('old-faithful', ${start + 20})`);
      /* The splashing frame on a splash: preplay comes and goes, so the
       * tallest moment of the last minute and a half before the start. */
      let splash = start - 40;
      let best = -1;
      for (let dt = 90; dt >= 5; dt -= 0.5) {
        const st = await page.evaluate(`window.__ys.state('old-faithful', ${start - dt})`);
        if (st.height > best) {
          best = st.height;
          splash = start - dt;
        }
      }
      const frames = [
        ['before', start - 600], ['splashing', splash], ['rising', start + 6], ['full', start + 20],
        ['dying', start + full.water * 0.8], ['steam', start + full.water + 25],
      ];
      await page.evaluate(`window.__ys.cam(${gx}, ${gy}, ${gz}, ${focus.x}, ${at.y + 22}, ${focus.z}, 60)`);
      for (const [name, t] of frames) {
        const st = await page.evaluate(`window.__ys.state('old-faithful', ${t})`);
        await page.evaluate(`window.__ys.time(${t})`);
        console.log(`old-faithful ${name}: t ${t.toFixed(1)} s, ${st.phase}, column ${st.height.toFixed(1)} m, steam ${st.steam.toFixed(2)}`);
        await shot(`old-faithful-eruption-${name}`);
      }
      if (!(full.height >= 32 && full.height <= 56)) {
        fail(`Old Faithful's full column is ${full.height.toFixed(1)} m, outside 32 to 56`);
      }
    }
  }

  /* The budget views over the Upper Geyser Basin, with every feature of the
   * region built. */
  if (!only || only.includes('budget')) {
    const ugb = { x: -26900, z: 17300 };
    await page.evaluate(`window.__ys.look(${ugb.x}, ${ugb.z})`);
    await page.evaluate('window.__ys.time(120)');
    const gy = await page.evaluate(`window.__ys.heightAt(${ugb.x}, ${ugb.z})`);
    const views = {
      'ugb-100m': [ugb.x + 250, gy + 100, ugb.z + 500, ugb.x - 80, gy, ugb.z - 150],
      'ugb-1km': [ugb.x + 900, gy + 1000, ugb.z + 1700, ugb.x - 100, gy, ugb.z - 200],
    };
    for (const [name, c] of Object.entries(views)) {
      await page.evaluate(`window.__ys.cam(${c.join(',')}, 60)`);
      await shot(name);
      const cost = await page.evaluate('window.__ys.cost()');
      const b = BUDGETS[name];
      const ok = cost.calls <= b.calls && cost.tris <= b.tris && cost.particles <= b.particles;
      console.log(`${ok ? 'ok  ' : 'FAIL'} budget ${name}: ${cost.calls} draw calls (<= ${b.calls}), ${cost.tris} triangles (<= ${b.tris}), ${cost.particles} particles (<= ${b.particles})`);
      if (!ok) {
        failed = true;
      }
    }
    /* Yellowstone Lake from three kilometres up. */
    await page.evaluate('window.__ys.look(11718, 18939, 600, 6000)');
    await page.evaluate('window.__ys.cam(-2000, 3160, 30000, 11718, 157, 17000, 60)');
    await shot('yellowstone-lake-3km');
  }
  if (page.errors.length) {
    fail(`page errors:\n${page.errors.join('\n')}`);
  }
} finally {
  await page.close();
}
process.exitCode = failed ? 1 : 0;
