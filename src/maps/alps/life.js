/*
 * life.js: what moves in the valley.
 *
 * The traffic on the road and the PostAuto through the village, the
 * tractor in the field, the cars parked along the street and behind the
 * hangar, the aircraft on the apron, the windsock, and the parts that
 * live in their own files: the gondola (lift.js) and everything on legs
 * or under a canopy (fauna.js).
 *
 * Two clocks. updateAnim(stepMs) is the simulator's own: every vehicle
 * and the gondola are pure functions of it, so a replay, the title loop
 * and a capture that jumps the clock all see the same bus at the same
 * stop. updateWind(t) is the wall clock, for the sock, the cattle, the
 * hikers and the paragliders: decoration nothing can hit.
 *
 * What drives is solid. Each vehicle and each cabin carries moving boxes
 * in the colliders, the same primitive the city's train uses, so a wing
 * that meets the PostAuto meets a bus and not a picture of one. A box is
 * axis aligned and never turns, so a long vehicle is cut into roughly
 * square pieces whose boxes stay near its outline whichever way it faces.
 *
 * THE TIMETABLE, AND WHY NOBODY MEETS. Every vehicle in a lane drives at
 * the lane's one speed, so two of them can never close on each other on
 * the road. The bus leaves the southbound lane for the village and comes
 * back to it later, which would put it into the lane's traffic with a
 * different period, except that the southbound cars are given the same
 * period: each one spends the bus's detour time off stage after the lake
 * end before it appears again at the head of the valley, two and a half
 * kilometres from the strip and inside the fog. So every car in the lane
 * is a fixed number of seconds from the bus for ever. That is checked at
 * build, footprint against footprint over a whole period, rather than
 * argued, because a bus that brakes for a turn is not quite a car.
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
import { updateCelTime } from '../../render/celmat.js';
import { makeParts, bakeParts, placeParts, partsMaterial, instanced } from './parts.js';
import {
  wheelGeometry, buildCar, buildPostbus, buildTractor, buildTrailer, buildMotorbike, buildAircraft,
  CAR_COLOURS, PAINT, TRAILER_HITCH,
} from './vehicles.js';
import { makePath, makeSchedule } from './path.js';
import { makeSurface, laneAt, postbusDetour, STREET_Z } from './routes.js';
import { buildFauna } from './fauna.js';
import { buildLift } from './lift.js';
import { STRIP_W } from './terrain.js';

/* The one speed everything on the road drives at, fifty on a valley
 * road; the bus's through the village, and round the square. */
const ROAD_V = 14;
const STREET_V = 8.5;
const TURN_V = 5;
const SQUARE_V = 4;
const DWELL = 20;

/* The tractor's field, east of the road opposite the strip, and its
 * pace with a trailer of bales behind. */
const FIELD = { x: 205, z: 40, rx: 36, rz: 58 };
const TRACTOR_V = 2.4;
const HITCH = 1.7;

const M = new THREE.Matrix4();
const M2 = new THREE.Matrix4();

/*
 * The windsock: a mast, and a sock in the regulation bands, orange and
 * white, five of them tapering from the hoop at the mouth to the tail.
 * The sock hangs off a pivot at the masthead; updateWind swings it.
 */
function windsock(mastMat) {
  const g = new THREE.Group();
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 4.5, 8), mastMat);
  mast.position.y = 2.25;
  mast.castShadow = true;
  g.add(mast);
  const pivot = new THREE.Group();
  pivot.position.y = 4.5;
  const P = makeParts();
  const LEN = 1.8;
  const BANDS = 5;
  const radius = (f) => 0.28 + (0.09 - 0.28) * f;
  for (let k = 0; k < BANDS; k += 1) {
    const f0 = k / BANDS;
    const f1 = (k + 1) / BANDS;
    const band = new THREE.CylinderGeometry(radius(f0), radius(f1), LEN / BANDS, 12, 1, true);
    P.push(k % 2 === 0 ? 0xf07a1a : 0xf2f0ea, band, 0, -LEN * (f0 + f1) / 2, 0);
  }
  P.push(0x3a3d42, new THREE.TorusGeometry(0.28, 0.018, 4, 16), 0, 0, 0, 0, Math.PI / 2, 0);
  const geo = bakeParts(P);
  geo.rotateZ(-Math.PI / 2);
  const sock = new THREE.Mesh(geo, partsMaterial({ rim: 0.1, side: THREE.DoubleSide }));
  sock.castShadow = true;
  pivot.add(sock);
  g.add(pivot);
  return { group: g, pivot };
}

/*
 * A vehicle that moves: its body as one mesh and its wheels as one
 * instanced mesh whose matrices carry the spin. rolled(dist) turns the
 * wheels for a distance travelled.
 */
function mover(built, mat, wheelGeo) {
  const group = new THREE.Group();
  group.rotation.order = 'YZX';
  const body = new THREE.Mesh(bakeParts(built.parts), mat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  const wheels = instanced(wheelGeo, mat, built.wheels.length);
  group.add(wheels);
  const rolled = (dist) => {
    built.wheels.forEach((w, i) => {
      M.makeTranslation(w.x, w.r, w.z);
      M.multiply(M2.makeRotationZ(-dist / w.r));
      M.multiply(M2.makeScale(w.r, w.r, w.w));
      wheels.setMatrixAt(i, M);
    });
    wheels.instanceMatrix.needsUpdate = true;
  };
  rolled(0);
  /* The wheels only spin about their own axles, so a sphere taken off the
   * first matrices, with a margin, holds them for ever, and the draw can
   * be culled with the body instead of made on every frame wherever the
   * car is. */
  wheels.computeBoundingSphere();
  wheels.boundingSphere.radius += 0.5;
  wheels.frustumCulled = true;
  return { group, rolled, size: built.size };
}

/*
 * Moving boxes for everything that drives, and the one rule for moving
 * them. A box may only be MOVED by what its vehicle could cover since
 * the last update; a jump of the clock (title to flight, a capture that
 * seeks it) or a car reappearing at the head of the valley SEATS it,
 * with no sweep. The city's train learned why: a wrapped coordinate fed
 * to setMovingCentre is a kilometre long box sweeping the town in one
 * frame and a surface velocity the contact solver cannot survive.
 */
function makeSolids(colliders) {
  const all = [];
  let last = null;
  /* A vehicle L long and W wide, H tall, cut into n roughly square
   * pieces along its length. */
  const add = (L, W, H, vmax) => {
    const n = Math.max(1, Math.round(L / W));
    const piece = L / n;
    const half = Math.max(piece, W) / 2;
    const boxes = [];
    for (let k = 0; k < n; k += 1) {
      const i = colliders.addMoving('wall', half, H / 2, half);
      colliders.seatMoving(i, 0, -1e4, 0);
      boxes.push({ i, off: -L / 2 + piece * (k + 0.5), x: 0, y: -1e4, z: 0, nx: 0, ny: -1e4, nz: 0 });
    }
    const solid = { boxes, H, vmax };
    all.push(solid);
    return solid;
  };
  /* Where a vehicle is now: centre (x, z) of its length, ground y, yaw
   * as the path gives it. Hidden sends its boxes underground. */
  const put = (solid, x, y, z, yaw, hidden = false) => {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    for (const b of solid.boxes) {
      b.nx = x + c * b.off;
      b.ny = hidden ? -1e4 : y + solid.H / 2;
      b.nz = z - s * b.off;
    }
  };
  const commit = (tMs) => {
    const dt = last === null ? -1 : tMs - last;
    last = tMs;
    for (const solid of all) {
      const reach = solid.vmax * dt * 0.001 + 0.05;
      for (const b of solid.boxes) {
        const d = Math.hypot(b.nx - b.x, b.ny - b.y, b.nz - b.z);
        if (dt >= 0 && dt <= 250 && d <= reach) {
          colliders.setMovingCentre(b.i, b.nx, b.ny, b.nz);
        } else {
          colliders.seatMoving(b.i, b.nx, b.ny, b.nz);
        }
        b.x = b.nx;
        b.y = b.ny;
        b.z = b.nz;
      }
    }
  };
  return { add, put, commit, count: () => all.reduce((n, s) => n + s.boxes.length, 0) };
}

/*
 * Two footprints, centre (x, z), yaw, length and width, overlap? The
 * separating axis test on two rectangles: four axes, each rectangle's
 * own two.
 */
function overlaps(a, b) {
  const axes = [a.yaw, a.yaw + Math.PI / 2, b.yaw, b.yaw + Math.PI / 2];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (const th of axes) {
    const ux = Math.cos(th);
    const uz = -Math.sin(th);
    const reach = (r) => {
      const c = Math.abs(Math.cos(r.yaw - th));
      const s = Math.abs(Math.sin(r.yaw - th));
      return (c * r.L + s * r.W) / 2;
    };
    if (Math.abs(dx * ux + dz * uz) > reach(a) + reach(b)) {
      return false;
    }
  }
  return true;
}

/*
 * Build everything that moves into ctx.scene. ctx carries heightAt,
 * valleyAxis, a seeded rng, the colliders, the village materials and the
 * road ribbon. Returns the two update hooks and the counts the title
 * prints.
 */
export function buildLife(ctx) {
  const { scene, heightAt, valleyAxis, rng, colliders, mats, road } = ctx;
  /* One finish for everything with paint on it, the wing's own: a rim
   * and a hard painted highlight. */
  const paintMat = partsMaterial({ rim: 0.26, spec: 0.16, specWidth: 0.012 });
  const wheelGeo = wheelGeometry();
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const surface = makeSurface(road, heightAt, valleyAxis);
  const solids = makeSolids(colliders);

  /* Stand a group on the ground at (x, z) facing yaw, pitched to the
   * surface under its axles: the road's own chord, the bridge's ramps. */
  function settle(group, x, z, yaw, wheelbase) {
    const hx = Math.cos(yaw) * wheelbase / 2;
    const hz = -Math.sin(yaw) * wheelbase / 2;
    const front = surface(x + hx, z + hz);
    const rear = surface(x - hx, z - hz);
    group.position.set(x, (front + rear) / 2, z);
    group.rotation.y = yaw;
    group.rotation.z = Math.atan2(front - rear, wheelbase);
    return group.position.y;
  }

  /*
   * PARKED: one bake for every car that stands still, wheels and all,
   * and a wall collider each. Along the street they stand on the verge
   * nosed the way their side of the road runs: most on the south verge,
   * which the village keeps clear for them, a few on the north between
   * the telegraph poles. Two behind the hangar on the gravel, and the
   * motorbike by the hangar's side door.
   */
  /* Two bakes, the street's and the hangar's, so a camera at the strip
   * looking up the valley does not draw the street's cars behind it. */
  const streetBake = makeParts();
  const hangarBake = makeParts();
  let parked = 0;
  const park = (bake, built, x, z, yaw) => {
    const y = surface(x, z);
    for (const w of built.wheels) {
      built.parts.pushBaked(wheelGeo, w.x, w.r, w.z, 0, 0, 0, w.r, w.r, w.w);
    }
    placeParts(bake, built.parts, x, y, z, yaw);
    const c = Math.abs(Math.cos(yaw));
    const s = Math.abs(Math.sin(yaw));
    const hw = (c * built.size.L + s * built.size.W) / 2;
    const hd = (s * built.size.L + c * built.size.W) / 2;
    colliders.addBox('wall', x - hw, y, z - hd, x + hw, y + built.size.H, z + hd);
    parked += 1;
  };
  const streetCar = () => buildCar(pick(['hatch', 'hatch', 'hatch', 'estate', 'van']), pick(CAR_COLOURS));
  for (const x of [-55, -62, -80, -99, -118, -152]) {
    park(streetBake, streetCar(), x + (rng() - 0.5) * 1.5, STREET_Z + 4.3, (rng() - 0.5) * 0.06);
  }
  for (const x of [-72, -108, -142]) {
    park(streetBake, streetCar(), x + (rng() - 0.5) * 1.5, STREET_Z - 4.4, Math.PI + (rng() - 0.5) * 0.06);
  }
  park(hangarBake, buildCar('estate', PAINT.green), 63.5, -50, Math.PI / 2);
  park(hangarBake, buildCar('hatch', PAINT.white), 68.5, -49.5, Math.PI / 2 + 0.05);
  park(hangarBake, buildMotorbike(PAINT.red), 39.5, -56.3, 0.12);
  for (const [name, bake] of [['parked-street', streetBake], ['parked-hangar', hangarBake]]) {
    const mesh = new THREE.Mesh(bakeParts(bake), paintMat);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  /* THE AIRCRAFT on the apron, nose to the strip, its wing over the
   * middle pair of the hangar's tie down rings. */
  const cub = buildAircraft();
  const plane = new THREE.Mesh(cub.geometry, paintMat);
  plane.name = 'aircraft';
  plane.castShadow = true;
  plane.receiveShadow = true;
  const planeAt = { x: 19.25, z: -70 };
  plane.position.set(planeAt.x, surface(planeAt.x, planeAt.z) + 0.05, planeAt.z);
  plane.rotation.y = Math.PI;
  scene.add(plane);
  colliders.addBox('wall', planeAt.x - 3.4, plane.position.y, planeAt.z - cub.size.W / 2, planeAt.x + 5.1, plane.position.y + cub.size.H, planeAt.z + cub.size.W / 2);

  /*
   * THE BUS. Its timetable runs along one coordinate: the southbound lane
   * to where the detour leaves it, the detour, and the lane again from
   * where the detour rejoins it to the lake. The road parts are the road
   * cars' own laneAt, so on the road the bus IS a car of the lane.
   */
  const roadLen = road.dist[road.dist.length - 1];
  const detour = postbusDetour(road, valleyAxis);
  const m = detour.marks;
  const dLen = detour.path.length;
  const u0 = detour.sIn;
  const u1 = u0 + dLen;
  const uEnd = u1 + (roadLen - detour.sOut);
  const legs = [
    { to: u0, speed: ROAD_V },
    { to: u0 + m.turnIn, speed: TURN_V, ramp: true },
    { to: u0 + m.street, speed: TURN_V },
    { to: u0 + m.street + 12, speed: STREET_V, ramp: true },
    { to: u0 + m.square - 14, speed: STREET_V },
    { to: u0 + m.square, speed: SQUARE_V, ramp: true },
    { to: u0 + m.unloop, speed: SQUARE_V },
    { to: u0 + m.shelter, speed: 0, ramp: true },
    { dwell: DWELL },
    { to: u0 + m.shelter + 14, speed: STREET_V, ramp: true },
    { to: u0 + m.turnOut - 14, speed: STREET_V },
    { to: u0 + m.turnOut, speed: TURN_V, ramp: true },
    { to: u0 + m.lane, speed: TURN_V },
    { to: u1, speed: ROAD_V, ramp: true },
    { to: uEnd, speed: ROAD_V },
  ];
  const busSched = makeSchedule(legs);
  const shelterLeg = legs.findIndex((leg) => leg.dwell !== undefined);
  const busPose = (u) => {
    if (u < u0) {
      return laneAt(road, u, 1);
    }
    if (u < u1) {
      return detour.path.at(u - u0);
    }
    return laneAt(road, detour.sOut + (u - u1), 1);
  };
  const bus = mover(buildPostbus(), paintMat, wheelGeo);
  bus.group.name = 'postbus';
  scene.add(bus.group);
  const busSolid = solids.add(bus.size.L, 2.5, bus.size.H, 20);
  /* The world opens with the bus eight seconds from the shelter, so the
   * first minute at the spawn has a PostAuto at its stop. */
  const period = busSched.period;
  const busPhase = busSched.steps[shelterLeg].t0 - 8;

  /*
   * THE ROAD TRAFFIC. The southbound lane keeps the bus's period, the
   * detour's extra time spent hidden past the lake; the northbound lane
   * runs the road's own.
   */
  const roadTime = roadLen / ROAD_V;
  const south = [
    { built: buildCar('hatch', PAINT.silver), offset: 95 },
    { built: buildCar('estate', PAINT.blue), offset: 190 },
    { built: buildCar('van', PAINT.white), offset: 280 },
  ];
  const north = [
    { built: buildCar('hatch', PAINT.red), offset: 30 },
    { built: buildCar('hatch', PAINT.white), offset: 120 },
    { built: buildMotorbike(PAINT.blue), offset: 170 },
    { built: buildCar('estate', PAINT.silver), offset: 230 },
    { built: buildCar('van', PAINT.silver), offset: 300 },
  ];
  [...south, ...north].forEach((c, i) => {
    c.mover = mover(c.built, paintMat, wheelGeo);
    c.mover.group.name = `car${i}`;
    c.solid = solids.add(c.built.size.L, c.built.size.W, c.built.size.H, ROAD_V + 1);
    scene.add(c.mover.group);
  });
  const southAt = (c, t) => {
    let u = (t + c.offset) % period;
    if (u < 0) {
      u += period;
    }
    const s = u * ROAD_V;
    return s < roadLen ? { s, ...laneAt(road, s, 1) } : null;
  };
  const northAt = (c, t) => {
    let u = (t + c.offset) % roadTime;
    if (u < 0) {
      u += roadTime;
    }
    const s = u * ROAD_V;
    return { s, ...laneAt(road, roadLen - s, -1) };
  };

  /* The check the header promises: over one whole period, the bus's
   * footprint and every car's, each padded by a car length fore and aft
   * for a following gap, never overlap. Every car in the same lane is at
   * one speed and so never meets another, which the offsets being apart
   * already says. */
  const pad = (p, size) => ({ x: p.x, z: p.z, yaw: p.yaw, L: size.L + 6, W: size.W + 0.2 });
  for (let t = 0; t < period; t += 0.2) {
    const b = busSched.at(t + busPhase);
    const bp = pad(busPose(b.s), bus.size);
    for (const c of south) {
      const p = southAt(c, t);
      if (p && overlaps(bp, pad(p, c.built.size))) {
        throw new Error(`alps life: the bus meets the southbound car at ${c.offset} s, ${Math.round(t)} s in`);
      }
    }
    for (const c of north) {
      if (overlaps(bp, pad(northAt(c, t), c.built.size))) {
        throw new Error(`alps life: the bus meets the northbound car at ${c.offset} s, ${Math.round(t)} s in`);
      }
    }
  }

  /* THE TRACTOR, round the field east of the road with the hay trailer
   * behind. */
  const fieldPts = [];
  for (let k = 0; k < 48; k += 1) {
    const a = (k / 48) * Math.PI * 2;
    fieldPts.push({ x: FIELD.x + FIELD.rx * Math.cos(a), z: FIELD.z + FIELD.rz * Math.sin(a) });
  }
  const field = makePath(fieldPts, true);
  const tractor = mover(buildTractor(), paintMat, wheelGeo);
  const trailer = mover(buildTrailer(), paintMat, wheelGeo);
  tractor.group.name = 'tractor';
  trailer.group.name = 'trailer';
  scene.add(tractor.group);
  scene.add(trailer.group);
  const tractorSolid = solids.add(tractor.size.L, tractor.size.W, tractor.size.H, TRACTOR_V + 1);
  const trailerSolid = solids.add(trailer.size.L, trailer.size.W, trailer.size.H, TRACTOR_V + 1);

  const lift = buildLift({ ...ctx, solids });
  const fauna = buildFauna({ ...ctx, liftBase: lift.base });

  const sock = windsock(mats.metal);
  sock.group.position.set(STRIP_W / 2 + 6, heightAt(STRIP_W / 2 + 6, 30), 30);
  scene.add(sock.group);
  colliders.addPost('pole', STRIP_W / 2 + 6, 30, sock.group.position.y, sock.group.position.y + 4.5, 0.045);

  function updateAnim(tMs) {
    const t = tMs * 0.001;
    const b = busSched.at(t + busPhase);
    const at = busPose(b.s);
    const by = settle(bus.group, at.x, at.z, at.yaw, 5.9);
    bus.rolled(b.s);
    solids.put(busSolid, at.x, by, at.z, at.yaw);
    for (const c of south) {
      const p = southAt(c, t);
      c.mover.group.visible = p !== null;
      if (p) {
        const y = settle(c.mover.group, p.x, p.z, p.yaw, 2.6);
        c.mover.rolled(p.s);
        solids.put(c.solid, p.x, y, p.z, p.yaw);
      } else {
        solids.put(c.solid, 0, 0, 0, 0, true);
      }
    }
    for (const c of north) {
      const p = northAt(c, t);
      const y = settle(c.mover.group, p.x, p.z, p.yaw, 2.6);
      c.mover.rolled(p.s);
      solids.put(c.solid, p.x, y, p.z, p.yaw);
    }
    const s = TRACTOR_V * t;
    const tr = field.at(s);
    const ty = settle(tractor.group, tr.x, tr.z, tr.yaw, 2.15);
    tractor.rolled(s);
    solids.put(tractorSolid, tr.x, ty, tr.z, tr.yaw);
    /* The trailer's axle trails the hitch by its drawbar: place the axle
     * on the path that far back and point the trailer at the hitch. */
    const hitch = field.at(s - HITCH);
    const axle = field.at(s - HITCH - TRAILER_HITCH);
    const yaw = Math.atan2(-(hitch.z - axle.z), hitch.x - axle.x);
    const ay = settle(trailer.group, axle.x, axle.z, yaw, 1.8);
    trailer.rolled(s);
    solids.put(trailerSolid, axle.x, ay, axle.z, yaw);
    lift.update(tMs);
    solids.commit(tMs);
  }
  updateAnim(0);

  /* Wall clock decoration only: the sock swings to a valley wind that
   * blows up the valley by day, its tail drooping a little and lifting
   * with the gusts; the cattle graze, the hikers walk, the canopies
   * turn. Nothing here is solid. */
  function updateWind(t) {
    updateCelTime(t);
    sock.pivot.rotation.y = Math.PI * 0.5 + Math.sin(t * 0.31) * 0.3 + Math.sin(t * 1.7) * 0.05;
    sock.pivot.rotation.z = 0.12 + Math.sin(t * 0.57) * 0.07;
    fauna.update(t);
  }

  return {
    updateAnim,
    updateWind,
    parked,
    movers: 1 + south.length + north.length + 1,
    cattle: fauna.cattle,
    busPeriod: period,
    solids: solids.count(),
    lift,
  };
}
