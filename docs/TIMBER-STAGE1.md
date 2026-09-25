# Timber, stage 1: the aircraft, its flaps and slats, and the gear

The seventh fixed wing, the first with flaps and slats: every number the
plant is built from with its formula and source, what the flaps and slats
add and how, the flap control, the landing gear, and the check table with
its bands. It follows `docs/CUB-STAGE1.md`, which did the same for the
Cub and whose gear, stabiliser and conventions this aircraft uses
unchanged, and it flies the same plant, `src/native/plant_wing.c`, with
its own parameter table. Where this file says "the Cub" it means that
aircraft and that document.

## The aircraft

The E-flite Turbo Timber Evolution 1.5 m (EFL105250, BNF Basic, and
EFL105275, PNP): a foam STOL bush plane. A cantilever high wing with
drooped tips, big slotted flaps inboard and ailerons outboard, fixed
leading edge slats that can be left off, a boxy fuselage with a long nose
drawn as a turboprop's, a big tail, a tractor three blade prop on 4S, fat
foam tundra tyres on sprung legs and a tailwheel steered from the rudder.
With the flaps down it is off the strip in a couple of metres and flies at
a crawl nose high; with them up it is quick and aerobatic.

It ships as a taildragger and only as one: the replacement parts list has
main gear, a tailwheel and no nose gear. The original Timber 1.5 m of 2015
was the one sold convertible between tricycle and taildragger gear. So
this aircraft is a taildragger, which is also the right answer for what it
is for: sitting tail down it is already at a high angle of attack, which
is where a STOL take off wants to be, and the Cub's gear model, tested,
carries it with no change to the contact path.

| Quantity | Value | How |
| --- | --- | --- |
| Span b | 1.555 m | E-flite manual, EFL105250, "61.2 in (1555mm)"; the retail listings print 1549 mm |
| Length | 1.040 m | E-flite manual, "40.9 in (1040mm)" |
| Wing area S | 0.361 m² | 559.5 in², 36.1 dm², the Turbo Timber's published figure (Flite Test's release article; Model Aviation's review of the Timber 1.5 m, the same wing) |
| Mean chord c = S/b | 0.2322 m | derived; the drawn model's constant chord is 0.240 with rounded tips |
| Aspect ratio AR = b²/S | 6.70 | derived |
| All-up mass m | 1.70 kg | ESTIMATED from E-flite's "54 to 60 oz (1.53 to 1.7 kg)" flying weight, the top of it for the recommended 4S 3200 mAh pack. The current manual's own figures, 1.82 kg without a battery and 2.15 kg with it, disagree with every listing and with Flite Test's 1.61 to 1.70 kg and are set aside |
| Weight W = mg | 16.68 N | g = 9.81 |
| Wing loading W/S | 46.2 N/m² | derived; Flite Test's 14.0 g/dm² at 1.61 kg is 45.9 |
| CG | 60 mm behind the leading edge at the root, h = 0.259 of c | E-flite manual, "60mm +/-5mm", without the slats |
| CL max, clean | 1.15 | ESTIMATED, the Cub's: a thick semi symmetric section at Re 1.6e5 (10 m/s, 0.24 m chord), section cl max about 1.3, times 0.9 for the rectangular wing and the tail's trim load |
| Zero lift line | 5 deg below the body x axis | ESTIMATED, the Cub's: the section's zero lift angle about minus 3.5 deg, 1.5 deg of incidence |
| CD0, slats off | 0.042 | ESTIMATED by the equivalent skin friction method (Raymer eq. 12.23): wetted area 1.27 m² (wing 0.74, fuselage 0.30, tail 0.24), S_wet/S = 3.52, C_fe = 0.009, is 0.032; the two 108 mm tyres at a C_D of 0.25 on their frontal area 0.006, the gear legs and springs 0.002, the cowl and its stacks 0.002. No struts: the wing is cantilevered |
| Slats' drag | 0.004 | ESTIMATED; E-flite: "for optimized high speed performance we recommend flying without the slats" |
| Oswald e | 0.78 | a cantilever rectangular wing of AR 6.7 with a boxy fuselage; the Cub's 0.75 less its struts |
| Induced drag factor k = 1/(π e AR) | 0.0609 | derived |
| Wing lift slope a_w = 2π AR/(AR+2) | 4.84 /rad | the lifting line form every other aircraft uses |
| Motor, cells, kV | BL10 800 kV, 4S | E-flite manual; the recommended 14.8 V 3200 mAh pack |
| Prop | 11 x 7.5, three blade | E-flite manual, EFL5962 |
| No-load rpm = kV x 14.8 V | 11,840 | derived |
| Pitch speed V_p = rpm/60 x pitch x 0.85 | 31.95 m/s | derived, 0.85 for slip, as every other aircraft |
| Full throttle current, power | 44 A, 660 W | the bench figure for the factory prop on 4S in a published review (HobbySquawk's Turbo Timber review); the Evolution's ESC is a 60 or 70 A |
| Static thrust T_s | 25.0 N | ESTIMATED: blade element coefficients for an 11 x 7.5 three blade, Ct 0.13 and Cp 0.061 (a two blade's 0.10 and 0.045 raised by the third blade), at the 160.7 rev/s that absorbs 80 percent of the bench's 660 W, gives 25.1 N. Thrust to weight 1.50: "unlimited vertical", the same review's words |
| Inertia Ixx, Iyy, Izz | 0.090, 0.095, 0.170 kg m² | ESTIMATED: the wing as a 0.40 kg bar of 1.555 m (0.081) and the rest (0.01); in pitch the motor 0.18 kg at 0.27 m, the pack 0.33 kg at 0.15 m, the tail 0.10 kg at 0.62 m, the fuselage shell 0.35 kg over 1.04 m and the wheels (0.095 together); Izz a little under Ixx plus Iyy |
| Aileron, elevator, rudder travel | ±30, ±20, ±27 deg | E-flite's high rates, 33, 20 and 30 mm, over the drawn surfaces' chords at the horn, 64.8, 60 and 65 mm: asin(33/64.8), asin(20/60), asin(30/65). ESTIMATED to a couple of degrees |
| Flap travel | 18.0 deg half, 32.7 deg full | E-flite's 20 and 35 mm at the trailing edge over the drawn flap chord, 64.8 mm |
| Flap to elevator mix | 16 percent down at half, 30 at full | E-flite manual, "Flap/Down-Elevator Compensation" |
| Flap speed | 2.0 s up to full | E-flite manual, the DX8's flap system, "SPEED 2.0S" |

No published figure gives the model's speeds. What pilots report, and
the bands honour, is qualitative: "within 3 feet of runway at 20% flaps"
on 3S (the review above), "with flaps deployed and a blip of throttle, it
instantly heads skyward", a landing roll that is short with full flaps,
and with the slats on "they just sort of mushed along and never dropped a
wing" (Model Aviation). Flaps up and on 4S it is fast and aerobatic.

### The geometry

Taken off Horizon Hobby's product photographs of the aircraft, the side
views of it standing on its wheels above all, scaled to the published
length, and drawn in `src/render/timbercraft.js`; ESTIMATED to about 10
percent. The drawn model's wheels, 108 mm, match E-flite's 4.25 in wheel
set (EFL5258), and its rest attitude, 11.8 deg, the photographs' 11.2.

| Quantity | Value | How |
| --- | --- | --- |
| Horizontal tail span, area | 0.56 m, 0.071 m² | photographs; 0.150 m root and 0.110 m tip chord |
| Tail arm l_h | 0.548 m | wing quarter chord, which is the CG, to the tail's quarter chord |
| Tail aspect ratio, lift slope a_t | 4.42, 4.33 /rad | 2π AR/(AR+2) |
| Tail efficiency η | 0.9 | Nelson, ch. 2 |
| Downwash gradient dε/dα = 2 a_w/(π AR) | 0.460 | Nelson eq. 2.22 |
| Horizontal tail volume V_H | 0.464 | derived |
| Elevator effectiveness τ_e | 0.65 | Nelson fig. 2.20, the elevator 40 to 55 percent of the tail's chord |
| Fin and rudder, area S_v | 0.0314 m² | the drawn fin, its rudder running from the fuselage's bottom to the fin's top |
| Fin arm l_v, height z_v | 0.625 m, 0.09 m | drawn |
| Fin effective aspect ratio, lift slope a_v | 1.8, 2.98 /rad | its own 1.2 raised half again by the stabiliser and fuselage |
| Vertical tail volume V_V | 0.035 | derived |
| Rudder effectiveness τ_r | 0.6 | Nelson fig. 2.20, the rudder about 40 percent of the chord |
| Fuselage volume | 0.0073 m³ | 1.04 m by 0.09 by 0.13 with a 0.6 fill |
| Ailerons | 0.340 to 0.700 m out, the aft 27 percent | photographs |
| Flaps | 0.052 to 0.334 m out, the aft 27 percent, S_flapped/S 0.375 | photographs |
| Slats | 0.10 to 0.69 m out, S_slatted/S 0.784 | photographs; the manual's slat pockets |
| Effective dihedral Γ | 1.5 deg | a flat wing on a high mount, its tips drooped; ESTIMATED |
| Thrust line | through the CG | ESTIMATED: the drawn CG is on the thrust line, the pack under the wing and the wing on top balancing about it |

## The coefficients

The aero convention (x forward, y right, z down), as for every other
aircraft, turned into the body frame by the plant. Per radian. Printed by
`npm run timber:derive`.

| Coefficient | Value | Formula |
| --- | --- | --- |
| CLα, aircraft | 5.25 | a_w + a_t (S_h/S) η (1 − dε/dα), Nelson eq. 2.52 |
| Neutral point h_n | 0.441 c | 0.25 + V_H η (a_t/a_w)(1 − dε/dα), less the fuselage's 0.011 (Raymer eq. 16.25, K 0.006 per deg) |
| Static margin | 0.19 | h_n − 0.259 |
| Cmα | −1.004 | −CLα x static margin |
| Cm0 | +0.0853 | trims at 13 m/s with the elevator at zero |
| Cmq | −8.53 | −2 η a_t V_H l_h/c, Nelson eq. 3.43 |
| Cmδe | 1.175 | η V_H a_t τ_e |
| CLδe | −0.498 | −η (S_h/S) a_t τ_e |
| CYβ | −0.369 | −a_v S_v/S, and −0.11 for the fuselage's side, 0.125 m² |
| Cnβ | +0.087 | a_v V_V, less the fuselage's 1.3 Vol/(S b) |
| Cnr | −0.095 | −2 a_v V_V l_v/b, and −CD0/4 |
| Clβ | −0.047 | −a_w Γ (1+2λ)/(6(1+λ)), and −a_v (S_v/S)(z_v/b) |
| Clp | −0.806 | −a_w (1+3λ)/(12(1+λ)), strip theory |
| Clδa | +0.391 | 2 a_w τ_a c (y_2² − y_1²)/(2 S b), τ_a = 0.630 x 0.80, thin aerofoil theory for a 27 percent surface and the large deflection factor at 30 deg |
| Clr, Cnp | +CL/4, −CL/8 | Nelson table 3.4 |
| Cnδa | −0.133 CL | 2 K CL Clδa, K = −0.17 |
| Cnδr, CYδr, Clδr | −0.0624, +0.155, +0.009 | −V_V a_v τ_r, a_v (S_v/S) τ_r, CYδr z_v/b |
| Stall blend | ±3 deg | the Cub's |

### The prop

A tractor turning clockwise seen from the cockpit, as the Cub's: torque
rolls it left, P factor yaws the nose left at a positive angle of attack
(κ 1.6, the Cub's). Ideal disc power at 25 N through the 11 inch disc is
322 W; at the loaded 10,060 rpm that is 0.306 N m, 0.0122 m per newton;
the electrical route, 80 percent of 660 W, gives 0.50 N m. Not modelled,
as on the Cub: the slipstream over the tail, which on the real aircraft
lifts the tail almost at once on a full throttle take off, and
gyroscopic precession.

## The flaps and the slats

What this aircraft adds to the plant. Both are table entries, zero on
every other aircraft, and every term they add goes through the plant's
`add_term`, so a zero leaves the other aircraft's arithmetic bit for bit
what it was: their recorded trace hashes are the proof (T14).

### The flaps

Slotted flaps on the inner 43 percent of each half span, the aft 27
percent of the chord, hung on external hinges under the wing. Their angle
is plant state, positive trailing edge down, moving toward the notch's at
0.285 rad/s, which is E-flite's 2.0 s from up to full.

- **Lift.** Thin aerofoil theory for a 27 percent flap: the hinge at
  θ_h = arccos(1 − 2 x 0.73) = 117.4 deg gives τ = 1 − (θ_h − sin θ_h)/π
  = 0.630. The section's lift per radian, 2π τ, times DATCOM's large
  deflection factor for a single slotted flap, 0.90 at 18 deg and 0.75 at
  33 (read to about ten percent), times a_w/2π for the wing and the flapped
  area ratio 0.375: ΔCL 0.323 at half and 0.489 at full, which the plant
  holds as a d + b d² through both, a = 1.2391, b = −0.6681. The flaps add
  this lift at every angle of attack.
- **CLmax.** Raymer eq. 12.21: 0.9 x 1.3 (a single slotted flap's ΔClmax)
  x 0.375 is 0.439 at the landing deflection, linear in the angle, 0.7689
  per radian. The flaps raise the stall's CL by less than they add at every
  alpha, so the stall comes at a lower angle of attack, by (0.489 − 0.439)/
  CLα = 0.5 deg at full, as it does on the real thing.
- **Drag.** Raymer eq. 12.61 for the profile drag, F = 0.0074 for a slotted
  flap: 0.0074 x 0.27 x 0.375 x (δ − 10 deg); and the part span flap's
  induced drag, 0.14² ΔCL²: 0.0080 at half and 0.0217 at full, held as
  0.0666 d². The induced drag of the whole wing's lift is already in the
  polar, since the flaps' lift is part of the CL it squares.
- **Pitching moment.** Two parts, per unit of the lift the flaps add. The
  section's own nose down moment, thin aerofoil theory's −½ sin θ_h (1 −
  cos θ_h) = −0.648 per radian over its 2π τ of lift, −0.164; and the
  downwash the flaps add at the tail, which pushes the tail down and the
  nose up: Δε = k 2 ΔCL/(π AR), with k = 1.5 for flaps on the inner span
  and the tail in their wake (ESTIMATED; k = 1 is the whole wing's
  average), times η V_H a_t, +0.258. Net +0.094 per unit, +0.046 nose up at
  full flap. k from 1.25 to 1.75 is 0.025 to 0.067, the band T7 holds.
- **The radio's mix.** The manual programs 16 percent of the elevator's
  travel down at half flap and 30 at full. That is 3.2 and 6.0 deg; holding
  the trim at the same lift would take 4.5 and 6.8, the flaps' moment and
  the lower angle of attack their lift asks for, at Cmα. The plant carries
  the mix as the transmitter would, a line through both notches, −0.1835
  rad of elevator per rad of flap, added to the stick's elevator within its
  travel, in every mode. T8 holds that it takes most of the flaps' pitch
  up out: with it the nose rises a sixth as far as without.

### The slats

Fixed slats on 78 percent of the span, fitted by default, since the
aircraft is flown here for what it is best at. Raymer's ΔClmax for a
fixed slat, 0.4 c'/c with c'/c 1.08, times 0.9 and the slatted area ratio,
is 0.305: CLmax 1.455 against 1.15. A slat does not change the lift at a
given angle of attack; it delays the separation, so in the plant it raises
CLmax alone, which moves the stall along the same lift curve to an angle
of attack 3.3 deg higher. The stall speed falls from 8.10 to 7.20 m/s by
the formula (T2, T3). They cost 0.004 of drag. `sim_wing_set_slats(0)`
takes them off, as the manual's "for optimized high speed performance"
does; nothing in the shell does that yet, since only the gates need it.

### The control

The notch is a mode, like the stabiliser's: `sim_wing_set_flaps(0|1|2)`,
kept across resets, which put the flaps where the notch has them, and
cleared by an airframe change. The shell steps it with F, up, half, full
and round again, as a three position flap switch is flipped; the OSD's
flight block says where the flaps are, under the flight mode, in the
string table's words ("Flaps up", "Flaps half", "Flaps full"; Spanish
"Flaps arriba", "Flaps a medias", "Flaps completos"), and a notice repeats
it for a moment. Parked on the strip the plant is not stepped, so the
shell settles the flaps at once (`sim_wing_flaps_settle`) when F is
pressed there, as the servos would have while it sat. The renderer reads
the angle back through `sim_wing_flaps` and lowers the drawn flaps.

No gamepad button: in src/input a gamepad's buttons are radio switches,
read only for the menu's select and back, and a radio in joystick mode
reports its switches as latched buttons whose numbering is the radio's
own. A flap button would need an assignment step in the calibration
wizard, which is a feature of its own and not this aircraft's.

## Derived performance, the bands the plant must land in

Computed by `scripts/timber-derive.js` from the numbers above. Bands are
the Cub's in proportion about the derived figure unless a row says
otherwise, and are in `tests/timber-thresholds.json`.

| Check | Derived | Band |
| --- | --- | --- |
| T1 cruise, level at 75 percent, flaps up | 17.97 m/s (65 percent 15.4, top 24.2) | 15.5 to 20.8 |
| T2 stall, power off, slats on, flaps up | 7.20 by the formula, 8.73 with the plant's blended lift at the stall alpha | 6.8 to 8.9 |
| T3 the same, slats off | 8.10, 9.79; faster than T2 | 7.6 to 10.0, and over T2 |
| T4 the same, slats on, flaps full | 6.31, 7.92; slower than T2 | 5.9 to 8.1, and under T2 |
| T5 slowest level flight, flaps full, power on | 6.29 m/s at full throttle, 7.3 deg nose up, alpha a blend short of the stall | 5.7 to 7.2, the wings within 10 deg |
| T6 roll, full aileron, pb/2V | 0.254 (280 deg/s at 15 m/s) | 0.18 to 0.34 |
| T7 the flaps' moment and lift at full | ΔCm +0.046, ΔCL 0.489 | 0.025 to 0.067 nose up, 0.42 to 0.56 |
| T8 the manual's mix | takes the flaps' pitch up out | the nose rises under half as far as without it |
| T9 standing on its wheels | 11.81 deg, CG 0.2117 m, 12.8 percent on the tail | 10.8 to 12.8, 0.205 to 0.218, 9 to 17 percent, no hull |
| T10 take off roll, flaps full | 2.22 m to liftoff at 7.04 m/s | 1.6 to 3.2 m, 6.4 to 8.3 m/s |
| T11 take off roll, flaps up | 2.81 m at 7.90 m/s; the full flap roll 0.79 of it | 2.05 to 4.1 m, 7.2 to 9.3 m/s, full flap under 0.9 of it |
| T12 landing roll, full flaps, no brakes | 19.0 m from 7 m/s | 13 to 25 m, at rest within 1.5 deg of T9, no hull or prop |
| T13 taxi, full rudder at walking pace | L/tan δ = 0.714/tan 27° = 1.40 m | 1.12 to 1.96 m, turning right |
| T14 every other aircraft | their recorded hashes | identical |
| T15 Node and Chrome on a Timber take off | SHA-256 | identical |

The stall bands run from 0.94 of the formula to 1.02 of the blended
figure. The plant's lift at the stall alpha is not CLmax: the stall is a
cubic blend, three degrees either side, from the linear lift to a flat
plate, and at its middle it is half of each, so the formula is the floor
of what a slow pull up can measure and the blend its ceiling.

The take off is flown the way this aircraft is flown off a strip: full
throttle, the stick forward to bring the tail up to 9 deg of pitch, which
keeps the flapped wing short of its stall, and the wings held level. It
is derived in the Cub's two phases, three points until the elevator and
the wing's own nose down moment lift the tail off the grass (5.8 m/s)
and then the tail held at 9 deg, liftoff when the lift matches the
weight. Held on three points the flapped wing is past its stall (16.8 deg
of alpha at the rest attitude against 15.3): it would lift off at 9.8 m/s
after 5 m, longer than with the flaps up. That is why a STOL pilot lifts
the tail a little first, and why the manual says half flaps and to "pull
back gently" as the tail comes off.

The landing roll is long, and it is not the "lands in its own length" the
aircraft is sold on. That claim is made on grass with a headwind, and on
the Evolution with its optional thrust reversing, and this simulator has
no wind, no reverse and no brakes: the only things slowing a Timber on the
ground here are the grass's rolling resistance, the Cub's 0.08, and the
stalled, flapped wing's drag with the tail held down. Both are gated as
they are rather than tuned to a marketing figure.

## The landing gear

The Cub's model, unchanged, with this aircraft's numbers: each wheel a
circle touching at the rim's point nearest the ground, a spring and damper
along the ground normal, rolling resistance along the wheel and side grip
across it, the tailwheel steered with the rudder one to one, and the
prop's lowest tip a skid. The wheels are where `src/render/timbercraft.js`
draws them (TIMBER_DIMS), turned from its frame into the body frame, so
the drawn tyres and the physics' tyres are the same tyres.

| Quantity | Value | How |
| --- | --- | --- |
| Main wheels, axle centre | x +0.057, y ±0.150, z −0.173 m as drawn, −0.17785 unloaded | TIMBER_DIMS |
| Main tyre radius | 0.054 m | TIMBER_DIMS, E-flite's 4.25 in wheels |
| Tailwheel, axle centre, radius | x −0.650, y 0, z −0.065 as drawn, −0.0711 unloaded; 0.015 m | TIMBER_DIMS |
| Three point attitude | 11.81 deg nose up, the CG 0.2117 m over the grass | the drawn model at rest; the photographs show 11.2 |
| Static loads | 7.27 N on each main, 2.13 N on the tail (12.8 percent) | moments about the contacts at rest |
| Main leg stiffness, damping | 1500 N/m, 43 N s/m | 4.85 mm of static deflection; 0.6 of critical on half the mass |
| Tailwheel stiffness, damping | 350 N/m, 10 N s/m | 6.1 mm; 0.6 of critical on the tail's 0.214 kg about the mains |
| Rolling resistance, side grip | 0.08; 0.70 mains, 0.60 tail | the Cub's grass and tyres |
| Tailwheel steering | 1.0 x the rudder, ±27 deg | linked to the rudder |
| Wheelbase | 0.714 m | three point |
| Prop tip skid | x +0.29, z −0.1397 m, 3000 N/m, 40 N s/m, 0.8 | 87 mm over the grass level on the mains |
| Hull | 0.6 by 1.2 m, 0.05 down, 0.12 up | inside the gear, see above |
| Camera | x +0.205, z +0.049 m | on top of the cowl |

## Conventions

The Cub's, unchanged, and for the flaps: the angle is positive trailing
edge down, radians, read back through `sim_wing_flaps()`; the notch is 0
up, 1 half, 2 full. `sim_plane_surfaces` reports the elevator with the
mix in it, since that is where the servo is.

## The stabiliser

The Cub's, with the Timber's gains: roll 1.2 and 0.12 in Stabilised, the
Cub's, since its roll authority per stick is within two percent of the
Cub's; Acro to 180 deg/s of roll and 100 of pitch, the roll loop at 3.0,
0.30, feed forward 0.25 and integral 4.0; the turn coordinator at 2 stick
per rad/s, for a rudder with 1.4 times the Cub's yaw acceleration per
stick. On the wheels every mode is Manual, as on the Cub. The flaps are
not the stabiliser's: they and the mix are the same in every mode, and
the loops fly on top of them (`npm run timber:stab`: Stabilised flies
level on full flaps at 9.4 m/s, Acro holds its attitude within half a
degree while they come down).

## The script that made the numbers

`scripts/timber-derive.js` (`npm run timber:derive`) does all of the
above from the inputs in the tables and prints every coefficient, the
flaps' and slats' increments, and every derived figure in the band table.
It never loads the plant. In outline, beyond the Cub's:

```
flap lift: 2 pi tau eta(d) d (a_w/2 pi)(S_f/S), fitted a d + b d^2
flap CLmax: 0.9 x 1.3 x S_f/S at full, linear; slats 0.9 x 0.4 x 1.08 x S_s/S
flap drag: 0.0074 x 0.27 x S_f/S x (d - 10 deg) + 0.14^2 dCL^2, fitted c d^2
flap moment per dCL: cm_TE/(2 pi tau) + k eta V_H a_t 2/(pi AR)
aero(alpha): the plant's lift and drag with the stall blend, the flaps'
lift added and their CLmax and the slats' raising the stall
stall: sqrt(2W/(rho S CLmax)) and with aero() at the stall alpha
slowest: the lowest V where lift plus T sin(theta) holds W and T cos(theta)
holds D at alpha a blend short of the stall, throttle at or under full
take off: three points until the nose down moment lifts the tail, then
9 deg, liftoff when lift is weight
landing: three points from touchdown, drag and rolling resistance only
```
