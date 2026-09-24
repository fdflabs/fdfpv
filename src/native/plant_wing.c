/*
 * plant_wing.c: the fixed wing plant, one plant for every fixed wing.
 *
 * A six degree of freedom rigid body in the quad's frames (world Z up,
 * body X forward Y left Z up, SI, 1 ms steps) with lift, drag and
 * pitching moment from angle of attack and sideslip, a smooth stall,
 * control surfaces driven from the sticks through travel and expo, and
 * one pusher motor whose thrust falls off with airspeed. There is no
 * Betaflight in the loop: Betaflight 4.5 has no wing support. What there
 * is instead is the stabiliser below, off in Manual.
 *
 * Every number is per airframe, in the FixedWingParams tables at the end
 * of this file: FW_WING1000, the 1000 mm flying wing of
 * docs/WING-STAGE1.md, with elevons and no rudder; and FW_SKY1800, the
 * Skyhunter of docs/SKYHUNTER-STAGE1.md, with ailerons, an elevator and a
 * rudder on an H tail. A term an airframe does not have is zero in its
 * table, and every term the Skyhunter added is written so that a zero
 * leaves the wing's arithmetic bit for bit what it was: the wing's gates
 * and its recorded trace hashes are the proof. The bands each airframe has
 * to land in are scripts/wing-gates.js and scripts/skyhunter-gates.js.
 *
 * Determinism: sqrt, the fixed atan2 and the small angle sin and cos from
 * libm, and nothing else. Lift and drag directions come from the wind
 * vector without trigonometry; the stall blend is a cubic, not a sigmoid,
 * so no exponential is needed.
 *
  * This file is part of WebFPVSimulator.
  *
  * WebFPVSimulator is free software: you can redistribute it and/or modify
  * it under the terms of the GNU General Public License as published by
  * the Free Software Foundation, either version 3 of the License, or (at
  * your option) any later version.
  *
  * WebFPVSimulator is distributed in the hope that it will be useful, but
  * WITHOUT ANY WARRANTY, without even the implied warranty of
  * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
  * General Public License for more details.
  *
  * You should have received a copy of the GNU General Public License
  * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

#include "sim_internal.h"
#include "libm/sim_math.h"

#define WING_PI 3.14159265358979323846
#define WING_DT (1.0 / SIM_STEP_HZ)

/* The surfaces this step, radians: left and right wing trailing edge
 * surface (elevon or aileron) and elevator positive trailing edge up,
 * rudder positive trailing edge left. The wing has no elevator or rudder
 * and reads zero there. */
static double g_surf[4] = { 0.0, 0.0, 0.0, 0.0 };

/*
 * THE STABILISER, which is the one flight controller a fixed wing gets
 * here. Betaflight has no wing mode, so this is not a port and not a
 * reimplementation of one: it is the attitude loop the harness pilot
 * flies the gates with, in C, so it is deterministic and never touches
 * JS maths. Off, the sticks are the surfaces. On, the roll stick asks for
 * a bank and the pitch stick for a pitch, both held by a rate damped
 * proportional loop, and centred sticks hold the aircraft level with a
 * little nose up trim. Set from the shell by the tune; a reset keeps it.
 * The gains are per airframe, in the tables below.
 *
 * ACRO, the stabiliser's second mode: sticks ask for a rotation rate, as
 * on a quad, and centred sticks hold the attitude the aircraft is in, with
 * no self levelling and no angle limits. A target attitude advances by the
 * commanded rate each step and the loop flies the aircraft onto it, so
 * there is nothing to drift: trim, prop torque and gusts all show up as an
 * error against a target that is not moving. Yaw is left out of the
 * target: the target is rebuilt from the real attitude plus only its roll
 * and pitch error every step, so heading follows the aircraft through a
 * turn. The error is clamped so the target cannot run far ahead of an
 * aircraft that cannot keep up, which is what would otherwise make a stop
 * overshoot. The same idea as ArduPlane's ACRO with ACRO_LOCKING.
 *
 * YAW, where there is a rudder. Manual: the yaw stick is the rudder.
 * Stabilised and Acro: the yaw stick is still the rudder, and on top of it
 * a yaw damper drives the body yaw rate toward the coordinated rate for
 * the bank flown, g sin(bank) cos(pitch)/V, which is ArduPlane's turn
 * coordination and what a pilot's feet do. It is not a yaw rate or heading
 * hold, deliberately: a rudder commands sideslip, not a rate, and a plane
 * turns by banking, so a loop that held heading against the stick would
 * fight every banked turn the roll loop flies. With the stick the pilot
 * can still slip, skid and hold a knife edge; with it centred the ball
 * stays in the middle.
 */
static int g_stab = 0;
/* The target, body to world like SimState.quat. Taken from the aircraft
 * on the first acro step after a reset or a mode change. */
static double g_acro_q[4] = { 1.0, 0.0, 0.0, 0.0 };
static int g_acro_held = 0;
static double g_acro_i_roll = 0.0;
static double g_acro_i_pitch = 0.0;

/* What the last step saw and did, for the gates and for anyone chasing a
 * sign: alpha (of the zero lift line), beta, qbar, CL, CD, l m n (aero),
 * thrust, F body x y z, M body x y z, u v w, delta_e, delta_a. */
static double g_debug[20];

void plant_wing_debug(double out[20]) {
  for (int i = 0; i < 20; i += 1) {
    out[i] = g_debug[i];
  }
}

static void wquat_mul(const double a[4], const double b[4], double out[4]) {
  out[0] = a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3];
  out[1] = a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2];
  out[2] = a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1];
  out[3] = a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0];
}

static void wquat_rotate(const double q[4], const double v[3], double out[3]) {
  const double w = q[0], x = q[1], y = q[2], z = q[3];
  const double xx = x * x, yy = y * y, zz = z * z;
  const double wx = w * x, wy = w * y, wz = w * z;
  const double xy = x * y, xz = x * z, yz = y * z;
  out[0] = (1.0 - 2.0 * (yy + zz)) * v[0] + 2.0 * (xy - wz) * v[1] + 2.0 * (xz + wy) * v[2];
  out[1] = 2.0 * (xy + wz) * v[0] + (1.0 - 2.0 * (xx + zz)) * v[1] + 2.0 * (yz - wx) * v[2];
  out[2] = 2.0 * (xz - wy) * v[0] + 2.0 * (yz + wx) * v[1] + (1.0 - 2.0 * (xx + yy)) * v[2];
}

static void wquat_rotate_inv(const double q[4], const double v[3], double out[3]) {
  const double qc[4] = { q[0], -q[1], -q[2], -q[3] };
  wquat_rotate(qc, v, out);
}

/* Stick to surface: full travel at full stick, with expo, clipped. */
static double surface_from_stick(double x, double throw_max, double expo) {
  if (x > 1.0) {
    x = 1.0;
  } else if (x < -1.0) {
    x = -1.0;
  }
  const double shaped = x * x * x * expo + x * (1.0 - expo);
  double d = shaped * throw_max;
  if (d > throw_max) {
    d = throw_max;
  } else if (d < -throw_max) {
    d = -throw_max;
  }
  return d;
}

static double clip(double x, double lim) {
  if (x > lim) return lim;
  if (x < -lim) return -lim;
  return x;
}

/*
 * sum + term, except that a term which is zero, of either sign, leaves sum
 * exactly as it was. Plain addition does not: -0 + +0 is +0. The terms
 * the Skyhunter brought (rudder, adverse yaw, roll from yaw rate, the zero
 * lift line) are zero on the wing, and the wing's arithmetic has to stay
 * bit for bit what it was, sign of zero included, or its recorded hashes
 * move. a - (-b) is a + b exactly in IEEE 754, and 0 - (+-0) is +0, so
 * this is the sum for every nonzero term and the identity for a zero one.
 */
static double add_term(double sum, double term) {
  return sum - (0.0 - term);
}

/* Cubic smoothstep from 0 at a to 1 at b. */
static double smoothstep(double a, double b, double x) {
  if (x <= a) {
    return 0.0;
  }
  if (x >= b) {
    return 1.0;
  }
  const double t = (x - a) / (b - a);
  return t * t * (3.0 - 2.0 * t);
}

static double clamp1(double x) {
  return x > 1.0 ? 1.0 : (x < -1.0 ? -1.0 : x);
}

static double deadband1(double x, double band) {
  x = clamp1(x);
  if (x > band) {
    return (x - band) / (1.0 - band);
  }
  if (x < -band) {
    return (x + band) / (1.0 - band);
  }
  return 0.0;
}

/* Pitch and bank from the body to world quaternion, the same two the
 * harness reads: pitch from the forward axis' world z, bank from the
 * left axis' world z, right wing down positive. atan2 rather than asin
 * because the fixed libm has the one and not the other. */
static void wing_attitude(const double q[4], double *pitch, double *bank) {
  const double w = q[0], x = q[1], y = q[2], z = q[3];
  const double bxz = 2.0 * (x * z - w * y);
  const double byz = 2.0 * (y * z + w * x);
  const double bzz = 1.0 - 2.0 * (x * x + y * y);
  *pitch = sim_atan2(bxz, sim_sqrt(byz * byz + bzz * bzz));
  *bank = sim_atan2(byz, bzz);
}

/* 0 off, 1 stabilised, 2 acro. The caller has range checked it. */
void plant_wing_set_stab(int mode) {
  if (mode != g_stab) {
    g_acro_held = 0;
  }
  g_stab = mode;
}

int plant_wing_stab(void) {
  return g_stab;
}

void plant_wing_reset(void) {
  for (int i = 0; i < 4; i += 1) {
    g_surf[i] = 0.0;
  }
  g_acro_held = 0;
}

static double acro_shape(const FixedWingParams *fw, double x) {
  const double d = deadband1(x, fw->stab_deadband);
  return d * d * d * fw->acro_expo + d * (1.0 - fw->acro_expo);
}

/* Acro: roll and pitch stick in, the stick that flies the aircraft onto
 * the advancing target out. Body axes: x forward, y left, so a right roll
 * is +omega[0] and nose up is -omega[1]. */
static void acro_sticks(const FixedWingParams *fw, const SimState *s, double *roll, double *pitch) {
  if (!g_acro_held) {
    for (int i = 0; i < 4; i += 1) {
      g_acro_q[i] = s->quat[i];
    }
    g_acro_held = 1;
    g_acro_i_roll = 0.0;
    g_acro_i_pitch = 0.0;
  }
  const double rate_roll = fw->acro_roll_rate * acro_shape(fw, *roll);
  const double rate_up = fw->acro_pitch_rate * acro_shape(fw, *pitch);

  /* Turn the target's heading with the aircraft's own. A banked wing turns
   * about the world vertical, not its yaw axis, and a heading the wing
   * cannot hold would otherwise read as roll and pitch error and fight
   * the turn. Weighted by how level the nose is, because with the nose
   * straight up the world vertical is the roll axis, and following it
   * there would let the roll drift. */
  double wv[3];
  wquat_rotate(s->quat, s->omega, wv);
  const double fwd[3] = { 1.0, 0.0, 0.0 };
  double fwv[3];
  wquat_rotate(s->quat, fwd, fwv);
  const double level = fwv[0] * fwv[0] + fwv[1] * fwv[1];
  const double h = 0.5 * WING_DT;
  const double rz[4] = { 1.0, 0.0, 0.0, level * wv[2] * h };
  double tz[4];
  wquat_mul(rz, g_acro_q, tz);

  /* Advance the target by the asked rate, in its own body frame. */
  const double dq[4] = { 1.0, rate_roll * h, -rate_up * h, 0.0 };
  double t[4];
  wquat_mul(tz, dq, t);

  /* The error, target relative to the aircraft, as a body frame rotation
   * vector: e = axis * angle of conj(q) * t, taken the short way round. */
  const double qc[4] = { s->quat[0], -s->quat[1], -s->quat[2], -s->quat[3] };
  double qe[4];
  wquat_mul(qc, t, qe);
  if (qe[0] < 0.0) {
    for (int i = 0; i < 4; i += 1) {
      qe[i] = -qe[i];
    }
  }
  const double vn = sim_sqrt(qe[1] * qe[1] + qe[2] * qe[2] + qe[3] * qe[3]);
  const double k = vn > 1e-12 ? 2.0 * sim_atan2(vn, qe[0]) / vn : 2.0;
  double ex = qe[1] * k;
  double ey = qe[2] * k;
  const double en = sim_sqrt(ex * ex + ey * ey);
  if (en > fw->acro_err_max) {
    ex *= fw->acro_err_max / en;
    ey *= fw->acro_err_max / en;
  }

  /* Rebuild the target from the aircraft and the roll and pitch error
   * alone, which drops the yaw the target does not hold and the error past
   * the clamp. The half angle is at most ten degrees, inside
   * sim_sin_small's range. */
  const double ea = sim_sqrt(ex * ex + ey * ey);
  if (ea > 1e-12) {
    const double sh = sim_sin_small(0.5 * ea) / ea;
    const double r[4] = { sim_cos_small(0.5 * ea), ex * sh, ey * sh, 0.0 };
    wquat_mul(s->quat, r, g_acro_q);
  } else {
    for (int i = 0; i < 4; i += 1) {
      g_acro_q[i] = s->quat[i];
    }
  }
  const double n = sim_sqrt(g_acro_q[0] * g_acro_q[0] + g_acro_q[1] * g_acro_q[1] +
                            g_acro_q[2] * g_acro_q[2] + g_acro_q[3] * g_acro_q[3]);
  for (int i = 0; i < 4; i += 1) {
    g_acro_q[i] /= n;
  }

  g_acro_i_roll += fw->acro_roll_ki * ex * WING_DT;
  g_acro_i_pitch += fw->acro_pitch_ki * -ey * WING_DT;
  g_acro_i_roll = clip(g_acro_i_roll, fw->acro_i_max);
  g_acro_i_pitch = clip(g_acro_i_pitch, fw->acro_i_max);

  *roll = clamp1(fw->acro_roll_kp * ex + g_acro_i_roll + fw->acro_roll_kd * (rate_roll - s->omega[0]) +
                 fw->acro_roll_ff * rate_roll);
  *pitch = clamp1(fw->acro_pitch_kp * -ey + g_acro_i_pitch + fw->acro_pitch_kd * (rate_up + s->omega[1]) +
                  fw->acro_pitch_ff * rate_up);
}

/* The turn coordinator: the yaw stick that brings the body yaw rate onto
 * the coordinated rate for the bank flown. In the body frame, y left and
 * z up, a turn to the right is a negative r, and the coordinated rate is
 * -g sin(bank) cos(pitch) / V, where sin(bank) cos(pitch) is the world up
 * axis' body y component: no trigonometry. The speed is floored so a hand
 * held aircraft does not ask for an infinite rate. */
static double yaw_coordinated(const FixedWingParams *fw, const SimState *s, double V) {
  const double w = s->quat[0], x = s->quat[1], y = s->quat[2], z = s->quat[3];
  const double up_y = 2.0 * (y * z + w * x);
  const double Vf = V > 5.0 ? V : 5.0;
  const double r_coord = -PLANT.gravity * SIM_GRAVITY * up_y / Vf;
  return fw->yaw_coord_k * (s->omega[2] - r_coord);
}

void plant_wing_surfaces(double out[2]) {
  out[0] = g_surf[0];
  out[1] = g_surf[1];
}

void plant_plane_surfaces(double out[4]) {
  for (int i = 0; i < 4; i += 1) {
    out[i] = g_surf[i];
  }
}

/* A hand throw: the given speed along the body's own forward axis. */
void plant_wing_launch(SimState *s, double speed) {
  const double fwd[3] = { speed, 0.0, 0.0 };
  double v[3];
  wquat_rotate(s->quat, fwd, v);
  s->vel[0] = v[0];
  s->vel[1] = v[1];
  s->vel[2] = v[2];
}

void plant_wing_step(SimState *s, const double rc[4]) {
  const FixedWingParams *fw = PLANT.fw;
  double roll = rc[0];
  double pitch = rc[1];
  double yaw = rc[2];
  const double throttle = rc[3];

  /* Relative wind in the body frame. No wind in the world yet. */
  double vb[3];
  wquat_rotate_inv(s->quat, s->vel, vb);
  const double u = vb[0], v = vb[1], w = vb[2];
  const double V2 = u * u + v * v + w * w;
  const double V = sim_sqrt(V2);

  if (g_stab == 2) {
    acro_sticks(fw, s, &roll, &pitch);
    yaw = clamp1(add_term(yaw, yaw_coordinated(fw, s, V)));
  } else if (g_stab == 1) {
    double pitch_att, bank;
    wing_attitude(s->quat, &pitch_att, &bank);
    const double bank_t = fw->stab_bank_max * deadband1(roll, fw->stab_deadband);
    const double pitch_t = fw->stab_trim_pitch + fw->stab_pitch_max * deadband1(pitch, fw->stab_deadband);
    roll = clamp1(-fw->stab_roll_kp * (bank - bank_t) - fw->stab_roll_kd * s->omega[0]);
    pitch = clamp1(fw->stab_pitch_kp * (pitch_t - pitch_att) - fw->stab_pitch_kd * (-s->omega[1]));
    yaw = clamp1(add_term(yaw, yaw_coordinated(fw, s, V)));
  }

  /*
   * Surfaces. Roll right needs the right surface up and the left one down.
   * The rudder is trailing edge left positive and the yaw stick nose right
   * positive, so full right stick is full negative rudder. Two mixes and
   * one branch, because they are two kinds of hardware: an elevon is one
   * surface doing pitch and roll and is clipped as one, a tail's surfaces
   * are separate.
   */
  const double de = surface_from_stick(pitch, fw->throw_e, fw->expo);
  const double da = surface_from_stick(roll, fw->throw_a, fw->expo);
  const double delta_r = -surface_from_stick(yaw, fw->throw_r, fw->expo);
  double delta_e;
  if (fw->mix == FW_MIX_ELEVON) {
    g_surf[0] = clip(de - da, fw->surface_max);
    g_surf[1] = clip(de + da, fw->surface_max);
    g_surf[2] = 0.0;
    g_surf[3] = 0.0;
    /* What the aero sees of two elevons: their mean. */
    delta_e = 0.5 * (g_surf[0] + g_surf[1]);
  } else {
    g_surf[0] = -da;
    g_surf[1] = da;
    g_surf[2] = de;
    g_surf[3] = delta_r;
    delta_e = de;
  }
  const double delta_a = 0.5 * (g_surf[1] - g_surf[0]);

  const double Vxz = sim_sqrt(u * u + w * w);
  /* Angle of attack of the zero lift line, which is the body's on the wing. */
  const double alpha = (Vxz > 1e-6 ? sim_atan2(-w, u) : 0.0) - fw->alpha_zl;
  const double beta = V > 1e-6 ? sim_atan2(-v, Vxz) : 0.0; /* wind from the right positive */
  const double qbar = 0.5 * PLANT.rho * V2;
  const double Vrate = V > 1.0 ? V : 1.0; /* floor for the rate terms */

  /* Lift and drag coefficients, with the stall blend. */
  const double alpha_stall = fw->cl_max / fw->cl_alpha;
  const double aa = sim_fabs(alpha);
  const double sigma = smoothstep(alpha_stall - fw->stall_blend, alpha_stall + fw->stall_blend, aa);
  const double cl_lin = fw->cl_alpha * alpha + fw->cl_de * delta_e;
  double sin_b = 0.0, cos_b = 1.0;
  if (Vxz > 0.5) {
    sin_b = -w / Vxz;
    cos_b = u / Vxz;
  }
  /* The flat plate after the stall, at the zero lift line's angle. */
  const double sin_a = add_term(sin_b * fw->cos_zl, -(cos_b * fw->sin_zl));
  const double cos_a = add_term(cos_b * fw->cos_zl, sin_b * fw->sin_zl);
  const double cl_flat = 2.0 * sin_a * cos_a;
  const double cd_lin = fw->cd0 + fw->k_induced * cl_lin * cl_lin;
  const double cd_flat = fw->cd0 + 2.0 * sin_a * sin_a;
  const double CL = (1.0 - sigma) * cl_lin + sigma * cl_flat;
  const double CD = (1.0 - sigma) * cd_lin + sigma * cd_flat;

  /* Forces in the body frame. */
  double F[3] = { 0.0, 0.0, 0.0 };
  if (V > 1e-6) {
    const double L = qbar * fw->area * CL;
    const double D = qbar * fw->area * CD;
    const double Y = add_term(qbar * fw->area * fw->cy_beta * beta, qbar * fw->area * fw->cy_dr * delta_r);
    /* Lift is perpendicular to the wind in the x z plane, up in level flight. */
    if (Vxz > 1e-6) {
      F[0] += L * (-w / Vxz);
      F[2] += L * (u / Vxz);
    }
    F[0] -= D * u / V;
    F[1] -= D * v / V;
    F[2] -= D * w / V;
    F[1] -= Y; /* aero y is right, body y is left */
  }

  /* The motor: thrust along body x, falling with the forward airspeed. */
  double duty = throttle;
  if (duty < fw->duty_min) duty = fw->duty_min;
  if (duty > 1.0) duty = 1.0;
  const double u_pos = u > 0.0 ? u : 0.0;
  double thrust = fw->thrust_static * duty * duty * (1.0 - u_pos / (fw->pitch_speed * duty));
  if (thrust < 0.0) thrust = 0.0;
  F[0] += thrust;
  const double rpm = 0.85 * duty * fw->rpm_no_load;
  s->motor_omega[0] = rpm * 2.0 * WING_PI / 60.0;
  s->motor_omega[1] = 0.0;
  s->motor_omega[2] = 0.0;
  s->motor_omega[3] = 0.0;
  s->pack_current = fw->current_full * duty * duty;
  s->vbat_load = PLANT.cells * (s->cell_voltage_oc - s->pack_current * PLANT.r_cell);

  /* Moments, in the aero convention, then into the body frame. */
  const double p = s->omega[0];
  const double q_aero = -s->omega[1]; /* nose up positive */
  const double r_aero = -s->omega[2]; /* nose right positive */
  const double b2v = fw->span / (2.0 * Vrate);
  const double c2v = fw->chord / (2.0 * Vrate);
  double cl_sum = fw->cl_beta * beta + fw->cl_p * p * b2v + fw->cl_da * delta_a;
  cl_sum = add_term(cl_sum, fw->cl_r_per_cl * CL * r_aero * b2v);
  cl_sum = add_term(cl_sum, fw->cl_dr * delta_r);
  double cn_sum = fw->cn_beta * beta + fw->cn_r * r_aero * b2v;
  cn_sum = add_term(cn_sum, fw->cn_p_per_cl * CL * p * b2v);
  cn_sum = add_term(cn_sum, fw->cn_da_per_cl * CL * delta_a);
  cn_sum = add_term(cn_sum, fw->cn_dr * delta_r);
  const double l_aero = qbar * fw->area * fw->span * cl_sum;
  const double m_aero = qbar * fw->area * fw->chord * (fw->cm_0 + fw->cm_alpha * alpha + fw->cm_q * q_aero * c2v +
                                                       fw->cm_de * delta_e);
  const double n_aero = qbar * fw->area * fw->span * cn_sum;
  double M[3];
  M[0] = l_aero - fw->torque_arm * thrust; /* the prop turns one way; the airframe answers the other */
  M[1] = -m_aero;
  M[2] = -n_aero;

  /* Rates: I omega_dot = M - omega x (I omega), diagonal inertia. */
  const double Ix = PLANT.inertia[0], Iy = PLANT.inertia[1], Iz = PLANT.inertia[2];
  const double qb = s->omega[1], r = s->omega[2];
  const double hx = Ix * p, hy = Iy * qb, hz = Iz * r;
  const double gyro[3] = { qb * hz - r * hy, r * hx - p * hz, p * hy - qb * hx };
  s->omega[0] += (M[0] - gyro[0]) / Ix * WING_DT;
  s->omega[1] += (M[1] - gyro[1]) / Iy * WING_DT;
  s->omega[2] += (M[2] - gyro[2]) / Iz * WING_DT;

  /* Attitude: quaternion increment from the body rates, small angle. */
  const double wx = s->omega[0] * WING_DT, wy = s->omega[1] * WING_DT, wz = s->omega[2] * WING_DT;
  const double ang = sim_sqrt(wx * wx + wy * wy + wz * wz);
  if (ang > 1e-12) {
    const double half = 0.5 * ang;
    const double sh = sim_sin_small(half), ch = sim_cos_small(half);
    const double dq[4] = { ch, sh * wx / ang, sh * wy / ang, sh * wz / ang };
    double q2[4];
    wquat_mul(s->quat, dq, q2);
    const double n = sim_sqrt(q2[0] * q2[0] + q2[1] * q2[1] + q2[2] * q2[2] + q2[3] * q2[3]);
    s->quat[0] = q2[0] / n;
    s->quat[1] = q2[1] / n;
    s->quat[2] = q2[2] / n;
    s->quat[3] = q2[3] / n;
  }

  g_debug[0] = alpha; g_debug[1] = beta; g_debug[2] = qbar; g_debug[3] = CL; g_debug[4] = CD;
  g_debug[5] = l_aero; g_debug[6] = m_aero; g_debug[7] = n_aero; g_debug[8] = thrust;
  g_debug[9] = F[0]; g_debug[10] = F[1]; g_debug[11] = F[2];
  g_debug[12] = M[0]; g_debug[13] = M[1]; g_debug[14] = M[2];
  g_debug[15] = u; g_debug[16] = v; g_debug[17] = w; g_debug[18] = delta_e; g_debug[19] = delta_a;

  /* Velocity and position, semi implicit. */
  double Fw[3];
  wquat_rotate(s->quat, F, Fw);
  const double inv_m = 1.0 / PLANT.mass_kg;
  s->vel[0] += Fw[0] * inv_m * WING_DT;
  s->vel[1] += Fw[1] * inv_m * WING_DT;
  s->vel[2] += (Fw[2] * inv_m - PLANT.gravity * SIM_GRAVITY) * WING_DT; /* the weight slider scales it, as for the quad */
  s->pos[0] += s->vel[0] * WING_DT;
  s->pos[1] += s->vel[1] * WING_DT;
  s->pos[2] += s->vel[2] * WING_DT;
}

/*
 * THE AIRCRAFT. One table each, selected through PlantParams.fw.
 */

/* The 1000 mm flying wing, docs/WING-STAGE1.md, table by table. Each value
 * is written as the expression it was before this file had tables, so the
 * compiler folds it to the same double. */
const FixedWingParams FW_WING1000 = {
  .mix = FW_MIX_ELEVON,
  .span = 1.0,
  .area = 0.22,
  .chord = 0.22,
  .cl_alpha = 4.36,       /* per rad, Helmbold at AR 4.55 */
  .cl_max = 0.90,
  .alpha_zl = 0.0,        /* a reflexed section: zero lift on the body axis */
  .sin_zl = 0.0,
  .cos_zl = 1.0,
  .cd0 = 0.030,
  .k_induced = 0.0875,    /* 1/(pi e AR) */
  .cl_de = -0.35,         /* elevon lift, per rad: trailing edge up sheds lift */
  .cy_beta = -0.30,
  .cl_beta = -0.05,
  .cl_p = -0.40,
  .cl_da = 0.10,
  .cm_0 = 0.02,           /* reflex */
  .cm_alpha = -0.30,
  .cm_q = -4.0,
  .cm_de = 0.60,          /* delta_e positive pitches the nose up */
  .cn_beta = 0.05,        /* winglets */
  .cn_r = -0.10,
  .stall_blend = 3.0 * WING_PI / 180.0,
  /* The throws. A real 1000 mm wing is set up with far less elevator than
   * aileron: with a static margin of seven percent, twenty five degrees of
   * up puts the trim angle well past the stall, and a sixth of that stick
   * at throw speed pitched the plant to sixty degrees and dropped a wing.
   * Twelve degrees of elevator is the usual setup figure and still stalls
   * at full stick; roll keeps the full twenty five the roll rate band was
   * derived with. Each elevon is clipped at the aileron throw. No rudder,
   * so the yaw stick moves nothing. */
  .throw_a = 25.0 * WING_PI / 180.0,
  .throw_e = 12.0 * WING_PI / 180.0,
  .throw_r = 0.0,
  .surface_max = 25.0 * WING_PI / 180.0,
  .expo = 0.30,
  .thrust_static = 11.5,  /* N */
  .pitch_speed = 29.8,    /* m/s at full duty */
  .rpm_no_load = 20720.0,
  /* Prop reaction as a roll moment per newton of thrust. Ideal disc power
   * at static full thrust is T^1.5 / sqrt(2 rho A): 11.5 N through a 6 inch
   * disc is 184 W, at 17,600 rpm a torque of 0.10 N m, so 0.009 m per N.
   * The first figure here was 0.02, which rolled a thrown wing past sixty
   * degrees in four seconds with the sticks centred. */
  .torque_arm = 0.009,
  .current_full = 28.0,   /* A at static full thrust */
  .duty_min = 0.02,
  .stab_bank_max = 60.0 * WING_PI / 180.0,
  .stab_pitch_max = 30.0 * WING_PI / 180.0,
  .stab_trim_pitch = 2.0 * WING_PI / 180.0,
  /* A gimbal does not centre exactly, and in a hold a few percent of stick
   * is a few degrees of bank, which is a turn. Inside this the stick is
   * centred; outside it the target starts from zero, so there is no step. */
  .stab_deadband = 0.04,
  .stab_roll_kp = 1.2,    /* stick per rad of bank error */
  .stab_roll_kd = 0.12,   /* stick per rad/s of roll rate */
  .stab_pitch_kp = 5.0,   /* stick per rad of pitch error, through the 12 degree throw */
  .stab_pitch_kd = 0.5,   /* stick per rad/s of pitch rate */
  .acro_roll_rate = 200.0 * WING_PI / 180.0,  /* rad/s at full stick */
  .acro_pitch_rate = 100.0 * WING_PI / 180.0, /* rad/s at full stick, nose up */
  .acro_expo = 0.30,
  .acro_err_max = 5.0 * WING_PI / 180.0,
  .acro_roll_kp = 3.0,    /* stick per rad of roll error */
  .acro_roll_kd = 0.25,   /* stick per rad/s of roll rate error */
  .acro_roll_ff = 0.30,   /* stick per rad/s asked for */
  .acro_pitch_kp = 5.0,   /* stick per rad of pitch error, through the 12 degree throw */
  .acro_pitch_kd = 0.5,   /* stick per rad/s of pitch rate error */
  .acro_pitch_ff = 0.40,  /* stick per rad/s asked for */
  /* The integral is what makes a held bank stay held: a banked wing rolls
   * on its own through sideslip, and a proportional loop answers a steady
   * moment only with a steady error, which is a slow drift. Clamped so a
   * wing held off target on the ground or in a stall does not wind it up. */
  .acro_roll_ki = 4.0,    /* stick per rad s of roll error */
  .acro_pitch_ki = 8.0,   /* stick per rad s of pitch error */
  .acro_i_max = 0.30,     /* stick */
  .yaw_coord_k = 0.0,     /* no rudder */
};

/* The Skyhunter 1800, docs/SKYHUNTER-STAGE1.md, where each number has its
 * formula and source and the estimated ones say so. */
const FixedWingParams FW_SKY1800 = {
  .mix = FW_MIX_TAIL,
  .span = 1.80,
  .area = 0.36,
  .chord = 0.20,
  .cl_alpha = 5.52,       /* wing and tail, Nelson eq. 2.52 */
  .cl_max = 1.10,
  /* The zero lift line 4 degrees under the body axis: incidence and a
   * cambered section. sin and cos of minus 4 degrees, to 17 digits. */
  .alpha_zl = -4.0 * WING_PI / 180.0,
  .sin_zl = -0.069756473744125302,
  .cos_zl = 0.99756405025982420,
  .cd0 = 0.033,
  .k_induced = 0.0442,    /* 1/(pi 0.8 9) */
  .cl_de = -0.36,         /* trailing edge up pushes the tail down */
  .cy_beta = -0.45,
  .cy_dr = 0.20,
  .cl_beta = -0.096,      /* dihedral, the high wing and the fins */
  .cl_p = -0.78,
  .cl_da = 0.33,
  .cl_r_per_cl = 0.25,
  .cl_dr = 0.011,
  .cm_0 = 0.071,          /* trims at 15 m/s with the elevator neutral */
  .cm_alpha = -0.94,      /* static margin 0.17 */
  .cm_q = -14.1,
  .cm_de = 1.23,
  .cn_beta = 0.140,
  .cn_r = -0.126,
  .cn_p_per_cl = -0.125,
  .cn_da_per_cl = -0.112,
  .cn_dr = -0.077,
  .stall_blend = 3.0 * WING_PI / 180.0,
  .throw_a = 15.0 * WING_PI / 180.0,
  .throw_e = 15.0 * WING_PI / 180.0,
  .throw_r = 25.0 * WING_PI / 180.0,
  .surface_max = 15.0 * WING_PI / 180.0,
  .expo = 0.30,
  .thrust_static = 27.0,  /* N, 950 kV on 4S with an 11 x 5.5 */
  .pitch_speed = 27.8,
  .rpm_no_load = 14060.0,
  .torque_arm = 0.0107,   /* 362 W of disc power at 11,950 rpm is 0.29 N m at 27 N */
  .current_full = 43.0,
  .duty_min = 0.02,
  .stab_bank_max = 60.0 * WING_PI / 180.0,
  .stab_pitch_max = 30.0 * WING_PI / 180.0,
  .stab_trim_pitch = 2.0 * WING_PI / 180.0,
  .stab_deadband = 0.04,
  .stab_roll_kp = 2.0,
  .stab_roll_kd = 0.2,
  .stab_pitch_kp = 5.0,
  .stab_pitch_kd = 0.5,
  .acro_roll_rate = 120.0 * WING_PI / 180.0,
  .acro_pitch_rate = 80.0 * WING_PI / 180.0,
  .acro_expo = 0.30,
  .acro_err_max = 5.0 * WING_PI / 180.0,
  .acro_roll_kp = 5.0,
  .acro_roll_kd = 0.4,
  .acro_roll_ff = 0.5,
  .acro_pitch_kp = 5.0,
  .acro_pitch_kd = 0.5,
  .acro_pitch_ff = 0.40,
  .acro_roll_ki = 6.0,
  .acro_pitch_ki = 8.0,
  .acro_i_max = 0.30,
  .yaw_coord_k = 1.0,
};
