/*
 * hangar.js: the hangar by the strip and its apron, as a steel portal
 * frame shed is built.
 *
 * alps/kit.js's hangar again, on its plan (24 by 30 m, 5 m to the eaves,
 * the door opening 17 m wide at the +z end), returning its extents, so
 * its collider is the cel one. What it is made of: portal frames of I
 * section steel every five metres, a concrete upstand round the foot of
 * the walls, trapezoidal steel sheet over the frames on the walls and
 * the roof (look.js's `ribbed` draws its ribs), flashings at the corners
 * and the verges, gutters and downpipes; the door as four
 * leaves on a bottom track and a top guide, two stacked open past the
 * corner, one part slid, the dark of the shed behind; the apron in cast
 * bays with their joints sealed dark, oil where aircraft stand, a yellow
 * lead in line; the fuel pump on its pad.
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
import { frame, box, boxUp, cached, prism, near, detail, plate } from './parts.js';

/* An I section steel member `len` long, centred at (x, y, z) in the
 * plane of its portal (x, y), turned rz from upright: the web in that
 * plane `depth` deep, the flanges across it. */
function iBeam(f, key, x, y, z, len, depth, rz = 0) {
  const m = frame(f, x, y, z, 0);
  m.put(key, box(depth, len, 0.012), 0, 0, 0, 0, 0, rz);
  for (const s of [-1, 1]) {
    const dx = s * depth / 2;
    m.put(key, box(0.016, len, 0.18), dx * Math.cos(rz), dx * Math.sin(rz), 0, 0, 0, rz);
  }
}

export function hangar(f, spec) {
  const { found = 0.3 } = spec;
  const w = 24;
  const d = 30;
  const wallH = 5;
  const hw = w / 2;
  const hd = d / 2;
  const t = 0.2;
  const pitch = 0.3;
  const slab = 0.05;
  const upstand = 0.55;
  const tanP = Math.tan(pitch);
  const plateY = slab + wallH;

  /* The floor slab, and inside it the floor as the shed's dark sees it. */
  f.put('concrete', box(w + 0.6, found + slab, d + 0.6), 0, (slab - found) / 2, 0);
  f.put('hangarIn', plate(w - 2 * t, d - 2 * t), 0, slab + 0.02, 0, 0, -Math.PI / 2);

  /* The walls: the sheet on its frame, the upstand at its foot. */
  const walls = [
    { fr: frame(f, hw, 0, 0, Math.PI / 2), len: d },
    { fr: frame(f, -hw, 0, 0, -Math.PI / 2), len: d },
    { fr: frame(f, 0, 0, -hd, Math.PI), len: w },
  ];
  for (const { fr, len } of walls) {
    fr.put('hangar', boxUp(len, wallH - upstand, t), 0, slab + upstand, -t / 2);
    fr.put('concrete', boxUp(len + 0.1, upstand, t + 0.08), 0, slab, -t / 2 + 0.04);
    /* The inside of the sheet, dark. */
    fr.put('hangarIn', plate(len - 0.4, wallH), 0, slab + wallH / 2, -t - 0.01, Math.PI);
  }
  /* The -z gable over the plate. */
  f.put('hangar', prism([[-hw, plateY], [hw, plateY], [0, plateY + hw * tanP - 0.03]], -hd, -hd + t));

  /* The +z end: the header over the opening, the piers either side, the
   * gable. */
  const opening = 17;
  const openH = 4.2;
  const pierW = (w - opening) / 2;
  const end = frame(f, 0, 0, hd, 0);
  for (const s of [-1, 1]) {
    const x = s * (opening / 2 + pierW / 2);
    end.put('hangar', boxUp(pierW, wallH - upstand, t), x, slab + upstand, -t / 2);
    end.put('concrete', boxUp(pierW, upstand, t + 0.08), x, slab, -t / 2 + 0.04);
  }
  end.put('hangar', boxUp(opening, wallH - openH, t), 0, slab + openH, -t / 2);
  end.put('hangar', prism([[-hw, plateY], [hw, plateY], [0, plateY + hw * tanP - 0.03]], -t, 0));
  end.put('hangarIn', prism([[-hw + 0.2, slab + openH], [hw - 0.2, slab + openH], [hw - 0.2, plateY], [0, plateY + hw * tanP - 0.1], [-hw + 0.2, plateY]], -t - 0.03, -t - 0.02));

  /* The roof: the cel shell, sheeted; the ridge cap, the verges'
   * flashings, the gutters and the downpipes. */
  const roof = roofShell({ kind: 'gable', hw, hd, ov: 0.5, pitch, t: 0.15 });
  const rf = frame(f, 0, plateY, 0, 0);
  rf.put('hangarRoof', roof.geo);
  for (const s of [-1, 1]) {
    rf.put('flashing', box(0.1, 0.08, roof.zB - roof.zA), s * (roof.ex + 0.02), roof.yT - 0.05, 0);
    /* The gutter and a downpipe at each end of it. */
    rf.put('flashing', box(0.16, 0.14, roof.zB - roof.zA), s * (roof.ex + 0.1), roof.yT - 0.18, 0);
    for (const z of [roof.zA + 0.4, roof.zB - 0.4]) {
      f.put('flashing', cached('s2downpipe', () => new THREE.CylinderGeometry(0.05, 0.05, 1, 8).translate(0, 0.5, 0)), s * (hw + 0.12), slab + 0.2, z, 0, 0, 0, 1, wallH - 0.1, 1);
      f.put(near('flashing'), box(0.1, 0.06, 0.4), s * (hw + 0.28), plateY - 0.15, z);
    }
    /* The verges: a flashing along each gable's roof edge. */
    for (const z of [roof.zA, roof.zB]) {
      const len = Math.hypot(roof.ex, roof.ex * tanP) + 0.1;
      rf.put('flashing', box(len, 0.22, 0.06), s * roof.ex / 2, (roof.yR + roof.yT) / 2 - 0.06, z, 0, 0, -s * pitch);
    }
  }
  rf.put('flashing', box(0.5, 0.06, roof.zB - roof.zA), 0, roof.yR + 0.03, 0);
  /* The corner flashings and the wall's head. */
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      f.put('flashing', boxUp(0.16, wallH - upstand + 0.05, 0.16), sx * (hw + 0.02), slab + upstand, sz * (hd + 0.02));
    }
  }

  /* The portal frames inside, every five metres: two columns and two
   * rafters to the ridge, what the open door shows. */
  for (let k = 0; k <= 6; k += 1) {
    const z = Math.max(-hd + 0.35, Math.min(hd - 0.35, -hd + k * (d / 6)));
    for (const s of [-1, 1]) {
      iBeam(f, 'steel', s * (hw - t - 0.2), slab + wallH / 2, z, wallH, 0.3);
      const rl = Math.hypot(hw, hw * tanP);
      iBeam(f, 'steel', s * hw / 2, plateY + (hw / 2) * tanP - 0.35, z, rl, 0.45, s * (Math.PI / 2 - pitch));
    }
  }
  /* Purlins along the shed, under the sheet. */
  for (const x of [-10, -7, -4, -1.2, 1.2, 4, 7, 10]) {
    f.put('steel', box(0.08, 0.2, d - 0.4), x, plateY + (hw - Math.abs(x)) * tanP - 0.28, 0);
  }

  /* The side walls: the windows, a steel door on the +x side. */
  for (const side of [-1, 1]) {
    const wall = frame(f, side * hw, 0, 0, side * Math.PI / 2);
    for (const z of [-9, -3, 3, 9]) {
      wall.put('glass:o', plate(1.3, 0.7), z, slab + 3.7, 0.05);
      wall.put('flashing', box(1.5, 0.08, 0.1), z, slab + 3.31, 0.05);
      wall.put(near('flashing'), box(1.46, 0.9, 0.06), z, slab + 3.7, 0.03);
      wall.put('glass:o', plate(1.3, 0.7), z, slab + 3.7, 0.07);
    }
    /* A girt line in the sheet at door head height. */
    wall.put(near('flashing'), box(d - 0.3, 0.05, 0.05), 0, slab + 2.4, 0.07);
  }
  const side = frame(f, hw, 0, 0, Math.PI / 2);
  side.put('door', box(1.0, 2.1, 0.08), -7.5, slab + 1.05, 0.08);
  side.put('flashing', box(1.2, 2.25, 0.05), -7.5, slab + 1.12, 0.05);
  side.put(near('ink'), box(0.04, 0.2, 0.06), -7.15, slab + 1.0, 0.14);
  side.put('flashing', box(1.6, 0.06, 0.6), -7.5, slab + 2.4, 0.3);
  side.put('concrete', box(1.6, 0.12, 1.0), -7.5, slab + 0.06, 0.5);
  side.put(near('lamp'), box(0.2, 0.12, 0.14), -7.5, slab + 2.6, 0.15);

  /* THE DOOR: four leaves hung from the top guide, running on the
   * bottom track. Two stand stacked past the right corner, one is slid
   * half across, one closes the right of the opening: the left third
   * stands open, as the cel door has it. */
  const leaves = 4;
  const leafW = opening / leaves + 0.15;
  const leafH = openH + 0.1;
  const zLeaf = hd + 0.12;
  const at = [opening / 2 - leafW / 2, opening / 2 - leafW * 1.5 + 0.1, 0.8, -1.4];
  at.forEach((x, k) => {
    const z = zLeaf + (k % 2) * 0.16;
    const leaf = frame(f, x, 0, z, 0);
    leaf.put('hangarDoor', boxUp(leafW, leafH, 0.1), 0, slab, 0);
    /* The frame round the leaf and a translucent band along its head. */
    for (const s of [-1, 1]) {
      leaf.put('steel', boxUp(0.1, leafH, 0.14), s * (leafW / 2 - 0.05), slab, 0);
    }
    leaf.put('steel', box(leafW, 0.12, 0.14), 0, slab + 0.08, 0);
    leaf.put('steel', box(leafW, 0.12, 0.14), 0, slab + leafH - 0.06, 0);
    leaf.put('lightPanel', box(leafW - 0.2, 0.7, 0.02), 0, slab + leafH - 0.5, 0.06);
    leaf.put('steel', box(leafW, 0.08, 0.14), 0, slab + leafH - 0.88, 0);
    if (k === 3) {
      /* The wicket door let into the last leaf. */
      leaf.put(near('steel'), box(0.9, 2.0, 0.03), 0.6, slab + 1.1, 0.08);
      leaf.put(near('ink'), box(0.04, 0.16, 0.05), 0.95, slab + 1.0, 0.1);
    }
  });
  /* The top guide, run on past the corner to take the stacked leaves,
   * on brackets; the bottom track in the concrete. */
  f.put('steel', box(w + 5, 0.22, 0.2), 2.5, slab + leafH + 0.18, zLeaf + 0.1);
  for (let k = 0; k < 8; k += 1) {
    f.put(near('steel'), box(0.12, 0.3, 0.3), -hw + 1 + k * 3.8, slab + leafH + 0.35, zLeaf - 0.05);
  }
  f.put('steel', box(w + 5, 0.03, 0.14), 2.5, slab + 0.015, zLeaf + 0.1);
  f.put('steel', box(4.5, leafH, 0.08), hw + 2.3, slab + leafH / 2, zLeaf - 0.12);
  /* Floodlights over the door. */
  for (const x of [-6, 0, 6]) {
    f.put(near('lamp'), box(0.4, 0.14, 0.3), x, plateY - 0.2, hd + 0.3);
    f.put(near('steel'), box(0.05, 0.05, 0.3), x, plateY - 0.1, hd + 0.15);
  }

  /* THE APRON: cast in bays five metres square, the joints sealed dark,
   * oil where the aircraft stand and the pump's hose drips, the yellow
   * lead in line from the door, the tie down rings. */
  const apronD = 22;
  const apronW = w + 8;
  const az0 = hd + 0.3;
  f.put('concrete', box(apronW, 0.1, apronD), 0, slab - 0.05, az0 + apronD / 2);
  for (let x = -apronW / 2 + 5.33; x < apronW / 2 - 0.5; x += 5.33) {
    f.put('joint', box(0.03, 0.04, apronD), x, slab, az0 + apronD / 2);
  }
  for (let z = az0 + 5.5; z < az0 + apronD - 0.5; z += 5.5) {
    f.put('joint', box(apronW, 0.04, 0.03), 0, slab, z);
  }
  /* A spill: a disc with a ragged edge, no two radii alike. */
  const blot = cached('s2blot', () => {
    const shape = new THREE.Shape();
    for (let k = 0; k < 14; k += 1) {
      const a = (k / 14) * Math.PI * 2;
      const r = 0.7 + 0.3 * Math.abs(Math.sin(k * 2.7)) + 0.15 * Math.sin(k * 5.3);
      shape[k ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
    }
    return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
  });
  for (const [x, z, r, sx] of [[-5, 8, 0.9, 1.3], [5, 9.5, 0.7, 1.0], [0.5, 4, 1.2, 1.6], [-8, 14, 0.5, 1.2], [-13, 7.5, 0.6, 1.4], [3, 15, 0.8, 0.8]]) {
    f.put('stain', blot, x, slab + 0.02, az0 + z, x, 0, 0, r * sx, 1, r);
  }
  f.put('lineYellow', box(0.15, 0.04, apronD - 1), -3.2, slab, az0 + apronD / 2);
  const ring = cached('tiedown', () => new THREE.TorusGeometry(0.16, 0.025, 6, 12).rotateX(Math.PI / 2));
  for (const x of [-5, 5]) {
    for (const z of [hd + 5, hd + 11, hd + 17]) {
      f.put(detail('metal'), ring, x, slab + 0.03, z);
    }
  }
  const pump = frame(f, -hw - 1.5, 0, hd + 7, Math.PI / 2);
  pump.put('concrete', box(2.0, 0.16, 1.4), 0, slab + 0.03, 0);
  pump.put('fuel', boxUp(0.7, 1.55, 0.5), 0, slab + 0.11, 0);
  pump.put('trim', box(0.46, 0.5, 0.03), 0, slab + 1.2, 0.26);
  pump.put('ink', box(0.16, 0.1, 0.03), 0, slab + 0.8, 0.26);
  pump.put('ink', cached('s2hose', () => new THREE.CylinderGeometry(0.02, 0.02, 1.3, 6).translate(0, 0.65, 0)), 0.4, slab + 0.3, 0.1);
  pump.put('ink', box(0.1, 0.22, 0.1), 0.4, slab + 1.4, 0.1);
  pump.put('stain', blot, 0.1, slab + 0.13, 0.7, 0.4, 0, 0, 0.6, 1, 0.4);
  for (let k = 0; k < 3; k += 1) {
    pump.put('fuel', cached('s2drum', () => new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12).translate(0, 0.45, 0)), -1.6 - k * 0.7, slab + 0.11, -0.2);
  }
  return { hw: hw + 0.6, hd, top: plateY + roof.yR + 0.2 };
}
