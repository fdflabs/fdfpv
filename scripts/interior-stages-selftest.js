/*
 * interior-stages-selftest.js: The Interior's Mission 1, The Old War,
 * flown headless on the real room by scripted pilots (docs/campaign/
 * interior/TECH-NEEDS.md N6, N17, N20; MISSIONS.md M1). npm run
 * interior:stages.
 *
 *   data       the mission lints clean: its stages are the script's
 *              checkpoints, every radio line is MISSIONS.md's and every
 *              M1 and shared line is used, every route, point, item, set,
 *              site, class and dial it names exists
 *   the gate   the live room refuses it ('unreleased'), a dev room starts
 *              it; another map and a public room refuse it
 *   solo       one pilot flies it to the end: launch, Alpha and Bravo
 *              captured, the teacher's house, the motorcycle classified
 *              civilian, the discovery window, the pair followed through
 *              a soft loss, the opening (PERSON OF INTEREST) and a hard
 *              threshold, the camp at standoff (its alertness never
 *              rising), the mark refused from the wrong side and taken
 *              once the tarp moves, the dispersal, home: won, two stars,
 *              its flag; no tracker line heard
 *   orbit      a pilot circling the pair at 150 m, as a fixed wing must,
 *              over each of the three concealment routes: no hard
 *              threshold (Mission 1's is 60 s), no soft fail
 *   lag        the opening stages flown again with every message 300 ms
 *              late: every decision at the same room ms
 *   squad      five pilots: the seeded deal, the trackers' own lines, a
 *              low pass alerting the camp (the early dispersal and its
 *              line), four trackers watching the four ways out: the third
 *              star and its flag
 *   fails      three hard thresholds (the soft fail) and the restart from
 *              its checkpoint, captures kept and stars capped at two; the
 *              boundary's warnings to the crossing pilot alone and the
 *              fail after them; the ISR down with nobody else up, and
 *              down with a tracker still up (a line, no fail)
 *
 * The world is track WORLD's (src/share/interior/ops.js over the shared
 * ground, src/share/ops/missions.js worldFor).
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

import { MISSIONS, grounded, worldFor } from '../src/share/ops/missions.js';
import { stagesOf } from '../src/share/war/stages.js';
import { resolve } from '../src/share/ops/stages.js';
import { roleOf } from '../src/share/ops/roles.js';
import { G } from '../src/share/interior/missions/interior-1.js';
import { RESTART_STARS } from '../edge/rooms/ops.js';
import { M1_CLOCK, sunsetMs } from '../src/share/interior/clock.js';
import {
  aimAt, check, finish, opsRoom,
} from './lib/opsroom.js';

const W = worldFor('interior');
/* The mission as the room flies it: its heights made absolute. */
const M = grounded(MISSIONS['interior-1'], W);
const BASE = [...M.points['pista-cero'].at, M.z0];
const HARD_S = M.contacts.find((x) => x.id === 'pair-a').track.hard;
const ROOM = { world: W, map: 'interior', devMissions: true };

console.log('data');
{
  const doc = readFileSync(new URL('../docs/campaign/interior/MISSIONS.md', import.meta.url), 'utf8');
  const table = new Set([...doc.matchAll(/^\| (int1?-[a-z0-9-]+) \|/gm)].map((x) => x[1]).filter((id) => /^int1-|^int-/.test(id)));
  const used = new Set();
  const routes = new Set();
  const dialsOf = (v) => (v && typeof v === 'object' && !Array.isArray(v) && v.dial ? M.dials[v.dial].map((d) => v.map[d]) : [v]);
  const radios = (r) => [r].flat().flatMap(dialsOf).filter((x) => typeof x === 'string');
  for (const st of stagesOf(M)) {
    for (const c of st.cues ?? []) {
      radios(c.radio).forEach((x) => used.add(x));
      for (const s of c.spawn ?? []) {
        dialsOf(s.route).forEach((x) => routes.add(x));
        dialsOf(s.alt).forEach((x) => x && routes.add(x));
      }
      for (const mv of c.move ?? []) {
        dialsOf(mv.route).forEach((x) => routes.add(x));
      }
    }
  }
  for (const r of [M.lines.boundary.warning, M.lines.boundary.final, M.lines.fail, M.lines.take, M.lines.downed, ...M.lost.map((l) => l.radio)]) {
    used.add(r);
  }
  const unknown = [...used].filter((x) => !table.has(x));
  const unused = [...table].filter((x) => !used.has(x));
  check('every radio line the mission names is in MISSIONS.md\'s tables', !unknown.length, unknown.join());
  check('every M1 and shared line in MISSIONS.md is used', !unused.length, unused.join());
  check('its stages are the script\'s five checkpoints, in order', stagesOf(M).map((s) => s.id).join()
    === 'M1_CP_START,M1_CP_AIRBORNE,M1_CP_BRAVO_COMPLETE,M1_CP_CONTACT_FOUND,M1_CP_CAMP_FOUND');
  const missing = [...routes].filter((id) => {
    try {
      W.poseOnRoute(id, 0);
      return false;
    } catch {
      return true;
    }
  });
  check(`every route it names is in the world (${routes.size})`, !missing.length, missing.join());
  const sets = new Set(M.items.map((x) => x.set));
  const text = JSON.stringify(M.stages);
  const named = (re) => [...text.matchAll(re)].map((x) => x[1]);
  check('every point it names exists', [...named(/"(?:zone|landed|dwell|point)":"([^"]+)"/g)].every((p) => M.points[p]));
  check('every item set it names exists', [...named(/"set":"([^"]+)"/g)].every((x) => sets.has(x)));
  check('every item it names exists', [...named(/"captured":"([^"]+)"/g)].every((x) => M.items.some((i) => i.id === x)));
  const tos = stagesOf(M).flatMap((st) => (st.cues ?? []).flatMap((c) => [c.classify ?? []].flat().map((k) => k.to)));
  check('every class it classifies to is the campaign\'s', tos.length > 0 && tos.every((x) => M.classes.includes(x)), tos.join());
  check('every site it names exists', [...named(/"alert":"([^"]+)"/g)].every((x) => M.sites.some((s) => s.id === x)));
  check('three stars, the script\'s optionals', M.stars.map((s) => s.id).join() === 'symbol,camp,eyes');
  check('no faction reaches a view: the contacts carry it in data only', M.contacts.every((c) => typeof c.faction === 'string'));
}

console.log('the gate');
{
  const live = opsRoom(M, { ...ROOM, devMissions: false });
  check('the live room refuses Mission 1: unreleased', live.errors(0).at(-1)?.error === 'unreleased' && live.view(0) === null);
  const dev = opsRoom(M, ROOM);
  check('a dev room starts it', dev.view(0)?.state === 'countdown' && dev.view(0).mission === 'interior-1' && dev.view(0).campaign === 'interior');
  const other = opsRoom(M, { ...ROOM, map: 'alps' });
  check('another map refuses it', other.errors(0).at(-1)?.error === 'map');
  const pub = opsRoom(M, { ...ROOM, start: false });
  pub.r.meta.public = true;
  pub.say(0, { type: 'ops', op: 'start', mission: 'interior-1' });
  check('a public room refuses it (P0: private rooms only)', pub.socks[0].got.some((m) => m.type === 'refused' && m.why === 'private'));
}

/* ---------------------------------------------------------- the pilot */

const dist = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

/* A scripted pilot: flies toward `target` at `v` m/s (a target may be a
 * function of room ms), aims its camera at `aim` (a point or a function)
 * with `th` (tanHalf), airborne while `air`. */
function pilot(e, i, start) {
  const c = {
    p: start.slice(), target: start.slice(), v: 60, air: false, crashed: false, aim: null, th: 0.5, last: null,
  };
  e.paths[i] = (t) => {
    const dt = c.last == null ? 0 : (t - c.last) / 1000;
    c.last = t;
    const tg = typeof c.target === 'function' ? c.target(t) : c.target;
    if (tg) {
      const d = dist(c.p, tg);
      const step = Math.min(d, c.v * dt);
      if (d > 0) {
        c.p = c.p.map((v, k) => v + ((tg[k] - v) * step) / d);
      }
    }
    return c.p;
  };
  e.air[i] = () => c.air;
  e.crashed[i] = () => c.crashed;
  e.cams[i] = (t) => {
    let a = typeof c.aim === 'function' ? c.aim(t) : c.aim;
    a = a && !Array.isArray(a) ? a.aim : a;
    return a ? { aim: a, tanHalf: c.th, aspect: 16 / 9 } : null;
  };
  return c;
}

/* Fly until pred() or `ms` have passed; false (and a failed check) when
 * it never came. */
function until(e, pred, ms, label) {
  const end = e.clock + ms;
  while (e.clock < end) {
    if (pred()) {
      return true;
    }
    e.fly(e.clock + 100);
  }
  const ok = pred();
  if (!ok) {
    check(`reached: ${label}`, false, `state ${e.view(0)?.state} stage ${e.view(0)?.stage?.id} at ${e.clock}`);
  }
  return ok;
}

const stageIs = (e, id) => () => e.view(0)?.stage?.id === id || ['won', 'lost'].includes(e.view(0)?.state);
const heard = (e, i, id) => e.cues(i).some((c) => [c.radio].flat().includes(id));
const contact = (e, id) => e.view(0).contacts.find((c) => c.id === id);
const itemAt = (e, id) => {
  const it = M.items.find((x) => x.id === id);
  return resolve(it.at, e.view(0).dials);
};

/* A still of item `id` (or, for a contact item, of contact `who`): the
 * camera on it, zoomed to `frac` of the frame, a second to settle, then
 * proposed to the room. Returns the room's answer: the grade or the
 * refusal's why. */
function snap(e, i, c, id, { who = null, frac = 0.15, grade = 'clean' } = {}) {
  const it = M.items.find((x) => x.id === id);
  const at = who ? (() => {
    const k = contact(e, who);
    const p = W.poseOnRoute(k.route, e.clock - k.t0);
    return [p.x, p.y, p.z + 0.85];
  }) : () => itemAt(e, id);
  c.aim = who ? aimAt(e, W, who, 0.1, 16 / 9, i) : at();
  c.th = it.size / (2 * frac * dist(c.p, at()));
  e.fly(e.clock + 1200);
  c.th = it.size / (2 * frac * dist(c.p, at()));
  e.fly(e.clock + 600);
  const n = e.view(0).captures.length;
  const errs = e.errors(i).length;
  e.sayLate(i, {
    type: 'ops', op: 'capture', item: id, t: e.clock - 100, grade, framing: { size: frac, off: 0, blur: 0 },
  });
  e.fly(e.clock + 800);
  const got = e.view(0).captures.slice(n).find((x) => x.item === id);
  return got ? got.grade : (e.errors(i).slice(errs).at(-1)?.why ?? 'none');
}

/* Over a point at the survey altitude, south of it by `back` metres. */
const over = (at, back = 500, alt = 550) => [at[0], at[1] - back, M.z0 + alt];

/* Stage 1: off the rail and up; `blind` flies a fixed minute and reads
 * nothing the room says (the lag run). */
function launch(e, c, { blind = false } = {}) {
  c.air = true;
  c.target = [c.p[0], c.p[1], M.z0 + 600];
  if (blind) {
    e.fly(e.clock + 60000);
    return true;
  }
  return until(e, stageIs(e, 'M1_CP_AIRBORNE'), 120000, 'stage 2');
}

/* Stage 2, time scripted (no reading of the view but the dials), so the
 * lag run flies it the same. */
function survey(e, c, i = 0, { teacher = true, moto = true } = {}) {
  if (moto) {
    /* The motorcycle on Ruta Vieja, seen from afar as it passes. */
    c.aim = aimAt(e, W, 'moto-road', 0.01, 16 / 9, i);
    c.th = 0.01;
    e.fly(e.clock + 4000);
  }
  const grades = {};
  for (const id of ['bridge', 'road', 'sheds', 'burned']) {
    c.target = over(itemAt(e, id));
    until(e, () => dist(c.p, c.target) < 2, 400000, `over ${id}`);
    grades[id] = snap(e, i, c, id);
  }
  if (teacher) {
    const h = M.points['teacher-house'];
    c.target = over([...h.at, h.z]);
    until(e, () => dist(c.p, c.target) < 2, 400000, 'over the teacher\'s house');
    c.aim = [h.at[0], h.at[1], h.z];
    c.th = 0.05;
    e.fly(e.clock + 6000);
  }
  for (const id of ['colonia', 'crossing']) {
    c.target = over(itemAt(e, id), 900, 700);
    until(e, () => dist(c.p, c.target) < 2, 400000, `over ${id}`);
    grades[id] = snap(e, i, c, id);
  }
  return grades;
}

/* Stage 3: into the corridor, eyes elsewhere until the discovery window
 * runs out, then on the pair. */
function anomaly(e, c, i = 0, { wait = true } = {}) {
  c.aim = null;
  c.target = [...M.points.corridor.at, M.z0 + 600];
  until(e, () => dist(c.p, c.target) < 2, 400000, 'the corridor');
  if (wait) {
    until(e, () => heard(e, i, 'int1-s3-hold'), 120000, 'the discovery window\'s prompt');
  } else {
    until(e, () => contact(e, 'pair-a'), 60000, 'the pair on the map');
  }
  follow(e, c, i);
  return until(e, stageIs(e, 'M1_CP_CONTACT_FOUND'), 60000, 'stage 4');
}

/* Overhead the pair, camera on pair-a. Straight overhead the pair is
 * hidden at most 36 to 38 s on WORLD's routes; from 150 m off to one side
 * up to 56 s (measured on canopyBlocks every 100 ms of each route), under
 * Mission 1's hard threshold of 60 s (the orbit run below holds it to
 * that). `orbit` circles the pair at that radius instead. */
function follow(e, c, i = 0, { orbit = 0 } = {}) {
  const site = M.sites[0];
  const where = (t) => {
    const k = contact(e, 'pair-a');
    const p = k && W.poseOnRoute(k.route, t - k.t0);
    if (!p) {
      return null;
    }
    /* Overhead, but never inside the camp's standoff: "No low pass". */
    /* A fixed wing's circle about the pair: about 110 m is the Bramor's
     * tightest at 25 m/s and 30 degrees of bank; once round a minute.
     * (Math.cos and sin are the test pilot's, never the room's.) */
    const a = (2 * Math.PI * t) / 60000;
    let [x, y] = [p.x + orbit * Math.cos(a), p.y + orbit * Math.sin(a)];
    const d = Math.sqrt((x - site.at[0]) ** 2 + (y - site.at[1]) ** 2);
    if (d < site.r + 60) {
      x = site.at[0] + ((x - site.at[0]) * (site.r + 60)) / d;
      y = site.at[1] + ((y - site.at[1]) * (site.r + 60)) / d;
    }
    return [x, y, M.z0 + 600];
  };
  c.target = where;
  c.aim = aimAt(e, W, 'pair-a', 0.06, 16 / 9, i);
  c.th = 0.06;
}

function lookAway(e, c, ms) {
  const keep = c.aim;
  c.aim = null;
  e.fly(e.clock + ms);
  c.aim = keep;
}

/* At standoff south of the camp: outside its 400 m, over 300 m. */
const CAMP_SITE = M.sites[0];
const STANDOFF = [CAMP_SITE.at[0], CAMP_SITE.at[1] - 450, CAMP_SITE.z0 + 500];

/* Stage 5's captures at standoff. Returns { grades, alert }. */
function documentCamp(e, c, i = 0, { symbol = true, personnelFirst = false } = {}) {
  c.target = STANDOFF;
  until(e, () => dist(c.p, STANDOFF) < 2, 400000, 'the standoff');
  let alert = 0;
  const grades = {};
  const watch = () => {
    alert = Math.max(alert, e.view(0).sites.camp.value);
  };
  const order = personnelFirst ? ['shelters', 'motorcycles', 'antenna', 'access'] : ['shelters', 'motorcycles', 'antenna'];
  if (symbol) {
    grades.symbolEarly = snap(e, i, c, 'symbol', { frac: 0.12 });
    watch();
  }
  for (const id of order) {
    grades[id] = snap(e, i, c, id);
    watch();
  }
  if (!personnelFirst) {
    grades.personnel = snap(e, i, c, 'personnel', { who: 'camp-1', frac: 0.06, grade: 'usable' });
    watch();
    grades.access = snap(e, i, c, 'access');
    watch();
  }
  grades.solar = snap(e, i, c, 'solar', { frac: 0.12 });
  watch();
  grades.lookout = snap(e, i, c, 'lookout', { frac: 0.12 });
  watch();
  if (symbol) {
    until(e, () => e.view(0).flags && e.r.ops.match.choices?.tarp, 30000, 'the tarp moved');
    grades.symbol = snap(e, i, c, 'symbol', { frac: 0.12 });
    watch();
  }
  return { grades, alert };
}

/* Home: Pista Cero, down, on the ground. */
function home(e, c) {
  c.aim = null;
  const pad = M.points['pista-cero'].at;
  c.target = [pad[0], pad[1], M.z0 + 300];
  until(e, () => dist(c.p, c.target) < 2, 600000, 'over Pista Cero');
  c.target = [pad[0], pad[1], M.z0];
  until(e, () => c.p[2] < M.z0 + 0.5, 60000, 'down');
  c.air = false;
  return until(e, () => e.view(0).state !== 'live', 30000, 'the end');
}

/* ------------------------------------------------------------- solo */

console.log('solo: one pilot flies The Old War to the end');
const SOLO = {};
{
  const e = opsRoom(M, { ...ROOM, n: 1 });
  const c = pilot(e, 0, BASE);
  e.fly(e.clock + 7000);
  check('one pilot: dealt the ISR', e.view(0).roles.held[e.seatOf(0)].join() === 'isr');
  check('stage 1 opens at the go: the launch card and the mission rule', e.view(0).stage?.id === 'M1_CP_START'
    && e.view(0).cards.map((x) => `${x.id}:${x.tier}`).join() === 'launch:primary,rule:rule');
  launch(e, c);
  e.fly(e.clock + 300);
  check('over 500 m: stage 2, the telemetry lines', heard(e, 0, 'int1-s1-clean') && heard(e, 0, 'int1-s1-proceed'));
  const grades = survey(e, c);
  check('Alpha and Bravo captured clean', Object.values(grades).every((g) => g === 'clean'), JSON.stringify(grades));
  check('the first Alpha still: Ibarra\'s line to the ISR', heard(e, 0, 'int1-s2-hold'));
  check('Alpha complete, the burned field\'s exchange', heard(e, 0, 'int1-s2-alpha') && heard(e, 0, 'int1-s2-burned-5'));
  check('the camera held on the schoolteacher\'s house: the exchange', heard(e, 0, 'int1-s2-teacher-4'));
  const moto = contact(e, 'moto-road');
  check('the motorcycle on the road: discovered, then classified civilian by the script', moto && moto.cls === 'civilian', JSON.stringify(moto));
  until(e, stageIs(e, 'M1_CP_BRAVO_COMPLETE'), 30000, 'stage 3');
  check('Bravo complete: stage 3, Charlie', e.view(0).stage.id === 'M1_CP_BRAVO_COMPLETE' && heard(e, 0, 'int1-s2-charlie'));
  SOLO.atStage3 = e.clock;
  anomaly(e, c);
  check('the discovery window ran out: hold, the bearing, a search area', heard(e, 0, 'int1-s3-bearing'));
  check('discovered: the exchange to "Follow.", the search area gone', heard(e, 0, 'int1-s3-follow') && !e.view(0).search.some((s) => s.id === 'pair-search'));
  const pair = e.view(0).contacts.filter((x) => x.group === 'pair');
  check('the pair: UNKNOWN on discovery (each one seen)', pair.some((x) => x.cls === 'unknown') && pair.every((x) => x.cls === 'unknown' || (x.cls === null && x.state === 'undiscovered')), JSON.stringify(pair.map((x) => [x.id, x.cls, x.state])));
  check('stage 4: observe, and the mission rule', e.view(0).cards.map((x) => x.id).join() === 'observe,rule');
  /* The soft path: eyes away past 20 s, then back. */
  e.fly(e.clock + 10000);
  lookAway(e, c, 26000);
  check('lost 8 s: welcome to the Interior; 20 s: lost, LAST KNOWN POSITION', heard(e, 0, 'int1-s4-welcome') && heard(e, 0, 'int1-s4-lost')
    && e.view(0).search.some((s) => s.id === 'pair-lkp'));
  until(e, () => heard(e, 0, 'int1-s4-goodeye'), 120000, 'reacquired');
  check('reacquired: "There. Good eye.", the search area gone', heard(e, 0, 'int1-s4-there') && !e.view(0).search.some((s) => s.id === 'pair-lkp'));
  check('no hard threshold yet', contact(e, 'pair-a').hards === 0);
  until(e, () => contact(e, 'pair-a').cls === 'poi', 1500000, 'the opening');
  check('at the opening, seen: armed, possible, PERSON OF INTEREST', heard(e, 0, 'int1-s4-know') && contact(e, 'pair-b').cls === 'poi');
  check('the canopy\'s gaps were enough: no hard threshold on the way', contact(e, 'pair-a').hards === 0, `hards ${contact(e, 'pair-a').hards}`);
  e.fly(e.clock + 20000);
  const before = contact(e, 'pair-a');
  lookAway(e, c, 65000);
  const moved = contact(e, 'pair-a');
  const hardLine = resolve(M.stages[3].cues.find((x) => x.when?.lost && x.when.s === HARD_S).radio, e.view(0).dials);
  check(`lost past ${HARD_S} s: moved to its alternate, its line, a search area there`, moved.route.includes('-alt-') && moved.hards === 1 && heard(e, 0, hardLine)
    && e.view(0).search.some((s) => s.id === 'pair-alt'), `${before.route} -> ${moved.route} ${hardLine}`);
  until(e, stageIs(e, 'M1_CP_CAMP_FOUND'), 900000, 'stage 5');
  check('the pair at the camp\'s edge: stage 5', e.view(0).stage?.id === 'M1_CP_CAMP_FOUND');
  const camp = documentCamp(e, c);
  SOLO.grades = { ...grades, ...camp.grades };
  check('the mark from the wrong side, before the tarp moves: refused', camp.grades.symbolEarly === 'angle', camp.grades.symbolEarly);
  check('the camp documented: five captures', ['shelters', 'motorcycles', 'antenna', 'personnel', 'access'].every((id) => ['clean', 'usable'].includes(camp.grades[id])), JSON.stringify(camp.grades));
  check('the tarp moved: the mark taken from any side', ['clean', 'usable'].includes(camp.grades.symbol), camp.grades.symbol);
  check('the mark: its flag, the archive exchange, the camp COLUMN-LINKED with its label', e.view(0).flags.M1_SYMBOL_CAPTURED === true
    && heard(e, 0, 'int1-s5-remembers') && contact(e, 'camp-1').cls === 'column-linked' && contact(e, 'camp-1').label === 'ops.label.new_column_unconfirmed'
    && contact(e, 'pair-a').cls === 'column-linked');
  check('an orbit at standoff never alerted the camp', camp.alert === 0, `${camp.alert}`);
  check('the required intel in: the dispersal, its exchange', e.r.ops.match.choices?.dispersal?.value === 'started' && heard(e, 0, 'int1-s5-understand'));
  check('the early alert line was not said', !heard(e, 0, 'int1-s5-early'));
  check('the return card shows once the camp is documented', e.view(0).cards.some((x) => x.id === 'rtb'));
  home(e, c);
  const v = e.view(0);
  SOLO.view = v;
  check('home: won, landed', v.state === 'won' && v.why === 'landed', `${v.state} ${v.why}`);
  check('two stars: the mark and eyes open, not the whole camp alone', v.result.stars === 2 && v.result.starIds.join() === 'symbol,eyes', `${JSON.stringify(v.result)} ${JSON.stringify(SOLO.grades)}`);
  check('the result carries the flag for the campaign', v.result.flags.M1_SYMBOL_CAPTURED === true && !v.result.flags.M1_CAMP_FULLY_DOCUMENTED);
  check('a solo ISR heard no tracker line', !e.cues(0).some((x) => [x.radio].flat().some((r) => typeof r === 'string' && r.startsWith('int1-tr-'))));
  check(`within the light: ${Math.round((v.endAt - v.goAt) / 60000)} min of ${Math.round(sunsetMs(M1_CLOCK) / 60000)} to sunset`, v.endAt - v.goAt < sunsetMs(M1_CLOCK));
}

/* ------------------------------------------------------------- lag */

console.log('lag: stages 1 to 3 again, every message 300 ms late');
{
  const run = (lagMs) => {
    const e = opsRoom(M, { ...ROOM, n: 1, lagMs });
    const c = pilot(e, 0, BASE);
    e.fly(e.clock + 7000);
    launch(e, c, { blind: true });
    survey(e, c, 0, { moto: false });
    e.fly(e.clock + 3000);
    return e;
  };
  const a = run(0);
  const b = run(300);
  const log = (e) => JSON.stringify(e.r.ops.log.filter((x) => x.what !== 'capture'));
  check('the same captures at the same room ms', JSON.stringify(a.r.ops.match.captures.map(({ at: _a, ...x }) => x)) === JSON.stringify(b.r.ops.match.captures.map(({ at: _a, ...x }) => x)));
  check('every cue, exit and stage entry at the same room ms', log(a) === log(b) && a.view(0).stage.id === 'M1_CP_BRAVO_COMPLETE', `${log(a).slice(-300)} vs ${log(b).slice(-300)}`);
}

/* ------------------------------------------------------------- orbit */

/* Seeds whose dial takes each concealment route: west, mid, east. */
const ORBIT_SEEDS = [0.1, 0.05, 0.5];
console.log('orbit: a correct pilot circling the pair at 150 m never trips the hard threshold');
for (const seed of ORBIT_SEEDS) {
  const e = opsRoom(M, { ...ROOM, n: 1, seed });
  const c = pilot(e, 0, BASE);
  e.fly(e.clock + 7000);
  launch(e, c);
  survey(e, c, 0, { teacher: false, moto: false });
  until(e, stageIs(e, 'M1_CP_BRAVO_COMPLETE'), 30000, 'stage 3');
  anomaly(e, c, 0, { wait: false });
  follow(e, c, 0, { orbit: 150 });
  until(e, stageIs(e, 'M1_CP_CAMP_FOUND'), 1800000, 'the camp after the orbit');
  const route = e.r.ops.match.checkpoint?.contacts?.find((x) => x.id === 'pair-a')?.route ?? '';
  const log = e.r.ops.log.filter((x) => x.what === 'cue' && x.stage === 'M1_CP_CONTACT_FOUND');
  const hardLines = log.filter((x) => [x.radio].flat().some((r) => typeof r === 'string' && r.startsWith('int1-s4-hard'))).length;
  check(`dial ${e.view(0).dials.conceal}: the whole route to the camp, no hard threshold, no soft fail`, e.view(0).stage?.id === 'M1_CP_CAMP_FOUND'
    && e.view(0).state === 'live' && hardLines === 0 && route.startsWith('conceal-') && !route.includes('-alt-'), `${e.view(0).state} ${e.view(0).why} hard lines ${hardLines} ${route}`);
}

/* ------------------------------------------------------------- squad */

console.log('squad: five pilots, the trackers, a low pass, the whole camp');
{
  const e = opsRoom(M, { ...ROOM, n: 5, seed: 0.6 });
  const held = e.view(0).roles.held;
  const isr = [0, 1, 2, 3, 4].find((i) => held[e.seatOf(i)].includes('isr'));
  const trackers = [0, 1, 2, 3, 4].filter((i) => i !== isr);
  check('five pilots: one ISR, four trackers', trackers.length === 4 && trackers.every((i) => roleOf(held[e.seatOf(i)][0]) === 'tracker'));
  const c = pilot(e, isr, BASE);
  const tc = trackers.map((i, k) => {
    const p = pilot(e, i, BASE);
    p.air = true;
    p.target = [...G(4 + k, 2), M.z0 + 700];
    return p;
  });
  e.fly(e.clock + 7000);
  const v0 = e.view(isr);
  check('the view is the same for every pilot', [0, 1, 2, 3, 4].every((i) => JSON.stringify(e.view(i).roles) === JSON.stringify(v0.roles)));
  launch(e, c);
  survey(e, c, isr, { teacher: false, moto: false });
  until(e, stageIs(e, 'M1_CP_BRAVO_COMPLETE'), 30000, 'stage 3');
  anomaly(e, c, isr, { wait: false });
  until(e, stageIs(e, 'M1_CP_CAMP_FOUND'), 1800000, 'stage 5');
  check('the trackers heard their assignment and picket lines, the ISR did not', trackers.every((i) => heard(e, i, 'int1-tr-assign') && heard(e, i, 'int1-tr-picket'))
    && !heard(e, isr, 'int1-tr-assign'));
  check('everyone heard the story', [isr, ...trackers].every((i) => heard(e, i, 'int1-s3-follow')));
  /* Each tracker takes one way out: until the dispersal it waits high
   * off to the side; then it flies over the two going that way, camera
   * wide on the middle of them, as Ibarra's split line asks. */
  const dirs = ['n', 'e', 's', 'w'];
  tc.forEach((p, k) => {
    const goers = (t) => e.view(0).contacts.filter((x) => x.route.startsWith(`out-${dirs[k]}-`) && x.state !== 'vanished' && t >= x.t0)
      .map((x) => W.poseOnRoute(x.route, t - x.t0)).filter(Boolean);
    const middle = (t) => {
      const ps = goers(t);
      return ps.length ? [ps.reduce((a, q) => a + q.x, 0) / ps.length, ps.reduce((a, q) => a + q.y, 0) / ps.length, ps.reduce((a, q) => a + q.z, 0) / ps.length] : null;
    };
    const wait = p.target;
    p.target = (t) => {
      const m = middle(t);
      return m ? [m[0], m[1], m[2] + 400] : wait;
    };
    p.aim = (t) => {
      const m = middle(t);
      return m ? [m[0], m[1], m[2] + 0.8] : null;
    };
    p.th = 0.15;
  });
  /* The ISR: personnel first, then a low pass. */
  c.target = STANDOFF;
  until(e, () => dist(c.p, STANDOFF) < 2, 400000, 'the standoff');
  const pers = snap(e, isr, c, 'personnel', { who: 'camp-1', frac: 0.06, grade: 'usable' });
  check('personnel captured before the low pass', ['usable', 'clean'].includes(pers), pers);
  c.target = [CAMP_SITE.at[0], CAMP_SITE.at[1] - 50, CAMP_SITE.z0 + 150];
  c.aim = null;
  until(e, () => e.view(0).sites.camp.level === 'high', 120000, 'the camp alerted');
  check('a low pass: the camp\'s alertness to high', e.view(0).sites.camp.at.high != null);
  e.fly(e.clock + 1000);
  check('the early dispersal and its line, before the intel was in', heard(e, isr, 'int1-s5-early') && e.r.ops.match.choices?.dispersal?.value === 'started');
  check('the trackers told to take a way out each', trackers.every((i) => heard(e, i, 'int1-tr-split')));
  const camp = documentCamp(e, c, isr, { symbol: false, personnelFirst: true });
  check('documentation goes on after the dispersal', ['shelters', 'motorcycles', 'antenna', 'access'].every((id) => ['clean', 'usable'].includes(camp.grades[id])), JSON.stringify(camp.grades));
  until(e, () => e.view(0).flags.M1_CAMP_FULLY_DOCUMENTED === true, 600000, 'the last of the camp gone, watched');
  check('every camp contact watched to where it disappeared: the flag', e.view(0).contacts.filter((x) => x.group === 'camp').every((x) => x.state === 'vanished'));
  home(e, c);
  const v = e.view(0);
  check('won, with the whole camp\'s star', v.state === 'won' && v.result.starIds.includes('camp') && v.result.flags.M1_CAMP_FULLY_DOCUMENTED === true, JSON.stringify(v.result));
}

/* ------------------------------------------------------------- fails */

console.log('fails: three hard thresholds, then the checkpoint');
{
  const e = opsRoom(M, { ...ROOM, n: 1, seed: 0.4 });
  const c = pilot(e, 0, BASE);
  e.fly(e.clock + 7000);
  launch(e, c);
  survey(e, c, 0, { teacher: false, moto: false });
  until(e, stageIs(e, 'M1_CP_BRAVO_COMPLETE'), 30000, 'stage 3');
  anomaly(e, c, 0, { wait: false });
  const captures = e.view(0).captures.length;
  for (let k = 1; k <= 3 && e.view(0).state === 'live'; k += 1) {
    until(e, () => contact(e, 'pair-a').state === 'seen', 300000, `seen before loss ${k}`);
    lookAway(e, c, 65000);
    e.fly(e.clock + 300);
  }
  const v = e.view(0);
  check('three hard thresholds before the camp: lost, the soft fail', v.state === 'lost' && v.why === 'track', `${v.state} ${v.why}`);
  check('the fail line to everybody', heard(e, 0, 'int1-fail'));
  check('its checkpoint is the stage it was lost in', v.checkpoint?.stage === 'M1_CP_CONTACT_FOUND');
  e.say(0, {
    type: 'ops', op: 'start', mission: 'interior-1', from: 'checkpoint',
  });
  e.fly(e.clock + 7000);
  const r = e.view(0);
  check('restarted there: stage 4 again, the captures before it kept, the pair back on its route', r.stage?.id === 'M1_CP_CONTACT_FOUND' && r.restarted === 'M1_CP_CONTACT_FOUND'
    && r.captures.length === captures && !contact(e, 'pair-a').route.includes('-alt-') && contact(e, 'pair-a').hards === 0,
  `${r.stage?.id} ${r.restarted} ${r.captures.length}/${captures} ${JSON.stringify(contact(e, 'pair-a'))}`);
  check('the same dials as before', JSON.stringify(r.dials) === JSON.stringify(v.dials));
  follow(e, c);
  until(e, stageIs(e, 'M1_CP_CAMP_FOUND'), 1800000, 'stage 5 after the restart');
  documentCamp(e, c);
  home(e, c);
  const w = e.view(0);
  check(`won from the restart: stars capped at ${RESTART_STARS}`, w.state === 'won' && w.result.stars <= RESTART_STARS && w.result.restarted === 'M1_CP_CONTACT_FOUND', JSON.stringify(w.result));
}

console.log('fails: the boundary');
{
  const e = opsRoom(M, { ...ROOM, n: 2 });
  const a = pilot(e, 0, BASE);
  const b = pilot(e, 1, BASE);
  b.air = true;
  b.target = [...M.points['pista-cero'].at, M.z0 + 600];
  e.fly(e.clock + 7000);
  a.air = true;
  a.target = [-7900, M.points['pista-cero'].at[1], M.z0 + 600];
  until(e, () => heard(e, 0, 'int-boundary'), 120000, 'the warning');
  check('outside: the warning to the pilot crossing, not the other', !heard(e, 1, 'int-boundary') && e.view(0).boundary[e.seatOf(0)] === 'warning');
  until(e, () => heard(e, 0, 'int-boundary-final'), 20000, 'the last warning');
  check('15 s on: the last warning, to that pilot alone', !heard(e, 1, 'int-boundary-final'));
  until(e, () => e.view(0).state === 'lost', 20000, 'the fail');
  check('15 s after the last warning: the mission lost', e.view(0).why === 'boundary');
}

console.log('fails: the ISR down');
{
  const e = opsRoom(M, { ...ROOM, n: 1 });
  const c = pilot(e, 0, BASE);
  e.fly(e.clock + 7000);
  launch(e, c);
  c.crashed = true;
  c.air = false;
  until(e, () => e.view(0).state === 'lost', 5000, 'the fail');
  check('the ISR down, nobody else up: lost for lost capability', e.view(0).why === 'isr-down' && heard(e, 0, 'int-fail-function'));
  const f = opsRoom(M, { ...ROOM, n: 2 });
  const held = f.view(0).roles.held;
  const isr = [0, 1].find((i) => held[f.seatOf(i)].includes('isr'));
  const ci = pilot(f, isr, BASE);
  const ct = pilot(f, 1 - isr, BASE);
  ct.air = true;
  ct.target = [...M.points['pista-cero'].at, M.z0 + 600];
  f.fly(f.clock + 7000);
  launch(f, ci);
  ci.crashed = true;
  ci.air = false;
  f.fly(f.clock + 3000);
  check('the ISR down with a tracker still up: the line, no fail', f.view(0).state === 'live' && heard(f, 1 - isr, 'int-lost-aircraft'));
}

finish();
