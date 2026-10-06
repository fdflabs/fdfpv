/*
 * war-routes-check.js: every attacker of mission 1 clears the ground, the
 * water and the dam until its terminal run (docs/WARFARE-PLAN.md section
 * 4.2; src/share/war/missions/itaipu-1.js).
 *
 * For every wave, at 1 to 8 pilots (so every size the room can send), for
 * every attacker k of it and at no error and both ends of its spread, it
 * plans the attacker as the room does (routes.js planAgent, index.js
 * waveSize and waveTarget), on each route of a spawn's family and at
 * AZ_STEPS bearings across its azimuth window (src/share/war/stages.js),
 * and samples its pose every SAMPLE_MS against
 * the hunters' floor (src/share/war/itaipu-height.bin, warhunt.js
 * loadHeight: the higher of ground and water, with the dam in it):
 *
 *   flying kinds  at least MIN_CLEAR_M over the floor until the terminal
 *                 run: the last leg onto the target for a Striker or an
 *                 FPV, the dive for a Loiterer; a Scout has none, so all
 *                 of it, its circle and its way out, must clear
 *   boats         on water (the floor is the reservoir's 219.0 m) until
 *                 the last leg, which runs on to the upstream face
 *   hunters       born at least MIN_CLEAR_M over the floor (the room
 *                 steers them from there, over the same floor)
 *
 * and, the whole flight through, terminal run too, no attacker goes under
 * the reservoir's surface (WATER_Y, less SURFACE_TOL_M of rounding): one
 * may be lower than it only where it got there over lower ground, the
 * gorge below the dam. The terminal run is exempt from the floor above
 * because the floor is 40 m cells, the dam in it smeared 40 to 90 m out
 * over the water; the surface is exact. A Striker once ran its last leg
 * to a spillway gate's middle at 212.3 m and went into the water 130 m
 * short (bug-552ecdab), which the floor rule could not see.
 *
 * It prints each wave's lowest clearance before the terminal run and in
 * it, and how deep under the surface it goes.
 *
 * And the structures (src/share/war/damage.js's chunks: the dam's targets
 * and the switchyard's equipment): every attacker with a target, cut where
 * contact.js says it first meets one (as the room cuts it, its birth
 * record's `meet`), is outside every chunk's box grown by CONTACT_M (a
 * spillway leaf's where Free Flight's gates stand it), sampled every
 * CONTACT_SAMPLE_MS near a structure, until it goes off. Measured with
 * damage.js's chunkDistance, not contact.js's own slabs. Before contact.js
 * a Striker's last leg into the switchyard ran through tanks and bushings
 * for up to 27 m short of its aim point (the owner: "shahed should have
 * exploded by now").
 *
 * And the power lines in the attackers' way (src/share/war/wires.js): for
 * each mission at 1, 2, 4 and 8 pilots, at no error, every crossing of a
 * span low enough to strike, and the strikes a game that makes at
 * STRIKE_P (the first crossing whose draw is under it). Every crossing
 * must put the attacker within BAND_M above or below a chord of its span
 * and on it in plan, and an attacker given that crossing as its `wire`
 * must end there ('wire'), where its uncut flight is at that millisecond.
 * Exit 1 on any failure.
 *
 *   node scripts/war-routes-check.js
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

import { loadHeight } from '../edge/rooms/warhunt.js';
import { KIND, planAgent, poseAt } from '../src/share/war/routes.js';
import { waveSize, waveTarget } from '../src/share/war/missions/index.js';
import { MISSIONS } from '../src/share/war/missions/index.js';
import { idsMayBe } from '../src/share/war/stages.js';
import { BAND_M, STRIKE_P, wireCrossings } from '../src/share/war/wires.js';
import ITAIPU_WIRES from '../src/share/war/itaipu-wires.js';
import { CONTACT_M, contactAt } from '../src/share/war/contact.js';
import { chunkDistance } from '../src/share/war/damage.js';
import ITAIPU_CHUNKS from '../src/share/war/itaipu-chunks.js';
import { openAt } from '../src/share/war/hoist.js';
import { leafTurn, turnPoint, unturn } from '../src/share/war/leaf.js';

const MIN_CLEAR_M = 15;
const WATER_Y = 219;
const SURFACE_TOL_M = 0.01;
const SAMPLE_MS = 50;
const PILOTS = [1, 2, 3, 4, 5, 6, 7, 8];
/* The structures' check samples every CONTACT_SAMPLE_MS (under 0.3 m of
 * flight at a dive's 28 m/s, less than any chunk grown by CONTACT_M is
 * thick) and allows CONTACT_TOL_M into a grown box: the contact's ms is
 * floored, at most a millisecond's flight short. */
const CONTACT_SAMPLE_MS = 10;
const CONTACT_TOL_M = 0.05;
/* The sampler looks at every CONTACT_COARSE_MS first and samples a span
 * finely only where its first point is within CONTACT_REACH_M of some
 * structure's bounds: twice the fastest kind's speed over the span, so a
 * weave or a formation's closing cannot carry it further. */
const CONTACT_COARSE_MS = 250;
/* The plan cells, metres, the structures' chunks are filed in for it. */
const CHUNK_CELL = 16;
const CONTACT_REACH_M = 2 * Math.max(...Object.values(KIND).map((k) => Math.max(k.speed, k.dive ?? 0))) * CONTACT_COARSE_MS / 1000;
const STRUCTURES = { itaipu: ITAIPU_CHUNKS };

const floor = loadHeight(readFileSync(new URL('../src/share/war/itaipu-height.bin', import.meta.url)));

/* The room ms from which an attacker is on its terminal run, or Infinity
 * for one that has none. */
function terminalFrom(plan, kind) {
  if (kind === 'loiter') {
    return plan.end === 'arrive' ? plan.phases[plan.phases.length - 1].t0 : Infinity;
  }
  if (plan.end !== 'arrive') {
    return Infinity;
  }
  const path = plan.phases[0];
  const last = path.legs[path.legs.length - 1];
  return path.t0 + (last.s / path.speed) * 1000;
}

/* AZ_STEPS bearings across a spawn's azimuth window (stages.js az),
 * its ends included: the ground under a turned route is no simpler than
 * the route. */
const AZ_STEPS = 9;

/* Every attacker of a spawn to fly: each size, each place in the group,
 * the error's ends and none, each route of a family, each bearing of an
 * azimuth window: [n, k, err, route, az]. */
function variants(w, sizes) {
  const out = [];
  /* A working set's targets are any of its `from`, whatever n is: every
   * one of them is flown to (wavesOf). */
  const many = (n) => (w.anyOf ? Math.max(n, w.target.length) : n);
  const azs = Array.isArray(w.az) ? Array.from({ length: AZ_STEPS }, (_, i) => w.az[0] + ((w.az[1] - w.az[0]) * i) / (AZ_STEPS - 1)) : [undefined];
  for (const n of new Set(sizes)) {
    for (let k = 0; k < many(n); k += 1) {
      for (const err of w.spread ? [-w.spread, 0, w.spread] : [0]) {
        for (const route of [w.route].flat()) {
          for (const az of azs) {
            out.push([n, k, err, route, az]);
          }
        }
      }
    }
  }
  return out;
}

/* A mission's waves with every choice a seed may make laid out: one row a
 * kind (a list of kinds, or a mix's), each with every route it may fly (a
 * family, or a sector's, src/share/war/stages.js), and a working set's
 * target every target the set may be drawn from. */
function wavesOf(mission) {
  return mission.waves.flatMap((w) => {
    const kinds = w.mix ? w.mix.map((x) => x[0]) : [w.kind].flat();
    const routes = w.route && typeof w.route === 'object' && !Array.isArray(w.route)
      ? [w.route.sector].flat().flatMap((sec) => mission.sectors[sec])
      : [w.route].flat();
    const anyOf = Boolean(w.target && typeof w.target === 'object' && !Array.isArray(w.target));
    const target = anyOf ? idsMayBe(mission, w.target) : w.target;
    return kinds.map((kind) => ({
      ...w, kind, route: routes, target, anyOf,
    }));
  });
}

const routeName = (w) => [w.route].flat().join('|') + (Array.isArray(w.az) ? ' az' : '');

/* Each map's structures as { list: [{ id, hinge, lo, hi, chunks }] },
 * each one's axis-aligned bounds (its chunks' bounding spheres, as
 * written: a leaf's at rest) grown by CONTACT_M, for the structures'
 * check. */
const BOUNDS = {};
for (const [map, all] of Object.entries(STRUCTURES)) {
  const list = Object.entries(all).map(([id, st]) => {
    const r = st.chunks.map((ch) => Math.hypot(...ch.h) + CONTACT_M);
    const lo = [0, 1, 2].map((j) => Math.min(...st.chunks.map((ch, i) => ch.c[j] - r[i])));
    const hi = [0, 1, 2].map((j) => Math.max(...st.chunks.map((ch, i) => ch.c[j] + r[i])));
    return {
      id, hinge: st.frame.hinge ?? null, lo, hi, chunks: st.chunks,
    };
  });
  /* Every chunk filed in the CHUNK_CELL cells its bounding sphere grown
   * by CONTACT_M touches, as written (a leaf's at rest). */
  const cells = new Map();
  for (const s of list) {
    for (const [i, ch] of s.chunks.entries()) {
      const r = Math.hypot(...ch.h) + CONTACT_M;
      for (let a = Math.floor((ch.c[0] - r) / CHUNK_CELL); a <= Math.floor((ch.c[0] + r) / CHUNK_CELL); a += 1) {
        for (let b = Math.floor((ch.c[2] - r) / CHUNK_CELL); b <= Math.floor((ch.c[2] + r) / CHUNK_CELL); b += 1) {
          const key = `${a},${b}`;
          if (!cells.has(key)) {
            cells.set(key, []);
          }
          cells.get(key).push({ s, i, ch });
        }
      }
    }
  }
  BOUNDS[map] = { list, cells };
}
const cellOf = (p) => `${Math.floor(p[0] / CHUNK_CELL)},${Math.floor(p[2] / CHUNK_CELL)}`;
/* How far p is outside bounds b, 0 inside. */
function outside(b, p) {
  let s = 0;
  for (let j = 0; j < 3; j += 1) {
    const d = p[j] < b.lo[j] ? b.lo[j] - p[j] : p[j] > b.hi[j] ? p[j] - b.hi[j] : 0;
    s += d * d;
  }
  return Math.sqrt(s);
}

/* Point p as a structure's chunks are written: a leaf's moving chunks
 * (ch.m) at rest, so p taken back by the leaf's turn as Free Flight's
 * gates stand (the plans here carry no gate state); the rest as is. The
 * turn is the same at every room ms, so distances to the leaf keep. */
const FREE_TURN = new Map();
function restPoint(s, p) {
  if (!FREE_TURN.has(s.id)) {
    FREE_TURN.set(s.id, unturn(leafTurn(s.hinge, openAt(null, s.id, 0))));
  }
  return turnPoint(s.hinge, FREE_TURN.get(s.id), p);
}

/* How far p is from the nearest structure's bounds, its leaves where
 * they stand. */
function nearestBounds(map, p) {
  let d = Infinity;
  for (const s of BOUNDS[map]?.list ?? []) {
    d = Math.min(d, outside(s, p));
    if (s.hinge) {
      d = Math.min(d, outside(s, restPoint(s, p)));
    }
  }
  return d;
}

/* The chunk point p is inside (its box grown by CONTACT_M less
 * CONTACT_TOL_M, a leaf's where it stands), as `target#i kind`, or null:
 * measured with damage.js's chunkDistance, not contact.js's slabs. */
function insideStructure(map, p) {
  const all = BOUNDS[map];
  if (!all) {
    return null;
  }
  /* The chunks filed where p is, and for each leaf where p is in its
   * rest frame. */
  const seen = all.cells.get(cellOf(p)) ?? [];
  const moved = [];
  for (const s of all.list) {
    if (s.hinge) {
      const pr = restPoint(s, p);
      for (const c of all.cells.get(cellOf(pr)) ?? []) {
        if (c.s === s && c.ch.m) {
          moved.push({ ...c, q: pr });
        }
      }
    }
  }
  for (const c of [...seen.filter((x) => !(x.s.hinge && x.ch.m)).map((x) => ({ ...x, q: p })), ...moved]) {
    if (chunkDistance(c.ch, c.q) < CONTACT_M - CONTACT_TOL_M) {
      return `${c.s.id}#${c.i} ${c.ch.k}`;
    }
  }
  return null;
}

/* The first room ms before the plan ends at which it is inside a
 * structure, with where and what, or null. */
function firstInside(map, plan) {
  for (let c = plan.t0; c < plan.tEnd; c += CONTACT_COARSE_MS) {
    if (nearestBounds(map, poseAt(plan, c).p) > CONTACT_REACH_M) {
      continue;
    }
    const to = Math.min(c + CONTACT_COARSE_MS, plan.tEnd);
    for (let t = c; t < to; t += CONTACT_SAMPLE_MS) {
      const p = poseAt(plan, t).p;
      const inside = insideStructure(map, p);
      if (inside) {
        return { t, p: p.slice(), inside };
      }
    }
  }
  return null;
}

const failures = [];
let worstAll = Infinity;
/* The structures' check, over every mission: attackers planned, those
 * cut short at a structure, the furthest short of its aim point. */
const contact = { n: 0, met: 0, short: 0, where: null };
for (const mission of Object.values(MISSIONS)) {
  console.log(`mission ${mission.id}: ${wavesOf(mission).length} waves, 1 to 8 pilots, every attacker at err 0 and +-spread, every ${SAMPLE_MS} ms`);
  console.log('  wave  at   kind    route             n(1..8)          before terminal   in terminal   terminal m under water');
  for (const [i, w] of wavesOf(mission).entries()) {
    let before = Infinity;
    let inside = Infinity;
    let boatDry = 0;
    let termM = 0;
    let where = null;
    let wet = 0;
    let wetAt = null;
    const sizes = PILOTS.map((p) => waveSize(w, p));
    for (const [n, k, err, route, az] of variants(w, sizes)) {
      {
        {
          const agent = {
            id: 1, kind: w.kind, route, t0: 0, k, n, err, target: waveTarget(w, k), az,
          };
          const plan = planAgent(mission, agent);
          if (w.kind === 'hunter') {
            const p = poseAt(plan, 0).p;
            const c = p[1] - floor.floorAt(p[0], p[2]);
            if (c < before) {
              before = c;
              where = p;
            }
            continue;
          }
          if (agent.target != null) {
            const met = contactAt(mission.map, plan);
            const cut = met ? planAgent(mission, { ...agent, meet: met.t }) : plan;
            contact.n += 1;
            if (met) {
              contact.met += 1;
              const q = poseAt(cut, cut.tEnd).p;
              const aim = poseAt(plan, plan.tEnd).p;
              const short = Math.hypot(q[0] - aim[0], q[1] - aim[1], q[2] - aim[2]);
              if (short > contact.short) {
                contact.short = short;
                contact.where = `${mission.id} wave ${i + 1} ${w.kind} ${route} k ${k} of ${n} err ${err} onto ${met.target}#${met.chunk}`;
              }
              if (cut.end !== 'arrive' || cut.tEnd !== met.t) {
                failures.push(`${mission.id} wave ${i + 1} (${w.kind}, ${route}): given its contact at ${met.t} ms it ends ${cut.end} at ${cut.tEnd}`);
              }
            }
            const bad = firstInside(mission.map, cut);
            if (bad) {
              failures.push(`${mission.id} wave ${i + 1} (${w.kind}, ${route}, k ${k} of ${n}, err ${err}): inside ${bad.inside} at ${bad.t} ms, ${((cut.tEnd - bad.t) / 1000).toFixed(2)} s before it goes off, at (${bad.p.map((v) => v.toFixed(1)).join(', ')})`);
            }
          }
          const tt = terminalFrom(plan, w.kind);
          const end = Number.isFinite(plan.tEnd) ? plan.tEnd : 0;
          if (Number.isFinite(tt)) {
            termM = Math.max(termM, ((end - tt) / 1000) * (w.kind === 'loiter' ? KIND.loiter.dive : KIND[w.kind].speed));
          }
          /* Under the surface over lower ground (the gorge): allowed, and
           * carried on while it stays under. */
          let lowOver = false;
          for (let t = 0; t <= end; t += SAMPLE_MS) {
            const p = poseAt(plan, t).p;
            const f = floor.floorAt(p[0], p[2]);
            const c = p[1] - f;
            const under = p[1] < WATER_Y - SURFACE_TOL_M;
            lowOver = under && (lowOver || f < WATER_Y - SURFACE_TOL_M);
            if (under && !lowOver && WATER_Y - p[1] > wet) {
              wet = WATER_Y - p[1];
              wetAt = p.slice();
            }
            if (t < tt) {
              if (w.kind === 'boat') {
                boatDry = Math.max(boatDry, f - WATER_Y);
                if (f - WATER_Y > 0.01 && !where) {
                  where = p;
                }
              } else if (c < before) {
                before = c;
                where = p;
              }
            } else {
              inside = Math.min(inside, c);
            }
          }
        }
      }
    }
    const fmt = (v) => (Number.isFinite(v) ? `${v.toFixed(1)} m` : '-');
    const beforeText = w.kind === 'boat' ? `on water, ${boatDry.toFixed(2)} m dry` : fmt(before);
    console.log(`  ${String(i + 1).padStart(4)} ${String(w.at).padStart(4)}  ${w.kind.padEnd(7)} ${routeName(w).padEnd(17)} ${sizes.join(',').padEnd(16)} ${beforeText.padEnd(17)} ${fmt(inside).padEnd(13)} ${(termM ? termM.toFixed(0) : '-').padEnd(10)} ${wet ? `${wet.toFixed(1)} m` : '-'}`);
    if (wet) {
      failures.push(`${mission.id} wave ${i + 1} (${w.kind}, ${w.route}): ${wet.toFixed(1)} m under the reservoir's surface near (${wetAt.map((v) => v.toFixed(0)).join(', ')})`);
    }
    if (w.kind === 'boat') {
      if (boatDry > 0.01) {
        failures.push(`${mission.id} wave ${i + 1} (${w.kind}, ${w.route}): a boat is on ground ${boatDry.toFixed(2)} m over the water near (${where.map((v) => v.toFixed(0)).join(', ')})`);
      }
      continue;
    }
    worstAll = Math.min(worstAll, before);
    if (!(before >= MIN_CLEAR_M)) {
      failures.push(`${mission.id} wave ${i + 1} (${w.kind}, ${w.route}): ${before.toFixed(1)} m over the floor near (${where.map((v) => v.toFixed(0)).join(', ')}), under ${MIN_CLEAR_M} m`);
    }
  }
}
/* The chords of each span, for the crossings' check. */
const spanChords = new Map();
for (const [span, ...flat] of ITAIPU_WIRES.spans) {
  const list = [];
  for (let o = 0; o + 5 < flat.length; o += 6) {
    list.push(flat.slice(o, o + 6));
  }
  spanChords.set(span, list);
}

/* The plan distance from (x, z) to chord c, and the chord's height there. */
function onChord(c, x, z) {
  const vx = c[3] - c[0];
  const vz = c[5] - c[2];
  const l2 = vx * vx + vz * vz;
  const t = Math.max(0, Math.min(1, ((x - c[0]) * vx + (z - c[2]) * vz) / l2));
  return { d: Math.hypot(c[0] + vx * t - x, c[2] + vz * t - z), y: c[1] + (c[4] - c[1]) * t };
}

console.log('');
console.log(`power lines: crossings low enough to strike (within ${BAND_M} m), at no error, and the strikes a game at ${STRIKE_P} a crossing`);
for (const mission of Object.values(MISSIONS)) {
  const rows = [];
  for (const pilots of [1, 2, 4, 8]) {
    let attackers = 0;
    let crossings = 0;
    let strikes = 0;
    const waves = [];
    for (const [i, w] of wavesOf(mission).entries()) {
      const n = waveSize(w, pilots);
      let c = 0;
      for (let k = 0; k < n; k += 1) {
        attackers += 1;
        if (w.kind === 'hunter') {
          continue;
        }
        /* A family's first route: the strikes a game are a rate. */
        const agent = {
          id: 1, kind: w.kind, route: [w.route].flat()[0], t0: 0, k, n, err: 0, target: waveTarget(w, k),
        };
        const plan = planAgent(mission, agent);
        const xs = wireCrossings(mission.map, plan);
        c += xs.length;
        strikes += 1 - (1 - STRIKE_P) ** xs.length;
        for (const x of xs) {
          const p = poseAt(plan, x.t).p;
          /* Of the span's wires over that point in plan (its middle phase
           * and its earth wire stand one over the other), the nearest. */
          const over = spanChords.get(x.span).map((ch) => onChord(ch, p[0], p[2])).filter((o) => o.d < 0.5);
          const near = over.sort((a, b) => Math.abs(p[1] - a.y) - Math.abs(p[1] - b.y))[0] ?? { d: Infinity, y: NaN };
          if (!(Math.abs(p[1] - near.y) <= BAND_M + 0.05)) {
            failures.push(`${mission.id} wave ${i + 1} (${w.kind}): its crossing of span ${x.span} at ${x.t} ms is ${near.d.toFixed(2)} m off the span in plan and ${(p[1] - near.y).toFixed(2)} m from it in height`);
          }
          const cut = planAgent(mission, { ...agent, wire: x.t });
          const q = poseAt(cut, cut.tEnd).p;
          if (cut.end !== 'wire' || cut.tEnd !== x.t || Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) > 1e-9) {
            failures.push(`${mission.id} wave ${i + 1} (${w.kind}): given the line at ${x.t} ms it ends ${cut.end} at ${cut.tEnd}, ${Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]).toFixed(3)} m from its flight there`);
          }
        }
      }
      crossings += c;
      if (c) {
        waves.push(`${i + 1} ${w.kind} ${c}`);
      }
    }
    rows.push(`    ${String(pilots).padStart(2)} pilots: ${String(attackers).padStart(3)} attackers, ${String(crossings).padStart(3)} crossings, ${strikes.toFixed(2)} strikes a game  (wave, kind, crossings: ${waves.join('; ') || 'none'})`);
  }
  console.log(`  mission ${mission.id}`);
  console.log(rows.join('\n'));
}

console.log('');
console.log(`structures: ${contact.n} attackers with a target, ${contact.met} meet a structure short of their aim point and go off there (contact.js, within ${CONTACT_M} m of a chunk); the furthest short, ${contact.short.toFixed(1)} m: ${contact.where ?? 'none'}`);

/* How far q is outside chunk ch's box along the furthest of its axes:
 * contact.js grows each box by CONTACT_M along its axes. */
function beyondBox(ch, q) {
  const e = ch.e;
  const ax = [[e[0], e[1], e[2]], [e[3], e[4], e[5]], [e[1] * e[5] - e[2] * e[4], e[2] * e[3] - e[0] * e[5], e[0] * e[4] - e[1] * e[3]]];
  return Math.max(...ax.map((u, j) => Math.abs((q[0] - ch.c[0]) * u[0] + (q[1] - ch.c[1]) * u[1] + (q[2] - ch.c[2]) * u[2]) - ch.h[j]));
}

/* A leaf is met where it stands: mission 2's boat onto gate-13, k 0 of 9
 * at an error of -10 m, which runs into the leaf. With the gate's state
 * holding it shut, half open and right up, it meets a different chunk of
 * the gate each time (the skin low down, the skin higher up, and with
 * the leaf right up out of its way the hoist, which stands still), its
 * contact on that chunk's box grown by CONTACT_M with the leaf turned so
 * (a moving chunk's in the leaf's rest frame), and before it inside no
 * chunk of the gate so turned (chunkDistance). */
{
  const mission = MISSIONS['itaipu-2'];
  const s = STRUCTURES[mission.map]['gate-13'];
  const h = s.frame.hinge;
  const plan = planAgent(mission, {
    id: 1, kind: 'boat', route: 'surface-gates', t0: 0, k: 0, n: 9, err: -10, target: 'gate-13',
  });
  const met = [];
  for (const o of [0, h.max / 2, h.max]) {
    /* Set long before, so its hoist has got there (hoist.js). */
    const gates = [{ gate: 'gate-13', at: plan.t0 - 1e7, open_m: o }];
    const c = contactAt(mission.map, plan, gates);
    const back = unturn(leafTurn(h, o));
    const d = (t) => {
      const p = poseAt(plan, t).p;
      const q = turnPoint(h, back, p);
      return Math.min(...s.chunks.map((ch) => chunkDistance(ch, ch.m ? q : p)));
    };
    const at = c ? beyondBox(s.chunks[c.chunk], s.chunks[c.chunk].m ? turnPoint(h, back, poseAt(plan, c.t + 1).p) : poseAt(plan, c.t + 1).p) : Infinity;
    let early = null;
    for (let t = plan.t0; c && t < c.t; t += CONTACT_SAMPLE_MS) {
      if (d(t) < CONTACT_M - CONTACT_TOL_M) {
        early = t;
        break;
      }
    }
    met.push(c ? c.chunk : null);
    console.log(`  gate-13 at ${o.toFixed(2)} m: ${c ? `meets #${c.chunk} ${s.chunks[c.chunk].k}, ${((plan.tEnd - c.t) / 1000).toFixed(2)} s short, ${at.toFixed(3)} m from it a ms on` : 'meets nothing'}`);
    if (!c || c.target !== 'gate-13' || !(at <= CONTACT_M + CONTACT_TOL_M) || early !== null) {
      failures.push(`gate-13 at ${o} m open: the boat ${c ? `meets ${c.target}#${c.chunk}, ${at.toFixed(3)} m from it${early !== null ? `, inside the leaf at ${early} ms before` : ''}` : 'meets nothing'}; wanted the leaf where it stands`);
    }
  }
  if (new Set(met).size !== met.length) {
    failures.push(`gate-13's leaf shut, half open and up met the boat at chunks ${met.join(', ')}: not where it stands`);
  }
}
console.log('');
if (failures.length) {
  for (const f of failures) {
    console.log(`  FAIL ${f}`);
  }
  console.error(`FAIL, ${failures.length} route problem(s)`);
  process.exitCode = 1;
} else {
  console.log(`PASS, every flying attacker clears the floor by ${worstAll.toFixed(1)} m or more until its terminal run (at least ${MIN_CLEAR_M}), every boat sails on the water, nothing goes under the reservoir's ${WATER_Y} m surface (within ${SURFACE_TOL_M} m), terminal run included, and none flies into a structure before it goes off`);
}
