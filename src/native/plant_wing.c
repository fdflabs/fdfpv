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
 * old timer, which adds a glow engine's throttle; and FW_KADET1981, SIG's
 * Kadet Senior of docs/KADET-STAGE1.md, the same three channels and glow
 * throttle on a 78 in trainer with a four stroke; and
 * FW_UGLYSTIK1567, Phil Kraft's Das Ugly Stik of docs/UGLYSTIK-STAGE1.md,
 * a four channel sport aerobat on a two stroke glow engine, which adds
 * nothing; and FW_TIGERMOTH1803, Great Planes' Tiger Moth ARF of
 * docs/TIGERMOTH-STAGE1.md, a scale biplane on a glow engine, which adds
 * the second wing (docs/PITTS-STAGE1.md, written for the Pitts S-1S that
 * brought it and was removed on 2026-09-29): each wing's lift in the
 * other's flow, Prandtl's induced drag and each wing's own stall.
 * A term an airframe does not have
 * is zero in its table, and every term a later aircraft added is written
 * so that a zero leaves the earlier ones' arithmetic bit for bit what it
 * was: their gates and recorded trace hashes are the proof. The bands each
 * airframe has to land in are scripts/wing-gates.js,
 * scripts/skyhunter-gates.js, scripts/cub-gates.js,
 * scripts/glider-gates.js, scripts/bramor-gates.js,
 * scripts/slowstick-gates.js, scripts/timber-gates.js,
 * scripts/bombshell-gates.js, scripts/kadet-gates.js,
 * scripts/uglystik-gates.js and scripts/tigermoth-gates.js.
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
/* What the elevator to flap mix put on top of the notch last step, so the
 * drawn flaps are the ones flying. Zero without the mix. */
static double g_flap_mix = 0.0;

/*
 * THE RETRACTS, docs/P51-STAGE1.md: the gear selected up (1) or down (0),
 * and where it is, 0 down and locked to 1 up, travelling at 1/gear_time a
 * second. A reset puts it down and locked; every aircraft without
 * retracts keeps both at zero.
 */
static int g_gear_up = 0;
static double g_gear = 0.0;

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
/* The ducted fan's speed, as a fraction of its full throttle speed, and
 * its rate, per second; and the ESC's startup ramp, the command it lets
 * through while it starts a stopped motor, 1 once it has. The fan is
 * stopped and the ramp at its start after a reset. Nothing reads them on
 * an airframe without a fan (fan_tau 0). */
static double g_fan_n = 0.0;
static double g_fan_v = 0.0;
static double g_esc_ramp = 0.0;

/* A fan that idles is a turbine: a ducted fan's table with an idle. No
 * table had both before the Striker's, so this is false on every other. */
static int fan_idles(const FixedWingParams *fw) {
  return fw && fw->fan_tau > 0.0 && fw->throttle_idle > 0.0;
}

/* THE DISCUS LAUNCH (FixedWingParams.discus_v): the phase, 0 none, 1 the
 * pilot's turn, 2 the zoom under the launch preset; the turn's time, s,
 * its centre, world x y, and the CG's height on it, m, the angle round it
 * the turn starts at, rad, its angular acceleration, rad/s^2, and how long
 * it lasts, s. Nothing reads them on an aircraft without one. */
static int g_discus = 0;
static double g_discus_t = 0.0;
static double g_discus_c[3] = { 0.0, 0.0, 0.0 };
static double g_discus_a0 = 0.0;
static double g_discus_acc = 0.0;
static double g_discus_T = 0.0;

/* A biplane's wings as the last step took them (biplane_lift): each
 * wing's own lift coefficient, top and bottom, and the linear lift each
 * would carry at the cell's angle alone. Zero on a monoplane. Read only
 * by sim_wing_biplane, for the gates; nothing in a step reads it. */
static double g_bip[4];
void plant_wing_biplane(double out[4]) {
  for (int i = 0; i < 4; i += 1) {
    out[i] = g_bip[i];
  }
}

/* The share of a prop's swirl that reaches the fin past the wing's root,
 * the rest turned straight by the root (plant_wing_step, the slipstream).
 * Selig (AIAA 2010-7938, sec. B): on "a typical aerobatic RC/UAV
 * configuration capable of hover, the net right rolling moment" of the
 * swirl "is near 40% of the propeller torque". On the Extra 300 3D at its
 * hover the root's (1 - K) Q and the fin's roll make 0.40 Q at K = 0.743
 * (scripts/extra-derive.js); the fuselage's coil, which Selig counts, is in
 * the root's share. docs/FLIGHTMODEL.md. */
#define SWIRL_KEEP 0.74

/* The slipstream as the last step took it (FixedWingParams.slip_r): its
 * roll, pitch and yaw moments in the body frame as they were added, the
 * disc's pressure jump, the induced speed and the swirl's sideways speed
 * over the fin. Zero without a wash. Read only by sim_wing_slip, for the
 * gates that take one term of the moment alone; nothing in a step reads
 * it. */
static double g_slip[6];

void plant_wing_slip(double out[6]) {
  for (int i = 0; i < 6; i += 1) {
    out[i] = g_slip[i];
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

/* AS3X's share of its gain at a stick, Spektrum's priority 160. */
#define AS3X_PRIORITY 1.6
static double as3x_priority(double stick) {
  const double g = 1.0 - AS3X_PRIORITY * sim_fabs(stick);
  return g > 0.0 ? g : 0.0;
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
  s->v_cell0 = plant_lipo_ocv(s->soc0);
  s->v_cell = s->v_cell0;
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
 * pitch speed and current are the pack's as it was seated; now they are
 * the pack's at a speed scaled by the loaded voltage now over the loaded
 * voltage seated, at last step's current, and a duty scaled by that ratio
 * carries it through the thrust (speed squared) and the pitch speed
 * (speed). At the seat the ratio is exactly 1 and every product below is
 * the table's. *r_v is the ratio, for power_current. Once the ESC's low
 * voltage cutoff has acted (power_drain) the duty is held under its cap.
 *
 * GLOW. Over the last lean_frac of the tank the mixture leans and the rpm
 * rises by up to lean_gain, then power_drain stops the engine.
 */
static double power_duty(const SimState *s, const FixedWingParams *fw, double duty, double *r_v) {
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
  if (!pack_drains(fw)) {
    return duty;
  }
  const double sag = s->pack_current * PLANT.r_cell;
  *r_v = (s->v_cell - sag) / (s->v_cell0 - sag);
  const double de = duty * *r_v;
  return de < s->lvc_cap ? de : s->lvc_cap;
}

/*
 * The pack's current, from the power the prop takes. A prop at a speed
 * takes power as its power coefficient; the plant's thrust law has the
 * thrust coefficient fall as 1 - V / (pitch speed), and APC's published
 * performance data (the 11 x 7E at 9,000 rpm, PER3_11x7E.dat) give how the
 * power coefficient goes with it: CP_OF_CT, Cp over its static value at
 * Ct over its static value 0, 0.1, ..., 1. It hardly moves until the thrust
 * has fallen by a third and is a fifth of static where the thrust is gone
 * (the 8 x 4E, 12 x 6 and 13 x 8E agree within a few percent). So the
 * current is the table's full throttle current times the prop's speed
 * cubed, the motor's torque (the square) through the ESC's switching (the
 * duty), times that ratio; the same power off a sagged pack is more
 * current, so it is over r_v. Nothing while the prop makes no thrust.
 */
#define CP_OF_CT_N 11
static const double CP_OF_CT[CP_OF_CT_N] = {
  0.187, 0.358, 0.517, 0.661, 0.789, 0.901, 0.994, 1.064, 1.099, 1.088, 1.000,
};

static double power_current(const FixedWingParams *fw, double de, double ct, double r_v) {
  if (!(fw->current_full > 0.0) || !(ct > 0.0)) {
    return 0.0;
  }
  /* A ducted fan's power is its speed's cube whatever the airspeed, so
   * its ratio stays the static one, CP_OF_CT's last. */
  double g = CP_OF_CT[CP_OF_CT_N - 1];
  if (ct < 1.0 && !(fw->fan_tau > 0.0)) {
    const double x = ct * (double)(CP_OF_CT_N - 1);
    const int i = (int)x;
    g = CP_OF_CT[i] + (x - (double)i) * (CP_OF_CT[i + 1] - CP_OF_CT[i]);
  }
  return fw->current_full * de * de * de * g / r_v;
}

/*
 * One step's draw. The pack: the step's current out of its charge, the
 * curve's voltage at what is left, and the loaded voltage under the
 * current; flat when the charge is gone. The ESC's soft low voltage
 * cutoff: when the loaded cell voltage falls under its threshold it caps
 * the duty at the one whose current leaves it there, taking the current as
 * the duty squared at the airspeed it has, and the cap holds until the
 * pack is changed, as a hobby ESC's does until it is re-armed. The tank:
 * the fuel the engine burns at its rpm this step, linear from the idle's
 * flow to the full's; dry, the engine quits. A flat pack and a dry tank
 * leave power_out set until a reset, a new pack or a new power system.
 */
static void power_drain(SimState *s, const FixedWingParams *fw, double duty, double de) {
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
    const double cap = i_max > 0.0 ? de * sim_sqrt(i_max / s->pack_current) : 0.0;
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

/* A surface's normal force over its linear one, x = a (angle), when it
 * saturates on a flat plate's cn: 1 / (1 + (x / cn)^4)^(1/4), 1 at x = 0
 * and cn / |x| far past it. hi_alpha's, docs/EXTRA-STAGE1.md. */
static double plate_ratio(double x, double cn) {
  const double n = x / cn;
  return 1.0 / sim_sqrt(sim_sqrt(1.0 + n * n * n * n));
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
/* The air's vertical velocity at the craft, m/s up, the host's
 * (sim_set_air_vertical): a thermal, a ridge's lift, a dam's sink, which
 * the host reads off its weather at the craft each step. */
double SIM_AIR_W = 0.0;

void plant_wind(long long step, double out[3]) {
  out[0] = SIM_WIND[0];
  out[1] = SIM_WIND[1];
  out[2] = SIM_AIR_W;
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

/* 0 off, 1 stabilised, 2 acro, 3 rate damped. The caller has range
 * checked it. */
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
  g_flap_mix = 0.0;
  g_gear_up = 0;
  g_gear = 0.0;
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
  g_discus = 0;
  g_discus_t = 0.0;
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

int plant_wing_set_gear(int up) {
  if (up && (PLANT.kind != PLANT_KIND_WING || !(PLANT.fw->gear_time > 0.0))) {
    return -1;
  }
  g_gear_up = up ? 1 : 0;
  return 0;
}

double plant_wing_gear(void) {
  return g_gear;
}

int plant_wing_gear_selected(void) {
  return g_gear_up;
}

int plant_wing_gear_down(void) {
  return g_gear == 0.0;
}

void plant_wing_gear_reset(void) {
  g_gear_up = 0;
  g_gear = 0.0;
}

int plant_wing_set_flaps(int notch) {
  if (notch != 0 && (PLANT.kind != PLANT_KIND_WING || !(PLANT.fw->flap_full > 0.0))) {
    return -1;
  }
  g_flap_notch = notch;
  return 0;
}

double plant_wing_flaps(void) {
  return add_term(g_flap, g_flap_mix);
}

void plant_wing_flaps_stow(void) {
  g_flap_notch = 0;
  g_flap = 0.0;
  g_flap_mix = 0.0;
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
  /* A turbine leaves the rail at full power: the crew runs it up before
   * the shot, since its spool takes seconds the rail does not give. */
  if (fan_idles(PLANT.fw)) {
    g_fan_n = 1.0;
    g_fan_v = 0.0;
  }
  const double fwd[3] = { speed, 0.0, 0.0 };
  double v[3];
  wquat_rotate(s->quat, fwd, v);
  s->vel[0] = v[0];
  s->vel[1] = v[1];
  s->vel[2] = v[2];
}

/*
 * THE DISCUS LAUNCH, docs/DLG-STAGE1.md: the pilot's turn, flown as a
 * path and not as a plant, because the hand holds the glider on it. The
 * turn is counter clockwise seen from above, a right handed pilot's with
 * the peg on the left tip, so the pilot stands to the glider's left and
 * the heading is the angle round the centre plus a right angle. The
 * angle is a0 + acc t^2 / 2 and the rate acc t, from standing to
 * discus_v / discus_r at the end of discus_turn. Over the last quarter of
 * the turn's time the nose comes up to discus_pitch, the arm's sweep and
 * the wrist; at the end the hand opens and the glider leaves at discus_v
 * along its nose with no rotation, and from the next step it is the
 * plant's. All of it in the fixed libm, so a replay turns the same turn.
 */
static void discus_pose(SimState *s, const FixedWingParams *fw, double t, int release) {
  const double phi = g_discus_a0 + 0.5 * g_discus_acc * t * t;
  const double cph = sim_cos(phi), sph = sim_sin(phi);
  const double psi = phi + 0.5 * WING_PI;
  const double theta = fw->discus_pitch * smoothstep(0.75 * g_discus_T, g_discus_T, t);
  const double cy = sim_cos(0.5 * psi), sy = sim_sin(0.5 * psi);
  const double cp = sim_cos(0.5 * theta), sp = sim_sin(0.5 * theta);
  s->pos[0] = g_discus_c[0] + fw->discus_r * cph;
  s->pos[1] = g_discus_c[1] + fw->discus_r * sph;
  s->pos[2] = g_discus_c[2];
  s->quat[0] = cy * cp;
  s->quat[1] = sy * sp;
  s->quat[2] = -cy * sp;
  s->quat[3] = sy * cp;
  s->omega[0] = 0.0;
  s->omega[1] = 0.0;
  s->omega[2] = 0.0;
  if (release) {
    /* Along the nose: heading psi, pitched theta up. cos psi is -sin phi
     * and sin psi is cos phi. */
    const double ct = sim_cos(theta), st = sim_sin(theta);
    s->vel[0] = fw->discus_v * ct * -sph;
    s->vel[1] = fw->discus_v * ct * cph;
    s->vel[2] = fw->discus_v * st;
    return;
  }
  const double w = g_discus_acc * t;
  s->vel[0] = w * fw->discus_r * -sph;
  s->vel[1] = w * fw->discus_r * cph;
  s->vel[2] = 0.0;
  s->omega[2] = w;
}

int plant_wing_discus_start(SimState *s, double z_release) {
  if (PLANT.kind != PLANT_KIND_WING || PLANT.fw == 0 || !(PLANT.fw->discus_v > 0.0)) {
    return -1;
  }
  const FixedWingParams *fw = PLANT.fw;
  const double w = s->quat[0], x = s->quat[1], y = s->quat[2], z = s->quat[3];
  const double psi = sim_atan2(2.0 * (w * z + x * y), 1.0 - 2.0 * (y * y + z * z));
  const double phi_rel = psi - 0.5 * WING_PI;
  g_discus_c[0] = s->pos[0] - fw->discus_r * sim_cos(phi_rel);
  g_discus_c[1] = s->pos[1] - fw->discus_r * sim_sin(phi_rel);
  g_discus_c[2] = z_release;
  const double wf = fw->discus_v / fw->discus_r;
  g_discus_a0 = phi_rel - fw->discus_turn;
  g_discus_acc = wf * wf / (2.0 * fw->discus_turn);
  g_discus_T = 2.0 * fw->discus_turn / wf;
  g_discus_t = 0.0;
  g_discus = 1;
  g_acro_held = 0;
  discus_pose(s, fw, 0.0, 0);
  return 0;
}

int plant_wing_discus_hold(SimState *s) {
  if (g_discus != 1) {
    return 0;
  }
  const FixedWingParams *fw = PLANT.fw;
  g_discus_t += WING_DT;
  if (g_discus_t >= g_discus_T) {
    discus_pose(s, fw, g_discus_T, 1);
    g_discus = 2;
    g_acro_held = 0;
    return 1;
  }
  discus_pose(s, fw, g_discus_t, 0);
  return 1;
}

int plant_wing_discus_phase(void) {
  return g_discus;
}

void plant_wing_discus_stop(void) {
  g_discus = 0;
  g_discus_t = 0.0;
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
static double stalled_lift(const FixedWingParams *fw, double k, double top, double cl_s, double stall, double shift,
                           double aa, double sin_a, double cos_a, double *fall, double *past) {
  const double a0 = stall + top;
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
                        double dr, double r, double cl_lin, double dcl_f, double stall, double k, double top, double out[2]) {
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
  const double lift = stalled_lift(fw, k, top, hold, stall, dcl_f / fw->cl_alpha, aa, sp, cp, &fall, &past);
  const double blended = (1.0 - sigma) * lin + sigma * lift;
  /* The linear wing's roll damping acts on the roll about the flight path,
   * the roll rate's da and the yaw rate's dr together (plant_wing_step's
   * stability axis rates), so a stalled strip takes both back. */
  const double ref = r * fw->cl_alpha * add_term(alpha, dcl_f / fw->cl_alpha) + fw->cl_alpha * (da + dr);
  out[0] = past * (blended - ref);
  out[1] = past * sigma * (2.0 * sp * sp - fw->k_induced * cl_lin * cl_lin);
}

/*
 * ONE LIFTING SURFACE'S LIFT, the plant's curve for the whole wing at the
 * angle alpha (the zero lift line's), with the elevator's delta_e and the
 * flaps' dcl_f: the linear lift, the stall blend to the flat plate, and
 * past the stall angle the section's, stalled_lift above. The plant's lift
 * is the whole wing's, which is this once; a biplane's is this for each
 * of its wings (biplane_lift below). sin_a and cos_a are the zero lift
 * line's, which the plate is taken at.
 */
typedef struct {
  double cl_lin; /* the linear lift, elevator and flaps included */
  double sigma;  /* the stall blend, 0 short of it and 1 through it */
  double cl_st;  /* the stalled lift past the stall angle */
  double fall;   /* how far through its fall the stalled lift is */
  double past;   /* how far past the stall angle, over a stall_blend */
  double cl;     /* the lift */
} WingLift;
static void wing_lift(const FixedWingParams *fw, double alpha, double delta_e, double dcl_f, double clmax, double k_stall,
                      double fre, double sin_a, double cos_a, WingLift *o) {
  const double alpha_stall = clmax / fw->cl_alpha;
  const double aa = sim_fabs(add_term(alpha, dcl_f / fw->cl_alpha));
  const double sigma = smoothstep(alpha_stall - fw->stall_blend, alpha_stall + fw->stall_blend, aa);
  const double cl_lin = add_term(fw->cl_alpha * alpha + fw->cl_de * delta_e, dcl_f);
  const double cl_flat = 2.0 * sin_a * cos_a;
  /* THE TOP OF THE CURVE, docs/FLIGHTMODEL.md: a wing's CL max is the peak
   * of its lift curve, which every derivation's stall speed, sqrt(2 W / rho
   * S CL max), is built on. The wing's own lift, the angle's share of
   * cl_lin, follows the linear line to a stall_blend short of the stall
   * angle CL max / CL alpha, leaves it below on the parabola tangent to it
   * there, and tops out at CL max a stall_blend past it, level; a section's
   * curve is concave over its top, never above its line. The elevator's
   * and the flaps' lift ride on it as before. Past the top it holds CL max
   * until the stalled lift below takes it, or, short of the Reynolds number
   * the section data reach, blends to the flat plate over two
   * stall_blends. sigma, the blend that brings in the plate's drag and the
   * stall's moments, and the strips' stall angle are where they always
   * were: the drag rises before the peak, as a real section's does, and
   * the gates measure the stall at the linear crossing. */
  const double aw = add_term(alpha, dcl_f / fw->cl_alpha);
  const double a0 = alpha_stall - fw->stall_blend;
  const double a1 = alpha_stall + fw->stall_blend;
  double wing = clmax;
  if (aa < a0) {
    wing = fw->cl_alpha * aa;
  } else if (aa < a1) {
    wing = clmax - fw->cl_alpha * (a1 - aa) * (a1 - aa) / (4.0 * fw->stall_blend);
  }
  const double cl_peak = (aw < 0.0 ? -wing : wing) + fw->cl_de * delta_e;
  const double s_hi = smoothstep(a1, a1 + 2.0 * fw->stall_blend, aa);
  const double cl_old = (1.0 - s_hi) * cl_peak + s_hi * cl_flat;
  double cl_st = cl_old, fall = 0.0, past = 0.0;
  if (sigma > 0.0 && fre > 0.0) {
    const double shift = dcl_f / fw->cl_alpha;
    /* What the stalled wing holds is CL max, the top of the curve above,
     * with the elevator's lift on it, taken on the side the wing is
     * stalling on, so a symmetric section holds the same lift on its back
     * as right way up. */
    const int neg = add_term(alpha, shift) < 0.0;
    const double cl_s = neg ? clmax - fw->cl_de * delta_e : clmax + fw->cl_de * delta_e;
    cl_st = stalled_lift(fw, k_stall, fw->stall_top, cl_s, alpha_stall, shift, add_term(alpha, shift), sin_a, cos_a, &fall, &past);
  }
  o->cl_lin = cl_lin;
  o->sigma = sigma;
  o->cl_st = cl_st;
  o->fall = fall;
  o->past = past;
  o->cl = add_term(cl_old, fre * past * (cl_st - cl_old));
}

/*
 * THE SECOND WING, docs/PITTS-STAGE1.md (FixedWingParams.bip_*). Each wing
 * is the plant's curve (wing_lift) at bip_r times the cell's angle,
 * elevator and flaps, which is its own lift coefficient: the wing that
 * carries more for its area reaches its CL max first, and stalls first.
 * The two are taken twice. First each wing alone at the cell's angle; then
 * each again, its angle moved by what its partner falls short of its
 * linear lift: a stalled wing's trailing sheet and bound vortex stop
 * washing the other down, which gains bip_m of the lift lost. The cell's
 * lift is the wings' own, each over the reference area (bip_w / bip_r),
 * which in the linear range is exactly the table's cl_alpha. Its drag: the
 * section's zero lift drag once, each wing's plate as it stalls, and
 * Prandtl's induced drag on the lift each wing's attached flow carries,
 * CL_i (bip_ki CL_i + bip_kx CL_j), which on the cell's linear split is the
 * equivalent monoplane's k CL^2 on Munk's span. Its pitching moment past
 * the linear lift the table's cm_alpha holds, cm: each wing's stall at its
 * own arm, the stall model's (plant_wing_step's cm_post) with the arms
 * moved by bip_x, and the lift a wing gains from its partner's stall at
 * its aerodynamic centre. The low Reynolds number arms (lowre_arm_*) are
 * the Slow Stick's alone and are not taken here. Nothing here runs for a
 * monoplane.
 */
static void biplane_lift(const FixedWingParams *fw, double alpha, double delta_e, double dcl_f, double clmax, double k_stall,
                         double fre, double sin_a, double cos_a, double cd0, double *CL, double *CD, double *cm) {
  WingLift alone[2], wl[2];
  for (int i = 0; i < 2; i += 1) {
    const double r = fw->bip_r[i];
    wing_lift(fw, r * alpha, r * delta_e, r * dcl_f, clmax, k_stall, fre, sin_a, cos_a, &alone[i]);
  }
  for (int i = 0; i < 2; i += 1) {
    const double r = fw->bip_r[i];
    const double lost = alone[1 - i].cl - alone[1 - i].cl_lin;
    wing_lift(fw, r * alpha - fw->bip_m[i] * lost / fw->cl_alpha, r * delta_e, r * dcl_f, clmax, k_stall, fre, sin_a, cos_a, &wl[i]);
  }
  const double plate = 2.0 * sin_a * sin_a;
  const double cl_flat = 2.0 * sin_a * cos_a;
  /* With hi_alpha the tail's own angle carries the downwash's loss, as in
   * plant_wing_step, and stall_dw is not taken again. */
  const double dw = fw->hi_alpha ? 0.0 : fw->stall_dw;
  double cl = 0.0, cd = cd0, m = 0.0;
  for (int i = 0; i < 2; i += 1) {
    const WingLift *a = &wl[i];
    const double area = fw->bip_w[i] / fw->bip_r[i];
    cl += area * a->cl;
    cd += area * a->sigma * plate + (1.0 - a->sigma) * a->cl_lin * (fw->bip_ki[i] * a->cl_lin + fw->bip_kx[i] * wl[1 - i].cl_lin);
    const double ac = fw->stall_arm_ac + fw->bip_x[i];
    const double cp = fw->stall_arm_cp - fw->bip_x[i];
    const double lin = alone[i].cl_lin;
    const double cn_st = add_term(2.0 * sin_a, (a->cl_st - cl_flat) * cos_a);
    const double stall = fre * a->past * a->sigma;
    const double post = ((1.0 - a->past) * ac - a->past * cp) * cn_st - ac * lin - dw * (lin - a->cl_st);
    m += area * (stall * post + (1.0 - stall) * ac * (a->cl_lin - lin));
  }
  for (int i = 0; i < 2; i += 1) {
    g_bip[i] = wl[i].cl;
    g_bip[2 + i] = alone[i].cl_lin;
  }
  *CL = cl;
  *CD = cd;
  *cm = m;
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
    fw_dmg.slip_cl_a = fw->slip_cl_a * h;
    fw_dmg.slip_cm_a = fw->slip_cm_a * h;
    fw_dmg.slip_cn_b = fw->slip_cn_b * f;
    fw_dmg.slip_cn_r = fw->slip_cn_r * f;
    fw_dmg.slip_cy_b = fw->slip_cy_b * f;
    fw_dmg.slip_cl_b = fw->slip_cl_b * f;
    fw = &fw_dmg;
  }
  double roll = rc[0];
  double pitch = rc[1];
  double yaw = rc[2];
  const double throttle = rc[3];

  /* Relative wind in the body frame: still air, or for an airframe that
   * flies in it, the thermals' rise, which is a wind from below, and the
   * wind when a host has set one, horizontal and vertical. Everything aerodynamic below,
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
  if (fw->air_lift) {
    const double va[3] = { vg[0], vg[1], vg[2] - plant_air_lift(s->pos) };
    wquat_rotate_inv(s->quat, va, vb);
  } else {
    wquat_rotate_inv(s->quat, vg, vb);
  }
  const double u = vb[0], v = vb[1], w = vb[2];
  const double V2 = u * u + v * v + w * w;
  const double V = sim_sqrt(V2);
  /* The discus launch's zoom lasts as long as the climb does. */
  if (g_discus == 2 && !(s->vel[2] > 0.0)) {
    g_discus = 0;
  }
  const int preset = g_discus == 2;
  /* The pitch stick as the radio has it, before any stabiliser below
   * rewrites it: the elevator to flap mix is the transmitter's. */
  const double pitch_radio = g_chute ? 0.0 : pitch;

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
    if (preset) {
      pitch_t = fw->discus_pitch + fw->stab_pitch_max * deadband1(pitch, fw->stab_deadband);
    }
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
  /* The radio's elevator to flap mix, a pilot's 3D setup ("elevator
   * flaps", docs/FLIGHTMODEL.md): up elevator lowers the flaps by
   * elev_flap of their full travel at full stick, on top of the notch.
   * It is the transmitter's mix on the flap servos, which follow it as the
   * other surfaces follow their sticks; only the notch's switch is slowed.
   * Down only, within the flaps' travel. Zero leaves df the notch's. */
  double df = g_flap;
  if (fw->elev_flap > 0.0) {
    df = g_flap + fw->elev_flap * fw->flap_full * (pitch_radio > 0.0 ? pitch_radio : 0.0);
    if (df > fw->flap_full) df = fw->flap_full;
  }
  g_flap_mix = df - g_flap;

  /* The retracts travel toward what is selected at their own rate. */
  if (fw->gear_time > 0.0) {
    const double dg = WING_DT / fw->gear_time;
    if (g_gear_up) {
      g_gear = g_gear + dg < 1.0 ? g_gear + dg : 1.0;
    } else {
      g_gear = g_gear - dg > 0.0 ? g_gear - dg : 0.0;
    }
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
   *
   * The elevator carries the radio's flap mix on top of the stick, within
   * its travel, as a transmitter's mix does. Without flaps it adds a zero.
   */
  double de = add_term(surface_from_stick(pitch, fw->throw_e, fw->tune ? fw->tune_expo[1] : fw->expo), fw->trim_e);
  /* The launch preset's elevator is the radio's, under every mode. */
  if (preset) {
    de = clip(de + fw->discus_de, fw->throw_e);
  }
  double da = surface_from_stick(roll, fw->throw_a, fw->tune ? fw->tune_expo[0] : fw->expo);
  const double rudder_stick = fw->mix == FW_MIX_RUDDER ? clamp1(yaw + roll) : yaw;
  double delta_r = -surface_from_stick(rudder_stick, fw->throw_r, fw->tune ? fw->tune_expo[2] : fw->expo);
  /* Mode 3's damper, after the radio's expo, as the receiver adds it to
   * the servo's command, and off on the wheels with the other modes. Each
   * surface opposes its own rate. Spektrum's stick priority takes the
   * damper out as the stick leaves centre, per axis: at its default, 160,
   * "the gain goes to 0 at 40% stick input" (the AS3000 manual, p. 10),
   * taken as falling straight from full at centre, which the manual's
   * three points (0, 100, 200) fit; so a full stick is the full throw, as
   * in Manual. No heading term: Spektrum's default is off. Taken only in
   * mode 3, so every other mode's arithmetic is what it was. */
  if (g_stab == 3 && !g_on_wheels && !g_chute) {
    da = clip(da - as3x_priority(roll) * fw->as3x_k[0] * s->omega[0], fw->throw_a);
    de = clip(de + as3x_priority(pitch) * fw->as3x_k[1] * s->omega[1], fw->throw_e);
    delta_r = clip(delta_r - as3x_priority(rudder_stick) * fw->as3x_k[2] * s->omega[2], fw->throw_r);
  }
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
    g_surf[2] = clip(add_term(de, fw->de_df * g_flap), fw->throw_e);
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
  const double alpha = (Vxz > 1e-6 ? sim_atan2(-w, u) : 0.0) - fw->alpha_zl;
  const double beta = V > 1e-6 ? sim_atan2(-v, Vxz) : 0.0; /* wind from the right positive */
  /* The sideslip the sideslip terms take: the angle, or with hi_alpha its
   * sine, the body's sideways speed over the airspeed, which is the angle
   * at small angles and stays bounded flying sideways. */
  const double beta_s = fw->hi_alpha ? (V > 1e-6 ? -v / V : 0.0) : beta;
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
  double sin_b = 0.0, cos_b = 1.0;
  if (Vxz > 0.5) {
    sin_b = -w / Vxz;
    cos_b = u / Vxz;
  }
  /* The flat plate after the stall, at the zero lift line's angle. */
  const double sin_a = add_term(sin_b * fw->cos_zl, -(cos_b * fw->sin_zl));
  const double cos_a = add_term(cos_b * fw->cos_zl, sin_b * fw->sin_zl);
  const double cl_flat = 2.0 * sin_a * cos_a;
  double cd0 = add_term(add_term(fw->cd0, g_slats ? fw->slat_cd0 : 0.0), fw->cd_df2 * df * df);
  /* Retracts: the gear's drag goes as it folds away. */
  if (fw->gear_time > 0.0) {
    cd0 -= fw->cd_gear * g_gear;
  }
  /* The drag across the Reynolds numbers (FixedWingParams.cd0_re). */
  if (fw->cd0_re > 0.0) {
    const double re_now = V * fw->chord * PLANT.rho / AIR_MU;
    const double re_d = re_now > 0.5 * fw->cd0_re ? re_now : 0.5 * fw->cd0_re;
    cd0 *= sim_sqrt(fw->cd0_re / re_d);
  }
  const double cd_flat = cd0 + 2.0 * sin_a * sin_a;
  /* Up to its stall angle the wing's lift is the plant's own curve, the
   * blend from the linear lift to the flat plate every gate's band was
   * derived on. Past it the lift is its section's (wing_lift above). */
  const double re = V * fw->chord * PLANT.rho / AIR_MU;
  const double fre = smoothstep(STALL_RE_LO, STALL_RE_HI, re);
  const double k_stall = (g_slats && fw->slat_k > 0.0) ? fw->slat_k : fw->stall_k;
  WingLift wl;
  wing_lift(fw, alpha, delta_e, dcl_f, clmax, k_stall, fre, sin_a, cos_a, &wl);
  const double sigma = wl.sigma, cl_lin = wl.cl_lin, cl_st = wl.cl_st, fall = wl.fall, past = wl.past;
  const double cd_lin = cd0 + fw->k_induced * cl_lin * cl_lin;
  double CL = wl.cl;
  double CD = (1.0 - sigma) * cd_lin + sigma * cd_flat;
  /* A biplane (FixedWingParams.bip_w) takes its lift, its drag and its
   * stall's pitching moment wing by wing, biplane_lift above, and the
   * strips below judge their stall on the wing that stalls first. */
  double cm_bip = 0.0, alpha_strip = alpha_stall;
  const int biplane = fw->bip_w[0] > 0.0;
  if (biplane) {
    biplane_lift(fw, alpha, delta_e, dcl_f, clmax, k_stall, fre, sin_a, cos_a, cd0, &CL, &CD, &cm_bip);
    alpha_strip = alpha_stall / (fw->bip_r[0] > fw->bip_r[1] ? fw->bip_r[0] : fw->bip_r[1]);
  }

  /*
   * PAST THE LINEAR ANGLES, for a table with hi_alpha (docs/EXTRA-STAGE1.md).
   * Without it the pitch stiffness is cm_alpha alpha and the sideslip and
   * control terms the table's, as they always were. With it the wing and
   * body's share of the stiffness takes sin(alpha), and each tail surface
   * is taken at its own angle with its control's: the stabiliser at the
   * wing's angle less the downwash, which goes with the lift the wing
   * makes (so a stalled wing's lost downwash is in it, and stall_dw is not
   * taken again), less the angle it carries none at, and the elevator's
   * share; the fin at the sideslip and the rudder's share. Each surface's
   * normal force, linear x = a (angle) at small angles, saturates on a
   * flat plate's tail_cn, x / (1 + (x / tail_cn)^4)^(1/4), so a surface in
   * a crossflow, or a control past what its surface can carry, pushes no
   * harder than a plate does. At small angles every term is the linear
   * one it replaces.
   */
  double cm_stiff = fw->cm_alpha * alpha;
  double cm_de_lin = fw->cm_de;
  double cyb = fw->cy_beta, clb = fw->cl_beta, cnb = fw->cn_beta;
  double cydr = fw->cy_dr, cldr = fw->cl_dr, cndr = fw->cn_dr;
  double cl_lin_m = cl_lin, stall_dw = fw->stall_dw;
  double vh = 0.0, vv = 0.0, ae = 0.0, ar = 0.0;
  if (fw->hi_alpha) {
    const double dd = fw->tail_deda;
    vh = -fw->slip_cm_a / (fw->tail_at * (1.0 - dd));
    vv = fw->slip_cn_b / fw->tail_av;
    /* The elevator's and the rudder's angles on their surfaces. A surface
     * a crash took away (crash.c zeroes its share, so vh or vv is zero)
     * carries no angle, where the division would be 0 / 0. */
    ae = vh > 0.0 ? -fw->cm_de * delta_e / vh : 0.0;
    ar = vv > 0.0 ? fw->cn_dr * delta_r / vv : 0.0;
    const double at = sin_a - dd * CL / fw->cl_alpha - fw->slip_a0 * (1.0 - dd);
    const double xt = fw->tail_at * at + ae;
    cm_stiff = (fw->cm_alpha - fw->slip_cm_a) * sin_a + fw->slip_cm_a * fw->slip_a0 - vh * xt * plate_ratio(xt, fw->tail_cn);
    cm_de_lin = 0.0;
    const double xv = fw->tail_av * beta_s + ar;
    const double rv = plate_ratio(xv, fw->tail_cn);
    cyb = fw->cy_beta - fw->slip_cy_b * (1.0 - rv);
    clb = fw->cl_beta - fw->slip_cl_b * (1.0 - rv);
    cnb = fw->cn_beta - fw->slip_cn_b * (1.0 - rv);
    cydr = fw->cy_dr * rv;
    cldr = fw->cl_dr * rv;
    cndr = fw->cn_dr * rv;
    cl_lin_m = add_term(fw->cl_alpha * sin_a + fw->cl_de * delta_e, dcl_f);
    stall_dw = 0.0;
  }


  /* Forces in the body frame. */
  double F[3] = { 0.0, 0.0, 0.0 };
  if (V > 1e-6) {
    const double L = qbar * fw->area * CL;
    const double D = qbar * fw->area * CD;
    const double Y = add_term(qbar * fw->area * cyb * beta_s, qbar * fw->area * cydr * delta_r);
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
  /* The pack or the tank, power_duty below: the duty the motor actually
   * turns at, which is the stick's while the pack is as it was seated. */
  double r_v;
  const double duty_e = power_duty(s, fw, duty, &r_v);
  const int flat = s->power_out;
  const int dead = flat || (CRASH.active && (CRASH.motor_dead[0] || CRASH.no_power));
  /* The propulsor's speed as a fraction of full: a prop's is the duty's
   * this step; a ducted fan's lags it, fan_spool above. */
  const int fan = fw->fan_tau > 0.0;
  const double n = fan ? fan_spool(fw, throttle, duty_e, dead || g_chute) : duty_e;
  const double u_pos = u > 0.0 ? u : 0.0;
  /* A fan at rest makes nothing, where 0 / 0 would be a NaN. */
  /* The chase boost's faster prop has the faster pitch speed; exact at
   * 1.0 (sim_set_boost). */
  const double ct = ((fan && !(n > 0.0)) || !(fw->thrust_static > 0.0)) ? 0.0 : 1.0 - u_pos / (fw->pitch_speed * SIM_BOOST * n);
  double thrust = fw->thrust_static * n * n * ct;
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
  if (CRASH.active) {
    thrust = dead ? 0.0 : thrust * CRASH.kt[0];
  } else if (flat) {
    thrust = 0.0;
  }
  /* The chase boost's faster prop, last; exact at 1.0 (sim_set_boost). */
  thrust *= SIM_BOOST * SIM_BOOST;
  F[0] += thrust;
  /*
   * THE SLIPSTREAM over the tail and the ailerons, where the table has one
   * (FixedWingParams.slip_r). Momentum theory: the disc's pressure jump
   * dp = T / A, the induced speed v_i at the disc, the far wake 2 v_i
   * faster than the free stream and contracted to rw. Each surface's share
   * of the wash is how much of it rw covers. The controls meet dp on the
   * share; the angle and rate terms meet rho v_i times the crossflow over
   * the surface, which is the free stream's q times the angle, 1/2 rho V
   * (V alpha), with the wash's 2 v_i in place of V: so a still aircraft's
   * own rotation meets the wash too, and is damped by it. The tail's force
   * is along the body's axes, the wash's own direction. Taken after the
   * boost, so a faster prop blows harder. Nothing here runs without a
   * slipstream, and the three moments stay zero.
   */
  double m_slip = 0.0, n_slip = 0.0, l_slip = 0.0;
  for (int i = 0; i < 6; i += 1) {
    g_slip[i] = 0.0;
  }
  if (fw->slip_r > 0.0 && thrust > 0.0) {
    const double dp = thrust / (WING_PI * fw->slip_r * fw->slip_r);
    const double vi = 0.5 * (sim_sqrt(u_pos * u_pos + 2.0 * dp / PLANT.rho) - u_pos);
    const double rw = fw->slip_r * sim_sqrt((u_pos + vi) / (u_pos + 2.0 * vi));
    const double fh = rw < fw->slip_yh ? rw / fw->slip_yh : 1.0;
    const double up = rw < fw->slip_hv[0] ? rw : fw->slip_hv[0];
    const double dn = rw < fw->slip_hv[1] ? rw : fw->slip_hv[1];
    const double fv = fw->slip_hv[0] + fw->slip_hv[1] > 0.0 ? (up + dn) / (fw->slip_hv[0] + fw->slip_hv[1]) : 0.0;
    double fa = 0.0;
    if (rw > fw->slip_ya[0]) {
      const double ye = rw < fw->slip_ya[1] ? rw : fw->slip_ya[1];
      const double y0 = fw->slip_ya[0], y1 = fw->slip_ya[1];
      fa = (ye * ye - y0 * y0) / (y1 * y1 - y0 * y0);
    }
    /* The crossflows: over the stabiliser from its zero lift, V sin(alpha
     * - a0) in the body's velocities; over the fin, the sideways speed. */
    const double xa = -w * sim_cos_small(fw->slip_a0) - u * sim_sin_small(fw->slip_a0);
    /* The swirl: the prop's torque, torque_arm times the thrust, is the
     * wash's angular momentum flux, the mass flow rho pi R^2 (u + v_i)
     * turning as a solid body at Omega, Q = mdot Omega rw^2 / 2. Every prop
     * here turns clockwise seen from behind, and so does its wash: over
     * the fin above the thrust line it blows from the left, under it from
     * the right, Omega y at height y. Over the fin's span in the wash the
     * mean of the two, weighted by each part's share, is Omega (up - dn) /
     * 2, which the fin's terms take as a sideways speed: the nose yaws left
     * under power and right rudder holds it, the tractor's left turning
     * tendency on the take off roll, and the fin's side force rolls the
     * airframe against the torque. The wing's root, in the wash ahead of
     * the fin, is a stator: it turns part of the swirl back straight and
     * takes that part's angular momentum as a roll moment the prop's way,
     * against the torque reaction (Veldhuis, Propeller Wing Aerodynamic
     * Interference, TU Delft 2005: the wing recovers a significant part of
     * the swirl). SWIRL_KEEP of the swirl reaches the fin; the rest is the
     * root's. */
    const double q_prop = fw->torque_arm * thrust;
    const double mdot = PLANT.rho * WING_PI * fw->slip_r * fw->slip_r * (u_pos + vi);
    const double keep = fw->slip_pusher ? 1.0 : SWIRL_KEEP;
    const double xs = keep * q_prop * (up - dn) / (mdot * rw * rw);
    const double xb = add_term(-v, -xs);
    /* With hi_alpha each surface's share in the wash saturates as its
     * free stream share does, at its angle in the wash's own stream, the
     * crossflow over the far wake's speed, and its control's. */
    double rh = 1.0, rv = 1.0;
    if (fw->hi_alpha) {
      const double vw = u_pos + 2.0 * vi;
      const double xh = fw->tail_at * xa / vw + ae;
      const double xv = fw->tail_av * xb / vw + ar;
      rh = plate_ratio(xh, fw->tail_cn);
      rv = plate_ratio(xv, fw->tail_cn);
    }
    const double kh = PLANT.rho * vi * fh * rh, kv = PLANT.rho * vi * fv * rv;
    const double ph = dp * fh * rh, pv = dp * fv * rv;
    F[2] += fw->area * (kh * fw->slip_cl_a * xa + ph * fw->cl_de * delta_e);
    F[1] -= fw->area * (kv * fw->slip_cy_b * xb + pv * fw->cy_dr * delta_r);
    const double q_a = -s->omega[1], r_a = -s->omega[2];
    m_slip = fw->area * fw->chord *
             (kh * (fw->slip_cm_a * xa + fw->cm_q * q_a * 0.5 * fw->chord) + ph * fw->cm_de * delta_e);
    n_slip = fw->area * fw->span *
             (kv * (fw->slip_cn_b * xb + fw->slip_cn_r * r_a * 0.5 * fw->span) + pv * fw->cn_dr * delta_r);
    l_slip = fw->area * fw->span *
             (kv * fw->slip_cl_b * xb + pv * fw->cl_dr * delta_r + dp * fa * fw->cl_da * delta_a);
    l_slip = add_term(l_slip, (1.0 - keep) * q_prop);
    g_slip[0] = l_slip;
    g_slip[1] = -m_slip;
    g_slip[2] = -n_slip;
    g_slip[3] = dp;
    g_slip[4] = vi;
    g_slip[5] = xs;
  }
  /* The fuselage's crossflow drag in side view (FixedWingParams.side_cda),
   * against the sideways speed squared. */
  if (fw->side_cda > 0.0) {
    F[1] -= 0.5 * PLANT.rho * fw->side_cda * v * sim_fabs(v);
  }
  /* A fan runs down after its drive is cut rather than stopping. */
  const double rpm = (folded || ((g_chute || dead) && !fan)) ? 0.0 : 0.85 * n * fw->rpm_no_load;
  s->motor_omega[0] = rpm * 2.0 * WING_PI / 60.0;
  s->motor_omega[1] = 0.0;
  s->motor_omega[2] = 0.0;
  s->motor_omega[3] = 0.0;
  s->pack_current = (folded || g_chute || dead) ? 0.0 : power_current(fw, n, ct, r_v);
  power_drain(s, fw, duty, duty_e);
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
  const double da_m = delta_a * sep_g;
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
  double cn_sum = cnb * beta_s + fw->cn_r * rs * b2v;
  cn_sum = add_term(cn_sum, fw->cn_p_per_cl * CL * ps * b2v);
  cn_sum = add_term(cn_sum, fw->cn_da_per_cl * CL * da_m);
  cn_sum = add_term(cn_sum, cndr * delta_r);
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
  const double cm_post = sigma * (((1.0 - past) * fw->stall_arm_ac - past * fw->stall_arm_cp) * cn_st
                                  - fw->stall_arm_ac * cl_lin_m - stall_dw * (cl_lin_m - cl_st));
  const double cm_stall = biplane ? cm_bip : add_term(cm_low, fre * past * (cm_post - cm_low));
  /* The flaps' own moment rides on the lift they add: the section's nose
   * down moment and the downwash they add at the tail, nose up net. */
  const double m_aero = qbar * fw->area * fw->chord *
                        add_term(add_term(fw->cm_0 + cm_stiff + fw->cm_q * q_aero * c2v + cm_de_lin * de_m,
                                          cm_stall),
                                 add_term(fw->cm_dcl_f * dcl_f, -(fw->cg_shift / fw->chord) * CL));
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
  if (fw->slip_r > 0.0) {
    M[0] += l_slip;
    M[1] -= m_slip;
    M[2] -= n_slip;
  }
  /* A folded prop is not turning, and 0/0 would be a NaN, not a zero; nor
   * is a prop whose motor the chute has cut. */
  if (s->motor_omega[0] > 0.0) {
    M[2] = add_term(M[2], fw->pfactor * thrust * -w / s->motor_omega[0]);
  }
  /* The air a slow aircraft turns through (FixedWingParams.rot_k): each
   * axis' flat plate damping, k w^2, and the table's linear damping at the
   * airspeed flown, 1/4 rho V S b^2 |Cl_p| |p| and its pitch and yaw
   * counterparts, taken together as the root of their squares' sum; what
   * that adds to the linear, which the moments above already hold, is
   * applied here. At flying speed it is nothing to speak of; hanging on the
   * prop it is all the damping there is. */
  if (fw->rot_k[0] > 0.0 || fw->rot_k[1] > 0.0 || fw->rot_k[2] > 0.0) {
    const double lin[3] = {
      0.25 * PLANT.rho * V * fw->area * fw->span * fw->span * sim_fabs(fw->cl_p),
      0.25 * PLANT.rho * V * fw->area * fw->chord * fw->chord * sim_fabs(fw->cm_q),
      0.25 * PLANT.rho * V * fw->area * fw->span * fw->span * sim_fabs(fw->cn_r),
    };
    for (int i = 0; i < 3; i += 1) {
      const double wr = s->omega[i];
      const double lq = lin[i] * sim_fabs(wr);
      const double kq = fw->rot_k[i] * wr * wr;
      const double more = sim_sqrt(lq * lq + kq * kq) - lq;
      M[i] -= wr < 0.0 ? -more : more;
    }
  }
  /* The prop as a gyroscope: its angular momentum H along body x, and the
   * airframe's answer to turning it, -omega x H. A pitch rate nose down
   * (q positive) yaws the nose left and a yaw rate nose right pitches it
   * down, for a prop turning clockwise seen from behind. */
  if (fw->j_prop > 0.0) {
    const double H = fw->j_prop * s->motor_omega[0];
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
    double kmin = 0.0;
    if (fw->strip_k[0] > 0.0) {
      kmin = fw->strip_k[0] / rr[0];
      for (int i = 1; i < 4; i += 1) {
        kmin = fw->strip_k[i] / rr[i] < kmin ? fw->strip_k[i] / rr[i] : kmin;
      }
    }
    double ml = 0.0, mn = 0.0;
    for (int i = 0; i < 4; i += 1) {
      const double y = (0.125 + 0.25 * i) * half;
      const double da = p * y / Vrate;
      const double dr = (-w / V) * s->omega[2] * y / Vrate;
      const double st0 = kmin > 0.0 ? alpha_strip * (fw->strip_k[i] / rr[i]) / kmin : alpha_strip * rmax / rr[i];
      const double st = add_term(st0, fw->washout * (0.125 + 0.25 * i));
      double fl[2], fr[2];
      /* A section along the span stalls its own way: a thin one sharply
       * at its peak and down to less, a thick one rounded over and down
       * to more (strip_top, strip_kfall). The table's one section where
       * they are not given. */
      const int own = fw->strip_kfall[0] > 0.0 && !(g_slats && fw->slat_k > 0.0);
      const double k_i = own ? fw->strip_kfall[i] : k_stall;
      const double top_i = own ? fw->strip_top[i] : fw->stall_top;
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
      strip_stall(fw, alpha, sin_a, cos_a, add_term(add_term(-da, sa), -se), dr, rr[i], cl_lin, dcl_f, st - 0.5 * fw->stall_asym, k_i, top_i, fl);
      strip_stall(fw, alpha, sin_a, cos_a, add_term(add_term(da, -sa), -se), -dr, rr[i], cl_lin, dcl_f, st + 0.5 * fw->stall_asym, k_i, top_i, fr);
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
  .pitch_speed = 29.8,    /* m/s at full duty */
  .rpm_no_load = 20720.0,
  /* Prop reaction as a roll moment per newton of thrust. Ideal disc power
   * at static full thrust is T^1.5 / sqrt(2 rho A): 11.5 N through a 6 inch
   * disc is 184 W, at 17,600 rpm a torque of 0.10 N m, so 0.009 m per N.
   * The first figure here was 0.02, which rolled a thrown wing past sixty
   * degrees in four seconds with the sticks centred. */
  .torque_arm = 0.009,
  .j_prop = 0.000012, /* the 6 x 4 (5.7 g) and the 2216's bell, ESTIMATED: 0.7 of the blades' rod inertia plus the rotor, docs/FLIGHTMODEL.md */
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
  .j_prop = 0.000124, /* APC's 24.9 g 11 x 5.5E and the 2820's bell, ESTIMATED: 0.7 of the blades' rod inertia plus the rotor, docs/FLIGHTMODEL.md */
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
  .side_cda = 0.0722, /* 0.84 of 0.086 m^2, the pod in side view, the render model's, ESTIMATED */
  /* The slipstream, scripts/wash-derive.js. */
  .slip_r = 0.1397, .slip_yh = 0.228, .slip_hv = { 0, 0 }, .slip_ya = { 0.45, 0.85 },
  .slip_a0 = 0.005368, .slip_cl_a = 0.3771, .slip_cm_a = -1.305, .slip_cn_b = 0.1552,
  .slip_cn_r = -0.119, .slip_cy_b = -0.4011, .slip_cl_b = -0.02228, .slip_pusher = 1,
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
  .j_prop = 0.000132, /* the 11 x 7 (26 g) and the 3536's bell, ESTIMATED: 0.7 of the blades' rod inertia plus the rotor, docs/FLIGHTMODEL.md */
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
  /* The slipstream, scripts/wash-derive.js. */
  .slip_r = 0.1397, .slip_yh = 0.19, .slip_hv = { 0.158, 0.01 }, .slip_ya = { 0.28, 0.66 },
  .slip_a0 = 0.01331, .slip_cl_a = 0.3197, .slip_cm_a = -0.8266, .slip_cn_b = 0.07783,
  .slip_cn_r = -0.06304, .slip_cy_b = -0.1924, .slip_cl_b = -0.01429,
  .side_cda = 0.0924, /* 0.84 of 0.11 m^2, 0.9 m by 0.14 m of fuselage side, docs/CUB-STAGE1.md */
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
  .j_prop = 0.000077, /* the folding 9.75 x 7.5 with its yoke (20 g) and the 480's bell, ESTIMATED: 0.7 of the blades' rod inertia plus the rotor, docs/FLIGHTMODEL.md */
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
  /* The slipstream, scripts/wash-derive.js. */
  .slip_r = 0.1238, .slip_yh = 0.2385, .slip_hv = { 0.276, 0.01 }, .slip_ya = { 0.9, 1 },
  .slip_a0 = 0.04411, .slip_cl_a = 0.3737, .slip_cm_a = -1.382, .slip_cn_b = 0.1043,
  .slip_cn_r = -0.06673, .slip_cy_b = -0.3254, .slip_cl_b = -0.02115,
  .side_cda = 0.0697, /* 0.84 of 0.083 m^2, the fuselage in side view, the render model's */
};

/* OA Composites' NRJ, docs/DLG-STAGE1.md, where each number has its
 * formula and source and the estimated ones say so; scripts/dlg-derive.js
 * prints them. A 1490 mm F3K discus launch glider of 213 g: flaperons, an
 * elevator and a rudder, 7 degrees of dihedral a panel, and no motor. It
 * is thrown by its left wingtip, climbs 60 m on the throw and stays up in
 * the thermals, the Radian's. */
const FixedWingParams FW_NRJ1490 = {
  .mix = FW_MIX_TAIL,
  .span = 1.49,
  .area = 0.190,
  .chord = 0.1378,        /* the mean aerodynamic chord of the elliptic planform */
  .cl_alpha = 5.657,      /* wing and tail, Nelson eq. 2.52 */
  .cl_max = 0.95,
  /* The zero lift line 3 degrees under the body axis: a thin, lightly
   * cambered section at about 1 degree of incidence. sin and cos of minus
   * 3 degrees, to 17 digits. */
  .alpha_zl = -3.0 * WING_PI / 180.0,
  .sin_zl = -0.052335956242943835,
  .cos_zl = 0.9986295347545738,
  .cd0 = 0.0240,          /* at 5 m/s, cd0_re below: built up part by part */
  .k_induced = 0.0382,    /* 1/(pi 0.714 11.68), Raymer's e for a straight wing */
  .cl_de = -0.2267,
  .cy_beta = -0.365,
  .cy_dr = 0.2070,
  .cl_beta = -0.1576,     /* 7 degrees of dihedral a panel, and the fin */
  .cl_p = -0.671,
  .cl_da = 0.537,         /* flaperons 0.08 to 0.70 m out */
  .cl_r_per_cl = 0.25,
  .cl_dr = 0.0111,
  .cm_0 = 0.1157,         /* trims at 5.13 m/s, the best glide, with the elevator neutral */
  .cm_alpha = -0.959,     /* static margin 0.17 at the manual's 66 mm CG */
  .cm_q = -13.609,
  .cm_de = 0.921,
  .cn_beta = 0.1389,
  .cn_r = -0.1179,
  .cn_p_per_cl = -0.125,
  .cn_da_per_cl = -0.1824,
  .cn_dr = -0.0834,
  .stall_blend = 3.0 * WING_PI / 180.0,
  /* The manual's 13 mm of aileron, 9 mm of elevator and 12 mm of rudder
   * over the surfaces' chords at the horn, 40, 30 and 45 mm. */
  .throw_a = 19.0 * WING_PI / 180.0,
  .throw_e = 17.5 * WING_PI / 180.0,
  .throw_r = 15.5 * WING_PI / 180.0,
  .surface_max = 19.0 * WING_PI / 180.0,
  .expo = 0.30,
  /* No motor: thrust, speed and current all zero, and the plant makes
   * no thrust and draws nothing (plant_wing_step). The pack is the
   * receiver's. */
  .stab_bank_max = 50.0 * WING_PI / 180.0,
  .stab_pitch_max = 30.0 * WING_PI / 180.0,
  /* Centred sticks glide a little faster than the best glide, whose
   * attitude is half a degree nose up. */
  .stab_trim_pitch = 0.0,
  .stab_deadband = 0.04,
  .stab_roll_kp = 1.2,    /* over half the Radian's: two and a half times its roll per stick, against 7 deg of dihedral */
  .stab_roll_kd = 0.12,
  .stab_pitch_kp = 5.0,
  .stab_pitch_kd = 0.5,
  .stab_pitch_down = 0.0, /* there is no throttle to close */
  .stab_trim_throttle = 0.0,
  .acro_roll_rate = 150.0 * WING_PI / 180.0, /* full aileron rolls 163 deg/s at 8 m/s */
  .acro_pitch_rate = 60.0 * WING_PI / 180.0,
  .acro_expo = 0.30,
  .acro_err_max = 5.0 * WING_PI / 180.0,
  .acro_roll_kp = 3.0,
  .acro_roll_kd = 0.20,
  .acro_roll_ff = 0.36,   /* full aileron rolls 2.8 rad/s at 9 m/s */
  .acro_pitch_kp = 5.0,
  .acro_pitch_kd = 0.5,
  .acro_pitch_ff = 0.40,
  .acro_roll_ki = 6.0,
  .acro_pitch_ki = 8.0,
  .acro_i_max = 0.30,
  .yaw_coord_k = 1.5,     /* the Radian's: long flaperons' adverse yaw */
  .air_lift = 1,
  /* Past the stall, docs/STALL-STAGE1.md and scripts/stall-derive.js. */
  .stall_arm_ac = 0.0510,
  .stall_arm_cp = 0.0990,
  .stall_dw = 0.0912,
  .stall_asym = 0.00726,
  .stall_k = 0.80,
  .stall_top = 1.0 * WING_PI / 180.0,
  .strip_c = { 1.263, 1.180, 0.994, 0.616 },
  .cd0_re = 47180.0,      /* 5 m/s on the mean chord */
  /* The throw: an experienced pilot's 60 m (Lindinger), which this drag
   * reaches from 41 m/s at 70 degrees; a 1.6 m arm and half span, one turn,
   * let go at the shoulder's 1.5 m. The preset's elevator trims the zoom
   * at zero lift: -Cm0 / Cm_de. */
  .discus_v = 41.0,
  .discus_r = 1.6,
  .discus_turn = 2.0 * WING_PI,
  .discus_pitch = 70.0 * WING_PI / 180.0,
  .discus_h = 1.5,
  .discus_de = -0.12563,
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
  .j_prop = 0.00021, /* a 12 x 8 folding carbon prop (30 g) and a 200 g outrunner's bell, ESTIMATED: 0.7 of the blades' rod inertia plus the rotor, docs/FLIGHTMODEL.md */
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
  .side_cda = 0.047, /* 0.84 of 0.056 m^2, the pod in side view, ESTIMATED */
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
  .j_prop = 0.000058, /* GWS's 11 x 8 (13 g), less the 6.6:1 geared can motor's rotor turning the other way, ESTIMATED: 0.7 of the blades' rod inertia plus the rotor, docs/FLIGHTMODEL.md */
  .thrust_z = -0.0025,    /* the drawn model's shaft, 2.5 mm under the CG */
  .pfactor = 1.6,         /* blade element at 0.75 R, as the Cub's */
  .current_full = 6.1,
  .duty_min = 0.02,
  .stab_bank_max = 45.0 * WING_PI / 180.0,
  .stab_pitch_max = 25.0 * WING_PI / 180.0,
  .stab_trim_pitch = 2.0 * WING_PI / 180.0,
  .stab_deadband = 0.04,
  .stab_roll_kp = 1.53,   /* 2.0 over the rudder's 1.309 gain in the wash at the trim, scripts/stab-hold-derive.js */
  .stab_roll_kd = 0.61,   /* 0.8 over the same gain */
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
  /* The slipstream, scripts/wash-derive.js. */
  .slip_r = 0.1397, .slip_yh = 0.22, .slip_hv = { 0.2, 0.01 }, .slip_ya = { 0.53, 0.588 },
  .slip_a0 = 0.04292, .slip_cl_a = 0.311, .slip_cm_a = -0.5746, .slip_cn_b = 0.1232,
  .slip_cn_r = -0.1111, .slip_cy_b = -0.2735, .slip_cl_b = -0.01814,
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
  .j_prop = 0.00023, /* the three blade 11 x 7.5 (45 g) and the BL10's bell, ESTIMATED: 0.7 of the blades' rod inertia plus the rotor, docs/FLIGHTMODEL.md */
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
  /* The slipstream, scripts/wash-derive.js. */
  .slip_r = 0.1397, .slip_yh = 0.28, .slip_hv = { 0.195, 0.036 }, .slip_ya = { 0.34, 0.7 },
  .slip_a0 = -0.002314, .slip_cl_a = 0.4134, .slip_cm_a = -0.9753, .slip_cn_b = 0.1042,
  .slip_cn_r = -0.08373, .slip_cy_b = -0.2589, .slip_cl_b = -0.01498,
  .side_cda = 0.105, /* 0.84 of 0.125 m^2, 1.04 m by 0.13 m of fuselage side, docs/TIMBER-STAGE1.md */
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
  .j_prop = 0.00023, /* the three blade 11 x 7.5 (45 g) and the BL10's bell, ESTIMATED: 0.7 of the blades' rod inertia plus the rotor, docs/FLIGHTMODEL.md */
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
  /* The slipstream, scripts/wash-derive.js. */
  .slip_r = 0.1397, .slip_yh = 0.28, .slip_hv = { 0.195, 0.036 }, .slip_ya = { 0.34, 0.7 },
  .slip_a0 = -0.002314, .slip_cl_a = 0.4134, .slip_cm_a = -0.9753, .slip_cn_b = 0.1042,
  .slip_cn_r = -0.08373, .slip_cy_b = -0.2589, .slip_cl_b = -0.01498,
  .side_cda = 0.105, /* 0.84 of 0.125 m^2, the Timber's fuselage; the floats' own side is not in it, ESTIMATED */
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
  .j_prop = 0.000132, /* the 11 x 7 (26 g) and the 3536's bell, ESTIMATED: 0.7 of the blades' rod inertia plus the rotor, docs/FLIGHTMODEL.md */
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
  /* The slipstream, scripts/wash-derive.js. */
  .slip_r = 0.1397, .slip_yh = 0.19, .slip_hv = { 0.158, 0.01 }, .slip_ya = { 0.28, 0.66 },
  .slip_a0 = 0.01331, .slip_cl_a = 0.3197, .slip_cm_a = -0.8266, .slip_cn_b = 0.07783,
  .slip_cn_r = -0.06304, .slip_cy_b = -0.1924, .slip_cl_b = -0.01429,
  .side_cda = 0.0924, /* 0.84 of 0.11 m^2, the Cub's fuselage; the floats' own side is not in it, ESTIMATED */
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
  .j_prop = 0.0000115, /* Cox's 7 x 3.5 (6 g) and the .049's crank, ESTIMATED: 0.7 of the blades' rod inertia plus the rotor, docs/FLIGHTMODEL.md */
  .thrust_z = -0.0053,    /* the drawn model's shaft, 5.3 mm under the CG */
  .pfactor = 1.6,         /* blade element at 0.75 R, as the Cub's */
  .current_full = 0.0,    /* the engine burns fuel, not the pack */
  .duty_min = 0.02,
  .stab_bank_max = 45.0 * WING_PI / 180.0,
  .stab_pitch_max = 12.0 * WING_PI / 180.0,
  .stab_trim_pitch = 2.0 * WING_PI / 180.0,
  .stab_deadband = 0.04,
  .stab_roll_kp = 1.11,   /* 1.6 over the rudder's 1.446 gain in the wash at the trim, scripts/stab-hold-derive.js */
  .stab_roll_kd = 0.42,   /* 0.6 over the same gain */
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
  /* The tank, docs/POWER-STAGE1.md: the Texaco .049's integral 8.4 cc
   * (Cox's sheet). A Cox .049 at full throttle burns 1.84 cc/min at 9,000
   * rpm (Menon's dyno, U. Maryland 2010, at 7 percent efficiency), and
   * the flow is linear in the rpm through zero, so the idle's is 0.40 of
   * it. The lean run over the last 5 percent, 5 percent of rpm, is an
   * estimate: Cox's chart names the lean burst before a dry tank stops
   * the engine and gives no size. */
  .tank_m3 = 8.4e-6,
  .flow_full = 1.84e-6 / 60.0,
  .flow_idle = 0.40 * (1.84e-6 / 60.0),
  .lean_frac = 0.05,
  .lean_gain = 0.05,
  /* Past the stall, docs/STALL-STAGE1.md and scripts/stall-derive.js. */
  .lowre_arm_ac = 0.0761, /* the same arms, its first post stall moment, kept short of */
  .lowre_arm_cp = 0.0703, /* the stall angle and below the section data's Reynolds numbers */
  .stall_dw = 0.1881,
  .stall_asym = 0.00525,
  .stall_k = 0.72,
  .stall_top = 3.7 * WING_PI / 180.0,
  .strip_c = { 1.0, 1.0, 1.0, 1.0 },
  .washout = 3.0 * WING_PI / 180.0, /* FITTED to review behaviour, docs/STALL-STAGE1.md */
  /* The slipstream, scripts/wash-derive.js. */
  .slip_r = 0.0889, .slip_yh = 0.206, .slip_hv = { 0.129, 0.01 }, .slip_ya = { 0.5, 0.5588 },
  .slip_a0 = 0.04422, .slip_cl_a = 0.5377, .slip_cm_a = -1.618, .slip_cn_b = 0.09309,
  .slip_cn_r = -0.08896, .slip_cy_b = -0.1948, .slip_cl_b = -0.009061,
  .side_cda = 0.0428, /* 0.84 of 0.051 m^2, the fuselage in side view, scripts/bombshell-derive.js */
};

/* SIG's Kadet Senior, kit RC58, docs/KADET-STAGE1.md, where each number
 * has its formula and source and the estimated ones say so. The
 * Bombshell's three channels on a 78 in trainer: no ailerons ("will not be
 * suitable for aileron control and in fact, does not need it", SIG's
 * manual), so it banks on its rudder, the roll stick's as well as the yaw
 * stick's, through its dihedral and a high wing on a deep fuselage, which
 * also bring the wings back level with the sticks centred; a big
 * stabiliser on a long arm. An O.S. FS-52 Surpass four stroke on a 12 x
 * 6, clockwise seen from behind, on SIG's 6 degrees of downthrust: the
 * stick runs it from its 2,300 rpm idle to full and it never stops. */
const FixedWingParams FW_KADET1981 = {
  .mix = FW_MIX_RUDDER,
  .span = 1.9812,         /* SIG, 78 in */
  .area = 0.741934,       /* SIG, 1150 sq in */
  .chord = 0.374487,      /* S/b */
  .cl_alpha = 5.029,      /* wing (its dihedral's cos^2) and tail, DATCOM downwash */
  .cl_max = 1.15,
  /* The zero lift line 4.62 degrees under the thrust line: a flat bottomed
   * section at SIG's 1.5 degrees of incidence, less the tail's share. sin
   * and cos of minus 4.62 degrees, to 17 digits. */
  .alpha_zl = -4.62 * WING_PI / 180.0,
  .sin_zl = -0.080546860902663123,
  .cos_zl = 0.99675082302385232,
  .cd0 = 0.042,           /* film over a built up frame, an open engine, wire gear */
  .k_induced = 0.08022,   /* 1/(pi 0.75 5.29) */
  .cl_de = -0.440,
  .cy_beta = -0.265,
  .cy_dr = 0.1699,
  .cl_beta = -0.1259,     /* 4.4 degrees of dihedral, the high wing and the fin */
  .cl_p = -0.755,
  .cl_da = 0.0,           /* no ailerons */
  .cl_r_per_cl = 0.25,
  .cl_dr = 0.0065,
  .cm_0 = 0.0783,         /* level at 3/4 throttle with the elevator neutral, SIG's trim */
  .cm_alpha = -1.3471,    /* static margin 0.268 at SIG's 3 7/8 in */
  .cm_q = -10.534,
  .cm_de = 1.129,
  .cn_beta = 0.1134,      /* the fin's, less the box fuselage's */
  .cn_r = -0.1374,
  .cn_p_per_cl = -0.125,
  .cn_da_per_cl = 0.0,
  .cn_dr = -0.0830,
  /* A 13 percent flat bottomed section at a Reynolds number of 2e5, the
   * Clark-Y class, blended over the Slow Stick's 4 degrees. */
  .stall_blend = 4.0 * WING_PI / 180.0,
  /* SIG's throws: 3/4 in on the 3 in elevator, 7/8 in on the 3.5 in rudder. */
  .throw_a = 0.0,
  .throw_e = 14.4775 * WING_PI / 180.0,
  .throw_r = 14.4775 * WING_PI / 180.0,
  .surface_max = 0.0,
  .expo = 0.30,
  .thrust_static = 27.83, /* N, a 12 x 6 at the measured 9,500 rpm */
  .pitch_speed = 24.13,
  .rpm_no_load = 11176.0,
  .torque_arm = 0.0125,   /* 347 W of disc power at 9,500 rpm is 0.349 N m at 27.8 N */
  .j_prop = 0.00027, /* the Ugly Stik's 12 x 6 wood prop and crank front, the same engine class, ESTIMATED: 0.7 of the blades' rod inertia plus the rotor, docs/FLIGHTMODEL.md */
  .thrust_z = 0.0335,     /* 6 degrees of downthrust through the hub: a level line 1.32 in over the CG */
  .pfactor = 1.6,         /* blade element at 0.75 R, as the Cub's */
  .current_full = 0.0,    /* the engine burns fuel, not the pack */
  .duty_min = 0.02,
  .stab_bank_max = 45.0 * WING_PI / 180.0,
  .stab_pitch_max = 20.0 * WING_PI / 180.0,
  .stab_trim_pitch = 2.0 * WING_PI / 180.0,
  .stab_deadband = 0.04,
  .stab_roll_kp = 2.4,
  .stab_roll_kd = 0.6,
  .stab_pitch_kp = 3.0,
  .stab_pitch_kd = 0.5,
  .stab_pitch_down = 12.78 * WING_PI / 180.0, /* to its power off glide, npm run stab:glide */
  .stab_trim_throttle = 0.752, /* the stick that flies it level, elevator neutral */
  .acro_roll_rate = 25.0 * WING_PI / 180.0, /* what full rudder rolls it at, 20 to 25 deg/s */
  .acro_pitch_rate = 60.0 * WING_PI / 180.0,
  .acro_expo = 0.30,
  .acro_err_max = 5.0 * WING_PI / 180.0,
  .acro_roll_kp = 5.0,
  .acro_roll_kd = 0.6,
  .acro_roll_ff = 1.5,
  .acro_pitch_kp = 5.0,
  .acro_pitch_kd = 0.5,
  .acro_pitch_ff = 0.40,
  .acro_roll_ki = 2.0,
  .acro_pitch_ki = 8.0,
  .acro_i_max = 0.30,
  .yaw_coord_k = 0.0,     /* the rudder is the roll control: nothing to coordinate with */
  .throttle_idle = 0.2421, /* O.S.'s 2,300 rpm, the lowest practical, of the 9,500 */
  /* The tank, docs/POWER-STAGE1.md: SIG's 12 oz, 355 cc. O.S.'s own
   * figure for the FS-52's successor, the FSa-56II, 220 cc for about 12
   * minutes, is 18.3 cc/min, taken as the full throttle flow (a measured
   * .40 two stroke at full power, Menon 2010, burns 17.9), linear in the
   * rpm through zero. The lean run is the Bombshell's estimate. */
  .tank_m3 = 355.0e-6,
  .flow_full = 18.3e-6 / 60.0,
  .flow_idle = 0.2421 * (18.3e-6 / 60.0),
  .lean_frac = 0.05,
  .lean_gain = 0.05,
  /* Past the stall, docs/STALL-STAGE1.md and scripts/stall-derive.js. */
  .stall_arm_ac = 0.0128, /* the CG 4.8 mm behind the wing's aerodynamic centre */
  .stall_arm_cp = 0.1372, /* the plate's centre of pressure at 0.40 of the chord */
  .stall_dw = 0.1721,
  .stall_asym = 0.00267,
  .stall_k = 0.72,
  .stall_top = 6.7 * WING_PI / 180.0,
  .strip_c = { 1.0, 1.0, 1.0, 1.0 },
  .washout = 3.0 * WING_PI / 180.0, /* FITTED to review behaviour, docs/STALL-STAGE1.md */
  /* The slipstream, scripts/wash-derive.js. */
  .slip_r = 0.1524, .slip_yh = 0.3935, .slip_hv = { 0.259, 0.114 }, .slip_ya = { 0.89, 0.9906 },
  .slip_a0 = -0.02575, .slip_cl_a = 0.4965, .slip_cm_a = -1.273, .slip_cn_b = 0.1299,
  .slip_cn_r = -0.1269, .slip_cy_b = -0.2654, .slip_cl_b = -0.01018,
  .side_cda = 0.2016, /* 0.84 of 0.24 m^2, the box fuselage in side view, scripts/kadet-derive.js */
};

/* FMS's 1450 mm P-51D Mustang V8, docs/P51-STAGE1.md, where each number
 * has its formula and source and the estimated ones say so: the full size
 * P-51D to the kit's span, ailerons, elevator, rudder and plain flaps, a
 * tapered laminar wing washed out 1 deg 58 min, on FMS's 4250 540 kV and a
 * 14 x 8 four blade, clockwise seen from behind, on 4S, on retracts. */
const FixedWingParams FW_P51D1450 = {
  .mix = FW_MIX_TAIL,
  .span = 1.450,          /* FMS, 1450 mm */
  .area = 0.354,          /* FMS, 35.4 dm^2 */
  .chord = 0.24413793103448276, /* S/b */
  .cl_alpha = 4.960,      /* wing (its dihedral's cos^2) and tail, DATCOM downwash */
  .cl_max = 1.05,         /* the laminar section at 2e5, ESTIMATED */
  /* The zero lift line 1.28 degrees under the thrust line: a 6 series
   * section's 1.3 deg under its chord at the wing's mean incidence of 0.13
   * deg, less the tail's share. sin and cos of minus 1.28 degrees. */
  .alpha_zl = -1.28 * WING_PI / 180.0,
  .sin_zl = -0.022338356193573706,
  .cos_zl = 0.99975046778812215,
  .cd0 = 0.038,           /* 0.030 clean and 0.008 of gear hanging, ESTIMATED */
  .k_induced = 0.06699,   /* 1/(pi 0.80 5.94) */
  .cl_de = -0.412,
  .cy_beta = -0.336,
  .cy_dr = 0.1982,
  .cl_beta = -0.0925,     /* 5 degrees of dihedral, less the low wing's, and the fin */
  .cl_p = -0.648,
  .cl_da = 0.2270,
  .cl_r_per_cl = 0.25,
  .cl_dr = 0.0177,
  .cm_0 = 0.0183,         /* level at 3/4 throttle with the elevator neutral, gear up */
  .cm_alpha = -0.1684,    /* static margin 0.034 at FMS's 110 mm */
  .cm_q = -8.305,
  .cm_de = 1.168,
  .cn_beta = 0.0992,      /* the fin's, less the long fuselage's */
  .cn_r = -0.1202,
  .cn_p_per_cl = -0.125,
  .cn_da_per_cl = -0.12,
  .cn_dr = -0.0969,
  .stall_blend = 3.0 * WING_PI / 180.0,
  /* FMS's low rates at the surfaces' widest point: 17 mm on the 50 mm
   * aileron, 24 on the 55 mm elevator, 21 on the 100 mm rudder, their
   * arcsines to 0.0001 deg, which configs/tuning.js restates. */
  .throw_a = 19.8769 * WING_PI / 180.0,
  .throw_e = 25.8721 * WING_PI / 180.0,
  .throw_r = 12.1224 * WING_PI / 180.0,
  .surface_max = 19.8769 * WING_PI / 180.0,
  .expo = 0.30,
  .thrust_static = 30.7,  /* N, the 14 x 8 four blade on the 540 kV motor at 4S, ESTIMATED */
  .pitch_speed = 23.006,  /* 0.85 of 7,992 rpm on the 8 in pitch */
  .rpm_no_load = 7992.0,
  .torque_arm = 0.0158,   /* 345 W of disc power at 6,793 rpm is 0.485 N m at 30.7 N */
  .thrust_z = 0.0129,     /* the thrust line 12.9 mm over the CG */
  .pfactor = 1.6,         /* blade element at 0.75 R, as the Cub's */
  .current_full = 55.2,   /* A, the static balance of the motor on the pack */
  .duty_min = 0.02,
  .stab_bank_max = 60.0 * WING_PI / 180.0,
  .stab_pitch_max = 30.0 * WING_PI / 180.0,
  .stab_trim_pitch = 2.0 * WING_PI / 180.0,
  .stab_deadband = 0.04,
  .stab_roll_kp = 2.0,
  .stab_roll_kd = 0.20,
  .stab_pitch_kp = 5.0,
  .stab_pitch_kd = 0.5,
  .stab_pitch_down = 3.14 * WING_PI / 180.0, /* to its power off glide, npm run stab:glide */
  .stab_trim_throttle = 0.769, /* the stick that flies it level, elevator neutral, gear down */
  .acro_roll_rate = 120.0 * WING_PI / 180.0, /* 0.7 of full aileron's 168 deg/s at 17.5 m/s */
  .acro_pitch_rate = 60.0 * WING_PI / 180.0, /* at 16 m/s, 2.5 g, the most it pulls short of its stall */
  .acro_expo = 0.30,
  .acro_err_max = 5.0 * WING_PI / 180.0,
  .acro_roll_kp = 4.0,
  .acro_roll_kd = 0.80,   /* retuned with the slipstream: 0.70 left 10.4 deg/s 0.25 s after a partial roll stopped, 0.80 leaves 9.7, docs/FLIGHTMODEL.md */
  .acro_roll_ff = 0.20,
  .acro_pitch_kp = 4.0,
  .acro_pitch_kd = 0.5,
  .acro_pitch_ff = 0.40,
  .acro_roll_ki = 6.0,
  .acro_pitch_ki = 8.0,
  .acro_i_max = 0.30,
  .yaw_coord_k = 1.5,
  /* The flaps: FMS's 22 and 45 mm on the 78 mm flap at the fuselage, 16.3
   * and 35.1 deg, plain flaps over the inner 56 percent of the area, on
   * slow flap servos, ESTIMATED at 3 s across. No mix: FMS gives none. */
  .flap_half = 0.28510428711100527,
  .flap_full = 0.61297025535831962,
  .flap_rate = 0.2043,
  .cl_df = 1.5431,
  .cl_df2 = -0.9665,
  .clmax_df = 0.7370,
  .cd_df2 = 0.1520,
  .cm_dcl_f = 0.1959,
  .de_df = 0.0,
  /* Past the stall: a 15 percent section at 2e5, the NACA 2415's UIUC
   * curve standing for the laminar NAA/NACA 45-100, docs/P51-STAGE1.md. */
  .stall_arm_ac = 0.1303, /* the CG 31.8 mm behind the wing's aerodynamic centre */
  .stall_arm_cp = 0.0254, /* the plate's centre of pressure at 0.40 of the MAC */
  .stall_dw = 0.1347,
  .stall_asym = 0.0041,
  .stall_k = 0.76,
  .stall_top = 4.2 * WING_PI / 180.0,
  .strip_c = { 1.2507, 1.0836, 0.9164, 0.7493 }, /* the 0.499 taper */
  .washout = (1.0 + 58.0 / 60.0) * WING_PI / 180.0, /* the full size's +1 deg root, -58 min tip */
  .j_prop = 0.001170,     /* four 25 g blades, the spinner and the bell */
  .gear_time = 6.0,       /* FMS's six second P-51 sequencer, ESTIMATED as the gear's travel */
  .cd_gear = 0.008,
  .strip_k = { 1.0, 0.9548, 0.9055, 0.8503 }, /* Reynolds number and thickness along the span */
  /* Each strip's stall by its thickness, 14.6, 13.7, 12.8 and 11.9
   * percent: from the NACA 2415's rounded stall at 2e5 (15 percent) to the
   * leading edge stall of McCullough and Gault's 63-012 (12 percent, NACA
   * TN 2502: a sharp peak, and 0.57 of it kept), linear between. */
  .strip_top = { 3.69 * WING_PI / 180.0, 2.40 * WING_PI / 180.0, 1.10 * WING_PI / 180.0, 0.0 },
  .strip_kfall = { 0.737, 0.678, 0.620, 0.570 },
  /* The slipstream, scripts/wash-derive.js. */
  .slip_r = 0.1778, .slip_yh = 0.258, .slip_hv = { 0.18, 0.01 }, .slip_ya = { 0.45, 0.68 },
  .slip_a0 = 0.07222, .slip_cl_a = 0.2949, .slip_cm_a = -0.8361, .slip_cn_b = 0.1152,
  .slip_cn_r = -0.1126, .slip_cy_b = -0.236, .slip_cl_b = -0.02099,
  .side_cda = 0.0882, /* 0.84 of 0.105 m^2, the fuselage in side view, scripts/p51-derive.js */
};

/* Freewing's F-16 Fighting Falcon V3, the 70 mm EDF, 6S High Performance
 * (FJ21115P), docs/F16-STAGE1.md, where each number has its formula and
 * source and the estimated ones say so. A 1/11.5 scale EPO jet, 878 mm
 * across the tip rails: a 40 deg cropped delta with its strakes, all
 * moving stabilators, ailerons and a rudder, on a 70 mm twelve blade
 * ducted fan. The fan is fan_tau's propulsor: its speed lags the ESC,
 * its thrust falls with airspeed to nothing at 1.6 n D, and its stators
 * take out the rotor's torque, so none reaches the airframe. */
const FixedWingParams FW_F16878 = {
  .mix = FW_MIX_TAIL,
  .span = 0.878,          /* Freewing, over the rails */
  .area = 0.21484,        /* Model Aviation, 333 sq in */
  .chord = 0.2856,        /* the manual's top view: the trapezoid's mean chord */
  .cl_alpha = 3.310,      /* Helmbold's swept wing and the stabilators, Nelson's downwash */
  .cl_max = 1.10,
  /* The zero lift line 1.03 degrees under the body axis: the 64A204's
   * camber at no incidence, less the tail's share. sin and cos of minus
   * 1.03 degrees, to 17 digits. */
  .alpha_zl = -1.03 * WING_PI / 180.0,
  .sin_zl = -0.017975923049993122,
  .cos_zl = 0.99983842004120882,
  /* Gear down: the clean airframe's 0.0336 that flies Freewing's 165 km/h
   * on this fan, gear up, and the gear's cd_gear, which the retracts take
   * away. */
  .cd0 = 0.0336 + 0.013,
  .k_induced = 0.1374,    /* 1/(pi 0.75 3.09) */
  .cl_de = -0.476,        /* all moving: the whole stabilator */
  .cy_beta = -0.470,
  .cy_dr = 0.2134,
  .cl_beta = -0.1061,     /* the sweep's effective dihedral and the fin */
  .cl_p = -0.3495,
  .cl_da = 0.1226,
  .cl_r_per_cl = 0.25,
  .cl_dr = 0.0292,
  .cm_0 = 0.0470,         /* level at half throttle with the elevator neutral */
  .cm_alpha = -0.3814,    /* static margin 0.115: the full size F-16's neutral point */
  .cm_q = -2.263,
  .cm_de = 0.700,
  .cn_beta = 0.1420,      /* the fin's, less the long forebody's */
  .cn_r = -0.2241,
  .cn_p_per_cl = -0.125,
  .cn_da_per_cl = -0.05,
  .cn_dr = -0.1094,
  .stall_blend = 3.0 * WING_PI / 180.0,
  /* The full size F-16's surface limits (NASA TP-1538): Freewing gives
   * its high rates in mm at the trailing edge and not the chords. */
  .throw_a = 21.5 * WING_PI / 180.0,
  .throw_e = 25.0 * WING_PI / 180.0,
  .throw_r = 30.0 * WING_PI / 180.0,
  .surface_max = 21.5 * WING_PI / 180.0,
  .expo = 0.30,
  .thrust_static = 23.536, /* N, Freewing's 2,400 g */
  .pitch_speed = 76.87,   /* the fan's zero thrust speed, 1.603 n D */
  .rpm_no_load = 49062.0, /* 2210 kV on 6S */
  .torque_arm = 0.0,      /* the fan's stators take out its torque */
  .j_prop = 0.000010, /* the 69 mm twelve blade rotor (12 g) and the 2957 inrunner's rotor, ESTIMATED: 0.7 of the blades' rod inertia plus the rotor, docs/FLIGHTMODEL.md */
  .current_full = 70.0,   /* A, the fan unit's static figure */
  .duty_min = 0.02,
  .stab_bank_max = 60.0 * WING_PI / 180.0,
  .stab_pitch_max = 30.0 * WING_PI / 180.0,
  .stab_trim_pitch = 3.0 * WING_PI / 180.0,
  .stab_deadband = 0.04,
  .stab_roll_kp = 2.0,
  .stab_roll_kd = 0.10,
  .stab_pitch_kp = 3.0,
  .stab_pitch_kd = 0.30,
  .stab_pitch_down = 6.63 * WING_PI / 180.0, /* to its power off glide, gear down, npm run stab:glide */
  .stab_trim_throttle = 0.531, /* the stick that flies it level, elevator neutral, gear down */
  .acro_roll_rate = 300.0 * WING_PI / 180.0,
  .acro_pitch_rate = 120.0 * WING_PI / 180.0,
  .acro_expo = 0.30,
  .acro_err_max = 5.0 * WING_PI / 180.0,
  .acro_roll_kp = 8.0,
  .acro_roll_kd = 0.10,
  .acro_roll_ff = 0.14,
  .acro_pitch_kp = 4.0,
  .acro_pitch_kd = 0.30,
  .acro_pitch_ff = 0.40,
  .acro_roll_ki = 4.0,
  .acro_pitch_ki = 8.0,
  .acro_i_max = 0.30,
  .yaw_coord_k = 1.0,
  /* Past the stall, docs/STALL-STAGE1.md and scripts/stall-derive.js. The
   * strakes' vortex holds the lift 10 deg past the stall, to Freewing's
   * "high alpha of 30 degrees", then it falls to 0.8 of it. */
  .stall_arm_ac = -0.0552, /* the CG 16 mm ahead of the wing's aerodynamic centre */
  .stall_arm_cp = 0.2052,  /* the plate's centre of pressure at 0.40 of the mean chord */
  .stall_dw = 0.1442,
  .stall_asym = 0.0035,
  .stall_k = 0.80,
  .stall_top = 10.0 * WING_PI / 180.0,
  .strip_c = { 1.499, 1.166, 0.834, 0.501 },
  .washout = 3.0 * WING_PI / 180.0, /* FITTED to review behaviour, docs/STALL-STAGE1.md */
  /* The fan and its ESC: NASA's second order spool, scaled to 69 mm, and
   * the ESC manual's Normal startup, 300 ms to full. */
  .fan_tau = 0.08,
  .esc_start = 0.3,
  /* Freewing's electric retracts, the P-51's system: no travel time is
   * published, 4 s ESTIMATED; the gear's drag, three legs, their wheels
   * and the doors, 4.6e-3 m^2 across the flow at a C_D of 0.6 on the
   * 0.2148 m^2 wing, ESTIMATED (f16:derive). */
  .gear_time = 4.0,
  .cd_gear = 0.013,
  .side_cda = 0.126, /* 0.84 of 0.15 m^2, the fuselage in side view, scripts/f16-derive.js */
};

/* Zagi's 48 in Zagi HP, docs/ZAGI-STAGE1.md, where each number has its
 * formula and source and the estimated ones say so: an EPP flying wing
 * on the planform Trick R/C drew for the Zagi-400 X, elevons and no
 * rudder, winglets, the Zagi 101.4 reflexed section, 25.5 oz, balanced 8
 * in back from the nose, a 3100 kV inrunner turning a 5 x 5 carbon
 * pusher clockwise seen from behind, on 3S. The derivatives are a vortex
 * lattice's on that planform with its winglets, scripts/zagi-derive.js. */
const FixedWingParams FW_ZAGI1219 = {
  .mix = FW_MIX_ELEVON,
  .span = 1.2192,         /* Zagi, 48 in */
  .area = 0.26012851,     /* Zagi, 2.8 sq ft */
  .chord = 0.21335338,    /* S/b */
  .cl_alpha = 4.1152,     /* the lattice, winglets on */
  .cl_max = 0.9283,       /* 0.9 of the MH45's 1.14 at 2e5, cos of the quarter chord's sweep */
  .alpha_zl = 0.0,        /* a reflexed section: zero lift on the body axis */
  .sin_zl = 0.0,
  .cos_zl = 1.0,
  .cd0 = 0.0186,          /* a component build up, ESTIMATED */
  .k_induced = 0.0737,    /* 1/(pi e AR), Raymer's swept e 0.756 */
  .cl_de = -1.7282,       /* elevon lift, per rad: trailing edge up sheds lift */
  .cy_beta = -0.2399,
  .cl_beta = -0.1338,     /* the sweep's, at the cruise's lift, and the winglets' */
  .cl_p = -0.4697,
  .cl_da = 0.4157,
  .cl_r_per_cl = 0.2222,
  .cm_0 = 0.0498,         /* the reflex: trims at the best glide's CL, elevons neutral */
  .cm_alpha = -0.4076,    /* static margin 0.099 of S/b at Zagi's 8 in, FITTED */
  .cm_q = -1.5146,
  .cm_de = 0.6814,        /* delta_e positive pitches the nose up */
  .cn_beta = 0.0173,      /* the winglets', short behind the CG */
  .cn_r = -0.0180,
  .cn_p_per_cl = -0.1600,
  .cn_da_per_cl = 0.0153, /* a little proverse: the elevons are at the swept tips */
  .stall_blend = 3.0 * WING_PI / 180.0,
  /* Zagi's throws: 3/8 in each way on either stick on the 1.5 in elevon,
   * its arcsine to 0.0001 deg, one rate. Each elevon clips at it. No
   * rudder, so the yaw stick moves nothing. */
  .throw_a = 14.4775 * WING_PI / 180.0,
  .throw_e = 14.4775 * WING_PI / 180.0,
  .throw_r = 0.0,
  .surface_max = 14.4775 * WING_PI / 180.0,
  .expo = 0.30,
  .thrust_static = 7.295, /* N, 202 W on the shaft through the 5 in disc at an APC 5 x 5E's figure of merit */
  .pitch_speed = 46.567,  /* Zagi's loaded 22,000 rpm on the 5 in pitch */
  .rpm_no_load = 25882.0, /* the plant's rule: 22,000 is 0.85 of it */
  .torque_arm = 0.01203,  /* the shaft's 0.0878 N m at 30 A over the static thrust; clockwise from behind */
  .thrust_z = 0.052,      /* the motor on the tray, its shaft 52 mm over the CG: power pitches the nose down */
  .current_full = 30.0,   /* A, Zagi's static figure */
  .duty_min = 0.02,
  .stab_bank_max = 60.0 * WING_PI / 180.0,
  .stab_pitch_max = 30.0 * WING_PI / 180.0,
  .stab_trim_pitch = 2.0 * WING_PI / 180.0,
  .stab_deadband = 0.04,
  .stab_roll_kp = 2.0,    /* the wing's 1.2 through its 25 deg, on 14.5 */
  .stab_roll_kd = 0.20,
  .stab_pitch_kp = 5.0,
  .stab_pitch_kd = 0.5,
  .stab_pitch_down = 0.0,   /* its glide is nose higher than the trim: npm run stab:glide */
  .stab_trim_throttle = 0.400, /* the stick that flies it level, elevons neutral */
  .acro_roll_rate = 220.0 * WING_PI / 180.0, /* 0.7 of full elevon's 315 deg/s at 15 m/s */
  .acro_pitch_rate = 100.0 * WING_PI / 180.0,
  .acro_expo = 0.30,
  .acro_err_max = 5.0 * WING_PI / 180.0,
  .acro_roll_kp = 5.0,
  .acro_roll_kd = 0.40,
  .acro_roll_ff = 0.20,
  .acro_pitch_kp = 5.0,
  .acro_pitch_kd = 0.5,
  .acro_pitch_ff = 0.40,
  .acro_roll_ki = 6.0,
  .acro_pitch_ki = 8.0,
  .acro_i_max = 0.30,
  .yaw_coord_k = 0.0,     /* no rudder */
  .air_lift = 1,          /* "motor up to those distant thermals then power-down and soar", Zagi */
  /* Past the stall: the MH45 at 1.5e5 (UIUC), the flying wing's arms. */
  .stall_arm_ac = -0.0990,
  .stall_arm_cp = 0.2490,
  .stall_asym = 0.00469,
  .stall_k = 0.858,
  .stall_top = 2.64 * WING_PI / 180.0,
  .strip_c = { 1.3095, 1.1032, 0.8968, 0.6905 }, /* the 0.416 taper */
  .j_prop = 0.0000112,    /* the carbon 5 x 5, its adapter and the inrunner's rotor */
  .strip_tau = { 0.2679, 0.4981, 0.5487, 0.6184 }, /* the 1.5 in elevons, from the bay's edge to the tip */
  .surf_sep = 0.3325,     /* the elevon's chord fraction at the MAC over its tau */
  .strip_r = { 0.8308, 1.0065, 1.1188, 1.1386 }, /* the lattice's span loading: the tips most */
};

/* Phil Kraft's Das Ugly Stik as RCM published Jim Jensen's kit of it,
 * plan 939, May and June 1985, docs/UGLYSTIK-STAGE1.md, where each number
 * has its formula and source (scripts/uglystik-derive.js) and the
 * estimated ones say so. A 62 in balsa sport aerobat: a constant chord
 * shoulder wing on a section within a percent of symmetric at half a
 * degree of incidence, 1.5 in of dihedral a side, strip ailerons along
 * the whole trailing edge outside the centre, a flat stabiliser on the
 * fuselage's bottom and the rounded "egg" of a fin; RCM's own travel
 * limits. An O.S. 61FX two stroke on a 12 x 6, clockwise seen from
 * behind, on no thrust offsets ("No thrust offsets are used", Kraft); the
 * stick runs it from its 2,000 rpm idle to full and it never stops. A
 * straight, untwisted wing whose thick section stalls from the trailing
 * edge: it drops its nose and does not drop a wing. */
const FixedWingParams FW_UGLYSTIK1567 = {
  .mix = FW_MIX_TAIL,
  .span = 1.5682,         /* the plan, 61.7 in over the aileron tips */
  .area = 0.51055,        /* the plan: 731 sq in to the hinge line, 60 of strip ailerons */
  .chord = 0.3256,        /* S/b */
  .cl_alpha = 4.824,      /* wing (its dihedral's cos^2) and tail, DATCOM downwash */
  .cl_max = 0.95,         /* a 16 percent near symmetric section at 2.3e5, ESTIMATED */
  /* The zero lift line 0.43 degrees under the thrust line: the section's
   * zero at the plan's half degree of incidence, less the tail's share.
   * sin and cos of minus 0.43 degrees, to 17 digits. */
  .alpha_zl = -0.43 * WING_PI / 180.0,
  .sin_zl = -0.0075048453329269677,
  .cos_zl = 0.99997183825172242,
  .cd0 = 0.045,           /* an open side mounted engine, a slab box, strip ailerons, strap gear */
  .k_induced = 0.08811,   /* 1/(pi 0.75 4.82) */
  .cl_de = -0.3057,
  .cy_beta = -0.2505,
  .cy_dr = 0.1403,
  .cl_beta = -0.0813,     /* 3.07 degrees of dihedral, the shoulder wing and the fin */
  .cl_p = -0.7378,
  .cl_da = 0.2510,        /* strip ailerons, 9 percent of the chord, from 5.7 in to the tip */
  .cl_r_per_cl = 0.25,
  .cl_dr = 0.0059,
  .cm_0 = 0.0281,         /* level at 3/4 throttle with the elevator neutral, RCM's trim */
  .cm_alpha = -0.4880,    /* static margin 0.101 at the plan's CG, on the main spar */
  .cm_q = -6.792,
  .cm_de = 0.6835,
  .cn_beta = 0.1068,      /* the egg and its sub fin, less the slab box's */
  .cn_r = -0.1218,
  .cn_p_per_cl = -0.125,
  .cn_da_per_cl = -0.06,  /* the bellcranks' differential takes half the Cub's adverse yaw */
  .cn_dr = -0.0659,
  /* A thick section's trailing edge stall comes on over the P-51's 3 deg,
   * ESTIMATED. */
  .stall_blend = 3.0 * WING_PI / 180.0,
  /* RCM's travel limits at the trailing edge: 5/16 in up and 1/4 down on
   * the 1.29 in aileron, their mean; 3/8 in on the 1.67 in elevator; 1 in
   * on the 3.96 in rudder; their arcsines, which configs/tuning.js
   * restates. */
  .throw_a = 12.5969 * WING_PI / 180.0,
  .throw_e = 12.9765 * WING_PI / 180.0,
  .throw_r = 14.6270 * WING_PI / 180.0,
  .surface_max = 12.5969 * WING_PI / 180.0,
  .expo = 0.30,
  .thrust_static = 36.206, /* N, APC's 12 x 6 at 10,895 rpm */
  .pitch_speed = 27.673,
  .rpm_no_load = 12817.6,
  .torque_arm = 0.01690,  /* APC's 0.612 N m at 10,895 rpm, the engine's torque, over 36.2 N */
  .thrust_z = -0.0043,    /* the crankshaft 0.17 in under the CG */
  .pfactor = 1.6,         /* blade element at 0.75 R, as the Cub's */
  .current_full = 0.0,    /* the engine burns fuel, not the pack */
  .duty_min = 0.02,
  .stab_bank_max = 60.0 * WING_PI / 180.0,
  .stab_pitch_max = 30.0 * WING_PI / 180.0,
  .stab_trim_pitch = 2.0 * WING_PI / 180.0,
  .stab_deadband = 0.04,
  .stab_roll_kp = 2.0,
  .stab_roll_kd = 0.20,
  .stab_pitch_kp = 3.0,
  .stab_pitch_kd = 0.5,
  .stab_pitch_down = 9.69 * WING_PI / 180.0, /* to its power off glide, npm run stab:glide */
  .stab_trim_throttle = 0.745, /* the stick that flies it level, elevator neutral */
  .acro_roll_rate = 80.0 * WING_PI / 180.0, /* 0.85 of full aileron's 95 deg/s at the trim */
  .acro_pitch_rate = 60.0 * WING_PI / 180.0, /* under the accelerated stall at the trim, 76 deg/s */
  .acro_expo = 0.30,
  .acro_err_max = 5.0 * WING_PI / 180.0,
  .acro_roll_kp = 4.0,
  .acro_roll_kd = 0.70,
  .acro_roll_ff = 0.20,
  .acro_pitch_kp = 4.0,
  .acro_pitch_kd = 0.5,
  .acro_pitch_ff = 0.40,
  .acro_roll_ki = 6.0,
  .acro_pitch_ki = 8.0,
  .acro_i_max = 0.30,
  .yaw_coord_k = 1.5,
  .throttle_idle = 0.1836, /* O.S.'s 2,000 rpm, the lowest practical, of the 10,895 */
  /* The tank, docs/POWER-STAGE1.md: RCM's 12 oz, 355 cc. The full
   * throttle flow a measured .40 two stroke's (Menon 2010, 17.9 cc/min)
   * scaled by the displacement, 9.95 over 6.5 cc: 27.4 cc/min, linear in
   * the rpm through zero, ESTIMATED; the lean run the Bombshell's. */
  .tank_m3 = 355.0e-6,
  .flow_full = 27.4e-6 / 60.0,
  .flow_idle = 0.1836 * (27.4e-6 / 60.0),
  .lean_frac = 0.05,
  .lean_gain = 0.05,
  /* Past the stall, docs/STALL-STAGE1.md and scripts/stall-derive.js: a
   * 16 percent section within a percent of symmetric at 2.3e5, the NACA
   * 2415's UIUC curve at 2e5, held 4.2 deg and falling to 0.76. */
  .stall_arm_ac = 0.0991, /* the CG 1.27 in behind the wing's aerodynamic centre */
  .stall_arm_cp = 0.0610, /* the plate's centre of pressure at 0.40 of the chord */
  .stall_dw = 0.1427,
  .stall_asym = 0.00307,
  .stall_k = 0.76,
  .stall_top = 4.2 * WING_PI / 180.0,
  .strip_c = { 1.0, 1.0, 1.0, 1.0 },
  .washout = 0.0,         /* "Keep the trailing edge flat": built flat on the board */
  /* The ailerons from 5.7 in out: a quarter of the inner strip, all of
   * the rest. */
  .strip_tau = { 0.055, 0.22, 0.22, 0.22 },
  .j_prop = 0.00027,      /* the 12 x 6's 46 g of wood blades and the crank's front, ESTIMATED */
  /* The slipstream, scripts/wash-derive.js. */
  .slip_r = 0.1524, .slip_yh = 0.283, .slip_hv = { 0.178, 0.087 }, .slip_ya = { 0.145, 0.784 },
  .slip_a0 = 0.05137, .slip_cl_a = 0.3967, .slip_cm_a = -0.8873, .slip_cn_b = 0.1178,
  .slip_cn_r = -0.1107, .slip_cy_b = -0.2505, .slip_cl_b = -0.01054,
  .side_cda = 0.084, /* 0.84 of 0.1 m^2, the slab fuselage in side view, scripts/uglystik-derive.js */
};

/* Great Planes' Tiger Moth ARF, GPMA1330, docs/TIGERMOTH-STAGE1.md, where
 * every number has its formula and source and the estimated ones say so
 * (scripts/tigermoth-derive.js prints them). A 71 in balsa and ply scale
 * de Havilland DH.82A, the full size at 1/4.96 on its span: two wings of
 * one chord and span, both swept back and staggered, the top one 0.113 m
 * ahead at the root, rigged at the full size's 4 deg of incidence; the
 * ailerons on the bottom wing alone and no differential; a long tail on a
 * small fin and a big rudder; an O.S. 61FX on a 12 x 6, the first engine
 * Great Planes list; a taildragger on V strut gear and a tail wheel on a
 * wire in the rudder. The cell's derivatives are on Great Planes' 1360 sq
 * in and the 71 in span, the reference chord the wings' own; the wings
 * themselves are the second wing's (bip_*). Its CG, the kit's 70 mm
 * behind the bottom wing's leading edge, is 0.107 chords behind the
 * cell's aerodynamic centre: the tail holds a static margin of 0.038, and
 * it pitches easily and does not right itself. */
const FixedWingParams FW_TIGERMOTH1803 = {
  .mix = FW_MIX_TAIL,
  .span = 1.8034,         /* Great Planes, 71 in, both wings */
  .area = 0.87742,        /* Great Planes, 1360 sq in, both wings */
  .chord = 0.2683,        /* the full size's 1.33 m at 1/4.96, both wings */
  .cl_alpha = 4.6328,     /* the cell in each wing's wash, and the tail, DATCOM downwash */
  .cl_max = 1.05,         /* each wing's own, a cambered trainer section at 1.8e5, ESTIMATED */
  /* The zero lift line 5.47 deg under the thrust line: the section's -2
   * deg at the full size's 4 deg of incidence, less the tail's share.
   * sin and cos of minus 5.47 deg, to 17 digits. */
  .alpha_zl = -5.47 * WING_PI / 180.0,
  .sin_zl = -0.095324551175009861,
  .cos_zl = 0.99544624663679504,
  .cd0 = 0.058,           /* two wings, the struts and wires, open cockpits, V strut gear, ESTIMATED */
  .k_induced = 0.07819,   /* the biplane at its own split, Munk's span 1.137 b, e 0.85: the strips' drag */
  .cl_de = -0.3359,
  .cy_beta = -0.3080,
  .cy_dr = 0.1996,
  .cl_beta = -0.0577,     /* the two dihedrals, the top wing high over the fuselage, the fin */
  .cl_p = -0.8070,        /* strip theory on both wings at their own slopes */
  .cl_da = 0.2696,        /* the bottom wing's ailerons, 0.35 to 0.89 m out */
  .cl_r_per_cl = 0.25,
  .cl_dr = 0.0112,
  .cm_0 = 0.0174,         /* level at 3/4 throttle with the elevator neutral */
  .cm_alpha = -0.1745,    /* static margin 0.038 at the kit's 70 mm */
  .cm_q = -8.013,
  .cm_de = 1.0494,
  .cn_beta = 0.0965,      /* the small fin and big rudder, less the fuselage's */
  .cn_r = -0.1262,
  .cn_p_per_cl = -0.125,
  /* Adverse yaw: Nelson's 2 K CL Cl_da on the bottom wing's own CL, and
   * the top wing's downwash tilting the lift the ailerons add: no
   * differential, the ailerons on one wing. */
  .cn_da_per_cl = -0.0944,
  .cn_dr = -0.1034,
  /* A cambered section's trailing edge stall, the Cub's 3 deg. */
  .stall_blend = 3.0 * WING_PI / 180.0,
  /* Great Planes' high rate at the widest part of each surface: aileron
   * 3/4 in on 67 mm, elevator 1 in on 121 mm, rudder 2 in on 202 mm; their
   * arcsines, which configs/tuning.js restates. */
  .throw_a = 16.5003 * WING_PI / 180.0,
  .throw_e = 12.1141 * WING_PI / 180.0,
  .throw_r = 14.5859 * WING_PI / 180.0,
  .surface_max = 16.5003 * WING_PI / 180.0,
  .expo = 0.30,           /* the house stock expo; Great Planes give none */
  .thrust_static = 36.206, /* N, the Ugly Stik's 61FX on APC's 12 x 6 at 10,895 rpm */
  .pitch_speed = 27.673,
  .rpm_no_load = 12817.6,
  .torque_arm = 0.01690,  /* APC's 0.612 N m at 10,895 rpm over 36.2 N */
  .thrust_z = 0.0074,     /* the thrust line 7 mm over the CG, from the masses */
  .pfactor = 1.6,         /* blade element at 0.75 R, as the Cub's */
  .current_full = 0.0,    /* the engine burns fuel, not the pack */
  .duty_min = 0.02,
  .stab_bank_max = 60.0 * WING_PI / 180.0,
  .stab_pitch_max = 30.0 * WING_PI / 180.0,
  .stab_trim_pitch = 0.0,   /* level at the trim flies at 0.3 deg nose down: it cruises tail up */
  .stab_deadband = 0.04,
  .stab_roll_kp = 2.0,
  .stab_roll_kd = 0.20,
  .stab_pitch_kp = 2.0,
  .stab_pitch_kd = 0.4,
  .stab_pitch_down = 8.94 * WING_PI / 180.0, /* to its power off glide, npm run stab:glide */
  .stab_trim_throttle = 0.749, /* the stick that flies it level, elevator neutral */
  .acro_roll_rate = 75.0 * WING_PI / 180.0, /* 0.85 of full aileron's 88 deg/s at the trim */
  .acro_pitch_rate = 45.0 * WING_PI / 180.0,
  .acro_expo = 0.30,
  .acro_err_max = 5.0 * WING_PI / 180.0,
  .acro_roll_kp = 4.0,
  .acro_roll_kd = 0.70,
  .acro_roll_ff = 0.20,
  .acro_pitch_kp = 3.0,
  .acro_pitch_kd = 0.5,
  .acro_pitch_ff = 0.30,
  .acro_roll_ki = 6.0,
  .acro_pitch_ki = 6.0,
  .acro_i_max = 0.30,
  .yaw_coord_k = 1.5,
  .throttle_idle = 0.1836, /* O.S.'s 2,000 rpm, the lowest practical, of the 10,895 */
  /* The tank, the Stik's 12 oz, ESTIMATED (Great Planes give no size), and
   * the Stik's 61FX flow: 27.4 cc/min at full throttle, linear in the
   * rpm; the lean run the Bombshell's. */
  .tank_m3 = 355.0e-6,
  .flow_full = 27.4e-6 / 60.0,
  .flow_idle = 0.1836 * (27.4e-6 / 60.0),
  .lean_frac = 0.05,
  .lean_gain = 0.05,
  /* Past the stall, docs/STALL-STAGE1.md and scripts/tigermoth-derive.js:
   * the CG 0.107 chords behind the cell's aerodynamic centre; a Clark-Y
   * class section at 1.8e5, held 6.2 deg past its peak and falling to
   * 0.72. */
  .stall_arm_ac = 0.1068,
  .stall_arm_cp = 0.0432,
  .stall_dw = 0.1286,
  .stall_asym = 0.00373,
  .stall_k = 0.72,
  .stall_top = 6.2 * WING_PI / 180.0,
  .strip_c = { 1.0, 1.0, 1.0, 1.0 }, /* both wings rectangles */
  .washout = 0.0,         /* built flat; Great Planes give none */
  /* No strip_tau: the strips judge their stall on the top wing, which
   * stalls first and has no ailerons. */
  .j_prop = 0.00027,      /* the Stik's 12 x 6 and the crank's front, ESTIMATED */
  /* The second wing, scripts/tigermoth-derive.js: the top wing (0) and the
   * bottom one (1), 0.333 m apart at the root, the top one's quarter chord
   * 0.108 m ahead at the mean chords, Prandtl's sigma 0.539 on the Trefftz
   * plane. */
  .bip_w = { 0.5684, 0.4316 },
  .bip_r = { 1.1087, 0.8856 },
  .bip_m = { 0.0101, 0.2202 },
  .bip_x = { 0.1729, -0.2277 },
  .bip_ki = { 0.02655, 0.02399 },
  .bip_kx = { 0.01361, 0.01361 },
  /* The slipstream, scripts/wash-derive.js. */
  .slip_r = 0.1524, .slip_yh = 0.3025, .slip_hv = { 0.246, 0.081 }, .slip_ya = { 0.35, 0.89 },
  .slip_a0 = -0.007186, .slip_cl_a = 0.2292, .slip_cm_a = -0.7162, .slip_cn_b = 0.1077,
  .slip_cn_r = -0.1117, .slip_cy_b = -0.2081, .slip_cl_b = -0.01166,
  .side_cda = 0.1436, /* 0.84 of 0.171 m^2, the fuselage in side view, scripts/tigermoth-derive.js */
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
  .cy_beta = -0.4945,     /* the fins' and the 0.34 m fuselage's */
  .cy_dr = 0.0778,        /* the two small rudders */
  .cl_beta = -0.0933,     /* the sweep's at the cruise's lift, the bay's trim lead aboard; the fins' centroid barely over the wing */
  .cl_p = -0.2973,
  .cl_da = 0.2297,
  .cl_r_per_cl = 0.1934,
  .cl_dr = 0.0035,
  .cm_0 = 0.0763,         /* the reflex: trims at the bay's trim CG, the standard warhead's 18 m/s cruise */
  .cm_alpha = -0.1570,    /* static margin 0.04 of the MAC bare; the bay's warhead and trim lead add to it */
  .cm_q = -1.4020,
  .cm_de = 0.4516,        /* delta_e positive pitches the nose up */
  .cn_beta = 0.0118,      /* the fins, less most of it back to the long fuselage */
  .cn_r = -0.0627,
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
  .pitch_speed = 29.633,   /* the 14 in pitch at 5,000 rpm */
  .rpm_no_load = 5882.4,   /* the plant's rule: 5,000 is 0.85 of it */
  .torque_arm = 0.05529,   /* 15.7 N m on the shaft over the static thrust */
  .thrust_z = 0.0196,      /* the shaft on the fuselage's axis, over the CG */
  .current_full = 0.0,     /* the engine burns fuel, not the pack */
  .duty_min = 0.02,
  .stab_bank_max = 45.0 * WING_PI / 180.0,
  .stab_pitch_max = 20.0 * WING_PI / 180.0,
  .stab_trim_pitch = 2.0 * WING_PI / 180.0,
  .stab_deadband = 0.04,
  .stab_roll_kp = 2.0,
  .stab_roll_kd = 0.2,
  .stab_pitch_kp = 4.0,
  .stab_pitch_kd = 0.8,
  .stab_pitch_down = 2.66 * WING_PI / 180.0, /* to its power off glide at the bay's trim CG, npm run stab:glide */
  .stab_trim_throttle = 0.597, /* the stick that flies it level with the standard warhead, elevons neutral */
  .acro_roll_rate = 90.0 * WING_PI / 180.0,
  .acro_pitch_rate = 40.0 * WING_PI / 180.0,
  .acro_expo = 0.30,
  .acro_err_max = 5.0 * WING_PI / 180.0,
  .acro_roll_kp = 5.0,
  .acro_roll_kd = 0.4,
  .acro_roll_ff = 0.724,  /* the stick for a rate at cruise, pb/2V 0.095 */
  .acro_pitch_kp = 5.0,
  .acro_pitch_kd = 0.8,
  .acro_pitch_ff = 0.236, /* the stick for a pull's pitch rate at cruise */
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
  .stall_asym = 0.00108,
  .stall_k = 0.92,
  .stall_top = 2.8 * WING_PI / 180.0,
  .strip_c = { 1.6690, 1.1360, 0.7850, 0.4341 }, /* the cranked planform's chords */
  .j_prop = 0.01652,      /* the 30 in wooden blades and the crank */
  .strip_tau = { 0.0, 0.4515, 0.5572, 0.4553 }, /* the elevons, 0.32 to 1.12 m out */
  .surf_sep = 0.2939,     /* the elevon's chord fraction at the MAC over its tau */
  .strip_r = { 0.7173, 0.9856, 1.2152, 1.6325 }, /* the lattice's span loading: the tips most */
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
  .rpm_no_load = 147058.8, /* the plant's rule on the class's 125,000 rpm at full */
  .torque_arm = 0.0,      /* a turbojet's reaction is its own shaft's, nothing to the airframe */
  .thrust_z = 0.1099,     /* the nacelle on the tail, over the axis: power pitches the nose down */
  .current_full = 0.0,
  .duty_min = 0.02,
  .stab_bank_max = 45.0 * WING_PI / 180.0,
  .stab_pitch_max = 20.0 * WING_PI / 180.0,
  .stab_trim_pitch = 2.0 * WING_PI / 180.0,
  .stab_deadband = 0.04,
  .stab_roll_kp = 1.5,
  .stab_roll_kd = 0.15,
  .stab_pitch_kp = 2.5,
  .stab_pitch_kd = 0.4,
  .stab_pitch_down = 20.13 * WING_PI / 180.0, /* to its glide on the idle's thrust at the bay's trim CG, npm run stab:glide */
  .stab_trim_throttle = 0.689, /* the stick that flies it level with the standard warhead, elevons neutral */
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
  .stall_asym = 0.00108,
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
};

/* E-flite's Extra 300 3D 1.3m, EFL115500, docs/EXTRA-STAGE1.md and
 * scripts/extra-derive.js, where each number has its formula and source
 * and the estimated ones say so; removed as airframe 14 on 2026-09-29 and
 * back as 29 for the flight model lane (docs/FLIGHTMODEL.md), its table
 * as it was, the slipstream's swirl and the gyroscope the plant's own now.
 * A moulded foam aerobatic monoplane whose static thrust is two and a half
 * times its weight, the one table with the high angles and the slow air's
 * damping:
 * it hangs on its prop, its oversized ailerons, elevator and rudder
 * working in the wash with no airspeed at all, the airframe turning
 * against the prop's torque when they are let go. A 4250 910 kV on 4S
 * turns a 13 x 6 wood prop, clockwise seen from behind, on a thrust line
 * through the CG. */
const FixedWingParams FW_EXTRA3D1308 = {
  .mix = FW_MIX_TAIL,
  .span = 1.308,          /* E-flite, 51.5 in */
  .area = 0.369,          /* E-flite, 36.9 dm^2 */
  .chord = 0.2927,        /* the mean aerodynamic chord of the measured taper */
  .cl_alpha = 4.704,      /* wing and tail, Nelson eq. 2.52 */
  .cl_max = 0.95,         /* a thick symmetric section at 2e5 */
  /* A symmetric section at no incidence: zero lift on the body axis. */
  .alpha_zl = 0.0,
  .sin_zl = 0.0,
  .cos_zl = 1.0,
  .cd0 = 0.045,           /* big gear and pants, open hinge gaps, a thick wing */
  .k_induced = 0.09155,   /* 1/(pi 0.75 4.636) */
  .cl_de = -0.3537,
  .cy_beta = -0.5731,
  .cy_dr = 0.2439,
  .cl_beta = 0.0105,      /* no dihedral: the low wing's roll, less the fin's */
  .cl_p = -0.6276,
  .cl_da = 0.3722,
  .cl_r_per_cl = 0.25,
  .cl_dr = 0.0112,
  .cm_0 = 0.0450,         /* trimmed hands off at 15 m/s, the pilot's elevator trim taken as neutral */
  .cm_alpha = -0.7265,    /* static margin 0.154 at the manual's 95 mm */
  .cm_q = -9.496,
  .cm_de = 0.8666,
  .cn_beta = 0.2405,      /* the big fin and rudder, less the fuselage's */
  .cn_r = -0.3577,
  .cn_p_per_cl = -0.125,
  .cn_da_per_cl = -0.08,  /* ESTIMATED: symmetric section, wide chord ailerons */
  .cn_dr = -0.1492,
  .stall_blend = 3.0 * WING_PI / 180.0,
  /* E-flite's high rates, 50, 60 and 100 mm at the surfaces' widest
   * chords; the control derivatives carry Roskam's large deflection K' at
   * these throws. */
  .throw_a = 36.53 * WING_PI / 180.0,
  .throw_e = 39.67 * WING_PI / 180.0,
  .throw_r = 55.05 * WING_PI / 180.0,
  .surface_max = 36.53 * WING_PI / 180.0,
  .expo = 0.30,           /* E-flite's high rate expo */
  .thrust_static = 37.86, /* N, ESTIMATED: the 4250 on 4S against APC's 13 x 6.5E, 10,127 rpm */
  .pitch_speed = 29.08,
  .rpm_no_load = 13468.0,
  .torque_arm = 0.01719,  /* the prop's 0.651 N m at 37.9 N */
  .thrust_z = 0.0,        /* the thrust line through the CG */
  .pfactor = 1.89,        /* the Cub's blade element figure on a 13 in prop */
  .current_full = 64.4,
  .duty_min = 0.02,
  .stab_bank_max = 60.0 * WING_PI / 180.0,
  .stab_pitch_max = 30.0 * WING_PI / 180.0,
  .stab_trim_pitch = 2.0 * WING_PI / 180.0,
  .stab_deadband = 0.04,
  /* The Cub's loops scaled to throws two and a half times the Cub's. */
  .stab_roll_kp = 0.6,
  .stab_roll_kd = 0.06,
  .stab_pitch_kp = 2.0,
  .stab_pitch_kd = 0.2,
  .stab_pitch_down = 8.72 * WING_PI / 180.0, /* to its power off glide, npm run stab:glide */
  .stab_trim_throttle = 0.624, /* the stick that flies it level, elevator neutral */
  .acro_roll_rate = 360.0 * WING_PI / 180.0,
  .acro_pitch_rate = 100.0 * WING_PI / 180.0, /* what full elevator holds at 16 m/s, near CLmax */
  .acro_expo = 0.30,
  .acro_err_max = 5.0 * WING_PI / 180.0,
  .acro_roll_kp = 1.5,
  .acro_roll_kd = 0.20,
  .acro_roll_ff = 0.10,
  .acro_pitch_kp = 2.0,
  .acro_pitch_kd = 0.2,
  .acro_pitch_ff = 0.15,
  .acro_roll_ki = 2.0,
  .acro_pitch_ki = 3.0,
  .acro_i_max = 0.30,
  .as3x_k = { 0.028, 0.1224, 0.1842 },
  .yaw_coord_k = 0.25,    /* the Cub's 3.0 over a rudder twelve times its authority */
  /* Past the stall, docs/STALL-STAGE1.md and scripts/stall-derive.js. */
  .stall_arm_ac = 0.0018, /* the manual's 95 mm is the wing's aerodynamic centre, near enough */
  .stall_arm_cp = 0.1482,
  .stall_dw = 0.2661,
  .stall_asym = 0.00342,
  .stall_k = 0.70,
  .stall_top = 2.0 * WING_PI / 180.0,
  .strip_c = { 1.213, 1.071, 0.929, 0.787 },
  /* The slipstream, the high angles and the slow air, scripts/extra-derive.js:
   * the 13 in prop; the stabiliser's half span, the fin over and under the
   * thrust line, the ailerons' span; the tail's shares. */
  .slip_r = 0.1651,
  .slip_yh = 0.2505,
  .slip_hv = { 0.208, 0.085 },
  .slip_ya = { 0.077, 0.654 },
  .slip_a0 = 0.0619,
  .slip_cl_a = 0.3143,
  .slip_cm_a = -0.7700,
  .slip_cn_b = 0.2832,
  .slip_cn_r = -0.3465,
  .slip_cy_b = -0.4631,
  .slip_cl_b = -0.0212,
  .strip_tau = { 0.378, 0.378, 0.378, 0.378 }, /* the ailerons run from 0.077 m to the tip */
  .hi_alpha = 1,
  .tail_at = 3.699,
  .tail_av = 3.715,
  .tail_deda = 0.603,
  .tail_cn = 1.17,        /* a flat plate normal to the flow, Hoerner */
  .side_cda = 0.1323,
  .rot_k = { 0.01580, 0.04108, 0.03462 },
  .j_prop = 0.000249,     /* a 35 g wood blade and the outrunner's can, ESTIMATED */
};
