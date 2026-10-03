/*
 * worklet-guard-check.js: no bad quantum silences the game
 * (src/render/worklet-guard.js). In Node, both worklets under a shim of
 * the AudioWorkletGlobalScope:
 *
 *   npm run audio:guard
 *
 * What must hold, for the engine (every model) and the world:
 *   - a quantum of NaN in, or NaN planted in a filter's state, is that one
 *     quantum zeroed: every sample before and after it is finite, and the
 *     sound is back (not silent) within a few quanta
 *   - a process() that throws keeps its node: the next quantum is sound
 *   - each fault posts { fault } with what the processor was given
 *   - the world takes no source or listener that is not finite, and says
 *     how many it refused
 *
 * Before the guard, one NaN quantum left both worklets NaN for good, and
 * their NaN latched the master limiter, so the whole page went silent
 * until a reload: the owner's "the sound keeps stopping" in a war, 2
 * October (docs/AUDIO.md section 12).
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

const RATE = 48000;
const N = 128;
globalThis.sampleRate = RATE;
globalThis.currentTime = 0;
const P = {};
globalThis.AudioWorkletProcessor = class {
  constructor() {
    this.port = { posted: [], postMessage(m) { this.posted.push(m); }, onmessage: null };
  }
};
globalThis.registerProcessor = (name, cls) => {
  P[name] = cls;
};
await import('../../src/render/engine-worklet.js');
await import('../../src/render/world-worklet.js');
const { KINDS, SOURCE_STRIDE } = await import('../../src/render/world-kinds.js');

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  failed += ok ? 0 : 1;
}

const outs = () => [0, 1, 2].map(() => [new Float32Array(N), new Float32Array(N)]);
const finite = (o) => o.every((ch) => ch.every((c) => c.every((v) => Number.isFinite(v))));
const energy = (o) => o.reduce((s, ch) => s + ch.reduce((a, c) => a + c.reduce((b, v) => b + v * v, 0), 0), 0);

/* Run `quanta` quanta of proc, `poke(q)` before each; returns the first
 * non-finite quantum (or -1) and the energy of the last ten. */
function run(proc, quanta, poke, params) {
  let firstBad = -1;
  let tail = 0;
  for (let q = 0; q < quanta; q += 1) {
    globalThis.currentTime = (q * N) / RATE;
    poke(q);
    const o = outs();
    proc.process([], o, params);
    if (!finite(o) && firstBad < 0) {
      firstBad = q;
    }
    if (q >= quanta - 10) {
      tail += energy(o);
    }
  }
  return { firstBad, tail };
}

console.log('the engine worklet:');
const E = P['fdfpv-engine'];
const names = E.parameterDescriptors.map((d) => d.name);
for (const model of ['quad', 'wing', 'edf', 'glow2', 'glow4', 'boxer2', 'turbojet']) {
  const p = new E({ processorOptions: { model } });
  const params = Object.fromEntries(names.map((n) => [n, new Float32Array([n === 'level' ? 1 : 0])]));
  const steady = () => {
    for (const n of names) {
      params[n][0] = n === 'level' ? 1 : 0;
    }
    for (let k = 0; k < 4; k += 1) {
      params[`rpm${k}`][0] = model === 'turbojet' ? 90000 : 9000;
    }
    params.u[0] = 20;
    params.amps[0] = 20;
  };
  const r = run(p, 400, (q) => {
    steady();
    if (q === 100) {
      for (const n of names) {
        params[n][0] = NaN;
      }
    }
  }, params);
  check(`${model}: a quantum of NaN in, and every sample out stays finite`, r.firstBad < 0, `first non-finite quantum ${r.firstBad}`);
  check(`${model}: the sound is back after it`, r.tail > 0, `energy ${r.tail.toExponential(2)}`);
  const fault = p.port.posted.find((m) => m.fault);
  check(`${model}: the fault is reported with what it was given`, Boolean(fault && fault.fault.context && 'params' in fault.fault.context), fault ? `${fault.fault.kind}, ${fault.fault.scrubbed} scrubbed` : 'none');
}
{
  const p = new E({ processorOptions: { model: 'quad' } });
  const params = Object.fromEntries(names.map((n) => [n, new Float32Array([n === 'level' ? 1 : 9000])]));
  const work = p.work;
  let thrown = 0;
  p.work = function once(...a) {
    if (thrown === 0 && globalThis.currentTime > 0.5) {
      thrown = 1;
      throw new Error('a planted throw');
    }
    return work.apply(this, a);
  };
  const r = run(p, 400, () => {}, params);
  check('a process() that throws keeps its node, and sound after', r.firstBad < 0 && r.tail > 0 && thrown === 1, `energy ${r.tail.toExponential(2)}`);
  const fault = p.port.posted.find((m) => m.fault);
  check('the throw is reported', Boolean(fault && fault.fault.kind === 'threw' && /planted/.test(fault.fault.message)), fault ? fault.fault.kind : 'none');
}

console.log('the world worklet:');
const W = P['fdfpv-world'];
function worldFrame(t, poison) {
  const n = 12;
  const src = new Float64Array(n * SOURCE_STRIDE);
  for (let k = 0; k < n; k += 1) {
    const o = k * SOURCE_STRIDE;
    src[o] = k;
    src[o + 1] = KINDS.indexOf(['strike', 'fpv', 'boat', 'loiter'][k % 4]);
    src[o + 2] = 120 * Math.cos(t + k);
    src[o + 3] = 30;
    src[o + 4] = 120 * Math.sin(t + k);
    src[o + 5] = 20;
    src[o + 7] = 20;
    if (poison && k === 2) {
      src[o + 2] = NaN;
    }
  }
  return { t, lis: [0, 2, 0, 0, 0, -1, 1, 0, 0, 0], src };
}
{
  const p = new W({ processorOptions: { guard: false } });
  const r = run(p, 1200, (q) => {
    if (q % 3 === 0) {
      p.message({ frame: worldFrame((q * N) / RATE, q === 300) });
    }
    if (q === 330) {
      p.message({ frame: { ...worldFrame((q * N) / RATE, false), lis: [NaN, 2, 0, 0, 0, -1, 1, 0, 0, 0] } });
    }
  });
  check('a source and a listener that are not finite are refused, and counted', p.stats.rejected === 2, `${p.stats.rejected} refused`);
  check('and every sample stays finite, with sound', r.firstBad < 0 && r.tail > 0, `first non-finite ${r.firstBad}, energy ${r.tail.toExponential(2)}`);
}
{
  /* Past the boundary: NaN planted in a voice's filter, what a 0 / 0
   * inside would leave. */
  const p = new W({ processorOptions: { guard: false } });
  const r = run(p, 1200, (q) => {
    if (q % 3 === 0) {
      p.message({ frame: worldFrame((q * N) / RATE, false) });
    }
    if (q === 400) {
      const v = p.voices.find((x) => x.track);
      v.absorb = NaN;
      v.line.fill(NaN);
    }
  });
  check('NaN planted in a voice is one quantum zeroed, then sound', r.firstBad < 0 && r.tail > 0, `first non-finite ${r.firstBad}, energy ${r.tail.toExponential(2)}`);
  const fault = p.port.posted.find((m) => m.fault);
  check('the fault is reported with the listener and the voices', Boolean(fault && fault.fault.context && fault.fault.context.voices), fault ? `${fault.fault.kind}, ${fault.fault.context.voices.length} voices` : 'none');
}

if (failed) {
  console.log(`audio:guard: ${failed} FAILED`);
  process.exit(1);
}
console.log('audio:guard: all passed');
