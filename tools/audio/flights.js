/*
 * flights.js: the scripted flights every audio comparison is rendered from,
 * flown by the real plant (dist/sim.wasm) in Node and written to
 * tools/audio/flights.json.
 *
 *   node tools/audio/flights.js            write the file
 *   node tools/audio/flights.js --check    fly them again, fail if the file
 *                                          is not what the plant flies now
 *
 * Every number the audio reads comes out of the module's state block, the
 * same block src/main.js feeds src/render/audio.js from each frame: the four
 * motor RPMs, the velocity, the attitude, the pack. Nothing is invented, so
 * a sound that does something odd on one of these is a sound that will do
 * the same odd thing in the shell. The shell's own rule for a crash is
 * kept: from the frame the craft hits, the motors are fed zero and the
 * airspeed zero (main.js `motorsTurning`).
 *
 * Rows are at 62.5 Hz, 768 samples at 48 kHz, an exact multiple of the
 * 128 sample render quantum (the retired scripts/audio-probe.js chose the same rate
 * for the same reason). Columns, `COLS` below:
 *
 *   r0..r3    motor RPM, Betaflight order (a fixed wing's engine is r0)
 *   u v w     velocity in the body frame, m/s: forward, left, up (the
 *             plant's right handed Z up body frame)
 *   x y z     position, metres, world frame (for a listener off board)
 *   amps      pack current, A
 *   flap      the flaps' angle, rad (0 on an aircraft without them)
 *   gear      the retracts, 0 down and locked to 1 up
 *
 * Events are what the shell learns from the plant or its contact code and
 * hands the audio as a call rather than a stream: an impact with the
 * surface's material, its hardness (sim_material_info) and the impulse,
 * N s, read as the momentum the hit took out of the craft.
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

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSim, SIM_OK } from '../../tests/lib/simmod.js';
import { airframeById, BRAMOR_CATAPULT, DEFAULT_AIRFRAME, STRIKER_RAIL } from '../../configs/airframes.js';
import { seatStriker, attitude } from '../../scripts/lib/strikerpilot.js';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const OUT = join(root, 'tools/audio/flights.json');
export const TRACE_HZ = 62.5;
const ROW_MS = 1000 / TRACE_HZ;
const RC_MS = 4;
export const COLS = ['r0', 'r1', 'r2', 'r3', 'u', 'v', 'w', 'x', 'y', 'z', 'amps', 'flap', 'gear'];
const SURF = { grass: 1, concrete: 4, rock: 5, wood: 7 };

function must(code, where) {
  if (code !== SIM_OK) {
    throw new Error(`${where}: the module returned ${code}`);
  }
}

/* World velocity into the body frame by the attitude quaternion (body to
 * world, w x y z): v_body = R^T v_world. */
function bodyVel(s) {
  const w = s[7], x = s[8], y = s[9], z = s[10];
  const vx = s[4], vy = s[5], vz = s[6];
  const r00 = 1 - 2 * (y * y + z * z), r01 = 2 * (x * y - w * z), r02 = 2 * (x * z + w * y);
  const r10 = 2 * (x * y + w * z), r11 = 1 - 2 * (x * x + z * z), r12 = 2 * (y * z - w * x);
  const r20 = 2 * (x * z - w * y), r21 = 2 * (y * z + w * x), r22 = 1 - 2 * (x * x + y * y);
  return [r00 * vx + r10 * vy + r20 * vz, r01 * vx + r11 * vy + r21 * vz, r02 * vx + r12 * vy + r22 * vz];
}

/* A deterministic pilot's unsteadiness: the small corrections nobody holds
 * a stick still through, so a hover is not four frozen tones. */
function wobble(seed) {
  let s = seed >>> 0;
  let a = 0;
  let b = 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    a += 0.02 * ((s / 4294967296) * 2 - 1) - 0.004 * a;
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    b += 0.02 * ((s / 4294967296) * 2 - 1) - 0.004 * b;
    return [Math.max(-0.15, Math.min(0.15, a)), Math.max(-0.15, Math.min(0.15, b))];
  };
}

class Recorder {
  constructor(sim) {
    this.sim = sim;
    this.rows = [];
    this.events = [];
    this.nextRow = 0;
    this.dead = false;
  }

  /* Called every 1 ms step with the step's end time. */
  sample(ms) {
    while (ms >= this.nextRow) {
      const s = this.sim.readState().state;
      const [u, v, w] = bodyVel(s);
      const live = !this.dead;
      this.rows.push([
        live ? Math.round(s[14]) : 0, live ? Math.round(s[15]) : 0, live ? Math.round(s[16]) : 0, live ? Math.round(s[17]) : 0,
        live ? +u.toFixed(2) : 0, live ? +v.toFixed(2) : 0, live ? +w.toFixed(2) : 0,
        +s[1].toFixed(2), +s[2].toFixed(2), +s[3].toFixed(2),
        +s[19].toFixed(1),
        +this.sim.e.sim_wing_flaps().toFixed(4),
        +this.sim.e.sim_wing_gear().toFixed(3),
      ]);
      this.nextRow += ROW_MS;
    }
  }
}

/* ---------- the five inch ---------- */

async function quad(wasm, tune, simId = 0) {
  const sim = await loadSim(wasm);
  must(sim.e.sim_set_airframe(simId), 'sim_set_airframe');
  must(sim.init(tune), 'sim_init');
  must(sim.setAngleMode(true), 'angle mode');
  must(sim.reset(), 'sim_reset');
  must(sim.setCellVoltage(4.0), 'cell voltage');
  return sim;
}

/*
 * One quad flight: `plan(ms, s)` returns { roll, pitch, yaw, thr } or
 * { thr: 'hold', z } for the altitude hold, every 4 ms. The hold is a
 * plain PD on throttle about the hover throttle the bisection found.
 */
function flyQuad(sim, { seconds, z0 = 5, v0 = [0, 0, 0], hover, plan, ground = null, seed = 1, strike = null }) {
  must(sim.e.sim_set_pose(0, 0, z0, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_set_velocity(v0[0], v0[1], v0[2], 0, 0, 0), 'sim_set_velocity');
  if (ground) {
    must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, 1.0, 0.1), 'sim_set_ground');
    must(sim.e.sim_set_ground_material(SURF[ground]), 'sim_set_ground_material');
  }
  const rec = new Recorder(sim);
  const wob = wobble(seed);
  const mass = liveMass(sim);
  let prevV = null;
  let hit = null;
  for (let ms = 0; ms < seconds * 1000; ms += RC_MS) {
    const s = sim.readState().state;
    const [wr, wp] = wob();
    const p = plan(ms, s);
    let thr = p.thr;
    if (thr === 'hold') {
      thr = Math.max(0, Math.min(1, hover + 0.08 * (p.z - s[3]) - 0.06 * s[6]));
    }
    must(sim.input(ms / 1000, (p.roll ?? 0) + wr, (p.pitch ?? 0) + wp, p.yaw ?? 0, rec.dead ? 0 : thr), 'sim_input');
    for (let k = 0; k < RC_MS; k += 1) {
      must(sim.step(1), 'sim_step');
      const st = sim.readState().state;
      const v = [st[4], st[5], st[6]];
      if (ground && !hit && sim.e.sim_ground_contacts() > 0 && prevV) {
        hit = { ms: ms + k + 1, before: prevV };
        rec.dead = true;
      }
      /* The impulse is the momentum the hit took out of the craft over
       * its first 30 ms: the plant's contact spreads over several steps,
       * further on soft ground, so one step would read the stiff surface
       * as the soft one. */
      if (hit && !hit.done && ms + k + 1 >= hit.ms + 30) {
        const b = hit.before;
        const dv = Math.hypot(v[0] - b[0], v[1] - b[1], v[2] - b[2]);
        rec.events.push(impactEvent(sim, hit.ms, ground, mass, b, dv));
        hit.done = true;
      }
      prevV = v;
      rec.sample(ms + k + 1);
    }
    /* A prop strike on a post, the shell's sim_prop_strike and its sound
     * (src/main.js feelImpact): the plant takes it, the trace records the
     * motors spinning back up. */
    if (strike && ms === strike.ms) {
      must(sim.e.sim_prop_strike(strike.sev), 'sim_prop_strike');
      rec.events.push({ t: +(ms / 1000).toFixed(3), kind: 'strike', surface: strike.surface, hardness: strike.hardness, level: strike.level });
    }
  }
  return rec;
}

function liveMass(sim) {
  const ptr = sim.e.malloc(4 * 8);
  must(sim.e.sim_live_inertia(ptr), 'sim_live_inertia');
  const m = new Float64Array(sim.e.memory.buffer, ptr, 4)[0];
  sim.e.free(ptr);
  return m;
}

function impactEvent(sim, ms, surface, mass, before, dv) {
  const ptr = sim.e.malloc(4 * 8);
  must(sim.e.sim_material_info(SURF[surface], ptr), 'sim_material_info');
  const info = Array.from(new Float64Array(sim.e.memory.buffer, ptr, 4));
  sim.e.free(ptr);
  return {
    t: +(ms / 1000).toFixed(3),
    kind: 'impact',
    surface,
    hardness: info[3],
    speed: +Math.hypot(...before).toFixed(2),
    impulse: +(mass * dv).toFixed(3),
    mass: +mass.toFixed(3),
  };
}

async function hoverThrottleFor(wasm, tune, simId) {
  let lo = 0.1;
  let hi = 0.7;
  for (let i = 0; i < 20; i += 1) {
    const mid = 0.5 * (lo + hi);
    const sim = await quad(wasm, tune, simId);
    must(sim.e.sim_set_pose(0, 0, 20, 1, 0, 0, 0), 'sim_set_pose');
    let vz = 0;
    for (let ms = 0; ms < 2500; ms += RC_MS) {
      must(sim.input(ms / 1000, 0, 0, 0, mid), 'sim_input');
      must(sim.step(RC_MS), 'sim_step');
      vz = sim.readState().state[6];
    }
    if (vz > 0) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return 0.5 * (lo + hi);
}

/* ---------- the Striker ---------- */

function strikerHold(s, { v, z, pitchT = null }) {
  const { pitch, bank } = attitude(s);
  const speed = Math.hypot(s[4], s[5], s[6]);
  const k = (20 / Math.max(speed, 10)) ** 2;
  let pt = pitchT;
  if (pt == null && v != null) {
    /* An airspeed hold: nose up when fast, down when slow. */
    pt = Math.max(-0.35, Math.min(0.4, 0.03 * (speed - v)));
  }
  if (pt == null) {
    const vzT = Math.max(-4, Math.min(4, 0.25 * (z - s[3])));
    pt = Math.max(-0.35, Math.min(0.6, 0.04 + 0.03 * (vzT - s[6])));
  }
  return {
    pitch: Math.max(-1, Math.min(1, 3.0 * k * (pt - pitch) - 0.6 * Math.sqrt(k) * -s[12])),
    roll: Math.max(-1, Math.min(1, -1.5 * Math.sqrt(k) * bank - 0.15 * Math.sqrt(k) * s[11])),
  };
}

/*
 * The rail: the engine runs up while the airframe is held on the rail
 * (posed and rested every step, which is all a rail is to the plant), then
 * the shot at STRIKER_RAIL's speed and angle, and a climb out. A flight
 * that starts in the air flies `warmMs` before the recording starts, so
 * the engine is already at the speed the throttle holds (the plant starts
 * the turbine cold, and a cold spool under a cruise is not a cruise).
 */
function flyStrikerScript(sim, { seconds, railMs = 0, warmMs = 0, start, thr, hold, listener, actions = [], rail = STRIKER_RAIL, launch = false }) {
  const h = (rail.pitchDeg * Math.PI) / 360;
  const railPose = [0, 0, rail.height, Math.cos(h), 0, -Math.sin(h), 0];
  if (railMs > 0) {
    must(sim.e.sim_set_pose(...railPose), 'sim_set_pose');
    must(sim.rest(), 'sim_rest');
  } else {
    must(sim.e.sim_set_pose(...start.pose), 'sim_set_pose');
    if (launch) {
      must(sim.e.sim_wing_launch(start.v), 'sim_wing_launch');
    } else {
      must(sim.e.sim_set_velocity(start.v, 0, 0, 0, 0, 0), 'sim_set_velocity');
    }
  }
  const todo = actions.slice();
  const rec = new Recorder(sim);
  let launched = railMs === 0;
  for (let ms = -warmMs; ms < seconds * 1000; ms += RC_MS) {
    if (!launched && ms >= railMs) {
      must(sim.e.sim_set_pose(...railPose), 'sim_set_pose');
      must(sim.e.sim_wing_launch(rail.speed), 'sim_wing_launch');
      launched = true;
      rec.events.push({ t: +(ms / 1000).toFixed(3), kind: 'mech', what: 'catapult' });
    }
    while (todo.length && ms >= todo[0].ms) {
      const a = todo.shift();
      a.act(sim);
      if (a.event) {
        rec.events.push({ t: +(ms / 1000).toFixed(3), ...a.event });
      }
    }
    const s = sim.readState().state;
    const sticks = launched ? strikerHold(s, hold(ms)) : { roll: 0, pitch: 0 };
    must(sim.input((ms + warmMs) / 1000, sticks.roll, sticks.pitch, 0, thr(Math.max(0, ms))), 'sim_input');
    for (let k = 0; k < RC_MS; k += 1) {
      must(sim.step(1), 'sim_step');
      if (!launched) {
        must(sim.e.sim_set_pose(...railPose), 'sim_set_pose');
        must(sim.rest(), 'sim_rest');
      }
      if (ms >= 0) {
        rec.sample(ms + k + 1);
      }
    }
  }
  const out = { rows: rec.rows, events: rec.events };
  if (listener) {
    out.listener = listener;
  }
  return out;
}

/* ---------- the set ---------- */

export async function flyAll() {
  const wasm = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
  /* The racer, DEFAULT_AIRFRAME, flies the quad set: the five inch did
   * until it was removed (2026-10-03). */
  const racer = airframeById(DEFAULT_AIRFRAME);
  const quadTune = await readFile(join(root, `configs/${racer.defaultTune}.diff`), 'utf8');
  const hover = await hoverThrottleFor(wasm, quadTune, racer.simId);
  const flights = {};
  const q = async (id, title, opts) => {
    const rec = flyQuad(await quad(wasm, quadTune, racer.simId), { hover, ...opts });
    flights[id] = { craft: racer.id, airframe: racer.id, voice: 'quad', title, rows: rec.rows, events: rec.events };
  };
  await q('quad-hover', 'Interceptor: hover', {
    seconds: 10, plan: () => ({ thr: 'hold', z: 5 }),
  });
  await q('quad-punch', 'Interceptor: punch-out', {
    seconds: 9, seed: 2,
    plan: (ms) => (ms < 2500 ? { thr: 'hold', z: 5 } : ms < 5000 ? { thr: 1 } : { thr: 'hold', z: 60 }),
  });
  await q('quad-dive', 'Interceptor: dive', {
    seconds: 10, z0: 120, v0: [6, 0, 0], seed: 3,
    plan: (ms) => {
      if (ms < 1500) {
        return { thr: 'hold', z: 120 };
      }
      if (ms < 5500) {
        /* Over the top and down, nose full forward on a sliver of throttle. */
        return { pitch: 1, thr: 0.12 };
      }
      if (ms < 7500) {
        return { pitch: -0.6, thr: 0.95 };
      }
      return { thr: 'hold', z: 40 };
    },
  });
  await q('quad-propwash', 'Interceptor: prop wash descent', {
    seconds: 9, z0: 60, seed: 4,
    plan: (ms) => {
      if (ms < 1500) {
        return { thr: 'hold', z: 60 };
      }
      if (ms < 4300) {
        /* Throttle cut, straight down through its own wake... */
        return { thr: 0.02 };
      }
      if (ms < 6300) {
        /* ...and caught with a hard throttle up, which is when it shakes. */
        return { thr: 0.85 };
      }
      return { thr: 'hold', z: 40 };
    },
  });
  for (const surface of ['grass', 'concrete']) {
    await q(`quad-crash-${surface}`, `Interceptor: crash on ${surface}`, {
      seconds: 6, z0: 6, v0: [14, 0, -1], ground: surface, seed: 5,
      plan: (ms) => (ms < 1200 ? { thr: 'hold', z: 6, pitch: 0.4 } : { pitch: 0.8, thr: 0.25 }),
    });
  }

  /* A prop strike over a hover: the blades meet a wooden post. */
  await q('quad-strike', 'Interceptor: prop strike on a post', {
    seconds: 6, seed: 6,
    plan: () => ({ thr: 'hold', z: 5 }),
    strike: { ms: 2500, sev: 0.2, surface: 'wood', hardness: 0.6, level: 0.7 },
  });
  await q('quad-crash-rock', 'Interceptor: crash on rock', {
    seconds: 6, z0: 6, v0: [14, 0, -1], ground: 'rock', seed: 5,
    plan: (ms) => (ms < 1200 ? { thr: 'hold', z: 6, pitch: 0.4 } : { pitch: 0.8, thr: 0.25 }),
  });

  /* The other quads, each in its own plant: a hover and a punch. */
  for (const [id, name] of [['7inch', '7 inch'], ['10inch', '10 inch'], ['interceptor', 'Interceptor']]) {
    const af = airframeById(id);
    const tune = await readFile(join(root, `configs/${af.defaultTune}.diff`), 'utf8');
    const simId = af.simId;
    const hov = await hoverThrottleFor(wasm, tune, simId);
    const rec = flyQuad(await quad(wasm, tune, simId), {
      hover: hov, seconds: 9, seed: 7,
      plan: (ms) => (ms < 3000 ? { thr: 'hold', z: 5 } : ms < 5000 ? { thr: 1 } : { thr: 'hold', z: 40 }),
    });
    flights[`${id}-punch`] = { craft: id, airframe: id, voice: 'quad', title: `${name}: hover and punch-out`, rows: rec.rows, events: rec.events };
  }

  /* The fixed wings, each on its stock power: an air start, a climb on
   * full, a cruise, the throttle chopped into a glide. */
  const wingFlight = async (id, title, opts = {}) => {
    const af = airframeById(id);
    const tune = await readFile(join(root, `configs/${af.defaultTune}.diff`), 'utf8');
    const sim = await loadSim(wasm);
    must(sim.e.sim_set_airframe(af.simId), 'sim_set_airframe');
    must(sim.init(tune), 'sim_init');
    if (typeof sim.e.sim_wing_set_stab === 'function') {
      must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
    }
    must(sim.reset(), 'sim_reset');
    must(sim.setCellVoltage(4.0), 'cell voltage');
    const v0 = opts.v0 ?? 1.4 * af.stall;
    const out = flyStrikerScript(sim, {
      seconds: opts.seconds ?? 10, warmMs: opts.warmMs ?? 3000, launch: true,
      start: { pose: [0, 0, opts.z0 ?? 60, 1, 0, 0, 0], v: v0 },
      thr: opts.thr ?? ((ms) => (ms < 3000 ? 1 : ms < 6500 ? 0.6 : 0)),
      hold: opts.hold ?? (() => ({ v: 1.5 * af.stall })),
      actions: opts.actions ?? [],
      rail: opts.rail, railMs: opts.railMs ?? 0,
    });
    flights[`${id}-${opts.tag ?? 'flight'}`] = { craft: id, airframe: id, voice: af.voice ?? 'wing', title, ...out };
  };
  await wingFlight('cub1400', 'Cub (electric): climb, cruise, glide');
  await wingFlight('kadet1981', 'Kadet Senior (four stroke glow): climb, cruise, idle');
  await wingFlight('bombshell1118', 'Bombshell (two stroke glow): climb, cruise, idle');
  await wingFlight('tigermoth1803', 'Tiger Moth (two stroke glow): climb, cruise, idle');
  await wingFlight('p51d1450', 'P-51 (electric, four blades): gear up, flaps, cruise', {
    thr: (ms) => (ms < 6000 ? 0.8 : 0.5),
    actions: [
      { ms: 1000, act: (sim) => must(sim.e.sim_wing_set_gear(1), 'gear up') },
      { ms: 7500, act: (sim) => must(sim.e.sim_wing_set_flaps(1), 'flaps') },
    ],
  });
  await wingFlight('f16878', 'F-16 (ducted fan): spool, full, cruise', {
    thr: (ms) => (ms < 1500 ? 0.3 : ms < 6000 ? 1 : 0.55),
    hold: () => ({ z: 60 }),
  });
  await wingFlight('nrj1490', 'NRJ glider: the air alone', {
    thr: () => 0, hold: () => ({ v: 9 }), v0: 9,
  });
  flights['nrj1490-flight'].glider = true;
  {
    /* The Bramor: off its catapult, then its parachute. */
    const id = 'bramor2300';
    await wingFlight(id, 'Bramor: catapult launch, climb, parachute', {
      tag: 'catapult', railMs: 1500, warmMs: 0, rail: BRAMOR_CATAPULT, seconds: 14,
      thr: (ms) => (ms < 1000 ? 0 : 1),
      hold: (ms) => ({ pitchT: ms < 2500 ? (BRAMOR_CATAPULT.pitchDeg * Math.PI) / 180 : 0.15 }),
      actions: [
        { ms: 9000, act: (sim) => must(sim.e.sim_wing_chute(1), 'chute'), event: { kind: 'mech', what: 'parachute' } },
      ],
    });
  }

  const af = airframeById('striker2500');
  const tuneText = await readFile(join(root, `configs/${af.defaultTune}.diff`), 'utf8');
  for (const prop of ['prop', 'jet']) {
    const choice = { payload: 'standard', accessories: [], propulsion: prop };
    const seat = () => seatStriker(loadSim, wasm, tuneText, af, choice);
    const voice = af.combat.propulsion.find((p) => p.id === prop).voice;
    const craft = `striker-${prop}`;
    const name = prop === 'prop' ? 'Striker prop' : 'Striker jet';
    /* The jet takes seconds to spool, so it sits on the rail longer. */
    const railMs = prop === 'prop' ? 3500 : 6000;
    flights[`${craft}-takeoff`] = {
      craft, voice, airframe: af.id, combat: { [af.id]: choice }, title: `${name}: takeoff from the rail`,
      ...flyStrikerScript(await seat(), {
        seconds: (railMs + 7000) / 1000, railMs,
        thr: (ms) => (ms < 1500 ? 0 : 1),
        hold: (ms) => ({ pitchT: ms < railMs + 1000 ? (STRIKER_RAIL.pitchDeg * Math.PI) / 180 : 0.2 }),
      }),
    };
    const vCruise = prop === 'prop' ? 22 : 40;
    flights[`${craft}-cruise`] = {
      craft, voice, airframe: af.id, combat: { [af.id]: choice }, title: `${name}: cruise`,
      ...flyStrikerScript(await seat(), {
        seconds: 10, warmMs: 6000, start: { pose: [0, 0, 120, 1, 0, 0, 0], v: vCruise },
        thr: (ms) => (ms < 6000 ? 0.65 : 0.85),
        hold: () => ({ z: 120 }),
      }),
    };
    /* At full throttle past a listener 20 m under it at the run's
     * midpoint. The altitude hold lets a full throttle airframe climb a
     * little, so the listener's ground is put under the pass rather than
     * at zero: [x, y, ground height], the ear EAR_M over it
     * (tools/audio/drive.js). */
    const vPass = prop === 'prop' ? 26 : 60;
    const seconds = 10;
    flights[`${craft}-flyby`] = {
      craft, voice, airframe: af.id, combat: { [af.id]: choice }, title: `${name}: fly-by at 20 m`,
      ...flyStrikerScript(await seat(), {
        seconds, warmMs: 6000, start: { pose: [0, 0, 20, 1, 0, 0, 0], v: vPass },
        thr: () => 1,
        hold: () => ({ z: 20 }),
        listener: null,
      }),
    };
    const f = flights[`${craft}-flyby`];
    const mid = f.rows[Math.floor(f.rows.length / 2)];
    f.listener = [mid[7], mid[8], +(mid[9] - 20 - 1.7).toFixed(2)];
  }
  return { rate: TRACE_HZ, cols: COLS, hover: +hover.toFixed(4), flights };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const data = await flyAll();
  const text = `${JSON.stringify(data)}\n`;
  for (const [id, f] of Object.entries(data.flights)) {
    const ev = f.events.map((e) => (e.kind === 'impact' ? `impact ${e.surface} ${e.speed} m/s ${e.impulse} N s` : `${e.kind} ${e.what ?? e.surface}`)).join('; ');
    const peak = Math.max(...f.rows.map((r) => Math.max(r[0], r[1], r[2], r[3])));
    const vmax = Math.max(...f.rows.map((r) => Math.hypot(r[4], r[5], r[6])));
    console.log(`${id.padEnd(26)} ${(f.rows.length / TRACE_HZ).toFixed(1)} s  peak ${peak} rpm  top ${vmax.toFixed(1)} m/s  ${ev}`);
  }
  if (process.argv.includes('--check')) {
    const was = await readFile(OUT, 'utf8');
    if (was !== text) {
      console.log('flights.json is not what the plant flies now: run node tools/audio/flights.js');
      process.exit(1);
    }
    console.log('flights.json matches the plant');
  } else {
    await writeFile(OUT, text);
    console.log(`wrote ${OUT}, ${text.length} bytes`);
  }
}
