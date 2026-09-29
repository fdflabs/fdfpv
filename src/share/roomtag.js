/*
 * roomtag.js: Catch the Ace! (¡Atrapa al As!), the client's half of a
 * room's tag match (docs/TAG-PLAN.md; the room's half is edge/rooms/tag.js).
 *
 * The room judges every tag (a hunter inside the Ace's bubble, BUBBLE_M)
 * and counts every point; this module keeps the room's view of the match,
 * says what this pilot's part in it is now (role), and hands the shell
 * each new crown once, for its banner. It never touches the physics or
 * the page: the shell (src/main.js) reads role and holdMs to put the
 * pilot on their slot and hold them there until the go, the room's
 * race's way (src/share/roomrace.js).
 *
 * The scores are the room's, not extrapolated: the room sends the match
 * on every whole point the Ace adds, so what every screen shows is the
 * one count, and it never runs backwards when a tag lands in the past.
 *
 * Pure: no DOM, no timers, the room clock handed in, so scripts/rooms-
 * selftest.js drives two of these against edge/rooms/core.js.
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

/* One point a second of reign (docs/TAG-PLAN.md decision 5). */
export const POINT_MS = 1000;
/* The goals the host picks from, in points (decision 5), and the custom
 * goal's range and step. */
export const GOALS = [
  { id: 'lightning', goal: 90 },
  { id: 'standard', goal: 240 },
  { id: 'epic', goal: 600 },
];
export const GOAL_MIN = 5;
export const GOAL_MAX = 995;
export const GOAL_STEP = 5;
/* A new Ace cannot be touched for this long (decision 4). */
export const PROTECT_MS = 3000;
/* The Ace's bubble, metres from its centre (the point its pose carries,
 * its CG): a hunter any part of whose aircraft comes this close takes the
 * crown (edge/rooms/tag.js), and every screen draws a sphere this big
 * round the Ace (src/render/acebubble.js). The owner's number. It is from
 * the centre, not the Ace's own skin, so the rule is the sphere that is
 * drawn: every hull reaches under 1.5 m from its CG (configs/hulls.js),
 * so any Ace sits well inside it, and none gets a bigger bubble for being
 * wider. */
export const BUBBLE_M = 6;
/* How many of the last crown changes the room's view carries. */
export const CROWNS_SHOWN = 8;

export function points(ms) {
  return Math.floor(ms / POINT_MS);
}

/* Everybody in a match in order: most time as the Ace first, the gone
 * last, then by seat, so the order is one order on every screen. rows are
 * { seat, ms, gone }; returns them sorted. */
export function orderScores(rows) {
  return rows.slice().sort((a, b) => (Boolean(a.gone) - Boolean(b.gone)) || b.ms - a.ms || a.seat - b.seat);
}

/* The goal a preset id or a number names, clamped to the range and step. */
export function goalOf(v) {
  const preset = GOALS.find((g) => g.id === v);
  const n = preset ? preset.goal : Math.round(Number(v) / GOAL_STEP) * GOAL_STEP;
  return Number.isFinite(n) ? Math.max(GOAL_MIN, Math.min(GOAL_MAX, n)) : GOALS[0].goal;
}

/* send(obj) puts one text message on the room's socket. */
export function createRoomTag(send) {
  let seat = null;
  let tag = { state: 'lobby' };
  let error = null;
  let startTaken = null;
  let resultsTaken = null;
  /* The newest crown handed out, as `${match id}:${t}:${seat}`. */
  let crownTaken = null;

  const api = {
    onWelcome(w) {
      seat = w.seat;
      tag = w.tag || { state: 'lobby' };
      error = null;
      /* A match already over is not a result to show, and one this pilot
       * was already put on the line for (a reconnect) not a new start. */
      if (tag.state === 'results') {
        resultsTaken = tag.id;
      }
      const last = (tag.crowns || []).at(-1);
      crownTaken = last ? `${tag.id}:${last.t}:${last.seat}` : crownTaken;
    },

    /* A room message this module owns. Returns true when it was one. */
    onMessage(m) {
      if (m.type !== 'tag') {
        return false;
      }
      if (m.error) {
        error = m.error;
      } else if (m.tag) {
        error = null;
        tag = m.tag;
      }
      return true;
    },

    view() {
      return tag;
    },
    seat() {
      return seat;
    },
    error() {
      return error;
    },
    /* The Ace's seat while the match is on, else null. */
    ace() {
      return tag.state === 'live' ? tag.ace : null;
    },
    /* The bubble's radius the room judges by while the match is on, else
     * 0. A room from before the bubble sends none and judges a touch, so
     * nothing is drawn that would not be a tag. */
    bubble() {
      return tag.state === 'live' && tag.ace != null && tag.bubble > 0 ? tag.bubble : 0;
    },
    on() {
      return tag.state === 'countdown' || tag.state === 'live';
    },

    /* 'lobby' (no match), 'countdown', 'ace', 'hunter', 'results'. */
    role(roomNow) {
      if (tag.state === 'results') {
        return 'results';
      }
      if (tag.state === 'countdown' || (tag.state === 'live' && roomNow != null && roomNow < tag.goAt)) {
        return 'countdown';
      }
      if (tag.state === 'live') {
        return tag.ace === seat ? 'ace' : 'hunter';
      }
      return 'lobby';
    },

    /* ms to hold the aircraft on its slot, 0 when it may fly. */
    holdMs(roomNow) {
      return api.on() && roomNow != null ? Math.max(0, tag.goAt - roomNow) : 0;
    },

    /* A match counting down, once: the shell puts the pilot on their slot. */
    takeStart(roomNow) {
      if (api.on() && startTaken !== tag.id && roomNow != null && roomNow < tag.goAt) {
        startTaken = tag.id;
        return tag;
      }
      return null;
    },

    /* A match's results, once, for the results screen. */
    takeResults() {
      if (tag.state === 'results' && resultsTaken !== tag.id) {
        resultsTaken = tag.id;
        return tag;
      }
      return null;
    },

    /* The newest crown change, once: { t, seat, from, why }. */
    takeCrown() {
      const last = (tag.crowns || []).at(-1);
      if (!last || !api.on()) {
        return null;
      }
      const key = `${tag.id}:${last.t}:${last.seat}`;
      if (key === crownTaken) {
        return null;
      }
      crownTaken = key;
      return last;
    },

    /* Whether the Ace is inside its tag back protection now. */
    protectedNow(roomNow) {
      return tag.state === 'live' && roomNow != null && roomNow < tag.protectUntil;
    },

    /* Everybody's points in order: { seat, ms, points, gone, ace, place }. */
    standings() {
      return (tag.scores || []).map((r, i) => ({
        ...r, points: points(r.ms), ace: tag.state === 'live' && r.seat === tag.ace, place: i + 1,
      }));
    },

    /* Host only, the room checks. */
    start(goal) {
      send({ type: 'tag', op: 'start', goal: goalOf(goal) });
    },
    end() {
      send({ type: 'tag', op: 'end' });
    },

    clear() {
      seat = null;
      tag = { state: 'lobby' };
      error = null;
    },
  };
  return api;
}
