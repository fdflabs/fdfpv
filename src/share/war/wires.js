/*
 * wires.js: a scripted attacker of the war mode that flies into a power
 * line (the owner, 2026-10-01: "make the enemy drones hit them
 * sometimes"). Pure, as routes.js is: the room (edge/rooms/war.js)
 * decides at an attacker's birth whether and where it strikes a line, and
 * puts the room ms it does in the birth record (`wire`); routes.js
 * planAgent ends its flight there ('wire'), so every client draws it to
 * the same point and the room's death event (why 'wire') finds it there.
 * Nothing is decided on a client, and nothing about a route changes: the
 * lines are a hazard on the way, not something the routes avoid.
 *
 * A CROSSING is where the attacker's planned path, in plan, crosses a
 * chord of a span's conductors or earth wire with its centre within
 * BAND_M above or below it there: low enough to meet it. Each span counts
 * once however many of its wires the path crosses. The path is sampled
 * every SAMPLE_MS, as the room samples it, and the crossing's time is
 * where the chord cuts the segment between two samples.
 *
 * THE ODDS. Each crossing strikes with STRIKE_P, drawn by the room from
 * the game's seed, the attacker's id and the crossing's index, so a
 * restart of the room draws the same, and the first that strikes ends the
 * flight. Most crossings are a Striker's or a decoy's run into the right
 * bank switchyard, where every line of the dam converges, and the
 * channel-low Strikers' under the spillway lines; at 0.1 a crossing that
 * is (scripts/war-routes-check.js prints it, at no error) 0.3 to 1.5
 * strikes a game in missions 1 and 4 from one pilot to eight, 0.5 to 2.3
 * in mission 2, and 1.9 to 9.3 in mission 3, the switchyard's, out of 23
 * to 128 attackers: noticeably, and rarely.
 *
 * Only + - * / here, on numbers routes.js computes the same way on every
 * engine (CLAUDE.md, determinism).
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

import { planAgent, poseAt } from './routes.js';
import ITAIPU from './itaipu-wires.js';

/* The lines each map's attackers can meet (scripts/war-targets.js
 * writes Itaipu's). */
const MAPS = { itaipu: ITAIPU };

export const BAND_M = 3;
export const SAMPLE_MS = 50;
export const STRIKE_P = 0.1;
/* The kinds the room flies on a script; a Hunter is steered by the room
 * and never planned past its birth. */
const SCRIPTED = new Set(['scout', 'loiter', 'strike', 'fpv', 'boat', 'jammer', 'decoy']);
/* The chords' grid, metres. */
const CELL = 100;

/* A map's chords in a grid, made once. */
const grids = new Map();
function gridOf(map) {
  let g = grids.get(map);
  if (g) {
    return g;
  }
  const data = MAPS[map];
  g = { chords: [], cells: new Map() };
  if (data) {
    for (const [span, ...flat] of data.spans) {
      for (let o = 0; o + 5 < flat.length; o += 6) {
        const c = { span, a: [flat[o], flat[o + 1], flat[o + 2]], b: [flat[o + 3], flat[o + 4], flat[o + 5]] };
        const k = g.chords.length;
        g.chords.push(c);
        const i0 = Math.floor(Math.min(c.a[0], c.b[0]) / CELL);
        const i1 = Math.floor(Math.max(c.a[0], c.b[0]) / CELL);
        const j0 = Math.floor(Math.min(c.a[2], c.b[2]) / CELL);
        const j1 = Math.floor(Math.max(c.a[2], c.b[2]) / CELL);
        for (let i = i0; i <= i1; i += 1) {
          for (let j = j0; j <= j1; j += 1) {
            const key = i * 65536 + j;
            if (!g.cells.has(key)) {
              g.cells.set(key, []);
            }
            g.cells.get(key).push(k);
          }
        }
      }
    }
  }
  grids.set(map, g);
  return g;
}

/*
 * Where segment p q (scene metres, y up) crosses chord c in plan, low
 * enough: the fraction along p q, or -1.
 */
function cross(p, q, c) {
  const dx = q[0] - p[0];
  const dz = q[2] - p[2];
  const ex = c.b[0] - c.a[0];
  const ez = c.b[2] - c.a[2];
  const den = dx * ez - dz * ex;
  if (den === 0) {
    return -1;
  }
  const s = ((c.a[0] - p[0]) * ez - (c.a[2] - p[2]) * ex) / den;
  const u = ((c.a[0] - p[0]) * dz - (c.a[2] - p[2]) * dx) / den;
  if (!(s >= 0 && s < 1 && u >= 0 && u <= 1)) {
    return -1;
  }
  const y = p[1] + (q[1] - p[1]) * s;
  const yw = c.a[1] + (c.b[1] - c.a[1]) * u;
  return y - yw <= BAND_M && yw - y <= BAND_M ? s : -1;
}

/*
 * The crossings of a planned attacker's path with the lines of `map`, in
 * the order it flies them: [{ t (room ms, a whole number), span }], one a
 * span, from its birth to its end (or a parked one's last move).
 */
export function wireCrossings(map, plan) {
  const g = gridOf(map);
  const out = [];
  if (!g.chords.length) {
    return out;
  }
  const end = Number.isFinite(plan.tEnd) ? plan.tEnd : plan.phases[plan.phases.length - 1].t1;
  const seen = new Set();
  let prev = poseAt(plan, plan.t0).p.slice();
  for (let t = plan.t0 + SAMPLE_MS; t - SAMPLE_MS < end; t += SAMPLE_MS) {
    const tt = t < end ? t : end;
    const cur = poseAt(plan, tt).p.slice();
    const i0 = Math.floor(Math.min(prev[0], cur[0]) / CELL);
    const i1 = Math.floor(Math.max(prev[0], cur[0]) / CELL);
    const j0 = Math.floor(Math.min(prev[2], cur[2]) / CELL);
    const j1 = Math.floor(Math.max(prev[2], cur[2]) / CELL);
    let best = null;
    for (let i = i0; i <= i1; i += 1) {
      for (let j = j0; j <= j1; j += 1) {
        for (const k of g.cells.get(i * 65536 + j) ?? []) {
          const c = g.chords[k];
          if (seen.has(c.span)) {
            continue;
          }
          const s = cross(prev, cur, c);
          if (s >= 0 && (!best || s < best.s || (s === best.s && c.span < best.span))) {
            best = { s, span: c.span };
          }
        }
      }
    }
    if (best) {
      seen.add(best.span);
      out.push({ t: Math.round(t - SAMPLE_MS + (tt - t + SAMPLE_MS) * best.s), span: best.span });
      /* Another span in the same step is met on the next pass of it. */
      t -= SAMPLE_MS;
      continue;
    }
    prev = cur;
  }
  return out;
}

/*
 * Whether a newly born attacker strikes a line, and when: the room ms of
 * the first crossing whose draw u(j) (j its index among the crossings,
 * from 0; a number in [0, 1) the room makes from its seed) is under
 * STRIKE_P, or null. `agent` is the birth record without `wire`;
 * `down`, a Set of span ids whose wires are down (their gantry broke,
 * src/share/war/damage.js), are not there to strike.
 */
export function wireStrike(mission, agent, u, down = null) {
  if (!SCRIPTED.has(agent.kind) || !MAPS[mission.map]) {
    return null;
  }
  const crossings = wireCrossings(mission.map, planAgent(mission, agent)).filter((c) => !down || !down.has(c.span));
  for (let j = 0; j < crossings.length; j += 1) {
    if (u(j) < STRIKE_P) {
      return crossings[j].t;
    }
  }
  return null;
}
