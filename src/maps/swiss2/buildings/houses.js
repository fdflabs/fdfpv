/*
 * houses.js: the chalets, the farmhouse, the barns, the Gasthof, the
 * bakery and the church, as they are built in the Bernese Oberland.
 *
 * Each is alps/kit.js's builder of the same name made again from
 * parts.js: the same plan, storey heights, roof shell, jetty and window
 * slots, returning the same extents, and drawing the village's rng
 * exactly where the cel builder does (a two storey chalet once, for its
 * lower balcony), so the placer's colliders and every later draw of the
 * rng come out as they do in the alps. What differs is everything the
 * cel village could leave flat: log walls with their corners standing
 * out, frieze beams, deep verges on purlins and brackets, rafter tails,
 * windows in proud frames with glazing bars and shutters off the wall,
 * sawn balustrades, geraniums, chimney hoods.
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

import * as THREE from 'three';
import {
  frame, box, boxUp, cached, prism, SOCLE, near, detail, own,
  casement, doorway, balcony, woodpile, plinth, logCorners, frieze, timberTop, ring, plate, stair,
  REVEAL, masonry, deepWindow, deepDoor, wallBench, dripEdge,
  climber, paintedBand, paintedQuoins, notes, dressRoof,
} from './parts.js';
import { roofShell, gableProfile } from '../../alps/kit.js';

/*
 * How a house's masonry storey is finished and what grows on it. No two
 * houses in an Oberland village were limed alike: most are rendered and
 * washed white, cream, pale ochre, grey or a faded rose, with the window
 * surrounds painted in a colour of their own; some had the timber brought
 * down to the ground; a few painted a frieze under the logs or quoins up
 * the corners. Almost every one has geraniums, red mostly, and some have
 * ivy up a gable or a rose by the door. Chosen by the house's own number
 * (own), never the village rng, so the layout stays the cel one's.
 */
const WASH = [
  ['render', 'surroundGrey'], ['renderCream', 'surroundWhite'], ['renderOchre', 'surroundWhite'],
  ['renderGrey', 'surroundWhite'], ['renderRose', 'surroundGrey'], ['renderCream', 'surroundOchre'],
  ['render', 'surroundOchre'],
];
const FRIEZES = [['frescoRed', 'surroundWhite'], ['frescoGreen', 'surroundWhite'], ['frescoGrey', 'frescoRed'], ['frescoOchre', 'frescoRed']];

function facadeOf(f, base, board) {
  const bloom = own(f, 22) < 0.1 ? null : own(f, 23) < 0.28 ? 'geraniumPink' : 'geranium';
  const growth = {
    ivy: own(f, 24) < 0.3,
    rose: own(f, 25) < 0.3 ? (own(f, 26) < 0.5 ? 'rose' : 'roseWhite') : null,
  };
  if (base === 'stone') {
    return { wall: 'stone', surround: 'surround', bloom, band: null, quoins: null, ...growth };
  }
  if (own(f, 21) < 0.2) {
    return { wall: board, surround: board, bloom, band: null, quoins: null, ...growth };
  }
  const [wall, surround] = WASH[Math.floor(own(f, 27) * WASH.length)];
  const deco = own(f, 28);
  return {
    wall,
    surround,
    bloom,
    band: deco < 0.45 ? FRIEZES[Math.floor(own(f, 29) * FRIEZES.length)] : null,
    quoins: deco > 0.7 ? surround : null,
    ...growth,
  };
}

/* What the roof carries: panels on a few, a dormer on some. */
function roofOf(f) {
  return { solar: own(f, 31) < 0.22, dormer: own(f, 32) < 0.3 };
}

/* Joist ends under a jettied storey, along one wall frame. */
function joists(wall, len, y) {
  const n = Math.max(3, Math.round(len / 1.3));
  for (let k = 0; k < n; k += 1) {
    wall.put(near('boardLine'), box(0.14, 0.16, 0.34), -len / 2 + (k + 0.5) * (len / n), y, -0.13);
  }
}

/* Windows spread along a gable face: two on a narrow house, three on a
 * wide one, the Bernese row. */
function gableRow(wall, len, y, opts) {
  const n = len >= 9.6 ? 3 : 2;
  for (let k = 0; k < n; k += 1) {
    const x = n === 3 ? (k - 1) * (len / 3.3) : (k - 0.5) * (len / 2);
    casement(wall, x, y, 0.95, 1.05, { ...opts, seed: k });
  }
}

/*
 * A chalet: a stone or rendered ground floor, one or two log storeys
 * jettied over it on joists, a low roof on purlins with deep verges and
 * eaves, a Laube along the sunny side (+x) or both long sides, shutters
 * and geraniums, a door with its step, a woodpile under the eaves.
 */
export function chalet(f, rng, spec) {
  const {
    w = 9, d = 12, floors = 1, roof = 'gable', board = 'larch', base = 'stone',
    balconies = 'one', shutter = 'shutterGreen', roofKey = 'shingle',
    found = 0.3, pitch = 0.46, ov = 1.3, ovE = 1.2, ovA = ovE, ovB = ovE, blankA = false,
  } = spec;
  const baseH = 2.5;
  const floorH = 2.55;
  const jet = 0.3;
  const face = facadeOf(f, base, board);
  const { bloom } = face;
  const wu = w + 2 * jet;
  const hw = w / 2;
  const hwu = wu / 2;
  const hd = d / 2;
  plinth(f, w, d, found, false);
  dripEdge(f, w, d);
  const y1 = SOCLE + baseH;
  const top = timberTop(f, {
    w: wu, d, y0: y1, floors, floorH, kind: roof, key: board, roofKey,
    ov, ovA, ovB, pitch, snowGuard: true, chimneyAt: [-w / 4, d / 5], sag: own(f) < 0.5 ? 0.05 + 0.16 * own(f) : 0,
    ...roofOf(f),
  });
  /* The sill log the storey stands on, proud of the logs above it. */
  f.put(board, box(wu + 0.08, 0.26, d + 0.08), 0, y1 + 0.13, 0);
  logCorners(f, board, hwu, hd, y1, top.plate);
  const east = frame(f, hwu, 0, 0, Math.PI / 2);
  const west = frame(f, -hwu, 0, 0, -Math.PI / 2);
  const south = frame(f, 0, 0, hd, 0);
  const north = frame(f, 0, 0, -hd, Math.PI);
  const eastBase = frame(f, hw, 0, 0, Math.PI / 2);
  const westBase = frame(f, -hw, 0, 0, -Math.PI / 2);
  joists(eastBase, d - 0.4, y1 - 0.08);
  joists(westBase, d - 0.4, y1 - 0.08);
  const cols = Math.max(2, Math.round(d / 3.1));
  const slot = (c) => -hd + (c + 0.5) * (d / cols);
  /* A house with its Laube on one side only climbs to its upper floor
   * by a stair up the other, inside the room the cel collider already
   * leaves there for a balcony. */
  const outside = balconies === 'one' && d >= 10;
  if (outside) {
    stair(frame(f, -hwu, 0, 0, -Math.PI / 2), slot(0) + 0.5 + 3.9, slot(0) - 0.5, y1 + 0.1, board);
  }
  for (let k = 0; k < floors; k += 1) {
    const fy = y1 + k * floorH;
    /* The rng, where and as often as alps/kit.js's chalet draws it. */
    const hasBalcony = k === floors - 1 || floors === 1 || rng() < 0.6;
    for (const [wall, on] of [[east, true], [west, balconies === 'both']]) {
      const withBalcony = on && hasBalcony;
      if (!withBalcony) {
        frieze(wall, d + 0.2, fy + 0.8);
      }
      if (withBalcony) {
        balcony(frame(wall, 0, fy, 0, 0), d - 0.6, { board });
      }
      for (let c = 0; c < cols; c += 1) {
        const x = wall === east ? -slot(c) : slot(c);
        if (withBalcony && c === Math.floor(cols / 2)) {
          casement(wall, x, fy + 1.05, 0.9, 1.9, { sill: false, key: board });
        } else if (outside && wall === west && k === 0 && c === 0) {
          doorway(wall, x, 0.9, 1.95, { key: 'larchDark', frameKey: board, step: null, y0: fy + 0.12 });
        } else {
          casement(wall, x, fy + 1.45, 0.95, 1.05, { shutter, key: board, seed: c + k, bloom });
        }
      }
    }
  }
  for (const wall of blankA ? [south] : [south, north]) {
    for (let k = 0; k < floors; k += 1) {
      const fy = y1 + k * floorH;
      frieze(wall, wu + 0.2, fy + 0.8);
      gableRow(wall, wu, fy + 1.45, { shutter, key: board, bloom });
    }
    /* Under a full gable the front has its own small Laube, as wide as
     * the roof leaves a man's height over the geraniums, with a door
     * onto it; elsewhere a small window lights the loft. */
    const tanP = top.roof.tanP;
    const laube = 2 * (hwu - 1.65 / tanP);
    if (roof === 'gable' && wall === south && laube >= 2.6) {
      const gable = frame(wall, 0, 0, 0.04, 0);
      balcony(frame(gable, 0, top.plate, 0, 0), laube, { out: 1.0, board });
      casement(gable, 0, top.plate + 0.97, 0.8, 1.7, { key: board, sill: false });
    } else if (roof !== 'hip') {
      casement(frame(wall, 0, 0, 0.04, 0), 0, top.plate + 0.55, 0.6, 0.6, { shutter, key: board, bars: false });
    }
  }
  /* Ground floor, masonry: the door under its little roof and a window
   * row on the front with the bench under the first, windows and the
   * woodpile on the back, one window each gable end, every opening deep
   * in the wall. */
  const southBase = frame(f, 0, 0, hd, 0);
  const northBase = frame(f, 0, 0, -hd, Math.PI);
  const win = { shutter, surround: face.surround, bloom };
  const eastOpen = [deepDoor(eastBase, -slot(0), 1.05, 2.05, { frameKey: board, roofKey, board })];
  for (let c = 1; c < cols; c += 1) {
    eastOpen.push(deepWindow(eastBase, -slot(c), SOCLE + 1.35, 0.9, 1.0, { ...win, seed: c }));
  }
  wallBench(eastBase, -slot(1), 1.5);
  const westOpen = [deepWindow(westBase, slot(0), SOCLE + 1.35, 0.9, 1.0, win)];
  woodpile(westBase, slot(cols - 1) - 0.2, Math.min(3.2, d / cols - 0.4));
  const southOpen = [deepWindow(southBase, hw / 2, SOCLE + 1.35, 0.9, 1.0, win)];
  const northOpen = blankA ? [] : [deepWindow(northBase, hw / 2, SOCLE + 1.35, 0.9, 1.0, win)];
  if (face.band) {
    for (const [wall, len] of [[eastBase, d], [westBase, d], [southBase, w], [northBase, w]]) {
      paintedBand(wall, len - 0.1, SOCLE + baseH - 0.26, face.band);
    }
  }
  if (face.quoins) {
    paintedQuoins(f, hw, hd, SOCLE + 0.42, baseH - 0.42, face.quoins);
  }
  /* Ivy up the gable end away from the door, a rose on its trellis
   * beside the door. */
  if (face.ivy) {
    climber(southBase, -hw / 3, 0, Math.min(3.6, w * 0.45), baseH + (floors > 1 ? 2.2 : 1.2));
  }
  if (face.rose) {
    climber(eastBase, -slot(0) + 1.05, 0.1, 0.7, 2.3, { rose: face.rose });
  }
  masonry(f, w, d, SOCLE, baseH, face.wall, [
    { wall: eastBase, len: d, openings: eastOpen, bandLen: d + 0.16 },
    { wall: westBase, len: d, openings: westOpen, bandLen: d + 0.16 },
    { wall: southBase, len: w - 2 * REVEAL, openings: southOpen, bandLen: w },
    { wall: northBase, len: w - 2 * REVEAL, openings: northOpen, bandLen: w },
  ], base === 'render' ? 0.7 : 0.42);
  const hb = balconies === 'none' ? 0 : 1.4;
  const ext = { hw: Math.max(top.roof.ex, hwu + hb), hd: hd + Math.max(ovA, ovB), top: top.top };
  /* The front (+x) wall's door and bench, along the house's z. */
  notes(f).houses.push({ at: f.at(0, 0, 0), m: f.m.clone(), w, d, door: slot(0), bench: slot(1), ext, garden: true });
  return ext;
}

/* A plank door, its boards up and down, braced in a Z. */
function plankDoor(wall, x, y0, w, h, key) {
  wall.put(`${key}:v`, box(w, h, 0.06), x, y0 + h / 2, 0.03);
  wall.put(near('boardLine'), box(0.05, h, 0.03), x, y0 + h / 2, 0.075);
  for (const y of [0.25, h - 0.25]) {
    wall.put(near(key), box(w - 0.1, 0.14, 0.04), x, y0 + y, 0.08);
  }
  const diag = Math.hypot(w - 0.3, h - 0.5);
  wall.put(near(key), box(0.14, diag, 0.04), x, y0 + h / 2, 0.08, 0, 0, Math.atan2(w - 0.3, h - 0.5));
}

/*
 * A barn: a stone footing, log walls weathered dark, boards up and down
 * over the gable, a steep roof with a hay door in the gable and plank
 * doors on the end, air slits along the sides. 'stall' is the long gabled
 * cattle barn; 'hay' the squarer half hipped store with a lean-to along
 * one side.
 */
export function barn(f, spec) {
  const { kind = 'stall', w = 11, d = 16, found = 0.3, board = 'larchDark', roofKey = 'shingleDark', ovA = 1.1, ovB = 1.1 } = spec;
  const hw = w / 2;
  const hd = d / 2;
  const footH = 1.1;
  const wallH = kind === 'stall' ? 3.4 : 4.2;
  plinth(f, w, d, found);
  f.put('stone', boxUp(w, footH, d), 0, SOCLE, 0);
  const y1 = SOCLE + footH;
  const top = timberTop(f, {
    w, d, y0: y1, floors: 1, floorH: wallH, kind: kind === 'stall' ? 'gable' : 'halfhip', key: board,
    roofKey, ov: 0.9, ovA, ovB, pitch: kind === 'stall' ? 0.72 : 0.62, snowGuard: false,
    chimneyAt: null, f: 0.55, sag: 0.1 + 0.12 * own(f, 1),
  });
  f.put(board, box(w + 0.08, 0.24, d + 0.08), 0, y1 + 0.12, 0);
  logCorners(f, board, hw, hd, y1, top.plate);
  const gable = frame(f, 0, 0, hd, 0);
  /* The doors: two leaves in a heavy frame, the frame on the footing. */
  gable.put(near(board), box(3.3, 0.2, 0.16), 0, SOCLE + 3.1, 0.08);
  for (const s of [-1, 1]) {
    gable.put(near(board), boxUp(0.18, 3.0, 0.16), s * 1.6, SOCLE, 0.08);
    plankDoor(gable, s * 0.75, SOCLE, 1.48, 2.98, board);
  }
  /* The hay door up in the gable, and the hoist beam over it. */
  const hayY = top.plate + (kind === 'stall' ? 1.0 : 0.6);
  const hay = frame(gable, 0, 0, 0.04, 0);
  plankDoor(hay, 0, hayY - 0.8, 1.5, 1.6, board);
  hay.put(near(board), box(1.8, 0.14, 0.12), 0, hayY + 0.87, 0.06);
  hay.put(board, box(0.16, 0.16, 1.5), 0, hayY + 1.05, 0.65);
  const back = frame(f, 0, 0, -hd, Math.PI);
  casement(back, -w / 4, y1 + 1.4, 0.8, 0.6, { bars: false, key: board });
  casement(back, w / 4, y1 + 1.4, 0.8, 0.6, { bars: false, key: board });
  for (const wall of [frame(f, hw, 0, 0, Math.PI / 2), frame(f, -hw, 0, 0, -Math.PI / 2)]) {
    const n = Math.max(2, Math.round(d / 4));
    for (let k = 0; k < n; k += 1) {
      const x = -hd + (k + 0.5) * (d / n);
      casement(wall, x, y1 + 1.6, 0.8, 0.6, { bars: false, key: board });
      /* Air slits between the windows, where the hay is. */
      for (const dx of [-0.9, 0.9]) {
        wall.put(detail('boardLine'), plate(0.1, 0.9), x + dx, y1 + wallH - 1.0, 0.012);
      }
    }
  }
  let hwOut = top.roof.ex;
  if (kind === 'hay') {
    /* The lean-to: a shed roof off the +x wall on posts, over the
     * woodpile and the cart. */
    const out = 3.0;
    const y0 = SOCLE + footH + wallH - 1.2;
    const shed = prism([[hw, y0 + 0.9], [hw + out, y0], [hw + out, y0 + 0.16], [hw, y0 + 1.06]], -hd + 0.5, hd - 0.5);
    f.put(roofKey, shed);
    f.put(board, box(0.2, 0.22, d - 1.0), hw + out - 0.2, y0 - 0.12, 0);
    for (const z of [-hd + 0.8, 0, hd - 0.8]) {
      f.put(board, boxUp(0.18, y0 - 0.2, 0.18), hw + out - 0.2, SOCLE, z);
      f.put(near(board), box(0.12, 0.12, 1.1), hw + out - 0.2, y0 - 0.5, z + 0.45, 0, -0.785);
    }
    woodpile(frame(f, hw, 0, 0, Math.PI / 2), 0, d * 0.5, 4);
    hwOut = Math.max(hwOut, hw + out);
  }
  const ext = { hw: hwOut, hd: hd + Math.max(ovA, ovB), top: top.top };
  notes(f).houses.push({ at: f.at(0, 0, 0), m: f.m.clone(), w, d, door: 0, ext, garden: false });
  return ext;
}

/*
 * A Stadel: the hay barn that stands alone in an Oberland meadow, away
 * from any farm, where the hay is made. A footing of dry laid rubble
 * taking up the slope, the byre below in dark larch logs with their
 * ends standing out at the corners, the hay loft over it in upright
 * boards gone silver, each its own board with the dark of the loft in
 * the gaps between, the odd one replaced and still brown, a big hay
 * door in the gable, a low door to the byre, and a steep roof of old
 * shingle far over the gable on its purlins. The gable is +z.
 */
export function stadel(f, spec) {
  const { w = 7, d = 9, found = 0.3, roofKey = 'shingleDark', pitch = 0.6 } = spec;
  const hw = w / 2;
  const hd = d / 2;
  const footH = 0.75;
  const logH = 2.3;
  const loftH = 2.1;
  plinth(f, w, d, found, false);
  f.put('stone', boxUp(w + 0.1, footH, d + 0.1), 0, SOCLE, 0);
  const y1 = SOCLE + footH;
  f.put('larchDark', boxUp(w, logH, d), 0, y1, 0);
  logCorners(f, 'larchDark', hw, hd, y1, y1 + logH);
  const y2 = y1 + logH;
  f.put('larchDark', box(w + 0.16, 0.2, d + 0.16), 0, y2 + 0.1, 0);
  const plateY = y2 + loftH;
  const roof = roofShell({ kind: 'gable', hw, hd, ov: 0.75, ovA: 1.1, ovB: 1.3, pitch });
  Object.assign(roof, { hw, hd, kind: 'gable', zA0: 1.1, zB0: 1.3 });
  /* The loft's dark inside, which is all the gaps show. */
  const gable = gableProfile(roof, 'gable', hw);
  f.put('shade', prism([[hw - 0.02, y2 + 0.2], ...gable.map(([x, y]) => [x * 0.99, y + plateY]), [-hw + 0.02, y2 + 0.2]], -hd + 0.02, hd - 0.02));
  const flat = frame(f, 0, plateY, 0, 0);
  flat.put(roofKey, roof.geo);
  dressRoof(flat, roof, { roofKey, key: 'weathered', rafters: true, purlins: true });
  /* The boards: a board and a gap every quarter metre round the loft,
   * up to the plate on the long walls and to the verge on the gables. */
  const pitchB = 0.25;
  const board = (wall, u, y0, y1b, k) => {
    const key = own(f, 60 + k) < 0.12 ? 'larch:v' : 'weathered:v';
    wall.put(key, boxUp(pitchB - 0.035, y1b - y0, 0.035), u, y0, 0.03);
  };
  let k = 0;
  for (const s of [1, -1]) {
    const wall = frame(f, s * hw, 0, 0, s * Math.PI / 2);
    for (let u = -hd + pitchB / 2; u < hd; u += pitchB) {
      board(wall, u, y2 + 0.2, plateY, k);
      k += 1;
    }
  }
  const tanP = Math.tan(pitch);
  for (const s of [1, -1]) {
    const wall = frame(f, 0, 0, s * hd, s > 0 ? 0 : Math.PI);
    for (let u = -hw + pitchB / 2; u < hw; u += pitchB) {
      board(wall, u, y2 + 0.2, plateY + (hw - Math.abs(u) - pitchB / 2) * tanP - 0.04, k);
      k += 1;
    }
  }
  /* The hay door up in the gable, in a frame with the hoist beam over
   * it, and the byre's low door beside the corner. */
  const front = frame(f, 0, 0, hd + 0.08, 0);
  plankDoor(front, 0, y2 + 0.35, 1.9, 1.75, 'larchDark');
  front.put('larchDark', box(2.3, 0.16, 0.12), 0, y2 + 2.2, 0.02);
  for (const s of [-1, 1]) {
    front.put('larchDark', boxUp(0.14, 1.9, 0.1), s * 1.05, y2 + 0.3, 0.02);
  }
  front.put('larchDark', box(0.16, 0.16, 1.2), 0, plateY + 0.9, 0.5);
  const byre = frame(f, 0, 0, hd, 0);
  plankDoor(byre, -hw + 1.3, y1, 1.1, 1.85, 'larch');
  byre.put('larchDark', box(1.4, 0.14, 0.1), -hw + 1.3, y1 + 1.95, 0.06);
  /* A hatch on the long side for the dung, and a bench of a board. */
  const side = frame(f, hw, 0, 0, Math.PI / 2);
  side.put('shade', plate(0.7, 0.55), hd * 0.4, y1 + 1.35, 0.01);
  side.put('larchDark', box(0.9, 0.08, 0.1), hd * 0.4, y1 + 1.66, 0.05);
  side.put('weathered', box(2.2, 0.06, 0.34), -hd * 0.3, y1 + 0.45, 0.2);
  for (const s of [-1, 1]) {
    side.put('larchDark', boxUp(0.08, 0.45, 0.3), -hd * 0.3 + s * 0.95, y1, 0.2);
  }
  const ext = { hw: hw + 0.75, hd: hd + 1.3, top: plateY + roof.yR + 0.1 };
  notes(f).houses.push({ at: f.at(0, 0, 0), m: f.m.clone(), w, d, door: 0, ext, garden: false });
  return ext;
}

/*
 * A farmhouse with the barn under one long ridge, the Bernese way: the
 * house at the +z end, the barn behind it, the barn's roof higher and
 * steeper so the join reads. The same composition as the cel one.
 */
export function farmhouse(f, rng, spec) {
  const { found = 0.3, board = 'larch', shutter = 'shutterGreen' } = spec;
  const houseD = 12;
  const barnD = 15;
  const w = 10.5;
  const house = frame(f, 0, 0, barnD / 2, 0);
  const h = chalet(house, rng, {
    w, d: houseD, floors: 1, roof: 'halfhip', board, base: 'stone', balconies: 'one', shutter,
    found, ov: 1.4, ovB: 1.3, ovA: 0, blankA: true, pitch: 0.48,
  });
  const barnF = frame(f, 0, 0, -houseD / 2, Math.PI);
  const b = barn(barnF, { kind: 'stall', w: w + 0.6, d: barnD, found, board: 'larchDark', ovA: 0 });
  return { hw: Math.max(h.hw, b.hw), hd: (houseD + barnD) / 2 + 1.3, top: Math.max(h.top, b.top) };
}

/*
 * The Gasthof: a rendered ground floor, two log storeys, a Laube on
 * every floor along the front, a half hipped slate roof, and its sign on
 * a wrought bracket. The front is +x.
 */
export function gasthof(f, rng, spec) {
  const { found = 0.3, board = 'honey', shutter = 'shutterRed' } = spec;
  const w = 12;
  const d = 17;
  const baseH = 3.0;
  const floorH = 2.7;
  const hw = w / 2;
  const hd = d / 2;
  plinth(f, w, d, found, false);
  dripEdge(f, w, d);
  const y1 = SOCLE + baseH;
  const top = timberTop(f, {
    w, d, y0: y1, floors: 2, floorH, kind: 'halfhip', key: board, roofKey: 'slate',
    ov: 1.4, ovA: 1.2, ovB: 1.2, pitch: 0.5, snowGuard: true, chimneyAt: [-2.5, 3], f: 0.5, sag: 0.08,
  });
  f.put(board, box(w + 0.1, 0.26, d + 0.1), 0, y1 + 0.13, 0);
  logCorners(f, board, hw, hd, y1, top.plate);
  const east = frame(f, hw, 0, 0, Math.PI / 2);
  const west = frame(f, -hw, 0, 0, -Math.PI / 2);
  const cols = 5;
  const slot = (c) => -hd + (c + 0.5) * (d / cols);
  for (let k = 0; k < 2; k += 1) {
    const fy = y1 + k * floorH;
    frieze(west, d + 0.2, fy + 0.85);
    balcony(frame(east, 0, fy, 0, 0), d - 0.6, { out: 1.4, board });
    for (let c = 0; c < cols; c += 1) {
      casement(east, -slot(c), fy + 1.05, 0.9, 1.9, { sill: false, key: board });
      casement(west, slot(c), fy + 1.5, 0.95, 1.1, { shutter, key: board, seed: c + k, bloom: 'geranium' });
    }
  }
  /* The ground floor, masonry: a door in the middle under its roof,
   * big windows either side, every opening deep in the wall. The inn
   * is washed cream with grey surrounds and its frieze painted red. */
  const win = { shutter, surround: 'surroundGrey', bloom: 'geranium' };
  const eastOpen = [deepDoor(east, -slot(2), 1.3, 2.3, { frameKey: 'stone', roofKey: 'slate', board })];
  for (const c of [0, 1, 3, 4]) {
    eastOpen.push(deepWindow(east, -slot(c), SOCLE + 1.6, 1.5, 1.4, { ...win, seed: c }));
  }
  wallBench(east, -slot(1) - 1.2, 1.4);
  const westOpen = [0, 2, 4].map((c) => deepWindow(west, slot(c), SOCLE + 1.6, 1.2, 1.2, { ...win, seed: c }));
  const ends = [];
  for (const wall of [frame(f, 0, 0, hd, 0), frame(f, 0, 0, -hd, Math.PI)]) {
    for (let k = 0; k < 2; k += 1) {
      const fy = y1 + k * floorH;
      frieze(wall, w + 0.2, fy + 0.85);
      gableRow(wall, w, fy + 1.5, { shutter, key: board, bloom: 'geranium' });
    }
    ends.push({ wall, len: w - 2 * REVEAL, openings: [deepWindow(wall, 0, SOCLE + 1.6, 1.2, 1.2, win)], bandLen: w });
  }
  for (const [wall, len] of [[east, d], [west, d], ...ends.map((e) => [e.wall, w])]) {
    paintedBand(wall, len - 0.1, SOCLE + baseH - 0.3, ['frescoRed', 'surroundWhite']);
  }
  paintedQuoins(f, hw, hd, SOCLE + 0.7, baseH - 0.7, 'surroundGrey');
  masonry(f, w, d, SOCLE, baseH, 'renderCream', [
    { wall: east, len: d, openings: eastOpen, bandLen: d + 0.16 },
    { wall: west, len: d, openings: westOpen, bandLen: d + 0.16 },
    ...ends,
  ], 0.7);
  /* The sign: a board hung off a wrought bracket beside the door. */
  const sx = -slot(2) + 1.6;
  east.put('ink', box(0.06, 0.06, 1.3), sx, y1 - 0.5, 0.65);
  east.put(near('ink'), box(0.04, 0.5, 0.04), sx, y1 - 0.75, 0.2, 0, 0.9);
  east.put('ink', box(0.03, 0.4, 0.03), sx, y1 - 0.7, 1.25);
  east.put('trim', box(0.9, 0.55, 0.05), sx, y1 - 1.15, 1.25);
  east.put('signRed', box(0.8, 0.45, 0.06), sx, y1 - 1.15, 1.25);
  const ext = { hw: Math.max(top.roof.ex, hw + 1.5), hd: hd + 1.2, top: top.top };
  notes(f).houses.push({ at: f.at(0, 0, 0), m: f.m.clone(), w, d, door: 0, ext, garden: false });
  return ext;
}

/* A shop awning: a sloping canvas on two arms, in stripes. */
function awning(wall, x, y, len, out) {
  const n = Math.max(4, Math.round(len / 0.5));
  const slope = Math.atan2(0.55, out);
  const run = Math.hypot(0.55, out);
  for (let k = 0; k < n; k += 1) {
    const sx = x - len / 2 + (k + 0.5) * (len / n);
    wall.put(k % 2 ? 'paint' : 'signRed', box(len / n, 0.03, run), sx, y - 0.275, out / 2, 0, slope);
  }
  wall.put(near('signRed'), box(len, 0.22, 0.02), x, y - 0.66, out + 0.01);
  for (const s of [-1, 1]) {
    wall.put(near('ink'), box(0.04, 0.04, run), x + s * (len / 2 - 0.05), y - 0.31, out / 2, 0, slope);
  }
}

/*
 * The bakery: a rendered ground floor with its big shop window under a
 * striped awning and a long sign board, one log storey over it, a gabled
 * shingle roof, and the gilt pretzel on its bracket.
 */
export function shop(f, rng, spec) {
  const { found = 0.3, board = 'weathered', shutter = 'shutterGreen' } = spec;
  const w = 9;
  const d = 11;
  const baseH = 2.9;
  const hw = w / 2;
  const hd = d / 2;
  plinth(f, w, d, found, false);
  dripEdge(f, w, d);
  const y1 = SOCLE + baseH;
  const top = timberTop(f, {
    w: w + 0.4, d, y0: y1, floors: 1, floorH: 2.55, kind: 'gable', key: board, roofKey: 'shingle',
    ov: 1.2, ovA: 1.2, ovB: 1.2, pitch: 0.44, snowGuard: true, chimneyAt: [-2, 2.5], sag: 0.06,
  });
  f.put(board, box(w + 0.48, 0.26, d + 0.08), 0, y1 + 0.13, 0);
  logCorners(f, board, hw + 0.2, hd, y1, top.plate);
  /* The bakery is washed a pale ochre, its surrounds white. */
  const win = { shutter, surround: 'surroundWhite', bloom: 'geraniumPink' };
  const east = frame(f, hw, 0, 0, Math.PI / 2);
  const eastUp = frame(f, hw + 0.2, 0, 0, Math.PI / 2);
  const eastOpen = [
    deepDoor(east, -hd + 1.6, 1.1, 2.05, { frameKey: 'stone' }),
    deepWindow(east, 1.2, SOCLE + 1.3, 4.2, 1.5),
  ];
  east.put('trim', box(d - 1.0, 0.6, 0.12), 0, y1 - 0.45, 0.06);
  east.put('signRed', box(d - 1.2, 0.5, 0.04), 0, y1 - 0.45, 0.13);
  awning(east, 1.2, y1 - 0.8, 4.8, 1.2);
  /* The hanging pretzel: a gold ring on a bracket at the corner. */
  const pretzel = cached('s2pretzel', () => new THREE.TorusGeometry(0.35, 0.07, 6, 12));
  east.put('ink', box(0.05, 0.05, 0.9), hd - 0.6, y1 + 0.4, 0.45);
  east.put('cross', pretzel, hd - 0.6, y1 - 0.1, 0.85);
  frieze(eastUp, d + 0.2, y1 + 0.8);
  for (const x of [-3, 0, 3]) {
    casement(eastUp, x, y1 + 1.45, 0.95, 1.05, { shutter, key: board, seed: x, bloom: 'geraniumPink' });
  }
  const westUp = frame(f, -hw - 0.2, 0, 0, -Math.PI / 2);
  frieze(westUp, d + 0.2, y1 + 0.8);
  for (const x of [-3, 0, 3]) {
    casement(westUp, x, y1 + 1.45, 0.95, 1.05, { shutter, key: board, seed: x, bloom: 'geraniumPink' });
  }
  const westBase = frame(f, -hw, 0, 0, -Math.PI / 2);
  const walls = [
    { wall: east, len: d, openings: eastOpen, bandLen: d + 0.16 },
    { wall: westBase, len: d, openings: [deepWindow(westBase, 0, SOCLE + 1.5, 1.0, 1.1, win)], bandLen: d + 0.16 },
  ];
  for (const wall of [frame(f, 0, 0, hd, 0), frame(f, 0, 0, -hd, Math.PI)]) {
    frieze(wall, w + 0.6, y1 + 0.8);
    casement(wall, -2, y1 + 1.45, 0.95, 1.05, { shutter, key: board });
    casement(wall, 2, y1 + 1.45, 0.95, 1.05, { shutter, key: board, seed: 1 });
    casement(frame(wall, 0, 0, 0.04, 0), 0, top.plate + 0.75, 0.7, 0.7, { shutter, key: board, bars: false });
    walls.push({ wall, len: w - 2 * REVEAL, openings: [deepWindow(wall, 0, SOCLE + 1.5, 1.0, 1.1, win)], bandLen: w });
  }
  masonry(f, w, d, SOCLE, baseH, 'renderOchre', walls, 0.7);
  const ext = { hw: top.roof.ex, hd: hd + 1.2, top: top.top };
  notes(f).houses.push({ at: f.at(0, 0, 0), m: f.m.clone(), w, d, door: 0, ext, garden: false });
  return ext;
}

/*
 * The church: a white rendered nave under a steep slate roof with a
 * moulded cornice, a square tower at the +z end with stone quoins, a
 * louvred bell opening on each face, a clock on the two faces that
 * matter, an octagonal slate spire with a ball and cross, and the
 * graveyard wall round the plot with its gate toward +z.
 */
export function church(f, spec) {
  const { found = 0.3 } = spec;
  const w = 10;
  const d = 20;
  const wallH = 7;
  const hw = w / 2;
  const hd = d / 2;
  const tw = 5.5;
  const towerH = 18;
  plinth(f, w, d, found);
  const top = timberTop(f, {
    w, d, y0: SOCLE, floors: 1, floorH: wallH, kind: 'gable', key: 'render', roofKey: 'slate',
    ov: 0.5, ovA: 0.4, ovB: 0, pitch: 0.95, snowGuard: false, chimneyAt: null, purlins: false, gableBoards: false,
    rafters: false, edgeKey: 'trim',
  });
  /* The cornice under the eaves, stepped out in two. */
  for (const s of [-1, 1]) {
    f.put('trim', box(0.18, 0.2, d + 0.3), s * (hw + 0.09), SOCLE + wallH - 0.12, 0);
    f.put('trim', box(0.1, 0.14, d + 0.2), s * (hw + 0.05), SOCLE + wallH - 0.33, 0);
  }
  /* Tall arched nave windows: a proud surround and glass, the arch read
   * by a half disc over each. */
  const arch = cached('s2arch', () => {
    const half = new THREE.Shape();
    half.absarc(0, 0, 0.62, 0, Math.PI, false);
    half.closePath();
    return new THREE.ExtrudeGeometry(half, { depth: 0.1, bevelEnabled: false, curveSegments: 8 });
  });
  for (const wall of [frame(f, hw, 0, 0, Math.PI / 2), frame(f, -hw, 0, 0, -Math.PI / 2)]) {
    for (let k = 0; k < 4; k += 1) {
      const x = -hd + 1.5 + (k + 0.5) * ((d - 3) / 4);
      casement(wall, x, SOCLE + 3.6, 1.1, 3.2, { bars: true });
      wall.put('trim', arch, x, SOCLE + 5.2, 0);
    }
  }
  doorway(frame(f, 0, 0, -hd, Math.PI), 0, 1.8, 3.0, { frameKey: 'stone' });
  /* The tower, built into the +z end: its -z face inside the nave's
   * gable wall so the two solids share nothing visible. */
  const tz = hd + tw / 2 - 0.3;
  f.put('stone', box(tw + 0.2, found + SOCLE, tw + 0.2), 0, (SOCLE - found) / 2, tz);
  f.put('stone', boxUp(tw + 0.12, 0.6, tw + 0.12), 0, SOCLE, tz);
  f.put('render', boxUp(tw, towerH, tw), 0, SOCLE, tz);
  f.put('slate', box(tw + 0.5, 0.3, tw + 0.5), 0, SOCLE + towerH + 0.15, tz);
  f.put('trim', box(tw + 0.26, 0.22, tw + 0.26), 0, SOCLE + towerH - 0.11, tz);
  /* Quoins up the tower's corners, long and short in turn. */
  for (let k = 0; k * 0.7 < towerH - 1.2; k += 1) {
    const y = SOCLE + 0.9 + k * 0.7;
    const long = k % 2 === 0;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        f.put(detail('surround'), box(long ? 0.7 : 0.4, 0.3, 0.04), sx * (tw / 2 - (long ? 0.35 : 0.2)), y, tz + sz * (tw / 2 + 0.02));
        f.put(detail('surround'), box(0.04, 0.3, long ? 0.4 : 0.7), sx * (tw / 2 + 0.02), y, tz + sz * (tw / 2 - (long ? 0.2 : 0.35)));
      }
    }
  }
  /* Eight sided, a flat to each face of the tower, its flats just
   * inside the cap so nothing overhangs unsupported. */
  const spire = cached('s2spire', () => new THREE.ConeGeometry(tw * 0.58, 13, 8).translate(0, 6.5, 0));
  f.put('slate', spire, 0, SOCLE + towerH + 0.3, tz, Math.PI / 8);
  const ball = cached('s2ball', () => new THREE.SphereGeometry(0.32, 8, 6));
  f.put('cross', ball, 0, SOCLE + towerH + 13.3, tz);
  f.put('cross', boxUp(0.12, 2.0, 0.12), 0, SOCLE + towerH + 13.5, tz);
  f.put('cross', box(1.0, 0.12, 0.12), 0, SOCLE + towerH + 14.9, tz);
  /* The tower door under its little roof on two brackets. */
  const porch = frame(f, 0, 0, tz + tw / 2, 0);
  doorway(porch, 0, 1.6, 2.8, { frameKey: 'stone' });
  const py = SOCLE + 3.35;
  for (const s of [-1, 1]) {
    porch.put('slate', box(1.45, 0.06, 1.35), s * 0.66, py + 0.3, 0.62, 0, 0, -s * 0.42);
    porch.put(near('larchDark'), box(0.1, 0.1, 1.0), s * 1.15, py - 0.3, 0.5, 0, -0.75);
  }
  porch.put('larchDark', box(2.6, 0.14, 0.14), 0, py - 0.02, 1.2);
  porch.put('larchDark', box(0.12, 0.16, 1.3), 0, py + 0.58, 0.62);
  for (let k = 0; k < 4; k += 1) {
    const a = k * Math.PI / 2;
    const face = frame(f, Math.sin(a) * tw / 2, 0, tz + Math.cos(a) * tw / 2, a);
    /* The bell opening: a dark recess in a deep frame, louvred, under an
     * arch. */
    const by = SOCLE + towerH - 2.6;
    face.put('ink', box(1.14, 2.04, 0.04), 0, by, 0.01);
    face.put('trim', box(1.34, 0.12, 0.2), 0, by - 1.08, 0.1);
    face.put(near('surround'), ring(1.3, 2.2, 0.1, 0.14), 0, by, 0);
    for (let l = 0; l < 5; l += 1) {
      face.put(near('boardLine'), box(1.14, 0.05, 0.14), 0, by - 0.85 + l * 0.38, 0.07, 0, 0.5);
    }
    face.put('trim', arch, 0, by + 1.15, 0);
    if (k === 0 || k === 1) {
      /* The clock: a white face in a dark ring, two hands at ten past
       * ten, the twelve marks as small ticks. */
      const cy = SOCLE + towerH - 6.2;
      const disc = cached('s2clock', () => new THREE.CylinderGeometry(1.15, 1.15, 0.08, 24).rotateX(Math.PI / 2));
      const rim = cached('s2clockrim', () => new THREE.CylinderGeometry(1.3, 1.3, 0.05, 24).rotateX(Math.PI / 2));
      face.put('ink', rim, 0, cy, 0.025);
      face.put('trim', disc, 0, cy, 0.09);
      for (let t = 0; t < 12; t += 1) {
        const ta = t * Math.PI / 6;
        face.put(detail('ink'), box(0.08, 0.2, 0.03), Math.sin(ta) * 0.98, cy + Math.cos(ta) * 0.98, 0.145, 0, 0, -ta);
      }
      face.put('ink', box(0.1, 0.72, 0.04), 0.25, cy + 0.2, 0.15, 0, 0, 0.55);
      face.put('ink', box(0.08, 0.95, 0.04), -0.3, cy + 0.32, 0.16, 0, 0, -0.55);
      face.put(detail('cross'), box(0.16, 0.16, 0.05), 0, cy, 0.17);
    }
    casement(face, 0, SOCLE + 8, 0.6, 1.6, { bars: false, sill: false });
    casement(face, 0, SOCLE + 4, 0.6, 1.6, { bars: false, sill: false });
  }
  /* The graveyard: a low stone wall round the plot with a gate toward
   * +z beside the tower, a few stones and crosses in the grass. */
  const gx = hw + 6;
  const gzA = -hd - 5;
  const gzB = tz + tw / 2 + 4;
  const wallY = 0.9;
  const seg = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ry = Math.atan2(x1 - x0, z1 - z0);
    f.put('stone', boxUp(0.45, wallY, len), (x0 + x1) / 2, 0, (z0 + z1) / 2, ry);
    f.put('stone', boxUp(0.6, 0.12, len + 0.1), (x0 + x1) / 2, wallY, (z0 + z1) / 2, ry);
  };
  seg(-gx, gzA, gx, gzA);
  seg(gx, gzA, gx, gzB);
  seg(-gx, gzA, -gx, gzB);
  seg(-gx, gzB, -1.6, gzB);
  seg(1.6, gzB, gx, gzB);
  for (const x of [-1.6, 1.6]) {
    f.put('stone', boxUp(0.6, 1.5, 0.6), x, 0, gzB);
    f.put('stone', box(0.75, 0.12, 0.75), x, 1.56, gzB);
    f.put(near('ink'), box(1.2, 0.05, 0.05), x * 0.5, 1.2, gzB);
  }
  for (let k = 0; k < 10; k += 1) {
    const side = k < 5 ? 1 : -1;
    const x = side * (hw + 2.4 + (k % 2) * 1.8);
    const z = -hd + 1 + (k % 5) * ((d - 2) / 5);
    const lean = ((k * 5) % 7 - 3) * 0.02;
    if (k % 3 === 0) {
      f.put('ink', boxUp(0.08, 1.1, 0.08), x, 0, z, 0, 0, lean);
      f.put('ink', box(0.5, 0.08, 0.08), x, 0.85, z, 0, 0, lean);
    } else {
      f.put('stone', boxUp(0.6, 0.75, 0.14), x, 0, z, 0, lean);
      f.put(detail('leaf'), box(0.8, 0.12, 0.5), x, 0.06, z + 0.4);
    }
  }
  const mid = (gzA + gzB) / 2;
  notes(f).houses.push({
    at: f.at(0, 0, mid), m: f.m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, mid)), w, d, door: 0,
    ext: { hw: gx + 0.3, hd: (gzB - gzA) / 2 + 0.3 }, garden: false,
  });
  return {
    hw, hd, top: SOCLE + top.roof.yR + wallH + 0.5,
    tower: { z: tz, half: tw / 2, top: SOCLE + towerH + 15.2 },
    yard: { hw: gx + 0.3, zA: gzA - 0.3, zB: gzB + 0.3 },
  };
}
