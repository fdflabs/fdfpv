# Kadet Senior, stage 1: the aircraft, the model and what it is meant to do

The owner asked for "a 4 stroke nitro powered Kadet Senior with two tone
translucent MonoKote covering". This file gives every number the plant is
built from with its formula and source, the behaviour and how each part of
it is gated, the landing gear, the crash parts, the covering and the
engine's sound, and the check table with its bands. It follows
`docs/BOMBSHELL-STAGE1.md`, since the two are both three channel aircraft
on a glow engine that bank on the rudder through their dihedral, and uses
the same plant, `src/native/plant_wing.c`, with a parameter table of its
own. Where this file says "the Bombshell" it means that aircraft and that
document.

## The aircraft

SIG Manufacturing's Kadet Senior, kit RC58 (not RC-45: the instruction
book's own title is "Sig Kadet Senior SIGRC58"), is Claude McCullough's
built up balsa trainer. SIG's product page: "This is the original
3-channel KADET SENIOR build-it-yourself kit ... If the student pilot gets
confused, merely let go of the control sticks and the KADET SENIOR will
recover itself and return back to level flight." Its instructions: "a
stable, high wing design using a flat bottomed airfoil ... It is more of a
'hands off' flier because of increased dihedral and larger tail surfaces,
but because of this, will not be suitable for aileron control and in fact,
does not need it." So the classic kit has **no ailerons**: rudder,
elevator and throttle, and the manual has the rudder servo plugged into
the aileron channel, "assume that the rudder is an aileron". SIG's Kadet
Senior ARF is a different aircraft (80 1/4 in, 1180 sq in, ailerons,
reduced dihedral) and is not this one.

It stands on a **tricycle gear** ("Tricycle landing gear for easy ground
handling", SIG's page; "Steerable Nose Gear", SIG's 2006 page): a 5/32 in
formed nose leg in a nylon bearing on the firewall, steered with the rudder
from the same servo, and two 5/32 in formed main legs as torsion arms in
hardwood blocks under the cabin.

| Quantity | Value | How |
| --- | --- | --- |
| Span b | 1.9812 m | SIG, 78 in |
| Wing area S | 0.7419 m² | SIG, 1150 sq in |
| Mean chord c = S/b | 0.3745 m | derived, 14.74 in; the wing is a constant chord, so this is the drawn chord too |
| Aspect ratio | 5.29 | derived |
| Length | 62 in | SIG |
| All up mass m | 2.7216 kg | SIG, "Flying Weight 6 lbs"; no range is published |
| Wing loading | 35.98 N/m² | derived; SIG quotes 12 oz/sq ft, the same |
| CG | 3 7/8 in behind the leading edge, at the main spar | SIG, "Center of Gravity 3 7/8 inch At Main Spar"; 26 percent of the chord |
| Incidences, thrust | wing +1.5 deg, stabiliser 0, engine 6 deg down and 0 right | SIG's set up specifications; the manual: the downthrust "is built in", no right thrust on the plan |
| Dihedral | 3 in under each tip, 4.40 deg a side | the manual, step 18: "With one half of the wing flat on the table, raise the other half 6", measured at the bottom of the tip rib". SIG's page says "Dihedral 3 degrees"; the manual is the build authority, and 3 in a side is its reading |
| Throws | elevator 3/4 in up and down, rudder 7/8 in each way, at the trailing edge | the manual's control movements drawing and SIG's page |
| Wheels | mains 3 3/4 in, nose 3 1/4 in | SIG's page ("Main Wheels 3.75 inch", "Nose Wheel 3.25") |
| Engines | 4 stroke .35 to .65 cu in; the manual's pictures use an O.S. .40 four stroke | SIG's page, the manual |
| Channels | throttle, elevator, rudder (and the nose wheel on the rudder's servo) | SIG |

### The engine: an O.S. FS-52 Surpass on a 12 x 6

The .52 is inside SIG's 4 stroke range, and owners fly Senior on 45 to 56
size four strokes ("Saito 45 (probably the best match)", "Saito 56
(probably the most sensible)", RC Universe's Kadet Senior thread). O.S.'s
manual for the FS-52S: 8.56 cc (0.523 cu in), bore 23.0 mm, stroke 20.6
mm, practical rpm "2,300 ~13,000", "0.9bhp/12,000r.p.m.", 434 g, and its
prop list gives "Scale models 11x7-8, 12x6, 12.5x6". The 12 x 6 is the
one. An owner measured it on the ground: "I only use the 12x6, turns 9500
with 15% wildcat" (RC Universe, "OS FS-52 Prop Size"); another "11x8 ...
turned at 10,600", and O.S.'s own support in the thread "keep your rpm in
the 10-11,000 range". No static thrust is published.

| Quantity | Value | How |
| --- | --- | --- |
| Full rpm on the ground | 9,500 | the owner's measurement above |
| Static thrust | 27.83 N | C_T ρ n² D⁴, C_T 0.105 for a wooden 12 x 6 at rest, ESTIMATED (the class's static thrust coefficient in the UIUC propeller data is 0.10 to 0.11) |
| Shaft power at that rpm | 576 W, 0.77 hp | C_P 0.045, ESTIMATED; against O.S.'s 0.9 bhp at 12,000, which a four stroke's torque curve puts at about 0.75 hp at 9,500 |
| Pitch speed, loaded | 24.13 m/s | 9,500 rpm times 6 in |
| Idle | 2,300 rpm, 0.2421 of full | O.S.'s lowest practical rpm; "A good idle will be 2,300-2,400 RPM or lower" (RC Universe, "OS 52 Surpass rpms") |
| Prop torque arm | 0.0125 m | ideal disc power 347 W at 9,500 rpm is 0.349 N m at 27.8 N |
| Downthrust | a level line 0.0335 m over the CG | SIG's 6 deg down through the hub 17.4 in ahead of and 0.5 in under the CG pitches the nose as a line 1.32 in over the CG does; the tenth of the thrust that points down is not modelled |

The throttle is the Bombshell's `throttle_idle`: the stick runs the rpm
linearly from the idle's 0.2421 to full, and the engine never stops. At
idle it turns 2,300 rpm and pushes 1.63 N standing, against 2.14 N of the
grass's rolling resistance; its pitch speed at idle, 5.8 m/s, is under
anything it flies at, so it makes no thrust in a glide. There is no pack
current: the pack is a 2S receiver pack.

### The outline

SIG sells the plan and publishes no drawing, so beyond the published
figures the outline is ESTIMATED off SIG's box art, a side view of the
kit's prototype (the photograph on the manual's cover and on sigmfg.com
since 2000), scaled by the 62 in length, and off the kit's wood list.
`src/render/kadetcraft.js` draws it, in real inches from the prop's plane:

| Part | Value | How |
| --- | --- | --- |
| Wing | 14.74 in chord, tips sheeted and rounded over the last 3 in, leading edge at station 13.5 | SIG's area over its span; the tip sheeting, "1/16"x3"" in the kit |
| Section | flat bottomed, about 13 percent | SIG "flat bottomed airfoil"; the thickness is NOT published and is ESTIMATED from the spar depth; zero lift -4 deg as a Clark-Y's |
| Stabiliser | 31 in across, 8 in chord, the elevator the aft 3 in in two halves round the rudder | the elevator's trailing edge is the kit's 3/16 x 3/4 x 30 in stick; the chord off the box art |
| Fin and rudder | 57.8 sq in of fin over the stabiliser, the rudder 51.5 sq in, 3.5 in chord, running down to the fuselage's bottom as the box art shows | the box art; the kit's rudder trailing edge stick is 11 in, which the box art's rudder outgrows below the stabiliser, so this is ESTIMATED |
| Fuselage | 3.75 in wide, the cabin 9 in deep, sheeted to the wing's trailing edge, a truss behind | the kit's formers and side sheets (3/32 x 4 3/4 x 24 in), the box art |
| Gear | nose axle 11.9 in ahead of the CG, mains 3.6 in behind on a 13 in track, level at rest, the CG 0.3072 m up | the box art; ESTIMATED |

## The coefficients

The Bombshell's method, turned into the body frame in the plant as the
other planes' are. Per radian. `npm run kadet:derive` prints each one.

| Coefficient | Value | Formula |
| --- | --- | --- |
| a_w, a_t, a_v | 4.533, 4.154, 2.793 | 2π AR/(AR+2), the wing's times cos² of its dihedral, 0.994 |
| CLα | 5.029 | a_w + a_t (S_h/S) η (1 − dε/dα), η 0.9, DATCOM's downwash 0.380 |
| Static margin | 0.268 | V_H 0.549, neutral point 0.281 c behind the wing's aerodynamic centre |
| Zero lift line | 4.62 deg under the thrust line | -4 deg at 1.5 deg of incidence, and the tail's share |
| Cmα, Cmq | −1.3471, −10.534 | −CLα SM; −2 η a_t V_H l_h/c |
| Cm0 | +0.0783 | level at three quarter throttle with the elevator neutral, the downthrust's moment included: SIG's trimming, "with the model flying at about 3/4 throttle, feed in down trim until the model flies level" |
| Cmδe, CLδe | 1.129, −0.440 | τ_e 0.55 for 36 percent of the stabiliser |
| CYβ, Cnβ, Cnr | −0.265, +0.1134, −0.1374 | the fin, less the box fuselage's −0.0163 (Nelson eq. 2.64, 0.24 m² of side area) |
| Clβ | −0.1259 | the dihedral's −aw Γ/4, the fin's, and a high wing on a deep body, DATCOM's −1.2 √AR (z_w/b)(2d/b), −0.0287 |
| Clp | −0.755 | strip theory |
| Cnδr, CYδr, Clδr | −0.0830, +0.1699, +0.0065 | τ_r 0.64 for 47 percent of the fin |
| CD0, e | 0.042, 0.75 | ESTIMATED: film over a built up frame (about 0.026 of skin friction on 3.3 times the wing's area wetted), an open engine and silencer, wire gear and 3 3/4 in wheels, interference |
| CL max, stall blend | 1.15, 4 deg | a 13 percent flat bottom at 2e5 (9 m/s on 0.374 m), the Clark-Y class's 1.3 times 0.9 for the wing; the Slow Stick's 4 deg blend |
| Stall arms, stall_dw | 0.0128, 0.1372, 0.1721 | stall:derive: the CG 4.8 mm behind the wing's aerodynamic centre; the plate's centre of pressure at 0.40 c; η V_H a_t (dε/dα)/a_w |
| stall_top, stall_k | 6.7 deg, 0.72 | the Clark-Y at 2e5 (Selig, UIUC), the table's convention |
| Washout | 3 deg | FITTED, as every aircraft's is (docs/STALL-STAGE1.md); a throwaway 6 deg changed nothing the gates read |
| Inertia | 0.22, 0.29, 0.48 kg m² | ESTIMATED: the wing as a 0.62 kg bar, the engine 0.52 kg 0.38 m ahead, the fuel 0.26 m ahead, the tail 0.12 kg at 0.96 m, the fuselage along its length |

## What is new in the plant

Nothing. The Bombshell's glow throttle and three channel mix, the Cub's
wheel model with its tyre slip (#88) and the stability axes (#84) fly it,
and a steerable nose wheel is a wheel whose `steer` is negative: sim.c
turns a wheel's front against the rudder's trailing edge, which is right
for a tailwheel behind the CG; a nose wheel ahead of it turns the other
way, and 0.6 of the rudder is the steering arm's throw. S17 holds every
other aircraft's recorded hash.

## The intended behaviour, and how each part is proven

Each part is a gate in `scripts/kadet-gates.js`, flown in Manual. Bands
are the Bombshell's in proportion about this aircraft's derived figure.
Three of the Bombshell's gates are entered the way this aircraft is flown,
and the first run, with the Bombshell's entries, is why:

- **S9, the stall.** The Bombshell cruises at 1.25 times its stall; the
  Kadet at twice it, where full up is a zoom to 52 deg of pitch and back
  through its phugoid, not a stall. So it is entered from level flight at
  1.2 Vs with the throttle closed, the approach a trainer is taught, and
  held 16 s: the Bombshell's 8 s scaled by the two phugoids, 10.1 s
  against 5.6, since at 8 s the mush had not settled (2.32 m/s, then 2.12
  at 20 s). Power on is half throttle: at three quarters the FS-52 pulls
  9.8 N against the mush's 5.6 N and climbs the Kadet at full up until it
  hangs on its prop and torque turns it, 27 deg of bank, which is not a
  stall.
- **S13, the throw.** The manual's hand launch, "run into the wind at a
  fast trot ... It is not necessary to achieve a lot of velocity", at 9
  m/s and full throttle with the elevator that trims 9 m/s. With the
  elevator neutral it dives to its 14.6 m/s trim, 4.1 m in 3 s.
- **S16, the landing.** A glide trimmed for 14.6 m/s has to be flown down
  to landing speed, so the harness pilot holds 1.3 Vs on the elevator and
  flares from 1.2 m.

| Check | Derived | Band | Measured |
| --- | --- | --- | --- |
| S1 level at 75 percent stick | 14.58 m/s | 12.54 to 16.99 | 14.49 |
| S2 stall, power off | 7.15 m/s | 6.72 to 8.12 | 8.06 |
| S3 glide at 10 m/s | L/D 8.43 | 7.50 to 9.44 | 8.40 at 10.25 m/s |
| S4 top speed | 18.28 m/s | 16.64 to 20.53 | 18.26 |
| S5 best climb | 4.92 m/s at 10.1 | 3.35 to 5.90 | 4.78 at 11.9, 25 deg of pitch |
| S6 30 deg bank let go, at 6 s | 19.7 deg | 9.1 to 30.5 | 13.7 (23.3 at 2 s) |
| S7 full roll stick, 1 s | 20.3 deg | 12.4 to 30.9 | 19.0, right wing down |
| S8 level 45 deg turn, full throttle | 33.2 m at 18.1 m/s | 28.3 to 38.2, 15 percent of the formula | 35.0 m, 5 percent |
| S9a full up, power off | mush at 13.6 deg, 9.0 m/s, sink 1.88 | 1.41 to 2.35, bank 15, yaw 20 | sink 2.14 at 9.11, bank 0.1, yaw 0.1 |
| S9b full up, half throttle | | bank 15, yaw 20, pitch over −35 | bank 6.1, yaw 6.0 deg/s |
| S10 phugoid | 10.06 s | 8.27 to 11.76 | 9.90 s |
| S11 prop torque | 0.349 to 0.579 N m | 0.297 to 0.66 | 0.348, rolling left |
| S12 throttle chop | | pitch within 30 deg | 11.7 |
| S13 hand launch | | not down 1.5 m, over 1.2 Vs | climbed 12.3 m, 10.4 m/s |
| S14 at rest, idling | 0.34 deg nose down, 28.7 percent on the nose | −0.84 to 0.16, 0.302 to 0.312 m, 23 to 34 percent | −0.43, 0.3071 m, 29.3 percent |
| S15 take off | 4.42 to 9.63 m, 1.1 to 1.5 Vs | the same | 8.75 m at 10.33 m/s |
| S16 landing | | under 1.23 Vs, 8.81 m/s | touched at 7.69, rolled 41 m, at rest level |
| S17 other aircraft unmoved | main's hashes | identical | identical |
| S18 Node and Chrome | | identical | f153f3efb5a0c4ad both |
| S20 idle on the strip | 2,300 rpm, stands | 2,185 to 2,415 rpm, under 1 mm/s | 2,300 rpm, 0.60 mm/s, stands |
| S21 throttle closed, let go | 14.08 m/s sinking 2.32 | 2.07 to 2.60, 12.11 to 16.40 m/s | 2.41 at 14.24 |

`npm run kadet:gates`: 21 of 21.

**S20 stands, on the band it failed.** At idle the Kadet should stand:
1.63 N of thrust against 2.14 N of rolling resistance. It first crept at
2.6 mm/s, its ground speed reading 1.96 mm/s. sim.c took each wheel's
friction straight after its own strut's push, and a strut's push ahead
of or behind the CG pitches the body and moves every contact point along
the ground, so each wheel's friction stopped a motion the next strut
undid and the pass ended with the body moving; and the thrust each step
adds to the velocity is integrated into the position before the ground
has its say, so even friction solved exactly let it creep 0.5 mm/s. Now
every strut pushes first and the wheels' friction is solved together,
holding each contact point against the next step's push as well as this
one's (sim.c, wheels_friction). It moves 2.4 mm in the first second, as
it settles 0.43 deg nose down onto its struts and the CG pivots forward
over the tyres, and 0.0006 mm/s after that. The ground speed the gate
reads, 0.60 mm/s, is the step's push backwards, held in the state at the
end of the step for the next step's push to cancel, the same bookkeeping
that has an aircraft on its struts rising at g dt there.

### Its stall, and what a pilot should expect

`npm run stall:probe -- --only kadet`: full back from 1.15 Vs, the wing
stalls at 2.2 s and the nose drops 15.5 deg in 2.2 s with no wing drop;
it settles in a mush at 14.7 deg of alpha, 9.0 m/s; full back and full
rudder make a spiral, 50 deg/s of yaw at 42 deg of bank, not a spin; let
go, it recovers in 0.09 s. That is SIG's ARF manual's description of the
family, "the SENIOR stalls cleanly, simply dropping the nose and resuming
normal flight", and RC Universe's "Can go very slow and is self
correcting".

## The landing gear

The Cub's model: each wheel a spring and damper along the ground normal,
friction split along its heading and across it with the tyre's slip, and
the prop's lowest tip a skid. Numbers are the drawn model's (`KADET_DIMS`).

| Quantity | Value | How |
| --- | --- | --- |
| Main wheels | x −0.0921, y ±0.1651, z −0.2596 drawn, −0.2676 unloaded; r 0.0476 | SIG's 3 3/4 in on the drawn gear |
| Nose wheel | x +0.3016, z −0.2659 drawn, −0.2739 unloaded; r 0.0413 | SIG's 3 1/4 in |
| Rest | level, the CG 0.3072 m over the grass | the drawn gear |
| Static loads | 10.23 N each main, 6.24 N nose (23.4 percent) | moments about the contacts |
| Stiffness, damping | mains 1278 N/m, 50.1 N s/m; nose 780 N/m, 47.7 N s/m | 8 mm of static deflection, 0.6 of critical |
| Friction | rolling 0.08, side 0.70, the tyre's slide | the Cub's |
| Steering | the nose wheel at 0.6 of the rudder | the steering arm on the rudder's servo, ESTIMATED |
| Brakes | on the mains, the brake key's | as every wheeled plane's; the kit has none |
| Prop tip skid | x +0.4413, z −0.1651 | the 12 x 6's tip, 0.142 m over the grass |
| Hull | hx 0.45, hy 0.9906, 0.163 down, 0.119 up | the centred box, for crashes only |
| Camera | x +0.2127, z +0.0572 | on the cowl's top behind the engine |

## The crash parts

`PARTS_KADET1981`, 17 parts, on the Bombshell's balsa (nothing crushes; a
joint cracks past its onset and breaks past its limit) and ply:

| Joint | Limit | Derivation |
| --- | --- | --- |
| rear fuselage truss | 30 N m, 300 N | a 1/4 in balsa longeron buckles between uprights 4.4 in apart at Euler's π²EI/L², 362 N at 3.4 GPa, 36 N m over the 4 in bay; less for its glue joints |
| wing on its bands | 15 N m, 80 N | eight #64 bands at about 10 N, ESTIMATED as the Bombshell's #32s are |
| each panel | 93 N m up and down, 52 fore and aft | the two spar boxes (1/4 x 1/2 in spars 41 mm apart, 66 N m; 3/16 x 3/8 in 30 mm apart, 27); the 1/2 in leading edge and 7/16 x 1 3/8 in trailing edge, 6.8 and 45 |
| stabiliser, fin | 5.7, 3.3 N m | their 3/8 and 5/16 in frames at balsa's 20 MPa |
| elevator, rudder | 1.0, 0.8 N m | CA hinges, ESTIMATED |
| engine | 24 N m, 800 N | four 6-32 blind nuts in 5/32 in ply, about 400 N each, ESTIMATED |
| prop | yields 12 N m, sheds a blade at 24 | a wooden blade at a hardwood's 100 MPa |
| gear | WIRE_M of 5/32 in, 22 N m | music wire |

Flown with damage on (a throwaway probe): 9 m/s at 15 deg down, 10 at 10
and 12 at 15 write nothing; 10 m/s at 20 deg folds the nose leg, and the
nose's stop whips the tail truss off and takes the engine, a panel and
the wing off its bands; 12 m/s at 30 deg and more takes everything.
`npm run crash:core`: 238 passed.

## The stabiliser

The Bombshell's loops with this aircraft's gains: the roll loop's stick is
the rudder, no turn coordinator. Stabilised asks a bank of 45 deg and a
pitch of 20 (roll 2.4 and 0.6, pitch 3.0 and 0.5), and with the throttle
closed lowers its pitch target by 12.78 deg to the power off glide from
the 0.752 stick that flies it level (`npm run stab:glide`). Acro asks 25
deg/s of roll, what full rudder through the dihedral gives it (the lateral
model: 20 deg of bank after a second at cruise), and 60 of pitch.
`npm run kadet:stab`, 54 passed: Stabilised banks 38.5 deg at full stick
and levels within 4 s; Acro rolls at 20.5 deg/s and pitches at 57.5; in
Manual let go the dihedral takes a bank to 0.41 of itself in 8 s; each
mode takes off from the strip with the elevator eased up; and the nose
wheel turns it 63 deg in 4 s taxiing at 1 m/s, where the Bombshell's skid
turns it not at all. `npm run stab:chop`: sink 2.335 m/s at 14.05 against
the derived 2.321.

## The covering

Top Flite's transparent MonoKote comes in clear, orange, yellow, blue, red
and green (monokote.com's transparent page). The scheme is two of them,
**Transparent Yellow and Transparent Red**, laid out the way SIG's box art
lays out its translucent red and opaque black, and as the manual suggests
("one color for the wing and another for the fuselage", and "add some
kind of stripe or decoration to the top of the wing so that ... it is easy
to distinguish the top of the airplane from the bottom"): the wing and the
stabiliser yellow with red tips and a red stripe across each panel's top;
the fuselage, fin and rudder red with a yellow nose and lower cheat line
and a yellow flash up the fin's leading edge. Owners do cover Seniors in
transparent film: "transparent SuperMonokote Orange and Blue", "They were
all covered with transparent covering" (RC Universe's Kadet Senior
thread); SIG's ARF came in transparent blue or red AeroKote.

How it is drawn, `src/render/filmmat.js`, cheaply: no transparency and no
sorting. Each covered part carries a map drawn from the kit's own wood
list, in the part's inches: ribs every 2.5 in, the main spars at the
balance point, the rear spars, the leading and trailing edges, the
sheeted centre and tips on the wing; longerons, uprights and diagonals on
the rear fuselage and sheeting forward; frames, ribs and braces on the
tail. Its colour is the film as lit from the viewer's side (a bay a shade
darker, the dark inside of the part behind it; wood lighter, lighting the
film from behind) and its alpha is how much wood is there. The shader
adds, per directional light, the light that comes through from the far
side: the light's colour times the film's own hue, cut by the frame,
weighted by how squarely the light strikes the far side and more when the
viewer looks toward it, and darkens the wood where it is backlit. So from
above in the sun it reads as coloured film over visible ribs, and against
the sun the bays glow and every rib, spar and truss member stands in them
as a shadow. On swiss2, whose look dresses every craft in a physically
based twin, the twin keeps the film's light (`withFilm`).

## The sound

`src/render/audio.js`, voice `glow4`. A single cylinder four stroke's
sound is its exhaust: one blowdown per power stroke, and it fires every
other revolution, so its note is rpm/120, 79 Hz at 9,500 rpm and 19 Hz at
the 2,300 idle, an octave under a two stroke's at the same rpm. The wave
is four firing cycles long: each a blowdown pulse that rings down in the
header, a weaker suck back half a cycle later, and the prop's two blades,
four passes a cycle, under it; the cycles differ a few percent in
strength and timing, as combustion does (Heywood, Internal Combustion
Engine Fundamentals, 9.4), which is the lope at idle. It is shaped from
that physics; no recording was used. The Bombshell's Cox is a two stroke
but still has the fixed wings' blade pass voice, not a two stroke's note:
the brief assumed a synthesised Cox sound that does not exist.
`node scripts/audio-probe.js --voice=glow4 --trace=glow` renders it.

## In the shell

`kadet1981`, simId 12, the tenth plane behind the Free Flight card and in
the carousel (1981 mm, 2721.6 g, and a line in English and Spanish), in
the wing class, with Acro (the default), Stabilised and Manual rows, its
FPV camera on the cowl, `gear` from the plant's settled pose, and its
voice. `npm run kadet:shell` on the airfield: module 12 and the drawn
model, kadet-acro, the four stroke's voice, parked 0.3072 m over the
ground; with the sticks centred in Acro it holds its level attitude and
runs to 17.4 m/s before it lifts, which is why a Kadet pilot rotates; full
roll stick banks it right on the rudder; C to chase.
`node scripts/hotswap-check.js airfield` swaps it in and out, parked and
in the air.

**swiss2 in the shell flow.** `kadet:shell`'s swiss2 half fails, as
`bombshell:shell`'s does on main's own tree: after the airfield half, the
aircraft is seated at (−3.8, −194.8) on something 3.6 m over the terrain,
not at swiss2's spawn (0, 40), and rolls off it. Seated on swiss2 from the
title the Kadet parks at the spawn at 0.3072 m, and flies; the flow's
second map is a finding for the lead.

## What the owner should feel flying it

A big, slow, forgiving trainer with a strong engine. On the strip it
stands level and idles with a lumpy four stroke thump, and steers with the
rudder at a taxi. Full throttle and a little up elevator and it is off in
under 10 m at about 10 m/s, climbing at up to 5 m/s. At three quarter
throttle it flies level hands off at 14.5 m/s. Rudder banks it gently, 20
deg in a second, and let go the dihedral brings the wings back over
several seconds. Haul the stick back slowly and the nose drops and it
mushes; it does not drop a wing. Close the throttle and it noses down onto
a 14 m/s glide; to land slow it wants up elevator, as the manual says of
a nose heavy Kadet. Fly it between you and the sun and look at the wing:
the film glows yellow and red and the ribs and spars show through.

## Sources

- SIG Manufacturing, Kadet Senior kit RC58, product page (sigmfg.com/products/kadet-senior-kit) and its 2006 archive: span, area, length, weight, loading, wheels, engines, throws, CG, incidences, tricycle gear.
- SIG, Kadet Senior building and flying instructions (sigrc58kadetsenior.pdf, and sigmfg.com/BuildManuals/SIGRC58KadetSenior.html archived 2012): three channels and no ailerons, the dihedral, the wood list, the gear, the engine installation, the trimming, the throws, the hand launch, the covering.
- SIG, Kadet Senior ARF instructions (archived 2013): the aircraft this is not, and its stall.
- O.S. Engines, FS-52S owner's manual (manuals.hobbico.com/osm/fs-52s-manual.pdf): displacement, bore, stroke, rpm range, power, weight, props.
- RC Universe forums: "OS FS-52 Prop Size" (9,500 rpm on a 12 x 6), "OS 52 Surpass rpms, throw" (idle 2,300 to 2,400), "Kadet Senior" (engines owners use, transparent coverings, flight character).
- Top Flite MonoKote transparent colours (monokote.com/transparent.html, archived 2019).
- Nelson, Flight Stability and Automatic Control, ch. 2, 3 and 5; USAF DATCOM, the downwash gradient and the wing height term; Selig et al., Summary of Low-Speed Airfoil Data; the UIUC propeller data site; Heywood, Internal Combustion Engine Fundamentals, 1988; USDA Forest Products Laboratory, Wood Handbook.
