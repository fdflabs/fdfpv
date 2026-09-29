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
 *               the reservoir's lowest.
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
 *   chute       the chutes are D's floor records, their material water
 *               (the map's surfaceAt), each the map's ground, and the
 *               drawn sheet lies 0.4 m over each;
 *   waves       the plant's waves reach both drawn bodies;
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

/* ---------------------------------------------------------- Browser */

async function browser() {
  const { openPage } = await import('../tests/lib/page.js');
  const { SETTINGS_KEY, seatAirframe } = await import('../src/ui/ui.js');
  const { airframeById } = await import('../configs/airframes.js');
  const seated = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, 'timber1500f');
  seated.map = 'itaipu';
  seated.graphics = 'high';
  seated.graphicsAuto = false;
  /* The chase camera, so the picture has the aircraft in it. */
  seated.wingView = 'chase';
  const page = await openPage({
    root,
    width: 1600,
    height: 900,
    url: '/index.html?map=itaipu',
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
    /* The world alone, without the screens over it. */
    await page.evaluate("(() => { document.body.style.visibility = 'hidden'; for (const c of document.querySelectorAll('canvas')) { c.dataset.vis = c.style.visibility; c.style.visibility = 'visible'; } return 1; })()");
    const r = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
    await page.evaluate("(() => { document.body.style.visibility = ''; for (const c of document.querySelectorAll('canvas')) { c.style.visibility = c.dataset.vis; } return 1; })()");
    const file = join(resolve(opts.shots), `${name}.png`);
    await writeFile(file, Buffer.from(r.data, 'base64'));
    console.log(`  picture ${file}`);
  };
  try {
    await page.until('!!window.__shellReady', 240000);
    try {
      await page.until('window.__map && window.__map().id === "itaipu" && window.__map().ready', 400000);
    } catch (e) {
      const m = await page.evaluate('window.__map ? JSON.stringify(window.__map()) : "no __map"').catch((x) => x.message);
      throw new Error(`${e.message}; map ${String(m).slice(0, 400)}; page errors ${page.errors.slice(0, 3).join(' | ')}`);
    }
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
      await page.evaluate(`window.__stick(0, 0, 0, ${TAXI})`);
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
      await settle();
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

    /* The chutes: D's floors, water to the crash world, the sheet over
     * them. */
    const chute = await page.evaluate(`(() => {
      const w = ${part};
      const st = w.stats();
      const g = w.group.getObjectByName('itaipu-chute').geometry.getAttribute('position');
      let worst = 0;
      let wet = 0;
      let ground = 0;
      w.records.forEach((r, k) => {
        const f = r.faces[0];
        const x = (f.pts[0][0] + f.pts[1][0] + f.pts[2][0]) / 3;
        const z = (f.pts[0][1] + f.pts[1][1] + f.pts[2][1]) / 3;
        const top = f.a * x + f.b * z + f.d;
        if (r.material === 'water' && r.kind === 'spillway chute') wet += 1;
        if (Math.abs(window.__surface(x, z, top + 0.2) - top) < 1e-6) ground += 1;
        for (let v = 0; v < 3; v += 1) {
          const [px, pz] = f.pts[v];
          const y = f.a * px + f.b * pz + f.d;
          worst = Math.max(worst, Math.abs(g.getY(k * 4 + v) - y - ${0.4}));
        }
      });
      return { n: w.records.length, wet, ground, worst, floors: st.chuteFloors };
    })()`);
    check('the chutes are D\'s floors, which answer water to the crash world, with the drawn sheet 0.4 m over them',
      chute.n > 0 && chute.wet === chute.n && chute.ground === chute.n && chute.worst < 1e-3,
      `${chute.n} floor records, ${chute.wet} of kind spillway chute and material water, ${chute.ground} the map's ground at their middle, sheet off by at most ${chute.worst.toFixed(4)} m`);
    const waves = await page.evaluate(`${part}.stats().waves`);
    check('the plant\'s waves are handed to both drawn bodies',
      Array.isArray(waves) && waves.length === 2 && waves.every((n) => n > 0),
      `components per body ${JSON.stringify(waves)}`);

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
      /* swiss2-perf.js's perf.json: presets[].views[], each view's best
       * repeat's median per part. */
      const swiss = (perf.presets || []).filter((p) => p.preset === 'high')
        .flatMap((p) => p.views).filter((v) => /^lake/.test(v.id) && v.best && v.best.parts)
        .map((v) => ({ view: v.id, mirror: v.best.parts.mirror }));
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
