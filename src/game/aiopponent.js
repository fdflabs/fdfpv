/*
 * aiopponent.js: the AI opponent of a solo race (docs/redesign/PLAN.md 18):
 * src/game/aipilot.js's person on a plant of its own, racing a ghost's
 * line round the course the pilot is on.
 *
 * ITS OWN PLANT. A second dist/sim.wasm (src/main.js's launch stand is the
 * precedent), seated as the pilot's aircraft with its default tune, the
 * menu's default rates and Betaflight's ANGLE mode, at the pilot's pack
 * voltage. It flies only through sim_input. learnSticks() is ~42 s of
 * plant (a tenth of a second of the page's time), so seatOpponent() runs
 * it once per aircraft, tune and pack, when the opponent is chosen, never
 * mid flight, and keeps the answer.
 *
 * THE SAME WORLD. The shell hands in its own crossings and its own world,
 * read and never written:
 *
 *   toSim, dirToSim   the spawn frame (main.js worldPosToSim,
 *                     worldDirToSim), a scene point or direction into
 *                     plant metres;
 *   fromSim           a plant state's position out into the scene
 *                     (main.js poseFromState);
 *   floorHeight,      the ground under the craft and its slope, the very
 *   groundNormal      functions the pilot's plant is grounded by;
 *   colliders         the course's solids (view.colliders), gate frames
 *                     among them.
 *
 * Before every 1 ms step the ground under the opponent is raised into its
 * plant (sim_set_ground, as main.js raiseGroundFromState does), the slope
 * read every eighth step of its own clock. Every OBSTACLE_STEP its hull is
 * swept through the same colliders the pilot's is, and a face met is one
 * sim_contact at the touch point with collide.js's material for that
 * kind, so a gate missed is a gate frame hit. What the pilot's contact
 * pass does and this does not: no slide along the face in rounds, no
 * moving solids' velocity, no damage model (the opponent's parts do not
 * break), no roof cover. Upside down on the ground for a second is a
 * crash: the opponent is out of the race where it lies.
 *
 * KEPT OFF THE PILOT'S RECORD (docs/AI-PILOTS-CONTRACT.md). Its own Race,
 * which never takes a record key and whose record write is a no-op; it
 * is never handed to the ghost recorder, the event log, RunWatch or the
 * progress. Its laps are its own, read by the results line.
 *
 * ITS STICKS. Every 4 ms row it flew is kept (sticks()), so a replay can
 * fly it again from them and never asks aipilot.js twice.
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

import { SIM_OK } from '../../tests/lib/simmod.js';
import { AI_STEP_MS, aiPilot, learnSticks, lineFromGhost } from './aipilot.js';
import { Race } from './race.js';
import {
  BOUNCE_SEPARATION, GROUND_E, GROUND_MU, contactMaterial, craftVerticalHalf, craftVerticalOffset,
} from './collide.js';

/* The hover the opponent starts from, this far before the ghost's timing
 * gate on its line: aipilot:harness's start. */
export const START_MS = -3000;
/* Every this many 1 ms steps the hull is swept through the solids, the
 * shell's own OBSTACLE_STEP. */
const OBSTACLE_STEP = 4;
/* The ground is sampled this far under the craft's centre (main.js
 * SURFACE_BIAS). */
const SURFACE_BIAS = 0.40;
/* Upside down (body up below this, the world's up) on the ground for this
 * long is a crash. */
const DOWN_UP = 0;
const DOWN_MS = 1000;

const learnt = new Map();

/*
 * The opponent's plant, seated and learnt. load() answers a fresh Sim
 * (simBytes.then(loadSim)); seat is { simId, tuneText, gravity, cellVoltage,
 * rates }. The learning is kept per simId, tune, pack and rates.
 */
export async function seatOpponent(load, seat) {
  const sim = await load();
  const must = (code, what) => {
    if (code !== SIM_OK) throw new Error(`AI opponent: ${what} returned ${code}`);
  };
  must(sim.e.sim_set_airframe(seat.simId), 'sim_set_airframe');
  must(sim.init(seat.tuneText), 'sim_init');
  must(sim.e.sim_set_gravity(seat.gravity), 'sim_set_gravity');
  must(sim.reset(), 'sim_reset');
  must(sim.setCellVoltage(seat.cellVoltage), 'sim_set_cell_voltage');
  must(sim.setAngleMode(true), 'sim_set_angle_mode');
  const key = JSON.stringify([seat.simId, seat.tuneText, seat.cellVoltage, seat.gravity]);
  if (!learnt.has(key)) learnt.set(key, learnSticks(sim, seat.rates));
  return { sim, learnt: learnt.get(key), rates: seat.rates };
}

/* A quaternion (x, y, z, w) turning the scene's up: its y component is
 * the cosine of the tilt. */
function upOf(q) {
  return {
    x: 2 * (q.x * q.y - q.w * q.z),
    y: 1 - 2 * (q.x * q.x + q.z * q.z),
    z: 2 * (q.y * q.z + q.w * q.x),
  };
}

export class AiOpponent {
  /*
   * seated: seatOpponent's answer. lap: the GhostLap it races (cut free).
   * gates, trackClass: the course, as the pilot's Race took them. world:
   * the shell's crossings and world, above, plus worldQuat(state, out)
   * (the attitude in the scene, x y z w).
   */
  constructor({ seated, lap, gates, trackClass, world }) {
    this.sim = seated.sim;
    this.world = world;
    this.race = new Race(gates, trackClass);
    this.race.saveRecord = () => {};
    this.line = lineFromGhost(lap, world.toSim);
    this.pilot = aiPilot({ line: this.line, rates: seated.rates, learnt: seated.learnt, startMs: START_MS });
    this.hover = seated.learnt.hover;
    this.seen = this.race.gates.map((g) => this.gateOf(g));
    this.ms = 0;
    this.crashed = false;
    this.downMs = 0;
    this.rows = new Float32Array(4 * 4096);
    this.count = 0;
    this.held = [0, 0, 0, this.hover];
    this.pos = { x: 0, y: 0, z: 0 };
    this.prev = null;
    this.sweepFrom = null;
    this.normal = { x: 0, y: 1, z: 0 };
    this.scratch = { x: 0, y: 0, z: 0 };
    const sim = this.sim;
    sim.reset();
    const at = this.line.at(START_MS);
    const to = this.line.at(START_MS + 100);
    const psi = Math.atan2(to.p[1] - at.p[1], to.p[0] - at.p[0]);
    if (sim.e.sim_set_pose(at.p[0], at.p[1], at.p[2], Math.cos(psi / 2), 0, 0, Math.sin(psi / 2)) !== SIM_OK) {
      throw new Error('AI opponent: sim_set_pose refused the start');
    }
    this.state = sim.readState().state;
    this.prevState = this.state;
  }

  gateOf(g) {
    const c = this.world.toSim(g.x, g.y + g.apertures[0].centreY, g.z, { x: 0, y: 0, z: 0 });
    const n = this.world.dirToSim(g.az.x, g.az.y, g.az.z, { x: 0, y: 0, z: 0 });
    return { c: [c.x, c.y, c.z], n: [n.x, n.y, n.z] };
  }

  /* The ground under the craft into the plant, as raiseGroundFromState. */
  ground(st) {
    const w = this.world;
    const p = w.fromSim(st, this.pos);
    const hy = w.floorHeight(p.x, p.z, p.y - SURFACE_BIAS);
    if (Math.round(st[0] * 1000) % 8 === 0) w.groundNormal(p.x, p.z, p.y - SURFACE_BIAS, this.normal);
    const at = w.toSim(p.x, hy, p.z, this.scratch);
    const [px, py, pz] = [at.x, at.y, at.z];
    const n = w.dirToSim(this.normal.x, this.normal.y, this.normal.z, { x: 0, y: 0, z: 0 });
    const len = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z);
    const ok = len > 0.985 && len < 1.015;
    this.sim.e.sim_set_ground(1, ok ? n.x / len : 0, ok ? n.y / len : 0, ok ? n.z / len : 1, px, py, pz, GROUND_MU, GROUND_E);
  }

  /* The hull swept from the last pass's place to here through the course's
   * solids; a face met is one contact. */
  sweep(st) {
    const w = this.world;
    const col = w.colliders();
    const to = { ...w.fromSim(st, this.pos) };
    const from = this.sweepFrom;
    this.sweepFrom = to;
    if (!col || !from) return;
    const q = w.worldQuat(st, { x: 0, y: 0, z: 0, w: 1 });
    const up = upOf(q);
    const half = craftVerticalHalf(Math.sqrt(Math.max(0, 1 - up.y * up.y)));
    const solid = col.hit(from.x, from.y, from.z, to.x, to.y, to.z, half, q.x, q.y, q.z, q.w, craftVerticalOffset());
    if (solid < 0) return;
    const t = Math.max(0, Math.min(1, col.hitT));
    const gap = BOUNCE_SEPARATION + (col.hitT <= 1e-6 ? Math.max(col.hitPen, col.hitOverlap || 0) : 0);
    const [nx, ny, nz] = [col.hitNx, col.hitNy, col.hitNz];
    const place = w.toSim(
      from.x + (to.x - from.x) * t + nx * gap,
      from.y + (to.y - from.y) * t + ny * gap,
      from.z + (to.z - from.z) * t + nz * gap,
      { x: 0, y: 0, z: 0 },
    );
    const n = w.dirToSim(nx, ny, nz, { x: 0, y: 0, z: 0 });
    const mat = contactMaterial(col.kindName(solid));
    this.sim.e.sim_contact(n.x, n.y, n.z, mat.e, mat.mu, place.x, place.y, place.z, 0, 0, 0);
    this.sweepFrom = { ...w.fromSim(this.sim.readState().state, this.pos) };
    this.touched = (this.touched || 0) + 1;
  }

  keep(sticks) {
    if (this.count * 4 + 4 > this.rows.length) {
      const grown = new Float32Array(this.rows.length * 2);
      grown.set(this.rows);
      this.rows = grown;
    }
    this.rows.set(sticks, this.count * 4);
    this.count += 1;
  }

  /* The 4 ms rows flown, [roll, pitch, yaw, throttle] each. */
  sticks() {
    return this.rows.subarray(0, this.count * 4);
  }

  /*
   * Flies on until its own clock reaches untilMs (the race's clock, from
   * the moment it was made), one 1 ms step at a time, the sticks every
   * AI_STEP_MS. The clock is the pilot's sim clock, never a frame's.
   */
  stepTo(untilMs) {
    const sim = this.sim;
    while (this.ms < untilMs && !this.crashed) {
      if (this.ms % AI_STEP_MS === 0) {
        const gate = this.seen[this.race.next] ?? null;
        this.held = this.pilot.sticks(this.ms, this.state, gate);
        this.keep(this.held);
        sim.input(this.ms / 1000, ...this.held);
      }
      this.ground(this.state);
      sim.step(1);
      this.ms += 1;
      this.prevState = this.state;
      this.state = sim.readState().state;
      if (!Number.isFinite(this.state[1])) {
        this.crashed = true;
        break;
      }
      /* Judged after the solids, as the pilot's frame is: a pose the
       * contact took back out of a frame never crossed the gate. */
      if (this.ms % OBSTACLE_STEP === 0) {
        this.sweep(this.state);
        this.state = sim.readState().state;
        this.judge();
      }
      this.down();
    }
  }

  judge() {
    const curr = { ...this.world.fromSim(this.state, this.pos) };
    if (this.prev) this.race.update(this.prev, curr, this.ms, 0);
    this.prev = curr;
  }

  down() {
    const s = this.state;
    const upZ = 1 - 2 * (s[8] * s[8] + s[9] * s[9]);
    const down = this.sim.e.sim_ground_contacts() > 0 && upZ < DOWN_UP;
    this.downMs = down ? this.downMs + 1 : 0;
    if (this.downMs >= DOWN_MS) this.crashed = true;
  }

  /* Laps closed, in ms, and the best of them, or null. */
  laps() {
    return this.race.laps.slice();
  }

  bestMs() {
    return this.race.bestLapMs();
  }
}
