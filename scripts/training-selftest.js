/*
 * training-selftest.js: every lesson (src/game/training.js), the Defence
 * three, is data that names things that exist, has its words in both
 * languages, and its judge passes the flight that does the step and fails
 * the near miss. Contract: docs/TRAINING-DAMAGE-CONTRACT.md. The fixed
 * wing, glider, first flight and multirotor lessons and their judges left
 * with Flight Club (the combat-only cut, 2026-10-20), and their cases
 * with them.
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

import { CERTS, LESSONS, LessonWatch, lessonFliesIn, LESSON_SETTINGS, restoreSettings, certsEarned, TRACKS, lessonById, heldTrack } from '../src/game/training.js';
import { EventLog } from '../src/game/events.js';
import { ACT1, released } from '../src/game/campaign.js';
import { PRACTICE_ID } from '../src/share/war/missions/itaipu-practice.js';
import en from '../src/strings/en.js';
import es from '../src/strings/es.js';

let failed = 0;
function expect(what, got, want) {
  const ok = got === want;
  if (!ok) {
    failed += 1;
  }
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}: ${JSON.stringify(got)}${ok ? '' : ` (want ${JSON.stringify(want)})`}`);
}

for (const l of LESSONS) {
  expect(`${l.id} flies a mission there is`, l.mission === PRACTICE_ID || ACT1.some((m) => m.id === l.mission), true);
  for (const k of [`training.lesson.${l.id}`, `training.lesson.${l.id}_note`]) {
    expect(`${k} en and es`, typeof en[k] === 'string' && typeof es[k] === 'string', true);
  }
}
expect('ids are unique', new Set(LESSONS.map((l) => l.id)).size, LESSONS.length);
expect('the Defence three and nothing else', LESSONS.map((l) => l.id).join(), 'defence_intercept,defence_track,defence_mission');
expect('the campaign lesson\'s mission is one a pilot may fly', released(lessonById('defence_mission').mission), true);
const FRAME_MS = 16;

/* Defence (TRAINING.md track 5): judged from the flight's event log
 * (src/game/events.js), the events made as the shell makes them. */
{
  const log = new EventLog();
  const killOf = (victim, mission) => log.append('kill', 1000, { airframe: 'interceptor', victim, mission });
  const caught = (kills) => {
    const w = new LessonWatch(lessonById('defence_intercept'));
    kills.forEach((k) => w.kill(k));
    return w.passed;
  };
  expect('interception: a Striker the room credited in the practice', caught([killOf('strike', PRACTICE_ID)]), true);
  expect('interception: a Scout in the practice, then a Striker', caught([killOf('scout', PRACTICE_ID), killOf('strike', PRACTICE_ID)]), true);
  expect('interception: a Scout in the practice', caught([killOf('scout', PRACTICE_ID)]), false);
  expect('interception: a Striker in a campaign war round', caught([killOf('strike', 'itaipu-1')]), false);
  expect('interception: a kill from a view with no mission', caught([killOf('strike', null)]), false);
  expect('interception: practice and track lessons are flown in the practice', ['defence_intercept', 'defence_track'].every((id) => lessonById(id).mission === PRACTICE_ID), true);

  /* Tracking: contact edges at their simMs, the hold timed on the tick. */
  const tracked = (edges, untilMs, crashAt = null) => {
    const w = new LessonWatch(lessonById('defence_track'));
    const l = new EventLog();
    const pending = [...edges];
    for (let t = 0; t <= untilMs; t += FRAME_MS) {
      while (pending.length && pending[0][0] <= t) {
        const [at, track, held] = pending.shift();
        w.contact(l.append('contact', at, { track, held }));
      }
      w.tick({ simMs: t, crashed: crashAt != null && t >= crashAt && t < crashAt + FRAME_MS, grounded: false });
    }
    return w.passed;
  };
  expect('tracking: held 10 s', tracked([[1000, 4, true]], 11100), true);
  expect('tracking: held 9.9 s', tracked([[1000, 4, true]], 10900), false);
  expect('tracking: lost at 9 s, held again for 5 s', tracked([[1000, 4, true], [10000, 4, false], [10500, 4, true]], 15500), false);
  expect('tracking: lost at 9 s, held again for 10 s', tracked([[1000, 4, true], [10000, 4, false], [10500, 4, true]], 20600), true);
  expect('tracking: another track taking over starts the hold again', tracked([[1000, 4, false], [1000, 7, true], [6000, 4, false], [6000, 9, true]], 15900), false);
  expect('tracking: another track\'s lost edge does not break this one\'s hold', tracked([[1000, 4, true], [5000, 7, false]], 11100), true);
  expect('tracking: a crash mid hold starts it again', tracked([[1000, 4, true]], 11100, 6000), false);
  const snap = (primaryId, tracks) => ({ primaryId, tracks, lost: [] });
  expect('the held track is the camera\'s primary, seen', heldTrack(snap(3, [{ id: 2, stale: false }, { id: 3, stale: false }])), 3);
  expect('a stale primary is not held', heldTrack(snap(3, [{ id: 3, stale: true }])), null);
  expect('no primary, no track held', heldTrack(snap(null, [{ id: 3, stale: false }])), null);

  /* Working together: the mission_end campaign.js logs for Act 1. */
  const ended = (ends) => {
    const w = new LessonWatch(lessonById('defence_mission'));
    const l = new EventLog();
    ends.forEach((e) => w.missionEnd(l.append('mission_end', 1000, { airframe: 'interceptor', stars: 1, ...e })));
    return w.passed;
  };
  expect('working together: mission 1 won', ended([{ mission: ACT1[0].id, won: true }]), true);
  expect('working together: mission 1 lost', ended([{ mission: ACT1[0].id, won: false }]), false);
  expect('working together: mission 2 won', ended([{ mission: ACT1[1].id, won: true }]), false);
  expect('working together: its mission is Act 1\'s first', lessonById('defence_mission').mission, ACT1[0].id);
}
expect('every lesson is on a listed track', LESSONS.every((l) => TRACKS.includes(l.track)), true);
for (const t of TRACKS) {
  expect(`training.track.${t} en and es`, typeof en[`training.track.${t}`] === 'string' && typeof es[`training.track.${t}`] === 'string', true);
}

/* Certifications: every lesson of the track passed; one short earns nothing. */
const allOf = (track, t = 5) => Object.fromEntries(LESSONS.filter((l) => l.track === track).map((l) => [l.id, t]));
for (const t of CERTS) {
  expect(`${t}: a track with a certification is a listed track, its words in en and es`, TRACKS.includes(t) && typeof en[`training.cert.${t}`] === 'string' && typeof es[`training.cert.${t}`] === 'string', true);
  expect(`${t}: every lesson passed earns it`, certsEarned(allOf(t)).join(), t);
  const short = allOf(t);
  delete short[Object.keys(short).at(-1)];
  expect(`${t}: its last lesson missing earns nothing`, certsEarned(short).length, 0);
}
expect('a time that is not a pass earns nothing', certsEarned({ ...allOf('defence'), defence_mission: 0 }).length, 0);
expect('a pre-cut record\'s fixed wing lessons earn nothing', certsEarned({ wing_height: 5, wing_eight: 5, wing_stall: 5, wing_approaches: 5, wing_deadstick: 5 }).length, 0);

/* A LESSON'S SETTINGS held before the cut go back once (src/main.js).
 * `seat` stands in for settings.js seatAirframe, which also resets the
 * tune. The record is what heldSettings wrote: the four keys. */
{
  const seat = (st, id) => {
    st.airframe = id;
    st.tune = `${id}-default`;
    st.seats = (st.seats || 0) + 1;
  };
  const ok = () => true;
  const before = { airframe: 'bramor2300', tune: 'bramor-as3x', flightMode: 'angle', weather: 'calm', livery: 'kept' };
  const held = JSON.parse(JSON.stringify(Object.fromEntries(LESSON_SETTINGS.map((k) => [k, before[k]]))));
  const s = { airframe: 'radian2000', tune: 'radian-stab', flightMode: 'acro', weather: 'breeze', livery: 'kept' };
  expect('what was held puts every one back, through storage\'s JSON', restoreSettings(s, held, seat, ok)
    && LESSON_SETTINGS.every((k) => s[k] === before[k]) && s.livery === 'kept', true);
  const t = { airframe: 'timber1500', tune: 'timber-stab', flightMode: 'angle', weather: 'calm' };
  restoreSettings(t, held, seat, (k, v) => k !== 'weather' && v !== 'bramor-as3x');
  expect('a value the build refuses is not put back', [t.airframe, t.tune, t.weather].join(), 'bramor2300,bramor2300-default,calm');
  const u = { ...before };
  restoreSettings(u, held, seat, ok);
  expect('the same aircraft is not seated again', u.seats, undefined);
  expect('nothing held, nothing to put back', restoreSettings(u, null, seat, ok) || restoreSettings(u, 'x', seat, ok), false);
}

/* INTERRUPTIONS (docs/redesign/TRAINING.md 10). */
{
  const crashes = new LessonWatch(lessonById('defence_track'));
  const segs = [{ ms: 5000 }, { ms: 400, crashed: true }, { ms: 3000 }, { ms: 32, crashed: true }, { ms: 1000 }];
  let ct = 0;
  for (const seg of segs) {
    for (const end = ct + seg.ms; ct < end; ct += FRAME_MS) {
      crashes.tick({ simMs: ct, crashed: Boolean(seg.crashed) });
    }
  }
  expect('crash: each crash restarts the steps and is counted once, however many frames report it', [crashes.crashes, crashes.step].join(), '2,0');
  expect('rooms: a Defence lesson keeps the war\'s', LESSONS.every((l) => lessonFliesIn(l, 'war')), true);
  expect('rooms: and no other', ['free', 'ops', null].some((m) => LESSONS.some((l) => lessonFliesIn(l, m))), false);
  for (const k of ['training.interrupted', 'training.interrupt_held', 'training.interrupt_crash', 'training.interrupt_room', 'training.interrupt_reload']) {
    expect(`${k} en and es`, typeof en[k] === 'string' && typeof es[k] === 'string' && en[k] !== es[k], true);
  }
}

console.log(failed ? `FAIL, ${failed} case(s)` : `PASS, ${LESSONS.length} lessons judged`);
process.exit(failed ? 1 : 0);
