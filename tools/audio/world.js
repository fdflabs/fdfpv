/*
 * world.js: the world's sound (src/render/world-worklet.js) rendered in
 * Node, measured by tools/audio/metrics.js and held to its bars, per class
 * (docs/AUDIO.md section 12). No browser: the processor runs under a
 * small shim of the AudioWorklet global scope, fed the same frames the
 * page posts (tools/audio/world-scenes.js), so this is cheap enough for CI
 * and the listening page (tools/audio/drive.js) hears the same samples.
 *
 *   npm run audio:world                    render and measure every scene
 *   npm run audio:world -- --check         and fail on a bar
 *   npm run audio:world -- --calibrate     print each kind's trim for its
 *                                          lufs16 (world-kinds.js amp)
 *   npm run audio:world -- --only=war-wave --wav
 *                                          one scene, and its WAV in
 *                                          build/audio-world
 *   npm run audio:world -- --browser --check
 *                                          every scene in headless Chromium,
 *                                          OLD and NEW, through the real
 *                                          graph: the browser's cost, the
 *                                          nodes, the Node render's loudness
 *
 * THE MIX the renders go through is the shell's at the default volume, as
 * MotorAudio.attachWorld puts the outputs on their buses: other aircraft
 * and vehicles, ambience and effects, each at the Settings default (5 of
 * 10, unity: src/render/audio.js BUS_UNITY_AT); then the master at
 * 0.6 x 0.85, after the graph's end: the limiter's (a
 * DynamicsCompressorNode, threshold -6, ratio 20, knee 3) makeup gain and
 * the soft clip, whose curve tanh(1.6 x) / tanh(1.6) is 1.74 times
 * (4.8 dB) for a small signal. Measured whole (--browser, strike-pass,
 * which never reaches the threshold): 7.62 dB, so the makeup is 2.82. The compression is not
 * modelled, so a true peak over the bar is the source's, not a limiter's
 * doing, and --browser does not compare a scene that drives it.
 *
 * THE BARS, per class:
 *   every kind at 16 m, cruising        its lufs16 within 1 LU (the trim
 *                                       is right); a source as big as a
 *                                       spillway at its `near`, lufsNear
 *   aircraft passing (a wave, one)      the pass, the loudest 400 ms, -30
 *                                       to -20 LUFS (as tools/audio/render.js
 *                                       judges a fly by), a valley scene's
 *                                       in its own quieter window
 *                                       (world-scenes.js VALLEY_PASS); short
 *                                       term at
 *                                       most -18; momentary at most -14; 2
 *                                       to 5 kHz at most 35 percent A
 *                                       weighted
 *   the ambience's scenes               the loudest 400 ms in AMBIENCE_PASS
 *                                       (world-scenes.js: under the
 *                                       aircraft); the 2 to 5 kHz band's own
 *                                       loudness at most -42 LUFS, 10 dB
 *                                       under what the aircraft's 35 percent
 *                                       of -27 allows, rather than its share
 *                                       (a bird sings there by nature)
 *   a breach (WorldAudio.breach)        as an explosion, and short term at
 *                                       most -18, as the aircraft: a gate's
 *                                       groan and a fire last seconds;
 *                                       quieter the farther; two alike
 *                                       correlate at most 0.5
 *   the water through a breach          its pass in BREACH_PASS
 *   an explosion                        momentary at most -12 (the biggest
 *                                       thing in the game, by 2 dB);
 *                                       quieter the farther, 100 m over
 *                                       300 m over 1000 m; 2 to 5 kHz at
 *                                       most 35 percent
 *   no identical repeats                two explosions at one distance, and
 *                                       two engines of one kind at one
 *                                       place, correlate at most 0.5
 *                                       (normalised cross correlation, best
 *                                       lag)
 *   every render                        true peak at most -1 dBTP; no non
 *                                       finite or subnormal sample
 *   the full war (120 attackers)        the pool full and the rest bedded;
 *                                       with --browser, render cost under
 *                                       0.25 s a second of audio (a quarter
 *                                       of one core) on Chromium's worklet
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

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { measure } from './metrics.js';
import { SCENES, calibrationOf, calibrationScene } from './world-scenes.js';
import { KINDS, SOURCE_STRIDE, WORLD_KINDS } from '../../src/render/world-kinds.js';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const RATE = 48000;
const QUANTUM = 128;
/* The shell's mix at the default volume (header). */
export const MIX = { other: 1, ambience: 1, fx: 1, makeup: 10 ** (2.82 / 20), master: 0.6 * 0.85 };
/* The graph's end for what the limiter lets through: its makeup, the soft
 * clip (src/render/audio.js, a WaveShaper, which clamps its input to
 * plus and minus one), the master. */
function end(x) {
  const y = Math.max(-1, Math.min(1, x * MIX.makeup));
  return (Math.tanh(1.6 * y) / Math.tanh(1.6)) * MIX.master;
}

export const BARS = {
  calibrateLu: 1,
  passMin: -30,
  passMax: -20,
  shortMax: -18,
  momentaryMax: -14,
  boomMomentaryMax: -12,
  truePeakMax: -1,
  harshShareAMax: 35,
  bedHarshLufsMax: -42,
  repeatCorrMax: 0.5,
  costMax: 0.25,
};

/* The AudioWorklet global scope, as much of it as the processor uses. */
let Processor = null;
async function loadProcessor() {
  if (Processor) {
    return Processor;
  }
  globalThis.sampleRate = RATE;
  globalThis.currentTime = 0;
  globalThis.AudioWorkletProcessor = class {
    constructor() {
      this.port = { onmessage: null, postMessage: (m) => { this.port.last = m; } };
    }
  };
  globalThis.registerProcessor = (name, cls) => {
    Processor = cls;
  };
  await import('../../src/render/world-worklet.js');
  return Processor;
}

/*
 * Render a scene: every frame and boom posted before the first quantum,
 * as the offline page does. Returns { channels, stems, rate, seconds,
 * ms, stats }.
 */
/* `guard`, off unless asked: an offline render is not real time, and the
 * load guard on a wall clock would make it hear different samples each
 * run (world-worklet.js meter). `loadBudget` to force its hot path. */
export async function renderScene(sc, { voices, guard = false, loadBudget } = {}) {
  const P = await loadProcessor();
  globalThis.currentTime = 0;
  const proc = new P({ processorOptions: { voices, guard, loadBudget, timeline: { frames: sc.frames, booms: sc.booms } } });
  const len = Math.round(sc.seconds * RATE);
  const L = new Float32Array(len);
  const R = new Float32Array(len);
  const stems = { other: [new Float32Array(len), new Float32Array(len)], fx: [new Float32Array(len), new Float32Array(len)] };
  const outs = [0, 1, 2].map(() => [new Float32Array(QUANTUM), new Float32Array(QUANTUM)]);
  /* limiterIn: the sum's peak where the live graph's limiter sees it,
   * before the master. */
  const stats = { voicedMax: 0, beddedMax: 0, limiterIn: 0, stepMax: 0 };
  const t0 = performance.now();
  for (let off = 0; off < len; off += QUANTUM) {
    globalThis.currentTime = off / RATE;
    for (const o of outs) {
      o[0].fill(0);
      o[1].fill(0);
    }
    proc.process([], outs, {});
    const m = Math.min(QUANTUM, len - off);
    for (let i = 0; i < m; i += 1) {
      for (let c = 0; c < 2; c += 1) {
        const a = outs[0][c][i] * MIX.other + outs[1][c][i] * MIX.ambience;
        const f = outs[2][c][i] * MIX.fx;
        stats.limiterIn = Math.max(stats.limiterIn, Math.abs(a + f));
        stems.other[c][off + i] = end(a);
        stems.fx[c][off + i] = end(f);
        (c === 0 ? L : R)[off + i] = end(a + f);
      }
    }
    stats.voicedMax = Math.max(stats.voicedMax, proc.stats.voiced);
    stats.stepMax = proc.stats.stepMax;
    stats.beddedMax = Math.max(stats.beddedMax, proc.stats.bedded);
  }
  const ms = performance.now() - t0;
  return { channels: [L, R], stems, rate: RATE, seconds: sc.seconds, ms, stats };
}

/* The best normalised cross correlation of two mono signals over lags
 * up to maxLag samples: 1 is the same samples. */
export function bestCorrelation(a, b, maxLag = 4800) {
  const n = Math.min(a.length, b.length);
  let ea = 0;
  let eb = 0;
  for (let i = 0; i < n; i += 1) {
    ea += a[i] * a[i];
    eb += b[i] * b[i];
  }
  const norm = Math.sqrt(ea * eb) || 1;
  let best = 0;
  for (let lag = -maxLag; lag <= maxLag; lag += 16) {
    let s = 0;
    for (let i = Math.max(0, -lag); i < n && i + lag < n; i += 4) {
      s += a[i] * b[i + lag];
    }
    best = Math.max(best, Math.abs((4 * s) / norm));
  }
  return best;
}

function wav(chans, rate) {
  const n = chans[0].length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i += 1) {
    for (let c = 0; c < 2; c += 1) {
      const v = Math.max(-1, Math.min(1, chans[c][i] || 0));
      buf.writeInt16LE(Math.round(v * 32767), 44 + i * 4 + c * 2);
    }
  }
  return buf;
}

const PULL = `(c, off, n) => {
  const src = globalThis.__lab[c];
  const sub = src.subarray(off, Math.min(off + n, src.length));
  const bytes = new Uint8Array(sub.buffer, sub.byteOffset, sub.byteLength);
  let out = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 8192, bytes.length)));
  }
  return btoa(out);
}`;

/*
 * --browser: every scene rendered NEW (and OLD) in headless Chromium
 * through a real AudioWorklet and the real graph (tools/audio/world-drive.js),
 * as the listening page renders it. Proves the page hears what the Node
 * renders measured (loudness within 0.5 LU: the graph adds a limiter the
 * Node mix has not got), and measures the render cost on the browser's own
 * engine, with the node count against the budget. One page, one scene at
 * a time.
 */
async function browser(args, check) {
  const { openPage } = await import('../../tests/lib/page.js');
  const ids = args.only ? String(args.only).split(',') : Object.keys(SCENES);
  const page = await openPage({ root, url: '/tools/audio/listen.html', width: 800, height: 600 });
  try {
    await page.until('window.__listenReady === true', 60000);
    console.log(`${'scene'.padEnd(14)} mode    LUFS   Mmax    dBTP  2-5k%  nodes    cost  Node's LUFS`);
    for (const id of ids) {
      const nodeRender = await renderScene(SCENES[id]);
      const node = measure(nodeRender.channels, RATE);
      /* The limiter's knee starts 1.5 dB under its -6 dBFS threshold:
       * past that the browser's graph compresses what the Node mix does
       * not, and the two are not the same samples to compare. */
      const limited = nodeRender.stats.limiterIn > 10 ** (-7.5 / 20);
      for (const mode of ['old', 'new']) {
        const meta = await page.evaluate(`import('/tools/audio/world-drive.js').then((m) => m.renderWorldAndStash(${JSON.stringify(id)}, ${JSON.stringify(mode)}))`);
        const chans = [];
        for (let c = 0; c < 2; c += 1) {
          const arr = new Float32Array(meta.length);
          const per = 1 << 18;
          for (let off = 0; off < meta.length; off += per) {
            const b = Buffer.from(await page.evaluate(`(${PULL})(${c}, ${off}, ${per})`), 'base64');
            arr.set(new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4), off);
          }
          chans.push(arr);
        }
        const m = measure(chans, meta.rate);
        const cost = Number((meta.renderMs / 1000 / meta.seconds).toFixed(3));
        console.log(`${id.padEnd(14)} ${mode.padEnd(4)}${String(m.lufs).padStart(8)}${String(m.lufsMomentaryMax).padStart(7)}${String(m.truePeakDbtp).padStart(8)}${String(m.harshShareA).padStart(7)}${String(meta.nodes).padStart(7)}${String(cost).padStart(8)}  ${mode === 'new' ? node.lufs : ''}`);
        if (mode !== 'new' || !args.check) {
          continue;
        }
        check(`${id} in the browser: true peak at most ${BARS.truePeakMax} dBTP`, m.truePeakDbtp <= BARS.truePeakMax, `${m.truePeakDbtp} dBTP`);
        check(`${id} in the browser: no NaN, infinity or subnormal`, m.nonFinite === 0 && m.subnormal === 0, `${m.nonFinite}, ${m.subnormal}`);
        check(`${id} in the browser: graph at most 64 nodes`, meta.nodes <= 64, `${meta.nodes}`);
        if (limited) {
          console.log(`  (${id}: the limiter is working, ${(20 * Math.log10(nodeRender.stats.limiterIn)).toFixed(1)} dBFS into it, so the Node render is not the browser's)`);
        } else {
          check(`${id} in the browser: loudness as the Node render, within 0.5 LU`, Math.abs(m.lufs - node.lufs) <= 0.5, `${m.lufs} against ${node.lufs}`);
        }
        if (SCENES[id].note === 'cost') {
          check(`${id} in the browser: render cost under ${BARS.costMax} s a second`, cost < BARS.costMax, `${cost} s/s`);
        }
      }
    }
  } finally {
    if (page.errors.length) {
      console.log(`page errors:\n  ${page.errors.join('\n  ')}`);
      check('no page errors', false, `${page.errors.length}`);
    }
    await page.close();
  }
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => {
    const m = a.match(/^--([a-z]+)(?:=(.*))?$/);
    if (!m) {
      throw new Error(`unknown argument ${a}`);
    }
    return [m[1], m[2] ?? true];
  }));
  let failed = 0;
  const check = (name, ok, detail) => {
    console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}  (${detail})`);
    if (!ok) {
      failed += 1;
    }
  };
  const hygiene = (id, m) => {
    check(`${id} true peak at most ${BARS.truePeakMax} dBTP`, m.truePeakDbtp <= BARS.truePeakMax, `${m.truePeakDbtp} dBTP`);
    check(`${id} no NaN, infinity or subnormal`, m.nonFinite === 0 && m.subnormal === 0, `${m.nonFinite} non finite, ${m.subnormal} subnormal`);
  };

  if (args.browser) {
    await browser(args, check);
    if (failed) {
      console.log(`audio:world: ${failed} FAILED`);
      process.exit(1);
    }
    return;
  }

  if (args.calibrate || (args.check && !args.only)) {
    console.log('each kind at 16 m, cruising, on its bus at the default volume:');
    for (const kind of KINDS) {
      const r = await renderScene(calibrationScene(kind));
      const m = measure(r.channels, r.rate);
      const spec = WORLD_KINDS[kind];
      const cal = calibrationOf(spec);
      const trim = spec.amp * 10 ** ((cal.lufs - m.lufs) / 20);
      console.log(`  ${kind.padEnd(8)} ${String(m.lufs).padStart(7)} LUFS at ${cal.m} m, target ${cal.lufs}, amp ${spec.amp} -> ${trim.toPrecision(3)}; dBTP ${m.truePeakDbtp}, 2-5 kHz ${m.harshShareA}%`);
      if (args.check) {
        check(`${kind} at ${cal.m} m within ${BARS.calibrateLu} LU of ${cal.lufs}`, Math.abs(m.lufs - cal.lufs) <= BARS.calibrateLu, `${m.lufs} LUFS`);
        /* Not a bird's or a cricket's alone: they sing in that band by
         * nature, and are judged in their scenes, in the mix. */
        if (!spec.bed) {
          check(`${kind} 2 to 5 kHz at most ${BARS.harshShareAMax} percent`, m.harshShareA <= BARS.harshShareAMax, `${m.harshShareA}%`);
        }
        hygiene(kind, m);
      }
    }
    if (args.calibrate) {
      return;
    }
  }

  const ids = args.only ? String(args.only).split(',') : Object.keys(SCENES);
  const results = {};
  for (const id of ids) {
    const sc = SCENES[id];
    if (!sc) {
      throw new Error(`no scene ${id}`);
    }
    const r = await renderScene(sc);
    const m = measure(r.channels, r.rate);
    m.cost = Number((r.ms / 1000 / r.seconds).toFixed(3));
    m.voicedMax = r.stats.voicedMax;
    m.beddedMax = r.stats.beddedMax;
    m.other = measure(r.stems.other, r.rate);
    results[id] = m;
    console.log(`${id.padEnd(14)} LUFS ${String(m.lufs).padStart(7)}  ST ${String(m.lufsShortMax).padStart(7)}  M ${String(m.lufsMomentaryMax).padStart(7)}  dBTP ${String(m.truePeakDbtp).padStart(7)}  2-5k ${String(m.harshShareA).padStart(5)}%  rep ${m.repetition}  cost ${m.cost} s/s  voices ${m.voicedMax} bed ${m.beddedMax}`);
    if (args.wav) {
      const dir = join(root, 'build/audio-world');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `${id}.wav`), wav(r.channels, r.rate));
    }
  }

  if (args.check) {
    console.log('\nthe world\'s bars:');
    for (const [id, m] of Object.entries(results)) {
      const sc = SCENES[id];
      hygiene(id, m);
      if (sc.note === 'cost') {
        /* Its cost is judged by --browser, on the audio thread's own
         * engine: a wall clock bar on a shared CI runner is a flake. */
        check(`${id} the pool is full and the rest bedded`, m.voicedMax > 0 && m.beddedMax > 0, `${m.voicedMax} voiced, ${m.beddedMax} bedded`);
        continue;
      }
      if (sc.role === 'bed') {
        /* A bed is quiet and a bird sings in that band by nature, so its
         * share says little; what tires is the band's own level. The
         * aircraft's bar allows that band -27 LUFS + 10 log 0.35, -31.6;
         * a bed's is 10 dB under it. */
        const band = m.lufs + 10 * Math.log10(Math.max(1e-6, m.harshShareA / 100));
        check(`${id} its 2 to 5 kHz band at most ${BARS.bedHarshLufsMax} LUFS`, band <= BARS.bedHarshLufsMax, `${band.toFixed(2)} LUFS (${m.harshShareA}% of ${m.lufs})`);
      } else {
        check(`${id} 2 to 5 kHz at most ${BARS.harshShareAMax} percent A weighted`, m.harshShareA <= BARS.harshShareAMax, `${m.harshShareA}%`);
      }
      if (sc.role === 'fx') {
        check(`${id} loudest 400 ms at most ${BARS.boomMomentaryMax} LUFS`, m.lufsMomentaryMax <= BARS.boomMomentaryMax, `${m.lufsMomentaryMax} LUFS`);
        if (sc.booms.some((b) => b.material)) {
          /* A breach lasts seconds (a gate groans, a transformer burns):
           * held to the aircraft's short term bar as well, so it never
           * sits loud. */
          check(`${id} loudest 3 s at most ${BARS.shortMax} LUFS`, m.lufsShortMax <= BARS.shortMax, `${m.lufsShortMax} LUFS`);
        }
      } else {
        /* The aircraft alone: a scene's explosion is judged as one. */
        const o = m.other;
        const [lo, hi] = sc.pass || [BARS.passMin, BARS.passMax];
        check(`${id} the pass, loudest 400 ms, ${lo} to ${hi} LUFS`, o.lufsMomentaryMax >= lo && o.lufsMomentaryMax <= hi, `${o.lufsMomentaryMax} LUFS`);
        check(`${id} loudest 3 s at most ${BARS.shortMax} LUFS`, o.lufsShortMax <= BARS.shortMax, `${o.lufsShortMax} LUFS`);
        check(`${id} loudest 400 ms at most ${BARS.momentaryMax} LUFS`, o.lufsMomentaryMax <= BARS.momentaryMax, `${o.lufsMomentaryMax} LUFS`);
      }
    }
    const b = (id) => results[id] && results[id].lufsMomentaryMax;
    if (b('boom-100') != null && b('boom-300') != null && b('boom-1000') != null) {
      check('explosions quieter the farther: 100 m over 300 m over 1000 m', b('boom-100') > b('boom-300') && b('boom-300') > b('boom-1000'), `${b('boom-100')}, ${b('boom-300')}, ${b('boom-1000')} LUFS`);
    }
    if (!args.only) {
      /* No identical repeats: two explosions at one place, two seeds. */
      const one = (seed) => renderScene({ ...SCENES['boom-300'], booms: [{ ...SCENES['boom-300'].booms[0], seed }] });
      const [x, y] = await Promise.all([one(41), one(42)]);
      const mono = (r) => r.channels[0].map((v, i) => v + r.channels[1][i]);
      const c = bestCorrelation(mono(x), mono(y));
      check(`two explosions alike correlate at most ${BARS.repeatCorrMax}`, c <= BARS.repeatCorrMax, `${c.toFixed(3)}`);
      /* Every explosion draws its own numbers: the near one's 2 to 5 kHz
       * share under the bar for every seed tried, not only the scene's. */
      let worst = 0;
      for (let seed = 1; seed <= 12; seed += 1) {
        const sc = SCENES['boom-40'];
        const r = await renderScene({ ...sc, booms: [{ ...sc.booms[0], seed }] });
        worst = Math.max(worst, measure(r.channels, r.rate).harshShareA);
      }
      check(`a near explosion, twelve seeds, 2 to 5 kHz at most ${BARS.harshShareAMax} percent`, worst <= BARS.harshShareAMax, `worst ${worst}%`);
      /* The dam break's calls (src/render/world-audio.js), their contract:
       * what is sent, what is dropped, what throws. */
      const { WorldAudio } = await import('../../src/render/world-audio.js');
      const wa = new WorldAudio();
      const sent = [];
      wa.node = { port: { postMessage: (msg) => sent.push(msg) } };
      wa.ctx = { currentTime: 5 };
      wa.lis.set([0, 1.7, 0, 0, 0, -1, 1, 0, 0, 0]);
      wa.view = { height: () => 100 };
      const ok = wa.breach({ at: 1000, position: [10, 130, -50], material: 'steel', mass: 4e4 }, 1500);
      const b0 = sent[0] && sent[0].breach;
      check('a breach is sent with its lateness and its fall to the ground', ok && b0 && b0.late === 0.5 && b0.fall === 30 && b0.material === 'steel', JSON.stringify(b0));
      check('a breach more than 3 s late is dropped', wa.breach({ at: 0, position: [0, 0, 0], material: 'concrete', mass: 1 }, 4001) === false && sent.length === 1, `${sent.length} sent`);
      const throws = (f) => { try { f(); return false; } catch (e) { return true; } };
      check('a breach of no known material, no position or no mass throws',
        throws(() => wa.breach({ at: 0, position: [0, 0, 0], material: 'glass', mass: 1 }, 0))
        && throws(() => wa.breach({ at: 0, position: [0, 0], material: 'concrete', mass: 1 }, 0))
        && throws(() => wa.breach({ at: 0, position: [0, 0, 0], material: 'concrete', mass: 0 }, 0)), 'all three');
      wa.flow(3, 1, 2, 3, 2500);
      check('a flow is a breachflow source with its discharge as its drive', wa.src[1] === KINDS.indexOf('breachflow') && wa.src[SOURCE_STRIDE - 1] === 2500, Array.from(wa.src.slice(0, SOURCE_STRIDE)).join(','));
      check('a negative discharge throws', throws(() => wa.flow(3, 0, 0, 0, -1)), '');
      /* And every breach: twelve seeds each, its share, its loudest 3 s,
       * and two alike not the same samples. */
      for (const id of ['breach-concrete', 'breach-steel', 'breach-transformer']) {
        const sc = SCENES[id];
        const runs = [];
        for (let seed = 1; seed <= 12; seed += 1) {
          runs.push(await renderScene({ ...sc, booms: [{ ...sc.booms[0], seed }] }));
        }
        const ms = runs.map((r) => measure(r.channels, r.rate));
        const harsh = Math.max(...ms.map((m) => m.harshShareA));
        const st = Math.max(...ms.map((m) => m.lufsShortMax));
        const mm = Math.max(...ms.map((m) => m.lufsMomentaryMax));
        check(`${id}, twelve seeds, 2 to 5 kHz at most ${BARS.harshShareAMax} percent`, harsh <= BARS.harshShareAMax, `worst ${harsh}%`);
        check(`${id}, twelve seeds, loudest 3 s at most ${BARS.shortMax} and 400 ms at most ${BARS.boomMomentaryMax} LUFS`, st <= BARS.shortMax && mm <= BARS.boomMomentaryMax, `worst ${st}, ${mm} LUFS`);
        const cb = bestCorrelation(mono(runs[0]), mono(runs[1]));
        check(`${id}: two alike correlate at most ${BARS.repeatCorrMax}`, cb <= BARS.repeatCorrMax, cb.toFixed(3));
      }
      /* The load guard's hot path, forced: a budget no machine meets, so
       * it sheds every step; the war must still sound, clean, and cost
       * less than at full detail. */
      const full = await renderScene(SCENES['war-full']);
      const hot = await renderScene(SCENES['war-full'], { guard: true, loadBudget: 1e-9 });
      const mh = measure(hot.channels, hot.rate);
      const mf = measure(full.channels, full.rate);
      check('the load guard, forced hot, sheds to its last step', hot.stats.stepMax === 3, `step ${hot.stats.stepMax}`);
      check('the load guard, forced hot: still heard, within 6 LU of full detail', Math.abs(mh.lufs - mf.lufs) <= 6, `${mh.lufs} against ${mf.lufs} LUFS`);
      check('the load guard, forced hot: no NaN, infinity or subnormal, true peak at most -1 dBTP', mh.nonFinite === 0 && mh.subnormal === 0 && mh.truePeakDbtp <= BARS.truePeakMax, `${mh.nonFinite}, ${mh.subnormal}, ${mh.truePeakDbtp} dBTP`);
      check('the load guard, forced hot: cheaper than full detail', hot.ms < full.ms, `${(hot.ms / 1000 / hot.seconds).toFixed(3)} against ${(full.ms / 1000 / full.seconds).toFixed(3)} s/s`);
      /* And two engines: the same kind on the same circle, two ids. */
      for (const kind of ['strike', 'fpv', 'boat', 'car', 'bus']) {
        const sc = calibrationScene(kind);
        const other = { ...sc, frames: sc.frames.map((f) => ({ ...f, src: f.src.map((v, i) => (i % SOURCE_STRIDE === 0 ? v + 1 : v)) })) };
        const [e, f] = await Promise.all([renderScene(sc), renderScene(other)]);
        const ce = bestCorrelation(mono(e), mono(f), 960);
        check(`two ${kind} engines correlate at most ${BARS.repeatCorrMax}`, ce <= BARS.repeatCorrMax, `${ce.toFixed(3)}`);
      }
    }
  }
  if (failed) {
    console.log(`audio:world: ${failed} FAILED`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
