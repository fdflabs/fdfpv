/*
 * interior-m3-selftest.js: Mission 3 (No Man's Land) in the real room,
 * headless (docs/campaign/interior/CONTRACT-M3.md section 5). The data
 * lints clean against MISSIONS.md and the world, the live room refuses
 * it and a dev room starts it, and scripted solo pilots fly it: a clean
 * run to the northern exit with POSITIVE ID and the command site's star,
 * a run that never stops the pair (the post overrun), and a run that
 * strikes two civilian pickups (two errors fail).
 *
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
import { released, INTERIOR } from '../src/game/campaign.js';
import EN from '../src/strings/en.js';
import ES from '../src/strings/es.js';
import { AIRFRAMES } from '../configs/airframes.js';
import { check, finish, opsRoom } from './lib/opsroom.js';

const W = worldFor('interior');
const RAW = MISSIONS['interior-3'];
const M = grounded(RAW, W);
const ROOM = { world: W, map: 'interior', devMissions: true };
const BASE = [...M.points['pista-cero'].at, M.z0];

console.log('data');
{
  const doc = readFileSync(new URL('../docs/campaign/interior/MISSIONS.md', import.meta.url), 'utf8');
  const table = new Set([...doc.matchAll(/^\| (int3?-[a-z0-9-]+) \|/gm)].map((x) => x[1]).filter((id) => /^int3-|^int-/.test(id)));
  const dialsOf = (v) => (v && typeof v === 'object' && !Array.isArray(v) && v.dial ? M.dials[v.dial].map((d) => v.map[d]) : [v]);
  const used = new Set();
  const routes = new Set();
  for (const st of stagesOf(M)) {
    for (const c of st.cues ?? []) {
      [c.radio].flat().flatMap(dialsOf).filter((x) => typeof x === 'string').forEach((x) => used.add(x));
      for (const s of [...(c.spawn ?? []), ...(c.move ?? [])]) {
        dialsOf(s.route).forEach((x) => routes.add(x));
      }
    }
    for (const o of st.objectives ?? []) {
      [o.guide ?? []].flat().flatMap((g) => (typeof g === 'object' ? Object.values(g) : [g])).forEach((x) => used.add(x));
    }
  }
  for (const r of [M.lines.boundary.warning, M.lines.boundary.final, M.lines.fail, M.lines.take, M.lines.downed]) {
    used.add(r);
  }
  const unknown = [...used].filter((x) => !table.has(x));
  check('every radio line it names is in MISSIONS.md\'s tables', !unknown.length, unknown.join());
  /* The unknown drone's lines wait for an air contact (CONTRACT-M3.md gap 5). */
  const DRONE = ['int3-s5-hold', 'int3-s5-unid', 'int3-s5-civ', 'int3-s5-broadcast', 'int3-s5-theirs', 'int3-s5-dontknow', 'int3-s5-guess', 'int3-s5-intercepted', 'int3-s5-left', 'int3-in-launch'];
  const unused = [...table].filter((x) => x.startsWith('int3-') && !used.has(x) && !DRONE.includes(x));
  check('every int3 line in MISSIONS.md is used but the drone\'s', !unused.length, unused.join());
  check('its stages are the script\'s five checkpoints, in order', stagesOf(M).map((s) => s.id).join()
    === 'M3_CP_START,M3_CP_CONFIRMED_CONTACT,M3_CP_FIRST_ENGAGEMENT,M3_CP_RELAY,M3_CP_AIR_CONTACT');
  const missing = [...routes].filter((id) => {
    try {
      W.poseOnRoute(id, 0);
      return false;
    } catch {
      return true;
    }
  });
  check(`every route it names is in the world (${routes.size})`, routes.size > 15 && !missing.length, missing.join());
  const text = JSON.stringify(M.stages) + JSON.stringify(M.lost);
  const named = (re) => [...text.matchAll(re)].map((x) => x[1] ?? x[2]);
  const badPts = named(/"(?:zone|landed|dwell|point)":"([^"]+)"/g).filter((p) => !M.points[p]);
  check('every point it names exists', !badPts.length, badPts.join());
  const sets = new Set(M.items.map((x) => x.set));
  check('every item set it names exists', named(/"set":"([^"]+)"/g).every((x) => sets.has(x)));
  check('every item it names exists', named(/"captured":"([^"]+)"/g).every((x) => M.items.some((i) => i.id === x)));
  const groups = new Set(M.contacts.flatMap((c) => [c.id, c.group]));
  const badC = named(/"(?:seen|discovered|lost|reacquired|classified|vanished|contacts|contact)":"([^"]+)"|"route":"([^"]+)","point"/g).filter((x) => !groups.has(x));
  check('every contact or group it names exists', !badC.length, badC.join());
  const tos = stagesOf(M).flatMap((st) => (st.cues ?? []).flatMap((c) => [c.classify ?? []].flat().map((k) => k.to)));
  check('every class it classifies to is the campaign\'s', tos.every((x) => M.classes.includes(x)));
  const keys = [M.title, ...stagesOf(M).flatMap((st) => [st.title, ...(st.objectives ?? []).map((o) => o.text), ...(st.cues ?? []).flatMap((c) => [c.card ?? [], c.text ?? []].flat())]),
    ...M.items.map((x) => `ops.interior.item.${x.id}`), 'ops.label.empty_vehicle'];
  const noText = keys.filter((k) => !EN[k] || !ES[k]);
  check('every title, objective, card, text and item is in the English and Spanish tables', !noText.length, noText.join());
  /* The debrief's words (src/ui/debrief.js): each star without a card,
   * and each way the mission ends. */
  const skey = (id) => String(id).toLowerCase().replace(/[^a-z0-9_.]/g, '_');
  const ends = [...M.lost.map((l) => l.why), ...stagesOf(M).flatMap((st) => (st.exits ?? []).filter((x) => x.why).map((x) => x.why))];
  const debriefKeys = [...M.stars.filter((x) => !x.card).map((x) => `ops.interior.star.${skey(x.id)}`), ...ends.map((w) => `ops.why.${skey(w)}`)];
  const noDebrief = debriefKeys.filter((k) => !EN[k] || !ES[k]);
  check('every star and every ending has its debrief words in both tables', !noDebrief.length, noDebrief.join());
  check('every item id can be a string key ([a-z0-9_], strings:selftest)', M.items.every((x) => /^[a-z0-9_]+$/.test(x.id)), M.items.map((x) => x.id).join());
  check('MISSION RULE in every stage', stagesOf(M).every((st) => (st.objectives ?? []).some((o) => o.tier === 'rule')));
  check('three stars', M.stars.length === 3);
  check('every primary objective has a guide line for each role', stagesOf(M).every((st) => (st.objectives ?? []).filter((o) => o.tier === 'primary')
    .every((o) => M.roles.every((r) => typeof o.guide === 'object' && o.guide[r.id]))));
  check('every vehicle has a look the map draws', M.contacts.filter((c) => c.kind !== 'person').every((c) => ['motorcycle', 'pickup'].includes(c.look)));
  check('every role\'s platform is an airframe', M.roles.every((r) => r.platforms.every((p) => AIRFRAMES.some((a) => a.id === p))));
  const inside = Object.entries(M.points).filter(([, p]) => Math.max(Math.abs(p.at[0]), Math.abs(p.at[1])) > M.boundary.max[0]);
  check('every point is inside the boundary\'s warning line', !inside.length, inside.map(([k]) => k).join());
  check('held development: a dev build lists it, a live one does not', INTERIOR.find((x) => x.id === 'interior-3').release === 'development'
    && released('interior-3', true) && !released('interior-3', false));
}

console.log('the gate');
{
  const live = opsRoom(M, { ...ROOM, devMissions: false });
  check('the live room refuses Mission 3: unreleased', live.errors(0).at(-1)?.error === 'unreleased' && live.view(0) === null);
  const dev = opsRoom(M, ROOM);
  check('a dev room starts it', dev.view(0)?.state === 'countdown' && dev.view(0).mission === 'interior-3');
}

/* ---------------------------------------------------------- the pilot */

const dist = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
const TOP_MS = AIRFRAMES.find((a) => a.id === 'bramor2300').topSpeed;
const CLIMB_MS = 5;

function pilot(e, i, start) {
  const c = {
    p: start.slice(), target: start.slice(), air: false, aim: null, th: 0.5, last: null,
  };
  e.paths[i] = (t) => {
    const dt = c.last == null ? 0 : (t - c.last) / 1000;
    c.last = t;
    const tg = typeof c.target === 'function' ? c.target(t) : c.target;
    if (tg && dt > 0) {
      const dh = Math.hypot(tg[0] - c.p[0], tg[1] - c.p[1]);
      const sh = Math.min(dh, TOP_MS * dt);
      const dz = tg[2] - c.p[2];
      const sz = Math.sign(dz) * Math.min(Math.abs(dz), CLIMB_MS * dt);
      c.p = dh > 0 ? [c.p[0] + ((tg[0] - c.p[0]) * sh) / dh, c.p[1] + ((tg[1] - c.p[1]) * sh) / dh, c.p[2] + sz] : [c.p[0], c.p[1], c.p[2] + sz];
    }
    return c.p;
  };
  e.air[i] = () => c.air;
  e.crashed[i] = () => false;
  e.cams[i] = (t) => {
    let a = typeof c.aim === 'function' ? c.aim(t) : c.aim;
    a = a && !Array.isArray(a) ? a.aim : a;
    return a ? { aim: a, tanHalf: c.th, aspect: 16 / 9 } : null;
  };
  return c;
}

function until(e, pred, ms, label) {
  const end = e.clock + ms;
  while (e.clock < end && !pred()) {
    e.fly(e.clock + 100);
  }
  const ok = pred();
  if (!ok) {
    check(`reached: ${label}`, false, `state ${e.view(0)?.state} stage ${e.view(0)?.stage?.id} at ${e.clock} ${process.env.M3_DEBUG ? JSON.stringify(e.r.ops.match.contacts.filter((k) => /^v|north|radio/.test(k.id)).map((k) => [k.id, k.route, k.state, k.cls, k.reached, k.seenAt])) : ''}`);
  }
  return ok;
}
const view = (e) => e.view(0);
const ended = (e) => ['won', 'lost'].includes(view(e)?.state);
const stageIs = (e, id) => () => view(e)?.stage?.id === id || ended(e);
const contact = (e, id) => view(e).contacts.find((c) => c.id === id);
const clsOf = (e, id) => contact(e, id)?.cls;
/* The scripted pilot knows where everyone is (the room's own record),
 * so an undiscovered contact is still found and looked at. */
const truth = (e, id) => e.r.ops.match.contacts.find((c) => c.id === id);
const poseOf = (e, id) => {
  const k = truth(e, id);
  const p = k && W.poseOnRoute(k.route, e.clock - k.t0);
  return p ? [p.x, p.y, p.z] : null;
};
/* Over a ground point, `off` metres south of it, `h` up: an oblique look. */
const over = (p, h = 350, off = 250) => [p[0], p[1] - off, p[2] + h];

/* Watch contact `id` from an orbit over it until `pred`, following it. */
function watch(e, c, id, pred, ms, label) {
  c.target = (t) => {
    const p = poseOf(e, id);
    return p ? over(p) : c.p;
  };
  c.aim = (t) => {
    const p = poseOf(e, id);
    return p ? [p[0], p[1], p[2] + 0.8] : null;
  };
  c.th = 0.03;
  return until(e, pred, ms, label);
}
/* A capture of item `id`, of contact `who` when it is a contact's box. */
function snap(e, c, id, who = null) {
  const it = M.items.find((x) => x.id === id);
  const at = () => (who ? poseOf(e, who) : resolve(it.at, view(e).dials));
  c.aim = who ? () => at() : at();
  const size = () => {
    c.th = it.size / (2 * 0.15 * dist(c.p, at()));
  };
  size();
  e.fly(e.clock + 1500);
  size();
  e.fly(e.clock + 600);
  const n = view(e).captures.length;
  e.sayLate(0, {
    type: 'ops', op: 'capture', item: id, t: e.clock - 100, grade: 'clean', framing: { size: 0.15, off: 0, blur: 0 },
  });
  e.fly(e.clock + 800);
  return view(e).captures.slice(n).some((x) => x.item === id);
}
function flyTo(e, c, p, label, ms = 1200000) {
  c.target = p;
  return until(e, () => dist(c.p, p) < 2, ms, label);
}

/* Stage 1 to the pair at the gate, the same in every run. */
function toTheGate(e, c) {
  until(e, () => view(e)?.state === 'live', 30000, 'live');
  c.air = true;
  flyTo(e, c, over([...M.points.post.at, M.z0]), 'the post');
  watch(e, c, 'civ-pickup', () => clsOf(e, 'civ-pickup') === 'civilian' || !contact(e, 'civ-pickup'), 240000, 'A at the farmhouse');
  if (contact(e, 'family') && clsOf(e, 'civ-pickup') !== 'civilian') {
    watch(e, c, 'family', () => clsOf(e, 'civ-pickup') === 'civilian', 60000, 'A civilian');
  }
  watch(e, c, 'police', () => clsOf(e, 'police') === 'friendly', 240000, 'B friendly');
  watch(e, c, 'parked', () => clsOf(e, 'parked') === 'poi', 400000, 'D\'s pattern');
  watch(e, c, 'courier', () => clsOf(e, 'parked') === 'hostile', 400000, 'D meets the courier');
  until(e, stageIs(e, 'M3_CP_CONFIRMED_CONTACT'), 30000, 'stage 2');
  c.target = over([...M.points['strike-gate'].at, M.z0]);
  until(e, () => contact(e, 'pair-a'), 120000, 'the pair appears');
  return watch(e, c, 'pair-a', () => e.cues(0).some((q) => [q.radio].flat().includes('int3-s2-contact')), 300000, 'the hostile action');
}

console.log('a clean run: every classification earned, one strike, the relay, north');
{
  const e = opsRoom(M, ROOM);
  const c = pilot(e, 0, BASE);
  if (toTheGate(e, c)) {
    check('A, the family\'s pickup, is CIVILIAN; B is FRIENDLY; D is HOSTILE CONFIRMED by correlation',
      clsOf(e, 'civ-pickup') === 'civilian' && clsOf(e, 'police') === 'friendly' && clsOf(e, 'parked') === 'hostile');
    snap(e, c, 'confirm_pair', 'pair-a');
    until(e, () => e.cues(0).some((q) => [q.radio].flat().includes('int3-s2-cleared')), 10000, 'cleared');
    check('CONFIRM IDENTIFICATION on the pair after its action: cleared, HOSTILE CONFIRMED, not yet stopped',
      clsOf(e, 'pair-a') === 'hostile' && contact(e, 'pair-a') && !e.cues(0).some((q) => [q.text].flat().includes('ops.interior.m3.stopped')));
    flyTo(e, c, [...M.points['strike-gate'].at, M.z0 + 120], 'the strike run');
    until(e, stageIs(e, 'M3_CP_FIRST_ENGAGEMENT'), 60000, 'stage 3');
    check('the run over the gate: THREAT STOPPED, the pair gone, stage 3', e.cues(0).some((q) => [q.text].flat().includes('ops.interior.m3.stopped'))
      && !view(e).contacts.some((k) => k.group === 'pair' && poseOf(e, k.id)));
    until(e, () => contact(e, 'v3'), 60000, 'the pickups');
    watch(e, c, 'v1', () => contact(e, 'v1-people'), 300000, 'v1 stops');
    watch(e, c, 'v1-people', () => clsOf(e, 'v1') === 'civilian', 120000, 'v1 people seen leaving');
    watch(e, c, 'v2', () => e.r.ops.match.choices?.v2?.value === 'empty', 300000, 'v2 empty');
    watch(e, c, 'v3', () => clsOf(e, 'v3') === 'hostile', 300000, 'v3 meets');
    until(e, stageIs(e, 'M3_CP_RELAY'), 30000, 'stage 4');
    check('the three pickups: CIVILIAN, EMPTY, HOSTILE CONFIRMED', clsOf(e, 'v1') === 'civilian' && clsOf(e, 'v3') === 'hostile' && view(e).stage.id === 'M3_CP_RELAY');
    flyTo(e, c, over([...M.points.command.at, M.z0]), 'the command site');
    flyTo(e, c, [...M.points.relay.at, M.z0 + 400], 'the relay volume');
    e.fly(e.clock + 11000);
    check('the relay held 10 s in its volume: forward feed stable', e.cues(0).some((q) => [q.radio].flat().includes('int3-s4-stable')));
    flyTo(e, c, over([...M.points.command.at, M.z0], 300, 200), 'back over the command site');
    for (const id of ['temp_shelter', 'command_motos', 'route_markers']) {
      snap(e, c, id);
    }
    snap(e, c, 'radio_op', 'radio-man');
    until(e, stageIs(e, 'M3_CP_AIR_CONTACT'), 30000, 'stage 5');
    until(e, () => contact(e, 'north'), 120000, 'the northern vehicle');
    watch(e, c, 'north', () => ended(e), 600000, 'over the northern exit');
    const v = view(e);
    check(`won at the northern exit, ${Math.round((e.clock - v.goAt) / 60000)} min after the go (MISSIONS.md: 30 to 40)`, v.state === 'won', `${v.state} ${v.why ?? ''}`);
    check('POSITIVE ID and the command site\'s star; NOT ALONE not (no drone yet)', v.result?.starIds.join() === 'positive,command',
      JSON.stringify(v.result));
    check('the flags: M3_ZERO_CIVILIAN_ERRORS', v.flags?.M3_ZERO_CIVILIAN_ERRORS === true, JSON.stringify(v.flags));
  }
}

console.log('nobody stops the pair: the post is overrun');
{
  const e = opsRoom(M, ROOM);
  const c = pilot(e, 0, BASE);
  if (toTheGate(e, c)) {
    until(e, () => ended(e), 400000, 'the end');
    check('lost: the post', view(e).state === 'lost' && view(e).why === 'post', `${view(e).state} ${view(e).why}`);
  }
}

console.log('a designation before the action is refused by Ibarra and stops nothing');
{
  const e = opsRoom(M, ROOM);
  const c = pilot(e, 0, BASE);
  until(e, () => view(e)?.state === 'live', 30000, 'live');
  c.air = true;
  flyTo(e, c, over([...M.points.post.at, M.z0]), 'the post');
  watch(e, c, 'police', () => clsOf(e, 'police') === 'friendly', 240000, 'B friendly');
  watch(e, c, 'parked', () => clsOf(e, 'parked') === 'poi', 400000, 'D\'s pattern');
  watch(e, c, 'courier', () => clsOf(e, 'parked') === 'hostile', 400000, 'D meets the courier');
  until(e, () => contact(e, 'pair-a'), 120000, 'the pair appears');
  watch(e, c, 'pair-a', () => contact(e, 'pair-a') && clsOf(e, 'pair-a') === 'poi', 120000, 'the pair seen');
  snap(e, c, 'confirm_pair', 'pair-a');
  e.fly(e.clock + 4000);
  check('"We don\'t have that yet."; the pair not cleared', e.cues(0).some((q) => [q.radio].flat().includes('int3-s2-notyet')) && clsOf(e, 'pair-a') === 'poi');
}

console.log('two civilian pickups struck: an error each, the second fails the mission');
{
  const e = opsRoom(M, ROOM);
  const c = pilot(e, 0, BASE);
  if (toTheGate(e, c)) {
    snap(e, c, 'confirm_pair', 'pair-a');
    flyTo(e, c, [...M.points['strike-gate'].at, M.z0 + 120], 'the strike run');
    until(e, stageIs(e, 'M3_CP_FIRST_ENGAGEMENT'), 60000, 'stage 3');
    const said = (id) => e.r.ops.log.some((x) => x.what === 'cue' && [x.radio].flat().includes(id));
    for (const v of ['v1', 'v2']) {
      watch(e, c, v, () => e.r.ops.match.contacts.find((k) => k.id === v)?.reached[`${v}-stopped`] != null, 300000, `${v} stopped`);
      snap(e, c, `confirm_${v}`, v);
      flyTo(e, c, [...M.points[`${v}-stop`].at, M.z0 + 120], `the run over ${v}`);
      e.fly(e.clock + 4000);
      if (v === 'v1') {
        check('the first: "There were people in that one. Stop." and Vega\'s word; the mission goes on', said('int3-s3-error') && said('int3-s3-error-2') && view(e).state === 'live');
      }
    }
    check('the second: lost, errors', view(e).state === 'lost' && view(e).why === 'errors', `${view(e).state} ${view(e).why}`);
  }
}

finish();
