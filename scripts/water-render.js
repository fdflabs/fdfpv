/*
 * water-render.js: the lake drawn from the plant's own waves, checked in
 * the real shell: the Timber on floats sitting and rocking, taxiing,
 * planing on the step, off, and back down, with the drawn surface under
 * its floats held against the plant's.
 *
 *     SIM_GPU=1 node scripts/water-render.js [alps|swiss2] [OUT_DIR] [--graphics=high]
 *
 * WHAT IT MEASURES. Every few frames while the pilot flies, at the craft's
 * CG and under the bow and the step of each float, the drawn water's
 * height (window.__water: the map's lake mesh rendered straight down
 * through a one texel float target with its own displacement, and read
 * back, so it is what the rasteriser drew between the displaced vertices)
 * against sim_water_sample's at the same point and the same sim clock.
 * The check is that they agree within a centimetre wherever the floats
 * are on the water: the waves the floats ride are the waves on screen.
 * The plant's chop on the lake is about 3 cm from crest to trough, so a
 * flat lake would miss by up to half that and more; the figure to read is
 * the worst difference against the plant's own range over the same
 * samples, both printed.
 *
 * It also counts the spray and the wake the map drew (src/render/spray.js)
 * in each phase, and with OUT_DIR writes a picture of each: sitting,
 * taxiing, planing on the step, lifting off, touching down, slowed. The pictures
 * are for looking at, not for the repository.
 *
 * The pilot is scripts/floats-shell.js's, in the chase view, with a taxi
 * added before the take off. The page's board client calls a local board;
 * run one or its console errors fail the run (see scripts/posters.js).
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

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const a = args.find((s) => s.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : dflt;
};
const positional = args.filter((s) => !s.startsWith('--'));
const map = positional[0] ?? 'alps';
const outDir = positional[1] ? resolve(positional[1]) : null;
const LAKE_Y = -1.5;
/* The band: the drawn surface within this of the plant's, metres. */
const MATCH = 0.01;

const seated = seatAirframe({ airframe: '5inch', rates: { type: 'ACTUAL' } }, 'timber1500f');
seated.map = map;
seated.graphics = flag('graphics', 'high');
seated.graphicsAuto = false;
seated.wingView = 'chase';

/* The drawn floats, TIMBER_FLOATS, out of timbercraft.js's source: it
 * imports three, which Node has not got. */
const craftSrc = await readFile(join(root, 'src/render/timbercraft.js'), 'utf8');
const floatsSrc = craftSrc.match(/export const TIMBER_FLOATS = (\{[\s\S]*?\n\});/);
if (!floatsSrc) {
  throw new Error('water-render: could not read TIMBER_FLOATS out of src/render/timbercraft.js');
}
/* eslint-disable-next-line no-new-func */
const F = new Function(`return ${floatsSrc[1]};`)();
/* Where the water is read: the CG, and each float's keel at its bow and
 * its step, body frame (x forward, y left, z up). */
const POINTS = [[0, 0, 0], [F.xBow, F.y, F.zKeel], [F.xStep, F.y, F.zKeel], [F.xBow, -F.y, F.zKeel], [F.xStep, -F.y, F.zKeel]];

const PILOT = `
window.__waterLog = { phase: 'wait', events: [], match: [], spray: {}, shots: [], done: false };
(() => {
  const L = window.__waterLog;
  const POINTS = ${JSON.stringify(POINTS)};
  let phase = 'sitting';
  const t0 = performance.now();
  let tPhase = t0;
  let lastT = t0;
  let dryMs = 0;
  let onStep = false;
  let frames = 0;
  let wasWet = true;
  const scene = window.__mapScene();
  const find = (name) => { let o = null; scene.traverse((c) => { if (!o && c.name === name && c.visible !== false) o = c; }); return o; };
  const shoot = (name, delayMs = 0) => L.shots.push({ name, at: performance.now() + delayMs });
  /* What each picture has in it, read as the picture is taken. */
  window.__waterShotInfo = () => {
    const c = window.__craftState();
    const drops = find('float-spray-drops');
    const wake = find('float-wake');
    return { speed: c.speed, height: c.worldY - ${LAKE_Y}, wet: c.floats ? c.floats.state[4] + c.floats.state[5] : 0,
      drops: drops ? drops.geometry.drawRange.count : 0, wake: wake ? wake.geometry.drawRange.count / 3 : 0 };
  };
  const mark = (what, c) => {
    L.events.push({ what, t: (performance.now() - t0) / 1000, speed: c.speed, y: c.worldY, pitch: Math.asin(c.fwd.y) * 180 / Math.PI, floats: c.floats && c.floats.state.slice() });
  };
  const next = (p, c) => { phase = p; tPhase = performance.now(); mark(p, c); };
  shoot('sitting', 7000);
  const tick = () => {
    const c = window.__craftState();
    const now = performance.now();
    const dt = now - lastT;
    lastT = now;
    if (!c || c.mode !== 'flight' || !c.fwd || !c.floats) {
      requestAnimationFrame(tick);
      return;
    }
    frames += 1;
    const pitch = Math.asin(Math.max(-1, Math.min(1, c.fwd.y)));
    const right = { x: c.fwd.y * c.up.z - c.fwd.z * c.up.y, y: c.fwd.z * c.up.x - c.fwd.x * c.up.z, z: c.fwd.x * c.up.y - c.fwd.y * c.up.x };
    const roll = Math.max(-1, Math.min(1, 3 * right.y - 0.15 * (c.rates ? c.rates.p : 0)));
    const hold = (deg) => Math.max(-1, Math.min(1, 3 * (deg * Math.PI / 180 - pitch) + 0.3 * (c.rates ? c.rates.q : 0)));
    const f = c.floats.state;
    const wet = f[4] + f[5] > 0;
    const height = c.worldY - ${LAKE_Y};
    const inPhase = (now - tPhase) / 1000;
    let sticks = [0, 0, 0, 0];
    if (phase === 'sitting') {
      if (inPhase > 8) { next('taxiing', c); shoot('taxiing', 3500); }
    } else if (phase === 'taxiing') {
      sticks = [roll, 1, 0, 0.22];
      if (inPhase > 6) next('takeoff', c);
    } else if (phase === 'takeoff') {
      if (!onStep && f[0] < 0.25 * 1.934 * 9.81 && inPhase > 0.3) {
        onStep = true;
        mark('onstep', c);
        next('planing', c);
        shoot('planing', 1500);
      }
      const rotate = c.speed > 7.5;
      sticks = [roll, !onStep || rotate ? 1 : hold(4), 0, 1];
      if (!wet) { dryMs += dt; } else { dryMs = 0; }
      if (!wet && wasWet && onStep && !L.shots.some((x) => x.name === 'liftoff')) shoot('liftoff', 60);
      if (dryMs > 300) next('climb', c);
      if (inPhase > 120) next('failed-takeoff', c);
    } else if (phase === 'planing') {
      /* On the step and held there on part throttle, a few seconds of
       * planing to see the spray and the wake, then on with the take off. */
      sticks = [roll, hold(3), 0, 0.45];
      if (!wet) { dryMs += dt; } else { dryMs = 0; }
      if (dryMs > 300) next('climb', c);
      if (inPhase > 3) { tPhase = now; phase = 'takeoff'; }
    } else if (phase === 'climb') {
      sticks = [roll, hold(8), 0, 0.8];
      if (height > 8) next('cruise', c);
    } else if (phase === 'cruise') {
      sticks = [roll, hold(1), 0, 0.6];
      if (inPhase > 4) next('descend', c);
    } else if (phase === 'descend') {
      sticks = [roll, hold(-5), 0, 0.15];
      if (height < 1.2) next('flare', c);
    } else if (phase === 'flare') {
      sticks = [roll, hold(7), 0, 0];
      if (wet) { next('touchdown', c); shoot('touchdown', 120); }
      if (inPhase > 120) next('failed-landing', c);
    } else if (phase === 'touchdown') {
      sticks = [roll, 1, 0, 0];
      if (c.speed < 1.0) { next('slowed', c); shoot('slowed', 1500); }
      if (inPhase > 180) next('failed-slowing', c);
    } else if (phase === 'slowed') {
      sticks = [0, 0.5, 0, 0];
      if (inPhase > 4) { next('done', c); L.done = true; }
    } else {
      L.done = true;
    }
    wasWet = wet;
    L.phase = phase;
    if (frames % 5 === 0) {
      const left = { x: c.up.y * c.fwd.z - c.up.z * c.fwd.y, y: c.up.z * c.fwd.x - c.up.x * c.fwd.z, z: c.up.x * c.fwd.y - c.up.y * c.fwd.x };
      for (const [bx, by, bz] of POINTS) {
        const x = c.worldX + c.fwd.x * bx + left.x * by + c.up.x * bz;
        const z = c.worldZ + c.fwd.z * bx + left.z * by + c.up.z * bz;
        const w = window.__water(x, z);
        if (w && w.plant !== null && w.drawn !== null) {
          L.match.push([phase, wet ? 1 : 0, w.patch ? 1 : 0, w.drawn - w.plant, w.plant - ${LAKE_Y}]);
        } else {
          L.match.push([phase, wet ? 1 : 0, 0, null, null]);
        }
      }
      const drops = find('float-spray-drops');
      const wake = find('float-wake');
      const s = L.spray[phase] || (L.spray[phase] = { drops: 0, wake: 0 });
      s.drops = Math.max(s.drops, drops ? drops.geometry.drawRange.count : 0);
      s.wake = Math.max(s.wake, wake ? wake.geometry.drawRange.count / 3 : 0);
    }
    if (!L.done) {
      window.__stick(sticks[0], sticks[1], sticks[2], sticks[3]);
      requestAnimationFrame(tick);
    } else {
      window.__stick(0, 0, 0, 0);
    }
  };
  requestAnimationFrame(tick);
})();
`;

const page = await openPage({
  root,
  width: 1280,
  height: 720,
  /* Named as well as seated: a page that names no world opens on the
   * Alps (src/boot.js), and this waits for its map on the title. */
  url: `/index.html?map=${map}`,
  seed: [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(seated)});
    s.airframeAsked = true;
    localStorage.setItem(k, JSON.stringify(s));
  } catch (e) { /* storage refused */ }`],
});
let failed = 0;
const say = (ok, what) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) failed += 1;
};
const shot = async (name) => {
  if (!outDir) return;
  /* Sitting, the shell's camera is still on its intro orbit: this one is
   * taken from where the chase view sits, behind and over the tail. */
  if (name === 'sitting') {
    await page.evaluate(`(() => { const c = window.__craftState();
      window.__setCam(c.worldX - c.fwd.x * 3.2, c.worldY + 1.0, c.worldZ - c.fwd.z * 3.2, c.worldX, c.worldY, c.worldZ, 70); })()`);
    await page.sleep(300);
  }
  const r = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  if (name === 'sitting') {
    await page.evaluate('window.__setCam(null)');
  }
  const i = await page.evaluate('window.__waterShotInfo()');
  await writeFile(join(outDir, `${map}-${name}.png`), Buffer.from(r.data, 'base64'));
  console.log(`  shot ${map}-${name}.png: ${i.speed.toFixed(2)} m/s, CG ${i.height.toFixed(3)} m over the still water, wetted ${i.wet.toFixed(2)} m, ${i.drops} droplets, ${i.wake} wake triangles`);
};
try {
  if (outDir) await mkdir(outDir, { recursive: true });
  await page.until('!!window.__shellReady', 240000);
  await page.until(`window.__map && window.__map().id === ${JSON.stringify(map)} && window.__map().ready`, 240000);
  await page.evaluate('(document.getElementById("ui").style.display = "none", "")');
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight'", 120000);
  await page.sleep(500);
  const first = await page.evaluate('window.__craftState()');
  say(first.floats && first.floats.onWater, `the Timber on floats starts afloat on the ${map} lake`);
  await page.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', key: 'f' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF', key: 'f' })); true");
  await page.evaluate(PILOT);
  const t0 = Date.now();
  let last = '';
  let taken = 0;
  while (Date.now() - t0 < 900000) {
    const st = await page.evaluate('({ phase: window.__waterLog.phase, done: window.__waterLog.done, shots: window.__waterLog.shots, now: performance.now() })');
    if (st.phase !== last) {
      console.log(`  phase ${st.phase} after ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      last = st.phase;
    }
    while (taken < st.shots.length && st.shots[taken].at <= st.now) {
      await shot(st.shots[taken].name);
      taken += 1;
    }
    if (st.done && taken >= st.shots.length) break;
    await page.sleep(taken < st.shots.length ? 10 : 40);
  }
  const log = await page.evaluate('window.__waterLog');
  for (const e of log.events) {
    console.log(`  ${e.what.padEnd(14)} t ${e.t.toFixed(1)} s, speed ${e.speed.toFixed(2)} m/s, CG ${(e.y - LAKE_Y).toFixed(3)} m over the still water, pitch ${e.pitch.toFixed(1)} deg`);
  }

  /* The surface match, wherever the floats are on the water. */
  const byPhase = new Map();
  for (const [phase, wet, patch, d, h] of log.match) {
    const s = byPhase.get(phase) || { n: 0, missing: 0, worst: 0, sum: 0, patch: 0, lo: Infinity, hi: -Infinity, wet: 0 };
    byPhase.set(phase, s);
    s.n += 1;
    s.wet += wet;
    if (d === null) {
      s.missing += 1;
      continue;
    }
    s.worst = Math.max(s.worst, Math.abs(d));
    s.sum += Math.abs(d);
    s.patch += patch;
    s.lo = Math.min(s.lo, h);
    s.hi = Math.max(s.hi, h);
  }
  console.log('\n  the drawn water against sim_water_sample, per phase (mm):');
  let worstWet = 0;
  let wetN = 0;
  let wetMissing = 0;
  for (const [phase, s] of byPhase) {
    const got = s.n - s.missing;
    console.log(`    ${phase.padEnd(12)} ${String(s.n).padStart(4)} samples (${s.wet} with the floats wet, ${s.patch} on the near patch, ${s.missing} unread): worst ${(s.worst * 1000).toFixed(2)}, mean ${got ? (s.sum / got * 1000).toFixed(2) : '-'}; the plant's surface ${Number.isFinite(s.lo) ? `${(s.lo * 1000).toFixed(1)} to ${(s.hi * 1000).toFixed(1)}` : '-'} about the still water`);
  }
  for (const [phase, wet, , d] of log.match) {
    if (!wet || ['climb', 'cruise', 'descend', 'flare'].includes(phase)) continue;
    wetN += 1;
    if (d === null) {
      wetMissing += 1;
    } else {
      worstWet = Math.max(worstWet, Math.abs(d));
    }
  }
  say(wetN > 50 && wetMissing === 0 && worstWet <= MATCH, `the drawn surface under the floats is the plant's within ${MATCH * 100} cm: worst ${(worstWet * 1000).toFixed(2)} mm over ${wetN} samples with the floats wet (${wetMissing} unread)`);

  console.log('\n  spray and wake, the most drawn in each phase:');
  for (const [phase, s] of Object.entries(log.spray)) {
    console.log(`    ${phase.padEnd(12)} droplets ${String(s.drops).padStart(5)}, wake triangles ${s.wake}`);
  }
  const sp = log.spray;
  say((sp.sitting?.drops ?? 0) === 0, 'no spray while it sits');
  say((sp.planing?.drops ?? 0) > 50 && (sp.planing?.wake ?? 0) > 20, 'spray and a wake on the step');
  say((sp.touchdown?.drops ?? 0) > 50, 'a splash and spray on touching down');
  const ev = (w) => log.events.find((e) => e.what === w);
  say(Boolean(ev('onstep')) && Boolean(ev('planing')) && Boolean(ev('climb')) && Boolean(ev('touchdown')) && Boolean(ev('done')), 'sat, taxied, got on the step and planed, lifted off, touched down, slowed');
  /* The frame: the run above spawns facing yaw 0. A crash recovery puts
   * the spawn elsewhere, facing wherever the craft was, and the water is
   * declared again in that frame; the drawn water must not move. */
  const yawed = await page.evaluate(`(async () => {
    const c = window.__craftState();
    window.__respawn(c.worldX + 4, c.worldZ - 3, 2.1);
    await new Promise((r) => setTimeout(r, 2500));
    const d = window.__craftState();
    let worst = 0;
    let n = 0;
    let missing = 0;
    for (let k = 0; k < 24; k += 1) {
      const a = k * 0.7;
      const r = 0.3 + (k % 6) * 0.5;
      const w = window.__water(d.worldX + Math.cos(a) * r, d.worldZ + Math.sin(a) * r);
      if (!w || w.plant === null || w.drawn === null) { missing += 1; continue; }
      worst = Math.max(worst, Math.abs(w.drawn - w.plant));
      n += 1;
      await new Promise((res) => requestAnimationFrame(res));
    }
    return { worst, n, missing, t: window.__water(d.worldX, d.worldZ).t };
  })()`);
  say(yawed.n === 24 && yawed.worst <= MATCH, `respawned 2.1 rad round, the waves declared in that frame: the drawn surface within ${(yawed.worst * 1000).toFixed(2)} mm of the plant's over ${yawed.n} points round the craft (${yawed.missing} unread), sim clock ${yawed.t.toFixed(2)} s`);
  const errs = page.errors;
  say(errs.length === 0, `no console errors${errs.length ? `: ${errs.slice(0, 3).join(' | ')}` : ''}`);
} finally {
  await page.close();
}
console.log(failed ? `\n${failed} FAILED` : '\nall hold');
process.exit(failed ? 1 : 0);
