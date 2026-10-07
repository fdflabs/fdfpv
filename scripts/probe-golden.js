/*
 * probe-golden.js: what the shell's harness probes (the window.__* hooks in
 * src/main.js) answer, recorded once and compared on every run.
 *
 * Over a hundred checks read the shell through these hooks, each looking at
 * the few fields it cares about, so a rewrite of the hooks could drop or
 * rename a field that only some rarely run check reads. This drives the real
 * page into fixed states and records the whole answer of every read-only
 * probe, and of the parametric ones at fixed points, so any change in a
 * field's name, type or value shows up here first.
 *
 * States: the title on the Swiss valley, then a flight on the Swiss valley
 * and on the Alps with the craft thrown to a fixed point and held there
 * (__crashThrow with hold), so the pose and everything derived from it is
 * the same on every run, then on the Swiss valley the two seats that freeze
 * the pose (__seatCraft cameraDown and invertedHold).
 *
 * Some answers move between two runs of the same code (frame times, fps,
 * the wall clock, anything rendered at whatever moment the probe lands).
 * Recording takes RECORD_RUNS runs and keeps the paths that agree in all of
 * them as exact values; a path that differed is kept as its type only. A
 * comparison then fails on any stable value that changed, any recorded
 * field that went, any type that changed, and any hook added or removed.
 * A new field is not a failure: adding to a probe breaks no reader.
 *
 *   node scripts/probe-golden.js            compare with the record
 *   node scripts/probe-golden.js --record   write the record (old code!)
 *
 * The record is tests/fixtures/probes-golden.json. Browser: run it through
 * ~/.cache/run-check.sh.
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

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const RECORD = join(root, 'tests', 'fixtures', 'probes-golden.json');
const RECORD_RUNS = 3;
const WAIT = 300000;
const recording = process.argv.includes('--record');

/* No-argument probes that only read. */
const READERS = [
  '__renderStats', '__dynres', '__gpuMemory', '__lastSwap', '__hangarRev', '__craft', '__ground',
  '__intro', '__score', '__obstacles', '__flightMode', '__air', '__contacts', '__colliders',
  '__celCount', '__flightLog', '__ghost', '__craftState', '__crash', '__jelly', '__crashLog',
  '__crashPosts', '__crashWater', '__stepTrace', '__tune', '__pids', '__touch', '__stickPath',
  '__boot', '__nextGate', '__gateTiers', '__quadScreen', '__map', '__maps', '__mapFlows',
  '__mapReplayWater', '__animMs', '__gateScale', '__traffic', '__roofs', '__camGround',
  '__wreckAudit', '__colliderShapes',
];

/* Probes with arguments, at points relative to the map's spawn (sx, sy, sz). */
const PARAMETRIC = [
  ['__trackPoint', '0.25'],
  ['__heightAt', 'sx + 7, sz - 5'],
  ['__surface', 'sx + 7, sz - 5, sy + 50'],
  ['__surfaceMaterial', 'sx + 7, sz - 5, sy + 50'],
  ['__water', 'sx + 40, sz + 40'],
  ['__waterSample', 'sx + 40, sz + 40'],
  ['__nearSolid', 'sx, sy + 1, sz'],
  ['__nearSolid', 'sx + 3, sy + 0.5, sz + 2, 30'],
  ['__colliderBoxes', 'sx, sz, 60'],
  ['__colliderShapes', '{ x: sx, z: sz, r: 60 }'],
  ['__cover', 'sx, sy + 2, sz'],
  ['__aimProbe', 'sx + 10, sy + 2, sz + 10'],
  ['__roofTop', '0, sx, sz'],
  ['__crashSolids', 'sx, sz, 40'],
  ['__hit', 'sx, sy + 2, sz, sx + 30, sy + 2, sz + 30'],
];

function seed(map) {
  const settings = {
    ...seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'interceptor'),
    airframeAsked: true,
    map,
    graphics: 'low',
    graphicsAuto: false,
    crashDamage: true,
    sound: false,
  };
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(settings)});
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.airhint.v2', '1');
  } catch (e) { /* Storage refused; the run boots on defaults and the record says so. */ }`];
}

/*
 * Runs in the page: every probe's answer flattened to path -> spelling.
 * Numbers are spelled to nine significant digits so float noise below that
 * in a derived value does not read as a change; -0, NaN and the infinities
 * are spelled out. Functions are recorded by name, DOM nodes and three.js
 * objects by their kind, and a cycle as a marker. Arrays keep their length
 * and their first eight entries: the long ones (roofs, water bodies) are the
 * map's data passed through, not the probe's.
 */
const FLATTEN = `(() => {
  const out = {};
  const seen = new WeakSet();
  const spell = (v) => {
    if (typeof v === 'number') {
      if (Object.is(v, -0)) return 'n:-0';
      if (!Number.isFinite(v)) return 'n:' + String(v);
      return 'n:' + (Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(9))));
    }
    if (typeof v === 'string') return 's:' + v;
    if (typeof v === 'boolean') return 'b:' + v;
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    if (typeof v === 'function') return 'fn';
    if (typeof v === 'bigint') return 'big:' + v;
    return null;
  };
  const walk = (path, v, depth) => {
    const s = spell(v);
    if (s !== null) { out[path] = s; return; }
    if (v instanceof Node) { out[path] = 'node:' + v.nodeName; return; }
    if (v && v.isObject3D) { out[path] = 'object3d:' + v.type; return; }
    if (seen.has(v)) { out[path] = 'cycle'; return; }
    if (depth > 6) { out[path] = 'deep'; return; }
    seen.add(v);
    if (ArrayBuffer.isView(v)) v = Array.from(v);
    if (Array.isArray(v)) {
      out[path + '.length'] = 'n:' + v.length;
      v.slice(0, 8).forEach((x, i) => walk(path + '[' + i + ']', x, depth + 1));
    } else if (v instanceof Map) {
      out[path + '.size'] = 'n:' + v.size;
    } else if (v instanceof Set) {
      out[path + '.size'] = 'n:' + v.size;
    } else {
      const keys = Object.keys(v);
      if (keys.length === 0) out[path] = 'obj:{}';
      for (const k of keys) walk(path + '.' + k, v[k], depth + 1);
    }
    seen.delete(v);
  };
  const m = window.__map();
  const sx = m.spawn.x, sy = m.spawn.y, sz = m.spawn.z;
  const call = (name, args) => {
    if (typeof window[name] !== 'function') { out[name + '(' + args + ')'] = 'missing'; return; }
    let v;
    try {
      v = new Function('sx', 'sy', 'sz', 'return window.' + name + '(' + args + ');')(sx, sy, sz);
    } catch (e) {
      out[name + '(' + args + ')'] = 'throws:' + e.message;
      return;
    }
    walk(name + '(' + args + ')', v, 0);
  };
  for (const n of READERS) call(n, '');
  for (const [n, a] of PARAMETRIC) call(n, a);
  out['hooks'] = 's:' + Object.keys(window).filter((k) => k.startsWith('__')).sort().join(',');
  return JSON.stringify(out);
})()`.replace('READERS', JSON.stringify(READERS)).replace('PARAMETRIC', JSON.stringify(PARAMETRIC));

const THROW = (m) => `JSON.stringify(window.__crashThrow({
  x: ${m}.spawn.x + 6, y: window.__heightAt(${m}.spawn.x + 6, ${m}.spawn.z + 4) + 3, z: ${m}.spawn.z + 4,
  yaw: 30, pitch: 10, vx: 0, vy: 0, vz: 0, hold: true, fresh: true, showCraft: true,
}))`;

async function sample() {
  const out = {};
  for (const map of ['swiss2', 'alps']) {
    const page = await openPage({ root, width: 1280, height: 720, url: `/index.html?map=${map}`, seed: seed(map) });
    try {
      await page.until('window.__shellReady && window.__map && window.__map().ready', WAIT);
      await page.sleep(1500);
      if (map === 'swiss2') {
        out.title = JSON.parse(await page.evaluate(FLATTEN));
      }
      await page.evaluate('(() => { const s = window.__craftState(); window.__placeCraft(s.worldX, s.worldY, s.worldZ); })()');
      await page.until("window.__mode === 'flight'", 60000);
      await page.evaluate(THROW('window.__map()'));
      await page.sleep(1500);
      out[`flight-${map}`] = JSON.parse(await page.evaluate(FLATTEN));
      /* The two seats that hold the pose (poseLock), so everything after
       * them is as fixed as the throw. */
      for (const kind of map === 'swiss2' ? ['cameraDown', 'invertedHold'] : []) {
        await page.evaluate(`void window.__seatCraft(${JSON.stringify(kind)})`);
        await page.sleep(800);
        out[`seat-${kind}-${map}`] = JSON.parse(await page.evaluate(FLATTEN));
      }
      out[`errors-${map}`] = Object.fromEntries(page.errors.map((e, i) => [i, `s:${String(e).slice(0, 120)}`]));
    } finally {
      await page.close();
    }
  }
  return out;
}

const typeOf = (spelling) => spelling.split(':')[0];

if (recording) {
  const runs = [];
  for (let i = 0; i < RECORD_RUNS; i += 1) {
    console.log(`recording run ${i + 1} of ${RECORD_RUNS}`);
    runs.push(await sample());
  }
  /* A path that moved in any state is treated as moving in every state:
   * three runs agreeing on a frame counter in one world is luck, and the
   * same counter moved in the other. */
  const movers = new Set();
  /* Probes that are clocks and queues by nature: whatever four runs said,
   * their values depend on how many frames the page drew. */
  const CLOCKS = /^__(stickPath|boot|dynres|renderStats|animMs|gpuMemory)\(/;
  /* On the title the camera flies the attract orbit, so whatever reads the
   * camera or the drawn craft there is moving too. */
  const TITLE_CAMERA = /^__(camGround|quadScreen|craftState|ground|traffic|craft)\(/;
  const titleMovers = new Set();
  for (const state of Object.keys(runs[0])) {
    for (const p of new Set(runs.flatMap((r) => Object.keys(r[state] ?? {})))) {
      const vals = runs.map((r) => r[state]?.[p]);
      if (CLOCKS.test(p) || !vals.every((v) => v === vals[0])) movers.add(p);
      if (state === 'title' && TITLE_CAMERA.test(p)) titleMovers.add(p);
    }
  }
  const record = {};
  for (const state of Object.keys(runs[0])) {
    const stable = {};
    const moving = {};
    const paths = new Set(runs.flatMap((r) => Object.keys(r[state] ?? {})));
    for (const p of [...paths].sort()) {
      const vals = runs.map((r) => r[state]?.[p]);
      if (vals.some((v) => v === undefined)) {
        /* A path present in some runs only: an optional field that came
         * and went with timing. Kept out of the record entirely. */
        continue;
      }
      if (movers.has(p) || (state === 'title' && titleMovers.has(p))) {
        moving[p] = typeOf(vals[0]);
      } else {
        stable[p] = vals[0];
      }
    }
    record[state] = { stable, moving };
  }
  writeFileSync(RECORD, `${JSON.stringify(record, null, 1)}\n`);
  const counts = Object.entries(record).map(([s, r]) => `${s}: ${Object.keys(r.stable).length} stable, ${Object.keys(r.moving).length} moving`);
  console.log(`probe-golden: recorded ${RECORD}\n  ${counts.join('\n  ')}`);
  process.exit(0);
}

const record = JSON.parse(readFileSync(RECORD, 'utf8'));
const now = await sample();
let failed = 0;
for (const [state, { stable, moving }] of Object.entries(record)) {
  const got = now[state] ?? {};
  const diffs = [];
  for (const [p, want] of Object.entries(stable)) {
    if (got[p] !== want) diffs.push(`${p}: want ${want}, got ${got[p]}`);
  }
  for (const [p, want] of Object.entries(moving)) {
    if (got[p] === undefined || typeOf(got[p]) !== want) diffs.push(`${p}: want a ${want}, got ${got[p]}`);
  }
  const ok = diffs.length === 0;
  failed += ok ? 0 : 1;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${state}: ${Object.keys(stable).length} stable and ${Object.keys(moving).length} moving paths${ok ? '' : `, ${diffs.length} differ`}`);
  for (const d of diffs.slice(0, 25)) console.log(`        ${d}`);
}
if (failed > 0) {
  console.log(`probe-golden: ${failed} state(s) FAILED`);
  process.exit(1);
}
console.log('probe-golden: ok');
