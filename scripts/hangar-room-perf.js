/*
 * hangar-room-perf.js: what the walkable hangar costs a frame, measured on
 * the GPU before the room is wired into the game (docs/HANGAR-ROOM.md, the
 * owner's order: the perf test first). Every tier, every preset, the
 * pilot walking a loop, the aircraft with the most parts on the stand;
 * and the largest room built naively, a mesh per piece, beside the
 * merged one, for what the merge saves. Fails a run over the budget.
 *
 *     SIM_GPU=1 node scripts/hangar-room-perf.js [OUT_DIR] [--frames=300]
 *
 * On this machine run it through ~/.cache/run-check-slot.sh, after
 * nvidia-smi pmon -c 1 says nothing else is drawing on GPU 0: the card is
 * shared with the desktop and a query counts its work too.
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

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { bayCount } from '../src/game/hangarmine.js';
import { ROOM_BUDGET } from '../src/game/hangarroom.js';
import { AIRFRAMES } from '../configs/airframes.js';
import { ITEMS } from '../src/game/economy.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith('--')) || join(tmpdir(), 'hangar-room-perf');
const frames = Number((args.find((a) => a.startsWith('--frames=')) || '--frames=300').slice(9));
mkdirSync(out, { recursive: true });

/* THE BUDGET (src/game/hangarroom.js ROOM_BUDGET), per frame, for the
 * largest tier with the aircraft and the pilot in it. */
const BUDGET = ROOM_BUDGET;
const PRESETS = ['low', 'medium', 'high'];
const TIERS = ['garage', 'workshop', 'airfield', 'field'];

let failed = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`);
  if (!ok) {
    failed += 1;
  }
}

const page = await openPage({ root, width: 1600, height: 900, url: '/tests/browser/hangar-room-perf.html' });
const rows = [];
try {
  await page.until('window.__ready === true', 120000);
  const gpu = await page.evaluate('window.__gpuName()');
  console.log(`renderer ${gpu.renderer}; timer query ${gpu.timer ? 'present' : 'absent'}`);
  const ids = ['cub1400', 'cub1400f', 'bramor2300', 'striker2500', 'tigermoth1803', 'p51d1450', '7inch', 'timber1500f', 'sky1800'];
  const counts = await page.evaluate(`window.__craftCalls(${JSON.stringify(ids)})`);
  counts.sort((a, b) => b.meshes - a.meshes);
  console.log(`aircraft meshes: ${counts.map((c) => `${c.id} ${c.meshes}`).join(', ')}`);
  const craft = counts[0].id;
  console.log(`on the stand: ${craft}, the most meshes of those`);

  const runs = [];
  for (const preset of PRESETS) {
    for (const tier of TIERS) {
      runs.push({ preset, tier, naive: false, craft, frames, shot: true });
    }
    runs.push({ preset, tier: 'airfield', naive: true, craft, frames, shot: false });
  }
  for (const cfg of runs) {
    const r = await page.evaluate(`window.__run(${JSON.stringify(cfg)})`);
    if (r.png) {
      writeFileSync(join(out, `${r.tier}-${r.preset}.png`), Buffer.from(r.png.split(',')[1], 'base64'));
    }
    delete r.png;
    rows.push(r);
  }
  console.log('');
  console.log('preset  tier      build   bays chips calls  tris     tex  geo  prog  gpu ms  p95    cpu ms  Mpx');
  for (const r of rows) {
    const f = (v, n) => String(v).padEnd(n);
    console.log(`${f(r.preset, 8)}${f(r.tier, 10)}${f(r.naive ? 'naive' : 'merged', 8)}${f(r.bays, 5)}${f(r.chart, 6)}${f(r.calls, 7)}${f(r.tris, 9)}${f(r.textures, 5)}${f(r.geometries, 5)}${f(r.programs, 6)}${f(r.gpuMs == null ? 'n/a' : r.gpuMs.toFixed(2), 8)}${f(r.gpuP95 == null ? 'n/a' : r.gpuP95.toFixed(2), 7)}${f(r.cpuMs.toFixed(2), 8)}${(r.pixels / 1e6).toFixed(2)}`);
  }
  console.log('');
  for (const preset of PRESETS) {
    const b = BUDGET[preset];
    /* The largest tier, and the war's field hangar, its own room. */
    for (const tier of ['airfield', 'field']) {
      const t = rows.find((x) => x.preset === preset && x.tier === tier && !x.naive);
      check(`${preset} ${tier}: draw calls`, t.calls <= b.calls, `${t.calls} of ${b.calls}`);
      check(`${preset} ${tier}: triangles`, t.tris <= b.tris, `${t.tris} of ${b.tris}`);
      check(`${preset} ${tier}: textures`, t.textures <= b.textures, `${t.textures} of ${b.textures}`);
      if (gpu.timer && t.gpuMs != null) {
        check(`${preset} ${tier}: GPU ms, median`, t.gpuMs <= b.gpuMs, `${t.gpuMs.toFixed(2)} of ${b.gpuMs}`);
      } else {
        console.log(`skip ${preset} ${tier}: GPU ms: no timer query on this renderer`);
      }
    }
    const r = rows.find((x) => x.preset === preset && x.tier === 'airfield' && !x.naive);
    /* Measured full: every bay with an aircraft and every chip the shop
     * sells on the paint chart (docs/HANGAR-ROOM.md, a hangar that's yours). */
    const chips = ITEMS.filter((it) => it.kind === 'finish' || it.kind === 'decal').length;
    check(`${preset} airfield: measured with every bay and chip`, r.bays === bayCount('airfield') && r.chart === chips, `${r.bays} of ${bayCount('airfield')} bays, ${r.chart} of ${chips} chips`);
    const n = rows.find((x) => x.preset === preset && x.naive);
    check(`${preset}: merging saves draw calls`, r.calls < n.calls, `merged ${r.calls}, naive ${n.calls}`);
  }
  const baked = await page.evaluate(`window.__bakeEvery(${JSON.stringify(AIRFRAMES.map((a) => a.id))})`);
  const bad = baked.filter((b) => b.bays !== 1);
  check('every airframe stands on a bay', bad.length === 0, bad.length ? JSON.stringify(bad.slice(0, 5)) : `${baked.length} airframes`);
  check('no page errors', page.errors.length === 0, page.errors.slice(0, 3).join(' | ') || 'none');
} finally {
  await page.close();
}
writeFileSync(join(out, 'hangar-room-perf.json'), JSON.stringify(rows, null, 1));
console.log(`pictures and numbers in ${out}`);
console.log(failed ? `${failed} failed` : 'all passed');
process.exitCode = failed ? 1 : 0;
