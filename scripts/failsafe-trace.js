/*
 * failsafe-trace.js: Betaflight's failsafe, compiled, proved two ways.
 *
 * IDENTITY. flight/failsafe.c and rx/rx.c are compiled into the module and
 * every stick now reaches Betaflight through rx.c. A flight whose link is
 * never lost must be bit identical to the module before that. This flies
 * the same programs through a base module (git show <base>:dist/sim.wasm,
 * default origin/main) and through this tree's dist/sim.wasm and compares
 * the whole state block after EVERY step, not a sample of them:
 *   - the harness's own recorded flight, tests/inputs/baseline.rec;
 *   - a shell style stick stream on the RC_HZ grid, five inch and seven inch,
 *     acro, angle and launch control, with a reset and a second flight;
 *   - the same stream with sim_rx_signal(1) called before every step, the
 *     way the live shell will call it (the base module has no such export
 *     and flies it without);
 *   - held sticks, one sample a segment, the way the gates fly;
 *   - a diff carrying failsafe_ keys, which the base module ignores.
 *
 * THE TRACE. A five inch in a hover on a 250 Hz stick stream, and the link
 * cut while the shell goes on queueing frames. Printed every 50 ms, and
 * asserted against Betaflight's own numbers: rx loss after 100 ms, the
 * channels held 300 ms then centred with throttle at rx_min_usec, stage 2
 * after failsafe_delay (1.5 s), DROP disarming, and a restored link
 * recovering after failsafe_recovery_delay while the craft stays disarmed.
 * Then a cut shorter than failsafe_delay (stage 1 only, sticks come
 * straight back), AUTO-LAND (levelled, failsafe_throttle, then disarm after
 * failsafe_off_delay), and a reset into a dead link.
 *
 * Run: node scripts/failsafe-trace.js [--base=<git ref>] [--quiet]
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeRec } from '../tests/lib/recfile.js';
import { must, ST } from '../tests/lib/replay.js';
import { loadSim, SIM_OK, simErrorName } from '../tests/lib/simmod.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const arg = (name, dflt) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : dflt;
};
const quiet = process.argv.includes('--quiet');
const baseRef = arg('base', 'origin/main');

/* sim_abi.h */
const RX_ACTIVE = 0x10;
const RX_ARMED = 0x20;
const PHASE = ['IDLE', 'RX_LOSS_DETECTED', 'LANDING', 'LANDED', 'RX_LOSS_MONITORING', 'RX_LOSS_RECOVERED'];
const AIRFRAME_5IN = 0;
/* The whoop's plant row went on 2026-10-03 (3a2a2d19); the seven inch is
 * the other quad size Betaflight flies here. */
const AIRFRAME_7IN = 24;
/* src/main.js RC_HZ: the live shell's frame grid, 4 ms. */
const RC_PERIOD_MS = 4;

const newWasm = await readFile(join(root, 'dist/sim.wasm'));
const show = spawnSync('git', ['show', `${baseRef}:dist/sim.wasm`], { cwd: root, maxBuffer: 1 << 28 });
if (show.status !== 0) {
  throw new Error(`git show ${baseRef}:dist/sim.wasm failed: ${show.stderr}`);
}
const baseWasm = show.stdout;
const configA = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const rec = decodeRec(new Uint8Array(await readFile(join(root, 'tests/inputs/baseline.rec'))));

let failed = 0;
function record(ok, name, detail) {
  if (!ok) {
    failed += 1;
  }
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
}

async function freshSim(wasm, config, airframe) {
  const sim = await loadSim(wasm);
  if (airframe !== undefined) {
    must(sim.e.sim_set_airframe(airframe), 'sim_set_airframe');
  }
  const code = sim.init(config);
  if (code !== SIM_OK) {
    throw new Error(`sim_init returned ${simErrorName(code)}`);
  }
  must(sim.setCellVoltage(4.0), 'sim_set_cell_voltage');
  must(sim.reset(), 'sim_reset');
  return sim;
}

/*
 * A flight is a list of events at step indices; a digest of the state block
 * after every single step. linkUp: call sim_rx_signal(1) before each step
 * when the module has it.
 */
function flyDigest(sim, events, steps, linkUp) {
  const h = createHash('sha256');
  const rx = linkUp && typeof sim.e.sim_rx_signal === 'function';
  let ev = 0;
  for (let k = 0; k < steps; k += 1) {
    while (ev < events.length && events[ev].k === k) {
      events[ev].run(sim);
      ev += 1;
    }
    if (rx) {
      sim.e.sim_rx_signal(1);
    }
    must(sim.step(1), 'sim_step');
    const { code, bytes } = sim.readStateBytes();
    must(code, 'sim_state');
    h.update(bytes);
  }
  return h.digest('hex');
}

/* Deterministic sticks: a sum of triangle waves, no Math.sin. */
function tri(t, period) {
  const p = (t % period) / period;
  return p < 0.5 ? 4 * p - 1 : 3 - 4 * p;
}

function shellStream(durMs, t0Ms) {
  const ev = [];
  for (let t = 0; t < durMs; t += RC_PERIOD_MS) {
    const ts = (t0Ms + t) / 1000;
    const roll = 0.6 * tri(t, 1700) * (t > 1500 ? 1 : 0);
    const pitch = 0.4 * tri(t + 300, 2300) * (t > 2500 ? 1 : 0);
    const yaw = 0.3 * tri(t + 700, 3100);
    const thr = 0.32 + 0.25 * tri(t + 100, 2900) * (t > 800 ? 1 : 0);
    ev.push({ k: t, run: (sim) => must(sim.input(ts, roll, pitch, yaw, thr), 'sim_input') });
  }
  return ev;
}

function heldSegments() {
  const segs = [
    { dur: 600, s: [0, 0, 0, 0.3] },
    { dur: 900, s: [0.5, 0, 0, 0.45] },
    { dur: 1200, s: [0, -0.4, 0.2, 0.35] },
    { dur: 700, s: [0, 0, 0, 0.9] },
    { dur: 1600, s: [-0.3, 0.2, -0.5, 0.2] },
  ];
  const ev = [];
  let t = 0;
  for (const seg of segs) {
    const ts = t / 1000;
    const [r, p, y, th] = seg.s;
    ev.push({ k: t, run: (sim) => must(sim.input(ts, r, p, y, th), 'sim_input') });
    t += seg.dur;
  }
  return { ev, steps: t };
}

function recEvents() {
  return rec.samples.map((s) => ({
    k: Math.floor(s.tUs / 1000),
    run: (sim) => must(sim.input(s.tUs / 1e6, s.roll, s.pitch, s.yaw, s.throttle), 'sim_input'),
  }));
}

async function same(name, config, airframe, events, steps, opts = {}) {
  const run = async (wasm, linkUp) => {
    const sim = await freshSim(wasm, config, airframe);
    const pre = opts.pre ? opts.pre : () => {};
    pre(sim);
    const d1 = flyDigest(sim, events, steps, linkUp);
    if (!opts.resetAndAgain) {
      return d1;
    }
    must(sim.reset(), 'sim_reset');
    pre(sim);
    return `${d1}:${flyDigest(sim, events, steps, linkUp)}`;
  };
  const base = await run(baseWasm, false);
  const now = await run(newWasm, !!opts.linkUp);
  record(base === now, name, `base ${base.slice(0, 12)}  now ${now.slice(0, 12)}`);
}

console.log(`failsafe-trace: base ${baseRef}:dist/sim.wasm against this tree's dist/sim.wasm\n`);
console.log('Identity, the whole state block after every step:');
{
  /* The flight ends with its last frame: a receiver that is judged goes
   * into failsafe 100 ms after the stream stops, which is the point. */
  const recSteps = Math.floor(rec.samples[rec.samples.length - 1].tUs / 1000) + 50;
  await same('baseline.rec, five inch', configA, AIRFRAME_5IN, recEvents(), recSteps);
  await same('baseline.rec, five inch, sim_rx_signal(1) each step', configA, AIRFRAME_5IN, recEvents(), recSteps, { linkUp: true });
  const stream = shellStream(8000, 0);
  for (const [label, af] of [['five inch', AIRFRAME_5IN], ['seven inch', AIRFRAME_7IN]]) {
    await same(`shell stream, ${label}, acro, reset, again`, configA, af, stream, 8000, { resetAndAgain: true });
    await same(`shell stream, ${label}, acro, sim_rx_signal(1)`, configA, af, stream, 8000, { linkUp: true, resetAndAgain: true });
    await same(`shell stream, ${label}, angle, sim_rx_signal(1)`, configA, af, stream, 8000, {
      linkUp: true, pre: (sim) => must(sim.setAngleMode(1), 'angle'),
    });
    await same(`shell stream, ${label}, launch control`, configA, af, stream, 8000, {
      pre: (sim) => must(sim.setLaunchControl(1), 'launch'),
    });
    await same(`shell stream, ${label}, launch control, sim_rx_signal(1)`, configA, af, stream, 8000, {
      linkUp: true, pre: (sim) => must(sim.setLaunchControl(1), 'launch'),
    });
    const flip = stream.concat([
      { k: 3000, run: (sim) => must(sim.e.sim_set_crashflip(1), 'crashflip') },
      { k: 3400, run: (sim) => must(sim.e.sim_set_crashflip(0), 'crashflip') },
    ]).sort((a, b) => a.k - b.k);
    await same(`shell stream, ${label}, turtle 400 ms, sim_rx_signal(1)`, configA, af, flip, 8000, { linkUp: true });
  }
  const held = heldSegments();
  await same('held sticks, one sample a segment, five inch', configA, AIRFRAME_5IN, held.ev, held.steps, { resetAndAgain: true });
  await same('held sticks, seven inch', configA, AIRFRAME_7IN, held.ev, held.steps);
  const fsConfig = `${configA}\nset failsafe_delay = 4\nset failsafe_procedure = AUTO-LAND\nset failsafe_throttle = 1300\n`;
  await same('diff with failsafe_ keys, link never judged', fsConfig, AIRFRAME_5IN, stream, 8000);
}

/*
 * The trace. A shell: frames every 4 ms, a vertical speed hold on the
 * throttle so the craft hovers, and the link cut and restored on a script.
 */
function row(sim, t, link, status) {
  const { state } = sim.readState();
  const d = (w) => sim.e.sim_bf_debug(w);
  const rpm = (state[ST.RPM0] + state[ST.RPM1] + state[ST.RPM2] + state[ST.RPM3]) / 4;
  return {
    t,
    link,
    rx: d(74),
    thr: d(72),
    roll: d(73),
    phase: status & 0x0f,
    active: (status & RX_ACTIVE) !== 0,
    armed: (status & RX_ARMED) !== 0,
    z: state[ST.PZ],
    vz: state[ST.VZ],
    rpm,
    tilt: 1 - 2 * (state[ST.QX] * state[ST.QX] + state[ST.QY] * state[ST.QY]),
  };
}

async function flyCut(config, script, totalMs, opts = {}) {
  const sim = await freshSim(newWasm, config, AIRFRAME_5IN);
  let link = opts.linkAtReset ?? 1;
  let status = sim.e.sim_rx_signal(link);
  if (opts.resetAfterSignal) {
    must(sim.reset(), 'sim_reset');
    status = sim.e.sim_rx_signal(link);
  }
  const rows = [];
  let vz = 0;
  for (let t = 0; t < totalMs; t += 1) {
    for (const e of script) {
      if (e.t === t) {
        link = e.link;
      }
    }
    if (t % RC_PERIOD_MS === 0) {
      /* The pilot holds a hover: throttle on vertical speed, and a roll
       * stick held right in the windows the script names. */
      const thr = Math.min(1, Math.max(0, 0.30 - 0.08 * vz));
      const roll = opts.rollAt && t >= opts.rollAt[0] && t < opts.rollAt[1] ? 0.3 : 0;
      must(sim.input(t / 1000, roll, 0, 0, thr), 'sim_input');
    }
    status = sim.e.sim_rx_signal(link);
    must(sim.step(1), 'sim_step');
    const r = row(sim, t, link, sim.e.sim_rx_signal(link));
    vz = r.vz;
    rows.push(r);
  }
  return { rows, status };
}

function printRows(title, rows, everyMs, from, to) {
  if (quiet) {
    return;
  }
  console.log(`\n${title}`);
  console.log('    t ms  link  rx  rcData thr  rcData roll  phase                armed  stage2   z m      vz m/s   rotor rad/s  up');
  for (const r of rows) {
    if (r.t < from || r.t > to || r.t % everyMs !== 0) {
      continue;
    }
    console.log(`  ${String(r.t).padStart(6)}  ${String(r.link).padStart(4)}  ${String(r.rx).padStart(2)}  `
      + `${r.thr.toFixed(1).padStart(10)}  ${r.roll.toFixed(1).padStart(11)}  ${PHASE[r.phase].padEnd(19)}  `
      + `${(r.armed ? 'yes' : 'NO').padEnd(5)}  ${(r.active ? 'ON' : '-').padEnd(6)}  ${r.z.toFixed(2).padStart(7)}  `
      + `${r.vz.toFixed(2).padStart(7)}  ${r.rpm.toFixed(0).padStart(11)}  ${r.tilt.toFixed(3)}`);
  }
}

const first = (rows, fn) => rows.find(fn);

console.log('\nThe cut link, DROP (Betaflight defaults: failsafe_delay 15, recovery 5, procedure DROP):');
{
  const CUT = 3000;
  const BACK = 6000;
  const { rows } = await flyCut(configA, [{ t: CUT, link: 0 }, { t: BACK, link: 1 }], 8000);
  printRows('  cut at 3000 ms, restored at 6000 ms', rows, 50, 2900, 7400);
  /* Rows are indexed by step; the step at CUT is the first whose frame is
   * lost, so the last frame that arrived is the grid slot before it. */
  const lastGood = CUT - RC_PERIOD_MS;
  const before = rows[lastGood];
  const lostAt = first(rows, (r) => r.t > CUT && r.rx === 0);
  const centred = first(rows, (r) => r.t > CUT && r.thr === 885);
  const stage2 = first(rows, (r) => r.t > CUT && r.active);
  const disarmed = first(rows, (r) => r.t > CUT && !r.armed);
  const idleAgain = first(rows, (r) => r.t > BACK && r.phase === 0 && !r.active);
  record(before.armed && before.phase === 0 && before.rx === 1, 'flying before the cut: armed, IDLE, receiving');
  record(!!lostAt && lostAt.t - lastGood === 101,
    'rx loss declared once 100 ms pass with no frame', lostAt ? `step ${lostAt.t}, last frame at step ${lastGood}` : 'never');
  const held = centred ? rows.slice(lastGood, centred.t) : [];
  record(held.length > 300 && held.every((r) => r.thr === before.thr && r.roll === before.roll),
    'stage 1: channels hold the last frame for 300 ms', `throttle ${before.thr.toFixed(1)} for ${held.length} ms`);
  record(!!centred && centred.t - lastGood > 300 && centred.t - lastGood <= 400 && centred.roll === 1500,
    'stage 1: then sticks centre and throttle goes to rx_min_usec 885, on rx.c\'s 100 ms re-judge',
    centred ? `step ${centred.t}, ${centred.t - lastGood} ms after the last frame` : 'never');
  record(!!stage2 && stage2.t - lastGood > 1500 && stage2.t - lastGood <= 1500 + 12,
    'stage 2 after failsafe_delay 1.5 s, on the 10 ms failsafe check', stage2 ? `step ${stage2.t}, ${stage2.t - lastGood} ms after the last frame` : 'never');
  record(!!disarmed && stage2 && disarmed.t === stage2.t, 'DROP: disarmed at stage 2', disarmed ? `at ${disarmed.t} ms, phase ${PHASE[disarmed.phase]}` : 'never');
  const fall = rows[BACK - 1];
  record(fall.rpm < 1 && fall.vz < -5, 'motors stopped and the craft falls', `rotor ${fall.rpm.toFixed(1)} rad/s, vz ${fall.vz.toFixed(2)} m/s at ${BACK} ms`);
  record(!!idleAgain && idleAgain.t - BACK >= 500 && idleAgain.t - BACK <= 1000,
    'link back: failsafe recovers after failsafe_recovery_delay', idleAgain ? `IDLE at ${idleAgain.t} ms, ${idleAgain.t - BACK} ms after` : 'never');
  record(rows[rows.length - 1].armed === false, 'a dropped craft stays disarmed until sim_reset');
}

console.log('\nA cut shorter than failsafe_delay, stage 1 only:');
{
  const CUT = 2000;
  const BACK = 3000;
  const { rows } = await flyCut(configA, [{ t: CUT, link: 0 }, { t: BACK, link: 1 }], 5000, { rollAt: [3100, 3300] });
  printRows('  cut at 2000 ms, restored at 3000 ms, roll 0.3 from 3100 to 3300 ms', rows, 50, 1950, 3400);
  const back = first(rows, (r) => r.t > BACK && r.rx === 1);
  record(rows.every((r) => r.armed && !r.active && r.phase === 0), 'never stage 2, never disarmed');
  record(!!back && back.t - BACK <= RC_PERIOD_MS + 1 && back.thr !== 885, 'the first frame hands the sticks back', back ? `at ${back.t} ms, throttle ${back.thr.toFixed(1)}` : 'never');
  record(rows[3150].roll > 1500, 'the pilot has roll again', `rcData roll ${rows[3150].roll.toFixed(1)} at 3150 ms`);
}

console.log('\nAUTO-LAND (failsafe_procedure AUTO-LAND, failsafe_throttle 1350, failsafe_off_delay 20):');
{
  const cfg = `${configA}\nset failsafe_procedure = AUTO-LAND\nset failsafe_throttle = 1350\nset failsafe_off_delay = 20\n`;
  const CUT = 2000;
  const { rows } = await flyCut(cfg, [{ t: CUT, link: 0 }], 6500, { rollAt: [1000, 2000] });
  printRows('  rolled right until the cut at 2000 ms, never restored', rows, 100, 1900, 6300);
  const stage2 = first(rows, (r) => r.t > CUT && r.active);
  const landed = first(rows, (r) => r.t > CUT && !r.armed);
  record(!!stage2 && stage2.phase === 2 && stage2.armed, 'stage 2 is LANDING, still armed', stage2 ? `at ${stage2.t} ms` : 'never');
  const landing = stage2 ? rows.filter((r) => r.t > stage2.t + 150 && r.t < stage2.t + 1900) : [];
  record(landing.length > 0 && landing.every((r) => r.thr === 1350), 'throttle is failsafe_throttle while landing');
  record(landing.length > 0 && landing[landing.length - 1].tilt > 0.999, 'levelled, Betaflight ANGLE mode', landing.length ? `up ${landing[landing.length - 1].tilt.toFixed(4)}` : '');
  record(!!landed && stage2 && landed.t - stage2.t >= 2000 && landed.t - stage2.t <= 2012,
    'disarmed after failsafe_off_delay 2.0 s', landed ? `at ${landed.t} ms` : 'never');
}

console.log('\nAUTO-LAND recovered mid landing:');
{
  const cfg = `${configA}\nset failsafe_procedure = AUTO-LAND\nset failsafe_throttle = 1350\nset failsafe_off_delay = 50\n`;
  const { rows } = await flyCut(cfg, [{ t: 2000, link: 0 }, { t: 4500, link: 1 }], 6000);
  const back = first(rows, (r) => r.t > 4500 && r.phase === 0 && !r.active);
  record(rows.every((r) => r.armed), 'never disarmed');
  record(!!back, 'back to IDLE and flying', back ? `at ${back.t} ms` : 'never');
}

console.log('\nA reset into a dead link:');
{
  const { rows } = await flyCut(configA, [], 200, { linkAtReset: 0, resetAfterSignal: true });
  const dis = first(rows, (r) => !r.armed);
  record(!!dis && dis.t <= 20, 'disarmed at once, as Betaflight refuses to fly without a link', dis ? `at ${dis.t} ms, phase ${PHASE[dis.phase]}` : 'never');
}

console.log('\nDeterminism:');
{
  const a = await flyCut(configA, [{ t: 3000, link: 0 }, { t: 6000, link: 1 }], 8000);
  const b = await flyCut(configA, [{ t: 3000, link: 0 }, { t: 6000, link: 1 }], 8000);
  const ha = createHash('sha256').update(JSON.stringify(a.rows)).digest('hex');
  const hb = createHash('sha256').update(JSON.stringify(b.rows)).digest('hex');
  record(ha === hb, 'the cut link trace twice', `${ha.slice(0, 12)} ${hb.slice(0, 12)}`);
}

console.log(failed ? `\n${failed} failure(s)` : '\nok  failsafe compiled, identical with the link up, Betaflight stage 1 and stage 2 with it cut');
process.exit(failed ? 1 : 0);
