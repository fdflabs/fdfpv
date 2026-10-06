/*
 * guide.js: where an ops mission's pilot should be looking, and what the
 * ops room says to get them there (the owner, 2026-10-06, after flying The
 * Interior's Mission 1: "no voice telling me what to do, no arrows
 * pointing, no indications, nothing").
 *
 * One screen's guidance, worked out from what that screen already has:
 * the mission's data (its stages' objectives, items, points and cues) and
 * the room's view (the cards and their counts, the captures, the search
 * areas, the contacts as the room tells them). Nothing new crosses the
 * wire and the room decides nothing here: this is a reading of its view.
 *
 * THE QUIET RULE HOLDS BY CONSTRUCTION. The view never carries where an
 * undiscovered contact is, so a target here can only ever be a place the
 * mission names (an item still to capture, a point, the zone whose
 * crossing the stage waits on, home), a search area the room drew, or a
 * contact the room has already told: seen (its pose) or lost (its last
 * known position). A guide that pointed at the truth would need a field
 * the view does not have.
 *
 *   focusOf(mission, view, roles)   the objective this screen works on:
 *                                   the stage's first active primary card
 *                                   shown to its roles, with its data
 *   targetOf(mission, view, focus, here, poseOf)
 *                                   where that objective is: { kind, at,
 *                                   r, item, contact, m } or null
 *   goalLine(focus, target, here, say)
 *                                   the one line the HUD shows for it,
 *                                   with its count
 *   briefOf(focus, role)            the line id the guide says for it
 *   nudgeOf(target, here, heading)  the line ids a nudge says: what, the
 *                                   clock bearing off the nose, how far
 *   createNudger()                  when a nudge is due: no progress for
 *                                   NUDGE_IDLE_MS, or far from the action,
 *                                   and never closer together than a gap
 *                                   that grows while nothing changes
 *
 * Positions are the ops frame (z up, metres, x east, y north); a bearing
 * is clockwise from north. Pure: no DOM, no clock of its own, runs in
 * Node.
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

import { itemsOf, resolve } from './stages.js';

/* A nudge once nothing has changed for this long, ms. */
export const NUDGE_IDLE_MS = 20000;
/* Farther than this from the objective is far from the action, m: a
 * nudge is due whatever the progress. */
export const FAR_M = 1500;
/* The gap between two guide lines starts here and grows by NUDGE_GROW
 * each time nothing changed between them, up to NUDGE_MAX_MS. */
export const NUDGE_GAP_MS = 20000;
export const NUDGE_GROW = 1.5;
export const NUDGE_MAX_MS = 60000;
/* A target ring is never smaller than this, m: an antenna is 9 m across
 * and would be a dot from survey altitude. */
export const RING_MIN_M = 25;

const GRADES = ['poor', 'usable', 'clean'];
/* The distance bands a nudge can say, metres, each its line (lines.json
 * int-g-dist-*): the nearest band's line is said. */
export const DIST_BANDS = [
  [750, 'int-g-dist-500'], [1500, 'int-g-dist-1k'], [2500, 'int-g-dist-2k'],
  [4000, 'int-g-dist-3k'], [6500, 'int-g-dist-5k'], [Infinity, 'int-g-dist-far'],
];
/* What a nudge names before its bearing, by the target's kind. */
const LEADS = {
  item: 'int-g-next', zone: 'int-g-next', search: 'int-g-search', contact: 'int-g-contacts', lkp: 'int-g-lkp', home: 'int-g-home',
};

const isRecord = (o) => Boolean(o) && typeof o === 'object' && !Array.isArray(o);
const dist2 = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/* Bearing (rad, clockwise from north) from p to q. */
export const bearing = (p, q) => Math.atan2(q[0] - p[0], q[1] - p[1]);

/* The stage's data the view is in, or null. */
export function stageOf(mission, view) {
  return view && view.stage ? (mission.stages || []).find((s) => s.id === view.stage.id) ?? null : null;
}

/*
 * The objective this screen works on: the first card of the stage that
 * is primary, still active and shown to a role this screen holds (a card
 * scoped to other roles is theirs). { card, objective } or null.
 */
export function focusOf(mission, view, roles = []) {
  const st = stageOf(mission, view);
  if (!st || view.state !== 'live') {
    return null;
  }
  const card = (view.cards || []).find((c) => c.tier === 'primary' && c.state === 'active'
    && (!c.roles || c.roles.some((r) => roles.includes(r))));
  const objective = card ? (st.objectives || []).find((o) => o.id === card.id) : null;
  return objective ? {
    card, objective, stage: st, campaign: mission.campaign,
  } : null;
}

/* The items of a `captured` spec still to capture, at the spec's grade. */
function itemsLeft(mission, view, spec, grade) {
  const ids = itemsOf(mission, spec);
  const need = grade ? GRADES.indexOf(grade) : 0;
  const got = new Set((view.captures || []).filter((c) => GRADES.indexOf(c.grade) >= need).map((c) => c.item));
  return mission.items.filter((it) => ids.includes(it.id) && !got.has(it.id));
}

/* The nearest of `list` ({ at }) to `here`. */
function nearest(list, here) {
  let best = null;
  for (const x of list) {
    if (!best || dist2(here, x.at) < dist2(here, best.at)) {
      best = x;
    }
  }
  return best;
}

/* A contact group's members as the room tells them. */
const membersOf = (view, group) => (view.contacts || []).filter((c) => c.id === group || c.group === group);

/*
 * A told contact as a target: one seen now (its pose, from `poseOf`), else
 * one lost with its last known position, else null.
 */
function toldTarget(view, group, here, poseOf) {
  const told = membersOf(view, group).filter((c) => c.cls);
  const seen = told.map((c) => (c.state === 'seen' ? { c, p: poseOf(c) } : null)).filter((x) => x && x.p);
  if (seen.length) {
    const x = nearest(seen.map((s) => ({ ...s, at: s.p })), here);
    return { kind: 'contact', at: [x.p[0], x.p[1]], r: RING_MIN_M, contact: x.c.id };
  }
  const lost = told.filter((c) => c.state === 'lost' && c.lkp).map((c) => ({ c, at: c.lkp }));
  if (lost.length) {
    const x = nearest(lost, here);
    return { kind: 'lkp', at: [x.at[0], x.at[1]], r: RING_MIN_M, contact: x.c.id };
  }
  return null;
}

/* The room's nearest search area, or null. */
function searchTarget(view, here) {
  const s = nearest((view.search || []).filter((x) => Array.isArray(x.at)), here);
  return s ? { kind: 'search', at: [s.at[0], s.at[1]], r: s.r, id: s.id } : null;
}

/* The zone a stage's cue waits on a crossing of, as the place to fly to
 * for an objective whose trigger is somewhere else (Charlie: the pair
 * comes out once the corridor is crossed). */
function cueZone(mission, stage) {
  for (const c of stage.cues || []) {
    const z = c.when && c.when.zone;
    if (z && mission.points && mission.points[z]) {
      return { kind: 'zone', at: mission.points[z].at.slice(0, 2), r: mission.points[z].r, id: z };
    }
  }
  return null;
}

/*
 * Where the focus objective is, from `here` ([x, y, z] and agl, the
 * screen's aircraft): { kind, at: [x, y] | null, r, ... } or null when it
 * has no place (a rule, an objective of a kind not read here).
 *   climb   done.above: no place, `m` the height asked for
 *   item    done.captured: the nearest item still to capture
 *   zone    a point to fly to (done.zone, done.dwell, or the zone the
 *           stage's cue waits on for a `discovered` objective)
 *   search  the room's search area, where one is drawn
 *   contact a told contact in a frame now
 *   lkp     a told contact lost: its last known position
 *   home    done.landed: the point to land on
 */
export function targetOf(mission, view, focus, here, poseOf = () => null) {
  if (!focus) {
    return null;
  }
  const done = focus.objective.done || {};
  const point = (id, kind) => (mission.points && mission.points[id]
    ? { kind, at: mission.points[id].at.slice(0, 2), r: mission.points[id].r, id } : null);
  if (done.above != null) {
    return { kind: 'climb', at: null, r: 0, m: done.above };
  }
  if (done.captured != null) {
    const placed = (it) => (it.at != null ? resolve(it.at, view.dials || {}) : null);
    const left = itemsLeft(mission, view, done.captured, done.grade)
      .filter((it) => !it.view || (view.opened || []).includes(it.id));
    const x = nearest(left.map((it) => ({ it, at: placed(it) })).filter((y) => Array.isArray(y.at)), here);
    if (x) {
      return { kind: 'item', at: [x.at[0], x.at[1]], r: Math.max(RING_MIN_M, x.it.size || 0), item: x.it.id };
    }
    /* Only an item that is a contact group left (the camp's people): the
     * group where the room has told it, else the nearest placed item of
     * the same set, which is where the group lives. */
    const it = left.find((y) => y.contact);
    if (!it) {
      return null;
    }
    const told = toldTarget(view, it.contact, here, poseOf);
    const home = nearest(mission.items.filter((y) => y.set === it.set && y.at != null)
      .map((y) => ({ at: placed(y) })).filter((y) => Array.isArray(y.at)), here);
    const at = told ? told.at : home ? home.at : null;
    return at ? { kind: 'item', at: [at[0], at[1]], r: RING_MIN_M, item: it.id } : null;
  }
  if (done.landed) {
    return point(done.landed, 'home');
  }
  if (done.zone || done.dwell) {
    return point(done.zone || done.dwell, 'zone');
  }
  const group = done.discovered || done.route;
  if (group) {
    return toldTarget(view, group, here, poseOf) ?? searchTarget(view, here) ?? cueZone(mission, focus.stage);
  }
  return null;
}

/*
 * The objective as one line, a string key per kind of target (so any
 * mission's objectives read the same) with the card's own count when it
 * has one: "CAPTURE BRIDGE · 1/3".
 */
export function goalLine(focus, target, here, say) {
  if (!focus) {
    return '';
  }
  const p = focus.card.progress;
  const count = p ? say('ops.goal.count', { n: p[0], of: p[1] }) : '';
  const key = target ? `ops.goal.${target.kind}` : null;
  let text;
  if (!target) {
    text = say(focus.card.text);
  } else if (target.kind === 'climb') {
    text = say(key, { m: target.m, now: Math.max(0, Math.round(here.agl ?? 0)) });
  } else if (target.kind === 'item') {
    text = say(key, { item: say(`ops.${focus.campaign}.item.${target.item}`) });
  } else {
    text = say(key);
  }
  return count ? `${text} · ${count}` : text;
}

/* The line the guide says for the focus objective, for the screen's
 * active role: the objective's `guide` (a line id, or one per role id). */
export function briefOf(focus, role) {
  const g = focus && focus.objective.guide;
  if (!g) {
    return null;
  }
  return isRecord(g) ? g[role] ?? g.all ?? null : g;
}

/* A bearing off the nose as a clock hour, 1 to 12 (12 dead ahead). */
export function clockOf(here, at, heading) {
  const rel = bearing(here, at) - heading;
  const h = Math.round((((rel / (2 * Math.PI)) * 12) % 12 + 12) % 12);
  return h === 0 ? 12 : h;
}

/* The distance band's line for d metres. */
export const distLine = (d) => DIST_BANDS.find(([upTo]) => d < upTo)[1];

/*
 * What a nudge says: the target's kind, its clock bearing off the nose and
 * its distance band (int-g-*), or `brief` again when the target has no
 * place. Null when there is nothing to say.
 */
export function nudgeOf(target, here, heading, brief = null) {
  if (!target) {
    return brief ? [brief] : null;
  }
  if (target.kind === 'climb') {
    return ['int-g-climb'];
  }
  return [LEADS[target.kind], `int-g-clock-${clockOf(here, target.at, heading)}`, distLine(dist2(here, target.at))];
}

/*
 * When a nudge is due. `progress(key, now)` is told what this screen
 * would call progress (a key that changes when a count moves, a card is
 * done, a contact is told, the stage moves on); `spoke(now)` that a guide
 * line was said; `due(now, far)` whether a nudge is due now.
 */
export function createNudger() {
  let key = null;
  let since = 0;
  let last = -Infinity;
  let gap = NUDGE_GAP_MS;
  return {
    progress(k, now) {
      if (k !== key) {
        key = k;
        since = now;
        gap = NUDGE_GAP_MS;
      }
    },
    spoke(now) {
      last = now;
    },
    due(now, far) {
      if (now - last < gap) {
        return false;
      }
      return far || now - since >= NUDGE_IDLE_MS;
    },
    /* A nudge said: the next waits longer while nothing changes. */
    nudged(now) {
      last = now;
      gap = Math.min(NUDGE_MAX_MS, gap * NUDGE_GROW);
    },
    state: () => ({ key, since, last, gap }),
  };
}
