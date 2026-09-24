# Bramor C4EYE, stage 1: the aircraft, the model, the catapult and the chute

The fixed wing that took the flying wing's place: the owner asked for "the
current fixed wing drone model for the flying wing" to be replaced with a
Bramor C4EYE. Every number the plant is built from with its formula and
source, what was estimated and why, the catapult and the parachute and why
they are the models they are, the drawn aircraft, and the check table with
its bands and what the plant measured. It uses the one fixed wing plant,
`src/native/plant_wing.c`, with its own table, `FW_BRAMOR2300` on airframe
8, and follows `docs/WING-STAGE1.md`, `docs/SKYHUNTER-STAGE1.md`,
`docs/CUB-STAGE1.md` and `docs/GLIDER-STAGE1.md`. `scripts/bramor-derive.js` (npm run bramor:derive)
prints every derived number below from the inputs, and never loads the
plant.

## The aircraft

The C-Astral Bramor C4EYE (Ajdovščina, Slovenia): a 2.3 m blended wing body
flying wing for surveillance and reconnaissance, carrying a gyro
stabilised EO/IR camera ball in its nose. The same airframe flies as the
Bramor ppX, rTK, mSX and sAR with other payloads. It is launched off a
folding elastic catapult (a pneumatic one is an option), flown by its
autopilot, and recovered under a parachute into a 30 by 30 m field. The
body is carbon, Kevlar and Vectran; the winglets are Kevlar and held on
with magnets.

### What is published

| Quantity | Value | Source |
| --- | --- | --- |
| Span | 2.30 m | C-Astral, [Bramor C4EYE](https://www.c-astral.com/en/unmanned-systems/bramor-c4eye); the [2019 catalogue](https://www.c-astral.com/media/uploads/fm/catalogue/c-astral_katalog2019-spread.pdf) data table |
| Length | 0.96 m (centre module 0.67 m) | same |
| Take off mass | 4.5 kg | same; the ppX is 4.7 kg (and Wikipedia's C4EYE infobox quotes that), the mSX and sAR 4.9 kg |
| Cruise speed | 16 m/s | same, every Bramor |
| Maximum speed | 22 m/s | same; the ppX's never exceed speed is 30 m/s ([UST 011, p. 27](https://www.ust-media.com/ust-magazine/UST011/27/)) |
| Stall speed | 13 m/s | the Bramor user manual as indexed ([Scribd](https://www.scribd.com/document/543376975/Bramor-User-Manual)); the document itself could not be opened, so this is the search index's quotation of it and the variant is not stated |
| Maximum climb | 5 m/s | the same manual, the same caveat |
| Endurance | up to 3.5 h (3 h on LiPo, 3.5 h on Li-ion) | C-Astral page and catalogue |
| Service ceiling, wind | 5000 m ASL, 30 kt | C-Astral page |
| Launch | CAT 1 foldable elastic launching system; pneumatic catapult optional | C-Astral page, catalogue |
| Recovery | recovery parachute with a protective pack; 30 by 30 m landing zone | same |
| Payload | EYE-X HD4 (earlier HD2) gimbal, nose mounted, "automatically stowed ... for safe landing" | catalogue, sensors page |
| Motor | brushless, about 1 kW; folding two blade CFRP pusher | ppX, [UST 011, pp. 23 to 25](https://www.ust-media.com/ust-magazine/UST011/25/) |
| Planform | "blended wing body ... cranked delta plan form and high aspect ratio wings", one elevon a side | [UST 011, p. 22](https://www.ust-media.com/ust-magazine/UST011/22/) |

Not published anywhere found: wing area, height, battery, prop diameter,
the catapult's rail and release speed, the parachute's descent rate and
size, and how the aircraft hangs under the canopy. Each of those below is
an estimate and says what it rests on.

The photographs used for proportions, all looked at: C-Astral's C4EYE
render (grey, red chute harness over the top, gimbal ball in the nose
tip, tall swept winglets, the prop on a raised tail cone behind the pod),
its nose close ups, the ppX render (the same airframe in white and
orange), the Italian Army's photograph of a C4EYE on its catapult
([Wikimedia](https://commons.wikimedia.org/wiki/File:Italian_Army_-_41st_Regiment_%22Cordenons%22_operator_launching_a_Bramor_C4EYE_drone.jpg))
and the Bangladesh Army's of one held up
([Wikimedia](https://commons.wikimedia.org/wiki/File:Bangladesh_Army_Bramor_UAV._(39051236781).jpg)).

### The planform

Drawn from the photographs to the published span and length, and
integrated for the area, the chord and the neutral point, so the plant
flies the aircraft that is drawn. Half of it, y out from the centre line,
leading and trailing edge aft of the nose, metres:

| y | leading edge | trailing edge | depth | what |
| --- | --- | --- | --- | --- |
| 0 | 0.000 | 0.620 | 0.130 | the pod's nose, the gimbal ball |
| 0.06 | 0.040 | 0.620 | 0.120 | pod |
| 0.11 | 0.130 | 0.620 | 0.085 | pod into the cranked delta |
| 0.30 | 0.360 | 0.620 | 0.034 | the delta into the outer panel |
| 1.15 | 0.756 | 0.876 | 0.013 | the tip: 25 deg of leading edge sweep, 0.26 m of chord to 0.12 |

The winglets stand on the tips, 0.236 m up a 3 deg outward cant to 0.25 m
over the CG, 32 deg of sweep, the tip's chord at the root to half of it
at the top: about a fifth of the semispan, which is what the photographs
show. Nose to winglet trailing corner is 0.966 m, with the gimbal glass
0.969 m (C-Astral: 0.96).

| Quantity | Value | How |
| --- | --- | --- |
| Wing area S | 0.591 m² | the planform, the pod included |
| Mean chord c = S/b | 0.257 m | derived; the plant's reference chord, as the other aircraft |
| Aspect ratio | 8.95 | derived |
| MAC | 0.3235 m at 0.426 m out | derived |
| Aerodynamic centre | 0.4389 m aft of the nose | the area weighted quarter chord |
| Neutral point | 0.4324 m | less 2 percent of the MAC for the pod's Munk moment, ESTIMATED |
| Static margin | 0.07 | ESTIMATED: a survey flying wing's usual 5 to 10 percent |
| CG | 0.4097 m aft of the nose | derived from the two above; the model's origin |

## The aerodynamics

| Coefficient | Value | How |
| --- | --- | --- |
| CLα | 4.77 /rad | Helmbold at AR 8.95 with 21 deg of half chord sweep on the outer panel |
| CL max | 0.722 | the published 13 m/s stall at 4.5 kg on the drawn area, 2W/(ρ S V_s²). Low for a wing, and right for a reflexed blended body whose pod carries a fifth of the area |
| α stall | 8.67 deg | CL max / CLα |
| CD0 | 0.024 | ESTIMATED by equivalent skin friction: wetted area about 2.1 S at C_f 0.006 and a form factor of 1.3 is 0.016; the gimbal ball, 100 mm across at C_D 0.4, 0.005; the winglets and the joins 0.002 |
| Oswald e | 0.85 | winglets, a tapered swept panel |
| k = 1/(π e AR) | 0.0418 | derived |
| CLδe (both elevons) | −0.953 /rad | strip theory: CLα τ S_e/S, the outer panel from 0.45 to 1.10 m (0.236 m² of wing behind the hinge) at τ 0.50 for a quarter chord flap, trailing edge up sheds lift |
| Cmδe | 0.894 /rad | that lift at 45 percent of the flapped chord, 0.241 m behind the CG, over c |
| Cmα | −0.420 /rad | −CLα × static margin × MAC/c |
| Cm0 | 0.0533 | trims at 16 m/s with the elevons neutral: −Cmα α_cruise plus the thrust line's moment at cruise thrust |
| Cmq | −4.0 | ESTIMATED: the flying wing's figure (docs/WING-STAGE1.md), the same class |
| Clp | −0.522 | strip theory, −(4 CLα/S b²) ∫ c y² dy |
| Clδa | 0.308 /rad | (2 CLα τ/S b) ∫ c y dy over the elevons |
| CYβ | −0.329 | the winglets as fins, a_v 3.64 at AR 2.76 on 0.040 m², and the pod's −0.08, ESTIMATED |
| Cnβ | 0.0352 | the winglets, a_v (S_v/S)(l_v/b) with l_v 0.437 m, less the pod's Munk yaw, 0.012, ESTIMATED |
| Clβ | −0.070 | DATCOM for 25 deg of sweep at the cruise CL, −0.0025 per deg per CL, the winglets over the CG, less 0.010 for the root's anhedral seen in the front view |
| Cnr | −0.0297 | the winglets, −2 a_v (S_v/S)(l_v/b)², and the wing's −(0.02 CL² + 0.3 CD0) (Nelson, section 3.4) |
| Clr, Cnp | CL/4, −CL/8 | the standard forms the Skyhunter and the Cub use |
| Cnδa | −0.2 CL Clδa = −0.062 CL | adverse yaw of outboard elevons at AR 9 and taper 0.46 (Roskam, Airplane Design VI, fig. 10.48) |

Directional stability is weak, as a flying wing's is: the first cut of the
winglets, 0.18 m tall, gave Cnβ 0.021, and a full stick roll then built 35
deg of sideslip and fell to 25 deg/s. The photographs show taller
winglets than that, and at their size the sideslip in the same roll
peaks near 17 deg and the rate recovers to 95 deg/s.

### The throws

C-Astral publishes none. Aileron: 10 deg, a survey wing's setup: pb/2V
0.103, 82 deg/s at cruise. Elevator: 6 deg, the down that trims level
inverted flight at cruise. The rule the flying wing used, the throw that
just stalls at the throw speed, would leave this wing a degree and a
half, because it cruises at 1.23 V_s and makes 2.1 deg of angle of attack
per degree of elevon; at 6 deg full up trims at 20 deg, past the stall at
any speed, which is what the flying wing's full stick does too. Each
elevon clips at their sum, 16 deg.

### The motor

| Quantity | Value | How |
| --- | --- | --- |
| Cells, kV | 6S, 470 kV | ESTIMATED: about 1 kW (UST) needs 6S at this size |
| Prop | 12 × 8 folding | ESTIMATED from the photographs' blade length against the pod |
| No-load rpm | 10,434 | 470 × 22.2 V |
| Pitch speed | 30.0 m/s | rpm/60 × pitch × 0.85, as every other aircraft |
| Static thrust | 35.0 N | the thrust that makes the best climb from 1.1 V_s the published 5 m/s (5.01 at 14.3 m/s); T/W 0.79. Ideal disc power at it is 490 W, which with a figure of merit of 0.7 and a motor at 0.8 is about the published 1 kW |
| Torque arm | 0.0151 m | 490 W at 8,870 rpm is 0.53 N m at 35 N |
| Thrust line | 0.087 m over the CG | the drawn hub on its raised tail cone; power pitches the nose down, and Cm0 carries the cruise share |
| Full throttle current | 45 A | about 1 kW on 6S |

From these the level speed at the cruise throttle, 0.666, is the
published 16 m/s; the top speed at full throttle is 25.0 m/s, above the 22
the autopilot flies to and under the 30 m/s never exceed speed. The
endurance is a cross check and not a band, since the plant does not drain
the pack: drag at 16 m/s is 3.10 N, 50 W of air power, about 93 W
electrical at a prop efficiency of 0.65 and a motor of 0.82, so 3.5 h is
about 330 Wh, a 1.3 kg Li-ion pack at 250 Wh/kg in a 4.5 kg aircraft.
The published endurance and the drag model agree.

### Inertia

ESTIMATED: the two outer panels as 0.5 kg bars from 0.15 m to 1.15 m out,
20 g winglets (UST) at the tips, the other 3.46 kg in the pod and the
root, 0.3 m wide and 0.7 m long. Ixx 0.589, Iyy 0.189, Izz 0.778 kg m².

## The stabiliser

The same Stabilised and Acro as every fixed wing here, on the three wing
tune rows, which moved with the aircraft (below). The Bramor's limits are
a survey autopilot's: Stabilised banks to 45 deg and pitches to 20; Acro
asks for up to 90 deg/s of roll, what the elevons hold at cruise once the
sideslip has built, and 40 deg/s of pitch, a little over what the wing
can pull at 20 m/s before it stalls (at cruise it can pull 1.5 g, 18
deg/s). The gains are the flying wing's scaled for the throws, tuned
against scripts/bramor-stab-selftest.js. A launch now clears Acro's
target, so off the rail it holds the rail's angle rather than diving for
the level it sat at on the ground; every recorded launch comes straight
after a reset, where the target was already clear, so no trace moved.

## The catapult

The C4EYE ships with an elastic catapult. The Italian Army's photograph
shows a rail about 3 m long from the ground to a bipod at about 20 deg,
its top about a metre up, the aircraft sitting on it at the top. None of
it is published, so all of it is ESTIMATED from that picture:

- the rail 3.1 m, 20 deg, its foot on the ground; the aircraft's CG 1.17
  m over the ground on the cradle at the top;
- release at 17 m/s, 1.3 V_s, the margin a catapult is set for, over a
  2.6 m stroke: 5.7 g on average.

The model is the release, not the stroke: `sim_wing_launch` puts the
aircraft at the top of the rail at the rail's angle and lets it go at 17
m/s along its nose, which is what the aircraft is doing as it leaves the
shuttle. The shell draws the launcher (`src/render/bramorcraft.js`) under
the parked aircraft, sits the aircraft on its cradle, and leaves it
standing where it was when the aircraft goes. L or throttle launches it;
from anywhere else, after a chute landing, the same release happens where
it lies.

## The parachute

C-Astral says only "recovery parachute with a protective pack" and a 30
by 30 m landing zone. The model:

- **The canopy.** A drag area, `chute_cda`, that opens over `chute_open_s`
  on a smoothstep from the pull, acting against the air the risers'
  attachment point moves through: the body's velocity plus ω × r there,
  quadratic in that speed, applied at that point. Its offset from the CG
  is a pendulum, so the canopy swings the aircraft under it, and the
  point's own motion damps the swing. No second body, no rope: the risers
  are taken as always taut along the relative wind, which in a steady
  descent is straight up.
- **The descent rate.** Not published. 5.0 m/s, ESTIMATED as the middle of
  the 4.6 to 6.1 m/s (15 to 20 ft/s) a recovery chute for a small UAS is
  sized for (Fruity Chutes' sizing guidance). The total drag area for 5.0
  m/s at 4.5 kg is 2W/(ρ v²) = 2.883 m²; the airframe hanging flat carries
  S (CD0 + 2) = 1.196 m² of it through the plant's own post stall plate,
  so the canopy is 1.687 m², a 1.64 m round canopy at C_D 0.8. Opening
  over 1.2 s, ESTIMATED.
- **The attitude.** The brief said it lands on its back under the chute,
  and that is what this models: the risers meet the belly, 60 mm under the
  CG, so it hangs inverted, and 64 mm ahead of it, where the canopy's pull
  balances the plant's pitching moment at −90 deg (the linear Cm, 0.713)
  so it hangs level. Both scale with the descent speed squared, so the
  balance holds at any speed. **No source was found that says the Bramor
  lands inverted**, and C-Astral's render routes the red harness over the
  top of the pod, which would hang it right way up. It is one number, the
  sign of `chute_attach[2]`, if the owner knows otherwise.
- **The switch.** Pulled (P), the motor is cut and the surfaces centre,
  as the aircraft's autopilot does; it cannot be flown under the canopy.
  It stays out until a reset, a relaunch or an airframe change stows it.
  On the ground the aircraft rests on its back on the winglets' tops,
  0.25 m over the ground, the contact box's roof, and the shell does not
  offer the quad's turtle recovery for it: L launches it again or R puts
  it back on the rail.

## Conventions

The other fixed wings', unchanged: world Z up; body X forward, Y left, Z
up; SI; 1000 Hz; the state block's twenty doubles with the motor in slot
0. The chute's force and moment are computed in the body frame and added
to the plant's own before the rates and the velocity are integrated.

## The drawn aircraft and the hull

`src/render/bramorcraft.js` draws the planform above to the millimetre
(scripts/craft-preview.js bramor: half span 1.1500 m, nose −0.4117, tail
0.5570, up 0.2500, down 0.0654, against BRAMOR_DIMS to 2 mm), in a cool
light grey with the chute harness in red and no markings. Its prop folds
back along the tail cone when the plant stops the motor, through the
same setProp the Radian's model answers to (src/render/glidercraft.js);
on this aircraft only the chute stops it, since a fixed prop idles at
two percent. The plant's
hull is the contact code's centred box: the half span, 0.45 m fore and
aft, the belly 65 mm under the CG, and the winglets' tops 0.25 m over it,
which is what it lies on when it comes down on its back; the folded
prop does not stand proud of that. The camera is the gimbal ball's glass, 0.39 m ahead of the
CG, and the shell's FPV view looks out of it. check:craft measures the
drawn machine against the collider: span, up and down agree to the
millimetre; the swept winglet corners reach 126 mm past the half span
disc, pinned, for the reason the flying wing's were.

## Derived performance and the bands

The band is the derived figure with room for the estimated inputs, and
never wider; the relative width of each is borrowed from an earlier
aircraft's where it says so.

| Check | Derived | Band | Measured |
| --- | --- | --- | --- |
| B1 level at the cruise throttle, 0.666 | 16.0 m/s | 14.5 to 17.5 | 15.85 |
| B2 stall, power off | 13.0 m/s | 12.2 to 14.7 (the flying wing's −6 and +13 percent) | 14.09 |
| B3 glide ratio at 16 m/s | 14.2 | 12.5 to 16.0 | 14.14 |
| B4 top speed, level | 25.0 m/s | 22 to 28 | 24.18 |
| B5 roll, full elevon, pb/2V | 0.103 | 0.073 to 0.139 (the Cub's relative band) | 0.094, 91 deg/s at 19.5 m/s |
| B6 turn radius at 45 deg | V²/(g tan φ) | within 15 percent | 2 percent |
| B7 best climb, full throttle | 5.0 m/s | 4.0 to 6.0 | 4.62 at 17.7 m/s |
| B8 off the catapult, full throttle | at least 4.8 m/s of climb | never under 1.1 V_s or the rail, 20 m up after 10 s | 17.0 m/s slowest, 35.3 m |
| B9 throttle chop from cruise | a glide | pitch within 30 deg for 3 s | 10.8 deg |
| B10 under the chute: descent | 5.0 m/s | 4.0 to 6.0 | 5.00, opening load 2.0 g |
| B11 under the chute: on its back | level, inverted | within 15 deg | 3.7 deg at worst |
| B12 at rest | on its back on the winglets | within 15 deg, 0.25 m, stopped, motor stopped | 0.4 deg, 0.254 m |
| B13 the others unmoved | five hashes: the five inch, the wing, the Skyhunter, the Cub, the Radian | identical | identical |
| B14 Node and Chrome | two recordings | identical | identical |

## What the first flights corrected

- **The winglets.** At 0.18 m, a full stick roll built 35 deg of sideslip
  and stalled the roll at 25 deg/s. The photographs show them taller;
  drawn at their size the plant rolls at 90 deg/s.
- **The elevator throw.** The flying wing's rule gave 3 deg and then 1.4:
  no pitch at speed and no inverted flight at all. 6 deg, the inverted
  trim at cruise, is the rule here.
- **Acro off the rail.** The catapult put the aircraft on the rail at 20
  deg nose up with Acro's target still the level it had last held, and
  Acro dived it at the ground. A launch now clears the target.
- **The turtle.** A Bramor on its back under its chute was offered the
  quad's turtle flip. It is not, now.

## The script that made the numbers

`scripts/bramor-derive.js`, npm run bramor:derive. The gates are
`scripts/bramor-gates.js` (npm run bramor:gates) against
`tests/bramor-thresholds.json`; the stabiliser, the elevons and the chute
switch are `scripts/bramor-stab-selftest.js` (npm run bramor:stab); the
recordings the cross host check replays are made by npm run
bramor:record.
