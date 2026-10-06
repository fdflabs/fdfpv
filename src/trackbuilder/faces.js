/*
 * faces.js: which way each opening is flown and which side of each marker
 * the quad passes, derived from the course so an author rarely sets either.
 *
 * The rules are schema.md's "Faces and pass sides: what the tool derives":
 * after every edit each sequence entry the author has not fixed by hand is
 * re-derived from the straight line between its neighbours in the flying
 * order. An opening flown once is turned to face along the line; one flown
 * more than once, or one the author has turned, keeps its heading and only
 * the entry sign is chosen; a marker goes on the outside of the turn.
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

import { KIND } from './elements.js';
import {
  elementById, kindOf, entryAnchor, elementNormal, startPadsOf, sequenceRefCount,
} from './model.js';
import { cross, dot, leftOf, length, normalize, scale, sub, wrapAngle, yawVector } from './geometry.js';

/* A marker standing beside an opening is parked on its frame: a flag on a
 * gate's stile. Its pass is square to that opening, not to the chain, which
 * would run along the header. Beside means within STILE_REACH of the
 * opening's foot on the plan, no more than STILE_DEPTH in front or behind
 * its face, and out to the side by at least STILE_INNER of its half width,
 * so a pole in the middle of the hole does not count. Metres. */
const STILE_DEPTH = 1.2;
const STILE_INNER = 0.45;
const STILE_REACH = 3.0;

/* The sign of the opening's decided pass nearest the marker's first pass in
 * the flying order, the earlier one on a tie; for a marker not yet flown,
 * its first decided pass; +1 when it has none. */
function signNear(doc, openingId, markerId) {
  const at = doc.sequence.findIndex((s) => s.elementId === markerId);
  let best = null;
  let gap = Infinity;
  doc.sequence.forEach((s, i) => {
    if (s.elementId !== openingId || !s.entry) {
      return;
    }
    const d = Math.abs(i - at);
    if (d < gap) {
      best = s;
      gap = d;
    }
  });
  return best && best.entry < 0 ? -1 : 1;
}

/* What can be parked on a frame, and what has a frame to park on: a flag
 * or a cone beside any opening but a dive gate's, which lies flat. */
const PARKABLE = ['flag', 'cone'];

/* The travel through the opening a marker is parked beside, or null when it
 * stands clear of every opening. The nearest one wins; the first wins a tie. */
export function nearbyApertureTravel(doc, el) {
  if (!PARKABLE.includes(el.type)) {
    return null;
  }
  let best = null;
  let bestDistance = Infinity;
  for (const other of doc.elements) {
    if (kindOf(other) !== KIND.APERTURE || other.type === 'diveGate') {
      continue;
    }
    const offset = { x: el.position.x - other.position.x, y: el.position.y - other.position.y, z: 0 };
    const facing = yawVector(other.yaw);
    const depth = Math.abs(dot(offset, facing));
    const across = Math.abs(dot(offset, leftOf(facing)));
    const half = other.dims.clearW / 2;
    const distance = Math.sqrt(offset.x * offset.x + offset.y * offset.y);
    if (depth > STILE_DEPTH || across < STILE_INNER * half || distance > STILE_REACH) {
      continue;
    }
    if (distance < bestDistance) {
      best = other;
      bestDistance = distance;
    }
  }
  return best ? scale(elementNormal(best), signNear(doc, best.id, el.id)) : null;
}

/* The points the directions are read off: the start pads, each entry's
 * anchor (a marker's own position, never its offset knot, since the offset
 * depends on the direction), and the pads again to close the lap. */
export function anchorChain(doc) {
  const chain = [];
  const pads = startPadsOf(doc);
  const padLink = () => ({ pos: { ...pads.position }, seq: null });
  if (pads) {
    chain.push(padLink());
  }
  for (const s of doc.sequence) {
    const pos = entryAnchor(doc, s);
    if (pos) {
      chain.push({ pos, seq: s });
    }
  }
  if (pads && chain.length > 1) {
    chain.push(padLink());
  }
  return chain;
}

/* Direction of travel at link i: next minus previous inside the chain, the
 * single neighbour at its ends. Null for a chain of one, or where the
 * neighbours coincide. */
function travelAt(chain, i) {
  if (chain.length < 2) {
    return null;
  }
  const before = chain[Math.max(0, i - 1)].pos;
  const after = chain[Math.min(chain.length - 1, i + 1)].pos;
  const span = sub(after, before);
  return length(span) <= 1e-9 ? null : normalize(span);
}

/* Below this the two legs into and out of a marker are one straight line
 * (square metres: the cross product of the raw legs), and its side is left
 * as it is. */
const STRAIGHT = 1e-6;

/* Which side of the turn at link i is the outside, as a pass side. */
function outsideOf(chain, i) {
  if (i === 0 || i === chain.length - 1) {
    return null;
  }
  const into = sub(chain[i].pos, chain[i - 1].pos);
  const out = sub(chain[i + 1].pos, chain[i].pos);
  const turn = cross(into, out).z;
  if (Math.abs(turn) <= STRAIGHT) {
    return null;
  }
  return turn > 0 ? 'right' : 'left';
}

/* An opening counts as tilted once its normal leaves the horizontal by more
 * than this (the sine of about three degrees); below it, it is flown as an
 * upright gate. */
const TILTED = 0.05;

/* A climb or drop smaller than this between two knots, in metres, says
 * nothing about which way the line is going. */
const LEVEL_BAND = 0.2;

/* A dot product this close to zero cannot tell the two faces apart. */
const SQUARE_ON = 1e-6;

/*
 * Is the line going up (+1) or down (-1) through link i? The departure
 * decides: the drop to the next knot, else the drop from the previous one,
 * else down, because a dive gate between two knots at its own height is
 * there to be dived through. Reading the chord across the element instead
 * would call that level and point the dive gate at the sky.
 */
function verticalSense(chain, i) {
  const here = chain[i].pos.z;
  const next = chain[i + 1]?.pos.z;
  if (next !== undefined && Math.abs(next - here) > LEVEL_BAND) {
    return next > here ? 1 : -1;
  }
  const prev = chain[i - 1]?.pos.z;
  if (prev !== undefined && Math.abs(here - prev) > LEVEL_BAND) {
    return here > prev ? 1 : -1;
  }
  return -1;
}

/* The entry sign for a structure that keeps its heading: the way the line
 * goes through it. When the line runs square across its face that says
 * nothing, so a sign already chosen stands, and an undecided one is the
 * sign that flies it downward. */
function signThrough(el, travel, current) {
  const normal = elementNormal(el);
  const along = dot(normal, travel);
  if (Math.abs(along) < SQUARE_ON) {
    if (current) {
      return current;
    }
    return normal.z < 0 ? 1 : -1;
  }
  return along < 0 ? -1 : 1;
}

/* The heading that sends an opening's face along the travel on the plan,
 * entered with `sign`. */
function headingFor(travel, sign) {
  const heading = Math.atan2(travel.y, travel.x);
  return sign < 0 ? wrapAngle(heading + Math.PI) : heading;
}

/* The sign for an opening flown once. Upright, it is entered from the front.
 * Tilted, the tilt fixes the vertical part of the normal, so the sign comes
 * from whether the line climbs or drops through it, and the heading follows
 * to agree on the plan; choosing the heading first would turn every angled
 * dive gate into a launch gate. */
function signAlong(el, chain, i) {
  const rise = elementNormal(el).z;
  if (Math.abs(rise) <= TILTED) {
    return 1;
  }
  return verticalSense(chain, i) * (rise < 0 ? -1 : 1);
}

/*
 * Re-derive every face and pass side the author has not set. An opening
 * flown once whose heading the author has not fixed is still turned to meet
 * the line when its entry is the author's: the turn then honours that entry.
 * Edits the document in place, because it runs after every edit, and
 * returns it.
 */
export function applyAutoFaces(doc) {
  const chain = anchorChain(doc);
  chain.forEach((link, i) => {
    const s = link.seq;
    const el = s && elementById(doc, s.elementId);
    if (!el) {
      return;
    }
    const kind = kindOf(el);
    const travel = travelAt(chain, i);
    if (!travel) {
      /* Nothing to read a direction off: everything stays as it is, except
       * that an undecided opening is given its front. */
      if (kind === KIND.APERTURE && !s.overridden && s.entry === 0) {
        s.entry = 1;
      }
      return;
    }
    if (kind === KIND.MARKER && !s.overridden) {
      const side = outsideOf(chain, i);
      if (side) {
        s.passSide = side;
      }
      return;
    }
    if (kind !== KIND.APERTURE) {
      return;
    }
    const turnable = sequenceRefCount(doc, el.id) === 1 && !el.yawOverridden;
    if (turnable) {
      const sign = s.overridden ? s.entry : signAlong(el, chain, i);
      el.yaw = headingFor(travel, sign);
      s.entry = sign;
    } else if (!s.overridden) {
      s.entry = signThrough(el, travel, s.entry);
    }
  });
  return doc;
}

/* Tilt one element's openings; true when it exists. */
export function setPitch(doc, elementId, pitch) {
  const el = elementById(doc, elementId);
  if (!el) {
    return false;
  }
  el.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
  return true;
}

/* +1 for a pass on the left of a marker, -1 on the right. */
export function passOffsetSign(passSide) {
  return passSide === 'right' ? -1 : 1;
}

/*
 * The level unit vector from a marker to its pass. A marker the author has
 * turned by hand (yawOverridden) points it with its own heading, all the way
 * round; otherwise it is the left or right of the local travel, which is the
 * outside of the turn when the faces are derived.
 */
export function markerPassDir(el, seq, travel) {
  if (el.yawOverridden) {
    return yawVector(el.yaw);
  }
  const flat = normalize({ x: travel?.x ?? 0, y: travel?.y ?? 0, z: 0 });
  return scale(leftOf(flat), passOffsetSign(seq?.passSide));
}

/* The direction an element faces: an opening's normal, anything else its
 * heading on the plan. */
export function faceAxis(el) {
  return kindOf(el) === KIND.APERTURE ? elementNormal(el) : yawVector(el.yaw);
}
