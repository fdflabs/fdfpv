/*
 * osd-check.js: the FPV OSD, flown in the real shell and read back.
 *
 * Flies a five inch quad and a Timber on the Alps, and a quad round the
 * reference course, in the FPV view, and asserts that each OSD element
 * shows the live value it claims to: the pack falls under load and the
 * warnings come up on a low pack, the timers count, the horizon follows
 * the attitude, a plane's altitude, speeds and home distance match
 * window.__craftState, the race clock and gates are there, the HUD style
 * setting switches the OSD off and survives a reload, and chase view has
 * none. It also resizes the page to a phone held both ways and to 4:3 and
 * checks the grid still fits, and prints what the OSD costs a frame.
 *
 *   node scripts/osd-check.js [--shots=dir] [--only=quad|plane|race]
 *
 * --shots writes a picture at each step, for looking at, not for keeping
 * (CLAUDE.md: no screenshots in the tree).
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

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { frames } from '../tests/lib/buildkeys.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const flag = (name) => {
  const a = args.find((s) => s.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
};
const shotsDir = flag('shots') ? resolve(flag('shots')) : null;
const only = flag('only');

let failed = 0;
let passed = 0;
const say = (ok, what) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
};
const near = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;
const f1 = (n) => (Number.isFinite(n) ? n.toFixed(1) : String(n));
const f2 = (n) => (Number.isFinite(n) ? n.toFixed(2) : String(n));

function seed(settings, extra = []) {
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(settings)});
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.airhint.v2', '1');
  } catch (e) { /* storage refused */ }`, ...extra];
}

function seatFor(craft, map) {
  return {
    ...seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, craft),
    airframeAsked: true,
    map,
    graphics: 'low',
    graphicsAuto: false,
    sound: false,
  };
}

async function open(settings, map, extra) {
  return openPage({ root, width: 1280, height: 720, url: `/index.html?map=${map}`, seed: seed(settings, extra) });
}

async function shot(page, name) {
  if (!shotsDir) {
    return;
  }
  const r = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(shotsDir, `${name}.png`), Buffer.from(r.data, 'base64'));
}

/*
 * Every read that follows a write (a setting, a key, a stick, a resize)
 * waits on the page's own frames, never on the wall clock: the shell
 * applies all of them in its frame, and under load a frame can take longer
 * than any fixed sleep. Three, because the first may already be running
 * and the shell's own callback may come after ours in the second.
 */
const settle = (page) => frames(page, 3);
const osd = (page) => page.evaluate('window.__fpvOsd()');
const craft = (page) => page.evaluate('window.__craftState()');
const rowsHave = (o, text) => o.rows.some((r) => r.includes(text));

/* The attitude the OSD should be reading, from the craft's own axes. */
function attitudeOfCraft(c) {
  const f = c.fwd;
  const u = c.up;
  const r = { x: f.y * u.z - f.z * u.y, y: f.z * u.x - f.x * u.z, z: f.x * u.y - f.y * u.x };
  let heading = (Math.atan2(f.x, -f.z) * 180) / Math.PI;
  if (heading < 0) {
    heading += 360;
  }
  return {
    pitch: (Math.asin(Math.max(-1, Math.min(1, f.y))) * 180) / Math.PI,
    roll: (Math.atan2(-r.y, u.y) * 180) / Math.PI,
    heading,
  };
}

async function flyAndWait(page, map) {
  await page.until('!!window.__shellReady', 240000);
  await page.until(`window.__map && window.__map().id === ${JSON.stringify(map)} && window.__map().ready`, 240000);
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight'", 120000);
  /* The intro orbit is not the FPV lens; the OSD comes up when it ends. */
  await page.until('window.__fpvOsd().on', 120000);
  await settle(page);
}

/* Screens the pilot flies on: a phone held upright and on its side, a 4:3
 * monitor. The grid has to stay on the canvas and the canvas on the page. */
async function sizes(page, tag) {
  for (const [w, h, mobile] of [[390, 844, true], [844, 390, true], [1024, 768, false]]) {
    await page.cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile }, page.sessionId);
    await settle(page);
    const o = await osd(page);
    const L = o.layout;
    /* On the canvas, and the crosshair cell centred on the screen. */
    const fits = L.w === w && L.h === h && L.ox >= 0 && L.oy >= 0 && L.ox + 30 * L.cw <= L.w && L.oy + 16 * L.ch <= L.h
      && Math.abs(L.ox + 14.5 * L.cw - w / 2) <= 1 && Math.abs(L.oy + 7.5 * L.ch - h / 2) <= 1;
    say(o.on && fits, `${tag} at ${w}x${h}: canvas ${L.w}x${L.h}, cells ${L.cw}x${L.ch}, grid from ${L.ox},${L.oy}`);
    await shot(page, `${tag}-${w}x${h}`);
  }
  await page.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }, page.sessionId);
  await settle(page);
}

function cost(o, tag) {
  const s = o.stats;
  const perFeed = s.feedMs / Math.max(1, s.feeds);
  const perTick = s.tickMs / Math.max(1, s.ticks);
  console.log(`  cost  ${tag}: feed ${(perFeed * 1000).toFixed(1)} us a frame over ${s.feeds} frames; tick ${perTick.toFixed(3)} ms over ${s.ticks} ticks (${s.paints} painted, worst ${s.worstTickMs.toFixed(1)} ms, the first, which draws the font)`);
}

async function quad() {
  console.log('\nquad: five inch on the Alps');
  const settings = seatFor('5inch', 'alps');
  const page = await open(settings, 'alps');
  try {
    await flyAndWait(page, 'alps');
    const cells = airframeById('5inch').cells;
    const rest = settings.packVoltage * cells;
    let o = await osd(page);
    await shot(page, 'quad-1-pad');
    say(o.values.disarmed && rowsHave(o, 'DISARMED'), 'on the pad: DISARMED, the motors are stopped');
    say(near(o.values.packV, rest, 0.02) && o.values.amps === 0 && o.values.mah === 0,
      `on the pad: ${f2(o.values.packV)} V at rest (${f2(rest)} open circuit), ${f2(o.values.amps)} A, ${f1(o.values.mah)} mAh`);
    say(o.values.mode === 'AIR' && rowsHave(o, 'AIR'), `flight mode ${o.values.mode}: the tune has Betaflight's airmode on`);
    say(o.values.lq === 100 && rowsHave(o, '100'), `LQ ${o.values.lq} on the perfect link`);
    say(rowsHave(o, 'AIRTIME'), 'the freestyle slot reads AIRTIME with scoring off');

    await page.evaluate('window.__stick(0, 0, 0, 0.8)');
    await page.until('window.__fpvOsd().values.flyS > 1.5', 180000);
    await page.evaluate('window.__stick(0, 0, 0, 0.45)');
    await page.sleep(1500);
    await settle(page);
    const a = await osd(page);
    await shot(page, 'quad-2-climb');
    say(!a.values.disarmed && !rowsHave(a, 'DISARMED'), 'in the air: DISARMED gone');
    say(a.values.amps > 1 && a.values.packV < rest - 0.1,
      `under load the pack sags: ${f2(a.values.packV)} V from ${f2(rest)}, drawing ${f2(a.values.amps)} A`);
    say(a.values.mah > 1, `mAh counts the plant's current: ${f1(a.values.mah)}`);
    say(a.values.throttle === 45 && rowsHave(a, ' 45'), `throttle ${a.values.throttle} percent at a 0.45 stick`);
    await page.sleep(1500);
    await settle(page);
    const b = await osd(page);
    const dWall = (b.values.at - a.values.at) / 1000;
    /* FLY is armed time on the sim clock, ON the wall clock: on a software
     * rasteriser the sim runs slower than the wall, so each is held to its
     * own clock. */
    const dFly = b.values.flyS - a.values.flyS;
    const dSim = b.values.simT - a.values.simT;
    const dOn = b.values.onS - a.values.onS;
    say(dFly > 0.05 && near(dFly, dSim, 0.01) && dOn > 0.05 && dOn <= dWall + 0.1 && b.values.mah > a.values.mah,
      `the timers count: FLY +${f2(dFly)} s over +${f2(dSim)} s of sim, ON +${f2(dOn)} s over +${f2(dWall)} s of wall; mAh ${f1(a.values.mah)} to ${f1(b.values.mah)}`);

    /* The HUD style row: off, the game's readout is back; on again. */
    const pilotRow = await page.evaluate(`(() => { window.__ui.show('pilot'); const t = document.getElementById('ui').innerText; window.__ui.show('flight'); return t; })()`);
    say(/HUD style/.test(pilotRow) && /FPV OSD/.test(pilotRow), 'Pilot settings has the HUD style row, reading FPV OSD');
    /*
     * The switch, watched frame by frame from the moment the setting is
     * written: every frame must show exactly one of the two readouts, never
     * both and never neither, and the new one must be up within two frames
     * (one if the shell's frame callback runs after the watcher's).
     */
    const swap = (style) => page.evaluate(`new Promise((done) => {
      window.__ui.settings.hudStyle = ${JSON.stringify(style)};
      window.__ui.persistSettings();
      const seen = [];
      const f = () => {
        const osdUp = getComputedStyle(document.querySelector('canvas.fpv-osd')).display !== 'none';
        const gameUp = getComputedStyle(document.querySelector('.osd-top')).display !== 'none';
        seen.push([osdUp, gameUp]);
        if (seen.length < 5) { requestAnimationFrame(f); } else { done(JSON.stringify(seen)); }
      };
      requestAnimationFrame(f);
    })`).then(JSON.parse);
    const toGame = await swap('game');
    await shot(page, 'quad-4-game');
    const toOsd = await swap('osd');
    const exclusive = (seen) => seen.every(([a, b]) => a !== b);
    const within = (seen, osdUp) => seen.findIndex(([a]) => a === osdUp) <= 1 && seen.slice(2).every(([a]) => a === osdUp);
    say(exclusive(toGame) && within(toGame, false), `HUD style Game: the OSD goes and the game readout comes back in the same frame, within two frames (${toGame.map(([a]) => (a ? 'osd' : 'game')).join(' ')})`);
    say(exclusive(toOsd) && within(toOsd, true), `HUD style FPV OSD: back the same way (${toOsd.map(([a]) => (a ? 'osd' : 'game')).join(' ')})`);

    /* A bank, held by a loop on the craft's own attitude, since a stick
     * timed on the wall clock is a different bank on every machine. */
    await page.evaluate(`(() => {
      window.__osdBank = 25;
      const tick = () => {
        const c = window.__craftState();
        if (window.__osdBank === null || !c || !c.fwd) { return; }
        const f = c.fwd, u = c.up;
        const ry = f.z * u.x - f.x * u.z;
        const roll = Math.atan2(-ry, u.y) * 180 / Math.PI;
        window.__stick(Math.max(-0.3, Math.min(0.3, 0.02 * (window.__osdBank - roll))), 0, 0, 0.5);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })()`);
    /* Two sim seconds of the loop, then a frame for the OSD to catch up. */
    await page.until(`window.__fpvOsd().values.simT > ${(await osd(page)).values.simT + 2}`, 180000);
    await settle(page);
    const [c, bank] = await Promise.all([craft(page), osd(page)]);
    const want = attitudeOfCraft(c);
    const ahRoll = Math.max(-400, Math.min(400, Math.round(bank.values.roll * 10)));
    say(near(bank.values.roll, want.roll, 4) && Math.abs(want.roll) > 5,
      `the horizon reads the craft's bank: OSD ${f1(bank.values.roll)} deg, craft ${f1(want.roll)} deg`);
    say(bank.values.ahRoll === ahRoll && near(bank.values.pitch, want.pitch, 4),
      `Betaflight's horizon arithmetic: ${bank.values.ahRoll} decidegrees drawn (clamped at 40), pitch ${f1(bank.values.pitch)} against ${f1(want.pitch)}`);
    await shot(page, 'quad-3-bank');
    await sizes(page, 'quad');
    await page.evaluate('(window.__osdBank = null, window.__stick(0, 0, 0, 0.5), true)');

    /* A low pack: 3.5 V a cell open circuit, a new run. */
    await page.evaluate('window.__stick(0, 0, 0, 0)');
    await page.evaluate('(window.__ui.settings.packVoltage = 3.5, window.__ui.persistSettings(), true)');
    await page.tap('KeyR');
    await page.until('window.__fpvOsd().on && window.__fpvOsd().values.mah === 0', 60000);
    await settle(page);
    const low0 = await osd(page);
    say(low0.values.warning === 'BATT < FULL', `a 3.5 V pack before takeoff: "${low0.values.warning}"`);
    await page.evaluate('window.__stick(0, 0, 0, 0.8)');
    /* Waited on the battery state, which is on the sim clock. */
    await page.until("['warning', 'critical'].includes(window.__fpvOsd().values.battery)", 180000).catch(() => null);
    /* It blinks at Betaflight's 2 Hz, so it is looked for frame by frame
     * over a few blink periods. */
    let low = await osd(page);
    let lit = false;
    for (let i = 0; i < 60 && !lit; i += 1) {
      low = await osd(page);
      lit = rowsHave(low, low.values.warning || '@');
      if (!lit) {
        await frames(page, 1);
      }
    }
    await shot(page, 'quad-5-lowbatt');
    say(['LOW BATTERY', 'LAND NOW'].includes(low.values.warning) && lit,
      `the same pack under load: "${low.values.warning}" at ${f2(low.values.cellV)} V a cell, battery ${low.values.battery}`);

    /* A crash: straight into the valley floor. */
    const hit = await page.evaluate(`(() => {
      const s = window.__craftState();
      return window.__crashThrow({ x: s.worldX, y: s.worldY + 1, z: s.worldZ, pitch: -80, vy: -30, showCraft: false });
    })()`);
    /* Read in one go: a wreck whose camera or antenna broke leaves the lens
     * for the chase view a beat later, and the OSD goes with it. */
    const look = `JSON.stringify((() => {
      const o = window.__fpvOsd();
      const cs = getComputedStyle(window.__ui.banner);
      return { on: o.on, disarmed: o.values.disarmed, rows: o.rows, banner: window.__craftState().banner,
        crashed: window.__craftState().crashed, font: cs.fontFamily, upper: cs.textTransform };
    })())`;
    let seen = null;
    for (let i = 0; i < 120 && !seen; i += 1) {
      const now = JSON.parse(await page.evaluate(look));
      if (now.on && now.banner) {
        seen = now;
        await shot(page, 'quad-6-crash');
      } else {
        await frames(page, 1);
      }
    }
    say(Boolean(hit) && Boolean(seen) && /mono/i.test(seen.font) && seen.upper === 'uppercase',
      seen
        ? `after the crash the game's banner reads as OSD text: "${seen.banner}" in ${seen.font.split(',')[0]}, ${seen.upper}; DISARMED ${seen.disarmed}`
        : 'after the crash: no frame with the OSD up and a banner');
    await page.sleep(2500);
    const later = JSON.parse(await page.evaluate(look));
    console.log(`  note  2.5 s later: OSD ${later.on ? 'up' : 'off, the wreck camera has the frame'}, banner "${later.banner}"`);
    cost(await osd(page), 'quad');

    /* The style survives a reload. */
    await page.evaluate("(window.__ui.settings.hudStyle = 'game', window.__ui.persistSettings(), location.reload(), true)");
    await page.sleep(3000);
    await page.until('!!window.__shellReady', 240000);
    const kept = await page.evaluate('window.__ui.settings.hudStyle');
    say(kept === 'game', `the HUD style persists across a reload: ${kept}`);
  } finally {
    await page.close();
  }
}

/* A plane's autopilot, in the page: wings level and a pitch to hold, on the
 * craft's own attitude, the same law scripts/water-render.js flies. */
const PLANE_PILOT = `
window.__osdPilot = { pitchDeg: 8, throttle: 1, on: true };
(() => {
  const tick = () => {
    const P = window.__osdPilot;
    const c = window.__craftState();
    if (P.on && c && c.mode === 'flight' && c.fwd) {
      const pitch = Math.asin(Math.max(-1, Math.min(1, c.fwd.y)));
      const right = { y: c.fwd.z * c.up.x - c.fwd.x * c.up.z };
      const roll = Math.max(-1, Math.min(1, 3 * right.y));
      const hold = Math.max(-1, Math.min(1, 3 * (P.pitchDeg * Math.PI / 180 - pitch)));
      window.__stick(roll, hold, 0, P.throttle);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();
`;

async function plane() {
  console.log('\nplane: Timber on the Alps');
  const settings = { ...seatFor('timber1500', 'alps'), wingView: 'fpv' };
  const page = await open(settings, 'alps');
  try {
    await flyAndWait(page, 'alps');
    let o = await osd(page);
    await shot(page, 'plane-1-strip');
    say(o.values.disarmed && o.values.flaps === 0 && rowsHave(o, 'FLAPS UP'), 'on the strip: DISARMED, FLAPS UP');
    say(o.values.mode === 'ANGL' || o.values.mode === 'MANU' || o.values.mode === 'ACRO', `flight mode ${o.values.mode}, INAV's name for the tune's stabiliser`);
    await page.tap('KeyF');
    await settle(page);
    o = await osd(page);
    say(o.values.flaps === 1 && rowsHave(o, 'FLAPS HALF'), 'F: FLAPS HALF');
    /* Waits are on what the plane has done, not on the wall clock: a
     * software rasteriser runs the sim slower than real time. */
    await page.evaluate(PLANE_PILOT);
    await page.until('window.__fpvOsd().values.alt > 3', 180000);
    await page.tap('KeyF');
    await page.tap('KeyF');
    await page.evaluate('(window.__osdPilot.pitchDeg = 6, true)');
    await page.until('window.__fpvOsd().values.alt > 8', 180000);
    const [c1, a] = await Promise.all([craft(page), osd(page)]);
    await shot(page, 'plane-2-climb');
    const home = a.values.home;
    const alt = c1.worldY - home.y;
    const gs = Math.hypot(c1.vel.x, c1.vel.z) * 3.6;
    const as = c1.speed * 3.6;
    const att = attitudeOfCraft(c1);
    say(!a.values.disarmed && alt > 3, `airborne: ${f1(alt)} m over the strip`);
    say(near(a.values.alt, alt, Math.max(1, Math.abs(c1.vel.y) * 0.5)), `altitude ${f1(a.values.alt)} m against __craftState ${f1(alt)} m`);
    say(near(a.values.gsKph, gs, Math.max(3, gs * 0.06)) && near(a.values.asKph, as, Math.max(3, as * 0.06)),
      `ground speed ${f1(a.values.gsKph)} against ${f1(gs)} km/h, airspeed ${f1(a.values.asKph)} against ${f1(as)} km/h (still air)`);
    say(near(a.values.vario, c1.vel.y, 1.5), `vario ${f2(a.values.vario)} against ${f2(c1.vel.y)} m/s`);
    const dh = Math.abs(((a.values.heading - att.heading + 540) % 360) - 180);
    say(dh < 5, `heading ${a.values.heading} deg against ${f1(att.heading)}`);
    say(near(a.values.pitch, att.pitch, 4) && near(a.values.roll, att.roll, 5),
      `the ladder reads the attitude: pitch ${f1(a.values.pitch)} against ${f1(att.pitch)}, roll ${f1(a.values.roll)} against ${f1(att.roll)}; the lens looks ${f1(a.values.horizonElevDeg)} deg up`);
    say(a.values.flaps === 0 && rowsHave(a, 'FLAPS UP'), 'F twice more: FLAPS UP again');
    const d1 = a.values.homeDist;
    await page.until(`window.__fpvOsd().values.homeDist > ${d1 + 25}`, 180000);
    const b = await osd(page);
    const c2 = await craft(page);
    const dTrue = Math.hypot(c2.worldX - home.x, c2.worldZ - home.z);
    say(b.values.homeDist > d1 + 20 && near(b.values.homeDist, dTrue, Math.max(3, c2.speed * 0.5)),
      `home distance grows: ${f1(d1)} to ${f1(b.values.homeDist)} m (__craftState ${f1(dTrue)} m), arrow ${b.values.homeDir} of 16, 8 is straight behind`);
    say(b.values.homeDir >= 6 && b.values.homeDir <= 10, 'flying away, the home arrow points behind');
    await shot(page, 'plane-3-cruise');

    await page.tap('KeyC');
    await settle(page);
    const chase = await osd(page);
    const top = await page.evaluate("getComputedStyle(document.querySelector('.osd-top')).display");
    await shot(page, 'plane-4-chase');
    say(!chase.on && top !== 'none', 'chase view: no OSD, the game readout');
    await page.tap('KeyC');
    await settle(page);
    const los = await osd(page);
    say(!los.on, 'line of sight: no OSD');
    await page.tap('KeyC');
    await settle(page);
    const again = await osd(page);
    say(again.on, 'back to FPV: the OSD returns');
    await sizes(page, 'plane');
    cost(await osd(page), 'plane');
  } finally {
    await page.close();
  }
}

async function race() {
  console.log('\nrace: five inch round the reference course');
  const doc = await readFile(join(root, 'tests/fixtures/course-reference.json'), 'utf8');
  const cls = JSON.parse(doc).trackClass;
  const key = cls === 'micro' ? 'webfpv.trackbuilder.autosave.micro.v1'
    : cls === 'wing' ? 'webfpv.trackbuilder.autosave.wing.v1'
      : 'webfpv.trackbuilder.autosave.v1';
  const page = await open(seatFor('5inch', 'custom'), 'custom',
    [`try { localStorage.setItem(${JSON.stringify(key)}, JSON.stringify(${doc})); } catch (e) { /* refused */ }`]);
  try {
    await flyAndWait(page, 'custom');
    const o = await osd(page);
    say(/^LAP /.test(o.values.clock) && /^GATE 1\/\d+$/.test(o.values.gate) && rowsHave(o, o.values.gate), `the race: "${o.values.clock}", "${o.values.gate}", cue "${o.values.cue}"`);
    /* Lit for 2.8 s of wall clock, as a crossing lights it. */
    await page.evaluate('window.__ghostGapShow(-340, false)');
    let g = await osd(page);
    for (let i = 0; i < 20 && !rowsHave(g, 'GHOST -0.34'); i += 1) {
      await frames(page, 1);
      g = await osd(page);
    }
    say(rowsHave(g, 'GHOST -0.34'), 'the ghost gap, lit: GHOST -0.34');
    await shot(page, 'race-1-start');
  } finally {
    await page.close();
  }
}

if (shotsDir) {
  await mkdir(shotsDir, { recursive: true });
}
try {
  if (!only || only === 'quad') {
    await quad();
  }
  if (!only || only === 'plane') {
    await plane();
  }
  if (!only || only === 'race') {
    await race();
  }
} catch (e) {
  failed += 1;
  console.log(`  FAIL  ${e.stack || e}`);
}
console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
