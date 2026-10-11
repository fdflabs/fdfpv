/*
 * footinput.js: the pilot on foot's controls, read off whatever device is
 * there into the one shape the walk takes (src/game/onfoot.js step):
 *   { move: [right, forward], look: [turn right, look up] in rad, run }.
 * The walk never knows the device. While on foot the flight ladder is
 * held centred (input.js rung 1a), so these are read here raw, before any
 * stick mode or radio map, as the builder reads its camera's.
 *
 *   keyboard + mouse  W A S D or the arrows move, Shift runs, the mouse
 *                     looks while the pointer is captured (main.js owns
 *                     the capture)
 *   gamepad           a standard pad's left stick moves, right stick
 *                     looks, the left stick pressed (L3) runs until the
 *                     stick comes back to rest; nothing on a radio, whose
 *                     axes are not a person's
 *   touch             the left thumb moves, the right thumb looks
 *                     (touchsticks.js raw)
 * Every source adds; keys win nothing over a stick, both just walk.
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

/* rad per mouse count, about a quarter of a degree: a hand's sweep of
 * the mouse turns the body round, ESTIMATED. */
const LOOK_PER_COUNT = 0.0025;
/* rad/s at a full look stick or thumb, the hub hangar's turn rate
 * (src/game/hangarroom.js). */
const LOOK_RATE = 2.6;
/* A stick's middle ignored, as the hangar camera's (src/input/menus.js). */
const DEADZONE = 0.2;
const L3 = 10;

const live = (v) => (Math.abs(v) < DEADZONE ? 0 : (v - Math.sign(v) * DEADZONE) / (1 - DEADZONE));

/* `isLocked()` says whether the pointer is captured for the walk. */
export function createFootInput(input, isLocked) {
  const mouse = { dx: 0, dy: 0 };
  let runLatched = false;
  let l3Was = false;
  window.addEventListener('mousemove', (e) => {
    if (input.onFoot && isLocked()) {
      mouse.dx += e.movementX || 0;
      mouse.dy += e.movementY || 0;
    }
  });
  const out = { move: [0, 0], look: [0, 0], run: false };

  /* This frame's controls, `dt` seconds after the last read. */
  function read(dt, gp, touch) {
    const k = input.keys;
    const held = (a, b) => k.has(a) || k.has(b);
    let right = Number(held('KeyD', 'ArrowRight')) - Number(held('KeyA', 'ArrowLeft'));
    let forward = Number(held('KeyW', 'ArrowUp')) - Number(held('KeyS', 'ArrowDown'));
    let turn = mouse.dx * LOOK_PER_COUNT;
    let up = -mouse.dy * LOOK_PER_COUNT;
    mouse.dx = 0;
    mouse.dy = 0;
    let run = k.has('ShiftLeft') || k.has('ShiftRight');
    if (gp && gp.mapping === 'standard' && gp.axes && gp.axes.length >= 4) {
      const mx = live(gp.axes[0] || 0);
      const my = live(gp.axes[1] || 0);
      right += mx;
      forward -= my;
      turn += live(gp.axes[2] || 0) * LOOK_RATE * dt;
      up -= live(gp.axes[3] || 0) * LOOK_RATE * dt;
      const l3 = Boolean(gp.buttons && gp.buttons[L3] && gp.buttons[L3].pressed);
      if (l3 && !l3Was) {
        runLatched = !runLatched;
      }
      l3Was = l3;
      if (mx === 0 && my === 0) {
        runLatched = false;
      }
      run = run || runLatched;
    }
    if (touch) {
      const t = touch.raw();
      right += t.left.x;
      forward -= t.left.y;
      turn += t.right.x * LOOK_RATE * dt;
      up -= t.right.y * LOOK_RATE * dt;
    }
    out.move[0] = right;
    out.move[1] = forward;
    out.look[0] = turn;
    out.look[1] = up;
    out.run = run;
    return out;
  }

  /* Look input from before the walk began is not the walk's. */
  function clear() {
    mouse.dx = 0;
    mouse.dy = 0;
    runLatched = false;
  }

  return { read, clear };
}
