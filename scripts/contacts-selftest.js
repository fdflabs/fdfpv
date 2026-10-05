/*
 * contacts-selftest.js: the room's contact registry for ops missions, on
 * the real room in Node (docs/campaign/interior/TECH-NEEDS.md N13,
 * CONTRACT-P0.md section 4.3). npm run contacts:selftest.
 *
 * One walker on an authored route through open ground, a forest with a
 * gap in it, and open ground again, watched by a scripted pilot whose
 * camera tracks it, looks away and tracks it again (the fixture world,
 * src/share/ops/fixtures/world.js):
 *
 *   seen         in the frame for SEEN_MS: seen, discovered, its class the
 *                campaign's first; a scripted cue then classifies it, with
 *                the evidence kept; a client's message cannot
 *   lost         out of every frame: lost from the last grid ms it was in
 *                one, its last known position where it was
 *   soft         seen again after more than the soft threshold:
 *                reacquired
 *   canopy       under the crowns while the camera is on it: lost; in the
 *                gap: seen
 *   hard         out of every frame past the hard threshold: moved to its
 *                alternate route at that ms
 *   vanished     its route over while watched: vanished, watched
 *   one picture  three pilots, one tracking: every pilot's view the same
 *   the truth    the contact's faction never in any message
 *   restart      stored and restored mid run (a VM restart): the same view,
 *                and the match plays on to its end
 *   lag          the same run with every pose and report 300 ms late:
 *                every record and decision at the same room ms
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

import { COUNTDOWN_MS } from '../edge/rooms/race.js';
import { GRID_MS } from '../edge/rooms/ops.js';
import { SEEN_MS } from '../src/share/ops/contacts.js';
import { makeWorld } from '../src/share/ops/fixtures/world.js';
import {
  aimAt, check, finish, opsRoom,
} from './lib/opsroom.js';

const GO = COUNTDOWN_MS;
const S = (s) => GO + s * 1000;

const world = makeWorld({
  forests: [{
    at: [300, 0], r: 100, base: 6, top: 18, gaps: [{ at: [300, 0], r: 25 }],
  }],
  routes: {
    walk: { pts: [[0, 0], [600, 0]], speed: 2 },
    'walk-alt': { pts: [[600, 200], [600, 800]], speed: 2 },
  },
});

const MISSION = {
  id: 'contacts-test',
  campaign: 'test',
  map: 'test',
  z0: 0,
  classes: ['unknown', 'civilian', 'poi', 'hostile'],
  roles: [{ id: 'isr', core: true }, { id: 'tracker', core: false }],
  contacts: [{
    id: 'walker', kind: 'person', group: 'pair', faction: 'secret-truth', track: { soft: 20, hard: 45 },
  }],
  items: [],
  points: { far: { at: [600, 0], r: 20 } },
  stages: [{
    id: 'one',
    cues: [
      { at: 0, spawn: [{ id: 'walker', route: 'walk', alt: 'walk-alt' }] },
      { when: { discovered: 'walker' }, at: 2, classify: { contacts: 'walker', to: 'poi', why: 'ev-avoids-road' } },
    ],
    exits: [{ when: { vanished: 'pair', watched: true }, to: 'won', why: 'done' }, { when: { time: 1200 }, to: 'lost', why: 'timeout' }],
  }],
};

const AWAY = { aim: [0, 3000, 0], tanHalf: 0.08, aspect: 16 / 9 };

/* The schedule: [from s, to s, tracking]. */
const PLAN = [[0, 40, true], [40, 70, false], [70, 210, true], [210, 270, false], [270, 1000, true]];

/* A camera on the walker from what is already known of its routes
 * ([{ route, t0 }]), not from the view, so a late view moves no report. */
function aimFrom(history) {
  return (t) => {
    const h = history.filter((x) => x.t0 <= t).at(-1);
    const p = world.poseOnRoute(h.route, t - h.t0);
    return p ? { aim: [p.x, p.y, p.z + 0.8], tanHalf: 0.08, aspect: 16 / 9 } : null;
  };
}

function run({ lagMs = 0, restartAt = null, history = null } = {}) {
  const e = opsRoom(MISSION, { n: 3, world, lagMs });
  e.paths[0] = () => [300, -200, 600];
  e.paths[1] = () => [500, -900, 700];
  e.paths[2] = () => [-300, -700, 500];
  const track = history ? aimFrom(history) : aimAt(e, world, 'walker', 0.08);
  e.cams[0] = (t) => {
    const s = (t - GO) / 1000;
    const row = PLAN.find(([a, b]) => s >= a && s < b);
    return row && row[2] ? track(t) : AWAY;
  };
  e.cams[1] = () => AWAY;
  e.cams[2] = () => AWAY;
  const snaps = {};
  const at = (s, fn) => {
    e.fly(S(s));
    snaps[s] = fn ? fn() : JSON.parse(JSON.stringify(e.view(0).contacts.find((c) => c.id === 'walker') ?? null));
  };
  for (const s of [2, 39, 45, 69, 72, 98, 105, 150, 199, 205, 254, 256, 275]) {
    if (restartAt != null && s > restartAt && !snaps.restarted) {
      e.fly(S(restartAt));
      const before = JSON.stringify(e.view(0));
      e.restart();
      snaps.restarted = { before, after: JSON.stringify(e.r.ops.view(e.r)) };
    }
    at(s);
  }
  e.fly(S(620));
  return { e, snaps };
}

const A = run();
const s = A.snaps;
const e = A.e;

console.log('seen, discovered, classified');
check('seen within SEEN_MS of the first camera report on it', s[2].state === 'seen' && s[2].seenAt - GO <= 500 + GRID_MS + SEEN_MS + GRID_MS, JSON.stringify(s[2]));
check('discovered: the campaign\'s first class', s[2].cls === 'unknown');
check('a scripted cue classifies it two seconds after its discovery', s[39].cls === 'poi');
const ev = e.r.ops.match.contacts[0].evidence;
check('the evidence is kept: discovered, then the scripted why', ev.length === 2 && ev[0].why === 'discovered' && ev[1].why === 'ev-avoids-road' && ev[1].t === ev[0].t + 2000, JSON.stringify(ev));
e.say(0, {
  type: 'ops', op: 'classify', contact: 'walker', to: 'hostile',
});
check('a client\'s classify message changes nothing', e.view(0).contacts[0].cls === 'poi' && e.r.ops.match.contacts[0].cls === 'poi');

console.log('lost, soft, canopy, hard');
check('looked away: lost from the last grid ms it was in a frame', s[45].state === 'lost' && s[45].lostSince > S(39) && s[45].lostSince <= S(40) && s[45].lostSince % GRID_MS === 0, JSON.stringify(s[45]));
check('its last known position is where it was then (x about 80 m)', Math.abs(s[45].lkp[0] - 80) < 2, JSON.stringify(s[45].lkp));
check('still lost past the soft threshold, not moved (hard is 45 s)', s[69].state === 'lost' && s[69].route === 'walk');
const reacq = e.r.ops.log.length >= 0 && s[72].state === 'seen';
check('tracked again after 30 s lost: seen', reacq, JSON.stringify(s[72]));
check('under the crowns with the camera on it: lost', s[105].state === 'lost' && s[105].lostSince > S(98), JSON.stringify(s[105]));
check('in the gap: seen', s[150].state === 'seen', JSON.stringify(s[150]));
check('out of the forest: seen again before the hard threshold, still on its route', s[205].state === 'seen' && s[205].route === 'walk' && s[205].hards === 0, JSON.stringify(s[205]));
check('looked away 44 s: lost, not moved yet', s[254].state === 'lost' && s[254].route === 'walk');
const hardAt = s[256].t0;
check('past the hard threshold: on its alternate route from lostSince + 45 s', s[256].route === 'walk-alt' && s[256].hards === 1 && hardAt === Math.ceil((s[254].lostSince + 45000) / GRID_MS) * GRID_MS, `${JSON.stringify(s[256])} lost ${s[254].lostSince}`);
check('found on its alternate route by a screen drawing it from the view', s[275].state === 'seen' && s[275].route === 'walk-alt');
check('the reacquisition after a soft loss is kept (reacqAt)', e.r.ops.match.contacts[0].reacqAt > S(270));

console.log('vanished, one picture, the truth');
const end = e.view(0);
check('its route over while watched: vanished and watched', end.contacts[0].state === 'vanished' && e.r.ops.match.contacts[0].watched === true);
check('the stage\'s exit on it: the match won', end.state === 'won' && end.why === 'done', `${end.state} ${end.why}`);
const views = [0, 1, 2].map((i) => JSON.stringify(e.view(i).contacts));
check('every pilot\'s view of the contacts is the same', views.every((v) => v === views[0]));
const all = e.socks.flatMap((so) => so.got).map((m) => JSON.stringify(m)).join('\n');
check('the faction (the truth) is in no message to any pilot', !all.includes('secret-truth') && !all.includes('faction'));

console.log('restart');
{
  const B = run({ restartAt: 120 });
  const r = B.snaps.restarted;
  check('restored from the store: the same view as before the restart', r && r.before === r.after);
  check('after the restart the match plays on to its end', B.e.view(0).state === 'won');
  check('and decides the hard threshold at the same room ms', B.snaps[256].t0 === hardAt && B.snaps[256].route === 'walk-alt');
}

console.log('lag');
{
  const history = [{ route: 'walk', t0: GO }, { route: 'walk-alt', t0: hardAt }];
  const P = run({ history }).e;
  const L = run({ lagMs: 300, history });
  check('the prompt run with the same camera reports ends the same', P.view(0).state === 'won' && P.r.ops.match.contacts[0].t0 === hardAt);
  const same = JSON.stringify(L.e.r.ops.match.contacts) === JSON.stringify(P.r.ops.match.contacts);
  check('300 ms late: every contact record the same', same);
  const log = (x) => JSON.stringify(x.r.ops.log.filter((l) => l.what !== 'capture'));
  check('300 ms late: every cue, exit and the end at the same room ms', log(L.e) === log(P), `${log(L.e).slice(0, 300)} vs ${log(P).slice(0, 300)}`);
}

finish();
