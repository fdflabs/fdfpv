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
 * A road a photograph shows (DRESSED) is drawn at its photographed width
 * with its paint, its verges and its lamps.
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
  /* A dressed road's verge: the rockfill-road photograph's gravel, the
   * basalt's grey brown with the red earth in it, not bare terra roxa
   * (read from above in the aerial-rockfill photograph, dark as the face). */
  verge: [0.32, 0.25, 0.21],
};

/*
 * Roads a photograph shows better than OSM's tags: A gives an untagged
 * way its class's width (build_osm.py ROAD_WIDTH), a service road's
 * 3.5 m, and nothing of its paint, verges or lamps.
 *
 * w30657423 is the road the rockfill-road photograph stands on: from the
 * crest at the rockfill dam's west end down across its downstream face
 * to the toe at x 1 390, and back up to the crest at x 1 815 (OSM tags
 * it service, asphalt, and no width or lanes). The photograph shows two
 * 3.5 m lanes with a double yellow line between them and a white line
 * at each edge, a verge of red brown gravel either side, and a lamp
 * every 30 to 40 m on the verge on the dam's side, its arm over the
 * road. The widths are read off that photograph against its lane
 * arrows; the lamps are the dam's crest lamps (dam/index.js LAMP).
 * `damSide` is which side of the way, walked from its first point, the
 * dam's axis is: -1, against ribbon()'s normal.
 */
export const DRESSED = {
  w30657423: {
    width: 7.5, verge: 2, damSide: -1, lampEvery: 35,
  },
};

/* Paint over the asphalt, metres over the ground (under LIFT_MAX), and
 * its lines' widths and colours: swiss2/look.js's white road paint, and
 * its lineYellow's colour in that paint's finish. */
const LIFT_PAINT = 0.075;
const LINE = 0.12;
const LINE_GAP = 0.12;
const EDGE_IN = 0.3;
const PAINT_WHITE = [0.72, 0.72, 0.68];
const PAINT_YELLOW = [0.7, 0.45, 0.02];
/* The lamp: 10 m to its arm, the arm 2.4 m out from the verge's middle
 * over the road, bending out of the pole's top over its last metre. */
const LAMP = {
  height: 10, bend: 1, arm: 2.4, r: 0.12, head: 0.7,
};
const LAMP_TINT = [0.46, 0.47, 0.48];

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

/* The surface key (swiss2/look.js) a paving is drawn with. */
const KEY = { asphalt: 'asphalt', cobble: 'cobble', earth: 'pathGravel' };

/*
 * The polyline `points` moved `d` along ribbon()'s normal, each corner
 * on the bisector of its two segments' normals, so a line painted on it
 * stays `d` from the middle round a bend.
 */
export function offsetLine(points, d) {
  const norms = [];
  for (let k = 0; k + 1 < points.length; k += 1) {
    const [ax, az] = points[k];
    const [bx, bz] = points[k + 1];
    const len = Math.hypot(bx - ax, bz - az);
    norms.push(len > 1e-6 ? [-(bz - az) / len, (bx - ax) / len] : null);
  }
  return points.map(([x, z], k) => {
    const u = norms[k - 1] ?? norms[k];
    const v = norms[k] ?? norms[k - 1];
    /* The bisector, lengthened so each segment's own offset is d. */
    const mx = u[0] + v[0];
    const mz = u[1] + v[1];
    const s = (2 * d) / (mx * mx + mz * mz);
    return [x + mx * s, z + mz * s];
  });
}

/*
 * A dressed road's paint, verges and lamps (DRESSED): lay(points, width,
 * key, tint, lift, lod) drapes a strip, lamp(foot, bend, knee, tip)
 * stands a lamp.
 */
function dress(f, spec, lay, lamp, ground) {
  /* The verges and the paint only near (mesh.js NEAR): from the air, a
   * kilometre off, a 12 cm line and a 2 m verge are under a pixel and
   * drew as a glittering brown strip where the aerial-rockfill
   * photograph has a clean grey band. */
  const outer = spec.width + 2 * spec.verge;
  lay(f.points, outer, KEY.earth, TINT.verge, LIFT_EARTH, 'near');
  const half = spec.width / 2;
  const paint = (d, tint) => lay(offsetLine(f.points, d), LINE, 'paint', tint, LIFT_PAINT, 'near');
  paint(-(LINE_GAP + LINE) / 2, PAINT_YELLOW);
  paint((LINE_GAP + LINE) / 2, PAINT_YELLOW);
  paint(-half + EDGE_IN + LINE / 2, PAINT_WHITE);
  paint(half - EDGE_IN - LINE / 2, PAINT_WHITE);
  /* Along the verge on the dam's side, a lamp every lampEvery metres from
   * half that from the way's first point. */
  const s = spec.damSide * (half + spec.verge / 2);
  const line = offsetLine(f.points, s);
  let next = spec.lampEvery / 2;
  let walked = 0;
  for (let k = 0; k + 1 < line.length; k += 1) {
    const [ax, az] = line[k];
    const [bx, bz] = line[k + 1];
    const len = Math.hypot(bx - ax, bz - az);
    while (next <= walked + len) {
      const t = (next - walked) / len;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      /* Toward the road: against the lamp's own side of the way. */
      const ox = (-(bz - az) / len) * -spec.damSide;
      const oz = ((bx - ax) / len) * -spec.damSide;
      const y = ground(x, z);
      const top = y + LAMP.height;
      lamp([x, y, z], [x, top - LAMP.bend, z], [x + ox * LAMP.bend, top, z + oz * LAMP.bend], [x + ox * LAMP.arm, top, z + oz * LAMP.arm]);
      next += spec.lampEvery;
    }
    walked += len;
  }
}

/*
 * Every road laid: face(key, tint, polygon [[x, y, z]...], lod) for each
 * piece of each ribbon (lod as mesh.js face's, undefined for both),
 * bridge(f) for each bridge, bar(key, tint, p, q, r, opts, h) for each
 * piece of a dressed road's lamps. Returns what was done with each
 * feature, counted.
 */
export function layRoads(features, ground, { face, bridge, bar }) {
  const counts = {
    draped: 0, bridges: 0, onDam: 0, tunnels: 0, ring: 0, pieces: 0, dressed: 0, lamps: 0,
  };
  const lay = (points, width, key, tint, lift, lod) => {
    for (const quad of ribbon(points, width)) {
      cutToGround(quad, (piece) => {
        counts.pieces += 1;
        face(key, tint, onGround(piece, ground, lift), lod);
      });
    }
  };
  const lamp = (foot, bend, knee, tip) => {
    counts.lamps += 1;
    bar('metal', LAMP_TINT, foot, bend, LAMP.r);
    bar('metal', LAMP_TINT, bend, knee, LAMP.r);
    bar('metal', LAMP_TINT, knee, tip, LAMP.r * 0.8);
    /* The luminaire: a flat head at the arm's end, along it. */
    const dx = tip[0] - knee[0];
    const dz = tip[2] - knee[2];
    const l = Math.hypot(dx, dz);
    const back = [tip[0] - (dx / l) * LAMP.head, tip[1] - 0.1, tip[2] - (dz / l) * LAMP.head];
    bar('metal', LAMP_TINT, back, [tip[0], tip[1] - 0.1, tip[2]], 0.16, {}, 0.09);
  };
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
    const spec = DRESSED[f.id];
    lay(f.points, spec ? spec.width : f.width, KEY[paving], TINT[paving], liftOf(f, paving));
    if (spec) {
      counts.dressed += 1;
      dress(f, spec, lay, lamp, ground);
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
