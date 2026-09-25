/*
 * yards.js: what lies between an Oberland village's houses, so that from
 * the air it reads as a village and not as a plan of one.
 *
 * Round 8's village seen from twenty metres up was houses spaced like a
 * drawing on a mown lawn. A real one (Iseltwald, Brienz) is as much yard
 * as house: big old trees between the roofs, limes and walnuts and a
 * pear or an apple in every garden, their shade on the shingle; a shed,
 * a garage or a woodshed beside nearly every house; a car on the gravel
 * in front, a tractor in a farmer's yard; hedges on the garden lines and
 * shrubs round the houses; a vegetable plot and a compost heap behind
 * the beds, the path to it worn bare; and no two lawns kept alike.
 *
 *   yards(t) -> { trees, cars, later, marks }
 *
 * t is furnish()'s own toolkit (village/index.js), so everything here
 * keeps off the houses, the roads, the square, the PostAuto's sweep and
 * whatever the gardens already put down, and bakes into the village's
 * meshes at no draw of its own. It is run after every garden is laid, and
 * draws nothing from any rng, so nothing laid before it moves.
 *
 * What it cannot draw itself it hands back:
 *   trees  the trees, planted by the forest last of all (vegetation/
 *          forest.js), so they are lit, shaded and swayed as every other
 *          tree is, and no earlier tree moves;
 *   cars   the parked cars and tractors, baked by the vehicles' own
 *          parked bake (swiss2.js);
 *   later  the colliders of what it built, added by swiss2.js once the
 *          forest is planted: a wall noted before then would be taken
 *          for a garden and move the forest's garden trees;
 *   marks  the ground under it all (ground.js wallMask): gravel yards and
 *          drives, bare earth where the paths are worn and round the
 *          sheds, and each garden's lawn kept its own way.
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
import { groundPaths } from '../../alps/terrain.js';
import { outbuilding, compost, hedge, plot, shrub } from './pieces.js';

/* The farm tracks alps/village.js lays through the village's edge, and
 * the gondola's foot (alps/lift.js), which nothing here may stand on. */
const TRACKS = [
  [{ x: -302, z: 282 }, { x: -284, z: 222 }, { x: -262, z: 170 }, { x: -215, z: 135 }, { x: -206, z: 128 }],
  [{ x: -258, z: -160 }, { x: -230, z: -120 }, { x: -170, z: -40 }, { x: -120, z: 20 }, { x: -100, z: 38 }],
];
const LIFT = { x: -300, z: 150, r: 26 };
/* The village's own ground, where its trees, its cars and its lawns are. */
const TREE_AREA = { x0: -268, x1: -38, z0: 22, z1: 238 };

/* Distance from (x, z) to the polyline pts. */
function toLine(pts, x, z) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
    best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)));
  }
  return best;
}

/* A number in [0, 1) that is a spot's own. */
function hash(x, z, salt) {
  const v = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
  return v - Math.floor(v);
}

/*
 * t: furnish's { houses, at, houseY, free, take, onRoads, inSquare }.
 */
export function yards(t) {
  const { houses, at, houseY, take, bake, villageY } = t;
  const paths = [...groundPaths(), ...TRACKS];
  const free = (x, z, r) => t.free(x, z, r)
    && Math.hypot(x - LIFT.x, z - LIFT.z) > LIFT.r + r
    && paths.every((p) => toLine(p, x, z) > 2.2 + r);
  const trees = [];
  const cars = [];
  const later = [];
  const marks = { gravel: [], earth: [], lawn: [] };
  /* A rectangle w across and d along, turned ry, all of it free. */
  const fits = (x, z, ry, w, d, margin = 0.4) => {
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    for (let u = -w / 2; u <= w / 2 + 1e-6; u += Math.max(0.5, w / Math.ceil(w))) {
      for (let v = -d / 2; v <= d / 2 + 1e-6; v += Math.max(0.5, d / Math.ceil(d))) {
        if (!free(x + u * c + v * s, z - u * s + v * c, margin)) {
          return false;
        }
      }
    }
    return true;
  };
  /* The axis aligned box round a turned rectangle. */
  const wallFor = (x, z, ry, w, d, top) => {
    const c = Math.abs(Math.cos(ry));
    const s = Math.abs(Math.sin(ry));
    const hx = (w * c + d * s) / 2;
    const hz = (w * s + d * c) / 2;
    const y = houseY(x, z);
    return [x - hx, y, z - hz, x + hx, y + top, z + hz];
  };
  /* A quad on the ground for the marks, as its four corners. */
  const quad = (x, z, ry, w, d) => {
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({
      x: x + (a * w / 2) * c + (b * d / 2) * s,
      z: z - (a * w / 2) * s + (b * d / 2) * c,
    }));
  };

  /* THE LAWNS. The village's ground is all somebody's: under every lawn
   * first the village's own, soft edged, and over it each building's,
   * the houses' gardens from the front fence to well behind the beds,
   * some mown short, some let grow rank. */
  const inVillage = (x, z) => x > TREE_AREA.x0 && x < TREE_AREA.x1 && z > TREE_AREA.z0 && z < TREE_AREA.z1;
  {
    const pts = [];
    const cx = (TREE_AREA.x0 + TREE_AREA.x1) / 2;
    const cz = (TREE_AREA.z0 + TREE_AREA.z1) / 2;
    for (let k = 0; k < 24; k += 1) {
      const a = (k / 24) * Math.PI * 2;
      const r = 0.85 + 0.25 * hash(k, 3, 90);
      pts.push({ x: cx + Math.cos(a) * r * (TREE_AREA.x1 - TREE_AREA.x0) / 2, z: cz + Math.sin(a) * r * (TREE_AREA.z1 - TREE_AREA.z0) / 2 });
    }
    marks.lawn.push({ pts, v: -0.35, blur: 14 });
  }
  for (const h of houses) {
    if (h.garden || !inVillage(h.at.x, h.at.z)) {
      continue;
    }
    const ry = Math.atan2(-h.m.elements[2], h.m.elements[0]);
    marks.lawn.push({ pts: quad(h.at.x, h.at.z, ry, 2 * h.ext.hw + 16, 2 * h.ext.hd + 16), v: (hash(h.at.x, h.at.z, 203) < 0.5 ? -1 : 1) * 0.5 });
  }

  for (const h of houses.filter((b) => b.garden)) {
    const m = h.m;
    const ry = Math.atan2(-m.elements[2], m.elements[0]);
    const local = (lx, lz) => new THREE.Vector3(lx, 0, lz).applyMatrix4(m);
    const own = (salt) => hash(h.at.x, h.at.z, salt);
    const hw = h.ext.hw;
    const hd = h.ext.hd;

    /* The garden's own lawn, mown or let grow. */
    const lawn = (own(201) < 0.55 ? -1 : 1) * (0.3 + 0.6 * own(202));
    const mid = local(-hw * 0.6, 0);
    marks.lawn.push({ pts: quad(mid.x, mid.z, ry, 2 * hw + 20, 2 * hd + 10), v: lawn });

    /* THE OUTBUILDING: a shed, a garage or a woodshed off one gable, its
     * doors to the front, or at the bottom of the garden. */
    const kinds = [
      { kind: 'garage', w: 3.3, d: 6, h: 2.45, wall: own(211) < 0.5 ? 'render' : 'renderCream', roofKey: 'slateNew' },
      { kind: 'shed', w: 2.4, d: 3, h: 2.1, wall: own(212) < 0.6 ? 'weathered' : 'larchDark', roofKey: ['tinRust', 'tin', 'shingleDark', 'shingleDark'][Math.floor(own(213) * 4)] },
      { kind: 'woodshed', w: 4.2, d: 1.9, h: 2.0, wall: 'larchDark', roofKey: 'tin' },
    ];
    const spec = kinds[Math.floor(own(210) * 3)];
    let garage = null;
    if (own(209) < 0.85) {
      /* Off either gable, back from the front, or across the bottom of
       * the garden; the first that fits. The front of a garage faces the
       * way the house's door does, toward the road. */
      const face = spec.kind === 'garage' ? ry + Math.PI / 2 : ry + Math.PI / 2 * (own(214) < 0.5 ? 1 : -1);
      const side = own(215) < 0.5 ? 1 : -1;
      const along = spec.kind === 'garage' ? spec.d : spec.w;
      const across = spec.kind === 'garage' ? spec.w : spec.d;
      const spots = [
        [hw * 0.2, side * (hd + 1.6 + across / 2)],
        [hw * 0.2, -side * (hd + 1.6 + across / 2)],
        [-hw + 1, side * (hd + 2.4 + across / 2)],
        [-(hw + 10.5 + along / 2), side * 2],
        [-(hw + 10.5 + along / 2), -side * 3],
      ];
      for (const [lx, lz] of spots) {
        const p = local(lx, lz);
        const turn = face;
        if (!fits(p.x, p.z, turn, spec.w + 0.6, spec.d + 0.8)) {
          continue;
        }
        const from = { roofs: bake.roofs.length, solids: bake.solids.length };
        const top = outbuilding(at(p.x, p.z, turn), spec);
        take(p.x, p.z, spec.w / 2 + 0.5, turn, spec.d / 2 + 0.6);
        /* Its walls under its roof, which is ground, with the old box
         * its footprint (alps/roofs.js standWalls). */
        const roofs = bake.roofs.slice(from.roofs);
        for (const r of roofs) {
          r.kind ??= spec.kind;
        }
        const box = wallFor(p.x, p.z, turn, spec.w + 0.4, spec.d + 0.4, top);
        later.push(['stand', box, roofs, villageY, { parts: bake.solids.slice(from.solids) }]);
        /* Trodden earth round its door, and for a garage gravel out to
         * the road. */
        const door = { x: p.x + Math.sin(turn) * (spec.d / 2 + 1.4), z: p.z + Math.cos(turn) * (spec.d / 2 + 1.4) };
        if (spec.kind === 'garage') {
          garage = { x: p.x, z: p.z, turn };
          marks.gravel.push({ pts: quad(door.x + Math.sin(turn) * 3, door.z + Math.cos(turn) * 3, turn, spec.w + 0.8, 9), v: 0.95 });
        } else {
          marks.earth.push({ pts: quad(door.x, door.z, turn, spec.w + 0.6, 2.6), v: 0.6 });
        }
        break;
      }
    }

    /* THE COMPOST, at the bottom of the garden, and the path worn to it
     * from the back door. */
    if (own(220) < 0.65) {
      for (const lz of [hd * 0.5, -hd * 0.5, 0]) {
        const p = local(-(hw + 9.2), lz);
        if (!fits(p.x, p.z, ry, 1.6, 1.6)) {
          continue;
        }
        compost(at(p.x, p.z, ry + Math.PI / 2));
        take(p.x, p.z, 1.0);
        later.push(['addBox', 'wall', ...wallFor(p.x, p.z, ry, 1.4, 1.4, 0.95)]);
        const back = local(-hw, lz * 0.3);
        marks.earth.push({ line: [back, p], width: 0.9, v: 0.55 });
        break;
      }
    }

    /* A CAR out on the gravel in front of the garage, or on a pad by a
     * gable or the front path, or in a farmer's yard his tractor. A car
     * is along x of its own frame, so a yaw of the house's own points it
     * at the road. */
    /* In the village only: the cars are one bake, and one car out at a
     * farm would stretch it over the valley and into every view. */
    if (inVillage(h.at.x, h.at.z) && own(230) < 0.7) {
      const tractor = own(231) < 0.2;
      const len = tractor ? 3.6 : 4.4;
      const flip = own(232) < 0.5 ? 0 : Math.PI;
      const spots = [];
      if (garage) {
        const out = spec.d / 2 + 1.0 + len / 2;
        spots.push({ x: garage.x + Math.sin(garage.turn) * out, z: garage.z + Math.cos(garage.turn) * out, yaw: garage.turn - Math.PI / 2 });
      }
      /* Nose to the road beside the gables or the front path, or along
       * the front of the house. */
      for (const [lx, lz, along] of [
        [hw - 1.2, hd + 2.6, 0], [hw - 1.2, -(hd + 2.6), 0],
        [hw + 0.8 + len / 2, h.door + 3.4, 0], [hw + 0.8 + len / 2, h.door - 3.4, 0],
        [hw + 1.8, h.door + 1.6 + len / 2, 1], [hw + 1.8, h.door - 1.6 - len / 2, 1],
        [0, hd + 2.2, 1], [0, -(hd + 2.2), 1],
      ]) {
        const p = local(lx, lz);
        spots.push({ x: p.x, z: p.z, yaw: ry + flip + along * Math.PI / 2 });
      }
      for (const s of spots) {
        if (!fits(s.x, s.z, s.yaw + Math.PI / 2, 2.3, len + 0.6, 0.3)) {
          continue;
        }
        take(s.x, s.z, 1.3, s.yaw + Math.PI / 2, len / 2 + 0.3);
        cars.push({ x: s.x, z: s.z, yaw: s.yaw, kind: tractor ? 'tractor' : ['hatch', 'estate', 'hatch', 'van', 'estate'][Math.floor(own(233) * 5)], paint: Math.floor(own(234) * 6) });
        marks.gravel.push({ pts: quad(s.x, s.z, s.yaw + Math.PI / 2, 3.2, len + 2.4), v: tractor ? 0.6 : 0.9 });
        break;
      }
    }

    /* THE VEGETABLE PLOT: turned earth past the beds, rows of potatoes,
     * cabbages and lettuces on it, a path of boards down the middle. */
    if (own(250) < 0.45) {
      const pw = 4.5 + 2 * own(251);
      const pd = 6 + 3 * own(252);
      for (const lz of [0, hd * 0.6, -hd * 0.6]) {
        const p = local(-(hw + 11 + pw / 2), lz);
        if (!fits(p.x, p.z, ry, pw + 1, pd + 1, 0.3)) {
          continue;
        }
        plot(at(p.x, p.z, ry), pw, pd);
        take(p.x, p.z, pw / 2 + 0.5, ry, pd / 2 + 0.5);
        marks.earth.push({ pts: quad(p.x, p.z, ry, pw + 0.6, pd + 0.6), v: 0.95 });
        break;
      }
    }

    /* A HEDGE down one side of the plot, from the front to past the
     * beds, where nothing else stands. */
    if (own(240) < 0.55) {
      const side = own(241) < 0.5 ? 1 : -1;
      const lz = side * (hd + 3.2 + own(242) * 1.5);
      let run = [];
      const runs = [];
      for (let lx = h.w / 2 + 1; lx > -(hw + 11); lx -= 0.8) {
        const p = local(lx, lz);
        if (free(p.x, p.z, 0.6)) {
          run.push(p);
        } else {
          if (run.length > 4) {
            runs.push(run);
          }
          run = [];
        }
      }
      if (run.length > 4) {
        runs.push(run);
      }
      for (const r of runs) {
        const a = r[0];
        const b = r[r.length - 1];
        const len = Math.hypot(b.x - a.x, b.z - a.z) + 0.8;
        const cx = (a.x + b.x) / 2;
        const cz = (a.z + b.z) / 2;
        const tall = 1.3 + 0.5 * own(243);
        hedge(at(cx, cz, ry), len, tall, 0.9 + 0.3 * own(244));
        for (const p of r) {
          take(p.x, p.z, 0.6);
        }
        const y = houseY(cx, cz);
        later.push(['add', 'obstacle', a.x, y + tall / 2, a.z, b.x, y + tall / 2, b.z, 0.55]);
      }
    }
  }

  /*
   * THE SHRUBS: round every house, at its back corners, along the
   * garden's edges, by the shed, a lilac or a hydrangea or a currant
   * bush wherever there is room for one, so no garden is a bare lawn
   * to its fence.
   */
  for (const h of houses.filter((b) => b.garden)) {
    const m = h.m;
    const local = (lx, lz) => new THREE.Vector3(lx, 0, lz).applyMatrix4(m);
    const hw = h.ext.hw;
    const hd = h.ext.hd;
    const ring = [];
    for (let k = 0; k < 16; k += 1) {
      const u = k / 16;
      const out = 1.6 + 3.5 * hash(h.at.x, h.at.z, 600 + k);
      /* Round the house's box and the garden behind it. */
      const lx = u < 0.5 ? -hw - out - 12 * (u / 0.5) : hw * (1 - 2 * ((u - 0.5) / 0.5)) - 2;
      const lz = (k % 2 ? 1 : -1) * (hd + out * (u < 0.5 ? 0.5 : 1));
      ring.push(local(lx, lz));
    }
    ring.forEach((p, k) => {
      if (hash(h.at.x, h.at.z, 650 + k) > 0.65) {
        return;
      }
      const s = 1.1 + 1.4 * hash(p.x, p.z, 9);
      if (!free(p.x, p.z, s * 0.5)) {
        return;
      }
      shrub(at(p.x, p.z, hash(p.x, p.z, 10) * 6), s);
      take(p.x, p.z, s * 0.5);
    });
  }

  /*
   * THE TREES. Between the houses and over their gardens, never on a
   * road, a yard or a bed: big old limes and walnuts a crown's width
   * apart, and in the gardens a pear, an apple, a plum. A tree stands
   * within a few metres of a house or not at all (the fields have their
   * own), a trunk at least three metres off any wall so its crown can
   * lean over the roof.
   */
  const houseDist = (x, z) => {
    let best = Infinity;
    for (const h of houses) {
      const m = h.m;
      const ry = Math.atan2(-m.elements[2], m.elements[0]);
      const dx = x - h.at.x;
      const dz = z - h.at.z;
      const c = Math.cos(ry);
      const s = Math.sin(ry);
      const u = Math.abs(dx * c - dz * s) - h.ext.hw;
      const v = Math.abs(dx * s + dz * c) - h.ext.hd;
      best = Math.min(best, Math.hypot(Math.max(u, 0), Math.max(v, 0)));
    }
    return best;
  };
  const STEP = 5;
  for (let z = TREE_AREA.z0; z <= TREE_AREA.z1; z += STEP) {
    for (let x = TREE_AREA.x0; x <= TREE_AREA.x1; x += STEP) {
      const px = x + (hash(x, z, 1) - 0.5) * STEP * 0.9;
      const pz = z + (hash(x, z, 2) - 0.5) * STEP * 0.9;
      const d = houseDist(px, pz);
      const pick = hash(x, z, 3);
      /* The big trees stand back in the gardens, clear of the lanes the
       * lorries and the plough use and of the open square; by them a
       * fruit tree or nothing. */
      const big = pick < 0.5 && !t.onRoads(px, pz, 9) && !t.inSquare(px, pz, 12);
      if (d < (big ? 3.2 : 2.6) || d > (big ? 15 : 10) || hash(x, z, 4) > 0.5) {
        continue;
      }
      const room = big ? 12 : 7;
      if (trees.some((q) => Math.hypot(q.x - px, q.z - pz) < Math.max(room, q.room))) {
        continue;
      }
      if (!free(px, pz, big ? 1.6 : 1.1)) {
        continue;
      }
      const s = hash(x, z, 5);
      const kind = big ? (pick < 0.32 ? 'lime' : 'walnut') : 'fruit';
      trees.push({ x: px, z: pz, kind, s, room });
      take(px, pz, big ? 1.4 : 0.9);
    }
  }
  /* Under a big tree the grass is thin in its shade and worn where the
   * bench or the swing is. */
  for (const q of trees.filter((tr) => tr.kind !== 'fruit')) {
    const r = 1.6 + 1.2 * q.s;
    const pts = [];
    for (let k = 0; k < 9; k += 1) {
      const a = (k / 9) * Math.PI * 2;
      const w = r * (0.75 + 0.5 * hash(q.x, q.z, 20 + k));
      pts.push({ x: q.x + Math.cos(a) * w, z: q.z + Math.sin(a) * w });
    }
    marks.earth.push({ pts, v: 0.35 });
  }
  return {
    trees: trees.map(({ x, z, kind, s }) => ({ x, z, kind, s })),
    cars,
    later,
    marks,
  };
}
