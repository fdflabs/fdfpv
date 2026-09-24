/*
 * scene-fingerprint.js: one line that says whether a map's scene changed.
 *
 * WHY. The swiss2 loop changes the photographic valley and must leave the
 * cel alps map exactly as it was, and "exactly" is not something a
 * screenshot settles: traffic and cattle are at another place every run.
 * Rounds 1 and 2 of docs/SWISS2-LOOP.md each rebuilt a fingerprint in the
 * page by hand, and round 1's hash could not be repeated because its
 * script was never kept. This is that fingerprint, kept.
 *
 *     SIM_GPU=1 node scripts/scene-fingerprint.js [MAP]     (default alps)
 *
 * Builds MAP at High, then hashes, for every mesh, line and point set in
 * its scene: the object's name and type, every geometry attribute's count
 * and a weighted sum of its values, the index count, and each material's
 * type, colour and program cache key; and separately the pixels of every
 * canvas a material paints from (the cel ground is one). What moves at run
 * time (instance matrices, object positions) is left out, so two builds of
 * an unchanged map agree. Then reads __renderStats from a few fixed
 * cameras, which differ by a call or a few hundred triangles between two
 * runs of the same tree (the traffic is at another clock). Run it on the
 * base and on the change, and compare the lines.
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

import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const map = process.argv[2] || 'alps';

/* The same valley seen from the strip, above the village, up the valley
 * and at the lake: world metres, camera then look at, 44 degree lens. */
const CAMS = [
  [0, 2, 40, 0, 3, -100],
  [-120, 22, 150, -185, 4, 112],
  [0, 300, -200, 0, 80, -1500],
  [420, 200, 1650, 173, 0, 2250],
];

const FP = `(() => {
  const hash = (s, h = 0x811c9dc5) => {
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  };
  const parts = [];
  const mats = new Set();
  const canvases = new Set();
  let meshes = 0;
  window.__mapScene().traverse((o) => {
    if (!o.isMesh && !o.isLine && !o.isPoints) {
      return;
    }
    meshes += 1;
    const g = o.geometry;
    const a = [];
    for (const k of Object.keys(g.attributes).sort()) {
      const arr = g.attributes[k].array;
      let sum = 0;
      for (let i = 0; i < arr.length; i += 1) {
        sum += arr[i] * ((i % 7) + 1);
      }
      a.push(k + ':' + g.attributes[k].count + ':' + sum.toFixed(1));
    }
    a.push('index:' + (g.index ? g.index.count : -1));
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      mats.add(m);
      a.push(m.type + ':' + (m.color ? m.color.getHexString() : '-') + ':' + m.customProgramCacheKey());
      if (m.map && m.map.image instanceof HTMLCanvasElement) {
        canvases.add(m.map.image);
      }
    }
    parts.push(o.name + '|' + o.type + '|' + a.join(','));
  });
  parts.sort();
  let canvas = 0x811c9dc5;
  for (const c of canvases) {
    const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let s = '';
    for (let i = 0; i < px.length; i += 4093) {
      s += px[i] + ',';
    }
    canvas = hash(c.width + 'x' + c.height + ':' + s, canvas);
  }
  return JSON.stringify({ fp: hash(parts.join('\\n')).toString(16), canvas: canvas.toString(16), meshes, materials: mats.size });
})()`.replace(/\s*\n\s*/g, " ");

const out = await mkdtemp(join(tmpdir(), 'fdfpv-fp-'));
const steps = [
  `until:window.__map && window.__map().id === ${JSON.stringify(map)} && window.__map().ready`,
  'eval:(document.getElementById("ui").style.display = "none", "")',
  'wait:2500',
  `eval:${FP}`,
];
for (const c of CAMS) {
  steps.push(
    `eval:(window.__setCam(${c.join(',')}, 44), "")`,
    'wait:2500',
    `eval:JSON.stringify(window.__renderStats())`,
  );
}
const run = spawnSync('node', [
  join(root, 'scripts/shots.js'),
  `--out=${out}`,
  '--w=1600',
  '--h=900',
  '--graphics=high',
  '--airframe=sky1800',
  `--url=/index.html?map=${map}`,
  ...steps,
], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
await rm(out, { recursive: true, force: true });
if (run.status !== 0) {
  process.stderr.write(run.stdout + run.stderr);
  throw new Error(`shots.js exited ${run.status}`);
}
const values = run.stdout.split('\n')
  .filter((l) => l.startsWith('eval ') && !l.includes('style.display') && !l.includes('__setCam('))
  .map((l) => JSON.parse(JSON.parse(l.slice(l.lastIndexOf(' = ') + 3))));
const [fp, ...stats] = values;
console.log(`${map}: fp ${fp.fp}, canvas ${fp.canvas}, ${fp.meshes} meshes, ${fp.materials} materials`);
console.log(`${map}: calls/triangles ${stats.map((s) => `${s.calls}/${s.triangles}`).join(' ')}`);
