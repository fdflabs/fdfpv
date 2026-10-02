/*
 * stages.js: a war mission as a stage graph (the owner, 2026-10-02: "story
 * driven ... in stages ... buildup", and of the old missions, "things
 * coming in at the same predictable places ... wave after wave of the
 * same"). The room (edge/rooms/war.js) runs it and is its only authority;
 * every screen hears what it decided (births, cues, the view's `stage`)
 * and draws that. Pure: plain data in and out, no clock but the room ms
 * handed in, so the room's match (which is JSON, stored and restored over
 * a restart) holds the whole of a stage's state.
 *
 * A MISSION is { id, title, map, targets, routes, output, floorMw, starMw,
 * airframes, stages, intro? } (itaipu-1.js is the model). Its stages are
 * an array; the first is entered at the go. A STAGE:
 *
 *   id          a name, unique in the mission
 *   round       true: a round of the old kind. Entering it gives every
 *               pilot the mission's airframes again (war.js rounds), it
 *               counts in the view's round/rounds, and its exit's result
 *               counts for the stars. A stage that is not a round keeps
 *               the rack as it is: a story's stages run on into each other
 *   spawns      groups of attackers, below
 *   objectives  [{ id, text, done?, fail? }]: text a string key the HUD
 *               shows; done and fail are triggers, and the first of them
 *               to fire settles it ('done' or 'failed'), for the HUD and
 *               for an exit's { objective } trigger. An objective whose
 *               done is a { killed } or { leaked } trigger shows its count
 *   cues        [{ at | when, radio | music | cutaway | text }]: things
 *               every screen is told when they fall due, at `at` seconds
 *               after the stage's entry or when the trigger `when` fires
 *               (plus `at` seconds, when both are given):
 *                 radio    a voice line's id (assets/audio/war/lines.json)
 *                 music    the war bed's track ('intro', 'combat', '' for
 *                          none)
 *                 cutaway  { target | at: [x, y, z], from?: [x, y, z],
 *                          fov?, ms? }: a short look at a place
 *                          (src/render/warcutaway.js decides how)
 *                 text     a string key for the HUD's stage line
 *   exits       [{ when, to, after?, result?, clear?, why? }], below
 *
 * A SPAWN is a wave of the old kind, { at, kind, n, per, route, target,
 * spread, group? }, with three things a seed may choose, all drawn when
 * the stage is entered, so every pilot meets the same and a replay of the
 * seed meets it again:
 *
 *   at      seconds after the stage's entry, or [lo, hi]: a time in that
 *           window
 *   route   a route's id, or a list of them: one of the family
 *   az      [lo, hi] radians: the route turned about the vertical through
 *           its own last point by an angle in that window, positive to
 *           the left (routes.js planAgent), so the same approach comes in
 *           from another bearing on each seed
 *   when    a trigger: born `at` seconds after it fires, not after the
 *           entry
 *   group   a name for the triggers to count it by ({ killed, group })
 *
 * n and per size it by the pilots here when it is announced (index.js
 * waveSize), as ever.
 *
 * A TRIGGER is one of these objects; each fires at a room ms, which is
 * when it happened on the judgement's timeline (war.js), never when the
 * room noticed, so lag decides nothing:
 *
 *   { time: s }                    s seconds after the stage's entry
 *   { cleared: true }              every spawn of the stage born, and no
 *                                  attacker but Scouts alive
 *   { allOut: true }               no pilot here can still fly
 *                                  (war.js stillFlying)
 *   { destroyed: id | [ids], n? }  n of those targets hit (all of them
 *                                  when n is not given), ever in the
 *                                  match; fires no earlier than the entry
 *   { killed: n, kind?, group? }   n attackers (of that kind, of that
 *                                  group) killed by warheads in the stage
 *   { leaked: n, kind?, group?, hit? }
 *                                  n attackers of the stage got to the
 *                                  end of their route with a target (hit:
 *                                  true, only those that hit it)
 *   { output: { below } } or { output: { atMost } }
 *                                  the output under / at most that, MW
 *   { region: { at: [x, z], r, y?: [lo, hi] }, pilots?: 'any' | 'all',
 *     ms? }                        pilots inside the cylinder (any of them,
 *                                  or every one here), for ms in a row
 *   { breach: id | true }          an opening at that target, or any
 *                                  (the dam break, DAMBREAK-CONTRACT.md:
 *                                  war.js breach())
 *   { ready: true }                every pilot here said ready in the
 *                                  stage ({ type: 'war', op: 'ready' })
 *   { objective: id, is: 'done' | 'failed' }
 *   { all: [triggers] }            the last of them
 *   { any: [triggers] }            the first of them
 *
 * AN EXIT leaves the stage the moment its trigger fires: the earliest
 * of them, the first listed on a tie.
 *
 *   to      a stage's id, 'next' (the one after in the list), 'won',
 *           'lost', or { pick: [ids], w?: [weights] }: one of them drawn
 *           from the seed (the twist)
 *   after   ms between this stage and the next, the round's result card
 *           (war.js roundState 'result'); 0 enters the next at once
 *   result  'auto' ('win', or 'damaged' when the stage cost output),
 *           'win', 'damaged' or 'lost': a round's result, for the stars
 *   clear   what happens to the attackers still alive: 'through' (each
 *           with a target gets through, as an arrival would), 'leave'
 *           (they go, harmlessly) or nothing: they fly on into the next
 *           stage
 *   why     the end's reason, with to 'won' or 'lost'
 *
 * The match is lost the instant the output is under floorMw, whatever
 * the stage (war.js settle).
 *
 * DETERMINISM. Every choice is draw(seed, n) below, an integer hash on
 * the match's seed, the same on every engine. A stage's draws mix in how
 * many stages the match has entered, so a stage entered twice draws
 * afresh, and each kind of draw has its own salt, so adding one never
 * moves another.
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

/* A round's result shows this long before the next round starts. */
export const RESULT_MS = 6000;

/* A seeded draw in [0, 1) from two integers, the same on every engine. */
export function draw(seed, id) {
  let h = Math.imul((seed ^ Math.imul(id, 0x9e3779b1)) >>> 0, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const SALT = {
  at: 0x53544154, route: 0x53545254, az: 0x5354415a, pick: 0x5354504b,
};
function drawFor(seed, salt, entry, i) {
  return draw((seed ^ salt) >>> 0, Math.imul(entry, 4099) + i);
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
 * stages, for what reads a mission's waves (the HUD's next wave, the
 * routes check, the room browser's wave count). */
export function withWaves(mission) {
  return { ...mission, waves: wavesOf(stagesOf(mission)) };
}

/* How many of the mission's stages are rounds: the view's `rounds`. */
export function roundsOf(mission) {
  return stagesOf(mission).filter((st) => st.round).length;
}

/*
 * Enter stage `idx` at room ms `at`: its state, plain data for the
 * match. The windows and families are drawn here, once.
 */
export function enter(mission, idx, at, seed, entry) {
  const st = stagesOf(mission)[idx];
  const due = st.spawns.map((w, i) => {
    const route = Array.isArray(w.route) ? w.route[Math.floor(drawFor(seed, SALT.route, entry, i) * w.route.length)] : w.route;
    const az = Array.isArray(w.az) ? milli(w.az[0] + (w.az[1] - w.az[0]) * drawFor(seed, SALT.az, entry, i)) : null;
    const s = Array.isArray(w.at) ? w.at[0] + (w.at[1] - w.at[0]) * drawFor(seed, SALT.at, entry, i) : (w.at ?? 0);
    return {
      i, t: w.when ? null : at + Math.round(s * 1000), ms: Math.round(s * 1000), route, az, born: false,
    };
  });
  return {
    idx, id: st.id, at, entry, due, ev: [], cued: [], obj: {}, ready: {}, hold: {}, text: null, music: null,
  };
}

/* An angle as the birth carries it, to the milliradian. */
const milli = (v) => Math.round(v * 1000) / 1000;

/*
 * Something that happened in the stage, for the triggers: [t, type, a,
 * b, hit] on its log, where type is
 *   'kill'   a = kind, b = group (a warhead's)
 *   'leak'   a = kind, b = group, hit whether it hit its target
 *   'down'   a = target
 * A target's fall and an opening are the match's, not the stage's
 * (m.downAt, m.breaches): a stage asks whether one has happened at all.
 */
export function note(st, t, type, a = null, b = null, hit = false) {
  st.ev.push([t, type, a, b, hit]);
}

/*
 * When `trig` fired, room ms, or null if it has not (yet). ctx:
 *   m          the match (down, downAt, output)
 *   st         the stage's state
 *   mission
 *   f          the judgement's frontier: nothing before it is unknown
 *   allBorn    every spawn of the stage born
 *   cleared    no attacker alive but Scouts
 *   lastGone   when the last attacker went
 *   allOut     no pilot here can fly on
 *   here       the seats here
 *   pilots     [{ seat, p: [x, y, z] }] at f, the seats here with a pose
 */
export function fired(trig, ctx) {
  const { st, f } = ctx;
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
    const ids = Array.isArray(trig.destroyed) ? trig.destroyed : [trig.destroyed];
    const n = trig.n ?? ids.length;
    const ts = ids.map((id) => ctx.m.downAt?.[id]).filter((t) => t != null).sort((a, b) => a - b);
    return ts.length >= n ? Math.max(st.at, ts[n - 1]) : null;
  }
  if (trig.killed != null || trig.leaked != null) {
    const type = trig.killed != null ? 'kill' : 'leak';
    const n = trig.killed ?? trig.leaked;
    const ts = st.ev.filter((e) => e[1] === type && (trig.kind == null || e[2] === trig.kind) && (trig.group == null || e[3] === trig.group)
      && (!trig.hit || e[4])).map((e) => e[0]);
    return ts.length >= n ? ts[n - 1] : null;
  }
  if (trig.output) {
    const { below, atMost } = trig.output;
    const ok = below != null ? ctx.m.output < below : ctx.m.output <= atMost;
    if (!ok) {
      return null;
    }
    const downs = st.ev.filter((e) => e[1] === 'down');
    return downs.length ? downs[downs.length - 1][0] : st.at;
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
    return o && o.state === (trig.is ?? 'done') ? o.t : null;
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

/* Settle the stage's objectives that have now done or failed. */
export function objectives(mission, ctx) {
  const st = ctx.st;
  for (const o of stagesOf(mission)[st.idx].objectives ?? []) {
    if (st.obj[o.id]) {
      continue;
    }
    const done = o.done ? fired(o.done, ctx) : null;
    const fail = o.fail ? fired(o.fail, ctx) : null;
    if (done != null && (fail == null || done <= fail)) {
      st.obj[o.id] = { state: 'done', t: done };
    } else if (fail != null) {
      st.obj[o.id] = { state: 'failed', t: fail };
    }
  }
}

/* The stage's objectives as the view shows them: text, state and, for a
 * count, how far it has got. */
export function objectivesView(mission, st, ctx) {
  return (stagesOf(mission)[st.idx].objectives ?? []).map((o) => {
    const out = { id: o.id, text: o.text, state: st.obj[o.id]?.state ?? 'active' };
    const d = o.done;
    if (d && (d.killed != null || d.leaked != null)) {
      const type = d.killed != null ? 'kill' : 'leak';
      const n = d.killed ?? d.leaked;
      const k = st.ev.filter((e) => e[1] === type && (d.kind == null || e[2] === d.kind) && (d.group == null || e[3] === d.group) && (!d.hit || e[4])).length;
      out.progress = [Math.min(n, k), n];
    }
    if (d && d.destroyed != null && ctx) {
      const ids = Array.isArray(d.destroyed) ? d.destroyed : [d.destroyed];
      out.progress = [ids.filter((id) => ctx.m.downAt?.[id] != null).length, d.n ?? ids.length];
    }
    return out;
  });
}

/* The triggered spawns whose trigger has now fired get their time. */
export function arm(mission, ctx) {
  const st = ctx.st;
  const spawns = stagesOf(mission)[st.idx].spawns;
  for (const d of st.due) {
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
export function dueCues(mission, ctx) {
  const st = ctx.st;
  const out = [];
  for (const [i, c] of (stagesOf(mission)[st.idx].cues ?? []).entries()) {
    if (st.cued.includes(i)) {
      continue;
    }
    const base = c.when ? fired(c.when, ctx) : st.at;
    if (base == null) {
      continue;
    }
    const t = base + Math.round((c.at ?? 0) * 1000);
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
export function exitDue(mission, ctx) {
  let best = null;
  for (const [k, x] of (stagesOf(mission)[ctx.st.idx].exits ?? []).entries()) {
    const t = fired(x.when, ctx);
    if (t != null && (!best || t < best.t)) {
      best = { exit: x, t, k };
    }
  }
  return best;
}

/* Where an exit goes: a stage's index, or 'won' / 'lost'. */
export function target(mission, st, x, seed, k) {
  const stages = stagesOf(mission);
  let to = x.to ?? 'next';
  if (to && typeof to === 'object') {
    const w = to.w ?? to.pick.map(() => 1);
    const sum = w.reduce((a, b) => a + b, 0);
    let u = drawFor(seed, SALT.pick, st.entry, k) * sum;
    let i = 0;
    while (i < w.length - 1 && u >= w[i]) {
      u -= w[i];
      i += 1;
    }
    to = to.pick[i];
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
 * A mission's stages, checked as data, so a wrong one fails loudly where
 * it is written: every exit's stage, route, target and trigger is one the
 * mission has. Returns a list of problems, empty when it is sound.
 */
export function lint(mission) {
  const out = [];
  const stages = stagesOf(mission);
  const ids = new Set(stages.map((s) => s.id));
  if (ids.size !== stages.length) {
    out.push('two stages share an id');
  }
  const KEYS = ['time', 'cleared', 'allOut', 'destroyed', 'killed', 'leaked', 'output', 'region', 'breach', 'ready', 'objective', 'all', 'any'];
  const trig = (x, where) => {
    if (!x || typeof x !== 'object' || !KEYS.some((k) => x[k] != null)) {
      out.push(`${where}: not a trigger`);
      return;
    }
    for (const id of x.destroyed == null ? [] : [x.destroyed].flat()) {
      if (!mission.targets[id]) {
        out.push(`${where}: no target ${id}`);
      }
    }
    for (const y of [...(x.all ?? []), ...(x.any ?? [])]) {
      trig(y, where);
    }
  };
  for (const [i, st] of stages.entries()) {
    const where = `${mission.id} ${st.id}`;
    for (const w of st.spawns) {
      for (const r of [w.route].flat()) {
        if (!mission.routes[r]) {
          out.push(`${where}: no route ${r}`);
        }
      }
      for (const t of w.target == null ? [] : [w.target].flat()) {
        if (!mission.targets[t]) {
          out.push(`${where}: no target ${t}`);
        }
      }
      if (w.when) {
        trig(w.when, where);
      }
    }
    for (const o of st.objectives ?? []) {
      if (o.done) {
        trig(o.done, `${where} ${o.id}`);
      }
      if (o.fail) {
        trig(o.fail, `${where} ${o.id}`);
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
