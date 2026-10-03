/*
 * damage.js: what a warhead breaks in the structures the war is fought
 * over (the Itaipu dam's intakes, spillway gates and penstocks, and the
 * right bank switchyard), and what the breaks open. The owner's decision
 * of 2026-10-02: real structures, not scripted ones, at a gameplay scale,
 * so a few well placed hits open a breach; the shared contract with the
 * water is ~/Desktop/fdfpv-loop/itaipu/DAMBREAK-CONTRACT.md.
 *
 * Pure: plain arrays, no three.js, no clock. The room (edge/rooms/war.js)
 * is the authority and the only caller that decides anything: it calls
 * blast() for every warhead that goes off and sends what came of it as
 * { type: 'war', op: 'damage' } events, which every screen applies as
 * told (src/maps/itaipu/damage.js). Only + - * / and Math.sqrt, so a
 * room on any engine decides the same, though only the room decides.
 *
 * A STRUCTURE is a target's drawn parts cut into chunks, as the map draws
 * them (the dam part and the war part), written out by
 * scripts/war-targets.js into src/share/war/itaipu-chunks.js:
 *
 *   { part, water, frame: { o, u, n }, chunks: [{ k, c, e, h, a, l, r }] }
 *
 *   k   the chunk's kind, a row of HP
 *   c   its centre, scene metres, y up (the renderer's frame)
 *   e   its box's first two axes, unit vectors, six numbers; the third is
 *       their cross product
 *   h   its half extents along the three
 *   a   1 when it is fixed to what never breaks (a pier, the dam's
 *       body, the ground): an anchor of the support check
 *   l   the chunks it rests on or holds, both ways (every link is listed
 *       at both its ends)
 *   r   for a barrier, a chunk that holds water back: its face as
 *       [u0, u1, y0, y1], metres along the frame's u from its o, and
 *       world heights
 *   w   for a gantry's beam, the power line spans whose wires end on it
 *       (src/share/war/itaipu-wires.js's span ids): it gone, they are
 *       down
 *
 *   water  the surface the structure stands in (the reservoir), or null
 *   frame  where an opening is measured: o a point, u the horizontal
 *          along the face, n the way water flows out through it, and for
 *          a pipe its bore, m2, the most an opening of it passes
 *
 * THE ONE TABLE. A warhead's damage to a chunk at distance d (from the
 * blast's centre to the nearest point of the chunk's box, 0 inside it) is
 *
 *   charge / (1 + (d / r)^2),  nothing past CUT_R r
 *
 * added to what the chunk has taken; it breaks when the sum reaches its
 * kind's hp. Under water the blast reaches further: a chunk WET_DEPTH
 * or more under the structure's water, struck by a warhead at or under
 * its surface (within WET_ABOVE_M over it), sees r as at least WATER_M,
 * since water carries a shock's peak pressure where air spends it (the
 * reason a dam is attacked at depth). The two are picked so that a few
 * hits at an intake's surface reach its gate 22 m down, and three at one
 * intake or spillway gate open neither of its neighbours, 33 and 25 m
 * along the dam (scripts/damage-check.js holds both). The charges
 * are gameplay numbers, not explosive physics: they stand in the order of
 * the real payloads (a Shahed class strike 50 kg, a Lancet class loiterer
 * 3 kg, an FPV's 1.5 kg, an explosive boat a few hundred) squeezed so each
 * kind's own targets open in a few hits at its aim (scripts/damage-check.js
 * measures hits to open per kind and target, and holds them to HITS).
 *
 *   attacker   charge  r m   hits to open its own targets, at no error
 *   strike      80     6     an intake 2, a gate 2
 *   loiter      40     3     a gate 4, an intake 4
 *   fpv         45     3     a penstock 3
 *   boat        70     9     an intake 3, a gate 2
 *   decoy, scout, jammer, hunter: no warhead that hits a structure
 *
 *   defender's warhead (war.js WARHEADS) where it goes off: standard 12,
 *   wide 10, penetrator 16 (its second hit; the first goes through),
 *   emp 0; r 2.5
 *
 *   chunk      hp     chunk       hp     chunk       hp
 *   skin       90     leaf        45     shell      100
 *   girder     90     column      50     tank        40
 *   arm        80     cover       40     bushing     20
 *   brace      50                        post        70
 *   trunnion  200                        beam        50
 *   hoist      60
 *
 *   (skin, girder, arm, brace, trunnion, hoist: a spillway gate's; leaf,
 *   column, cover: an intake's; shell: a penstock's segment; tank,
 *   bushing, beam (a conservator or a gantry's beam), post: the yard's)
 *
 * THE SUPPORT CHECK. After the breaks, a chunk still standing that no
 * chain of standing chunks joins to an anchor falls: it is removed as a
 * break is (`fell`), whatever it had taken. A gate's skin hangs off its
 * girders, the girders off the arms, the arms off the trunnions on the
 * piers; the hoist holds the skin's top from the pier's deck. So a skin
 * whose arms are gone on both sides still hangs off its hoists, and goes
 * when they do.
 *
 * AN OPENING (the contract's) is where a target's broken barrier chunks
 * let water through, one per target, `id` the target's id: from the
 * lowest broken barrier's foot (its sill, in the renderer's frame, y up)
 * to the highest one's top, as wide as keeps the broken faces' area
 * (width_m = area / height_m). When more of it breaks it is sent again,
 * the same id with its new size. The cells are the water's to fill.
 *
 * WHAT IT COSTS THE WAR. A target with an opening is lost, as a hit
 * loses it (war.js take): its unit's or its gate's megawatts, once. The
 * yard holds no water: it is lost when YARD_DOWN of its transformers'
 * tanks are gone, wherever in it. Wider consequences (a flooded powerhouse taking its
 * neighbours, a yard part lost shedding part of its side) are not decided
 * here; they are the lead's to decide.
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

import {
  REST, turnHeight, turnPoint, unturn,
} from './leaf.js';

/* Each attacker kind's warhead where it arrives (routes.js KINDS): a
 * kind not here has none that strikes a structure. */
export const CHARGE = Object.freeze({
  strike: Object.freeze({ charge: 80, r: 6 }),
  loiter: Object.freeze({ charge: 40, r: 3 }),
  fpv: Object.freeze({ charge: 45, r: 3 }),
  boat: Object.freeze({ charge: 70, r: 9 }),
});

/* A defender's warhead where it goes off (edge/rooms/war.js WARHEADS). */
export const DEFENDER = Object.freeze({
  standard: Object.freeze({ charge: 12, r: 2.5 }),
  wide: Object.freeze({ charge: 10, r: 2.5 }),
  penetrator: Object.freeze({ charge: 16, r: 2.5 }),
  emp: Object.freeze({ charge: 0, r: 2.5 }),
});

/* Under water: a chunk WET_DEPTH or more under the structure's water,
 * struck by a blast at or under its surface (within WET_ABOVE_M over
 * it), sees the blast's r as at least WATER_M. */
export const WATER_M = 14;
export const WET_DEPTH = 9;
export const WET_ABOVE_M = 2;
/* Nothing past this many r. */
export const CUT_R = 5;

/* What a chunk of each kind takes before it breaks. */
export const HP = Object.freeze({
  skin: 90,
  girder: 90,
  arm: 80,
  brace: 50,
  trunnion: 200,
  hoist: 60,
  leaf: 45,
  column: 50,
  cover: 40,
  shell: 100,
  tank: 40,
  bushing: 20,
  post: 70,
  beam: 50,
});

/* How many of the yard's transformer tanks lost lose the yard. */
export const YARD_DOWN = 3;

/* The contract's opening kinds, by the part a target is. */
const OPENING_KIND = Object.freeze({ intake: 'intake', gate: 'gate', penstock: 'penstock' });

/* The warhead a blast is: an attacker kind's, a defender's, or null. */
export function attackerCharge(kind) {
  return Object.hasOwn(CHARGE, kind) ? CHARGE[kind] : null;
}

export function defenderCharge(warhead) {
  return Object.hasOwn(DEFENDER, warhead) && DEFENDER[warhead].charge > 0 ? DEFENDER[warhead] : null;
}

/* The distance from p to chunk ch's box, 0 inside it. */
export function chunkDistance(ch, p) {
  const e = ch.e;
  const dx = p[0] - ch.c[0];
  const dy = p[1] - ch.c[1];
  const dz = p[2] - ch.c[2];
  /* The third axis, e0 x e1. */
  const fx = e[1] * e[5] - e[2] * e[4];
  const fy = e[2] * e[3] - e[0] * e[5];
  const fz = e[0] * e[4] - e[1] * e[3];
  const t0 = Math.abs(dx * e[0] + dy * e[1] + dz * e[2]) - ch.h[0];
  const t1 = Math.abs(dx * e[3] + dy * e[4] + dz * e[5]) - ch.h[1];
  const t2 = Math.abs(dx * fx + dy * fy + dz * fz) - ch.h[2];
  const o0 = t0 > 0 ? t0 : 0;
  const o1 = t1 > 0 ? t1 : 0;
  const o2 = t2 > 0 ? t2 : 0;
  return Math.sqrt(o0 * o0 + o1 * o1 + o2 * o2);
}

/* What a warhead { charge, r } does to chunk ch of structure s, at p
 * (in the chunk's own frame: a gate leaf's at rest, leaf.js); cy is the
 * chunk's height as it stands, for the water. */
export function hitOn(s, ch, p, w, cy = ch.c[1]) {
  const wet = s.water != null && cy <= s.water - WET_DEPTH && p[1] <= s.water + WET_ABOVE_M;
  const r = wet && w.r < WATER_M ? WATER_M : w.r;
  const d = chunkDistance(ch, p);
  if (d > CUT_R * r) {
    return 0;
  }
  const q = d / r;
  return w.charge / (1 + q * q);
}

function dist3(a, b) {
  const x = a[0] - b[0];
  const y = a[1] - b[1];
  const z = a[2] - b[2];
  return Math.sqrt(x * x + y * y + z * z);
}

/* Each structure's bounding sphere, for the broadphase: computed once. */
const SPHERES = new WeakMap();
function sphereOf(s) {
  let sp = SPHERES.get(s);
  if (sp) {
    return sp;
  }
  const n = s.chunks.length;
  const c = [0, 0, 0];
  for (const ch of s.chunks) {
    c[0] += ch.c[0] / n;
    c[1] += ch.c[1] / n;
    c[2] += ch.c[2] / n;
  }
  let r = 0;
  for (const ch of s.chunks) {
    const reach = dist3(ch.c, c) + Math.sqrt(ch.h[0] * ch.h[0] + ch.h[1] * ch.h[1] + ch.h[2] * ch.h[2]);
    r = Math.max(r, reach);
  }
  /* A gate's leaf turns: as far as its skin's radius, at the most. */
  sp = { c, r: r + (s.frame.hinge ? s.frame.hinge.r : 0) };
  SPHERES.set(s, sp);
  return sp;
}

/* A target's state in the match, plain arrays (the room stores it as
 * JSON): what each chunk has taken, and which are gone (1). */
export function freshState(s) {
  return {
    dmg: s.chunks.map(() => 0), gone: s.chunks.map(() => 0), open: null, down: false, cut: [],
  };
}

/* The standing chunks no chain of standing chunks joins to an anchor. */
export function unsupported(s, gone) {
  const seen = new Uint8Array(s.chunks.length);
  const stack = [];
  s.chunks.forEach((ch, i) => {
    if (ch.a && !gone[i]) {
      seen[i] = 1;
      stack.push(i);
    }
  });
  while (stack.length) {
    const i = stack.pop();
    for (const j of s.chunks[i].l) {
      if (!seen[j] && !gone[j]) {
        seen[j] = 1;
        stack.push(j);
      }
    }
  }
  const out = [];
  s.chunks.forEach((_, i) => {
    if (!gone[i] && !seen[i]) {
      out.push(i);
    }
  });
  return out;
}

/* The opening a target's gone barrier chunks make, or null; a gate's at
 * its leaf's turn t (leaf.js), the holes in the leaf where it stands. */
export function openingOf(id, s, gone, at, t = REST) {
  const h = s.frame.hinge;
  let area = 0;
  let sill = Infinity;
  let top = -Infinity;
  let mid = 0;
  s.chunks.forEach((ch, i) => {
    if (!gone[i] || !ch.r) {
      return;
    }
    const [u0, u1] = ch.r;
    const ya = h && ch.m ? turnHeight(h, t, ch.r[2]) : ch.r[2];
    const yb = h && ch.m ? turnHeight(h, t, ch.r[3]) : ch.r[3];
    const y0 = Math.min(ya, yb);
    const y1 = Math.max(ya, yb);
    const a = (u1 - u0) * (y1 - y0);
    area += a;
    mid += a * (u0 + u1) / 2;
    sill = Math.min(sill, y0);
    top = Math.max(top, y1);
  });
  if (!(area > 0)) {
    return null;
  }
  const f = s.frame;
  const u = mid / area;
  const height = top - sill;
  /* A burst pipe passes no more than its bore. */
  if (f.bore != null && area > f.bore) {
    area = f.bore;
  }
  return {
    id,
    target: id,
    kind: OPENING_KIND[s.part],
    at,
    sill: [round(f.o[0] + f.u[0] * u), round(sill), round(f.o[2] + f.u[2] * u)],
    width_m: round(area / height),
    height_m: round(height),
    normal: f.n.slice(),
    upstream_cell: null,
    downstream_cell: null,
  };
}

/* Whether two openings are the same hole: the same place and size. */
function sameOpening(a, b) {
  return Boolean(a) && Boolean(b) && a.width_m === b.width_m && a.height_m === b.height_m
    && a.sill.every((v, k) => v === b.sill[k]);
}

/*
 * A gate's leaf moved (hoist.js) to turn t at room ms `at`: its holes
 * moved with it, so its opening is told again, the same id, stamped `at`
 * (the room ms of the move, never the break's). Returns the record
 * blast's shape (no chunks) when the opening is somewhere new, else null.
 */
export function leafMoved(id, s, st, at, t) {
  if (!st || !st.open || !s.frame.hinge) {
    return null;
  }
  const open = openingOf(id, s, st.gone, at, t);
  if (!open || sameOpening(open, st.open)) {
    return null;
  }
  st.open = open;
  return {
    target: id, at, chunks: [], fell: [], openings: [open], down: false, health: healthOf(s, st), cut: [],
  };
}

/* To the millimetre, as every number the room sends. */
function round(v) {
  return Math.round(v * 1000) / 1000;
}

/* Whether a target's state has cost it: an opening, or for the yard
 * YARD_DOWN of its tanks. */
export function lostBy(s, st) {
  if (OPENING_KIND[s.part]) {
    return st.open != null;
  }
  let tanks = 0;
  let gone = 0;
  s.chunks.forEach((ch, i) => {
    if (ch.k === 'tank') {
      tanks += 1;
      gone += st.gone[i];
    }
  });
  return tanks > 0 && gone >= Math.min(YARD_DOWN, tanks);
}

/* What is left of a target, by its chunks' hp, 0 to 1. */
export function healthOf(s, st) {
  let all = 0;
  let left = 0;
  s.chunks.forEach((ch, i) => {
    all += HP[ch.k];
    left += st.gone[i] ? 0 : HP[ch.k];
  });
  return all > 0 ? round(left / all) : 1;
}

/*
 * A warhead { charge, r } going off at p, at room ms `at`, on every
 * structure within its reach. `structures` is { id: structure }, `wreck`
 * { id: state } (freshState), changed in place. Returns one record a
 * target that lost something, in the structures' order:
 *
 *   { target, at, chunks, fell, openings, down, health, cut }
 *
 * chunks every one removed (broken, then fallen), fell those that fell,
 * openings the target's opening when it is new or bigger ([] when not),
 * down true when this cost the target (lostBy) and it had not before,
 * cut the power line spans newly down (the gone chunks' `w`).
 */
export function blast(structures, wreck, p, w, at, turnOf = null) {
  const out = [];
  if (!w || !(w.charge > 0)) {
    return out;
  }
  for (const [id, s] of Object.entries(structures)) {
    /* A gate's leaf where it stands at `at`: the blast taken into the
     * leaf's rest frame, where its chunks are written. */
    const h = s.frame.hinge;
    const t = h && turnOf ? turnOf(id) : REST;
    const pr = h ? turnPoint(h, unturn(t), p) : p;
    const sp = sphereOf(s);
    const wetR = s.water != null && p[1] <= s.water + WET_ABOVE_M && w.r < WATER_M ? WATER_M : w.r;
    const dc = dist3(p, sp.c);
    if (dc - sp.r > CUT_R * wetR) {
      continue;
    }
    const st = wreck[id] ?? freshState(s);
    const broke = [];
    s.chunks.forEach((ch, i) => {
      if (st.gone[i]) {
        return;
      }
      const d = h && ch.m ? hitOn(s, ch, pr, w, turnPoint(h, t, ch.c)[1]) : hitOn(s, ch, p, w);
      if (!(d > 0)) {
        return;
      }
      st.dmg[i] = round(st.dmg[i] + d);
      if (st.dmg[i] >= HP[ch.k]) {
        broke.push(i);
      }
    });
    wreck[id] = st;
    if (!broke.length) {
      continue;
    }
    for (const i of broke) {
      st.gone[i] = 1;
    }
    const fell = unsupported(s, st.gone);
    for (const i of fell) {
      st.gone[i] = 1;
    }
    const open = openingOf(id, s, st.gone, at, t);
    const grew = open && !sameOpening(open, st.open);
    if (grew) {
      st.open = open;
    }
    const lost = !st.down && lostBy(s, st);
    if (lost) {
      st.down = true;
    }
    st.cut ??= [];
    const cut = [];
    for (const i of [...broke, ...fell]) {
      for (const span of s.chunks[i].w ?? []) {
        if (!st.cut.includes(span) && !cut.includes(span)) {
          cut.push(span);
        }
      }
    }
    st.cut.push(...cut);
    out.push({
      target: id, at, chunks: [...broke, ...fell], fell, openings: grew ? [open] : [], down: lost, health: healthOf(s, st), cut,
    });
  }
  return out;
}
