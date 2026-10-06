/*
 * obstacles-golden.js: src/game/obstacles.js held to the exact outputs it
 * gave when tests/fixtures/obstacles-golden.json was written.
 * npm run obstacles:golden.
 *
 * score-selftest, orbit-check and path-check say what the obstacle field
 * should do in a dozen sentences. The recogniser leans on far more than
 * that: the ids leave the module as obstacleId, the order nearAll hands
 * entries back in decides which run names a trick, sameAxis is asymmetric
 * and trickdetect relies on its argument roles, and the field derived from
 * a map decides what a pilot can loop at all. So this pins, bit for bit:
 *
 *   exports     the constants and the kind name table.
 *   field       hand built fields (the selftest's, trick-sweep's and
 *               orbit-check's, and the spec's goldens): items with their key
 *               order, count and countOf, add and build returning the field,
 *               add after build staying invisible until the next build, ties,
 *               truncation, the hysteresis on both sides of its ratio, every
 *               reach and overhang boundary, cell boundaries, the one cell
 *               lookup's missed sliver, the cell key aliasing, NaN, -0, odd
 *               kinds, other cell sizes and a negative max that throws.
 *   sameAxis    the selftest's pairs, both threshold boundaries, the
 *               asymmetry, falsy and NaN arguments, and seeded pairs.
 *   derive      plain object fixtures (score-selftest's boxes and every
 *               classification threshold met exactly, both throw paths,
 *               arrays read only in the branch that needs them), real
 *               Colliders built the way the checks build them (orbit-check's
 *               tower, path-check's and wall-check's worlds through
 *               flightrig's buildWorld, the mixed set from the spec), seeded
 *               Colliders of every kind with retired, streamed and built
 *               sets, and the one real map a node script can build in CI:
 *               Itaipu's baked power line chords over its baked heightfield.
 *               Each records the items, the order and the arguments of every
 *               groundAt call, and nearAll and near over seeded points.
 *
 * Nothing here reads the field's internals (its cell size or its index):
 * only what main.js, trickdetect, score-selftest, trick-sweep and the checks
 * read, so a rewrite with different insides still passes.
 *
 * The record is written with --record; see scripts/lib/golden.js. Write it
 * again only on purpose, with the reason in the pull request.
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

import { readFileSync } from 'node:fs';

import * as OBSTACLES from '../src/game/obstacles.js';
import {
  OB_BAR, OB_KIND_NAME, OB_POLE, ObstacleField, deriveObstacles, sameAxis,
} from '../src/game/obstacles.js';
import { Colliders, KINDS } from '../src/game/collide.js';
import { buildWorld } from './lib/flightrig.js';
import { loadHeight } from '../edge/rooms/warhunt.js';
import ITAIPU_WIRES from '../src/share/war/itaipu-wires.js';
import { goldenMain, seeded } from './lib/golden.js';

const FIXTURE = new URL('../tests/fixtures/obstacles-golden.json', import.meta.url);
const ITAIPU_HEIGHT = new URL('../src/share/war/itaipu-height.bin', import.meta.url);

const TURN = 2 * Math.PI;
/* The largest step below a multiple of 16 that still lands in the cell
 * below it, so a query just short of a cell edge is a different query. */
const EPS = 2 ** -20;
/* trickdetect's MAX_PATH_RUNS, the one max a caller passes. */
const MAX_RUNS = 32;

const cases = [];

/* ---------------------------------------------------------------- helpers */

/* Everything a caller can read back from a field: the items with their key
 * order, and the counts main.js shows. countOf(2) is asked too because
 * odd kinds are stored and counted. */
function sayField(s, label, f) {
  s.say(`${label} count`, f.count);
  s.say(`${label} countOf`, [f.countOf(OB_POLE), f.countOf(OB_BAR), f.countOf(2), f.countOf(undefined)]);
  s.say(`${label} items`, f.items);
  s.say(`${label} ids are indices`, f.items.every((o, i) => o.id === i));
}

/* One nearAll call through the caller's own array, which trickdetect reuses
 * every millisecond: what it returned, what is left in the array, each
 * entry's id and squared distance, the entry's key order, and whether the
 * entry holds the field's own object rather than a copy. */
function sayNearAll(s, label, f, out, x, y, z, max) {
  const n = s.call(`${label} nearAll(${x},${y},${z},${max})`, () => f.nearAll(x, y, z, out, max));
  /* Anything that is not an entry is written as itself: the array arrives
   * holding junk, and a rewrite that failed to clear it must say so here
   * rather than crash the check. */
  const entry = (e) => e && typeof e === 'object' && e.ob;
  s.say(`${label} out`, [out.length, out.map((e) => (entry(e) ? [e.ob.id, e.d2] : e))]);
  if (out.length && entry(out[0])) {
    s.say(`${label} keys`, Object.keys(out[0]));
    s.say(`${label} same objects`, out.every((e) => entry(e) && e.ob === f.items[e.ob.id]));
  }
  return n;
}

/* near() as score-selftest calls it (three arguments) when there is no
 * current, and with a fourth otherwise; the selftest compares the result
 * by identity with items[i], so that is said too. */
function sayNear(s, label, f, x, y, z, current, tag) {
  let r;
  try {
    r = current === undefined ? f.near(x, y, z) : f.near(x, y, z, current);
  } catch (err) {
    s.say(`${label} near(${x},${y},${z},${tag}) threw`, String(err && err.message));
    return;
  }
  s.say(`${label} near(${x},${y},${z},${tag})`, r ? [r.id, r === f.items[r.id]] : r);
}

/* A spread of query points around a field's obstacles: seeded points within
 * and a little past each one's reach and span, some of them snapped onto a
 * cell edge or just short of one (the one cell lookup changes there), and
 * a few far away. Only finite items are aimed at. */
function pointsAround(rng, f, perItem, cell = 16) {
  const pts = [];
  const live = f.items.filter((o) => Number.isFinite(o.cx) && Number.isFinite(o.cy) && Number.isFinite(o.cz)
    && Number.isFinite(o.half));
  for (const o of live) {
    for (let k = 0; k < perItem; k += 1) {
      const reach = (o.kind === OB_BAR ? 14 : 18) + 3;
      const span = Math.abs(o.half) + 4;
      let x = o.cx + rng.range(-reach - Math.abs(o.dx) * span, reach + Math.abs(o.dx) * span);
      const y = o.cy + rng.range(-reach - Math.abs(o.dy) * span, reach + Math.abs(o.dy) * span);
      let z = o.cz + rng.range(-reach - Math.abs(o.dz) * span, reach + Math.abs(o.dz) * span);
      const snap = rng.int(0, 5);
      if (snap === 1) x = Math.round(x / cell) * cell;
      if (snap === 2) z = Math.round(z / cell) * cell - EPS;
      if (snap === 3) {
        x = Math.round(x / cell) * cell - EPS;
        z = Math.round(z / cell) * cell;
      }
      pts.push([x, y, z]);
    }
  }
  for (let k = 0; k < 4; k += 1) {
    pts.push([rng.range(-3000, 3000), rng.range(-50, 300), rng.range(-3000, 3000)]);
  }
  return pts;
}

/* Probe a field at every point: nearAll at trickdetect's max and at a
 * random small one, through one reused array, and near with no current,
 * with what nearAll found nearest and furthest as current (the hysteresis
 * path), and with an item picked at random (often not in the cell). */
function probe(s, label, f, pts, rng) {
  const out = [{ junk: true }, 7];
  pts.forEach(([x, y, z], i) => {
    const tag = `${label}#${i}`;
    sayNearAll(s, tag, f, out, x, y, z, MAX_RUNS);
    const found = out.map((e) => e.ob);
    sayNearAll(s, tag, f, out, x, y, z, rng.pick([1, 2, 3, undefined]));
    sayNear(s, tag, f, x, y, z, undefined, 'none');
    if (found.length) {
      sayNear(s, tag, f, x, y, z, found[0], `nearest ${found[0].id}`);
      const last = found[found.length - 1];
      sayNear(s, tag, f, x, y, z, last, `furthest ${last.id}`);
    }
    if (f.items.length) {
      const o = rng.pick(f.items);
      sayNear(s, tag, f, x, y, z, o, `item ${o.id}`);
    }
  });
}

/* A groundAt that writes down how it was called: the arguments and their
 * count, in call order, then answers with `answer`. */
function loggedGround(answer) {
  const calls = [];
  function groundAt(...args) {
    calls.push([...args, args.length]);
    return answer(...args);
  }
  return { groundAt, calls };
}

/* Derive, then say every groundAt call (those made before a throw too) and
 * the field. The field itself is never written whole: its cell size and
 * index are its own business, and only what sayField reads is a contract. */
function sayDerive(s, label, colliders, answer, oneArgument = false) {
  const g = typeof answer === 'function' ? loggedGround(answer) : { groundAt: answer, calls: null };
  let f;
  try {
    f = oneArgument ? deriveObstacles(colliders) : deriveObstacles(colliders, g.groundAt);
  } catch (err) {
    s.say(`${label} derive threw`, String(err && err.message));
  }
  if (g.calls) s.say(`${label} groundAt calls`, g.calls);
  if (f) sayField(s, label, f);
  return f;
}

function fieldOf(list, cell) {
  const f = cell === undefined ? new ObstacleField() : new ObstacleField(cell);
  for (const a of list) f.add(...a);
  return f;
}

/* ---------------------------------------------------------------- exports */

cases.push({
  id: 'exports',
  run: (s) => {
    s.say('exports', Object.keys(OBSTACLES).sort().map((k) => `${k}:${typeof OBSTACLES[k]}`));
    s.say('OB_POLE', OB_POLE);
    s.say('OB_BAR', OB_BAR);
    s.say('OB_KIND_NAME', OB_KIND_NAME);
    s.say('OB_KIND_NAME is an array', Array.isArray(OB_KIND_NAME));
    /* trickdetect emits OB_KIND_NAME[ob.kind] as the obstacle's name. */
    s.say('names by kind', [OB_KIND_NAME[OB_POLE], OB_KIND_NAME[OB_BAR], OB_KIND_NAME[2]]);
  },
});

/* ---------------------------------------------------------------- field */

/* The selftest's hand field (spec 7.1): before build, after build, the
 * selftest's four points, the exact end plus overhang boundary and a NaN y.
 * Also what add and build hand back, and count as read before a build. */
cases.push({
  id: 'field-selftest',
  run: (s) => {
    const f = new ObstacleField();
    s.say('new count', f.count);
    s.say('new items', f.items);
    s.say('count is not callable', typeof f.count);
    s.say('add returns the field', f.add(OB_BAR, 0, 6, 0, 1, 0, 0, 8) === f);
    f.add(OB_POLE, 40, 5, 0, 0, 1, 0, 5);
    sayField(s, 'unbuilt', f);
    const out = [1, 2];
    sayNearAll(s, 'unbuilt', f, out, 0, 2, 0, 6);
    sayNear(s, 'unbuilt', f, 0, 2, 0, undefined, 'none');
    sayNear(s, 'unbuilt', f, 0, 2, 0, f.items[0], 'item 0');
    const before = f.items;
    s.say('build returns the field', f.build() === f);
    sayField(s, 'built', f);
    s.say('items is the same array after build', before === f.items);
    for (const [x, y, z] of [[0, 2, 0], [44, 5, 0], [0, 5, 300], [60, 6, 0], [10.5, 6, 0], [-10.5, 6, 0],
      [10.500000000000002, 6, 0], [0, NaN, 0], [NaN, 2, 0], [0, 2, NaN], [-0, 2, -0], [0, 20, 0], [0, 20.000000000000004, 0]]) {
      sayNearAll(s, 'built', f, out, x, y, z, 6);
      sayNear(s, 'built', f, x, y, z, undefined, 'none');
    }
  },
});

/* Ties, truncation and hysteresis (spec 7.2), and both sides of the ratio
 * on a pair whose distances sweep through it. */
cases.push({
  id: 'field-ties',
  run: (s) => {
    const four = fieldOf([[0, 3, 5, 0, 0, 1, 0, 5], [0, -3, 5, 0, 0, 1, 0, 5], [0, 0, 5, 3, 0, 1, 0, 5],
      [0, 0, 5, 1, 0, 1, 0, 5]]).build();
    const out = [];
    for (const max of [2, 0, 1, 3, 4, 5, undefined, MAX_RUNS, null, NaN, 2.5, -1]) {
      sayNearAll(s, 'four', four, out, 0.5, 5, 0.5, max);
    }
    sayNear(s, 'four', four, 0, 5, 0, undefined, 'none');
    sayNear(s, 'four', four, 0.5, 5, 0.8, four.items[0], 'item 0');
    sayNear(s, 'four', four, 0.5, 5, 0.8, undefined, 'none');
    const three = fieldOf([[0, 2, 5, 0, 0, 1, 0, 5], [0, -2, 5, 0, 0, 1, 0, 5], [0, 0, 5, 2.5, 0, 1, 0, 5]]).build();
    sayNearAll(s, 'three', three, out, 0, 5, 0, 6);
    for (const cur of [undefined, null, three.items[0], three.items[1], three.items[2], { kind: 0 }, false]) {
      sayNear(s, 'three', three, 0, 5, 0, cur, cur && cur.id !== undefined ? `item ${cur.id}` : String(cur));
    }
    const two = fieldOf([[0, 0, 5, 0, 0, 1, 0, 5], [0, 0, 5, 3, 0, 1, 0, 5]]).build();
    sayNear(s, 'two', two, 0, 5, 0.5, two.items[1], 'item 1');
    sayNear(s, 'two', two, 0, 5, 0.5, { kind: 0 }, 'foreign');
    const pair = fieldOf([[0, 0, 5, 0, 0, 1, 0, 5], [0, 0, 5, 7, 0, 1, 0, 5]]).build();
    for (let k = 0; k <= 70; k += 1) {
      const z = k / 10;
      sayNear(s, 'pair', pair, 0, 5, z, pair.items[0], 'item 0');
      sayNear(s, 'pair', pair, 0, 5, z, pair.items[1], 'item 1');
    }
  },
});

/* Every filter met exactly, and just past: a pole's reach, a bar's reach,
 * the span plus overhang at both ends, the overhang capped by a short
 * half and by a half equal to it, and a negative half. */
cases.push({
  id: 'field-boundaries',
  run: (s) => {
    const f = fieldOf([
      [OB_POLE, 0, 5, 0, 0, 1, 0, 5],
      [OB_BAR, 200, 6, 0, 1, 0, 0, 8],
      [OB_POLE, 400, 1.3, 0, 0, 1, 0, 1.3],
      [OB_POLE, 600, 3, 0, 0, 1, 0, 3],
      [OB_BAR, 800, 6, 0, 0, 0, 1, 2.5],
      [OB_POLE, 1000, 5, 0, 0, 1, 0, -2],
      [OB_BAR, 1200, 6, 0, 0.6, 0, 0.8, 5],
    ]).build();
    const out = [];
    const up = 2.220446049250313e-15;
    const pts = [
      [18, 5, 0], [18 + up, 5, 0], [-18, 5, 0], [0, 5, 18], [0, 5, -18 - up], [0, 13, 0], [0, 13 + up, 0], [0, -3, 0],
      [0, -3 - up, 0], [12.727922061357855, 5, 12.727922061357855],
      [210.5, 6, 0], [210.5 + 1e-13, 6, 0], [189.5, 6, 0], [200, 20, 0], [200, 6, 14], [200, 6, 14.000000000000002],
      [200, 6, -14], [210.5, 6, 14], [210.5, -8, 0],
      [400, 3.9, 0], [400, 3.9000000000000004, 0], [400, -1.3, 0], [418, 1.3, 0],
      [600, 9, 0], [600, 9.000000000000002, 0], [600, -3, 0],
      [800, 6, 5], [800, 6, -5], [800, 6, 5.000000000000001], [814, 6, 0],
      [1000, 5, 0], [1000, 1, 0], [1000, 9, 5], [1000, 0.9, 3],
      [1203, 6, 4], [1206, 6, 8], [1206.000000000001, 6, 8], [1194, 6, -8], [1200 + 8.4, 6, -11.2],
    ];
    for (const [x, y, z] of pts) {
      sayNearAll(s, 'b', f, out, x, y, z, MAX_RUNS);
      sayNear(s, 'b', f, x, y, z, undefined, 'none');
    }
  },
});

/* The grid itself, from outside: cell edges at 0, 16 and -16 met exactly
 * and just short, -0, an obstacle whose footprint just reaches a cell, the
 * one cell lookup missing a sliver of a bar 80 degrees off x (spec 7.9),
 * and the same geometry a metre over, which it finds. */
cases.push({
  id: 'field-cells',
  run: (s) => {
    const edge = fieldOf([[OB_POLE, 1, 5, 1, 0, 1, 0, 5], [OB_POLE, 34, 5, 1, 0, 1, 0, 5],
      [OB_BAR, -15, 6, -17, 1, 0, 0, 1]]).build();
    const out = [];
    const xs = [0, -0, -EPS, EPS, 16, 16 - EPS, -16, -16 - EPS, 32, 32 - EPS, 15.999999999999998, -1e-300];
    for (const x of xs) {
      for (const z of [0, -0, -EPS, 16 - EPS, -16]) {
        sayNearAll(s, 'edge', edge, out, x, 5, z, MAX_RUNS);
        sayNear(s, 'edge', edge, x, 5, z, undefined, 'none');
      }
    }
    const th = Math.atan2(14, 2.5);
    const dx = Math.cos(th);
    const dz = Math.sin(th);
    const along = 10.4;
    const perp = 13.9;
    const x = 0.5 + along * dx + perp * dz;
    const z = along * dz - perp * dx;
    const sliver = fieldOf([[OB_BAR, 0.5, 6, 0, dx, 0, dz, 8]]).build();
    s.say('sliver point', [x, z]);
    sayNearAll(s, 'sliver', sliver, out, x, 6, z, 6);
    sayNear(s, 'sliver', sliver, x, 6, z, undefined, 'none');
    const shifted = fieldOf([[OB_BAR, -0.5, 6, 0, dx, 0, dz, 8]]).build();
    sayNearAll(s, 'shifted', shifted, out, x - 1, 6, z, 6);
    sayNear(s, 'shifted', shifted, x - 1, 6, z, undefined, 'none');
    const rng = seeded(0x51117e5);
    for (let k = 0; k < 120; k += 1) {
      const a = rng.range(0, 1);
      const p = rng.range(10, 14.2);
      const t = th + rng.range(-0.2, 0.2);
      const qx = 0.5 + a * 10.5 * Math.cos(t) + p * Math.sin(t);
      const qz = a * 10.5 * Math.sin(t) - p * Math.cos(t);
      sayNearAll(s, `sweep${k}`, sliver, out, qx, 6, qz, 6);
    }
  },
});

/* The cell key packs (ix, iz) as ix * 100003 + iz, which aliases cells
 * 100003 apart. A bar along z long enough to cover two aliased cells is
 * filed twice in one bucket, and nearAll hands it back twice. */
cases.push({
  id: 'field-alias',
  run: (s) => {
    const f = fieldOf([[OB_BAR, 16, 6, 0, 0, 0, 1, 900000], [OB_POLE, 10, 6, 800008, 0, 1, 0, 5]]).build();
    const out = [];
    for (const [x, y, z] of [[10, 6, 800008], [20, 6, 800008], [10, 6, -800040], [10, 6, 0], [10, 6, 700000],
      [17, 6, 799990]]) {
      sayNearAll(s, 'alias', f, out, x, y, z, MAX_RUNS);
      sayNearAll(s, 'alias', f, out, x, y, z, 1);
      sayNear(s, 'alias', f, x, y, z, undefined, 'none');
      sayNear(s, 'alias', f, x, y, z, f.items[1], 'item 1');
    }
  },
});

/* What add stores without question, and what build makes of it: kinds
 * other than pole and bar, NaN and undefined fields, an unnormalised
 * direction, a zero direction. They are counted, and the odd ones never
 * found. Then an add after build, invisible until the next build. */
cases.push({
  id: 'field-odd',
  run: (s) => {
    const f = fieldOf([
      [2, 0, 5, 0, 0, 1, 0, 5],
      [-1, 0, 5, 0, 0, 1, 0, 5],
      [undefined, 0, 5, 0, 0, 1, 0, 5],
      ['0', 0, 5, 0, 0, 1, 0, 5],
      [OB_POLE, NaN, 5, 0, 0, 1, 0, 5],
      [OB_POLE, 0, NaN, 0, 0, 1, 0, 5],
      [OB_BAR, 0, 6, 0, NaN, 0, 1, 5],
      [OB_BAR, 0, 6, 0, 2, 0, 0, 3],
      [OB_POLE, 0, 5, 0, 0, 0, 0, 5],
      [OB_POLE, 0, 5, 0, 0, 1, 0, NaN],
      [OB_POLE, 0, 5, 0, 0, 1, 0],
      [OB_BAR, 0, 6, 0, -1, 0, -0, 4],
      [OB_POLE, 3, 5, 0, 0, -1, 0, 5],
    ]);
    sayField(s, 'odd', f);
    f.build();
    const out = [];
    for (const [x, y, z] of [[0, 5, 0], [0, 6, 1], [5, 6, 0], [0, 12, 0], [8, 6, 0], [3, 9, 0], [-4, 6, 2]]) {
      sayNearAll(s, 'odd', f, out, x, y, z, undefined);
      sayNear(s, 'odd', f, x, y, z, undefined, 'none');
    }
    f.add(OB_POLE, 100, 5, 100, 0, 1, 0, 5);
    sayField(s, 'added', f);
    sayNearAll(s, 'added unbuilt', f, out, 100, 5, 101, MAX_RUNS);
    sayNear(s, 'added unbuilt', f, 100, 5, 101, undefined, 'none');
    f.build();
    sayNearAll(s, 'added rebuilt', f, out, 100, 5, 101, MAX_RUNS);
    sayNear(s, 'added rebuilt', f, 100, 5, 101, undefined, 'none');
    f.build();
    sayNearAll(s, 'built twice', f, out, 0, 6, 1, MAX_RUNS);
    const empty = new ObstacleField().build();
    sayField(s, 'empty', empty);
    sayNearAll(s, 'empty', empty, [3], 0, 0, 0, MAX_RUNS);
    sayNear(s, 'empty', empty, 0, 0, 0, undefined, 'none');
  },
});

/* The cell size is a constructor argument nobody passes; keep it honest at
 * 8, 1 and an explicit undefined (the default) over the same field. */
cases.push({
  id: 'field-cell-sizes',
  run: (s) => {
    const list = [[OB_POLE, 3, 5, -2, 0, 1, 0, 5], [OB_BAR, -6, 7, 9, 0.8, 0, 0.6, 6], [OB_POLE, 20, 5, 20, 0, 1, 0, 3]];
    for (const cell of [undefined, 8, 1]) {
      const f = fieldOf(list, cell).build();
      sayField(s, `cell ${cell}`, f);
      const rng = seeded(0xce11 + (cell || 0));
      probe(s, `cell ${cell}`, f, pointsAround(rng, f, 12, cell || 16), rng);
    }
  },
});

/* The fields the checks hand to the recogniser, probed: score-selftest's
 * bar and pole, its ring of twelve posts under a bar, three stacked bars,
 * a bar with one and with three poles beside it, the short post;
 * trick-sweep's bar along several axes and its pole; orbit-check's streets
 * of eighty poles. */
const RING = [[OB_BAR, 0, 6, 0, 1, 0, 0, 8]];
for (let i = 0; i < 12; i += 1) {
  const a = (i / 12) * TURN;
  RING.push([OB_POLE, Math.cos(a) * 2.2, 6 - 4, Math.sin(a) * 2.2, 0, 1, 0, 3]);
}
const STREET = (spacing) => Array.from({ length: 80 }, (_, i) => [OB_POLE, i * spacing, 6, 6, 0, 1, 0, 6]);
const AXES = [[1, 0, 0], [0, 0, 1], [0.7071067811865476, 0, 0.7071067811865476], [0.9, 0.1, 0.3], [-1, 0, 0],
  [0.99, 0.141, 0]];
const HAND_FIELDS = [
  ['selftest-bar', [[OB_BAR, 0, 6, 0, 1, 0, 0, 8]]],
  ['selftest-pole', [[OB_POLE, 0, 6, 0, 0, 1, 0, 5]]],
  ['selftest-ring', RING],
  ['selftest-stack', [[OB_BAR, 0, 6, 0, 1, 0, 0, 8], [OB_BAR, 0, 4.9, 0, 1, 0, 0, 8], [OB_BAR, 0, 7.1, 0, 1, 0, 0, 8]]],
  ['selftest-bar-pole', [[OB_BAR, 0, 6, 0, 1, 0, 0, 8], [OB_POLE, 3, 6, 3, 0, 1, 0, 5]]],
  ['selftest-bar-poles', [[OB_BAR, 0, 6, 0, 1, 0, 0, 8], [OB_POLE, 3, 6, 3, 0, 1, 0, 5], [OB_POLE, -3, 6, -3, 0, 1, 0, 5],
    [OB_POLE, 5, 6, -2, 0, 1, 0, 5]]],
  ['selftest-short', [[OB_POLE, 0, 1.3, 0, 0, 1, 0, 1.3]]],
  ['sweep-pole', [[OB_POLE, 0, 8, 0, 0, 1, 0, 8]]],
  ...AXES.map((a, i) => [`sweep-bar-${i}`, [[OB_BAR, 0, 8, 0, ...a, 8]]]),
  ['orbit-street-15', STREET(15)],
  ['orbit-street-26', STREET(26)],
];
HAND_FIELDS.forEach(([name, list], n) => {
  cases.push({
    id: `field-${name}`,
    run: (s) => {
      const f = fieldOf(list).build();
      sayField(s, name, f);
      const rng = seeded(0xf1e1d + n);
      probe(s, name, f, pointsAround(rng, f, list.length > 20 ? 3 : 40), rng);
    },
  });
});

/* Seeded fields of every sort a caller could add: both kinds, arbitrary
 * and unnormalised directions, halves from tiny to long, clustered so
 * buckets hold many and distances tie, with an odd kind now and then. */
for (let n = 0; n < 12; n += 1) {
  cases.push({
    id: `field-seeded-${n}`,
    run: (s) => {
      const rng = seeded(0xab5e + n * 7919);
      const f = new ObstacleField();
      const spread = rng.pick([6, 30, 120]);
      const count = rng.int(1, 40);
      for (let k = 0; k < count; k += 1) {
        const kind = rng.chance(0.05) ? 2 : rng.pick([OB_POLE, OB_BAR]);
        let d;
        if (kind === OB_POLE && rng.chance(0.8)) d = [0, 1, 0];
        else if (rng.chance(0.3)) d = rng.pick(AXES);
        else {
          d = [rng.range(-1, 1), rng.range(-0.3, 0.3), rng.range(-1, 1)];
          if (rng.chance(0.7)) {
            const l = Math.hypot(...d);
            d = d.map((v) => v / l);
          }
        }
        const snap = (v) => (rng.chance(0.3) ? Math.round(v) : v);
        f.add(kind, snap(rng.range(-spread, spread)), snap(rng.range(0, 12)), snap(rng.range(-spread, spread)),
          ...d, rng.pick([0.5, 1.3, 2.5, 3, 5, 8, rng.range(0.1, 20)]));
      }
      sayField(s, 'seeded', f);
      f.build();
      probe(s, 'seeded', f, pointsAround(rng, f, 6), rng);
      /* A negative max throws the engine's RangeError, but only once there
       * is a hit to truncate after. */
      const o = f.items[0];
      sayNearAll(s, 'negative max', f, [], o.cx, o.cy, o.cz, -1);
      sayNearAll(s, 'negative max far', f, [], o.cx + 5000, o.cy, o.cz, -1);
    },
  });
}

/* ---------------------------------------------------------------- sameAxis */

cases.push({
  id: 'sameaxis-fixed',
  run: (s) => {
    const a = { kind: OB_BAR, cx: 0, cy: 6, cz: 0, dx: 1, dy: 0, dz: 0, half: 4 };
    const b = { kind: OB_BAR, cx: 9, cy: 6, cz: 0, dx: 1, dy: 0, dz: 0, half: 4 };
    const c = { kind: OB_BAR, cx: 0, cy: 6, cz: 6, dx: 1, dy: 0, dz: 0, half: 4 };
    const d = { kind: OB_BAR, cx: 0, cy: 6, cz: 0, dx: 0, dy: 0, dz: 1, half: 4 };
    const e = { kind: OB_BAR, cx: 0, cy: 6.75, cz: 0, dx: 1, dy: 0, dz: 0 };
    const e2 = { kind: OB_BAR, cx: 3, cy: 6.750000000000001, cz: 0, dx: 1, dy: 0, dz: 0 };
    const t = { kind: OB_BAR, cx: 10, cy: 6, cz: 0, dx: 0.99, dy: 0, dz: Math.sqrt(1 - 0.99 * 0.99) };
    const dot = { kind: OB_BAR, cx: 5, cy: 6, cz: 0, dx: 0.985, dy: 0, dz: Math.sqrt(1 - 0.985 * 0.985) };
    const dotUnder = { kind: OB_BAR, cx: 5, cy: 6, cz: 0, dx: 0.9849999999999999, dy: 0, dz: 0.17 };
    const back = { kind: OB_BAR, cx: -20, cy: 6, cz: 0.5, dx: -1, dy: 0, dz: 0 };
    const pole = { kind: OB_POLE, cx: 0, cy: 6, cz: 0, dx: 1, dy: 0, dz: 0 };
    const nan = { kind: OB_BAR, cx: 0, cy: 6, cz: 0, dx: NaN, dy: 0, dz: 0 };
    const nanCentre = { kind: OB_BAR, cx: NaN, cy: 6, cz: 0, dx: 1, dy: 0, dz: 0 };
    const pairs = {
      ab: [a, b], ac: [a, c], ad: [a, d], ae: [a, e], ae2: [a, e2], at: [a, t], ta: [t, a], adot: [a, dot],
      dota: [dot, a], adotUnder: [a, dotUnder], aback: [a, back], backa: [back, a], apole: [a, pole],
      polea: [pole, a], aa: [a, a], nannan: [nan, nan], anan: [a, nan], nana: [nan, a], acentre: [a, nanCentre],
      anull: [a, null], nulla: [null, a], aundef: [a, undefined], zeroa: [0, a], afalse: [a, false],
      nullnull: [null, null], kindless: [{ cx: 0, cy: 0, cz: 0, dx: 1, dy: 0, dz: 0 }, { cx: 1, cy: 0, cz: 0, dx: 1, dy: 0, dz: 0 }],
      string: [{ ...a, kind: '1' }, a],
    };
    for (const [k, [p, q]] of Object.entries(pairs)) s.call(`sameAxis ${k}`, () => sameAxis(p, q));
  },
});

/* Seeded pairs straddling both thresholds: directions near the dot limit
 * and centres near the 0.75 m line distance, of both kinds and signs. */
for (let n = 0; n < 4; n += 1) {
  cases.push({
    id: `sameaxis-seeded-${n}`,
    run: (s) => {
      const rng = seeded(0x5a3e + n * 104729);
      for (let k = 0; k < 400; k += 1) {
        const th = rng.range(0, TURN);
        const tilt = rng.range(-0.3, 0.3);
        const a = {
          kind: rng.pick([OB_POLE, OB_BAR]), cx: rng.range(-50, 50), cy: rng.range(0, 10), cz: rng.range(-50, 50),
          dx: Math.cos(th) * Math.cos(tilt), dy: Math.sin(tilt), dz: Math.sin(th) * Math.cos(tilt),
        };
        const off = rng.range(0, 0.25);
        const sign = rng.chance(0.3) ? -1 : 1;
        const b = {
          kind: rng.chance(0.9) ? a.kind : 1 - a.kind,
          dx: sign * (a.dx + rng.range(-off, off)),
          dy: sign * (a.dy + rng.range(-off, off)),
          dz: sign * (a.dz + rng.range(-off, off)),
        };
        if (rng.chance(0.6)) {
          const l = Math.hypot(b.dx, b.dy, b.dz);
          b.dx /= l;
          b.dy /= l;
          b.dz /= l;
        }
        const along = rng.range(-30, 30);
        const p = rng.range(0, 1.2);
        b.cx = a.cx + a.dx * along + p * rng.range(-1, 1);
        b.cy = a.cy + a.dy * along + p * rng.range(-1, 1);
        b.cz = a.cz + a.dz * along + p * rng.range(-1, 1);
        s.say(`pair ${k}`, [a, b, sameAxis(a, b), sameAxis(b, a)]);
      }
    },
  });
}

/* ---------------------------------------------------------------- derive, plain fixtures */

/* score-selftest's six boxes (spec 7.4), as the selftest asks, with no
 * groundAt and with groundAt left out of the call, then the buried and low
 * boxes, null, an empty object and a fixture with an empty fbox. */
const SELFTEST_BOXES = {
  fbox: [1, 1, 1, 1, 1, 1],
  fax: [0, 10, 30, 50, 70, 90],
  fay: [0, 1.5, 0, 0, -60, 0.4],
  faz: [0, 0, 0, 0, 0, 0],
  fbx: [0.16, 28.4, 38, 90, 70.7, 92],
  fby: [4.2, 1.6, 9, 0.14, 0.2, 0.5],
  fbz: [0.16, 0.1, 0.4, 6, 0.7, 3],
};
cases.push({
  id: 'derive-selftest',
  run: (s) => {
    sayDerive(s, 'boxes', SELFTEST_BOXES, () => 0);
    sayDerive(s, 'boxes null', SELFTEST_BOXES, null);
    sayDerive(s, 'boxes undefined', SELFTEST_BOXES, undefined);
    sayDerive(s, 'boxes one argument', SELFTEST_BOXES, undefined, true);
    sayDerive(s, 'boxes ground 1', SELFTEST_BOXES, () => 1);
    sayDerive(s, 'boxes ground -2', SELFTEST_BOXES, () => -2);
    sayDerive(s, 'boxes ground NaN', SELFTEST_BOXES, () => NaN);
    sayDerive(s, 'boxes ground undefined', SELFTEST_BOXES, () => undefined);
    sayDerive(s, 'boxes ground fromY', SELFTEST_BOXES, (x, z, fromY) => fromY);
    sayDerive(s, 'buried', { fbox: [1], fax: [0], fay: [-60], faz: [0], fbx: [0.7], fby: [0.2], fbz: [0.7] }, () => 0);
    sayDerive(s, 'low', { fbox: [1], fax: [0], fay: [0.4], faz: [0], fbx: [8], fby: [0.5], fbz: [0.1] }, () => 0);
    for (const [k, v] of [['null', null], ['undefined', undefined], ['empty', {}], ['fbox null', { fbox: null }],
      ['fbox empty', { fbox: [] }], ['zero', 0]]) {
      const f = sayDerive(s, k, v, () => 0);
      if (f) {
        sayNearAll(s, k, f, [9], 0, 0, 0, MAX_RUNS);
        sayNear(s, k, f, 0, 0, 0, undefined, 'none');
      }
    }
  },
});

/* Boxes on every threshold, met exactly and just missed: pole footprint
 * 0.9 and height 2.5, bar length 2, thickness 0.8, height 0.8, clearance
 * 1.5, a height of exactly zero and below it, the ground clamping the base
 * up, a box along z (whose direction x is -0, spec 7.6), a square plan, and
 * fbox values other than 1 that still mean an axis aligned box. Each box
 * alone, so the ids and calls point at one threshold. */
const UP = (v) => v + Math.abs(v) * 2.220446049250313e-16;
const BOXES = [
  ['pole foot 0.9', [0, 0, 0, 0.9, 2.5, 0.5]],
  ['pole foot over', [0, 0, 0, UP(0.9), 3, 0.5]],
  ['pole height 2.5', [0, 0, 0, 0.2, 2.5, 0.2]],
  ['pole height under', [0, 0, 0, 0.2, 2.4999999999999996, 0.2]],
  ['pole tall wide', [0, 0, 0, 0.9, 40, 0.9]],
  ['bar along x', [0, 2, 0, 2, 2.8, 0.8]],
  ['bar exact', [0, 1, 0, 2, 1.8, 0.8], -0.5],
  ['bar thin over', [0, 2, 0, 2, 2.5, UP(0.8)]],
  ['bar short', [0, 2, 0, 1.9999999999999998, 2.5, 0.5]],
  ['bar tall', [0, 2, 0, 4, UP(2.8), 0.5]],
  ['bar clear 1.5', [0, 1.5, 0, 6, 1.7, 0.2]],
  ['bar clear under', [0, 1.4999999999999998, 0, 6, 1.7, 0.2]],
  ['bar along z', [0, 3, 0, 0.1, 3.1, 6]],
  ['bar along z negative', [-5, 3, -9, -4.5, 3.1, -1]],
  ['square plan', [0, 3, 0, 2, 3.5, 2]],
  ['square small', [0, 0, 0, 0.5, 6, 0.5]],
  ['height zero', [0, 2, 0, 0.2, 2, 0.2]],
  ['height negative', [0, 3, 0, 0.2, 2, 0.2]],
  ['ground over top', [0, 0, 0, 0.2, 4, 0.2], 5],
  ['ground clamps base', [0, -10, 0, 0.2, 4, 0.2], 1],
  ['ground clamps to zero height', [0, 0, 0, 0.2, 4, 0.2], 4],
  ['ground lifts bar clearance', [0, 2, 0, 5, 2.5, 0.3], 0.6],
  ['ground NaN', [0, 0, 0, 0.2, 4, 0.2], NaN],
  ['inverted x', [1, 0, 0, 0.8, 4, 0.2]],
  ['NaN corner', [NaN, 0, 0, 0.2, 4, 0.2]],
];
cases.push({
  id: 'derive-box-thresholds',
  run: (s) => {
    for (const [name, [ax, ay, az, bx, by, bz], ground = 0] of BOXES) {
      for (const fbox of [1, 3, true, -1]) {
        const f = sayDerive(s, `${name} fbox ${fbox}`, {
          fbox: [fbox], fax: [ax], fay: [ay], faz: [az], fbx: [bx], fby: [by], fbz: [bz],
        }, () => ground);
        if (f && f.count) s.say(`${name} fbox ${fbox} dx is -0`, Object.is(f.items[0].dx, -0));
      }
    }
  },
});

/* Turned boxes as plain fixtures: the plan sides come from u and w, the
 * centre from the world box, and a bar runs along u or along w = (-uz,
 * ux), with an unnormalised frame kept as stored. The frame arrays are read
 * only by a turned bar, so a turned pole without them derives and a
 * turned bar without them throws. */
cases.push({
  id: 'derive-turned-plain',
  run: (s) => {
    const T = (u0, u1, w0, w1, y0, y1, ux, uz, box = [-3, -3, 3, 3]) => ({
      fbox: [2], fax: [box[0]], fay: [y0], faz: [box[1]], fbx: [box[2]], fby: [y1], fbz: [box[3]],
      fu0: [u0], fu1: [u1], fw0: [w0], fw1: [w1], fux: [ux], fuz: [uz],
    });
    const list = [
      ['along u', T(0, 5, 0, 0.4, 2, 2.4, 0.6, 0.8)],
      ['along w', T(0, 0.2, 0, 5, 2, 2.4, 0.6, 0.8)],
      ['square', T(0, 3, 0, 3, 2, 2.4, 0.6, 0.8)],
      ['pole', T(0, 0.3, 0, 0.3, 0, 5, 0.6, 0.8)],
      ['unnormalised', T(-2, 2, -0.1, 0.1, 3, 3.5, 3, 4)],
      ['negative u', T(0, 5, 0, 0.4, 2, 2.4, -0.6, -0.8)],
      ['axis u', T(0, 5, 0, 0.4, 2, 2.4, 1, 0)],
      ['axis w', T(0, 0.4, 0, 5, 2, 2.4, 1, 0)],
      ['axis w zero', T(0, 0.4, 0, 5, 2, 2.4, 0, 1)],
      ['low', T(0, 5, 0, 0.4, 1, 1.4, 0.6, 0.8)],
      ['wide', T(0, 5, 0, 1, 2, 2.4, 0.6, 0.8)],
      ['world box differs', T(0, 0.3, 0, 0.3, 0, 5, 0.6, 0.8, [10, 20, 13, 29])],
    ];
    for (const [name, c] of list) sayDerive(s, name, c, () => 0);
    const strip = (c, keys) => Object.fromEntries(Object.entries(c).filter(([k]) => !keys.includes(k)));
    sayDerive(s, 'pole without frame', strip(list[3][1], ['fux', 'fuz']), () => 0);
    sayDerive(s, 'bar without frame', strip(list[0][1], ['fux', 'fuz']), () => 0);
    sayDerive(s, 'turned without extents', strip(list[0][1], ['fu0', 'fu1', 'fw0', 'fw1']), () => 0);
    sayDerive(s, 'axis box without extents', { ...strip(list[0][1], ['fu0', 'fu1', 'fw0', 'fw1']), fbox: [1] }, () => 0);
  },
});

/* Capsules as plain fixtures, so every threshold can be met to the bit:
 * uprightness at the pole floor 0.9 and at the bar ceiling, which is
 * 1 - 0.9 = 0.09999999999999998 and not 0.1 (one capsule here has an
 * uprightness of exactly 0.1, which must not be a bar), thickness 0.8 and
 * 0.9, lengths 2 and 2.5, clearance 1.5 with the lower end on either side,
 * the degenerate length 1e-6, the canopy skip, and the throws when fkind
 * or fr is missing (and the cases where they are never read). */
function capsules(list) {
  const c = {
    fbox: [], fax: [], fay: [], faz: [], fbx: [], fby: [], fbz: [], fr: [], fkind: [],
  };
  for (const [a, b, r, kind = 1] of list) {
    c.fbox.push(0);
    c.fax.push(a[0]);
    c.fay.push(a[1]);
    c.faz.push(a[2]);
    c.fbx.push(b[0]);
    c.fby.push(b[1]);
    c.fbz.push(b[2]);
    c.fr.push(r);
    c.fkind.push(kind);
  }
  return c;
}
const CANOPY = KINDS.indexOf('canopy');
cases.push({
  id: 'derive-capsule-thresholds',
  run: (s) => {
    const one = (name, a, b, r, kind, ground = 0) => sayDerive(s, name, capsules([[a, b, r, kind]]), () => ground);
    one('bar upright exactly 0.1', [0, 3, 0], [0.99498743710662, 3.1, 0], 0.05);
    one('bar upright at ceiling', [0, 3, 0], [0.9949874371066202, 3.1, 0], 0.05);
    for (let k = -6; k <= 6; k += 1) {
      const ex = 0.99498743710662 + k * 1.1102230246251565e-16;
      one(`bar upright sweep ${k}`, [0, 3, 0], [ex * 3, 3.3, 0], 0.05);
      const px = Math.sqrt(0.19) + k * 5.551115123125783e-17;
      one(`pole upright sweep ${k}`, [0, 0, 0], [px * 4, 3.6, 0], 0.2);
    }
    one('pole thick 0.9', [0, 0, 0], [0, 4, 0], 0.45);
    one('pole thick over', [0, 0, 0], [0, 4, 0], 0.45000000000000007);
    one('pole len 2.5', [0, 1, 0], [0, 3.5, 0], 0.1);
    one('pole len under', [0, 1, 0], [0, 3.4999999999999996, 0], 0.1);
    one('pole upside down', [0, 5, 0], [0, 1, 0], 0.1);
    one('pole leaning', [0, 0, 0], [1, 6, -0.5], 0.1);
    one('fat upright', [0, 0, 0], [0, 6, 0], 0.5);
    one('fat upright short bar', [0, 3, 0], [0, 3, 2.2], 0.45);
    one('bar thick 0.8', [0, 3, 0], [4, 3, 0], 0.4);
    one('bar thick over', [0, 3, 0], [4, 3, 0], 0.4000000000000001);
    one('bar len 2', [0, 3, 0], [0, 3, 2], 0.1);
    one('bar len under', [0, 3, 0], [0, 3, 1.9999999999999998], 0.1);
    one('bar clear 1.5', [0, 1.75, 0], [4, 1.75, 0], 0.25);
    one('bar clear under', [0, 1.75, 0], [4, 1.75, 0], 0.25000000000000006);
    one('bar low end a', [0, 1.7, 0], [4, 2, 0.3], 0.1);
    one('bar low end b', [4, 2, 0.3], [0, 1.7, 0], 0.1);
    one('bar ground', [0, 3, 0], [4, 3.2, 0], 0.1, 1.4);
    one('bar ground too high', [0, 3, 0], [4, 3.2, 0], 0.1, 1.5);
    one('bar ground NaN', [0, 3, 0], [4, 3.2, 0], 0.1, NaN);
    one('diagonal neither', [0, 0, 0], [3, 3, 0], 0.1);
    one('degenerate', [5, 3, 5], [5, 3, 5], 0.1);
    one('len 1e-6', [0, 3, 0], [1e-6, 3, 0], 0.1);
    one('canopy pole', [0, 0, 0], [0, 4, 0], 0.2, CANOPY);
    one('canopy bar', [0, 3, 0], [4, 3, 0], 0.1, CANOPY);
    one('kind past the table', [0, 0, 0], [0, 4, 0], 0.2, 99);
    one('kind undefined', [0, 0, 0], [0, 4, 0], 0.2, undefined);
    one('NaN end', [0, 0, 0], [NaN, 4, 0], 0.2);
    one('NaN radius', [0, 0, 0], [0, 4, 0], NaN);
    for (const fbox of [0, false, null, undefined, '']) {
      const c = capsules([[[0, 0, 0], [0, 4, 0], 0.1]]);
      c.fbox = [fbox];
      sayDerive(s, `fbox ${String(fbox)} is a capsule`, c, () => 0);
    }
    const strip = (c, key) => {
      const out = { ...c };
      delete out[key];
      return out;
    };
    sayDerive(s, 'no fkind', strip(capsules([[[0, 0, 0], [0, 4, 0], 0.1]]), 'fkind'), () => 0);
    sayDerive(s, 'no fkind degenerate', strip(capsules([[[0, 3, 0], [9.9e-7, 3, 0], 0.1]]), 'fkind'), () => 0);
    sayDerive(s, 'no fkind len 1e-6', strip(capsules([[[0, 3, 0], [1e-6, 3, 0], 0.1]]), 'fkind'), () => 0);
    sayDerive(s, 'no fr', strip(capsules([[[0, 0, 0], [0, 4, 0], 0.1]]), 'fr'), () => 0);
    sayDerive(s, 'no fr canopy', strip(capsules([[[0, 0, 0], [0, 4, 0], 0.1, CANOPY]]), 'fr'), () => 0);
    sayDerive(s, 'boxes have no capsule arrays', SELFTEST_BOXES, () => 0);
  },
});

/* ---------------------------------------------------------------- derive, real Colliders */

/* orbit-check's mast as it builds it: four legs and a head deck, with the
 * ground hint (the legs are poles) and without it (they vanish), spec 7.5. */
const TOWER = { x: 96, z: 160, half: 1.5, leg: 0.16, h: 34, ground: 0.45, deck: 34.75 };
function towerColliders() {
  const c = new Colliders();
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      c.addBox('wall', TOWER.x + sx * TOWER.half - TOWER.leg, TOWER.ground, TOWER.z + sz * TOWER.half - TOWER.leg,
        TOWER.x + sx * TOWER.half + TOWER.leg, TOWER.ground + TOWER.h, TOWER.z + sz * TOWER.half + TOWER.leg);
    }
  }
  c.addBox('wall', TOWER.x - 1.85, TOWER.deck - 0.3, TOWER.z - 1.85, TOWER.x + 1.85, TOWER.deck, TOWER.z + 1.85);
  c.build();
  return c;
}
cases.push({
  id: 'world-orbit-tower',
  run: (s) => {
    const c = towerColliders();
    const hinted = sayDerive(s, 'hinted', c, (x, z, fromY) => (
      fromY !== undefined && fromY < TOWER.deck ? TOWER.ground + 0.3 : TOWER.deck));
    sayDerive(s, 'unhinted', c, () => TOWER.deck);
    sayDerive(s, 'null ground', c, null);
    const rng = seeded(0x70e7);
    probe(s, 'hinted', hinted, pointsAround(rng, hinted, 25), rng);
  },
});

/* The worlds flightrig's buildWorld makes for the checks, through
 * buildWorld itself so the derive call is the checks' own: path-check's
 * rail and post, wall-check's wall, orbit-check's mast and its street of
 * eight posts. */
const LEG_PARTS = [];
for (const sx of [-1, 1]) {
  for (const sz of [-1, 1]) {
    LEG_PARTS.push({
      kind: 'box', material: 'wall',
      x0: 96 + sx * 1.5 - 0.16, y0: 0.45, z0: 160 + sz * 1.5 - 0.16,
      x1: 96 + sx * 1.5 + 0.16, y1: 0.45 + 34, z1: 160 + sz * 1.5 + 0.16,
    });
  }
}
const WORLDS = [
  ['path-check', [
    { kind: 'capsule', material: 'obstacle', ax: -5, ay: 6.3, az: 0, bx: 5, by: 6.3, bz: 0, r: 0.12 },
    { kind: 'box', material: 'wall', x0: 40 - 0.16, y0: 0, z0: -0.16, x1: 40 + 0.16, y1: 12, z1: 0.16 },
  ], 0],
  ['wall-check', [{ kind: 'box', material: 'wall', x0: 30, y0: 0, z0: -6, x1: 31.5, y1: 8, z1: 6 }], 0],
  ['orbit-mast', LEG_PARTS, 0.45],
  ['orbit-street', Array.from({ length: 8 }, (_, i) => ({
    kind: 'box', material: 'wall', x0: 10 + i * 8 - 0.16, y0: 0, z0: -0.16, x1: 10 + i * 8 + 0.16, y1: 6, z1: 0.16,
  })), 0],
];
WORLDS.forEach(([name, parts, groundY], n) => {
  cases.push({
    id: `world-${name}`,
    run: (s) => {
      const w = buildWorld(parts, deriveObstacles, groundY);
      sayField(s, name, w.field);
      /* And the same colliders with the call logged, which buildWorld's
       * own ground function cannot show. */
      sayDerive(s, `${name} logged`, w.colliders, () => groundY);
      const rng = seeded(0x3071d + n);
      probe(s, name, w.field, pointsAround(rng, w.field, 30), rng);
    },
  });
});

/* The spec's mixed set (7.8): a canopy capsule, a leaning tree, a sloped
 * capsule rail, a degenerate capsule and three turned boxes. */
cases.push({
  id: 'world-mixed',
  run: (s) => {
    const c = new Colliders();
    c.add('canopy', 0, 0, 0, 0, 4, 0, 0.2);
    c.add('tree', 10, 0, 0, 10.5, 4, 0, 0.2);
    c.add('obstacle', 20, 3, 0, 24, 3.3, 3, 0.1);
    c.add('obstacle', 30, 3, 0, 30, 3, 0, 0.1);
    c.addTurnedBox('wall', 3, 4, 0, 5, 2, 2.4, 10, 10.2);
    c.addTurnedBox('wall', 3, 4, 0, 0.2, 2, 2.4, 10, 15);
    c.addTurnedBox('wall', 3, 4, 0, 0.3, 0, 5, 10, 10.3);
    c.build();
    const f = sayDerive(s, 'mixed', c, () => 0);
    sayDerive(s, 'mixed ground 1', c, () => 1);
    sayDerive(s, 'mixed null', c, null);
    const rng = seeded(0x313ed);
    probe(s, 'mixed', f, pointsAround(rng, f, 25), rng);
  },
});

/* Seeded real Colliders of every kind and shape a map registers: capsules
 * (every kind name, canopy among them), posts, spheres, boxes and turned
 * boxes, sized to land on and around the thresholds, with the Float32
 * storage and the frame's fround that a real Colliders adds. Some cases
 * then retire colliders (a retired one is sunk, not removed, and fails on
 * its own), stream a set in and place built gates, since a derive reads
 * every index the arrays hold. */
function seededColliders(rng, count) {
  const c = new Colliders();
  for (let k = 0; k < count; k += 1) {
    const x = rng.range(-120, 120);
    const z = rng.range(-120, 120);
    const y = rng.pick([0, 0, 0.45, 1.5, rng.range(-2, 8)]);
    const kind = rng.pick(KINDS);
    const shape = rng.int(0, 5);
    if (shape === 0) {
      const len = rng.pick([2, 2.5, 3, 6, rng.range(0.5, 20)]);
      const th = rng.range(0, TURN);
      const lean = rng.pick([0, 0, 0.05, 0.1, 0.3, 1.2, Math.PI / 2, rng.range(0, Math.PI / 2)]);
      const ex = Math.sin(lean) * Math.cos(th) * len;
      const ey = Math.cos(lean) * len;
      const ez = Math.sin(lean) * Math.sin(th) * len;
      c.add(kind, x, y, z, x + ex, y + ey, z + ez, rng.pick([0.05, 0.12, 0.4, 0.45, 0.6, rng.range(0.01, 1)]));
    } else if (shape === 1) {
      const lift = rng.pick([1.5, 2, 3, 5, rng.range(0, 8)]);
      const len = rng.pick([2, 4, 8, rng.range(1, 25)]);
      const th = rng.range(0, TURN);
      const dy = rng.pick([0, 0, 0.1, 0.3]);
      c.add(kind, x, lift, z, x + Math.cos(th) * len, lift + dy * len, z + Math.sin(th) * len,
        rng.pick([0.02, 0.1, 0.25, 0.4, rng.range(0.01, 0.6)]));
    } else if (shape === 2) {
      c.addPost(kind, x, z, y, y + rng.pick([2.5, 4, 6, rng.range(0, 12)]), rng.pick([0.08, 0.2, 0.45, 0.5]));
    } else if (shape === 3) {
      c.addSphere(kind, x, y + 2, z, rng.range(0.2, 3));
    } else if (shape === 4) {
      const w = rng.pick([0.16, 0.32, 0.9, 2, rng.range(0.1, 12)]);
      const d = rng.pick([0.1, 0.16, 0.8, rng.range(0.1, 12)]);
      const y0 = rng.pick([y, -60, 1.5, 2]);
      const h = rng.pick([0.1, 0.8, 2.5, 6, rng.range(0.05, 30)]);
      if (rng.chance(0.5)) c.addBox(kind, x, y0, z, x + w, y0 + h, z + d);
      else c.addBox(kind, x + d, y0 + h, z + w, x, y0, z);
    } else {
      const th = rng.range(0, TURN);
      const u0 = rng.range(-3, 0);
      const w0 = rng.range(-3, 0);
      const y0 = rng.pick([y, 1.5, 2, 2.5]);
      c.addTurnedBox(kind, Math.cos(th) * rng.pick([1, 3]), Math.sin(th) * rng.pick([1, 3]),
        u0, u0 + rng.pick([0.2, 0.9, 2, 5, rng.range(0.1, 10)]),
        y0, y0 + rng.pick([0.4, 0.8, 2.5, 5, rng.range(0.1, 10)]),
        w0, w0 + rng.pick([0.2, 0.8, 0.9, 3, rng.range(0.1, 10)]));
    }
  }
  return c;
}
for (let n = 0; n < 10; n += 1) {
  cases.push({
    id: `world-seeded-${n}`,
    run: (s) => {
      const rng = seeded(0xc011 + n * 65537);
      const c = seededColliders(rng, rng.int(5, 80));
      c.build();
      if (n % 3 === 1) {
        for (let k = 0; k < 4; k += 1) c.retire(rng.int(0, c.staticCount - 1));
      }
      if (n % 3 === 2) {
        const fill = c.streamFill();
        fill.addBox('wall', 3, 0, 3, 3.3, 5, 3.3);
        fill.add('obstacle', -8, 4, 2, 4, 4, 2, 0.1);
        fill.addTurnedBox('wall', 1, 1, 0, 6, 3, 3.3, 0, 0.3);
        while (!fill.step()) { /* the first fill runs to the end at once, as a map's does at load */ }
        c.setBuilt([{ kind: 'gate', ax: 10, ay: 0, az: 10, bx: 10, by: 3, bz: 10, r: 0.05 },
          { kind: 'gate', ax: 10, ay: 3, az: 10, bx: 12, by: 3, bz: 10, r: 0.05 }]);
      }
      const answer = rng.pick([() => 0, (x, z) => (x + z) * 0.01, (x, z, fromY) => (fromY > 2 ? 0.5 : 0)]);
      const f = sayDerive(s, 'seeded', c, answer);
      sayDerive(s, 'seeded null', c, null);
      probe(s, 'seeded', f, pointsAround(rng, f, 6), rng);
    },
  });
}

/* ---------------------------------------------------------------- derive, a real map */

/*
 * ITAIPU'S POWER LINES. Every full map is built in a browser (the map
 * builders import three, which the import map serves from a CDN), so the
 * only real map geometry a node script can build here, in CI, is what the
 * repository bakes from it: src/share/war/itaipu-wires.js holds 2676 real
 * conductor chords and src/share/war/itaipu-height.bin the map's real
 * heightfield. The town registers its chords as 'wire' capsules; the bake
 * keeps the ends and not the radius, so every chord is given a conductor's
 * (WIRE_R), and the bake cannot say which chords are earth wires.
 * Most become bars, the ground under each read from the real heightfield.
 * Derived on the real ground, on flat ground and with no ground function.
 */
/* town/power.js CONDUCTOR_R when this was recorded, written out rather than
 * imported so that retuning the town's wires does not fail this record. */
const WIRE_R = 0.018;
function itaipuWires() {
  const c = new Colliders();
  for (const span of ITAIPU_WIRES.spans) {
    for (let k = 1; k + 5 < span.length; k += 6) {
      c.add('wire', span[k], span[k + 1], span[k + 2], span[k + 3], span[k + 4], span[k + 5], WIRE_R);
    }
  }
  c.build();
  return c;
}
const ITAIPU = { colliders: null, floor: null };
function itaipu() {
  if (!ITAIPU.colliders) {
    ITAIPU.colliders = itaipuWires();
    ITAIPU.floor = loadHeight(readFileSync(ITAIPU_HEIGHT));
  }
  return ITAIPU;
}
cases.push({
  id: 'world-itaipu-wires-ground',
  run: (s) => {
    const { colliders, floor } = itaipu();
    s.say('colliders', colliders.fbox.length);
    const f = sayDerive(s, 'itaipu', colliders, (x, z) => floor.floorAt(x, z));
    const rng = seeded(0x17a1);
    const sample = { items: f.items.filter((_, i) => i % 37 === 0) };
    probe(s, 'itaipu', f, pointsAround(rng, sample, 4), rng);
  },
});
cases.push({
  id: 'world-itaipu-wires-flat',
  run: (s) => {
    const { colliders } = itaipu();
    sayDerive(s, 'flat', colliders, () => 0);
    sayDerive(s, 'none', colliders, null);
  },
});

goldenMain('obstacles:golden', FIXTURE, cases);
