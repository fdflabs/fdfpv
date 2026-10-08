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
 *   briefing   a first viewing is never cut: the host's skip refused
 *              'unwatched' until every pilot here has seen the film's cut,
 *              then it starts everybody's countdown at once
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
 *              going overhead when the pair is called lost, over each of
 *              the three concealment routes: no hard threshold (Mission
 *              1's is 75 s), no soft fail; and at 200 m
 *   lag        the opening stages flown again with every message 300 ms
 *              late: every decision at the same room ms
 *   squad      five pilots: the seeded deal, the trackers' own lines, a
 *              low pass alerting the camp (the early dispersal and its
 *              line), four trackers watching the four ways out: the third
 *              star and its flag
 *   guide      what a screen is told to do in each stage of the solo run
 *              (src/share/ops/guide.js): the objective line and its count
 *              from the stage data, the target (the climb, the nearest
 *              item still to capture, the corridor, the pair as told, the
 *              camp, home), the guide's line per role, never a contact the
 *              room has not told; and when a nudge is due
 *   low        the pair followed under 300 m near the camp: the camp's
 *              alertness still nothing when stage 5 opens
 *   camp gone  the camp dispersing on its timer before anything is
 *              documented: nobody walks back into it, the pair keeps its
 *              way out, the mark still opens
 *   restart    a checkpoint restart in stage 4 or 5 from Pista Cero's
 *              rail: the stage's clocks wait for a first timer to fly
 *              back out (no loss line on the way, the camp still there)
 *   light      a first timer at 18, 22 and 25 m/s (a longer track, a
 *              search, time lining up each still) lands with at least
 *              5 min of light left; a dawdler loses it at sunset
 *   the pilots every scripted pilot flew as a Bramor: 25 m/s level at
 *              most, 5 m/s climb
 *   fails      three hard thresholds (the soft fail) and the restart from
 *              its checkpoint, captures kept and stars capped at two; the
 *              boundary's warnings to the crossing pilot alone and the
 *              fail after them; the ISR down with nobody else up, and
 *              down with a tracker still up (a line, no fail)
 *
 * The world is track WORLD's (src/share/interior/ops.js over the shared
 * ground, src/share/ops/missions.js worldFor).
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

import { MISSIONS, grounded, worldFor } from '../src/share/ops/missions.js';
import { stagesOf } from '../src/share/war/stages.js';
import { resolve } from '../src/share/ops/stages.js';
import { roleOf } from '../src/share/ops/roles.js';
import { G, MARKED } from '../src/share/interior/missions/interior-1.js';
import { CAMP_PROPS } from '../src/share/interior/places.js';
import { ALT_POINTS, CONCEAL_POINTS, ROUTES } from '../src/share/interior/routes.js';
import EN from '../src/strings/en.js';
import ES from '../src/strings/es.js';
import { threePosToDoc } from '../src/render/frame.js';
import { RESTART_STARS } from '../edge/rooms/ops.js';
import {
  CLOSE_M, NUDGE_GAP_MS, NUDGE_IDLE_MS, bearingSaid, briefOf, clockOf, createNudger, distLine, focusOf, goalLine, nudgeOf, targetOf,
} from '../src/share/ops/guide.js';
import { M1_CLOCK, sunsetMs } from '../src/share/interior/clock.js';
import { AIRFRAMES } from '../configs/airframes.js';
import {
  aimAt, check, finish, opsRoom,
} from './lib/opsroom.js';

const W = worldFor('interior');
/* The mission as the room flies it: its heights made absolute. */
const M = grounded(MISSIONS['interior-1'], W);
check('Mission 1 names the cut its briefing plays, so a host skip can wait for everyone to have seen it',
  MISSIONS['interior-1'].film?.id === 'int1-intro' && Number.isInteger(MISSIONS['interior-1'].film?.version) && MISSIONS['interior-1'].filmMs > 0);
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
  for (const r of [M.lines.boundary.warning, M.lines.boundary.final, M.lines.fail, M.lines.take, M.lines.downed, ...M.lost.map((l) => l.radio).filter(Boolean), ...M.spotters.flatMap((x) => [x.warn, ...Object.values(x.lines)])]) {
    used.add(r);
  }
  /* The guide's: each objective's brief, and the nudges' and the first
   * flight's shared lines (src/share/ops/guide.js names them). */
  for (const st of stagesOf(M)) {
    for (const o of st.objectives ?? []) {
      [o.guide ?? []].flat().flatMap((g) => (typeof g === 'object' ? Object.values(g) : [g])).forEach((x) => used.add(x));
    }
  }
  for (const k of ['next', 'search', 'contacts', 'lkp', 'home', 'climb', 'first-1', 'first-2', 'dist-500', 'dist-1k', 'dist-2k', 'dist-3k', 'dist-5k', 'dist-far']) {
    used.add(`int-g-${k}`);
  }
  for (let h = 1; h <= 12; h += 1) {
    used.add(`int-g-clock-${h}`);
  }
  check('every primary objective has a guide line for each of its roles', stagesOf(M).every((st) => (st.objectives ?? []).filter((o) => o.tier === 'primary')
    .every((o) => M.roles.every((r) => briefOf({ objective: o }, r.id)))));
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
  check('every site\'s stage is one of its stages', M.sites.every((s) => !s.stage || stagesOf(M).some((st) => st.id === s.stage)));
  check('three stars, the script\'s optionals', M.stars.map((s) => s.id).join() === 'symbol,camp,eyes');
  check('no faction reaches a view: the contacts carry it in data only', M.contacts.every((c) => typeof c.faction === 'string'));
  check('the debrief\'s required items are the mission\'s', M.debrief.required.length > 0 && M.debrief.required.every((id) => M.items.some((x) => x.id === id))
    && M.debrief.required.includes('symbol'));
  check('the mission\'s clock is WORLD\'s M1_CLOCK', M.clock === M1_CLOCK);
  check('every vehicle has a look the map draws', M.contacts.filter((c) => c.kind !== 'person').every((c) => ['motorcycle', 'pickup'].includes(c.look)));
  /* The mark the screen paints is where the room judges it, every dial. */
  const sym = M.items.find((x) => x.id === 'symbol');
  const painted = M.dials.mark.every((d) => {
    const sh = CAMP_PROPS.shelters.find((x) => x.id === resolve(M.camp.mark, { mark: d }));
    const at = threePosToDoc(sh.at[0], 0, sh.at[1], {});
    const judged = resolve(sym.at, { mark: d });
    return sh.markable && MARKED[d] === sh.id && Math.abs(judged[0] - at.x) < 0.01 && Math.abs(judged[1] - at.y) < 0.01;
  });
  check('for every mark dial, the shelter the screen paints is the one the room judges', painted);
  /* The hard threshold's line names a side of last contact (east for the
   * cañada, north for the path crossing): the alternate must lie on that
   * side of everywhere the pair can be lost before its second gap, or
   * Vega's voice and the search ring disagree (the M1 audit, item 8). */
  const ops = (p) => threePosToDoc(p[0], 0, p[1], {});
  const side = { 'int1-s4-hard': (a, p) => a.x > p.x, 'int1-s4-hard-b': (a, p) => a.y > p.y };
  const hard = stagesOf(M).flatMap((st) => st.cues ?? []).find((c) => c.when?.lost && c.search?.id === 'pair-alt');
  const wrong = M.dials.conceal.filter((d) => {
    const alt = ops(ROUTES[`conceal-${d}-alt-a`].pts[ALT_POINTS.reacquire]);
    const walk = ROUTES[`conceal-${d}-a`].pts.slice(0, CONCEAL_POINTS.gap2).map(ops);
    return !walk.every((p) => side[resolve(hard.radio, { conceal: d })](alt, p));
  });
  check('for every concealment route, the hard threshold\'s line names the side its alternate is on', hard && !wrong.length, wrong.join());
  /* The script's UI language (M1 audit item 12): every card a cue shows
   * is in both string tables, MISSION RULE stands in every stage, the
   * script's two line cards are both lines, and a new primary objective
   * (stages 2, 4 and 5, RETURN TO BASE) says so. */
  const cueCards = stagesOf(M).flatMap((st) => (st.cues ?? []).flatMap((c) => [c.card ?? []].flat()));
  check('every card a cue shows is in the English and Spanish tables', cueCards.length > 0 && cueCards.every((k) => EN[k] && ES[k]), cueCards.filter((k) => !EN[k] || !ES[k]).join());
  check('MISSION RULE in every stage', stagesOf(M).every((st) => (st.objectives ?? []).some((o) => o.tier === 'rule')));
  const shows = (pred, card) => stagesOf(M).flatMap((st) => st.cues ?? []).some((c) => pred(c) && [c.card].flat().join() === card);
  check('SEARCH AREA ADDED, UNIDENTIFIED MOVEMENT; INTELLIGENCE UPDATED, POSSIBLE ARMED PERSONNEL',
    shows((c) => c.search?.id === 'pair-search', 'card.search_area,card.unidentified_movement') && shows((c) => c.classify?.to === 'poi', 'card.intelligence_updated,card.possible_armed'));
  const opens = (id) => stagesOf(M).find((st) => st.id === id).cues.some((c) => c.at === 0 && !c.when && c.card === 'card.primary_updated');
  check('PRIMARY OBJECTIVE UPDATED when stages 2, 4 and 5 open and with RETURN TO BASE',
    ['M1_CP_AIRBORNE', 'M1_CP_CONTACT_FOUND', 'M1_CP_CAMP_FOUND'].every(opens) && shows((c) => c.choose?.name === 'dispersal', 'card.primary_updated'));
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

console.log('the briefing: a first viewing never cut, the host\'s skip for everybody once all have seen it');
{
  /* Mission 1 with a briefing film (FILMS' intro lands it on the real
   * mission; the rule is the room's, so a copy carries one here). */
  const FILM = {
    ...MISSIONS['interior-1'], id: 'interior-film-check', filmMs: 20000, film: { id: 'int1-intro', version: 2 },
  };
  const e = opsRoom(FILM, { ...ROOM, n: 2, start: false });
  e.say(0, { type: 'ops', op: 'start', mission: FILM.id, intro: true });
  const v = e.view(0);
  check('started with intro: a briefing, its film in the view, nobody has seen it', v.state === 'briefing' && v.film.id === 'int1-intro' && v.film.version === 2 && v.seen.length === 0);
  e.say(0, { type: 'ops', op: 'skipIntro' });
  check('the host\'s skip before anyone has seen it: refused unwatched', e.errors(0).at(-1)?.error === 'unwatched' && e.view(0).state === 'briefing');
  e.say(0, { type: 'ops', op: 'seen', films: { 'int1-intro': 2 } });
  e.say(1, { type: 'ops', op: 'seen', films: { 'int1-intro': 1 } });
  e.say(0, { type: 'ops', op: 'skipIntro' });
  check('the host has seen it, the other pilot an older cut: still refused (a first viewing of this cut)', e.errors(0).at(-1)?.error === 'unwatched' && e.view(0).state === 'briefing'
    && e.view(0).seen.join() === String(e.seatOf(0)));
  e.say(1, { type: 'ops', op: 'seen', films: 'junk' });
  check('a broken seen message is refused', e.errors(1).at(-1)?.error === 'seen');
  e.say(1, { type: 'ops', op: 'seen', films: { 'int1-intro': 3 } });
  e.say(1, { type: 'ops', op: 'skipIntro' });
  check('a pilot who is not the host cannot skip', e.view(0).state === 'briefing' && e.socks[1].got.some((m) => m.type === 'refused' && m.why === 'host'));
  e.fly(e.clock + 1000);
  e.say(0, { type: 'ops', op: 'skipIntro' });
  const w = e.view(0);
  check('everybody has seen it: the host\'s skip starts the countdown for everybody, now', w.state === 'countdown' && w.goAt === e.clock + 6000 && e.view(1).state === 'countdown');
  e.fly(w.goAt + 200);
  check('and the mission goes live at that go, the briefing cut short', e.view(0).state === 'live' && e.view(0).stage?.id === 'M1_CP_START' && w.goAt < 20000 + 6000);
  const f = opsRoom(FILM, { ...ROOM, n: 1, start: false });
  f.say(0, { type: 'ops', op: 'start', mission: FILM.id, intro: true });
  f.fly(f.clock + 20000 + 6000 + 200);
  check('unskipped, the briefing runs its whole film, then the countdown, then live', f.view(0).state === 'live' && f.view(0).goAt === f.view(0).briefAt + 20000 + 6000);
  f.say(0, { type: 'ops', op: 'skipIntro' });
  check('a skip after the briefing moves nothing', f.view(0).state === 'live');
}

/* ---------------------------------------------------------- the pilot */

const dist = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

/* The Bramor as the scripted pilots fly it: level at full throttle
 * (configs/airframes.js topSpeed, tests/bramor-thresholds.json b4_top)
 * and its best climb (b7_climb, the published 5 m/s). Every pilot here is
 * held to them, measured each step (FLOWN), so the light's budget below
 * is a real aircraft's. */
const BRAMOR = AIRFRAMES.find((a) => a.id === 'bramor2300');
const TOP_MS = BRAMOR.topSpeed;
const CLIMB_MS = 5;
const FLOWN = { v: 0, climb: 0 };

/* A scripted pilot: flies toward `target` at `v` m/s level and at most
 * CLIMB_MS up or down (a target may be a function of room ms), aims its
 * camera at `aim` (a point or a function) with `th` (tanHalf), airborne
 * while `air`. `detour` is the track's length over the straight line's:
 * a real pilot turns, overshoots and lines up, so covers ground slower
 * than its airspeed; `hold` more ms lining up each still. */
function pilot(e, i, start, { v = TOP_MS, detour = 1, hold = 0 } = {}) {
  const c = {
    p: start.slice(), target: start.slice(), v, detour, hold: 0, air: false, crashed: false, aim: null, th: 0.5, last: null,
  };
  e.paths[i] = (t) => {
    const dt = c.last == null ? 0 : (t - c.last) / 1000;
    c.last = t;
    const tg = typeof c.target === 'function' ? c.target(t) : c.target;
    if (tg && dt > 0) {
      const dh = Math.hypot(tg[0] - c.p[0], tg[1] - c.p[1]);
      const sh = Math.min(dh, (c.v / c.detour) * dt);
      const dz = tg[2] - c.p[2];
      const sz = Math.sign(dz) * Math.min(Math.abs(dz), CLIMB_MS * dt);
      const was = c.p;
      c.p = dh > 0 ? [c.p[0] + ((tg[0] - c.p[0]) * sh) / dh, c.p[1] + ((tg[1] - c.p[1]) * sh) / dh, c.p[2] + sz] : [c.p[0], c.p[1], c.p[2] + sz];
      if (c.air) {
        FLOWN.v = Math.max(FLOWN.v, Math.hypot(c.p[0] - was[0], c.p[1] - was[1]) / dt);
        FLOWN.climb = Math.max(FLOWN.climb, Math.abs(c.p[2] - was[2]) / dt);
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
  e.fly(e.clock + 1200 + c.hold);
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
  return until(e, stageIs(e, 'M1_CP_AIRBORNE'), 240000, 'stage 2');
}

/* Stage 2, time scripted (no reading of the view but the dials), so the
 * lag run flies it the same. */
function survey(e, c, i = 0, { teacher = true, moto = true, search = 0 } = {}) {
  /* Looking for the first item (`search` ms) before finding it. */
  e.fly(e.clock + search);
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
 * hidden at most 36 to 38 s on WORLD's routes (canopy round #467,
 * measured on canopyBlocks every 100 ms of each route), under Mission
 * 1's hard threshold of 75 s. `orbit` circles the pair at that radius
 * instead, as a fixed wing must, and, as Ibarra asks when the soft
 * threshold's "I've lost them. Pilot?" comes, goes overhead the pair
 * until it is seen again: from 150 m and 200 m off, the canopy can hide
 * it for up to 87.5 s at some points of the circle (48 phases of the
 * circle over the three routes at the Bramor's 25 m/s; the 57.6 to
 * 58.1 s of round #467 was one phase), so a pilot who only circles can
 * be moved to the alternate. `alt` metres over Pista Cero's ground. */
function follow(e, c, i = 0, { orbit = 0, alt = 600 } = {}) {
  const site = M.sites[0];
  const soft = M.contacts.find((x) => x.id === 'pair-a').track.soft * 1000;
  let lostAt = null;
  const where = (t) => {
    const k = contact(e, 'pair-a');
    const p = k && W.poseOnRoute(k.route, t - k.t0);
    if (!p) {
      return null;
    }
    lostAt = k.state === 'lost' ? (lostAt ?? t) : null;
    const r = lostAt != null && t - lostAt >= soft ? 0 : orbit;
    /* A fixed wing's circle about the pair: about 110 m is the Bramor's
     * tightest at 25 m/s and 30 degrees of bank; once round a minute.
     * (Math.cos and sin are the test pilot's, never the room's.) */
    const a = (2 * Math.PI * t) / 60000;
    let [x, y] = [p.x + r * Math.cos(a), p.y + r * Math.sin(a)];
    /* Overhead, but never inside the camp's standoff: "No low pass". */
    const d = Math.sqrt((x - site.at[0]) ** 2 + (y - site.at[1]) ** 2);
    if (d < site.r + 60) {
      x = site.at[0] + ((x - site.at[0]) * (site.r + 60)) / d;
      y = site.at[1] + ((y - site.at[1]) * (site.r + 60)) / d;
    }
    return [x, y, M.z0 + alt];
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
  until(e, () => dist(c.p, c.target) < 2, 1200000, 'over Pista Cero');
  c.target = [pad[0], pad[1], M.z0];
  until(e, () => c.p[2] < M.z0 + 0.5, 120000, 'down');
  c.air = false;
  return until(e, () => e.view(0).state !== 'live', 30000, 'the end');
}

/* The guide as a screen reads it: this pilot's focus, target and line.
 * `say` keeps the key and its numbers, so a line is checked by its key. */
const guideSay = (k, v) => (v ? `${k}${JSON.stringify(v)}` : k);
function guideOf(e, c, roles = ['isr'], view = e.view(0)) {
  const here = [...c.p];
  here.agl = c.p[2] - M.z0;
  const poseOf = (k) => {
    const p = W.poseOnRoute(k.route, e.clock - k.t0);
    return p ? [p.x, p.y, p.z] : null;
  };
  const focus = focusOf(M, view, roles);
  const target = targetOf(M, view, focus, here, poseOf);
  return {
    view, focus, target, line: goalLine(focus, target, here, guideSay), here,
  };
}
/* Every target the guide named in the solo run, with the contacts as the
 * room told them then: the quiet rule's evidence. */
const GUIDED = [];
function guided(e, c) {
  const g = guideOf(e, c);
  GUIDED.push({ target: g.target, contacts: g.view.contacts });
  return g;
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
  const g1 = guided(e, c);
  check('guide, stage 1: climb past 500 m, the line says it and how high now; Survey One\'s brief, Survey Two\'s for a tracker',
    g1.focus?.card.id === 'launch' && g1.target?.kind === 'climb' && g1.target.m === 500 && g1.line === 'ops.goal.climb{"m":500,"now":0}'
    && briefOf(g1.focus, 'isr') === 'int1-g-launch' && briefOf(g1.focus, 'tracker') === 'int1-g-tr-launch', JSON.stringify({ line: g1.line, target: g1.target }));
  launch(e, c);
  e.fly(e.clock + 300);
  check('over 500 m: stage 2, the telemetry lines', heard(e, 0, 'int1-s1-clean') && heard(e, 0, 'int1-s1-proceed'));
  {
    const g = guided(e, c);
    const alpha = M.items.filter((x) => x.set === 'alpha').map((x) => x.id);
    const nearestAlpha = alpha.map((id) => [id, Math.hypot(itemAt(e, id)[0] - c.p[0], itemAt(e, id)[1] - c.p[1])]).sort((a, b) => a[1] - b[1])[0][0];
    check('guide, stage 2: Sector Alpha, the nearest item still to capture, its name and the card\'s count 0/3',
      g.focus?.card.id === 'alpha' && g.target?.kind === 'item' && g.target.item === nearestAlpha
      && g.line === `ops.goal.item{"item":"ops.interior.item.${nearestAlpha}"} · ops.goal.count{"n":0,"of":3}` && briefOf(g.focus, 'isr') === 'int1-g-alpha',
      JSON.stringify({ line: g.line, target: g.target }));
    /* That item captured (the view as the room would send it): the
     * target moves on to another Alpha item and the count follows. */
    const v = e.view(0);
    const next = guideOf(e, c, ['isr'], {
      ...v,
      captures: [...v.captures, { item: nearestAlpha, grade: 'clean', seat: 1, t: e.clock }],
      cards: v.cards.map((k) => (k.id === 'alpha' ? { ...k, progress: [1, 3] } : k)),
    });
    check('guide, stage 2: one captured, the target is another Alpha item and the line counts 1/3',
      next.target?.kind === 'item' && next.target.item !== nearestAlpha && alpha.includes(next.target.item) && next.line.endsWith('ops.goal.count{"n":1,"of":3}'), next.line);
  }
  const grades = survey(e, c);
  check('Alpha and Bravo captured clean', Object.values(grades).every((g) => g === 'clean'), JSON.stringify(grades));
  check('the first Alpha still: Ibarra\'s line to the ISR', heard(e, 0, 'int1-s2-hold'));
  check('Alpha complete, the burned field\'s exchange', heard(e, 0, 'int1-s2-alpha') && heard(e, 0, 'int1-s2-burned-5'));
  check('the camera held on the schoolteacher\'s house: the exchange', heard(e, 0, 'int1-s2-teacher-4'));
  const moto = contact(e, 'moto-road');
  check('the motorcycle on the road: discovered, then classified civilian by the script', moto && moto.cls === 'civilian', JSON.stringify(moto));
  until(e, stageIs(e, 'M1_CP_BRAVO_COMPLETE'), 30000, 'stage 3');
  check('Bravo complete: stage 3, Charlie', e.view(0).stage.id === 'M1_CP_BRAVO_COMPLETE' && heard(e, 0, 'int1-s2-charlie'));
  {
    const g = guided(e, c);
    check('guide, stage 3: Charlie, the corridor the stage waits on (where to fly, not where the pair is)',
      g.focus?.card.id === 'charlie' && g.target?.kind === 'zone' && g.target.id === 'corridor' && g.line === 'ops.goal.zone' && briefOf(g.focus, 'isr') === 'int1-g-charlie',
      JSON.stringify({ line: g.line, target: g.target }));
  }
  SOLO.atStage3 = e.clock;
  anomaly(e, c);
  check('the discovery window ran out: hold, the bearing, a search area', heard(e, 0, 'int1-s3-bearing'));
  check('discovered: the exchange to "Follow.", the search area gone', heard(e, 0, 'int1-s3-follow') && !e.view(0).search.some((s) => s.id === 'pair-search'));
  const pair = e.view(0).contacts.filter((x) => x.group === 'pair');
  check('the pair: UNKNOWN on discovery (each one seen)', pair.some((x) => x.cls === 'unknown') && pair.every((x) => x.cls === 'unknown' || (x.cls === null && x.state === 'undiscovered')), JSON.stringify(pair.map((x) => [x.id, x.cls, x.state])));
  check('stage 4: observe, and the mission rule', e.view(0).cards.map((x) => x.id).join() === 'observe,rule');
  {
    const g = guided(e, c);
    check('guide, stage 4: the pair as the room tells it, the follow brief per role',
      g.focus?.card.id === 'observe' && ['contact', 'lkp', 'search'].includes(g.target?.kind) && g.line === `ops.goal.${g.target.kind}`
      && briefOf(g.focus, 'isr') === 'int1-g-follow' && briefOf(g.focus, 'tracker') === 'int1-g-tr-follow', JSON.stringify({ line: g.line, target: g.target }));
  }
  /* The soft path: eyes away past 20 s, then back. */
  e.fly(e.clock + 10000);
  lookAway(e, c, 26000);
  check('lost 8 s: welcome to the Interior; 20 s: lost, LAST KNOWN POSITION', heard(e, 0, 'int1-s4-welcome') && heard(e, 0, 'int1-s4-lost')
    && e.view(0).search.some((s) => s.id === 'pair-lkp'));
  until(e, () => heard(e, 0, 'int1-s4-goodeye'), 120000, 'reacquired');
  check('reacquired: "There. Good eye.", the search area gone', heard(e, 0, 'int1-s4-there') && !e.view(0).search.some((s) => s.id === 'pair-lkp'));
  check('no hard threshold yet', contact(e, 'pair-a').hards === 0);
  /* The hard path, before the opening: the alternate routes pass through
   * it too, and after it the pair is at the camp sooner than the
   * threshold (75 s). */
  const before = contact(e, 'pair-a');
  lookAway(e, c, 80000);
  const moved = contact(e, 'pair-a');
  const hardLine = resolve(M.stages[3].cues.find((x) => x.when?.lost && x.when.s === HARD_S).radio, e.view(0).dials);
  check(`lost past ${HARD_S} s: moved to its alternate, its line, a search area there`, moved.route.includes('-alt-') && moved.hards === 1 && heard(e, 0, hardLine)
    && e.view(0).search.some((s) => s.id === 'pair-alt') && e.view(0).stage?.id === 'M1_CP_CONTACT_FOUND',
  `${before.route} -> ${moved.route} ${hardLine} hards ${moved.hards} heard ${heard(e, 0, hardLine)} search ${e.view(0).search.map((x) => x.id)} stage ${e.view(0).stage?.id}`);
  until(e, () => contact(e, 'pair-a').cls === 'poi', 1500000, 'the opening');
  check('at the opening, seen: armed, possible, PERSON OF INTEREST', heard(e, 0, 'int1-s4-know') && contact(e, 'pair-b').cls === 'poi');
  check('the canopy\'s gaps were enough: no hard threshold but the one looked away for', contact(e, 'pair-a').hards === 1, `hards ${contact(e, 'pair-a').hards}`);
  until(e, stageIs(e, 'M1_CP_CAMP_FOUND'), 900000, 'stage 5');
  check('the pair at the camp\'s edge: stage 5', e.view(0).stage?.id === 'M1_CP_CAMP_FOUND');
  const pre = e.view(0);
  check('the view: the clock, the marked shelter by the dial, nothing opened yet', JSON.stringify(pre.clock) === JSON.stringify(M1_CLOCK)
    && pre.camp.mark === MARKED[pre.dials.mark] && pre.opened.length === 0 && !pre.choices.tarp, JSON.stringify({ camp: pre.camp, opened: pre.opened, choices: pre.choices }));
  check('the view\'s contacts carry their look and size', pre.contacts.every((x) => Number.isFinite(x.size) && x.size > 0)
    && pre.contacts.find((x) => x.id === 'moto-road').look === 'motorcycle' && pre.contacts.filter((x) => x.kind === 'person').every((x) => x.look === 'person'));
  {
    const g = guided(e, c);
    const campItems = M.items.filter((x) => x.set === 'camp').map((x) => x.id);
    check('guide, stage 5: document the camp, an item of its set, the count 0/5',
      g.focus?.card.id === 'document' && g.target?.kind === 'item' && campItems.includes(g.target.item) && g.line.endsWith('ops.goal.count{"n":0,"of":5}')
      && briefOf(g.focus, 'isr') === 'int1-g-camp', JSON.stringify({ line: g.line, target: g.target }));
  }
  const camp = documentCamp(e, c);
  const post = e.view(0);
  check('the tarp moved: the view says so, and the mark is opened to every side', post.choices.tarp === 'moved' && post.opened.includes('symbol'));
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
  {
    const g = guided(e, c);
    const pad = M.points['pista-cero'].at;
    check('guide, the return: home to Pista Cero, its brief',
      g.focus?.card.id === 'rtb' && g.target?.kind === 'home' && g.target.at[0] === pad[0] && g.target.at[1] === pad[1] && g.line === 'ops.goal.home'
      && briefOf(g.focus, 'isr') === 'int1-g-rtb', JSON.stringify({ line: g.line, target: g.target }));
  }
  check('guide: no target the solo run was given is a contact the room had not told',
    GUIDED.every(({ target, contacts }) => !target || !target.contact || contacts.some((k) => k.id === target.contact && k.cls)), JSON.stringify(GUIDED.map((x) => x.target && x.target.kind)));
  home(e, c);
  const v = e.view(0);
  SOLO.view = v;
  check('home: won, landed', v.state === 'won' && v.why === 'landed', `${v.state} ${v.why}`);
  check('two stars: the mark and eyes open, not the whole camp alone', v.result.stars === 2 && v.result.starIds.join() === 'symbol,eyes', `${JSON.stringify(v.result)} ${JSON.stringify(SOLO.grades)}`);
  check('the result carries the flag for the campaign', v.result.flags.M1_SYMBOL_CAPTURED === true && !v.result.flags.M1_CAMP_FULLY_DOCUMENTED);
  check('a solo ISR heard no tracker line', !e.cues(0).some((x) => [x.radio].flat().some((r) => typeof r === 'string' && r.startsWith('int1-tr-'))));
  check(`within the light: ${Math.round((v.endAt - v.goAt) / 60000)} min of ${Math.round(sunsetMs(M1_CLOCK) / 60000)} to sunset`, v.endAt - v.goAt < sunsetMs(M1_CLOCK));
}

/* ------------------------------------------------------------ nudges */

console.log('guide: when a nudge is due, and what it says');
{
  const n = createNudger();
  n.progress('a', 0);
  n.spoke(0);
  check(`no nudge before ${NUDGE_IDLE_MS / 1000} s of no progress`, !n.due(NUDGE_IDLE_MS - 1) && n.due(NUDGE_IDLE_MS));
  n.nudged(NUDGE_IDLE_MS);
  check('the next waits longer while nothing changes', !n.due(NUDGE_IDLE_MS + NUDGE_GAP_MS) && n.due(NUDGE_IDLE_MS + NUDGE_GAP_MS * 1.5));
  n.progress('b', 50000);
  check('progress resets the idle clock and the gap', !n.due(60000) && n.due(70000));
  /* On the way: 2.4 km out, straight at it at 20 m/s, nothing else
   * changing. Every CLOSE_M nearer is progress, so nothing is said until
   * the pilot stops closing. */
  const leg = createNudger();
  leg.progress('a', 0, 2400);
  leg.spoke(0);
  const saidOnTheWay = [];
  let t = 0;
  for (; t <= 120000; t += 250) {
    leg.progress('a', t, 2400 - (20 * t) / 1000);
    if (leg.due(t)) {
      saidOnTheWay.push(t);
      leg.nudged(t);
    }
  }
  check('closing on the objective is progress: no nudge on a two minute leg straight at it', saidOnTheWay.length === 0, JSON.stringify(saidOnTheWay));
  for (; t <= 120000 + NUDGE_IDLE_MS; t += 250) {
    leg.progress('a', t, 0);
  }
  check(`then holding there, a nudge after ${NUDGE_IDLE_MS / 1000} s`, leg.due(t));
  const drift = createNudger();
  drift.progress('a', 0, 2000);
  drift.spoke(0);
  for (let u = 0; u <= NUDGE_IDLE_MS; u += 250) {
    drift.progress('a', u, 2000 + (10 * u) / 1000);
  }
  check(`flying away is not progress: due after ${NUDGE_IDLE_MS / 1000} s (CLOSE_M ${CLOSE_M} m)`, drift.due(NUDGE_IDLE_MS));
  check('the clock bearing off the nose: ahead 12, right 3, behind 6, left 9', clockOf([0, 0], [0, 100], 0) === 12 && clockOf([0, 0], [100, 0], 0) === 3
    && clockOf([0, 0], [0, -100], 0) === 6 && clockOf([0, 0], [-100, 0], 0) === 9 && clockOf([0, 0], [100, 0], Math.PI / 2) === 12);
  check('the distance band', distLine(400) === 'int-g-dist-500' && distLine(1200) === 'int-g-dist-1k' && distLine(2200) === 'int-g-dist-2k' && distLine(9000) === 'int-g-dist-far');
  {
    /* The discovery window's fixed "Eleven o'clock" (M1 audit item 10). */
    const at = M.bearings['int1-s3-bearing'].at;
    const said = (heading) => bearingSaid(M.bearings, ['int1-s3-hold', 'int1-s3-bearing'], [at[0] + 500, at[1] - 866], heading).join();
    const hold = M.stages.find((st) => st.id === 'M1_CP_BRAVO_COMPLETE').cues.find((c) => c.search?.id === 'pair-search');
    check('the fixed bearing is for the place its cue searches', hold && [hold.radio].flat().includes('int1-s3-bearing') && hold.search.at.join() === at.join());
    check('"Eleven o\'clock from your nose" only when it is: else the search line and the computed hour',
      said(0) === 'int1-s3-hold,int1-s3-bearing' && said(-Math.PI / 2) === 'int1-s3-hold,int-g-search,int-g-clock-2'
      && bearingSaid(M.bearings, 'int1-s2-alpha', [0, 0], 0).join() === 'int1-s2-alpha', `${said(0)} | ${said(-Math.PI / 2)}`);
  }
  check('a nudge: what, the clock, how far; a climb is "keep climbing"', nudgeOf({ kind: 'item', at: [1000, 0] }, [0, 0], 0).join() === 'int-g-next,int-g-clock-3,int-g-dist-1k'
    && nudgeOf({ kind: 'climb', at: null }, [0, 0], 0).join() === 'int-g-climb' && nudgeOf(null, [0, 0], 0, 'int1-g-alpha').join() === 'int1-g-alpha');
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
console.log('orbit: a correct pilot circling the pair at 150 m and 200 m never trips the hard threshold');
for (const [seed, radius] of [...ORBIT_SEEDS.map((s) => [s, 150]), ...ORBIT_SEEDS.map((s) => [s, 200])]) {
  const e = opsRoom(M, { ...ROOM, n: 1, seed });
  const c = pilot(e, 0, BASE);
  e.fly(e.clock + 7000);
  launch(e, c);
  survey(e, c, 0, { teacher: false, moto: false });
  until(e, stageIs(e, 'M1_CP_BRAVO_COMPLETE'), 30000, 'stage 3');
  anomaly(e, c, 0, { wait: false });
  follow(e, c, 0, { orbit: radius });
  until(e, stageIs(e, 'M1_CP_CAMP_FOUND'), 1800000, 'the camp after the orbit');
  const route = e.r.ops.match.checkpoint?.contacts?.find((x) => x.id === 'pair-a')?.route ?? '';
  const log = e.r.ops.log.filter((x) => x.what === 'cue' && x.stage === 'M1_CP_CONTACT_FOUND');
  const hardLines = log.filter((x) => [x.radio].flat().some((r) => typeof r === 'string' && r.startsWith('int1-s4-hard'))).length;
  check(`${radius} m, dial ${e.view(0).dials.conceal}: the whole route to the camp, no hard threshold, no soft fail`, e.view(0).stage?.id === 'M1_CP_CAMP_FOUND'
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
   * off its side of the camp; then it flies over the two going that
   * way, camera wide on the middle of them, as Ibarra's split line asks. */
  const dirs = ['n', 'e', 's', 'w'];
  tc.forEach((p, k) => {
    const goers = (t) => e.view(0).contacts.filter((x) => x.route.startsWith(`out-${dirs[k]}-`) && x.state !== 'vanished' && t >= x.t0)
      .map((x) => W.poseOnRoute(x.route, t - x.t0)).filter(Boolean);
    const middle = (t) => {
      const ps = goers(t);
      return ps.length ? [ps.reduce((a, q) => a + q.x, 0) / ps.length, ps.reduce((a, q) => a + q.y, 0) / ps.length, ps.reduce((a, q) => a + q.z, 0) / ps.length] : null;
    };
    /* Waiting high off its side of the camp, outside the alertness. */
    const out = { n: [0, 1], e: [1, 0], s: [0, -1], w: [-1, 0] }[dirs[k]];
    const wait = [CAMP_SITE.at[0] + out[0] * 700, CAMP_SITE.at[1] + out[1] * 700, M.z0 + 700];
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

/* ------------------------------------------------------ low tracking */

console.log('low tracking before the camp: the camp only hears what flies over it once it is found');
{
  /* The pair followed at 250 m, under the camp's 300 m and inside its
   * 1500 m reach for much of the way (MISSIONS.md M1 stage 5: the
   * camp's alertness is the camp stage's). */
  const e = opsRoom(M, { ...ROOM, n: 1 });
  const c = pilot(e, 0, BASE);
  e.fly(e.clock + 7000);
  launch(e, c);
  survey(e, c, 0, { teacher: false, moto: false });
  until(e, stageIs(e, 'M1_CP_BRAVO_COMPLETE'), 30000, 'stage 3');
  anomaly(e, c, 0, { wait: false });
  follow(e, c, 0, { alt: 250 });
  let most = 0;
  until(e, () => {
    most = Math.max(most, e.view(0).sites.camp.value);
    return stageIs(e, 'M1_CP_CAMP_FOUND')();
  }, 1800000, 'stage 5 after a low follow');
  check('followed low through stages 3 and 4: the camp never stirred before it was found', most === 0 && e.view(0).sites.camp.level === 'calm', `${most} ${e.view(0).sites.camp.level}`);
  c.target = STANDOFF;
  c.aim = null;
  e.fly(e.clock + 3000);
  check('stage 5 opens on "No low pass. Record everything.", no dispersal and no "They heard you."', heard(e, 0, 'int1-s5-record') && !heard(e, 0, 'int1-s5-early')
    && !heard(e, 0, 'int1-s5-moving') && !e.r.ops.match.choices?.dispersal);
}

/* ------------------------------------------------- the opening missed */

console.log('the opening missed: the long objects still told at the camp edge, or the stage moves on');
for (const back of [true, false]) {
  /* Followed to the narrow opening, then the camera off the pair until
   * it stands at the camp edge (M1 audit item 9: the beat was skipped).
   * Lost there, it is moved to its alternate once (the hard threshold)
   * and walks that through the opening unseen. */
  const e = opsRoom(M, { ...ROOM, n: 1 });
  const c = pilot(e, 0, BASE);
  e.fly(e.clock + 7000);
  launch(e, c);
  survey(e, c, 0, { teacher: false, moto: false });
  until(e, stageIs(e, 'M1_CP_BRAVO_COMPLETE'), 30000, 'stage 3');
  anomaly(e, c, 0, { wait: false });
  const reached = (point) => () => e.r.ops.match.contacts.find((k) => k.id === 'pair-a').reached[point] != null;
  until(e, reached('opening'), 1800000, 'the pair at the opening');
  const keep = c.aim;
  c.aim = null;
  until(e, reached('camp-edge'), 900000, 'the pair at the camp edge');
  const hards = contact(e, 'pair-a').hards;
  const atEdge = e.clock;
  e.fly(e.clock + 1000);
  if (back) {
    check('unseen through the opening: at the camp edge, still stage 4 and no "Armed."', e.view(0).stage?.id === 'M1_CP_CONTACT_FOUND' && !heard(e, 0, 'int1-s4-armed')
      && contact(e, 'pair-a').cls !== 'poi' && hards === 1, `${e.view(0).stage?.id} ${contact(e, 'pair-a').cls} hards ${hards}`);
    c.aim = keep;
    follow(e, c, 0, { orbit: 150 });
    until(e, stageIs(e, 'M1_CP_CAMP_FOUND'), 120000, 'stage 5');
    check('seen at the edge: armed, possible, PERSON OF INTEREST, then stage 5', heard(e, 0, 'int1-s4-know') && contact(e, 'pair-a').cls === 'poi'
      && e.view(0).stage?.id === 'M1_CP_CAMP_FOUND', `${e.view(0).stage?.id} ${contact(e, 'pair-a').cls}`);
  } else {
    until(e, stageIs(e, 'M1_CP_CAMP_FOUND'), 120000, 'stage 5');
    const held = (e.clock - atEdge) / 1000;
    check('never seen: stage 5 after the hold at the edge, without the beat', e.view(0).stage?.id === 'M1_CP_CAMP_FOUND' && !heard(e, 0, 'int1-s4-armed')
      && held >= 29 && held <= 32, `${e.view(0).stage?.id} held ${held} s`);
  }
}

/* ---------------------------------------------------- the camp gone */

/* Stage 5 with nothing documented: the camp disperses on its 8 min
 * timer (MISSIONS.md M1_09). Returns the room, the pilot and the ms the
 * stage opened and the dispersal started. */
function campGone(seed = undefined) {
  const e = opsRoom(M, { ...ROOM, n: 1, ...(seed == null ? {} : { seed }) });
  const c = pilot(e, 0, BASE);
  e.fly(e.clock + 7000);
  launch(e, c);
  survey(e, c, 0, { teacher: false, moto: false });
  until(e, stageIs(e, 'M1_CP_BRAVO_COMPLETE'), 30000, 'stage 3');
  anomaly(e, c, 0, { wait: false });
  until(e, stageIs(e, 'M1_CP_CAMP_FOUND'), 1800000, 'stage 5');
  const opened = e.r.ops.match.stage.at;
  c.target = STANDOFF;
  c.aim = null;
  until(e, () => e.r.ops.match.choices?.dispersal, 600000, 'the dispersal by the timer');
  return {
    e, c, opened, gone: e.r.ops.match.choices?.dispersal?.t ?? null,
  };
}

console.log('the camp gone first: the way home shown at once, nobody goes back into it');
{
  const { e, c, opened, gone } = campGone();
  check('nothing documented: the dispersal on the timer, 480 s after stage 5 opened', gone - opened === 480000, `${gone - opened}`);
  e.fly(e.clock + 1000);
  {
    const g = guideOf(e, c);
    const pad = M.points['pista-cero'].at;
    check('the dispersal: RETURN TO BASE shown, the guide home to Pista Cero with its brief, documentation not blocking it',
      e.view(0).cards.some((x) => x.id === 'rtb' && x.state === 'active') && g.focus?.card.id === 'rtb' && g.target?.kind === 'home'
      && g.target.at[0] === pad[0] && g.target.at[1] === pad[1] && briefOf(g.focus, 'isr') === 'int1-g-rtb',
      JSON.stringify({ cards: e.view(0).cards.map((x) => `${x.id}:${x.state}`), focus: g.focus?.card.id, target: g.target }));
  }
  /* Past every delayed way out, then the three captures that cue the
   * tarp's mover (M1_08): on its way out, it must stay on it. */
  e.fly(e.clock + 30000);
  for (const id of ['shelters', 'motorcycles', 'antenna']) {
    snap(e, 0, c, id);
  }
  e.fly(e.clock + 10000);
  const camp = () => e.r.ops.match.contacts.filter((x) => x.group === 'camp');
  check('three captures after the dispersal: every camp person still on a way out (or gone), none back at a shelter',
    camp().every((x) => x.state === 'vanished' || x.route.startsWith('out-')), JSON.stringify(camp().map((x) => [x.id, x.route])));
  check('the mark opened all the same, the camp being stripped', e.r.ops.match.choices?.tarp?.value === 'moved' && e.view(0).opened.includes('symbol'));
  const pair = e.r.ops.match.contacts.filter((x) => x.group === 'pair');
  check('the pair on its way out has no alternate a hard threshold could send it back along', pair.every((x) => x.route.startsWith('pair-out-') && x.alt == null),
    JSON.stringify(pair.map((x) => [x.id, x.route, x.alt])));
  until(e, () => camp().every((x) => x.state === 'vanished'), 900000, 'the whole camp gone');
  check('the whole camp gone into the forest', camp().every((x) => x.state === 'vanished'));
  e.fly(e.clock + 1000);
  const doc = e.view(0).cards.find((x) => x.id === 'document');
  check('its people gone before they were captured: DOCUMENT THE SITE missed, not left open', doc?.state === 'failed', JSON.stringify(doc));
  home(e, c);
  check('home: won, landed', e.view(0).state === 'won' && e.view(0).why === 'landed', `${e.view(0).state} ${e.view(0).why}`);
}

/* ----------------------------------------------------------- restart */

/* Lost in stage `id` (the ISR down, nobody else up), then played again
 * from its checkpoint: the aircraft starts on Pista Cero's rail, 8 to 9
 * km from the action, and a first timer flies there at 18 m/s. Returns
 * the room and the new pilot at the go. */
function restartIn(id) {
  const e = opsRoom(M, { ...ROOM, n: 1 });
  let c = pilot(e, 0, BASE);
  e.fly(e.clock + 7000);
  launch(e, c);
  survey(e, c, 0, { teacher: false, moto: false });
  until(e, stageIs(e, 'M1_CP_BRAVO_COMPLETE'), 30000, 'stage 3');
  anomaly(e, c, 0, { wait: false });
  if (id === 'M1_CP_CAMP_FOUND') {
    follow(e, c);
    until(e, stageIs(e, id), 1800000, 'stage 5');
  }
  c.crashed = true;
  c.air = false;
  until(e, () => e.view(0).state === 'lost', 5000, `lost in ${id}`);
  check(`lost in ${id}: its checkpoint`, e.view(0).checkpoint?.stage === id, JSON.stringify(e.view(0).checkpoint));
  e.say(0, {
    type: 'ops', op: 'start', mission: 'interior-1', from: 'checkpoint',
  });
  c = pilot(e, 0, BASE, { v: 18 });
  until(e, () => e.view(0).state === 'live', 10000, 'the restart live');
  return { e, c, goAt: e.view(0).goAt };
}

console.log('restart: the stage waits for a first timer flying back out from Pista Cero');
{
  const { e, c, goAt } = restartIn('M1_CP_CAMP_FOUND');
  c.air = true;
  c.target = STANDOFF;
  until(e, () => dist(c.p, STANDOFF) < 2, 1200000, 'the standoff after the restart');
  const gone = e.r.ops.match.choices?.dispersal;
  const at = e.clock;
  check(`stage 5 again, back at standoff ${Math.round((at - goAt) / 1000)} s after the go: the camp still there, "No low pass" said no sooner than the transit`,
    !gone && e.view(0).state === 'live' && !e.cues(0).some((x) => [x.radio].flat().includes('int1-s5-nolow') && x.at < at - 120000),
    JSON.stringify({ gone, nolow: e.cues(0).filter((x) => [x.radio].flat().includes('int1-s5-nolow')).map((x) => x.at - goAt) }));
  until(e, () => e.r.ops.match.choices?.dispersal, 900000, 'the dispersal after the restart');
  const t = e.r.ops.match.choices?.dispersal?.t ?? Infinity;
  check(`and most of the 8 min of observation still to come there: the dispersal ${Math.round((t - at) / 1000)} s after arriving`, t - at >= 300000, `${t - at}`);
}
{
  const { e, c } = restartIn('M1_CP_CONTACT_FOUND');
  const near = () => {
    const k = contact(e, 'pair-a');
    const q = W.poseOnRoute(k.route, e.clock - k.t0);
    return q && Math.hypot(q.x - c.p[0], q.y - c.p[1]) < 1500;
  };
  /* Lost again at once and restarted again: the same lead, not two. */
  const pairAt = (x) => x.r.ops.match.contacts.filter((k) => k.group === 'pair').map((k) => [k.id, k.route, k.t0 - x.view(0).goAt, k.lastIn - x.view(0).goAt]);
  const first = JSON.stringify(pairAt(e));
  c.crashed = true;
  c.air = false;
  until(e, () => e.view(0).state === 'lost', 5000, 'lost again');
  e.say(0, {
    type: 'ops', op: 'start', mission: 'interior-1', from: 'checkpoint',
  });
  c.crashed = false;
  c.p = BASE.slice();
  c.target = BASE.slice();
  until(e, () => e.view(0).state === 'live', 10000, 'the second restart live');
  check('restarted twice from stage 4: the pair held for the same lead after the go both times', JSON.stringify(pairAt(e)) === first, `${first} vs ${JSON.stringify(pairAt(e))}`);
  const goAt2 = e.view(0).goAt;
  c.air = true;
  follow(e, c);
  until(e, near, 1200000, 'near the pair after the restart');
  const lines = ['int1-s4-welcome', 'int1-s4-lost', 'int1-s4-hard', 'int1-s4-hard-b'];
  const early = e.cues(0).filter((x) => x.at >= goAt2 && [x.radio].flat().some((r) => lines.includes(r))).map((x) => `${[x.radio].flat()[0]}@${Math.round((x.at - goAt) / 1000)}`);
  check(`stage 4 again, within 1.5 km of the pair ${Math.round((e.clock - goAt2) / 1000)} s after the go: no loss line on the way and no hard threshold`,
    !early.length && contact(e, 'pair-a').hards === 0 && !contact(e, 'pair-a').route.includes('-alt-'), JSON.stringify({ early, pair: contact(e, 'pair-a') }));
  until(e, stageIs(e, 'M1_CP_CAMP_FOUND'), 1800000, 'stage 5 after the restart');
  check('and followed from there to the camp', e.view(0).stage?.id === 'M1_CP_CAMP_FOUND' && e.view(0).state === 'live', `${e.view(0).state} ${e.view(0).why}`);
}

/* ------------------------------------------------------------ light */

/* The light's budget at the Bramor's speeds: one pilot flies the whole
 * mission as a first timer would, not a scripted line: its track a fifth
 * longer than the straight one (turns, overshoots, lining up), two
 * minutes looking for the first item, eight seconds lining up each still,
 * the pair missed until the discovery window's call, followed on a
 * circle, the camp from standoff, home. It must land with at least
 * MARGIN_S of light left at 18 m/s and over; and a pilot who dawdles
 * still loses the light at sunset (the rule is real pressure). */
const MARGIN_S = 300;
const SUNSET_MS = sunsetMs(M1_CLOCK);
console.log(`light: a first timer's run at 18, 22 and 25 m/s lands with ${MARGIN_S / 60} min of light; a dawdler loses it`);
for (const v of [18, 22, TOP_MS]) {
  const e = opsRoom(M, { ...ROOM, n: 1 });
  const c = pilot(e, 0, BASE, { v, detour: 1.2, hold: 8000 });
  e.fly(e.clock + 7000);
  launch(e, c);
  survey(e, c, 0, { search: 120000 });
  until(e, stageIs(e, 'M1_CP_BRAVO_COMPLETE'), 30000, 'stage 3');
  anomaly(e, c);
  follow(e, c, 0, { orbit: 150 });
  until(e, stageIs(e, 'M1_CP_CAMP_FOUND'), 1800000, 'stage 5');
  documentCamp(e, c);
  home(e, c);
  const w = e.view(0);
  const left = Math.round((w.goAt + SUNSET_MS - (w.endAt ?? e.clock)) / 1000);
  const path = e.r.ops.match.path.map((x) => `${x.id.replace('M1_CP_', '')} ${Math.round((x.at - w.goAt) / 1000)} s`).join(', ');
  check(`${v} m/s: won, landed with ${left} s of light left (at least ${MARGIN_S})`, w.state === 'won' && w.why === 'landed' && left >= MARGIN_S,
    `${w.state} ${w.why} at ${Math.round(((w.endAt ?? e.clock) - w.goAt) / 1000)} s, sunset ${Math.round(SUNSET_MS / 1000)} s; ${path}`);
}
{
  const e = opsRoom(M, { ...ROOM, n: 1 });
  const c = pilot(e, 0, BASE);
  e.fly(e.clock + 7000);
  launch(e, c);
  until(e, () => e.view(0).state !== 'live', SUNSET_MS + 60000, 'the light gone');
  const w = e.view(0);
  check('a pilot who never gets on with it: lost to the light at sunset, the line said', w.state === 'lost' && w.why === 'light'
    && Math.abs(w.endAt - w.goAt - SUNSET_MS) <= 1000 && heard(e, 0, 'int-fail-function'), `${w.state} ${w.why} ${w.endAt - w.goAt}`);
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
    lookAway(e, c, 80000);
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

console.log('fails: spotted (CONTRACT-SPOTTED.md)');
/* To stage 3, the pair found, then down on it: `off` metres south of
 * pair-a and `h` over it at `v` m/s; `sweep` flies passes that many
 * metres east and west of it, 40 s each, at `v`. Returns { e, c, go(h) }
 * where go moves the hold to a new height. */
function lowOnPair({
  off = 150, h = 120, v = 18, sweep = 0,
} = {}) {
  const e = opsRoom(M, { ...ROOM, n: 1 });
  const c = pilot(e, 0, BASE);
  e.fly(e.clock + 7000);
  launch(e, c);
  survey(e, c, 0, { teacher: false, moto: false });
  until(e, stageIs(e, 'M1_CP_BRAVO_COMPLETE'), 30000, 'stage 3');
  anomaly(e, c, 0, { wait: false });
  until(e, () => e.view(0).contacts.some((k) => k.id === 'pair-a' && k.state !== 'undiscovered'), 600000, 'the pair found');
  const hold = { h };
  c.v = v;
  c.target = (t) => {
    const k = contact(e, 'pair-a');
    const p = k && W.poseOnRoute(k.route, t - k.t0);
    const x = sweep * (Math.floor(t / 40000) % 2 ? 1 : -1);
    return p ? [p.x + x, p.y - off, p.z + hold.h] : c.p;
  };
  return { e, c, go: (x) => { hold.h = x; } };
}
const spotOf = (e, id = 'pair') => e.view(0).spot[id];

for (const [name, opts, want] of [['low', { off: 150 }, 'low'], ['over', { off: 0 }, 'over'], ['loud', { off: 150, v: TOP_MS, sweep: 400 }, 'loud']]) {
  const { e } = lowOnPair(opts);
  until(e, () => heard(e, 0, 'int-spot-warn'), 400000, `${name}: the warning`);
  check(`${name}: warned first, "they're looking up", still live`, e.view(0).state === 'live' && spotOf(e).level === 'looking');
  until(e, () => spotOf(e).at.spotted != null, 60000, `${name}: spotted`);
  const t = spotOf(e).at.spotted;
  const k = contact(e, 'pair-a');
  check(`${name}: spotted, the pair runs for cover, the match still live for its end scene`, e.view(0).state === 'live' && k.route.includes('-alt-'), k.route);
  until(e, () => e.view(0).state !== 'live', 10000, `${name}: the loss`);
  const v = e.view(0);
  check(`${name}: lost as spotted after the 6 s scene, advice "${want}" with the height it came in at`, v.state === 'lost' && v.why === 'spotted' && v.endAt === t + 6000
    && v.spotAdvice?.advice === want && v.spotAdvice.h < 200, JSON.stringify({ why: v.why, endAt: v.endAt, t, a: v.spotAdvice }));
  check(`${name}: the radio says they saw you, then the advice`, heard(e, 0, 'int-spot-seen') && heard(e, 0, `int-spot-${want}`));
  if (name !== 'low') {
    continue;
  }
  check('spotted: its checkpoint is the stage it was lost in', v.checkpoint?.stage === e.view(0).stage.id, JSON.stringify(v.checkpoint));
  e.say(0, {
    type: 'ops', op: 'start', mission: 'interior-1', from: 'checkpoint',
  });
  pilot(e, 0, BASE);
  until(e, () => e.view(0).state === 'live', 10000, 'the restart live');
  e.fly(e.clock + 5000);
  const r = e.view(0);
  check('spotted then restarted: the checkpoint again, nobody looking up, no advice', r.restarted === v.checkpoint.stage && r.spot.pair.value === 0
    && r.spot.pair.at.spotted == null && r.spotAdvice === null, JSON.stringify({ restarted: r.restarted, spot: r.spot.pair }));
}

{
  const { e, go } = lowOnPair({ off: 150, h: 170 });
  until(e, () => heard(e, 0, 'int-spot-warn'), 400000, 'climbed out: the warning');
  go(600);
  until(e, () => spotOf(e).value === 0, 120000, 'climbed out: the value back at 0');
  e.fly(e.clock + 30000);
  const v = e.view(0);
  check('warned then climbed out: never spotted, calm again, still flying', v.state === 'live' && v.spot.pair.at.spotted == null && v.spot.pair.level === 'calm'
    && !heard(e, 0, 'int-spot-seen'), JSON.stringify(v.spot.pair));
}

console.log('the pilots');
check(`every scripted pilot flew as a Bramor: at most ${TOP_MS} m/s level and ${CLIMB_MS} m/s up or down`, FLOWN.v <= TOP_MS + 1e-6 && FLOWN.climb <= CLIMB_MS + 1e-6,
  `${FLOWN.v.toFixed(2)} m/s, climb ${FLOWN.climb.toFixed(2)} m/s`);

finish();
