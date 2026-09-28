/*
 * edge-course.js: the Edge 540 round an air race course, through the real
 * page, on swiss2 and on the Alps.
 *
 *     SIM_GPU=1 node scripts/edge-course.js [OUT_DIR] [--map=swiss2|alps]
 *
 * docs/EDGE-STAGE1.md: the Edge is here because it was the Red Bull Air
 * Race's aircraft, and the builder has the air race's pylon pair (two 25 m
 * inflatable cones, their axes 50 m apart, src/trackbuilder/elements.js).
 * On each map, in the order a pilot would do it:
 *
 *   1. Seat the Edge, fly, press B, and stand six pylon pairs on the
 *      valley floor with the builder's own controls (the piece from the
 *      hotbar, a left click on the ground), a stadium: three down one
 *      straight and three back up the other, each pair's opening along the
 *      way it is flown.
 *   2. B flies the track: the run starts in the air before the start pair.
 *   3. A pilot in the page flies the lap on the sticks at air race speed,
 *      the Edge's default tune (Acro), 10 m over the grass between the
 *      cones, the throttle holding the speed asked; the lap closes on the
 *      race's own scoring.
 *   4. What is checked: the lap closes through all six pairs; the mean
 *      speed over it is an air race pace for this aircraft, three quarters
 *      of its level top speed or more; no pylon was touched (the jelly log)
 *      and it never crashed; and the page threw nothing.
 *
 * No board is needed: nothing is published. Pictures land in OUT_DIR
 * (tmp/edge-course by default); they are evidence for one look, not for
 * the repository.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { B, hold, key, lookAlong, placeHere, takeMouse } from '../tests/lib/buildkeys.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const opts = {};
const positional = [];
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([a-z-]+)(?:=(.*))?$/);
  if (m) {
    opts[m[1]] = m[2] === undefined ? true : m[2];
  } else {
    positional.push(a);
  }
}
const outDir = resolve(positional[0] || join(root, 'tmp', 'edge-course'));
await mkdir(outDir, { recursive: true });
const EDGE = airframeById('edge1524');
/* Air race pace for this aircraft: its level top speed's three quarters. */
const RACE_SPEED = 26;
const MIN_MEAN = 0.75 * EDGE.topSpeed;
/* The stadium: straights LEG m long with pairs at their start, middle and
 * end, WIDE m apart, flown HEIGHT m over the grass, the lap's turns half
 * circles of WIDE / 2. */
const LEG = 300;
const WIDE = 140;
const HEIGHT = 18;
/* How far the lap keeps from every solid thing in the map. */
const CLEAR = 8;

let failed = 0;
function say(ok, what) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) {
    failed += 1;
  }
}
const f1 = (x) => Number(x).toFixed(1);

function seed(airframe) {
  const seated = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, airframe);
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(seated)});
    s.airframeAsked = true;
    s.fpsCap = 0;
    localStorage.setItem(k, JSON.stringify(s));
  } catch (e) { /* storage refused; the checks below will say so */ }
  navigator.getGamepads = () => [];`];
}

async function shot(page, name) {
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 }, page.sessionId);
  const path = join(outDir, `${name}.jpg`);
  await writeFile(path, Buffer.from(data, 'base64'));
  console.log(`  shot ${path}`);
}

/* A piece stood on the ground at P, its opening flown along T, placed from
 * a camera behind and above it looking down at P, map-plane-check.js's way
 * of standing a gate on the water. */
async function stand(page, type, P, T) {
  await hold(page, type);
  const back = 40;
  const up = 20;
  await lookAlong(page, [P[0] - T[0] * back, P[1] + up, P[2] - T[2] * back], Math.atan2(-T[0], -T[2]), -Math.atan2(up, back));
  await placeHere(page, { air: false });
}

/*
 * The pilot in the page, map-plane-check.js's planePilot: L1 guidance on
 * the roll stick (Park, Deyst and How, 2004), a pitch hold for the path's
 * height, the throttle for the speed. Its gains are for a stick that asks
 * a rate, which is the Edge's Acro.
 */
function pilot(path, speed) {
  return `(() => {
    const P = ${JSON.stringify(path)};
    const N = P.length;
    const cl = (v, a, b) => Math.max(a, Math.min(b, v));
    let k = 0;
    let traceAt = 0;
    window.__pilot = true;
    window.__pilotTrace = [];
    window.__speeds = [];
    const step = () => {
      if (!window.__pilot) { window.__stick(); return; }
      const c = window.__craftState();
      if (!c || c.mode !== 'flight' || !c.fwd || !c.up) { requestAnimationFrame(step); return; }
      const pitch = Math.asin(cl(c.fwd.y, -1, 1));
      const right = { x: c.fwd.y * c.up.z - c.fwd.z * c.up.y, y: c.fwd.z * c.up.x - c.fwd.x * c.up.z, z: c.fwd.x * c.up.y - c.fwd.y * c.up.x };
      const bank = Math.asin(cl(-right.y, -1, 1));
      const pos = [c.worldX, c.worldY, c.worldZ];
      let best = k;
      let bestD = Infinity;
      for (let j = k; j < Math.min(N, k + 80); j += 1) {
        const d = Math.hypot(P[j][0] - pos[0], P[j][2] - pos[2]);
        if (d < bestD) { bestD = d; best = j; }
      }
      k = best;
      let a = k;
      while (a < N - 1 && Math.hypot(P[a][0] - pos[0], P[a][2] - pos[2]) < 45) { a += 1; }
      const aim = P[a];
      const v = c.vel || { x: 0, y: 0, z: 0 };
      const vh = Math.hypot(v.x, v.z) || 1;
      const dx = aim[0] - pos[0];
      const dz = aim[2] - pos[2];
      const dl = Math.hypot(dx, dz) || 1;
      const eta = Math.atan2((v.x * dz - v.z * dx) / (vh * dl), (v.x * dx + v.z * dz) / (vh * dl));
      const acc = 2 * vh * vh * Math.sin(cl(eta, -Math.PI / 2, Math.PI / 2)) / Math.max(dl, 5);
      const bankT = cl(Math.atan(acc / 9.81), -1.1, 1.1);
      const hT = P[k][1];
      const pitchT = cl(0.02 + 0.04 * (hT - pos[1]) - 0.06 * v.y + 0.10 * Math.abs(bank), -0.3, 0.35);
      const thr = cl(0.75 + 0.10 * (${speed} - c.speed) + 0.4 * Math.abs(bank), 0.2, 1);
      const s = [cl(2.0 * (bankT - bank), -1, 1), cl(2.5 * (pitchT - pitch), -1, 1), 0, thr];
      window.__speeds.push(c.speed);
      const simT = window.__crash().simT;
      if (simT - traceAt > 0.5) {
        traceAt = simT;
        window.__pilotTrace.push([+simT.toFixed(1), +pos[0].toFixed(1), +pos[1].toFixed(1), +pos[2].toFixed(1), +c.speed.toFixed(1), k, window.__race().next,
          +(bank * 57.3).toFixed(0), +(bankT * 57.3).toFixed(0), +(pitch * 57.3).toFixed(0), +(window.__heightAt(pos[0], pos[2])).toFixed(1)]);
      }
      window.__pilotAt = k;
      window.__stick(s[0], s[1], s[2], s[3]);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return true;
  })()`;
}

/*
 * The lap as a stadium from the aircraft `here` along F: the pairs at the
 * first straight's start, middle and end (flown along F) and back down the
 * second, `side` m across (flown against it); the path through each
 * pair's opening at HEIGHT over the pair's ground, `bases` (six heights,
 * or null for a first pass that only wants the points), with the two
 * turns half circles, sampled at a metre.
 */
function stadium(here, F, side, d0, bases) {
  const Rt = [-F[2], 0, F[0]];
  const at = (fwd, s) => [here.worldX + F[0] * fwd + Rt[0] * s, here.worldZ + F[2] * fwd + Rt[2] * s];
  const b = bases ?? [0, 0, 0, 0, 0, 0];
  const y = b.map((g) => g + HEIGHT);
  const hA = (f) => y[0] + (y[2] - y[0]) * Math.max(0, Math.min(1, (f - d0) / LEG));
  const hB = (f) => y[5] + (y[3] - y[5]) * Math.max(0, Math.min(1, (f - d0) / LEG));
  const r = Math.abs(side) / 2;
  const sg = Math.sign(side);
  const pts = [];
  const P = (fwd, s, h) => { const [x, z] = at(fwd, s); return [x, h, z]; };
  const idx = [];
  const mark = () => idx.push(pts.length - 1);
  for (let f = d0 - 40; f < d0 + LEG + 20; f += 1) {
    pts.push(P(f, 0, hA(f)));
    if (f === d0 || f === d0 + LEG / 2 || f === d0 + LEG) mark();
  }
  for (let a = 0; a < Math.PI; a += 1 / r) pts.push(P(d0 + LEG + 20 + r * Math.sin(a), side / 2 - sg * r * Math.cos(a), Math.max(y[2], y[3])));
  for (let f = d0 + LEG + 20; f > d0 - 20; f -= 1) {
    pts.push(P(f, side, hB(f)));
    if (f === d0 + LEG || f === d0 + LEG / 2 || f === d0) mark();
  }
  for (let a = 0; a < Math.PI; a += 1 / r) pts.push(P(d0 - 20 - r * Math.sin(a), side / 2 + sg * r * Math.cos(a), Math.max(y[5], y[0])));
  for (let f = d0 - 20; f <= d0 + 40; f += 1) pts.push(P(f, 0, hA(f)));
  const stations = idx.map((i, k) => ({
    index: i, x: pts[i][0], z: pts[i][2], ground: b[k], T: k < 3 ? [F[0], 0, F[2]] : [-F[0], 0, -F[2]],
  }));
  return { pts, stations };
}

async function course(map) {
  console.log(`\nthe ${EDGE.name} round six pylon pairs on ${map}`);
  const page = await openPage({ root, width: 1280, height: 720, url: `/index.html?map=${map}`, seed: seed(EDGE.id) });
  try {
    await page.until('!!window.__shellReady', 240000);
    await page.until(`window.__map && window.__map().ready && window.__map().id === ${JSON.stringify(map)}`, 300000);
    await page.until('!!window.__build', 60000);
    await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until("window.__craftState().mode === 'flight'", 120000);
    await page.sleep(600);
    const here = await page.evaluate('window.__craftState()');
    const run = await page.evaluate('window.__craft().run');
    say(run === EDGE.id, `the ${EDGE.short} is seated and flying: ${run}`);
    await key(page, 'KeyB');
    await page.until(`${B('.state')} === 'building'`, 20000);
    await takeMouse(page);

    /*
     * The stadium laid along the valley from where the aircraft stands:
     * straights along its nose or against it, the second WIDE m to either
     * side, starting 60 m out or further, the first layout whose whole lap
     * flown HEIGHT m over the grass keeps CLEAR m from every tree, roof and
     * wall the map has (its colliders), and whose grass under the lap
     * stays under the lap by 5 m.
     */
    const F0 = [here.fwd.x, 0, here.fwd.z];
    const fl = Math.hypot(F0[0], F0[2]);
    let layout = null;
    for (const dirSign of [1, -1]) {
      for (const side of [WIDE, -WIDE]) {
        for (let d0 = 60; d0 <= 660 && !layout; d0 += 100) {
          const F = [dirSign * F0[0] / fl, 0, dirSign * F0[2] / fl];
          const cand = stadium(here, F, side, d0, null);
          const ground = await page.evaluate(`${JSON.stringify(cand.pts.map((q) => [q[0], q[2]]))}.map(([x, z]) => window.__heightAt(x, z))`);
          const bases = cand.stations.map((st) => ground[st.index]);
          const lap = stadium(here, F, side, d0, bases);
          const gaps = await page.evaluate(`${JSON.stringify(lap.pts.filter((_, i) => i % 3 === 0))}.map(([x, y, z]) => window.__nearSolid(x, y, z, ${CLEAR}))`);
          const low = lap.pts.reduce((m, q, i) => Math.min(m, q[1] - ground[i]), Infinity);
          const blocked = gaps.filter((g) => g !== null && g < CLEAR).length;
          console.log(`    layout ${dirSign > 0 ? 'ahead' : 'behind'} ${side} ${d0}: ${blocked} of ${gaps.length} points within ${CLEAR} m of something, the grass ${low.toFixed(1)} m under at the lowest`);
          if (blocked === 0 && low >= 5) {
            layout = { F, side, d0, lap, bases };
          }
        }
      }
    }
    say(Boolean(layout), layout ? `a clear stadium ${layout.d0} m out, the second straight ${layout.side} m across` : 'no clear stadium found near the start');
    if (!layout) {
      return;
    }
    for (const st of layout.lap.stations) {
      await stand(page, 'pylonPair', [st.x, st.ground, st.z], st.T);
    }
    const doc = await page.evaluate(B('.doc'));
    const gates = await page.evaluate(B('.gates'));
    say(doc.elements.length === 6 && doc.elements.every((e) => e.type === 'pylonPair'), `six pylon pairs stood on the valley floor: ${doc.elements.map((e) => e.type).join(', ')}`);
    const warnings = await page.evaluate(B('.warnings'));
    say(!warnings.some((w) => w.code === 'small' || w.code === 'blocked'), `none too small for the ${EDGE.short} or buried${warnings.length ? `; the rest: ${warnings.map((w) => w.code).join(', ')}` : ''}`);
    await shot(page, `${map}-1-built`);
    const pts = layout.lap.pts;

    /* 2. Fly it. */
    await key(page, 'KeyB');
    await page.until(`${B('.state')} === 'testing'`, 20000).catch(() => {});
    await page.until("window.__craftState().mode === 'flight'", 60000);
    await page.sleep(300);
    const c0 = await page.evaluate('window.__craftState()');
    const g0 = gates[0].centre;
    say(await page.evaluate(`${B('.state')} === 'testing'`), `B flies the track: the run starts ${f1(Math.hypot(c0.worldX - g0[0], c0.worldZ - g0[2]))} m before the start pair`);
    await page.evaluate(pilot(pts, RACE_SPEED));
    await page.evaluate('window.__drawOff(true)');
    const t0 = (await page.evaluate('window.__crash()')).simT;
    await page.until(`window.__race().laps.length >= 1 || window.__craftState().crashed || window.__crash().simT - ${t0} > 120`, 1800000).catch(() => {});
    await page.evaluate('window.__drawOff(false)');
    const r3 = await page.evaluate('({ laps: window.__race().laps.slice(), best: window.__race().bestLapMs(), c: window.__craftState(), at: window.__pilotAt, next: window.__race().next, trace: window.__pilotTrace, speeds: window.__speeds, jelly: window.__jelly() })');
    await page.evaluate('window.__pilot = false');
    await shot(page, `${map}-2-flown`);
    const mean = r3.speeds.length ? r3.speeds.reduce((a, b) => a + b, 0) / r3.speeds.length : 0;
    say(r3.laps.length >= 1 && r3.best != null, `a lap through all six pairs: ${r3.best != null ? (r3.best / 1000).toFixed(2) : 'none'} s, ${((pts.length - 100) / 1000).toFixed(2)} km`);
    say(mean >= MIN_MEAN, `at air race pace: a mean ${f1(mean)} m/s against ${f1(MIN_MEAN)}, three quarters of its ${EDGE.topSpeed} m/s top`);
    say(!r3.c.crashed && r3.jelly.whacks.length === 0, `no pylon touched and no crash: ${r3.jelly.whacks.length} touches, crashed ${r3.c.crashed}`);
    if (!r3.laps.length) {
      console.log(`  the pilot reached path point ${r3.at} of ${pts.length}, next gate ${r3.next}, at ${f1(r3.c.worldX)}, ${f1(r3.c.worldY)}, ${f1(r3.c.worldZ)}, ${f1(r3.c.speed)} m/s`);
      console.log('  the flight, every half second: [simT, x, y, z, speed, path point, next gate, bank, bank wanted, pitch, ground]');
      for (const row of r3.trace.filter((_, i) => i % 2 === 0)) {
        console.log(`    ${JSON.stringify(row)}`);
      }
    }
    const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED|Failed to load resource|network:/.test(e));
    say(errs.length === 0, `no page errors${errs.length ? `: ${errs.slice(0, 3).join(' | ')}` : ''}`);
  } finally {
    await page.close();
  }
}

for (const map of opts.map ? [opts.map] : ['swiss2', 'alps']) {
  await course(map);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
