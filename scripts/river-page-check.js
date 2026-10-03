/*
 * river-page-check.js: swiss2's stream is water in the real shell.
 *
 *   node scripts/river-page-check.js [--shots=DIR]
 *   SIM_GPU=1 for the machine's GPU instead of SwiftShader
 *   --shots=DIR pictures of the Timber on the river and of the Skyhunter
 *               in it, into DIR (outside the repository)
 *
 * scripts/river-water-check.js flies the plant on a channel in Node; this
 * is the other half, that the shell tells the plant the stream the map
 * draws (src/game/water.js, the map's view.rivers):
 *
 *   the plant's surface is the drawn one: at every 25th row of the drawn
 *     stream the plant's water, the shell's, and the ground the shell
 *     gives everything else (so paper and a wheeled plane rest on it) are
 *     the drawn centre's height;
 *   the Timber on floats set down on the river near the strip floats at
 *     its lake height over it, takes off down it on full throttle and the
 *     stick back, and set down on it again from 1.2 m at 10 m/s comes to
 *     float on it;
 *   a Skyhunter flown into it with crash physics on goes into the water.
 *
 * Exits 1 on any failure.
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

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { FLOAT_REST, TIMBERF_AIRFRAME } from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const arg = (name, dflt) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : dflt;
};
const shotsDir = arg('shots', '');
const REST = FLOAT_REST[TIMBERF_AIRFRAME];
const W_TIMBER = 1.934 * 9.81;

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};

function seeds(airframe) {
  const settings = {
    ...seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, airframe),
    airframeAsked: true,
    map: 'swiss2',
    graphics: process.env.SIM_GPU === '1' ? 'high' : 'low',
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

async function open(airframe) {
  const page = await openPage({ root, width: 960, height: 540, url: '/index.html?map=swiss2', seed: seeds(airframe) });
  await page.until('window.__shellReady && window.__map && window.__map().ready', 300000);
  await page.sleep(1500);
  return page;
}

/* The river near the strip: the lower run's row nearest z = 0, where the
 * stream runs straight and level beside the strip, and its heading. */
const PICK = `(() => {
  const runs = window.__crashWater().filter((w) => w.kind === 'channel');
  const run = runs.reduce((a, b) => (b.line.length > a.line.length ? b : a));
  let k = 0;
  run.line.forEach((p, i) => { if (Math.abs(p.z) < Math.abs(run.line[k].z)) k = i; });
  const a = run.line[k];
  const b = run.line[k + 10];
  const l = Math.hypot(b.x - a.x, b.z - a.z);
  return JSON.stringify({ x: a.x, y: a.y, z: a.z, ux: (b.x - a.x) / l, uz: (b.z - a.z) / l, runs: runs.length, points: runs.reduce((n, r) => n + r.line.length, 0) });
})()`;

/* Every 25th drawn row's centre vertex against the plant's water, the
 * shell's, and the ground, m. */
const SURFACE = `(() => {
  const rows = [];
  window.__mapScene().traverse((o) => {
    if (o.name !== 'swiss2-stream') return;
    const p = o.geometry.attributes.position;
    for (let i = 2; i < p.count; i += 5 * 25) rows.push([p.getX(i), p.getY(i), p.getZ(i)]);
  });
  const kinds = window.__crashWater().map((w) => w.kind);
  let plant = 0, shell = 0, ground = 0, dry = 0, pooled = 0, bridged = 0, worst = null;
  for (const [x, y, z] of rows) {
    const s = window.__waterSample(x, z);
    if (s.plant == null || s.shell == null) { dry += 1; continue; }
    /* A row under the pool's still water is drawn under it: the pool is
     * the water there, in the plant as on the screen. */
    if (kinds[s.body] !== 'channel' && s.plant > y) { pooled += 1; continue; }
    if (Math.abs(s.plant - y) > plant) worst = { x, y, z, body: s.body, plant: s.plant };
    plant = Math.max(plant, Math.abs(s.plant - y));
    shell = Math.max(shell, Math.abs(s.shell - y));
    /* The ground there is the water's, but for a bridge over it. */
    const h = window.__heightAt(x, z);
    if (h > y + 0.5) { bridged += 1; continue; }
    ground = Math.max(ground, Math.abs(h - y));
  }
  return JSON.stringify({ rows: rows.length, dry, pooled, bridged, plant, shell, ground, worst });
})()`;

const STATE = `JSON.stringify((() => { const c = window.__craftState(); const w = window.__waterSample(c.worldX, c.worldZ);
  return { t: window.__crash().simT, x: c.worldX, y: c.worldY, z: c.worldZ, speed: c.speed, clear: c.groundClearance, floats: c.floats ? Array.from(c.floats.state) : null, body: w.body, surface: w.plant, flags: window.__crash().flagNames, crashed: c.crashed }; })())`;

async function watch(page, seconds, each) {
  const t0 = JSON.parse(await page.evaluate(STATE)).t;
  const wall = Date.now();
  let st = null;
  while (Date.now() - wall < 180000) {
    await page.sleep(50);
    st = JSON.parse(await page.evaluate(STATE));
    if (each && each(st) === true) break;
    if (st.t - t0 >= seconds) break;
  }
  return st;
}

async function shot(page, name, st, ux, uz) {
  if (!shotsDir) return;
  await page.evaluate(`window.__setCam(${st.x - uz * 7 - ux * 3}, ${st.y + 2}, ${st.z + ux * 7 - uz * 3}, ${st.x}, ${st.y}, ${st.z}, 55)`);
  await page.sleep(800);
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(shotsDir, name), Buffer.from(data, 'base64'));
}

if (shotsDir) {
  await mkdir(resolve(shotsDir), { recursive: true });
}

{
  const page = await open('timber1500f');
  try {
    const r = JSON.parse(await page.evaluate(PICK));
    const s = JSON.parse(await page.evaluate(SURFACE, 120000));
    check('the plant\'s and the shell\'s river is the drawn stream, and the ground over it is its water',
      s.rows > 50 && s.dry === 0 && s.plant < 0.002 && s.shell < 0.002 && s.ground < 0.002,
      `${r.runs} runs, ${r.points} points; ${s.rows} drawn rows, ${s.dry} not water, ${s.pooled} under the pool, ${s.bridged} under a bridge; worst off the drawn centre: plant ${s.plant.toFixed(4)}, shell ${s.shell.toFixed(4)}, ground ${s.ground.toFixed(4)} m${s.worst ? ` (${JSON.stringify(s.worst)})` : ''}`);

    const yaw = (Math.atan2(-r.ux, -r.uz) * 180) / Math.PI;
    await page.evaluate(`window.__stick(0, 0, 0, 0)`);
    await page.evaluate(`window.__crashThrow(${JSON.stringify({ fresh: true, x: r.x, y: r.y + REST.z, z: r.z, yaw, pitch: REST.pitchDeg })})`);
    const rest = await watch(page, 4);
    const over = rest.y - rest.surface;
    check('the Timber on floats set down on the river floats at its lake height over it',
      rest.body >= 0 && rest.floats && Math.abs(rest.floats[0] - W_TIMBER) < 0.15 * W_TIMBER && Math.abs(over - REST.z) < 0.01 && !rest.crashed,
      `body ${rest.body}, buoyancy ${rest.floats ? rest.floats[0].toFixed(1) : '-'} N of ${W_TIMBER.toFixed(1)}, CG ${over.toFixed(4)} m over the surface (lake ${REST.z}), ${rest.speed.toFixed(2)} m/s`);
    await shot(page, 'timber-afloat.png', rest, r.ux, r.uz);

    await page.evaluate(`window.__stick(0, 0.3, 0, 0)`);
    await page.evaluate(`window.__crashThrow(${JSON.stringify({ fresh: true, x: r.x - r.ux * 20, y: r.y + 1.2, z: r.z - r.uz * 20, yaw, pitch: 4, vx: r.ux * 10, vy: -0.3, vz: r.uz * 10 })})`);
    let touched = null;
    const down = await watch(page, 12, (st) => {
      if (!touched && st.floats && st.floats[4] + st.floats[5] > 0) touched = { speed: st.speed, body: st.body };
    });
    const floating = down.floats && Math.abs(down.floats[0] - W_TIMBER) < 0.25 * W_TIMBER && down.body >= 0;
    check('set down on it from 1.2 m at 10 m/s it lands and comes to float on it',
      Boolean(touched) && touched.body >= 0 && floating && down.speed < 2 && !down.crashed,
      touched ? `touched water at ${touched.speed.toFixed(2)} m/s on body ${touched.body}; 12 s on ${down.speed.toFixed(2)} m/s, buoyancy ${down.floats[0].toFixed(1)} N, body ${down.body} [${down.flags}]` : `never touched the water [${down.flags}]`);
    await shot(page, 'timber-landed.png', down, r.ux, r.uz);
    await page.evaluate(`window.__stick(0, 0, 0, 0)`);
    await page.evaluate(`window.__crashThrow(${JSON.stringify({ fresh: true, x: r.x, y: r.y + REST.z, z: r.z, yaw, pitch: REST.pitchDeg })})`);
    await watch(page, 2);
    await page.evaluate(`window.__stick(0, 0.6, 0, 1)`);
    let lof = null;
    let worst = 0;
    let offWet = false;
    const x0 = rest.x;
    const z0 = rest.z;
    const up = await watch(page, 12, (st) => {
      const wet = st.floats && st.floats[4] + st.floats[5] > 0;
      const along = (st.x - x0) * r.ux + (st.z - z0) * r.uz;
      const across = Math.abs(-(st.x - x0) * r.uz + (st.z - z0) * r.ux);
      if (!lof) worst = Math.max(worst, across);
      if (wet && st.body < 0) offWet = true;
      if (!lof && !wet && st.clear > 0.5) lof = { along, speed: st.speed };
      return Boolean(lof) && st.clear > 3;
    });
    check('it takes off down the river on full throttle and the stick back, inside its banks',
      Boolean(lof) && !offWet && !up.crashed,
      lof ? `off the water ${lof.along.toFixed(1)} m down at ${lof.speed.toFixed(2)} m/s, at most ${worst.toFixed(2)} m off its line; ${up.clear.toFixed(1)} m up at the end` : `never left the water; ${offWet ? 'ran off the river afloat' : ''} [${up.flags}]`);
    await shot(page, 'timber-climb.png', up, r.ux, r.uz);

  } finally {
    await page.close();
  }
}

{
  const page = await open('sky1800');
  try {
    const r = JSON.parse(await page.evaluate(PICK));
    const yaw = (Math.atan2(-r.ux, -r.uz) * 180) / Math.PI;
    await page.evaluate(`window.__crashThrow(${JSON.stringify({ fresh: true, x: r.x - r.ux * 8, y: r.y + 1.0, z: r.z - r.uz * 8, yaw, pitch: -6, vx: r.ux * 13, vy: -2, vz: r.uz * 13 })})`);
    let wet = false;
    const end = await watch(page, 2.5, (st) => { wet = wet || st.flags.includes('inWater'); });
    const log = JSON.parse(await page.evaluate('JSON.stringify(window.__crashLog().map((e) => e.type + " on " + e.surface))'));
    const water = log.filter((e) => e.endsWith('on water'));
    check('a Skyhunter flown into the river goes into the water',
      wet && water.length > 0,
      `inWater ${wet}, ${water.length} events on water (${[...new Set(log)].slice(0, 5).join('; ')}), ${end.speed.toFixed(2)} m/s after 2.5 s`);
    await shot(page, 'skyhunter-in-river.png', end, r.ux, r.uz);
  } finally {
    await page.close();
  }
}

const failed = checks.filter((c) => !c.ok).length;
console.log(`${checks.length - failed} of ${checks.length} passed`);
process.exit(failed ? 1 : 0);
