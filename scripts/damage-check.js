/*
 * damage-check.js: the war's destructible structures
 * (src/share/war/damage.js, the room's half in edge/rooms/war.js strike,
 * the pieces in src/share/war/debris.js). Node only, no browser.
 *
 *   table      every wave of every Itaipu mission that aims at a
 *              structure, its warhead at its aim point with no error, again
 *              and again: how many hits open the target (or lose the
 *              yard), each within HITS, and the table printed
 *   support    a spillway gate whose arms are all gone still hangs off its
 *              hoists, only the braces between the arms falling; with its
 *              hoists gone too, its skin, girders and
 *              braces fall (damage.js unsupported), and nothing anchored
 *   war        a scripted war on the real room (edge/rooms/core.js): Loiterers
 *              dive on gate-3 until it opens. The room's damage events
 *              are in seq order, the gate's chunks go, the opening has
 *              the contract's fields within the gate's bay, and the gate
 *              is lost (its MW off the output, in the view's down)
 *   replay     a pilot who joins after, and one who joins a room restored
 *              from what the room stored, hear the same events, field for
 *              field, and their clients (src/share/roomwar.js) hold the
 *              same list as the pilot who was there
 *   debris     the war's pieces: one a removed chunk, every one asleep by
 *              LIFE_MS on the floor, and the same pose whether it was
 *              stepped a frame at a time or in one go (a late joiner's)
 *
 *   node scripts/damage-check.js
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

import { FLAG_AIRBORNE, PROTO, encodePose } from '../src/share/roomwire.js';
import { PRIVATE_CAP, RoomCore } from '../edge/rooms/core.js';
import { planAgent, poseAt } from '../src/share/war/routes.js';
import { MISSIONS, waveTarget } from '../src/share/war/missions/index.js';
import itaipu1 from '../src/share/war/missions/itaipu-1.js';
import {
  DEFENDER, attackerCharge, blast, openingOf, unsupported,
} from '../src/share/war/damage.js';
import {
  LIFE_MS, advance, breachOf, massOf, piecesOf,
} from '../src/share/war/debris.js';
import { createRoomWar } from '../src/share/roomwar.js';
import STRUCTURES from '../src/share/war/itaipu-chunks.js';
import { FREE_OPEN_M, HOIST_M_S } from '../src/share/war/hoist.js';
import { LEAF_RESEND_M } from '../edge/rooms/war.js';
import {
  REST, leafTurn, turnHeight, turnPoint, unturn,
} from '../src/share/war/leaf.js';

/* "A few well placed hits open a breach" (the owner, 2 October): at
 * least HITS_MIN, so one attacker alone, hit or near miss, never opens a
 * target (a hit already takes its megawatts, war.js take), and at most
 * HITS, for every kind at its own targets. */
/* Every gate's leaf where Free Flight has it, as the room's is with no
 * mission gate state (war.js leafTurnAt). */
const FREE = (id) => (STRUCTURES[id].frame.hinge ? leafTurn(STRUCTURES[id].frame.hinge, FREE_OPEN_M) : REST);
const HITS_MIN = 2;
const NEIGHBOUR_HITS = 3;
const HITS = 4;
const GATE = 'gate-3';

let failed = 0;
let passed = 0;
function check(ok, what, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${what}${detail ? `  (${detail})` : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${what}${detail ? `  (${detail})` : ''}`);
  }
}

function table() {
  console.log('\nthe damage table: hits to open at the aim point, no error');
  const rows = new Map();
  const yardRows = [];
  for (const m of Object.values(MISSIONS)) {
    if (m.map !== 'itaipu') {
      continue;
    }
    /* A spawn's every way in (src/share/war/stages.js draws one): a
     * route's id, one of a list, or every route of its sectors; and its
     * every kind, a mix's too. */
    const waysOf = (w) => (typeof w.route === 'string' ? [w.route] : Array.isArray(w.route) ? w.route
      : [w.route.sector].flat().flatMap((sec) => m.sectors[sec]));
    const kindsOf = (w) => (w.mix ? w.mix.map(([kind]) => kind) : [w.kind]);
    const each = m.waves.flatMap((w) => kindsOf(w).flatMap((kind) => waysOf(w).map((route) => ({ ...w, kind, route }))));
    for (const w of each) {
      const ids = !w.target ? [] : Array.isArray(w.target) ? w.target : [w.target];
      for (let k = 0; k < ids.length; k += 1) {
        const target = waveTarget(w, k);
        const s = STRUCTURES[target];
        const charge = attackerCharge(w.kind);
        if (!s || !charge) {
          continue;
        }
        const key = `${w.kind} at ${target} by ${w.route}`;
        if (rows.has(key)) {
          continue;
        }
        /* The yard holds no water and opens nothing: its aim is the
         * middle of its sphere, 24 m over the yard, clear of the rows. */
        if (s.part === 'yard') {
          yardRows.push({ kind: w.kind, mission: m.id, w, target, m });
          rows.set(key, null);
          continue;
        }
        const plan = planAgent(m, {
          id: 1, kind: w.kind, route: w.route, t0: 0, k: 0, n: 1, err: 0, target,
        });
        const p = poseAt(plan, plan.tEnd).p;
        const wreck = {};
        let hits = 0;
        let open = null;
        while (hits < 20 && !open) {
          hits += 1;
          open = blast({ [target]: s }, wreck, p, charge, hits, FREE).find((r) => r.down) ?? null;
        }
        rows.set(key, { hits: open ? hits : Infinity, part: s.part, kind: w.kind });
      }
    }
  }
  /* A defender's warhead going off on a target's face: far less than an
   * attacker's, so intercepting at the dam does not wreck it. */
  for (const id of ['gate-3', 'intake-7', 'penstock-7']) {
    const s = STRUCTURES[id];
    const p = s.chunks[0].c;
    const wreck = {};
    let n = 0;
    while (n < 50 && !blast({ [id]: s }, wreck, p, DEFENDER.standard, n, FREE).some((r) => r.down)) {
      n += 1;
    }
    check(n > HITS, `a defender's standard warhead on ${id}'s face opens it only after more than ${HITS}`, n >= 50 ? 'not in 50' : `${n + 1}`);
  }
  /* The yard: a Striker at its aim breaks equipment within HITS hits;
   * an FPV's or a Loiterer's warhead over the yard's middle reaches
   * none of it (the nearest tank is 17.6 m off), and says so. */
  for (const y of yardRows) {
    const plan = planAgent(y.m, {
      id: 1, kind: y.kind, route: y.w.route, t0: 0, k: 0, n: 1, err: 0, target: y.target,
    });
    const p = poseAt(plan, plan.tEnd).p;
    const wreck = {};
    let hits = 0;
    let broke = null;
    while (hits < 20 && !broke) {
      hits += 1;
      broke = blast({ [y.target]: STRUCTURES[y.target] }, wreck, p, attackerCharge(y.kind), hits, FREE)[0] ?? null;
    }
    const n = broke ? hits : Infinity;
    if (y.kind === 'strike') {
      check(n <= HITS, `strike at the yard (${y.mission}): its first break in ${HITS} hits or fewer`, `${n}, ${broke ? broke.chunks.map((i) => STRUCTURES[y.target].chunks[i].k).join(' ') : 'none'}`);
    } else {
      console.log(`  info  ${y.kind} at the yard (${y.mission}): first break ${n === Infinity ? 'never in 20' : `in ${n}`}`);
    }
  }
  /* A wave on one target leaves its neighbours closed: NEIGHBOUR_HITS of
   * each kind at an intake's or a gate's aim open neither of the next
   * ones (war:boom's mission 1 sends three Boats at intake-17). */
  for (const kind of ['strike', 'loiter', 'boat']) {
    for (const [part, k] of [['intake', 10], ['gate', 6]]) {
      const id = `${part}-${k}`;
      const near = [`${part}-${k - 1}`, `${part}-${k + 1}`];
      const p = MISSIONS['itaipu-1'].targets[id].at;
      const wreck = {};
      const opened = new Set();
      for (let h = 0; h < NEIGHBOUR_HITS; h += 1) {
        const sub = Object.fromEntries([id, ...near].map((x) => [x, STRUCTURES[x]]));
        for (const r of blast(sub, wreck, p, attackerCharge(kind), h, FREE)) {
          if (r.down) {
            opened.add(r.target);
          }
        }
      }
      check(near.every((x) => !opened.has(x)), `${NEIGHBOUR_HITS} ${kind} hits at ${id} leave ${near.join(' and ')} closed`, [...opened].join(' ') || 'none opened');
    }
  }
  const by = new Map();
  for (const [key, r] of rows) {
    if (!r) {
      continue;
    }
    const k = `${r.kind} at a ${r.part}`;
    by.set(k, [...(by.get(k) ?? []), r.hits]);
    if (!(r.hits >= HITS_MIN && r.hits <= HITS)) {
      check(false, `${key} opens in ${HITS_MIN} to ${HITS} hits`, `${r.hits}`);
    }
  }
  for (const [k, list] of by) {
    check(list.every((h) => h >= HITS_MIN && h <= HITS), `${k}: ${Math.min(...list)} to ${Math.max(...list)} hits`, `${list.length} targets`);
  }
}

function leaf() {
  console.log('\nthe leaves (src/share/war/leaf.js)');
  const h = STRUCTURES[GATE].frame.hinge;
  const at = leafTurn(h, h.rest);
  check(Math.abs(at.c - 1) < 1e-12 && Math.abs(at.s) < 1e-12, 'at its rest opening a leaf is not turned', `${at.c} ${at.s}`);
  const lip = turnPoint(h, REST, [h.p[0] - h.n[0] * Math.sqrt(h.r * h.r - (h.sill + h.rest - h.p[1]) ** 2), h.sill + h.rest, h.p[2] - h.n[2] * Math.sqrt(h.r * h.r - (h.sill + h.rest - h.p[1]) ** 2)]);
  const off = [0, FREE_OPEN_M, 4, h.max].map((o) => turnPoint(h, leafTurn(h, o), lip)[1] - (h.sill + o));
  /* To a hundredth of a millimetre: the hinge's axes are written to the
   * micrometre, so not quite unit. */
  check(off.every((d) => Math.abs(d) < 1e-5), 'turned to an opening, the lip stands that high over the sill', off.map((d) => d.toExponential(1)).join(' '));
  const t = leafTurn(h, 6);
  const back = turnPoint(h, unturn(t), turnPoint(h, t, [-1040, 205, -970]));
  const miss = Math.hypot(back[0] + 1040, back[1] - 205, back[2] + 970);
  check(miss < 1e-5, 'a turn and its unturn come back', `${miss.toExponential(1)} m`);
  /* A blast by the leaf turned to 6 m breaks what the same blast, turned
   * back with it, breaks of the leaf at rest. */
  /* The leaf alone, out of the water, which reaches a blast by where the
   * chunk stands, not by the leaf's frame. */
  const s = { ...STRUCTURES[GATE], water: null };
  const p0 = turnPoint(h, REST, s.chunks[5].c).map((v, k) => v + [0, 0.5, 0.3][k]);
  const p6 = turnPoint(h, t, p0);
  const w = { charge: 300, r: 2 };
  const a = blast({ [GATE]: s }, {}, p0, w, 1, () => REST)[0];
  const b = blast({ [GATE]: s }, {}, p6, w, 1, () => t)[0];
  check(Boolean(a) && Boolean(b) && JSON.stringify(a.chunks.filter((i) => s.chunks[i].m)) === JSON.stringify(b.chunks.filter((i) => s.chunks[i].m)),
    'a blast on a turned leaf breaks the leaf\'s chunks it breaks at rest, turned', a ? a.chunks.join(' ') : 'none');
}

function support() {
  console.log('\nthe support check');
  const s = STRUCTURES[GATE];
  const of = (k) => s.chunks.map((ch, i) => (ch.k === k ? i : -1)).filter((i) => i >= 0);
  const gone = s.chunks.map(() => 0);
  for (const i of of('arm')) {
    gone[i] = 1;
  }
  const loose = unsupported(s, gone);
  check(loose.length === of('brace').length && loose.every((i) => s.chunks[i].k === 'brace'),
    'arms gone: the braces between them fall, the skin and girders still hang off the hoists', `${loose.length} fall`);
  for (const i of of('hoist')) {
    gone[i] = 1;
  }
  const fell = new Set(unsupported(s, gone));
  const hanging = [...of('skin'), ...of('girder'), ...of('brace')];
  check(hanging.every((i) => fell.has(i)) && fell.size === hanging.length, 'arms and hoists gone: skin, girders and braces fall, nothing else', `${fell.size} fall`);
  /* A yard gantry: its posts gone, its beam falls, and the spans whose
   * wires end on it are down. */
  const y = STRUCTURES['yard-right'];
  const bi = y.chunks.findIndex((ch) => ch.k === 'beam' && ch.w && ch.w.length);
  const posts = y.chunks[bi].l;
  const wreck = {};
  let cut = [];
  for (const i of posts) {
    for (const r of blast({ 'yard-right': y }, wreck, y.chunks[i].c, { charge: 200, r: 0.5 }, i)) {
      cut = [...cut, ...r.cut];
    }
  }
  check(wreck['yard-right'].gone[bi] === 1 && [...y.chunks[bi].w].sort().join() === [...cut].sort().join(),
    'a gantry\'s posts gone: its beam falls and its spans are down', `spans ${cut.join(' ')}`);
  const one = s.chunks.map(() => 0);
  one[of('hoist')[0]] = 1;
  check(unsupported(s, one).length === 0, 'one hoist gone: nothing falls');
}

/* The scripted war: Loiterers on GATE until it opens, a pilot hovering
 * out of the way so the rounds wait on nothing. */
function mission() {
  const waves = [];
  for (let i = 0; i < 6; i += 1) {
    waves.push({
      round: 0, at: 2 + 20 * i, kind: 'loiter', n: 1, per: 1, route: 'high-west', target: GATE,
    });
  }
  /* One more, late, so the war is still on while the gate moves. */
  waves.push({
    round: 0, at: 1500, kind: 'scout', n: 1, per: 1, route: 'high-west',
  });
  return {
    ...itaipu1, id: 'damage-1', stages: undefined, waves, floorMw: 0, starMw: 0, airframes: 4,
  };
}

function room(m, code) {
  const r = new RoomCore({
    code, cap: PRIVATE_CAP, friendly: false, map: 'itaipu', epoch: 0,
  });
  r.war.missions = { ...MISSIONS, [m.id]: m };
  r.war.random = () => 0.25;
  return r;
}

function warScenario() {
  console.log('\na scripted war: Loiterers on', GATE);
  const m = mission();
  let r = room(m, 'DMG000');
  let stored = null;
  let tokens = 0;
  const socks = [];
  const apply = (actions) => {
    for (const x of actions) {
      if (x.send) {
        x.send.got.push(typeof x.data === 'string' ? JSON.parse(x.data) : x.data);
      } else if (x.store === 'war') {
        stored = JSON.parse(JSON.stringify(x.value));
      }
    }
  };
  const join = (i, at) => {
    const so = { name: `d${i}`, address: `10.8.8.${i + 1}`, got: [] };
    socks[i] = so;
    apply(r.open(so, at));
    apply(r.message(so, JSON.stringify({
      type: 'hello', proto: PROTO, build: 't', name: [i, i, 20 + i], profile: { airframe: '5inch', map: 'itaipu', figure: 1, livery: null, parts: null },
    }), at, so.address, () => (tokens += 1).toString(16).padStart(32, '0')));
    return so;
  };
  let clock = 0;
  join(0, 0);
  apply(r.message(socks[0], JSON.stringify({ type: 'war', op: 'start', mission: m.id }), 0, socks[0].address));
  const damageOf = (so) => so.got.filter((x) => x && x.type === 'war' && x.op === 'damage');
  const fly = (until) => {
    for (let t = clock + 1; t <= until; t += 1) {
      clock = t;
      if (t % 33 === 0) {
        for (const so of socks) {
          if (so && r.seats.has(so)) {
            apply(r.message(so, encodePose({
              wx: 0, wy: 0, wz: 0, c0: 0, c1: 0, c2: 0, c3: 0, motor: 0, flaps: 0, seq: 1,
              px: 2000, py: 400, pz: 2000, vx: 0, vy: 0, vz: 0, qx: 0, qy: 0, qz: 0, qw: 1, flags: FLAG_AIRBORNE, t,
            }), t));
          }
        }
        apply(r.tick(t));
      }
    }
  };
  let opened = null;
  while (clock < 400000 && !opened) {
    fly(clock + 1000);
    opened = damageOf(socks[0]).find((e) => e.target === GATE && e.openings.length) ?? null;
  }
  const events = damageOf(socks[0]);
  check(Boolean(opened), `${GATE} opens`, opened ? `at room ms ${opened.at}, after ${events.filter((e) => e.target === GATE).length} events` : 'never');
  if (!opened) {
    return;
  }
  check(events.every((e, k) => e.seq === k), 'the events are in seq order from 0');
  check((r.war.match.breaches ?? []).some((b) => b.target === GATE && b.at === opened.at), 'the opening is a breach for the stages\' triggers', JSON.stringify(r.war.match.breaches));
  const o = opened.openings[0];
  const s = STRUCTURES[GATE];
  const fields = ['id', 'target', 'kind', 'at', 'sill', 'width_m', 'height_m', 'normal', 'upstream_cell', 'downstream_cell'];
  check(fields.every((f) => f in o) && o.kind === 'gate' && o.target === GATE, 'the opening has the contract\'s fields', JSON.stringify(o));
  const bay = s.chunks.filter((ch) => ch.r);
  const u0 = Math.min(...bay.map((ch) => ch.r[0]));
  const u1 = Math.max(...bay.map((ch) => ch.r[1]));
  /* The bay's leaf where it stood then, at Free Flight's opening. */
  const tFree = leafTurn(s.frame.hinge, FREE_OPEN_M);
  const y0 = Math.min(...bay.map((ch) => turnHeight(s.frame.hinge, tFree, ch.r[2])));
  const y1 = Math.max(...bay.map((ch) => turnHeight(s.frame.hinge, tFree, ch.r[3])));
  check(o.width_m > 0 && o.width_m <= u1 - u0 + 1e-6 && o.height_m > 0 && o.sill[1] >= y0 - 1e-6 && o.sill[1] + o.height_m <= y1 + 1e-6,
    'the opening lies in the gate\'s bay', `bay ${(u1 - u0).toFixed(2)} x ${(y1 - y0).toFixed(2)} m from ${y0.toFixed(2)}`);
  const gone = new Set(events.filter((e) => e.target === GATE).flatMap((e) => e.chunks));
  check(gone.size > 0 && [...gone].every((i) => i >= 0 && i < s.chunks.length), 'the gate\'s chunks go, each once', `${gone.size} of ${s.chunks.length}`);
  fly(clock + 500);
  const view = socks[0].got.filter((x) => x && x.type === 'war' && x.war).at(-1).war;
  check(view.down.includes(GATE) && view.output === itaipu1.output - itaipu1.targets[GATE].mw, 'the gate is lost: its MW off the output, in down', `output ${view.output}`);

  console.log('\nthe holed gate moves');
  /* The stage engine's gate state (war.js leafWatch reads match.gates):
   * the gate's hoist to 6 m. */
  const moveAt = Math.ceil(clock + 100);
  r.war.match.gates = [{ gate: GATE, at: moveAt, open_m: 6 }];
  fly(clock + 1000 + Math.ceil((1000 * (6 - FREE_OPEN_M)) / HOIST_M_S));
  const moved = damageOf(socks[0]).filter((e) => e.by === 'hoist');
  const sills = moved.map((e) => e.openings[0].sill[1]);
  check(moved.length >= (6 - FREE_OPEN_M) / LEAF_RESEND_M && moved.every((e) => e.chunks.length === 0 && e.openings.length === 1 && e.openings[0].id === GATE && e.openings[0].at === e.at),
    'its opening is told again as its leaf rises, the same id, no chunks', `${moved.length} times`);
  check(moved.every((e, k) => e.at > opened.at && e.at >= moveAt && (k === 0 || e.at > moved[k - 1].at)), 'each stamped with the room ms of its move, in order, after the break',
    `${moved[0] && moved[0].at} to ${moved.length && moved.at(-1).at}`);
  const want = openingOf(GATE, s, r.war.match.wreck[GATE].gone, 0, leafTurn(s.frame.hinge, 6));
  /* Between two breaks (a later Loiterer's), each telling higher. */
  const gateEvents = damageOf(socks[0]).filter((e) => e.target === GATE);
  const rising = gateEvents.every((e, k) => k === 0 || e.by !== 'hoist' || gateEvents[k - 1].by !== 'hoist'
    || e.openings[0].sill[1] > gateEvents[k - 1].openings[0].sill[1]);
  check(rising && Math.abs(sills.at(-1) - want.sill[1]) < 1e-6,
    'the holes rise with the leaf, the last where the leaf stops at 6 m', `sill ${sills[0]} to ${sills.at(-1)}`);

  console.log('\nthe replay');
  const late = join(1, clock);
  fly(clock + 100);
  const strip = (list) => JSON.stringify(list.map((e) => ({ ...e })));
  const told = damageOf(socks[0]);
  check(strip(damageOf(late).slice(0, told.length)) === strip(told), 'a pilot who joins late hears the same events, field for field', `${told.length} events`);
  const clients = [socks[0], late].map((so) => {
    const c = createRoomWar(() => {});
    for (const x of so.got) {
      if (x && x.type === 'welcome') {
        c.onWelcome(x);
      } else if (x) {
        c.onMessage(x);
      }
    }
    return c;
  });
  check(JSON.stringify(clients[0].damage()) === JSON.stringify(clients[1].damage()) && clients[0].damage().length === told.length, 'both clients hold the same list');
  /* A restart: the stored match into a new room, a pilot joins it. */
  r = room(m, 'DMG000');
  r.war.restore(JSON.parse(JSON.stringify(stored)));
  const back = join(2, clock);
  check(strip(damageOf(back)) === strip(told.slice(0, damageOf(back).length)) && damageOf(back).length >= told.length,
    'a pilot who joins a restored room hears the same events', `${damageOf(back).length}`);
  debris(told);
}

/* The war's pieces, on a flat floor 40 m under the gate's sill. */
function debris(events) {
  console.log('\nthe pieces');
  const floor = STRUCTURES[GATE].chunks.reduce((y, ch) => Math.min(y, ch.c[1]), Infinity) - 40;
  const floorAt = () => floor;
  let n = 0;
  let all = true;
  let same = true;
  for (const e of events.filter((x) => x.chunks.length)) {
    const s = STRUCTURES[e.target];
    const a = piecesOf(e, s);
    const b = piecesOf(e, s);
    n += a.length;
    for (let t = e.at; t <= e.at + LIFE_MS + 100; t += 16) {
      for (const pc of a) {
        advance(pc, t, floorAt);
      }
    }
    for (const pc of b) {
      advance(pc, e.at + LIFE_MS + 100, floorAt);
    }
    all &&= a.length === e.chunks.length && a.every((pc) => pc.asleep && pc.p[1] >= floor);
    same &&= a.every((pc, k) => pc.p.every((v, j) => v === b[k].p[j]) && pc.q.every((v, j) => v === b[k].q[j]));
  }
  check(all, 'one piece a removed chunk, each asleep on the floor by LIFE_MS', `${n} pieces`);
  check(same, 'a piece stepped a frame at a time is where one stepped in one go is');
  /* The world's sound takes a breach only with a known material and a
   * mass over 0 (world-audio.js breach throws otherwise). */
  const kinds = new Set(Object.values(STRUCTURES).flatMap((s) => s.chunks.map((ch) => ch.k)));
  const masses = [...kinds].map((k) => [k, massOf(Object.values(STRUCTURES).flatMap((s) => s.chunks).find((ch) => ch.k === k))]);
  check(masses.every(([, m]) => ['concrete', 'steel', 'transformer'].includes(m.material) && m.mass > 0), 'every chunk kind has a material and a mass',
    masses.map(([k, m]) => `${k} ${m.material} ${Math.round(m.mass)} kg`).join(', '));
  const heard = events.filter((e) => e.chunks.length).map((e) => breachOf(e, STRUCTURES[e.target]));
  check(heard.every((b) => b && Number.isFinite(b.at) && b.position.length === 3 && b.position.every(Number.isFinite)),
    'every event is one breach heard', heard.map((b) => `${b.material} ${Math.round(b.mass)} kg`).join(', '));
}

table();
leaf();
support();
warScenario();
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
