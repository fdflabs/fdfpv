/*
 * checks.js: the Stage 1 verification checks, STAGE1.md's thirteen and the
 * three the shell grew since (the audio bed, world scale, map isolation).
 * Node only; tests/verify.js is the runner.
 *
 * A check is { num, id, thresholdText, run(ctx) } and run resolves to
 * { measured, pass, reason } (check 1 adds skipped when the toolchain is
 * not on the machine). Every band and method constant is read from
 * ctx.th, which is tests/thresholds.json; nothing numeric lives here. The
 * sim checks drive dist/sim.wasm through tests/lib/replay.js and let a
 * SimError propagate, because the runner prints it by name and that is
 * how an unimplemented module reads as sixteen named failures and not one
 * crash. The browser checks read what verify.js already measured through
 * ctx.browserRun, ctx.audioBedRun and ctx.scaleRun and only judge it.
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

import { SIM_OK, simErrorName } from './simmod.js';
import { SimError, must, replayTrace, runScript, ST } from './replay.js';

export { SimError };

/* Display only: the physics path never converts through JS trig. */
const RAD_TO_DEG = 180 / Math.PI;

export function parseRollSrate(diffText) {
  const line = /^set roll_srate = (\d+)\s*$/m.exec(diffText);
  if (!line) {
    throw new Error('fixture diff has no "set roll_srate" line');
  }
  return Number(line[1]);
}

/* Verdicts. A reason is only ever printed next to a FAIL. */
const ok = (measured) => ({ measured, pass: true, reason: '' });
const fail = (measured, reason) => ({ measured, pass: false, reason });
const judge = (measured, passed, reason) => (passed ? ok(measured) : fail(measured, reason));
const inside = (x, band) => x >= band.min && x <= band.max;
const banded = (measured, x, band) => judge(measured, inside(x, band), 'outside band');
const tolerated = (measured, err, tol) => judge(measured, err <= tol, 'outside tolerance');
const pct = (fraction) => (fraction * 100).toFixed(2);
const abbrev = (hash) => (hash ? hash.slice(0, 12) : 'none');
const ms = (seconds) => Math.round(seconds * 1000);

/* The sim, configured, at rest, on a fresh pack of the given cell voltage. */
async function configuredSim(ctx, diffText) {
  const sim = await ctx.freshSim();
  must(sim.init(diffText), 'sim_init');
  return sim;
}

function repack(sim, cellVoltage) {
  must(sim.reset(), 'sim_reset');
  must(sim.setCellVoltage(cellVoltage), 'sim_set_cell_voltage');
}

/* One constant stick segment; onSample(tMs, state) after every 1 ms step. */
function hold(sim, sticks, durMs, onSample, fromMs = 0) {
  return runScript(sim, [{ durMs, ...sticks }], onSample, fromMs);
}

/* Mean of a sampled quantity over the last windowMs of a totalMs hold. */
function tailMean(totalMs, windowMs) {
  let sum = 0;
  let count = 0;
  return {
    add(tMs, value) {
      if (tMs > totalMs - windowMs) {
        sum += value;
        count += 1;
      }
    },
    mean: () => sum / count,
  };
}

/*
 * The throttle that holds the craft still. Climb rate after a fixed settle
 * from rest grows with throttle, so the search halves the interval that
 * brackets zero vertical speed. NaN when full throttle still sinks or zero
 * throttle still climbs, since no throttle in 0..1 hovers then. Runs out
 * of steps at the last midpoint rather than giving up.
 */
function hoverThrottle(sim, cellVoltage, hoverTh) {
  const settleMs = ms(hoverTh.settle_s.value);
  const climbRateAt = (throttle) => {
    repack(sim, cellVoltage);
    let vz = NaN;
    hold(sim, { throttle }, settleMs, (tMs, state) => {
      vz = state[ST.VZ];
    });
    return vz;
  };
  if (climbRateAt(1) < 0 || climbRateAt(0) > 0) {
    return NaN;
  }
  const still = hoverTh.vz_tolerance_m_s.value;
  let low = 0;
  let high = 1;
  let throttle = 0.5;
  for (let step = 0; step < hoverTh.max_bisection_steps.value; step += 1) {
    throttle = (low + high) / 2;
    const vz = climbRateAt(throttle);
    if (Math.abs(vz) <= still) {
      break;
    }
    if (vz > 0) {
      high = throttle;
    } else {
      low = throttle;
    }
  }
  return throttle;
}

/*
 * Hover for settleS, then full throttle for punchS: the altitude gained
 * during the punch and the highest RPM any motor reached in it. Checks 6
 * and 11 share this so the sag comparison is the punch-out itself.
 */
function punchOut(sim, cellVoltage, hoverTrim, settleS, punchS) {
  repack(sim, cellVoltage);
  let altitudeBefore = NaN;
  let altitudeAfter = NaN;
  let peakRpm = 0;
  const tHover = hold(sim, { throttle: hoverTrim }, ms(settleS), (tMs, state) => {
    altitudeBefore = state[ST.PZ];
  });
  hold(sim, { throttle: 1 }, ms(punchS), (tMs, state) => {
    altitudeAfter = state[ST.PZ];
    peakRpm = Math.max(peakRpm, state[ST.RPM0], state[ST.RPM1], state[ST.RPM2], state[ST.RPM3]);
  }, tHover);
  return { gain: altitudeAfter - altitudeBefore, peakRpm };
}

/*
 * Full right roll at a fixed throttle: mean |p| over the last windowS of a
 * holdS stick hold, in deg/s. Checks 9 and 12 share it.
 */
function steadyRollRateDegS(sim, cellVoltage, rollTh) {
  repack(sim, cellVoltage);
  const holdMs = ms(rollTh.hold_s.value);
  const tail = tailMean(holdMs, ms(rollTh.steady_window_s.value));
  hold(sim, { throttle: rollTh.throttle.value, roll: 1 }, holdMs, (tMs, state) => {
    tail.add(tMs, Math.abs(state[ST.P]));
  });
  return tail.mean() * RAD_TO_DEG;
}

const NO_HOVER = 'hover not reachable';

async function buildClean(ctx) {
  const th = ctx.th.checks['build-clean'];
  const build = ctx.build;
  /*
   * A machine with no compiler and no sources has nothing to build and
   * nothing to diff, and a FAIL there would blame the code for the setup.
   * verify.js probes both before deciding, and the runner prints the
   * skipped text in its own column so a green run cannot hide it.
   */
  if (build.toolchainAbsent) {
    return { measured: 'not built here', pass: true, skipped: build.toolchainAbsent };
  }
  const steps = [`build exit ${build.exitCode}`];
  let fault = build.exitCode === th.build_exit_code.value ? '' : `build:wasm exited ${build.exitCode}`;
  const vendorClean = build.vendorDiff.length === th.vendor_diff_chars.value;
  steps.push(vendorClean ? 'vendor diff empty' : 'vendor diff DIRTY');
  if (!fault && !vendorClean) {
    fault = 'vendor/betaflight modified in place';
  }
  /* The module itself is only consulted once the build it came from is
   * trusted, so the first fault is the one reported. */
  if (!fault) {
    const sim = await ctx.freshSim();
    const abi = sim.abiVersion();
    steps.push(`abi ${abi}`);
    if (abi !== th.abi_version.value) {
      fault = `abi version ${abi}, expected ${th.abi_version.value}`;
    } else {
      const code = sim.init(ctx.configA);
      steps.push(`init ${simErrorName(code)}`);
      if (code !== SIM_OK) {
        fault = simErrorName(code);
      }
    }
  }
  return judge(steps.join(', '), !fault, fault);
}

async function determinismRepeat(ctx) {
  const first = await replayTrace(await ctx.freshSim(), ctx.rec, ctx.canonicalOpts());
  const second = await replayTrace(await ctx.freshSim(), ctx.rec, ctx.canonicalOpts());
  return judge(`a=${abbrev(first)} b=${abbrev(second)}`, first === second, 'hashes differ');
}

async function determinismCrossHost(ctx) {
  const nodeHash = await ctx.nodeCanonicalHash();
  const { result } = await ctx.browserRun();
  if (!result?.ok) {
    const why = result?.errorName ?? 'no result';
    return fail(`node=${abbrev(nodeHash)} chrome=${why}`, why);
  }
  return judge(
    `node=${abbrev(nodeHash)} chrome=${abbrev(result.hash)}`,
    nodeHash === result.hash,
    'hashes differ',
  );
}

async function frameIndependence(ctx) {
  const th = ctx.th.checks['frame-independence'];
  const rates = th.render_rates_hz.value;
  const hashes = new Set();
  for (const renderHz of rates) {
    hashes.add(await replayTrace(await ctx.freshSim(), ctx.rec, { ...ctx.canonicalOpts(), renderHz }));
  }
  return judge(
    `${hashes.size} distinct hash(es) across ${rates.length} rates`,
    hashes.size === th.distinct_hashes.value,
    'traces differ across render rates',
  );
}

async function hoverThrottleCheck(ctx) {
  const th = ctx.th.checks['hover-throttle'];
  const trim = hoverThrottle(await configuredSim(ctx, ctx.configA), th.cell_voltage.value, th);
  if (Number.isNaN(trim)) {
    return fail('no trim found in 0..1', NO_HOVER);
  }
  return banded(trim.toFixed(4), trim, th.band);
}

async function punchOutCheck(ctx) {
  const th = ctx.th.checks['punch-out'];
  const sim = await configuredSim(ctx, ctx.configA);
  const volts = th.cell_voltage.value;
  const trim = hoverThrottle(sim, volts, ctx.th.checks['hover-throttle']);
  if (Number.isNaN(trim)) {
    return fail('no hover trim', NO_HOVER);
  }
  const { gain } = punchOut(sim, volts, trim, th.hover_settle_s.value, th.full_throttle_s.value);
  return banded(`${gain.toFixed(1)} m`, gain, th.band_m);
}

async function terminalVelocity(ctx) {
  const th = ctx.th.checks['terminal-velocity'];
  const sim = await configuredSim(ctx, ctx.configA);
  repack(sim, th.cell_voltage.value);
  const durMs = ms(th.duration_s.value);
  const tail = tailMean(durMs, ms(th.plateau_window_s.value));
  hold(sim, { throttle: 1 }, durMs, (tMs, state) => {
    const [vx, vy, vz] = [state[ST.VX], state[ST.VY], state[ST.VZ]];
    tail.add(tMs, Math.sqrt(vx * vx + vy * vy + vz * vz));
  });
  const speed = tail.mean();
  return banded(`${speed.toFixed(1)} m/s`, speed, th.band_m_s);
}

async function motorStepResponse(ctx) {
  const th = ctx.th.checks['motor-step-response'];
  const sim = await configuredSim(ctx, ctx.configA);
  repack(sim, th.cell_voltage.value);
  /* Every motor pinned at zero, then motor 0 alone stepped to full duty:
   * the response is the ESC and motor, not the controller. */
  must(sim.motorOverride(-1, 0), 'sim_motor_override');
  const tStep = hold(sim, { throttle: 0 }, ms(th.pre_hold_s.value), null);
  must(sim.motorOverride(0, 1), 'sim_motor_override');
  const rpmAtMs = [];
  hold(sim, { throttle: 0 }, ms(th.settle_s.value), (tMs, state) => {
    rpmAtMs.push(state[ST.RPM0]);
  }, tStep);
  const finalRpm = rpmAtMs[rpmAtMs.length - 1];
  if (!(finalRpm > 0)) {
    return fail('no RPM response', 'motor never spun up');
  }
  const target = th.target_fraction.value * finalRpm;
  const reached = rpmAtMs.findIndex((rpm) => rpm >= target);
  /* Sample i is the state 1 ms after the step, plus i more. */
  const riseMs = reached < 0 ? -1 : reached + 1;
  return judge(
    `${riseMs} ms`,
    riseMs > 0 && inside(riseMs / 1000, th.band_s),
    'outside band',
  );
}

async function rateTracking(ctx) {
  const th = ctx.th.checks['rate-tracking'];
  const configured = parseRollSrate(ctx.configA) * th.actual_srate_to_deg_s.value;
  const rate = steadyRollRateDegS(await configuredSim(ctx, ctx.configA), th.cell_voltage.value, th);
  const err = Math.abs(rate - configured) / configured;
  return tolerated(
    `${rate.toFixed(1)} deg/s vs ${configured} configured (${pct(err)} percent off)`,
    err,
    th.tolerance_fraction.value,
  );
}

async function yawCoupling(ctx) {
  const th = ctx.th.checks['yaw-coupling'];
  const sim = await configuredSim(ctx, ctx.configA);
  repack(sim, th.cell_voltage.value);
  const dt = 1 / ctx.th.physics.step_hz.value;
  let heading = 0;
  hold(sim, { throttle: th.throttle.value, roll: 1 }, ms(th.roll_hold_s.value), (tMs, state) => {
    heading += state[ST.R] * dt;
  });
  const drift = heading * RAD_TO_DEG;
  /*
   * Banded both ways. A symmetric QUADX cancels roll to yaw coupling
   * exactly, so what the plant shows is its modelled build tolerance: the
   * floor notices that model going missing, the cap notices it inflated,
   * and the sign is the convention PROGRESS.md argues.
   */
  const size = Math.abs(drift);
  let why = '';
  if (size < th.min_abs_body_yaw_deg.value) {
    why = 'drift below floor: the build tolerance model is not being felt';
  } else if (size > th.max_abs_body_yaw_deg.value) {
    why = 'drift above the build tolerance band';
  } else if (Math.sign(drift) !== th.expected_sign.value) {
    why = 'wrong sign';
  }
  return judge(`${drift.toFixed(2)} deg`, !why, why);
}

async function batterySag(ctx) {
  const th = ctx.th.checks['battery-sag'];
  const [fullVolts, lowVolts] = th.cell_voltages.value;
  const sim = await configuredSim(ctx, ctx.configA);
  const trim = hoverThrottle(sim, fullVolts, ctx.th.checks['hover-throttle']);
  if (Number.isNaN(trim)) {
    return fail('no hover trim', NO_HOVER);
  }
  const punch = (volts) => punchOut(sim, volts, trim, th.hover_settle_s.value, th.full_throttle_s.value);
  const full = punch(fullVolts);
  const low = punch(lowVolts);
  if (!(full.peakRpm > 0)) {
    return fail('no RPM at full charge', 'motors never spun');
  }
  const dropPercent = ((full.peakRpm - low.peakRpm) / full.peakRpm) * 100;
  return banded(
    `${dropPercent.toFixed(2)} percent lower (${Math.round(full.peakRpm)} vs ${Math.round(low.peakRpm)} RPM)`,
    dropPercent,
    th.band_percent,
  );
}

async function diffPassthrough(ctx) {
  const th = ctx.th.checks['diff-passthrough'];
  const srateA = parseRollSrate(ctx.configA);
  const srateB = parseRollSrate(ctx.configB);
  if (srateA === srateB) {
    return fail('fixture diffs identical', 'bad fixtures');
  }
  const expected = srateB / srateA;
  const rateA = steadyRollRateDegS(await configuredSim(ctx, ctx.configA), th.cell_voltage.value, th);
  const rateB = steadyRollRateDegS(await configuredSim(ctx, ctx.configB), th.cell_voltage.value, th);
  if (!(rateA > 0)) {
    return fail('zero roll rate with config A', 'no rotation');
  }
  const ratio = rateB / rateA;
  const err = Math.abs(ratio / expected - 1);
  return tolerated(
    `ratio ${ratio.toFixed(4)} vs ${expected.toFixed(4)} expected (${pct(err)} percent off)`,
    err,
    th.tolerance_fraction.value,
  );
}

async function consoleClean(ctx) {
  const th = ctx.th.checks['console-clean'];
  const { errors, warnings, result } = await ctx.browserRun();
  const ran = Boolean(result?.ok);
  const quiet = errors.length <= th.max_errors.value && warnings.length <= th.max_warnings.value;
  let why = '';
  if (!ran) {
    why = result?.errorName ?? 'harness run failed';
  } else if (!quiet) {
    why = errors[0] ?? warnings[0];
  }
  return judge(
    `errors=${errors.length} warnings=${warnings.length} run=${ran ? 'ok' : result?.errorName ?? 'no result'}`,
    ran && quiet,
    why,
  );
}

async function audioBed(ctx) {
  const th = ctx.th.checks['audio-bed'];
  const bed = await ctx.audioBedRun();
  const advance = Number(bed.musicAdvance);
  const faults = [];
  if (bed.state !== 'running') {
    faults.push(`context ${bed.state}`);
  }
  if (!bed.engineAttached) {
    faults.push('engine not attached');
  }
  if (!bed.musicAttached) {
    faults.push('music graph not attached');
  }
  if (!(bed.musicGain >= th.min_music_gain.value)) {
    faults.push(`music gain ${bed.musicGain.toFixed(4)}`);
  }
  if (!(advance >= th.min_music_advance_s.value)) {
    faults.push(`media advanced ${advance.toFixed(3)} s`);
  }
  if (!(bed.nodes > 0 && bed.nodes <= th.max_nodes.value)) {
    faults.push(`${bed.nodes} nodes`);
  }
  return judge(
    `ctx ${bed.state}, music gain ${bed.musicGain.toFixed(3)}, `
      + `media ${advance.toFixed(2)} s in ${bed.elapsed.toFixed(2)} s, ${bed.nodes} nodes`,
    faults.length === 0,
    faults.join('; '),
  );
}

/*
 * Check 15 reads the drawn craft and the gate scale off the live page and
 * holds them to real world sizes, in metres, so a scale error no draw call
 * budget can see fails here. The craft's figures are divided back through
 * the page's DECLARED world scale, and the declared scale is itself held
 * to the threshold file and to the collider's true radius, so a scale that
 * never reached the model and an undeclared group scale both fail.
 */
async function worldScale(ctx) {
  const th = ctx.th.checks['world-scale'];
  const { craft, gateScale } = await ctx.scaleRun();
  const rows = [];
  const faults = [];
  const metres = (v) => `${v.toFixed(4)} m`;

  const declared = typeof craft.worldScale === 'number' && craft.worldScale > 0;
  if (!declared) {
    faults.push('the page did not publish a world scale');
  }
  const scale = declared ? craft.worldScale : 1;
  rows.push(`world scale ${scale.toFixed(4)}`);
  if (Math.abs(scale - th.world_scale.value) > 1e-9) {
    faults.push(`the page declares a world scale of ${scale}, the threshold file ${th.world_scale.value}`);
  }

  const sized = (label, value, band) => {
    rows.push(`${label} ${metres(value)}`);
    if (!(Number.isFinite(value) && inside(value, band))) {
      faults.push(`${label} ${metres(value)} outside ${band.min} to ${band.max}`);
    }
  };
  sized('craft body', craft.bodyLength * scale, th.craft_body_m);
  const sweep = craft.sweepMeasured * scale;
  sized('craft sweep radius', sweep, th.craft_sweep_m);

  const slack = th.craft_radius_tolerance_m.value;
  rows.push(`declared scale applied to ${metres(sweep)} against a true ${metres(craft.craftRTrue)}`);
  if (Math.abs(sweep - craft.craftRTrue) > slack) {
    faults.push(
      `the drawn craft is ${craft.sweepMeasured.toFixed(4)} m, which is not the true `
        + `${craft.craftRTrue.toFixed(4)} m at the declared scale ${scale.toFixed(4)}`,
    );
  }
  /* The collision sphere against the drawn disc: a gate scored against a
   * bigger quad than the one on screen is a scale error the pilot feels. */
  const sphereGap = Math.abs(craft.craftR - craft.sweepMeasured);
  rows.push(`collision radius ${metres(craft.craftR)} vs swept ${metres(craft.sweepMeasured)}`);
  if (sphereGap > slack) {
    faults.push(`collision radius is ${(sphereGap * 1000).toFixed(1)} mm from the swept disc`);
  }

  /* The gate's declared departure from the rulebook, held to the
   * threshold file so changing it takes two edits on purpose. */
  if (typeof gateScale !== 'number') {
    faults.push('the page did not publish a gate scale');
  } else if (Math.abs(gateScale - th.gate_scale.value) > 1e-9) {
    faults.push(`the page declares a gate scale of ${gateScale}, the threshold file ${th.gate_scale.value}`);
  }
  rows.push(`gate scale ${(gateScale ?? 0).toFixed(4)}`);

  return judge(rows.join(', '), faults.length === 0, faults.join('; '));
}

/*
 * Check 16 measures the lazy load instead of asserting it: the URLs the
 * page fetched with the Alps selected must hold no Swiss valley module,
 * the URLs after choosing the valley must hold its whole graph (and match
 * the loading bar's typed count), and the Alps' own frame after a round
 * trip through the valley must cost what it cost at boot. Everything is
 * this run against itself, so no machine's constant can rot.
 */
async function mapIsolation(ctx) {
  const th = ctx.th.checks['map-isolation'];
  const r = await ctx.scaleRun();
  const early = r.otherUrlsWhileBaseSelected;
  const fetched = r.otherUrlsAfterChoosing.length;
  const boot = r.baseBudget;
  const back = r.baseBudgetAfterRoundTrip;
  const faults = [];
  if (early.length !== 0) {
    faults.push(`${early.length} Swiss valley module(s) fetched with the Alps selected, first ${early[0]}`);
  }
  if (fetched < th.swiss2_modules_min.value) {
    faults.push(`only ${fetched} Swiss valley modules fetched after choosing it`);
  }
  if (r.otherExpectedModules == null) {
    faults.push('MAP_MODULE_COUNT has no count for the Swiss valley');
  } else if (fetched !== r.otherExpectedModules) {
    faults.push(`MAP_MODULE_COUNT says ${r.otherExpectedModules} Swiss valley modules, the browser fetched ${fetched}`);
  }
  if (!boot) {
    faults.push('the Alps budget was not measured');
  }
  if (!back) {
    faults.push('the Alps budget after a round trip was not measured');
  } else if (boot) {
    /* Byte figures get floating point slack; counts get none. */
    const held = [
      ['P1 draw calls', 'p1', 0],
      ['P2 triangles', 'p2', 0],
      ['P5 target MB', 'p5', 0.05],
      ['P10 attribute MB', 'p10', 0.05],
      ['meshes', 'meshes', 0],
    ];
    for (const [label, key, slack] of held) {
      if (!(Math.abs(back[key] - boot[key]) <= slack)) {
        faults.push(`${label} ${back[key]} against ${boot[key]} at boot, across a round trip`);
      }
    }
    /* Only growth is a leak: a material registers when it first compiles,
     * so the rebuilt Alps may honestly report fewer. */
    if (back.cel > boot.cel) {
      faults.push(`cel material clock walk grew ${boot.cel} to ${back.cel} across a round trip`);
    }
  }
  const cost = (b) => `P1 ${b.p1}, P2 ${b.p2}, P5 ${b.p5} MB, P10 ${b.p10} MB`;
  return judge(
    `Swiss valley modules: ${early.length} with the Alps selected, ${fetched} after choosing it; `
      + (boot ? `Alps ${cost(boot)}, ${boot.meshes} meshes` : 'no budget')
      + (back ? `; after a Swiss valley round trip ${cost(back)}` : ''),
    faults.length === 0,
    faults.join('; '),
  );
}

const CHECKS = [
  [1, 'build-clean', 'exit 0, vendor diff empty, init OK', buildClean],
  [2, 'determinism-repeat', 'two in-process replay hashes identical', determinismRepeat],
  [3, 'determinism-cross-host', 'Node and headless Chrome hashes identical', determinismCrossHost],
  [4, 'frame-independence', 'traces at 30, 60, 144, 240 Hz identical', frameIndependence],
  [5, 'hover-throttle', '0.20 to 0.30', hoverThrottleCheck],
  [6, 'punch-out', '95 to 147 m', punchOutCheck],
  [7, 'terminal-velocity', '35.7 to 56.8 m/s', terminalVelocity],
  [8, 'motor-step-response', '10 to 30 ms', motorStepResponse],
  [9, 'rate-tracking', 'within 3 percent of configured max rate', rateTracking],
  [10, 'yaw-coupling', '|drift| 0.04 to 0.60 deg, sign negative', yawCoupling],
  [11, 'battery-sag', 'peak RPM 4 to 15 percent lower at 3.60 V', batterySag],
  [12, 'diff-passthrough', 'rate ratio matches diff ratio within 2 percent', diffPassthrough],
  [13, 'console-clean', 'zero errors, zero warnings', consoleClean],
  [14, 'audio-bed', 'context running, bed audible, media advancing', audioBed],
  [15, 'world-scale', 'reference objects inside their real world bands', worldScale],
  [16, 'map-isolation', 'no Swiss valley module requested with the Alps selected, Alps cost unchanged', mapIsolation],
];

export function buildChecks() {
  return CHECKS.map(([num, id, thresholdText, run]) => ({ num, id, thresholdText, run }));
}
