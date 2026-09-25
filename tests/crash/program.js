/*
 * program.js: a crash scenario as the list of module calls it made, and
 * the hash of the state trace those calls produce.
 *
 * A scenario's pilot and its obstacle test are harness arithmetic: JS
 * maths, not specified to the bit between engines, so they are not allowed
 * to run inside the cross-host check (CLAUDE.md, and the same argument
 * tests/lib/wingpilot.js makes for its recordings). So the suite flies each
 * scenario once, in Node, through a Recorder that forwards every call that
 * writes the module and writes it down with its arguments. What the check
 * then replays, in Node and in Chrome, is that list: numbers only, which
 * JSON carries to the page bit exact, so the only arithmetic left on either
 * side is the module's own.
 *
 * Calls that only read the module (sim_state, sim_wheel_loads, the damage
 * readback) are not written down: they change nothing the trace can see.
 *
 * The trace is the state block and, on a module with the crash ABI, every
 * part's state (sim_parts_state) at each sample: a part that broke off,
 * where it flew and where it lies are hashed with the craft, so a
 * divergence in the damage model fails the check even when the craft's own
 * state agrees.
 *
 * Environment neutral: runs unchanged in Node and in the browser.
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

import { SIM_OK } from '../lib/simmod.js';
import { sha256Hex } from '../lib/replay.js';
import { PARTS_MAX, PART_STATE_DOUBLES } from '../../configs/parts.js';
import { damageReader } from './readback.js';

/* The state is captured into the hash every this many milliseconds of sim
 * time, and once more at the end. Every step would be 4 times the bytes
 * and no more evidence: a divergence anywhere carries into every later
 * sample. */
export const TRACE_STRIDE_MS = 4;

/* The state block and every part's state, as bytes. The parts buffer is
 * allocated once per module; reading it writes nothing the plant sees. */
function sample(sim) {
  const { code, bytes } = sim.readStateBytes();
  if (code !== SIM_OK) {
    throw new Error(`sim_state: ${code}`);
  }
  if (typeof sim.e.sim_parts_state !== 'function') {
    return [bytes];
  }
  if (!sim.crashPartsPtr) {
    sim.crashPartsPtr = sim.e.malloc(PARTS_MAX * PART_STATE_DOUBLES * 8);
  }
  const c = sim.e.sim_parts_state(sim.crashPartsPtr);
  if (c !== SIM_OK) {
    throw new Error(`sim_parts_state: ${c}`);
  }
  const n = sim.e.sim_parts_count() * PART_STATE_DOUBLES * 8;
  return [bytes, new Uint8Array(new Uint8Array(sim.e.memory.buffer, sim.crashPartsPtr, n))];
}

/*
 * The one stepper both sides use, so the live run and its replay capture
 * the same samples. Steps one millisecond at a time (sim_abi.h: how the
 * host batches steps must not change the trajectory) and calls onMs after
 * each, which is where the suite reads its peak loads.
 */
function stepCapture(sim, n, clock, chunks, onMs) {
  for (let i = 0; i < n; i += 1) {
    const code = sim.e.sim_step(1);
    if (code !== SIM_OK) {
      throw new Error(`sim_step: ${code}`);
    }
    clock.ms += 1;
    if (clock.ms % TRACE_STRIDE_MS === 0) {
      chunks.push(...sample(sim));
    }
    if (onMs) {
      onMs(clock.ms);
    }
  }
}

export class Recorder {
  constructor(sim, { onMs = null } = {}) {
    this.sim = sim;
    this.ops = [];
    this.chunks = [];
    this.clock = { ms: 0 };
    this.onMs = onMs;
  }

  /* sim_init with the diff text, written down as ['init'] because both
   * sides load the same fixture themselves. */
  init(configText) {
    const code = this.sim.init(configText);
    this.ops.push(['init']);
    this.capture();
    return code;
  }

  /* Any entry point that writes the module. Returns what it returned, so
   * a scenario can refuse a bad code the way the gates do. */
  call(name, ...args) {
    const fn = this.sim.e[name];
    if (typeof fn !== 'function') {
      throw new Error(`sim.wasm does not export ${name}`);
    }
    for (const a of args) {
      if (typeof a !== 'number' || !Number.isFinite(a)) {
        throw new Error(`${name}: argument ${a} is not a finite number`);
      }
    }
    const r = fn(...args);
    this.ops.push([name, ...args]);
    return r;
  }

  step(n) {
    stepCapture(this.sim, n, this.clock, this.chunks, this.onMs);
    const last = this.ops[this.ops.length - 1];
    if (last && last[0] === 'step') {
      last[1] += n;
    } else {
      this.ops.push(['step', n]);
    }
  }

  capture() {
    this.chunks.push(...sample(this.sim));
  }

  async hash() {
    return sha256Hex([...this.chunks, ...sample(this.sim)]);
  }
}

/*
 * Replay a program on a freshly loaded module and return the trace hash
 * and the damage readback at the end (null on a module without the crash
 * ABI). The same bytes in the same order as the Recorder that wrote it, or
 * the program did not capture everything the live run did to the module.
 * The readback's per step memory (events, peak loads) is the live run's
 * alone, so what the replay's summary is compared on is its end state.
 */
export async function replayProgram(sim, configText, ops) {
  const chunks = [];
  const clock = { ms: 0 };
  for (const op of ops) {
    const [name, ...args] = op;
    if (name === 'init') {
      const code = sim.init(configText);
      if (code !== SIM_OK) {
        throw new Error(`sim_init: ${code}`);
      }
      chunks.push(...sample(sim));
    } else if (name === 'step') {
      stepCapture(sim, args[0], clock, chunks, null);
    } else {
      const fn = sim.e[name];
      if (typeof fn !== 'function') {
        throw new Error(`sim.wasm does not export ${name}`);
      }
      fn(...args);
    }
  }
  const hash = await sha256Hex([...chunks, ...sample(sim)]);
  const reader = damageReader(sim);
  return { hash, damage: reader ? endState(reader.read()) : null };
}

/* The part of a readback both hosts can compare: the end state. */
export function endState(d) {
  return {
    broken: [...d.broken].sort(),
    damaged: [...d.damaged].sort(),
    flags: d.flags,
    parts: d.parts.map((p) => [p.status, p.damage, p.energyJ, ...p.pos]),
  };
}
