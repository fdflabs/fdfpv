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
 * How many parts met a solid the plant knows (sim_obstacle_*, a tree's
 * trunk) on the last step. With the damage mode on the plant meets those
 * solids itself, every step, and drops a host's contact on one, so a host
 * that knew a hit only by its own contact call learns it here. Zero with
 * the mode off. Additive.
 */
int sim_obstacle_contacts(void);

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
 * The radio link, for Betaflight's failsafe. ok non-zero: the link is up
 * and every sim_input sample the module consumes is a packet that arrived.
 * ok zero: the link is down and a consumed sample is a packet that never
 * arrived; it does not reach the controller. Holds until called again,
 * across sim_reset.
 *
 * Until the first call nothing about the link is judged, and a replay that
 * never calls this is bit-identical to one from before it existed. From
 * the first call Betaflight's flight/failsafe.c and rx/rx.c judge it as a
 * real receiver's: 100 ms without a packet is signal loss (stage 1: the
 * channels hold, then go to centred sticks and low throttle), and
 * failsafe_delay of it is stage 2, which failsafe_procedure makes a DROP
 * (disarm, motors stop) or an AUTO-LAND. So once the host calls this with
 * the link up it must queue samples at a radio's frame rate, as the live
 * shell does, and not hold sticks by queueing one sample and stepping.
 *
 * A dropped craft stays disarmed until sim_reset: there is no arm switch.
 *
 * Returns the state after the call: failsafe.c's phase in the low four bits
 * (0 idle, 1 rx loss detected, 2 landing, 3 landed, 4 rx loss monitoring,
 * 5 recovered), plus SIM_RX_FAILSAFE_ACTIVE while stage 2 is on and
 * SIM_RX_ARMED while the craft is armed. Additive ABI, version unchanged.
 * Quads only: a fixed wing runs no flight controller, and ignores it.
 */
#define SIM_RX_FAILSAFE_ACTIVE 0x10
#define SIM_RX_ARMED 0x20
int sim_rx_signal(int ok);

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
 * on their keels on land, and 11 BMJR's 1/2A Texaco Buzzard Bombshell
 * (docs/BOMBSHELL-STAGE1.md), a 44 in balsa and tissue old timer with a
 * glow engine that idles and never stops, rudder and elevator and no
 * ailerons like the Slow Stick, on wheels and a tail skid, and 12 SIG's
 * Kadet Senior (docs/KADET-STAGE1.md), a 78 in balsa trainer on an O.S.
 * FS-52 four stroke glow engine, rudder and elevator and no ailerons, on
 * a tricycle gear whose nose wheel steers with the rudder, 15 FMS's
 * 1450 mm P-51D Mustang (docs/P51-STAGE1.md), an electric warbird with
 * flaps on retracting taildragger gear, 16 Freewing's F-16 V3
 * (docs/F16-STAGE1.md), a 70 mm electric ducted fan jet whose thrust lags
 * the stick, on a tricycle gear, 17 Zagi's 48 in Zagi HP
 * (docs/ZAGI-STAGE1.md), an EPP flying wing with elevons and winglets and
 * no rudder, thrown by hand and landed on its belly, 19 Phil
 * Kraft's Das Ugly Stik as RCM published Jim Jensen's kit of it
 * (docs/UGLYSTIK-STAGE1.md), a 62 in
 * balsa sport aerobat on a .61 two stroke glow engine, a shoulder wing on
 * a section near enough symmetric to fly on its back, on a tricycle gear,
 * and 21 OA Composites' NRJ (docs/DLG-STAGE1.md), a 1490 mm F3K discus
 * launch glider with no motor, thrown by its wingtip (sim_wing_discus) into
 * the thermals of sim_air_lift, and 23 Great Planes' Tiger Moth ARF
 * (docs/TIGERMOTH-STAGE1.md), a 71 in scale de Havilland DH.82A on a .61
 * two stroke glow engine, a biplane on the plant's second wing
 * (docs/PITTS-STAGE1.md) whose ailerons are on its bottom wing alone, on
 * a taildragger's gear, and 24 to 26 the combat quads
 * (docs/COMBAT-DRONES.md), a 7 inch and a 10 inch long range X frame on
 * 6S Li-ion and a stretched X 7 inch interceptor on a 6S LiPo, flown by
 * Betaflight as the five inch is, built to carry a payload through
 * sim_set_addons, and 27 and 28 the Striker (the same doc, section 7), the
 * war's 2.5 m pusher delta with elevons and small rudders on its wingtip
 * fins, rail launched and landed on its belly skid, 27 on a 110 cc boxer
 * twin and a 30 in wooden prop, 28 on a 140 N class turbojet whose thrust
 * lags the stick, both carrying a warhead in the nose through
 * sim_set_addons. Returns SIM_ERR_BAD_ARG for any id without an aircraft.
 * 2 to 23, 27 and 28 are fixed wings: no Betaflight, the sticks go to the
 * plant, and the sim_wing_* and sim_plane_surfaces entry points below
 * apply. 0, 1 and 24 to 26 are quads.
 *
 * RESERVED: 13 (the Edge 540T), 14 (the Extra 300 3D), 18 (the Pitts
 * S-1S), 20 (the Wot 4) and 22 (the Quickie 500) were removed on
 * 2026-09-29 at the owner's request. Their ids are never reused, so a
 * recording, a ghost, a clip or a room peer that names one still names
 * that aircraft and no other; sim_set_airframe refuses them with
 * SIM_ERR_BAD_ARG, as it refuses any id without an aircraft.
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
#define SIM_AIRFRAME_BOMBSHELL1118_ID 11
#define SIM_AIRFRAME_KADET1981_ID 12
#define SIM_AIRFRAME_P51D1450_ID 15
#define SIM_AIRFRAME_F16878_ID 16
#define SIM_AIRFRAME_ZAGI1219_ID 17
#define SIM_AIRFRAME_UGLYSTIK1567_ID 19
#define SIM_AIRFRAME_NRJ1490_ID 21
#define SIM_AIRFRAME_TIGERMOTH1803_ID 23
#define SIM_AIRFRAME_7IN_ID 24
#define SIM_AIRFRAME_10IN_ID 25
#define SIM_AIRFRAME_INTERCEPTOR_ID 26
#define SIM_AIRFRAME_STRIKER_PROP_ID 27
#define SIM_AIRFRAME_STRIKER_JET_ID 28
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
 * The chase boost: every propulsor's aerodynamics as if its prop turned
 * `scale` times faster, the quads' rotors and a fixed wing's prop or fan.
 * Catch the Ace (docs/TAG-PLAN.md) gives it to every pilot who is not the
 * Ace, the owner's "if you are NOT the ace, you get a 5% speed boost for
 * chasing". 1.0 is the machine every threshold was measured against and
 * the path every harness replay takes. The accepted range is 1.0 to 1.5;
 * outside it returns SIM_ERR_BAD_ARG rather than being clamped, same
 * argument as sim_set_air.
 *
 * WHY A PROP SPEED AND NOT A THRUST SCALE. A prop's thrust falls with the
 * airspeed and is gone at its pitch speed, so at full throttle the top
 * speed sits close under the pitch speed, and a scale on the thrust alone
 * barely moves it: measured on the Cub, 5 percent more thrust bought 1.1
 * percent of level top speed, and 5 percent of speed would have cost about
 * 28 percent of thrust, far more climb and punch than the owner asked for.
 * A prop turning k times faster has k times the pitch speed and k squared
 * the thrust at the same advance ratio, so against a drag that goes as the
 * square of the speed its top speed is exactly k times higher: k = 1.05 is
 * the owner's 5 percent, with 10 percent more static pull.
 *
 * So the pitch speed the thrust loss is keyed on is scaled by `scale`, and
 * the thrust, after every other factor (advance ratio, duct, ground effect,
 * a chipped prop), by its square. Nothing else: the motor's torque, current
 * and rpm are untouched, so the pack, the sound and the rates are as they
 * were.
 *
 * A MODE, not state: it survives sim_reset and sim_init, as the gravity
 * scale does, and the shell owns asserting it. Additive ABI change,
 * version unchanged, and a flight that never calls this is bit identical
 * to one from before it existed (a multiply by 1.0 is exact), MEASURED
 * against the recorded trace hashes.
 */
int sim_set_boost(double scale);

/* The chase boost in force. */
double sim_boost(void);

/*
 * The fixed wings, airframes 2 to 23, 27 and 28. Additive, version unchanged; each
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
 * sim_wing_biplane(out[4]): a biplane's two wings as the last step took
 * them, docs/PITTS-STAGE1.md: the top wing's own lift coefficient, the
 * bottom wing's, and the linear lift each would carry at the cell's
 * angle, for the gates. Zeros on a monoplane. Additive, version
 * unchanged.
 */
int sim_wing_launch(double speed);
/* THE DISCUS LAUNCH, docs/DLG-STAGE1.md, on an aircraft thrown by its
 * wingtip (airframe 21): sim_wing_discus() starts the pilot's one turn
 * from where the aircraft is, to let it go there, facing the way it
 * faces, climbing; SIM_ERR_BAD_ARG on any other aircraft.
 * sim_wing_discus_phase(): 0 none, 1 the turn, 2 the zoom, while the
 * launch preset flies the climb. A reset ends either. */
int sim_wing_discus(void);
int sim_wing_discus_phase(void);
int sim_wing_set_stab(int mode);
int sim_wing_stab(void);
int sim_wing_surfaces(double *out);
int sim_plane_surfaces(double *out);
int sim_wing_debug(double *out);
int sim_wing_biplane(double *out);

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
 * WIND. sim_set_wind(vx, vy, gust): a horizontal wind, the air's velocity,
 * m/s, plant world frame (z up, so vx vy is the direction it blows TOWARD),
 * mean speed at most 30 m/s, and gusts on top, their RMS per horizontal
 * axis, m/s, 0 to 10. Every airframe flies through it: a quad's rotor and
 * body terms and a plane's aerodynamics, the Bramor's canopy among them,
 * read the craft's velocity less the wind, and with the damage mode on so
 * do the parts that have broken off. The gusts are a fixed sum of seven
 * cosines per axis on the sim clock, the same everywhere
 * (src/native/plant_wing.c at plant_wind): exactly repeatable, no random
 * numbers, no host maths. SIM_ERR_BAD_ARG for a non finite value or one
 * out of range. A world property, not state: kept across sim_reset and
 * sim_init, like the water; sim_set_wind(0, 0, 0) is still air, the
 * default, and then no step reads any of it, so every flight without wind
 * is bit identical to one from before it existed. In wind a plane on the
 * ground holds by Coulomb friction alone, with no stop for a slow slide,
 * so a pull past the ground's grip, its canopy's above all, drags it.
 * sim_wind(out[2]): the wind acting now, at the current step, m/s world x
 * and y, gusts included. SIM_ERR_BAD_ARG for a null pointer.
 * Additive, version unchanged.
 */
int sim_set_wind(double vx, double vy, double gust);
int sim_wind(double *out);

/*
 * BRAKE. sim_set_brake(b): the wheel brake, 0 off to 1 full, on the main
 * wheels of an airframe that stands on gear (the Cub, the Slow Stick, the
 * Timber); nothing else has a wheel for it to act on. Braked, a main
 * wheel's resistance along its heading rises from its rolling resistance
 * on the ground's material to the tyre's side grip, a locked wheel
 * skidding. An input like the sticks: 0 after sim_reset. SIM_ERR_BAD_ARG
 * for a value that is not finite or is outside 0 to 1. The ground's
 * material (sim_set_ground_material) also sets the wheels' rolling
 * resistance, from the full size table in src/native/plant.c at
 * plant_wheel_roll; the default material and grass leave it as it was.
 * Additive, version unchanged.
 */
int sim_set_brake(double b);

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

/*
 * sim_wing_set_gear(up): the retracts of an aircraft that has them
 * (docs/P51-STAGE1.md), 1 up and 0 down; the gear travels at the
 * aircraft's own rate, and its wheels carry the aircraft only while it is
 * down and locked, so a landing with it up is on the belly. A reset and
 * sim_set_airframe put it down and locked. SIM_ERR_BAD_ARG for 1 on an
 * aircraft without retracts, or anything but 0 or 1.
 * sim_wing_gear(): where it is, 0 down and locked to 1 up.
 * sim_wing_gear_selected(): the switch, 1 up and 0 down.
 * Additive, version unchanged: an aircraft without retracts reads none of
 * it and its trace is bit identical.
 */
int sim_wing_set_gear(int up);
double sim_wing_gear(void);
int sim_wing_gear_selected(void);
int sim_wing_set_slats(int fitted);

/*
 * THE POWER SYSTEM, docs/POWER-STAGE1.md, fixed wings only (airframes 2 to
 * 12). The quads' plant never drains its pack and none of this applies
 * to them.
 *
 * WHAT EVERY FIXED WING DOES NOW, with or without a call below: its pack
 * drains. The charge drawn is the motor's current integrated over the
 * steps, and the current is the power the prop takes over the table's
 * static full throttle power, its power coefficient following its thrust
 * coefficient as APC's measured props do, so it falls as the prop unloads
 * at flight speed; the open circuit voltage follows a published
 * LiPo curve down the state of charge; the loaded voltage is that less
 * the current through the pack's internal resistance; and the motor's
 * speed, with its thrust and pitch speed, falls with the loaded voltage
 * over the loaded voltage the pack had when it was seated, so a fresh
 * pack flies as the table always did and a tired one fades. When the
 * loaded voltage falls under the ESC's low voltage cutoff it caps the
 * throttle, and at empty the motor stops. A glow engine burns its tank
 * instead, linear in the rpm from idle to full, leans and speeds up over
 * the last of it and then quits: a dead stick, until sim_reset. The
 * starting charge is the one sim_set_cell_voltage's open circuit voltage
 * names on the curve (4.2 V is full), and sim_set_cell_voltage and
 * sim_reset both put a full tank and that pack back.
 *
 * sim_set_power(in): seat a power option over the airframe in force, the
 * SIM_POWER_DOUBLES below, SI units. configs/power.js builds it from the
 * option, the pack and the tank the pilot chose. A MODE like the airframe:
 * kept across sim_reset and sim_init, and cleared by sim_set_airframe to a
 * different airframe, which puts the table's stock system back. It also
 * refills the pack and the tank. SIM_ERR_BAD_ARG on a quad, for a null
 * pointer, for any value outside its range (sim_set_power's checks in
 * src/native/plant.c) and for a glow engine without an idle or an
 * electric motor with a tank; SIM_ERR_BAD_STATE before sim_init.
 * sim_power_clear(): the table's stock system back, pack and tank full.
 * sim_power_state(out): SIM_POWER_STATE_DOUBLES, below. SIM_ERR_BAD_ARG
 * for a null pointer.
 *
 * Additive, version unchanged. The drain itself is a behaviour change to
 * every fixed wing, the owner's decision of 2026-09-27; every quad trace
 * is bit identical.
 */
#define SIM_POWER_KIND 0        /* 0 electric, 1 glow */
#define SIM_POWER_MASS 1        /* all up mass, kg */
#define SIM_POWER_CG_SHIFT 2    /* CG shift from the table's, m, forward + */
#define SIM_POWER_CELLS 3       /* series cells */
#define SIM_POWER_R_CELL 4      /* internal resistance per cell, ohms */
#define SIM_POWER_PACK_C 5      /* pack capacity, coulombs (mAh x 3.6) */
#define SIM_POWER_THRUST 6      /* static thrust at full throttle, N */
#define SIM_POWER_PITCH_SPEED 7 /* pitch speed at full throttle, m/s */
#define SIM_POWER_RPM 8         /* no load rpm (electric) or full rpm / 0.85 (glow) */
#define SIM_POWER_CURRENT 9     /* static current at full throttle, A */
#define SIM_POWER_IDLE 10       /* glow idle as a fraction of full rpm; 0 electric */
#define SIM_POWER_TANK 11       /* tank volume, m^3; 0 electric */
#define SIM_POWER_FLOW_FULL 12  /* fuel flow at full rpm, m^3/s */
#define SIM_POWER_FLOW_IDLE 13  /* fuel flow at idle, m^3/s */
#define SIM_POWER_LEAN_FRAC 14  /* share of the tank the lean run starts at */
#define SIM_POWER_LEAN_GAIN 15  /* rpm rise over the lean run, a fraction */
#define SIM_POWER_LVC 16        /* ESC low voltage cutoff, volts per cell loaded; 0 none */
#define SIM_POWER_DOUBLES 17
/*
 * sim_power_state block:
 *   [0] state of charge now, 0..1 (1 for a glow engine's receiver pack)
 *   [1] charge drawn since reset, coulombs
 *   [2] open circuit voltage per cell now, volts
 *   [3] fuel left, m^3 (0 on an electric motor)
 *   [4] fuel left as a share of the tank, 0..1 (1 on an electric motor)
 *   [5] 1 while the motor or engine can run, 0 once the pack is flat or
 *       the tank dry
 *   [6] 1 during a glow engine's lean run
 *   [7] pack capacity, coulombs (0: a pack that never drains)
 *   [8] tank volume, m^3
 *   [9] 1 while a power option is seated, 0 on the table's stock system
 */
#define SIM_POWER_STATE_DOUBLES 10
int sim_set_power(const double *in);
int sim_power_clear(void);
int sim_power_state(double *out);

/*
 * A QUAD'S MOTORS, the hangar's Power tab on a quad (configs/motors.js,
 * docs/MOTORS-STAGE1.md): a real motor in place of the table's on the same
 * frame, prop and pack. The prop keeps its own kt, kq, pitch and figure of
 * merit, which are the prop's; what a motor changes is its loaded torque
 * constant, its winding and ESC resistance, its bell's inertia, and the
 * mass and inertia of the whole machine it is bolted to. The current it
 * draws, the pack's sag under it and its step response then follow from
 * the plant's own motor model, as the table's motor's do.
 *
 * sim_set_motors(in): the SIM_MOTORS_DOUBLES below, SI units, laid over
 * the quad's table where a power option is on a fixed wing, and kept and
 * cleared the same way: a MODE, kept across sim_reset and sim_init,
 * cleared by sim_set_airframe to a different airframe and by
 * sim_power_clear, and laid under the add-ons. sim_power_state [9] reads 1
 * while it is seated. SIM_ERR_BAD_ARG on a fixed wing, for a null pointer
 * and for any value out of its range (plant_set_motors in
 * src/native/plant.c); SIM_ERR_BAD_STATE before sim_init. Once a part
 * breaks off, the crash physics flies the table's motors until the reset,
 * as it does a fixed wing's power option.
 *
 * Additive, version unchanged: with nothing seated no step reads any of
 * it, and seated with the table's own values every trace is bit identical
 * (scripts/motors-check.js).
 */
#define SIM_MOTORS_MASS 0     /* all up mass, kg, 0.01 to 50 */
#define SIM_MOTORS_IXX 1      /* inertia about the CG, kg m^2, 1e-7 to 10 */
#define SIM_MOTORS_IYY 2
#define SIM_MOTORS_IZZ 3
#define SIM_MOTORS_KE 4       /* loaded torque constant, N m / A = V s / rad, 1e-5 to 0.1 */
#define SIM_MOTORS_R 5        /* winding plus ESC resistance, ohms, 0.001 to 5 */
#define SIM_MOTORS_J_ROTOR 6  /* bell plus prop inertia, kg m^2, 1e-10 to 0.01 */
#define SIM_MOTORS_DOUBLES 7
int sim_set_motors(const double *in);

/*
 * A QUAD'S PROP AND PACK, the hangar's Power tab on a quad beside its
 * motors (configs/motors.js, docs/MOTORS-STAGE1.md): a real prop of the
 * frame's own diameter and a real pack, laid over the motors block or the
 * table. What the prop and the pack weigh, and where, is not here: the
 * host folds it into sim_set_motors's mass and inertia, which describe the
 * whole machine, so a stock motor with a heavier pack seats both blocks.
 *
 * sim_set_prop_pack(in): the SIM_PROP_PACK_DOUBLES below, SI units. The
 * prop's thrust and torque constants, thrust kt w^2 and torque kq w^2 on
 * a rotor at w rad/s, and its pitch over 2 pi, metres per radian (plant.c
 * k_inflow: a rotor at w has a pitch speed of w times it) and its figure
 * of merit, kt^1.5 / (kq sqrt(2 rho A)) on the plant's disc (plant.c
 * torque_ind: the descent's torque split uses it, so a prop's own keeps
 * that split equal to kq w^2 at mu 0); the pack's
 * series cells and each cell's resistance, ohms; and the prop's thrust and
 * torque over their static values at axial advance mu 0, 0.1, ... 1.4
 * (plant.c axial_curve and torque_curve, docs/PROP-CURVES.md), each from
 * 0 to 2, the first of each exactly 1. A MODE on the same rules
 * as sim_set_motors: kept across sim_reset and sim_init, cleared by
 * sim_set_airframe to a different airframe and by sim_power_clear, which
 * clears both blocks. sim_power_state [9] reads 1 while either is seated.
 * SIM_ERR_BAD_ARG on a fixed wing, for a null pointer and for any value
 * out of its range (plant_set_prop_pack in src/native/plant.c);
 * SIM_ERR_BAD_STATE before sim_init.
 *
 * Additive, version unchanged: with nothing seated no step reads any of
 * it, and seated with the table's own values every trace is bit identical
 * (scripts/motors-check.js).
 */
#define SIM_PROP_PACK_KT 0       /* N per (rad/s)^2, 1e-10 to 1e-3 */
#define SIM_PROP_PACK_KQ 1       /* N m per (rad/s)^2, 1e-12 to 1e-4 */
#define SIM_PROP_PACK_PITCH_R 2  /* pitch over 2 pi, m per rad, 0.001 to 0.2 */
#define SIM_PROP_PACK_FM 3       /* figure of merit, 0.1 to 0.9 */
#define SIM_PROP_PACK_CELLS 4    /* series cells, 1 to 14 */
#define SIM_PROP_PACK_R_CELL 5   /* ohms a cell, 0 to 1 */
#define SIM_PROP_PACK_AXIAL 6    /* 15: thrust over static at mu 0 to 1.4 */
#define SIM_PROP_PACK_TORQUE 21  /* 15: torque over static at mu 0 to 1.4 */
#define SIM_PROP_PACK_DOUBLES 36
int sim_set_prop_pack(const double *in);

/*
 * ADD-ONS, the hangar's Parts tab (configs/hangar-parts.js) on a fixed
 * wing and a combat quad's payload and accessories (docs/COMBAT-DRONES.md)
 * on a quad: what the pilot bolted on or taped up, handed over as one
 * lumped mass, one drag area and the main wheels' tyres. A quad has no
 * wheels, so WHEEL_R and ROLL_K are checked and read by nothing.
 *
 * sim_set_addons(in): the SIM_ADDON_DOUBLES below, SI units.
 *   MASS    kg added, -1 to 5 (a lighter prop takes a little off), a
 *           point mass at CG_X..CG_Z (body frame, m, each within 3 m of the
 *           table's CG); the aircraft keeps at least 0.05 kg, and a power
 *           option or tuning seated after the add-ons is not checked
 *           against them again. The CG moves to the mass weighted
 *           mean, the state's origin with it, and every body
 *           frame position the plants read (the motor, the camera, the
 *           wheels) moves the other way, as a part that leaves moves them
 *           (crash.c). The aero is still taken about the table's CG, so
 *           every force the step sums gets the arm to the new one, the
 *           same fix-up a lost part's shift gets. The inertia about the new
 *           CG is the table's plus the point mass's m r^2 about the old,
 *           less the whole mass times the shift squared (parallel axes).
 *           The hull's contact corners move with them. The crash part
 *           table does not: its parts' boxes, which say which part a
 *           contact struck, stay where the table has them, off by the
 *           shift, which scripts/parts-check.js holds under 2 cm for every
 *           combination configs/hangar-parts.js allows.
 *   CDA     drag area added, C_D times area, m^2, 0 to 0.5, quadratic in
 *           the air speed at DRAG_X..DRAG_Z (body frame about the table's
 *           CG, m), like the parachute's canopy.
 *   WHEEL_R the main wheels' tyre radius, m, 0.005 to 0.2, or 0 for the
 *           table's. The contact is the rim's point nearest the ground as
 *           ever, so a bigger tyre on the same axle stands the aircraft
 *           higher.
 *   ROLL_K  the main wheels' rolling resistance over the table's, 0.1 to
 *           10; 1 is the table's.
 * A MODE like sim_set_power, laid last, over the table, any power option
 * and any tuning (sim_wing_set_tune): kept across sim_reset and sim_init,
 * cleared by sim_set_airframe to a different airframe and by
 * sim_addons_clear, and put back with the power option and the tuning at
 * the reset after a part broke off. Once a part breaks off, the crash
 * physics flies the table's airframe until that reset, as it does a power
 * option. A host seats the power option, then the tuning, then these.
 * SIM_ERR_BAD_ARG for a null pointer and for any value out of its range;
 * SIM_ERR_BAD_STATE before sim_init. It was refused on a quad until the
 * combat quads; a quad's drag acts at DRAG_X..DRAG_Z about the new CG and
 * turns it, as a wing's does.
 *
 * Additive, version unchanged: with no add-ons set nothing reads any of
 * this and every trace is bit identical.
 */
#define SIM_ADDON_MASS 0
#define SIM_ADDON_CG_X 1
#define SIM_ADDON_CG_Y 2
#define SIM_ADDON_CG_Z 3
#define SIM_ADDON_CDA 4
#define SIM_ADDON_DRAG_X 5
#define SIM_ADDON_DRAG_Y 6
#define SIM_ADDON_DRAG_Z 7
#define SIM_ADDON_WHEEL_R 8
#define SIM_ADDON_ROLL_K 9
#define SIM_ADDON_DOUBLES 10
/*
 * sim_addons_state(out): the plant as the power option, tuning and add-ons
 * leave it, for a host's check, SIM_ADDONS_STATE_DOUBLES:
 *   [0] 1 while add-ons are seated, else 0
 *   [1] all up mass, kg
 *   [2] the add-ons' drag area, m^2
 *   [3..5] the CG's move from the table's, body frame, m
 *   [6] the first braked wheel's tyre radius, m; 0 on an aircraft without
 *   [7] static thrust at full throttle on a fresh pack, N; 0 on a quad
 * SIM_ERR_BAD_ARG for a null pointer.
 */
#define SIM_ADDONS_STATE_DOUBLES 8
int sim_set_addons(const double *in);
int sim_addons_clear(void);
int sim_addons_state(double *out);

/*
 * sim_set_addon_inertia(in): the add-ons' own inertia about their lumped
 * point, SIM_ADDON_INERTIA_DOUBLES, kg m^2, body axes: Ixx, Iyy, Izz, each
 * 0 to 1. sim_set_addons lumps everything into one point mass, which is
 * exact for one thing bolted on and loses the spread of two far apart: a
 * pack on top and a payload underneath lump near the CG and carry almost
 * none of the roll and pitch inertia they really add. The host sums each
 * mass's m r^2 about the lump's point and hands it here; the plant adds it
 * to the inertia the lump gives. Seated over the add-ons in force and
 * zeroed by every sim_set_addons, so a host that never calls this flies
 * exactly the lump. SIM_ERR_BAD_STATE with no add-ons seated, and
 * SIM_ERR_BAD_ARG for a null pointer or a value out of range. Additive,
 * version unchanged.
 */
#define SIM_ADDON_INERTIA_DOUBLES 3
int sim_set_addon_inertia(const double *in);

/*
 * THE PILOT'S TUNING, fixed wings only (airframes 2 to 23, 27 and 28): what the
 * hangar's Tuning tab sets up on the bench, src/ui/hangar-tuning.js and
 * configs/tuning.js.
 *
 * sim_wing_set_tune(in): seat SIM_TUNE_DOUBLES below, SI units, over the
 * power option in force or the table. The CG shift moves the point the
 * pitching moment is taken about, the path a power option's CG already
 * takes (plant_wing.c, the lift's moment at the CG's arm), so a nose
 * heavy aircraft is more stable in pitch and needs more elevator for the
 * same lift, and a tail heavy one less of both, from the aerodynamics
 * and nothing else. The ballast is a point mass BALLAST_X ahead of the
 * table's CG (negative behind): it adds its mass, and its m x^2 to the
 * pitch and yaw inertia; its share of the CG shift is in CG_SHIFT
 * already, which is the whole move the host computed. The throws are the
 * surfaces' travel at full stick, the expo per surface replaces the
 * table's one expo (0 linear, 1 all cubic), the trim is added to the
 * elevator within its travel, and FLAP_MIX is the radio's flap to
 * elevator mix, elevator rad per rad of flap. A MODE like the power
 * option: kept across sim_reset and sim_init, kept by sim_set_power and
 * sim_power_clear, cleared by sim_set_airframe to a different airframe.
 * SIM_ERR_BAD_ARG on a quad, for a null pointer and for a value outside
 * its range (plant_set_tune in src/native/plant.c); SIM_ERR_BAD_STATE
 * before sim_init.
 * sim_wing_tune_clear(): the table's own again.
 * sim_wing_tune(out): the block in force; with none seated, the table's
 * (or the power option's) throws, expo and mix, and zeros for the rest.
 * SIM_ERR_BAD_ARG for a null pointer or on a quad.
 *
 * Additive, version unchanged. Nothing seated, no step reads any of it,
 * so every trace from before it existed is bit identical; seated with the
 * table's own values it is bit identical too (scripts/tuning-check.js).
 */
#define SIM_TUNE_CG_SHIFT 0   /* m, forward positive, from the table's CG */
#define SIM_TUNE_BALLAST_KG 1 /* kg added, 0 to 1 */
#define SIM_TUNE_BALLAST_X 2  /* m ahead of the table's CG, negative behind */
/* The throws take up to 60 deg, which covers Extreme Flight's 3D and
 * tumbling rates on the Edge (docs/EDGE-STAGE1.md); they took up to 45
 * before it, and a block that passed then passes now. */
#define SIM_TUNE_THROW_A 3    /* rad at full stick, 0 to 60 deg */
#define SIM_TUNE_THROW_E 4
#define SIM_TUNE_THROW_R 5
#define SIM_TUNE_EXPO_A 6     /* 0 to 1 */
#define SIM_TUNE_EXPO_E 7
#define SIM_TUNE_EXPO_R 8
#define SIM_TUNE_TRIM_E 9     /* rad, trailing edge up positive, within 10 deg */
#define SIM_TUNE_FLAP_MIX 10  /* elevator rad per rad of flap, -1 to 1 */
#define SIM_TUNE_DOUBLES 11
int sim_wing_set_tune(const double *in);
int sim_wing_tune_clear(void);
int sim_wing_tune(double *out);

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
 * phases measured from (ox, oy). Returns its index, 0 to 7, or
 * SIM_ERR_BAD_STATE when eight are declared already.
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
 *
 * A CHANNEL is a river: sim_water_channel(half_width) declares one, 0 <
 * half_width <= 1000 m, and returns its index (SIM_ERR_BAD_STATE when the
 * table is full; eight bodies of either kind); sim_water_channel_point(
 * body, x, y, z) gives its centre line's next point, world x y, and the
 * surface's world z there, to 8192 points over every channel, and only
 * to the channel declared last. Its water is within half_width of the
 * line, its surface level across the line and straight along it between
 * two points' heights, so it slopes where the river does. It is still:
 * sim_water_wind and sim_water_swell refuse it, and sim_water_components
 * gives no components and its highest point as z0. A channel with under
 * two points is water nowhere.
 */
int sim_water_clear(void);
int sim_water_add(double z0, double ox, double oy);
int sim_water_channel(double half_width);
int sim_water_channel_point(int body, double x, double y, double z);
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
#define SIM_MAT_BALSA 11      /* balsa sheet and stick under doped tissue */
#define SIM_MATERIALS 12

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
 *            m, pointing into it (a foam part's, what it keeps once
 *            unloaded: crash.c, FOAM SPRINGS BACK); an arm, a boom or a gear leg's bend and
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
#define SIM_EVENT_CRUSH 2  /* foam crushed past a scuff: a permanent dent. Its
                            * step is when it began, and it may be read out
                            * after later events (crash.c, FOAM SPRINGS BACK) */
#define SIM_EVENT_CHIP 3   /* a prop chipped: thrust down, imbalance up. A
                            * spinning blade chips only past its tip's impact
                            * limit, and each strike starts with an event; its
                            * [3] is the impact stress over the blade's
                            * strength */
#define SIM_EVENT_BEND 4   /* an arm, boom or gear leg bent past yield */
#define SIM_EVENT_KNOCK 5  /* a camera or antenna knocked askew */
#define SIM_EVENT_CRACK 6  /* damage under the break: a part weakened */
#define SIM_EVENT_SETTLE 7 /* a free body came to rest */
/*
 * Entries, events whether or not anything breaks (damage mode on only, as
 * the water and the crowns are read only then). SIM_EVENT_WATER: the first
 * step a part other than a float is wet, the part and its hull point, the
 * surface's normal, the speed the point closes on it, surface
 * SIM_SURF_WATER. SIM_EVENT_TREE: the first step a hull point is inside a
 * tree's crown, the part and the point, the normal out from the trunk's
 * axis (up if the point is on it), the point's speed, surface
 * SIM_SURF_FOLIAGE. Either rearms only after 250 ms out, so a tip dipping
 * in every crest of a swell is one entry. [3] to [6] are 0.
 */
#define SIM_EVENT_WATER 8
#define SIM_EVENT_TREE 9
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
#define SIM_DMG_CRUSHED (1 << 14)        /* a dent past a scuff (crash.c, FOAM SPRINGS BACK) */
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
 * sim_rate_guard_trips(): how many times since the last sim_reset a body
 * (the craft or a free body) came to its attitude update turning faster
 * than any rigid body here can, or with a rate that is not a number, and
 * had its rates zeroed instead of hanging the update's subdivision loop.
 * Always 0 in a sound run; anything else is a bug for the tests to catch.
 */
int sim_rate_guard_trips(void);

/*
 * sim_live_inertia(out[4]): the airframe as it flies now, what is left of
 * it once parts have gone: its mass, kg, and its inertia about its CG along
 * body x, y and z, kg m^2. For the plant tests, which hold a break to the
 * energy it had.
 */
int sim_live_inertia(double *out);

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
#define SIM_SURF_WIRE 13      /* an overhead conductor: see the wires */
#define SIM_SURFACES 14
int sim_material_info(int mat, double *out);
int sim_set_ground_material(int mat);
int sim_contact_at_mat(double nx, double ny, double nz, int mat,
                       double px, double py, double pz,
                       double vsx, double vsy, double vsz,
                       double rx, double ry, double rz);

/*
 * sim_contact_part(part): the host's next sim_contact_at (or
 * sim_contact_at_mat) is on that part of the table, at the arm it passes.
 * With the damage mode on, the contact is then that part's, at that point
 * held to its hull box, instead of the part the plant finds furthest
 * toward the contact: a host whose hull is the parts' own boxes (a fixed
 * wing in the shell) knows a pole met the wing panel, though the nose
 * stands further forward. -1 is no part. Consumed by the next call
 * whatever it does; with the mode off it changes nothing. Additive, a
 * host that never calls it is the host it was.
 */
int sim_contact_part(int part);

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
 * A POST THAT GIVES. sim_obstacle_compliance(i, ei, m_line, m_free): the
 * cylinder i is a post clamped in its base at z0 and free at z1, a beam of
 * bending stiffness ei (N m^2, its material's modulus times its section's
 * second moment) and m_line kg per metre that the parts meeting it bend:
 * the pipe near the point takes a short blow, and the whole post swings
 * back on its cantilever spring (3 ei / a^3 at height a). m_free is the
 * moment at its base (N m) past which it snaps or leaves its base and is
 * gone; 0 for a post that never does. Damage mode only;
 * every obstacle not declared so is rigid, as before. SIM_ERR_BAD_ARG for a
 * box, an index out of range or a value out of range. A post cleared by
 * sim_obstacle_clear and declared again at the same place with the same
 * numbers keeps its motion; sim_reset puts every post back at rest.
 * sim_obstacle_state(i, out[6]): its deflection at the height a part last
 * met it, plant x and y, m; that height above its base (0 until met);
 * freed 0 or 1; gone 0 or 1; the bending moment at its base, N m.
 * docs/CRASH-STAGE1.md, Surfaces, trees and water.
 */
int sim_obstacle_compliance(int i, double ei, double m_line, double m_free);
int sim_obstacle_state(int i, double *out);

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

/*
 * A CROWN OF CLUMPS. sim_tree_clump_add(tree, x, y, z, r): tree `tree`'s
 * crown is leaves in clumps with air between them, and this is one, a
 * sphere of radius r at (x, y, z), plant frame. A tree given clumps drags
 * and holds only the parts inside one of them (and inside its cylinder,
 * which stays the crown's bound); a tree given none is its whole cylinder,
 * as before, which is a conifer's crown. At most SIM_TREE_CLUMPS_MAX a
 * tree: a swiss2 broadleaf is drawn with 26 to 31. SIM_ERR_BAD_ARG for a
 * tree not added since sim_tree_clear or a value not finite or r not
 * positive, SIM_ERR_BAD_STATE past the most a tree holds. Additive ABI,
 * version unchanged: a host that never calls it has the cylinders it had.
 */
#define SIM_TREE_CLUMPS_MAX 32
int sim_tree_clump_add(int tree, double x, double y, double z, double r);

/*
 * WIRES. sim_wire_add(ax, ay, az, bx, by, bz, r): a straight chord of an
 * overhead line from a to b, plant frame, met within r of its axis (a
 * phase's bundle of conductors, or one earth wire). A sagging span is
 * declared as the chain of chords its catenary is drawn with. Every
 * attached part meets the chords near it along its hull's edges, not only
 * at its points, so a wire 3 cm thick is met between two hull points
 * wherever it crosses a panel or a prop disc, at any speed the plant
 * flies. The contact is SIM_SURF_WIRE's: no bounce, a grip that snags,
 * blade hardness 1, and the crush of a 15 mm conductor cutting into foam.
 * Returns the chord's index or SIM_ERR_BAD_STATE past SIM_WIRES_MAX,
 * SIM_ERR_BAD_ARG for a value not finite, r not positive or a chord
 * shorter than 1 mm. Kept across sim_reset, like the trees. Only read
 * with the damage mode on: with it off the host's sweep meets the wires.
 * Additive ABI, version unchanged: a host that never calls it has the
 * contacts it had.
 */
#define SIM_WIRES_MAX 160
int sim_wire_clear(void);
int sim_wire_add(double ax, double ay, double az, double bx, double by, double bz, double r);

/* Number of doubles sim_state writes. SIM_STATE_DOUBLES for this version. */
int sim_state_size(void);

/* Write the state block described above into out. */
int sim_state(double *out);

#endif /* SIM_ABI_H */
