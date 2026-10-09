/*
 * simmod-selftest.js: the sim.wasm loader and wrapper (tests/lib/simmod.js)
 * pinned as a transcript.
 *
 *     node scripts/simmod-selftest.js [--dump=<file>]   (npm run simmod:selftest)
 *
 * The wrapper is shipped code (src/main.js and src/game/* import it) as
 * well as the harness's, so its contract is production contract: every
 * export, every method's marshalling, and what each returns or throws.
 * Two layers pin it:
 *
 * 1. A fake exports object whose malloc and free run over a scratch
 *    ArrayBuffer and whose sim_* entry points return scripted codes. Every
 *    method is driven through it and the transcript records the call
 *    sequence, the pointer each call received, the bytes written there,
 *    and what the method returned or threw. This reaches the paths the
 *    real module cannot (malloc returning 0, a non-OK sim_state, a zero
 *    state size) and survives a rebuild of sim.wasm.
 *
 * 2. The real dist/sim.wasm: the baseline config, a flight from
 *    tests/inputs/baseline.rec with the state bytes by hex, the power,
 *    motors, prop and pack, add-on and tune blocks with real values, and
 *    every error code the module hands back (before init, a bad diff, a
 *    block on the wrong airframe, inertia with no add-ons). Floats are
 *    recorded by their 64-bit pattern, so one mantissa bit differs the
 *    digest.
 *
 * loadSim's own refusals come from hand-assembled modules: one exporting
 * only its memory (the first missing name is the message), one exporting
 * every function but no memory, and one that counts the _initialize call.
 * The digest below was taken on the module before its rewrite
 * (scripts/lib/transcript.js). Layer 2 is also a pin on the dist/sim.wasm
 * in the tree: a PR that rebuilds the module re-pins it, with --dump here
 * and at the old revision and the two diffed, as collide:golden is.
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

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as mod from '../tests/lib/simmod.js';
import { decodeRec } from '../tests/lib/recfile.js';
import { transcript } from './lib/transcript.js';

const PINNED = 'a7aa8a281e34d576fffeb4a292f10db927564a516f5500a272ece671055f2f13';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmBytes = readFileSync(join(root, 'dist/sim.wasm'));
const baselineDiff = readFileSync(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const rec = decodeRec(new Uint8Array(readFileSync(join(root, 'tests/inputs/baseline.rec'))));

const t = transcript();

/* Floats as the hex of their own bits; bytes as hex. */
const hex = (u8) => Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('hex');
const bits = (arr) => (arr === null ? null : `${arr.constructor.name}:${hex(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength))}`);

/* An engine throw (a TypeError on a bad receiver, a CompileError on bad
 * bytes) is recorded by its kind alone: its message quotes the engine, not
 * the module. Throws the module words itself are recorded in full. */
const ENGINE = [TypeError, RangeError, ReferenceError, WebAssembly.CompileError, WebAssembly.LinkError];
function engineSafe(fn) {
  return () => {
    try {
      return fn();
    } catch (e) {
      if (ENGINE.some((E) => e instanceof E)) {
        return `engine ${e.constructor.name}`;
      }
      throw e;
    }
  };
}

async function recAsync(label, fn) {
  let out;
  try {
    out = await fn();
  } catch (e) {
    out = ENGINE.some((E) => e instanceof E) ? `engine ${e.constructor.name}` : `throws ${e?.constructor?.name}: ${e?.message}`;
    t.note(label, out);
    return;
  }
  t.note(label, out);
}

/* ---- the surface ---- */

t.note('exports', Object.keys(mod).sort());
t.note('constants', [mod.SIM_OK, mod.SIM_ERR_NOT_IMPLEMENTED, mod.SIM_ERR_BAD_ARG, mod.SIM_ERR_BAD_STATE,
  mod.SIM_ERR_CONFIG_PARSE, mod.SIM_ABI_VERSION, mod.POWER_STATE_DOUBLES, mod.TUNE_DOUBLES]);
t.note('Sim methods', Object.getOwnPropertyNames(mod.Sim.prototype).sort());
t.note('Sim arity', [mod.Sim.length, mod.loadSim.length, mod.simErrorName.length]);
for (const code of [0, -1, -2, -3, -4, -5, 1, 7, -0, NaN, undefined, null, '0', '-2', 0.5, 2 ** 31]) {
  t.rec(`simErrorName ${String(code)}`, () => mod.simErrorName(code));
}

/* ---- layer 1: the fake module ---- */

const REQUIRED = ['sim_abi_version', 'sim_init', 'sim_reset', 'sim_set_cell_voltage', 'sim_input', 'sim_step',
  'sim_motor_override', 'sim_rest', 'sim_set_angle_mode', 'sim_set_launch_control', 'sim_launch_control_state',
  'sim_state_size', 'sim_state', 'malloc', 'free'];
const POINTER_INS = ['sim_set_power', 'sim_set_motors', 'sim_set_prop_pack', 'sim_set_addons', 'sim_set_addon_inertia',
  'sim_wing_set_tune'];
const POINTER_OUTS = ['sim_state', 'sim_power_state', 'sim_addons_state', 'sim_wing_tune'];
const PLAIN = ['sim_abi_version', 'sim_reset', 'sim_set_cell_voltage', 'sim_input', 'sim_step', 'sim_motor_override', 'sim_rest',
  'sim_set_angle_mode', 'sim_set_launch_control', 'sim_launch_control_state', 'sim_state_size', 'sim_power_clear',
  'sim_addons_clear', 'sim_wing_tune_clear'];

/* A module whose heap is a bump allocator over 64 KB, whose entry points
 * return whatever `codes` scripts for them (default 0), and which logs every
 * call with its arguments and, for a pointer, the bytes at it. `fill`
 * writes a recognisable pattern into an out pointer so the copy the
 * wrapper returns can be told from the heap it read. */
function fakeModule({ codes = {}, mallocFails = false, stateSize = 20, fill = 0.5 } = {}) {
  const memory = { buffer: new ArrayBuffer(65536) };
  const log = [];
  let brk = 1024;
  const code = (name) => (typeof codes[name] === 'function' ? codes[name]() : (codes[name] ?? 0));
  const e = {
    memory,
    malloc(n) {
      log.push(['malloc', n]);
      if (mallocFails) return 0;
      const p = brk;
      brk += Math.ceil(n / 8) * 8;
      return p;
    },
    free(p) {
      log.push(['free', p]);
    },
    sim_init(ptr, len) {
      log.push(['sim_init', ptr, len, hex(new Uint8Array(memory.buffer, ptr, len))]);
      return code('sim_init');
    },
    sim_state_size() {
      log.push(['sim_state_size']);
      return stateSize;
    },
  };
  for (const name of PLAIN) {
    if (e[name]) continue;
    e[name] = (...args) => {
      log.push([name, ...args]);
      return code(name);
    };
  }
  for (const name of POINTER_INS) {
    e[name] = (ptr) => {
      /* The caller malloc'd just before; the block is whatever sits from
       * ptr to the bump pointer. */
      log.push([name, ptr, hex(new Uint8Array(memory.buffer, ptr, brk - ptr))]);
      return code(name);
    };
  }
  for (const name of POINTER_OUTS) {
    e[name] = (ptr) => {
      log.push([name, ptr]);
      const n = { sim_state: stateSize, sim_power_state: 10, sim_addons_state: 8, sim_wing_tune: 11 }[name];
      const f = new Float64Array(memory.buffer, ptr, n);
      for (let i = 0; i < n; i += 1) f[i] = fill + i;
      return code(name);
    };
  }
  return { e, log, memory };
}

function drive(label, opts, calls) {
  const fake = fakeModule(opts);
  const sim = new mod.Sim(fake.e);
  for (const [what, fn] of calls) {
    fake.log.length = 0;
    let threw = true;
    t.rec(`${label}: ${what}`, engineSafe(() => {
      const r = fn(sim);
      threw = false;
      return { r: shown(r), calls: fake.log.slice() };
    }));
    /* A throw's calls matter too: what was malloc'd before the refusal. */
    if (threw) t.note(`${label}: ${what} calls before the throw`, fake.log.slice());
  }
  t.note(`${label}: e is the exports`, sim.e === fake.e);
  return sim;
}

function withBits(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = ArrayBuffer.isView(v) ? bits(v) : v;
  return out;
}

/* A result with any typed array in it shown by its bits. */
function shown(r) {
  if (ArrayBuffer.isView(r)) return bits(r);
  if (Array.isArray(r)) return r.map(shown);
  if (r && typeof r === 'object') return withBits(r);
  return r;
}

const f64 = (...xs) => Float64Array.from(xs);
const block = (n, from = 1) => Float64Array.from({ length: n }, (_, i) => from + i * 0.25);

drive('fake ok', {}, [
  ['abiVersion', (s) => s.abiVersion()],
  ['init text', (s) => s.init('set foo = 1\n')],
  ['init empty', (s) => s.init('')],
  ['init utf8', (s) => s.init('é\u{1F681}')],
  ['init number', (s) => s.init(42)],
  ['init undefined', (s) => s.init(undefined)],
  ['reset', (s) => s.reset()],
  ['setCellVoltage 4.2', (s) => s.setCellVoltage(4.2)],
  ['setCellVoltage string', (s) => s.setCellVoltage('3.7')],
  ['input', (s) => s.input(0.004, 0.1, -0.2, 0.3, 0.75)],
  ['input short', (s) => s.input(1)],
  ['step 3', (s) => s.step(3)],
  ['step none', (s) => s.step()],
  ['motorOverride', (s) => s.motorOverride(2, 0.5)],
  ['motorOverride clear', (s) => s.motorOverride(-1, -1)],
  ['rest', (s) => s.rest()],
  ['setAngleMode true', (s) => s.setAngleMode(true)],
  ['setAngleMode 0', (s) => s.setAngleMode(0)],
  ['setAngleMode 2', (s) => s.setAngleMode(2)],
  ['setAngleMode string', (s) => s.setAngleMode('x')],
  ['setAngleMode none', (s) => s.setAngleMode()],
  ['setLaunchControl true', (s) => s.setLaunchControl(true)],
  ['setLaunchControl null', (s) => s.setLaunchControl(null)],
  ['launchControlState', (s) => s.launchControlState()],
  ['stateSize', (s) => s.stateSize()],
  ['ensureStateBuffer', (s) => s.ensureStateBuffer()],
  ['ensureStateBuffer again', (s) => s.ensureStateBuffer()],
  ['readState', (s) => s.readState()],
  ['readState again', (s) => s.readState()],
  ['readStateBytes', (s) => s.readStateBytes()],
  ['setPower 17', (s) => s.setPower(block(17))],
  ['setPower plain array', (s) => s.setPower([1, 2, 3])],
  ['setPower float32', (s) => s.setPower(Float32Array.from([1.5, 2.5]))],
  ['setPower empty', (s) => s.setPower(new Float64Array(0))],
  ['setPower not a block', (s) => s.setPower(null)],
  ['setMotors 7', (s) => s.setMotors(block(7, 2))],
  ['setPropPack 36', (s) => s.setPropPack(block(36, 3))],
  ['clearPower', (s) => s.clearPower()],
  ['setAddons 10', (s) => s.setAddons(block(10, 4))],
  ['setTune 11', (s) => s.setTune(block(11, 5))],
  ['clearAddons', (s) => s.clearAddons()],
  ['setAddonInertia 3', (s) => s.setAddonInertia(f64(0.1, 0.2, 0.3))],
  ['addonsState', (s) => s.addonsState()],
  ['addonsState again', (s) => s.addonsState()],
  ['clearTune', (s) => s.clearTune()],
  ['tune', (s) => s.tune()],
  ['tune again', (s) => s.tune()],
  ['powerState', (s) => s.powerState()],
  ['powerState again', (s) => s.powerState()],
]);

/* The named blocks: a 1 reads as true, anything else as false. */
drive('fake flags', { fill: 1 }, [
  ['addonsState fill 1', (s) => s.addonsState()],
  ['powerState fill 1', (s) => s.powerState()],
]);
drive('fake flags minus', { fill: -1 }, [
  ['addonsState fill -1', (s) => s.addonsState()],
  ['powerState fill -1', (s) => s.powerState()],
]);

/* Scripted refusals. */
drive('fake refuses', { codes: { sim_init: -4, sim_state: -3, sim_power_state: -3, sim_addons_state: -2, sim_wing_tune: -2, sim_set_power: -2, sim_wing_set_tune: -2 } }, [
  ['init', (s) => s.init('garbage')],
  ['readState', (s) => s.readState()],
  ['readStateBytes', (s) => s.readStateBytes()],
  ['setPower', (s) => s.setPower(block(17))],
  ['setTune', (s) => s.setTune(block(11))],
  ['tune', (s) => s.tune()],
  ['powerState', (s) => s.powerState()],
  ['addonsState', (s) => s.addonsState()],
  ['powerState after', (s) => s.powerState()],
]);

/* sim_state refuses once, then answers. */
{
  let n = 0;
  drive('fake state once', { codes: { sim_state: () => (n++ === 0 ? -3 : 0) } }, [
    ['readState first', (s) => s.readState()],
    ['readState second', (s) => s.readState()],
  ]);
}

drive('fake state size 0', { stateSize: 0 }, [
  ['stateSize', (s) => s.stateSize()],
  ['ensureStateBuffer', (s) => s.ensureStateBuffer()],
  ['readState', (s) => s.readState()],
  ['readStateBytes', (s) => s.readStateBytes()],
]);
drive('fake state size -3', { stateSize: -3 }, [
  ['readState', (s) => s.readState()],
  ['readStateBytes', (s) => s.readStateBytes()],
]);
drive('fake state size 3', { stateSize: 3, fill: -0 }, [
  ['readState', (s) => s.readState()],
  ['readStateBytes', (s) => s.readStateBytes()],
]);

drive('fake malloc fails', { mallocFails: true }, [
  ['init', (s) => s.init('x')],
  ['readState', (s) => s.readState()],
  ['readStateBytes', (s) => s.readStateBytes()],
  ['setPower', (s) => s.setPower(block(17))],
  ['setMotors', (s) => s.setMotors(block(7))],
  ['setPropPack', (s) => s.setPropPack(block(36))],
  ['setAddons', (s) => s.setAddons(block(10))],
  ['setTune', (s) => s.setTune(block(11))],
  ['setAddonInertia', (s) => s.setAddonInertia(block(3))],
  ['addonsState', (s) => s.addonsState()],
  ['tune', (s) => s.tune()],
  ['powerState', (s) => s.powerState()],
  ['reset', (s) => s.reset()],
]);

/* ---- loadSim's refusals, on hand-assembled modules ---- */

/* A minimal wasm binary: `funcs` names exported as () -> i32 functions
 * (every body returns 0, except _initialize which sets global 0 to 1),
 * an exported mutable i32 global `touched`, and, when asked, an exported
 * memory of one page. */
function tinyWasm({ funcs = [], memory = true } = {}) {
  const leb = (n) => {
    const out = [];
    do {
      let b = n & 0x7f;
      n >>>= 7;
      if (n !== 0) b |= 0x80;
      out.push(b);
    } while (n !== 0);
    return out;
  };
  const str = (s) => [...leb(s.length), ...Buffer.from(s, 'utf8')];
  const section = (id, body) => [id, ...leb(body.length), ...body];
  const bytes = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
  bytes.push(...section(1, [1, 0x60, 0, 1, 0x7f]));
  bytes.push(...section(3, [...leb(funcs.length), ...funcs.map(() => 0)]));
  if (memory) bytes.push(...section(5, [1, 0x00, 1]));
  bytes.push(...section(6, [1, 0x7f, 0x01, 0x41, 0x00, 0x0b]));
  const exps = [];
  funcs.forEach((name, i) => exps.push(...str(name), 0x00, ...leb(i)));
  if (memory) exps.push(...str('memory'), 0x02, 0);
  exps.push(...str('touched'), 0x03, 0);
  bytes.push(...section(7, [...leb(exps.length ? funcs.length + (memory ? 2 : 1) : 0), ...exps]));
  const bodies = funcs.map((name) => {
    const body = name === '_initialize' ? [0x00, 0x41, 0x01, 0x24, 0x00, 0x41, 0x00, 0x0b] : [0x00, 0x41, 0x00, 0x0b];
    return [...leb(body.length), ...body];
  });
  bytes.push(...section(10, [...leb(bodies.length), ...bodies.flat()]));
  return new Uint8Array(bytes);
}

await recAsync('loadSim random bytes', () => mod.loadSim(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9])));
await recAsync('loadSim empty', () => mod.loadSim(new Uint8Array(0)));
await recAsync('loadSim memory only', () => mod.loadSim(tinyWasm()));
for (let i = 1; i < REQUIRED.length; i += 1) {
  await recAsync(`loadSim without ${REQUIRED[i]}`, () => mod.loadSim(tinyWasm({ funcs: REQUIRED.filter((n) => n !== REQUIRED[i]) })));
}
await recAsync('loadSim all functions no memory', () => mod.loadSim(tinyWasm({ funcs: REQUIRED, memory: false })));
await recAsync('loadSim complete, no _initialize', async () => {
  const sim = await mod.loadSim(tinyWasm({ funcs: REQUIRED }));
  return { cls: sim.constructor.name, touched: sim.e.touched.value, abi: sim.abiVersion(), hasE: Object.hasOwn(sim, 'e') };
});
await recAsync('loadSim complete with _initialize', async () => {
  const sim = await mod.loadSim(tinyWasm({ funcs: [...REQUIRED, '_initialize'] }));
  return { touched: sim.e.touched.value, stateSize: sim.stateSize(), readState: withBits(sim.readState()) };
});

/* ---- layer 2: the real module ---- */

const wasmModule = new WebAssembly.Module(wasmBytes);
t.note('wasm imports', WebAssembly.Module.imports(wasmModule));
t.note('wasm non-function exports', WebAssembly.Module.exports(wasmModule).filter((x) => x.kind !== 'function').map((x) => x.name).sort());
t.note('wasm has _initialize', WebAssembly.Module.exports(wasmModule).some((x) => x.name === '_initialize'));

const sim = await mod.loadSim(wasmBytes);
t.note('real: class', [sim.constructor.name, sim instanceof mod.Sim, sim.e instanceof Object, sim.e.memory instanceof WebAssembly.Memory]);
t.note('real: required exports are functions', REQUIRED.every((n) => typeof sim.e[n] === 'function'));

const R = (label, fn) => t.rec(`real: ${label}`, () => shown(fn()));

R('abiVersion', () => sim.abiVersion());
R('stateSize', () => sim.stateSize());
R('before init: reset', () => sim.reset());
R('before init: step', () => sim.step(1));
R('before init: input', () => sim.input(0, 0, 0, 0, 0));
R('before init: setCellVoltage', () => sim.setCellVoltage(4.2));
R('before init: readState', () => sim.readState());
R('before init: readStateBytes', () => sim.readStateBytes());
R('before init: powerState', () => sim.powerState());
R('before init: addonsState', () => sim.addonsState());
R('before init: tune', () => sim.tune());
R('before init: launchControlState', () => sim.launchControlState());
R('init garbage', () => sim.init('this is not a diff\nset nonsense = 1\n'));
R('init empty', () => sim.init(''));
R('init baseline', () => sim.init(baselineDiff));
R('init baseline again', () => sim.init(baselineDiff));
R('after init: readState', () => sim.readState());
R('after init: readStateBytes', () => sim.readStateBytes());
R('setCellVoltage 3.9', () => sim.setCellVoltage(3.9));
R('setCellVoltage 0', () => sim.setCellVoltage(0));
R('setCellVoltage -1', () => sim.setCellVoltage(-1));
R('setCellVoltage NaN', () => sim.setCellVoltage(NaN));
R('setCellVoltage 4.2', () => sim.setCellVoltage(4.2));
R('readState voltage', () => sim.readState());
R('step -1', () => sim.step(-1));
R('step 0', () => sim.step(0));
R('step 1.5', () => sim.step(1.5));
R('input out of range', () => sim.input(0, 2, -2, 2, 2));
R('input NaN', () => sim.input(0, NaN, 0, 0, 0));
R('input backwards in time', () => sim.input(-1, 0, 0, 0, 0));
R('motorOverride 4', () => sim.motorOverride(4, 0.5));
R('motorOverride -2', () => sim.motorOverride(-2, 0.5));
R('motorOverride duty 2', () => sim.motorOverride(0, 2));
R('motorOverride 1 at 0.3', () => sim.motorOverride(1, 0.3));
R('step 50 overridden', () => sim.step(50));
R('readState overridden', () => sim.readState());
R('motorOverride all clear', () => sim.motorOverride(-1, -1));
R('setAngleMode 2', () => sim.setAngleMode(2));
R('setAngleMode false', () => sim.setAngleMode(false));
R('setLaunchControl true', () => sim.setLaunchControl(true));
R('launchControlState', () => sim.launchControlState());
R('setLaunchControl false', () => sim.setLaunchControl(false));
R('launchControlState off', () => sim.launchControlState());
R('rest', () => sim.rest());
R('reset', () => sim.reset());
R('readState after reset', () => sim.readState());

/* The first 1.5 s of the baseline flight, the state every 250 ms. */
{
  let ms = 0;
  let next = 0;
  const END = 1500;
  while (ms < END) {
    while (next < rec.count && Math.floor(rec.samples[next].tUs / 1000) <= ms) {
      const s = rec.samples[next];
      const code = sim.input(s.tUs / 1e6, s.roll, s.pitch, s.yaw, s.throttle);
      if (code !== mod.SIM_OK) t.note(`real: flight input ${next} refused`, code);
      next += 1;
    }
    const boundary = next < rec.count ? Math.floor(rec.samples[next].tUs / 1000) : END;
    const to = Math.min(boundary, END, ms + 250 - (ms % 250));
    const code = sim.step(to - ms);
    if (code !== mod.SIM_OK) t.note(`real: flight step at ${ms}`, code);
    ms = to;
    if (ms % 250 === 0) {
      t.note(`real: flight ${ms} ms state`, bits(sim.readState().state));
      t.note(`real: flight ${ms} ms bytes`, hex(sim.readStateBytes().bytes));
    }
  }
  t.note('real: flight samples fed', next);
}
R('rest in flight', () => sim.rest());
R('readState after rest', () => sim.readState());

/* The blocks: a quad refuses the power option and the tune, a fixed wing
 * refuses a quad's motors. */
const POWER_SKY = f64(0, 1.993, 0, 4, 0.01, 14400, 24.908891, 34.29643466666666, 13616, 45, 0, 0, 0, 0, 0, 0, 3);
const MOTORS_7IN = f64(1.0519999999999998, 0.004702501600115573, 0.0050437299401155725, 0.008584597339999998, 0.007002814,
  0.057120000000000004, 0.000027343999999999998);
const PROP_PACK_7IN = f64(0.0000029498, 3.7348e-8, 0.014149, 0.55, 6, 0.016999999999999998, 1, 0.9617, 0.9164, 0.8633, 0.8018,
  0.7317, 0.6534, 0.5664, 0.4725, 0.3736, 0.271, 0.1662, 0.0615, 0, 0, 1, 1.0186, 1.0281, 1.0281, 1.0145, 0.9858, 0.9368, 0.8725,
  0.787, 0.6868, 0.5662, 0.435, 0.2892, 0, 0);
const ADDONS = f64(0.05, 0.02, 0, -0.01, 0.001, 0.02, 0, -0.01, 0, 0);
const TUNE_WING = f64(0, 0, 0, 0.4363323129985824, 0.20943951023931953, 0, 0.3, 0.3, 0.3, 0, 0);

R('quad: powerState stock', () => sim.powerState());
R('quad: addonsState stock', () => sim.addonsState());
R('quad: tune', () => sim.tune());
R('quad: setPower', () => sim.setPower(POWER_SKY));
R('quad: setTune', () => sim.setTune(TUNE_WING));
R('quad: setAddonInertia without addons', () => sim.setAddonInertia(f64(0.001, 0.001, 0.001)));
R('quad: setAddons', () => sim.setAddons(ADDONS));
R('quad: addonsState seated', () => sim.addonsState());
R('quad: setAddonInertia', () => sim.setAddonInertia(f64(0.001, 0.002, 0.003)));
R('quad: setAddonInertia out of range', () => sim.setAddonInertia(f64(5, 0, 0)));
R('quad: clearAddons', () => sim.clearAddons());
R('quad: addonsState cleared', () => sim.addonsState());
R('quad: setMotors bad mass', () => sim.setMotors(f64(0, 1, 1, 1, 0.01, 0.1, 1e-6)));
R('quad: set airframe 7in', () => sim.e.sim_set_airframe(24));
R('7in: setMotors', () => sim.setMotors(MOTORS_7IN));
R('7in: setPropPack', () => sim.setPropPack(PROP_PACK_7IN));
R('7in: powerState custom', () => sim.powerState());
R('7in: reset', () => sim.reset());
R('7in: step 200', () => sim.step(200));
R('7in: readState', () => sim.readState());
R('7in: clearPower', () => sim.clearPower());
R('7in: powerState cleared', () => sim.powerState());
R('7in: clearTune', () => sim.clearTune());
R('set airframe sky1800', () => sim.e.sim_set_airframe(3));
R('sky: setMotors', () => sim.setMotors(MOTORS_7IN));
R('sky: setPropPack', () => sim.setPropPack(PROP_PACK_7IN));
R('sky: setPower', () => sim.setPower(POWER_SKY));
R('sky: powerState', () => sim.powerState());
R('sky: setPower bad kind', () => sim.setPower(f64(7, 1.993, 0, 4, 0.01, 14400, 24.9, 34.3, 13616, 45, 0, 0, 0, 0, 0, 0, 3)));
R('sky: tune stock', () => sim.tune());
R('sky: setTune', () => sim.setTune(TUNE_WING));
R('sky: tune seated', () => sim.tune());
R('sky: setTune out of range', () => sim.setTune(f64(0, 9, 0, 0.4, 0.2, 0, 0.3, 0.3, 0.3, 0, 0)));
R('sky: tune after refusal', () => sim.tune());
R('sky: setAddons', () => sim.setAddons(ADDONS));
R('sky: addonsState', () => sim.addonsState());
R('sky: reset', () => sim.reset());
R('sky: setCellVoltage 4.1', () => sim.setCellVoltage(4.1));
R('sky: input full throttle', () => sim.input(0, 0, 0, 0, 1));
R('sky: step 300', () => sim.step(300));
R('sky: readState', () => sim.readState());
R('sky: powerState drawn', () => sim.powerState());
R('sky: clearTune', () => sim.clearTune());
R('sky: tune cleared', () => sim.tune());
R('sky: clearAddons', () => sim.clearAddons());
R('sky: clearPower', () => sim.clearPower());
R('sky: powerState stock', () => sim.powerState());
R('sky: init baseline keeps the airframe', () => [sim.init(baselineDiff), sim.e.sim_airframe()]);
R('readState final', () => sim.readState());

/* A second module from the same bytes is a fresh instance: the same
 * reads, nothing shared. */
{
  const other = await mod.loadSim(wasmBytes);
  R('fresh: before init readState', () => other.readState());
  R('fresh: init', () => other.init(baselineDiff));
  R('fresh: step 100', () => other.step(100));
  R('fresh: readState', () => other.readState());
  R('fresh: airframe', () => other.e.sim_airframe());
  R('fresh: distinct memory', () => other.e.memory !== sim.e.memory);
}

t.finish('simmod', PINNED);
