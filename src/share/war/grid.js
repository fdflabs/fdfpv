/*
 * grid.js: which lights around Itaipu are on, from the war's own state.
 * The night raid (mission itaipu-4) draws the towns, the dam and the
 * switchyards lit (src/maps/itaipu/look/night.js); this file says, for
 * any room millisecond, how bright each district of them is, so a strike
 * that takes a unit, a gate or the yard off puts a part of the map out
 * where everyone can see it.
 *
 * ONLY THE ROOM'S STATE. Every input is something the room already sends
 * (edge/rooms/war.js): the view's `down`, the targets hit, and the room ms
 * of each hit, the `at` of its { op: 'dead', target, hit: true } record
 * (src/share/roomwar.js passes it on as a 'dead' event), or of the
 * { op: 'damage', down: true } event that lost it to what broke (a
 * 'damage' event). Nothing here is
 * random and nothing reads a clock: the level of a district at room ms t
 * is a function of those and t, so two screens asked at the same room ms
 * answer the same, and a screen that joins late answers what the others
 * do once their flicker is over. The rooms need no change for it.
 *
 * THE GRID, a game's simplification of the real one, kept to what the
 * map shows. The twenty units are the twenty intakes and their penstocks
 * (map.targets); a unit is lost when either is hit. The western ten feed
 * the right bank switchyard (yard-right, Paraguay's side, where
 * OpenStreetMap's 500 kV lines from the west of the powerhouse go) and
 * through it the Paraguayan towns; the eastern ten feed the Foz do Iguacu
 * substation and the Brazilian ones, as the lines from the east of the
 * powerhouse do. A side's capacity is its live units over ten, and nought
 * on the Paraguayan side once the yard is hit. Each town district has a
 * `keep`: it is lit while its side's capacity is at least that, so each
 * unit lost sheds one more district, as a grid's under frequency relays
 * shed load in steps, and a near town is shed early so a pilot at the
 * dam sees it go.
 *
 * The dam's own lights are station service and go out only where the
 * strike was: a quarter of the crest and powerhouse (five units) when one
 * of its units is lost, the spillway's when a gate is hit, the yard's
 * when the yard is. Station service lights go out everywhere only when
 * every unit is lost.
 *
 * Nothing comes back: the room never restores a target within a match
 * (war.js take), so a district dark stays dark until the next match, whose
 * view has another id and an empty `down`.
 *
 * THE CASCADE. The districts one hit puts out go one after another, the
 * strike's own first, then the towns in the order their side sheds them,
 * CASCADE_MS apart; each flickers for FLICKER_MS (a hashed on and off
 * every FLICKER_STEP_MS, dimmer and rarer as it goes) and is then dark. A
 * hit this screen heard of only through the view (it joined after) has no
 * time and is dark at once.
 *
 * POWER LINES. A struck line puts out the town district it feeds, from the
 * strike's room ms: createGrid().hear takes a { type: 'dead', why: 'wire',
 * at, p } event, the district being the town district nearest the strike:
 * the room's death of an attacker that flew into a line
 * (src/share/war/wires.js, edge/rooms/war.js onWire).
 *
 * DETERMINISM. Integer hashing (Math.imul) and + - * / only.
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

import AT from './itaipu-targets.js';

/* The units: twenty, west to east, the first ten Paraguay's side. */
export const UNITS = 20;
const SIDE_UNITS = UNITS / 2;
/* A quarter of the dam's lights, five units. */
const DAM_SECTION = 5;

export const CASCADE_MS = 700;
export const FLICKER_MS = 1800;
export const FLICKER_STEP_MS = 70;

/* A seed on the crest, between the intakes of a quarter's middle units
 * and their penstocks: the quarter's lights are the crest lamps and the
 * powerhouse below, which the Voronoi cell round it holds. */
function damSeed(q) {
  const k = q * DAM_SECTION + 2;
  const a = AT[`intake-${k}`].at;
  const b = AT[`penstock-${k}`].at;
  return [(a[0] + b[0]) / 2, (a[2] + b[2]) / 2];
}

/*
 * The districts, each the Voronoi cell of its seed `at` [x, z] (scene
 * metres; districtOf), and what feeds it:
 *
 *   bus 'py' | 'br'   a town on that side, lit while the side's capacity
 *                     is at least `keep`
 *   bus 'station'     the station's own: out when every unit is lost, or
 *                     by its own rule: `units` [first, count] out when one
 *                     of them is lost; `gates` out when a gate is hit;
 *                     `yard` out when the yard is hit
 *
 * `r` is the lit town's radius in metres, for the sky's glow over it and,
 * on a district outside the hero square (`ring`), the lights drawn for a
 * city the map does not build. The places: Hernandarias west of the
 * reservoir's foot, the Acaray end of Ciudad del Este in the hero's south
 * west corner, Foz do Iguacu's northern districts in its south east, and
 * past the hero Foz do Iguacu's and Ciudad del Este's centres, Presidente
 * Franco, Minga Guazu and Santa Terezinha de Itaipu, placed from their
 * coordinates on the map's UTM 21S frame (docs/ITAIPU-PLAN.md section 2).
 */
export const DISTRICTS = [
  { id: 'dam-0', at: damSeed(0), bus: 'station', units: [0, DAM_SECTION] },
  { id: 'dam-1', at: damSeed(1), bus: 'station', units: [5, DAM_SECTION] },
  { id: 'dam-2', at: damSeed(2), bus: 'station', units: [10, DAM_SECTION] },
  { id: 'dam-3', at: damSeed(3), bus: 'station', units: [15, DAM_SECTION] },
  { id: 'spillway', at: [-982, -1028], bus: 'station', gates: true },
  { id: 'yard', at: [-2176, -459], bus: 'station', yard: true },
  { id: 'right-dams', at: [-1600, -880], bus: 'station' },
  { id: 'left-dams', at: [1500, -1100], bus: 'station' },
  { id: 'canteiro', at: [-343, -22], bus: 'station' },
  { id: 'foz-yard', at: [4602, 4741], bus: 'station' },
  { id: 'hernandarias-w', at: [-4900, 600], bus: 'py', keep: 0.95, r: 900 },
  { id: 'minga-guazu', at: [-16718, 8974], bus: 'py', keep: 0.85, r: 2200, ring: true },
  { id: 'hernandarias-n', at: [-4500, -2900], bus: 'py', keep: 0.75, r: 1100 },
  { id: 'presidente-franco', at: [-3088, 14996], bus: 'py', keep: 0.65, r: 1800, ring: true },
  { id: 'ciudad-del-este', at: [-2387, 9545], bus: 'py', keep: 0.55, r: 3000, ring: true },
  { id: 'acaray', at: [-4300, 4300], bus: 'py', keep: 0.45, r: 900 },
  { id: 'hernandarias-s', at: [-4500, -1300], bus: 'py', keep: 0.35, r: 1000 },
  { id: 'hernandarias-far', at: [-9000, -2200], bus: 'py', keep: 0.25, r: 1800, ring: true },
  { id: 'vila-c', at: [2300, 2600], bus: 'br', keep: 0.95, r: 1000 },
  { id: 'santa-terezinha', at: [17341, 2165], bus: 'br', keep: 0.85, r: 1600, ring: true },
  { id: 'foz-north', at: [1000, 4200], bus: 'br', keep: 0.75, r: 1100 },
  { id: 'foz-do-iguacu', at: [174, 10322], bus: 'br', keep: 0.65, r: 3500, ring: true },
  { id: 'foz-north-west', at: [-500, 4500], bus: 'br', keep: 0.55, r: 700 },
  { id: 'foz-north-east', at: [3500, 4300], bus: 'br', keep: 0.4, r: 1000 },
];

/* The most districts the renderer's uniform arrays take. */
export const MAX_DISTRICTS = 32;
if (DISTRICTS.length > MAX_DISTRICTS) {
  throw new Error(`grid: ${DISTRICTS.length} districts, the renderer takes ${MAX_DISTRICTS}`);
}

const INDEX = new Map(DISTRICTS.map((d, i) => [d.id, i]));

/* The district by id, its index, or a loud error. */
export function districtIndex(id) {
  const i = INDEX.get(id);
  if (i === undefined) {
    throw new Error(`grid: no district ${id}`);
  }
  return i;
}

/* The district whose seed is nearest (x, z), among `only` if given (a
 * predicate on the district). Ties go to the lower index. */
export function districtOf(x, z, only = null) {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < DISTRICTS.length; i += 1) {
    const d = DISTRICTS[i];
    if (only && !only(d)) {
      continue;
    }
    const dx = x - d.at[0];
    const dz = z - d.at[1];
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD) {
      bestD = d2;
      best = i;
    }
  }
  return best;
}

const isTown = (d) => d.bus === 'py' || d.bus === 'br';

/* The unit a target id stops, or -1 (a gate, the yard). */
export function unitOf(target) {
  const m = /^(intake|penstock)-(\d+)$/.exec(target);
  return m ? Number(m[2]) : -1;
}

/*
 * When each district goes out: a Float64Array of room ms, the start of
 * its flicker (Infinity: lit; -Infinity: out since before this screen
 * heard). `hits` is [{ target, at }] (at may be -Infinity), `cuts` [{ at,
 * x, z }] struck lines. Hits are taken in order of at; the districts one
 * moment puts out are staggered CASCADE_MS apart, the strike's own first.
 */
export function darkFrom(hits, cuts = []) {
  const out = new Float64Array(DISTRICTS.length).fill(Infinity);
  const steps = [
    ...hits.map((h) => ({ at: h.at, target: h.target })),
    ...cuts.map((c) => ({ at: c.at, cut: districtOf(c.x, c.z, isTown) })),
  ].sort((a, b) => a.at - b.at);
  const lost = new Array(UNITS).fill(false);
  let yard = false;
  let gate = false;
  const cut = new Set();
  for (let s = 0; s < steps.length;) {
    const at = steps[s].at;
    for (; s < steps.length && steps[s].at === at; s += 1) {
      const st = steps[s];
      if (st.cut !== undefined) {
        cut.add(st.cut);
        continue;
      }
      const u = unitOf(st.target);
      if (u >= 0 && u < UNITS) {
        lost[u] = true;
      } else if (st.target === 'yard-right') {
        yard = true;
      } else if (/^gate-\d+$/.test(st.target)) {
        gate = true;
      }
    }
    const live = (a, n) => {
      let k = 0;
      for (let i = a; i < a + n; i += 1) {
        k += lost[i] ? 0 : 1;
      }
      return k;
    };
    const cap = {
      py: yard ? 0 : live(0, SIDE_UNITS) / SIDE_UNITS,
      br: live(SIDE_UNITS, SIDE_UNITS) / SIDE_UNITS,
    };
    const allLost = live(0, UNITS) === 0;
    /* What is out after this moment and was not before it: the station's
     * first, then each side's towns in the order they shed. */
    const fresh = [];
    DISTRICTS.forEach((d, i) => {
      if (out[i] !== Infinity) {
        return;
      }
      let dark;
      if (d.bus === 'station') {
        dark = allLost
          || (d.units && live(d.units[0], d.units[1]) < d.units[1])
          || (d.gates && gate)
          || (d.yard && yard);
      } else {
        dark = cut.has(i) || cap[d.bus] < d.keep - 1e-9;
      }
      if (dark) {
        fresh.push(i);
      }
    });
    const order = (i) => (DISTRICTS[i].bus === 'station' ? 2 : DISTRICTS[i].keep);
    fresh.sort((a, b) => order(b) - order(a) || a - b);
    fresh.forEach((i, rank) => {
      out[i] = at + rank * CASCADE_MS;
    });
  }
  return out;
}

/* A 32 bit hash of three integers, the same in every engine. */
function hash3(a, b, c) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/*
 * District i's brightness at room ms t, 0 to 1, out from `from` (its
 * entry in darkFrom): 1 before, a flicker for FLICKER_MS, then 0. The
 * flicker's steps are hashed from the district and the step's index from
 * `from`, so it is the same on every screen.
 */
export function levelAt(from, i, t) {
  if (from === -Infinity) {
    return 0;
  }
  if (!(t >= from)) {
    return 1;
  }
  const since = t - from;
  if (since >= FLICKER_MS) {
    return 0;
  }
  const k = Math.floor(since / FLICKER_STEP_MS);
  const h = hash3(i + 1, k, Math.floor(from) % 1000003);
  const u = since / FLICKER_MS;
  const keep = (1 - u) * (1 - u) * 0.85;
  if ((h & 0xffff) / 0x10000 >= keep) {
    return 0;
  }
  /* On, browned out: between 0.35 and 1. */
  return 0.35 + 0.65 * ((h >>> 16) / 0x10000);
}

/*
 * The client's tracker: hear() every event roomwar.js gives the shell,
 * then levels(view, t) each frame. Remembers the room ms of each hit and
 * each struck line for the match the view names, and forgets them when
 * the view names another.
 */
export function createGrid() {
  let match = null;
  /* target -> the room ms its hit was heard at. */
  let heard = new Map();
  let cuts = [];
  let key = '';
  let from = darkFrom([]);
  const levels = new Float32Array(DISTRICTS.length).fill(1);

  const forMatch = (id) => {
    if (id !== match) {
      match = id ?? null;
      heard = new Map();
      cuts = [];
      key = '';
      from = darkFrom([]);
    }
  };

  return {
    /* The shell's events from roomWar.takeEvents(), oldest first. */
    hear(events, view) {
      forMatch(view ? view.id : match);
      for (const e of events) {
        /* A target lost to what broke (edge/rooms/war.js strike) goes out
         * from that event, as a hit does. */
        if (e.type === 'damage' && e.down === true && e.target && !heard.has(e.target)) {
          heard.set(e.target, e.at);
          key = '';
          continue;
        }
        if (e.type !== 'dead') {
          continue;
        }
        if (e.why === 'wire' && Array.isArray(e.p)) {
          cuts.push({ at: e.at, x: e.p[0], z: e.p[2] });
          key = '';
        } else if (e.hit === true && e.target && !heard.has(e.target)) {
          heard.set(e.target, e.at);
          key = '';
        }
      }
    },
    /* When each district goes out (darkFrom) for this view. */
    from(view) {
      forMatch(view ? view.id : null);
      const down = view && Array.isArray(view.down) ? view.down : [];
      const k = `${down.join(',')}|${heard.size}|${cuts.length}`;
      if (k !== key) {
        key = k;
        const hits = down.map((target) => ({ target, at: heard.has(target) ? heard.get(target) : -Infinity }));
        from = darkFrom(hits, cuts);
      }
      return from;
    },
    /* Every district's level at room ms t, a Float32Array the caller
     * reads and does not keep (it is refilled on the next call). */
    levels(view, t) {
      const f = this.from(view);
      for (let i = 0; i < f.length; i += 1) {
        levels[i] = levelAt(f[i], i, t);
      }
      return levels;
    },
    /* For the checks: each district 'lit', 'flicker' or 'dark' at t. */
    state(view, t) {
      const f = this.from(view);
      const out = {};
      DISTRICTS.forEach((d, i) => {
        let s = 'flicker';
        if (f[i] === -Infinity || t - f[i] >= FLICKER_MS) {
          s = 'dark';
        } else if (!(t >= f[i])) {
          s = 'lit';
        }
        out[d.id] = s;
      });
      return out;
    },
  };
}
