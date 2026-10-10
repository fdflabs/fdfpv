/*
 * platforms-hold-room.js: the room sees a pilot's held aircraft
 * (edge/rooms/ops.js hold, docs/campaign/interior/CONTRACT-HOLDS.md 4.3),
 * on the real room in Node. Part of npm run platforms:hold.
 *
 *   both       one pilot holding isr (Bramor) and recon (7 inch), flying
 *              the 7 inch 3 km away after leaving the Bramor: the room's
 *              pilots are two, each with its role, the Bramor on its
 *              circle; the view carries the hold for every screen
 *   by role    a zone trigger for isr is met by the held Bramor's orbit
 *              and wins the match; the 7 inch never counts for isr
 *   refused    a hold for the role flown, one far from where the room saw
 *              the pilot, and a malformed one
 *   restart    the hold survives a room restart (stored with the match)
 *   flown back the role flown again drops its hold
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

import { COUNTDOWN_MS } from '../edge/rooms/race.js';
import { makeWorld } from '../src/share/ops/fixtures/world.js';
import { check, finish, opsRoom } from './lib/opsroom.js';

const GO = COUNTDOWN_MS;
const world = makeWorld({ forests: [], routes: {} });
/* A Bramor left at 20 m/s along +x turns left onto a circle of radius
 * 87.5 m round [0, 87.5]: its far side is [0, 175]. */
const mission = (exitRole) => ({
  id: 'holds-test',
  campaign: 'test',
  map: 'test',
  z0: 0,
  classes: ['unknown'],
  roles: [{ id: 'isr', core: true, platforms: ['bramor2300'] }, { id: 'recon', core: true, platforms: ['7inch'] }],
  contacts: [],
  items: [],
  points: { far: { at: [0, 175], r: 15 } },
  stages: [{
    id: 'one',
    cues: [],
    exits: [{ when: { zone: 'far', roles: [exitRole], ms: 500 }, to: 'won', why: 'held' }, { when: { time: 600 }, to: 'lost', why: 'timeout' }],
  }],
});

/* One message, then 250 ms: the room allows a seat five a second
 * (edge/rooms/core.js TEXT_PER_S). */
function say(e, obj) {
  e.say(0, obj);
  e.fly(e.clock + 250);
}

function leave(e, extra = {}) {
  say(e, { type: 'ops', op: 'active', key: 'recon' });
  say(e, {
    type: 'ops', op: 'hold', key: 'isr', t: e.clock, pose: { p: [0, 0, 120], v: [20, 0, 0], airborne: true }, cam: null, ...extra,
  });
}

console.log('the room sees both');
{
  const e = opsRoom(mission('isr'), { n: 1, world });
  e.paths[0] = () => [0, 0, 120];
  e.fly(GO + 2000);
  const errsBefore = e.errors().length;
  say(e, {
    type: 'ops', op: 'hold', key: 'isr', t: e.clock, pose: { p: [0, 0, 120], v: [20, 0, 0], airborne: true }, cam: null,
  });
  check('a hold for the role flown is refused', e.errors().length === errsBefore + 1 && e.errors().at(-1).why === 'role', JSON.stringify(e.errors().at(-1)));
  say(e, { type: 'ops', op: 'active', key: 'recon' });
  say(e, {
    type: 'ops', op: 'hold', key: 'isr', t: e.clock, pose: { p: [900, 0, 120], v: [20, 0, 0], airborne: true }, cam: null,
  });
  check('a hold far from where the room saw the pilot is refused', e.errors().at(-1).why === 'pose', JSON.stringify(e.errors().at(-1)));
  say(e, {
    type: 'ops', op: 'hold', key: 'isr', t: e.clock, pose: { p: [0, 0, 120], v: [20, 0], airborne: true }, cam: null,
  });
  check('a malformed hold is refused', e.errors().at(-1).why === 'shape', JSON.stringify(e.errors().at(-1)));
  leave(e);
  e.paths[0] = () => [3000, 0, 60];
  e.fly(GO + 4000);
  const seat = e.seatOf(0);
  const v = e.view();
  const h = v.holds?.[seat]?.isr;
  check('the view carries the hold', h && h.airframe === 'bramor2300' && h.hold.kind === 'orbit', JSON.stringify(v.holds));
  const ps = e.r.ops.pilotsAt(e.r, e.clock - 200);
  const flown = ps.find((q) => !q.held);
  const held = ps.find((q) => q.held);
  const r = held ? Math.hypot(held.p[0] - h.hold.c[0], held.p[1] - h.hold.c[1]) : NaN;
  check('the room\'s pilots: the 7 inch flown as recon, the Bramor held as isr on its circle', ps.length === 2 && flown.role === 'recon' && held.role === 'isr' && held.airborne && Math.abs(r - h.hold.r) < 0.01,
    JSON.stringify(ps.map((q) => ({ role: q.role, held: Boolean(q.held), p: q.p.map((x) => Math.round(x)) }))));
  e.fly(GO + 20000);
  const w = e.view();
  check('a zone trigger for isr is met by the held Bramor and wins', w.state === 'won' && w.why === 'held', `${w.state} ${w.why}`);
}
{
  const e = opsRoom(mission('recon'), { n: 1, world });
  e.paths[0] = () => [0, 0, 120];
  e.fly(GO + 2000);
  leave(e);
  e.paths[0] = () => [3000, 0, 60];
  e.fly(GO + 30000);
  check('the same zone for recon is not met by the held Bramor', e.view().state === 'live', e.view().state);
  e.restart();
  e.fly(e.clock + 1000);
  const seat = e.seatOf(0);
  const ps = e.r.ops.pilotsAt(e.r, e.clock - 200);
  check('restart: the hold is still there', e.r.ops.view(e.r).holds?.[seat]?.isr?.hold.kind === 'orbit' && ps.some((q) => q.held && q.role === 'isr'));
  say(e, { type: 'ops', op: 'active', key: 'isr' });
  e.fly(e.clock + 200);
  check('flown back: the role flown again drops its hold', !e.view().holds?.[seat]?.isr && !e.r.ops.pilotsAt(e.r, e.clock - 100).some((q) => q.held), JSON.stringify(e.view().holds));
}
finish();
