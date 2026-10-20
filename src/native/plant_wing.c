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
 * docs/WING-STAGE1.md, with elevons and no rudder, kept as the reference
 * fixed wing; FW_BRAMOR2300, the C-Astral Bramor C4EYE of
 * docs/BRAMOR-STAGE1.md, a blended wing body with elevons that brings a
 * recovery parachute and a folding prop; and FW_STRIKER_PROP and
 * FW_STRIKER_JET, the war's Striker of docs/COMBAT-DRONES.md section 7 on
 * its piston twin and on its turbojet. The twenty recreational aircraft
 * this plant also flew, and the terms only they reached (AS3X, flaps and
 * slats, retracts, cargo doors, the discus launch, the second wing, the
 * prop's slipstream over the tail, the high alpha tail, the thermals, the
 * low Reynolds number section data, the mapped engine), left with them on
 * 2026-10-20; they fly on in Openflight. A term an airframe does not have
 * is zero in its table, and every term a later aircraft added is written
 * so that a zero leaves the earlier ones' arithmetic bit for bit what it
 * was: their gates and recorded trace hashes are the proof. The bands each
 * airframe has to land in are scripts/wing-gates.js,
 * scripts/bramor-gates.js and scripts/combat-gates.js.
 *
 * Determinism: sqrt, the fixed atan2 and the small angle sin and cos from
 * libm, and nothing else. Lift and drag directions come from the wind
 * vector without trigonometry; the stall blend is a cubic, not a sigmoid,
 * so no exponential is needed.
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
/* Stabilised's roll integrator, stick units; its rate per rad of bank
 * rate error a second over the roll surface's throw, the bank error's
 * rate time constant, and its limit, ArduPilot's RLL2SRV_I,
 * RLL2SRV_TCONST and RLL2SRV_IMAX's third of the travel,
 * https://ardupilot.org/plane/docs/roll-pitch-controller-tuning.html. */
#define STAB_ROLL_I 0.05
#define STAB_ROLL_TCONST 0.5 /* AP_RollController.cpp 2SRV_TCONST default, https://github.com/ArduPilot/ardupilot */
#define STAB_ROLL_IMAX (1.0 / 3.0) /* RLL2SRV_IMAX 1500 of 4500, https://ardupilot.org/plane/docs/roll-pitch-controller-tuning.html */
static double g_stab_roll_i = 0.0;
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

/* What the last step saw and did, for the gates and for anyone chasing a
 * sign: alpha (of the zero lift line), beta, qbar, CL, CD, l m n (aero),
 * thrust, F body x y z, M body x y z, u v w, delta_e, delta_a. */
static double g_debug[20];
/* The ducted fan's speed, as a fraction of its full throttle speed, and
 * its rate, per second; and the ESC's startup ramp, the command it lets
 * through while it starts a stopped motor, 1 once it has. The fan is
 * stopped and the ramp at its start after a reset. Nothing reads them on
 * an airframe without a fan (fan_tau 0). */
static double g_fan_n = 0.0;
static double g_fan_v = 0.0;
static double g_esc_ramp = 0.0;
/* A prop's speed over its full (prop_spool), and whether the
 * next step takes it at the duty's as a launch does. */
static double g_prop_n = 0.0;
static int g_prop_hot = 0;
/* The prop's speed's rate over the last step, per second, of full: the
 * rotor's acceleration, whose torque the drive also puts on the airframe.
 * Zero on the step a launch starts the prop at its duty. */
static double g_prop_dn = 0.0;

/* A fan that idles is a turbine: a ducted fan's table with an idle. No
 * table had both before the Striker's, so this is false on every other. */
static int fan_idles(const FixedWingParams *fw) {
  return fw && fw->fan_tau > 0.0 && fw->throttle_idle > 0.0;
}

void plant_wing_strips(double out[8]) {
  for (int i = 0; i < 4; i += 1) {
    out[i] = g_sep[i][0][0];
    out[4 + i] = g_sep[i][1][0];
  }
}

/* What the receiver last wrote to the aileron, elevator and rudder
 * servos, rad, before the servos slew or the air blows them back. */
static double g_cmd[3] = { 0.0, 0.0, 0.0 };

void plant_wing_command(double out[3]) {
  for (int i = 0; i < 3; i += 1) {
    out[i] = g_cmd[i];
  }
}

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

/* A plain surface's effective angle, docs/EDGE-STAGE1.md: delta over
 * sqrt(1 + (delta / knee)^2), which keeps the sign and tends to the knee. */
static double surface_knee(double delta, double knee) {
  const double r = delta / knee;
  return delta / sim_sqrt(1.0 + r * r);
}

static double clip(double x, double lim) {
  if (x > lim) return lim;
  if (x < -lim) return -lim;
  return x;
}

/*
 * SERVO BLOW BACK (FixedWingParams.hinge_hold, scripts/lib/hinge.js): a
 * plain flap's hinge moment over its small angle slope, as the angle a
 * linear flap would need for it, deg against deg: NACA TN 759 fig. 13(d),
 * the NACA 0009's 0.30c flap at alpha 0.5 deg, its moment at 0, 5, 10,
 * 20, 30 and 45 deg over its 0.012 per deg to 10; past 45 deg its last
 * segment's slope (ESTIMATED: the report stops there).
 */
static const double HINGE_SHAPE_DEG[6] = { 0.0, 5.0, 10.0, 20.0, 30.0, 45.0 };
static const double HINGE_SHAPE_EQ[6] = { 0.0, 5.0, 10.0, 22.083333333333332, 27.916666666666668, 37.916666666666664 };

/* A deflection's equivalent linear angle, deg, signed, and back. */
static double hinge_shape(double deg) {
  const double d = sim_fabs(deg);
  int i = 0;
  while (i < 4 && d > HINGE_SHAPE_DEG[i + 1]) i += 1;
  const double e = HINGE_SHAPE_EQ[i] + (HINGE_SHAPE_EQ[i + 1] - HINGE_SHAPE_EQ[i]) * (d - HINGE_SHAPE_DEG[i]) / (HINGE_SHAPE_DEG[i + 1] - HINGE_SHAPE_DEG[i]);
  return deg < 0.0 ? -e : e;
}
static double hinge_shape_inv(double eq) {
  const double e = sim_fabs(eq);
  int j = 0;
  while (j < 4 && e > HINGE_SHAPE_EQ[j + 1]) j += 1;
  const double d = HINGE_SHAPE_DEG[j] + (HINGE_SHAPE_DEG[j + 1] - HINGE_SHAPE_DEG[j]) * (e - HINGE_SHAPE_EQ[j]) / (HINGE_SHAPE_EQ[j + 1] - HINGE_SHAPE_EQ[j]);
  return eq < 0.0 ? -d : d;
}

/* The surface's angle, delta, as far as its servos hold it at dynamic
 * pressure q against `hold`, Pa rad: the hinge moment goes as the shape
 * of delta plus f, the surface's own angle of attack's share of it (deg,
 * hinge_alpha times the angle, signed as a deflection that loads it the
 * same way). Where the moment passes the hold the air pushes the surface
 * back to where it equals it, at most to the travel `lim`, rad. Inside
 * the hold it is delta itself, untouched, so a surface the servos hold
 * flies exactly as before. */
static double hinge_blow(double delta, double hold, double q, double f, double lim) {
  if (!(hold > 0.0) || !(q > 0.0)) return delta;
  const double held = hold / q * 180.0 / WING_PI;
  const double eq = hinge_shape(delta * 180.0 / WING_PI);
  if (sim_fabs(eq + f) <= held) return delta;
  const double to = eq + f > 0.0 ? held - f : -held - f;
  return clip(hinge_shape_inv(to) * WING_PI / 180.0, lim);
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
/* The wing's normal force coefficient broadside, at 90 deg: a finite
 * wing's is 1.11 + 0.018 AR (AR under 50), Viterna and Janetzke, NASA
 * TM-82944 eq. 12 (https://ntrs.nasa.gov/citations/19820025954), from
 * flat plate data; 2.0 is the two dimensional plate's, which the plant
 * took for every wing. The post stall lift, cn sin cos, and drag, cn
 * sin^2, are Viterna's with it. */
static double plate_cn(const FixedWingParams *fw) {
  const double ar = fw->span * fw->span / fw->area;
  return 1.11 + 0.018 * (ar < 50.0 ? ar : 50.0);
}

/* A surface's share of its moment kept past the stall, at KEEP_DEG
 * degrees past the wing's own stall angle, straight between and held past
 * the last, on the measured curve k. */
static const double KEEP_DEG[7] = { 0.0, 4.0, 10.0, 15.0, 20.0, 25.0, 35.0 };
static double keep_at(const double k[7], double past) {
  if (!(past > 0.0)) {
    return 1.0;
  }
  for (int i = 0; i < 6; i += 1) {
    if (past <= KEEP_DEG[i + 1]) {
      return k[i] + (k[i + 1] - k[i]) * (past - KEEP_DEG[i]) / (KEEP_DEG[i + 1] - KEEP_DEG[i]);
    }
  }
  return k[6];
}
/* NACA TR 419 table II, an unswept Clark Y wing's ailerons (below). */
static const double AIL_KEEP_TR419[7] = { 1.0, 0.40, 0.22, 0.108, 0.148, 0.18, 0.18 };

static double add_term(double sum, double term) {
  return sum - (0.0 - term);
}

/*
 * GROUND EFFECT, on a table with ground_effect (scripts/lib/groundeffect.js
 * mirrors it for the derivations, npm run ge:derive checks it against its
 * sources). The ground under a wing is its image wing, its vortices turning
 * the other way, and three things follow.
 *
 * The induced drag falls: Wieselsberger, NACA TM 77 (1922), eq. 5, by
 * sigma CL^2 / (pi A), with Prandtl's fit to his image wing (eq. 4) in the
 * wing's height over the span (TM 77's h is the wing to its image, twice
 * the height, so its 0.66 and 3.7 are 1.32 and 7.4 here):
 *
 *   sigma = (1 - 1.32 h/b) / (1.05 + 7.4 h/b),
 *
 * fitted between h/b 1/30 and 1/4 and zero from h/b = 1 / 1.32, 0.758:
 * above that the plant is exactly what it was. Katzoff and Sweberg's own
 * sigma (NACA Report 738, 1943, p. 10), exp(-2.48 (2h/b)^0.768), gives
 * 0.487 and 0.233 at 0.1 and 0.25 against this one's 0.485 and 0.231, and
 * 0.040 at 0.7 against 0.012: the fit's zero is a truncation of a residual
 * of a few percent of the induced terms, FITTED where the fit leaves its
 * range.
 *
 * The lift a wing needs comes at a smaller angle: Report 738 finds the
 * induced angle's reduction alone accounts for the measured lift, the angle
 * falling by sigma CL / (pi A) for a given CL. So the wing is taken at its
 * angle plus that upwash, its own lift CL_w = a_w alpha_w / (1 - sigma a_w
 * / (pi A)) held to its CL max: it stalls at the CL max it always had, at
 * a smaller angle, as Report 738 phrases the effect, and TM 77's measured
 * polar (fig. 5) gives no more lift near the ground past CL 1. The drag is
 * the lift tilted forward by the same angle, TM 77's sigma CL^2 / (pi A).
 *
 * The heights are the wing's quarter chord (FixedWingParams.ge_wing)
 * carried by the attitude onto the ground's normal, as the quad's rotor
 * heights are (plant.c). A banked wing is taken at its centre's height;
 * the roll a low tip would add is not modelled. The wing's lift the terms
 * are taken on is its attached line's, held to its CL max: past the stall
 * it overstates them by up to the stall's loss (stall_k), ESTIMATED. The
 * downwash at the tail and its image (Report 738's method on Silverstein
 * and Katzoff's sheet) went with the tailed aircraft on 2026-10-20: the
 * wings left take the wing's terms alone.
 */
#define GE_HB_MAX (1.0 / 1.32)
typedef struct {
  double da;  /* the wing's upwash, added to its angle, rad */
  double clw; /* the wing's lift it was taken on */
} GroundTerms;

/* A body point's height over the ground's plane, m. */
static double ge_height(const SimState *s, const double pt[3]) {
  double ww[3];
  wquat_rotate(s->quat, pt, ww);
  return s->ground_h + s->ground_n[0] * ww[0] + s->ground_n[1] * ww[1] + s->ground_n[2] * ww[2];
}

/* TM 77's sigma at a height over the span; none from GE_HB_MAX. */
static double ge_sigma(double hb) {
  return hb >= GE_HB_MAX ? 0.0 : (1.0 - 1.32 * hb) / (1.05 + 7.4 * hb);
}

/* Zero terms when the host has raised no ground or the wing is past
 * GE_HB_MAX of its span over it; the caller takes no branch then. alpha_w
 * is the wing's angle of its zero lift line. */
static int ground_terms(const SimState *s, const FixedWingParams *fw, double alpha_w, double clmax, GroundTerms *g) {
  if (!fw->ground_effect || !(s->ground_h >= 0.0)) return 0;
  const double h = ge_height(s, fw->ge_wing);
  const double hb = (h > 0.0 ? h : 0.0) / fw->span;
  if (hb >= GE_HB_MAX) return 0;
  const double sigma = ge_sigma(hb);
  const double pia = WING_PI * fw->span * fw->span / fw->area;
  const double aw = fw->cl_alpha;
  /* The wing's own lift at the plant's stall angle: clmax. */
  const double clw_max = clmax;
  double clw = aw * alpha_w / (1.0 - sigma * aw / pia);
  if (clw > clw_max) clw = clw_max;
  if (clw < -clw_max) clw = -clw_max;
  g->clw = clw;
  g->da = sigma * clw / pia;
  return 1;
}

/*
 * A plain flap's profile drag on its section, per unit of its chord
 * fraction: SURF_DRAG_A |delta| + SURF_DRAG_B delta^2, delta in rad.
 * FITTED by least squares to Roskam, Airplane Design VI, fig. 4.44 (plain
 * flaps, cf/c 0.1 to 0.3 at 15 and 60 deg, as FAST-GA digitised it,
 * delta_drag_plain_flap.csv): within 13 percent of every point, and taken
 * on past cf/c 0.3, where the figure stops, on the same form.
 * docs/SURFACES-STAGE1.md.
 */
#define SURF_DRAG_A 0.2476 /* FITTED: Roskam VI fig. 4.44, docs/SURFACES-STAGE1.md */
#define SURF_DRAG_B 0.3992 /* FITTED: Roskam VI fig. 4.44, docs/SURFACES-STAGE1.md */
static double surf_drag(double delta) {
  const double d = sim_fabs(delta);
  return add_term(SURF_DRAG_A * d, SURF_DRAG_B * d * d);
}

/*
 * THE PACK AND THE TANK, docs/POWER-STAGE1.md.
 *
 * LIPO_OCV: a LiPo cell's open circuit voltage at rest against its state of
 * charge, at 0, 5, ..., 100 percent, linear between its points, which needs
 * no libm. Chen and Rincon-Mora's fit to measured polymer Li-ion cells
 * (IEEE Trans. Energy Conversion 21(2), 2006, eq. 2), charged to 4.10 V,
 * over the lower 86 percent, the capacity Battery University's BU-808
 * gives a cell charged to 4.10 V rather than 4.20; the top 14 percent
 * rises linearly to 4.20 V; empty is the paper's 3.0 V end of discharge.
 * docs/POWER-STAGE1.md has the construction.
 */
#define LIPO_OCV_N 21
static const double LIPO_OCV[LIPO_OCV_N] = {
  3.000, 3.562, 3.691, 3.718, 3.732, 3.746, 3.759, 3.775, 3.792, 3.811, 3.833,
  3.858, 3.887, 3.919, 3.955, 3.996, 4.041, 4.092, 4.131, 4.165, 4.200,
};

double plant_lipo_ocv(double soc) {
  if (!(soc > 0.0)) {
    return LIPO_OCV[0];
  }
  if (soc >= 1.0) {
    return LIPO_OCV[LIPO_OCV_N - 1];
  }
  const double x = soc * (double)(LIPO_OCV_N - 1);
  const int i = (int)x;
  return LIPO_OCV[i] + (x - (double)i) * (LIPO_OCV[i + 1] - LIPO_OCV[i]);
}

/* The curve read backwards: the state of charge a rested cell at v volts
 * holds. Outside the curve it is empty or full. */
static double lipo_soc(double v) {
  if (!(v > LIPO_OCV[0])) {
    return 0.0;
  }
  if (v >= LIPO_OCV[LIPO_OCV_N - 1]) {
    return 1.0;
  }
  int i = 0;
  while (LIPO_OCV[i + 1] < v) {
    i += 1;
  }
  const double f = (v - LIPO_OCV[i]) / (LIPO_OCV[i + 1] - LIPO_OCV[i]);
  return ((double)i + f) / (double)(LIPO_OCV_N - 1);
}

/* An electric motor on a pack that drains. A glow engine, a quad and a
 * table with no capacity never drain. */
static int pack_drains(const FixedWingParams *fw) {
  return PLANT.pack_c > 0.0 && !(fw->throttle_idle > 0.0);
}

void plant_power_reset(SimState *s) {
  s->charge_c = 0.0;
  s->soc0 = lipo_soc(s->cell_voltage_oc);
  s->v_cell = plant_lipo_ocv(s->soc0);
  s->fuel_m3 = (PLANT.kind == PLANT_KIND_WING && PLANT.fw != 0) ? PLANT.fw->tank_m3 : 0.0;
  s->power_out = 0;
  s->lvc_cap = 1.0e9;
}

/*
 * The duty the motor or engine turns at, from the duty the stick and the
 * throttle stop ask for.
 *
 * ELECTRIC. A motor's speed is its kV times the voltage it is given, so at
 * a duty its speed goes with the pack's LOADED voltage. The table's thrust,
 * pitch speed and current were measured with v_meas a cell across the
 * pack's terminals under that current; at any other pack they are the
 * motor's at the loaded voltage now over v_meas, at last step's current.
 * The duty scaled by that ratio is the voltage the ESC gives the motor
 * over the measured one, which Drela's law (prop_spool) turns into the
 * prop's speed, and that into the thrust (speed squared) and the pitch
 * speed (speed). A pack seated above the measured voltage pushes harder
 * from the first step, one under it less, as a real pack does. *r_v is
 * the ratio, for power_current. Once the ESC's low voltage cutoff has
 * acted (power_drain) the duty is held under its cap.
 *
 * GLOW. Over the last lean_frac of the tank the mixture leans and the rpm
 * rises by up to lean_gain, then power_drain stops the engine.
 */
static double launch_ratio(const SimState *s, const FixedWingParams *fw, double duty, double u);
static double power_duty(const SimState *s, const FixedWingParams *fw, double duty, double u, double *r_v) {
  *r_v = 1.0;
  if (s->power_out) {
    return duty;
  }
  if (fw->throttle_idle > 0.0) {
    if (fw->tank_m3 > 0.0 && fw->lean_frac > 0.0) {
      const double left = s->fuel_m3 / fw->tank_m3;
      if (left < fw->lean_frac) {
        return duty * (1.0 + fw->lean_gain * (1.0 - left / fw->lean_frac));
      }
    }
    return duty;
  }
  /* The DLG's pack drives no motor (current_full 0): nothing to scale. */
  if (!pack_drains(fw) || !(fw->current_full > 0.0)) {
    return duty;
  }
  const double sag = s->pack_current * PLANT.r_cell;
  *r_v = g_prop_hot ? launch_ratio(s, fw, duty, u) : (s->v_cell - sag) / fw->v_meas;
  const double de = duty * *r_v;
  return de < s->lvc_cap ? de : s->lvc_cap;
}

/*
 * The prop's curves at mu = u / (pitch speed n): its thrust and its shaft
 * torque over their static values, the table's axial_curve and
 * torque_curve (APC's performance files, scripts/prop-curves.js wings),
 * straight between their tenths and on along the last two past mu = 2.
 */
static double prop_curve(const double *c, double mu) {
  const double x = (mu > 0.0 ? mu : 0.0) * 10.0;
  const int i = x >= (double)(FW_CURVE_N - 2) ? FW_CURVE_N - 2 : (int)x;
  return c[i] + (x - (double)i) * (c[i + 1] - c[i]);
}

/*
 * The pack's current, from the power the prop takes: the table's full
 * throttle current times the prop's speed cubed, the motor's torque (the
 * square) through the ESC's switching (the duty), times its torque over
 * the static at the airspeed (torque_curve); the same power off a sagged
 * pack is more current, so it is over r_v. Nothing while the prop makes
 * no thrust.
 */
static double power_current(const FixedWingParams *fw, double de, double ct, double mu, double r_v) {
  if (!(fw->current_full > 0.0) || !(ct > 0.0)) {
    return 0.0;
  }
  return fw->current_full * de * de * de * prop_curve(fw->torque_curve, mu) / r_v;
}

/*
 * One step's draw. The pack: the step's current out of its charge, the
 * curve's voltage at what is left, and the loaded voltage under the
 * current; flat when the charge is gone. The ESC's soft low voltage
 * cutoff: when the loaded cell voltage falls under its threshold it caps
 * the duty at the one whose current leaves it there, taking the current as
 * the rotor's speed squared at the airspeed it has and the duty as the one
 * that holds that speed (spool_duty), and the cap holds until the pack is
 * changed, as a hobby ESC's does until it is re-armed. The cap is taken
 * from the rotor's speed n, not the duty: the current follows the rotor,
 * which lags the duty, and a cap scaled from the duty fell again every
 * step the rotor had not yet slowed, down to nothing. The tank:
 * the fuel the engine burns at its rpm this step, linear from the idle's
 * flow to the full's; dry, the engine quits. A flat pack and a dry tank
 * leave power_out set until a reset, a new pack or a new power system.
 */
static double spool_duty(const FixedWingParams *fw, double n);
static void power_drain(SimState *s, const FixedWingParams *fw, double duty, double n) {
  if (fw->throttle_idle > 0.0) {
    s->vbat_load = PLANT.cells * (s->cell_voltage_oc - s->pack_current * PLANT.r_cell);
    if (fw->tank_m3 > 0.0 && !s->power_out) {
      const double open = (duty - fw->throttle_idle) / (1.0 - fw->throttle_idle);
      s->fuel_m3 -= (fw->flow_idle + (fw->flow_full - fw->flow_idle) * open) * SIM_DT;
      if (!(s->fuel_m3 > 0.0)) {
        s->fuel_m3 = 0.0;
        s->power_out = 1;
      }
    }
    return;
  }
  if (!pack_drains(fw)) {
    s->vbat_load = PLANT.cells * (s->cell_voltage_oc - s->pack_current * PLANT.r_cell);
    return;
  }
  s->charge_c += s->pack_current * SIM_DT;
  const double soc = s->soc0 - s->charge_c / PLANT.pack_c;
  if (!(soc > 0.0)) {
    s->power_out = 1;
  }
  s->v_cell = plant_lipo_ocv(soc);
  s->vbat_load = PLANT.cells * (s->v_cell - s->pack_current * PLANT.r_cell);
  if (PLANT.lvc > 0.0 && s->pack_current > 0.0 && s->vbat_load < PLANT.cells * PLANT.lvc) {
    const double i_max = (s->v_cell - PLANT.lvc) / PLANT.r_cell;
    const double cap = i_max > 0.0 ? spool_duty(fw, n * sim_sqrt(i_max / s->pack_current)) : 0.0;
    if (cap < s->lvc_cap) {
      s->lvc_cap = cap;
    }
  }
}

void plant_power_state(const SimState *s, double *out) {
  const int wing = PLANT.kind == PLANT_KIND_WING && PLANT.fw != 0;
  const FixedWingParams *fw = PLANT.fw;
  const int drains = wing && pack_drains(fw);
  const double tank = wing ? fw->tank_m3 : 0.0;
  double soc = drains ? s->soc0 - s->charge_c / PLANT.pack_c : 1.0;
  if (!(soc > 0.0)) {
    soc = 0.0;
  }
  out[0] = soc;
  out[1] = s->charge_c;
  out[2] = drains ? s->v_cell : s->cell_voltage_oc;
  out[3] = tank > 0.0 ? s->fuel_m3 : 0.0;
  out[4] = tank > 0.0 ? s->fuel_m3 / tank : 1.0;
  out[5] = s->power_out ? 0.0 : 1.0;
  out[6] = (wing && tank > 0.0 && fw->lean_frac > 0.0 && !s->power_out
            && s->fuel_m3 / tank < fw->lean_frac) ? 1.0 : 0.0;
  out[7] = drains ? PLANT.pack_c : 0.0;
  out[8] = tank;
  out[9] = plant_power_custom() ? 1.0 : 0.0;
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
/* The air's vertical velocity at the craft, m/s up, the host's
 * (sim_set_air_vertical): a thermal, a ridge's lift, a dam's sink, which
 * the host reads off its weather at the craft each step. */
double SIM_AIR_W = 0.0;
/* The gusts' clock at step 0 (sim_set_wind_clock): a room's clock at the
 * run's start, so two plants at the same room millisecond meet the same
 * gust bit for bit; 0, the default, is the plant's own clock. Held modulo
 * GUST_WRAP_STEPS, and the gust clock wraps there: 2^27 steps (37.3 h) keeps
 * the fastest cosine's angle under the 1e6 rad sim_cos reduces exactly
 * (4.19 rad/s times 134218 s, 5.6e5 rad), where a room clock of Date.now()
 * milliseconds would be past it. A run from step 0 meets the wrap only 37 h
 * in, so every run shorter than that is unchanged to the bit. */
long long SIM_GUST_STEP0 = 0;

void plant_wind(long long step, double out[3]) {
  out[0] = SIM_WIND[0];
  out[1] = SIM_WIND[1];
  out[2] = SIM_AIR_W;
  if (!(SIM_GUST > 0.0)) {
    return;
  }
  const double t = (double)((step + SIM_GUST_STEP0) % GUST_WRAP_STEPS) * SIM_DT;
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

/* The prop's gyroscope, on but for a gate that measures the airframe's
 * aero alone (sim_wing_set_gyro); every reset puts it back. */
static int g_gyro_on = 1;
void plant_wing_set_gyro(int on) {
  g_gyro_on = on ? 1 : 0;
}
/* The drive's torque on the motor's mount, on but for a gate that measures
 * the airframe without it (sim_wing_set_mount); every reset puts it back. */
static int g_mount_on = 1;
void plant_wing_set_mount(int on) {
  g_mount_on = on ? 1 : 0;
}

void plant_wing_reset(void) {
  g_gyro_on = 1;
  g_mount_on = 1;
  g_stab_roll_i = 0.0;
  for (int i = 0; i < 4; i += 1) {
    g_surf[i] = 0.0;
  }
  g_acro_held = 0;
  g_cmd[0] = 0.0;
  g_cmd[1] = 0.0;
  g_cmd[2] = 0.0;
  g_chute = 0;
  g_chute_t = 0.0;
  for (int i = 0; i < 4; i += 1) {
    for (int j = 0; j < 2; j += 1) {
      g_sep[i][j][0] = 0.0;
      g_sep[i][j][1] = 0.0;
    }
  }
  /* A turbine is lit before the run and idles from its first step, as a
   * glow engine does; an electric fan starts stopped. */
  g_fan_n = fan_idles(PLANT.fw) ? PLANT.fw->throttle_idle : 0.0;
  g_fan_v = 0.0;
  g_esc_ramp = 0.0;
  g_prop_n = 0.0;
  g_prop_dn = 0.0;
  /* A motor is stopped at a reset; an engine is already idling. A quad
   * has no table (PLANT.fw is 0), so nothing of this is read until a
   * fixed wing is seated, which resets it again (sim_set_airframe). */
  g_prop_hot = PLANT.fw != 0 && !(PLANT.fw->current_full > 0.0) ? 1 : 0;
}

/*
 * THE DUCTED FAN'S SPEED, one step: fan_tau in sim_internal.h. The ESC
 * drives toward `de`, the duty the pack gives the stick; with the stick
 * closed it stops driving and the fan runs down to rest, and the next
 * opening is a start, which the ESC ramps from nothing to full over
 * esc_start. `off` is a fan with no drive at all: a flat pack, a cut
 * motor, a pulled chute. The speed follows the command as a critically
 * damped second order system, n'' = (target - n) / tau^2 - 2 n' / tau,
 * taken semi implicitly at the plant's 1 ms step (at the F-16's 80 steps
 * a time constant it is stable, stays within 0.004 of the exact response
 * to a step, and reaches 90 percent of the thrust 1 ms later than it);
 * a fan does not turn backwards, so the speed stops at zero. Returns the
 * speed.
 */
static double fan_spool(const FixedWingParams *fw, double throttle, double de, int off) {
  double target = de;
  /* A turbine (throttle_idle over zero) is held at its idle by its ECU with
   * the stick closed, which de already is; only an electric fan stops. */
  if (off || (!(throttle > 0.0) && !(fw->throttle_idle > 0.0))) {
    target = 0.0;
    g_esc_ramp = 0.0;
  } else if (g_esc_ramp < 1.0) {
    g_esc_ramp = fw->esc_start > 0.0 ? g_esc_ramp + SIM_DT / fw->esc_start : 1.0;
    if (g_esc_ramp >= target) {
      g_esc_ramp = 1.0;
    } else {
      target = g_esc_ramp;
    }
  }
  const double tau = fw->fan_tau;
  const double acc = (target - g_fan_n) / (tau * tau) - 2.0 * g_fan_v / tau;
  g_fan_v += acc * SIM_DT;
  g_fan_n += g_fan_v * SIM_DT;
  if (g_fan_n < 0.0) {
    g_fan_n = 0.0;
    g_fan_v = 0.0;
  }
  return g_fan_n;
}

/*
 * A PROP'S SPEED, one step, docs/FLIGHTMODEL.md "A prop spins up". The
 * rotor, J = j_prop, turns at w under the drive's torque less the prop's,
 * J w' = Q_drive - Q, and the prop's torque goes with its speed squared,
 * Q = Q_f n^2, Q_f = torque_arm thrust_static at full. Over the full
 * speed w_f, n = w / w_f, J w_f n' = Q_drive - Q_f n^2.
 *
 * An electric motor (Drela, "First-Order DC Electric Motor Model", MIT
 * 16.50, 2007: Q = (I - I0) / Kv, I = (V - w / Kv) / R): its torque falls
 * straight with its speed. The table has every figure that takes: w_f is
 * 0.85 of the no load speed (the plant's rule), so the circuit (pack, ESC,
 * windings) drops 0.15 of the pack's V at the full current I_f, R = 0.15 V
 * / I_f, and the motor's torque at full is Kt I_f, which is the prop's
 * (the Extra's 0.68 against 0.65 N m). So
 *
 *   J w_f n' = Q_f (K_M (d - n) + d - n^2),   K_M = 0.85 / 0.15
 *
 * the motor's torque Q_f (d - 0.85 n) / 0.15 straight in the duty with
 * the voltage the ESC's PWM gives it (a BLHeli or AM32 ESC's duty is the
 * stick's, linear), so at rest n^2 + K_M n = (K_M + 1) d: full at full,
 * and over the duty below it, 0.437 at 0.4 and 0.537 at 0.5, as a motor's
 * speed at part throttle sits over its share of the stick (T-Motor's
 * AM670 bench, the CAP lane's: 0.50 at 40 percent, 0.60 at 50). Until
 * 2026-10-11 the drive carried d^2 for d, which held n = d, a premise no
 * motor has. A small step is answered in
 * J w_f / (Q_f (K_M + 2 n)): the Extra's 66 ms at its hover. The
 * current a step draws is that R's, up to V / R at a stall; no ESC here
 * clamps it (none of their listings names a limiter in running).
 *
 * A glow or petrol engine (current_full 0): at a fixed throttle its torque
 * changes slowly with its speed (Heywood, Internal Combustion Engine
 * Fundamentals, 1988, ch. 2: brake torque against speed), taken as flat, so
 * the drive is the torque that holds n = d, Q_f d^2, and
 *
 *   J w_f n' = Q_f (d^2 - n^2)
 *
 * answers a small step with J w_f / (2 Q_f n): with no back EMF to stiffen
 * it, an engine is several times slower than a motor of its power. The
 * carburettor's own delay (a few revolutions of mixture) has no source we
 * found for these engines and is left out. An engine idles from the reset:
 * it is running when the aircraft is seated.
 *
 * With the drive off (a flat pack, a cut motor, the chute, a dead engine)
 * only the prop's drag slows it. A launch starts it at the duty. Taken
 * explicitly at the 1 ms step, under a tenth of the least time constant
 * here (scripts/spool-derive.js).
 */
#define PROP_K_M (0.85 / 0.15)
/* A free electric rotor's friction over the prop's static torque. The
 * Extra's motor class, E-flite's Power 32, draws 2.4 A at no load
 * (docs/EXTRA-STAGE1.md; scripts/extra-derive.js, which derived it, left
 * with the Extra on 2026-10-20, in git at b420b0e51), at its Kt of
 * 60 / (2 pi 910) 0.025 N m, of
 * the prop's 0.651 N m at full. FITTED: no other table has its motor's
 * no load current, so every electric rotor takes the Extra's share. It
 * stops a coasting prop in seconds on the ground, as a real one stops. */
#define PROP_FRICTION 0.0387
static int prop_spools(const FixedWingParams *fw) {
  return fw->j_prop > 0.0 && !(fw->fan_tau > 0.0) && fw->thrust_static > 0.0;
}

/* The duty an electric drive settles at the speed share n on: Drela's
 * motor's on a prop (n^2 + K_M n = (K_M + 1) d, prop_spool), the speed's
 * own on a fan (fan_spool). */
static double spool_duty(const FixedWingParams *fw, double n) {
  return prop_spools(fw) ? (n * n + PROP_K_M * n) / (PROP_K_M + 1.0) : n;
}

/* A launch starts the prop at its duty's speed (prop_spool) before it has
 * drawn any current, so the pack it starts on is the one sagged by the
 * current that speed draws at the launch's airspeed u, not an unloaded
 * pack: the ratio that holds itself, r = (v_cell - I(duty r) r_cell) /
 * v_meas, by substitution (I goes as r^2, and I r_cell over v_meas is a
 * few tenths at most, so thirty passes leave it exact). Taken from an
 * unloaded pack, the first step ran a fresh pack's motor at the whole
 * open circuit ratio, 1.26 on the P-51 at 4.1 V, and its current set off
 * the ESC's cutoff before the prop had moved. */
static double launch_ratio(const SimState *s, const FixedWingParams *fw, double duty, double u) {
  /* Only a prop is started at speed (a fan spools from rest, and nothing
   * clears the launch's mark on it), so a fan's pack is the sagged one. */
  if (!prop_spools(fw)) {
    return (s->v_cell - s->pack_current * PLANT.r_cell) / fw->v_meas;
  }
  double r = s->v_cell / fw->v_meas;
  for (int i = 0; i < 30; i += 1) {
    const double de = duty * r;
    const double mu = de > 0.0 ? u / (fw->pitch_speed * SIM_BOOST * de) : 0.0;
    const double ct = de > 0.0 ? prop_curve(fw->axial_curve, mu) : 0.0;
    r = (s->v_cell - power_current(fw, de, ct, mu, r) * PLANT.r_cell) / fw->v_meas;
  }
  return r;
}

/* An electric motor at zero duty is not driven at all: the ESC stops
 * switching, and Spektrum's Avian ESCs ship with the brake off, "Motor
 * will free wheel when throttle position is zero" (SmartLink ESC
 * instructions, https://www.astramodel.cz/manualy/S/Spektrum_SmartLink_ESC_Instructions.pdf).
 * Its rotor neither drives nor brakes, and the airframe meets no torque
 * from it. Above zero the ESC holds the duty, braking a faster rotor
 * (the damped light the spool's K_M term is). A folding prop's ESC brakes
 * it to fold (FixedWingParams.fold_duty), which plant_wing_step takes. */
static int prop_free(const FixedWingParams *fw, double de) {
  return fw->current_full > 0.0 && !(de > 0.0);
}

static double prop_spool(const FixedWingParams *fw, double de, int off, double u_pos) {
  int hot = 0;
  if (g_prop_hot) {
    g_prop_hot = 0;
    g_prop_n = de;
    hot = 1;
  }
  const double w_f = 0.85 * fw->rpm_no_load * 2.0 * WING_PI / 60.0;
  const double q_f = fw->torque_arm * fw->thrust_static;
  const double n = g_prop_n;
  const double electric = fw->current_full > 0.0 ? PROP_K_M * (de - n) : 0.0;
  const int free = off || prop_free(fw, de);
  /* An electric motor's torque is Drela's, straight in the duty and the
   * speed: Q_f (d - 0.85 n) / 0.15, which is the K_M term plus d. A glow
   * engine's is the torque that holds n = d. */
  double drive = free ? 0.0 : electric + (fw->current_full > 0.0 ? de : de * de);
  /* A driven rotor's load is taken at its static torque, so that it holds
   * n = d at any airspeed and the trims stay the table's (the motor's
   * unloading at speed is left out, docs/FLIGHTMODEL.md). A free rotor has
   * nothing but the air: its torque at the advance ratio it turns at,
   * torque_curve's, falls as the air speeds it and past the windmill turns it,
   * so it settles where Cp is zero, spinning with the airspeed. */
  double load = n * n;
  if (free && n > 0.0) {
    load = n * n * prop_curve(fw->torque_curve, u_pos / (fw->pitch_speed * SIM_BOOST * n));
    /* An electric motor's own friction, its no load current's torque, I0
     * Kt (Drela's model), holds a free rotor back; a glow engine's is in
     * its idle. */
    if (fw->current_full > 0.0) {
      load += PROP_FRICTION;
    }
  }
  g_prop_n = n + SIM_DT * q_f * (drive - load) / (fw->j_prop * w_f);
  if (g_prop_n < 0.0) {
    g_prop_n = 0.0;
  }
  g_prop_dn = hot ? 0.0 : (g_prop_n - n) / SIM_DT;
  return g_prop_n;
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
 * is +omega[0] and nose up is -omega[1].
 *
 * The target is where the pilot left it. It moves only with a stick: a
 * roll or pitch stick advances it at the asked rate and, while either is
 * in, keeps it within acro_err_max of the aircraft (a leash, so a rate the
 * aircraft cannot fly does not run the target away and land it on
 * release). With the sticks centred it stays put, however far the
 * aircraft is pushed off it, so the hold pulls the nose back rather than
 * following it down.
 *
 * The yaw is not held: the rudder is the pilot's stick alone, and the
 * target's yaw is the aircraft's. (The tables with acro_yaw gains held it
 * with the yaw stick centred; they left on 2026-10-20.) */
static void acro_sticks(const FixedWingParams *fw, const SimState *s, double *roll, double *pitch) {
  if (!g_acro_held) {
    for (int i = 0; i < 4; i += 1) {
      g_acro_q[i] = s->quat[i];
    }
    g_acro_held = 1;
    g_acro_i_roll = 0.0;
    g_acro_i_pitch = 0.0;
  }
  const int fly_roll = deadband1(*roll, fw->stab_deadband) != 0.0;
  const int fly_pitch = deadband1(*pitch, fw->stab_deadband) != 0.0;
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
  const double tn = sim_sqrt(t[0] * t[0] + t[1] * t[1] + t[2] * t[2] + t[3] * t[3]);
  for (int i = 0; i < 4; i += 1) {
    t[i] /= tn;
  }

  /* The error, target relative to the aircraft in the body frame, conj(q)
   * t taken the short way round, split into the twist about the nose, the
   * roll error ex, and the swing that points the nose, ey and ez, each an
   * axis times an angle. Split so that a roll the hold cannot stop (a
   * prop hang's torque past the ailerons) leaves where the nose points
   * held: as one rotation vector, a large roll error turns the nose's
   * error with it. */
  const double qc[4] = { s->quat[0], -s->quat[1], -s->quat[2], -s->quat[3] };
  double qe[4];
  wquat_mul(qc, t, qe);
  if (qe[0] < 0.0) {
    for (int i = 0; i < 4; i += 1) {
      qe[i] = -qe[i];
    }
  }
  const double tw = sim_sqrt(qe[0] * qe[0] + qe[1] * qe[1]);
  const double tc = tw > 1e-12 ? qe[0] / tw : 1.0;
  const double ts = tw > 1e-12 ? qe[1] / tw : 0.0;
  double ex = 2.0 * sim_atan2(ts, tc);
  const double sy = qe[2] * tc - qe[3] * ts;
  const double sz = qe[2] * ts + qe[3] * tc;
  const double sn = sim_sqrt(sy * sy + sz * sz);
  const double k = sn > 1e-12 ? 2.0 * sim_atan2(sn, tw) / sn : 2.0;
  double ey = sy * k;

  /* The leash, while a roll or pitch stick is in. */
  const double en = sim_sqrt(ex * ex + ey * ey);
  const int leash = (fly_roll || fly_pitch) && en > fw->acro_err_max;
  if (leash) {
    ex *= fw->acro_err_max / en;
    ey *= fw->acro_err_max / en;
  }

  /* Rebuild the target from the aircraft and the error kept, the swing
   * then the twist, which drops the yaw the target does not hold and the
   * error past the leash. */
  {
    const double ea = sim_sqrt(ey * ey);
    const double sh = ea > 1e-12 ? sim_sin(0.5 * ea) / ea : 0.5;
    const double qs[4] = { sim_cos(0.5 * ea), 0.0, ey * sh, 0.0 };
    const double qt[4] = { sim_cos(0.5 * ex), sim_sin(0.5 * ex), 0.0, 0.0 };
    double qst[4];
    wquat_mul(qs, qt, qst);
    wquat_mul(s->quat, qst, g_acro_q);
    const double n = sim_sqrt(g_acro_q[0] * g_acro_q[0] + g_acro_q[1] * g_acro_q[1] +
                              g_acro_q[2] * g_acro_q[2] + g_acro_q[3] * g_acro_q[3]);
    for (int i = 0; i < 4; i += 1) {
      g_acro_q[i] /= n;
    }
  }

  /* What the loops answer is held to acro_err_max, so a large upset is
   * pulled back at the rate a small one is, not snapped. */
  const double ec = sim_sqrt(ex * ex + ey * ey);
  if (ec > fw->acro_err_max) {
    ex *= fw->acro_err_max / ec;
    ey *= fw->acro_err_max / ec;
  }

  /* The integrals sum under a stick too, as ArduPlane's rate loops do in
   * ACRO: a full stick roll needs them to reach the rate asked, and the
   * leash and acro_i_max bound what they can hold on release. Held while
   * the stick is in, they slowed the Tiger Moth's and the Ugly Stik's
   * full stick roll under its asked rate (tigermoth:stab, uglystik:stab). */
  g_acro_i_roll = clip(g_acro_i_roll + fw->acro_roll_ki * ex * WING_DT, fw->acro_i_max);
  g_acro_i_pitch = clip(g_acro_i_pitch + fw->acro_pitch_ki * -ey * WING_DT, fw->acro_i_max);

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
  /* A turbine leaves the rail at full power: the crew runs it up before
   * the shot, since its spool takes seconds the rail does not give. */
  if (fan_idles(PLANT.fw)) {
    g_fan_n = 1.0;
    g_fan_v = 0.0;
  }
  /* A plane thrown or launched has its motor already running. */
  g_prop_hot = 1;
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
 * cl_s: the lift held; stall: the stall angle on aa's scale; aa: the
 * angle the stall is judged on, whose sign the lift takes;
 * sin_a and cos_a: the zero lift line's, which the plate is taken at.
 * Returns the lift; *fall is how far through the fall it is, and *past how
 * far past the stall angle, 0 at it and 1 a stall_blend on, which is how
 * the caller brings this curve in.
 */
static double stalled_lift(const FixedWingParams *fw, double k, double top, double cl_s, double stall,
                           double aa, double sin_a, double cos_a, double *fall, double *past) {
  const double a0 = stall + top;
  const double a1 = a0 + 2.0 * fw->stall_blend;
  const double t = smoothstep(a0, a1, sim_fabs(aa));
  const double plate = plate_cn(fw) * sin_a * cos_a;
  const double sgn = aa < 0.0 ? -1.0 : 1.0;
  double viterna = 0.0;
  if (cos_a > 0.0 && sim_fabs(sin_a) > 0.05) {
    const double st = clip(a1, 0.5);
    const double ss = sim_sin_small(st), cs = sim_cos_small(st);
    const double a2 = (k * cl_s - plate_cn(fw) * ss * cs) * ss / (cs * cs);
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
 * k is the table's stall_k. Both are
 * taken only past the strip's stall angle, scaled in over a stall_blend:
 * short of it a strip is the linear wing the plant's roll damping was
 * always taken for, and a flight that stays short of every strip's stall
 * is what it was.
 */
static void strip_stall(const FixedWingParams *fw, double alpha, double sin_a, double cos_a, double da, double ail,
                        double dr, double r, double cl_lin, double stall, double k, double top, double b2,
                        double out[2]) {
  out[0] = 0.0;
  out[1] = 0.0;
  const double cla = fw->cl_alpha;
  const double aa = alpha + (da + dr);
  /* The surface on the strip (ail, its aileron's and on a flying wing its
   * elevon's zero lift shift) decides whether the strip is stalled, the
   * rising wing's down aileron taking it there and the falling wing's up
   * aileron holding it short; what a stalled strip loses is taken at its
   * angle without it, since the surface's own moment past the stall is
   * the wing's measured one (plant_wing_step, NACA TR 419). */
  const double aa_on = add_term(aa, ail);
  const double sigma = smoothstep(stall - fw->stall_blend, stall + fw->stall_blend, sim_fabs(aa_on));
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
  const double lin = r * cla * aa;
  const double hold = r * cla * stall;
  const double lift = stalled_lift(fw, k, top, hold, stall, aa, sp, cp, &fall, &past);
  const double blended = (1.0 - sigma) * lin + sigma * lift;
  /* The linear wing's roll damping acts on the roll about the flight path,
   * the roll rate's da and the yaw rate's dr together (plant_wing_step's
   * stability axis rates), so a stalled strip takes both back. */
  const double ref = r * cla * alpha + cla * (da + dr);
  const double past_on = ail == 0.0 ? past : smoothstep(stall, stall + fw->stall_blend, sim_fabs(aa_on));
  /* The rates tilt the strip's own air by dc, so its lift and drag,
   * across and along that air, turn by dc against the wing's: the extra
   * the stalled strip's drag (its own, not the excess over the linear
   * wing's, whose tilt the linear cl_p leaves out) pushes a strip going
   * down up, strip theory's drag share of the roll damping (Cl_p in
   * CL_alpha + CD), which past the
   * stall is most of it, as TR 419's rotation tests read (table IV:
   * damped again at 30 to 40 deg). The lift's tilt into drag is not
   * taken here: the linear cn_p already rides on the wing's stalled CL. */
  const double dl = past_on * (blended - ref);
  const double cd_st = past_on * sigma * (plate_cn(fw) * sp * sp + (cp > 0.0 ? b2 * cp : 0.0));
  const double dd = cd_st - past_on * sigma * fw->k_induced * cl_lin * cl_lin;
  out[0] = add_term(dl, cd_st * dc);
  out[1] = dd;
}

/*
 * ONE LIFTING SURFACE'S LIFT, the plant's curve for the whole wing at the
 * angle alpha (the zero lift line's), with the elevator's delta_e: the
 * linear lift, the stall blend to the flat plate, and past the stall angle
 * the section's, stalled_lift above. sin_a and cos_a are the zero lift
 * line's, which the plate is taken at.
 */
typedef struct {
  double cl_lin; /* the linear lift, the elevator's included */
  double sigma;  /* the stall blend, 0 short of it and 1 through it */
  double cl_st;  /* the stalled lift past the stall angle */
  double fall;   /* how far through its fall the stalled lift is */
  double past;   /* how far past the stall angle, over a stall_blend */
  double cl;     /* the lift */
} WingLift;
static void wing_lift(const FixedWingParams *fw, double alpha, double delta_e, double clmax, double k_stall,
                      double fre, double sin_a, double cos_a, WingLift *o) {
  const double cla = fw->cl_alpha;
  const double alpha_stall = clmax / cla;
  const double aa = sim_fabs(alpha);
  const double round = fw->stall_blend;
  const double de_w = delta_e;
  const double sigma = smoothstep(alpha_stall - fw->stall_blend, alpha_stall + fw->stall_blend, aa);
  const double cl_lin = fw->cl_alpha * alpha + fw->cl_de * delta_e;
  const double cl_flat = plate_cn(fw) * sin_a * cos_a;
  /* THE TOP OF THE CURVE, docs/FLIGHTMODEL.md: a wing's CL max is the peak
   * of its lift curve, which every derivation's stall speed, sqrt(2 W / rho
   * S CL max), is built on. The wing's own lift, the angle's share of
   * cl_lin, follows the linear line to a stall_blend short of the stall
   * angle CL max / CL alpha, leaves it below on the parabola tangent to it
   * there, and tops out at CL max a stall_blend past it, level; a section's
   * curve is concave over its top, never above its line. The elevator's
   * lift rides on it as before. Past the top it holds CL max
   * until the stalled lift below takes it, or, short of the Reynolds number
   * the section data reach, blends to the flat plate over two
   * stall_blends. sigma, the blend that brings in the plate's drag and the
   * stall's moments, and the strips' stall angle are where they always
   * were: the drag rises before the peak, as a real section's does, and
   * the gates measure the stall at the linear crossing. */
  const double a0 = alpha_stall - round;
  const double a1 = alpha_stall + round;
  double wing = clmax;
  if (aa < a0) {
    wing = cla * aa;
  } else if (aa < a1) {
    wing = clmax - cla * (a1 - aa) * (a1 - aa) / (4.0 * round);
  }
  const double cl_peak = (alpha < 0.0 ? -wing : wing) + fw->cl_de * de_w;
  const double s_hi = smoothstep(a1, a1 + 2.0 * fw->stall_blend, aa);
  const double cl_old = (1.0 - s_hi) * cl_peak + s_hi * cl_flat;
  double cl_st = cl_old, fall = 0.0, past = 0.0;
  if (sigma > 0.0 && fre > 0.0) {
    /* What the stalled wing holds is CL max, the top of the curve above,
     * with the elevator's lift on it, taken on the side the wing is
     * stalling on, so a symmetric section holds the same lift on its back
     * as right way up. */
    const int neg = alpha < 0.0;
    const double cl_s = neg ? clmax - fw->cl_de * de_w : clmax + fw->cl_de * de_w;
    cl_st = stalled_lift(fw, k_stall, fw->stall_top, cl_s, alpha_stall, alpha, sin_a, cos_a, &fall, &past);
  }
  o->cl_lin = cl_lin;
  o->sigma = sigma;
  o->cl_st = cl_st;
  o->fall = fall;
  o->past = past;
  o->cl = add_term(cl_old, fre * past * (cl_st - cl_old));
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
    /* What is left with the fin gone is the body's, Munk's couple
     * (MUNK'S MOMENT below). */
    fw_dmg.cn_beta_fus = f * fw->cn_beta_fus + (1.0 - f) * WING_BODY_CN_BETA;
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

  /* Relative wind in the body frame: still air, or the wind when a host
   * has set one, horizontal and vertical. Everything aerodynamic below,
   * the chute's drag with it, reads this. */
  double vb[3];
  double vg[3] = { s->vel[0], s->vel[1], s->vel[2] };
  if (SIM_WIND_ON) {
    double wa[3];
    plant_wind(s->step_index, wa);
    vg[0] -= wa[0];
    vg[1] -= wa[1];
    vg[2] -= wa[2];
  }
  wquat_rotate_inv(s->quat, vg, vb);
  const double u = vb[0], v = vb[1], w = vb[2];
  const double V2 = u * u + v * v + w * w;
  const double V = sim_sqrt(V2);

  if (g_chute) {
    /* Under the canopy the autopilot has let go: surfaces centred. */
    roll = 0.0;
    pitch = 0.0;
    yaw = 0.0;
  } else if (g_stab == 2) {
    g_stab_roll_i = 0.0;
    /* Acro leaves the yaw stick as the rudder alone. The owner flew the
     * Cub with the turn coordinator on (2026-09-25): every bank brought
     * its own yaw, and the damper pulled the yaw rate back onto the
     * coordinated rate against the pilot's own rudder, so rudder felt
     * mixed into the ailerons and never independent. Stabilised keeps
     * the coordinator; Acro is flown on the pilot's feet (acro_sticks). */
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
    /* The bank loop trims out a steady roll error as ArduPilot's roll
     * controller does (https://ardupilot.org/plane/docs/roll-pitch-controller-tuning.html):
     * an integrator "to slowly trim the aileron demand to remove the
     * steady error", RLL2SRV_I 0.05 ("will work for most models") on the
     * error between the roll rate its RLL2SRV_TCONST of 0.5 s asks for the
     * bank error and the rate flown, so it winds nothing up while a roll
     * tracks and trims 0.1 of a held error a second; RLL2SRV_IMAX's
     * default lets it take "up to 1/3 of the total aileron travel". In
     * stick, over the roll surface's throw, held to a third. */
    const double roll_throw = fw->mix == FW_MIX_RUDDER ? fw->throw_r : fw->throw_a;
    /* ArduPlane's stabilize_roll holds the integrator while the pilot's
     * roll stick is in (Attitude.cpp, "disable_integrator = true" when
     * channel_roll's input is not zero, as the yaw loop's is for the
     * rudder stick): it trims what the airframe does, not the pilot. On a
     * rudder only aircraft the yaw stick moves the same surface. */
    const int pilot = deadband1(roll, fw->stab_deadband) != 0.0 ||
                      (fw->mix == FW_MIX_RUDDER && deadband1(yaw, fw->stab_deadband) != 0.0);
    if (roll_throw > 0.0 && !pilot) {
      g_stab_roll_i += STAB_ROLL_I * (-(bank - bank_t) / STAB_ROLL_TCONST - s->omega[0]) / roll_throw * WING_DT;
      if (g_stab_roll_i > STAB_ROLL_IMAX) g_stab_roll_i = STAB_ROLL_IMAX;
      if (g_stab_roll_i < -STAB_ROLL_IMAX) g_stab_roll_i = -STAB_ROLL_IMAX;
    }
    roll = clamp1(add_term(-fw->stab_roll_kp * (bank - bank_t) - fw->stab_roll_kd * s->omega[0], g_stab_roll_i));
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
   *
   * Without ailerons the roll stick is a second rudder stick, the sum of
   * the two clipped at full travel. A three channel aircraft on a four
   * channel radio has its rudder on the stick that rolls a plane with
   * ailerons, so an aileron pilot's right stick banks it the way they
   * expect, through the rudder and the dihedral; the yaw stick stays live
   * for a pilot who uses it. For every other mix the rudder's stick is the
   * yaw stick, the same double.
   */
  double de = add_term(surface_from_stick(pitch, fw->throw_e, fw->tune ? fw->tune_expo[1] : fw->expo), fw->trim_e);
  double da = surface_from_stick(roll, fw->throw_a, fw->tune ? fw->tune_expo[0] : fw->expo);
  const double rudder_stick = fw->mix == FW_MIX_RUDDER ? clamp1(yaw + roll) : yaw;
  double delta_r = -surface_from_stick(rudder_stick, fw->throw_r, fw->tune ? fw->tune_expo[2] : fw->expo);
  g_cmd[0] = da;
  g_cmd[1] = de;
  g_cmd[2] = delta_r;
  double delta_e;
  if (fw->mix == FW_MIX_ELEVON) {
    g_surf[0] = clip(de - da, fw->surface_max);
    g_surf[1] = clip(de + da, fw->surface_max);
    g_surf[2] = 0.0;
    /* The Striker's fins carry small rudders; every other flying wing has
     * none, and its slot stays exactly 0.0. */
    g_surf[3] = fw->throw_r > 0.0 ? delta_r : 0.0;
    /* What the aero sees of two elevons: their mean. */
    delta_e = 0.5 * (g_surf[0] + g_surf[1]);
  } else {
    /* A rudder mix has no ailerons, and their slots read zero. */
    const int ailerons = fw->mix == FW_MIX_TAIL;
    g_surf[0] = ailerons ? -da : 0.0;
    g_surf[1] = ailerons ? da : 0.0;
    g_surf[2] = clip(de, fw->throw_e);
    g_surf[3] = delta_r;
    delta_e = g_surf[2];
  }
  /* Servo blow back (hinge_hold): each surface as far as its servos hold
   * it against the air at the free stream's dynamic pressure. The wash
   * over the tail is not in q (ESTIMATED: the slipstream's share is the
   * next item, docs/SURFACES-STAGE1.md). Each surface's own angle of
   * attack loads its hinge too (hinge_alpha): the wing's for the
   * ailerons and elevons, the stabiliser's (its zero lift angle off, the
   * downwash's share off) for the elevator, the sideslip for the rudder,
   * each the sine of the angle as the high angle terms take it, so it
   * stays bounded; a positive deflection (trailing edge up, or left) sheds
   * the load a positive angle brings, so they enter against it. The body's
   * rates' share of each surface's angle is not in it. A servo that
   * slews is pushed back with its surface, so it drives out again at its
   * own rate. */
  if (fw->hinge_hold[0] > 0.0 || fw->hinge_hold[1] > 0.0 || fw->hinge_hold[2] > 0.0) {
    const double q_h = 0.5 * PLANT.rho * V2;
    const double v_h = sim_sqrt(V2);
    const double s_w = v_h > 1e-6 ? -w / v_h : 0.0, c_w = v_h > 1e-6 ? u / v_h : 1.0;
    const double s_wing = s_w * fw->cos_zl - c_w * fw->sin_zl;
    const double s_fin = v_h > 1e-6 ? -v / v_h : 0.0;
    const double DEG_H = 180.0 / WING_PI;
    const double f_a = -fw->hinge_alpha[0] * s_wing * DEG_H;
    const double f_e = -fw->hinge_alpha[1] * s_w * DEG_H;
    const double f_r = -fw->hinge_alpha[2] * s_fin * DEG_H;
    const double lim_a = fw->mix == FW_MIX_ELEVON ? fw->surface_max : fw->throw_a;
    const double was[4] = { g_surf[0], g_surf[1], g_surf[2], g_surf[3] };
    g_surf[0] = hinge_blow(g_surf[0], fw->hinge_hold[0], q_h, f_a, lim_a);
    g_surf[1] = hinge_blow(g_surf[1], fw->hinge_hold[0], q_h, f_a, lim_a);
    g_surf[2] = hinge_blow(g_surf[2], fw->hinge_hold[1], q_h, f_e, fw->throw_e);
    g_surf[3] = hinge_blow(g_surf[3], fw->hinge_hold[2], q_h, f_r, fw->throw_r);
    if (g_surf[0] != was[0] || g_surf[1] != was[1] || g_surf[2] != was[2]) {
      delta_e = fw->mix == FW_MIX_ELEVON ? 0.5 * (g_surf[0] + g_surf[1]) : g_surf[2];
    }
    if (g_surf[3] != was[3]) {
      delta_r = g_surf[3];
    }
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
  double delta_a = 0.5 * (g_surf[1] - g_surf[0]);
  /* The knee (FixedWingParams.surf_knee): past it a surface's angle buys
   * less and less. Only a table that sets it takes the branch, so every
   * other aircraft's arithmetic is what it was. */
  if (fw->surf_knee > 0.0) {
    delta_e = surface_knee(delta_e, fw->surf_knee);
    delta_a = surface_knee(delta_a, fw->surf_knee);
    delta_r = surface_knee(delta_r, fw->surf_knee);
  }

  const double Vxz = sim_sqrt(u * u + w * w);
  /* Angle of attack of the zero lift line, which is the body's on the wing. */
  double alpha = (Vxz > 1e-6 ? sim_atan2(-w, u) : 0.0) - fw->alpha_zl;
  const double beta = V > 1e-6 ? sim_atan2(-v, Vxz) : 0.0; /* wind from the right positive */
  /* The sideslip the sideslip terms take: the angle. */
  const double beta_s = beta;
  const double qbar = 0.5 * PLANT.rho * V2;
  const double Vrate = V > 1.0 ? V : 1.0; /* floor for the rate terms */

  /* Lift and drag coefficients, with the stall blend. */
  const double clmax = fw->cl_max;
  const double alpha_stall = clmax / fw->cl_alpha;
  double sin_b = 0.0, cos_b = 1.0;
  if (Vxz > 0.5) {
    sin_b = -w / Vxz;
    cos_b = u / Vxz;
  }
  /* The flat plate after the stall, at the zero lift line's angle. */
  double sin_a = add_term(sin_b * fw->cos_zl, -(cos_b * fw->sin_zl));
  double cos_a = add_term(cos_b * fw->cos_zl, sin_b * fw->sin_zl);
  /* Near the ground (GROUND EFFECT above) the wing flies at its angle plus
   * the image's upwash, everything of the wing's below with it. */
  GroundTerms ge;
  const int ge_on = ground_terms(s, fw, alpha, clmax, &ge);
  if (ge_on) {
    const double sd = sim_sin(ge.da), cd = sim_cos(ge.da);
    const double sa = sin_a * cd + cos_a * sd;
    cos_a = cos_a * cd - sin_a * sd;
    sin_a = sa;
    alpha += ge.da;
  }
  const double cl_flat = plate_cn(fw) * sin_a * cos_a;
  double cd0 = fw->cd0;
  /* A bigger surface's drag, deflected (FixedWingParams.surf_cd): a
   * pressure drag, so after the skin's Reynolds number scaling above. */
  if (fw->surf_cd[0] > 0.0 || fw->surf_cd[1] > 0.0 || fw->surf_cd[2] > 0.0) {
    cd0 += add_term(add_term(fw->surf_cd[0] * surf_drag(delta_a), fw->surf_cd[1] * surf_drag(delta_e)),
                    fw->surf_cd[2] * surf_drag(delta_r));
  }
  /* Viterna's drag past the stall, CDmax sin^2 + B2 cos, B2 taking the
   * drag at the stall angle, cd0 + k CLmax^2, on continuously (NASA
   * TM-82944 eqs. 15 and 17); the cd0 is the skin's, along the chord. The
   * plate alone, without B2, fell short of the stalled section's drag
   * between the stall and about 30 deg (NACA 0012 at 20 deg: 0.30
   * measured, SAND80-2114 table 2, the plate 0.21 even at 2.0). */
  const double s_s = sim_sin(alpha_stall), c_s = sim_cos(alpha_stall);
  const double b2 = (fw->k_induced * clmax * clmax - plate_cn(fw) * s_s * s_s) / c_s;
  const double b2c = cos_a > 0.0 ? b2 * cos_a : 0.0;
  const double cd_flat = cd0 + plate_cn(fw) * sin_a * sin_a + b2c;
  /* Up to its stall angle the wing's lift is the plant's own curve, the
   * blend from the linear lift to the flat plate every gate's band was
   * derived on. Past it the lift is its section's (wing_lift above). */
  const double re = V * fw->chord * PLANT.rho / AIR_MU;
  const double fre = smoothstep(STALL_RE_LO, STALL_RE_HI, re);
  const double k_stall = fw->stall_k;
  WingLift wl;
  wing_lift(fw, alpha, delta_e, clmax, k_stall, fre, sin_a, cos_a, &wl);
  const double sigma = wl.sigma, cl_lin = wl.cl_lin, cl_st = wl.cl_st, fall = wl.fall, past = wl.past;
  const double cd_lin = cd0 + fw->k_induced * cl_lin * cl_lin;
  double CL = wl.cl;
  double CD = (1.0 - sigma) * cd_lin + sigma * cd_flat;
  /* The separated wing's plate share of CD (cd_flat less its cd0), kept
   * beside CD: THE PLATE'S FORCE IN A SIDESLIP, at the forces. */
  double cd_plate = sigma * (plate_cn(fw) * sin_a * sin_a + b2c);
  /* The attached wing's lift, tilted forward by the image's upwash. */
  if (ge_on) {
    CD -= (1.0 - sigma) * ge.clw * ge.da;
  }
  const double cm_stiff = fw->cm_alpha * alpha;
  const double cm_de_lin = fw->cm_de;
  double cyb = fw->cy_beta, clb = fw->cl_beta, cnb = fw->cn_beta;
  double cydr = fw->cy_dr, cldr = fw->cl_dr, cndr = fw->cn_dr;
  const double cl_lin_m = cl_lin;

  /* Forces in the body frame. */
  double F[3] = { 0.0, 0.0, 0.0 };
  if (V > 1e-6) {
    const double L = qbar * fw->area * CL;
    const double D = qbar * fw->area * CD;
    const double y_beta = qbar * fw->area * cyb * beta_s;
    const double Y = add_term(y_beta, qbar * fw->area * cydr * delta_r);
    /* Lift is perpendicular to the wind in the x z plane, up in level flight. */
    if (Vxz > 1e-6) {
      F[0] += L * (-w / Vxz);
      F[2] += L * (u / Vxz);
    }
    /* THE PLATE'S FORCE IN A SIDESLIP. Past the stall the wing's force is
     * the pressure on a separated plate, which acts normal to the plate
     * whatever the wind's sideways share: NASA TP-1538's balance measured
     * the F-16 broadside (alpha 90 deg) at 30 deg of sideslip with CY
     * -0.305 (scan, PDF p. 74) where CD 2.14 taken along the wind would
     * push it sideways by -1.07. So the plate's share of the drag
     * (cd_plate) goes with the lift, in the plane of symmetry along the
     * wind's share in it, and only the skin's, the gear's and the attached
     * wing's induced drag go along the whole wind. Below the stall
     * cd_plate is zero (sigma) and nothing moves. The plate's size in a
     * sideslip stays on the angle in the plane of symmetry, ESTIMATED: the
     * F-16's normal force falls about as cos^2 beta at 20 to 50 deg and
     * 6 percent at 90 deg and 30 deg of sideslip (docs/FLIGHTMODEL.md). */
    const double Dp = qbar * fw->area * cd_plate;
    const double Dw = add_term(D, -Dp);
    F[0] -= Dw * u / V;
    F[1] -= Dw * v / V;
    F[2] -= Dw * w / V;
    if (Vxz > 1e-6) {
      F[0] -= Dp * u / Vxz;
      F[2] -= Dp * w / Vxz;
    } else {
      F[0] -= Dp * u / V;
      F[2] -= Dp * w / V;
    }
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
  /* An electric aircraft's ESC at zero throttle does not drive the motor:
   * Spektrum's Avian ESCs ship with the brake disabled, "Motor will free
   * wheel when throttle position is zero" (SmartLink ESC instructions,
   * https://www.astramodel.cz/manualy/S/Spektrum_SmartLink_ESC_Instructions.pdf).
   * The plant used to floor the duty at 2 percent, a guard for the thrust
   * law's division, which kept every prop turning at 2 percent of its speed
   * with no thrust: a gyroscope with nothing driving it, which yawed a
   * power off pull one way every time. FITTED: an undriven prop is taken as
   * stopped once its own drag has run it down (prop_spool); a free prop
   * windmills, but its torque past the pitch speed is beyond the APC
   * static and forward rows the tables hold. */
  if (duty < 0.0) duty = 0.0;
  if (duty > 1.0) duty = 1.0;
  /* The pack or the tank, power_duty below: the duty the motor actually
   * turns at, which is the stick's while the pack is as it was seated. */
  double r_v;
  const double duty_e = power_duty(s, fw, duty, u > 0.0 ? u : 0.0, &r_v);
  const int flat = s->power_out;
  const int dead = flat || (CRASH.active && (CRASH.motor_dead[0] || CRASH.no_power));
  /* The propulsor's speed as a fraction of full: a prop's is the duty's
   * this step; a ducted fan's lags it, fan_spool above. */
  const int fan = fw->fan_tau > 0.0;
  double n = duty_e;
  if (fan) {
    n = fan_spool(fw, throttle, duty_e, dead || g_chute);
  } else if (prop_spools(fw)) {
    n = prop_spool(fw, duty_e, dead || g_chute, u > 0.0 ? u : 0.0);
  }
  const double u_pos = u > 0.0 ? u : 0.0;
  /* A fan or a prop at rest makes nothing, where 0 / 0 would be a NaN. */
  /* The chase boost's faster prop has the faster pitch speed; exact at
   * 1.0 (sim_set_boost). */
  const double mu = n > 0.0 ? u_pos / (fw->pitch_speed * SIM_BOOST * n) : 0.0;
  const double ct = (!(n > 0.0) || !(fw->thrust_static > 0.0)) ? 0.0 : prop_curve(fw->axial_curve, mu);
  double thrust = fw->thrust_static * n * n * ct;
  /* A folding prop under its throttle is stopped and folded: no thrust,
   * no rpm, no current. Open, it brakes past its pitch speed rather than
   * stopping at zero. A fixed prop stops at zero. */
  const int folded = fw->fold_duty > 0.0 && throttle < fw->fold_duty;
  if (folded) {
    thrust = 0.0;
  } else if (fw->fold_duty == 0.0 && thrust < 0.0 && !(prop_spools(fw) && prop_free(fw, duty_e))) {
    /* A fixed prop the drive holds slower than the air stops at zero, as
     * it always did; a free one windmills, and drags. */
    thrust = 0.0;
  }
  if (g_chute) thrust = 0.0; /* the motor is cut with the pull */
  if (CRASH.active) {
    thrust = dead ? 0.0 : thrust * CRASH.kt[0];
  } else if (flat) {
    thrust = 0.0;
  }
  /* The chase boost's faster prop, last; exact at 1.0 (sim_set_boost). */
  thrust *= SIM_BOOST * SIM_BOOST;
  F[0] += thrust;
  /*
   * THE PROP'S TORQUE AND ITS ROTOR, docs/FLIGHTMODEL.md "The prop's
   * torque, from the drive". q_air is the torque the prop puts into the
   * air, the wash's swirl: its static torque times n^2 times Cp over its
   * static value at this step's mu (torque_curve, APC's), where it was the
   * thrust's share: where the thrust is gone the blades' drag still takes
   * a part of the static torque, and past the windmill the air turns the
   * prop. q_react is what the drive puts on the
   * airframe through the motor's mount: the prop's torque and the rotor's
   * own acceleration, J w_f n', so the rotor's angular momentum comes out
   * of the airframe's as it spins up and goes back as it is braked. A
   * motor that is not driving (folded, cut, flat, dead) puts nothing on
   * the airframe, and its rotor coasts on: w_rot, the rotor's speed, which
   * the gyroscope below takes. A table with no rotor keeps the thrust's
   * share and the reported speed.
   */
  double q_air = fw->torque_arm * thrust;
  double q_react = q_air;
  double w_rot = -1.0;
  if (prop_spools(fw)) {
    const double w_f = 0.85 * fw->rpm_no_load * 2.0 * WING_PI / 60.0;
    const int driven = !folded && !g_chute && !dead && !prop_free(fw, duty_e);
    const double kt = CRASH.active ? CRASH.kt[0] : 1.0;
    q_air = driven ? fw->torque_arm * fw->thrust_static * n * n * prop_curve(fw->torque_curve, mu) * kt * SIM_BOOST * SIM_BOOST : 0.0;
    q_react = driven && g_mount_on ? q_air + fw->j_prop * w_f * g_prop_dn : 0.0;
    w_rot = (folded || !(kt > 0.0)) ? 0.0 : n * w_f;
  }
  /* The fuselage's crossflow drag in side view (FixedWingParams.side_cda),
   * against the sideways speed squared, at the CG (Allen and Perkins, NACA
   * TR 1048). The sideways speed is the CG's. */
  if (fw->side_cda > 0.0) {
    F[1] += -0.5 * PLANT.rho * fw->side_cda * v * sim_fabs(v);
  }
  /* A fan runs down after its drive is cut rather than stopping. */
  const double rpm = (folded || ((g_chute || dead) && !fan)) ? 0.0 : 0.85 * n * fw->rpm_no_load;
  s->motor_omega[0] = rpm * 2.0 * WING_PI / 60.0;
  s->motor_omega[1] = 0.0;
  s->motor_omega[2] = 0.0;
  s->motor_omega[3] = 0.0;
  s->pack_current = (folded || g_chute || dead) ? 0.0 : power_current(fw, n, ct, mu, r_v);
  power_drain(s, fw, duty, n);
  if (CRASH.active && CRASH.no_power) {
    s->vbat_load = 0.0;
  }

  /* A SURFACE ON A STALLED WING, docs/ZAGI-STAGE1.md: past the stall the
   * flow has left the wing's trailing edge, and a surface there turns the
   * separated wing only by the chord line it tilts, surf_sep of what it
   * did in attached flow, taken in over the stall's own blend. The
   * ailerons are on the wing on every aircraft; the elevator is on the
   * wing only on a flying wing. A table that leaves surf_sep at zero
   * multiplies by exactly 1.0, which is the arithmetic it always had. */
  const double sep_g = fw->surf_sep > 0.0 ? 1.0 - fre * past * (1.0 - fw->surf_sep) : 1.0;
  /* AILERONS PAST THE STALL, measured: NACA TR 419 (Weick and Wenzinger,
   * 1932, https://ntrs.nasa.gov/citations/19930091493), table II, a Clark
   * Y wing of aspect ratio 6 with 25 percent chord ailerons, CL max at 16
   * to 17 deg: the rolling moment at +-20, 30 and 40 deg of aileron, over
   * its value below the stall, is 0.40 four degrees past the CL max, 0.10
   * fourteen past and 0.18 twenty four past (the three deflections'
   * mean), and never reverses. Straight between those, on the wing's
   * angle past its own stall angle; scaled in by the Reynolds number's fre
   * as the rest of the stall is. Every aircraft's ailerons, which before
   * kept their whole moment through the stall unless the table gave a
   * surf_sep; the flying wing's elevator half keeps its surf_sep. */
  const double past_deg = (sim_fabs(alpha) - alpha_stall) * 180.0 / WING_PI;
  const double ail_sep = keep_at(AIL_KEEP_TR419, past_deg);
  /* The same share of the surface's shift of its strips' zero lift: a
   * surface in separated flow moves the section's lift by as little as it
   * moves the wing's (the strips below). */
  const double ail_k = 1.0 - fre * (1.0 - ail_sep);
  const double da_m = delta_a * ail_k;
  const double de_m = fw->mix == FW_MIX_ELEVON ? delta_e * sep_g : delta_e;

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
  double cl_sum = clb * beta_s + fw->cl_p * ps * b2v + fw->cl_da * da_m;

  cl_sum = add_term(cl_sum, fw->cl_r_per_cl * CL * rs * b2v);
  cl_sum = add_term(cl_sum, cldr * delta_r);
  /*
   * MUNK'S MOMENT. The fuselage's share of cn_beta (cn_beta_fus, each
   * derivation's -1.3 Vol / (S b) or Nelson's K_N term) is a slender
   * body's potential flow couple, Munk, "The Aerodynamic Forces on Airship
   * Hulls", NACA TR 184 (1924): the moment (k2 - k1) rho Vol V^2 sin 2
   * beta / 2, about the body's normal axis, on the body's axial and
   * crossflow speeds, u v. So it is taken out of the stability axis
   * terms, which hold it at full strength at 90 deg of sideslip and turn
   * a share of it into roll, and put on -u v / V^2 in the body: beta at
   * small angles (sin beta cos beta cos alpha), so a cruise flies as it
   * did; none flying sideways, and turned over with the flow from behind,
   * as the couple is. A table without it (zero) keeps its arithmetic.
   */
  const double cn_fus = fw->cn_beta_fus;
  const double munk = V > 1e-6 ? -(u * v) / V2 : 0.0;
  double cn_sum = add_term(cnb, -cn_fus) * beta_s + fw->cn_r * rs * b2v;
  cn_sum = add_term(cn_sum, fw->cn_p_per_cl * CL * ps * b2v);
  cn_sum = add_term(cn_sum, fw->cn_da_per_cl * CL * da_m);
  cn_sum = add_term(cn_sum, cndr * delta_r);
  const double cl_b = cl_sum * cos_b - cn_sum * sin_b;
  const double cn_b = cn_sum * cos_b + cl_sum * sin_b;
  /* The sideslip's own moments are mostly the fin's and the dihedral's,
   * each a surface's normal force against the sideways speed: a plate is
   * pushed against the speed across it whichever edge leads, so their
   * moments in the body do not turn over when the flow comes from behind.
   * The fuselage's share of cn_beta (Munk's, u v in the body) does turn
   * over, and is not among them: it is added in the body below.
   * The stability axes turned with cos_b do turn them over past 90 deg,
   * and falling on its side a little tail first (u < 0, the flow past 90
   * deg) every aircraft turned its nose up away from the fall, the fin
   * pushing the wrong way, which held the Extra and the CAP falling flat
   * on their sides at Vxz 0.5 m/s where cos_b snaps to 1 (the owner,
   * 2026-10-12). Their share is turned at |cos_b| instead, the angle
   * folded about 90 deg: the same arithmetic with the flow from ahead,
   * continuous through 90 deg and onto the cos_b of 1 that a flow along
   * the span takes below 0.5 m/s. The rates' and the controls' terms do
   * turn over with the flow (a deflected surface met from its trailing
   * edge pushes the other way), and stay turned with cos_b. */
  const double back = cos_b < 0.0 ? -2.0 * cos_b : 0.0;
  cl_sum = add_term(cl_b, back * clb * beta_s);
  cn_sum = add_term(add_term(cn_b, back * add_term(cnb, -cn_fus) * beta_s), cn_fus * munk);
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
   * number the section data reach, past and fre are zero and so is this.
   * (The Slow Stick's lowre arms put a moment there; they left with it on
   * 2026-10-20.) */
  const double cn_st = add_term(add_term(plate_cn(fw) * sin_a, (cl_st - cl_flat) * cos_a), b2c * sin_a);
  const double cm_post = sigma * (((1.0 - past) * fw->stall_arm_ac - past * fw->stall_arm_cp) * cn_st
                                  - fw->stall_arm_ac * cl_lin_m);
  const double cm_stall = fre * past * cm_post;
  const double m_aero = qbar * fw->area * fw->chord *
                        add_term(add_term(fw->cm_0 + cm_stiff + fw->cm_q * q_aero * c2v + cm_de_lin * de_m,
                                          cm_stall),
                                 -(fw->cg_shift / fw->chord) * CL);
  const double n_aero = qbar * fw->area * fw->span * cn_sum;
  double M[3];
  M[0] = l_aero - q_react; /* the prop turns one way; the airframe answers the other */
  /* A thrust line off the CG pitches with power, (0, z, 0) x (T, 0, 0):
   * zero on an airframe whose table leaves it out, and add_term keeps its
   * arithmetic as it was. */
  M[1] = add_term(-m_aero, fw->thrust_z * thrust);
  M[2] = -n_aero;
  /* The prop as a gyroscope: its angular momentum H along body x, and the
   * airframe's answer to turning it, -omega x H. A pitch rate nose down
   * (q positive) yaws the nose left and a yaw rate nose right pitches it
   * down, for a prop turning clockwise seen from behind. */
  if (fw->j_prop > 0.0 && g_gyro_on) {
    const double H = fw->j_prop * (w_rot < 0.0 ? s->motor_omega[0] : w_rot);
    M[1] -= s->omega[2] * H;
    M[2] += s->omega[1] * H;
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
   * others later. The left half stalls stall_asym sooner. The moments are
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
      /* A table that has its own span loading (strip_r, a lattice's)
       * takes it; the rest take Schrenk's. */
      rr[i] = fw->strip_r[0] > 0.0 ? fw->strip_r[i] : 0.5 * (1.0 + 4.0 / WING_PI * sim_sqrt(1.0 - eta * eta) / fw->strip_c[i]);
      rmax = rr[i] > rmax ? rr[i] : rmax;
      cyy += fw->strip_c[i] * eta * eta * 0.25;
    }
    const double chord_mean = fw->area / fw->span;
    const double kr = -fw->cl_p * fw->area * fw->span * fw->span /
                      (4.0 * fw->cl_alpha * chord_mean * half * half * half * cyy);
    /* A section along the span: the strip nearest its own limit, its
     * section's CL max over its share of the wing's lift, stalls first. */
    double ml = 0.0, mn = 0.0;
    for (int i = 0; i < 4; i += 1) {
      const double y = (0.125 + 0.25 * i) * half;
      /* The roll rate moves the strip across the body, p y, which is a
       * change of its angle of attack only in the part normal to the air,
       * u / V of it; the yaw rate moves it along the chord (dr). Together
       * they are the stability axis roll rate ps the linear cl_p damps,
       * so what a stalled strip takes back is what the linear wing gave. */
      const double da = (u / V) * p * y / Vrate;
      const double dr = (-w / V) * s->omega[2] * y / Vrate;
      const double st = alpha_stall * rmax / rr[i];
      double fl[2], fr[2];
      /* The table's one section for every strip. */
      const double k_i = k_stall;
      const double top_i = fw->stall_top;
      /* The aileron on this strip moves its zero lift angle, trailing edge
       * up less: the rising wing's down aileron takes it toward its stall
       * and the falling wing's up aileron away from it, against the roll
       * rate's own angle there (strip_tau, zero where there is none). */
      const double sa = fw->strip_tau[i] * delta_a;
      /* On a flying wing the elevons are the strips' own trailing edges,
       * so their elevator half moves every strip they span as well, up
       * elevon away from the stall: a wing held at its stall by up elevon
       * stalls where the elevons are not, at the root, first. A tail's
       * elevator is on the tail, and leaves the strips alone. Zero where
       * strip_tau is, so no earlier table reads it. */
      const double se = fw->mix == FW_MIX_ELEVON ? fw->strip_tau[i] * delta_e : 0.0;
      strip_stall(fw, alpha, sin_a, cos_a, -da, ail_k * add_term(sa, -se), dr, rr[i], cl_lin, st - 0.5 * fw->stall_asym, k_i, top_i, b2, fl);
      strip_stall(fw, alpha, sin_a, cos_a, da, ail_k * add_term(-sa, -se), -dr, rr[i], cl_lin, st + 0.5 * fw->stall_asym, k_i, top_i, b2, fr);
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
    /* A strip's lift and drag act across and along the air, the
     * stability axes, so they turn into the body's through the angle of
     * attack as the linear moments above do (Etkin and Reid's stability to
     * body transformation): the down going wing's extra drag damps the
     * body roll, and a lift difference, tilted forward, yaws, which also
     * takes back the yaw share of the linear cl_p the strips take back. */
    M[0] = add_term(M[0], k * ((u / Vxz) * ml + (-w / Vxz) * mn));
    M[2] = add_term(M[2], k * ((u / V) * mn - (-w / V) * ml));
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

  /* The hangar's add-ons (sim_set_addons): their drag, quadratic in the
   * air speed at its point as the canopy's is, then every force's arm
   * about the CG their mass moved. */
  if (PLANT.add_on) {
    const double *ra = PLANT.add_drag_at;
    const double *om = s->omega;
    const double va[3] = {
      u + (om[1] * ra[2] - om[2] * ra[1]),
      v + (om[2] * ra[0] - om[0] * ra[2]),
      w + (om[0] * ra[1] - om[1] * ra[0]),
    };
    const double vam = sim_sqrt(va[0] * va[0] + va[1] * va[1] + va[2] * va[2]);
    const double kd = -0.5 * PLANT.rho * PLANT.add_cda * vam;
    const double Fd[3] = { kd * va[0], kd * va[1], kd * va[2] };
    F[0] += Fd[0];
    F[1] += Fd[1];
    F[2] += Fd[2];
    M[0] += ra[1] * Fd[2] - ra[2] * Fd[1];
    M[1] += ra[2] * Fd[0] - ra[0] * Fd[2];
    M[2] += ra[0] * Fd[1] - ra[1] * Fd[0];
    const double *c = PLANT.add_shift;
    M[0] -= c[1] * F[2] - c[2] * F[1];
    M[1] -= c[2] * F[0] - c[0] * F[2];
    M[2] -= c[0] * F[1] - c[1] * F[0];
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
  .pitch_speed = 29.823, /* the prop's pitch at its full rpm; npm run prop:curves -- wings */
  /* 6 x 4: thrust and torque over static against mu, APC's; npm run prop:curves -- wings */
  .axial_curve = {
    1.0000, 0.9681, 0.9281, 0.8794, 0.8208, 0.7500, 0.6676,
    0.5739, 0.4722, 0.3641, 0.2524, 0.1400, 0.0307, -0.0767,
    -0.1845, -0.2924, -0.4002, -0.5081, -0.6159, -0.7238, -0.8316,
  },
  .torque_curve = {
    1.0000, 1.0355, 1.0645, 1.0853, 1.0886, 1.0730, 1.0324,
    0.9623, 0.8657, 0.7441, 0.5996, 0.4357, 0.2584, 0.0770,
    -0.1045, -0.2860, -0.4675, -0.6491, -0.8306, -1.0121, -1.1936,
  },
  .rpm_no_load = 20720.0,
  /* Prop reaction as a roll moment per newton of thrust. Ideal disc power
   * at static full thrust is T^1.5 / sqrt(2 rho A): 11.5 N through a 6 inch
   * disc is 184 W, at 17,600 rpm a torque of 0.10 N m, so 0.009 m per N.
   * The first figure here was 0.02, which rolled a thrown wing past sixty
   * degrees in four seconds with the sticks centred. */
  .torque_arm = 0.009,
  .j_prop = 0.000012, /* the 6 x 4 (5.7 g) and the 2216's bell, ESTIMATED: 0.7 of the blades' rod inertia plus the rotor, docs/FLIGHTMODEL.md */
  .current_full = 28.0,   /* A at static full thrust */
  .v_meas = 3.364, /* V a cell loaded, ESTIMATED: the maker names no voltage, so the fleet convention, 3.7 open circuit less 28 A through r_cell; docs/POWER-STAGE1.md */
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
  .stab_pitch_down = 8.69 * WING_PI / 180.0, /* to its power off glide, npm run stab:glide */
  .stab_trim_throttle = 0.348, /* npm run stab:glide; the stick that flies it level, elevator neutral */
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
  .stall_asym = 0.0,      /* no built in side, docs/STALL-STAGE1.md */
  .stall_k = 0.76,
  .stall_top = 2.6 * WING_PI / 180.0,
  .strip_c = { 1.250, 1.083, 0.917, 0.750 },
  .ground_effect = 1, /* GROUND EFFECT: NACA TM 77, Report 738; npm run ge:derive */
  .ge_wing = { -0.0163, 0.0, 0.0 }, /* the drawn model's wing quarter chord, npm run ge:derive */
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
  .cn_beta_fus = -0.012, /* Munk's, the pod's of cn_beta, ESTIMATED as in scripts/bramor-derive.js */
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
  .thrust_static = 22.9,  /* N: the thrust that gives the published 5 m/s climb on the 12 x 8E curve, on a full pack; npm run bramor:derive */
  .pitch_speed = 30.036, /* the prop's pitch at its full rpm; npm run prop:curves -- wings */
  /* 12 x 8 folding: thrust and torque over static against mu, APC's; npm run prop:curves -- wings */
  .axial_curve = {
    1.0000, 0.9722, 0.9376, 0.8938, 0.8385, 0.7715, 0.6916,
    0.5979, 0.4935, 0.3808, 0.2629, 0.1442, 0.0292, -0.0838,
    -0.1971, -0.3105, -0.4238, -0.5372, -0.6505, -0.7638, -0.8772,
  },
  .torque_curve = {
    1.0000, 1.0446, 1.0866, 1.1184, 1.1330, 1.1277, 1.0913,
    1.0232, 0.9199, 0.7826, 0.6188, 0.4333, 0.2286, 0.0210,
    -0.1858, -0.3927, -0.5995, -0.8064, -1.0132, -1.2201, -1.4269,
  },
  .rpm_no_load = 10434.0,
  .torque_arm = 0.0122,   /* 259 W of disc power at 8,870 rpm is 0.279 N m at 22.9 N; npm run bramor:derive */
  .j_prop = 0.00021, /* a 12 x 8 folding carbon prop (30 g) and a 200 g outrunner's bell, ESTIMATED: 0.7 of the blades' rod inertia plus the rotor, docs/FLIGHTMODEL.md */
  .thrust_z = 0.087,      /* the drawn hub over the CG */
  .current_full = 19.08,  /* A: APC 12 x 8E static at 22.9 N, 376 W shaft through a 0.82 motor on the full pack's 24.05 V; npm run bramor:derive */
  .v_meas = 4.009, /* V a cell loaded, DERIVED: a full pack's (4.2 V) at the static current, the pack the published climb is flown on; npm run bramor:derive */
  /* Its two blade CFRP pusher folds (docs/BRAMOR-STAGE1.md: it "folds
   * back along the tail cone when the plant stops the motor"), so its ESC
   * brakes the motor rather than letting it windmill. FITTED: C-Astral
   * publishes no brake threshold; the Radian's 5 percent, the same kind of
   * ESC set for folding (docs/GLIDER-STAGE1.md). */
  .fold_duty = 0.05,
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
  .stab_trim_throttle = 0.546, /* npm run stab:glide */
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
  .stall_asym = 0.0,      /* no built in side, docs/STALL-STAGE1.md */
  .stall_k = 0.89,
  .stall_top = 0.6 * WING_PI / 180.0,
  .strip_c = { 2.041, 0.875, 0.701, 0.527 },
  .side_cda = 0.047, /* 0.84 of 0.056 m^2, the pod in side view, ESTIMATED */
  .hinge_hold = { 1033.3, 0, 0 }, /* servo blow back, npm run servo:derive */
  .hinge_alpha = { 0.4626, 0, 0 }, /* npm run servo:derive */
  .ground_effect = 1, /* GROUND EFFECT: NACA TM 77, Report 738; npm run ge:derive */
  .ge_wing = { -0.1738, 0.0, 0.01 }, /* the drawn model's wing quarter chord, npm run ge:derive */
};

/* The Striker, docs/COMBAT-DRONES.md section 7: the war's pusher delta as
 * a playable aircraft, at the size src/render/strikercraft.js draws it,
 * 2.5 m over its wingtip fins. Every number is scripts/combat-derive.js's
 * (npm run combat:derive) from a parts list and the drawn planform, the
 * derivatives a vortex lattice's on the cranked delta and its fins
 * (scripts/lib/lattice.js), the estimated ones marked there. Elevons, and
 * a small rudder on each fin on the yaw stick. The two share the wing and
 * its reflex and differ in what pushes them: FW_STRIKER_PROP a 110 cc
 * boxer twin on a 30 x 14 wooden pusher, which idles as a glow engine
 * does and burns its tank; FW_STRIKER_JET a 140 N class turbojet, the
 * F-16's fan law with the jet's exit velocity for its pitch speed, whose
 * spool lags the stick by seconds and which idles rather than stops. */
const FixedWingParams FW_STRIKER_PROP = {
  .mix = FW_MIX_ELEVON,
  .span = 2.47,           /* the drawing's, tip to tip at the fins' roots */
  .area = 2.2927,         /* the drawn cranked delta, the fairing included */
  .chord = 0.9282,        /* S/b */
  .cl_alpha = 3.2484,     /* the lattice, fins on */
  .cl_max = 0.8469,       /* 0.9 of an MH 60 class section's 1.2, cos of the quarter chord's 38.4 deg */
  .alpha_zl = 0.0,        /* a reflexed section: zero lift on the body axis */
  .sin_zl = 0.0,
  .cos_zl = 1.0,
  .cd0 = 0.0238,          /* a component build up, the uncowled twin 0.020 m^2 of it, ESTIMATED */
  .k_induced = 0.1364,    /* 1/(pi e AR), Raymer's swept e 0.877 at AR 2.66 */
  .cl_de = -1.0638,       /* elevon lift, per rad: trailing edge up sheds lift */
  .cy_beta = -0.4959,     /* the fins' and the 0.34 m fuselage's; npm run combat:derive */
  .cy_dr = 0.0778,        /* the two small rudders */
  .cl_beta = -0.0671,     /* the sweep's at the cruise's lift, the bay's trim lead aboard; the fins' centroid barely over the wing; npm run combat:derive */
  .cl_p = -0.2933, /* npm run combat:derive */
  .cl_da = 0.2278, /* npm run combat:derive */
  .cl_r_per_cl = 0.1934,
  .cl_dr = 0.0035,
  .cm_0 = 0.0449,         /* the reflex: trims at the bay's trim CG, the standard warhead's 23.5 m/s cruise; npm run combat:derive */
  .cm_alpha = -0.1570,    /* static margin 0.04 of the MAC bare; the bay's warhead and trim lead add to it */
  .cm_q = -1.4020,
  .cm_de = 0.4516,        /* delta_e positive pitches the nose up */
  .cn_beta = 0.0208,      /* the fins, less most of it back to the long fuselage; npm run combat:derive */
  .cn_beta_fus = -0.0504, /* the long fuselage's, Munk's -1.3 Vol / (S b) of cn_beta; npm run combat:derive */
  .cn_r = -0.0646, /* npm run combat:derive */
  .cn_p_per_cl = -0.2325,
  .cn_da_per_cl = 0.0337,
  .cn_dr = -0.0285,
  .stall_blend = 3.0 * WING_PI / 180.0,
  /* The throws: seven degrees of aileron for a roll of 80 deg/s at the
   * cruise, a big stable delta's; eighteen of elevator, which holds the
   * heaviest warhead in the nose at its stall; each elevon clips at 24. */
  .throw_a = 7.0 * WING_PI / 180.0,
  .throw_e = 18.0 * WING_PI / 180.0,
  .throw_r = 25.0 * WING_PI / 180.0,
  .surface_max = 24.0 * WING_PI / 180.0,
  .expo = 0.30,
  .thrust_static = 283.25, /* N: 8.2 kW at 5,000 rpm through the 30 in disc at a figure of merit of 0.55 */
  .pitch_speed = 29.633, /* the prop's pitch at its full rpm; npm run prop:curves -- wings */
  /* 30 x 14 (0.47): thrust and torque over static against mu, APC's; npm run prop:curves -- wings */
  .axial_curve = {
    1.0000, 0.9609, 0.9155, 0.8630, 0.8023, 0.7344, 0.6581,
    0.5750, 0.4861, 0.3916, 0.2952, 0.1969, 0.0990, 0.0035,
    -0.0920, -0.1875, -0.2830, -0.3785, -0.4740, -0.5695, -0.6650,
  },
  .torque_curve = {
    1.0000, 1.0261, 1.0466, 1.0564, 1.0515, 1.0322, 0.9927,
    0.9311, 0.8479, 0.7459, 0.6230, 0.4789, 0.3186, 0.1476,
    -0.0227, -0.1928, -0.3629, -0.5330, -0.7031, -0.8732, -1.0433,
  },
  .rpm_no_load = 5882.4,   /* the plant's rule: 5,000 is 0.85 of it */
  .torque_arm = 0.05529,   /* 15.7 N m on the shaft over the static thrust */
  .thrust_z = 0.0196,      /* the shaft on the fuselage's axis, over the CG */
  .current_full = 0.0,     /* the engine burns fuel, not the pack */
  .stab_bank_max = 45.0 * WING_PI / 180.0,
  .stab_pitch_max = 20.0 * WING_PI / 180.0,
  .stab_trim_pitch = 2.0 * WING_PI / 180.0,
  .stab_deadband = 0.04,
  .stab_roll_kp = 2.0,
  .stab_roll_kd = 0.2,
  .stab_pitch_kp = 4.0,
  .stab_pitch_kd = 0.8,
  .stab_pitch_down = 6.82 * WING_PI / 180.0, /* to its power off glide at the bay's trim CG, npm run stab:glide */
  .stab_trim_throttle = 0.602, /* npm run stab:glide; the stick that flies it level with the standard warhead, elevons neutral */
  .acro_roll_rate = 90.0 * WING_PI / 180.0,
  .acro_pitch_rate = 40.0 * WING_PI / 180.0,
  .acro_expo = 0.30,
  .acro_err_max = 5.0 * WING_PI / 180.0,
  .acro_roll_kp = 5.0,
  .acro_roll_kd = 0.4,
  .acro_roll_ff = 0.553,  /* the stick for a rate at cruise, pb/2V 0.095; npm run combat:derive */
  .acro_pitch_kp = 5.0,
  .acro_pitch_kd = 0.8,
  .acro_pitch_ff = 0.182, /* the stick for a pull's pitch rate at cruise; npm run combat:derive */
  .acro_roll_ki = 6.0,
  .acro_pitch_ki = 8.0,
  .acro_i_max = 0.30,
  .yaw_coord_k = 0.0,     /* the rudders are the yaw stick's alone */
  /* A gasoline twin's carburettor idles it at a quarter of its rpm; 2.5 l
   * of fuel, 600 g/kWh at full and linear in the rpm through zero; a lean
   * run over the last 5 percent, ESTIMATED. */
  .throttle_idle = 0.25,
  .tank_m3 = 0.0025,
  .flow_full = 1.84685e-6,
  .flow_idle = 4.61712e-7,
  .lean_frac = 0.05,
  .lean_gain = 0.03,
  /* Past the stall: a reflexed section held 2.8 deg past its peak and
   * keeping 0.92 of it, the MH45's at 2e5 (UIUC), the nearest published;
   * the flying wing's arms. */
  .stall_arm_ac = -0.0483,
  .stall_arm_cp = 0.1983,
  .stall_asym = 0.0,      /* no built in side, docs/STALL-STAGE1.md */
  .stall_k = 0.92,
  .stall_top = 2.8 * WING_PI / 180.0,
  .strip_c = { 1.6690, 1.1360, 0.7850, 0.4341 }, /* the cranked planform's chords */
  .j_prop = 0.01652,      /* the 30 in wooden blades and the crank */
  .strip_tau = { 0.0, 0.4515, 0.5572, 0.4553 }, /* the elevons, 0.32 to 1.12 m out */
  .surf_sep = 0.2939,     /* the elevon's chord fraction at the MAC over its tau */
  .strip_r = { 0.7183, 0.9870, 1.2169, 1.6347 }, /* the lattice's span loading: the tips most; npm run combat:derive */
  .ground_effect = 1, /* GROUND EFFECT: NACA TM 77, Report 738; npm run ge:derive */
  .ge_wing = { -0.0478, 0.0, -0.0504 }, /* the drawn model's wing quarter chord, npm run ge:derive */
};

const FixedWingParams FW_STRIKER_JET = {
  .mix = FW_MIX_ELEVON,
  .span = 2.47,
  .area = 2.2927,
  .chord = 0.9282,
  .cl_alpha = 3.2484,
  .cl_max = 0.8469,
  .alpha_zl = 0.0,
  .sin_zl = 0.0,
  .cos_zl = 1.0,
  .cd0 = 0.0190,          /* the nacelle's 0.010 m^2 in place of the twin's, ESTIMATED */
  .k_induced = 0.1364,
  .cl_de = -1.0638,
  .cy_beta = -0.4968,
  .cy_dr = 0.0778,
  .cl_beta = -0.0396,     /* at its faster cruise's lower lift */
  .cl_p = -0.2885,
  .cl_da = 0.2254,
  .cl_r_per_cl = 0.1934,
  .cl_dr = 0.0031,
  .cm_0 = 0.0123,         /* its elevons rigged to trim with the standard warhead at its 45 m/s cruise */
  .cm_alpha = -0.1570,
  .cm_q = -1.4020,
  .cm_de = 0.4516,
  .cn_beta = 0.0302,
  .cn_beta_fus = -0.0504, /* the long fuselage's, Munk's -1.3 Vol / (S b) of cn_beta; npm run combat:derive */
  .cn_r = -0.0652,
  .cn_p_per_cl = -0.2325,
  .cn_da_per_cl = 0.0337,
  .cn_dr = -0.0285,
  .stall_blend = 3.0 * WING_PI / 180.0,
  /* Four degrees of aileron: it cruises at 45 m/s, and that rolls it at
   * 110 deg/s. */
  .throw_a = 4.0 * WING_PI / 180.0,
  .throw_e = 18.0 * WING_PI / 180.0,
  .throw_r = 25.0 * WING_PI / 180.0,
  .surface_max = 24.0 * WING_PI / 180.0,
  .expo = 0.30,
  .thrust_static = 140.0, /* N, the class's */
  .pitch_speed = 420.0,   /* the jet's exit velocity: T = mdot (Ve - V), ESTIMATED */
  /* T = mdot (Ve - V), straight to the exit velocity; no rotor and no pack, so nothing reads a torque curve */
  .axial_curve = {
    1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4,
    0.3, 0.2, 0.1, 0.0, -0.1, -0.2, -0.3,
    -0.4, -0.5, -0.6, -0.7, -0.8, -0.9, -1.0,
  },
  .rpm_no_load = 147058.8, /* the plant's rule on the class's 125,000 rpm at full */
  .torque_arm = 0.0,      /* a turbojet's reaction is its own shaft's, nothing to the airframe */
  .thrust_z = 0.1099,     /* the nacelle on the tail, over the axis: power pitches the nose down */
  .current_full = 0.0,
  .stab_bank_max = 45.0 * WING_PI / 180.0,
  .stab_pitch_max = 20.0 * WING_PI / 180.0,
  .stab_trim_pitch = 2.0 * WING_PI / 180.0,
  .stab_deadband = 0.04,
  .stab_roll_kp = 1.5,
  .stab_roll_kd = 0.15,
  .stab_pitch_kp = 2.5,
  .stab_pitch_kd = 0.4,
  .stab_pitch_down = 20.13 * WING_PI / 180.0, /* to its glide on the idle's thrust at the bay's trim CG, npm run stab:glide */
  .stab_trim_throttle = 0.689, /* npm run stab:glide; the stick that flies it level with the standard warhead, elevons neutral */
  .acro_roll_rate = 120.0 * WING_PI / 180.0,
  .acro_pitch_rate = 50.0 * WING_PI / 180.0,
  .acro_expo = 0.30,
  .acro_err_max = 5.0 * WING_PI / 180.0,
  .acro_roll_kp = 4.0,
  .acro_roll_kd = 0.3,
  .acro_roll_ff = 0.506,
  .acro_pitch_kp = 4.0,
  .acro_pitch_kd = 0.5,
  .acro_pitch_ff = 0.093,
  .acro_roll_ki = 6.0,
  .acro_pitch_ki = 8.0,
  .acro_i_max = 0.30,
  .yaw_coord_k = 0.0,
  /* The turbine's idle, set by its thrust, 4 percent of full on the fan
   * law's speed squared; 4 l of kerosene, 0.45 l/min at full and 0.10 at
   * idle, ESTIMATED from the class. A turbine runs at an even speed to a
   * dry tank: no lean run. */
  .throttle_idle = 0.2,
  .tank_m3 = 0.004,
  .flow_full = 7.5e-6,
  .flow_idle = 1.66667e-6,
  .stall_arm_ac = -0.0483,
  .stall_arm_cp = 0.1983,
  .stall_asym = 0.0,      /* no built in side, docs/STALL-STAGE1.md */
  .stall_k = 0.92,
  .stall_top = 2.8 * WING_PI / 180.0,
  .strip_c = { 1.6690, 1.1360, 0.7850, 0.4341 },
  .j_prop = 0.00014,      /* the compressor, turbine wheels and shaft, ESTIMATED */
  .strip_tau = { 0.0, 0.4515, 0.5572, 0.4553 },
  .surf_sep = 0.2939,
  .strip_r = { 0.7201, 0.9895, 1.2200, 1.6389 },
  /* The spool: a critically damped second order response, idle to 90
   * percent of full in about 3.5 s, a small turbine's ECU limited
   * acceleration, ESTIMATED. No ESC start ramp: it is lit before the run. */
  .fan_tau = 0.9,
  .esc_start = 0.0,
  .ground_effect = 1, /* GROUND EFFECT: NACA TM 77, Report 738; npm run ge:derive */
  .ge_wing = { -0.0478, 0.0, -0.0601 }, /* the drawn model's wing quarter chord, npm run ge:derive */
};
