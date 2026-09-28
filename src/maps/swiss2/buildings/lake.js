/*
 * lake.js: the lake town's own buildings, in the village's kit.
 *
 * Round 8 put a hamlet on the lake's south shore, boathouses along the
 * water and a landing stage, drawn in the props' vertex coloured boxes:
 * no photographed surface on any of it, a window a flat dark panel, a
 * roof two planes. From the lake's own shore it read as a model. These
 * are the same buildings made the way the village's are (parts.js,
 * houses.js), baked the way the village is (bake.js), so a house by the
 * lake has the reveals, the shutters, the roof's rafters and the
 * geraniums a house in the square has, and they cost nothing past a few
 * hundred metres because their detail is near only.
 *
 * What a lake town has that a farming village does not:
 *
 *   townhouse    rendered storeys, two or three, with iron balconies off
 *                the gable to the water and the timber only in the gable
 *                (or one log storey under it), the Bürgerhaus of Spiez or
 *                Brienz's front;
 *   hotel        the Belle Epoque hotel at the landing stage: four limed
 *                storeys, a French window and a balcony at every room on
 *                the lake front, a half hipped slate roof with dormers, a
 *                painted name, awnings over the restaurant and its
 *                terrace with the tables laid under parasols;
 *   boathouse    a timber shed on piles over the water, its lake end
 *                open under a lintel, a slipway of two rails on sleepers
 *                running out of it down under the water, a door on the
 *                land side;
 *   stageHut     the ticket and waiting hut on the landing stage;
 *   landingStage the stage itself, a deck on piles with its rail, the
 *                bollards and the lamp at its end.
 *
 * The chalets among them are houses.js's own, and the church is its
 * church on the lake church's plan.
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
import { roofShell, gableProfile } from '../../alps/kit.js';
import {
  frame, box, boxUp, cached, prism, plate, SOCLE, near, detail,
  casement, plinth, dripEdge, timberTop, dressRoof, REVEAL, masonry, deepWindow, deepDoor,
  wallBench, climber, paintedBand, paintedQuoins, ironBalcony, dormerOn, frieze, logCorners,
} from './parts.js';
import {
  facadeOf, roofOf, coverOf, gableRow, awning, plankDoor,
} from './houses.js';
import { cafeSet, lampPost } from '../village/pieces.js';

/* A rendered storey of a town house. */
const STOREY = 2.8;

/* Painted letters on a board or a wall along the frame's x, as the
 * street reads them from across it: strokes of a cap height with the
 * gaps between words. */
function letters(wall, x, y, z, len, h, key) {
  let u = -len / 2;
  let k = 0;
  while (u < len / 2 - h * 0.4) {
    const w = h * (0.14 + 0.12 * (((k * 7) % 5) / 4));
    if (k % 7 === 6) {
      u += h * 0.55;
    } else {
      wall.put(detail(key), plate(w, h), x + u + w / 2, y, z);
      if (k % 3 === 1) {
        wall.put(detail(key), plate(h * 0.34, h * 0.12), x + u + w / 2 + h * 0.12, y + h * 0.44, z);
      }
      u += w + h * 0.2;
    }
    k += 1;
  }
}

/*
 * A town house by the lake: `storeys` rendered storeys under a gable of
 * boards (and `timber` log storeys between them, 0 or 1), its front, the
 * gable with the door and the balconies, toward +z. w across, d deep.
 */
export function townhouse(f, rng, spec) {
  const {
    w, d, storeys = 2, timber = 0, roof = 'gable', board = 'larch', shutter = 'shutterGreen',
    roofKey: planned = 'slate', found = 0.3, pitch = 0.46, balconies = 1,
  } = spec;
  const roofKey = coverOf(f, planned);
  const face = facadeOf(f, 'render', board);
  const wall = face.wall === board ? 'render' : face.wall;
  const surround = face.surround === board ? 'surroundWhite' : face.surround;
  const { bloom } = face;
  const hw = w / 2;
  const hd = d / 2;
  plinth(f, w, d, found, false);
  dripEdge(f, w, d);
  const y1 = SOCLE + storeys * STOREY;
  const top = timberTop(f, {
    w, d, y0: y1, floors: timber, floorH: 2.55, kind: roof, key: board, roofKey,
    ov: 1.0, ovA: 1.1, ovB: 1.3, pitch, snowGuard: true, chimneyAt: [-w / 4, -d / 5],
    sag: 0, ...roofOf(f),
  });
  const east = frame(f, hw, 0, 0, Math.PI / 2);
  const west = frame(f, -hw, 0, 0, -Math.PI / 2);
  const south = frame(f, 0, 0, hd, 0);
  const north = frame(f, 0, 0, -hd, Math.PI);
  if (timber > 0) {
    f.put(board, box(w + 0.08, 0.26, d + 0.08), 0, y1 + 0.13, 0);
    logCorners(f, board, hw, hd, y1, top.plate);
    for (const [wl, len] of [[east, d], [west, d], [south, w], [north, w]]) {
      frieze(wl, len + 0.2, y1 + 0.8);
    }
    for (const wl of [east, west]) {
      const n = Math.max(2, Math.round(d / 3.1));
      for (let c = 0; c < n; c += 1) {
        casement(wl, -hd + (c + 0.5) * (d / n), y1 + 1.45, 0.95, 1.05, { shutter, key: board, seed: c, bloom });
      }
    }
    for (const wl of [south, north]) {
      gableRow(wl, w, y1 + 1.45, { shutter, key: board, bloom });
    }
  } else {
    /* The eaves' cornice where the render meets the gable's boards. */
    f.put(surround, box(w + 0.16, 0.2, d + 0.16), 0, y1 - 0.1, 0);
  }
  /* The gable's own windows, under the ridge. */
  for (const wl of [south, north]) {
    const g = frame(wl, 0, 0, 0.04, 0);
    const room = 2 * (hw - 1.55 / top.roof.tanP);
    if (roof === 'hip') {
      continue;
    }
    if (room >= 3.2) {
      gableRow(g, Math.min(room, 4.4), top.plate + 0.95, { shutter, key: board, bloom });
    } else {
      casement(g, 0, top.plate + 0.7, 0.7, 0.75, { shutter, key: board, bars: false });
    }
  }
  const across = w >= 10 ? 3 : 2;
  const col = (n, len, c) => (n === 3 ? (c - 1) * (len / 3.2) : (c - 0.5) * (len / 2.2));
  const along = Math.max(2, Math.round(d / 3.2));
  const slot = (c) => -hd + (c + 0.5) * (d / along);
  for (let s = 0; s < storeys; s += 1) {
    const y0 = SOCLE + s * STOREY;
    const h = STOREY;
    const win = { shutter, surround, bloom };
    const southOpen = [];
    const northOpen = [];
    const eastOpen = [];
    const westOpen = [];
    for (let c = 0; c < across; c += 1) {
      const x = col(across, w, c);
      const middle = across === 3 ? c === 1 : c === 0;
      if (s === 0 && middle) {
        southOpen.push(deepDoor(south, x, 1.05, 2.1, { frameKey: 'stone', roofKey, board, y0 }));
        wallBench(south, x + 1.6 * (x > 0 ? -1 : 1), 1.3);
      } else if (s > 0 && middle && s >= storeys - balconies) {
        /* A French window onto its balcony. */
        southOpen.push(deepWindow(south, x, y0 + 1.12, 1.0, 2.1, { shutter, seed: s + c, surround }));
        ironBalcony(frame(south, x, y0, 0, 0), Math.min(2.8, w * 0.36), { out: 0.85, bloom });
      } else {
        southOpen.push(deepWindow(south, x, y0 + 1.45, 0.9, 1.15, { ...win, seed: s * 3 + c }));
      }
    }
    for (let c = 0; c < across - (across === 3 ? 1 : 0); c += 1) {
      northOpen.push(deepWindow(north, col(across === 3 ? 2 : across, w, c), y0 + 1.45, 0.9, 1.1, { ...win, seed: c }));
    }
    for (let c = 0; c < along; c += 1) {
      eastOpen.push(deepWindow(east, -slot(c), y0 + 1.45, 0.9, 1.15, { ...win, seed: s + c }));
      westOpen.push(deepWindow(west, slot(c), y0 + 1.45, 0.9, 1.15, { ...win, seed: s + c + 1 }));
    }
    if (s > 0) {
      /* The string course at each floor. */
      f.put(surround, boxUp(w + 0.1, 0.16, d + 0.1), 0, y0 - 0.1, 0);
    }
    masonry(f, w, d, y0, h, wall, [
      { wall: east, len: d, openings: eastOpen, bandLen: d + 0.16 },
      { wall: west, len: d, openings: westOpen, bandLen: d + 0.16 },
      { wall: south, len: w - 2 * REVEAL, openings: southOpen, bandLen: w },
      { wall: north, len: w - 2 * REVEAL, openings: northOpen, bandLen: w },
    ], s === 0 ? 0.6 : 0);
  }
  if (face.band) {
    for (const [wl, len] of [[east, d], [west, d], [south, w], [north, w]]) {
      paintedBand(wl, len - 0.1, y1 - 0.5, face.band);
    }
  }
  paintedQuoins(f, hw, hd, SOCLE + 0.6, storeys * STOREY - 0.8, face.quoins ?? surround);
  if (face.ivy) {
    climber(north, hw / 3, 0, Math.min(3.4, w * 0.4), STOREY * 1.6);
  }
  if (face.rose) {
    climber(south, -1.4, 0.1, 0.7, 2.3, { rose: face.rose });
  }
  return { hw: top.roof.ex, hd: hd + 1.3, top: top.top };
}

/*
 * The hotel at the landing stage. Its front, toward the lake, is -x: the
 * roof's ridge runs along it, and the dormers go on the slope over it.
 * w deep, d along the front.
 */
export function hotel(f, { w = 13, d = 17, storeys = 4, found = 0.3 } = {}) {
  const hw = w / 2;
  const hd = d / 2;
  const groundH = 3.4;
  const upH = 3.0;
  const wall = 'renderCream';
  const surround = 'surroundWhite';
  const shutter = 'shutterGreen';
  const bloom = 'geranium';
  plinth(f, w, d, found, false);
  const yTop = SOCLE + groundH + (storeys - 1) * upH;
  const top = timberTop(f, {
    w, d, y0: yTop, floors: 0, floorH: 0, kind: 'halfhip', key: wall, roofKey: 'slate',
    ov: 0.9, ovA: 0.9, ovB: 0.9, pitch: 0.62, snowGuard: true, chimneyAt: [hw / 2, d / 4],
    gableBoards: false, purlins: false, rafters: true, edgeKey: 'trim', f: 0.45,
  });
  const rf = frame(f, 0, top.plate, 0, 0);
  for (const side of [-1, 0, 1]) {
    dormerOn(rf, top.roof, 'larch', 'slate', side);
  }
  const front = frame(f, -hw, 0, 0, -Math.PI / 2);
  const back = frame(f, hw, 0, 0, Math.PI / 2);
  const ends = [frame(f, 0, 0, hd, 0), frame(f, 0, 0, -hd, Math.PI)];
  const cols = 5;
  const slot = (c) => -hd + (c + 0.5) * (d / cols);
  for (let s = 0; s < storeys; s += 1) {
    const y0 = s === 0 ? SOCLE : SOCLE + groundH + (s - 1) * upH;
    const h = s === 0 ? groundH : upH;
    const frontOpen = [];
    const backOpen = [];
    for (let c = 0; c < cols; c += 1) {
      const x = slot(c);
      if (s === 0) {
        if (c === 2) {
          frontOpen.push(deepDoor(front, x, 1.7, 2.6, { frameKey: 'stone', roofKey: 'slate', board: 'larch' }));
        } else {
          frontOpen.push(deepWindow(front, x, y0 + 1.55, 1.5, 2.1, { surround, seed: c }));
          awning(front, x, y0 + 3.05, 1.9, 1.15);
        }
        backOpen.push(c === 4 ? deepDoor(back, x, 1.0, 2.1, { frameKey: 'stone' }) : deepWindow(back, x, y0 + 1.6, 1.0, 1.3, { shutter, surround, seed: c }));
      } else {
        frontOpen.push(deepWindow(front, x, y0 + 1.15, 1.05, 2.15, { shutter, surround, seed: s + c }));
        ironBalcony(frame(front, x, y0, 0, 0), 1.7, { out: 0.8, bloom: (s + c) % 2 ? bloom : 'geraniumPink' });
        backOpen.push(deepWindow(back, x, y0 + 1.5, 0.95, 1.3, { shutter, surround, seed: s + c }));
      }
    }
    const endOpen = ends.map((e, k) => [-1, 0, 1].map((c) => deepWindow(e, c * (w / 3.3), y0 + (s === 0 ? 1.6 : 1.5), 1.0, 1.3, { shutter, surround, bloom: k ? null : bloom, seed: s + c })));
    if (s > 0) {
      f.put(surround, boxUp(w + 0.14, 0.2, d + 0.14), 0, y0 - 0.12, 0);
    }
    masonry(f, w, d, y0, h, wall, [
      { wall: front, len: d, openings: frontOpen, bandLen: d + 0.16 },
      { wall: back, len: d, openings: backOpen, bandLen: d + 0.16 },
      ...ends.map((e, k) => ({ wall: e, len: w - 2 * REVEAL, openings: endOpen[k], bandLen: w })),
    ], s === 0 ? 0.8 : 0);
  }
  /* The cornice under the eaves, stepped out in two, and the name painted
   * across the front between the restaurant and the rooms. */
  for (const s of [-1, 1]) {
    f.put('trim', box(0.22, 0.24, d + 0.34), s * (hw + 0.11), yTop - 0.12, 0);
    f.put('trim', box(0.12, 0.14, d + 0.24), s * (hw + 0.06), yTop - 0.36, 0);
    f.put('trim', box(w + 0.34, 0.24, 0.22), 0, yTop - 0.12, s * (hd + 0.11));
  }
  front.put(near('surroundWhite'), plate(d * 0.62, 0.62), 0, SOCLE + groundH - 0.02, 0.012);
  letters(front, 0, SOCLE + groundH - 0.02, 0.016, d * 0.56, 0.42, 'frescoGreen');
  paintedQuoins(f, hw, hd, SOCLE + 0.8, yTop - SOCLE - 1.0, 'surroundGrey');
  /* The terrace in front, paved, behind a balustrade on the shore, the
   * tables laid under parasols. */
  const tx = -hw - 3.4;
  f.put('stone', box(6.4, 0.24, d + 1.6), tx, 0, 0);
  f.put('render', boxUp(0.3, 0.9, d + 1.6), tx - 3.05, 0.12, 0);
  f.put(near('stone'), box(0.44, 0.08, d + 1.7), tx - 3.05, 1.06, 0);
  for (const s of [-1, 1]) {
    f.put('render', boxUp(6.1, 0.9, 0.3), tx + 0.15, 0.12, s * (hd + 0.65));
    f.put(near('stone'), box(6.2, 0.08, 0.44), tx + 0.15, 1.06, s * (hd + 0.65));
  }
  for (const [x, z, k] of [[tx - 1.4, -5.4, 0], [tx + 1.2, -2.2, 1], [tx - 1.4, 1.6, 2], [tx + 1.2, 5.2, 3], [tx - 1.2, 6.6, 4]]) {
    cafeSet(frame(f, x, 0.12, z, k * 1.3), { chairs: 3, parasol: k % 2 ? 'canvasRed' : 'canvas' });
  }
  for (const z of [-hd - 0.2, hd + 0.2]) {
    lampPost(frame(f, tx - 2.8, 0.12, z, 0));
  }
  return { hw: hw + 6.8, hd: hd + 1.0, top: top.top };
}

/* The lake bed or the ground under a point of the frame f, in its y. */
function bedOf(f, heightAt) {
  return (x, z) => {
    const p = f.at(x, 0, z);
    return heightAt(p.x, p.z) - p.y;
  };
}

/*
 * A boathouse: len along z, its lake end (+z) open under a lintel, the
 * floor at the frame's y 0 on piles down to the lake bed. The walls are boards
 * with battens up and down, the roof shingle or tin on rafters that show
 * under the eaves, and out of the open end a slipway of two rails on
 * sleepers runs down under the water to `slip` metres below the floor.
 */
export function boathouse(f, {
  len, w, h, heightAt, slip = 1.6, roofKey = 'shingleDark', board = 'weathered',
}) {
  const bed = bedOf(f, heightAt);
  const hw = w / 2;
  const hd = len / 2;
  /* The piles along both sides and across the back, and the stone
   * footing where the back stands on the shore. */
  for (let k = 0; k <= 4; k += 1) {
    const z = -hd + 0.15 + (k / 4) * (len - 0.3);
    for (const x of [-hw + 0.12, hw - 0.12]) {
      const b = Math.min(bed(x, z), -0.2) - 0.5;
      f.put('larchDark', boxUp(0.22, -b, 0.22), x, b, z);
    }
  }
  const backBed = Math.min(bed(0, -hd), -0.1) - 0.4;
  f.put('stone', boxUp(w + 0.3, -backBed + 0.05, 0.9), 0, backBed, -hd + 0.3);
  /* The sill beams the walls stand on, and the walkway either side of
   * the slip inside. */
  for (const s of [-1, 1]) {
    f.put('larchDark', box(0.26, 0.26, len + 0.1), s * (hw - 0.12), -0.13, 0);
    f.put('larch', box(0.9, 0.07, len - 0.6), s * (hw - 0.6), -0.03, 0.1);
  }
  /* The walls: the side walls and the back in boards up and down, a
   * batten over each joint; the lake gable over the lintel. */
  const roof = roofShell({ kind: 'gable', hw, hd, ov: 0.45, ovA: 0.35, ovB: 0.95, pitch: 0.62, t: 0.16 });
  Object.assign(roof, { hw, hd, kind: 'gable', zA0: 0.35, zB0: 0.95 });
  const gable = gableProfile(roof, 'gable', hw);
  for (const s of [-1, 1]) {
    const side = frame(f, s * hw, 0, 0, s * Math.PI / 2);
    side.put(`${board}:v`, boxUp(len, h, 0.08), 0, 0, -0.04);
    for (let u = -hd + 0.3; u < hd - 0.1; u += 0.42) {
      side.put(near('boardLine'), boxUp(0.05, h - 0.1, 0.03), u, 0.05, 0.015);
    }
  }
  f.put(`${board}:v`, prism([[hw, 0], ...gable.map(([x, y]) => [x, y + h]), [-hw, 0]], -hd, -hd + 0.08));
  f.put(`${board}:v`, prism([[hw, h - 0.3], ...gable.map(([x, y]) => [x, y + h]), [-hw, h - 0.3]], hd - 0.08, hd));
  /* The dark of the shed seen through its open end. */
  f.put('shade', plate(w - 0.3, h), 0, h / 2, -hd + 0.1);
  const back = frame(f, 0, 0, -hd, Math.PI);
  plankDoor(back, -hw * 0.35, 0, 0.9, 1.95, 'larchDark');
  back.put('stone', box(1.3, 0.16, 0.6), -hw * 0.35, -0.08, 0.3);
  casement(back, hw * 0.45, 1.4, 0.7, 0.6, { key: 'larchDark', bars: false });
  /* The open end: the corner posts, the lintel, and the doors folded back
   * to the walls on their strap hinges. */
  const end = frame(f, 0, 0, hd, 0);
  for (const s of [-1, 1]) {
    end.put('larchDark', boxUp(0.2, h, 0.2), s * (hw - 0.1), 0, -0.1);
    const leaf = frame(f, s * (hw + 0.07), 0, hd - 0.05, s * Math.PI / 2);
    plankDoor(leaf, s * (hw / 2 - 0.1), 0.25, hw - 0.3, h - 0.65, board);
  }
  end.put('larchDark', box(w + 0.1, 0.3, 0.22), 0, h - 0.15, -0.08);
  /* The slipway: two rails on sleepers from the back of the shed down
   * through the open end into the water, and the winch post at its
   * head. */
  const runOut = 4.5;
  const z0 = -hd + 1.0;
  const z1 = hd + runOut;
  const y0 = -0.12;
  const y1 = -slip;
  const railLen = Math.hypot(z1 - z0, y0 - y1);
  const ang = Math.atan2(y0 - y1, z1 - z0);
  for (const x of [-0.55, 0.55]) {
    f.put('larchDark', box(0.14, 0.14, railLen), x, (y0 + y1) / 2, (z0 + z1) / 2, 0, ang);
  }
  for (let z = z0 + 0.3; z < z1; z += 0.9) {
    const t = (z - z0) / (z1 - z0);
    f.put(near('larchDark'), box(1.6, 0.1, 0.18), 0, y0 + (y1 - y0) * t - 0.12, z);
  }
  for (let k = 1; k <= 2; k += 1) {
    const z = hd + (k / 3) * runOut;
    const b = Math.min(bed(0, z), -0.3) - 0.4;
    const t = (z - z0) / (z1 - z0);
    const top = y0 + (y1 - y0) * t - 0.2;
    if (top > b) {
      f.put(near('larchDark'), boxUp(0.2, top - b, 0.2), 0, b, z);
    }
  }
  f.put('larchDark', boxUp(0.24, 1.0, 0.24), 0, 0, z0 - 0.5);
  f.put(near('metal'), cached('s2winch', () => new THREE.CylinderGeometry(0.14, 0.14, 0.5, 8).rotateZ(Math.PI / 2)), 0, 0.8, z0 - 0.3);
  /* The roof, dressed as the village's are. */
  const rf = frame(f, 0, h, 0, 0);
  rf.put(roofKey, roof.geo);
  dressRoof(rf, roof, { roofKey, key: 'larchDark', edgeKey: board });
  return { hw: roof.ex, hd: hd + 0.95, top: h + roof.yR + 0.2 };
}

/*
 * The landing stage's hut: the ticket window and the waiting room in one,
 * boarded, under a shingle gable, its name board over the door. The door
 * and the window are on +z, where the stage's walk is; w across the
 * ridge, d along it.
 */
export function stageHut(f, { w = 4.0, d = 3.4, h = 2.5 } = {}) {
  const hw = w / 2;
  const hd = d / 2;
  f.put('larchDark', box(w + 0.1, 0.18, d + 0.1), 0, 0.09, 0);
  f.put('larch:v', boxUp(w, h, d), 0, 0.18, 0);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      f.put(near('larchDark'), boxUp(0.14, h, 0.14), sx * (hw + 0.02), 0.18, sz * (hd + 0.02));
    }
  }
  /* Shingle at 29 degrees: a five inch set down on slate at the 31 the
   * hut was first given slid off it into the lake (scripts/roof-check.js
   * kiosk quad), where one set down on the village's shingle stays. */
  const roof = roofShell({ kind: 'gable', hw, hd, ov: 0.5, ovA: 0.5, ovB: 0.8, pitch: 0.5, t: 0.14 });
  Object.assign(roof, { hw, hd, kind: 'gable', zA0: 0.5, zB0: 0.8 });
  const gable = gableProfile(roof, 'gable', hw);
  f.put('larch:v', prism(gable.map(([x, y]) => [x, y + h + 0.18]), -hd, hd));
  const rf = frame(f, 0, h + 0.18, 0, 0);
  rf.put('shingleDark', roof.geo);
  dressRoof(rf, roof, { roofKey: 'shingleDark', key: 'larchDark' });
  const front = frame(f, 0, 0, hd, 0);
  plankDoor(front, -hw + 0.8, 0.18, 0.85, 1.95, 'larchDark');
  casement(front, hw - 1.1, 1.45, 1.2, 0.9, { key: 'larchDark', bars: true });
  front.put('larchDark', box(1.5, 0.05, 0.35), hw - 1.1, 0.95, 0.18);
  front.put('signBlue', box(w * 0.7, 0.34, 0.04), 0, h + 0.5, 0.06);
  letters(front, 0, h + 0.5, 0.085, w * 0.55, 0.2, 'paint');
  for (const s of [-1, 1]) {
    casement(frame(f, s * hw, 0, 0, s * Math.PI / 2), 0, 1.45, 0.8, 0.8, { key: 'larchDark', bars: true, shutter: 'shutterGreen', seed: s });
  }
  wallBench(frame(f, 0, 0.18, -hd, Math.PI), 0, 1.8);
  return { hw: roof.ex, hd: hd + 0.8, top: h + 0.18 + roof.yR + 0.2 };
}

/*
 * The landing stage: a deck `len` along +x from the shore, `w` across, at
 * the frame's y 0, on piles down to the lake bed; a rail each side with a
 * gap where the boats come alongside, bollards along the edges, and a
 * lamp at the end.
 */
export function landingStage(f, { len, w, heightAt }) {
  const bed = bedOf(f, heightAt);
  const hw = w / 2;
  for (let x = 0; x <= len + 0.01; x += 3) {
    for (const z of [-hw + 0.15, hw - 0.15]) {
      const b = Math.min(bed(x, z), -0.4) - 0.6;
      f.put('larchDark', boxUp(0.26, -b - 0.05, 0.26), x, b, z);
    }
    f.put(near('larchDark'), box(0.2, 0.2, w), x, -0.3, 0);
  }
  f.put('larch', box(len + 0.4, 0.12, w), len / 2, -0.06, 0);
  for (const s of [-1, 1]) {
    f.put('larchDark', box(len + 0.4, 0.22, 0.12), len / 2, -0.15, s * (hw + 0.02));
  }
  /* The rail on the upstream side all along; on the other, only as far
   * as the boats' berth. */
  const berth = len * 0.45;
  for (const [s, x1] of [[-1, len], [1, berth]]) {
    for (let x = 0.2; x <= x1 + 0.01; x += 1.8) {
      f.put(near('larch'), boxUp(0.09, 1.0, 0.09), x, 0, s * (hw - 0.08));
    }
    f.put(near('larch'), box(x1, 0.07, 0.1), x1 / 2 + 0.2, 1.0, s * (hw - 0.08));
    f.put(detail('larch'), box(x1, 0.05, 0.05), x1 / 2 + 0.2, 0.5, s * (hw - 0.08));
  }
  const bollard = cached('s2bollard', () => new THREE.CylinderGeometry(0.11, 0.14, 0.45, 8).translate(0, 0.225, 0));
  for (let x = berth + 1.2; x < len; x += 3.2) {
    f.put(near('castIron'), bollard, x, 0, hw - 0.25);
  }
  f.put(near('castIron'), bollard, len - 0.3, 0, -hw + 0.3);
  lampPost(frame(f, len - 0.4, 0, -hw + 0.4, 0));
  /* A life ring on its post by the berth. */
  f.put(near('larchDark'), boxUp(0.08, 1.4, 0.08), berth + 0.5, 0, -hw + 0.2);
  f.put(near('signRed'), cached('s2lifering', () => new THREE.TorusGeometry(0.3, 0.06, 5, 12)), berth + 0.5, 1.1, -hw + 0.28);
}
