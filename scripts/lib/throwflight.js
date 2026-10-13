/*
 * throwflight.js: a fixed wing thrown level and flown hands off in
 * Stabilised (mode 1), the throw every stab selftest's "straight" check
 * flies, as a derivation. It is the CAP's throw (scripts/cap580-derive.js,
 * w36-cap-straight) for any table: the body's six rates and speeds at the
 * plant's 1 ms step, on the table's own coefficients read from
 * src/native/plant_wing.c and its airframe's mass and inertia from
 * src/native/plant.c, in small angle aerodynamics. Nothing here loads the
 * plant; every term is written out as plant_wing.c has it at a cruise:
 *
 * - the wing's linear lift on the top of its curve, the tail's own lift on
 *   its own angle where the table has hi_alpha and the wing's own slope,
 *   the drag on the linear lift with cd0's Reynolds number scaling and the
 *   deflected surfaces' drag; the pitching moment the same way; the six
 *   lateral derivatives and the CL rules' cross terms in the stability
 *   axes, the fuselage's share of cn_beta on Munk's u v in the body; the
 *   fuselage's crossflow drag (side_cda) at its centre of pressure (side_x);
 * - the motor: an electric's duty on the seated pack (scripts/lib/
 *   propcurve.js wingSeat, the gates' 4.1 V), an engine's from its idle,
 *   spooled from the duty's speed at the throw on Drela's law (or a glow
 *   engine's square law), its thrust and torque on APC's curves, the
 *   rotor's acceleration on the mount, right thrust (thrust_yaw), the
 *   thrust line's moment, the P factor, Selig's jet normal force and the
 *   prop as a gyroscope;
 * - the slipstream's terms over the tail and the ailerons, scripts/lib/
 *   wash.js wash() and finSwirl(): the static jet's spread (slip_loss),
 *   the swirl at the fin and its force on the whole stream, the root's
 *   share (SWIRL_KEEP, or root_swirl where the table measures its root),
 *   the wash controls' keeps (washcontrol);
 * - the receiver, plant_wing.c "THE STABILISER": the bank loop with
 *   ArduPilot's integrator, the pitch loop on stab_trim_pitch less the
 *   pitch down under the trim throttle, the turn coordinator; the mixes
 *   (ailerons, a rudder only aircraft's roll stick on the rudder,
 *   elevons), the expo, the servos' rate and the surfaces' knee.
 *
 * Left out, and so the limits of what it derives: the stall (it says when
 * a step's alpha reaches the curve's top), ground effect (a throw must
 * clear GE_HB_MAX of its span), the pack's drain over the flight, crash
 * damage, flaps, a mapped engine, and a biplane's cell taken as its
 * equivalent monoplane, which in the linear range is exactly the table's
 * cl_alpha and k_induced (plant_wing.c biplane_lift).
 *
 * throwFlight(table, { duty, speed, z, pitchDeg, seconds, at, mount, mode })
 * throws it along its nose, pitchDeg up (a catapult's rail), flies it in
 * Stabilised or, with mode 'acro', in Acro (acro_sticks, the attitude held
 * where it was thrown), and returns the
 * state at each time in at: the cross track y (the plant's, left
 * positive), bank and heading in degrees, the airspeed, the climb rate
 * and the height, and the largest stall blend met.
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

import { readFileSync } from 'node:fs';
import { finSwirl, planeTable, wash } from './wash.js';
import { SEAT_GATES, wingSeat } from './propcurve.js';

const PLANT_C = new URL('../../src/native/plant.c', import.meta.url);
const WING_C = new URL('../../src/native/plant_wing.c', import.meta.url);
const DT = 0.001;
const AIR_MU = 1.789e-5;
const STALL_RE_LO = 3.0e4, STALL_RE_HI = 5.0e4;
const SURF_DRAG_A = 0.2476, SURF_DRAG_B = 0.3992;
const K_M = 0.85 / 0.15;
const STAB_ROLL_I = 0.05, STAB_ROLL_TCONST = 0.5, STAB_ROLL_IMAX = 1 / 3;
/* plant_wing.c's wash control keeps against the body's angle in the wash
 * (scripts/lib/washcontrol.js, NACA TN 3307 and Ma 2022). */
const KW_DEG = [10, 20, 30, 40, 50, 60, 70, 80, 90];
const KW_WITH = [1.0, 1.0, 0.735, 0.47, 0.30, 0.13, 0.10, 0.07, 0.05];
const KW_AGAINST = [1.0, 0.95, 0.93, 0.89, 0.74, 0.55, 0.37, 0.25, 0.16];
/* Gauss-Legendre's four points, root_swirl's. */
const GX = [-0.86113631159405258, -0.33998104358485626, 0.33998104358485626, 0.86113631159405258];
const GW = [0.34785484513745386, 0.65214515486254614, 0.65214515486254614, 0.34785484513745386];

const clamp1 = (x) => Math.max(-1, Math.min(1, x));
const clip = (x, m) => Math.max(-m, Math.min(m, x));
const smoothstep = (a, b, x) => { if (x <= a) return 0; if (x >= b) return 1; const t = (x - a) / (b - a); return t * t * (3 - 2 * t); };
const plateRatio = (x, cn) => { const n = x / cn; return 1 / Math.sqrt(Math.sqrt(1 + n * n * n * n)); };
const surfaceFromStick = (x, thr, expo) => { const c = clamp1(x); return clip((c * c * c * expo + c * (1 - expo)) * thr, thr); };
const deadband1 = (x, band) => { const c = clamp1(x); if (c > band) return (c - band) / (1 - band); if (c < -band) return (c + band) / (1 - band); return 0; };
const surfDrag = (d) => SURF_DRAG_A * Math.abs(d) + SURF_DRAG_B * d * d;
const washKeep = (k, a) => {
  if (!(a > 0)) return 1;
  if (a <= KW_DEG[0]) return k[0];
  for (let i = 0; i < 8; i += 1) if (a <= KW_DEG[i + 1]) return k[i] + (k[i + 1] - k[i]) * (a - KW_DEG[i]) / (KW_DEG[i + 1] - KW_DEG[i]);
  return k[8];
};
/* plant_wing.c prop_curve: straight between the tenths and on along the last two. */
const curveAt = (c, mu) => { const x = Math.max(0, mu) * 10, i = Math.min(c.length - 2, Math.floor(x)); return c[i] + (x - i) * (c[i + 1] - c[i]); };

/* The airframe flying a table: its mass, inertia, gravity and air. */
function airframe(table) {
  const src = readFileSync(PLANT_C, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const e = new RegExp(`\\[SIM_AIRFRAME_\\w+\\] = \\{((?:(?!\\n\\},)[\\s\\S])*?\\.fw = &${table},[\\s\\S]*?)\\n\\},`).exec(src);
  if (!e) throw new Error(`throwflight: no airframe flies ${table} in plant.c`);
  const num = (k) => Number(new RegExp(`\\.${k} = ([-\\d.e]+)`).exec(e[1])[1]);
  const inertia = /\.inertia = \{ ([^}]*) \}/.exec(e[1])[1].split(',').map(Number);
  return { m: num('mass_kg'), g: num('gravity'), rho: num('rho'), inertia };
}

/* The table's mix, which planeTable() leaves out as a name. */
function mixOf(table) {
  const src = readFileSync(WING_C, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const body = new RegExp(`const FixedWingParams ${table} = \\{([\\s\\S]*?)\\n\\};`).exec(src)[1];
  const m = /\.mix = (FW_MIX_\w+)/.exec(body);
  return m ? m[1] : 'FW_MIX_TAIL';
}

/* Quaternion helpers, w x y z, body to world. */
const qmul = (a, b) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];
const rotate = (q, v) => { const r = qmul(qmul(q, [0, v[0], v[1], v[2]]), [q[0], -q[1], -q[2], -q[3]]); return [r[1], r[2], r[3]]; };
const rotateInv = (q, v) => rotate([q[0], -q[1], -q[2], -q[3]], v);

export function throwFlight(table, { duty, speed, z = 3, pitchDeg = 0, seconds = 10, at = [0.5, 1, 2, 3, 5, 10], mount = true, mode = 'stabilised' } = {}) {
  const t = planeTable(table);
  const fw = t.fw;
  const mix = mixOf(table);
  const { m, g, rho, inertia } = airframe(table);
  const [Ix, Iy, Iz] = inertia;
  if (fw.engine_q && fw.engine_q.length) throw new Error(`throwflight: ${table}'s engine is mapped; not modelled`);
  const electric = fw.current_full > 0;
  const seat = electric ? wingSeat(table) : null;
  const fan = fw.fan_tau > 0;
  const spools = fw.j_prop > 0 && fw.thrust_static > 0 && !fan;
  const wF = 0.85 * fw.rpm_no_load * 2 * Math.PI / 60;
  const qF = fw.torque_arm * fw.thrust_static;
  const cla = fw.cl_alpha_wing > 0 ? fw.cl_alpha_wing : fw.cl_alpha;
  const ar = fw.span * fw.span / fw.area;
  const plateCn = 1.11 + 0.018 * Math.min(ar, 50);
  const tailOwn = fw.hi_alpha && fw.cl_alpha_wing > 0;
  const expo = (i) => (fw.tune ? fw.tune_expo[i] : fw.expo);
  const stickDuty = (stick, u) => {
    if (electric) return seat.at(SEAT_GATES, stick, u).d;
    if (fw.throttle_idle > 0) return fw.throttle_idle + (1 - fw.throttle_idle) * stick;
    return stick;
  };

  /* The state, the plant's: world position and velocity, the body to
   * world quaternion, the body rates (x forward, y left, z up). */
  let pos = [0, 0, z];
  let quat = [Math.cos(pitchDeg * Math.PI / 360), 0, -Math.sin(pitchDeg * Math.PI / 360), 0];
  let vel = rotate(quat, [speed, 0, 0]);
  let om = [0, 0, 0];
  let n = null, dn = 0, rollI = 0;
  /* A fan's speed and rate and its ESC's start ramp, plant_wing.c
   * fan_spool: a launch leaves an electric fan at rest, the stick's
   * opening a start. */
  let fanN = fan && fw.throttle_idle > 0 ? fw.throttle_idle : 0, fanV = 0, ramp = 0;
  let acroQ = null, acroIRoll = 0, acroIPitch = 0;
  const servo = [0, 0, 0];
  let sigmaMax = 0;
  const out = [];
  let next = 0;
  /* plant_wing.c acro_sticks with both sticks centred: the target
   * attitude taken at the first step (a launch clears it), turned with the
   * aircraft's own heading as far as the nose is level, and the stick that
   * flies onto it. */
  const acroSticks = () => {
    if (!acroQ) { acroQ = quat.slice(); acroIRoll = 0; acroIPitch = 0; }
    const wv = rotate(quat, om);
    const fwv = rotate(quat, [1, 0, 0]);
    const level = fwv[0] * fwv[0] + fwv[1] * fwv[1];
    const h = 0.5 * DT;
    const tz = qmul([1, 0, 0, level * wv[2] * h], acroQ);
    const tq = qmul(tz, [1, 0, 0, 0]);
    let qe = qmul([quat[0], -quat[1], -quat[2], -quat[3]], tq);
    if (qe[0] < 0) qe = qe.map((x) => -x);
    const vn = Math.hypot(qe[1], qe[2], qe[3]);
    const k = vn > 1e-12 ? 2 * Math.atan2(vn, qe[0]) / vn : 2;
    let ex = qe[1] * k, ey = qe[2] * k;
    const en = Math.hypot(ex, ey);
    if (en > fw.acro_err_max) { ex *= fw.acro_err_max / en; ey *= fw.acro_err_max / en; }
    const ea = Math.hypot(ex, ey);
    if (ea > 1e-12) {
      const sh = Math.sin(0.5 * ea) / ea;
      acroQ = qmul(quat, [Math.cos(0.5 * ea), ex * sh, ey * sh, 0]);
    } else {
      acroQ = quat.slice();
    }
    const nq = Math.hypot(...acroQ);
    acroQ = acroQ.map((x) => x / nq);
    acroIRoll = clip(acroIRoll + fw.acro_roll_ki * ex * DT, fw.acro_i_max);
    acroIPitch = clip(acroIPitch + fw.acro_pitch_ki * -ey * DT, fw.acro_i_max);
    return [
      clamp1(fw.acro_roll_kp * ex + acroIRoll + fw.acro_roll_kd * -om[0]),
      clamp1(fw.acro_pitch_kp * -ey + acroIPitch + fw.acro_pitch_kd * om[1]),
    ];
  };
  const steps = Math.round(seconds / DT);
  for (let step = 1; step <= steps; step += 1) {
    const vb = rotateInv(quat, vel);
    const [u, v, w] = vb;
    const V = Math.hypot(u, v, w);
    const Vxz = Math.hypot(u, w);
    const uPos = Math.max(0, u);

    /* THE STABILISER, mode 1, or Acro, mode 2, the sticks centred. */
    const [qw, qx, qy, qz] = quat;
    let roll, pitch, yaw;
    if (mode === 'acro') {
      [roll, pitch] = acroSticks();
      yaw = 0;
    } else {
      const bxz = 2 * (qx * qz - qw * qy), byz = 2 * (qy * qz + qw * qx), bzz = 1 - 2 * (qx * qx + qy * qy);
      const pitchAtt = Math.atan2(bxz, Math.hypot(byz, bzz)), bank = Math.atan2(byz, bzz);
      let pitchT = fw.stab_trim_pitch;
      if (duty < fw.stab_trim_throttle) pitchT -= fw.stab_pitch_down * (fw.stab_trim_throttle - duty) / fw.stab_trim_throttle;
      const rollThrow = mix === 'FW_MIX_RUDDER' ? fw.throw_r : fw.throw_a;
      if (rollThrow > 0) {
        rollI += STAB_ROLL_I * (-bank / STAB_ROLL_TCONST - om[0]) / rollThrow * DT;
        rollI = clip(rollI, STAB_ROLL_IMAX);
      }
      roll = clamp1(-fw.stab_roll_kp * bank - fw.stab_roll_kd * om[0] + rollI);
      pitch = clamp1(fw.stab_pitch_kp * (pitchT - pitchAtt) - fw.stab_pitch_kd * -om[1]);
      const rCoord = -g * byz / Math.max(V, 5);
      yaw = clamp1(fw.yaw_coord_k * (om[2] - rCoord));
    }

    /* The surfaces. */
    let de = surfaceFromStick(pitch, fw.throw_e, expo(1)) + fw.trim_e;
    let da = surfaceFromStick(roll, fw.throw_a, expo(0));
    const rudderStick = mix === 'FW_MIX_RUDDER' ? clamp1(yaw + roll) : yaw;
    let dr = -surfaceFromStick(rudderStick, fw.throw_r, expo(2));
    if (fw.servo_rate > 0) {
      const cmd = [da, de, dr];
      for (let i = 0; i < 3; i += 1) servo[i] += clip(cmd[i] - servo[i], fw.servo_rate * DT);
      [da, de, dr] = servo;
    }
    let dE, dA;
    if (mix === 'FW_MIX_ELEVON') {
      const s0 = clip(de - da, fw.surface_max), s1 = clip(de + da, fw.surface_max);
      dE = 0.5 * (s0 + s1);
      dA = 0.5 * (s1 - s0);
      if (!(fw.throw_r > 0)) dr = 0;
    } else {
      dA = mix === 'FW_MIX_TAIL' ? da : 0;
      dE = clip(de, fw.throw_e);
    }
    let dR = dr;
    if (fw.surf_knee > 0) {
      const knee = (d) => d / Math.sqrt(1 + (d / fw.surf_knee) ** 2);
      dE = knee(dE); dA = knee(dA); dR = knee(dR);
    }

    /* The air. */
    const alpha = (Vxz > 1e-6 ? Math.atan2(-w, u) : 0) - fw.alpha_zl;
    const betaS = fw.hi_alpha ? (V > 1e-6 ? -v / V : 0) : (V > 1e-6 ? Math.atan2(-v, Vxz) : 0);
    const qbar = 0.5 * rho * V * V;
    const sinB = Vxz > 0.5 ? -w / Vxz : 0, cosB = Vxz > 0.5 ? u / Vxz : 1;
    const sinA = sinB * fw.cos_zl - cosB * fw.sin_zl, cosA = cosB * fw.cos_zl + sinB * fw.sin_zl;
    /* The slats, fitted unless a pilot takes them off (plant_wing.c g_slats). */
    const clmax = fw.cl_max + fw.slat_dclmax;
    const aStall = clmax / cla;
    const aa = Math.abs(alpha);
    const sigma = smoothstep(aStall - fw.stall_blend, aStall + fw.stall_blend, aa);
    sigmaMax = Math.max(sigmaMax, sigma);
    const round = fw.stall_round > 0 ? fw.stall_round : fw.stall_blend;
    const a0 = aStall - round, a1 = aStall + round;
    const wingCl = aa < a0 ? cla * aa : aa < a1 ? clmax - cla * (a1 - aa) * (a1 - aa) / (4 * round) : clmax;
    const clLin = fw.cl_alpha * alpha + fw.cl_de * dE;
    let CL = (alpha < 0 ? -wingCl : wingCl) + (tailOwn ? 0 : fw.cl_de * dE);
    if (fw.cl_alpha_wing > 0 && !tailOwn) CL += (fw.cl_alpha - fw.cl_alpha_wing) * sinA * cosA;
    let cd0 = fw.cd0 + fw.slat_cd0;
    if (fw.cd0_re > 0) { const re = V * fw.chord * rho / AIR_MU; cd0 *= Math.sqrt(fw.cd0_re / Math.max(re, 0.5 * fw.cd0_re)); }
    if (fw.surf_cd && (fw.surf_cd[0] > 0 || fw.surf_cd[1] > 0 || fw.surf_cd[2] > 0)) cd0 += fw.surf_cd[0] * surfDrag(dA) + fw.surf_cd[1] * surfDrag(dE) + fw.surf_cd[2] * surfDrag(dR);
    const sS = Math.sin(aStall), cS = Math.cos(aStall);
    const b2 = (fw.k_induced * clmax * clmax - plateCn * sS * sS) / cS;
    const cdFlat = cd0 + plateCn * sinA * sinA + (cosA > 0 ? b2 * cosA : 0);
    const CD = (1 - sigma) * (cd0 + fw.k_induced * clLin * clLin) + sigma * cdFlat;

    /* The tail on its own angle (hi_alpha), the sideslip terms with it. */
    let cmStiff = fw.cm_alpha * alpha, cmDe = fw.cm_de;
    let cyb = fw.cy_beta, clb = fw.cl_beta, cnb = fw.cn_beta, cydr = fw.cy_dr, cldr = fw.cl_dr, cndr = fw.cn_dr;
    let ae = 0, arud = 0;
    if (fw.hi_alpha) {
      const dd = fw.tail_deda;
      const vh = -fw.slip_cm_a / (fw.tail_at * (1 - dd));
      const vv = fw.slip_cn_b / fw.tail_av;
      ae = vh > 0 ? -fw.cm_de * dE / vh : 0;
      arud = vv > 0 ? fw.cn_dr * dR / vv : 0;
      const at = sinA - dd * CL / (tailOwn ? fw.cl_alpha_wing : fw.cl_alpha) - fw.slip_a0 * (1 - dd);
      const xt = fw.tail_at * at + ae;
      const rt = plateRatio(xt, fw.tail_cn);
      cmStiff = (fw.cm_alpha - fw.slip_cm_a) * sinA + fw.slip_cm_a * fw.slip_a0 - vh * xt * rt;
      if (tailOwn) CL += (fw.cl_alpha - fw.cl_alpha_wing) / (fw.tail_at * (1 - dd)) * xt * rt;
      cmDe = 0;
      const xv = fw.tail_av * betaS + arud;
      const rv = plateRatio(xv, fw.tail_cn);
      cyb = fw.cy_beta - fw.slip_cy_b * (1 - rv);
      clb = fw.cl_beta - fw.slip_cl_b * (1 - rv);
      cnb = fw.cn_beta - fw.slip_cn_b * (1 - rv);
      cydr *= rv; cldr *= rv; cndr *= rv;
    }

    if (fw.hi_lat && fw.hi_lat.length === 8) {
      const ab = Math.atan2(sinB, cosB) * 180 / Math.PI;
      cydr *= hiLatAt(fw.hi_lat[5], ab);
    }
    const F = [0, 0, 0];
    if (V > 1e-6) {
      const L = qbar * fw.area * CL, D = qbar * fw.area * CD;
      const Y = qbar * fw.area * (cyb * betaS + cydr * dR);
      if (Vxz > 1e-6) { F[0] += L * (-w / Vxz); F[2] += L * (u / Vxz); }
      F[0] -= D * u / V; F[1] -= D * v / V; F[2] -= D * w / V;
      F[1] -= Y;
    }

    /* The motor. */
    const dutyE = stickDuty(duty, uPos);
    if (fan) {
      let target = dutyE;
      if (!(duty > 0) && !(fw.throttle_idle > 0)) { target = 0; ramp = 0; } else if (ramp < 1) {
        ramp = fw.esc_start > 0 ? ramp + DT / fw.esc_start : 1;
        if (ramp >= target) ramp = 1; else target = ramp;
      }
      fanV += ((target - fanN) / (fw.fan_tau * fw.fan_tau) - 2 * fanV / fw.fan_tau) * DT;
      fanN += fanV * DT;
      if (fanN < 0) { fanN = 0; fanV = 0; }
      n = fanN;
    } else if (n === null) { n = dutyE; dn = 0; } else if (spools) {
      const drive = electric ? K_M * (dutyE - n) + dutyE : dutyE * dutyE;
      const nNew = Math.max(0, n + DT * qF * (drive - n * n) / (fw.j_prop * wF));
      dn = (nNew - n) / DT;
      n = nNew;
    } else {
      n = dutyE;
    }
    const mu = n > 0 ? uPos / (fw.pitch_speed * n) : 0;
    let thrust = n > 0 && fw.thrust_static > 0 ? fw.thrust_static * n * n * curveAt(fw.axial_curve, mu) : 0;
    if (thrust < 0) thrust = 0;
    let mThrustYaw = 0;
    if (fw.thrust_yaw !== 0) {
      const fy = -thrust * Math.sin(fw.thrust_yaw);
      F[0] += thrust * Math.cos(fw.thrust_yaw); F[1] += fy;
      mThrustYaw = fw.prop_x * fy;
    } else {
      F[0] += thrust;
    }
    const qAir = spools ? qF * n * n * curveAt(fw.torque_curve, mu) : fw.torque_arm * thrust;
    const qReact = spools ? (mount ? qAir + fw.j_prop * wF * dn : 0) : qAir;
    const wRot = n * wF;

    /* The slipstream. */
    let mSlip = 0, nSlip = 0, lSlip = 0;
    if (fw.slip_r > 0 && thrust > 0) {
      const wa = wash(fw, thrust, uPos);
      const xa = -w * Math.cos(fw.slip_a0) - u * Math.sin(fw.slip_a0);
      let keep = fw.slip_pusher ? 1 : t.keep;
      let root = (1 - keep) * qAir;
      if (fw.slip_root_eta > 0 && qAir > 0) {
        const mdot = rho * Math.PI * fw.slip_r * fw.slip_r * (uPos + wa.vi);
        const omS = 2 * qAir / (mdot * wa.rw * wa.rw);
        const xw = -w * fw.cos_zl - u * fw.sin_zl;
        root = Math.min(qAir, rootSwirl(fw, cla, xw, uPos + 2 * wa.vi, omS, wa.rw, rho));
        keep = 1 - root / qAir;
      }
      const sw = finSwirl(fw, wa, qAir, keep, uPos);
      const xb = -v - sw.xs, xbf = -v - sw.xsF;
      const aW = Math.abs(Math.atan2(-w, uPos)) * 180 / Math.PI;
      const tcl = wa.dp / (wa.dp + 0.5 * rho * V * V);
      const fade = tcl <= 0.91 ? 1 : tcl >= 1 ? 0 : (1 - tcl) / 0.09;
      const kWith = 1 - fade * (1 - washKeep(KW_WITH, aW)), kAgainst = 1 - fade * (1 - washKeep(KW_AGAINST, aW));
      const kw = fw.cm_de * dE * xa > 0 ? kAgainst : kWith;
      const kwa = 0.5 * (kWith + kAgainst);
      let rh = 1, rvv = 1;
      if (fw.hi_alpha) {
        const ex = 4 * wa.vi * (uPos + wa.vi);
        rh = plateRatio(fw.tail_at * xa / Math.sqrt(uPos * uPos + wa.keepH * ex) + kw * ae, fw.tail_cn);
        rvv = plateRatio(fw.tail_av * xb / Math.sqrt(uPos * uPos + wa.keepV * ex) + arud, fw.tail_cn);
      }
      const kh = rho * wa.vi * wa.fh * rh, kv = rho * wa.vi * wa.fv * rvv;
      const ph = wa.dp * wa.keepH * wa.fh * rh * kw, pv = wa.dp * wa.keepV * wa.fv * rvv;
      F[2] += fw.area * (kh * fw.slip_cl_a * xa + ph * fw.cl_de * dE);
      F[1] -= fw.area * (kv * fw.slip_cy_b * xbf + pv * fw.cy_dr * dR);
      const qA = -om[1], rA = -om[2];
      mSlip = fw.area * fw.chord * (kh * (fw.slip_cm_a * xa + fw.cm_q * qA * 0.5 * fw.chord) + ph * fw.cm_de * dE);
      nSlip = fw.area * fw.span * (kv * (fw.slip_cn_b * xbf + fw.slip_cn_r * rA * 0.5 * fw.span) + pv * fw.cn_dr * dR);
      lSlip = fw.area * fw.span * (kv * fw.slip_cl_b * xbf + pv * fw.cl_dr * dR + wa.dp * wa.fa * kwa * fw.cl_da * dA) + root;
    }
    /* Selig's jet normal force. */
    const jetM = [0, 0, 0];
    if (fw.jet_kj > 0 && thrust > 0) {
      const aDisc = Math.PI * fw.slip_r * fw.slip_r;
      const w0 = Math.sqrt(thrust / (2 * rho * aDisc));
      const wi = 0.5 * (Math.sqrt(uPos * uPos + 2 * thrust / (rho * aDisc)) - uPos);
      const k = fw.jet_kj * rho * aDisc * w0 * wi / (uPos + wi);
      const fy = -k * (v + om[2] * fw.prop_x), fz = -k * (w - om[1] * fw.prop_x);
      F[1] += fy; F[2] += fz;
      jetM[1] = -fw.prop_x * fz; jetM[2] = fw.prop_x * fy;
    }
    const fSide = fw.side_cda > 0 ? -0.5 * rho * fw.side_cda * v * Math.abs(v) : 0;
    F[1] += fSide;

    /* The moments, in the stability axes and back. */
    const p = om[0], qAero = -om[1], rAero = -om[2];
    const Vr = Math.max(V, 1), b2v = fw.span / (2 * Vr), c2v = fw.chord / (2 * Vr);
    const ps = p * cosB + rAero * sinB, rs = rAero * cosB - p * sinB;
    /* A table's measured lateral derivatives against the body's angle
     * (hi_lat, the F-16's), as plant_wing.c takes them. */
    const hl = fw.hi_lat && fw.hi_lat.length === 8 ? fw.hi_lat : null;
    const aBody = Math.atan2(sinB, cosB) * 180 / Math.PI;
    const hlAt = (i) => hiLatAt(hl[i], aBody);
    let clbL = clb, cnbL = cnb, cldrL = cldr, cndrL = cndr;
    const rClp = hl ? hlAt(2) : 1, rCnr = hl ? hlAt(3) : 1, rAil = hl ? hlAt(4) : 1;
    if (hl) { cnbL *= hlAt(0); clbL *= hlAt(1); const rr = hlAt(5); cldrL *= rr; cndrL *= rr; }
    /* Munk's moment, the fuselage's share of cn_beta on -u v / V^2 in the
     * body, out of the stability axes (plant_wing.c, MUNK'S MOMENT). */
    const cnFus = fw.cn_beta_fus * (hl ? hlAt(0) : 1);
    const munk = V > 1e-6 ? -(u * v) / (V * V) : 0;
    const dAm = dA * rAil;
    const clS = clbL * betaS + fw.cl_p * rClp * ps * b2v + fw.cl_da * dAm + (hl ? hlAt(6) : fw.cl_r_per_cl * CL) * rs * b2v + cldrL * dR;
    const cnS = (cnbL - cnFus) * betaS + fw.cn_r * rCnr * rs * b2v + (hl ? hlAt(7) : fw.cn_p_per_cl * CL) * ps * b2v + fw.cn_da_per_cl * CL * dAm + cndrL * dR;
    const clBody = clS * cosB - cnS * sinB, cnBody = cnS * cosB + clS * sinB + cnFus * munk;
    const clFlat = plateCn * sinA * cosA;
    const cmLow = -sigma * (fw.lowre_arm_ac * clLin + fw.lowre_arm_cp * clFlat);
    const mAero = qbar * fw.area * fw.chord * (fw.cm_0 + cmStiff + fw.cm_q * qAero * c2v + cmDe * dE + cmLow - (fw.cg_shift / fw.chord) * CL);
    const M = [
      qbar * fw.area * fw.span * clBody - qReact + lSlip,
      -mAero + fw.thrust_z * thrust - mSlip + jetM[1],
      -qbar * fw.area * fw.span * cnBody + mThrustYaw - nSlip + jetM[2] + fw.side_x * fSide,
    ];
    if (wRot > 0) M[2] += fw.pfactor * thrust * -w / wRot;
    if (fw.rot_k && (fw.rot_k[0] > 0 || fw.rot_k[1] > 0 || fw.rot_k[2] > 0)) {
      const lin = [
        0.25 * rho * V * fw.area * fw.span * fw.span * Math.abs(fw.cl_p),
        0.25 * rho * V * fw.area * fw.chord * fw.chord * Math.abs(fw.cm_q),
        0.25 * rho * V * fw.area * fw.span * fw.span * Math.abs(fw.cn_r),
      ];
      for (let i = 0; i < 3; i += 1) {
        const lq = lin[i] * Math.abs(om[i]), kq = fw.rot_k[i] * om[i] * om[i];
        const more = Math.sqrt(lq * lq + kq * kq) - lq;
        M[i] -= om[i] < 0 ? -more : more;
      }
    }
    if (fw.j_prop > 0) {
      const H = fw.j_prop * wRot;
      M[1] -= om[2] * H;
      M[2] += om[1] * H;
    }

    /* The plant's step: the rates with the inertia's own coupling, the
     * attitude, then the velocity and the position, semi implicit. */
    const h = [Ix * om[0], Iy * om[1], Iz * om[2]];
    const gy = [om[1] * h[2] - om[2] * h[1], om[2] * h[0] - om[0] * h[2], om[0] * h[1] - om[1] * h[0]];
    om = [om[0] + (M[0] - gy[0]) / Ix * DT, om[1] + (M[1] - gy[1]) / Iy * DT, om[2] + (M[2] - gy[2]) / Iz * DT];
    const wx = om[0] * DT, wy = om[1] * DT, wz = om[2] * DT;
    const ang = Math.hypot(wx, wy, wz);
    if (ang > 1e-12) {
      const sh = Math.sin(0.5 * ang), ch = Math.cos(0.5 * ang);
      const q2 = qmul(quat, [ch, sh * wx / ang, sh * wy / ang, sh * wz / ang]);
      const nq = Math.hypot(...q2);
      quat = q2.map((x) => x / nq);
    }
    const Fw = rotate(quat, F);
    vel = [vel[0] + Fw[0] / m * DT, vel[1] + Fw[1] / m * DT, vel[2] + (Fw[2] / m - g) * DT];
    pos = [pos[0] + vel[0] * DT, pos[1] + vel[1] * DT, pos[2] + vel[2] * DT];

    if (next < at.length && step === Math.round(at[next] / DT)) {
      const [ww, xx, yy, zz] = quat;
      const bk = Math.atan2(2 * (yy * zz + ww * xx), 1 - 2 * (xx * xx + yy * yy));
      const psi = Math.atan2(2 * (ww * zz + xx * yy), 1 - 2 * (yy * yy + zz * zz));
      out.push({ t: at[next], y: pos[1], bank: bk * 180 / Math.PI, heading: psi * 180 / Math.PI, V: Math.hypot(...vel), vz: vel[2], z: pos[2], sigmaMax });
      next += 1;
    }
  }
  return out;
}

/* plant_wing.c hi_lat_at: TP-1538's angles, straight between, held past. */
const HI_LAT_DEG = [-20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90];
function hiLatAt(row, deg) {
  if (!(deg > HI_LAT_DEG[0])) return row[0];
  for (let i = 0; i < 19; i += 1) if (deg <= HI_LAT_DEG[i + 1]) return row[i] + (row[i + 1] - row[i]) * (deg - HI_LAT_DEG[i]) / (HI_LAT_DEG[i + 1] - HI_LAT_DEG[i]);
  return row[19];
}

/* plant_wing.c root_swirl: the swirl over the wing's root, its roll
 * moment the prop's way, where the table measures its root (slip_root). */
function rootSwirl(fw, cla, xw, vw, om, rw, rho) {
  const [yf, h, chord] = fw.slip_root;
  if (!(rw > h) || !(vw > 0)) return 0;
  const yw = Math.sqrt(rw * rw - h * h);
  if (!(yw > yf)) return 0;
  const mid = 0.5 * (yw + yf), hw = 0.5 * (yw - yf);
  let sum = 0;
  for (let i = 0; i < 4; i += 1) {
    const y = mid + hw * GX[i];
    const xp = cla * (xw + om * y) / vw, xm = cla * (xw - om * y) / vw;
    sum += GW[i] * y * (xp * plateRatio(xp, fw.tail_cn) - xm * plateRatio(xm, fw.tail_cn));
  }
  return fw.slip_root_eta * 0.5 * rho * vw * vw * chord * hw * sum;
}
