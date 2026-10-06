/*
 * link-trace-selftest.js: the radio link (src/input/link.js) pinned packet
 * for packet against a golden trace, in plain Node.
 *
 * link-selftest.js and signal-check.js prove the link behaves like a radio:
 * cadence, delay, jitter band, loss rate, determinism per seed. They would
 * all still pass on a link whose jitter stream had quietly changed, and a
 * changed stream changes what reaches the flight controller for every pilot
 * flying a preset. This pins the stream itself: for a spread of presets,
 * seeds, block sizes, signals, failsafes, preset swaps and resets, every
 * packet's stamp and payload, every question asked of the stick sampler in
 * the order it was asked, and the counters, hashed per scenario.
 *
 * tests/fixtures/link-trace.json was written from the shipped module before
 * it was rewritten. `--write` regenerates it; only ever do that from a
 * module whose stream is the one players already fly, never to make a
 * failing rewrite pass.
 *
 *   node scripts/link-trace-selftest.js
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
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RcLink, LINK_PRESETS, LINK_DEFAULT, linkPreset } from '../src/input/link.js';

const GOLDEN = fileURLToPath(new URL('../tests/fixtures/link-trace.json', import.meta.url));
const WRITE = process.argv.includes('--write');

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

/* Floats go in as their exact bit pattern, so a last-bit change in a
 * jitter draw is a different hash. */
const bits = new DataView(new ArrayBuffer(8));
function exact(x) {
  if (typeof x !== 'number') {
    return String(x);
  }
  bits.setFloat64(0, x);
  return bits.getBigUint64(0).toString(16);
}

const FAILSAFE = Object.freeze({ roll: 0, pitch: 0, yaw: 0, throttle: 0 });

/*
 * One recorded session. The sampler hands out a fresh object per question,
 * numbered, with sticks that are a function of the moment asked, so the
 * trace shows both when each packet was sampled and which answer it
 * carries. `script(link, blockStart, block)` runs before each block, the
 * way the shell sets the signal once a frame.
 */
function session(link, { ms, block, start = 0, script = null }) {
  const asked = [];
  const sampler = (atMs) => {
    asked.push(exact(atMs));
    return { n: asked.length, roll: atMs, pitch: Math.sin(atMs / 97), yaw: -atMs / 1000, throttle: 0.5 };
  };
  const packets = [];
  link.reset(start);
  let i = 0;
  for (let t = start; t < start + ms; i += 1) {
    const end = Math.min(t + block(i), start + ms);
    if (script) {
      script(link, t, i);
    }
    for (const p of link.pump(end, sampler)) {
      const rc = p.rc === FAILSAFE ? 'FS' : [p.rc.n, exact(p.rc.roll), exact(p.rc.pitch), exact(p.rc.yaw), exact(p.rc.throttle)].join(',');
      packets.push(`${exact(p.tMs)}:${rc}`);
    }
    t = end;
  }
  const state = [link.id, link.hz, link.delayMs, link.jitterMs, link.lossPpm, link.periodMs,
    link.sent, link.dropped, link.pending.length, exact(link.nextMs), link.isPerfect()];
  const hash = createHash('sha256').update(packets.join('\n')).update('|').update(asked.join('\n')).digest('hex');
  return { packets: packets.length, asked: asked.length, state: JSON.stringify(state), hash };
}

const steady = (n) => () => n;
const ragged = (i) => [16, 7, 33, 4, 16.6667, 11][i % 6];

const SCENARIOS = {};
for (const id of Object.keys(LINK_PRESETS)) {
  for (const seed of [undefined, 0xABCD1234, 1]) {
    for (const [bname, block] of [['16', steady(16)], ['ragged', ragged]]) {
      SCENARIOS[`${id} seed ${seed ?? 'default'} blocks ${bname}`] = () => session(new RcLink(id, seed), { ms: 3000, block });
    }
  }
}
SCENARIOS['elrs250 reset at 1234.5'] = () => session(new RcLink('elrs250', 77), { ms: 2000, block: steady(16), start: 1234.5 });
SCENARIOS['a signal of nothing every frame'] = () => session(new RcLink('elrs150', 0xABCD1234), {
  ms: 2000, block: steady(16), script: (l, t) => l.setSignal(0, 0, null, t),
});
SCENARIOS['delay opens and closes on a preset'] = () => session(new RcLink('elrs250', 5), {
  ms: 3000, block: ragged, script: (l, t, i) => l.setSignal(i % 40 < 15 ? 120 : 0, 0, null, t),
});
SCENARIOS['delay opens and closes on perfect'] = () => session(new RcLink('perfect', 5), {
  ms: 3000, block: steady(16), script: (l, t, i) => l.setSignal(i % 50 < 20 ? 120 : 0, 0, null, t),
});
SCENARIOS['signal loss ramps on a preset'] = () => session(new RcLink('crossfire', 9), {
  ms: 4000, block: steady(16), script: (l, t, i) => l.setSignal(30, (i * 4000) % 1e6, null, t),
});
SCENARIOS['signal loss on perfect'] = () => session(new RcLink('perfect', 0x13572468), {
  ms: 4000, block: steady(16), script: (l, t) => l.setSignal(120, 900000, null, t),
});
SCENARIOS['failsafe comes and goes'] = () => session(new RcLink('elrs250', 0x2468ACE0), {
  ms: 4000, block: ragged, script: (l, t, i) => (i % 60 < 25 ? l.setSignal(120, 1e6, FAILSAFE, t) : l.setSignal(0, 0, null, t)),
});
SCENARIOS['failsafe on perfect'] = () => session(new RcLink('perfect', 3), {
  ms: 2000, block: steady(16), script: (l, t, i) => (i % 30 < 10 ? l.setSignal(0, 0, FAILSAFE, t) : l.setSignal(0, 0, null, t)),
});
SCENARIOS['presets swap mid flight'] = () => {
  const ids = Object.keys(LINK_PRESETS);
  return session(new RcLink('elrs500', 11), {
    ms: 4000, block: steady(16), script: (l, t, i) => {
      if (i % 37 === 36) {
        l.setPreset(ids[(i / 37) % ids.length | 0]);
      }
    },
  });
};
SCENARIOS['a bad preset id'] = () => session(new RcLink('nope', 4), { ms: 500, block: steady(16) });

console.log('the presets');
check('perfect is the default', LINK_DEFAULT === 'perfect');
check('the preset table, every number and label', JSON.stringify(LINK_PRESETS) === JSON.stringify({
  perfect: { label: 'Perfect (no radio)', hz: 250, delayMs: 0, jitterMs: 0, lossPpm: 0 },
  elrs500: { label: 'ELRS 500 Hz', hz: 500, delayMs: 3.0, jitterMs: 0.4, lossPpm: 200 },
  elrs250: { label: 'ELRS 250 Hz', hz: 250, delayMs: 4.0, jitterMs: 0.8, lossPpm: 400 },
  elrs150: { label: 'ELRS 150 Hz', hz: 150, delayMs: 6.0, jitterMs: 1.4, lossPpm: 800 },
  crossfire: { label: 'Crossfire 150 Hz', hz: 150, delayMs: 7.5, jitterMs: 1.8, lossPpm: 1200 },
}), JSON.stringify(LINK_PRESETS));
check('linkPreset hands back the table entry', linkPreset('elrs150') === LINK_PRESETS.elrs150);
check('and perfect for anything else', linkPreset('x') === LINK_PRESETS.perfect && linkPreset(undefined) === LINK_PRESETS.perfect);
{
  const l = new RcLink('bogus');
  check('a link built on a bad id is perfect', l.id === 'perfect' && l.isPerfect() && l.hz === 250 && l.periodMs === 4);
  l.setPreset('elrs150');
  check('setPreset takes the preset\'s numbers', l.id === 'elrs150' && l.hz === 150 && l.delayMs === 6
    && l.jitterMs === 1.4 && l.lossPpm === 800 && l.periodMs === 1000 / 150);
  check('a fresh link carries no signal', l.sigDelayMs === 0 && l.sigLossPpm === 0 && l.failsafeRc === null);
}

console.log('the traces');
const got = Object.fromEntries(Object.entries(SCENARIOS).map(([name, run]) => [name, run()]));
if (WRITE) {
  writeFileSync(GOLDEN, `${JSON.stringify(got, null, 1)}\n`);
  console.log(`wrote ${Object.keys(got).length} scenarios to ${GOLDEN}`);
}
const want = JSON.parse(readFileSync(GOLDEN, 'utf8'));
check('the same scenarios as the golden', JSON.stringify(Object.keys(want)) === JSON.stringify(Object.keys(got)));
for (const [name, w] of Object.entries(want)) {
  const g = got[name];
  check(`${name}: ${w.packets} packets, ${w.asked} samples`,
    g && g.hash === w.hash && g.state === w.state && g.packets === w.packets && g.asked === w.asked,
    g ? `got ${g.packets} packets, ${g.asked} samples, state ${g.state} against ${w.state}` : 'missing');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
