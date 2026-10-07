/*
 * lock-check.js: the next gate's target mark (index.html .lock), drawn by
 * src/main.js updateTargetLock, against a record.
 *
 * The mark is the bracket round the next gate's opening when it is in
 * frame, the chevron on the frame edge pointing at it when it is not, red
 * from the wrong side and faded out as the pilot closes on it. All of
 * that is arithmetic over the
 * camera and the canvas, and its only output is the DOM the HUD writes,
 * so this parks the harness camera (window.__setCam) at fixed poses about
 * gates of a seated course and records what the mark element says at
 * each: its class, its place, its opacity, the bracket's size, the
 * chevron's heading and the range label.
 *
 *   node scripts/lock-check.js            compare with the record
 *   node scripts/lock-check.js --record   write the record (old code!)
 *
 * The record is tests/fixtures/lock-golden.json. Browser: run it through
 * ~/.cache/run-check.sh.
 *
 * Not covered: the mark off during a crashflip or turtle recovery (no
 * harness hook starts either with the camera parked); screens other than
 * flight, which frameBody switches off before this code runs; and the
 * in-frame mark withheld for a virtual gate (a flag), because no course
 * provider sets targetAim's `virtual` today (src/builder/buildmode.js
 * declares it false and never writes it).
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
import { markAirHintSeen } from '../src/ui/settings.js';
import { writeShareImport } from '../src/share/session.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const RECORD = join(root, 'tests', 'fixtures', 'lock-golden.json');
const COURSE = join(root, 'tests', 'fixtures', 'map-track-v4.json');
const WAIT = 300000;
const recording = process.argv.includes('--record');

/*
 * Seated the way My tracks' Play seats a built track (scripts/shots.js
 * --course), on the quad, with the first run questions answered. The
 * storage writes are made by the shell's own writers against a stand in
 * store and replayed in the page, so the keys are the shell's, not copies.
 */
function seed() {
  const doc = JSON.parse(readFileSync(COURSE, 'utf8'));
  const writes = {};
  globalThis.localStorage = {
    getItem: () => null,
    setItem: (k, v) => { writes[k] = String(v); },
    removeItem: () => {},
  };
  const seated = writeShareImport({ id: doc.id, name: doc.name, document: doc, local: true });
  markAirHintSeen();
  delete globalThis.localStorage;
  if (!seated || Object.keys(writes).length !== 2) {
    throw new Error(`the course did not seat: ${Object.keys(writes)}`);
  }
  const settings = {
    ...seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'interceptor'),
    airframeAsked: true,
    map: 'track',
    graphics: 'low',
    graphicsAuto: false,
    sound: false,
  };
  return [`try {
    const w = ${JSON.stringify(writes)};
    for (const k of Object.keys(w)) localStorage.setItem(k, w[k]);
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(settings)});
    localStorage.setItem(k, JSON.stringify(s));
  } catch (e) { /* Storage refused; the run boots on defaults and the compare says so. */ }`];
}

/*
 * The poses, in the gate's own terms so the record does not care where
 * the course sits: `gate` is the race index (tests/fixtures/map-track-v4
 * flies a gate, a double stack, a wide gate and a pylon), `back` metres out from the opening's centre along the
 * side it is flown from (negative: the far side), `up` metres above it,
 * then the camera looks at the centre turned `yaw` degrees right and
 * `pitch` degrees up. `pads` makes the pilot a radio pilot, whose bottom
 * band is the corner instruments alone.
 */
const POSES = [
  { id: 'ahead-far', gate: 0, back: 24, up: 0, yaw: 0, pitch: 0, fov: 90 },
  { id: 'ahead-mid', gate: 0, back: 15, up: 1, yaw: 4, pitch: -3, fov: 90 },
  { id: 'ahead-fading', gate: 0, back: 9, up: 0, yaw: 0, pitch: 0, fov: 90 },
  { id: 'ahead-close', gate: 0, back: 6.3, up: 0, yaw: 0, pitch: 0, fov: 90 },
  { id: 'ahead-inside-release', gate: 0, back: 4, up: 0, yaw: 0, pitch: 0, fov: 90 },
  { id: 'ahead-wide-lens', gate: 0, back: 20, up: 2, yaw: 10, pitch: 5, fov: 120 },
  { id: 'ahead-narrow-lens', gate: 0, back: 40, up: 0, yaw: -3, pitch: 0, fov: 60 },
  { id: 'ahead-touching', gate: 0, back: 0.15, up: 0, yaw: 0, pitch: 0, fov: 90 },
  { id: 'off-right', gate: 0, back: 20, up: 0, yaw: -70, pitch: 0, fov: 90 },
  { id: 'off-left', gate: 0, back: 20, up: 0, yaw: 70, pitch: 0, fov: 90 },
  { id: 'off-top', gate: 0, back: 20, up: 0, yaw: 0, pitch: -50, fov: 90 },
  { id: 'off-bottom', gate: 0, back: 20, up: 0, yaw: 0, pitch: 42, fov: 90 },
  { id: 'near-bottom', gate: 0, back: 20, up: 0, yaw: 0, pitch: 18, fov: 90 },
  { id: 'band-bottom', gate: 0, back: 20, up: 0, yaw: 0, pitch: 29, fov: 90 },
  { id: 'band-bottom-radio', gate: 0, back: 20, up: 0, yaw: 0, pitch: 29, fov: 90, pads: true },
  { id: 'near-bottom-radio', gate: 0, back: 20, up: 0, yaw: 0, pitch: 18, fov: 90, pads: true },
  { id: 'off-bottom-radio', gate: 0, back: 20, up: 0, yaw: 0, pitch: 42, fov: 90, pads: true },
  { id: 'near-corner', gate: 0, back: 18, up: 3, yaw: 37, pitch: 22, fov: 90 },
  { id: 'behind-left', gate: 0, back: 20, up: 0, yaw: 150, pitch: 0, fov: 90 },
  { id: 'behind-right', gate: 0, back: 20, up: 0, yaw: -130, pitch: 10, fov: 90 },
  { id: 'behind-dead', gate: 0, back: 20, up: 0, yaw: 180, pitch: 0, fov: 90 },
  { id: 'far-side', gate: 0, back: -18, up: 0, yaw: 0, pitch: 0, fov: 90 },
  { id: 'far-side-edge', gate: 0, back: -18, up: 0, yaw: 80, pitch: 0, fov: 90 },
  { id: 'stack-ahead', gate: 1, back: 22, up: 2, yaw: 3, pitch: 0, fov: 90 },
  { id: 'stack-off', gate: 1, back: 20, up: 0, yaw: -75, pitch: 0, fov: 90 },
  { id: 'wide-ahead', gate: 2, back: 16, up: -1, yaw: -6, pitch: 2, fov: 100 },
  { id: 'wide-behind', gate: 2, back: 20, up: 0, yaw: 170, pitch: 0, fov: 90 },
  { id: 'pylon-ahead', gate: 3, back: 20, up: 0, yaw: 0, pitch: 0, fov: 90 },
  { id: 'pylon-fading', gate: 3, back: 10, up: 0, yaw: 0, pitch: 0, fov: 90 },
];

/* In the page: for each of the course's race gates, the horizontal
 * direction it is flown from (the first of 16 bearings the view calls
 * the approach side). */
const FIND = `(() => {
  const n = window.__race().gates.length;
  const found = [];
  for (let i = 0; i < n; i += 1) {
    window.__setRaceNext(i);
    const w = window.__nextGate().gates[0].world;
    let side = null;
    for (let b = 0; b < 16 && !side; b += 1) {
      const a = b * Math.PI / 8;
      const dx = Math.cos(a), dz = Math.sin(a);
      if (window.__aimProbe(w.x + dx * 10, w.y, w.z + dz * 10) === true) {
        side = { race: i, dx, dz, bearing: b };
      }
    }
    found.push(side);
  }
  return JSON.stringify(found);
})()`;

const READ = `(() => {
  const ui = window.__ui;
  const off = /is-off/.test(ui.lock.className);
  const out = { cls: ui.lock.className };
  if (off) return JSON.stringify(out);
  out.tx = ui.lock.style.transform;
  out.op = ui.lock.style.opacity;
  if (/is-edge/.test(out.cls)) {
    out.arrow = ui.lockArrow.style.transform;
  } else {
    out.box = ui.lockBox.style.width;
  }
  out.label = ui.lockDist.style.transform;
  out.text = ui.lockDist.textContent;
  return JSON.stringify(out);
})()`;

const frames = (n) => `new Promise((done) => { let k = ${n}; const tick = () => (--k <= 0 ? done(true) : requestAnimationFrame(tick)); requestAnimationFrame(tick); })`;

async function sample() {
  const page = await openPage({ root, width: 960, height: 540, url: '/index.html?map=track', seed: seed() });
  const out = {};
  try {
    await page.until('window.__shellReady && window.__map && window.__map().ready && window.__gateTiers().gates.length > 0', WAIT);
    await page.evaluate('(() => { const s = window.__craftState(); window.__placeCraft(s.worldX, s.worldY, s.worldZ); })()');
    await page.until("window.__mode === 'flight'", 60000);
    const found = JSON.parse(await page.evaluate(FIND));
    if (found.length !== 4 || found.some((g) => !g)) {
      throw new Error(`the course is not the four gates the poses expect: ${JSON.stringify(found)}`);
    }
    out.gates = found;
    for (const pose of POSES) {
      const g = found[pose.gate];
      await page.evaluate(`window.__setRaceNext(${g.race})`);
      const w = JSON.parse(await page.evaluate('JSON.stringify(window.__nextGate().gates[0].world)'));
      const cx = w.x + g.dx * pose.back;
      const cy = w.y + pose.up;
      const cz = w.z + g.dz * pose.back;
      /* The view judges the range and the side from the pilot's own lens,
       * read before the harness camera is applied each frame, so the craft
       * is held where the camera is parked. */
      const held = JSON.parse(await page.evaluate(`JSON.stringify(window.__crashThrow(${JSON.stringify({
        x: cx, y: cy, z: cz, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, hold: true, fresh: true,
      })}))`));
      if (!held.ok) {
        throw new Error(`could not hold the craft for ${pose.id}: ${JSON.stringify(held)}`);
      }
      await page.evaluate(`window.__setRaceNext(${g.race})`);
      /* Straight at the centre, then turned: yaw about up, positive to the
       * right, and pitch, positive up. */
      let fx = w.x - cx;
      let fy = w.y - cy;
      let fz = w.z - cz;
      const flat = Math.hypot(fx, fz) || 1;
      const heading = Math.atan2(fz, fx) + (pose.yaw * Math.PI) / 180;
      const elev = Math.atan2(fy, flat) + (pose.pitch * Math.PI) / 180;
      fx = Math.cos(elev) * Math.cos(heading);
      fz = Math.cos(elev) * Math.sin(heading);
      fy = Math.sin(elev);
      const pads = pose.pads
        ? `(() => { const i = window.__input; i.isKeyboardPrimary = () => false; i.isTouchPrimary = () => false; i.isMousePrimary = () => false; })()`
        : `(() => { const i = window.__input; delete i.isKeyboardPrimary; delete i.isTouchPrimary; delete i.isMousePrimary; })()`;
      await page.evaluate(pads);
      await page.evaluate(`window.__setCam(${[cx, cy, cz, cx + fx * 10, cy + fy * 10, cz + fz * 10, pose.fov].join(',')})`);
      await page.evaluate(frames(6));
      out[pose.id] = JSON.parse(await page.evaluate(READ));
    }
    await page.evaluate('window.__setCam(null)');
    const errors = page.errors.filter((e) => !/favicon|net::ERR/.test(e));
    if (errors.length > 0) {
      out.errors = errors.slice(0, 5);
    }
  } finally {
    await page.close();
  }
  return out;
}

if (recording) {
  const a = await sample();
  const b = await sample();
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    console.log('lock-check: not recorded, two runs disagree');
    for (const k of Object.keys(a)) {
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
        console.log(`  ${k}: ${JSON.stringify(a[k])} vs ${JSON.stringify(b[k])}`);
      }
    }
    process.exit(1);
  }
  writeFileSync(RECORD, `${JSON.stringify(a, null, 1)}\n`);
  for (const k of Object.keys(a)) {
    console.log(`  ${k}: ${JSON.stringify(a[k])}`);
  }
  console.log(`lock-check: recorded ${RECORD}`);
  process.exit(0);
}

const want = JSON.parse(readFileSync(RECORD, 'utf8'));
const got = await sample();
let failed = 0;
for (const k of new Set([...Object.keys(want), ...Object.keys(got)])) {
  const same = JSON.stringify(want[k]) === JSON.stringify(got[k]);
  if (!same) {
    failed += 1;
  }
  console.log(`  ${same ? 'pass' : 'FAIL'}  ${k}: ${JSON.stringify(got[k])}${same ? '' : `  (record ${JSON.stringify(want[k])})`}`);
}
if (failed > 0) {
  console.log(`lock-check: ${failed} FAILED`);
  process.exit(1);
}
console.log(`lock-check: ok, ${POSES.length} poses match the record`);
