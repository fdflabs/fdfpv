/*
 * lift.js: the gondola up the west wall.
 *
 * A base station on the pasture past the church, towers up the slope to
 * a top station at seven hundred metres, two cables as one closed line,
 * cabins riding it both ways on the step clock. The towers within seven
 * hundred metres of the strip are posts to the wing and the cabins are
 * moving boxes; the cable is nothing to it, on purpose: a wing that meets a fifty millimetre rope
 * at twenty metres a second is not a thing this simulator should
 * adjudicate, and a collider it cannot see would be the worst kind.
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
import { makeParts, bakeParts, instanced, box, boxUp } from './parts.js';
import { makePath } from './path.js';
import { standWalls } from './roofs.js';

const STEEL = 0x9aa0a6;
const STEEL_DARK = 0x5d6369;
const CABIN_RED = 0xc0392b;
const CABIN_ROOF = 0xf1eee6;
const GLASS = 0x27384b;

/* Cabin grip to cable: the cabin hangs this far under the rope, and the
 * ropes run this far either side of the line. */
const LATERAL = 2.6;
const SPEED = 5;
const SPACING = 130;

const M = new THREE.Matrix4();
const M2 = new THREE.Matrix4();

/* An eight seat cabin hanging from its grip at the origin: the arm,
 * the box with its glass band and white roof. CABIN is the box, for its
 * collider: its width, its height and how far its roof hangs under the
 * grip. */
const CABIN = { w: 2.0, h: 1.95, drop: 1.625 };
function cabinGeometry() {
  const P = makeParts();
  P.push(STEEL_DARK, box(0.5, 0.28, 0.24), 0, 0, 0);
  P.push(STEEL_DARK, box(0.14, 1.5, 0.14), 0, -0.85, 0);
  P.push(CABIN_RED, box(CABIN.w, CABIN.h, CABIN.w), 0, -CABIN.drop - CABIN.h / 2, 0);
  P.push(GLASS, box(2.04, 0.8, 2.04), 0, -2.35, 0);
  P.push(CABIN_ROOF, box(1.9, 0.14, 1.9), 0, -1.58, 0);
  P.push(CABIN_RED, box(0.08, 0.84, 2.06), 0, -2.35, 0);
  P.push(CABIN_RED, box(2.06, 0.84, 0.08), 0, -2.35, 0);
  return bakeParts(P);
}

/* A tower: a tapered square column, the crossarm and the sheave banks
 * under each end, standing on y = 0 with the rope at the top. */
function tower(P, x, y, z, yaw, h) {
  const col = new THREE.CylinderGeometry(0.42, 0.9, h, 4);
  col.rotateY(Math.PI / 4);
  P.push(STEEL, col, x, y + h / 2, z, yaw);
  P.push(STEEL, box(0.5, 0.4, LATERAL * 2 + 1.4), x, y + h - 0.2, z, yaw);
  for (const t of [-1, 1]) {
    const lx = 0;
    const lz = t * LATERAL;
    P.push(STEEL_DARK, box(2.2, 0.35, 0.34), x + lx * Math.cos(yaw) + lz * Math.sin(yaw), y + h - 0.6, z - lx * Math.sin(yaw) + lz * Math.cos(yaw), yaw);
  }
}

/*
 * A station, the way the valley's own are built: a concrete plinth cut
 * down to the slope, the boarding deck between the two ropes, the bull
 * wheel as a spoked ring, a gabled steel roof on four posts over both,
 * and the machine house behind the wheel, rendered, with its own slate
 * gable end on, a band of windows, the door and the company's red board
 * over it. Local +x is up the line; the top station is the same thing
 * turned round. The footprint, for the site: x from -8.5 to 6.5, z 5.5
 * either side.
 */
const FOOT = { x0: -8.5, x1: 6.5, hz: 5.5 };
const CONCRETE = 0xb3ada2;
const RENDER = 0xe6dfcf;
const SLATE = 0x45484e;
const SIGN = 0xc0392b;
const TRIM = 0xf1eee6;
function station(P, x, y, z, yaw, h, found) {
  const cx = Math.cos(yaw);
  const sx = Math.sin(yaw);
  const at = (lx, lz) => [x + lx * cx + lz * sx, z - lx * sx + lz * cx];
  const put = (colour, geo, lx, ly, lz) => {
    const p = at(lx, lz);
    P.push(colour, geo, p[0], y + ly, p[1], yaw);
  };
  const lenX = FOOT.x1 - FOOT.x0;
  put(CONCRETE, box(lenX, found + 0.3, FOOT.hz * 2), (FOOT.x0 + FOOT.x1) / 2, (0.3 - found) / 2, 0);
  const deckH = h - 5.0;
  put(CONCRETE, boxUp(9, deckH - 0.3, 3.6), 0.5, 0.3, 0);
  put(STEEL_DARK, box(9.1, 0.08, 3.7), 0.5, deckH + 0.04, 0);
  for (const t of [-1, 1]) {
    put(STEEL, box(9, 0.05, 0.05), 0.5, deckH + 1.0, t * 1.75);
    for (const lx of [-3.9, -1.2, 1.5, 4.2]) {
      put(STEEL, box(0.05, 1.0, 0.05), lx, deckH + 0.5, t * 1.75);
    }
  }
  /* The bull wheel: rim, two spokes across, the hub on its shaft. */
  const wheelY = h - 1.2;
  const rim = new THREE.TorusGeometry(LATERAL, 0.14, 6, 32);
  rim.rotateX(Math.PI / 2);
  put(STEEL_DARK, rim, 0, wheelY, 0);
  for (const a of [0, Math.PI / 2]) {
    const spoke = box(LATERAL * 2, 0.14, 0.2);
    spoke.rotateY(a + Math.PI / 4);
    put(STEEL_DARK, spoke, 0, wheelY, 0);
  }
  put(STEEL, new THREE.CylinderGeometry(0.35, 0.35, 0.6, 12), 0, wheelY, 0);
  put(STEEL, new THREE.CylinderGeometry(0.16, 0.16, 1.4, 8), 0, wheelY + 0.9, 0);
  /* The roof over wheel and deck, gabled along the line, on posts. */
  const eave = h + 0.6;
  const rise = 1.1;
  const half = 5.4;
  const pitch = Math.atan2(rise, half);
  const slabW = Math.hypot(rise, half) + 0.1;
  for (const t of [-1, 1]) {
    const slab = box(14.4, 0.18, slabW);
    slab.rotateX(t * pitch);
    put(SLATE, slab, 0, eave + rise / 2, t * half / 2);
  }
  for (const [lx, lz] of [[5.5, 4.5], [5.5, -4.5], [-3.5, 4.5], [-3.5, -4.5]]) {
    put(STEEL, boxUp(0.4, eave - 0.3, 0.4), lx, 0.3, lz);
  }
  for (const lx of [5.5, -3.5]) {
    put(STEEL, box(0.3, 0.3, 9.4), lx, eave - 0.15, 0);
  }
  /* The machine house: walls, the gable ends closed under the roof. */
  const hx = -6.5;
  const hw = 4;
  const wallH = h - 1.4;
  put(RENDER, boxUp(hw, wallH, 9), hx, 0.3, 0);
  const gRise = 1.6;
  const gable = new THREE.Shape();
  gable.moveTo(-4.5, 0);
  gable.lineTo(4.5, 0);
  gable.lineTo(0, gRise);
  gable.closePath();
  const tri = new THREE.ExtrudeGeometry(gable, { depth: hw, bevelEnabled: false });
  tri.translate(0, 0, -hw / 2);
  tri.rotateY(Math.PI / 2);
  put(RENDER, tri, hx, 0.3 + wallH, 0);
  const hPitch = Math.atan2(gRise, 4.5);
  const hSlab = Math.hypot(gRise, 4.5) + 0.5;
  for (const t of [-1, 1]) {
    const slab = box(hw + 0.8, 0.16, hSlab);
    slab.rotateX(t * hPitch);
    put(SLATE, slab, hx, 0.3 + wallH + gRise / 2 + 0.08, t * (hSlab / 2 - 0.25) * Math.cos(hPitch));
  }
  for (const t of [-1, 1]) {
    put(GLASS, box(2.8, 0.9, 0.05), hx, 0.3 + wallH - 1.6, t * 4.51);
    put(TRIM, box(3.0, 0.1, 0.07), hx, 0.3 + wallH - 2.1, t * 4.52);
  }
  const back = hx - hw / 2 - 0.02;
  put(STEEL_DARK, box(0.05, 2.3, 1.4), back, 0.3 + 1.15, 0);
  put(TRIM, box(0.06, 0.1, 1.6), back, 0.3 + 2.35, 0);
  put(SIGN, box(0.06, 0.7, 3.4), back, 0.3 + 3.0, 0);
  put(TRIM, box(0.07, 0.12, 2.8), back, 0.3 + 3.0, 0);
}

/*
 * Where the line runs and where its stations stand. The line runs from
 * the base station straight up the west wall on a fixed bearing until
 * the ground reaches TOP metres. Exported so a style that builds its
 * own stations (swiss2 bakes them with its village, before the lift is
 * built) stands them exactly where these would stand.
 */
export const STATION_H = 9;
export function liftLine(heightAt) {
  const TOP = 700;
  const base = { x: -300, z: 150 };
  /* Bearing: west with a little south, up the wall where it is a wall.
   * A real line runs up an aisle cut through the forest; this one is
   * laid where nature.js's seeded forest happens to leave seven metres
   * clear either side of it, found by sweeping the bearing against the
   * planted trees. nature.js owns the trees and does not know the line
   * is here, so a change there can put a spruce back through it. */
  const dir = new THREE.Vector2(-1, 0.1).normalize();
  const right = { x: -dir.y, z: dir.x };

  /* Walk the bearing to the top station. */
  let run = 0;
  for (; run < 3000; run += 10) {
    if (heightAt(base.x + dir.x * run, base.z + dir.y * run) >= TOP) {
      break;
    }
  }
  const top = { x: base.x + dir.x * run, z: base.z + dir.y * run };
  /* A station stands at its middle's height, a little over the mean of
   * its footprint, and its plinth is cut down to the lowest corner: on
   * the floor that is a step of a few centimetres, at the top of the wall
   * it is a station built into the slope with its uphill side buried,
   * which is how they are built, rather than one perched on a pillar the
   * height of the slope under it. flip turns the footprint round for the
   * top station. */
  const site = (d, flip) => {
    const hs = [];
    for (const lx of [FOOT.x0, 0, FOOT.x1]) {
      for (const lz of [-FOOT.hz, 0, FOOT.hz]) {
        const along = d + flip * lx;
        hs.push(heightAt(base.x + dir.x * along + right.x * lz, base.z + dir.y * along + right.z * lz));
      }
    }
    const lo = Math.min(...hs);
    const y = Math.max(hs[4], (Math.max(...hs) + lo) / 2) + 0.1;
    return { y, found: y - lo + 0.4 };
  };
  const yaw = Math.atan2(-dir.y, dir.x);
  const baseSite = site(0, 1);
  const topSite = site(run, -1);
  return {
    base, top, dir, right, run, yaw,
    stations: [
      { x: base.x, y: baseSite.y, z: base.z, yaw, found: baseSite.found },
      { x: top.x, y: topSite.y, z: top.z, yaw: yaw + Math.PI, found: topSite.found },
    ],
  };
}

/*
 * Build the lift into ctx.scene: the line liftLine lays, towers every
 * span along it as tall as the rope needs to clear the ground between
 * them. Returns the step clock update and what the stats print.
 */
export function buildLift(ctx) {
  const { scene, heightAt, colliders, solids, look } = ctx;
  const mat = look.parts('lift', { rim: 0.2, spec: 0.1, specWidth: 0.012 });
  const CLEAR = 9;
  const SPAN = 150;
  const { base, top, dir, right, run, yaw, stations } = liftLine(heightAt);
  const groundAt = (d) => heightAt(base.x + dir.x * d, base.z + dir.y * d);
  const [baseSite, topSite] = stations;
  const baseY = baseSite.y;
  const topY = topSite.y;

  /* Towers at fixed spacing, each 14 m to start, then raised until every
   * rope segment clears the ground between its ends. A rope is straight
   * between towers here; the sag on a hundred and fifty metre span is
   * under a metre and not worth a curve. */
  const towers = [];
  for (let d = SPAN; d < run - SPAN * 0.6; d += SPAN) {
    towers.push({ d, h: 14 });
  }
  const nodes = () => [{ d: 0, y: baseY + STATION_H - 1.2 }, ...towers.map((t) => ({ d: t.d, y: groundAt(t.d) + t.h - 0.45 })), { d: run, y: topY + STATION_H - 1.2 }];
  for (let pass = 0; pass < 40; pass += 1) {
    let raised = false;
    const n = nodes();
    for (let i = 1; i < n.length; i += 1) {
      const a = n[i - 1];
      const b = n[i];
      for (let d = a.d; d <= b.d; d += 5) {
        const ropeY = a.y + (b.y - a.y) * ((d - a.d) / (b.d - a.d));
        const need = groundAt(d) + CLEAR - ropeY;
        if (need > 0) {
          const near = towers.find((t) => t.d === a.d);
          const far = towers.find((t) => t.d === b.d);
          if (near) {
            near.h += need;
          }
          if (far) {
            far.h += need;
          }
          raised = true;
          break;
        }
      }
    }
    if (!raised) {
      break;
    }
  }

  /* The structures, one bake. */
  const P = makeParts();
  /* A style may build the stations itself (swiss2 bakes them with its
   * village, src/maps/swiss2/buildings/station.js) on liftLine's sites
   * and inside FOOT, so the collider below is theirs too; the cel look
   * has no station of its own and builds these, as it always has. */
  if (!look.buildings?.station) {
    for (const s of stations) {
      station(P, s.x, s.y, s.z, s.yaw, STATION_H, s.found);
    }
  }
  /* The base station's keep out box, or, where the style baked the
   * station with a roof, the walls under that roof (roofs.js): the roof
   * itself is ground a craft can land on. */
  const baseBox = [base.x - 8.5, baseY - baseSite.found, base.z - 8.5, base.x + 8.5, baseY + STATION_H + 1.8, base.z + 8.5];
  const baseRoofs = (ctx.roofs ?? []).filter((r) => r.tx > baseBox[0] && r.tx < baseBox[3] && r.tz > baseBox[2] && r.tz < baseBox[5]);
  standWalls(colliders, baseBox, baseRoofs, ctx.villageY);
  for (const t of towers) {
    const x = base.x + dir.x * t.d;
    const z = base.z + dir.y * t.d;
    const y = groundAt(t.d);
    tower(P, x, y, z, yaw, t.h);
    if (Math.hypot(x, z) < 700) {
      colliders.addPost('pole', x, z, y, y + t.h, 0.9);
    }
  }
  const structures = new THREE.Mesh(bakeParts(P), mat);
  structures.castShadow = true;
  structures.receiveShadow = true;
  scene.add(structures);

  /* The rope: up on the right of the bearing, round the top wheel, down
   * on the left, round the bottom wheel. One closed line. */
  const n = nodes();
  const ropePts = [];
  const side = (node, s) => ({ x: base.x + dir.x * node.d + right.x * s, y: node.y, z: base.z + dir.y * node.d + right.z * s });
  for (const node of n) {
    ropePts.push(side(node, LATERAL));
  }
  const wheel = (centre, y, a0, a1) => {
    for (let k = 1; k < 8; k += 1) {
      const a = a0 + (a1 - a0) * (k / 8);
      ropePts.push({ x: centre.x + Math.cos(a) * LATERAL, y, z: centre.z + Math.sin(a) * LATERAL });
    }
  };
  const rightAngle = Math.atan2(right.z, right.x);
  wheel(top, n[n.length - 1].y, rightAngle, rightAngle - Math.PI);
  for (let i = n.length - 1; i >= 0; i -= 1) {
    ropePts.push(side(n[i], -LATERAL));
  }
  wheel(base, n[0].y, rightAngle + Math.PI, rightAngle);
  const rope = makePath(ropePts, true);
  const ropeGeo = new THREE.BufferGeometry().setFromPoints(rope.points.map((p) => new THREE.Vector3(p.x, p.y, p.z)));
  const ropeMesh = new THREE.Line(ropeGeo, new THREE.LineBasicMaterial({ color: 0x33363a }));
  ropeMesh.frustumCulled = false;
  scene.add(ropeMesh);

  /* The cabins, spaced round the loop, riding it at SPEED. */
  const count = Math.floor(rope.length / SPACING);
  const cabins = instanced(cabinGeometry(), mat, count);
  cabins.name = 'cabins';
  scene.add(cabins);
  const cabinSolids = [];
  for (let i = 0; i < count; i += 1) {
    cabinSolids.push(solids.add(CABIN.w, CABIN.w, CABIN.h, SPEED + 1));
  }
  function update(tMs) {
    const t = tMs * 0.001;
    for (let i = 0; i < count; i += 1) {
      const at = rope.at(i * SPACING + SPEED * t);
      M.makeTranslation(at.x, at.y, at.z);
      M.multiply(M2.makeRotationY(at.yaw));
      cabins.setMatrixAt(i, M);
      solids.put(cabinSolids[i], at.x, at.y - CABIN.drop - CABIN.h, at.z, at.yaw);
    }
    cabins.instanceMatrix.needsUpdate = true;
  }
  update(0);
  return {
    update, base: { x: base.x, z: base.z, yaw }, topAt: { x: top.x, y: topY, z: top.z }, towers: towers.length, cabins: count, top: Math.round(topY), length: Math.round(run),
  };
}
