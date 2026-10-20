/*
 * events-selftest.js: the gameplay event log (src/game/events.js).
 *
 *     node scripts/events-selftest.js      (npm run events:selftest)
 *
 * The log is typed and append only: an event outside the vocabulary, one
 * without a sim time, data that is not a plain value, or an append after
 * the flight ended all throw, and an event cannot be changed once
 * appended. A flight in a room stamps the room clock beside the sim one.
 *
 * RunWatch's edges (a crash, the engine and the battery, a landing) are
 * held to the judge before it, kept here as the oracle (Legacy), on a
 * recorded flight (gates, a contact reported every step, laps, a crash, a
 * dead stick landing) logged as src/ui/progress-ui.js Progress logs it.
 * The seven challenges once judged from the log left with Flight Club in
 * the combat-only cut (2026-10-20), and their equivalence runs with them.
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
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVENT_TYPES, EventLog } from '../src/game/events.js';
import { RunWatch } from '../src/game/progress.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}
const show = (v) => JSON.stringify(v);
const throws = (fn) => {
  try {
    fn();
    return false;
  } catch (e) {
    return true;
  }
};

console.log('the vocabulary is COMPLETENESS item 25\'s');
{
  const want = ['spawned', 'gate', 'lap', 'touch', 'crash', 'landing', 'objective', 'stage', 'kill', 'hit',
    'round', 'joined', 'left', 'mission_start', 'mission_end', 'contact', 'seated', 'engine_out', 'battery_low', 'found',
    'lap_void', 'bail', 'trick'];
  check('twenty three types, these', show([...EVENT_TYPES].sort()) === show([...want].sort()), EVENT_TYPES.join());
  const doc = readFileSync(join(root, 'docs', 'redesign', 'COMPLETENESS.md'), 'utf8');
  check('each named in the spec', want.every((t) => doc.includes(`\`${t}\``)));
  check('the list cannot be changed at run time', Object.isFrozen(EVENT_TYPES));
}

console.log('typed and append only');
{
  const log = new EventLog();
  const a = log.append('spawned', 0);
  const b = log.append('gate', 1200);
  const c = log.append('mission_end', 1500, { mission: 'm1', won: true, stars: 3 });
  check('each event has its place, type and clocks', show(a) === show({ seq: 0, type: 'spawned', simMs: 0, roomMs: null })
    && b.seq === 1 && c.seq === 2 && c.mission === 'm1' && c.stars === 3, show([a, b, c]));
  check('an event is frozen', Object.isFrozen(b) && throws(() => { 'use strict'; b.simMs = 5; }));
  check('a log is JSON as it stands', show(JSON.parse(show(log.events))) === show(log.events));
  check('an unknown type throws', throws(() => log.append('boost', 1)));
  check('no sim time throws', throws(() => log.append('gate')) && throws(() => log.append('gate', NaN)));
  check('data that is not a plain value throws', throws(() => log.append('hit', 1, { who: { id: 2 } }))
    && throws(() => log.append('hit', 1, { at: Infinity })));
  check('data cannot overwrite the event\'s own fields', throws(() => log.append('gate', 1, { seq: 9 }))
    && throws(() => log.append('gate', 1, { type: 'lap' })));
  const m = log.append('mission_start', 1600, { mission: 'm1', airframe: 'cub1400' });
  check('a mission start carries its mission and aircraft as plain values', m.mission === 'm1' && m.airframe === 'cub1400' && Object.isFrozen(m));
  check('a failed append leaves the log as it was', log.events.length === 4);
  log.end(2000);
  check('the flight ends once, at its sim time', log.ended && log.endSimMs === 2000);
  check('nothing is appended after it ends', throws(() => log.append('crash', 2100)));
}
{
  const log = new EventLog();
  check('a lap carries its medal, or null on a course without', log.append('lap', 1, { ms: 1, airframe: 'x', medal: 'bronze' }).medal === 'bronze'
    && log.append('lap', 2, { ms: 1, airframe: 'x', medal: null }).medal === null);
}

console.log('the debrief\'s words (COMPLETENESS item 26)');
{
  const log = new EventLog();
  const v = log.append('lap_void', 1, { ms: null, reason: 'wreck' });
  const t = log.append('lap_void', 2, { ms: 41000, reason: 'test' });
  const b = log.append('bail', 3, { cause: 'bounce' });
  const k = log.append('trick', 4, { id: 'Power Loop', score: 512.75 });
  const m = log.append('mission_end', 5, {
    mission: 'interior-1', match: 'u1', won: true, state: 'won', stars: 1, earned: 3, paid: false, airframe: 'cub1400',
  });
  check('a voided lap carries no time and its reason, a test flight\'s lap its time', v.ms === null && v.reason === 'wreck' && t.ms === 41000 && t.reason === 'test');
  check('a bail its cause, a trick its id and score', b.cause === 'bounce' && k.id === 'Power Loop' && k.score === 512.75);
  check('an Interior result its match, state, stars earned and whether it paid', m.match === 'u1' && m.state === 'won' && m.earned === 3 && m.paid === false);
  check('all plain values: the log is JSON as it stands', show(JSON.parse(show(log.events))) === show(log.events));
}

console.log('the room clock');
{
  let room = null;
  const log = new EventLog({ roomNow: () => room });
  const before = log.append('spawned', 0);
  room = 81234.5;
  const after = log.append('joined', 10, { who: 'p2' });
  check('null before the room clock is known', before.roomMs === null);
  check('stamped once it is, beside the sim clock', after.roomMs === 81234.5 && after.simMs === 10);
}

console.log('a contact reported every step is one event per kind');
{
  const log = new EventLog();
  const got = [];
  for (let i = 0; i < 1000; i += 1) got.push(log.append('touch', i, { kind: 'roof' }));
  check('a thousand steps on a roof: one touch', log.events.length === 1 && got.filter(Boolean).length === 1);
  log.append('touch', 1000, { kind: 'gate' });
  log.append('touch', 1001, { kind: 'roof' });
  check('another kind in the same contact is its own', log.events.length === 2);
  log.append('gate', 1002);
  log.append('touch', 1003, { kind: 'roof' });
  check('after any other event a touch is new again', log.events.length === 4 && log.events[3].type === 'touch');
}

/*
 * THE ORACLE: the landing, engine and battery detection RunWatch replaced
 * (git: src/game/progress.js before item 28), verbatim but for the names
 * and the challenges it judged, which left with Flight Club in the
 * combat-only cut (2026-10-20). Kept only here, to hold RunWatch's edges
 * to its answers.
 */
const AIRBORNE_MS = 2000;
const LANDED_MS = 1000;
class Legacy {
  constructor() { this.start(null); }

  start(ctx) {
    this.ctx = ctx;
    this.engineOut = false;
    this.lowBattery = false;
    this.crashed = false;
    this.airSince = null;
    this.flew = false;
    this.downSince = null;
    this.landings = 0;
    this.flightFrom = null;
    this.lastAirMs = null;
  }

  gatePass() {}

  touch() {}

  lap() {}

  tick({ simMs, crashed, grounded, power, battery }) {
    if (crashed && !this.crashed) {
      this.flew = false;
      this.airSince = null;
      this.downSince = null;
      this.flightFrom = null;
    }
    this.crashed = Boolean(crashed);
    if (crashed) return;
    if (power && power.tankM3 > 0 && !power.running && !this.engineOut) {
      this.engineOut = true;
    }
    if (battery && battery !== 'ok' && !this.lowBattery && this.ctx && this.ctx.power === 'electric') {
      this.lowBattery = true;
    }
    if (!grounded) {
      this.downSince = null;
      if (this.airSince == null) this.airSince = simMs;
      if (this.flightFrom == null) this.flightFrom = simMs;
      if (simMs - this.airSince >= AIRBORNE_MS) this.flew = true;
      return;
    }
    this.airSince = null;
    if (!this.flew) {
      this.flightFrom = null;
      return;
    }
    if (this.downSince == null) this.downSince = simMs;
    if (simMs - this.downSince < LANDED_MS) return;
    this.flew = false;
    this.lastAirMs = this.downSince - this.flightFrom;
    this.flightFrom = null;
    this.downSince = null;
    this.landings += 1;
  }
}

/*
 * The Progress path (src/ui/progress-ui.js): every call is logged.
 * RunWatch only detects: a crash on the flag's rising edge, the engine
 * and battery edges, a landing. A new seat is a `seated` event carrying
 * the crash flag as it is seated, as src/main.js passes it.
 */
class ViaLog {
  constructor(ctx) {
    this.watch = new RunWatch();
    this.flight = new EventLog();
    this.simMs = 0;
    this.wasCrashed = false;
    this.start(ctx);
  }

  event(type, data) { return this.flight.append(type, this.simMs, data); }

  get airframe() { return this.watch.ctx ? this.watch.ctx.airframe : null; }

  start(ctx) {
    this.watch.start(ctx);
    this.event('seated', { airframe: ctx.airframe, fixedWing: Boolean(ctx.fixedWing), power: ctx.power ?? null, smallestPack: Boolean(ctx.smallestPack), crashed: Boolean(ctx.crashed) });
  }

  gatePass() {
    this.event('gate');
  }

  touch(kind) {
    this.event('touch', { kind });
  }

  lap(ms) {
    this.event('lap', { ms, airframe: this.airframe, medal: null });
  }

  tick(state) {
    this.simMs = state.simMs;
    if (state.crashed && !this.wasCrashed) this.event('crash', { airframe: this.airframe });
    this.wasCrashed = Boolean(state.crashed);
    const landings = this.watch.landings;
    for (const edge of this.watch.tick(state)) this.event(edge);
    if (this.watch.landings > landings) this.event('landing', { airframe: this.airframe, airMs: this.watch.lastAirMs });
  }
}

/* Both sides driven by the same steps: [call, arg]. A start's ctx says the
 * crash flag the next tick has, which is what the shell seats it with. */
function both(ctx, steps) {
  const via = new ViaLog(ctx);
  const legacy = new Legacy();
  legacy.start(ctx);
  for (const [call, arg] of steps) {
    legacy[call](arg);
    via[call](arg);
  }
  return { via, legacy };
}

/* A recorded flight: steps of [call, arg]. 4 ms ticks as the shell's
 * frames give them. */
function flight() {
  const steps = [];
  let t = 0;
  const tick = (n, s) => {
    for (let i = 0; i < n; i += 1) {
      t += 4;
      steps.push(['tick', { simMs: t, crashed: false, grounded: false, power: null, battery: 'ok', ...s }]);
    }
  };
  tick(10, { grounded: true });
  tick(600);
  for (let g = 0; g < 4; g += 1) {
    steps.push(['gatePass']);
    tick(20);
  }
  for (let i = 0; i < 30; i += 1) steps.push(['touch', 'gate']);
  steps.push(['gatePass']);
  for (let i = 0; i < 30; i += 1) steps.push(['touch', 'gate']);
  steps.push(['touch', 'canopy']);
  steps.push(['lap', 41000]);
  for (let g = 0; g < 12; g += 1) {
    steps.push(['gatePass']);
    tick(5);
  }
  steps.push(['lap', 39000]);
  steps.push(['lap', 38000]);
  tick(3, { crashed: true, grounded: true });
  tick(5, { grounded: true });
  tick(600);
  tick(50, { battery: 'warning' });
  tick(400, { grounded: true, battery: 'warning' });
  tick(600, { battery: 'warning' });
  steps.push(['touch', 'tree']);
  tick(400, { grounded: true, battery: 'critical' });
  steps.push(['gatePass']);
  steps.push(['lap', 40000]);
  return steps;
}

console.log('a recorded flight, logged as the shell logs it');
for (const ctx of [
  { airframe: 'striker2500', fixedWing: true, power: 'electric', smallestPack: false },
  { airframe: 'bramor2300', fixedWing: true, power: 'electric', smallestPack: false },
  { airframe: 'interceptor', fixedWing: false, power: null, smallestPack: false },
]) {
  const { via, legacy } = both(ctx, flight());
  check(`${ctx.airframe}: RunWatch detects the old judge's landings and edges`, legacy.landings === via.watch.landings && legacy.lastAirMs === via.watch.lastAirMs
    && legacy.engineOut === via.watch.engineOut && legacy.lowBattery === via.watch.lowBattery);
  const types = via.flight.events.map((e) => e.type);
  const count = (t) => types.filter((x) => x === t).length;
  check(`${ctx.airframe}: one crash on the crash flag's edge`, count('crash') === 1);
  check(`${ctx.airframe}: the landings RunWatch judged`, count('landing') === via.watch.landings && count('landing') >= 1, `${count('landing')} vs ${via.watch.landings}`);
  check(`${ctx.airframe}: LOW BATTERY logged once, on electric power only`, count('battery_low') === (ctx.power === 'electric' ? 1 : 0) && count('engine_out') === 0);
  /* A landing's time in the air: from the take off that began its
   * flight to its touchdown, so it is never longer than the log. */
  const airs = via.flight.events.filter((e) => e.type === 'landing').map((e) => e.airMs);
  check(`${ctx.airframe}: each landing carries its time in the air, whole and inside the flight`,
    airs.every((ms) => Number.isFinite(ms) && ms >= 2000 && ms <= via.simMs), airs.join());
  check(`${ctx.airframe}: every gate and lap`, count('gate') === 18 && count('lap') === 4);
  check(`${ctx.airframe}: sixty steps of contact are four touches`, count('touch') === 4, String(count('touch')));
  check(`${ctx.airframe}: on the sim clock, in order`, via.flight.events.every((e, i, all) => e.seq === i && (i === 0 || e.simMs >= all[i - 1].simMs)));
}

console.log('a new run key inside a crash');
{
  const striker = { airframe: 'striker2500', fixedWing: true, power: 'electric', smallestPack: false };
  const steps = [];
  let t = 0;
  const tick = (n, s = {}) => {
    for (let i = 0; i < n; i += 1) {
      t += 4;
      steps.push(['tick', { simMs: t, crashed: false, grounded: false, power: null, battery: 'ok', ...s }]);
    }
  };
  tick(10);
  tick(3, { crashed: true, grounded: true });
  steps.push(['start', { ...striker, crashed: true }]);
  tick(3, { crashed: true, grounded: true });
  tick(3);
  const { via } = both(striker, steps);
  check('a refit mid crash is not a second crash', via.flight.events.filter((e) => e.type === 'crash').length === 1);
}

console.log('the shell\'s producers');
{
  const src = (rel) => readFileSync(join(root, rel), 'utf8');
  const ui = src('src/ui/progress-ui.js');
  check('Progress logs a touch and pays only through the fold',
    ui.includes("touch(kind) {\n    this.event('touch', { kind });"));
  check('and nothing in it pays an achievement but awardFlight',
    !/award(Lap|Medal|Challenge|Place|Firsts|Bests|Best|AircraftChallenges?)\(/.test(ui) && (ui.match(/awardFlight\(/g) || []).length === 1);
  check('a new seat is logged, with the crash flag the shell seats it with',
    ui.includes("this.event('seated', {") && src('src/main.js').includes('ui.progress.startRun({ ...ctx, crashed });'));
  check('the engine and battery edges RunWatch detects are logged',
    ui.includes('for (const edge of this.watch.tick(state)) {\n      this.event(edge);'));
  check('a place found is logged and paid by the fold', ui.includes("this.event('found', { world, id });"));
  check('a new flight folds the last one to its end first', /startFlight\(simMs, roomNow = null\) \{\n    this\.foldFlight\(\);/.test(ui));
  check('and logs a crash and a landing, with its time in the air, from its tick',
    ui.includes("this.event('crash', { airframe: this.airframe })") && ui.includes("this.event('landing', { airframe: this.airframe, airMs: this.watch.lastAirMs })"));
  check('a spawn starts a flight', /function resetCraft[\s\S]*?ui\.progress\.startFlight\(simTimeMs/.test(src('src/main.js')));
  check('so does a developer hook putting the craft somewhere, so no lap across it is a best',
    /devHooks\.__placeCraft = [\s\S]{0,1600}?ui\.progress\.startFlight\(simTimeMs/.test(src('src/main.js')));
  check('a mission result is logged', src('src/ui/campaign.js').includes("ui.progress.event('mission_end'")
    && src('src/ui/opscampaign.js').includes("ui.progress.event('mission_end'"));
  const missionLogged = (file, type) => new RegExp(`ui\\.progress\\.event\\('${type}', \\{[^}]*airframe: ui\\.progress\\.airframe,?\\s*\\}\\);\\n\\s*ui\\.progress\\.foldFlight\\(\\);`).test(src(file));
  check('a mission start and result carry the seated aircraft and are folded at once',
    missionLogged('src/ui/campaign.js', 'mission_start') && missionLogged('src/ui/campaign.js', 'mission_end') && missionLogged('src/ui/opscampaign.js', 'mission_end'));
  check('an Interior match is logged begun when it goes live, its mission and the seated aircraft',
    /e\.type === 'state' && e\.to === 'live' && INTERIOR\.some\(\(m\) => m\.id === v\.mission\)\) \{[\s\S]{0,600}?ui\.progress\.event\('mission_start', \{ mission: v\.mission, airframe: ui\.progress\.airframe \}\);\n\s*ui\.progress\.foldFlight\(\);/.test(src('src/main.js')));
  check('a kill the room credited is logged, one a victim, on the seated aircraft, with the war\'s mission',
    src('src/main.js').includes("if (ev.type === 'dead' && ev.kills.length) {\n        ui.progress.killed(ev.kills, v.mission ?? null);")
    && ui.includes("this.event('kill', { airframe: this.airframe, victim: k.kind, mission });"));
  const main = src('src/main.js');
  check('an Interior match\'s result is logged before its debrief shows, and the debrief reads the run\'s log',
    /interiorScreen\.record\(match, v\);\n\s*debrief\.show\(\{[\s\S]{0,400}?events: ui\.progress\.runEvents\(\),\n\s*match: matchOf\(match, v\),/.test(main));
  check('the avionics camera\'s primary track is told every perception frame, and none without the Avionics HUD',
    src('src/main.js').includes('ui.progress.contact(heldTrack(tracks.snapshot));') && src('src/main.js').includes("avionicsHud.tick(false, paused, nowWall, null);\n      ui.progress.contact(null);"));
}

console.log('a kill the room credited, through the client, into the log');
{
  const { createRoomWar } = await import('../src/share/roomwar.js');
  const war = createRoomWar(() => {});
  war.onWelcome({ seat: 1, war: { state: 'lobby' } });
  const p = [0, 0, 0];
  war.onMessage({ type: 'war', op: 'dead', ids: [4, 5], credited: [4, 5], at: 100, by: 1, why: 'boom', p });
  war.onMessage({ type: 'war', op: 'dead', ids: [6], credited: [], at: 200, by: 1, why: 'boom', p });
  war.onMessage({ type: 'war', op: 'dead', ids: [7], credited: [7], at: 300, by: 2, why: 'boom', p });
  war.onMessage({ type: 'war', op: 'dead', ids: [8], at: 400, by: 1, why: 'boom', p });
  war.onMessage({ type: 'war', op: 'dead', ids: [9], credited: [9], at: 500, by: 1, why: 'pierce', p });
  const log = new EventLog();
  for (const ev of war.takeEvents()) {
    for (const k of ev.type === 'dead' ? ev.kills : []) {
      log.append('kill', ev.at, { airframe: 'cub1400', victim: k.kind });
    }
  }
  const kills = log.events.filter((e) => e.type === 'kill');
  check('only this seat\'s credited victims, a pierce\'s too: none for a blast credited nobody, another seat\'s, or a room that did not say',
    show(kills.map((e) => e.simMs)) === show([100, 100, 500]), show(kills));
  check('each carries its aircraft and victim as plain values', kills.every((e) => e.airframe === 'cub1400' && 'victim' in e && Object.isFrozen(e)));
}

console.log('a contact: the primary track\'s edges, never a frame');
{
  /* Progress.contact as src/ui/progress-ui.js writes it (that file needs
   * the DOM): a held edge for a new primary, a let go for the old one. */
  const log = new EventLog();
  let held = null;
  const contact = (simMs, track) => {
    if (track === held) {
      return;
    }
    if (held != null) {
      log.append('contact', simMs, { track: held, held: false });
    }
    if (track != null) {
      log.append('contact', simMs, { track, held: true });
    }
    held = track;
  };
  const ui = readFileSync(join(root, 'src', 'ui', 'progress-ui.js'), 'utf8');
  check('the producer is Progress.contact\'s', ui.includes("this.feedLesson(this.event('contact', { track: was, held: false }));")
    && ui.includes("this.feedLesson(this.event('contact', { track, held: true }));") && ui.includes('if (track === this.heldTrack) {\n      return;'));
  for (let t = 0; t < 100; t += 1) {
    contact(t, t < 10 ? null : t < 60 ? 3 : t < 80 ? 5 : null);
  }
  const got = log.events.map((e) => `${e.simMs}:${e.track}:${e.held}`);
  check('a hundred frames, two tracks: four edges, in order', show(got) === show(['10:3:true', '60:3:false', '60:5:true', '80:5:false']), show(got));
  check('each carries its track and held as plain values', log.events.every((e) => Number.isInteger(e.track) && typeof e.held === 'boolean' && Object.isFrozen(e)));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
