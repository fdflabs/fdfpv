/*
 * turtle-check.js: the turtle, in the real shell.
 *
 *   node scripts/turtle-check.js
 *
 * Two recoveries a pilot reaches when the quad is down. The scripted
 * turtle: a quad at rest on its back waits, parked, until a stick or an
 * arrow pokes it, then turns itself upright over TURTLE_FLIP_MS and sits on
 * its skids, and the stick that did it is ignored until it is let go, so
 * the leftover poke does not fly it straight back over. And Betaflight's
 * own crashflip, held on T at any attitude off the ground, which the
 * scripted turtle and a perch both keep out.
 *
 * This loads index.html with a five inch on the Swiss valley and drives
 * both through the window.__* hooks and real key events, recording every
 * frame the turtle's flags as the harness reads them (__craftState,
 * __crash) and asserting the order they change in. The flip's end pose is
 * printed so a rewrite can be held to the same numbers.
 *
 * Exit 0 when every check passed and the page logged no console error.
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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage, keyInfo } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const WAIT = 60000;

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) {
    failed += 1;
  }
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const settings = {
  ...seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'interceptor'),
  airframeAsked: true,
  map: 'swiss2',
  graphics: 'low',
  graphicsAuto: false,
  crashDamage: false,
  sound: false,
};
const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, ${JSON.stringify(settings)});
  localStorage.setItem(k, JSON.stringify(s));
} catch (e) { /* Storage refused; the run boots on its defaults. */ }`];

/*
 * One letter per flag, read every animation frame and kept only when it
 * changed: w wait, f flip, r recover (stick ignored until centred), t the
 * shell's crashflip latch, m the held T, c Betaflight's crashflip running,
 * l landed, h motors held at zero by the shell. A flip lasts a few frames,
 * so a poll from Node could step over it; a page side recorder cannot.
 */
const RECORDER = `(() => {
  const read = () => {
    const s = window.__craftState();
    const k = window.__crash();
    return (s.turtleWait ? 'w' : '-') + (s.turtleFlip ? 'f' : '-') + (s.turtleRecover ? 'r' : '-')
      + (s.turtle ? 't' : '-') + (s.manualFlip ? 'm' : '-') + (s.crashflipActive ? 'c' : '-')
      + (s.landed ? 'l' : '-') + (k.motorsHeld ? 'h' : '-') + ' ' + s.banner;
  };
  window.__turtleTrail = [];
  window.__turtleFrames = 0;
  if (window.__turtleRecording) {
    return true;
  }
  window.__turtleRecording = true;
  const tick = () => {
    window.__turtleFrames += 1;
    const now = read();
    const trail = window.__turtleTrail;
    if (trail[trail.length - 1] !== now) {
      trail.push(now);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return true;
})()`;

const trail = (page) => page.evaluate('JSON.stringify(window.__turtleTrail)').then(JSON.parse);
const flags = (t) => t.map((e) => e.split(' ')[0]);
const state = (page) => page.evaluate('JSON.stringify(window.__craftState())').then(JSON.parse);

async function restart(page) {
  await page.evaluate(RECORDER);
}

/* Frames rather than milliseconds: a frame is where the shell decides. */
async function frames(page, n) {
  const f0 = await page.evaluate('window.__turtleFrames');
  await page.until(`window.__turtleFrames >= ${f0 + n}`, WAIT);
}

async function keyDown(page, code) {
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...keyInfo(code) }, page.sessionId);
}
async function keyUp(page, code) {
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...keyInfo(code) }, page.sessionId);
}

/* The craft level and still on the grass at the spawn, in flight. */
async function onTheGrass(page) {
  await page.evaluate('window.__stick(0, 0, 0, 0)');
  const s = await page.evaluate('JSON.stringify(window.__placeCraft(window.__spawnX, window.__spawnY, window.__spawnZ))').then(JSON.parse);
  await page.evaluate("window.__seatCraft('')");
  return s;
}

/* Upside down on the grass: the wait begins without a frame in between. */
async function onItsBack(page) {
  await onTheGrass(page);
  await frames(page, 3);
  await restart(page);
  await page.evaluate("window.__seatCraft('inverted')");
}

const vec = (v, d = 3) => `${v.x.toFixed(d)} ${v.y.toFixed(d)} ${v.z.toFixed(d)}`;
const xyz = (v) => `${v.x.toFixed(6)} ${v.y.toFixed(6)} ${v.z.toFixed(6)}`;
const near = (a, b) => Math.abs(a - b) < 1e-6;
const pose = (s) => `pos ${s.worldX.toFixed(6)} ${s.worldY.toFixed(6)} ${s.worldZ.toFixed(6)} up ${vec(s.up, 6)} fwd ${vec(s.fwd, 6)}`;

async function scripted(page) {
  console.log('\nupside down on the grass: the wait, a poke too small, a stick poke, the flip, the stick let go');
  await onItsBack(page);
  const w0 = await state(page);
  const c0 = await page.evaluate('window.__crash().motorsHeld');
  check('seated on its back the turtle waits, parked, motors held',
    w0.turtleWait && w0.turtle && w0.turtleParked && !w0.turtleFlip && !w0.landed && c0 === true, JSON.stringify({ w: w0.turtleWait, t: w0.turtle, p: w0.turtleParked, h: c0 }));
  check('the plant is upside down', w0.up.y < -0.9, vec(w0.up));
  await page.evaluate('window.__stick(0.05, 0.05, 0, 0)');
  await frames(page, 15);
  const small = await state(page);
  check('a stick inside the poke gate leaves it waiting', small.turtleWait && !small.turtleFlip);
  const waitBanner = small.banner;
  check('the wait says what to do', waitBanner.length > 0, JSON.stringify(waitBanner));
  await page.evaluate('window.__stick(0, 0.5, 0, 0)');
  await page.until('window.__craftState().landed', WAIT);
  await frames(page, 5);
  const done = await state(page);
  const t = await trail(page);
  console.log(`    trail ${JSON.stringify(t)}`);
  const f = flags(t);
  const iFlip = f.findIndex((x) => x[1] === 'f');
  const iDone = f.findIndex((x, i) => i > iFlip && x[6] === 'l');
  check('the poke starts the flip from the wait', iFlip > 0 && f[iFlip - 1][0] === 'w' && f[iFlip][0] === '-' && f[iFlip][3] === 't', f.join(','));
  check('during the flip the shell holds the latch and the motors, never Betaflight\'s crashflip',
    f.slice(iFlip, iDone).every((x) => x[1] === 'f' && x[3] === 't' && x[7] === 'h' && x[5] === '-'), f.slice(iFlip, iDone).join(','));
  check('the flip says TURTLE MODE', t.slice(iFlip, iDone).some((e) => e.endsWith(' TURTLE MODE')));
  check('the flip ends landed, latch off, stick held so recover is on and the motors stay held',
    iDone > iFlip && f[iDone] === '--r---lh', f[iDone]);
  check('it ends upright', done.up.y > 0.99, vec(done.up));
  check('recover tells the pilot to let go', done.turtleRecover && done.banner.length > 0 && done.banner !== waitBanner && done.banner !== 'TURTLE MODE',
    JSON.stringify(done.banner));
  console.log(`    waited:  ${pose(w0)}`);
  console.log(`    flipped: ${pose(done)}`);
  check('it turns over where it lay, onto the same ground', near(done.plantPos.x, w0.plantPos.x) && near(done.plantPos.y, w0.plantPos.y)
    && near(done.plantPos.z, w0.plantPos.z), `plant ${xyz(w0.plantPos)} then ${xyz(done.plantPos)}`);

  /* Throttle up with the poke still held: recover owns the stick, so the
   * leftover poke cannot fly it straight back over, and it stays down. */
  await page.evaluate('window.__stick(0, 0.5, 0, 0.7)');
  await frames(page, 15);
  const held = await state(page);
  check('throttle with the poke still held is not a takeoff', held.landed && held.turtleRecover);
  await page.evaluate('window.__stick(0, 0, 0, 0)');
  await page.until('!window.__craftState().turtleRecover', WAIT);
  await frames(page, 3);
  const free = await state(page);
  const freeHeld = await page.evaluate('window.__crash().motorsHeld');
  check('centring the stick ends recover, clears the banner and frees the motors',
    !free.turtleRecover && free.banner === '' && freeHeld === false, JSON.stringify({ b: free.banner, h: freeHeld }));
  await page.evaluate('window.__stick(0, 0.5, 0, 0.7)');
  await page.until('!window.__craftState().landed', WAIT);
  await frames(page, 10);
  const flown = await page.evaluate('JSON.stringify(window.__crash().setpoint)').then(JSON.parse);
  check('then throttle is a takeoff and the pitch stick reaches the controller', Math.abs(flown[1]) > 50, `setpoint ${flown.map((v) => v.toFixed(1)).join(' ')}`);
  await page.evaluate('window.__stick(0, 0, 0, 0)');
}

async function arrows(page) {
  console.log('\nupside down, poked with the right arrow, held through the flip, then let go');
  await page.evaluate('window.__stick()');
  await onItsBack(page);
  await frames(page, 5);
  await keyDown(page, 'ArrowRight');
  await page.until('window.__craftState().landed', WAIT);
  await frames(page, 5);
  const done = await state(page);
  check('the arrow flips it and recover holds while the arrow is down', done.up.y > 0.99 && done.turtleRecover && done.banner.length > 0,
    `${JSON.stringify(done.banner)} up ${done.up.y.toFixed(3)}`);
  console.log(`    flipped: ${pose(done)}`);
  await keyUp(page, 'ArrowRight');
  await page.until('!window.__craftState().turtleRecover', WAIT);
  await frames(page, 3);
  const t = await trail(page);
  console.log(`    trail ${JSON.stringify(t)}`);
  const last = flags(t)[t.length - 1];
  check('letting go ends recover and frees the motors', last === '------l-', last);
}

async function fallsOnItsBack(page) {
  console.log('\ndropped upside down from 30 cm: it comes to rest and the wait begins by itself');
  await page.evaluate('window.__stick(0, 0, 0, 0)');
  await onTheGrass(page);
  await frames(page, 3);
  await restart(page);
  const ok = await page.evaluate(`(() => {
    const s = window.__craftState();
    const g = s.worldY - s.groundClearance;
    return window.__crashThrow({ x: s.worldX, y: g + 0.3, z: s.worldZ, yaw: 0, pitch: 0, roll: 180, vx: 0, vy: 0, vz: 0, showCraft: false }).ok;
  })()`);
  check('thrown', ok === true);
  await page.until('window.__craftState().turtleWait', WAIT);
  const s = await state(page);
  const f = flags(await trail(page));
  check('it waits upside down, latched and parked', s.turtle && s.turtleParked && s.up.y < -0.5 && f[f.length - 1] === 'w--t---h', f.join(','));

  /* T is the real crashflip, and the scripted wait keeps it out. */
  await keyDown(page, 'KeyT');
  await frames(page, 10);
  const t = await state(page);
  check('T held during the wait does nothing', !t.manualFlip && t.turtleWait && !t.crashflipActive);
  await keyUp(page, 'KeyT');

  /* X respawns in place, which puts the turtle down. */
  await page.tap('KeyX');
  await page.until('!window.__craftState().turtleWait', WAIT);
  await frames(page, 5);
  const x = await state(page);
  const c = await page.evaluate('window.__crash().motorsHeld');
  check('X ends the wait and frees the motors', !x.turtle && !x.turtleParked && !x.turtleRecover && c === false,
    JSON.stringify({ t: x.turtle, p: x.turtleParked, r: x.turtleRecover, h: c }));
}

async function heldT(page) {
  console.log('\nT held: Betaflight\'s crashflip, in the air only while held, never perched');
  await page.evaluate('window.__stick(0, 0, 0, 0)');
  await onTheGrass(page);
  await frames(page, 3);
  await restart(page);
  await keyDown(page, 'KeyT');
  await frames(page, 10);
  const perched = await state(page);
  check('perched on the grass T does nothing', perched.landed && !perched.manualFlip && !perched.crashflipActive);
  await keyUp(page, 'KeyT');
  await frames(page, 3);
  const ok = await page.evaluate(`(() => {
    const s = window.__craftState();
    return window.__crashThrow({ x: s.worldX, y: s.worldY + 20, z: s.worldZ, yaw: 0, pitch: 0, roll: 90, vx: 0, vy: 0, vz: 0, showCraft: false }).ok;
  })()`);
  check('thrown 20 m up on its side', ok === true);
  await page.evaluate('window.__stick(0, 0, 0, 0.3)');
  await frames(page, 3);
  await keyDown(page, 'KeyT');
  await page.until('window.__craftState().manualFlip', WAIT);
  await frames(page, 5);
  const on = await state(page);
  const hold = await page.evaluate('window.__crash().motorsHeld');
  check('held in the air it is Betaflight\'s crashflip, not the scripted turtle',
    on.manualFlip && on.crashflipActive && !on.turtle && !on.turtleWait && hold === false,
    JSON.stringify({ m: on.manualFlip, c: on.crashflipActive, t: on.turtle, h: hold }));
  await keyUp(page, 'KeyT');
  await page.until('!window.__craftState().manualFlip', WAIT);
  await frames(page, 3);
  const off = await state(page);
  check('let go, it is off again', !off.manualFlip && !off.crashflipActive);
  const f = flags(await trail(page));
  console.log(`    trail ${JSON.stringify(f)}`);
  check('the flags went off, on, off and nothing else latched', f.filter((x) => x[4] === 'm').length > 0 && f.every((x) => x[0] === '-' && x[3] === '-'), f.join(','));
  await page.evaluate('window.__stick(0, 0, 0, 0)');
}

const page = await openPage({ root, width: 960, height: 540, url: '/index.html?map=swiss2', seed });
let errors = 0;
try {
  await page.until('window.__shellReady && window.__map && window.__map().ready', 120000);
  await page.sleep(1000);
  await page.evaluate(`(() => {
    const s = window.__craftState();
    window.__spawnX = s.worldX;
    window.__spawnY = s.worldY;
    window.__spawnZ = s.worldZ;
    return true;
  })()`);
  /* Every assertion here reads the shell's state, none reads a pixel, and
   * on a CI runner a software rasterised frame of the valley took long
   * enough that 15 frames did not fit in a minute. The draw is skipped
   * (the harness hook the town's perf checks use); the loop, the plant
   * and the turtle run exactly as they do with it. */
  await page.evaluate('window.__drawOff(true)');
  await page.evaluate(RECORDER);
  const f0 = await page.evaluate('window.__turtleFrames');
  await page.sleep(2000);
  console.log(`frame rate with the draw off: ${((await page.evaluate('window.__turtleFrames') - f0) / 2).toFixed(1)} fps`);
  await scripted(page);
  await arrows(page);
  await fallsOnItsBack(page);
  await heldT(page);
} finally {
  const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e));
  errors = errs.length;
  for (const e of errs) {
    console.log(`  ERR ${e}`);
  }
  await page.close();
}
console.log(`\n${failed} check(s) failed; ${errors} console error(s)`);
process.exit(failed || errors ? 1 : 0);
