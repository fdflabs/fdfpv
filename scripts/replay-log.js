/*
 * replay-log.js: fly a real quad's logged sticks (a blackbox_decode CSV)
 * through the compiled module and measure what the PLANT gets wrong.
 *
 *   node scripts/replay-log.js --selftest
 *   node scripts/replay-log.js LOG.01.csv --config configs/betaflight-default.diff
 *   node scripts/replay-log.js LOG.01.csv --config x.diff --json report.json
 *   Decode a .BBL first: blackbox_decode --unit-gyro deg --unit-vbat V LOG.BBL
 *
 * The controller in the loop is Betaflight itself (the quad's own diff), so
 * any disagreement between the log's gyro and the simulated gyro is the
 * plant (src/native/plant.c). Until this tool every feel constant was set by
 * one pilot's memory (k_propwash went 0.60, 0.12, 0.30, 0.08).
 *
 * Open loop replay of the same sticks MUST diverge eventually, so the honest
 * headline is the residual over a short leading window plus the time it
 * stays inside a band (longer is a better plant). Constants should be fitted
 * against the divergence free scalars, read over windows chosen from the log:
 * hover throttle, steady rate per unit stick, and sag.
 *
 * The self test exists because a flipped stick sign would read as a tracking
 * error instead of a bug.
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
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSim, SIM_OK, simErrorName } from '../tests/lib/simmod.js';
import { ST } from '../tests/lib/replay.js';
import { parseBlackboxCsv, toBlackboxCsv } from '../tests/lib/blackbox.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEG = 180 / Math.PI;
const AXES = ['roll', 'pitch', 'yaw'];

/* About a twentieth of a race quad roll rate: wide enough for filter phase
 * and log quantisation, tight enough for a real plant error. It sets where
 * time to divergence is read. */
const BAND_DPS = 25;

function fail(msg) {
  process.stderr.write(`replay-log: ${msg}\n`);
  process.exit(1);
}

function check(code, where) {
  if (code !== SIM_OK) {
    fail(`${where} returned ${simErrorName(code)}`);
  }
}

async function freshSim() {
  return loadSim(readFileSync(path.join(root, 'dist', 'sim.wasm')));
}

function fly(sim, rows, configText, cellVoltage) {
  check(sim.init(configText), 'sim_init');
  if (cellVoltage) {
    check(sim.setCellVoltage(cellVoltage), 'sim_set_cell_voltage');
  }
  let stepped = 0;
  return rows.map((row) => {
    const tS = row.tUs / 1e6;
    const at = tS.toFixed(4);
    const code = sim.input(tS, row.rc[0], row.rc[1], row.rc[2], row.rc[3]);
    if (code !== SIM_OK) {
      fail(`sim_input at t=${at} returned ${simErrorName(code)}`);
    }
    /* Rows go in at their own timestamps with whole steps between them, so
     * batching never changes the trajectory and nothing is resampled. */
    const target = Math.round(tS * 1000);
    if (target > stepped) {
      check(sim.step(target - stepped), 'sim_step');
      stepped = target;
    }
    const { code: sc, state: s } = sim.readState();
    if (sc !== SIM_OK || !s) {
      fail(`sim_state at t=${at} returned ${simErrorName(sc)}`);
    }
    return {
      tUs: row.tUs,
      rc: row.rc,
      gyroDps: [s[ST.P] * DEG, s[ST.Q] * DEG, s[ST.R] * DEG],
      motor: null,
      rpm: [s[ST.RPM0], s[ST.RPM1], s[ST.RPM2], s[ST.RPM3]],
      vbat: s[ST.VBAT],
      amps: s[ST.AMPS],
      speed: Math.hypot(s[ST.VX], s[ST.VY], s[ST.VZ]),
      alt: s[ST.PZ],
    };
  });
}

function mean(list) {
  if (!list.length) {
    return null;
  }
  let sum = 0;
  for (const v of list) {
    sum += v;
  }
  return sum / list.length;
}

function rms(list) {
  const finite = list.filter(Number.isFinite);
  if (!finite.length) {
    return NaN;
  }
  let sum = 0;
  for (const v of finite) {
    sum += v * v;
  }
  return Math.sqrt(sum / finite.length);
}

function perAxis(lists, fn) {
  return Object.fromEntries(AXES.map((name, a) => [name, fn(lists[a])]));
}

function traceReport(rows, sim, windowMs) {
  const whole = [[], [], []];
  const win = [[], [], []];
  let divergedUs = null;
  sim.forEach((s, i) => {
    const real = rows[i].gyroDps;
    if (!real) {
      return;
    }
    let worst = 0;
    for (let a = 0; a < 3; a += 1) {
      const e = s.gyroDps[a] - real[a];
      whole[a].push(e);
      if (s.tUs <= windowMs * 1000) {
        win[a].push(e);
      }
      worst = Math.max(worst, Math.abs(e));
    }
    if (divergedUs == null && worst > BAND_DPS) {
      divergedUs = s.tUs;
    }
  });
  return {
    windowMs,
    trackBandDps: BAND_DPS,
    windowRmsDps: perAxis(win, rms),
    wholeRmsDps: perAxis(whole, rms),
    divergedAtS: divergedUs == null ? null : divergedUs / 1e6,
  };
}

function isHover(row) {
  const g = row.gyroDps;
  return g && g.every((v) => Math.abs(v) < 30) && Math.abs(row.rc[0]) < 0.05 && Math.abs(row.rc[1]) < 0.05
    && row.rc[3] > 0.05;
}

function steadyRates(rows, sim, ch) {
  const real = [];
  const simulated = [];
  let start = -1;
  let sign = 0;
  rows.forEach((row, i) => {
    const s = row.rc[ch];
    const held = Math.abs(s) > 0.4 && (sign === 0 || Math.sign(s) === sign);
    if (!held) {
      start = -1;
      sign = 0;
      return;
    }
    if (start < 0) {
      start = i;
      sign = Math.sign(s);
      return;
    }
    /* Skip the first 120 ms of a held stick: the rate is still building. */
    if ((row.tUs - rows[start].tUs) / 1000 > 120 && row.gyroDps) {
      real.push(row.gyroDps[ch] / s);
      simulated.push(sim[i].gyroDps[ch] / s);
    }
  });
  return { real, simulated };
}

function extreme(values, pick) {
  return values.length ? values.reduce((m, v) => pick(m, v)) : null;
}

function segmentReport(log, sim) {
  const out = {};
  const hover = log.rows.filter(isHover).map((row) => row.rc[3]);
  out.hoverThrottleCommanded = hover.length > 50 ? mean(hover) : null;
  out.hoverSamples = hover.length;
  AXES.forEach((axis, ch) => {
    const { real, simulated } = steadyRates(log.rows, sim, ch);
    out[`${axis}RatePerStickReal`] = mean(real);
    out[`${axis}RatePerStickSim`] = mean(simulated);
    out[`${axis}RateSamples`] = real.length;
  });
  if (log.meta.hasVbat) {
    /* The plant solves sag from r_cell in closed form, so a slope
     * disagreement here is r_cell. */
    const realVbat = log.rows.map((row) => row.vbat).filter(Number.isFinite);
    out.vbatMinReal = extreme(realVbat, Math.min);
    out.vbatMaxReal = extreme(realVbat, Math.max);
    out.vbatMinSim = extreme(sim.map((s) => s.vbat), Math.min);
    out.vbatMaxSim = extreme(sim.map((s) => s.vbat), Math.max);
    out.ampsPeakSim = extreme(sim.map((s) => s.amps), Math.max);
  }
  return out;
}

function scalarLine(label, v, unit = '') {
  if (v == null || Number.isNaN(v)) {
    return;
  }
  console.log(`  ${label.padEnd(26)} ${typeof v === 'number' ? v.toFixed(3) : v}${unit}`);
}

function printReport(csvPath, configPath, meta, cell, trace, seg) {
  console.log(`log            ${csvPath}`);
  console.log(`config         ${configPath}`);
  console.log(`rows           ${meta.count} over ${meta.durationS.toFixed(2)} s at ${meta.rateHz.toFixed(0)} Hz`);
  console.log(`gyro source    ${meta.gyro}`);
  if (meta.gyroIsFiltered) {
    console.log('               (filtered: carries the tune\'s group delay on the real side.');
    console.log('                fly a log with debug_mode = GYRO_SCALED for a cleaner plant read)');
  }
  console.log(`pack start     ${cell ? `${(cell * 6).toFixed(2)} V, ${cell.toFixed(3)} V/cell` : 'not logged, using config default'}`);
  console.log('');
  console.log(`gyro residual, first ${trace.windowMs} ms, deg/s RMS`);
  for (const axis of AXES) {
    console.log(`  ${axis.padEnd(6)} ${trace.windowRmsDps[axis].toFixed(2).padStart(8)}`);
  }
  const w = trace.wholeRmsDps;
  console.log(`whole log RMS  roll ${w.roll.toFixed(1)}, pitch ${w.pitch.toFixed(1)}, yaw ${w.yaw.toFixed(1)} deg/s`);
  const stayed = trace.divergedAtS == null ? 'the whole log' : `${trace.divergedAtS.toFixed(3)} s`;
  console.log(`stayed inside +-25 deg/s for  ${stayed}`);
  console.log('  (open loop replay diverges eventually and is SUPPOSED to.');
  console.log('   A longer time here is a better plant. Watch it across a change.)');
  console.log('');
  console.log('divergence free scalars');
  scalarLine('hover throttle (logged)', seg.hoverThrottleCommanded);
  for (const axis of AXES) {
    scalarLine(`${axis} deg/s per stick real`, seg[`${axis}RatePerStickReal`]);
    scalarLine(`${axis} deg/s per stick sim`, seg[`${axis}RatePerStickSim`]);
  }
  scalarLine('vbat min real', seg.vbatMinReal, ' V');
  scalarLine('vbat min sim', seg.vbatMinSim, ' V');
  scalarLine('amps peak sim', seg.ampsPeakSim, ' A');
}

/* Every axis in both directions plus throttle, so a sign error cannot hide
 * in an unexercised axis. */
const SCRIPT = [
  [400, [0, 0, 0, 0.35]],
  [300, [0.6, 0, 0, 0.45]],
  [300, [-0.6, 0, 0, 0.45]],
  [300, [0, 0.5, 0, 0.45]],
  [300, [0, -0.5, 0, 0.45]],
  [300, [0, 0, 0.7, 0.45]],
  [300, [0, 0, -0.7, 0.45]],
  [400, [0.3, 0.3, 0.2, 0.85]],
];

function scriptRows(hz) {
  const dt = 1e6 / hz;
  const rows = [];
  let tUs = 0;
  for (const [ms, rc] of SCRIPT) {
    for (let k = Math.round((ms / 1000) * hz); k > 0; k -= 1) {
      rows.push({ tUs, rc: [...rc] });
      tUs += dt;
    }
  }
  return rows;
}

function worstDiff(a, b, width) {
  let worst = 0;
  for (let i = 0; i < a.length; i += 1) {
    for (let c = 0; c < width; c += 1) {
      worst = Math.max(worst, Math.abs(a[i][c] - b[i][c]));
    }
  }
  return worst;
}

async function selftest(configText) {
  const script = scriptRows(250);
  const flown = fly(await freshSim(), script, configText);
  const csv = toBlackboxCsv(flown.map((s, i) => ({
    tUs: s.tUs, rc: script[i].rc, gyroDps: s.gyroDps, motor: null, vbat: s.vbat,
  })));
  const parsed = parseBlackboxCsv(csv);
  const again = fly(await freshSim(), parsed.rows, configText);
  const worstGyro = worstDiff(again.map((s) => s.gyroDps), flown.map((s) => s.gyroDps), 3);
  const worstRc = worstDiff(parsed.rows.map((r) => r.rc), script.map((r) => r.rc), 4);
  const rcOk = worstRc < 1e-9;
  const gyroOk = worstGyro < 1e-9;
  const mark = (ok) => (ok ? 'ok' : 'FAIL');
  console.log('replay-log selftest: fly a script, write it as blackbox CSV, read it back, fly it again');
  console.log(`  rows                 ${parsed.rows.length}`);
  console.log(`  parsed rate          ${parsed.meta.rateHz.toFixed(1)} Hz`);
  console.log(`  gyro column          ${parsed.meta.gyro}`);
  console.log(`  worst stick error    ${worstRc.toExponential(2)}   ${mark(rcOk)}`);
  console.log(`  worst gyro error     ${worstGyro.toExponential(2)} deg/s   ${mark(gyroOk)}`);
  if (!rcOk || !gyroOk) {
    console.error('\n  A non zero residual here is a HARNESS bug, not a plant one: the same');
    console.error('  module flew the same sticks twice. Suspect the channel conventions in');
    console.error('  tests/lib/blackbox.js, the pitch sign first.');
    process.exit(1);
  }
  console.log('');
  console.log('  Conventions round trip exactly. A residual against a REAL log is plant error.');
}

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
}

const configPath = flag('config', path.join(root, 'configs', 'betaflight-default.diff'));
const configText = readFileSync(path.resolve(configPath), 'utf8');

if (args.includes('--selftest')) {
  await selftest(configText);
} else {
  const VALUED = ['--config', '--json', '--window'];
  const csvPath = args.find((a) => !a.startsWith('--') && !VALUED.includes(args[args.indexOf(a) - 1]));
  if (!csvPath) {
    fail('give a blackbox_decode CSV, or --selftest. See the header of this file.');
  }
  const log = parseBlackboxCsv(readFileSync(csvPath, 'utf8'));
  if (!log.rows[0].gyroDps) {
    fail('that log has no gyro columns, so there is nothing to compare against');
  }
  const windowMs = Number(flag('window', '500'));
  const v0 = log.rows[0].vbat;
  /* A 6S pack is assumed: the log carries pack volts, the module takes a cell. */
  const cell = log.meta.hasVbat && Number.isFinite(v0) && v0 > 0 ? v0 / 6 : null;
  const sim = fly(await freshSim(), log.rows, configText, cell);
  const trace = traceReport(log.rows, sim, windowMs);
  const segments = segmentReport(log, sim);
  printReport(csvPath, configPath, log.meta, cell, trace, segments);
  const jsonPath = flag('json');
  if (jsonPath) {
    writeFileSync(path.resolve(jsonPath), `${JSON.stringify({ meta: log.meta, trace, segments }, null, 2)}\n`);
    console.log('');
    console.log(`wrote ${jsonPath}`);
  }
}
