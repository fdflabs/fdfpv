/*
 * track.js: how big the game built a course's gates, GATE_SCALE, kept for
 * the two readers left now that the builder, its courses and the race have
 * gone (the combat-only cut, 2026-10-20): the crash world's gate post
 * stiffness (main.js, src/game/crashworld.js postGive) and verify's world
 * scale check (check 15, tests/thresholds.json world-scale.gate_scale,
 * through window.__gateScale).
 *
 * Gates were built larger than MultiGP publishes them. That is a
 * playability call by the owner, not a measurement, so it lives here as one
 * named number instead of being folded into the obstacle sizes. Source:
 * https://www.multigp.com/multigp-drone-race-course-obstacles/.
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

/* Owner request: "the gates need to be 15 percent larger in the track".
 * Mirrored in tests/thresholds.json world-scale.gate_scale. */
export const GATE_SCALE = 1.15;

/* Wing gates are authored in metres against the aircraft span, so they are
 * built one to one. A plain object on purpose: unknown classes fall through
 * to GATE_SCALE, and the golden record pins the lookup as an ordinary
 * property read, inherited names included. */
const SCALE_BY_CLASS = { full: GATE_SCALE, wing: 1 };

export function gateScaleFor(cls) {
  return SCALE_BY_CLASS[cls] ?? GATE_SCALE;
}
