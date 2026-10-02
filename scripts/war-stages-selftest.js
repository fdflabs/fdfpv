/*
 * war-stages-selftest.js: the war's stage engine (src/share/war/stages.js)
 * on its own and on the real room (edge/rooms/core.js with
 * edge/rooms/war.js) in Node. npm run war:stages.
 *
 *   data       every mission's stages lint clean, and every radio cue is
 *              a line the voice set has (assets/audio/war/lines.json)
 *   triggers   each trigger kind fires when it should, at the room ms it
 *              should, and not before: time, cleared, allOut, destroyed,
 *              killed (by kind and group), leaked (hit), output, region
 *              (any, all, a stay that a step out starts again), breach,
 *              ready, objective, all, any
 *   the room   a story mission (STORY below) flown by hovering pilots:
 *              its spawns born inside their windows, on a route of their
 *              family, turned inside their azimuth window; its cues told
 *              when due; its objective failed when its target falls; its
 *              exit's twist drawn from the seed, both twists met over a
 *              handful of seeds; and a kill in a stage settling an
 *              objective whose exit holds a result card before the next
 *   twice      the same seed twice is the same game, message for message;
 *              a store and restore mid stage changes nothing after it
 *   late join  a pilot seated mid stage is told the stage as the others
 *              have it, and the attackers alive
 *   ready, region, breach
 *              the triggers a room event drives, through the room
 *   legacy     the four Itaipu missions equal to the games recorded
 *              before the engine (scripts/war-legacy-games.js), every one
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

import { readFileSync } from 'node:fs';

import {
  FLAG_AIRBORNE, PROTO, encodePose,
} from '../src/share/roomwire.js';
import { PRIVATE_CAP, RoomCore } from '../edge/rooms/core.js';
import { COUNTDOWN_MS } from '../edge/rooms/race.js';
import { BIRTH_LEAD_MS, MISSIONS } from '../edge/rooms/war.js';
import { planAgent, poseAt } from '../src/share/war/routes.js';
import {
  RESULT_MS, enter, fired, lint, note, stagesOf,
} from '../src/share/war/stages.js';
import { firstDifference, playGame } from './war-legacy-games.js';

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

const Y = 300;
const GO = COUNTDOWN_MS;

/* ------------------------------------------------------------ data */

console.log('data');
{
  const lines = new Set(JSON.parse(readFileSync(new URL('../assets/audio/war/lines.json', import.meta.url), 'utf8')).lines.map((l) => l.id));
  for (const m of Object.values(MISSIONS)) {
    const problems = lint(m);
    const radio = stagesOf(m).flatMap((st) => (st.cues ?? []).filter((c) => c.radio != null).map((c) => c.radio)).filter((id) => !lines.has(id));
    check(`${m.id}: its stages lint clean and every radio cue is a voice line`, problems.length === 0 && radio.length === 0, [...problems, ...radio].join('; '));
  }
}

/* ------------------------------------------------------------ triggers */

console.log('triggers');
{
  const mission = {
    id: 't',
    targets: { a: { mw: 1000, at: [0, Y, 0], r: 10 }, b: { mw: 1000, at: [0, Y, 600], r: 10 } },
    routes: { r: [[-600, Y, 0], [-300, Y, 0]] },
    stages: [{
      id: 's',
      spawns: [{ at: 1, kind: 'strike', n: 1, route: 'r', target: 'a' }],
      objectives: [{ id: 'o', text: 'x', done: { killed: 2 } }],
      exits: [{ when: { time: 99 }, to: 'won' }],
    }],
  };
  const st = enter(mission, 0, 10000, 1, 1);
  const ctx = (extra = {}) => ({
    m: { output: 3000, downAt: {}, breaches: [] }, st, f: 10000, here: [1, 2], pilots: [], allBorn: false, cleared: false, lastGone: null, allOut: false, ...extra,
  });
  check('time: not before the frontier passes it, then at entry plus s', fired({ time: 2 }, ctx({ f: 11999 })) === null && fired({ time: 2 }, ctx({ f: 12500 })) === 12000);
  check('cleared: only with every spawn born and none but Scouts alive, at the last going or the entry',
    fired({ cleared: true }, ctx({ cleared: true })) === null && fired({ cleared: true }, ctx({ allBorn: true, cleared: true, lastGone: 10400, f: 11000 })) === 10400
    && fired({ cleared: true }, ctx({ allBorn: true, cleared: true, lastGone: 900, f: 11000 })) === 10000);
  check('allOut: at the frontier', fired({ allOut: true }, ctx({ allOut: true, f: 10777 })) === 10777 && fired({ allOut: true }, ctx()) === null);
  check('destroyed: all listed, or n of them, at the n-th fall, never before the entry',
    fired({ destroyed: ['a', 'b'] }, ctx({ m: { downAt: { a: 10200 } } })) === null
    && fired({ destroyed: ['a', 'b'], n: 1 }, ctx({ m: { downAt: { a: 10200 } } })) === 10200
    && fired({ destroyed: ['a', 'b'] }, ctx({ m: { downAt: { a: 10200, b: 10300 } } })) === 10300
    && fired({ destroyed: 'a' }, ctx({ m: { downAt: { a: 3000 } } })) === 10000);
  note(st, 10100, 'kill', 'strike', 'g1');
  note(st, 10150, 'kill', 'fpv', null);
  note(st, 10160, 'leak', 'boat', 'g2', false);
  note(st, 10170, 'leak', 'boat', 'g2', true);
  check('killed: counted in the stage, by kind and by group, at the n-th',
    fired({ killed: 2 }, ctx()) === 10150 && fired({ killed: 1, kind: 'fpv' }, ctx()) === 10150 && fired({ killed: 1, group: 'g1' }, ctx()) === 10100
    && fired({ killed: 3 }, ctx()) === null && fired({ killed: 1, group: 'g2' }, ctx()) === null);
  check('leaked: every arrival with a target, or with hit only the ones that hit', fired({ leaked: 2 }, ctx()) === 10170 && fired({ leaked: 1, hit: true }, ctx()) === 10170
    && fired({ leaked: 2, hit: true }, ctx()) === null);
  note(st, 10180, 'down', 'a');
  check('output: under or at most, at the stage\'s last fall', fired({ output: { below: 2500 } }, ctx({ m: { output: 2000 } })) === 10180
    && fired({ output: { below: 2000 } }, ctx({ m: { output: 2000 } })) === null && fired({ output: { atMost: 2000 } }, ctx({ m: { output: 2000 } })) === 10180);
  {
    const s2 = enter(mission, 0, 0, 1, 2);
    const at = (f, ps, here = [1, 2]) => fired({ region: { at: [100, 100], r: 20 }, pilots: 'all', ms: 1000 }, {
      ...ctx(), st: s2, f, here, pilots: ps.map((p, i) => ({ seat: i + 1, p })),
    });
    const inP = [100, Y, 110];
    const outP = [100, Y, 200];
    const r1 = at(100, [inP, outP]);
    const r2 = at(200, [inP, inP]);
    const r3 = at(900, [inP, inP]);
    const r4 = at(1000, [inP, outP]);
    const r5 = at(1100, [inP, inP]);
    const r6 = at(2099, [inP, inP]);
    const r7 = at(2100, [inP, inP]);
    const r8 = at(5000, [outP, outP]);
    check('region, all pilots, a stay of 1 s: not with one out, a step out starts it again, then at its start plus 1 s, and it stays fired',
      r1 === null && r2 === null && r3 === null && r4 === null && r5 === null && r6 === null && r7 === 2100 && r8 === 2100, JSON.stringify([r1, r2, r3, r4, r5, r6, r7, r8]));
    const any = fired({ region: { at: [100, 100], r: 20, y: [Y - 5, Y + 5] } }, { ...ctx(), st: s2, f: 50, pilots: [{ seat: 1, p: inP }] });
    const high = fired({ region: { at: [0, 0], r: 20, y: [0, 10] } }, { ...ctx(), st: s2, f: 50, pilots: [{ seat: 1, p: [0, Y, 0] }] });
    check('region, any pilot, at once; and its height band is kept', any === 50 && high === null);
  }
  check('breach: a given target or any, never before the entry', fired({ breach: 'b' }, ctx({ m: { breaches: [{ target: 'a', at: 10500 }] } })) === null
    && fired({ breach: true }, ctx({ m: { breaches: [{ target: 'a', at: 10500 }] } })) === 10500
    && fired({ breach: 'a' }, ctx({ m: { breaches: [{ target: 'a', at: 500 }] } })) === 10000);
  st.ready[1] = 10600;
  const r1 = fired({ ready: true }, ctx());
  st.ready[2] = 10650;
  check('ready: every pilot here, at the last', r1 === null && fired({ ready: true }, ctx()) === 10650 && fired({ ready: true }, ctx({ here: [] })) === null);
  st.obj.o = { state: 'done', t: 10700 };
  check('objective: its state, at when it settled', fired({ objective: 'o' }, ctx()) === 10700 && fired({ objective: 'o', is: 'failed' }, ctx()) === null);
  check('all: the last; any: the first', fired({ all: [{ time: 0.1 }, { killed: 2 }] }, ctx({ f: 20000 })) === 10150
    && fired({ any: [{ time: 0.1 }, { killed: 1 }] }, ctx({ f: 20000 })) === 10100 && fired({ all: [{ killed: 9 }, { time: 0 }] }, ctx()) === null);
  let threw = false;
  try {
    fired({ nonsense: 1 }, ctx());
  } catch {
    threw = true;
  }
  check('a trigger of no kind throws, and lint names it', threw && lint({ ...mission, stages: [{ id: 'x', spawns: [], exits: [{ when: { nonsense: 1 }, to: 'won' }] }] }).length === 1);
}

/* ------------------------------------------------------------ the room */

/* A story in three stages over two targets, a and b, with every choice
 * a seed can make. */
const ROUTES = {
  w: [[-900, Y, -60], [-500, Y, -40]],
  w2: [[-900, Y, 60], [-500, Y, 40]],
  e: [[900, Y, 600], [500, Y, 600]],
  sea: [[0, Y, 1200], [0, Y, 900]],
  far: [[-5000, Y, 0], [-4000, Y, 0]],
};
const STORY = {
  id: 'story-test',
  map: 'itaipu',
  targets: { a: { mw: 1000, at: [0, Y, 0], r: 10 }, b: { mw: 1000, at: [0, Y, 600], r: 10 } },
  output: 3000,
  floorMw: 500,
  airframes: 3,
  routes: ROUTES,
  stages: [
    {
      id: 'calm',
      spawns: [{
        at: [2, 6], kind: 'strike', n: 1, route: ['w', 'w2'], target: 'a', az: [-0.3, 0.3], group: 'first',
      }],
      objectives: [{ id: 'hold-a', text: 'war.obj.a', fail: { destroyed: 'a' } }],
      cues: [{ at: 0, music: 'combat' }, { at: 1, radio: 'wave-strike' }, { at: 0, text: 'war.stage.calm' },
        { when: { destroyed: 'a' }, cutaway: { target: 'a', ms: 2500 } }],
      exits: [{ when: { destroyed: 'a' }, to: { pick: ['twist-x', 'twist-y'] }, after: 0 }],
    },
    {
      id: 'twist-x',
      spawns: [{
        at: 1, kind: 'strike', n: 2, per: 1, route: 'e', target: 'b',
      }],
      cues: [{ at: 0, text: 'war.stage.x' }],
      exits: [{ when: { cleared: true }, to: 'won', why: 'held' }],
    },
    {
      id: 'twist-y',
      spawns: [{
        when: { time: 0.5 }, at: 2, kind: 'boat', n: 1, route: 'sea', target: 'b',
      }],
      cues: [{ at: 0, text: 'war.stage.y' }],
      exits: [{ when: { time: 90 }, to: 'won', why: 'held' }],
    },
  ],
};

/* The same, with the first strike a plain one an interceptor can wait
 * for: a kill settles the objective, whose exit holds a result card. */
const KILL = {
  ...STORY,
  id: 'kill-test',
  stages: [
    {
      id: 'one',
      spawns: [{
        at: 2, kind: 'strike', n: 1, route: 'far', target: 'a', group: 'first',
      }],
      objectives: [{ id: 'kill-first', text: 'war.obj.k', done: { killed: 1, group: 'first' } }],
      exits: [{
        when: { objective: 'kill-first' }, to: 'two', after: 3000, result: 'win',
      }],
    },
    {
      id: 'two',
      spawns: [],
      exits: [{ when: { time: 1 }, to: 'won' }],
    },
  ],
};

/* Stages driven by what the pilots do: ready, a region, a breach. */
const EVENTS = {
  ...STORY,
  id: 'events-test',
  stages: [
    { id: 'wait', spawns: [], exits: [{ when: { ready: true }, to: 'next', after: 0 }] },
    { id: 'go', spawns: [], exits: [{ when: { region: { at: [0, 900], r: 30 }, pilots: 'all', ms: 2000 }, to: 'next', after: 0 }] },
    { id: 'hold', spawns: [], exits: [{ when: { breach: 'a' }, to: 'won', why: 'breach' }] },
  ],
};

function warRoom(mission, { n = 2, seed = 0.25 } = {}) {
  const r = new RoomCore({
    code: 'W4RS00', cap: PRIVATE_CAP, friendly: false, map: 'itaipu', epoch: 0,
  });
  r.war.missions = { ...MISSIONS, [mission.id]: mission };
  r.war.random = () => seed;
  let tokens = 0;
  const env = {
    r, socks: [], paths: [], clock: 0, stored: null,
  };
  env.apply = (actions) => {
    for (const x of actions) {
      if (x.send) {
        x.send.got.push(typeof x.data === 'string' ? JSON.parse(x.data) : x.data);
      } else if (x.store === 'war') {
        env.stored = JSON.parse(JSON.stringify(x.value));
      }
    }
  };
  env.join = (i) => {
    const so = { name: `war${i}`, address: `10.9.8.${i + 1}`, got: [] };
    env.socks[i] = so;
    env.apply(r.open(so, env.clock));
    env.apply(r.message(so, JSON.stringify({
      type: 'hello', proto: PROTO, build: 't', name: [i, i, 20 + i], profile: {
        airframe: '5inch', map: 'itaipu', figure: 1, livery: null, parts: null,
      },
    }), env.clock, so.address, () => (tokens += 1).toString(16).padStart(32, '0')));
    env.paths[i] = env.paths[i] ?? (() => [4000 + 50 * i, Y, 4000]);
    return so;
  };
  for (let i = 0; i < n; i += 1) {
    env.join(i);
  }
  env.say = (i, obj) => env.apply(r.message(env.socks[i], JSON.stringify(obj), env.clock, env.socks[i].address));
  env.fly = (until) => {
    for (let t = env.clock + 1; t <= until; t += 1) {
      env.clock = t;
      for (let i = 0; i < env.socks.length; i += 1) {
        if (env.paths[i] && (t + 7 * i) % 33 === 0 && r.seats.has(env.socks[i])) {
          const p = env.paths[i](t);
          env.apply(r.message(env.socks[i], encodePose({
            wx: 0, wy: 0, wz: 0, c0: 0, c1: 0, c2: 0, c3: 0, motor: 0, flaps: 0, seq: 1, px: p[0], py: p[1], pz: p[2], vx: 0, vy: 0, vz: 0, qx: 0, qy: 0, qz: 0, qw: 1, flags: FLAG_AIRBORNE, t,
          }), t));
        }
      }
      if (t % 33 === 0) {
        env.apply(r.tick(t));
      }
    }
  };
  env.of = (i, op) => env.socks[i].got.filter((m) => m && m.type === 'war' && (op ? m.op === op : m.war));
  env.view = (i = 0) => env.of(i).at(-1).war;
  env.say(0, { type: 'war', op: 'start', mission: mission.id });
  return env;
}

/* What client i was told of the war, as text: the game, message for
 * message. */
const told = (env, i = 0) => env.socks[i].got.filter((m) => m && m.type === 'war').map((m) => JSON.stringify(m));

console.log('the room: a story');
{
  const seeds = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95];
  const twists = new Set();
  let windows = true;
  let families = true;
  let turned = true;
  let cueOk = true;
  let failOk = true;
  const detail = [];
  for (const seed of seeds) {
    const e = warRoom(STORY, { seed });
    e.fly(GO + 60000);
    const born = e.of(0, 'born').flatMap((m) => m.agents);
    const first = born[0];
    if (!(first.t0 >= GO + 2000 && first.t0 <= GO + 6000)) {
      windows = false;
      detail.push(`t0 ${first.t0 - GO}`);
    }
    if (!['w', 'w2'].includes(first.route)) {
      families = false;
    }
    /* Turned: born where its route turned by az puts it, and az inside. */
    const plain = poseAt(planAgent(STORY, { ...first, az: 0 }), first.t0).p;
    const got = poseAt(planAgent(STORY, first), first.t0).p;
    const r = Math.hypot(ROUTES[first.route][0][0] - ROUTES[first.route][1][0], ROUTES[first.route][0][2] - ROUTES[first.route][1][2]);
    const moved = Math.hypot(plain[0] - got[0], plain[2] - got[2]);
    if (!(Math.abs(first.az) <= 0.3 && Math.abs(moved - 2 * r * Math.abs(Math.sin(first.az / 2))) < 1e-6)) {
      turned = false;
      detail.push(`az ${first.az} moved ${moved}`);
    }
    const v = e.view();
    twists.add(v.stage ? v.stage.id : `ended:${v.state}`);
    const cues = e.of(0, 'cue').flatMap((m) => m.cues);
    const down = e.of(0, 'dead').find((m) => m.target === 'a' && m.hit);
    const music = cues.find((c) => c.music === 'combat');
    const radio = cues.find((c) => c.radio === 'wave-strike');
    const cut = cues.find((c) => c.cutaway);
    if (!(music && music.at === GO && radio && radio.at === GO + 1000 && down && cut && Math.abs(cut.at - down.at) < 1e-3 && cut.cutaway.target === 'a' && !('when' in cut))) {
      cueOk = false;
      detail.push(`cues ${JSON.stringify(cues)}`);
    }
    const failedView = e.of(0).map((m) => m.war).find((w) => w.stage && w.stage.id === 'calm' && w.stage.objectives[0].state === 'failed');
    if (!failedView && !(down && e.of(0).map((m) => m.war).some((w) => w.stage && w.stage.id !== 'calm'))) {
      failOk = false;
    }
  }
  check('each first spawn is born inside its window, 2 to 6 s after the go', windows, detail.join(' '));
  check('on a route of its family', families);
  check('turned about its route\'s last point by its az, inside the window', turned, detail.join(' '));
  check('the music at the entry, the radio line 1 s in, the cutaway when a falls, each at its room ms', cueOk, detail.slice(0, 2).join(' '));
  check('the objective fails when its target falls', failOk);
  check('over ten seeds both twists are met', twists.has('twist-x') && twists.has('twist-y'), [...twists].join(','));

  /* twist-y's spawn waits on its trigger, then its `at`. */
  const ys = seeds.map((seed) => warRoom(STORY, { seed })).filter((e) => {
    e.fly(GO + 70000);
    return e.of(0).some((m) => m.war.stage && m.war.stage.id === 'twist-y');
  });
  const y = ys[0];
  const yAt = y.of(0).map((m) => m.war).find((w) => w.stage && w.stage.id === 'twist-y').stage.at;
  const boat = y.of(0, 'born').flatMap((m) => m.agents).find((a) => a.kind === 'boat');
  check('a spawn on a trigger is born its `at` after the trigger fires', boat && boat.t0 === yAt + 500 + 2000, `${boat && boat.t0} vs ${yAt + 2500}`);
}

console.log('the room: a kill settles an objective, its exit holds a result');
{
  const plan = planAgent(KILL, {
    id: 1, kind: 'strike', route: 'far', t0: GO + 2000, k: 0, n: 1, err: 0, target: 'a',
  });
  const meet = poseAt(plan, GO + 2000 + 20000).p;
  const e = warRoom(KILL, { n: 1 });
  e.paths[0] = () => meet;
  e.fly(GO + 30000);
  const boom = e.of(0, 'dead').find((m) => m.why === 'boom');
  const views = e.of(0).map((m) => m.war);
  const done = views.find((w) => w.stage && w.stage.objectives.length && w.stage.objectives[0].state === 'done');
  const card = views.find((w) => w.roundState === 'result');
  const two = views.find((w) => w.stage && w.stage.id === 'two');
  check('the interceptor kills the strike', Boolean(boom));
  check('its objective is done', Boolean(done));
  check('the exit shows its result for `after`, then the next stage starts at the kill plus after', card && card.roundResult === 'win' && two && boom && two.stage.at === boom.at + 3000,
    `${two && two.stage.at} vs ${boom && boom.at + 3000}`);
  e.fly(GO + 40000);
  check('and the mission ends as its last stage says', e.view().state === 'won');
}

console.log('the room: twice, and a restore mid stage');
{
  const a = warRoom(STORY, { seed: 0.4 });
  a.fly(GO + 60000);
  const b = warRoom(STORY, { seed: 0.4 });
  b.fly(GO + 60000);
  check('the same seed twice tells every message the same', JSON.stringify(told(a)) === JSON.stringify(told(b)), `${told(a).length} vs ${told(b).length}`);
  const c = warRoom(STORY, { seed: 0.4 });
  c.fly(GO + 3500);
  const saved = c.stored;
  c.r.war.restore(JSON.parse(JSON.stringify(saved)));
  c.fly(GO + 60000);
  check('a store and a restore mid stage change nothing after it', JSON.stringify(told(a)) === JSON.stringify(told(c)));
}

console.log('the room: a late joiner');
{
  const e = warRoom(STORY, { seed: 0.4 });
  e.fly(GO + 9000);
  const so = e.join(2);
  e.fly(GO + 9100);
  const welcome = so.got.find((m) => m.type === 'welcome');
  const mine = e.view(2);
  const theirs = e.view(0);
  const alive = e.of(2, 'born').flatMap((m) => m.agents).map((a) => a.id);
  check('its welcome has the stage the room is in', welcome && welcome.war && welcome.war.stage && welcome.war.stage.id === 'calm' && welcome.war.stage.at === GO);
  check('its view of the stage is the others\', objectives, text and music too', JSON.stringify(mine.stage) === JSON.stringify(theirs.stage) && mine.stage.music === 'combat' && mine.stage.text === 'war.stage.calm',
    JSON.stringify(mine.stage));
  check('it is told the attackers alive', alive.length === theirs.alive && alive.length > 0, `${alive.length} vs ${theirs.alive}`);
}

console.log('the room: ready, a region, a breach');
{
  const e = warRoom(EVENTS);
  e.fly(GO + 1000);
  e.say(0, { type: 'war', op: 'ready' });
  e.fly(GO + 1500);
  const still = e.view().stage.id;
  e.say(1, { type: 'war', op: 'ready' });
  e.fly(GO + 1600);
  const go = e.view().stage;
  check('ready: the stage waits for every pilot, then goes at the last one\'s', still === 'wait' && go.id === 'go' && go.at === GO + 1500, JSON.stringify(go));
  e.paths[0] = () => [0, Y, 900];
  e.fly(GO + 5000);
  const one = e.view().stage.id;
  e.paths[1] = () => [10, Y, 905];
  e.fly(GO + 9000);
  const hold = e.view().stage;
  check('region: not with one pilot in, then 2 s after both are', one === 'go' && hold.id === 'hold' && hold.at >= GO + 7000 && hold.at <= GO + 7100, JSON.stringify(hold));
  e.r.war.breach('a', GO + 9500);
  e.fly(GO + 10000);
  check('breach: the room\'s opening ends it', e.view().state === 'won' && e.view().why === 'breach' && e.view().endAt === GO + 9500);
}

console.log('the room: the birth lead');
{
  const e = warRoom(STORY, { seed: 0.4 });
  let when = null;
  for (let t = 1; t <= GO + 8000 && when == null; t += 1) {
    e.fly(t);
    if (e.of(0, 'born').length) {
      when = t;
    }
  }
  const a = e.of(0, 'born')[0].agents[0];
  check('a spawn drawn in a window is announced BIRTH_LEAD_MS before its birth, as a timed one is', when != null && a.t0 - when <= BIRTH_LEAD_MS && a.t0 - when > BIRTH_LEAD_MS - 40,
    `${a.t0 - when}`);
}

console.log('legacy: the four missions against their record');
{
  const rec = JSON.parse(readFileSync(new URL('../tests/fixtures/war-legacy-games.json', import.meta.url), 'utf8'));
  const floorBuf = readFileSync(new URL('../src/share/war/itaipu-height.bin', import.meta.url));
  const bad = [];
  for (const want of rec.games) {
    const diff = firstDifference(want, playGame(want, floorBuf));
    if (diff) {
      bad.push(`${want.mission} ${want.skill} x${want.pilots} seed ${want.seed}: ${diff}`);
    }
  }
  check(`all ${rec.games.length} recorded games (${rec.commit.slice(0, 8)}): same births at the same times, deaths, rounds and ends`, bad.length === 0, bad.slice(0, 2).join(' | '));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
