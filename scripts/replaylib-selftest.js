/*
 * replaylib-selftest.js: tests/lib/replay.js pinned by transcript digest.
 *
 *     node scripts/replaylib-selftest.js            (npm run replaylib:selftest)
 *     node scripts/replaylib-selftest.js --print    show every digest, pinned or not
 *
 * replayTrace is what turns a recording into the state trace hash that the
 * baseline goldens and the gates compare bit for bit, so the thing worth
 * pinning is not just its answer on one recording but its schedule: which
 * sample is fed before which step, where the frames end for a render rate,
 * where the trace is captured, and what happens when none of those divide
 * evenly. Each case below is a digest over a JSON transcript, and the
 * digests were taken from the module as it stood before its rewrite.
 *
 *   trace.*     replayTrace on the real dist/sim.wasm, several recordings and
 *               option mixes; the returned hex and its shape.
 *   sched.*     the exact call sequence (method and arguments) replayTrace
 *               makes on a recording Sim, for synthetic recordings built to
 *               land samples on frame edges, stride edges, twice in one
 *               millisecond and past the end, and for a slice of the real
 *               baseline through the real module.
 *   script.*    runScript's end time and onStep sequence on a recording Sim
 *               and on the real module, with startMs threaded through.
 *   must.*      must and SimError for every error code and an unknown one.
 *   sha256.*    sha256Hex over a few chunk lists, empty included.
 *   st          the ST index table.
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

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeRec } from '../tests/lib/recfile.js';
import { loadSim } from '../tests/lib/simmod.js';
import { SimError, must, sha256Hex, replayTrace, runScript, ST } from '../tests/lib/replay.js';
import { wingPrelude, skyPrelude } from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const printAll = process.argv.includes('--print');

/* Digests taken on the module before its rewrite. A change here means the
 * trace, the schedule or the contract moved; the rewrite is wrong, not the
 * pin. */
const PINNED = {
  'trace.baseline.60.10': '4458a33d2e47833754ccfa09548cc5cb7b9654be8026a7902a76c71dee84ba2a',
  'trace.baseline.144.10': '4458a33d2e47833754ccfa09548cc5cb7b9654be8026a7902a76c71dee84ba2a',
  'trace.baseline.7.10': '4458a33d2e47833754ccfa09548cc5cb7b9654be8026a7902a76c71dee84ba2a',
  'trace.baseline.60.33': '7d60018ccc46db9740c26ae91a55b7346a94d7fc4c30227903e1e40e3e8b945f',
  'trace.baseline.60.1.v4': '6e5a62458fa4ef70e3372aaea73bed7afc996d2987c2d382d98c38ed29f4caba',
  'trace.baseline.1000.10.v0': '793fc5e55f9746c83b70da9fea15e666bfa18d44f0cb255e4720e9f0cc0de0aa',
  'trace.baseline.2400.10': '4458a33d2e47833754ccfa09548cc5cb7b9654be8026a7902a76c71dee84ba2a',
  'trace.baseline.30.7.vnull': '0cbbaec9f1eebc99a4843b25f453f161af329d5b76e4f74b6b8bcb6445744c78',
  /* Re-pinned: the props' gyroscope (docs/FLIGHTMODEL.md). */
  'trace.wing.60.10': 'f9167edf03b4a8e0d4479bee71c253b494b40ecf52ef84fcbe44a8230cc3f067',
  'trace.wing.50.10.v3.9': 'f9167edf03b4a8e0d4479bee71c253b494b40ecf52ef84fcbe44a8230cc3f067',
  /* Re-pinned: the props' gyroscope (docs/FLIGHTMODEL.md). */
  /* Re-pinned: the fuselage's crossflow (docs/FLIGHTMODEL.md). */
  /* Re-pinned: the Skyhunter's wash (docs/FLIGHTMODEL.md). */
  'trace.sky.60.10': '39baf1fb639f06ae323895d5f5637006ae9b4983e805adc7aa684efadfc03a89',
  /* p51-air.rec, re-recorded with the slipstream (docs/FLIGHTMODEL.md). */
  /* Re-pinned: the fuselage's crossflow (docs/FLIGHTMODEL.md). */
  /* Re-pinned: the swirl's share, Selig 2010 (docs/FLIGHTMODEL.md). */
  'trace.p51.72.25': '4996cd1d34b4c9cee45f84eed7fb1df61cced965ad84fc802cb3348d5f3141aa',
  'sched.synth.7.3': '270520e4786599629a80707ecea1fc770ba7ab7b506ca9c7891cca558b6255c7',
  'sched.synth.2400.10': 'ad13aaf94ed8f5acb03d5bc84802b3443853414269abcb78feb1521001782948',
  'sched.synth.60.10.one': 'c7b0d1d856cfdc00c800f8192e144d73df5243b9610b43180cd93b45c97433ce',
  'sched.synth.60.10.none': '8bc27ede87c883fc1f19de90999c4be4c3b9c8bdc75fb136de9f02018964d6ff',
  'sched.synth.60.7': 'a69048a3a06997073726cbb83efc477e7db497ff2b65d8e0d5d1411dc99520de',
  'sched.opts.none': 'af5d0b8c2a40b58c23e9233b732251dcf18ccc023de660f626dbef9a12ae0797',
  'sched.opts.null': 'af5d0b8c2a40b58c23e9233b732251dcf18ccc023de660f626dbef9a12ae0797',
  'sched.opts.zero': '516f841ea1823f74f53cf8ed164c0ecc9ce334d692a660501bd5ea37775638aa',
  'sched.opts.volts': 'e681610e9c4dcbf0ed1971f1134616b95a885c64d5d9bfb7bc0d6940888e3a9c',
  'sched.opts.prelude': 'bd707fc549536532dee6c60507a97a11f9ae4033906075d0c5c0c55911e512b8',
  'sched.real.60.10': '1d8208a80630be48bd6bc8db7b9d8be77babc7c68486c7180cb8fa76e426d927',
  'sched.real.144.7': 'b0f7d9c437008bf40dc804f82bae41d63fcc90cb2f3665a3e998cbc693b84f85',
  'script.fake.onstep': '8a0d0b56cf43028093ddd65733263debdf84f701e969e0595765e7a7d02db256',
  'script.fake.silent': 'd68e1a6ae877a297cbf895499964fc9d38ce1cdb2bdb3baf5b97a0307e6204b1',
  'script.real': '4ea9d60c79bb86a820684788adc963e02694253036e2db91b2ba6452c4761ee6',
  'must.codes': 'f898483a4aed452cac3fbb8f03200e9805447a167ee567c2e0f46781f8ea4c57',
  'sha256.chunks': 'eee950733a3d409c9c55da61fe66390b89d6b031f58f0739a2365a7021f64ac2',
  'st': 'bceac134e553c23ea84317029ee8c2255dd5bcc145e47bdb12c026fd649a6b7a',
};

const digests = {};
let failed = 0;

function digestOf(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function pin(name, value) {
  digests[name] = digestOf(value);
}

function hexBytes(bytes) {
  return Buffer.from(bytes).toString('hex');
}

/*
 * A Sim that records every call. Each method answers SIM_OK; readStateBytes
 * hands back a counter so every capture is distinct and the returned digest
 * depends on how many captures happened and in what order.
 */
function recordingSim() {
  const calls = [];
  let captures = 0;
  const sim = {
    calls,
    e: {
      sim_set_airframe: (id) => { calls.push(['e.sim_set_airframe', id]); return 0; },
    },
    init: (text) => { calls.push(['init', text.length]); return 0; },
    reset: () => { calls.push(['reset']); return 0; },
    setCellVoltage: (v) => { calls.push(['setCellVoltage', v]); return 0; },
    input: (t, r, p, y, th) => { calls.push(['input', t, r, p, y, th]); return 0; },
    step: (n) => { calls.push(['step', n]); return 0; },
    readStateBytes: () => {
      captures += 1;
      calls.push(['readStateBytes']);
      return { code: 0, bytes: new Uint8Array([captures & 255, captures >> 8]) };
    },
    readState: () => {
      captures += 1;
      calls.push(['readState']);
      return { code: 0, state: new Float64Array([captures, captures * 0.5]) };
    },
  };
  return sim;
}

/* Wrap the real Sim so the schedule it is driven with is on the record and
 * the plant still answers. */
function recorded(sim) {
  const calls = [];
  const proxy = new Proxy(sim, {
    get(target, prop) {
      const v = target[prop];
      if (typeof v !== 'function') {
        return v;
      }
      return (...args) => {
        calls.push([prop, ...args]);
        return v.apply(target, args);
      };
    },
  });
  return { proxy, calls };
}

function syntheticRec(rateHz, tUsList) {
  return {
    version: 1,
    rateHz,
    count: tUsList.length,
    samples: tUsList.map((tUs, i) => ({ tUs, roll: i * 0.1, pitch: -i * 0.05, yaw: 0.25, throttle: 0.5 + i * 0.01 })),
  };
}

async function traceCases(wasm, configText, recs) {
  const mixes = [
    ['baseline', 60, 10, {}],
    ['baseline', 144, 10, {}],
    ['baseline', 7, 10, {}],
    ['baseline', 60, 33, {}],
    ['baseline', 60, 1, { cellVoltage: 4.0 }],
    ['baseline', 1000, 10, { cellVoltage: 0 }],
    ['baseline', 2400, 10, {}],
    ['baseline', 30, 7, { cellVoltage: null }],
    ['wing', 60, 10, { prelude: wingPrelude }],
    ['wing', 50, 10, { prelude: wingPrelude, cellVoltage: 3.9 }],
    ['sky', 60, 10, { prelude: skyPrelude }],
    ['p51', 72, 25, {}],
  ];
  for (const [recName, renderHz, traceStrideMs, extra] of mixes) {
    const sim = await loadSim(wasm);
    let preludeSeen = 0;
    const opts = { configText, renderHz, traceStrideMs, ...extra };
    if (extra.prelude) {
      opts.prelude = (s) => { preludeSeen += 1; extra.prelude(s); };
    }
    const name = `trace.${recName}.${renderHz}.${traceStrideMs}${extra.cellVoltage !== undefined ? `.v${extra.cellVoltage}` : ''}`;
    let hex;
    try {
      hex = await replayTrace(sim, recs[recName], opts);
    } catch (e) {
      /* cellVoltage 0 is passed to the plant, which refuses it: that it is
       * not treated like undefined is part of the contract. */
      if (!(e instanceof SimError)) {
        throw e;
      }
      pin(name, { error: [e.message, e.code, e.errorName, e.where], preludeSeen });
      continue;
    }
    pin(name, {
      hex,
      type: typeof hex,
      length: hex.length,
      lowerHex: /^[0-9a-f]{64}$/.test(hex),
      preludeSeen,
      keys: Object.keys(hex),
    });
  }
}

async function scheduleCases(wasm, configText, baseline) {
  const synthetic = [
    /* 8 samples at 2 Hz: 4000 ms of simulated time; renderHz 7 puts frame
     * ends at 142, 285, 428 ...; stride 3; samples on a frame end (285), a
     * stride end (999 and 1200 land in ms 999 and 1200), twice in one ms
     * (2500 and 2500), one ms apart (2998, 2999), and past the end (13000),
     * which must never be fed. */
    ['sched.synth.7.3', 7, 3, 2, [0, 285000, 999000, 1200000, 2500000, 2500500, 2998000, 2999000, 13000000]],
    /* above 1000 Hz: frames end at the same ms more than once. */
    ['sched.synth.2400.10', 2400, 10, 3, [0, 4000, 1000000, 1000999, 2600000]],
    /* a recording that starts late and has a single sample. */
    ['sched.synth.60.10.one', 60, 10, 1, [1500000]],
    /* no samples at all: count 0 means zero duration. */
    ['sched.synth.60.10.none', 60, 10, 250, []],
    /* the stride does not divide the duration. */
    ['sched.synth.60.7', 60, 7, 2, [0, 500000, 1000000, 1500000]],
  ];
  for (const [name, renderHz, traceStrideMs, rateHz, tUs] of synthetic) {
    const sim = recordingSim();
    const hex = await replayTrace(sim, syntheticRec(rateHz, tUs), {
      configText: 'x'.repeat(17), renderHz, traceStrideMs,
    });
    pin(name, { hex, calls: sim.calls });
  }

  /* opts handling: cellVoltage undefined, null and 0; prelude ordering. */
  for (const [name, extra] of [
    ['sched.opts.none', {}],
    ['sched.opts.null', { cellVoltage: null }],
    ['sched.opts.zero', { cellVoltage: 0 }],
    ['sched.opts.volts', { cellVoltage: 3.7 }],
    ['sched.opts.prelude', { cellVoltage: 4.2, prelude: (s) => { s.e.sim_set_airframe(2); s.reset(); } }],
  ]) {
    const sim = recordingSim();
    const hex = await replayTrace(sim, syntheticRec(4, [0, 250000]), {
      configText: 'cfg', renderHz: 60, traceStrideMs: 10, ...extra,
    });
    pin(name, { hex, calls: sim.calls });
  }

  /* The real module through the proxy on the first 40 samples of the
   * baseline (160 ms at 250 Hz), at a render rate that does not divide. */
  const slice = { ...baseline, count: 40, samples: baseline.samples.slice(0, 40) };
  for (const [renderHz, traceStrideMs] of [[60, 10], [144, 7]]) {
    const { proxy, calls } = recorded(await loadSim(wasm));
    const hex = await replayTrace(proxy, slice, { configText, renderHz, traceStrideMs, cellVoltage: 4.0 });
    pin(`sched.real.${renderHz}.${traceStrideMs}`, {
      hex,
      calls: calls.map((c) => (c[0] === 'init' ? ['init', c[1].length] : c)),
    });
  }
}

function scriptCases(wasm, configText) {
  return (async () => {
    const segs = [
      { roll: 0.1, pitch: -0.2, yaw: 0.3, throttle: 0.4, durMs: 3 },
      { durMs: 0, throttle: 0.9 },
      { throttle: 0.5, durMs: 2 },
    ];
    {
      const sim = recordingSim();
      const seen = [];
      const end = runScript(sim, segs, (tMs, state) => seen.push([tMs, Array.from(state)]));
      const end2 = runScript(sim, [{ roll: 1, durMs: 2 }], (tMs, state) => seen.push([tMs, Array.from(state)]), end);
      pin('script.fake.onstep', { end, end2, seen, calls: sim.calls });
    }
    {
      const sim = recordingSim();
      const end = runScript(sim, segs, null, 250);
      const endNo = runScript(sim, segs);
      pin('script.fake.silent', { end, endNo, calls: sim.calls });
    }
    {
      const sim = await loadSim(wasm);
      must(sim.init(configText), 'sim_init');
      must(sim.setCellVoltage(4.0), 'sim_set_cell_voltage');
      must(sim.reset(), 'sim_reset');
      const seen = [];
      const onStep = (tMs, state) => {
        if (tMs % 25 === 0 || tMs < 4) {
          seen.push([tMs, state.length, state[ST.T], state[ST.PZ], state[ST.VZ], state[ST.QW], state[ST.RPM0], state[ST.VBAT], state[ST.AMPS]]);
        }
      };
      const end = runScript(sim, [
        { throttle: 0.0, durMs: 50 },
        { throttle: 0.7, durMs: 100 },
        { roll: 0.5, throttle: 0.6, durMs: 75 },
      ], onStep);
      const end2 = runScript(sim, [{ pitch: -0.3, throttle: 0.55, durMs: 60 }], onStep, end);
      pin('script.real', { end, end2, seen });
    }
  })();
}

function mustCases() {
  const rows = [];
  for (const code of [0, -1, -2, -3, -4, -9, 7]) {
    let thrown = null;
    try {
      must(code, `where_${code}`);
    } catch (e) {
      thrown = e;
    }
    rows.push(thrown === null ? { code, thrown: false } : {
      code,
      thrown: true,
      isSimError: thrown instanceof SimError,
      isError: thrown instanceof Error,
      message: thrown.message,
      name: thrown.name,
      fields: { code: thrown.code, errorName: thrown.errorName, where: thrown.where },
      ownKeys: Object.keys(thrown).sort(),
    });
  }
  const direct = new SimError(-2, 'direct');
  rows.push({ direct: [direct.message, direct.code, direct.errorName, direct.where, direct.name, direct instanceof Error] });
  pin('must.codes', rows);
}

async function shaCases() {
  const rows = [];
  for (const [label, chunks] of [
    ['empty', []],
    ['one-empty', [new Uint8Array(0)]],
    ['abc', [new TextEncoder().encode('abc')]],
    ['split', [new TextEncoder().encode('a'), new Uint8Array(0), new TextEncoder().encode('bc')]],
    ['plain-array', [[1, 2, 3], new Uint8Array([4, 5])]],
    ['subarray', [new Uint8Array([9, 1, 2, 3, 9]).subarray(1, 4)]],
  ]) {
    rows.push([label, await sha256Hex(chunks)]);
  }
  pin('sha256.chunks', rows);
}

async function main() {
  const wasm = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
  const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
  const loadRec = async (file) => decodeRec(new Uint8Array(await readFile(join(root, 'tests/inputs', file))));
  const recs = {
    baseline: await loadRec('baseline.rec'),
    wing: await loadRec('wing-baseline.rec'),
    sky: await loadRec('sky-baseline.rec'),
    p51: await loadRec('p51-air.rec'),
  };

  await traceCases(wasm, configText, recs);
  await scheduleCases(wasm, configText, recs.baseline);
  await scriptCases(wasm, configText);
  mustCases();
  await shaCases();
  pin('st', { entries: Object.entries(ST), isPlain: Object.getPrototypeOf(ST) === Object.prototype });

  const names = Object.keys(digests);
  for (const name of names) {
    const got = digests[name];
    const want = PINNED[name];
    const ok = want === got;
    if (!ok) {
      failed += 1;
    }
    if (printAll || !ok) {
      console.log(`${ok ? 'ok' : 'FAIL'}: ${name} ${got}${ok ? '' : ` (pinned ${want ?? 'nothing'})`}`);
    }
  }
  for (const name of Object.keys(PINNED)) {
    if (!(name in digests)) {
      failed += 1;
      console.log(`FAIL: pinned ${name} never ran`);
    }
  }
  console.log(`replaylib:selftest: ${names.length} cases, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
