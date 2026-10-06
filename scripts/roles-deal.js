/*
 * roles-deal.js: roles in an ops mission, on the real room in Node
 * (docs/campaign/interior/TECH-NEEDS.md N16, CONTRACT-P0.md section 5).
 * npm run roles:deal.
 *
 *   the deal     headless rooms at 1, 2, 3, 6 and 8 pilots: every core
 *                role held by exactly one pilot, every pilot holding a
 *                role, one scaling copy per pilot past the core count; the
 *                same seed deals the same, other seeds deal differently
 *   guides       a line heard by everyone reaches everyone, a role's line
 *                only its holders, a solo pilot every role it holds
 *   change       a free take (a new scaling copy, the old one dropped), a
 *                held core role refused, a two party swap accepted, a
 *                declined one gone, a lapsed one refused
 *   locks        the host's lock refuses changes and only the host sets
 *                it; a stage with lockRoles and the briefing refuse them
 *   joins, leaves a late joiner dealt a role; a reload keeps its roles; a
 *                leaver's core role passes on after AWAY_MS to the pilot
 *                holding fewest
 *   no bound     the pure deal at 16 and 64 seats, two core roles
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
import { AWAY_MS } from '../edge/rooms/ops.js';
import { SWAP_MS, deal, roleOf } from '../src/share/ops/roles.js';
import { makeWorld } from '../src/share/ops/fixtures/world.js';
import { check, finish, opsRoom } from './lib/opsroom.js';

const GO = COUNTDOWN_MS;
const world = makeWorld({});

function mission(id, roles, more = {}) {
  return {
    id,
    campaign: 'test',
    map: 'test',
    z0: 0,
    classes: ['unknown'],
    roles,
    contacts: [],
    items: [],
    points: {},
    stages: [
      {
        id: 'one',
        cues: [
          { at: 1, radio: 'line-all' },
          { at: 1, radio: 'line-tracker', heard: { role: ['tracker'] } },
          { at: 1, radio: 'line-isr', heard: { role: ['isr'] } },
        ],
        exits: [{ when: { time: 60 }, to: 'next' }],
      },
      { id: 'two', lockRoles: true, exits: [{ when: { time: 30 }, to: 'won' }] },
    ],
    ...more,
  };
}

const ONE_CORE = mission('roles-a', [{ id: 'isr', core: true, guide: 'g1' }, { id: 'tracker', core: false, guide: 'g1' }]);
const TWO_CORE = mission('roles-b', [{ id: 'isr', core: true, guide: 'g1' }, { id: 'recon', core: true, guide: 'g1' }, { id: 'tracker', core: false, guide: 'g1' }]);
const FILM = mission('roles-film', ONE_CORE.roles, { filmMs: 10000 });

/* The view's roles as the room dealt them. */
const rolesOf = (e) => e.view(0).roles;

/* Whether a deal keeps the invariants: each core once, each seat a role. */
function sound(r, defs, seats) {
  const all = Object.values(r.held).flat();
  const cores = defs.filter((d) => d.core).map((d) => d.id);
  return cores.every((id) => all.filter((k) => k === id).length === 1)
    && seats.every((s) => (r.held[s] ?? []).length >= 1)
    && seats.every((s) => r.held[s].includes(r.active[s]))
    && new Set(all).size === all.length;
}

function fly(e, n) {
  for (let i = 0; i < n; i += 1) {
    e.paths[i] = () => [100 * i, 0, 400];
  }
}

console.log('the deal at 1, 2, 3, 6, 8 pilots');
for (const n of [1, 2, 3, 6, 8]) {
  const e = opsRoom(ONE_CORE, { n, world });
  fly(e, n);
  e.fly(GO + 2000);
  const r = rolesOf(e);
  const seats = e.socks.map((_, i) => e.seatOf(i));
  check(`${n} pilots: ISR held once, every pilot a role, active held`, sound(r, ONE_CORE.roles, seats), JSON.stringify(r.held));
  const copies = Object.values(r.held).flat().filter((k) => roleOf(k) === 'tracker');
  check(`${n} pilots: ${Math.max(0, n - 1)} tracker copies, numbered 1 to ${n - 1}`, copies.length === n - 1
    && copies.map((k) => Number(k.split(':')[1])).sort((a, b) => a - b).every((v, j) => v === j + 1), copies.join());
  /* Guides: line-all to everybody, line-tracker only to trackers. */
  let routed = true;
  for (let i = 0; i < n; i += 1) {
    const got = e.cues(i).map((c) => c.radio);
    const held = r.held[seats[i]].map(roleOf);
    const want = ['line-all', ...(held.includes('tracker') ? ['line-tracker'] : []), ...(held.includes('isr') ? ['line-isr'] : [])].sort();
    if (got.slice().sort().join() !== want.join()) {
      routed = false;
    }
  }
  check(`${n} pilots: each hears everyone's lines and only its own roles' guides`, routed);
  /* The same seed, a fresh room: the same deal. */
  const again = opsRoom(ONE_CORE, { n, world });
  check(`${n} pilots: the same seed deals the same`, JSON.stringify(rolesOf(again).held) === JSON.stringify(r.held));
}
{
  const holders = new Set();
  for (const seed of [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95]) {
    const e = opsRoom(ONE_CORE, { n: 3, world, seed });
    holders.add(Object.entries(rolesOf(e).held).find(([, ks]) => ks.includes('isr'))[0]);
  }
  check('3 pilots over ten seeds: the ISR goes to more than one seat (a random deal)', holders.size > 1, [...holders].join());
}

console.log('a solo pilot and two core roles');
{
  const e = opsRoom(TWO_CORE, { n: 1, world });
  fly(e, 1);
  e.fly(GO + 2000);
  const r = rolesOf(e);
  const seat = e.seatOf(0);
  check('solo: holds both core roles', r.held[seat].slice().sort().join() === 'isr,recon', r.held[seat].join());
  e.say(0, { type: 'ops', op: 'active', key: 'recon' });
  check('solo: switches its active role to the other', rolesOf(e).active[seat] === 'recon');
  check('solo: hears the ISR guide (holds the role), not the tracker one', e.cues(0).map((c) => c.radio).sort().join() === 'line-all,line-isr');
  for (const n of [2, 3]) {
    const f = opsRoom(TWO_CORE, { n, world });
    const seats = f.socks.map((_, i) => f.seatOf(i));
    const rr = rolesOf(f);
    check(`${n} pilots, two core roles: each core once, spread one each`, sound(rr, TWO_CORE.roles, seats)
      && seats.filter((s) => rr.held[s].some((k) => k === 'isr' || k === 'recon')).length === 2);
  }
}

console.log('take, swap, decline, lapse');
{
  const e = opsRoom(ONE_CORE, { n: 3, world });
  fly(e, 3);
  e.fly(GO + 2000);
  let r = rolesOf(e);
  const seatOf = (i) => e.seatOf(i);
  const iIsr = [0, 1, 2].find((i) => r.held[seatOf(i)].includes('isr'));
  const iTr = [0, 1, 2].filter((i) => i !== iIsr);
  const was = r.held[seatOf(iTr[0])][0];
  e.say(iTr[0], { type: 'ops', op: 'take', role: 'tracker' });
  r = rolesOf(e);
  const now = r.held[seatOf(iTr[0])];
  check('take: a tracker takes a new scaling copy and drops its old one', now.length === 1 && now[0] !== was && roleOf(now[0]) === 'tracker' && Number(now[0].split(':')[1]) === 3, `${was} -> ${now}`);
  e.say(iTr[1], { type: 'ops', op: 'take', role: 'isr' });
  check('take: a core role somebody holds is refused', e.errors(iTr[1]).at(-1)?.error === 'role' && rolesOf(e).held[seatOf(iIsr)].includes('isr'));
  const theirs = rolesOf(e).held[seatOf(iTr[1])][0];
  e.say(iIsr, {
    type: 'ops', op: 'swap', seat: seatOf(iTr[1]), give: 'isr', take: theirs,
  });
  const req = rolesOf(e).swaps.at(-1);
  check('swap: the request is in the view for both', req && req.from === seatOf(iIsr) && req.to === seatOf(iTr[1]) && req.until === e.clock + SWAP_MS);
  e.say(iTr[1], { type: 'ops', op: 'swapAccept', id: req.id });
  r = rolesOf(e);
  check('swap: accepted, the keys changed hands', r.held[seatOf(iTr[1])].includes('isr') && r.held[seatOf(iIsr)].includes(theirs) && !r.swaps.length
    && sound(r, ONE_CORE.roles, [0, 1, 2].map(seatOf)));
  e.say(iIsr, {
    type: 'ops', op: 'swap', seat: seatOf(iTr[1]), give: theirs, take: 'isr',
  });
  e.say(iTr[1], { type: 'ops', op: 'swapDecline', id: rolesOf(e).swaps.at(-1).id });
  check('swap: a declined request is gone and nothing moved', !rolesOf(e).swaps.length && rolesOf(e).held[seatOf(iTr[1])].includes('isr'));
  e.say(iIsr, {
    type: 'ops', op: 'swap', seat: seatOf(iTr[1]), give: theirs, take: 'isr',
  });
  const late = rolesOf(e).swaps.at(-1).id;
  e.fly(e.clock + SWAP_MS + 1000);
  e.say(iTr[1], { type: 'ops', op: 'swapAccept', id: late });
  check('swap: a lapsed request is refused', e.errors(iTr[1]).at(-1)?.error === 'swap' && rolesOf(e).held[seatOf(iTr[1])].includes('isr'));
}

console.log('locks');
{
  const e = opsRoom(ONE_CORE, { n: 2, world });
  fly(e, 2);
  e.fly(GO + 2000);
  const host = 0;
  e.say(1, { type: 'ops', op: 'lock', on: true });
  check('lock: a pilot who is not the host cannot set it', rolesOf(e).locked === false);
  e.say(host, { type: 'ops', op: 'lock', on: true });
  check('lock: the host sets it, the view says why', rolesOf(e).locked === true && rolesOf(e).beat === 'host');
  e.say(1, { type: 'ops', op: 'take', role: 'tracker' });
  const err = e.errors(1).at(-1);
  check('lock: a take is refused while locked', err?.error === 'locked' && err.why === 'host');
  e.say(host, { type: 'ops', op: 'lock', on: false });
  const before = rolesOf(e).held[e.seatOf(1)].join();
  const errs = e.errors(1).length;
  e.say(1, { type: 'ops', op: 'take', role: 'tracker' });
  const got = rolesOf(e).held[e.seatOf(1)];
  check('lock: unlocked, the take goes through', e.errors(1).length === errs && got.join() !== before && got.some((k) => k === 'tracker:2'), `${before} -> ${got}`);
  e.fly(GO + 61000);
  check('locked beat: the second stage locks roles', rolesOf(e).beat === 'stage');
  e.say(1, { type: 'ops', op: 'take', role: 'tracker' });
  check('locked beat: a take is refused in it', e.errors(1).at(-1)?.why === 'stage');
  const f = opsRoom(FILM, { n: 2, world, start: false });
  f.say(0, {
    type: 'ops', op: 'start', mission: FILM.id, intro: true,
  });
  check('briefing: the room is in its briefing with roles dealt', f.view(0).state === 'briefing' && rolesOf(f).beat === 'briefing');
  f.say(1, { type: 'ops', op: 'take', role: 'tracker' });
  check('briefing: a take is refused', f.errors(1).at(-1)?.why === 'briefing');
}

console.log('joins and leaves');
{
  const e = opsRoom(ONE_CORE, { n: 3, world });
  fly(e, 4);
  e.fly(GO + 2000);
  const before = JSON.stringify(rolesOf(e).held);
  e.join(3);
  e.fly(e.clock + 100);
  const r = rolesOf(e);
  const old = JSON.parse(before);
  check('late joiner: dealt a scaling copy, nobody else moved', roleOf(r.held[e.seatOf(3)][0]) === 'tracker'
    && Object.entries(old).every(([s, ks]) => JSON.stringify(r.held[s]) === JSON.stringify(ks)), JSON.stringify(r.held));
  const iIsr = [0, 1, 2, 3].find((i) => r.held[e.seatOf(i)].includes('isr'));
  const seatIsr = e.seatOf(iIsr);
  const token = e.tokens[iIsr];
  e.drop(iIsr);
  e.fly(e.clock + 3000);
  check('reload: a dropped pilot keeps its roles for AWAY_MS', rolesOf(e).held[seatIsr]?.includes('isr'));
  e.join(iIsr, token);
  e.fly(e.clock + AWAY_MS + 2000);
  check('reload: back on its token, it holds them still', e.seatOf(iIsr) === seatIsr && rolesOf(e).held[seatIsr]?.includes('isr'));
  e.drop(iIsr);
  e.fly(e.clock + AWAY_MS + 1000);
  const after = rolesOf(e);
  const seats = [0, 1, 2, 3].filter((i) => i !== iIsr).map((i) => e.seatOf(i));
  const holder = seats.find((s) => after.held[s].includes('isr'));
  const fewest = Math.min(...seats.map((s) => JSON.parse(JSON.stringify(r.held))[s].length));
  check('leaver: its core role passed on after AWAY_MS', holder != null && !after.held[seatIsr] && sound(after, ONE_CORE.roles, seats), JSON.stringify(after.held));
  check('leaver: to a pilot holding fewest, the lower seat on a tie', holder === Math.min(...seats.filter((s) => r.held[s].length === fewest)));
}

console.log('no upper bound');
for (const n of [16, 64]) {
  const seats = Array.from({ length: n }, (_, i) => i + 1);
  const r = deal(TWO_CORE.roles, seats, 0x1234, 0);
  check(`${n} seats: both core roles once, every seat a role, ${n - 2} copies`, sound(r, TWO_CORE.roles, seats)
    && Object.values(r.held).flat().filter((k) => roleOf(k) === 'tracker').length === n - 2);
}

finish();
