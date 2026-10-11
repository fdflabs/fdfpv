# Control surface tiers, stage 1: the physics

The hangar's bigger control surfaces (owner, 2026-10-11): per surface,
aileron, elevator and rudder, a tier from Stock through Sport and 3D to
Extreme. Each tier draws the surface bigger, lets it travel further, and
flies as a real aircraft with those surfaces does. This file is every
number behind them, with its formula and source. Slice 1 is the plant and
the data for the Extra 300 3D and the Cub; the hangar's tab, the account
sync and the room lineup follow (`~/Desktop/fdfpv-loop/CONTROL-SURFACES-PLAN.md`).

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

**Servo and mass.** The hinge moment, C_h q S_f c_f delta, at the same
airspeed and C_h: on the same span S_f and c_f both go with cf, so it grows
as (cf / cf0)^2 (throw / throw0). The stock servo is taken as just covering
the stock surface. That is ESTIMATED, and an absolute check bears it out
for the Extra's aileron: C_h about -0.55 per rad at cf 0.29, 25 m/s, 0.046
m^2 and 0.083 m at 36.5 deg give 5.2 kg-cm against the D89MW's 6.4. The
lightest catalogue servo covering the tier's moment is fitted (Hitec, at
6.0 V: HS-55 8.0 g 1.30 kg-cm, HS-65MG 12.47 g 2.2, D89MW 25.0 g 6.4,
D645MW 60.0 g 11.3, D950TW 68 g 29.0; sources in `configs/surfaces.js`),
and the difference in mass goes on as add-ons at the servos' places,
through `configs/hangar-parts.js addonParams`, the aileron pair's spread
through `sim_set_addon_inertia`. The surface itself adds no area, so no
structure mass.

**Not offered.** A surface whose Extreme adds under 10 percent of control
power over stock is left stock: the Extra's rudder (cf 0.76 at 55 deg is
already the reference's class), whose Extreme would add 1.4 percent and a
35 g servo.

### Extra 300 3D (sim 29)

| surface | tier | cf | throw deg | k | power | cd | servo | added |
|---|---|---|---|---|---|---|---|---|
| aileron | stock | 0.290 | 36.53 | 1.000 | 1.000 | 0 | D89MW | 0 |
| | sport | 0.337 | 37.69 | 1.059 | 1.093 | 0.0402 | D645MW | 70 g |
| | 3d | 0.383 | 38.84 | 1.112 | 1.182 | 0.0804 | D950TW | 86 g |
| | extreme | 0.430 | 40.00 | 1.159 | 1.269 | 0.1206 | D950TW | 86 g |
| elevator | stock | 0.450 | 39.67 | 1.000 | 1.000 | 0 | D89MW | 0 |
| | sport | 0.523 | 43.11 | 1.045 | 1.135 | 0.0174 | D645MW | 35 g |
| | 3d | 0.597 | 46.56 | 1.085 | 1.273 | 0.0349 | D950TW | 43 g |
| | extreme | 0.670 | 50.00 | 1.123 | 1.415 | 0.0523 | D950TW | 43 g |
| rudder | | | | | | | | not offered |

### Cub (sim 4)

| surface | tier | cf | throw deg | k | power | cd | servo | added |
|---|---|---|---|---|---|---|---|---|
| aileron | stock | 0.250 | 18.00 | 1.000 | 1.000 | 0 | HS-55 | 0 |
| | sport | 0.310 | 25.33 | 0.871 | 1.226 | 0.0326 | D89MW | 34 g |
| | 3d | 0.370 | 32.67 | 0.833 | 1.511 | 0.0651 | D89MW | 34 g |
| | extreme | 0.430 | 40.00 | 0.839 | 1.864 | 0.0977 | D645MW | 104 g |
| elevator | stock | 0.400 | 15.00 | 1.000 | 1.000 | 0 | HS-55 | 0 |
| | sport | 0.490 | 26.67 | 0.731 | 1.300 | 0.0151 | D89MW | 17 g |
| | 3d | 0.580 | 38.33 | 0.679 | 1.734 | 0.0302 | D645MW | 52 g |
| | extreme | 0.670 | 50.00 | 0.686 | 2.286 | 0.0453 | D950TW | 60 g |
| rudder | stock | 0.500 | 15.00 | 1.000 | 1.000 | 0 | HS-55 | 0 |
| | sport | 0.600 | 26.67 | 0.721 | 1.282 | 0.0071 | D89MW | 17 g |
| | 3d | 0.700 | 38.33 | 0.661 | 1.690 | 0.0143 | D645MW | 52 g |
| | extreme | 0.800 | 50.00 | 0.661 | 2.203 | 0.0214 | D645MW | 52 g |

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

What the stat bars can show from these, honestly: agility is the full
stick rates, up 19 to 124 percent at Extreme; stability, read as how hard
a fifth of a stick moves the aircraft, falls as those rates rise; top speed
in level flight barely moves (under 0.5 percent, and the Cub's bigger
elevator trims with less deflection, so it gains 0.3 percent). A deflected
surface's drag only acts while the surface is deflected. The speed a tier
costs is lost in manoeuvres, not on a straight line.

## Known limits

- The stock tables have no deflection drag of their own; a tier adds only
  its increment over stock. Adding the stock term fleet wide is the aero
  lane's call. The tiers' numbers would not change, since the increment is
  already the difference.
- Hinge moment sizing assumes the stock servo just covers the stock
  surface, which sizes up early (the Extra's Sport ailerons already take a
  D645MW).
- The servo slew rate stays the table's. The D645MW and D950TW are as fast
  as the D89MW or faster.
- The drag acts at the CG. The aileron pair's drag difference (proverse
  yaw) and the tail's drag height are left out.
