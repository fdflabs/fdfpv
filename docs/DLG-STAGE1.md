# NRJ, stage 1: the discus launch glider, its throw and the drag that decides it

Airframe 21, `nrj1490`: a 1.5 m F3K discus launch glider with no motor,
thrown by its wingtip to 60 m and kept up by the thermals the Radian
already climbs in. Every number the plant is built from with its formula
and source, the two capabilities the plant gained for it (the drag across
the Reynolds numbers and the discus launch), the check table with its
bands and what the plant measured against them. It follows
`docs/GLIDER-STAGE1.md`, which did the same for the Radian, and uses the
same plant, `src/native/plant_wing.c`, with its own parameter table.
`scripts/dlg-derive.js` (`npm run dlg:derive`) prints every derived
figure below; nothing in it loads the plant.

## Which DLG, and why

**OA Composites' NRJ**, designed by Christophe Bourdon and built by Anton
Ovcharenko, in the standard (CW40) layup. It is a current top F3K model
(an NRJ won the Nancy Cup) and, more to the point here, it is the best
documented one that can be read without an account:

- Hyperflight's product page publishes a full specification table: span,
  area, aspect ratio, length, the CG range, the dihedral, the control
  throws and the snap flap mix, and the typical weight of every part
  (wing 97 g, fuselage 38 g, fin 5.4 g, tailplane 4.7 g, receiver 5 g,
  four servos 34 g, pack 15 g: 213 g flying).
- OA Composites' own assembly manual (the English 2019 edition Hyperflight
  hosts) gives the CG, the flight phases, the throws, and which wingtip the
  peg goes on for a right handed pilot.
- Lindinger's listings give the span to the millimetre (1490 mm), the sink
  rate ("approx. 0.3 m/sec") and the launch heights a pilot of each level
  reaches ("about 40 m", "experienced pilots can reach 60m, competition
  pilots 80m").

The Vortex, Snipe, Blaster and Stream the brief named are the same class;
the Snipe's maker's site was down, and for the Stream NXT only a
measurement study was found (van Empel and Volkers, below), which this
file uses as the class's reference for the polar, not as the kit.

The id is the name and the span in millimetres, the house style:
Lindinger's and Flash RC's 1490 mm, the F3K limit less a centimetre.

## Sources

| Short name | What | URL |
| --- | --- | --- |
| Hyperflight | NRJ 1.5m DLG, specification table, typical weights, recommended RC | https://www.hyperflight.co.uk/products.asp?code=NRJ&name=nrj-dlg |
| OA manual | NRJ assembly and settings manual, OA Composites, English, 2019 | https://www.hyperflight.co.uk/extras/NRJ-EN-instructions-2019.pdf |
| F3Klaus | NRJ building instructions, 2020 04 11 (servo trays, peg) | https://www.hyperflight.co.uk/extras/NRJ-buiding-instructions-F3Klaus-20200411.pdf |
| Lindinger | OA-Composites NRJ F3K listings (span, weight, sink, launch heights) | https://www.lindinger.at/en/Airplanes/Aircraft-Models/Electric-gliders-Hotliners/OA-Composites-NRJ-F3K-BLUE-5-CW40-Discus-Launch-Glider-DLG/9776535 |
| Flash RC | F3K NRJ Standard CW40 (span, area, loading, CG, phases) | https://www.flashrc.com/en/rc-gliders-master-the-art-of-silent-flight/39851-f3k-nrj-standard-cw40-honeycomb-15m-8800223335444.html |
| Volkers | T. van Empel and T. Volkers, "The aerodynamics of a DLG unravelled" (the Stream NXT: measured sections, the drag build up, the polar, measured sink), 2020 | https://home.hccnet.nl/d.f.volkers/Aerodynamics%20of%20a%20DLG%20unravelled_version31aug2020.pdf |
| Wikipedia | Discus Launch Glider (one turn, the launch heights) | https://en.wikipedia.org/wiki/Discus_Launch_Glider |
| BARCS | FALLBACK, a forum: "Launch Heights" (the launch switch, "default 2-second zoom after release of launch-button"; 15, 35, 50 and 60 m launches) | https://www.barcs.co.uk/forums/topic/7960-launch-heights/ |
| Instructable | FALLBACK, a forum grade source: "Discus Launch Glider Build", Hyperflight's copy ("> 80 mph" for 200 ft) | https://www.hyperflight.co.uk/getfile.asp?code=blaster-2&code2=5 |
| Raymer | D. Raymer, Aircraft Design: A Conceptual Approach (drag build up, eq. 12.48 for e, eq. 16.25) | book |
| Nelson | R. Nelson, Flight Stability and Automatic Control (the stability derivatives) | book |
| Selig | M. Selig et al., Summary of Low-Speed Airfoil Data, UIUC (section drag and CL max at 5e4 to 1e5) | book |

## The aircraft

| Quantity | Value | How |
| --- | --- | --- |
| Span b | 1.490 m | Lindinger, Flash RC; Hyperflight rounds it to 1.5 m |
| Wing area S | 0.190 m² | Hyperflight, Flash RC: 19.0 dm² |
| Aspect ratio | 11.68 | b²/S; Hyperflight prints 11.7 |
| Length | 0.96 m | Hyperflight, Flash RC |
| Mass m | 0.213 kg | Hyperflight's standard layup, the typical weights table's sum |
| Weight, loading | 2.090 N, 11.0 N/m² | derived: 11.2 g/dm², Hyperflight's figure |
| Dihedral | 7 deg a panel from the root | OA manual: "each half wing has got 7 deg dihedral angle from the root"; the tips 0.091 m up |
| Planform | elliptic in chord, the trailing edge straight | the photographs (a straight hinge line, the leading edge sweeping to the tip); Volkers found the class "substantially elliptical" with no washout, and the NRJ's "good elliptic lift distribution, with no washout" is Hyperflight's words |
| Root chord c0 | 0.1624 m | 4S/(πb), the ellipse; the Stream NXT's measured root is 164 mm (Volkers). ESTIMATED as the ellipse |
| Mean aerodynamic chord | 0.1378 m | 8 c0/(3π); its leading edge 24.5 mm behind the root's |
| CG | 66 mm behind the root's leading edge | OA manual: "CG between 64.5 and 66.5 mm", 66 for the empty glider; h = 0.301 of the MAC |
| Section | 6.0 percent at the root to 5.2 at the tip, low camber | Hyperflight |
| CL max | 0.95 | ESTIMATED: a thin low camber section at 5e4, section cl max about 1.05 (Selig, the SD7037 and SA7035 class at 6e4), times 0.9 for the tips and the tail's trim load |
| Zero lift line | 3 deg under the body axis | ESTIMATED: about 2 deg of the section's own and 1 of incidence |
| Oswald e | 0.714 | Raymer eq. 12.48, 1.78 (1 − 0.045 AR^0.68) − 0.64, for a straight wing; it carries the section drag's rise with lift as well as the induced drag, which a parabolic polar needs at the high lift a DLG thermals at |
| Induced drag factor k | 0.0382 | 1/(π e AR) |
| CD0 at 5 m/s | 0.0240 | the build up below |
| Inertia Ixx, Iyy, Izz | 0.0160, 0.0087, 0.0247 kg m² | ESTIMATED from the published weights: the 97 g wing as a tapered bar and 1.5 g of tip balance (the manual's "usually 1.5 to 2 g"); in pitch the pod's 80 g at 0.12 m ahead, the tail's 20 g at 0.58 m aft, the boom's 15 g along it |
| Throws: aileron, elevator, rudder | 19.0, 17.5, 15.5 deg | OA manual: ailerons 13 mm each way ("differential for speed and high cruise modes can be more like +/- 13 mm"), elevator 8 to 10 mm, rudder 12 mm; over the surfaces' chords at the horn, 40, 30 and 45 mm (ESTIMATED from the photographs), asin(travel / chord) |
| Pack | 1S 350 mAh receiver pack, 15 g | Hyperflight's recommended RC, "Tatu 1S 350 mAh" |
| Motor | none | an F3K glider is thrown |

### The tail, off the photograph

No maker publishes the NRJ's tail. It is measured off Hyperflight's
photograph of two NRJs on the grass, the lower one nearly square to the
camera, scaled to the published 0.96 m along the fuselage and the 1.49 m
span across it. All ESTIMATED:

| Quantity | Value |
| --- | --- |
| Nose to the root's leading edge | 0.193 m: the CG 0.259 m behind the nose |
| Stabiliser span, root chord, area | 0.30 m, 0.085 m, 0.020 m² (elliptic) |
| Tail arm l_h, the quarter chords | 0.56 m |
| Horizontal tail volume V_H | 0.428 |
| Elevator | the aft 30 mm, τ_e 0.55 |
| Fin height, area, arm, centre over the CG | 0.196 m, 0.016 m², 0.60 m, 0.08 m |
| Rudder | τ_r 0.60 |
| Flaperons | 0.08 to 0.70 m out, a quarter of the chord, τ_a 0.50 |

## THE DRAG ACROSS THE REYNOLDS NUMBERS, a plant capability

The plant took CD0 as one number for every speed. Every other aircraft
here flies over a threefold range of speed; this one glides at 5 m/s and
leaves the hand at 41, a ninefold range of Reynolds number (4.7e4 to 3.9e5
on the mean chord), over which a thin section's drag coefficient and a
laminar skin's friction both fall a long way: Volkers found the Stream
NXT's parasitic drag coefficient "almost halves" from 4 to 20 m/s. With one
CD0 the aircraft either sinks as it should and throws to 44 m, or throws to
60 m and glides like a trainer (dlg-derive.js: the same throw on a CD0 fixed
at the glide's tops out at 44.3 m, half of V²/2g).

So a table may now set `cd0_re` (FixedWingParams, sim_internal.h): the
Reynolds number on its chord at which its `cd0` was built up. The plant
then takes CD0 as that times the root of the reference over the Reynolds
number now, a laminar skin's Re^-1/2 (Blasius), and holds it at its value
at half the reference below that, so it cannot run away near a standstill.
From 4 to 20 m/s that is a factor of 2.24 against Volkers' "almost 2". It
is one `sqrt` of the fixed libm, deterministic, and a table that leaves
`cd0_re` at zero takes none of it: its arithmetic is exactly what it was
(every other airframe's gates and `npm run crash:identity` hold that).

The build up at the reference, 5 m/s on the mean chord (Re 47,180),
Raymer ch. 12:

| Part | CD0 | How |
| --- | --- | --- |
| Wing, section | 0.0190 | a thin low camber section's cd at 5e4 and cl 0.6 to 0.9, 0.017 to 0.021 (Selig) |
| Tail | 0.0033 | stabiliser and fin, both sides, laminar C_f 0.0078 at their 85 mm chord, form factor 1.1 |
| Fuselage | 0.0010 | a 0.19 m pod of 24 mm and a 0.70 m boom of 9 mm, turbulent C_f 0.0056 |
| Horns, peg, gaps, junctions | 0.0007 | Volkers' own four items: 0.00010 + 0.00005 + 0.00012 + 0.00043 |
| Total | 0.0240 | at 10, 20 and 40 m/s: 0.0170, 0.0120, 0.0085 |

## THE DISCUS LAUNCH, a plant capability

A DLG is thrown by a peg on its wingtip: the pilot turns once with the
glider at arm's length and lets it go. The plant models that as a state,
in C, deterministic, so a replay throws the same throw:

- `sim_wing_discus()` (sim_abi.h), on an aircraft whose table sets
  `discus_v`, begins the pilot's turn from where the aircraft lies, to let
  it go at the same x and y, facing the way it faces, its CG `discus_h`
  over the ground plane the host raised. Refused on any other aircraft.
- THE TURN is a path, not a flight: the hand holds the glider on it, so
  for its duration the plant and the ground are not stepped
  (plant_wing_discus_hold, sim.c). Counter clockwise seen from above, a
  right handed pilot's, whose peg the OA manual puts on the LEFT wingtip,
  so the pilot stands on the glider's left: the CG on a circle of
  `discus_r` at a constant angular acceleration from standing to
  `discus_v / discus_r` over `discus_turn`, the nose along the circle, the
  last quarter of the turn's time bringing the nose up to `discus_pitch`,
  the arm's sweep and the wrist.
- THE RELEASE: at the end of the turn the hand opens and the glider leaves
  at `discus_v` along its nose, pitched `discus_pitch` up, with no
  rotation; from the next step it is the plant's.
- THE LAUNCH PRESET flies the zoom: every F3K radio has one (the OA
  manual's "Preset" flight phase; a Spektrum's "2-second zoom after release
  of launch-button", BARCS). From the release until the climb is
  spent (the vertical speed reaches zero) the elevator carries
  `discus_de` on top of whatever the stick or the stabiliser asks, the
  elevator that trims the zoom at the zero lift line, -Cm0/Cm_de, 7.2 deg
  down. In Stabilised the pitch held is the release's; Acro holds the
  release's attitude as it holds any. At the top the preset lets go and
  the pilot flies it.
- `sim_wing_discus_phase()`: 0 none, 1 the turn, 2 the zoom. A pure
  reader (src/replay/journal.js PURE).

The NRJ's numbers:

| Quantity | Value | How |
| --- | --- | --- |
| discus_r | 1.6 m | ESTIMATED: the arm from the shoulder to the fingertips on the peg, 0.75 m, the half span, 0.745 m, and the shoulder 0.1 m off the spine |
| discus_turn | 2π | one turn: Wikipedia, "spins 360°" |
| discus_h | 1.5 m | ESTIMATED: an adult's shoulder, the arm straight out |
| discus_pitch | 70 deg | ESTIMATED: the zoom's line, steep but short of vertical, as videos of F3K launches show it; the gates hold only the height it reaches, which hardly moves with it (the zoom trades the whole speed either way) |
| discus_v | 41 m/s | DERIVED, below |
| discus_de | -0.12563 rad | -Cm0 / Cm_de |

The release speed is not published anywhere found. It is derived from
what is, the heights: Lindinger's "experienced pilots can reach 60 m" is
the throw the shell gives, and dlg-derive.js flies the zoom on this drag
to find the speed that reaches it from 1.5 m: 40.99 m/s. The fallback
instructable's "> 80 mph" (35.8 m/s) "to get to 200 ft" is a lower bound
from the same arithmetic and is consistent with it: on this drag 35.8 m/s
reaches 48 m. The other heights on the same drag: 40 m ("a little
practice") needs 31.8 m/s and 80 m (competition) 49.5 m/s.

The turn at 41 m/s on a 1.6 m radius lasts 0.49 s and pulls 107 g at its
end: the real arm is not a rigid radius, and the hand's whip at the end of
the turn gives the glider more speed than the shoulder's rotation does, so
the plant's radius is where the glider is, not a claim about the pull.

**The brief's figures were inconsistent**: "25 to 30 m/s release, a zoom
climb to 50 to 70 m". With no drag at all, 30 m/s climbs 46 m; 25 m/s
32 m. The heights the brief asks for need 38 to 45 m/s with a real drag.
This file keeps the heights, which are published, and derives the speed.

### The shell

L throws it, and so does the throttle stick raised while it lies on the
grass or sits in the hand (the pad's binding, the same path that throws
every wing): `throwWing` in src/main.js sees `discus` on the airframe and
calls `discusLaunch`, which picks the glider up where it lies, level,
facing the way it faced, and starts the turn. The HUD's cue
(`discusCue`): "Spinning up..." for the turn, "Released at 41 m/s. Hold
the climb." at the release, and at the top of the zoom "Top of the launch:
61 m. Find a thermal.", the height reached over the launch point, which is
the number a DLG pilot reads off the altimeter after every launch.

THE CATCH: back at the launch point (within 1.5 m of it), between 0.6 and
2.3 m up and under 8 m/s, at least 5 s after the release, the glider is
caught: held there, landed, and "Caught. L throws it again." A belly
landing is the hull's, as the Radian's.

There is no motor: `noMotor` on the airframe entry. It has no POWER entry
(configs/power.js), so the shell seats the plant's own table with the
receiver pack's one cell and the wind's voice alone (applyPower), fits no
hangar parts (applyParts), and the hangar's Power tab reads "No motor",
"Hand launched, a 1S receiver pack", with a note that there is nothing to
change (src/ui/hangar.js stockPower). The Tuning tab offers the balance
and the rates and no motor bench (src/ui/hangar-tuning.js); the balance is
lead only, since the pack is fixed in the nose (configs/tuning.js
setupFor).

## The coefficients

The aero convention (x forward, y right, z down), as the other tables,
turned into the body frame by the plant. Per radian. dlg-derive.js
integrates over the elliptic planform.

| Coefficient | Value | Formula |
| --- | --- | --- |
| a_w, a_t, a_v | 5.365, 4.350, 4.098 | 2π AR/(AR+2); the fin's effective aspect ratio 1.5 times its own |
| dε/dα | 0.292 | 2 a_w/(π AR), Nelson eq. 2.22 |
| CLα | 5.657 | a_w + a_t (S_h/S) η (1 − dε/dα), Nelson eq. 2.52, η 0.9 |
| h_n, static margin | 0.470, 0.170 | 0.25 + V_H η (a_t/a_w)(1 − dε/dα), less the pod's 0.0029 per rad (Raymer eq. 16.25); less h 0.301 |
| Cmα | −0.959 | −CLα SM |
| Cm0 | +0.1157 | trims the best glide, 5.13 m/s, CL 0.69, with the elevator neutral |
| Cmq, Cmδe, CLδe | −13.61, 0.921, −0.2267 | Nelson eq. 3.43; η V_H a_t τ_e; −η (S_h/S) a_t τ_e |
| CYβ, Cnβ, Cnr | −0.365, 0.1389, −0.1179 | −a_v S_v/S − 0.02 for the pod; a_v V_V less the pod; −2 a_v V_V l_v/b − CD0/4 |
| Clβ | −0.1576 | the dihedral by strip theory over the ellipse, −0.1391, and the fin's −a_v (S_v/S)(z_v/b) |
| Clp | −0.671 | −(4 a_w/(S b²)) ∫ c y² dy |
| Clδa | 0.537 | (2 a_w τ_a/(S b)) ∫ c y dy over the flaperons, Nelson eq. 5.95 |
| Clr, Cnp | CL/4, −CL/8 | Nelson table 3.4 |
| Cnδa | −0.1824 CL | 2 K CL Clδa, K −0.17: long flaperons' adverse yaw |
| Cnδr, CYδr, Clδr | −0.0834, 0.2070, 0.0111 | −V_V a_v τ_r; a_v (S_v/S) τ_r; CYδr z_v/b |

Past the stall, docs/STALL-STAGE1.md's terms from scripts/stall-derive.js
(which now carries the NRJ): stall_arm_ac 0.0510, stall_arm_cp 0.0990,
stall_dw 0.0912, stall_asym 0.00726, the four strips' chords of the
ellipse 1.263, 1.180, 0.994, 0.616, and a 6 percent section at 5e4,
ESTIMATED held 1 deg past its stall then falling to 0.80, sharper than the
SD7037's (9.2 percent, 1.8 deg at 6e4): no UIUC section this thin was
tested at this Reynolds number. No washout: the NRJ has none.

The stabiliser: Stabilised banks to 50 deg and pitches to 30, roll gain
1.2 and 0.12 (the NRJ rolls two and a half times the Radian's rate per
stick, against 7 deg of dihedral); Acro asks for up to 150 deg/s of roll
(full aileron rolls 163 at 8 m/s) and 60 of pitch, roll 3.0, 0.20, feed
forward 0.36 (full aileron's 2.8 rad/s at 9 m/s), integral 6.0; the turn
coordinator 1.5, the Radian's. With no throttle to close, Stabilised's
pitch down is zero (stab-glide-derive.js now knows an aircraft with no
motor has no cruise throttle).

## The bands, and what the plant measured

`npm run dlg:gates` (tests/dlg-thresholds.json), on the plant as
committed:

| Check | Derived | Band | Measured |
| --- | --- | --- | --- |
| D1 glide ratio at 5.2 m/s | 16.46 at 5.13 (the best) | 14.0 to 19.0 | 16.42 at 5.19 m/s, sinking 0.316 |
| D2 least sink, 4.8 to 5.6 m/s | 0.283 at 4.56 m/s | 0.25 to 0.38 | 0.313 at 5.08 m/s |
| D3 stall | 4.35 m/s | 4.1 to 4.95 | 4.64 m/s |
| D4 roll, pb/2V | 0.265 | 0.19 to 0.34 | 0.316, 166 deg/s at 6.8 m/s |
| D5 the zoom's top, every mode | 60.0 m (the throw is derived to it) | 50 to 70 m | Manual 61.5, Stabilised 61.2, Acro 61.2 |
| D6 the release | 41 m/s at 70 deg, 1.5 m up, where it lay, 0.4904 s, 3.2 m across | exact to 0.05 m and 0.5 deg | 41.000 m/s at 70.00 deg, 0.000 m off, 1.500 m up, 0.491 s, 3.200 m |
| D7 the zoom's share of V²/2g | 0.69 (a fixed CD0 would give 0.50) | 0.60 to 0.80 | 0.700 |
| D8 the drag across the Reynolds numbers | CD 0.024 at 5 m/s, 40 over 10 m/s 0.5, 2 over 5 m/s √2 | 1e-3 | 0.03394, 0.02400, 0.01697, 0.00849 at 2, 5, 10, 40 m/s |
| D9 circling in thermal A at 35 deg, 6 m/s | 2.00 m/s up | 1.4 to 2.4 | 1.94 m/s |
| D10 the same circle, still air | 0.434 m/s down | 0.33 to 0.55 | 0.469 |
| D11 over the thermal's top | D10's | within 0.02 | 0.469 |
| D12 no motor: full and closed throttle | the same glide | bit identical | bit identical, 0 N, 0 rad/s |
| D13 a glide onto the grass | rests on the belly, 0.042 m | within 4 mm, wings level | 0.0400 m, level |
| D14 Node and Chrome agree on the recorded throw, glide and thermal | | identical | 340fb01bfb996193 both |

The published figures the bands stand on: Lindinger's sink "approx. 0.3
m/sec"; Volkers' Stream NXT, 0.30 m/s computed at 4.7 m/s with the thermal
camber, 0.38 flat (the plant flies the NRJ flat, with no camber mix), and
0.33 to 0.38 measured (0.25 to 0.30 "in still air, as far as possible");
at the NRJ's 213 g against the Stream's 240 the flat figure is 0.36.

What building it changed, before any band was final:

- The first CD0 was one number, and the throw could not be both: this is
  why the drag across the Reynolds numbers exists (above).
- The CG first sat 9 mm under the wing's root, and crash:core found the
  root's residual mass outside the pod: the dihedral carries the panels'
  97 g up, so the CG is over the root, not under it. The pod, the tail and
  the hull were moved down to where the mass puts them; the hull's belly
  is 42 mm under the CG.
- Stabilised first held the zoom on its proportional pitch loop alone,
  which drooped 6 deg nose high against the glide trim's pitch up at 41
  m/s: the preset's elevator is the radio's, and now rides under every
  mode as it does on a real transmitter.
- D4 first took the peak roll rate over a whole second, which caught the
  spiral dive that follows; the roll's time constant is 0.023 s, so the
  first 0.4 s holds the steady roll and nothing after it.

## The model and the hull

`src/render/dlgcraft.js` draws the aircraft from the same numbers: the
elliptic planform on its straight trailing edge, 7 deg a panel, the
section 6 to 5.2 percent, the flaperons, the pod and its slip on nose cone,
the boom, the underslung elliptic stabiliser and its elevator, the fin and
rudder, the peg on the left tip. Its colour regions are the NRJ's own
bands (configs/liveries.js): the stock "Blue #5" of Hyperflight's
photographs, "Red #2" and "Orange #18" from Lindinger's listings.

| Quantity | Plant | Drawn | Why they are the same, or not |
| --- | --- | --- | --- |
| Hull, down | 0.042 m | the pod's belly, 0.042 m | what a belly landing rests on; D13 rests it at 0.040, the contact's 2 mm of compliance |
| Hull, up | 0.04 m | the wing's root top 0.0 m, the tips 0.08, the fin 0.18 | a centred box cannot hold a dihedral, the Radian's reasoning |
| Hull, length and width | 0.70 by 0.80 m | 0.96 by 1.49 m | centred, as the Radian's: one as wide as the span would put its bottom corners at the tips, which the dihedral lifts 0.09 m |
| Camera | 0.16 m ahead, 0.002 m under | the pod's top at the nose | no DLG carries one; this is the pilot's eye for the FPV view |
| Resting pose | level on the belly | level on the belly | |

## In the shell

The NRJ is `nrj1490` on simId 21, in the wing class, behind the Fixed
wing card, with Acro (the default), Stabilised and Manual tune rows, the
chase and line of sight views the other planes have, and the FPV camera
on the pod's nose. It opens at level 6 beside the Bramor (src/game/
progress.js): the Radian at 5 teaches the thermals with a motor to climb
back on, and this takes the motor away; it is gentle to fly and hard to
keep up, a soaring skill, not a stick one. Shared rather than slotted in,
so no plane a pilot already has goes back behind a lock.

`npm run dlg:owner` flies the owner's test headless in the real shell on
swiss2: on nrj-acro the throttle stick throws it, the HUD names the top,
it glides, finds thermal A and climbs; on nrj-stab it comes back down to
the launch point and is caught.

Run on the committed build (SIM_GPU=1), all hold: on nrj-acro the throttle
stick threw it, the first frame after the release read 40.6 m/s (the
plant's own release is D6's exact 41; a frame of the zoom's 14 m/s² has
gone by), the zoom topped out 60.9 m over the grass and the HUD said "Top
of the launch: 61 m. Find a thermal."; level, it glided at 5.81 m/s
sinking 0.337, 17.2 to 1; in thermal A at 35 deg it climbed 1.72 m/s in
2.15 m/s of rising air. On nrj-stab, spiralled down round the launch
point, out to 45 m and back onto a straight final, it was caught 1.46 m
from the launch point and 1.22 m up, and the HUD said "Caught. L throws it
again."

The hull and the craft: `npm run check:craft` 164 of 164 (the NRJ's span
1490 mm, its reach the tips' trailing corners, 751.2 mm, the hull's
0.180 m up and 0.042 m down against the drawing); `npm run hangar:check`
164 passed (its five colour regions); two pages in one room, a copy of
scripts/rooms-two-page.js with page B on the NRJ against a local
edge/rooms/node.js: A draws B as the NRJ in its paint, parked on its slot
and flying 40 m up (the copy's one failure is its colour check, written
for the P-51's `fuselage` region, which the NRJ does not have).
