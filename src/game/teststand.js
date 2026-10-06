/*
 * teststand.js: a plane's motor or engine run on the hangar's bench, by
 * the plant itself.
 *
 * The stand is a second instance of dist/sim.wasm, never the one the pilot
 * flies, seated on the plane in the hangar with the power option and the
 * tuning on show, and held still: after every 1 ms step its pose goes back
 * to where it was bolted down and its velocity and rates to zero. So what
 * it reads is the plant's own static answer, the same code that flies:
 * the thrust (sim_wing_debug), the prop's rpm, the pack's loaded voltage
 * and its current (the state block), and the pack's charge or the tank's
 * fuel as they drain (sim_power_state). No formula here stands in for any
 * of it.
 *
 * The endurance is the same plant run on, headless: the pack or the tank
 * drained at the stand's throttle, held there, until a pilot would land,
 * a few thousand steps a call so a frame is never held up. For a pack
 * that is the OSD's LOW BATTERY line, the loaded voltage under 3.5 V a
 * cell (Betaflight's vbat_warning_cell_voltage, the end scripts/
 * power-check.js P2 takes for the Power tab's flight time), or the pack
 * flat; for a tank, the engine quitting dry. On the bench the prop is not
 * unloaded by any airspeed, so this is the time at that throttle standing
 * still, which is shorter than the same throttle in the air; the Power
 * tab's flight time is the one at cruise.
 *
 * Plain JavaScript over the module's exports, so it runs in Node (scripts/
 * tuning-check.js) exactly as it does in the shell.
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

const SIM_OK = 0;
/* Where the stand holds the aircraft, plant frame, m: far above any ground
 * plane, so nothing but the motor and the air acts on it. */
const HOLD_Z = 500;
/* The longest a run down may take, s of sim time: a Radian on a 3S pack
 * at a whisper of throttle would otherwise run on for hours. Past it the
 * endurance reads as at least this. */
const ENDURANCE_CAP_S = 3 * 3600;
/* The thrust off sim_wing_debug, its slot 8. */
const DEBUG_THRUST = 8;
/* LOW BATTERY, volts a cell, loaded. */
const LAND_CELL_V = 3.5;
const CHECK_STEPS = 20;

function must(code, what) {
  if (code !== SIM_OK) {
    throw new Error(`test stand: ${what} returned ${code}`);
  }
}

export class TestStand {
  /* `sim` is a Sim from tests/lib/simmod.js, initialised, and the stand's
   * alone: seat() changes its airframe, power and tuning. */
  constructor(sim) {
    this.sim = sim;
    this.debugPtr = 0;
    this.seated = null;
    this.throttle = 0;
    this.t = 0;
    this.run = null;
  }

  /* Bolt a plane down: its sim_set_airframe id, the SIM_POWER block for the
   * option on show (null for the table's own) and the SIM_TUNE block (null
   * for none). A full pack and tank, the prop stopped. */
  seat(simId, powerBlock = null, tuneBlock = null) {
    const { sim } = this;
    must(sim.e.sim_set_airframe(simId), 'sim_set_airframe');
    must(sim.setCellVoltage(4.2), 'sim_set_cell_voltage');
    must(powerBlock ? sim.setPower(powerBlock) : sim.clearPower(), 'sim_set_power');
    must(tuneBlock ? sim.setTune(tuneBlock) : sim.clearTune(), 'sim_wing_set_tune');
    this.seated = { simId, powerBlock, tuneBlock };
    this.restart();
  }

  /* A fresh pack and tank, the prop stopped, the clock at zero. */
  restart() {
    const { sim } = this;
    must(sim.reset(), 'sim_reset');
    this.hold();
    this.t = 0;
    this.run = null;
  }

  hold() {
    const e = this.sim.e;
    must(e.sim_set_pose(0, 0, HOLD_Z, 1, 0, 0, 0), 'sim_set_pose');
    must(e.sim_set_velocity(0, 0, 0, 0, 0, 0), 'sim_set_velocity');
  }

  setThrottle(x) {
    this.throttle = Math.min(1, Math.max(0, x));
  }

  /* n steps at the stand's throttle, held after each. */
  steps(n) {
    const { sim } = this;
    for (let i = 0; i < n; i += 1) {
      must(sim.input(this.t, 0, 0, 0, this.throttle), 'sim_input');
      must(sim.step(1), 'sim_step');
      this.hold();
      this.t += 0.001;
    }
  }

  /* What the bench reads now, SI: thrust N, current A, the prop's rpm,
   * the pack's loaded volts, and the sim_power_state block named. */
  reading() {
    const { sim } = this;
    if (!this.debugPtr) {
      this.debugPtr = sim.e.malloc(20 * 8);
    }
    must(sim.e.sim_wing_debug(this.debugPtr), 'sim_wing_debug');
    const thrustN = new Float64Array(sim.e.memory.buffer, this.debugPtr, 20)[DEBUG_THRUST];
    const { state } = sim.readState();
    return {
      thrustN,
      rpm: state[14],
      volts: state[18],
      currentA: state[19],
      power: sim.powerState(),
    };
  }

  /*
   * The endurance at `throttle` on a pack of `cells` (0 for a glow
   * engine), run on a fresh pack in chunks of at most `budget` steps a
   * call: null while it runs, then { seconds, capped, why }, why 'low'
   * for LOW BATTERY, 'empty' for a flat pack or a dry tank, 'cap' past
   * ENDURANCE_CAP_S. The live bench is restarted afterwards, so a reading
   * taken after it is fresh.
   */
  endurance(throttle, cells, budget = 20000) {
    if (!this.run || this.run.throttle !== throttle) {
      this.restart();
      this.setThrottle(throttle);
      this.run = { throttle };
    }
    const land = cells > 0 ? LAND_CELL_V * cells : 0;
    /* Checked every CHECK_STEPS, which ends it at most that many ms late
     * and spares the state reads their cost on every step. */
    for (let done = 0; done < budget; done += CHECK_STEPS) {
      this.steps(CHECK_STEPS);
      if (!this.sim.powerState().running) {
        return this.finish('empty');
      }
      const st = this.sim.readState().state;
      if (land > 0 && st[19] > 0 && st[18] < land) {
        return this.finish('low');
      }
      if (this.t >= ENDURANCE_CAP_S) {
        return this.finish('cap');
      }
    }
    return null;
  }

  finish(why) {
    const seconds = this.t;
    this.restart();
    return { seconds, capped: why === 'cap', why };
  }
}
