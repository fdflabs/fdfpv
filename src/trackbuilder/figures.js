/*
 * figures.js: the named ways of flying a stack, read off and written into
 * the sequence.
 *
 * A double or triple stack is one structure with several openings, and the
 * sequence lists one entry per opening flown. A figure is a pattern of
 * consecutive entries on one stack (schema.md, Stacked figures): it is not
 * stored, it is recognised, so a hand edit that leaves the pattern intact
 * still lights the matching button and an older track still loads.
 *
 * Between two passes of the same stack the racing line needs a point off the
 * structure so it goes around the frame instead of through it. wrapBetween
 * places that point; path.js and the course both use it, which is why it is
 * exact to the last bit.
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

import { TRACK_CLASS_DEFAULT, tuningFor } from './elements.js';
import { aperturesOf, apertureCenter, elementNormal } from './model.js';
import { add, leftOf, normalize, scale } from './geometry.js';
import { str } from '../strings/index.js';

export const FIGURES = {
  single: { id: 'single', label: str('figures.one_opening'), hint: str('figures.one_hole_counts_the_others_are') },
  spiralUp: { id: 'spiralUp', label: str('figures.spiral_up'), hint: str('figures.each_hole_is_its_own_gate') },
  spiralDown: { id: 'spiralDown', label: str('figures.spiral_down'), hint: str('figures.each_hole_is_its_own_gate_2') },
  splitS: { id: 'splitS', label: str('figures.split_s'), hint: str('figures.two_gates_through_the_top_invert') },
};

/* When one sequence could be read as several figures, the first of these
 * wins. Split-S goes before spiral down because on a double stack they are
 * the same two holes and Split-S is the name pilots use. */
const RECOGNITION_ORDER = ['splitS', 'spiralDown', 'spiralUp', 'single'];

/* The opening's name as a cue says it: by position on a double or triple,
 * by number on anything taller. */
export function levelName(el, index = 0) {
  const count = aperturesOf(el).length;
  const i = Math.max(0, Math.min(Math.round(index), count - 1));
  if (count === 2) {
    return i === 0 ? 'bottom' : 'top';
  }
  if (count === 3) {
    return ['bottom', 'middle', 'top'][i];
  }
  return `level ${i + 1}`;
}

const pass = (apertureIndex, entry) => ({ apertureIndex, entry });

/* The passes a figure writes on this stack, first pass along the normal for
 * approach +1 and against it for -1. A structure with one opening has only
 * the one pass whatever the figure; spiral down needs three openings. */
export function figurePlan(el, figureId, approach = 1) {
  const s = approach < 0 ? -1 : 1;
  const count = aperturesOf(el).length;
  if (count < 2) {
    return [pass(0, s)];
  }
  const top = count - 1;
  if (figureId === 'spiralUp') {
    return Array.from({ length: count }, (_, i) => pass(i, s));
  }
  if (figureId === 'spiralDown' && count >= 3) {
    return Array.from({ length: count }, (_, k) => pass(top - k, k % 2 ? -s : s));
  }
  if (figureId === 'splitS') {
    return [pass(top, s), pass(0, -s)];
  }
  return [pass(0, s)];
}

function samePasses(seqs, plan) {
  return seqs.length === plan.length
    && plan.every((p, k) => (seqs[k].apertureIndex ?? 0) === p.apertureIndex && seqs[k].entry === p.entry);
}

/* The named figure these consecutive entries on `el` are, or null. */
export function matchingFigureOf(el, seqs) {
  if (!seqs.length) {
    return null;
  }
  const approach = seqs[0].entry;
  return RECOGNITION_ORDER.find((id) => samePasses(seqs, figurePlan(el, id, approach))) ?? null;
}

/* What the HUD calls one pass: the figure and the opening, the opening
 * alone for a single hole or a hand mix on a stack, and nothing for a
 * structure with one opening, where there is nothing to tell apart. */
export function figureCueOf(el, seq, seqs) {
  const figure = matchingFigureOf(el, seqs);
  const level = levelName(el, seq.apertureIndex);
  if (figure && figure !== 'single') {
    return `${FIGURES[figure].label}, ${level}`;
  }
  return aperturesOf(el).length < 2 ? '' : level;
}

/* Runs of consecutive entries on one element. */
function runsOf(sequence) {
  const runs = [];
  for (const s of sequence) {
    const last = runs[runs.length - 1];
    if (last && last[0].elementId === s.elementId) {
      last.push(s);
    } else {
      runs.push([s]);
    }
  }
  return runs;
}

/* How older builds spelled two figures: spiral up with alternating faces,
 * and (briefly) spiral down with one face. */
function oldSpiralUp(count, s) {
  return Array.from({ length: count }, (_, i) => pass(i, i % 2 ? -s : s));
}

function oldSpiralDown(count, s) {
  return Array.from({ length: count }, (_, k) => pass(count - 1 - k, s));
}

/*
 * Rewrite stacks written in the old spellings into the current ones, same
 * holes and same first face. Recognised by shape, since the old spelling
 * has no version of its own, so a run is left exactly as it is if the
 * author set any face in it by hand (`overridden`): a spiral up with one
 * face flipped looks like the old spelling and must not be undone every
 * time the course is built. Edits the document; true when anything changed.
 */
export function upgradeStackedFigures(doc) {
  let changed = false;
  const byId = new Map(doc.elements.map((el) => [el.id, el]));
  for (const run of runsOf(doc.sequence)) {
    const el = byId.get(run[0].elementId);
    if (!el || run.some((s) => s.overridden)) {
      continue;
    }
    const count = aperturesOf(el).length;
    if (count < 2) {
      continue;
    }
    const s = run[0].entry < 0 ? -1 : 1;
    let plan = null;
    if (samePasses(run, oldSpiralUp(count, s))) {
      plan = figurePlan(el, 'spiralUp', s);
    } else if (count >= 3 && samePasses(run, oldSpiralDown(count, s))) {
      plan = figurePlan(el, 'spiralDown', s);
    }
    if (!plan || samePasses(run, plan)) {
      continue;
    }
    run.forEach((entry, k) => {
      entry.entry = plan[k].entry;
    });
    changed = true;
  }
  return changed;
}

/*
 * The knot between two passes of one stack, off the structure so the line
 * goes around it. Which way is decided on the openings the entries name, as
 * written, and where on the openings they resolve to. A leap of more than
 * one opening, or a double stack flown
 * downward, is a split-S and loops out in front along the first pass's
 * travel; any other step, a second pass through the same opening
 * included, wraps out to the left of that travel, the helix of a spiral.
 * The reach is the class's stackWrap. The tangent is straight up or down
 * when the next opening is higher or lower, and the travel itself when the
 * two stand level (a stack whose openings overlap).
 */
export function wrapBetween(el, seqA, seqB, cls = TRACK_CLASS_DEFAULT) {
  const reach = tuningFor(cls).stackWrap;
  const count = aperturesOf(el).length;
  const a = seqA.apertureIndex ?? 0;
  const b = seqB.apertureIndex ?? 0;
  const from = apertureCenter(el, a);
  const rise = apertureCenter(el, b).z - from.z;
  const middle = { x: from.x, y: from.y, z: from.z + rise / 2 };
  const facing = scale(elementNormal(el), seqA.entry < 0 ? -1 : 1);
  const travel = normalize(facing);
  const step = b - a;
  const loop = Math.abs(step) > 1 || (count === 2 && step < 0);
  const off = loop ? scale(travel, reach) : scale(leftOf(facing), reach);
  const tangent = rise === 0 ? facing : { x: 0, y: 0, z: rise > 0 ? 1 : -1 };
  return { pos: add(middle, off), tangent };
}
