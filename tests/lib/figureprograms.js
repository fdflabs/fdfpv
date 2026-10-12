/*
 * figureprograms.js: the figures as programs of phases a pilot calls out
 * to themselves ("pull to the vertical, hold the line, kick the
 * rudder..."), flown by the person paced pilot (personpilot.js) on the
 * Extra 330 in Manual from level at 22 m/s, 150 m up. The sweep
 * (scripts/figures-plant-sweep.js) flies the unproven ones and the
 * manoeuvre table (scripts/figures-table.js) every one with a program.
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

import { loadSim } from './simmod.js';
import { must, EXTRA_AIRFRAME, hangSticks } from './wingpilot.js';
import { clamp, quant, eyes } from './personpilot.js';
import { FigureDetector } from '../../src/game/figuredetect.js';

const MS = 2;
/* The hand moves every 50 ms, twice PERSON's ten a second: the figures'
 * gains and let go leads below were measured at this pace. */
export const EVERY = 50;
const H = EVERY / 1000;
const PI = Math.PI;

function see(s) {
  const [w, x, y, z] = [s[7], s[8], s[9], s[10]];
  return {
    s, nz: 2 * (x * z - w * y), lz: 2 * (y * z + w * x), uz: 1 - 2 * (x * x + y * y),
    p: s[11], q: s[12], r: s[13], v: Math.hypot(s[4], s[5], s[6]), vz: s[6], z: s[3],
    along: (s[4] * (1 - 2 * (y * y + z * z)) + s[5] * 2 * (x * y + w * z) + s[6] * 2 * (x * z - w * y)),
  };
}

/* ---- The pilot's phases. Each gets the seen state and its own memory,
 * and returns [roll, pitch, yaw, throttle] and whether it is done. ---- */

/* Wings level and the nose on the horizon, upright or inverted. */
const levelSticks = (d, thr = 0.75) => [
  quant(clamp(-0.4 * d.lz * Math.sign(d.uz || 1) - 0.04 * d.p, 0.4)),
  quant(clamp(Math.sign(d.uz || 1) * (-1.2 * d.nz) + 0.12 * d.q + (d.uz > 0 ? 0.04 : -0.08), 0.4)),
  0, thr,
];
const level = (ms, thr) => ({ name: `level ${ms}`, step: (d, m) => [levelSticks(d, thr), m.t >= ms] });
/* Elevator held until the nose has turned `rad` (seen), let go early. */
const pull = (stick, rad, thr = 1) => ({
  name: `pull ${stick} ${(rad / PI).toFixed(2)}pi`,
  step: (d, m) => {
    m.turned = (m.turned ?? 0) + Math.abs(d.q) * H;
    return [[0, stick, 0, thr], m.turned > rad - Math.abs(d.q) * 0.25];
  },
});
/* Ailerons held until the wings have turned `rad`. */
const roll = (stick, rad, thr = 0.75, pitch = 0, push = true) => ({
  name: `roll ${stick} ${(rad / PI).toFixed(2)}pi`,
  step: (d, m) => {
    m.turned = (m.turned ?? 0) + Math.abs(d.p) * H;
    return [[stick, pitch + (push && d.uz < -0.3 ? -0.12 : 0), Math.abs(d.lz) > 0.5 ? quant(-0.6 * d.lz) : 0, thr], m.turned > rad - Math.abs(d.p) * 0.35];
  },
});
/* A slow roll: "The rate of roll must be constant" (British Aerobatic
 * Association, judging, "Slow Rolls",
 * https://www.aerobatics.org.uk/judging/topics/slow-rolls). A fixed 0.15
 * of stick rolled the Extra at 2 rad/s wings level and under the judge's
 * 1.2 through the knife edges, where the top rudder's yaw rolls against
 * it, so the roll came apart in two. The person holds the rate they see
 * on the aileron instead: kp of stick per rad/s of the rate's error and
 * the hand settling on what holds it (ki per second). The rate is the
 * person's, 1.7 rad/s, a turn in 3.7 s, over the judge's 3 s and its 1.2
 * with room. Gains measured 2026-10-12 over kp 0 to 0.06 and ki 0.05 to
 * 0.4 on the Extra, CAP and Slick: kp 0.03, ki 0.2 named the slow roll
 * on all three (8, 8, 8.5); ki 0.05 lost it on the Slick. */
const rateRoll = (rate, rad, thr = 0.9) => ({
  name: `rate roll ${rate} ${(rad / PI).toFixed(2)}pi`,
  step: (d, m) => {
    m.turned = (m.turned ?? 0) + d.p * H;
    const err = rate - d.p;
    m.i = clamp((m.i ?? 0.15) + 0.2 * err * H);
    const ail = quant(clamp(m.i + 0.03 * err));
    return [[ail, d.uz < -0.3 ? -0.12 : 0, Math.abs(d.lz) > 0.5 ? quant(-0.6 * d.lz) : 0, thr], m.turned > rad - Math.abs(d.p) * 0.35];
  },
});
/* The gains a line is held with: the nose's error to a rate (kp, 1/s) and
 * the rate's error to the stick (kr, s), figures-plant-check.js's. With
 * this pilot's 0.2 s lag a rate gain of 0.5 rang on every plant (the
 * Extra's vertical weaved 0.24 rms in its up component, 2026-10-11), and
 * on the prop curves (562dc785e, the elevator in a stronger slipstream)
 * 0.3 rings too: the hammerhead's up line went stop to stop on the
 * elevator, the wings flipping through 170 deg. kr 0.2 was the calmest
 * at every kp from 1 to 4 there (0.11 rms at kp 4), measured 2026-10-12. */
export const LINE_GAINS = { kp: 4, kr: 0.2 };
/* A person holding a line also settles their hand on what holds it: the
 * proportional hold alone left the Extra's nose 8 deg past the vertical
 * as it slowed on the prop curves. ki per second on the stick the hold
 * asks for, figures-plant-check.js's; each line starts its own. */
const LINE_KI = 1;
/* The elevator's share of the line hold kept at a measured gain margin
 * (scripts/figures-margins.js): the pitch rate a unit of elevator buys
 * grows with the slipstream and the airspeed, K = a + b throttle + c V^2
 * rad/s per stick on the Extra (fitted to its measured steps,
 * 2026-10-12), and the rate gain is LINE_GM / K. LINE_GM is the largest
 * that keeps the 6 dB of the bandwidth criterion on the elevator's
 * measured frequency response, level at a third, two thirds and full
 * throttle (6.1, 7.3 and 8.1 dB): the step reads the gain a quarter low
 * at the loop's 180 deg frequency, 11 to 12.5 rad/s. LINE_GAINS' fixed
 * 0.2 kept 3.3 and 1.3 dB at a third and two thirds, and at full
 * throttle none (-1.8 dB): the humpty's up line went stop to stop on the
 * elevator and snapped the wing. The rudder keeps LINE_GAINS: its
 * step response turns over with the airspeed (the fin weathervanes the
 * yaw back within the 0.25 s), so it has no gain to schedule on. */
export const LINE_PITCH_K = { a: 1.637, b: 1.563, c: 0.00281 };
export const LINE_GM = 0.36;
export const lineKr = (thr, v) => LINE_GM / (LINE_PITCH_K.a + LINE_PITCH_K.b * thr + LINE_PITCH_K.c * v * v);
const holdLine = (d, m, target, thr) => {
  const [r, , y] = hangSticks(d.s, { target, rollStick: 0, ...LINE_GAINS });
  const p = hangSticks(d.s, { target, rollStick: 0, kp: LINE_GAINS.kp, kr: lineKr(thr, d.v) })[1];
  m.trimP = clamp((m.trimP ?? 0) + LINE_KI * p * H, 0.5);
  m.trimY = clamp((m.trimY ?? 0) + LINE_KI * y * H, 0.5);
  return [quant(r), quant(clamp(p + m.trimP)), quant(clamp(y + m.trimY)), thr];
};
/* The nose held on a world direction (a vertical or a 45 line). */
const line = (target, ms, thr = 1, until = null) => ({
  name: `line ${target.map((x) => x.toFixed(2))}`,
  step: (d, m) => [holdLine(d, m, target, thr), m.t >= ms || (until && until(d))],
});
const UP = [0, 0, 1];
const DOWN = [0, 0, -1];
/* Point rolls: n stops in a full roll, each held a beat. The person
 * counts the roll they see all the way, the run on past each let go
 * included (figures-plant-check.js's points): counting only while the
 * stick was in lost what each hold carried, and once the prop curves
 * (562dc785e) rolled the Extra at 5.1 rad/s at half stick, the 2-point
 * roll's 0.6 s lead let go at 36 deg and stopped at 105, still rolling
 * at 0.4 rad/s, not on its back: the judge saw no point and named an
 * aileron roll. POINT_LEAD is taken from roll() above (and
 * figures-plant-check.js's aileron roll), one person's one anticipation,
 * not measured for points. The roll measured carrying 68 deg after a
 * 5.1 rad/s let go, 0.23 s (the person's 0.2 s unseen, half a 50 ms beat,
 * the Extra's own 0.03 s run on, 2026-10-12), but a 0.25 s lead lands the
 * Extra's first 4-point stop at 102 deg, where the top rudder keeps 0.4
 * to 0.5 rad/s of roll on, over the judge's stop, and the figure is lost:
 * the hold has no aileron, a gap of the hold, not of the lead. */
const POINT_LEAD = 0.35;
const points = (n, stick = 0.5) => ({
  name: `${n} points`,
  step: (d, m) => {
    m.q = m.q ?? 0;
    m.hold = m.hold ?? 0;
    m.turned = (m.turned ?? 0) + Math.sign(stick) * d.p * H;
    if (m.hold > 0) {
      m.hold -= EVERY;
      return [[0, d.uz < -0.5 ? -0.15 : d.uz > 0.5 ? 0.05 : 0, Math.abs(d.lz) > 0.5 ? quant(-0.6 * d.lz) : 0, 0.75], false];
    }
    if (m.turned > (m.q + 1) * 2 * PI / n - Math.abs(d.p) * POINT_LEAD) {
      m.q += 1;
      m.hold = 400;
    }
    return [[stick, 0.05, 0, 0.75], m.q >= n];
  },
});
/* Hang on the prop: the nose up, the height on the throttle. */
const hang = (ms, { rollStick = 0 } = {}) => ({
  name: `hang ${ms}`,
  step: (d, m) => {
    m.thr = clamp((m.thr ?? 0.6) - H * (0.4 * d.vz), 1) ;
    const [r, pi, y] = hangSticks(d.s, { target: UP, rollStick, kp: 4, kr: 0.5 });
    return [[quant(r), quant(pi), quant(y), Math.max(0, quant(m.thr))], m.t >= ms];
  },
});
/* A harrier, flown as extra-gates.js's E11 flies it, by what a person
 * sees: the nose raised over 5 s to 40 deg above the horizon (on a level
 * path, the wing's 40 deg of alpha, E11's) and held there on the
 * elevator, the throttle holding the height, the wings on the ailerons
 * and the heading on the rudder, each with an integral as a hand settles
 * on a trim; E11's gains. A fixed 0.75 of elevator at 12 m/s, the
 * program's before, looped the Extra in the prop's slipstream. Inverted,
 * the same with the elevator and the heading's sense turned over. The
 * throttle starts at E11's derived harrier throttle, 0.516
 * (tests/extra-thresholds.json). Not yet named (2026-10-12): through the
 * person's 0.2 s the height loop closes the throttle in the climb the
 * nose's rise makes, the wash goes, the wing stalls and mushes; E11
 * holds the same law at 4 ms with no delay. The 3D lane's to fly. */
const HARRIER_RAD = 40 * PI / 180;
const HARRIER_RAMP_MS = 5000;
const harrier = (ms, { inverted = false, rollStick = null } = {}) => ({
  name: `harrier ${ms}`,
  step: (d, m) => {
    const sign = inverted ? -1 : 1;
    const [w, x, y, z] = [d.s[7], d.s[8], d.s[9], d.s[10]];
    const psi = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
    m.psi0 = m.psi0 ?? psi;
    let dpsi = psi - m.psi0;
    if (dpsi > PI) dpsi -= 2 * PI;
    if (dpsi < -PI) dpsi += 2 * PI;
    const pitchErr = Math.min(HARRIER_RAD, HARRIER_RAD * m.t / HARRIER_RAMP_MS) - Math.asin(clamp(d.nz));
    m.iP = clamp((m.iP ?? 0) + 1.5 * pitchErr * H);
    const bank = Math.atan2(sign * d.lz, sign * d.uz);
    m.iB = clamp((m.iB ?? 0) - bank * H, 0.5);
    m.iT = clamp((m.iT ?? 0.516) - 0.2 * d.vz * H, 1);
    const ail = rollStick ?? quant(clamp(-0.6 * bank - 0.06 * d.p + m.iB));
    const ele = quant(clamp(sign * (1.5 * pitchErr + m.iP) + 0.15 * d.q));
    const rud = quant(clamp(sign * dpsi + 0.2 * d.r));
    return [[ail, ele, rud, Math.max(0, quant(m.iT - 0.08 * d.vz))], m.t >= HARRIER_RAMP_MS + ms];
  },
});
/* Slowing down level to a speed, throttle closed, the height held on the
 * elevator as the speed bleeds (harrier-probe.js's entry, E11's): the
 * nose on the horizon alone glides the Extra at 10.7 m/s upright and
 * 13.1 inverted at idle, so a harrier's slow to 10 never ended and the
 * flight sank 180 m into the ground. The height's sink rate to the stick
 * on top of the level hold, and the hand settling on it. */
const slow = (to) => ({
  name: `slow to ${to}`,
  step: (d, m) => {
    const [r, pi, y] = levelSticks(d, 0);
    m.iV = clamp((m.iV ?? 0) - 0.05 * d.vz * H, 0.4);
    return [[r, quant(clamp(pi + Math.sign(d.uz || 1) * (m.iV - 0.04 * d.vz))), y, 0], d.v < to];
  },
});
/* Full rudder until the nose points down (a stall turn's pivot). */
const kick = () => ({ name: 'kick', step: (d) => [[0, 0, -1, 0.5], d.nz < -0.6] });
/* How long the person leaves the sticks once it slides back before they
 * fly the nose down themselves: the Extra can settle falling flat at 10
 * m/s with the sticks left alone, its nose on the horizon (with the
 * elevator's line gain at a 6 dB margin, scripts/figures-margins.js, it
 * fell 180 m that way into the ground), and a person would not wait. */
const SLIDE_LET_GO_MS = 1500;
/* Throttle off, the nose held up the vertical on the elevator and rudder
 * until the aircraft slides back, then the sticks let go until it falls
 * through (a tailslide). A pilot who lets go at the stop leaves the yaw
 * rate the climb's rudder was holding against the slipstream, and the
 * nose pivots over before it slides. */
const slide = () => ({
  name: 'slide',
  step: (d, m) => {
    if (m.backAt === undefined && d.along < -1) m.backAt = m.t;
    const back = m.backAt !== undefined;
    return [back ? [0, 0, 0, 0] : holdLine(d, m, UP, 0), m.t > 600 && (d.nz < -0.3 || (back && m.t - m.backAt > SLIDE_LET_GO_MS))];
  },
});
/* Sticks held as given for a time. */
const hold = (st, ms) => ({ name: `hold ${st}`, step: (d, m) => [st, m.t >= ms] });

const L = (ms = 3000) => level(ms);
const D45 = [Math.SQRT1_2, 0, -Math.SQRT1_2];
const U45 = [Math.SQRT1_2, 0, Math.SQRT1_2];
const B45 = [-Math.SQRT1_2, 0, -Math.SQRT1_2];

/* The programs. The aircraft starts level at 22 m/s heading +x, 150 m up,
 * over no ground: the plant raises none unless the host does, so fly()
 * ends a flight that reaches the height it started from less 150 m and
 * calls it crashed. A program that loses that much has flown into the
 * field it would be flown over. */
export const PROGRAMS = {
  half_roll: [L(), roll(0.5, PI), level(3000)],
  double_roll: [L(), roll(0.6, 4 * PI), L()],
  slow_roll: [L(), rateRoll(1.7, 2 * PI), L()],
  two_point_roll: [L(), points(2), L()],
  /* An eighth at 0.6 of stick (6.4 rad/s) passed in 0.12 s, inside the
   * 0.2 s the person has not seen: its points fell anywhere (117 to 408
   * deg). At 0.25 an eighth takes 0.3 s and the points sit 3 to 21 deg
   * short of their marks. */
  eight_point_roll: [L(), points(8, 0.25), L()],
  barrel_roll: [L(), roll(0.35, 2 * PI, 1, 0.3, false), L()],
  outside_loop: [L(), pull(-0.55, 2 * PI), L()],
  immelmann: [L(), pull(0.55, PI), roll(0.5, PI), L()],
  split_s: [L(), roll(0.5, PI), pull(0.55, PI, 0.5), L()],
  half_cuban: [L(), pull(0.55, 1.25 * PI), line(B45, 800, 0.6), roll(0.5, PI, 0.6), line(B45, 800, 0.6), pull(0.55, 0.25 * PI), L()],
  cuban_8: [L(), pull(0.55, 1.25 * PI), line(B45, 800, 0.6), roll(0.5, PI, 0.6), line(B45, 800, 0.6),
    pull(0.55, 1.5 * PI), line(D45, 800, 0.6), roll(0.5, PI, 0.6), line(D45, 800, 0.6), pull(0.55, 0.25 * PI), L()],
  reverse_half_cuban: [L(), pull(0.55, 0.25 * PI), line(U45, 800), roll(0.5, PI), line([-Math.SQRT1_2, 0, Math.SQRT1_2], 600), pull(0.55, 1.25 * PI, 0.6), L()],
  reverse_cuban_8: [L(), pull(0.55, 0.25 * PI), line(U45, 800), roll(0.5, PI), line([-Math.SQRT1_2, 0, Math.SQRT1_2], 600), pull(0.55, 1.5 * PI, 0.6),
    line([-Math.SQRT1_2, 0, Math.SQRT1_2], 800), roll(0.5, PI), line(U45, 600), pull(0.55, 1.25 * PI, 0.6), L()],
  humpty_bump: [L(), pull(0.55, 0.5 * PI), line(UP, 1500), pull(1, PI, 0.4), line(DOWN, 1500, 0.3), pull(0.55, 0.5 * PI, 0.6), L()],
  hammerhead: [L(), pull(0.55, 0.5 * PI), line(UP, 4000, 0.6, (d) => d.v < 7), kick(), line(DOWN, 1500, 0.3), pull(0.55, 0.5 * PI, 0.6), L()],
  tailslide: [L(), pull(0.55, 0.5 * PI), line(UP, 4000, 0.4, (d) => d.v < 4), slide(), line(DOWN, 1500, 0.3), pull(0.55, 0.5 * PI, 0.6), L()],
  knife_edge_pass: [L(), roll(0.5, 0.5 * PI, 1), hold([0, 0, -0.6, 1], 3000), roll(-0.5, 0.5 * PI), L()],
  ke_loop: [L(), roll(0.5, 0.5 * PI, 1), hold([0, 0, -1, 1], 7000), L()],
  rolling_circle: [L(), { name: 'rolling circle', step: (d, m) => [[0.3, quant(0.35 * d.uz), quant(-0.5 * d.lz), 1], m.t > 9000] }, L()],
  hover: [slow(14), pull(0.6, 0.5 * PI, 0.8), hang(5000), line(DOWN, 800, 0.3), pull(0.55, 0.5 * PI, 0.6), L()],
  torque_roll: [slow(14), pull(0.6, 0.5 * PI, 0.8), hang(5000, { rollStick: 0.15 }), line(DOWN, 800, 0.3), pull(0.55, 0.5 * PI, 0.6), L()],
  harrier: [slow(12), harrier(5000), L()],
  inverted_harrier: [L(), roll(0.5, PI), slow(12), harrier(5000, { inverted: true }), roll(0.5, PI), L()],
  rolling_harrier: [slow(12), harrier(1500), harrier(4000, { rollStick: 0.35 }), L()],
  waterfall: [L(), pull(0.55, 0.5 * PI), line(UP, 4000, 0.6, (d) => d.v < 8), hold([0, -1, 0, 1], 1500), L()],
  wall: [slow(13), pull(1, 0.5 * PI, 1), hang(2500), line(DOWN, 800, 0.3), pull(0.55, 0.5 * PI, 0.6), L()],
};

/* airframe: the plant's id, the Extra's by default; the CAP and the Slick
 * fly the same programs at the same launch to check a promotion. */
export async function fly(program, { wasmBytes, configText, trace = false, airframe = EXTRA_AIRFRAME }) {
  const sim = await loadSim(wasmBytes);
  must(sim.init(configText), 'sim_init');
  must(sim.e.sim_set_airframe(airframe), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
  must(sim.e.sim_set_pose(0, 0, 150, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(22), 'sim_wing_launch');
  const got = [];
  const det = new FigureDetector((f) => got.push(f));
  const eye = eyes({ stepMs: MS, everyMs: EVERY });
  let i = 0;
  let mem = { t: 0 };
  let st = [0, 0, 0, 0.75];
  let ms = 0;
  let minZ = Infinity;
  let crashed = false;
  for (; ms < 90000 && i < program.length; ms += MS) {
    const o = see(sim.readState().state);
    eye.push(o);
    if (o.z < minZ) minZ = o.z;
    if (o.z <= 0) {
      crashed = true;
      break;
    }
    det.step(MS / 1000, o.s);
    mem.t += MS;
    if (eye.looks(ms)) {
      const d = eye.ago();
      const [sticks, done] = program[i].step(d, mem);
      st = sticks;
      if (trace) console.log(`  ${ms} ${program[i].name} along ${o.along.toFixed(1)} q ${o.q.toFixed(2)} r ${o.r.toFixed(2)} v ${o.v.toFixed(1)} z ${o.z.toFixed(0)} nz ${o.nz.toFixed(2)} uz ${o.uz.toFixed(2)} [${st.join(',')}]`);
      if (done) {
        i += 1;
        mem = { t: 0 };
      }
    }
    must(sim.input(ms / 1000, ...st), 'sim_input');
    must(sim.step(MS), 'sim_step');
  }
  det.flush();
  return { got, finished: i >= program.length, crashed, ms, minZ };
}
