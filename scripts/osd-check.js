/*
 * osd-check.js: the FPV OSD, flown in the real shell and read back.
 *
 * Flies a five inch quad and a Timber on the Alps, and a quad round a built
 * ring in Track mode, in the FPV view, and asserts that each OSD element
 * shows the live value it claims to: the pack falls under load and the
 * warnings come up on a low pack, the timers count, the horizon follows
 * the attitude, a plane's altitude, speeds and home distance match
 * window.__craftState, the race clock and gates are there, the HUD style
 * setting switches the OSD off and survives a reload, and chase view has
 * none. It also resizes the page to 1280x720, 1920x1080, 1280x720 at twice
 * the pixels, a phone held both ways and 4:3, and on each checks that the
 * type is no taller than the music player's song title (the owner's
 * yardstick), that both grids fit, and that every readout is on the
 * screen, off every other and off the game's chips and stick gimbals, in
 * its corner or on its edge. The game's banners (the takeoff prompt, the
 * air start countdown, a wreck) are drawn by the OSD in its own type with
 * the HTML banner hidden, and the Game style keeps the HTML banner. It
 * prints what the OSD costs a frame.
 *
 *   node scripts/osd-check.js [--shots=dir] [--only=quad|plane|race]
 *
 * --shots writes a picture at each step, for looking at, not for keeping
 * (CLAUDE.md: no screenshots in the tree).
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
    ...seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, craft),
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
/* The game's HTML banner and what the OSD makes of it: in the FPV OSD
 * style the element is hidden and the OSD draws its text; in the Game
 * style the element is the banner, in the game's own type. */
const banner = (page) => page.evaluate(`JSON.stringify((() => {
  const b = window.__ui.banner;
  const cs = getComputedStyle(b);
  const o = window.__fpvOsd();
  return { html: b.textContent, display: cs.display, fontPx: parseFloat(cs.fontSize), font: cs.fontFamily,
    osd: o.values.banner || '', rows: o.rows, box: o.layout.readouts.find((r) => r.id === 'banner') || null,
    cell: o.layout.text };
})())`).then(JSON.parse);
const osdCarries = (b) => b.display === 'none' && b.osd === b.html && Boolean(b.box);

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

/*
 * THE TYPE AND THE LAYOUT. The owner's yardstick is the music player's song
 * title: no OSD character may be taller than it on the same screen. Both
 * are measured the same way, as the height of the white ink of the digits
 * "100": the OSD's straight off its canvas (the LQ readout), the title's by
 * drawing the same digits in the title's computed font on a whole pixel
 * baseline, as text is laid out. A row counts for as much of a pixel as its
 * whitest pixel is white. INK_TOL is that measure's own noise, a tenth of a
 * pixel, and no more.
 */
const INK_TOL = 0.1;
/* The OSD's type in CSS px on a desktop screen: about 11, the title's size,
 * and never over it. */
const TYPE_BAND = [9, 11];
const measure = (page) => page.evaluate(`(() => {
  const L = window.__fpvOsd().layout;
  const s = L.scale;
  const ink = (img) => {
    let sum = 0;
    for (let y = 0; y < img.height; y += 1) {
      let m = 0;
      for (let x = 0; x < img.width; x += 1) {
        const i = (y * img.width + x) * 4;
        m = Math.max(m, (Math.min(img.data[i], img.data[i + 1], img.data[i + 2]) * img.data[i + 3]) / 65025);
      }
      sum += m;
    }
    return sum;
  };
  const r = L.readouts.find((b) => b.id === 'lq-fly');
  const g = document.querySelector('canvas.fpv-osd-text').getContext('2d');
  const osd = r ? ink(g.getImageData(Math.round((r.x + 2 * L.text.cw) * s), Math.round(r.y * s),
    Math.round(3 * L.text.cw * s), Math.round(L.text.ch * s))) / s : NaN;
  const title = document.querySelector('.music-title');
  const cs = getComputedStyle(title);
  const c = document.createElement('canvas');
  c.width = Math.ceil(80 * s);
  c.height = Math.ceil(40 * s);
  const t = c.getContext('2d');
  /* At the device size, as the page sets it, not scaled up from the CSS
   * one: hinting works on the pixels it is given. */
  t.font = cs.fontWeight + ' ' + parseFloat(cs.fontSize) * s + 'px ' + cs.fontFamily;
  t.fillStyle = '#fff';
  t.textBaseline = 'alphabetic';
  t.fillText('100', 4, Math.round(30 * s));
  const chips = [...document.querySelectorAll('.bug-chip, .music-dock, .osd-gimbal')]
    .map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0 && b.height > 0)
    .map((b) => ({ x: b.left, y: b.top, w: b.width, h: b.height }));
  return JSON.stringify({ osd, title: ink(t.getImageData(0, 0, c.width, c.height)) / s, titlePx: cs.fontSize,
    titleShown: title.getBoundingClientRect().width > 0, chips });
})()`).then(JSON.parse);

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/*
 * What is wrong with a layout, as a list: a readout off the screen, on
 * another, or on one of the game's chips or stick gimbals; a corner group
 * away from its corner. Ladder numbers are not readouts: they ride the
 * rungs.
 */
function layoutFaults(L, chips, w, h) {
  const out = [];
  const R = L.readouts;
  const by = Object.fromEntries(R.map((r) => [r.id, r]));
  for (const r of R) {
    if (r.x < 0 || r.y < 0 || r.x + r.w > w || r.y + r.h > h) {
      out.push(`${r.id} off the screen`);
    }
    for (const c of chips) {
      if (overlaps(r, c)) {
        out.push(`${r.id} on a chip at ${Math.round(c.x)},${Math.round(c.y)}`);
      }
    }
  }
  for (let i = 0; i < R.length; i += 1) {
    for (let j = i + 1; j < R.length; j += 1) {
      if (overlaps(R[i], R[j])) {
        out.push(`${R[i].id} on ${R[j].id}`);
      }
    }
  }
  /* Anchored: within two cells of its sides, or, where a chip or a gimbal
   * holds that corner, within two rows under or over it. */
  const near = 16 + 2 * L.text.cw;
  const nearY = 16 + 2 * L.text.ch;
  const beside = (r, c) => r.x < c.x + c.w && c.x < r.x + r.w;
  const underChip = (r) => chips.some((c) => beside(r, c) && r.y >= c.y + c.h && r.y <= c.y + c.h + 2 * L.text.ch);
  const overChip = (r) => chips.some((c) => beside(r, c) && r.y + r.h <= c.y && r.y + r.h >= c.y - 2 * L.text.ch);
  const want = [
    ['lq-fly', (r) => r.x <= near && (r.y <= nearY || underChip(r))],
    ['thr-on', (r) => r.x + r.w >= w - near && (r.y <= nearY || underChip(r))],
    ['mode-batt', (r) => r.x <= near && (r.y + r.h >= h - nearY || overChip(r))],
    ['amps-mah', (r) => r.x + r.w >= w - near && (r.y + r.h >= h - nearY || overChip(r))],
    ['race', (r) => Math.abs(r.x + r.w / 2 - w / 2) <= L.text.cw && (r.y <= nearY || underChip(r))],
  ];
  for (const [id, ok] of want) {
    if (!by[id] || !ok(by[id])) {
      out.push(`${id} not in its place${by[id] ? ` (${Math.round(by[id].x)},${Math.round(by[id].y)} ${Math.round(by[id].w)}x${Math.round(by[id].h)})` : ''}`);
    }
  }
  return out;
}

/* Screens the pilot flies on: the two desktop sizes, one of them at twice
 * the pixels, a phone held upright and on its side, a 4:3 monitor. On each
 * the type is no taller than the song title, the grids stay on the canvas
 * and the readouts in their places. */
async function sizes(page, tag) {
  for (const [w, h, dpr, mobile] of [[1280, 720, 1, false], [1920, 1080, 1, false], [1280, 720, 2, false],
    [390, 844, 1, true], [844, 390, 1, true], [1024, 768, 1, false]]) {
    await page.cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile }, page.sessionId);
    await settle(page);
    const o = await osd(page);
    const m = await measure(page);
    const L = o.layout;
    const I = L.inst;
    const T = L.text;
    const at = `${tag} at ${w}x${h}${dpr > 1 ? ` x${dpr}` : ''}`;
    /* On the canvas, the crosshair cell centred on the screen, the
     * readouts inside the 16 px edge. */
    const fits = L.w === Math.round(w * dpr) && L.h === Math.round(h * dpr) && L.scale === dpr
      && I.ox >= 0 && I.oy >= 0 && I.ox + 30 * I.cw <= w && I.oy + 16 * I.ch <= h
      && Math.abs(I.ox + 14.5 * I.cw - w / 2) <= 1 && Math.abs(I.oy + 7.5 * I.ch - h / 2) <= 1
      && T.ox >= 16 && T.oy >= 16 && T.ox + T.cols * T.cw <= w - 16 && T.oy + T.rows * T.ch <= h - 16;
    say(o.on && fits, `${at}: canvas ${L.w}x${L.h}; instruments ${f1(I.cw)}x${f1(I.ch)} from ${f1(I.ox)},${f1(I.oy)}; readouts ${T.cols}x${T.rows} cells of ${f1(T.cw)}x${f1(T.ch)}`);
    const desk = !mobile;
    say(m.osd <= m.title + INK_TOL && m.osd >= 0.85 * m.title && (!desk || (L.textPx >= TYPE_BAND[0] && L.textPx <= TYPE_BAND[1])),
      `${at}: type ${f2(L.textPx)} px, digits ${f2(m.osd)} px of white ink against the song title's ${f2(m.title)} px (${m.titlePx}${m.titleShown ? '' : ', dock hidden'})${desk ? `, in ${TYPE_BAND[0]} to ${TYPE_BAND[1]} px` : ''}`);
    const faults = layoutFaults(L, m.chips, w, h);
    say(faults.length === 0, `${at}: ${L.readouts.length} readouts on the screen, apart, clear of ${m.chips.length} chips and gimbals, in their places${faults.length ? `: ${faults.join('; ')}` : ''}`);
    await shot(page, `${tag}-${w}x${h}${dpr > 1 ? `x${dpr}` : ''}`);
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
  /* Sound on, so the music dock and its song title are on screen, top
   * left: the title is the type's yardstick and the dock a chip the
   * readouts must clear. The plane flies with it off. */
  const settings = { ...seatFor('interceptor', 'alps'), sound: true };
  const page = await open(settings, 'alps');
  try {
    await flyAndWait(page, 'alps');
    const cells = airframeById('interceptor').cells;
    const rest = settings.packVoltage * cells;
    let o = await osd(page);
    await shot(page, 'quad-1-pad');
    say(o.values.disarmed && rowsHave(o, 'DISARMED'), 'on the pad: DISARMED, the motors are stopped');
    const prompt = await banner(page);
    const promptLine = prompt.html.split('\n')[0].toUpperCase();
    say(osdCarries(prompt) && /^Throttle up/.test(prompt.html) && rowsHave(prompt, promptLine),
      `the takeoff prompt is the OSD's, not the HTML banner's: "${promptLine}" on the grid, the element ${prompt.display}`);
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
    /* The Game style keeps the HTML banner as it was, in the game's type. */
    await swap('game');
    const game = await banner(page);
    await swap('osd');
    const again = await banner(page);
    say(game.display !== 'none' && game.fontPx >= 17 && !/mono/i.test(game.font) && /^Throttle up/.test(game.html),
      `HUD style Game keeps the HTML banner: "${game.html.split('\n')[0]}" at ${f1(game.fontPx)} px ${game.font.split(',')[0]}`);
    say(osdCarries(again) && again.html === game.html, 'HUD style FPV OSD hides it and draws the text again');
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
        osd: o.values.banner || '', display: cs.display, crashed: window.__craftState().crashed };
    })())`;
    /* The OSD draws last frame's banner, so the frame wanted is the one on
     * which both the element and the OSD carry it. */
    let seen = null;
    for (let i = 0; i < 120 && !seen; i += 1) {
      const now = JSON.parse(await page.evaluate(look));
      if (now.on && now.banner && now.osd === now.banner) {
        seen = now;
        await shot(page, 'quad-6-crash');
      } else {
        await frames(page, 1);
      }
    }
    const wreckLine = seen ? seen.banner.toUpperCase().slice(0, 26) : '';
    say(Boolean(hit) && Boolean(seen) && seen.display === 'none' && rowsHave(seen, wreckLine),
      seen
        ? `after the crash the OSD draws the game's banner: "${seen.banner}" on the grid, the element ${seen.display}; DISARMED ${seen.disarmed}`
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
    /* The plane's pack is the plant's: the OSD's mAh is the charge the
     * plant has drawn, not a count of its own (docs/POWER-STAGE1.md). */
    const [pm, pc] = await Promise.all([osd(page), page.evaluate('window.__craft()')]);
    say(pc.power && pc.power.capacityC > 0 && near(pm.values.mah, pc.power.chargeC / 3.6, 2) && pm.values.fuel === null,
      `mAh is the plant's: ${f1(pm.values.mah)} on the OSD, ${pc.power ? f1(pc.power.chargeC / 3.6) : '?'} drawn of a ${pc.power ? f1(pc.power.capacityC / 3.6) : '?'} mAh pack, no fuel readout`);
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

/*
 * A glow plane: the Kadet Senior on its stock engine and tank. The fuel
 * readout is the plant's tank, full on the strip and falling in the climb.
 */
async function glow() {
  console.log('\nglow: Kadet Senior on the Alps');
  const settings = { ...seatFor('kadet1981', 'alps'), wingView: 'fpv' };
  const page = await open(settings, 'alps');
  try {
    await flyAndWait(page, 'alps');
    const o = await osd(page);
    say(o.values.fuel === 100 && rowsHave(o, 'FUEL100%'), `on the strip: the tank full, ${JSON.stringify(o.values.fuel)} percent`);
    await page.evaluate(PLANE_PILOT);
    await page.until('window.__fpvOsd().values.fuel < 100', 240000).catch(() => {});
    const [g, c] = await Promise.all([osd(page), page.evaluate('window.__craft()')]);
    await shot(page, 'glow-1-climb');
    say(g.values.fuel < 100 && c.power && Math.abs(g.values.fuel - c.power.fuelFrac * 100) <= 1,
      `in flight it burns: ${g.values.fuel} percent on the OSD, ${c.power ? f1(c.power.fuelFrac * 100) : '?'} in the plant's ${c.power ? f1(c.power.tankM3 * 1e6) : '?'} cc tank`);
  } finally {
    await page.close();
  }
}

/*
 * A race needs a built track now that the race field is gone: the ring in
 * tests/fixtures/map-track-v4.json (three gates on the Swiss valley) goes
 * in the library, and Track mode plays it the way a pilot does, through
 * My tracks, the card and the launch card, as scripts/track-mode-check.js
 * walks it.
 */
const LIBRARY_KEY = 'webfpv.trackbuilder.library.v1';

async function choose(page, action) {
  const at = await page.evaluate(`window.__ui.items().findIndex((it) => it.action === ${JSON.stringify(action)})`);
  if (at < 0) {
    throw new Error(`no row ${action} on ${await page.evaluate('window.__ui.screen')}`);
  }
  await page.evaluate(`(() => { window.__ui.setCursor(${at}); window.__ui.select(); return true; })()`);
}

async function race() {
  console.log('\nrace: five inch round a built ring on the Swiss valley');
  const track = JSON.parse(await readFile(join(root, 'tests/fixtures/map-track-v4.json'), 'utf8'));
  const n = track.sequence.length;
  const page = await openPage({
    root,
    width: 1280,
    height: 720,
    url: '/index.html',
    seed: seed({ ...seatFor('interceptor', 'track'), fpsCap: 0 },
      [`try { localStorage.setItem(${JSON.stringify(LIBRARY_KEY)}, ${JSON.stringify(JSON.stringify({ [track.id]: track }))}); } catch (e) { /* refused */ }`]),
  });
  try {
    await page.until('!!window.__shellReady', 300000);
    await page.until('window.__map && window.__map().ready', 400000);
    await page.until('window.__ui.onGate()', 60000);
    await choose(page, 'way-race-5inch');
    await page.until('window.__ui.carousel.isOpen', 10000);
    await page.tap('Enter');
    await page.until("window.__ui.screen === 'courses'", 20000);
    const at = await page.evaluate(`window.__ui.items().findIndex((it) => it.course && it.course.track.id === ${JSON.stringify(track.id)})`);
    await page.evaluate(`(() => { window.__ui.setCursor(${at}); window.__ui.select(); return true; })()`);
    await page.until(`window.__ui.cardSubject && window.__ui.cardSubject.endsWith(${JSON.stringify(`:${track.id}`)})`, 5000);
    await choose(page, 'card-fly');
    await page.until(`window.__ui.screen === 'launch' && window.__map().ready && window.__map().id === ${JSON.stringify(track.map)} && window.__race().gates.length === ${n}`, 600000);
    await choose(page, 'launch-go');
    await page.until("window.__craftState().mode === 'flight' && window.__ui.screen === 'flight'", 120000);
    await page.until('window.__fpvOsd().on', 120000);
    await settle(page);
    const o = await osd(page);
    say(/^LAP /.test(o.values.clock) && o.values.gate === `GATE 1/${n}` && rowsHave(o, o.values.gate) && rowsHave(o, 'LAP'),
      `the race: "${o.values.clock}", "${o.values.gate}"${o.values.cue ? `, cue "${o.values.cue}"` : ''}`);
    /* The ring's start gate hangs in the air, so the run starts with the
     * countdown: the one banner the OSD draws two rows tall. */
    const count = await banner(page);
    const big = count.box && near(count.box.h, 2 * count.cell.ch, 0.5) && near(count.box.w, 2 * count.cell.cw, 0.5);
    say(osdCarries(count) && /^[123]$/.test(count.html) && big,
      `the air start's countdown is the OSD's, two rows tall: "${count.html}"${count.box ? `, ${f1(count.box.w)}x${f1(count.box.h)} px on ${f1(count.cell.cw)}x${f1(count.cell.ch)} cells` : ''}, the element ${count.display}`);
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
    await glow();
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
