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
 * docs/WING-STAGE1.md, with elevons and no rudder; FW_SKY1800, the
 * Skyhunter of docs/SKYHUNTER-STAGE1.md, with ailerons, an elevator and a
 * rudder on an H tail; and FW_CUB1400, the Piper J-3 Cub of
 * docs/CUB-STAGE1.md, the same surfaces behind a tractor prop, which adds
 * a thrust line off the CG and P factor; and FW_RADIAN2000, the E-flite
 * Radian Pro powered glider of docs/GLIDER-STAGE1.md, which adds a folding
 * prop and flies in rising air; and FW_BRAMOR2300, the C-Astral Bramor
 * C4EYE of docs/BRAMOR-STAGE1.md, a blended wing body with elevons that
 * brings a recovery parachute. A term an airframe does not have
 * is zero in its table, and every term a later aircraft added is written
 * so that a zero leaves the earlier ones' arithmetic bit for bit what it
 * was: their gates and recorded trace hashes are the proof. The bands each
 * airframe has to land in are scripts/wing-gates.js,
 * scripts/skyhunter-gates.js, scripts/cub-gates.js,
 * scripts/glider-gates.js and scripts/bramor-gates.js.
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
/* Weight on wheels, from sim.c's gear. Always 0 on an airframe without. */
static int g_on_wheels = 0;
static double g_acro_i_roll = 0.0;
static double g_acro_i_pitch = 0.0;

/*
 * THE PARACHUTE, for an aircraft that recovers under one: the Bramor,
 * docs/BRAMOR-STAGE1.md. Pulled, it cuts the motor and centres the
 * surfaces, as the aircraft's own autopilot does, and hangs a canopy off
 * the risers' attachment point: a drag area that grows over chute_open_s
 * from the pull, acting against the air that point moves through, so its
 * offset from the CG is a pendulum that swings the aircraft under the
 * canopy and the point's own motion damps the swing. Stowed, none of it
 * runs. g_chute_t is the time since the pull.
 */
static int g_chute = 0;
static double g_chute_t = 0.0;

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

/*
 * THE RISING AIR. Three thermals over the airfield, each a column of air
 * going up, fastest at its core and smoothly nothing at its edge:
 * w0 (1 - (r/R)^2)^2, which has no kink anywhere, so a wing flying through
 * one feels a gust and not a step. The columns stand still (there is no
 * wind to drift them) and never change, so the field is a function of
 * position alone and a replay meets exactly the air it met before. They
 * start a few metres off the ground, are whole by 40 m, and fade out
 * between 250 and 300 m, the base of the cloud they would be feeding, so a
 * glider can climb in one but not for ever. There is no sink round them:
 * the air between is still. The sizes and strengths are a small field's
 * afternoon, docs/GLIDER-STAGE1.md; the places are in the plant's world
 * frame, whose origin the shell puts at the map's spawn facing +x: on the
 * airfield that is the strip's south end facing up it, so the runway runs
 * along x from -8 to 112 m and the pylons stand along y = -70, and the
 * three cores are clear of both.
 *
 * Only an airframe whose table sets air_lift flies in it. Every other one
 * flies in still air, as it always has, so its trace is untouched.
 */
typedef struct {
  double x, y; /* core, world frame, m */
  double r;    /* radius where the rise has died away, m */
  double w0;   /* rise at the core, m/s */
} Thermal;
static const Thermal THERMALS[] = {
  { 110.0, 70.0, 45.0, 2.5 },
  { -140.0, -90.0, 40.0, 2.0 },
  { 60.0, -170.0, 35.0, 1.6 },
};
#define THERMAL_COUNT ((int)(sizeof(THERMALS) / sizeof(THERMALS[0])))
#define THERMAL_FORM_LO 5.0
#define THERMAL_FORM_HI 40.0
#define THERMAL_TOP_LO 250.0
#define THERMAL_TOP_HI 300.0

double plant_air_lift(const double pos[3]) {
  const double fade = smoothstep(THERMAL_FORM_LO, THERMAL_FORM_HI, pos[2]) *
                      (1.0 - smoothstep(THERMAL_TOP_LO, THERMAL_TOP_HI, pos[2]));
  if (!(fade > 0.0)) {
    return 0.0;
  }
  double w = 0.0;
  for (int i = 0; i < THERMAL_COUNT; i += 1) {
    const double dx = pos[0] - THERMALS[i].x;
    const double dy = pos[1] - THERMALS[i].y;
    const double f = 1.0 - (dx * dx + dy * dy) / (THERMALS[i].r * THERMALS[i].r);
    if (f > 0.0) {
      w += THERMALS[i].w0 * f * f;
    }
  }
  return w * fade;
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

void plant_wing_set_on_wheels(int on) {
  g_on_wheels = on;
}

void plant_wing_reset(void) {
  for (int i = 0; i < 4; i += 1) {
    g_surf[i] = 0.0;
  }
  g_acro_held = 0;
  g_on_wheels = 0;
  g_chute = 0;
  g_chute_t = 0.0;
}

int plant_wing_chute(int deploy) {
  if (!deploy) {
    g_chute = 0;
    g_chute_t = 0.0;
    return 0;
  }
  if (PLANT.kind != PLANT_KIND_WING || !(PLANT.fw->chute_cda > 0.0)) {
    return -1;
  }
  if (!g_chute) {
    g_chute = 1;
    g_chute_t = 0.0;
    g_acro_held = 0;
  }
  return 0;
}

double plant_wing_chute_open(void) {
  if (!g_chute) {
    return 0.0;
  }
  return smoothstep(0.0, PLANT.fw->chute_open_s, g_chute_t);
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

/* A hand throw or a catapult: the given speed along the body's own
 * forward axis. A launch is a new flight, so Acro takes its target from
 * the attitude it is launched at rather than from wherever the aircraft
 * last flew: off a rail pitched up, holding the rail's angle, not diving
 * for the level it sat at before it was put on the rail. Every recorded
 * launch comes straight after a reset, where the target is already
 * clear, so none of them moves. */
void plant_wing_launch(SimState *s, double speed) {
  g_acro_held = 0;
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

  /* Relative wind in the body frame: still air, or for an airframe that
   * flies in it, the thermals' rise, which is a wind from below. */
  double vb[3];
  if (fw->air_lift) {
    const double va[3] = { s->vel[0], s->vel[1], s->vel[2] - plant_air_lift(s->pos) };
    wquat_rotate_inv(s->quat, va, vb);
  } else {
    wquat_rotate_inv(s->quat, s->vel, vb);
  }
  const double u = vb[0], v = vb[1], w = vb[2];
  const double V2 = u * u + v * v + w * w;
  const double V = sim_sqrt(V2);

  /* On its wheels a stabiliser has nothing to hold: the gear holds the
   * attitude, so an attitude loop would only wind its error up against the
   * ground and let it go at liftoff, and the turn coordinator would fight
   * the tailwheel the pilot steers with. So the sticks are the surfaces
   * there, in every mode, and Acro takes its target afresh each step, which
   * leaves it holding the attitude the aircraft leaves the ground in. */
  if (g_chute) {
    /* Under the canopy the autopilot has let go: surfaces centred. */
    roll = 0.0;
    pitch = 0.0;
    yaw = 0.0;
  } else if (g_on_wheels && g_stab != 0) {
    g_acro_held = 0;
  } else if (g_stab == 2) {
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
  /* A folding prop under its throttle is stopped and folded: no thrust,
   * no rpm, no current. Open, it brakes past its pitch speed rather than
   * stopping at zero. A fixed prop stops at zero. */
  const int folded = fw->fold_duty > 0.0 && throttle < fw->fold_duty;
  if (folded) {
    thrust = 0.0;
  } else if (fw->fold_duty == 0.0 && thrust < 0.0) {
    thrust = 0.0;
  }
  if (g_chute) thrust = 0.0; /* the motor is cut with the pull */
  F[0] += thrust;
  const double rpm = (folded || g_chute) ? 0.0 : 0.85 * duty * fw->rpm_no_load;
  s->motor_omega[0] = rpm * 2.0 * WING_PI / 60.0;
  s->motor_omega[1] = 0.0;
  s->motor_omega[2] = 0.0;
  s->motor_omega[3] = 0.0;
  s->pack_current = (folded || g_chute) ? 0.0 : fw->current_full * duty * duty;
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
  /* A thrust line off the CG pitches with power, (0, z, 0) x (T, 0, 0).
   * P factor: at an angle of attack the descending blade meets the air
   * harder than the rising one, which moves the thrust off the axis toward
   * it by a distance that grows with the inflow across the disc, V sin
   * alpha = -w, over the blade speed. Both are zero on an airframe whose
   * table leaves them out, and add_term keeps its arithmetic as it was. */
  M[1] = add_term(-m_aero, fw->thrust_z * thrust);
  M[2] = -n_aero;
  /* A folded prop is not turning, and 0/0 would be a NaN, not a zero; nor
   * is a prop whose motor the chute has cut. */
  if (s->motor_omega[0] > 0.0) {
    M[2] = add_term(M[2], fw->pfactor * thrust * -w / s->motor_omega[0]);
  }

  /* The canopy: drag against the air the risers' attachment point moves
   * through, the body's velocity plus omega x r there, applied at that
   * point. Quadratic in that speed, like every other drag here. */
  if (g_chute) {
    g_chute_t += WING_DT;
    const double open = smoothstep(0.0, fw->chute_open_s, g_chute_t);
    const double *ra = fw->chute_attach;
    const double *om = s->omega;
    const double va[3] = {
      u + (om[1] * ra[2] - om[2] * ra[1]),
      v + (om[2] * ra[0] - om[0] * ra[2]),
      w + (om[0] * ra[1] - om[1] * ra[0]),
    };
    const double vam = sim_sqrt(va[0] * va[0] + va[1] * va[1] + va[2] * va[2]);
    const double kc = -0.5 * PLANT.rho * fw->chute_cda * open * vam;
    const double Fc[3] = { kc * va[0], kc * va[1], kc * va[2] };
    F[0] += Fc[0];
    F[1] += Fc[1];
    F[2] += Fc[2];
    M[0] += ra[1] * Fc[2] - ra[2] * Fc[1];
    M[1] += ra[2] * Fc[0] - ra[0] * Fc[2];
    M[2] += ra[0] * Fc[1] - ra[1] * Fc[0];
  }

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

/* The FMS Piper J-3 Cub 1400 mm, docs/CUB-STAGE1.md, where each number has
 * its formula and source and the estimated ones say so. A tractor: the prop
 * is in the nose, turning clockwise seen from the cockpit, so its reaction
 * rolls the airframe left as the pushers' does, and its P factor yaws the
 * nose left at a positive angle of attack. */
const FixedWingParams FW_CUB1400 = {
  .mix = FW_MIX_TAIL,
  .span = 1.40,
  .area = 0.28,
  .chord = 0.20,
  .cl_alpha = 5.21,       /* wing and tail, Nelson eq. 2.52 */
  .cl_max = 1.15,
  /* The zero lift line 5 degrees under the body axis: a flat bottomed
   * section of the USA 35B class set at about 1.5 degrees of incidence.
   * sin and cos of minus 5 degrees, to 17 digits. */
  .alpha_zl = -5.0 * WING_PI / 180.0,
  .sin_zl = -0.08715574274765817,
  .cos_zl = 0.9961946980917455,
  .cd0 = 0.050,           /* struts, fixed gear, open cylinder heads */
  .k_induced = 0.0606,    /* 1/(pi 0.75 7) */
  .cl_de = -0.345,
  .cy_beta = -0.29,
  .cy_dr = 0.106,
  .cl_beta = -0.089,
  .cl_p = -0.81,
  .cl_da = 0.40,
  .cl_r_per_cl = 0.25,
  .cl_dr = 0.008,
  .cm_0 = 0.062,          /* trims at 12 m/s with the elevator neutral */
  .cm_alpha = -0.62,      /* static margin 0.12 at the manual's 60 mm CG */
  .cm_q = -7.7,
  .cm_de = 0.89,
  .cn_beta = 0.048,
  .cn_r = -0.076,
  .cn_p_per_cl = -0.125,
  .cn_da_per_cl = -0.136,
  .cn_dr = -0.043,
  .stall_blend = 3.0 * WING_PI / 180.0,
  /* The manual's high rates, 16, 16 and 18 mm, over the surfaces' chords. */
  .throw_a = 18.0 * WING_PI / 180.0,
  .throw_e = 15.0 * WING_PI / 180.0,
  .throw_r = 15.0 * WING_PI / 180.0,
  .surface_max = 18.0 * WING_PI / 180.0,
  .expo = 0.30,
  .thrust_static = 13.5,  /* N, 3536 850 kV on 3S with an 11 x 7 */
  .pitch_speed = 23.8,
  .rpm_no_load = 9435.0,
  .torque_arm = 0.0113,   /* 128 W of disc power at 8,020 rpm is 0.15 N m at 13.5 N */
  .thrust_z = 0.002,      /* the drawn model's thrust line, 2 mm over the CG */
  .pfactor = 1.6,         /* blade element at 0.75 R in a climb */
  .current_full = 27.0,
  .duty_min = 0.02,
  .stab_bank_max = 60.0 * WING_PI / 180.0,
  .stab_pitch_max = 30.0 * WING_PI / 180.0,
  .stab_trim_pitch = 2.0 * WING_PI / 180.0,
  .stab_deadband = 0.04,
  .stab_roll_kp = 1.2,
  .stab_roll_kd = 0.12,
  .stab_pitch_kp = 5.0,
  .stab_pitch_kd = 0.5,
  .acro_roll_rate = 120.0 * WING_PI / 180.0,
  .acro_pitch_rate = 80.0 * WING_PI / 180.0,
  .acro_expo = 0.30,
  .acro_err_max = 5.0 * WING_PI / 180.0,
  .acro_roll_kp = 3.0,
  .acro_roll_kd = 0.25,
  .acro_roll_ff = 0.35,
  .acro_pitch_kp = 5.0,
  .acro_pitch_kd = 0.5,
  .acro_pitch_ff = 0.40,
  .acro_roll_ki = 4.0,
  .acro_pitch_ki = 8.0,
  .acro_i_max = 0.30,
  .yaw_coord_k = 3.0,     /* a third of the Skyhunter's yaw authority per stick */
};

/* The E-flite Radian Pro, docs/GLIDER-STAGE1.md, where each number has its
 * formula and source and the estimated ones say so: the 2 m Radian's
 * published wing, fuselage and power system, with the Pro's ailerons. A
 * powered glider: a tractor prop that folds when the motor stops, and the
 * only airframe that flies in the thermals above. */
const FixedWingParams FW_RADIAN2000 = {
  .mix = FW_MIX_TAIL,
  .span = 2.00,
  .area = 0.355,
  .chord = 0.1866,        /* the mean aerodynamic chord of the drawn planform */
  .cl_alpha = 5.709,      /* wing and tail, Nelson eq. 2.52 */
  .cl_max = 1.05,
  /* The zero lift line 5 degrees under the body axis: a cambered glider
   * section at about 1.5 degrees of incidence. sin and cos of minus 5
   * degrees, to 17 digits. */
  .alpha_zl = -5.0 * WING_PI / 180.0,
  .sin_zl = -0.08715574274765817,
  .cos_zl = 0.9961946980917455,
  .cd0 = 0.021,           /* a clean foam glider, built up part by part */
  .k_induced = 0.03323,   /* 1/(pi 0.85 11.27) */
  .cl_de = -0.257,
  .cy_beta = -0.376,
  .cy_dr = 0.179,
  .cl_beta = -0.182,      /* the polyhedral, 7.3 degrees of it in effect, and the fin */
  .cl_p = -0.786,
  .cl_da = 0.334,
  .cl_r_per_cl = 0.25,
  .cl_dr = 0.0116,
  .cm_0 = 0.170,          /* trims at 7.7 m/s, the best glide, with the elevator neutral */
  .cm_alpha = -1.304,     /* static margin 0.23 at the manual's 63 mm CG */
  .cm_q = -14.6,
  .cm_de = 0.949,
  .cn_beta = 0.0967,
  .cn_r = -0.0719,
  .cn_p_per_cl = -0.125,
  .cn_da_per_cl = -0.114, /* long outboard ailerons: plenty of adverse yaw */
  .cn_dr = -0.0573,
  .stall_blend = 3.0 * WING_PI / 180.0,
  /* The manual's high rates, 12 mm of elevator and 40 mm of rudder, over
   * the surfaces' chords at the horn, 29 and 80 mm; the Pro's aileron
   * travel is not published and is a sailplane's usual 15 degrees. */
  .throw_a = 15.0 * WING_PI / 180.0,
  .throw_e = 24.4 * WING_PI / 180.0,
  .throw_r = 30.0 * WING_PI / 180.0,
  .surface_max = 15.0 * WING_PI / 180.0,
  .expo = 0.30,
  .thrust_static = 9.28,  /* N, a 480 960 kV on 3S with a 9.75 x 7.5 at 196 W */
  .pitch_speed = 28.76,
  .rpm_no_load = 10656.0,
  .torque_arm = 0.00994,  /* 82 W of disc power at 8,516 rpm is 0.092 N m at 9.28 N */
  .thrust_z = -0.008,     /* the drawn thrust line, 8 mm under the CG: power lifts the nose */
  .pfactor = 1.6,         /* the Cub's blade element figure, a tractor turning the same way */
  .current_full = 21.8,   /* A, measured on the same power system */
  .duty_min = 0.02,
  .stab_bank_max = 60.0 * WING_PI / 180.0,
  .stab_pitch_max = 30.0 * WING_PI / 180.0,
  /* Centred sticks glide at the trim: the best glide flies 0.6 degrees
   * nose down, so level on the stick is a little slower than that. */
  .stab_trim_pitch = 0.0,
  .stab_deadband = 0.04,
  .stab_roll_kp = 2.0,    /* the Skyhunter's: the same roll authority per stick */
  .stab_roll_kd = 0.2,
  .stab_pitch_kp = 5.0,
  .stab_pitch_kd = 0.5,
  .acro_roll_rate = 80.0 * WING_PI / 180.0,  /* a glider rolls at 77 deg/s at 12 m/s */
  .acro_pitch_rate = 60.0 * WING_PI / 180.0,
  .acro_expo = 0.30,
  .acro_err_max = 5.0 * WING_PI / 180.0,
  .acro_roll_kp = 5.0,
  .acro_roll_kd = 0.4,
  .acro_roll_ff = 0.7,    /* full aileron rolls 1.34 rad/s at 12 m/s */
  .acro_pitch_kp = 5.0,
  .acro_pitch_kd = 0.5,
  .acro_pitch_ff = 0.40,
  .acro_roll_ki = 6.0,
  .acro_pitch_ki = 8.0,
  .acro_i_max = 0.30,
  .yaw_coord_k = 1.5,     /* nine tenths of the Skyhunter's rudder, and more adverse yaw */
  .fold_duty = 0.05,
  .air_lift = 1,
};

/* The C-Astral Bramor C4EYE, docs/BRAMOR-STAGE1.md, where each number has
 * its formula and source and the estimated ones say so; scripts/
 * bramor-derive.js prints them. A 2.3 m blended wing body flying wing:
 * elevons and no rudder like the wing above, a pusher on a raised tail
 * cone, so its thrust line runs over the CG and pitches the nose down with
 * power, and a recovery parachute whose risers meet the belly just ahead
 * of the CG, so it hangs level on its back under the canopy. */
const FixedWingParams FW_BRAMOR2300 = {
  .mix = FW_MIX_ELEVON,
  .span = 2.30,
  .area = 0.591,          /* the drawn planform, pod included */
  .chord = 0.257,         /* S / b */
  .cl_alpha = 4.77,       /* Helmbold at AR 8.95, 21 deg of half chord sweep */
  .cl_max = 0.722,        /* the published 13 m/s stall at 4.5 kg */
  .alpha_zl = 0.0,        /* a reflexed section: zero lift on the body axis */
  .sin_zl = 0.0,
  .cos_zl = 1.0,
  .cd0 = 0.024,
  .k_induced = 0.0418,    /* 1/(pi 0.85 8.95) */
  .cl_de = -0.953,        /* both elevons, trailing edge up sheds lift */
  .cy_beta = -0.329,      /* the winglets and the pod */
  .cl_beta = -0.070,      /* sweep at the cruise CL and the winglets, less the root's anhedral */
  .cl_p = -0.522,
  .cl_da = 0.308,
  .cl_r_per_cl = 0.25,
  .cm_0 = 0.0533,         /* trims at 16 m/s, elevons neutral, cruise thrust */
  .cm_alpha = -0.420,     /* static margin 0.07 of the MAC */
  .cm_q = -4.0,
  .cm_de = 0.894,         /* delta_e positive pitches the nose up */
  .cn_beta = 0.0352,      /* the winglets, less the pod */
  .cn_r = -0.0297,
  .cn_p_per_cl = -0.125,
  .cn_da_per_cl = -0.062, /* adverse yaw, -0.2 Cl_da (Roskam) */
  .stall_blend = 3.0 * WING_PI / 180.0,
  /* The throws. Elevator: six degrees, the down that trims level inverted
   * at cruise; with 2.1 deg of angle of attack per deg of elevon, full up
   * is past the stall at any speed, as on the flying wing. Aileron: ten, a
   * survey wing's setup and a roll a little over 80 deg/s at cruise. Each
   * elevon clips at the sum. */
  .throw_a = 10.0 * WING_PI / 180.0,
  .throw_e = 6.0 * WING_PI / 180.0,
  .throw_r = 0.0,
  .surface_max = 16.0 * WING_PI / 180.0,
  .expo = 0.30,
  .thrust_static = 35.0,  /* N: the thrust that gives the published 5 m/s climb */
  .pitch_speed = 30.0,    /* m/s, 470 kV on 6S with a 12 x 8 */
  .rpm_no_load = 10434.0,
  .torque_arm = 0.0151,   /* 490 W of disc power at 8,870 rpm is 0.53 N m at 35 N */
  .thrust_z = 0.087,      /* the drawn hub over the CG */
  .current_full = 45.0,   /* A: about 1 kW on 6S */
  .duty_min = 0.02,
  .stab_bank_max = 45.0 * WING_PI / 180.0,
  .stab_pitch_max = 20.0 * WING_PI / 180.0,
  .stab_trim_pitch = 2.0 * WING_PI / 180.0,
  .stab_deadband = 0.04,
  .stab_roll_kp = 2.0,
  .stab_roll_kd = 0.2,
  .stab_pitch_kp = 6.0,
  .stab_pitch_kd = 0.6,
  .acro_roll_rate = 90.0 * WING_PI / 180.0,
  .acro_pitch_rate = 40.0 * WING_PI / 180.0,
  .acro_expo = 0.30,
  .acro_err_max = 5.0 * WING_PI / 180.0,
  .acro_roll_kp = 5.0,
  .acro_roll_kd = 0.4,
  .acro_roll_ff = 0.70,   /* the stick for a rate at cruise, pb/2V 0.103 */
  .acro_pitch_kp = 6.0,
  .acro_pitch_kd = 0.6,
  .acro_pitch_ff = 0.70,  /* the stick for a pull's pitch rate at cruise */
  .acro_roll_ki = 6.0,
  .acro_pitch_ki = 8.0,
  .acro_i_max = 0.30,
  .yaw_coord_k = 0.0,     /* no rudder */
  /* A 1.64 m round canopy, C_D 0.8, sized for 5.0 m/s under it with the
   * airframe's own flat plate drag; open in 1.2 s. The risers meet the
   * belly 60 mm under the CG and 64 mm ahead of it, where the canopy's
   * pull balances the airframe's pitching moment hanging flat on its back.
   * All ESTIMATED: C-Astral publishes none of it. */
  .chute_cda = 1.687,
  .chute_open_s = 1.2,
  .chute_attach = { 0.0642, 0.0, -0.060 },
};
