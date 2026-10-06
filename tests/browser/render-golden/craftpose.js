/*
 * render-golden/craftpose.js: src/render/craftpose.js's display pose
 * flown through a scripted stick sequence in both modes, frame by frame:
 * the attitude, the hover height, the props, the discs, the arm lights and
 * the motors' glow.
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
import { PROP_SPIN, HOVER, damp, createCraftPose } from '../../../src/render/craftpose.js';

/* The parts of a display model the pose writes to, recording what it was
 * handed. `leds` is false for a model with no arm lights, true for four,
 * or 'some' for lights on two arms only. */
function fakeHero(leds) {
  const ledAt = (m) => (leds === true || (leds === 'some' && m % 2 === 0)
    ? { base: [0xff2a2a, 0x2aff6a, 0x2a8cff, 0xffd02a][m], mat: { color: new THREE.Color() } }
    : null);
  return {
    cameraMount: { rotation: { x: 0 } },
    blades: [0, 1, 2, 3].map(() => ({ rotation: { y: 0 } })),
    discs: [0, 1, 2, 3].map(() => ({ material: { opacity: 0 } })),
    leds: leds ? [0, 1, 2, 3].map(ledAt) : undefined,
    stator: { emissive: new THREE.Color(), emissiveIntensity: 0 },
  };
}

function snapshot(pose, hero, solver, thr) {
  return {
    thr,
    q: pose.quaternion.toArray(),
    y: pose.position.y,
    tilt: hero.cameraMount.rotation.x,
    blades: hero.blades.map((b) => b.rotation.y),
    discs: hero.discs.map((d) => d.material.opacity),
    leds: hero.leds ? hero.leds.map((l) => (l ? l.mat.color.getHex() : null)) : null,
    stator: [hero.stator.emissive.r, hero.stator.emissive.g, hero.stator.emissive.b, hero.stator.emissiveIntensity],
    state: JSON.parse(JSON.stringify(solver.state)),
  };
}

/* Sticks over time: a punch, rolls and flips past the deadband, a yaw, a
 * stick inside the deadband, missing channels and out of range throttle. */
function sticks(i) {
  const s = i / 20;
  if (i % 37 === 5) {
    return {};
  }
  return {
    roll: Math.sin(s * 1.3) * (i % 50 < 25 ? 1 : 0.1),
    pitch: Math.cos(s * 0.7) * 0.9,
    yaw: i % 60 < 30 ? 0.5 * Math.sin(s) : 0.12,
    throttle: i % 90 < 10 ? 1.4 : i % 90 < 20 ? -0.3 : 0.5 + 0.5 * Math.sin(s * 0.4),
  };
}

function fly(leds, plan) {
  const solver = createCraftPose();
  const hero = fakeHero(leds);
  const pose = new THREE.Object3D();
  const frames = [];
  let now = 1000;
  for (let i = 0; i < plan.length; i++) {
    const [dtMs, angle, cam] = plan[i];
    now += dtMs;
    const thr = solver.update(dtMs, sticks(i), now, cam, angle, hero, pose);
    if (i % 7 === 0 || i === plan.length - 1) {
      frames.push(snapshot(pose, hero, solver, thr));
    }
  }
  solver.reset(pose);
  frames.push(snapshot(pose, hero, solver, null));
  solver.update(16, sticks(3), now + 16, 40, true, hero, pose);
  solver.reset();
  frames.push(snapshot(pose, hero, solver, null));
  return frames;
}

/* Frame times include a stall past the 50 ms clamp, a zero and a
 * negative; mode switches both ways; camera angles set and left out. */
function plan(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const dt = i === 40 ? 250 : i === 41 ? 0 : i === 42 ? -5 : [16.7, 8.3, 33.3, 6.9][i % 4];
    const angle = (i >= 60 && i < 120) || i >= 170;
    const cam = i % 3 === 0 ? undefined : i % 3 === 1 ? 30 : 47;
    out.push([dt, angle, cam]);
  }
  return out;
}

export function cases() {
  return {
    constants: () => ({ PROP_SPIN, HOVER }),
    damp: () => {
      const rows = [];
      for (const cur of [0, 0.5, -2]) {
        for (const target of [1, 0.016, -3]) {
          for (const lambda of [6, 9, 10, 0]) {
            for (const dt of [0, 0.0167, 0.05, 1]) {
              rows.push(damp(cur, target, lambda, dt));
            }
          }
        }
      }
      return rows;
    },
    flightLeds: () => fly(true, plan(200)),
    flightNoLeds: () => fly(false, plan(120)),
    flightSomeLeds: () => fly('some', plan(80)),
  };
}
