# Radian, stage 1: the powered glider, its folding prop and the rising air

The fourth fixed wing, and the first whose point is to fly without its
motor: every number the plant is built from with its formula and source,
the folding prop, the thermals it climbs in, and the check table with its
bands. It follows `docs/CUB-STAGE1.md` and `docs/SKYHUNTER-STAGE1.md`,
which did the same for their aircraft, and uses the same plant,
`src/native/plant_wing.c`, with a fourth parameter table. Where this file
says "the Cub" or "the Skyhunter" it means those aircraft and documents.
`scripts/glider-derive.js` (`npm run glider:derive`) prints every derived
figure below; nothing in it loads the plant.

## Which Radian, and why

The E-flite Radian (EFL4750, earlier ParkZone PKZ4700) is the 2 m foam
motor glider most pilots learn to thermal on: a long tapered fuselage
with a canopy over the nose, a mid wing with a curved polyhedral, a
conventional tail with the stabiliser through the fin, and a two blade
prop in the nose that folds back along the fuselage when the motor
stops. The classic Radian has three channels: rudder, elevator and
throttle, and it turns on its rudder through the polyhedral. The Radian
Pro (PKZ5475) is the same 2 m, 1140 mm aircraft on the same 480 960 kV
motor and 9.75 x 7.5 folding prop, 100 g heavier, with ailerons and flaps.
The Radian XL (EFL5550, 2.6 m) was listed in the brief as an aileron
variant; it is not one: it has a full flying stabiliser, a rudder and
spoilers, and no ailerons.

This is the Radian Pro, for two reasons that are about this simulator:

- **The sticks.** Every fixed wing here puts roll on the roll stick, and
  on a mode 2 transmitter that is the right stick's sideways travel. A
  rudder and elevator glider flies its turns on that same right stick
  through the rudder, so the classic Radian would need a roll to rudder
  mix in the plant, a special case no other aircraft has. With ailerons
  the right stick rolls it as it rolls every other plane.
- **The stabiliser.** Stabilised and Acro close their roll loop on the
  ailerons. On a rudder only aircraft the roll loop has nothing to move,
  so two of the three tune rows would fly as Manual. With ailerons they
  work unchanged, the turn coordinator puts the rudder in, and the
  pilot who wants to fly it as a classic Radian can: the yaw stick is the
  rudder in every mode, and the polyhedral rolls it into the turn (G10).

The flaps are left out: the stick has no channel for them, and a glider
flown without them is flown clean, which is how the derivation below is.

## The aircraft

| Quantity | Value | How |
| --- | --- | --- |
| Span b | 2.000 m | EFL4750 manual, "Specifications"; the Pro's listings print 2000 mm (78.5 in) |
| Length | 1.140 m | EFL4750 manual; the Pro's 1140 mm (45.0 in) |
| Wing area S | 0.355 m² | EFL4750 manual, 35.5 dm² (551 sq in); the Pro's is not published, and its span, length and planform are the Radian's. ESTIMATED to be the same |
| Mean aerodynamic chord | 0.1866 m | the manual's top view, measured below |
| Aspect ratio AR = b²/S | 11.27 | derived |
| All-up mass m | 0.98 kg | the Radian Pro's listings and Model Airplane News, 980 g (34.6 oz) on the 3S 1300 mAh pack; the classic is 880 g |
| Weight W = mg | 9.61 N | g = 9.81 |
| Wing loading W/S | 27.1 N/m² | derived: 27.6 g/dm², a light glider's |
| CG | 63 mm behind the root's leading edge | EFL4750 manual, "Center of Gravity"; h = 0.266 of the mean chord, whose leading edge is 13.4 mm behind the root's |
| CL max | 1.05 | ESTIMATED: a thin cambered glider section at Re 8e4 (7.5 m/s on a 0.19 m chord), section cl max about 1.15 (Selig and others, Summary of Low Speed Airfoil Data, vol. 1, the SD7037 class), times 0.9 for the tapered wing and the tail's trim load |
| Zero lift line | 5 deg below the body x axis | ESTIMATED: the section's own zero lift angle, about minus 3.5 deg, and about 1.5 deg of incidence |
| CD0 | 0.021 | ESTIMATED by a build up, Raymer, Aircraft Design, ch. 12: the wing's section drag 0.0125 (the same data, cd at cl 0.4 to 0.9 and Re 8e4 to 1.2e5), the fuselage 0.0033 (wetted 0.227 m², turbulent C_f 0.0049 at Re 6.2e5, form factor 1.06 at a fineness of 12.7), the tail 0.0031 (0.086 m² of stabiliser and fin, both sides, laminar C_f 0.0057 at Re 5.5e4, form factor 1.1), and 0.002 for the canopy's joint, the servo horns, the folded blades and the wing's root |
| Oswald e | 0.85 | a tapered wing of AR 11 with a curved polyhedral and a slim fuselage; above the Skyhunter's 0.80 and the Cub's 0.75 |
| Induced drag factor k = 1/(π e AR) | 0.0332 | derived |
| Wing lift slope a_w = 2π AR/(AR+2) | 5.34 /rad | the lifting line form the other three use |
| Motor, cells, kV | 480, 3S, 960 kV | EFL4750 manual and Model Aviation's Night Radian review |
| Prop | 9.75 x 7.5 in, two blade, folding | PKZ1017, "Propeller 9.75 x 7.5: Radian/Pro"; Model Aviation's review |
| No-load rpm = kV x 11.1 V | 10,656 | derived |
| Pitch speed V_p = rpm/60 x pitch x 0.85 | 28.8 m/s | derived, 0.85 for slip, as the other three |
| Power at full throttle | 251 W at 21.8 A | Model Aviation's Night Radian review, measured on this motor, prop and a 3S pack |
| Static thrust T_s | 9.28 N | ESTIMATED: the shaft power, 78 percent of 251 W (ESTIMATED motor and ESC efficiency at 22 A), turns the prop at the speed where C_P 0.06 absorbs it, 8,516 rpm, and there C_T 0.10 gives the thrust; both coefficients are a thin electric prop's of pitch to diameter 0.77 at zero advance (the UIUC propeller data base) |
| Thrust to weight | 0.97 | derived; reviewers call its climb "virtually vertical" and the manual asks for bursts of power, not long runs |
| Full throttle current | 21.8 A | the same measurement |
| Inertia Ixx, Iyy, Izz | 0.075, 0.068, 0.140 kg m² | ESTIMATED: the wing as a 0.27 kg tapered bar of 2 m (m b²/12 x 0.8, 0.072); in pitch the motor and prop 0.09 kg at 0.29 m ahead, the pack 0.11 kg at 0.12 m ahead, the tail 0.05 kg at 0.75 m aft and the fuselage shell 0.25 kg spread over 1.14 m (0.068 together); Izz a little under Ixx plus Iyy |
| Aileron, elevator, rudder travel | ±15, ±24.4, ±30 deg | elevator and rudder: the manual's high rates, 12 and 40 mm at the trailing edge, over the surfaces' chords at the horn, 29 and 80 mm (the top and side views): asin(12/29), asin(40/80). Ailerons ESTIMATED: the Pro's are not published and 15 deg is a sailplane's usual first setup |

### The geometry

Off the EFL4750 manual's drawings: its top view silhouette, measured in
pixels at 400 dpi and scaled to the 2 m span, and its side view, scaled
to the 1140 mm length. The two agree on the wing's root chord, 0.200 m,
and the manual's area, 35.5 dm², is the drawn planform's 36.3 less the
strip through the fuselage. The top view draws the fuselage 4 percent
shorter than 1140 mm; the side view is used for every station along it.

| Quantity | Value | How |
| --- | --- | --- |
| Wing planform | constant 0.200 m chord to 0.60 m out, then the leading edge curving back to 0.110 m at 0.95 m and a rounded tip; the trailing edge straight | top view |
| Wing root, leading edge | 0.2455 m aft of the spinner's tip | side view, the wing saddle; the CG is 0.3085 m aft |
| Polyhedral | the local dihedral 2 deg at the root growing as the square of the span station to 14 deg at the tip, which lifts the tip 0.106 m | ESTIMATED from the manual's cover and photographs: the Radian's "elliptical dihedral"; in effect 7.3 deg of constant dihedral (below) |
| Horizontal tail span, area | 0.477 m, 0.0476 m² | top view, the strip through the fin included |
| Tail arm l_h | 0.69 m | the wing's quarter chord to the tail's |
| Tail aspect ratio, lift slope a_t | 4.78, 4.43 /rad | 2π AR/(AR+2) |
| Tail efficiency η | 0.9 | Nelson, Flight Stability and Automatic Control, ch. 2 |
| Downwash gradient dε/dα = 2 a_w/(π AR) | 0.301 | Nelson, eq. 2.22 |
| Horizontal tail volume V_H = S_h l_h/(S c) | 0.496 | derived; a glider's |
| Elevator, effectiveness τ_e | 27 percent of the chord, 0.48 | top view (the hinge line), Nelson fig. 2.20 |
| Fin and rudder, area S_v | 0.038 m², 0.218 m tall | side view, above the fuselage |
| Fin arm l_v, height above the CG z_v | 0.64 m, 0.13 m | side view |
| Fin effective aspect ratio, lift slope a_v | 1.88, 3.04 /rad | its own 1.25, raised half again by the stabiliser and the fuselage as end plates, as the Cub's |
| Vertical tail volume V_V | 0.0343 | derived; a big fin, for a design that was first a rudder only glider |
| Rudder effectiveness τ_r | 0.55 | Nelson, fig. 2.20 |
| Fuselage | wetted 0.227 m², volume 0.0041 m³, 0.084 m wide and 0.12 m deep at the wing, tapering to 0.02 by 0.03 under the fin | side and top views, as rounded sections |
| Ailerons, effectiveness τ_a | 0.55 to 0.95 m out, a quarter of the chord, 0.45 | ESTIMATED: the Pro's outboard panels; Nelson fig. 2.20 |
| Thrust line | 8 mm under the CG, the prop's plane 0.293 m ahead | the side view: the spinner sits under the canopy's middle and the pack and servos over the belly |

## The coefficients

The aero convention (x forward, y right, z down), as the other three,
turned into the body frame in the plant exactly as theirs are. Per
radian. The strip integrals run over the measured planform.

| Coefficient | Value | Formula |
| --- | --- | --- |
| CLα, aircraft | 5.709 | a_w + a_t (S_h/S) η (1 − dε/dα), Nelson eq. 2.52 |
| Neutral point h_n | 0.494 c | 0.25 + V_H η (a_t/a_w)(1 − dε/dα), less the fuselage's own 0.084 per rad (Raymer eq. 16.25, K_f 0.012 per deg) over CLα |
| Static margin | 0.228 | h_n − 0.266: the manual's CG makes a stable, forgiving trainer |
| Cmα | −1.304 | −CLα x static margin |
| Cm0 | +0.170 | the value that trims at the best glide, 7.7 m/s, CL 0.75, with the elevator at zero |
| Cmq | −14.6 | −2 η a_t V_H l_h/c, Nelson eq. 3.43 |
| Cmδe | 0.949 | η V_H a_t τ_e |
| CLδe | −0.257 | −η (S_h/S) a_t τ_e |
| CYβ | −0.376 | −a_v S_v/S, and −0.05 for the slim fuselage's side |
| Cnβ | +0.0967 | a_v V_V, less the fuselage's −1.3 Vol/(S b) = −0.0074 (Nelson eq. 2.72) |
| Cnr | −0.0719 | −2 a_v V_V l_v/b, and −CD0/4 for the wing |
| Clβ | −0.182 | the polyhedral by strip theory, −(2 a_w/(S b)) ∫ Γ(y) c(y) y dy = −0.161 (7.3 deg of constant dihedral in effect), and −a_v (S_v/S)(z_v/b) for the fin |
| Clp | −0.786 | −(4 a_w/(S b²)) ∫ c(y) y² dy, strip theory over the half span |
| Clδa | +0.334 | (2 a_w τ_a/(S b)) ∫ c(y) y dy from 0.55 to 0.95 m, Nelson eq. 5.95 |
| Clr | +CL/4 | Nelson, table 3.4, straight wing |
| Cnp | −CL/8 | the same |
| Cnδa | −0.114 CL | 2 K CL Clδa with K = −0.17, Nelson ch. 5: long outboard ailerons at a glider's CL give plenty of adverse yaw |
| Cnδr | −0.0573 | −V_V a_v τ_r |
| CYδr | +0.179 | a_v (S_v/S) τ_r |
| Clδr | +0.0116 | CYδr z_v/b |

### The prop, which folds

A tractor, as the Cub's, turning clockwise from the cockpit: its torque
rolls the airframe left, 0.092 N m at static full thrust by the ideal
disc (82 W through a 9.75 inch disc at 8,516 rpm, 0.0099 m per newton),
0.23 N m by 80 percent of the measured electrical power, the band's top.
The thrust line 8 mm under the CG lifts the nose with power by thrust x
0.008, 0.074 N m at full static thrust, which a Radian pilot knows as the
balloon on a power climb. P factor is the Cub's blade element term, κ =
1.6, which no airframe of this class can tell from zero (the Cub's C15
measured a sixteenth of full rudder).

What is new is the fold. The Radian's ESC is set with the brake on "for
proper propeller folding" (the manual): at zero throttle it stops the
motor, and the air folds the two blades back along the fuselage, where
they drag next to nothing (their share is in CD0's 0.002). Open, a prop
driven slower than the air would turn it brakes the aircraft, and a
freely windmilling one drags about a tenth of the dynamic pressure on its
disc (Hoerner, Fluid Dynamic Drag, ch. 13). So in the plant:

- Under the fold throttle, 5 percent, the prop is folded: no thrust, no
  current, and the motor's rate reads zero, which is what tells a
  renderer to draw the blades folded back.
- At or over it the prop is open, and its thrust follows the same line
  every plane's does, T_s d² (1 − V/(V_p d)), but carries on below zero
  past the pitch speed instead of stopping there. At 5 percent and 8 m/s
  that is a drag of 0.106 N, a fifth of the whole aircraft's drag at that
  speed, which is why a glider with a fixed prop glides like a trainer.
- A fold throttle of zero, every other airframe's, is a fixed prop whose
  thrust stops at zero exactly as it always did.

The two glides the gates fly, G1 and G12, are the proof: 18.7 folded and
15.5 open at 5 percent, derived; a pilot who leaves a click of throttle
on in a thermal is flying the second one.

## The rising air

The plant had no air of its own: every airframe flew in still air, and
the brief allowed a lift field only if it moved nobody else's trace. It
does not: an airframe flies in it only if its table sets `air_lift`, and
only the Radian's does, so for every other airframe the relative wind is
computed from the body's velocity alone exactly as before. G20 holds the
five inch's, the wing's, the Skyhunter's and the Cub's recorded hashes.

**Thermals, and only thermals.** Three columns of rising air over the
airfield, fixed in the plant's world frame (x along the runway, y to the
left of it, z up), clear of the strip and of the pylon line at y = −70:

| Thermal | Core x, y | Radius R | Rise at the core w0 |
| --- | --- | --- | --- |
| A | 110, 70 m | 45 m | 2.5 m/s |
| B | −140, −90 m | 40 m | 2.0 m/s |
| C | 60, −170 m | 35 m | 1.6 m/s |

Each rises at w0 (1 − (r/R)²)², with no kink anywhere, so flying into
one is a gust and not a step; the rise is a wind from below in the
relative wind, and nothing else about the plant changes. They form
between 5 and 40 m over the ground, which keeps them off a glider
landing, and fade out between 250 and 300 m, the base of the cloud they
would feed, so a glider can climb in one but not for ever. The sizes and
strengths are a small field's afternoon for a model: the Radian manual's
own guidance is to circle at 50 to 75 feet of radius and that thermals
are "narrow" low down; a 2.5 m/s core against the Radian's 0.5 m/s sink
in a 30 deg turn is a strong but ordinary thermal. They do not drift,
because there is no wind; they do not change, so the field is a function
of position alone and a replay meets exactly the air it met before; and
there is no sink around them, deliberately, because a ring of sink with
nothing to find it by only makes the field feel random.

**Ridge lift is not built.** Slope lift is wind deflected up a slope, and
the plant has neither: no wind (the air is still everywhere but in the
thermals) and no terrain (its only ground is the plane the host raises;
every hill a map draws is the shell's, in JavaScript). A ridge in the
plant would be a slope nobody can see, blowing in a wind nobody can
feel. The honest version needs a wind in the plant and the host to hand
it the terrain's slope under the aircraft each step through an entry
point the replay records, which is a change to the module ABI and the
replay format and is its own piece of work.

`sim_air_lift(x, y, z)` reads the field at a world position, for the
gates and for a shell that wants to show where the thermals are. Nothing
on screen marks them yet: a pilot finds them the way the manual says, by
the aircraft lifting under them.

## Derived performance, the bands the plant must land in

From the numbers above with the thrust model below, by
`scripts/glider-derive.js`. A band is the derived figure with room for
the estimated inputs, and in proportion never wider than the Cub's.

| Check | Derived | Band |
| --- | --- | --- |
| G1 glide ratio, power off, folded, at 8 m/s | 18.7 (best 18.9 at 7.5 m/s) | 16.0 to 21.5 |
| G2 least sink, power off, over 7.2 to 8.4 m/s | 0.379 m/s at 7.1 m/s | 0.30 to 0.46 |
| G3 stall speed, level, power off | 6.49 m/s | 6.1 to 7.4 |
| G4 climb rate, full throttle, best | 5.81 m/s at 11.6 m/s | 4.0 to 6.9 |
| G5 level speed at 65 percent | 14.05 m/s | 12.2 to 16.2, and level within 0.1 m/s |
| G6 roll, full aileron, as pb/2V | 0.111: 77 deg/s at 12 m/s | 0.08 to 0.15 |
| G7 turn radius at 60 deg bank | V²/(g tan 60°) | within 15 percent of the formula at the speed flown |
| G8 full rudder at 65 percent, wings held level: sideslip | −Cnδr δr/Cnβ = 17.8 deg | 12 to 25 |
| G9 full rudder, ailerons centred: peak yaw rate | 94 deg/s at 14.05 m/s: the Dutch roll step, ω_n 7.7 rad/s, ζ 0.28 | 63 to 140 |
| G10 full rudder, ailerons centred: bank after 2 s | the rudder's way; 58 deg/s steady once the sideslip is built, about 87 deg by 2 s | 30 to 120, and the sign |
| G11 the fold at 8 m/s | folded: no thrust, nothing turning; open at 5 percent: 0.106 N of drag | 0.06 to 0.16 N |
| G12 glide ratio at 8 m/s, the prop open at 5 percent | 15.5 | 13.0 to 17.8 |
| G13 prop torque, static full throttle | 0.092 N m, rolling left | 0.08 to 0.24, and the sign |
| G14 circling at 30 deg and 8.5 m/s centred on thermal A at 100 m | the rise at 12.8 m, 2.11, less the turn's sink, 0.52: 1.59 m/s up | 1.1 to 2.1 |
| G15 the same circle where the air is still | 0.52 m/s down | 0.40 to 0.70 |
| G16 the same circle over thermal A at 330 m | still air: G15's sink | within 0.02 m/s of G15 |
| G17 the shell's throw, 10 m/s at 70 percent, for two seconds the stick that trims a 10 m/s climb there (−0.274) | climbing at 10 deg | above 1 m and faster than 8 m/s after 3 s |
| G18 throttle chop from level at 65 percent, the pitch stick left where it was | glides, the new trim a 14 m/s dive of a few degrees | pitch within ±30 deg for 3 s |
| G19 hands off at 65 percent from level: the phugoid | 5.64 s, ζ 0.071: the elevator neutral trims a 7.4 m/s climb at 11 deg | 4.6 to 6.6 |
| G20 the five inch, the wing, the Skyhunter and the Cub unmoved | their recorded trace hashes | identical |
| G21 Node and Chrome agree on the Radian's recorded climb, glide and thermal | SHA-256 | identical |

Three of these are flown differently from the Cub's and the Skyhunter's,
and the reason is the same each time: a glider is trimmed for its glide.
With the elevator neutral it flies at 7.7 m/s, so the harness pilot's
level hold, a proportional attitude loop over a slow trim, cannot hold
it level at 65 percent (it needs a third of full down elevator there and
settles 8 deg nose high of what it asks for). G5, G8 to G10 and G18 are
flown from a level hold whose stick trim integrates the climb rate, as a
pilot's thumb on the trim lever does. The throw, G17, holds the stick the
derivation says trims a climb, as the Cub's C8 holds the one that trims
its cruise. And the phugoid, G19, is derived for what hands off means on
this aircraft: a slow climb, not a cruise. A glider's phugoid is long and
barely damped, ζ near 1/(√2 L/D), 0.03 in the glide; that is Lanchester's
result and the reason a thrown glider balloons.

## Conventions

The other three's, unchanged: world right handed, Z up; body X forward, Y
left, Z up; SI; 1000 Hz fixed step; the state block's twenty doubles with
the motor in RPM slot 0 (zero when the prop is folded); α of the zero lift
line and β from the body frame wind, which now includes the thermal's
rise; sticks roll, pitch, yaw, throttle to ailerons, elevator, rudder and
motor with expo 0.3; yaw stick positive nose right, which is a negative
rudder angle. Surface angles through `sim_plane_surfaces(out[4])`, the
Cub's four.

## The stabiliser

The Skyhunter's roll gains, 2.0 and 0.2 in Stabilised and 5.0, 0.4 and 6.0
integral in Acro, because the Radian's roll authority per stick,
(Clδa δa/(−Clp)) 2V/b, is the Skyhunter's within 5 percent (both about
0.11 as pb/2V); Acro's roll feedforward is 0.7 stick per rad/s, since full
aileron rolls 1.34 rad/s at 12 m/s. Acro asks for up to 80 deg/s of roll,
what full aileron gives at the speeds a glider flies, and 60 of pitch.
The pitch loops are the others'. Stabilised flies level at a trim pitch of
zero: the best glide is 0.6 deg nose down, so the centred stick glides a
little slower than that and climbs gently under power. The turn
coordinator's gain is 1.5: the Radian's rudder gives nine tenths of the
Skyhunter's yaw acceleration per stick at cruise, and its long ailerons
more adverse yaw.
