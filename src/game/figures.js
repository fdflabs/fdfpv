/*
 * figures.js: the aerobatic figure catalogue (docs/TRICKS-CATALOG.md).
 *
 * One row per figure a fixed wing flies: its id (the strings' figure.<id>
 * holds the name in en and es), its family, its difficulty K and where K
 * comes from, and whether today's plant can fly it. Aresti K values are
 * the powered column of the FAI Aresti catalogue as OpenAero encodes it
 * (data/figures/figures19.js, GPLv3); a figure built from an Aresti base
 * and a roll adds the two, as the catalogue's own sequence sheets do. The
 * figures Aresti has no number for (barrel roll, knife edge, the RC 3D
 * set) carry K on this game's own scale, anchored to Aresti figures of the
 * same skill, and say so in `source`.
 *
 * Quad freestyle tricks keep their own catalogue (tricks.js, the scoring
 * workbook) and their own detector (trickdetect.js).
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

/*
 * A perfect figure scores K x 10 (the grade) x this. 2 makes a perfect
 * Aresti loop (K 10) worth 200, a quad Powerloop's price in the workbook,
 * so the two kinds of aircraft meet on one scale in a Trick Battle room.
 */
export const POINTS_PER_K = 2;

/*
 * `aresti`: the catalogue numbers K is summed from, or null for a figure
 * on the game's own scale (docs/TRICKS-CATALOG.md gives each one's
 * anchor). `physics`: 'flown' when a person paced pilot flies it on
 * today's plant (scripts/figures-plant-check.js), 'waits' when it needs
 * the 3D lane's stall, spin and snap work, 'unproven' when nothing has
 * flown it on the plant yet. Every row is detected and tested on
 * synthetic paths whatever its physics.
 */
const fig = (id, family, k, aresti, physics) => ({ id, family, k, aresti, physics });

/*
 * The powered K of every Aresti number the table sums, from OpenAero's
 * data/figures/figures19.js. figures-selftest.js holds each row's K to
 * the sum of its numbers here.
 */
export const ARESTI_K = {
  '1.1.1.1': 2, '2.4.2.1': 46, '5.2.1.1': 17, '6.2.1.1': 15, '7.2.1.1': 6, '7.2.2.1': 6, '7.4.1.1': 10,
  '7.4.1.2': 15, '7.8.1.1': 20, '7.8.5.1': 20, '8.4.1.1': 13, '8.5.2.1': 10, '8.5.6.1': 10, '9.1.3.1': 2,
  '9.1.3.2': 4, '9.1.3.4': 8, '9.2.3.4': 9, '9.4.3.4': 11, '9.8.3.4': 15, '9.9.3.4': 11, '9.10.3.4': 13,
  '9.11.1.4': 5, '9.12.1.4': 7,
};

export const FIGURES = [
  /* Family 1, lines, with rolls on them. */
  fig('knife_edge_pass', 'lines', 6, ['1.1.1.1', '9.1.3.1', '9.1.3.1'], 'unproven'),
  /* Family 2, turns. */
  fig('rolling_circle', 'turns', 46, ['2.4.2.1'], 'unproven'),
  /* Families 5 and 6, stall turns and tail slides. */
  fig('hammerhead', 'stall_turns', 17, ['5.2.1.1'], 'unproven'),
  fig('tailslide', 'tail_slides', 15, ['6.2.1.1'], 'unproven'),
  /* Family 7, loops and eights. */
  fig('loop', 'loops', 10, ['7.4.1.1'], 'flown'),
  fig('outside_loop', 'loops', 15, ['7.4.1.2'], 'unproven'),
  fig('immelmann', 'loops', 10, ['7.2.1.1', '9.1.3.2'], 'unproven'),
  fig('split_s', 'loops', 10, ['7.2.2.1', '9.1.3.2'], 'unproven'),
  fig('cuban_8', 'loops', 28, ['7.8.1.1', '9.1.3.2', '9.1.3.2'], 'unproven'),
  fig('reverse_cuban_8', 'loops', 28, ['7.8.5.1', '9.1.3.2', '9.1.3.2'], 'unproven'),
  fig('avalanche', 'loops', 21, ['7.4.1.1', '9.9.3.4'], 'waits'),
  fig('ke_loop', 'loops', 15, null, 'unproven'),
  /* Family 8, combinations. */
  fig('half_cuban', 'combinations', 14, ['8.5.6.1', '9.1.3.2'], 'unproven'),
  fig('reverse_half_cuban', 'combinations', 14, ['8.5.2.1', '9.1.3.2'], 'unproven'),
  fig('humpty_bump', 'combinations', 13, ['8.4.1.1'], 'unproven'),
  /* Family 9, rolls, snaps and spins. */
  fig('half_roll', 'rolls', 4, ['9.1.3.2'], 'unproven'),
  fig('aileron_roll', 'rolls', 8, ['9.1.3.4'], 'flown'),
  fig('double_roll', 'rolls', 16, ['9.1.3.4', '9.1.3.4'], 'unproven'),
  fig('slow_roll', 'rolls', 10, null, 'unproven'),
  fig('two_point_roll', 'rolls', 9, ['9.2.3.4'], 'unproven'),
  fig('four_point_roll', 'rolls', 11, ['9.4.3.4'], 'flown'),
  fig('eight_point_roll', 'rolls', 15, ['9.8.3.4'], 'unproven'),
  fig('barrel_roll', 'rolls', 6, null, 'unproven'),
  fig('snap_roll', 'rolls', 11, ['9.9.3.4'], 'waits'),
  fig('negative_snap_roll', 'rolls', 13, ['9.10.3.4'], 'waits'),
  fig('spin', 'spins', 5, ['9.11.1.4'], 'waits'),
  fig('inverted_spin', 'spins', 7, ['9.12.1.4'], 'waits'),
  fig('flat_spin', 'spins', 12, null, 'waits'),
  fig('inverted_flat_spin', 'spins', 14, null, 'waits'),
  fig('ke_spin', 'spins', 14, null, 'waits'),
  /* The RC 3D set, game scale (docs/TRICKS-CATALOG.md says how each is anchored). */
  fig('hover', '3d', 6, null, 'unproven'),
  fig('torque_roll', '3d', 10, null, 'unproven'),
  fig('harrier', '3d', 8, null, 'unproven'),
  fig('inverted_harrier', '3d', 11, null, 'unproven'),
  fig('rolling_harrier', '3d', 16, null, 'unproven'),
  fig('waterfall', '3d', 12, null, 'unproven'),
  fig('blender', '3d', 18, null, 'waits'),
  fig('tumble', '3d', 15, null, 'waits'),
  fig('lomcevak', '3d', 16, null, 'waits'),
  fig('elevator', '3d', 9, null, 'waits'),
  fig('wall', '3d', 8, null, 'unproven'),
  fig('pop_top', '3d', 14, null, 'waits'),
  fig('parachute', '3d', 10, null, 'waits'),
];

const byId = new Map(FIGURES.map((f) => [f.id, f]));

export function figureById(id) {
  return byId.get(id);
}

/* The catalogue name a figure is scored and sent under. */
export function figureTrickName(id) {
  return `fig:${id}`;
}

export function figureIdOfTrick(name) {
  return typeof name === 'string' && name.startsWith('fig:') ? name.slice(4) : null;
}

/* A perfect figure's points. */
export function figurePoints(id) {
  const f = byId.get(id);
  if (!f) throw new Error(`figures: no figure ${id}`);
  return f.k * 10 * POINTS_PER_K;
}

/*
 * The grade words, best first, as the HUD shouts them, on this game's
 * bands (docs/TRICKS-CATALOG.md): 9.5 and up nothing worth a deduction,
 * 8 a small fault, 6 a fault you can see, under that sloppy, and a zero
 * when a judge would give nothing.
 */
export const GRADE_WORDS = [
  { at: 9.5, key: 'aerobatic.grade_perfect' },
  { at: 8, key: 'aerobatic.grade_sharp' },
  { at: 6, key: 'aerobatic.grade_clean' },
  { at: 0.5, key: 'aerobatic.grade_sloppy' },
  { at: 0, key: 'aerobatic.grade_zero' },
];

export function gradeWordKey(grade) {
  return GRADE_WORDS.find((w) => grade >= w.at).key;
}
