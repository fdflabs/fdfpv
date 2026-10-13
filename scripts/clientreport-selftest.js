/*
 * clientreport-selftest.js: src/share/clientreport.js may not let a person
 * out of the browser.
 *
 *     node scripts/clientreport-selftest.js   (npm run clientreport:selftest)
 *
 * A seeded fuzz plants things that name or locate someone (emails, share
 * links, home folder paths, addresses, ids, tokens, callsigns with digits)
 * in messages and stacks, builds events from them and scans every
 * serialised event for any planted piece. Then: every key is on the
 * allowlist, every event stays under its byte bound, the opt out and
 * Global Privacy Control send nothing through stats.js's real sender, and
 * a negative control with the scrub bypassed must be caught by the same
 * scan, so the scan is shown to see a leak.
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

import { strict as assert } from 'node:assert';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const beacons = [];
const nav = { globalPrivacyControl: false, sendBeacon: (url, blob) => beacons.push(url, blob) > 0 };
Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true });

const report = await import('../src/share/clientreport.js');
const stats = await import('../src/share/stats.js');
const {
  errorEvent, framesEvent, createFrameHistogram, gpuClass, sendClientReport, scrubMessage, FRAME_EDGES_MS,
  createErrorReporter, createFramesReporter, reportPageErrors, ERROR_SIGS_PER_PAGE,
} = report;
const { createCrashRecord } = await import('../src/share/crashrecord.js');

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}: ${e.message}`);
  }
}

/* xorshift32, so a failure is the same failure on every run. */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 2 ** 32;
  };
}

const PLANTS = [
  'pilot.ace@example.com',
  'https://paraguayandronecombatsimulator.com/?share=trk-9f3k2m&utm_source=x',
  'file:///home/fernando/Desktop/notes.txt',
  '/home/fernando/.config/chrome',
  'C:\\Users\\Fernando\\AppData\\x.js',
  '192.168.1.44',
  '2803:9800:a0c1::17',
  '3f2b8c1e-7a4d-4e2b-9c1a-0d5e6f7a8b9c',
  'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3',
  'eyJhbGciOiJIUzI1NiJ9xQ2',
  'Ace99',
  'Maverick_07',
  'blob:https://x.test/0b1c',
];
const FILLER = ['Cannot read properties of undefined', 'is not a function', 'failed at', 'reading', 'for pilot', 'near', 'TypeError:'];
const QUOTES = ['', "'", '"', '`'];

function plantedText(r, plant) {
  const q = QUOTES[Math.floor(r() * QUOTES.length)];
  const a = FILLER[Math.floor(r() * FILLER.length)];
  const b = FILLER[Math.floor(r() * FILLER.length)];
  return `${a} ${q}${plant}${q} ${b}`;
}

function plantedStack(r, plant) {
  const lines = [
    `    at frame (https://paraguayandronecombatsimulator.com/src/main.js:18570:12)`,
    `    at x (${plant}:1:2)`,
    `    at y (https://evil.test/src/steal.js?u=${encodeURIComponent(plant)}:3:4)`,
    `    at z (chrome-extension://abcdef/src/inject.js:9:9)`,
  ];
  return lines.sort(() => r() - 0.5).join('\n');
}

/* Every fragment of a plant longer than three characters that is not
 * plain English filler: what must never appear in the wire form. */
function fragments(plant) {
  return plant.split(/[^A-Za-z0-9]+/).filter((f) => f.length > 3 && /\d/.test(f) || f.length > 5);
}

const ALLOWED = {
  error: ['kind', 'sig', 'msg', 'where', 'count'],
  frames: ['kind', 'b', 'gpu', 'cap', 'scale'],
};
const MAX_BYTES = { error: 600, frames: 200 };

function leaks(event, plant) {
  const wire = JSON.stringify(event);
  return fragments(plant).filter((f) => wire.includes(f));
}

function fuzz(build, seed, rounds) {
  const r = rng(seed);
  const found = [];
  for (let i = 0; i < rounds; i++) {
    const plant = PLANTS[i % PLANTS.length];
    const event = build({ message: plantedText(r, plant), stack: plantedStack(r, plant), count: Math.floor(r() * 5000) });
    if (!event) {
      continue;
    }
    for (const f of leaks(event, plant)) {
      found.push(`${f} in ${JSON.stringify(event)}`);
    }
    for (const key of Object.keys(event)) {
      if (!ALLOWED[event.kind].includes(key)) {
        found.push(`key ${key}`);
      }
    }
    if (JSON.stringify(event).length > MAX_BYTES[event.kind]) {
      found.push(`size ${JSON.stringify(event).length}`);
    }
  }
  return found;
}

check('fuzz: no planted piece, no extra key, no oversize event in 4000 error events', () => {
  const found = fuzz(errorEvent, 0x10f00d, 4000);
  assert.deepEqual(found.slice(0, 3), []);
});

/* The scrub bypassed: the same fuzz has to find the leaks. */
check('negative control: a builder that only clips is caught', () => {
  const clipOnly = ({ message, stack, count }) => ({
    kind: 'error', sig: '0', msg: String(message).slice(0, 120), where: String(stack).split('\n').slice(0, 3), count,
  });
  assert.ok(fuzz(clipOnly, 0x10f00d, 400).length > 100);
});

check('a real error keeps its shape and its repo frames', () => {
  const e = errorEvent({
    message: "Cannot read properties of undefined (reading 'pos')",
    stack: 'TypeError: x\n    at closeFrame (https://paraguayandronecombatsimulator.com/src/main.js:18570:12)\n    at https://paraguayandronecombatsimulator.com/src/render/dynres.js:88:5',
    count: 3,
  });
  assert.equal(e.msg, 'Cannot read properties of undefined (reading <q>)');
  assert.deepEqual(e.where, ['src/main.js:18570:12', 'src/render/dynres.js:88:5']);
  assert.equal(e.count, 3);
  assert.match(e.sig, /^[0-9a-f]{8}$/);
  assert.equal(errorEvent({ message: 'Cannot read properties of undefined (reading \'other\')', stack: '' }).sig,
    errorEvent({ message: 'Cannot read properties of undefined (reading \'pos\')', stack: '' }).sig);
});

check('a message longer than any bound is cut, an empty one is nothing', () => {
  const e = errorEvent({ message: 'word '.repeat(5000), stack: 'src/a.js:1:1\n'.repeat(50), count: 1e9 });
  assert.ok(e.msg.length <= 120 && e.where.length <= 3 && e.count === 999);
  assert.ok(JSON.stringify(e).length < 600);
  assert.equal(errorEvent({ message: '', stack: 'at https://evil.test/x.js:1:1' }), null);
  assert.equal(scrubMessage('\u0000\u202e line 42'), 'line 42');
});

check('frames: fixed buckets, clamped, nothing outside the allowlist', () => {
  const h = createFrameHistogram();
  for (const ms of [5, 8.4, 9, 16.7, 16.9, 40, 99, 250, -1, NaN]) {
    h.add(ms);
  }
  const counts = h.take();
  assert.deepEqual(counts, [2, 1, 0, 1, 1, 0, 0, 1, 1, 1]);
  assert.deepEqual(h.take(), new Array(FRAME_EDGES_MS.length + 1).fill(0));
  const f = framesEvent({ counts: [1e9, ...counts.slice(1)], gpu: 'ANGLE (NVIDIA GeForce RTX 3060 Ti)', fpsCap: 143, scale: 0.61 });
  assert.deepEqual(Object.keys(f), ALLOWED.frames);
  assert.equal(f.b[0], 15000);
  assert.equal(f.gpu, 'hidden');
  assert.equal(f.cap, 144);
  assert.equal(f.scale, 0.5);
  assert.ok(JSON.stringify(f).length <= MAX_BYTES.frames);
  assert.equal(framesEvent({ counts: [] }), null);
});

check('gpu class never carries the renderer string', () => {
  assert.equal(gpuClass({ usable: true, software: true, hidden: false, raw: 'SwiftShader' }), 'software');
  assert.equal(gpuClass({ usable: true, integrated: true, raw: 'Intel Iris Xe' }), 'integrated');
  assert.equal(gpuClass({ usable: true, raw: 'NVIDIA GeForce RTX 3060 Ti' }), 'discrete');
  assert.equal(gpuClass({ usable: true, hidden: true, raw: 'WebKit WebGL' }), 'hidden');
  assert.equal(gpuClass(null), 'hidden');
});

const sample = errorEvent({ message: 'boom', stack: 'src/main.js:1:1' });

check('counting on: one beacon with the event as stats.js wraps it', () => {
  beacons.length = 0;
  assert.equal(sendClientReport(sample), true);
  assert.equal(beacons.length, 2);
  assert.match(String(beacons[0]), /\/api\/stats\/events$/);
});

check('opted out: nothing is sent', () => {
  beacons.length = 0;
  stats.setOptedOut(true);
  assert.equal(sendClientReport(sample), false);
  assert.equal(sendClientReport(framesEvent({ counts: [5] })), false);
  stats.setOptedOut(false);
  assert.equal(beacons.length, 0);
});

check('Global Privacy Control: nothing is sent', () => {
  beacons.length = 0;
  nav.globalPrivacyControl = true;
  assert.equal(sendClientReport(sample), false);
  nav.globalPrivacyControl = false;
  assert.equal(beacons.length, 0);
});

check('nothing to say sends nothing', () => {
  beacons.length = 0;
  assert.equal(sendClientReport(null), false);
  assert.equal(beacons.length, 0);
});

/* The board's refusals (fdfpv-leaderboard src/validate.js
 * inspectErrorReport; KEEP IN STEP): an event it refuses is an error
 * nobody hears about, so every event this side builds must pass them. */
const BOARD_UNREDUCED = /:\/\/|@|\/\w|\d{6,}/;
const BOARD_FRAME = /^(?:src|dist|vendor)\/[\w./-]+\.(?:m?js|wasm):\d+(?::\d+)?$/;
function boardRefuses(e) {
  return !/^[\x20-\x7e]{0,120}$/.test(e.msg) || BOARD_UNREDUCED.test(e.msg)
    || !e.where.every((f) => f.length <= 64 && BOARD_FRAME.test(f)) || e.count < 1 || e.count > 999;
}

check('the board takes every error event the fuzz builds', () => {
  const r = rng(0xb0a2d);
  const refused = [];
  for (let i = 0; i < 4000; i++) {
    const plant = PLANTS[i % PLANTS.length];
    const e = errorEvent({ message: plantedText(r, plant), stack: plantedStack(r, plant), count: 1 + Math.floor(r() * 5000) });
    if (e && boardRefuses(e)) {
      refused.push(JSON.stringify(e));
    }
  }
  assert.deepEqual(refused.slice(0, 3), []);
  assert.ok(boardRefuses({ msg: 'see https://x.test', where: [], count: 1 }), 'the copy of the board rule refuses a leak');
});

/* A clock and a sender the reporters can be driven with. */
function harness() {
  const sent = [];
  let t = 1000;
  return {
    sent,
    send: (event) => sent.push(event) > 0,
    now: () => t,
    advance: (ms) => { t += ms; },
  };
}

check('errors: the first of a kind goes at once, with count 1', () => {
  const h = harness();
  const rep = createErrorReporter({ send: h.send, now: h.now });
  rep.note({ message: 'x is not a function', stack: 'at f (https://a.test/src/main.js:10:2)' });
  assert.equal(h.sent.length, 1);
  assert.deepEqual(Object.keys(h.sent[0]), ALLOWED.error);
  assert.equal(h.sent[0].count, 1);
  assert.deepEqual(h.sent[0].where, ['src/main.js:10:2']);
});

check('errors: repeats are held, then sent once a minute and as the page goes', () => {
  const h = harness();
  const rep = createErrorReporter({ send: h.send, now: h.now });
  const thrown = { message: 'no seat for Ace7', stack: 'src/main.js:1:1' };
  rep.note(thrown);
  for (let i = 0; i < 300; i++) {
    h.advance(16);
    rep.note({ ...thrown, message: `no seat for Ace${8 + i}` });
  }
  assert.equal(h.sent.length, 1, 'nothing more within the minute');
  h.advance(60000);
  rep.note(thrown);
  assert.equal(h.sent.length, 2);
  assert.equal(h.sent[1].count, 301);
  assert.equal(h.sent[1].sig, h.sent[0].sig);
  rep.note(thrown);
  rep.note(thrown);
  rep.leaving();
  assert.equal(h.sent.length, 3);
  assert.equal(h.sent[2].count, 2);
  rep.leaving();
  assert.equal(h.sent.length, 3, 'a second leaving with nothing held sends nothing');
});

check('errors: a page reports a bounded number of kinds', () => {
  const h = harness();
  const rep = createErrorReporter({ send: h.send, now: h.now });
  for (let i = 0; i < 100; i++) {
    rep.note({ message: `kind ${'abcdefghijklmnopqrstuvwxyz'[i % 26]}${'abcdefghijklmnopqrstuvwxyz'[Math.floor(i / 26)]}`, stack: '' });
  }
  assert.equal(h.sent.length, ERROR_SIGS_PER_PAGE);
});

check('errors: those thrown before main.js listens are reported when it does', () => {
  const h = harness();
  const record = createCrashRecord(() => 0);
  record.noteError('early one', 'src/boot.js:3:3', 'at x (https://a.test/src/boot.js:3:3)');
  const handlers = {};
  const win = {
    addEventListener: (type, fn) => { handlers[type] = fn; },
    document: { hidden: false, addEventListener: (type, fn) => { handlers[`doc.${type}`] = fn; } },
  };
  reportPageErrors(record, win, createErrorReporter({ send: h.send, now: h.now }));
  assert.equal(h.sent.length, 1);
  assert.deepEqual(h.sent[0].where, ['src/boot.js:3:3']);
  record.noteError('later one', '', '');
  assert.equal(h.sent.length, 2);
  record.noteError('later one', '', '');
  handlers.pagehide();
  assert.equal(h.sent.length, 3);
  assert.equal(h.sent[2].count, 1);
  assert.equal(record.report().errors.length, 2, 'the F8 report still keeps them');
});

check('frames: one event per minute of drawn frames, the part minute on leaving', () => {
  const h = harness();
  const rep = createFramesReporter({ gpu: gpuClass({ usable: true, integrated: true, raw: 'Intel Iris Xe' }), send: h.send });
  for (let t = 0; t <= 60000; t += 16) {
    rep.frame(t, t % 1600 === 0 ? 40 : 6, 0.75, 60);
  }
  assert.equal(h.sent.length, 1);
  const f = h.sent[0];
  assert.deepEqual(Object.keys(f), ALLOWED.frames);
  assert.equal(f.b.reduce((a, b) => a + b, 0), 3751);
  assert.equal(f.b[0], 3713);
  assert.equal(f.b[7], 38);
  assert.equal(f.gpu, 'integrated');
  assert.equal(f.cap, 60);
  assert.equal(f.scale, 0.75);
  rep.frame(60100, 120, 1, 0);
  rep.flush();
  assert.equal(h.sent.length, 2);
  assert.deepEqual(h.sent[1].b, [0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
  rep.flush();
  assert.equal(h.sent.length, 2, 'an empty window sends nothing');
});

check('reporters through the real sender: opted out and GPC send nothing', () => {
  const run = () => {
    const errors = createErrorReporter({ now: () => 0 });
    errors.note({ message: 'opt out probe', stack: 'src/main.js:2:2' });
    errors.leaving();
    const frames = createFramesReporter({ gpu: 'discrete' });
    frames.frame(0, 30, 1, 0);
    frames.flush();
  };
  beacons.length = 0;
  run();
  assert.equal(beacons.length, 4, 'counting on: the error and the frames go');
  beacons.length = 0;
  stats.setOptedOut(true);
  run();
  stats.setOptedOut(false);
  nav.globalPrivacyControl = true;
  run();
  nav.globalPrivacyControl = false;
  assert.equal(beacons.length, 0);
});

console.log(`clientreport:selftest ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
