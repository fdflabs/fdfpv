/*
 * guide-golden.js: src/game/guide.js held to the exact outputs it gave
 * when tests/fixtures/guide-golden.json was written. npm run guide:golden.
 *
 * Nothing else checks the guide: lap-selftest only notices if it throws.
 * This pins everything a caller can see of guideFromKnots (samples,
 * dashes, arrows, flag commas and length, key order included) and the
 * GUIDE table itself, so a clean room rewrite has to land on the same
 * doubles. Case families:
 *
 *   exports   the module's export names, GUIDE in full and that it is not
 *             frozen.
 *   edge      the early outs: no knots, one knot, knots that weld into a
 *             single point (including a peg whose comma is computed and
 *             then thrown away), and the resample tail either side of
 *             tailMin and of one sample.
 *   doc       knots exactly as trackdoc.js builds them: courseFromDocument
 *             is run on real documents (the repo's track files, the
 *             courses lap-selftest flies, the spec's three probe tracks)
 *             and on seeded builder documents, and its call into
 *             guideFromKnots is tapped. sceneKnots is private, so the tap
 *             is the only way to get trackdoc's own knots without copying
 *             its code.
 *   branch    hand built knot lists for the branches the documents do not
 *             reach: the same pole twice, consecutive pegs on one pole,
 *             overlapping and nested peg circles, a reference point inside
 *             a peg, pegs first and last, crowding either side of
 *             wrapCluster, lane thresholds and the ulps beside them, an
 *             approach rejected only for a flag, a run arrow refused by
 *             the 14 m keep out, NaN, -0 and missing fields. No Infinity:
 *             an infinite segment or radius never finishes resampling, and
 *             trackdoc cannot produce one.
 *   patch     GUIDE changed at run time, one key per case, because the
 *             module reads the live object on every call and the spec
 *             says a monkeypatch must take effect. Two of these are the
 *             only way to reach the comma's seven point fallback and the
 *             resampler's zero length segment skip.
 *   fuzz      seeded knot lists of every role and awkward radius, in
 *             chunks so a failing id names a small set.
 *
 * Every direct call also says whether the knots it was given came back
 * unchanged. The record is written with --record; see
 * scripts/lib/golden.js. Write it again only on purpose, with the reason in
 * the pull request.
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
import { register } from 'node:module';

import { canon, goldenMain, seeded } from './lib/golden.js';

const FIXTURE = new URL('../tests/fixtures/guide-golden.json', import.meta.url);
const GUIDE_URL = new URL('../src/game/guide.js', import.meta.url).href;

/*
 * The tap. trackdoc.js imports './guide.js' statically and an ES module
 * export cannot be reassigned, so a resolve hook hands trackdoc (and only
 * trackdoc) a wrapper that records each knot list and calls through to the
 * one real instance, the same one this script drives directly. Written
 * inline as a data: URL so the check stays one file.
 */
const WRAPPER = `import { GUIDE, guideFromKnots as real } from ${JSON.stringify(GUIDE_URL)};
export { GUIDE };
export function guideFromKnots(knots) {
  if (globalThis.__guideTap) globalThis.__guideTap.push(structuredClone(knots));
  return real(knots);
}`;
const HOOKS = `export async function resolve(specifier, context, next) {
  if (specifier === './guide.js' && context.parentURL && context.parentURL.endsWith('/src/game/trackdoc.js')) {
    return { url: ${JSON.stringify(`data:text/javascript,${encodeURIComponent(WRAPPER)}`)}, shortCircuit: true };
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(HOOKS)}`);

const guideModule = await import('../src/game/guide.js');
const { GUIDE, guideFromKnots } = guideModule;
const { courseFromDocument } = await import('../src/game/trackdoc.js');
const { createElement, createSequenceEntry, createTrack } = await import('../src/trackbuilder/model.js');
const { applyAutoFaces } = await import('../src/trackbuilder/faces.js');
const { mapTrackDocument } = await import('../tests/lib/maptrack.js');

const cases = [];

/* One direct call: the input, the output, and whether the input survived. */
function drive(s, label, knots) {
  s.say(`${label} knots`, knots);
  const before = canon(knots);
  s.call(`${label} guide`, () => guideFromKnots(knots));
  s.say(`${label} knots unchanged`, canon(knots) === before);
}

/* Runs fn with GUIDE[key] = value, and puts the old value back whatever
 * happens, so one patch case cannot leak into the next. */
function patched(patch, fn) {
  const old = {};
  for (const k of Object.keys(patch)) old[k] = GUIDE[k];
  Object.assign(GUIDE, patch);
  try {
    fn();
  } finally {
    Object.assign(GUIDE, old);
  }
}

/* ------------------------------------------------------------- knot kit */

const gate = (x, z, y = 0.762) => ({ role: 'aperture', x, z, y, radius: 0 });
const wrap = (x, z, y = 0.762) => ({ role: 'wrap', x, z, y, radius: 0 });
const finish = (x, z, y = 0.762) => ({ role: 'finish', x, z, y, radius: 0 });
/* A peg the way sceneKnots writes one: the fly point sits on the circle
 * at angle a (radians) round the pole. */
function peg(px, pz, r, a, y = 0) {
  return {
    role: 'marker', x: px + r * Math.cos(a), z: pz + r * Math.sin(a), y, radius: r, poleX: px, poleZ: pz,
  };
}

/* ---------------------------------------------------------------- exports */

cases.push({
  id: 'exports',
  run: (s) => {
    s.say('exports', Object.keys(guideModule).sort().map((k) => `${k}:${typeof guideModule[k]}`));
    s.say('default', 'default' in guideModule);
    s.say('GUIDE', GUIDE);
    s.say('GUIDE frozen', Object.isFrozen(GUIDE));
  },
});

/* ------------------------------------------------------------------- edge */

cases.push({
  id: 'edge-empty',
  run: (s) => {
    s.call('no argument', () => guideFromKnots());
    s.call('undefined', () => guideFromKnots(undefined));
    s.call('null', () => guideFromKnots(null));
    s.call('false', () => guideFromKnots(false));
    s.call('0', () => guideFromKnots(0));
    s.call('empty', () => guideFromKnots([]));
    drive(s, 'one gate', [gate(0, 0)]);
    drive(s, 'one peg', [peg(0, 0, 1.5, 0)]);
    const a = guideFromKnots([]);
    const b = guideFromKnots([]);
    s.say('empty guides are fresh', a !== b && a.samples !== b.samples && a.dashes !== b.dashes
      && a.arrows !== b.arrows && a.flagArcs !== b.flagArcs);
  },
});

cases.push({
  id: 'edge-weld',
  run: (s) => {
    drive(s, 'welded pair', [gate(0, 0), gate(0.01, 0)]);
    drive(s, 'welded just under weld', [gate(0, 0), wrap(0.0399, 0)]);
    drive(s, 'not welded at weld', [gate(0, 0), wrap(0.04, 0)]);
    drive(s, 'three welded', [gate(5, 5), wrap(5.02, 5), finish(5.03, 5.01)]);
    /* A peg so small that its tangents, arc and apex all weld to one point
     * with the wrap that follows: the comma is computed during the walk and
     * then dropped with the empty guide. */
    drive(s, 'peg welds away', [peg(0, 0, 0.26, 0), wrap(0.26, 0)]);
    drive(s, 'peg welds away, crowded twin', [peg(0, 0, 0.26, 0), peg(0, 0, 0.26, 0)]);
  },
});

cases.push({
  id: 'edge-tail',
  run: (s) => {
    for (const x of [0.3, 0.35, 0.36, 0.37, 0.39, 0.4, 0.400001, 0.7, 0.71, 0.75, 1.05, 1.1]) {
      drive(s, `gate to wrap ${x}`, [gate(0, 0), wrap(x, 0)]);
    }
    drive(s, 'wrap to wrap 0.3', [wrap(0, 0), wrap(0.3, 0)]);
    drive(s, 'diagonal 0.4', [wrap(0, 0), wrap(0.4 / Math.SQRT2, 0.4 / Math.SQRT2)]);
    drive(s, 'tiny steps', Array.from({ length: 30 }, (_, i) => wrap(i * 0.05, Math.sin(i) * 0.01)));
    drive(s, 'steps just over weld', Array.from({ length: 40 }, (_, i) => wrap(i * 0.0401, 0)));
    drive(s, 'steps under weld', Array.from({ length: 40 }, (_, i) => wrap(i * 0.039, 0)));
  },
});

/* -------------------------------------------------------------------- doc */

/*
 * Runs courseFromDocument with the tap on and says the knots trackdoc
 * handed the guide and the guide for each. course.guide must be the guide
 * of the last tapped call; the rest of the course is not this module's.
 */
function viaTrackdoc(s, doc) {
  globalThis.__guideTap = [];
  let course;
  try {
    course = courseFromDocument(doc);
  } finally {
    s.say('tapped calls', globalThis.__guideTap.length);
  }
  const taps = globalThis.__guideTap;
  globalThis.__guideTap = null;
  taps.forEach((knots, i) => drive(s, `call ${i}`, knots));
  if (taps.length) {
    s.say('course.guide equals the direct call',
      canon(course.guide) === canon(guideFromKnots(taps[taps.length - 1])));
  }
}

function build(name, items, cls) {
  const t = createTrack(name, cls);
  for (const [type, x, y, yaw, extra] of items) {
    const e = createElement(t, type, { x, y }, yaw ?? 0);
    t.elements.push(e);
    const seq = createSequenceEntry(t, e.id, extra?.aperture ?? 0);
    if (extra?.passSide) seq.passSide = extra.passSide;
    if (extra && 'clearance' in extra) seq.clearance = extra.clearance;
    t.sequence.push(seq);
  }
  applyAutoFaces(t);
  return t;
}

const readJson = (rel) => JSON.parse(readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8'));

/* The spec's three probe tracks, the wing course lap-selftest flies, its
 * map ring, and every track document the repo carries. */
const DOCS = [
  ['rectangle', () => build('gates', [['gate', 10, 10], ['gate', 50, 10], ['gate', 50, 30], ['gate', 10, 30]])],
  ['slalom', () => build('slalom', [['gate', 5, 20], ['flag', 15, 20], ['flag', 19, 20], ['flag', 23, 20],
    ['gate', 40, 20], ['flag', 55, 35], ['tower', 30, 35], ['gate', 10, 35]])],
  ['tower', () => build('tower', [['gate', 5, 5], ['tower', 30, 5], ['cone', 55, 20], ['gate', 30, 35],
    ['waypoint', 10, 20]])],
  ['wing', () => build('Wing check', [['gate', 100, 75], ['gate', 300, 75], ['gate', 300, 225], ['gate', 100, 225]],
    'wing')],
  ['map-ring', () => mapTrackDocument({ name: 'Lap check ring' })],
  ['gatecards-track', () => readJson('scripts/gatecards-track.json')],
  ['powerhouse', () => readJson('docs/itaipu-courses/powerhouse.json')],
  ['itaipu-run', () => readJson('docs/itaipu-courses/itaipu-run.json')],
  ['map-track-v4', () => readJson('tests/fixtures/map-track-v4.json')],
  /* Builder shapes the probes miss: right and left passes, stacks flown
   * high, a split S through a ladder (two openings of one element in a row
   * make a 'wrap' knot), the same flag twice and clearance overrides. */
  ['passes', () => build('passes', [['gate', 5, 20], ['flag', 20, 10, 0, { passSide: 'right' }],
    ['cone', 35, 30, 0, { passSide: 'left' }], ['pole', 50, 20, 0, { passSide: 'right', clearance: 3 }],
    ['doubleStack', 30, 20, 90, { aperture: 1 }], ['waypoint', 15, 32]])],
  ['split-s', () => build('split-s', [['gate', 8, 8], ['ladder', 30, 20, 0, { aperture: 2 }],
    ['ladder', 30, 20, 0, { aperture: 0 }], ['flag', 50, 20], ['gate', 30, 34]])],
  ['flag-twice', () => {
    const t = build('flag-twice', [['gate', 5, 20], ['flag', 30, 20], ['gate', 55, 20]]);
    t.sequence.push(createSequenceEntry(t, t.elements[1].id));
    return t;
  }],
  ['clearances', () => build('clearances', [['gate', 5, 5], ['flag', 20, 5, 0, { clearance: 0.25 }],
    ['flag', 35, 5, 0, { clearance: 0.2500001 }], ['flag', 50, 15, 0, { clearance: 0 }],
    ['cone', 35, 25, 0, { clearance: null }], ['flag', 20, 30, 0, { clearance: 4 }], ['gate', 5, 30]])],
  ['wing-pylons', () => build('wing-pylons', [['wideGate5', 80, 60], ['pylon', 200, 80],
    ['pylon', 320, 150, 0, { passSide: 'right' }], ['hoop12', 200, 240], ['pylonPair', 60, 200]], 'wing')],
];

for (const [id, make] of DOCS) {
  cases.push({ id: `doc-${id}`, run: (s) => viaTrackdoc(s, make()) });
}

/* Seeded builder documents: every sequenceable type, random places, yaws,
 * openings, pass sides and clearance overrides, repeated entries, both
 * classes. The builder's own model and faces pass make them, so the knots
 * are the ones a user's track would give. */
const SEQ_TYPES = ['gate', 'flaggedGate', 'doubleStack', 'flaggedDoubleStack', 'ladder', 'tower', 'diveGate',
  'flag', 'cone', 'waypoint', 'pole', 'wideGate3', 'wideGate5', 'hoop175', 'hoop250', 'hoop6', 'flag', 'flag',
  'cone'];
const CLEARANCES = [undefined, undefined, undefined, 0, 0.2, 0.25, 0.26, 0.5, 1, 2.5];

function randomDoc(seed) {
  const r = seeded(seed);
  const wing = r.chance(0.15);
  const t = createTrack(`fuzz ${seed}`, wing ? 'wing' : undefined);
  const { width, depth } = t.field;
  const n = r.int(2, 9);
  for (let i = 0; i < n; i += 1) {
    const type = wing ? r.pick(['wideGate5', 'pylon', 'hoop12', 'gate', 'flag']) : r.pick(SEQ_TYPES);
    /* Some elements clustered within a few metres so flags crowd and pegs
     * overlap; the rest anywhere on the field. */
    const clustered = i > 0 && r.chance(0.3);
    const prev = t.elements[t.elements.length - 1];
    const x = clustered ? prev.position.x + r.range(-6, 6) : r.range(2, width - 2);
    const y = clustered ? prev.position.y + r.range(-6, 6) : r.range(2, depth - 2);
    const e = createElement(t, type, { x: Math.round(x * 4) / 4, y: Math.round(y * 4) / 4 }, r.int(0, 7) * 45);
    t.elements.push(e);
  }
  const m = r.int(2, 10);
  for (let i = 0; i < m; i += 1) {
    const el = r.chance(0.8) && i < t.elements.length ? t.elements[i] : r.pick(t.elements);
    const seq = createSequenceEntry(t, el.id, r.int(0, 2));
    if (seq.passSide) seq.passSide = r.pick(['left', 'right']);
    if (seq.clearance != null && r.chance(0.4)) {
      const c = r.pick(CLEARANCES);
      if (c !== undefined) seq.clearance = c;
    }
    t.sequence.push(seq);
  }
  applyAutoFaces(t);
  return t;
}

for (let chunk = 0; chunk < 8; chunk += 1) {
  cases.push({
    id: `doc-fuzz-${String(chunk).padStart(2, '0')}`,
    run: (s) => {
      for (let k = 0; k < 6; k += 1) {
        const seed = 7100 + chunk * 6 + k;
        s.say('seed', seed);
        viaTrackdoc(s, randomDoc(seed));
      }
    },
  });
}

/* ----------------------------------------------------------------- branch */

cases.push({
  id: 'branch-same-pole',
  run: (s) => {
    /* The same pole passed twice, apart: crowded with itself, no comma. */
    drive(s, 'same pole twice', [gate(-20, 0), peg(0, 0, 1.5, Math.PI / 2), gate(20, 0),
      peg(0, 0, 1.5, Math.PI / 2)]);
    /* Consecutive pegs on one pole: no common tangent, so each falls back
     * to tangents from a point. Equal and unequal radii. */
    drive(s, 'consecutive on one pole', [gate(-20, 0), peg(0, 0, 1.5, Math.PI / 2),
      peg(0, 0, 1.5, -Math.PI / 2), gate(20, 0)]);
    drive(s, 'consecutive on one pole, radii differ', [gate(-20, 3), peg(0, 0, 1.5, Math.PI / 2),
      peg(0, 0, 3, 0), gate(20, -3)]);
    drive(s, 'poles a micron apart', [gate(-20, 0), peg(0, 0, 1.5, Math.PI / 2), peg(1e-7, 0, 1.5, -Math.PI / 2),
      gate(20, 0)]);
  },
});

cases.push({
  id: 'branch-tangent-families',
  run: (s) => {
    /* Overlapping circles: the crossing family is skipped, only same side
     * tangents are left. Same side apexes and opposite side apexes. */
    drive(s, 'overlap same side', [gate(-15, 4), peg(0, 0, 1.5, Math.PI / 2), peg(2, 0, 1.5, Math.PI / 2),
      gate(15, 4)]);
    drive(s, 'overlap opposite sides', [gate(-15, 4), peg(0, 0, 1.5, Math.PI / 2), peg(2, 0, 1.5, -Math.PI / 2),
      gate(15, -4)]);
    /* One circle inside the other: both families skipped. */
    drive(s, 'nested', [gate(-15, 0), peg(0, 0, 4, Math.PI / 2), peg(1, 0, 1, -Math.PI / 2), gate(15, 0)]);
    /* Circles just touching outside and inside: |k| exactly 1. */
    drive(s, 'touching outside', [gate(-15, 4), peg(0, 0, 1.5, Math.PI / 2), peg(3, 0, 1.5, -Math.PI / 2),
      gate(15, -4)]);
    drive(s, 'touching inside', [gate(-15, 0), peg(0, 0, 3, Math.PI / 2), peg(1.5, 0, 1.5, Math.PI / 2),
      gate(15, 0)]);
    /* An S bend and a same side pair well apart: crossing versus outer. */
    drive(s, 'S bend', [gate(-20, 0), peg(-5, 0, 1.5, Math.PI / 2), peg(5, 0, 1.5, -Math.PI / 2), gate(20, 0)]);
    drive(s, 'outer pair', [gate(-20, 5), peg(-5, 0, 1.5, Math.PI / 2), peg(5, 0, 1.5, Math.PI / 2), gate(20, 5)]);
    drive(s, 'three in a row', [gate(-25, 0), peg(-10, 0, 1.5, Math.PI / 2), peg(0, 0, 1.5, -Math.PI / 2),
      peg(10, 0, 1.5, Math.PI / 2), gate(25, 0)]);
    drive(s, 'hairpin', [gate(-20, 2), peg(10, 0, 2, 0), gate(-20, -2)]);
    drive(s, 'graze', [gate(-20, 1.6), peg(0, 0, 1.5, Math.PI / 2), gate(20, 1.6)]);
  },
});

cases.push({
  id: 'branch-peg-ends',
  run: (s) => {
    /* A peg first (its entry references its own apex) and last (its exit
     * does). A reference inside the circle has no tangent and falls back
     * to the apex. */
    drive(s, 'peg first', [peg(0, 0, 1.5, Math.PI / 2), gate(20, 0), gate(20, 20)]);
    drive(s, 'peg last', [gate(-20, 0), gate(-20, 20), peg(0, 0, 1.5, 0)]);
    drive(s, 'peg first and last', [peg(0, 0, 1.5, Math.PI), gate(20, 0), peg(40, 0, 1.5, 0)]);
    drive(s, 'two pegs only', [peg(0, 0, 1.5, Math.PI / 2), peg(10, 0, 1.5, -Math.PI / 2)]);
    drive(s, 'reference inside before', [gate(1, 0), peg(0, 0, 1.5, Math.PI / 2), gate(20, 0)]);
    drive(s, 'reference inside after', [gate(-20, 0), peg(0, 0, 1.5, Math.PI / 2), gate(0.5, 0.5)]);
    drive(s, 'reference on the circle', [gate(1.5, 0), peg(0, 0, 1.5, Math.PI / 2), gate(-1.5, 0)]);
  },
});

cases.push({
  id: 'branch-crowding',
  run: (s) => {
    for (const gap of [4, 4.999999, 5, 5.000001, 6]) {
      drive(s, `slalom ${gap}`, [gate(0, 0), peg(10, 0, 1.5, Math.PI / 2), peg(10 + gap, 0, 1.5, -Math.PI / 2),
        peg(10 + 2 * gap, 0, 1.5, Math.PI / 2), gate(40, 0)]);
    }
    /* Crowding scans every knot, not only neighbours: a peg far down the
     * sequence on a pole next to the first one. */
    drive(s, 'crowded across the lap', [gate(0, 0), peg(10, 0, 1.5, Math.PI / 2), gate(30, 0), gate(30, 20),
      peg(12, 20, 1.5, -Math.PI / 2), gate(0, 20), peg(13, 3, 1.5, Math.PI)]);
    /* A non peg marker near a peg does not crowd it. */
    drive(s, 'waypoint beside a flag', [gate(0, 0), peg(10, 0, 1.5, Math.PI / 2),
      { role: 'marker', x: 12, z: 0, y: 0, radius: 0, poleX: 12, poleZ: 0 }, gate(30, 0)]);
  },
});

cases.push({
  id: 'branch-peg-test',
  run: (s) => {
    /* What makes a marker a peg: role, radius strictly over 0.25, and both
     * pole coordinates neither null nor undefined. */
    const base = { role: 'marker', x: 0, z: 1.5, y: 0, radius: 1.5, poleX: 0, poleZ: 0 };
    const variants = {
      'radius 0.25': { radius: 0.25 },
      'radius 0.2500001': { radius: 0.2500001 },
      'radius 0': { radius: 0 },
      'radius NaN': { radius: NaN },
      'radius missing': { radius: undefined },
      'poleX null': { poleX: null },
      'poleZ undefined': { poleZ: undefined },
      'pole at -0': { poleX: -0, poleZ: -0 },
      'role wrap': { role: 'wrap' },
      'role finish': { role: 'finish' },
      'role unknown': { role: 'start' },
      'role missing': { role: undefined },
      'role aperture with pole': { role: 'aperture' },
    };
    for (const [name, change] of Object.entries(variants)) {
      drive(s, name, [gate(-15, 0), { ...base, ...change }, gate(15, 0)]);
    }
    const absent = { role: 'marker', x: 0, z: 1.5, y: 0, radius: 1.5 };
    drive(s, 'pole absent', [gate(-15, 0), absent, gate(15, 0)]);
  },
});

cases.push({
  id: 'branch-lanes',
  run: (s) => {
    const ulp = (v, dir) => {
      const b = new Float64Array([v]);
      const i = new BigInt64Array(b.buffer);
      i[0] += BigInt(dir);
      return b[0];
    };
    const heights = [0, 1.75, ulp(1.75, -1), ulp(1.75, 1), 2, ulp(2, -1), ulp(2, 1), 2.25, ulp(2.25, -1),
      ulp(2.25, 1), 2.29, 5];
    /* First cue alone: highM decides. */
    for (const h of heights) {
      drive(s, `first at ${h}`, [gate(0, 0, h), wrap(30, 0), gate(60, 0, 0.762), wrap(90, 0)]);
    }
    /* Second cue from each start: the band decides. Gates 30 m apart so
     * every arrow has room. */
    for (const start of [0.762, 2.29]) {
      for (const h of heights) {
        drive(s, `from ${start} to ${h}`, [gate(0, 0, start), gate(30, 0, h), gate(60, 0, start), wrap(90, 0)]);
      }
    }
    /* Missing, null and NaN heights. */
    drive(s, 'y missing', [{ role: 'aperture', x: 0, z: 0, radius: 0 }, gate(30, 0, 3), wrap(60, 0)]);
    drive(s, 'y null', [gate(0, 0, null), gate(30, 0, 3), wrap(60, 0)]);
    drive(s, 'y NaN', [gate(0, 0, NaN), gate(30, 0, 3), gate(60, 0, NaN), wrap(90, 0)]);
    drive(s, 'y NaN after high', [gate(0, 0, 3), gate(30, 0, NaN), gate(60, 0, 0), wrap(90, 0)]);
    /* A climb whose arrow is refused by the 5 m keep out: the state still
     * moves, and the next gate does not re-announce it. */
    drive(s, 'refused cue is consumed', [gate(0, 0, 0), gate(9, 0, 3), gate(12, 0, 3), wrap(80, 0)]);
    /* A sawtooth inside the band says nothing after the first gate. */
    drive(s, 'sawtooth in band', Array.from({ length: 8 }, (_, i) => gate(i * 20, (i % 2) * 6, i % 2 ? 2.2 : 1.8)));
  },
});

cases.push({
  id: 'branch-arrows',
  run: (s) => {
    /* An approach point that misses every hole but sits within 4.2 m of a
     * pole, so only the flag test rejects it and the next offset is tried. */
    drive(s, 'approach near a flag', [gate(-40, 0), peg(-14, 6, 1.5, -Math.PI / 2), gate(0, 0, 3), wrap(30, 0)]);
    /* Every approach offset blocked, the past cue offset used. */
    drive(s, 'approach all blocked', [gate(-40, 0), gate(-13.8, 0), gate(-10.3, 0), gate(-6.8, 0), gate(0, 0, 3),
      wrap(30, 0)]);
    /* Every offset blocked, no arrow at all. */
    drive(s, 'no position', [gate(-40, 0), gate(-13.8, 0), gate(-10.3, 0), gate(-6.8, 0), gate(0, 0, 3),
      gate(2.6, 0, 3)]);
    /* At the start: each startAhead offset blocked in turn. */
    drive(s, 'start ahead blocked once', [gate(0, 0), gate(2.2, 0.5), wrap(40, 0)]);
    drive(s, 'start ahead blocked twice', [gate(0, 0), gate(2.2, 0.5), gate(4.5, 0.5), wrap(40, 0)]);
    drive(s, 'start ahead all blocked', [gate(0, 0), gate(2.2, 0.5), gate(4.5, 0.5), gate(7.5, 0.5), wrap(40, 0)]);
    drive(s, 'start ahead near a flag', [gate(0, 0), peg(4, 3.5, 1.5, -Math.PI / 2), wrap(60, 0)]);
    /* The cue's along line position exactly at startS and a hair over. */
    drive(s, 'cue past startS', [wrap(-1.6, 0), gate(0, 0, 0), wrap(60, 0)]);
    drive(s, 'cue just before startS', [wrap(-1.5, 0), gate(0, 0, 0), wrap(60, 0)]);
    /* Out and back: past 70 m along, the return leg passes within 14 m of
     * the first arrow, so run candidates are refused and retried. */
    drive(s, 'run refused by keep out', [gate(0, 0), wrap(40, 0), wrap(40, 5), wrap(-60, 5)]);
    /* Long straight: run arrows every 70 m. */
    drive(s, 'long straight', [gate(0, 0), wrap(400, 0)]);
    /* Long straight with no gate: run arrows with one lane by default. */
    drive(s, 'no cues', [wrap(0, 0), wrap(300, 0)]);
    /* A run candidate inside a gate hole and next to a flag. */
    drive(s, 'run through holes', [gate(0, 0), gate(70.2, 0), peg(140, 2, 1.5, -Math.PI / 2), gate(212, 0),
      wrap(300, 0)]);
    /* High all along: run arrows carry two lanes. */
    drive(s, 'high straight', [gate(0, 0, 3), wrap(250, 0)]);
  },
});

cases.push({
  id: 'branch-numbers',
  run: (s) => {
    drive(s, 'negative zero', [gate(-0, -0, -0), wrap(-0, 10), peg(-0, 20, 1.5, -0), gate(-0, 40)]);
    drive(s, 'NaN x first', [gate(NaN, 0), wrap(10, 0), gate(20, 0)]);
    drive(s, 'NaN z middle', [gate(0, 0), wrap(10, NaN), gate(20, 0)]);
    drive(s, 'NaN z middle long', [gate(0, 0), wrap(40, 0), wrap(50, NaN), gate(120, 0, 3), wrap(200, 0)]);
    drive(s, 'NaN last', [gate(0, 0), wrap(40, 0), gate(NaN, NaN)]);
    drive(s, 'NaN pole', [gate(-15, 0), { role: 'marker', x: 0, z: 1.5, y: 0, radius: 1.5, poleX: NaN, poleZ: 0 },
      gate(15, 0)]);
    drive(s, 'NaN apex', [gate(-15, 0), { role: 'marker', x: NaN, z: 1.5, y: 0, radius: 1.5, poleX: 0, poleZ: 0 },
      gate(15, 0)]);
    drive(s, 'NaN pegs adjacent', [gate(-15, 0), peg(0, 0, 1.5, NaN), peg(10, 0, 1.5, 1), gate(25, 0)]);
    drive(s, 'far from origin', [gate(1e6, 1e6), peg(1e6 + 20, 1e6, 1.5, Math.PI / 2), gate(1e6 + 40, 1e6)]);
    drive(s, 'string coordinates', [gate('0', '0'), wrap('10', '0'), gate('20', '5')]);
    /* Extra fields on a knot are ignored. */
    drive(s, 'extra fields', [{ ...gate(0, 0), elementId: 'el-1', poleX: 3 }, wrap(20, 0)]);
  },
});

/* ------------------------------------------------------------------ patch */

/* A course with gates, pegs (crowded and not), heights both sides of the
 * band and a long run, so every GUIDE key it reads has something to move. */
const PATCH_KNOTS = [gate(0, 0), peg(20, 0, 1.5, Math.PI / 2), peg(24, 0, 1.5, -Math.PI / 2), gate(40, 0, 2.29),
  peg(60, 15, 1.5, 0), gate(40, 30, 1.8), wrap(-80, 30), gate(-80, 0, 0.762), finish(0, 0)];

const PATCHES = [
  ['sample', { sample: 0.7 }],
  ['dash', { dash: 2 }],
  ['gap', { gap: 1 }],
  ['dashMin', { dashMin: 2 }],
  ['weld', { weld: 2 }],
  ['tailMin', { tailMin: 0.3 }],
  ['pegRadius', { pegRadius: 1.5 }],
  ['holeGate', { holeGate: 4 }],
  ['holeFlag', { holeFlag: 3 }],
  ['approach', { approach: 3 }],
  ['approachStep', { approachStep: 1 }],
  ['pastCue', { pastCue: 9 }],
  ['startAhead', { startAhead: [10, 1] }],
  ['startS', { startS: 50 }],
  ['longRun', { longRun: 20 }],
  ['runRetry', { runRetry: 7 }],
  ['highM', { highM: 1 }],
  ['highBand', { highBand: 0.6 }],
  ['flagArrowClear', { flagArrowClear: 12 }],
  ['wrapCluster', { wrapCluster: 3 }],
  ['arrowClear', { arrowClear: 40 }],
  ['arrowClearRun', { arrowClearRun: 1 }],
  ['wrapSpan', { wrapSpan: Math.PI / 3 }],
  /* The tessellation keys nothing reads: changing them changes nothing. */
  ['unread', {
    dashW: 9, arcW: 9, arrowLen: 9, arrowW: 9, arrowShaft: 9, arrowNotch: 9, pairGap: 9, markerClearance: 9,
  }],
];

for (const [id, patch] of PATCHES) {
  cases.push({
    id: `patch-${id}`,
    run: (s) => {
      s.say('patch', patch);
      patched(patch, () => drive(s, 'course', PATCH_KNOTS));
    },
  });
}

cases.push({
  id: 'patch-startAhead-in-place',
  run: (s) => {
    /* The array is read live too: an edit inside it counts. */
    const old = GUIDE.startAhead.slice();
    GUIDE.startAhead[0] = 12;
    try {
      drive(s, 'course', PATCH_KNOTS);
    } finally {
      GUIDE.startAhead.splice(0, GUIDE.startAhead.length, ...old);
    }
  },
});

cases.push({
  id: 'patch-unreachable',
  run: (s) => {
    /* A 432 degree comma window keeps fewer than three points in front of
     * the pole, which is the only way into the seven point fallback. */
    patched({ wrapSpan: 2.4 * Math.PI }, () => {
      drive(s, 'comma fallback', [gate(-15, 0), peg(0, 0, 0.3, Math.PI / 2), gate(15, 0)]);
      drive(s, 'comma fallback right', [gate(-15, 0), peg(0, 0, 0.3, -Math.PI / 2), gate(15, 0)]);
    });
    /* With no welding, a repeated point is a zero length segment, which
     * the resampler skips. */
    patched({ weld: 0 }, () => drive(s, 'zero length segment', [gate(0, 0), wrap(5, 0), wrap(5, 0), gate(10, 0)]));
    /* A negative tailMin puts a tail sample on top of the last one, the
     * only way to a zero length tail heading. */
    patched({ tailMin: -1 }, () => drive(s, 'zero tail', [gate(0, 0), wrap(0.7, 0)]));
  },
});

cases.push({
  id: 'patch-restored',
  run: (s) => {
    /* Every patch above put GUIDE back: the table is as it was. */
    s.say('GUIDE', GUIDE);
  },
});

/* ------------------------------------------------------------------- fuzz */

const ROLES = ['aperture', 'aperture', 'aperture', 'marker', 'marker', 'marker', 'wrap', 'finish', 'start', ''];
const RADII = [0, 0.25, 0.26, 0.5, 1, 1.5, 1.5, 1.5, 2, 3, 5];

function randomKnots(r) {
  const n = r.int(2, 12);
  const knots = [];
  let x = r.range(-30, 30);
  let z = r.range(-20, 20);
  for (let i = 0; i < n; i += 1) {
    /* Mostly a walk of a few to tens of metres, sometimes a jump, sometimes
     * almost on top of the last knot. */
    const step = r.pick([0.02, 0.3, 3, 8, 15, 15, 25, 60]);
    const a = r.range(0, Math.PI * 2);
    x += step * Math.cos(a);
    z += step * Math.sin(a);
    const role = r.pick(ROLES);
    const y = r.pick([0, 0.762, 1.8, 2.0, 2.2, 2.29, 3.8, undefined]);
    const k = { role, x, z, y, radius: 0 };
    if (role === 'marker' && r.chance(0.85)) {
      const radius = r.pick(RADII);
      /* Sometimes reuse the previous pole, sometimes sit within a few
       * metres of it, so pegs share, overlap and crowd. */
      const last = knots[knots.length - 1];
      let px = x;
      let pz = z;
      if (last && last.poleX != null && r.chance(0.25)) {
        px = last.poleX;
        pz = last.poleZ;
      } else if (last && last.poleX != null && r.chance(0.3)) {
        px = last.poleX + r.range(-4, 4);
        pz = last.poleZ + r.range(-4, 4);
      }
      const side = r.range(0, Math.PI * 2);
      k.poleX = px;
      k.poleZ = pz;
      k.radius = radius;
      k.x = px + radius * Math.cos(side);
      k.z = pz + radius * Math.sin(side);
    }
    if (y === undefined) delete k.y;
    knots.push(k);
  }
  return knots;
}

for (let chunk = 0; chunk < 25; chunk += 1) {
  cases.push({
    id: `fuzz-${String(chunk).padStart(2, '0')}`,
    run: (s) => {
      const r = seeded(0x6d1de + chunk);
      for (let k = 0; k < 20; k += 1) drive(s, `list ${k}`, randomKnots(r));
    },
  });
}

goldenMain('guide:golden', FIXTURE, cases);
