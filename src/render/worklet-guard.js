/*
 * worklet-guard.js: what keeps one bad quantum in an AudioWorkletProcessor
 * from silencing the game until a reload. Imported by
 * src/render/engine-worklet.js and src/render/world-worklet.js.
 *
 * A worklet's filters and delay lines feed back. One NaN in their state
 * (a NaN input, a 0 / 0) stays in it for good, so every quantum after is
 * NaN; and the worklets' outputs meet in the master limiter, a
 * DynamicsCompressorNode whose own envelope then latches NaN, which
 * silences everything on the page, the music too, until the page is
 * reloaded. A process() that throws is worse: the node is dead for good,
 * and says so only to a processorerror listener.
 *
 * So each processor runs its work through guard(): a throw, or a quantum
 * with a non-finite sample, zeroes that quantum's outputs before they
 * leave the node, scrubs every non-finite number out of the processor's
 * state so the next quantum starts clean, and posts { fault } to the main
 * thread (src/render/audio.js logs it, loudly, and counts it) at most
 * once a second, with what the processor was given (its faultContext),
 * the evidence for whatever produced it. The sound drops for 3 ms instead of for good.
 *
 * Not the physics path: none of this reaches the plant.
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

/* The deepest a scrub walks into a processor's state: a processor, its
 * voices, a voice's filters, their arrays. */
const SCRUB_DEPTH = 5;
/* At most one fault message a second, in the audio's own time. */
const REPORT_S = 1;

/* Every non-finite number in `o` and what it holds, set to 0: plain NaN
 * fields (an infinite plain field may be meant, a "never" time, and is
 * left), and every non-finite element of a typed array (filter state,
 * delay lines). Returns how many it set. */
export function scrub(o, depth = 0, seen = new Set()) {
  if (o == null || typeof o !== 'object' || seen.has(o) || depth > SCRUB_DEPTH) {
    return 0;
  }
  seen.add(o);
  let n = 0;
  if (ArrayBuffer.isView(o)) {
    for (let i = 0; i < o.length; i += 1) {
      if (!Number.isFinite(o[i])) {
        o[i] = 0;
        n += 1;
      }
    }
    return n;
  }
  const values = o instanceof Map ? [...o.values()] : null;
  if (values) {
    for (const v of values) {
      n += scrub(v, depth + 1, seen);
    }
    return n;
  }
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (typeof v === 'number') {
      if (Number.isNaN(v)) {
        o[k] = 0;
        n += 1;
      }
    } else if (v && typeof v === 'object') {
      n += scrub(v, depth + 1, seen);
    }
  }
  return n;
}

/* Whether every sample of every channel of every output is finite. */
function finite(outputs) {
  for (const out of outputs) {
    for (const ch of out) {
      for (let i = 0; i < ch.length; i += 1) {
        const v = ch[i];
        if (v - v !== 0) {
          return false;
        }
      }
    }
  }
  return true;
}

/*
 * Run proc.work(inputs, outputs, params) and keep the node alive whatever
 * it does: see the header. `proc.reset` (optional) is called after a
 * scrub, for what a processor wants to start over (a voice pool, its
 * sources). Always returns true, the node's keep alive.
 */
export function guard(proc, inputs, outputs, params) {
  let error = null;
  try {
    proc.work(inputs, outputs, params);
  } catch (e) {
    error = e;
  }
  if (!error && finite(outputs)) {
    return true;
  }
  for (const out of outputs) {
    for (const ch of out) {
      ch.fill(0);
    }
  }
  /* What the processor was given, before the scrub erases it: the
   * failing quantum's evidence. */
  let context = null;
  try {
    context = typeof proc.faultContext === 'function' ? proc.faultContext(params) : null;
  } catch (e) {
    context = { unreadable: String(e) };
  }
  const scrubbed = scrub(proc);
  if (typeof proc.reset === 'function') {
    proc.reset();
  }
  proc.faults = (proc.faults || 0) + 1;
  const now = currentTime;
  if (!(proc.reportedAt > now - REPORT_S)) {
    proc.reportedAt = now;
    proc.port.postMessage({
      fault: {
        kind: error ? 'threw' : 'non-finite',
        message: error ? String(error && error.stack ? error.stack : error) : null,
        scrubbed,
        context,
        faults: proc.faults,
        at: now,
      },
    });
  }
  return true;
}
