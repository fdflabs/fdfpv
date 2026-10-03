/*
 * figures.js: how a stacked gate is flown.
 *
 * A double or triple stack is one structure and several openings. Each
 * opening is a pass of its own. The AUTHOR chooses the figure, and this
 * file writes the flying order that figure means: which hole, in which
 * order, from which face.
 *
 *   spiral up     bottom to top, wrapping around the stack, each pass from
 *                 the SAME face. You climb; you do not reverse.
 *   spiral down   top to bottom, wrapping around, each pass from the
 *                 opposite face of the one before. That is what makes it
 *                 a different figure from flying a spiral up in reverse.
 *   split-S       through the top, invert, back through the bottom the
 *                 other way. On a triple the middle opening is skipped.
 *   one opening   a single hole, which is how a stack is placed
 *
 * The sequence is the source of truth. A figure is detected by reading the
 * entries, not stored as a second copy of them, so a track file from before
 * this file existed still round trips and a hand edit that leaves the plan
 * still matches the button.
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

import { KIND, TRACK_CLASS_DEFAULT, tuningFor } from './elements.js';
import {
  aperturesOf, apertureCenter, elementById, elementNormal, kindOf,
} from './model.js';
import { add, leftOf, lerp, normalize, scale, sub } from './geometry.js';
import { str } from '../strings/index.js';

export const FIGURES = {
  single: {
    id: 'single',
    label: str('figures.one_opening'),
    hint: str('figures.one_hole_counts_the_others_are'),
  },
  spiralUp: {
    id: 'spiralUp',
    label: str('figures.spiral_up'),
    hint: str('figures.each_hole_is_its_own_gate'),
  },
  spiralDown: {
    id: 'spiralDown',
    label: str('figures.spiral_down'),
    hint: str('figures.each_hole_is_its_own_gate_2'),
  },
  splitS: {
    id: 'splitS',
    label: str('figures.split_s'),
    hint: str('figures.two_gates_through_the_top_invert'),
  },
};


export function levelName(el, index) {
  const n = aperturesOf(el).length;
  const i = Math.max(0, Math.min(n - 1, Math.round(index ?? 0)));
  if (n === 2) {
    return i === 0 ? 'bottom' : 'top';
  }
  if (n === 3) {
    return ['bottom', 'middle', 'top'][i];
  }
  return `level ${i + 1}`;
}

/*
 * The openings and faces a figure writes, given which way the FIRST pass
 * should go. approach +1 is along the structure's normal.
 */
export function figurePlan(el, figureId, approach = 1) {
  const n = aperturesOf(el).length;
  const sign = approach < 0 ? -1 : 1;
  if (figureId === 'spiralUp' && n >= 2) {
    const out = [];
    for (let i = 0; i < n; i += 1) {
      out.push({ apertureIndex: i, entry: sign });
    }
    return out;
  }
  if (figureId === 'spiralDown' && n >= 3) {
    const out = [];
    for (let k = 0; k < n; k += 1) {
      out.push({ apertureIndex: n - 1 - k, entry: k % 2 === 0 ? sign : -sign });
    }
    return out;
  }
  if (figureId === 'splitS' && n >= 2) {
    return [
      { apertureIndex: n - 1, entry: sign },
      { apertureIndex: 0, entry: -sign },
    ];
  }
  return [{ apertureIndex: 0, entry: sign }];
}

function plansMatch(seqs, plan) {
  if (seqs.length !== plan.length) {
    return false;
  }
  for (let i = 0; i < plan.length; i += 1) {
    if ((seqs[i].apertureIndex ?? 0) !== plan[i].apertureIndex) {
      return false;
    }
    const got = seqs[i].entry;
    if (got !== 1 && got !== -1) {
      return false;
    }
    if (got !== plan[i].entry) {
      return false;
    }
  }
  return true;
}

/*
 * Tracks written when spiral up meant alternating faces. Those files still
 * load; this rewrites a run that is the old plan into the current one, same
 * holes, same first-pass sign, every hole now entered from that face.
 *
 * Spiral down was briefly written as the same face too, which made it a
 * spiral up flown backwards. Those runs are rewritten to alternating faces.
 *
 * IT LEAVES A RUN ALONE IF THE AUTHOR HAS TOUCHED ANY OF ITS FACES, and that
 * is not a nicety, it is the whole difference between a migration and data
 * loss.
 *
 * This recognises an old file by its SHAPE, because the old spelling was
 * never given a schema version to key off. The trouble is that the shape it
 * looks for, a stack whose passes alternate faces, is also exactly what an
 * author gets by building a spiral up and then pressing Flip face on one
 * pass. Reported: a triple stack with the middle pass reversed by hand read
 * correctly in the builder, "enter from the front", and flew from the back
 * in the game. src/game/trackdoc.js runs this on EVERY conversion of a
 * document into a course, so the rewrite happened again on every single
 * load and the author could never make it stick.
 *
 * `overridden` separates the two cleanly. An old file's stack was sequenced
 * with addNextLevel and its faces were derived by applyAutoFaces, which
 * leaves the flag false. Every deliberate face in this build carries it:
 * applyFigure sets it on every pass it writes, and flipFace sets it on the
 * pass it turns. So a run with the flag anywhere in it is a statement, not a
 * spelling, and this leaves it exactly as the author wrote it.
 */
export function upgradeStackedFigures(doc) {
  let i = 0;
  let changed = false;
  while (i < doc.sequence.length) {
    const seq = doc.sequence[i];
    const el = elementById(doc, seq.elementId);
    if (!el || kindOf(el) !== KIND.APERTURE) {
      i += 1;
      continue;
    }
    const run = [];
    while (i < doc.sequence.length && doc.sequence[i].elementId === seq.elementId) {
      run.push(doc.sequence[i]);
      i += 1;
    }
    const n = aperturesOf(el).length;
    if (n < 2 || run.length < 2) {
      continue;
    }
    /* The author has said which way through at least one of these holes.
     * Whatever this run looks like, it is not an old file's spelling. */
    if (run.some((s) => s.overridden)) {
      continue;
    }
    const approach = run[0].entry === -1 ? -1 : 1;
    const oldUp = [];
    for (let k = 0; k < n; k += 1) {
      oldUp.push({ apertureIndex: k, entry: k % 2 === 0 ? approach : -approach });
    }
    if (plansMatch(run, oldUp)) {
      for (const s of run) {
        s.entry = approach;
      }
      changed = true;
      continue;
    }
    if (n >= 3) {
      const sameDown = [];
      for (let k = 0; k < n; k += 1) {
        sameDown.push({ apertureIndex: n - 1 - k, entry: approach });
      }
      if (plansMatch(run, sameDown)) {
        for (let k = 0; k < run.length; k += 1) {
          run[k].entry = k % 2 === 0 ? approach : -approach;
        }
        changed = true;
      }
    }
  }
  return changed;
}

/*
 * Which named figure the consecutive sequence entries on this element
 * already are, or null when they are a hand mix. Split-S is tested before
 * spiral down because on a double stack they are the same two holes and
 * Split-S is the name a pilot uses for that dive.
 */
export function matchingFigureOf(el, seqs) {
  if (!seqs.length) {
    return null;
  }
  const approach = seqs[0].entry === -1 ? -1 : 1;
  const order = ['splitS', 'spiralUp', 'spiralDown', 'single'];
  for (const id of order) {
    if (plansMatch(seqs, figurePlan(el, id, approach))) {
      return id;
    }
  }
  return null;
}


export function figureCueOf(el, seq, seqs) {
  const fig = matchingFigureOf(el, seqs);
  const level = levelName(el, seq.apertureIndex);
  if (!fig || fig === 'single') {
    const n = aperturesOf(el).length;
    return n > 1 ? level : '';
  }
  return `${FIGURES[fig].label}, ${level}`;
}


/*
 * Where the racing line goes BETWEEN two stacked passes, so it wraps around
 * the structure instead of climbing through the PVC.
 *
 * A split-S (a leap from the top to the bottom, or a double stack flown
 * downward) loops out in front, along the first pass's travel. A spiral
 * step between neighbouring levels loops out to the left of that travel,
 * which is the helix.
 *
 * The reach is the class's (tuningFor), so a class with its own stackWrap
 * wraps by it.
 */
export function wrapBetween(el, seqA, seqB, cls = TRACK_CLASS_DEFAULT) {
  const a = apertureCenter(el, seqA.apertureIndex ?? 0);
  const b = apertureCenter(el, seqB.apertureIndex ?? 0);
  const mid = lerp(a, b, 0.5);
  const travel = scale(elementNormal(el), seqA.entry === -1 ? -1 : 1);
  const i0 = seqA.apertureIndex ?? 0;
  const i1 = seqB.apertureIndex ?? 0;
  const n = aperturesOf(el).length;
  const leap = Math.abs(i0 - i1) > 1 || (n === 2 && i0 > i1);
  const reach = tuningFor(cls).stackWrap;
  const offset = leap ? scale(normalize(travel), reach) : scale(leftOf(travel), reach);
  const pos = add(mid, offset);
  const tangent = normalize(sub(b, a), travel);
  return { pos, tangent };
}
