/*
 * sim_abi.h: the ABI between the compiled physics module and every host,
 * meaning the verification harness (Node and browser) and later the render
 * shell. This header is the contract. The harness in tests/ is written
 * against it and tests/ is read-only to the simulator implementer, so any
 * change here is an ABI change and must be argued in PROGRESS.md first.
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

#ifndef SIM_ABI_H
#define SIM_ABI_H

/*
 * Conventions, fixed by CLAUDE.md and this header:
 *
 * World frame: right-handed, z up, metres, SI throughout.
 * Body frame: right-handed, x forward, y left, z up.
 *   Positive p (about body x) rolls the quad to the right.
 *   Positive q (about body y) pitches the nose down.
 *   Positive r (about body z) yaws the nose to the left, counter-clockwise
 *   seen from above.
 *
 * Stick channels, as stored in .rec files and passed to sim_input:
 *   roll     -1..+1, +1 commands a roll to the right
 *   pitch    -1..+1, +1 commands nose up
 *   yaw      -1..+1, +1 commands nose right
 *   throttle  0..+1
 * Mapping these RC-convention channels onto Betaflight's internal signs is
 * the bridge's job, not the host's.
 *
 * Time: the module steps at a fixed 1000 Hz. One step is exactly 1 ms of
 * simulated time. sim_step(n) advances n steps. How the host batches calls
 * to sim_step must not affect the trajectory. Input samples carry their own
 * timestamps and the module consumes them by that timestamp, never by
 * arrival order relative to real time.
 */

#define SIM_ABI_VERSION 1

/* Physics step rate, Hz. Fixed. */
#define SIM_STEP_HZ 1000

/* Return codes. Every entry point returning int uses these. */
#define SIM_OK 0
#define SIM_ERR_NOT_IMPLEMENTED -1
#define SIM_ERR_BAD_ARG -2
#define SIM_ERR_BAD_STATE -3
#define SIM_ERR_CONFIG_PARSE -4

/*
 * State block layout, doubles, written by sim_state:
 *   [0]      t, simulated time, seconds
 *   [1..3]   position x y z, metres, world frame
 *   [4..6]   velocity x y z, m/s, world frame
 *   [7..10]  attitude quaternion w x y z, body to world
 *   [11..13] angular rate p q r, rad/s, body frame
 *   [14..17] motor RPM, motors 0..3 in Betaflight order
 *            (0 rear right, 1 front right, 2 rear left, 3 front left)
 *   [18]     pack voltage under load, volts
 *   [19]     pack current draw, amps
 */
#define SIM_STATE_DOUBLES 20

/*
 * Entry points. All are exported from the WASM module under these exact
 * names. The stub implementation returns SIM_ERR_NOT_IMPLEMENTED from every
 * entry point except sim_abi_version, which must always report the version
 * so a host can tell "module loaded, not implemented yet" from "wrong
 * module".
 */

/* Returns SIM_ABI_VERSION compiled into the module. */
int sim_abi_version(void);

/*
 * Initialise from a Betaflight CLI diff, UTF-8 text of the given length.
 * Full reset: config parsed and applied, dynamic state zeroed as in
 * sim_reset. Returns SIM_OK or an error code.
 */
int sim_init(const unsigned char *diff_utf8, int len);

/*
 * Reset dynamic state, keeping the parsed config. After reset: t = 0, quad
 * level and at rest at the world origin, free in the air (no ground contact
 * in the reset pose), motors stopped, armed, airmode on, battery at the
 * currently configured open-circuit cell voltage.
 */
int sim_reset(void);

/* Set open-circuit per-cell voltage, volts. Takes effect immediately. */
int sim_set_cell_voltage(double volts);

/*
 * Deliver one input sample. t_seconds is the sample's own timestamp on the
 * simulated clock. Samples arrive in non-decreasing timestamp order, always
 * before the 1 ms step in which their timestamp falls is executed. The
 * stream restarts at t = 0 after sim_init or sim_reset.
 */
int sim_input(double t_seconds, double roll, double pitch, double yaw,
              double throttle);

/* Advance n fixed 1 ms steps. n >= 0. */
int sim_step(int n);

/*
 * Bench override for check 8, motor-step-response. While a motor is
 * overridden the flight controller output for that motor is replaced by
 * the given duty, 0..1. motor is 0..3, or -1 for all motors. A negative
 * duty clears the override for the addressed motor or motors.
 */
int sim_motor_override(int motor, double duty);

/*
 * The ground holds the craft: zero the linear velocity and the body rates,
 * keeping position, attitude, motor speeds and battery state. The shell
 * calls this once at the moment a touchdown is judged a landing, because a
 * craft resting on the ground is held by a normal force this free-air model
 * does not have. Without it the frozen landed state kept its touchdown
 * descent rate, every freeze/unfreeze cycle of a slow takeoff resumed and
 * grew it, and at 60 fps a gentle throttle ramp accumulated 2.1 m/s of
 * phantom descent and was judged a crash the pilot never flew. Additive ABI
 * change, version unchanged: no existing entry point moved or changed
 * meaning. A replay that reproduces a flown session must issue the same
 * call at the same step, which the shell guarantees by deriving it from the
 * deterministic landing judgement.
 */
int sim_rest(void);

/*
 * Bounce off a world-frame contact. n is a unit normal pointing out of the
 * obstacle (from the solid toward the craft). Incoming speed along n is
 * reflected with the given restitution, the tangent is scaled by
 * tangent_keep, body rates are scaled by rate_keep, and the craft is placed
 * at world position p (metres, z up). The shell supplies p at the first
 * contact plus a small outward separation, already converted into the plant
 * frame, so a tunneled frame is rewound to the entry face rather than
 * pushed further through.
 *
 * This is the obstacle counterpart of sim_rest: the plant has no scene
 * geometry, so the shell judges the contact and writes the impulse. Additive
 * ABI change, version unchanged: no existing entry point moved or changed
 * meaning. A replay that never calls this is bit-identical to one from
 * before it existed. The verification harness never calls it.
 */
int sim_deflect(double nx, double ny, double nz,
                double restitution, double tangent_keep, double rate_keep,
                double px, double py, double pz);

/*
 * Rigid-body contact against a world-frame surface. n is a unit normal
 * pointing out of the solid. The impulse is applied at the airframe hull
 * support in the -n direction, so an offset hit produces spin: a wall tap
 * yaws, a side arrival rolls. Coulomb friction with coefficient mu kills
 * or limits the tangent speed at that point, which is what a ground slide
 * and a tumbling crash both are. vs is the surface velocity (zero for a
 * static wall, the train's velocity for a moving car). The craft is placed
 * at p, already converted into the plant frame, so a tunneled frame is
 * rewound to the entry face.
 *
 * Restitution falls with closing speed inside the solver, so a 20 m/s
 * arrival dumps energy instead of bouncing like a ball, and a slow skip
 * still skips. Additive ABI, version unchanged. The harness never calls
 * this: a replay that never touches a surface is bit-identical to one
 * from before it existed.
 */
int sim_contact(double nx, double ny, double nz,
                double restitution, double mu,
                double px, double py, double pz,
                double vsx, double vsy, double vsz);

/*
 * Rigid-body contact with the contact point supplied by the caller.
 *
 * sim_contact takes its impulse arm from the hull's own support in the
 * -n direction, which is always an extreme corner, so a belly slapped
 * flat on a wall solved as a corner strike and produced the largest
 * moment the geometry allows. The shell sweeps the four prop discs and
 * knows which of them are actually in the patch, so it passes the arm
 * in: (rx, ry, rz) is the vector from the CG to the contact point,
 * plant frame, world axes, clamped inside the airframe. One disc in
 * gives a full moment, four gives almost none, which is the difference
 * between an arm catching a wall and a belly meeting it.
 *
 * Everything else matches sim_contact. Additive ABI, version unchanged.
 * The harness never calls this.
 */
int sim_contact_at(double nx, double ny, double nz,
                   double restitution, double mu,
                   double px, double py, double pz,
                   double vsx, double vsy, double vsz,
                   double rx, double ry, double rz);

/*
 * Blade strike: every rotor loses sev of its speed, sev in 0 to 1.
 *
 * A spinning 5 inch does not carry its rotor energy through a wall.
 * The mixer spins them back up at the motor's own time constant, which
 * is the part the pilot feels. No damage model and no desync. Additive
 * ABI, version unchanged. The harness never calls this.
 */
int sim_prop_strike(double sev);

/*
 * Persistent ground plane, applied after every 1 ms plant_step, the same
 * way the launch stand is. n is a unit normal pointing out of the ground,
 * (px,py,pz) is a point on the plane, both plant frame. mu and restitution
 * are Coulomb friction and the low-speed coefficient of restitution.
 * Off (0) is the default, and the path every harness replay takes, so
 * free-air checks cannot see a floor. Additive ABI, version unchanged.
 */
int sim_set_ground(int on,
                   double nx, double ny, double nz,
                   double px, double py, double pz,
                   double mu, double restitution);

/*
 * How many hull points took a ground contact on the last step. Belly
 * landings count penetrating corners. A roll or a turtle is a single
 * support, so this is 0 or 1. The shell uses it to know whether the
 * craft is in contact (turtle, perch) without re-deriving the hull.
 * Zero when the ground plane is off.
 */
int sim_ground_contacts(void);

/*
 * Enable or disable Betaflight crashflip (turtle mode). Off (0) is the
 * default and the path every harness replay takes. On (non-zero) makes
 * mixTable take applyFlipOverAfterCrashModeToMotors, which is already
 * compiled in from mixer.c: pitch and roll sticks spin the high motors
 * to flip the craft over. I-term is dumped on both edges so a wound PID
 * cannot yank the craft when turtle latches or drops. The plant does not
 * read this, and DShot reverse is not modelled (the same stub as other
 * DShot commands). Additive ABI, version unchanged.
 */
int sim_set_crashflip(int on);

/* 1 when crashflip is latched, 0 otherwise. */
int sim_crashflip_active(void);

/*
 * Write plant pose. Quaternion is normalised. Velocity and rates are
 * untouched; call sim_rest after if the host wants a still pose. Additive
 * ABI, version unchanged. The harness never calls this. Used by the
 * contact self-test to seat an inverted hull for turtle, and available
 * to the shell if a future path needs to place the craft without the
 * launch-stand constraint.
 */
int sim_set_pose(double px, double py, double pz,
                 double qw, double qx, double qy, double qz);

/*
 * Enable or disable Betaflight ANGLE_MODE. Off (0) is acro, the default,
 * and the path every harness replay takes. On (non-zero) feeds the plant
 * attitude into Betaflight's compiled pidLevel and sets ANGLE_MODE, so
 * stick is a tilt target and centred sticks recover to level. Plant,
 * mixer and the acro PID are not reimplemented here: this is the same
 * flag a radio aux switch would raise. Additive ABI change, version
 * unchanged: no existing entry point moved or changed meaning. A replay
 * that never calls this is bit-identical to one from before it existed.
 */
int sim_set_angle_mode(int on);

/*
 * Enable or disable Betaflight launch control, the race-start hold.
 * Off (0) is the default, and the path every harness replay takes.
 * On (non-zero) is BOXLAUNCHCONTROL at arm: pid.c's applyLaunchControl
 * holds attitude at idle throttle until the stick crosses
 * launch_trigger_throttle_percent, then the mixer releases throttle
 * and the feature latches off. Additive ABI change, version unchanged:
 * no existing entry point moved or changed meaning. A replay that never
 * calls this is bit-identical to one from before it existed.
 */
int sim_set_launch_control(int on);

/*
 * Launch control state for the OSD. 0 off, 1 holding, 2 holding and
 * throttle within 10 percent of the trigger, 3 launched this arm.
 * Additive, same rule as sim_set_launch_control.
 */
int sim_launch_control_state(void);

/*
 * Mechanical launch stand. Off (0) is the default. On (non-zero) holds
 * the craft on a hinge at the rear underside: linear velocity is killed,
 * roll and yaw rates are killed, attitude is projected onto pitch about
 * world y (nose down), and the rear contact stays put so pitching does
 * not walk the quad off the block. qw..qz is the pitch-only pose to
 * seed when raising the stand, matching a ramp that the shell drew as
 * a render overlay while landed. Applied inside sim_step, so a batched
 * frame cannot accumulate gyroscopic roll between pins. Additive ABI,
 * version unchanged. The harness never calls this.
 */
int sim_set_launch_stand(int on, double px, double py, double pz,
                         double qw, double qx, double qy, double qz);

/*
 * Flight style. 0 is expert, the default and the full model, the path
 * every harness replay takes. Non-zero is arcade: the imperfection terms
 * are switched off so the craft flies as the symmetric ideal it is drawn
 * as. Arcade removes the propwash turbulence application, the per rotor
 * ring state asymmetry, the motor cant tables (thrust axes become exactly
 * vertical, so the build tolerance yaw coupling and its hover trim go),
 * and the gyro vibration and noise floor. The smooth aerodynamics stay:
 * advance ratio, ring state thrust loss, rotor drag, translational lift,
 * body side lift and the torque inflow coupling are physics, not
 * imperfections. Survives sim_reset and sim_init, exactly as the angle
 * mode flag does, so a shell that set it before a tune swap still has it
 * after. Additive ABI change, version unchanged: a replay that never
 * calls this is bit-identical to one from before it existed, which is
 * what keeps every recorded check honest.
 */
int sim_set_flight_style(int arcade);

/*
 * Choose the airframe: 0 is the five inch this project was built around and
 * is the default, 1 is a 65 mm 1S brushless whoop, 2 the 1000 mm flying
 * wing, 3 the Skyhunter 1800, a twin boom pusher with ailerons, an
 * elevator and a rudder, 4 the Piper J-3 Cub 1400, a tractor
 * taildragger with the same surfaces that stands on its own wheels, 5
 * the GWS Slow Stick, a three channel slow flyer on wheels with no
 * ailerons, whose roll stick drives its rudder too, 6 the E-flite Radian
 * Pro, a 2 m powered glider with the Cub's surfaces, a folding prop, and
 * the thermals of sim_air_lift to climb in, 8 the C-Astral Bramor
 * C4EYE, a 2.3 m blended wing body flying wing that is catapult launched
 * and recovered under a parachute, 7 the E-flite Turbo Timber
 * Evolution, a 1.5 m STOL taildragger with flaps and slats that stands on
 * its own wheels, and 9 and 10 the Timber and the Cub on floats
 * (docs/FLOATS-STAGE1.md), which float on the water bodies below and slide
 * on their keels on land. Returns SIM_ERR_BAD_ARG for anything else.
 * 2 to 10 are fixed wings: no Betaflight, the sticks go to the plant, and
 * the sim_wing_* and sim_plane_surfaces entry points below apply.
 *
 * Additive ABI change, version unchanged: no existing entry point moved or
 * changed meaning, and a replay that never calls this is bit identical to
 * one from before it existed. That last clause is MEASURED rather than
 * asserted, because selecting a plant at runtime costs the compiler its
 * constant folding of the parameter block; the build's -fno-fast-math and
 * -ffp-contract=off make a folded expression and a computed one the same
 * IEEE double, and the five inch's trace hash is checked unchanged across
 * the change. See PROGRESS.md.
 *
 * A MODE, not state: it survives sim_reset and sim_init, exactly as the
 * flight style does. Changing it swaps the plant's mass, inertia, motors,
 * rotors, pack, drag, duct terms, collision hull and camera position in one
 * step, so a host should do it between runs and then sim_reset.
 */
#define SIM_AIRFRAME_5IN_ID 0
#define SIM_AIRFRAME_WHOOP65_ID 1
#define SIM_AIRFRAME_WING1000_ID 2
#define SIM_AIRFRAME_SKY1800_ID 3
#define SIM_AIRFRAME_CUB1400_ID 4
#define SIM_AIRFRAME_SLOWSTICK1180_ID 5
#define SIM_AIRFRAME_RADIAN2000_ID 6
#define SIM_AIRFRAME_TIMBER1500_ID 7
#define SIM_AIRFRAME_BRAMOR2300_ID 8
#define SIM_AIRFRAME_TIMBER1500F_ID 9
#define SIM_AIRFRAME_CUB1400F_ID 10
int sim_set_airframe(int id);

/* Which airframe is in force. */
int sim_airframe(void);

/*
 * Air: a scale on everything the air does to slow the craft down. 1.0 is the
 * default and the machine every threshold in tests/ and every band in
 * gates.config.json was measured against, and it is the path every harness
 * replay takes. The accepted range is 0.5 to 2.0; anything outside it returns
 * SIM_ERR_BAD_ARG rather than being clamped, because a host asking for air 5
 * has a bug and a silent clamp hides it.
 *
 * This is the pilot's answer to "floaty", which is the word the board keeps
 * sending back. It scales the per axis body drag areas, the rotor H force and
 * the ducted descent brake, and nothing else: hover throttle, punch, climb,
 * rate response and the whole electrical model are untouched, so what moves
 * is how far the craft carries with the sticks centred and how fast it will
 * go flat out. What each term is and why the others are left alone is in
 * src/native/sim_internal.h at SIM_AIR.
 *
 * A MODE, not state: it survives sim_reset and sim_init exactly as the flight
 * style and the airframe do, so a shell that set it before a tune swap still
 * has it after. Additive ABI change, version unchanged: no existing entry
 * point moved or changed meaning, and a replay that never calls this is bit
 * identical to one from before it existed. That is MEASURED against the
 * recorded trace hash rather than asserted, because a runtime multiply costs
 * the compiler its constant folding, which is the same argument
 * sim_set_airframe carries. See PROGRESS.md.
 */
int sim_set_air(double scale);

/* The air scale in force. */
double sim_air(void);

/*
 * Gravity: a scale on the weight the craft carries. 1.0 is 9.80665 and the
 * machine every threshold in tests/ and every band in gates.config.json was
 * measured against, and it is the path every harness replay takes. The
 * accepted range is 0.5 to 2.5; outside it returns SIM_ERR_BAD_ARG rather
 * than being clamped, same argument as sim_set_air.
 *
 * THIS IS THE AXIS A PILOT MEANS BY FLOATY, and sim_set_air above is the
 * other one. Air is horizontal: how far the craft carries with the sticks
 * centred. Gravity is vertical: how fast it comes down and how little it
 * hangs. Asked to fly the air slider across its whole band, the pilot who
 * reported the complaint said the difference was hardly discernible, and
 * named what they wanted instead: floaty to sinky. Measured over each band,
 * on the vertical axis, air moved hover throttle not at all, the balloon
 * after a short punch by nine percent, and the time to fall ten metres the
 * WRONG WAY, because more drag lowers the terminal. Gravity moves hover from
 * 21.7 to 37.2 percent of stick, the balloon from 6.28 to 1.26 m and the fall
 * from 1.88 to 1.13 s.
 *
 * It scales the weight term in plant_step and the two ground load terms in
 * sim.c, because a heavier craft presses harder on the floor. Inertia,
 * drag, the motors and the pack are untouched, so the craft rotates
 * identically and every rate figure holds.
 *
 * A MODE, not state: it survives sim_reset and sim_init exactly as the air
 * scale, the flight style and the airframe do. Additive ABI change, version
 * unchanged, and a replay that never calls this is bit identical to one from
 * before it existed. MEASURED against the recorded trace hash, not asserted.
 */
int sim_set_gravity(double scale);

/* The gravity scale in force. */
double sim_gravity(void);

/*
 * The fixed wings, airframes 2 to 10. Additive, version unchanged; each
 * returns SIM_ERR_BAD_ARG for a null pointer, and the first two
 * SIM_ERR_BAD_STATE before sim_init.
 *
 * sim_wing_launch(speed): a hand throw, speed m/s along the body's forward
 * axis, 0 to 60. Refused on a quad.
 * sim_wing_set_stab(mode), sim_wing_stab(): the stabiliser, 0 Manual (the
 * sticks are the surfaces), 1 Stabilised (roll and pitch stick ask for a
 * bank and a pitch, centred flies level), 2 Acro (sticks ask for a roll
 * and pitch rate, centred holds the attitude). With a rudder, the yaw
 * stick is the rudder in every mode, and in 1 and 2 a turn coordinator
 * adds the rudder that keeps a banked turn from slipping. A mode, kept
 * across resets.
 * sim_wing_surfaces(out[2]): left and right wing trailing edge surface,
 * radians, positive trailing edge up: the elevons, or the ailerons.
 * sim_plane_surfaces(out[4]): left aileron, right aileron, elevator,
 * rudder, radians. Aileron and elevator positive trailing edge up; rudder
 * positive trailing edge to the LEFT, which yaws the nose left, so full
 * right yaw stick reads negative. On the flying wing out[2] and out[3]
 * are zero; on the Slow Stick, which has no ailerons, out[0] and out[1]
 * are zero and the roll stick moves the rudder with the yaw stick.
 * sim_wing_debug(out[20]): what the last step saw, for the gates: alpha
 * (of the zero lift line), beta, qbar, CL, CD, l m n (aero convention),
 * thrust, force body x y z, moment body x y z, u v w, delta_e, delta_a.
 */
int sim_wing_launch(double speed);
int sim_wing_set_stab(int mode);
int sim_wing_stab(void);
int sim_wing_surfaces(double *out);
int sim_plane_surfaces(double *out);
int sim_wing_debug(double *out);

/*
 * sim_wheel_loads(out[4]): the normal load on each ground contact point an
 * airframe declares, newtons, in its table's order; for the Cub, the
 * Slow Stick and the Timber, left main, right main, tailwheel, and the prop's lowest
 * tip, which reads
 * nonzero only in a prop strike. Zero for a point off the ground and for
 * every airframe without gear. The gates read liftoff and touchdown from
 * it, and a renderer can compress a strut by load / stiffness less its
 * static load / stiffness, since the drawn gear is the gear at rest.
 * Additive, version unchanged; SIM_ERR_BAD_ARG for a null pointer.
 */
int sim_wheel_loads(double *out);

/*
 * sim_air_lift(x, y, z): the air's vertical speed at a world position,
 * m/s, positive up: three thermals over the airfield, still air elsewhere,
 * the same answer whichever airframe is selected. Only an airframe that
 * flies in rising air feels it (the Radian); every other one flies in
 * still air and is unchanged. Additive, version unchanged.
 */
double sim_air_lift(double x, double y, double z);

/*
 * sim_wing_chute(deploy): the recovery parachute of an aircraft that has
 * one, the Bramor. 1 pulls it: the motor stops, the surfaces centre and a
 * canopy opens over about a second, hanging from the risers' attachment
 * point, and the aircraft comes down under it. 0 stows it again, which
 * sim_reset and sim_set_airframe also do. SIM_ERR_BAD_ARG for 1 on an
 * aircraft without a chute and for anything but 0 or 1; SIM_ERR_BAD_STATE
 * before sim_init.
 * sim_wing_chute_open(): how far the canopy is open, 0 stowed to 1 full.
 * Additive, version unchanged: with the chute stowed no step reads any of
 * it, so every trace from before it existed is bit identical.
 */
int sim_wing_chute(int deploy);
double sim_wing_chute_open(void);

/*
 * sim_wing_set_flaps(notch): the flaps of an aircraft that has them, the
 * Timber: 0 up, 1 half, 2 full, the radio's three position switch. The
 * flaps travel to the notch's angle at the aircraft's own rate, adding
 * lift, drag and a pitching moment, raising the CLmax, and, through the
 * radio's mix, a little down elevator. A mode, kept across sim_reset,
 * which puts the flaps where the notch has them; sim_set_airframe raises
 * them. SIM_ERR_BAD_ARG for a notch past 0 on an aircraft without flaps
 * and for anything outside 0 to 2; SIM_ERR_BAD_STATE before sim_init.
 * sim_wing_flaps(): the flaps' angle now, radians, trailing edge down.
 * sim_wing_flaps_settle(): the flaps where the notch has them at once, as
 * sim_reset puts them, for a host that holds a parked aircraft by not
 * stepping it, during which the servos would have finished moving;
 * SIM_ERR_BAD_STATE before sim_init.
 * sim_wing_set_slats(fitted): the fixed leading edge slats, 1 on, the
 * default, 0 off; they raise the CLmax and cost a little drag. A mode; no
 * effect on an aircraft without them. SIM_ERR_BAD_ARG for anything but 0
 * or 1.
 * Additive, version unchanged: an aircraft without flaps or slats adds
 * exact zeros, so every trace from before they existed is bit identical.
 */
int sim_wing_set_flaps(int notch);
double sim_wing_flaps(void);
int sim_wing_flaps_settle(void);
int sim_wing_set_slats(int fitted);

/*
 * WATER, src/native/water.c and docs/FLOATS-STAGE1.md. A host declares the
 * bodies of water in its world, in the plant's frame like the ground
 * plane, and the waves on each; an aircraft on floats floats on them and
 * the renderer draws the same surface. Nothing is declared by default, and
 * with nothing declared nothing reads any of it. Kept across sim_reset and
 * sim_init; sim_water_clear removes every body. Additive, version
 * unchanged.
 *
 * sim_water_add(z0, ox, oy): a body of still water at world z0, its wave
 * phases measured from (ox, oy). Returns its index, 0 to 3, or
 * SIM_ERR_BAD_STATE when four are declared already.
 * sim_water_vertex(body, x, y): the next corner of its outline, world x y,
 * up to 256; a body with fewer than three corners is water everywhere.
 * sim_water_wind(body, speed, dx, dy, fetch): the wind over it, m/s along
 * the unit (dx, dy) it blows toward, over fetch metres of open water: the
 * wind sea it raises, by the SPM's fetch limited growth laws, as six
 * linear components. 0 to 30 m/s, 0 to 1e6 m.
 * sim_water_swell(body, height, period, dx, dy): one more component,
 * crest to trough metres (0 to 5), period seconds (0.5 to 30), travelling
 * along the unit (dx, dy).
 * sim_water_sample(x, y, t, out[7]): the surface under (x, y) at sim time
 * t: out[0] the body's index or -1, out[1] the surface's world z, out[2]
 * and out[3] its slope along x and y, out[4..6] the water's velocity.
 * sim_water_components(body, out[6 + 5 x 7]): the count, z0, the origin,
 * the wind sea's significant height and peak period, then per component
 * amplitude, kx, ky, omega and phase, which is everything a shader needs
 * to draw the surface the plant feels: z = z0 + sum a cos(kx (x - ox) +
 * ky (y - oy) - omega t + phase).
 * sim_math_sin, sim_math_cos: the fixed libm's full range sin and cos,
 * for the tests' mirror.
 */
int sim_water_clear(void);
int sim_water_add(double z0, double ox, double oy);
int sim_water_vertex(int body, double x, double y);
int sim_water_wind(int body, double speed, double dx, double dy, double fetch);
int sim_water_swell(int body, double height, double period, double dx, double dy);
int sim_water_sample(double x, double y, double t, double *out);
int sim_water_components(int body, double *out);

/*
 * sim_float_state(out[10]): what the floats of an airframe that has them
 * did on the last step: out[0] their buoyancy, N; out[1] the rest of the
 * water's push along the body's up axis, the planing force and the
 * damping, N; out[2] the water's drag along the keels, N, positive
 * holding the aircraft back; out[3] the displaced volume, m^3; out[4] and
 * out[5] the wetted length of the left and the right float, m; out[6]
 * the load on the keels on land, N; out[7] the water rudders' side force,
 * N, body y; out[8] the wave making drag, N; out[9] the water body under
 * the aircraft, or -1. All zero on an airframe without floats. While the
 * floats are wet or on the ground the stabiliser is in Manual, as on
 * wheels. Additive, version unchanged; SIM_ERR_BAD_ARG for a null pointer.
 */
int sim_float_state(double *out);
double sim_math_sin(double x);
double sim_math_cos(double x);

/*
 * CRASH PHYSICS, src/native/crash.c and docs/CRASH-STAGE1.md, which is the
 * contract in prose: every table, limit and source is there. Additive,
 * version unchanged.
 *
 * THE DAMAGE MODE. sim_set_damage(1) turns crash physics on: every contact
 * the plant resolves (the ground plane, sim_contact, sim_contact_at, the
 * wheels, the obstacles and trees below) is attributed to the part it
 * struck and judged against that part's limits, and past them parts crush,
 * chip, bend and break off. 0 is off, the default, and the path every
 * harness replay and every existing gate takes: the airframe is the rigid,
 * unbreakable body it always was. A MODE like the airframe: it survives
 * sim_reset and sim_init. The DAMAGE STATE (what has broken) is dynamic and
 * sim_reset clears it, as does sim_set_airframe.
 *
 * THE BIT IDENTITY RULE. With the mode on, a flight whose every contact
 * stays under every limit is bit identical to the same flight with it off,
 * because the judgement only reads the solver's numbers and nothing is
 * written until a limit is crossed. docs/CRASH-STAGE1.md records the proof.
 *
 * SCENARIO SET UP for a test or the crash suite: sim_init, sim_set_airframe,
 * sim_reset, sim_set_damage(1), sim_set_ground, sim_set_pose, then
 * sim_set_velocity (below) or sim_wing_launch, and sim_input for the sticks.
 */
int sim_set_damage(int on);
int sim_damage(void);

/*
 * sim_set_velocity(vx, vy, vz, p, q, r): write the plant's linear velocity,
 * m/s world frame, and body rates, rad/s, keeping pose, motors and pack.
 * For a scenario to arrive at a surface at a known speed on any airframe
 * (sim_wing_launch is the fixed wings' hand throw and refuses a quad). The
 * harness never calls it. SIM_ERR_BAD_ARG for a non finite value or a
 * speed over 150 m/s.
 */
int sim_set_velocity(double vx, double vy, double vz, double p, double q, double r);

/*
 * THE PARTS. Every airframe is a fixed table of rigid parts, index 0 the
 * root (the quad's frame, a plane's fuselage), each other part joined to
 * its parent by a joint with a strength. The table is the airframe's and
 * does not change; what changes is each part's state.
 *
 * sim_parts_count(): how many parts the airframe in force has, at most
 * SIM_PARTS_MAX.
 *
 * sim_part_info(part, out[SIM_PART_INFO_DOUBLES]), static:
 *   [0]  kind, SIM_PART_* below
 *   [1]  parent part, -1 for the root
 *   [2]  material, SIM_MAT_* below
 *   [3]  the motor it carries or is (0..3 in Betaflight order on a quad,
 *        0 on a plane), -1 for none
 *   [4]  mass, kg. The masses sum to the airframe's mass.
 *   [5..7]   its centre of mass, body frame, m. The mass weighted sum is
 *            the airframe's CG, the body origin, to rounding.
 *   [8..10]  its joint to the parent, body frame, m
 *   [11] the joint's bending moment limit, N m (0 for the root)
 *   [12] the joint's force limit, N, pull out or shear (0 for the root)
 *   [13] contact stiffness at its surface, N/m
 *   [14] crush plateau stress, Pa; 0 for a part that does not crush
 *   [15] crush area, m^2, the section a crush front advances through
 *   [16] crush depth it can take before it is spent, m
 *   [17] its hull point count, 1..SIM_PART_PTS_MAX
 *   [18..20] its hull's bounding box minimum, body frame, m
 *   [21..23] and maximum
 * sim_part_hull(part, out[1 + 3 x SIM_PART_PTS_MAX]): out[0] the point
 * count, then the points, body frame, m. The points are contact samplers
 * (a convex hull's corners), not a render mesh.
 */
#define SIM_PARTS_MAX 24
#define SIM_PART_PTS_MAX 8
#define SIM_PART_INFO_DOUBLES 24

#define SIM_PART_FRAME 0      /* a quad's plates and stack, the root */
#define SIM_PART_ARM 1
#define SIM_PART_MOTOR 2
#define SIM_PART_PROP 3
#define SIM_PART_BATTERY 4
#define SIM_PART_CAMERA 5     /* the FPV camera */
#define SIM_PART_ANTENNA 6    /* the video transmitter's antenna */
#define SIM_PART_CANOPY 7     /* a whoop's canopy, a plane's hatch */
#define SIM_PART_FUSELAGE 8   /* a plane's root */
#define SIM_PART_WING 9       /* one wing panel */
#define SIM_PART_HSTAB 10
#define SIM_PART_FIN 11
#define SIM_PART_AILERON 12
#define SIM_PART_ELEVATOR 13
#define SIM_PART_RUDDER 14
#define SIM_PART_ELEVON 15
#define SIM_PART_GEAR 16      /* a landing gear leg with its wheel */
#define SIM_PART_FLOAT 17
#define SIM_PART_BOOM 18      /* a tail boom */
#define SIM_PART_DUCT 19      /* a whoop's duct ring */
#define SIM_PART_KINDS 20

#define SIM_MAT_CF_PLATE 0    /* carbon fibre plate, quasi isotropic */
#define SIM_MAT_CF_TUBE 1     /* carbon fibre tube, unidirectional */
#define SIM_MAT_EPO 2         /* expanded polyolefin foam */
#define SIM_MAT_EPP 3         /* expanded polypropylene foam */
#define SIM_MAT_NYLON_GF 4    /* glass filled nylon, props and mounts */
#define SIM_MAT_ALU 5         /* aluminium, booms, gear, motor bells */
#define SIM_MAT_LIPO 6        /* a lithium polymer pack in its wrap */
#define SIM_MAT_PC 7          /* polycarbonate or ABS, canopies, whoop frames */
#define SIM_MAT_ELECTRONICS 8 /* a camera or a board, a potted brick */
#define SIM_MAT_WIRE 9        /* steel wire, gear legs, antenna whips */
#define SIM_MAT_PLY 10        /* plywood, formers */
#define SIM_MATERIALS 11

/*
 * sim_set_part_table(which): SIM_PARTS_OWN (0, the default) is the
 * airframe's own table. SIM_PARTS_WHOOP_SCALED (1) is for the shell's whoop,
 * which is the five inch's plant flown in a room MICRO_SCALE times life
 * size: the real whoop's parts scaled to that world with limits scaled so a
 * crash the real whoop survives this survives (docs/CRASH-STAGE1.md). It
 * applies only while the five inch's plant is selected; on any other
 * airframe the airframe's own table is used. A mode, kept across resets;
 * setting it clears the damage state. sim_part_table() reads it back.
 */
#define SIM_PARTS_OWN 0
#define SIM_PARTS_WHOOP_SCALED 1
int sim_set_part_table(int which);
int sim_part_table(void);

int sim_parts_count(void);
int sim_part_info(int part, double *out);
int sim_part_hull(int part, double *out);

/*
 * sim_parts_state(out[sim_parts_count() x SIM_PART_STATE_DOUBLES]): every
 * part now, in table order:
 *   [0]  status: 0 attached, 1 detached and moving (a free body), 2
 *        detached and at rest, 3 detached and retired past the active
 *        body budget (frozen where it lay)
 *   [1]  damage, 0 intact to 1 destroyed or broken off
 *   [2..4]   its centre of mass, world, m
 *   [5..8]   its orientation, quaternion w x y z, body to world. Attached,
 *            the craft's, times its own knock or bend if it has one
 *   [9..11]  its centre of mass velocity, world, m/s
 *   [12..14] its angular velocity, world, rad/s
 *   [15] the free body it rides on, 0..SIM_PARTS_MAX-1, or -1
 *   [16] its peak load this step over its limit, 0 when untouched
 *   [17..19] its permanent deformation, body frame: a crushed part's dent,
 *            m, pointing into it; an arm, a boom or a gear leg's bend and
 *            a camera or antenna's knock, a rotation vector, rad
 *   [20] energy it has absorbed, J
 *   [21] kind, as sim_part_info [0]
 *   [22] parent, as sim_part_info [1]
 *   [23] reserved, 0
 */
#define SIM_PART_STATE_DOUBLES 24
#define SIM_PART_ATTACHED 0
#define SIM_PART_FREE 1
#define SIM_PART_RESTING 2
#define SIM_PART_RETIRED 3
int sim_parts_state(double *out);

/*
 * sim_damage_events(out[max x SIM_DAMAGE_EVENT_DOUBLES], max): the damage
 * events since the last call, oldest first, and returns how many it wrote.
 * The queue holds SIM_DAMAGE_EVENTS_MAX; past that the oldest are dropped
 * and sim_damage_events_dropped() counts them. Each event:
 *   [0]  the step it happened in (t = step / 1000 s)
 *   [1]  part
 *   [2]  type, SIM_EVENT_* below
 *   [3]  the load over the limit that decided it (a break is >= 1)
 *   [4]  peak contact force, N
 *   [5]  bending moment at the part's joint, N m
 *   [6]  energy the event absorbed, J
 *   [7..9]   the contact point, world, m
 *   [10..12] the contact normal, world, out of the surface
 *   [13] closing speed at the point, m/s
 *   [14] the surface's material, SIM_SURF_* below
 *   [15] the part's damage after the event, 0..1
 */
#define SIM_DAMAGE_EVENT_DOUBLES 16
#define SIM_DAMAGE_EVENTS_MAX 64
#define SIM_EVENT_BREAK 1  /* the joint failed: the part and its children left */
#define SIM_EVENT_CRUSH 2  /* foam crushed, a permanent dent */
#define SIM_EVENT_CHIP 3   /* a prop chipped: thrust down, imbalance up */
#define SIM_EVENT_BEND 4   /* an arm, boom or gear leg bent past yield */
#define SIM_EVENT_KNOCK 5  /* a camera or antenna knocked askew */
#define SIM_EVENT_CRACK 6  /* damage under the break: a part weakened */
#define SIM_EVENT_SETTLE 7 /* a free body came to rest */
int sim_damage_events(double *out, int max);
int sim_damage_events_dropped(void);

/*
 * sim_damage_flags(): what a renderer and the shell need to know without
 * walking the parts, a bit mask. Zero on an intact aircraft.
 */
#define SIM_DMG_CAMERA_KNOCKED (1 << 0)  /* the FPV picture is tilted */
#define SIM_DMG_CAMERA_LOST (1 << 1)     /* no FPV picture at all */
#define SIM_DMG_ANTENNA_LOST (1 << 2)    /* the video feed breaks up */
#define SIM_DMG_BATTERY_EJECTED (1 << 3) /* power gone */
#define SIM_DMG_PROP_LOST (1 << 4)
#define SIM_DMG_PROP_CHIPPED (1 << 5)
#define SIM_DMG_ARM_BENT (1 << 6)
#define SIM_DMG_ARM_LOST (1 << 7)
#define SIM_DMG_WING_LOST (1 << 8)
#define SIM_DMG_SURFACE_LOST (1 << 9)    /* an aileron, elevator, rudder or elevon */
#define SIM_DMG_CANOPY_LOST (1 << 10)
#define SIM_DMG_GEAR_LOST (1 << 11)
#define SIM_DMG_FLOAT_LOST (1 << 12)
#define SIM_DMG_TAIL_LOST (1 << 13)      /* a stabiliser, a fin or a boom */
#define SIM_DMG_CRUSHED (1 << 14)
#define SIM_DMG_IN_TREE (1 << 15)        /* held by a tree's crown this step */
#define SIM_DMG_IN_WATER (1 << 16)       /* a part other than a float is wet */
#define SIM_DMG_MOTOR_LOST (1 << 17)
int sim_damage_flags(void);

/*
 * sim_motor_damage(out[4 x 4]): per motor, in Betaflight order on a quad
 * and motor 0 on a plane: [0] the thrust it keeps, 0..1; [1] the extra
 * once per revolution imbalance its chipped prop puts into the gyro, as a
 * multiple of a sound prop's; [2] and [3] its thrust axis tilt from a bent
 * arm, rad, about body x and body y.
 */
int sim_motor_damage(double *out);

/*
 * For a scenario that starts from a damaged aircraft ("lose one prop in
 * flight"): sim_part_break(part) fails the part's joint now, exactly as a
 * load past its limit would, and the part and its children leave as a free
 * body with the craft's motion at that point. sim_part_set_damage(part, d)
 * sets a prop's chip, a foam part's crush fraction, an arm's bend fraction
 * or a camera's knock fraction, 0..1 (1 on a prop is a lost blade set,
 * which breaks it). Both need the damage mode on; SIM_ERR_BAD_STATE
 * without it, SIM_ERR_BAD_ARG for a part out of range or the root.
 */
int sim_part_break(int part);
int sim_part_set_damage(int part, double damage);

/*
 * FREE BODIES. A part that breaks off, with the parts joined under it,
 * becomes a free rigid body in the plant: gravity, the air's drag on it,
 * the ground plane, the obstacles and water below, and it comes to rest.
 * At most SIM_FREE_BODIES_MAX move at once; a new one past that retires
 * the one that has lain still longest, or, if none has, the oldest, which
 * freezes where it is. Deterministic. sim_free_bodies_active() is how many
 * are moving.
 */
#define SIM_FREE_BODIES_MAX 12
int sim_free_bodies_active(void);

/*
 * SURFACES. A material per contact. SIM_SURF_DEFAULT is today's contact:
 * the restitution and friction the caller passes, a rigid surface. The
 * others carry their own friction, restitution and give (a stiffness, and
 * the damping of a surface that yields: soft ground absorbs more than
 * concrete and loads a part less); docs/CRASH-STAGE1.md has each with its
 * source. sim_material_info(mat, out[4]): mu, restitution, stiffness N/m
 * (in series with a part's own, it sets the peak force of an impact), and
 * hardness 0..1, how hard a spinning prop finds it (concrete 1, grass
 * 0.05). SIM_SURF_DEFAULT reads the ground plane's own mu and restitution.
 * sim_set_ground_material(mat): the ground plane's, kept until changed or
 * sim_set_ground(0); SIM_SURF_DEFAULT after a reset.
 * sim_contact_at_mat: sim_contact_at with the material's mu and
 * restitution in place of the caller's.
 */
#define SIM_SURF_DEFAULT 0
#define SIM_SURF_GRASS 1
#define SIM_SURF_DIRT 2
#define SIM_SURF_ASPHALT 3
#define SIM_SURF_CONCRETE 4
#define SIM_SURF_ROCK 5
#define SIM_SURF_SNOW 6
#define SIM_SURF_WOOD 7       /* a trunk, a post, a fence */
#define SIM_SURF_METAL 8
#define SIM_SURF_PVC 9        /* a race gate */
#define SIM_SURF_FOLIAGE 10   /* a tree's crown: see the trees */
#define SIM_SURF_WATER 11
#define SIM_SURF_SAND 12
#define SIM_SURFACES 13
int sim_material_info(int mat, double *out);
int sim_set_ground_material(int mat);
int sim_contact_at_mat(double nx, double ny, double nz, int mat,
                       double px, double py, double pz,
                       double vsx, double vsy, double vsz,
                       double rx, double ry, double rz);

/*
 * OBSTACLES for the free bodies, which the shell does not track: boxes and
 * vertical cylinders, plant frame, each with a material. The craft itself
 * keeps meeting the world through the shell's sim_contact_at, as before.
 * sim_obstacle_box(cx, cy, cz, hx, hy, hz, qw, qx, qy, qz, mat): centre,
 * half extents, orientation. sim_obstacle_cylinder(x, y, z0, z1, r, mat):
 * a post, a pole or a trunk. Each returns its index or SIM_ERR_BAD_STATE
 * past SIM_OBSTACLES_MAX. Kept across sim_reset, like the water.
 */
#define SIM_OBSTACLES_MAX 64
int sim_obstacle_clear(void);
int sim_obstacle_box(double cx, double cy, double cz, double hx, double hy, double hz,
                     double qw, double qx, double qy, double qz, int mat);
int sim_obstacle_cylinder(double x, double y, double z0, double z1, double r, int mat);

/*
 * TREES. sim_tree_add(x, y, z0, trunk_r, crown_z0, crown_z1, crown_r): a
 * trunk from z0 up, a cylinder of trunk_r (an obstacle of wood for every
 * free body; the craft's own trunk contact stays the shell's collider, as
 * it is today), and a crown, an upright cylinder of crown_r
 * from crown_z0 to crown_z1, that the craft and the free bodies fly INTO:
 * the twigs drag every part inside in proportion to its area, and a craft
 * slowed to a crawl in it is held by the branches if its weight over its
 * plan area is under what they carry, which a plane's is and a quad's is
 * not. Returns the tree's index or SIM_ERR_BAD_STATE past SIM_TREES_MAX.
 * Kept across sim_reset. Only read with the damage mode on.
 */
#define SIM_TREES_MAX 32
int sim_tree_clear(void);
int sim_tree_add(double x, double y, double z0, double trunk_r,
                 double crown_z0, double crown_z1, double crown_r);

/* Number of doubles sim_state writes. SIM_STATE_DOUBLES for this version. */
int sim_state_size(void);

/* Write the state block described above into out. */
int sim_state(double *out);

#endif /* SIM_ABI_H */
