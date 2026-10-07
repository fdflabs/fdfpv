/*
 * medals.js: bronze, silver and gold on a built course
 * (docs/FLIGHTCLUB-PROGRESSION.md section 2).
 *
 * A course document carries one number, `medals.goldMs`: its builder's
 * own best lap on that layout, written when the course is published
 * (src/main.js publishBuiltTrack). Silver and bronze are fixed ratios of
 * it, worked out where they are read, so the three can never disagree and
 * no other pilot's time ever moves them. A course without the key has no
 * medals.
 *
 * Pure: no DOM, no storage, so the progress merge on the server and the
 * selftest read the same rules.
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

export const MEDAL_STEPS = ['bronze', 'silver', 'gold'];
/* Gold is the builder's own pace; silver and bronze are that pace with
 * room for a pilot meeting the course for the first time. */
const RATIO = { gold: 1, silver: 1.15, bronze: 1.35 };
const LAP_MAX_MS = 3_600_000;

/* A stored medals entry made safe: { goldMs } or null. */
export function cleanMedals(raw) {
  const n = Number(raw && raw.goldMs);
  return Number.isInteger(n) && n >= 1 && n <= LAP_MAX_MS ? { goldMs: n } : null;
}

/* The three times, gold first, rounded up to the ms; null without medals. */
export function medalTimes(medals) {
  const m = cleanMedals(medals);
  if (!m) {
    return null;
  }
  return { gold: m.goldMs, silver: Math.ceil(m.goldMs * RATIO.silver), bronze: Math.ceil(m.goldMs * RATIO.bronze) };
}

/* The best medal a lap reaches, or null. Equal to a time reaches it. */
export function medalFor(medals, lapMs) {
  const times = medalTimes(medals);
  if (!times || !Number.isFinite(lapMs) || lapMs <= 0) {
    return null;
  }
  return [...MEDAL_STEPS].reverse().find((step) => lapMs <= times[step]) ?? null;
}

const rank = (m) => MEDAL_STEPS.indexOf(m);

/* The better of two medals, either possibly absent. */
export function betterMedal(a, b) {
  return rank(a) >= rank(b) ? (rank(a) < 0 ? null : a) : b;
}

/* The steps `now` reaches that `before` did not, lowest first: what a
 * medal pays for (src/game/progress.js awardMedal). */
export function newSteps(before, now) {
  return MEDAL_STEPS.slice(rank(before) + 1, rank(now) + 1);
}

/*
 * The medals a course is published with. `held` is what the document
 * carries, `layout` the layout being published (src/share/listing.js
 * layoutFingerprint), `publishedLayout` the layout last published from
 * this browser, and `flown` the builder's best test lap, { layout, ms },
 * or null. Gold is the builder's best lap on THIS layout: a test lap on it,
 * or the held gold if the layout is the one it was set on, whichever is
 * faster. A layout nobody has lapped since it changed gets no medals, so a
 * medal time never belongs to another course.
 */
export function publishMedals(held, layout, publishedLayout, flown) {
  const kept = publishedLayout === layout ? cleanMedals(held) : null;
  const lap = flown && flown.layout === layout && Number.isFinite(flown.ms) ? Math.round(flown.ms) : null;
  const best = Math.min(kept ? kept.goldMs : Infinity, lap ?? Infinity);
  return Number.isFinite(best) ? cleanMedals({ goldMs: best }) : null;
}
