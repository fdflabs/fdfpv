/*
 * settings-calls-check.js: what a settings change and the launch stand do
 * to the module, call by call, recorded once and compared on every run.
 *
 *     node scripts/settings-calls-check.js            compare with the record
 *     node scripts/settings-calls-check.js --record   write the record (old code!)
 *
 * applySettings in src/main.js is where the pilot's settings reach the
 * plant: pack voltage, flight style, airframe, weight, rates, PID sliders,
 * the tune, the angle mode flag. The order of those module calls and their
 * arguments are what a flight is flown on, so a rewrite has to make the
 * same calls with the same numbers in the same order. This check wraps the
 * page's module before the shell loads it (as scripts/stand-fault-check.js
 * does) and logs every call to it, with sim_init's config text decoded,
 * through a fixed list of changes at the title and in flight, the launch
 * stand's three states (launch control reported held, released, idle), and
 * a world swap. Each step also records what the probes read back
 * (window.__tune, __pids, __air, the race's record key).
 *
 * Calls the shell makes every frame are noise here: whatever the shell
 * calls in an idle stretch of frames, before the steps, is left out of
 * every step's log.
 *
 * Some answers move between two runs of the same code (a pose read mid
 * flight). Recording takes two runs and keeps what agreed as exact values
 * and the rest as its type only; a comparison fails on any stable value
 * that changed, any recorded entry that went, or any type that changed.
 * The record is tests/fixtures/settings-calls-golden.json.
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

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { SLIDER_KEYS, SLIDERS } from '../configs/pids.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const RECORD = join(root, 'tests', 'fixtures', 'settings-calls-golden.json');
const RECORD_RUNS = 2;
const recording = process.argv.includes('--record');

/* Called every step or every frame whatever the settings are: the step
 * itself and the contact pass that runs beside it in flight. */
const HOT = new Set([
  'sim_step', 'sim_state', 'sim_state_size', 'sim_input', 'malloc', 'free',
  'sim_set_ground', 'sim_set_ground_material', 'sim_ground_contacts', 'sim_wheel_loads',
  'sim_damage_events', 'sim_obstacle_contacts',
]);

const seat = {
  ...seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'interceptor'),
  airframeAsked: true,
  graphics: 'low',
  graphicsAuto: false,
  sound: false,
  fpsCap: 0,
};

const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, ${JSON.stringify(seat)});
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.airhint.v2', '1');
} catch (e) { /* storage refused */ }`, `(() => {
  const T = { log: null, lc: null, wrapped: false };
  window.__calls = T;
  const hot = new Set(${JSON.stringify([...HOT])});
  const real = WebAssembly.instantiate.bind(WebAssembly);
  WebAssembly.instantiate = async (...args) => {
    const res = await real(...args);
    const ex = res && res.instance ? res.instance.exports : null;
    if (!ex || typeof ex.sim_step !== 'function' || T.wrapped) return res;
    T.wrapped = true;
    const out = {};
    for (const key of Object.keys(ex)) {
      const f = ex[key];
      if (typeof f !== 'function' || hot.has(key)) {
        out[key] = f;
        continue;
      }
      out[key] = (...a) => {
        const r = key === 'sim_launch_control_state' && T.lc !== null ? T.lc : f(...a);
        if (T.log) {
          const shown = key === 'sim_init'
            ? [new TextDecoder().decode(new Uint8Array(ex.memory.buffer, a[0], a[1]))]
            : a;
          T.log.push([key, ...shown, r]);
        }
        return r;
      };
    }
    return { module: res.module, instance: { exports: out } };
  };
})();`];

/* FNV-1a over a string, as eight hex digits. */
function digest(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/* A run of more than three calls to one export (a world's water mesh, a
 * forest's clumps) kept as its name, its length and a digest of every
 * argument, so the record stays small and still exact. */
function squeeze(calls) {
  const out = [];
  for (let i = 0; i < calls.length;) {
    let j = i;
    while (j < calls.length && calls[j][0] === calls[i][0]) {
      j += 1;
    }
    if (j - i > 3) {
      out.push(['run', calls[i][0], j - i, digest(JSON.stringify(calls.slice(i, j)))]);
    } else {
      out.push(...calls.slice(i, j));
    }
    i = j;
  }
  return out;
}

const frames = (page, n) => page.evaluate(`(async () => { for (let i = 0; i < ${n}; i += 1) await new Promise((r) => requestAnimationFrame(r)); return true; })()`);

/* What the probes read back, minus what moves with the frame clock. */
const PROBES = `(() => {
  const t = window.__tune();
  const c = window.__craftState();
  return {
    tune: { id: t.id, name: t.name, menu: t.menu, rates: t.rates, applied: t.applied, inert: t.inert, unknown: t.unknown, pRoll: t.pRoll, rollSrate: t.rollSrate, profile: t.profile },
    pids: window.__pids(),
    air: window.__air(),
    key: window.__race().key,
    craft: { mode: c.mode, tune: c.tune, landed: c.landed, turtle: c.turtle },
    cameraAngle: window.__ui.settings.cameraAngle,
  };
})()`;

/* Runs one step: a fresh log, the change, a few frames, and the log
 * without the shell's per-frame calls. */
async function step(page, idle, name, change, settle = 12) {
  await page.evaluate('(window.__calls.log = [], true)');
  await page.evaluate(change);
  await frames(page, settle);
  const calls = squeeze((await page.evaluate('window.__calls.log')).filter((c) => !idle.has(c[0])));
  await page.evaluate('(window.__calls.log = null, true)');
  return { name, calls, probes: await page.evaluate(PROBES) };
}

/* applySettings on whatever is in __ui.settings now: __setTune with the
 * tune already chosen moves nothing but runs the whole function. */
const apply = (body) => `(() => { const s = window.__ui.settings; ${body}; window.__setTune(s.tune); return true; })()`;

async function oneRun() {
  const page = await openPage({ root, width: 960, height: 540, url: '/index.html', seed });
  try {
    await page.until('window.__shellReady && window.__map && window.__map().ready', 300000);
    if (!(await page.evaluate('window.__calls.wrapped'))) {
      throw new Error('the shell did not load the wrapped module');
    }
    await frames(page, 20);
    /* The per-frame calls, at the title and in flight. */
    await page.evaluate('(window.__calls.log = [], true)');
    await frames(page, 40);
    const idle = new Set((await page.evaluate('window.__calls.log')).map((c) => c[0]));
    const steps = [];
    const tuneNow = await page.evaluate('window.__tune().id');
    const slider = SLIDER_KEYS[0];
    const sliderValue = SLIDERS[slider].cliMin + 15;
    const seven = seatAirframe({ ...seat }, '7inch');

    steps.push(await step(page, idle, 'title: pack voltage', apply('s.packVoltage = 3.9')));
    steps.push(await step(page, idle, 'title: arcade', apply("s.flightStyle = 'arcade'")));
    steps.push(await step(page, idle, 'title: expert', apply("s.flightStyle = 'expert'")));
    steps.push(await step(page, idle, 'title: weight 120', apply('s.weight = 120')));
    steps.push(await step(page, idle, 'title: weight 100', apply('s.weight = 100')));
    steps.push(await step(page, idle, 'title: roll srate +5', apply('s.rates = JSON.parse(JSON.stringify(s.rates)); s.rates.roll.srate += 5')));
    steps.push(await step(page, idle, `title: ${slider} slider ${sliderValue}`, apply(`s.pids = { ...(s.pids || {}), ${JSON.stringify(tuneNow)}: { sliders: { ${JSON.stringify(slider)}: ${sliderValue} } } }`)));
    steps.push(await step(page, idle, 'title: sliders back', apply(`s.pids = { ...(s.pids || {}) }; delete s.pids[${JSON.stringify(tuneNow)}]`)));
    steps.push(await step(page, idle, 'title: angle mode', apply("s.flightMode = 'angle'")));
    steps.push(await step(page, idle, 'title: acro mode', apply("s.flightMode = 'acro'")));
    steps.push(await step(page, idle, 'title: link elrs150', apply("s.link = 'elrs150'")));
    steps.push(await step(page, idle, 'title: camera angle 99 and fov 110', apply('s.cameraAngle = 99; s.cameraFov = 110')));
    const seatOf = (o) => ({ airframe: o.airframe, tune: o.tune, packVoltage: o.packVoltage, cameraFov: o.cameraFov, cameraAngle: o.cameraAngle });
    steps.push(await step(page, idle, 'title: seven inch', apply(`Object.assign(s, ${JSON.stringify(seatOf(seven))})`), 30));
    await page.until(`window.__tune().id === ${JSON.stringify(seven.tune)}`, 60000).catch(() => {});
    steps.push(await step(page, idle, 'title: after the seven inch tune swap', '0'));
    steps.push(await step(page, idle, 'title: interceptor again', apply(`Object.assign(s, ${JSON.stringify(seatOf(seat))})`), 30));
    await page.until(`window.__tune().id === ${JSON.stringify(seat.tune)}`, 60000).catch(() => {});

    /* Into flight, parked on the spawn, as scripts/stand-fault-check.js
     * puts a pilot before a launch. */
    await page.evaluate(`(async () => {
      window.__crashThrow({ fresh: true, x: 0, y: 300, z: 0, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0 });
      for (let i = 0; i < 10; i += 1) await new Promise((r) => requestAnimationFrame(r));
      const sp = window.__map().spawn;
      window.__respawn(sp.x, sp.z, 0);
      for (let i = 0; i < 30; i += 1) await new Promise((r) => requestAnimationFrame(r));
    })()`);
    await page.evaluate('(window.__calls.log = [], true)');
    await frames(page, 40);
    for (const c of await page.evaluate('window.__calls.log')) {
      idle.add(c[0]);
    }
    steps.push(await step(page, idle, 'flight: weight 120', apply('s.weight = 120')));
    steps.push(await step(page, idle, 'flight: weight 100', apply('s.weight = 100')));
    steps.push(await step(page, idle, 'flight: pack voltage waits for the next run', apply('s.packVoltage = 4.2')));
    steps.push(await step(page, idle, 'flight: roll srate -5', apply('s.rates = JSON.parse(JSON.stringify(s.rates)); s.rates.roll.srate -= 5')));
    steps.push(await step(page, idle, 'flight: launch control held', '(window.__calls.lc = 1, true)'));
    steps.push(await step(page, idle, 'flight: launch control released', '(window.__calls.lc = 3, true)'));
    steps.push(await step(page, idle, 'flight: launch control idle', '(window.__calls.lc = 0, true)'));
    steps.push(await step(page, idle, 'flight: launch control from the module', '(window.__calls.lc = null, true)'));
    steps.push(await step(page, idle, `flight: ${slider} slider resets the run`, apply(`s.pids = { ...(s.pids || {}), ${JSON.stringify(seat.tune)}: { sliders: { ${JSON.stringify(slider)}: ${sliderValue} } } }`)));

    steps.push(await step(page, idle, 'back to the title', "(window.__ui.onAction('title'), true)", 20));

    /* A world swap, from the title. */
    const home = await page.evaluate('window.__map().id');
    const away = home === 'alps' ? 'swiss2' : 'alps';
    await page.evaluate('(window.__calls.log = [], true)');
    /* __setMap leaves the title's own world and swaps through swapMap. */
    await page.evaluate(`(window.__setMap(${JSON.stringify(away)}), true)`);
    await page.until(`window.__map().id === ${JSON.stringify(away)} && window.__map().ready && window.__craftState().mode === 'title'`, 400000).catch(async (e) => {
      throw new Error(`${e.message}: ${await page.evaluate("JSON.stringify({ map: window.__map().id, ready: window.__map().ready, mode: window.__craftState().mode, want: window.__ui.settings.map, screen: window.__ui.screen })")}`);
    });
    await frames(page, 12);
    const swapCalls = squeeze((await page.evaluate('window.__calls.log')).filter((c) => !idle.has(c[0])));
    await page.evaluate('(window.__calls.log = null, true)');
    steps.push({ name: `world swap to ${away}`, calls: swapCalls, probes: await page.evaluate(PROBES), screen: await page.evaluate('window.__ui.screen') });
    const errors = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED|Failed to load resource/.test(e));
    return { steps, errors };
  } finally {
    await page.close();
  }
}

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

/* Two runs into one record: what agreed exactly, the rest as its type. */
function merge(a, b) {
  if (JSON.stringify(a) === JSON.stringify(b)) {
    return a;
  }
  if (typeOf(a) !== typeOf(b)) {
    return { $unstable: true };
  }
  if (Array.isArray(a)) {
    return a.length === b.length ? a.map((v, i) => merge(v, b[i])) : { $type: 'array' };
  }
  if (typeOf(a) === 'object') {
    const out = {};
    for (const k of Object.keys(a)) {
      if (k in b) {
        out[k] = merge(a[k], b[k]);
      }
    }
    return out;
  }
  return { $type: typeOf(a) };
}

/* Every difference between a record and a fresh run, as paths. */
function differences(rec, got, path, out) {
  if (rec && typeof rec === 'object' && !Array.isArray(rec) && (rec.$type || rec.$unstable)) {
    if (rec.$type && typeOf(got) !== rec.$type) {
      out.push(`${path}: was a ${rec.$type}, now ${typeOf(got)}`);
    }
    return out;
  }
  if (Array.isArray(rec)) {
    if (!Array.isArray(got) || got.length !== rec.length) {
      out.push(`${path}: ${rec.length} entries recorded, ${Array.isArray(got) ? got.length : typeOf(got)} now`);
      return out;
    }
    rec.forEach((v, i) => differences(v, got[i], `${path}[${i}]`, out));
    return out;
  }
  if (rec && typeof rec === 'object') {
    if (!got || typeof got !== 'object') {
      out.push(`${path}: an object recorded, ${typeOf(got)} now`);
      return out;
    }
    for (const k of Object.keys(rec)) {
      if (!(k in got)) {
        out.push(`${path}.${k}: gone`);
      } else {
        differences(rec[k], got[k], `${path}.${k}`, out);
      }
    }
    return out;
  }
  if (rec !== got) {
    out.push(`${path}: ${JSON.stringify(rec)} recorded, ${JSON.stringify(got)} now`);
  }
  return out;
}

let failed = 0;
try {
  if (recording) {
    const runs = [];
    for (let i = 0; i < RECORD_RUNS; i += 1) {
      const run = await oneRun();
      if (run.errors.length) {
        throw new Error(`page errors while recording: ${run.errors.slice(0, 3).join(' | ')}`);
      }
      runs.push(run.steps);
      console.log(`  run ${i + 1}: ${run.steps.length} steps, ${run.steps.reduce((n, s) => n + s.calls.length, 0)} calls`);
    }
    const rec = runs.slice(1).reduce((acc, r) => merge(acc, r), runs[0]);
    writeFileSync(RECORD, `${JSON.stringify(rec, null, 1)}\n`);
    const loose = JSON.stringify(rec).match(/"\$(type|unstable)"/g) || [];
    console.log(`  recorded ${rec.length} steps to ${RECORD}, ${loose.length} values kept as types only`);
  } else {
    const rec = JSON.parse(readFileSync(RECORD, 'utf8'));
    const run = await oneRun();
    if (rec.length !== run.steps.length) {
      failed += 1;
      console.log(`  FAIL  ${rec.length} steps recorded, ${run.steps.length} run`);
    }
    rec.forEach((r, i) => {
      const got = run.steps[i];
      const diffs = got ? differences(r, got, '', []) : ['missing'];
      if (diffs.length) {
        failed += 1;
      }
      const calls = got ? got.calls.length : 0;
      console.log(`  ${diffs.length ? 'FAIL' : 'ok  '}  ${r.name}: ${calls} calls${diffs.length ? `\n        ${diffs.slice(0, 6).join('\n        ')}` : ''}`);
    });
    if (run.errors.length) {
      failed += 1;
      console.log(`  FAIL  page errors: ${run.errors.slice(0, 3).join(' | ')}`);
    }
  }
} catch (e) {
  failed += 1;
  console.log(`  FAIL  ${e.stack || e}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
