/*
 * fc-trace.js: proves against the compiled module (dist/sim.wasm) which
 * Betaflight keys are LIVE (change the flight), INERT (change nothing) and
 * GATED (Betaflight itself refuses them at our 1 kHz loop), and that the
 * rates policy, the CLI helpers and the JS rate-curve preview agree with
 * the firmware. Run with npm run lint:fc.
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

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RATE_DEFAULTS, RATE_TYPES, normaliseRates, ratesDiff, ratesSummary } from '../configs/rates.js';
import { TUNES } from '../configs/registry.js';
import {
  RATES_DUMP, RATES_KEEP, composeConfig, dumpCarriesRates, expandRpmWeights, exportCli, featureEnabled,
  moduleDump, moduleGet, ratesFromDump, setCliValue, setFeatureLine,
} from '../src/fc/dump.js';
import { angleRateDeg } from '../src/fc/ratescurve.js';
import { must, sha256Hex } from '../tests/lib/replay.js';
import { loadSim, SIM_OK, simErrorName } from '../tests/lib/simmod.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasm = await readFile(join(root, 'dist', 'sim.wasm'));
const readText = (rel) => readFile(join(root, rel), 'utf8');

const results = [];
const record = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail: String(detail) });

function appendLine(text, line) {
  return `${text.endsWith('\n') ? text : `${text}\n`}${line}\n`;
}

async function freshSim() {
  const sim = await loadSim(wasm);
  if (typeof sim.e.sim_bf_dump !== 'function') {
    throw new Error('sim.wasm does not export sim_bf_dump; rebuild with npm run build:wasm');
  }
  return sim;
}

async function bootedSim(config, label) {
  const sim = await freshSim();
  must(sim.init(config), label);
  return sim;
}

/* Every hash uses a fresh module instance: a second sim_init on one instance
 * is not a power-on, so two traces from one instance need not agree. */
async function traceHash(config) {
  const sim = await freshSim();
  const code = sim.init(config);
  if (code !== SIM_OK) {
    throw new Error(`sim_init returned ${simErrorName(code)}`);
  }
  /* init plants vbat from 4.2 V and setCellVoltage writes only the OC field,
   * so the reset makes every trace start on the same 4.0 V pack. */
  must(sim.setCellVoltage(4.0), 'sim_set_cell_voltage');
  must(sim.reset(), 'sim_reset');
  const captures = [];
  const capture = () => {
    const { code: c, bytes } = sim.readStateBytes();
    must(c, 'sim_state');
    captures.push(bytes);
  };
  capture();
  /* Hover alone cannot move roll_srate; the roll pulse makes stick-authority
   * keys visible in the trace. */
  for (let t = 0; t < 700; t += 1) {
    const roll = t >= 200 && t < 500 ? 0.35 : 0;
    must(sim.input(t / 1000, roll, 0, 0, 0.26), 'sim_input');
    must(sim.step(1), 'sim_step');
    if ((t + 1) % 10 === 0) {
      capture();
    }
  }
  return sha256Hex(captures);
}

const defaultDiff = await readText('configs/betaflight-default.diff');
const base = composeConfig(defaultDiff, RATE_DEFAULTS, RATES_KEEP);

/* F3: determinism and the dump round trip. */
const h1 = await traceHash(base);
const h2 = await traceHash(base);
record('F3 base repeat', h1 === h2, `${h1}  vs  ${h2}`);

const dumped = moduleDump(await bootedSim(base, 'init base'));
const setCount = dumped.split('\n').filter((line) => line.startsWith('set ')).length;
const shaped = dumped.includes('set p_roll =');
record('F3 dump shape', shaped, shaped ? `${setCount} set lines` : 'WASM dump has no set p_roll line');

const hr = await traceHash(dumped);
record('F3 round-trip', h1 === hr, `base ${h1}  dump ${hr}`);

/* F4: LIVE keys must move the trace. The default tune runs dyn LPF, so the
 * static cutoff is only the live filter once dyn_min_hz is 0. */
const lpfOff = appendLine(base, 'set gyro_lpf1_dyn_min_hz = 0');
const livePairs = [
  ['F4 LIVE p_roll', base, appendLine(base, 'set p_roll = 80')],
  ['F4 LIVE gyro_lpf1_static_hz',
    appendLine(lpfOff, 'set gyro_lpf1_static_hz = 250'), appendLine(lpfOff, 'set gyro_lpf1_static_hz = 100')],
  ['F4 LIVE roll_srate', base, appendLine(base, 'set roll_srate = 42')],
  ['F4 LIVE rpm_filter_harmonics', base, appendLine(base, 'set rpm_filter_harmonics = 0')],
  ['F4 LIVE feature -AIRMODE', base, appendLine(base, 'feature -AIRMODE')],
];
for (const [name, a, b] of livePairs) {
  const ha = await traceHash(a);
  const hb = await traceHash(b);
  record(name, ha !== hb, `${ha}  vs  ${hb}`);
}

const hi = await traceHash(appendLine(base, 'set osd_rssi_pos = 123'));
record('F5 INERT osd_rssi_pos', hi === h1, `base ${h1}  inert ${hi}`);

/* Betaflight's dyn_notch_filter.c will not arm below 2 kHz
 * (DYN_NOTCH_UPDATE_MIN_HZ), so at our 1 kHz loop the count changes nothing.
 * Never stub a notch in JS to make this look live. */
const h0 = await traceHash(appendLine(base, 'set dyn_notch_count = 0'));
const h3 = await traceHash(appendLine(base, 'set dyn_notch_count = 3'));
record('F6 GATED dyn_notch_count 0 vs 3 at 1 kHz', h0 === h3, `0 ${h0}  3 ${h3}`);

/* F7: the rates policy decides who owns stick authority. */
async function moduleValue(config, key) {
  return moduleGet(await bootedSim(config, `init for ${key}`), key);
}

const dirty = appendLine(defaultDiff, 'set roll_srate = 42');
const keepV = await moduleValue(composeConfig(dirty, RATE_DEFAULTS, RATES_KEEP), 'roll_srate');
record('F7 keep-mine roll_srate', keepV === '67', `module roll_srate=${keepV} (want 67 from menu, not 42 from dump)`);
const dumpV = await moduleValue(composeConfig(dirty, RATE_DEFAULTS, RATES_DUMP), 'roll_srate');
record('F7 use-dump roll_srate', dumpV === '42', `module roll_srate=${dumpV} (want 42 from dump)`);

/* Iterate the registry, not a named file, so a new tune is checked the day
 * it lands. */
const tuneTexts = new Map();
for (const { id } of TUNES) {
  tuneTexts.set(id, await readText(`configs/${id}.diff`));
}
for (const [id, text] of tuneTexts) {
  const v = await moduleValue(composeConfig(text, RATE_DEFAULTS, RATES_KEEP), 'roll_srate');
  record(`F7 ${id} keep-mine roll_srate`, v === '67',
    `module roll_srate=${v} (want 67; a shipped tune must not steal stick authority)`);
}

const split = [
  'set p_roll = 45', 'set rates_type = BETAFLIGHT', 'set roll_rc_rate = 100',
  'set roll_srate = 67', 'set pitch_srate = 42', 'set yaw_srate = 55', '',
].join('\n');
const mine = ratesFromDump(split);
const splitSim = await bootedSim(composeConfig('set p_roll = 80\n', mine, RATES_KEEP), 'init split');
const [sp, st, sr] = ['pitch_srate', 'rates_type', 'roll_srate'].map((key) => moduleGet(splitSim, key));
record('F7 keep-mine holds pitch_srate and rates_type', sp === '42' && st === 'BETAFLIGHT' && sr === '67',
  `pitch_srate=${sp} rates_type=${st} roll_srate=${sr}`);

const cli = ratesDiff(mine);
record('F7 the profile round trips its own type',
  /set rates_type = BETAFLIGHT/.test(cli) && /set pitch_srate = 42/.test(cli) && /set roll_rc_rate = 100/.test(cli),
  `type ${cli.match(/rates_type = (\w+)/)?.[1]} pitch ${cli.match(/pitch_srate = (\d+)/)?.[1]}`);

const summary = ratesSummary(mine);
record('F13 summary reads the profile in deg/s', summary === 'Classic, 606 roll, 345 pitch, 444 yaw deg/s', summary);

/* RC Rate 1.00 stays the firmware's uint8 100, not read as 1000 deg/s. */
const bf = ratesFromDump(['set rates_type = BETAFLIGHT', 'set roll_rc_rate = 100', 'set roll_srate = 70', ''].join('\n'));
record('F7 BETAFLIGHT rc_rate stays the firmware uint8',
  bf.type === 'BETAFLIGHT' && bf.roll.rcRate === 100 && bf.roll.srate === 70,
  `type=${bf.type} rc=${bf.roll.rcRate} srate=${bf.roll.srate}`);

const junk = normaliseRates({ type: 'NONSENSE', roll: { rcRate: 250, srate: 250, expo: 250 } });
record('F7 an unknown rates type falls back whole',
  junk.type === RATE_DEFAULTS.type && junk.roll.srate === RATE_DEFAULTS.roll.srate,
  `type=${junk.type} srate=${junk.roll.srate}`);

/* F15: the preview drawing against the module's setpoint. Tolerance is the
 * gates.config.json P2 bar; the preview is f64, the firmware f32. */
const PREVIEW_TOLERANCE = 0.1;
const PREVIEW_PROFILES = {
  BETAFLIGHT: { roll: [118, 73, 15], pitch: [90, 55, 30], yaw: [130, 40, 0] },
  RACEFLIGHT: { roll: [37, 80, 50], pitch: [45, 60, 25], yaw: [30, 90, 10] },
  KISS: { roll: [110, 70, 20], pitch: [95, 50, 40], yaw: [120, 30, 0] },
  ACTUAL: { roll: [7, 67, 0], pitch: [12, 90, 35], yaw: [5, 45, 20] },
  QUICK: { roll: [100, 67, 10], pitch: [80, 120, 40], yaw: [60, 50, 0] },
};
/* Pitch and yaw invert on their way into the setpoint: bf_glue.c sets
 * rcData[PITCH] = 1500 - 500*pitch, and rc.c applies -GET_DIRECTION to yaw. */
const PREVIEW_AXES = [
  { axis: 'roll', slot: 5, stick: (x) => x },
  { axis: 'pitch', slot: 8, stick: (x) => -(0.7 * x) },
  { axis: 'yaw', slot: 0, stick: (x) => -(-0.4 * x) },
];
const axisObj = ([rcRate, srate, expo]) => ({ rcRate, srate, expo });

let worst = 0;
let worstAt = '';
let previewOk = true;
for (const type of RATE_TYPES) {
  const p = PREVIEW_PROFILES[type];
  const profile = normaliseRates({ type, roll: axisObj(p.roll), pitch: axisObj(p.pitch), yaw: axisObj(p.yaw) });
  /* Smoothing off: the module's setpoint debug is smoothed, the drawing is raw. */
  const text = appendLine(composeConfig(defaultDiff, profile, RATES_KEEP), 'set rc_smoothing = OFF');
  const sim = await bootedSim(text, `init preview ${type}`);
  const got = moduleGet(sim, 'rates_type');
  if (got !== type) {
    previewOk = false;
    worstAt = `${type} did not reach the module (${got})`;
    continue;
  }
  let tMs = 0;
  for (let k = -20; k <= 20; k += 1) {
    const x = k / 20;
    must(sim.input(tMs / 1000, x, 0.7 * x, -0.4 * x, 0.3), 'sim_input');
    /* Hold a few ms: the setpoint is read after the RC frame carrying this
     * stick has been consumed. */
    must(sim.step(8), 'sim_step');
    tMs += 8;
    for (const { axis, slot, stick } of PREVIEW_AXES) {
      const eff = stick(x);
      const want = angleRateDeg(type, { ...profile[axis], limit: 1998 }, eff);
      const have = sim.e.sim_bf_debug(slot);
      const err = Math.abs(have - want);
      if (err > worst) {
        worst = err;
        worstAt = `${type} ${axis} stick ${eff.toFixed(2)} module ${have.toFixed(3)} preview ${want.toFixed(3)}`;
      }
      if (err > PREVIEW_TOLERANCE) {
        previewOk = false;
      }
    }
  }
}
record('F15 preview matches the module on all five rate types', previewOk,
  `worst |err| ${worst.toFixed(4)} deg/s at ${worstAt}`);

/* A key spelled the struct way, not the CLI way, lands as unknown and
 * changes nothing while the curve checks still pass; gates.js once wrote
 * rc_smoothing_mode. */
const SLOT_UNKNOWN = 15;
const menuBad = [];
for (const type of RATE_TYPES) {
  const profile = normaliseRates({ type, throttleCap: 60 });
  const sim = await bootedSim(composeConfig(defaultDiff, profile, RATES_KEEP), `init menu ${type}`);
  const unknown = sim.e.sim_bf_debug(SLOT_UNKNOWN);
  const quick = moduleGet(sim, 'quickrates_rc_expo');
  const limit = `${moduleGet(sim, 'throttle_limit_type')} ${moduleGet(sim, 'throttle_limit_percent')}`;
  if (unknown !== 0 || quick !== 'OFF' || limit !== 'SCALE 60') {
    menuBad.push(`${type} unknown=${unknown} quickrates=${quick} limit=${limit}`);
  }
}
record('F16 every key the rates menu writes is recognised', menuBad.length === 0,
  menuBad.length === 0 ? 'unknown 0, quickrates_rc_expo OFF, throttle limit SCALE 60, on all five types' : menuBad.join('; '));

const actualAxis = { rcRate: 10, srate: 50, expo: 0, limit: 1998 };
const maxVel = angleRateDeg('ACTUAL', actualAxis, 1);
record('F14 Actual preview max vel is srate times 10', Math.round(maxVel) === 500, `max vel ${maxVel}`);
const centre = angleRateDeg('ACTUAL', actualAxis, 0);
record('F14 Actual preview is zero at centre stick', centre === 0, `centre stick ${centre}`);

/* F10: simplified tuning sliders and expert edits. */
const APPLY = 'simplified_tuning apply';
const slid = setCliValue('set p_roll = 45\nset simplified_d_gain = 70\n', 'simplified_d_gain', '90');
const applyLast = slid.trim().endsWith(APPLY);
const applyCount = slid.split(APPLY).length - 1;
record('F10 setCliValue slider inserts apply last',
  applyLast && applyCount === 1 && /set simplified_d_gain = 90/.test(slid), applyLast ? 'apply is last line' : slid);

const expertLines = setCliValue(slid, 'p_roll', '80').trim().split('\n');
const applyAt = expertLines.indexOf(APPLY);
const pRollAt = expertLines.findIndex((line) => line.startsWith('set p_roll ='));
record('F10 setCliValue expert sits below apply',
  applyAt >= 0 && pRollAt > applyAt && expertLines[pRollAt] === 'set p_roll = 80', `apply@${applyAt} p_roll@${pRollAt}`);

/* F12: rpm_filter_weights travels as one line and comes back as three. */
const oneLine = (text) => text.trim().split('\n').join(' | ');
const weights = [
  'set rpm_filter_weights_1 = 100', 'set rpm_filter_weights_2 = 50', 'set rpm_filter_weights_3 = 0',
  'set p_roll = 45', '',
].join('\n');
const exported = exportCli(weights);
record('F12 exportCli rewrites rpm_filter_weights',
  /set rpm_filter_weights = 100,50,0/.test(exported)
    && ['_1', '_2', '_3'].every((n) => !exported.includes(`rpm_filter_weights${n}`)),
  oneLine(exported));
const expanded = expandRpmWeights(exported);
record('F12 expandRpmWeights restores _1 _2 _3',
  /set rpm_filter_weights_1 = 100/.test(expanded) && /set rpm_filter_weights_2 = 50/.test(expanded)
    && /set rpm_filter_weights_3 = 0/.test(expanded) && !/set rpm_filter_weights =/.test(expanded),
  oneLine(expanded));

const stock = composeConfig(defaultDiff, RATE_DEFAULTS, RATES_KEEP);
const stockSim = await bootedSim(stock, 'init stock');
const p0 = moduleGet(stockSim, 'p_roll');
const edited = setCliValue(moduleDump(stockSim), 'simplified_pi_gain', '120');
const p1 = await moduleValue(composeConfig(edited, RATE_DEFAULTS, RATES_DUMP), 'p_roll');
record('F10 slider apply moves p_roll', p0 != null && p1 != null && p0 !== p1 && edited.includes(APPLY),
  `p_roll ${p0} -> ${p1} after simplified_pi_gain 120`);

/* F8: no shipped tune carries a rateprofile, so none can steal the menu's rates. */
const carriers = [...tuneTexts].filter(([, text]) => dumpCarriesRates(text) !== false).map(([id]) => id);
record('F8 dumpCarriesRates is false on every shipped tune (no rateprofile)', carriers.length === 0,
  carriers.length > 0 ? `carries rates: ${carriers.join(', ')}` : `no rate keys across ${TUNES.length} shipped tunes`);
record('F8 dumpCarriesRates is true when a dump has roll_srate',
  dumpCarriesRates(appendLine(defaultDiff, 'set roll_srate = 42')) === true, 'roll_srate present');

const airOff = setFeatureLine(base, 'AIRMODE', false);
const airState = featureEnabled(airOff, 'AIRMODE');
record('F4 feature line writes feature -AIRMODE', airState === false && /feature -AIRMODE/.test(airOff),
  airState == null ? 'unset' : 'off');

const width = Math.max(...results.map((r) => r.name.length));
const passed = results.filter((r) => r.ok).length;
console.log('fc-trace: LIVE / INERT / GATED / rates against compiled Betaflight\n');
for (const r of results) {
  console.log(`${r.ok ? ' ok ' : 'FAIL'}  ${r.name.padEnd(width)}  ${r.detail}`);
}
console.log(`\n${passed} of ${results.length} traces clean`);
process.exit(passed === results.length ? 0 : 1);
