# Fixed wing, stage 1: the aircraft and the model

The reference aircraft, every number the plant is built from with its
formula and source, the conventions, and the check table with its bands.
`docs/WING-PLAN.md` is the plan; `docs/WING-PROGRESS.md` the state.

## The aircraft

A 1000 mm span flying wing of the ZOHD Dart XL and AR Wing 900 class:
the wing most FPV pilots start on, pusher motor, elevons, winglets, hand
launched, belly landed. Where the two published aircraft disagree the
numbers below are the Dart XL's. Where a number is estimated it says so.

| Quantity | Value | How |
| --- | --- | --- |
| Span b | 1.000 m | manufacturer |
| Wing area S | 0.220 m² | manufacturer |
| Mean chord c = S/b | 0.220 m | derived |
| Aspect ratio AR = b²/S | 4.55 | derived |
| All-up mass m | 0.650 kg | manufacturer's 0.45 kg airframe with a 4S 2200 mAh pack and FPV gear |
| Weight W = mg | 6.38 N | g = 9.81 |
| Wing loading W/S | 29.0 N/m² | derived |
| CL max | 0.90 | a reflexed flying wing section; Anderson, Introduction to Flight, ch. 5, and the class's stall behaviour |
| CD0 | 0.030 | small UAV flying wing, Beard and McLain, Small Unmanned Aircraft, appendix E |
| Oswald e | 0.80 | same |
| Induced drag factor k = 1/(π e AR) | 0.0875 | derived |
| Lift slope CLα = 2π AR/(AR+2) | 4.36 /rad | Helmbold for low AR |
| Stall angle α_s = CL max / CLα | 11.8 deg | derived |
| Motor, cells, kV | 2216, 4S, 1400 kV | manufacturer |
| Prop | 6 x 4 in | manufacturer |
| No-load rpm = kV x 14.8 V | 20,720 | derived |
| Pitch speed V_p = rpm/60 x pitch x 0.85 | 29.8 m/s | derived, 0.85 for slip |
| Static thrust T_s | 11.5 N | manufacturer's bench figure for the motor and prop on 4S |
| Thrust to weight | 1.80 | derived |
| Inertia Ixx, Iyy, Izz | 0.016, 0.006, 0.020 kg m² | ESTIMATED: the mass sits in the centre third of the span, a flat plate of that width and the chord |
| Elevon travel | ±25 deg | manufacturer |

## Derived performance, the bands the plant must land in

Computed from the numbers above with a level flight balance L = W,
T = D and the thrust model below, by the script recorded at the end of
this file. The band is the derived figure with room for the estimated
inputs, and never wider.

| Check | Derived | Band |
| --- | --- | --- |
| W1 level speed at 65 percent throttle | 15.2 m/s | 13.5 to 17.5 |
| W2 stall speed, level, power off | 7.25 m/s | 6.8 to 8.2 |
| W3 glide ratio, power off, best glide | 9.76 at 9.0 m/s | 8.5 to 11 |
| W4 top speed, level, full throttle | 23.8 m/s | 22 to 27 |
| W5 roll rate, full elevon at 20 m/s | 250 deg/s | 180 to 300 |
| W6 turn radius at 60 deg bank | V²/(g tan 60°), 23.5 m at 20 m/s | within 15 percent of the formula at the speed flown |
| W7 climb rate, full throttle, best | 11.5 m/s at 12.5 m/s | 8 to 13 |
| W8 hand throw at 10 m/s, 60 percent throttle, an eighth of up stick for two seconds | above 1 m and faster than 9 m/s after 3 s | pass or fail |
| W9 throttle chop from cruise | glides, pitch stays within ±30 deg for 3 s | pass or fail |
| W10 the five inch unmoved | verify check 2 hash | identical |
| W11 Node and Chrome agree on a wing trace | SHA-256 | identical |

## What the first flights corrected

Three things the derivation had wrong, found by flying the plant headless
and reading its own numbers back through `sim_wing_debug`:

- Sideslip was defined with the wind from the left positive, the opposite
  of the convention every coefficient is written in, so the nose turned
  away from the wind and the wing departed in yaw the moment it banked.
- The elevon lift term had the wrong sign for a flying wing.
- A throw at 8 m/s with the sticks neutral sinks before it accelerates,
  as a real one does below its trim speed; the check now throws harder
  and holds a little up, which is what a hand does.

## Conventions

The quad's, unchanged: world right handed, Z up; body X forward, Y left,
Z up; SI throughout; 1000 Hz fixed step; the state block's twenty
doubles with the motor in RPM slot 0 and zeros in slots 1 to 3. The
relative wind in the body frame is (u, v, w). Angle of attack
α = atan2(-w, u), positive with the nose above the wind. Sideslip
β = atan2(−v, sqrt(u² + w²)), positive with the wind from the right, the aero
convention. The coefficients are all in that convention, y right and z down,
so in this body frame, y left and z up, the pitch and yaw rates change sign
going in and the side force, pitch moment and yaw moment change sign coming
out. Roll and angle of attack are the same in both.
Dynamic pressure q = ½ ρ V², ρ = 1.225 kg/m³, V = |(u, v, w)|.

## The model

Forces in the wind axes, then rotated into the body frame:

- Lift L = q S CL(α), along the body Z axis rotated by α, positive up.
- Drag D = q S CD(α, β), along the relative wind, opposing it.
- Side force Y = q S CYβ β, CYβ = -0.30 /rad.
- Thrust T along body X from the motor model.
- Weight in the world frame.

CL below the stall is CLα α plus the elevon lift CLδe δe with
CLδe = −0.35 /rad: a nose-up command is trailing edge up, which sheds lift
on a flying wing. Above it CL blends to a flat plate's 2 sin α cos α over
a smoothstep of ±3 deg about α_s, and CD to 2 sin² α over the same
blend, on top of CD0 + k CL². The blend is a cubic smoothstep rather than
the sigmoid in Beard and McLain, so the libm needs no exponential.

Moments, with p, q, r the body rates and the rate terms made
dimensionless by b/2V and c/2V, V floored at 1 m/s:

- Roll: q S b [ Clβ β + Clp p b/2V + Clδa δa ], Clβ = -0.05, Clp = -0.40, Clδa = 0.10.
- Pitch: q S c [ Cm0 + Cmα α + Cmq q c/2V + Cmδe δe ], Cm0 = +0.02 (reflex), Cmα = -0.30, Cmq = -4.0, Cmδe = -0.60.
- Yaw: q S b [ Cnβ β + Cnr r b/2V ], Cnβ = 0.05 (winglets), Cnr = -0.10.
- Motor torque reaction: a roll moment of 0.009 m times thrust, the
  sign of the prop's rotation. Ideal disc power at static full thrust,
  T^1.5 / sqrt(2 rho A), is 184 W for 11.5 N through a 6 inch disc; at
  17,600 rpm that is 0.10 N m. (The first figure was 0.02 m, which rolled
  a thrown wing past sixty degrees with the sticks centred.)

Elevons: the right and left surfaces are δe ± δa, each clipped to
±25 deg, from the sticks with a little expo, computed in C. The pitch
stick reaches 12 deg of elevator and the roll stick 25 deg of aileron,
the dual rates a real wing is set up with: with a seven percent static
margin, 25 deg of up trims far past the stall, and a sixth of that stick
at throw speed pitched the plant to sixty degrees and dropped a wing. Yaw stick does nothing; a flying wing has no
rudder, and the note in Settings says so.

Stabiliser: the wing's one flight controller, in C in the plant, switched
on by the Stabilised tune and off by Manual. Betaflight has no wing mode,
so this is neither a port of it nor a reimplementation: it is the attitude
loop the harness pilot flies the gates with. Roll stick asks for a bank up
to 60 deg and pitch stick for a pitch up to 30 deg about a 2 deg nose up
trim; each is held by a proportional term on the attitude error and a
damping term on the body rate (1.2 and 0.12 stick per rad and rad/s in
roll, 5.0 and 0.5 in pitch through the 12 deg throw), then goes through
the same throws and expo as a hand. Centred sticks fly level. The gates
above are flown with it off; scripts/wing-stab-selftest.js checks it on.

Low throttle pitch down, on every fixed wing's Stabilised: under the
cruise throttle the pitch target lowers in proportion to the throttle
closed, by `stab_pitch_down` at a closed stick, which is ArduPilot's
`adjust_nav_pitch_throttle` (ArduPlane/Attitude.cpp): under TRIM_THROTTLE,
`nav_pitch_cd -= STAB_PITCH_DOWN * (TRIM_THROTTLE - throttle) /
TRIM_THROTTLE`, whose parameter "Helps to keep airspeed higher in glides
or landing approaches and prevents accidental stalls" (Parameters.cpp; 0
to 15 deg, 2 by default). Without it a closed throttle held the 2 deg
trim pitch, bled the speed and stalled the slower aircraft: the
Bombshell reached 15.5 deg of alpha, the Slow Stick 20.2 and the float
Cub 26.0. Here each aircraft's two numbers are its own, from
`npm run stab:glide`, which reads its table and solves, with the
elevator neutral, the flaps up and the plant's own lift curve, the power
off glide and the stick that flies it level. `stab_trim_throttle` is that
stick, ArduPilot's TRIM_THROTTLE; `stab_pitch_down` is the trim pitch
less the glide's pitch, so a closed throttle asks for the attitude the
airframe glides at by itself. At or over the cruise throttle nothing
changes; between it and closed the target moves linearly, as
ArduPilot's does. `npm run stab:chop` closes each aircraft's throttle
from cruise in Stabilised, sticks centred, for 15 s: it must never reach
its stall's alpha, and its mean sink over the last 10 s must be within
the Bombshell's S3 proportion, 0.89 to 1.12, of its derived glide's.

| Aircraft | Glide pitch, deg | Pitch down, deg | Cruise stick | Derived sink, m/s | Stabilised chop before: sink, max alpha | After |
| --- | --- | --- | --- | --- | --- | --- |
| Wing 1000 | −3.51 | 5.51 | 0.553 | 1.621 | 1.009, 6.3 | 1.620, 3.8 |
| Skyhunter | −5.25 | 7.25 | 0.652 | 1.450 | 0.842, 7.7 | 1.468, 4.7 |
| Cub | −6.54 | 8.54 | 0.687 | 1.517 | 1.012, 10.1 | 1.523, 6.2 |
| Radian | −0.56 | 0.56 | 0.402 | 0.407 | 0.401, 7.8 | 0.407, 7.5 |
| Bramor | +2.82 | 0 | 0.663 | 1.160 | 1.045, 6.7 | 1.045, 6.7 |
| Slow Stick | −4.52 | 6.52 | 0.739 | 0.667 | 1.376, 20.2 | 0.667, 9.1 |
| Timber | −7.56 | 9.56 | 0.562 | 1.673 | 0.973, 9.7 | 1.683, 5.4 |
| Timber floats | −9.75 | 11.75 | 0.666 | 2.302 | 1.185, 10.4 | 2.304, 5.1 |
| Cub floats | −8.85 | 10.85 | 0.858 | 2.144 | 4.511, 26.0 | 2.142, 5.7 |
| Bombshell | −4.08 | 6.08 | 0.732 | 0.918 | 1.223, 15.5 | 0.917, 8.1 |

The Bramor's glide is nose higher than its 2 deg trim, so a closed
throttle already asks for less than its glide and it gets no pitch down:
ArduPilot's parameter only pitches down. The four that did not stall
before, the Wing, the Skyhunter, the Cub and the Timber, held 2 deg with
the elevator up and so glided slower than their own trim, at 6 to 10 deg
of alpha and less sink; closed, they now fly the glide they trim at
hands off in Manual, faster, further from the stall and sinking more.

Acro: the stabiliser's second mode, the Acro tune. Sticks ask for a body
rate, up to 200 deg/s of roll and 100 deg/s of nose up pitch with 0.3
expo past the same 4 percent deadband, and a target attitude advances by
that rate every step. The loop flies the wing onto the target: 3.0 stick
per rad of roll error, 0.25 per rad/s of rate error and 0.30 per rad/s
of feedforward; 5.0, 0.5 and 0.40 in pitch; an integral of 4.0 in roll
and 8.0 in pitch per rad s, clamped at 0.3 stick. Centred sticks stop
the target, so the wing holds the attitude it is in, at any angle and
inverted, with nothing to drift. Yaw is not held, since there is no
rudder: the target turns its heading with the wing's own turn about the
world vertical, weighted by how level the nose is so a vertical line
keeps its roll lock, and only roll and pitch error is flown. The error
is clamped at 5 deg, which keeps the target from running ahead of a
wing rolling at full rate: at 20 deg the wing stopped 13 deg past where
the stick was centred, at 5 deg about 4. The integral is what holds a
banked wing's bank against its own sideslip roll, which a proportional
term alone let creep 5 deg in 3 s.

Motor: duty d from the throttle stick, floored at 0.02 so the prop never
stops on screen, thrust T = T_s d² (1 − V / (V_p d)) clipped at zero, rpm
for the renderer and the sound = 0.85 d rpm_no_load.

Integration: semi-implicit Euler at 1 ms as the quad, quaternion
increment through the fixed sin and cos, renormalised each step.

Ground: a belly hull of five points, nose, tail, both wingtips and the
belly centre, through the existing contact path with a friction of 0.6
and no bounce, so a landing skids to a stop. A throw is an initial
velocity along the body X axis at the given speed, level, from a
standing start at 1.5 m; there is no launch stand.

## The script that made the numbers

```
rho=1.225 g=9.81 b=1.0 S=0.22 m=0.65 CLmax=0.90 CD0=0.030 e=0.80
k=1/(pi e AR); Vs=sqrt(2W/(rho S CLmax)); CLopt=sqrt(CD0/k); LDmax=CLopt/(2 CD0)
T(V,d)=max(0, Ts d^2 (1 - V/(Vp d))); D(V)=q S (CD0 + k CL^2) with CL=W/(q S)
level speed at duty d: bisect T(V,d)=D(V); climb=(T-D)V/W; roll p=(Clda δ)/(-Clp)(2V/b)
```
