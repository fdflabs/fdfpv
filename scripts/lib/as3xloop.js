/*
 * as3xloop.js: the stability margins of a receiver's rate loop (mode 3,
 * plant_wing.c, AS3X) on the plant as it flies, the loop broken at the
 * surface, as the receiver sees it: a sampled loop. Once a frame T the
 * receiver reads the body's rate and writes a surface that holds until
 * the next, so the loop is the airframe from a held surface to the rate
 * read at the next frame, P(z), and the receiver's damper and heading
 * sum on it, C(z) = k + kh T / (1 - z^-1): L(z) = -sigma C(z) P(z), sigma
 * the sign the receiver writes each surface with. P(z) is measured on the
 * plant in Manual (mode 0) by responseAt's two flight method
 * (tests/lib/wingpilot.js): the same flight flown twice from the same
 * start, once with the axis' surface moved a held sinusoid a frame at a
 * time, the differences of the two taken against each other so what a
 * hold does about the flight drops out; the surface is the one the plant
 * flies (sim_plane_surfaces backed out of the mix, as as3x-derive's
 * power() does), after the expo, the trim and the servos' slew. The
 * margins are read on the unit circle up to the frame's Nyquist rate,
 * pi / T, where a sampled loop's last chance to cross -180 deg is: a
 * loop that goes there rings at half the frame rate, the surfaces
 * buzzing a frame up and a frame down.
 *
 * The margin rule. Spektrum's own: "Increase the gain values until you
 * find oscillation, and then reduce the gain to the highest setting that
 * will not cause oscillation at any speed" (the AR631 manual, AS3X Tuning
 * Basics; the Extra's BNF receiver, its manual p. 10: "AR631 gain values
 * may need to be adjusted"), with "oscillation ... will usually occur at
 * higher speeds". How far under the onset is the flight control margin
 * as3x-derive already cited, MIL-F-9490D's 6 dB of gain, and the 45 deg
 * of phase the bandwidth criterion pairs with it (Peahl, Kolkailah and
 * Sandlin, NASA NCC2-338, 1986: "the phase margin is 45 degrees or the
 * gain margin is 6 dB", the pair tests/lib/wingpilot.js flies the person
 * on). A gain margin is the factor the gain may grow by before the
 * oscillation starts.
 *
 * Harness arithmetic in JS maths, which is allowed here because nothing
 * it prints is hashed.
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

import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim } from '../../tests/lib/simmod.js';
import { must, attitude } from '../../tests/lib/wingpilot.js';
import { TABLE } from '../../configs/power.js';
import { RATES, normalizeEntry, setupFor, stockEntry, tuneBlock } from '../../configs/tuning.js';
import { SEAT_FULL, wingSeat } from './propcurve.js';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

/* MIL-F-9490D's 6 dB; the bandwidth criterion's 45 deg (above). */
export const GM_MIN_DB = 6;
export const PM_MIN_DEG = 45;

/* The receiver writes da - out, de + out, delta_r - out (plant_wing.c). */
const SIGMA = [-1, 1, -1];

const cx = (re, im = 0) => ({ re, im });
const mul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const add = (a, b) => cx(a.re + b.re, a.im + b.im);
const scale = (a, s) => cx(a.re * s, a.im * s);
const div = (a, b) => { const d = b.re * b.re + b.im * b.im; return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
const expj = (th) => cx(Math.cos(th), Math.sin(th));
const abs = (a) => Math.hypot(a.re, a.im);

/* The receiver at z = e^(j theta): its damper and its heading's sum. */
export function receiverC(theta, k, kh, T) {
  return add(cx(k), div(cx(kh * T), add(cx(1), scale(expj(-theta), -1))));
}

/* The surfaces the receiver writes, backed out of the mix: an elevon's
 * pitch is the pair's mean and its roll half their difference, a tail's
 * ailerons are opposed and its elevator a slot of its own (as3x-derive's
 * power()). */
export function surfaceCmd(sim) {
  must(sim.e.sim_plane_surfaces(sim.surfPtr), 'sim_plane_surfaces');
  const sf = new Float64Array(sim.e.memory.buffer, sim.surfPtr, 4);
  return [(sf[1] - sf[0]) / 2, sf[2] + (sf[0] + sf[1]) / 2, sf[3]];
}

/* The airframe at theta radians a frame: a condition flown in Manual
 * (start(sim) puts the aircraft there, hold(state) gives the sticks that
 * keep it there, pin(sim) run each step keeps the speed, or null), its
 * sticks taken a frame at a time as the receiver's surface is, the
 * axis' stick moved by amp cos(theta n) on top of the hold's. The rate
 * at each frame's start against the surface flown over that frame, the
 * two flights' differences fitted for their cos and sin at theta over
 * whole cycles after the settle; null if the surface did not move. */
function flySweep(sim, cond, axis, theta, T, amp, input = 'surface') {
  const F = Math.round(T * 1000);
  const cycleFrames = 2 * Math.PI / theta;
  const settle = Math.max(Math.ceil(2 * cycleFrames), Math.ceil(0.3 / T));
  const span = Math.max(Math.ceil(4 * cycleFrames), Math.ceil(0.6 / T));
  const fly = (a) => {
    cond.start(sim);
    const t0 = cond.t0 ?? 0;
    const us = [], ys = [];
    let st = null;
    for (let n = 0; n < settle + span; n += 1) {
      const s = sim.readState().state;
      ys.push(s[11 + axis]);
      st = cond.hold(s).slice();
      st[axis] = Math.max(-1, Math.min(1, st[axis] + a * Math.cos(theta * n)));
      let u = 0;
      for (let i = 0; i < F; i += 1) {
        must(sim.input(t0 + (n * F + i) / 1000, ...st), 'sim_input');
        must(sim.step(1), 'sim_step');
        if (cond.pin) cond.pin(sim);
        u += (input === 'stick' ? st[axis] : surfaceCmd(sim)[axis]) / F;
      }
      us.push(u);
    }
    return { us, ys };
  };
  const still = fly(0), swept = fly(amp);
  const fit = (x) => {
    let c = 0, s = 0, cc = 0, ss = 0;
    for (let n = settle; n < settle + span; n += 1) {
      c += x[n] * Math.cos(theta * n); s += x[n] * Math.sin(theta * n);
      cc += Math.cos(theta * n) ** 2; ss += Math.sin(theta * n) ** 2;
    }
    /* A phasor X with x_n = Re(X e^(j theta n)): re = c / cc, im = -s / ss. */
    return cx(c / cc, ss > 1e-9 ? -s / ss : 0);
  };
  const du = fit(swept.us.map((x, i) => x - still.us[i]));
  if (!(abs(du) > 0)) return null;
  return div(fit(swept.ys.map((x, i) => x - still.ys[i])), du);
}

/* The grid, radians a frame: log spaced from wLo rad/s up to the Nyquist
 * rate, pi, itself the last point. Not under 1 rad/s: six periods there
 * are a minute of flight, over which the hover's hold wanders far
 * enough off its hang that the two flights part company (the Extra's
 * hover yaw read 10.8 rad/s per rad at -176 deg at 0.3 rad/s and 0.46
 * at -63 at 0.56). */
export function gridFor(T, wLo = 1, n = 28) {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(wLo * T * Math.pow(Math.PI / (wLo * T), i / (n - 1)));
  return out;
}

/* The airframe's response on one axis over the grid, per unit of the
 * surface the plant flies, or with input 'stick' per unit of the stick
 * (a flight controller's output, which the radio's expo and the servos
 * then carry, as they carry a pilot's). */
export function plantResponse(sim, cond, axis, grid, T, amp = 0.05, input = 'surface') {
  return grid.map((theta) => ({ theta, w: theta / T, p: flySweep(sim, cond, axis, theta, T, amp, input) }));
}

/* The loop at a gain on the measured response, and its margins: the gain
 * margin at the highest frequency the phase crosses -180 deg (or meets
 * it at the Nyquist rate, where the loop is real), the factor the gain
 * may grow by before the loop rings there, negative in dB when it
 * already does (Infinity when it never crosses); the phase margin at the
 * highest unity crossing; the peak of the sensitivity |1 / (1 + L)|, the
 * most a disturbance is amplified. */
export function margins(resp, axis, k, kh, T) {
  return loopMargins(resp, (theta) => scale(receiverC(theta, k, kh, T), -SIGMA[axis]));
}

/* The same for any controller: C(theta) the factor on the measured
 * response that makes the loop, L = C P, fed back negatively. */
export function loopMargins(resp, C) {
  const pts = resp.filter((r) => r.p).map((r) => {
    const L = mul(C(r.theta), r.p);
    return { w: r.w, mag: abs(L), ph: Math.atan2(L.im, L.re), ms: 1 / abs(add(cx(1), L)), L };
  });
  for (let i = 1; i < pts.length; i += 1) {
    let d = pts[i].ph - pts[i - 1].ph;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    pts[i].ph = pts[i - 1].ph + d;
  }
  /* Every crossing of -180 deg and of unity. The gain margin is the
   * least 1 / |L| over the -180 deg crossings under unity, unless the
   * highest one is over it, where the loop already rings; the phase
   * margin the least over the unity crossings. */
  const c180 = [], cUnity = [];
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1], b = pts[i];
    for (let m = -7; m <= 7; m += 2) {
      const lim = m * Math.PI;
      if ((a.ph - lim) * (b.ph - lim) <= 0 && a.ph !== b.ph) {
        const f = (lim - a.ph) / (b.ph - a.ph);
        c180.push({ mag: Math.exp(Math.log(a.mag) + f * (Math.log(b.mag) - Math.log(a.mag))), w: a.w * Math.pow(b.w / a.w, f) });
      }
    }
    if ((a.mag - 1) * (b.mag - 1) <= 0 && a.mag !== b.mag) {
      const f = (0 - Math.log(a.mag)) / (Math.log(b.mag) - Math.log(a.mag));
      const ph = a.ph + f * (b.ph - a.ph);
      cUnity.push({ w: a.w * Math.pow(b.w / a.w, f), pm: ((ph + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) });
    }
  }
  const last = pts[pts.length - 1];
  if (last.L.re < 0) c180.push({ mag: last.mag, w: last.w });
  let gm = Infinity, w180 = null, pm = null, wc = null;
  const top = c180.reduce((x, c) => (x === null || c.w > x.w ? c : x), null);
  if (top && top.mag >= 1) {
    gm = 1 / top.mag; w180 = top.w;
  } else {
    for (const c of c180) if (c.mag < 1 && 1 / c.mag < gm) { gm = 1 / c.mag; w180 = c.w; }
  }
  for (const c of cUnity) if (pm === null || c.pm < pm) { pm = c.pm; wc = c.w; }
  /* A loop still over unity at the grid's foot crosses below it: its
   * phase margin is taken there, the nearest the grid has. */
  if (pm === null && pts[0].mag > 1) {
    wc = pts[0].w;
    pm = ((pts[0].ph + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  }
  return {
    gmDb: 20 * Math.log10(gm), w180, pmDeg: pm === null ? null : pm * 180 / Math.PI, wc,
    msDb: 20 * Math.log10(Math.max(...pts.map((p) => p.ms))),
  };
}

/* The largest factor on (k, kh) together, their ratio kept, that holds
 * both margins on every response given, and on every factor below it: a
 * receiver whose gain is turned up from zero passes through each of them.
 * The margins are not monotonic in the gain (a loop can lose its margin
 * at one gain and get it back at a higher one, where another crossing
 * takes over), so a bisection that only doubles while the gain holds can
 * land on either side of such a window: on the Slick's hover alone it
 * returned 1.579 for the roll damper, whose margin fails from 0.0429 and
 * holds again at 1 (batch 735a677bf's plant; w37-flat-fall).
 * Taken over every condition together it happened to land on 0.0429,
 * which is why the tables were right. The factor is found as the
 * first failure on a sampled sweep, 2 percent apart from 1e-4 to 64,
 * then bisected between that sample and the last that held, 40 halvings.
 * Below the sweep's first sample a loop holds (a gain of nothing changes
 * nothing). */
export function gainForMargins(resps, axis, k, kh, T) {
  return factorForMargins(resps, (g, theta) => scale(receiverC(theta, g * k, g * kh, T), -SIGMA[axis]));
}

/* The same for any controller: C(g, theta) at factor g. */
export function factorForMargins(resps, C) {
  const ok = (g) => resps.every((resp) => {
    const m = loopMargins(resp, (theta) => C(g, theta));
    return m.gmDb >= GM_MIN_DB && (m.pmDeg === null || m.pmDeg >= PM_MIN_DEG);
  });
  let lo = 0, hi = null;
  for (let g = 1e-4; g <= 64; g *= 1.02) {
    if (!ok(g)) { hi = g; break; }
    lo = g;
  }
  if (hi === null) return lo;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) lo = mid; else hi = mid;
  }
  return lo;
}

/*
 * THE CONDITIONS. Level flight at a speed is flown with the speed held:
 * the world velocity's direction left free (the angle of attack and the
 * sideslip move as the aircraft does) and its size put back each step,
 * which leaves the short period and the Dutch roll their own and takes
 * the phugoid out, whose period is far under every crossover here. The
 * attitude is held on plain loops whose effect drops out of the two
 * flight difference. A harrier holds the whole velocity, level, the nose
 * at its angle. A hover is flown free on as3x-derive's hover hold.
 */
const clamp = (x) => Math.max(-1, Math.min(1, x));

function pinSpeed(V) {
  return (sim) => {
    const s = sim.readState().state;
    const v = Math.hypot(s[4], s[5], s[6]);
    if (v > 0) must(sim.e.sim_set_velocity(s[4] * V / v, s[5] * V / v, s[6] * V / v, s[11], s[12], s[13]), 'sim_set_velocity');
  };
}

export function levelCondition(id, V, throttle) {
  return {
    id, V, throttle,
    start(sim) {
      must(sim.reset(), 'sim_reset');
      must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
      must(sim.e.sim_set_pose(0, 0, 300, 1, 0, 0, 0), 'sim_set_pose');
      must(sim.e.sim_wing_launch(V), 'sim_wing_launch');
    },
    /* On the attitude alone: a rate term taken a frame at a time rings
     * at the frame's Nyquist rate at speed, as the receiver does. */
    hold(s) {
      const { pitch, bank } = attitude(s);
      return [clamp(-0.5 * bank), clamp(1.0 * (0 - pitch)), 0, throttle];
    },
    pin: pinSpeed(V),
  };
}

/* The dive: nose down 80 deg (a bank still defined) at its terminal
 * speed, full throttle, the speed held. */
export function diveCondition(V) {
  const a = -80 * Math.PI / 180;
  return {
    id: 'dive', V, throttle: 1,
    start(sim) {
      must(sim.reset(), 'sim_reset');
      must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
      must(sim.e.sim_set_pose(0, 0, 3000, Math.cos(a / 2), 0, -Math.sin(a / 2), 0), 'sim_set_pose');
      must(sim.e.sim_wing_launch(V), 'sim_wing_launch');
    },
    hold(s) {
      const { pitch, bank } = attitude(s);
      return [clamp(-0.5 * bank), clamp(1.0 * (a - pitch)), 0, 1];
    },
    pin: pinSpeed(V),
  };
}

export function harrierCondition(V, throttle, alphaDeg) {
  const a = alphaDeg * Math.PI / 180;
  let iP = 0;
  return {
    id: 'harrier', V, throttle,
    start(sim) {
      iP = 0;
      must(sim.reset(), 'sim_reset');
      must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
      /* Nose up a about the body's y (left): the quaternion's y is -sin(a/2). */
      must(sim.e.sim_set_pose(0, 0, 300, Math.cos(a / 2), 0, -Math.sin(a / 2), 0), 'sim_set_pose');
      must(sim.e.sim_set_velocity(V, 0, 0, 0, 0, 0), 'sim_set_velocity');
    },
    hold(s) {
      const { pitch, bank } = attitude(s);
      iP = clamp(iP + 0.004 * (a - pitch));
      return [clamp(-0.5 * bank), clamp(iP + 1.0 * (a - pitch)), 0, throttle];
    },
    pin(sim) {
      const s = sim.readState().state;
      must(sim.e.sim_set_velocity(V, 0, 0, s[11], s[12], s[13]), 'sim_set_velocity');
    },
  };
}

/* as3x-derive's hover hold: the nose on the vertical, the height on the
 * throttle, from the stick that hangs the weight on the prop. */
export function hoverCondition(startThrottle) {
  let thr, iR, iP, iY;
  return {
    id: 'hover', V: 0, throttle: startThrottle, t0: 4,
    start(sim) {
      must(sim.reset(), 'sim_reset');
      must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
      must(sim.e.sim_set_pose(0, 0, 50, Math.SQRT1_2, 0, -Math.SQRT1_2, 0), 'sim_set_pose');
      thr = startThrottle; iR = 0; iP = 0; iY = 0;
      for (let ms = 0; ms < 1000; ms += 1) {
        must(sim.e.sim_set_pose(0, 0, 50, Math.SQRT1_2, 0, -Math.SQRT1_2, 0), 'sim_set_pose');
        must(sim.e.sim_set_velocity(0, 0, 0, 0, 0, 0), 'sim_set_velocity');
        must(sim.input(ms / 1000, 0, 0, 0, thr), 'sim_input');
        must(sim.step(1), 'sim_step');
      }
      /* Then 3 s on the hold, so a sweep starts from the hang. */
      for (let ms = 1000; ms < 4000; ms += 1) {
        must(sim.input(ms / 1000, ...this.hold(sim.readState().state)), 'sim_input');
        must(sim.step(1), 'sim_step');
      }
    },
    hold(s) {
      const [w, x, y, z] = [s[7], s[8], s[9], s[10]];
      const up2 = 1 - 2 * (x * x + y * y), upY = 2 * (y * z + w * x);
      thr = Math.max(0, Math.min(1, thr - 0.0005 * s[6] - 0.000125 * (s[3] - 50)));
      iR = Math.max(-1.5, Math.min(1.5, iR - 0.002 * s[11]));
      iP = clamp(iP + 0.001 * up2);
      iY = clamp(iY - 0.001 * upY);
      return [clamp(iR - 0.5 * s[11]), clamp(iP + 3 * up2 + 0.5 * s[12]), clamp(iY - 3 * upY + 0.5 * s[13]), thr];
    },
    pin: null,
  };
}

/*
 * THE AIRCRAFT. Every table with an AS3X row (as3x-derive's list), and the
 * aircraft set up as the derivations fly them.
 */
/* `srm`: the factory AS3X rate gains, roll, pitch and yaw, of the BNF's
 * own receiver preset, Spektrum's .SRM model file for it (JSON;
 * as3xSettings.rateGains of the flight mode a normal bind flies,
 * cpSettings.defaultFlightMode 1, SAFE off; priority 160 on every axis
 * and isHeadingEnabled 0 in every mode), from Spektrum's preset share
 * linked by https://spektrumrc.com/ProdInfo/Files/SPM-Model-Setups-AS3X-SAFE-RX.pdf.
 * In the receiver's own units, which nothing published maps to a
 * surface's angle: only their ratios are taken (as3x-derive.js). The
 * Timber on floats flies the land plane's receiver and preset. A table
 * without one is not a Spektrum BNF with AS3X, or has no preset.
 * `kick`: a 3D aircraft whose gate flies a harrier, its program in
 * scripts/lib/harrierkick.js PROGRAMS: its full Heading is held to
 * E11b's kick there (as3x-derive.js). */
export const AS3X = {
  FW_EXTRA3D1308: { sim: 29, th: ['extra', 'e11_harrier'], kick: 'extra', srm: [6, 30, 24], srmName: 'EFL115500 Extra 300 3D 1.3m BNF Basic with AS3X and SAFE Select' },
  FW_TIMBER1500: { sim: 7, srm: [36, 73, 96], srmName: 'EFL105250 Turbo Timber Evolution 1.5m BNF Basic' },
  FW_TIMBER1500F: { sim: 9, srm: [36, 73, 96], srmName: 'EFL105250 Turbo Timber Evolution 1.5m BNF Basic' },
  FW_CUB1400: { sim: 4 },
  FW_CUB1400F: { sim: 10 },
  FW_SLOWSTICK1180: { sim: 5 },
  FW_RADIAN2000: { sim: 6 },
  FW_BOMBSHELL1118: { sim: 11 },
  FW_KADET1981: { sim: 12 },
  FW_P51D1450: { sim: 15 },
  FW_F16878: { sim: 16 },
  FW_ZAGI1219: { sim: 17 },
  FW_UGLYSTIK1567: { sim: 19 },
  FW_TIGERMOTH1803: { sim: 23 },
  FW_NIGHTTIMBER1200: { sim: 30, srm: [34, 25, 20], srmName: 'EFL13850 Night Timber X SAFE select' },
  FW_HERCULES3077: { sim: 31 },
  FW_CAP1702: { sim: 32, th: ['cap580', 'c11_harrier'], kick: 'cap' },
  FW_SLICK2680: { sim: 33, th: ['slick', 's11_harrier'], kick: 'slick' },
};

/* The tune block a table flies at `rate` (configs/tuning.js RATES), the
 * rest of the stock setup kept, or at the stock setup itself for null:
 * null where that is the table's own (the high rate, no first flight
 * rate in the manual). */
export function tuneOf(name, rate = null) {
  const id = Object.keys(TABLE).find((k) => TABLE[k].simId === AS3X[name].sim);
  const { massKg, packKg, limits } = setupFor(id, null);
  const entry = normalizeEntry(id, rate ? { ...stockEntry(id), rate } : {}, limits);
  return tuneBlock(id, entry, massKg, packKg);
}
/* The rates the tune screen offers, and the stock one. */
export const stockRate = (name) => stockEntry(Object.keys(TABLE).find((k) => TABLE[k].simId === AS3X[name].sim)).rate;
export { RATES };
/* Every setup the receiver is flown on: the table as the gates fly it,
 * and each rate whose block is not the table's own. */
export function setupsOf(name) {
  return [{ rate: 'table', block: null }, ...RATES.map((rate) => ({ rate, block: tuneOf(name, rate) })).filter((c) => c.block)];
}

/* A table's body in plant_wing.c's source, and a number or list off it. */
export function rowOf(src, name) {
  return src.slice(src.indexOf(`const FixedWingParams ${name} = {`)).split('\n};')[0];
}
export function numOf(body, field) {
  const m = new RegExp(`\\.${field} = (-?[0-9.]+)`).exec(body);
  return m ? Number(m[1]) : null;
}
export function listOf(body, field) {
  const m = new RegExp(`\\.${field} = \\{([^}]*)\\}`).exec(body);
  return m ? m[1].split(',').map((x) => Number(x.trim())) : null;
}
/* The frame the receiver writes at, s: the table's, or Spektrum's 22 ms
 * default (plant_wing.c AS3X_FRAME_DEFAULT). */
export const frameOf = (body) => numOf(body, 'as3x_frame') ?? 0.022;

/* Level at full throttle, the pitch held on the elevator, until the speed
 * stops growing: the top speed (as3x-derive's). */
export function topSpeed(sim, MS = 4) {
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
  must(sim.e.sim_set_pose(0, 0, 300, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(15), 'sim_wing_launch');
  let t = 0, s;
  for (let ms = 0; ms < 30000; ms += MS) {
    s = sim.readState().state;
    const { pitch } = attitude(s);
    const stick = Math.max(-1, Math.min(1, 2 * (0 - pitch) + 0.2 * s[12] - 0.05 * s[6]));
    must(sim.input(t / 1000, 0, stick, 0, 1), 'sim_input');
    must(sim.step(MS), 'sim_step');
    t += MS;
  }
  return Math.hypot(s[4], s[5], s[6]);
}

/* Whether the hover hold keeps the aircraft hanging: the nose within 20
 * deg of vertical and the height within 10 m from 3 s to 6 s
 * (hover-probe.js's bounds, as3x-derive's hoverHeld). */
export function hoverHolds(sim, cond) {
  cond.start(sim);
  for (let ms = 0; ms < 6000; ms += 1) {
    const s = sim.readState().state;
    const [, x, y] = [s[7], s[8], s[9]];
    const up2 = 1 - 2 * (x * x + y * y);
    if (ms >= 3000 && !(Math.abs(up2) < Math.sin(20 / 180 * Math.PI) && Math.abs(s[3] - 50) < 10)) return false;
    must(sim.input(cond.t0 + ms / 1000, ...cond.hold(s)), 'sim_input');
    must(sim.step(1), 'sim_step');
  }
  return true;
}

/* The fastest the aircraft flies: straight down at full throttle, the
 * nose held on the vertical, until the speed stops growing (30 s), on
 * the pack seated. Within sim_wing_launch's 60 m/s, the speed the dive
 * condition is flown at. */
export function terminalDive(sim) {
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
  must(sim.e.sim_set_pose(0, 0, 3000, Math.SQRT1_2, 0, Math.SQRT1_2, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(20), 'sim_wing_launch');
  let s;
  for (let ms = 0; ms < 30000; ms += 4) {
    s = sim.readState().state;
    const { pitch } = attitude(s);
    must(sim.input(ms / 1000, 0, Math.max(-1, Math.min(1, -Math.PI / 2 - pitch + 0.2 * s[12])), 0, 1), 'sim_input');
    must(sim.step(4), 'sim_step');
  }
  return Math.min(60, Math.hypot(s[4], s[5], s[6]));
}

/*
 * THE LOOP CLOSED, at any gain. The receiver of plant_wing.c with the
 * stick centred (priority 1), run here a step at a time on the plant in
 * Manual: once a frame the rate read and the heading's sum taken, its
 * output held the frame, and the surface it asks flown through the
 * stick that gives it (the radio's expo inverted), so the plant's own
 * servo slew, throw and trim carry it as they carry mode 3's. At gain 1
 * it is mode 3 (receiverMatches checks it on the plant); at g it is the
 * receiver with its gains times g, which the plant cannot be told. The
 * literal form of Spektrum's tuning rule: raise the gain until it
 * oscillates.
 */
function stickFor(d, expo) {
  const y = Math.max(-1, Math.min(1, d));
  let lo = -1, hi = 1;
  for (let i = 0; i < 50; i += 1) {
    const x = (lo + hi) / 2;
    if (x * x * x * expo + x * (1 - expo) < y) lo = x; else hi = x;
  }
  return (lo + hi) / 2;
}

/* The receiver on the table, or under a tune block (sim_wing_set_tune,
 * configs/tuning.js tuneBlock) seated on the plant: its throws, expo per
 * surface and trim, over the travel the receiver learned, the table's
 * throws (plant.c plant_tune_over). */
export function receiverOf(body, block = null) {
  const deg = Math.PI / 180;
  const thr = (f) => { const m = new RegExp(`\\.${f} = ([0-9.]+) \\* WING_PI / 180\\.0`).exec(body); return m ? Number(m[1]) * deg : numOf(body, f) ?? 0; };
  const travel = [thr('throw_a'), thr('throw_e'), thr('throw_r')];
  const expo = numOf(body, 'expo') ?? 0;
  return {
    k: listOf(body, 'as3x_k'), kh: listOf(body, 'as3x_kh'), rate: listOf(body, 'as3x_rate'), T: frameOf(body), travel,
    th: block ? [block[3], block[4], block[5]] : travel,
    expo: block ? [block[6], block[7], block[8]] : [expo, expo, expo],
    trim: block ? block[9] : 0,
    rudderMix: /\.mix = FW_MIX_RUDDER/.test(body),
  };
}

/* What the receiver reads on axis a's channel at stick x: plant_wing.c
 * as3x_channel, the stick's shape on the full throw times the throw over
 * the learned travel, within the travel. */
export function channelOf(rx, a, x) {
  const t = rx.travel[a] > 0 ? rx.travel[a] : rx.th[a];
  if (!(t > 0)) return 0;
  const c = Math.max(-1, Math.min(1, shape(Math.max(-1, Math.min(1, x)), rx.expo[a]))) * (rx.th[a] / t);
  return Math.max(-1, Math.min(1, c));
}

/* A flight at condition cond with the receiver closed at gains g (one
 * factor per axis), the rate on `axis` kicked by `kick` rad/s at 0.4 s;
 * the rate trace on that axis from the kick, rad/s, every step. */
export function closedFlight(sim, cond, rx, g, axis, kick, ms = 1500) {
  cond.start(sim);
  const t0 = cond.t0 ?? 0;
  const h = [0, 0, 0], out = [0, 0, 0];
  let tf = 0;
  const trace = [];
  for (let i = 0; i < 400 + ms; i += 1) {
    if (i === 400) {
      const s = sim.readState().state;
      const w = [s[11], s[12], s[13]];
      w[axis] += kick;
      must(sim.e.sim_set_velocity(s[4], s[5], s[6], ...w), 'sim_set_velocity');
    }
    const s = sim.readState().state;
    tf -= 0.001;
    if (tf <= 1e-12) {
      tf += rx.T;
      for (let a = 0; a < 3; a += 1) {
        h[a] += s[11 + a] * rx.T;
        if (rx.kh[a] > 0) h[a] = Math.max(-rx.th[a] / rx.kh[a], Math.min(rx.th[a] / rx.kh[a], h[a]));
        out[a] = g[a] * (rx.k[a] * s[11 + a] + rx.kh[a] * h[a]);
      }
    }
    /* da - out, de + out, delta_r - out, each clipped at its throw, then
     * the stick that flies it: delta_r is minus the rudder stick's. */
    const clip = (x, m) => Math.max(-m, Math.min(m, x));
    const da = clip(-out[0], rx.th[0]);
    const de = clip(rx.trim + out[1], rx.th[1]) - rx.trim;
    const dr = clip(-out[2], rx.th[2]);
    const st = [
      rx.th[0] > 0 && !rx.rudderMix ? stickFor(da / rx.th[0], rx.expo[0]) : 0,
      rx.th[1] > 0 ? stickFor(de / rx.th[1], rx.expo[1]) : 0,
      rx.th[2] > 0 ? stickFor(-dr / rx.th[2], rx.expo[2]) : 0,
      cond.hold(s)[3],
    ];
    must(sim.input(t0 + i / 1000, ...st), 'sim_input');
    must(sim.step(1), 'sim_step');
    if (cond.pin) cond.pin(sim);
    if (i >= 400) trace.push(sim.readState().state[11 + axis]);
  }
  return trace;
}

/* The same flight in the plant's own mode 3, the sticks centred. */
export function modeThreeFlight(sim, cond, axis, kick, ms = 1500) {
  cond.start(sim);
  must(sim.e.sim_wing_set_stab(3), 'sim_wing_set_stab');
  const t0 = cond.t0 ?? 0;
  const trace = [];
  for (let i = 0; i < 400 + ms; i += 1) {
    const s = sim.readState().state;
    if (i === 400) {
      const w = [s[11], s[12], s[13]];
      w[axis] += kick;
      must(sim.e.sim_set_velocity(s[4], s[5], s[6], ...w), 'sim_set_velocity');
    }
    must(sim.input(t0 + i / 1000, 0, 0, 0, cond.hold(s)[3]), 'sim_input');
    must(sim.step(1), 'sim_step');
    if (cond.pin) cond.pin(sim);
    if (i >= 400) trace.push(sim.readState().state[11 + axis]);
  }
  must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
  return trace;
}

/* Whether the kick's own rate (the kicked flight less the same flight
 * unkicked at the table's gains, so a loop that rings by itself rings
 * here too) is still ringing a second on: its peak over the last half
 * second at least half its peak over the half second before, and above
 * a twentieth of the kick. */
export function rings(kicked, still, kick) {
  const d = kicked.map((x, i) => Math.abs(x - still[i]));
  const peak = (a, b) => Math.max(...d.slice(a, b));
  const late = peak(d.length - 500, d.length), early = peak(d.length - 1000, d.length - 500);
  return late > 0.05 * Math.abs(kick) && late >= 0.5 * early;
}

/* The gain factor on one axis, the others at the table's, at which the
 * loop starts to ring, bisected to 2 percent between 1/16 and 64 (64 if
 * it never rings, which the caller reports as a bound). */
export function onsetGain(sim, cond, rx, axis, kick) {
  const at = (x) => { const g = [1, 1, 1]; g[axis] = x; return g; };
  const still = closedFlight(sim, cond, rx, at(1), axis, 0);
  const ringsAt = (x) => {
    const g = at(x);
    return rings(closedFlight(sim, cond, rx, g, axis, kick), still, kick);
  };
  let lo = 1 / 16, hi = 64;
  if (!ringsAt(hi)) return hi;
  if (ringsAt(lo)) return lo;
  while (hi / lo > 1.02) {
    const mid = Math.sqrt(lo * hi);
    if (ringsAt(mid)) hi = mid; else lo = mid;
  }
  return Math.sqrt(lo * hi);
}

/*
 * ONE AIRCRAFT MEASURED: its conditions and the airframe's response on
 * each axis the receiver has a surface on, on a full pack (SEAT_FULL, the
 * most thrust and so the most slipstream over the tail it ever flies
 * with). The conditions: slow flight, 1.3 times the stall on the table's
 * own CLmax, mass and area (the usual approach margin); the table's
 * cruise at the stick that flies it level; the top speed level at full
 * throttle; the dive, the fastest it flies (terminalDive); the harrier
 * where a gate flies one, at the middle of its bands; the hover where
 * the hover hold keeps it hanging.
 */
const RHO = 1.225;
const G = 9.80665;

/* `block`: a tune block to seat (tuneOf), or none for the table. */
export async function planeSim(simId, volts = SEAT_FULL, block = null) {
  const sim = await loadSim(new Uint8Array(readFileSync(join(ROOT, 'dist/sim.wasm'))));
  must(sim.init(readFileSync(join(ROOT, 'tests/fixtures/config-baseline.diff'), 'utf8')), 'sim_init');
  must(sim.e.sim_set_airframe(simId), 'sim_set_airframe');
  must(sim.setCellVoltage(volts), 'sim_set_cell_voltage');
  if (block) must(sim.setTune(block), 'sim_wing_set_tune');
  sim.surfPtr = sim.e.malloc(4 * 8);
  return sim;
}

/* `block`: a tune block seated (tuneOf), the table's own for none. */
export async function measurePlane(name, src, block = null) {
  const a = AS3X[name];
  const body = rowOf(src, name);
  const T = frameOf(body);
  const sim = await planeSim(a.sim, SEAT_FULL, block);
  const t = Object.values(TABLE).find((x) => x.simId === a.sim);
  const trim = numOf(body, 'stab_trim_throttle');
  const vs = Math.sqrt(2 * t.massKg * G / (RHO * numOf(body, 'area') * numOf(body, 'cl_max')));
  const conds = [
    levelCondition('slow', 1.3 * vs, trim),
    levelCondition('cruise', t.cruiseMs, trim),
    levelCondition('top', topSpeed(sim), 1),
    diveCondition(terminalDive(sim)),
  ];
  if (a.th) {
    const th = JSON.parse(readFileSync(join(ROOT, `tests/${a.th[0]}-thresholds.json`), 'utf8'))[a.th[1]];
    conds.push(harrierCondition((th.vMin + th.vMax) / 2, (th.dutyMin + th.dutyMax) / 2, th.alphaDeg));
  }
  const electric = /\.current_full = [1-9]/.test(body);
  const hover = hoverCondition(electric ? wingSeat(name).hoverStick(SEAT_FULL) ?? 1 : 0.6);
  if (hoverHolds(sim, hover)) conds.push(hover);
  /* An axis with no surface of its own (no ailerons on a rudder mix, no
   * rudder on the Zagi) has nothing for the receiver to move. */
  const rx = receiverOf(body);
  const has = [!rx.rudderMix && rx.th[0] > 0, rx.th[1] > 0, rx.th[2] > 0];
  const grid = gridFor(T);
  return {
    name, T,
    conds: conds.map((c) => ({ id: c.id, V: c.V, resp: [0, 1, 2].map((ax) => (has[ax] ? plantResponse(sim, c, ax, grid, T) : null)) })),
  };
}

/* The measured responses back from JSON. */
export function revive(m) {
  for (const c of m.conds) {
    c.resp = c.resp.map((r) => (r === null ? null : r.map((x) => ({ ...x, p: x.p ?? null }))));
  }
  return m;
}

/* The cores this process may use: the tightest CPU quota (cgroup v2
 * cpu.max, quota over period) on its cgroup or any parent, since a job
 * slice's quota sits above the scope a check runs in and the core count
 * the process sees ignores it; the cores seen where there is none. */
export function coresAllowed() {
  let cores = availableParallelism();
  let path;
  try {
    path = readFileSync('/proc/self/cgroup', 'utf8').split('\n').find((l) => l.startsWith('0::')).slice(3).trim();
  } catch {
    return cores;
  }
  for (let dir = path; dir; dir = dir.slice(0, dir.lastIndexOf('/'))) {
    let max;
    try {
      max = readFileSync(`/sys/fs/cgroup${dir}/cpu.max`, 'utf8').trim().split(/\s+/);
    } catch {
      continue;
    }
    if (max[0] !== 'max') cores = Math.min(cores, Math.max(1, Math.floor(Number(max[0]) / Number(max[1]))));
  }
  return cores;
}

/* At most 4 at once in CI (lead decision 2026-10-12): a runner shares its
 * host with the other jobs of the batch. */
const CI_WORKERS = 4;

/* Each aircraft measured in its own process, as many at once as the
 * quota allows: script --plane NAME prints its measure as JSON. */
export function fanOut(script, names, args = []) {
  const cap = process.env.CI ? CI_WORKERS : Infinity;
  const n = Math.max(1, Math.min(names.length, coresAllowed(), cap));
  const out = {};
  let next = 0;
  const run = () => {
    if (next >= names.length) return Promise.resolve();
    const name = names[next++];
    return new Promise((resolve, reject) => {
      execFile(process.execPath, [script, '--plane', name, ...args], { maxBuffer: 1 << 28 }, (err, stdout, stderr) => {
        if (err) { reject(new Error(`${name}: ${stderr || err.message}`)); return; }
        out[name] = JSON.parse(stdout);
        resolve();
      });
    }).then(run);
  };
  return Promise.all(Array.from({ length: n }, run)).then(() => out);
}

/*
 * THE RECEIVER WITH A PILOT, at any gain: plant_wing.c's mode 3 with the
 * sticks in, run here a step at a time on the plant in Manual. Each axis'
 * gain fades with its own stick, Spektrum's priority 160 (gone at 40
 * percent stick, AS3X_ZERO); the roll stick moves the rudder on a rudder
 * mix, as the plant's rudder_stick. The pilot's surface is the radio's
 * (the expo's cubic on the throw, the trim on the elevator), the gyro's
 * offset added and the sum clipped at the throw, then flown through the
 * stick that gives it, so the plant's own servo slew carries it. The
 * Heading at kh (rad of surface per rad, per axis; the plant's is its
 * share of as3x_kh) sums the rotation beyond what the channel asks, the
 * channel times as3x_rate, faded with the gain and held to what the throw
 * can answer, as the plant's. as3x-feel.js F0 checks it against the
 * plant's mode 3, the Heading off and at full.
 */
const AS3X_ZERO = 0.4;
const priority = (x) => Math.max(0, 1 - Math.abs(x) / AS3X_ZERO);
const shape = (x, expo) => x * x * x * expo + x * (1 - expo);

/* The receiver, one millisecond at a time: given the state and the
 * pilot's [roll, pitch, yaw], the sticks that fly its surfaces in Manual.
 * g the damper's factor per axis, kh the Heading per axis. */
export function receiverStepper(rx, g, kh = [0, 0, 0]) {
  const clip = (x, m) => Math.max(-m, Math.min(m, x));
  const clamp1 = (x) => Math.max(-1, Math.min(1, x));
  const out = [0, 0, 0], h = [0, 0, 0];
  let tf = 0;
  return {
    reset() { out.fill(0); h.fill(0); tf = 0; },
    sticks(s, roll, pitch, yaw) {
      const st = [roll, pitch, rx.rudderMix ? clamp1(yaw + roll) : yaw];
      tf -= 0.001;
      if (tf <= 1e-12) {
        tf += rx.T;
        for (let a = 0; a < 3; a += 1) {
          const c = channelOf(rx, a, st[a]);
          const pr = priority(c);
          const err = s[11 + a] - c * rx.rate[a];
          h[a] = pr > 0 && kh[a] > 0 ? h[a] + pr * err * rx.T : 0;
          if (kh[a] > 0) h[a] = clip(h[a], rx.th[a] / kh[a]);
          out[a] = pr * (g[a] * rx.k[a] * s[11 + a] + kh[a] * h[a]);
        }
      }
      const da = clip(clip(shape(clamp1(st[0]), rx.expo[0]) * rx.th[0], rx.th[0]) - out[0], rx.th[0]);
      const de = clip(clip(shape(clamp1(st[1]), rx.expo[1]) * rx.th[1], rx.th[1]) + rx.trim + out[1], rx.th[1]) - rx.trim;
      const dr = clip(-clip(shape(clamp1(st[2]), rx.expo[2]) * rx.th[2], rx.th[2]) - out[2], rx.th[2]);
      const inv = (d, th, a) => (th > 0 ? stickFor(d / th, rx.expo[a]) : 0);
      return rx.rudderMix
        ? [0, inv(de, rx.th[1], 1), inv(-dr, rx.th[2], 2)]
        : [inv(da, rx.th[0], 0), inv(de, rx.th[1], 1), inv(-dr, rx.th[2], 2)];
    },
  };
}

/* The sim with mode 3 emulated (receiverStepper at g and kh) wherever a
 * caller asks the plant for it: sim_wing_set_stab(3) flies Manual under
 * the emulated receiver, any other mode the plant's own, and each input
 * held over a step is re-sent a millisecond at a time. For a flight
 * program written against the plant (scripts/lib/harrierkick.js) at a
 * Heading the plant's share cannot reach. */
export function emulatedSim(sim, rx, g, kh) {
  const r = receiverStepper(rx, g, kh);
  let on = false, held = null;
  /* The exports object is frozen: a plain copy with the one replaced. */
  const e = { ...sim.e, memory: sim.e.memory };
  e.sim_wing_set_stab = (mode) => { on = mode === 3; return sim.e.sim_wing_set_stab(on ? 0 : mode); };
  const out = Object.create(sim);
  out.e = e;
  out.reset = () => { r.reset(); held = null; return sim.reset(); };
  out.input = (t, roll, pitch, yaw, thr) => {
    held = { t, roll, pitch, yaw, thr };
    return on ? 0 : sim.input(t, roll, pitch, yaw, thr);
  };
  out.step = (n) => {
    if (!on) return sim.step(n);
    for (let i = 0; i < n; i += 1) {
      const st = r.sticks(sim.readState().state, held.roll, held.pitch, held.yaw);
      const c = sim.input(held.t + i / 1000, ...st, held.thr);
      if (c !== 0) return c;
      const c2 = sim.step(1);
      if (c2 !== 0) return c2;
    }
    return 0;
  };
  return out;
}

/* Level at V on throttle thr from launch; sticks(ms) the pilot's [roll,
 * pitch, yaw], mode 3 at gains g (one factor per axis) and Heading kh
 * emulated, or the plant's own mode 3 when g is null. The body rates
 * every step. */
export function pilotFlight(sim, V, thr, rx, g, sticks, ms, kh = [0, 0, 0]) {
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_wing_set_stab(g ? 0 : 3), 'sim_wing_set_stab');
  must(sim.e.sim_set_pose(0, 0, 300, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(V), 'sim_wing_launch');
  const r = g ? receiverStepper(rx, g, kh) : null;
  const trace = [];
  for (let i = 0; i < ms; i += 1) {
    const [roll, pitch, yaw] = sticks(i);
    let input = [roll, pitch, yaw, thr];
    if (r) input = [...r.sticks(sim.readState().state, roll, pitch, yaw), thr];
    must(sim.input(i / 1000, ...input), 'sim_input');
    must(sim.step(1), 'sim_step');
    trace.push(Array.from(sim.readState().state.slice(11, 14)));
  }
  return trace;
}
