# Control surface tiers, stage 1: the physics

The hangar's bigger control surfaces (owner, 2026-10-11): per surface,
aileron, elevator and rudder, a tier from Stock through Sport and 3D to
Extreme. Each tier draws the surface bigger, lets it travel further, and
flies as a real aircraft with those surfaces does. This file is every
number behind them, with its formula and source. Slice 1 is the plant and
the data for the Extra 300 3D and the Cub (the Slick 580, the Night Timber X and the Turbo Timber since); the
hangar's tab, the account sync and the room lineup follow (`~/Desktop/fdfpv-loop/CONTROL-SURFACES-PLAN.md`).

## What a tier is

A 3D conversion moves a surface's hinge line forward on the same wing,
stabiliser or fin: the surface's chord fraction cf grows, the planform does
not. So the aircraft's stability terms (Cm alpha, Cn beta, the damping, the
slipstream's stabiliser and fin shares) stay the table's and only its
control terms move. Each tier also allows a bigger throw, as the bigger
horn does.

The ladder: from the stock aircraft's cf and throw toward a reference in
equal steps, never smaller than stock. Sport is a third of the way, 3D two
thirds, Extreme the reference. The reference is the biggest surface measured on
a real aircraft in this hangar, and Extreme Flight's 3D throws:

| | aileron | elevator | rudder | source |
|---|---|---|---|---|
| cf | 0.43 | 0.67 | 0.80 | CAP 580 (`scripts/cap580-derive.js`), CAP 580, DH.82 Tiger Moth (`scripts/tigermoth-derive.js`) |
| throw, deg | 40 | 50 | 50 | EF 60 in Edge 540T data sheet: aileron high 38 to 40, elevator 3D 45 to 50, rudder high 45 to 50 (`docs/EDGE-STAGE1.md`) |

50 deg is also where Roskam's K' (below) is last falling; past it Mason's
fit turns back up, so no tier asks for more.

## The plant: `sim_wing_set_tiers`

A new mode (`src/native/sim_abi.h`), seated between the power option and
the pilot's tuning, which scales the plant's own terms on a copy of the
table, so it composes with whatever those terms are (the aero lane's
lateral changes included):

- K_A multiplies Cl delta_a, the adverse yaw Cn delta_a / CL, and each
  wing strip's tau (the aileron's share of the strip's zero lift angle,
  `plant_wing.c`), so a bigger aileron also takes its strip to the stall
  sooner at the same roll rate.
- K_E multiplies Cm delta_e and CL delta_e. With `hi_alpha` the tail's
  angle carries the elevator's share, `-Cm_de delta_e / V_H`, and saturates
  on the flat plate's normal force, so a bigger elevator stalls the tail
  sooner.
- K_R multiplies Cn, CY and Cl delta_r; the fin saturates the same way.
- CD_A, CD_E, CD_R: the deflected surface's drag over the table's.

The slipstream's share of each surface (`plant_wing.c`, the jet over the
tail and ailerons) reads the same terms, so hover authority scales too.
Nothing seated, no step reads any of it; seated at ones and zeros the trace
is bit identical (gate T2).

## The numbers, `scripts/surfaces-derive.js`

Per surface and tier:

**Effectiveness.** k = tau(cf) K'(throw) / (tau(cf0) K'(throw0)).
tau is Glauert's thin aerofoil flap effectiveness, 1 - (theta - sin theta) / pi
with cos theta = 2 cf - 1 (Glauert, ARC R&M 1095, 1927; Abbott and von
Doenhoff, *Theory of Wing Sections*, sec. 8.2). K' is Roskam's plain flap
correction at the full throw (*Airplane Design* VI, fig. 10.7, Mason's fit,
as `scripts/extra-derive.js` has it), which every table folds into its
derivatives at full throw. A ratio, so the viscous correction to thin
aerofoil theory, which both cf share, drops out to first order, and the
table's own figure is what it multiplies. The control power at full stick
is k times the throw ratio.

**Drag.** A plain flap's section profile drag is fitted as
cf (0.2476 |delta| + 0.3992 delta^2), delta in rad, to Roskam VI fig. 4.44
(plain flaps, cf 0.1 to 0.3, at 15 and 60 deg, as FAST-GA digitised it,
`delta_drag_plain_flap.csv` in supaero-aircraft-design/FAST-GA, its points in `scripts/surfaces-derive.js`, which fits them and checks the two constants): within 13
percent of every point. The form (SURF_DRAG_A, SURF_DRAG_B in
`plant_wing.c`) is linear in cf, so a tier's increment is
cd = (cf - cf0) S_flapped / S on the wing's area. Past cf 0.3 the figure
stops and the same form is taken on. The plant adds it after the skin
friction's Reynolds scaling, since it is a pressure drag. Gate T5 checks
the plant against the formula to 1 percent.

**Servo and mass.** A plain flap's hinge moment is H = q b_f c_f^2 (Ch_delta
shape(delta) + Ch_alpha alpha), b_f its span and c_f its root mean square
chord (`scripts/lib/hinge.js`). Ch_delta at a constant angle of attack
comes from Ames and Sears, NACA Report 721 (1941), the NACA 0009's plain
flap data read off its figs. 1(b), 2(a) and 2(b), through its eq. (3),
with the surface's aspect ratio by its eq. (11): -0.59 to -0.78 per rad
over this hangar's surfaces. The surfaces lane's first figure, "about
-0.55 per rad", had no source and is replaced. Ch_alpha is the same
report's (dch/dcn) times the finite surface's slope, 0.2 to 0.9 of
Ch_delta. The shape past the small angles is Ames and Sears, NACA TN 759,
fig. 13(d), the 0.30c flap at alpha 0.5 deg, its moment at 0 to 45 deg
over its small angle slope (0.94 of linear at 30 deg, 0.84 at 45). The
servo meets it through its linkage, which turns its +-45 deg of travel
into the surface's throw (ESTIMATED: no kit publishes its arm and horn
holes), so the servo's torque at the surface is its stall torque times
45 over the throw.

The stock surfaces fly the kit's servos, at the torque published for
them (`scripts/servo-derive.js`), and blow back where the hinge moment
passes it (`plant_wing.c` hinge_hold, below). A tier's servos are sized
to hold its full throw at the aircraft's top speed (configs/surfaces.js
vTop): the lightest catalogue servo from the stock class up (Hitec, at
6.0 V: HS-55 8.0 g 1.30 kg-cm, HS-65MG 12.47 g 2.2, D89MW 25.0 g 6.4,
D645MW 60.0 g 11.3, D950TW 68 g 29.0; Savox SB-2290SG 81 g 45.0; sources
in `configs/surfaces.js`), and where none covers it more of them, as a
builder gangs servos: one more a side for a pair, one more for a single,
the moment shared. The difference in mass goes on as add-ons at the
servos' places, through `configs/hangar-parts.js addonParams`, the
aileron pair's spread through `sim_set_addon_inertia` (a servo off the
centreline is mirrored, half each side). The surface itself adds no
area, so no structure mass. The `hold` column is the tier's servo hold
over the stock's, which `sim_wing_set_tiers` carries to the plant
(HOLD_A, HOLD_E, HOLD_R). The table's servos and their sources are
`configs/surfaces.js`.

Where the stock servos blow back, at full throw and level flight
(`npm run servo:derive`): the Night Timber's A332s let the elevator go
at 12.0 m/s, the aileron at 17.9 and the rudder at 18.2; the Timber's
A370s the aileron at 20.8 and the elevator at 25.8; the Extra's D89MWs
the rudder at 20.9 and the aileron at 29.7; the Slick's SB-2290SGs the
rudder at 31.3 and the elevator at 37.3; the Cub's HS-55s hold all three
past 48 m/s.

**Cross-checked (2026-10-12).** Two hobby servo sizing formulas, flat
plates at a steady angle, at a 1:1 linkage, give the hinge moment per
(m/s)^2 against this one's at full throw. StraightEdge's (BARCS
Builders Workshop, "Servo torque calculator wanted", 22 July 2024: 1.3
x length cm x chord cm^2 x (m/s)^2 x deflection deg / (2,000,000 x
9.81), kg-cm): this model over it 0.78 to 1.31 across the Night Timber's
three surfaces, the Timber's aileron and elevator, the Extra's rudder,
the CAP's elevator, the Slick's rudder and the Cub's aileron. Chuck
Gadd's (8.5e-6 x chord^2 x mph^2 x length x sin x tan / tan, oz-in, as
Model Airplane News' calculator gives it) reads 16 times lower with
chord and length in inches, as that page states them, and agrees within
1.14 to 1.66 with them in centimetres, so the inches look like the
page's slip. The full throw's blow back speeds the three give through
the same linkage and servo: the Night Timber's elevator 12.0 here, 11.7
StraightEdge, 13.4 Gadd; its aileron 17.9, 18.9, 21.5; the Timber's
aileron 20.8, 21.2, 24.1; the Extra's rudder 20.9, 18.5, 22.4. They
agree inside what the inputs allow. No measured blow back report was
found for these kits.

The input that is weakest is the servo. The Night Timber's Avian 60 A
ESC (SPMXAE1060) gives a 6.0 V BEC (Horizon Hobby's listing, "6V/7.2V
adjustable"), but Spektrum publishes no 6.0 V torque for the A332, and
its only published figure, 0.9 kg-cm at 4.8 V, comes from listings
(lindinger.at, flashrc.com) whose same spec block reads 6 g and nylon
gears, against the A332's 9 g and metal gears. So no 6 V scaling is
taken, by rule, and the 0.9 is the number to check first: a 9 g metal
gear servo's usual 1.5 to 2 kg-cm would move the elevator's 12.0 m/s to
about 15.5 to 18.

**Not offered.** A surface whose Extreme adds under 10 percent of control
power over stock is left stock: the Extra's rudder (cf 0.76 at 55 deg is
already the reference's class), whose Extreme would add 1.4 percent and a
35 g servo.

**The CAP 580 has none.** The reference's aileron and elevator are the
CAP's own (cf 0.43 and 0.67), and its stock throws are EF's 3D ones
(aileron 38 up 34 down, elevator 50, rudder 50 to 55: the data sheet's
high rates, which `configs/tuning.js` already flies). Its Extreme would add
8.4 percent on the aileron (the throw 36 to 40 deg), nothing on the
elevator and 4.0 percent on the rudder (cf 0.70 to 0.80 at its 52.5 deg),
all under the 10 percent rule, so it is not in `configs/surfaces.js`
rather than given a tab of three "not offered" rows. Its stock elevator is
the Extra's Extreme one. EF's Slick sheet does publish a bigger elevator
setting, "XA/Tumbling: 60+ deg", but 50 deg is where Roskam's K' (Mason's
fit) stops falling, so no tier goes past it and the XA throw is not one.

### Extra 300 3D (sim 29)

| surface | tier | cf | throw deg | k | power | cd | servos | added | hold |
|---|---|---|---|---|---|---|---|---|---|
| aileron | stock | 0.290 | 36.53 | 1.000 | 1.000 | 0 | 2 D89MW | 0 | 1.00 |
|  | sport | 0.337 | 37.69 | 1.059 | 1.093 | 0.0402 | 2 D950TW | 86 g | 3.17 |
|  | 3d | 0.383 | 38.84 | 1.112 | 1.182 | 0.0804 | 2 D950TW | 86 g | 2.31 |
|  | extreme | 0.430 | 40.00 | 1.159 | 1.269 | 0.1206 | 2 D950TW | 86 g | 1.75 |
| elevator | stock | 0.450 | 39.67 | 1.000 | 1.000 | 0 | D89MW | 0 | 1.00 |
|  | sport | 0.523 | 43.11 | 1.045 | 1.135 | 0.0174 | D950TW | 43 g | 3.10 |
|  | 3d | 0.597 | 46.56 | 1.085 | 1.273 | 0.0349 | D950TW | 43 g | 2.26 |
|  | extreme | 0.670 | 50.00 | 1.123 | 1.415 | 0.0523 | D950TW | 43 g | 1.73 |
| rudder | stock | 0.760 | 55.05 | 1.000 | 1.000 | 0 | D89MW | 0 | 1.00 |
|  | sport | 0.773 | 55.05 | 1.005 | 1.005 | 0.0012 | D950TW | 43 g | 4.38 |
|  | 3d | 0.787 | 55.05 | 1.010 | 1.010 | 0.0025 | D950TW | 43 g | 4.24 |
|  | extreme | 0.800 | 55.05 | 1.014 | 1.014 | 0.0037 | D950TW | 43 g | 4.11 |

### Cub (sim 4)

| surface | tier | cf | throw deg | k | power | cd | servos | added | hold |
|---|---|---|---|---|---|---|---|---|---|
| aileron | stock | 0.250 | 18.00 | 1.000 | 1.000 | 0 | 2 HS-55 | 0 | 1.00 |
|  | sport | 0.310 | 25.33 | 0.871 | 1.226 | 0.0326 | 2 HS-55 | 0 | 0.44 |
|  | 3d | 0.370 | 32.67 | 0.832 | 1.511 | 0.0651 | 2 HS-65MG | 8.9 g | 0.39 |
|  | extreme | 0.430 | 40.00 | 0.839 | 1.864 | 0.0977 | 2 D89MW | 34 g | 0.65 |
| elevator | stock | 0.400 | 15.00 | 1.000 | 1.000 | 0 | HS-55 | 0 | 1.00 |
|  | sport | 0.490 | 26.67 | 0.731 | 1.300 | 0.0151 | HS-55 | 0 | 0.37 |
|  | 3d | 0.580 | 38.33 | 0.679 | 1.734 | 0.0302 | HS-65MG | 4.5 g | 0.32 |
|  | extreme | 0.670 | 50.00 | 0.686 | 2.286 | 0.0453 | D89MW | 17 g | 0.55 |
| rudder | stock | 0.500 | 15.00 | 1.000 | 1.000 | 0 | HS-55 | 0 | 1.00 |
|  | sport | 0.600 | 26.67 | 0.721 | 1.282 | 0.0071 | HS-55 | 0 | 0.42 |
|  | 3d | 0.700 | 38.33 | 0.661 | 1.690 | 0.0143 | HS-55 | 0 | 0.24 |
|  | extreme | 0.800 | 50.00 | 0.661 | 2.203 | 0.0214 | HS-65MG | 4.5 g | 0.25 |

### Slick 580 (sim 33)

| surface | tier | cf | throw deg | k | power | cd | servos | added | hold |
|---|---|---|---|---|---|---|---|---|---|
| aileron | stock | 0.320 | 37.50 | 1.000 | 1.000 | 0 | 4 SB-2290SG | 0 | 1.00 |
|  | sport | 0.357 | 38.33 | 1.043 | 1.066 | 0.0295 | 6 SB-2290SG | 162 g | 1.15 |
|  | 3d | 0.393 | 39.17 | 1.082 | 1.130 | 0.0591 | 6 SB-2290SG | 162 g | 0.90 |
|  | extreme | 0.430 | 40.00 | 1.117 | 1.192 | 0.0886 | 8 SB-2290SG | 324 g | 0.97 |
| elevator | stock | 0.566 | 47.50 | 1.000 | 1.000 | 0 | 2 SB-2290SG | 0 | 1.00 |
|  | sport | 0.601 | 48.33 | 1.020 | 1.038 | 0.0075 | 4 SB-2290SG | 162 g | 1.74 |
|  | 3d | 0.635 | 49.17 | 1.039 | 1.076 | 0.0150 | 4 SB-2290SG | 162 g | 1.53 |
|  | extreme | 0.670 | 50.00 | 1.057 | 1.113 | 0.0225 | 4 SB-2290SG | 162 g | 1.35 |
| rudder | stock | 0.680 | 45.00 | 1.000 | 1.000 | 0 | SB-2290SG | 0 | 1.00 |
|  | sport | 0.720 | 46.67 | 1.013 | 1.051 | 0.0050 | 3 SB-2290SG | 162 g | 2.59 |
|  | 3d | 0.760 | 48.33 | 1.026 | 1.102 | 0.0100 | 3 SB-2290SG | 162 g | 2.25 |
|  | extreme | 0.800 | 50.00 | 1.039 | 1.155 | 0.0150 | 3 SB-2290SG | 162 g | 1.96 |

Its stock cf (aileron 0.32, elevator 0.566, rudder 0.68) and throws
(37.5, 47.5, 45) are `scripts/slick-derive.js`'s off EF's 105.5 in data
sheet; its Extreme is the reference, so its ladder is short: 19, 11 and 15
percent of control power. Measured on batch 8193fc829 (full stick deg/s /
a fifth of a stick deg/s / speed kept): roll 672 / 60 / 0.964 stock to
767 / 72 / 0.894 Extreme; pitch 298 / 56 / 0.752 to 308 / 64 / 0.683; yaw
211 / 22 / 0.828 to 235 / 25 / 0.702. The pitch rate barely moves at
cruise; a fifth of a stick and the speed kept do.

### Night Timber X (sim 30)

| surface | tier | cf | throw deg | k | power | cd | servos | added | hold |
|---|---|---|---|---|---|---|---|---|---|
| aileron | stock | 0.383 | 28.92 | 1.000 | 1.000 | 0 | 2 A332, flaperons 2 A332 | 0 | 1.00 |
|  | sport | 0.399 | 32.61 | 0.962 | 1.085 | 0.0064 | 2 D89MW, flaperons 2 HS-65MG | 38.9 g | 5.76 |
|  | 3d | 0.414 | 36.31 | 0.942 | 1.182 | 0.0127 | 2 D89MW, flaperons 2 D89MW | 64 g | 4.76 |
|  | extreme | 0.430 | 40.00 | 0.930 | 1.287 | 0.0191 | 2 D89MW, flaperons 2 D89MW | 64 g | 3.98 |
| elevator | stock | 0.525 | 35.81 | 1.000 | 1.000 | 0 | A332 | 0 | 1.00 |
|  | sport | 0.573 | 40.54 | 1.004 | 1.137 | 0.0134 | D89MW | 16 g | 5.33 |
|  | 3d | 0.622 | 45.27 | 1.014 | 1.282 | 0.0268 | D645MW | 51 g | 7.28 |
|  | extreme | 0.670 | 50.00 | 1.031 | 1.440 | 0.0402 | D950TW | 59 g | 14.85 |
| rudder | stock | 0.600 | 33.75 | 1.000 | 1.000 | 0 | A332 | 0 | 1.00 |
|  | sport | 0.667 | 39.17 | 0.996 | 1.156 | 0.0079 | D89MW | 16 g | 5.16 |
|  | 3d | 0.733 | 44.58 | 1.003 | 1.325 | 0.0158 | D89MW | 16 g | 3.86 |
|  | extreme | 0.800 | 50.00 | 1.017 | 1.506 | 0.0237 | D89MW | 16 g | 2.94 |

Its stock cf (aileron and flap 0.383, elevator 0.525, rudder 0.60) and
throws (28.92, 35.81, 33.75, E-flite's high rates of 45, 55 and 55 mm) are
`scripts/nighttimber-derive.js`'s off E-flite's photographs and manual
(docs/NIGHTTIMBER-STAGE1.md). The rates are the stock tier. E-flite's
"for maximum 3D performance" is about two other things: the steel
stabiliser joiner's rearward CG (manual p. 8, which this aircraft does
not fly, docs/NIGHTTIMBER-STAGE1.md) and the elevator pushrod "in the
inner hole of the elevator control horn" (p. 5), which gives more
elevator throw than the chart's 55 mm. E-flite gives no figure for that
throw, so the elevator's ladder up to EF's 50 deg is what stands in for
it. Extreme adds 29, 44 and 51 percent of control power. Its aileron k
falls below one, as the Cub's does. The tier's extra 11 deg of throw
lands where Roskam's K' falls fastest (0.63 at 28.9 deg, 0.57 at 40), and
only the outboard 70 percent of the roll moment gets the bigger chord.

**The flaperons.** The manual's advanced setup (pp. 18 and 19, P-Mix 2
and 3) runs the flaps with the ailerons for full span ailerons. It sets
"the flap travel to aileron travel at full aileron right and left", so
the flap panels make the inboard 0.093 to 0.319 m of the aileron, and
the table's Cl delta_a and stall strips cover 0.093 to 0.563 m. The
flaps are also the flaps: their notches, the manual's flap to elevator
mix (14 and 20 percent) and the owner's elevator to flap mix (up
elevator lowers them, `configs/tuning.js` ELEV_FLAPS, plant_wing.c) all
work on the flap panels through the table's flap terms (cl_df, clmax_df,
cd_df2, cm_dcl_f, de_df). `sim_wing_set_tiers` does not scale those
terms. **Decision: the aileron tier moves the hinge on the outboard
ailerons only. The flap panels keep their chord and take the tier's
throw**, because the manual's mix makes their aileron travel match the
ailerons'. Why the flaps keep their chord:

- Every flap figure stays sourced. E-flite's 14 and 20 percent
  compensation is set for the stock flap, and nothing publishes the mix
  for a bigger one. The full flap stall that N2b holds (the video
  pilot's own 6.7 to 8.0 m/s) and the take off (N14) are the stock
  flap's too.
- The owner's elevator to flap mix flies the same panel on every tier.
  A bigger aileron makes the ailerons bigger. It does not change what
  up elevator does to the flaps.
- A bigger flap chord would need the flap terms scaled with it, and the
  plant does not do that. It would be a plant change (src/native, the
  plant lane's), not a table row.

So k weighs the two panels by their share of the rolling moment, which
on the constant chord goes as y^2 across each. The flaperons carry
(0.319^2 - 0.093^2) / (0.563^2 - 0.093^2) = 0.302 of it at the stock
tau, and the ailerons carry the rest at tau(cf):
k = ((1 - 0.302) tau(cf) + 0.302 tau(cf0)) K'(throw) / (tau(cf0) K'(throw0))
(`configs/surfaces.js` flaperons). The drag cd is taken on the
ailerons' wing alone, 2 (0.563 - 0.319) / 1.2 = 0.406 of the area. The
ailerons' servos are sized to hold the tier's chord and throw at the
top speed, and the flaperons' the stock chord at the tier's throw, on
their own 0.226 m panels.

**The servos.** E-flite fits six Spektrum A332 9 g metal gear servos
(manual p. 3, "5 x SPMSA332, 1 x SPMSA332R"): two ailerons, two flaps, the
elevator and the rudder. The A332's only published torque is 0.9 kg-cm at
4.8 V (lindinger.at, "Torque kg/cm (4,8V): 0,9"), which is taken as it
stands. Through the +-45 deg linkage the aileron (one 0.244 m panel, 0.092
m of flap chord, Ch_delta -0.72 per rad) holds its 28.9 deg to 17.9 m/s
and 13.3 deg at 25 m/s; the elevator (0.495 m, 0.084 m, -0.65) holds its
35.8 deg only to 12.0 m/s, 18.5 deg at 15 and 7.3 deg at 25; the rudder
its 33.8 deg to 18.2 m/s. The flaperons fly on the same servos at the
same angle on a 0.226 m panel, so the aileron's hold stands for them.

Measured on this branch, the servos blowing back (full stick deg/s / a
fifth of a stick deg/s / speed kept, from level at the cruise throttle):
roll 504 / 105 / 0.833 stock to 772 / 140 / 0.550 Extreme; pitch 177 /
89 / 0.969 to 361 / 125 / 0.692; yaw 149 / 31 / 0.927 to 219 / 46 /
0.706. The stock pitch rate is the A332 letting the elevator go: its
Sport D89MW holds the throw and pitches at 322. The roll's speed kept
drops furthest. Its 2 s full roll from cruise is a falling barrel roll,
so sqrt(v^2 + 2 g dz) is the difference of two near numbers, and the
Extreme roll's bigger yaw and pitch excursion shows up nearly whole in
the bar.

### Turbo Timber Evolution (sim 7)

| surface | tier | cf | throw deg | k | power | cd | servos | added | hold |
|---|---|---|---|---|---|---|---|---|---|
| aileron | stock | 0.270 | 30.00 | 1.000 | 1.000 | 0 | 2 A370 | 0 | 1.00 |
|  | sport | 0.323 | 33.33 | 1.040 | 1.155 | 0.0255 | 2 D89MW | 32 g | 4.26 |
|  | 3d | 0.377 | 36.67 | 1.079 | 1.319 | 0.0511 | 2 D89MW | 32 g | 2.75 |
|  | extreme | 0.430 | 40.00 | 1.118 | 1.490 | 0.0766 | 2 D645MW | 102 g | 3.30 |
| elevator | stock | 0.440 | 20.00 | 1.000 | 1.000 | 0 | A370 | 0 | 1.00 |
|  | sport | 0.517 | 30.00 | 0.834 | 1.250 | 0.0151 | D89MW | 16 g | 3.34 |
|  | 3d | 0.593 | 40.00 | 0.803 | 1.606 | 0.0302 | D89MW | 16 g | 1.88 |
|  | extreme | 0.670 | 50.00 | 0.812 | 2.030 | 0.0452 | D950TW | 59 g | 5.36 |
| rudder | stock | 0.460 | 27.00 | 1.000 | 1.000 | 0 | A370 | 0 | 1.00 |
|  | sport | 0.573 | 34.67 | 0.980 | 1.258 | 0.0099 | HS-65MG | 3.5 g | 1.29 |
|  | 3d | 0.687 | 42.33 | 0.995 | 1.561 | 0.0197 | D89MW | 16 g | 2.33 |
|  | extreme | 0.800 | 50.00 | 1.021 | 1.891 | 0.0296 | D89MW | 16 g | 1.53 |

The aileron's cf (the aft 27 percent) and the throws (E-flite's high
rates, 33, 20 and 30 mm, over the drawn chords at the horns, 30, 20 and
27 deg, ESTIMATED to a couple of degrees) are docs/TIMBER-STAGE1.md's.
Its table carries only Nelson's tau for the elevator and rudder (0.65,
0.60), so their cf are measured off the drawn model,
`src/render/timbercraft.js`, which is drawn from Horizon Hobby's
photographs and whose areas are the table's. The elevator is 0.0311 of
the 0.0707 m^2 stabiliser (the hinge 90 mm behind the root's leading
edge, 60 of the root's 150 mm, 56 of the tip's 110, the rudder's notch
out), cf 0.44. The rudder is 0.0146 of the 0.0315 m^2 fin and rudder
(the hinge 65 mm ahead of the trailing edge, from the fuselage's bottom
to the fin's top), cf 0.46. Over the fin alone, above its root, it would
be 0.38. The table's Sv counts the run below the root, so cf is taken on
the same area. The plan's inverse of Glauert's tau (0.29 and 0.24) is
not used: Nelson's chart is empirical, and Glauert's tau at those cf is
not what the drawn surfaces are. Only the ratio tau(cf) / tau(cf0)
enters k, as for the Cub.

The flaps (0.052 to 0.334 m) are plain flaps on their own switch, not
mixed into the ailerons, so the aileron tier is the outboard ailerons
alone. The servos: E-flite's manual lists six 9 g metal gear digital
servos, SPMSA370 (two ailerons, elevator, rudder, two flaps). No torque
is published for the A370 (Spektrum's page and servo charts list none),
so it is taken as the A332's 0.9 kg-cm, the same maker's 9 g metal gear
class, ESTIMATED. The aileron (0.36 m by 0.065 m, Ch_delta -0.68 per rad)
holds its 30 deg to 20.8 m/s and 17.6 deg at 25; the elevator its 20 deg
to 25.8 m/s; the rudder its 27 deg to 31.3 m/s. The floats variant
(timber1500f) is a different airframe id and has no row; its table
takes the Timber's holds.

Measured on this branch, the servos blowing back (full stick deg/s / a
fifth of a stick deg/s / speed kept): roll 371 / 44 / 0.872 stock to 558
/ 66 / 0.729 Extreme; pitch 247 / 54 / 0.990 to 436 / 90 / 0.685; yaw 126
/ 19 / 1.017 to 238 / 35 / 0.773. The elevator's k falls to 0.81, as the
Cub's does: its stock 20 deg is near where K' is one, and 50 deg buys
less per degree, which the throw more than makes up for.

The Cub's k falls below one: its stock throws are under 18 deg, where K'
is near one, and K' at 40 to 50 deg is 0.55 to 0.57. Per degree a big
throw buys less, but the throw more than makes up for it.

## The gates, `scripts/surfaces-gates.js` (`npm run surfaces:gates`)

T1 refusals and read back; T2 ones and zeros are the table, bit for bit;
T3 per surface, the peak full stick rate from level flight at cruise rises
with every tier (others stock, the hangar's whole seat: block, throws,
servo mass); T4 every tier and the all Extreme corner still fly:
Stabilised recovers from a held full roll and up stick within 4 s, under
10 deg past level and within 3 deg over the last 3 s; Acro and the AS3X
rate damper with heading hold (the Extra's default) let the roll rate die
after half a stick for half a second, under 10 deg/s over the last 3 s
(measured: at most 0.4); Manual level flight holds. No controller gain
needed rescaling: the AS3X gains are surface per rad/s, so a tier's K
raises their loop gain by at most 16 percent (the Extra's aileron), well
inside their margin. T5 the plant's deflection drag is the formula's.

Measured on batch df23fdbb2 (full stick deg/s / a fifth of a stick deg/s /
top speed m/s at full throttle):

| | stock | sport | 3d | extreme |
|---|---|---|---|---|
| Extra roll | 599 / 78 / 23.82 | 641 / 86 / 23.81 | 678 / 93 / 23.81 | 710 / 101 / 23.81 |
| Extra pitch | 206 / 33 / 23.82 | 222 / 38 / 23.81 | 236 / 43 / 23.80 | 247 / 48 / 23.80 |
| Cub roll | 174 / 17 / 17.81 | 219 / 21 / 17.80 | 281 / 27 / 17.80 | 347 / 33 / 17.77 |
| Cub pitch | 100 / 11 / 17.81 | 122 / 16 / 17.84 | 147 / 26 / 17.85 | 179 / 35 / 17.87 |
| Cub yaw | 40 / 5 / 17.81 | 51 / 7 / 17.80 | 68 / 10 / 17.76 | 89 / 12 / 17.76 |

Those tables are from batch df23fdbb2; the plant has moved since, and the
numbers the game shows are `configs/surfaces-stats.js`, below.

## The stat bars, `configs/surfaces-stats.js`

The hangar's Surfaces tab (`src/ui/hangar-surfaces.js`) shows three bars,
each the flight model's own numbers, written by `npm run surfaces:gates --
--write-stats` and held by every run of the gates (T6) within 3 percent of
what the plant flies now. That is a display number, not a physics gate, and
T3 and T4 do not take the slack:

- **Agility**: the full stick rates, roll on the aileron's tier, pitch on
  the elevator's, yaw on the rudder's, each with the other two stock; the
  bar is their mean over stock's.
- **Stability**: the rate a fifth of a stick gives, how hard a small thumb
  movement moves the aircraft; the bar is stock's over the tier's, so it
  falls as the surfaces grow.
- **Speed kept in manoeuvres** (the lead's call, 2026-10-11, over "top
  speed", which a tier moves by under half a percent in level flight): from
  level flight at cruise, 2 s of full stick on one axis, the speed the
  aircraft would have back at its starting height, sqrt(v^2 + 2 g dz), over
  the speed before. Energy, so a dive or a climb is not counted. It falls
  with every tier: the deflected surface's drag and the tighter manoeuvre
  it flies.

## In a room

A pilot's tiers ride in their room profile's parts, `{ prop, addons,
surfaces }`, so the others draw their aircraft with the bigger surfaces
and the room's lineup names them ("Extreme ailerons, 3D elevator"). The
host's "Stock surfaces only" (the freestyle menu, beside the weather) is
the room's `stockSurfaces` (edge/rooms/core.js): host only, kept with the
meta, in the welcome, told to everybody; each pilot's next run then flies
stock and their profile carries no tiers. The plant runs on each pilot's
own page, so the room holds the rule and the pages keep it; a modified
page could still fly its tiers. `rooms:selftest` holds the server's side,
`surfaces:room` two real pages on a real rooms server. The room's poses
carry each surface as an int8 over 0.8 rad (src/share/roomwire.js
SURFACE_FULL_RAD), so another pilot sees a 50 deg Extreme throw stop at
46 deg, as the Extra's stock 55 deg rudder already does; widening it is a
wire format change, left for a versioned protocol bump.

## Known limits

- The stock tables have no deflection drag of their own; a tier adds only
  its increment over stock. Adding the stock term fleet wide is the aero
  lane's call. The tiers' numbers would not change, since the increment is
  already the difference.
- The hinge moment takes the free stream's dynamic pressure: the
  slipstream's over the tail (dp, up to the hover's W / A and more at full
  throttle) is not in it, so a tail surface in the wash blows back later
  than a real one. It would move the hover and harrier gates, the next
  item. The body's rates' share of each surface's angle of attack (p y /
  V on an aileron, about 12 deg at the Timber's full roll; q l_t / V and
  r l_v / V on the tail) is not in it either; it relieves a steady roll's
  down going aileron. Past the stall the surface's angle enters as its
  sine, not as the plate's saturating load.
- The linkage is ESTIMATED at +-45 deg of servo travel for the full
  throw; a 3D setup on extended endpoints (125 to 150 percent) gives its
  servo more advantage. The torque is the one published, at 4.8 V where
  that is all there is, against a 5 to 6 V BEC. NACA's data are a sealed
  gap at a Reynolds number of 3.4 million; a foam surface's unsealed gap
  and a model's Reynolds number are not in them.
- The servo slew rate stays the table's. The D645MW and D950TW are as fast
  as the D89MW or faster.
- The drag acts at the CG. The aileron pair's drag difference (proverse
  yaw) and the tail's drag height are left out.
- One K_A scales all four stall strips' tau. On the Night Timber the
  flaperon strips should take K' alone: at Extreme the flap strips get
  3.4 percent too much and the aileron strips 1.4 percent too little.
  That is second order, and fixing it needs a per-strip scale in the
  plant (the plant lane's call).
- The plant adds a flaperon's aileron throw and its flap angle without
  a servo's limit. Full flap (36 deg) plus an Extreme aileron (40 deg)
  would ask for 76 deg on one panel, and a real radio stops at the
  servo's travel. The stock aircraft already asks for 65.
- The craft builders draw the tiers only on the Extra and the Cub.
  `src/render/nighttimbercraft.js` and `timbercraft.js`, like
  slickcraft.js, ignore `opts.surfaces`, so their tiers fly but draw
  stock (the render lane). Its aileron growth must go on the outboard ailerons
  only, never the flaps.
