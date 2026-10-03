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

import { readFileSync, readdirSync } from 'node:fs';

import {
  FLAG_AIRBORNE, PROTO, encodePose,
} from '../src/share/roomwire.js';
import { PRIVATE_CAP, RoomCore } from '../edge/rooms/core.js';
import { COUNTDOWN_MS } from '../edge/rooms/race.js';
import {
  BIRTH_LEAD_MS, MISSIONS, RESTART_STARS, resultOf,
} from '../edge/rooms/war.js';
import { planAgent, poseAt } from '../src/share/war/routes.js';
import {
  beatOf, enter, failedAny, fired, note, objectives, objectivesView, slotKind, stagesOf,
} from '../src/share/war/stages.js';
import { firstDifference, playGame } from './war-legacy-games.js';
import { createRoomWar } from '../src/share/roomwar.js';
import { waveStatus } from '../src/ui/warhud.js';

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

/*
 * A mission's stages, checked as data, so a wrong one fails loudly where
 * it is written: every exit's stage, route, sector, line, target and
 * trigger is one the mission has. Returns a list of problems, empty when
 * it is sound.
 */
function lint(mission) {
  const out = [];
  const stages = stagesOf(mission);
  const ids = new Set(stages.map((s) => s.id));
  if (ids.size !== stages.length) {
    out.push('two stages share an id');
  }
  const KEYS = ['time', 'cleared', 'allOut', 'destroyed', 'hit', 'killed', 'leaked', 'left', 'down', 'gone', 'crossed', 'spent', 'output', 'region', 'breach', 'ready', 'objective', 'visited', 'all', 'any'];
  const trig = (x, where) => {
    if (!x || typeof x !== 'object' || !KEYS.some((k) => x[k] != null)) {
      out.push(`${where}: not a trigger ${JSON.stringify(x)}`);
      return;
    }
    for (const id of x.destroyed == null ? [] : [x.destroyed].flat()) {
      if (!mission.targets[id]) {
        out.push(`${where}: no target ${id}`);
      }
    }
    if (x.crossed != null && !mission.lines?.[x.crossed]) {
      out.push(`${where}: no line ${x.crossed}`);
    }
    if (x.visited != null && !ids.has(x.visited)) {
      out.push(`${where}: no stage ${x.visited}`);
    }
    for (const y of [...(x.all ?? []), ...(x.any ?? [])]) {
      trig(y, where);
    }
  };
  for (const [i, st] of stages.entries()) {
    const where = `${mission.id} ${st.id}`;
    for (const w of st.spawns) {
      const routes = w.route && typeof w.route === 'object' && !Array.isArray(w.route)
        ? [w.route.sector].flat().flatMap((s) => {
          if (!mission.sectors?.[s]?.length) {
            out.push(`${where}: no sector ${s}`);
            return [];
          }
          return mission.sectors[s];
        })
        : [w.route].flat();
      for (const r of routes) {
        if (!mission.routes[r]) {
          out.push(`${where}: no route ${r}`);
        }
      }
      for (const t of w.target == null ? [] : [w.target].flat()) {
        if (!mission.targets[t]) {
          out.push(`${where}: no target ${t}`);
        }
      }
      if (!w.kind && !w.mix) {
        out.push(`${where}: a spawn of no kind`);
      }
      for (const key of ['when', 'skip']) {
        if (w[key]) {
          trig(w[key], where);
        }
      }
    }
    for (const o of st.objectives ?? []) {
      for (const key of ['done', 'fail', 'from']) {
        if (o[key]) {
          trig(o[key], `${where} ${o.id}`);
        }
      }
    }
    for (const c of st.cues ?? []) {
      if (c.when) {
        trig(c.when, where);
      }
    }
    if (!(st.exits ?? []).length) {
      out.push(`${where}: no exit`);
    }
    for (const x of st.exits ?? []) {
      trig(x.when, where);
      for (const to of x.to && typeof x.to === 'object' ? x.to.pick : [x.to ?? 'next']) {
        if (to === 'next' ? i + 1 >= stages.length : !(to === 'won' || to === 'lost' || ids.has(to))) {
          out.push(`${where}: exit to ${to}`);
        }
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------ data */

console.log('data');
{
  const tracks = new Set(readdirSync(new URL('../assets/audio/war/music/', import.meta.url)).map((f) => f.replace(/\.[a-z0-9]+$/, '')));
  const lines = new Set(JSON.parse(readFileSync(new URL('../assets/audio/war/lines.json', import.meta.url), 'utf8')).lines.map((l) => l.id));
  for (const m of Object.values(MISSIONS)) {
    const problems = lint(m);
    const cues = stagesOf(m).flatMap((st) => st.cues ?? []);
    const radio = cues.filter((c) => c.radio != null && !lines.has(c.radio)).map((c) => c.radio);
    const music = cues.filter((c) => c.music != null && c.music !== '' && !tracks.has(c.music)).map((c) => c.music);
    check(`${m.id}: its stages lint clean, every radio cue is a voice line and every music cue a track`, problems.length === 0 && radio.length === 0 && music.length === 0,
      [...problems, ...radio, ...music].join('; '));
  }
}

/* ------------------------------------------------------------ triggers */

console.log('triggers');
{
  const mission = {
    id: 't',
    targets: {
      a: { mw: 1000, at: [0, Y, 0], r: 10 }, b: { mw: 1000, at: [0, Y, 600], r: 10 }, 'intake-1': { mw: 700, at: [0, Y, 900], r: 10 }, 'intake-2': { mw: 700, at: [20, Y, 900], r: 10 },
    },
    routes: { r: [[-600, Y, 0], [-300, Y, 0]] },
    lines: { mid: [[-450, -100], [-450, 100]] },
    stages: [{
      id: 's',
      spawns: [{
        at: 1, kind: 'strike', n: 1, route: 'r', target: 'a', group: 'g1',
      }, {
        at: 1, kind: 'scout', n: 1, route: 'r', group: 'eyes',
      }],
      objectives: [{ id: 'o', text: 'x', done: { killed: 2 } }, {
        id: 'h', text: 'y', kind: 'hold', ms: 3000, from: { time: 1 }, fail: { hit: 'b' },
      }],
      exits: [{ when: { time: 99 }, to: 'won' }],
    }, { id: 'other', spawns: [], exits: [{ when: { time: 1 }, to: 'won' }] }],
  };
  const st = enter(mission, 0, 10000, 1, 1);
  const ctx = (extra = {}) => ({
    mission, m: { output: 3000, downAt: {}, breaches: [], path: [{ id: 's', at: 10000 }] }, st, f: 10000, here: [1, 2], pilots: [], allBorn: false, cleared: false, lastGone: null, allOut: false, spent: 0, ...extra,
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
  /* The spawns born, then what became of them. */
  st.due[0].born = true;
  note(st, {
    t: 11000, e: 'born', id: 1, kind: 'strike', group: 'g1', sector: null, cross: { mid: 16000 },
  });
  const downYet = fired({ down: { group: 'eyes' } }, ctx({ f: 30000 }));
  st.due[1].born = true;
  note(st, {
    t: 11000, e: 'born', id: 2, kind: 'scout', group: 'eyes', sector: null, cross: { mid: 25000 },
  });
  check('crossed: the first of a selection alive to cross the line, not before the frontier reaches it',
    fired({ crossed: 'mid' }, ctx({ f: 15999 })) === null && fired({ crossed: 'mid' }, ctx({ f: 16000 })) === 16000 && fired({ crossed: 'mid', group: 'eyes' }, ctx({ f: 30000 })) === 25000);
  note(st, {
    t: 12000, e: 'gone', id: 1, kind: 'strike', group: 'g1', sector: null, how: 'kill', hit: false,
  });
  check('crossed: one killed before its crossing never crosses', fired({ crossed: 'mid', group: 'g1' }, ctx({ f: 30000 })) === null);
  check('down: none until every spawn of the selection is born', downYet === null && fired({ down: { group: 'eyes' } }, ctx({ f: 30000 })) === null);
  note(st, {
    t: 13000, e: 'gone', id: 2, kind: 'scout', group: 'eyes', sector: null, how: 'leave', hit: false,
  });
  check('left: a Scout gone on its own (scoutGone)', fired({ left: 1, kind: 'scout' }, ctx()) === 13000 && fired({ killed: 1, kind: 'scout' }, ctx()) === null);
  {
    /* scoutsDown in a stage whose Striker is still to come: the Scouts
     * alone decide it. */
    const m2 = {
      ...mission,
      stages: [{
        id: 'eyes',
        spawns: [{ at: 0, kind: 'scout', n: 1, route: 'r' }, { at: 30, kind: 'strike', n: 1, route: 'r', target: 'a' }],
        exits: [{ when: { down: { kind: 'scout' } }, to: 'won' }],
      }],
    };
    const s5 = enter(m2, 0, 0, 1, 1);
    s5.due[0].born = true;
    note(s5, {
      t: 0, e: 'born', id: 1, kind: 'scout', group: null, sector: null, cross: null,
    });
    note(s5, {
      t: 10, e: 'gone', id: 1, kind: 'scout', group: null, sector: null, how: 'kill', hit: false,
    });
    check('down by kind waits only on that kind\'s spawns, not a Striker still to come', fired({ down: { kind: 'scout' } }, {
      ...ctx(), mission: m2, st: s5, f: 15,
    }) === 10);
  }
  check('down: every one killed (scoutsDown), so not a Scout that left; gone: however (after(G))',
    fired({ down: { group: 'g1' } }, ctx()) === 12000 && fired({ down: { kind: 'scout' } }, ctx()) === null
    && fired({ gone: { group: 'eyes' } }, ctx()) === 13000 && fired({ gone: {} }, ctx()) === 13000);
  note(st, {
    t: 13100, e: 'gone', id: 7, kind: 'fpv', group: null, sector: null, how: 'kill', hit: false,
  });
  note(st, {
    t: 13160, e: 'gone', id: 8, kind: 'boat', group: 'g2', sector: null, how: 'arrive', hit: false,
  });
  note(st, {
    t: 13170, e: 'gone', id: 9, kind: 'boat', group: 'g2', sector: null, how: 'arrive', hit: true,
  });
  check('killed: counted in the stage, by kind and by group, at the n-th',
    fired({ killed: 2 }, ctx()) === 13100 && fired({ killed: 1, kind: 'fpv' }, ctx()) === 13100 && fired({ killed: 1, group: 'g1' }, ctx()) === 12000
    && fired({ killed: 3 }, ctx()) === null && fired({ killed: 1, group: 'g2' }, ctx()) === null);
  check('leaked: every arrival with a target, or with onTarget only the ones that hit', fired({ leaked: 2 }, ctx()) === 13170 && fired({ leaked: 1, onTarget: true }, ctx()) === 13170
    && fired({ leaked: 2, onTarget: true }, ctx()) === null);
  note(st, { t: 13180, e: 'down', target: 'intake-2' });
  check('hit: a target by id or by part, at the n-th in the stage', fired({ hit: 'intake' }, ctx()) === 13180 && fired({ hit: 'intake-2' }, ctx()) === 13180
    && fired({ hit: 'intake-1' }, ctx()) === null && fired({ hit: 'intake', n: 2 }, ctx()) === null && fired({ hit: ['b', 'intake'] }, ctx()) === 13180);
  check('output: under or at most, at the stage\'s last fall', fired({ output: { below: 2500 } }, ctx({ m: { output: 2000 } })) === 13180
    && fired({ output: { below: 2000 } }, ctx({ m: { output: 2000 } })) === null && fired({ output: { atMost: 2000 } }, ctx({ m: { output: 2000 } })) === 13180);
  note(st, { t: 13200, e: 'spend', seat: 1 });
  note(st, { t: 13300, e: 'spend', seat: 2 });
  check('spent: at the last spend once the share is reached', fired({ spent: 0.5 }, ctx({ spent: 0.25 })) === null && fired({ spent: 0.5 }, ctx({ spent: 0.5 })) === 13300);
  check('visited: a stage the match has been in, at its entry or this one\'s', fired({ visited: 's' }, ctx()) === 10000 && fired({ visited: 'other' }, ctx()) === null);
  {
    const s2 = enter(mission, 0, 0, 1, 2);
    const at = (f, ps, here = [1, 2]) => fired({ region: { at: [100, 100], r: 20 }, pilots: 'all', ms: 1000 }, {
      ...ctx(), st: s2, f, here, pilots: ps.map((p, i) => ({ seat: i + 1, p })),
    });
    const inP = [100, Y, 110];
    const outP = [100, Y, 200];
    const r = [at(100, [inP, outP]), at(200, [inP, inP]), at(900, [inP, inP]), at(1000, [inP, outP]), at(1100, [inP, inP]), at(2099, [inP, inP]), at(2100, [inP, inP]), at(5000, [outP, outP])];
    check('region, all pilots, a stay of 1 s: not with one out, a step out starts it again, then at its start plus 1 s, and it stays fired',
      JSON.stringify(r) === JSON.stringify([null, null, null, null, null, null, 2100, 2100]), JSON.stringify(r));
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
  check('all: the last; any: the first', fired({ all: [{ time: 0.1 }, { killed: 2 }] }, ctx({ f: 20000 })) === 13100
    && fired({ any: [{ time: 0.1 }, { killed: 1 }] }, ctx({ f: 20000 })) === 10100 && fired({ all: [{ killed: 9 }, { time: 0 }] }, ctx()) === null);
  {
    /* A hold: from its own trigger, held until its ms, failed by a hit
     * of what it guards; and its count shown as it grows. */
    const s3 = enter(mission, 0, 0, 1, 3);
    const c3 = (f) => ({ ...ctx(), st: s3, f });
    const held = (f) => objectivesView(c3(f)).find((o) => o.id === 'h');
    const before = held(500);
    const mid = held(2500);
    objectives(c3(3999));
    const notYet = s3.obj.h;
    objectives(c3(4000));
    check('a hold counts from its own trigger, is held ms later, and the view shows how long',
      before.heldMs === 0 && mid.heldMs === 1500 && notYet === undefined && s3.obj.h.state === 'done' && s3.obj.h.t === 4000 && held(9000).heldMs === 3000,
      JSON.stringify([before, mid, s3.obj.h]));
    const s4 = enter(mission, 0, 0, 1, 4);
    note(s4, { t: 2000, e: 'down', target: 'b' });
    objectives({ ...ctx(), st: s4, f: 5000 });
    check('and fails when what it guards is hit first', s4.obj.h.state === 'failed' && s4.obj.h.t === 2000 && failedAny(s4));
    note(s4, {
      t: 2100, e: 'gone', id: 3, kind: 'fpv', group: null, sector: null, how: 'kill', hit: false,
    });
    const o = objectivesView({ ...ctx(), st: s4, f: 5000 }).find((x) => x.id === 'o');
    check('a count objective shows how far it has got', JSON.stringify(o.progress) === '[1,2]', JSON.stringify(o));
  }
  let threw = false;
  try {
    fired({ nonsense: 1 }, ctx());
  } catch {
    threw = true;
  }
  check('a trigger of no kind throws, and lint names it', threw && lint({ ...mission, stages: [{ id: 'x', spawns: [], exits: [{ when: { nonsense: 1 }, to: 'won' }] }] }).length === 1);
  check('lint names a missing route, sector, line, stage and target', lint({
    ...mission,
    sectors: { N: ['r'] },
    stages: [{
      id: 'x',
      spawns: [{ at: 0, kind: 'strike', route: { sector: 'S' } }, { at: 0, kind: 'strike', route: 'nowhere', target: 'zz' }],
      exits: [{ when: { any: [{ crossed: 'nope' }, { visited: 'nada' }] }, to: 'won' }],
    }],
  }).length === 5);
}

console.log('dials');
{
  const routes = {
    n1: [[0, Y, -3000], [0, Y, -1000]], n2: [[100, Y, -3000], [100, Y, -1000]], w1: [[-3000, Y, 0], [-1000, Y, 0]], e1: [[3000, Y, 0], [1000, Y, 0]],
  };
  const mission = {
    id: 'dials',
    targets: { a: { mw: 1000, at: [0, Y, 0], r: 10 } },
    routes,
    sectors: { N: ['n1', 'n2'], W: ['w1'], E: ['e1'] },
    pace: { 1: 1.6, 2: 1.3 },
    adapt: true,
    stages: [{
      id: 's',
      spawns: [
        {
          at: [10, 20], kind: ['fpv', 'loiter'], n: 1, route: { sector: ['N', 'W', 'E'] }, target: 'a',
        },
        {
          at: 30, mix: [['strike', 1], ['decoy', 3]], n: 8, route: { sector: ['N', 'W', 'E'] }, target: 'a',
        },
      ],
      exits: [{ when: { time: 99 }, to: 'won', after: [8000, 15000] }],
    }],
  };
  let repeats = 0;
  let kinds = new Set();
  let decoys = 0;
  let slots = 0;
  let paced = true;
  const sectorsSeen = new Set();
  for (let seed = 1; seed <= 200; seed += 1) {
    const st = enter(mission, 0, 0, seed, 1, { pilots: 4 });
    if (st.due[0].sector === st.due[1].sector) {
      repeats += 1;
    }
    sectorsSeen.add(st.due[0].sector);
    kinds.add(st.due[0].kind);
    for (let k = 0; k < 8; k += 1) {
      decoys += slotKind(mission.stages[0].spawns[1], st.due[1], k, seed, 1) === 'decoy' ? 1 : 0;
      slots += 1;
    }
    const one = enter(mission, 0, 0, seed, 1, { pilots: 1 });
    if (one.due[1].t !== Math.round(30000 * 1.6) || one.due[0].t !== Math.round(st.due[0].t * 1.6)) {
      paced = false;
    }
    if (!mission.sectors[st.due[0].sector].includes(st.due[0].route)) {
      repeats += 1000;
    }
  }
  check('a sector is never drawn twice in a row, and the route is of its family', repeats === 0, `${repeats}`);
  check('every sector of a list is met, and every kind of a choice', sectorsSeen.size === 3 && kinds.size === 2);
  check('a mix deals its slots by weight (decoys 3 in 4)', Math.abs(decoys / slots - 0.75) < 0.03, `${(decoys / slots).toFixed(3)}`);
  check('pace stretches a stage\'s times for a solo pilot by its factor', paced);
  /* The aggressor's mind: a sector where the squad killed is drawn less,
   * and a stage that cost most of the airframes gives a longer breath. */
  const was = (kills, spent) => ({ kills, spent, sector: null });
  let wFirst = 0;
  let calm = 0;
  let rushed = 0;
  let base = 0;
  for (let seed = 1; seed <= 400; seed += 1) {
    const st = enter(mission, 0, 0, seed, 2, { pilots: 4, was: was({ W: 9, E: 9 }, 0.5) });
    wFirst += st.due[0].sector === 'N' ? 1 : 0;
    calm += enter(mission, 0, 0, seed, 2, { pilots: 4, was: was({}, 0.9) }).due[0].t;
    rushed += enter(mission, 0, 0, seed, 2, { pilots: 4, was: was({}, 0.1) }).due[0].t;
    base += enter(mission, 0, 0, seed, 2, { pilots: 4, was: was({}, 0.5) }).due[0].t;
  }
  check('adapt: the sector the squad killed nothing in is drawn most (1 / (1 + kills))', wFirst / 400 > 0.75, `${(wFirst / 400).toFixed(2)}`);
  check('adapt: the first spawn comes 1.3 times later after a costly stage, 0.7 after an easy one',
    Math.abs(calm / base - 1.3) < 1e-4 && Math.abs(rushed / base - 0.7) < 1e-4, `${calm / base} ${rushed / base}`);
  const beats = new Set();
  for (let seed = 1; seed <= 50; seed += 1) {
    const b = beatOf(mission.stages[0].exits[0], seed, enter(mission, 0, 0, seed, 1), 0);
    if (b < 8000 || b > 15000) {
      beats.add('out');
    }
    beats.add(Math.round(b / 1000));
  }
  check('a beat is drawn inside its window', !beats.has('out') && beats.size > 4);
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

console.log('the room: a line crossed, a sector and a mix in the births');
{
  const CROSS = {
    ...STORY,
    id: 'cross-test',
    sectors: { FAR: ['far'] },
    lines: { gate: [[-2000, -500], [-2000, 500]] },
    stages: [{
      id: 'one',
      spawns: [{
        at: 2, mix: [['strike', 1], ['decoy', 1]], n: 6, route: { sector: 'FAR' }, target: 'a', group: 'g',
      }],
      exits: [{ when: { crossed: 'gate', group: 'g' }, to: 'won', why: 'crossed' }],
    }],
  };
  const e = warRoom(CROSS, { n: 1 });
  e.fly(GO + 140000);
  const born = e.of(0, 'born').flatMap((m) => m.agents);
  /* When the first of them is at x = -2000, by brute force on its plan. */
  let first = Infinity;
  for (const a of born) {
    const plan = planAgent(CROSS, a);
    for (let t = a.t0; t <= plan.tEnd; t += 1) {
      if (poseAt(plan, t).p[0] >= -2000) {
        first = Math.min(first, t);
        break;
      }
    }
  }
  const v = e.view();
  check('the first of the group across the line ends the stage there, to the millisecond', v.state === 'won' && v.why === 'crossed' && Math.abs(v.endAt - first) <= 1,
    `${v.state} ${v.endAt} vs ${first}`);
  check('the births carry the sector and each slot\'s kind from the mix', born.length === 6 && born.every((a) => a.sector === 'FAR' && a.route === 'far')
    && new Set(born.map((a) => a.kind)).size === 2, born.map((a) => a.kind).join(','));
}

console.log('the room: a restart from the lost stage');
{
  const LOSE = {
    ...STORY,
    id: 'lose-test',
    floorMw: 2500,
    sectors: { W: ['w', 'w2'] },
    stages: [
      { id: 'quiet', spawns: [], exits: [{ when: { time: 3 }, to: 'next', after: 0 }] },
      {
        id: 'strike',
        title: 'war.stage.test',
        spawns: [{
          at: [2, 6], kind: ['strike', 'fpv'], n: 1, route: { sector: 'W' }, target: 'a', az: [-0.2, 0.2],
        }],
        exits: [{ when: { time: 200 }, to: 'won' }],
      },
    ],
  };
  const e = warRoom(LOSE, { seed: 0.3 });
  e.fly(GO + 80000);
  const lost = e.view();
  const first = e.of(0, 'born').flatMap((m) => m.agents);
  const stageAt = e.of(0).map((m) => m.war).find((w) => w.stage && w.stage.id === 'strike').stage.at;
  check('the match is lost in its second stage, and the view offers that stage', lost.state === 'lost' && lost.checkpoint && lost.checkpoint.stage === 'strike' && lost.checkpoint.n === 1,
    JSON.stringify(lost.checkpoint));
  const told = e.of(0).length;
  e.say(1, { type: 'war', op: 'start', mission: LOSE.id, from: 'checkpoint' });
  const byGuest = e.of(0).length - told;
  e.say(0, { type: 'war', op: 'start', mission: LOSE.id, from: 'checkpoint', intro: true });
  const again = e.of(0).slice(told).map((m) => m.war);
  check('only the host restarts it, and with no briefing even when asked for one', byGuest === 0 && again.length > 0 && again[0].state === 'countdown' && again[0].restarted === 'strike',
    `${byGuest} ${JSON.stringify(again[0] && again[0].state)}`);
  const bornAt = e.of(0, 'born').length;
  e.fly(e.clock + COUNTDOWN_MS + 12000);
  const v = e.view();
  const second = e.of(0, 'born').slice(bornAt).flatMap((m) => m.agents);
  const rel = (list, at) => list.map((a) => ({
    kind: a.kind, route: a.route, sector: a.sector, az: a.az, err: a.err, id: a.id, dt: a.t0 - at,
  }));
  check('it opens on that stage at the go, with the output the stage opened with', v.stage && v.stage.id === 'strike' && v.stage.at === v.goAt && v.output === 3000,
    JSON.stringify(v.stage && v.stage.id));
  check('and the seed draws the stage as it drew it: kind, sector, route, bearing, time, id and error', JSON.stringify(rel(first, stageAt)) === JSON.stringify(rel(second, v.stage.at)),
    `${JSON.stringify(rel(first, stageAt))} vs ${JSON.stringify(rel(second, v.stage.at))}`);
  const capped = resultOf({ starMw: 0, floorMw: 0 }, {
    state: 'won', results: ['win'], lossy: false, output: 1, players: {}, restarted: 'strike',
  });
  const full = resultOf({ starMw: 0, floorMw: 0 }, {
    state: 'won', results: ['win'], lossy: false, output: 1, players: {},
  });
  check(`a won restart earns ${RESTART_STARS} stars at most`, full.stars === 3 && capped.stars === RESTART_STARS);
}

console.log('the client: what a screen makes of it');
{
  const e = warRoom(STORY, { seed: 0.4 });
  const client = createRoomWar(() => {});
  let read = 0;
  const events = [];
  const feed = () => {
    for (; read < e.socks[0].got.length; read += 1) {
      const m = e.socks[0].got[read];
      if (m && m.type === 'welcome') {
        client.onWelcome(m);
      } else if (m && m.type === 'war') {
        client.onMessage(m);
      }
    }
    events.push(...client.takeEvents());
  };
  let status = null;
  for (let t = 0; t <= GO + 60000; t += 500) {
    e.fly(t);
    feed();
    if (t === GO + 1500) {
      status = waveStatus(client.view(), client.mission(), t);
    }
  }
  const stages = events.filter((x) => x.type === 'stage').map((x) => x.id);
  const cues = events.filter((x) => x.type === 'cue');
  const first = e.of(0, 'born')[0].agents[0];
  check('it tells each stage entered once, in order', stages.length === 2 && stages[0] === 'calm' && ['twist-x', 'twist-y'].includes(stages[1]), stages.join(','));
  check('and every cue, as the room sent them', cues.length === e.of(0, 'cue').flatMap((m) => m.cues).length && cues.some((c) => c.radio === 'wave-strike'));
  check('the next wave\'s clock is the room\'s drawn time, not the mission\'s typed one', status && status.s === Math.ceil((first.t0 - (GO + 1500)) / 1000), JSON.stringify(status));
  check('stage() is the view\'s stage', client.stage() && client.stage().id === stages[1]);
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
