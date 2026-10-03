/*
 * films-lint.js: every war film (src/share/war/films) checked as data, in
 * Node, no browser (docs/campaign/TECH-NEEDS.md T2.7, INTROS.md section
 * 2). npm run films:lint.
 *
 *   timing    each shot at least as long as its lines in both languages,
 *             lead and tail (film.js timing), a spanned line inside its
 *             shots, and the film's shots 30 to 75 s (INTROS: a film is
 *             30 to 75 s); the room's briefing is the film's timing, the
 *             preload included (films/index.js briefingMs)
 *   lines     every line id in lines.json and measured in both languages
 *             (src/share/war/voicelen.js)
 *   passes    every agent group's centre line at its point at its anchor:
 *             to the millisecond by construction, and within PASS_M of
 *             the point (and a weaving kind's weave besides); the pass
 *             inside its shot and the flight alive then
 *   anchors   every anchor of every shot inside the shot
 *   names     every cast member and every title key known (the cast in
 *             the film's table, the keys in both string tables), every
 *             camera a primitive of film.js, every grade and transition
 *             one the player has
 *
 * It prints each film's shots, their lengths and lines, and the passes.
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

import {
  LANGS, PRELOAD_MS, anchor, cameraAt, castAt, lineMs, placeAgents, timing,
} from '../src/share/war/film.js';
import { poseAt } from '../src/share/war/routes.js';
import { FILMS, briefingMs, filmFor } from '../src/share/war/films/index.js';
import { MISSIONS } from '../src/share/war/missions/index.js';
import { KIND } from '../src/share/war/routes.js';
import VOICE from '../src/share/war/voicelen.js';
import en from '../src/strings/en.js';
import es from '../src/strings/es.js';

const PASS_M = 2;
const FILM_MIN_S = 30;
const FILM_MAX_S = 75;
const CAMERAS = new Set(['dolly', 'crane', 'orbit', 'handheld', 'drone', 'telephoto']);
const GRADES = new Set(['dawn', 'steel', 'warm', 'night']);
const OUTS = new Set(['cut', 'smash', 'match', 'dip', 'dissolve', 'handoff']);

/* The ground for a cast member standing on it, in Node: the crest's deck
 * (the player asks the map). */
const DECK_Y = 225;
const WATER_Y = 219;

/* Places for cameraAt in a shot: a cast member's (the deck or the water
 * for a standing one), a group's middle's. */
function resolver(film, t, placed, shot) {
  const def = film.shots[t.shots.indexOf(shot)];
  return {
    cast(name, ms) {
      const c = castAt(def.cast[name], shot, ms);
      const y = c.p[1] == null ? DECK_Y : c.p[1] === 'water' ? WATER_Y : c.p[1];
      return [c.p[0], y, c.p[2]];
    },
    agent(id, ms) {
      const a = placed.find((x) => x.group === id && x.pass) ?? placed.find((x) => x.group === id);
      return poseAt(a.plan, shot.start + ms).p;
    },
  };
}

/* How far a point is off a camera's axis, degrees across and up, and the
 * 2.39 frame's half widths for its lens. */
function offAxis(cam, point) {
  const d = [cam.look[0] - cam.p[0], cam.look[1] - cam.p[1], cam.look[2] - cam.p[2]];
  const q = [point[0] - cam.p[0], point[1] - cam.p[1], point[2] - cam.p[2]];
  const yaw = (v) => Math.atan2(v[0], v[2]);
  const pitch = (v) => Math.atan2(v[1], Math.hypot(v[0], v[2]));
  let h = Math.abs(yaw(q) - yaw(d));
  h = Math.min(h, 2 * Math.PI - h);
  const deg = 180 / Math.PI;
  const hHalf = Math.atan(18 / cam.lens);
  return {
    h: h * deg, v: Math.abs(pitch(q) - pitch(d)) * deg, hHalf: hHalf * deg, vHalf: Math.atan(Math.tan(hHalf) / 2.39) * deg,
  };
}

const lines = new Set(JSON.parse(readFileSync(new URL('../assets/audio/war/lines.json', import.meta.url), 'utf8')).lines.map((l) => l.id));
const failures = [];
const fail = (msg) => failures.push(msg);

for (const film of Object.values(FILMS)) {
  const t = timing(film);
  const shotsMs = t.ms - PRELOAD_MS;
  console.log(`film ${film.id} v${film.version}: ${(t.ms / 1000).toFixed(2)} s with its ${PRELOAD_MS / 1000} s preload, ${film.shots.length} shots`);
  if (!Number.isInteger(film.version) || film.version < 1) {
    fail(`${film.id}: version ${film.version} is not a whole number from 1`);
  }
  if (shotsMs < FILM_MIN_S * 1000 || shotsMs > FILM_MAX_S * 1000) {
    fail(`${film.id}: its shots run ${(shotsMs / 1000).toFixed(2)} s, outside ${FILM_MIN_S} to ${FILM_MAX_S} s`);
  }
  for (const [i, s] of t.shots.entries()) {
    const def = film.shots[i];
    const said = s.lines.map((l) => `${l.line} at ${((l.start - s.start) / 1000).toFixed(2)} s (en ${(l.ms.en / 1000).toFixed(2)}, es ${(l.ms.es / 1000).toFixed(2)})`).join('; ');
    console.log(`  ${s.id.padEnd(8)} ${(s.start / 1000).toFixed(2).padStart(6)} s  ${(s.ms / 1000).toFixed(2).padStart(5)} s  ${(def.camera?.type ?? '?').padEnd(9)} ${String(def.camera?.lens ?? '').padEnd(9)} ${said}`);
    if (!CAMERAS.has(def.camera?.type)) {
      fail(`${film.id} ${s.id}: a camera of no type ${def.camera?.type}`);
    }
    if (def.grade && !GRADES.has(def.grade)) {
      fail(`${film.id} ${s.id}: no grade ${def.grade}`);
    }
    if (def.out && !OUTS.has(def.out)) {
      fail(`${film.id} ${s.id}: no transition ${def.out}`);
    }
    if (def.out === 'handoff' && i !== t.shots.length - 1) {
      fail(`${film.id} ${s.id}: a hand-off before the last shot`);
    }
    /* Each line and its pads inside its shot, or its span. */
    let need = 0;
    for (const l of def.lines ?? []) {
      if (!lines.has(l.line)) {
        fail(`${film.id} ${s.id}: no line ${l.line} in lines.json`);
      }
      for (const lang of LANGS) {
        try {
          lineMs(l.line, lang);
        } catch (e) {
          fail(`${film.id} ${s.id}: ${e.message}`);
        }
      }
      const long = Math.max(...LANGS.map((lang) => Math.round((VOICE[l.line]?.[lang] ?? 0) * 1000)));
      need += Math.round((l.lead ?? 0) * 1000) + long + Math.round((l.tail ?? 0) * 1000);
      const span = t.shots.slice(i, i + (l.span ?? 1)).reduce((sum, x) => sum + x.ms, 0);
      if (need > span) {
        fail(`${film.id} ${s.id}: ${l.line} needs ${need} ms, its shots have ${span}`);
      }
    }
    /* Every anchor inside the shot. */
    const anchors = [
      ...(def.titles ?? []).flatMap((x) => [x.from, x.to]),
      ...(def.counter ? [def.counter.from, def.counter.to] : []),
      ...(def.fade ?? []).map((x) => x[0]),
      ...(def.camera?.from != null ? [def.camera.from] : []),
      ...(def.camera?.to != null ? [def.camera.to] : []),
    ];
    for (const a of anchors) {
      const ms = anchor(a, s);
      if (!(ms >= 0 && ms <= s.ms)) {
        fail(`${film.id} ${s.id}: an anchor ${JSON.stringify(a)} at ${ms} ms, outside its ${s.ms} ms`);
      }
    }
    for (const [name, c] of Object.entries(def.cast ?? {})) {
      if (!film.cast[c.as ?? name]) {
        fail(`${film.id} ${s.id}: no cast member ${c.as ?? name}`);
      }
    }
    for (const x of def.titles ?? []) {
      for (const key of [x.key, x.sub].filter(Boolean)) {
        if (!(key in en) || !(key in es)) {
          fail(`${film.id} ${s.id}: the title key ${key} is not in both string tables`);
        }
      }
    }
  }
  for (const g of film.agents ?? []) {
    for (const id of g.shots ?? []) {
      if (!t.shots.some((s) => s.id === id)) {
        fail(`${film.id} agents ${g.id}: drawn in no shot ${id}`);
      }
    }
  }
  const placed = placeAgents(film, t);
  for (const a of placed) {
    if (!a.pass) {
      continue;
    }
    const g = film.agents.find((x) => x.id === a.group);
    const shot = t.shots.find((s) => s.id === g.pass.shot);
    const weave = KIND[g.kind].weaveM ?? 0;
    const inShot = a.pass.at >= shot.start && a.pass.at <= shot.start + shot.ms;
    const alive = a.pass.at >= a.a.t0 && a.pass.at <= a.plan.tEnd;
    console.log(`  pass ${a.group.padEnd(6)} ${g.kind.padEnd(7)} x${g.n ?? 1} at ${(a.pass.at / 1000).toFixed(3)} s in ${shot.id}, ${a.pass.miss.toFixed(2)} m off its point, born ${(a.a.t0 / 1000).toFixed(2)} s`);
    if (!inShot || !alive) {
      fail(`${film.id} agents ${a.group}: the pass at ${a.pass.at} ms is ${inShot ? 'outside its flight' : 'outside its shot'}`);
    }
    if (a.pass.miss > PASS_M + weave) {
      fail(`${film.id} agents ${a.group}: ${a.pass.miss.toFixed(2)} m from its point, over ${PASS_M + weave} m`);
    }
    /* And on screen: the pass point inside the shot's 2.39 frame then
     * (INTROS section 0, fault 2: the old closing wave sat outside its
     * telephoto's frame). */
    const at = g.pass.seen != null ? anchor(g.pass.seen, shot) : a.pass.at - shot.start;
    const cam = cameraAt(shot, at, resolver(film, t, placed, shot), t.shots.indexOf(shot));
    const off = offAxis(cam, poseAt(a.plan, shot.start + at).p);
    if (off.h > off.hHalf || off.v > off.vHalf) {
      fail(`${film.id} agents ${a.group}: at ${(at / 1000).toFixed(2)} s into ${shot.id} it is ${off.h.toFixed(1)} deg across and ${off.v.toFixed(1)} deg up from the lens axis, outside the frame's ${off.hHalf.toFixed(1)} by ${off.vHalf.toFixed(1)}`);
    }
  }
}

/* Each mission's briefing is its film's, preload and all. */
for (const m of Object.values(MISSIONS)) {
  const f = filmFor(m);
  if (briefingMs(m) !== timing(f).ms) {
    fail(`${m.id}: its briefing ${briefingMs(m)} ms is not its film's ${timing(f).ms}`);
  }
  console.log(`mission ${m.id}: film ${f.id}, briefing ${(briefingMs(m) / 1000).toFixed(2)} s`);
}

if (failures.length) {
  console.log(`\nfilms:lint FAIL\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('\nfilms:lint PASS');
