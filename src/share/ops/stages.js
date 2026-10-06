/*
 * stages.js (ops): the stage engine for missions that are not the war's
 * (docs/campaign/interior/TECH-NEEDS.md N6, CONTRACT-P0.md section 9).
 * The war's engine (src/share/war/stages.js) keeps doing what it does
 * for both: stages, exits, objectives and their holds, seeded draws,
 * `time`, `any`, `all`, `objective`, `visited`. This adds:
 *
 *   trigger(trig, ctx)   the ops triggers, the war engine's hook (its
 *                        fired() asks it for a kind it does not know)
 *   dueCues(ctx)         cues with the ops fields: `heard` (who hears a
 *                        line, roles.js hears), `unless` (a trigger that
 *                        cancels the cue when it fired first), `repeat`
 *                        (told again each time its trigger fires anew: a
 *                        contact lost a second time), and the scripted
 *                        effects applyCue runs
 *   applyCue(...)        a cue's effects on the match: spawn, move,
 *                        classify, flag, search, unsearch, choose
 *   drawDials(...)       the mission's dials, drawn once at the go
 *   resolve(v, dials)    a value that may depend on a dial: { dial, map }
 *   cardsView(ctx)       the objective cards as the view shows them
 *   starsOf(...)         which of the mission's stars a won match earned
 *
 * An OPS MISSION is { id, campaign, title, map, z0, classes, roles,
 * contacts, items, points, sites, dials, boundary, lost, stars, lines,
 * filmMs?, stages } (src/share/interior/missions/interior-1.js is the
 * first). It names no attackers and no output floor: it is lost by its
 * `lost` rules ({ when, why }), its boundary, or a stage exit to 'lost'.
 *
 * ctx, beyond what the war's engine reads (mission, m, st, f, here):
 *   pilots   [{ seat, p: [x, y, z] ops frame, airborne, cam }] at f
 *   roles    the roles state (roles.js)
 *   world    { canopyBlocks, poseOnRoute }
 *
 * A trigger's answer is the room ms it fired, never before the stage
 * opened, or null; a latched one (zone, above, landed, dwell, hards) keeps
 * its answer in the stage's st.hold once it has one.
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

import { draw, fired, stagesOf } from '../war/stages.js';
import {
  classify, membersOf, move, spawn,
} from './contacts.js';
import { rank } from './capture.js';
import { holds } from './roles.js';
import { sight } from './sight.js';

/* A camera held on a place has it within this of the picture's centre
 * (0 centre, 1 edge). */
export const DWELL_OFF = 0.3;
/* The boundary: a pilot outside is warned, then warned a last time this
 * long after, then out this long after that (MISSIONS.md 1.7). */
export const BOUNDARY_MS = 15000;

const SALT_DIAL = 0x4f504449;
const SALT_CUE = 0x4f504355;

/* A value written as { dial, map } is the map's entry for what the dial
 * drew; anything else is itself. */
export function resolve(v, dials) {
  if (v && typeof v === 'object' && !Array.isArray(v) && v.dial != null) {
    if (!(v.dial in dials)) {
      throw new Error(`ops: no dial ${v.dial}`);
    }
    return v.map[dials[v.dial]];
  }
  return v;
}

/* The mission's dials ({ name: [choices] }), each one drawn from the
 * seed with its own index, so adding a dial never moves another. */
export function drawDials(mission, seed) {
  const out = {};
  for (const [j, [name, choices]] of Object.entries(mission.dials ?? {}).entries()) {
    out[name] = choices[Math.floor(draw((seed ^ SALT_DIAL) >>> 0, j) * choices.length)];
  }
  return out;
}

const latest = (ts) => (ts.length ? Math.max(...ts) : null);
const earliest = (ts) => (ts.length ? Math.min(...ts) : null);

/* An item spec's ids: an id, a list, or { set }: every item of that set. */
export function itemsOf(mission, spec) {
  if (spec && typeof spec === 'object' && !Array.isArray(spec)) {
    return mission.items.filter((x) => x.set === spec.set).map((x) => x.id);
  }
  return [spec].flat();
}

/* The captures of `ids` at or above `grade` taken by room ms f, earliest
 * first, one each: a still taken ahead of the frontier counts once the
 * frontier reaches it. */
function capturesOf(m, ids, grade, f) {
  const best = new Map();
  for (const c of m.captures) {
    if (c.t <= f && ids.includes(c.item) && (grade == null || rank(c.grade) >= rank(grade)) && !(best.get(c.item) <= c.t)) {
      best.set(c.item, c.t);
    }
  }
  return [...best.values()].sort((a, b) => a - b);
}

/* A latched trigger: once true at the frontier it stays, at that ms. */
function latch(ctx, trig, ok) {
  const key = JSON.stringify(trig);
  const h = ctx.st.hold[key];
  if (h && h.done != null) {
    return h.done;
  }
  if (!ok) {
    delete ctx.st.hold[key];
    return null;
  }
  ctx.st.hold[key] = { done: ctx.f };
  return ctx.f;
}

/* A held condition: true since when without a break, done `ms` after. */
function holdFor(ctx, trig, ok, ms) {
  const key = JSON.stringify(trig);
  const h = ctx.st.hold[key];
  if (h && h.done != null) {
    return h.done;
  }
  if (!ok) {
    delete ctx.st.hold[key];
    return null;
  }
  const from = h ? h.from : ctx.f;
  ctx.st.hold[key] = { from };
  if (ctx.f - from >= ms) {
    ctx.st.hold[key].done = from + ms;
    return from + ms;
  }
  return null;
}

const inPoint = (p, pt) => (p[0] - pt.at[0]) ** 2 + (p[1] - pt.at[1]) ** 2 <= pt.r * pt.r;

function pointOf(mission, name) {
  const pt = mission.points?.[name];
  if (!pt) {
    throw new Error(`ops: ${mission.id} has no point ${name}`);
  }
  return pt;
}

/* The pilots (at the frontier) holding one of `roles`, all without. */
function withRoles(ctx, roles) {
  return roles == null ? ctx.pilots : ctx.pilots.filter((q) => holds(ctx.roles, q.seat, roles));
}

/* The ops triggers (the table in the file's head and CONTRACT-P0.md 9):
 * the room ms one fired, null, or undefined for a kind not ours. */
export function trigger(trig, ctx) {
  const { m, st, f, mission } = ctx;
  const after = (t) => (t == null ? null : Math.max(st.at, t));
  if (trig.seen != null) {
    const ts = membersOf(m.contacts, trig.seen)
      .filter((c) => c.seenAt != null && (c.state === 'seen' || (!trig.now && c.seenAt >= st.at)))
      .map((c) => c.seenAt);
    return after(earliest(ts));
  }
  if (trig.discovered != null) {
    const ts = membersOf(m.contacts, trig.discovered).map((c) => c.firstAt).filter((t) => t != null);
    return after(earliest(ts));
  }
  if (trig.captured != null) {
    const ids = itemsOf(mission, trig.captured);
    const ts = capturesOf(m, ids, trig.grade, f);
    const n = trig.n ?? ids.length;
    return ts.length >= n ? after(ts[n - 1]) : null;
  }
  if (trig.lost != null) {
    const cs = membersOf(m.contacts, trig.lost).filter((c) => c.state !== 'vanished');
    if (!cs.length || !cs.every((c) => c.state === 'lost')) {
      return null;
    }
    const t = Math.max(...cs.map((c) => c.lostSince)) + Math.round(trig.s * 1000);
    return t <= f ? after(t) : null;
  }
  if (trig.reacquired != null) {
    const ts = membersOf(m.contacts, trig.reacquired).map((c) => c.reacqAt).filter((t) => t != null && t >= st.at);
    return latest(ts);
  }
  if (trig.classified != null) {
    const ts = membersOf(m.contacts, trig.classified).filter((c) => c.cls === trig.is).map((c) => c.clsAt);
    return after(earliest(ts));
  }
  if (trig.alert != null) {
    return after(m.sites[trig.alert]?.at[trig.level] ?? null);
  }
  if (trig.route != null) {
    const ts = membersOf(m.contacts, trig.route).map((c) => c.reached[trig.point]).filter((t) => t != null);
    return after(earliest(ts));
  }
  if (trig.vanished != null) {
    const cs = membersOf(m.contacts, trig.vanished);
    if (!cs.length || !cs.every((c) => c.state === 'vanished' && (!trig.watched || c.watched))) {
      return null;
    }
    return after(Math.max(...cs.map((c) => c.vanishedAt)));
  }
  if (trig.zone != null) {
    const pt = pointOf(mission, trig.zone);
    return holdFor(ctx, trig, withRoles(ctx, trig.roles).some((q) => inPoint(q.p, pt)), trig.ms ?? 0);
  }
  if (trig.above != null) {
    const qs = withRoles(ctx, trig.roles);
    return latch(ctx, trig, qs.length > 0 && qs.every((q) => q.airborne && q.p[2] - (mission.z0 ?? 0) >= trig.above));
  }
  if (trig.landed != null) {
    const pt = pointOf(mission, trig.landed);
    return latch(ctx, trig, withRoles(ctx, trig.roles).some((q) => !q.airborne && m.flew?.[q.seat] && inPoint(q.p, pt)));
  }
  if (trig.dwell != null) {
    const pt = pointOf(mission, trig.dwell);
    const at = [pt.at[0], pt.at[1], pt.z ?? mission.z0 ?? 0];
    const on = ctx.pilots.some((q) => {
      const s = q.cam ? sight(q.p, q.cam, at, pt.r ?? 1) : null;
      return s && s.off <= DWELL_OFF && !ctx.world.canopyBlocks(q.p, at);
    });
    return holdFor(ctx, trig, on, Math.round(trig.s * 1000));
  }
  if (trig.boundary != null) {
    return after(earliest((m.bounds ?? []).filter((b) => b.level === trig.boundary && b.t >= st.at).map((b) => b.t)));
  }
  if (trig.downed != null) {
    const want = [trig.downed].flat();
    const ts = (m.downs ?? []).filter((d) => d.roles.some((r) => want.includes(r)) && (!trig.alone || d.alone)).map((d) => d.t);
    return after(earliest(ts));
  }
  if (trig.clock != null) {
    const t = m.goAt + Math.round(trig.clock * 1000);
    return t <= f ? after(t) : null;
  }
  if (trig.flag != null) {
    return after(m.flagAt?.[trig.flag] ?? null);
  }
  if (trig.chosen != null) {
    const c = m.choices?.[trig.chosen];
    return c && c.value === trig.is ? after(c.t) : null;
  }
  if (trig.hards != null) {
    const n = membersOf(m.contacts, trig.hards).reduce((sum, c) => sum + c.hards, 0);
    return latch(ctx, trig, n >= trig.n);
  }
  return undefined;
}

/* A time in seconds, or a window [lo, hi] drawn by u, as ms. */
function msOf(at, u) {
  const s = Array.isArray(at) ? at[0] + (at[1] - at[0]) * u : (at ?? 0);
  return Math.round(s * 1000);
}

/*
 * The stage's cues now due, in time then list order: [{ t, i, cue }].
 * st.cuedAt[i] keeps the trigger time each was told for, so a `repeat`
 * cue is told again when its trigger fires anew and a plain one once.
 * A cue whose `unless` fired at or before its time is dropped.
 */
export function dueCues(ctx) {
  const { st, f, m } = ctx;
  st.cuedAt ??= {};
  const out = [];
  for (const [i, c] of (stagesOf(ctx.mission)[st.idx].cues ?? []).entries()) {
    const had = st.cuedAt[i];
    if (had != null && (!c.repeat || had === 'skip')) {
      continue;
    }
    const base = c.when ? fired(c.when, ctx) : st.at;
    if (base == null || (had != null && base <= had)) {
      continue;
    }
    const t = base + msOf(c.at, draw((m.seed ^ SALT_CUE) >>> 0, st.entry * 4099 + i));
    if (t > f) {
      continue;
    }
    if (c.unless) {
      const u = fired(c.unless, ctx);
      if (u != null && u <= t) {
        st.cuedAt[i] = c.repeat ? base : 'skip';
        continue;
      }
    }
    st.cuedAt[i] = base;
    out.push({ t, i, cue: c });
  }
  return out.sort((a, b) => a.t - b.t || a.i - b.i);
}

/* What a screen is told of a cue (the effects are the view's). */
export function toldOf(cue, t, stage, dials) {
  const out = { at: t, stage, heard: cue.heard ?? 'all' };
  for (const k of ['radio', 'text', 'music', 'card']) {
    if (cue[k] !== undefined) {
      out[k] = resolve(cue[k], dials);
    }
  }
  return out;
}

/*
 * A cue's effects on the match at room ms t:
 *   spawn     [{ id, route, alt? }]: contacts onto the map
 *   move      [{ contacts, route, alt?, after? }]: contacts (an id, a
 *             group or a list) onto another route `after` seconds from now
 *   classify  { contacts, to, label?, why? }, or a list of them: scripted
 *             evidence (contacts an id, a group, or a list of them)
 *   flag      a name (true), or { name, value }
 *   search    { id, at: [x, y] | contact, r }: a search area (at the
 *             contact's last known position)
 *   unsearch  an id
 *   choose    { name, value }
 * Every route, alt and value may be a { dial, map }.
 */
export function applyCue(m, mission, cue, t) {
  const d = m.dials;
  for (const s of cue.spawn ?? []) {
    const def = mission.contacts.find((c) => c.id === s.id);
    if (!def) {
      throw new Error(`ops: ${mission.id} has no contact ${s.id}`);
    }
    if (!m.contacts.some((c) => c.id === s.id)) {
      m.contacts.push(spawn(def, resolve(s.route, d), t, resolve(s.alt, d) ?? null));
    }
  }
  for (const mv of cue.move ?? []) {
    const at = t + Math.round(resolve(mv.after ?? 0, d) * 1000);
    for (const c of [mv.contacts].flat().flatMap((sel) => membersOf(m.contacts, sel))) {
      if (at <= t) {
        move(c, resolve(mv.route, d), t, mv.alt === undefined ? undefined : resolve(mv.alt, d));
      } else {
        c.next = { route: resolve(mv.route, d), t0: at, alt: mv.alt === undefined ? undefined : resolve(mv.alt, d) };
      }
    }
  }
  for (const k of [cue.classify ?? []].flat()) {
    for (const c of [k.contacts].flat().flatMap((sel) => membersOf(m.contacts, sel))) {
      classify(c, k.to, t, mission.classes, k.why ?? null, k.label);
    }
  }
  if (cue.flag) {
    const { name, value } = typeof cue.flag === 'string' ? { name: cue.flag, value: true } : cue.flag;
    if (m.flags[name] !== value) {
      m.flags[name] = value;
      (m.flagAt ??= {})[name] = t;
    }
  }
  if (cue.search) {
    const s = cue.search;
    const c = s.contact ? membersOf(m.contacts, s.contact).find((x) => x.lkp) : null;
    const at = resolve(s.at, d) ?? (c ? [c.lkp[0], c.lkp[1]] : null);
    if (at) {
      m.search = [...m.search.filter((x) => x.id !== s.id), {
        id: s.id, at, r: s.r, contact: s.contact ?? null,
      }];
    }
  }
  if (cue.unsearch) {
    m.search = m.search.filter((x) => x.id !== cue.unsearch);
  }
  if (cue.choose) {
    (m.choices ??= {})[cue.choose.name] ??= { value: resolve(cue.choose.value, d), t };
  }
}

/* The stage's cards as the view shows them: those shown so far (an
 * `after` card once that one is done), each with its tier, roles, star
 * and, for a count of captures, how far it has got. */
export function cardsView(ctx) {
  const { st, m, mission } = ctx;
  const stars = new Set((mission.stars ?? []).map((s) => s.card).filter(Boolean));
  return (stagesOf(mission)[st.idx].objectives ?? []).filter((o) => !o.after || st.obj[o.after]?.state === 'done').map((o) => {
    const out = {
      id: o.id, text: o.text, tier: o.tier ?? 'primary', state: o.tier === 'rule' ? 'active' : (st.obj[o.id]?.state ?? 'active'), roles: o.roles ?? null, star: stars.has(o.id),
    };
    const c = o.done?.captured;
    if (c != null) {
      const ids = itemsOf(mission, c);
      const n = o.done.n ?? ids.length;
      out.progress = [Math.min(n, capturesOf(m, ids, o.done.grade, ctx.f).length), n];
    }
    return out;
  });
}

/* The stars a won match earned: the ids of the mission's `stars` whose
 * trigger fired, each judged over the whole match (ctx at its end). */
export function starsOf(ctx) {
  return (ctx.mission.stars ?? []).filter((s) => fired(s.when, ctx) != null).map((s) => s.id);
}
