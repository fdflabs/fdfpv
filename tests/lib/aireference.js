/*
 * aireference.js: a course's referee and a reference line through every
 * gate, which scripts/build-selftest.js lays along a built track. It was
 * the AI pilot's bench, which left with the AI opponent in the combat-only
 * cut; the line is all the builder's check still asks of it.
 *
 * The reference line, scene frame: in flying order from the timing gate,
 * straight through each gate along its travel axis for GATE_RUN either
 * side, cubic Hermite curves between (tangent length the chord), flown at
 * a pace along its length; line time 0 is the timing gate's centre.
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

import { Race } from '../../src/game/race.js';
import { threePosToSim } from '../../src/render/frame.js';

/* The reference line runs straight this far either side of a gate. */
export const GATE_RUN = 4;

/* course: raceFromDocument's answer. */
export function aiBench({ course }) {
  const referee = () => {
    const race = new Race(course.gates, course.trackClass);
    race.saveRecord = () => {};
    return race;
  };

  /*
   * The reference line, scene frame: in flying order from the timing gate,
   * straight through each gate along its travel axis for GATE_RUN either
   * side, cubic Hermite curves between (tangent length the chord), flown
   * at `pace` along its length. Line time 0 is the timing gate's centre.
   */
  function referenceLine(pace) {
    const order = course.gates.length ? referee().gates : [];
    const start = order.findIndex((g) => !g.virtual);
    const knots = [];
    for (let k = 0; k < order.length; k += 1) {
      const g = order[(start + k) % order.length];
      const c = [g.x, g.y + g.apertures[0].centreY, g.z];
      const t = [g.az.x, g.az.y, g.az.z];
      knots.push({ p: c.map((v, i) => v - t[i] * GATE_RUN), t }, { p: c.map((v, i) => v + t[i] * GATE_RUN), t });
    }
    const segs = knots.map((A, i) => {
      const B = knots[(i + 1) % knots.length];
      const L = Math.hypot(...B.p.map((v, j) => v - A.p[j]));
      const f = (u) => {
        const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
        const h10 = u ** 3 - 2 * u ** 2 + u;
        const h01 = -2 * u ** 3 + 3 * u ** 2;
        const h11 = u ** 3 - u ** 2;
        return [0, 1, 2].map((k) => h00 * A.p[k] + h10 * L * A.t[k] + h01 * B.p[k] + h11 * L * B.t[k]);
      };
      const tab = [[0, 0]];
      let len = 0;
      let prev = f(0);
      for (let j = 1; j <= 200; j += 1) {
        const q = f(j / 200);
        len += Math.hypot(q[0] - prev[0], q[1] - prev[1], q[2] - prev[2]);
        tab.push([j / 200, len]);
        prev = q;
      }
      return { f, len, tab };
    });
    const total = segs.reduce((s, x) => s + x.len, 0);
    const scene = (tMs) => {
      let s = ((((tMs / 1000) * pace + GATE_RUN) % total) + total) % total;
      let i = 0;
      while (i < segs.length - 1 && s > segs[i].len) {
        s -= segs[i].len;
        i += 1;
      }
      const { tab } = segs[i];
      let j = 1;
      while (j < tab.length - 1 && tab[j][1] < s) j += 1;
      const span = tab[j][1] - tab[j - 1][1];
      return segs[i].f(tab[j - 1][0] + ((tab[j][0] - tab[j - 1][0]) * (s - tab[j - 1][1])) / (span || 1));
    };
    const out = { x: 0, y: 0, z: 0 };
    const sim = (tMs) => {
      const q = scene(tMs);
      threePosToSim(q[0], q[1], q[2], out);
      return [out.x, out.y, out.z];
    };
    const H = 20;
    return {
      durationMs: (total / pace) * 1000,
      at(tMs) {
        const p = sim(tMs);
        const a = sim(tMs - H);
        const b = sim(tMs + H);
        const s = (H / 1000) ** 2;
        return {
          p,
          v: [0, 1, 2].map((k) => (b[k] - a[k]) / ((2 * H) / 1000)),
          a: [0, 1, 2].map((k) => (b[k] - 2 * p[k] + a[k]) / s),
        };
      },
    };
  }

  return { referee, referenceLine };
}
