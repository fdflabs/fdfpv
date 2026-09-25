/*
 * roof-check.js: a roof is ground you can skid on, and its walls are walls,
 * on every kind of building every map draws.
 *
 *     node scripts/roof-check.js [--map=swiss2] [--airframe=cub1400]
 *                                [--kinds=house,hut,...] [--roof=0]
 *                                [--only=ramp,dive,wall,gable,slope,quad]
 *     node scripts/roof-check.js --map=swiss2 --sweep
 *     node scripts/roof-check.js --map=swiss2 --audit
 *     SIM_GPU=1 node scripts/roof-check.js --shots=DIR
 *
 * The owner's report: "buildings' roofs don't seem to work: when I approach
 * them the airplane crashes." Every scenario is thrown through
 * window.__crashThrow at one real roof of the map of each kind of building
 * (window.__roofs: a village house, a barn's lean-to, a hut, a boathouse, a
 * gondola station, a city roof...), with the run's crash damage on, and
 * flown by the shell as a pilot's flight is:
 *
 *   ramp   up the roof's slope at 7 degrees under its pitch, level with
 *          it (steeper on a roof too short to close on at 7), the roof
 *          as a ramp: the aircraft must touch the roof
 *          (window.__ground().contactSteps, the steps with the hull or a
 *          wheel on the ground, grows over it), skid or bounce off it,
 *          break nothing while on or over it, touch no wall, and fly on
 *          off the far eave (what it meets after that is not the roof's).
 *   dive   straight into the same slope 50 degrees nose down: a wreck.
 *   wall   level into the eave wall a metre and a half under the eaves:
 *          the shell's sweep meets a `wall`, and the plane does not get
 *          into the house.
 *   gable  level into the gable end above the plate: a `wall` there too,
 *          and nothing gets past the gable's face into the attic.
 *   slope  level into the side of the roof halfway up it: whatever the
 *          crash physics makes of it, the plane never gets under the roof.
 *   quad   a five inch let down square onto the slope at 0.8 m/s, motors
 *          idle: it comes down on the roof and stays on it, never through
 *          it, and nothing breaks.
 *
 *   skid   along a lean-to, square to its fall, down onto it at 4 degrees:
 *          judged as a ramp is, along the roof's length (a lean-to rises
 *          into the wall it leans on, so it is not ramped up).
 *
 * A kind flies the scenarios that mean something for it (KINDS below): a
 * roof on posts (a lean-to, the bus shelter, a woodshed) has no wall to fly
 * into, a spire no slope to ramp, a flat roof no gable. The roof flown at
 * is the first of its kind whose approaches are clear of every other
 * building (CLEAR), so what a flight meets is that building's. The first five fly
 * the airframe named (the Skyhunter by default); the last is always the five
 * inch, through the same ground contact. Whether a ramp touch breaks
 * something is the crash physics' call and depends on the aircraft: a
 * tractor prop level with the roof strikes it, as it strikes the airfield's
 * grass on the same approach. The Skyhunter, a pusher with no gear, is an
 * aircraft this approach does not break; the Cub, a tractor on a tail
 * dragger's gear, ramps the village houses unbroken (the round that proved
 * roofs flew it on swiss2) and chips its prop on the small roofs. Exit 0
 * when every scenario passes and the page logged no error, 1 otherwise.
 *
 * --sweep is the flythrough: every building the map records, walls or not,
 * swept through from every side at wall height and at attic height, and
 * dived onto, by the shell's own obstacle query (window.__hit, after the
 * roofs' cover from where the craft is, window.__cover) and ground
 * (window.__surface), in 5 cm steps. A sweep is stopped where the query
 * meets a solid or where the ground under it rises to it (the plant lifts a
 * craft up any ground within its step, a roof included); it FAILS if it
 * reaches a point inside the building, within its walls and under its roof,
 * first. A roof on posts is only dived onto and skimmed. Exit 1 on any.
 *
 * --audit lays every roof against its drawing: at points over each roof,
 * the drawn surface nearest the recorded one, found by a ray down through
 * the scene's meshes. It says whether the ground a craft is given is the
 * roof on screen. Exit 1 when a roof is off its drawing by more than
 * AUDIT_TOL at most of its points.
 *
 * --shots=DIR leaves a few frames of each scenario from a fixed camera
 * beside the roof. Pictures are evidence for one look (CLAUDE.md): delete
 * them after. They want SIM_GPU=1; the software rasteriser draws two
 * frames a second.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const MAP = arg('map', 'swiss2');
const AIRFRAME = arg('airframe', 'sky1800');
const ROOF = Number(arg('roof', 0));
const SHOTS = arg('shots', null);
const ONLY = arg('only', 'ramp,skid,dive,wall,gable,slope,quad').split(',');
const WANT_KINDS = arg('kinds', null);
/* Fly these at every kind named, whatever the kind flies by default. */
const FLY = arg('fly', null);
const SPEED = 14;
const FLY_MS = 4000;
/* Metres a recorded roof may sit off its drawing. A shell's top is its
 * courses and battens; a hundred and fifty millimetres is two of them. */
const AUDIT_TOL = 0.15;

/*
 * What each kind of building flies. `min` is the least half width of wall
 * a roof of the kind is chosen with, so the scenarios have room; a village
 * house keeps the round that proved roofs (a gable of shingle or slate at
 * least 3.5 m across the ridge).
 */
const CLOSED = ['ramp', 'dive', 'wall', 'gable', 'slope', 'quad'];
const OPEN = ['ramp', 'dive', 'quad'];
/* A lean-to rises into the barn it leans on: skidded along, not ramped. */
const LEAN = ['skid', 'dive', 'quad'];
const KINDS = {
  house: { fly: CLOSED, min: 3.5, key: /^(shingle|slate)/ },
  /* A five inch set down on a hut roofed in tin (mu 0.35), or on one
   * steeper than 28 degrees, slides off its eave and breaks on the ground
   * three metres down, as it would: flown at the shingle and slate ones
   * no steeper than the village house the round that proved roofs flew. */
  hut: { fly: CLOSED, min: 1.8, key: /^(shingle|slate)/, maxPitch: 28.7 },
  boathouse: { fly: CLOSED, min: 2 },
  lakeHouse: { fly: CLOSED, min: 3 },
  /* The lake church's nave roof is 46 degrees: too steep to ramp, and a
   * five inch set down on it slides off it, as it would. */
  church: { fly: ['dive', 'wall', 'gable', 'slope'], min: 3 },
  station: { fly: CLOSED, min: 3 },
  /* A garage's roof is 2 m of slope at 12.6 degrees: to clear its eaves
   * the ramp closes at 13 degrees, and whether that touch breaks the
   * Skyhunter flips with the frame's timing (two runs, one each way), so
   * it is not ramped. */
  garage: { fly: ['dive', 'wall', 'gable', 'slope', 'quad'], min: 1.5 },
  /* A garden shed is 2.4 m across its ridge at 35 degrees: a plane is
   * over it before it can climb onto it, so it is not ramped. */
  shed: { fly: ['dive', 'wall', 'gable', 'slope', 'quad'], min: 1 },
  cityRoof: { fly: CLOSED, min: 2.5 },
  /* The race field's pavilion (map custom), and its verandah, which falls
   * toward the field off the front wall as a lean-to does. A skid along
   * the verandah's 53 m slides the Skyhunter to a stop on it and knocks
   * its camera at the first touch at 5.6 degrees (the crash physics'
   * call), so it is dived onto and a quad set down on it. */
  clubhouse: { fly: CLOSED, min: 2.5 },
  verandah: { fly: ['dive', 'quad'], min: 1 },
  kiosk: { fly: ['dive', 'wall', 'quad'], min: 1.5 },
  /* The bus shelter's roof falls three degrees: a ramp is a skim. */
  spire: { fly: ['dive', 'wall', 'slope'], min: 1 },
  dormer: { fly: ['dive', 'quad'], min: 0.5 },
  leanTo: { fly: LEAN, min: 1 },
  shelter: { fly: OPEN, min: 1, flat: true },
  /* A woodshed's tin is 2.6 m of run: not ramped, as a shed is not. */
  woodshed: { fly: ['dive', 'quad'], min: 0.8 },
};

function seed(airframe) {
  const settings = {
    ...seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, airframe),
    airframeAsked: true, map: MAP, graphics: 'low', graphicsAuto: false, crashDamage: true, sound: false,
  };
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(settings)});
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.airhint.v2', '1');
  } catch (e) { /* Storage refused; the run boots on its defaults. */ }`];
}

/*
 * Page side: the roof of a kind, its frame and pitch. The roof's own x
 * runs across the ridge, world (c, -s); `T(lx)` is the roof's top on the
 * ridge's normal line, off the map's own contact surface. A kind that
 * ramps wants a slope a plane can climb, 8 to 40 degrees, or flat.
 */
const PICK = (kind, spec) => `(() => {
  const spec = ${JSON.stringify({ ...spec, key: spec.key ? spec.key.source : null })};
  const key = spec.key ? new RegExp(spec.key) : null;
  const ramps = spec.fly.includes('ramp');
  const all = window.__roofs().filter((r) => (r.kind || 'house') === ${JSON.stringify(kind)}
    && (r.open || r.solids.length) && r.hw >= spec.min && (!key || key.test(r.key)));
  const pitchOf = (R) => {
    const T = (lx) => window.__surface(R.x + R.c * lx, R.z - R.s * lx, 1e9);
    return Math.atan((T(R.hw * 0.25) - T(R.hw * 0.75)) / (R.hw * 0.5)) * 180 / Math.PI;
  };
  const fit = ramps ? all.filter((R) => { const p = pitchOf(R); return p > (spec.flat ? -1 : 8) && p < (spec.maxPitch ?? 40); }) : all;
  return fit.slice(0, 200);
})()`;

/*
 * Page side: whether the line a throw starts down is clear of everything
 * but the roof's own building for DIST metres, so what the flight meets
 * is the roof's and not a neighbour's (a garden shed stands between a
 * house and its fence). What the line meets of the building itself is
 * not looked at, nor of every roof that touches this one (a lean-to's
 * barn, a spire's nave).
 */
const CLEAR = (R, t, dist) => `(() => {
  const R = ${JSON.stringify(R)};
  const t = ${JSON.stringify(t)};
  const sp = Math.hypot(t.vx, t.vy, t.vz);
  const d = [t.vx / sp, t.vy / sp, t.vz / sp];
  const own = new Set(R.solids);
  for (const o of window.__roofs()) {
    if (o.maxX > R.minX - 1 && o.minX < R.maxX + 1 && o.maxZ > R.minZ - 1 && o.minZ < R.maxZ + 1) {
      o.solids.forEach((i) => own.add(i));
    }
  }
  /* The crash physics' trees are not the sweep's (crashworld takes them
   * over), so a tree within a wing of the line is looked for apart. */
  const trees = [...window.__crashSolids(t.x, t.z, ${dist} + 10, 'tree'), ...window.__crashSolids(t.x, t.z, ${dist} + 10, 'canopy')];
  const segDist = (p, a, b) => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const l2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
    const u = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / l2)) : 0;
    return Math.hypot(p[0] - a[0] - ab[0] * u, p[1] - a[1] - ab[1] * u, p[2] - a[2] - ab[2] * u);
  };
  let p = [t.x, t.y, t.z];
  for (let k = 0; k * 0.1 < ${dist}; k += 1) {
    const q = [p[0] + d[0] * 0.1, p[1] + d[1] * 0.1, p[2] + d[2] * 0.1];
    if (k % 5 === 0 && trees.some((o) => (o.box ? false : segDist(q, o.a, o.b) - o.r < 1.2))) {
      return false;
    }
    window.__cover(p[0], p[1], p[2]);
    const h = window.__hit(p[0], p[1], p[2], q[0], q[1], q[2]);
    if (h.kind && !own.has(h.index)) {
      return false;
    }
    p = q;
  }
  return true;
})()`;

/* The collider indices of a roof's building: its own solids and those of
 * every roof that touches it (a lean-to's barn, a spire's nave). */
const OWN = (R) => `(() => {
  const R = ${JSON.stringify(R)};
  const own = new Set(R.solids);
  for (const o of window.__roofs()) {
    if (o.maxX > R.minX - 1 && o.minX < R.maxX + 1 && o.maxZ > R.minZ - 1 && o.minZ < R.maxZ + 1) {
      o.solids.forEach((i) => own.add(i));
    }
  }
  return [...own];
})()`;

/* The roof of a kind to fly at: the ROOF-th of those whose every approach
 * in `lines` is clear. */
async function pick(page, kind, spec, lines) {
  const all = await page.evaluate(`JSON.stringify(${PICK(kind, spec)})`).then(JSON.parse);
  let seen = 0;
  for (const R of all) {
    let clear = true;
    /* A gable to fly into: the ridge runs out to the gable's plane (a
     * half hip's end is a slope, and a craft meets it as a roof), and no
     * other roof is in front of it but well under the approach (the
     * pavilion's west mass ends where the cross gables' roofs begin; its
     * verandah is under the gables it stands in front of). */
    if (lines.includes('gable')) {
      /* Either end: the one flown at is the first that is a gable. */
      R.gableSide = await page.evaluate(`(() => {
        const R = ${JSON.stringify(R)};
        const at = (lx, lz) => [R.x + R.c * lx + R.s * lz, R.z - R.s * lx + R.c * lz];
        const T = (lx, lz) => window.__surface(...at(lx, lz), 1e9);
        const plate = T(R.hw, 0) - R.dy;
        const gy = plate + 0.4 * (T(0, 0) - R.dy - plate);
        return [1, -1].find((side) => T(0, side * R.hd) > T(0, 0) - 0.1
          && [1.5, 3, 5, 7].every((d) => T(0, side * (R.hd + d)) < gy - 0.8)) ?? 0;
      })()`);
      if (!R.gableSide) {
        continue;
      }
    }
    for (const scn of lines) {
      const plan = await page.evaluate(`JSON.stringify(${PLAN(scn, R)})`).then(JSON.parse);
      const dist = 12 + 2 * Math.max(R.hw, R.hd);
      if (!await page.evaluate(CLEAR(R, plan.throw, dist))) {
        if (process.argv.includes('--verbose')) {
          console.log(`  ${kind} at ${R.x.toFixed(1)},${R.z.toFixed(1)}: ${scn} approach not clear`);
        }
        clear = false;
        break;
      }
    }
    if (clear) {
      if (seen === ROOF) {
        return { ...R, own: await page.evaluate(`JSON.stringify(${OWN(R)})`).then(JSON.parse) };
      }
      seen += 1;
    }
  }
  return null;
}

const PLAN = (scn, R) => `(() => {
  const R = ${JSON.stringify(R)};
  const ux = R.c, uz = -R.s;
  const at = (lx) => [R.x + ux * lx, R.z + uz * lx];
  const T = (lx) => window.__surface(...at(lx), 1e9);
  const pitch = Math.atan((T(R.hw * 0.25) - T(R.hw * 0.75)) / (R.hw * 0.5)) * 180 / Math.PI;
  const plate = T(R.hw) - R.dy;
  const scn = ${JSON.stringify(scn)};
  const d2r = Math.PI / 180;
  const yaw = Math.atan2(ux, uz) / d2r;
  const V = ${SPEED};
  let lx, y, climb, back, attitude;
  if (scn === 'ramp' && ((R.kind || 'house') === 'house' || pitch < 8 || R.hw >= 3.5)) {
    /* Level with the roof's plane, the way a pilot meets a ramp (on a
     * roof as near flat as the bus shelter's, a skim onto it), on any
     * roof as wide as a village house's. */
    lx = R.hw * 0.4; climb = pitch - 7; y = T(lx) - 0.3; back = 5; attitude = pitch;
  } else if (scn === 'ramp') {
    /* The village house's ramp puts the craft 0.3 m over the roof's plane
     * at its eaves and 0.3 m under it 40 percent up, closing on it at 7
     * degrees. On a smaller roof 40 percent up is too near the eaves for
     * that, and the craft meets the eave's edge before the roof: so the
     * same 0.6 m is closed over the run from the eave's edge, where the
     * roof ends over the ground, and on a roof too short to close it at 7
     * degrees in 85 percent of its slope, at the angle that does. */
    const foot = window.__surface(...at(R.hw + 4), -1e9);
    let edge = R.hw;
    while (edge < R.hw + 3 && T(edge + 0.05) > foot + 0.3 && T(edge + 0.05) <= T(edge) + 0.01) {
      edge += 0.05;
    }
    const tp = Math.tan(pitch * d2r);
    climb = pitch - 7;
    let run = 0.6 / (tp - Math.tan(climb * d2r));
    if (run > 0.85 * edge) {
      run = 0.85 * edge;
      climb = Math.atan(tp - 0.6 / run) / d2r;
    }
    lx = Math.max(R.hw * 0.4, edge - run); y = T(lx) - 0.3; back = 5; attitude = pitch;
  } else if (scn === 'dive') {
    lx = R.hw * 0.5; climb = -50; y = T(lx) + 0.25; back = 10; attitude = climb + 3;
  } else if (scn === 'wall') {
    /* A metre and a half under the eaves, or halfway up a low wall. */
    const foot = window.__surface(...at(R.hw + 1), -1e9);
    lx = R.hw; climb = 0; y = Math.max(plate - 1.5, (foot + plate) / 2); back = 7; attitude = 0;
  } else if (scn === 'slope') {
    /* Level into the side of the roof halfway up it. */
    lx = R.hw * 0.5; climb = 0; y = T(lx); back = 8; attitude = 0;
  } else if (scn === 'skid') {
    /* Along the roof, square to its fall, down onto it at 2 degrees,
     * banked to its slope as a pilot lays a wing onto one: a lean-to
     * rises into the wall it leans on, so it is skidded along, not ramped
     * up. The craft's nose is its -z, so its yaw faces the way it came
     * from, and its +x is the roof's +x, the low side: the bank lowers
     * it by the pitch. */
    const T2 = (x, z) => window.__surface(x, z, 1e9);
    const vz = [R.s, R.c];
    const lz = R.hd * 0.4;
    /* Over its outer half: over the inner, a wing is under the eaves of
     * the barn it leans on, which come down to it. */
    const out = R.hw * 0.4;
    const [px, pz] = [R.x + vz[0] * lz + R.c * out, R.z + vz[1] * lz - R.s * out];
    const py = T2(px, pz) + 0.05;
    const gyaw = Math.atan2(vz[0], vz[1]) / d2r;
    const c4 = Math.cos(2 * d2r), s4 = Math.sin(2 * d2r);
    return {
      pitch, plate, lx: 0, x: px, y: py, z: pz,
      throw: { x: px + vz[0] * 6 * c4, y: py + 6 * s4, z: pz + vz[1] * 6 * c4, yaw: gyaw, pitch: 2, roll: -pitch, vx: -vz[0] * V * c4, vy: -V * s4, vz: -vz[1] * V * c4 },
    };
  } else if (scn === 'gable') {
    /* Level into the gable end, square to it, 40 percent of the way from
     * the plate to the ridge's underside: along the roof's own -z, or
     * +z at a roof whose +z end is not a gable. */
    const side = R.gableSide || 1;
    const vz = [R.s * side, R.c * side];
    const [gx, gz] = [R.x + vz[0] * R.hd, R.z + vz[1] * R.hd];
    const gy = plate + 0.4 * (T(0) - R.dy - plate);
    const gyaw = Math.atan2(vz[0], vz[1]) / d2r;
    return {
      pitch, plate, lx: 0, x: gx, y: gy, z: gz,
      throw: { x: gx + vz[0] * 7, y: gy, z: gz + vz[1] * 7, yaw: gyaw, pitch: 0, vx: -vz[0] * V, vy: 0, vz: -vz[1] * V },
    };
  } else {
    lx = R.hw * 0.5; y = T(lx) + 0.25;
    const [x, z] = at(lx);
    /* Square to the slope, as a pilot sets a quad down on one: level onto
     * a 28 degree face is a blade strike on any hard ground (the city's
     * asphalt bends the arm too). */
    const sp = Math.sin(pitch * d2r), cp = Math.cos(pitch * d2r);
    return {
      pitch, plate, lx, x, y, z,
      throw: { x, y, z, yaw, pitch, vx: -0.8 * ux * sp, vy: -0.8 * cp, vz: -0.8 * uz * sp },
    };
  }
  const [x, z] = at(lx);
  const cc = Math.cos(climb * d2r), sc = Math.sin(climb * d2r);
  return {
    pitch, plate, lx, x, y, z,
    throw: {
      x: x + ux * back * cc, y: y - back * sc, z: z + uz * back * cc, yaw, pitch: attitude,
      vx: -ux * V * cc, vy: V * sc, vz: -uz * V * cc,
    },
  };
})()`;

/* One sample of the flight, in the roof's frame. */
const SAMPLE = (R) => `(() => {
  const s = window.__craftState();
  const c = window.__crash();
  const dx = s.worldX - ${R.x}, dz = s.worldZ - ${R.z};
  const lx = ${R.c} * dx - ${R.s} * dz;
  const lz = ${R.s} * dx + ${R.c} * dz;
  return {
    lx, lz, y: s.worldY, speed: s.speed, hit: s.lastHitKind, hitIndex: s.lastHitIndex, wrecked: c.wrecked, events: c.events,
    flags: c.flagNames.join('|'), landed: s.landed, contacts: window.__ground().contactSteps,
    ground: window.__surface(s.worldX, s.worldZ, s.worldY - 0.4),
    roof: window.__surface(s.worldX, s.worldZ, 1e9),
  };
})()`;

async function fly(page, scn, R, shots) {
  const plan = await page.evaluate(`JSON.stringify(${PLAN(scn, R)})`).then(JSON.parse);
  await page.evaluate(`window.__crashThrow(${JSON.stringify({ ...plan.throw, hold: true })})`);
  await page.evaluate(`window.__stick(0, 0, 0, ${scn === 'quad' ? 0 : 0.45})`);
  if (shots) {
    const side = [R.x + R.s * 16 + R.c * 4, plan.y + 3, R.z + R.c * 16 - R.s * 4];
    await page.evaluate(`window.__setCam(${side.join(',')}, ${plan.x}, ${plan.y - 1}, ${plan.z}, 60)`);
    await page.sleep(400);
  }
  const events0 = await page.evaluate('window.__crash().events');
  await page.evaluate('window.__releasePose()');
  const log = [];
  const t0 = Date.now();
  let shot = 0;
  while (Date.now() - t0 < FLY_MS) {
    log.push(await page.evaluate(`JSON.stringify(${SAMPLE(R)})`).then(JSON.parse));
    if (shots && log.length % 5 === 2 && shot < 6) {
      const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
      await writeFile(join(shots, `${MAP}-${R.kind || 'house'}-${scn}-${shot}.png`), Buffer.from(data, 'base64'));
      shot += 1;
    }
    await page.sleep(30);
  }
  return { plan, log, events0, R };
}

function judge(scn, flown) {
  if (scn === 'skid') {
    /* A skid is a ramp along the roof's z: judged as one, in a frame
     * turned so its z is x. */
    const { R } = flown;
    const turned = { ...R, hw: R.hd, hd: R.hw };
    return judgeIn('ramp', { ...flown, R: turned, log: flown.log.map((r) => ({ ...r, lx: r.lz, lz: r.lx })) });
  }
  return judgeIn(scn, flown);
}

function judgeIn(scn, { plan, log, events0, R }) {
  if (process.argv.includes('--verbose')) {
    for (const r of log) {
      console.log(`  ${scn} lx ${r.lx.toFixed(2)} lz ${r.lz.toFixed(2)} y ${r.y.toFixed(2)} roof ${r.roof.toFixed(2)} ground ${r.ground.toFixed(2)} v ${r.speed.toFixed(1)} contacts ${r.contacts} ${r.hit} ${r.flags}`);
    }
  }
  const last = log[log.length - 1];
  /* Clearance over the roof, inside its walls, where it is certainly roof. */
  const over = log.filter((r) => Math.abs(r.lx) < R.hw && Math.abs(r.lz) < R.hd);
  const minClear = over.length ? Math.min(...over.map((r) => r.y - r.roof)) : Infinity;
  /* A wall of this building, against a neighbour's met after leaving it
   * (a garden shed's flight ends on its house). */
  const own = new Set(R.own ?? R.solids);
  const ownWalls = log.filter((r) => r.hit === 'wall' && own.has(r.hitIndex));
  const walls = ownWalls.length;
  const otherWalls = log.filter((r) => r.hit === 'wall' && !own.has(r.hitIndex));
  /* Steps with the plant's hull or a wheel on its ground plane while over
   * the roof: the count's growth between samples taken over it. */
  let touches = 0;
  for (let k = 1; k < log.length; k += 1) {
    if (Math.abs(log[k].lx) < R.hw || Math.abs(log[k - 1].lx) < R.hw) {
      touches += log[k].contacts - log[k - 1].contacts;
    }
  }
  const minLx = Math.min(...log.map((r) => r.lx));
  /* What broke while the craft was on or over the roof, eaves included,
   * against what broke after it had left: a glide that ends in a meadow
   * or a tree three seconds later is not the roof's. */
  const onRoof = (r) => Math.abs(r.lx) < R.hw + 1.5;
  let roofEvents = 0;
  let roofFlags = '';
  for (let k = 1; k < log.length; k += 1) {
    if (onRoof(log[k]) || onRoof(log[k - 1])) {
      roofEvents += log[k].events - log[k - 1].events;
      if (log[k].events > log[k - 1].events && !roofFlags) {
        roofFlags = log[k].flags;
      }
    }
  }
  const wreckedOnRoof = log.some((r, k) => r.wrecked && onRoof(r) && !(k > 0 && log[k - 1].wrecked));
  /* Off the far eave and still flying, a metre and more over what is under it. */
  const flewOn = log.some((r) => r.lx < -R.hw - 1.5 && r.y - r.ground > 1);
  const facts = {
    roofEvents,
    roofFlags,
    wreckedOnRoof,
    flewOn,
    roof: `${R.key} (${R.material}), pitch ${plan.pitch.toFixed(1)} deg, ${R.solids.length} solids`,
    minClearOverRoof: +minClear.toFixed(3),
    roofContactSteps: touches,
    deepestLx: +minLx.toFixed(2),
    wallSamples: walls,
    otherWallSamples: otherWalls.length,
    events: last.events - events0,
    flags: last.flags,
    wrecked: last.wrecked,
    end: { lx: +last.lx.toFixed(2), y: +last.y.toFixed(2), speed: +last.speed.toFixed(2), roofUnder: +last.roof.toFixed(2), landed: last.landed },
  };
  /* Inside the house, under its roof: through a wall or the shell. */
  const inside = log.filter((r) => Math.abs(r.lx) < R.hw - 0.3 && Math.abs(r.lz) < R.hd - 0.3 && r.y < r.roof - R.dy - 0.1).length;
  facts.insideSamples = inside;
  facts.shallowestLz = +Math.min(...log.map((r) => r.lz * (R.gableSide || 1))).toFixed(2);
  /* What a wall and a gable must stop is the craft getting into the
   * house (`inside`), not it getting past the face's plane: a wreck the
   * crash physics throws up onto the roof and along it, or round the
   * building's corner on the grass, has not got in. */
  let ok;
  if (scn === 'slope') {
    ok = inside === 0 && touches + walls > 0;
  } else if (scn === 'gable') {
    ok = walls > 0 && inside === 0;
  } else if (scn === 'ramp') {
    /* Touched the roof, broke nothing on it, met no wall, and flew on
     * off the far eave. */
    ok = touches > 0 && roofEvents === 0 && !wreckedOnRoof && !ownWalls.some(onRoof) && !otherWalls.some(onRoof) && flewOn;
  } else if (scn === 'dive') {
    ok = last.wrecked;
  } else if (scn === 'wall') {
    /* The eave wall stood at lx = hw; the craft never got into the house. */
    ok = walls > 0 && inside === 0;
  } else {
    /* Down onto the roof and on it, never through it: a quad on a slate
     * pitch steeper than its friction holds slides, as it should. */
    ok = minClear < 0.15 && over.every((r) => r.y > r.roof - 0.15) && !last.wrecked;
  }
  return { ok, facts };
}

async function open(airframe) {
  /* The map is named in the address as well as seated: a page that names
   * no world opens on the title map (src/boot.js), not on the seat. */
  const page = await openPage({ root, width: 960, height: 540, url: `/index.html?map=${MAP}`, seed: seed(airframe) });
  await page.until('window.__shellReady && window.__map && window.__map().ready', 300000);
  const id = await page.evaluate('window.__map().id');
  if (id !== MAP) {
    await page.close();
    throw new Error(`the page seated map ${id}, not ${MAP}`);
  }
  if (!SHOTS) {
    /* The software rasteriser draws two frames a second, and the frame
     * loop steps the plant per frame: with the draw off the flight runs
     * at the sim's own rate. Nothing about the trajectory depends on it. */
    await page.evaluate('window.__drawOff(true)');
  }
  return page;
}

/* The roof each kind flies each scenario at, chosen once, in the first
 * session, with the craft at rest where it spawned (the obstacle query a
 * choice asks takes the craft's attitude), so both sessions fly the same
 * roofs on every run. */
const chosen = {};
async function session(airframe, plan) {
  const page = await open(airframe);
  const out = [];
  try {
    /* A roof chosen in the other session is flown here only if this page
     * has it where it was (a race field's pavilion stands where the
     * seated class's course puts it). */
    const here = await page.evaluate('JSON.stringify(window.__roofs().map((r) => [r.kind || "house", r.x, r.z]))').then(JSON.parse);
    const present = (R) => R && here.some(([k, x, z]) => k === (R.kind || 'house') && Math.abs(x - R.x) < 0.01 && Math.abs(z - R.z) < 0.01);
    for (const mine of Object.values(chosen)) {
      for (const key of Object.keys(mine)) {
        if (!present(mine[key])) {
          delete mine[key];
        }
      }
    }
    for (const { kind, scenarios } of plan) {
      const spec = KINDS[kind] ?? { fly: CLOSED, min: 1 };
      const mine = (chosen[kind] ??= {});
      /* One roof clear for every line the kind flies, or where the town
       * is too close for that (a city street), one per line. */
      if (!('every' in mine)) {
        mine.every = await pick(page, kind, spec, spec.fly.filter((s) => s !== 'quad'));
      }
      for (const scn of scenarios) {
        if (!(scn in mine)) {
          mine[scn] = mine.every ?? await pick(page, kind, spec, scn === 'quad' ? [] : [scn]);
        }
      }
    }
    /* The first throw of a page pays for collecting the crash world's
     * trees; take it high over the valley. */
    await page.evaluate('window.__crashThrow({ x: -150, y: 150, z: 155, yaw: 90, pitch: 0, vx: -14, vy: 0, vz: 0 })');
    await page.sleep(4000);
    for (const { kind, scenarios } of plan) {
      for (const scn of scenarios) {
        const R = chosen[kind][scn];
        if (!R) {
          out.push({ scn, kind, airframe, ok: false, facts: { error: `no ${kind} roof with a clear ${scn} approach to fly at` } });
          continue;
        }
        await page.evaluate('window.__stick()');
        await page.tap('KeyR');
        await page.sleep(1500);
        const flown = await fly(page, scn, R, SHOTS);
        out.push({ scn, kind, airframe, ...judge(scn, flown) });
      }
    }
    const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e));
    return { out, errs };
  } finally {
    await page.close();
  }
}

/*
 * Page side of --sweep: every roof, swept. Returns one row per roof: its
 * kind, how many sweeps ran, and each that got inside, with where.
 */
const SWEEP = `(() => {
  const STEP = 0.05;
  const rows = [];
  const surf = window.__surface;
  const roofs = window.__roofs();
  /* The drawn meshes, for what a sweep that got in had passed through:
   * every mesh, shown or culled (the city culls by the camera), but the
   * sky and the ground, which are a kilometre and more across. */
  const T3 = window.__three;
  const scene = window.__mapScene();
  scene.updateMatrixWorld(true);
  const meshes = [];
  const bound = new T3.Box3();
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) {
      return;
    }
    bound.setFromObject(o);
    if (bound.isEmpty() || bound.max.x - bound.min.x > 1000 || bound.max.z - bound.min.z > 1000) {
      return;
    }
    meshes.push({ o, b: bound.clone() });
  });
  const ray = new T3.Raycaster();
  /* The first drawn surface from a to b, or null: the name of what it is. */
  const drawn = (a, b) => {
    const d = new T3.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const far = d.length();
    const x0 = Math.min(a[0], b[0]); const x1 = Math.max(a[0], b[0]);
    const z0 = Math.min(a[2], b[2]); const z1 = Math.max(a[2], b[2]);
    const y0 = Math.min(a[1], b[1]); const y1 = Math.max(a[1], b[1]);
    const list = meshes.filter((m) => m.b.max.x >= x0 && m.b.min.x <= x1 && m.b.max.z >= z0 && m.b.min.z <= z1 && m.b.max.y >= y0 && m.b.min.y <= y1).map((m) => m.o);
    ray.set(new T3.Vector3(...a), d.normalize());
    ray.far = far;
    const hits = ray.intersectObjects(list, false);
    return hits.length ? (hits[0].object.name || hits[0].object.parent?.name || 'mesh') : null;
  };
  /* Within roof j's walls and under its own underside. */
  const within = (j, x, y, z, margin) => {
    const R = roofs[j];
    if (R.open) {
      return false;
    }
    const lx = R.c * (x - R.x) - R.s * (z - R.z);
    const lz = R.s * (x - R.x) + R.c * (z - R.z);
    if (!(Math.abs(lx) < R.hw - margin && Math.abs(lz) < R.hd - margin)) {
      return false;
    }
    const t = window.__roofTop(j, x, z);
    return y < t - R.dy - 0.1 && y > surf(x, z, -1e9) + 0.2;
  };
  roofs.forEach((R, i) => {
    const L = (lx, lz) => [R.x + R.c * lx + R.s * lz, R.z - R.s * lx + R.c * lz];
    const local = (x, z) => [R.c * (x - R.x) - R.s * (z - R.z), R.s * (x - R.x) + R.c * (z - R.z)];
    const top = (x, z) => surf(x, z, 1e9);
    const [cx, cz] = L(0, 0);
    const foot = surf(cx, cz, -1e9);
    const ridge = window.__roofTop(i, cx, cz);
    /* A city roof's walls are the collider fit's boxes under it, which
     * hug the drawing rather than a rectangle: inside is in the plan of
     * one of them, a hand in from its sides, and under the roof. */
    const own = R.kind === 'cityRoof'
      ? window.__colliderBoxes(cx, cz, Math.hypot(R.maxX - R.minX, R.maxZ - R.minZ)).filter((b) => R.solids.includes(b[6]))
      : null;
    const inside = own
      ? (x, y, z) => y < window.__roofTop(i, x, z) - R.dy - 0.1 && own.some((b) => x > b[0] + 0.3 && x < b[3] - 0.3 && z > b[2] + 0.3 && z < b[5] - 0.3)
      : (x, y, z) => within(i, x, y, z, 0.3);
    /* A sweep from inside some other building is not a way in from
     * outside: the station's machine house stands inside the station. */
    const indoors = (x, y, z) => roofs.some((o, j) => j !== i && Math.abs(o.x - x) < 40 && Math.abs(o.z - z) < 40 && within(j, x, y, z, 0));
    /* Walk a to b; the first thing that stops it, or where it got in. */
    const walk = (a, b) => {
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / STEP));
      let p = a;
      for (let k = 1; k <= n; k += 1) {
        const t = k / n;
        const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        /* The pass the shell runs: the roofs' cover from where the craft
         * is, then its sweep to where it goes. */
        window.__cover(p[0], p[1], p[2]);
        if (window.__hit(p[0], p[1], p[2], q[0], q[1], q[2]).kind) {
          return { stop: 'solid' };
        }
        /* The ground the shell gives the plant from there (its fromY is
         * the craft's height less SURFACE_BIAS, 0.4 m) risen to the craft:
         * the plant lifts it onto that. */
        if (surf(q[0], q[2], q[1] - 0.4) >= q[1] - 0.02) {
          return { stop: 'ground' };
        }
        if (inside(q[0], q[1], q[2])) {
          const [lx, lz] = local(q[0], q[2]);
          return { stop: null, lx: +lx.toFixed(2), lz: +lz.toFixed(2), y: +(q[1] - foot).toFixed(2), through: drawn(a, q) };
        }
        p = q;
      }
      return { stop: 'through' };
    };
    const sweeps = [];
    const reach = Math.max(R.hw, R.hd) + 4;
    const heights = [];
    if (!R.open) {
      const plate = R.plate;
      if (plate - foot > 1.2) {
        heights.push(['wall', Math.max(foot + 0.6, plate - 1.0)]);
      }
      if (ridge - R.dy - plate > 0.8) {
        heights.push(['attic', plate + 0.35 * (ridge - R.dy - plate)]);
        heights.push(['attic', plate + 0.7 * (ridge - R.dy - plate)]);
      }
      for (const [what, y] of heights) {
        for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          for (const off of [0, -0.5, 0.5]) {
            const side = ax ? R.hd : R.hw;
            const from = L(ax * reach + (ax ? 0 : off * side), az * reach + (az ? 0 : off * side));
            const to = L(ax ? 0 : off * side, az ? 0 : off * side);
            if (indoors(from[0], y, from[1])) {
              continue;
            }
            sweeps.push({ what, dir: [ax, az, off], r: walk([from[0], y, from[1]], [to[0], y, to[1]]) });
          }
        }
      }
    }
    /* Down onto it: the roof is ground everywhere it is drawn over the walls. */
    for (const [a, b] of [[0, 0], [0.5, 0.5], [-0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]]) {
      const [x, z] = L(a * R.hw, b * R.hd);
      /* Where this roof is: a city roof's frame is its drawing's box, and
       * its middle may be between two of its pieces. */
      if (Number.isNaN(window.__roofTop(i, x, z))) {
        continue;
      }
      const t = top(x, z);
      sweeps.push({ what: 'dive', dir: [a, b], r: walk([x, t + 2, z], [x, Math.max(foot + 0.3, t - 2), z]) });
    }
    /* In through something drawn is a building flown through; in through
     * nothing drawn is an opening (a shop front, a verandah) the drawing
     * leaves. A dive may land on the roof or on what stands on it (a
     * chimney); it may not go through. */
    const bad = sweeps.filter((s) => (s.r.stop === null && s.r.through) || (s.what === 'dive' && s.r.stop === 'through'));
    const openings = sweeps.filter((s) => s.r.stop === null && !s.r.through).length;
    rows.push({ kind: R.kind || 'house', key: R.key, open: R.open, at: [+R.x.toFixed(1), +R.z.toFixed(1)], solids: R.solids.length, sweeps: sweeps.length, bad, openings });
  });
  return rows;
})()`;

async function sweep() {
  const page = await open('5inch');
  try {
    const rows = await page.evaluate(`JSON.stringify(${SWEEP})`).then(JSON.parse);
    const byKind = {};
    let failed = 0;
    for (const r of rows) {
      const k = (byKind[r.kind] ??= { buildings: 0, sweeps: 0, into: 0, openings: 0, fit: 0 });
      /* A city roof's walls are the collider fit's, which this round does
       * not touch (src/maps/city/index.js): a way in through them at wall
       * height is the fit's, and is listed, not failed. Its attic, its
       * gables and its roof are this round's. */
      const fit = r.kind === 'cityRoof' ? r.bad.filter((b) => b.what === 'wall') : [];
      const bad = r.bad.filter((b) => !fit.includes(b));
      k.buildings += 1;
      k.sweeps += r.sweeps;
      k.into += bad.length;
      k.openings += r.openings;
      k.fit += fit.length;
      if (bad.length) {
        failed += 1;
        console.log(`FAIL ${MAP} ${r.kind} ${r.key} at ${r.at.join(',')}: ${JSON.stringify(bad.slice(0, 4))}`);
      }
      if (fit.length) {
        console.log(`  fit ${MAP} ${r.kind} ${r.key} at ${r.at.join(',')}: ${JSON.stringify(fit.slice(0, 2))}`);
      }
    }
    for (const [kind, k] of Object.entries(byKind)) {
      const fit = k.fit ? `, ${k.fit} in through the collider fit's walls (the fit's, listed above)` : '';
      console.log(`${k.into ? 'FAIL' : 'PASS'} ${MAP} sweep ${kind}: ${k.buildings} buildings, ${k.sweeps} sweeps, ${k.into} got in through the drawing, ${k.openings} in at an opening${fit}`);
    }
    const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e));
    for (const e of errs) {
      console.log(`  ERR ${e}`);
    }
    return failed + errs.length;
  } finally {
    await page.close();
  }
}

/*
 * Page side of --audit: for every roof, at points over it, the drawn
 * surface nearest the recorded top, from rays down through the meshes
 * whose bounds hold the point (the sky, the terrain and anything a
 * kilometre across left out: they are not roofs), shown or culled: the
 * city culls by where the title camera is flying.
 */
const AUDIT = `(() => {
  const T3 = window.__three;
  const scene = window.__mapScene();
  scene.updateMatrixWorld(true);
  const meshes = [];
  const box = new T3.Box3();
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) {
      return;
    }
    box.setFromObject(o);
    if (box.isEmpty() || box.max.x - box.min.x > 1000 || box.max.z - box.min.z > 1000) {
      return;
    }
    meshes.push({ o, b: box.clone() });
  });
  const ray = new T3.Raycaster();
  const down = new T3.Vector3(0, -1, 0);
  const rows = [];
  for (const R of window.__roofs()) {
    const L = (lx, lz) => [R.x + R.c * lx + R.s * lz, R.z - R.s * lx + R.c * lz];
    const offs = [];
    for (const a of [-0.6, 0, 0.6]) {
      for (const b of [-0.6, 0, 0.6]) {
        offs.push([a * R.hw, b * R.hd]);
      }
    }
    const errs = [];
    for (const [lx, lz] of offs) {
      const [x, z] = L(lx, lz);
      const t = window.__surface(x, z, 1e9);
      const g = window.__surface(x, z, -1e9);
      if (!(t > g + 0.3)) {
        continue;
      }
      const list = meshes.filter((m) => x >= m.b.min.x && x <= m.b.max.x && z >= m.b.min.z && z <= m.b.max.z && m.b.max.y > t - 2 && m.b.min.y < t + 2).map((m) => m.o);
      ray.set(new T3.Vector3(x, t + 3, z), down);
      ray.far = 6;
      const hits = ray.intersectObjects(list, false);
      const near = hits.length ? Math.min(...hits.map((h) => Math.abs(h.point.y - t))) : Infinity;
      errs.push(+near.toFixed(3));
    }
    rows.push({ kind: R.kind || 'house', key: R.key, at: [+R.x.toFixed(1), +R.z.toFixed(1)], errs });
  }
  return rows;
})()`;

async function audit() {
  const page = await open('5inch');
  try {
    const rows = await page.evaluate(`JSON.stringify(${AUDIT})`).then(JSON.parse);
    const byKind = {};
    let failed = 0;
    for (const r of rows) {
      const k = (byKind[r.kind] ??= { roofs: 0, points: 0, off: 0, worst: 0, bad: 0 });
      const off = r.errs.filter((e) => e > AUDIT_TOL);
      k.roofs += 1;
      k.points += r.errs.length;
      k.off += off.length;
      k.worst = Math.max(k.worst, ...r.errs.filter(Number.isFinite), 0);
      if (!r.errs.length || off.length * 2 > r.errs.length) {
        k.bad += 1;
        failed += 1;
        console.log(`FAIL ${MAP} audit ${r.kind} ${r.key} at ${r.at.join(',')}: ${JSON.stringify(r.errs)}`);
      }
    }
    for (const [kind, k] of Object.entries(byKind)) {
      console.log(`${k.bad ? 'FAIL' : 'PASS'} ${MAP} audit ${kind}: ${k.roofs} roofs, ${k.points} points, ${k.off} off by more than ${AUDIT_TOL} m, worst finite ${k.worst.toFixed(3)} m`);
    }
    return failed;
  } finally {
    await page.close();
  }
}

if (process.argv.includes('--sweep') || process.argv.includes('--audit')) {
  let failed = 0;
  if (process.argv.includes('--sweep')) {
    failed += await sweep();
  }
  if (process.argv.includes('--audit')) {
    failed += await audit();
  }
  console.log(failed ? `${failed} failure(s)` : `every ${MAP} building checked passes`);
  process.exit(failed ? 1 : 0);
}

if (SHOTS) {
  await mkdir(SHOTS, { recursive: true });
}
/* The kinds this map draws, unless named. */
const probe = await open('5inch');
const present = await probe.evaluate('JSON.stringify([...new Set(window.__roofs().map((r) => r.kind || "house"))])').then(JSON.parse);
await probe.close();
const kinds = WANT_KINDS ? WANT_KINDS.split(',') : present;
const planes = [];
const quads = [];
for (const kind of kinds) {
  const fly = (FLY ? FLY.split(',') : (KINDS[kind] ?? { fly: CLOSED }).fly).filter((s) => ONLY.includes(s));
  if (fly.some((s) => s !== 'quad')) {
    planes.push({ kind, scenarios: fly.filter((s) => s !== 'quad') });
  }
  if (fly.includes('quad')) {
    quads.push({ kind, scenarios: ['quad'] });
  }
}
/* The quads fly the roofs the planes flew. */
for (const { kind } of quads) {
  (chosen[kind] ??= {});
}
const runs = [];
if (planes.length) {
  runs.push(await session(AIRFRAME, planes));
}
if (quads.length) {
  runs.push(await session('5inch', quads));
}
let failed = 0;
for (const { out, errs } of runs) {
  for (const r of out) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${MAP} ${r.kind} ${r.airframe} ${r.scn}: ${JSON.stringify(r.facts)}`);
    failed += r.ok ? 0 : 1;
  }
  for (const e of errs) {
    console.log(`  ERR ${e}`);
  }
  failed += errs.length;
}
console.log(failed ? `${failed} failure(s)` : 'all roof scenarios pass');
process.exit(failed ? 1 : 0);
