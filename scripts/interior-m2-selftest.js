/*
 * interior-m2-selftest.js: The Interior's Mission 2, Eyes in the Forest,
 * flown headless on the real room by a scripted solo pilot
 * (docs/campaign/interior/CONTRACT-M2.md section 5; MISSIONS.md M2).
 * npm run interior:m2.
 *
 *   data      every route, point, item set, dial and string the mission
 *             names exists; every int2 radio id is MISSIONS.md's table
 *   the gate  the live room refuses it, a dev room starts it
 *   solo B    the empty camp close up, the watchers, the convoy, the
 *             handoff, Contact B followed to the property, the property
 *             inspected unseen, Claro Nuevo, the meeting: won, flags
 *   solo A    Contact A followed instead: the courier leads to the same
 *             property and the mission goes on (no fail for "wrong")
 *   seen      a quad over the gate as the returner comes in: he runs,
 *             UNSEEN and its flag are lost, the mission still wins
 *
 * The pilot is held to its platforms: the Bramor at 25 m/s and 5 m/s
 * climb, the quad (when RECON is active) at 15 m/s.
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
import { ROUTES } from '../src/share/interior/routes.js';
import EN from '../src/strings/en.js';
import ES from '../src/strings/es.js';
import { AIRFRAMES } from '../configs/airframes.js';
import {
  aimAt, check, finish, opsRoom,
} from './lib/opsroom.js';

const W = worldFor('interior');
const RAW = MISSIONS['interior-2'];
const M = grounded(RAW, W);
const ROOM = { world: W, map: 'interior', devMissions: true };
const BASE = [...M.points['pista-cero'].at, M.z0];

console.log('data');
{
  const dialsOf = (v) => (v && typeof v === 'object' && !Array.isArray(v) && v.dial ? M.dials[v.dial].map((d) => v.map[d]) : [v]);
  const routes = new Set();
  const radios = new Set();
  const keys = new Set([M.title]);
  const points = new Set();
  const walk = (trig) => {
    if (!trig || typeof trig !== 'object') {
      return;
    }
    if (trig.point) {
      points.add(trig.point);
    }
    for (const k of ['all', 'any']) {
      (trig[k] ?? []).forEach(walk);
    }
  };
  for (const st of stagesOf(M)) {
    keys.add(st.title);
    for (const o of st.objectives ?? []) {
      keys.add(o.text);
      walk(o.done);
    }
    for (const x of st.exits ?? []) {
      walk(x.when);
    }
    for (const c of st.cues ?? []) {
      walk(c.when);
      [c.radio].flat().flatMap(dialsOf).filter((x) => typeof x === 'string').forEach((x) => radios.add(x));
      [c.card ?? []].flat().forEach((x) => keys.add(x));
      for (const s of c.spawn ?? []) {
        dialsOf(s.route).forEach((x) => routes.add(x));
      }
      for (const mv of c.move ?? []) {
        dialsOf(mv.route).forEach((x) => routes.add(x));
      }
      for (const k of [c.classify ?? []].flat()) {
        if (k.label) {
          keys.add(k.label);
        }
      }
    }
  }
  const missing = [...routes].filter((r) => !ROUTES[r]);
  check(`every route it names exists (${routes.size})`, missing.length === 0, missing.join());
  const noPoint = [...points].filter((p) => !M.points[p]);
  check(`every route point it names exists (${points.size})`, noPoint.length === 0, noPoint.join());
  M.items.forEach((it) => keys.add(`ops.interior.item.${it.id}`));
  const noStr = [...keys].filter((k) => !(k in EN) || !(k in ES));
  check(`every string it shows is in en and es (${keys.size})`, noStr.length === 0, noStr.join());
  const doc = readFileSync(new URL('../docs/campaign/interior/MISSIONS.md', import.meta.url), 'utf8');
  const table = new Set([...doc.matchAll(/^\| (int2-[a-z0-9-]+) \|/gm)].map((x) => x[1]));
  const odd = [...radios].filter((r) => r.startsWith('int2-') && !table.has(r));
  const unused = [...table].filter((r) => !radios.has(r));
  check(`every int2 line cued is MISSIONS.md's (${radios.size} cued)`, odd.length === 0, odd.join());
  check(`every int2 line in MISSIONS.md is cued (${table.size})`, unused.length === 0, unused.join());
  const ids = new Set(AIRFRAMES.map((a) => a.id));
  check('every role\'s platforms are airframes', M.roles.every((r) => r.platforms.every((p) => ids.has(p))));
  check('the stages are the script\'s checkpoints', stagesOf(M).map((s) => s.id).join() === 'M2_CP_START,M2_CP_WATCHER,M2_CP_PROPERTY,M2_CP_SECOND_CAMP');
}

console.log('the gate');
{
  const live = opsRoom(RAW, { ...ROOM, devMissions: false });
  check('the live room refuses Mission 2: unreleased', live.errors(0).at(-1)?.error === 'unreleased' && live.view(0) === null);
  const dev = opsRoom(RAW, ROOM);
  check('a dev room starts it', dev.view(0)?.state === 'countdown' && dev.view(0).mission === 'interior-2');
}

/* ------------------------------------------------------------ the pilot */

const BRAMOR = AIRFRAMES.find((a) => a.id === 'bramor2300').topSpeed;
const QUAD = 15;
const CLIMB = 5;

function pilot(e, i) {
  const c = {
    p: BASE.slice(), target: BASE.slice(), v: BRAMOR, air: false, aim: null, th: 0.3, last: null,
  };
  e.paths[i] = (t) => {
    const dt = c.last == null ? 0 : (t - c.last) / 1000;
    c.last = t;
    const tg = typeof c.target === 'function' ? c.target(t) : c.target;
    if (tg && dt > 0 && c.air) {
      const dh = Math.hypot(tg[0] - c.p[0], tg[1] - c.p[1]);
      const sh = Math.min(dh, c.v * dt);
      const dz = tg[2] - c.p[2];
      const sz = Math.sign(dz) * Math.min(Math.abs(dz), (c.v === QUAD ? 4 : CLIMB) * dt);
      c.p = dh > 0 ? [c.p[0] + ((tg[0] - c.p[0]) * sh) / dh, c.p[1] + ((tg[1] - c.p[1]) * sh) / dh, c.p[2] + sz] : [c.p[0], c.p[1], c.p[2] + sz];
    }
    return c.p;
  };
  e.air[i] = () => c.air;
  e.cams[i] = (t) => {
    const a = typeof c.aim === 'function' ? c.aim(t) : c.aim;
    if (!a) {
      return null;
    }
    return Array.isArray(a) ? { aim: a, tanHalf: c.th, aspect: 16 / 9 } : a;
  };
  return c;
}

const view = (e) => e.view(0);
const heard = (e, id) => e.cues(0).some((c) => [c.radio].flat().includes(id));
const contact = (e, id) => view(e).contacts.find((c) => c.id === id);
const posOf = (e, id) => {
  const k = contact(e, id);
  if (!k) {
    return null;
  }
  const p = W.poseOnRoute(k.route, e.clock - k.t0);
  return p ? [p.x, p.y, p.z + 0.85] : null;
};
const ground = (x, y) => W.groundAt(x, y);
function until(e, pred, ms, label) {
  const end = e.clock + ms;
  while (e.clock < end) {
    if (pred()) {
      return true;
    }
    e.fly(e.clock + 200);
  }
  const ok = pred();
  check(`reached: ${label}`, ok, `state ${view(e)?.state} stage ${view(e)?.stage?.id} at ${e.clock}`);
  return ok;
}
const near = (c, at, m) => Math.hypot(c.p[0] - at[0], c.p[1] - at[1]) < m && Math.abs(c.p[2] - at[2]) < 3;

/* Fly to a point `h` m over the ground at `at`, the RECON quad low or
 * the Bramor high: the role is set active for the leg. */
function goto(e, c, at, h, role) {
  e.say(0, { type: 'ops', op: 'active', key: role });
  c.v = role === 'recon' ? QUAD : BRAMOR;
  const tg = [at[0], at[1], ground(at[0], at[1]) + h];
  c.target = tg;
  return until(e, () => near(c, tg, 2), 1800000, `over ${at.map(Math.round)} at ${h} m`);
}

/* A still of an item (or a contact's item) framed at `frac` of the frame. */
function snap(e, c, id) {
  const it = M.items.find((x) => x.id === id);
  const at = it.contact ? () => posOf(e, [...view(e).contacts].sort((x, y) => (y.state === 'seen') - (x.state === 'seen')).find((k) => k.id === it.contact || k.group === it.contact)?.id) : () => resolve(it.at, view(e).dials);
  c.aim = (t) => at() ?? null;
  const a = at();
  c.th = it.size / (2 * 0.15 * Math.hypot(a[0] - c.p[0], a[1] - c.p[1], a[2] - c.p[2]));
  e.fly(e.clock + 1500);
  const n = view(e).captures.length;
  e.say(0, {
    type: 'ops', op: 'capture', item: id, t: e.clock - 100, grade: 'clean', framing: { size: 0.15, off: 0, blur: 0 },
  });
  e.fly(e.clock + 800);
  const got = view(e).captures.slice(n).find((x) => x.item === id);
  return got ? got.grade : (e.errors(0).at(-1)?.why ?? 'none');
}

/* Shadow a contact from `off` metres south at `h` m, camera on it. */
function shadow(e, c, id, off = 250, h = 250) {
  c.v = BRAMOR;
  e.say(0, { type: 'ops', op: 'active', key: 'isr' });
  c.aim = (t) => posOf(e, id);
  c.th = 0.02;
  c.target = () => {
    const p = posOf(e, id) ?? c.p;
    return [p[0], p[1] - off, ground(p[0], p[1]) + h];
  };
}

function fly(follow, { seen = false } = {}) {
  const e = opsRoom(RAW, { ...ROOM, n: 1, seed: follow === 'a' ? 0.25 : 0.6 });
  const c = pilot(e, 0);
  const r = { e, at: {} };
  const mark = () => { r.at[view(e).stage?.id] ??= Math.round((e.clock - (view(e).goAt ?? 0)) / 6000) / 10; };
  e.fly(e.clock + 7000);
  check(`${follow}: one pilot holds ISR and RECON`, view(e).roles.held[e.seatOf(0)].slice().sort().join() === 'isr,recon');
  check(`${follow}: stage 1 opens`, view(e).stage?.id === 'M2_CP_START');
  c.air = true;
  /* Stage 1: the empty camp, close. */
  const cv = M.points['claro-viejo'].at;
  goto(e, c, [cv[0] - 30, cv[1] - 30], 120, 'isr');
  r.close = {};
  for (const id of ['fire', 'cable', 'impressions', 'tracks', 'diagram']) {
    const a = resolve(M.items.find((x) => x.id === id).at, view(e).dials);
    goto(e, c, [a[0] - 3, a[1] - 3], 4, 'recon');
    r.close[id] = snap(e, c, id);
  }
  check(`${follow}: the camp's five close stills, from the quad`, Object.values(r.close).every((g) => g === 'clean'), JSON.stringify(r.close));
  check(`${follow}: the diagram: not a map, observation points`, heard(e, 'int2-s1-points'));
  check(`${follow}: three search areas, the posts card`, view(e).search.length === 3 && view(e).cards.some((x) => x.id === 'posts'));
  /* The three zones, the required one last when it is not the nearest. */
  const zone = view(e).dials.watch.split('-')[0];
  for (const z of ['cruce', 'loma', 'corral'].filter((x) => x !== zone).concat(zone)) {
    const at = M.points[`zone-${z}`].at;
    goto(e, c, [at[0], at[1] - 350], 250, 'isr');
    const id = z === zone ? 'watcher' : view(e).contacts.find((k) => k.group === 'watchers' && k.id !== 'watcher' && Math.hypot(posOf(e, k.id)[0] - at[0], posOf(e, k.id)[1] - at[1]) < 300)?.id;
    if (id) {
      c.aim = () => posOf(e, id);
      c.th = 0.01;
      until(e, () => contact(e, id)?.state !== 'undiscovered' && contact(e, id)?.cls, 60000, `${id} seen in ${z}`);
    }
  }
  check(`${follow}: all three watchers: their flag`, view(e).flags.M2_ALL_WATCHERS_FOUND === true);
  /* Stage 2: the convoy, he leaves; the handoff. */
  shadow(e, c, 'watcher');
  until(e, () => view(e).stage?.id === 'M2_CP_WATCHER', 120000, 'stage 2');
  mark();
  check(`${follow}: "That your guy?" to "You're welcome."`, heard(e, 'int2-s1-welcome'));
  check(`${follow}: the convoy passes, "Now he's interesting."`, heard(e, 'int2-s2-interesting') && contact(e, 'convoy-1'));
  until(e, () => view(e).choices?.split, 1500000, 'the handoff');
  check(`${follow}: the handoff: "Which one?" to "only to see"`, heard(e, 'int2-s2-see'));
  const who = follow === 'a' ? 'watcher' : 'second';
  shadow(e, c, who, 150, 150);
  r.choose = snap(e, c, `follow-${follow}`);
  check(`${follow}: Contact ${follow.toUpperCase()} boxed: the choice`, view(e).choices?.follow === follow, `${r.choose} ${JSON.stringify(view(e).choices)}`);
  shadow(e, c, who, 150, 150);
  if (follow === 'a') {
    until(e, () => contact(e, 'courier'), 900000, 'the courier');
    check('a: the courier leaves A\'s post, "Follow that one."', heard(e, 'int2-s2-courier'));
    shadow(e, c, 'courier', 150, 150);
  }
  until(e, () => view(e).stage?.id === 'M2_CP_PROPERTY', 2400000, 'stage 3');
  mark();
  if (view(e).state === 'lost') {
    console.log(`  (lost: ${view(e).why})`);
    return r;
  }
  /* Stage 3: inside the house with the quad, then off to watch. */
  for (const id of ['stash', 'radio', 'notes']) {
    const a = resolve(M.items.find((x) => x.id === id).at, view(e).dials);
    goto(e, c, [a[0] - 2, a[1] - 2], a[2] - ground(a[0], a[1]), 'recon');
    snap(e, c, id);
  }
  check(`${follow}: the property inspected: their warning system`, heard(e, 'int2-s3-satellites'));
  const gate = M.points['property-gate'].at;
  if (seen) {
    goto(e, c, gate, 4, 'recon');
  } else {
    goto(e, c, [gate[0] - 120, gate[1] - 120], 60, 'recon');
  }
  c.aim = () => posOf(e, 'returner') ?? [gate[0], gate[1], ground(gate[0], gate[1])];
  until(e, () => contact(e, 'returner'), 120000, 'the returner');
  check(`${follow}: "Movement."`, heard(e, 'int2-s3-movement'));
  until(e, () => view(e).stage?.id === 'M2_CP_SECOND_CAMP', 900000, 'stage 4');
  mark();
  r.detected = view(e).choices?.detected === 'yes';
  /* Stage 4: Claro Nuevo from standoff. */
  const cn = M.points['nuevo-middle'].at;
  goto(e, c, [cn[0], cn[1] - 300], 300, 'isr');
  c.aim = () => posOf(e, 'nuevo-1');
  c.th = 0.02;
  until(e, () => contact(e, 'nuevo-1')?.cls, 120000, 'Claro Nuevo seen');
  r.nuevo = {};
  for (const id of ['nuevo-people', 'nuevo-vehicles', 'nuevo-comms', 'nuevo-overview']) {
    /* A person under the crowns is taken again when the frame is
     * blocked, as a pilot would wait for a gap. */
    for (let k = 0; k < 6 && r.nuevo[id] !== 'clean'; k += 1) {
      r.nuevo[id] = snap(e, c, id);
    }
  }
  check(`${follow}: Claro Nuevo documented from standoff`, Object.values(r.nuevo).every((g) => g === 'clean'), JSON.stringify(r.nuevo));
  until(e, () => contact(e, 'old-courier'), 60000, 'the old courier');
  c.aim = () => posOf(e, 'old-courier');
  until(e, () => contact(e, 'old-courier')?.reached?.['nuevo-middle'] != null || heard(e, 'int2-s4-hold'), 600000, 'the meeting');
  for (let k = 0; k < 6 && r.comparison !== 'clean'; k += 1) {
    r.comparison = snap(e, c, 'comparison');
  }
  until(e, () => view(e).state === 'won', 900000, 'won');
  console.log(`  (stages opened at min ${JSON.stringify(r.at)})`);
  r.v = view(e);
  return r;
}

for (const follow of ['b', 'a']) {
  console.log(`solo ${follow.toUpperCase()}: Contact ${follow.toUpperCase()} followed`);
  const r = fly(follow);
  check(`${follow}: never seen at the property`, !r.detected);
  check(`${follow}: Claro Nuevo: "Replacement people.", NEW COLUMN label`, heard(r.e, 'int2-s4-people') && contact(r.e, 'nuevo-1').label === 'ops.label.new_column_unconfirmed');
  check(`${follow}: the meeting and both groups: "Different people."`, heard(r.e, 'int2-s4-routes'));
  check(`${follow}: won, three stars, both flags`, r.v.state === 'won' && r.v.result.stars === 3 && r.v.result.flags.M2_SECOND_CAMP_UNDETECTED === true && r.v.result.flags.M2_ALL_WATCHERS_FOUND === true,
    `${r.v.state} ${JSON.stringify(r.v.result)} comparison ${r.comparison}`);
  check(`${follow}: within 35 min`, r.v.endAt - r.v.goAt < 35 * 60000, `${Math.round((r.v.endAt - r.v.goAt) / 60000)} min`);
  console.log(`  (flown in ${Math.round((r.v.endAt - r.v.goAt) / 60000)} min)`);
}

console.log('seen: a quad over the gate as the returner comes in');
{
  const r = fly('b', { seen: true });
  check('he saw it: "He saw you." and the fast route', r.detected && heard(r.e, 'int2-s3-seen') && contact(r.e, 'returner')?.route?.endsWith('-fast'));
  check('no fail: won, UNSEEN lost, its flag not set', r.v.state === 'won' && !r.v.result.starIds.includes('unseen') && !r.v.result.flags.M2_SECOND_CAMP_UNDETECTED, JSON.stringify(r.v.result));
}

finish();
