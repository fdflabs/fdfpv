/*
 * throwflight.js: a fixed wing thrown level and flown hands off in
 * Stabilised (mode 1), the throw every stab selftest's "straight" check
 * flies, as a derivation. It is the CAP's throw (docs/CAP580-STAGE1.md,
 * w36-cap-straight) for any table: the body's six rates and speeds at the
 * plant's 1 ms step, on the table's own coefficients read from
 * src/native/plant_wing.c and its airframe's mass and inertia from
 * src/native/plant.c, in small angle aerodynamics. Nothing here loads the
 * plant; every term is written out as plant_wing.c has it at a cruise:
 *
 * - the wing's linear lift on the top of its curve, the drag on the
 *   linear lift and the deflected surfaces' drag; the pitching moment the
 *   same way; the six lateral derivatives and the CL rules' cross terms in
 *   the stability axes, the fuselage's share of cn_beta on Munk's u v in
 *   the body; the fuselage's crossflow drag (side_cda) at the CG;
 * - the motor: an electric's duty on the seated pack (scripts/lib/
 *   propcurve.js wingSeat, the gates' 4.1 V), an engine's from its idle,
 *   spooled from the duty's speed at the throw on Drela's law (or a glow
 *   engine's square law), its thrust and torque on APC's curves, the
 *   rotor's acceleration on the mount, the thrust line's moment and the
 *   prop as a gyroscope;
 * - the receiver, plant_wing.c "THE STABILISER": the bank loop with
 *   ArduPilot's integrator, the pitch loop on stab_trim_pitch less the
 *   pitch down under the trim throttle, the turn coordinator; the mixes
 *   (ailerons, a rudder only aircraft's roll stick on the rudder,
 *   elevons), the expo and the surfaces' knee.
 *
 * Left out, and so the limits of what it derives: the stall (it says when
 * a step's alpha reaches the curve's top), ground effect (a throw must
 * clear GE_HB_MAX of its span), the pack's drain over the flight, crash
 * damage.
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
import { planeTable } from './wash.js';
import { SEAT_GATES, wingSeat } from './propcurve.js';

const PLANT_C = new URL('../../src/native/plant.c', import.meta.url);
const WING_C = new URL('../../src/native/plant_wing.c', import.meta.url);
const DT = 0.001;
const SURF_DRAG_A = 0.2476, SURF_DRAG_B = 0.3992;
const K_M = 0.85 / 0.15;
const STAB_ROLL_I = 0.05, STAB_ROLL_TCONST = 0.5, STAB_ROLL_IMAX = 1 / 3;
const clamp1 = (x) => Math.max(-1, Math.min(1, x));
const clip = (x, m) => Math.max(-m, Math.min(m, x));
const smoothstep = (a, b, x) => { if (x <= a) return 0; if (x >= b) return 1; const t = (x - a) / (b - a); return t * t * (3 - 2 * t); };
const surfaceFromStick = (x, thr, expo) => { const c = clamp1(x); return clip((c * c * c * expo + c * (1 - expo)) * thr, thr); };
const deadband1 = (x, band) => { const c = clamp1(x); if (c > band) return (c - band) / (1 - band); if (c < -band) return (c + band) / (1 - band); return 0; };
const surfDrag = (d) => SURF_DRAG_A * Math.abs(d) + SURF_DRAG_B * d * d;
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
  const electric = fw.current_full > 0;
  const seat = electric ? wingSeat(table) : null;
  const fan = fw.fan_tau > 0;
  const spools = fw.j_prop > 0 && fw.thrust_static > 0 && !fan;
  const wF = 0.85 * fw.rpm_no_load * 2 * Math.PI / 60;
  const qF = fw.torque_arm * fw.thrust_static;
  const cla = fw.cl_alpha;
  const ar = fw.span * fw.span / fw.area;
  const plateCn = 1.11 + 0.018 * Math.min(ar, 50);
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
  let sigmaMax = 0;
  const out = [];
  let next = 0;
  /* plant_wing.c acro_sticks with every stick centred: the target
   * attitude taken at the first step (a launch clears it), turned with the
   * aircraft's own heading as far as the nose is level, and kept; its yaw
   * dropped each step. The error split into
   * the twist about the nose and the swing that points it, and the stick
   * that flies onto it. */
  const acroSticks = () => {
    if (!acroQ) { acroQ = quat.slice(); acroIRoll = 0; acroIPitch = 0; }
    const wv = rotate(quat, om);
    const fwv = rotate(quat, [1, 0, 0]);
    const level = fwv[0] * fwv[0] + fwv[1] * fwv[1];
    const h = 0.5 * DT;
    let tq = qmul([1, 0, 0, level * wv[2] * h], acroQ);
    const tn = Math.hypot(...tq);
    tq = tq.map((x) => x / tn);
    let qe = qmul([quat[0], -quat[1], -quat[2], -quat[3]], tq);
    if (qe[0] < 0) qe = qe.map((x) => -x);
    const tw = Math.hypot(qe[0], qe[1]);
    const tc = tw > 1e-12 ? qe[0] / tw : 1, ts = tw > 1e-12 ? qe[1] / tw : 0;
    let ex = 2 * Math.atan2(ts, tc);
    const sy = qe[2] * tc - qe[3] * ts, sz = qe[2] * ts + qe[3] * tc;
    const sn = Math.hypot(sy, sz);
    const k = sn > 1e-12 ? 2 * Math.atan2(sn, tw) / sn : 2;
    let ey = sy * k, ez = 0;
    const ea = Math.hypot(ey, ez);
    const sh = ea > 1e-12 ? Math.sin(0.5 * ea) / ea : 0.5;
    acroQ = qmul(quat, qmul([Math.cos(0.5 * ea), 0, ey * sh, ez * sh], [Math.cos(0.5 * ex), Math.sin(0.5 * ex), 0, 0]));
    const nq = Math.hypot(...acroQ);
    acroQ = acroQ.map((x) => x / nq);
    const ec = Math.hypot(ex, ey, ez);
    if (ec > fw.acro_err_max) { ex *= fw.acro_err_max / ec; ey *= fw.acro_err_max / ec; ez *= fw.acro_err_max / ec; }
    acroIRoll = clip(acroIRoll + fw.acro_roll_ki * ex * DT, fw.acro_i_max);
    acroIPitch = clip(acroIPitch + fw.acro_pitch_ki * -ey * DT, fw.acro_i_max);
    return [
      clamp1(fw.acro_roll_kp * ex + acroIRoll + fw.acro_roll_kd * -om[0]),
      clamp1(fw.acro_pitch_kp * -ey + acroIPitch + fw.acro_pitch_kd * om[1]),
      0,
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
      [roll, pitch, yaw] = acroSticks();
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
    const de = surfaceFromStick(pitch, fw.throw_e, expo(1)) + fw.trim_e;
    const da = surfaceFromStick(roll, fw.throw_a, expo(0));
    const rudderStick = mix === 'FW_MIX_RUDDER' ? clamp1(yaw + roll) : yaw;
    let dr = -surfaceFromStick(rudderStick, fw.throw_r, expo(2));
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
    const betaS = V > 1e-6 ? Math.atan2(-v, Vxz) : 0;
    const qbar = 0.5 * rho * V * V;
    const sinB = Vxz > 0.5 ? -w / Vxz : 0, cosB = Vxz > 0.5 ? u / Vxz : 1;
    const sinA = sinB * fw.cos_zl - cosB * fw.sin_zl, cosA = cosB * fw.cos_zl + sinB * fw.sin_zl;
    const clmax = fw.cl_max;
    const aStall = clmax / cla;
    const aa = Math.abs(alpha);
    const sigma = smoothstep(aStall - fw.stall_blend, aStall + fw.stall_blend, aa);
    sigmaMax = Math.max(sigmaMax, sigma);
    const round = fw.stall_blend;
    const a0 = aStall - round, a1 = aStall + round;
    const wingCl = aa < a0 ? cla * aa : aa < a1 ? clmax - cla * (a1 - aa) * (a1 - aa) / (4 * round) : clmax;
    const clLin = fw.cl_alpha * alpha + fw.cl_de * dE;
    const CL = (alpha < 0 ? -wingCl : wingCl) + fw.cl_de * dE;
    let cd0 = fw.cd0;
    if (fw.surf_cd && (fw.surf_cd[0] > 0 || fw.surf_cd[1] > 0 || fw.surf_cd[2] > 0)) cd0 += fw.surf_cd[0] * surfDrag(dA) + fw.surf_cd[1] * surfDrag(dE) + fw.surf_cd[2] * surfDrag(dR);
    const sS = Math.sin(aStall), cS = Math.cos(aStall);
    const b2 = (fw.k_induced * clmax * clmax - plateCn * sS * sS) / cS;
    const cdFlat = cd0 + plateCn * sinA * sinA + (cosA > 0 ? b2 * cosA : 0);
    const CD = (1 - sigma) * (cd0 + fw.k_induced * clLin * clLin) + sigma * cdFlat;
    /* The plate's share, which goes with the lift (plant_wing.c, THE PLATE'S FORCE IN A SIDESLIP). */
    const cdPlate = sigma * (plateCn * sinA * sinA + (cosA > 0 ? b2 * cosA : 0));

    const cmStiff = fw.cm_alpha * alpha, cmDe = fw.cm_de;
    const cyb = fw.cy_beta, clb = fw.cl_beta, cnb = fw.cn_beta, cydr = fw.cy_dr, cldr = fw.cl_dr, cndr = fw.cn_dr;
    const F = [0, 0, 0];
    if (V > 1e-6) {
      const L = qbar * fw.area * CL, D = qbar * fw.area * CD;
      const Y = qbar * fw.area * (cyb * betaS + cydr * dR);
      if (Vxz > 1e-6) { F[0] += L * (-w / Vxz); F[2] += L * (u / Vxz); }
      const Dp = qbar * fw.area * cdPlate, Dw = D - Dp;
      F[0] -= Dw * u / V; F[1] -= Dw * v / V; F[2] -= Dw * w / V;
      if (Vxz > 1e-6) { F[0] -= Dp * u / Vxz; F[2] -= Dp * w / Vxz; } else { F[0] -= Dp * u / V; F[2] -= Dp * w / V; }
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
    F[0] += thrust;
    const qAir = spools ? qF * n * n * curveAt(fw.torque_curve, mu) : fw.torque_arm * thrust;
    const qReact = spools ? (mount ? qAir + fw.j_prop * wF * dn : 0) : qAir;
    const wRot = n * wF;

    const fSide = fw.side_cda > 0 ? -0.5 * rho * fw.side_cda * v * Math.abs(v) : 0;
    F[1] += fSide;

    /* The moments, in the stability axes and back. */
    const p = om[0], qAero = -om[1], rAero = -om[2];
    const Vr = Math.max(V, 1), b2v = fw.span / (2 * Vr), c2v = fw.chord / (2 * Vr);
    const ps = p * cosB + rAero * sinB, rs = rAero * cosB - p * sinB;
    /* Munk's moment, the fuselage's share of cn_beta on -u v / V^2 in the
     * body, out of the stability axes (plant_wing.c, MUNK'S MOMENT). */
    const cnFus = fw.cn_beta_fus;
    const munk = V > 1e-6 ? -(u * v) / (V * V) : 0;
    const clS = clb * betaS + fw.cl_p * ps * b2v + fw.cl_da * dA + fw.cl_r_per_cl * CL * rs * b2v + cldr * dR;
    const cnS = (cnb - cnFus) * betaS + fw.cn_r * rs * b2v + fw.cn_p_per_cl * CL * ps * b2v + fw.cn_da_per_cl * CL * dA + cndr * dR;
    const clBody = clS * cosB - cnS * sinB, cnBody = cnS * cosB + clS * sinB + cnFus * munk;
    const mAero = qbar * fw.area * fw.chord * (fw.cm_0 + cmStiff + fw.cm_q * qAero * c2v + cmDe * dE - (fw.cg_shift / fw.chord) * CL);
    const M = [
      qbar * fw.area * fw.span * clBody - qReact,
      -mAero + fw.thrust_z * thrust,
      -qbar * fw.area * fw.span * cnBody,
    ];
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
