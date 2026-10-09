/*
 * simmod.js: dist/sim.wasm as a JavaScript object, over the C ABI that
 * src/native/sim_abi.h declares.
 *
 * Runs unchanged in Node and the browser: no imports, only WebAssembly and
 * TextEncoder, which both have. The module is linked STANDALONE_WASM, so
 * it exports its own memory and its C symbols under their own names, and
 * asks the host for nothing the physics depends on; whatever libc shim it
 * does import is answered by a function returning 0.
 *
 * The raw exports stay reachable as `sim.e`: the ABI is wide and most of
 * it (airframes, contacts, water, damage, the readers) is called straight
 * through that by the shell and the harnesses. This class wraps only the
 * part that needs marshalling: UTF-8 in, blocks of doubles in and out.
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

/* The codes and sizes sim_abi.h defines. */
export const SIM_OK = 0;
export const SIM_ERR_NOT_IMPLEMENTED = -1;
export const SIM_ERR_BAD_ARG = -2;
export const SIM_ERR_BAD_STATE = -3;
export const SIM_ERR_CONFIG_PARSE = -4;
export const SIM_ABI_VERSION = 1;
export const POWER_STATE_DOUBLES = 10;
export const TUNE_DOUBLES = 12;
const ADDONS_STATE_DOUBLES = 8;

export function simErrorName(code) {
  switch (code) {
    case SIM_OK: return 'OK';
    case SIM_ERR_NOT_IMPLEMENTED: return 'NOT_IMPLEMENTED';
    case SIM_ERR_BAD_ARG: return 'BAD_ARG';
    case SIM_ERR_BAD_STATE: return 'BAD_STATE';
    case SIM_ERR_CONFIG_PARSE: return 'CONFIG_PARSE';
    default: return `ERR_${code}`;
  }
}

/* What every host needs from the module, in the order a missing one is
 * reported. The rest of the ABI is optional here: a host that calls an
 * export this list does not name finds out at the call. */
const NEEDED = [
  'sim_abi_version', 'sim_init', 'sim_reset', 'sim_set_cell_voltage', 'sim_input', 'sim_step', 'sim_motor_override',
  'sim_rest', 'sim_set_angle_mode', 'sim_set_launch_control', 'sim_launch_control_state', 'sim_state_size', 'sim_state',
  'malloc', 'free',
];

export async function loadSim(wasmBytes) {
  const module = await WebAssembly.compile(wasmBytes);
  const imports = {};
  for (const { module: from, name } of WebAssembly.Module.imports(module)) {
    (imports[from] ??= {})[name] = () => 0;
  }
  const instance = await WebAssembly.instantiate(module, imports);
  const e = instance.exports;
  /* Static constructors, which a module without main() leaves to the host. */
  if (typeof e._initialize === 'function') e._initialize();
  const missing = NEEDED.find((name) => typeof e[name] !== 'function');
  if (missing) throw new Error(`sim.wasm does not export ${missing}`);
  if (!(e.memory instanceof WebAssembly.Memory)) throw new Error('sim.wasm does not export its memory');
  return new Sim(e);
}

/* The blocks of doubles the module takes: method name, export, and how the
 * block is named when its copy cannot be allocated. */
const BLOCKS_IN = [
  ['setPower', 'sim_set_power', 'the power block'],
  ['setMotors', 'sim_set_motors', 'the motors block'],
  ['setPropPack', 'sim_set_prop_pack', 'the prop and pack block'],
  ['setAddons', 'sim_set_addons', 'the add-on block'],
  ['setAddonInertia', 'sim_set_addon_inertia', 'the add-on inertia block'],
  ['setTune', 'sim_wing_set_tune', 'the tune block'],
];

/* A block the module writes into, kept for the instance's life and keyed
 * by the export that fills it. The heap's refusal (0) is not kept, so the
 * next call asks again. */
function outPtr(sim, name, doubles) {
  let ptr = sim.out.get(name);
  if (!ptr) {
    ptr = sim.e.malloc(doubles * 8);
    if (ptr) sim.out.set(name, ptr);
  }
  return ptr;
}

/* Hand `params` to the entry point `name` as a block of doubles the module
 * may read during the call only. */
function pushDoubles(sim, name, params, what) {
  const ptr = sim.e.malloc(params.length * 8);
  if (!ptr) throw new Error(`sim.wasm malloc failed for ${what}`);
  new Float64Array(sim.e.memory.buffer, ptr, params.length).set(params);
  const code = sim.e[name](ptr);
  sim.e.free(ptr);
  return code;
}

/* sim_state into a fresh `View` over a copy of the block, which the caller
 * owns: `{ code, block }`, the block null unless the code is SIM_OK. */
function stateInto(sim, View) {
  const n = sim.ensureStateBuffer();
  if (n <= 0) return { code: n, block: null };
  const ptr = sim.out.get('sim_state');
  const code = sim.e.sim_state(ptr);
  if (code !== SIM_OK) return { code, block: null };
  return { code, block: new View(sim.e.memory.buffer.slice(ptr, ptr + n * 8)) };
}

/* A named reader's block, SIM_*_STATE_DOUBLES, read now. It throws when
 * the module refuses: these never fail on a loaded module, so a refusal
 * means the host is confused. */
function readNamed(sim, name, doubles) {
  const ptr = outPtr(sim, name, doubles);
  const code = sim.e[name](ptr);
  if (code !== SIM_OK) throw new Error(`${name} returned ${code}`);
  return new Float64Array(sim.e.memory.buffer, ptr, doubles);
}

export class Sim {
  constructor(exports) {
    this.e = exports;
    /* Pointers to the blocks the module writes into, allocated once each
     * on first use and never freed, keyed by the export that fills them. */
    this.out = new Map();
    this.stateDoubles = 0;
  }

  abiVersion() {
    return this.e.sim_abi_version();
  }

  /* A Betaflight CLI diff, UTF-8. Reparses and resets; the airframe and
   * the seated blocks survive, as sim_abi.h says. */
  init(diffText) {
    const utf8 = new TextEncoder().encode(diffText);
    const ptr = this.e.malloc(utf8.length || 1);
    if (!ptr) throw new Error('sim.wasm malloc failed');
    new Uint8Array(this.e.memory.buffer, ptr, utf8.length).set(utf8);
    const code = this.e.sim_init(ptr, utf8.length);
    this.e.free(ptr);
    return code;
  }

  reset() {
    return this.e.sim_reset();
  }

  setCellVoltage(volts) {
    return this.e.sim_set_cell_voltage(volts);
  }

  /* One stick sample on the simulated clock, RC convention: roll right,
   * pitch nose up and yaw nose right positive, throttle 0 to 1. */
  input(tSeconds, roll, pitch, yaw, throttle) {
    return this.e.sim_input(tSeconds, roll, pitch, yaw, throttle);
  }

  /* n fixed 1 ms steps. */
  step(n) {
    return this.e.sim_step(n);
  }

  /* Bench override of one motor's duty (0 to 3, or -1 for all); a negative
   * duty clears it. */
  motorOverride(motor, duty) {
    return this.e.sim_motor_override(motor, duty);
  }

  /* A judged landing: the ground takes the velocity and the body rates. */
  rest() {
    return this.e.sim_rest();
  }

  /* Betaflight ANGLE_MODE; off is acro. */
  setAngleMode(on) {
    return this.e.sim_set_angle_mode(on ? 1 : 0);
  }

  setLaunchControl(on) {
    return this.e.sim_set_launch_control(on ? 1 : 0);
  }

  launchControlState() {
    return this.e.sim_launch_control_state();
  }

  /* Doubles in the state block, SIM_STATE_DOUBLES, or an error code. */
  stateSize() {
    return this.e.sim_state_size();
  }

  /* The state block's doubles once its buffer exists, else the size the
   * module reported (0 or an error code), so a caller can pass it on. */
  ensureStateBuffer() {
    if (this.out.has('sim_state')) return this.stateDoubles;
    const n = this.stateSize();
    if (n <= 0) return n;
    const ptr = this.e.malloc(n * 8);
    if (!ptr) throw new Error('sim.wasm malloc failed for state buffer');
    this.out.set('sim_state', ptr);
    this.stateDoubles = n;
    return n;
  }

  /* { code, state }: the state block as a Float64Array copy. */
  readState() {
    const { code, block } = stateInto(this, Float64Array);
    return { code, state: block };
  }

  /* { code, bytes }: the same block as its little-endian bytes, for a trace
   * hash that never formats a float. */
  readStateBytes() {
    const { code, block } = stateInto(this, Uint8Array);
    return { code, bytes: block };
  }

  clearPower() {
    return this.e.sim_power_clear();
  }

  clearAddons() {
    return this.e.sim_addons_clear();
  }

  clearTune() {
    return this.e.sim_wing_tune_clear();
  }

  /* The tune in force on a fixed wing, SIM_TUNE_DOUBLES, a copy; null on
   * a quad or before init. */
  tune() {
    const ptr = this.e.malloc(TUNE_DOUBLES * 8);
    const code = this.e.sim_wing_tune(ptr);
    const block = code === SIM_OK ? new Float64Array(this.e.memory.buffer.slice(ptr, ptr + TUNE_DOUBLES * 8)) : null;
    this.e.free(ptr);
    return block;
  }

  /* sim_power_state, by field. */
  powerState() {
    const f = readNamed(this, 'sim_power_state', POWER_STATE_DOUBLES);
    return {
      soc: f[0],
      chargeC: f[1],
      cellOcv: f[2],
      fuelM3: f[3],
      fuelFrac: f[4],
      running: f[5] === 1,
      lean: f[6] === 1,
      capacityC: f[7],
      tankM3: f[8],
      custom: f[9] === 1,
    };
  }

  /* sim_addons_state, by field. */
  addonsState() {
    const f = readNamed(this, 'sim_addons_state', ADDONS_STATE_DOUBLES);
    return { on: f[0] === 1, massKg: f[1], cda: f[2], shift: [f[3], f[4], f[5]], wheelR: f[6], thrustN: f[7] };
  }
}

for (const [method, name, what] of BLOCKS_IN) {
  Sim.prototype[method] = function seat(params) {
    return pushDoubles(this, name, params, what);
  };
}
