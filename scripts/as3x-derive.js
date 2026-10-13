/*
 * as3x-derive.js: the gains of mode 3, Spektrum's AS3X (plant_wing.c), for
 * each aircraft that ships with it and each one a pilot may fit a
 * Spektrum AS3X receiver to (docs/CONTROLLERS.md): the damper on each
 * axis' body rate (FixedWingParams.as3x_k), the most Heading a pilot may
 * set on it (as3x_kh, at the tune's full Heading; the receiver's own
 * default is zero, the AR631's) and the rate the stick asks under the
 * Heading (as3x_rate).
 *
 * Horizon publishes no gains. Spektrum publishes how they are set:
 * "Increase the gain values until you find oscillation, and then reduce
 * the gain to the highest setting that will not cause oscillation at any
 * speed", "Oscillation occurs because the system is overshooting the
 * correction, and will usually occur at higher speeds" (the AR631
 * manual, AS3X Tuning Basics; the Extra's own receiver, its manual p. 10).
 * So each axis' damper is the highest that keeps the margin rule
 * (scripts/lib/as3xloop.js: 6 dB of gain under the onset, MIL-F-9490D,
 * and 45 deg of phase) at every condition the aircraft flies, slow
 * flight to the full throttle dive, the harrier and the hover where it
 * flies them, measured on the plant with the receiver's own frame and
 * the servos' slew (as3xloop.js measurePlane). Then the full Heading on
 * that damper, the highest that still keeps it. Each is cut to four
 * places downward, so the table never sits above its derivation.
 *
 * Until 2026-10-12 the damper was pi / (4 M tau) at the rated setup's
 * level top speed, a margin by formula that took the frame's whole
 * period as its delay and the airframe as a bare integrator, and never
 * measured: at the full throttle dive every AS3X loop but the Radian's
 * roll was under 6 dB, and six aircraft's were at or past the onset,
 * ringing at the frame's Nyquist rate (w37-fc-feel). Its
 * check kicked each axis and compared against the same flight unkicked,
 * which a loop ringing by itself passes, since both flights ring alike.
 *
 * The heading's rate per stick is unchanged: what the airframe turns at
 * a tenth of stick, level at its cruise and hanging on the prop, on the
 * gates' seat (slopes below).
 *
 * With --check it fails when a table differs from what it derives. Run
 * with npm run as3x:derive (dist/sim.wasm built first). --plane NAME
 * measures one table and prints it as JSON.
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

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { must } from '../tests/lib/wingpilot.js';
import { TABLE } from '../configs/power.js';
import { SEAT_GATES, wingSeat } from './lib/propcurve.js';
import {
  AS3X, rowOf, receiverOf, gainForMargins, measurePlane, revive, fanOut,
  planeSim, diveCondition, closedFlight, rings,
} from './lib/as3xloop.js';

const self = fileURLToPath(import.meta.url);
const root = dirname(dirname(self));
const src = await readFile(join(root, 'src/native/plant_wing.c'), 'utf8');
const argv = process.argv.slice(2);
const check = argv.includes('--check');
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };

/* Where the level rate is read: the table's own cruise (configs/power.js)
 * at the stick that flies it level (stab_trim_throttle), unless the entry
 * below names its own. */
const levelOf = (a, body) => [Object.values(TABLE).find((t) => t.simId === a.sim).cruiseMs,
  Number(body.match(/\.stab_trim_throttle = ([0-9.]+)/)[1])];
const MS = 4;
const r3 = (x) => Number(x.toFixed(3));

/* The heading's rate per stick: what the airframe itself turns at a
 * tenth of stick, level at 16 m/s and hanging on the prop at the hover's
 * throttle, the larger of the two, so the gyro never asks the stick for
 * less rotation than the aircraft gives it in either. Rad/s per unit
 * stick, signed as the rate. Each 0.4 s, the last 0.2 s's mean over the
 * centred stick's. An aircraft this hold cannot keep hanging (the nose
 * within 20 deg of vertical and the height within 10 m after 6 s,
 * hover-probe.js's bounds: most of the fleet has under its weight in
 * thrust) has no hover rate; its tumble's would be noise, so it takes
 * the level one alone. */
function hoverHeld(sim, start) {
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
  must(sim.e.sim_set_pose(0, 0, 50, Math.SQRT1_2, 0, -Math.SQRT1_2, 0), 'sim_set_pose');
  let thr = start, iR = 0, iP = 0, iY = 0, t = 0, st = [0, 0, 0, start];
  const clamp = (x) => Math.max(-1, Math.min(1, x));
  /* The prop spun up first (prop_spool), the aircraft held where it is. */
  for (let ms = 0; ms < 1000; ms += MS) {
    must(sim.e.sim_set_pose(0, 0, 50, Math.SQRT1_2, 0, -Math.SQRT1_2, 0), 'sim_set_pose');
    must(sim.e.sim_set_velocity(0, 0, 0, 0, 0, 0), 'sim_set_velocity');
    must(sim.input(t / 1000, ...st), 'sim_input');
    must(sim.step(MS), 'sim_step');
    t += MS;
  }
  let held = true;
  for (let ms = 0; ms < 6000; ms += MS) {
    const s = sim.readState().state;
    const [w, x, y, z] = [s[7], s[8], s[9], s[10]];
    /* World up in the body's z and y: the nose's lean off vertical. */
    const up2 = 1 - 2 * (x * x + y * y), upY = 2 * (y * z + w * x);
    if (ms >= 3000 && !(Math.abs(up2) < Math.sin(20 / 180 * Math.PI) && Math.abs(s[3] - 50) < 10)) held = false;
    thr = Math.max(0, Math.min(1, thr - 0.002 * s[6] - 0.0005 * (s[3] - 50)));
    iR = Math.max(-1.5, Math.min(1.5, iR - 0.008 * s[11]));
    iP = clamp(iP + 0.004 * up2);
    iY = clamp(iY - 0.004 * upY);
    st = [clamp(iR - 0.5 * s[11]), clamp(iP + 3 * up2 + 0.5 * s[12]), clamp(iY - 3 * upY + 0.5 * s[13]), thr];
    must(sim.input(t / 1000, ...st), 'sim_input');
    must(sim.step(MS), 'sim_step');
    t += MS;
  }
  return { st, t, held };
}
function slopes(sim, [lv, lthr], hoverStart) {
  const out = [];
  for (let ax = 0; ax < 3; ax += 1) {
    /* The same flight twice from the same start, the stick moved and
     * left centred: what the airframe does on its own (a launch a touch
     * off trim, a hold still settling) is in both and drops out. */
    const mean = (prep, d) => {
      const r = prep();
      let t = r.t, sum = 0, n = 0;
      const st = r.st.slice();
      st[ax] = Math.max(-1, Math.min(1, st[ax] + d));
      for (let ms = 0; ms < 400; ms += MS) {
        must(sim.input(t / 1000, ...st), 'sim_input');
        must(sim.step(MS), 'sim_step');
        t += MS;
        if (ms >= 200) { sum += sim.readState().state[11 + ax]; n += 1; }
      }
      return sum / n;
    };
    const at = (prep) => (mean(prep, 0.1) - mean(prep, 0)) / 0.1;
    const cruise = at(() => {
      must(sim.reset(), 'sim_reset');
      must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
      must(sim.e.sim_set_pose(0, 0, 300, 1, 0, 0, 0), 'sim_set_pose');
      must(sim.e.sim_wing_launch(lv), 'sim_wing_launch');
      return { st: [0, 0, 0, lthr], t: 0 };
    });
    let held = false;
    const hover = at(() => { const r = hoverHeld(sim, hoverStart); held = r.held; return r; });
    if (process.env.AS3X_DEBUG) console.log("axis", ax, "cruise", cruise, "hover", hover, "held", held);
    out.push(held && Math.abs(hover) > Math.abs(cruise) ? hover : cruise);
  }
  return out;
}


/* One table, in its own process: the airframe measured over its
 * envelope, and the heading's rates on the gates' seat. */
if (opt('--plane')) {
  const name = opt('--plane');
  const a = AS3X[name];
  const body = rowOf(src, name);
  const sim = await planeSim(a.sim, SEAT_GATES);
  /* The hover's held from the stick that hangs the weight on the prop on
   * the 4.1 V pack this seats (wingSeat hoverStick); an engine, which no
   * row hovers, from 0.6. */
  const electric = /\.current_full = [1-9]/.test(body);
  const hoverStart = electric ? wingSeat(name).hoverStick(SEAT_GATES) ?? 1 : 0.6;
  const rate = slopes(sim, levelOf(a, body), hoverStart).map(r3);
  process.stdout.write(JSON.stringify({ measure: await measurePlane(name, src), rate }));
  process.exit(0);
}

/* Four places, downward: the table never above its derivation. */
const f4 = (x) => Math.floor(x * 1e4) / 1e4;
/* The damper. Each axis' ceiling is the highest gain that keeps the
 * margin rule everywhere, the Heading at the receiver's default, zero.
 * Where the BNF's own receiver preset gives its factory gains (lib
 * as3xloop.js AS3X srm), the damper has their ratios between the axes,
 * at the largest single scale that keeps every axis under its ceiling:
 * the ratios are E-flite's tune, the scale FITTED, since no published
 * figure maps Spektrum's gain units to a surface's angle (lead decision
 * 2026-10-12, the owner's "just do small corrections never actually
 * change the way the plane behaves"). A table without a preset takes
 * its ceilings. */
function factoryDamper(srm, ceiling) {
  if (!srm) return ceiling.map(f4);
  const scale = Math.min(...srm.map((g, ax) => (g > 0 && ceiling[ax] > 0 ? ceiling[ax] / g : Infinity)));
  return srm.map((g, ax) => (ceiling[ax] > 0 ? f4(scale * g) : 0));
}

/* The full Heading on that damper: its integral cornered at a quarter of
 * the fastest crossover the frame allows, pi / (4 T), so kh = k pi /
 * (16 T), the rule this derivation has always used. The damper no
 * longer crosses unity there (it is set by the margin now, not at
 * pi / (4 T)), so the corner is that fraction of the frame's limit and
 * nothing more: a ratio, not a measurement. The AR631's Heading is the
 * pilot's to turn up ("You can increase this value to make the aircraft
 * hold its attitude when control input is neutral"); a pilot who does
 * spends margin, as on the real receiver, and as3x:margins prints what
 * the full Heading leaves. */
const headingFor = (k, T) => f4(k * Math.PI / (16 * T));

const fleet = await fanOut(self, Object.keys(AS3X));
let bad = 0;
for (const name of Object.keys(AS3X)) {
  const { measure, rate } = fleet[name];
  const m = revive(measure);
  const body = rowOf(src, name);
  const T = m.T;
  const resps = [0, 1, 2].map((ax) => m.conds.map((c) => c.resp[ax]).filter((r) => r));
  const ceiling = resps.map((r, ax) => (r.length ? gainForMargins(r, ax, 1, 0, T) : 0));
  const k = factoryDamper(AS3X[name].srm, ceiling);
  const kh = k.map((x) => headingFor(x, T));
  const ok = body.includes(`.as3x_k = { ${k.join(', ')} },`) && body.includes(`.as3x_kh = { ${kh.join(', ')} },`) && body.includes(`.as3x_rate = { ${rate.join(', ')} },`);
  /* The loop closed on the plant at the dive, all three axes on the
   * derived gains at the default Heading, each axis kicked 1 rad/s: none
   * may ring (as3xloop.js rings, against the same flight unkicked), and
   * the unkicked flight may swing no more than Manual's does by itself
   * (the Zagi loops at its dive's full throttle, gyro or none). */
  const dive = m.conds.find((c) => c.id === 'dive');
  const sim = await planeSim(AS3X[name].sim);
  const cond = diveCondition(dive.V);
  const rx = { ...receiverOf(body), k, kh: [0, 0, 0] };
  const swingOf = (tr) => {
    const late = tr.slice(-500);
    const mean = late.reduce((p, q) => p + q, 0) / late.length;
    return Math.max(...late.map((x) => Math.abs(x - mean)));
  };
  const rang = [];
  for (let ax = 0; ax < 3; ax += 1) {
    if (!(k[ax] > 0)) continue;
    const still = closedFlight(sim, cond, rx, [1, 1, 1], ax, 0);
    const swing = swingOf(still) - swingOf(closedFlight(sim, cond, rx, [0, 0, 0], ax, 0));
    if (rings(closedFlight(sim, cond, rx, [1, 1, 1], ax, 1), still, 1) || swing > 0.05) rang.push(['roll', 'pitch', 'yaw'][ax]);
  }
  if (rang.length) bad += 1;
  console.log(`${name.padEnd(18)} the dive at ${dive.V.toFixed(1)} m/s, kicked: ${rang.length ? `RINGS ${rang.join(', ')}` : 'settles on every axis'}`);
  console.log(`${name.padEnd(18)} as3x_k ${k.join(', ')}, as3x_kh ${kh.join(', ')}, as3x_rate ${rate.join(', ')}${check && !ok ? '  DIFFERS' : ''}`);
  if (!ok) bad += 1;
}
if (check && bad) {
  console.log(`${bad} table(s) differ from their derivation or ring`);
  process.exit(1);
}
