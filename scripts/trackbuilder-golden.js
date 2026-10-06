/*
 * trackbuilder-golden.js: every output of src/trackbuilder, pinned bit for bit.
 *
 *     node scripts/trackbuilder-golden.js            (npm run trackbuilder:golden)
 *     node scripts/trackbuilder-golden.js --write    regenerate the goldens
 *     node scripts/trackbuilder-golden.js --dump D   write every output to D
 *
 * The track document is a stored and shared format: the tracks server holds
 * it, the board checks laps against it with these very modules, and a
 * marker's scoring square is placed off a knot of the racing line. So a
 * rewrite of any file in src/trackbuilder has to give back the same bytes,
 * not roughly the same numbers. This runs every export over a corpus and
 * compares a hash of each output with tests/fixtures/trackbuilder/golden.json,
 * which was written from the code as it stood before the rewrite.
 *
 * The corpus is the stored tracks we have (the prod track server's public
 * track, the board's version 1 track, the schema's worked example, the
 * fixtures and shipped courses already in the tree), seeded random documents
 * of every version and class written as raw JSON by this script and never by
 * the code under test, and seeded mutations of the real ones, which are what
 * pin normalize's repairs. Numbers are compared exactly: String(n) of a
 * double round-trips, and -0, NaN and the infinities are spelled out.
 *
 * Track ids that are random by design are checked for shape and masked, so
 * a rewrite may draw them differently. Time is fixed, so timestamps are not.
 *
 * --dump writes one file per case, for diffing a failing run against a dump
 * of the old code (git archive origin/main into a scratch dir and run this
 * there).
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
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(ROOT, 'tests/fixtures/trackbuilder');
const GOLDEN = join(FIXTURES, 'golden.json');
const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const DUMP = args.includes('--dump') ? args[args.indexOf('--dump') + 1] : null;

/* ------------------------------------------------------------------ */
/* A fixed world: time, randomness, storage, window.                   */
/* ------------------------------------------------------------------ */

const FIXED_NOW = Date.UTC(2026, 9, 6, 12, 34, 56, 789);
const RealDate = Date;
class FixedDate extends RealDate {
  constructor(...a) {
    super(...(a.length ? a : [FIXED_NOW]));
  }

  static now() {
    return FIXED_NOW;
  }
}
globalThis.Date = FixedDate;

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* The code under test may draw ids from Math.random; reseeded per case so a
 * case never depends on how much randomness the cases before it used. */
function reseedMathRandom(seed) {
  Math.random = mulberry(seed ^ 0x5eed);
}

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  key: (i) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
  clear: () => store.clear(),
};
const savedEvents = [];
const win = new EventTarget();
win.location = { search: '', hostname: 'localhost' };
globalThis.window = win;
const realDispatch = win.dispatchEvent.bind(win);
win.dispatchEvent = (ev) => {
  savedEvents.push(ev.type);
  return realDispatch(ev);
};

const geometry = await import('../src/trackbuilder/geometry.js');
const elements = await import('../src/trackbuilder/elements.js');
const figures = await import('../src/trackbuilder/figures.js');
const faces = await import('../src/trackbuilder/faces.js');
const path = await import('../src/trackbuilder/path.js');
const model = await import('../src/trackbuilder/model.js');
const storage = await import('../src/trackbuilder/storage.js');
const { courseFromDocument } = await import('../src/game/trackdoc.js');
const { planesFor } = await import('../src/game/verify.js');

/* ------------------------------------------------------------------ */
/* Canonical text of any value, exact for doubles, key order kept.     */
/* ------------------------------------------------------------------ */

/* Written piece by piece into `out` rather than built as one string: a
 * course's output is large and the corpus is hundreds of documents. */
function canon(v, out, seen = new Set()) {
  if (v === undefined) {
    out('undef');
  } else if (v === null) {
    out('null');
  } else if (typeof v === 'number') {
    out(Object.is(v, -0) ? '-0' : String(v));
  } else if (typeof v === 'string') {
    out(JSON.stringify(v));
  } else if (typeof v === 'boolean' || typeof v === 'bigint') {
    out(String(v));
  } else if (typeof v === 'function') {
    out(`fn/${v.length}`);
  } else if (seen.has(v)) {
    out('cycle');
  } else {
    seen.add(v);
    const list = (items, open, close, each) => {
      out(open);
      let first = true;
      for (const x of items) {
        if (!first) {
          out(',');
        }
        first = false;
        each(x);
      }
      out(close);
    };
    if (Array.isArray(v)) {
      list(v, '[', ']', (x) => canon(x, out, seen));
    } else if (v instanceof Map) {
      list(v, 'Map{', '}', ([k, x]) => {
        canon(k, out, seen);
        out('=>');
        canon(x, out, seen);
      });
    } else if (v instanceof Set) {
      list(v, 'Set{', '}', (x) => canon(x, out, seen));
    } else if (ArrayBuffer.isView(v)) {
      list(v, `${v.constructor.name}[`, ']', (x) => canon(x, out, seen));
    } else {
      list(Object.keys(v), '{', '}', (k) => {
        out(`${JSON.stringify(k)}:`);
        canon(v[k], out, seen);
      });
    }
    seen.delete(v);
  }
}

/* A call that throws is recorded as throwing, not by its message: an engine's
 * TypeError text is not part of anybody's contract. */
function attempt(fn) {
  try {
    return fn();
  } catch (e) {
    return { THREW: true };
  }
}

const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
const TRACK_ID = /^trk-[0-9a-f]{8}$/;

/* A fresh track id must have the documented shape; its digits are random by
 * design, so the value is replaced before hashing. */
function maskNewId(value, oldId) {
  if (!value || typeof value !== 'object') {
    return value;
  }
  const out = value;
  if (typeof out.id === 'string') {
    if (!TRACK_ID.test(out.id) || out.id === oldId) {
      out.id = `BAD-ID:${out.id}`;
    } else {
      out.id = 'trk-MASKED';
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The corpus.                                                         */
/* ------------------------------------------------------------------ */

const TYPES = [
  'gate', 'flaggedGate', 'doubleStack', 'flaggedDoubleStack', 'ladder', 'tower', 'diveGate', 'barrier', 'flag',
  'cone', 'waypoint', 'pole', 'horizontalPole', 'wideGate3', 'wideGate5', 'pylonPair', 'pylon', 'hoop175', 'hoop250',
  'hoop6', 'hoop12', 'hoop20', 'hoop30', 'startPads', 'label', 'groundLogo',
];
const APERTURE_TYPES = ['gate', 'flaggedGate', 'doubleStack', 'flaggedDoubleStack', 'ladder', 'tower', 'diveGate',
  'wideGate3', 'wideGate5', 'pylonPair', 'hoop175', 'hoop250', 'hoop6', 'hoop12', 'hoop20', 'hoop30'];
const STACK_TYPES = ['doubleStack', 'flaggedDoubleStack', 'ladder', 'tower'];
const MARKER_TYPES = ['flag', 'cone', 'waypoint', 'pole', 'pylon'];
const CLASSES = ['full', 'wing', 'micro', undefined, 'bogus', 7];
const MAPS = ['swiss2', 'alps', 'itaipu', 'interior', 'track', 'bogus', '', 3];
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function realDocs() {
  const files = [
    'tests/fixtures/trackbuilder/schema-example-v2.json',
    'tests/fixtures/trackbuilder/board-v1.json',
    'tests/fixtures/trackbuilder/prod-pocho-v4.json',
    'tests/fixtures/map-track-v4.json',
    'docs/itaipu-courses/itaipu-run.json',
    'docs/itaipu-courses/powerhouse.json',
    'scripts/gatecards-track.json',
  ];
  return files.map((f) => ({ name: f.split('/').pop().replace('.json', ''), raw: JSON.parse(readFileSync(join(ROOT, f), 'utf8')) }));
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

function junkValue(rng) {
  return pick(rng, [null, -1, 0, 9999, -0.5, 'x', '', true, false, [], {}, [1, 2], { x: 1 }, 3.141593, -3.141593, 1e-9]);
}

function randomNumber(rng, lo, hi, round = true) {
  const n = lo + rng() * (hi - lo);
  return round && rng() < 0.6 ? Math.round(n * 1e6) / 1e6 : n;
}

function randomDims(rng, type) {
  const r = rng();
  if (r < 0.35) {
    return undefined;
  }
  const d = {};
  const keys = ['levels', 'sillH', 'clearW', 'clearH', 'levelPitch', 'flagH', 'width', 'depth', 'height', 'poleRadius',
    'baseRadius', 'tipRadius', 'clearance', 'pads', 'spacing', 'padSize', 'textHeight', 'tubeR'];
  for (const k of keys) {
    if (rng() < 0.3) {
      d[k] = rng() < 0.85 ? randomNumber(rng, k === 'levels' || k === 'pads' ? 0 : -1, k === 'levels' ? 5 : 12) : junkValue(rng);
    }
  }
  if (APERTURE_TYPES.includes(type) && rng() < 0.4) {
    d.levels = Math.floor(rng() * 4) + 1;
  }
  return d;
}

function randomQuat(rng) {
  const r = rng();
  if (r < 0.1) {
    return undefined;
  }
  if (r < 0.15) {
    return { w: 0, x: 0, y: 0, z: 0 };
  }
  if (r < 0.2) {
    return { w: 2, x: 0, y: 0, z: 0 };
  }
  if (r < 0.45) {
    const a = rng() * Math.PI * 2;
    return { w: Math.cos(a / 2), x: 0, y: 0, z: Math.sin(a / 2) };
  }
  const q = { w: rng() - 0.5, x: rng() - 0.5, y: rng() - 0.5, z: rng() - 0.5 };
  const n = Math.hypot(q.w, q.x, q.y, q.z) || 1;
  return { w: q.w / n, x: q.x / n, y: q.y / n, z: q.z / n };
}

function randomElement(rng, i, opts) {
  const type = opts.type ?? (rng() < 0.03 ? 'bogus' : pick(rng, TYPES));
  const el = {
    id: rng() < 0.03 ? `el-${i}` : `el-${i + 1}`,
    type,
    name: rng() < 0.7 ? '' : `Thing ${i}`,
    position: {
      x: randomNumber(rng, opts.x0, opts.x1),
      y: randomNumber(rng, opts.y0, opts.y1),
      z: rng() < 0.6 ? 0 : randomNumber(rng, opts.z0, opts.z1),
    },
    yaw: rng() < 0.15 ? pick(rng, [0, Math.PI, -Math.PI, 3.141593, -3.141593, Math.PI / 2]) : randomNumber(rng, -4, 4),
    pitch: rng() < 0.7 ? 0 : pick(rng, [Math.PI / 2, -Math.PI / 2, 0.959931, randomNumber(rng, -2, 2), 1.570796]),
    yawOverridden: rng() < 0.2,
    dims: randomDims(rng, type),
  };
  if (type === 'label') {
    el.text = rng() < 0.8 ? 'Ladder low' : junkValue(rng);
  }
  if (type === 'flaggedGate' || type === 'flaggedDoubleStack' || rng() < 0.05) {
    el.flagSide = pick(rng, ['left', 'right', 'both', 'top', 'centre', undefined, 3]);
  }
  if (type === 'groundLogo') {
    el.logoId = pick(rng, ['logo-1', 'logo-2', '', 'logo-9', undefined]);
  }
  if (rng() < 0.08) {
    el.unbuilt = pick(rng, [true, false, 'yes']);
  }
  if (opts.map) {
    el.orientation = randomQuat(rng);
  }
  if (rng() < 0.04) {
    delete el.position;
  }
  if (rng() < 0.03) {
    el.yaw = junkValue(rng);
  }
  if (rng() < 0.03) {
    el.position = { x: 'a', y: null };
  }
  return el;
}

function randomSeqEntry(rng, i, el) {
  const isMarker = MARKER_TYPES.includes(el?.type);
  return {
    id: rng() < 0.03 ? `sq-${i}` : `sq-${i + 1}`,
    elementId: rng() < 0.05 ? 'el-999' : el?.id,
    apertureIndex: isMarker ? (rng() < 0.9 ? null : 0) : pick(rng, [0, 0, 0, 1, 2, 3, -1, null, 1.5]),
    entry: isMarker ? (rng() < 0.9 ? null : 1) : pick(rng, [1, 1, -1, -1, 0, null, 2, 'x']),
    passSide: isMarker ? pick(rng, ['left', 'right', 'right', null, 'up']) : (rng() < 0.9 ? null : 'left'),
    clearance: isMarker ? pick(rng, [1.5, 1, 0, null, 5, -2, randomNumber(rng, 0, 6)]) : (rng() < 0.95 ? null : 2),
    overridden: rng() < 0.25,
  };
}

/* Spiral up, spiral down, split-S and hand mixes on one stack, consecutive,
 * the way the inspector and older builds wrote them. */
function stackRun(rng, i, el) {
  const levels = el.dims?.levels ?? (el.type === 'ladder' ? 3 : 2);
  const n = Math.max(1, Math.min(4, typeof levels === 'number' ? levels : 2));
  const s = pick(rng, [1, -1]);
  const style = pick(rng, ['up-same', 'up-alt', 'down-alt', 'down-same', 'splits', 'mix']);
  const run = [];
  for (let k = 0; k < n; k += 1) {
    let ap = k;
    let entry = s;
    if (style === 'up-alt' || style === 'down-alt') {
      entry = k % 2 ? -s : s;
    }
    if (style === 'down-alt' || style === 'down-same') {
      ap = n - 1 - k;
    }
    if (style === 'splits') {
      ap = k === 0 ? n - 1 : 0;
      entry = k === 0 ? s : -s;
      if (k > 1) {
        break;
      }
    }
    if (style === 'mix') {
      ap = Math.floor(rng() * n);
      entry = pick(rng, [1, -1]);
    }
    run.push({
      id: `sq-${i + k + 1}`, elementId: el.id, apertureIndex: ap, entry, passSide: null, clearance: null,
      overridden: rng() < 0.2,
    });
  }
  return run;
}

function randomFieldDoc(rng, n) {
  const version = pick(rng, [1, 2, 3, 3, 3, undefined, 5, '3']);
  const cls = pick(rng, CLASSES);
  const wing = cls === 'wing';
  const W = wing ? 400 : 60;
  const D = wing ? 300 : 40;
  const doc = {
    schemaVersion: version,
    id: rng() < 0.9 ? `trk-${(0x10000000 + n * 7919).toString(16).slice(-8)}` : pick(rng, ['nope', '', 5]),
    name: rng() < 0.9 ? `Random ${n}` : junkValue(rng),
    createdUtc: '2026-01-02T03:04:05Z',
    modifiedUtc: rng() < 0.9 ? '2026-02-03T04:05:06Z' : junkValue(rng),
  };
  if (cls !== undefined) {
    doc.trackClass = cls;
  }
  if (rng() < 0.9) {
    doc.field = { width: rng() < 0.9 ? W : junkValue(rng), depth: D, gridSize: pick(rng, [1, 0.5, 0.01, 5, -1]) };
  }
  if (rng() < 0.85) {
    doc.settings = {
      tangentScale: pick(rng, [1.1, 1, 0.5, 2, 0, -1, 'x']),
      minCurveRadius: pick(rng, [2.5, 20, 0]),
      samplesPerSegment: pick(rng, [48, 4, 3, 512, 600, 12.5, 24]),
    };
  }
  if (version === 1 && rng() < 0.6) {
    doc.branding = { logo: pick(rng, [PNG, 'http://evil.example/x.png', '']), logoName: 'logo.png' };
  } else if (rng() < 0.6) {
    const logos = [];
    const count = Math.floor(rng() * 7);
    for (let k = 0; k < count; k += 1) {
      logos.push({
        id: rng() < 0.9 ? `logo-${k + 1}` : `logo-${k}`,
        image: pick(rng, [PNG, PNG, 'http://x.example/a.png', `data:image/png;base64,${'A'.repeat(300000)}`, 7]),
        name: `l${k}.png`,
      });
    }
    doc.branding = { logos };
  }
  if (rng() < 0.2) {
    doc.credit = pick(rng, [null, { designer: 'D', series: 'S', note: 5 }, 'x', { source: 'web', bogus: 1 }]);
  }
  const els = [];
  const count = Math.floor(rng() * 14);
  const opts = { x0: -5, x1: W + 5, y0: -5, y1: D + 5, z0: 0, z1: 6 };
  for (let k = 0; k < count; k += 1) {
    els.push(randomElement(rng, k, opts));
  }
  if (rng() < 0.6) {
    els.push(randomElement(rng, els.length, { ...opts, type: 'startPads' }));
  }
  if (rng() < 0.4) {
    els.push(randomElement(rng, els.length, { ...opts, type: pick(rng, STACK_TYPES) }));
  }
  doc.elements = els;
  const seq = [];
  for (const el of els) {
    if (rng() < 0.15 || el.type === 'startPads' || el.type === 'label') {
      if (rng() > 0.1) {
        continue;
      }
    }
    if (STACK_TYPES.includes(el.type) && rng() < 0.7) {
      seq.push(...stackRun(rng, seq.length, el));
    } else {
      seq.push(randomSeqEntry(rng, seq.length, el));
    }
  }
  for (let k = 0; k < seq.length; k += 1) {
    if (rng() < 0.1) {
      const j = Math.floor(rng() * seq.length);
      [seq[k], seq[j]] = [seq[j], seq[k]];
    }
  }
  if (rng() < 0.15 && seq.length) {
    seq.push({ ...seq[0], id: `sq-${seq.length + 1}` });
  }
  doc.sequence = seq;
  if (rng() < 0.05) {
    doc.sequence = junkValue(rng);
  }
  if (rng() < 0.05) {
    doc.elements = junkValue(rng);
  }
  return doc;
}

/* A course a person would actually build: openings round a loop facing
 * roughly along it, markers on the turns, a stack flown as a figure. Faces
 * are left for applyAutoFaces to derive, as the builder does. */
function plausibleFieldDoc(rng, n) {
  const wing = rng() < 0.25;
  const W = wing ? 400 : 60;
  const D = wing ? 300 : 40;
  const R = wing ? 100 : 14;
  const cx = W / 2;
  const cy = D / 2;
  const els = [];
  const seq = [];
  const count = 3 + Math.floor(rng() * 7);
  for (let k = 0; k < count; k += 1) {
    const a = (k / count) * Math.PI * 2 + (rng() - 0.5) * 0.3;
    const r = R * (0.8 + rng() * 0.4);
    const type = pick(rng, [...APERTURE_TYPES, ...MARKER_TYPES, 'gate', 'gate', 'flag', 'ladder', 'diveGate']);
    const el = {
      id: `el-${k + 1}`,
      type,
      name: '',
      position: { x: Math.round((cx + r * Math.cos(a)) * 2) / 2, y: Math.round((cy + r * Math.sin(a)) * 2) / 2, z: rng() < 0.8 ? 0 : 1 },
      yaw: Math.round((a + Math.PI / 2) * 1e6) / 1e6,
      pitch: type === 'diveGate' ? pick(rng, [Math.PI / 2, 0.959931, -0.5]) : 0,
      yawOverridden: rng() < 0.15,
    };
    if (rng() < 0.3 && APERTURE_TYPES.includes(type)) {
      el.dims = { levels: STACK_TYPES.includes(type) ? 2 + Math.floor(rng() * 2) : 1, sillH: pick(rng, [0, 1.524, 4.572]), clearW: 1.524, clearH: 1.524, levelPitch: 1.557401 };
    }
    els.push(el);
    if (STACK_TYPES.includes(type) && rng() < 0.8) {
      seq.push(...stackRun(rng, seq.length, el));
    } else if (MARKER_TYPES.includes(type)) {
      seq.push({ id: `sq-${seq.length + 1}`, elementId: el.id, apertureIndex: null, entry: null, passSide: pick(rng, ['left', 'right']), clearance: type === 'waypoint' ? 0 : pick(rng, [1.5, 1, 5]), overridden: rng() < 0.2 });
    } else {
      seq.push({ id: `sq-${seq.length + 1}`, elementId: el.id, apertureIndex: 0, entry: pick(rng, [1, -1, 0]), passSide: null, clearance: null, overridden: rng() < 0.2 });
    }
  }
  if (rng() < 0.3 && seq.length > 2) {
    const again = seq[Math.floor(rng() * seq.length)];
    seq.push({ ...again, id: `sq-${seq.length + 1}`, entry: again.entry === null ? null : -again.entry });
  }
  if (rng() < 0.3) {
    /* A foreign opening standing on the line between two others, which the
     * avoidance pass has to steer round. */
    const a = els[0].position;
    const b = els[1 % els.length].position;
    els.push({ id: `el-${els.length + 1}`, type: 'gate', name: '', position: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: 0 }, yaw: rng() * 3, pitch: 0, yawOverridden: true });
  }
  if (rng() < 0.7) {
    els.push({ id: `el-${els.length + 1}`, type: 'startPads', name: 'Grid', position: { x: cx, y: cy - R, z: 0 }, yaw: Math.PI, pitch: 0, yawOverridden: false });
  }
  if (rng() < 0.3) {
    els.push({ id: `el-${els.length + 1}`, type: 'barrier', name: '', position: { x: cx, y: cy, z: 0 }, yaw: 0, pitch: 0, yawOverridden: false });
  }
  return {
    schemaVersion: 3, id: `trk-${(0x20000000 + n * 104729).toString(16).slice(-8)}`, name: `Loop ${n}`,
    createdUtc: '2026-01-02T03:04:05Z', modifiedUtc: '2026-01-02T03:04:05Z', trackClass: wing ? 'wing' : 'full',
    field: { width: W, depth: D, gridSize: 1 }, settings: { tangentScale: 1.1, minCurveRadius: 2.5, samplesPerSegment: 48 },
    branding: { logos: rng() < 0.3 ? [{ id: 'logo-1', image: PNG, name: 'a.png' }] : [] }, elements: els, sequence: seq,
  };
}

function randomMapDoc(rng, n) {
  const els = [];
  const seq = [];
  const count = Math.floor(rng() * 9);
  const opts = { x0: -3000, x1: 3000, y0: -3000, y1: 3000, z0: -100, z1: 900, map: true };
  const types = ['gate', 'flaggedGate', 'doubleStack', 'ladder', 'tower', 'wideGate3', 'wideGate5', 'pylonPair', 'pylon',
    'hoop175', 'hoop250', 'hoop30', 'hoop6', 'hoop12', 'hoop20', 'startPads', 'flag'];
  const cx = randomNumber(rng, -500, 500);
  const cy = randomNumber(rng, -500, 500);
  for (let k = 0; k < count; k += 1) {
    const el = randomElement(rng, k, { ...opts, type: pick(rng, types) });
    if (rng() < 0.7) {
      const a = (k / Math.max(count, 1)) * Math.PI * 2;
      el.position = { x: cx + 40 * Math.cos(a), y: cy + 40 * Math.sin(a), z: randomNumber(rng, 0, 30) };
      el.orientation = { w: Math.cos((a + Math.PI) / 2), x: 0, y: 0, z: Math.sin((a + Math.PI) / 2) };
    }
    els.push(el);
    if (el.type !== 'startPads' && rng() < 0.9) {
      seq.push({ id: `sq-${seq.length + 1}`, elementId: el.id, apertureIndex: 0, entry: 1, passSide: el.type === 'pylon' || el.type === 'flag' ? 'left' : null, clearance: el.type === 'pylon' || el.type === 'flag' ? 5 : null, overridden: false });
    }
  }
  return {
    schemaVersion: pick(rng, [4, 4, 4, 3, 5]), id: `trk-${(0x30000000 + n * 1299709).toString(16).slice(-8)}`, name: `Map ${n}`,
    createdUtc: '2026-01-02T03:04:05Z', modifiedUtc: '2026-01-02T03:04:05Z', trackClass: pick(rng, ['full', 'full', 'wing', undefined]),
    map: pick(rng, MAPS), field: { width: 60, depth: 40, gridSize: 1 }, settings: { tangentScale: 1.1, minCurveRadius: 2.5, samplesPerSegment: 48 },
    branding: { logos: [] }, credit: null, elements: els, sequence: seq,
  };
}

/* Walk to a random place in a JSON value and break it. */
function mutate(rng, doc) {
  const out = clone(doc);
  const holders = [];
  (function walk(v) {
    if (v && typeof v === 'object') {
      holders.push(v);
      for (const k of Object.keys(v)) {
        walk(v[k]);
      }
    }
  }(out));
  const times = 1 + Math.floor(rng() * 3);
  for (let t = 0; t < times; t += 1) {
    const h = pick(rng, holders);
    const keys = Object.keys(h);
    if (!keys.length) {
      continue;
    }
    const k = pick(rng, keys);
    const r = rng();
    if (r < 0.3) {
      if (Array.isArray(h)) {
        h.splice(Number(k), 1);
      } else {
        delete h[k];
      }
    } else if (r < 0.75) {
      h[k] = junkValue(rng);
    } else if (r < 0.9 && typeof h[k] === 'number') {
      h[k] = h[k] * pick(rng, [-1, 10, 0.001, 1 + 1e-7]);
    } else if (Array.isArray(h) && h.length) {
      h.push(clone(h[Math.floor(rng() * h.length)]));
    } else {
      h[`extra${t}`] = junkValue(rng);
    }
  }
  return out;
}

/*
 * Courses built to sit on the edges the face and line rules decide on: a
 * flag parked at every distance from a gate's stile, markers the author has
 * turned by hand, hairpins, waypoints, dive gates between level neighbours,
 * knots on top of each other or a hair apart, foreign gates standing on the
 * line or on a knot, and heights that differ by almost nothing.
 */
function edgeFieldDoc(rng, n) {
  const wing = rng() < 0.2;
  const unit = wing ? 6 : 1;
  const els = [];
  const seq = [];
  const add = (el) => {
    const id = `el-${els.length + 1}`;
    els.push({ id, name: '', yawOverridden: false, pitch: 0, ...el });
    return id;
  };
  const pass = (elementId, marker, extra = {}) => {
    seq.push({
      id: `sq-${seq.length + 1}`, elementId, apertureIndex: marker ? null : 0, entry: marker ? null : pick(rng, [0, 0, 0, 1, -1]),
      passSide: marker ? pick(rng, ['left', 'right']) : null, clearance: marker ? pick(rng, [1.5, 0, 0.04, 0.05, 1, 5]) : null,
      overridden: rng() < 0.15, ...extra,
    });
  };
  let x = 30 * unit;
  let y = 20 * unit;
  let heading = rng() * Math.PI * 2;
  let z = 0;
  const stations = 4 + Math.floor(rng() * 6);
  for (let k = 0; k < stations; k += 1) {
    const turn = pick(rng, [0, 0.3, -0.3, 1.2, -1.2, Math.PI, Math.PI - 0.05, 2.5]);
    heading += turn;
    const step = pick(rng, [6, 8, 3, 0, 1e-7, 12]) * unit;
    x += step * Math.cos(heading);
    y += step * Math.sin(heading);
    z = pick(rng, [z, z, z + 0.04, z + 0.05, z + 0.06, z + 0.2, z + 1, Math.max(0, z - 1), 3]);
    const kind = pick(rng, ['gate', 'stile', 'stile', 'turned', 'waypoint', 'dive', 'stack', 'hoop', 'foreign', 'twin']);
    const pos = { x, y, z };
    const yaw = Math.round((heading + (rng() - 0.5) * 0.6) * 1e6) / 1e6;
    if (kind === 'gate' || kind === 'hoop') {
      pass(add({ type: kind === 'hoop' ? pick(rng, ['hoop175', 'hoop6']) : pick(rng, ['gate', 'flaggedGate', 'wideGate5']), position: pos, yaw, yawOverridden: rng() < 0.3 }), false);
    } else if (kind === 'stile') {
      const gate = add({ type: 'gate', position: pos, yaw, yawOverridden: rng() < 0.5 });
      const half = (wing ? 5 : 1.524) / 2;
      const d = pick(rng, [0, 0.01, 0.5, 1.19, 1.2, 1.21, 2, 2.99, 3, 3.01, 4]) * pick(rng, [1, -1]);
      const off = half * Math.sign(d || 1) + d;
      const flag = add({ type: pick(rng, ['flag', 'pole', 'cone']), position: { x: x - off * Math.sin(yaw), y: y + off * Math.cos(yaw), z: 0 }, yaw: rng() * 6 - 3, yawOverridden: rng() < 0.3 });
      if (rng() < 0.7) {
        pass(gate, false);
      }
      pass(flag, true);
    } else if (kind === 'turned') {
      pass(add({ type: pick(rng, ['flag', 'pole', 'pylon']), position: pos, yaw: pick(rng, [0, Math.PI / 2, -Math.PI / 2, rng() * 6 - 3, heading]), yawOverridden: true }), true);
    } else if (kind === 'waypoint') {
      pass(add({ type: 'waypoint', position: pos, yaw: 0 }), true, { clearance: 0 });
    } else if (kind === 'dive') {
      pass(add({ type: 'diveGate', position: { x, y, z: pick(rng, [0, z]) }, yaw, pitch: pick(rng, [Math.PI / 2, 1.570796, 1.5707, 1.2, -Math.PI / 2, 0.959931]), yawOverridden: rng() < 0.3 }), false);
    } else if (kind === 'stack') {
      const el = { id: '', type: pick(rng, ['doubleStack', 'ladder', 'tower', 'flaggedDoubleStack']), position: pos, yaw, yawOverridden: rng() < 0.3 };
      el.id = add(el);
      for (const s of stackRun(rng, seq.length, el)) {
        seq.push({ ...s, id: `sq-${seq.length + 1}` });
      }
    } else if (kind === 'foreign') {
      const prev = els[els.length - 1]?.position ?? pos;
      add({ type: 'gate', position: { x: (prev.x + x) / 2, y: (prev.y + y) / 2, z: 0 }, yaw: pick(rng, [heading, heading + Math.PI / 2, rng() * 6]), yawOverridden: true });
      pass(add({ type: 'gate', position: pos, yaw }), false);
    } else {
      /* Two openings on one spot, or a hair apart. */
      pass(add({ type: 'gate', position: pos, yaw }), false);
      pass(add({ type: 'gate', position: { x: x + pick(rng, [0, 1e-7, 1e-3]), y, z }, yaw: yaw + pick(rng, [0, Math.PI]) }), false);
    }
  }
  if (rng() < 0.3 && seq.length > 1) {
    /* Fly the first structure again, the other way. */
    seq.push({ ...seq[0], id: `sq-${seq.length + 1}`, entry: seq[0].entry === null ? null : -seq[0].entry });
  }
  if (rng() < 0.6) {
    const first = els[0]?.position ?? { x: 0, y: 0, z: 0 };
    add({ type: 'startPads', name: 'Grid', position: { x: first.x - 4 * unit * Math.cos(heading), y: first.y, z: 0 }, yaw: pick(rng, [0, Math.PI, heading]) });
  }
  return {
    schemaVersion: 3, id: `trk-${(0x40000000 + n * 15485863).toString(16).slice(-8)}`, name: `Edge ${n}`,
    createdUtc: '2026-01-02T03:04:05Z', modifiedUtc: '2026-01-02T03:04:05Z', trackClass: wing ? 'wing' : 'full',
    field: { width: 60 * unit, depth: 40 * unit, gridSize: 1 },
    settings: { tangentScale: pick(rng, [1.1, 1.1, 0.5, 2]), minCurveRadius: 2.5, samplesPerSegment: pick(rng, [48, 48, 4, 24, 7]) },
    branding: { logos: [] }, elements: els, sequence: seq,
  };
}

/* The schema example with one field pushed to just under, on or just over a
 * limit, or given the wrong type. Lengths and caps are where a reader
 * clamps, truncates or drops. */
function boundaryDocs(base) {
  const docs = [];
  const at = (label, edit) => {
    const d = clone(base);
    edit(d);
    docs.push({ name: `bound-${label}`, raw: d });
  };
  for (const n of [0, 1, 23, 24, 25, 63, 64, 65, 119, 120, 121, 255, 256, 257, 1023, 1024, 1025, 4000]) {
    at(`name${n}`, (d) => { d.name = 'n'.repeat(n); });
    at(`elname${n}`, (d) => { d.elements[1].name = 'e'.repeat(n); });
    at(`text${n}`, (d) => { d.elements[11].text = 't'.repeat(n); });
    at(`credit${n}`, (d) => { d.credit = { designer: 'd'.repeat(n), series: 's', sponsor: 'p', source: 'u'.repeat(n), broughtOverBy: 'b', note: 'o'.repeat(n) }; });
    at(`id${n}`, (d) => { d.id = `trk-${'a'.repeat(n)}`; });
    at(`elid${n}`, (d) => { d.elements[2].id = `el-${'9'.repeat(Math.min(n, 300))}`; d.sequence[1].elementId = d.elements[2].id; });
    at(`logoname${n}`, (d) => { d.branding = { logos: [{ id: 'logo-1', image: PNG, name: 'l'.repeat(n) }] }; });
    at(`map${n}`, (d) => { d.schemaVersion = 4; d.map = 'a'.repeat(n); });
  }
  for (const v of [-1, 0, 1, 3, 4, 5, 6, 47, 48, 49, 511, 512, 513, 1000, 2.5, 4.5, '48', null]) {
    at(`samples${v}`, (d) => { d.settings.samplesPerSegment = v; });
  }
  for (const v of [-1, 0, 0.01, 0.09, 0.1, 0.11, 0.5, 1, 1.1, 2, 5, 10, 100, '1.1', null]) {
    at(`tangent${v}`, (d) => { d.settings.tangentScale = v; });
    at(`radius${v}`, (d) => { d.settings.minCurveRadius = v; });
    at(`grid${v}`, (d) => { d.field.gridSize = v; });
  }
  for (const v of [-5, 0, 4.9, 5, 5.1, 59, 60, 1000, 1e5, 1e6, '60', null]) {
    at(`width${v}`, (d) => { d.field.width = v; });
    at(`depth${v}`, (d) => { d.field.depth = v; });
  }
  for (const v of [-1, 0, 0.4, 0.5, 1, 1.5, 2, 3, 4, 5, 8, 9, 10, 16, 17, 64, '2', null, true]) {
    at(`levels${v}`, (d) => { d.elements[4].dims.levels = v; });
    at(`apidx${v}`, (d) => { d.sequence[3].apertureIndex = v; });
    at(`pads${v}`, (d) => { d.elements[0].dims.pads = v; });
  }
  for (const v of [-10, -3.141593, -1.570797, -1.570796, -Math.PI / 2, 0, 1e-7, 1.570796, Math.PI / 2, 1.570797, 3.141593, 3.141594, 10, 'x']) {
    at(`pitch${v}`, (d) => { d.elements[8].pitch = v; });
    at(`yaw${v}`, (d) => { d.elements[2].yaw = v; });
  }
  /* Not much past a kilometre: a line that long is sampled and marked per metre. */
  for (const v of [-1, 0, 1e-7, 0.04, 0.05, 0.06, 1.5, 20, 50, 51, 100, 1000, '2', null]) {
    at(`clear${v}`, (d) => { d.sequence[0].clearance = v; });
    at(`dim${v}`, (d) => { d.elements[2].dims.clearW = v; d.elements[6].dims.height = v; });
    at(`pos${v}`, (d) => { d.elements[3].position = { x: v, y: v, z: v }; });
  }
  for (const v of [0, 1, 2, 4, 5, 6, 7, 10]) {
    at(`logos${v}`, (d) => { d.branding = { logos: Array.from({ length: v }, (_, i) => ({ id: `logo-${i + 1}`, image: PNG, name: `${i}.png` })) }; });
    at(`seqlen${v}`, (d) => { d.sequence = Array.from({ length: v * 40 }, (_, i) => ({ ...d.sequence[i % d.sequence.length], id: `sq-${i + 1}` })); });
    at(`ellen${v}`, (d) => { for (let i = 0; i < v * 40; i += 1) d.elements.push({ ...clone(d.elements[2]), id: `el-${100 + i}` }); });
  }
  for (const size of [0.9, 1, 1.1]) {
    at(`logobytes${size}`, (d) => {
      const chars = Math.round(model.LOGO_MAX_CHARS * size);
      d.branding = { logos: [{ id: 'logo-1', image: `data:image/png;base64,${'A'.repeat(chars - 22)}`, name: 'big.png' }] };
    });
    at(`brandbytes${size}`, (d) => {
      const each = Math.round((model.BRANDING_MAX_CHARS * size) / 3);
      d.branding = { logos: [1, 2, 3].map((i) => ({ id: `logo-${i}`, image: `data:image/png;base64,${'A'.repeat(each - 22)}`, name: `${i}.png` })) };
    });
  }
  for (const side of ['left', 'right', 'both', 'top', 'centre', '', null, 3]) {
    at(`flagside${side}`, (d) => { d.elements[2].type = 'flaggedGate'; d.elements[2].flagSide = side; d.elements[2].dims.flagH = pick(mulberry(String(side).length), [0, 1.45, 3, -1, 'x']); });
  }
  for (const v of [1, 2, 3, 4, 5, 0, -1, 99, '3', null, undefined, 3.5]) {
    at(`version${String(v)}`, (d) => { d.schemaVersion = v; });
    at(`version${String(v)}map`, (d) => { d.schemaVersion = v; d.map = 'alps'; });
  }
  return docs;
}

/*
 * Markers at the edges of "parked on a gate's frame" (faces.js), which the
 * random streams above miss: standing on the gate's foot, at the reach and
 * depth limits, at the inner limit of the stile, beside a gate whose width
 * normalize repaired to nothing, and the game golden's garbage-numbers
 * track, where a cone repaired onto the foot of a zero width gate first
 * showed the gap.
 */
function parkedDocs() {
  const docs = [];
  docs.push({
    name: 'parked-garbage-numbers',
    raw: {
      id: 'g8',
      field: { width: 'wide', depth: -4, gridSize: NaN },
      settings: { tangentScale: -1, minCurveRadius: Infinity, samplesPerSegment: 1e6 },
      elements: [
        { id: 'a', type: 'gate', position: { x: NaN, y: Infinity, z: -Infinity }, yaw: NaN, pitch: 9, dims: { clearW: -1, levels: 100 } },
        { id: 'b', type: 'ladder', position: { x: '12', y: '7.5', z: '1' }, yaw: '3', pitch: -9, dims: { levels: 0, sillH: 'x' } },
        { id: 'c', type: 'cone', position: null, dims: { height: NaN, clearance: -3 } },
      ],
      sequence: [{ elementId: 'a', entry: Infinity }, { elementId: 'b', apertureIndex: NaN, entry: '-1' }, { elementId: 'c', clearance: NaN }],
    },
  });
  const offsets = [
    [0, 0], [0.1, 0], [0.149, 0], [0.15, 0], [0, 0.15], [0.343, 0], [0.3429, 0], [0.3431, 0], [0.5, 1.2], [0.5, 1.2000001],
    [2.9, 0.7], [3, 0], [3.0000001, 0], [0, 3], [-0.6, -0.4], [1, 1], [-2, 1.1],
  ];
  const widths = [1.524, 0, -1, 'x', 0.2, 6];
  offsets.forEach(([across, depth], n) => {
    const clearW = widths[n % widths.length];
    const yaw = [0, 0.7, Math.PI / 2, -2.5][n % 4];
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const gx = 20;
    const gy = 15;
    for (const type of ['flag', 'cone']) {
      docs.push({
        name: `parked-${type}-${n}`,
        raw: {
          schemaVersion: 3,
          id: `trk-${(0x20000000 + n * 31 + (type === 'cone' ? 1 : 0)).toString(16).slice(-8)}`,
          elements: [
            { id: 'g', type: 'gate', position: { x: gx, y: gy, z: 0 }, yaw, dims: { clearW } },
            { id: 'm', type, position: { x: gx - s * across + c * depth, y: gy + c * across + s * depth, z: 0 } },
            { id: 'h', type: 'gate', position: { x: gx + 10, y: gy + 4, z: 0 }, yaw: 1 },
          ],
          sequence: [{ elementId: 'h', entry: -1 }, { elementId: 'm' }, { elementId: 'g', entry: n % 2 ? 1 : -1 }],
        },
      });
    }
  });
  return docs;
}

function buildCorpus() {
  const corpus = [];
  const real = realDocs();
  corpus.push(...real);
  const rng = mulberry(20261006);
  for (let n = 0; n < 70; n += 1) {
    corpus.push({ name: `field-${n}`, raw: randomFieldDoc(rng, n) });
  }
  for (let n = 0; n < 60; n += 1) {
    corpus.push({ name: `loop-${n}`, raw: plausibleFieldDoc(rng, n) });
  }
  for (let n = 0; n < 40; n += 1) {
    corpus.push({ name: `map-${n}`, raw: randomMapDoc(rng, n) });
  }
  for (const r of real) {
    for (let n = 0; n < 25; n += 1) {
      corpus.push({ name: `${r.name}-mut${n}`, raw: mutate(rng, r.raw) });
    }
  }
  const odd = [null, undefined, 42, 'track', [], {}, { schemaVersion: 99 }, { elements: 'x', sequence: {} },
    { schemaVersion: 4, map: 'alps' }, { schemaVersion: 2, branding: { logo: PNG, logoName: 'x.png' } },
    { schemaVersion: 3, trackClass: 'micro', elements: [], sequence: [] }];
  odd.forEach((raw, n) => corpus.push({ name: `odd-${n}`, raw }));
  /* A stream of its own, so adding these left every document above as it
   * was. */
  const edge = mulberry(4242);
  for (let n = 0; n < 120; n += 1) {
    corpus.push({ name: `edge-${n}`, raw: edgeFieldDoc(edge, n) });
  }
  corpus.push(...boundaryDocs(real[0].raw));
  corpus.push(...parkedDocs());
  return corpus;
}

/* ------------------------------------------------------------------ */
/* What is recorded for one document.                                  */
/* ------------------------------------------------------------------ */

/* createElement and createSequenceEntry hand back a new record and leave
 * adding it to the document to the caller, as the builder does. */
function place(doc, type, position, yaw) {
  const el = yaw === undefined ? model.createElement(doc, type, position) : model.createElement(doc, type, position, yaw);
  doc.elements.push(el);
  return el;
}

function enter(doc, elementId, apertureIndex) {
  const s = model.createSequenceEntry(doc, elementId, apertureIndex);
  doc.sequence.push(s);
  return s;
}

function consecutiveRuns(seqs) {
  const runs = [];
  for (const s of seqs) {
    const last = runs[runs.length - 1];
    if (last && last[0].elementId === s.elementId) {
      last.push(s);
    } else {
      runs.push([s]);
    }
  }
  return runs;
}

function perDocument(raw) {
  const out = {};
  out.model = {};
  out.model.rawProbes = attempt(() => ({
    isMapTrack: model.isMapTrack(clone(raw)),
    trackClassOf: elements.trackClassOf(clone(raw)),
    noAircraftFlies: elements.noAircraftFlies(clone(raw)),
  }));
  const norm = attempt(() => model.normalize(clone(raw)));
  out.model.normalize = norm;
  if (!norm || norm.THREW || !norm.doc) {
    return out;
  }
  const doc = norm.doc;
  /* A document with no usable id is given a fresh random one, and every
   * output below would carry it. Its shape is checked; the digits are not. */
  if (doc.id !== raw?.id) {
    doc.id = TRACK_ID.test(doc.id) ? 'trk-00000000' : `BAD-ID:${doc.id}`;
  }
  const plain = attempt(() => model.toPlain(doc));
  const text = attempt(() => model.serialize(doc));
  out.model.toPlain = plain;
  out.model.serialize = text;
  out.model.roundTrip = attempt(() => {
    const back = model.deserialize(text);
    return { same: model.serialize(back.doc) === text, repairs: back.repairs, error: back.error ?? null };
  });
  out.model.normalizeIdempotent = attempt(() => {
    const again = model.normalize(clone(plain));
    return { same: model.serialize(again.doc) === text, repairs: again.repairs };
  });
  out.model.accessors = attempt(() => ({
    isMapTrack: model.isMapTrack(doc),
    logosOf: model.logosOf(doc),
    dressOrder: model.dressOrder(doc),
    startPadsOf: model.startPadsOf(doc),
    newElementId: model.newElementId(doc),
    newSequenceId: model.newSequenceId(doc),
    perElement: doc.elements.map((el) => ({
      byId: model.elementById(doc, el.id) === el,
      defId: model.defOf(el)?.id ?? null,
      kind: model.kindOf(el),
      sequenceable: model.isSequenceable(el),
      apertures: model.aperturesOf(el),
      centres: model.aperturesOf(el).map((_, i) => model.apertureCenter(el, i)),
      centreOut: attempt(() => model.apertureCenter(el, 99)),
      normal: model.elementNormal(el),
      top: model.topOf(el),
      refs: model.sequenceRefCount(doc, el.id),
      decal: model.logoForDecal(doc, el),
    })),
    perSeq: doc.sequence.map((s) => attempt(() => model.entryAnchor(doc, s))),
  }));
  out.model.mutators = attempt(() => {
    reseedMathRandom(1);
    const d = model.deserialize(text).doc;
    const created = TYPES.map((t, i) => {
      const el = place(d, t, { x: 1 + i, y: 2 + i, z: 0 }, i * 0.3);
      const s = model.isSequenceable(el) ? enter(d, el.id, i % 3) : null;
      return { el, s };
    });
    const dup = model.duplicateTrack(doc, 'Copy');
    const dupPlain = maskNewId(model.toPlain(dup), doc.id);
    const touched = model.deserialize(text).doc;
    model.touch(touched);
    return { created, after: model.toPlain(d), dup: dupPlain, touched: touched.modifiedUtc, clone: model.deepClone(plain) };
  });

  out.elements = attempt(() => {
    const cls = elements.trackClassOf(doc);
    return {
      cls,
      tuning: elements.tuningFor(cls),
      perElement: doc.elements.map((el) => ({
        unbuilt: elements.isUnbuilt(el),
        flagSide: elements.flagSideOf(el),
        height: elements.elementHeight(model.defOf(el), el.dims),
        levels: attempt(() => elements.apertureLevels(el.dims)),
        flagH: attempt(() => elements.gateFlagHeight(el.dims)),
      })),
      perSeq: doc.sequence.map((s) => {
        const el = model.elementById(doc, s.elementId);
        return attempt(() => [elements.virtualApertureDims(el, s), elements.virtualApertureDims(el, s, 'wing'), elements.virtualApertureDims(el, s, cls)]);
      }),
    };
  });

  out.faces = attempt(() => {
    const d = model.deserialize(text).doc;
    const chain = faces.anchorChain(d);
    const perElement = d.elements.map((el) => ({
      near: attempt(() => faces.nearbyApertureTravel(d, el)),
      axis: attempt(() => faces.faceAxis(el)),
      pass: d.sequence.filter((s) => s.elementId === el.id).map((s) => [
        attempt(() => faces.markerPassDir(el, s, { x: 1, y: 0, z: 0 })),
        attempt(() => faces.markerPassDir(el, s, { x: 0.6, y: -0.8, z: 0 })),
        attempt(() => faces.markerPassDir(el, s, { x: 0, y: 0, z: 1 })),
      ]),
    }));
    const auto = model.deserialize(text).doc;
    const ret = faces.applyAutoFaces(auto);
    const pitched = model.deserialize(text).doc;
    const pitchResults = pitched.elements.map((el, i) => attempt(() => faces.setPitch(pitched, el.id, [0.5, -2, Math.PI / 2, 'x'][i % 4])));
    return {
      chain, perElement, autoSame: ret === auto, auto: model.toPlain(auto), pitchResults, pitched: model.toPlain(pitched),
      missingPitch: attempt(() => faces.setPitch(pitched, 'el-nope', 1)),
    };
  });

  out.figures = attempt(() => {
    const d = model.deserialize(text).doc;
    const runs = consecutiveRuns(d.sequence);
    const perElement = d.elements.filter((el) => model.kindOf(el) === elements.KIND.APERTURE).map((el) => ({
      names: [0, 1, 2, 3].map((i) => attempt(() => figures.levelName(el, i))),
      plans: Object.keys(figures.FIGURES).map((f) => [attempt(() => figures.figurePlan(el, f, 1)), attempt(() => figures.figurePlan(el, f, -1))]),
      bogusPlan: attempt(() => figures.figurePlan(el, 'bogus')),
    }));
    const perRun = runs.map((run) => {
      const el = model.elementById(d, run[0].elementId);
      if (!el) {
        return null;
      }
      return {
        match: attempt(() => figures.matchingFigureOf(el, run)),
        cues: run.map((s) => attempt(() => figures.figureCueOf(el, s, run))),
        cuesBare: run.map((s) => attempt(() => figures.figureCueOf(el, { apertureIndex: s.apertureIndex }, run))),
        wraps: run.slice(1).map((s, k) => [attempt(() => figures.wrapBetween(el, run[k], s)), attempt(() => figures.wrapBetween(el, run[k], s, 'wing'))]),
      };
    });
    const up = model.deserialize(text).doc;
    const upRet = attempt(() => figures.upgradeStackedFigures(up));
    return { perElement, perRun, upgraded: model.toPlain(up), upRet: upRet === up ? 'same' : upRet };
  });

  out.path = attempt(() => {
    const d = model.deserialize(text).doc;
    const auto = model.deserialize(text).doc;
    faces.applyAutoFaces(auto);
    return {
      knots: attempt(() => path.buildKnots(d)),
      knotsClosed: attempt(() => path.buildKnots(d, { closeLoop: true })),
      path: attempt(() => path.buildPath(d)),
      pathClosed: attempt(() => path.buildPath(d, { closeLoop: true })),
      autoPath: attempt(() => path.buildPath(auto)),
    };
  });

  const course = attempt(() => courseFromDocument(clone(raw)));
  if (typeof raw?.id !== 'string' && typeof course?.documentId === 'string') {
    course.documentId = TRACK_ID.test(course.documentId) ? 'trk-00000000' : `BAD-ID:${course.documentId}`;
  }
  out.consumers = {
    course,
    planes: attempt(() => planesFor(clone(raw))),
  };
  return out;
}

/* ------------------------------------------------------------------ */
/* Cases that are not one document.                                    */
/* ------------------------------------------------------------------ */

function geometryCases() {
  const rng = mulberry(7);
  const special = [0, -0, 1, -1, 1e-300, 1e300, 0.1, 1 / 3, Math.PI, -Math.PI, 3.141593, -3.141593, 1e-7];
  const vecs = [
    { x: 0, y: 0, z: 0 }, { x: -0, y: 0, z: -0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 3, y: 4, z: 12 },
    { x: 1e-200, y: 1e-200, z: 0 }, { x: 1e200, y: 1e200, z: 1e200 },
  ];
  for (let i = 0; i < 400; i += 1) {
    vecs.push({ x: (rng() - 0.5) * 10 ** Math.floor(rng() * 8 - 3), y: (rng() - 0.5) * 100, z: rng() < 0.2 ? 0 : (rng() - 0.5) * 3 });
  }
  /* Lengths either side of the point where normalize gives up and hands
   * back its fallback, a nanometre. */
  vecs.push({ x: 0, y: 1e-9, z: 0 }, { x: 0, y: 1.0000000000000002e-9, z: 0 }, { x: 6e-10, y: 8e-10, z: 0 }, { x: 0, y: 9.999999999999999e-10, z: 0 });
  for (let i = 0; i < 60; i += 1) {
    const a = rng() * Math.PI * 2;
    const b = (rng() - 0.5) * Math.PI;
    const l = 1e-9 * (1 + (rng() - 0.5) * 4e-15);
    vecs.push({ x: l * Math.cos(a) * Math.cos(b), y: l * Math.sin(a) * Math.cos(b), z: l * Math.sin(b) });
  }
  const g = geometry;
  const pairs = vecs.map((a, i) => [a, vecs[(i * 7 + 3) % vecs.length]]);
  /* Finite and modest only: the wrap is a loop, and it never returns from an
   * infinity or from a number so large that adding a turn does not change it. */
  const angles = [...special.filter((x) => Math.abs(x) < 1e6), NaN, 2 * Math.PI, -2 * Math.PI, 7, -7, 100, Math.PI + 1e-6, Math.PI + 2e-6,
    -Math.PI - 1e-6, -Math.PI + 1e-6, Math.PI - 1e-6, 3.1415935, -3.1415935];
  for (let i = 0; i < 300; i += 1) {
    angles.push((rng() - 0.5) * 30);
  }
  const pitches = [0, Math.PI / 2, -Math.PI / 2, 1.570796, -1.570796, 0.959931, 1, -1, 2, -2];
  return {
    'geometry/v': [g.v(), g.v(1), g.v(1, 2), g.v(1, 2, 3), g.v(-0, NaN, undefined)],
    'geometry/binary': pairs.map(([a, b]) => [g.add(a, b), g.sub(a, b), g.dot(a, b), g.cross(a, b), g.dist(a, b)]),
    'geometry/unary': vecs.map((a) => [g.length(a), g.normalize(a), g.normalize(a, { x: 0, y: 1, z: 0 }), g.leftOf(a), g.scale(a, 2.5), g.scale(a, -1 / 3)]),
    'geometry/lerp': pairs.map(([a, b], i) => [g.lerp(a, b, 0), g.lerp(a, b, 1), g.lerp(a, b, 0.5), g.lerp(a, b, i / 37), g.lerp(a, b, -0.25)]),
    'geometry/clamp': special.flatMap((x) => [g.clamp(x, -1, 1), g.clamp(x, 0, 0.5), g.clamp(x, 2, 1)]).concat([g.clamp(NaN, 0, 1)]),
    'geometry/wrapAngle': angles.map((a) => g.wrapAngle(a)),
    'geometry/yawVector': angles.map((a) => g.yawVector(a)),
    'geometry/apertureFrame': angles.slice(0, 60).flatMap((y) => pitches.map((p) => g.apertureFrame(y, p))),
    'geometry/exports': Object.keys(g).sort(),
  };
}

function elementsCases() {
  const e = elements;
  const sides = ['left', 'right', 'both', 'top', 'centre', 'LEFT', '', null, undefined, 3, {}];
  const classes = ['full', 'wing', 'micro', 'bogus', undefined, null];
  const types = [...TYPES, 'bogus', undefined];
  const docs = [undefined, null, {}, { trackClass: 'wing' }, { trackClass: 'micro' }, { trackClass: 'full' },
    { trackClass: 'bogus' }, { trackClass: 3 }, { schemaVersion: 4, map: 'alps', trackClass: 'wing' }];
  const dimsList = [undefined, {}, { levels: 3, sillH: 0, clearW: 1.524, clearH: 1.524, levelPitch: 1.557401 },
    { levels: 2, sillH: 1, clearH: 2, levelPitch: 0 }, { levels: 0 }, { levels: -1 }, { levels: 2.5, clearH: 1 },
    { flagH: 2 }, { flagH: 0 }, { flagH: -1 }, { flagH: 'x' }, { width: 3, depth: 2, height: 1 },
    { height: 2.5, poleRadius: 0.025, clearance: 1.5 }, { textHeight: 0.9 }, { pads: 4, spacing: 1.5, padSize: 0.6 }];
  const sampleEls = [];
  for (const type of TYPES) {
    for (const side of [undefined, 'right', 'top', 'both', 'junk']) {
      sampleEls.push({ id: 'el-1', type, flagSide: side, dims: e.defaultDims(type, 'full'), position: { x: 0, y: 0, z: 0 }, yaw: 0.3, pitch: 0 });
    }
    sampleEls.push({ id: 'el-2', type, unbuilt: true, dims: e.defaultDims(type, 'wing'), position: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
    sampleEls.push({ id: 'el-3', type, unbuilt: 'yes', position: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
  }
  const seqs = [null, undefined, {}, { clearance: 1.5, passSide: 'left' }, { clearance: 0 }, { clearance: 5, passSide: 'right' },
    { clearance: 0.04 }, { clearance: 20 }, { clearance: -1 }, { clearance: null }, { clearance: 'x' }];
  return {
    'elements/constants': {
      TRACK_CLASSES: e.TRACK_CLASSES, TRACK_CLASS_DEFAULT: e.TRACK_CLASS_DEFAULT, KIND: e.KIND, GATE_FLAG_H: e.GATE_FLAG_H,
      GATE_FLAG_POLE_R: e.GATE_FLAG_POLE_R, WING_GATE: e.WING_GATE, MARKER_GATE_PAD: e.MARKER_GATE_PAD,
      MARKER_GATE_MIN_W: e.MARKER_GATE_MIN_W, WING_MARKER_GATE_PAD: e.WING_MARKER_GATE_PAD,
      WING_MARKER_GATE_MIN_W: e.WING_MARKER_GATE_MIN_W, FRAME_TUBE_OD: e.FRAME_TUBE_OD,
    },
    'elements/ELEMENTS': e.ELEMENTS,
    'elements/TUNING': e.TUNING,
    'elements/exports': Object.keys(e).sort(),
    'elements/classOf': docs.map((d) => [attempt(() => e.trackClassOf(d)), attempt(() => e.noAircraftFlies(d))]),
    'elements/defaults': types.flatMap((t) => classes.map((c) => [attempt(() => e.defaultDims(t, c)), attempt(() => e.defaultZ(t, c)), attempt(() => e.defaultPitch(t, c))])),
    'elements/defaultsFresh': (() => {
      const a = e.defaultDims('gate', 'full');
      if (a && typeof a === 'object') {
        a.clearW = -999;
      }
      return e.defaultDims('gate', 'full');
    })(),
    'elements/flagSides': sides.map((s) => [attempt(() => e.normalizeFlagSide(s)), attempt(() => e.normalizeFlagSide(s, 'right')),
      attempt(() => e.normalizeFlagSide(s, 'bogus')), attempt(() => e.flagSideSigns(s))]),
    'elements/lean': [-1, -0.5, 0, -0, 0.5, 1, NaN, 2].map((s) => attempt(() => e.flagLeanSign(s))),
    'elements/perElement': sampleEls.map((el) => ({
      side: attempt(() => e.flagSideOf(el)),
      unbuilt: attempt(() => e.isUnbuilt(el)),
      height: attempt(() => e.elementHeight(e.ELEMENTS[el.type], el.dims)),
      virtual: seqs.map((s) => [attempt(() => e.virtualApertureDims(el, s)), attempt(() => e.virtualApertureDims(el, s, 'wing')), attempt(() => e.virtualApertureDims(el, s, 'micro'))]),
    })),
    'elements/levelPitchFor': [0, 1, 1.524, 1.8288, 5, -1, 0.3, 1e-9, 100].map((h) => attempt(() => e.levelPitchFor(h))),
    'elements/tuningFor': classes.map((c) => attempt(() => e.tuningFor(c))),
    'elements/dims': dimsList.map((d) => [attempt(() => e.gateFlagHeight(d)), attempt(() => e.apertureLevels(d)),
      ...types.map((t) => attempt(() => e.elementHeight(e.ELEMENTS[t], d)))]),
  };
}

function figuresCases() {
  return {
    'figures/FIGURES': figures.FIGURES,
    'figures/exports': Object.keys(figures).sort(),
    'faces/exports': Object.keys(faces).sort(),
    'faces/passOffsetSign': ['left', 'right', null, undefined, 'up', 3].map((s) => attempt(() => faces.passOffsetSign(s))),
    'path/exports': Object.keys(path).sort(),
  };
}

function modelCases() {
  const m = model;
  const out = {};
  out['model/constants'] = {
    SCHEMA_VERSION: m.SCHEMA_VERSION, MAP_SCHEMA_VERSION: m.MAP_SCHEMA_VERSION, LOGO_MAX_CHARS: m.LOGO_MAX_CHARS,
    LOGO_SLOTS: m.LOGO_SLOTS, BRANDING_MAX_CHARS: m.BRANDING_MAX_CHARS,
  };
  out['model/exports'] = Object.keys(m).sort();
  out['model/isUsableLogo'] = [PNG, 'data:image/jpeg;base64,AA', 'data:text/html,hi', 'http://x/a.png', '', null, 5,
    `data:image/png;base64,${'A'.repeat(m.LOGO_MAX_CHARS)}`, `data:image/png;base64,${'A'.repeat(m.LOGO_MAX_CHARS - 22)}`,
    'DATA:image/png;base64,AA', 'data:image/svg+xml;base64,AA', ' data:image/png;base64,AA'].map((v) => attempt(() => m.isUsableLogo(v)));
  out['model/isMapTrack'] = [null, undefined, {}, { map: 'alps' }, { schemaVersion: 4, map: 'alps' }, { schemaVersion: 4, map: 'swiss2' },
    { schemaVersion: 4, map: 'itaipu' }, { schemaVersion: 4, map: 'interior' }, { schemaVersion: 4, map: 'track' },
    { schemaVersion: 4, map: 'Alps' }, { schemaVersion: 4, map: 'a-b_c9' }, { schemaVersion: 4, map: '' }, { schemaVersion: 4, map: 3 },
    { schemaVersion: 5, map: 'alps' }, { schemaVersion: 3, map: 'alps' }, { schemaVersion: '4', map: 'alps' },
    { schemaVersion: 4, map: 'x'.repeat(40) }, { schemaVersion: 4, map: 'x'.repeat(65) }, { schemaVersion: 4, map: 'has space' }]
    .map((d) => attempt(() => m.isMapTrack(d)));
  out['model/newTrackId'] = (() => {
    reseedMathRandom(3);
    const ids = Array.from({ length: 50 }, () => m.newTrackId());
    return { shape: ids.every((id) => TRACK_ID.test(id)), distinct: new Set(ids).size };
  })();
  out['model/create'] = [undefined, 'full', 'wing', 'micro', 'bogus'].map((c) => {
    reseedMathRandom(4);
    const doc = m.createTrack('New', c);
    return maskNewId(m.toPlain(doc));
  });
  out['model/createRaw'] = (() => {
    reseedMathRandom(5);
    return maskNewId(m.createTrack('Raw'));
  })();
  out['model/createMap'] = ['swiss2', 'alps', 'bogus', undefined].map((map) => {
    reseedMathRandom(6);
    return [maskNewId(attempt(() => m.toPlain(m.createMapTrack('Map', map)))), maskNewId(attempt(() => m.createMapTrack('Map', map)))];
  });
  out['model/createElementAll'] = ['full', 'wing'].map((c) => {
    reseedMathRandom(7);
    const doc = m.createTrack('Els', c);
    const els = TYPES.map((t, i) => attempt(() => place(doc, t, { x: i, y: -i, z: 0.5 }, i - 10)));
    const bogus = attempt(() => m.createElement(doc, 'bogus', { x: 0, y: 0, z: 0 }));
    const noYaw = attempt(() => place(doc, 'gate', { x: 0, y: 0, z: 0 }));
    const seqs = doc.elements.map((el, i) => attempt(() => enter(doc, el.id, i % 4)));
    const badSeq = attempt(() => m.createSequenceEntry(doc, 'el-nope'));
    return { els, bogus, noYaw, seqs, badSeq, doc: maskNewId(m.toPlain(doc)) };
  });
  out['model/mapElements'] = (() => {
    reseedMathRandom(8);
    const doc = m.createMapTrack('Els', 'alps');
    const els = TYPES.map((t, i) => attempt(() => place(doc, t, { x: i * 100, y: -i, z: 900 }, i)));
    return { els, doc: maskNewId(m.toPlain(doc)) };
  })();
  out['model/deserialize'] = ['', 'not json', '{', '[]', 'null', '42', '"x"', '{"schemaVersion":3}', JSON.stringify({ schemaVersion: 4, map: 'alps', elements: [], sequence: [] })]
    .map((t) => {
      reseedMathRandom(9);
      const r = attempt(() => m.deserialize(t));
      if (r && r.doc) {
        r.doc = maskNewId(m.toPlain(r.doc));
      }
      return r;
    });
  out['model/deepClone'] = [null, 1, 'x', [1, [2]], { a: { b: [1, { c: 2 }] } }, { u: undefined, n: null }].map((v) => attempt(() => m.deepClone(v)));
  out['model/logosOf'] = [null, {}, { branding: null }, { branding: { logos: 'x' } }, { branding: { logos: [1] } }].map((d) => attempt(() => m.logosOf(d)));
  /* A type named like an Object prototype member. The code before the
   * rewrite threw on these; reading must not throw (schema.md), so they are
   * now dropped as unknown types and the rest of the track survives. These
   * rows were written from the rewrite, deliberately. */
  out['model/prototypeTypes'] = ['toString', 'constructor', '__proto__', 'hasOwnProperty'].map((type) => attempt(() => {
    const { doc, repairs } = m.normalize({
      schemaVersion: 3, id: 'trk-0000beef', name: 'Proto', createdUtc: '2026-01-01T00:00:00Z', modifiedUtc: '2026-01-01T00:00:00Z',
      elements: [{ id: 'el-1', type }, { id: 'el-2', type: 'gate', position: { x: 5, y: 5, z: 0 } }],
      sequence: [{ id: 'sq-1', elementId: 'el-1' }, { id: 'sq-2', elementId: 'el-2', apertureIndex: 0, entry: 1 }],
    });
    return { repairs, serialized: m.serialize(doc) };
  }));
  return out;
}

function storageCases() {
  const s = storage;
  store.clear();
  savedEvents.length = 0;
  reseedMathRandom(10);
  const log = [];
  const rec = (label, v) => log.push([label, v]);
  const mapIds = (list) => (Array.isArray(list) ? list.map((d) => [d.id, d.name, d.map, d.modifiedUtc]) : list);
  rec('event name', typeof s.TRACK_SAVED_EVENT);
  rec('empty list', s.listMapTracks());
  rec('empty load', s.loadMapTrack('trk-00000000'));
  rec('empty online', s.readOnlineStates());
  rec('empty autosave', s.readMapAutosave('alps'));
  const a = model.normalize(JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/map-track-v4.json'), 'utf8'))).doc;
  const b = model.normalize(JSON.parse(readFileSync(join(ROOT, 'scripts/gatecards-track.json'), 'utf8'))).doc;
  const field = model.normalize(JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/trackbuilder/schema-example-v2.json'), 'utf8'))).doc;
  rec('save a', s.saveTrack(a));
  rec('save b', s.saveTrack(b));
  rec('save field', s.saveTrack(field));
  rec('events', savedEvents.map((t) => t === s.TRACK_SAVED_EVENT));
  rec('list', mapIds(s.listMapTracks()));
  rec('list swiss2', mapIds(s.listMapTracks('swiss2')));
  rec('list alps', mapIds(s.listMapTracks('alps')));
  rec('list bogus', mapIds(s.listMapTracks('bogus')));
  rec('load a', model.toPlain(s.loadMapTrack(a.id)));
  rec('load field', s.loadMapTrack(field.id));
  rec('online', s.readOnlineStates());
  rec('write online', s.writeOnlineState(a.id, { state: 'online', hash: 'h', updatedUtc: '2026-10-01T00:00:00Z' }));
  rec('write online null', s.writeOnlineState(b.id, null));
  rec('online after', s.readOnlineStates());
  rec('mark unsynced', s.markUnsyncedTracks());
  rec('online marked', s.readOnlineStates());
  rec('autosave a', s.writeAutosave(a));
  rec('autosave field', s.writeAutosave(field));
  rec('read autosave swiss2', s.readMapAutosave('swiss2'));
  rec('read autosave alps', s.readMapAutosave('alps'));
  const fromServer = model.normalize(JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/trackbuilder/prod-pocho-v4.json'), 'utf8'))).doc;
  rec('store from server', s.storeFromServer(fromServer, { state: 'online', hash: 'x', updatedUtc: '2026-10-03T18:29:48Z' }));
  rec('list after server', mapIds(s.listMapTracks()));
  const forked = s.forkTrack(a.id);
  rec('fork shape', typeof forked === 'string' && TRACK_ID.test(forked) && forked !== a.id);
  rec('fork missing', s.forkTrack('trk-ffffffff'));
  rec('list after fork', mapIds(s.listMapTracks()).map((r) => (r[0] === forked ? ['FORK', ...r.slice(1)] : r)));
  const again = model.normalize(model.toPlain(a)).doc;
  again.name = 'Edited after fork';
  rec('save forked id', s.saveTrack(again));
  rec('save forked id took fork', again.id === forked);
  rec('list after save forked', mapIds(s.listMapTracks()).map((r) => (r[0] === forked ? ['FORK', ...r.slice(1)] : r)));
  const online = s.readOnlineStates();
  rec('online after fork', Object.fromEntries(Object.entries(online).map(([k, v]) => [k === forked ? 'FORK' : k, v])));
  rec('delete b', s.deleteTrack(b.id));
  rec('delete again', s.deleteTrack(b.id));
  rec('delete fork', s.deleteTrack(forked));
  rec('autosave after delete', attempt(() => s.readMapAutosave('swiss2')?.id === forked ? 'FORK' : s.readMapAutosave('swiss2')?.id ?? null));
  rec('final list', mapIds(s.listMapTracks()));
  rec('final online', Object.fromEntries(Object.entries(s.readOnlineStates()).map(([k, v]) => [k === forked ? 'FORK' : k, v])));
  /* A copy forked again and again: a save under the first id follows the
   * chain, and the chain is followed only so far. */
  const chain = [b.id];
  s.saveTrack(model.normalize(model.toPlain(b)).doc);
  for (let k = 0; k < 12; k += 1) {
    chain.push(s.forkTrack(chain[chain.length - 1]));
  }
  const named = (id) => (chain.includes(id) ? `CHAIN${chain.indexOf(id)}` : id);
  rec('chain shapes', chain.map((id) => typeof id === 'string' && TRACK_ID.test(id)));
  for (let k = 0; k < chain.length; k += 3) {
    const doc = model.normalize(model.toPlain(b)).doc;
    doc.id = chain[k];
    doc.name = `Chain save ${k}`;
    rec(`chain save ${k}`, s.saveTrack(doc));
    rec(`chain save ${k} landed`, named(doc.id));
  }
  rec('chain list', mapIds(s.listMapTracks()).map((r) => [named(r[0]), ...r.slice(1)]));
  rec('events total', savedEvents.length);
  const saver = s.makeAutosaver(5);
  rec('autosaver shape', Object.keys(saver).sort());
  return { 'storage/scenario': log };
}

async function autosaverCase() {
  store.clear();
  const s = storage;
  const doc = model.normalize(JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/map-track-v4.json'), 'utf8'))).doc;
  const saver = s.makeAutosaver(20);
  const log = [];
  for (const k of Object.keys(saver).sort()) {
    log.push([k, typeof saver[k]]);
  }
  if (typeof saver.schedule === 'function') {
    saver.schedule(doc);
    log.push(['before', s.readMapAutosave('swiss2')?.id ?? null]);
    await new Promise((r) => { setTimeout(r, 80); });
    log.push(['after', s.readMapAutosave('swiss2')?.id ?? null]);
  }
  if (typeof saver.flush === 'function') {
    doc.name = 'Flushed';
    attempt(() => saver.schedule?.(doc));
    attempt(() => saver.flush(doc));
    log.push(['flush', s.readMapAutosave('swiss2')?.name ?? null]);
  }
  if (typeof saver.cancel === 'function') {
    doc.name = 'Cancelled';
    attempt(() => saver.schedule?.(doc));
    attempt(() => saver.cancel());
    await new Promise((r) => { setTimeout(r, 60); });
    log.push(['cancel', s.readMapAutosave('swiss2')?.name ?? null]);
  }
  return { 'storage/autosaver': log };
}

/* ------------------------------------------------------------------ */

const hashes = {};
if (DUMP) {
  mkdirSync(DUMP, { recursive: true });
}
function put(name, value) {
  const hash = createHash('sha256');
  const parts = DUMP ? [] : null;
  canon(value, (text) => {
    hash.update(text);
    parts?.push(text);
  });
  hashes[name] = hash.digest('hex').slice(0, 20);
  if (DUMP) {
    writeFileSync(join(DUMP, `${name.replace(/[/]/g, '__')}.txt`), `${parts.join('')}\n`);
  }
}
for (const [k, v] of Object.entries(geometryCases())) {
  put(k, v);
}
for (const [k, v] of Object.entries(elementsCases())) {
  put(k, v);
}
for (const [k, v] of Object.entries(figuresCases())) {
  put(k, v);
}
for (const [k, v] of Object.entries(modelCases())) {
  put(k, v);
}
for (const [k, v] of Object.entries(storageCases())) {
  put(k, v);
}
for (const [k, v] of Object.entries(await autosaverCase())) {
  put(k, v);
}
const corpus = buildCorpus();
for (const { name, raw } of corpus) {
  reseedMathRandom(11);
  const out = perDocument(raw);
  for (const [family, value] of Object.entries(out)) {
    put(`doc/${name}/${family}`, value);
  }
}

if (WRITE) {
  writeFileSync(GOLDEN, `${JSON.stringify(hashes, null, 1)}\n`);
  console.log(`wrote ${Object.keys(hashes).length} goldens from ${corpus.length} documents to ${GOLDEN}`);
  process.exit(0);
}

const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
let failed = 0;
for (const [k, h] of Object.entries(golden)) {
  if (hashes[k] !== h) {
    failed += 1;
    if (failed <= 40) {
      console.log(`  FAIL  ${k}${hashes[k] ? '' : '  (case missing)'}`);
    }
  }
}
for (const k of Object.keys(hashes)) {
  if (!(k in golden)) {
    failed += 1;
    console.log(`  FAIL  ${k}  (case not in golden.json)`);
  }
}
const total = Object.keys(golden).length;
if (failed) {
  console.log(`trackbuilder golden: ${failed} of ${total} cases FAILED`);
  process.exit(1);
}
console.log(`trackbuilder golden: all ${total} cases match (${corpus.length} documents)`);
