/*
 * village.js: the road, the street and what stands along them.
 *
 * A main street off the valley road, over the stream on a stone bridge,
 * west to a square with a fountain, the Gasthof, the bakery and the
 * church behind its graveyard wall. Chalets front the street at their
 * own setbacks and angles, two lanes run off it, three farms stand out
 * in the fields with their barns and yards, the pastures are fenced,
 * telegraph poles follow the road, and the hangar with its apron and
 * fuel pump sits across the strip with cones down the strip's edges.
 * All of it from kit.js, baked into one mesh per material. Returns the
 * road so the traffic can drive it.
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
  villageMaterials, makeBake, bakeAll, frame,
  chalet, barn, farmhouse, gasthof, shop, church, hangar, bridge, fountain, bench, busShelter,
  roadSign, telegraphPole, cone, fence,
} from './kit.js';
import { ribbon } from './ribbon.js';
import { STRIP_L, STRIP_W, STRIP_Y } from './terrain.js';

export { villageMaterials };

/* The street's line down the valley floor, and the square it ends in. */
const STREET_Z = 115;
const SQUARE = { x: -190, z: 115, w: 34, d: 30 };

/* Where the stream runs, as nature.js lays it (its `side` term is zero
 * this far down the valley). The bridge and the fences need it. */
function streamX(valleyAxis, z) {
  return valleyAxis(z) - 95 - 30 * Math.sin(z / 260);
}

/*
 * The chalet variants the village is drawn from. They differ in plan,
 * height, roof, boarding, base and balconies; the placer jitters the
 * plan a little and picks the shutters.
 */
const CHALETS = [
  { w: 9.5, d: 13, floors: 2, roof: 'gable', board: 'larchDark', base: 'stone', balconies: 'one', roofKey: 'shingle' },
  { w: 10, d: 14, floors: 1, roof: 'halfhip', board: 'larch', base: 'stone', balconies: 'both', roofKey: 'shingle' },
  { w: 9, d: 12, floors: 2, roof: 'halfhip', board: 'honey', base: 'render', balconies: 'one', roofKey: 'slate', shutter: 'shutterRed' },
  { w: 8.5, d: 11, floors: 1, roof: 'gable', board: 'weathered', base: 'stone', balconies: 'one', roofKey: 'slate', shutter: 'shutterRed' },
  { w: 10.5, d: 12, floors: 2, roof: 'hip', board: 'larch', base: 'render', balconies: 'both', roofKey: 'slate', ov: 1.2 },
  { w: 8, d: 10, floors: 1, roof: 'gable', board: 'larchDark', base: 'render', balconies: 'one', roofKey: 'shingle', pitch: 0.5 },
  { w: 11, d: 15, floors: 2, roof: 'gable', board: 'honey', base: 'stone', balconies: 'both', roofKey: 'shingle' },
  { w: 9, d: 12.5, floors: 1, roof: 'halfhip', board: 'weathered', base: 'stone', balconies: 'one', roofKey: 'shingle' },
];

/*
 * Build the village into ctx.scene. ctx carries heightAt, valleyAxis, a
 * seeded rng of its own, the colliders, the materials and the progress
 * hook. Returns the road ribbon, the village's ground height, the baked
 * group and the house count.
 */
export async function buildVillage(ctx) {
  const { scene, heightAt, valleyAxis, rng, colliders, mats } = ctx;
  const bake = makeBake();
  const villageY = heightAt(-90, STREET_Z);
  const onGround = (x, z) => heightAt(x, z) - villageY;
  let houses = 0;

  /*
   * Placing: a building is authored on flat ground, so the placer reads
   * the ground under its four corners, stands it on the highest and cuts
   * the foundation down to the lowest. The collider is the axis aligned
   * box round the rotated footprint, from the foundation to the ridge.
   */
  const corners = (x, z, ry, hw, hd) => {
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    return [[hw, hd], [hw, -hd], [-hw, hd], [-hw, -hd]].map(([lx, lz]) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c }));
  };
  const site = (x, z, ry, hw, hd) => {
    const pts = [...corners(x, z, ry, hw, hd), { x, z }].map((p) => heightAt(p.x, p.z));
    const top = Math.max(...pts);
    return { y: top - villageY, found: top - Math.min(...pts) + 0.4 };
  };
  const wallBox = (x, z, ry, hw, hd, y, found, top) => {
    const pts = corners(x, z, ry, hw, hd);
    const xs = pts.map((p) => p.x);
    const zs = pts.map((p) => p.z);
    colliders.addBox('wall', Math.min(...xs), villageY + y - found, Math.min(...zs), Math.max(...xs), villageY + y + top, Math.max(...zs));
  };
  /* Stand a builder at (x, z) facing ry. hw and hd are the footprint the
   * site is read under; the builder's own extents make the collider. */
  const place = (build, x, z, ry, hw, hd) => {
    const { y, found } = site(x, z, ry, hw, hd);
    const f = frame(bake, x, y, z, ry);
    const ext = build(f, found);
    wallBox(x, z, ry, ext.hw, ext.hd, y, found, ext.top);
    return { f, ext, y, found };
  };
  const placeChalet = (spec, x, z, ry) => {
    const s = { ...spec, w: spec.w + (rng() - 0.5), d: spec.d + (rng() - 0.5) * 1.5 };
    if (!s.shutter) {
      s.shutter = rng() < 0.7 ? 'shutterGreen' : 'shutterRed';
    }
    place((f, found) => chalet(f, rng, { ...s, found }), x, z, ry, s.w / 2 + 1.3, s.d / 2 + 1.2);
    houses += 1;
    return s;
  };

  /*
   * THE ROAD, down the east side of the floor from the head of the valley
   * to the lake shore, two lanes of asphalt with a painted centre line,
   * following the valley's own axis. Telegraph poles keep it company.
   */
  const roadPts = [];
  for (let z = -2700; z <= 1950; z += 50) {
    roadPts.push({ x: valleyAxis(z) + 55, z });
  }
  const road = ribbon(roadPts, 6.5, 0.06, heightAt, mats.asphalt);
  scene.add(road.mesh);
  scene.add(ribbon(roadPts, 0.18, 0.09, heightAt, mats.paint).mesh);
  const pole = (x, z) => {
    telegraphPole(frame(bake, x, onGround(x, z), z, 0));
    colliders.addPost('pole', x, z, heightAt(x, z), heightAt(x, z) + 7.7, 0.15);
  };
  for (let z = -2650; z <= 1900; z += 45) {
    pole(valleyAxis(z) + 55 + 4.6, z);
  }

  /*
   * THE STREET, west off the road at z 115, over the stream on a stone
   * bridge and on to the square. It is laid in two ribbons so the bridge
   * can hump between them; the ramps' toes meet the ribbons' ends.
   */
  const bx = streamX(valleyAxis, STREET_Z);
  const streetRun = (x0, x1) => {
    const pts = [];
    const n = Math.max(1, Math.round(Math.abs(x1 - x0) / 10));
    for (let k = 0; k <= n; k += 1) {
      pts.push({ x: x0 + (x1 - x0) * (k / n), z: STREET_Z });
    }
    scene.add(ribbon(pts, 5, 0.06, heightAt, mats.asphalt).mesh);
  };
  const roadX = valleyAxis(STREET_Z) + 55;
  const squareEast = SQUARE.x + SQUARE.w / 2;
  const span = place((f) => bridge(f, { span: 5 }), bx, STREET_Z, 0, 6, 3);
  streetRun(roadX, bx + span.ext.hw + 0.1);
  streetRun(bx - span.ext.hw - 0.1, squareEast + 0.1);
  /* No pole near the bridge, and none within forty metres of the
   * strip's centreline: the street is under the approach. */
  for (let x = 120; x >= -160; x -= 35) {
    if (Math.abs(x - bx) > 6 && Math.abs(x) > 40) {
      pole(x, STREET_Z - 4.5);
    }
  }
  /* The village's name at the junction, the limit a little in, and the
   * name again on the road for traffic coming up from the lake. */
  const sign = (x, z, ry, kind) => {
    roadSign(frame(bake, x, onGround(x, z), z, ry), kind);
    colliders.addPost('pole', x, z, heightAt(x, z), heightAt(x, z) + 2.6, 0.05);
  };
  sign(roadX - 6, STREET_Z - 4, Math.PI / 2, 'place');
  sign(roadX - 22, STREET_Z - 4, Math.PI / 2, 'limit');
  sign(roadX + 4.6, STREET_Z + 60, 0, 'place');

  /*
   * THE SQUARE: cobbles, the fountain in the middle, benches round it,
   * the bus shelter where the street comes in, the Gasthof on the north
   * side facing the square, the bakery on the south, and the church to
   * the west behind its graveyard wall, tower to the square.
   */
  bake.push('cobble', new THREE.BoxGeometry(SQUARE.w, 0.06, SQUARE.d), SQUARE.x, onGround(SQUARE.x, SQUARE.z) + 0.03, SQUARE.z);
  place((f) => fountain(f), SQUARE.x + 2, SQUARE.z, 0, 2.6, 2.6);
  for (const [dx, dz, ry] of [[-6, -6, -Math.PI / 4], [-6, 6, -3 * Math.PI / 4], [8, -6, Math.PI / 4], [8, 6, 3 * Math.PI / 4]]) {
    bench(frame(bake, SQUARE.x + 2 + dx, onGround(SQUARE.x, SQUARE.z) + 0.06, SQUARE.z + dz, ry));
  }
  place((f) => busShelter(f), squareEast + 7, STREET_Z + 6.5, Math.PI, 2.4, 1.3);
  place((f, found) => gasthof(f, rng, { found }), SQUARE.x, SQUARE.z - 23, -Math.PI / 2, 7.5, 8.5);
  place((f, found) => shop(f, rng, { found }), SQUARE.x + 4, SQUARE.z + 23, Math.PI / 2, 5.5, 5);
  houses += 2;
  {
    const x = SQUARE.x - 42;
    const { y, found } = site(x, STREET_Z, Math.PI / 2, 12, 11);
    const f = frame(bake, x, y, STREET_Z, Math.PI / 2);
    const k = church(f, { found });
    wallBox(x, STREET_Z, Math.PI / 2, k.hw + 0.6, k.hd + 0.5, y, found, k.top);
    const t = f.at(0, 0, k.tower.z);
    colliders.addBox('wall', t.x - k.tower.half, villageY + y, t.z - k.tower.half, t.x + k.tower.half, villageY + y + k.tower.top, t.z + k.tower.half);
  }

  /*
   * THE STREET'S HOUSES. Each side is walked west from the bridge with a
   * cursor; a house is picked, stood eaves to the street or gable to it,
   * set back its own few metres and turned a few degrees, and the cursor
   * moves on past it by a gap that is never the same twice. The south
   * verge keeps a strip clear for the cars life.js parks along it.
   */
  const LANE_N = -100;
  const LANE_S = -140;
  const walk = (side) => {
    let cursor = bx - 16;
    const stop = squareEast + 12;
    const laneX = side > 0 ? LANE_S : LANE_N;
    let k = 0;
    while (cursor > stop + 8) {
      const spec = CHALETS[(k * 3 + (side > 0 ? 1 : 0)) % CHALETS.length];
      const gableOn = k % 3 === 2;
      const along = gableOn ? spec.w + 2.6 : spec.d + 2.4;
      if (cursor - along < stop) {
        break;
      }
      /* Leave the lane's mouth open. */
      if (cursor > laneX - 7 && cursor - along < laneX + 7) {
        cursor = laneX - 7;
        continue;
      }
      const setback = 1 + rng() * 3.5;
      const x = cursor - along / 2;
      const across = gableOn ? spec.d / 2 + 1.2 : spec.w / 2 + 1.6;
      const front = side > 0 ? STREET_Z + 9.5 + setback : STREET_Z - 7 - setback;
      const z = front + side * across;
      const turn = (rng() - 0.5) * 0.16;
      let ry;
      if (gableOn) {
        ry = (k % 2 === 0 ? 0 : Math.PI) + turn;
      } else {
        ry = (side > 0 ? Math.PI / 2 : -Math.PI / 2) + turn;
      }
      placeChalet(spec, x, z, ry);
      cursor -= along + 3 + rng() * 4;
      k += 1;
    }
  };
  walk(1);
  walk(-1);

  /*
   * THE LANES: one north off the street, one south, gravel, with houses
   * facing them on both sides. The north lane's houses stand behind the
   * street's north row; the south lane's behind its south row.
   */
  const lane = (x, z0, z1) => {
    const pts = [];
    const n = Math.round(Math.abs(z1 - z0) / 10);
    for (let k = 0; k <= n; k += 1) {
      pts.push({ x, z: z0 + (z1 - z0) * (k / n) });
    }
    scene.add(ribbon(pts, 3.5, 0.05, heightAt, mats.gravel).mesh);
  };
  const laneHouses = (lx, zFrom, zTo, seed) => {
    const dir = Math.sign(zTo - zFrom);
    for (const side of [-1, 1]) {
      let cursor = zFrom;
      let k = seed;
      while (Math.abs(zTo - cursor) > 14) {
        const spec = CHALETS[(k * 5 + (side > 0 ? 2 : 0)) % CHALETS.length];
        const along = spec.d + 2.4;
        if (Math.abs(zTo - cursor) < along) {
          break;
        }
        const setback = 1.5 + rng() * 3;
        const z = cursor + dir * along / 2;
        const x = lx + side * (2.2 + setback + spec.w / 2 + 1.6);
        const turn = (rng() - 0.5) * 0.16;
        placeChalet(spec, x, z, (side > 0 ? Math.PI : 0) + turn);
        cursor += dir * (along + 3 + rng() * 4);
        k += 1;
      }
    }
  };
  lane(LANE_N, STREET_Z - 3, 40);
  laneHouses(LANE_N, STREET_Z - 26, 38, 2);
  lane(LANE_S, STREET_Z + 3, 195);
  laneHouses(LANE_S, STREET_Z + 33, 195, 4);

  /*
   * THE FARMS, out in the fields: a farmhouse with its barn under one
   * ridge, a second barn, a fenced yard open toward the track. One north
   * west on the plateau's edge, one south west on the rising floor, one
   * east of the road up the valley. Their tracks are gravel.
   */
  const yardFence = (x, z, half, gapAt) => {
    const pts = [[-half, -half], [half, -half], [half, half], [-half, half]];
    for (let k = 0; k < 4; k += 1) {
      if (k === gapAt) {
        continue;
      }
      const a = pts[k];
      const b = pts[(k + 1) % 4];
      fence(bake, onGround, x + a[0], z + a[1], x + b[0], z + b[1]);
    }
  };
  const farm = ({ x, z, ry, barnKind, barnAt, board, gap }) => {
    place((f, found) => farmhouse(f, rng, { found, board }), x, z, ry, 7, 15);
    houses += 1;
    const b = barnAt;
    place((f, found) => barn(f, { kind: barnKind, found, w: 10, d: 14 }), x + b.dx, z + b.dz, b.ry, 6, 8);
    yardFence(x + b.dx / 2, z + b.dz / 2, 34, gap);
  };
  farm({ x: -275, z: -175, ry: 0.5, barnKind: 'hay', barnAt: { dx: 26, dz: 14, ry: 2.1 }, board: 'larch', gap: 2 });
  farm({ x: -318, z: 300, ry: -2.0, barnKind: 'stall', barnAt: { dx: 22, dz: -22, ry: -0.4 }, board: 'larchDark', gap: 0 });
  const eastX = valleyAxis(450) + 55;
  farm({ x: eastX + 50, z: 455, ry: Math.PI / 2 + 0.3, barnKind: 'hay', barnAt: { dx: 20, dz: 26, ry: 1.2 }, board: 'honey', gap: 3 });
  const track = (pts) => scene.add(ribbon(pts, 3.2, 0.05, heightAt, mats.gravel).mesh);
  track([{ x: -258, z: -160 }, { x: -230, z: -120 }, { x: -170, z: -40 }, { x: -120, z: 20 }, { x: -100, z: 38 }]);
  track([{ x: -302, z: 282 }, { x: -284, z: 222 }, { x: -262, z: 170 }, { x: -215, z: 135 }, { x: SQUARE.x - SQUARE.w / 2 + 1, z: SQUARE.z + SQUARE.d / 2 - 2 }]);
  track([{ x: eastX + 3, z: 470 }, { x: eastX + 22, z: 468 }, { x: eastX + 40, z: 460 }]);

  /*
   * THE PASTURES: fence lines round the fields the cattle stand in, with
   * a gap where the stream runs through, and a barn in each. Fences and
   * cattle stand on the real ground, so they carry their own height and
   * the bake's shared height is taken back off them.
   */
  const nearStream = (x, z) => Math.abs(x - streamX(valleyAxis, z)) < 3.6;
  const ring = (pts) => {
    for (let k = 0; k < pts.length; k += 1) {
      const a = pts[k];
      const b = pts[(k + 1) % pts.length];
      fence(bake, onGround, a[0], a[1], b[0], b[1], nearStream);
    }
  };
  ring([[-40, 195], [-255, 205], [-262, 335], [-30, 325]]);
  ring([[-10, -145], [-232, -155], [-242, -295], [-20, -300]]);
  place((f, found) => barn(f, { kind: 'hay', found, w: 11, d: 15 }), -150, 245, 0.3, 7, 9);
  place((f, found) => barn(f, { kind: 'stall', found, w: 10, d: 16 }), -60, -195, -0.2, 6, 9);
  await ctx.paint(0.62);

  /*
   * THE STRIP'S FURNITURE: the hangar across from it with the door to
   * the apron and the apron to the grass, gravel where the cars park
   * behind it, cones down both edges of the strip and a threshold bar
   * painted at each end. The strip itself is alps.js's plane.
   */
  place((f, found) => hangar(f, { found }), 44, -70, -Math.PI / 2, 15, 12);
  bake.push('gravel', new THREE.BoxGeometry(12, 0.06, 16), 66, onGround(66, -49) + 0.03, -49);
  const ground = frame(bake, 0, 0, 0, 0);
  for (let z = -STRIP_L / 2; z <= STRIP_L / 2; z += 20) {
    for (const side of [-1, 1]) {
      const x = side * (STRIP_W / 2 + 2);
      cone(ground, x, z);
    }
  }
  for (const [x, z] of [[8, -88], [8, -52], [28, -88], [28, -52]]) {
    cone(ground, x, z);
  }
  for (const end of [-1, 1]) {
    bake.push('paint', new THREE.BoxGeometry(STRIP_W - 2, 0.03, 0.6), 0, STRIP_Y - villageY + 0.035, end * (STRIP_L / 2 - 2));
  }

  const villageGroup = bakeAll(bake, mats);
  villageGroup.position.y = villageY;
  scene.add(villageGroup);
  await ctx.paint(0.7);

  return { road, villageY, group: villageGroup, houses, onGround };
}
