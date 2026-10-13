/*
 * aireference.js: the bench the AI pilot is proven on (scripts/aipilot-
 * harness.js) and the ghosts the page's checks race it against
 * (scripts/debrief-race-check.js): a quad seated as the page seats one,
 * the course's referee, a reference line through every gate, and a flight
 * on the real plant from a hover on a line, judged by src/game/race.js
 * and, when asked, recorded the way src/main.js records a lap.
 *
 * The reference line, scene frame: in flying order from the timing gate,
 * straight through each gate along its travel axis for GATE_RUN either
 * side, cubic Hermite curves between (tangent length the chord), flown at
 * a pace along its length; line time 0 is the timing gate's centre. The
 * reference pilot flies it with the AI pilot's own law with no delay and
 * no hand (REFERENCE_PERSON), so its lap is the plant's.
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

import { loadSim, SIM_OK } from './simmod.js';
import { Race } from '../../src/game/race.js';
import { GhostRecorder } from '../../src/game/ghost.js';
import { simPosToThree, simQuatToThree, threeDirToSim, threePosToSim } from '../../src/render/frame.js';
import { AI_STEP_MS, aiPilot, learnSticks } from '../../src/game/aipilot.js';
import { START_MS } from '../../src/game/aiopponent.js';

/* A flight starts from a hover START_MS before the line's zero, as the
 * page's opponent does. */
export { START_MS };
/* The reference line runs straight this far either side of a gate. */
export const GATE_RUN = 4;
/* The reference pilot: the law looking every step with no delay. */
export const REFERENCE_PERSON = { delayMs: 0, everyMs: AI_STEP_MS };

/*
 * af: the airframe (configs/airframes.js); tune: its composed config text;
 * course: raceFromDocument's answer; rates: the profile in the tune;
 * cellVoltage: the pack.
 */
export function aiBench({ wasm, af, tune, course, rates, cellVoltage = 4.2 }) {
  async function seat() {
    const sim = await loadSim(wasm);
    const must = (code, what) => {
      if (code !== SIM_OK) throw new Error(`${what} returned ${code}`);
    };
    must(sim.e.sim_set_airframe(af.simId), 'sim_set_airframe');
    must(sim.init(tune), 'sim_init');
    must(sim.e.sim_set_gravity(af.gravityBase), 'sim_set_gravity');
    must(sim.reset(), 'sim_reset');
    must(sim.setCellVoltage(cellVoltage), 'sim_set_cell_voltage');
    must(sim.setAngleMode(true), 'sim_set_angle_mode');
    return sim;
  }

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

  /* A referee's gate as the pilot sees it: the opening's centre and the
   * travel axis, plant frame (src/game/aipilot.js gateAim). */
  function gateOf(g) {
    const c = threePosToSim(g.x, g.y + g.apertures[0].centreY, g.z, { x: 0, y: 0, z: 0 });
    const n = threeDirToSim(g.az.x, g.az.y, g.az.z, { x: 0, y: 0, z: 0 });
    return { c: [c.x, c.y, c.z], n: [n.x, n.y, n.z] };
  }

  /* Per gate, the worst miss of the craft's centre off the opening's centre
   * at its crossings of the gate's plane, in the gate's axes; the flight
   * counts it from its first lap's close, past the start from a hover. */
  function crossings(race, prev, curr, worst) {
    for (const g of race.gates) {
      const ap = g.apertures[0];
      const local = (P) => {
        const d = [P.x - g.x, P.y - (g.y + ap.centreY), P.z - g.z];
        const dot = (a) => d[0] * a.x + d[1] * a.y + d[2] * a.z;
        return [dot(g.ax), dot(g.ay), dot(g.az)];
      };
      const a = local(prev);
      const b = local(curr);
      if (!(a[2] < 0 && b[2] >= 0) || Math.hypot(b[0], b[1]) > 20) continue;
      const off = Math.max(Math.abs(b[0]) / (ap.clearW / 2), Math.abs(b[1]) / (ap.clearH / 2));
      if (!(worst.get(g.idx)?.off >= off)) worst.set(g.idx, { off, gate: g.idx, x: b[0], y: b[1], half: ap.clearW / 2 });
    }
  }

  /*
   * One flight from a hover on `line` START_MS before its zero, `pilot` on
   * the sticks (null: centred at the hover), until `laps` laps close or the
   * line has gone round laps + 2 times. Every step's pose goes through
   * frame.js to the referee, and to `record` (main.js's recorder order) if
   * given, which keeps lap `recordLap` (1 based).
   */
  async function fly({ line, pilot, learnt, laps, recordLap = 0 }) {
    const sim = await seat();
    const at = line.at(START_MS);
    const to = line.at(START_MS + 100);
    const psi = Math.atan2(to.p[1] - at.p[1], to.p[0] - at.p[0]);
    sim.e.sim_set_pose(at.p[0], at.p[1], at.p[2], Math.cos(psi / 2), 0, 0, Math.sin(psi / 2));
    const race = referee();
    const seenGates = race.gates.map(gateOf);
    const rec = new GhostRecorder();
    const worst = new Map();
    const v = { x: 0, y: 0, z: 0, w: 1, set(a, b, c, d) { Object.assign(this, { x: a, y: b, z: c, w: d }); return this; } };
    let ghost = null;
    let prev = null;
    const endMs = (laps + 2) * line.durationMs - START_MS;
    for (let ms = 0; ms < endMs && race.laps.length < laps; ms += AI_STEP_MS) {
      const sticks = pilot ? pilot.sticks(ms, sim.readState().state, seenGates[race.next]) : [0, 0, 0, learnt.hover];
      sim.input(ms / 1000, ...sticks);
      sim.step(AI_STEP_MS);
      const s = sim.readState().state;
      simPosToThree(s[1], s[2], s[3], v);
      const curr = { x: v.x, y: v.y, z: v.z };
      simQuatToThree(s[7], s[8], s[9], s[10], v);
      const q = [v.x, v.y, v.z, v.w];
      const t = ms + AI_STEP_MS;
      if (prev) {
        const lapsBefore = race.laps.length;
        const startBefore = race.lapStartMs;
        race.update(prev, curr, t, 0);
        if (race.laps.length > 0) crossings(race, prev, curr, worst);
        if (recordLap) {
          if (race.laps.length > lapsBefore && race.laps.length === recordLap) {
            rec.push(t - race.lapStartMs + race.lastLapMs, curr.x, curr.y, curr.z, ...q);
            ghost = rec.finish(race.lastLapMs, race.lastSplits);
          }
          if (race.lapStartMs !== startBefore && race.laps.length === recordLap - 1) {
            rec.begin();
            rec.push(prev.t - race.lapStartMs, prev.x, prev.y, prev.z, ...prev.q);
          }
          if (rec.armed) rec.push(t - race.lapStartMs, curr.x, curr.y, curr.z, ...q);
        }
      }
      prev = { ...curr, t, q };
    }
    return { race, ghost, worst };
  }

  /* The ghost record (GhostRecorder's) of the reference pilot's second lap
   * at `pace` (the first starts from a hover), or null when it cannot lap. */
  async function referenceGhost(learnt, pace) {
    const ref = referenceLine(pace);
    const flown = await fly({
      line: ref, learnt, laps: 2, recordLap: 2,
      pilot: aiPilot({ line: ref, rates, learnt, startMs: START_MS, person: REFERENCE_PERSON, quantise: false }),
    });
    return flown.ghost;
  }

  async function learn() {
    return learnSticks(await seat(), rates);
  }

  return { seat, referee, referenceLine, gateOf, fly, referenceGhost, learn };
}
