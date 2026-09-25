/*
 * sim_internal.h: shared state and interfaces between sim.c (entry points
 * and integrator), plant.c (motors, props, battery, aero) and bridge.c
 * (Betaflight side and config shim). Not part of the public ABI.
 *
 * Frames and units follow sim_abi.h: SI, world z up, body x forward,
 * y left, z up, right-handed.
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

#ifndef SIM_INTERNAL_H
#define SIM_INTERNAL_H

#include "sim_abi.h"

/*
 * The step, derived from the ONE declared rate rather than typed again.
 *
 * SIM_STEP_HZ in sim_abi.h is the single place the loop rate is written
 * down. It used to be written down here as well, as a bare 1.0/1000.0, and
 * in four more places in the Betaflight glue as a bare 1000, so raising the
 * rate meant finding all six and getting every one right. At 1000 these
 * expressions are exactly the constants they replace: 1000000 / 1000 is
 * 1000 in integer arithmetic and 1.0 / 1000.0 is unchanged, so a rebuild at
 * the current rate must produce a bit identical trace. That equality is the
 * test that this refactor changed nothing.
 */
#define SIM_DT (1.0 / (double)SIM_STEP_HZ)
/* Microseconds of simulated time per step. Exact at every rate that divides
 * a megahertz, which every rate worth running does. */
#define SIM_US_PER_STEP (1000000 / SIM_STEP_HZ)
#define SIM_MOTOR_COUNT 4

/*
 * Reference airframe constants from STAGE1.md. Everything not fixed by
 * STAGE1.md is a plant tuning constant, chosen to land inside the
 * verification bands; the reasoning lives in PROGRESS.md.
 */
/*
 * A wheel, for an airframe that stands on landing gear. sim.c applies each
 * one as a spring and damper along the ground normal at its tyre's contact
 * point, and friction split along the wheel's own heading (rolling) and
 * across it (side grip). With no radius and the two frictions equal it is
 * a skid, a hard point that drags: the Cub's prop tip is one.
 * docs/CUB-STAGE1.md derives the numbers and says why this is the model.
 */
#define SIM_WHEELS_MAX 4
typedef struct {
  double pos[3];  /* the axle's centre, body frame, strut unloaded */
  double r;       /* tyre radius: the contact is the rim's point nearest
                   * the ground, so it moves round the tyre as the aircraft
                   * pitches instead of staying one point of the body */
  double k;       /* strut and tyre stiffness, N/m */
  double c;       /* damping, N s/m */
  double mu_roll; /* rolling resistance along the wheel's heading */
  double mu_side; /* side grip across it */
  double steer;   /* wheel angle per radian of rudder, the same sign: a
                   * tailwheel turns its front the way the rudder's trailing
                   * edge goes, and 0 is a wheel that does not steer */
  double brake;   /* 1 on a wheel the brake channel acts on, 0 elsewhere */
} WheelParams;

/*
 * FLOATS, for an airframe that sits on water: two float hulls, one each
 * side, the same shape. sim.c samples each along its keel in
 * SIM_FLOAT_STATIONS strips, bow to stern, and each strip in the water
 * gets its buoyancy, the planing force of the water it pushes down, the
 * drag of the water across and along it; each float gets its wave making
 * drag and a water rudder at its stern, steered with the air rudder. On
 * land the keel's bow, knee, step and stern are skids. docs/FLOATS-STAGE1.md
 * derives every number and says why this is the model.
 *
 * The keel, in the body frame: flat at z_keel from the step forward to
 * the knee, rising bow_rise to the bow; aft of the step it is step_h
 * higher and rises aft_slope per metre to the stern. The deck is depth
 * over the forebody keel. Each section is a V of deadrise tan_dr to the
 * chines, then sides straight up.
 */
#define SIM_FLOAT_STATIONS 20
typedef struct {
  int count;          /* 0, an airframe without floats, or 2 */
  double y;           /* each float's centreline, |body y|, m */
  double x_bow, x_knee, x_step, x_stern; /* body x, m */
  double z_keel;      /* the forebody keel, body z, m */
  double bow_rise;    /* the keel at the bow over z_keel, m */
  double step_h;      /* the step's height, m */
  double aft_slope;   /* the afterbody keel's rise per metre aft */
  double depth;       /* forebody keel to deck, m */
  double beam;        /* m */
  double tan_dr;      /* tan of the deadrise angle */
  /* The water rudder: its blade's centre, body x and z (both floats, at
   * +-y), its span, its area, its lift slope per rad and CL limit, and
   * its angle per radian of air rudder, the same sign. */
  double rudder_x, rudder_z, rudder_span, rudder_area, rudder_a, rudder_clmax, rudder_steer;
  double cf;          /* skin friction coefficient on the wetted girth */
  double c_cross;     /* crossflow drag coefficient, normal to the bottom */
  double c_side;      /* crossflow drag coefficient, sideways */
  double k_rad;       /* heave radiation damping, per rho B sqrt(g B) */
  double wave_k;      /* wave making drag at speed, per newton of buoyancy */
  double wave_fr0;    /* length Froude number where it is half grown */
  double k_ground, c_ground, mu_ground; /* a keel skid on land */
} FloatParams;

typedef struct {
  int kind;          /* PLANT_KIND_QUAD or PLANT_KIND_WING */
  double mass_kg;
  double inertia[3]; /* Ixx roll, Iyy pitch, Izz yaw */
  double gravity;
  double arm_x;      /* |x| of each motor from CG, metres */
  double arm_y;      /* |y| of each motor from CG, metres */
  double kt;         /* thrust coefficient, N per (rad/s)^2 */
  double kq;         /* prop drag torque coefficient, N m per (rad/s)^2 */
  double ke;         /* back EMF constant, V s/rad. The LOADED constant, not
                      * 60/(2 pi kV) off the nameplate; plant.c says why. */
  double r_motor;    /* effective motor plus ESC resistance, ohms */
  double j_rotor;    /* rotor plus prop inertia, kg m^2 */
  double cells;      /* series cells */
  double r_cell;     /* internal resistance per cell, ohms */
  double cda_plan;   /* drag area top, m^2, along body z */
  double cda_front;  /* drag area front, m^2, along body x */
  double cda_side;   /* drag area side, m^2, along body y */
  double k_body_lift; /* cross flow side lift area, m^2. Side force linear in
                      * the lateral velocity component at flight speed, the
                      * body and pack as a lifting slab; see plant.c. */
  double rho;        /* air density */
  double k_propwash; /* unsteady inflow amplitude, fraction of thrust at full
                      * recirculation depth. See plant.c. */
  double prop_r;     /* prop radius, metres. Sets the disc area the induced
                      * velocity is computed over. */
  double k_rotor_drag; /* rotor drag (H force) scale, dimensionless O(1).
                      * See plant.c: H = k rho A v_i v_perp per rotor. */
  double k_ground;   /* ground effect strength, 0 for none, 1 for the
                      * Cheeseman and Bennett form on the four discs' merged
                      * radius. See plant.c: zero on the five inch, whose
                      * calibrated envelope was measured without it. */
  double k_rotor_axial; /* drag coefficient of ONE STALLED ROTOR DISC in a
                      * descent, on disc area, dimensionless O(1). Zero for
                      * an airframe whose cda_plan was fitted against a
                      * measured descent and therefore already carries it.
                      * See plant.c: this is the descent only half of the
                      * rotor's drag and it never acts in a climb. */
  double k_inflow;   /* prop pitch radius, metres per radian: the prop's
                      * geometric pitch over 2 pi. A rotor at omega has a
                      * pitch speed of omega times this, and thrust scales
                      * with (1 - axial speed / pitch speed). The name is
                      * historical, from when this was a thrust loss
                      * coefficient; plant.c says so at the constant. */
  double torque_ind; /* induced share of shaft torque at hover, which IS the
                      * figure of merit kq was derived through. Was the file
                      * scope PLANT_TORQUE_IND; it is a property of the rotor
                      * and moves with the airframe. */
  /*
   * THE DUCT. Three numbers, and all three are 1, 0 and 0 on an open rotor,
   * which is what makes the five inch's arithmetic bit identical after this
   * struct grew: x * 1.0 is x and x + 0.0 is x in IEEE 754.
   */
  double k_duct;      /* static thrust augmentation from the shroud. 1.0 is an
                       * open rotor. A moulded whoop duct with a 3 percent tip
                       * gap earns about 1.10; the ideal duct of momentum
                       * theory would be 1.26 and no real one is close. */
  double duct_fade;   /* edgewise air speed, as a multiple of the rotor's own
                       * induced velocity, at which HALF the augmentation is
                       * gone. A duct works by removing wake contraction, and
                       * a duct flying sideways stops being able to. 0 disables
                       * the fade, which is what an open rotor wants. */
  double k_duct_lip;  /* duct lip suction moment coefficient. A shroud in
                       * edgewise flow carries a large suction peak on its
                       * UPWIND lip, which is an upward force ahead of the
                       * centre and therefore a nose up moment. This is the
                       * defining ducted fan handling characteristic and an
                       * open rotor has none of it, so 0. */
  /* Motor geometry and build tolerance, per airframe. These were four file
   * scope tables in plant.c and are fields now for the same reason the rest
   * of this struct is: a second airframe has its own. */
  double spin[SIM_MOTOR_COUNT];         /* +1 counter clockwise seen from above */
  double pos_x[SIM_MOTOR_COUNT];
  double pos_y[SIM_MOTOR_COUNT];
  double pos_z[SIM_MOTOR_COUNT];        /* rotor disc height above the CG */
  double cant_radial_deg[SIM_MOTOR_COUNT];
  double cant_tangent_deg[SIM_MOTOR_COUNT];
  /*
   * The collision hull, which sim.c used to #define. A whoop is a third of
   * the five inch in every direction, so a shared hull would have it
   * touching a floor a centimetre before it reached one.
   */
  double hull_hx;       /* half extent, body x */
  double hull_hy;       /* half extent, body y */
  double hull_hz_down;  /* CG to the surface it parks on */
  double hull_hz_up;    /* CG to the top of the stack, what an inverted craft rests on */
  double contact_patch_r; /* resting spin friction lever, metres */
  double contact_arm_max; /* largest impulse arm a caller may hand sim_contact_at */
  double vib_ref_w;     /* rotor speed, rad/s, at which the bridge's gyro
                         * vibration injection reads its full amplitude. This
                         * airframe's own full throttle speed; bf_glue.c says
                         * why it cannot be one number for both. */
  double camera_x;      /* lens glass in the body frame */
  double camera_y;
  double camera_z;
  /* The fixed wing's aero, surfaces, motor and stabiliser, for a table
   * entry of PLANT_KIND_WING; null for a quad, which never reads it. */
  const struct FixedWingParams *fw;
  /* Landing gear. Zero wheels for every airframe that lands on its hull,
   * which leaves sim.c's contact path exactly what it was for them. */
  int wheel_count;
  WheelParams wheel[SIM_WHEELS_MAX];
  /* Floats. Zero count for every airframe that does not have them, which
   * leaves sim.c's step exactly what it was for them. */
  FloatParams floats;
} PlantParams;

/*
 * The airframes, in the order sim_set_airframe indexes them. 0 is the five
 * inch this project was built around and is the default, so a host that
 * never calls sim_set_airframe gets exactly the machine it always had.
 */
#define SIM_AIRFRAME_5IN 0
#define SIM_AIRFRAME_WHOOP65 1
#define SIM_AIRFRAME_WING1000 2
#define SIM_AIRFRAME_SKY1800 3
#define SIM_AIRFRAME_CUB1400 4
#define SIM_AIRFRAME_SLOWSTICK1180 5
#define SIM_AIRFRAME_RADIAN2000 6
#define SIM_AIRFRAME_TIMBER1500 7
#define SIM_AIRFRAME_BRAMOR2300 8
#define SIM_AIRFRAME_TIMBER1500F 9
#define SIM_AIRFRAME_CUB1400F 10
#define SIM_AIRFRAME_COUNT 11

/* What kind of plant a table entry is: the quad's plant_step or the wing's. */
#define PLANT_KIND_QUAD 0
#define PLANT_KIND_WING 1

typedef struct {
  /* rigid body, world frame */
  double pos[3];
  double vel[3];
  double quat[4]; /* w x y z, body to world */
  double omega[3]; /* body rates p q r, rad/s */
  /* motors, Betaflight order: 0 RR, 1 FR, 2 RL, 3 FL */
  double motor_omega[SIM_MOTOR_COUNT]; /* rad/s */
  /* Propwash: a band limited turbulence field, one channel per rotor, run
   * every step whether the craft is in the wash or not so that flying into
   * it does not restart it. Deterministic; see plant.c. */
  unsigned int wash_seed;
  double wash_fast[SIM_MOTOR_COUNT];
  double wash_slow[SIM_MOTOR_COUNT];
  /*
   * The ground, as the plant sees it: the CG's height above the host's
   * ground plane along the plane's normal, metres, and the normal itself in
   * the plant's world frame. ground_h is negative when the host has raised no
   * plane, which is every harness run and the reason the term it feeds is
   * off by default. Written by sim.c before every step from the same plane
   * the contact solver uses, so the air and the floor agree about where the
   * floor is.
   */
  double ground_h;
  double ground_n[3];
  /* battery */
  double cell_voltage_oc; /* open circuit per cell, volts */
  double pack_current;    /* total draw last step, amps */
  double vbat_load;       /* pack voltage under load, volts */
  /* time */
  long long step_index; /* completed 1 ms steps since reset */
} SimState;

/*
 * The airframe in force, as a pointer into a const table in plant.c.
 *
 * PLANT was a const global and every read of it constant folded at -O2.
 * Selecting an airframe at runtime costs that folding, and the reason that
 * is safe rather than merely probable is the build's own flags: with
 * -fno-fast-math and -ffp-contract=off the compiler may neither reassociate
 * nor contract, so a folded expression and a computed one are the SAME IEEE
 * double, and wasm has no excess precision to lose either. The five inch's
 * trace is measured bit identical across this change, not assumed; see
 * PROGRESS.md.
 */
extern const PlantParams PLANT_TABLE[SIM_AIRFRAME_COUNT];
extern const PlantParams *PLANT_P;
#define PLANT (*PLANT_P)

/* Select the airframe. Out of range is ignored. Clears the cached thrust
 * axes, which are built from the airframe's own cant table. */
void plant_set_airframe(int id);
int plant_airframe(void);
/* 1 if id names a table entry that is filled in, 0 for anything else. */
int plant_airframe_exists(int id);

/*
 * Flight style, set by sim_set_flight_style: 0 expert, 1 arcade. Owned by
 * sim.c, read by plant.c (wash application, inflow asymmetry, cant tables)
 * and bf_glue.c (gyro vibration). Deliberately NOT part of SimState: it is
 * a mode like angle mode, it survives reset and init, and the shell owns
 * asserting it.
 */
extern int SIM_ARCADE;

/*
 * AIR, set by sim_set_air: a scale on everything the air does to slow this
 * airframe down. 1.0 is the machine every band in tests/ and gates.config.json
 * was measured against; below 1 the quad carries further, above 1 it washes
 * speed off harder.
 *
 * THE ONE WORD THIS ANSWERS IS "FLOATY". The board keeps returning it, and
 * the two rounds that answered it moved exactly these numbers by hand: round
 * 17b added the rotor H force because the model "felt floaty and blew out
 * corners", and the mass went up twice off a report asking for more gravity.
 * Of the two, the drag set is the one that moves the feel without moving
 * anything a pilot has learned: hover stays where it is on the stick, the
 * punch and the climb are untouched, and what changes is how far the craft
 * carries with the sticks centred. Measured on the shipped five inch,
 * levelled and coasting from 20 m/s down to 10 m/s: 3.64 s and 102 m at 1.0,
 * 2.93 s and 79 m at 1.5 on the rotor term alone, 2.14 s and 60 m at 1.5 on
 * the whole set.
 *
 * WHAT IT SCALES, and why each one belongs: the per axis quadratic body drag
 * (cda_front, cda_side, cda_plan), which is the airframe's own bluff body
 * drag; k_rotor_drag, the H force, which is the dominant translational
 * damping at the speeds a race is flown at; and k_rotor_axial, the ducted
 * machine's descent brake. All three are the air pushing back on the craft.
 *
 * WHAT IT DOES NOT SCALE, deliberately. Not rho, because rho also sets the
 * induced velocity, the vortex ring thresholds and the propwash, so scaling
 * it would move hover, the descent model and the shake, none of which is what
 * "floaty" names. Not k_body_lift, which is a turning force rather than a
 * brake. Not mass, thrust or anything electrical: hover throttle is a number
 * pilots memorise and configs/rates.js quotes in a menu, so this knob leaves
 * it exactly where it is.
 *
 * A MODE, not dynamic state, in the same sense SIM_ARCADE is one: it survives
 * sim_reset and sim_init and the shell owns asserting it. At 1.0 the plant is
 * bit identical to the one before this existed, because x * 1.0 is x for
 * every finite double and no expression here was reassociated to get it. That
 * is measured against the recorded trace hash, not assumed.
 */
extern double SIM_AIR;

/*
 * GRAVITY, set by sim_set_gravity: a scale on the weight this craft carries.
 * 1.0 is 9.80665 and the machine every band was measured against.
 *
 * THIS IS THE OTHER HALF OF "FLOATY", and the pilot named it: asked to try
 * the drag slider, the answer came back "the difference is hardly
 * discernable" and "have it as floaty and sinky". Sinky is not planted.
 * Planted is the HORIZONTAL axis, how far the craft carries with the sticks
 * centred, which is what SIM_AIR moves. Sinky is the VERTICAL one, how fast
 * it comes down and how little it hangs, and no amount of drag buys it:
 * raising drag LOWERS the props level terminal, 22.0 m/s to 18.0 at 1.5, so
 * the drag slider was making the craft hang slightly MORE at the same time
 * as it made it corner better, which is exactly how a knob comes out feeling
 * like nothing.
 *
 * Gravity is the surgical version of that axis. It changes weight and
 * nothing else: inertia is untouched, so the craft rotates identically and
 * every rate figure holds; drag is untouched, so the horizontal coast is
 * unchanged; the motors and the pack are untouched. What moves is hover
 * throttle, sink rate, terminal velocity and how far a punch balloons, which
 * is the whole of what a pilot means by floaty on the vertical axis.
 *
 * Applied to the weight term in plant_step and to the two ground load terms
 * in sim.c, because a heavier craft presses harder on the floor and its
 * friction has to follow or a sinky quad would slide like a light one.
 *
 * A MODE, same rule as SIM_AIR and SIM_ARCADE: it survives sim_reset and
 * sim_init and the shell owns asserting it. Bit identical at 1.0, measured
 * against the recorded trace hash.
 */
extern double SIM_GRAVITY;

/* Motor spin direction, position and cant moved INTO PlantParams when the
 * second airframe landed: they are airframe data and a whoop's are its own.
 * The names below are the shorthand plant.c reads them through. */
#define PLANT_SPIN (PLANT.spin)
#define PLANT_POS_X (PLANT.pos_x)
#define PLANT_POS_Y (PLANT.pos_y)
#define PLANT_POS_Z (PLANT.pos_z)

void plant_reset(SimState *s);

/* sqrt for the debug exports, backed by libm/sim_math.h. */
double sim_sqrt_pub(double x);

/*
 * Advance motors, battery and rigid body by one 1 ms step given the four
 * commanded duties in 0..1. Deterministic: fixed operation order, no
 * branches on host properties.
 */
void plant_step(SimState *s, const double duty[SIM_MOTOR_COUNT]);

/*
 * The fixed wing plant, src/native/plant_wing.c: one plant for every table
 * entry of PLANT_KIND_WING, driven by the entry's FixedWingParams. The
 * derivations are docs/WING-STAGE1.md for the flying wing and
 * docs/SKYHUNTER-STAGE1.md for the Skyhunter. Coefficients are per radian
 * in the aero convention (x forward, y right, z down); the plant turns
 * them into the body frame. A term an airframe does not have is zero.
 */
#define FW_MIX_ELEVON 0 /* two elevons, delta_e plus and minus delta_a; no rudder */
#define FW_MIX_TAIL 1   /* ailerons, an elevator and a rudder, each its own surface */
#define FW_MIX_RUDDER 2 /* no ailerons: an elevator, and a rudder the roll stick drives too */

typedef struct FixedWingParams {
  int mix;             /* FW_MIX_ELEVON, FW_MIX_TAIL or FW_MIX_RUDDER */
  double span;         /* m */
  double area;         /* m^2 */
  double chord;        /* m */
  double cl_alpha;
  double cl_max;
  double alpha_zl;     /* zero lift angle of attack, rad, negative when the
                        * zero lift line sits below the body x axis. Zero on
                        * the wing, and subtracted rather than an offset
                        * added, because x - (+0) keeps the sign of a zero
                        * and x + 0 does not: the wing's trace depends on it. */
  double sin_zl;       /* sin and cos of alpha_zl, precomputed so the plant */
  double cos_zl;       /* needs no trigonometry for the post stall plate */
  double cd0;
  double k_induced;    /* 1/(pi e AR) */
  double cl_de;        /* lift per rad of delta_e, trailing edge up positive */
  double cy_beta;
  double cy_dr;
  double cl_beta;      /* roll */
  double cl_p;
  double cl_da;
  double cl_r_per_cl;  /* Clr as a multiple of the step's CL */
  double cl_dr;
  double cm_0;         /* pitch */
  double cm_alpha;
  double cm_q;
  double cm_de;        /* delta_e positive pitches the nose up */
  double cn_beta;      /* yaw */
  double cn_r;
  double cn_p_per_cl;  /* Cnp as a multiple of CL */
  double cn_da_per_cl; /* Cn delta_a as a multiple of CL: adverse aileron yaw */
  double cn_dr;        /* delta_r positive is trailing edge left, nose left */
  double stall_blend;  /* half width of the stall smoothstep, rad */
  /* Surfaces: travel at full stick, rad, and expo. surface_max clips each
   * elevon; for a tail it equals the aileron travel. */
  double throw_a;
  double throw_e;
  double throw_r;
  double surface_max;
  double expo;
  /* The motor. */
  double thrust_static; /* N */
  double pitch_speed;   /* m/s at full duty */
  double rpm_no_load;
  double torque_arm;    /* prop reaction, roll moment per newton of thrust, m */
  double thrust_z;      /* thrust line height above the CG, m: a line under
                         * the CG pitches the nose up with power. Zero where
                         * the thrust line runs through the CG. */
  double pfactor;       /* P factor: the yaw arm of the thrust is this times
                         * the body normal speed over the prop's rate, (-w)/omega,
                         * which is V sin(alpha)/omega with no trigonometry.
                         * Positive yaws the nose left at a positive alpha,
                         * which is a prop turning clockwise seen from behind.
                         * Zero leaves the yaw moment untouched. */
  double current_full;  /* A at static full thrust */
  double duty_min;
  /* Stabilised: a bank and a pitch held by a rate damped proportional loop. */
  double stab_bank_max;
  double stab_pitch_max;
  double stab_trim_pitch;
  double stab_deadband;
  double stab_roll_kp;
  double stab_roll_kd;
  double stab_pitch_kp;
  double stab_pitch_kd;
  /* Acro: sticks ask for a rate, a target attitude advances by it. */
  double acro_roll_rate;
  double acro_pitch_rate;
  double acro_expo;
  double acro_err_max;
  double acro_roll_kp;
  double acro_roll_kd;
  double acro_roll_ff;
  double acro_pitch_kp;
  double acro_pitch_kd;
  double acro_pitch_ff;
  double acro_roll_ki;
  double acro_pitch_ki;
  double acro_i_max;
  /* Turn coordination in Stabilised and Acro, yaw stick per rad/s of body
   * yaw rate away from the coordinated rate g sin(bank) cos(pitch)/V.
   * Zero where there is no rudder. */
  double yaw_coord_k;
  /* A folding prop: below this throttle the ESC brakes the motor, the prop
   * stops and the air folds its blades back along the fuselage, so there
   * is no thrust, no current and nothing turning. Above it the prop is
   * open, and an open prop turning slower than the air would drive it
   * brakes: its thrust carries on below zero instead of stopping there.
   * Zero is a fixed prop, whose thrust stops at zero as it always did. */
  double fold_duty;
  /* 1 where the airframe flies in the rising air of plant_wing.c's
   * thermals, 0 where the air is still. */
  int air_lift;
  /* A recovery parachute, docs/BRAMOR-STAGE1.md. Zero chute_cda is an
   * aircraft without one, which sim_wing_chute refuses, and then nothing
   * below is read: every step of an aircraft whose chute is stowed runs
   * exactly the arithmetic it ran before the chute existed. */
  double chute_cda;       /* canopy drag area fully open, C_D times area, m^2 */
  double chute_open_s;    /* seconds from the pull to a full canopy */
  double chute_attach[3]; /* where the risers meet the airframe, body frame, m */
  /* Past the stall: the CG's distance behind the wing's aerodynamic centre,
   * and the flat plate's centre of pressure's behind the CG, both per
   * chord. They take back the linear moment's lift the stalled wing does
   * not make and put the plate's where it acts. Zero leaves the moment
   * linear through the stall. */
  double stall_arm_ac;
  double stall_arm_cp;
  /*
   * FLAPS AND SLATS, docs/TIMBER-STAGE1.md. Zero flap_full is an aircraft
   * without flaps, which sim_wing_set_flaps refuses past notch 0, so its
   * flap angle stays exactly +0 and every term below adds a zero through
   * add_term: its arithmetic is what it was before flaps existed. The flap
   * angle is positive trailing edge down and moves toward the notch's at
   * flap_rate, the radio's slowed flap channel. Its lift is fitted as
   * cl_df d + cl_df2 d^2 through the two notches, its drag as cd_df2 d^2,
   * its CLmax increment as clmax_df d, and its pitching moment, the
   * section's own and the downwash it adds at the tail, per unit of the
   * lift it adds. de_df is the radio's flap to elevator mix, elevator
   * radians (trailing edge up positive) per radian of flap.
   */
  double flap_half;       /* rad at the middle notch */
  double flap_full;       /* rad at the last notch; 0 without flaps */
  double flap_rate;       /* rad/s the flaps move at */
  double cl_df;           /* lift per rad of flap */
  double cl_df2;          /* lift per rad^2 of flap */
  double clmax_df;        /* CLmax per rad of flap */
  double cd_df2;          /* drag per rad^2 of flap */
  double cm_dcl_f;        /* pitching moment per unit of flap lift, nose up + */
  double de_df;           /* the radio's mix: elevator rad per rad of flap */
  /* Fixed leading edge slats, fitted or not (sim_wing_set_slats): the
   * CLmax they add, which moves the stall to a higher alpha on the same
   * lift curve, and the drag they cost. Zero on an aircraft without. */
  double slat_dclmax;
  double slat_cd0;
} FixedWingParams;

extern const FixedWingParams FW_WING1000;
extern const FixedWingParams FW_SKY1800;
extern const FixedWingParams FW_CUB1400;
extern const FixedWingParams FW_RADIAN2000;
extern const FixedWingParams FW_BRAMOR2300;
extern const FixedWingParams FW_SLOWSTICK1180;
extern const FixedWingParams FW_TIMBER1500;
extern const FixedWingParams FW_TIMBER1500F;
extern const FixedWingParams FW_CUB1400F;

void plant_wing_step(SimState *s, const double rc[4]);
void plant_wing_reset(void);
void plant_wing_launch(SimState *s, double speed);
void plant_wing_surfaces(double out[2]);
void plant_plane_surfaces(double out[4]);
void plant_wing_debug(double out[20]);
void plant_wing_set_stab(int mode);
int plant_wing_stab(void);
/* Weight on wheels, set by sim.c after each step's contact: 1 while any
 * wheel carried load. The stabiliser reads it; nothing else does. */
void plant_wing_set_on_wheels(int on);
/* The wheel brake, sim_set_brake: 0 off to 1 full, an input cleared by a
 * reset. */
void plant_wing_set_brake(double b);
double plant_wing_brake(void);
/* A wheel's resistance along its heading on ground of material `surf`
 * (SIM_SURF_*), with the brake at `brake`, as a fraction of its load. */
double plant_wheel_roll(const WheelParams *wp, int surf, double brake);
/* The rising air at a world position, m/s up: the thermals every airframe
 * with air_lift flies in. */
double plant_air_lift(const double pos[3]);
/* Horizontal wind, sim_set_wind: the mean, m/s world frame, and the gusts'
 * RMS per axis. SIM_WIND_ON is 0 while all three are zero, and then no
 * step reads any of it, which is what keeps every trace without wind bit
 * identical. plant_wind is the air's velocity at step `step`, world x y
 * (z is always 0), the same everywhere. */
extern int SIM_WIND_ON;
extern double SIM_WIND[2];
extern double SIM_GUST;
void plant_wind(long long step, double out[3]);
/* The parachute: 1 pulls it on an airframe that has one and returns 0,
 * anything else returns -1; 0 stows it again, which a reset also does.
 * plant_wing_chute_open is how far the canopy is open, 0 stowed to 1. */
int plant_wing_chute(int deploy);
double plant_wing_chute_open(void);
/* Flaps: 0 up, 1 half, 2 full; returns -1 for a notch past 0 on an
 * aircraft without flaps. A mode, kept across resets, which put the flaps
 * where the notch has them; plant_wing_flaps is their angle now, rad,
 * trailing edge down. plant_wing_flaps_stow raises them at once and
 * selects notch 0, for an airframe change. */
int plant_wing_set_flaps(int notch);
double plant_wing_flaps(void);
void plant_wing_flaps_stow(void);
/* The flaps where the notch has them, at once, as a reset puts them. */
void plant_wing_flaps_settle(void);
/* Slats: 1 fitted, the default, 0 removed. A mode; no effect on an
 * aircraft without slats. */
void plant_wing_set_slats(int fitted);

/*
 * WATER, src/native/water.c: the bodies of water a host declares, still
 * water at a height over a polygon in the plant's world frame, and the
 * waves on each, a sum of linear deep water components raised by a wind
 * over a fetch and an optional swell. docs/FLOATS-STAGE1.md.
 */
#define WATER_BODIES_MAX 4
#define WATER_VERTS_MAX 256
#define WATER_SEA 6
#define WATER_COMP_MAX (WATER_SEA + 1)

typedef struct {
  double a;      /* amplitude, m */
  double kx, ky; /* wavenumber along world x and y, rad/m */
  double om;     /* angular frequency, rad/s */
  double ph;     /* phase at the body's origin at t = 0, rad */
} WaterComp;

typedef struct {
  double z0;                /* still water, world z, m */
  double ox, oy;            /* where the phases are measured from */
  int nvert;                /* polygon, world x y; under 3 is everywhere */
  double vx[WATER_VERTS_MAX];
  double vy[WATER_VERTS_MAX];
  double xmin, xmax, ymin, ymax;
  double wind, wdx, wdy, fetch; /* m/s, the unit direction it blows to, m */
  double swell_h, swell_t, sdx, sdy; /* crest to trough m, s, the unit direction */
  double hs, tp;            /* the wind sea's significant height and peak period */
  int ncomp;
  WaterComp comp[WATER_COMP_MAX];
} WaterBody;

void water_clear(void);
int water_count(void);
/* Each returns the body's index, or 0, or -1 for a bad index or a full table. */
int water_add(double z0, double ox, double oy);
int water_vertex(int i, double x, double y);
int water_wind(int i, double speed, double dx, double dy, double fetch);
int water_swell(int i, double height, double period, double dx, double dy);
int water_body_at(double x, double y);
/* out[6]: surface z, dz/dx, dz/dy, and the water's velocity x y z. */
void water_sample(int i, double x, double y, double t, double out[6]);
const WaterBody *water_body(int i);

/*
 * CRASH PHYSICS, src/native/crash.c and docs/CRASH-STAGE1.md: the parts, the
 * damage they take and what it does to the flight, the free bodies that
 * break off, the surfaces, the obstacles and the trees.
 *
 * CRASH is what the plants read, and CRASH.active is the only thing they
 * test on the hot path: it is 0 on an intact aircraft, with the damage mode
 * off and with it on, so every branch below it is skipped and every
 * expression the plants computed before this existed is computed exactly as
 * it was. That is the whole of the bit identity argument on the flight side;
 * the contact side's is at crash_contact_pre. crash.c owns the struct and
 * writes it only when a limit is crossed.
 */
typedef struct {
  int active;              /* any flight effect in force */
  int hull_parts;          /* a part has left: contact samples the parts' hulls */
  /* Per motor, Betaflight order on a quad, motor 0 on a plane. */
  double kt[SIM_MOTOR_COUNT];        /* thrust coefficient scale */
  double kq[SIM_MOTOR_COUNT];        /* prop torque coefficient scale */
  double jr[SIM_MOTOR_COUNT];        /* rotor inertia scale */
  int motor_dead[SIM_MOTOR_COUNT];   /* no drive: motor, arm or power gone */
  double imbalance[SIM_MOTOR_COUNT]; /* gyro line amplitude multiple, 1 sound */
  int bent;                          /* an arm is bent: turn the axes by bend[] */
  double bend[SIM_MOTOR_COUNT][3];   /* each thrust axis's turn, a rotation
                                      * vector, body frame, rad */
  int no_power;                      /* the pack has left */
  /* The fixed wing. */
  double lift_keep;        /* the wing area left, fraction */
  double lift_y;           /* the lost area's centroid, body y, m: its lift
                            * now missing there is a roll moment */
  int surf_lost[4];        /* left aileron or elevon, right, elevator, rudder */
  double rudder_keep;      /* fraction of the rudders left */
  double hstab_keep;       /* the horizontal tail left, fraction */
  double fin_keep;         /* the fins left, fraction */
  double cg_shift[3];      /* where the CG moved, body frame, m, from the
                            * table's origin; the wing's aero reference stays
                            * where it was, so its forces get this arm */
  int wheel_lost[SIM_WHEELS_MAX];
  int float_lost[2];       /* left, right */
} CrashEffects;
extern CrashEffects CRASH;
/* The damage mode, sim_set_damage. A mode: kept across sim_reset. */
extern int SIM_DAMAGE;

/* The contact solver's hooks, sim.c. A contact at world offset r from the
 * CG against unit normal n (out of the surface), closing speed vin, inverse
 * effective mass kn, restitution e_used about to be applied: pre may lower
 * e_used, when a foam part crushes and gives nothing back. post records the
 * impulse (jn along n, jt the friction vector) for the step's judgement. */
void crash_contact_pre(const SimState *s, const double r[3], const double n[3],
                       double vin, double kn, double *e_used, double *jn_cap);
/* How far the next contact's point is past the surface, m, the ground
 * plane's; called before crash_contact_pre. */
void crash_contact_depth(double pen);
void crash_contact_post(const SimState *s, const double r[3], const double n[3],
                        double vin, double kn, double jn, const double jt[3]);
/* A force contact, one whose force is known rather than an impulse: a
 * wheel's strut, a float, the water or a crown on a part. World frame. */
void crash_force_note(const SimState *s, const double r[3], const double F[3], int part);
/* The surface the next contacts are against, SIM_SURF_*, and whether a
 * spinning prop in that contact would chip. */
void crash_set_contact_surface(int mat);
int crash_ground_material(void);
/* The contacts that follow are the ground plane's, its material's. */
void crash_set_ground_contact(void);
/* The surface a contact with no material named meets: a hard generic face. */
int crash_obstacle_surface(void);
/* Start of a contact batch (a step, or one sim_contact_at): remembers the
 * craft's motion before the impulses. End of it: judges the batch's loads,
 * breaks and damages, and rebuilds CRASH. */
void crash_batch_begin(const SimState *s, int from_step);
/* A foam part is crushing this batch, or a part is being driven into the
 * ground's spring, and the last contact's impulse was capped by it: the
 * solver's position corrections and resting stops stand aside. */
int crash_crushing(void);
int crash_last_capped(void);
void crash_batch_end(SimState *s);
/* Every step, after the contacts: the free bodies, the water and the crowns
 * on the craft's parts. */
void crash_step(SimState *s, int ground_on, const double gn[3], double gd);
/* Dynamic state cleared: every part attached and whole, no free bodies, no
 * events, CRASH inactive and the plant table in force again. */
void crash_reset(void);
/* The part carrying a PlantParams wheel, or a float (0 left, 1 right). */
int crash_wheel_part(int w);
int crash_float_part(int f);
/* A non default surface's own mu and e, written over the caller's. */
void crash_surface_mu_e(int mat, double *mu, double *e);
/* The readback and set up that need the craft's state, for sim.c's
 * exports. */
int crash_parts_state(const SimState *s, double *out);
int crash_part_break(SimState *s, int part);
int crash_part_set_damage(SimState *s, int part, double dmg);
/* The contact samplers once a part has left, the attached parts' hull
 * points, body frame about the live CG, and the part each belongs to. */
int crash_samplers(const double **pts, const int **part);
/* The next contact is the solver's sampler k, -1 for none: it belongs to
 * that sampler's part. */
void crash_hint_sampler(int k);
/* The part a body frame point belongs to, for a contact there: the
 * attached part with the hull point nearest it. */
int crash_part_at(const double b[3]);

/* Bridge: Betaflight control loop and config shim. */

int bridge_parse_config(const unsigned char *diff_utf8, int len);

/* Reset controller state (PID integrators, filters) after sim_reset. */
void bridge_reset(void);

/*
 * One 1 kHz controller iteration: body rates and normalised stick
 * channels in, four motor duties in 0..1 out.
 *
 * rx_new is 1 on the steps where a fresh input sample arrived, which the
 * bridge treats as an RC frame exactly as a flight controller treats a
 * packet from the receiver. Betaflight recomputes setpoints and
 * feedforward only on those steps and interpolates in between, so the
 * input sample rate is a real part of the feel, not a detail.
 */
void bridge_run(const SimState *s, const double rc[4], int rx_new,
                double duty[SIM_MOTOR_COUNT]);

/*
 * Raise or lower Betaflight ANGLE_MODE. Stored across reset so a shell
 * that asked for angle before sim_reset still has it after. The plant
 * does not read this.
 */
void bridge_set_angle_mode(int on);

/*
 * Betaflight BOXLAUNCHCONTROL, captured the way arming captures it.
 * Off is the default. The harness never calls this, so the acro
 * trajectory does not enter applyLaunchControl. The plant does not
 * read this.
 */
void bridge_set_launch_control(int on);

/*
 * 0 off, 1 holding, 2 holding with throttle near the trigger (OSD
 * blink), 3 launched this arm. Matches fc/core.c's state plus the
 * 4.2 OSD near-trigger warning.
 */
int bridge_launch_control_state(void);

/*
 * Betaflight crashflip, the mixer path in mixer.c. Off is the default.
 * The harness never calls this. isFlipOverAfterCrashActive lives in
 * bf_glue.c, the same pattern as isLaunchControlActive.
 */
void bridge_set_crashflip(int on);
int bridge_crashflip_active(void);

/*
 * Betaflight glue, implemented in bf/bf_glue.c which is compiled against
 * the vendored Betaflight headers. bridge.c stays free of Betaflight
 * includes so the tokenizer compiles standalone.
 *
 * bf_config_begin resets the Betaflight parameter groups to their real
 * defaults. bf_config_apply_setting applies one "set key = value" line;
 * unknown keys return SIM_OK and are ignored. bf_config_finish runs the
 * Betaflight init chain (pid, rc processing, mixer endpoints).
 */
void bf_config_begin(void);
int bf_config_apply_setting(const char *key, const char *value, double num,
                            int have_num);
/* One non-"set" CLI line, tokenised to its first two words. This is how
 * `simplified_tuning apply` reaches Betaflight's own slider tuning. */
int bf_config_apply_command(const char *word0, const char *word1);
int bf_config_finish(void);

#endif /* SIM_INTERNAL_H */
