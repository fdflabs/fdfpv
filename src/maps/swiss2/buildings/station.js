/*
 * station.js: the gondola's valley and top stations, as the Oberland's
 * newer lifts are built: a rubble footing, the boarding deck at the
 * cabins' floor with a platform either side of the line, the bull wheel
 * and the ring of rail the cabins turn on, all under one long timber
 * roof on glulam beams, and at its back the machine house, concrete
 * below with the ticket window, the doors and the company's red board,
 * boarded in larch above with the control room's windows over the wheel.
 *
 * alps/lift.js lays the line and its sites (liftLine) and draws the
 * cel stations; a style with a `station` in its buildings draws its
 * own. swiss2's are baked with the village (buildings/index.js): the
 * valley station into the village's own meshes, at no draw of its own,
 * and the top station apart, drawn only where it is seen. Every key
 * here is a far one: a near key would open a cell of near detail round
 * the station (bake.js), a draw more for each of its groups in every
 * view near it.
 *
 * Local +x runs up the line, as in lift.js; the rope goes round the
 * wheel at the origin, LATERAL either side, h - 1.2 up, and the cabins
 * hang under it to just above the deck. Everything stands inside
 * lift.js's FOOT (x -8.5 to 6.5, z 5.5 either side, with the roof's
 * eaves out to 6.1) and under its collider's top, eleven metres less
 * twenty centimetres, so the collider the cel station has is this one's.
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
import { roofShell } from '../../alps/kit.js';
import { liftLine, STATION_H } from '../../alps/lift.js';
import {
  frame, box, boxUp, cached, prism, plate, dressRoof,
} from './parts.js';

const LATERAL = 2.6;

/* A ring of `r` about y, `tube` thick, from angle a0 to a1 in `n` straight
 * pieces: the rail round the wheel and the wheel's rim. */
function arc(f, key, y, r, a0, a1, n, tube) {
  const step = (a1 - a0) / n;
  const len = 2 * r * Math.sin(Math.abs(step) / 2) + tube * 0.6;
  for (let k = 0; k < n; k += 1) {
    const a = a0 + (k + 0.5) * step;
    f.put(key, box(len, tube, tube), Math.cos(a) * r, y, Math.sin(a) * r, -(a + Math.PI / 2));
  }
}

/* Letters on a board, as the photograph shows them from across the
 * square: a row of short white strokes of a cap height, word gaps. */
function lettering(f, key, x, y, z, len, h) {
  let u = -len / 2;
  let k = 0;
  while (u < len / 2 - h * 0.4) {
    const w = h * (0.35 + 0.35 * (((k * 7) % 5) / 4));
    if (k % 6 === 5) {
      u += h * 0.6;
    } else {
      f.put(key, box(0.02, h, w), x, y, z + u + w / 2);
      u += w + h * 0.18;
    }
    k += 1;
  }
}

/*
 * Both stations into the village's bake, where liftLine stands them:
 * the valley station with the village, the top station up the wall
 * apart (bake.js's `a`). ctx is alps/village.js's furnishing context:
 * the bake, the ground over the village's height, and that height.
 */
export function bakeStations({ bake, onGround, villageY }) {
  const heightAt = (x, z) => villageY + onGround(x, z);
  const [base, top] = liftLine(heightAt).stations;
  const apart = { ...bake, pushM: (key, g, m) => bake.pushM(key.includes(':') ? `${key}a` : `${key}:a`, g, m) };
  for (const [s, into] of [[base, bake], [top, apart]]) {
    station(frame(into, s.x, s.y - villageY, s.z, s.yaw), { found: s.found, h: STATION_H });
  }
}

/*
 * A station at the frame f, `found` metres of plinth under its floor
 * and `h` to the rope's plate (lift.js's STATION_H).
 */
export function station(f, { found, h }) {
  const wheelY = h - 1.2;
  const deck = h - 5.0;
  /* The base: a footing of rubble cut down to the lowest ground (at the
   * top station a retaining wall the height of the slope under it), a
   * concrete kerb round its top. */
  f.put('stone', box(15, found + 0.3, 11), -1, (0.3 - found) / 2, 0);
  f.put('liftConcrete', box(15.3, 0.12, 11.3), -1, 0.24, 0);

  /* THE DECK between the ropes at the cabins' floor, on its wall, with
   * the yellow line along its edges; a platform outside each rope on
   * columns, railed on its outer edge, for the other door. */
  f.put('liftConcrete', boxUp(9, deck - 0.3, 3.2), 0.5, 0.3, 0);
  f.put('liftConcrete', box(9.6, 0.22, 3.6), 0.5, deck - 0.11, 0);
  for (const s of [-1, 1]) {
    f.put('lineYellow', box(9.4, 0.01, 0.12), 0.5, deck + 0.005, s * 1.62);
    f.put('liftConcrete', box(9.2, 0.24, 1.5), 0.4, deck - 0.12, s * 4.45);
    f.put('lineYellow', box(9, 0.01, 0.12), 0.4, deck + 0.005, s * 3.78);
    for (const x of [-3.4, 0.4, 4.2]) {
      f.put('liftConcrete', boxUp(0.36, deck - 0.24 - 0.3, 0.36), x, 0.3, s * 4.6);
    }
    for (let x = -3.9; x <= 4.95; x += 1.45) {
      f.put('steel', boxUp(0.05, 1.05, 0.05), x, deck, s * 5.12);
    }
    f.put('steel', box(9.0, 0.06, 0.06), 0.45, deck + 1.05, s * 5.12);
    f.put('steel', box(9.0, 0.04, 0.04), 0.45, deck + 0.55, s * 5.12);
  }
  /* The end of the deck up the line: a rail across, and the steps
   * down to the ground for the crew. */
  for (let z = -1.55; z <= 1.56; z += 0.62) {
    f.put('steel', boxUp(0.05, 1.05, 0.05), 5.05, deck, z);
  }
  f.put('steel', box(0.06, 0.06, 3.2), 5.05, deck + 1.05, 0);

  /* THE WHEEL: the rim, spokes to the hub, the shaft up to the gearbox
   * over it, and the rail the cabins are carried round on, a horseshoe
   * outside the rope that runs on down the deck either side. */
  arc(f, 'steel', wheelY, LATERAL, 0, Math.PI * 2, 24, 0.22);
  for (let k = 0; k < 6; k += 1) {
    const a = (k / 6) * Math.PI;
    f.put('steel', box(LATERAL * 2, 0.12, 0.16), 0, wheelY, 0, a);
  }
  f.put('steel', cached('s2hub', () => new THREE.CylinderGeometry(0.42, 0.42, 0.5, 12)), 0, wheelY, 0);
  f.put('steel', cached('s2shaft', () => new THREE.CylinderGeometry(0.18, 0.18, 1.2, 8)), 0, wheelY + 0.8, 0);
  f.put('steel', box(1.5, 0.7, 1.1), 0, h + 0.05, 0);
  f.put('steel', cached('s2motor', () => new THREE.CylinderGeometry(0.32, 0.32, 1.1, 10).rotateZ(Math.PI / 2)), -1.25, h + 0.05, 0);
  const railY = wheelY + 0.32;
  const railR = LATERAL + 0.32;
  arc(f, 'steel', railY, railR, Math.PI / 2, Math.PI * 1.5, 12, 0.2);
  /* Hung from the roof's beams on struts. */
  const strut = (x, z) => f.put('steel', boxUp(0.1, h + 0.4 - railY, 0.1), x, railY, z);
  strut(-railR, 0);
  for (const s of [-1, 1]) {
    f.put('steel', box(5.2, 0.2, 0.2), 2.6, railY, s * railR);
    for (const x of [0.3, 2.6, 4.9]) {
      strut(x, s * railR);
    }
  }

  /* THE ROOF, one long gable over the deck, the wheel and the machine
   * house, its ridge down the line: dark standing seam over a boarded
   * soffit, on glulam beams across the span and a beam down each eave on
   * concrete columns. The roof's own frame turns its ridge (z) onto the
   * station's x. */
  const plateY = h + 0.5;
  const cx = -1.0;
  const hd = 7.2;
  const hw = 5.6;
  const rf = frame(f, cx, plateY, 0, Math.PI / 2);
  const roof = roofShell({ kind: 'gable', hw, hd, ov: 0.5, ovA: 0.3, ovB: 0.6, pitch: 0.17 });
  Object.assign(roof, { hw, hd, kind: 'gable', zA0: 0.3, zB0: 0.6 });
  rf.put('slate', roof.geo);
  dressRoof(rf, roof, { roofKey: 'slate', key: 'larch', rafters: false, purlins: false });
  f.put('larch', box(2 * hd + 0.6, 0.04, 2 * hw), cx + 0.15, plateY - 0.03, 0);
  for (const x of [-4.2, -1.3, 1.6, 4.3, 6.1]) {
    f.put('larch', box(0.26, 0.55, 2 * hw), x, plateY - 0.3, 0);
  }
  for (const s of [-1, 1]) {
    f.put('larch', box(2 * hd, 0.5, 0.26), cx, plateY - 0.28, s * (hw - 0.13));
    for (const x of [1.4, 6.0]) {
      f.put('liftConcrete', boxUp(0.45, plateY - 0.55 - 0.3, 0.45), x, 0.3, s * (hw - 0.2));
    }
  }
  /* The gables boarded down to the plate: the open end over the cabins'
   * way in, and the machine house's end over its wall. */
  const tri = [[hw, 0], [0, hw * roof.tanP - 0.03], [-hw, 0]];
  for (const [z0, z1] of [[hd - 0.2, hd], [-hd, -hd + 0.2]]) {
    rf.put('larch:v', prism(tri, z0, z1));
  }
  f.put('larch:v', box(0.2, 0.6, 2 * hw), cx + hd - 0.1, plateY - 0.3, 0);

  /* THE MACHINE HOUSE at the back, x -8.2 to -4.2: a concrete storey
   * to the deck with its openings let in, larch boards above to the
   * plate, and the control room's window band on three sides. */
  const mx = -6.2;
  const mw = 4.0;
  const md = 2 * hw - 0.2;
  const lowH = deck - 0.3;
  const back = mx - mw / 2;
  f.put('liftConcrete', boxUp(mw, lowH, md), mx, 0.3, 0);
  f.put('liftConcrete', box(mw + 0.12, 0.18, md + 0.12), mx, 0.3 + lowH, 0);
  f.put('larch:v', boxUp(mw, plateY - deck, md), mx, deck, 0);
  /* The boards' joints, a dark line every two metres. */
  for (let z = -md / 2 + 2; z < md / 2 - 1; z += 2) {
    f.put('boardLine', box(0.02, plateY - deck - 0.4, 0.05), back - 0.005, deck + (plateY - deck) / 2, z);
  }
  const winY = deck + 2.4;
  f.put('glass:o', plate(md - 1.6, 1.3), back - 0.02, winY, 0, -Math.PI / 2);
  f.put('steel', box(0.06, 0.08, md - 1.4), back - 0.04, winY + 0.69, 0);
  f.put('steel', box(0.08, 0.1, md - 1.4), back - 0.05, winY - 0.7, 0);
  for (let z = -(md - 1.6) / 2; z <= (md - 1.6) / 2 + 0.01; z += (md - 1.6) / 4) {
    f.put('steel', box(0.06, 1.3, 0.06), back - 0.04, winY, z);
  }
  for (const s of [-1, 1]) {
    f.put('glass:o', plate(mw - 1.0, 1.3), mx, winY, s * (md / 2 + 0.02), s > 0 ? 0 : Math.PI);
    f.put('steel', box(mw - 0.8, 0.08, 0.06), mx, winY + 0.69, s * (md / 2 + 0.04));
    f.put('steel', box(mw - 0.8, 0.1, 0.08), mx, winY - 0.7, s * (md / 2 + 0.05));
    /* The door out onto each platform from the upper floor. */
    f.put('door', box(0.05, 2.15, 1.0), mx + mw / 2 + 0.03, deck + 1.08, s * 4.45);
    f.put('steel', box(0.07, 0.08, 1.15), mx + mw / 2 + 0.05, deck + 2.2, s * 4.45);
  }
  /* The front the village sees: the doors in a steel frame, the ticket
   * window with its counter and its little roof, the red board with
   * the company's name over them, the timetable, a bench. */
  const face = back - 0.02;
  f.put('shade', box(0.04, 2.5, 2.2), face, 0.3 + 1.25, -0.6, 0);
  for (const z of [-1.15, -0.05]) {
    f.put('glass:o', plate(1.0, 2.3), face - 0.03, 0.3 + 1.2, z, -Math.PI / 2);
  }
  f.put('steel', box(0.1, 0.1, 2.3), face - 0.04, 0.3 + 2.45, -0.6);
  for (const z of [-1.7, -0.6, 0.5]) {
    f.put('steel', box(0.1, 2.5, 0.08), face - 0.04, 0.3 + 1.25, z);
  }
  f.put('glass:o', plate(1.4, 1.1), face - 0.03, 0.3 + 1.55, 2.2, -Math.PI / 2);
  f.put('steel', box(0.1, 0.08, 1.6), face - 0.04, 0.3 + 2.14, 2.2);
  f.put('steel', box(0.1, 1.2, 0.08), face - 0.04, 0.3 + 1.55, 1.46);
  f.put('steel', box(0.1, 1.2, 0.08), face - 0.04, 0.3 + 1.55, 2.94);
  f.put('steel', box(0.45, 0.06, 1.6), face - 0.22, 0.3 + 0.98, 2.2);
  f.put('metal', box(1.0, 0.05, 2.0), face - 0.5, 0.3 + 2.45, 2.2, 0, 0, -0.12);
  f.put('signRed', box(0.05, 0.3, 1.4), face - 0.05, 0.3 + 2.25, 2.2);
  lettering(f, 'paint', face - 0.08, 0.3 + 2.25, 2.2, 1.1, 0.14);
  f.put('signRed', box(0.08, 0.95, md - 2.4), face - 0.06, deck + 0.75, 0);
  lettering(f, 'paint', face - 0.11, deck + 0.78, 0, md - 3.6, 0.42);
  f.put('paint', box(0.05, 1.1, 0.8), face - 0.03, 0.3 + 1.45, -2.6);
  for (let k = 0; k < 6; k += 1) {
    f.put('ink', box(0.02, 0.04, 0.6), face - 0.06, 0.3 + 1.8 - k * 0.13, -2.6);
  }
  f.put('fence', box(0.4, 0.05, 1.8), face - 0.3, 0.3 + 0.45, -3.9);
  for (const s of [-1, 1]) {
    f.put('larchDark', boxUp(0.35, 0.45, 0.08), face - 0.3, 0.3, -3.9 + s * 0.8);
  }
  /* The machine house's side toward the wheel is open to it over the
   * deck: the control room looks down on the wheel through glass. */
  f.put('glass:o', plate(md - 2.4, 1.3), mx + mw / 2 + 0.02, winY, 0, Math.PI / 2);
  f.put('steel', box(0.08, 0.1, md - 2.2), mx + mw / 2 + 0.05, winY - 0.7, 0);
}
