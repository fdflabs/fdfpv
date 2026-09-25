# Floats, stage 1: water, waves, and the Timber and the Cub on floats

The first aircraft that sit on water: the water itself, as the plant
holds it; the waves on it; the float hulls, what they are, what the
water does to them and why this is the model; the two aircraft on them;
and the check table with its bands. It follows `docs/TIMBER-STAGE1.md`
and `docs/CUB-STAGE1.md`, whose aircraft these are with their wheels
taken off: where this file says "the Timber" or "the Cub" it means those
aircraft and those documents, and every aerodynamic number not named
here is theirs. `scripts/floats-derive.js` (`npm run floats:derive`)
prints every derived figure; `scripts/floats-gates.js` (`npm run
floats:gates`) holds the plant to the bands.

## The aircraft and their floats

**The Turbo Timber on floats** (airframe 9, `timber1500f`). E-flite's
Turbo Timber Evolution 1.5 m ships with its float set in the box
(EFL105250, "includes floats"; the float set is EFL5261, "Float Set:
Timber", which also fits the original Timber and the Air Tractor). The
manual (EFL105250, pp. 16 and 17) has the assembly and the flying: two
floats joined by two cross members (spreader bars) and four struts, a
water rudder on each float's stern linked by pull pull wires to the air
rudder's horn, and the procedure:

- Taxiing: "use low throttle settings and the rudders to steer. Hold up
  elevator to help keep the rudders in the water and the nose of the
  floats above the surface." "Do not apply down elevator when the
  airplane is taxiing or during the takeoff run."
- On step: "When speed increases with throttle, the floats will rise out
  of the water and begin to plane on the surface of the water, riding
  'on step.' The floats will come on step at a speed below flight speed."
- Take off: "set the flaps to the takeoff position, hold up elevator and
  accelerate the aircraft to bring it on step. Relax the up elevator as
  the airplane comes on step and accelerate to flight speed with full
  throttle. When the aircraft is travelling at a sufficient speed, pull
  back slightly on the elevator to rotate for liftoff."
- Landing: "set the flaps to the landing position ... keep some power
  during the approach. As the aircraft settles into ground effect, reduce
  the throttle fully and hold up elevator to flare. Hold up elevator
  through the touch down and as the airplane decelerates on the water."

**The Cub on floats** (airframe 10, `cub1400f`). FMS sells the 1400 mm
J-3 with floats (FMM106P, "1400mm J-3 V4 ... Optional float"; the float
set alone was FMMFLT004). The manual (p. 8) shows two floats on four
struts to the fuselage's belly with cross wires, a water rudder on each
stern.

**Neither maker publishes the floats' dimensions or mass.** Every float
number below is ESTIMATED: from the manuals' drawings, the aircraft's own
dimensions, the full size J-3's EDO 1320 floats scaled 1:7.67 for the Cub,
and the float design rules of thumb (Langley and NACA practice as Diehl,
Engineering Aerodynamics, and the EDO manuals put them: the float about
three quarters of the fuselage, each float's volume several times the
share of the weight it carries, the step 10 to 15 deg behind a vertical
through the CG, the afterbody rising 7 to 9 deg). Where a real float set
is measured one day, these are the numbers to replace, and nothing else
changes.

| Quantity | Timber | Cub | How |
| --- | --- | --- | --- |
| Float length | 0.80 m | 0.70 m | the manual drawings: 0.77 of the fuselage; the Cub's EDO 1320 at 1:7.67 |
| Beam, depth | 0.085, 0.080 m | 0.075, 0.070 m | a length to beam of 9.4, a model float's |
| Deadrise | 15 deg | 15 deg | a moulded foam float's shallow V |
| Track (centre to centre) | 0.36 m | 0.30 m | a quarter of the span, the spreader bars' |
| Step, behind the CG | 50 mm, 11.2 deg off its vertical | 40 mm, 10.4 deg | the 10 to 15 deg rule |
| Step height | 10 mm | 9 mm | 12 percent of the beam, model practice |
| Afterbody | rising 8 deg | 8 deg | EDO practice |
| Bow | the keel rising 64 mm over the forebody's front 0.21 m | 56 mm over 0.18 m | the drawings |
| Forebody keel under the wheeled aircraft's CG | 0.285 m | 0.245 m | the prop's tip 0.12 m (Timber) and 87 mm (Cub) over still water at rest |
| Float set mass | 0.28 kg (floats 0.24, struts 0.04) | 0.20 kg (0.17, 0.03) | 3.4 and 2.3 litres of moulded foam at about 35 g per litre, the struts music wire |
| Water rudder | 35 by 50 mm, 50 mm under the stern | 30 by 45 mm | the drawings; turned one to one with the air rudder |

### What the floats change on the aircraft

| Quantity | Timber | Cub | How |
| --- | --- | --- | --- |
| Mass | 1.98 kg | 1.52 kg | the wheeled aircraft's and the float set's; the wheels' own few grams are left in, the set's figure being an estimate to far more than that |
| CG | 32.7 mm lower | 26.1 mm lower | the float set hung 0.23 and 0.21 m under the old CG; fore and aft it is put back where the manuals have it with nose weight, as a pilot does (Model Aviation's review of the Timber: "the floats shifted the CG to the rear enough to be noticeable") |
| Thrust line | 32.7 mm over the CG | 28.1 mm | the CG moved down under it: power pitches the nose down, which is what a float plane does |
| Ixx, Iyy, Izz | 0.1115, 0.1210, 0.1912 kg m² | 0.0711, 0.0689, 0.1111 | the wheeled aircraft's, the floats as two bars and the struts as points, all about the new CG |
| CD0 | 0.0609 (+0.0189) | 0.0706 (+0.0206) | the floats' wetted area, 0.42 and 0.32 m², at the equivalent skin friction 0.009 (Raymer eq. 12.23); the struts and spreaders on their frontal area, 0.0053 and 0.0040 m², at a wire's C_D 1.0; less the wheels and legs they replace |
| CYβ | −0.460 (−0.091) | −0.380 (−0.090) | the floats' side, 0.80 of their outline, at the fuselage's −0.32 per unit of side area over wing area |
| Cnβ | 0.0712 (−0.0158) | 0.0329 (−0.0151) | Nelson eq. 2.72 on the floats' volume, 6.8 and 4.6 litres: a float, like a fuselage, is a body the sideslip turns further |
| Clβ | −0.0346 (+0.0124) | −0.0772 (+0.0118) | the floats' side force acting at their mid depth, 0.21 and 0.18 m under the CG, takes some of the dihedral effect |
| Cm0 | unchanged | unchanged | the floats' drag under the CG is a constant moment coefficient, which the rigging's trim takes out, as it did the wheels' |

Measured in the plant (not gated): level at 75 percent, 16.41 m/s against
the wheeled Timber's 17.63, 12.66 against the Cub's 13.28; top speed
22.2 against 24.0 and 16.9 against 18.1. Floats cost a model about a
tenth of its speed, which is the full size figure too.

## The water

The water lives in the plant (`src/native/water.c`), not in the shell,
because the floats feel it every millisecond and the renderer that later
draws it moving must draw the surface the floats feel. A host declares
**water bodies** in the plant's world frame, as it does the ground plane:
still water at a height over a polygon, or everywhere with no polygon, up
to four bodies of 256 corners. Each has **waves**, off by default. The
declaration survives `sim_reset`, since a lake does not move when the
aircraft is put back, and `sim_water_clear` removes it.

```
sim_water_clear()
sim_water_add(z0, ox, oy)            -> body index; phases measured from (ox, oy)
sim_water_vertex(body, x, y)         the outline, world x y, in order
sim_water_wind(body, U, dx, dy, F)   the wind, m/s blowing toward (dx, dy), over F m of fetch
sim_water_swell(body, H, T, dx, dy)  a swell, crest to trough m, period s, travelling (dx, dy)
sim_water_sample(x, y, t, out[7])    body or -1, surface z, dz/dx, dz/dy, water velocity x y z
sim_water_components(body, out[41])  n, z0, ox, oy, Hs, Tp, then a kx ky omega phase per component
sim_float_state(out[10])             what the floats did on the last step
```

### The waves

Linear deep water waves, Airy's, each a cosine travelling one way:

```
theta_i = kx_i (x - ox) + ky_i (y - oy) - omega_i t + phase_i
z       = z0 + sum a_i cos theta_i
dz/dx   = -sum a_i kx_i sin theta_i,   dz/dy likewise with ky_i
u, v    = sum a_i omega_i cos theta_i (kx_i, ky_i) / k_i      the orbital velocity at the surface
w       = sum a_i omega_i sin theta_i                           which is dz/dt
omega_i^2 = g k_i                                               deep water
```

with t the sim's own clock. **The wind sea** comes from the wind speed U
and the fetch F by the Shore Protection Manual's fetch limited growth
laws (SPM 1984, eqs. 3-33 and 3-34, the JONSWAP fits):
g Hs / U² = 1.6e-3 (g F / U²)^(1/2) and g Tp / U = 0.2857 (g F / U²)^(1/3),
capped at the fully developed sea, 0.2433 and 8.134. It is spread over
six components: four swells round the peak and two short chop waves,
periods 1.00, 0.85, 0.72, 0.60, 0.45 and 0.33 of Tp, directions 0, +20,
−25, +40, −55 and +70 deg off the wind, and 0.34, 0.24, 0.17, 0.11, 0.08
and 0.06 of the sea's energy (a coarse JONSWAP spectrum and a cos²
spread), each amplitude sqrt(2 e) Hs / 4 so the variance is Hs²/16, at
fixed phases with no common factor. **The swell** is one more component,
a height, a period and a direction, for water that is not raised by its
own wind; a lake has none, and the gates use one because a single period
is what a rocking can be measured against. Each component is held under
a k = 0.1, a fifth of the steepness at which a deep water wave breaks,
which trims the shortest chop in a stiff wind: `npm run waves:selftest`
measures 4 sd of the surface at 0.955 of the SPM's Hs for 5 m/s over
900 m.

The phases need sine and cosine at any angle, so the fixed libm gained
`sim_sin` and `sim_cos` (Cody and Waite's reduction by pi/2 held as a
33 bit head and a tail, then Taylor to x^17 and x^18 on the remainder):
exact IEEE operations only, so they are the same double on every host,
and correct to 1.1e-16 against the host's.

**Zero by default**, and nothing reads the water until a body is
declared, so every trace recorded before it existed is bit identical
(F9 below and every other airframe's gates).

### The renderer's port

`src/game/waves.js` is the same arithmetic in JS, operation for
operation, reached only through `mirrorWaves('tests')` and never in the
physics path; `waves:selftest` holds it to the module's to the bit. For
the GLSL port, which is the rendering follow-up:

- Read the components once per declaration with `sim_water_components`
  and upload them as uniforms: per component a, kx, ky, omega, phase, and
  the body's z0 and origin. Seven components at most.
- They are in the plant's frame. The map's frame is the plant's turned by
  the spawn yaw and moved to the spawn (`poseFromState` in src/main.js):
  either turn each (kx, ky) and the origin into the map's frame once, or
  the vertex into the plant's per vertex. Plant z is Three.js y.
- Per vertex: theta = dot(k, p - o) − omega t + phase; displace by
  sum a cos theta; the normal from (−dz/dx, −dz/dy, 1) with dz/dx =
  −sum a kx sin theta. Sum in the vertex shader, or the fragment shader
  for the normal on a coarse mesh.
- t is the sim clock, `state[0]`, which restarts at every reset, so the
  water the pilot sees is the water the floats feel. Not the wall clock.
- GLSL's sin and cos are not bit exact, which does not matter for a
  picture.

## The floats in the water

Each float is cut into 20 strips from bow to stern (`float_apply` in
`src/native/sim.c`), and each strip's keel point is held against the
surface under it. A strip whose keel is under the surface gets, at that
point:

- **Buoyancy**, rho g A dx, straight up, A the immersed section: a V of
  the deadrise to the chines and straight sides above, filled to the
  immersion along the body's up axis, no higher than the deck.
- **The planing force**, along the body's up axis: the momentum the strip
  gives the water it pushes down. A slice of water the hull passes over
  carries the added mass of the section wetted there, m_a = (pi/2) rho c²
  per metre, c the half width the water wets once it has splashed up
  round the V, c = (pi/2) d / tan(deadrise) (Wagner), the half beam once
  the chines are wet. As the hull passes, the slice is pushed down at
  V_n = u (d_i − d_{i−1}) / dx + ḋ: the growth of the immersion from the
  strip ahead at the forward speed, which is the trim and the keel's own
  rocker, and the strip's own sinking. The force is V_n times the growth
  of the added mass, u Δm_a, plus Wagner's slam term as a dry V drops in,
  (d m_a / d d) ḋ dx: this is Zarnick's strip theory in its steady form
  (Zarnick 1978, DTNSRDC 78/032, after von Karman and Wagner), and it
  gives Savitsky's lift, linear in the trim, without being fitted to it.
  **Water is pushed, never pulled**: where the immersion falls going aft,
  and above all at the step, the water has left the hull, and nothing
  acts until a strip goes deeper than the deepest before it on that
  float. That is what makes a step a step: the afterbody runs dry on a
  planing hull.
- **Crossflow drag**, ½ rho C (2c) V_n², C = 1.0 (Zarnick's), while the
  bottom presses into the water, the second, quadratic term of planing
  lift.
- **Radiation damping** of the waves a heaving float makes, k rho B
  sqrt(g B) ḣ dx on the strip's vertical rate through the surface,
  k = 0.3: Vugts' two dimensional heave damping for a shallow section at
  the high frequencies a model float heaves at, read to about a third.
  ESTIMATED.
- **Sideways crossflow drag** on the immersed depth, ½ rho C d v|v| dx,
  C = 1.0: what keeps a float from sliding sideways, and what the water
  rudders turn against.
- **Skin friction** along the keel on the wetted girth, C_f = 0.0045: the
  ITTC 1957 line at the Reynolds numbers of a model float on the step,
  1e6 to 3e6, 0.0036 to 0.0045, taken at the top for spray and a
  roughened foam skin.

Each float then gets:

- **Wave making drag**, the hump. At low speed a float is a displacement
  hull and pushes a wave system whose drag climbs steeply toward the hull
  speed; the planing force then lifts it out and the buoyancy, and the
  wave drag with it, fall away. Held as the buoyancy the float carries
  times 0.25 Fr⁴ / (Fr⁴ + 0.45⁴), Fr the length Froude number of its
  wetted length: an empirical closure, not a theory, sized so the hump
  falls in the literature's range, 0.12 to 0.25 of the weight at a
  volumetric Froude number of 1.5 to 2.5 (Savitsky 1964; Hoerner, Fluid
  Dynamic Drag, ch. 11). Measured on the Timber's take off: the water's
  drag 3.8 N at 2.66 m/s, 0.20 of the weight, 2.4 N of it wave making.
- **A water rudder** at the stern: a low aspect ratio foil, a lift slope
  of 2.7 per rad and a CL of 0.9 at most, at the air rudder's angle plus
  the flow's own at the stern, working in proportion to how much of its
  span is in the water. Held up elevator presses the sterns down and puts
  more of them in, as the manual says.

Every force is an impulse at its point through the body's effective mass,
the wheels' path (`contact_push`), after the air's step. While the floats
are wet the stabiliser is in Manual, as on wheels.

**On land** the keels' knee, step and stern are skids against the ground
plane, 3000 N/m and 40 N s/m each, and they slide at mu 0.35 every way: a
float's plastic on grass. That is the decision: **floats slide, they do
not roll or taxi**. Under the throttle that carries 0.35 of the weight, 52
percent on the Timber and 62 on the Cub, it does not move; over it, it
slides and, at full power, drags itself off, which real float planes do
off wet grass. The water rudders do nothing on land and the air rudder
has no slipstream to work in, so there is no steering there.

### What it does not model, and why

- **Added mass in heave and pitch.** A float's heave added mass is about
  twice the aircraft's own mass, so the plant's natural periods (0.28 s
  heave, 0.36 s pitch) are about half what they would be. Everything the
  plant is asked to do, a swell of seconds, a take off, a landing, is far
  slower than either, so it rides as the real one does; a fast chop at a
  second would ride a little stiffly. Adding it needs an implicit step.
- **The slipstream.** As on the wheels, the prop's wash over the tail is
  not modelled, and on the water it matters: it is what lets a real pilot
  hold the nose up at walking pace. The derivation below holds the
  elevator to its own authority, as the plant does, so the bands are the
  aircraft the plant flies.
- **Spray, the bow wave's shape, the wake.** The hump closure stands for
  all of them.
- **Wind.** The waves carry a wind but the air does not: an aircraft on
  the water weathercocks only on its own motion, and a crosswind taxi is
  not a thing yet.
- **Suction under a nose down forebody.** Water is only pushed; see the
  failure modes.
- **Anything but the floats in the water.** The fuselage, the wing and the
  prop pass through the water untouched; see the failure modes.

## The derivation

`scripts/floats-derive.js`, from the numbers above, never loading the
plant, and not using its strip theory for the planing: the planing is
Savitsky's empirical method (Savitsky 1964, "Hydrodynamic Design of
Planing Hulls", Marine Technology 1(1)), fitted to towing tank data, which
is what makes it a check on the plant rather than a copy of it. Printed:

```
=== Turbo Timber on floats
mass 1.980 kg, W 19.42 N; CG -32.7 mm lower; Ixx 0.1115 Iyy 0.1210 Izz 0.1912
floats' volume 6.80 l, reserve 3.44 x the weight; wetted area 0.419 m2
dCD0 0.0189 -> CD0 0.0609; CYb -0.460; Cnb 0.0712; Clb -0.0346; thrust line 32.7 mm over the CG
at rest on still water: trim 3.42 deg nose up, the CG 0.2131 m over the water, the keel at the step 41.7 mm under it; the prop's tip 124 mm over it
the step 11.2 deg behind the CG's vertical
waterplane 0.1037 m2; natural periods: heave 0.277 s, pitch 0.362 s, roll 0.366 s (no added mass, so short)
swell 0.3 m at 2.5 s: wavelength 9.76 m, slope 5.53 deg; quasi static heave 0.302 m, pitch +-5.63 deg, both at 2.5 s
hull speed 1.00 m/s; the hump between 1.48 and 2.47 m/s
stall on floats at the take off notch 7.20 m/s; the attitude full up elevator holds at liftoff 6.99 deg; liftoff 8.30 m/s, 1.15 of the stall
on the step at 2.83 m/s (Cv 3.10): trim 10.1 deg, wetted 0.230 m, water drag 0.196 of the weight
take off run to 8.30 m/s: 3.99 m in 0.89 s with a hump of 0.12 W, 4.03 m in 0.91 s at 0.25 W
landing from 7.83 m/s (stall 6.81 full flaps) to 1 m/s: 16.8 m with a hump of 0.25 W, 18.6 m at 0.12 W
water rudder taxi turn at 0.9 m/s, full rudder: radius 2.31 m
on grass at mu 0.35 it breaks away at 52 percent throttle

=== Piper Cub on floats
mass 1.520 kg, W 14.91 N; CG -26.1 mm lower; Ixx 0.0711 Iyy 0.0689 Izz 0.1111
floats' volume 4.56 l, reserve 3.00 x the weight; wetted area 0.321 m2
dCD0 0.0206 -> CD0 0.0706; CYb -0.380; Cnb 0.0329; Clb -0.0772; thrust line 28.1 mm over the CG
at rest on still water: trim 3.32 deg nose up, the CG 0.1819 m over the water, the keel at the step 39.0 mm under it; the prop's tip 87 mm over it
the step 10.4 deg behind the CG's vertical
swell 0.3 m at 2.5 s: quasi static heave 0.302 m, pitch +-5.62 deg
hull speed 0.94 m/s; the hump between 1.42 and 2.37 m/s
stall on floats 8.70 m/s; the attitude full up elevator holds at liftoff 4.65 deg; liftoff 10.51 m/s, 1.21 of the stall
on the step at 2.60 m/s (Cv 3.03): trim 12.0 deg, wetted 0.199 m, water drag 0.227 of the weight
take off run to 10.51 m/s: 12.51 m in 2.10 s at a hump of 0.12 W, 12.58 m at 0.25 W
landing from 10.00 m/s to 1 m/s: 24.7 m with a hump of 0.25 W, 26.2 m at 0.12 W
water rudder taxi turn at 0.9 m/s, full rudder: radius 4.62 m
on grass at mu 0.35 it breaks away at 62 percent throttle
```

In outline:

- **At rest**: the heave and the trim at which the buoyancy, integrated on
  4000 strips a float, carries the weight with its centre under the CG,
  by nested bisection. Both float nose up by a little over 3 deg, the
  afterbody's volume sitting lower, which is how a float plane sits.
  Reserve buoyancy 3.4 and 3.0 times the weight, where full size practice
  wants 1.8 at least.
- **In a swell**: every natural period is far under the swell's 2.5 s, so
  the aircraft follows the water quasi statically: it heaves the swell's
  height times sin(x)/x of its waterline and pitches the slope times
  3 (sin x − x cos x)/x³, x = k L/2, by the dynamic magnification of its
  own natural period, which here is 1.02. A beam swell rolls it at the
  slope the same way.
- **The step**: Savitsky's lift C_Lβ = C_L0 − 0.0065 β C_L0^0.6, C_L0 =
  τ^1.1 (0.012 λ^0.5 + 0.0055 λ^2.5 / Cv²), gives the wetted length λb
  that carries the water's share at a speed and a trim; its centre of
  pressure 0.75 − 1/(5.21 Cv²/λ² + 2.39) of it ahead of the step; its
  drag the lift's tan τ plus ITTC friction. The trim is the one where the
  water's moment, the air's with full up elevator and the thrust's
  balance about the CG. On the step when the wetted length is within the
  forebody's flat.
- **Liftoff**: once the water lets go its force is zero, so the attitude
  full up elevator holds is where the air's and the thrust's moments
  balance, capped a blend short of the stall and at the sternpost; the
  aircraft leaves when that attitude's lift is its weight. On half flaps,
  the manual's take off notch, with the radio's flap mix taken off the
  elevator.
- **The run**: integrated on speed, dx = m V dV / (T − D_water − D_air),
  the hump at 0.12 to 0.25 of the weight below the step speed and
  Savitsky's drag above it, the air's drag with its induced part at the
  attitude.
- **The landing**: the same, decelerating from 1.15 of the landing stall
  (full flaps on the Timber) with the throttle closed and the stick back,
  to 1 m/s.
- **The taxi turn**: a steady turn at 0.9 m/s with full rudder, where the
  water rudders' side force, the floats' sideways crossflow drag on each
  strip at its own lateral speed, and the turn's own acceleration balance
  in force and moment.

## The bands

`tests/floats-thresholds.json`, for each aircraft:

| Check | Derived (Timber, Cub) | Band |
| --- | --- | --- |
| F1 floating at rest | trim 3.42, 3.32 deg; CG 0.2131, 0.1819 m over the water; the step 41.7, 39.0 mm deep | trim within 0.5 deg, CG within 3 mm, draft within 10 percent (the plant integrates 20 strips against the derivation's 4000) |
| F2 a 0.3 m, 2.5 s swell from ahead | heave 0.302 m; pitch ±5.63, ±5.62 deg; at 2.5 s | heave within 10 percent; pitch 0.8 to 1.3 of it; both periods within 2 percent; roll under 2 deg |
| F3 the swell from the side | roll ±5.53 deg at 2.5 s | 0.7 to 1.4 of it, period within 2 percent |
| F4 the take off | on the step above the hump's start, 1.48 and 1.42 m/s; liftoff 8.30 and 10.51 m/s after 4.0 and 12.5 m | on the step under 0.6 of the liftoff speed, the manual's "below flight speed"; liftoff speed 0.9 to 1.2 of the derived, the run 0.7 to 2.0 of it |
| F5 landing on the water | 17.7 and 25.5 m from 1.15 of the landing stall to 1 m/s | 0.6 to 1.5 of it; at rest within a degree of F1; never over 30 deg of pitch or bank; no hull contact |
| F6 the water rudders | 2.31 and 4.62 m at 0.9 m/s | 0.7 to 1.5 of it, turning the rudder's way |
| F7 nose low at speed | flagged, not gated | see the failure modes |
| F8 on grass | breaks away at 52 and 62 percent throttle | still 8 points under, sliding 8 points over |
| F9 every other aircraft | their recorded hashes | identical |
| F10 Node and Chrome on the Timber on floats' recorded flight off a swell | SHA-256 | identical |

The run's band is wide, 0.7 to 2.0, and it says why: the plant's
planing is strip theory and the derivation's is Savitsky, two different
models of the same water that agree on the lift and not exactly on
where it acts, and a take off is a pilot's as much as the aircraft's.
The liftoff speed and the step are the tighter checks.

## Failure modes, for the crash physics plan

Flagged here, not built. The crash physics plan owns breakup.

- **Nose dig.** A float plane landed nose low or fast digs its bows in:
  the forebody's bottom meets the water nose down, the flow over its
  curved bow sucks it down, the bow buries, the drag low and far ahead of
  the CG pitches it over, and the aircraft goes onto its back, often
  breaking the struts. F7 arrives 12 deg nose down at 14 m/s and lets go
  of the sticks: the plant decelerates at up to 3.1 g (Timber) and 3.4 g
  (Cub) and pitches on down, to −16.3 and −11.8 deg, then the bows' buoyancy
  and their rocker's planing force lift the nose and it skips on. **It
  does not go over**, and that is the model's limit, not the aircraft's:
  (1) water is only ever pushed, so a nose down forebody has no suction
  pulling it in; (2) once a float is under, its buoyancy saturates and
  nothing presses its deck down; (3) the fuselage, the wing and the prop
  do not touch the water at all. The crash plan needs a suction term on a
  forebody at negative trim, the deck's wash, water contact for the
  fuselage, the wing's leading edge and tips and the prop (the prop
  striking water is as final as striking grass), and a criterion for the
  struts: the deceleration and the pitch rate F7 reports are the numbers
  to start from.
- **A float catching, and the cartwheel.** In a bank on the water, in a
  crosswind turn or a beam sea, or touching down with a wing low, one
  float takes the load and its drag, far out from the centreline, yaws
  the aircraft hard toward it while the wing tip on that side goes in.
  Here one float can take all the load and its drag does yaw the aircraft,
  but the tip has nothing to catch on, so the cartwheel that follows in a
  real one cannot happen. Needs the wing tips' water contact above.
- **Capsizing.** Past about 30 deg of bank a float plane's upwind float
  lifts and the wind rolls it over; a model on a gusty lake capsizes this
  way at rest. There is no wind on the water here yet, and no wing in the
  water, so a capsized aircraft floats on its floats' tops.
- **Porpoising.** A planing hull at too high or too low a trim for its
  load oscillates in pitch and heave, growing (Day and Haag 1952, Savitsky
  1964's stability limits). The plant shows it mildly: planing at 10 m/s
  on 60 percent throttle with the stick 0.6 back, the trim swings 2.2 to
  5.0 deg and settles into that; at other trims it planes steadily. Not
  checked against the Day and Haag limit for a 15 deg V, which is the
  first thing to do if a pilot reports a nose that will not settle.
- **Sinking.** A float cannot fill, and nothing leaks. A water landing
  on the wheels of a wheeled aircraft still stands on the lake's surface
  as on ground (the shell's map height), as it always has.

## Conventions

The plant's, unchanged: world right handed, z up; body x forward, y left,
z up; SI; the 1 ms step. The water's velocity is the water's own, not the
aircraft's through it; a water body's direction arguments are unit
vectors in the plant's world frame, the wind's the way it blows to. The
buoyancy's g is the plant's own, not the weight slider: a pilot making
the aircraft heavier sinks it deeper, as a heavier aircraft would. The
waves' g is 9.81 always.
