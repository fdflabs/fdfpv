/*
 * world.js: what a war has done to the map at a room millisecond, from
 * what the room said: which targets burn, and how bright each district of
 * the night raid's lights is (src/share/war/grid.js).
 *
 * The owner: "i want the replays to show things as they happened". The
 * live screen (src/main.js) and the crash cam's replay (src/replay/
 * warrec.js) both draw the map through these two functions, so a replay
 * asked for room ms t shows the targets and the lights the live screen
 * showed at t, and a step back is only another t.
 *
 * A TARGET HIT burns for FIRE_MS of room clock from the room ms of its
 * latest hit (another attacker arriving on it lights it again), then
 * smokes for the rest of the match; one hit before this screen heard of
 * it (at -Infinity: it joined later) smokes at once. The room never
 * restores a target within a match (edge/rooms/war.js take).
 *
 * A TARGET DAMAGED (the room's 'damage' events, src/render/breakage.js:
 * chunks of a structure broken off) smokes from the room ms of the damage
 * when no hit has it burning; what broke is the events themselves, which
 * the breakage layer applies in order (matchAt's `damage`).
 *
 * Pure: no clock, no DOM, + - * / and comparisons only.
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

import { DISTRICTS, darkFrom, levelAt } from './grid.js';

/* A hit target burns this long, room ms, then smokes. */
export const FIRE_MS = 20000;

/* A target last hit at room ms `at` (-Infinity: before this screen
 * heard), at room ms t: 'ok' before the hit, 'fire', then 'smoke'. */
export function burnAt(at, t) {
  if (at === -Infinity) {
    return 'smoke';
  }
  if (!(t >= at)) {
    return 'ok';
  }
  return t - at < FIRE_MS ? 'fire' : 'smoke';
}

/*
 * One match's world as the replay keeps it: { from, off, hits: [{ target,
 * at }], cuts: [{ at, x, z }] }, a hit for each arrival on a target, at
 * null for one from before this screen heard of it, off the room ms the
 * war stopped being fought (the targets are whole again on screen from
 * then, src/main.js warFinish) or null.
 * `damage` the match's damage events in the order heard. At room ms t:
 * { targets: { id: state } of every target not 'ok', levels: a
 * Float32Array a district, damage: the events by t, openings: every
 * opening the match's damage tore, whenever (the flood's own clock places
 * each: src/sim/water/host.js, so its water at t is the same as live) }
 * (levels refilled on every call with the same cache). `cache` is an
 * object the caller keeps per match.
 */
export function matchAt(m, t, cache) {
  if (!cache.from) {
    cache.from = darkFrom(
      m.hits.map((h) => ({ target: h.target, at: h.at === null ? -Infinity : h.at })),
      m.cuts,
    );
    cache.levels = new Float32Array(DISTRICTS.length);
    cache.openings = m.damage.flatMap((d) => d.openings);
  }
  const targets = {};
  if (m.off === null || t < m.off) {
    /* Each target's latest hit by t. */
    const last = new Map();
    for (const h of m.hits) {
      const at = h.at === null ? -Infinity : h.at;
      if (at <= t && !(last.get(h.target) >= at)) {
        last.set(h.target, at);
      }
    }
    for (const [target, at] of last) {
      targets[target] = burnAt(at, t);
    }
    for (const d of m.damage) {
      if (d.at <= t && !(d.target in targets)) {
        targets[d.target] = 'smoke';
      }
    }
  }
  const damage = m.damage.filter((d) => d.at <= t);
  for (let i = 0; i < DISTRICTS.length; i += 1) {
    cache.levels[i] = levelAt(cache.from[i], i, t);
  }
  /* The match's gate state, whole (hoist.js places each entry). */
  return {
    targets, levels: cache.levels, damage, openings: cache.openings, gates: m.gates && m.gates.length ? m.gates : null,
  };
}

/* The map as no war has touched it: every target whole, every light on. */
export function untouched() {
  return {
    targets: {}, levels: new Float32Array(DISTRICTS.length).fill(1), damage: [], openings: [], gates: null,
  };
}
