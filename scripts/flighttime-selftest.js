/*
 * flighttime-selftest.js: the pilot's flight time counter
 * (src/share/flighttime.js) in plain Node. Only flight counts: the
 * frames a pause, a replay, a menu, the ground, the launch stand or a
 * crash make add nothing; part seconds are carried, not rounded away; a
 * frame rate does not change the total; the record grows one slot; and
 * the words the screens show, in both languages. Also the board's craft
 * (src/share/stats.js): every aircraft this build flies reaches the board
 * under its own airframe id.
 *
 * The merge between computers is tested where the account server is,
 * tracks-api/accounts-selftest.js.
 *
 *   node scripts/flighttime-selftest.js
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

import {
  FLIGHT_ACTIVITIES, addFlight, createFlightClock, deviceId, flightTotals, splitDuration, stepsAreFlight,
} from '../src/share/flighttime.js';
import { MODES } from '../src/share/modes.js';
import { createFlightStats } from '../src/share/stats.js';
import { AIRFRAME_IDS } from '../configs/airframes.js';
import { flightTimeText } from '../src/ui/carousel.js';
import { plural, setLocale, str, useLocale } from '../src/strings/index.js';
import en from '../src/strings/en.js';
import es from '../src/strings/es.js';

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

/* The shell's flags for one frame of plain flight; each case below
 * changes one of them. */
const FLYING = {
  mode: 'flight', screen: 'flight', landed: false, launchStaging: false, faulted: false,
  crashed: false, wrecked: false, turtleWait: false, turtleRecover: false,
};

/*
 * A scripted session: `frames` of [steps, flags], fed to a clock the way
 * src/main.js feeds it (steps are 1 ms each, the plant's rate).
 */
function fly(frames, airframe = 'cub1400', activity = 'free') {
  const clock = createFlightClock();
  for (const [steps, flags] of frames) {
    clock.note(steps, { airborne: stepsAreFlight(flags), airframe, activity });
  }
  return clock;
}
const repeat = (n, frame) => Array.from({ length: n }, () => frame);

console.log('only flight counts');
check('plain flight counts', stepsAreFlight(FLYING));
for (const [why, patch] of [
  ['paused', { mode: 'paused' }],
  ['a replay', { mode: 'replay' }],
  ['the title', { mode: 'title' }],
  ['a menu over the flight', { screen: 'paused' }],
  ['on the ground', { landed: true }],
  ['on the launch stand', { launchStaging: true }],
  ['crashed', { crashed: true }],
  ['wrecked', { wrecked: true }],
  ['a plant fault', { faulted: true }],
  ['waiting upside down', { turtleWait: true }],
  ['being righted', { turtleRecover: true }],
]) {
  check(`${why} does not`, !stepsAreFlight({ ...FLYING, ...patch }));
}

console.log('the clock');
{
  /* Ten seconds of flight at 60 frames a second, with a pause, a replay
   * and a menu in between, each of which a frame still arrives for. */
  const frames = [
    ...repeat(600, [16, FLYING]),
    ...repeat(300, [16, { ...FLYING, mode: 'paused' }]),
    ...repeat(300, [16, { ...FLYING, mode: 'replay' }]),
    ...repeat(300, [16, { ...FLYING, screen: 'pilot' }]),
    ...repeat(25, [16, FLYING]),
  ];
  const clock = fly(frames);
  check('only the flying frames are held', clock.held() === 625 * 16, `${clock.held()}`);
  const got = clock.take();
  check('whole seconds are taken', got.length === 1 && got[0].seconds === 10 && got[0].airframe === 'cub1400' && got[0].activity === 'free', JSON.stringify(got));
  check('and the part second is carried, not dropped', clock.held() === 0);
}
{
  const at60 = fly(repeat(3000, [16, FLYING])).take()[0].seconds;
  const at144 = fly(repeat(6857, [7, FLYING])).take()[0].seconds;
  check('the frame rate does not change the total', at60 === 48 && at144 === 47, `${at60} ${at144}`);
}
{
  const clock = createFlightClock();
  clock.note(700, { airborne: true, airframe: 'zagi1219', activity: 'race' });
  check('under a second takes nothing yet', clock.take().length === 0 && clock.held() === 700);
  clock.note(700, { airborne: true, airframe: 'zagi1219', activity: 'race' });
  const got = clock.take();
  check('and is not lost: it joins the next', got.length === 1 && got[0].seconds === 1 && clock.held() === 400);
  clock.note(5000, { airborne: true, airframe: 'zagi1219', activity: 'war' });
  clock.note(3000, { airborne: true, airframe: 'cub1400', activity: 'war' });
  const split = clock.take().map((g) => `${g.airframe}/${g.activity}/${g.seconds}`).sort().join(' ');
  check('time is kept apart by aircraft and activity', split === 'cub1400/war/3 zagi1219/war/5', split);
  clock.note(1000, { airborne: true, airframe: 'Not An Id', activity: 'race' });
  clock.note(-50, { airborne: true, airframe: 'cub1400', activity: 'race' });
  check('a bad aircraft id or a negative step is refused', clock.held() === 400);
}

console.log('the record');
{
  let rec = addFlight({}, 'abcdef0123', 'cub1400', 'free', 30, '2026-10-03');
  rec = addFlight(rec, 'abcdef0123', 'cub1400', 'free', 30, '2026-10-04');
  rec = addFlight(rec, 'abcdef0123', 'striker2500', 'war', 3600, '2026-10-02');
  const t = flightTotals(rec);
  check('additions on one device sum', t.seconds === 3660 && t.byAirframe.cub1400 === 60 && t.byActivity.war === 3600);
  check('the first day is the earliest', t.first === '2026-10-02');
  check('nought seconds changes nothing', JSON.stringify(addFlight(rec, 'abcdef0123', 'cub1400', 'free', 0, '2026-01-01')) === JSON.stringify(rec));
  let threw = false;
  try {
    addFlight(rec, 'abcdef0123', 'cub1400', 'NOPE', 5, '2026-10-03');
  } catch (e) {
    threw = true;
  }
  check('a bad activity throws rather than vanishing', threw);
  check('an empty record totals nought', flightTotals(undefined).seconds === 0 && flightTotals({}).first === null);
  check('the activities are the mode registry\'s', FLIGHT_ACTIVITIES.join() === MODES.map((m) => m.id).join()
    && ['race', 'free', 'combat', 'tag', 'war'].every((id) => FLIGHT_ACTIVITIES.includes(id)));
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const id = deviceId(storage);
  check('a device id is made once and kept', /^[0-9a-f]{20}$/.test(id) && deviceId(storage) === id, id);
  const refusing = { getItem: () => { throw new Error('private'); }, setItem: () => { throw new Error('private'); } };
  check('and where storage refuses, the page still has one', /^[0-9a-f]{20}$/.test(deviceId(refusing)));
}

console.log('the words');
{
  check('12 h 40 min', splitDuration(45600).h === 12 && splitDuration(45600).m === 40);
  setLocale('en');
  check('flightTimeText reads hours and minutes', flightTimeText(45600) === '12 h 40 min', flightTimeText(45600));
  check('under an hour, minutes', flightTimeText(125) === '2 min');
  check('under a minute says so', flightTimeText(42) === 'under a minute');
  check('the Hangar line', str('flight.on_craft', { time: flightTimeText(45600), craft: 'Striker' }) === '12 h 40 min on the Striker');
  check('one hour flown, two hours flown', plural('count.hours_flown', 1) === '1 hour flown' && plural('count.hours_flown', 2) === '2 hours flown');
  await useLocale('es');
  check('en español', flightTimeText(42) === 'menos de un minuto'
    && str('flight.on_craft', { time: flightTimeText(45600), craft: 'Striker' }) === '12 h 40 min en el Striker'
    && plural('count.hours_flown', 2) === '2 horas voladas');
  setLocale('en');
  const keys = Object.keys(en).filter((k) => k.startsWith('flight.') || k.startsWith('count.hours_flown'));
  check('every flight time string is in both tables', keys.length >= 14 && keys.every((k) => typeof es[k] === 'string' && es[k].length > 0), `${keys.length}`);
}

console.log('the board\'s craft');
{
  /* Node's navigator has no sendBeacon, so sendEvent falls through to fetch. */
  const realFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = (_url, init) => {
    sent.push(JSON.parse(init.body));
    return Promise.resolve({ ok: true });
  };
  try {
    for (const id of AIRFRAME_IDS) {
      const stats = createFlightStats({
        describe: () => ({ craft: id, map: 'custom', input: 'keyboard' }),
        url: 'http://board.invalid/api/stats/events',
      });
      stats.tick(1000, { started: true, flying: true, laps: 0 });
      stats.leaving();
    }
  } finally {
    globalThis.fetch = realFetch;
  }
  const sessions = sent.filter((e) => e.kind === 'session').map((e) => e.craft);
  const flushes = sent.filter((e) => e.kind === 'flush').map((e) => e.craft);
  check('every aircraft reaches the board under its own airframe id, in the session', sessions.join() === AIRFRAME_IDS.join(), sessions.join());
  check('every aircraft reaches the board under its own airframe id, in the flush', flushes.join() === AIRFRAME_IDS.join(), flushes.join());
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
