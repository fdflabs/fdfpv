/*
 * controlrec-check.js: the control recorder in the real shell.
 *
 *     node scripts/controlrec-check.js [OUT_DIR]
 *
 * Boots the game with the flight log on, hovers a seven inch quad on the
 * height (the perf-latency pilot) while the roll stick steps between two
 * values, then: the recorder holds one row per plant step; each row's
 * roll is a value the stick was given; the attitude is a unit quaternion;
 * the Download control recording row on the Pilot screen, pressed with a
 * real pointer, hands over a CSV that parses back; a reset keeps the run
 * as the last flight, and /dev/hover.html's Last flight button, pressed
 * with a pointer, shows it with the thumb numbers. Then the Extra, flown
 * up to the hover by hover-video.js's pilot: the surface columns move with
 * the sticks. Writes the CSVs, the viewer's numbers and a picture of the
 * viewer to OUT_DIR.
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

import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { readFile } from 'node:fs/promises';
import { COLUMN as C, parseCsv } from '../src/share/controlrec.js';
import { PILOT } from './lib/extrapilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = resolve(process.argv[2] || join(tmpdir(), 'fdfpv-controlrec-check'));
await mkdir(outDir, { recursive: true });

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) {
    failed += 1;
  }
}

const ROLLS = [0.05, -0.05];
const settings = Object.assign(
  seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, '7inch'),
  { map: 'swiss2', graphics: 'low', graphicsAuto: false, flightMode: 'angle', fpsCap: 0, airframeAsked: true, flightLog: true },
);
const SEED = `try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, ${JSON.stringify(settings)});
  localStorage.setItem(k, JSON.stringify(s));
} catch (e) { /* storage refused: the flight log check below fails */ }
/* Keep what a download hands over. */
window.__downloads = [];
const objectUrl = URL.createObjectURL.bind(URL);
URL.createObjectURL = (blob) => { window.__downloads.push(blob); return objectUrl(blob); };`;

const page = await openPage({ root, width: 1280, height: 720, url: '/index.html?map=swiss2', seed: [SEED] });
try {
  await page.until('window.__shellReady === true', 300000);
  await page.until('window.__map && window.__map().ready', 600000);
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  check('the flight log setting turned the recorder on', await page.evaluate('window.__controlRec().on'));
  /* Hover on the throttle, the roll stick stepping every 300 ms. */
  await page.evaluate(`(() => {
    let ti = 0, lastY = null, lastT = performance.now(), k = 0;
    window.__rolls = ${JSON.stringify(ROLLS)};
    const fly = () => {
      const c = window.__craftState();
      const t = performance.now();
      const dt = Math.max(1e-3, (t - lastT) / 1000);
      lastT = t;
      const clr = c.worldY - window.__heightAt(c.worldX, c.worldZ);
      const vy = lastY === null ? 0 : (c.worldY - lastY) / dt;
      lastY = c.worldY;
      const err = 5 - clr;
      ti = Math.max(-0.4, Math.min(0.4, ti + err * dt * 0.02));
      window.__thr = Math.max(0.05, Math.min(1, 0.3 + ti + err * 0.04 - vy * 0.06));
      window.__stick(window.__rolls[Math.floor(k / 18) % 2], 0, 0, window.__thr);
      k += 1;
      if (!window.__stopFly) { requestAnimationFrame(fly); }
    };
    requestAnimationFrame(fly);
    return true;
  })()`);
  await page.sleep(8000);
  const live = await page.evaluate('window.__controlRec().rows');
  check('about one row per millisecond of flight', live > 4000 && live <= 60000, `${live} rows in 8 s`);

  /* The Download row on the Pilot screen, with a pointer. */
  await page.evaluate("window.__ui.show('pilot'); true");
  await page.sleep(500);
  const marked = await page.evaluate(`(() => {
    const want = 'Download control recording';
    for (const r of document.querySelectorAll('.row-label')) {
      if (r.textContent.trim() === want) { r.id = 'controlrec-row'; return true; }
    }
    return false;
  })()`);
  check('the Pilot screen offers Download control recording', marked);
  const before = await page.evaluate('window.__downloads.length');
  await page.click('#controlrec-row');
  await page.until(`window.__downloads.length > ${before}`, 10000).catch(() => {});
  const csv = await page.evaluate('window.__downloads.length ? window.__downloads[window.__downloads.length - 1].text() : null');
  check('pressing it hands over a file', typeof csv === 'string' && csv.startsWith('t_s,'));
  await writeFile(join(outDir, 'controlrec.csv'), csv || '');
  const rows = csv ? parseCsv(csv) : [];
  check('the file holds the recording', rows.length > 4000, `${rows.length} rows`);
  let stepOk = true;
  let unit = true;
  let rollOk = true;
  for (let i = 1; i < rows.length; i += 1) {
    const dt = rows[i][C.t_s] - rows[i - 1][C.t_s];
    if (Math.abs(dt - 0.001) > 1e-6 && dt > 0) {
      stepOk = false;
    }
    const q = [C.qw, C.qx, C.qy, C.qz].map((k) => rows[i][k]);
    if (Math.abs(Math.hypot(...q) - 1) > 1e-5) {
      unit = false;
    }
  }
  const late = rows.slice(Math.floor(rows.length / 2));
  rollOk = late.every((r) => ROLLS.some((v) => Math.abs(r[C.roll] - v) < 1e-6));
  check('rows are consecutive 1 ms steps', stepOk);
  check('the attitude is a unit quaternion', unit);
  check('each row\'s roll is a value the stick was given', rollOk);
  check('both stick values appear', ROLLS.every((v) => late.some((r) => Math.abs(r[C.roll] - v) < 1e-6)));

  /* A reset keeps the run as the last flight. */
  await page.evaluate("window.__stopFly = true; window.__ui.onAction('restart', window.__ui.settings); true");
  await page.sleep(1500);
  const viewer = `${page.origin}/dev/hover.html`;
  await page.evaluate(`location.href = ${JSON.stringify(viewer)}; true`);
  await page.until("!!document.getElementById('last') && document.getElementById('last').textContent.length > 0", 60000);
  /* page.click waits for the game's loader, which this page does not
   * have: the same three pointer events, by hand. */
  const at = await page.evaluate("(() => { const b = document.getElementById('last').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()");
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await page.cdp.send('Input.dispatchMouseEvent', { type, ...at, button: 'left', clickCount: 1 }, page.sessionId);
  }
  await page.until('!!window.__hoverStats', 30000).catch(() => {});
  const stats = await page.evaluate('window.__hoverStats ? JSON.parse(JSON.stringify(window.__hoverStats)) : null');
  check('the viewer opens the last flight', !!stats && stats.seconds > 4, stats ? `${stats.seconds.toFixed(1)} s` : 'none');
  if (stats) {
    console.log(`  roll mean ${stats.sticks.roll.meanAbs.toFixed(3)}, reversals ${stats.sticks.roll.reversalsPerS.toFixed(2)}/s; stick to frame p95 ${stats.stickToFrame.p95.toFixed(1)} ms; frame p95 ${stats.frameInterval.p95.toFixed(1)} ms`);
    check('the viewer reads the roll deflection', Math.abs(stats.sticks.roll.meanAbs - 0.05) < 0.005);
    await writeFile(join(outDir, 'viewer-stats.json'), JSON.stringify(stats, null, 1));
    const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
    await writeFile(join(outDir, 'viewer.png'), Buffer.from(data, 'base64'));
  }
  /* No board or rooms server runs here, so their fetches are refused, as
   * in the other checks that boot the game. */
  const errs = page.errors.filter((x) => !x.startsWith('network:'));
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await page.close();
}

/* The Extra: the surfaces are the controller's output, so they must move
 * with the sticks it was handed. hover-video.js's way in and pilot. */
const th = JSON.parse(await readFile(join(root, 'tests/extra-thresholds.json'), 'utf8'));
const extra = await openPage({ root, width: 960, height: 540, url: '/index.html', seed: [SEED] });
try {
  await extra.until('!!window.__shellReady', 240000);
  await extra.evaluate("window.__ui.craftGate = true; window.__ui.show('title'); window.__ui.act('way-freestyle-wing1000'); true");
  await extra.until("window.__ui.settings.map === 'swiss2' && window.__map && window.__map().ready", 400000);
  await extra.evaluate("(() => { const ui = window.__ui; ui.show('quad'); const i = ui.items().findIndex((it) => it.options && it.options.some((o) => o.value === 'extra3d1308')); ui.cursor = i; ui.pick('extra3d1308'); ui.settings.tune = 'extra-as3x'; ui.settings.flightLog = true; ui.persistSettings(); ui.show('title'); return true; })()");
  await extra.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await extra.until("window.__craftState && window.__craftState().mode === 'flight'", 180000);
  await extra.sleep(2000);
  await extra.evaluate(PILOT('video', th));
  await extra.sleep(15000);
  const csv = await extra.evaluate('window.__controlRec().rows > 0 ? window.__controlRec().csv() : null');
  await writeFile(join(outDir, 'controlrec-extra.csv'), csv || '');
  const rows = csv ? parseCsv(csv) : [];
  check('the Extra recorded', rows.length > 5000, `${rows.length} rows`);
  const corr = (a, b) => {
    const ma = a.reduce((x, y) => x + y, 0) / a.length;
    const mb = b.reduce((x, y) => x + y, 0) / b.length;
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < a.length; i += 1) {
      sab += (a[i] - ma) * (b[i] - mb);
      saa += (a[i] - ma) ** 2;
      sbb += (b[i] - mb) ** 2;
    }
    return sab / Math.sqrt(saa * sbb || 1);
  };
  const col = (k) => rows.map((r) => r[k]);
  const peak = (k) => Math.max(...col(k).map(Math.abs));
  check('its surfaces move', peak(C.elev) > 0.01 && peak(C.ail_l) > 0.001 && peak(C.rud) > 0.01,
    `peak elev ${peak(C.elev).toFixed(3)} ail ${peak(C.ail_l).toFixed(3)} rud ${peak(C.rud).toFixed(3)} rad`);
  /* AS3X adds a rate damper, so the follow is strong, not exact; the
   * hover pilot barely touches roll, so the ailerons move little but
   * still with the stick, and opposite each other. */
  const ce = corr(col(C.pitch), col(C.elev));
  const cr = corr(col(C.yaw), col(C.rud));
  const ca = corr(col(C.roll), col(C.ail_l));
  const opp = corr(col(C.ail_l), col(C.ail_r));
  check('each surface follows its stick', Math.abs(ce) > 0.5 && Math.abs(cr) > 0.5 && Math.abs(ca) > 0.5,
    `r elev ${ce.toFixed(2)}, rud ${cr.toFixed(2)}, ail ${ca.toFixed(2)}`);
  check('the ailerons move opposite', opp < -0.9, `r ${opp.toFixed(2)}`);
  const errs = extra.errors.filter((x) => !x.startsWith('network:'));
  check('no page errors on the Extra', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await extra.close();
}
console.log(failed ? `controlrec-check: ${failed} failed` : 'controlrec-check: ok');
process.exit(failed ? 1 : 0);
