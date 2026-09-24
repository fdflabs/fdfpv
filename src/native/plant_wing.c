/*
 * plant_wing.c: a 1000 mm flying wing, flown by hand.
 *
 * The second plant. A six degree of freedom rigid body in the quad's
 * frames (world Z up, body X forward Y left Z up, SI, 1 ms steps) with
 * lift, drag and pitching moment from angle of attack and sideslip, a
 * smooth stall, two elevons driven straight from the sticks through rates
 * and expo, and one pusher motor whose thrust falls off with airspeed.
 * There is no flight controller in the loop: Betaflight 4.5 has no wing
 * support, and a wing in manual mode is what many pilots fly.
 *
 * Every number comes from docs/WING-STAGE1.md, which derives it from
 * published figures and says which are estimated. The eleven bands in
 * scripts/wing-gates.js are what this file has to land in.
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

/* The aircraft. docs/WING-STAGE1.md, table by table. */
static const double W_SPAN = 1.0;          /* m */
static const double W_AREA = 0.22;         /* m^2 */
static const double W_CHORD = 0.22;        /* m */
static const double W_RHO = 1.225;         /* kg/m^3 */
static const double W_CL_ALPHA = 4.36;     /* per rad, Helmbold at AR 4.55 */
static const double W_CL_MAX = 0.90;
static const double W_CD0 = 0.030;
static const double W_K_INDUCED = 0.0875;  /* 1/(pi e AR) */
static const double W_CL_DE = -0.35;       /* elevon lift, per rad: trailing edge up sheds lift */
static const double W_CY_BETA = -0.30;
static const double W_CL_BETA = -0.05;
static const double W_CL_P = -0.40;
static const double W_CL_DA = 0.10;
static const double W_CM_0 = 0.02;         /* reflex */
static const double W_CM_ALPHA = -0.30;
static const double W_CM_Q = -4.0;
static const double W_CM_DE = 0.60;        /* delta_e positive pitches the nose up */
static const double W_CN_BETA = 0.05;      /* winglets */
static const double W_CN_R = -0.10;
static const double W_STALL_BLEND = 3.0 * WING_PI / 180.0; /* half width of the blend */
/* The throws. A real 1000 mm wing is set up with far less elevator than
 * aileron: with a static margin of seven percent, twenty five degrees of
 * up puts the trim angle well past the stall, and a sixth of that stick
 * at throw speed pitched the plant to sixty degrees and dropped a wing.
 * Twelve degrees of elevator is the usual setup figure and still stalls
 * at full stick; roll keeps the full twenty five the roll rate band was
 * derived with. Each elevon is clipped at the aileron throw. */
static const double W_SURFACE_MAX = 25.0 * WING_PI / 180.0;
static const double W_ELEVATOR_MAX = 12.0 * WING_PI / 180.0;
static const double W_EXPO = 0.30;
static const double W_THRUST_STATIC = 11.5;   /* N */
static const double W_PITCH_SPEED = 29.8;     /* m/s at full duty */
static const double W_RPM_NO_LOAD = 20720.0;
/* Prop reaction as a roll moment per newton of thrust. Ideal disc power
 * at static full thrust is T^1.5 / sqrt(2 rho A): 11.5 N through a 6 inch
 * disc is 184 W, at 17,600 rpm a torque of 0.10 N m, so 0.009 m per N.
 * The first figure here was 0.02, which rolled a thrown wing past sixty
 * degrees in four seconds with the sticks centred. */
static const double W_TORQUE_ARM = 0.009;
static const double W_CURRENT_FULL = 28.0;    /* A at static full thrust */
static const double W_DUTY_MIN = 0.02;

/* The elevons this step, radians, positive trailing edge up (nose up). */
static double g_elevon_left = 0.0;
static double g_elevon_right = 0.0;

/*
 * THE STABILISER, which is the one flight controller a wing gets here.
 * Betaflight has no wing mode, so this is not a port and not a
 * reimplementation of one: it is the attitude loop the harness pilot
 * flies the gates with, in C, so it is deterministic and never touches
 * JS maths. Off, the sticks are the elevons. On, the roll stick asks for
 * a bank and the pitch stick for a pitch, both held by a rate damped
 * proportional loop, and centred sticks hold the wing level with a
 * little nose up trim. Set from the shell by the tune; a reset keeps it.
 */
static int g_stab = 0;
static const double W_STAB_BANK_MAX = 60.0 * WING_PI / 180.0;
static const double W_STAB_PITCH_MAX = 30.0 * WING_PI / 180.0;
static const double W_STAB_TRIM_PITCH = 2.0 * WING_PI / 180.0;
static const double W_STAB_ROLL_KP = 1.2;   /* stick per rad of bank error */
static const double W_STAB_ROLL_KD = 0.12;  /* stick per rad/s of roll rate */
static const double W_STAB_PITCH_KP = 5.0;  /* stick per rad of pitch error, through the 12 degree throw */
static const double W_STAB_PITCH_KD = 0.5;  /* stick per rad/s of pitch rate */

/* What the last step saw and did, for the gates and for anyone chasing a
 * sign: alpha, beta, qbar, CL, CD, l m n (aero), thrust, F body x y z,
 * M body x y z, u v w. */
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

/* Stick to surface: 25 degrees at full stick, with expo, clipped. */
static double surface_from_stick(double x, double throw_max) {
  if (x > 1.0) {
    x = 1.0;
  } else if (x < -1.0) {
    x = -1.0;
  }
  const double shaped = x * x * x * W_EXPO + x * (1.0 - W_EXPO);
  double d = shaped * throw_max;
  if (d > throw_max) {
    d = throw_max;
  } else if (d < -throw_max) {
    d = -throw_max;
  }
  return d;
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

void plant_wing_set_stab(int on) {
  g_stab = on ? 1 : 0;
}

int plant_wing_stab(void) {
  return g_stab;
}

void plant_wing_reset(void) {
  g_elevon_left = 0.0;
  g_elevon_right = 0.0;
}

void plant_wing_surfaces(double out[2]) {
  out[0] = g_elevon_left;
  out[1] = g_elevon_right;
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
  double roll = rc[0];
  double pitch = rc[1];
  const double throttle = rc[3];

  if (g_stab) {
    double pitch_att, bank;
    wing_attitude(s->quat, &pitch_att, &bank);
    const double bank_t = W_STAB_BANK_MAX * clamp1(roll);
    const double pitch_t = W_STAB_TRIM_PITCH + W_STAB_PITCH_MAX * clamp1(pitch);
    roll = clamp1(-W_STAB_ROLL_KP * (bank - bank_t) - W_STAB_ROLL_KD * s->omega[0]);
    pitch = clamp1(W_STAB_PITCH_KP * (pitch_t - pitch_att) - W_STAB_PITCH_KD * (-s->omega[1]));
  }

  /* Surfaces. Roll right needs the right elevon up and the left one down. */
  const double de = surface_from_stick(pitch, W_ELEVATOR_MAX);
  const double da = surface_from_stick(roll, W_SURFACE_MAX);
  g_elevon_left = de - da;
  g_elevon_right = de + da;
  if (g_elevon_left > W_SURFACE_MAX) g_elevon_left = W_SURFACE_MAX;
  if (g_elevon_left < -W_SURFACE_MAX) g_elevon_left = -W_SURFACE_MAX;
  if (g_elevon_right > W_SURFACE_MAX) g_elevon_right = W_SURFACE_MAX;
  if (g_elevon_right < -W_SURFACE_MAX) g_elevon_right = -W_SURFACE_MAX;
  /* What the aero sees: the mean and the difference of the two. */
  const double delta_e = 0.5 * (g_elevon_left + g_elevon_right);
  const double delta_a = 0.5 * (g_elevon_right - g_elevon_left);

  /* Relative wind in the body frame. No wind in the world yet. */
  double vb[3];
  wquat_rotate_inv(s->quat, s->vel, vb);
  const double u = vb[0], v = vb[1], w = vb[2];
  const double V2 = u * u + v * v + w * w;
  const double V = sim_sqrt(V2);
  const double Vxz = sim_sqrt(u * u + w * w);
  const double alpha = Vxz > 1e-6 ? sim_atan2(-w, u) : 0.0;
  const double beta = V > 1e-6 ? sim_atan2(-v, Vxz) : 0.0; /* wind from the right positive */
  const double qbar = 0.5 * W_RHO * V2;
  const double Vrate = V > 1.0 ? V : 1.0; /* floor for the rate terms */

  /* Lift and drag coefficients, with the stall blend. */
  const double alpha_stall = W_CL_MAX / W_CL_ALPHA;
  const double aa = sim_fabs(alpha);
  const double sigma = smoothstep(alpha_stall - W_STALL_BLEND, alpha_stall + W_STALL_BLEND, aa);
  const double cl_lin = W_CL_ALPHA * alpha + W_CL_DE * delta_e;
  double sin_a = 0.0, cos_a = 1.0;
  if (Vxz > 0.5) {
    sin_a = -w / Vxz;
    cos_a = u / Vxz;
  }
  const double cl_flat = 2.0 * sin_a * cos_a;
  const double cd_lin = W_CD0 + W_K_INDUCED * cl_lin * cl_lin;
  const double cd_flat = W_CD0 + 2.0 * sin_a * sin_a;
  const double CL = (1.0 - sigma) * cl_lin + sigma * cl_flat;
  const double CD = (1.0 - sigma) * cd_lin + sigma * cd_flat;

  /* Forces in the body frame. */
  double F[3] = { 0.0, 0.0, 0.0 };
  if (V > 1e-6) {
    const double L = qbar * W_AREA * CL;
    const double D = qbar * W_AREA * CD;
    const double Y = qbar * W_AREA * W_CY_BETA * beta;
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
  if (duty < W_DUTY_MIN) duty = W_DUTY_MIN;
  if (duty > 1.0) duty = 1.0;
  const double u_pos = u > 0.0 ? u : 0.0;
  double thrust = W_THRUST_STATIC * duty * duty * (1.0 - u_pos / (W_PITCH_SPEED * duty));
  if (thrust < 0.0) thrust = 0.0;
  F[0] += thrust;
  const double rpm = 0.85 * duty * W_RPM_NO_LOAD;
  s->motor_omega[0] = rpm * 2.0 * WING_PI / 60.0;
  s->motor_omega[1] = 0.0;
  s->motor_omega[2] = 0.0;
  s->motor_omega[3] = 0.0;
  s->pack_current = W_CURRENT_FULL * duty * duty;
  s->vbat_load = PLANT.cells * (s->cell_voltage_oc - s->pack_current * PLANT.r_cell);

  /* Moments, in the aero convention, then into the body frame. */
  const double p = s->omega[0];
  const double q_aero = -s->omega[1]; /* nose up positive */
  const double r_aero = -s->omega[2]; /* nose right positive */
  const double b2v = W_SPAN / (2.0 * Vrate);
  const double c2v = W_CHORD / (2.0 * Vrate);
  const double l_aero = qbar * W_AREA * W_SPAN * (W_CL_BETA * beta + W_CL_P * p * b2v + W_CL_DA * delta_a);
  const double m_aero = qbar * W_AREA * W_CHORD * (W_CM_0 + W_CM_ALPHA * alpha + W_CM_Q * q_aero * c2v + W_CM_DE * delta_e);
  const double n_aero = qbar * W_AREA * W_SPAN * (W_CN_BETA * beta + W_CN_R * r_aero * b2v);
  double M[3];
  M[0] = l_aero - W_TORQUE_ARM * thrust; /* the prop turns one way; the airframe answers the other */
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
