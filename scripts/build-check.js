/*
 * build-check.js: the in-sim builder, driven through the real page with its
 * own controls.
 *
 *     node scripts/build-check.js [OUT_DIR] [--map=swiss2] [--only=pieces]
 *     SIM_GPU=1 node scripts/build-check.js [OUT_DIR] --perf
 *
 * --only runs one part on its own page: proof, pieces, line, wing, plane,
 * hoops, hoopsbramor or casual.
 *
 * The builder is a creative mode (src/builder/buildmode.js) and every edit
 * here is made the way a pilot makes it, with mouse and key events over
 * the DevTools protocol (tests/lib/buildkeys.js): the mouse taken, a left
 * click, Alt held, the wheel, 1 to 9, E, R, F, O, Ctrl+Z. Only the camera
 * is put in place directly (window.__build.look), since flying it there at
 * a frame a second proves nothing the movement check does not.
 *
 * proof, on swiss2 unless --map says otherwise:
 *
 *   1. Fly the map, press B: the run is parked, the free camera is live and
 *      B has taken the mouse. Nine hotbar slots hold the default pieces,
 *      each with an icon drawn from its mesh; the controls card is up and
 *      H hides it.
 *   2. Creative flight: W moves along the heading and eases in and out,
 *      Space rises, Shift sinks, W twice and held sprints, - and = change
 *      the speed, the mouse looks.
 *   3. On a real drop found with __heightAt: a gate placed with a left
 *      click on the flattest ground above it stands on the height field,
 *      upright; one hung out over the drop with Alt held and tilted twice
 *      with T is high over the ground and dives; one clicked on the face
 *      below stands out of it along the normal the GPU read.
 *   4. R turns the ghost 15 degrees; G puts it on the half metre grid and
 *      its heading on 15 degrees.
 *   5. O and three clicks set the flying order, the badges follow it and
 *      the start's is the start's; O and three more put it back.
 *   6. The mouse freed: a click on the hung gate selects it and brings up
 *      the gizmo; Y six times rolls it onto its side where it hangs and
 *      Shift+Y back; the up arrow dragged raises it, the yaw ring dragged
 *      turns it about its opening, and Ctrl+Z undoes each.
 *   7. Ctrl+S, a real reload, B: the same track, schemaVersion 4.
 *   8. B flies it: a race over the built gates from behind the start gate,
 *      each counted, round the lap and back through the start: a lap.
 *      B goes back to building, to the camera where it was left.
 *   9. The gates are solid (a gate hung out over the drop: through its
 *      opening clean, into its upright a plant contact and damage; picked
 *      up with F and moved, the old place air and the new one solid;
 *      removed with a right click and Delete, nothing left; a double stack's openings
 *      open and its bar solid), and the air start (a level gate hung out
 *      over the drop made the start in the flying order, flown through by
 *      a pilot in the page).
 *
 * pieces, on its own page:
 *
 *  10. Every piece placed with a left click on a clear level line, the
 *      ones not on the hotbar through the inventory (a click on a tile, and
 *      a tile dragged onto a slot); the start gate piece makes its gate the
 *      start and the right hand pylon is passed on its right. The wheel
 *      walks the hotbar. A right click selects one, frees the mouse and
 *      brings up its gizmo, and a right click on it again removes it; a
 *      right click on the sky takes the mouse back; Delete removes the one
 *      under the crosshair. A middle click takes a placed piece in hand. F picks one up and a click puts it down six
 *      metres over; Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z undo and redo it and a
 *      placement. Ctrl+D copies one into the hand and a click places the
 *      copy, turned as the original. The ghost goes red on another gate.
 *  11. A track saved by the builder before this one (tests/fixtures/
 *      map-track-v4.json) opens with Ctrl+O with every gate where it was
 *      and its pylon's side, and flies.
 *
 * line (12 to 15), plane (16) and wing (the air start on a fixed wing)
 * are the racing line and its warnings, the plane sized gates and the air
 * start, as before, on the new controls. 15 also measures what building
 * costs a frame on the main thread beside flying. A pylon is jelly to a
 * plane now (src/game/jelly.js), so 16 throws the Slow Stick's wingtip
 * into one and asks that it is whacked and not hurt; the heaviest wing
 * into a pylon, which was 17, is the Bramor's page of 18.
 *
 * hoops (18) and hoopsbramor: the sky hoops, on the Cub's page and the
 * Bramor's. Every hoop in the air with a plain click, a course laid with
 * the Shift+click chain and a pylon, the chain's spacing on Ctrl, Shift
 * and the wheel, a stale plane hotbar mended, an old track's retired
 * hoops loaded and the Bramor's small warning on its 6 m one, the disc
 * scored as a disc, each plane thrown head on into a rim and a pylon at
 * its top speed with crash damage on (whacked, never hurt, flying on,
 * the piece wobbling and settling), saved and reloaded, and pictures
 * from a kilometre, 500 m and close.
 *
 * casual (19): My tracks' one click casual sky course for a plane.
 *
 * Pictures land in OUT_DIR (tmp/build-check by default). They are evidence
 * for one look, not for the repository: delete them after.
 *
 * --perf needs the real GPU. It measures the same view of swiss2 at High,
 * flying and then building with six gates in view, the ghost and the
 * hotbar up and the crosshair asking the GPU every frame, with the racing
 * line and then without it: the GPU's time per frame (a timer query
 * spanning one whole frame of the shell's), the main thread's time in the
 * shell's frame and the interval between frames, each the median over the
 * run, in two rounds of each.
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
import { openPage } from '../tests/lib/page.js';
import {
  B, airTo, click, dragMouse, frames, freeMouse, hangAt, hold, holdKey, key, leave, lookAlong, lookAt, moveMouse, placeHere,
  settleCrosshair, takeMouse, wheel,
} from '../tests/lib/buildkeys.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airStartSpeed, airframeById } from '../configs/airframes.js';
import {
  DEFAULT_HOTBAR, DEFAULT_WING_HOTBAR, HOOP_TYPES, PIECES, RETIRED_HOOPS, addGate, newCourse, openingsOf, qAxis, raceGatesOf,
} from '../src/builder/course.js';
import { ELEMENTS } from '../src/trackbuilder/elements.js';
import { normalize, toPlain } from '../src/trackbuilder/model.js';

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
const DEG = Math.PI / 180;
const LIBRARY = 'webfpv.trackbuilder.library.v1';

/*
 * The page's settings, and no gamepads. The browser hands the page every
 * joystick the host has, and a radio left plugged into this machine is a
 * pad whose sticks drive the free camera: the crosshair then never rests
 * and every placement times out. The keyboard and mouse are the pilot
 * here. Angle mode, so the pilot in the page that flies an air start asks
 * for an attitude; `airframe` and `tune` seat another aircraft.
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

/* Whether the music dock (the record's name and its skips) can be seen. */
const dockShown = (page) => page.evaluate("(() => { const d = document.querySelector('.music-dock'); return d && !d.hidden ? getComputedStyle(d).visibility : 'none'; })()");

const pageErrors = (page) => page.errors.filter((e) => !/ERR_CONNECTION_REFUSED|Failed to load resource/.test(e));

async function flyAndBuild(page) {
  await page.until('!!window.__shellReady', 240000);
  await page.until(`window.__map && window.__map().id === ${JSON.stringify(opts.map)} && window.__map().ready`, 300000);
  await page.until('!!window.__build', 60000);
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState().mode === 'flight'", 120000);
  await page.sleep(600);
  await key(page, 'KeyB');
  await page.until(`${B('.state')} === 'building'`, 20000);
  await takeMouse(page);
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

const vAdd = (p, v, s) => p.map((x, i) => x + v[i] * s);
const vCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vDist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/* The heading, radians, a quaternion [x, y, z, w] flies a gate along. */
const headingOfQuat = (q) => {
  const [x, y, z, w] = q;
  const tx = -(2 * (x * z + w * y));
  const tz = -(1 - 2 * (x * x + y * y));
  return Math.atan2(-tx, -tz);
};
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/*
 * The crosshair on a placed gate, from `back` metres behind it on its line
 * of travel: first its opening, then its top bar, then an upright, until
 * the builder says the crosshair is on it. True when it is.
 */
async function aimAtGate(page, id, back = 10) {
  const g = (await page.evaluate(B('.gates'))).find((x) => x.id === id);
  if (!g) {
    return false;
  }
  const across = vCross(g.up, g.travel);
  /* A pylon scores a square beside it, so its cone is found from its
   * base: two and four metres up it. */
  const el = (await page.evaluate(B('.doc.elements'))).find((e) => e.id === id);
  const base = [el.position.x, el.position.z, -el.position.y];
  const cone = el.type === 'pylon' ? [vAdd(base, g.up, 2), vAdd(base, g.up, 4)] : [];
  const target = cone.length ? cone[0] : g.centre;
  /* From behind and above, so the ground between is not in the way; then
   * from in front and from the side, for a gate a tree or a slope hides
   * from behind. */
  const froms = [vAdd(target, g.travel, -back), vAdd(target, g.travel, back), vAdd(target, across, back)].map((f) => vAdd(f, [0, 1, 0], back * 0.4));
  for (const from of froms) {
    for (const p of [...cone, g.centre, vAdd(g.centre, g.up, 0.8), vAdd(g.centre, across, 0.85), vAdd(g.centre, g.up, -0.8)]) {
      await lookAt(page, from, p);
      await frames(page, 2);
      if ((await page.evaluate(B('.hovered'))) === id) {
        return true;
      }
    }
  }
  return false;
}

/* With the mouse free, a click on a placed gate where it is on the page,
 * made only once the builder says the cursor is on it: a click on the
 * world would take the mouse back. True when it is selected. */
async function clickGate(page, id) {
  const g = (await page.evaluate(B('.gates'))).find((x) => x.id === id);
  const across = vCross(g.up, g.travel);
  for (const p of [g.centre, vAdd(g.centre, g.up, 0.8), vAdd(g.centre, across, 0.85), vAdd(g.centre, g.up, -0.8)]) {
    const s = await page.evaluate(`window.__build.screenOf(${p.join(',')})`);
    await moveMouse(page, s.x, s.y);
    await frames(page, 2);
    if ((await page.evaluate(B('.hovered'))) !== id) {
      continue;
    }
    await click(page, 'left', { x: s.x, y: s.y });
    await frames(page, 2);
    return (await page.evaluate(B('.selected'))) === id;
  }
  return false;
}

async function proof() {
  let out = null;
  console.log(`build mode on ${opts.map}`);
  const page = await openPage({ root, width: 1280, height: 720, url: `/index.html?map=${opts.map}`, seed: seedFor(null) });
  try {
    await flyAndBuild(page);
    const mode = await page.evaluate('window.__craftState().mode');
    say(mode === 'paused', `B parks the run: the shell's mode is ${mode}`);
    say(await page.evaluate(B('.locked')), 'and takes the mouse: the pointer is locked to the world');
    await frames(page, 3);
    const c0 = await page.evaluate('window.__craftState()');
    await page.sleep(800);
    const c1 = await page.evaluate('window.__craftState()');
    say(Math.hypot(c1.worldX - c0.worldX, c1.worldY - c0.worldY, c1.worldZ - c0.worldZ) < 1e-6, 'the aircraft stays exactly where it was parked');
    say((await dockShown(page)) === 'hidden', 'the music dock is off while building, so no record name sits over the build panel');
    await hotbarAndHelp(page);
    await flight(page);
    await padWhileBuilding(page);
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
    await hold(page, 'gate');
    await lookAt(page, [g1[0] - drop.dx * 14, g1[1] + 9, g1[2] - drop.dz * 14], g1);
    const gh1 = await page.evaluate(B('.ghost'));
    say(gh1 && gh1.visible && gh1.mode === 'ground' && !gh1.trouble, `ground: the ghost stands on the ground at the crosshair, ${gh1 ? gh1.colour : '?'}`);
    await shot(page, '1-ground-ghost');
    await placeHere(page);
    let st = await page.evaluate(B(''));
    const e1 = st.doc.elements[0];
    const base1 = [e1.position.x, e1.position.z, -e1.position.y];
    const ground1 = await H(base1[0], base1[2]);
    say(Math.abs(base1[1] - ground1) < 0.6, `ground: a left click stands gate 1 on the ground, base ${f1(base1[1])} m, the height field there ${f1(ground1)} m`);
    say(Math.abs(st.gates[0].up[1] - 1) < 1e-6, `ground: gate 1 is upright, up (${f3(st.gates[0].up)})`);

    /* 2: hung in the air out over the drop, Alt held, tilted two notches
     * into a dive with T. */
    await airTo(page, 16);
    say((await page.evaluate(B('.airDistance'))) === 16, `Ctrl and the wheel set the air distance: ${await page.evaluate(B('.airDistance'))} m`);
    const eye = at(edge - 1, drop.h + 6);
    await lookAlong(page, eye, yawOut, -0.05);
    await key(page, 'KeyT');
    await key(page, 'KeyT');
    await page.cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18, modifiers: 1 }, page.sessionId);
    await frames(page, 3);
    const gh2 = await page.evaluate(B('.ghost'));
    say(gh2 && gh2.mode === 'air', `Alt held: the ghost hangs in the air (${gh2 ? gh2.mode : '?'})`);
    await shot(page, '2-air-ghost-over-the-drop');
    await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18 }, page.sessionId);
    const hung = await placeHere(page, { air: true });
    const under = await H(hung.centre[0], hung.centre[2]);
    say(hung.centre[1] - under > 15, `air: Alt and a click hang it ${f1(hung.centre[1] - under)} m over the ground under it, out past the edge`);
    say(hung.travel[1] < -0.4, `air: T twice tilts it into a dive, travel (${f3(hung.travel)})`);
    await key(page, 'KeyT', { shift: true });
    await key(page, 'KeyT', { shift: true });

    /* 3: out over the drop, looking back at the face below the edge: a
     * face is a face without a key. */
    const low = await H(drop.x + drop.dx * 30, drop.z + drop.dz * 30);
    const faceEye = at(edge + 40, (drop.h + low) / 2 + 4);
    await lookAt(page, faceEye, at(edge + 6, (drop.h + low) / 2));
    const face = await page.evaluate('window.__build.pickNow()');
    say(face && Math.abs(face.normal[1]) < 0.85, `surface: the crosshair meets the face ${face ? f1(face.distance) : '?'} m away, normal (${face ? f3(face.normal) : '?'})`);
    const gh3 = await page.evaluate(B('.ghost'));
    say(gh3 && gh3.mode === 'surface', `the ghost reads it as a face: ${gh3 ? gh3.mode : '?'}`);
    await shot(page, '3-surface-ghost-on-the-face');
    const g3 = await placeHere(page);
    const up3 = g3.up;
    const dot = face ? up3[0] * face.normal[0] + up3[1] * face.normal[1] + up3[2] * face.normal[2] : 0;
    say(dot > 0.995, `surface: gate 3 stands out of the face along its normal, up . normal ${dot.toFixed(4)}`);

    await turnAndGrid(page, g1, drop);
    st = await page.evaluate(B(''));
    await flyingOrder(page, st);
    await freeEdits(page, hung.id, drop);

    /* The overview, from out over the drop and to one side, on the edge
     * and the hung gate. */
    const hc = (await page.evaluate(B('.gates'))).find((g) => g.id === hung.id).centre;
    await lookAt(page, [hc[0] + drop.dx * 45 + drop.dz * 35, hc[1] + 12, hc[2] + drop.dz * 45 - drop.dx * 35], [hc[0] - drop.dx * 8, hc[1] - 4, hc[2] - drop.dz * 8]);
    await shot(page, '5-overview-with-badges');
    const hudNow = await page.evaluate(B('.hud'));
    say(/Height over the ground/.test(hudNow), `the readout is on screen: ${JSON.stringify(hudNow.split('\n').slice(0, 3))}`);

    /* Save, and a real reload. */
    st = await page.evaluate(B(''));
    await key(page, 'KeyS', { ctrl: true });
    await page.sleep(300);
    const lib = await page.evaluate('window.__build.library()');
    const saved = lib.find((t) => t.id === st.doc.id);
    say(Boolean(saved) && saved.gates === 3, `Ctrl+S saved it to this browser's library: ${JSON.stringify(lib)}`);
    const raw = await page.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(LIBRARY)}))[${JSON.stringify(st.doc.id)}]`);
    say(raw.schemaVersion === 4 && raw.map === opts.map && raw.elements.every((e) => e.orientation), `stored as schemaVersion ${raw.schemaVersion}, map ${raw.map}, every gate with its orientation`);
    const gatesBefore = (await page.evaluate(B('.gates'))).map((g) => g.centre);
    await page.cdp.send('Page.reload', {}, page.sessionId);
    await page.sleep(1000);
    await flyAndBuild(page);
    const gatesAfter = (await page.evaluate(B('.gates'))).map((g) => g.centre);
    const same = gatesAfter.length === 3 && gatesAfter.every((c, i) => vDist(c, gatesBefore[i]) < 1e-3);
    say(same, `after a reload, B brings the same three gates back (${gatesAfter.length})`);
    const camBuild = await page.evaluate(B('.camera'));

    /* Fly it: every gate counted, and back through the start for a lap. */
    await key(page, 'KeyB');
    await page.until(`${B('.state')} === 'testing' && window.__craftState().mode === 'flight'`, 30000);
    const mapNow = await page.evaluate('window.__map()');
    const race = await page.evaluate('({ n: window.__race().gates.length, key: window.__race().key, next: window.__race().next, freestyle: window.__race().freestyle })');
    say(mapNow.mode === 'race' && mapNow.gates === 3 && race.n === 3 && !race.freestyle, `B flies it: the map reads as a race with ${mapNow.gates} gates, the race has ${race.n}`);
    say(race.key.endsWith(`.build.${st.doc.id}`), `its record is its own: ${race.key}`);
    say((await dockShown(page)) === 'visible', 'the music dock is back for the flight');
    say(!(await page.evaluate(B('.locked'))), 'and the mouse is the pilot\'s again');
    const start = gatesAfter[0];
    const sp = mapNow.spawn;
    say(Math.abs(Math.hypot(sp.x - start[0], sp.z - start[2]) - 7.5) < 0.05, `the run starts ${f1(Math.hypot(sp.x - start[0], sp.z - start[2]))} m behind the start gate`);
    const G = await page.evaluate(B('.gates'));
    const chord = async (g, back, ahead) => {
      const a = g.centre.map((v, i) => v - g.travel[i] * back);
      const b = g.centre.map((v, i) => v + g.travel[i] * ahead);
      await page.evaluate(`window.__placeCraft(${b.join(',')}, ${a.join(',')})`);
      await frames(page, 3);
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
    const hz = Math.hypot(G[1].travel[0], G[1].travel[2]);
    const front = [G[1].centre[0] - (G[1].travel[0] / hz) * 14, G[1].centre[1] + 1, G[1].centre[2] - (G[1].travel[2] / hz) * 14];
    await page.evaluate("(document.querySelector('.osd-air-hint-btn') || { click() {} }).click(), true");
    await page.evaluate(`window.__placeCraft(${front.join(',')})`);
    await page.sleep(120);
    await shot(page, '6-test-flight-at-the-hung-gate');
    await chord(G[2], 1.5, 1.5);
    await page.until('window.__race().next === 0', 10000).catch(() => {});
    await chord(G[0], 1.2, 1.2);
    await page.until('window.__race().lap === 1', 10000).catch(() => {});
    const r3 = await page.evaluate('({ lap: window.__race().lap, ms: window.__race().laps[0] })');
    say(r3.lap === 1 && r3.ms > 0, `through the face gate and back through the start: lap 1 counted, ${r3.ms ? (r3.ms / 1000).toFixed(2) : '?'} s`);
    /* Back to building, where the camera was left. The lap may have ended
     * the run in its results: the flight screen is where B means building. */
    if ((await page.evaluate('window.__mode')) === 'results') {
      await page.evaluate("window.__ui.onAction('restart'); true");
      await page.until("window.__craftState().mode === 'flight'", 20000);
    }
    await swapInTest(page);
    await key(page, 'KeyB');
    await page.until(`${B('.state')} === 'building'`, 10000);
    const camBack = await page.evaluate(B('.camera'));
    say(Math.hypot(...camBack.pos.map((v, i) => v - camBuild.pos[i])) < 1e-6 && Math.abs(camBack.yaw - camBuild.yaw) < 1e-9, 'B goes back to building, to the camera where it was left');
    say((await page.evaluate('window.__map().mode')) === 'freestyle' && (await page.evaluate('window.__race().freestyle')), 'and the map is freestyle again underneath');
    await takeMouse(page);

    out = { edge, drop, yawOut, at };
    await solidGates(page, out);
    await airStartFlight(page, out, 'quad');
    await key(page, 'KeyB');
    await page.until(`${B('.state')} === 'building'`, 10000);
    await leave(page);
    await page.until(`${B('.state')} === 'off'`, 10000);
    await page.until("window.__craftState().mode === 'flight'", 10000);
    say(true, 'Esc frees the mouse, then leaves building for a free flight');
    const errs = pageErrors(page);
    say(errs.length === 0, `no page errors${errs.length ? `: ${errs.slice(0, 3).join(' | ')}` : ''}`);
  } finally {
    await page.close();
  }
  return out;
}

/*
 * The aircraft swap (#94) on a test flight: ] swaps to the next aircraft
 * in place, the run stays the builder's test of this track, and [ swaps
 * back. While building, ] is the builder's (every key is) and nothing
 * swaps.
 */
async function swapInTest(page) {
  const watch = `(() => {
    const old = window.__lastSwap();
    window.__swapSeen = null;
    window.__swapWatch = setInterval(() => {
      const s = window.__lastSwap();
      if (s && s !== old) { window.__swapSeen = s; clearInterval(window.__swapWatch); }
    }, 5);
    return true;
  })()`;
  const run0 = await page.evaluate('window.__craft().run');
  await page.evaluate(watch);
  await key(page, 'BracketRight');
  await page.until('!!window.__swapSeen', 30000).catch(() => {});
  const after = await page.evaluate(`({ run: window.__craft().run, state: ${B('.state')}, gates: window.__race().gates.length, key: window.__race().key, mode: window.__map().mode })`);
  say(after.run !== run0 && after.state === 'testing' && after.gates === 3 && /\.build\./.test(after.key) && after.mode === 'race',
    `] on the test flight swaps ${run0} for ${after.run} in place, still the test of this track (${after.gates} gates, ${after.key.split('.').pop()})`);
  await page.evaluate(watch);
  await key(page, 'BracketLeft');
  await page.until('!!window.__swapSeen', 30000).catch(() => {});
  say((await page.evaluate('window.__craft().run')) === run0, `and [ swaps back to the ${run0}`);
  await page.evaluate('clearInterval(window.__swapWatch), true');
}

/*
 * A standard gamepad while building: the right shoulder walks the hotbar
 * and the left stick flies, and neither the shoulder nor Y reaches the
 * shell's aircraft swap, which has the same buttons in flight.
 */
async function padWhileBuilding(page) {
  await page.evaluate(`(() => {
    const btn = () => ({ pressed: false, touched: false, value: 0 });
    window.__pad = {
      id: 'Check pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, btn), vibrationActuator: null,
    };
    navigator.getGamepads = () => [window.__pad];
    window.__padSet = (i, on) => { window.__pad.buttons[i] = { pressed: on, touched: on, value: on ? 1 : 0 }; window.__pad.timestamp += 1; };
    return true;
  })()`);
  await frames(page, 3);
  await page.evaluate('window.__swap0 = window.__lastSwap(), true');
  const run0 = await page.evaluate('window.__craft().run');
  const slot0 = await page.evaluate(B('.slot'));
  await page.evaluate('window.__padSet(5, true)');
  await frames(page, 3);
  await page.evaluate('window.__padSet(5, false)');
  await frames(page, 3);
  await page.evaluate('window.__padSet(3, true)');
  await frames(page, 3);
  await page.evaluate('window.__padSet(3, false)');
  await frames(page, 3);
  const slot1 = await page.evaluate(B('.slot'));
  const p0 = await page.evaluate(B('.camera.pos'));
  await page.evaluate('window.__pad.axes[1] = -1, true');
  await frames(page, 6);
  await page.evaluate('window.__pad.axes[1] = 0, true');
  await frames(page, 3);
  const p1 = await page.evaluate(B('.camera.pos'));
  await key(page, 'BracketRight');
  await frames(page, 3);
  const swapped = await page.evaluate('window.__lastSwap() !== window.__swap0');
  say(slot1 === (slot0 + 1) % 9, `the pad's right shoulder walks the hotbar: slot ${slot0 + 1} to ${slot1 + 1}`);
  say(vDist(p0, p1) > 1, `and its left stick flies the camera: ${f1(vDist(p0, p1))} m`);
  say(!swapped && (await page.evaluate('window.__craft().run')) === run0, `neither the shoulder, Y nor ] swapped the aircraft: still the ${run0}`);
  await page.evaluate('navigator.getGamepads = () => [], true');
  await frames(page, 3);
  await key(page, `Digit${slot0 + 1}`);
}

/* The hotbar, its icons, and the controls card. */
async function hotbarAndHelp(page) {
  const st = await page.evaluate(B(''));
  say(st.hotbar.join() === DEFAULT_HOTBAR.join() && st.slot === 0, `nine slots of the common pieces: ${st.hotbar.join(', ')}`);
  /* Each icon is a picture of its piece: drawn, not empty, and no two the
   * same. The start gate's differs from the gate's by its green ring. */
  const icons = await page.evaluate(`(async () => {
    const imgs = [...document.querySelectorAll('.bh-slot img')];
    const out = [];
    for (const img of imgs) {
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let solid = 0;
      for (let i = 3; i < d.length; i += 4) { if (d[i] > 128) { solid += 1; } }
      out.push({ w: c.width, solid: solid / (c.width * c.height), src: img.src.length });
    }
    return { out, distinct: new Set(imgs.map((i) => i.src)).size };
  })()`);
  say(icons.out.length === 9 && icons.out.every((i) => i.w === 96 && i.solid > 0.02) && icons.distinct === 9,
    `each slot shows its piece drawn from its mesh, 96 px: ${icons.out.map((i) => `${(i.solid * 100).toFixed(0)}%`).join(' ')} of each drawn, ${icons.distinct} different`);
  const r = await page.evaluate('window.__build.rects()');
  say(Boolean(r.help), 'the controls card is up on the first visit');
  await key(page, 'KeyH');
  await frames(page, 2);
  const hidden = await page.evaluate('window.__build.rects().help');
  await key(page, 'KeyH');
  await frames(page, 2);
  say(hidden === null && Boolean(await page.evaluate('window.__build.rects().help')), 'H hides it and H brings it back');
  await key(page, 'Digit3');
  await frames(page, 1);
  const s3 = await page.evaluate(B('.piece'));
  await wheel(page, 1);
  const s4 = await page.evaluate(B('.piece'));
  await wheel(page, -1);
  await wheel(page, -1);
  const s2 = await page.evaluate(B('.piece'));
  say(s3 === DEFAULT_HOTBAR[2] && s4 === DEFAULT_HOTBAR[3] && s2 === DEFAULT_HOTBAR[1], `3 picks slot 3 (${s3}), the wheel walks the hotbar (${s4}, then ${s2})`);
  await shot(page, '0-hotbar-and-controls');
}

/* Creative flight, on the keys and the mouse. */
async function flight(page) {
  const here = await page.evaluate(B('.camera'));
  const p0 = [here.pos[0], here.pos[1] + 30, here.pos[2]];
  await lookAlong(page, p0, here.yaw, 0);
  const speed = await page.evaluate(B('.speed'));
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 }, page.sessionId);
  await frames(page, 1);
  const v1 = Math.hypot(...(await page.evaluate(B('.velocity'))));
  await frames(page, 12);
  const v2 = Math.hypot(...(await page.evaluate(B('.velocity'))));
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 }, page.sessionId);
  await frames(page, 1);
  const v3 = Math.hypot(...(await page.evaluate(B('.velocity'))));
  await frames(page, 20);
  const v4 = Math.hypot(...(await page.evaluate(B('.velocity'))));
  const c1 = await page.evaluate(B('.camera'));
  const moved = c1.pos.map((v, i) => v - p0[i]);
  const f = [-Math.sin(here.yaw), 0, -Math.cos(here.yaw)];
  say(vDot(moved, f) > 1 && Math.abs(moved[1]) < 1e-6 && Math.hypot(...vAdd(moved, f, -vDot(moved, f))) < 0.05,
    `W flies along the heading: ${f1(vDot(moved, f))} m ahead, level`);
  say(v1 > 0 && v1 < v2 && v2 > speed * 0.9 && v2 <= speed + 1e-6 && v3 < v2 && v3 > 0 && v4 < 0.5,
    `and eases in and out: ${f1(v1)}, ${f1(v2)} of ${speed} m/s held, ${f1(v3)} then ${f1(v4)} m/s let go`);
  const y0 = (await page.evaluate(B('.camera.pos')))[1];
  await holdKey(page, 'Space', 8);
  const y1 = (await page.evaluate(B('.camera.pos')))[1];
  await frames(page, 20);
  /* Held past the moment Shift waits for a turn key to join it. */
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, modifiers: 8 }, page.sessionId);
  await page.sleep(300);
  await frames(page, 8);
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 }, page.sessionId);
  await frames(page, 20);
  const y2 = (await page.evaluate(B('.camera.pos')))[1];
  say(y1 > y0 + 0.5 && y2 < y1 - 0.5, `Space rises ${f1(y1 - y0)} m, Shift sinks ${f1(y1 - y2)} m`);
  await key(page, 'KeyW');
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 }, page.sessionId);
  await frames(page, 14);
  const sprint = await page.evaluate(`(() => { const s = window.__build.state(); return { on: s.sprint, v: Math.hypot(...s.velocity) }; })()`);
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 }, page.sessionId);
  say(sprint.on && sprint.v > speed * 1.5, `W twice and held sprints: ${f1(sprint.v)} m/s`);
  await key(page, 'Equal');
  const faster = await page.evaluate(B('.speed'));
  await key(page, 'Minus');
  await key(page, 'Minus');
  const slower = await page.evaluate(B('.speed'));
  await key(page, 'Equal');
  say(faster > speed && slower < speed && (await page.evaluate(B('.speed'))) === speed, `= and - set the fly speed: ${speed}, ${faster}, ${slower} m/s`);
  const yaw0 = (await page.evaluate(B('.camera'))).yaw;
  const cx = await page.evaluate('Math.round(innerWidth / 2)');
  const cy = await page.evaluate('Math.round(innerHeight / 2)');
  await moveMouse(page, cx, cy);
  await frames(page, 2);
  const yawA = (await page.evaluate(B('.camera'))).yaw;
  await moveMouse(page, cx + 100, cy);
  await frames(page, 2);
  const yawB = (await page.evaluate(B('.camera'))).yaw;
  say(Math.abs(wrap(yawA - yawB) - 0.24) < 0.02, `the mouse looks: 100 px right turns the camera ${f1((yawA - yawB) / DEG)} degrees right`);
  await moveMouse(page, cx, cy);
  await lookAlong(page, here.pos, yaw0, here.pitch);
}

/* R turns the ghost, G the grid. */
async function turnAndGrid(page, g1, drop) {
  await hold(page, 'gate');
  await lookAt(page, [g1[0] - drop.dx * 20 + drop.dz * 12, g1[1] + 9, g1[2] - drop.dz * 20 - drop.dx * 12], [g1[0] + drop.dz * 12, g1[1], g1[2] - drop.dx * 12]);
  /* R turns about the gate's own up, whatever it stands on: the angle
   * between its travel before and after. */
  const travelOf = ([x, y, z, w]) => [-(2 * (x * z + w * y)), -(2 * (y * z - w * x)), -(1 - 2 * (x * x + y * y))];
  const a = await page.evaluate(B('.ghost.quat'));
  await key(page, 'KeyR');
  await frames(page, 2);
  const b = await page.evaluate(B('.ghost.quat'));
  const turned = Math.acos(Math.max(-1, Math.min(1, vDot(travelOf(a), travelOf(b))))) / DEG;
  say(Math.abs(turned - 15) < 0.01, `R turns the ghost ${turned.toFixed(2)} degrees`);
  await key(page, 'KeyR', { shift: true });
  await frames(page, 2);
  const c = await page.evaluate(B('.ghost.quat'));
  /* To half a degree: Shift is down a frame before R arrives, and that
   * frame sinks the camera and moves the ghost a little on the slope. */
  const backBy = Math.acos(Math.max(-1, Math.min(1, vDot(travelOf(a), travelOf(c))))) / DEG;
  say(backBy < 0.5, `and Shift+R turns it back, to ${backBy.toFixed(3)} degrees`);
  /* The grid, on a ghost hung in the air with Alt held, where it rounds
   * both the place and the heading. */
  await key(page, 'KeyG');
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18, modifiers: 1 }, page.sessionId);
  await frames(page, 3);
  const gg = await page.evaluate(B('.ghost'));
  await shot(page, '4-grid-ghost');
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18 }, page.sessionId);
  const onGrid = (v) => Math.abs(v / 0.5 - Math.round(v / 0.5)) < 1e-6;
  const hdg = headingOfQuat(gg.quat) / DEG;
  say((await page.evaluate(B('.grid'))) && gg.mode === 'air' && onGrid(gg.base[0]) && onGrid(gg.base[2]) && Math.abs(hdg / 15 - Math.round(hdg / 15)) < 1e-6,
    `G snaps it to the grid: base (${f1(gg.base[0])}, ${f1(gg.base[2])}), heading ${hdg.toFixed(2)} degrees`);
  await key(page, 'KeyG');
}

/* O and clicks round the lap. */
async function flyingOrder(page, st) {
  const ids = st.doc.sequence.map((s) => s.elementId);
  const badges = (await page.evaluate(B('.badges'))).map((b) => `${b.text}${b.look === 'start' ? 's' : ''}`).join();
  say(badges === '1s,2,3', `every gate wears its number, the start marked: ${badges}`);
  await key(page, 'KeyO');
  say(Array.isArray(await page.evaluate(B('.order'))), 'O starts the flying order');
  /* A click only with the crosshair on the gate: with it on the world, a
   * click in order mode is nothing, and outside it is a new gate. */
  const clickOn = async (id) => {
    const on = await aimAtGate(page, id, 14);
    say(on, `the crosshair on ${id}`);
    if (on) {
      await click(page, 'left');
      await frames(page, 2);
    }
    return on;
  };
  await clickOn(ids[2]);
  await clickOn(ids[0]);
  const mid = (await page.evaluate(B('.badges'))).map((b) => `${b.text}:${b.look}`).join();
  await shot(page, '5-order-mode');
  await clickOn(ids[1]);
  await page.until(`${B('.order')} === null`, 5000).catch(() => {});
  let order = await page.evaluate(B('.doc.sequence.map((s) => s.elementId).join()'));
  say(order === [ids[2], ids[0], ids[1]].join(), `three clicks set the order and the last one finishes it: ${order === [ids[2], ids[0], ids[1]].join() ? 'gate 3 first' : order}`);
  say(mid === '2:picked,2:waiting,1:start', `the badges follow the clicks as they are made, the one not clicked grey: ${mid}`);
  const now = (await page.evaluate(B('.badges'))).find((b) => b.id === ids[2]);
  say(now && now.text === '1' && now.look === 'start', 'and the gate clicked first is the start now');
  /* A round the clicks did not finish is finished by O before the next. */
  if (await page.evaluate(B('.order'))) {
    await key(page, 'KeyO');
  }
  await key(page, 'KeyO');
  for (const id of ids) {
    await clickOn(id);
  }
  await page.until(`${B('.order')} === null`, 5000).catch(() => {});
  if (await page.evaluate(B('.order'))) {
    await key(page, 'KeyO');
  }
  order = await page.evaluate(B('.doc.sequence.map((s) => s.elementId).join()'));
  say(order === ids.join(), 'O and three more put it back');
}

/* The mouse freed: select, roll in place, the gizmo, undo. */
async function freeEdits(page, id, drop) {
  const before = (await page.evaluate(B('.gates'))).find((g) => g.id === id);
  const hc = before.centre;
  await lookAt(page, [hc[0] - drop.dx * 16 + drop.dz * 10, hc[1] + 5, hc[2] - drop.dz * 16 - drop.dx * 10], hc);
  await freeMouse(page, 20, 360);
  say(!(await page.evaluate(B('.locked'))) && !(await page.evaluate(B('.ghost.visible'))), 'with the mouse free the ghost is gone');
  say(await clickGate(page, id), 'a click on the hung gate selects it');
  await frames(page, 2);
  say(await page.evaluate(B('.gizmo')), 'and brings up its gizmo');
  await shot(page, '7-gizmo');
  for (let i = 0; i < 6; i += 1) {
    await key(page, 'KeyY');
  }
  const rolled = (await page.evaluate(B('.gates'))).find((g) => g.id === id);
  const moved = vDist(rolled.centre, before.centre);
  const upDot = vDot(before.up, rolled.up);
  say(Math.abs(upDot) < 0.01 && moved < 1e-3, `Y six times rolls it a quarter turn onto its side in place (up . up ${upDot.toFixed(3)}, centre moved ${moved.toFixed(4)} m)`);
  await shot(page, '7-hung-gate-on-its-side');
  for (let i = 0; i < 6; i += 1) {
    await key(page, 'KeyY', { shift: true });
  }
  const back = (await page.evaluate(B('.gates'))).find((g) => g.id === id);
  say(back.up.every((v, i) => Math.abs(v - before.up[i]) < 1e-4), 'Shift+Y six times rolls it back');

  /* The up arrow, dragged up the page. */
  const h0 = await page.evaluate("window.__build.handleAt('move-up')");
  await moveMouse(page, h0.x, h0.y);
  await frames(page, 2);
  const onArrow = await page.evaluate(B('.handle'));
  const why = onArrow === 'move-up' ? '' : `; at (${f1(h0.x)}, ${f1(h0.y)}) on a ${await page.evaluate('innerWidth')} by ${await page.evaluate('innerHeight')} page, gizmo ${await page.evaluate(B('.gizmo'))}, locked ${await page.evaluate(B('.locked'))}, camera ${JSON.stringify(await page.evaluate(B('.camera.pos')))}`;
  say(onArrow === 'move-up', `the mouse over the up arrow picks it out: ${onArrow}${why}`);
  /* Only on the arrow: a press on the world would take the mouse back. */
  if (onArrow === 'move-up') {
    await dragMouse(page, h0, { x: h0.x, y: h0.y - 60 });
  }
  await frames(page, 2);
  const raised = (await page.evaluate(B('.gates'))).find((g) => g.id === id);
  const lift = raised.centre[1] - back.centre[1];
  const side = Math.hypot(raised.centre[0] - back.centre[0], raised.centre[2] - back.centre[2]);
  say(lift > 0.3 && side < 1e-6, `the up arrow dragged up raises it ${f1(lift)} m, straight up`);
  await key(page, 'KeyZ', { ctrl: true });
  await frames(page, 2);
  const undone = (await page.evaluate(B('.gates'))).find((g) => g.id === id);
  say(vDist(undone.centre, back.centre) < 1e-6, 'Ctrl+Z puts it back');
  /* The yaw ring, dragged a quarter of the way round its near side: its
   * far side crosses the other two rings on the page. */
  await frames(page, 2);
  const r0 = await page.evaluate("window.__build.handleAt('turn-yaw', 225)");
  const r1 = await page.evaluate("window.__build.handleAt('turn-yaw', 315)");
  await moveMouse(page, r0.x, r0.y);
  await frames(page, 2);
  const onRing = await page.evaluate(B('.handle'));
  say(onRing === 'turn-yaw', `the mouse over the yaw ring picks it out: ${onRing}`);
  if (onRing === 'turn-yaw') {
    await dragMouse(page, r0, r1, 10);
  }
  await frames(page, 2);
  const turned = (await page.evaluate(B('.gates'))).find((g) => g.id === id);
  const yawed = Math.acos(Math.max(-1, Math.min(1, vDot(turned.travel, back.travel)))) / DEG;
  say(yawed > 20 && vDist(turned.centre, back.centre) < 1e-3, `the yaw ring dragged turns it ${f1(yawed)} degrees about its opening`);
  await shot(page, '7-gizmo-turned');
  await key(page, 'KeyZ', { ctrl: true });
  await frames(page, 2);
  const again = (await page.evaluate(B('.gates'))).find((g) => g.id === id);
  say(vDot(again.travel, back.travel) > 1 - 1e-9, 'and Ctrl+Z turns it back');
  await key(page, 'Escape');
  await frames(page, 2);
  say((await page.evaluate(B('.selected'))) === null, 'Esc with the mouse free drops the selection');
  await takeMouse(page);
}

/* ------------------------------------------------------------------ */
/* Solid gates and the air start                                       */
/* ------------------------------------------------------------------ */

const OPENING = openingsOf({ type: 'gate', dims: ELEMENTS.gate.dims })[0];
const STACK = openingsOf({ type: 'doubleStack', dims: ELEMENTS.doubleStack.dims });

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

/* How far a point is from a collider as window.__contacts().obstacle
 * names it: outside a box, or off a capsule's surface. */
function solidGap(s, p) {
  if (s.box) {
    const o = p.map((v, i) => Math.max(s.a[i] - v, 0, v - s.b[i]));
    return Math.hypot(...o);
  }
  const d = s.b.map((v, i) => v - s.a[i]);
  const dd = vDot(d, d);
  const t = dd > 1e-12 ? Math.max(0, Math.min(1, vDot(p.map((v, i) => v - s.a[i]), d) / dd)) : 0;
  return Math.max(0, Math.hypot(...p.map((v, i) => v - s.a[i] - d[i] * t)) - s.r);
}

/* Hang the piece in hand level in the air, the builder's air distance in
 * front of an eye looking along `yaw`. Its race frame. */
async function hangGate(page, eye, yaw) {
  await lookAlong(page, eye, yaw, 0);
  return placeHere(page, { air: true });
}

/* Pick up a placed gate with F and put it down, level, with its opening
 * at p flown along t: the camera the air distance back, Alt and a click. */
async function moveTo(page, id, p, t) {
  if (!(await aimAtGate(page, id))) {
    console.log(`    the crosshair would not settle on ${id}`);
  }
  await key(page, 'KeyF');
  await page.until(`${B('.carry')} !== null`, 5000);
  const dist = await page.evaluate(B('.airDistance'));
  await lookAlong(page, vAdd(p, t, -dist), Math.atan2(-t[0], -t[2]), 0);
  await click(page, 'left', { alt: true });
  await page.until(`${B('.carry')} === null`, 10000);
}

/* Right click on a placed gate, which selects it and frees the mouse onto
 * its gizmo, then Delete, and the mouse taken back. */
async function removeById(page, id) {
  const n = await page.evaluate(B('.gates.length'));
  if (!(await aimAtGate(page, id))) {
    console.log(`    the crosshair would not settle on ${id}`);
  }
  await click(page, 'right');
  await page.until(`${B('.selected')} === ${JSON.stringify(id)} && !${B('.locked')}`, 5000);
  await key(page, 'Delete');
  await page.until(`${B('.gates.length')} === ${n - 1}`, 10000);
  await takeMouse(page);
}

/* The world yaw, degrees, of a craft pointed along a gate's travel. */
const yawAlong = (t) => (Math.atan2(-t[0], -t[2]) * 180) / Math.PI;

async function solidGates(page, { edge, drop, yawOut, at }) {
  console.log('  solid gates');
  const side = [drop.dz, 0, -drop.dx];
  const eye = at(edge + 25, drop.h + 10);
  const where = vAdd(eye, [drop.dx, 0, drop.dz], (await page.evaluate(B('.airDistance'))));
  const probeG = { centre: where, travel: [drop.dx, 0, drop.dz], up: [0, 1, 0] };
  const count0 = (await page.evaluate('window.__colliders()')).count;
  say(await chord(page, probeG, onUpright(probeG)) === null && await chord(page, probeG, where) === null, 'before: nothing solid in the air out over the drop');

  await hold(page, 'gate');
  const g = await hangGate(page, eye, yawOut);
  const under = await page.evaluate(`window.__heightAt(${g.centre[0]}, ${g.centre[2]})`);
  say(g.centre[1] - under > 20, `a gate hung ${f1(g.centre[1] - under)} m over the ground out past the edge`);
  say((await page.evaluate('window.__colliders()')).count > count0, `its members are colliders: ${count0} before, ${(await page.evaluate('window.__colliders()')).count} after`);
  const kUp = await chord(page, g, onUpright(g));
  const kHole = await chord(page, g, g.centre);
  say(FRAME.includes(kUp) && kHole === null, `the craft's sweep meets its upright (${kUp}) and not its opening (${kHole})`);

  /* Fly into it and through it, in a test flight, on the shell's own
   * contact and the crash physics. */
  await key(page, 'KeyB');
  await page.until(`${B('.state')} === 'testing' && window.__craftState().mode === 'flight'`, 30000);
  const crash0 = await page.evaluate('window.__crash()');
  say(crash0.runDamage === true, `crash damage is on for the run (runDamage ${crash0.runDamage})`);
  const throwAt = async (c, back, speed) => {
    const p = vAdd(c, g.travel, -back);
    const v = g.travel.map((x) => x * speed);
    await page.evaluate(`window.__crashThrow({ x: ${p[0]}, y: ${p[1]}, z: ${p[2]}, yaw: ${yawAlong(g.travel)}, vx: ${v[0]}, vy: ${v[1]}, vz: ${v[2]} })`);
  };
  const plane = vDot(g.centre, g.travel);
  /* On the plant's clock: two seconds of flight is 24 m at 12 m/s, however
   * long a loaded software rasteriser takes to draw them. */
  const past = async (d) => simWait(page, 2, `(() => { const c = window.__craftState(); return c.worldX * ${g.travel[0]} + c.worldY * ${g.travel[1]} + c.worldZ * ${g.travel[2]} > ${plane + d}; })()`);
  await throwAt(g.centre, 2.5, 12);
  const through = await past(2);
  await page.sleep(300);
  /*
   * WHAT RECORDS A HIT. Since #79 the plant meets the solids it holds with
   * its own parts, every step, and the shell's sweep drops its contact on
   * them, so the shell's lastHitKind stays 'none' through a hit the plant
   * took. The plant's count of parts on a held solid (sim_obstacle_contacts,
   * logged per step by window.__contacts().obstacle with the held solid
   * nearest the craft) is the measurement now, and both are read: a clean
   * pass touches neither, a hit on the upright is a plant contact on a
   * built frame member that is that upright.
   */
  const clean = await page.evaluate('({ c: window.__craftState(), k: window.__crash(), o: window.__contacts().obstacle })');
  say(through && clean.c.lastHitKind === 'none' && clean.o.length === 0 && clean.k.events === crash0.events,
    `through the opening at 12 m/s: out the far side, touched ${clean.c.lastHitKind}, ${clean.o.length} steps on a held solid, damage events ${clean.k.events - crash0.events}`);
  await throwAt(onUpright(g), 2.5, 12);
  await page.until("window.__contacts().obstacle.length > 0 || window.__craftState().lastHitKind !== 'none'", 15000).catch(() => {});
  await page.sleep(400);
  await shot(page, '8-into-the-built-gate');
  const hit = await page.evaluate('({ c: window.__craftState(), k: window.__crash(), o: window.__contacts().obstacle })');
  const first = hit.o[0];
  const offUpright = first && first.solid ? solidGap(first.solid, onUpright(g)) : Infinity;
  say(Boolean(first) && first.built && FRAME.includes(first.kind) && offUpright < 0.1,
    first
      ? `into its upright at 12 m/s: the plant's parts meet a held solid on ${hit.o.length} steps, first a built ${first.kind} ${f1(offUpright * 100)} cm from the upright (${first.parts} parts)`
      : `into its upright at 12 m/s: no plant contact on a held solid, the shell's sweep says ${hit.c.lastHitKind}`);
  say(hit.k.events > clean.k.events, `and the crash physics took it: ${hit.k.events - clean.k.events} damage events, flags ${JSON.stringify(hit.k.flagNames)}`);
  await key(page, 'KeyB');
  await page.until(`${B('.state')} === 'building'`, 10000);
  await takeMouse(page);

  /* Move it: F picks it up, and a click puts it down twelve metres over. */
  await moveTo(page, g.id, vAdd(g.centre, side, 12), g.travel);
  const m = (await page.evaluate(B('.gates'))).find((x) => x.id === g.id);
  const moved = vDist(m.centre, g.centre);
  const kOld = await chord(page, g, onUpright(g));
  const kNew = await chord(page, m, onUpright(m));
  say(moved > 11 && kOld === null && FRAME.includes(kNew), `F and a click moved it ${f1(moved)} m: the old upright is air (${kOld}), the new one solid (${kNew})`);

  /* A right click on it and Delete: nothing of it is left. */
  await removeById(page, g.id);
  const kGone = await chord(page, m, onUpright(m));
  const kHoleGone = await chord(page, m, m.centre);
  const count1 = (await page.evaluate('window.__colliders()')).count;
  say(kGone === null && kHoleGone === null && count1 === count0, `a right click and Delete removed it: nothing solid where it stood (${kGone}, ${kHoleGone}), ${count1} colliders as before it was placed`);

  /* A double stack: both openings open, the bar between them solid. */
  await hold(page, 'doubleStack');
  const s = await hangGate(page, eye, yawOut);
  const lift = STACK[1].centreY - STACK[0].centreY;
  const upper = vAdd(s.centre, s.up, lift);
  const bar = vAdd(s.centre, s.up, lift / 2);
  const k0 = await chord(page, s, s.centre);
  const k1 = await chord(page, s, upper);
  const kb = await chord(page, s, bar);
  say(k0 === null && k1 === null && kb === 'gate', `the stack's lower opening (${k0}) and upper one (${k1}) are open and the bar between them solid (${kb})`);
  await removeById(page, s.id);
  await hold(page, 'gate');
  say((await page.evaluate('window.__colliders()')).count === count0, 'removed, and back to placing gates');
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
  await hold(page, 'gate');
  const g = await hangGate(page, eye, yawOut);
  /* And one after it, so the start gate is not also the whole lap. */
  await hangGate(page, vAdd(eye, [drop.dx, 0, drop.dz], 30), yawOut);
  /* The flying order: O, the hung gate, O. */
  await key(page, 'KeyO');
  await aimAtGate(page, g.id, 14);
  await click(page, 'left');
  await frames(page, 2);
  if (await page.evaluate(B('.order'))) {
    await key(page, 'KeyO');
  }
  const first = (await page.evaluate(B('.gates')))[0];
  say(first.id === g.id, 'O and a click on the hung gate make it the start');
  const af = await page.evaluate('window.__ui.settings.airframe');
  const want = airStartSpeed(airframeById(af));
  await key(page, 'KeyB');
  await page.until(`${B('.state')} === 'testing' && window.__craftState().mode === 'flight'`, 30000);
  await frames(page, 3);
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
  await shot(page, `9-air-start-${craft.replace(/ /g, '-')}`);

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
  /* On the plant's clock, not the wall's: a frame carries at most 100 ms
   * of flight, so at swiss2's second a frame on the software renderer a
   * minute of wall is six seconds of flight, short of the 7.5 m the quad
   * climbs out of its hover to fly. Twenty seconds of flight, however long
   * that takes. */
  const simT0 = (await page.evaluate('window.__crash()')).simT;
  await page.until(`window.__race().next === 1 || window.__crash().simT - ${simT0} > 20`, 900000).catch(() => {});
  await page.evaluate('window.__pilot = false');
  const r = await page.evaluate('({ next: window.__race().next, lap: window.__race().lapStartMs, c: window.__craftState() })');
  if (r.next !== 1) {
    const tr = await page.evaluate('window.__trail');
    console.log(`    the pilot's trail, every 20th frame [along, side, up, speed, banner, hit]: ${JSON.stringify(tr.filter((_, i) => i % 20 === 0).slice(0, 40))}`);
  }
  say(r.next === 1 && r.lap != null && r.c.lastHitKind === 'none', `flown through the start gate: the lap clock starts, next is gate ${r.next + 1}, touched ${r.c.lastHitKind}`);
  await page.sleep(300);
}

/* ------------------------------------------------------------------ */
/* Every piece, the inventory, undo, copy, and an old saved track      */
/* ------------------------------------------------------------------ */

/*
 * A line for them: the flattest 150 m of dry ground on the map, level
 * within 2 m from 30 m before its start to its end, with nothing solid in
 * the air over it from one to eight metres up and ten metres either side,
 * which is the pylon's square on its left and the clip on its right.
 */
async function clearLine(page) {
  return page.evaluate(`(() => {
    const H = window.__heightAt;
    const cands = [];
    for (let x = -2400; x <= 2400; x += 24) {
      for (let z = -2400; z <= 2400; z += 24) {
        for (let k = 0; k < 8; k += 1) {
          const a = k * Math.PI / 4;
          const dx = Math.sin(a);
          const dz = Math.cos(a);
          let lo = Infinity;
          let hi = -Infinity;
          for (let s = -30; s <= 120; s += 10) {
            for (const o of [-10, 0, 10]) {
              const h = H(x + dx * s + dz * o, z + dz * s - dx * o);
              lo = Math.min(lo, h);
              hi = Math.max(hi, h);
            }
          }
          if (Number.isFinite(lo) && hi - lo < 2) {
            cands.push({ x, z, dx, dz, h: H(x, z), flat: hi - lo });
          }
        }
      }
    }
    cands.sort((p, q) => p.flat - q.flat);
    const seen = {};
    let nWet = 0;
    const wet = (x, z) => { const w = typeof window.__water === 'function' ? window.__water(x, z) : null; return Boolean(w && w.plant != null); };
    for (const c of cands.slice(0, 20000)) {
      if ([-30, 0, 45, 90, 120].some((s) => wet(c.x + c.dx * s, c.z + c.dz * s))) {
        nWet += 1;
        continue;
      }
      let clear = true;
      for (const o of [-10, -5, 0, 5, 10]) {
        for (const y of [1, 4, 8]) {
          const sx = c.x + c.dz * o;
          const sz = c.z - c.dx * o;
          const a = [sx - c.dx * 30, H(sx - c.dx * 30, sz - c.dz * 30) + y, sz - c.dz * 30];
          const b = [sx + c.dx * 120, H(sx + c.dx * 120, sz + c.dz * 120) + y, sz + c.dz * 120];
          const k = window.__hit(a[0], a[1], a[2], b[0], b[1], b[2]).kind;
          if (k) { clear = false; seen[k] = (seen[k] || 0) + 1; }
        }
      }
      if (clear) { return c; }
    }
    return { none: true, cands: cands.length, wet: nWet, seen };
  })()`);
}

/* A track saved by the builder before the creative mode, for this map,
 * seeded into the library before the page loads. */
async function oldTrack() {
  const doc = JSON.parse(await readFile(join(root, 'tests/fixtures/map-track-v4.json'), 'utf8'));
  doc.map = opts.map;
  return doc;
}

async function piecesStage() {
  console.log(`every piece, undo and copy on ${opts.map}`);
  const old = await oldTrack();
  const seed = [...seedFor(null), `try {
    const lib = JSON.parse(localStorage.getItem(${JSON.stringify(LIBRARY)}) || '{}');
    if (!lib[${JSON.stringify(old.id)}]) {
      lib[${JSON.stringify(old.id)}] = ${JSON.stringify(old)};
      localStorage.setItem(${JSON.stringify(LIBRARY)}, JSON.stringify(lib));
    }
  } catch (e) { /* storage refused; the old track check will say so */ }`];
  const page = await openPage({ root, width: 1280, height: 720, url: `/index.html?map=${opts.map}`, seed });
  try {
    await flyAndBuild(page);
    await key(page, 'KeyN');
    await page.until(`${B('.gates.length')} === 0`, 10000);
    const found = await clearLine(page);
    const flat = found && !found.none ? found : null;
    say(Boolean(flat), `a clear, level line for them: ${flat ? `(${f1(flat.x)}, ${f1(flat.h)}, ${f1(flat.z)})` : JSON.stringify(found)}`);
    if (!flat) {
      return;
    }
    const dir = [flat.dx, 0, flat.dz];
    const sideV = [flat.dz, 0, -flat.dx];
    const H = async (x, z) => page.evaluate(`window.__heightAt(${x}, ${z})`);
    const spotAt = async (s) => {
      const p = vAdd([flat.x, 0, flat.z], dir, s);
      p[1] = await H(p[0], p[2]);
      return p;
    };
    const eyeFor = (spot) => vAdd(vAdd(spot, dir, -18), [0, 1, 0], 6);

    /* The inventory: E, a tile dragged onto slot 9. */
    await key(page, 'KeyE');
    await page.until(B('.inventory'), 5000);
    say(!(await page.evaluate(B('.locked'))), 'E opens the inventory and frees the mouse');
    const rects = await page.evaluate('window.__build.rects()');
    const shelves = await page.evaluate("[...document.querySelectorAll('.bh-inv h4')].map((h) => h.textContent)");
    say(rects.tiles.length === PIECES.length && PIECES.every((p) => rects.tiles.some((t) => t.id === p.id)), `every piece is in it, ${rects.tiles.length}, on ${shelves.length} shelves: ${shelves.join(', ')}`);
    say(!rects.tiles.some((t) => RETIRED_HOOPS.includes(t.id)), `and no retired hoop: ${rects.tiles.filter((t) => /^hoop/.test(t.id)).map((t) => t.id).join(', ')}`);
    await shot(page, '10-inventory');
    const tile = rects.tiles.find((t) => t.id === 'pylonRight');
    await dragMouse(page, tile, rects.slots[8], 10);
    await frames(page, 2);
    say((await page.evaluate(B('.hotbar[8]'))) === 'pylonRight', 'a tile dragged onto slot 9 puts that piece there');
    await key(page, 'KeyE');
    await page.until(`!${B('.inventory')}`, 5000);
    await takeMouse(page);

    /* Every piece, each with a left click, 14 m apart along the line. The
     * start gate goes last, so it is seen to take the start. */
    const order = [...PIECES.filter((p) => !p.start), PIECES.find((p) => p.start)];
    const placed = [];
    for (let i = 0; i < order.length; i += 1) {
      const p = order[i];
      await hold(page, p.id);
      const spot = await spotAt(-20 + 14 * i);
      await lookAt(page, eyeFor(spot), spot);
      const g = await placeHere(page);
      placed.push({ piece: p, id: g.id, eye: eyeFor(spot), spot });
    }
    let st = await page.evaluate(B(''));
    const types = placed.map((x) => st.doc.elements.find((e) => e.id === x.id).type).join();
    say(types === order.map((p) => p.type).join(), `every piece placed with a left click: ${types}`);
    const startId = placed[placed.length - 1].id;
    say(st.doc.sequence[0].elementId === startId && st.doc.sequence.length === order.length, 'the start gate piece made its gate the start');
    const right = placed.find((x) => x.piece.id === 'pylonRight');
    say(st.doc.sequence.find((q) => q.elementId === right.id).passSide === 'right', 'and the right hand pylon is passed on its right');
    const mid = await spotAt(50);
    await lookAt(page, vAdd(vAdd(vAdd(mid, dir, -40), sideV, -70), [0, 1, 0], 30), vAdd(mid, [0, 1, 0], 2));
    await shot(page, '10-every-piece');

    /* A right click on the flagged gate selects it and frees the mouse
     * onto its gizmo, the owner's ask; a right click on it again removes
     * it. A right click on the world with the mouse free takes it back. */
    const flagged = placed.find((x) => x.piece.id === 'flaggedGate');
    const n0 = st.gates.length;
    const cols0 = (await page.evaluate('window.__colliders()')).count;
    await aimAtGate(page, flagged.id, 7);
    await click(page, 'right');
    await page.until(`!${B('.locked')}`, 5000).catch(() => {});
    await frames(page, 2);
    const sel = await page.evaluate(`(() => { const s = window.__build.state(); return { selected: s.selected, locked: s.locked, gizmo: s.gizmo, gates: s.gates.length }; })()`);
    say(sel.selected === flagged.id && !sel.locked && sel.gizmo && sel.gates === n0,
      `a right click on the flagged gate selects it, frees the mouse and brings up its gizmo, and removes nothing: ${JSON.stringify(sel)}`);
    await shot(page, '10-right-click-gizmo');
    await click(page, 'right');
    await page.until(`${B('.gates.length')} === ${n0 - 1}`, 10000).catch(() => {});
    const cols1 = (await page.evaluate('window.__colliders()')).count;
    say(!(await page.evaluate(B('.gates'))).some((g) => g.id === flagged.id) && cols1 < cols0 && (await page.evaluate(B('.selected'))) === null,
      `a right click on it again, selected, removes it and its solids (${cols0} to ${cols1} colliders)`);
    const sky = vAdd(eyeFor(await spotAt(0)), [0, 40, 0], 1);
    await lookAt(page, sky, vAdd(sky, [0, 1, 0], 10));
    await frames(page, 2);
    await click(page, 'right');
    await page.until(B('.locked'), 5000).catch(() => {});
    say(await page.evaluate(B('.locked')), 'a right click on the empty sky with the mouse free takes the mouse back');
    await takeMouse(page);
    /* Delete with the mouse taken removes the gate under the crosshair. */
    const doomed = placed.find((x) => x.piece.id === 'wideGate3');
    await aimAtGate(page, doomed.id, 7);
    await key(page, 'Delete');
    await page.until(`${B('.gates.length')} === ${n0 - 2}`, 10000).catch(() => {});
    say(!(await page.evaluate(B('.gates'))).some((g) => g.id === doomed.id), 'Delete removes the gate the crosshair is on');
    await key(page, 'KeyZ', { ctrl: true });
    await page.until(`${B('.gates.length')} === ${n0 - 1}`, 10000).catch(() => {});
    say((await page.evaluate(B('.gates'))).some((g) => g.id === doomed.id), 'and Ctrl+Z puts it back');

    /* A middle click takes a placed piece in hand: from its hotbar slot
     * when it has one, into the slot in hand when it has not. */
    const middle = async (pieceId) => {
      await hold(page, 'gate');
      const before = await page.evaluate(`(() => { const s = window.__build.state(); return { bar: s.hotbar, slot: s.slot }; })()`);
      const target = placed.find((x) => x.piece.id === pieceId);
      await aimAtGate(page, target.id, 7);
      await click(page, 'middle');
      await frames(page, 2);
      const after = await page.evaluate(`(() => { const s = window.__build.state(); return { piece: s.piece, slot: s.slot, bar: s.hotbar }; })()`);
      const want = before.bar.indexOf(pieceId) >= 0 ? before.bar.indexOf(pieceId) : before.slot;
      return { ok: after.piece === pieceId && after.slot === want && after.bar[want] === pieceId, onBar: before.bar.includes(pieceId), slot: after.slot };
    };
    const onBar = await middle('wideGate3');
    say(onBar.ok && onBar.onBar, `a middle click on the 3 m gate takes it in hand from its slot, ${onBar.slot + 1}`);
    const bar = await page.evaluate(B('.hotbar'));
    const loose = placed.find((x) => !bar.includes(x.piece.id) && !x.piece.start && x.piece.id !== 'flaggedGate' && x.piece.id !== 'gate');
    if (loose) {
      const offBar = await middle(loose.piece.id);
      say(offBar.ok && !offBar.onBar, `and on the ${loose.piece.id}, not on the hotbar, into the slot in hand, ${offBar.slot + 1}`);
    } else {
      say(false, `a placed piece that is not on the hotbar, for the middle click: ${bar.join()}`);
    }

    /* F picks up the wide 5 m gate, a click puts it down six metres over. */
    const wide5 = placed.find((x) => x.piece.id === 'wideGate5');
    const w0 = (await page.evaluate(B('.gates'))).find((g) => g.id === wide5.id);
    await aimAtGate(page, wide5.id, 7);
    await key(page, 'KeyF');
    await page.until(`${B('.carry')} !== null`, 5000);
    const carried = await page.evaluate(B('.carry'));
    say(carried.id === wide5.id && carried.piece === 'wideGate5', `F picks it up: carrying ${carried.piece}`);
    const to = vAdd(wide5.spot, sideV, 6);
    await lookAt(page, eyeFor(to), to);
    await shot(page, '10-carrying');
    await click(page, 'left');
    await page.until(`${B('.carry')} === null`, 10000);
    const w1 = (await page.evaluate(B('.gates'))).find((g) => g.id === wide5.id);
    const shift = vDot(vAdd(w1.centre, w0.centre, -1), sideV);
    say(Math.abs(shift - 6) < 0.3 && vDot(w1.travel, w0.travel) > 1 - 1e-9, `and a click puts it down ${f1(shift)} m over, turned as it was`);
    const kOld = await chord(page, w0, vAdd(w0.centre, vCross(w0.up, w0.travel), 2.5 + 0.03), 3, 3);
    say(kOld === null, `where it stood is air now (${kOld})`);

    /* Undo and redo the move, and a placement. */
    await key(page, 'KeyZ', { ctrl: true });
    await frames(page, 2);
    const u1 = (await page.evaluate(B('.gates'))).find((g) => g.id === wide5.id);
    await key(page, 'KeyY', { ctrl: true });
    await frames(page, 2);
    const u2 = (await page.evaluate(B('.gates'))).find((g) => g.id === wide5.id);
    await key(page, 'KeyZ', { ctrl: true });
    await key(page, 'KeyZ', { ctrl: true, shift: true });
    await frames(page, 2);
    const u3 = (await page.evaluate(B('.gates'))).find((g) => g.id === wide5.id);
    say(vDist(u1.centre, w0.centre) < 1e-6 && vDist(u2.centre, w1.centre) < 1e-6 && vDist(u3.centre, w1.centre) < 1e-6,
      'Ctrl+Z puts the move back, Ctrl+Y and Ctrl+Shift+Z do it again');
    const nBefore = await page.evaluate(B('.gates.length'));
    await key(page, 'KeyZ', { ctrl: true });
    await key(page, 'KeyZ', { ctrl: true });
    const nUndo = await page.evaluate(B('.gates.length'));
    await key(page, 'KeyY', { ctrl: true });
    await key(page, 'KeyY', { ctrl: true });
    const nRedo = await page.evaluate(B('.gates.length'));
    say(nUndo === nBefore + 1 && nRedo === nBefore, `and past it, the removal: ${nBefore} gates, ${nUndo} undone, ${nRedo} redone`);

    /* Ctrl+D: a copy of the 3 m gate, put down beside it. */
    const wide3 = placed.find((x) => x.piece.id === 'wideGate3');
    const s0 = (await page.evaluate(B('.gates'))).find((g) => g.id === wide3.id);
    await aimAtGate(page, wide3.id, 7);
    await key(page, 'KeyD', { ctrl: true });
    await page.until(`${B('.carry')} !== null`, 5000);
    const copy = await page.evaluate(B('.carry'));
    const spotC = vAdd(wide3.spot, sideV, -7);
    await lookAt(page, vAdd(eyeFor(spotC), sideV, 5), spotC);
    const nC = await page.evaluate(B('.gates.length'));
    await click(page, 'left');
    await page.until(`${B('.gates.length')} === ${nC + 1}`, 10000);
    st = await page.evaluate(B(''));
    const dup = st.gates.find((g) => g.id === st.selected);
    const dupType = st.doc.elements.find((e) => e.id === st.selected).type;
    say(copy.id === null && copy.piece === 'wideGate3' && dupType === 'wideGate3' && vDot(dup.travel, s0.travel) > 1 - 1e-9,
      `Ctrl+D copies it into the hand, and a click places a ${dupType} turned as the original`);

    /* The ghost goes red on another gate. */
    await hold(page, 'gate');
    const gate = placed.find((x) => x.piece.id === 'gate');
    await lookAt(page, gate.eye, gate.spot);
    await frames(page, 3);
    const red = await page.evaluate(B('.ghost'));
    say(red.trouble && red.trouble.code === 'overlap' && red.colour === '#ff3b3b', `on a gate already there the ghost is red: ${JSON.stringify(red.trouble)}, ${red.colour}`);
    say(/inside gate/.test(await page.evaluate(B('.hud'))), 'and the status line says why');
    await shot(page, '10-ghost-red');

    /* 11: a track saved before this builder. */
    const want = raceGatesOf(normalize(old).doc);
    for (let i = 0; i < 8 && (await page.evaluate(B('.doc.id'))) !== old.id; i += 1) {
      await key(page, 'KeyO', { ctrl: true });
      await frames(page, 2);
    }
    st = await page.evaluate(B(''));
    const sameGates = st.gates.length === want.length && st.gates.every((g, i) => vDist(g.centre, [want[i].centre.x, want[i].centre.y, want[i].centre.z]) < 1e-6);
    say(st.doc.id === old.id && sameGates, `an old saved track opens with Ctrl+O: ${st.doc.name}, ${st.gates.length} gates where they were`);
    say(st.doc.sequence[3].passSide === 'right' && st.doc.schemaVersion === 4, 'its pylon still passed on its right, still schemaVersion 4');
    say(st.badges.map((b) => b.text).join() === '1,2,3,4', `and every gate wears its number: ${st.badges.map((b) => b.text).join()}`);
    await key(page, 'KeyB');
    await page.until(`${B('.state')} === 'testing' && window.__craftState().mode === 'flight'`, 30000);
    const race = await page.evaluate('({ n: window.__race().gates.length, freestyle: window.__race().freestyle })');
    say(race.n === 4 && !race.freestyle, `and B flies it: a race of ${race.n} gates`);
    await key(page, 'KeyB');
    await page.until(`${B('.state')} === 'building'`, 10000);
    await leave(page);
    const errs = pageErrors(page);
    say(errs.length === 0, `no page errors${errs.length ? `: ${errs.slice(0, 3).join(' | ')}` : ''}`);
  } finally {
    await page.close();
  }
}

/* ------------------------------------------------------------------ */
/* The racing line, the geometry warnings and a lap of one gate        */
/* ------------------------------------------------------------------ */

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
    await leave(page);
    await page.until(`${B('.state')} === 'off'`, 10000);
    const errs = pageErrors(page);
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
    const errs = pageErrors(page);
    say(errs.length === 0, `no page errors${errs.length ? `: ${errs.slice(0, 3).join(' | ')}` : ''}`);
  } finally {
    await page.close();
  }
}

/* Until `cond` holds in the page or the plant has flown `seconds` more: a
 * software rasteriser draws a valley at a frame or two a second, and each
 * frame carries at most 100 ms of sim time, so wall time says nothing. */
async function simWait(page, seconds, cond) {
  const t0 = await page.evaluate('window.__crash().simT');
  await page.until(`(${cond}) || window.__crash().simT > ${t0 + seconds}`, 300000).catch(() => {});
  return page.evaluate(`Boolean(${cond})`);
}

/* A piece in hand, clicked onto the ground at `spot` from 24 m back and 7
 * m up. The new gate's id. */
async function placeOn(page, pieceId, spot, dir) {
  await hold(page, pieceId);
  await lookAt(page, vAdd(vAdd(spot, dir, -24), [0, 1, 0], 7), spot);
  const g = await placeHere(page);
  return g.id;
}

/*
 * THE PLANE SIZED GATES, in the Slow Stick's page, on the clear line found
 * above: a 3 m wide gate, 45 m on a pylon pair, 45 m on a single pylon.
 * Each is placed from the hotbar with a left click, and seen. Then they
 * are flown: the Slow Stick thrown along the line at 9 m/s through the
 * wide gate, between the pylons and round the pylon on its set side, each
 * pass counted by the race; the pylon's other side does not count until
 * it is replaced by the other pylon piece; its wingtips into the cone with
 * crash damage on. Saved, the page reloaded, and the same three types come
 * back with the pylon's side.
 */
async function planeGates(page) {
  console.log(`  plane sized gates, ${opts.map}`);
  const found = await clearLine(page);
  const flat = found && !found.none ? found : null;
  if (!flat) {
    console.log(`    no line: ${JSON.stringify(found)}`);
  }
  say(Boolean(flat), `a clear, level line for them: ${flat ? `(${f1(flat.x)}, ${f1(flat.h)}, ${f1(flat.z)}), level within ${flat.flat.toFixed(2)} m` : 'none'}`);
  if (!flat) {
    return;
  }
  const dir = [flat.dx, 0, flat.dz];
  const side = [flat.dz, 0, -flat.dx];
  const H = async (x, z) => page.evaluate(`window.__heightAt(${x}, ${z})`);
  const plan = [['wideGate3', 0], ['pylonPair', 45], ['pylon', 90]];
  const placed = [];
  const spots = [];
  for (const [type, s] of plan) {
    const spot = vAdd([flat.x, 0, flat.z], dir, s);
    spot[1] = await H(spot[0], spot[2]);
    spots.push(spot);
    await hold(page, type);
    await lookAt(page, vAdd(vAdd(spot, dir, -24), [0, 1, 0], 7), spot);
    await shot(page, `16-${opts.map}-${type}-ghost`);
    placed.push({ type, id: (await placeHere(page)).id });
  }
  const types = (await page.evaluate(B('.doc.elements'))).slice(-3).map((e) => e.type).join();
  say(types === 'wideGate3,pylonPair,pylon', `placed a wide gate, a pylon pair and a pylon from the hotbar: ${types}`);
  let G = await page.evaluate(B('.gates'));
  say(G[0].id === placed[0].id, 'the wide gate, placed first, is the start');
  const byId = (id) => G.find((g) => g.id === id);
  const wide = byId(placed[0].id);
  const pair = byId(placed[1].id);
  const cone = byId(placed[2].id);
  const coneBase = (await page.evaluate(B('.doc.elements'))).find((e) => e.id === placed[2].id).position;
  const coneAxis = [coneBase.x, coneBase.z, -coneBase.y];
  const lateral = vDot(vAdd(cone.centre, coneAxis, -1), side);
  /* Its 15 m clearance and the wing class's 5 m pad: a 35 m square with
   * its inner edge on the axis, so its centre 17.5 m out. */
  say(Math.abs(Math.abs(lateral) - 17.5) < 1e-3, `the pylon scores a square whose centre is ${f1(Math.abs(lateral))} m to the pilot's left of it`);

  const mid = vAdd([flat.x, flat.h, flat.z], dir, 45);
  await lookAt(page, vAdd(vAdd(vAdd(mid, dir, -95), side, -30), [0, 1, 0], 22), vAdd(mid, [0, 1, 0], 3));
  await frames(page, 3);
  await shot(page, `16-${opts.map}-plane-gates`);

  await key(page, 'KeyB');
  await page.until(`${B('.state')} === 'testing' && window.__craftState().mode === 'flight'`, 30000);
  await frames(page, 3);
  const crash0 = await page.evaluate('window.__crash()');
  say(crash0.runDamage === true, `crash damage is on for the run (runDamage ${crash0.runDamage})`);
  await page.evaluate("(document.querySelector('.osd-air-hint-btn') || { click() {} }).click(), true");
  const race0 = await page.evaluate('({ n: window.__race().gates.length, next: window.__race().next })');
  say(race0.n === G.length, `the race has all ${race0.n} gates`);
  const SPEED = 9;
  /* Through gate g at `c`, from 6 m back, until the race moves on or 4 s.
   * Fresh each time, so one throw's damage is not the next one's. */
  const flyThrough = async (g, c, want) => {
    const from = vAdd(c, g.travel, -6);
    const v = g.travel.map((x) => x * SPEED);
    await page.evaluate(`window.__crashThrow({ fresh: true, x: ${from[0]}, y: ${from[1]}, z: ${from[2]}, yaw: ${yawAlong(g.travel)}, vx: ${v[0]}, vy: ${v[1]}, vz: ${v[2]} })`);
    const ok = await simWait(page, 2, `window.__race().next === ${want}`);
    if (!ok) {
      const s = await page.evaluate('({ c: window.__craftState(), r: { next: window.__race().next, lap: window.__race().lapStartMs }, k: window.__crash().flagNames })');
      const rel = [s.c.worldX - c[0], s.c.worldY - c[1], s.c.worldZ - c[2]];
      console.log(`    after the throw: mode ${s.c.mode}, crashed ${s.c.crashed}, touched ${s.c.lastHitKind}, ${f1(vDot(rel, g.travel))} m past the plane, ${f1(vDot(rel, g.up))} m up, race next ${s.r.next}, damage ${JSON.stringify(s.k)}`);
    }
    return ok;
  };
  const order = G.map((g) => g.id);
  const iPair = order.indexOf(pair.id);
  const iCone = order.indexOf(cone.id);
  await page.evaluate('window.__race().next = 0, true');
  const okWide = await flyThrough(wide, wide.centre, 1);
  const lap = await page.evaluate('window.__race().lapStartMs');
  say(okWide && lap != null, `the Slow Stick thrown through the 3 m gate at ${SPEED} m/s: counted, the lap starts`);
  await page.evaluate(`window.__race().next = ${iPair}, true`);
  const pairLow = vAdd(pair.centre, pair.up, -1);
  const events0 = (await page.evaluate('window.__crash()')).events;
  const okPair = await flyThrough(pair, pairLow, (iPair + 1) % G.length);
  const events1 = (await page.evaluate('window.__crash()')).events;
  say(okPair && events1 === events0, `between the pylons, 3 m up: counted, no damage (${events1 - events0} events)`);
  await page.evaluate(`window.__race().next = ${iCone}, true`);
  const round = vAdd(vAdd(coneAxis, [0, 1, 0], 3), side, lateral > 0 ? 4 : -4);
  const roundWrong = vAdd(vAdd(coneAxis, [0, 1, 0], 3), side, lateral > 0 ? -4 : 4);
  await shot(page, `16-${opts.map}-round-the-pylon`);
  const okCone = await flyThrough(cone, round, (iCone + 1) % G.length);
  say(okCone, 'round the pylon 4 m off it on its set side: counted');
  await page.evaluate(`window.__race().next = ${iCone}, true`);
  const wrongCounted = await flyThrough(cone, roundWrong, (iCone + 1) % G.length);
  say(!wrongCounted, 'the same 4 m off on its other side: not counted');

  /* The Slow Stick's wingtip 0.3 m into it, low and high: jelly to a
   * plane (src/game/jelly.js), so it is whacked and never hurt. */
  const pyDims = (await page.evaluate(B('.doc.elements'))).find((e) => e.id === placed[2].id).dims;
  const span = 2 * airframeById('slowstick1180').dims.hullR;
  for (const h of [0.2, 0.6].map((f) => f * pyDims.height)) {
    const r = pyDims.baseRadius + (pyDims.tipRadius - pyDims.baseRadius) * (h / pyDims.height);
    const at = vAdd(vAdd(coneAxis, [0, 1, 0], h), side, (lateral > 0 ? 1 : -1) * (r + span / 2 - 0.3));
    await page.evaluate(`window.__race().next = ${iCone}, true`);
    const tip = await throwAt(page, at, cone.travel, SPEED);
    say(tip.whacks.length === 1 && tip.events === 0 && tip.flags.length === 0 && tip.mode === 'flight',
      `a Slow Stick wingtip into it ${f1(h)} m up, crash damage on: whacked, not hurt (${whackText(tip.whacks[0])}; ${tip.events} damage events)`);
  }

  /* The other pylon piece in its place: a right click on it, the right
   * hand pylon from slot 9 and a click from where it was placed. */
  await key(page, 'KeyB');
  await page.until(`${B('.state')} === 'building'`, 10000);
  await takeMouse(page);
  await removeById(page, cone.id);
  const coneR = await placeOn(page, 'pylonRight', spots[2], dir);
  const sideNow = (await page.evaluate(B('.doc.sequence'))).find((q) => q.elementId === coneR).passSide;
  say(sideNow === 'right', `the right hand pylon piece in its place: passed on its ${sideNow} now`);
  G = await page.evaluate(B('.gates'));
  const cone2 = G.find((g) => g.id === coneR);
  const coneBase2 = (await page.evaluate(B('.doc.elements'))).find((e) => e.id === coneR).position;
  say(vDist([coneBase2.x, coneBase2.z, -coneBase2.y], coneAxis) < 0.05, 'standing where the other one stood');
  const iCone2 = G.findIndex((g) => g.id === coneR);
  await key(page, 'KeyB');
  await page.until(`${B('.state')} === 'testing' && window.__craftState().mode === 'flight'`, 30000);
  await frames(page, 3);
  await page.evaluate(`window.__race().next = ${iCone2}, true`);
  const okFlipped = await flyThrough(cone2, roundWrong, (iCone2 + 1) % G.length);
  say(okFlipped, 'and flown on that side it counts');
  await key(page, 'KeyB');
  await page.until(`${B('.state')} === 'building'`, 10000);
  await takeMouse(page);

  /* Saved, and a real reload. */
  await key(page, 'KeyS', { ctrl: true });
  await frames(page, 3);
  const docId = await page.evaluate(B('.doc.id'));
  const raw = await page.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(LIBRARY)}))[${JSON.stringify(docId)}]`);
  const rawSide = raw.sequence.find((q) => q.elementId === coneR);
  say(raw.schemaVersion === 4 && rawSide && rawSide.passSide === 'right', `stored as schemaVersion ${raw.schemaVersion} with the pylon's side, ${rawSide ? rawSide.passSide : '?'}`);
  await page.cdp.send('Page.reload', {}, page.sessionId);
  await page.sleep(1000);
  await flyAndBuild(page);
  const again = await page.evaluate(B(''));
  const back = again.doc.elements.map((e) => e.type).join();
  const backSide = again.doc.sequence.find((q) => q.elementId === coneR);
  const sameCentres = again.gates.length === G.length && again.gates.every((g, i) => vDist(g.centre, G[i].centre) < 1e-3);
  say(/wideGate3,pylonPair,pylon$/.test(back) && backSide && backSide.passSide === 'right' && sameCentres, `after a reload the same gates are back, the pylon still on its right: ${back}`);
}

/* 16: the plane sized gates, on a page of their own. */
async function planeStage() {
  console.log(`plane sized gates on ${opts.map}`);
  const page = await openPage({ root, width: 1280, height: 720, url: `/index.html?map=${opts.map}`, seed: seedFor(null, 'slowstick1180', 'slowstick-stab') });
  try {
    await flyAndBuild(page);
    await planeGates(page);
    const errs = pageErrors(page);
    say(errs.length === 0, `no page errors${errs.length ? `: ${errs.slice(0, 3).join(' | ')}` : ''}`);
  } finally {
    await page.close();
  }
}

/* ------------------------------------------------------------------ */
/* Sky hoops                                                           */
/* ------------------------------------------------------------------ */

/*
 * A line in the sky for a chain of hoops, within 1200 m of the map's spawn:
 * 1000 m along one of eight headings with the ground under it and 60 m
 * either side of it flattest, found with __heightAt. `y` is 70 m over its
 * highest ground.
 */
async function findSky(page) {
  return page.evaluate(`(() => {
    const H = window.__heightAt;
    const sp = window.__map().spawn;
    let best = null;
    for (let x = sp.x - 1200; x <= sp.x + 1200; x += 100) {
      for (let z = sp.z - 1200; z <= sp.z + 1200; z += 100) {
        for (let k = 0; k < 8; k += 1) {
          const a = k * Math.PI / 4;
          const dx = Math.sin(a);
          const dz = Math.cos(a);
          let hi = -Infinity;
          let lo = Infinity;
          for (let s = -100; s <= 1000; s += 50) {
            for (const o of [-60, 0, 60]) {
              const h = H(x + dx * s + dz * o, z + dz * s - dx * o);
              hi = Math.max(hi, h);
              lo = Math.min(lo, h);
            }
          }
          if (Number.isFinite(hi) && Number.isFinite(lo) && (!best || hi - lo < best.rise)) {
            best = { x, z, dx, dz, y: hi + 70, rise: hi - lo };
          }
        }
      }
    }
    return best;
  })()`);
}

/* The whacks, the damage and the flight after one throw of the seated
 * plane at `speed` along `t`, its centre aimed through point `p`, from
 * `back` m before it. Waits two seconds of flight. A throw starts the
 * jelly's log afresh; the crash's event count runs on. */
async function throwAt(page, p, t, speed, back = 10) {
  const before = await page.evaluate('({ k: window.__crash() })');
  /* The most any piece leans, read every frame: a wobble swings through
   * upright twice a cycle, so one reading can land on nothing. */
  await page.evaluate(`(() => {
    window.__leanMax = 0;
    window.__leanWatch = true;
    const step = () => {
      if (!window.__leanWatch) { return; }
      for (const w of ${B('.wobbles')}) { window.__leanMax = Math.max(window.__leanMax, w.lean); }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return true;
  })()`);
  const from = vAdd(p, t, -back);
  const v = t.map((x) => x * speed);
  await page.evaluate(`window.__crashThrow({ fresh: true, x: ${from[0]}, y: ${from[1]}, z: ${from[2]}, yaw: ${yawAlong(t)}, pitch: ${(Math.asin(t[1]) * 180) / Math.PI}, vx: ${v[0]}, vy: ${v[1]}, vz: ${v[2]} })`);
  const t0 = await page.evaluate('window.__crash().simT');
  await simWait(page, 1.5 + back / speed, 'false');
  const after = await page.evaluate('window.__leanWatch = false, ({ k: window.__crash(), j: window.__jelly(), c: window.__craftState(), next: window.__race().next, lean: window.__leanMax })');
  /* How much flight the wait really held: under a loaded host the wall
   * clock can run out first, and then the throw was read short. */
  const flown = after.k.simT - t0;
  const { whacks } = after.j;
  return {
    whacks,
    events: after.k.events - before.k.events,
    flags: after.k.flagNames,
    wrecked: after.k.wrecked,
    mode: after.c.mode,
    crashed: after.c.crashed,
    speed: after.c.speed,
    lean: after.lean,
    next: after.next,
    flown,
  };
}

/* The view for a picture: the mouse free, so the ghost is not drawn, and
 * nothing selected, so the gizmo is not either. */
async function clearView(page) {
  await freeMouse(page, 20, 360);
  await page.sleep(300);
  if (await page.evaluate(B('.selected'))) {
    await key(page, 'Escape');
    await frames(page, 2);
  }
}

/* One whack reported the way the report reads it. */
const whackText = (w) => (w ? `${w.kind}, ${w.speed.toFixed(1)} to ${w.after.toFixed(1)} m/s (${(w.loss * 100).toFixed(0)} percent), kick roll ${w.roll.toFixed(2)} pitch ${w.pitch.toFixed(2)} rad/s` : 'no whack');

/*
 * 18. THE SKY HOOPS, on the seated plane's page. Every hoop placed in the
 * air with a plain left click, as a hoop floats; then a course laid with
 * the chain: a 30 m hoop, Shift and a click twice for two more 400 m on,
 * and a pylon on the ground. The chain's spacing turned by Ctrl, Shift and
 * the wheel. A plane hotbar stored before the 6, 12 and 20 m hoops were
 * retired opens as the new one, the 30 m hoop first and no other plane
 * hoop. Flown: through the 30 m disc 12 m off its
 * centre scores, through the square round it outside the disc is close
 * enough, 41 m past the rim does not count,
 * and the plane thrown head on into the rim and into the pylon at its top
 * speed (and the Cub at its cruise too) with crash damage on is whacked,
 * never damaged, and flies on while the piece wobbles and settles. Saved,
 * reloaded, the same hoops. Pictures from a kilometre, 500 m and close.
 * Then a track saved before the retirement, a 20, a 6 and a 12 m hoop,
 * opens with Ctrl+O, draws, warns the 6 m is small for the Bramor, and
 * flies; a middle click on its 20 m hoop hands over the 30 m one.
 */
async function hoopStage(craft, { place = true } = {}) {
  console.log(`sky hoops on ${opts.map}, the ${craft}`);
  /* The plane hotbar as this builder stored it before the retirement. */
  const staleBar = ['hoop20', 'hoop12', 'hoop30', 'hoop6', 'pylonPair', 'pylon', 'pylonRight', 'wideGate5', 'wideGate3'];
  const seed = [...seedFor(null, craft), `try { localStorage.setItem('webfpv.builder.hotbar.wing.v1', ${JSON.stringify(JSON.stringify(staleBar))}); } catch (e) {}`];
  const page = await openPage({ root, width: 1280, height: 720, url: `/index.html?map=${opts.map}`, seed });
  const af = airframeById(craft);
  try {
    await flyAndBuild(page);
    const bar = await page.evaluate(B('.hotbar'));
    say(bar.join() === DEFAULT_WING_HOTBAR.join() && !bar.some((id) => RETIRED_HOOPS.includes(id)),
      `a plane hotbar stored with the 20, 12 and 6 m hoops opens on the 30 m hoop and no other plane hoop: ${bar.join(', ')}`);
    const sky = await findSky(page);
    say(Boolean(sky), `a line in the sky: from (${f1(sky.x)}, ${f1(sky.y)}, ${f1(sky.z)}), the ground under a kilometre of it within ${f1(sky.rise)} m`);
    const dir = [sky.dx, 0, sky.dz];
    const side = [sky.dz, 0, -sky.dx];
    const yaw = Math.atan2(-sky.dx, -sky.dz);
    const start = [sky.x, sky.y, sky.z];
    const heightAt = (p) => page.evaluate(`window.__heightAt(${p[0]}, ${p[2]})`);

    if (place) {
      /* Every hoop in the air with a plain click, 60 m apart across the line. */
      await key(page, 'KeyN');
      for (const [k, type] of HOOP_TYPES.entries()) {
        await hold(page, type);
        await lookAlong(page, vAdd(start, side, 60 * k), yaw, 0);
        const ghost = await page.evaluate(B('.ghost'));
        if (type === 'hoop30') {
          await lookAlong(page, vAdd(vAdd(start, side, 60 * k + 25), [0, 1, 0], 10), yaw - 0.45, -0.15);
          await frames(page, 3);
          await shot(page, `18-${opts.map}-hoop30-in-hand`);
          await lookAlong(page, vAdd(start, side, 60 * k), yaw, 0);
        }
        const g = await placeHere(page);
        const d = ELEMENTS[type].dims.clearW;
        const out = vDot(vAdd(g.centre, vAdd(start, side, 60 * k), -1), dir);
        say(ghost.mode === 'air' && g.round && Math.abs(g.clearW - d) < 1e-9 && Math.abs(out - Math.max(20, 1.5 * d)) < 1e-6
          && g.centre[1] - (await heightAt(g.centre)) > 30,
        `a ${d} m hoop placed in the air with a plain click, ${f1(out)} m out and ${f1(g.centre[1] - (await heightAt(g.centre)))} m up`);
      }
      await lookAt(page, vAdd(vAdd(vAdd(start, side, 150), dir, -260), [0, 1, 0], 25), vAdd(vAdd(start, side, 150), dir, 30));
      await clearView(page);
      await shot(page, `18-${opts.map}-every-hoop`);
      await takeMouse(page);
      /* The air race's pylon pair, from its hotbar slot, on the ground. */
      await key(page, 'Digit2');
      await page.until(`${B('.piece')} === 'pylonPair'`, 5000).catch(() => {});
      say((await page.evaluate(B('.piece'))) === 'pylonPair', 'slot 2 of the plane hotbar is the air race\'s pylon pair');
      const pairAt = vAdd(start, dir, 150);
      pairAt[1] = await heightAt(pairAt);
      await lookAt(page, vAdd(vAdd(pairAt, dir, -60), [0, 1, 0], 18), pairAt);
      await frames(page, 3);
      await shot(page, `18-${opts.map}-pylon-pair-in-hand`);
      const pair = await placeHere(page);
      say(Boolean(pair) && !pair.round && Math.abs(pair.clearW - ELEMENTS.pylonPair.dims.clearW) < 1e-9, `placed on the ground with a click: ${pair ? `${pair.clearW} m of air between its cones` : 'nothing'}`);
      await lookAt(page, vAdd(vAdd(vAdd(pairAt, dir, -70), side, -45), [0, 1, 0], 22), vAdd(pairAt, [0, 1, 0], 10));
      await clearView(page);
      await shot(page, `18-${opts.map}-pylon-pair-placed`);
      await takeMouse(page);
    }

    /* The course, with the chain. */
    await key(page, 'KeyN');
    await page.until(`${B('.gates.length')} === 0`, 10000);
    await hold(page, 'hoop30');
    await lookAlong(page, start, yaw, 0);
    const g1 = await placeHere(page);
    /* The owner's ask: place it, right click it, and its arrows and rings
     * are on it. The crosshair on its rim, since its middle is air. */
    const rimSide = vCross(g1.up, g1.travel);
    await lookAt(page, vAdd(vAdd(vAdd(g1.centre, dir, -75), side, -20), [0, 1, 0], 8), vAdd(g1.centre, rimSide, 15 + ELEMENTS.hoop30.dims.tubeR));
    await frames(page, 3);
    await click(page, 'right');
    await page.until(`!${B('.locked')}`, 5000).catch(() => {});
    await frames(page, 3);
    const rc = await page.evaluate(`(() => { const s = window.__build.state(); return { selected: s.selected, locked: s.locked, gizmo: s.gizmo, gates: s.gates.length }; })()`);
    say(rc.selected === g1.id && !rc.locked && rc.gizmo && rc.gates === 1, `a right click on the 30 m hoop just placed brings up its arrows and rings: ${JSON.stringify(rc)}`);
    await shot(page, `18-${opts.map}-hoop30-right-click-gizmo`);
    await key(page, 'Escape');
    await takeMouse(page);
    await lookAlong(page, start, yaw, 0);
    const chain0 = await page.evaluate(B('.chainDistance.plane'));
    await wheel(page, 1, { ctrl: true, shift: true });
    const chainDown = await page.evaluate(B('.chainDistance.plane'));
    await wheel(page, -1, { ctrl: true, shift: true });
    const chainBack = await page.evaluate(B('.chainDistance.plane'));
    say(chain0 === 400 && chainDown === 375 && chainBack === 400, `the chain starts at ${chain0} m, Ctrl Shift and the wheel take it to ${chainDown} and back to ${chainBack}`);
    const n0 = await page.evaluate(B('.gates.length'));
    await click(page, 'left', { shift: true });
    await page.until(`${B('.gates.length')} === ${n0 + 1}`, 10000);
    await lookAlong(page, start, yaw, 0);
    await click(page, 'left', { shift: true });
    await page.until(`${B('.gates.length')} === ${n0 + 2}`, 10000);
    let G = await page.evaluate(B('.gates'));
    const [a, b, c] = G;
    const along = (p, q) => vDot(vAdd(q, p, -1), dir);
    say(Math.abs(along(a.centre, b.centre) - 400) < 0.01 && Math.abs(along(b.centre, c.centre) - 400) < 0.01
      && vDist(vAdd(a.centre, dir, 800), c.centre) < 0.01 && vDot(c.travel, dir) > 1 - 1e-9,
    `Shift and a click, twice: three hoops 400 m apart down the look, the last flown along it: ${G.map((g) => `${g.clearW} m`).join(', ')}`);
    say(a.id === g1.id && G.length === 3, 'in the order they were laid');
    /* A pylon on the ground, 200 m in and 80 m off the line. */
    const foot = vAdd(vAdd(start, dir, 200), side, 80);
    foot[1] = await heightAt(foot);
    await hold(page, 'pylon');
    await lookAt(page, vAdd(vAdd(foot, dir, -30), [0, 1, 0], 14), foot);
    const py = await placeHere(page);
    G = await page.evaluate(B('.gates'));
    say(G.length === 4 && G[3].id === py.id, 'and a pylon on the ground at the end of the lap');

    /* The warnings: the 30 m hoop is small for no plane. */
    await craftTo(page, 'bramor2300');
    say(!(await warned(page, 'small')), `no hoop on it is small for the Bramor: ${await warnList(page)}`);
    await craftTo(page, craft);

    /* Pictures: a kilometre and 500 m back down the line, and close, with
     * the mouse free so no ghost is in them. */
    await clearView(page);
    for (const back of [1000, 500]) {
      await lookAt(page, vAdd(vAdd(a.centre, dir, -back), [0, 1, 0], 25), vAdd(a.centre, dir, 200));
      await frames(page, 3);
      await shot(page, `18-${opts.map}-hoops-from-${back}m`);
    }
    await lookAt(page, vAdd(vAdd(a.centre, dir, -45), side, 20), a.centre);
    await frames(page, 3);
    await shot(page, `18-${opts.map}-hoop30-close`);
    await lookAt(page, vAdd(vAdd(vAdd(c.centre, dir, 40), side, -35), [0, 1, 0], 12), c.centre);
    await frames(page, 3);
    await shot(page, `18-${opts.map}-hoop30-arrows-from-ahead`);
    await takeMouse(page);

    /* Flown. */
    await key(page, 'KeyB');
    await page.until(`${B('.state')} === 'testing' && window.__craftState().mode === 'flight'`, 30000);
    await page.evaluate("(document.querySelector('.osd-air-hint-btn') || { click() {} }).click(), true");
    await frames(page, 3);
    await shot(page, `18-${opts.map}-flight-start`);
    const k0 = await page.evaluate('window.__crash()');
    const soft = await page.evaluate('window.__jelly().soft');
    say(k0.runDamage === true && soft, `crash damage is on for the run, and the ${af.short} meets the pylons and rims as jelly`);
    const cruise = airStartSpeed(af);
    const across = (g) => vCross(g.up, g.travel);
    /* The pilot's own view of the line from a kilometre and 500 m out: the
     * first hoop lit as the target, the others as a pilot sees a hoop that
     * is not next. */
    for (const back of [1000, 500]) {
      const from = vAdd(vAdd(a.centre, a.travel, -back), [0, 1, 0], 10);
      await page.evaluate(`window.__crashThrow({ fresh: true, x: ${from[0]}, y: ${from[1]}, z: ${from[2]}, yaw: ${yawAlong(a.travel)}, vx: ${a.travel[0] * cruise}, vy: 0, vz: ${a.travel[2] * cruise} })`);
      await frames(page, 3);
      await shot(page, `18-${opts.map}-${craft}-flying-${back}m-out`);
    }
    if (craft !== 'bramor2300') {
      /* A plane's course is scored (src/game/race.js PLANE_REACH): through
       * the disc by how near its middle, near it within 40 m of the rim for
       * a flat few points, and past that not at all. */
      const callOf = async () => page.evaluate('window.__race().call');
      await page.evaluate('window.__race().next = 0, true');
      const off12 = await throwAt(page, vAdd(a.centre, across(a), 12), a.travel, cruise);
      const c12 = await callOf();
      say(off12.next === 1 && off12.whacks.length === 0 && c12 && c12.code === 'through',
        `through the 30 m hoop 12 m off its centre at ${cruise.toFixed(1)} m/s: counted, ${c12 ? `${c12.code} ${c12.points}` : 'no call'}, nothing touched`);
      await page.evaluate('window.__race().next = 0, true');
      const corner = await throwAt(page, vAdd(vAdd(a.centre, across(a), 13), a.up, 13), a.travel, cruise);
      const cc = await callOf();
      say(corner.next === 1 && cc && cc.code === 'close', `through the square round it, outside the disc (13 m across and 13 m up): close enough, ${cc ? cc.points : 0} points`);
      await page.evaluate('window.__race().next = 0, true');
      const far = await throwAt(page, vAdd(a.centre, across(a), 15 + 2 * ELEMENTS.hoop30.dims.tubeR + 41), a.travel, cruise);
      say(far.next === 0, '41 m past its rim: not counted');
    }
    const Rc = 15 + ELEMENTS.hoop30.dims.tubeR;
    const pyEl = (await page.evaluate(B('.doc.elements'))).find((e) => e.id === py.id);
    const pyAxis = [pyEl.position.x, pyEl.position.z, -pyEl.position.y];
    const hits = [];
    for (const [what, p, t] of [
      ['the 30 m hoop\'s rim', vAdd(a.centre, across(a), Rc), a.travel],
      ['the pylon', vAdd(pyAxis, [0, 1, 0], 0.45 * pyEl.dims.height), dir],
    ]) {
      const speeds = craft === 'bramor2300' ? [af.topSpeed] : [cruise, af.topSpeed];
      for (const v of speeds) {
        /* The race waits on the far hoop meanwhile: to a plane a rim hit is
         * close enough to count (src/game/race.js PLANE_REACH), and laps
         * counted here would end the run under the throws. */
        await page.evaluate('window.__race().next = 2, true');
        const r = await throwAt(page, p, t, v);
        const w = r.whacks[0];
        hits.push({ what, v, w });
        const wob = r.lean > 0.02;
        say(r.whacks.length === 1 && r.events === 0 && r.flags.length === 0 && !r.wrecked && !r.crashed && r.mode === 'flight' && r.speed > af.stall,
          `the ${af.short} head on into ${what} at ${v.toFixed(1)} m/s: whacked, not hurt (${whackText(w)}; ${r.whacks.length} whack(s), ${r.events} damage events, flags ${r.flags.join() || 'none'}), flying on at ${r.speed.toFixed(1)} m/s, mode ${r.mode}${r.crashed ? ', crashed' : ''}, ${r.flown.toFixed(1)} s flown`);
        say(wob, `and it wobbles: leaning as much as ${r.lean.toFixed(2)} rad as it shakes`);
      }
    }
    await shot(page, `18-${opts.map}-${craft}-after-the-whacks`);
    const settled = await page.until(`${B('.wobbles.length')} === 0`, 120000).then(() => true, () => false);
    say(settled, 'and springs back: nothing is wobbling a few seconds on, every piece drawn where it stands');
    await key(page, 'KeyB');
    await page.until(`${B('.state')} === 'building'`, 10000);
    await takeMouse(page);

    /* Saved, and a real reload. */
    await key(page, 'KeyS', { ctrl: true });
    await frames(page, 3);
    const docId = await page.evaluate(B('.doc.id'));
    const raw = await page.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(LIBRARY)}))[${JSON.stringify(docId)}]`);
    say(raw.schemaVersion === 4 && raw.elements.map((e) => e.type).join() === 'hoop30,hoop30,hoop30,pylon', `stored as schemaVersion ${raw.schemaVersion}: ${raw.elements.map((e) => e.type).join(', ')}`);
    await page.cdp.send('Page.reload', {}, page.sessionId);
    await page.sleep(1000);
    await flyAndBuild(page);
    const again = await page.evaluate(B(''));
    const same = again.gates.length === G.length && again.gates.every((g, i) => vDist(g.centre, G[i].centre) < 1e-3 && g.round === G[i].round);
    say(again.doc.id === docId && same, `after a reload the same hoops are back where they were: ${again.gates.map((g) => (g.round ? `${g.clearW} m hoop` : 'pylon')).join(', ')}`);

    /* A track saved before the retirement: a 20, a 6 and a 12 m hoop 400 m
     * apart, 300 m off the line. A published contract, so it loads, draws,
     * warns and flies as it did. */
    const old = newCourse(opts.map, 'Hoops before the retirement');
    const oldTypes = ['hoop20', 'hoop6', 'hoop12'];
    oldTypes.forEach((type, k) => {
      const centre = vAdd(vAdd(start, side, 300), dir, 400 * k);
      const cy = openingsOf({ type, dims: ELEMENTS[type].dims })[0].centreY;
      addGate(old, type, { x: centre[0], y: centre[1] - cy, z: centre[2] }, qAxis(0, 1, 0, yaw));
    });
    await page.evaluate(`(() => {
      const lib = JSON.parse(localStorage.getItem(${JSON.stringify(LIBRARY)}) || '{}');
      lib[${JSON.stringify(old.id)}] = ${JSON.stringify(toPlain(old))};
      localStorage.setItem(${JSON.stringify(LIBRARY)}, JSON.stringify(lib));
      return true;
    })()`);
    for (let i = 0; i < 8 && (await page.evaluate(B('.doc.id'))) !== old.id; i += 1) {
      await key(page, 'KeyO', { ctrl: true });
      await frames(page, 2);
    }
    const O = await page.evaluate(B(''));
    const oldWant = raceGatesOf(old);
    say(O.doc.id === old.id && O.gates.length === 3 && O.gates.every((g, i) => g.round && g.clearW === ELEMENTS[oldTypes[i]].dims.clearW && vDist(g.centre, [oldWant[i].centre.x, oldWant[i].centre.y, oldWant[i].centre.z]) < 1e-6),
      `an old track with retired hoops opens with Ctrl+O, every hoop its own size where it was: ${O.gates.map((g) => `${g.clearW} m`).join(', ')}`);
    say(O.badges.map((b) => b.text).join() === '1,2,3', `and each is drawn, with its number: ${O.badges.map((b) => b.text).join()}`);
    await craftTo(page, 'bramor2300');
    const smallB = (await page.evaluate(B('.warnings'))).find((w) => w.code === 'small' && w.gate === 1);
    say(Boolean(smallB) && Math.abs(smallB.value - 6) < 1e-9, `its 6 m hoop is small for the Bramor: ${smallB ? `${smallB.value} m, it needs ${smallB.limit.toFixed(2)}` : await warnList(page)}`);
    say(await panelSays(page, /Gate 2 is 6\.00 m wide, too small for the Bramor/), 'and the panel says so');
    await craftTo(page, 'cub1400');
    say(!(await warned(page, 'small')), `not for the Cub: ${await warnList(page)}`);
    await craftTo(page, craft);
    await lookAt(page, vAdd(vAdd(O.gates[0].centre, dir, -90), [0, 1, 0], 10), O.gates[0].centre);
    await frames(page, 3);
    await clearView(page);
    await shot(page, `18-${opts.map}-old-hoops`);
    await takeMouse(page);
    await aimAtGate(page, O.gates[0].id, 40);
    await click(page, 'middle');
    await frames(page, 2);
    say((await page.evaluate(B('.piece'))) === 'hoop30', `a middle click on its 20 m hoop hands over the 30 m one: ${await page.evaluate(B('.piece'))}`);
    await key(page, 'KeyB');
    await page.until(`${B('.state')} === 'testing' && window.__craftState().mode === 'flight'`, 30000);
    const oldRace = await page.evaluate('({ n: window.__race().gates.length, freestyle: window.__race().freestyle })');
    say(oldRace.n === 3 && !oldRace.freestyle, `and B flies it: a race of ${oldRace.n} hoops`);
    await key(page, 'KeyB');
    await page.until(`${B('.state')} === 'building'`, 10000);
    const errs = pageErrors(page);
    say(errs.length === 0, `no page errors${errs.length ? `: ${errs.slice(0, 3).join(' | ')}` : ''}`);
    return hits;
  } finally {
    /* On the way out of a stage that threw, what the page said. */
    const errs = pageErrors(page);
    if (errs.length) {
      console.log(`    page errors: ${errs.slice(0, 3).join(' | ')}`);
    }
    await page.close();
  }
}


/*
 * 19. THE CASUAL SKY COURSE: with a plane seated, My tracks' New track
 * offers it for each world (and with a quad seated it does not); one click
 * lays eight big gates round a wide oval over the world, 400 m apart along
 * it, 30 m hoops 60 to 150 m over the ground and, where the ground takes
 * one, the air race's pylon pair standing on it, and flies it. No warning
 * for the seated plane, and a lap flown wide on purpose, through the
 * openings near their edges and past them outside, closes and is scored.
 */
async function casualStage(craft) {
  console.log(`the casual sky course on ${opts.map}, the ${craft}`);
  const page = await openPage({ root, width: 1280, height: 720, url: `/index.html?map=${opts.map}`, seed: seedFor(null, craft) });
  const af = airframeById(craft);
  try {
    await page.until('!!window.__shellReady', 240000);
    await page.until(`window.__map && window.__map().id === ${JSON.stringify(opts.map)} && window.__map().ready`, 300000);
    await page.evaluate("window.__ui.act('mytracks'), window.__ui.act('newtrack'), true");
    const rows = async () => page.evaluate('window.__ui.items().filter((r) => r.action).map((r) => ({ label: r.label, action: r.action }))');
    const offered = await rows();
    const mine = offered.find((r) => r.action === `casualtrack:${opts.map}`);
    say(Boolean(mine), `New track offers the ${af.short} a casual sky course: ${offered.filter((r) => /^casualtrack:/.test(r.action)).map((r) => r.label).join('; ')}`);
    const quadRows = await page.evaluate(`(() => {
      const was = window.__ui.settings.airframe;
      window.__ui.settings.airframe = '5inch';
      const got = window.__ui.items().filter((r) => /^casualtrack:/.test(r.action || '')).length;
      window.__ui.settings.airframe = was;
      return got;
    })()`);
    say(quadRows === 0, `and a quad is not offered one (${quadRows} rows)`);
    await page.until('!!window.__build', 60000);
    await page.evaluate(`window.__ui.act(${JSON.stringify(`casualtrack:${opts.map}`)}), true`);
    await page.until(`${B('.state')} === 'testing' && window.__craftState().mode === 'flight'`, 180000);
    await page.evaluate("(document.querySelector('.osd-air-hint-btn') || { click() {} }).click(), true");
    const st = await page.evaluate(B(''));
    const G = st.gates;
    const typeOf = (g) => st.doc.elements.find((e) => e.id === g.id).type;
    const isPair = (g) => typeOf(g) === 'pylonPair';
    const heights = [];
    for (const g of G) {
      heights.push(g.centre[1] - (await page.evaluate(`window.__heightAt(${g.centre[0]}, ${g.centre[2]})`)));
    }
    const gaps = G.map((g, i) => vDist(g.centre, G[(i + 1) % G.length].centre));
    const pairs = G.filter(isPair).length;
    say(G.length === 8 && typeOf(G[0]) === 'hoop30' && G.every((g) => (isPair(g) ? !g.round : g.round && g.clearW === 30)) && pairs > 0,
      `one click flies ${G.length} gates, ${pairs} of them the air race's pylon pair: ${G.map((g) => (isPair(g) ? 'pair' : `${g.clearW} m hoop`)).join(', ')}`);
    say(gaps.every((d) => d > 330 && d < 420), `about 400 m apart round the oval: ${gaps.map((d) => d.toFixed(0)).join(', ')} m`);
    const pairMid = ELEMENTS.pylonPair.dims.clearH / 2;
    say(G.every((g, i) => (isPair(g) ? heights[i] >= pairMid - 2.1 && heights[i] <= pairMid + 0.1 : heights[i] >= 59.9 && heights[i] <= 150.1)),
      `the hoops 60 to 150 m over the ground, the pairs standing on it: ${heights.map((h) => h.toFixed(0)).join(', ')} m`);
    say(G.every((g, i) => vDot(g.travel, vAdd(G[(i + 1) % G.length].centre, g.centre, -1)) > 0), 'each flown towards the next');
    const warns = st.warnings.filter((w) => ['small', 'close', 'blocked', 'clips', 'backwards'].includes(w.code));
    say(warns.length === 0, `no warning for the ${af.short}: ${warns.map((w) => `${w.code}@${w.gate + 1}`).join(' ') || 'none'}`);
    say(st.doc.name === 'Casual sky track', `named ${JSON.stringify(st.doc.name)}`);
    await frames(page, 3);
    await shot(page, `19-${opts.map}-casual-start`);
    /*
     * A lap flown wide on purpose (src/game/race.js PLANE_REACH): round the
     * eight hoops and back through the first, in order, each thrown through
     * well off its centre or right outside it: through the disc at 80
     * percent of its radius, then past its rim by 15 m, by turns. Every
     * one counts, the lap closes, and it is scored.
     */
    const cruise = airStartSpeed(af);
    await page.evaluate('window.__race().next = 0, true');
    const calls = [];
    for (let k = 0; k <= G.length; k += 1) {
      const i = k % G.length;
      const g = G[i];
      const rim = isPair(g) ? 2 * ELEMENTS.pylonPair.dims.baseRadius : 2 * ELEMENTS.hoop30.dims.tubeR;
      const out = k % 2 === 0 ? 0.8 * (g.clearW / 2) : g.clearW / 2 + rim + 15;
      const r = await throwAt(page, vAdd(g.centre, vCross(g.up, g.travel), out), g.travel, cruise, 12);
      const race = await page.evaluate('({ next: window.__race().next, call: window.__race().call, flash: window.__race().flashText(performance.now()) })');
      calls.push(r.next === (i + 1) % G.length && race.call ? `${race.call.code} ${race.call.points}`
        : `missed at ${i + 1} (${r.flown.toFixed(1)} s flown, ${r.mode}${r.crashed ? ', crashed' : ''}, ${r.whacks.length} whacks, next ${r.next}, ${JSON.stringify(race.flash)})`);
    }
    const run = await page.evaluate('({ lap: window.__race().lap, log: window.__race().log, run: window.__race().runScore, flash: window.__race().flashText(performance.now()) })');
    say(calls.every((c) => !/missed/.test(c)), `round the lap wide on purpose, every gate counts: ${calls.join(', ')}`);
    say(run.lap === 1 && Number.isFinite(run.log[0].score) && run.log[0].score > 0,
      `and the lap closes, scored: ${run.log.map((l) => `lap ${l.n} ${(l.ms / 1000).toFixed(1)} s, ${l.score} points`).join('; ')}; the run ${run.run}`);
    const osd = await page.evaluate('window.__fpvOsd ? window.__fpvOsd().values : null');
    console.log(`    the OSD's score row: ${osd ? JSON.stringify(osd.cue) : 'no OSD'}; the banner: ${JSON.stringify(run.flash)}`);
    const errs = pageErrors(page);
    say(errs.length === 0, `no page errors${errs.length ? `: ${errs.slice(0, 3).join(' | ')}` : ''}`);
  } finally {
    await page.close();
  }
}

const warnList = async (page) => (await page.evaluate(B('.warnings'))).map((w) => `${w.code}@${w.gate + 1}`).join(' ') || 'none';
const warned = async (page, code, gate = null) => (await page.evaluate(B('.warnings'))).some((w) => w.code === code && (gate == null || w.gate === gate));
/* The panel is painted on the next frame after an edit, and a frame on the
 * software renderer under load can take a second: wait for it. */
const panelSays = async (page, re) => page.until(`${re}.test(${B('.hud')})`, 10000).then(() => true, () => false);

/* C round the aircraft until the line is drawn for `id`. */
async function craftTo(page, id) {
  for (let i = 0; i < 16 && (await page.evaluate(B('.line.craft'))) !== id; i += 1) {
    await key(page, 'KeyC');
  }
  return (await page.evaluate(B('.line.craft'))) === id;
}

/* With the mouse free, a gate selected and turned in place with R or
 * Shift+R `n` times, and the mouse taken back. */
async function turnSelected(page, id, n, shift) {
  await freeMouse(page, 20, 360);
  const ok = await clickGate(page, id);
  for (let i = 0; i < n; i += 1) {
    await key(page, 'KeyR', { shift });
  }
  await key(page, 'Escape');
  await takeMouse(page);
  return ok;
}

async function geometry(page, { edge, drop, at }) {
  console.log('  the racing line and the geometry warnings');
  const H = async (x, z) => page.evaluate(`window.__heightAt(${x}, ${z})`);
  const d = [drop.dx, 0, drop.dz];
  const back = [-drop.dx, 0, -drop.dz];
  const side = [drop.dz, 0, -drop.dx];
  const aside = [-drop.dz, 0, drop.dx];
  await key(page, 'KeyN');
  await page.until(`${B('.gates.length')} === 0`, 10000);
  await hold(page, 'gate');
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
  await lookAt(page, vAdd(vAdd(O, back, 90), [0, 1, 0], 70), vAdd(O, d, 20));
  await shot(page, '12-racing-line');

  /* 13. backwards: B selected with the mouse free and turned round with R
   * twelve times, and back with Shift+R. */
  await lookAt(page, vAdd(vAdd(gB.centre, aside, -18), [0, 1, 0], 4), gB.centre);
  say(await turnSelected(page, gB.id, 12, false), 'the mouse freed and gate 2 clicked');
  say(await warned(page, 'backwards', 1), `R twelve times turns it round, facing the wrong way: ${await warnList(page)}`);
  say(await panelSays(page, /faces the wrong way/), 'the panel lists it');
  const marked = await page.evaluate(B('.line.markers'));
  say(marked === (await page.evaluate(B('.warnings.length'))) && marked > 0, `and it is marked in the valley: ${marked} markers`);
  await shot(page, '13-gate-turned-round');
  await lookAt(page, vAdd(vAdd(gB.centre, aside, 18), [0, 1, 0], 4), gB.centre);
  await turnSelected(page, gB.id, 12, true);
  say(!(await warned(page, 'backwards')) && (await page.evaluate(B('.line.markers'))) === 0, `turned back, it is gone: ${await warnList(page)}`);

  /* small: the Skyhunter's 1.8 m span through 1.75 m gates. */
  say(await craftTo(page, 'sky1800'), 'C picks the Skyhunter');
  say((await warned(page, 'small', 0)) && (await warned(page, 'small', 1)) && (await warned(page, 'small', 2)),
    `every gate is too small for its span: ${await warnList(page)}`);

  /* tight: a jink the Skyhunter cannot turn, eight metres on and six across. */
  const gD = await hangAt(page, vAdd(vAdd(gC.centre, back, 8), side, 6), back);
  const over = await page.evaluate(B('.line.over'));
  say((await warned(page, 'tight', 2)) && over > 0, `a jink after gate 3 is tighter than the Skyhunter can turn: ${over} points of the line marked, ${await warnList(page)}`);
  await lookAt(page, vAdd(vAdd(gC.centre, side, 30), [0, 1, 0], 25), gC.centre);
  await shot(page, '13-too-tight-for-the-skyhunter');
  await removeById(page, gD.id);
  say(!(await warned(page, 'tight')) && (await page.evaluate(B('.line.over'))) === 0, `a right click removes it, the line is flyable again: ${await warnList(page)}`);
  say(await craftTo(page, seated), `C back to the ${seated}`);
  say((await warnList(page)) === 'none', `and the small warnings are gone: ${await warnList(page)}`);

  /* close: a gate two metres after gate 3, then carried twenty. */
  const gE = await hangAt(page, vAdd(gC.centre, back, 2), back);
  say(await warned(page, 'close', 2), `a gate 2 m after gate 3: ${await warnList(page)}`);
  await moveTo(page, gE.id, vAdd(gC.centre, back, 22), back);
  say(!(await warned(page, 'close')), `carried to 22 m, it is not: ${await warnList(page)}`);
  await removeById(page, gE.id);

  /* blocked: a gate hung inside the cliff under the edge, from out over
   * the drop looking back at the face, the air distance past it. The
   * ghost is red there before it is placed. */
  const low = await H(drop.x + drop.dx * 30, drop.z + drop.dz * 30);
  const faceY = (drop.h + low) / 2;
  const eye = at(edge + 40, faceY);
  await lookAlong(page, eye, Math.atan2(drop.dx, drop.dz), 0);
  const face = await page.evaluate('window.__build.pickNow()');
  const want = face ? face.distance + 6 : 0;
  const dist0 = await page.evaluate(B('.airDistance'));
  await airTo(page, want);
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18, modifiers: 1 }, page.sessionId);
  await frames(page, 3);
  const redGhost = await page.evaluate(B('.ghost'));
  await shot(page, '14-ghost-red-in-the-rock');
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18 }, page.sessionId);
  say(redGhost.trouble && redGhost.trouble.code === 'blocked' && redGhost.colour === '#ff3b3b', `the ghost in the rock is red before it is placed: ${JSON.stringify(redGhost.trouble)}`);
  const inRock = await placeHere(page, { air: true });
  const under = await H(inRock.centre[0], inRock.centre[2]);
  say(face && under > inRock.centre[1] && (await warned(page, 'blocked', 3)),
    `a gate ${face ? f1(want - face.distance) : '?'} m into the cliff, ${f1(under - inRock.centre[1])} m under the ground: ${await warnList(page)}`);
  await airTo(page, dist0);
  /* It is in the rock, where the crosshair cannot reach it: the undo. */
  await key(page, 'KeyZ', { ctrl: true });
  await frames(page, 2);
  say(!(await warned(page, 'blocked')) && !(await page.evaluate(B('.gates'))).some((g) => g.id === inRock.id), `Ctrl+Z takes it out again: ${await warnList(page)}`);

  /* blocked, by a building, where the map has one. */
  const stats = await page.evaluate('window.__colliders()');
  console.log(`  the map's colliders by kind: ${JSON.stringify(stats.byKind)}`);
  const house = await page.evaluate(`window.__build.findSolid('wall', ${drop.x}, ${drop.z})`);
  if (house) {
    const hc = house.centre;
    const gH = await hangAt(page, hc, d);
    say(await warned(page, 'blocked', 3), `a gate hung in a building's wall at (${hc.map(f1).join(', ')}), ${house.size.map(f1).join(' by ')} m: ${await warnList(page)}`);
    await key(page, 'KeyZ', { ctrl: true });
    await frames(page, 2);
    say(!(await warned(page, 'blocked')) && !(await page.evaluate(B('.gates'))).some((g) => g.id === gH.id), `undone, it is not: ${await warnList(page)}`);
  } else {
    console.log('  no building on this map large enough to hang a gate in');
  }
  say((await warnList(page)) === 'none', `the triangle is clean again: ${await warnList(page)}`);
  await lookAt(page, vAdd(vAdd(O, back, 90), [0, 1, 0], 70), vAdd(O, d, 20));
  await lineCost(page);

  /* clips: a new track of two gates, one low out over the drop and one
   * behind the edge twenty metres over the highest ground along the line
   * between them (the alps' drops are on a mountainside that goes on
   * rising behind the edge), both flown in towards the cliff: the line
   * from the low one climbs into the face. */
  await key(page, 'KeyN');
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
    await lookAt(page, vAdd(vAdd(g, d, 60), [0, 1, 0], 30), g);
    await shot(page, '13-line-into-the-face');
  }
  await moveTo(page, gLow.id, at(edge + 30, clear), back);
  say(!(await warned(page, 'clips')), `the low gate carried up to the other's height, ${f1(clear - top)} m over the highest ground: the line clears the face: ${await warnList(page)}`);
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
  await key(page, 'KeyN');
  await page.until(`${B('.gates.length')} === 0`, 10000);
  const g = await hangAt(page, at(edge + 25, drop.h + 10), d);
  const L = await page.evaluate(B('.line'));
  say(L.samples > 0 && L.gateAt.join() === '0', `its line is a loop out of it and back in: ${L.samples} points`);
  await key(page, 'KeyB');
  await page.until(`${B('.state')} === 'testing' && window.__craftState().mode === 'flight'`, 30000);
  say((await page.evaluate(B('.line.ribbon.opacity'))) < 0.5, 'on the test flight the line is faint');
  const laps = await page.evaluate('window.__ui.settings.laps');
  /* Each placement is followed by frames, not by a time: the race only
   * sees the craft where a frame of the shell's finds it, and on the
   * software renderer under load a frame can take longer than any sleep
   * this would otherwise guess at. */
  const put = async (to, from) => {
    await page.evaluate(`window.__placeCraft(${to.join(',')}${from ? `, ${from.join(',')}` : ''})`);
    await frames(page, 3);
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
  if (r.mode === 'results') {
    await page.evaluate("window.__ui.onAction('restart'); true");
    await page.until("window.__craftState().mode === 'flight'", 20000);
  }
  await key(page, 'KeyB');
  await page.until(`${B('.state')} === 'building'`, 10000);
  say((await page.evaluate(B('.line.ribbon.opacity'))) > 0.5, 'and back in building it is bright again');
  await takeMouse(page);
}

/* 15. What the line and the builder cost: the main thread's time in each
 * frame with the line and without it (V), and flying beside building with
 * the ghost and the hotbar up, in the page so the harness's round trips
 * stay off the thread being measured; what the builder's own code adds to
 * a frame, timed directly, since on the software renderer a frame takes a
 * second and swamps it; and what working the line out again costs an
 * edit. */
async function lineCost(page) {
  console.log('  what the line and the builder cost');
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
    await key(page, 'KeyV');
    const off = await run('line off');
    await key(page, 'KeyV');
    rounds.push({ on, off });
    console.log(`  round ${i + 1}: line on ${on.frames} frames, main thread ${on.cpu.toFixed(2)} ms, interval ${on.dt.toFixed(1)} ms; off ${off.frames} frames, ${off.cpu.toFixed(2)} ms, ${off.dt.toFixed(1)} ms`);
  }
  const mean = (k, f) => (rounds[0][k][f] + rounds[1][k][f]) / 2;
  console.log(`  the line on the main thread: ${(mean('on', 'cpu') - mean('off', 'cpu')).toFixed(2)} ms a frame (${mean('on', 'cpu').toFixed(2)} on, ${mean('off', 'cpu').toFixed(2)} off), software renderer`);
  const perFrame = await page.evaluate('window.__build.lineFrameMs(1000)');
  console.log(`  the line's own work in a frame, the panel's lines about it: ${(perFrame * 1000).toFixed(1)} microseconds`);
  const own = await page.evaluate('window.__build.buildFrameMs(200)');
  console.log(`  the builder's own work in a frame (hover ray, ghost and its red test, gizmo, hud): ${own.toFixed(3)} ms`);
  const building = await run('building');
  const cam = await page.evaluate(B('.camera'));
  await leave(page);
  await page.until("window.__craftState().mode === 'flight'", 10000);
  const flying = await run('flying');
  await key(page, 'KeyB');
  await page.until(`${B('.state')} === 'building'`, 10000);
  await takeMouse(page);
  await page.evaluate(`window.__build.look(${cam.pos.join(',')}, ${cam.yaw}, ${cam.pitch})`);
  console.log(`  building with the ghost and the hotbar: main thread ${building.cpu.toFixed(2)} ms a frame, interval ${building.dt.toFixed(1)} ms; flying: ${flying.cpu.toFixed(2)} ms, ${flying.dt.toFixed(1)} ms (software renderer, ${building.frames} and ${flying.frames} frames)`);
  const L = await page.evaluate(B('.line'));
  console.log(`  what the line draws: one mesh, one draw call, ${2 * L.samples} triangles, no shadow`);
  const edit = await page.evaluate('window.__build.lineMs(5)');
  console.log(`  working the line and the warnings out again: ${edit.ms.toFixed(1)} ms an edit, ${edit.gates} gates, ${edit.samples} points`);
  say((await page.evaluate(B('.line.on'))) === true, 'V twice leaves the line on');
  say(own < 2, `the builder's own work stays under 2 ms a frame: ${own.toFixed(3)} ms`);
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
     * camera, with six gates placed in view with Alt and a click, the
     * ghost up at the crosshair and the hotbar along the bottom. */
    const rounds = [];
    for (let round = 0; round < 2; round += 1) {
      const flying = await measure(page, `flying ${round + 1}`, 10, false);
      await key(page, 'KeyB');
      await page.until(`${B('.state')} === 'building'`, 20000);
      await takeMouse(page);
      const home = await page.evaluate(B('.camera'));
      if (round === 0) {
        await hold(page, 'gate');
        for (let i = 0; i < 6; i += 1) {
          await page.evaluate(`window.__build.look(${home.pos.join(',')}, ${home.yaw + (i - 2.5) * 0.12}, ${home.pitch})`);
          await settleCrosshair(page);
          await placeHere(page, { air: true });
        }
        await page.evaluate(`window.__build.look(${home.pos.join(',')}, ${home.yaw}, ${home.pitch})`);
        await page.sleep(3000);
        await shot(page, 'perf-building');
      }
      const building = await measure(page, `building ${round + 1}`, 10, true);
      await key(page, 'KeyV');
      const noLine = await measure(page, `no line ${round + 1}`, 10, true);
      await key(page, 'KeyV');
      rounds.push({ flying, building, noLine });
      await leave(page);
      await page.until(`${B('.state')} === 'off'`, 10000);
      await page.sleep(3000);
    }
    const med2 = (k, key2) => (rounds[0][k][key2] + rounds[1][k][key2]) / 2;
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

/* Each part on its own, so one that throws does not hide the rest. */
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
  await stage('pieces', piecesStage);
  await stage('line', lineAndWarnings);
  await stage('wing', () => wingStart(out));
  await stage('plane', planeStage);
  await stage('hoops', () => hoopStage('cub1400'));
  await stage('hoopsbramor', () => hoopStage('bramor2300', { place: false }));
  await stage('casual', () => casualStage('cub1400'));
}
console.log(failed ? `\n${failed} FAILED` : '\nall hold');
process.exit(failed ? 1 : 0);
