/*
 * daytime-selftest.js: src/share/daytime.js agrees with what ships. Its
 * names are Itaipu's TIMES keys (and main.js keeps no copy of them), its
 * sun is TIMES's, its night threshold is the Interior's over a whole day
 * of src/maps/interior/sun.js minute by minute, and its night verdict is
 * every war mission's. A negative control moves the threshold by 0.01 and
 * the sweep must catch it.
 *
 * Slice 2, the game clock: each named time's hour stands its sun within a
 * degree of TIMES's and comes back as its name; an hour's named time is
 * night exactly when the Interior's sun is; hourAt is the Interior's
 * localHour; a clock off the network is checked; the frame's one daytime
 * never says night over a lit sky. And the room (edge/rooms/core.js
 * daytime, real RoomCore): only the host sets a free room's time, every
 * pilot is told it and a joiner is welcomed into it; a war room's clock
 * is its lobby's mission's time and its match's; an ops match's clock is
 * its mission's, standing until the go and moving from it at the rate
 * localHour moves the sun. Run with npm run daytime:selftest.
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

import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TIME_NAMES, SUN_OF, NIGHT_SIN, isNightSun, nightOfTime, TIME_HOUR, sunSinAt, timeOfHour, clockOfTime, clockOf, hourAt,
  timeOfClock, publishDaytime, daytimeNow,
} from '../src/share/daytime.js';
import { sunAt } from '../src/maps/interior/sun.js';
import { MISSIONS, missionTime } from '../src/share/war/missions/index.js';
import { M1_CLOCK, localHour, sunsetMs } from '../src/share/interior/clock.js';
import { PRIVATE_CAP, RoomCore } from '../edge/rooms/core.js';
import { PROTO, ROOM_LEVEL } from '../src/share/roomwire.js';
import { MISSIONS as OPS_MISSIONS, grounded, worldFor } from '../src/share/ops/missions.js';
import { opsRoom } from './lib/opsroom.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `: ${detail}` : ''}`);
  }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* three is served from a CDN and is not in node_modules. light.js uses it
 * at load only for THREE.Color, so a stub Color lets the live TIMES load. */
const stub = 'data:text/javascript,export class Color { constructor(r, g, b) { Object.assign(this, { r, g, b }); } }';
register(`data:text/javascript,export async function resolve(s, c, next) {
  return s === 'three' ? { url: ${JSON.stringify(stub)}, shortCircuit: true } : next(s, c);
}`);
const { TIMES } = await import('../src/maps/itaipu/look/light.js');

const src = (p) => readFile(join(root, p), 'utf8');

// Names.
check('TIME_NAMES are itaipu TIMES keys', same(TIME_NAMES, Object.keys(TIMES)), `${TIME_NAMES} vs ${Object.keys(TIMES)}`);
const main = await src('src/main.js');
check('main.js keeps no copy of the names: it imports TIME_NAMES', !/ADDRESS_TIMES/.test(main)
  && /import \{[^}]*\bTIME_NAMES\b[^}]*\} from '\.\/share\/daytime\.js'/.test(main));

// Sun per name.
for (const n of TIME_NAMES) {
  const t = TIMES[n];
  check(`SUN_OF.${n} is TIMES.${n}`, SUN_OF[n].azimuth === t.azimuth && SUN_OF[n].elevation === t.elevation,
    `${JSON.stringify(SUN_OF[n])} vs ${t.azimuth}/${t.elevation}`);
}

// The Interior's rule, read from its source so a change there fails here.
const look = await src('src/maps/interior/look.js');
const rule = look.match(/timeOfDay = sunDir\.y > (-?[0-9.]+) \? 'day' : 'night'/);
check('interior look night rule found', rule != null);
const interiorSin = rule ? Number(rule[1]) : NaN;
check('interior threshold is NIGHT_SIN', interiorSin === NIGHT_SIN, `${interiorSin} vs ${NIGHT_SIN}`);

/* Minutes over 0..24 h where a night rule disagrees with the Interior's. */
function sweep(night) {
  const bad = [];
  let flips = 0;
  let last = null;
  for (let m = 0; m <= 24 * 60; m += 1) {
    const y = sunAt(m / 60).dir[1];
    const want = !(y > interiorSin);
    if (night(y) !== want) bad.push(m);
    if (last != null && want !== last) flips += 1;
    last = want;
  }
  return { bad, flips };
}
const live = sweep(isNightSun);
check('interior sweep has a dusk and a dawn', live.flips === 2, `${live.flips} flips`);
check('isNightSun agrees with interior over 1441 minutes', live.bad.length === 0, `${live.bad.length} minutes, first ${live.bad[0]}`);

// Negative controls: a threshold 0.01 off either way must be caught.
for (const d of [0.01, -0.01]) {
  const wrong = sweep((y) => !(y > NIGHT_SIN + d));
  check(`negative control: NIGHT_SIN ${d > 0 ? '+' : ''}${d} is caught`, wrong.bad.length > 0, 'sweep saw no difference');
}

// Missions.
for (const m of Object.values(MISSIONS)) {
  const want = m.night === true || m.time === 'night';
  check(`mission ${m.id}: nightOfTime(missionTime) is ${want}`, nightOfTime(missionTime(m)) === want);
}
check('some mission is flown at night', Object.values(MISSIONS).some((m) => nightOfTime(missionTime(m))));

// The contract's edges.
check('nightOfTime(null) is day', nightOfTime(null) === false && nightOfTime(undefined) === false);
let threw = false;
try { nightOfTime('dusk'); } catch { threw = true; }
check('nightOfTime throws on an unknown name', threw);

// The game clock's arithmetic.
const deg = (sin) => (Math.asin(sin) * 180) / Math.PI;
let sunOff = 0;
for (let m = 0; m <= 24 * 60; m += 1) {
  sunOff = Math.max(sunOff, Math.abs(sunSinAt(m / 60) - sunAt(m / 60).dir[1]));
}
check('sunSinAt is sun.js\'s sun minute by minute', sunOff < 1e-12, `${sunOff}`);
for (const n of ['day', 'morning', 'golden']) {
  const el = deg(sunSinAt(TIME_HOUR[n]));
  check(`TIME_HOUR.${n} stands the sun within a degree of SUN_OF`, Math.abs(el - SUN_OF[n].elevation) <= 1, `${el.toFixed(2)} vs ${SUN_OF[n].elevation}`);
}
const noonEl = deg(sunSinAt(TIME_HOUR.noon));
check('TIME_HOUR.noon is the sun\'s highest', [-0.25, 0.25].every((d) => deg(sunSinAt(TIME_HOUR.noon + d)) < noonEl));
check('TIME_HOUR.night is dark', isNightSun(sunSinAt(TIME_HOUR.night)));
check('morning comes before noon and golden after it, on the same side as TIMES\'s azimuth',
  TIME_HOUR.morning < 12 && TIME_HOUR.day < 12 && TIME_HOUR.golden > 12 && SUN_OF.morning.azimuth < 180 && SUN_OF.golden.azimuth > 180);
for (const n of TIME_NAMES) {
  check(`timeOfHour(TIME_HOUR.${n}) is ${n}`, timeOfHour(TIME_HOUR[n]) === n, timeOfHour(TIME_HOUR[n]));
}
const nightBad = [];
for (let m = 0; m <= 24 * 60; m += 1) {
  if (nightOfTime(timeOfHour(m / 60)) !== !(sunAt(m / 60).dir[1] > interiorSin)) nightBad.push(m);
}
check('an hour\'s named time is night exactly when the Interior\'s sun is, every minute', nightBad.length === 0, `${nightBad.length}, first ${nightBad[0]}`);
check('timeOfHour wraps the day', timeOfHour(24 + TIME_HOUR.noon) === 'noon' && timeOfHour(TIME_HOUR.noon - 24) === 'noon');
check('clockOfTime: null is no clock, a name stands at its hour', clockOfTime(null) === null
  && same(clockOfTime('night'), { hour: TIME_HOUR.night, rate: 0, at: 0 }));
threw = false;
try { clockOfTime('dusk'); } catch { threw = true; }
check('clockOfTime throws on an unknown name', threw);
check('timeOfClock: null for no clock, the start\'s name for one', timeOfClock(null) === null && timeOfClock(clockOfTime('golden')) === 'golden');
let hourOff = 0;
for (const ms of [-60000, 0, 1, 90000, 3600000, sunsetMs(M1_CLOCK), 5 * 3600000]) {
  hourOff = Math.max(hourOff, Math.abs(hourAt({ hour: M1_CLOCK.startHour, rate: M1_CLOCK.rate, at: 4000 }, 4000 + ms) - localHour(M1_CLOCK, 4000, 4000 + ms)));
}
check('hourAt is localHour on the Interior\'s clock', hourOff < 1e-12, `${hourOff}`);
check('a standing clock needs no room time', hourAt(clockOfTime('noon'), NaN) === 12);
check('clockOf keeps a clock and refuses what is not one',
  same(clockOf({ hour: 16.5, rate: 1.58, at: 1234, x: 1 }), { hour: 16.5, rate: 1.58, at: 1234 })
  && [null, undefined, 'night', 22, {}, { hour: '22', rate: 0, at: 0 }, { hour: 22, rate: 0 }, { hour: -1, rate: 0, at: 0 },
    { hour: 25, rate: 0, at: 0 }, { hour: NaN, rate: 0, at: 0 }, { hour: 1, rate: Infinity, at: 0 }].every((x) => clockOf(x) === null));

// The frame's one daytime.
publishDaytime(true, 'day');
check('a night flag publishes night, whatever the world was built at', daytimeNow().night === true && daytimeNow().time === 'night');
publishDaytime(false, 'night');
check('a lit sky is never night, a world built at night notwithstanding', daytimeNow().night === false && daytimeNow().time === 'day');
publishDaytime(false, 'golden');
check('a lit sky keeps the named time it was built at', daytimeNow().time === 'golden');
publishDaytime(false, 'dusk');
check('a name that is not one is day', daytimeNow().time === 'day');
publishDaytime('night', 'night');
check('only true is night', daytimeNow().night === false);

// The room's game clock (edge/rooms/core.js daytime).
const T0 = 7_000_000;
let tokens = 0;
const newToken = () => {
  tokens += 1;
  return `d4${tokens.toString(16).padStart(30, '0')}`;
};
const sock = (name) => ({ name, got: [] });
const run = (actions) => {
  for (const a of actions) {
    if (a.send) a.send.got.push(typeof a.data === 'string' ? JSON.parse(a.data) : a.data);
  }
  return actions;
};
const profile = { airframe: 'cub1400', map: 'itaipu', figure: 1, livery: null, parts: null };
const hello = (room, so, extra = {}) => run(room.hello(so, {
  type: 'hello', proto: PROTO, build: 't', name: [1, 2, 30], profile, level: ROOM_LEVEL, ...extra,
}, T0, `10.0.3.${so.name.length}`, newToken));
/* A second apart, under the room's text rate. */
let saidAt = T0;
const say = (room, so, msg) => run(room.message(so, JSON.stringify(msg), saidAt += 1000));
const got = (so, type) => so.got.filter((m) => m.type === type);
const lastClock = (so) => {
  const told = got(so, 'daytime');
  return told.length ? told.at(-1).daytime : got(so, 'welcome')[0].daytime;
};
{
  const meta = { code: 'DAYT01', cap: PRIVATE_CAP, friendly: false, map: 'itaipu', epoch: T0 - 1000, daytime: 'golden' };
  const room = new RoomCore(meta);
  const host = sock('host');
  const b = sock('bb');
  hello(room, host);
  hello(room, b);
  check('a room is made at its creator\'s time, and welcomes pilots into it',
    same(got(host, 'welcome')[0].daytime, clockOfTime('golden')) && same(got(b, 'welcome')[0].daytime, clockOfTime('golden')));
  say(room, b, { type: 'daytime', time: 'night' });
  check('only the host sets it', meta.daytime === 'golden' && got(b, 'refused').some((m) => m.why === 'host'));
  say(room, host, { type: 'daytime', time: 'dusk' });
  say(room, host, { type: 'daytime', time: 'toString' });
  say(room, host, { type: 'daytime' });
  check('a time that is not one is nothing', meta.daytime === 'golden' && same(lastClock(b), clockOfTime('golden')));
  const stored = say(room, host, { type: 'daytime', time: 'night' });
  check('the host\'s night is stored and told to every pilot',
    stored.some((a) => a.store === 'meta') && meta.daytime === 'night'
    && same(lastClock(host), clockOfTime('night')) && same(lastClock(b), clockOfTime('night')));
  const nTold = got(b, 'daytime').length;
  say(room, host, { type: 'daytime', time: 'night' });
  run(room.tick(saidAt += 33));
  check('the same time again tells nobody', got(b, 'daytime').length === nTold);
  const c = sock('ccc');
  hello(room, c);
  check('a joiner is welcomed into the room\'s time', same(got(c, 'welcome')[0].daytime, clockOfTime('night')));
  const w = sock('watcher');
  hello(room, w, { watch: true });
  check('a watcher too', same(got(w, 'welcome')[0].daytime, clockOfTime('night')));
  say(room, host, { type: 'daytime', time: null });
  check('null is each world\'s own: no clock', meta.daytime === null && lastClock(b) === null && lastClock(c) === null, JSON.stringify([meta.daytime, lastClock(b), lastClock(c)]));
}
{
  /* A war room: its lobby's mission's time before the go, the match's on. */
  const night = Object.values(MISSIONS).find((m) => nightOfTime(missionTime(m)) && m.map === 'itaipu');
  const meta = {
    code: 'DAYT02', cap: PRIVATE_CAP, friendly: false, map: 'itaipu', epoch: T0 - 1000, mode: 'war', mission: night.id, daytime: 'noon',
  };
  const room = new RoomCore(meta, { devMissions: true });
  const host = sock('host');
  hello(room, host, { war: 9 });
  check(`a war room's lobby is at its mission's time (${night.id}, night), not its host's`,
    same(got(host, 'welcome')[0].daytime, clockOfTime('night')), JSON.stringify(got(host, 'welcome')[0].daytime));
  const day = Object.values(MISSIONS).find((m) => missionTime(m) == null && m.map === 'itaipu' && room.war.startable(m.id, room));
  say(room, host, { type: 'lobby', op: 'mission', mission: day.id });
  check(`the lobby's mission picked (${day.id}, no time of its own): each world's own, told`, room.meta.mission === day.id && lastClock(host) === null,
    JSON.stringify(lastClock(host)));
  say(room, host, { type: 'lobby', op: 'mission', mission: night.id });
  say(room, host, { type: 'war', op: 'start', mission: night.id });
  check('a war on is at its mission\'s time', room.war.on() && same(room.daytime(), clockOfTime('night')) && same(lastClock(host), clockOfTime('night')));
}
{
  /* A war started in a free room keeps its time over its end, and the
   * host's time comes back only with no match standing. */
  const night = Object.values(MISSIONS).find((m) => nightOfTime(missionTime(m)) && m.map === 'itaipu');
  const meta = { code: 'DAYT03', cap: PRIVATE_CAP, friendly: false, map: 'itaipu', epoch: T0 - 1000, daytime: 'noon' };
  const room = new RoomCore(meta, { devMissions: true });
  const host = sock('host');
  hello(room, host, { war: 9 });
  check('a free room before any war is at its host\'s time', same(lastClock(host), clockOfTime('noon')));
  say(room, host, { type: 'war', op: 'start', mission: night.id });
  const on = lastClock(host);
  say(room, host, { type: 'war', op: 'end' });
  check(`a war in a free room is at its mission's time (${night.id}), and stays so over its end`,
    same(on, clockOfTime('night')) && !room.war.on() && same(lastClock(host), clockOfTime('night')), `${JSON.stringify(on)} then ${JSON.stringify(lastClock(host))}`);
}
{
  /* An ops match: its mission's clock, standing until the go, then
   * moving at its rate from the go, as localHour has it. */
  const W = worldFor('interior');
  const M = grounded(OPS_MISSIONS['interior-1'], W);
  const e = opsRoom(M, { world: W, map: 'interior', devMissions: true, n: 2 });
  const m = e.r.ops.match;
  const c0 = e.socks[1].got.filter((x) => x.type === 'daytime').at(-1)?.daytime;
  check('an ops match is told its mission\'s clock, moving from the go', m && m.goAt != null
    && same(c0, { hour: M1_CLOCK.startHour, rate: M1_CLOCK.rate, at: m.goAt }), JSON.stringify(c0));
  const late = m.goAt + 20 * 60000;
  check('and every screen\'s hour on it is localHour\'s', Math.abs(hourAt(clockOf(c0), late) - localHour(M1_CLOCK, m.goAt, late)) < 1e-12);
  const before = timeOfClock(clockOf(c0));
  const after = timeOfHour(hourAt(clockOf(c0), m.goAt + 70 * 60000));
  check(`the Interior's day goes to night on it (${before} at the go, ${after} 70 min on)`, !nightOfTime(before) && after === 'night');
}

console.log(`daytime: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
