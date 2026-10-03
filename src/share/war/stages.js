/*
 * stages.js: a war mission as a stage graph (the owner, 2026-10-02: "story
 * driven ... in stages ... buildup", and of the old missions, "things
 * coming in at the same predictable places ... wave after wave of the
 * same"; docs/campaign/TECH-NEEDS.md T1). The room (edge/rooms/war.js)
 * runs it and is its only authority; every screen hears what it decided
 * (births, cues, the view's `stage`) and draws that. Pure: plain data in
 * and out, no clock but the room ms handed in, so the room's match (JSON,
 * stored and restored over a restart) holds the whole of a stage's state.
 *
 * A MISSION is { id, title, map, targets, routes, output, floorMw, starMw,
 * airframes, stages } (itaipu-1.js is the model), and may add:
 *
 *   sectors   { name: [route ids] }: the route families a spawn's bearing
 *             is drawn from (MISSIONS.md 1.4: N, NW, NE, HIGH, WATER, ...)
 *   lines     { name: [[x, z], [x, z]] }: gates in space for { crossed }
 *   pace      { pilots: factor }: every spawn's and cue's time from its
 *             stage's entry multiplied by the factor for the pilots here at
 *             the entry (MISSIONS.md 1.6: { 1: 1.6, 2: 1.3, 3: 1.3 })
 *   adapt     true: the aggressor's mind (TECH-NEEDS T1.5). A stage's
 *             sector draws are weighted 1 / (1 + the kills in that sector
 *             last stage), and its first spawn comes ADAPT_LATE later when
 *             the squad ended the last stage with ADAPT_HIGH of its
 *             airframes spent, ADAPT_EARLY sooner under ADAPT_LOW
 *   sets      { name: { from: [target ids], n: { pilots: k } } }: working
 *             sets of targets (TECH-NEEDS T1.3, M2's working gates), each
 *             k of `from` drawn at the go, k the value under the largest
 *             key not over the pilots then ({ 1: 3, 4: 4 }: 3, and 4
 *             from 4 pilots). The match keeps them (m.sets, the view's
 *             `sets`) to the end and over a restart. A spawn's target, a
 *             hit or a hold's targets name one as { set: name }
 *
 * Its stages are an array; the first is entered at the go. A STAGE:
 *
 *   id          a name, unique in the mission
 *   title       a string key: the HUD's lower third as the stage opens
 *   round       true: a round of the old kind, and of the owner's economy
 *               (MISSIONS.md 1.1: "a stage is a round"). Entering it gives
 *               every pilot the mission's airframes again (war.js), it
 *               counts in the view's round/rounds, and its exit's result
 *               counts for the stars. A stage that is not a round keeps
 *               the rack as it is, for stages that run on into each other
 *   spawns      groups of attackers, below
 *   objectives  [{ id, text, kind?, done?, fail?, from?, ms? }]: text a
 *               string key the HUD shows, kind a word for it ('protect',
 *               'kill', 'hold', 'spot'); done and fail are triggers, and the
 *               first to fire settles it ('done' or 'failed'). With ms it
 *               is a hold: done ms after `from` fires (the entry without
 *               one), unless it failed first; the view shows how long it
 *               has been held. A count ({ killed }, { leaked }, { hit },
 *               { destroyed }) shows how far it has got
 *   cues        [{ at | when, radio | music | cutaway | text }]: told to
 *               every screen when due, `at` seconds (or a window [lo, hi])
 *               after the entry, or after the trigger `when` fires:
 *                 radio    a voice line's id (assets/audio/war/lines.json)
 *                 music    the war bed's track ('' for none)
 *                 cutaway  { target | at: [x, y, z], from?, fov?, ms? }: a
 *                          short look at a place (src/render/warcutaway.js)
 *                 text     a string key for the HUD's stage line
 *   exits       [{ when, to, after?, result?, clear?, why? }], below
 *   worth       { set: factor }: the set's targets cost the output their
 *               mw times factor when hit in this stage (T1.9: the working
 *               gates are worth double while the spill runs)
 *
 * A hold may open gates: { ..., ms, targets: { set }, open: metres } has
 * its targets' hoists start toward `open` at the hold's start (gatesOf
 * below); a target hit on the way stops where it was.
 *
 * A SPAWN is a wave of the old kind, { at, kind, n, per, route, target,
 * spread }, with the dials a seed may turn (MISSIONS.md 1.4), each drawn
 * once, when the stage is entered (a slot's kind when it is announced),
 * so every pilot meets the same and a replay of the seed meets it again:
 *
 *   at      seconds after the entry, or [lo, hi]: a time in that window
 *   route   a route's id; a list of them, one drawn; or { sector: S or
 *           [S...] }: a sector drawn (never the one the mission's last
 *           sector spawn took, when there is another), then a route of
 *           its family
 *   az      [lo, hi] radians: the route turned about the vertical through
 *           its own last point, positive to the left (routes.js planAgent)
 *   kind    a kind, or a list of them: one drawn for the group
 *   mix     [[kind, weight], ...] in place of kind: each attacker's kind
 *           drawn by the weights (a Striker group salted with decoys)
 *   when    a trigger: born `at` seconds after it fires, not the entry
 *   skip    a trigger: a spawn not yet born when it has fired is dropped
 *           (stage 5's "the twists that did not fire": { visited })
 *   group   a name the triggers count it by
 *
 * n and per size it by the pilots here when it is announced (index.js
 * waveSize), as ever.
 *
 * A TRIGGER is one of these objects; each fires at a room ms, when it
 * happened on the judgement's timeline (war.js), never when the room
 * noticed, so lag decides nothing. A selection { group?, kind? } is the
 * stage's own attackers of that group and kind:
 *
 *   { time: s }                    s seconds after the entry
 *   { cleared: true }              every spawn of the stage born and no
 *                                  attacker but Scouts alive (a round end)
 *   { allOut: true }               no pilot here can still fly
 *   { destroyed: id | [ids], n? }  n of those targets hit (all without n),
 *                                  ever in the match; not before the entry
 *   { hit: id | part | [...], n? } n targets hit in the stage, by id or
 *                                  by part ('intake' is every intake-k)
 *   { killed: n, group?, kind? }   n of them killed by warheads
 *   { leaked: n, group?, kind?, onTarget? }
 *                                  n of them at the end of their route
 *                                  with a target (onTarget: only those
 *                                  that hit it)
 *   { left: n, group?, kind? }     n of them gone on their own (a Scout
 *                                  done with its orbit)
 *   { born: { group?, kind? } }    the first of them born (its t0)
 *   { down: { group?, kind? } }    every one born and every one killed
 *                                  (warhead or power line): scoutsDown
 *   { gone: { group?, kind? } }    every one born and every one gone,
 *                                  however: after(G)
 *   { crossed: line, group?, kind? }
 *                                  the first of them alive to cross the
 *                                  mission's line (computed at its birth)
 *   { spent: f }                   the pilots here have spent f of their
 *                                  airframes this round
 *   { output: { below } } or { output: { atMost } }
 *   { region: { at: [x, z], r, y?: [lo, hi] }, pilots?: 'any' | 'all',
 *     ms? }                        pilots inside the cylinder, for ms
 *   { breach: id | true }          an opening at that target, or any
 *                                  (war.js breach(), the dam break)
 *   { ready: true }                every pilot here said ready in the
 *                                  stage ({ type: 'war', op: 'ready' })
 *   { objective: id, is: 'done' | 'failed' | 'active' }
 *                                  settled so; 'active' when a hold began
 *   { held: id, f }                a hold `f` of its way through (0 to 1),
 *                                  unless it failed before then
 *   { visited: stage id }          the match has been in that stage
 *   { all: [triggers] }            the last of them
 *   { any: [triggers] }            the first of them
 *
 * AN EXIT leaves the stage the moment its trigger fires: the earliest of
 * them, the first listed on a tie.
 *
 *   to      a stage's id, 'next', 'won', 'lost', or { pick: [ids], w? }:
 *           one drawn from the seed, by weight (the twist)
 *   after   ms between this stage and the next, or a window [lo, hi] of
 *           ms drawn from the seed: the beat (war.js roundState
 *           'result'); 0 enters the next at once. Milliseconds, where a
 *           spawn's `at` is seconds: a round's is RESULT_MS
 *   result  'auto' ('damaged' when the stage cost output or failed an
 *           objective, else 'win'), 'win', 'damaged' or 'lost'
 *   clear   'through' (each attacker alive with a target gets through,
 *           as an arrival would), 'leave' (they all go, harmlessly), or
 *           nothing: they fly on into the next stage
 *   why     the end's reason, with to 'won' or 'lost'
 *
 * The match is lost the instant the output is under floorMw, whatever
 * the stage (war.js settle).
 *
 * DETERMINISM. Every choice is draw(seed, n) below, an integer hash on
 * the match's seed, the same on every engine; what it chose is kept in
 * the stage's state and shown in the view (`draws`), so a late joiner and
 * a restore agree without drawing again. A stage's draws mix in how many
 * stages the match has entered, so a stage entered twice draws afresh,
 * and each dial has its own salt, so adding one never moves another.
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

import { poseAt } from './routes.js';
import { FREE_OPEN_M, openAt } from './hoist.js';

/* A round's result shows this long before the next round starts. */
export const RESULT_MS = 6000;

/* The adaptive timing (TECH-NEEDS T1.5): the share of the airframes spent
 * last stage over which the next stage's first spawn comes later, under
 * which it comes sooner, and by how much. */
export const ADAPT_HIGH = 0.75;
export const ADAPT_LOW = 0.25;
export const ADAPT_LATE = 1.3;
export const ADAPT_EARLY = 0.7;

/* A seeded draw in [0, 1) from two integers, the same on every engine. */
export function draw(seed, id) {
  let h = Math.imul((seed ^ Math.imul(id, 0x9e3779b1)) >>> 0, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const SALT = {
  at: 0x53544154, route: 0x53545254, az: 0x5354415a, pick: 0x5354504b, sector: 0x53545343, kind: 0x53544b44, mix: 0x53544d58, after: 0x53544146, cue: 0x53544355, set: 0x53545354,
};
function drawFor(seed, salt, entry, i) {
  return draw((seed ^ salt) >>> 0, Math.imul(entry, 4099) + i);
}

/* One of `list` by `weights` (all 1 without them), from a draw u. */
function pickBy(list, u, weights = null) {
  const w = weights ?? list.map(() => 1);
  const sum = w.reduce((a, b) => a + b, 0);
  let x = u * sum;
  let i = 0;
  while (i < list.length - 1 && x >= w[i]) {
    x -= w[i];
    i += 1;
  }
  return list[i];
}

/* The mission's working sets, drawn at the go for `pilots` pilots (the
 * mission's `sets`): { name: [ids] }, each in `from`'s order, or null
 * for a mission with none. A partial shuffle by the seed: every k-subset
 * as likely as another. */
export function drawSets(mission, seed, pilots) {
  if (!mission.sets) {
    return null;
  }
  const out = {};
  for (const [j, [name, def]] of Object.entries(mission.sets).entries()) {
    const keys = Object.keys(def.n).map(Number).sort((a, b) => a - b);
    const key = keys.filter((x) => x <= pilots).at(-1) ?? keys[0];
    const k = Math.min(def.n[key], def.from.length);
    const pool = def.from.slice();
    for (let i = 0; i < k; i += 1) {
      const r = i + Math.floor(drawFor(seed, SALT.set, j, i) * (pool.length - i));
      [pool[i], pool[r]] = [pool[r], pool[i]];
    }
    const chosen = new Set(pool.slice(0, k));
    out[name] = def.from.filter((id) => chosen.has(id));
  }
  return out;
}

/* A target spec's ids: an id, a list of them, or { set: name } (the
 * match's draw, m.sets). */
export function idsOf(spec, sets) {
  if (spec && typeof spec === 'object' && !Array.isArray(spec)) {
    const ids = sets?.[spec.set];
    if (!ids) {
      throw new Error(`war: no set ${spec.set} drawn`);
    }
    return ids;
  }
  return [spec].flat();
}

/* A round of the old kind, as a stage: it ends when its last attacker but
 * the Scouts is gone ('win' or 'damaged'), or when no pilot can fly on
 * ('lost': whatever is left with a target gets through), and after
 * RESULT_MS of its result the next round starts; after the last, the
 * mission is won (lost before then if the output fell under the floor). */
export function round(id, spawns, { last = false, ...more } = {}) {
  const to = last ? 'won' : 'next';
  const why = last ? 'waves' : undefined;
  return {
    id,
    round: true,
    spawns,
    ...more,
    exits: [
      {
        when: { cleared: true }, to, why, after: RESULT_MS, result: 'auto', clear: 'leave',
      },
      {
        when: { allOut: true }, to, why, after: RESULT_MS, result: 'lost', clear: 'through',
      },
    ],
  };
}

/* The stages of a mission written as rounds of waves (each wave's `round`
 * its round, 0 when it has none): what a mission from before stages
 * means, and how the room's own checks still write theirs. */
function stagesFromWaves(waves) {
  const n = Math.max(...waves.map((w) => w.round ?? 0)) + 1;
  return Array.from({ length: n }, (_, k) => round(`round-${k + 1}`, waves.filter((w) => (w.round ?? 0) === k).map(({ round: _r, ...w }) => w), { last: k === n - 1 }));
}

const STAGES = new WeakMap();
/* A mission's stages, each spawn with its index in the flat list
 * (wavesOf) as `si`. Cached: a mission is data the room never changes. */
export function stagesOf(mission) {
  let s = STAGES.get(mission);
  if (!s) {
    const raw = mission.stages ?? stagesFromWaves(mission.waves);
    let si = 0;
    s = raw.map((st) => ({ ...st, spawns: (st.spawns ?? []).map((w) => ({ ...w, si: si++ })) }));
    STAGES.set(mission, s);
  }
  return s;
}

/* Every spawn of every stage, in order, each with `round`, its stage's
 * index: the old flat list of waves, which a birth's `wave` indexes and
 * the view's wave/waves count. */
export function wavesOf(stages) {
  return stages.flatMap((st, k) => (st.spawns ?? []).map(({ si: _si, ...w }) => ({ ...w, round: k })));
}

/* A mission file's mission with its flat list of waves beside its
 * stages, for what reads a mission's waves (the HUD's next wave on a room
 * from before stages, the routes check, the room browser's count). */
export function withWaves(mission) {
  return { ...mission, waves: wavesOf(stagesOf(mission)) };
}

/* How many rounds a match of the mission plays: the view's `rounds`. The
 * round stages on the way from stage `from` to the end along each stage's
 * first exit, a twist's first branch for a twist (every branch of a twist
 * is as many rounds as the others: war:stages holds the data to it). Not
 * every round stage: a twist's other branches are never played. */
export function roundsOf(mission, from = 0) {
  const stages = stagesOf(mission);
  const seen = new Set();
  let n = 0;
  let i = from;
  while (i >= 0 && i < stages.length && !seen.has(i)) {
    seen.add(i);
    const st = stages[i];
    n += st.round ? 1 : 0;
    let to = st.exits?.[0]?.to ?? 'next';
    to = to && typeof to === 'object' ? to.pick[0] : to;
    i = to === 'won' || to === 'lost' ? -1 : to === 'next' ? i + 1 : stages.findIndex((x) => x.id === to);
  }
  return n;
}

/* An angle as the birth carries it, to the milliradian. */
const milli = (v) => Math.round(v * 1000) / 1000;

/* A time in seconds, or a window [lo, hi] drawn by u, as ms. */
function msOf(at, u) {
  const s = Array.isArray(at) ? at[0] + (at[1] - at[0]) * u : (at ?? 0);
  return Math.round(s * 1000);
}

/*
 * Enter stage `idx` at room ms `at`: its state, plain data for the match.
 * The dials are drawn here, once. was: what the last stage left
 * ({ kills: { sector: n }, spent: share, sector: the last sector drawn }),
 * or null; pilots: how many are here.
 */
export function enter(mission, idx, at, seed, entry, { was = null, pilots = 1 } = {}) {
  const st = stagesOf(mission)[idx];
  const pace = mission.pace?.[pilots] ?? 1;
  let lastSector = was?.sector ?? null;
  /* The first spawn by its window's start: the one the adaptive timing
   * moves. */
  const lo = (w) => (Array.isArray(w.at) ? w.at[0] : w.at ?? 0);
  let first = -1;
  st.spawns.forEach((w, i) => {
    if (!w.when && (first < 0 || lo(w) < lo(st.spawns[first]))) {
      first = i;
    }
  });
  const shift = mission.adapt && was ? (was.spent >= ADAPT_HIGH ? ADAPT_LATE : was.spent < ADAPT_LOW ? ADAPT_EARLY : 1) : 1;
  const due = st.spawns.map((w, i) => {
    let route = w.route;
    let sector = null;
    if (Array.isArray(w.route)) {
      route = w.route[Math.floor(drawFor(seed, SALT.route, entry, i) * w.route.length)];
    } else if (w.route && typeof w.route === 'object') {
      const all = [w.route.sector].flat();
      const open = all.length > 1 && lastSector != null ? all.filter((s) => s !== lastSector) : all;
      const weights = mission.adapt && was ? open.map((s) => 1 / (1 + (was.kills?.[s] ?? 0))) : null;
      sector = pickBy(open, drawFor(seed, SALT.sector, entry, i), weights);
      const fam = mission.sectors[sector];
      route = fam[Math.floor(drawFor(seed, SALT.route, entry, i) * fam.length)];
      lastSector = sector;
    }
    const az = Array.isArray(w.az) ? milli(w.az[0] + (w.az[1] - w.az[0]) * drawFor(seed, SALT.az, entry, i)) : null;
    const kind = Array.isArray(w.kind) ? w.kind[Math.floor(drawFor(seed, SALT.kind, entry, i) * w.kind.length)] : (w.kind ?? null);
    const ms = Math.round(msOf(w.at, drawFor(seed, SALT.at, entry, i)) * pace * (i === first ? shift : 1));
    return {
      i, t: w.when ? null : at + ms, ms, route, sector, az, kind, born: false,
    };
  });
  return {
    idx, id: st.id, at, entry, pace, due, ev: [], cued: [], obj: {}, ready: {}, hold: {}, text: null, music: null, sector: lastSector,
  };
}

/* The kind of a spawn's k-th attacker: its mix's draw, or the group's. */
export function slotKind(w, d, k, seed, entry) {
  if (!w.mix) {
    return d.kind;
  }
  return pickBy(w.mix.map((x) => x[0]), drawFor(seed, SALT.mix, entry, d.i * 64 + k), w.mix.map((x) => x[1]));
}

/*
 * Something that happened, for the triggers, on the stage's log:
 *   { t, e: 'born', id, kind, group, sector, cross? }
 *   { t, e: 'gone', id, kind, group, sector, how, hit? }  how: 'kill'
 *                  (a warhead), 'wire', 'arrive' (at its target, or
 *                  through at a lost round's end) or 'leave'
 *   { t, e: 'down', target }   a target hit for the first time
 *   { t, e: 'spend', seat }
 * A target's fall and an opening are also the match's (m.downAt,
 * m.breaches), for the triggers that ask whether one ever happened.
 */
export function note(st, ev) {
  st.ev.push(ev);
}

/* The stage's own attackers of a selection { group, kind }. */
function chosen(st, sel, e) {
  return st.ev.filter((x) => x.e === e && (sel.group == null || x.group === sel.group) && (sel.kind == null || x.kind === sel.kind));
}

/* Every one of a selection born and every one gone `how` (a set, or any):
 * at the last going, or null. */
function allGone(mission, ctx, sel, hows) {
  const st = ctx.st;
  const spawns = stagesOf(mission)[st.idx].spawns;
  /* The selection's spawns: of its group, and of its kind (a mix's slots
   * may be any of its kinds). */
  const mine = st.due.filter((d) => {
    const w = spawns[d.i];
    if (sel.group != null && w.group !== sel.group) {
      return false;
    }
    return sel.kind == null || d.kind === sel.kind || (w.mix ?? []).some((x) => x[0] === sel.kind);
  });
  if (!mine.length || !mine.every((d) => d.born)) {
    return null;
  }
  const born = chosen(st, sel, 'born');
  if (!born.length) {
    return null;
  }
  const gone = new Map(chosen(st, sel, 'gone').map((x) => [x.id, x]));
  let t = -Infinity;
  for (const b of born) {
    const g = gone.get(b.id);
    if (!g || (hows && !hows.includes(g.how))) {
      return null;
    }
    t = Math.max(t, g.t);
  }
  return t;
}

/* A target id is `want`: itself, or a part of that name ('intake'). */
const isPart = (id, want) => id === want || id.startsWith(`${want}-`);

/*
 * When `trig` fired, room ms, or null if it has not (yet). ctx:
 *   mission
 *   m          the match (output, downAt, breaches, path)
 *   st         the stage's state
 *   f          the judgement's frontier: nothing before it is unknown
 *   allBorn    every spawn of the stage born
 *   cleared    no attacker alive but Scouts
 *   lastGone   when the last attacker went
 *   allOut     no pilot here can fly on
 *   spent      the share of the airframes the pilots here have spent
 *   here       the seats here
 *   pilots     [{ seat, p: [x, y, z] }] at f, the seats here with a pose
 */
export function fired(trig, ctx) {
  const { st, f } = ctx;
  const mission = ctx.mission;
  if (trig.time != null) {
    const t = st.at + Math.round(trig.time * 1000);
    return t <= f ? t : null;
  }
  if (trig.cleared) {
    return ctx.allBorn && ctx.cleared ? Math.max(ctx.lastGone ?? f, st.at) : null;
  }
  if (trig.allOut) {
    return ctx.allOut ? f : null;
  }
  if (trig.destroyed != null) {
    const ids = [trig.destroyed].flat();
    const n = trig.n ?? ids.length;
    const ts = ids.map((id) => ctx.m.downAt?.[id]).filter((t) => t != null).sort((a, b) => a - b);
    return ts.length >= n ? Math.max(st.at, ts[n - 1]) : null;
  }
  if (trig.hit != null) {
    const want = idsOf(trig.hit, ctx.m.sets);
    const ts = st.ev.filter((x) => x.e === 'down' && want.some((w) => isPart(x.target, w))).map((x) => x.t);
    const n = trig.n ?? 1;
    return ts.length >= n ? ts[n - 1] : null;
  }
  if (trig.killed != null || trig.leaked != null || trig.left != null) {
    const n = trig.killed ?? trig.leaked ?? trig.left;
    const how = trig.killed != null ? 'kill' : trig.leaked != null ? 'arrive' : 'leave';
    const ts = chosen(st, trig, 'gone').filter((x) => x.how === how && (!trig.onTarget || x.hit)).map((x) => x.t);
    return ts.length >= n ? ts[n - 1] : null;
  }
  if (trig.born) {
    const ts = chosen(st, trig.born, 'born').map((x) => x.t).filter((t) => t <= f);
    return ts.length ? Math.min(...ts) : null;
  }
  if (trig.down) {
    return allGone(mission, ctx, trig.down, ['kill', 'wire']);
  }
  if (trig.gone) {
    return allGone(mission, ctx, trig.gone, null);
  }
  if (trig.crossed != null) {
    const gone = new Map(chosen(st, trig, 'gone').map((x) => [x.id, x.t]));
    const at = (b) => b.cross?.[trig.crossed];
    const ts = chosen(st, trig, 'born').filter((b) => at(b) != null && at(b) <= f && !(gone.get(b.id) < at(b))).map(at);
    return ts.length ? Math.min(...ts) : null;
  }
  if (trig.spent != null) {
    if (!(ctx.spent >= trig.spent)) {
      return null;
    }
    const spends = st.ev.filter((x) => x.e === 'spend');
    return spends.length ? spends[spends.length - 1].t : st.at;
  }
  if (trig.output) {
    const { below, atMost } = trig.output;
    const ok = below != null ? ctx.m.output < below : ctx.m.output <= atMost;
    if (!ok) {
      return null;
    }
    const downs = st.ev.filter((x) => x.e === 'down');
    return downs.length ? downs[downs.length - 1].t : st.at;
  }
  if (trig.region) {
    return regionFired(trig, ctx);
  }
  if (trig.breach != null) {
    const e = (ctx.m.breaches ?? []).find((x) => trig.breach === true || x.target === trig.breach);
    return e ? Math.max(st.at, e.at) : null;
  }
  if (trig.ready) {
    const ts = ctx.here.map((seat) => st.ready[seat]);
    return ctx.here.length && ts.every((t) => t != null) ? Math.max(...ts) : null;
  }
  if (trig.objective != null) {
    const o = st.obj[trig.objective];
    if (trig.is === 'active') {
      return o?.from ?? null;
    }
    return o && o.state === (trig.is ?? 'done') ? o.t : null;
  }
  if (trig.held != null) {
    const o = st.obj[trig.held];
    const def = (stagesOf(mission)[st.idx].objectives ?? []).find((x) => x.id === trig.held);
    if (o?.from == null) {
      return null;
    }
    const t = o.from + Math.round(def.ms * trig.f);
    return t <= f && !(o.state === 'failed' && o.t <= t) ? t : null;
  }
  if (trig.visited != null) {
    const v = (ctx.m.path ?? []).find((x) => x.id === trig.visited);
    return v ? Math.max(st.at, v.at) : null;
  }
  if (trig.all) {
    const ts = trig.all.map((x) => fired(x, ctx));
    return ts.every((t) => t != null) ? Math.max(...ts) : null;
  }
  if (trig.any) {
    const ts = trig.any.map((x) => fired(x, ctx)).filter((t) => t != null);
    return ts.length ? Math.min(...ts) : null;
  }
  throw new Error(`war: a trigger of no kind: ${JSON.stringify(trig)}`);
}

/* A region trigger: in at the frontier now, and since when without a
 * break (st.hold, by the trigger's text), so { ms } is a stay. */
function regionFired(trig, ctx) {
  const { st, f } = ctx;
  const key = JSON.stringify(trig);
  const { at, r, y } = trig.region;
  const inside = (p) => (p[0] - at[0]) ** 2 + (p[2] - at[1]) ** 2 <= r * r && (!y || (p[1] >= y[0] && p[1] <= y[1]));
  const ins = ctx.pilots.filter((q) => inside(q.p));
  const ok = (trig.pilots ?? 'any') === 'all' ? ctx.here.length > 0 && ins.length === ctx.here.length : ins.length > 0;
  const h = st.hold[key];
  if (h && h.done != null) {
    return h.done;
  }
  if (!ok) {
    delete st.hold[key];
    return null;
  }
  const from = h ? h.from : f;
  st.hold[key] = { from };
  const ms = trig.ms ?? 0;
  if (f - from >= ms) {
    st.hold[key].done = from + ms;
    return from + ms;
  }
  return null;
}

/* When a hold objective started holding, or null. */
function holdFrom(o, ctx) {
  return o.from ? fired(o.from, ctx) : ctx.st.at;
}

/* Settle the stage's objectives that have now done or failed. A hold's
 * start is kept once it fires (st.obj[id] { state: 'active', from }), so
 * the view reads it and never runs a trigger. */
export function objectives(ctx) {
  const st = ctx.st;
  for (const o of stagesOf(ctx.mission)[st.idx].objectives ?? []) {
    const had = st.obj[o.id];
    if (had && had.state !== 'active') {
      continue;
    }
    let done = o.done ? fired(o.done, ctx) : null;
    if (o.ms != null) {
      const from = had?.from ?? holdFrom(o, ctx);
      if (from != null && !had) {
        st.obj[o.id] = { state: 'active', from };
      }
      const t = from == null ? null : from + o.ms;
      done = t != null && t <= ctx.f ? t : null;
    }
    const fail = o.fail ? fired(o.fail, ctx) : null;
    if (done != null && (fail == null || done <= fail)) {
      st.obj[o.id] = { ...st.obj[o.id], state: 'done', t: done };
    } else if (fail != null) {
      st.obj[o.id] = { ...st.obj[o.id], state: 'failed', t: fail };
    }
  }
}

/* Whether any objective of the stage failed. */
export function failedAny(st) {
  return Object.values(st.obj).some((o) => o.state === 'failed');
}

/* The stage's objectives as the view shows them: text, state, and for a
 * count how far it has got, for a hold how long it has been held (ms, to
 * the frontier). */
export function objectivesView(ctx) {
  const st = ctx.st;
  return (stagesOf(ctx.mission)[st.idx].objectives ?? []).map((o) => {
    const state = st.obj[o.id]?.state ?? 'active';
    const out = { id: o.id, text: o.text, kind: o.kind ?? null, state };
    const d = o.done;
    if (d && (d.killed != null || d.leaked != null)) {
      const n = d.killed ?? d.leaked;
      const k = chosen(st, d, 'gone').filter((x) => x.how === (d.killed != null ? 'kill' : 'arrive') && (!d.onTarget || x.hit)).length;
      out.progress = [Math.min(n, k), n];
    } else if (d && d.destroyed != null) {
      const ids = [d.destroyed].flat();
      out.progress = [ids.filter((id) => ctx.m.downAt?.[id] != null).length, d.n ?? ids.length];
    } else if (d && d.hit != null) {
      const want = idsOf(d.hit, ctx.m.sets);
      out.progress = [Math.min(d.n ?? 1, st.ev.filter((x) => x.e === 'down' && want.some((w) => isPart(x.target, w))).length), d.n ?? 1];
    }
    if (o.ms != null) {
      /* A hold running is told by when it began (heldFrom, room ms, as
       * objectives() kept it), so a screen counts it on its own clock
       * between the room's views; a settled one by how long it was held. */
      const from = st.obj[o.id]?.from ?? null;
      out.ms = o.ms;
      if (state === 'active') {
        out.heldFrom = from;
        out.heldMs = from == null ? 0 : Math.max(0, Math.min(o.ms, ctx.f - from));
      } else {
        out.heldMs = state === 'done' ? o.ms : from == null ? 0 : Math.max(0, Math.min(o.ms, st.obj[o.id].t - from));
      }
    }
    return out;
  });
}

/* The hoists a stage's opening holds drive, as the view publishes them
 * for the room's damage, the map and the flood (TECH-NEEDS T1.9): [{ gate,
 * at, open_m }], each the hoist starting at room ms `at` toward open_m
 * metres at hoist.js's one rate (openAt reads them). A hold's gates start
 * at its start; one hit before then never moves, one hit on the way stops
 * where it was (m.downAt: a target's first hit). m.gates are the moves of
 * the stages before, which a stop starts from. */
export function gatesOf(mission, st, m) {
  const out = [];
  for (const o of stagesOf(mission)[st.idx].objectives ?? []) {
    const from = st.obj[o.id]?.from;
    if (o.open == null || from == null) {
      continue;
    }
    for (const gate of idsOf(o.targets, m.sets)) {
      const down = m.downAt?.[gate];
      if (down != null && down <= from) {
        continue;
      }
      out.push({ gate, at: from, open_m: o.open });
      if (down != null) {
        out.push({ gate, at: down, open_m: openAt([...(m.gates ?? []), ...out], gate, down) });
      }
    }
  }
  return out;
}

/* Whether a mission's spill runs at room ms t: a gate its gates have
 * raised over Free Flight's opening. */
export function spilling(gates, t) {
  return [...new Set((gates ?? []).map((g) => g.gate))].some((gate) => openAt(gates, gate, t) > FREE_OPEN_M);
}

/* What a hit on `id` costs the output in the stage: its mw, times the
 * stage's worth for a set holding it. */
export function worthOf(mission, st, m, id) {
  const worth = st ? stagesOf(mission)[st.idx].worth : null;
  let x = 1;
  for (const [set, f] of Object.entries(worth ?? {})) {
    if (m.sets?.[set]?.includes(id)) {
      x *= f;
    }
  }
  return mission.targets[id].mw * x;
}

/* The triggered spawns whose trigger has now fired get their time; those
 * whose skip has fired are dropped. */
export function arm(ctx) {
  const st = ctx.st;
  const spawns = stagesOf(ctx.mission)[st.idx].spawns;
  for (const d of st.due) {
    if (d.born) {
      continue;
    }
    if (spawns[d.i].skip && fired(spawns[d.i].skip, ctx) != null) {
      d.born = true;
      d.skipped = true;
      continue;
    }
    if (d.t == null) {
      const t = fired(spawns[d.i].when, ctx);
      if (t != null) {
        d.t = t + d.ms;
      }
    }
  }
}

/* The spawns due by `upTo` (announced ahead: the room passes its now plus
 * the birth lead), in time order then list order, and marked born. */
export function dueSpawns(mission, st, upTo) {
  const spawns = stagesOf(mission)[st.idx].spawns;
  const out = st.due.filter((d) => !d.born && d.t != null && d.t <= upTo).sort((a, b) => a.t - b.t || a.i - b.i);
  for (const d of out) {
    d.born = true;
  }
  return out.map((d) => ({ ...d, w: spawns[d.i] }));
}

/* The next birth not yet announced, room ms, or null. */
export function nextDue(st) {
  const ts = st.due.filter((d) => !d.born && d.t != null).map((d) => d.t);
  return ts.length ? Math.min(...ts) : null;
}

export function allBorn(st) {
  return st.due.every((d) => d.born);
}

/* The cues now due, in time then list order, marked: [{ t, i, cue }]. */
export function dueCues(ctx) {
  const st = ctx.st;
  const out = [];
  for (const [i, c] of (stagesOf(ctx.mission)[st.idx].cues ?? []).entries()) {
    if (st.cued.includes(i)) {
      continue;
    }
    const base = c.when ? fired(c.when, ctx) : st.at;
    if (base == null) {
      continue;
    }
    const t = base + Math.round(msOf(c.at, drawFor(ctx.m.seed, SALT.cue, st.entry, i)) * (c.when ? 1 : st.pace ?? 1));
    if (t > ctx.f) {
      continue;
    }
    st.cued.push(i);
    if (c.text !== undefined) {
      st.text = c.text;
    }
    if (c.music !== undefined) {
      st.music = c.music;
    }
    out.push({ t, i, cue: c });
  }
  return out.sort((a, b) => a.t - b.t || a.i - b.i);
}

/* The exit that fires first, with when: { exit, t, k } or null. */
export function exitDue(ctx) {
  let best = null;
  for (const [k, x] of (stagesOf(ctx.mission)[ctx.st.idx].exits ?? []).entries()) {
    const t = fired(x.when, ctx);
    if (t != null && (!best || t < best.t)) {
      best = { exit: x, t, k };
    }
  }
  return best;
}

/* An exit's beat, ms: its after, or its window drawn. */
export function beatOf(x, seed, st, k) {
  return msOf(Array.isArray(x.after) ? x.after.map((v) => v / 1000) : (x.after ?? 0) / 1000, drawFor(seed, SALT.after, st.entry, k));
}

/* What a stage left for the next to adapt to (enter's `was`): its kills
 * by sector, the share of airframes spent, and the last sector drawn. */
export function leftBy(st, spent) {
  const kills = {};
  for (const x of st.ev) {
    if (x.e === 'gone' && x.how === 'kill' && x.sector) {
      kills[x.sector] = (kills[x.sector] ?? 0) + 1;
    }
  }
  return { kills, spent, sector: st.sector };
}

/* Where an exit goes: a stage's index, or 'won' / 'lost'. */
export function target(mission, st, x, seed, k) {
  const stages = stagesOf(mission);
  let to = x.to ?? 'next';
  if (to && typeof to === 'object') {
    to = pickBy(to.pick, drawFor(seed, SALT.pick, st.entry, k), to.w);
  }
  if (to === 'won' || to === 'lost') {
    return to;
  }
  if (to === 'next') {
    if (st.idx + 1 >= stages.length) {
      throw new Error(`war: ${mission.id} stage ${st.id} exits to 'next' after the last`);
    }
    return st.idx + 1;
  }
  const i = stages.findIndex((s) => s.id === to);
  if (i < 0) {
    throw new Error(`war: ${mission.id} stage ${st.id} exits to no stage ${to}`);
  }
  return i;
}

/*
 * The first time each of the mission's lines is crossed by a planned
 * flight, room ms, sampled every CROSS_MS on poseAt and the crossing
 * found to the millisecond between: { line: t }, or null with none. The
 * room computes it once, at the birth, from the plan every screen flies.
 */
export const CROSS_MS = 100;
export function crossings(mission, plan) {
  const lines = mission.lines;
  if (!lines || !Number.isFinite(plan.tEnd)) {
    return null;
  }
  const out = {};
  for (const [name, [[ax, az], [bx, bz]]] of Object.entries(lines)) {
    /* Which side of the line the flight is on at t, and whether it is
     * over the segment there. */
    const side = (t) => {
      const p = poseAt(plan, t).p;
      const u = ((p[0] - ax) * (bx - ax) + (p[2] - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2);
      return { left: (bx - ax) * (p[2] - az) - (bz - az) * (p[0] - ax) < 0, on: u >= 0 && u <= 1 };
    };
    let lo = plan.t0;
    let a = side(lo);
    while (lo < plan.tEnd) {
      const hi = Math.min(plan.tEnd, lo + CROSS_MS);
      const b = side(hi);
      if (a.left !== b.left && (a.on || b.on)) {
        let l = lo;
        let h = hi;
        while (h - l > 1) {
          const mid = Math.floor((l + h) / 2);
          if (side(mid).left === a.left) {
            l = mid;
          } else {
            h = mid;
          }
        }
        out[name] = h;
        break;
      }
      lo = hi;
      a = b;
    }
  }
  return Object.keys(out).length ? out : null;
}
