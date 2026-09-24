# Skyhunter, stage 1: the aircraft and the model

The second fixed wing, and the first with a tail: every number the plant
is built from with its formula and source, the conventions, and the
check table with its bands. It follows `docs/WING-STAGE1.md`, which did
the same for the 1000 mm flying wing, and uses the same model with a
second parameter table. Where this file says "the wing" it means that
flying wing.

## The aircraft

The X-UAV (Sonicmodell, sold also as ZOHD) Skyhunter 1800: a pod
fuselage, a straight high mounted wing with ailerons, a pusher motor
behind the wing between two carbon tail booms, and an H tail, a
horizontal stabiliser with an elevator between two fins with rudders.
It is the long range FPV platform most pilots move to after a small
wing: slow, stable, and big enough to carry a 4S 5000 mAh pack and a
camera.

Where the sources disagree the numbers below are one aircraft: the
Skyhunter as flown in the Model Aviation review, 2.10 kg on a 4S 5000
mAh pack with a 950 kV 2820 class motor and an 11 x 5.5 prop. The
manufacturer's 3.0 to 3.5 kg is a maximum take off weight for long
range builds with big packs, not a flying weight, and a pilot flying
this simulator is flying the light build.

| Quantity | Value | How |
| --- | --- | --- |
| Span b | 1.800 m | manufacturer |
| Length | 1.22 m | Model Aviation review; the maker's 1.40 m is with the booms, which slide, run fully out |
| Wing area S | 0.360 m² | manufacturer, main wing only; the review's wing loading implies 0.39 m² on its own reference |
| Mean chord c = S/b | 0.200 m | derived |
| Aspect ratio AR = b²/S | 9.0 | derived |
| All-up mass m | 2.10 kg | Model Aviation review: 74 oz flying with a 4S 5000 mAh pack and a GoPro |
| Weight W = mg | 20.6 N | g = 9.81 |
| Wing loading W/S | 57.2 N/m² | derived; the review's 17.6 oz/ft² is 53.7 N/m² on its 0.39 m² |
| CG | 1/3 of the chord from the leading edge | manufacturer |
| CL max | 1.10 | ESTIMATED: a flat bottomed, cambered foam section of the Clark Y class, section cl max about 1.3 at Re 1.4e5 (V = 10 m/s, c = 0.2 m), times 0.85 for the three dimensional wing and the trim load on the tail; Anderson, Introduction to Flight, ch. 5 |
| Zero lift line | 4 deg below the body x axis | ESTIMATED: about 1.5 deg of wing incidence and the section's own zero lift angle of about minus 3.5 deg (Clark Y); it is what makes the pod fly level at cruise |
| CD0 | 0.033 | ESTIMATED by the equivalent skin friction method, Raymer, Aircraft Design, eq. 12.23: wetted area about 1.2 m² (wing 0.74, tail and fins 0.22, pod 0.19, booms 0.05), S_wet/S = 3.33, C_fe = 0.009 for low Reynolds number foam, plus 10 percent for the camera, servo horns and gaps |
| Oswald e | 0.80 | straight wing of AR 9 with a pod; Beard and McLain, Small Unmanned Aircraft, appendix E, the class value |
| Induced drag factor k = 1/(π e AR) | 0.0442 | derived |
| Wing lift slope a_w = 2π AR/(AR+2) | 5.14 /rad | the lifting line form the wing used |
| Motor, cells, kV | 2820 class, 4S, 950 kV | Model Aviation review; the manufacturer asks for 2820 to 3542 at about 900 kV |
| Prop | 11 x 5.5 in | Model Aviation review; the manufacturer's range is 11 x 7 to 12 x 6 |
| No-load rpm = kV x 14.8 V | 14,060 | derived |
| Pitch speed V_p = rpm/60 x pitch x 0.85 | 27.8 m/s | derived, 0.85 for slip, as the wing |
| Static thrust T_s | 27.0 N | ESTIMATED from two published figures: the review measured 669 W and 43.2 A static on this power system, and SunnySky's bench table for its X2820 on an 11 x 5.5 reads 2.65 kg at 603 W and 2.90 kg at 728 W, so 2.78 kg at 669 W |
| Thrust to weight | 1.31 | derived |
| Full throttle current | 43 A | Model Aviation review |
| Inertia Ixx, Iyy, Izz | 0.15, 0.14, 0.27 kg m² | ESTIMATED: the wing as a 0.45 kg bar of 1.8 m (0.12) plus the pod and tail; in pitch a 1.2 kg pod over 0.6 m (0.036), 0.16 kg of tail at 0.75 m (0.09) and the booms (0.011); Izz as Ixx plus Iyy for a flat airframe. The wing's own figure scaled by m b² gives Ixx 0.17, a cross check |
| Aileron, elevator, rudder travel | ±15, ±15, ±25 deg | ESTIMATED: the usual first setup for the class; the manufacturer publishes none |

The rudder is an addition to the stock aircraft. The kit and the PNP
listings give it three servos, two for the ailerons and one for the
elevator, and the reviewed aircraft flew three channel ("rudder control
absent but not missed" for sedate FPV). Many builders add a servo that
drives both rudders on the fins, and this model does, so the yaw stick
has a job; its throw and effectiveness are sized from the fins' own
area below, not from any published rudder. A pilot who leaves the yaw
stick centred in Manual flies the stock three channel aircraft.

### The tail

Measured from photographs of the aircraft against the published span
and length, so ESTIMATED to about 15 percent. The same figures drive
the 3D model: boom spacing 0.464 m, stabiliser 0.456 by 0.130 m, fins
0.19 m tall.

| Quantity | Value | How |
| --- | --- | --- |
| Horizontal tail span, area | 0.456 m, 0.0593 m² | photographs, chord 0.130 m |
| Tail arm l_h, wing to tail aerodynamic centre | 0.69 m | the 1.22 m length: wing leading edge 0.38 m aft of the nose, tail quarter chord 1.12 m |
| Tail aspect ratio, lift slope a_t | 3.51, 4.00 /rad | 2π AR/(AR+2) |
| Tail efficiency η | 0.9 | Nelson, Flight Stability and Automatic Control, ch. 2 |
| Downwash gradient dε/dα = 2 a_w/(π AR) | 0.364 | Nelson, eq. 2.22 |
| Horizontal tail volume V_H = S_h l_h/(S c) | 0.57 | derived; 0.35 to 0.6 is the usual range |
| Elevator effectiveness τ_e | 0.6 | Nelson, fig. 2.20, elevator 40 percent of the tail chord |
| Fins, two, total area S_v | 0.040 m² | photographs: 0.19 m tall, about 0.105 m mean chord each |
| Fin arm l_v, height above the CG z_v | 0.69 m, 0.10 m | photographs |
| Fin effective aspect ratio, lift slope a_v | 2.7, 3.61 /rad | each fin's 1.8, raised half again by the stabiliser as an end plate |
| Vertical tail volume V_V = S_v l_v/(S b) | 0.043 | derived |
| Rudder effectiveness τ_r | 0.5 | Nelson, fig. 2.20 |
| Aileron span, effectiveness τ_a | 0.45 to 0.85 m from the centreline, 0.40 | photograph, and Nelson fig. 2.20 at a fifth of the chord |
| Wing taper λ, effective dihedral Γ | 0.7, 3.5 deg | ESTIMATED: about 2 deg of geometric dihedral and 1.5 deg for the high wing, Raymer, ch. 16 |

## The coefficients

Written in the aero convention (x forward, y right, z down), as the wing's
are, and turned into the body frame in the plant exactly as the wing's
are. Every one is per radian.

| Coefficient | Value | Formula |
| --- | --- | --- |
| CLα, aircraft | 5.52 | a_w + a_t (S_h/S) η (1 − dε/dα), Nelson eq. 2.52 |
| Neutral point h_n | 0.503 c | 0.25 + V_H η (a_t/a_w)(1 − dε/dα) |
| Static margin | 0.17 | h_n − 1/3 |
| Cmα | −0.94 | −CLα x static margin |
| Cm0 | +0.071 | the value that trims at the cruise CL of 0.415 (15 m/s) with the elevator at zero, which is how a pilot trims it |
| Cmq | −14.1 | −2 η a_t V_H l_h/c, Nelson eq. 3.43 |
| Cmδe | 1.23 | η V_H a_t τ_e, positive with the trailing edge up |
| CLδe | −0.36 | −η (S_h/S) a_t τ_e: trailing edge up pushes the tail down |
| CYβ | −0.45 | −a_v S_v/S, and −0.05 for the pod |
| Cnβ | +0.140 | a_v V_V, less the pod's −1.3 Vol/(S b) = −0.014 (Nelson eq. 2.72) |
| Cnr | −0.126 | −2 a_v V_V l_v/b, and −CD0/4 for the wing |
| Clβ | −0.096 | −a_w Γ (1+2λ)/(6(1+λ)) for the dihedral, and −a_v (S_v/S)(z_v/b) for the fins |
| Clp | −0.78 | −a_w (1+3λ)/(12(1+λ)), strip theory |
| Clδa | +0.33 | 2 a_w τ_a c (y_2² − y_1²)/(2 S b), strip theory, Nelson eq. 5.95 |
| Clr | +CL/4 | Nelson, table 3.4, straight wing: the advancing wing lifts more in a yaw |
| Cnp | −CL/8 | the same: the down going wing's lift tilts forward, adverse yaw |
| Cnδa | −0.112 CL | 2 K CL Clδa with K = −0.17, Nelson, ch. 5: the adverse yaw of plain ailerons |
| Cnδr | −0.077 | −V_V a_v τ_r: trailing edge left, nose left |
| CYδr | +0.20 | a_v (S_v/S) τ_r |
| Clδr | +0.011 | CYδr z_v/b: the fins sit above the CG |

Strip theory makes both roll figures large, and it overstates both by
about the same factor, which is why they are taken together: the roll
rate is their ratio. The ratio is what the band below is about.

Motor torque reaction: ideal disc power at static full thrust,
T^1.5/sqrt(2 ρ A), is 362 W for 27 N through an 11 inch disc; at the
loaded 11,950 rpm that is 0.29 N m, so 0.0107 m per newton, the same
method as the wing. The electrical route, 80 percent of the measured
669 W at that rpm, gives 0.43 N m, which is the band's top. The prop
turns as the wing's does, so the reaction rolls the airframe left.

## Derived performance, the bands the plant must land in

Computed from the numbers above with L = W, T = D and the thrust model
below, by the script at the end of this file. The band is the derived
figure with room for the estimated inputs, and never wider than the
wing's bands were, in proportion.

| Check | Derived | Band |
| --- | --- | --- |
| S1 level speed at 65 percent throttle | 14.9 m/s | 13.0 to 17.0 |
| S2 stall speed, level, power off | 9.2 m/s | 8.6 to 10.4 |
| S3 glide ratio, power off, at 11 m/s | 13.0 (best 13.1 at 10.4 m/s) | 11.5 to 14.5 |
| S4 top speed, level, full throttle | 23.5 m/s | 21.5 to 26.5 |
| S5 roll rate, full aileron at 20 m/s | 141 deg/s, pb/2V = 0.11 | 100 to 190 |
| S6 turn radius at 60 deg bank | V²/(g tan 60°) | within 15 percent of the formula at the speed flown |
| S7 climb rate, full throttle, best | 8.0 m/s at 12.5 m/s | 5.5 to 9.5 |
| S8 hand throw at 11 m/s, 60 percent throttle, for two seconds the up stick that trims 11 m/s | above 1 m and faster than 10 m/s after 3 s | pass or fail |
| S9 throttle chop from cruise | glides, pitch within ±30 deg for 3 s | pass or fail |
| S10 phugoid period at 15 m/s, sticks centred | 9.8 s, ζ 0.29: the phugoid root of the four state longitudinal model (Nelson, ch. 4) from the derivatives above | 8.0 to 11.5 |
| S11 full rudder at cruise, wings held level with aileron: steady sideslip | −Cnδr δr/Cnβ = 13.7 deg, nose to the rudder's side | 9 to 20 |
| S12 full rudder at cruise, ailerons centred: peak yaw rate | 68 deg/s: the Dutch roll step, ω_n = sqrt(q S b Cnβ/Izz) = 6.8 rad/s, ζ = 0.24 | 45 to 100 |
| S13 full rudder at cruise, ailerons centred: bank after 2 s | the rudder's way; steady roll rate 22 deg/s once the sideslip is built, from Clβ β against Clp | 15 to 80 deg, and the sign |
| S14 prop torque, static full throttle | 0.29 N m, rolling left | 0.25 to 0.45 N m, and the sign |
| S15 the wing and the five inch unmoved | their recorded trace hashes | identical |
| S16 Node and Chrome agree on a Skyhunter trace | SHA-256 | identical |

S10 to S13 have no counterpart in the wing's table: a flying wing has no
tail to give it a phugoid worth timing and no rudder. S13 is the
dihedral effect, the thing that lets a three channel trainer turn on
rudder alone, and it is gated on its sign as much as its size.

## What the first flights corrected

Two things this derivation had wrong, found by flying the plant headless
before any band was written into a check:

- S10 was first derived with Lanchester's π sqrt(2) V/g, 6.8 s, and a
  band of 5.5 to 8.5. The plant flew 9.2 s. Lanchester's figure assumes
  the aircraft keeps its angle of attack through the cycle and that
  thrust does not change with speed; with a tail volume of 0.57 the
  pitch damping is large, and this motor's thrust falls steeply with
  speed. The four state longitudinal model built from the same
  derivatives, trimmed at 15 m/s and linearised (u, w, q, θ; Nelson,
  ch. 4), puts the phugoid at 9.8 s with a damping ratio of 0.29 and
  the short period at 0.77 s, ζ 0.69. The band is that figure with the
  room the estimated inputs need. The gate also measures against the
  speed the aircraft settles at rather than the window's mean, since a
  mode damped this well has only two cycles worth counting in thirty
  seconds.
- S8's hand, an eighth of up for two seconds, was the wing's. The
  Skyhunter trims hands off at 15 m/s, and at the 11 m/s throw it needs
  2.9 deg of up elevator to hold its height, which is 0.28 of stick
  through the expo; an eighth sank it 3 m. The check now holds the
  stick that trims the throw speed, which is what a pilot's thumb does
  on a launch, and the band is unchanged. It passes with 0.1 m to spare,
  which is the honest picture of a Skyhunter thrown at 1.2 times its
  stall speed: it does not climb away until it has accelerated.

## Conventions

The wing's, unchanged: world right handed, Z up; body X forward, Y
left, Z up; SI; 1000 Hz fixed step; the state block's twenty doubles
with the motor in RPM slot 0 and zeros in slots 1 to 3; α and β from
the body frame wind as in `docs/WING-STAGE1.md`. The only addition is
the zero lift line: the aero works on α + α_0, where α_0 is 4 deg here
and zero for the wing, and the post stall flat plate turns with it.

Sticks: roll rc[0] to the ailerons, pitch rc[1] to the elevator, yaw
rc[2] to the rudder, throttle rc[3] to the motor, each with the wing's
expo of 0.3 and its own travel. Yaw stick positive is nose right, the
channel convention in `src/native/sim_abi.h`, so it moves the rudder
trailing edge right, which is a negative rudder angle below.

Surface angles, radians, for the renderer through
`sim_plane_surfaces(out[4])`: left aileron, right aileron, elevator,
rudder. Ailerons and elevator positive trailing edge up; rudder positive
trailing edge to the left, which yaws the nose left. Both rudders move
together and report as one. Full right roll reads the right aileron up
(positive) and the left down (negative).

## The model

The wing's model, term by term, with its coefficients from the table
above and these terms added, all of them zero on the wing:

- Side force gains CYδr δr, roll gains Clr r b/2V and Clδr δr, yaw gains
  Cnp p b/2V, Cnδa δa and Cnδr δr. Clr, Cnp and Cnδa are written per
  unit CL and multiplied by the CL of the step, so they grow at low
  speed as they do on a real aircraft.
- The zero lift line above.
- A conventional mix: ailerons are ±δa on the two wing surfaces, the
  elevator is its own surface and δe is it; the wing keeps its elevons,
  δe ± δa on each clipped at 25 deg.

Motor: the wing's thrust model with the Skyhunter's T_s and V_p, thrust
T = T_s d² (1 − V/(V_p d)) clipped at zero, duty floored at 0.02, rpm
0.85 d times the no load figure, current 43 d² A.

Ground: the wing's contact path. The hull is its eight corner box,
1.22 m long, 1.8 m wide, from 0.07 m under the CG, which is the pod's
belly under the high wing, to 0.08 m over it, between the wing's top
and the fins' tops, for an aircraft on its back. The box is centred on
the CG while the aircraft is not (nose 0.45 m ahead, tail 0.77 m
behind), so the nose corner stands 0.16 m proud of the real nose and
the tail corner 0.16 m short of the real tail; an offset box would need
the contact code to learn one, which it has not.

## The stabiliser, and what yaw does

The wing's stabiliser and acro, from `docs/WING-STAGE1.md`, with the
Skyhunter's own numbers. Stabilised asks for up to 60 deg of bank and 30
deg of pitch about a 2 deg trim, held with 2.0 stick per rad and 0.2 per
rad/s in roll and the wing's 5.0 and 0.5 in pitch: the roll gains are
the wing's scaled by the two aircraft's roll authority, since the
Skyhunter gets about half the wing's roll rate per degree of aileron.
Acro asks for up to 120 deg/s of roll and 80 deg/s of pitch, about what
the ailerons and elevator give at cruise, with 5.0, 0.4 and 0.5 stick in
roll (error, rate error, feedforward), 6.0 of integral, and the wing's
pitch loop.

Yaw is a decision the wing never had to make. In every mode the yaw
stick is the rudder, through its travel and expo. In Stabilised and Acro
a turn coordinator adds rudder on top: one stick per rad/s of body yaw
rate away from the coordinated rate, g sin(bank) cos(pitch)/V, which is
the rate a banked aircraft with the ball centred yaws at. That is what
ArduPlane's coordination does and what a pilot's feet do. It is not a
yaw rate or heading hold, on purpose: a rudder commands sideslip, not a
rate, and an aeroplane turns by banking, so a loop that held heading
against the stick would fight every turn the roll loop flies. With the
coordinator the sideslip in a held 60 deg bank reads 1 deg; the pilot
can still slip, skid or hold a knife edge with the stick, and Acro's
target turns its heading with the aircraft exactly as the wing's does,
so a rudder input never shows up as roll or pitch error. Manual is the
bare aircraft: the stock three channel Skyhunter if the yaw stick stays
centred.

## The script that made the numbers

```
rho=1.225 g=9.81 b=1.8 S=0.36 m=2.10 CLmax=1.10 CD0=0.033 e=0.80
aw=2 pi AR/(AR+2); CLa=aw + at (Sh/S) eta (1 - 2 aw/(pi AR))
Vs=sqrt(2W/(rho S CLmax)); CLopt=sqrt(CD0/k); LDmax=CLopt/(2 CD0)
T(V,d)=max(0, Ts d^2 (1 - V/(Vp d))); D(V)=q S (CD0 + k CL^2) with CL=W/(q S)
level speed at duty d: bisect T(V,d)=D(V); climb=(T-D)V/W
roll: pb/2V = Clda da/(-Clp); sideslip: -Cndr dr/Cnb
Dutch roll: wn=sqrt(q S b Cnb/Izz), zeta from Cnr and CYb, peak r of the step
phugoid: trim level at 15 m/s for alpha, delta_e and duty, finite difference
the four state (u, w, q, theta) equations, roots of the characteristic
polynomial
```
