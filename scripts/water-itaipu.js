/*
 * water-itaipu.js: the flood on Itaipu, the one gate prototype
 * (docs/FLOOD.md): the bed built on the map's ground, still water left
 * still on it, the spillway and the turbines running, and then gate 3
 * torn open.
 *
 *   1. the bed (src/maps/itaipu/water/bed.js): built from the data
 *      folder, every gate with cells either side, no still water on the
 *      spillway's concrete (the reservoir's fill reaches nothing behind a
 *      gate), and the shipped bed (itaipu-flood.json and .bin, which
 *      every client loads) byte for byte the one built now; --write
 *      writes them instead. Everything after runs on the shipped bed.
 *   2. the lake at rest on the real terrain for ten minutes, the gates
 *      shut and the turbines stopped: no current, no level moving
 *   3. the warm up: the turbines running and the spillway's gates shut
 *      (the baseline), from still water, WARM_STEPS steps; the flows in
 *      and out at its end
 *   4. gate 3 opened (the contract's opening: its whole 20 x 21.34 m)
 *      from the warmed state, against the same state left alone: the
 *      gate's discharge against the strips formula by hand, the chute,
 *      the plunge pool and the river's rise at stations down the river,
 *      the time a 10 cm rise reaches each and its speed between them
 *      against the shallow water celerity sqrt(g h) + u, mass, the
 *      state's hash, and the cost
 *
 * Plain Node, but it needs the Itaipu data folder (FDFPV_ITAIPU_DATA), so
 * it is a local check; without the folder it says it skipped. It runs
 * some minutes: --quick runs a shorter warm up and opening (its numbers
 * are not the prototype's).
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

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import { readGround } from './lib/itaipu-ground.js';
import { openingQ } from './lib/flood-scenarios.js';
import { G } from '../src/sim/water/flood.js';
import { CLASS, packBed, unpackBed } from '../src/maps/itaipu/water/bed.js';
import { liveFlood } from '../src/maps/itaipu/water/live.js';
import { HOIST_M_S, openAt } from '../src/share/war/hoist.js';
import {
  DT_MS, OPENING_CD, START, WARM_STEPS, floodBed, loadState, makeFlood, packState,
} from '../src/maps/itaipu/water/flood.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasm = new Uint8Array(await readFile(join(root, 'dist/flood.wasm')));
const QUICK = process.argv.includes('--quick');
const OUT = (process.argv.find((a) => a.startsWith('--out=')) || '').slice(6);
const WRITE = process.argv.includes('--write');
if (WRITE && QUICK) {
  throw new Error('water-itaipu: --write writes the warmed state, which --quick does not reach');
}
const SHIPPED = join(root, 'src/maps/itaipu/water/itaipu-flood');

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

const data = await readGround();
if (!data) {
  console.log('  SKIP  no Itaipu data folder (FDFPV_ITAIPU_DATA); a skip is not a pass');
  process.exit(0);
}
const report = {};

console.log('1. the bed');
const t0 = performance.now();
const built = floodBed(data);
let bed;
{
  const { json, bin } = packBed(built);
  const text = `${JSON.stringify(json)}\n`;
  if (WRITE) {
    await writeFile(`${SHIPPED}.json`, text);
    await writeFile(`${SHIPPED}.bin`, bin);
    console.log(`  wrote ${SHIPPED}.json (${text.length} bytes) and .bin (${bin.length} bytes)`);
  } else if (!existsSync(`${SHIPPED}.bin`)) {
    check('the shipped bed exists (run with --write)', false);
  } else {
    const shipText = await readFile(`${SHIPPED}.json`, 'utf8');
    const shipBin = new Uint8Array(await readFile(`${SHIPPED}.bin`));
    const same = shipText === text && shipBin.length === bin.length && shipBin.every((v, i) => v === bin[i]);
    check('the shipped bed is the bed built now, byte for byte (else run with --write and commit it)', same, `${bin.length} + ${text.length} bytes`);
  }
  bed = unpackBed(JSON.parse(WRITE ? text : await readFile(`${SHIPPED}.json`, 'utf8')), WRITE ? bin : new Uint8Array(await readFile(`${SHIPPED}.bin`)));
}
const { nx, nz, dx } = bed.grid;
{
  const ms = performance.now() - t0;
  const count = (q) => bed.wet.reduce((s, w) => s + (w === q ? 1 : 0), 0);
  const res = bed.names.indexOf('reservoir');
  const riv = bed.names.indexOf('river');
  let wetConcrete = 0;
  for (let k = 0; k < bed.wet.length; k += 1) {
    if (bed.cls[k] === CLASS.concrete && bed.wet[k] >= 0) wetConcrete += 1;
  }
  report.bed = {
    ms, cells: bed.b.length, reservoir: count(res), river: count(riv),
  };
  console.log(`  ${bed.grid.blocks.map((k) => `${k.nx} x ${k.nz} of ${k.dx.toFixed(3)} m`).join(" over ")}, ${bed.b.length} cells, built in ${ms.toFixed(0)} ms: ${count(res)} under the reservoir, ${count(riv)} under the river`);
  check('every gate has cells in front of it and behind it', bed.gates.every((g) => g.up.length >= 4 && g.down.length >= 4),
    bed.gates.map((g) => `${g.up.length}/${g.down.length}`).join(' '));
  check('no still water stands on the spillway\'s concrete: the reservoir reaches nothing behind a gate', wetConcrete === 0, `${wetConcrete} cells`);
}

const cellsWet = (f) => {
  let n = 0;
  const h = f.h();
  for (let k = 0; k < h.length; k += 1) if (h[k] > 1e-4) n += 1;
  return n;
};

console.log('2. the lake at rest on Itaipu');
{
  const rest = await makeFlood(wasm, bed, { turbines: false, spill: 0 });
  const { f } = rest;
  const v0 = f.volume();
  const steps = QUICK ? 3000 : (10 * 60 * 1000) / DT_MS;
  f.step(steps);
  let speed = 0; let level = 0;
  const h = f.h(); const hu = f.hu(); const hv = f.hv();
  for (let k = 0; k < h.length; k += 1) {
    if (!(h[k] > 1e-4)) continue;
    speed = Math.max(speed, Math.hypot(hu[k], hv[k]) / h[k]);
    const q = bed.wet[k];
    level = Math.max(level, q >= 0 ? Math.abs(h[k] + bed.b[k] - bed.level[q]) : Infinity);
  }
  const dv = Math.abs(f.volume() - v0 - rest.boundaryVolume()) / v0;
  check(`${(steps * DT_MS) / 60000} min of still water on the real terrain: fastest current under 1e-6 m/s`, speed < 1e-6, `${speed.toExponential(2)} m/s`);
  check('every wet cell is still water at its body\'s level, to a micrometre', level < 1e-6, `${level.toExponential(2)} m`);
  check('the volume to 1e-12', dv < 1e-12, dv.toExponential(2));
}

/* Warm a start up from still water ({ spill, file }) and write or
 * check its shipped state when it has a file; the flood then holds that
 * state as every client loads it. */
async function warmUp(name, start) {
  const A = await makeFlood(wasm, bed, { spill: start.spill });
  const warm = QUICK ? 6000 : WARM_STEPS;
  const { f } = A;
  const v0 = f.volume();
  const tw = performance.now();
  f.step(warm - 3000);
  const flows = () => ({
    res: A.bounds.filter((x) => x.kind === 'reservoir').reduce((t, x) => t + f.boundVol(x.index), 0),
    riv: A.bounds.filter((x) => x.kind === 'river').reduce((t, x) => t - f.boundVol(x.index), 0),
    tur: A.bounds.filter((x) => x.kind === 'turbines').reduce((t, x) => t + f.boundVol(x.index), 0),
  });
  const r0 = flows();
  f.step(3000);
  const r1 = flows();
  const span = (3000 * DT_MS) / 1000;
  const ms = performance.now() - tw;
  const res = (r1.res - r0.res) / span; const riv = (r1.riv - r0.riv) / span; const tur = (r1.tur - r0.tur) / span;
  const gates = A.links.reduce((t, i) => t + f.linkQ(i), 0);
  const dv = Math.abs(f.volume() - v0 - A.boundaryVolume()) / v0;
  const out = {
    seconds: (warm * DT_MS) / 1000, ms, msPerStep: ms / warm, res, riv, tur, gates, gate3: f.linkQ(A.links[3]), wet: cellsWet(f),
  };
  console.log(`  ${name}: gates ${start.spill} m open; ${(warm * DT_MS) / 1000} s of sim in ${(ms / 1000).toFixed(1)} s (${(ms / warm).toFixed(2)} ms a step, ${cellsWet(f)} wet cells)`);
  console.log(`  over its last ${span} s: the reservoir gave ${res.toFixed(0)} m3/s, the gates pass ${gates.toFixed(0)} (gate 3 ${f.linkQ(A.links[3]).toFixed(0)}), the turbines ${tur.toFixed(0)}, the river lets out ${riv.toFixed(0)}`);
  check(`${name}: the warm up conserves the volume to 1e-9 of it`, dv < 1e-9, dv.toExponential(2));
  if (!QUICK) {
    check(`${name}: the warmed river is steady: it lets out what the gates and the turbines give, to 0.5 %`, Math.abs(riv - tur - gates) < 0.005 * (tur + gates), `${riv.toFixed(0)} out, ${(tur + gates).toFixed(0)} in`);
  }
  check(`${name}: the Courant number stayed under 0.5`, f.stat(1) < 0.5, f.stat(1).toFixed(3));
  const state = packState(f);
  out.stateBytes = state.length;
  if (!start.file) {
    return { A, out };
  }
  const file = join(dirname(SHIPPED), start.file);
  if (WRITE) {
    await writeFile(file, state);
    console.log(`  wrote ${file} (${state.length} bytes)`);
  } else if (QUICK) {
    console.log(`  SKIP  ${name}: the shipped warmed state: --quick does not warm up for as long; a skip is not a pass`);
  } else {
    const shipped = new Uint8Array(await readFile(file));
    const same = shipped.length === state.length && shipped.every((v, i) => v === state[i]);
    check(`${name}: the shipped warmed state is the warm up run now, byte for byte (else run with --write and commit it)`, same, `${state.length} bytes`);
  }
  /* What every client starts from, read back the way they read it. */
  loadState(f, WRITE || QUICK ? state : new Uint8Array(await readFile(file)));
  return { A, out };
}

/* The gates shut is not shipped (every client starts from the spill,
 * START): it is the still river the openings below are measured
 * against, each hole's own water alone. */
console.log('3. the warm ups: the turbines\' river with the gates shut (the openings\' baseline) and the starting water (a typical spill, shipped)');
const shut = await warmUp('shut', { spill: 0, file: null });
const free = await warmUp('start', START);
report.warm = shut.out;
report.free = free.out;
const A = shut.A;

/* The warmed water, kept: each opening starts from it, against a copy
 * of it left alone. */
const warmState = [A.f.h().slice(), A.f.hu().slice(), A.f.hv().slice()];
const fromWarm = async () => {
  const fl = await makeFlood(wasm, bed, {});
  fl.f.h().set(warmState[0]);
  fl.f.hu().set(warmState[1]);
  fl.f.hv().set(warmState[2]);
  return fl;
};
/* Stations down the river, on its thalweg: on each world row the
 * river's lowest bed, read every 2 m across, from just under the
 * chute's lips to some 250 m above the grid's southern edge. A small
 * wave runs down the deep water first, so this is the line its front
 * is timed along. */
const river = bed.names.indexOf('river');
const stations = [-500, -350, -200, -50, 100, 250].map((z) => {
  let best = null;
  for (let x = -1500; x <= 0; x += 2) {
    const k = A.cellAt(x, z);
    if (k >= 0 && bed.wet[k] === river && (!best || bed.b[k] < best.b)) {
      best = { x, z, b: bed.b[k] };
    }
  }
  return { x: best.x, z, depth: bed.level[river] - best.b };
});
const reservoirY = bed.level[bed.names.indexOf('reservoir')];
const RISE = 0.05;
report.open = [];

async function opened(title, opening) {
  console.log(`4. ${title}, against the same water left alone`);
  const L = await fromWarm();
  const B = await fromWarm();
  const g = 3;
  const gate = bed.gates[g];
  const at = B.openGate(g, opening);
  const vB = B.f.volume();
  const below = B.bayGauge(g, 20);
  const stepsAfter = QUICK ? 3000 : 15000;
  const every = 25;
  const arrive = stations.map(() => null);
  const series = [];
  let qSum = 0; let qN = 0; let upSum = 0;
  const tb = performance.now();
  for (let s = every; s <= stepsAfter; s += every) {
    L.f.step(every);
    B.f.step(every);
    const t = (s * DT_MS) / 1000;
    const rise = stations.map((p) => B.at(p.x, p.z).eta - L.at(p.x, p.z).eta);
    rise.forEach((r, k) => {
      if (arrive[k] === null && r > RISE) arrive[k] = t;
    });
    /* Over the last minute: the gauged discharge below the gate and
     * the level in front of it. */
    if (s > stepsAfter - 3000) {
      qSum += B.gaugeQ(below);
      upSum += B.f.linkLevels(B.links[g])[0];
      qN += 1;
    }
    if (s % 500 === 0) series.push({ t, rise });
  }
  const msB = (performance.now() - tb) / (2 * stepsAfter);
  const q = qSum / qN;
  const up = upSum / qN;
  const lip = openingQ(0.61, gate.width, gate.sill, gate.sill + gate.open, reservoirY, -Infinity);
  /* By hand, from the reservoir's still level: the handbook's ogee (Cd
   * 0.74) or sharp edged notch (0.61) through the hole, plus what still
   * runs under the gate's lip beside it, and the shallow water
   * equations' own critical flow over the hole's crest, sqrt(g)
   * (2E/3)^1.5 per metre. */
  const crestTop = Math.max(opening.sill, gate.sill);
  const handbookCd = opening.sill <= gate.sill + 1e-6 ? OPENING_CD : 0.61;
  /* The lip's share only where the baseline runs the gates. */
  const lipRuns = report.warm.gate3 > 0 ? 1 : 0;
  const keepLip = lipRuns * (opening.sill <= gate.sill + gate.open ? (gate.width - Math.min(opening.width, gate.width)) / gate.width : 1);
  const handbook = openingQ(handbookCd, Math.min(opening.width, gate.width), crestTop, opening.sill + opening.height, reservoirY, -Infinity) + keepLip * lip;
  const E = reservoirY - crestTop;
  const critical = Math.sqrt(G) * ((2 * E) / 3) ** 1.5 * Math.min(opening.width, gate.width) + keepLip * lip;
  console.log(`        the hole: ${opening.width} m wide from ${opening.sill} m up ${opening.height} m, ${at.sky ? `open to the sky: ${at.cut} of the gate's ${gate.wall.length} cells cut` : 'under the water: the link\'s'}`);
  console.log(`        gauged below the gate over the last minute: ${q.toFixed(0)} m3/s (it passed ${report.warm.gate3.toFixed(0)} under its lip before), the level in front ${up.toFixed(2)} m`);
  console.log(`        by hand from ${reservoirY} m: the handbook ${handbook.toFixed(0)} m3/s (Cd ${handbookCd}), critical flow over the crest ${critical.toFixed(0)} m3/s; gauged / handbook ${(q / handbook).toFixed(2)}, / critical ${(q / critical).toFixed(2)}`);
  const dv = Math.abs(B.f.volume() - vB - B.boundaryVolume()) / vB;
  check(`${title}: the volume conserved to 1e-9 of it`, dv < 1e-9, dv.toExponential(2));
  check(`${title}: more water passes the gate than its lip did`, q > report.warm.gate3, `${q.toFixed(0)} against ${report.warm.gate3.toFixed(0)} m3/s`);
  const before = stations.map((p) => L.at(p.x, p.z));
  console.log(`        station          still depth  level  depth  current  rise at ${(stepsAfter * DT_MS) / 1000} s  ${RISE * 100} cm arrives`);
  stations.forEach((p, k) => {
    const a = before[k];
    const last = series[series.length - 1].rise[k];
    console.log(`        (${p.x.toFixed(0)}, ${p.z})`.padEnd(24) + `${p.depth.toFixed(1).padStart(5)} m ${a.eta.toFixed(2).padStart(7)} ${a.h.toFixed(1).padStart(5)} m ${Math.sqrt(a.u * a.u + a.v * a.v).toFixed(2).padStart(6)} m/s ${last.toFixed(3).padStart(8)} m   ${arrive[k] === null ? 'not yet' : `${arrive[k].toFixed(1)} s`}`);
  });
  /* Timed from the station the rise reaches first: the water lands
   * where its bay's lip throws it, and the stations above that are
   * reached by its spreading back, not by its front. */
  const legs = [];
  const first = arrive.reduce((m, t, k) => (t !== null && (m < 0 || t < arrive[m]) ? k : m), -1);
  for (let k = Math.max(0, first); k + 1 < stations.length; k += 1) {
    if (arrive[k] === null || arrive[k + 1] === null) continue;
    const p = stations[k]; const r = stations[k + 1];
    const ex = r.x - p.x; const ez = r.z - p.z;
    const dist = Math.sqrt(ex * ex + ez * ez);
    const speed = dist / (arrive[k + 1] - arrive[k]);
    const a = before[k]; const b = before[k + 1];
    const along = ((a.u + b.u) * ex + (a.v + b.v) * ez) / (2 * dist);
    const c = (Math.sqrt(G * a.h) + Math.sqrt(G * b.h)) / 2;
    legs.push({
      from: k, dist, speed, c, along,
    });
    console.log(`        leg ${k}-${k + 1}: ${dist.toFixed(0)} m in ${(arrive[k + 1] - arrive[k]).toFixed(1)} s, ${speed.toFixed(1)} m/s; sqrt(g h) ${c.toFixed(1)} + u ${along.toFixed(1)} = ${(c + along).toFixed(1)} m/s`);
  }
  report.open.push({
    title, opening, sky: at.sky, cut: at.cut, q, up, handbook, critical, stations, arrive, legs, series, msPerStep: msB, hash: B.f.hash(), wet: cellsWet(B.f),
  });
  console.log(`        hash ${B.f.hash()}, ${msB.toFixed(2)} ms a step at ${cellsWet(B.f)} wet cells of ${bed.b.length}`);
}

/* The DAMAGE agent's first opening (the lead, 2 October): a notch 10 m
 * wide through gate 3's leaf from 212.33 m, 8.17 m high; and the whole
 * gate gone. */
await opened('gate 3 notched', { sill: 212.33, width: 10, height: 8.17 });
await opened('gate 3 gone', { sill: bed.gates[3].sill, width: bed.gates[3].width, height: bed.gates[3].height });

console.log('5. the page\'s flood (water/live.js): Free Flight\'s spill, then a war\'s gates and opening');
{
  const files = new Map([
    ['flood.wasm', join(root, 'dist/flood.wasm')],
    ['itaipu-flood.json', `${SHIPPED}.json`],
    ['itaipu-flood.bin', `${SHIPPED}.bin`],
    ['itaipu-flood-warm.bin', `${SHIPPED}-warm.bin`],
  ]);
  const fetchBytes = async (target) => {
    const name = new URL(target).pathname.split('/').pop();
    return new Uint8Array(await readFile(files.get(name)));
  };
  const settle = async (live) => {
    for (let k = 0; k < 200 && live.stats().state === 'loading'; k += 1) {
      await new Promise((r) => { setTimeout(r, 20); });
    }
  };
  const live = liveFlood({ fetchBytes, now: () => performance.now() });
  await settle(live);
  let st = live.stats();
  check(`Free Flight: the spill loads with the map, every gate ${START.spill} m open`, st.state === 'ready' && st.mode === 'free' && st.lips.every((v) => v === START.spill), `${st.state} ${st.mode} lips ${st.lips.join(',')}`);
  live.advance(60000);
  check('and with nothing happening it is never stepped', live.stats().step === 0, `step ${live.stats().step}`);
  /* A war: a gate state (gate 5 driven to 3 m at AT, then to 6 m a
   * minute later, from wherever its leaf has got) and the DAMAGE agent's
   * first opening through gate 3, moved up 0.5 m with its leaf 40 s on. */
  const gate = bed.gates[3];
  const [ox, oz] = bed.frame.at(gate.middle + 2, -5.75);
  const AT = 600000;
  const entries = [{ gate: 'gate-5', at: AT, open_m: 3 }, { gate: 'gate-5', at: AT + 60000, open_m: 6 }];
  live.setGates(entries);
  live.open({
    id: 'gate-3', target: 'gate-3', kind: 'gate', at: AT + 2000, sill: [ox, 212.33, oz], width_m: 10, height_m: 8.17, normal: [0, 0, 1], upstream_cell: null, downstream_cell: null,
  });
  live.open({
    id: 'intake-4', target: 'intake-4', kind: 'intake', at: AT + 3000, sill: [0, 180, 0], width_m: 5, height_m: 5, normal: [0, 0, 1], upstream_cell: null, downstream_cell: null,
  });
  await settle(live);
  st = live.stats();
  check(`a war starts from the same water, every gate ${START.spill} m open, not reloaded`, st.state === 'ready' && st.mode === 'war' && st.lips.every((v) => v === START.spill), `${st.state} ${st.mode} lips ${st.lips.join(',')}`);
  let frames = 0;
  const end = AT + 1000 + 120000;
  /* The most gate 5's lip moved in one step, m. */
  let jump = 0;
  let prev = null;
  let moved = false;
  for (let t = AT; t <= end; t += 1000 / 60) {
    if (!moved && t >= AT + 40000) {
      live.open({
        id: 'gate-3', target: 'gate-3', kind: 'gate', at: AT + 40000, sill: [ox, 212.83, oz], width_m: 10, height_m: 8.17, normal: [0, 0, 1], upstream_cell: null, downstream_cell: null,
      });
      moved = true;
    }
    const before = live.stats().step;
    live.advance(t);
    const now = live.flood().lips()[5];
    const steps = live.stats().step - before;
    if (prev !== null && steps > 0) jump = Math.max(jump, Math.abs(now - prev) / steps);
    prev = now;
    frames += 1;
  }
  st = live.stats(end);
  const flows = live.flows();
  const fl = live.flood();
  console.log(`        ${frames} frames of ${3} ms: step ${st.step}, ${st.behind} steps behind the room; lips ${st.lips.join(',')}; unplaced: ${st.unplaced.join(', ') || 'none'}`);
  console.log(`        flows: ${flows.map((x) => `${x.id} ${x.q.toFixed(0)} m3/s`).join('; ')}; gate 5 passes ${fl.f.linkQ(fl.links[5]).toFixed(0)} m3/s`);
  /* The last step stood for origin (AT) + (step - 1) DT_MS. */
  const law = openAt(entries, 'gate-5', AT + (st.step - 1) * DT_MS);
  check('gate 5\'s lip is hoist.js\'s law at the room time of the last step, to the bit', st.lips[5] === law && law > 2.5 && law < 6,
    `lip ${st.lips[5]} m, openAt ${law} m`);
  check('and it never jumped: at most the hoist\'s rate a step', jump <= (HOIST_M_S * DT_MS) / 1000 + 1e-12,
    `${jump.toExponential(3)} m a step, the rate ${((HOIST_M_S * DT_MS) / 1000).toExponential(3)}`);
  check('the water runs under gate 5 more than under a 2 m gate', fl.f.linkQ(fl.links[5]) > fl.f.linkQ(fl.links[6]), `${fl.f.linkQ(fl.links[5]).toFixed(0)} against gate 6's ${fl.f.linkQ(fl.links[6]).toFixed(0)} m3/s`);
  const hole = fl.holes().find((o) => o.g === 3);
  const b = fl.f.bed();
  const under = gate.wall.filter((c) => Math.abs(c.u - hole.across) <= hole.width / 2 && b[c.k] < Math.max(hole.sill, c.floor) - 1e-9);
  check('gate 3\'s hole moved with its leaf: one hole at the moved sill, nothing cut under it', fl.holes().length === 1 && hole.sill === 212.83 && under.length === 0,
    `${fl.holes().length} holes, sill ${hole.sill}, ${under.length} cells under it`);
  check('the notch is applied to gate 3 and its flow is there for the sound', flows.length === 1 && flows[0].id === 'gate-3' && flows[0].q > 0);
  check('the intake, which has no place yet, is counted and not dropped', st.unplaced.includes('intake-4'));
  live.setGates(null);
  await settle(live);
  st = live.stats();
  check('no war again: Free Flight\'s spill', st.mode === 'free' && st.lips.every((v) => v === START.spill) && st.step === 0, `${st.mode} step ${st.step}`);
  report.live = { frames, ...st };
}

if (OUT) {
  await writeFile(OUT, JSON.stringify(report, null, 1));
}
console.log(`\nwater-itaipu: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
