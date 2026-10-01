/*
 * swiss2-veg-check.js: swiss2's trees keep their leaves and its far trees
 * read their own pictures.
 *
 *   node scripts/swiss2-veg-check.js
 *   SIM_GPU=1 for the machine's GPU instead of SwiftShader. Both show the
 *   faults this guards; Linux only, since it finds the GPU process by ps.
 *
 * FAR TREES IN BANDS. A far tree reads four frames of the impostor atlas
 * by number, and the number came through a varying: not exact, so for
 * every seventeenth frame (the atlas's first column) part of the quad
 * floored a row short and read off the atlas's edge. Measured before the
 * fix, every one of the 16 such frames missed its cell on 6 to 60 percent
 * of the quad, on NVIDIA and SwiftShader alike. Passes when every frame
 * the atlas holds lands in its own cell on every pixel.
 *
 * LEAFLESS TREES. Chrome restarts its GPU process when a frame hangs it
 * under load, and the page's WebGL context comes back empty; three uploads
 * every texture again from its source. The leaf atlases are canvases, a
 * level each, and the mip levels Chrome had left on the GPU came back
 * blank: uploaded again, levels 1 to 4 of both atlases covered nothing,
 * and every tree past a few metres was bare branches. This kills the
 * page's GPU process and passes when every one of the top five levels of
 * both atlases covers a fifth or more as uploaded, before and after, and
 * the same before as after (to 0.01).
 *
 * WINDOWS LIT WHITE. swiss2.js handed the huts' and the lake town's bakes
 * the material table's factory where the table was wanted, so they found
 * no glass on it and three drew their windows with its default, unlit
 * white in the shade. Loads the map and passes when every baked glass
 * and water mesh draws with a physical material.
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

import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};

/* Chrome's GPU process: a descendant of the browser with that type. */
function gpuProcess(pid) {
  const rows = execFileSync('ps', ['-eo', 'pid=,ppid=,args='], { encoding: 'utf8' })
    .split('\n').map((l) => l.trim().split(/\s+/)).filter((r) => r.length > 2);
  const family = new Set([String(pid)]);
  for (let pass = 0; pass < 4; pass += 1) {
    for (const r of rows) {
      if (family.has(r[1])) {
        family.add(r[0]);
      }
    }
  }
  const gpu = rows.find((r) => family.has(r[0]) && r.includes('--type=gpu-process'));
  return gpu ? Number(gpu[0]) : null;
}

/* Each level's cover as uploaded, before and after. Whole, foliage and
 * grass cover a third or more at every level, and lost they cover
 * nothing, so the bar is a fifth. */
const fmt = (c) => Object.entries(c).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(', ');
const whole = (c) => Object.values(c).every((v) => v >= 0.2);

const page = await openPage({ root, width: 320, height: 240, url: '/tests/browser/swiss2-veg-check.html' });
try {
  await page.until('window.__veg', 120000);
  const fr = await page.evaluate('window.__veg.frames()');
  check('every impostor frame is read from its own cell', fr.misses.length === 0,
    fr.misses.length
      ? `${fr.misses.length} of ${fr.count} frames missed: ${fr.misses.slice(0, 6).map((m) => `${m.f} (${m.bad} of ${m.lit} px)`).join(', ')}`
      : `all ${fr.count} frames, every pixel`);

  const before = await page.evaluate('window.__veg.uploaded()');
  check('the leaf atlases are uploaded with their leaves, every level', whole(before), fmt(before));
  const gpu = gpuProcess(page.proc.pid);
  check('the browser has a GPU process to lose', gpu !== null, gpu === null ? 'none found' : `pid ${gpu}`);
  if (gpu !== null) {
    process.kill(gpu, 'SIGKILL');
    await page.until('window.__veg.events.includes("restored")', 60000);
    const after = await page.evaluate('window.__veg.uploaded()');
    const same = Object.keys(before).every((k) => Math.abs(after[k] - before[k]) <= 0.01);
    check('and uploaded the same once the GPU process is restarted', whole(after) && same,
      `${fmt(after)}; context ${(await page.evaluate('window.__veg.events.join(" then ")'))}`);
  }
  check('the atlas page has no page error', page.errors.length === 0, page.errors.slice(0, 3).join(' | ') || 'none');
} finally {
  await page.close();
}

const seed = [`try {
  localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, { graphics: 'high', graphicsAuto: false, sound: false });
  localStorage.setItem(k, JSON.stringify(s));
} catch (e) { /* Storage refused; the run boots on its defaults. */ }`];
const map = await openPage({ root, width: 640, height: 360, url: '/index.html?map=swiss2', seed });
try {
  await map.until('window.__map && window.__map().id === "swiss2" && window.__map().ready', 600000);
  const glass = JSON.parse(await map.evaluate(`JSON.stringify((() => {
    const out = [];
    window.__mapScene().traverse((o) => {
      let p = o;
      while (p.parent && !/^swiss2-|^Scene$/.test(p.name || p.type)) {
        p = p.parent;
      }
      if (o.isMesh && /^village-(glass|water)-/.test(o.name)) {
        out.push({ name: o.name, bake: p.name || p.type, type: o.material ? o.material.type : 'none' });
      }
    });
    return out;
  })())`));
  const wrong = glass.filter((g) => g.type !== 'MeshPhysicalMaterial');
  const town = glass.filter((g) => g.bake === 'swiss2-lake-town');
  check('every baked glass and water mesh is physical, the lake town\'s among them', wrong.length === 0 && town.length > 0,
    `${glass.length} meshes, ${town.length} the lake town's; ${wrong.length ? wrong.map((g) => `${g.name} in ${g.bake} is ${g.type}`).join(', ') : 'none other'}`);
  check('the map has no page error', map.errors.length === 0, map.errors.slice(0, 3).join(' | ') || 'none');
} finally {
  await map.close();
}

const failed = checks.filter((c) => !c.ok).length;
console.log(`${checks.length - failed} of ${checks.length} passed`);
process.exit(failed ? 1 : 0);
