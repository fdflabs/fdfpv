/*
 * build-check.js: the in-sim builder, driven through the real page.
 *
 *     node scripts/build-check.js [OUT_DIR] [--map=swiss2] [--only=line]
 *     SIM_GPU=1 node scripts/build-check.js [OUT_DIR] --perf
 *
 * --only runs one part on its own page: proof (1 to 9), line (12 to 15),
 * wing (10) or field (11).
 *
 * The proof, in the order a pilot would do it, on swiss2 unless --map says
 * otherwise:
 *
 *   1. Fly the map, press B: the run is parked and the free camera is live.
 *   2. Find a real drop with __heightAt: the steepest thirty metres in the
 *      valley.
 *   3. Place one gate in each snap mode, with real keys: on the ground back
 *      from the edge (1), hung in the air out over the drop and tilted into
 *      a dive (3), and standing out of the face below (2). Each is checked
 *      against the world: the ground gate's base on the height field, the
 *      hung gate's opening high over the ground under it, the face gate's
 *      up along the surface normal the GPU read.
 *   4. Reorder, choose a start, roll a gate on its side and back.
 *   5. Save with Ctrl+S, reload the page, press B: the same track is back,
 *      from this browser's storage, as a schemaVersion 4 document naming the
 *      map.
 *   6. B flies it: a race over the built gates, from behind the start gate.
 *      The craft is put through the start gate and then through the hung
 *      gate, and the race counts both: the lap starts and the hung gate is
 *      its first split.
 *   7. B goes back to building, to the camera where it was left.
 *   8. The gates are solid. A gate hung out over the drop is in the
 *      colliders the moment it is placed: in a test flight the craft thrown
 *      through its opening goes clean through, and thrown into its upright
 *      it meets the frame and the crash physics takes the hit. Moved, the
 *      old place is air and the new one solid; deleted, nothing is left. A
 *      double stack's two openings are open and the bar between them solid.
 *   9. The air start. A level gate hung out over the drop made the start:
 *      B starts the craft in the air 7.5 m before it on its line of travel
 *      at its height, held through a countdown, and a pilot in the page
 *      flies it through and the lap starts. Then Esc leaves.
 *  10. The same air start on a fixed wing, the Slow Stick, at its air start
 *      speed (configs/airframes.js airStartSpeed).
 *  11. An old field track (the reference course, schemaVersion 1) on the
 *      custom map still loads with every station and still counts a pass.
 *  12. The racing line: on a new track of three gates hung out over the drop
 *      a ribbon is in the scene and goes through every gate's opening
 *      centre in flying order, and the lap has no warnings.
 *  13. Every geometry warning, made and then fixed with the builder's own
 *      keys, and each one listed while it is there and gone once it is
 *      fixed: a gate turned round (backwards), the Skyhunter picked with C
 *      for a 1.75 m gate (small), a gate two metres after another (close),
 *      a jink the Skyhunter cannot turn (tight, and the line marked), a
 *      gate hung inside the cliff (blocked), one inside a building if the
 *      map has one (blocked), and a line from low over the drop up to the
 *      top that runs into the face (clips).
 *  14. A track of one gate: the first pass starts the lap, a second
 *      forward step inside the gate does not finish it, and leaving and
 *      coming back through it does.
 *  15. What the line costs a frame on the main thread, with it and without
 *      it (V), and what working it out again costs an edit. On the software
 *      renderer the GPU's share is not measured: --perf does that.
 *
 * The music dock is off while building and back for the flight.
 *
 * Pictures land in OUT_DIR (tmp/build-check by default). They are evidence
 * for one look, not for the repository: delete them after.
 *
 * --perf needs the real GPU. It measures the same view of swiss2 at High,
 * flying and then building with six gates in view and the crosshair asking
 * the GPU every frame, with the racing line and then without it: the GPU's
 * time per frame (a timer query spanning one whole frame of the shell's),
 * the main thread's time in the shell's frame and the interval between
 * frames, each the median over the run, in two rounds of each.
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
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage, keyInfo } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airStartSpeed, airframeById } from '../configs/airframes.js';
import { courseFromDocument } from '../src/game/trackdoc.js';
import { openingsOf } from '../src/builder/course.js';
import { ELEMENTS } from '../src/trackbuilder/elements.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const opts = { map: 'swiss2', perf: false };
const positional = [];
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([a-z]+)(?:=(.*))?$/);
  if (m) {
    opts[m[1]] = m[2] === undefined ? true : m[2];
  } else {
    positional.push(a);
  }
}
const outDir = resolve(positional[0] || join(root, 'tmp', 'build-check'));
await mkdir(outDir, { recursive: true });

let failed = 0;
function say(ok, what) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) {
    failed += 1;
  }
}
const f1 = (x) => Number(x).toFixed(1);
const f3 = (v) => v.map((x) => Number(x).toFixed(2)).join(', ');

/*
 * The page's settings, and no gamepads. The browser hands the page every
 * joystick the host has, and a radio left plugged into this machine is a
 * pad whose sticks drive the free camera: the crosshair then never rests
 * and every placement times out. The keyboard is the pilot here. Angle
 * mode, so the pilot in the page that flies an air start asks for an
 * attitude; `airframe` and `tune` seat another aircraft.
 */
function seedFor(graphics, airframe = '5inch', tune = null) {
  const seated = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, airframe);
  if (tune) {
    seated.tune = tune;
  }
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(seated)});
    s.airframeAsked = true;
    s.fpsCap = 0;
    s.flightMode = 'angle';
    ${graphics ? `s.graphics = ${JSON.stringify(graphics)}; s.graphicsAuto = false;` : ''}
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

/* A key with Control held, the way a keyboard sends it: the modifier's own
 * key first, so the shell's held set sees it as well as the event flags. */
async function ctrlTap(page, code) {
  const c = { key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17 };
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...c, modifiers: 2 }, page.sessionId);
  const k = keyInfo(code);
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...k, text: undefined, modifiers: 2 }, page.sessionId);
  await page.sleep(40);
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...k, modifiers: 2 }, page.sessionId);
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...c }, page.sessionId);
}

const B = (expr) => `window.__build.state()${expr}`;

/* Whether the music dock (the record's name and its skips) can be seen. */
const dockShown = (page) => page.evaluate("(() => { const d = document.querySelector('.music-dock'); return d && !d.hidden ? getComputedStyle(d).visibility : 'none'; })()");

async function flyAndBuild(page) {
  await page.until('!!window.__shellReady', 240000);
  await page.until(`window.__map && window.__map().id === ${JSON.stringify(opts.map)} && window.__map().ready`, 300000);
  await page.until('!!window.__build', 60000);
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState().mode === 'flight'", 120000);
  await page.sleep(600);
  await page.tap('KeyB');
  await page.until(`${B('.state')} === 'building'`, 20000);
}

/* Aim the free camera from `from` at `at`, both [x, y, z] in the scene. */
async function aimAt(page, from, at) {
  const dx = at[0] - from[0];
  const dy = at[1] - from[1];
  const dz = at[2] - from[2];
  const yaw = Math.atan2(-dx, -dz);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz));
  await page.evaluate(`window.__build.look(${from.join(',')}, ${yaw}, ${pitch})`);
  await settleCrosshair(page);
}

async function aimAlong(page, from, yaw, pitch) {
  await page.evaluate(`window.__build.look(${from.join(',')}, ${yaw}, ${pitch})`);
  await settleCrosshair(page);
}

/* The crosshair asks the GPU once the camera has rested; wait for that
 * exact reading, taken along the ray the camera is on now, hit or miss. */
async function settleCrosshair(page) {
  await page.until(`(() => {
    const s = window.__build.state();
    if (!s.hitRay.exact) { return false; }
    const o = s.hitRay.origin;
    const c = s.camera.pos;
    const d = s.hitRay.dir;
    const f = s.camera.forward;
    return Math.hypot(o[0] - c[0], o[1] - c[1], o[2] - c[2]) < 1e-6 && Math.hypot(d[0] - f[0], d[1] - f[1], d[2] - f[2]) < 1e-6;
  })()`, 20000);
  await page.sleep(150);
}

/*
 * The steepest thirty metres of the valley floor's walls, read off the
 * map's own height function, and its edge: walked out from the top until
 * the ground starts to fall. `at(s, y)` is s metres out from the top along
 * the drop, at height y.
 */
async function findDrop(page) {
  const drop = await page.evaluate(`(() => {
    const H = window.__heightAt;
    let best = null;
    for (let x = -1800; x <= 1800; x += 12) {
      for (let z = -2400; z <= 2400; z += 12) {
        const h = H(x, z);
        for (let k = 0; k < 8; k += 1) {
          const a = k * Math.PI / 4;
          const dx = Math.sin(a);
          const dz = Math.cos(a);
          const d = h - H(x + dx * 30, z + dz * 30);
          if (!best || d > best.d) { best = { x, z, h, dx, dz, d }; }
        }
      }
    }
    return best;
  })()`);
  say(drop && drop.d > 25, `a real drop: ${f1(drop.d)} m down over 30 m from (${f1(drop.x)}, ${f1(drop.h)}, ${f1(drop.z)})`);
  let edge = 0;
  for (let s = 0; s <= 30; s += 1) {
    const h = await page.evaluate(`window.__heightAt(${drop.x + drop.dx * s}, ${drop.z + drop.dz * s})`);
    if (drop.h - h > 2) {
      break;
    }
    edge = s;
  }
  const at = (s, y) => [drop.x + drop.dx * s, y, drop.z + drop.dz * s];
  return { edge, drop, yawOut: Math.atan2(-drop.dx, -drop.dz), at };
}

async function proof() {
  let out = null;
  console.log(`build mode on ${opts.map}`);
  const page = await openPage({ root, width: 1280, height: 720, url: `/index.html?map=${opts.map}`, seed: seedFor(null) });
  try {
    await flyAndBuild(page);
    const mode = await page.evaluate('window.__craftState().mode');
    say(mode === 'paused', `B parks the run: the shell's mode is ${mode}`);
    const c0 = await page.evaluate('window.__craftState()');
    await page.sleep(800);
    const c1 = await page.evaluate('window.__craftState()');
    say(Math.hypot(c1.worldX - c0.worldX, c1.worldY - c0.worldY, c1.worldZ - c0.worldZ) < 1e-6, 'the aircraft stays exactly where it was parked');
    say((await dockShown(page)) === 'hidden', 'the music dock is off while building, so no record name sits over the build panel');
    await page.evaluate("window.__build.rename('Cliff drop'); true");

    const { edge, drop, yawOut, at } = await findDrop(page);
    const H = async (x, z) => page.evaluate(`window.__heightAt(${x}, ${z})`);

    /* 1: on the ground above the drop, on the flattest ground within two
     * hundred metres of its top, so a pass through a gate a metre off the
     * ground is a flight and not a clip through a slope (the shell refuses
     * to score those). */
    const flat = await page.evaluate(`(() => {
      const H = window.__heightAt;
      let best = null;
      for (let u = -200; u <= 200; u += 8) {
        for (let v = -200; v <= 200; v += 8) {
          const x = ${drop.x} + u;
          const z = ${drop.z} + v;
          const h = H(x, z);
          if (h < ${drop.h} - 20) { continue; }
          const slope = Math.max(Math.abs(H(x + 4, z) - H(x - 4, z)), Math.abs(H(x, z + 4) - H(x, z - 4))) / 8;
          if (!best || slope < best.slope) { best = { x, z, h, slope }; }
        }
      }
      return best;
    })()`);
    const g1 = [flat.x, flat.h, flat.z];
    await page.tap('Digit1');
    await aimAt(page, [g1[0] - drop.dx * 14, g1[1] + 9, g1[2] - drop.dz * 14], g1);
    await shot(page, '1-ground-ghost');
    await page.tap('Enter');
    await page.until(`${B('.gates.length')} === 1`, 10000);
    let st = await page.evaluate(B(''));
    const e1 = st.doc.elements[0];
    const base1 = [e1.position.x, e1.position.z, -e1.position.y];
    const ground1 = await H(base1[0], base1[2]);
    say(Math.abs(base1[1] - ground1) < 0.6, `ground: gate 1 stands on the ground, base ${f1(base1[1])} m, the height field there ${f1(ground1)} m`);
    say(Math.abs(st.gates[0].up[1] - 1) < 1e-6, `ground: gate 1 is upright, up (${f3(st.gates[0].up)})`);

    /* 3: hung in the air out over the drop, tilted two notches into a dive. */
    await page.tap('Digit3');
    await page.tap('Minus');
    const eye = at(edge - 1, drop.h + 6);
    await aimAlong(page, eye, yawOut, -0.05);
    await page.tap('KeyI');
    await page.tap('KeyI');
    await page.sleep(200);
    await shot(page, '2-air-ghost-over-the-drop');
    await page.tap('Enter');
    await page.until(`${B('.gates.length')} === 2`, 10000);
    st = await page.evaluate(B(''));
    const hung = st.gates[1];
    const under = await H(hung.centre[0], hung.centre[2]);
    say(hung.centre[1] - under > 15, `air: the hung gate's opening is ${f1(hung.centre[1] - under)} m over the ground under it, out past the edge`);
    say(hung.travel[1] < -0.4, `air: tilted into a dive, travel (${f3(hung.travel)})`);

    /* 2: out over the drop, looking back at the face below the edge. Z
     * first: the dive tilt was the hung gate's, not this one's. */
    await page.tap('Digit2');
    await page.tap('KeyZ');
    const low = await H(drop.x + drop.dx * 30, drop.z + drop.dz * 30);
    const faceEye = at(edge + 40, (drop.h + low) / 2 + 4);
    await aimAt(page, faceEye, at(edge + 6, (drop.h + low) / 2));
    const face = await page.evaluate('window.__build.pickNow()');
    say(face && Math.abs(face.normal[1]) < 0.85, `surface: the crosshair meets the face ${face ? f1(face.distance) : '?'} m away, normal (${face ? f3(face.normal) : '?'})`);
    await shot(page, '3-surface-ghost-on-the-face');
    await page.tap('Enter');
    await page.until(`${B('.gates.length')} === 3`, 10000);
    st = await page.evaluate(B(''));
    const up3 = st.gates[2].up;
    const dot = face ? up3[0] * face.normal[0] + up3[1] * face.normal[1] + up3[2] * face.normal[2] : 0;
    say(dot > 0.995, `surface: gate 3 stands out of the face along its normal, up . normal ${dot.toFixed(4)}`);

    /* Order, start, and a roll on its side and back. */
    const ids = st.doc.sequence.map((s) => s.elementId);
    await page.tap('Tab');
    await page.tap('Tab');
    await page.tap('Tab');
    say((await page.evaluate(B('.selected'))) === ids[2], 'Tab walks the selection to gate 3');
    await page.tap('BracketLeft');
    let order = await page.evaluate(B('.doc.sequence.map((s) => s.elementId).join()'));
    say(order === [ids[0], ids[2], ids[1]].join(), '[ moves it one step earlier in the lap');
    await page.tap('BracketRight');
    await page.tap('Home');
    order = await page.evaluate(B('.doc.sequence.map((s) => s.elementId).join()'));
    say(order === [ids[2], ids[0], ids[1]].join(), '] puts it back, Home makes it the start and keeps the loop');
    await page.tap('Tab');
    await page.tap('Home');
    order = await page.evaluate(B('.doc.sequence.map((s) => s.elementId).join()'));
    say(order === ids.join(), 'and the ground gate is the start again');
    await page.tap('Tab');
    const before = await page.evaluate(B('.gates[1]'));
    const hc = before.centre;
    await aimAt(page, [hc[0] - drop.dx * 16 + drop.dz * 10, hc[1] + 5, hc[2] - drop.dz * 16 - drop.dx * 10], hc);
    for (let i = 0; i < 6; i += 1) {
      await page.tap('KeyU');
    }
    const rolled = await page.evaluate(B('.gates[1]'));
    const moved = Math.hypot(rolled.centre[0] - before.centre[0], rolled.centre[1] - before.centre[1], rolled.centre[2] - before.centre[2]);
    const upDot = before.up[0] * rolled.up[0] + before.up[1] * rolled.up[1] + before.up[2] * rolled.up[2];
    say(Math.abs(upDot) < 0.01 && moved < 1e-3, `U six times rolls the hung gate a quarter turn onto its side in place (up . up ${upDot.toFixed(3)}, centre moved ${moved.toFixed(4)} m)`);
    await shot(page, '4-hung-gate-on-its-side');
    for (let i = 0; i < 6; i += 1) {
      await page.tap('KeyO');
    }
    const back = await page.evaluate(B('.gates[1]'));
    say(back.up.every((v, i) => Math.abs(v - before.up[i]) < 1e-4), 'O six times rolls it back');
    await page.tap('Escape');
    say((await page.evaluate(B('.selected'))) === null, 'Esc drops the selection first');

    /* The overview, from out over the drop and to one side, on the edge
     * and the hung gate. */
    await aimAt(page, [hc[0] + drop.dx * 45 + drop.dz * 35, hc[1] + 12, hc[2] + drop.dz * 45 - drop.dx * 35], [hc[0] - drop.dx * 8, hc[1] - 4, hc[2] - drop.dz * 8]);
    await page.sleep(400);
    await shot(page, '5-overview');
    const hudNow = await page.evaluate(B('.hud'));
    say(/Height over the ground/.test(hudNow), `the readout is on screen: ${JSON.stringify(hudNow.split('\n').slice(0, 3))}`);

    /* Save, and a real reload. */
    await ctrlTap(page, 'KeyS');
    await page.sleep(300);
    const lib = await page.evaluate('window.__build.library()');
    const saved = lib.find((t) => t.id === st.doc.id);
    say(Boolean(saved) && saved.gates === 3, `Ctrl+S saved it to this browser's library: ${JSON.stringify(lib)}`);
    const raw = await page.evaluate(`JSON.parse(localStorage.getItem('webfpv.trackbuilder.library.v1'))[${JSON.stringify(st.doc.id)}]`);
    say(raw.schemaVersion === 4 && raw.map === opts.map && raw.elements.every((e) => e.orientation), `stored as schemaVersion ${raw.schemaVersion}, map ${raw.map}, every gate with its orientation`);
    const gatesBefore = (await page.evaluate(B('.gates'))).map((g) => g.centre);
    await page.cdp.send('Page.reload', {}, page.sessionId);
    await page.sleep(1000);
    await flyAndBuild(page);
    const gatesAfter = (await page.evaluate(B('.gates'))).map((g) => g.centre);
    const same = gatesAfter.length === 3 && gatesAfter.every((c, i) => Math.hypot(c[0] - gatesBefore[i][0], c[1] - gatesBefore[i][1], c[2] - gatesBefore[i][2]) < 1e-3);
    say(same, `after a reload, B brings the same three gates back (${gatesAfter.length})`);
    const camBuild = await page.evaluate(B('.camera'));

    /* Fly it. */
    await page.tap('KeyB');
    await page.until(`${B('.state')} === 'testing' && window.__craftState().mode === 'flight'`, 30000);
    const mapNow = await page.evaluate('window.__map()');
    const race = await page.evaluate('({ n: window.__race().gates.length, key: window.__race().key, next: window.__race().next, freestyle: window.__race().freestyle })');
    say(mapNow.mode === 'race' && mapNow.gates === 3 && race.n === 3 && !race.freestyle, `B flies it: the map reads as a race with ${mapNow.gates} gates, the race has ${race.n}`);
    say(race.key.endsWith(`.build.${st.doc.id}`), `its record is its own: ${race.key}`);
    say((await dockShown(page)) === 'visible', 'the music dock is back for the flight');
    const start = gatesAfter[0];
    const sp = mapNow.spawn;
    say(Math.abs(Math.hypot(sp.x - start[0], sp.z - start[2]) - 7.5) < 0.05, `the run starts ${f1(Math.hypot(sp.x - start[0], sp.z - start[2]))} m behind the start gate`);
    const G = await page.evaluate(B('.gates'));
    const chord = async (g, back, ahead) => {
      const a = g.centre.map((v, i) => v - g.travel[i] * back);
      const b = g.centre.map((v, i) => v + g.travel[i] * ahead);
      await page.evaluate(`window.__placeCraft(${b.join(',')}, ${a.join(',')})`);
    };
    await chord(G[0], 1.2, 1.2);
    await page.until('window.__race().next === 1', 10000).catch(() => {});
    const r1 = await page.evaluate('({ next: window.__race().next, lap: window.__race().lapStartMs })');
    say(r1.next === 1 && r1.lap != null, `through the start gate: the lap clock starts, next is gate ${r1.next + 1}`);
    await chord(G[1], 2, 2);
    await page.until('window.__race().next === 2', 10000).catch(() => {});
    const r2 = await page.evaluate('({ next: window.__race().next, splits: window.__race().splits.slice(), craft: window.__craftState() })');
    if (r2.next !== 2) {
      const c = r2.craft;
      console.log(`  the craft after the hung gate's chord: mode ${c.mode}, crashed ${c.crashed}, landed ${c.landed}, at ${f1(c.worldX)}, ${f1(c.worldY)}, ${f1(c.worldZ)}`);
    }
    say(r2.next === 2 && r2.splits.length === 1 && r2.splits[0] > 0, `through the hung gate out over the drop: counted, split ${r2.splits[0] ? (r2.splits[0] / 1000).toFixed(2) : '?'} s, next is gate ${r2.next + 1}`);

    /* A picture of what a pilot sees on the way to the hung gate, taken
     * after the pass is counted: a craft parked in the air falls while a
     * slow machine takes the picture, and one that lands hard is a wreck,
     * which voids the lap. */
    const hz = Math.hypot(G[1].travel[0], G[1].travel[2]);
    const front = [G[1].centre[0] - (G[1].travel[0] / hz) * 14, G[1].centre[1] + 1, G[1].centre[2] - (G[1].travel[2] / hz) * 14];
    await page.evaluate("(document.querySelector('.osd-air-hint-btn') || { click() {} }).click(), true");
    await page.evaluate(`window.__placeCraft(${front.join(',')})`);
    await page.sleep(120);
    await shot(page, '6-test-flight-at-the-hung-gate');
    /* Back to building, where the camera was left, then out. */
    await page.tap('KeyB');
    await page.until(`${B('.state')} === 'building'`, 10000);
    const camBack = await page.evaluate(B('.camera'));
    say(Math.hypot(...camBack.pos.map((v, i) => v - camBuild.pos[i])) < 1e-6 && Math.abs(camBack.yaw - camBuild.yaw) < 1e-9, 'B goes back to building, to the camera where it was left');
    say((await page.evaluate('window.__map().mode')) === 'freestyle' && (await page.evaluate('window.__race().freestyle')), 'and the map is freestyle again underneath');

    /* Out over the drop, where nothing but a built gate is in the air. */
    out = { edge, drop, yawOut, at };
    await solidGates(page, out);
    await airStartFlight(page, out, 'quad');
    await page.tap('KeyB');
    await page.until(`${B('.state')} === 'building'`, 10000);
    await page.tap('Escape');
    await page.until(`${B('.state')} === 'off'`, 10000);
    await page.until("window.__craftState().mode === 'flight'", 10000);
    say(true, 'Esc leaves building for a free flight');
    const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED|Failed to load resource/.test(e));
    say(errs.length === 0, `no page errors${errs.length ? `: ${errs.slice(0, 3).join(' | ')}` : ''}`);
  } finally {
    await page.close();
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Solid gates and the air start                                       */
/* ------------------------------------------------------------------ */

const OPENING = openingsOf({ type: 'gate', dims: ELEMENTS.gate.dims })[0];
const STACK = openingsOf({ type: 'doubleStack', dims: ELEMENTS.doubleStack.dims });
const vAdd = (p, v, s) => p.map((x, i) => x + v[i] * s);
const vCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/* The craft's own shape swept along a chord through `c` on the gate's line
 * of travel, the query the frame loop makes. The kind it meets, or null. */
async function chord(page, g, c, back = 2, ahead = 2) {
  const a = vAdd(c, g.travel, -back);
  const b = vAdd(c, g.travel, ahead);
  return (await page.evaluate(`window.__hit(${a.join(',')}, ${b.join(',')})`)).kind;
}

/* What a gate's frame is made of, as the field builds it: the pipe is a
 * 'gate' and the printed sleeve outboard of each upright an 'obstacle'
 * (src/render/scene.js obstacle()), so a craft meeting an upright meets
 * whichever of the two its hull reaches first. */
const FRAME = ['gate', 'obstacle'];

/* A point on a gate's upright, half way up the opening: the axis of the
 * pipe is half a tube outboard of the clear span, and the craft sweeps
 * far more than the tube's radius either side of it. */
function onUpright(g) {
  const across = vCross(g.up, g.travel);
  return vAdd(g.centre, across, OPENING.clearW / 2 + 0.02);
}

/* Place a gate hung level in the air, the builder's air distance in front
 * of an eye looking along `yaw`, and hand back its race frame. */
async function hangGate(page, eye, yaw) {
  const n = await page.evaluate(B('.gates.length'));
  await page.tap('Digit3');
  await aimAlong(page, eye, yaw, 0);
  await page.tap('Enter');
  await page.until(`${B('.gates.length')} === ${n + 1}`, 10000);
  const st = await page.evaluate(B(''));
  return st.gates[st.gates.length - 1];
}

/* Tab round the lap to one gate. */
async function select(page, id) {
  for (let i = 0; i < 12 && (await page.evaluate(B('.selected'))) !== id; i += 1) {
    await page.tap('Tab');
  }
  return (await page.evaluate(B('.selected'))) === id;
}

/* The world yaw, degrees, of a craft pointed along a gate's travel. */
const yawAlong = (t) => (Math.atan2(-t[0], -t[2]) * 180) / Math.PI;

async function solidGates(page, { edge, drop, yawOut, at }) {
  console.log('  solid gates');
  const H = async (x, z) => page.evaluate(`window.__heightAt(${x}, ${z})`);
  const side = [drop.dz, 0, -drop.dx];
  const eye = at(edge + 25, drop.h + 10);
  const where = vAdd(eye, [drop.dx, 0, drop.dz], (await page.evaluate(B('.airDistance'))));
  const probeG = { centre: where, travel: [drop.dx, 0, drop.dz], up: [0, 1, 0] };
  const count0 = (await page.evaluate('window.__colliders()')).count;
  say(await chord(page, probeG, onUpright(probeG)) === null && await chord(page, probeG, where) === null, 'before: nothing solid in the air out over the drop');

  /* Place one. */
  const g = await hangGate(page, eye, yawOut);
  const under = await H(g.centre[0], g.centre[2]);
  say(g.centre[1] - under > 20, `a gate hung ${f1(g.centre[1] - under)} m over the ground out past the edge`);
  say((await page.evaluate('window.__colliders()')).count > count0, `its members are colliders: ${count0} before, ${(await page.evaluate('window.__colliders()')).count} after`);
  const kUp = await chord(page, g, onUpright(g));
  const kHole = await chord(page, g, g.centre);
  say(FRAME.includes(kUp) && kHole === null, `the craft's sweep meets its upright (${kUp}) and not its opening (${kHole})`);

  /* Fly into it and through it, in a test flight, on the shell's own
   * contact and the crash physics. */
  await page.tap('KeyB');
  await page.until(`${B('.state')} === 'testing' && window.__craftState().mode === 'flight'`, 30000);
  const crash0 = await page.evaluate('window.__crash()');
  say(crash0.runDamage === true, `crash damage is on for the run (runDamage ${crash0.runDamage})`);
  const throwAt = async (c, back, speed) => {
    const p = vAdd(c, g.travel, -back);
    const v = g.travel.map((x) => x * speed);
    await page.evaluate(`window.__crashThrow({ x: ${p[0]}, y: ${p[1]}, z: ${p[2]}, yaw: ${yawAlong(g.travel)}, vx: ${v[0]}, vy: ${v[1]}, vz: ${v[2]} })`);
  };
  const plane = vDot(g.centre, g.travel);
  const past = async (d) => page.until(`(() => { const c = window.__craftState(); return c.worldX * ${g.travel[0]} + c.worldY * ${g.travel[1]} + c.worldZ * ${g.travel[2]} > ${plane + d}; })()`, 15000).then(() => true, () => false);
  await throwAt(g.centre, 2.5, 12);
  const through = await past(2);
  await page.sleep(300);
  const clean = await page.evaluate('({ c: window.__craftState(), k: window.__crash() })');
  say(through && clean.c.lastHitKind === 'none' && clean.k.events === crash0.events, `through the opening at 12 m/s: out the far side, touched ${clean.c.lastHitKind}, damage events ${clean.k.events - crash0.events}`);
  await throwAt(onUpright(g), 2.5, 12);
  await page.until("window.__craftState().lastHitKind !== 'none'", 15000).catch(() => {});
  await page.sleep(400);
  await shot(page, '7-into-the-built-gate');
  const hit = await page.evaluate('({ c: window.__craftState(), k: window.__crash() })');
  say(FRAME.includes(hit.c.lastHitKind), `into its upright at 12 m/s: the contact is with a ${hit.c.lastHitKind} at ${f1(hit.c.lastClosingSpeed)} m/s closing`);
  say(hit.k.events > clean.k.events, `and the crash physics took it: ${hit.k.events - clean.k.events} damage events, flags ${JSON.stringify(hit.k.flagNames)}`);
  await page.tap('KeyB');
  await page.until(`${B('.state')} === 'building'`, 10000);

  /* Move it: pick it up and put it down twelve metres to the side. */
  say(await select(page, g.id), 'Tab selects it');
  await page.tap('KeyG');
  await aimAlong(page, vAdd(eye, side, 12), yawOut, 0);
  await page.tap('Enter');
  await page.until(`${B('.held')} === null`, 10000);
  const m = (await page.evaluate(B('.gates'))).find((x) => x.id === g.id);
  const moved = Math.hypot(...m.centre.map((v, i) => v - g.centre[i]));
  const kOld = await chord(page, g, onUpright(g));
  const kNew = await chord(page, m, onUpright(m));
  say(moved > 11 && kOld === null && FRAME.includes(kNew), `moved ${f1(moved)} m: the old upright is air (${kOld}), the new one solid (${kNew})`);

  /* Delete it: nothing of it is left. */
  await page.tap('Delete');
  await page.until(`!${B('.gates')}.some((x) => x.id === ${JSON.stringify(g.id)})`, 10000);
  const kGone = await chord(page, m, onUpright(m));
  const kHoleGone = await chord(page, m, m.centre);
  const count1 = (await page.evaluate('window.__colliders()')).count;
  say(kGone === null && kHoleGone === null && count1 === count0, `deleted: nothing solid where it stood (${kGone}, ${kHoleGone}), ${count1} colliders as before it was placed`);

  /* A double stack: both openings open, the bar between them solid. */
  await page.tap('KeyT');
  await page.tap('KeyT');
  say((await page.evaluate(B('.type'))) === 'doubleStack', 'T twice: a double stack');
  const s = await hangGate(page, eye, yawOut);
  const lift = STACK[1].centreY - STACK[0].centreY;
  const upper = vAdd(s.centre, s.up, lift);
  const bar = vAdd(s.centre, s.up, lift / 2);
  const k0 = await chord(page, s, s.centre);
  const k1 = await chord(page, s, upper);
  const kb = await chord(page, s, bar);
  say(k0 === null && k1 === null && kb === 'gate', `the stack's lower opening (${k0}) and upper one (${k1}) are open and the bar between them solid (${kb})`);
  await select(page, s.id);
  await page.tap('Delete');
  await page.until(`${B('.gates.length')} === 3`, 10000);
  for (let i = 0; i < 3; i += 1) {
    await page.tap('KeyT');
  }
  say((await page.evaluate(B('.type'))) === 'gate' && (await page.evaluate('window.__colliders()')).count === count0, 'deleted, and back to placing gates');
}

/*
 * A test flight from a start gate hung level in the air: the craft starts
 * in the air in front of it at its height, counts down, and is flown
 * through it by a pilot in the page holding the height on the sticks, and
 * the race starts the lap. `craft` names what flies, for the lines.
 */
async function airStartFlight(page, { edge, drop, yawOut, at }, craft) {
  console.log(`  air start, ${craft}`);
  const eye = at(edge + 25, drop.h + 10);
  const g = await hangGate(page, eye, yawOut);
  /* And one after it, so the start gate is not also the whole lap. */
  await hangGate(page, vAdd(eye, [drop.dx, 0, drop.dz], 30), yawOut);
  await select(page, g.id);
  await page.tap('Home');
  await page.tap('Escape');
  const first = (await page.evaluate(B('.gates')))[0];
  say(first.id === g.id, 'Home makes the hung gate the start');
  const af = await page.evaluate('window.__ui.settings.airframe');
  const want = airStartSpeed(airframeById(af));
  await page.tap('KeyB');
  await page.until(`${B('.state')} === 'testing' && window.__craftState().mode === 'flight'`, 30000);
  await page.sleep(300);
  const c0 = await page.evaluate('window.__craftState()');
  const rel = [c0.worldX - g.centre[0], c0.worldY - g.centre[1], c0.worldZ - g.centre[2]];
  const behind = -vDot(rel, g.travel);
  const off = Math.hypot(...vAdd(rel, g.travel, behind));
  const under = await page.evaluate(`window.__heightAt(${c0.worldX}, ${c0.worldZ})`);
  say(Math.abs(behind - 7.5) < 0.05 && off < 0.05, `${af} starts ${behind.toFixed(2)} m before the start gate on its line of travel, ${off.toFixed(3)} m off it, at its height`);
  say(c0.worldY - under > 20 && !c0.landed, `in the air: ${f1(c0.worldY - under)} m over the ground under it`);
  const along = c0.vel ? vDot([c0.vel.x, c0.vel.y, c0.vel.z], g.travel) : NaN;
  say(Math.abs(c0.speed - want) < 0.05 && Math.abs(along - want) < 0.05, `at ${c0.speed.toFixed(2)} m/s along its travel, the air start speed for ${af} is ${want.toFixed(2)}`);
  say(/^[123]$/.test(c0.banner), `the countdown is up: "${c0.banner}"`);
  await page.sleep(1200);
  const c1 = await page.evaluate('window.__craftState()');
  say(Math.hypot(c1.worldX - c0.worldX, c1.worldY - c0.worldY, c1.worldZ - c0.worldZ) < 1e-6, 'held still through the countdown');
  await shot(page, `8-air-start-${craft}`);

  /* The pilot: height on the throttle (a quad) or the elevator (a wing),
   * the line on the roll stick, pushed along on the pitch stick for a quad
   * and on its cruise throttle for a wing, in angle mode and stabilised
   * mode so a stick is an attitude. A positive pitch stick raises the nose. */
  await page.evaluate(`(() => {
    const T = ${JSON.stringify(g.travel)};
    const C = ${JSON.stringify(g.centre)};
    const A = [T[2], 0, -T[0]];
    const wing = ${JSON.stringify(want > 0)};
    const cl = (v, a, b) => Math.max(a, Math.min(b, v));
    window.__pilot = true;
    window.__trail = [];
    const step = () => {
      if (!window.__pilot) { window.__stick(); return; }
      const c = window.__craftState();
      const dy = C[1] - c.worldY;
      const vy = c.vel ? c.vel.y : 0;
      const side = (c.worldX - C[0]) * A[0] + (c.worldZ - C[2]) * A[2];
      const vs = c.vel ? c.vel.x * A[0] + c.vel.z * A[2] : 0;
      const roll = cl(0.25 * side + 0.1 * vs, -0.4, 0.4);
      const u = (c.worldX - C[0]) * T[0] + (c.worldY - C[1]) * T[1] + (c.worldZ - C[2]) * T[2];
      window.__trail.push([+u.toFixed(2), +side.toFixed(2), +(-dy).toFixed(2), +c.speed.toFixed(1), c.banner, c.lastHitKind]);
      if (wing) {
        window.__stick(roll, cl(0.25 * dy - 0.08 * vy, -0.6, 0.6), 0, 0.75);
      } else {
        window.__stick(roll, -0.2, 0, cl(0.37 + 0.1 * dy - 0.08 * vy, 0.1, 0.9));
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return true;
  })()`);
  await page.until('window.__race().next === 1', 60000).catch(() => {});
  await page.evaluate('window.__pilot = false');
  const r = await page.evaluate('({ next: window.__race().next, lap: window.__race().lapStartMs, c: window.__craftState() })');
  if (r.next !== 1) {
    const tr = await page.evaluate('window.__trail');
    console.log(`  mode ${await page.evaluate('window.__mode')}, screen ${await page.evaluate('window.__screen')}, fault ${JSON.stringify(await page.evaluate('window.__frameFault || null'))}`);
    console.log(`  the flight, along the travel, across, up, speed: ${JSON.stringify(tr.filter((_, i) => i % Math.max(1, Math.floor(tr.length / 40)) === 0))}`);
  }
  say(r.next === 1 && r.lap != null && r.c.lastHitKind === 'none', `flown through the start gate: the lap clock starts, next is gate ${r.next + 1}, touched ${r.c.lastHitKind}`);
  await page.sleep(300);
}

/* 12 to 15, on a page of their own so that they stand or fall by
 * themselves, over the same drop. */
async function lineAndWarnings() {
  console.log(`the racing line and the geometry warnings on ${opts.map}`);
  const page = await openPage({ root, width: 1280, height: 720, url: `/index.html?map=${opts.map}`, seed: seedFor(null) });
  try {
    await flyAndBuild(page);
    const where = await findDrop(page);
    await geometry(page, where);
    await oneGate(page, where);
    await deselect(page);
    await page.tap('Escape');
    await page.until(`${B('.state')} === 'off'`, 10000);
    const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED|Failed to load resource/.test(e));
    say(errs.length === 0, `no page errors${errs.length ? `: ${errs.slice(0, 3).join(' | ')}` : ''}`);
  } finally {
    await page.close();
  }
}

/* The same air start on a fixed wing, the Slow Stick: at 1.18 m the one
 * whose span goes through a 1.75 m opening with room to fly it. Its
 * stabilised mode, so a centred stick flies level. */
async function wingStart({ edge, drop, yawOut, at }) {
  console.log(`air start on a fixed wing, ${opts.map}`);
  const page = await openPage({ root, width: 1280, height: 720, url: `/index.html?map=${opts.map}`, seed: seedFor(null, 'slowstick1180', 'slowstick-stab') });
  try {
    await flyAndBuild(page);
    await airStartFlight(page, { edge, drop, yawOut, at }, 'fixed wing');
    const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED|Failed to load resource/.test(e));
    say(errs.length === 0, `no page errors${errs.length ? `: ${errs.slice(0, 3).join(' | ')}` : ''}`);
  } finally {
    await page.close();
  }
}

async function fieldTrack() {
  console.log('an old field track on the custom map');
  const ref = JSON.parse(await readFile(join(root, 'tests/fixtures/course-reference.json'), 'utf8'));
  const want = courseFromDocument(ref).stations.length;
  const seed = [...seedFor('low'), `localStorage.setItem('webfpv.trackbuilder.autosave.v1', ${JSON.stringify(JSON.stringify(ref))});`];
  const page = await openPage({ root, width: 800, height: 450, url: '/index.html?map=custom', seed });
  try {
    await page.until('!!window.__shellReady', 240000);
    await page.until("window.__map && window.__map().id === 'custom' && window.__map().ready", 240000);
    await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until("window.__craftState().mode === 'flight'", 120000);
    const m = await page.evaluate('window.__map()');
    say(ref.schemaVersion === 1 && m.mode === 'race' && m.gates === want, `the schemaVersion ${ref.schemaVersion} reference track loads with ${m.gates} of ${want} stations`);
    const g = await page.evaluate(`(() => { const r = window.__race(); const g = r.gates[0]; const a = g.apertures[0]; return { c: [g.x, g.y + a.centreY, g.z], t: [g.az.x, g.az.y, g.az.z], key: r.key }; })()`);
    say(!g.key.includes('.build.'), `its record key is the shell's own: ${g.key}`);
    const a = g.c.map((v, i) => v - g.t[i] * 2);
    const b = g.c.map((v, i) => v + g.t[i] * 2);
    await page.evaluate(`window.__placeCraft(${b.join(',')}, ${a.join(',')})`);
    await page.until('window.__race().next === 1', 10000).catch(() => {});
    const r = await page.evaluate('({ next: window.__race().next, lap: window.__race().lapStartMs })');
    say(r.next === 1 && r.lap != null, 'a pass through its first gate is counted and starts the lap');
  } finally {
    await page.close();
  }
}

/* ------------------------------------------------------------------ */
/* The racing line, the geometry warnings and a lap of one gate        */
/* ------------------------------------------------------------------ */

const vDist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const warnList = async (page) => (await page.evaluate(B('.warnings'))).map((w) => `${w.code}@${w.gate + 1}`).join(' ') || 'none';
const warned = async (page, code, gate = null) => (await page.evaluate(B('.warnings'))).some((w) => w.code === code && (gate == null || w.gate === gate));
/* The panel is painted on the next frame after an edit, and a frame on the
 * software renderer under load can take a second: wait for it. */
const panelSays = async (page, re) => page.until(`${re}.test(${B('.hud')})`, 10000).then(() => true, () => false);

/* Drop the selection, if there is one: Esc with nothing selected leaves
 * building altogether. */
async function deselect(page) {
  if (await page.evaluate(B('.held'))) {
    await page.tap('Escape');
  }
  if (await page.evaluate(B('.selected'))) {
    await page.tap('Escape');
  }
}

/* Hang a level gate in the air with its opening centred at p, flown along
 * the horizontal unit t: the camera the air distance back from p, looking
 * along t. The new gate's race frame. */
async function hangAt(page, p, t) {
  const n = await page.evaluate(B('.gates.length'));
  const dist = await page.evaluate(B('.airDistance'));
  await page.tap('Digit3');
  await aimAlong(page, vAdd(p, t, -dist), Math.atan2(-t[0], -t[2]), 0);
  await page.tap('Enter');
  await page.until(`${B('.gates.length')} === ${n + 1}`, 10000);
  const st = await page.evaluate(B(''));
  return st.gates[st.gates.length - 1];
}

/* Pick up a placed gate and hang it again at p along t. */
async function moveTo(page, id, p, t) {
  await select(page, id);
  await page.tap('KeyG');
  const dist = await page.evaluate(B('.airDistance'));
  await aimAlong(page, vAdd(p, t, -dist), Math.atan2(-t[0], -t[2]), 0);
  await page.tap('Enter');
  await page.until(`${B('.held')} === null`, 10000);
  await deselect(page);
}

async function removeById(page, id) {
  const n = await page.evaluate(B('.gates.length'));
  await select(page, id);
  await page.tap('Delete');
  await page.until(`${B('.gates.length')} === ${n - 1}`, 10000);
}

/* C round the aircraft until the line is drawn for `id`. */
async function craftTo(page, id) {
  for (let i = 0; i < 16 && (await page.evaluate(B('.line.craft'))) !== id; i += 1) {
    await page.tap('KeyC');
  }
  return (await page.evaluate(B('.line.craft'))) === id;
}

async function geometry(page, { edge, drop, at }) {
  console.log('  the racing line and the geometry warnings');
  const H = async (x, z) => page.evaluate(`window.__heightAt(${x}, ${z})`);
  const d = [drop.dx, 0, drop.dz];
  const back = [-drop.dx, 0, -drop.dz];
  const side = [drop.dz, 0, -drop.dx];
  const aside = [-drop.dz, 0, drop.dx];
  await deselect(page);
  await page.tap('KeyN');
  await page.until(`${B('.gates.length')} === 0`, 10000);
  /* Z with nothing selected stands the next gate upright. */
  await page.tap('KeyZ');
  const empty = await page.evaluate(B('.line'));
  say(empty.samples === 0 && !empty.ribbon && (await page.evaluate(B('.warnings.length'))) === 0, 'a new track: no line and no warnings');
  const seated = empty.craft;

  /* 12. A lap round a triangle hung out over the drop, thirty metres over
   * its top, each gate flown along the lap. */
  const y = drop.h + 30;
  const O = at(edge + 90, y);
  const gA = await hangAt(page, vAdd(O, side, 40), d);
  const gB = await hangAt(page, vAdd(O, d, 70), aside);
  const gC = await hangAt(page, vAdd(O, side, -40), back);
  const st = await page.evaluate(B(''));
  const L = st.line;
  const pts = await page.evaluate('window.__build.linePoints()');
  const exact = st.gates.every((g, i) => vDist(pts[L.gateAt[i]], g.centre) < 1e-3);
  /* And without the line's own bookkeeping: the nearest point of the line
   * to each gate, which must be on it and come round in order. */
  const nearest = st.gates.map((g) => {
    let best = 0;
    pts.forEach((q, k) => {
      if (vDist(q, g.centre) < vDist(pts[best], g.centre)) {
        best = k;
      }
    });
    return { k: best, gap: vDist(pts[best], g.centre) };
  });
  const inOrder = nearest.every((x, i) => i === 0 || x.k > nearest[i - 1].k);
  say(L.samples > 100 && exact && inOrder && nearest.every((x) => x.gap < 1e-3),
    `the line goes through all three openings in flying order: ${L.samples} points, at ${nearest.map((x) => x.k).join(', ')}, ${f1(Math.max(...nearest.map((x) => x.gap)) * 1000)} mm off`);
  const rib = L.ribbon;
  say(Boolean(rib) && rib.inScene && rib.visible && rib.vertices === 2 * (L.samples + 1) && rib.opacity > 0.5,
    `the ribbon is in the valley, drawn: ${rib ? `${rib.vertices} vertices, opacity ${rib.opacity}` : 'none'}`);
  say(L.craft === seated && Number.isFinite(L.slowest) && L.slowest > 0, `drawn for the seated ${seated}: slowest corner ${f1(L.slowest)} m/s`);
  say((await warnList(page)) === 'none', `the lap has no warnings: ${await warnList(page)}`);
  say((await panelSays(page, /Racing line for/)) && (await panelSays(page, /No geometry warnings/)), 'the panel says so');
  await aimAt(page, vAdd(vAdd(O, back, 90), [0, 1, 0], 70), vAdd(O, d, 20));
  await shot(page, '9-racing-line');

  /* 13. backwards: B turned round, J twelve times, and back. */
  await select(page, gB.id);
  for (let i = 0; i < 12; i += 1) {
    await page.tap('KeyJ');
  }
  say(await warned(page, 'backwards', 1), `gate 2 turned round faces the wrong way: ${await warnList(page)}`);
  say(await panelSays(page, /faces the wrong way/), 'the panel lists it');
  const marked = await page.evaluate(B('.line.markers'));
  say(marked === (await page.evaluate(B('.warnings.length'))) && marked > 0, `and it is marked in the valley: ${marked} markers`);
  await shot(page, '10-gate-turned-round');
  for (let i = 0; i < 12; i += 1) {
    await page.tap('KeyL');
  }
  await deselect(page);
  say(!(await warned(page, 'backwards')) && (await page.evaluate(B('.line.markers'))) === 0, `turned back, it is gone: ${await warnList(page)}`);

  /* small: the Skyhunter's 1.8 m span through 1.75 m gates. */
  say(await craftTo(page, 'sky1800'), 'C picks the Skyhunter');
  say((await warned(page, 'small', 0)) && (await warned(page, 'small', 1)) && (await warned(page, 'small', 2)),
    `every gate is too small for its span: ${await warnList(page)}`);

  /* tight: a jink the Skyhunter cannot turn, eight metres on and six across. */
  const gD = await hangAt(page, vAdd(vAdd(gC.centre, back, 8), side, 6), back);
  const over = await page.evaluate(B('.line.over'));
  say((await warned(page, 'tight', 2)) && over > 0, `a jink after gate 3 is tighter than the Skyhunter can turn: ${over} points of the line marked, ${await warnList(page)}`);
  await aimAt(page, vAdd(vAdd(gC.centre, side, 30), [0, 1, 0], 25), gC.centre);
  await shot(page, '11-too-tight-for-the-skyhunter');
  await removeById(page, gD.id);
  say(!(await warned(page, 'tight')) && (await page.evaluate(B('.line.over'))) === 0, `removed, the line is flyable again: ${await warnList(page)}`);
  say(await craftTo(page, seated), `C back to the ${seated}`);
  say((await warnList(page)) === 'none', `and the small warnings are gone: ${await warnList(page)}`);

  /* close: a gate two metres after gate 3, then moved twenty. */
  const gE = await hangAt(page, vAdd(gC.centre, back, 2), back);
  say(await warned(page, 'close', 2), `a gate 2 m after gate 3: ${await warnList(page)}`);
  await moveTo(page, gE.id, vAdd(gC.centre, back, 22), back);
  say(!(await warned(page, 'close')), `moved to 22 m, it is not: ${await warnList(page)}`);
  await removeById(page, gE.id);

  /* blocked: a gate hung inside the cliff under the edge, from out over
   * the drop looking back at the face, the air distance past it. */
  const low = await H(drop.x + drop.dx * 30, drop.z + drop.dz * 30);
  const faceY = (drop.h + low) / 2;
  const eye = at(edge + 40, faceY);
  await aimAlong(page, eye, Math.atan2(drop.dx, drop.dz), 0);
  const face = await page.evaluate('window.__build.pickNow()');
  const want = face ? face.distance + 6 : 0;
  for (let i = 0; i < 40 && (await page.evaluate(B('.airDistance'))) < want; i += 1) {
    await page.tap('Equal');
  }
  const n0 = await page.evaluate(B('.gates.length'));
  await page.tap('Digit3');
  await settleCrosshair(page);
  await page.tap('Enter');
  await page.until(`${B('.gates.length')} === ${n0 + 1}`, 10000);
  const inRock = (await page.evaluate(B('.gates'))).at(-1);
  const under = await H(inRock.centre[0], inRock.centre[2]);
  say(face && under > inRock.centre[1] && (await warned(page, 'blocked', 3)),
    `a gate ${face ? f1(want - face.distance) : '?'} m into the cliff, ${f1(under - inRock.centre[1])} m under the ground: ${await warnList(page)}`);
  await shot(page, '12-gate-in-the-rock');
  for (let i = 0; i < 40 && (await page.evaluate(B('.airDistance'))) > 15; i += 1) {
    await page.tap('Minus');
  }
  await moveTo(page, inRock.id, vAdd(gC.centre, back, 30), back);
  say(!(await warned(page, 'blocked')), `moved out into the air, it is not: ${await warnList(page)}`);
  await removeById(page, inRock.id);

  /* blocked, by a building, where the map has one. */
  const stats = await page.evaluate('window.__colliders()');
  console.log(`  the map's colliders by kind: ${JSON.stringify(stats.byKind)}`);
  const house = await page.evaluate(`window.__build.findSolid('wall', ${drop.x}, ${drop.z})`);
  if (house) {
    const hc = house.centre;
    const gH = await hangAt(page, hc, d);
    say(await warned(page, 'blocked', 3), `a gate hung in a building's wall at (${hc.map(f1).join(', ')}), ${house.size.map(f1).join(' by ')} m: ${await warnList(page)}`);
    await moveTo(page, gH.id, vAdd(gC.centre, back, 30), back);
    say(!(await warned(page, 'blocked')), `moved out of it, it is not: ${await warnList(page)}`);
    await removeById(page, gH.id);
  } else {
    console.log('  no building on this map large enough to hang a gate in');
  }
  say((await warnList(page)) === 'none', `the triangle is clean again: ${await warnList(page)}`);
  await aimAt(page, vAdd(vAdd(O, back, 90), [0, 1, 0], 70), vAdd(O, d, 20));
  await lineCost(page);

  /* clips: a new track of two gates, one low out over the drop and one
   * behind the edge twenty metres over the highest ground along the line
   * between them (the alps' drops are on a mountainside that goes on
   * rising behind the edge), both flown in towards the cliff: the line
   * from the low one climbs into the face. */
  await page.tap('KeyN');
  await page.until(`${B('.gates.length')} === 0`, 10000);
  let top = -Infinity;
  for (let s = -70; s <= 70; s += 2) {
    const p = at(edge + s, 0);
    top = Math.max(top, await H(p[0], p[2]));
  }
  const clear = top + 20;
  const pLow = at(edge + 30, 0);
  pLow[1] = (await H(pLow[0], pLow[2])) + 6;
  const gLow = await hangAt(page, pLow, back);
  await hangAt(page, at(edge - 30, clear), back);
  say(await warned(page, 'clips', 0), `the line from a gate low over the drop to one over the top runs into the face: ${await warnList(page)}`);
  const clip = (await page.evaluate(B('.warnings'))).find((w) => w.code === 'clips');
  if (clip) {
    const g = clip.pos;
    console.log(`  marked where it goes in, (${g.map(f1).join(', ')}), the ground there ${f1(await H(g[0], g[2]))} m`);
    await aimAt(page, vAdd(vAdd(g, d, 60), [0, 1, 0], 30), g);
    await shot(page, '13-line-into-the-face');
  }
  await moveTo(page, gLow.id, at(edge + 30, clear), back);
  say(!(await warned(page, 'clips')), `the low gate raised to the other's height, ${f1(clear - top)} m over the highest ground: the line clears the face: ${await warnList(page)}`);
}

/*
 * 14. A track of one gate, hung out over the drop. The craft is put through
 * it on chords the way the lap check above is: through, then a second step
 * forward that starts and ends inside the scoring box, which is what every
 * frame of a slow pass is and what used to finish the lap on the spot.
 * Then away, and back through it from behind.
 */
async function oneGate(page, { edge, drop, at }) {
  console.log('  a track of one gate');
  const d = [drop.dx, 0, drop.dz];
  await page.tap('KeyN');
  await page.until(`${B('.gates.length')} === 0`, 10000);
  const g = await hangAt(page, at(edge + 25, drop.h + 10), d);
  const L = await page.evaluate(B('.line'));
  say(L.samples > 0 && L.gateAt.join() === '0', `its line is a loop out of it and back in: ${L.samples} points`);
  await page.tap('KeyB');
  await page.until(`${B('.state')} === 'testing' && window.__craftState().mode === 'flight'`, 30000);
  say((await page.evaluate(B('.line.ribbon.opacity'))) < 0.5, 'on the test flight the line is faint');
  const laps = await page.evaluate('window.__ui.settings.laps');
  /* Each placement is followed by frames, not by a time: the race only
   * sees the craft where a frame of the shell's finds it, and on the
   * software renderer under load a frame can take longer than any sleep
   * this would otherwise guess at. */
  const frames = (n) => page.evaluate(`new Promise((done) => { let k = ${n}; const f = () => { k -= 1; if (k <= 0) { done(true); } else { requestAnimationFrame(f); } }; requestAnimationFrame(f); })`);
  const put = async (to, from) => {
    await page.evaluate(`window.__placeCraft(${to.join(',')}${from ? `, ${from.join(',')}` : ''})`);
    await frames(3);
  };
  const t = g.travel;
  await put(vAdd(g.centre, t, 0.1), vAdd(g.centre, t, -1.2));
  await page.until('window.__race().lapStartMs != null', 10000).catch(() => {});
  let r = await page.evaluate('({ lap: window.__race().lap, start: window.__race().lapStartMs, next: window.__race().next })');
  say(r.start != null && r.lap === 0, `through it: the lap starts (lap ${r.lap}, next is gate ${r.next + 1})`);
  await put(vAdd(g.centre, t, 0.35), vAdd(g.centre, t, 0.1));
  r = await page.evaluate('({ lap: window.__race().lap, laps: window.__race().laps.length, mode: window.__mode })');
  say(r.lap === 0 && r.laps === 0 && r.mode === 'flight', `a second step forward inside the gate does not finish it: lap ${r.lap}, ${r.laps} laps, mode ${r.mode}`);
  await put(vAdd(vAdd(g.centre, t, 25), [d[2], 0, -d[0]], 25));
  await put(vAdd(g.centre, t, 1.2), vAdd(g.centre, t, -1.2));
  await page.until('window.__race().lap === 1', 10000).catch(() => {});
  r = await page.evaluate('({ lap: window.__race().lap, ms: window.__race().laps[0], mode: window.__mode })');
  say(r.lap === 1 && r.ms > 0 && (laps > 1 ? r.mode === 'flight' : r.mode === 'results'),
    `away and back through it: lap 1 in ${r.ms ? (r.ms / 1000).toFixed(2) : '?'} s of ${laps}, mode ${r.mode}`);
  await page.tap('KeyB');
  await page.until(`${B('.state')} === 'building'`, 10000);
  say((await page.evaluate(B('.line.ribbon.opacity'))) > 0.5, 'and back in building it is bright again');
}

/* 15. What the line costs: the main thread's time in each frame with it
 * and without it, in the page so the harness's round trips stay off the
 * thread being measured; what the line's own code adds to a frame, timed
 * directly, since on the software renderer a frame takes a second and
 * swamps it; what it asks the GPU to draw; and what working it out again
 * costs an edit. */
async function lineCost(page) {
  console.log('  what the line costs');
  await page.evaluate(`(() => {
    const T = { on: false, cpu: [], dt: [], last: 0 };
    const tick = (now) => {
      if (T.on) { T.cpu.push(performance.now() - now); if (T.last) { T.dt.push(now - T.last); } }
      T.last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    window.__lineT = T;
    return true;
  })()`);
  const med = (a) => { const q = a.slice().sort((x, y) => x - y); return q.length ? q[q.length >> 1] : NaN; };
  const run = async (label) => {
    await page.evaluate('(() => { const T = window.__lineT; T.cpu = []; T.dt = []; T.last = 0; T.on = true; return true; })()');
    await page.sleep(6000);
    const T = await page.evaluate('(() => { const T = window.__lineT; T.on = false; return { cpu: T.cpu.slice(), dt: T.dt.slice() }; })()');
    return { label, frames: T.dt.length, cpu: med(T.cpu), dt: med(T.dt) };
  };
  const rounds = [];
  for (let i = 0; i < 2; i += 1) {
    const on = await run('line on');
    await page.tap('KeyV');
    const off = await run('line off');
    await page.tap('KeyV');
    rounds.push({ on, off });
    console.log(`  round ${i + 1}: line on ${on.frames} frames, main thread ${on.cpu.toFixed(2)} ms, interval ${on.dt.toFixed(1)} ms; off ${off.frames} frames, ${off.cpu.toFixed(2)} ms, ${off.dt.toFixed(1)} ms`);
  }
  const mean = (k, f) => (rounds[0][k][f] + rounds[1][k][f]) / 2;
  console.log(`  the line on the main thread: ${(mean('on', 'cpu') - mean('off', 'cpu')).toFixed(2)} ms a frame (${mean('on', 'cpu').toFixed(2)} on, ${mean('off', 'cpu').toFixed(2)} off), software renderer`);
  const perFrame = await page.evaluate('window.__build.lineFrameMs(1000)');
  console.log(`  the line's own work in a frame, the panel's lines about it: ${(perFrame * 1000).toFixed(1)} microseconds`);
  const L = await page.evaluate(B('.line'));
  console.log(`  what it draws: one mesh, one draw call, ${2 * L.samples} triangles, no shadow`);
  const edit = await page.evaluate('window.__build.lineMs(5)');
  console.log(`  working the line and the warnings out again: ${edit.ms.toFixed(1)} ms an edit, ${edit.gates} gates, ${edit.samples} points`);
  say((await page.evaluate(B('.line.on'))) === true, 'V twice leaves the line on');
  return rounds;
}

/* ------------------------------------------------------------------ */

const PERF_TIMER = `(() => {
  const P = globalThis.__SWISS2_PERF;
  const gl = P.renderer.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) { throw new Error('no EXT_disjoint_timer_query_webgl2'); }
  const T = { open: null, done: [], gpu: [], dt: [], cpu: [], last: 0, on: false };
  /* This callback is registered after the shell's, so it runs after the
   * shell's frame in the same batch: the time since the batch began is the
   * shell's frame on the main thread, the builder's work in it included. */
  const tick = (now) => {
    if (T.on) { T.cpu.push(performance.now() - now); }
    if (T.open) { gl.endQuery(ext.TIME_ELAPSED_EXT); T.done.push(T.open); T.open = null; }
    for (let i = T.done.length - 1; i >= 0; i -= 1) {
      const q = T.done[i];
      if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
        if (T.on && !gl.getParameter(ext.GPU_DISJOINT_EXT)) { T.gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); }
        gl.deleteQuery(q);
        T.done.splice(i, 1);
      }
    }
    if (T.on && T.last) { T.dt.push(now - T.last); }
    T.last = now;
    const q = gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    T.open = q;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.__perfT = T;
  return true;
})()`;

async function measure(page, label, seconds, wobble) {
  /* Swing the camera a fraction of a degree every frame, in the page so the
   * harness's own round trips stay off the main thread being measured, and
   * the crosshair asks the GPU again every frame the way a moving camera
   * does. */
  if (wobble) {
    await page.evaluate(`(() => {
      const c = window.__build.state().camera;
      let k = 0;
      window.__wobble = true;
      const step = () => {
        if (!window.__wobble) { return; }
        k += 1;
        window.__build.look(c.pos[0], c.pos[1], c.pos[2], c.yaw + (k % 2 ? 0.004 : -0.004), c.pitch);
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      return true;
    })()`);
  }
  await page.evaluate(`(() => { const T = window.__perfT; T.gpu = []; T.dt = []; T.cpu = []; T.on = true; return true; })()`);
  await page.sleep(seconds * 1000);
  const T = await page.evaluate('(() => { window.__wobble = false; const T = window.__perfT; T.on = false; return { gpu: T.gpu.slice(), dt: T.dt.slice(), cpu: T.cpu.slice() }; })()');
  const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };
  const p95 = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length * 0.95)] : NaN; };
  const out = {
    label, frames: T.dt.length, gpuMs: med(T.gpu), gpuP95: p95(T.gpu), frameMs: med(T.dt), frameP95: p95(T.dt), cpuMs: med(T.cpu), cpuP95: p95(T.cpu),
  };
  console.log(`  ${label.padEnd(10)} frames ${String(out.frames).padStart(4)}  GPU ${out.gpuMs.toFixed(2)} ms (p95 ${out.gpuP95.toFixed(2)})  interval ${out.frameMs.toFixed(2)} ms (p95 ${out.frameP95.toFixed(2)})  main thread ${out.cpuMs.toFixed(2)} ms (p95 ${out.cpuP95.toFixed(2)})`);
  return out;
}

/* The GPUs' load beside the numbers: the desktop shares the card. */
function gpuNow() {
  const q = spawnSync('nvidia-smi', ['--query-gpu=index,utilization.gpu,memory.used', '--format=csv,noheader,nounits'], { encoding: 'utf8' });
  return (q.stdout || '').trim();
}

async function perf() {
  if (process.env.SIM_GPU !== '1') {
    throw new Error('build-check --perf: run with SIM_GPU=1; a software rasteriser says nothing about a frame budget');
  }
  console.log(`frame budget on ${opts.map}, High`);
  const seed = [...seedFor('high'), 'globalThis.__SWISS2_PERF = {};'];
  const page = await openPage({ root, width: 1600, height: 900, url: `/index.html?map=${opts.map}`, seed });
  try {
    await page.until('!!window.__shellReady', 240000);
    await page.until(`window.__map && window.__map().ready && window.__map().graphics === 'high'`, 300000);
    await page.until('!!window.__build', 60000);
    await page.evaluate(PERF_TIMER);
    await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until("window.__craftState().mode === 'flight'", 120000);
    /* The pad shot plays first; let it end and the world settle. */
    await page.sleep(9000);
    /* Two rounds, flying then building, so a change in whatever else the
     * desktop is drawing lands on both rather than on one. The craft sits
     * on the strip with its own camera; building starts from exactly that
     * camera, with six gates placed in view. */
    const rounds = [];
    for (let round = 0; round < 2; round += 1) {
      const flying = await measure(page, `flying ${round + 1}`, 10, false);
      await page.tap('KeyB');
      await page.until(`${B('.state')} === 'building'`, 20000);
      const home = await page.evaluate(B('.camera'));
      if (round === 0) {
        await page.tap('Digit3');
        for (let i = 0; i < 6; i += 1) {
          await page.evaluate(`window.__build.look(${home.pos.join(',')}, ${home.yaw + (i - 2.5) * 0.12}, ${home.pitch})`);
          await page.sleep(250);
          await page.tap('Enter');
        }
        await page.evaluate(`window.__build.look(${home.pos.join(',')}, ${home.yaw}, ${home.pitch})`);
        await page.sleep(3000);
        await shot(page, 'perf-building');
      }
      const building = await measure(page, `building ${round + 1}`, 10, true);
      await page.tap('KeyV');
      const noLine = await measure(page, `no line ${round + 1}`, 10, true);
      await page.tap('KeyV');
      rounds.push({ flying, building, noLine });
      await page.tap('Escape');
      await page.until(`${B('.state')} === 'off'`, 10000);
      await page.sleep(3000);
    }
    const med2 = (k, key) => (rounds[0][k][key] + rounds[1][k][key]) / 2;
    const flying = { gpuMs: med2('flying', 'gpuMs'), cpuMs: med2('flying', 'cpuMs'), frameMs: med2('flying', 'frameMs') };
    const building = { gpuMs: med2('building', 'gpuMs'), cpuMs: med2('building', 'cpuMs'), frameMs: med2('building', 'frameMs') };
    const noLine = { gpuMs: med2('noLine', 'gpuMs'), cpuMs: med2('noLine', 'cpuMs'), frameMs: med2('noLine', 'frameMs') };
    const summary = { rounds, flying, building, noLine, gpus: gpuNow() };
    await writeFile(join(outDir, 'perf.json'), `${JSON.stringify(summary, null, 2)}\n`);
    console.log(`  GPUs now: ${summary.gpus.replace(/\n/g, ' | ')}`);
    console.log(`  mean of the two rounds: flying GPU ${flying.gpuMs.toFixed(2)} ms, main thread ${flying.cpuMs.toFixed(2)} ms, interval ${flying.frameMs.toFixed(2)} ms; building GPU ${building.gpuMs.toFixed(2)} ms, main thread ${building.cpuMs.toFixed(2)} ms, interval ${building.frameMs.toFixed(2)} ms`);
    console.log(`  building minus flying: ${(building.gpuMs - flying.gpuMs).toFixed(2)} ms of GPU and ${(building.cpuMs - flying.cpuMs).toFixed(2)} ms of main thread a frame`);
    console.log(`  the racing line: ${(building.gpuMs - noLine.gpuMs).toFixed(2)} ms of GPU and ${(building.cpuMs - noLine.cpuMs).toFixed(2)} ms of main thread a frame`);
  } finally {
    await page.close();
  }
}

/* Each part on its own, so one that throws does not hide the rest. `--only=`
 * runs one of them: proof, line, wing or field. */
async function stage(name, fn) {
  if (opts.only && opts.only !== name) {
    return undefined;
  }
  try {
    return await fn();
  } catch (e) {
    console.log(`  FAIL  ${name}: ${e.message}`);
    failed += 1;
    return undefined;
  }
}

if (opts.perf) {
  await stage('perf', perf);
} else {
  const out = await stage('proof', proof);
  await stage('line', lineAndWarnings);
  await stage('wing', () => wingStart(out));
  await stage('field', fieldTrack);
}
console.log(failed ? `\n${failed} FAILED` : '\nall hold');
process.exit(failed ? 1 : 0);
