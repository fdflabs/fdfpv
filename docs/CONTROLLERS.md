# Flight controllers per aircraft: what each one really carries

OWNER RULES 2026-10-08: modes are only real controllers and never cap a
skilled pilot; there is no special 3D mode; Stabilised stays as a beginner
aid and is never the default on an aircraft that can fly 3D; and "assume you
can use any electronics in there, but make the physics and behavior work".
This is the contract for the Tune row on the fixed wings: what each one
ships with (its default), what a pilot may fit (the other rows), and what
the rows do not do.

## What the player sees

The Tune row of each plane lists its rows, the default first. The plant's
four modes (`sim_wing_set_stab`, src/native/sim_abi.h) are the hardware:

| Mode | Row name | Real hardware | Caps |
| --- | --- | --- | --- |
| 0 | Manual | a plain receiver, the sticks are the surfaces | none |
| 3 | AS3X | a Spektrum AS3X receiver with SAFE Select off: a rate damper fading out with stick (priority 160, AS3000 manual p. 10) | none: full stick is full throw |
| 1 | Stabilised / SAFE Select | SAFE Select, Reflex's stabilised mode, INAV ANGLE, an autopilot's stabilised mode | bank and pitch limits, as the real ones have |
| 2 | Acro | INAV ACRO (Skyhunter only) | INAV's default rates, 200 deg/s roll and pitch (Settings.md roll_rate/pitch_rate 20), above what full Manual stick reaches (161 and 148 deg/s at 20 m/s) |

Acro is offered only where the builders' flight controller is INAV, the
Skyhunter; on every other plane it was an invented controller whose rates
capped a full stick below what the surfaces do (the Kadet at 25 deg/s, the
Skyhunter's pitch at 80), and its rows are gone. A stored Acro tune falls
back to the plane's default (src/ui/settings.js, the existing "a tune the
aircraft no longer offers" rule; craft-pick-selftest covers it).

## Per aircraft

| Aircraft | Ships with | Default | Rows | Source |
| --- | --- | --- | --- | --- |
| Extra 300 3D | AS3X (SAFE Select off unless bound for it) | AS3X | AS3X, Manual, SAFE Select | E-flite EFL Extra 300 3D manual p. 4 (unchanged, #860) |
| Turbo Timber Evolution 1.5 m (and floats) | AS3X + SAFE Select receiver (BNF Basic) | AS3X | AS3X, Manual, SAFE Select | Horizon EFL105250B (BNF Basic): "Spektrum AR637TA 6-Channel Receiver with AS3X and SAFE Select", "optional-use SAFE Select" |
| FMS Cub 1400 (and floats) | PNP: no gyro (a Reflex combo, FMM106PX, is sold apart) | Manual | Manual, AS3X, Stabilised | fmshobby.com FMS 1400mm J-3 Cub V4 PNP; Horizon FMM106PX |
| FMS P-51D V8 1450 | PNP: no gyro (FMM008PRTX with Reflex, discontinued) | Manual | Manual, AS3X, Stabilised | horizonhobby.com FMM008PRT, FMM008PRTX |
| Radian Pro (PKZ5475) | PNP: no gyro | Manual | Manual, AS3X, Stabilised | docs/GLIDER-STAGE1.md (which Radian) |
| Freewing F-16 V3 PNP | no gyro | Manual | Manual, AS3X, Stabilised | docs/F16-STAGE1.md |
| Zagi HP | kit, no gyro | Manual | Manual, AS3X (roll and pitch), Stabilised | docs/ZAGI-STAGE1.md |
| NRJ (F3K) | receiver and servos, no gyro | Manual | Manual, Stabilised | docs/DLG-STAGE1.md |
| SIG Kadet Senior | kit, no gyro | Manual | Manual, AS3X (pitch and yaw), Stabilised | docs/KADET-STAGE1.md |
| RCM Ugly Stik | kit, no gyro | Manual | Manual, AS3X, Stabilised | docs/UGLYSTIK-STAGE1.md |
| BMJR Bombshell | kit, no gyro | Manual | Manual, AS3X (pitch and yaw), Stabilised | docs/BOMBSHELL-STAGE1.md |
| GWS Slow Stick | kit, no gyro (verified: a three channel kit, receiver of the builder's choice) | Manual | Manual, AS3X (pitch and yaw), Stabilised | docs/SLOWSTICK-STAGE1.md |
| Great Planes Tiger Moth GPMA1330 | glow ARF, no gyro in the box (verified) | Manual | Manual, AS3X, Stabilised | docs/TIGERMOTH-STAGE1.md |
| Skyhunter 1800 | kit; builders fit INAV | Acro | Acro, Stabilised, Manual | INAV docs/Settings.md |
| Bramor C4EYE | its own autopilot | Stabilised | Stabilised, Manual | docs/BRAMOR-STAGE1.md |
| Striker | what a one way attack drone flies: an autopilot's stabilised mode | Stabilised | Stabilised, Manual | docs/COMBAT-DRONES.md |

Not offered, on purpose: AS3X on the Skyhunter (its gyro is INAV), the
Bramor and the Striker (autopilots), and the NRJ (no motor, F3K pilots fly
without one). Add them when a pilot asks.

## The AS3X gains

`scripts/as3x-derive.js` (CI, `npm run as3x:derive`) derives each table's
`as3x_k` exactly as it did the Extra's: half the gain a rate loop with
AS3X's 22 ms frame can carry at the aircraft's top speed. An axis with no
surface of its own gets 0 (no ailerons on the Slow Stick, Bombshell and
Kadet; no rudder on the Zagi). Elevon and tail mixes are read back into
the receiver's roll and pitch commands the same way, so the Extra's figures
do not move. Known limit, left as found: the derive's level run reads top
speeds about 10% under the airframes' documented ones (Slow Stick 7.29 vs
8.37 m/s), the same on the Extra, so the margin at the true top speed is
about 3.6 dB rather than 6.

## Storage

None new. The tune id is the stored setting; removed ids resolve to the
plane's default on load. No migration needed beyond that rule.

## What this does NOT do

- No plant change for Manual, Stabilised or the Extra; mode 3's arithmetic
  is untouched (the 3D lane owns it). Only `as3x_k` lines on the other
  tables and the Skyhunter's two Acro rates.
- No hover by mode: the hover table (`npm run hover:probe`, now every row of
  every plane) shows what each controller does; none is tuned to pass it.

## Checks

`as3x:derive` (CI), every `<plane>:stab` and `*:gates`, `war:legacy`,
`crash:core`, the settings/items/menucontrols/ways goldens and the
registry/airframes/pids pins, `bombshell:shell` and `p51:shell` (browser,
the default seat is Manual now), `training:check` (the unaided round flies
AS3X).
