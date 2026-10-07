/*
 * flightlog-selftest.js: the in-browser flight recorder and its blackbox
 * CSV (src/share/flightlog.js), pinned as a transcript.
 *
 *     node scripts/flightlog-selftest.js [--dump=<file>]   (npm run flightlog:selftest)
 *
 * Recorded: the CSV for rows with and without motor and pack columns and
 * with awkward numbers; the recorder switched on and off, its time axis
 * spliced across module resets, its ring at the row cap, its count and
 * seconds; the download it hands the browser (stand in document, Blob and
 * object URL); and the file name at a fixed clock. Pinned by digest
 * (scripts/lib/transcript.js) on the module before its rewrite.
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
import { seeded, transcript } from './lib/transcript.js';

process.env.TZ = 'America/Asuncion';
const PINNED = 'e373be6e738feae5e6ac03a3f323631090e56b00c25afc70c3c4b00dd446b6e1';

const fl = await import('../src/share/flightlog.js');
const t = transcript();
const rand = seeded(42);
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 24);

t.note('exports', Object.keys(fl).sort());

/* The CSV writer. */
const ROWS = [
  { tUs: 0, rc: [0, 0, 0, 0], gyroDps: [0, 0, 0], motor: [0, 0, 0, 0], vbat: 16.8 },
  { tUs: 1234.5, rc: [0.5, -0.25, 1, 0.75], gyroDps: [12.5, -3, 0.001], motor: [0.1, 0.2, 0.3, 1], vbat: 15.2 },
  { tUs: 2000.4999, rc: [-1, 1, -0.333, 1], gyroDps: [-1e-7, 1e9, -0] },
  { tUs: 3e6, rc: [0.1, 0.2, 0.3, 0.4], gyroDps: [1, 2, 3], motor: [NaN, Infinity, -0, 0.5], vbat: 0 },
  { tUs: -5, rc: [-0, 0, 0, -0.5], gyroDps: [1, 2, 3], motor: null, vbat: null },
];
t.rec('csv of nothing', () => fl.toBlackboxCsv([]));
t.rec('csv rows', () => fl.toBlackboxCsv(ROWS));
/* An engine TypeError is recorded by its kind; its message quotes source. */
t.rec('csv of a row missing its sticks', () => {
  try {
    return fl.toBlackboxCsv([{ tUs: 1, gyroDps: [0, 0, 0] }]);
  } catch (e) {
    return `engine ${e.constructor.name}`;
  }
});

/* The recorder. */
const rc = (r, p, y, th) => ({
  roll: r, pitch: p, yaw: y, throttle: th, aux: 9,
});
function state(tS) {
  const st = new Array(24).fill(0);
  st[0] = tS;
  for (let i = 11; i <= 13; i += 1) {
    st[i] = (rand() - 0.5) * 20;
  }
  for (let i = 14; i <= 17; i += 1) {
    st[i] = rand() * 30000;
  }
  st[18] = 14 + rand() * 3;
  return st;
}
/* A recorder's rows, read back out of its CSV as numbers. */
const rows = (r) => r.csv().trim().split('\n').slice(1).map((line) => line.split(', ').map(Number));
const rec = new fl.FlightRecorder();
t.note('fresh', [rec.count, rec.seconds, rec.on, rec.csv()]);
rec.push(state(0.001), rc(0, 0, 0, 0), 30000);
t.note('off: nothing kept', rec.count);
rec.setEnabled(1);
t.note('on', [rec.on, rec.count]);
for (let i = 0; i < 6; i += 1) {
  rec.push(state(0.004 * i), rc(rand(), -rand(), rand(), rand()), 30000);
}
t.note('one row: no seconds yet', new fl.FlightRecorder().seconds);
t.note('six rows', [rec.count, rec.seconds, rec.csv()]);
/* The module reset: its clock starts again at zero. */
rec.push(state(0), rc(0, 0, 0, 0.5), 30000);
rec.push(state(0.002), rc(0, 0, 0, 0.5), 30000);
rec.push(state(0.0015), rc(0, 0, 0, 0.5), 0);
rec.push(state(0.0015), rc(0, 0, 0, 0.5), -1);
t.note('spliced across resets', [rec.count, rec.seconds, rows(rec).map((r) => r[0])]);
t.note('a full throttle of zero or less: no motor fraction', rows(rec).slice(-2).map((r) => r.slice(8, 12)));
t.note('csv', sha(rec.csv()));
t.note('csv head', rec.csv().split('\n').slice(0, 3));
rec.setEnabled(true);
t.note('switching on again starts a new log', [rec.count, rec.seconds, rec.csv()]);
rec.push(state(0.5), rc(0, 0, 0, 0), 30000);
t.note('and its time axis starts afresh', rows(rec).map((r) => r[0]));
rec.push(state(5), rc(0, 0, 0, 0), 30000);
rec.setEnabled(false);
t.note('switching off keeps the log', [rec.on, rec.count]);
rec.push(state(6), rc(0, 0, 0, 0), 30000);
t.note('and adds nothing', rec.count);
rec.clear();
t.note('cleared', [rec.count, rec.on, rec.csv()]);
{
  const c = new fl.FlightRecorder();
  c.setEnabled(true);
  c.push(state(1), rc(0, 0, 0, 0), 30000);
  c.push(state(0.5), rc(0, 0, 0, 0), 30000);
  c.clear();
  c.push(state(0.25), rc(0, 0, 0, 0), 30000);
  t.note('a clear restarts the time axis and keeps recording', [c.on, rows(c).map((r) => r[0])]);
}

/* The ring. */
const ring = new fl.FlightRecorder();
ring.setEnabled(true);
const st = state(0);
for (let i = 0; i < 100005; i += 1) {
  st[0] = i * 0.001;
  ring.push(st, rc(0, 0, 0, 0), 30000);
}
t.note('the ring at its cap', [ring.count, rows(ring)[0][0], rows(ring).at(-1)[0], ring.seconds, sha(ring.csv())]);

/* The download. */
const made = [];
const revoked = [];
globalThis.document = {
  body: { append: (el) => made.push(['append', el.tagName]) },
  createElement: (tag) => {
    const el = {
      tagName: tag.toUpperCase(), style: {}, click() { made.push(['click', this.href, this.download, this.style.display]); }, remove() { made.push(['remove']); },
    };
    return el;
  },
};
const realUrl = globalThis.URL;
globalThis.URL = class extends realUrl {};
globalThis.URL.createObjectURL = (blob) => {
  made.push(['blob', blob.type, blob.size]);
  return 'blob:test/1';
};
globalThis.URL.revokeObjectURL = (url) => revoked.push(url);
t.rec('downloadText', () => fl.downloadText('flight.csv', 'a,b\n1,2\n'));
t.rec('downloadText as JSON', () => fl.downloadText('x.json', '{}', 'application/json'));
t.note('what the page did', made);
t.note('revoked at once', revoked.slice());
await new Promise((r) => setTimeout(r, 5));
t.note('revoked on the next tick', revoked);

/* The file name. */
const RealDate = Date;
for (const when of ['2026-10-06T23:59:58Z', '2026-01-02T03:04:05Z']) {
  globalThis.Date = class extends RealDate {
    constructor(...a) {
      super(...(a.length ? a : [RealDate.parse(when)]));
    }
  };
  for (const map of ['alps', '', null, undefined, 7, 'a b']) {
    t.rec(`flightLogName ${when} ${map}`, () => fl.flightLogName(map));
  }
}
globalThis.Date = RealDate;

t.finish('flightlog.js', PINNED);
