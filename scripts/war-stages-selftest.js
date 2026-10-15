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
  LANE_GAP_MS, arm, beatOf, crossings, drawSets, enter, failedAny, fired, gatesOf, note, objectives, objectivesView, roundsOf, sectorsAt, slotKind, spilling, stagesOf, worthOf,
} from '../src/share/war/stages.js';
import { STRIKE_P, wireCrossings, wireStrike } from '../src/share/war/wires.js';
import TOWERS from '../src/share/war/itaipu-towers.js';
import { missionTime, waveSize, waveTarget } from '../src/share/war/missions/index.js';
import { TIME_HOUR, missionClock } from '../src/share/daytime.js';
import { PRACTICE_ID } from '../src/share/war/missions/itaipu-practice.js';
import { STATION_DARK_DISTRICTS, stationOrder } from '../src/share/war/stationdark.js';
import { DISTRICTS, FLICKER_MS } from '../src/share/war/grid.js';
import { released } from '../src/game/campaign.js';
import { FREE_OPEN_M, openAt } from '../src/share/war/hoist.js';
import { SPRAY_HIDE_M, inSpray } from '../src/ui/warmarkers.js';
import { SPAWN, firstDifference, playGame } from './war-legacy-games.js';
import { runOne } from './war-balance.js';
import { createRoomWar } from '../src/share/roomwar.js';
import { waveStatus } from '../src/ui/warhud.js';
import { closureFor, restartAt, schedule } from '../src/share/war/contain.js';

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
const mm3 = (v) => Math.round(v * 1000) / 1000;

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
  const KEYS = ['time', 'cleared', 'allOut', 'destroyed', 'hit', 'killed', 'leaked', 'left', 'born', 'spot', 'down', 'gone', 'crossed', 'spent', 'output', 'region', 'breach', 'ready', 'objective', 'held', 'visited', 'contained', 'all', 'any'];
  /* A target spec's ids: a working set's every target it may draw. */
  const targetsOf = (spec, where) => {
    if (spec && typeof spec === 'object' && !Array.isArray(spec)) {
      const name = spec.of ? spec.not : spec.set;
      const set = mission.sets?.[name];
      if (!set) {
        out.push(`${where}: no set ${name}`);
        return [];
      }
      /* An { of, not } is never left with none: its list is longer than
       * the most the set draws. */
      if (spec.of && spec.of.length <= Math.max(...Object.values(set.n))) {
        out.push(`${where}: ${spec.of.length} targets, and set ${name} may draw ${Math.max(...Object.values(set.n))}`);
      }
      return spec.of ?? set.from;
    }
    return spec == null ? [] : [spec].flat();
  };
  for (const [name, set] of Object.entries(mission.sets ?? {})) {
    for (const id of set.from) {
      if (!mission.targets[id]) {
        out.push(`${mission.id} sets ${name}: no target ${id}`);
      }
    }
  }
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
    if (x.hit != null && typeof x.hit === 'object' && !Array.isArray(x.hit)) {
      targetsOf(x.hit, where);
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
      for (const t of targetsOf(w.target, where)) {
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
      for (const t of targetsOf(o.targets, `${where} ${o.id}`)) {
        if (!mission.targets[t]) {
          out.push(`${where} ${o.id}: no target ${t}`);
        }
      }
      if (o.open != null && (o.ms == null || o.targets == null)) {
        out.push(`${where} ${o.id}: opens gates but is no hold with targets`);
      }
      for (const key of ['done', 'fail', 'from', 'show']) {
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
      /* A twist's branches play as many rounds each (roundsOf). */
      if (x.to && typeof x.to === 'object') {
        const counts = x.to.pick.map((to) => roundsOf(mission, stages.findIndex((y) => y.id === to)));
        if (new Set(counts).size > 1) {
          out.push(`${where}: its twist's branches play ${counts.join(', ')} rounds`);
        }
      }
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
  /* Contain's lines (src/share/war/contain.js linesDue) and each
   * mission's own for an opening are voice lines. */
  const contained = Object.values(MISSIONS).filter((m) => m.contain);
  const missing = ['contain-breach', 'contain-retarget', 'contain-river', 'contain-half', 'contain-held', 'contain-lost', ...contained.map((m) => m.contain.op)].filter((id) => !lines.has(id));
  check(`Contain's lines and each of the ${contained.length} missions' own opening line are voice lines`, contained.length === 5 && missing.length === 0, missing.join(', '));
}

check('a match counts the rounds it plays, not every round stage: First Light 5 of its 7, the Spillway 4 of its 6, Lights Out 4 of its 6',
  roundsOf(MISSIONS['itaipu-1']) === 5 && roundsOf(MISSIONS['itaipu-2']) === 4 && roundsOf(MISSIONS['itaipu-3']) === 4 && stagesOf(MISSIONS['itaipu-1']).filter((x) => x.round).length === 7,
  `${roundsOf(MISSIONS['itaipu-1'])} ${roundsOf(MISSIONS['itaipu-2'])} ${roundsOf(MISSIONS['itaipu-3'])}`);

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
  check('born: the first of a selection, at its birth, not before the frontier reaches it', fired({ born: { group: 'g1' } }, ctx({ f: 10999 })) === null
    && fired({ born: { group: 'g1' } }, ctx({ f: 20000 })) === 11000 && fired({ born: { kind: 'boat' } }, ctx({ f: 20000 })) === null);
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
    /* The room settles its objectives before its view, every step. */
    const held = (f) => {
      objectives(c3(f));
      return objectivesView(c3(f)).find((o) => o.id === 'h');
    };
    const before = held(500);
    const mid = held(2500);
    objectives(c3(3999));
    const notYet = s3.obj.h.state;
    objectives(c3(4000));
    check('a hold counts from its own trigger, is held ms later, and the view shows how long and since when',
      before.heldMs === 0 && mid.heldMs === 1500 && mid.heldFrom === 1000 && notYet === 'active' && s3.obj.h.state === 'done' && s3.obj.h.t === 4000
      && held(9000).heldMs === 3000, JSON.stringify([before, mid, s3.obj.h]));
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

console.log('working sets');
{
  /* M2's working gates (TECH-NEEDS T1.3, T1.9): drawn once by the seed for
   * the pilots, aimed at, worth more in a stage, opened by a hold. */
  const gates = Array.from({ length: 14 }, (_, k) => `gate-${k}`);
  const mission = {
    id: 'sets',
    targets: Object.fromEntries(gates.map((id, k) => [id, { mw: 350, at: [k * 24, Y, 0], r: 12 }])),
    routes: { r: [[0, Y, -3000], [0, Y, -1000]] },
    sets: { working: { from: gates, n: { 1: 3, 4: 4 } } },
    stages: [{
      id: 'open',
      worth: { working: 2 },
      spawns: [{
        at: 1, kind: 'loiter', n: 3, route: 'r', target: { set: 'working' },
      }],
      objectives: [{
        id: 'spill', text: 'x', kind: 'hold', ms: 120000, targets: { set: 'working' }, open: 3, fail: { hit: { set: 'working' } },
      }],
      exits: [{ when: { time: 999 }, to: 'won' }],
    }],
  };
  check('a mission with sets lints clean, and lint names a set it has not got', lint(mission).length === 0
    && lint({ ...mission, stages: [{ ...mission.stages[0], spawns: [{ ...mission.stages[0].spawns[0], target: { set: 'nope' } }] }] }).length === 1);
  const sizes = new Set();
  const seen = new Set();
  let stable = true;
  let ordered = true;
  for (let seed = 1; seed <= 300; seed += 1) {
    const three = drawSets(mission, seed, 3).working;
    const four = drawSets(mission, seed, 4).working;
    sizes.add(`${three.length},${four.length},${drawSets(mission, seed, 1).working.length},${drawSets(mission, seed, 8).working.length}`);
    three.forEach((id) => seen.add(id));
    stable &&= JSON.stringify(drawSets(mission, seed, 3)) === JSON.stringify({ working: three });
    ordered &&= three.every((id, k) => k === 0 || gates.indexOf(id) > gates.indexOf(three[k - 1]));
  }
  check('three working gates for 1 to 3 pilots, four from 4, the same for a seed, every gate drawn over seeds', sizes.size === 1 && sizes.has('3,4,3,4') && stable && ordered && seen.size === 14,
    [...sizes].join(' '));
  const sets = drawSets(mission, 7, 2);
  const w = mission.stages[0].spawns[0];
  check('a spawn aimed at the set goes for its gates in turn', [0, 1, 2, 3].map((k) => waveTarget(w, k, sets)).join() === [...sets.working, sets.working[0]].join());
  const st = enter(mission, 0, 10000, 7, 1);
  const m = { sets, downAt: {}, output: 14000 };
  const other = gates.find((id) => !sets.working.includes(id));
  check('worth: a working gate costs double in the stage, another its own mw, and outside the stage its own',
    worthOf(mission, st, m, sets.working[0]) === 700 && worthOf(mission, st, m, other) === 350 && worthOf(mission, null, m, sets.working[0]) === 350);
  const c = (f) => ({
    mission, m, st, f, here: [1], pilots: [], allBorn: true, cleared: false, lastGone: null, allOut: false, spent: 0,
  });
  objectives(c(10000));
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  check('the hold opens at the entry: is active from it, and every gate stands at Free Flight\'s 2 m before', fired({ objective: 'spill', is: 'active' }, c(10000)) === 10000
    && openAt(gatesOf(mission, st, m), sets.working[0], 9999) === FREE_OPEN_M);
  check('held 0.5: halfway through, not before the frontier', fired({ held: 'spill', f: 0.5 }, c(69999)) === null && fired({ held: 'spill', f: 0.5 }, c(70000)) === 70000);
  const g0 = gatesOf(mission, st, m);
  check('each working gate\'s hoist starts at the hold\'s start toward its opening, at the hoist\'s rate (2.5 m halfway, 3 m at the end, and there it stops); the others stay at 2 m',
    g0.length === 3 && g0.every((g) => g.at === 10000 && g.open_m === 3)
    && near(openAt(g0, sets.working[1], 70000), 2.5) && near(openAt(g0, sets.working[1], 130000), 3) && near(openAt(g0, sets.working[1], 999999), 3)
    && openAt(g0, other, 70000) === FREE_OPEN_M && spilling(g0, 10001) && !spilling(g0, 9000), JSON.stringify(g0));
  /* A working gate hit 30 s into the hold. */
  note(st, { t: 40000, e: 'down', target: sets.working[2] });
  m.downAt[sets.working[2]] = 40000;
  objectives(c(41000));
  const g1 = gatesOf(mission, st, m);
  check('a hit working gate fails the hold at the hit, its hoist stopping where it was, the rest opening on',
    st.obj.spill.state === 'failed' && st.obj.spill.t === 40000 && fired({ objective: 'spill', is: 'failed' }, c(41000)) === 40000
    && near(openAt(g1, sets.working[2], 999999), 2.25) && near(openAt(g1, sets.working[0], 130000), 3), JSON.stringify(g1));
  check('and held 0.5 never fires for a hold failed before its half', fired({ held: 'spill', f: 0.5 }, c(80000)) === null);
  const st2 = enter(mission, 0, 10000, 7, 2);
  const m2 = { sets, downAt: { [sets.working[0]]: 5000 }, output: 14000 };
  objectives({ ...c(10000), m: m2, st: st2 });
  /* The Spillway's spray (itaipu-2.js `spray`), as a screen's markers
   * read it while the spill runs. */
  const spray = MISSIONS['itaipu-2'].spray;
  const deep = [spray.at[0], 200, spray.at[1]];
  check(`the spray hides an attacker deep in it from a pilot over ${SPRAY_HIDE_M} m off, not one within, nor one out of it or over it`,
    inSpray(spray, deep, [deep[0] + 400, 220, deep[2]]) && !inSpray(spray, deep, [deep[0] + 100, 220, deep[2]])
    && !inSpray(spray, [deep[0] + spray.r + 10, 200, deep[2]], [0, 0, 0]) && !inSpray(spray, [deep[0], spray.y[1] + 10, deep[2]], [0, 0, 0]));
  check('a working gate hit before the hold began never moves', openAt(gatesOf(mission, st2, m2), sets.working[0], 200000) === FREE_OPEN_M);
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
        { when: { destroyed: 'a' }, cutaway: { target: 'a', ms: 2500 } },
        /* A skip fired before the cue is due drops it; one not fired by
         * then leaves it told. */
        { at: 1, radio: 'wave-loiter', skip: { time: 0.5 } },
        { at: 1.5, radio: 'wave-fpv', skip: { destroyed: 'a' } }],
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

function warRoom(mission, {
  n = 2, seed = 0.25, dev = false, loadouts = {},
} = {}) {
  const r = new RoomCore({
    code: 'W4RS00', cap: PRIVATE_CAP, friendly: false, map: 'itaipu', epoch: 0,
  }, { devMissions: dev });
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
        airframe: 'interceptor', map: 'itaipu', figure: 1, livery: null, parts: null,
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
  for (const [i, loadout] of Object.entries(loadouts)) {
    env.say(Number(i), { type: 'war', op: 'loadout', loadout });
  }
  env.say(0, { type: 'war', op: 'start', mission: mission.id });
  return env;
}

/* How long the face's closures held a bot game's stages past their last
 * attacker, ms (MISSIONS.md 1.9 point 4: a stage waits for its closure),
 * time a mission's pacing does not set: its estimatedMinutes leave it
 * out. */
function closureWait(g) {
  const end = g.views.at(-1);
  const kinds = new Map(g.born.map((a) => [a.id, a.kind]));
  const entries = [];
  for (const v of g.views) {
    if (v.stage && entries.at(-1)?.at !== v.stage.at) {
      entries.push({ at: v.stage.at });
    }
  }
  return entries.reduce((sum, x, k) => {
    const until = entries[k + 1]?.at ?? end.endAt;
    const held = g.cues.filter((c) => c.radio === 'contain-held' && c.at >= x.at && c.at <= until).map((c) => c.at);
    if (!held.length) {
      return sum;
    }
    const gone = g.dead.filter((m) => m.at >= x.at && m.at <= until && m.ids.some((id) => kinds.get(id) !== 'scout')).map((m) => m.at);
    return sum + Math.max(0, Math.max(...held) - Math.max(x.at, ...gone));
  }, 0);
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
  let skipOk = true;
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
    if (cues.some((c) => c.radio === 'wave-loiter') || !cues.some((c) => c.radio === 'wave-fpv' && c.at === GO + 1500)) {
      skipOk = false;
      detail.push(`skip ${JSON.stringify(cues.map((c) => c.radio).filter(Boolean))}`);
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
  check('a cue whose skip fired first is dropped, one whose skip has not is told', skipOk, detail.filter((d) => d.startsWith('skip')).slice(0, 2).join(' '));
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

console.log('the room: when the face opens (Contain, MISSIONS.md 1.9)');
{
  /* One stage that waits for an opening, then sends a group after it:
   * Strikers (turned at the gantry) or a Scout (never turned, no target).
   * Its targets are the plant's, the gantries among them. */
  const contain = (kind) => ({
    ...STORY,
    id: `contain-${kind}`,
    targets: MISSIONS['itaipu-1'].targets,
    output: 14000,
    floorMw: 7700,
    contain: { op: 'test-op' },
    airframes: 1,
    routes: { n: [[0, 249, -3000], [0, 249, -2200]] },
    stages: [{
      id: 'hold',
      spawns: [{
        when: { breach: true }, at: 5, kind, n: 1, route: 'n', ...(kind === 'scout' ? {} : { target: 'intake-3' }), group: 'after',
      }],
      exits: [{ when: { cleared: true }, to: 'won', why: 'waves' }, {
        when: { allOut: true }, to: 'lost', why: 'out', clear: 'through',
      }],
    }],
  });
  const radios = (e) => e.of(0, 'cue').flatMap((m) => m.cues).filter((c) => c.radio).map((c) => [c.radio, c.at - GO]);

  /* Turned at the gantry, which it reaches while the stoplogs go down. */
  const a = warRoom(contain('strike'));
  a.fly(GO + 900);
  a.r.war.breach('intake-3', GO + 1000);
  a.fly(GO + 80000);
  const born = a.of(0, 'born').flatMap((m) => m.agents);
  const lost = a.view();
  const arrived = a.of(0, 'dead').find((m) => m.target === 'gantry-intakes');
  check('the first group born after an opening is turned at the gantry serving it', born.length === 1 && born[0].target === 'gantry-intakes' && born[0].t0 === GO + 6000,
    JSON.stringify(born));
  check('the gantry hit while it closes loses the mission at once, why shutdown', lost.state === 'lost' && lost.why === 'shutdown' && arrived && Math.abs(lost.endAt - arrived.at) < 1e-3 && lost.output === 14000,
    `${lost.state} ${lost.why} ${lost.endAt} ${arrived && arrived.at}`);
  check('the opening, the mission\'s line and the riverbank at the opening, the turn at the birth, the half, the loss at the hit and no hold',
    JSON.stringify(radios(a).slice(0, 5)) === JSON.stringify([['contain-breach', 1000], ['test-op', 1000], ['contain-river', 1000], ['contain-retarget', 6000], ['contain-half', 61000]])
    && radios(a).length === 6 && radios(a)[5][0] === 'contain-lost' && Math.abs(radios(a)[5][1] + GO - lost.endAt) < 1e-3,
    JSON.stringify(radios(a)));
  const failedObj = lost.stage.objectives.find((o) => o.id === 'contain-intake-3');
  check('its hold on the gantry shows failed', failedObj && failedObj.state === 'failed' && failedObj.kind === 'hold' && failedObj.text === 'war.obj.contain_intakes' && failedObj.ms === 120000,
    JSON.stringify(failedObj));

  /* Again from the stage (1.9 point 8): the opening made in it is undone
   * with the structures, so nothing closes and nothing is ringed. */
  a.say(0, { type: 'war', op: 'start', mission: 'contain-strike', from: 'checkpoint' });
  const toldBefore = a.of(0, 'cue').length;
  a.fly(a.clock + COUNTDOWN_MS + 500);
  const again = a.view();
  check('a restart from the stage undoes the opening made in it: no closure, no gantry ringed, nothing said', again.state === 'live' && again.stage.objectives.length === 0
    && again.contain.length === 0 && a.of(0, 'cue').length === toldBefore, `${again.state} ${JSON.stringify(again.stage.objectives)} ${JSON.stringify(again.contain)}`);
  /* One made before the stage, still closing when it opened, closes again
   * from the go, waiting for its gantry as before, and turns the next
   * group again; its opening is not called twice (contain.js restartAt). */
  const held = closureFor('intake-1', 1000);
  held.said.push('breach', 'op', 'river', 'half', 'held');
  const open = { ...closureFor('intake-2', 50000), retarget: 52000, said: ['breach', 'retarget', 'half'] };
  const queued = { ...closureFor('penstock-4', 60000), said: ['breach'] };
  const back = restartAt([held, open, queued], 130000, 300000);
  check('restartAt: held before the stage kept, the open ones from the go in turn, turned again, their opening not said again',
    JSON.stringify(back.map((c) => [c.at, c.retarget, c.said.join('+')])) === JSON.stringify([[1000, null, 'breach+op+river+half+held'], [300000, null, 'breach'], [300000, null, 'breach']])
    && JSON.stringify(schedule(back).map((x) => [x.from, x.until])) === JSON.stringify([[1000, 121000], [300000, 420000], [420000, 540000]]),
    JSON.stringify(back));

  /* Not turned: the stage waits for the closures, one gantry one at a
   * time, the spillway's beside it. */
  const b = warRoom(contain('scout'));
  b.fly(GO + 900);
  b.r.war.breach('intake-3', GO + 1000);
  b.r.war.breach('penstock-5', GO + 2000);
  b.r.war.breach('gate-2', GO + 3000);
  b.fly(GO + 130000);
  const mid = b.view();
  const objs = Object.fromEntries(mid.stage.objectives.map((o) => [o.id, o]));
  check('a Scout is never turned', b.of(0, 'born').flatMap((m) => m.agents).every((x) => x.target == null));
  check('one opening at a time on the intakes\' gantry: the penstock waits for the intake, the gate\'s runs beside them',
    objs['contain-intake-3'].state === 'done' && objs['contain-penstock-5'].state === 'active' && objs['contain-penstock-5'].heldFrom === GO + 121000
    && objs['contain-gate-2'].state === 'active' && objs['contain-gate-2'].heldFrom === GO + 3000 && objs['contain-gate-2'].ms === 150000 && objs['contain-gate-2'].text === 'war.obj.contain_spillway',
    JSON.stringify(mid.stage.objectives));
  check('the stage cannot clear while one is open', mid.state === 'live' && JSON.stringify(mid.contain) === '["gantry-intakes","gantry-spillway"]', `${mid.state} ${JSON.stringify(mid.contain)}`);
  b.fly(GO + 250000);
  const won = b.view();
  check('it clears when the last is held', won.state === 'won' && won.endAt === GO + 241000, `${won.state} ${won.endAt}`);
  const said = radios(b);
  check('each opening called, the mission\'s line once, each half and each hold',
    JSON.stringify(said.filter(([r]) => r === 'contain-breach').map(([, t]) => t)) === '[1000,2000,3000]' && said.filter(([r]) => r === 'test-op' || r === 'contain-river').length === 2
    && JSON.stringify(said.filter(([r]) => r === 'contain-half').map(([, t]) => t)) === '[61000,78000,181000]'
    && JSON.stringify(said.filter(([r]) => r === 'contain-held').map(([, t]) => t)) === '[121000,153000,241000]',
    JSON.stringify(said));

  /* The squad gone with the turned group alive: the lost stage sends it
   * through, onto the gantry, and that loss is said too. */
  const g = warRoom(contain('strike'));
  g.fly(GO + 900);
  g.r.war.breach('intake-3', GO + 1000);
  g.fly(GO + 7000);
  g.paths[0] = null;
  g.paths[1] = null;
  g.fly(GO + 20000);
  const gone = g.view();
  const through = g.of(0, 'dead').find((m) => m.target === 'gantry-intakes');
  check('a lost stage\'s attackers through at the gantry lose the mission, and the loss is said', gone.state === 'lost' && gone.why === 'shutdown' && through
    && radios(g).some(([r, t]) => r === 'contain-lost' && t === gone.endAt - GO), `${gone.state} ${gone.why} ${JSON.stringify(radios(g))}`);

  /* A store and a restore mid closure change nothing after it. */
  const once = warRoom(contain('scout'));
  const twice = warRoom(contain('scout'));
  for (const x of [once, twice]) {
    x.fly(GO + 900);
    x.r.war.breach('intake-3', GO + 1000);
    x.r.war.breach('penstock-5', GO + 2000);
  }
  once.fly(GO + 130000);
  twice.fly(GO + 70000);
  twice.r.war.restore(JSON.parse(JSON.stringify(twice.stored)));
  twice.fly(GO + 130000);
  check('a store and a restore mid closure change nothing after it', JSON.stringify(told(once)) === JSON.stringify(told(twice)), `${told(once).length} vs ${told(twice).length}`);

  /* Held, an opening the room recorded with a hole is told again at zero
   * size at the hold (1.9 point 5): an op 'damage' by the stoplogs, kept
   * with the match's damage, which a late joiner is sent (war.js join);
   * the mission is won at that hold, so no pilot can join after it. */
  const z = warRoom(contain('scout'));
  z.fly(GO + 900);
  const hole = {
    id: 'gate-2', target: 'gate-2', kind: 'gate', at: GO + 3000, sill: [-1000, 212, -1010], width_m: 4, height_m: 3, normal: [0, 0, 1], upstream_cell: null, downstream_cell: null,
  };
  z.r.war.match.wreck['gate-2'] = { gone: [], open: hole };
  z.r.war.breach('gate-2', GO + 3000);
  z.fly(GO + 160000);
  const shut = z.of(0, 'damage').filter((m) => m.by === 'stoplogs');
  const kept = z.r.war.match.damage.filter((e) => e.by === 'stoplogs');
  check('held, the opening is told again at zero size at the hold, by the stoplogs, and kept with the match\'s damage for a late joiner',
    shut.length === 1 && shut[0].at === GO + 153000 && shut[0].openings.length === 1 && shut[0].openings[0].id === 'gate-2' && shut[0].openings[0].width_m === 0 && shut[0].openings[0].height_m === 0
    && shut[0].openings[0].at === GO + 153000 && shut[0].chunks.length === 0 && kept.length === 1 && kept[0].seq === shut[0].seq
    && z.r.war.match.wreck['gate-2'].shut === GO + 153000,
    JSON.stringify([shut, kept.length]));

  /* A mission with no `contain` and a structure no gantry closes start none. */
  const c = warRoom({ ...contain('scout'), contain: undefined, id: 'contain-none' });
  c.fly(GO + 900);
  c.r.war.breach('intake-3', GO + 1000);
  const d = warRoom(contain('scout'));
  d.fly(GO + 900);
  d.r.war.breach('yard-right', GO + 1000);
  c.fly(GO + 20000);
  d.fly(GO + 20000);
  check('no closure without the mission\'s contain, nor for the yard', c.view().state === 'won' && d.view().state === 'won' && !c.of(0, 'cue').length && !d.of(0, 'cue').length,
    `${c.view().state} ${d.view().state}`);
}

console.log('the room: The Long Night\'s exits wait for a closure too (MISSIONS.md 1.9 point 4)');
{
  /* Hunters and Before Dawn end on their groups gone, not `cleared`, so
   * each holds its own exit for a closure ({ contained: true }). Each is
   * played from its own entry, M4's stage as written with the stages it
   * exits to, no floor (the squad far off, everything gets through); a
   * gate opened a minute in closes 150 s later, after HUNT_S, and the
   * same stage with no Contain leaves before that. */
  const m4 = MISSIONS['itaipu-4'];
  const from = (id, contain) => {
    const stages = stagesOf(m4);
    const i = stages.findIndex((x) => x.id === id);
    return {
      ...m4, id: `m4-${id}-${contain ? 'contain' : 'plain'}`, floorMw: 0, contain: contain ? m4.contain : undefined, stages: stages.slice(i),
    };
  };
  const play = (id, contain) => {
    const e = warRoom(from(id, contain));
    while (e.view().state !== 'live') {
      e.fly(e.clock + 500);
    }
    const go = e.view().goAt;
    e.fly(go + 900);
    e.r.war.breach('gate-3', go + 60000);
    e.fly(go + 600000);
    const left = e.r.war.log.find((x) => x.what === 'stage' && x.stage === id);
    const held = e.of(0, 'cue').flatMap((m) => m.cues).filter((c) => c.radio === 'contain-held').map((c) => c.at);
    return {
      e, left: left && { ...left, t: left.t - go }, held: held.map((t) => t - go),
    };
  };
  for (const id of ['hunters', 'before-dawn']) {
    const c = play(id, true);
    const p = play(id, false);
    const last = c.held.length ? Math.max(...c.held) : null;
    check(`${id}: under a closure its exit waits for the last hold, and without one leaves before the gate's (${p.left && p.left.t} ms, ${c.left && c.left.t} ms)`,
      c.left && p.left && c.held.includes(210000) && c.left.t === last && p.left.t < 210000 && c.left.exit === 0 && p.left.exit === 0,
      `${JSON.stringify(c.left)} ${JSON.stringify(p.left)} ${JSON.stringify(c.held)}`);
  }
  const dawn = play('before-dawn', true).e.view();
  check('before-dawn: the mission is won only at the hold', dawn.state === 'won' && dawn.why === 'waves', `${dawn.state} ${dawn.why}`);
}

console.log('the room: the Spillway\'s hold pauses while the spillway\'s gantry closes a gate (MISSIONS.md M2, If the face opens)');
{
  /* Open the Gates as written, from its entry, with nobody born (so its
   * hold is never failed by a hit), a gate opened 30 s in: its closure
   * runs 30 to 180 s, so the 240 s hold is done at 390 s, its half at
   * 270 s; the screen is told it paused (no heldFrom) and from when it
   * counts again. An intake's closure pauses nothing. */
  const m2 = MISSIONS['itaipu-2'];
  const stages = stagesOf(m2);
  const i = stages.findIndex((x) => x.id === 'open-spray');
  const play = (target, times) => {
    const e = warRoom({
      ...m2, id: `m2-pause-${target}`, floorMw: 0, stages: [{ ...stages[i], spawns: [] }, ...stages.slice(i + 1)],
    });
    while (e.view().state !== 'live') {
      e.fly(e.clock + 500);
    }
    const go = e.view().goAt;
    e.fly(go + 900);
    e.r.war.breach(target, go + 30000);
    const spill = (t) => {
      e.fly(go + t);
      const o = e.view().stage.objectives.find((x) => x.id === 'spill');
      return {
        state: o.state, heldMs: o.heldMs, heldFrom: o.heldFrom == null ? null : o.heldFrom - go,
      };
    };
    const at = times.map(spill);
    const half = e.of(0, 'cue').flatMap((m) => m.cues).find((c) => c.radio === 'itaipu-2-s3-half');
    return { at, half: half && half.at - go };
  };
  const gate = play('gate-3', [100000, 200000, 389000, 391000]);
  const [paused, running, before, done] = gate.at;
  check('paused, the hold is told by how long it held and no heldFrom; running again, from when it would have begun',
    paused.state === 'active' && paused.heldFrom === null && paused.heldMs === 30000 && running.heldMs > 30000 && running.heldFrom === 150000,
    JSON.stringify([paused, running]));
  check('held 150 s late: active at 389 s, done at 391 s, its half said at 270 s', before.state === 'active' && done.state === 'done' && gate.half === 270000,
    JSON.stringify([before, done, gate.half]));
  const intake = play('intake-3', [241000]);
  check('an intake\'s closure does not pause it: done by 241 s, its half at 120 s', intake.at[0].state === 'done' && intake.half === 120000,
    JSON.stringify([intake.at[0], intake.half]));
}

console.log('the room: a hold that starts when the pilots reach a place');
{
  /* The view never runs a trigger: a hold whose start is a region (which
   * needs the pilots' places) is settled by the step and read by the
   * view, in every welcome too. */
  const HOLD = {
    ...STORY,
    id: 'hold-test',
    stages: [{
      id: 'hold',
      spawns: [],
      objectives: [{
        id: 'stay', text: 'war.obj.stay', kind: 'hold', ms: 4000, from: { region: { at: [0, 900], r: 30 }, pilots: 'all' },
      }],
      exits: [{ when: { objective: 'stay' }, to: 'won', why: 'held' }],
    }],
  };
  const e = warRoom(HOLD, { n: 1 });
  e.fly(GO + 2000);
  const idle = e.view().stage.objectives[0];
  e.paths[0] = () => [0, Y, 905];
  e.fly(GO + 3000);
  const holding = e.view().stage.objectives[0];
  const late = e.join(1);
  const welcome = late.got.find((m) => m.type === 'welcome');
  e.fly(GO + 9000);
  const v = e.view();
  check('a region-started hold: not begun while nobody is there, then held from the pilots\' arrival, told to a joiner too',
    idle.heldFrom == null && idle.heldMs === 0 && holding.heldFrom >= GO + 2000 && holding.heldFrom <= GO + 2100
    && welcome.war.stage.objectives[0].heldFrom === holding.heldFrom, JSON.stringify([idle, holding]));
  check('and done its ms after, ending the stage', v.state === 'won' && v.why === 'held' && v.endAt === holding.heldFrom + 4000, `${v.state} ${v.endAt}`);
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
  /* A stage's HUD says stage, never round or last wave: a stage opens
   * groups on events too, and its lower third names it (First Light
   * played through, 5 October: "LAST WAVE" for 100 s of its first stage,
   * "ROUND 2/5" under "PROBE"). */
  const sv = {
    ...client.view(), state: 'live', stage: { id: 'probe' }, nextAt: null, roundState: 'live',
  };
  check('a stage with nothing due and contacts up says to clear them, not that it is the last wave',
    waveStatus({ ...sv, alive: 2 }, client.mission(), 0)?.text === 'CLEAR THE CONTACTS');
  check('and with none up, the stage is clear', waveStatus({ ...sv, alive: 0 }, client.mission(), 0)?.text === 'STAGE CLEAR');
  check('between stages, the next stage\'s clock', waveStatus({ ...sv, roundState: 'result', nextRoundAt: 9000 }, client.mission(), 0)?.text === 'NEXT STAGE IN 0:09');
}

console.log('crossings: a birth drawn in a window, at a fractional room ms');
{
  /* First Light's stage 3 with two pilots drew its low group's birth at
   * 529516.73 ms; the crossing's halving between fractional ends stopped
   * moving and the room hung (5 October). Before the fix this section
   * never returns. */
  const mission = MISSIONS['itaipu-1'];
  const a = {
    id: 10, kind: 'decoy', route: 'east-shore-low', k: 0, n: 3, err: 0, target: 'intake-13', wave: 5, sector: 'NE',
  };
  const whole = crossings(mission, planAgent(mission, { ...a, t0: 529516 }));
  const frac = crossings(mission, planAgent(mission, { ...a, t0: 529516.7305433344 }));
  const lines = whole ? Object.keys(whole) : [];
  check('a flight along the east shore crosses a mission line', lines.length > 0, JSON.stringify(whole));
  check('the same flight born 0.73 ms later crosses the same lines, each within 2 ms later, on whole milliseconds',
    Boolean(frac) && lines.every((l) => Number.isInteger(frac[l]) && frac[l] - whole[l] >= 0 && frac[l] - whole[l] <= 2),
    `${JSON.stringify(whole)} then ${JSON.stringify(frac)}`);
}

console.log('crossings: a birth drawn in a window, at a fractional room ms');
{
  /* First Light's stage 3 with two pilots drew its low group's birth at
   * 529516.73 ms; the crossing's halving between fractional ends stopped
   * moving and the room hung (5 October). Before the fix this section
   * never returns. */
  const mission = MISSIONS['itaipu-1'];
  const a = {
    id: 10, kind: 'decoy', route: 'east-shore-low', k: 0, n: 3, err: 0, target: 'intake-13', wave: 5, sector: 'NE',
  };
  const whole = crossings(mission, planAgent(mission, { ...a, t0: 529516 }));
  const frac = crossings(mission, planAgent(mission, { ...a, t0: 529516.7305433344 }));
  const lines = whole ? Object.keys(whole) : [];
  check('a flight along the east shore crosses a mission line', lines.length > 0, JSON.stringify(whole));
  check('the same flight born 0.73 ms later crosses the same lines, each within 2 ms later, on whole milliseconds',
    Boolean(frac) && lines.every((l) => Number.isInteger(frac[l]) && frac[l] - whole[l] >= 0 && frac[l] - whole[l] <= 2),
    `${JSON.stringify(whole)} then ${JSON.stringify(frac)}`);
}

console.log('the room: an objective shown when its trigger fires');
{
  /* A twist's own objective (itaipu-2's open-* stages): out of the view,
   * and neither done nor failed, until its `show` fires. */
  const SHOW = {
    ...STORY,
    id: 'show-test',
    stages: [{
      id: 'only',
      title: 'war.stage.test',
      spawns: [{
        at: 20, kind: 'strike', n: 1, route: 'w', target: 'a', group: 'late',
      }],
      objectives: [
        { id: 'all', text: 'x', kind: 'protect' },
        {
          id: 'late', text: 'y', kind: 'kill', show: { born: { group: 'late' } }, done: { down: { group: 'late' } }, fail: { leaked: 1, group: 'late' },
        },
      ],
      exits: [{ when: { time: 200 }, to: 'won' }],
    }],
  };
  const e = warRoom(SHOW, { seed: 0.3 });
  e.fly(GO + 15000);
  const before = e.view().stage.objectives.map((o) => o.id).join();
  e.fly(GO + 21000);
  const after = e.view().stage.objectives;
  check('before its trigger the view has the other objectives only, after it the shown one too, active',
    before === 'all' && after.map((o) => o.id).join() === 'all,late' && after[1].state === 'active', `${before} then ${JSON.stringify(after)}`);
}

console.log('the Spillway (itaipu-2), flown on the room by bot squads');
{
  /* MISSIONS.md M2 as the room plays it: scripts/war-balance.js's good
   * pilots on the real room, every message to the first bot kept. */
  const mission = MISSIONS['itaipu-2'];
  const floorBuf = readFileSync(new URL('../src/share/war/itaipu-height.bin', import.meta.url));
  const OPEN_M = mission.stages.find((x) => x.id === 'open-spray').objectives[0].open;
  const TWIST = {
    'open-spray': ['itaipu-2-ta-turn', 'itaipu-2-ta-why'], 'open-west-arm': ['itaipu-2-tb-turn', 'itaipu-2-tb-why'], 'open-chute': ['itaipu-2-tc-turn', 'itaipu-2-tc-why'],
  };
  const games = [];
  for (const pilots of [1, 4]) {
    for (const seed of [1, 2, 3, 4, 5]) {
      const views = [];
      const cues = [];
      const born = [];
      const dead = [];
      runOne({
        pilots,
        skill: 'good',
        seed,
        floorBuf,
        spawn: SPAWN,
        mission,
        record: (m, now) => {
          if (m.type !== 'war') {
            return;
          }
          if (m.war) {
            views.push({ ...m.war, now });
          } else if (m.op === 'cue') {
            cues.push(...m.cues);
          } else if (m.op === 'born') {
            born.push(...m.agents);
          } else if (m.op === 'dead') {
            dead.push(m);
          }
        },
      });
      games.push({
        pilots, seed, views, cues, born, dead,
      });
    }
  }
  const order = [];
  const bad = [];
  const twists = new Set();
  for (const g of games) {
    const label = `x${g.pilots} seed ${g.seed}`;
    const path = [];
    for (const v of g.views) {
      if (v.stage && path.at(-1) !== v.stage.id) {
        path.push(v.stage.id);
      }
    }
    order.push(`${label}: ${path.join(' > ')}`);
    const twist = path[2];
    twists.add(twist);
    const end = g.views.at(-1);
    if (!(path.length === 4 && path[0] === 'high-water' && path[1] === 'channel' && TWIST[twist] && path[3] === 'hold-river')) {
      bad.push(`${label}: stages ${path.join(',')}`);
    }
    if (end.state !== 'won') {
      bad.push(`${label}: ended ${end.state} ${end.why}`);
    }
    const said = g.cues.filter((c) => c.radio).map((c) => c.radio);
    const want = ['itaipu-2-g-gates', 'itaipu-2-s1-eyes', 'itaipu-2-s1-high', 'itaipu-2-g-channel', 'itaipu-2-s2-wakes', 'itaipu-2-s2-fast', 'itaipu-2-s3-open', 'itaipu-2-g-spill', ...TWIST[twist] ?? [], 'itaipu-2-s4-all', 'itaipu-2-s4-order', 'itaipu-2-g-working'];
    const missing = want.filter((id) => !said.includes(id));
    if (missing.length) {
      bad.push(`${label}: never said ${missing.join(',')}`);
    }
    const others = Object.entries(TWIST).filter(([k]) => k !== twist).flatMap(([, ids]) => ids).filter((id) => said.includes(id));
    if (others.length) {
      bad.push(`${label}: said another twist's ${others.join(',')}`);
    }
    /* The hold: the working gates hoisted from its start toward OPEN_M,
     * its half and its end (or its failure) said, and the twist's
     * objective on the HUD only once the twist is born. */
    const open = g.views.find((v) => v.stage && v.stage.id === twist && v.stage.objectives[0].heldFrom != null);
    const from = open && open.stage.objectives[0].heldFrom;
    const working = open && open.sets.working;
    const moved = open && working.every((id) => (open.gates ?? []).some((x) => x.gate === id && x.at === from && x.open_m === OPEN_M));
    if (!moved) {
      bad.push(`${label}: the hold's gates ${JSON.stringify(open && open.gates)} for ${JSON.stringify(working)} from ${from}`);
    }
    const settled = said.includes('itaipu-2-s3-held') || said.includes('itaipu-2-s3-failed');
    const held = said.includes('itaipu-2-s3-held');
    if (!settled || (held && !said.includes('itaipu-2-s3-half'))) {
      bad.push(`${label}: the hold said ${said.filter((id) => id.startsWith('itaipu-2-s3')).join(',')}`);
    }
    const inTwist = g.views.filter((v) => v.stage && v.stage.id === twist);
    const twistSi = stagesOf(mission).find((x) => x.id === twist)?.spawns.find((w) => w.group === 'twist')?.si;
    const twistBorn = g.born.find((a) => a.wave === twistSi);
    const early = inTwist.filter((v) => twistBorn && v.now < twistBorn.t0 && v.stage.objectives.some((o) => o.id === 'twist'));
    const shown = inTwist.some((v) => v.stage.objectives.some((o) => o.id === 'twist'));
    if (!twistBorn || early.length || !shown) {
      bad.push(`${label}: the twist's objective shown early ${early.length}, ever ${shown}, born ${twistBorn && twistBorn.t0}`);
    }
  }
  console.log(`    ${order.join('\n    ')}`);
  check('ten games, 1 and 4 good pilots: High Water, The Channel, one twist of Open the Gates, Hold the River, and won', bad.filter((x) => /stages|ended/.test(x)).length === 0,
    bad.filter((x) => /stages|ended/.test(x)).join(' | '));
  check('every stage\'s story and guide said: each objective\'s guide line, the scout, the Loiterers, the wakes, the Strikers, the gates opening, the twist\'s two lines and no other twist\'s, the convergence and its order',
    bad.filter((x) => /said/.test(x)).length === 0, bad.filter((x) => /said/.test(x)).join(' | '));
  check('the hold hoists every working gate from its start toward its opening, and settles held (its half said) or failed',
    bad.filter((x) => /hold/.test(x)).length === 0, bad.filter((x) => /hold/.test(x)).join(' | '));
  check('the twist\'s own objective is on the HUD once the twist is born, not before', bad.filter((x) => /objective/.test(x)).length === 0,
    bad.filter((x) => /objective/.test(x)).join(' | '));
  check('over the ten games all three twists are met', twists.size === 3, [...twists].join(','));
  /* The length a squad takes (estimatedMinutes, which Operations'
   * briefing shows), from the go to the end, on these good bots, less
   * what the face's closures held their stages past their last attacker
   * (MISSIONS.md 1.9 point 4: a stage waits for its closure), which is
   * time the mission's pacing does not set: shown on its own line. */
  const [lo, hi] = mission.estimatedMinutes;
  const waits = games.map((g) => closureWait(g) / 60000);
  const minutes = games.map((g, k) => (g.views.at(-1).endAt - g.views.at(-1).goAt) / 60000 - waits[k]);
  console.log(`    minutes the closures held a stage: ${waits.map((x) => x.toFixed(1)).join(' ')}`);
  check(`every won game ends ${lo} to ${hi} minutes after the go, the closures' waits apart`, minutes.every((x) => x >= lo && x <= hi),
    minutes.map((x) => x.toFixed(1)).join(' '));

  /* Nobody shooting: the headless pass's game, once per twist. The squad
   * flies far off, so every attacker gets through. The first stages take
   * only gates that are not working, so every working gate stands when
   * the spill opens; there each hit costs double, the hold fails and the
   * output falls under the floor (on main before this, the same game
   * held the spill, nothing of the stage reaching a gate inside its two
   * minutes, and won with nobody flying). */
  const rooms = [0.15, 0.3, 0.41].map((seed) => {
    const r = warRoom(mission, { n: 1, seed, dev: true });
    r.fly(GO + 900000);
    return r;
  });
  const ends = rooms.map((r) => r.view());
  check('with nobody shooting the Spillway is lost in Open the Gates, under its floor, in each twist, and offers that stage again',
    ends.every((x) => x.state === 'lost' && x.why === 'output' && x.checkpoint && /^open-/.test(x.checkpoint.stage)
      && x.checkpoint.n === stagesOf(mission).findIndex((y) => y.id === x.checkpoint.stage))
      && new Set(ends.map((x) => x.checkpoint && x.checkpoint.stage)).size === 3,
    JSON.stringify(ends.map((x) => ({ state: x.state, why: x.why, cp: x.checkpoint }))));
  const failedHold = rooms.every((r) => r.of(0).some((m) => m.war.stage && /^open-/.test(m.war.stage.id) && m.war.stage.objectives[0].state === 'failed'));
  check('and its hold fails: a working gate is hit inside it', failedHold);
  /* What a hit cost, in the room's death message, which the HUD calls. */
  const deaths = rooms.flatMap((r) => r.of(0, 'dead').filter((m) => m.hit));
  const working = new Set(ends.flatMap((x) => x.sets.working));
  const firstHit = new Map();
  const costs = { first: [], again: [], spill: [] };
  for (const [k, r] of rooms.entries()) {
    const seen = new Set();
    const spillAt = r.of(0).map((m) => m.war).find((w) => w.stage && /^open-/.test(w.stage.id))?.stage.at ?? Infinity;
    for (const m of r.of(0, 'dead').filter((x) => x.hit)) {
      const key = `${k}:${m.target}`;
      if (seen.has(key)) {
        costs.again.push(m.mw);
      } else if (ends[k].sets.working.includes(m.target) && m.at >= spillAt) {
        costs.spill.push(m.mw);
      } else {
        costs.first.push(m.mw);
      }
      seen.add(key);
      firstHit.set(key, m.at);
    }
  }
  check('each hit\'s death says what it cost: a gate 350, a working gate in the spill 700, a gate already down 0',
    deaths.length > 0 && working.size > 0 && costs.first.every((x) => x === 350) && costs.spill.length > 0 && costs.spill.every((x) => x === 700) && costs.again.every((x) => x === 0),
    JSON.stringify(costs));
  const e = rooms[2];
  const lost = ends[2];
  const told = e.of(0).length;
  e.say(0, { type: 'war', op: 'start', mission: mission.id, from: 'checkpoint' });
  const again = e.of(0).slice(told).map((m) => m.war)[0];
  check('the restart counts down into that stage, the gates back at Free Flight\'s opening as the stage found them (no hoist moved before it)',
    again && again.state === 'countdown' && again.restarted === lost.checkpoint.stage && (again.gates ?? []).length === 0 && (lost.gates ?? []).length > 0,
    JSON.stringify(again && { state: again.state, restarted: again.restarted, gates: again.gates, lost: lost.gates }));
  e.fly(e.clock + COUNTDOWN_MS + 3000);
  const v = e.view();
  check('it opens on the twist stage drawn before, its hold running again from the go',
    v.stage && v.stage.id === lost.checkpoint.stage && v.stage.objectives[0].heldFrom === v.stage.at,
    JSON.stringify(v.stage && { id: v.stage.id, at: v.stage.at, o: v.stage.objectives[0] }));
}

/*
 * The room's clock over a bot game (TECH-NEEDS T1.11): every clock it
 * told the first bot (the welcome's, then each 'daytime'), in order,
 * against src/share/daytime.js missionClock along the stages the game
 * played: the mission's start, each stage's on its entry, the end's. ''
 * when they agree, else what differs.
 */
function lightTold(mission, g) {
  const time = missionTime(mission);
  const st = stagesOf(mission);
  const want = [missionClock(time, st)];
  let last = null;
  for (const v of g.views) {
    if (v.stage && v.stage.id !== last?.id) {
      last = v.stage;
      want.push(missionClock(time, st, { n: v.stage.n, at: v.stage.at }));
    }
  }
  want.push(missionClock(time, st, { n: last.n, at: last.at }, g.views.at(-1).endAt));
  const runs = (xs) => xs.map((x) => JSON.stringify(x)).filter((x, i, a) => i === 0 || x !== a[i - 1]);
  /* The bots are welcomed into a free room before its war: no clock. */
  const a = runs(g.clocks[0] === null ? g.clocks.slice(1) : g.clocks);
  const b = runs(want);
  return a.join() === b.join() ? '' : `told ${a.join(' ')} want ${b.join(' ')}`;
}

console.log('Lights Out (itaipu-3), flown on the room by bot squads');
{
  /* MISSIONS.md M3 as the room plays it, as the Spillway's above. */
  const mission = MISSIONS['itaipu-3'];
  const floorBuf = readFileSync(new URL('../src/share/war/itaipu-height.bin', import.meta.url));
  const TWIST = {
    'reroute-pack': ['itaipu-3-ta-turn', 'itaipu-3-ta-why'], 'reroute-feint': ['itaipu-3-tb-turn', 'itaipu-3-tb-why'], 'reroute-wires': ['itaipu-3-tc-turn', 'itaipu-3-tc-why'],
  };
  const TWISTS = Object.keys(TWIST);
  const games = [];
  for (const pilots of [1, 4]) {
    for (const seed of [1, 2, 3, 4, 5]) {
      const views = [];
      const cues = [];
      const born = [];
      const clocks = [];
      runOne({
        pilots,
        skill: 'good',
        seed,
        floorBuf,
        spawn: SPAWN,
        mission,
        record: (m, now) => {
          if (m.type === 'welcome' || m.type === 'daytime') {
            clocks.push(m.daytime ?? null);
          }
          if (m.type !== 'war') {
            return;
          }
          if (m.war) {
            views.push({ ...m.war, now });
          } else if (m.op === 'cue') {
            cues.push(...m.cues);
          } else if (m.op === 'born') {
            born.push(...m.agents);
          }
        },
      });
      games.push({
        pilots, seed, views, cues, born, clocks,
      });
    }
  }
  const order = [];
  const bad = [];
  const twists = new Set();
  const holds = [];
  for (const g of games) {
    const label = `x${g.pilots} seed ${g.seed}`;
    const path = [];
    for (const v of g.views) {
      if (v.stage && path.at(-1) !== v.stage.id) {
        path.push(v.stage.id);
      }
    }
    order.push(`${label}: ${path.join(' > ')}`);
    const twist = path[2];
    twists.add(twist);
    const end = g.views.at(-1);
    if (!(path.length === 4 && path[0] === 'dusk' && path[1] === 'lie' && TWISTS.includes(twist) && path[3] === 'dark')) {
      bad.push(`${label}: stages ${path.join(',')}`);
    }
    if (end.state !== 'won') {
      bad.push(`${label}: ended ${end.state} ${end.why}`);
    }
    const said = g.cues.filter((c) => c.radio).map((c) => c.radio);
    const want = ['itaipu-3-g-yard', 'itaipu-3-s1-eyes', 'itaipu-3-s1-pair', 'itaipu-3-s2-stream', 'itaipu-3-s2-why', 'itaipu-3-s3-despacho', 'itaipu-3-g-reroute', ...TWIST[twist] ?? [],
      'itaipu-3-s4-dark', 'itaipu-3-s4-all', 'itaipu-3-s4-order', 'itaipu-3-g-dark'];
    const missing = want.filter((id) => !said.includes(id));
    if (missing.length) {
      bad.push(`${label}: never said ${missing.join(',')}`);
    }
    const others = Object.entries(TWIST).filter(([k]) => k !== twist).flatMap(([, ids]) => ids).filter((id) => said.includes(id));
    if (others.length) {
      bad.push(`${label}: said another twist's ${others.join(',')}`);
    }
    /* The reroute's hold, settled before the stage leaves, its end said
     * once, the right one: held with the yard standing (done), held with
     * it already down (back), or failed; and the twist's objective on
     * the HUD only once the twist is born. */
    const inTwist = g.views.filter((v) => v.stage && v.stage.id === twist);
    const state = inTwist.at(-1)?.stage.objectives.find((o) => o.id === 'reroute')?.state;
    const yardDown = Boolean(inTwist[0]?.down?.includes('yard-right'));
    const ends = said.filter((id) => /^itaipu-3-s3-(done|back|failed)$/.test(id));
    const told = state === 'failed' ? 'itaipu-3-s3-failed' : yardDown ? 'itaipu-3-s3-back' : 'itaipu-3-s3-done';
    holds.push(`${state}${yardDown ? '(yard down)' : ''}`);
    if ((state !== 'done' && state !== 'failed') || ends.join() !== told) {
      bad.push(`${label}: the hold left ${state}, said ${ends.join(',')}`);
    }
    /* The reroute's restore (TECH-NEEDS T1.10, grid.js WHAT COMES BACK):
     * a hold that is done feeds its districts round the yard from the room
     * ms it held, told while the stage still runs and in every view after;
     * a failed one, nothing. */
    const hold = stagesOf(mission).find((x) => x.id === twist)?.objectives.find((o) => o.id === 'reroute');
    const restoreWant = state === 'done' && hold ? JSON.stringify([{ at: inTwist[0].stage.at + hold.ms, districts: hold.restore }]) : '[]';
    const told3 = g.views.map((v) => JSON.stringify(v.restores));
    const firstTold = g.views.find((v) => JSON.stringify(v.restores) === restoreWant);
    if (told3.at(-1) !== restoreWant || told3.some((x) => x !== '[]' && x !== restoreWant)
      || (restoreWant !== '[]' && firstTold?.stage?.id !== twist)) {
      bad.push(`${label}: the restore told ${[...new Set(told3)].join(' then ')}, want ${restoreWant} from the hold's end in ${twist}`);
    }
    const twistSi = stagesOf(mission).find((x) => x.id === twist)?.spawns.find((w) => w.group === 'twist')?.si;
    const twistBorn = g.born.find((a) => a.wave === twistSi);
    const early = inTwist.filter((v) => twistBorn && v.now < twistBorn.t0 && v.stage.objectives.some((o) => o.id === 'twist'));
    const shown = inTwist.some((v) => v.stage.objectives.some((o) => o.id === 'twist'));
    if (!twistBorn || early.length || !shown) {
      bad.push(`${label}: the twist's objective shown early ${early.length}, ever ${shown}, born ${twistBorn && twistBorn.t0}`);
    }
  }
  console.log(`    ${order.join('\n    ')}`);
  console.log(`    holds: ${holds.join(' ')}`);
  check('ten games, 1 and 4 good pilots: Dusk, The Lie, one twist of Reroute, The Dark, and won', bad.filter((x) => /stages|ended/.test(x)).length === 0,
    bad.filter((x) => /stages|ended/.test(x)).join(' | '));
  check('every stage\'s story and guide said: each objective\'s guide line, the scout, the pair, the stream and why, DESPACHO, the twist\'s two lines and no other twist\'s, the dark and its order',
    bad.filter((x) => /said/.test(x) && !/hold/.test(x)).length === 0, bad.filter((x) => /said/.test(x) && !/hold/.test(x)).join(' | '));
  check('the reroute\'s hold settles, held or failed, before its stage ends, and DESPACHO says which', bad.filter((x) => /hold/.test(x)).length === 0,
    bad.filter((x) => /hold/.test(x)).join(' | '));
  check('a hold that is done restores its four towns from the room ms it held, told in its own stage and every view after; a failed one restores nothing',
    bad.filter((x) => /restore/.test(x)).length === 0, bad.filter((x) => /restore/.test(x)).join(' | '));
  check('the twist\'s own objective is on the HUD once the twist is born, not before', bad.filter((x) => /objective/.test(x)).length === 0,
    bad.filter((x) => /objective/.test(x)).join(' | '));
  check('over the ten games all three twists are met', twists.size === 3, [...twists].join(','));
  const lightOff = games.map((g) => lightTold(mission, g)).filter(Boolean);
  check('the room\'s clock is the mission\'s light (daytime.js missionClock): the golden hour, the ramp into the night told as Reroute opens, the night from The Dark and over the end',
    lightOff.length === 0 && games.every((g) => g.clocks.some((c) => c && c.rate > 0 && c.to === TIME_HOUR.night)), lightOff.join(' | '));
  const [lo, hi] = mission.estimatedMinutes;
  const minutes = games.map((g) => (g.views.at(-1).endAt - g.views.at(-1).goAt) / 60000);
  check(`every won game ends ${lo} to ${hi} minutes after the go`, minutes.every((x) => x >= lo && x <= hi),
    minutes.map((x) => x.toFixed(1)).join(' '));

  /* Nobody shooting: the yard falls in the first stage and the west
   * intakes after it, so the output goes under the floor before the end,
   * and the restart offers the stage it was lost in. */
  const rooms = [0.15, 0.3, 0.41].map((seed) => {
    const r = warRoom(mission, { n: 1, seed, dev: true });
    r.fly(GO + 900000);
    return r;
  });
  const ends = rooms.map((r) => r.view());
  check('with nobody shooting Lights Out is lost under its floor, and offers the stage it was lost in again',
    ends.every((x) => x.state === 'lost' && x.why === 'output' && x.checkpoint
      && x.checkpoint.n === stagesOf(mission).findIndex((y) => y.id === x.checkpoint.stage)),
    JSON.stringify(ends.map((x) => ({ state: x.state, why: x.why, cp: x.checkpoint }))));
  const yardFirst = rooms.every((r) => {
    const hit = r.of(0, 'dead').find((m) => m.hit && m.target === 'yard-right');
    const stage = r.of(0).map((m) => m.war).filter((w) => w && w.stage && w.stage.at <= (hit?.at ?? -1)).at(-1)?.stage.id;
    return hit && hit.mw === 2800 && stage === 'dusk';
  });
  check('and the yard is its first stage\'s loss, 2 800 MW', yardFirst);

  /* The yard down before Reroute opens, so its hold cannot fail: the
   * restore comes at the hold's end, and a restart from a stage after it
   * keeps it (the stage's path entry, which the checkpoint copies). */
  const hold = stagesOf(mission).find((x) => x.id === 'reroute-pack').objectives.find((o) => o.id === 'reroute');
  const downHeld = rooms.map((r) => {
    const views = r.of(0).map((m) => m.war);
    const rr = views.find((v) => v.stage && /^reroute-/.test(v.stage.id))?.stage;
    const done = views.some((v) => v.stage?.id === rr?.id && v.stage.objectives.some((o) => o.id === 'reroute' && o.state === 'done'));
    const want = rr && done ? [{ at: rr.at + hold.ms, districts: hold.restore }] : [];
    const end = r.view();
    const told = r.of(0).length;
    r.say(0, { type: 'war', op: 'start', mission: mission.id, from: 'checkpoint' });
    const again = r.of(0).slice(told).map((m) => m.war)[0];
    const keep = end.checkpoint && end.checkpoint.stage === 'dark' ? want : [];
    return {
      reroute: rr?.id, done, cp: end.checkpoint?.stage, restores: end.restores, want, again: again?.restores, keep,
    };
  });
  check('the yard down before Reroute: a reroute held restores the four, and a restart from The Dark keeps them (from Reroute, not)',
    downHeld.some((x) => x.done) && downHeld.every((x) => JSON.stringify(x.restores) === JSON.stringify(x.want)
      && JSON.stringify(x.again) === JSON.stringify(x.keep)),
    JSON.stringify(downHeld));

  /* The negative control: Reroute first, the yard standing, nobody
   * shooting. The twist's Strikers hit the yard inside the hold, which
   * fails, and nothing is restored. */
  const failRoom = warRoom({ ...mission, id: 'itaipu-3-failhold-test', stages: [mission.stages.find((x) => x.id === 'reroute-wires'), mission.stages.find((x) => x.id === 'dark')] },
    { n: 1, seed: 0.3 });
  failRoom.fly(GO + 420000);
  const failViews = failRoom.of(0).map((m) => m.war);
  const failState = failViews.filter((v) => v.stage?.id === 'reroute-wires').at(-1)?.stage.objectives.find((o) => o.id === 'reroute')?.state;
  check('a reroute that fails (the yard hit inside the hold) restores nothing',
    failState === 'failed' && failViews.every((v) => Array.isArray(v.restores) && v.restores.length === 0),
    `hold ${failState}, restores told ${[...new Set(failViews.map((v) => JSON.stringify(v.restores)))].join(' ')}`);
}

console.log('The Long Night (itaipu-4), flown on the room by bot squads');
{
  /* MISSIONS.md M4 as the room plays it, as the Spillway's above. */
  const mission = MISSIONS['itaipu-4'];
  const floorBuf = readFileSync(new URL('../src/share/war/itaipu-height.bin', import.meta.url));
  const TWISTS = ['station-dark', 'towns', 'dark-scout'];
  const TWIST = {
    'station-dark': ['itaipu-4-ta-turn', 'itaipu-4-ta-why'], towns: ['itaipu-4-tb-turn', 'itaipu-4-tb-why'], 'dark-scout': ['itaipu-4-tc-turn', 'itaipu-4-tc-why'],
  };
  check('The Long Night plays 5 rounds of its 7 round stages', roundsOf(mission) === 5 && stagesOf(mission).filter((x) => x.round).length === 7,
    `${roundsOf(mission)}`);
  const games = [];
  for (const pilots of [1, 4]) {
    for (const seed of [1, 2, 3, 4, 5]) {
      const views = [];
      const cues = [];
      const born = [];
      const dead = [];
      const clocks = [];
      runOne({
        pilots,
        skill: 'good',
        seed,
        floorBuf,
        spawn: SPAWN,
        mission,
        record: (m, now) => {
          if (m.type === 'welcome' || m.type === 'daytime') {
            clocks.push(m.daytime ?? null);
          }
          if (m.type !== 'war') {
            return;
          }
          if (m.war) {
            views.push({ ...m.war, now });
          } else if (m.op === 'cue') {
            cues.push(...m.cues);
          } else if (m.op === 'born') {
            born.push(...m.agents);
          } else if (m.op === 'dead') {
            dead.push(m);
          }
        },
      });
      games.push({
        pilots, seed, views, cues, born, clocks, dead,
      });
    }
  }
  const order = [];
  const bad = [];
  const twists = new Set();
  const scouts = { killed: 0, alive: 0 };
  for (const g of games) {
    const label = `x${g.pilots} seed ${g.seed}`;
    const path = [];
    for (const v of g.views) {
      if (v.stage && path.at(-1) !== v.stage.id) {
        path.push(v.stage.id);
      }
    }
    order.push(`${label}: ${path.join(' > ')}`);
    const twist = path[3];
    twists.add(twist);
    const end = g.views.at(-1);
    if (!(path.length === 5 && path[0] === 'quiet' && path[1] === 'dark-water' && path[2] === 'hunters' && TWISTS.includes(twist) && path[4] === 'before-dawn')) {
      bad.push(`${label}: stages ${path.join(',')}`);
    }
    if (end.state !== 'won') {
      bad.push(`${label}: ended ${end.state} ${end.why}`);
    }
    const said = g.cues.filter((c) => c.radio).map((c) => c.radio);
    const want = ['itaipu-4-g-standby', 'itaipu-4-s1-quiet', 'itaipu-4-s1-boat', 'itaipu-4-s2-water', 'itaipu-4-g-intakes', 'itaipu-4-s2-split', 'itaipu-4-s2-high', 'itaipu-4-s3-hunt', 'itaipu-4-s3-pairs',
      'itaipu-4-s3-cover', ...TWIST[twist] ?? [], 'itaipu-4-s5-all', 'itaipu-4-s5-order', 'itaipu-4-g-all', 'itaipu-4-s5-near'];
    const missing = want.filter((id) => !said.includes(id));
    if (missing.length) {
      bad.push(`${label}: never said ${missing.join(',')}`);
    }
    const others = Object.entries(TWIST).filter(([k]) => k !== twist).flatMap(([, x]) => x).filter((id) => said.includes(id));
    if (others.length) {
      bad.push(`${label}: said another twist's ${others.join(',')}`);
    }
    /* The quiet: STAND BY on the HUD and nothing born until the boat, at
     * least 40 s (paced) after the go; then the boat's objective, and
     * STAND BY gone. */
    const quiet = g.views.filter((v) => v.stage && v.stage.id === 'quiet');
    const first = g.born.reduce((a, b) => (a && a.t0 <= b.t0 ? a : b), null);
    const goAt = end.goAt;
    const before = quiet.filter((v) => first && v.now < first.t0 && v.now > goAt + 1000);
    const after = quiet.filter((v) => first && v.now > first.t0 + 500);
    if (!first || first.kind !== 'boat' || first.t0 - goAt < 40000
      || !before.length || !before.every((v) => v.stage.text === 'war.obj.itaipu_4.stand_by' && v.stage.objectives.length === 0)
      || (after.length && !after.every((v) => v.stage.text == null && v.stage.objectives.some((o) => o.id === 'boat')))) {
      bad.push(`${label}: the quiet: first born ${first && first.kind} at ${first && first.t0 - goAt}, before ${before.length}, after ${after.length}`);
    }
    /* The twist's objective on the HUD once the twist is born, not before. */
    const inTwist = g.views.filter((v) => v.stage && v.stage.id === twist);
    const twistSi = stagesOf(mission).find((x) => x.id === twist)?.spawns.find((w) => w.group === 'twist')?.si;
    const twistBorn = g.born.filter((a) => a.wave === twistSi);
    const early = inTwist.filter((v) => twistBorn.length && v.now < twistBorn[0].t0 && v.stage.objectives.some((o) => o.id === 'twist'));
    const shown = inTwist.some((v) => v.stage.objectives.some((o) => o.id === 'twist'));
    if (!twistBorn.length || early.length || !shown) {
      bad.push(`${label}: the twist's objective shown early ${early.length}, ever ${shown}, born ${twistBorn.length && twistBorn[0].t0}`);
    }
    /* The scout's rule (edge/rooms/war.js births): the dawn's attackers
     * fly exactly unless the night's only Scout was killed. */
    const dawnAt = g.views.find((v) => v.stage && v.stage.id === 'before-dawn')?.stage.at ?? Infinity;
    const dawn = g.born.filter((a) => a.t0 >= dawnAt && a.kind !== 'hunter');
    const scoutKilled = twist === 'dark-scout' && twistBorn.some((a) => g.dead.some((d) => d.ids.includes(a.id) && ['boom', 'pierce', 'wire'].includes(d.why)));
    if (twist === 'dark-scout') {
      scouts[scoutKilled ? 'killed' : 'alive'] += 1;
    }
    if (dawn.length && (scoutKilled ? !dawn.some((a) => a.err !== 0) : !dawn.every((a) => a.err === 0))) {
      bad.push(`${label}: the scout ${scoutKilled ? 'killed' : 'not killed'}, the dawn's errors ${dawn.map((a) => a.err).join(',')}`);
    }
  }
  console.log(`    ${order.join('\n    ')}`);
  console.log(`    the twist's scout: killed in ${scouts.killed}, not in ${scouts.alive}`);
  check('ten games, 1 and 4 good pilots: Quiet, Dark Water, Hunters, one twist of The Turn, Before Dawn, and won', bad.filter((x) => /stages|ended/.test(x)).length === 0,
    bad.filter((x) => /stages|ended/.test(x)).join(' | '));
  check('every stage\'s story and guide said: the stand by, the quiet, the boat, the water and its second bearing, the Loiterer, the Hunters and their cover, the twist\'s two lines and no other twist\'s, the convergence, its order and the dawn near',
    bad.filter((x) => /said/.test(x)).length === 0, bad.filter((x) => /said/.test(x)).join(' | '));
  check('the quiet: STAND BY alone on the HUD and nothing born for 40 s or more, then the dark boat and its objective', bad.filter((x) => /quiet/.test(x)).length === 0,
    bad.filter((x) => /quiet/.test(x)).join(' | '));
  check('the twist\'s own objective is on the HUD once the twist is born, not before', bad.filter((x) => /objective shown/.test(x)).length === 0,
    bad.filter((x) => /objective shown/.test(x)).join(' | '));
  check('over the ten games all three twists are met', twists.size === 3, [...twists].join(','));
  const lightOff = games.map((g) => lightTold(mission, g)).filter(Boolean);
  check('the room\'s clock is the mission\'s light: night, the dawn ramp told as Before Dawn opens, and over the end the hour it reached',
    lightOff.length === 0 && games.every((g) => g.clocks.some((c) => c && c.rate > 0 && c.to === TIME_HOUR.morning + 24)), lightOff.join(' | '));
  check('in the bot games too, Before Dawn flies exactly unless the night\'s Scout was killed', bad.filter((x) => /scout/.test(x)).length === 0,
    bad.filter((x) => /scout/.test(x)).join(' | '));
  /* As the Spillway's, the closures' waits apart: Hunters and Before
   * Dawn wait for a closure too ({ contained: true }). */
  const [lo, hi] = mission.estimatedMinutes;
  const waits = games.map((g) => closureWait(g) / 60000);
  const minutes = games.map((g, k) => (g.views.at(-1).endAt - g.views.at(-1).goAt) / 60000 - waits[k]);
  console.log(`    minutes from the go to the end: ${games.map((g) => ((g.views.at(-1).endAt - g.views.at(-1).goAt) / 60000).toFixed(1)).join(' ')}`);
  console.log(`    minutes the closures held a stage: ${waits.map((x) => x.toFixed(1)).join(' ')}`);
  check(`every won game ends ${lo} to ${hi} minutes after the go, the closures' waits apart`, minutes.every((x) => x >= lo && x <= hi),
    minutes.map((x) => x.toFixed(1)).join(' '));

  /* Nobody shooting: the intakes fall stage by stage until the output is
   * under the floor before the end, and the restart offers the stage it
   * was lost in. */
  const rooms = [0.15, 0.3, 0.41].map((seed) => {
    const r = warRoom(mission, { n: 1, seed, dev: true });
    r.fly(GO + 1800000);
    return r;
  });
  const ends = rooms.map((r) => r.view());
  check('with nobody shooting The Long Night is lost, under its floor or its gantry hit while it closed the face (MISSIONS.md 1.9 point 6), and offers the stage it was lost in again',
    ends.every((x) => x.state === 'lost' && (x.why === 'output' || x.why === 'shutdown') && x.checkpoint
      && x.checkpoint.n === stagesOf(mission).findIndex((y) => y.id === x.checkpoint.stage)),
    JSON.stringify(ends.map((x) => ({
      state: x.state, why: x.why, cp: x.checkpoint, stage: x.stage && x.stage.id, output: x.output,
    }))));

  /* The scout's rule on the room, both ways, in twist C: a pilot moved
   * onto the Scout's circle once it is born kills it, and Before Dawn's
   * attackers then draw their errors; left alone, they fly exactly. With
   * no floor and no Contain (whose gantry, hit while it closed the face,
   * would end it first), so a game nobody else defends reaches the dawn. */
  const unfloored = { ...mission, floorMw: 0, contain: undefined };
  const scoutRoom = (kill) => {
    for (const seed of [0.15, 0.3, 0.41, 0.6, 0.8, 0.95]) {
      const r = warRoom(unfloored, { n: 1, seed, dev: true });
      r.paths[0] = () => [-4000, Y, 4000];
      let born = null;
      for (let t = GO; t < GO + 1800000 && !born; t += 5000) {
        r.fly(t);
        const v = r.view();
        if (v.state === 'won' || v.state === 'lost' || (v.stage && v.stage.id === 'towns')) {
          break;
        }
        born = r.of(0, 'born').flatMap((m) => m.agents).find((a) => a.kind === 'scout');
      }
      if (!born) {
        continue;
      }
      if (kill) {
        const meet = poseAt(planAgent(unfloored, born), born.t0 + 30000).p;
        r.paths[0] = () => meet;
      }
      r.fly(r.clock + 900000);
      const dawnAt = r.of(0).map((m) => m.war).find((w) => w.stage && w.stage.id === 'before-dawn')?.stage.at;
      const killed = r.of(0, 'dead').some((m) => m.ids.includes(born.id) && m.why === 'boom');
      const dawn = r.of(0, 'born').flatMap((m) => m.agents).filter((a) => dawnAt != null && a.t0 >= dawnAt && a.kind !== 'hunter');
      return {
        seed, killed, dawn: dawn.length, errs: dawn.filter((a) => a.err !== 0).length,
      };
    }
    return null;
  };
  const left = scoutRoom(false);
  const shot = scoutRoom(true);
  check('twist C, the Scout left alone: Before Dawn\'s attackers fly exactly', left && !left.killed && left.dawn > 0 && left.errs === 0, JSON.stringify(left));
  check('twist C, the Scout killed: Before Dawn\'s attackers draw their errors', shot && shot.killed && shot.dawn > 0 && shot.errs > 0, JSON.stringify(shot));
}

console.log('The River Below (itaipu-5), flown on the room by bot squads');
{
  /* MISSIONS.md M5 as the room plays it, as The Long Night's above. */
  const mission = MISSIONS['itaipu-5'];
  const floorBuf = readFileSync(new URL('../src/share/war/itaipu-height.bin', import.meta.url));
  const TWISTS = ['two-hulls', 'hunters-launched', 'last-bird'];
  const stagesM5 = stagesOf(mission);
  check('The River Below plays 4 rounds of its 6 round stages', roundsOf(mission) === 4 && stagesM5.filter((x) => x.round).length === 6, `${roundsOf(mission)}`);
  check('in development, act 1, order 5: built and held until the owner has flown it', mission.release === 'development' && mission.act === 1 && mission.order === 5
    && !released('itaipu-5') && released('itaipu-5', true));
  const games = [];
  for (const pilots of [1, 4]) {
    for (const seed of [1, 2, 3, 4, 5]) {
      const views = [];
      const cues = [];
      const born = [];
      const dead = [];
      const hurt = [];
      const spots = [];
      const clocks = [];
      runOne({
        pilots,
        skill: 'good',
        seed,
        floorBuf,
        spawn: SPAWN,
        mission,
        record: (m, now) => {
          if (m.type === 'welcome' || m.type === 'daytime') {
            clocks.push(m.daytime ?? null);
          }
          if (m.type !== 'war') {
            return;
          }
          if (m.war) {
            views.push({ ...m.war, now });
          } else if (m.op === 'cue') {
            cues.push(...m.cues);
          } else if (m.op === 'born') {
            born.push(...m.agents);
          } else if (m.op === 'dead') {
            dead.push(m);
          } else if (m.op === 'hurt') {
            hurt.push(m);
          } else if (m.op === 'spot') {
            spots.push(m);
          }
        },
      });
      games.push({
        pilots, seed, views, cues, born, dead, hurt, spots, clocks,
      });
    }
  }
  const order = [];
  const bad = [];
  const spotSeen = [];
  const spotBad = [];
  const guideBad = [];
  const twists = new Set();
  const groupOf = (twist, a) => stagesM5.find((x) => x.id === twist)?.spawns.find((w) => w.si === a.wave)?.group;
  for (const g of games) {
    const label = `x${g.pilots} seed ${g.seed}`;
    const path = [];
    const entries = [];
    for (const v of g.views) {
      if (v.stage && path.at(-1) !== v.stage.id) {
        path.push(v.stage.id);
        entries.push(v.stage);
      }
    }
    order.push(`${label}: ${path.join(' > ')}`);
    const twist = path[2];
    twists.add(twist);
    const end = g.views.at(-1);
    if (!(path.length === 4 && path[0] === 'call' && path[1] === 'gorge' && TWISTS.includes(twist) && path[3] === 'clear')) {
      bad.push(`${label}: stages ${path.join(',')}`);
    }
    if (end.state !== 'won') {
      bad.push(`${label}: ended ${end.state} ${end.why}`);
    }
    /* The source: born on the river, on a RIVER route, its kill on the
     * HUD once it is, not before; a launch's children from its deck. */
    const at3 = entries[2]?.at ?? Infinity;
    const at4 = entries[3]?.at ?? Infinity;
    const hulls = g.born.filter((a) => a.kind === 'carrier');
    const inSource = g.views.filter((v) => v.stage && v.stage.id === twist);
    const early = inSource.filter((v) => hulls.length && v.now < hulls[0].t0 && v.stage.objectives.some((o) => o.id === 'carrier'));
    if (!hulls.length || hulls.some((h) => h.t0 < at3 || h.t0 >= at4 || h.sector !== 'RIVER' || !mission.sectors.RIVER.includes(h.route))
      || early.length || !inSource.some((v) => v.stage.objectives.some((o) => o.id === 'carrier'))) {
      bad.push(`${label}: the source: ${JSON.stringify(hulls.map((h) => [h.route, h.sector, h.t0 - at3]))}, its objective early ${early.length}`);
    }
    const kids = g.born.filter((a) => a.parent != null);
    if (kids.some((a) => !hulls.some((h) => h.id === a.parent) || a.t0 >= at4)) {
      bad.push(`${label}: the source: a child of no carrier, or born after its stage`);
    }
    /* Each twist as M5 has it. */
    const launched = new Set(kids.map((a) => a.parent));
    if (twist === 'two-hulls') {
      const groups = hulls.map((h) => groupOf(twist, h));
      if (hulls.length !== 2 || groups.join() !== 'carrier,carrier-2' || launched.size > 1) {
        bad.push(`${label}: two hulls: ${hulls.length} born (${groups}), ${launched.size} launching`);
      }
    } else {
      const want = waveSize(twist === 'last-bird' ? { n: 6, per: 2 } : { n: 3, per: 1 }, g.pilots);
      const swarms = new Map();
      for (const a of kids.filter((x) => x.kind === 'fpv')) {
        swarms.set(a.t0, (swarms.get(a.t0) ?? 0) + 1);
      }
      if (hulls.length !== 1 || [...swarms.values()].some((n) => n !== want)) {
        bad.push(`${label}: ${twist}: ${hulls.length} hulls, swarms of ${[...swarms.values()].join(',')}, want ${want}`);
      }
      /* Twist B: Hunters only once every one of its first launch was
       * killed; never in the others. */
      const first = kids.filter((a) => a.t0 === Math.min(...kids.map((x) => x.t0)));
      const killed = (a) => g.dead.some((m) => m.ids.includes(a.id) && ['boom', 'pierce', 'wire'].includes(m.why));
      const hunters = kids.filter((a) => a.kind === 'hunter');
      if ((twist === 'hunters-launched' && hunters.length && !first.every(killed)) || (twist !== 'hunters-launched' && hunters.length)) {
        bad.push(`${label}: ${twist}: ${hunters.length} Hunters launched, its first swarm killed ${first.every(killed)}`);
      }
    }
    /* The story (MISSIONS.md M5 Radio): every stage's line, the twist's
     * own and no other twist's; the source's when it launches (two hulls:
     * once one does) and its kill's when every hull of it is down. */
    const said = g.cues.filter((c) => c.radio).map((c) => c.radio);
    const TWIST_LINES = { 'two-hulls': 'itaipu-5-ta-turn', 'hunters-launched': 'itaipu-5-tb-turn', 'last-bird': 'itaipu-5-tc-turn' };
    const allKilled = hulls.length && hulls.every((h) => g.dead.some((m) => m.ids.includes(h.id) && ['boom', 'pierce'].includes(m.why)));
    const want = ['itaipu-5-s1-swarm', 'itaipu-5-s2-pattern', 'itaipu-5-s4-last',
      ...(twist === 'two-hulls' ? ['itaipu-5-ta-turn', ...(kids.length ? ['itaipu-5-s3-carrier'] : [])] : ['itaipu-5-s3-carrier']),
      ...(twist === 'last-bird' ? ['itaipu-5-tc-turn'] : []),
      ...(twist === 'hunters-launched' && kids.some((a) => a.kind === 'hunter') ? ['itaipu-5-tb-turn'] : []),
      ...(allKilled ? ['itaipu-5-s3-dead'] : [])];
    const missing = want.filter((id) => !said.includes(id));
    const others = Object.entries(TWIST_LINES).filter(([k]) => k !== twist).map(([, id]) => id).filter((id) => said.includes(id));
    if (missing.length || others.length) {
      bad.push(`${label}: never said ${missing.join(',')}; said another twist's ${others.join(',')}`);
    }
    /* CREST's guide (MISSIONS.md M5 Guide): the source's and the last
     * stage's in every game, each twist's own never in another's. */
    const GUIDE_TWIST = { 'two-hulls': 'itaipu-5-g-hulls', 'hunters-launched': 'itaipu-5-g-deck', 'last-bird': 'itaipu-5-g-escort' };
    const noGuide = ['itaipu-5-g-source', 'itaipu-5-g-all'].filter((id) => !said.includes(id));
    const otherGuide = Object.entries(GUIDE_TWIST).filter(([k]) => k !== twist).map(([, id]) => id).filter((id) => said.includes(id));
    if (noGuide.length || otherGuide.length) {
      guideBad.push(`${label}: guide: never said ${noGuide.join(',')}; said another twist's ${otherGuide.join(',')}`);
    }
    /* Spotting: only a carrier; twist C's at its birth by nobody, the
     * others' by a pilot here; a hull spotted silent never launched, and
     * at most one is; MIRADOR's call on it in twist A only, and in it
     * whenever the silent one was spotted with the second hull out and
     * a hull still to kill. */
    const hullIds = new Set(hulls.map((h) => h.id));
    const silentSpots = g.spots.filter((m) => m.silent[0]);
    const carrier2 = hulls.find((h) => groupOf(twist, h) === 'carrier-2');
    const firstDown = Math.max(...hulls.map((h) => g.dead.find((m) => m.ids.includes(h.id))?.at ?? Infinity));
    const callDue = twist === 'two-hulls' && silentSpots.length && carrier2 && Math.max(silentSpots[0].at, carrier2.t0) + 1000 < firstDown;
    if (g.spots.some((m) => m.ids.length !== 1 || !hullIds.has(m.ids[0]))
      || (twist === 'last-bird' && !(g.spots.length === 1 && g.spots[0].by === 0 && g.spots[0].at === hulls[0].t0 && !g.spots[0].silent[0]))
      || (twist !== 'last-bird' && g.spots.some((m) => !(m.by > 0)))
      || silentSpots.length > 1 || silentSpots.some((m) => launched.has(m.ids[0])) || (twist !== 'two-hulls' && silentSpots.length)
      || (callDue && !said.includes('itaipu-5-ta-spot')) || (twist !== 'two-hulls' && said.includes('itaipu-5-ta-spot'))) {
      spotBad.push(`${label}: spotting: ${JSON.stringify(g.spots.map((m) => [m.ids[0], m.at, m.by, m.silent[0]]))}, said ta-spot ${said.includes('itaipu-5-ta-spot')}, due ${Boolean(callDue)}`);
    }
    if (twist === 'two-hulls') {
      spotSeen.push(`${label}: ${g.spots.map((m) => `${m.silent[0] ? 'silent' : 'launching'} by ${m.by}`).join(', ') || 'none'}`);
    }
    /* Two detonations each: a carrier killed by a boom was hurt first. */
    for (const h of hulls) {
      const d = g.dead.find((m) => m.ids.includes(h.id));
      if (d && d.why === 'boom' && !g.hurt.some((m) => m.ids.includes(h.id) && m.at < d.at)) {
        bad.push(`${label}: carrier ${h.id} killed by one boom`);
      }
    }
  }
  console.log(`    ${order.join('\n    ')}`);
  check('ten games, 1 and 4 good pilots: Carancho\'s Call, Up the Gorge, one twist of The Source, Clear the River, and won', bad.filter((x) => /stages|ended/.test(x)).length === 0,
    bad.filter((x) => /stages|ended/.test(x)).join(' | '));
  check('the source: a carrier on a RIVER route, born in its stage, its kill on the HUD once it is born and not before, its children its own and its stage\'s',
    bad.filter((x) => /source/.test(x)).length === 0, bad.filter((x) => /source/.test(x)).join(' | '));
  check('the twists as M5: two hulls, at most one of them launching; Hunters only once its first swarm is killed; Carancho\'s last bird, every swarm twice the size',
    bad.filter((x) => /two hulls|hunters-launched|last-bird/.test(x)).length === 0, bad.filter((x) => /two hulls|hunters-launched|last-bird/.test(x)).join(' | '));
  check('a carrier killed by warheads took two', bad.filter((x) => /one boom/.test(x)).length === 0, bad.filter((x) => /one boom/.test(x)).join(' | '));
  console.log(`    two hulls spotted: ${spotSeen.join('; ') || 'no two-hulls game'}`);
  check('spotting: only carriers; twist C\'s marked at its birth by Carancho, the others by a pilot; a hull spotted silent never launches; MIRADOR says so in twist A only',
    spotBad.length === 0, spotBad.join(' | '));
  check('the guide said: the source\'s and the last stage\'s every game, each twist\'s own and no other\'s',
    guideBad.length === 0, guideBad.join(' | '));
  check('every stage\'s story said: the swarm, the pattern, the source and its kill, the twist\'s own line and no other twist\'s, the last stage\'s',
    bad.filter((x) => /said/.test(x)).length === 0, bad.filter((x) => /said/.test(x)).join(' | '));
  check('over the ten games all three twists are met', twists.size === 3, [...twists].join(','));
  const lightOff = games.map((g) => lightTold(mission, g)).filter(Boolean);
  check('the room\'s clock is the mission\'s light, day', lightOff.length === 0, lightOff.join(' | '));
  const [lo, hi] = mission.estimatedMinutes;
  const waits = games.map((g) => closureWait(g) / 60000);
  const minutes = games.map((g, k) => (g.views.at(-1).endAt - g.views.at(-1).goAt) / 60000 - waits[k]);
  console.log(`    minutes from the go to the end: ${games.map((g) => ((g.views.at(-1).endAt - g.views.at(-1).goAt) / 60000).toFixed(2)).join(' ')}`);
  console.log(`    minutes the closures held a stage: ${waits.map((x) => x.toFixed(1)).join(' ')}`);
  check(`every won game ends ${lo} to ${hi} minutes after the go, the closures' waits apart`, minutes.every((x) => x >= lo && x <= hi),
    minutes.map((x) => x.toFixed(2)).join(' '));

  /* Nobody shooting: the penstocks fall until the output is under the
   * floor, and the restart offers the stage it was lost in. */
  const rooms = [0.15, 0.3, 0.41].map((seed) => {
    const r = warRoom(mission, { n: 1, seed, dev: true });
    r.fly(GO + 1800000);
    return r;
  });
  const ends = rooms.map((r) => r.view());
  check('with nobody shooting The River Below is lost, under its floor or its gantry hit while it closed the face, and offers the stage it was lost in again',
    ends.every((x) => x.state === 'lost' && (x.why === 'output' || x.why === 'shutdown') && x.checkpoint
      && x.checkpoint.n === stagesOf(mission).findIndex((y) => y.id === x.checkpoint.stage)),
    JSON.stringify(ends.map((x) => ({
      state: x.state, why: x.why, cp: x.checkpoint, stage: x.stage && x.stage.id, output: x.output,
    }))));
}

console.log('The Long Night\'s twist A, Station dark, on the room');
{
  /* Twist A (itaipu-4.js STATION_DARK) flown as the first stage of a
   * mission of two (it, then Before Dawn), against twist B the same way:
   * hovering pilots, the same seed. */
  const M4 = MISSIONS['itaipu-4'];
  const of = (id) => M4.stages.find((x) => x.id === id);
  const pair = (id) => ({ ...M4, id: `itaipu-4-${id}-test`, stages: [of(id), of('before-dawn')] });
  const flown = ['station-dark', 'towns'].map((id) => {
    const mission = pair(id);
    const e = warRoom(mission, { n: 2, seed: 0.35 });
    e.fly(GO + 420000);
    const views = e.of(0).map((m) => m.war);
    const first = views.find((v) => v.stage && v.stage.n === 0)?.stage;
    const second = views.find((v) => v.stage && v.stage.n === 1)?.stage;
    const firstSpawns = stagesOf(mission)[0].spawns.map((w) => w.si);
    const born = e.of(0, 'born').flatMap((m) => m.agents);
    return {
      id,
      first,
      second,
      dark: views.filter((v) => v.stage).map((v) => v.stationDark),
      inFirst: born.filter((a) => firstSpawns.includes(a.wave)),
      inSecond: born.filter((a) => !firstSpawns.includes(a.wave)),
    };
  });
  const [a, b] = flown;
  check('twist A: every attacker of its stage draws its error, no scout dead; twist B\'s fly exact on the same seed',
    a.inFirst.length > 0 && a.inFirst.every((x) => x.err !== 0) && b.inFirst.length > 0 && b.inFirst.every((x) => x.err === 0),
    `A ${a.inFirst.map((x) => x.err).join(',')}; B ${b.inFirst.map((x) => x.err).join(',')}`);
  check('and the stage after it flies exact again: the order is its stage\'s',
    a.second && a.inSecond.length > 0 && a.inSecond.every((x) => x.err === 0), `${a.second?.id}: ${a.inSecond.map((x) => x.err).join(',')}`);
  /* The lights switch (stationdark.js), as src/main.js hands the grid's
   * levels to the map: at the view's stationDark. */
  const at = a.first?.at ?? 0;
  const lit = () => new Float32Array(DISTRICTS.length).fill(1);
  const before = stationOrder(lit(), at, at - 1);
  const flick = Array.from({ length: Math.round(FLICKER_MS / 50) }, (_, k) => stationOrder(lit(), at, at + 50 * k));
  const after = stationOrder(lit(), at, at + FLICKER_MS);
  const none = stationOrder(lit(), null, at + FLICKER_MS);
  const dam = STATION_DARK_DISTRICTS.map((i) => DISTRICTS[i].id);
  check(`the switch: the dam's own districts (${dam.join(', ')}) lit before the order, flicker, then dark; the switchyards and towns lit; no order, no change`,
    dam.length === 8 && !dam.some((id) => /yard$/.test(id))
    && before.every((x) => x === 1) && STATION_DARK_DISTRICTS.every((i) => after[i] === 0)
    && STATION_DARK_DISTRICTS.every((i) => flick.some((l) => l[i] > 0) && flick.some((l) => l[i] === 0))
    && DISTRICTS.every((d, i) => STATION_DARK_DISTRICTS.includes(i) || after[i] === 1) && none.every((x) => x === 1));
  check('the view says the station went dark at twist A\'s start, and still does after it; twist B\'s says nothing',
    a.first && a.dark.length > 0 && a.dark.every((x) => x === a.first.at) && b.dark.length > 0 && b.dark.every((x) => x === null),
    `A ${[...new Set(a.dark)].join(',')} (stage at ${a.first?.at}); B ${[...new Set(b.dark)].join(',')}`);
}

console.log('the room: the practice (itaipu-practice), one Striker at a time');
{
  /* Training's Defence track flies it alone (docs/redesign/TRAINING.md
   * track 5): one Striker with no target, caught or let go, then the next,
   * and never a result. */
  const mission = MISSIONS[PRACTICE_ID];
  check('the practice is a mission any room may start, in no campaign act', Boolean(mission) && mission.act == null && released(PRACTICE_ID));
  const e = warRoom(mission, { n: 1 });
  e.fly(GO + 8000);
  const first = e.of(0, 'born').flatMap((m) => m.agents);
  check('one Striker is born 5 s after the go, with no target', first.length === 1 && first[0].kind === 'strike' && first[0].target == null && first[0].t0 === GO + 5000,
    JSON.stringify(first));
  const meet = poseAt(planAgent(mission, first[0]), first[0].t0 + 20000).p;
  e.paths[0] = () => meet;
  e.fly(GO + 30000);
  const boom = e.of(0, 'dead').find((m) => m.why === 'boom');
  check('caught: the room credits its kill to the pilot', boom && boom.by === e.view().scores[0].seat && Array.isArray(boom.credited) && boom.credited.includes(first[0].id),
    JSON.stringify(boom));
  e.paths[0] = () => [4000, Y, 4000];
  e.fly(boom.at + 4000 + 8000);
  const born = e.of(0, 'born').flatMap((m) => m.agents);
  const v = e.view();
  check('the stage goes again after its beat: a second Striker, no result, the output whole', born.length === 2 && born[1].t0 === boom.at + 4000 + 5000
    && v.state === 'live' && v.stage.id === 'pass' && v.result == null && v.output === mission.output, `${born.map((a) => a.t0)} ${v.state} ${v.output}`);
  const plan = planAgent(mission, born[1]);
  e.fly(plan.tEnd + 1000);
  const gone = e.of(0, 'dead').find((m) => m.ids.includes(born[1].id));
  check('let go: it leaves at its route\'s end, harmless, and a third comes', gone && gone.why === 'leave' && e.view().output === mission.output
    && (e.fly(plan.tEnd + 12000), e.of(0, 'born').flatMap((m) => m.agents).length === 3), JSON.stringify(gone));
  e.say(0, { type: 'war', op: 'end' });
  e.fly(e.clock + 100);
  const end = e.view();
  check('ended by the host: no win, no stars', end.state === 'ended' && end.result && end.result.won === false && end.result.stars === 0, JSON.stringify(end.result));
}

console.log('hit points: a carrier takes two detonations, a penetrator\'s one (TECH-NEEDS T1.7)');
{
  /* One carrier on a short stretch of the river, parked from about 16 s;
   * pilot 0 then pilot 1 sit on it, each going off once (a defender that
   * went off is armed again only after a crash or a spawn, war.js). */
  const base = MISSIONS['itaipu-1'];
  const mission = {
    ...base,
    id: 'itaipu-hp-test',
    contain: undefined,
    sectors: {},
    stages: [{
      id: 'hull',
      round: true,
      spawns: [{
        at: 1, kind: 'carrier', n: 1, per: 0, route: 'river-test', group: 'carrier',
      }],
      objectives: [],
      cues: [],
      exits: [{
        when: { cleared: true }, to: 'won', after: 0, result: 'auto', clear: 'leave', why: 'waves',
      }],
    }],
    routes: { 'river-test': [[-800, 103.5, 300], [-850, 103.5, 190]] },
  };
  const play = (loadouts) => {
    const e = warRoom(mission, { n: 2, seed: 0.4, loadouts });
    const far = (i) => () => [4000 + 50 * i, Y, 4000];
    e.paths[0] = far(0);
    e.paths[1] = far(1);
    e.fly(GO + 4000);
    const born = e.of(0, 'born').flatMap((m) => m.agents);
    const hull = born.find((a) => a.kind === 'carrier');
    const plan = planAgent(mission, hull);
    const at = (t) => poseAt(plan, t).p;
    const on = at(hull.t0 + 30000);
    e.paths[0] = () => [on[0], on[1] + 2, on[2]];
    e.fly(hull.t0 + 34000);
    const first = { hurt: e.of(0, 'hurt'), dead: e.of(0, 'dead'), live: e.view().state };
    e.paths[0] = far(0);
    e.paths[1] = () => [on[0], on[1] + 2, on[2]];
    e.fly(hull.t0 + 40000);
    return {
      hull, plan, first, hurt: e.of(0, 'hurt'), dead: e.of(0, 'dead'), booms: e.of(0, 'boom'), view: e.view(), scores: e.view().scores,
    };
  };
  const g = play({});
  check('a carrier parks at its route\'s end, where its weave left it, for good', g.hull && g.plan.end === 'park' && g.plan.tEnd === Infinity,
    JSON.stringify(g.hull));
  check('the first detonation on it hurts and does not kill: op hurt with 1 hp left, no death, the stage still on', g.first.hurt.length === 1
    && g.first.hurt[0].ids[0] === g.hull.id && g.first.hurt[0].hp[0] === 1 && g.first.dead.length === 0 && g.first.live === 'live',
  JSON.stringify(g.first));
  const kill = g.dead.find((m) => m.ids.includes(g.hull.id));
  const killer = kill && g.scores.find((x) => x.seat === kill.by);
  const other = kill && g.scores.find((x) => x.seat !== kill.by);
  check('the second kills it, credited to the second pilot alone, and the stage clears', g.booms.length === 2 && g.hurt.length === 1 && kill && kill.why === 'boom'
    && kill.credited.includes(g.hull.id) && killer.kills === 1 && other.kills === 0 && g.view.state === 'won', JSON.stringify({ kill, scores: g.scores, state: g.view.state }));
  const p = play({ 0: { warhead: 'penetrator' } });
  const pierced = p.first.dead.find((m) => m.ids.includes(p.hull.id));
  check('a penetrator\'s hit takes all of it at once: dead by pierce, no hurt', p.first.hurt.length === 0 && pierced && pierced.why === 'pierce', JSON.stringify(p.first));
  /* A screen's side (src/share/roomwar.js): the room's hurt heard by a
   * client, which plans from its own build's mission, so the stage flies
   * The River Below's own river route under its id. */
  const asReal = {
    ...MISSIONS['itaipu-5'],
    contain: undefined,
    stages: [{ ...mission.stages[0], spawns: [{ ...mission.stages[0].spawns[0], route: 'river-surface' }] }],
  };
  const e = warRoom(asReal, { n: 2, seed: 0.4, dev: true });
  e.paths[0] = () => [4000, Y, 4000];
  e.paths[1] = () => [4050, Y, 4000];
  e.fly(GO + 4000);
  const hull = e.of(0, 'born').flatMap((m) => m.agents).find((a) => a.kind === 'carrier');
  /* Where it parks, 137 s on (itaipu-5.js river-surface). */
  const on = poseAt(planAgent(asReal, hull), hull.t0 + 140000).p;
  e.paths[0] = (t) => (t >= hull.t0 + 140000 ? [on[0], on[1] + 2, on[2]] : [4000, Y, 4000]);
  e.fly(hull.t0 + 148000);
  const client = createRoomWar(() => {});
  for (const m of e.socks[1].got) {
    if (m && m.type === 'welcome') {
      client.onWelcome(m);
    } else if (m && m.type === 'war') {
      client.onMessage(m);
    }
  }
  const heard = client.takeEvents().filter((x) => x.type === 'hurt');
  const said = e.of(1, 'hurt')[0];
  check('a screen hears the hurt: the carrier, where the room had it, with 1 hp left, and it still draws it',
    heard.length === 1 && said && heard[0].agents.length === 1 && heard[0].agents[0].id === hull.id && heard[0].agents[0].kind === 'carrier' && heard[0].agents[0].hp === 1
    && Math.hypot(...heard[0].agents[0].p.map((v, i) => v - said.p[i])) < 8 && client.attackersAt(said.at + 100).some((a) => a.id === hull.id),
    JSON.stringify({ heard, said }));
  /* And draws it hurt (its burn, src/main.js): attackersAt carries the hp
   * left, so long as it lives. */
  const drawn = said ? client.attackersAt(said.at + 100).find((a) => a.id === hull.id) : null;
  check('a screen that heard the hurt draws the carrier with 1 hp left, and the room\'s view says so',
    drawn && drawn.hp === 1 && e.view().hurt[hull.id] === 1, JSON.stringify({ drawn, hurt: e.view().hurt }));
  /* A pilot who joins after it: the welcome's view carries the hurt
   * before the births it applies to, and the late screen draws the same
   * hp as the one that saw the boom. */
  e.paths[0] = () => [4000, Y, 4000];
  e.join(2);
  e.fly(e.clock + 200);
  const late = createRoomWar(() => {});
  for (const m of e.socks[2].got) {
    if (m && m.type === 'welcome') {
      late.onWelcome(m);
    } else if (m && m.type === 'war') {
      late.onMessage(m);
    }
  }
  const lateHull = late.attackersAt(e.clock).find((a) => a.id === hull.id);
  check('a pilot who joins after the hurt draws the carrier with 1 hp left, as the screen that saw it',
    lateHull && lateHull.hp === 1 && late.takeEvents().every((x) => x.type !== 'hurt'), JSON.stringify(lateHull));
}

console.log('launches: a carrier\'s children, born at its pose while it lives (TECH-NEEDS T1.6)');
{
  const base = MISSIONS['itaipu-1'];
  const PEN = ['penstock-8', 'penstock-9'];
  const stage = (spawns, more = {}) => ({
    id: 'hull',
    round: true,
    spawns,
    objectives: [],
    cues: [],
    exits: [{
      when: { cleared: true }, to: 'won', after: 0, result: 'auto', clear: 'leave', why: 'waves',
    }],
    ...more,
  });
  const LAUNCH = {
    kind: 'fpv', n: 1, per: 0, route: 'launch-test', target: PEN, spread: 10, group: 'launched', every: [20, 20],
  };
  const test = (spawns, more) => ({
    ...base,
    id: 'itaipu-launch-test',
    contain: undefined,
    sectors: {},
    stages: [stage(spawns, more)],
    routes: {
      ...base.routes,
      'river-test': [[-800, 103.5, 300], [-850, 103.5, 190]],
      'launch-test': [[-700, 180, -200], [-400, 180, -800], [-150, 180, -1100], [0, 185, -1350]],
    },
  });
  const far = (i) => () => [4000 + 50 * i, Y, 4000];
  /* A game: pilots far off, `act(e, hull)` once the carrier is born. */
  const play = (mission, act, until = 130000, dev = false) => {
    const e = warRoom(mission, { n: 2, seed: 0.4, dev });
    e.paths[0] = far(0);
    e.paths[1] = far(1);
    e.fly(GO + 4000);
    const hull = e.of(0, 'born').flatMap((m) => m.agents).find((a) => a.kind === 'carrier');
    act(e, hull);
    e.fly(hull.t0 + until);
    const born = e.of(0, 'born').flatMap((m) => m.agents);
    return { e, hull, kids: born.filter((a) => a.parent === hull.id) };
  };
  const one = test([{
    at: 1, kind: 'carrier', n: 1, per: 0, route: 'river-test', group: 'carrier', launch: LAUNCH,
  }]);
  const g = play(one, () => {}, 70000);
  const plan = planAgent(one, g.hull);
  const deckOk = g.kids.every((a) => {
    const p = poseAt(plan, a.t0).p;
    return Math.abs(a.from[0] - p[0]) < 0.001 && Math.abs(a.from[1] - p[1] - 2) < 0.001 && Math.abs(a.from[2] - p[2]) < 0.001;
  });
  check('left alone it launches every 20 s from its birth, each child from its deck at its pose then, on the launch\'s route to its target',
    g.kids.length === 3 && g.kids.every((a, k) => a.t0 === g.hull.t0 + 20000 * (k + 1) && a.kind === 'fpv' && a.route === 'launch-test' && PEN.includes(a.target) && a.group === 'launched')
    && deckOk, JSON.stringify(g.kids.map((a) => [a.t0 - g.hull.t0, a.from, a.target])));
  const kid = g.kids[0];
  const kp = planAgent(one, kid);
  check('a child\'s flight starts at its birth\'s from and runs the launch route to its aim point',
    poseAt(kp, kid.t0).p.every((v, i) => Math.abs(v - kid.from[i]) < 1e-6) && kp.end === 'arrive', JSON.stringify(poseAt(kp, kid.t0).p));
  /* Killed at 30 s: the 20 s launch came, the 40 s one never does. */
  const k = play(one, (e, hull) => {
    const on = poseAt(planAgent(one, hull), hull.t0 + 30000).p;
    e.paths[0] = (t) => (t >= hull.t0 + 26000 ? [on[0], on[1] + 2, on[2]] : far(0)());
    e.paths[1] = (t) => (t >= hull.t0 + 28000 ? [on[0], on[1] + 2, on[2]] : far(1)());
  }, 70000);
  const died = k.e.of(0, 'dead').find((m) => m.ids.includes(k.hull.id));
  check('killed, it launches no more: the launch before its death came, none after', died && k.kids.length >= 1 && k.kids.every((a) => a.t0 < died.at),
    JSON.stringify({ died: died && died.at - k.hull.t0, kids: k.kids.map((a) => a.t0 - k.hull.t0) }));
  /* Twist B's then: Hunters once its first launch is all killed. */
  const then = test([{
    at: 1, kind: 'carrier', n: 1, per: 0, route: 'river-test', group: 'carrier', launch: { ...LAUNCH, then: { kind: 'hunter', n: 1, per: 0, route: 'gorge-hunt', group: 'launched-hunters' } },
  }]);
  const kill = play(then, (e, hull) => {
    const first = planAgent(then, {
      kind: 'fpv', route: 'launch-test', from: (() => {
        const p = poseAt(planAgent(then, hull), hull.t0 + 20000).p;
        return [mm3(p[0]), mm3(p[1] + 2), mm3(p[2])];
      })(), t0: hull.t0 + 20000, k: 0, n: 1, err: 0, target: PEN[0],
    });
    const at = poseAt(first, hull.t0 + 30000).p;
    e.paths[1] = (t) => (t >= hull.t0 + 25000 ? at : far(1)());
  }, 50000);
  const left = play(then, () => {}, 50000);
  check('with `then`: its first launch killed, the next is Hunters; its first launch let go, the next is the same swarm',
    kill.kids.length === 2 && kill.kids[1].kind === 'hunter' && kill.kids[1].group === 'launched-hunters' && left.kids.length === 2 && left.kids[1].kind === 'fpv',
    JSON.stringify({ kill: kill.kids.map((a) => a.kind), left: left.kids.map((a) => a.kind) }));
  /* Twist A's silent: two hulls, one group of them launches nothing, the
   * seed's draw. */
  const two = test([
    {
      at: 1, kind: 'carrier', n: 1, per: 0, route: 'river-test', group: 'hull-a', launch: LAUNCH,
    },
    {
      at: 1, kind: 'carrier', n: 1, per: 0, route: 'river-test', az: [0.3, 0.3], group: 'hull-b', launch: LAUNCH,
    },
  ], { silent: ['hull-a', 'hull-b'] });
  const quiet = new Set();
  for (const seed of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    const e = warRoom(two, { n: 1, seed });
    e.fly(GO + 50000);
    const born = e.of(0, 'born').flatMap((m) => m.agents);
    const hulls = born.filter((a) => a.kind === 'carrier');
    const launching = new Set(born.filter((a) => a.parent != null).map((a) => a.parent));
    if (hulls.length === 2 && launching.size === 1) {
      quiet.add(hulls.find((h) => !launching.has(h.id)).wave);
    }
  }
  check('two hulls with silent: in every game one launches and one does not, and over five seeds each is the quiet one', quiet.size === 2, [...quiet].join(','));
  /* Spotting (war.js spot): the two hulls spottable, a cue on the silent
   * one's spot. Pilot 0 300 m over where they park for a second (too
   * short), away, then back for three: both spotted SPOT_MS after it came
   * back, by its seat, the silent one said so, and the cue at its spot. */
  /* Under The River Below's own id and routes, so a screen (which plans
   * from its own build's mission) can draw them. */
  const spotted = {
    ...MISSIONS['itaipu-5'],
    contain: undefined,
    sectors: {},
    stages: [stage([
      { ...two.stages[0].spawns[0], route: 'river-surface', launch: { ...LAUNCH, route: 'river-launch' }, spot: true },
      { ...two.stages[0].spawns[1], route: 'river-west-bank', az: undefined, launch: { ...LAUNCH, route: 'river-launch' }, spot: true },
    ], { silent: ['hull-a', 'hull-b'], cues: [{ when: { spot: { silent: true } }, radio: 'spot-test' }] })],
  };
  const sp = play(spotted, (e, hull) => {
    const hb = e.of(0, 'born').flatMap((m) => m.agents).filter((a) => a.kind === 'carrier');
    const ps = hb.map((h) => poseAt(planAgent(spotted, h), hull.t0 + 25000).p);
    const over = [0, 1, 2].map((i) => ps.reduce((sum, q) => sum + q[i], 0) / ps.length);
    over[1] += 300;
    e.paths[0] = (t) => ((t >= hull.t0 + 20000 && t < hull.t0 + 21000) || (t >= hull.t0 + 25000 && t < hull.t0 + 28000) ? over : far(0)());
  }, 50000, true);
  const spBorn = sp.e.of(0, 'born').flatMap((m) => m.agents);
  const spHulls = spBorn.filter((a) => a.kind === 'carrier');
  const spLaunching = new Set(spBorn.filter((a) => a.parent != null).map((a) => a.parent));
  const spOps = sp.e.of(0, 'spot');
  const seat0 = sp.e.view().scores.find((x) => x.seat !== sp.e.view().scores[1]?.seat)?.seat;
  const spCue = sp.e.of(0, 'cue').flatMap((m) => m.cues).find((c) => c.radio === 'spot-test');
  const silentOp = spOps.find((m) => m.silent[0]);
  check('spotting: near for less than SPOT_MS spots nothing; back for longer, both hulls spotted SPOT_MS after it came back, by its seat',
    spOps.length === 2 && spOps.every((m) => m.ids.length === 1 && m.at >= sp.hull.t0 + 25000 + 1500 && m.at <= sp.hull.t0 + 25000 + 1500 + 100 && m.by > 0)
    && spHulls.every((h) => spOps.some((m) => m.ids[0] === h.id)), JSON.stringify({ ops: spOps.map((m) => [m.ids[0], m.at - sp.hull.t0, m.by, m.silent[0]]), seat0 }));
  check('spotting: the hull that launches nothing is spotted silent, the other not, and the cue on the silent one\'s spot comes at it',
    spLaunching.size === 1 && silentOp && !spLaunching.has(silentOp.ids[0]) && spOps.filter((m) => m.silent[0]).length === 1
    && spCue && spCue.at === silentOp.at && sp.e.view().spotted[silentOp.ids[0]] === 'silent',
    JSON.stringify({ launching: [...spLaunching], silent: silentOp && silentOp.ids, cue: spCue, view: sp.e.view().spotted }));
  /* A screen draws what was spotted; one that joins after, the same. */
  const screenOf = (i) => {
    const c = createRoomWar(() => {});
    for (const m of sp.e.socks[i].got) {
      if (m && m.type === 'welcome') {
        c.onWelcome(m);
      } else if (m && m.type === 'war') {
        c.onMessage(m);
      }
    }
    return c.attackersAt(sp.e.clock).filter((x) => x.kind === 'carrier').map((x) => `${x.id}:${x.spotted}`).join(',');
  };
  sp.e.join(2);
  sp.e.fly(sp.e.clock + 200);
  check('spotting: a screen marks each hull for what was spotted, and a pilot who joins after marks the same',
    screenOf(1) === spHulls.map((h) => `${h.id}:${h.id === silentOp?.ids[0] ? 'silent' : 'launching'}`).join(',') && screenOf(2) === screenOf(1), `${screenOf(1)} | ${screenOf(2)}`);
  /* `spot: 'birth'`: spotted as it is born, by nobody here. */
  const atBirth = test([{ ...one.stages[0].spawns[0], spot: 'birth' }]);
  const ab = play(atBirth, () => {}, 5000);
  const abOps = ab.e.of(0, 'spot');
  check('spot \'birth\': spotted as it is born, by 0, not silent, the op after its birth',
    abOps.length === 1 && abOps[0].ids[0] === ab.hull.id && abOps[0].at === ab.hull.t0 && abOps[0].by === 0 && abOps[0].silent[0] === false
    && ab.e.socks[0].got.findIndex((m) => m && m.op === 'spot') > ab.e.socks[0].got.findIndex((m) => m && m.op === 'born'), JSON.stringify(abOps));
  /* A store and a restore after a launch and a hurt change nothing after
   * it: the match keeps each carrier's next launch and its hits. */
  const mid = (e, hull) => {
    const on = poseAt(planAgent(then, hull), hull.t0 + 30000).p;
    e.paths[0] = (t) => (t >= hull.t0 + 26000 && t < hull.t0 + 40000 ? [on[0], on[1] + 2, on[2]] : far(0)());
  };
  const a = play(then, mid, 90000);
  const r = play(then, (e, hull) => {
    mid(e, hull);
    e.fly(hull.t0 + 45000);
    e.r.war.restore(JSON.parse(JSON.stringify(e.stored)));
  }, 90000);
  check('a store and a restore after a launch and a hurt change nothing after it', a.e.of(0, 'hurt').length === 1 && a.kids.length >= 3
    && JSON.stringify(told(a.e)) === JSON.stringify(told(r.e)), `${told(a.e).length} vs ${told(r.e).length}, hurt ${a.e.of(0, 'hurt').length}, kids ${a.kids.length}`);
}

console.log('The Corridor\'s mechanics: lanes, a line\'s towers, wire height, spotting any attacker, islanding (MISSIONS.md M6)');
{
  const base = MISSIONS['itaipu-1'];
  const stage = (spawns, more = {}) => ({
    id: 'corridor',
    round: true,
    spawns,
    objectives: [],
    cues: [],
    exits: [{
      when: { cleared: true }, to: 'won', after: 0, result: 'auto', clear: 'leave', why: 'waves',
    }],
    ...more,
  });
  const test = (spawns, more, routes = {}) => ({
    ...base,
    id: 'itaipu-corridor-test',
    contain: undefined,
    sectors: {},
    stages: [stage(spawns, more)],
    routes: { ...base.routes, ...routes },
  });
  /* Lanes (MISSIONS.md 1.6, sectors at once): four groups, one a lane. */
  check('sectors at once: 1 for 1 pilot, 2 for 2 or 3, 3 for 4 to 6, 4 for 7 or 8',
    [1, 2, 3, 4, 5, 6, 7, 8].map(sectorsAt).join() === '1,2,2,3,3,3,4,4');
  const LANES = [0, 1, 2, 3].map((k) => ({
    at: [4 + k, 4 + k], kind: 'strike', n: 1, per: 0, route: 'reservoir-mid', target: `intake-${k + 2}`, spread: 0, group: `lane-${k}`, lane: k,
  }));
  const laned = test(LANES);
  const lanesOk = [1, 2, 4, 7].every((pilots) => {
    const st = enter(laned, 0, 10000, 77, 1, { pilots });
    const s = sectorsAt(pilots);
    return st.due.every((d, k) => (k < s ? d.t === 10000 + (4 + k) * 1000 * (laned.pace?.[pilots] ?? 1) && !d.when
      : d.t === null && d.ms === LANE_GAP_MS && d.when.gone.group === `lane-${k - s}`));
  });
  check('a lane past the sectors at once waits for the lane that many before it to be gone, then LANE_GAP_MS; the others come at their `at`', lanesOk);
  /* arm(): the chained lane gets its time when the one before is gone. */
  const st1 = enter(laned, 0, 10000, 77, 1, { pilots: 1 });
  st1.due[0].born = true;
  note(st1, {
    t: 14000, e: 'born', id: 1, kind: 'strike', group: 'lane-0', sector: null,
  });
  const armCtx = {
    mission: laned, m: { downAt: {}, path: [] }, st: st1, f: 50000, here: [1], pilots: [],
  };
  arm(armCtx);
  const waiting = st1.due[1].t;
  note(st1, {
    t: 41000, e: 'gone', id: 1, kind: 'strike', group: 'lane-0', how: 'kill',
  });
  arm(armCtx);
  check('alone: lane 1 has no time while lane 0 flies, then LANE_GAP_MS after lane 0 is gone', waiting === null && st1.due[1].t === 41000 + LANE_GAP_MS, `${waiting} ${st1.due[1].t}`);
  /* And on the room, one pilot then two, nobody shooting: each lane's
   * birth after the one it waits for is gone. */
  const lanedPlay = (n) => {
    const e = warRoom(laned, { n, seed: 0.4 });
    e.fly(GO + 600000);
    const born = e.of(0, 'born').flatMap((m) => m.agents);
    const gone = new Map(e.of(0, 'dead').flatMap((m) => m.ids.map((id) => [id, m.at])));
    return { born, gone, view: e.view() };
  };
  const solo = lanedPlay(1);
  /* The room tells a death's ms to the micrometre (war.js mm). */
  const after = (a, b, gone) => Math.abs(a.t0 - gone.get(b.id) - LANE_GAP_MS) < 0.001;
  const soloOk = solo.born.length === 4 && solo.born.slice(1).every((a, k) => after(a, solo.born[k], solo.gone));
  check('on the room, alone: the four lanes one at a time, each LANE_GAP_MS after the last is gone, and the mission ends', soloOk && solo.view.state !== 'live',
    JSON.stringify(solo.born.map((a) => [a.wave, a.t0, solo.gone.get(a.id)])));
  const pair = lanedPlay(2);
  const pairOk = pair.born.length === 4 && pair.born[0].t0 - GO < 10000 && pair.born[1].t0 - GO < 10000
    && [2, 3].every((k) => after(pair.born.find((a) => a.wave === k), pair.born.find((a) => a.wave === k - 2), pair.gone));
  check('on the room, two pilots: lanes 0 and 1 at once, 2 and 3 each after the one two before it', pairOk,
    JSON.stringify(pair.born.map((a) => [a.wave, a.t0, pair.gone.get(a.id)])));
  /* A line's towers (worthOf): the line carries its mw once. */
  const tower = (side, k, line, mw) => {
    const t = TOWERS[side][k];
    return {
      mw, at: [t.x, t.y + 8, t.z], r: t.base, line,
    };
  };
  const lined = {
    ...base,
    targets: {
      ...base.targets, 'tower-e-0': tower('e', 0, 'fi1', 1750), 'tower-e-5': tower('e', 5, 'fi1', 1750), 'tower-w-0': tower('w', 0, 'west', 933),
    },
  };
  const worthIs = (downAt, id) => worthOf(lined, null, { downAt }, id);
  check('a tower costs its line\'s mw; another tower of the same line then costs nothing, one of another line its own; an intake as ever',
    worthIs({ 'tower-e-0': 1 }, 'tower-e-0') === 1750 && worthIs({ 'tower-e-0': 1, 'tower-e-5': 2 }, 'tower-e-5') === 0
    && worthIs({ 'tower-e-0': 1, 'tower-w-0': 2 }, 'tower-w-0') === 933 && worthIs({ 'tower-e-0': 1, 'intake-3': 2 }, 'intake-3') === 700);
  /* Wire height (MISSIONS.md M6 twist B): a spawn's strikeP takes the
   * place of STRIKE_P for each crossing of its flight. */
  const corridorM = { ...MISSIONS['itaipu-3'] };
  const runner = {
    id: 1, kind: 'strike', route: 'corridor-west', t0: 0, k: 0, n: 1, err: 0, target: 'yard-right',
  };
  const xs = wireCrossings('itaipu', planAgent(corridorM, runner));
  const half = () => 0.5;
  check('a flight with power line crossings: none struck at STRIKE_P when every draw is 0.5; at p 0.6 the first crossing strikes',
    xs.length > 0 && STRIKE_P < 0.5 && wireStrike(corridorM, runner, half) === null && wireStrike(corridorM, runner, half, null, 0.6) === xs[0].t, JSON.stringify(xs));
  const wiresAt = (strikeP) => {
    const m = {
      ...corridorM,
      id: 'itaipu-corridor-wires',
      contain: undefined,
      stages: [stage([{
        at: 2, kind: 'strike', n: 6, per: 0, route: 'corridor-west', target: 'yard-right', spread: 25, group: 'wires', ...(strikeP != null ? { strikeP } : {}),
      }])],
    };
    const e = warRoom(m, { n: 1, seed: 0.4 });
    e.fly(GO + 4000);
    return { m, born: e.of(0, 'born').flatMap((x) => x.agents) };
  };
  const always = wiresAt(1);
  const crossed = always.born.filter((a) => wireCrossings('itaipu', planAgent(always.m, { ...a, wire: undefined })).length);
  const plain = wiresAt(null);
  check('on the room, strikeP 1: every attacker that crosses a line strikes it at its first crossing; without it fewer do',
    crossed.length > 0 && crossed.every((a) => a.wire === wireCrossings('itaipu', planAgent(always.m, { ...a, wire: undefined }))[0].t)
    && plain.born.filter((a) => a.wire != null).length < crossed.length,
    `${crossed.length} of ${always.born.length} cross; ${plain.born.filter((a) => a.wire != null).length} struck without strikeP`);
  /* Spotting any attacker (TECH-NEEDS T1.8, M6's spot objective): a
   * Striker and a decoy spottable, a pilot near them for SPOT_MS spots
   * them; the view and every screen mark each as its kind, the decoy as
   * a decoy; the group's spot objective is done at the spot. A second
   * group nobody goes near arrives first: its objective fails. */
  /* Under First Light's own id and routes, so a screen (which plans from
   * its own build's mission) can draw them. */
  const spotM = { ...test([
    {
      at: 2, mix: [['strike', 1], ['decoy', 1]], n: 4, per: 0, route: 'reservoir-mid', target: 'intake-8', spread: 0, group: 'seen', spot: true,
    },
    {
      at: 100, kind: 'strike', n: 1, per: 0, route: 'reservoir-mid', target: 'intake-12', spread: 0, group: 'unseen', spot: true,
    },
  ], {
    objectives: [
      {
        id: 'spot-seen', text: 'war.obj.protect_intakes', kind: 'spot', done: { spot: { group: 'seen' } }, fail: { leaked: 1, group: 'seen' },
      },
      {
        id: 'spot-unseen', text: 'war.obj.protect_intakes', kind: 'spot', done: { spot: { group: 'unseen' } }, fail: { leaked: 1, group: 'unseen' },
      },
    ],
  }), id: 'itaipu-1' };
  const se = warRoom(spotM, { n: 2, seed: 0.4, dev: true });
  se.paths[0] = () => [4000, Y, 4000];
  se.paths[1] = () => [4050, Y, 4000];
  se.fly(GO + 4000);
  const seen = se.of(0, 'born').flatMap((m) => m.agents).filter((a) => a.wave === 0);
  const over = poseAt(planAgent(spotM, seen[0]), seen[0].t0 + 60000).p;
  se.paths[0] = (t) => (t >= seen[0].t0 + 55000 && t < seen[0].t0 + 70000 ? [over[0] + 150, over[1] + 50, over[2]] : [4000, Y, 4000]);
  se.fly(seen[0].t0 + 70000);
  const sOps = se.of(0, 'spot');
  const sView = se.view();
  /* An objective's last state the views told. */
  const lastObj = (e, id) => e.of(0).map((m) => m.war.stage?.objectives?.find((o) => o.id === id)?.state).filter(Boolean).at(-1);
  const seenSpot = lastObj(se, 'spot-seen');
  check('spotting a Striker group: each one spotted by the pilot near it, the view marking each as its kind, the decoys as decoys',
    seen.some((a) => a.kind === 'decoy') && seen.every((a) => sOps.some((m) => m.ids.includes(a.id) && m.by > 0) && sView.spotted[a.id] === a.kind),
    JSON.stringify({ ops: sOps.map((m) => [m.ids[0], m.by]), spotted: sView.spotted, kinds: seen.map((a) => a.kind) }));
  const screen = createRoomWar(() => {});
  for (const m of se.socks[1].got) {
    if (m && m.type === 'welcome') {
      screen.onWelcome(m);
    } else if (m && m.type === 'war') {
      screen.onMessage(m);
    }
  }
  const drawnSeen = screen.attackersAt(se.clock).filter((x) => seen.some((a) => a.id === x.id));
  check('a screen marks each spotted one as its kind, a decoy as a decoy (warmarkers.js reads it at any range)',
    drawnSeen.length === seen.length && drawnSeen.every((x) => x.spotted === x.kind), JSON.stringify(drawnSeen.map((x) => [x.id, x.kind, x.spotted])));
  se.fly(seen[0].t0 + 300000);
  check('the spot objective of the group spotted is done; that of the one nobody went near fails when it arrives',
    seenSpot === 'done' && lastObj(se, 'spot-unseen') === 'failed', `${seenSpot} ${lastObj(se, 'spot-unseen')}`);
  /* Islanding (MISSIONS.md M6 stage 4): a hold with `island` names its
   * districts in the view's restores, islanded, once it is done. */
  const isle = test([{
    at: 60, kind: 'strike', n: 1, per: 0, route: 'reservoir-mid', target: 'intake-12', spread: 0, group: 'late',
  }], {
    objectives: [{
      id: 'island', text: 'war.obj.protect_intakes', kind: 'hold', ms: 20000, targets: 'intake-12', fail: { hit: 'intake-12' }, island: ['vila-c', 'foz-north-east'],
    }],
  });
  const ie = warRoom(isle, { n: 1, seed: 0.4 });
  ie.fly(GO + 30000);
  check('a held islanding hold: the view\'s restores carry its districts, islanded, from the hold\'s end',
    JSON.stringify(ie.view().restores) === JSON.stringify([{ at: GO + 20000, districts: ['vila-c', 'foz-north-east'], island: true }]), JSON.stringify(ie.view().restores));
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
