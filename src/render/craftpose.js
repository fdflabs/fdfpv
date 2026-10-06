/*
 * craftpose.js: the studio quad answering the sticks, for the Settings
 * shot. It only looks like flight: the craft that really flies is posed
 * by Betaflight and the plant, and nothing here reaches either.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';
import { CAMERA_ANGLE_DEFAULT, cameraTiltRad } from './lens.js';

/*
 * Each motor in Betaflight's order (RR, FR, RL, FL): which way its prop
 * turns about +Y (props in, so RR and FL clockwise, which is negative
 * about +Y), and the sign each stick takes in its share of the mix.
 * combatcraft.js spins its props by PROP_SPIN too.
 */
const MOTORS = [
  { spin: -1, roll: -1, pitch: -1, yaw: 1 },
  { spin: 1, roll: -1, pitch: 1, yaw: -1 },
  { spin: 1, roll: 1, pitch: -1, yaw: -1 },
  { spin: -1, roll: 1, pitch: 1, yaw: 1 },
];
export const PROP_SPIN = MOTORS.map((m) => m.spin);

/* The model's rest height over its stand, metres, and how far full
 * throttle lifts it. */
export const HOVER = 0.016;
const THROTTLE_LIFT = 0.038;

/* Acro rates, rad/s at full stick; the stick must clear the deadband to
 * move the shot at all; angle mode tilts at most this far, radians. */
const RATE = { pitch: 2.8, roll: 2.8, yaw: 2.4 };
const DEADBAND = 0.14;
const ANGLE_LIMIT = 0.70;

/* Motor speed as a fraction: idle floor and throttle span, then each
 * stick's weight in the mix. */
const IDLE = 0.16;
const SPAN = 0.84;
const MIX_TILT = 0.22;
const MIX_YAW = 0.12;

/* Exponential approach to `target` at rate `lambda`, the same however the
 * frames fall. showcase.js uses it too. Render only: Math.exp has no place
 * in the physics path. */
export function damp(cur, target, lambda, dt) {
  return cur + (target - cur) * (1 - Math.exp(-lambda * dt));
}

const unit = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const outsideDeadband = (v) => (Math.abs(v) > DEADBAND ? v : 0);

/* An arm light's colour brightened or dimmed by `gain`, each channel held
 * at full. */
function lit(hex, gain) {
  const channel = (shift) => Math.min(255, Math.round(((hex >> shift) & 255) * gain));
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/*
 * A pose solver for one model. update() writes the attitude and height to
 * `pose` and the props, discs, lights, motor glow and camera mount to
 * `hero`, and returns the throttle it used. Scratch objects are made once
 * here so a frame allocates nothing.
 */
export function createCraftPose() {
  const rate = new THREE.Vector3();
  const step = new THREE.Quaternion();
  const attitude = new THREE.Euler(0, 0, 0, 'YXZ');
  const state = {
    tiltP: 0,
    tiltR: 0,
    yawH: 0,
    wasAngle: false,
    height: HOVER,
    rpm: [IDLE, IDLE, IDLE, IDLE],
    spin: [0, 0, 0, 0],
  };

  function reset(pose) {
    if (pose) {
      pose.quaternion.identity();
      pose.position.y = HOVER;
    }
    Object.assign(state, { tiltP: 0, tiltR: 0, yawH: 0, wasAngle: false, height: HOVER });
    state.rpm.fill(IDLE);
    state.spin.fill(0);
  }

  /* Angle mode as the shot shows it: the stick holds a tilt, centred
   * sticks level the craft, yaw stays a rate. Entering it starts level. */
  function angleStep(pose, stick, dt) {
    if (!state.wasAngle) {
      pose.quaternion.identity();
      state.tiltP = 0;
      state.tiltR = 0;
      state.yawH = 0;
    }
    state.wasAngle = true;
    const follow = 1 - Math.exp(-10 * dt);
    state.tiltP += (stick.pitch * ANGLE_LIMIT - state.tiltP) * follow;
    state.tiltR += (stick.roll * ANGLE_LIMIT - state.tiltR) * follow;
    state.yawH += stick.yaw * RATE.yaw * dt;
    attitude.set(state.tiltP, -state.yawH, -state.tiltR, 'YXZ');
    pose.quaternion.setFromEuler(attitude);
  }

  /* Acro: the stick is a body rate, and centred sticks hold the attitude. */
  function acroStep(pose, stick, dt) {
    state.wasAngle = false;
    rate.set(stick.pitch * RATE.pitch, -stick.yaw * RATE.yaw, -stick.roll * RATE.roll);
    const h = dt * 0.5;
    step.set(rate.x * h, rate.y * h, rate.z * h, 1).normalize();
    pose.quaternion.multiply(step);
  }

  function update(dtMs, channels, nowMs, cameraAngle, angleMode, hero, pose) {
    const dt = Math.min(0.05, Math.max(0, dtMs) * 0.001);
    const seconds = nowMs * 0.001;
    const raw = {
      roll: channels.roll || 0,
      pitch: channels.pitch || 0,
      yaw: channels.yaw || 0,
    };
    const thr = unit(channels.throttle || 0);
    const stick = { roll: outsideDeadband(raw.roll), pitch: outsideDeadband(raw.pitch), yaw: outsideDeadband(raw.yaw) };
    (angleMode ? angleStep : acroStep)(pose, stick, dt);

    /* Two slow sines make the idle drift look like air, not a loop. */
    const drift = Math.sin(seconds * 2.15) * 0.0045 + Math.sin(seconds * 3.4) * 0.002;
    state.height = damp(state.height, HOVER + thr * THROTTLE_LIFT + drift, 6, dt);
    pose.position.y = state.height;
    hero.cameraMount.rotation.x = cameraTiltRad(cameraAngle ?? CAMERA_ANGLE_DEFAULT);

    /* The mix reads the sticks before the deadband: a small input still
     * changes the motor note even when it does not move the shot. */
    const base = IDLE + thr * SPAN;
    MOTORS.forEach((motor, m) => {
      const demand = unit(base + motor.roll * (MIX_TILT * raw.roll) + motor.pitch * (MIX_TILT * raw.pitch) + motor.yaw * (MIX_YAW * raw.yaw));
      const rpm = damp(state.rpm[m], demand, 9, dt);
      state.rpm[m] = rpm;
      state.spin[m] += (9 + rpm * 48) * motor.spin * dt;
      hero.blades[m].rotation.y = state.spin[m];
      hero.discs[m].material.opacity = 0.08 + rpm * 0.40;
      /* Combat quads have no arm lights, and one is the default racer. */
      const light = hero.leds && hero.leds[m];
      if (light) {
        light.mat.color.setHex(lit(light.base, 0.28 + rpm * 0.95));
      }
    });

    const glow = 0.12 + thr * 0.62;
    hero.stator.emissive.setRGB(0.50 * glow, 0.14 * glow, 0.04 * glow);
    hero.stator.emissiveIntensity = 0.8;
    return thr;
  }

  return { update, reset, state };
}
