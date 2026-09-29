/*
 * itaipu-water-check.js: Itaipu's water, package E (docs/ITAIPU-PLAN.md
 * sections 5 and 14).
 *
 *   [SIM_GPU=1] [FDFPV_ITAIPU_DATA=DIR] node scripts/itaipu-water-check.js
 *       [--node] [--shots=DIR] [--swiss2=PERF_JSON]
 *
 * In Node, against dist/sim.wasm and the data's water.json and dam.json,
 * with the bodies in src/game/water.js's lake form as src/maps/itaipu.js
 * makes them (lakesOf: its wind, 2 m/s from the north east, over the
 * fetch water.json gives for that direction) and declared through
 * declareBodies in the shell's frame at each spawn:
 *
 *   floats      the Timber (9) and the Cub (10) on floats started at each
 *               body's spawn float on that body at its level, at rest;
 *               at 40 % throttle they taxi, still on that body and
 *               afloat, and end inside its outline;
 *   dive        a Timber dived into the reservoir, and one into the river,
 *               raises SIM_EVENT_WATER on water;
 *   waves       the wind from each of the sixteen directions water.json
 *               measures: the reservoir's waves rise with the fetch
 *               (never lower for a longer one, and more than twice as
 *               high over the longest as over the shortest), and the
 *               river's, fetch limited by the canyon's 400 m, stay under
 *               the reservoir's lowest;
 *   chute       the chute's water sits CHUTE_DEPTH over dam.json's floor
 *               at every station, and the map's surfaceAt (the roofs'
 *               materialAt) answers `water` on it and nothing off it.
 *
 * Then in headless Chromium (tests/lib/page.js), unless --node, one load
 * of the map with a Timber on floats seated:
 *
 *   declared    the shell's water is the two bodies, reservoir first, and
 *               the plant's body under 60 points round the spawns is the
 *               one the Node forms put there (so the forms above are the
 *               shell's);
 *   afloat      the flight starts afloat on the reservoir (body 0), and
 *               respawned on the river's spawn it floats on body 1; 40 %
 *               throttle taxis it on each;
 *   chute       the map's height on the chute is the chute's water;
 *   mirror      with the camera over the reservoir the mirror is the
 *               reservoir's, down in the canyon the river's, never two
 *               at once, at swiss2's scale for the tier; with SIM_GPU=1
 *               its GPU time at those two places, median of 40 draws,
 *               is no more than swiss2's lake mirror on
 *               scripts/swiss2-perf.js (--swiss2 names its perf.json;
 *               without it the time is printed and not judged).
 *
 * --shots=DIR leaves the reservoir, the river, the chutes and a Timber
 * afloat there as PNGs.
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

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import {
  TIMBERF_AIRFRAME, CUBF_AIRFRAME, FLOAT_REST, RC_STEP_MS, floatState, must,
} from '../tests/lib/wingpilot.js';
import { declareBodies, insideWater } from '../src/game/water.js';
import { threePosToSim, threeDirToSim } from '../src/render/frame.js';
import { makeRoofs } from '../src/maps/alps/roofs.js';
import { chuteSheet, chuteRecords, CHUTE_DEPTH } from '../src/maps/itaipu/water/index.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA = resolve(process.env.FDFPV_ITAIPU_DATA || join(homedir(), 'Desktop', 'fdfpv-itaipu-data'));
const opts = { node: false, shots: '', swiss2: '' };
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([a-z0-9]+)(?:=(.*))?$/);
  if (!m || !(m[1] in opts)) {
    throw new Error(`itaipu-water-check: unknown argument ${a}`);
  }
  opts[m[1]] = m[2] === undefined ? true : m[2];
}

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};

const water = JSON.parse(await readFile(join(DATA, 'water.json'), 'utf8'));
const dam = JSON.parse(await readFile(join(DATA, 'dam.json'), 'utf8'));

/* src/maps/itaipu.js WIND and lakesOf: the breeze and the lake form. The
 * browser half checks the shell's declared water against these. */
const WIND = { speed: 2, fromDeg: 45 };
function lakeForm(b, fromDeg = WIND.fromDeg) {
  const to = ((fromDeg + 180) * Math.PI) / 180;
  return {
    kind: 'lake',
    name: b.name,
    surfaceY: b.y,
    outline: b.outline.map(([x, z]) => ({ x, z })),
    bedY: b.y - b.bedDepth,
    centre: { x: b.spawn.x, z: b.spawn.z },
    spawn: { x: b.spawn.x, z: b.spawn.z, yaw: b.spawn.yaw },
    wind: {
      speed: WIND.speed, toX: Math.sin(to), toZ: -Math.cos(to), fetch: b.fetch[String(fromDeg)],
    },
  };
}
const LAKES = water.map((b) => lakeForm(b));

/* ------------------------------------------------------------- Node */

const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const sim = await loadSim(wasmBytes);
if (sim.init(configText) !== SIM_OK) {
  throw new Error('sim_init failed');
}

/* The shell's frame at a spawn (x, y, z) facing yaw: src/main.js
 * worldPosToSim, the map's offset from the spawn turned by the spawn's
 * yaw back to the plant's heading, then the axes. */
function frameAt(sx, sy, sz, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const turn = (x, z) => [x * c - z * s, x * s + z * c];
  return {
    pos: (x, y, z, out) => {
      const [rx, rz] = turn(x - sx, z - sz);
      return threePosToSim(rx, y - sy, rz, out);
    },
    dir: (x, y, z, out) => {
      const [rx, rz] = turn(x, z);
      return threeDirToSim(rx, y, rz, out);
    },
    /* The plant's (x, y) back to the map's (x, z). */
    back: (px, py) => {
      const rx = -py;
      const rz = -px;
      return [sx + rx * c + rz * s, sz - rx * s + rz * c];
    },
    perMetre: 1,
  };
}

const declare = (bodies, frame) => {
  must(sim.e.sim_water_clear(), 'sim_water_clear');
  return declareBodies(sim.e, bodies, frame);
};

/* An aircraft on floats started on body k as the shell starts it, then
 * `ms` with the throttle at `throttle`, sampled every 100 ms. */
function afloat(airframe, k, throttle, ms) {
  const w = LAKES[k];
  const sp = w.spawn;
  const sy = w.surfaceY;
  const frame = frameAt(sp.x, sy, sp.z, sp.yaw);
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_set_airframe(airframe), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
  declare(LAKES, frame);
  must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, w.bedY - sy, 1.4, 0), 'sim_set_ground');
  const rest = FLOAT_REST[airframe];
  const h = (rest.pitchDeg * Math.PI) / 360;
  must(sim.e.sim_set_pose(0, 0, rest.z, Math.cos(h), 0, -Math.sin(h), 0), 'sim_set_pose');
  const samples = [];
  for (let t = 0; t < ms; t += RC_STEP_MS) {
    must(sim.input(t / 1000, 0, 0, 0, t < 2000 ? 0 : throttle), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    if ((t + RC_STEP_MS) % 100 === 0) {
      const s = sim.readState().state;
      const f = floatState(sim);
      const [mx, mz] = frame.back(s[1], s[2]);
      samples.push({
        t: t + RC_STEP_MS, x: mx, z: mz, over: s[3], speed: Math.hypot(s[4], s[5], s[6]), body: f[9], buoyancy: f[0], wet: f[4] + f[5],
      });
    }
  }
  return samples;
}

/* A taxi: enough throttle to get under way, not enough to come onto the
 * step. Under way is more than 5 m, a few lengths, in the 10 s and still
 * making half a metre a second at the end. */
const TAXI = 0.4;
for (const [airframe, name] of [[TIMBERF_AIRFRAME, 'Timber'], [CUBF_AIRFRAME, 'Cub']]) {
  for (let k = 0; k < LAKES.length; k += 1) {
    const w = LAKES[k];
    const run = afloat(airframe, k, TAXI, 12000);
    const settled = run.find((r) => r.t === 2000);
    const rest = FLOAT_REST[airframe].z;
    check(`the ${name} on floats started on body ${k}, the ${w.name}, floats on it at ${w.surfaceY} m`,
      settled.body === k && Math.abs(settled.over - rest) < 0.01 && settled.speed < 0.2,
      `after 2 s: sim_float_state out[9] ${settled.body}, CG ${settled.over.toFixed(4)} m over the surface (rest ${rest}), ${settled.speed.toFixed(3)} m/s`);
    const taxi = run.filter((r) => r.t > 2000);
    const end = taxi[taxi.length - 1];
    const moved = Math.hypot(end.x - w.spawn.x, end.z - w.spawn.z);
    const onBody = taxi.every((r) => r.body === k && r.wet > 0 && r.over > -0.1 && r.over < 0.6);
    check(`and taxis on it at ${TAXI * 100}% throttle`,
      onBody && moved > 5 && end.speed > 0.5 && insideWater(w, end.x, end.z),
      `${moved.toFixed(1)} m in 10 s to (${end.x.toFixed(0)}, ${end.z.toFixed(0)}), ${end.speed.toFixed(2)} m/s, `
      + `every sample on body ${k} and wet: ${onBody}, CG ${Math.min(...taxi.map((r) => r.over)).toFixed(3)} to ${Math.max(...taxi.map((r) => r.over)).toFixed(3)} m over the surface`);
  }
}

/* A Timber dived at the water, damage on: 8 m over it, 30 degrees nose
 * down, 16 m/s along the nose. */
const EVENT_DOUBLES = 16;
const SIM_EVENT_WATER = 8;
const SIM_SURF_WATER = 11;
function dive(k) {
  const w = LAKES[k];
  const sp = w.spawn;
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_set_airframe(TIMBERF_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
  must(sim.e.sim_set_damage(1), 'sim_set_damage');
  declare(LAKES, frameAt(sp.x, w.surfaceY, sp.z, sp.yaw));
  must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, w.bedY - w.surfaceY, 1.4, 0), 'sim_set_ground');
  const pitch = (-30 * Math.PI) / 180;
  must(sim.e.sim_set_pose(0, 0, 8, Math.cos(-pitch / 2), 0, Math.sin(-pitch / 2), 0), 'sim_set_pose');
  must(sim.e.sim_set_velocity(16 * Math.cos(pitch), 0, 16 * Math.sin(pitch), 0, 0, 0), 'sim_set_velocity');
  for (let t = 0; t < 2000; t += RC_STEP_MS) {
    must(sim.input(t / 1000, 0, 0, 0, 0), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
  }
  const ptr = sim.e.malloc(64 * EVENT_DOUBLES * 8);
  const n = sim.e.sim_damage_events(ptr, 64);
  const ev = Array.from({ length: Math.max(0, n) }, (_, i) => Array.from(new Float64Array(sim.e.memory.buffer, ptr + i * EVENT_DOUBLES * 8, EVENT_DOUBLES)));
  sim.e.free(ptr);
  must(sim.e.sim_set_damage(0), 'sim_set_damage');
  return ev;
}
for (let k = 0; k < LAKES.length; k += 1) {
  const ev = dive(k);
  const wet = ev.filter((e) => e[2] === SIM_EVENT_WATER);
  check(`a Timber dived into the ${LAKES[k].name} raises SIM_EVENT_WATER`,
    wet.length >= 1 && wet[0][14] === SIM_SURF_WATER && wet[0][13] > 1,
    `${ev.length} events, ${wet.length} water: ${wet.map((e) => `part ${e[1]} at ${e[0]} ms, closing ${e[13].toFixed(1)} m/s, surface ${e[14]}`).join('; ') || 'none'}`);
}

/* The waves the plant raises from each direction's wind and fetch: the
 * sum of the components' amplitudes, the highest the sea can stand. */
function crestFor(k, fromDeg) {
  const w = LAKES[k];
  const bodies = water.map((b, j) => (j === k ? lakeForm(b, fromDeg) : LAKES[j]));
  const lakes = declare(bodies, frameAt(w.spawn.x, w.surfaceY, w.spawn.z, 0));
  const ptr = sim.e.malloc(41 * 8);
  must(sim.e.sim_water_components(lakes[k].body, ptr), 'sim_water_components');
  const c = new Float64Array(sim.e.memory.buffer, ptr, 41);
  let crest = 0;
  for (let i = 0; i < c[0]; i += 1) {
    crest += Math.abs(c[6 + i * 5]);
  }
  sim.e.free(ptr);
  return { fetch: bodies[k].wind.fetch, crest };
}
{
  const dirs = Object.keys(water[0].fetch).map(Number);
  const table = LAKES.map((_, k) => dirs.map((d) => ({ dir: d, ...crestFor(k, d) })));
  for (let k = 0; k < LAKES.length; k += 1) {
    console.log(`  ${LAKES[k].name}: ${table[k].map((r) => `${r.dir} deg ${r.fetch} m ${(r.crest * 100).toFixed(1)} cm`).join(', ')}`);
  }
  const res = table[0].slice().sort((a, b) => a.fetch - b.fetch);
  const rising = res.every((r, i) => i === 0 || r.crest >= res[i - 1].crest - 1e-12);
  const ratio = res[res.length - 1].crest / res[0].crest;
  check('the reservoir\'s waves rise with the wind\'s fetch',
    rising && ratio > 2,
    `from ${(res[0].crest * 100).toFixed(1)} cm over ${res[0].fetch} m to ${(res[res.length - 1].crest * 100).toFixed(1)} cm over ${res[res.length - 1].fetch} m (${ratio.toFixed(2)} times), never lower for a longer fetch: ${rising}`);
  const river = Math.max(...table[1].map((r) => r.crest));
  check('the river\'s, over the canyon\'s few hundred metres, stay under the reservoir\'s lowest',
    river < res[0].crest && Math.max(...table[1].map((r) => r.fetch)) <= 400,
    `river at most ${(river * 100).toFixed(1)} cm (fetch at most ${Math.max(...table[1].map((r) => r.fetch))} m) against the reservoir's least ${(res[0].crest * 100).toFixed(1)} cm`);
}
must(sim.e.sim_water_clear(), 'sim_water_clear');

/* The chute as ground. */
const sheet = chuteSheet(dam);
const records = chuteRecords(sheet);
const floor = dam.find((p) => p.part === 'spillway').sections.find((s) => s.at === 'chute').floor;
const roofs = makeRoofs(records);
{
  let worst = 0;
  sheet.rows.forEach((r, k) => {
    const x = r.x + sheet.across[0] * (r.left + r.right) / 2;
    const z = r.z + sheet.across[1] * (r.left + r.right) / 2;
    const top = roofs.height(x, z, null, -Infinity);
    worst = Math.max(worst, Math.abs(top - (floor[k][1] + CHUTE_DEPTH)));
  });
  check('the chute\'s water lies CHUTE_DEPTH over dam.json\'s floor at every station',
    worst < 1e-6 && sheet.rows.length === floor.length,
    `${sheet.rows.length} stations of ${floor.length}, ${records.length} records, worst ${worst.toExponential(1)} m off floor + ${CHUTE_DEPTH} m; width ${(sheet.rows[1].right - sheet.rows[1].left).toFixed(0)} m`);
  let s = 20260929;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  let wet = 0;
  let n = 0;
  let firstBad = null;
  for (let i = 0; i < 300; i += 1) {
    const r0 = sheet.rows[0];
    const r1 = sheet.rows[sheet.rows.length - 1];
    const a = 1 + rnd() * (r1.s - r0.s - 2);
    const k = sheet.rows.findIndex((r) => r.s > a) - 1;
    const p = sheet.rows[k];
    const q = sheet.rows[k + 1];
    const f = (a - p.s) / (q.s - p.s);
    const left = p.left + (q.left - p.left) * f;
    const right = p.right + (q.right - p.right) * f;
    const u = left + 1 + rnd() * (right - left - 2);
    const x = r0.x + sheet.along[0] * a + sheet.across[0] * u;
    const z = r0.z + sheet.along[1] * a + sheet.across[1] * u;
    const y = roofs.height(x, z, null, -Infinity);
    n += 1;
    if (roofs.materialAt(x, z, y) === 'water') {
      wet += 1;
    } else if (!firstBad) {
      firstBad = { x, z, y };
    }
  }
  const off = [[-900, -400], [-600, -800], [-1200, -700]].map(([x, z]) => roofs.materialAt(x, z, roofs.height(x, z, null, -Infinity)));
  check('the map\'s surfaceAt answers water on the chute and nothing off it',
    wet === n && off.every((m) => m === null),
    `${wet} of ${n} sampled chute points water${firstBad ? `, first not at ${JSON.stringify(firstBad)}` : ''}; off the chute ${JSON.stringify(off)}`);
}

/* ---------------------------------------------------------- Browser */

async function browser() {
  const { openPage } = await import('../tests/lib/page.js');
  const { SETTINGS_KEY, seatAirframe } = await import('../src/ui/ui.js');
  const { airframeById } = await import('../configs/airframes.js');
  const seated = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, 'timber1500f');
  seated.map = 'itaipu';
  seated.graphics = 'high';
  seated.graphicsAuto = false;
  const page = await openPage({
    root,
    width: 1600,
    height: 900,
    url: '/index.html',
    seed: [`try {
      const k = ${JSON.stringify(SETTINGS_KEY)};
      const s = JSON.parse(localStorage.getItem(k) || '{}');
      Object.assign(s, ${JSON.stringify(seated)});
      s.airframeAsked = true;
      localStorage.setItem(k, JSON.stringify(s));
      localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
    } catch (e) { /* Storage refused. The run still boots. */ }`],
  });
  const part = 'window.__mapScene().userData.itaipu.parts.water';
  /* Until the terrain has built what the camera asks for (scripts/
   * itaipu-check.js settle). */
  const settle = async () => {
    for (let k = 0; k < 2; k += 1) {
      await page.evaluate('window.__cf = window.__boot().frames');
      await page.until('window.__boot().frames > window.__cf + 2', 60000);
      await page.until('(() => { const t = window.__mapScene().userData.itaipu.terrain; return t.stats().queuedBuilds === 0 && !t.job; })()', 120000);
      await page.evaluate('window.__cf = window.__boot().frames');
      await page.until('window.__boot().frames > window.__cf + 3', 60000);
    }
  };
  const park = async (cam) => {
    await page.evaluate(`window.__setCam(${cam.join(', ')}, 50)`);
    await settle();
  };
  const shoot = async (name) => {
    if (!opts.shots) {
      return;
    }
    const r = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
    const file = join(resolve(opts.shots), `${name}.png`);
    await writeFile(file, Buffer.from(r.data, 'base64'));
    console.log(`  picture ${file}`);
  };
  try {
    await page.until('!!window.__shellReady', 240000);
    await page.until('window.__map && window.__map().id === "itaipu" && window.__map().ready', 400000);
    const declared = await page.evaluate('window.__crashWater()');
    check('the shell declares the reservoir and the river, in that order, with their spawns',
      declared.length === 2 && declared.every((d, k) => d.kind === 'lake' && d.surfaceY === water[k].y
        && d.spawn.x === water[k].spawn.x && d.spawn.z === water[k].spawn.z),
      JSON.stringify(declared.map((d) => [d.kind, d.surfaceY, d.spawn])));

    await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until("window.__craftState && window.__craftState().mode === 'flight'", 240000);
    /* `s` seconds on the plant's clock, which headless runs slower than
     * the page's. */
    const waitSim = async (s) => {
      await page.evaluate('window.__t0 = window.__craftState().simS');
      await page.until(`window.__craftState().simS > window.__t0 + ${s}`, 240000);
    };
    const onWater = async (k, name) => {
      await waitSim(3);
      const c = await page.evaluate('(() => { const c = window.__craftState(); return { x: c.worldX, y: c.worldY, z: c.worldZ, speed: c.speed, floats: c.floats && c.floats.state.slice() }; })()');
      check(`the Timber on floats is afloat on body ${k}, the ${name}`,
        c.floats && c.floats[9] === k && Math.abs(c.y - water[k].y) < 1 && c.floats[4] + c.floats[5] > 0,
        `at (${c.x.toFixed(0)}, ${c.y.toFixed(2)}, ${c.z.toFixed(0)}), sim_float_state out[9] ${c.floats && c.floats[9]}, wetted ${c.floats && (c.floats[4] + c.floats[5]).toFixed(2)} m`);
      await page.evaluate('window.__stick(0, 0, 0, ${TAXI})');
      await waitSim(6);
      await page.evaluate('window.__stick(0, 0, 0, 0)');
      const d = await page.evaluate('(() => { const c = window.__craftState(); return { x: c.worldX, y: c.worldY, z: c.worldZ, speed: c.speed, floats: c.floats && c.floats.state.slice() }; })()');
      const moved = Math.hypot(d.x - c.x, d.z - c.z);
      check(`and taxis on it`,
        d.floats[9] === k && moved > 3 && Math.abs(d.y - water[k].y) < 1,
        `${moved.toFixed(1)} m at ${TAXI * 100}% throttle, now on body ${d.floats[9]} at y ${d.y.toFixed(2)}`);
      return c;
    };
    const res = await onWater(0, 'reservoir');
    if (opts.shots) {
      await mkdir(resolve(opts.shots), { recursive: true });
      await page.evaluate(`window.__respawn(${water[0].spawn.x}, ${water[0].spawn.z}, ${water[0].spawn.yaw})`);
      await waitSim(3);
      const c = await page.evaluate('(() => { const c = window.__craftState(); return [c.worldX, c.worldY, c.worldZ]; })()');
      /* Behind and a little above, the dam ahead. */
      await park([c[0] - 1.2, c[1] + 1.4, c[2] - 5.5, c[0], c[1] + 0.2, c[2] + 6]);
      await shoot('timber-afloat');
    }
    await page.evaluate(`window.__respawn(${water[1].spawn.x}, ${water[1].spawn.z}, ${water[1].spawn.yaw})`);
    await onWater(1, 'river');

    /* The plant's body under points round each spawn against the Node
     * forms'. */
    let s = 7;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const pts = [];
    for (let i = 0; i < 60; i += 1) {
      const w = water[i % 2];
      pts.push([w.spawn.x + (rnd() - 0.5) * 3000, w.spawn.z + (rnd() - 0.5) * 3000]);
    }
    const plant = await page.evaluate(`${JSON.stringify(pts)}.map(([x, z]) => window.__waterSample(x, z))`);
    let agree = 0;
    const disagree = [];
    pts.forEach(([x, z], i) => {
      const want = LAKES.findIndex((w) => insideWater(w, x, z));
      const got = plant[i].body;
      if (want === got && (want < 0 || Math.abs(plant[i].plant - LAKES[want].surfaceY) < 0.5)) {
        agree += 1;
      } else {
        disagree.push({ x: Math.round(x), z: Math.round(z), want, got });
      }
    });
    check('the plant\'s body under 60 points round the spawns is the Node forms\' (so they are the shell\'s)',
      agree === pts.length,
      `${agree} of ${pts.length} agree${disagree.length ? `, first off ${JSON.stringify(disagree[0])}` : ''}; ${pts.filter((_, i) => plant[i].body >= 0).length} on water`);

    /* The chute's water is the map's ground there. */
    const mid = sheet.rows[8];
    const cx = mid.x + sheet.across[0] * (mid.left + mid.right) / 2;
    const cz = mid.z + sheet.across[1] * (mid.left + mid.right) / 2;
    const h = await page.evaluate(`window.__surface(${cx}, ${cz}, ${mid.y + 0.2})`);
    check('the map\'s height on the chute is the chute\'s water',
      Math.abs(h - mid.y) < 1e-6,
      `at (${cx.toFixed(0)}, ${cz.toFixed(0)}) from ${(mid.y + 0.2).toFixed(2)}: ${h.toFixed(3)}, the water ${mid.y.toFixed(3)}`);

    /* The mirror, and the pictures. */
    const VIEWS = [
      { name: 'reservoir', cam: [-2600, 340, -4300, 300, 219, -1900], body: 0 },
      { name: 'river', cam: [-760, 175, -250, -1150, 104, 2600], body: 1 },
      { name: 'chutes', cam: [-1450, 480, 250, -930, 170, -800], body: 1 },
    ];
    const gpu = process.env.SIM_GPU === '1';
    const times = {};
    for (const v of VIEWS) {
      await park(v.cam);
      const st = await page.evaluate(`${part}.stats()`);
      check(`the mirror at the ${v.name} view is the ${water[v.body].name}'s, and one`,
        st.mirrorBody === v.body && st.mirrorDrawn && st.mirrorsLive === 1 && st.mirrorScale === 0.5,
        `body ${st.mirrorBody}, drawn ${st.mirrorDrawn}, ${st.mirrorsLive} live, scale ${st.mirrorScale} (swiss2 High 0.5), ${st.mirrorCalls} calls, ${st.mirrorTriangles} triangles`);
      await shoot(v.name);
      if (gpu && v.name !== 'chutes') {
        times[v.name] = await page.evaluate(`(async () => {
          const w = ${part};
          const { renderer, scene, camera } = w.seen;
          const gl = renderer.getContext();
          const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
          if (!ext) { throw new Error('no EXT_disjoint_timer_query_webgl2'); }
          const qs = [];
          for (let k = 0; k < 40; k += 1) {
            gl.finish();
            const q = gl.createQuery();
            gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
            w.renderMirror(renderer, scene, camera);
            gl.endQuery(ext.TIME_ELAPSED_EXT);
            qs.push(q);
          }
          gl.finish();
          const last = qs[qs.length - 1];
          while (!gl.getQueryParameter(last, gl.QUERY_RESULT_AVAILABLE)) {
            await new Promise((d) => setTimeout(d, 5));
          }
          const ms = qs.map((q) => gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6).sort((a, b) => a - b);
          return { median: ms[ms.length >> 1], least: ms[0] };
        })()`);
      }
    }
    if (!gpu) {
      console.log('NOT RUN the mirror\'s GPU time: needs SIM_GPU=1 (a software rasteriser\'s timings say nothing about a GPU)');
    } else if (!opts.swiss2) {
      console.log(`NOT JUDGED the mirror's GPU time, no --swiss2 perf.json: ${JSON.stringify(times)}`);
    } else {
      const perf = JSON.parse(await readFile(resolve(opts.swiss2), 'utf8'));
      const lake = perf.filter ? perf : perf.rows || perf.views || perf;
      const swiss = [];
      JSON.stringify(lake, (key, value) => {
        if (value && typeof value === 'object' && /^lake/.test(value.view || '') && value.preset === 'high' && value.parts && value.parts.mirror != null) {
          swiss.push({ view: value.view, mirror: value.parts.mirror });
        }
        return value;
      });
      const worstSwiss = Math.max(...swiss.map((r) => r.mirror));
      const ours = Math.max(...Object.values(times).map((t) => t.median));
      check('the mirror costs no more than swiss2\'s lake mirror on swiss2-perf.js (High)',
        swiss.length > 0 && ours <= worstSwiss,
        `Itaipu ${Object.entries(times).map(([n, t]) => `${n} ${t.median.toFixed(2)} ms (least ${t.least.toFixed(2)})`).join(', ')}; swiss2 ${swiss.map((r) => `${r.view} ${r.mirror.toFixed(2)} ms`).join(', ') || 'no lake rows found'}`);
    }
    const errors = page.errors.filter((e) => !/favicon/.test(e));
    check('no page error', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');
    return res;
  } finally {
    await page.close();
  }
}

if (!opts.node) {
  await browser();
}

const failed = checks.filter((c) => !c.ok).length;
console.log(`${checks.length - failed} of ${checks.length} passed`);
process.exit(failed ? 1 : 0);
