# Slick 580, stage 1: the aircraft, the model and what it is meant to do

The owner chose it on 2026-10-11 from the two 3D candidates in the lead's
research (fdfpv-loop 3D-PLANES-RESEARCH.md, candidate A): **Extreme
Flight's 100 in class Slick 580 EXP V3** (356RC Red/White 10th
Anniversary, 356V3BW White/Blue/Orange, 356CYV3 Cub Yellow), a 35 percent
balsa and composite IMAC and 3D aerobat on a 120 cc petrol twin, the
biggest and heaviest aircraft in the hangar. Airframe **33**, string id
`slick2680`, table `FW_SLICK2680` in `src/native/plant_wing.c`, every
number below from `npm run slick:derive` (`scripts/slick-derive.js`,
whose `--check` holds the table, the plant row and the bands in
`tests/slick-thresholds.json` to it). 32 is held for the CAP 580 lane.

It is Extreme Flight's own name for a scaled Slick 360 (Slick Aircraft,
Pretoria; 7.30 m and around 400 deg/s of roll, Wikipedia): EF calls its
114 in Slick "a true 40% scale", and 2.68 m is 37 percent of the full
size's span.

## Which span: 2.680 m, and why

The V3 product pages say "WINGSPAN 100 in / 2.5 M", and the research found
that the only data sheet they link is the V2's, 105.5 in. Read again on
2026-10-11:

- Two of the three V3 pages (356CYV3, 356V3BW) say **"100 in. / 2.5 M
  (without tips)"**; the 356RC page drops the bracket.
- The V2 sheet (105.5SlickDatatSheet.pdf, the same drawing as
  DATASHEET_105SLICK580v2.pdf) is a **dimensioned three view**: 2680 tip
  to tip, 2540 overall length, 1040 stabiliser, 115 dm² of wing. Measured
  on the drawing's own scale, its wing is **2538 mm between the tip ribs**,
  the moulded tips 70 mm each beyond them.
- EF sells one hardware bag for "100 in Slick 580 V2/V3" (356V2HWB) and
  renamed the V2's "105.5 in" parts and listings "100 in".

So "100 in" is the same wing less its tips (and also the length), not a
smaller V3. Taken: **span 2.680 m, area 1.150 m²**, the sheet's. If EF
publishes a V3 sheet that says otherwise, `SPAN` and `AREA` at the top of
the derivation are the two numbers to change; `--check` then names every
table field that moves.

## The aircraft

| Quantity | Value | Source |
| --- | --- | --- |
| Span b | 2.680 m | the sheet's drawing, tip to tip (above) |
| Wing area S | 1.150 m² | the sheet, "115 dm² / 1783.7 sq in" |
| Length | 2.540 m | the sheet, 100 in |
| Mass m | 12.474 kg (27.5 lb) | the middle of the overlap of EF's two V3 ranges, 26 to 28 lb (356RC, the sheet) and 27 to 29 lb (356CYV3, 356V3BW), taken with the 34 oz tank full (docs/POWER-STAGE1.md's glow convention) |
| Wing loading | 106.4 N/m² | W/S: 2.65 times the Extra's |
| CG | 169 mm behind the root's leading edge | the sheet: "center of main wing tube to rear of main wing tube as starting position", the middle; the 38 mm tube at 28 percent of the root chord, the drawn section's thickest station |
| Incidence | 0 deg wing, 0 deg stabiliser | the sheet |
| Thrust line | 0 deg up and down, **3 deg right** | the sheet; the 120cc build guide "2.5-3 degrees of right thrust" |
| Throws, high | aileron 38 up and 37 down, elevator 45 to 50 (3D), rudder 45 and more | the sheet and the 120cc build guide, in degrees |
| Expo | 50 to 60 percent aileron and elevator, 60 to 80 rudder | the same |
| Throws, low | aileron 20, elevator 10 to 12, rudder 20 | the same |
| Engine | Desert Aircraft DA-120, 121 cc, 11.7 hp, 2.25 kg, 1,300 to 6,900 rpm | desertaircraft.com |
| Prop | 28 x 10 carbon (EF: "27x11, 28x9.5 and 28x10 are our favorites") | the 120cc build guide |
| Tank | 34 oz FlowMaster | the sheet |
| Gear | carbon legs, 630 mm track, wheel pants, a tailwheel steered off the rudder | the sheet's drawing and label |

Taken: the 3D elevator's middle, 47.5 deg (XA's 60 and more is a setup
past it), the aileron's mean, 37.5, the rudder's 45; expo 0.55 (the
table's one expo; the rudder's own 0.70 goes in the pilot's tuning).

### The drawing, measured

DATASHEET_105SLICK580v2.pdf rendered at 300 dpi. Its span axis is to
scale: the 2680, 2540 (between the tip ribs) and 1040 labels agree on
1.3128 mm a pixel within 0.4 percent. The top view's chordwise axis is
drawn about 5 percent long (the root measures 600 for its 570 label, while
the side view's root section measures 572), so the top view's chords are
taken at 570/600 of the span scale; the side view is to scale on its 2250
(spinner to hinge line) and 755 (height) labels, 1.3123 mm a pixel. Where
a label and the drawing differ, the label is taken: the root 570 and tip
285 give the sheet's 1.150 m² within 1.6 percent with the tips; the drawn
chords give 9 percent more. The 630 track is the label; the drawn pants
sit wider.

- **Wing**: root 570 at the fuselage's side (0.163 m out, the 326 mm
  fuselage label), 285 at the tip rib 1.270 m out, rounded tips to 1.340;
  the leading edge swept back 73 mm to the tip rib. MAC 0.4577 m, AR 6.25.
- **Section**: the drawn root is 12.6 percent thick with its thickest
  station at 28 percent of the chord.
- **Ailerons**: 0.32 of the chord, from 0.181 m out to the tip rib.
- **Stabiliser**: 1.039 m, root 0.335 m on the side view, tip 0.206 m,
  0.248 m², the elevators 0.566 of it with their tip balances; its MAC's
  quarter chord 1.354 m behind the CG; chord line 14 mm over the thrust
  line.
- **Fin and rudder**: 0.144 m², the rudder 0.68 of it running down to the
  fuselage's foot behind the hinge line; 0.466 m over the thrust line and
  0.096 under it; the quarter chord 1.456 m behind the CG.
- **Gear**: the main axles 0.159 m ahead of the CG and 0.388 m under it,
  105 mm wheels; the tailwheel's 1.509 m behind and 0.145 m under, 38 mm.
  On the ground the drawing stands it **9.38 deg nose up**.
- **Prop**: the spinner's back plate, the disc, 0.609 m ahead of the CG.

### Mass and inertia, ESTIMATED

Built up from the parts (`scripts/slick-derive.js`): the DA-120's 2.25 kg
(Desert Aircraft) and its mufflers 0.30 on the stand offs, the prop and
spinner 0.29, the ignition 0.25, the tank with 34 fl oz of petrol at 0.73
kg/l (0.734 kg), the wing panels with four servos and the 38 x 1180 tube
2.70, the stabiliser and elevators with two servos 0.55, the rudder and its
servo 0.35, the carbon gear, wheels and pants 0.80, the tailwheel 0.10,
the receiver and its two packs 0.45, a pilot bust 0.10, and the fuselage
the rest, 3.20 kg in two rods, its front share 0.81 the balance that puts
the CG at the sheet's (the Ugly Stik's method). The CG comes out 39 mm
under the thrust line. **Ixx 1.512, Iyy 4.163, Izz 5.463 kg m²**: 33, 36
and 36 times the Extra's.

## The engine and prop: one link FITTED, not three

The research expected three fitted links (the torque curve, the static rpm
and a prop APC does not measure). The static point is in fact published:
**Falcon Propeller's own test chart** (Falcon Carbon Fiber Gas Propeller
Test Chart, two blades, its DA 120CC column) gives the DA-120 on Falcon's
**28 x 10 at 6,550 rpm and 31.0 kg standing**, MEASURED (its 27 x 11 6,600
rpm and 30.1 kg, its 28 x 9.5 6,640 and 31.2). Owners' tachometers on
FlyingGiants and RCU read 6,300 to 7,200 on a 28 x 10, which brackets it.

| Quantity | Value | How |
| --- | --- | --- |
| Static thrust | 304.11 N, **2.49 times the weight** | Falcon, 31.0 kg |
| Full rpm | 6,550 | Falcon; `rpm_no_load` 7,705.9 is it over 0.85, the glow rule |
| Torque, torque arm | 9.38 N m, 0.03083 m | **FITTED**: APC publishes no 28 x 10; the file nearest in shape is PER3_22x8 (pitch over diameter 0.364 against 0.357), whose static Cp / Ct at 6,000 and 7,000 rpm (0.0182 / 0.0665, 0.0184 / 0.0678) carries to the 28 x 10, Q = T D Cp / (2 pi Ct). Falcon's own Ct, 0.081, is above APC's 0.067 (a wider 3D blade), which moves Ct and Cp together and leaves their ratio. The shaft power it gives, 6.43 kW (8.6 hp), is under DA's rated 11.7 hp, as a static prop below the top of the 6,900 rpm range should be. The research's PER3_27x13E would give a 9 percent longer arm |
| Pitch speed | 46.59 m/s | where the plant's straight thrust line reaches zero: APC's 22 x 8 pulls to J 0.53, 1.5 times its pitch over diameter; the least squares J0 of a straight line through its static Ct over its Ct(J) at 6,000 rpm, 0.600, times n D. The Ugly Stik's rule, the geometric rpm times pitch, would give 27.7 m/s and a 60 mph top speed for a 35 percent aerobat |
| Idle and the stick's curve | 0.1985 of full at the stop; 0.32, 0.44, 0.53, 0.64, 0.77, 0.87, 0.91, 0.97, 0.98 and 1 at its tenths (`throttle_rpm`) | DA's lowest, 1,300 rpm; the rest the propulsion lane's method (scripts/da120-derive.js, docs/FLIGHTMODEL.md "The Slick's DA-120"): HFE's DA120 EFI data sheet's part throttle dyno (fig. 3, 20 to 100 percent throttle) against this prop's speed squared load, every row scaled by 0.931 so its full throttle settles at Falcon's 6,550 (the dyno reads 10.08 N m there against this prop's 9.38: 7 percent, inside its own +/-10, an EFI engine against a carburettor's); the tenth under the dyno's 2,000 rpm FITTED halfway. Half stick is 5,010 rpm, not the straight line's 3,930 |
| Fuel flow | 84.4 cc/min at full, 12 minutes of the tank | the shaft power at HFE's DA120 data sheet's 575 g/kWh, at 0.73 kg/l, linear in the rpm through zero as every glow table's (Moulton's measured 3W 100i-B2 at its peak power, 0.797 lb/hp h or 486 g/kWh, is a fifth under it) |
| Prop inertia | 0.00931 kg m² | the propulsion lane's: the listed 28 x 10 masses (Biela 322 g, Mejzlik 288 and 276 g), their mean as 0.7 of a rod's m D² / 12, and the crank, ignition rotor and spinner ESTIMATED at 0.0006 |

**The engine** rides the glow method with the propulsion lane's dyno
throttle (a54c0fa30, merged here): the stick runs the engine along
`throttle_rpm` and it never stops; the tank and its lean run; and
`prop_spool`'s flat torque (Heywood, checked within 6 percent on HFE's
curve), which answers a step in 0.34 s at full (spool:derive: idle to full
619/1115 ms to 63/90 percent of the thrust). The propulsion lane derives a
different full throttle point, 320.9 N at 6,850 rpm (HFE's simulated 73.2
lb at 6,900 and a forum tachometer); this table keeps Falcon's, a
measurement of the same engine on the same prop, and says why in the lead's
plan. The carburettor's own delay is not modelled.

## The coefficients

Nelson's forms, as the Extra's (`scripts/extra-derive.js`), on the
drawing's geometry.

| Quantity | Value | How |
| --- | --- | --- |
| a_w, a_t, a_v | 4.759, 4.303, 3.958 /rad | 2 pi A / (A + 2); the fin's effective AR 1.55 of its geometric 2.196 |
| d eps / d alpha, V_H, V_V | 0.485, 0.639, 0.0678 | |
| CL alpha | 5.190 | wing and tail |
| Static margin | 0.185 | h_n 0.492 less the CG's 0.307 of the MAC |
| Cm alpha, Cm q, Cm0 | -0.9608, -14.633, 0.0664 | Cm0 trims 22 m/s hands off |
| Cm de, CL de | 1.1748, -0.3972 | |
| CY beta, Cn beta, Cn r | -0.6355, 0.2270, -0.2967 | |
| Cl beta, Cl p, Cl da | -0.0429, -0.6610, 0.3733 | the fin over the CG; the mid wing's own near nothing (DATCOM) |
| Cn dr, CY dr, Cl dr | -0.1368, 0.2518, 0.0212 | |
| K', tau a e r | 0.577, 0.554, 0.557; 0.392, 0.475, 0.509 | Roskam's large deflection factor (Mason's fit) at the sheet's throws |
| CD0 | 0.0202 | Raymer's component build up at 20 m/s (sec. 12.5): wing 0.0073, fuselage 0.0038, tail 0.0031, gear and pants 0.0023 (table 12.5), the cowl's cooling 0.0019 (eq. 12.39 on DA's 11.7 hp), 10 percent for leaks; all laminar 0.0121, all turbulent 0.0283 |
| e | 0.862 | Raymer eq. 12.48 for a straight wing |
| CL max | 0.883 at 3.6e5 to 0.967 at 7e5 | **Sheldahl and Klimas, SAND80-2114 (1981), Table 2, NACA 0012**: 0.9811 at 10 deg and 1.0749 at 11 deg, the drawn 12.6 percent section; 0.9 of it for the wing (Raymer sec. 12.4), the peak further on by CL / (pi A e). The stall at its own Reynolds number, 4.4e5: 0.902 |
| stall_top, stall_k | 1 deg, 0.37 | the same table: a 12 percent section stalls from its leading edge (McCullough and Gault, NACA TN 2502), the lift held 1 deg past its peak at 3.6e5 and falling to 0.28 of it there and 0.46 at 7e5 |
| Stall arms, stall_dw | 0.0571, 0.0929, 0.2522 | the Extra's forms |
| Slipstream, rot_k, side_cda | `scripts/slick-derive.js` | the Extra's forms on this geometry and the 28 in prop |

## What is new in the plant

Nothing of this lane's. The table sets the terms the Extra and the Ugly
Stik brought in (the slipstream, the high angles and the slow air's
damping, the glow throttle and tank, the prop's gyroscope, the stall by
Reynolds number) and the propulsion lane's `thrust_yaw`: the sheet's 3 deg
of right thrust, its sideways part at `prop_x`, 0.609 m ahead of the CG
(the spinner's back plate on the sheet's drawing). Every other aircraft's
recorded hash is unmoved (`slick:gates` S15).

## The intended behaviour, and how each part is proven

`npm run slick:gates`, bands in `tests/slick-thresholds.json`, each band
the Extra's width for the same reason (docs/EXTRA-STAGE1.md). **17 of
17**, measured 2026-10-11 on the batch with the aero lane's plant
(w34-3d-wingslope a83fc2a4: the finite wing's broadside force, Viterna's
B2, the tail's own lift at its own angle), the propulsion stack (the
prop's torque from the drive), the 3 deg of right thrust, and the propulsion lane's APC curves with the DA-120 floating on its map up to DA's 6,900 rpm (w35-prop-ctj 91061d8cb):

| Gate | What | Derived | Band | Measured |
| --- | --- | --- | --- | --- |
| S1 | level at 75 percent of the stick (the engine at DA's 6,900 rpm cap) | 41.70 m/s | 36.70 to 46.71 | 41.65 |
| S2 | stall, power off | 13.88 m/s | 13.05 to 15.82 | 13.91 |
| S3 | glide ratio at 1.4 Vs, 19.4 m/s | 14.06 | 12.38 to 15.75 | 13.49 |
| S4 | top speed (6,900 rpm cap) | 41.70 m/s | 37.53 to 45.87 | 41.66 |
| S5 | roll, full aileron, pb/2V | 0.370 | 0.277 to 0.462 | 0.366 (550 deg/s at 35.2 m/s) |
| S6 | hover stick, height held | 0.3736 (an rpm share of 0.6348 on the engine's map) | 0.355 to 0.392 | 0.3742, within 0.10 m |
| S7 | vertical climb, full throttle | 30.03 m/s | 27.03 to 33.03 | 29.75 |
| S8 | torque roll, ailerons let go | 136 deg/s left | 102 to 170 | 152 left |
| S9 | full right aileron, hanging | 139 deg/s right | 84 to 195 | 144 right |
| S10 | full elevator at zero airspeed | 12.06 rad/s² | 9.05 to 15.08; at idle under 0.147 of it | 10.5; at idle 1.04 |
| S10b | full rudder at zero airspeed, over the same kick with it centred | 8.00 rad/s² | 6 to 10; the same | 9.1 (8.1 less -1.1 centred); at idle 0.90 |
| S11 | harrier at 40 deg of alpha | 11.34 m/s at a stick of 0.315, elevator 74 percent | 9.07 to 13.60, 0.268 to 0.363, short of full | 12.67 at 0.321, stick 0.92 |
| S12 | knife edge at 30 m/s, rolled right | 26.2 deg of sideslip at 0.442, rudder 105 percent: no level knife edge | 19.68 to 32.8, 0.376 to 0.509, short of full | RED: the stick on its stop; the plant holds it there, 25.5 deg at 0.453 and 30.7 m/s, height within 0.02 m; the derivation with the swirl at the fin needs 100 percent there too (knife:budget) |
| S13 | standing on its wheels, engine idling | 9.38 deg, 0.4082 m, 10.9 percent on the tail | half a degree, 5 mm, 3.5 points | 9.36, 0.4088, 10.9 (mains 53.18 and 53.99 N, the right thrust's yaw) |
| S14 | take off roll | 8.01 m | 4.80 to 12.81 | 11.72, 0.22 m off the line |
| S15 | every other aircraft unmoved | the hashes extra:gates E15 pins | identical | identical |
| S16 | Node and Chrome agree | | identical | identical |

Where this derivation goes further than the Extra's, and why:

- **S1, S6, S11, S12: sticks, not rpm shares.** A petrol engine's stick
  runs the rpm along its dyno curve (`throttle_rpm`), so the hover's rpm
  share sqrt(W / T), 0.6343, is a stick of 0.3926.
- **S8: the heading held.** The Extra's E8 counted the fin's roll in the
  swirl against the torque. The gate's pilot holds the nose on the rudder,
  and the rudder's side force is on the same fin at the same height, so
  with the yaw held the fin's net side force and its roll go: the root's
  (1 - SWIRL_KEEP) of the torque is what is left (154 deg/s; with the fin's
  roll counted it would be 109). The Extra's own E8 would move the same
  way (its plant 218 against a derived 178; with the yaw held, 198).
  Less one thing since the right thrust: the fin also holds its yaw,
  prop_x T sin 3 deg = 3.91 N m at the hover, a side force of that over
  l_v 1.456 m at the fin's height 0.226 m, 0.61 N m of roll to the right
  against the torque: 136 deg/s (the plant moved 170 to 152).
- **The right thrust in the balances.** cos 3 deg of the thrust is along
  the axis in every force balance (S1, S4, S6, S7, S11, S13, S14: under
  0.2 percent); in the knife edge, rolled right as S12 flies it, the
  thrust line points 3 deg down from the axis, so it meets the flight path
  at the sideslip less 3 deg, and its yaw pitches the nose down with the
  weathercock's moment, against the rudder (24.8 to 25.5 deg).
- **The engine on its map and APC's curves** (w35-prop-ctj). In the air
  the DA-120 floats: its map's torque at the stick and the speed it
  turns, against the 28 x 10's torque curve and its tips' Mach load, read
  through propcurve.js `wingEngine`, the same solve stab:glide now flies.
  At 75 percent and at full it reaches DA's 6,900 rpm cap, so S1 and S4
  are one speed; idling in the 26 m/s glide it runs 3,407 rpm. The hover
  stick is the one that holds the hover's rpm standing on the map, 0.3736
  (the throttle curve gave 0.393). S6's pilot halves its integral: on the
  map the stick moves the hover's rpm 1.24 times as much and the rotor
  answers 1.18 times slower (slick:derive prints both), and the full
  integral hunted the height in a growing 3 s swing (0.50 m).
- **S10b: the rudder's own.** Hanging, the aircraft yaws with the rudder
  centred too (-1.1 rad/s² at the hover: the swirl on the fin's left turn
  less the right thrust's 0.7), so the gate takes the full rudder's kick
  over the centred one, the share it derives.
- **S10: the engine idles.** A petrol engine does not stop on the stick,
  so the wash at the idle is (idle / hover rpm)² = 0.098 of the hover's,
  and the band is under 1.5 times that.
- **S11: the harrier on every term the plant takes there.** The plant's
  own lift curve past the stall on the aero lane's plant (wing_lift: the
  finite wing's broadside force, 1.11 + 0.018 AR = 1.22, NASA TM-82944,
  Viterna's B2 drag continuity, and the tail lifting at its own angle
  with the elevator's share, saturating on a plate; the wing's CL 0.82 and
  CD 0.53 at 40 deg, 1.12 and 0.85 on the plate's 2.0 before it), Selig's jet normal force at the prop (jet_kj), the
  thrust line 39 mm over the CG and the jet force's arm in the moment. The
  gate's pilot is the Extra's with slower hands on the throttle and more
  pitch damping, flying the nose's attitude (level, the angle of attack)
  as a harrier pilot does: chasing the measured alpha through the stalled
  wing's rock rode a phugoid of 7 to 14 m/s on an aircraft of thirty times
  the Extra's pitch inertia. Its throttle stick is held to 0 to 1, as a
  stick is.
- **S13: the idling engine.** Its 12 N along the thrust line pitches the
  aircraft forward on its mains and takes 2.6 points off the tail (13.5
  with the engine stopped).
- **S14: the engine's spool.** The roll starts from the idle and the
  engine runs up on `prop_spool`'s flat torque.

### Its stabiliser and gyro modes, `npm run slick:stab` (63 checks)

The Extra's checks at the same multiples of this aircraft's stall (its
level throw at 1.4 Vs, its pulls at 1.9 Vs), with one re-derived to the
aircraft: **a power off pull through the stall drops the right wing.** The
DA-120 idles at 1,300 rpm, so its prop keeps J Omega = 0.93 N m s, and
pitching up at q yaws the nose right by J Omega q (a prop turning
clockwise from behind); at the break that yaw drops the right wing, 27 deg
in Manual (trimmed, below), 14 in Acro, 9 in AS3X. The check that showed it: with `j_prop`
set to nearly zero in a scratch build, the same pulls stayed level within
3 deg in every mode, and a touch of rudder dropped 9 to 28 deg either
way. The checks now hold the drop to the right and a touch of rudder
moving it the way it yaws. Short of the stall nothing picks a side in
Manual and Acro; AS3X, whose heading hold answers the precession's yaw on
the rudder, rolls right 5 deg there (level within 3 deg with `j_prop`
zeroed). Its level flight is flown at the stabiliser's trim stick, 0.155 (the
engine floats on its map, so a small stick holds 22 m/s), and its
taxi on the idle's 12 N, turning over 26 deg in 4 s: the Extra's 45 on
its 0.98 m wheelbase at this one's 1.69.

**OPEN, red: the Manual quarter pull reads 4.3 deg (limit 3) on the
prop curves.** The engine now idles at 3,407 rpm in the 26 m/s glide, not
1,300: 2.6 times the gyroscope, and as the pull slows it the rotor's spin
down comes back through the mount. Scratch builds keyed on this table:
without the gyroscope's moment 2.1 deg, without the mount's torque 2.4,
with both 4.3; both roll it right. The check's premise (short of the
stall nothing picks a side) held at a 1,300 rpm idle and no longer does;
whether the check becomes "drops right, by the gyroscope's and the
spin down's own" or the pilot holds the wings is the lead's to decide.

**The power off pulls fly trimmed in Manual.** With the propulsion
stack's prop torque from the drive, the engine held at its 1,300 rpm idle
in the 26 m/s glide is driven by the air (Cp's FITTED tail at a thrust
share of -1.81, the idle's pitch speed 9.2 m/s): about 1.05 N m on the
mount the prop's way, a steady roll to the right of 1.3 deg/s with the
sticks centred, before any pull. With that reaction clipped to zero in a
scratch build the quarter pull held 1.1 deg; with it, 8.5. A pilot trims
it out: the first second holds the wings on the wings' level law
(wingpilot.js loopHold's), and the pull flies on that aileron, frozen
(stick -0.007, a check of its own). Then the quarter pull holds 2.2 deg,
the half pull drops the right wing 27 deg, the rudder touches 22 and 32.
Acro and AS3X fly centred: their sticks are rates.

**What AS3X does through the idle stall.** The half stick pull is a zoom:
the nose passes 60 deg and the speed goes at the top, where the wing
drops. On the merged plant with the aero lane's lateral model (w34-3d-
batchlat 39f64822), scratch builds split the cause: with `j_prop` zeroed
and the driven idle's torque clipped every mode stayed level to 0.0 deg;
with either one alone the drop was right in every mode. Acro holds the
rate until the ailerons run out of air, then drops 12 deg in the last half
second; AS3X also holds the attitude (Spektrum's heading hold,
`as3x_kh`) and its drop has only begun by the end, 2.4 deg. The check
holds what the physics gives: right, the gyroscope's and the torque's
side, and less than Acro's. The 9 deg it read before, and the 3 deg it
was held over, came from AS3X fighting a strip aileron reversal in the
stall that NACA TR 419 says does not happen. With the right thrust
the take off with the sticks centred still swings left, by 1.1 deg at
liftoff where it was 12.8: the thrust line takes out most of the swirl's
and the P factor's turn, which is what EF builds it in for.

Stabilised and AS3X use the Extra's loops; `stab_pitch_down` 2.47 deg and
`stab_trim_throttle` 0.155 from `npm run stab:glide` (which now floats a
mapped engine, propcurve.js `wingEngine`), `as3x_k`, `as3x_kh` and `as3x_rate` from `npm
run as3x:derive` (its dive check flown at sim_wing_launch's 60 m/s cap,
under this aircraft's 1.45 times 42 m/s), `as3x_frame` 11 ms for the
sheet's digital servos; `stab:chop` holds its power off glide.

## What is not modelled, and waits on the physics lanes

Reported plainly, per the owner's rule:

- **The idle in a fast glide.** The plant holds the engine at its idle
  rpm whatever the airspeed, so in a 26 m/s glide the air drives the prop
  against it, on Cp's straight tail far past APC's data (a thrust share
  of -1.81, the tail's zero at -0.112): 1.05 N m on the mount. A real
  DA-120 at a closed throttle speeds up there until its friction and
  pumping hold the prop, which no source here measures. The direction is
  real, the size is the propulsion lane's to source.
- **The right thrust's side force** acts at the disc in the plant's yaw
  only; its height over the CG (39 mm) gives 0.25 N m of roll at the hover
  that neither the plant nor the derivation takes.
- **The carburettor's own delay**: not modelled; the dyno's throttle curve
  and the flat torque spool are.
- **The thrust past the static point** is a straight line to its pitch
  speed; a real prop's Ct(J) curve and the rpm a petrol engine gains as
  its prop unloads in flight are not in it.
- **The rudder's roll in the wash** is taken at the whole fin's height
  (cl_dr times the wash's dp), where the immersed part sits lower; it is
  why S8 reads 12 percent over its derivation.
- **The inner wing in the wash** gets no extra lift; the tail surfaces
  saturate on a flat plate without a section stall of their own (the
  Extra's notes).
- **Snaps and spins**: the plant's spins are shallow (docs/FLIGHTMODEL.md,
  "Deep spins and the Stik's snap: not built"). The section's sharp stall
  (stall_top 1 deg, stall_k 0.37) is in the table for when they are.
- **The fuel's mass** does not burn off (the glow convention).
- **The kill switch**: a real petrol aircraft's ignition cut stops the
  engine; the plant's engine stops only on a dry tank.

## The crash parts

`src/native/crash_parts.h` PARTS_SLICK2680: the forward fuselage (the
engine box, firewall, tank, tube sleeves, gear plate and cowl, the rest of
the mass), the aft fuselage, the stabiliser and elevators, the fin and the
full depth rudder, two wing panels on the tube with their ailerons, the
DA-120 and mufflers on their stand offs, the carbon prop and spinner, the
receiver packs, the canopy on its pins, the two carbon legs and the
tailwheel, the camera and the antenna; 19 parts summing to 12.474 kg with
the CG at the origin (`npm run crash:core`). Strengths ESTIMATED for the
class: the wing's root at twelve times its half's weight on the half
span's lift centroid (400 N m), the engine on its four bolts and stand offs
(200 N m), the carbon gear at four landings' worth (150 N m).

## The model

`src/render/slickcraft.js`, off the sheet's drawing as measured above: the
round cowl on the petrol twin, the slab sided fuselage, the long bubble
canopy running into the turtle deck, the tapered mid wing with its moulded
tips and ailerons to the tip rib, the stabiliser whose elevators carry
balance horns outboard of 0.42 m, the full depth rudder with its horn, two
pants on carbon legs and a steered tailwheel, the 28 x 10 carbon prop
behind the 5 in spinner, its disc reading the engine's 686 rad/s at full.
It stands at 9.40 deg and 0.4088 m drawn (the plant's 9.36 and 0.4088
idling); `craft:check` holds its span and reach (3455 mm, the rudder's
foot 1.728 m aft further than the tips) to the airframe row. The pad
shot's orbit now scales with a craft's span past 1.5 m (src/main.js
INTRO_SPAN), or its lens would orbit inside this wing.

## In the shell

- `configs/airframes.js` slick2680, simId 33; `voice` the two stroke's,
  `glow2` (src/render/audio.js has no petrol twin's note of its own).
- Tunes `slick-as3x` (the default), `slick-manual`, `slick-stab`
  (configs/registry.js): an ARF ships with no electronics, and a builder's
  heading gyro is what a 35 percent 3D aircraft carries (owner rule
  2026-10-08, any real gyro), the Extra's three.
- Power (configs/power.js): the DA-120 on the 28 x 10 and the sheet's
  34 oz tank of petrol at 0.73 g/cc; the hangar's estimate flies 42.53
  m/s and 24.1 minutes at its 22 m/s cruise (`power:check`). No other
  prop yet: APC measures no 27 or 28 in two blade, and Falcon's chart (its
  27 x 11 and 28 x 9.5 on the DA-120) wants a measured prop kind of its own.
- Tuning (configs/tuning.js): the sheet's CG range on the tube, its throws
  high and low, its 55 percent expo.
- Kit: the Extra's slots, a bullet or striped spinner, a smoke or gold
  canopy, and the side force generators EF sells.
- Liveries (configs/liveries.js): EF's three V3 schemes, the 10th
  Anniversary red and white (stock), white with blue and orange, and cub
  yellow with red and grey, in the sheet's Oracover colours.
- It opens at **level 12**, last, this lane's call by analogy (the owner
  may move it): the biggest and most advanced aircraft, the Extra's hover
  and torque roll with twelve and a half kilograms of momentum, and the
  build guide's "If this is your first aerobatic RC aircraft, it is highly
  recommended that you recruit an experienced giant scale RC enthusiast",
  as the F-16 at 11 opens on its maker's ask for experience. No aircraft
  has a price; its kit items are KIT_PRICE as every kit's.
- `aircraft/slick2680/aircraft.js`, born with its folder: `npm run
  aircraft:folder` holds it equal to every hand row (foundations item 5).
- The figures: `npm run slick:figures` flies figures-plant-check.js's
  person paced pilot on it (loop 7, aileron roll 8.5, a sagging 4-point
  roll 6.5, nothing else named); `callouts:check -- --airframe=slick2680` passes
  32 of 32 with it seated in Free Flight. Trick Battle was NOT run on it
  (`jam:twopage` throws a quad with no forward speed); its runner scores
  with the same figure detector and scorer the Free Flight callouts
  exercised.

## What the owner should feel flying it

Everything happens slower to start and longer to stop than on the Extra:
it is eight times the mass at twice the size. Pull it vertical and bring
the stick back to about 40 percent: it hangs, and turns left about its
nose at about half a turn a second until the ailerons hold it; more
aileron and it turns back. At walking pace with the nose 40 deg up and the
stick near a third it mushes along. Full aileron at 35 m/s rolls it about 550
deg/s. Close the throttle and pull hard: the right wing drops at
the break, the idling prop's gyroscope. On the ground the engine idles and
the tail is light; under power it swings left only a little, the 3 deg
of right thrust taking out most of it, and wants a touch of right rudder.
Gliding fast at the idle it rolls slowly right, the air driving the
idling prop: a touch of left aileron trims it. What would be wrong: a snap that flicks like the Extra's, a
hover that holds itself without the pilot, a torque roll to the right, the
engine stopping on the stick.

## Sources

- Extreme Flight, 100 in Slick 580 EXP V3 pages:
  https://extremeflightrc.com/products/ef-100-slick-580-exp-v2-red-anniversary-scheme ,
  https://extremeflightrc.com/products/ef-100-slick-580-exp-v3-cub-yellow-red-grey ,
  https://extremeflightrc.com/products/105-5-slick-580-exp-v2-white-blue-orange
  (read 2026-10-11; listings via https://extremeflightrc.com/products.json)
- The V2 data sheet and its drawing:
  https://extremeflightrc.com/cdn/shop/files/105.5SlickDatatSheet.pdf ,
  https://extremeflightrc.com/cdn/shop/files/DATASHEET_105SLICK580v2.pdf
- The 120cc build guide (throws, right thrust, props, CG):
  https://extremeflightrc.com/cdn/shop/files/120cc_build_guide.pdf
- The V2/V3 hardware bag: https://extremeflightrc.com/products/105-v2-slick-580-hardware-bag
- Desert Aircraft DA-120: https://www.desertaircraft.com/products/da-120
- HFE International, DA120 EFI Data Sheet, HFEDCN0810 Rev A (the part
  throttle dyno, 575 g/kWh): https://hfe.aero/wp-content/uploads/2025/11/DA120-Data-Sheet.pdf
- Falcon Propeller test chart (the DA 120CC column):
  https://www.falconpropellers.com/wp-content/uploads/2020/04/Falcon-Propeller-Test-Chart.pdf
  (and its .xlsx); the chart's page https://www.falconpropellers.com/prop-chart/
- Owners' tachometers, DA-120 on a 28 x 10: https://www.flyinggiants.com/forums/showthread.php?t=311135 ,
  https://www.rcuniverse.com/forum/gas-engines-142/9523621-new-da-120-a.html
- APC performance data, PER3_22x8.dat (via the Internet Archive when
  apcprop.com refuses the fetcher): https://www.apcprop.com/files/PER3_22x8.dat
- Moulton, Performance Measurement and Simulation of a Small Internal
  Combustion Engine (3W 100i-B2), University of Maryland, 2007:
  https://drum.lib.umd.edu/handle/1903/6905
- Sheldahl and Klimas, Aerodynamic Characteristics of Seven Symmetrical
  Airfoil Sections Through 180-Degree Angle of Attack, SAND80-2114, 1981:
  https://www.osti.gov/biblio/6548367
- McCullough and Gault, Examples of Three Representative Types of Airfoil
  Section Stall at Low Speed, NACA TN 2502, 1951.
- Slick 360: https://en.wikipedia.org/wiki/Slick_Aircraft_Slick_360
- Selig, Modeling Propeller Aerodynamics and Slipstream Effects on Small
  UAVs in Realtime, AIAA 2010-7938; Nelson, Flight Stability and Automatic
  Control; Raymer, Aircraft Design; Roskam, Airplane Design VI (Mason's
  curve fit); Hoerner; Heywood, Internal Combustion Engine Fundamentals; as
  the other stage files cite them.
