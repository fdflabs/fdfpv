/*
 * roads.js: OpenStreetMap's highways in the hero square, on the ground,
 * and its bridges as decks a craft can land on.
 *
 * A road is a ribbon of its class's width (A's `width`, section 7) laid
 * on the ground exactly (drape.js), lifted LIFT over it by class so the
 * bigger road is drawn over the smaller where they cross, never more
 * than 0.1 m over the ground. What it is paved with: asphalt, the cobble
 * Paraguay paves its towns with (empedrado, OSM's cobblestone and sett),
 * or the red earth (terra roxa) of an unpaved road, a track or a path.
 *
 * Not drawn: a road OSM puts on the dam (`onDam`), which is the dam's
 * own crest road (package D), and a tunnel. A bridge is a deck: its top a
 * roofs.js record, so a craft lands and taxis on it, its slab walls in
 * the static set (there are few), and its sides and rails drawn.
 *
 * Pure: no THREE, so the checks run it in Node.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { cutToGround, ribbon } from './drape.js';
import { roofRecord } from '../../alps/roofs.js';
import { wallBoxes } from './plan.js';

/* Metres over the ground, by class: the bigger road over the smaller
 * where they cross. Section 14 asks for within 0.1 m. */
const LIFT = {
  trunk: 0.08,
  trunk_link: 0.08,
  primary: 0.08,
  primary_link: 0.08,
  secondary: 0.07,
  secondary_link: 0.07,
  tertiary: 0.07,
  tertiary_link: 0.07,
};
const LIFT_OTHER = 0.06;
const LIFT_EARTH = 0.04;
export const LIFT_MAX = 0.08;

/* A bridge deck's slab under its top, metres, and its rails' height. */
const DECK = 0.8;
const RAIL = 1.0;

/* Linear tints: worn asphalt, the grey basalt cobbles, and terra roxa. */
const TINT = {
  asphalt: [0.8, 0.8, 0.8],
  cobble: [0.75, 0.72, 0.7],
  earth: [0.62, 0.3, 0.17],
};

const COBBLE = new Set(['cobblestone', 'sett', 'paving_stones']);
const EARTH_SURFACE = new Set(['unpaved', 'dirt', 'ground', 'gravel', 'earth', 'sand']);
const EARTH_CLASS = new Set(['track', 'path']);

/* What a road is paved with: 'asphalt', 'cobble' or 'earth'. */
export function pavingOf(f) {
  if (COBBLE.has(f.surface)) {
    return 'cobble';
  }
  if (EARTH_SURFACE.has(f.surface) || (f.surface == null && EARTH_CLASS.has(f.drawnAs))) {
    return 'earth';
  }
  return 'asphalt';
}

function liftOf(f, paving) {
  return paving === 'earth' ? LIFT_EARTH : LIFT[f.drawnAs] ?? LIFT_OTHER;
}

/*
 * A piece's corners at the ground's height plus `lift`, each read a
 * millimetre in from the corner toward the piece's middle: a corner is
 * on a line where two of the ground's triangles meet, and at the hero's
 * edge the two sides are two levels of the terrain, whose heights differ
 * there by a few centimetres. Read from inside, every corner is on the
 * piece's own triangle, so the piece is that triangle's plane.
 */
function onGround(piece, ground, lift) {
  let cx = 0;
  let cz = 0;
  for (const [x, z] of piece) {
    cx += x;
    cz += z;
  }
  cx /= piece.length;
  cz /= piece.length;
  return piece.map(([x, z]) => {
    const d = Math.hypot(cx - x, cz - z);
    const t = d > 1e-3 ? 1e-3 / d : 0;
    return [x, ground(x + (cx - x) * t, z + (cz - z) * t) + lift, z];
  });
}

/*
 * Every road laid: face(paving, tint, polygon [[x, y, z]...]) for each
 * piece of each ribbon, bridge(f) for each bridge. Returns what was done
 * with each feature, counted.
 */
export function layRoads(features, ground, { face, bridge }) {
  const counts = { draped: 0, bridges: 0, onDam: 0, tunnels: 0, ring: 0, pieces: 0 };
  for (const f of features) {
    if (f.square === 'ring') {
      counts.ring += 1;
      continue;
    }
    if (f.onDam) {
      counts.onDam += 1;
      continue;
    }
    if (f.tunnel) {
      counts.tunnels += 1;
      continue;
    }
    if (f.bridge) {
      counts.bridges += 1;
      bridge(f);
      continue;
    }
    counts.draped += 1;
    const paving = pavingOf(f);
    const lift = liftOf(f, paving);
    for (const quad of ribbon(f.points, f.width)) {
      cutToGround(quad, (piece) => {
        counts.pieces += 1;
        face(paving, TINT[paving], onGround(piece, ground, lift));
      });
    }
  }
  return counts;
}

/*
 * A bridge: per segment of its way, a deck whose top runs straight from
 * the height at one end to the other. Its ends are flush with the road
 * that meets them (the ground plus the road's lift), and its middle is
 * held over the ground it crosses. Returns the records, the static wall
 * boxes, and the faces to draw ({ key, tint, pts, n }).
 */
export function deckOf(f, ground) {
  const pts = f.points;
  const lift = liftOf(f, pavingOf(f));
  /* Along the way, metres, and the deck's height there. */
  const along = [0];
  for (let k = 1; k < pts.length; k += 1) {
    along.push(along[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  }
  const total = along[along.length - 1];
  const y0 = ground(...pts[0]) + lift;
  const y1 = ground(...pts[pts.length - 1]) + lift;
  const ys = pts.map((p, k) => Math.max(y0 + ((y1 - y0) * along[k]) / total, k === 0 || k === pts.length - 1 ? -Infinity : ground(...p) + lift));
  const hw = f.width / 2;
  const records = [];
  const boxes = [];
  const faces = [];
  for (let k = 0; k + 1 < pts.length; k += 1) {
    const [ax, az] = pts[k];
    const [bx, bz] = pts[k + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (!(len > 0.5)) {
      continue;
    }
    const ux = (bx - ax) / len;
    const uz = (bz - az) / len;
    const cx = (ax + bx) / 2;
    const cz = (az + bz) / 2;
    const ym = (ys[k] + ys[k + 1]) / 2;
    const hl = len / 2;
    /* roofs.js's frame: local z along the deck, world (ux, uz); local x
     * across it, world (uz, -ux). */
    const e = [uz, 0, -ux, 0, 0, 1, 0, 0, ux, 0, uz, 0, cx, ym, cz, 1];
    const da = ys[k] - ym;
    const db = ys[k + 1] - ym;
    const top = [[[-hw, da, -hl], [hw, da, -hl], [hw, db, hl], [-hw, db, hl]]];
    const rec = roofRecord({ top, dy: DECK, hw, hd: hl, kind: 'bridge' }, e, 'deck');
    rec.material = 'asphalt';
    records.push(rec);
    const world = (lx, ly, lz) => [uz * lx + ux * lz + cx, ym + ly, -ux * lx + uz * lz + cz];
    const ring = [world(-hw, 0, -hl), world(hw, 0, -hl), world(hw, 0, hl), world(-hw, 0, hl)].map((p) => [p[0], p[2]]);
    const rect = {
      cx, cz, ux, uz, hl, hs: hw, area: 4 * hl * hw, turned: Math.min(Math.abs(ux), Math.abs(uz)) > 0.17364817766693033,
    };
    boxes.push(...wallBoxes(ring, rect, Math.min(ys[k], ys[k + 1]) - DECK, Math.max(ys[k], ys[k + 1]), rec, []).boxes);
    /* The rails stand on the deck, solid whether or not the deck is a
     * craft's ground: they are not the record's own solids. */
    for (const sx of [-1, 1]) {
      const railRing = [world(sx * hw, 0, -hl), world(sx * (hw - 0.25), 0, -hl), world(sx * (hw - 0.25), 0, hl), world(sx * hw, 0, hl)].map((p) => [p[0], p[2]]);
      const railRect = { ...rect, hs: 0.125 };
      boxes.push(...wallBoxes(railRing, railRect, Math.min(ys[k], ys[k + 1]) - 0.1, Math.max(ys[k], ys[k + 1]) + RAIL, null, []).boxes);
    }
    const sideN = [uz, 0, -ux];
    const up = [0, 1, 0];
    faces.push({ key: 'deck', pts: [world(-hw, da, -hl), world(hw, da, -hl), world(hw, db, hl), world(-hw, db, hl)], n: up });
    faces.push({ key: 'concrete', pts: [world(-hw, da - DECK, -hl), world(-hw, db - DECK, hl), world(hw, db - DECK, hl), world(hw, da - DECK, -hl)], n: [0, -1, 0] });
    for (const sx of [-1, 1]) {
      const n = sideN.map((q) => q * sx);
      faces.push({ key: 'concrete', pts: [world(sx * hw, da - DECK, -hl), world(sx * hw, db - DECK, hl), world(sx * hw, db, hl), world(sx * hw, da, -hl)], n });
      /* The rail: a parapet 0.25 m thick along the edge. */
      const ri = sx * (hw - 0.25);
      faces.push({ key: 'concrete', pts: [world(sx * hw, da, -hl), world(sx * hw, db, hl), world(sx * hw, db + RAIL, hl), world(sx * hw, da + RAIL, -hl)], n });
      faces.push({ key: 'concrete', pts: [world(ri, da, -hl), world(ri, db, hl), world(ri, db + RAIL, hl), world(ri, da + RAIL, -hl)], n: n.map((q) => -q) });
      faces.push({ key: 'concrete', pts: [world(ri, da + RAIL, -hl), world(ri, db + RAIL, hl), world(sx * hw, db + RAIL, hl), world(sx * hw, da + RAIL, -hl)], n: up });
    }
  }
  return {
    records, boxes, faces, tint: TINT[pavingOf(f)], paving: pavingOf(f),
  };
}
