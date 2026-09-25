/*
 * build-check.js: the in-sim builder, driven through the real page.
 *
 *     node scripts/build-check.js [OUT_DIR] [--map=swiss2]
 *     SIM_GPU=1 node scripts/build-check.js [OUT_DIR] --perf
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
 *   7. B goes back to building, to the camera where it was left; Esc leaves.
 *   8. An old field track (the reference course, schemaVersion 1) on the
 *      custom map still loads with every station and still counts a pass.
 *
 * Pictures land in OUT_DIR (tmp/build-check by default). They are evidence
 * for one look, not for the repository: delete them after.
 *
 * --perf needs the real GPU. It measures the same view of swiss2 at High,
 * flying and then building with six gates in view and the crosshair asking
 * the GPU every frame: the GPU's time per frame (a timer query spanning one
 * whole frame of the shell's), the main thread's time in the shell's frame
 * and the interval between frames, each the median over the run, in two
 * rounds of each.
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
import { airframeById } from '../configs/airframes.js';
import { courseFromDocument } from '../src/game/trackdoc.js';

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
 * and every placement times out. The keyboard is the pilot here.
 */
function seedFor(graphics) {
  const seated = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, '5inch');
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(seated)});
    s.airframeAsked = true;
    s.fpsCap = 0;
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

async function proof() {
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
    await page.evaluate("window.__build.rename('Cliff drop'); true");

    /* The steepest thirty metres of the valley floor's walls, read off the
     * map's own height function. */
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
    const H = async (x, z) => page.evaluate(`window.__heightAt(${x}, ${z})`);
    /* The edge: walk out from the top until the ground starts to fall. */
    let edge = 0;
    for (let s = 0; s <= 30; s += 1) {
      const h = await H(drop.x + drop.dx * s, drop.z + drop.dz * s);
      if (drop.h - h > 2) {
        break;
      }
      edge = s;
    }
    const at = (s, y) => [drop.x + drop.dx * s, y, drop.z + drop.dz * s];
    const yawOut = Math.atan2(-drop.dx, -drop.dz);

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
    await page.tap('Escape');
    await page.until(`${B('.state')} === 'off'`, 10000);
    await page.until("window.__craftState().mode === 'flight'", 10000);
    say(true, 'Esc leaves building for a free flight');
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
      rounds.push({ flying, building });
      await page.tap('Escape');
      await page.until(`${B('.state')} === 'off'`, 10000);
      await page.sleep(3000);
    }
    const med2 = (k, key) => (rounds[0][k][key] + rounds[1][k][key]) / 2;
    const flying = { gpuMs: med2('flying', 'gpuMs'), cpuMs: med2('flying', 'cpuMs'), frameMs: med2('flying', 'frameMs') };
    const building = { gpuMs: med2('building', 'gpuMs'), cpuMs: med2('building', 'cpuMs'), frameMs: med2('building', 'frameMs') };
    const summary = { rounds, flying, building, gpus: gpuNow() };
    await writeFile(join(outDir, 'perf.json'), `${JSON.stringify(summary, null, 2)}\n`);
    console.log(`  GPUs now: ${summary.gpus.replace(/\n/g, ' | ')}`);
    console.log(`  mean of the two rounds: flying GPU ${flying.gpuMs.toFixed(2)} ms, main thread ${flying.cpuMs.toFixed(2)} ms, interval ${flying.frameMs.toFixed(2)} ms; building GPU ${building.gpuMs.toFixed(2)} ms, main thread ${building.cpuMs.toFixed(2)} ms, interval ${building.frameMs.toFixed(2)} ms`);
    console.log(`  building minus flying: ${(building.gpuMs - flying.gpuMs).toFixed(2)} ms of GPU and ${(building.cpuMs - flying.cpuMs).toFixed(2)} ms of main thread a frame`);
  } finally {
    await page.close();
  }
}

try {
  if (opts.perf) {
    await perf();
  } else {
    await proof();
    await fieldTrack();
  }
} catch (e) {
  console.log(`  FAIL  ${e.message}`);
  failed += 1;
}
console.log(failed ? `\n${failed} FAILED` : '\nall hold');
process.exit(failed ? 1 : 0);
