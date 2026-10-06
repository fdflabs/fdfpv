/*
 * trackdoc-golden.js: src/game/trackdoc.js held to the exact outputs it gave
 * when tests/fixtures/trackdoc-golden.json was written.
 * npm run trackdoc:golden.
 *
 * The lap check builds its gates from courseFromDocument, and the board runs
 * the same arithmetic on its vendored copy, so a course that moves by one
 * ulp is a lap that scores differently here and there. lap-selftest and
 * wing-e2e only look at a few station fields; this pins the whole course.
 *
 * Every case reads one document and writes the whole course, key by key and
 * in key order (signed zeros spelled, so a scene z of -0 on the field's
 * midline is held), plus what canon cannot see: which station shares its
 * structure object with which structure (station.structure is the same
 * instance as course.structures[k]), that no other object in the course is
 * shared, that nothing is shared with or written to the caller's document,
 * and corridorSamples over the course at several spacings. course.guide is
 * in the stream although guide.js has a golden of its own, because the
 * course carries it as is and both have to stay identical.
 *
 * Case families:
 *
 *   exports    the three exports and nothing else.
 *   heading    headingForTravel over a grid of awkward components (signed
 *              zeros, the 1e-9 threshold either side, NaN, infinities,
 *              non numbers) and seeded vectors round the circle.
 *   corridor   corridorSamples on hand built courses: spacing measured from
 *              the last kept point, NaN distances, every spacing argument a
 *              caller could pass, structures and spawn appended, the empty
 *              fallback.
 *   repo       every track document in the repository: the gate cards
 *              track, the map track fixture, the two Itaipu courses.
 *   checks     the documents the existing checks build: lap-selftest's
 *              ring and wing course, wing-e2e's airfield loop.
 *   feature    builder made documents (createTrack, createElement,
 *              createSequenceEntry, applyAutoFaces) on both classes with
 *              every rule in one place: start pads, a gate on the midline,
 *              a ladder flown on all three levels, every marker, a flagged
 *              gate on both sides, a dive gate, an unbuilt gate, a barrier,
 *              a label, ground logos (default, small, missing), the same
 *              gate first and last with opposite entries; then the same
 *              without pads, with pads only, and with nothing.
 *   legacy     imported documents: schema 1 branding, Velocidrone heights
 *              folded (dive gates floating or not, flags and cones below and
 *              at their height, poles and waypoints left alone) on both
 *              sides of every threshold of the fold.
 *   figures    stacked runs: every figure the builder names, hand mixes,
 *              undecided faces, overridden faces, old style runs the upgrade
 *              rewrites, on both classes.
 *   spawn      start pads at every heading and pad layout, the no pads
 *              setback on each class, zero length and vertical travel.
 *   garbage    what normalize has to repair: non objects, wrong types,
 *              unknown and plane sized elements, dangling sequence entries,
 *              out of range levels, NaN and infinite numbers, a micro track.
 *   locale     the warnings and the default name under Spanish.
 *   gen        seeded documents through the track builder's model, both
 *              classes, some handed over live and some as written JSON.
 *   map        seeded documents through the in game builder (newCourse,
 *              addGate, setOrder, makeStart, casualCourse), read as field
 *              documents the way courseFromDocument reads them.
 *
 * A document with no id of its own gets a random one from normalize; that
 * case checks its shape and writes a placeholder, so the record does not
 * depend on Math.random.
 *
 * The record is written with --record; see scripts/lib/golden.js. Write it
 * again only on purpose, with the reason in the pull request.
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

import { readFileSync } from 'node:fs';

import * as trackdoc from '../src/game/trackdoc.js';
import { corridorSamples, courseFromDocument, headingForTravel } from '../src/game/trackdoc.js';
import { createElement, createSequenceEntry, createTrack, toPlain } from '../src/trackbuilder/model.js';
import { applyAutoFaces } from '../src/trackbuilder/faces.js';
import { ELEMENTS, KIND } from '../src/trackbuilder/elements.js';
import {
  BUILD_TYPES, addGate, casualCourse, headingOf, makeStart, newCourse, qAxis, qMul, qNorm, setOrder,
} from '../src/builder/course.js';
import { setLocale, useLocale } from '../src/strings/index.js';
import { mapTrackDocument } from '../tests/lib/maptrack.js';
import { canon, goldenMain, seeded } from './lib/golden.js';

const FIXTURE = new URL('../tests/fixtures/trackdoc-golden.json', import.meta.url);

/* Loaded once so a case can switch to it synchronously. */
await useLocale('es');
setLocale('en');

const cases = [];

/* ------------------------------------------------------------- helpers */

const STAMP = '2026-01-01T00:00:00Z';

/* createTrack names a document with Math.random and the clock; a record
 * cannot depend on either. */
function pin(doc, id) {
  doc.id = id;
  doc.createdUtc = STAMP;
  doc.modifiedUtc = STAMP;
  return doc;
}

const LOGO = (k) => `data:image/png;base64,${'iVBORw0KGgo'}${'ABCD'.repeat(k + 1)}${k}=`;

function readJson(rel) {
  return JSON.parse(readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8'));
}

/*
 * Every object reachable from root, by the first path that reached it, and
 * every later path that reached the same object again. canon spells a shared
 * object out at each place, so this is the only record of sharing. The
 * caller's document is walked first, so a course object that IS one of the
 * caller's objects shows up as an alias of raw.
 */
function aliases(raw, course) {
  const first = new Map();
  const out = [];
  const walk = (v, path) => {
    if (v === null || typeof v !== 'object') return;
    if (first.has(v)) {
      out.push(`${path} = ${first.get(v)}`);
      return;
    }
    first.set(v, path);
    for (const k of Object.keys(v)) walk(v[k], `${path}.${k}`);
  };
  walk(raw, 'raw');
  for (const k of Object.keys(course)) {
    /* The guide's own internals are guide.js's to pin. */
    if (k !== 'guide') walk(course[k], `course.${k}`);
  }
  return out;
}

const SPACINGS = [undefined, 4, 0, 1, 2.5, 10, 1e9, -1, NaN];

function sayCorridor(s, course) {
  const before = canon(course);
  for (const sp of SPACINGS) {
    s.call(`corridorSamples(${String(sp)})`, () => (sp === undefined ? corridorSamples(course) : corridorSamples(course, sp)));
  }
  s.say('corridorSamples left the course alone', canon(course) === before);
}

/* One document through courseFromDocument, and everything a caller can see. */
function sayCourse(s, raw) {
  const before = canon(raw);
  let course;
  try {
    course = courseFromDocument(raw);
  } catch (err) {
    s.say('threw', String(err && err.message));
    return;
  }
  s.say('raw unchanged', canon(raw) === before);
  const ownId = raw !== null && typeof raw === 'object' && typeof raw.id === 'string';
  if (!ownId) {
    s.say('documentId is a fresh track id', /^trk-[0-9a-f]{8}$/.test(course.documentId));
  }
  s.say('keys', Object.keys(course));
  for (const k of Object.keys(course)) {
    const v = k === 'documentId' && !ownId ? '(random)' : course[k];
    if (Array.isArray(v) && (k === 'structures' || k === 'stations' || k === 'figures')) {
      s.say(`${k}.length`, v.length);
      v.forEach((item, i) => s.say(`${k}[${i}]`, item));
    } else {
      s.say(k, v);
    }
  }
  s.say('station structure index', course.stations.map((st) => course.structures.indexOf(st.structure)));
  s.say('station structure is its element\'s', course.stations.every((st) => st.structure && st.structure.id === st.elementId));
  s.say('aliases', aliases(raw, course));
  sayCorridor(s, course);
}

function addCase(id, make, locale = 'en') {
  cases.push({
    id,
    run: (s) => {
      setLocale(locale);
      try {
        sayCourse(s, make());
      } finally {
        setLocale('en');
      }
    },
  });
}

function place(doc, type, x, y, yaw = 0, extra = {}) {
  const el = createElement(doc, type, { x, y }, yaw);
  Object.assign(el, extra);
  doc.elements.push(el);
  return el;
}

function step(doc, el, apertureIndex = 0, extra = {}) {
  const q = createSequenceEntry(doc, el.id, apertureIndex);
  Object.assign(q, extra);
  doc.sequence.push(q);
  return q;
}

/* ------------------------------------------------------------- exports */

cases.push({
  id: 'exports',
  run: (s) => s.say('exports', Object.keys(trackdoc).sort().map((k) => `${k}:${typeof trackdoc[k]}`)),
});

/* ------------------------------------------------------------- heading */

const COMPONENTS = [0, -0, 1, -1, 0.5, -0.5, 3, 4, -3, 1e-9, -1e-9, 1e-10, 7e-10, 7.1e-10, 2e-9, 1e-300, 1e300, -1e300,
  Infinity, -Infinity, NaN, undefined, null, '1', '-2'];

cases.push({
  id: 'heading-grid',
  run: (s) => {
    const tag = (v) => (typeof v === 'string' ? `'${v}'` : (Object.is(v, -0) ? '-0' : String(v)));
    for (const tx of COMPONENTS) {
      for (const tz of COMPONENTS) {
        s.call(`headingForTravel(${tag(tx)},${tag(tz)})`, () => headingForTravel(tx, tz));
      }
    }
    s.call('headingForTravel()', () => headingForTravel());
  },
});

cases.push({
  id: 'heading-seeded',
  run: (s) => {
    const r = seeded(0x7d0c1);
    for (let i = 0; i < 400; i += 1) {
      const a = r.range(-Math.PI * 2, Math.PI * 2);
      const m = r.pick([1, 1e-8, 1e-9, 1.0000001e-9, 1e-3, 1e6, r.range(0, 50)]);
      const tx = Math.sin(a) * m;
      const tz = Math.cos(a) * m;
      s.say(`${i} ${canon(tx)} ${canon(tz)}`, headingForTravel(tx, tz));
    }
    for (let k = -8; k <= 8; k += 1) {
      const a = (k * Math.PI) / 4;
      s.say(`quarter ${k}`, headingForTravel(Math.sin(a), Math.cos(a)));
    }
  },
});

/* ------------------------------------------------------------ corridor */

function corridorCase(id, course) {
  cases.push({ id, run: (s) => sayCorridor(s, course) });
}

corridorCase('corridor-spec-line', { line: [0, 1, 4, 8].map((x) => ({ x, y: 0, z: 0 })), structures: [], spawn: null });
corridorCase('corridor-empty', { line: [], structures: [], spawn: null });
corridorCase('corridor-spawn-only', { line: [], structures: [], spawn: { x: -0, z: 3, yaw: 1 } });
corridorCase('corridor-structures-only', {
  line: [], structures: [{ x: 1, z: -0 }, { x: -0, z: 2 }, { x: 1, z: -0 }], spawn: undefined,
});
corridorCase('corridor-from-last-kept', {
  /* Each step is 3 m, so a point is kept every other step from the last
   * one KEPT, not from its neighbour. */
  line: Array.from({ length: 12 }, (_, i) => ({ x: i * 3, y: i, z: -i * 0 })),
  structures: [{ x: 5, z: 5 }],
  spawn: { x: 0, z: 0 },
});
corridorCase('corridor-nan', {
  line: [{ x: 0, z: 0 }, { x: NaN, z: 0 }, { x: 5, z: 0 }, { x: 5, z: NaN }, { x: 20, z: 0 }],
  structures: [{ x: NaN, z: 1 }],
  spawn: { x: NaN, z: NaN },
});
corridorCase('corridor-first-nan', {
  /* The first point is always kept, NaN or not, and then nothing measures
   * a distance from it. */
  line: [{ x: NaN, z: 0 }, { x: 0, z: 0 }, { x: 100, z: 100 }],
  structures: [],
  spawn: null,
});
corridorCase('corridor-exact-spacing', {
  line: [{ x: 0, z: 0 }, { x: 3, z: 4 }, { x: 3, z: 4 }, { x: 6, z: 8 }, { x: 6.0000001, z: 8 }, { x: 2.4, z: 3.2 }],
  structures: [],
  spawn: 0,
});
cases.push({
  id: 'corridor-seeded',
  run: (s) => {
    const r = seeded(0xc0441d0);
    for (let n = 0; n < 30; n += 1) {
      const line = [];
      let x = r.range(-50, 50);
      let z = r.range(-50, 50);
      for (let i = 0, len = r.int(0, 60); i < len; i += 1) {
        x += r.range(-3, 3);
        z += r.range(-3, 3);
        line.push({ x, y: r.range(0, 5), z });
      }
      const structures = Array.from({ length: r.int(0, 4) }, () => ({ x: r.range(-30, 30), z: r.range(-30, 30) }));
      const spawn = r.chance(0.7) ? { x: r.range(-30, 30), z: r.range(-30, 30) } : null;
      const course = { line, structures, spawn };
      s.say(`course ${n}`, course);
      sayCorridor(s, course);
    }
  },
});

/* ---------------------------------------------------------------- repo */

for (const [id, rel] of [
  ['repo-gatecards', 'scripts/gatecards-track.json'],
  ['repo-map-track-v4', 'tests/fixtures/map-track-v4.json'],
  ['repo-itaipu-powerhouse', 'docs/itaipu-courses/powerhouse.json'],
  ['repo-itaipu-run', 'docs/itaipu-courses/itaipu-run.json'],
]) {
  addCase(id, () => readJson(rel));
  /* The same file with its world taken away: a field read of the same
   * elements, with the plane sized ones dropped. */
  addCase(`${id}-as-field`, () => {
    const d = readJson(rel);
    delete d.map;
    d.schemaVersion = 3;
    return d;
  });
}

/* -------------------------------------------------------------- checks */

function wingSquare(name) {
  const doc = pin(createTrack(name, 'wing'), `chk-${name.replace(/\W/g, '')}`);
  for (const [x, y] of [[100, 75], [300, 75], [300, 225], [100, 225]]) {
    step(doc, place(doc, 'gate', x, y, 0));
  }
  applyAutoFaces(doc);
  return doc;
}

addCase('checks-lap-ring', () => mapTrackDocument({ name: 'Lap check ring', id: 'chk-ring' }));
addCase('checks-lap-wing', () => wingSquare('Wing check'));
addCase('checks-wing-e2e', () => wingSquare('Airfield loop'));
addCase('checks-ring-types', () => mapTrackDocument({
  name: 'Typed ring', id: 'chk-types', gates: 6, types: ['gate', 'doubleStack', 'wideGate3', 'pylon', 'hoop30', 'flaggedGate'],
}));
addCase('checks-ring-ladders', () => mapTrackDocument({ name: 'Ladder ring', id: 'chk-ladders', gates: 4, type: 'ladder', radius: 25 }));

/* ------------------------------------------------------------- feature */

function featureDoc(cls, { pads = true, id }) {
  const doc = pin(createTrack(`Feature ${cls}`, cls), id);
  const W = doc.field.width;
  const D = doc.field.depth;
  const at = (fx, fy) => [W * fx, D * fy];
  doc.branding.logos.push({ id: 'logo-1', image: LOGO(1), name: 'One' }, { id: 'logo-2', image: LOGO(2), name: 'Two' });
  if (pads) place(doc, 'startPads', ...at(0.15, 0.2), 0.3);
  const mid = place(doc, 'gate', W / 2, D / 2, 0.25);
  const ladder = place(doc, 'ladder', ...at(0.75, 0.3), 1.1);
  const flag = place(doc, 'flag', ...at(0.85, 0.6), 0);
  const cone = place(doc, 'cone', ...at(0.7, 0.8), 0.4);
  const wp = place(doc, 'waypoint', ...at(0.5, 0.85), 0);
  const pole = place(doc, 'pole', ...at(0.3, 0.8), 0);
  const flagged = place(doc, 'flaggedGate', ...at(0.2, 0.6), -0.7, { flagSide: 'both', name: 'Both flags' });
  const dive = place(doc, 'diveGate', ...at(0.35, 0.45), 0.2);
  const unbuilt = place(doc, 'gate', ...at(0.6, 0.55), 2, { unbuilt: true });
  place(doc, 'barrier', ...at(0.45, 0.25), 0.9);
  place(doc, 'horizontalPole', ...at(0.55, 0.35), -0.4);
  place(doc, 'label', ...at(0.1, 0.9), 0);
  place(doc, 'groundLogo', ...at(0.4, 0.1), 0.5, { logoId: '' });
  const small = place(doc, 'groundLogo', ...at(0.6, 0.1), 1.5, { logoId: 'logo-2' });
  small.dims.width = 0.05;
  place(doc, 'groundLogo', ...at(0.8, 0.1), 0, { logoId: 'logo-9' });
  step(doc, mid);
  for (let k = 0; k < 3; k += 1) step(doc, ladder, k);
  step(doc, flag, 0, { passSide: 'right' });
  step(doc, cone);
  step(doc, wp);
  step(doc, pole, 0, { passSide: 'right' });
  step(doc, flagged);
  step(doc, dive);
  step(doc, unbuilt);
  step(doc, mid);
  applyAutoFaces(doc);
  /* The same gate first and last, flown opposite ways. */
  doc.sequence[0].entry = 1;
  doc.sequence[0].overridden = true;
  doc.sequence[doc.sequence.length - 1].entry = -1;
  doc.sequence[doc.sequence.length - 1].overridden = true;
  return doc;
}

for (const cls of ['full', 'wing']) {
  addCase(`feature-${cls}`, () => featureDoc(cls, { id: `feat-${cls}` }));
  addCase(`feature-${cls}-plain`, () => JSON.parse(JSON.stringify(toPlain(featureDoc(cls, { id: `feat-${cls}-plain` })))));
  addCase(`feature-${cls}-no-pads`, () => featureDoc(cls, { pads: false, id: `feat-${cls}-np` }));
  addCase(`feature-${cls}-pads-only`, () => {
    const doc = pin(createTrack('Pads only', cls), `pads-${cls}`);
    place(doc, 'startPads', 12, 9, 1.2);
    return doc;
  });
  addCase(`feature-${cls}-empty`, () => pin(createTrack('Empty', cls), `empty-${cls}`));
  addCase(`feature-${cls}-obstacles-only`, () => {
    const doc = pin(createTrack('Obstacles', cls), `obst-${cls}`);
    place(doc, 'barrier', 10, 10, 0);
    place(doc, 'gate', 20, 20, 0);
    place(doc, 'flag', 30, 20, 0);
    return doc;
  });
}

/* -------------------------------------------------------------- legacy */

function legacyEl(id, type, z, dims = {}, extra = {}) {
  return {
    id, type, name: '', position: { x: 10 + id.length, y: 12, z }, yaw: 0.5, pitch: type === 'diveGate' ? Math.PI / 2 : 0, dims, ...extra,
  };
}

addCase('legacy-heights', () => ({
  schemaVersion: 1,
  id: 'legacy-heights',
  name: 'Imported',
  field: { width: 60, depth: 40 },
  branding: { logo: LOGO(3), logoName: 'Old logo' },
  elements: [
    legacyEl('d5', 'diveGate', 5, { clearW: 2.1336, clearH: 1.8288, sillH: 0, levelPitch: 1.9 }),
    legacyEl('d02', 'diveGate', 0.2, { clearW: 2.1336, clearH: 1.8288, sillH: 0, levelPitch: 1.9 }),
    legacyEl('d03', 'diveGate', 0.3, { clearW: 2, clearH: 1, sillH: 0 }),
    legacyEl('d0301', 'diveGate', 0.300001, { clearW: 2, clearH: 0, sillH: 0 }),
    legacyEl('dlow', 'diveGate', 0.9, { clearW: 2, clearH: 1.8, sillH: 0.049999 }),
    legacyEl('dsill', 'diveGate', 5, { clearW: 2, clearH: 1.8, sillH: 0.05 }),
    legacyEl('dneg', 'diveGate', 1, { clearW: 2, clearH: 4, sillH: 0 }),
    legacyEl('dnone', 'diveGate', undefined, { clearW: 2, clearH: 1.8, sillH: 0 }),
    legacyEl('f125', 'flag', 1.25),
    legacyEl('f25', 'flag', 2.5),
    legacyEl('f249', 'flag', 2.499999),
    legacyEl('fneg', 'flag', -1),
    legacyEl('c3', 'cone', 3, { height: 0.7 }),
    legacyEl('c05', 'cone', 0.5, { height: 0.7 }),
    legacyEl('c0h', 'cone', 1, { height: 0 }),
    legacyEl('p1', 'pole', 1),
    legacyEl('w1', 'waypoint', 1),
    legacyEl('c004', 'cone', 0, { clearance: 0.04 }),
  ],
  sequence: [
    { id: 's1', elementId: 'd5', apertureIndex: 0, entry: 1 },
    { id: 's2', elementId: 'f125', passSide: 'left', clearance: 1.5 },
    { id: 's3', elementId: 'd02', apertureIndex: 0, entry: -1 },
    { id: 's4', elementId: 'c3', passSide: 'right' },
    { id: 's5', elementId: 'p1', passSide: 'left' },
    { id: 's6', elementId: 'c004', passSide: 'left', clearance: 0.04 },
    { id: 's7', elementId: 'd03', apertureIndex: 0, entry: 1 },
    { id: 's8', elementId: 'w1', passSide: 'left' },
    { id: 's9', elementId: 'dsill', apertureIndex: 0, entry: 0 },
    { id: 's10', elementId: 'f25', passSide: 'right' },
    { id: 's11', elementId: 'c0h', passSide: 'left' },
    { id: 's12', elementId: 'dneg', apertureIndex: 0, entry: 1 },
  ],
}));

addCase('legacy-no-version', () => ({
  name: 'Bare',
  id: 'legacy-bare',
  elements: [
    { id: 'a', type: 'gate', position: { x: 5, y: 5 } },
    { id: 'b', type: 'gate', position: { x: 25, y: 5 }, yaw: Math.PI },
    { id: 'c', type: 'flag', position: { x: 25, y: 25, z: 1 } },
  ],
  sequence: [{ elementId: 'a' }, { elementId: 'b', entry: -3 }, { elementId: 'c', passSide: 'up' }],
}));

/* Marker clearances on both sides of the 0.05 a station needs. */
addCase('legacy-clearances', () => {
  const doc = pin(createTrack('Clearances'), 'clearances');
  let x = 6;
  for (const c of [0, 0.04, 0.0499999, 0.05, 0.0500001, 0.1, 1.5, 7, 40]) {
    const f = place(doc, x % 12 === 0 ? 'cone' : 'flag', x, x % 12 === 0 ? 30 : 10, 0);
    step(doc, f, 0, { clearance: c, passSide: x % 4 === 0 ? 'left' : 'right' });
    x += 6;
  }
  return toPlain(doc);
});

/* ------------------------------------------------------------- figures */

const RUNS = {
  up: [[0, 1], [1, 1], [2, 1]],
  down: [[2, 1], [1, 1], [0, 1]],
  splitS: [[2, 1], [0, -1]],
  oldUp: [[0, 1], [1, -1], [2, 1]],
  sameDown: [[2, 1], [1, 1], [0, 1]],
  zigzag: [[0, 1], [2, -1], [1, 1]],
  undecided: [[0, 0], [1, 0], [2, 0]],
  backUp: [[0, -1], [1, -1], [2, -1]],
  repeat: [[1, 1], [1, 1], [1, -1]],
  pair: [[0, 1], [1, 1]],
  pairDown: [[1, 1], [0, 1]],
  pairOld: [[0, 1], [1, -1]],
  pairBack: [[1, -1], [0, -1]],
  single: [[2, 1]],
};

for (const cls of ['full', 'wing']) {
  for (const [name, run] of Object.entries(RUNS)) {
    for (const overridden of [false, true]) {
      addCase(`figures-${cls}-${name}${overridden ? '-overridden' : ''}`, () => {
        const doc = pin(createTrack(`Figure ${name}`, cls), `fig-${cls}-${name}`);
        const W = doc.field.width;
        const D = doc.field.depth;
        const type = run.some(([i]) => i > 1) ? 'ladder' : 'doubleStack';
        const before = place(doc, 'gate', W * 0.2, D * 0.3, 0.1);
        const stack = place(doc, type, W * 0.55, D * 0.5, 0.6);
        const after = place(doc, 'flaggedGate', W * 0.3, D * 0.75, 2.2, { flagSide: 'top' });
        step(doc, before);
        for (const [i] of run) step(doc, stack, i);
        step(doc, after);
        step(doc, stack, run[0][0]);
        applyAutoFaces(doc);
        run.forEach(([, e], k) => {
          doc.sequence[1 + k].entry = e;
          doc.sequence[1 + k].overridden = overridden;
        });
        return doc;
      });
    }
  }
}

/* --------------------------------------------------------------- spawn */

for (const [k, yaw] of [0, Math.PI / 2, Math.PI, -Math.PI / 2, -Math.PI, 0.1, 2.5, -3, 1e-12].entries()) {
  addCase(`spawn-pads-yaw-${k}`, () => {
    const doc = pin(createTrack('Pad heading'), `pad-yaw-${k}`);
    const pads = place(doc, 'startPads', 30, 20, yaw);
    if (k % 3 === 1) Object.assign(pads.dims, { pads: 1 + k, spacing: 0.5 * k, padSize: 0.3 + 0.1 * k });
    step(doc, place(doc, 'gate', 40, 20, 0));
    step(doc, place(doc, 'gate', 20, 30, 1));
    applyAutoFaces(doc);
    return doc;
  });
}

for (const [pads, spacing, padSize] of [[0, 0, 0], [1, 1.5, 0.6], [2, 1.5, 0.6], [3, 2, 0.8], [7, 0.1, 5], [24, 3, 0.2]]) {
  addCase(`spawn-pads-layout-${pads}-${spacing}-${padSize}`, () => ({
    id: `pads-layout-${pads}`,
    elements: [{
      id: 'p', type: 'startPads', position: { x: 30, y: 20, z: 0.4 }, yaw: 0.7, dims: { pads, spacing, padSize },
    }],
  }));
}

for (const cls of ['full', 'wing']) {
  for (const [k, yaw] of [0, 1, Math.PI, -2].entries()) {
    addCase(`spawn-setback-${cls}-${k}`, () => {
      const doc = pin(createTrack('Setback', cls), `setback-${cls}-${k}`);
      const W = doc.field.width;
      const D = doc.field.depth;
      step(doc, place(doc, k === 3 ? 'flag' : 'gate', W * 0.3, D * 0.4, yaw));
      step(doc, place(doc, 'gate', W * 0.7, D * 0.6, yaw + 1));
      if (k !== 2) applyAutoFaces(doc);
      return doc;
    });
  }
}

/* A dive flown straight down has no horizontal travel: the station falls
 * back to the structure's yaw. */
addCase('spawn-vertical-dive', () => ({
  id: 'vertical-dive',
  field: { width: 60, depth: 40 },
  elements: [{
    id: 'd', type: 'diveGate', position: { x: 30, y: 20, z: 0 }, yaw: 0.8, pitch: Math.PI / 2, dims: { sillH: 6 },
  }],
  sequence: [{ id: 'q', elementId: 'd', apertureIndex: 0, entry: 1 }],
}));

/* Every gate on one spot: zero length legs. */
addCase('spawn-stacked-spot', () => ({
  id: 'one-spot',
  elements: ['a', 'b', 'c'].map((id) => ({ id, type: 'gate', position: { x: 30, y: 20 }, yaw: 0 })),
  sequence: ['a', 'b', 'c', 'a'].map((elementId, i) => ({ id: `q${i}`, elementId, apertureIndex: 0, entry: 1 })),
}));
addCase('spawn-single-gate', () => ({
  id: 'single-gate', elements: [{ id: 'a', type: 'gate', position: { x: 30, y: 20 }, yaw: 1 }], sequence: [{ elementId: 'a', entry: -1 }],
}));
addCase('spawn-single-flag', () => ({
  id: 'single-flag', elements: [{ id: 'a', type: 'flag', position: { x: 30, y: 20 } }], sequence: [{ elementId: 'a' }],
}));

/* ------------------------------------------------------------- garbage */

const GARBAGE = {
  null: null,
  undefined,
  number: 5,
  nan: NaN,
  string: 'x',
  json: '{"id":"str","elements":[]}',
  true: true,
  array: [],
  arrayOfGates: [{ id: 'a', type: 'gate' }],
  object: {},
  elementsNumber: { id: 'g1', elements: 5, sequence: 'x' },
  elementsJunk: { id: 'g2', elements: [null, 5, 'gate', { type: 'nope' }, { type: 'gate' }, { type: 'gate', id: 'el-1' }] },
  unknownType: { id: 'g3', elements: [{ id: 'a', type: 'spaceship', position: { x: 1, y: 1 } }], sequence: [{ elementId: 'a' }] },
  missingElement: {
    id: 'g4',
    elements: [{ id: 'a', type: 'gate', position: { x: 20, y: 20 } }],
    sequence: [{ elementId: 'ghost' }, { elementId: 'a', entry: 1 }, { elementId: 'b' }],
  },
  obstacleStep: {
    id: 'g5',
    elements: [{ id: 'w', type: 'barrier', position: { x: 20, y: 20 } }, { id: 'l', type: 'label', position: { x: 2, y: 2 } }],
    sequence: [{ elementId: 'w' }, { elementId: 'l' }],
  },
  planeOnField: {
    id: 'g6',
    elements: [{ id: 'h', type: 'hoop30', position: { x: 20, y: 20 } }, { id: 'p', type: 'pylon', position: { x: 40, y: 20 } }],
    sequence: [{ elementId: 'h' }, { elementId: 'p' }],
  },
  levelPastTop: {
    id: 'g7',
    elements: [{ id: 'd', type: 'doubleStack', position: { x: 20, y: 20 } }, { id: 'g', type: 'gate', position: { x: 40, y: 10 } }],
    sequence: [{ elementId: 'd', apertureIndex: 7, entry: 1 }, { elementId: 'g', apertureIndex: -2 }, { elementId: 'd', apertureIndex: 1.6 }],
  },
  numbers: {
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
  duplicates: {
    id: 'g9',
    elements: [
      { id: 'el-2', type: 'gate', position: { x: 10, y: 10 } },
      { id: 'el-2', type: 'gate', position: { x: 30, y: 10 } },
      { type: 'gate', position: { x: 30, y: 30 } },
      { id: 's', type: 'startPads', position: { x: 5, y: 5 } },
      { id: 't', type: 'startPads', position: { x: 50, y: 5 } },
    ],
    sequence: [{ id: 'x', elementId: 'el-2' }, { id: 'x', elementId: 'el-1' }, { elementId: 'el-3' }],
  },
  futureVersion: { id: 'g10', schemaVersion: 99, map: 'nowhere', elements: [{ id: 'a', type: 'wideGate5', position: { x: 10, y: 10 } }] },
  badMap: { id: 'g11', schemaVersion: 4, map: 'Not A Map!', elements: [{ id: 'a', type: 'pylonPair', position: { x: 10, y: 10 } }] },
  micro: {
    id: 'g12',
    trackClass: 'micro',
    elements: [{ id: 'a', type: 'gate', position: { x: 2, y: 2 } }, { id: 'b', type: 'gate', position: { x: 4, y: 3 }, yaw: 1 }],
    sequence: [{ elementId: 'a', entry: 1 }, { elementId: 'b', entry: 1 }],
  },
  unknownClass: { id: 'g13', trackClass: 'huge', elements: [{ id: 'a', type: 'gate', position: { x: 2, y: 2 } }], sequence: [{ elementId: 'a' }] },
  logosJunk: {
    id: 'g14',
    branding: { logos: [5, 'http://example.com/a.png', { id: 'dup', image: LOGO(1) }, { id: 'dup', image: LOGO(2) }, LOGO(3), LOGO(4), LOGO(5), LOGO(6)] },
    elements: [
      { id: 'l1', type: 'groundLogo', position: { x: 30, y: 20 }, logoId: 'dup', dims: { width: NaN, depth: 0 } },
      { id: 'l2', type: 'groundLogo', position: { x: 10, y: 20 }, logoId: 'logo-1' },
      { id: 'l3', type: 'groundLogo', position: { x: 20, y: 20 }, logoId: 7 },
      { id: 'g', type: 'gate', position: { x: 40, y: 20 } },
    ],
    sequence: [{ elementId: 'g' }],
  },
  idNotString: { id: 42, name: 7, elements: [] },
  emptyStrings: { id: '', name: '', elements: [{ id: 'a', type: 'gate', name: '', position: { x: 1, y: 1 } }], sequence: [{ elementId: 'a' }] },
};

for (const [name, raw] of Object.entries(GARBAGE)) {
  addCase(`garbage-${name}`, () => raw);
}

/* -------------------------------------------------------------- locale */

addCase('locale-es-null', () => null, 'es');
addCase('locale-es-no-pads', () => featureDoc('full', { pads: false, id: 'loc-es' }), 'es');
addCase('locale-es-junk', () => GARBAGE.elementsJunk, 'es');

/* ----------------------------------------------------------------- gen */

const FIELD_TYPES = Object.keys(ELEMENTS).filter((t) => !ELEMENTS[t].wing);
const SEQUENCEABLE = (el) => [KIND.APERTURE, KIND.MARKER].includes(ELEMENTS[el.type].kind);
const CLEARANCES = [0, 0.04, 0.0499999, 0.05, 0.3, 1.5, 2, 15];

function genField(seed, cls) {
  const r = seeded(seed);
  const doc = pin(createTrack(`Generated ${seed}`, cls), `gen-${cls}-${seed}`);
  if (r.chance(0.2)) {
    doc.field.width = r.pick([5, 7.3, 33, 60, 400, 1000]);
    doc.field.depth = r.pick([5, 9.1, 40, 300]);
  }
  if (r.chance(0.2)) doc.settings.samplesPerSegment = r.pick([4, 9, 64]);
  const W = doc.field.width;
  const D = doc.field.depth;
  for (let k = 0, n = r.int(0, 4); k < n; k += 1) {
    doc.branding.logos.push({ id: `logo-${k + 1}`, image: LOGO(k + seed % 5), name: '' });
  }
  const coord = (span) => (r.chance(0.15) ? span / 2 : Math.round(r.range(0, span) * 1000) / 1000);
  for (let k = 0, n = r.int(0, 14); k < n; k += 1) {
    const type = r.pick(FIELD_TYPES);
    const yaw = r.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2, r.range(-Math.PI, Math.PI)]);
    const el = place(doc, type, coord(W), coord(D), yaw);
    const kind = ELEMENTS[type].kind;
    if (r.chance(0.2)) el.position.z = r.pick([0.2, 0.3, 1, 2.5, 3, r.range(0, 8)]);
    if (r.chance(0.3)) el.name = `E${k}`;
    if (kind === KIND.APERTURE) {
      if (r.chance(0.3)) el.pitch = r.pick([0, Math.PI / 2, -Math.PI / 2, r.range(-1.6, 1.6)]);
      if (r.chance(0.15)) el.unbuilt = true;
      if (r.chance(0.25)) el.dims.levels = r.int(1, 4);
      if (r.chance(0.2)) el.dims.sillH = r.pick([0, 0.04, 0.05, 1, 4.572]);
      if (r.chance(0.2)) el.dims.clearW = r.range(0.5, 4);
    }
    if (ELEMENTS[type].flagSide && r.chance(0.7)) el.flagSide = r.pick(['left', 'right', 'both', 'top', 'nowhere']);
    if (kind === KIND.MARKER && r.chance(0.3)) el.dims.clearance = r.pick(CLEARANCES);
    if (kind === KIND.MARKER && r.chance(0.2)) el.dims.height = r.pick([0, 0.5, 3, 30]);
    if (kind === KIND.DECAL) {
      el.logoId = r.pick(['', 'logo-1', 'logo-2', 'logo-3', 'logo-9']);
      if (r.chance(0.3)) el.dims.width = r.pick([0, 0.05, 0.1, 3]);
      if (r.chance(0.3)) el.dims.depth = r.pick([0, 0.05, 0.1, 3]);
    }
    if (kind === KIND.START && r.chance(0.4)) Object.assign(el.dims, { pads: r.int(1, 6), spacing: r.range(0.5, 3) });
  }
  const live = doc.elements.filter(SEQUENCEABLE);
  for (let k = 0, n = live.length ? r.int(0, 12) : 0; k < n; k += 1) {
    const el = r.pick(live);
    const levels = ELEMENTS[el.type].kind === KIND.APERTURE ? el.dims.levels : 1;
    if (levels > 1 && r.chance(0.5)) {
      /* A run on the stack, the way the figure tool writes one. */
      const order = r.pick([[0, 1, 2, 3], [3, 2, 1, 0], [2, 0], [0, 2, 1], [1, 1]]).filter((i) => i < levels);
      for (const i of order) step(doc, el, i);
    } else {
      const q = step(doc, el, r.int(-1, levels + 1));
      if (q.passSide) q.passSide = r.pick(['left', 'right']);
      if (q.clearance != null && r.chance(0.4)) q.clearance = r.pick(CLEARANCES);
    }
  }
  if (r.chance(0.8)) applyAutoFaces(doc);
  for (const q of doc.sequence) {
    if (q.entry != null && r.chance(0.2)) {
      q.entry = r.pick([-1, 0, 1]);
      q.overridden = r.chance(0.5);
    }
  }
  switch (r.int(0, 2)) {
    case 0: return doc;
    case 1: return JSON.parse(JSON.stringify(toPlain(doc)));
    default: return JSON.parse(JSON.stringify(doc));
  }
}

for (let i = 0; i < 140; i += 1) {
  addCase(`gen-full-${i}`, () => genField(1000 + i, 'full'));
  addCase(`gen-wing-${i}`, () => genField(5000 + i, 'wing'));
}

/* ----------------------------------------------------------------- map */

function genMap(seed) {
  const r = seeded(seed);
  const doc = pin(newCourse(r.pick(['swiss2', 'alps', 'itaipu']), `Map ${seed}`), `map-${seed}`);
  if (r.chance(0.25)) doc.trackClass = 'wing';
  const cx = r.range(-500, 500);
  const cz = r.range(-500, 500);
  for (let k = 0, n = r.int(1, 10); k < n; k += 1) {
    const type = r.pick(BUILD_TYPES);
    const base = { x: cx + r.range(-200, 200), y: r.range(-50, 300), z: cz + r.range(-200, 200) };
    let quat = qAxis(0, 1, 0, headingOf(r.range(-1, 1), r.range(-1, 1)));
    if (r.chance(0.3)) quat = qNorm(qMul(quat, qAxis(1, 0, 0, r.range(-1.5, 1.5))));
    addGate(doc, type, base, quat, r.chance(0.3) ? 'right' : 'left');
  }
  if (r.chance(0.3)) {
    const ids = doc.elements.map((e) => e.id);
    setOrder(doc, ids.slice().reverse().slice(0, r.int(1, ids.length)));
  }
  if (r.chance(0.3) && doc.elements.length) makeStart(doc, r.pick(doc.elements).id);
  if (r.chance(0.2)) {
    const pads = createElement(doc, 'startPads', { x: cx, y: cz }, r.range(-3, 3));
    doc.elements.push(pads);
  }
  return r.chance(0.5) ? JSON.parse(JSON.stringify(toPlain(doc))) : doc;
}

for (let i = 0; i < 60; i += 1) {
  addCase(`map-${i}`, () => genMap(9000 + i));
}

addCase('map-casual-flat', () => {
  const doc = casualCourse('swiss2', 'Casual flat', () => 0, { x: 0, z: 0 });
  return doc && pin(doc, 'casual-flat');
});
addCase('map-casual-hills', () => {
  const doc = casualCourse('alps', 'Casual hills', (x, z) => 40 * Math.sin(x / 300) + 25 * Math.cos(z / 170), { x: 250, z: -400 });
  return doc && pin(doc, 'casual-hills');
});

goldenMain('trackdoc:golden', FIXTURE, cases);
