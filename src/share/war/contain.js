/*
 * contain.js: when the face opens (docs/campaign/MISSIONS.md 1.9, TECH-NEEDS
 * T1.6). An opening the room judges in an intake, a penstock or a spillway
 * gate (edge/rooms/war.js breach, the dam break's contract) starts a
 * closure: the emergency gantry that serves the opened structure lowers
 * its stoplogs, and the squad holds the gantry while it does. Pure: the
 * match keeps the closures (m.contain), and everything here is a function
 * of them and a room ms, so a restore, a late joiner and a replay agree.
 *
 * A CLOSURE is { target, gantry, at, ms, retarget, lost, said }:
 *
 *   target    the opened structure's id
 *   gantry    the gantry serving it: GANTRY_OF its part
 *   at        the room ms of the opening
 *   ms        how long the stoplogs take: CLOSE_MS of its part
 *   retarget  the room ms of the group the Aggressor turned at the gantry
 *             for it (war.js births), or null while none has been
 *   lost      the room ms the gantry was hit while it closed this one, or
 *             null
 *   said      the keys of its lines already told (linesDue)
 *
 * One gantry closes one opening at a time (1.9 point 7): a closure starts
 * at its opening or when the one before it on the same gantry is held,
 * whichever is later, and is held `ms` after it starts (schedule). The
 * output its opening cost stays lost (point 5; damage.js: an opening loses
 * its target as a hit does), so a closure restores nothing: what it buys
 * is the plant kept running. Its gantry hit while it runs shuts the plant
 * down, and the mission is lost at once (point 6).
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

/* The gantry serving each part that can open (1.9 point 2): the intakes'
 * gantry closes an intake, and a penstock from upstream at its intake's
 * gate; the spillway's closes a gate. */
export const GANTRY_OF = Object.freeze({ intake: 'gantry-intakes', penstock: 'gantry-intakes', gate: 'gantry-spillway' });

/* How long the stoplogs take, ms (1.9 point 2: 120 s for an intake or a
 * penstock, 150 s for a gate). */
export const CLOSE_MS = Object.freeze({ intake: 120000, penstock: 120000, gate: 150000 });

/* The crest's height, m (src/maps/itaipu/dam/index.js CREST_Y), and half
 * the intake gantry's legs (INTAKE_CRANE.legTop 22 m): a gantry's target
 * is the middle of the crane standing on the crest. */
const CREST_Y = 225;
const GANTRY_MID_M = 11;

/*
 * The gantries as war targets, each worth nothing to the output (T1.6:
 * hold targets, not output). `at` is where an attacker turned at one aims
 * (routes.js), in scene metres, y up; `r` its reach, as an intake's.
 *
 *   gantry-intakes   the east intake gantry, the one by the crest start:
 *                    t 817.6 m along the main dam's crest frame from
 *                    (-352.9, -1826.5) toward (636.7, -1610.5) (the dam's
 *                    survey, sites.intakeGantries, as src/maps/itaipu/
 *                    spawns.js records it), s -18 m across it, between
 *                    the deck's upstream edge by the intakes (intake-19
 *                    stands at s -28.8) and the crane's downstream legs
 *                    (INTAKE_CRANE.down, s -8.4)
 *   gantry-spillway  no gantry is built over the spillway yet (T1.6 asks
 *                    the map for its model, collider and stoplogs): the
 *                    middle of the gate row in plan (gate-6 and gate-7),
 *                    at the bridge deck's crest, until the map has one
 */
export const GANTRIES = Object.freeze({
  'gantry-intakes': { mw: 0, at: [449.732, CREST_Y + GANTRY_MID_M, -1669.733], r: 12 },
  'gantry-spillway': { mw: 0, at: [-969.177, CREST_Y + GANTRY_MID_M, -1014.625], r: 12 },
});

/* The part of a target id ('intake' of 'intake-7'). */
const partOf = (id) => id.replace(/-\d+$/, '');

/* A closure for an opening in `target` at room ms `at`, or null for a
 * structure no gantry closes (the yard, a test's target). */
export function closureFor(target, at) {
  const part = partOf(target);
  if (!GANTRY_OF[part]) {
    return null;
  }
  return {
    target, gantry: GANTRY_OF[part], at, ms: CLOSE_MS[part], retarget: null, lost: null, said: [],
  };
}

/* Each closure with when it runs: { c, from, until }, in the list's
 * order; a gantry takes its openings one after another. */
export function schedule(list) {
  const free = {};
  return (list ?? []).map((c) => {
    const from = Math.max(c.at, free[c.gantry] ?? -Infinity);
    const until = from + c.ms;
    free[c.gantry] = until;
    return { c, from, until };
  });
}

/* The closure gantry `gantry` is lowering stoplogs for at room ms t, or
 * null when it is not closing one then. */
export function runningAt(list, gantry, t) {
  return schedule(list).find((x) => x.c.gantry === gantry && x.from <= t && t < x.until && x.c.lost == null) ?? null;
}

/* Whether a closure is open (running or waiting for its gantry) at t: the
 * stage cannot clear while one is (1.9 point 4). */
export function openAt(list, t) {
  return schedule(list).some((x) => x.c.at <= t && t < x.until && x.c.lost == null);
}

/* The latest room ms a closure was held at or before t, or null. */
export function lastHeld(list, t) {
  const ts = schedule(list).filter((x) => x.until <= t && x.c.lost == null).map((x) => x.until);
  return ts.length ? Math.max(...ts) : null;
}

/* The closure the Aggressor turns a group born at room ms t0 for: the
 * oldest open then that no group has turned for yet (1.9 point 3: the
 * next group born after the opening), or null. */
export function retargetFor(list, t0) {
  return schedule(list).find((x) => x.c.retarget == null && x.c.lost == null && x.c.at <= t0 && t0 < x.until)?.c ?? null;
}

/* The kinds that can reach a gantry on the crest and are turned at one:
 * Strikers and Loiterers, and a decoy flying with them. A swarm up the
 * gorge or a boat on the reservoir keeps its target. */
export const TURNS = Object.freeze(['strike', 'loiter', 'decoy']);

/*
 * The closures' lines due by room ms f, not yet said, each marked said:
 * [{ t, radio }] in time order. Every opening is called (contain-breach);
 * the match's first also has the mission's own line (`op`, its `contain`)
 * and DESPACHO's word on the riverbank; then the retarget, the half, and
 * held or lost (MISSIONS.md 1.9's table).
 */
export function linesDue(list, op, f) {
  const out = [];
  for (const [i, x] of schedule(list).entries()) {
    const { c } = x;
    const lines = [['breach', c.at, 'contain-breach']];
    if (i === 0) {
      if (op) {
        lines.push(['op', c.at, op]);
      }
      lines.push(['river', c.at, 'contain-river']);
    }
    if (c.retarget != null) {
      lines.push(['retarget', c.retarget, 'contain-retarget']);
    }
    if (c.lost != null) {
      lines.push(['lost', c.lost, 'contain-lost']);
    } else {
      lines.push(['half', x.from + c.ms / 2, 'contain-half'], ['held', x.until, 'contain-held']);
    }
    for (const [key, t, radio] of lines) {
      if (t <= f && !c.said.includes(key) && !(c.lost != null && t > c.lost)) {
        c.said.push(key);
        out.push({ t, radio });
      }
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/*
 * The closures a stage shows as objectives at the frontier f: every one
 * opened by f that was not held before the stage opened at `stageAt`,
 * each a hold on its gantry (stages.js objectivesView's shape): state
 * 'active' while it runs or waits, 'done' held, 'failed' lost; heldFrom
 * the room ms it started (null while it waits for its gantry).
 */
export function objectivesOf(list, stageAt, f) {
  return schedule(list).filter((x) => x.c.at <= f && !(x.until <= stageAt && x.c.lost == null)).map((x) => {
    const { c } = x;
    const state = c.lost != null ? 'failed' : x.until <= f ? 'done' : 'active';
    const out = {
      id: `contain-${c.target}`, text: c.gantry === 'gantry-spillway' ? 'war.obj.contain_spillway' : 'war.obj.contain_intakes', kind: 'hold', state, ms: c.ms, target: c.gantry,
    };
    if (state === 'active') {
      out.heldFrom = x.from <= f ? x.from : null;
      out.heldMs = x.from <= f ? Math.min(c.ms, f - x.from) : 0;
    } else {
      out.heldMs = state === 'done' ? c.ms : Math.max(0, Math.min(c.ms, c.lost - x.from));
    }
    return out;
  });
}

/* The gantries closing or waiting to at f, for the radar's ring. */
export function gantriesAt(list, f) {
  return [...new Set(schedule(list).filter((x) => x.c.at <= f && f < x.until && x.c.lost == null).map((x) => x.c.gantry))];
}

/*
 * The closures a restart from a stage opened at room ms `entryAt` starts
 * with, its go at `goAt` (1.9 point 8): those held before the stage stay
 * as they were; one still open then is open again, its stoplogs from the
 * top at the go, waiting for its gantry as before, and the next group
 * born turns at it again. Its opening's own calls are not said twice.
 */
export function restartAt(list, entryAt, goAt) {
  return schedule(list).map((x) => {
    const c = { ...x.c, said: x.c.said.slice() };
    if (x.until <= entryAt) {
      return c;
    }
    return {
      ...c, at: goAt, retarget: null, lost: null, said: c.said.filter((k) => k === 'breach' || k === 'op' || k === 'river'),
    };
  });
}
