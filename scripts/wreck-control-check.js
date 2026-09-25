/*
 * wreck-control-check.js: a wreck keeps its sticks until its pack leaves,
 * in the real shell.
 *
 *   node scripts/wreck-control-check.js
 *
 * The owner's rule (2026-09-25): the aircraft answers the sticks for as
 * long as its electrical path works. Being a wreck is a race rule and a
 * prompt; only the plant takes control away, through the parts that have
 * gone. This loads index.html with crash damage on and, for a Cub and a
 * five inch, breaks the part that makes each a wreck in the air
 * (window.__crashBreak), then works the sticks (window.__stick) while it
 * falls, after it has come to rest, and after its pack is ejected, and
 * reads back what the plant did with them (window.__crash: the surfaces
 * and the motors' rpm). It fails if the shell ever parks the motors,
 * perches the wreck, or leaves a stick with nothing to move while the
 * pack is in, and if a stick moves anything once the pack is out.
 *
 * Exit 0 when every check passed and the page logged no console error.
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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) {
    failed += 1;
  }
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

function seed(airframe) {
  const settings = {
    ...seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, airframe),
    airframeAsked: true,
    map: 'airfield',
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
  } catch (e) { /* Storage refused; the run boots on its defaults. */ }`];
}

const read = (page) => page.evaluate(`JSON.stringify((() => {
  const c = window.__crash();
  const s = window.__craftState();
  return { wrecked: c.wrecked, powered: c.powered, down: c.down, flags: c.flagNames,
    rpm: c.rpm, surfaces: c.surfaces, held: c.motorsHeld, setpoint: c.setpoint, landed: s.landed, parked: s.turtleParked,
    crashed: s.crashed, speed: s.speed, banner: s.banner, rates: s.rates };
})())`).then(JSON.parse);

/*
 * EVERY WAIT IS ON THE PLANT'S CLOCK. A wall clock sleep is not a number of
 * steps: on a loaded host the page draws a frame every 100 to 200 ms, each
 * frame steps at most 100 ms of sim time, and two reads 80 ms apart can
 * land between the same two frames and see the same state. That is how
 * this check failed on a busy machine with every surface "moved 0.000".
 *
 * afterSteps(page, ms): return once the plant has stepped ms of sim time
 * past the next frame. A stick written with window.__stick is polled at
 * the start of a frame and stamped at the end of that frame's block
 * (src/main.js, wallToSim), so it reaches the plant from the frame after
 * the write: waiting for one frame and then ms more is waiting for ms of
 * the new stick. A plant that stops stepping (a perch, a freeze) never
 * gets there, and that fails loudly at the bound.
 */
const STEP_WAIT_MS = 60000;
const simT = (page) => page.evaluate('window.__crash().simT');
async function afterSteps(page, ms) {
  const t0 = await simT(page);
  await page.until(`window.__crash().simT > ${t0}`, STEP_WAIT_MS);
  const t1 = await simT(page);
  await page.until(`window.__crash().simT >= ${t1 + ms / 1000}`, STEP_WAIT_MS);
}

/* Hold a stick for ms of sim time and read what the craft did with it. */
async function hold(page, stick, ms) {
  await page.evaluate(`window.__stick(${stick.join(',')})`);
  await afterSteps(page, ms);
  return read(page);
}

async function open(airframe) {
  const page = await openPage({ root, width: 960, height: 540, url: '/index.html?map=airfield', seed: seed(airframe) });
  await page.until('window.__shellReady && window.__map && window.__map().ready', 120000);
  await page.sleep(1000);
  return page;
}

/* Wait until the shell calls the wreck down, then for one more frame: the
 * prompt is drawn by the frame, which may not have run since. */
async function settle(page, limitMs) {
  const t0 = Date.now();
  let r = await read(page);
  while (Date.now() - t0 < limitMs && !r.down) {
    await page.sleep(200);
    r = await read(page);
  }
  await afterSteps(page, 0);
  return read(page);
}

/* Put the craft level and still 0.35 m over the ground under it: a wreck
 * seen at rest with its pack in, which a real fall rarely leaves. */
const setDown = (page) => page.evaluate(`(() => {
  const s = window.__craftState();
  const g = s.worldY - s.groundClearance;
  return window.__crashThrow({ x: s.worldX, y: g + 0.35, z: s.worldZ, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, showCraft: false }).ok;
})()`);

const fmt = (a) => (a ? a.map((v) => v.toFixed(3)).join(' ') : 'none');
const fmtRpm = (a) => (a ? a.map((v) => v.toFixed(0)).join(' ') : 'none');

/*
 * Flip one stick between full one way and full the other, three times,
 * and return the mean difference each surface showed: what moving that
 * stick moved. The flips are short because a stabiliser also moves the
 * surfaces as the attitude changes, and a tumbling wreck changes fast.
 */
async function sweep(page, axis, throttle) {
  const diff = [0, 0, 0, 0];
  let reads = [];
  for (let k = 0; k < 3; k += 1) {
    const up = [0, 0, 0, throttle];
    const down = [0, 0, 0, throttle];
    up[axis] = 1;
    down[axis] = -1;
    const a = await hold(page, up, 80);
    const b = await hold(page, down, 80);
    reads = reads.concat([a, b]);
    for (let i = 0; i < 4; i += 1) {
      diff[i] += (a.surfaces[i] - b.surfaces[i]) / 3;
    }
  }
  return { diff, reads };
}

async function surfacesFollow(page, where, throttle) {
  const roll = await sweep(page, 0, throttle);
  check(`${where}: the right aileron follows the roll stick, the lost left one never moves`,
    roll.diff[1] > 0.05 && roll.reads.every((r) => r.surfaces[0] === 0), `moved ${fmt(roll.diff)}`);
  const pitch = await sweep(page, 1, throttle);
  check(`${where}: the elevator follows the pitch stick`, pitch.diff[2] > 0.02, `moved ${fmt(pitch.diff)}`);
  const yaw = await sweep(page, 2, throttle);
  check(`${where}: the rudder follows the yaw stick`, yaw.diff[3] < -0.02, `moved ${fmt(yaw.diff)}`);
  return yaw.reads[yaw.reads.length - 1];
}

/* Each stick full one way then the other: Betaflight's setpoint for that
 * axis follows it, and the shell holds no motor. */
async function quadSticksReach(page, where, throttle) {
  const flips = [];
  for (let axis = 0; axis < 3; axis += 1) {
    const up = [0, 0, 0, throttle];
    const down = [0, 0, 0, throttle];
    up[axis] = 0.8;
    down[axis] = -0.8;
    const a = await hold(page, up, 120);
    const b = await hold(page, down, 120);
    flips.push({ a, b, axis });
  }
  const held = flips.some((f) => f.a.held || f.b.held || f.a.parked || f.b.parked);
  const last = flips[2].b;
  check(`${where}: the shell holds no motor, and they turn`, !held && Math.max(...last.rpm) > 3000, fmtRpm(last.rpm));
  const follow = flips.map((f) => f.a.setpoint[f.axis] - f.b.setpoint[f.axis]);
  check(`${where}: Betaflight's roll, pitch and yaw setpoints follow the sticks`, follow.every((d) => Math.abs(d) > 100),
    `moved ${follow.map((d) => d.toFixed(0)).join(', ')} deg/s`);
}

async function plane() {
  console.log('\na Cub loses its left wing panel at 150 m, is set down on the grass, then loses its pack');
  const page = await open('cub1400');
  try {
    const spawn = await page.evaluate('JSON.stringify((() => { const s = window.__craftState(); return [s.worldX, s.worldY, s.worldZ]; })())').then(JSON.parse);
    const thrown = await page.evaluate(`JSON.stringify(window.__crashThrow({ x: ${spawn[0]}, y: ${spawn[1] + 150}, z: ${spawn[2]}, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: -15, showCraft: false }))`).then(JSON.parse);
    check('thrown into the air', thrown.ok === true, JSON.stringify(thrown).slice(0, 120));
    await hold(page, [0, 0, 0, 0.6], 800);
    const wing = await page.evaluate('window.__crash().parts.indexOf("wing")');
    await page.evaluate(`window.__crashBreak(${wing})`);
    await afterSteps(page, 0);
    const hit = await read(page);
    check('the lost panel makes it a wreck, with its pack in', hit.wrecked && hit.powered, hit.flags.join(','));
    check('no reset prompt while it falls', !hit.down && !/\bR\b/.test(hit.banner), JSON.stringify(hit.banner));
    const last = await surfacesFollow(page, 'falling', 0.6);
    check('falling: the motor still turns on the throttle', last.rpm[0] > 1000, `${last.rpm[0].toFixed(0)} rpm`);
    await page.evaluate('window.__stick(0, 0, 0, 0)');
    check('set down on the grass', await setDown(page));
    const rest = await settle(page, 20000);
    check('it lies still with its pack in: the reset prompt shows', rest.down && rest.powered && rest.banner.length > 0,
      `${JSON.stringify(rest.banner)}, flags ${rest.flags.join(',')}`);
    check('at rest it is not perched: the plant still steps', rest.landed === false && !rest.crashed);
    await surfacesFollow(page, 'at rest', 0);
    const t2 = await hold(page, [0, 0, 0, 0.8], 400);
    check('at rest: the throttle still turns the motor', t2.rpm[0] > 1000, `${t2.rpm[0].toFixed(0)} rpm`);
    await page.evaluate('window.__stick(0, 0, 0, 0)');
    const pack = await page.evaluate('window.__crash().parts.indexOf("battery")');
    await page.evaluate(`window.__crashBreak(${pack})`);
    await afterSteps(page, 0);
    const r3 = await hold(page, [1, 1, 1, 0.8], 300);
    const l3 = await hold(page, [-1, -1, -1, 0.8], 300);
    check('pack out: every surface reads nothing and the motor has stopped, whatever the sticks',
      !r3.powered && r3.surfaces.every((v) => v === 0) && l3.surfaces.every((v) => v === 0) && r3.rpm[0] === 0 && l3.rpm[0] === 0,
      `${fmt(r3.surfaces)} / ${fmt(l3.surfaces)}, ${r3.rpm[0]} rpm`);
    check('pack out: the reset prompt shows', l3.down && l3.banner.length > 0, JSON.stringify(l3.banner));
  } finally {
    await finish(page);
  }
}

async function quad() {
  console.log('\na five inch loses its front left prop at 30 m, is set down on the grass, then loses its pack');
  const page = await open('5inch');
  try {
    const thrown = await page.evaluate(`JSON.stringify((() => {
      const s = window.__craftState();
      return window.__crashThrow({ x: s.worldX, y: s.worldY + 30, z: s.worldZ, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, showCraft: false });
    })())`).then(JSON.parse);
    check('thrown into the air', thrown.ok === true, JSON.stringify(thrown).slice(0, 120));
    await hold(page, [0, 0, 0, 0.35], 500);
    const parts = await page.evaluate('window.__crash().parts');
    /* configs/parts.js order: the front left prop is the last of the four. */
    const prop = parts.lastIndexOf('prop');
    await page.evaluate(`window.__crashBreak(${prop})`);
    await afterSteps(page, 0);
    const hit = await read(page);
    check('the lost prop makes it a wreck, with its pack in', hit.wrecked && hit.powered, hit.flags.join(','));
    /*
     * What the shell owes a wreck is the sticks reaching Betaflight and the
     * motors left to it, so that is what is read: the controller's setpoint
     * and the shell's motor hold. What Betaflight then does with three props
     * is the plant's, proved deterministically in crash:core ("a five inch
     * with a prop gone is still flown by Betaflight on the other three");
     * here the trajectory hangs on when each frame fell, and a saturated
     * mixer can leave a motor's speed where it was whichever way the stick
     * goes.
     */
    await quadSticksReach(page, 'tumbling', 0.5);
    await page.evaluate('window.__stick(0, 0, 0, 0)');
    check('set down on the grass', await setDown(page));
    const rest = await settle(page, 20000);
    check('on the grass with its pack in, thrashing on three props or still, the reset prompt shows in time',
      rest.down && rest.powered && rest.banner.length > 0, `${JSON.stringify(rest.banner)}, flags ${rest.flags.join(',')}`);
    check('on the grass it is not perched or parked', rest.landed === false && !rest.parked && !rest.crashed);
    await quadSticksReach(page, 'on the grass', 0.6);
    await page.evaluate('window.__stick(0, 0, 0, 0)');
    const pack = await page.evaluate('window.__crash().parts.indexOf("battery")');
    await page.evaluate(`window.__crashBreak(${pack})`);
    /* The rotors coast down on their own drag; full throttle must not
     * slow that or turn one back up. */
    const early = await hold(page, [0, 0, 0, 1], 300);
    const off = await hold(page, [0, 0, 0, 1], 1500);
    check('pack out: at full throttle no motor speeds up, and those that turned coast down',
      !off.powered && off.rpm.every((v, m) => v <= early.rpm[m] + 1)
        && off.rpm.filter((v, m) => v < 0.8 * early.rpm[m]).length >= 2,
      `${fmtRpm(early.rpm)} then ${fmtRpm(off.rpm)}`);
    check('pack out: the reset prompt shows', off.down && off.banner.length > 0, JSON.stringify(off.banner));
  } finally {
    await finish(page);
  }
}

let consoleErrors = 0;
async function finish(page) {
  const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e));
  consoleErrors += errs.length;
  for (const e of errs) {
    console.log(`  ERR ${e}`);
  }
  await page.close();
}

await plane();
await quad();
console.log(`\n${failed} check(s) failed; ${consoleErrors} console error(s)`);
process.exit(failed || consoleErrors ? 1 : 0);
