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
 * flies them, on the table and at every rate the tune screen offers,
 * measured on the plant with the receiver's own frame and the servos'
 * slew (as3xloop.js measurePlane). The gains are surface per rad/s at
 * the full travel, the same at every rate: the receiver's rates scale
 * the stick it reads and not its own offset (plant_wing.c as3x_channel).
 * Then the full Heading on
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
  AS3X, GM_MIN_DB, PM_MIN_DEG, rowOf, receiverOf, gainForMargins, margins, measurePlane, revive, fanOut,
  planeSim, diveCondition, closedFlight, rings, pilotFlight, channelOf, stockRate, tuneOf, setupsOf, emulatedSim,
} from './lib/as3xloop.js';
import { PROGRAMS, harrierFlight, kickIae } from './lib/harrierkick.js';

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
function slopes(sim, rx, [lv, lthr], hoverStart) {
  const out = [];
  for (let ax = 0; ax < 3; ax += 1) {
    /* The same flight twice from the same start, the stick moved and
     * left centred: what the airframe does on its own (a launch a touch
     * off trim, a hold still settling) is in both and drops out. Per unit
     * of the channel the receiver reads (plant_wing.c as3x_channel), the
     * stick's move through the table's expo; an axis with no surface of
     * its own reads no channel, and nothing reads its rate, which stays
     * per unit stick. */
    let dc = 0.1;
    const mean = (prep, d) => {
      const r = prep();
      let t = r.t, sum = 0, n = 0;
      const st = r.st.slice();
      st[ax] = Math.max(-1, Math.min(1, st[ax] + d));
      if (d !== 0) {
        const c = channelOf(rx, ax, st[ax]) - channelOf(rx, ax, r.st[ax]);
        dc = c !== 0 ? c : d;
      }
      for (let ms = 0; ms < 400; ms += MS) {
        must(sim.input(t / 1000, ...st), 'sim_input');
        must(sim.step(MS), 'sim_step');
        t += MS;
        if (ms >= 200) { sum += sim.readState().state[11 + ax]; n += 1; }
      }
      return sum / n;
    };
    const at = (prep) => { const m = mean(prep, 0.1); return (m - mean(prep, 0)) / dc; };
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
 * change the way the plane behaves"). Every table then, preset or not:
 * feelDamper below. */
function factoryDamper(srm, ceiling) {
  const scale = Math.min(...srm.map((g, ax) => (g > 0 && ceiling[ax] > 0 ? ceiling[ax] / g : Infinity)));
  return srm.map((g, ax) => (ceiling[ax] > 0 ? scale * g : 0));
}

/* Then the owner's "never actually change the way the plane behaves"
 * (2026-10-12) as the design rule, under the margin's ceiling: the
 * vector (the factory preset's, else the ceiling) at the largest single
 * scale, up to 1, under which every axis' stick, stepped to half and to
 * full at the table's cruise, answers on that axis within the eye's just
 * noticeable difference of Manual's answer: 7 percent of Manual's peak
 * rate (De Bruyn and Orban, Vision Research 28(12) 1988, "about 7%";
 * as3x-feel.js F1, which flies the same on the plant's own mode 3). It
 * is flown at the stock rate and at the table's own, the high: the
 * receiver reads the sticks through the rates (plant_wing.c
 * as3x_channel), so at a low rate priority leaves the gyro more of a
 * stick and the same gains answer it more. Until w38-as3x-travel it was
 * flown on the table alone and only where there was no preset; at the
 * Extra's stock low rate the preset's scale answered a half stick 7.6,
 * 9.0 and 8.1 percent off Manual's. The receiver is lib/as3xloop.js
 * pilotFlight's, which agrees with mode 3 to under 1e-9 rad/s
 * (as3x-feel.js F0 prints it, at every rate), bisected to 1 percent of
 * the scale (lead decision 2026-10-12). */
const F1_STICKS = [0.5, 1];
const WEBER = 0.07;
function stickHolds(sim, V, thr, rx, g) {
  const t0 = 1000, ms = 1800;
  const answer = (gains, ax, s) => {
    const moved = pilotFlight(sim, V, thr, rx, gains, (i) => { const st = [0, 0, 0]; if (i >= t0) st[ax] = s; return st; }, ms);
    const still = pilotFlight(sim, V, thr, rx, gains, () => [0, 0, 0], ms);
    return moved.slice(t0).map((w, i) => w[ax] - still[t0 + i][ax]);
  };
  for (let ax = 0; ax < 3; ax += 1) {
    if (!(rx.k[ax] > 0)) continue;
    for (const s of F1_STICKS) {
      const m = answer([0, 0, 0], ax, s), a = answer(g, ax, s);
      const peak = Math.max(...m.map(Math.abs));
      if (Math.max(...a.map((x, i) => Math.abs(x - m[i]))) > WEBER * peak) return false;
    }
  }
  return true;
}
async function feelDamper(name, body, vector) {
  const V = Object.values(TABLE).find((t) => t.simId === AS3X[name].sim).cruiseMs;
  const thr = Number(body.match(/\.stab_trim_throttle = ([0-9.]+)/)[1]);
  const flown = [];
  for (const rate of new Set([stockRate(name), 'high'])) {
    const block = tuneOf(name, rate);
    flown.push({ sim: await planeSim(AS3X[name].sim, SEAT_GATES, block), rx: { ...receiverOf(body, block), k: vector } });
  }
  const holds = (s) => flown.every((f) => stickHolds(f.sim, V, thr, f.rx, [s, s, s]));
  let scale = 1;
  if (!holds(1)) {
    let lo = 0, hi = 1;
    while (hi - lo > 0.01) {
      const mid = (lo + hi) / 2;
      if (holds(mid)) lo = mid; else hi = mid;
    }
    scale = lo;
  }
  return vector.map((c) => f4(scale * c));
}

/* The full Heading on that damper, by the damper's own rule: the largest
 * kh, the damper k held, that keeps 6 dB and 45 deg on the loop with the
 * Heading at full at every condition the aircraft flies (slow flight,
 * cruise, top speed, the dive, the harrier and the hover where it flies
 * them), and at every kh below it, since a pilot turns the Heading up
 * from zero through each of them: the first failure on a 2 percent sweep
 * from 1e-4 to 64 rad of surface per rad, bisected in its bracket, as
 * gainForMargins finds the damper's. The feel rule (as3x-feel.js F1) is
 * at the receiver's default Heading, zero, and is not moved by it. An
 * axis whose damper already sits on its margin has no Heading to give,
 * and gets none. Until 2026-10-12 it was kh = k pi / (16 T), a corner a
 * quarter of the frame's fastest crossover, a ratio and not a
 * measurement: on w37-flat-fall's plant the Extra's roll Heading alone
 * doubled its harrier rock (E11b 2.03 and 1.81 of Manual's; lead
 * decision 2026-10-12). The AR631's Heading is the pilot's to turn up
 * ("You can increase this value to make the aircraft hold its attitude
 * when control input is neutral"). */
function headingFor(resps, axis, k, T) {
  if (!(k > 0) || !resps.length) return 0;
  const ok = (kh) => resps.every((r) => {
    const m = margins(r, axis, k, kh, T);
    return m.gmDb >= GM_MIN_DB && (m.pmDeg === null || m.pmDeg >= PM_MIN_DEG);
  });
  if (!ok(0)) return 0;
  let lo = 0, hi = null;
  for (let kh = 1e-4; kh <= 64; kh *= 1.02) {
    if (!ok(kh)) { hi = kh; break; }
    lo = kh;
  }
  if (hi === null) return f4(lo);
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) lo = mid; else hi = mid;
  }
  return f4(lo);
}

/* Each axis' responses over every condition of every setup measured. */
const respsOf = (ms) => [0, 1, 2].map((ax) => ms.flatMap((m) => m.conds.map((c) => c.resp[ax])).filter((r) => r));

/* Then, on a 3D aircraft whose gate flies the harrier (as3xloop.js AS3X
 * `kick`), the full Heading is held to E11b's property as the damper is
 * to F1: a kick to the settled harrier, a roll rate on the body, leaves
 * a rock no worse in AS3X than in Manual, both kicks, the pilot's hands
 * holding the harrier as the gate's do (lib/harrierkick.js PROGRAMS; the
 * CAP and the Slick take E11b's kicks on their own gates' harriers).
 * Each axis' Heading is a scale, up to 1, on the margin rule's: first
 * each axis alone, the others off, the largest on a 5 percent sweep down
 * from 1 that holds (none if nothing does); then all three together at
 * those scales, which is how the tune screen's full Heading flies; where
 * that fails, the most axes at their own scales that hold together, the
 * others none (the lower worst ratio between two sets of as many), and
 * where no set holds, all of them at the largest common factor on the
 * same sweep that holds (lead decision 2026-10-13). The Slick's roll and
 * yaw hold alone (0.75 and 1 of the rule's) and not together, at any
 * common factor down to a twentieth; its yaw alone holds. Not "every scale below it
 * too", as the margin rule's is: the receiver's damper alone leaves the
 * Extra's rock at 1.00 and 1.005 of Manual's, so no Heading near zero
 * holds, and on the Extra the yaw Heading worsens it from a twentieth to
 * a fifth of its full (1.03 to 1.08) before it damps it from two fifths
 * on (0.99 and 0.97 at 0.4). The flights are flown on lib/as3xloop.js's receiver
 * (emulatedSim), so a Heading the table does not hold yet can be flown;
 * as3x-feel.js F0 checks it against the plant's mode 3 at full Heading.
 *
 * On the Extra this takes the roll Heading to nothing. On
 * w38-as3x-travel's plant, at the damper F1 sets at the stock low rate,
 * the margin rule's Heading (0.083, 2.9395, 0.0808) left the kicked rock
 * at 2.62 and 3.34 of Manual's; the roll Heading alone at 1.52 and
 * 1.80, at a hundredth of it 1.10 and 1.11; the pitch alone 0.99 and
 * 0.99, the yaw alone 0.81 and 0.85, the two together 0.81 and 0.84.
 * The harrier's rock is a roll the pilot is holding: a roll Heading that
 * sums the bank the pilot's own corrections leave fights those hands,
 * where pitch and yaw Heading hold axes the rock only couples into. The
 * receiver's damper alone leaves it at 1.00 and 1.01. */
const KICK_STEP = 0.05;
function kickHeading(name, sim, body, k, khRule) {
  const prog = PROGRAMS[AS3X[name].kick]();
  const rx = { ...receiverOf(body), k };
  const manual = prog.t11.kickStick.map((st) => {
    const rate = harrierFlight(sim, prog, 0, st).pKick;
    return { rate, m: kickIae(sim, prog, 0, rate) };
  });
  const ratios = (sc) => {
    const em = emulatedSim(sim, rx, [1, 1, 1], khRule.map((x, ax) => sc[ax] * x));
    return manual.map(({ rate, m }) => kickIae(em, prog, 3, rate) / m);
  };
  const holds = (sc) => ratios(sc).every((r) => r < 1);
  const sweep = (at) => {
    for (let i = Math.round(1 / KICK_STEP); i >= 1; i -= 1) {
      if (holds(at(i * KICK_STEP))) return i * KICK_STEP;
    }
    return 0;
  };
  const alone = [0, 1, 2].map((ax) => (khRule[ax] > 0 ? sweep((x) => [0, 1, 2].map((a) => (a === ax ? x : 0))) : 0));
  const on = [0, 1, 2].filter((ax) => alone[ax] > 0);
  const sets = [];
  for (let mask = (1 << on.length) - 1; mask > 0; mask -= 1) {
    sets.push(on.filter((_, i) => mask & (1 << i)));
  }
  sets.sort((x, y) => y.length - x.length);
  let scale = null, common = 1;
  for (let i = 0; i < sets.length && !scale; i += 1) {
    const size = sets[i].length;
    const held = sets.filter((set) => set.length === size)
      .map((set) => { const sc = alone.map((v, ax) => (set.includes(ax) ? v : 0)); return { sc, worst: Math.max(...ratios(sc)) }; })
      .filter((x) => x.worst < 1);
    if (held.length) scale = held.sort((x, y) => x.worst - y.worst)[0].sc;
    while (i + 1 < sets.length && sets[i + 1].length === size) i += 1;
  }
  if (!scale) {
    common = sweep((x) => alone.map((v) => x * v));
    scale = alone.map((v) => common * v);
  }
  return { scale, kh: khRule.map((x, ax) => f4(scale[ax] * x)), ratios: ratios(scale), alone, common };
}

/* One table, in its own process: the airframe measured over its
 * envelope on the table and at every rate the tune screen offers
 * (as3xloop.js setupsOf: the throws and the expo move the dive's and the
 * hover's hold, and so where they fly), and the heading's rates on the
 * gates' seat. */
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
  const rate = slopes(sim, receiverOf(body), levelOf(a, body), hoverStart).map(r3);
  const measures = [];
  for (const { block } of setupsOf(name)) measures.push(await measurePlane(name, src, block));
  const ms = measures.map((x) => revive(JSON.parse(JSON.stringify(x))));
  const resps = respsOf(ms);
  const ceiling = resps.map((r, ax) => (r.length ? gainForMargins(r, ax, 1, 0, ms[0].T) : 0));
  const k = await feelDamper(name, body, a.srm ? factoryDamper(a.srm, ceiling) : ceiling);
  const khRule = k.map((x, ax) => headingFor(resps[ax], ax, x, ms[0].T));
  const kicked = a.kick ? kickHeading(name, sim, body, k, khRule) : null;
  const kh = kicked ? kicked.kh : khRule;
  /* A pipe takes the write asynchronously: exit only once it is out,
   * or a large measure arrives cut short. */
  await new Promise((resolve) => { process.stdout.write(JSON.stringify({ measures, rate, k, kh, khRule, kicked }), resolve); });
  process.exit(0);
}

const fleet = await fanOut(self, Object.keys(AS3X));
let bad = 0;
for (const name of Object.keys(AS3X)) {
  const { measures, rate, k, kh, khRule, kicked } = fleet[name];
  const m = revive(measures[0]);
  const body = rowOf(src, name);
  if (kicked) {
    console.log(`${name.padEnd(18)} the harrier kick: the margin rule's Heading ${khRule.join(', ')} at ${kicked.scale.map((x) => x.toFixed(2)).join(', ')} (alone ${kicked.alone.map((x) => x.toFixed(2)).join(', ')}, together at ${kicked.common.toFixed(2)}), its rock ${kicked.ratios.map((r) => r.toFixed(2)).join(' and ')} of Manual's`);
  }
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
