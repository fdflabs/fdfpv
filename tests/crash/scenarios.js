/*
 * scenarios.js: the crash suite's scenarios, docs/CRASH-PLAN.md's table,
 * each as a setup, a pilot and the solids it flies into.
 *
 * A scenario is flown by scripts/crash-suite.js through a context `h`:
 *
 *   h.call(name, ...args)  any module entry point that writes (recorded)
 *   h.s                    the state block after the last step
 *   h.ms                   milliseconds since the scenario's clock started
 *   h.place(solid)         put a solid in the world, plant frame; the
 *                          shell's sweep meets it, and the plant is told of
 *                          it for the parts that break off
 *   h.tree(spec)           a tree: a trunk the sweep meets, a crown the
 *                          plant holds and the craft flies into
 *   h.damage               the damage reader (tests/crash/readback.js)
 *   h.arm()                from here the first contact is the impact
 *   h.hit                  null until the impact, then { ms, ... }
 *   h.mem                  the scenario's own scratch
 *
 * setup(h) runs once after sim_init, the airframe and the pack; pilot(h)
 * runs every 4 ms and returns the four sticks [roll, pitch, yaw, throttle]
 * the RC convention of sim_abi.h uses. Everything here is harness
 * arithmetic: it decides what to send, and what was sent is what the
 * cross-host check replays (tests/crash/program.js), so JS maths is
 * allowed here and nowhere in the module.
 *
 * Every scenario is flown with crash damage on. The solids are the
 * shell's kinds (src/game/collide.js KINDS), so each contact takes the
 * shell's material for it, and the contact itself is the shell's call:
 * sim_contact_at_mat (or sim_contact_at where the module's material is not
 * the shell's numbers) at the craft's patch, then a blade strike scaled by
 * the impulse. The ground is named to the plant as the shell names it
 * (src/game/crashworld.js groundSurface): grass outdoors, today's contact
 * in a whoop's room. Only the detection is the suite's own, a
 * disc of the airframe's sweep radius and vertical extents against a
 * plane, a capsule or a sphere, because the plant has no scene geometry
 * and the shell's colliders live in a map.
 *
 * Bands are not here. They come from references, tests/crash/bands.json,
 * with docs/CRASH-REFERENCES.md holding the sources; nothing in this file
 * or in the plant decides what a crash should do.
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

import { GROUND_MU, GROUND_E } from '../../src/game/collide.js';
import { MICRO_SCALE, BRAMOR_CATAPULT } from '../../configs/airframes.js';
import { SURFACE } from '../../configs/parts.js';

const DEG = Math.PI / 180;
const clamp = (x, lo = -1, hi = 1) => (x < lo ? lo : (x > hi ? hi : x));

/*
 * The aircraft. `shell` is the configs/airframes.js id the collider takes
 * its dimensions from, `sim` the plant. Speeds are the plant's own, from
 * the gates' derived figures (tests/*-thresholds.json, docs/*-STAGE1.md),
 * because a scenario flown at a speed the aircraft cannot reach would be
 * testing the pilot: Vs the power off stall, Vc the cruise, Vt the top.
 */
export const CRAFT = {
  '5inch': { shell: '5inch', sim: 0, quad: true, volts: 4.2 },
  /* The shell's whoop is the five inch's plant in a room built MICRO_SCALE
   * times life size (configs/airframes.js). Its scenarios are flown at a
   * real whoop's speeds times that factor, and read back divided by it. */
  whoop: { shell: 'whoop65', sim: 0, quad: true, volts: 4.2, scale: MICRO_SCALE, partTable: 1 },
  sky: { shell: 'sky1800', sim: 3, Vs: 9.2, Vc: 14.9, Vt: 23.5, cruise: 0.65 },
  cub: { shell: 'cub1400', sim: 4, Vs: 8.1, Vc: 13.5, Vt: 18.4, cruise: 0.75, wheels: { z: 0.1463, pitchDeg: 11.0 } },
  radian: { shell: 'radian2000', sim: 6, Vs: 6.5, Vc: 14.2, Vt: 18.0, cruise: 0.65 },
  slowstick: { shell: 'slowstick1180', sim: 5, Vs: 4.4, Vc: 5.6, Vt: 8.4, cruise: 0.75, wheels: { z: 0.1349, pitchDeg: 6.91 } },
  timber: { shell: 'timber1500', sim: 7, Vs: 7.2, Vc: 18.0, Vt: 22.0, cruise: 0.75, wheels: { z: 0.2117, pitchDeg: 11.81 } },
  bramor: { shell: 'bramor2300', sim: 8, Vs: 13.0, Vc: 16.0, Vt: 25.0, cruise: 0.667 },
  timberf: { shell: 'timber1500f', sim: 9, Vs: 7.1, Vc: 17.0, Vt: 21.0, cruise: 0.75, floats: { z: 0.2074, pitchDeg: 2.52 } },
  cubf: { shell: 'cub1400f', sim: 10, Vs: 8.7, Vc: 13.0, Vt: 17.0, cruise: 0.75, floats: { z: 0.1765, pitchDeg: 0.64 } },
};

/* A quaternion from yaw, pitch (nose up positive) and bank (right wing
 * down positive), body to world, z up, the plant's convention. */
export function quatYPR(yawDeg, pitchDeg, bankDeg) {
  const cy = Math.cos(yawDeg * DEG / 2), sy = Math.sin(yawDeg * DEG / 2);
  /* Nose up is negative rotation about body y (y left). */
  const cp = Math.cos(-pitchDeg * DEG / 2), sp = Math.sin(-pitchDeg * DEG / 2);
  /* Right wing down is positive rotation about body x (x forward). */
  const cr = Math.cos(bankDeg * DEG / 2), sr = Math.sin(bankDeg * DEG / 2);
  return [
    cy * cp * cr + sy * sp * sr,
    cy * cp * sr - sy * sp * cr,
    cy * sp * cr + sy * cp * sr,
    sy * cp * cr - cy * sp * sr,
  ];
}

export function attitude(s) {
  const w = s[7], x = s[8], y = s[9], z = s[10];
  return {
    pitch: Math.asin(clamp(2 * (x * z - w * y))),
    bank: Math.asin(clamp(2 * (y * z + w * x))),
    upz: 1 - 2 * (x * x + y * y),
    yaw: Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)),
  };
}

const speed = (s) => Math.hypot(s[4], s[5], s[6]);

/* ---- the quad's pilot: Betaflight's angle mode flies the attitude, the
 * hand flies speed on the pitch stick, height on the throttle, the line
 * on the roll stick and the heading on the yaw stick. */
function quadHold(h, { v, z, y = 0, heading = 0 }) {
  const s = h.s;
  const m = h.mem;
  const { yaw } = attitude(s);
  /* Asked to stop, the hand lets go of the speed it was holding: an
   * integrator wound up by the run in would otherwise hold the stick
   * forward into whatever it just hit. */
  const vx = s[4] * Math.cos(heading) + s[5] * Math.sin(heading);
  m.iv = v === 0 ? 0 : clamp((m.iv ?? 0) + 0.0012 * (v - vx), -1, 1);
  const pitch = clamp(-(0.12 * (v - vx) + m.iv), -1, 0.4);
  m.iz = clamp((m.iz ?? 0) + 0.0006 * (z - s[3]), -0.3, 0.4);
  const thr = clamp(0.35 + m.iz + 0.12 * (z - s[3]) - 0.08 * s[6] + 0.25 * Math.abs(pitch), 0, 1);
  const vy = -s[4] * Math.sin(heading) + s[5] * Math.cos(heading);
  const ly = -(s[1] - h.mem.x0) * Math.sin(heading) + (s[2] - y);
  const roll = clamp(0.25 * ly + 0.3 * vy);
  let dy = yaw - heading;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  return [roll, pitch, clamp(2 * dy), thr];
}

/* At speed: the forward speed within 3 percent for 300 ms. */
function atSpeed(h, v) {
  const s = h.s;
  const ok = Math.abs(s[4] - v) < 0.03 * v + 0.2 && Math.abs(s[6]) < 1.0;
  h.mem.okMs = ok ? (h.mem.okMs ?? 0) + 4 : 0;
  return h.mem.okMs >= 300;
}

/* The quad scenarios' common opening: armed in angle mode at height,
 * flown up to speed down world +x. */
function quadSetup(h, z) {
  h.call('sim_set_angle_mode', 1);
  const q = quatYPR(0, 0, 0);
  h.call('sim_set_pose', 0, 0, z, q[0], q[1], q[2], q[3]);
  h.mem.x0 = 0;
}

/* After the impact a pilot's thumb comes off the throttle and the sticks
 * centre: the crash reflex, and what disarming does to the sticks. */
const HANDS_OFF = [0, 0, 0, 0];

/* ---- the planes' pilot: the harness hand of tests/lib/wingpilot.js, a
 * bank hold on the roll stick and a pitch hold on the pitch stick. */
function planeHold(h, { bank = 0, pitch = 0, thr = 0 }) {
  const s = h.s;
  const a = attitude(s);
  const roll = clamp(-1.2 * (a.bank - bank * DEG) - 0.12 * s[11]);
  const pst = clamp(2.5 * (pitch * DEG - a.pitch) + 0.25 * s[12]);
  return [roll, pst, 0, thr];
}

function planeLaunch(h, { z, pitch = 0, bank = 0, v, x = 0 }) {
  const q = quatYPR(0, pitch, bank);
  h.call('sim_set_pose', x, 0, z, q[0], q[1], q[2], q[3]);
  h.call('sim_wing_launch', v);
}

function grass(h) {
  h.call('sim_set_ground', 1, 0, 0, 1, 0, 0, 0, GROUND_MU, GROUND_E);
  h.call('sim_set_ground_material', SURFACE.grass);
}

/* A whoop's room: the shell keeps today's contact on a micro track's
 * floor (src/game/crashworld.js groundSurface), so the suite does too. */
function floor(h) {
  h.call('sim_set_ground', 1, 0, 0, 1, 0, 0, 0, GROUND_MU, GROUND_E);
  h.call('sim_set_ground_material', SURFACE.default);
}

function water(h) {
  h.call('sim_set_ground', 0, 0, 0, 1, 0, 0, 0, 0, 0);
  h.call('sim_water_clear');
  const body = h.call('sim_water_add', 0, 0, 0);
  if (body < 0) {
    throw new Error(`sim_water_add: ${body}`);
  }
  return body;
}

/*
 * WIND IN THE AIR, the hook for the two scenarios that need it. The plant
 * has none on main at the time of writing (sim_air_lift is vertical and
 * sim_water_wind only raises waves); round 1's core work adds it, zero by
 * default. When the module exports WIND_ENTRY a scenario that `needs` it
 * is flown with it and judged; until then it is flown still air and
 * reported blocked. The entry point landed in round 1 as sim_set_wind(vx,
 * vy, gust) (src/native/sim_abi.h): the mean wind, world frame m/s in the
 * plant's axes, and the gusts' RMS per horizontal axis, m/s. The third
 * argument is the gusts, not a vertical wind; the scenarios pass 0, still
 * air on top of the mean.
 */
export const WIND_ENTRY = 'sim_set_wind';

function wind(h, vx, vy, gust) {
  if (h.has(WIND_ENTRY)) {
    h.call(WIND_ENTRY, vx, vy, gust);
  }
}

/* The pose on its own gear, from the gates' measured rest. */
function onWheels(h, c) {
  const q = quatYPR(0, c.wheels.pitchDeg, 0);
  h.call('sim_set_pose', 0, 0, c.wheels.z, q[0], q[1], q[2], q[3]);
  h.call('sim_rest');
}

function onWater(h, c) {
  const q = quatYPR(0, c.floats.pitchDeg, 0);
  h.call('sim_set_pose', 0, 0, c.floats.z, q[0], q[1], q[2], q[3]);
  h.call('sim_rest');
}

/* ======================== the five inch ======================== */

function gateClip(v) {
  return {
    craft: '5inch',
    family: 'gate clip',
    map: 'city',
    seconds: 14,
    setup(h) {
      grass(h);
      quadSetup(h, 2.0);
    },
    pilot(h) {
      if (h.hit) {
        return HANDS_OFF;
      }
      if (!h.mem.placed && h.ms > 500 && atSpeed(h, v)) {
        /* A 1 inch PVC upright (MultiGP's gate is 1 inch schedule 40, 33 mm
         * outside), standing 2.5 m ahead, offset so the right front arm's
         * prop disc overlaps it by 8 cm: a clip, not a centre hit. */
        const s = h.s;
        const reach = 0.110 + 0.0635;
        h.place({ kind: 'gate', shape: 'capsule', a: [s[1] + 2.5, s[2] - (reach + 0.0167 - 0.08), 0], b: [s[1] + 2.5, s[2] - (reach + 0.0167 - 0.08), 3.0], r: 0.0167 });
        h.mem.placed = true;
        h.arm();
      }
      return quadHold(h, { v, z: 2.0 });
    },
  };
}

export const SCENARIOS = [
  { id: 'q5-gate-15', title: 'Five inch clips a gate upright at 15 m/s', ...gateClip(15) },
  { id: 'q5-gate-30', title: 'Five inch clips a gate upright at 30 m/s', ...gateClip(30) },
  {
    id: 'q5-wall',
    title: 'Five inch into a masonry wall at full speed',
    craft: '5inch',
    family: 'wall',
    map: 'city',
    seconds: 16,
    setup(h) {
      grass(h);
      quadSetup(h, 2.0);
    },
    pilot(h) {
      if (h.hit) {
        return HANDS_OFF;
      }
      /* Full speed in angle mode on this plant is about 35 m/s (measured
       * flat out at the angle limit); 32 is reached with stick to spare. */
      const v = 32;
      if (!h.mem.placed && h.ms > 500 && atSpeed(h, v)) {
        h.place({ kind: 'wall', shape: 'plane', p: [h.s[1] + 4, 0, 0], n: [-1, 0, 0] });
        h.mem.placed = true;
        h.arm();
      }
      return quadHold(h, { v, z: 2.0 });
    },
  },
  {
    id: 'q5-prop-strike',
    title: 'Five inch lands hard, 5 m/s down and 25 deg of bank, props into the grass',
    craft: '5inch',
    family: 'prop strike',
    map: 'city',
    seconds: 5,
    setup(h) {
      grass(h);
      /* Dropped from the height that gives 5 m/s at the grass, v^2 / 2g,
       * rolled 25 deg so a blade reaches the ground before the frame. */
      h.call('sim_set_angle_mode', 1);
      const q = quatYPR(0, 0, 25);
      h.call('sim_set_pose', 0, 0, 1.30, q[0], q[1], q[2], q[3]);
      h.call('sim_rest');
      h.arm();
    },
    pilot(h) {
      /* Angle mode holds the bank on the roll stick with no throttle: the
       * pilot who chopped it too high and caught it too late. */
      return h.hit ? HANDS_OFF : [25 / 55, 0, 0, 0];
    },
  },
  {
    id: 'q5-slope',
    title: 'Five inch flies level at 12 m/s into a 30 deg grass slope and tumbles down it',
    craft: '5inch',
    family: 'slope tumble',
    map: 'alps',
    seconds: 16,
    /* The slope is the scenario's, not the map's: the sheet draws it. */
    sheetGround: { n: [-0.5, 0, 0.8660254037844386], p: [0, 0, 0] },
    setup(h) {
      /* The slope rises toward +x through the origin: z = x tan 30. */
      h.call('sim_set_ground', 1, -0.5, 0, 0.8660254037844386, 0, 0, 0, GROUND_MU, GROUND_E);
      /* 30 deg is under the steepness the shell calls rock (normal up
       * 0.87 over 0.75): a grass slope. */
      h.call('sim_set_ground_material', SURFACE.grass);
      h.call('sim_set_angle_mode', 1);
      const q = quatYPR(0, 0, 0);
      /* 2 m over the map's ground, 30 m short of where the slope meets
       * that height, so the run in is level over the valley floor and the
       * slope is the first thing it meets. */
      h.call('sim_set_pose', -30, 0, 2, q[0], q[1], q[2], q[3]);
      h.mem.x0 = -30;
      h.arm();
    },
    pilot(h) {
      return h.hit ? HANDS_OFF : quadHold(h, { v: 12, z: 2 });
    },
  },
  {
    id: 'q5-branch',
    title: 'Five inch clips a 3 cm branch with its left arms at 10 m/s',
    craft: '5inch',
    family: 'branch',
    map: 'city',
    seconds: 10,
    setup(h) {
      grass(h);
      quadSetup(h, 3.0);
    },
    pilot(h) {
      if (h.hit) {
        return HANDS_OFF;
      }
      const v = 10;
      if (!h.mem.placed && h.ms > 500 && atSpeed(h, v)) {
        /* A branch reaching in from the left at the height of the arms,
         * its tip 8 cm inside the prop disc. */
        const s = h.s;
        const reach = 0.110 + 0.0635;
        h.place({ kind: 'tree', shape: 'capsule', a: [s[1] + 2.5, s[2] + reach + 0.015 - 0.08, s[3]], b: [s[1] + 2.5, s[2] + 3.0, s[3] + 0.4], r: 0.015 });
        h.mem.placed = true;
        h.arm();
      }
      return quadHold(h, { v, z: 3.0 });
    },
  },
  {
    id: 'q5-inverted',
    title: 'Five inch comes down upside down onto grass at 3 m/s, then turtle',
    craft: '5inch',
    family: 'inverted landing',
    map: 'city',
    seconds: 8,
    afterRestMs: 2500,
    setup(h) {
      grass(h);
      /* Acro, the way a freestyle pilot flies; inverted, dropped from the
       * height that gives 3 m/s. */
      h.call('sim_set_pose', 0, 0, 0.50, 0, 1, 0, 0);
      h.call('sim_rest');
      h.arm();
    },
    pilot(h) {
      const m = h.mem;
      if (h.rest && !m.turtleAt) {
        m.turtleAt = h.ms;
        h.call('sim_set_crashflip', 1);
      }
      if (m.turtleAt) {
        /* Crashflip on the pitch stick for 1.8 s, the contact self-test's
         * proof, reading the highest the hull gets. */
        const up = attitude(h.s).upz;
        m.turtlePeakUp = Math.max(m.turtlePeakUp ?? -1, up);
        return h.ms - m.turtleAt < 1800 ? [0, -1, 0, 0] : HANDS_OFF;
      }
      return HANDS_OFF;
    },
    outcome(h) {
      return { turtlePeakUpZ: h.mem.turtlePeakUp ?? null };
    },
  },
  {
    id: 'q5-prop-loss',
    title: 'Five inch loses a prop at 15 m/s, 10 m up',
    craft: '5inch',
    family: 'prop loss',
    map: 'city',
    seconds: 16,
    /* The prop on motor 0 (Betaflight's rear right) leaves through
     * sim_part_break, exactly as a load past its joint's limit would
     * break it, and is a free body from there. */
    setup(h) {
      grass(h);
      quadSetup(h, 10.0);
    },
    pilot(h) {
      const m = h.mem;
      if (!m.lostAt && h.ms > 500 && atSpeed(h, 15)) {
        m.lostAt = h.ms;
        h.event('prop lost');
        const part = h.damage.find('prop', 0);
        if (part < 0 || h.call('sim_part_break', part) !== 0) {
          throw new Error('sim_part_break: no prop on motor 0 to lose');
        }
        h.arm();
      }
      if (h.hit) {
        return HANDS_OFF;
      }
      /* The pilot keeps trying: level, height held, which is what a hand
       * does in the half second before it knows. */
      return quadHold(h, { v: m.lostAt ? 0 : 15, z: 10 });
    },
  },
];

/* ======================== the whoop ======================== */

const K = MICRO_SCALE;
/* A whoop that survives flies on: after the contact the hand goes back to
 * holding height and a gentle speed, and the band asks whether it can. */
SCENARIOS.push(
  {
    id: 'whoop-wall',
    title: 'Whoop into a wall at 3 m/s and flies on',
    craft: 'whoop',
    family: 'wall bounce',
    map: 'custom',
    seconds: 8,
    setup(h) {
      floor(h);
      quadSetup(h, 1.0 * K);
    },
    pilot(h) {
      const v = 3 * K;
      if (!h.mem.placed && h.ms > 500 && atSpeed(h, v)) {
        h.place({ kind: 'wall', shape: 'plane', p: [h.s[1] + 1.0 * K, 0, 0], n: [-1, 0, 0] });
        h.mem.placed = true;
        h.arm();
      }
      if (h.hit) {
        return quadHold(h, { v: 0, z: 1.0 * K });
      }
      return quadHold(h, { v, z: 1.0 * K });
    },
  },
  {
    id: 'whoop-floor',
    title: 'Whoop drops onto the floor at 2 m/s and flies on',
    craft: 'whoop',
    family: 'floor bounce',
    map: 'custom',
    seconds: 6,
    setup(h) {
      floor(h);
      h.call('sim_set_angle_mode', 1);
      /* The height that gives 2 m/s, in the room's units. */
      const z = (2 * K) * (2 * K) / (2 * 9.80665) + 0.05;
      h.call('sim_set_pose', 0, 0, z, 1, 0, 0, 0);
      h.call('sim_rest');
      h.mem.x0 = 0;
      h.arm();
    },
    pilot(h) {
      if (h.hit && h.ms - h.hit.ms > 150) {
        return quadHold(h, { v: 0, z: 0.5 * K });
      }
      return [0, 0, 0, 0];
    },
  },
  {
    id: 'whoop-gate',
    title: 'Whoop clips a gate upright at full speed',
    craft: 'whoop',
    family: 'gate clip',
    map: 'custom',
    seconds: 10,
    setup(h) {
      floor(h);
      quadSetup(h, 0.6 * K);
    },
    pilot(h) {
      /* Full speed of a 65 mm 1S whoop, the reference's figure, in the
       * room's units; the plant is the five inch's, whose ceiling is about
       * 35 m/s, so the room's scale caps what is flyable here. */
      const v = Math.min(8 * K, 32);
      if (!h.mem.placed && h.ms > 500 && atSpeed(h, v)) {
        const s = h.s;
        const reach = 0.110 + 0.0635;
        /* A RaceGOW gate's side, 20 mm tube in real units. */
        const r = 0.010 * K;
        h.place({ kind: 'gate', shape: 'capsule', a: [s[1] + 1.0 * K, s[2] - (reach + r - 0.08), 0], b: [s[1] + 1.0 * K, s[2] - (reach + r - 0.08), 1.5 * K], r });
        h.mem.placed = true;
        h.arm();
      }
      if (h.hit) {
        return quadHold(h, { v: 0, z: 0.6 * K });
      }
      return quadHold(h, { v, z: 0.6 * K });
    },
  },
);

/* ======================== each plane ======================== */

const PLANES = ['sky', 'cub', 'radian', 'slowstick', 'timber', 'bramor'];

function planeScenarios(key) {
  const c = CRAFT[key];
  const out = [];
  const stab0 = (h) => h.call('sim_wing_set_stab', 0);
  out.push({
    id: `${key}-stall`,
    title: 'Stalled 8 m up, power off, stick held back, into the grass',
    family: 'stall in',
    seconds: 14,
    setup(h) {
      grass(h);
      stab0(h);
      planeLaunch(h, { z: 8, v: 1.15 * c.Vs });
      h.arm();
    },
    pilot(h) {
      return h.hit ? HANDS_OFF : [0, 1, 0, 0];
    },
  });
  out.push({
    id: `${key}-nose-in`,
    title: 'Dived 45 deg nose down into the grass at full throttle',
    family: 'nose in',
    seconds: 8,
    setup(h) {
      grass(h);
      stab0(h);
      planeLaunch(h, { z: 15, pitch: -45, v: c.Vt });
      h.arm();
    },
    pilot(h) {
      return h.hit ? HANDS_OFF : planeHold(h, { pitch: -45, thr: 1 });
    },
  });
  out.push({
    id: `${key}-cartwheel`,
    title: 'Low pass banked 40 deg, the low wingtip catches the grass',
    family: 'wingtip cartwheel',
    seconds: 10,
    setup(h) {
      grass(h);
      stab0(h);
      /* The low tip 10 cm over the grass: the hull's half span along the
       * bank, less nothing for its thickness, which only makes it closer. */
      planeLaunch(h, { z: 0.10 + h.dims.hullR * Math.sin(40 * DEG), bank: 40, pitch: -2, v: 1.3 * c.Vs });
      h.arm();
    },
    pilot(h) {
      return h.hit ? HANDS_OFF : planeHold(h, { bank: 40, pitch: -2, thr: 0.3 });
    },
  });
  out.push({
    id: `${key}-belly-fast`,
    title: c.wheels ? 'Landed at twice the stall speed, sinking, onto its gear' : 'Belly landed at twice the stall speed, sinking',
    family: 'fast landing',
    seconds: 12,
    setup(h) {
      grass(h);
      stab0(h);
      planeLaunch(h, { z: h.dims.vHalfDown + 0.6, pitch: -4, v: 2 * c.Vs });
      h.arm();
    },
    pilot(h) {
      /* The approach flown on the sink rate, 1.5 m/s down, because at
       * twice the stall a fixed attitude balloons away from the grass. */
      if (h.hit) {
        return HANDS_OFF;
      }
      const pitch = Math.max(-15, Math.min(5, -4 + 4 * (-1.5 - h.s[6])));
      return planeHold(h, { pitch, thr: 0 });
    },
  });
  if (c.wheels) {
    /* The taildragger's take off accident (docs/CRASH-PLAN.md, lead
     * decision after the baseline; docs/CRASH-REFERENCES.md R-NOSEOVER),
     * flown on the ground the references name: a soft field, loose sand,
     * whose rolling resistance holds the wheels back (src/native/plant.c
     * plant_wheel_roll), with the tail pushed up by full down elevator at
     * full power before the aircraft has the speed to fly, which the
     * Airplane Flying Handbook's soft field take off keeps low for exactly
     * this reason. The drag at the wheels under the CG and the thrust line
     * above the axles tip it forward onto the prop. The FMS models have
     * no brakes (sim_set_brake), so the soft ground is the cause. */
    out.push({
      id: `${key}-nose-over`,
      title: 'Take off roll on soft sand at full power, full down elevator pushed too early: tail up, nose over onto the prop',
      family: 'nose over',
      seconds: 10,
      /* Standing on its wheels from the start: the impact is the first
       * touch of anything that is not a wheel, the prop's tip or the hull. */
      impactOn: ['hull', 'prop tip'],
      setup(h) {
        grass(h);
        h.call('sim_set_ground_material', SURFACE.sand);
        stab0(h);
        onWheels(h, c);
        h.arm();
      },
      pilot(h) {
        /* Half a second of acceleration with the stick neutral, then full
         * down elevator held until something other than a wheel touches;
         * then the throttle is chopped, the reflex after a prop strike. */
        if (h.hit) {
          return HANDS_OFF;
        }
        return h.ms < 500 ? [0, 0, 0, 1] : [0, -1, 0, 1];
      },
    });
  }
  out.push({
    id: `${key}-pole`,
    title: 'Level at cruise, a wing into a 25 cm wooden pole',
    family: 'pole',
    seconds: 10,
    setup(h) {
      grass(h);
      stab0(h);
      planeLaunch(h, { z: 2.5, v: c.Vc });
      /* The pole 6 m ahead, 60 percent of the half span out to the right:
       * the outer wing panel takes it, as a hit usually is. */
      h.place({ kind: 'pole', shape: 'capsule', a: [6, -0.6 * h.dims.hullR, 0], b: [6, -0.6 * h.dims.hullR, 9], r: 0.125 });
      h.arm();
    },
    pilot(h) {
      return h.hit ? HANDS_OFF : planeHold(h, { thr: c.cruise });
    },
  });
  out.push({
    id: `${key}-tree`,
    title: 'Level at cruise into a tree canopy',
    family: 'tree',
    seconds: 12,
    setup(h) {
      grass(h);
      stab0(h);
      planeLaunch(h, { z: 5, v: c.Vc });
      /* A broadleaf about 9 m tall: a crown of radius 3 m centred 6 m up
       * on a 40 cm trunk, its near edge 5 m ahead. */
      h.tree({ x: 8 + h.dims.hullR, y: 0, trunkR: 0.2, trunkTop: 4, crownZ: 6, crownR: 3 });
      h.arm();
    },
    pilot(h) {
      return h.hit ? HANDS_OFF : planeHold(h, { thr: c.cruise });
    },
  });
  if (key === 'bramor') {
    out.push({
      id: 'bramor-chute',
      title: 'Parachute from cruise 60 m up, down onto the grass, drag and rest',
      family: 'chute landing',
      seconds: 45,
      /* The drag in wind this scenario is named for needs wind in the air
       * (WIND_ENTRY above). 10 m/s along the flight, the middle of
       * R-CHUTE's derivation, where the canopy pulls about 210 N against
       * 22 N of friction: dragged. */
      needs: WIND_ENTRY,
      blocked: 'no horizontal wind in the air model, so a canopy cannot drag the aircraft after touchdown',
      setup(h) {
        grass(h);
        wind(h, 10, 0, 0);
        h.call('sim_wing_set_stab', 1);
        h.call('sim_wing_chute', 0);
        planeLaunch(h, { z: 60, v: 16 });
        h.call('sim_wing_chute', 1);
        h.arm();
      },
      pilot() {
        return [0, 0, 0, 0];
      },
    });
    out.push({
      id: 'bramor-catapult-stall',
      title: 'Catapult shot at 11 m/s, under the 13 m/s stall',
      family: 'launch stall',
      seconds: 10,
      setup(h) {
        grass(h);
        h.call('sim_wing_set_stab', 1);
        h.call('sim_wing_chute', 0);
        /* The rail the shell draws, 20 deg up, the aircraft 1.17 m up on
         * the cradle, let go at 11 m/s where the catapult is set for 17. */
        const q = quatYPR(0, BRAMOR_CATAPULT.pitchDeg, 0);
        h.call('sim_set_pose', 0, 0, BRAMOR_CATAPULT.height, q[0], q[1], q[2], q[3]);
        h.call('sim_wing_launch', 11);
        h.arm();
      },
      pilot(h) {
        /* Full throttle, wings level, stick centred in Stabilised: the
         * autopilot's climb out, which cannot save it. */
        return h.hit ? HANDS_OFF : [0, 0, 0, 1];
      },
    });
  }
  return out.map((o) => ({ craft: key, map: 'airfield', ...o, title: `${o.title}` }));
}

for (const key of PLANES) {
  SCENARIOS.push(...planeScenarios(key));
}

/* ======================== the floats ======================== */

function floatScenarios(key) {
  const c = CRAFT[key];
  return [
    {
      id: `${key}-nose-dig`,
      title: 'Touched down on the water nose down at 1.6 times the stall',
      family: 'nose dig',
      seconds: 12,
      setup(h) {
        water(h);
        h.call('sim_wing_set_stab', 0);
        planeLaunch(h, { z: c.floats.z + 0.5, pitch: -12, v: 1.6 * c.Vs });
        h.arm();
      },
      pilot(h) {
        return h.hit ? HANDS_OFF : planeHold(h, { pitch: -12, thr: 0 });
      },
    },
    {
      id: `${key}-float-catch`,
      title: 'On the step at 9 m/s, full rudder and aileron into a hard turn',
      family: 'float catch',
      seconds: 12,
      setup(h) {
        water(h);
        h.call('sim_wing_set_stab', 0);
        onWater(h, c);
        h.call('sim_wing_launch', 9);
      },
      pilot(h) {
        if (!h.mem.armed && h.ms >= 300) {
          h.mem.armed = true;
          h.arm();
        }
        return h.ms < 300 ? [0, 0, 0, 0.8] : [1, 0, 1, 0.8];
      },
      /* Already on the water: the impact is the turn, not a first touch. */
      impactOnArm: true,
    },
    {
      id: `${key}-capsize`,
      title: 'Taxiing crosswind in a 15 m/s gust',
      family: 'capsize',
      seconds: 12,
      needs: WIND_ENTRY,
      blocked: 'no horizontal wind in the air model: the gust that lifts the upwind wing cannot be flown, only the waves the water wind raises',
      setup(h) {
        const body = water(h);
        h.call('sim_water_wind', body, 15, 0, 1, 2000);
        /* The gust across the aircraft, from its left (world +y). */
        wind(h, 0, -15, 0);
        h.call('sim_wing_set_stab', 0);
        onWater(h, c);
        h.arm();
      },
      pilot() {
        return [0, 0, 0, 0.25];
      },
      impactOnArm: true,
    },
    {
      id: `${key}-porpoise`,
      title: 'Take off with the stick held full back from the start: porpoise, early lift off, stall',
      family: 'porpoise',
      seconds: 15,
      setup(h) {
        water(h);
        h.call('sim_wing_set_stab', 0);
        onWater(h, c);
        h.arm();
      },
      pilot() {
        return [0, 1, 0, 1];
      },
      impactOnArm: true,
    },
  ].map((o) => ({ craft: key, map: 'alps', ...o }));
}

SCENARIOS.push(...floatScenarios('timberf'), ...floatScenarios('cubf'));
