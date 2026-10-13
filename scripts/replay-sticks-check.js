/*
 * replay-sticks-check.js: the pilot's sticks in a replay, on the real page.
 *
 *     node scripts/replay-sticks-check.js [OUT_DIR]     (npm run replay:sticks)
 *
 * In headless Chromium, on the Swiss valley, a Timber (flaps, so the flap
 * switch is in the clip too):
 *
 *  1. Thrown at 80 m and flown through four stick settings, the flaps
 *     taken down a notch on the way. V opens the replay: the clip carries
 *     its sticks (src/replay/sticks.js), each setting found in its rows
 *     exactly as quantised, the flaps' notch with them.
 *  2. Scrubbed into each setting, the replay's two gimbals (the flight
 *     overlay's, src/ui/widgets.js) put their nubs where that setting
 *     puts them in the viewer's stick mode, and the line under them names
 *     the mode and the flaps. A picture of each.
 *  3. The Sticks CSV button, pressed with a pointer, hands over a control
 *     recording (src/share/controlrec.js) of the range, one row a clip
 *     row, every setting in it.
 *  4. Saved to My clips and played from there: version 17, sticks and all,
 *     with what flies it again (src/replay/refly.js). The saved file is
 *     left in OUT_DIR and flown again in Node by npm run replay:refly,
 *     which must give every row back bit for bit: a flight recorded in
 *     Chromium, re-flown in Node. Then with --transplant: set up from the
 *     clip's setup log twice on the same build, placed in its state, the
 *     two flights must be the same.
 *  5. An old clip, the same flight written without its sticks (what a
 *     build before this one wrote, byte for byte; npm run
 *     crashcam:selftest holds that), imported and played: it plays, its
 *     gimbals are gone, the note says why, and the Sticks CSV button is
 *     off. A picture of it.
 *  6. The export opened in the hover viewer (/dev/hover.html): its stick
 *     numbers read, its timing rows dashes (a clip has no frame clock).
 *     A picture of it.
 *  7. No page errors.
 *
 * Pictures and the CSV go to OUT_DIR (default: a folder in the system's
 * temp directory).
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

import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { stickChannels } from '../src/input/stickmode.js';
import { COLUMN as C, parseCsv } from '../src/share/controlrec.js';
import { STICK_SCALE } from '../src/replay/sticks.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = resolve(process.argv[2] || join(tmpdir(), 'fdfpv-replay-sticks'));
mkdirSync(outDir, { recursive: true });

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) {
    failed += 1;
  }
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const AIRFRAME = 'timber1500';
function seed() {
  const settings = {
    ...seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, AIRFRAME),
    airframeAsked: true,
    map: 'swiss2',
    graphics: 'low',
    graphicsAuto: false,
    crashDamage: true,
  };
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(settings)});
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.airhint.v2', '1');
  } catch (e) { /* Storage refused; the run boots on its defaults. */ }`];
}

/* Roll, pitch, yaw, throttle: four settings far apart on every channel. */
const PROGRAM = [
  [-0.6, 0.2, 0.3, 0.8],
  [0.5, -0.4, -0.5, 0.5],
  [0.1, 0.6, 0.8, 0.3],
  [0.9, -0.1, -0.9, 0.9],
];
const q = (v) => Math.round(v * STICK_SCALE);

/* Every wait here is a count of drawn frames, so its budget is the count
 * times what a frame can cost, not a wall time picked by eye. The page
 * draws in software GL (SIM_GPU=0, the CI runner's way) and a frame carries
 * at most 100 ms of sim time however long it took (crashSummary in
 * src/main.js), so seven frames are the least that make 0.7 s of flight.
 * Measured 2026-10-12 on taskset -c 0-3, SIM_GPU=0, 1280 by 720: 4 to
 * 6.3 s a frame at load average 55 to 67; with four or five runs at once on
 * those cores, over 13 s (a 90 s wait for 7 frames timed out in 3 runs of
 * 4) and, in the worst run, over 20 s (2 frames in 40 s). The budget is
 * 1.5 times the worst. */
const FRAME_MS = 30000;
const SIM_STEP_MAX_MS = 100;
/* A boot: 45 s locally, 194 s on the GitHub runner, 67 s here at load 55
 * (the same budget as scripts/daytime-room-check.js's BOOT_MS). */
const BOOT_MS = 600000;
const H = 'window.__crashCam.h()';
const simT = (page) => page.evaluate('window.__crash().simT');
async function afterSteps(page, ms) {
  const t0 = await simT(page);
  await page.until(`window.__crash().simT >= ${t0 + ms / 1000}`, Math.ceil(ms / SIM_STEP_MAX_MS) * FRAME_MS);
}
async function frames(page, n) {
  const f0 = await page.evaluate('window.__boot().frames');
  await page.until(`window.__boot().frames >= ${f0 + n}`, n * FRAME_MS);
}
/* Software GL's frame cost follows the pixels: at load average 20 a frame
 * took 2 to 4 s at 1280 by 720 and about 1 s at 480 by 270 (2026-10-12, 40 s
 * of frames each, taskset -c 0-3, SIM_GPU=0). The flight is flown small and
 * the replay, which the pictures show, is looked at full size. */
const FLIGHT_VIEW = [480, 270];
const SHOT_VIEW = [1280, 720];
async function viewport(page, [w, h]) {
  await page.cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }, page.sessionId);
  await page.evaluate("window.dispatchEvent(new Event('resize')); true");
  await frames(page, 3);
}
async function shot(page, name) {
  const r = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  const file = join(outDir, `${name}.png`);
  writeFileSync(file, Buffer.from(r.data, 'base64'));
  console.log(`  shot ${file}`);
}

/* Where each gimbal's nub stands, as fractions of its plate (-1..1, up
 * positive), read off the replay's DOM. */
const nubs = (page) => page.evaluate(`(() => {
  const n = [...document.querySelectorAll('.cc-sticks .osd-nub')];
  const at = (e) => [(parseFloat(e.style.left) - 50) / 50, (50 - parseFloat(e.style.top)) / 50];
  return n.length === 2 ? [at(n[0]), at(n[1])] : null;
})()`);

/* Where a setting puts the two nubs in stick mode `mode`, as placeSticks does. */
function want(set, mode) {
  const ch = {
    roll: set[0], pitch: set[1], yaw: set[2], throttle: set[3],
  };
  const layout = stickChannels(mode);
  return ['left', 'right'].map((side) => {
    const axes = layout[side];
    return [ch[axes.horiz], axes.vert === 'throttle' ? 2 * ch.throttle - 1 : -ch.pitch];
  });
}

/* The viewer's seconds span the rows it judges, one at least every
 * JUDGE_MS (20 ms, thumbStats in src/share/controlrec.js). The clip's last
 * row is the V press, a part of a frame after the one before it, and when
 * that is under JUDGE_MS (2.766 s after 2.75 s, a run on 2026-10-12) the
 * viewer leaves it out; so the span is the clip's end, or up to JUDGE_MS
 * short of it, never past it; both from the clip's first row, as the
 * export is. */
const JUDGE_S = 0.02;
const lastRowSpan = (seconds, end) => seconds <= end + 1e-3 && seconds > end - JUDGE_S - 1e-3;

async function main() {
  console.log('the pilot\'s sticks in a replay, on the real page');
  const page = await openPage({ root, width: 1280, height: 720, url: '/index.html?map=swiss2', seed: seed() });
  try {
    await page.until('window.__shellReady && window.__map && window.__map().ready && window.__crashCam && window.__boot', BOOT_MS);
    await viewport(page, FLIGHT_VIEW);
    await page.tap('ShiftLeft');

    console.log('1. flown through four settings, the flaps down a notch');
    const pad = await page.evaluate('(() => { const s = window.__craftState(); return { x: s.worldX, z: s.worldZ, g: s.worldY - s.groundClearance }; })()');
    await page.evaluate(`window.__stick(${PROGRAM[0].join(', ')})`);
    const thrown = await page.evaluate(`window.__crashThrow({ fresh: true, x: ${pad.x}, y: ${pad.g + 80}, z: ${pad.z}, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: -16, showCraft: false }).ok`);
    check('thrown at 80 m', thrown);
    for (let i = 0; i < PROGRAM.length; i += 1) {
      await page.evaluate(`window.__stick(${PROGRAM[i].join(', ')})`);
      if (i === 2) {
        await page.tap('KeyF');
      }
      await afterSteps(page, 700);
    }
    await page.tap('KeyV');
    await page.until('window.__crashCam.live()', 2 * FRAME_MS);
    await frames(page, 3);
    const clip = await page.evaluate(`(() => {
      const c = ${H}.clip();
      return c.sticks ? { n: c.n, ch: Array.from(c.sticks.ch), time: Array.from(c.time) } : { n: c.n, ch: null };
    })()`);
    check('the clip carries its sticks', Boolean(clip.ch) && clip.ch.length === clip.n * 6, `${clip.n} rows`);
    if (!clip.ch) {
      throw new Error('no sticks in the clip; nothing further can be checked');
    }
    /* Each setting's rows: where all four channels are that setting's. */
    const rowsOf = (set) => {
      const out = [];
      for (let k = 0; k < clip.n; k += 1) {
        if ([0, 1, 2, 3].every((i) => clip.ch[k * 6 + i] === q(set[i]))) {
          out.push(k);
        }
      }
      return out;
    };
    const found = PROGRAM.map(rowsOf);
    check('every setting is in the rows exactly as quantised', found.every((r) => r.length >= 5), found.map((r) => r.length).join(', '));
    const notch = (k) => clip.ch[k * 6 + 5];
    const before = found[1].length ? notch(found[1][found[1].length - 1]) : NaN;
    const after = found[3].length ? notch(found[3][0]) : NaN;
    check('the flap switch is kept with them, up before F and a notch down after', before === 0 && after === 1, `${before} then ${after}`);
    const modes = new Set(found.flat().map((k) => clip.ch[k * 6 + 4]));
    check('the flight mode is kept, one all through', modes.size === 1, [...modes].join(','));

    await viewport(page, SHOT_VIEW);
    console.log('2. the replay\'s gimbals');
    const v0 = await page.evaluate(`JSON.stringify(${H}.view())`).then(JSON.parse);
    for (let i = 0; i < PROGRAM.length; i += 1) {
      const r = found[i];
      const k = r[Math.floor(r.length / 2)];
      const t = (clip.time[k] + clip.time[k + 1]) / 2;
      await page.evaluate(`${H}.api.jumpTo(${t})`);
      await page.until(`${H}.view().drawn === ${t}`, 3 * FRAME_MS);
      await frames(page, 2);
      const got = await nubs(page);
      const exp = want(PROGRAM[i], v0.stickMode);
      const err = got ? Math.max(...got.flat().map((x, j) => Math.abs(x - exp.flat()[j]))) : Infinity;
      const line = await page.evaluate("document.querySelector('.cc-stick-mode').textContent");
      check(`setting ${i + 1}: the nubs stand where the sticks were`, err < 1e-3,
        `${got ? got.map((p) => p.map((x) => x.toFixed(3)).join(' ')).join(' | ') : 'no gimbals'}, ${line}`);
      if (i === 3) {
        check('the line under them names the mode and the flaps', /flaps half/i.test(line), line);
      }
      await shot(page, `replay-sticks-${i + 1}`);
    }
    /* A small window: the dock wraps taller and the head comes close
     * (style.js); the gimbals and the readout must overlap nothing else on
     * screen (editor.js placeOsd). */
    const overlaps = () => page.evaluate(`(() => {
      const s = document.querySelector('.cc-sticks').getBoundingClientRect();
      const hit = (q) => [...document.querySelectorAll(q)].some((e) => {
        const b = e.getBoundingClientRect();
        return b.width > 0 && s.left < b.right && b.left < s.right && s.top < b.bottom && b.top < s.bottom;
      });
      const o = document.querySelector('.cc-osd').getBoundingClientRect();
      const osdHit = (q) => [...document.querySelectorAll(q)].some((e) => {
        const b = e.getBoundingClientRect();
        return b.width > 0 && o.left < b.right && b.left < o.right && o.top < b.bottom && b.top < o.bottom;
      });
      return {
        box: [s.left, s.top, s.right, s.bottom].map(Math.round),
        hits: ['.cc-head-actions', '.cc-name', '.cc-sub', '.cc-title', '.cc-osd', '.cc-dock'].filter(hit),
        osd: [o.left, o.top, o.right, o.bottom].map(Math.round),
        osdHits: ['.cc-head-actions', '.cc-name', '.cc-sub', '.cc-title', '.cc-dock'].filter(osdHit),
      };
    })()`);
    for (const [w, h] of [[1280, 720], [800, 600]]) {
      await viewport(page, [w, h]);
      const o = await overlaps();
      check(`at ${w} by ${h} the gimbals are on screen and overlap nothing`, o.hits.length === 0 && o.box[1] >= 0 && o.box[2] <= w, `box ${o.box.join(',')}${o.hits.length ? `, over ${o.hits.join(' ')}` : ''}`);
      check(`at ${w} by ${h} the readout is between the head and the dock`, o.osdHits.length === 0 && o.osd[3] > o.osd[1], `box ${o.osd.join(',')}${o.osdHits.length ? `, over ${o.osdHits.join(' ')}` : ''}`);
      await shot(page, `replay-sticks-${w}`);
    }
    await page.cdp.send('Emulation.clearDeviceMetricsOverride', {}, page.sessionId);

    console.log('3. the Sticks CSV button');
    const clicked = await page.click('.cc-btn:not([disabled])[title*="control recording"]');
    check('pressed with a pointer', clicked);
    await page.until('window.__crashCamLast && window.__crashCamLast.sticks', 2 * FRAME_MS);
    const exp = await page.evaluate('window.__crashCamLast.sticks');
    writeFileSync(join(outDir, exp.name), exp.csv);
    const rows = parseCsv(exp.csv);
    const inCsv = PROGRAM.map((set) => rows.filter((r) => [C.roll, C.pitch, C.yaw, C.throttle].every((c, i) => Math.abs(r[c] - q(set[i]) / STICK_SCALE) < 1e-6)).length);
    const forward = rows.every((r, i) => i === 0 || r[C.t_s] > rows[i - 1][C.t_s]);
    check('a control recording of the clip, one row a frame, every setting in it, its clock forward',
      rows.length === exp.rows && rows.length === clip.n && inCsv.every((x) => x >= 5) && forward
      && rows.every((r) => Number.isFinite(r[C.vx]) && Number.isFinite(r[C.p]) && Number.isFinite(r[C.qw])),
    `${exp.name}, ${rows.length} rows, settings ${inCsv.join(', ')}`);

    console.log('4. saved and played from My clips');
    await page.evaluate(`${H}.api.saveReplay('sticks')`);
    const id = await page.evaluate(`${H}.api.listClips().then((l) => l.find((r) => r.name === 'sticks').id)`);
    const bytes = await page.evaluate(`(async () => {
      const f = await import('/src/replay/store.js');
      const row = await f.getClip(${JSON.stringify(id)});
      const u8 = new Uint8Array(row.bytes);
      let bin = '';
      for (let i = 0; i < u8.length; i += 0x8000) {
        bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      }
      return { size: row.bytes.byteLength, version: new DataView(row.bytes).getUint32(4, true), b64: btoa(bin) };
    })()`);
    const saved = join(outDir, 'sticks.fdfreplay');
    writeFileSync(saved, Buffer.from(bytes.b64, 'base64'));
    await page.evaluate(`${H}.api.playSaved(${JSON.stringify(id)})`);
    await page.until(`window.__crashCam.live() && ${H}.view() && !${H}.view().live`, 3 * FRAME_MS);
    const vs = await page.evaluate(`JSON.stringify(${H}.view())`).then(JSON.parse);
    check('saved as version 17 and played back with its sticks', bytes.version === 17 && Boolean(vs.sticks), `${bytes.size} bytes, version ${bytes.version}`);
    const re = spawnSync(process.execPath, [join(root, 'scripts', 'replay-refly.js'), saved], { encoding: 'utf8' });
    writeFileSync(join(outDir, 'sticks-refly.txt'), `${re.stdout}${re.stderr}`);
    const tally = /bit for bit: (\d+)\/(\d+)/.exec(re.stdout);
    check('flown again in Node, every row bit for bit (npm run replay:refly)',
      re.status === 0 && Boolean(tally) && tally[1] === tally[2] && Number(tally[2]) > 0,
      tally ? `${tally[1]}/${tally[2]} rows, exit ${re.status}` : `exit ${re.status}: ${(re.stderr || re.stdout).trim().split('\n').pop()}`);
    /* Transplanted (set up from the clip's setup log, placed in its state)
     * twice onto the same build, the two flights must be the same: the
     * setup log a real page wrote is whole enough to set a module up. */
    const tp = spawnSync(process.execPath, [join(root, 'scripts', 'replay-refly.js'), saved, '--transplant'], { encoding: 'utf8' });
    writeFileSync(join(outDir, 'sticks-transplant.txt'), `${tp.stdout}${tp.stderr}`);
    const setupLine = /setup log (\d+) calls, (\d+) B, sim_init text (\d+) B/.exec(tp.stdout);
    check('set up from its setup log on the same build twice, the two flights are the same',
      tp.status === 0 && /SAME: the new build flies this clip exactly/.test(tp.stdout) && Boolean(setupLine),
      setupLine ? `setup log ${setupLine[1]} calls, ${setupLine[2]} B; ${(/jolt[^\n]*\n[^\n]*worst: [^\n]*/.exec(tp.stdout) || [''])[0].replace(/\s+/g, ' ')}`
        : `exit ${tp.status}: ${(tp.stderr || tp.stdout).trim().split('\n').pop()}`);

    console.log('5. an old clip, without sticks');
    const old = await page.evaluate(`(async () => {
      const f = await import('/src/replay/file.js');
      const c = { ...${H}.clip(), meta: { ...${H}.clip().meta, name: 'old' } };
      delete c.sticks;
      delete c.refly;
      const buf = f.encodeReplay(c);
      await ${H}.api.importFile(new File([buf], 'old.fdfreplay'));
      return { version: new DataView(buf).getUint32(4, true), size: buf.byteLength };
    })()`);
    const oldId = await page.evaluate(`${H}.api.listClips().then((l) => l.find((r) => r.name === 'old').id)`);
    await page.evaluate(`${H}.api.playSaved(${JSON.stringify(oldId)})`);
    await page.until(`window.__crashCam.live() && ${H}.view() && ${H}.view().name === 'old'`, 3 * FRAME_MS);
    await page.evaluate(`${H}.api.jumpTo(0)`);
    await page.tap('Space');
    await page.until(`${H}.view().t > 0.05`, 3 * FRAME_MS);
    await frames(page, 2);
    const dom = await page.evaluate(`(() => {
      const v = ${H}.view();
      const none = document.querySelector('.cc-stick-none');
      const gim = document.querySelector('.cc-gimbals');
      const btn = document.querySelector('.cc-btn[title*="control recording"]');
      return { sticks: v.sticks, playing: v.playing, t: v.t, note: none && !none.hidden ? none.textContent : '', gimbals: Boolean(gim && !gim.hidden && gim.offsetWidth), off: Boolean(btn && btn.disabled) };
    })()`);
    check('an old clip plays, without gimbals, with the note, the Sticks CSV button off',
      old.version < 16 && dom.sticks === null && dom.t > 0 && !dom.gimbals && /before replays kept the sticks/.test(dom.note) && dom.off,
      `version ${old.version}, "${dom.note}"`);
    await shot(page, 'replay-old-clip');
    await page.tap('Escape');

    console.log('6. the export in the hover viewer');
    await page.evaluate(`location.href = ${JSON.stringify(`${page.origin}/dev/hover.html`)}; true`);
    await page.until('typeof window.__hoverShow === \'function\'', BOOT_MS);
    await page.evaluate(`window.__hoverShow(${JSON.stringify(exp.csv)}); true`);
    const hs = await page.evaluate(`(() => {
      const s = window.__hoverStats;
      const timing = [...document.querySelectorAll('#timing td')].map((td) => td.textContent);
      return { seconds: s.seconds, roll: s.sticks.roll.peak, yaw: s.sticks.yaw.peak, timing };
    })()`);
    check('the hover viewer reads it: its seconds, the roll and yaw peaks, dashes for the frame timing',
      lastRowSpan(hs.seconds, clip.time[clip.n - 1] - clip.time[0]) && Math.abs(hs.roll - 0.9) < 1e-4 && Math.abs(hs.yaw - 0.9) < 1e-4
      && hs.timing.filter((x) => x === '-').length === 8,
    `${hs.seconds.toFixed(2)} s, roll peak ${hs.roll.toFixed(4)}, yaw peak ${hs.yaw.toFixed(4)}, timing ${hs.timing.join(' ')}`);
    await shot(page, 'hover-viewer');

    console.log('7. errors');
    const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e));
    check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } finally {
    await page.close();
  }
  if (failed) {
    console.log(`replay:sticks FAILED (${failed})`);
    process.exit(1);
  }
  console.log('replay:sticks ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
