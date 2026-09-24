# Cub, stage 1: the aircraft, the model and the gear

The third fixed wing, and the first that stands on its own wheels: every
number the plant is built from with its formula and source, the landing
gear and why it is the model it is, and the check table with its bands.
It follows `docs/SKYHUNTER-STAGE1.md`, which did the same for the
Skyhunter, and uses the same plant, `src/native/plant_wing.c`, with a
third parameter table. Where this file says "the Skyhunter" it means that
aircraft and that document.

## The aircraft

The FMS Piper J-3 Cub 1400 mm (V3 and V4, the same airframe; the V4 adds
metal sprung gear): a foam scale model of the 1938 two seat trainer at
about 1:7.7. A high, strut braced, constant chord wing with ailerons, a
tractor motor in the nose behind a scale cowl, a conventional tail with an
elevator and a rudder, two main wheels on sprung legs and a tailwheel
steered from the rudder. It is the model most pilots learn to take off and
land a taildragger on.

| Quantity | Value | How |
| --- | --- | --- |
| Span b | 1.400 m | FMS manual, 1400mm J-3 V4, "Specifications" |
| Length | 0.900 m | FMS manual |
| Wing area S | 0.280 m² | FMS manual, 28 dm²; some retail listings print 25.1 dm², but the manual's own wing loading, 47 g/dm² at 1320 g, is 28 dm², and so is the full size J-3's aspect ratio, 7.0, at this span |
| Mean chord c = S/b | 0.200 m | derived; the three view below measures 0.198 m |
| Aspect ratio AR = b²/S | 7.0 | derived |
| All-up mass m | 1.32 kg | FMS manual, "Flying weight: ~1320g", on the recommended 3S 2200 mAh pack |
| Weight W = mg | 12.95 N | g = 9.81 |
| Wing loading W/S | 46.2 N/m² | derived; the manual's 47 g/dm² is 46.1 |
| CG | 55 to 65 mm behind the leading edge, 60 mm used, h = 0.30 c | FMS manual, "Center of gravity" |
| CL max | 1.15 | ESTIMATED: a flat bottomed section of the USA 35B class, the full size Cub's, section cl max about 1.3 at Re 1.1e5 (8 m/s, 0.2 m chord) for a moulded foam copy, times 0.9 for the rectangular wing and the tail's trim load; Anderson, Introduction to Flight, ch. 5 |
| Zero lift line | 5 deg below the body x axis | ESTIMATED: the section's zero lift angle of about minus 3.5 deg and about 1.5 deg of wing incidence, the full size Cub's |
| CD0 | 0.050 | ESTIMATED by the equivalent skin friction method, Raymer, Aircraft Design, eq. 12.23: wetted area about 1.12 m² (wing 0.57, fuselage 0.40, tail 0.15), S_wet/S = 4.0, C_fe = 0.009, is 0.036; the wheels and legs add 0.004 on their frontal area, the four wing struts and the tail wires 0.008 at a strut's C_D of about 0.3, the dummy cylinder heads 0.002. A Cub is draggy, and it is meant to be |
| Oswald e | 0.75 | a strut braced rectangular wing of AR 7 with a boxy fuselage; lower than the Skyhunter's 0.80 for the struts and the fuselage junction |
| Induced drag factor k = 1/(π e AR) | 0.0606 | derived |
| Wing lift slope a_w = 2π AR/(AR+2) | 4.89 /rad | the lifting line form both other aircraft use |
| Motor, cells, kV | 3536, 3S, 850 kV | FMS manual, "Motor size: 3536-KV850", and the recommended 11.1 V pack |
| Prop | 11 x 7 in, two blade | the kit's prop, AMain Hobbies' listing of FMM106 |
| No-load rpm = kV x 11.1 V | 9,435 | derived |
| Pitch speed V_p = rpm/60 x pitch x 0.85 | 23.8 m/s | derived, 0.85 for slip, as both other aircraft |
| Static thrust T_s | 13.5 N | the published bench figure for a 3536 850 kV outrunner on 3S with an 11 x 7: 1380 g at 27 A and 295 W (HobbyKing's test table for its 3536 850 kV) |
| Thrust to weight | 1.04 | derived; "plenty of power", the manual's and every review's word |
| Full throttle current | 27 A | the same bench figure; the kit's ESC is a 40 A |
| Inertia Ixx, Iyy, Izz | 0.060, 0.055, 0.100 kg m² | ESTIMATED: the wing as a 0.30 kg bar of 1.4 m (0.049) and the rest (0.006); in pitch the motor 0.15 kg at 0.25 m, the pack 0.19 kg at 0.12 m, the tail 0.06 kg at 0.58 m and the fuselage shell 0.25 kg spread over 0.9 m (0.055 together); Izz a little under Ixx plus Iyy. The wing's own figure scaled by m b² gives Ixx 0.064, a cross check |
| Aileron, elevator, rudder travel | ±18, ±15, ±15 deg | the manual's high rates, 16, 16 and 18 mm, over the surfaces' chords at the horn, about 50, 60 and 70 mm (three view): asin(16/50), asin(16/60), asin(18/70). ESTIMATED to a couple of degrees, since the manual gives millimetres |

No published figure gives the model's speeds. The full size J-3's are
87 mph top and 38 mph landing (Piper, and the three view below), which
at the model's scale, by Froude, are 14 m/s and 6.1 m/s; the model is
lighter per area than a Froude copy would be and faster at the top for
its power, so the numbers below are derived from the model's own figures
and the full size ones are only a sanity bracket. What pilots report is
qualitative and the bands honour it: slow and docile, short take offs
("accelerates quickly"), a clean stall with a wing drop if it is
provoked, needs rudder in the turns, and tracks straight on the ground
with a little steering on the rudder during the take off roll.

### The geometry

From the J-3 three view drawn by Paolo Severin after Paul Matt's
Historical Aviation Album and the J-3 service manual (Toni Clark, 1:10),
measured in pixels and scaled to the 1.4 m span, so ESTIMATED to about 10
percent. It scales the length to 0.89 m against FMS's 0.90, and the chord
to 0.198 m against 0.200.

| Quantity | Value | How |
| --- | --- | --- |
| Horizontal tail span, area | 0.38 m, 0.0470 m² | three view, integrated planform |
| Tail arm l_h, wing to tail aerodynamic centre | 0.517 m | wing quarter chord to tail quarter chord |
| Tail aspect ratio, lift slope a_t | 3.07, 3.81 /rad | 2π AR/(AR+2) |
| Tail efficiency η | 0.9 | Nelson, Flight Stability and Automatic Control, ch. 2 |
| Downwash gradient dε/dα = 2 a_w/(π AR) | 0.444 | Nelson, eq. 2.22 |
| Horizontal tail volume V_H = S_h l_h/(S c) | 0.43 | derived |
| Elevator effectiveness τ_e | 0.6 | Nelson, fig. 2.20, elevator about 40 percent of the tail chord |
| Fin and rudder, area S_v | 0.020 m² | three view: 0.127 m tall above the fuselage, 0.177 m root and 0.09 m tip chord, and the rudder below the stabiliser |
| Fin arm l_v, height above the CG z_v | 0.567 m, 0.104 m | three view |
| Fin effective aspect ratio, lift slope a_v | 1.5, 2.69 /rad | its own 1.0, raised half again by the stabiliser and the fuselage as end plates |
| Vertical tail volume V_V = S_v l_v/(S b) | 0.029 | derived; the Cub's small fin is why it wants rudder |
| Rudder effectiveness τ_r | 0.55 | Nelson, fig. 2.20, the rudder about half the vertical tail's chord |
| Fuselage volume | 0.0091 m³ | 0.9 m by 0.12 by 0.14 with a 0.6 fill |
| Aileron span, effectiveness τ_a | 0.28 to 0.66 m from the centreline, 0.45 | three view, and Nelson fig. 2.20 at a quarter of the chord |
| Wing taper λ, effective dihedral Γ | 1.0, 3.5 deg | a constant chord wing; about 1.5 deg of geometric dihedral and 2 deg for the high wing, Raymer ch. 16. ESTIMATED |
| Thrust line | 7 mm under the CG, 0.25 m ahead | three view: the spinner's centre against the CG at 60 mm behind the leading edge and about the fuselage's mid height |

## The coefficients

The aero convention (x forward, y right, z down), as the other two, turned
into the body frame in the plant exactly as theirs are. Per radian.

| Coefficient | Value | Formula |
| --- | --- | --- |
| CLα, aircraft | 5.21 | a_w + a_t (S_h/S) η (1 − dε/dα), Nelson eq. 2.52 |
| Neutral point h_n | 0.419 c | 0.25 + V_H η (a_t/a_w)(1 − dε/dα) |
| Static margin | 0.12 | h_n − 0.30 |
| Cmα | −0.62 | −CLα x static margin |
| Cm0 | +0.062 | the value that trims at the CL of 12 m/s, 0.524, with the elevator at zero |
| Cmq | −7.7 | −2 η a_t V_H l_h/c, Nelson eq. 3.43 |
| Cmδe | 0.89 | η V_H a_t τ_e, positive with the trailing edge up |
| CLδe | −0.345 | −η (S_h/S) a_t τ_e |
| CYβ | −0.29 | −a_v S_v/S, and −0.10 for the fuselage's side area, 0.11 m², about twice the Skyhunter pod's |
| Cnβ | +0.048 | a_v V_V, less the fuselage's −1.3 Vol/(S b) = −0.030 (Nelson eq. 2.72) |
| Cnr | −0.076 | −2 a_v V_V l_v/b, and −CD0/4 for the wing |
| Clβ | −0.089 | −a_w Γ (1+2λ)/(6(1+λ)) for the dihedral, and −a_v (S_v/S)(z_v/b) for the fin |
| Clp | −0.81 | −a_w (1+3λ)/(12(1+λ)), strip theory |
| Clδa | +0.40 | 2 a_w τ_a c (y_2² − y_1²)/(2 S b), strip theory, Nelson eq. 5.95 |
| Clr | +CL/4 | Nelson, table 3.4, straight wing |
| Cnp | −CL/8 | the same |
| Cnδa | −0.136 CL | 2 K CL Clδa with K = −0.17, Nelson ch. 5: plain ailerons' adverse yaw, which the Cub is known for |
| Cnδr | −0.043 | −V_V a_v τ_r |
| CYδr | +0.106 | a_v (S_v/S) τ_r |
| Clδr | +0.008 | CYδr z_v/b |

### The prop, which is in front now

Both other aircraft push. Three things change with a tractor, and the
plant gains a term for the two that are worth one:

- **Torque.** The prop turns clockwise seen from the cockpit, as nearly
  every model motor does, so the airframe is rolled to the left, the same
  sign the pushers have. Ideal disc power at static full thrust,
  T^1.5/sqrt(2 ρ A), is 128 W for 13.5 N through an 11 inch disc; at the
  loaded 8,020 rpm that is 0.152 N m, 0.0113 m per newton. The electrical
  route, 80 percent of the bench's 295 W at that rpm, gives 0.28 N m,
  the band's top, as for the Skyhunter. On the ground it loads the left
  wheel and swings the nose left on the take off roll, which the gear
  below produces with no term of its own.
- **Thrust line.** The spinner sits 7 mm under the CG, so power pitches
  the nose up by thrust x 0.007: 0.095 N m at full static thrust. A new
  table entry, `thrust_z`, zero for the other two.
- **P factor.** At an angle of attack the descending blade, the right one
  for a clockwise prop, meets the air harder than the rising one, and the
  thrust moves off the axis toward it. Blade element theory at 0.75 R: the
  in-plane speed V sin α changes each blade's speed by ±V sin α sin ψ,
  which changes its thrust both through its dynamic pressure and through
  its angle of attack, and integrated round the disc the thrust's yaw arm
  is κ V sin α/Ω with κ = 1 + φ/(2 α_b), where φ is the inflow angle and
  α_b the blade's angle of attack. In a climb at 10 m/s, φ = 0.15 and α_b =
  0.12 at 0.75 R, so κ = 1.6; static it is 1.35. V sin α is the body
  normal speed −w, so the term is N = 1.6 T (−w)/Ω with no trigonometry,
  and it is zero on the ground at rest and zero on the other two.
  It is small on a model: at full throttle and 9 m/s in a climb, −w is 0.57
  m/s and N is 0.009 N m nose left, a twentieth of what full rudder gives
  at that speed. That is the honest size of it; what swings a model
  taildragger on its take off roll is the torque on the wheels, and in the
  air it is the slipstream's swirl on the fin, below.
- **Not modelled, and why.** The slipstream: it speeds the air over the
  tail at low speed and high power, which is what lets a pilot raise the
  tail early and steer with the rudder at walking pace, and its swirl
  strikes the fin from the left. Both want a propwash model the plant does
  not have; the tailwheel does the low speed steering here, and the swirl
  is what the kit's built in right thrust is for, so leaving both out
  leaves a trimmed aircraft trimmed. Gyroscopic precession: the prop and
  bell hold about 0.22 N m s at full rpm, so a 0.5 rad/s pitch rate as the
  tail comes up yaws the nose left by 0.11 N m for the fraction of a
  second it takes; left out for now, and the first thing to add if the
  take off feels too tame.

## Derived performance, the bands the plant must land in

Computed from the numbers above with L = W, T = D and the thrust model
below, by the script at the end of this file. The band is the derived
figure with room for the estimated inputs, and in proportion never wider
than the Skyhunter's.

| Check | Derived | Band |
| --- | --- | --- |
| C1 level speed at 75 percent throttle | 13.4 m/s | 11.5 to 15.5 |
| C2 stall speed, level, power off | 8.1 m/s | 7.6 to 9.2 |
| C3 glide ratio, power off, at 10 m/s | 8.9 (best 9.1 at 9.1 m/s) | 7.9 to 10.0 |
| C4 top speed, level, full throttle | 18.4 m/s | 16.8 to 20.7 |
| C5 roll rate, full aileron, as pb/2V | 0.155: 152 deg/s at 12 m/s | 0.11 to 0.21 |
| C6 turn radius at 60 deg bank | V²/(g tan 60°) | within 15 percent of the formula at the speed flown |
| C7 climb rate, full throttle, best | 4.9 m/s at 10.1 m/s | 3.4 to 5.8 |
| C8 hand throw at 10 m/s, 70 percent throttle, for two seconds the up stick that trims 10 m/s | above 1 m and faster than 9 m/s after 3 s | pass or fail |
| C9 throttle chop from cruise | glides, pitch within ±30 deg for 3 s | pass or fail |
| C10 phugoid period at 65 percent, sticks centred | 7.9 s, ζ 0.26: the phugoid root of the four state longitudinal model trimmed at the 11.8 m/s the aircraft settles at (Nelson, ch. 4); short period 0.87 s, ζ 0.69 | 6.5 to 9.5 |
| C11 full rudder at cruise, wings held level: steady sideslip | −Cnδr δr/Cnβ = 13.5 deg, nose to the rudder's side | 9 to 20 |
| C12 full rudder at cruise, ailerons centred: peak yaw rate | 39 deg/s: the Dutch roll step, ω_n = sqrt(q S b Cnβ/Izz) = 4.1 rad/s, ζ = 0.24, peak β_ss ω_n exp(−ζ φ/sqrt(1 − ζ²)) | 26 to 58 |
| C13 full rudder at cruise, ailerons centred: bank after 2 s | the rudder's way; steady roll rate 25 deg/s once the sideslip is built, from Clβ β against Clp | 15 to 80 deg, and the sign |
| C14 prop torque, static full throttle | 0.152 N m, rolling left | 0.13 to 0.30 N m, and the sign |
| C15 P factor, full throttle climb held at 9 m/s | 0.009 N m, nose left | 0.005 to 0.020 N m, and the sign (κ from 1 to 3) |
| C16 standing on its wheels | 13.9 deg nose up on three wheels, 13.9 percent of the weight on the tail | pitch 12.5 to 15.5 deg, tail share 10 to 18 percent, no hull contact |
| C17 take off roll on the strip, full throttle, the tail raised and rotated at 1.1 V_s | 6.4 m to liftoff at 8.9 m/s, 1.3 s (asphalt 6.0 m) | 4.5 to 9.0 m, and 8.1 to 10.5 m/s |
| C18 the take off roll tracks straight, sticks centred but for the tail | heading within a few degrees of the runway by liftoff | under 10 deg, and under 1 m off the line |
| C19 taxi turn, full rudder at walking pace | radius L/tan δ = 0.70/tan 15° = 2.6 m | 2.0 to 3.5 m, and the turn the rudder's way |
| C20 a landing on the wheels from a powered approach | touches down on the mains, rolls out, comes to rest on three wheels | at rest, pitch within 1.5 deg of C16, no hull contact |
| C21 full down elevator at full throttle on the roll | noses over | pitch below −15 deg, pass or fail |
| C22 the five inch, the wing and the Skyhunter unmoved | their recorded trace hashes | identical |
| C23 Node and Chrome agree on a Cub trace that takes off from the ground | SHA-256 | identical |

C5 is gated as pb/2V, the helix angle, rather than a rate at one speed:
the Cub's top speed is under the 20 m/s the Skyhunter's roll was
measured at, so the roll is flown from the fastest the Cub goes and the
figure is made independent of where exactly that is.

The take off roll is derived in two phases, as a taildragger takes off:
on three points, where the wing is at 19 deg to the zero lift line and
stalled (the plant's flat plate, CL 0.62, CD 0.26), until the tail comes
up at about 7 m/s, then tail up at 2 deg of pitch until the rotation at
1.1 V_s. Left on three points with the sticks centred the Cub flies off
at the flat plate's own lift, 11.1 m/s, after 17 m; the pilot raising
the tail is worth 10 m of strip. The rolling resistance is the one number
the two surfaces differ in, and with a thrust to weight of 1.04 it moves
the roll by 6 percent: the Cub is short on grass and short on asphalt. The
simulator's ground has one surface, and the gear ships grass.

## The landing gear

What the Cub has that neither other aircraft has, and the whole of what is
new in the contact path.

### The model, and why it is the simplest honest one

Each wheel is a single contact point, the tyre's lowest spot with the
strut unloaded, in the body frame. Against the ground plane each point
gets:

- **A spring and a damper along the ground normal**, F_n = k pen − c v_n,
  never negative. That is the leg and the tyre together. It is what lets
  an aircraft stand on three points at three different heights and share
  its weight between them by geometry, what makes a landing settle rather
  than bounce off a rigid corner, and what lets the tail come up as the
  elevator unloads it. A rigid impulse contact, the hull's, cannot share a
  static load between three points at all: it resolves one corner at a
  time and the shares are whatever order it visits them in.
- **Friction split along the wheel and across it.** Along the wheel's own
  heading laid on the ground, rolling resistance, at most mu_roll F_n;
  across it, the tyre's side grip, at most mu_side F_n. Each is an impulse
  that would stop the point's velocity along that direction through the
  body's effective mass there (the same form the hull's contact uses, so
  it is stable at any stiffness and cannot reverse a velocity), clipped at
  its limit. Anisotropic friction is the whole of what makes a wheel a
  wheel: it rolls forward and does not slide sideways. It is also what
  makes a taildragger a taildragger: the CG behind the mains is
  directionally unstable on the ground, and it is the tailwheel's side
  grip, and only that, that holds it straight. When the tail lightens as
  it comes up, that grip goes with its load, which is why the rudder has
  to take over and why a real one swings.
- **A steered tailwheel.** Its heading turns with the rudder, one to one,
  the front of the wheel to the side the rudder's trailing edge goes, so
  right rudder turns the aircraft right. No brakes: the FMS Cub has none,
  and the stick has no channel for them.

What it does not model, deliberately: tyre slip angle curves (a Pacejka
tyre; the linear cone is enough at these speeds and loads), a castering
tailwheel's breakout past its steering springs, the leg's own geometry
(the force acts along the ground normal, not along the strut), wheel spin
inertia, and a separate surface type for asphalt. Each is a number or a
curve that nobody could check against this aircraft.

### The numbers

From the three view as the geometry above, the CG at 60 mm behind the
leading edge and 7 mm over the thrust line.

| Quantity | Value | How |
| --- | --- | --- |
| Main wheels, contact points | x +0.053, y ±0.100, z −0.190 m | three view: the axle 53 mm ahead of the CG, the 60 mm tyre's bottom 190 mm under it; the track 0.20 m, the full size Cub's 6 ft scaled |
| Tailwheel, contact point | x −0.626, y 0, z −0.022 m | three view |
| Three point attitude | 13.9 deg nose up | atan((0.190 − 0.022)/(0.053 + 0.626)); the full size J-3 sits at about 11 |
| Static loads | 5.6 N on each main, 1.8 N on the tail (13.9 percent) | moments about the ground contacts in the three point attitude |
| Main leg stiffness, damping | 1200 N/m, 34 N s/m | 4.6 mm of static deflection; damping 0.6 of critical on half the mass, 2 x 0.6 sqrt(k m/2) |
| Tailwheel stiffness, damping | 300 N/m, 10 N s/m | 6 mm static; 0.6 of critical on the tail's effective mass about the mains, (Iyy + m d²)/l², 0.23 kg |
| Rolling resistance mu_roll | 0.08 | ESTIMATED: short grass for a 60 mm foam and rubber wheel, 0.05 to 0.12; asphalt would be 0.02 to 0.03 |
| Side grip mu_side | 0.70 mains, 0.60 tail | ESTIMATED: rubber on grass and dry ground; the tailwheel is smaller and harder |
| Tailwheel steering | 1.0 x the rudder angle, ±15 deg | the kit's tailwheel is linked to the rudder horn |
| Wheelbase on the ground | 0.70 m | the mains to the tailwheel, three point |
| Nose over, pivoting on the mains | the hull's nose corner at 29 deg nose down | from the hull below; the prop's tip would be at about 12, see below |

### The hull, which is only for crashes now

The contact code's hull is an eight corner box centred on the CG, the
same box every airframe has. On the Cub it is drawn inside the gear,
because standing on it is the wheels' job: hx 0.30, hy 0.70, 0.05 down
and 0.12 up. A box the length of the fuselage would put its aft bottom
corner 24 mm under the grass in the three point attitude, since the real
fuselage sweeps up to the tail and a box cannot; this one clears it by 51
mm. A box as deep as the belly, 0.086 m, would catch a wingtip at 10 deg
of bank on the ground, where the real high wing clears to about 24; 0.05
catches it at 13. Upside down the box's top is the wing's top; the fin,
0.18 m tall at the tail and outside the box, will show about 6 cm into
the grass on an aircraft lying on its back. The nose corner is the
first thing to touch in a nose over, at 29 deg of pitch; the real prop's
tip, 0.14 m round a hub 7 mm under the CG, would touch at about 12. Both
are the limits of a centred box, and the fix for both is the same: hull
points the airframe declares, as the wheels now are, which is the next
step if a pilot notices.

## Conventions

The Skyhunter's, unchanged: world right handed, Z up; body X forward, Y
left, Z up; SI; 1000 Hz fixed step; the state block's twenty doubles with
the motor in RPM slot 0; α of the zero lift line and β from the body frame
wind; sticks roll, pitch, yaw, throttle to ailerons, elevator, rudder and
motor with expo 0.3; yaw stick positive nose right, which is a negative
rudder angle.

Surface angles for the renderer through `sim_plane_surfaces(out[4])`:
left aileron, right aileron, elevator, rudder. Ailerons and elevator
positive trailing edge up; rudder positive trailing edge to the left,
which yaws the nose left. The tailwheel's steering angle is the rudder's,
the same sign: positive turns the front of the wheel to the right, from
where a renderer draws it as the rudder's angle about the tailwheel's
pivot.

Wheel loads for the gates and the renderer through `sim_wheel_loads(out[3])`:
left main, right main, tailwheel, newtons. A strut's compression is the
load over its stiffness.

## The stabiliser, on the wheels and off them

In the air, the Skyhunter's stabiliser and acro with the Cub's numbers.
The roll gains are the flying wing's, 1.2 and 0.12 in Stabilised and 3.0,
0.25, 0.35 feedforward and 4.0 integral in Acro, because the Cub's roll
authority per stick at a given speed, (Clδa δa/(−Clp)) 2V/b, is the
wing's to within three percent and about twice the Skyhunter's. The pitch
loops are the other two's. Acro asks for up to 120 deg/s of roll and 80
of pitch. The turn coordinator's gain is 3 stick per rad/s of yaw rate
error where the Skyhunter's is 1: full rudder on the Cub gives a third of
the Skyhunter's yaw acceleration, Cnδr δr q S b/Izz, 3.9 against 11.1
rad/s² at cruise, so it needs three times the stick for the same loop. At
the Skyhunter's gain the Cub slipped 2.1 deg in a held 60 deg bank; at
this one, 1.7.

On the wheels, a stabiliser has nothing to hold. The gear sets the
attitude, so an attitude loop would only wind its error up against the
ground, the Stabilised pitch loop asking for 2 deg with the aircraft
sitting at 14 and holding full down elevator, and let it go at liftoff;
the turn coordinator would fight the tailwheel the pilot is steering with,
since a taxiing aircraft turning on its wheels is exactly a yaw rate with
no bank. So while any wheel carries load, every mode is Manual: the sticks
are the surfaces, the integrators stay empty and Acro takes its target
afresh every step. At liftoff Acro holds the attitude the aircraft left
the ground in, and Stabilised starts levelling from there. Weight on
wheels is the gear's own load, handed to the plant one step late, which is
the millisecond a flight controller's own switch would take.

## The script that made the numbers

```
rho=1.225 g=9.81 b=1.4 S=0.28 m=1.32 CLmax=1.15 CD0=0.050 e=0.75
aw=2 pi AR/(AR+2); CLa=aw + at (Sh/S) eta (1 - 2 aw/(pi AR))
Vs=sqrt(2W/(rho S CLmax)); CLopt=sqrt(CD0/k); LDmax=CLopt/(2 CD0)
T(V,d)=max(0, Ts d^2 (1 - V/(Vp d))); D(V)=q S (CD0 + k CL^2) with CL=W/(q S)
level speed at duty d: bisect T(V,d)=D(V); climb=(T-D)V/W
roll: pb/2V = Clda da/(-Clp); sideslip: -Cndr dr/Cnb
Dutch roll: wn=sqrt(q S b Cnb/Izz), zeta from Cnr and CYb, peak r of the step
phugoid: trim level for alpha, delta_e and duty, finite difference the
four state (u, w, q, theta) equations, roots of the characteristic
polynomial
take off: integrate m dV/dt = T(V,1) - q S CD - mu (W - q S CL), three
point (CL 0.62, CD 0.26) to 7 m/s, then CL at 7 deg of zero lift angle,
to 1.1 Vs
gear: loads by moments about the contacts; k from a static deflection,
c = 2 zeta sqrt(k m_eff) at zeta 0.6
```
