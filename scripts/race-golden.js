/*
 * race-golden.js: src/game/race.js held to the exact outputs it gave when
 * tests/fixtures/race-golden.json was written. npm run race:golden.
 *
 * lap-selftest, build-selftest, crash-rules-selftest and rooms-selftest say
 * what the race should do, case by case, in words. This says that it still
 * does precisely what it did, because the leaderboard decides whether a
 * posted lap is legal through this file (src/game/verify.js checkLap) and a
 * lap time that moves by one ulp is a different lap.
 *
 * The races are built the way their callers build them: real track
 * documents through courseFromDocument and gatesFromCourse (verify.js) and
 * raceGatesOf (src/builder/course.js), field and wing classes, map tracks
 * with tilted, rolled, round and marker gates, gates shaped like the
 * scene's built in circuit (heading, pitch and flyOrder, several apertures
 * a station), and hand made awkward ones. Each is raced threaded (a quad)
 * and scored (a plane, PLANE_REACH), as main.js does, and flown by a seeded
 * pilot: straight through, off centre, grazing the edge, missing, backwards,
 * along the plane, hovering in the box, teleporting, with disallowed
 * frames, voided laps, resets, record key swaps and the writes callers make
 * (next, prevSimMs, leaving, call). After every call the stream holds the
 * return value and every public field and query a caller reads (spec
 * section 10), the flash text at the expiry boundaries, the storage reads
 * and writes, and whether the arrays callers hold were replaced or grown.
 *
 * Segment cases drive the pass tests directly through one gate whose frame
 * is the world's, so the crossing parameter comes back exactly as the
 * lap start time, at every threshold of the box, disc and reach tests.
 *
 * Storage is an in-memory stub installed per case; requestIdleCallback and
 * setTimeout are captured per case so the deferred record write runs when
 * the case says, not after the process has moved on.
 *
 * The record is written with --record; see scripts/lib/golden.js. Write it
 * again only on purpose, with the reason in the pull request.
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

import { readFileSync } from 'node:fs';
import * as raceModule from '../src/game/race.js';
import {
  NEAR_POINTS, PASS_POINTS, PLANE_REACH, Race, gateAcross, gateUp, passScore, structureGap, travelAxis,
} from '../src/game/race.js';
import { checkLap, gatesFromCourse, raceFromDocument } from '../src/game/verify.js';
import { courseFromDocument } from '../src/game/trackdoc.js';
import { addGate, newCourse, qAxis, qMul, raceGatesOf } from '../src/builder/course.js';
import { createElement, createSequenceEntry, createTrack, aperturesOf, toPlain } from '../src/trackbuilder/model.js';
import { applyAutoFaces } from '../src/trackbuilder/faces.js';
import { encodeGhost } from '../src/share/ghostdata.js';
import { setLocale, useLocale } from '../src/strings/index.js';
import { syntheticLap } from '../tests/lib/synthlap.js';
import { mapTrackDocument } from '../tests/lib/maptrack.js';
import { canon, goldenMain, seeded } from './lib/golden.js';

const FIXTURE = new URL('../tests/fixtures/race-golden.json', import.meta.url);
const ROOT = new URL('../', import.meta.url);

/* Flash text goes through the string table, so a share of the flights runs
 * in Spanish: a rewrite must look up the same keys with the same vars. */
await useLocale('es');
setLocale('en');

/* ------------------------------------------------------------------ */
/* Host globals, per case. */

const realSetTimeout = globalThis.setTimeout;

/*
 * The storage a case sees. mode 'absent' is Node as it is (no localStorage,
 * no requestIdleCallback: the write goes to setTimeout), 'idle' a browser
 * with requestIdleCallback, 'timeout' a browser without it, 'throws' a
 * private window whose storage throws on every call. Every access is
 * logged, because when the race reads and writes the record is part of
 * what a host sees.
 */
function makeHost(mode, initial = {}) {
  const log = [];
  const queue = [];
  const map = new Map(Object.entries(initial));
  const storage = {
    getItem(k) {
      log.push(['get', k]);
      if (mode === 'throws') throw new Error('storage refused');
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      log.push(['set', k, v]);
      if (mode === 'throws') throw new Error('storage refused');
      map.set(k, String(v));
    },
  };
  return {
    log,
    queue,
    map,
    install() {
      if (mode === 'absent') {
        delete globalThis.localStorage;
      } else {
        globalThis.localStorage = storage;
      }
      if (mode === 'idle') {
        globalThis.requestIdleCallback = (fn, opts) => {
          log.push(['idle', opts]);
          queue.push(fn);
        };
      } else {
        delete globalThis.requestIdleCallback;
        globalThis.setTimeout = (fn, ms) => {
          log.push(['timeout', ms]);
          queue.push(fn);
          return 0;
        };
      }
    },
    uninstall() {
      delete globalThis.localStorage;
      delete globalThis.requestIdleCallback;
      globalThis.setTimeout = realSetTimeout;
    },
    flush() {
      const fns = queue.splice(0);
      for (const fn of fns) fn();
      return fns.length;
    },
    drain() {
      return log.splice(0);
    },
  };
}

/* Runs a case body inside its host and locale, and always puts both back,
 * so one case can never leak into the next. */
function hosted(mode, initial, locale, body) {
  return (s) => {
    const host = makeHost(mode, initial);
    setLocale(locale);
    host.install();
    try {
      body(s, host);
    } finally {
      host.uninstall();
      setLocale('en');
    }
  };
}

/* ------------------------------------------------------------------ */
/* What a caller reads back. */

const FLASH_PROBES = [0, 1, 1399, 1399.999, 1400, 1401, 1799, 1800, 2599, 2600, 2601, 10000];

/*
 * Everything spec section 10 lists, the queries main.js makes every frame,
 * and the identity of the arrays and objects a caller may hold across
 * frames: `splits` grows in place inside a lap and is replaced at the
 * timing gate, and `lastSplits` IS the finished lap's array.
 */
function snapshot(race, simMs, wallMs, prevRefs) {
  const q = (fn) => {
    try {
      return fn();
    } catch (err) {
      return `threw ${String(err && err.message)}`;
    }
  };
  const snap = {
    freestyle: race.freestyle,
    timingIdx: race.timingIdx,
    hasTimingIdx: Object.prototype.hasOwnProperty.call(race, 'timingIdx'),
    reach: race.reach,
    passDepth: race.passDepth,
    key: race.key,
    bestMs: race.bestMs,
    recordAtStart: race.recordAtStart,
    next: race.next,
    leaving: race.leaving,
    prevSimMs: race.prevSimMs,
    call: race.call,
    lap: race.lap,
    lapStartMs: race.lapStartMs,
    lastLapMs: race.lastLapMs,
    splits: race.splits,
    lastSplits: race.lastSplits,
    laps: race.laps,
    log: race.log,
    runScore: race.runScore,
    lastLapScore: race.lastLapScore,
    gatesLength: race.gates.length,
    nextSceneIndex: q(() => race.nextSceneIndex()),
    followSceneIndex: q(() => race.followSceneIndex()),
    currentLapMs: [q(() => race.currentLapMs(simMs)), q(() => race.currentLapMs(simMs + 123.5))],
    bestLapMs: q(() => race.bestLapMs()),
    bestThreeMs: q(() => race.bestThreeMs()),
    flash: FLASH_PROBES.map((d) => q(() => race.flashText(wallMs + d))),
    lastSplitsIsSplits: race.lastSplits === race.splits,
  };
  if (prevRefs) {
    /* At a lap's close the running list itself becomes lastSplits. */
    snap.lastSplitsWasSplits = race.lastSplits === prevRefs.splits;
  }
  if (prevRefs) {
    snap.same = {
      gates: race.gates === prevRefs.gates,
      splits: race.splits === prevRefs.splits,
      lastSplits: race.lastSplits === prevRefs.lastSplits,
      log: race.log === prevRefs.log,
      laps: race.laps === prevRefs.laps,
      call: race.call === prevRefs.call,
    };
  }
  return snap;
}

function refsOf(race) {
  return {
    gates: race.gates, splits: race.splits, lastSplits: race.lastSplits, log: race.log, laps: race.laps, call: race.call,
  };
}

/*
 * A watcher that says the state after every call, but writes "unchanged"
 * when it is the same line as last time: the stream stays lossless and the
 * dump stays readable.
 */
function watcher(s, race, host) {
  let last = null;
  let refs = refsOf(race);
  return {
    say(simMs, wallMs) {
      const io = host.drain();
      if (io.length) s.say('  storage', io);
      const line = canon(snapshot(race, simMs, wallMs, refs));
      refs = refsOf(race);
      if (line === last) {
        s.lines.push('  state unchanged');
      } else {
        s.lines.push(`  state ${line}`);
        last = line;
      }
    },
  };
}

/* The gate records exactly as spec 3.3 shapes them, plus the identities
 * callers and the builder depend on: given axes are used as is, and the
 * caller's apertures array is the record's. */
function sayConstruction(s, race, inputs) {
  s.say('gates', race.gates);
  s.say('ownKeysPublic', ['freestyle', 'gates', 'timingIdx', 'key', 'bestMs', 'next', 'lap', 'lapStartMs', 'lastLapMs',
    'prevSimMs', 'splits', 'lastSplits', 'log', 'laps', 'lastLapScore', 'runScore', 'call', 'leaving', 'recordAtStart',
    'passDepth', 'reach'].map((k) => Object.prototype.hasOwnProperty.call(race, k)));
  if (!inputs) return;
  s.say('identity', race.gates.map((g) => {
    const src = inputs[g.idx];
    return {
      apertures: g.apertures === src.apertures,
      aperture0: g.apertures[0] === (src.apertures ? src.apertures[0] : src.aperture),
      ax: src.axes ? g.ax === src.axes.across : null,
      ay: src.axes ? g.ay === src.axes.up : null,
      az: src.axes ? g.az === src.axes.travel : null,
    };
  }));
}

/* ------------------------------------------------------------------ */
/* Courses, built the way their callers build them. */

const FIELD_TYPES = ['gate', 'flaggedGate', 'doubleStack', 'flaggedDoubleStack', 'ladder', 'tower', 'diveGate', 'flag', 'cone', 'pole'];

/* A field track as the track builder writes one (schemaVersion 3), read
 * the way verify.js reads it: courseFromDocument, then gatesFromCourse. */
function fieldDocument(rng, cls, n, types) {
  const t = createTrack(`golden ${cls}`, cls);
  const w = t.field.width;
  const d = t.field.depth;
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const x = w / 2 + Math.cos(a) * w * rng.range(0.2, 0.38);
    const y = d / 2 + Math.sin(a) * d * rng.range(0.2, 0.38);
    const type = types ? types[i % types.length] : rng.pick(FIELD_TYPES);
    const el = createElement(t, type, { x, y }, rng.chance(0.5) ? 0 : rng.int(0, 7) * 45);
    t.elements.push(el);
    const openings = Math.max(1, aperturesOf(el).length);
    const k = openings > 1 && rng.chance(0.5) ? rng.int(0, openings - 1) : 0;
    t.sequence.push(createSequenceEntry(t, el.id, k));
    if (openings > 1 && rng.chance(0.3)) t.sequence.push(createSequenceEntry(t, el.id, (k + 1) % openings));
  }
  applyAutoFaces(t);
  return t;
}

/* lap-selftest's wing course, exactly. */
function wingCheckDocument() {
  const wing = createTrack('Wing check', 'wing');
  for (const [x, y] of [[100, 75], [300, 75], [300, 225], [100, 225]]) {
    const gate = createElement(wing, 'gate', { x, y }, 0);
    wing.elements.push(gate);
    wing.sequence.push(createSequenceEntry(wing, gate.id));
  }
  applyAutoFaces(wing);
  return wing;
}

const MAP_TYPES = ['gate', 'flaggedGate', 'doubleStack', 'ladder', 'tower', 'wideGate3', 'wideGate5', 'pylonPair', 'pylon',
  'hoop175', 'hoop250', 'hoop30', 'hoop6', 'hoop12', 'hoop20'];

/* A map track built in the world (schemaVersion 4) at poses the builder can
 * place: yawed, tilted into a dive, rolled on its side, and a pylon rounded
 * on either side. */
function mapDocument(rng, n, types) {
  const doc = newCourse(rng.pick(['swiss2', 'alps']), 'golden map');
  const radius = rng.range(25, 90);
  const cx = rng.range(-50, 150);
  const cy = rng.range(100, 700);
  const cz = rng.range(-150, 50);
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const base = { x: cx + radius * Math.cos(a), y: cy + rng.range(-8, 8), z: cz + radius * Math.sin(a) };
    let quat = qAxis(0, 1, 0, Math.atan2(-Math.sin(a), Math.cos(a)) + Math.PI);
    if (rng.chance(0.35)) quat = qMul(quat, qAxis(1, 0, 0, rng.range(-0.9, 0.9)));
    if (rng.chance(0.25)) quat = qMul(quat, qAxis(0, 0, 1, rng.range(-1.6, 1.6)));
    const type = types ? types[i % types.length] : rng.pick(MAP_TYPES);
    addGate(doc, type, base, quat, rng.chance(0.5) ? 'right' : 'left');
  }
  return toPlain(doc);
}

/*
 * Gates shaped like src/render/scene.js hands the shell for the built in
 * circuit: stations round a curve, flyOrder 0, n-1, ... 1, a heading and a
 * pitch, and a ladder station that scores every one of its openings (an
 * apertures array whose first entry is not the primary).
 */
function sceneGates(rng, n) {
  const out = [];
  const r = rng.range(20, 60);
  for (let idx = 0; idx < n; idx += 1) {
    const a = (idx / n) * Math.PI * 2;
    const ladder = rng.chance(0.25);
    const round = rng.chance(0.15);
    const apertures = [];
    const count = ladder ? 3 : 1;
    for (let k = 0; k < count; k += 1) {
      const ap = { centreY: 1.2 + k * 2.1, clearW: rng.pick([1.75, 1.524, 2.45, 3.0]), clearH: rng.pick([1.75, 1.524, 1.2]) };
      if (round) ap.round = true;
      apertures.push(ap);
    }
    const primary = ladder ? 1 : 0;
    out.push({
      position: { x: r * Math.cos(a), y: rng.chance(0.3) ? rng.range(-2, 4) : 0, z: r * Math.sin(a) },
      heading: a + rng.pick([0, Math.PI, 0.3, -0.3]),
      pitch: rng.chance(0.2) ? rng.pick([-Math.PI / 2, -0.6, 0.4]) : (rng.chance(0.5) ? 0 : undefined),
      flyOrder: idx === 0 ? 0 : n - idx,
      apertures: ladder || rng.chance(0.5) ? apertures : undefined,
      aperture: apertures[primary],
      kindName: rng.chance(0.7) ? rng.pick(['standardGate', 'ladder', 'hoop']) : undefined,
      virtual: rng.chance(0.15),
    });
  }
  return out;
}

function readDoc(rel) {
  return JSON.parse(readFileSync(new URL(rel, ROOT), 'utf8'));
}

/* ------------------------------------------------------------------ */
/* The pilot. */

const ADD = (p, v, k) => ({ x: p.x + v.x * k, y: p.y + v.y * k, z: p.z + v.z * k });

/* A gate's frame for flying it: across from what the caller handed in (the
 * record's own copy is not part of the contract callers read), up and
 * travel from the record, as rooms-selftest and synthlap read them. */
function frameOf(race, inputs, i, k) {
  const g = race.gates[i];
  const src = inputs[g.idx];
  const across = src.axes ? src.axes.across : gateAcross(src.heading);
  /* A station with no openings is still flown at, through its base, so the
   * race gets to say it cannot be passed. */
  const ap = g.apertures[k] ?? { centreY: 0, clearW: 1.75, clearH: 1.75 };
  return {
    c: { x: g.x, y: g.y + ap.centreY, z: g.z }, across, up: g.ay, travel: g.az, ap,
  };
}

/* Where across the opening a line goes, in metres from its centre. */
function offsetFor(rng, ap, reach) {
  const hw = ap.clearW / 2;
  const hh = ap.round ? hw : ap.clearH / 2;
  const kind = rng.next();
  if (kind < 0.3) return [0, 0];
  if (kind < 0.6) return [rng.range(-1, 1) * hw * 0.95, rng.range(-1, 1) * hh * 0.95];
  if (kind < 0.75) {
    /* The edge of the scoring hole: the class margin inside the opening,
     * and either side of it. */
    const e = rng.pick([hw - 0.02, hw - 0.02 - 1e-6, hw - 0.02 + 1e-6, hw, hw * 0.999, hw * 1.001]);
    return rng.chance(0.5) ? [rng.chance(0.5) ? e : -e, 0] : [0, (rng.chance(0.5) ? 1 : -1) * (e - hw + hh)];
  }
  if (kind < 0.9 && reach > 0) {
    const f = ap.frame;
    const edge = f && f.kind === 'ring' ? f.r : (f && f.kind === 'box' ? f.hw : hw);
    return [(rng.chance(0.5) ? 1 : -1) * (edge + rng.pick([1, 19.5, 39.9, 40, 40.1, 41, 60])), rng.range(-1, 1) * hh];
  }
  return [(rng.chance(0.5) ? 1 : -1) * hw * rng.range(1.05, 4), rng.range(-1, 1) * hh * 2];
}

const DTS = [0, 1, 4, 16, 16.666666666666668, 33.3, 100, 250, 1000];
const REASONS = ['wrecked', 'carousel', 'weight', 'Gate tap', ''];
const KEYS = ['webfpv.best.quad5.4s', 'webfpv.best.x', 'webfpv.best.cub1400.3s', 'webfpv.bestLapMs', ''];

/*
 * One seeded flight. legs is how many manoeuvres; each is flown in a few
 * frames, and between them the pilot may do what the shell does: void the
 * lap, recover, reset (and set next as main.js does after a carousel
 * swap), swap the record key, clear prevSimMs, or let the deferred record
 * write run.
 */
function fly(s, host, race, inputs, rng, legs, startSim) {
  const w = watcher(s, race, host);
  let t = startSim;
  let wall = rng.pick([0, 5000, 123456.5]);
  let pos = null;
  const n = race.gates.length;

  const step = (curr, dt, allowArg, label) => {
    const prev = pos ?? curr;
    t += dt;
    wall += rng.chance(0.85) ? dt : dt * 2 + 7;
    const before = canon([prev, curr]);
    const args = allowArg === 'omit' ? [prev, curr, t, wall] : [prev, curr, t, wall, allowArg];
    s.say(`update ${label}`, { prev, curr, t, wall, allow: allowArg === 'omit' ? 'omitted' : allowArg });
    s.call('  ->', () => race.update(...args));
    if (canon([prev, curr]) !== before) s.say('  mutated its arguments', [prev, curr]);
    pos = curr;
    w.say(t, wall);
  };
  const allowPick = () => {
    const r = rng.next();
    if (r < 0.88) return 'omit';
    if (r < 0.92) return true;
    return rng.pick([false, null, 0, undefined]);
  };

  w.say(t, wall);
  for (let leg = 0; leg < legs; leg += 1) {
    const ev = rng.next();
    if (ev < 0.03) {
      const reason = rng.pick(REASONS);
      s.call(`voidLap ${JSON.stringify(reason)}`, () => race.voidLap(reason, wall));
      w.say(t, wall);
    } else if (ev < 0.05) {
      const reason = rng.pick(REASONS);
      s.call(`recover ${JSON.stringify(reason)}`, () => race.recover(reason, wall));
      w.say(t, wall);
    } else if (ev < 0.065) {
      s.call('reset', () => race.reset());
      if (n && rng.chance(0.5)) {
        const raceIndex = rng.int(-3, n + 3);
        race.next = (((raceIndex | 0) % n) + n) % n;
        s.say('  set next', race.next);
      }
      w.say(t, wall);
    } else if (ev < 0.08) {
      const key = rng.pick(KEYS);
      s.call(`setRecordKey ${JSON.stringify(key)}`, () => race.setRecordKey(key));
      w.say(t, wall);
    } else if (ev < 0.1) {
      race.prevSimMs = null;
      s.say('set prevSimMs', null);
      w.say(t, wall);
    } else if (ev < 0.11) {
      race.leaving = -1;
      s.say('set leaving', -1);
      w.say(t, wall);
    } else if (ev < 0.12) {
      race.call = null;
      s.say('set call', null);
      w.say(t, wall);
    } else if (ev < 0.14) {
      s.say('flush deferred', host.flush());
      s.say('  stored', [...host.map]);
      w.say(t, wall);
    } else if (ev < 0.15 && n) {
      race.next = rng.int(0, n - 1);
      s.say('set next', race.next);
      w.say(t, wall);
    }
    if (race.freestyle || n === 0) {
      const p = { x: rng.range(-50, 50), y: rng.range(0, 20), z: rng.range(-50, 50) };
      step(p, rng.pick(DTS), allowPick(), 'freestyle');
      continue;
    }

    /* Mostly the gate the race wants; sometimes another one, which must
     * cost nothing and count for nothing. */
    const target = rng.chance(0.8) && race.next >= 0 && race.next < n ? race.next : rng.int(0, n - 1);
    const k = rng.int(0, race.gates[target].apertures.length - 1);
    const fr = frameOf(race, inputs, target, k);
    const [ox, oy] = offsetFor(rng, fr.ap, race.reach);
    const at = (d, sideways = 0) => ADD(ADD(ADD(fr.c, fr.across, ox + sideways), fr.up, oy), fr.travel, d);
    const kind = rng.next();
    const frames = rng.int(1, 8);
    const dt = rng.pick(DTS.slice(1));
    let from;
    let to;
    let label;
    if (kind < 0.55) {
      const depth = rng.pick([0.6, 1.5, 2, 2.5, 6, 30]);
      [from, to, label] = [at(-depth), at(depth), 'through'];
    } else if (kind < 0.65) {
      [from, to, label] = [at(3), at(-3), 'backwards'];
    } else if (kind < 0.72) {
      [from, to, label] = [at(0, -8), at(0, 8), 'along the plane'];
    } else if (kind < 0.8) {
      const lean = rng.range(-3, 3);
      [from, to, label] = [at(-2, -lean), at(2, lean), 'angled'];
    } else if (kind < 0.88) {
      /* In the box and creeping forward, then out: the one gate rule. */
      [from, to, label] = [at(-0.1), at(0.3), 'hover'];
    } else if (kind < 0.94) {
      [from, to, label] = [at(-40), at(40), 'teleport'];
    } else {
      [from, to, label] = [at(-1), at(-1), 'still'];
    }
    /* The transit to the leg's start: one frame, so it may cross other
     * gates on the way, as a real line does. */
    step(from, rng.pick(DTS), allowPick(), 'transit');
    for (let f = 1; f <= frames; f += 1) {
      const u = f / frames;
      const p = { x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u, z: from.z + (to.z - from.z) * u };
      step(p, kind >= 0.88 && kind < 0.94 ? 0 : dt, allowPick(), `${label} g${target} a${k} ${f}/${frames}`);
    }
    if (label === 'hover') {
      step(at(rng.pick([0.4, 0.49, 0.51, 1.9, 2.1, 3])), dt, 'omit', 'hover exit');
    }
  }
  s.say('flush deferred', host.flush());
  s.say('stored', [...host.map]);
  w.say(t, wall);
}

/* Builds a Race and says only that it was built, or what it threw: the
 * instance itself carries internals (margin, suffix, running lap score,
 * flash) that no caller reads and a rewrite may name as it likes. */
function construct(s, label, fn) {
  try {
    const race = fn();
    s.say(label, 'constructed');
    return race;
  } catch (err) {
    s.lines.push(`${label} threw ${JSON.stringify(String(err && err.message))}`);
    return null;
  }
}

/* A race from inputs, its construction said, then flown. */
function raceCase(inputs, trackClass, opts, seed, legs, extra = {}) {
  return (s, host) => {
    const rng = seeded(seed);
    const before = canon(inputs);
    s.say('opts', { trackClass, opts, verifyStyle: Boolean(extra.verifyStyle) });
    const race = construct(s, 'construct', () => new Race(inputs, trackClass, opts));
    if (!race) return;
    sayConstruction(s, race, inputs);
    if (extra.verifyStyle) {
      race.next = race.timingIdx;
      s.say('set next = timingIdx', race.next);
    }
    fly(s, host, race, inputs, rng, legs, rng.pick([0, 0, 1000, 98765.25]));
    if (canon(inputs) !== before) s.say('inputs mutated', inputs);
  };
}

/* ------------------------------------------------------------------ */
/* Segments through one gate whose frame is the world's. */

const IDENT = { across: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, travel: { x: 0, y: 0, z: 1 } };

/*
 * One fresh race per segment: a disallowed frame at sim -0 sets the clock
 * without testing, then the segment at sim 1, so a pass starts the lap at
 * exactly -0 + (1 - -0) * t and lapStartMs is t to the bit, its sign
 * included (a +0 start would fold a -0 crossing into +0).
 */
function segmentRun(s, mk, segs) {
  for (const [a, b] of segs) {
    const race = mk();
    race.update(a, a, -0, 0, false);
    const r = race.update(a, b, 1, 0);
    s.say(`seg ${canon(a)} ${canon(b)}`, {
      r, t: race.lapStartMs, next: race.next, leaving: race.leaving, call: race.call, runScore: race.runScore, flash: race.flashText(0),
    });
  }
}

function boxSegments(hw, hh, depth) {
  const xs = [0, hw, -hw, hw * (1 - 1e-15), hw + 1e-12, -hw - 1e-12, hw * 1.5, -0];
  const ys = [0, hh, -hh, hh + 1e-12, -hh * 1.2];
  const segs = [];
  for (const x of xs) {
    for (const y of ys) {
      segs.push([{ x, y, z: -1 }, { x, y, z: 1 }]);
    }
  }
  const zs = [-depth, depth, -depth - 1e-9, depth + 1e-9, 0, -0, -2 * depth, 2 * depth];
  for (const z0 of zs) {
    for (const z1 of zs) {
      segs.push([{ x: 0, y: 0, z: z0 }, { x: 0, y: 0, z: z1 }]);
    }
  }
  /* Forward travel must exceed 1e-9: at, below and just above it. */
  for (const dz of [1e-9, 1.0000001e-9, 9.99e-10, 2e-9, 0, -1e-9]) {
    segs.push([{ x: 0, y: 0, z: -dz / 2 }, { x: 0, y: 0, z: dz / 2 }]);
  }
  /* A slab with less than 1e-12 of travel is a containment test. */
  for (const d of [0, 1e-13, -1e-13, 1e-12, 9.9e-13]) {
    for (const x of [0, hw, hw + 1e-9, -hw]) {
      segs.push([{ x, y: 0, z: -1 }, { x: x + d, y: d, z: 1 }]);
    }
  }
  /* Slab travel under 1e-12 from a point a hair outside: a containment
   * test refuses it where a clip would have let it in. */
  segs.push([{ x: hw + 2e-13, y: 0, z: -1 }, { x: hw + 2e-13 - 5e-13, y: 0, z: 1 }]);
  segs.push([{ x: 0, y: -hh - 2e-13, z: -1 }, { x: 0, y: -hh - 2e-13 + 5e-13, z: 1 }]);
  segs.push([{ x: hw + 2e-13, y: 0, z: -1 }, { x: hw + 2e-13 - 2e-12, y: 0, z: 1 }]);
  /* Angled lines that clip the thick box but cross z = 0 outside the hole
   * (first contact), and ones that cross inside (midplane). */
  segs.push([{ x: hw - 0.01, y: 0, z: -depth }, { x: hw + 3, y: 0, z: depth }]);
  segs.push([{ x: hw + 0.2, y: 0, z: -depth }, { x: hw - 0.3, y: 0, z: depth }]);
  segs.push([{ x: -hw - 1, y: 0, z: -0.01 }, { x: hw + 1, y: 0, z: 0.01 }]);
  segs.push([{ x: 0, y: hh + 0.1, z: -depth - 1 }, { x: 0, y: hh - 0.1, z: depth + 1 }]);
  segs.push([{ x: 0, y: 0, z: depth }, { x: 0, y: 0, z: depth + 5 }]);
  segs.push([{ x: 0, y: 0, z: -depth - 5 }, { x: 0, y: 0, z: -depth }]);
  segs.push([{ x: 0, y: 0, z: 0.1 }, { x: 0, y: 0, z: 0.2 }]);
  segs.push([{ x: NaN, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }]);
  segs.push([{ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: NaN }]);
  return segs;
}

function discSegments(r) {
  const segs = [];
  for (const x of [0, r, -r, r * (1 + 1e-15), r + 1e-12, r / Math.SQRT2, r * 2]) {
    for (const y of [0, r / Math.SQRT2, r + 1e-12]) {
      segs.push([{ x, y, z: -1 }, { x, y, z: 1 }]);
    }
  }
  for (const [z0, z1] of [[0, 1], [-0, 1], [-1, 0], [-1, -0], [0.01, 1], [1e-12, 1], [5e-324, 1], [-5e-324, 1], [-1, -0.01], [-1e-10, 1e-10], [-5e-10, 5e-10], [1, -1]]) {
    segs.push([{ x: 0, y: 0, z: z0 }, { x: 0, y: 0, z: z1 }]);
  }
  segs.push([{ x: -r * 3, y: 0, z: -4 }, { x: r * 3, y: 0, z: 4 }]);
  segs.push([{ x: r * 0.9, y: r * 0.9, z: -0.5 }, { x: -r * 0.9, y: -r * 0.9, z: 0.5 }]);
  return segs;
}

function crossingsAt(points) {
  return points.map(([x, y]) => [{ x, y, z: -1 }, { x, y, z: 1 }]);
}

/* A single station at the origin facing +z, its aperture `ap`. */
function identGate(ap, extra = {}) {
  return {
    position: { x: 0, y: 0, z: 0 }, axes: IDENT, flyOrder: 0, apertures: [ap], ...extra,
  };
}

/* ------------------------------------------------------------------ */
/* Cases. */

const cases = [];
const add = (id, mode, initial, locale, body) => cases.push({ id, run: hosted(mode, initial, locale, body) });

add('exports', 'absent', {}, 'en', (s) => {
  s.say('exports', Object.keys(raceModule).sort().map((k) => `${k}:${typeof raceModule[k]}`));
  s.say('constants', { PLANE_REACH, PASS_POINTS, NEAR_POINTS });
  s.say('Race.length', Race.length);
  s.say('prototype', Object.getOwnPropertyNames(Race.prototype).filter((k) => ['update', 'setRecordKey', 'reset', 'voidLap',
    'recover', 'nextSceneIndex', 'followSceneIndex', 'currentLapMs', 'bestLapMs', 'bestThreeMs', 'flashText'].includes(k)).sort());
});

/* The axis helpers over the angles the scene, the builder and verify.js
 * hand in, the signed zeros (travelAxis(0, 0).x is -0), and garbage. */
{
  const angles = [0, -0, Math.PI, -Math.PI, Math.PI / 2, -Math.PI / 2, Math.PI / 4, 1, -1, 2 * Math.PI, 1e-300, 1e10, 1e300,
    NaN, Infinity, -Infinity, 0.1, 3, -2.5];
  add('axes-grid', 'absent', {}, 'en', (s) => {
    for (const h of angles) {
      s.call(`gateAcross(${canon(h)})`, () => gateAcross(h));
      for (const p of angles) {
        s.call(`gateUp(${canon(h)},${canon(p)})`, () => gateUp(h, p));
        s.call(`travelAxis(${canon(h)},${canon(p)})`, () => travelAxis(h, p));
      }
    }
    s.call('gateAcross()', () => gateAcross());
    s.call('gateUp(1)', () => gateUp(1));
    s.call('travelAxis(1)', () => travelAxis(1));
    s.say('fresh objects', gateAcross(1) !== gateAcross(1) && gateUp(1, 0) !== gateUp(1, 0) && travelAxis(1, 0) !== travelAxis(1, 0));
  });
  for (let k = 0; k < 4; k += 1) {
    add(`axes-random-${k}`, 'absent', {}, 'en', (s) => {
      const rng = seeded(500 + k);
      for (let i = 0; i < 300; i += 1) {
        const h = rng.range(-7, 7);
        const p = rng.chance(0.3) ? 0 : rng.range(-1.6, 1.6);
        s.say(`${canon(h)} ${canon(p)}`, [gateAcross(h), gateUp(h, p), travelAxis(h, p)]);
      }
    });
  }
}

/* structureGap over every frame the builder makes, the default frame, an
 * unknown kind, and the degenerate ones (no cones, a cone of no height). */
{
  const cone = (x, y0, h, r0, r1) => ({
    x, y0, h, r0, r1,
  });
  const frames = [
    ['default', { clearW: 1.75, clearH: 1.75 }],
    ['default-nullframe', { clearW: 2.45, clearH: 1.2, frame: null }],
    ['box', { clearW: 1.75, clearH: 1.75, frame: { kind: 'box', hw: 0.9, hh: 0.95 } }],
    ['ring', { clearW: 30, clearH: 30, round: true, frame: { kind: 'ring', r: 15.2 } }],
    ['cones', { clearW: 20, clearH: 12, frame: { kind: 'cones', cones: [cone(-10.5, -6, 12, 0.5, 0.1), cone(10.5, -6, 12, 0.5, 0.1)] } }],
    ['cones-empty', { clearW: 20, clearH: 12, frame: { kind: 'cones', cones: [] } }],
    ['cone-left', { clearW: 35, clearH: 12, frame: { kind: 'cone', cone: cone(17.5, -6, 12, 0.6, 0.1), side: 1 } }],
    ['cone-right', { clearW: 35, clearH: 12, frame: { kind: 'cone', cone: cone(-17.5, -6, 12, 0.6, 0.1), side: -1 } }],
    ['cone-noside', { clearW: 35, clearH: 12, frame: { kind: 'cone', cone: cone(3, -6, 12, 0.6, 0.1) } }],
    ['cone-flat', { clearW: 35, clearH: 12, frame: { kind: 'cone', cone: cone(3, 0, 0, 0.6, 0.1), side: 1 } }],
    ['unknown-kind', { clearW: 1.75, clearH: 1.75, frame: { kind: 'blob' } }],
    ['unknown-with-hw', { clearW: 1.75, clearH: 1.75, frame: { kind: 'blob', hw: 1, hh: 2 } }],
  ];
  const pts = [[0, 0], [-0, -0], [0.9, 0], [0.95, 0.95], [1, 1], [-1, -1], [15.2, 0], [15.3, 0], [0, -15.3], [10.5, 0], [11, 6],
    [11, -7], [17.5, 0], [18.2, 0], [16, 0], [-60, 0], [0, 60], [3, 7], [3, -7], [2.4, 0], [3.6, 0], [NaN, 0], [0, NaN],
    [Infinity, 0], [-Infinity, 3], [41, 0], [55.2, 0], [55.3, 0]];
  for (const [name, ap] of frames) {
    add(`structureGap-${name}`, 'absent', {}, 'en', (s) => {
      for (const [x, y] of pts) s.call(`(${canon(x)},${canon(y)})`, () => structureGap(ap, x, y));
      const rng = seeded(name.length * 97 + 3);
      for (let i = 0; i < 150; i += 1) {
        const x = rng.range(-70, 70);
        const y = rng.range(-70, 70);
        s.call(`(${canon(x)},${canon(y)})`, () => structureGap(ap, x, y));
      }
    });
  }
  add('structureGap-throws', 'absent', {}, 'en', (s) => {
    s.call('no ap', () => structureGap(undefined, 0, 0));
    s.call('cones without list', () => structureGap({ frame: { kind: 'cones' } }, 0, 0));
    s.call('cone without cone', () => structureGap({ frame: { kind: 'cone', side: 1 } }, 0, 0));
    s.call('default without sizes', () => structureGap({}, 1, 1));
  });
}

/* passScore at every threshold and either side of it, the shape of a
 * miss, and the throw for an inside hit past the rim. */
add('passScore', 'absent', {}, 'en', (s) => {
  const ss = [0, -0, 1e-9, 0.1, 0.25, 0.25000000000000006, 0.24999999999999997, 0.45, 0.5, 0.6, 0.6000000000000001,
    0.5999999999999999, 0.9, 0.98, 1, 1.0000000000000002, 0.9999999999999999, -0.5, -1, 2, NaN, Infinity, 0.1414, 0.7071];
  for (const v of ss) {
    s.call(`inside s=${canon(v)}`, () => passScore({ t: 0.5, s: v, inside: true, gap: 0 }));
    s.call(`outside s=${canon(v)}`, () => passScore({ t: 0.5, s: v, inside: false, gap: 3 }));
  }
  for (const inside of [undefined, null, 0, 1, '', 'yes']) {
    s.call(`inside=${canon(inside)}`, () => passScore({ s: 0.3, inside }));
  }
  s.call('fresh', () => passScore({ s: 0, inside: true }) !== passScore({ s: 0, inside: true }));
  s.call('no hit', () => passScore(undefined));
  const rng = seeded(77);
  for (let i = 0; i < 300; i += 1) {
    const v = rng.next();
    s.call(`s=${canon(v)}`, () => passScore({ s: v, inside: true }));
  }
});

/* ------------------------------------------------------------------ */
/* Construction: ordering, the timing gate, defaults, identities, the
 * class table, options, and the inputs that throw. */

{
  const ap = () => ({ centreY: 1.2, clearW: 1.75, clearH: 1.75 });
  const g = (fo, extra = {}) => ({
    position: { x: fo === undefined ? 3 : fo * 10, y: 0, z: 0 }, heading: 0.5, flyOrder: fo, aperture: ap(), ...extra,
  });
  const variants = {
    'order-shuffled': () => [g(3), g(0), g(2), g(1)],
    'order-builtin': () => [g(0), g(4), g(3), g(2), g(1)],
    'order-duplicates': () => [g(1), g(0), g(1), g(0), g(2)],
    'order-missing': () => [g(2), g(undefined), g(1)],
    'order-nan': () => [g(NaN), g(1), g(0), g(NaN), g(2)],
    'order-strings': () => [g('2'), g('10'), g('1')],
    'order-negative-fractional': () => [g(0.5), g(-1), g(0.25), g(-0)],
    'virtual-leading': () => [g(0, { virtual: true }), g(1, { virtual: 1 }), g(2), g(3, { virtual: true })],
    'virtual-all': () => [g(0, { virtual: true }), g(1, { virtual: 'yes' })],
    'virtual-falsy': () => [g(0, { virtual: 0 }), g(1, { virtual: '' }), g(2, { virtual: null })],
    'fields-defaults': () => [g(0, { kindName: null, elementId: undefined, apertureIndex: null }), g(1, { kindName: 'ladder', elementId: 0, apertureIndex: 0 })],
    'pitch-null': () => [g(0, { pitch: null }), g(1, { pitch: -0 }), g(2, { pitch: 0.7 }), g(3, { heading: undefined })],
    'axes-given': () => [g(0, { axes: { across: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 }, travel: { x: 1, y: 0, z: 0 } }, heading: 9 }), g(1)],
    'apertures-both': () => [g(0, { apertures: [ap(), { centreY: 3.3, clearW: 1.75, clearH: 1.75 }] }), g(1, { apertures: [] })],
    'one-gate': () => [g(0)],
  };
  for (const [name, mk] of Object.entries(variants)) {
    for (const reach of [0, PLANE_REACH]) {
      add(`ctor-${name}-r${reach}`, 'idle', {}, 'en', raceCase(mk(), 'full', { reach }, name.length * 31 + reach, 14));
    }
  }
  for (const cls of [undefined, 'full', 'wing', 'micro', null, '', 'constructor', 'toString', '__proto__', 'hasOwnProperty', 'WING']) {
    add(`ctor-class-${String(cls)}`, 'idle', {}, 'en', raceCase(variants['order-shuffled'](), cls, {}, 900 + String(cls).length, 16));
  }
  const optSets = [
    ['empty', {}], ['suffix', { recordSuffix: '.map.trk-1' }], ['suffix-null', { recordSuffix: null }],
    ['reach-neg', { reach: -1 }], ['reach-nan', { reach: NaN }], ['reach-tiny', { reach: 1e-9 }], ['reach-string', { reach: '40' }],
    ['reach-inf', { reach: Infinity }], ['reach-null', { reach: null }], ['both', { recordSuffix: '.build.test', reach: PLANE_REACH }],
  ];
  for (const [name, opts] of optSets) {
    add(`ctor-opts-${name}`, 'idle', { 'webfpv.bestLapMs': '9000' }, 'en', raceCase(variants['order-builtin'](), 'full', opts, 300 + name.length, 16));
  }
  add('ctor-opts-omitted', 'idle', {}, 'en', (s) => {
    const r = new Race(variants['order-builtin'](), 'wing');
    sayConstruction(s, r, null);
    s.say('state', snapshot(r, 0, 0, null));
  });
  add('ctor-throws', 'absent', {}, 'en', (s) => {
    construct(s, 'opts null', () => new Race(variants['one-gate'](), 'full', null));
    construct(s, 'gates undefined', () => new Race(undefined));
    construct(s, 'gates null', () => new Race(null));
    construct(s, 'position missing', () => new Race([{ flyOrder: 0, heading: 0, aperture: ap() }]));
    construct(s, 'freestyle with opts null', () => new Race([], 'full', null));
    /* Neither apertures nor aperture: the list is [undefined] and the first
     * test of it throws, from update and from the leaving check alike. */
    const bare = construct(s, 'no aperture', () => new Race([{ position: { x: 0, y: 0, z: 0 }, heading: 0, flyOrder: 0 }]));
    s.say('bare apertures', bare.gates[0].apertures);
    s.call('update on it', () => bare.update({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, 0, 0));
    s.call('nextSceneIndex out of range', () => {
      const r = new Race(variants['one-gate']());
      r.next = 5;
      return r.nextSceneIndex();
    });
    s.call('followSceneIndex out of range', () => {
      const r = new Race(variants['order-shuffled']());
      r.next = 7;
      return r.followSceneIndex();
    });
  });
  /* The race reads apertures live and stores the caller's array, so a
   * caller that changes them after construction changes the scoring. */
  add('ctor-live-apertures', 'idle', {}, 'en', (s, host) => {
    const inputs = [g(0, { apertures: [ap()] }), g(1)];
    const race = new Race(inputs, 'full');
    const w = watcher(s, race, host);
    const fr = frameOf(race, inputs, 0, 0);
    const shot = (x, simMs) => {
      const a = ADD(ADD(fr.c, fr.across, x), fr.travel, -1);
      const b = ADD(ADD(fr.c, fr.across, x), fr.travel, 1);
      race.next = 0;
      race.prevSimMs = null;
      race.update(a, a, simMs, simMs);
      s.call(`shot x=${x}`, () => race.update(a, b, simMs + 10, simMs + 10));
      w.say(simMs + 10, simMs + 10);
    };
    shot(1.2, 0);
    inputs[0].apertures[0].clearW = 3;
    shot(1.2, 100);
    inputs[0].apertures.push({ centreY: 5, clearW: 1.75, clearH: 1.75 });
    inputs[0].apertures[0].clearW = 0.01;
    shot(0, 200);
    inputs[0].apertures[0].round = true;
    inputs[0].apertures[0].clearW = 1.75;
    shot(0.8, 300);
    shot(0.86, 400);
  });
  /* Freestyle: no gates, no clock, no record, every method guarded. */
  for (const [mode, init] of [['absent', {}], ['idle', { 'webfpv.bestLapMs': '1000' }], ['throws', {}]]) {
    add(`freestyle-${mode}`, mode, init, 'en', (s, host) => {
      const race = new Race([], 'wing', { recordSuffix: '.x', reach: PLANE_REACH });
      sayConstruction(s, race, []);
      fly(s, host, race, [], seeded(42), 12, 0);
      s.call('setRecordKey', () => race.setRecordKey('webfpv.best.x'));
      s.call('voidLap', () => race.voidLap('wrecked', 10));
      s.call('flashText', () => [race.flashText(1809), race.flashText(1810)]);
      s.call('recover', () => race.recover('Recover!', 20));
      s.call('reset', () => race.reset());
      s.say('state', snapshot(race, 0, 20, null));
    });
  }
}

/* ------------------------------------------------------------------ */
/* Segments: the box, disc and reach tests at their thresholds. */

{
  for (const cls of ['full', 'wing']) {
    const depth = cls === 'wing' ? 2 : 0.5;
    for (const [w, h] of [[1.75, 1.75], [5, 5], [2.45, 1.2]]) {
      add(`seg-box-${cls}-${w}x${h}`, 'absent', {}, 'en', (s) => {
        const hw = w * 0.5 - 0.02;
        const hh = h * 0.5 - 0.02;
        segmentRun(s, () => new Race([identGate({ centreY: 0, clearW: w, clearH: h })], cls), boxSegments(hw, hh, depth));
      });
    }
    add(`seg-box-${cls}-degenerate`, 'absent', {}, 'en', (s) => {
      for (const [w, h] of [[0.04, 1], [1, 0.04], [0.03, 1], [NaN, 1], [1, undefined], [-1, 1]]) {
        s.say('size', [w, h]);
        segmentRun(s, () => new Race([identGate({ centreY: 0, clearW: w, clearH: h })], cls), [[{ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }]]);
      }
    });
    add(`seg-disc-${cls}`, 'absent', {}, 'en', (s) => {
      for (const w of [1.75, 30, 0.04, 0.03]) {
        s.say('clearW', w);
        segmentRun(s, () => new Race([identGate({ centreY: 0, clearW: w, clearH: w, round: true })], cls), discSegments(w * 0.5 - 0.02));
      }
    });
  }
  add('seg-class-inherited', 'absent', {}, 'en', (s) => {
    for (const cls of ['constructor', 'toString']) {
      s.say('class', cls);
      segmentRun(s, () => new Race([identGate({ centreY: 0, clearW: 1.75, clearH: 1.75 })], cls), boxSegments(0.855, 0.855, 0.5).slice(0, 30));
      segmentRun(s, () => new Race([identGate({ centreY: 0, clearW: 1.75, clearH: 1.75, round: true })], cls), discSegments(0.855).slice(0, 10));
    }
  });
  /* Scored: s and the call at the thresholds, the reach boundary against
   * each frame, and the first aperture that hits winning. */
  const scoredFrames = [
    ['box-default', { centreY: 0, clearW: 2, clearH: 2 }, 1],
    ['box-frame', { centreY: 0, clearW: 2, clearH: 1, frame: { kind: 'box', hw: 1.1, hh: 0.6 } }, 1.1],
    ['ring', { centreY: 0, clearW: 30, clearH: 30, round: true, frame: { kind: 'ring', r: 15.5 } }, 15.5],
    ['round-noframe', { centreY: 0, clearW: 4, clearH: 4, round: true }, 2],
    ['cones', {
      centreY: 0, clearW: 20, clearH: 10, frame: { kind: 'cones', cones: [{ x: -10.5, y0: -5, h: 10, r0: 0.5, r1: 0.5 }, { x: 10.5, y0: -5, h: 10, r0: 0.5, r1: 0.5 }] },
    }, 11],
    ['cone', {
      centreY: 0, clearW: 35, clearH: 10, frame: { kind: 'cone', cone: { x: -17.5, y0: -5, h: 10, r0: 0.5, r1: 0.5 }, side: -1 },
    }, 18],
  ];
  for (const [name, apIn, edge] of scoredFrames) {
    for (const reach of [PLANE_REACH, 5]) {
      add(`seg-reach-${name}-r${reach}`, 'absent', {}, 'en', (s) => {
        const hw = apIn.clearW / 2;
        const hh = apIn.clearH / 2;
        const xs = [0, -0, 0.25 * hw, 0.6 * hw, hw, hw * 0.45, hw * (1 + 1e-15), hw + 1e-9, edge + reach, edge + reach + 1e-9,
          edge + reach - 1e-9, -(edge + reach), edge + reach * 0.5, 1e6, NaN];
        const ptsList = [];
        for (const x of xs) ptsList.push([x, 0], [0, x * (hh / hw)], [x, x]);
        const segs = crossingsAt(ptsList);
        segs.push([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }], [{ x: 0, y: 0, z: -0 }, { x: 0, y: 0, z: 1 }],
          [{ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 0 }], [{ x: 0, y: 0, z: 0.1 }, { x: 0, y: 0, z: 1 }],
          [{ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }], [{ x: 0, y: 0, z: -5e-10 }, { x: 0, y: 0, z: 5e-10 }],
          [{ x: -hw * 3, y: 0, z: -3 }, { x: hw * 3, y: 0, z: 1 }]);
        segmentRun(s, () => new Race([identGate(JSON.parse(JSON.stringify(apIn)))], 'full', { reach }), segs);
      });
    }
  }
  add('seg-apertures-order', 'absent', {}, 'en', (s) => {
    const stack = () => [
      { centreY: 0, clearW: 1, clearH: 1 },
      { centreY: 0, clearW: 3, clearH: 3, round: true },
      { centreY: 2, clearW: 1, clearH: 1 },
    ];
    const pts = [[0, 0], [0.45, 0], [0.7, 0], [1.6, 0], [0, 2], [0, 2.6], [8, 0], [45, 0]];
    for (const reach of [0, PLANE_REACH]) {
      s.say('reach', reach);
      segmentRun(s, () => new Race([{ position: { x: 0, y: 0, z: 0 }, axes: IDENT, flyOrder: 0, apertures: stack() }], 'full', { reach }), crossingsAt(pts));
    }
  });
  /* The local frame: origin raised by centreY along world y (summed before
   * subtracting), then projected on axes that are not the world's. */
  add('seg-frame-origin', 'absent', {}, 'en', (s) => {
    const c = Math.cos(0.3);
    const sn = Math.sin(0.3);
    const axes = { across: { x: c, y: 0, z: -sn }, up: { x: 0, y: 1, z: 0 }, travel: { x: sn, y: 0, z: c } };
    const tilted = { across: gateAcross(1.1), up: gateUp(1.1, 0.7), travel: travelAxis(1.1, 0.7) };
    for (const [name, ax, pos, cy] of [['yawed', axes, { x: 0.1, y: 0.1, z: -0.2 }, 0.2], ['tilted', tilted, { x: 5, y: 2.7, z: -3 }, 1.35]]) {
      s.say('frame', name);
      const mk = (reach) => () => new Race([{ position: { ...pos }, axes: ax, flyOrder: 0, apertures: [{ centreY: cy, clearW: 1.75, clearH: 1.75 }] }], 'full', { reach });
      const segs = [];
      const rng = seeded(name.length);
      for (let i = 0; i < 120; i += 1) {
        const o = { x: pos.x, y: pos.y + cy, z: pos.z };
        const u = rng.range(-1.2, 1.2);
        const v = rng.range(-1.2, 1.2);
        const d = rng.range(0.1, 2);
        segs.push([ADD(ADD(ADD(o, ax.across, u), ax.up, v), ax.travel, -d), ADD(ADD(ADD(o, ax.across, u), ax.up, v), ax.travel, rng.range(-0.3, 2))]);
      }
      segmentRun(s, mk(0), segs);
      segmentRun(s, mk(PLANE_REACH), segs);
    }
  });
  /* Seeded segments in volume round one gate of each kind. */
  const kinds = [
    ['box', { centreY: 0, clearW: 1.75, clearH: 1.75 }],
    ['disc', { centreY: 0, clearW: 1.75, clearH: 1.75, round: true }],
    ['wide', { centreY: 0, clearW: 3, clearH: 1.524 }],
  ];
  for (const [name, apIn] of kinds) {
    for (const [cls, reach] of [['full', 0], ['wing', 0], ['full', PLANE_REACH], ['wing', 10]]) {
      for (let k = 0; k < 2; k += 1) {
        add(`seg-random-${name}-${cls}-r${reach}-${k}`, 'absent', {}, 'en', (s) => {
          const rng = seeded(7000 + name.length * 13 + reach + k * 101 + cls.length);
          const segs = [];
          for (let i = 0; i < 250; i += 1) {
            const span = rng.pick([1, 3, 60]);
            const a = { x: rng.range(-span, span), y: rng.range(-span, span), z: rng.range(-3, 1) };
            const b = rng.chance(0.2)
              ? { x: a.x, y: a.y, z: a.z + rng.range(-0.5, 4) }
              : { x: a.x + rng.range(-2, 2), y: a.y + rng.range(-2, 2), z: a.z + rng.range(-1, 5) };
            segs.push([a, b]);
          }
          segmentRun(s, () => new Race([identGate({ ...apIn })], cls, { reach }), segs);
        });
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* One gate courses: the leaving rule, as build-selftest flies it. */

{
  const oneGates = {
    field: () => {
      const t = createTrack('one', 'full');
      const el = createElement(t, 'gate', { x: 30, y: 20 }, 0);
      t.elements.push(el);
      t.sequence.push(createSequenceEntry(t, el.id));
      applyAutoFaces(t);
      return [gatesFromCourse(courseFromDocument(t)), 'full'];
    },
    map: () => {
      const d = newCourse('swiss2', 'One gate');
      addGate(d, 'gate', { x: 0, y: 100, z: 0 }, qAxis(0, 1, 0, 0));
      return [raceGatesOf(d), 'full'];
    },
    hoop: () => {
      const d = newCourse('swiss2', 'One hoop');
      addGate(d, 'hoop175', { x: 0, y: 100, z: 0 }, qAxis(0, 1, 0, 0.4));
      return [raceGatesOf(d), 'full'];
    },
    ladder: () => [[{
      position: { x: 0, y: 0, z: 0 },
      heading: 0,
      flyOrder: 0,
      apertures: [{ centreY: 1, clearW: 1.75, clearH: 1.75 }, { centreY: 3, clearW: 1.75, clearH: 1.75 }],
    }], 'wing'],
  };
  for (const [name, mk] of Object.entries(oneGates)) {
    for (const reach of [0, PLANE_REACH]) {
      add(`one-gate-${name}-r${reach}`, 'idle', {}, 'en', (s, host) => {
        const [inputs, cls] = mk();
        const race = new Race(inputs, cls, { reach });
        sayConstruction(s, race, inputs);
        const w = watcher(s, race, host);
        const fr = frameOf(race, inputs, 0, 0);
        const at = (d) => ADD(fr.c, fr.travel, d);
        let prev = at(-3);
        let t = 0;
        /* In slowly, through, creep out, come back round to the entry side
         * and through again, then leave again: one lap and no second. */
        const path = [-1, -0.4, -0.1, 0.1, 0.3, 0.45, 0.6, 1.5, 2.5, 1, -0.2, -1.5, -3, -10, -10, -2, -0.3, 0.2, 0.4, 0.7, 2, 3, 4];
        for (const d of path) {
          const curr = at(d);
          t += 500;
          s.call(`update d=${d}`, () => race.update(prev, curr, t, t));
          w.say(t, t);
          prev = curr;
        }
        /* Back round the side, through again: the second lap. */
        for (const d of [-6, -1, 1]) {
          const curr = at(d);
          t += 700;
          s.call(`update d=${d}`, () => race.update(prev, curr, t, t));
          w.say(t, t);
          prev = curr;
        }
        s.say('flush', host.flush());
        s.say('stored', [...host.map]);
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Laps on the clock: closing laps, splits, records, the deferred write,
 * the late key read, timing gate interplay with virtual leaders, and the
 * time text across its odd cases (no carry at 59.996, negative laps). */

{
  const squareGates = (virtualLead) => {
    const out = [];
    const pts = [[0, 0, 0], [40, 0, Math.PI / 2], [40, 40, Math.PI], [0, 40, -Math.PI / 2]];
    pts.forEach(([x, z, h], i) => out.push({
      position: { x, y: 0, z }, heading: h, flyOrder: i, aperture: { centreY: 1.5, clearW: 1.75, clearH: 1.75 }, virtual: virtualLead && i === 0,
    }));
    return out;
  };
  /* Laps at chosen times through the timing gate only (a one gate lap
   * race reduced to the clock), each with chosen duration. */
  const lapTimes = [
    ['plain', [30000, 29000, 31000, 28500, 28500]],
    ['no-carry', [59996, 119996, 60000, 59994.9, 3600000]],
    ['tiny', [0.004, 1, 999.5, 5, 0.5]],
    ['fractional', [16.666666666666668, 33.333333333333336, 123456.789, 98765.4321]],
  ];
  for (const [name, durations] of lapTimes) {
    for (const [mode, locale, init] of [['idle', 'en', {}], ['timeout', 'es', { 'webfpv.bestLapMs': '29999.5' }], ['absent', 'en', {}], ['throws', 'en', {}]]) {
      for (const reach of [0, PLANE_REACH]) {
        add(`clock-${name}-${mode}-r${reach}`, mode, init, locale, (s, host) => {
          const inputs = [{ position: { x: 0, y: 0, z: 0 }, axes: IDENT, flyOrder: 0, apertures: [{ centreY: 0, clearW: 2, clearH: 2 }] }];
          const race = new Race(inputs, 'full', { reach, recordSuffix: '.clock' });
          const w = watcher(s, race, host);
          w.say(0, 0);
          let t = 0;
          const through = (x, label) => {
            race.update({ x, y: 0, z: -5 }, { x, y: 0, z: -5 }, t, t, false);
            s.call(`${label} t=${t}`, () => race.update({ x, y: 0, z: -1 }, { x, y: 0, z: 1 }, t + 2, t + 2));
            race.update({ x, y: 0, z: 1 }, { x, y: 0, z: 30 }, t + 2, t + 2);
            w.say(t + 2, t + 2);
          };
          through(0, 'start');
          durations.forEach((d, i) => {
            t += d;
            through(i % 3 === 0 ? 0 : (i % 3) * 0.6, `lap ${i + 1}`);
            if (i === 1) {
              s.call('setRecordKey before the write runs', () => race.setRecordKey('webfpv.best.late'));
              w.say(t, t);
            }
            if (i % 2 === 1) {
              s.say('flush', host.flush());
              s.say('stored', [...host.map]);
            }
          });
          s.call('voidLap', () => race.voidLap('void', t));
          w.say(t, t);
          s.call('reset', () => race.reset());
          w.say(t, t);
          s.say('flush', host.flush());
          s.say('stored', [...host.map]);
        });
      }
    }
  }
  /* Stored records the race may read: numbers, junk, zero, negatives. */
  add('records-read', 'idle', {}, 'en', (s, host) => {
    const values = ['12345', '0', '-5', 'abc', 'Infinity', ' 42 ', '1e3', '0x10', '', '1e400', '3.5', 'NaN', '-0', '  ', '7e-324'];
    for (const v of values) {
      host.map.clear();
      host.map.set('webfpv.bestLapMs', v);
      host.map.set('webfpv.best.y.sfx', v);
      const race = new Race(squareGates(false), 'full', { recordSuffix: '.sfx' });
      s.say(`stored ${JSON.stringify(v)}`, { bestMs: race.bestMs, recordAtStart: race.recordAtStart });
      race.setRecordKey('webfpv.best.y');
      s.say('  after setRecordKey', { key: race.key, bestMs: race.bestMs, recordAtStart: race.recordAtStart });
      race.setRecordKey(undefined);
      s.say('  undefined key', { key: race.key, bestMs: race.bestMs });
      s.say('  storage', host.drain());
    }
  });
  for (const virtualLead of [false, true]) {
    for (const reach of [0, PLANE_REACH]) {
      add(`square-${virtualLead ? 'virtual-lead' : 'plain'}-r${reach}`, 'idle', {}, 'en', (s, host) => {
        const inputs = squareGates(virtualLead);
        const race = new Race(inputs, 'full', { reach });
        sayConstruction(s, race, inputs);
        const w = watcher(s, race, host);
        let t = 0;
        let prev = null;
        /* Three laps round the square, the second with the third gate
         * flown 3 m wide (a plane's close call, a quad's miss), then a
         * void and a lap after it. */
        for (let lap = 0; lap < 4; lap += 1) {
          for (let i = 0; i < 4; i += 1) {
            const fr = frameOf(race, inputs, i, 0);
            const off = lap === 1 && i === 2 ? 3 : (lap * 0.2);
            for (const d of [-2, 2]) {
              const curr = ADD(ADD(fr.c, fr.across, off), fr.travel, d);
              t += 777.7;
              s.call(`lap ${lap} gate ${i} d=${d}`, () => race.update(prev ?? curr, curr, t, t));
              w.say(t, t);
              prev = curr;
            }
          }
          if (lap === 2) {
            s.call('voidLap', () => race.voidLap('Wrecked', t));
            w.say(t, t);
          }
        }
        s.say('flush', host.flush());
        s.say('stored', [...host.map]);
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Real courses, flown by the seeded pilot, threaded and scored. */

{
  const sources = [];
  for (let k = 0; k < 6; k += 1) {
    sources.push([`field-full-${k}`, () => {
      const rng = seeded(100 + k);
      const c = courseFromDocument(fieldDocument(rng, 'full', rng.int(2, 7), k === 0 ? ['gate'] : null));
      return [gatesFromCourse(c), c.trackClass];
    }]);
    sources.push([`field-wing-${k}`, () => {
      const rng = seeded(200 + k);
      const c = courseFromDocument(fieldDocument(rng, 'wing', rng.int(2, 6), k === 0 ? ['flag', 'gate'] : null));
      return [gatesFromCourse(c), c.trackClass];
    }]);
    sources.push([`map-${k}`, () => {
      const rng = seeded(300 + k);
      return [raceGatesOf(mapDocument(rng, rng.int(1, 6), k === 0 ? ['hoop30', 'pylon', 'pylonPair'] : null)), 'full'];
    }]);
    sources.push([`scene-${k}`, () => {
      const rng = seeded(400 + k);
      return [sceneGates(rng, rng.int(2, 14)), 'full'];
    }]);
  }
  sources.push(['wing-check', () => {
    const c = courseFromDocument(wingCheckDocument());
    return [gatesFromCourse(c), c.trackClass];
  }]);
  sources.push(['ring', () => [raceGatesOf(mapTrackDocument()), 'full']]);
  sources.push(['ring-large', () => [raceGatesOf(mapTrackDocument({ radius: 70, types: ['wideGate5', 'pylonPair', 'wideGate5'] })), 'full']]);
  sources.push(['ring-alps-6', () => [raceGatesOf(mapTrackDocument({ map: 'alps', gates: 6, type: 'hoop250' })), 'full']]);
  for (const rel of ['tests/fixtures/map-track-v4.json', 'scripts/gatecards-track.json', 'docs/itaipu-courses/itaipu-run.json', 'docs/itaipu-courses/powerhouse.json']) {
    sources.push([`doc-${rel.split('/').pop().replace('.json', '')}`, () => {
      const r = raceFromDocument(readDoc(rel));
      return [r.gates, r.trackClass];
    }]);
  }
  let seed = 10000;
  for (const [name, mk] of sources) {
    for (const reach of [0, PLANE_REACH]) {
      /* Odd seeds race under a map's record suffix with a record already
       * stored, and start as verify.js and synthlap do, from the timing
       * gate. */
      for (let k = 0; k < 4; k += 1) {
        seed += 1;
        const mode = ['idle', 'timeout', 'absent', 'idle'][seed % 4];
        const locale = seed % 5 === 0 ? 'es' : 'en';
        const [inputs, cls] = mk();
        const odd = k % 2 === 1;
        add(`flight-${name}-r${reach}-${k}`, mode, odd ? { 'webfpv.bestLapMs.map.golden': '4000' } : {}, locale,
          raceCase(inputs, cls, { reach, recordSuffix: odd ? '.map.golden' : '' }, seed, Math.min(80, 24 + 5 * inputs.length), { verifyStyle: odd }));
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Through the callers: the synthetic lap library and the lap checker,
 * which is what the leaderboard runs. */

{
  const docs = [
    ['ring', () => mapTrackDocument({ name: 'Lap check ring' })],
    ['wing', wingCheckDocument],
    ['wide', () => mapTrackDocument({ radius: 70, types: ['wideGate5', 'pylonPair', 'wideGate3'], name: 'Wide ring' })],
    ['field', () => toPlain(fieldDocument(seeded(4242), 'full', 5, ['gate', 'flaggedGate', 'diveGate', 'flag', 'doubleStack']))],
    ['gatecards', () => readDoc('scripts/gatecards-track.json')],
    ['map-v4', () => readDoc('tests/fixtures/map-track-v4.json')],
  ];
  for (const [name, mk] of docs) {
    add(`callers-${name}`, 'absent', {}, 'en', (s) => {
      const doc = mk();
      for (const opts of [{}, { skip: 1 }, { hoverAfterMs: 1500 }, { speed: 35 }]) {
        const lap = s.call(`syntheticLap ${canon(opts)}`, () => {
          const l = syntheticLap(doc, opts);
          return { lapMs: l.lapMs, splits: l.splits, durationMs: l.durationMs, gates: l.gates, count: l.count };
        });
        if (!lap) continue;
        const full = syntheticLap(doc, opts);
        const bytes = encodeGhost(full);
        s.call('  checkLap', () => checkLap(doc, bytes, full.lapMs ?? full.durationMs));
        s.call('  checkLap as a plane', () => checkLap(doc, bytes, full.lapMs ?? full.durationMs, 'cub1400'));
      }
    });
  }
}

goldenMain('race:golden', FIXTURE, cases);
