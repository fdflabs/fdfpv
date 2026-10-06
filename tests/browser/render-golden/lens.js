/*
 * render-golden/lens.js: src/render/lens.js's constants, the camera angle
 * clamp and tilt, the lens clearance, and the shake fed a seeded random
 * stream through frame times and rotor speeds out of range both ways.
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

import * as lens from '../../../src/render/lens.js';

/* Math.random replaced by a fixed sequence for the length of `fn`. */
function seeded(fn) {
  const real = Math.random;
  let s = 0x2545f491;
  Math.random = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  try {
    return fn();
  } finally {
    Math.random = real;
  }
}

export function cases() {
  return {
    constants: () => Object.fromEntries(Object.entries(lens).filter(([, v]) => typeof v !== 'function')),
    exports: () => Object.keys(lens).sort(),
    clamp: () => [-10, -0.6, -0.4, 0, 0.49, 0.5, 1.5, 29.5, 30, 54.4, 54.5, 55, 56, 1e9, -Infinity, Infinity, NaN, '30', null, undefined, true]
      .map((v) => [String(v), lens.clampCameraAngle(v)]),
    tilt: () => [0, 1, 30, 55, -20, 90, 0.5].map(lens.cameraTiltRad),
    clear: () => {
      const rows = [];
      for (const fwd of [-1, -0.13, -0.12, -0.11, 0, 0.5, 1]) {
        for (const up of [-1, 0, 0.34, 0.35, 0.36, 1]) {
          rows.push(lens.fpvLensClear(fwd, up));
        }
      }
      return rows;
    },
    shake: () => seeded(() => {
      const a = lens.makeLensShake();
      const b = lens.makeLensShake();
      const rows = [];
      for (let i = 0; i < 300; i++) {
        const dt = i === 50 ? 500 : i === 51 ? 0 : i === 52 ? -16 : [16.7, 6.94, 33.3, 4.17][i % 4];
        const rpm = i < 20 ? 0 : i < 40 ? -0.5 : i < 200 ? (i % 100) / 80 : 1.7;
        const o = a.update(dt, rpm);
        const row = [o.x, o.y, o.z];
        /* The same object comes back every frame: callers keep it. */
        row.push(o === a.update(0, 0) ? 'same' : 'fresh');
        rows.push(row);
        if (i % 10 === 0) {
          const p = b.update(dt, 1);
          rows.push(['b', p.x, p.y, p.z]);
        }
      }
      return rows;
    }),
  };
}
