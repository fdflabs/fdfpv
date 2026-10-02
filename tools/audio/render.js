/*
 * render.js: every scripted flight (tools/audio/flights.json) rendered OLD
 * and NEW through the real audio graph in headless Chromium, written as
 * WAVs, measured by tools/audio/metrics.js, and held to the prototype's
 * bars.
 *
 *   npm run audio:lab                     render, measure, print the table
 *   npm run audio:lab -- --check          and fail on a bar NEW misses
 *   npm run audio:lab -- --only=quad-hover --mode=new
 *   npm run audio:lab -- --write          also write tools/audio/measured.json
 *   npm run audio:lab -- --stem=engine    one stem alone (engine or air), for
 *                                         a category's own loudness
 *
 * WAVs go to build/audio-lab (not in the repository: a number in a file is
 * evidence forever, a 2 MB wav is a download). One page, one flight at a
 * time, because the host this runs on is shared.
 *
 * THE BARS, for NEW only (docs/AUDIO.md, "the mix", says why each). The
 * renders are the aircraft alone, motors or engine and air, at the shell's
 * default volume, with no music:
 *   integrated loudness of a flight      -29 to -22 LUFS; a glider, whose
 *                                        only sound is its air, -40 to -30,
 *                                        quiet but there; for a fly-by,
 *                                        heard off board, the pass instead:
 *                                        its loudest 400 ms, -30 to -20 LUFS,
 *                                        because a fly-by is far away for
 *                                        most of its length by definition and
 *                                        its integrated figure measures the
 *                                        window, not the sound
 *   loudest 3 s (short term)             at most -18 LUFS
 *   loudest 400 ms (momentary)           at most -14 LUFS
 *   true peak                            at most -1.0 dBTP
 *   non finite or subnormal samples      none
 *   graph nodes                          at most 64 (the live budget), and
 *                                        no more than OLD's
 *   A weighted share in 2 to 5 kHz       at most 35 percent
 *   render cost                          under 0.25 s a second of audio,
 *                                        which is a quarter of one core
 * OLD is measured, never judged: it is the baseline.
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

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../../tests/lib/page.js';
import { measure } from './metrics.js';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const outDir = join(root, 'build/audio-lab');

export const BARS = {
  lufsMin: -29,
  lufsMax: -22,
  gliderMin: -40,
  gliderMax: -30,
  passMin: -30,
  passMax: -20,
  shortMax: -18,
  momentaryMax: -14,
  truePeakMax: -1.0,
  nodesMax: 64,
  harshShareAMax: 35,
  costMax: 0.25,
};

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([a-z]+)(?:=(.*))?$/);
  if (!m) {
    throw new Error(`unknown argument ${a}`);
  }
  return [m[1], m[2] ?? true];
}));
const modes = args.mode ? [String(args.mode)] : ['old', 'new'];

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

async function main() {
  const flights = JSON.parse(await readFile(join(root, 'tools/audio/flights.json'), 'utf8')).flights;
  /* The rooms (tools/audio/drive.js SCENES): heard as another flight. */
  for (const id of ['room-4', 'room-32']) {
    flights[id] = { title: id, room: true };
  }
  const ids = args.only ? String(args.only).split(',') : Object.keys(flights);
  await mkdir(outDir, { recursive: true });
  const page = await openPage({ root, url: '/tools/audio/listen.html', width: 800, height: 600 });
  const results = {};
  let failed = 0;
  try {
    await page.until('document.readyState === "complete"');
    for (const id of ids) {
      results[id] = { title: flights[id].title };
      for (const mode of modes) {
        const meta = await page.evaluate(`import('/tools/audio/drive.js').then((m) => m.renderAndStash(${JSON.stringify(id)}, ${JSON.stringify(mode)}, ${JSON.stringify(args.stem || '')}))`);
        const chans = [];
        for (let c = 0; c < 2; c += 1) {
          const arr = new Float32Array(meta.length);
          const per = 1 << 18;
          for (let off = 0; off < meta.length; off += per) {
            const b64 = await page.evaluate(`(${PULL})(${c}, ${off}, ${per})`);
            const b = Buffer.from(b64, 'base64');
            arr.set(new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4), off);
          }
          chans.push(arr);
        }
        await writeFile(join(outDir, `${id}-${mode}${args.stem ? `-${args.stem}` : ''}.wav`), wav(chans, meta.rate));
        const m = measure(chans, meta.rate);
        m.nodes = meta.nodes;
        m.cost = Number((meta.renderMs / 1000 / meta.seconds).toFixed(3));
        results[id][mode] = m;
      }
    }
  } finally {
    if (page.errors.length) {
      console.log(`page errors:\n  ${page.errors.join('\n  ')}`);
    }
    await page.close();
  }

  const cell = (m, k) => (m ? String(m[k]).padStart(7) : '      -');
  console.log(`${'flight'.padEnd(24)} mode    LUFS  STmax  Mmax    dBTP  harsh%   LRA  repeat  nodes   cost`);
  for (const [id, r] of Object.entries(results)) {
    for (const mode of modes) {
      const m = r[mode];
      console.log(`${id.padEnd(24)} ${mode.padEnd(4)}${cell(m, 'lufs')}${cell(m, 'lufsShortMax')}${cell(m, 'lufsMomentaryMax')}${cell(m, 'truePeakDbtp')}${cell(m, 'harshShareA')}${cell(m, 'lra')}${cell(m, 'repetition')}${cell(m, 'nodes')}${cell(m, 'cost')}`);
    }
  }

  if (args.check) {
    console.log('\nthe prototype\'s bars (NEW only):');
    const check = (name, ok, detail) => {
      console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}  (${detail})`);
      if (!ok) {
        failed += 1;
      }
    };
    for (const [id, r] of Object.entries(results)) {
      const n = r.new;
      if (!n) {
        continue;
      }
      if (flights[id].glider) {
        check(`${id} the air alone, ${BARS.gliderMin} to ${BARS.gliderMax} LUFS`, n.lufs >= BARS.gliderMin && n.lufs <= BARS.gliderMax, `${n.lufs} LUFS`);
      } else if (flights[id].listener) {
        check(`${id} the pass, loudest 400 ms, ${BARS.passMin} to ${BARS.passMax} LUFS`, n.lufsMomentaryMax >= BARS.passMin && n.lufsMomentaryMax <= BARS.passMax, `${n.lufsMomentaryMax} LUFS`);
      } else {
        check(`${id} loudness ${BARS.lufsMin} to ${BARS.lufsMax} LUFS`, n.lufs >= BARS.lufsMin && n.lufs <= BARS.lufsMax, `${n.lufs} LUFS`);
      }
      check(`${id} loudest 3 s at most ${BARS.shortMax} LUFS`, n.lufsShortMax <= BARS.shortMax, `${n.lufsShortMax} LUFS`);
      check(`${id} loudest 400 ms at most ${BARS.momentaryMax} LUFS`, n.lufsMomentaryMax <= BARS.momentaryMax, `${n.lufsMomentaryMax} LUFS`);
      check(`${id} true peak at most ${BARS.truePeakMax} dBTP`, n.truePeakDbtp <= BARS.truePeakMax, `${n.truePeakDbtp} dBTP`);
      check(`${id} no NaN, infinity or subnormal`, n.nonFinite === 0 && n.subnormal === 0, `${n.nonFinite} non finite, ${n.subnormal} subnormal`);
      check(`${id} nodes within the budget and no more than OLD`, n.nodes <= BARS.nodesMax && (!r.old || n.nodes <= r.old.nodes), `${n.nodes} against ${r.old ? r.old.nodes : '?'}`);
      check(`${id} 2 to 5 kHz at most ${BARS.harshShareAMax} percent A weighted`, n.harshShareA <= BARS.harshShareAMax, `${n.harshShareA} percent`);
      check(`${id} render cost under ${BARS.costMax} s a second`, n.cost < BARS.costMax, `${n.cost} s/s`);
    }
  }
  if (args.write && !args.stem) {
    const path = join(root, 'tools/audio/measured.json');
    let prev = {};
    try {
      prev = JSON.parse(await readFile(path, 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT') {
        throw e;
      }
    }
    for (const [id, r] of Object.entries(results)) {
      prev[id] = { ...(prev[id] || {}), ...r };
    }
    await writeFile(path, `${JSON.stringify(prev, null, 1)}\n`);
    console.log(`wrote ${path}`);
  }
  console.log(`WAVs in ${outDir}`);
  if (failed) {
    console.log(`audio:lab: ${failed} FAILED`);
    process.exit(1);
  }
}

await main();
