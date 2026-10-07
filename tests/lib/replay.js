/*
 * replay.js: feed a Sim a recorded stick stream or a scripted one, sample
 * its state block along the way and hash the samples.
 *
 * Runs unchanged in Node and in the browser, so nothing here comes from
 * node:*; the hash is WebCrypto SHA-256 over the raw little-endian state
 * bytes, with no number formatting anywhere near it.
 *
 * The one rule that makes the hash comparable across hosts: a sample with
 * timestamp tUs is handed to sim_input before the 1 ms step that covers
 * floor(tUs / 1000) runs. The render rate decides only how many whole
 * milliseconds are batched into one sim_step call, never which sample
 * precedes which step, so a module that honours sim_abi.h gives the same
 * trace at 7 Hz, 60 Hz and 2400 Hz.
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

export class SimError extends Error {
  constructor(code, where) {
    super(`${where}: sim returned ${simErrorName(code)} (${code})`);
    this.code = code;
    this.errorName = simErrorName(code);
    this.where = where;
  }
}

export function must(code, where) {
  if (code !== SIM_OK) {
    throw new SimError(code, where);
  }
}

export async function sha256Hex(chunks) {
  const joined = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    joined.set(c, at);
    at += c.length;
  }
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', joined));
  let hex = '';
  for (const b of digest) {
    hex += (b < 16 ? '0' : '') + b.toString(16);
  }
  return hex;
}

/* The millisecond step a recorded sample belongs to. */
const stepOf = (sample) => Math.floor(sample.tUs / 1000);

/*
 * The recording's samples in order, each handed to the sim exactly once,
 * the moment the step it belongs to is about to run.
 */
function sampleQueue(sim, rec) {
  let next = 0;
  return {
    /* Hand over every sample due at or before step `ms`. */
    deliverThrough(ms) {
      while (next < rec.count && stepOf(rec.samples[next]) <= ms) {
        const s = rec.samples[next];
        must(sim.input(s.tUs / 1e6, s.roll, s.pitch, s.yaw, s.throttle), 'sim_input');
        next += 1;
      }
    },
    /* The step the next undelivered sample belongs to; none left reads as
     * never. */
    nextDueMs() {
      return next < rec.count ? stepOf(rec.samples[next]) : Infinity;
    },
  };
}

/* The trace: the state block's raw bytes, one chunk per capture. */
function stateRecorder(sim) {
  const chunks = [];
  return {
    chunks,
    take() {
      const read = sim.readStateBytes();
      must(read.code, 'sim_state');
      chunks.push(read.bytes);
    },
  };
}

/* Bring a fresh sim to the point where the recording's first sample makes
 * sense: the config, an optional pack voltage, then whatever the recording
 * assumed had happened (an airframe, a hand launch). */
function prepare(sim, opts) {
  must(sim.init(opts.configText), 'sim_init');
  const volts = opts.cellVoltage;
  if (volts != null) {
    must(sim.setCellVoltage(volts), 'sim_set_cell_voltage');
  }
  opts.prelude?.(sim);
}

/*
 * Replay a decoded .rec through the sim the way a render loop at
 * opts.renderHz would drive it, and return the SHA-256 hex of the state
 * trace. The trace holds the state at 0 ms and at every multiple of
 * opts.traceStrideMs the recording's duration reaches; nothing is added at
 * the end unless the stride lands there. The rest of opts: configText is
 * the Betaflight diff for sim_init, cellVoltage (undefined or null to leave
 * the plant's default) and prelude(sim) are applied in that order before
 * the first sample.
 */
export async function replayTrace(sim, rec, opts) {
  const { renderHz, traceStrideMs } = opts;
  prepare(sim, opts);

  const endMs = Math.round((rec.count * 1000) / rec.rateHz);
  const queue = sampleQueue(sim, rec);
  const trace = stateRecorder(sim);
  trace.take();

  let nowMs = 0;
  let captureAtMs = traceStrideMs;
  for (let frame = 1; nowMs < endMs; frame += 1) {
    const frameEndMs = Math.min(Math.floor((frame * 1000) / renderHz), endMs);
    /* A frame shorter than a millisecond ends where the last one did and
     * runs no step; the loop simply moves on to the next frame. */
    while (nowMs < frameEndMs) {
      queue.deliverThrough(nowMs);
      /* Run whole steps up to whichever comes first: the frame's end, the
       * step a pending sample must precede, or a trace capture. The ABI
       * permits any batching, so this batch is only about doing the
       * bookkeeping at the right instants. */
      const stopMs = Math.max(nowMs + 1, Math.min(frameEndMs, queue.nextDueMs(), captureAtMs));
      must(sim.step(stopMs - nowMs), 'sim_step');
      nowMs = stopMs;
      if (nowMs === captureAtMs) {
        trace.take();
        captureAtMs += traceStrideMs;
      }
    }
  }
  return sha256Hex(trace.chunks);
}

/*
 * Fly a scripted stick program: each segment holds the sticks for durMs
 * (missing channels read as 0), one sim_step per millisecond, and onStep
 * (when given) sees (tMs, state) after every step. The sim must already be
 * initialised and reset.
 *
 * startMs is where the sim's clock stands. sim_abi.h wants input
 * timestamps non-decreasing, so a second runScript on the same sim without
 * a reset must start from what the first returned.
 */
export function runScript(sim, segments, onStep, startMs = 0) {
  const stick = (v) => v ?? 0;
  const observe = onStep
    ? (tMs) => {
      const read = sim.readState();
      must(read.code, 'sim_state');
      onStep(tMs, read.state);
    }
    : () => {};
  let clockMs = startMs;
  for (const seg of segments) {
    const code = sim.input(clockMs / 1000, stick(seg.roll), stick(seg.pitch), stick(seg.yaw), stick(seg.throttle));
    must(code, 'sim_input');
    for (let left = seg.durMs; left > 0; left -= 1) {
      must(sim.step(1), 'sim_step');
      clockMs += 1;
      observe(clockMs);
    }
  }
  return clockMs;
}

/* Indices into the state block, as laid out in src/native/sim_abi.h. */
export const ST = {
  T: 0,
  PX: 1,
  PY: 2,
  PZ: 3,
  VX: 4,
  VY: 5,
  VZ: 6,
  QW: 7,
  QX: 8,
  QY: 9,
  QZ: 10,
  P: 11,
  Q: 12,
  R: 13,
  RPM0: 14,
  RPM1: 15,
  RPM2: 16,
  RPM3: 17,
  VBAT: 18,
  AMPS: 19,
};
