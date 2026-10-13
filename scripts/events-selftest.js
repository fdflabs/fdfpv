/*
 * events-selftest.js: the gameplay event log (src/game/events.js), and
 * RunWatch judged from it.
 *
 *     node scripts/events-selftest.js      (npm run events:selftest)
 *
 * The log is typed and append only: an event outside the vocabulary, one
 * without a sim time, data that is not a plain value, or an append after
 * the flight ended all throw, and an event cannot be changed once
 * appended. A flight in a room stamps the room clock beside the sim one.
 *
 * RunWatch reads gate, touch and lap from the log, so the challenges must
 * come out exactly as they did from direct calls. A recorded flight (gates,
 * a contact reported every step, laps, a crash, a dead stick landing) is
 * driven both ways, call for call, the log's way as src/ui/progress-ui.js
 * Progress does it; and a log folded afterwards into a fresh RunWatch
 * gives the same answers again.
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
import { EVENT_TYPES, EventLog, feedRunWatch } from '../src/game/events.js';
import { RunWatch, STREAK_HOOPS } from '../src/game/progress.js';

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
    'round', 'joined', 'left', 'mission_start', 'mission_end'];
  check('fifteen types, these', show([...EVENT_TYPES].sort()) === show([...want].sort()), EVENT_TYPES.join());
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
  check('a failed append leaves the log as it was', log.events.length === 3);
  log.end(2000);
  check('the flight ends once, at its sim time', log.ended && log.endSimMs === 2000);
  check('nothing is appended after it ends', throws(() => log.append('crash', 2100)));
}
{
  const log = new EventLog();
  check('a lap carries its medal, or null on a course without', log.append('lap', 1, { ms: 1, airframe: 'x', medal: 'bronze' }).medal === 'bronze'
    && log.append('lap', 2, { ms: 1, airframe: 'x', medal: null }).medal === null);
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
 * The Progress path (src/ui/progress-ui.js): gate, touch and lap become
 * events and RunWatch reads the event; the tick is a direct call, with a
 * crash on its rising edge and a landing when RunWatch counts one.
 */
class ViaLog {
  constructor(ctx) {
    this.watch = new RunWatch();
    this.watch.start(ctx);
    this.flight = new EventLog();
    this.simMs = 0;
    this.wasCrashed = false;
  }

  event(type, data) { return this.flight.append(type, this.simMs, data); }

  get airframe() { return this.watch.ctx ? this.watch.ctx.airframe : null; }

  gatePass() { return feedRunWatch(this.watch, this.event('gate')); }

  touch(kind) {
    this.watch.touch(kind);
    this.event('touch', { kind });
    return [];
  }

  start(ctx) { this.watch.start(ctx); return []; }

  lap(ms) { return feedRunWatch(this.watch, this.event('lap', { ms, airframe: this.airframe, medal: null })); }

  tick(state) {
    this.simMs = state.simMs;
    if (state.crashed && !this.wasCrashed) this.event('crash', { airframe: this.airframe });
    this.wasCrashed = Boolean(state.crashed);
    const landings = this.watch.landings;
    const out = this.watch.tick(state);
    if (this.watch.landings > landings) this.event('landing', { airframe: this.airframe });
    return out;
  }
}
class Direct {
  constructor(ctx) {
    this.watch = new RunWatch();
    this.watch.start(ctx);
  }

  gatePass() { return this.watch.gatePass(); }

  touch(kind) { this.watch.touch(kind); return []; }

  start(ctx) { this.watch.start(ctx); return []; }

  lap() { return this.watch.lap(); }

  tick(state) { return this.watch.tick(state); }
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
  for (let g = 0; g < STREAK_HOOPS + 2; g += 1) {
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

console.log('RunWatch judges the same from the log as from direct calls');
for (const ctx of [
  { airframe: 'timber1500', fixedWing: true, power: 'electric', smallestPack: false },
  { airframe: 'slowstick1180', fixedWing: true, power: 'electric', smallestPack: false },
  { airframe: 'interceptor', fixedWing: false, power: null, smallestPack: false },
]) {
  const via = new ViaLog(ctx);
  const direct = new Direct(ctx);
  const a = [];
  const b = [];
  for (const [call, arg] of flight()) {
    a.push(direct[call](arg));
    b.push(via[call](arg));
  }
  const awarded = a.flat();
  check(`${ctx.airframe}: the same challenges at the same calls`, show(a) === show(b), `${awarded.join()} vs ${b.flat().join()}`);
  check(`${ctx.airframe}: and RunWatch ends in the same state`, show(direct.watch) === show(via.watch));
  if (ctx.airframe === 'timber1500') {
    check('the flight earns something to compare', ['first_course', 'hoops_10', 'deadstick'].every((id) => awarded.includes(id)), awarded.join());
  }
  const types = via.flight.events.map((e) => e.type);
  const count = (t) => types.filter((x) => x === t).length;
  check(`${ctx.airframe}: one crash on the crash flag's edge`, count('crash') === 1);
  check(`${ctx.airframe}: the landings RunWatch judged`, count('landing') === via.watch.landings && count('landing') >= 1, `${count('landing')} vs ${via.watch.landings}`);
  check(`${ctx.airframe}: every gate and lap`, count('gate') === 18 && count('lap') === 4);
  check(`${ctx.airframe}: sixty steps of contact are four touches`, count('touch') === 4, String(count('touch')));
  check(`${ctx.airframe}: on the sim clock, in order`, via.flight.events.every((e, i, all) => e.seq === i && (i === 0 || e.simMs >= all[i - 1].simMs)));

  /* Folded afterwards: gate, touch and lap alone, with no ticks between,
   * into a fresh RunWatch, against the same calls made directly. */
  const fold = new RunWatch();
  fold.start(ctx);
  const plain = new RunWatch();
  plain.start(ctx);
  const folded = [];
  const called = [];
  for (const e of via.flight.events) {
    folded.push(feedRunWatch(fold, e));
  }
  for (const [call, arg] of flight()) {
    if (call === 'gatePass') called.push(plain.gatePass());
    if (call === 'lap') called.push(plain.lap());
    if (call === 'touch') plain.touch(arg);
  }
  check(`${ctx.airframe}: a folded log gives the direct calls' answers`, show(folded.flat()) === show(called.flat()), `${folded.flat().join()} vs ${called.flat().join()}`);
}

console.log('a new run key inside a contact or a crash');
{
  const timber = { airframe: 'timber1500', fixedWing: true, power: 'electric', smallestPack: false };
  const small = { ...timber, smallestPack: true };
  const steps = [];
  let t = 0;
  const tick = (n, s = {}) => {
    for (let i = 0; i < n; i += 1) {
      t += 4;
      steps.push(['tick', { simMs: t, crashed: false, grounded: false, power: null, battery: 'ok', ...s }]);
    }
  };
  tick(10);
  steps.push(['touch', 'gate']);
  steps.push(['start', small]);
  steps.push(['touch', 'gate']);
  steps.push(['lap', 40000]);
  tick(3, { crashed: true, grounded: true });
  steps.push(['start', timber]);
  tick(3, { crashed: true, grounded: true });
  tick(3);
  const via = new ViaLog(timber);
  const direct = new Direct(timber);
  const a = [];
  const b = [];
  for (const [call, arg] of steps) {
    a.push(direct[call](arg));
    b.push(via[call](arg));
  }
  check('a refit on a rim still spoils the clean lap', show(a) === show(b) && !a.flat().includes('timber_clean'), `${a.flat().join()} vs ${b.flat().join()}`);
  check('a refit mid crash is not a second crash', via.flight.events.filter((e) => e.type === 'crash').length === 1);
}

console.log('the shell\'s producers');
{
  const src = (rel) => readFileSync(join(root, rel), 'utf8');
  const ui = src('src/ui/progress-ui.js');
  check('Progress feeds RunWatch gate and lap from the log, and tells it every touch',
    ui.includes("feedRunWatch(this.watch, this.event('gate'))")
    && ui.includes("this.watch.touch(kind);\n    this.event('touch', { kind });")
    && ui.includes("const lapped = this.event('lap', { ms, airframe: this.airframe, medal });\n    const done = feedRunWatch(this.watch, lapped);"));
  check('and a lesson judges the lap from that same event', ui.includes('this.lesson.lap(lapped, ghostMs);'));
  check('and logs a crash and a landing from its tick',
    ui.includes("this.event('crash', { airframe: this.airframe })") && ui.includes("this.event('landing', { airframe: this.airframe })"));
  check('a spawn starts a flight', /function resetCraft[\s\S]*?ui\.progress\.startFlight\(simTimeMs/.test(src('src/main.js')));
  check('a room game\'s end is logged as a round, Streamer Combat and Catch the Ace!',
    src('src/main.js').includes("ui.progress.roundFinished('combat', worldId())") && src('src/main.js').includes("ui.progress.roundFinished('tag', worldId())")
    && ui.includes("this.event('round', { game, world, ...more })"));
  check('a room race this pilot finished is a round with its grid\'s size, once per race',
    src('src/main.js').includes("const over = roomRace.takeResults();")
    && src('src/main.js').includes("ui.progress.roundFinished('race', worldId(), { pilots: (over.racers || []).length })"));
  check('a mission result is logged', src('src/ui/campaign.js').includes("ui.progress.event('mission_end'")
    && src('src/ui/opscampaign.js').includes("ui.progress.event('mission_end'"));
  const missionLogged = (file, type) => new RegExp(`ui\\.progress\\.event\\('${type}', \\{[^}]*airframe: ui\\.progress\\.airframe \\}\\);\\n\\s*ui\\.progress\\.foldFlight\\(\\);`).test(src(file));
  check('a mission start and result carry the seated aircraft and are folded at once',
    missionLogged('src/ui/campaign.js', 'mission_start') && missionLogged('src/ui/campaign.js', 'mission_end') && missionLogged('src/ui/opscampaign.js', 'mission_end'));
  check('a kill the room credited is logged, one a victim, on the seated aircraft',
    src('src/main.js').includes("if (ev.type === 'dead' && ev.kills.length) {\n        ui.progress.killed(ev.kills);")
    && ui.includes("this.event('kill', { airframe: this.airframe, victim: k.kind });"));
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
