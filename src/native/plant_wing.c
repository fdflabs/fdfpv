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
 * a thrust line off the CG and P factor; FW_RADIAN2000, the E-flite
 * Radian Pro powered glider of docs/GLIDER-STAGE1.md, which adds a folding
 * prop and flies in rising air; FW_BRAMOR2300, the C-Astral Bramor
 * C4EYE of docs/BRAMOR-STAGE1.md, a blended wing body with elevons that
 * brings a recovery parachute; FW_SLOWSTICK1180, the GWS Slow Stick
 * of docs/SLOWSTICK-STAGE1.md, which has no ailerons and banks on its
 * rudder through its dihedral; and FW_TIMBER1500, the E-flite Turbo
 * Timber Evolution of docs/TIMBER-STAGE1.md, a STOL taildragger that adds
 * flaps and slats; and FW_TIMBER1500F and FW_CUB1400F, the Timber and the
 * Cub on floats, docs/FLOATS-STAGE1.md, whose water is sim.c's; and
 * FW_BOMBSHELL1118, BMJR's 1/2A Texaco Buzzard Bombshell of
 * docs/BOMBSHELL-STAGE1.md, the Slow Stick's three channels on a balsa
 * old timer, which adds a glow engine's throttle. A term an
 * airframe does not have
 * is zero in its table, and every term a later aircraft added is written
 * so that a zero leaves the earlier ones' arithmetic bit for bit what it
 * was: their gates and recorded trace hashes are the proof. The bands each
 * airframe has to land in are scripts/wing-gates.js,
 * scripts/skyhunter-gates.js, scripts/cub-gates.js,
 * scripts/glider-gates.js, scripts/bramor-gates.js,
 * scripts/slowstick-gates.js, scripts/timber-gates.js and
 * scripts/bombshell-gates.js.
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
/* A tailless wing and fuselage, for an aircraft whose tail has gone:
 * statically unstable in pitch by a few percent of the chord per radian,
 * a nose down section moment, and a slightly unstable body in yaw. Chosen
 * in docs/CRASH-STAGE1.md from the tail volume argument. */
#define WING_BODY_CM_ALPHA 0.10
#define WING_BODY_CM_0 (-0.05)
#define WING_BODY_CN_BETA (-0.02)
#define WING_DT (1.0 / SIM_STEP_HZ)
/* The chord Reynolds numbers the post stall model fades in between: under
 * 3e4 a low Reynolds number section's laminar separation runs into the
 * wake and does not reattach, and 5e4 is the Reynolds number of the
 * separation to reattachment distance, so a chord shorter than that cannot
 * reattach either (Lissaman, Low-Reynolds-Number Airfoils, Ann. Rev. Fluid
 * Mech. 15, 1983, after Carmichael, NASA CR-165803). The section data the
 * model is built from start at 6e4. Air's viscosity at sea level, ISA. */
#define STALL_RE_LO 3.0e4
#define STALL_RE_HI 5.0e4
#define AIR_MU 1.789e-5

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
 * YAW, where there is a rudder. Manual and Acro: the yaw stick is the
 * rudder and nothing else. Stabilised: the yaw stick is still the rudder, and on top of it
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
/* The wheel brake, 0 to 1, sim_set_brake; sim.c's gear reads it. */
static double g_brake = 0.0;
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

/*
 * THE FLAPS AND SLATS, for an aircraft that has them: the Timber,
 * docs/TIMBER-STAGE1.md. The notch is the radio's three position switch, a
 * mode like the stabiliser's, kept across resets; the flaps' angle follows
 * it at the table's flap_rate, which is the radio's slowed flap channel,
 * and a reset puts them where the notch has them. The slats are fixed
 * parts, fitted or not, fitted by default. On every aircraft without flaps
 * the notch cannot leave 0, so the angle is +0 and stays +0.
 */
static int g_flap_notch = 0;
static double g_flap = 0.0;

/* THE STALL TAKES TIME. Each wing strip's shortfall past the stall, lift
 * and drag, left half and right, as the flow has so far let it develop:
 * a separation grows and heals over a few semichords of travel, so it
 * follows the steady one with the time constant Leishman and Beddoes give
 * trailing edge separation, T_f = 3 semichords (A Semi-Empirical Model for
 * Dynamic Stall, J. American Helicopter Society 34(3), 1989). A pull
 * through the stall faster than that does not meet the whole of it at
 * once. Zero from a reset. */
#define STALL_TF_SEMICHORDS 3.0
static double g_sep[4][2][2];
static int g_slats = 1;

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

/*
 * HORIZONTAL WIND, sim_set_wind. A mean wind and gusts on top of it, the
 * same at every point, a function of the sim clock alone, so it is exactly
 * repeatable and costs nothing to evaluate. Each horizontal axis gusts
 * independently with the same RMS, as the low altitude turbulence of
 * MIL-F-8785C does (sigma_v = sigma_u near the ground). The gust on an axis
 * is a fixed sum of seven cosines, the way water.c builds a sea: periods
 * 30 to 1.5 s, spaced by a factor 1.65, each carrying the share of the
 * variance a Dryden spectrum, S(w) = (2 sigma^2 T / pi) / (1 + (T w)^2),
 * puts in its band with T = 4 s (a scale length of 40 m in a 10 m/s wind),
 * normalised so the sum's RMS is the RMS asked for; the peaks reach about
 * 2.5 times it. The phases are 2 pi times the fractional part of 0.137 +
 * 0.618034 n, n 0 to 6 on x and 7 to 13 on y, so the axes are
 * uncorrelated and nothing repeats inside ten minutes. Taylor's frozen
 * field would make the gust a craft meets depend on its airspeed through
 * it; this is time alone, which a craft at rest on the water, the case the
 * gusts are for, cannot tell apart.
 */
#define GUST_N 7
static const double GUST_W[GUST_N] = { 0.20944, 0.349066, 0.571199, 0.966644, 1.570796, 2.617994, 4.18879 };
static const double GUST_A[GUST_N] = { 0.7228, 0.7088, 0.6243, 0.5072, 0.4059, 0.3169, 0.2512 };
static const double GUST_PX[GUST_N] = { 0.8608, 4.744, 2.3441, 6.2273, 3.8273, 1.4274, 5.3106 };
static const double GUST_PY[GUST_N] = { 2.9106, 0.5106, 4.3939, 1.9939, 5.8771, 3.4772, 1.0772 };

int SIM_WIND_ON = 0;
double SIM_WIND[2] = { 0.0, 0.0 };
double SIM_GUST = 0.0;

void plant_wind(long long step, double out[3]) {
  out[0] = SIM_WIND[0];
  out[1] = SIM_WIND[1];
  out[2] = 0.0;
  if (!(SIM_GUST > 0.0)) {
    return;
  }
  const double t = (double)step * SIM_DT;
  for (int k = 0; k < GUST_N; k += 1) {
    out[0] += SIM_GUST * GUST_A[k] * sim_cos(GUST_W[k] * t + GUST_PX[k]);
    out[1] += SIM_GUST * GUST_A[k] * sim_cos(GUST_W[k] * t + GUST_PY[k]);
  }
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

void plant_wing_set_brake(double b) {
  g_brake = b;
}

double plant_wing_brake(void) {
  return g_brake;
}

void plant_wing_set_on_wheels(int on) {
  g_on_wheels = on;
}

/* The flap angle the notch asks for on the airframe in force: zero on a
 * quad, which has no table, and on every wing without flaps. */
static double flap_target(void) {
  if (PLANT.kind != PLANT_KIND_WING || PLANT.fw == 0) {
    return 0.0;
  }
  if (g_flap_notch == 2) {
    return PLANT.fw->flap_full;
  }
  return g_flap_notch == 1 ? PLANT.fw->flap_half : 0.0;
}

void plant_wing_reset(void) {
  for (int i = 0; i < 4; i += 1) {
    g_surf[i] = 0.0;
  }
  g_acro_held = 0;
  g_on_wheels = 0;
  g_brake = 0.0;
  g_chute = 0;
  g_chute_t = 0.0;
  g_flap = flap_target();
  for (int i = 0; i < 4; i += 1) {
    for (int j = 0; j < 2; j += 1) {
      g_sep[i][j][0] = 0.0;
      g_sep[i][j][1] = 0.0;
    }
  }
}

int plant_wing_set_flaps(int notch) {
  if (notch != 0 && (PLANT.kind != PLANT_KIND_WING || !(PLANT.fw->flap_full > 0.0))) {
    return -1;
  }
  g_flap_notch = notch;
  return 0;
}

double plant_wing_flaps(void) {
  return g_flap;
}

void plant_wing_flaps_stow(void) {
  g_flap_notch = 0;
  g_flap = 0.0;
}

void plant_wing_flaps_settle(void) {
  g_flap = flap_target();
}

void plant_wing_set_slats(int fitted) {
  g_slats = fitted;
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

/*
 * THE STALLED WING'S LIFT, past the stall angle, docs/STALL-STAGE1.md. Its
 * section's measured lift curve (Selig et al., Summary of Low-Speed Airfoil
 * Data) holds its lift, flat, for stall_top past the stall, then falls to
 * k of it; the plant takes that fall over the same 2 stall_blend it takes
 * the stall's onset over, the span spreading what a section does at once.
 * Past the fall the lift is the flat plate's 2 sin a cos a plus Viterna
 * and Corrigan's A2 cos^2 a / sin a (NASA CP-2230, 1982), A2 set so the
 * lift is k of the held lift where the fall ends; that term decays to
 * nothing at 90 deg, where the plate alone is right, and is not taken past
 * 90 deg, where the flow is from behind.
 *
 * cl_s: the lift held; stall: the stall angle on aa's scale, and shift
 * what the flaps add to it, so stall - shift is the plate's; aa: the angle
 * the stall is judged on, flaps included, whose sign the lift takes;
 * sin_a and cos_a: the zero lift line's, which the plate is taken at.
 * Returns the lift; *fall is how far through the fall it is, and *past how
 * far past the stall angle, 0 at it and 1 a stall_blend on, which is how
 * the caller brings this curve in.
 */
static double stalled_lift(const FixedWingParams *fw, double k, double cl_s, double stall, double shift,
                           double aa, double sin_a, double cos_a, double *fall, double *past) {
  const double a0 = stall + fw->stall_top;
  const double a1 = a0 + 2.0 * fw->stall_blend;
  const double t = smoothstep(a0, a1, sim_fabs(aa));
  const double plate = 2.0 * sin_a * cos_a;
  const double sgn = aa < 0.0 ? -1.0 : 1.0;
  double viterna = 0.0;
  if (cos_a > 0.0 && sim_fabs(sin_a) > 0.05) {
    const double st = clip(a1 - shift, 0.5);
    const double ss = sim_sin_small(st), cs = sim_cos_small(st);
    const double a2 = (k * cl_s - 2.0 * ss * cs) * ss / (cs * cs);
    viterna = a2 * cos_a * cos_a / sin_a;
  }
  *fall = t;
  *past = smoothstep(stall, stall + fw->stall_blend, sim_fabs(aa));
  return (1.0 - t) * sgn * cl_s + t * (plate + viterna);
}

/*
 * ONE STRIP OF THE WING PAST THE STALL, docs/STALL-STAGE1.md. The plant's
 * lift and drag are the whole wing's at the centreline's angle of attack,
 * and its roll damping is the table's linear cl_p. Past the stall the wing
 * no longer acts as one: each half is taken as four spanwise strips, each
 * at its own angle of attack, the centreline's plus da, the roll rate's
 * p y / V that the table's cl_p is built on, plus dr, what the yaw rate
 * adds: a retreating strip meets the air slower along the chord for the
 * same flow across it, so at a higher angle, sin(alpha) r y / V, which
 * linear theory drops as second order and a spin lives on. A strip
 * carries r times the wing's lift coefficient (Schrenk's loading), so it
 * reaches its section's clmax, and its stall, at its own angle, stall.
 * What it returns is how far the strip falls short of the linear wing:
 *
 *   out[0]  the lift deficit, the strip's lift less its linear lift, r CL_lin
 *           at da: the stall blend from the linear lift to the stalled
 *           lift above, which holds the section's clmax and then falls.
 *           Across the strips its linear part is the wing's strip theory
 *           roll damping, which it takes back as a strip stalls, so what
 *           is left is the stalled lift's.
 *   out[1]  the drag excess, sigma (CD_plate - CD_lin). The angle is held
 *           within 0.5 rad of the centre's, where the small angle sine is
 *           good; past that the strip is stalled through anyway.
 *
 * k is the table's stall_k (or slat_k). Both are
 * taken only past the strip's stall angle, scaled in over a stall_blend:
 * short of it a strip is the linear wing the plant's roll damping was
 * always taken for, and a flight that stays short of every strip's stall
 * is what it was.
 */
static void strip_stall(const FixedWingParams *fw, double alpha, double sin_a, double cos_a, double da,
                        double dr, double r, double cl_lin, double dcl_f, double stall, double k, double out[2]) {
  out[0] = 0.0;
  out[1] = 0.0;
  const double aa = add_term(alpha + (da + dr), dcl_f / fw->cl_alpha);
  const double sigma = smoothstep(stall - fw->stall_blend, stall + fw->stall_blend, sim_fabs(aa));
  if (!(sigma > 0.0)) {
    return;
  }
  const double dc = clip(da + dr, 0.5);
  const double sd = sim_sin_small(dc), cd = sim_cos_small(dc);
  const double sp = sin_a * cd + cos_a * sd;
  const double cp = cos_a * cd - sin_a * sd;
  double fall, past;
  /* The strip's own wing lift: r CLalpha times its whole angle, the rates'
   * included, up to its stall angle, where it holds r CLalpha times that
   * angle; no elevator in it, which is the tail's lift. The shortfall is
   * taken against what the plant's linear wing gives the strip, its share
   * of the wing's lift and the roll damping's cla da, so on the held lift
   * a strip's roll damping is gone and a rate that pushes it deeper takes
   * nothing more. */
  const double lin = r * fw->cl_alpha * aa;
  const double hold = r * fw->cl_alpha * stall;
  const double lift = stalled_lift(fw, k, hold, stall, dcl_f / fw->cl_alpha, aa, sp, cp, &fall, &past);
  const double blended = (1.0 - sigma) * lin + sigma * lift;
  /* The linear wing's roll damping acts on the roll about the flight path,
   * the roll rate's da and the yaw rate's dr together (plant_wing_step's
   * stability axis rates), so a stalled strip takes both back. */
  const double ref = r * fw->cl_alpha * add_term(alpha, dcl_f / fw->cl_alpha) + fw->cl_alpha * (da + dr);
  out[0] = past * (blended - ref);
  out[1] = past * sigma * (2.0 * sp * sp - fw->k_induced * cl_lin * cl_lin);
}

void plant_wing_step(SimState *s, const double rc[4]) {
  const FixedWingParams *fw = PLANT.fw;
  /*
   * Crash damage (crash.c, docs/CRASH-STAGE1.md) that changes the aircraft's
   * own derivatives: a stabiliser gone takes the tail's pitch stability,
   * damping and elevator with it, a fin gone takes the weathercock
   * stability, the yaw damping and the rudder. What is left is the wing and
   * body's own, which is unstable. A copy, so the table is never written
   * and an intact aircraft reads exactly the table it always did.
   */
  FixedWingParams fw_dmg;
  if (CRASH.active && (CRASH.hstab_keep < 1.0 || CRASH.fin_keep < 1.0 || CRASH.rudder_keep < 1.0)) {
    fw_dmg = *fw;
    const double h = CRASH.hstab_keep, f = CRASH.fin_keep;
    fw_dmg.cm_alpha = h * fw->cm_alpha + (1.0 - h) * WING_BODY_CM_ALPHA;
    fw_dmg.cm_0 = h * fw->cm_0 + (1.0 - h) * WING_BODY_CM_0;
    fw_dmg.cm_q = fw->cm_q * (0.2 + 0.8 * h);
    fw_dmg.cm_de = fw->cm_de * h;
    fw_dmg.cl_de = fw->cl_de * h;
    fw_dmg.cn_beta = f * fw->cn_beta + (1.0 - f) * WING_BODY_CN_BETA;
    fw_dmg.cn_r = fw->cn_r * (0.3 + 0.7 * f);
    fw_dmg.cy_beta = fw->cy_beta * (0.5 + 0.5 * f);
    const double r = f < CRASH.rudder_keep ? f : CRASH.rudder_keep;
    fw_dmg.cn_dr = fw->cn_dr * r;
    fw_dmg.cl_dr = fw->cl_dr * r;
    fw_dmg.cy_dr = fw->cy_dr * r;
    fw = &fw_dmg;
  }
  double roll = rc[0];
  double pitch = rc[1];
  double yaw = rc[2];
  const double throttle = rc[3];

  /* Relative wind in the body frame: still air, or for an airframe that
   * flies in it, the thermals' rise, which is a wind from below, and the
   * horizontal wind when a host has set one. Everything aerodynamic below,
   * the chute's drag with it, reads this. */
  double vb[3];
  double vg[3] = { s->vel[0], s->vel[1], s->vel[2] };
  if (SIM_WIND_ON) {
    double wa[3];
    plant_wind(s->step_index, wa);
    vg[0] -= wa[0];
    vg[1] -= wa[1];
  }
  if (fw->air_lift) {
    const double va[3] = { vg[0], vg[1], vg[2] - plant_air_lift(s->pos) };
    wquat_rotate_inv(s->quat, va, vb);
  } else {
    wquat_rotate_inv(s->quat, vg, vb);
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
    /* Acro leaves the yaw stick as the rudder alone. The owner flew the
     * Cub with the turn coordinator on (2026-09-25): every bank brought
     * its own yaw, and the damper pulled the yaw rate back onto the
     * coordinated rate against the pilot's own rudder, so rudder felt
     * mixed into the ailerons and never independent. Stabilised keeps
     * the coordinator; Acro is flown on the pilot's feet. */
    acro_sticks(fw, s, &roll, &pitch);
  } else if (g_stab == 1) {
    double pitch_att, bank;
    wing_attitude(s->quat, &pitch_att, &bank);
    const double bank_t = fw->stab_bank_max * deadband1(roll, fw->stab_deadband);
    double pitch_t = fw->stab_trim_pitch + fw->stab_pitch_max * deadband1(pitch, fw->stab_deadband);
    /* With the power gone, a pitch held at the cruise's attitude bleeds
     * the speed into a stall; lower it toward the glide the airframe
     * trims at by itself, as ArduPilot's adjust_nav_pitch_throttle does. */
    if (throttle < fw->stab_trim_throttle) {
      pitch_t -= fw->stab_pitch_down * (fw->stab_trim_throttle - throttle) / fw->stab_trim_throttle;
    }
    roll = clamp1(-fw->stab_roll_kp * (bank - bank_t) - fw->stab_roll_kd * s->omega[0]);
    pitch = clamp1(fw->stab_pitch_kp * (pitch_t - pitch_att) - fw->stab_pitch_kd * (-s->omega[1]));
    yaw = clamp1(add_term(yaw, yaw_coordinated(fw, s, V)));
  }

  /* The flaps travel toward the notch's angle at the servo's rate. */
  const double flap_t = flap_target();
  if (g_flap < flap_t) {
    g_flap += fw->flap_rate * WING_DT;
    if (g_flap > flap_t) g_flap = flap_t;
  } else if (g_flap > flap_t) {
    g_flap -= fw->flap_rate * WING_DT;
    if (g_flap < flap_t) g_flap = flap_t;
  }
  const double df = g_flap;

  /*
   * Surfaces. Roll right needs the right surface up and the left one down.
   * The rudder is trailing edge left positive and the yaw stick nose right
   * positive, so full right stick is full negative rudder. Two mixes and
   * one branch, because they are two kinds of hardware: an elevon is one
   * surface doing pitch and roll and is clipped as one, a tail's surfaces
   * are separate.
   *
   * Without ailerons the roll stick is a second rudder stick, the sum of
   * the two clipped at full travel. A three channel aircraft on a four
   * channel radio has its rudder on the stick that rolls a plane with
   * ailerons, so an aileron pilot's right stick banks it the way they
   * expect, through the rudder and the dihedral; the yaw stick stays live
   * for a pilot who uses it. For every other mix the rudder's stick is the
   * yaw stick, the same double.
   *
   * The elevator carries the radio's flap mix on top of the stick, within
   * its travel, as a transmitter's mix does. Without flaps it adds a zero.
   */
  const double de = surface_from_stick(pitch, fw->throw_e, fw->expo);
  const double da = surface_from_stick(roll, fw->throw_a, fw->expo);
  const double rudder_stick = fw->mix == FW_MIX_RUDDER ? clamp1(yaw + roll) : yaw;
  double delta_r = -surface_from_stick(rudder_stick, fw->throw_r, fw->expo);
  double delta_e;
  if (fw->mix == FW_MIX_ELEVON) {
    g_surf[0] = clip(de - da, fw->surface_max);
    g_surf[1] = clip(de + da, fw->surface_max);
    g_surf[2] = 0.0;
    g_surf[3] = 0.0;
    /* What the aero sees of two elevons: their mean. */
    delta_e = 0.5 * (g_surf[0] + g_surf[1]);
  } else {
    /* A rudder mix has no ailerons, and their slots read zero. */
    const int ailerons = fw->mix == FW_MIX_TAIL;
    g_surf[0] = ailerons ? -da : 0.0;
    g_surf[1] = ailerons ? da : 0.0;
    g_surf[2] = clip(add_term(de, fw->de_df * df), fw->throw_e);
    g_surf[3] = delta_r;
    delta_e = g_surf[2];
  }
  /* A surface that has left moves nothing, and with the pack gone every
   * servo goes limp and trails. */
  if (CRASH.active) {
    for (int k = 0; k < 4; k += 1) {
      if (CRASH.surf_lost[k] || CRASH.no_power) {
        g_surf[k] = 0.0;
      }
    }
    delta_e = fw->mix == FW_MIX_ELEVON ? 0.5 * (g_surf[0] + g_surf[1]) : g_surf[2];
    delta_r = g_surf[3];
  }
  const double delta_a = 0.5 * (g_surf[1] - g_surf[0]);

  const double Vxz = sim_sqrt(u * u + w * w);
  /* Angle of attack of the zero lift line, which is the body's on the wing. */
  const double alpha = (Vxz > 1e-6 ? sim_atan2(-w, u) : 0.0) - fw->alpha_zl;
  const double beta = V > 1e-6 ? sim_atan2(-v, Vxz) : 0.0; /* wind from the right positive */
  const double qbar = 0.5 * PLANT.rho * V2;
  const double Vrate = V > 1.0 ? V : 1.0; /* floor for the rate terms */

  /* Lift and drag coefficients, with the stall blend. The flaps add lift
   * at every alpha, which brings the stall to a lower alpha by their own
   * share of it, and raise the CLmax the stall is reached at; the slats
   * raise the CLmax alone, which moves the stall along the same lift
   * curve to a higher alpha. All of it zero without them. */
  const double dcl_f = fw->cl_df * df + fw->cl_df2 * df * df;
  const double clmax = add_term(add_term(fw->cl_max, fw->clmax_df * df), g_slats ? fw->slat_dclmax : 0.0);
  const double alpha_stall = clmax / fw->cl_alpha;
  const double aa = sim_fabs(add_term(alpha, dcl_f / fw->cl_alpha));
  const double sigma = smoothstep(alpha_stall - fw->stall_blend, alpha_stall + fw->stall_blend, aa);
  const double cl_lin = add_term(fw->cl_alpha * alpha + fw->cl_de * delta_e, dcl_f);
  double sin_b = 0.0, cos_b = 1.0;
  if (Vxz > 0.5) {
    sin_b = -w / Vxz;
    cos_b = u / Vxz;
  }
  /* The flat plate after the stall, at the zero lift line's angle. */
  const double sin_a = add_term(sin_b * fw->cos_zl, -(cos_b * fw->sin_zl));
  const double cos_a = add_term(cos_b * fw->cos_zl, sin_b * fw->sin_zl);
  const double cl_flat = 2.0 * sin_a * cos_a;
  const double cd0 = add_term(add_term(fw->cd0, g_slats ? fw->slat_cd0 : 0.0), fw->cd_df2 * df * df);
  const double cd_lin = cd0 + fw->k_induced * cl_lin * cl_lin;
  const double cd_flat = cd0 + 2.0 * sin_a * sin_a;
  /* Up to its stall angle the wing's lift is the plant's own curve, the
   * blend from the linear lift to the flat plate every gate's band was
   * derived on. Past it the lift is its section's, stalled_lift above: the
   * plant's peak lift held, then the fall, brought in over a
   * stall_blend; as far as the Reynolds number the section data reach, and
   * the plate below them. fre and past are exactly zero where it is not
   * taken, and every post stall term below is a zero added through
   * add_term. */
  const double re = V * fw->chord * PLANT.rho / AIR_MU;
  const double fre = smoothstep(STALL_RE_LO, STALL_RE_HI, re);
  const double k_stall = (g_slats && fw->slat_k > 0.0) ? fw->slat_k : fw->stall_k;
  const double cl_old = (1.0 - sigma) * cl_lin + sigma * cl_flat;
  double cl_st = cl_old, fall = 0.0, past = 0.0;
  if (sigma > 0.0 && fre > 0.0) {
    const double shift = dcl_f / fw->cl_alpha;
    /* What the stalled wing holds is the most lift the plant's own curve
     * reaches through its stall blend, found on sixteen steps across it:
     * a section holds its peak flat past the stall (the UIUC curves), and
     * this is the peak the plant's wing actually reaches. The lift at the
     * stall angle itself, the blend's midpoint, is some 0.1 under it, and
     * holding that sank a stalled Cub at 2.7 m/s. The elevator's lift is
     * in the curve, as it is in the lift the step flies on. */
    double cl_s = 0.0;
    for (int i = 0; i <= 16; i += 1) {
      const double ai = alpha_stall - fw->stall_blend + fw->stall_blend * 0.125 * i;
      const double si = smoothstep(alpha_stall - fw->stall_blend, alpha_stall + fw->stall_blend, ai);
      const double ag = clip(ai - shift, 0.5);
      const double lin = fw->cl_alpha * ai + fw->cl_de * delta_e;
      const double c = (1.0 - si) * lin + si * 2.0 * sim_sin_small(ag) * sim_cos_small(ag);
      cl_s = c > cl_s ? c : cl_s;
    }
    cl_st = stalled_lift(fw, k_stall, cl_s, alpha_stall, shift, add_term(alpha, shift), sin_a, cos_a, &fall, &past);
  }
  const double CL = add_term(cl_old, fre * past * (cl_st - cl_old));
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
  /* A wing panel that has left takes its share of the lift, from where it
   * was: less lift, and a roll toward the side that lost it. */
  double m_crash[3] = { 0.0, 0.0, 0.0 };
  if (CRASH.active && CRASH.lift_keep < 1.0 && V > 1e-6 && Vxz > 1e-6) {
    const double lost = (1.0 - CRASH.lift_keep) * qbar * fw->area * CL;
    const double dF0 = -lost * (-w / Vxz);
    const double dF2 = -lost * (u / Vxz);
    F[0] += dF0;
    F[2] += dF2;
    m_crash[0] = CRASH.lift_y * dF2;
    m_crash[2] = -CRASH.lift_y * dF0;
  }

  /* The motor: thrust along body x, falling with the forward airspeed. A
   * glow engine's stick runs its rpm from the carburettor's idle to full,
   * so its duty is never under the idle's. */
  double duty = throttle;
  if (fw->throttle_idle > 0.0) {
    duty = fw->throttle_idle + (1.0 - fw->throttle_idle) * throttle;
  }
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
  const int dead = CRASH.active && (CRASH.motor_dead[0] || CRASH.no_power);
  if (CRASH.active) {
    thrust = dead ? 0.0 : thrust * CRASH.kt[0];
  }
  F[0] += thrust;
  const double rpm = (folded || g_chute || dead) ? 0.0 : 0.85 * duty * fw->rpm_no_load;
  s->motor_omega[0] = rpm * 2.0 * WING_PI / 60.0;
  s->motor_omega[1] = 0.0;
  s->motor_omega[2] = 0.0;
  s->motor_omega[3] = 0.0;
  s->pack_current = (folded || g_chute || dead) ? 0.0 : fw->current_full * duty * duty;
  s->vbat_load = PLANT.cells * (s->cell_voltage_oc - s->pack_current * PLANT.r_cell);
  if (CRASH.active && CRASH.no_power) {
    s->vbat_load = 0.0;
  }

  /* Moments, in the aero convention, then into the body frame. */
  const double p = s->omega[0];
  const double q_aero = -s->omega[1]; /* nose up positive */
  const double r_aero = -s->omega[2]; /* nose right positive */
  const double b2v = fw->span / (2.0 * Vrate);
  const double c2v = fw->chord / (2.0 * Vrate);
  /* The table's lateral derivatives are stability axis ones: each
   * aircraft's derivation takes them from Nelson's strip theory, which
   * rolls the wing about its flight path, not about the fuselage. So the
   * rates go into them turned into the stability axes, the body's pitched
   * down by the body's angle of attack, and the moments they make come back
   * turned the other way (Etkin and Reid, Dynamics of Flight, the stability
   * to body axis transformation of the rotary derivatives). At a cruise's
   * few degrees that is close to the body rates; in a mush at 15 to 20 deg
   * a body yaw rate is a roll about the flight path of r sin(alpha), and
   * the linear wing damps it, which the body rates alone never did while
   * the strips below took the same angle into their stall. The body's
   * angle is sin_b and cos_b above, 0 and 1 below 0.5 m/s. */
  const double ps = p * cos_b + r_aero * sin_b;
  const double rs = r_aero * cos_b - p * sin_b;
  double cl_sum = fw->cl_beta * beta + fw->cl_p * ps * b2v + fw->cl_da * delta_a;
  cl_sum = add_term(cl_sum, fw->cl_r_per_cl * CL * rs * b2v);
  cl_sum = add_term(cl_sum, fw->cl_dr * delta_r);
  double cn_sum = fw->cn_beta * beta + fw->cn_r * rs * b2v;
  cn_sum = add_term(cn_sum, fw->cn_p_per_cl * CL * ps * b2v);
  cn_sum = add_term(cn_sum, fw->cn_da_per_cl * CL * delta_a);
  cn_sum = add_term(cn_sum, fw->cn_dr * delta_r);
  const double cl_b = cl_sum * cos_b - cn_sum * sin_b;
  const double cn_b = cn_sum * cos_b + cl_sum * sin_b;
  cl_sum = cl_b;
  cn_sum = cn_b;
  const double l_aero = qbar * fw->area * fw->span * cl_sum;
  /* Past the stall the wing's lift no longer grows with alpha, and once it
   * falls what is left of it acts well aft of the quarter chord. The
   * linear moment above assumes neither, so it keeps pitching the nose up
   * with the lift the wing no longer makes. Through the stall blend: the
   * linear lift taken back at the CG's arm behind the wing's aerodynamic
   * centre; the stalled wing's normal force put back, at the aerodynamic
   * centre while it holds its lift and at its centre of pressure's arm
   * behind the CG as it falls (Hoerner, Fluid Dynamic Lift, ch. 3); and
   * the tail's lift that the downwash, going with the wing's lift, no
   * longer holds down. Short of the stall angle, and below the Reynolds
   * number the section data reach, the moment is the plant's earlier one,
   * the lowre arms on the plate's lift, which only the Slow Stick has;
   * past and fre are zero there and add_term keeps that arithmetic what
   * it was. */
  const double cm_low = -sigma * (fw->lowre_arm_ac * cl_lin + fw->lowre_arm_cp * cl_flat);
  const double cn_st = add_term(2.0 * sin_a, (cl_st - cl_flat) * cos_a);
  const double cm_post = sigma * (((1.0 - fall) * fw->stall_arm_ac - fall * fw->stall_arm_cp) * cn_st
                                  - fw->stall_arm_ac * cl_lin - fw->stall_dw * (cl_lin - cl_st));
  const double cm_stall = add_term(cm_low, fre * past * (cm_post - cm_low));
  /* The flaps' own moment rides on the lift they add: the section's nose
   * down moment and the downwash they add at the tail, nose up net. */
  const double m_aero = qbar * fw->area * fw->chord *
                        add_term(add_term(fw->cm_0 + fw->cm_alpha * alpha + fw->cm_q * q_aero * c2v + fw->cm_de * delta_e,
                                          cm_stall),
                                 fw->cm_dcl_f * dcl_f);
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

  /* The wing's strips past the stall, strip_stall above. A strip that
   * stalls first drops its side, by the lift it loses at its arm; a
   * descending strip is pushed deeper into its stall by its own roll rate,
   * which is roll damping turning into autorotation; and a stalled strip's
   * drag yaws the nose toward it. Each half is four strips of equal span,
   * at an eighth, three, five and seven eighths of the semispan, their
   * chords the table's strip_c over the mean chord; each carries r of the
   * wing's lift coefficient, Schrenk's (c + c_elliptic) / 2c (NACA TM 948),
   * so the most loaded strip stalls where the wing's CLmax says and the
   * others later; a washed out strip, twisted nose down by washout times
   * its share of the semispan, later again, by that twist. The left half
   * stalls stall_asym sooner. The moments are
   * scaled by kr so that the strips' linear part is exactly the table's
   * roll damping, which they take back as they stall. The yaw a lift makes
   * through a roll rate is the table's cn_p_per_cl, on the stalled CL
   * already. Sideslip is left out of the strips' angles on purpose,
   * docs/STALL-STAGE1.md. Moments only: the wing's force is the
   * centreline's above. Scaled by the Reynolds number's fre, as the rest
   * of the post stall model is, and not taken at all where that is zero. */
  if (V > 1e-6 && Vxz > 0.5 && fre > 0.0) {
    const double half = 0.5 * fw->span;
    double rr[4], rmax = 0.0, cyy = 0.0;
    for (int i = 0; i < 4; i += 1) {
      const double eta = 0.125 + 0.25 * i;
      rr[i] = 0.5 * (1.0 + 4.0 / WING_PI * sim_sqrt(1.0 - eta * eta) / fw->strip_c[i]);
      rmax = rr[i] > rmax ? rr[i] : rmax;
      cyy += fw->strip_c[i] * eta * eta * 0.25;
    }
    const double chord_mean = fw->area / fw->span;
    const double kr = -fw->cl_p * fw->area * fw->span * fw->span /
                      (4.0 * fw->cl_alpha * chord_mean * half * half * half * cyy);
    double ml = 0.0, mn = 0.0;
    for (int i = 0; i < 4; i += 1) {
      const double y = (0.125 + 0.25 * i) * half;
      const double da = p * y / Vrate;
      const double dr = (-w / V) * s->omega[2] * y / Vrate;
      const double st = add_term(alpha_stall * rmax / rr[i], fw->washout * (0.125 + 0.25 * i));
      double fl[2], fr[2];
      strip_stall(fw, alpha, sin_a, cos_a, -da, dr, rr[i], cl_lin, dcl_f, st - 0.5 * fw->stall_asym, k_stall, fl);
      strip_stall(fw, alpha, sin_a, cos_a, da, -dr, rr[i], cl_lin, dcl_f, st + 0.5 * fw->stall_asym, k_stall, fr);
      const double tau = STALL_TF_SEMICHORDS * 0.5 * fw->strip_c[i] * chord_mean / Vrate;
      const double lag = WING_DT / (tau + WING_DT);
      for (int j = 0; j < 2; j += 1) {
        g_sep[i][0][j] += (fl[j] - g_sep[i][0][j]) * lag;
        g_sep[i][1][j] += (fr[j] - g_sep[i][1][j]) * lag;
      }
      const double arm = fw->strip_c[i] * chord_mean * 0.25 * half * y;
      ml += arm * (g_sep[i][0][0] - g_sep[i][1][0]);
      mn += arm * (g_sep[i][0][1] - g_sep[i][1][1]);
    }
    const double k = qbar * kr * fre;
    M[0] = add_term(M[0], k * (u / Vxz) * ml);
    M[2] = add_term(M[2], k * (u / V) * mn);
  } else {
    for (int i = 0; i < 4; i += 1) {
      for (int j = 0; j < 2; j += 1) {
        g_sep[i][j][0] = 0.0;
        g_sep[i][j][1] = 0.0;
      }
    }
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

  /* Crash damage: the lost panel's roll, and the forces' arm about a CG a
   * lost part has moved. The aero was taken about the table's CG, so about
   * the new one every force has the arm minus the shift. */
  if (CRASH.active) {
    const double *c = CRASH.cg_shift;
    M[0] += m_crash[0] - (c[1] * F[2] - c[2] * F[1]);
    M[1] += m_crash[1] - (c[2] * F[0] - c[0] * F[2]);
    M[2] += m_crash[2] - (c[0] * F[1] - c[1] * F[0]);
  }

  /* Rates: I omega_dot = M - omega x (I omega), diagonal inertia. A damaged
   * airframe takes the step that cannot pump its tumble (plant.c). */
  if (CRASH.active) {
    const double h0[3] = { 0.0, 0.0, 0.0 };
    plant_rates_step(s->omega, PLANT.inertia, h0, M, WING_DT);
  } else {
    const double Ix = PLANT.inertia[0], Iy = PLANT.inertia[1], Iz = PLANT.inertia[2];
    const double qb = s->omega[1], r = s->omega[2];
    const double hx = Ix * p, hy = Iy * qb, hz = Iz * r;
    const double gyro[3] = { qb * hz - r * hy, r * hx - p * hz, p * hy - qb * hx };
    s->omega[0] += (M[0] - gyro[0]) / Ix * WING_DT;
    s->omega[1] += (M[1] - gyro[1]) / Iy * WING_DT;
    s->omega[2] += (M[2] - gyro[2]) / Iz * WING_DT;
  }

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
  .stab_pitch_down = 5.51 * WING_PI / 180.0, /* to its power off glide, npm run stab:glide */
  .stab_trim_throttle = 0.553, /* the stick that flies it level, elevator neutral */
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
  /* Past the stall, docs/STALL-STAGE1.md and scripts/stall-derive.js. */
  .stall_arm_ac = -0.0688,
  .stall_arm_cp = 0.2188,
  .stall_asym = 0.00455,
  .stall_k = 0.76,
  .stall_top = 2.6 * WING_PI / 180.0,
  .strip_c = { 1.250, 1.083, 0.917, 0.750 },
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
  .stab_pitch_down = 7.25 * WING_PI / 180.0, /* to its power off glide, npm run stab:glide */
  .stab_trim_throttle = 0.652, /* the stick that flies it level, elevator neutral */
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
  /* Past the stall, docs/STALL-STAGE1.md and scripts/stall-derive.js. */
  .stall_arm_ac = 0.0833,
  .stall_arm_cp = 0.0667,
  .stall_dw = 0.1448,
  .stall_asym = 0.005,
  .stall_k = 0.72,
  .stall_top = 5.3 * WING_PI / 180.0,
  .strip_c = { 1.132, 1.044, 0.956, 0.868 },
  .washout = 5.0 * WING_PI / 180.0, /* FITTED to review behaviour, docs/STALL-STAGE1.md */
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
  .stab_pitch_down = 8.54 * WING_PI / 180.0, /* to its power off glide, npm run stab:glide */
  .stab_trim_throttle = 0.687, /* the stick that flies it level, elevator neutral */
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
  /* Past the stall, docs/STALL-STAGE1.md and scripts/stall-derive.js. */
  .stall_arm_ac = 0.05,
  .stall_arm_cp = 0.1,
  .stall_dw = 0.1352,
  .stall_asym = 0.005,
  .stall_k = 0.72,
  .stall_top = 4.6 * WING_PI / 180.0,
  .strip_c = { 1.0, 1.0, 1.0, 1.0 },
  .washout = 3.0 * WING_PI / 180.0, /* FITTED to review behaviour, docs/STALL-STAGE1.md */
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
  .stab_pitch_down = 0.56 * WING_PI / 180.0, /* to its power off glide, npm run stab:glide */
  .stab_trim_throttle = 0.402, /* the stick that flies it level, elevator neutral */
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
  /* Past the stall, docs/STALL-STAGE1.md and scripts/stall-derive.js. */
  .stall_arm_ac = 0.0157,
  .stall_arm_cp = 0.1343,
  .stall_dw = 0.1117,
  .stall_asym = 0.00536,
  .stall_k = 0.84,
  .stall_top = 1.4 * WING_PI / 180.0,
  .strip_c = { 1.101, 1.096, 1.074, 0.775 },
  .washout = 6.0 * WING_PI / 180.0, /* FITTED, past the 5 deg bound by lead decision, docs/STALL-STAGE1.md */
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
  /* Its power off glide is nose higher than its trim pitch, so the
   * closed throttle already asks for less: no pitch down (stab:glide). */
  .stab_pitch_down = 0.0,
  .stab_trim_throttle = 0.663,
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
   * belly 60 mm under the CG and 48 mm ahead of it, where the canopy's
   * pull balances the airframe's pitching moment hanging flat on its back,
   * its post stall moment included (scripts/bramor-derive.js).
   * All ESTIMATED: C-Astral publishes none of it. */
  .chute_cda = 1.687,
  .chute_open_s = 1.2,
  .chute_attach = { 0.0477, 0.0, -0.060 },
  /* Past the stall, docs/STALL-STAGE1.md and scripts/stall-derive.js. */
  .stall_arm_ac = -0.0881,
  .stall_arm_cp = 0.2381,
  .stall_asym = 0.00389,
  .stall_k = 0.89,
  .stall_top = 0.6 * WING_PI / 180.0,
  .strip_c = { 2.041, 0.875, 0.701, 0.527 },
};

/* The GWS Slow Stick, docs/SLOWSTICK-STAGE1.md, where each number has its
 * formula and source and the estimated ones say so. Three channels: no
 * ailerons, so it banks on its rudder, the roll stick's as well as the yaw
 * stick's, through twelve degrees of dihedral each side, and that dihedral
 * is also what brings the wings back level with the sticks centred. A
 * geared can motor turning an 11 x 8 in front, clockwise seen from behind,
 * on the stick's line 2.5 mm under the CG. */
const FixedWingParams FW_SLOWSTICK1180 = {
  .mix = FW_MIX_RUDDER,
  .span = 1.176,
  .area = 0.3264,
  .chord = 0.2776,        /* S/b */
  .cl_alpha = 4.58,       /* wing and tail, Nelson eq. 2.52, DATCOM downwash */
  .cl_max = 1.05,
  /* The zero lift line 6.06 degrees under the stick: a flat bottomed
   * section on the saddles at 3 degrees of incidence, less the tail's
   * share. sin and cos of minus 6.06 degrees, to 17 digits. */
  .alpha_zl = -6.06 * WING_PI / 180.0,
  .sin_zl = -0.10556986665660810,
  .cos_zl = 0.99441188812991665,
  .cd0 = 0.040,           /* the bare stick, wire gear, open gearbox, foam */
  .k_induced = 0.0939,    /* 1/(pi 0.80 4.24) */
  .cl_de = -0.400,
  .cy_beta = -0.274,
  .cy_dr = 0.1505,
  .cl_beta = -0.2416,     /* twelve degrees of dihedral each side, and the fin */
  .cl_p = -0.711,
  .cl_da = 0.0,           /* no ailerons */
  .cl_r_per_cl = 0.25,
  .cl_dr = 0.0100,
  .cm_0 = 0.0496,         /* trims at 5.5 m/s with the elevator neutral */
  .cm_alpha = -0.333,     /* static margin 0.073 at the 100 mm CG */
  .cm_q = -4.19,
  .cm_de = 0.737,
  .cn_beta = 0.1233,
  .cn_r = -0.1211,
  .cn_p_per_cl = -0.125,
  .cn_da_per_cl = 0.0,
  .cn_dr = -0.0678,
  /* A thick flat bottomed section at a Reynolds number of 1e5 stalls from
   * its trailing edge, and its lift curve rounds over twice the width the
   * thinner sections of the other planes do. */
  .stall_blend = 4.0 * WING_PI / 180.0,
  .throw_a = 0.0,
  .throw_e = 15.0 * WING_PI / 180.0,
  .throw_r = 30.0 * WING_PI / 180.0,
  .surface_max = 0.0,
  .expo = 0.30,
  .thrust_static = 2.69,  /* N, GWS's EPS-300C D with the EP1180 at 7.2 V */
  .pitch_speed = 11.18,
  .rpm_no_load = 3882.0,
  .torque_arm = 0.0122,   /* 11.4 W of disc power at 3,300 rpm is 0.033 N m at 2.69 N */
  .thrust_z = -0.0025,    /* the drawn model's shaft, 2.5 mm under the CG */
  .pfactor = 1.6,         /* blade element at 0.75 R, as the Cub's */
  .current_full = 6.1,
  .duty_min = 0.02,
  .stab_bank_max = 45.0 * WING_PI / 180.0,
  .stab_pitch_max = 25.0 * WING_PI / 180.0,
  .stab_trim_pitch = 2.0 * WING_PI / 180.0,
  .stab_deadband = 0.04,
  .stab_roll_kp = 2.0,
  .stab_roll_kd = 0.8,
  .stab_pitch_kp = 5.0,
  .stab_pitch_kd = 0.5,
  .stab_pitch_down = 6.52 * WING_PI / 180.0, /* to its power off glide, npm run stab:glide */
  .stab_trim_throttle = 0.739, /* the stick that flies it level, elevator neutral */
  .acro_roll_rate = 60.0 * WING_PI / 180.0,
  .acro_pitch_rate = 60.0 * WING_PI / 180.0,
  .acro_expo = 0.30,
  .acro_err_max = 5.0 * WING_PI / 180.0,
  .acro_roll_kp = 3.0,
  .acro_roll_kd = 0.6,
  .acro_roll_ff = 0.5,
  .acro_pitch_kp = 5.0,
  .acro_pitch_kd = 0.5,
  .acro_pitch_ff = 0.40,
  .acro_roll_ki = 2.0,
  .acro_pitch_ki = 8.0,
  .acro_i_max = 0.30,
  .yaw_coord_k = 0.0,     /* the rudder is the roll control: nothing to coordinate with */
  /* The air over the field is the air: a 420 g aircraft sinking 0.65 m/s
   * is carried up by a thermal's core faster than anything else here. */
  .air_lift = 1,
  .stall_arm_ac = 0.0617, /* the CG 17 mm behind the wing's aerodynamic centre */
  .stall_arm_cp = 0.097,  /* the plate's centre of pressure at 0.40 of the chord, 27 mm behind it */
  .lowre_arm_ac = 0.0617, /* the same, its first post stall moment, kept short of the stall */
  .lowre_arm_cp = 0.097,  /* angle and below the section data's Reynolds numbers */
  .stall_dw = 0.1313,     /* the tail's lift as the downwash goes, docs/STALL-STAGE1.md */
  .stall_asym = 0.00360,  /* the left panel stalls first, docs/STALL-STAGE1.md */
  .stall_k = 0.72,
  .stall_top = 4.4 * WING_PI / 180.0,
  .strip_c = { 1.0, 1.0, 1.0, 1.0 },
  .washout = 2.0 * WING_PI / 180.0, /* FITTED to review behaviour, docs/STALL-STAGE1.md */
};

/* The E-flite Turbo Timber Evolution 1.5 m, docs/TIMBER-STAGE1.md, where
 * each number has its formula and source and the estimated ones say so. A
 * STOL bush plane: a cantilever high wing with slotted flaps inboard,
 * ailerons outboard and fixed slats along the leading edge, a tractor
 * three blade prop on 4S, clockwise seen from behind, on the CG's height,
 * and a big tail. */
const FixedWingParams FW_TIMBER1500 = {
  .mix = FW_MIX_TAIL,
  .span = 1.555,
  .area = 0.361,
  .chord = 0.2322,        /* S/b */
  .cl_alpha = 5.25,       /* wing and tail, Nelson eq. 2.52 */
  .cl_max = 1.15,         /* clean, without the slats */
  /* The zero lift line 5 degrees under the body axis, the Cub's: a thick
   * semi symmetric section at 1.5 degrees of incidence. */
  .alpha_zl = -5.0 * WING_PI / 180.0,
  .sin_zl = -0.08715574274765817,
  .cos_zl = 0.9961946980917455,
  .cd0 = 0.042,           /* cantilever wing, tundra tyres, no slats */
  .k_induced = 0.0609,    /* 1/(pi 0.78 6.70) */
  .cl_de = -0.498,
  .cy_beta = -0.369,
  .cy_dr = 0.155,
  .cl_beta = -0.047,      /* a flat wing on top, its tips drooped */
  .cl_p = -0.806,
  .cl_da = 0.391,
  .cl_r_per_cl = 0.25,
  .cl_dr = 0.009,
  .cm_0 = 0.0853,         /* trims at 13 m/s with the elevator neutral */
  .cm_alpha = -1.004,     /* static margin 0.19 at E-flite's 60 mm CG */
  .cm_q = -8.53,
  .cm_de = 1.175,
  .cn_beta = 0.087,
  .cn_r = -0.095,
  .cn_p_per_cl = -0.125,
  .cn_da_per_cl = -0.133,
  .cn_dr = -0.0624,
  .stall_blend = 3.0 * WING_PI / 180.0,
  /* E-flite's high rates, 33, 20 and 30 mm, over the surfaces' chords. */
  .throw_a = 30.0 * WING_PI / 180.0,
  .throw_e = 20.0 * WING_PI / 180.0,
  .throw_r = 27.0 * WING_PI / 180.0,
  .surface_max = 30.0 * WING_PI / 180.0,
  .expo = 0.30,
  .thrust_static = 25.0,  /* N, BL10 800 kV on 4S with the 11 x 7.5 three blade */
  .pitch_speed = 31.95,
  .rpm_no_load = 11840.0,
  .torque_arm = 0.0122,   /* 322 W of disc power at 10,060 rpm is 0.31 N m at 25 N */
  .thrust_z = 0.0,        /* the thrust line through the CG */
  .pfactor = 1.6,         /* blade element at 0.75 R, as the Cub's */
  .current_full = 44.0,   /* A, the review's bench figure on 4S */
  .duty_min = 0.02,
  .stab_bank_max = 60.0 * WING_PI / 180.0,
  .stab_pitch_max = 30.0 * WING_PI / 180.0,
  .stab_trim_pitch = 2.0 * WING_PI / 180.0,
  .stab_deadband = 0.04,
  .stab_roll_kp = 1.2,
  .stab_roll_kd = 0.12,
  .stab_pitch_kp = 5.0,
  .stab_pitch_kd = 0.5,
  .stab_pitch_down = 9.56 * WING_PI / 180.0, /* to its power off glide, npm run stab:glide */
  .stab_trim_throttle = 0.562, /* the stick that flies it level, elevator neutral */
  .acro_roll_rate = 180.0 * WING_PI / 180.0,
  .acro_pitch_rate = 100.0 * WING_PI / 180.0,
  .acro_expo = 0.30,
  .acro_err_max = 5.0 * WING_PI / 180.0,
  .acro_roll_kp = 3.0,
  .acro_roll_kd = 0.30,
  .acro_roll_ff = 0.25,   /* under the Cub's: it rolls faster per stick, and overshot a stop at 0.35 */
  .acro_pitch_kp = 5.0,
  .acro_pitch_kd = 0.5,
  .acro_pitch_ff = 0.40,
  .acro_roll_ki = 4.0,
  .acro_pitch_ki = 8.0,
  .acro_i_max = 0.30,
  .yaw_coord_k = 2.0,     /* 1.4 times the Cub's yaw authority per stick */
  /* The flaps: E-flite's 20 and 35 mm at the trailing edge of a 64.8 mm
   * flap, 18.0 and 32.7 degrees, across in 2 s (the manual's flap speed).
   * Lift, CLmax, drag and moment from Raymer and thin aerofoil theory; the
   * mix is the manual's 30 percent of the elevator's travel down at full
   * flap, 16 at half, as a line through both. */
  .flap_half = 0.31376497222433070,
  .flap_full = 0.57058379792549596,
  .flap_rate = 0.285292,
  .cl_df = 1.2391,
  .cl_df2 = -0.6681,
  .clmax_df = 0.7689,
  .cd_df2 = 0.0666,
  .cm_dcl_f = 0.0940,
  .de_df = -0.183531,
  /* The slats: Raymer's 0.4 c'/c over 78 percent of the area. */
  .slat_dclmax = 0.305,
  .slat_cd0 = 0.004,
  /* Past the stall, docs/STALL-STAGE1.md and scripts/stall-derive.js. */
  .stall_arm_cp = 0.15,
  .stall_dw = 0.1717,
  .stall_asym = 0.00431,
  .stall_k = 0.63,
  .slat_k = 0.84,
  .stall_top = 3.7 * WING_PI / 180.0,
  .strip_c = { 1.0, 1.0, 1.0, 1.0 },
  .washout = 2.0 * WING_PI / 180.0, /* FITTED to review behaviour, docs/STALL-STAGE1.md */
};

/* The Timber on its floats, docs/FLOATS-STAGE1.md: FW_TIMBER1500 with
 * what the floats change in the air. Their wetted area, struts and
 * spreader bars less the wheels and legs they replace add 0.0175 of drag;
 * their sides add side force, under the CG, so a little of the dihedral
 * effect goes; their volume ahead of and behind the CG takes some of the
 * weathercock stability, Nelson eq. 2.72 on 5.6 litres; and they lower
 * the CG under the thrust line, so power pitches the nose down. The
 * floats' drag under the CG is a constant moment coefficient, which the
 * rigging's trim takes out as it did the wheels'; cm_0 is unchanged. */
const FixedWingParams FW_TIMBER1500F = {
  .mix = FW_MIX_TAIL,
  .span = 1.555,
  .area = 0.361,
  .chord = 0.2322,        /* S/b */
  .cl_alpha = 5.25,       /* wing and tail, Nelson eq. 2.52 */
  .cl_max = 1.15,         /* clean, without the slats */
  /* The zero lift line 5 degrees under the body axis, the Cub's: a thick
   * semi symmetric section at 1.5 degrees of incidence. */
  .alpha_zl = -5.0 * WING_PI / 180.0,
  .sin_zl = -0.08715574274765817,
  .cos_zl = 0.9961946980917455,
  .cd0 = 0.0595,          /* the wheels off, the floats, their struts and spreaders on */
  .k_induced = 0.0609,    /* 1/(pi 0.78 6.70) */
  .cl_de = -0.498,
  .cy_beta = -0.446,      /* and the floats' sides */
  .cy_dr = 0.155,
  .cl_beta = -0.0366,     /* the floats' side force acts under the CG */
  .cl_p = -0.806,
  .cl_da = 0.391,
  .cl_r_per_cl = 0.25,
  .cl_dr = 0.009,
  .cm_0 = 0.0853,         /* trims at 13 m/s with the elevator neutral */
  .cm_alpha = -1.004,     /* static margin 0.19 at E-flite's 60 mm CG */
  .cm_q = -8.53,
  .cm_de = 1.175,
  .cn_beta = 0.0741,      /* less the floats' volume, Munk's moment */
  .cn_r = -0.095,
  .cn_p_per_cl = -0.125,
  .cn_da_per_cl = -0.133,
  .cn_dr = -0.0624,
  .stall_blend = 3.0 * WING_PI / 180.0,
  /* E-flite's high rates, 33, 20 and 30 mm, over the surfaces' chords. */
  .throw_a = 30.0 * WING_PI / 180.0,
  .throw_e = 20.0 * WING_PI / 180.0,
  .throw_r = 27.0 * WING_PI / 180.0,
  .surface_max = 30.0 * WING_PI / 180.0,
  .expo = 0.30,
  .thrust_static = 25.0,  /* N, BL10 800 kV on 4S with the 11 x 7.5 three blade */
  .pitch_speed = 31.95,
  .rpm_no_load = 11840.0,
  .torque_arm = 0.0122,   /* 322 W of disc power at 10,060 rpm is 0.31 N m at 25 N */
  .thrust_z = 0.0266,     /* the floats lower the CG under the thrust line */
  .pfactor = 1.6,         /* blade element at 0.75 R, as the Cub's */
  .current_full = 44.0,   /* A, the review's bench figure on 4S */
  .duty_min = 0.02,
  .stab_bank_max = 60.0 * WING_PI / 180.0,
  .stab_pitch_max = 30.0 * WING_PI / 180.0,
  .stab_trim_pitch = 2.0 * WING_PI / 180.0,
  .stab_deadband = 0.04,
  .stab_roll_kp = 1.2,
  .stab_roll_kd = 0.12,
  .stab_pitch_kp = 5.0,
  .stab_pitch_kd = 0.5,
  .stab_pitch_down = 11.75 * WING_PI / 180.0, /* to its power off glide, npm run stab:glide */
  .stab_trim_throttle = 0.666, /* the stick that flies it level, elevator neutral */
  .acro_roll_rate = 180.0 * WING_PI / 180.0,
  .acro_pitch_rate = 100.0 * WING_PI / 180.0,
  .acro_expo = 0.30,
  .acro_err_max = 5.0 * WING_PI / 180.0,
  .acro_roll_kp = 3.0,
  .acro_roll_kd = 0.30,
  .acro_roll_ff = 0.25,   /* under the Cub's: it rolls faster per stick, and overshot a stop at 0.35 */
  .acro_pitch_kp = 5.0,
  .acro_pitch_kd = 0.5,
  .acro_pitch_ff = 0.40,
  .acro_roll_ki = 4.0,
  .acro_pitch_ki = 8.0,
  .acro_i_max = 0.30,
  .yaw_coord_k = 2.0,     /* 1.4 times the Cub's yaw authority per stick */
  /* The flaps: E-flite's 20 and 35 mm at the trailing edge of a 64.8 mm
   * flap, 18.0 and 32.7 degrees, across in 2 s (the manual's flap speed).
   * Lift, CLmax, drag and moment from Raymer and thin aerofoil theory; the
   * mix is the manual's 30 percent of the elevator's travel down at full
   * flap, 16 at half, as a line through both. */
  .flap_half = 0.31376497222433070,
  .flap_full = 0.57058379792549596,
  .flap_rate = 0.285292,
  .cl_df = 1.2391,
  .cl_df2 = -0.6681,
  .clmax_df = 0.7689,
  .cd_df2 = 0.0666,
  .cm_dcl_f = 0.0940,
  .de_df = -0.183531,
  /* The slats: Raymer's 0.4 c'/c over 78 percent of the area. */
  .slat_dclmax = 0.305,
  .slat_cd0 = 0.004,
  /* Past the stall, docs/STALL-STAGE1.md and scripts/stall-derive.js. */
  .stall_arm_cp = 0.15,
  .stall_dw = 0.1717,
  .stall_asym = 0.00431,
  .stall_k = 0.63,
  .slat_k = 0.84,
  .stall_top = 3.7 * WING_PI / 180.0,
  .strip_c = { 1.0, 1.0, 1.0, 1.0 },
  .washout = 2.0 * WING_PI / 180.0, /* FITTED to review behaviour, docs/STALL-STAGE1.md */
};

/* The Cub on its floats, docs/FLOATS-STAGE1.md: FW_CUB1400 with what the
 * floats change in the air, by the Timber's reasoning above, on 5.2
 * litres of float, 0.28 m^2 of wing and 1.4 m of span. */
const FixedWingParams FW_CUB1400F = {
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
  .cd0 = 0.0715,          /* the wheels off, the floats and their struts on */
  .k_induced = 0.0606,    /* 1/(pi 0.75 7) */
  .cl_de = -0.345,
  .cy_beta = -0.395,      /* and the floats' sides */
  .cy_dr = 0.106,
  .cl_beta = -0.0756,     /* the floats' side force acts under the CG */
  .cl_p = -0.81,
  .cl_da = 0.40,
  .cl_r_per_cl = 0.25,
  .cl_dr = 0.008,
  .cm_0 = 0.062,          /* trims at 12 m/s with the elevator neutral */
  .cm_alpha = -0.62,      /* static margin 0.12 at the manual's 60 mm CG */
  .cm_q = -7.7,
  .cm_de = 0.89,
  .cn_beta = 0.0308,      /* less the floats' volume, Munk's moment */
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
  .thrust_z = 0.0284,     /* 2 mm over the old CG, which the floats lower 26.4 mm */
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
  .stab_pitch_down = 10.85 * WING_PI / 180.0, /* to its power off glide, npm run stab:glide */
  .stab_trim_throttle = 0.858, /* the stick that flies it level, elevator neutral */
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
  /* Past the stall, docs/STALL-STAGE1.md and scripts/stall-derive.js. */
  .stall_arm_ac = 0.05,
  .stall_arm_cp = 0.1,
  .stall_dw = 0.1352,
  .stall_asym = 0.005,
  .stall_k = 0.72,
  .stall_top = 4.6 * WING_PI / 180.0,
  .strip_c = { 1.0, 1.0, 1.0, 1.0 },
  .washout = 3.0 * WING_PI / 180.0, /* FITTED to review behaviour, docs/STALL-STAGE1.md */
};

/* BMJR's 1/2A Texaco Buzzard Bombshell, docs/BOMBSHELL-STAGE1.md, where
 * each number has its formula and source and the estimated ones say so.
 * The Slow Stick's three channels on Joe Konefes' 1940 free flight cabin
 * model: no ailerons, so it banks on its rudder, the roll stick's as well
 * as the yaw stick's, through a polyhedral wing, which also brings the
 * wings back level with the sticks centred; a big stabiliser on a long
 * arm. A Cox Texaco .049 on Cox's 7 x 3.5, clockwise seen from behind,
 * 5.3 mm under the CG, on the Cox throttle conversion: the stick runs it
 * from 40 percent of its rpm to full and it never stops. */
const FixedWingParams FW_BOMBSHELL1118 = {
  .mix = FW_MIX_RUDDER,
  .span = 1.1176,         /* BMJR, 44 in */
  .area = 0.212903,       /* BMJR, 330 sq in */
  .chord = 0.1905,        /* S/b */
  .cl_alpha = 4.991,      /* wing (its panels' cos^2) and tail, DATCOM downwash */
  .cl_max = 1.0,
  /* The zero lift line 5.02 degrees under the thrust line: a flat bottomed
   * section at the plan's 2 degrees of incidence, less the tail's share.
   * sin and cos of minus 5.02 degrees, to 17 digits. */
  .alpha_zl = -5.02 * WING_PI / 180.0,
  .sin_zl = -0.087503474980217169,
  .cos_zl = 0.99616421430725288,
  .cd0 = 0.045,           /* tissue over balsa, an open engine, wire gear */
  .k_induced = 0.07234,   /* 1/(pi 0.75 5.87) */
  .cl_de = -0.425,
  .cy_beta = -0.195,
  .cy_dr = 0.1323,
  .cl_beta = -0.2949,     /* 5 and 23 degrees of polyhedral, 14.7 as one, and the fin */
  .cl_p = -0.742,
  .cl_da = 0.0,           /* no ailerons */
  .cl_r_per_cl = 0.25,
  .cl_dr = 0.0062,
  .cm_0 = 0.1892,         /* trims at 8 m/s with the elevator neutral */
  .cm_alpha = -1.4345,    /* static margin 0.287 at 33 percent of the chord */
  .cm_q = -14.784,
  .cm_de = 1.277,
  .cn_beta = 0.0810,      /* the fin's, less the cabin fuselage's */
  .cn_r = -0.1002,
  .cn_p_per_cl = -0.125,
  .cn_da_per_cl = 0.0,
  .cn_dr = -0.0632,
  /* A 10 percent flat bottomed section at a Reynolds number of 8e4
   * stalls from its trailing edge. */
  .stall_blend = 3.0 * WING_PI / 180.0,
  .throw_a = 0.0,
  .throw_e = 15.0 * WING_PI / 180.0,
  .throw_r = 20.0 * WING_PI / 180.0,
  .surface_max = 0.0,
  .expo = 0.30,
  .thrust_static = 2.824, /* N, Cox's 7 x 3.5 at Cox's 9,350 rpm */
  .pitch_speed = 13.85,
  .rpm_no_load = 11000.0,
  .torque_arm = 0.0070,   /* 19.2 W of disc power at 9,350 rpm is 0.0197 N m at 2.82 N */
  .thrust_z = -0.0053,    /* the drawn model's shaft, 5.3 mm under the CG */
  .pfactor = 1.6,         /* blade element at 0.75 R, as the Cub's */
  .current_full = 0.0,    /* the engine burns fuel, not the pack */
  .duty_min = 0.02,
  .stab_bank_max = 45.0 * WING_PI / 180.0,
  .stab_pitch_max = 12.0 * WING_PI / 180.0,
  .stab_trim_pitch = 2.0 * WING_PI / 180.0,
  .stab_deadband = 0.04,
  .stab_roll_kp = 1.6,
  .stab_roll_kd = 0.6,
  .stab_pitch_kp = 3.0,
  .stab_pitch_kd = 0.5,
  .stab_pitch_down = 6.08 * WING_PI / 180.0, /* to its power off glide, npm run stab:glide */
  .stab_trim_throttle = 0.732, /* the stick that flies it level, elevator neutral */
  .acro_roll_rate = 45.0 * WING_PI / 180.0,
  .acro_pitch_rate = 30.0 * WING_PI / 180.0,
  .acro_expo = 0.30,
  .acro_err_max = 5.0 * WING_PI / 180.0,
  .acro_roll_kp = 3.0,
  .acro_roll_kd = 0.6,
  .acro_roll_ff = 0.5,
  .acro_pitch_kp = 5.0,
  .acro_pitch_kd = 0.5,
  .acro_pitch_ff = 0.40,
  .acro_roll_ki = 2.0,
  .acro_pitch_ki = 8.0,
  .acro_i_max = 0.30,
  .yaw_coord_k = 0.0,     /* the rudder is the roll control: nothing to coordinate with */
  /* A free flight thermal machine: the 1940 Nationals' record flight
   * "grabbed a honey of a rising air current". */
  .air_lift = 1,
  .stall_arm_ac = 0.0761, /* the CG 14.5 mm behind the wing's aerodynamic centre */
  .stall_arm_cp = 0.0703, /* the plate's centre of pressure at 0.40 of the chord */
  .throttle_idle = 0.40,  /* the Cox throttle conversion's 6,500 of 16,000 rpm */
  /* Past the stall, docs/STALL-STAGE1.md and scripts/stall-derive.js. */
  .lowre_arm_ac = 0.0761, /* the same arms, its first post stall moment, kept short of */
  .lowre_arm_cp = 0.0703, /* the stall angle and below the section data's Reynolds numbers */
  .stall_dw = 0.1881,
  .stall_asym = 0.00525,
  .stall_k = 0.72,
  .stall_top = 3.7 * WING_PI / 180.0,
  .strip_c = { 1.0, 1.0, 1.0, 1.0 },
  .washout = 3.0 * WING_PI / 180.0, /* FITTED to review behaviour, docs/STALL-STAGE1.md */
};
