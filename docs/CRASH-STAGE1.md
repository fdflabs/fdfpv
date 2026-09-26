# Crash physics, stage 1: the plant

The crash core of docs/CRASH-PLAN.md, Phase A items 1 to 3: parts and
hulls, damage, detached parts as free bodies, and surfaces. This file is
the contract the crash suite and the shell build against, and the record
of every limit and where it came from.

Code: `src/native/crash.c` (the judgement, the free bodies, the world),
`src/native/crash_parts.h` (every airframe's part table),
`src/native/sim_abi.h` (the ABI, the authoritative text), hooks in
`src/native/sim.c`, `plant.c`, `plant_wing.c` and `bf/bf_glue.c`.
Names and layouts for JavaScript: `configs/parts.js`. Readers:
`scripts/lib/crash.js`. Plant tests: `scripts/crash-core-selftest.js`.
Bit identity proof: `scripts/crash-identity.js`.

Sections: 1 the ABI, 2 parts and hulls, 3 damage, 4 free bodies, 5
surfaces, trees and water, 6 bit identity, 7 what the shell must build, 8
what the plan got wrong, 9 every part table as the module reads it.

## 1. The readback ABI

Everything is additive; `SIM_ABI_VERSION` is unchanged and no existing
entry point moved or changed meaning. Full text in `src/native/sim_abi.h`
under "CRASH PHYSICS".

### The mode

- `sim_set_damage(on)`, `sim_damage()`. Crash physics is a MODE, like the
  airframe and the flight style: it survives `sim_reset` and `sim_init`.
  **Off is the default**, and with it off the module is the rigid,
  unbreakable airframe it always was, whatever the contact. The damage
  STATE (what has broken) is dynamic: `sim_reset` and `sim_set_airframe`
  clear it.
- Why off by default: the shell does not draw a broken part yet (Phase A
  item 4). A module that broke props the pilot cannot see would be a
  regression in the live game. The suite and the shell turn it on; the
  shell's step is one call.

### Setting up a scenario

    sim_init(diff); sim_set_airframe(id); sim_reset();
    sim_set_damage(1);
    sim_set_ground(1, nx, ny, nz, px, py, pz, mu, e);
    sim_set_ground_material(SIM_SURF_CONCRETE);      /* optional */
    sim_set_pose(px, py, pz, qw, qx, qy, qz);
    sim_set_velocity(vx, vy, vz, p, q, r);           /* NEW, any airframe */
    /* or sim_wing_launch(speed) for a fixed wing's throw */
    sim_input(t, roll, pitch, yaw, throttle); sim_step(n); ...

`sim_set_velocity` is new: the plan assumed a velocity setter existed, and
only the fixed wings' hand throw did. It writes world velocity (m/s) and
body rates (rad/s), refuses non finite values and speeds over 150 m/s.

A scenario that starts damaged: `sim_part_break(part)` fails a joint now,
exactly as a load past its limit would, and the part and its children
leave as a free body with the craft's motion ("lose one prop in flight").
`sim_part_set_damage(part, d)` sets a prop's chip, a foam part's crush, an
arm's bend or a camera's knock, 0..1 (1 on a prop loses it). Both need the
mode on.

### The part table (static per airframe)

- `sim_set_part_table(which)`, `sim_part_table()`: `SIM_PARTS_OWN` (0,
  default) or `SIM_PARTS_WHOOP_SCALED` (1), the whoop's parts for the
  shell's whoop, which flies the five inch's plant (section 2). A mode;
  setting it clears the damage state.
- `sim_parts_count()`: at most `SIM_PARTS_MAX` (24).
- `sim_part_info(part, out[24])`: kind, parent, material, motor, mass,
  centre of mass (body frame), joint point, joint moment and force limits,
  contact stiffness, crush stress, area and depth, hull point count, and
  the hull's bounding box. Layout in `sim_abi.h`, names in
  `configs/parts.js` (`INFO`).
- `sim_part_hull(part, out[1 + 3 x 8])`: the hull's points, body frame.
- Part 0 is the root (the quad's frame, a plane's fuselage) and never
  leaves. Parents always precede children.
- Kinds (`SIM_PART_*`, `configs/parts.js` `PART_KINDS`): frame, arm,
  motor, prop, battery, camera, antenna, canopy, fuselage, wing, hstab,
  fin, aileron, elevator, rudder, elevon, gear, float, boom, duct. The
  suite's `tests/crash/readback.js` vocabulary maps onto these: its
  `tail` is hstab, fin, boom, elevator and rudder; its `chute` is the
  Bramor's chute bay lid, kind canopy.

### The state (per step)

- `sim_parts_state(out[count x 24])`, per part: status (0 attached, 1 a
  moving free body, 2 at rest, 3 retired past the body budget), damage
  0..1, centre of mass position (world), orientation quaternion (body to
  world; attached parts carry their own bend or knock on top of the
  craft's), velocity, angular velocity (world), the free body it rides on
  (or -1), this step's peak load over its limit, its permanent
  deformation (a dent in metres for a crushable part, a rotation vector
  in radians for a bent arm, boom or gear leg and for a knocked camera or
  antenna), the energy it has absorbed (J: its crush at the plateau, the
  plastic work of a bend, M times the turn it took, and when it breaks the
  strain energy it held at its limit, F^2 / 2k for a force or (M / L)^2 /
  2k for a moment, L the reach from its joint to its farthest hull point;
  the five inch arm's is 1.97 J, R-ARM derives 2.5; a crack's fracture
  energy is not counted), kind and parent.
- `sim_damage_events(out[max x 16], max)`: the events since the last call,
  oldest first, returns the count. Each: step, part, type (1 break, 2
  crush, 3 chip, 4 bend, 5 knock, 6 crack, 7 settle, 8 water, 9 tree;
  8 and 9 are entries, below), the load over the
  limit that decided it, peak force (N), joint moment (N m), energy
  absorbed (J), contact point and normal (world), closing speed, surface
  material, the part's damage after. The queue holds 64;
  `sim_damage_events_dropped()` counts overflow. Read after every
  `sim_step(1)` for exact per step attribution.
- `sim_damage_flags()`: a bit mask for the shell (`configs/parts.js`
  `DAMAGE_FLAGS`): camera knocked (the FPV picture tilts by the camera
  part's own orientation), camera lost, antenna lost (the feed breaks up),
  battery ejected (power gone), prop lost, prop chipped, arm bent, arm
  lost, wing lost, surface lost, canopy lost, gear lost, float lost, tail
  lost, crushed, in a tree this step, in the water this step, motor lost.
- `sim_motor_damage(out[16])`: per motor the thrust kept, the gyro
  imbalance multiple, and the thrust axis tilt about body x and y.
- `sim_free_bodies_active()`: how many free bodies are moving, at most
  `SIM_FREE_BODIES_MAX` (12).
- `sim_rate_guard_trips()`: how many times since the reset the craft or a
  free body reached its attitude update turning faster than
  `SIM_RATE_MAX` (10,000 rad/s) or at a rate that is not a number, and was
  stopped rather than left to hang the update's subdivision loop. Zero in
  every sound run; `crash:core` holds it there.

### Surfaces and the world

- `sim_set_ground_material(mat)`, `sim_contact_at_mat(n, mat, p, vs, r)`,
  `sim_material_info(mat, out[4])` (mu, restitution, stiffness, hardness).
  Materials `SIM_SURF_*`: default (today's contact), grass, dirt, asphalt,
  concrete, rock, snow, wood, metal, pvc, foliage, water, sand. Where the
  shell already names a material (`src/game/collide.js`
  `contactMaterial`, `GROUND_MU`, `GROUND_E`) the module's mu and e are the
  same numbers.
- `sim_contact_part(part)`: the host's next `sim_contact_at` (or
  `sim_contact_at_mat`) is on that part, at the arm it passes (section 3,
  the parts' hull). Consumed by that call; changes nothing with the mode
  off.
- `sim_obstacle_box`, `sim_obstacle_cylinder`, `sim_obstacle_clear`: what
  the free bodies meet, which the shell does not track. Since round 5 the
  craft meets them too, with its own parts every step, and a host's
  `sim_contact_at` on one is dropped (section 3, the plant meets the solids
  it knows); on anything else the craft meets the world through the
  shell's `sim_contact_at` as before.
- `sim_obstacle_contacts()`: how many parts met a known solid on the last
  step, 0 with the mode off, for a host that dated a hit by its own call.
- `sim_obstacle_compliance(i, ei, m_line, m_free)`: cylinder i is a post
  that gives, a beam clamped at its base (section 5, posts that give);
  `sim_obstacle_state(i, out[6])` reads how far it has gone at the height
  a part last met it, that height, whether it has snapped or left its base,
  whether it is out of the world, and the moment at its base. Every
  obstacle not declared so is rigid, as before.
- `sim_tree_add(x, y, z0, trunk_r, crown_z0, crown_z1, crown_r)`,
  `sim_tree_clear`: a crown the craft and the free bodies fly into, which
  drags and can hold; the trunk is an obstacle for the free bodies.

### A reader

`scripts/lib/crash.js` turns all of the above into plain objects:
`readPartTable`, `readPartsState`, `readDamageEvents`, `readMotorDamage`.
The suite's `damageReader` can be a dozen lines over it: a part is
`broken` when its status is not 0 or its damage is 1, `detached` when its
status is not 0.

## 2. Parts and hulls

### The tables

Every airframe is a fixed table of rigid parts in
`src/native/crash_parts.h`, from the drawn models (the craft builders in
`src/render`, converted to the plant frame the way `src/render/frame.js`
does it). Section 9 lists every table as the module reads it back
(`node scripts/crash-parts-table.js` prints them). Each part has hull
points (a box, or a few points: a prop is an octagon at its disc, a quad
arm a strip along its diagonal, a wing panel its root and tip chords),
which are contact samplers and not a render mesh; a mass; a joint to its
parent with a bending moment limit and a force limit; a contact
stiffness; and for foam a crush plateau stress, area and depth.

**The root's mass and centre are not written: they are the residual**,
the airframe's mass less every named part, placed to keep the CG at the
origin. So the masses sum to the airframe's mass and the CG is unchanged
by construction; `npm run crash:core` checks both, to 1e-12, on every
airframe.

The airframes: the 5 inch (frame, four arms, four motors, four props,
battery, camera, antenna; 16 parts); the whoop at true scale (ducted
frame, four motors, four props, battery, canopy, camera, antenna; 13); the
1000 mm wing (no drawn model is left, so from the plant and WING-STAGE1;
10); the Skyhunter (pod, two panels, two ailerons, the boom pair,
stabiliser, elevator, two fins, two rudders, motor, prop, battery, hatch,
camera, antenna; 18); the Cub (19, with an aft fuselage part, two mains
and the tailwheel), the Slow Stick (one piece wing; 15), the Radian (16),
the Timber (19), the Bramor (13: winglets as fins, the chute bay lid as a
canopy), and the Timber and the Cub on floats (18 each), built in
`crash.c` from their wheeled tables with the gear off, every part raised
by the plant's CG drop (26.6 and 26.4 mm), and two floats on braced struts
from the plant's float geometry; and the Buzzard Bombshell (17: balsa
under tissue, the first table in `SIM_MAT_BALSA`, a one piece wing on
rubber bands with its two panels on the centre section; the limits are
derived in docs/BOMBSHELL-STAGE1.md).

**The shell's whoop** is not airframe 1: it is the five inch's plant in a
room MICRO_SCALE (3.43) times life size. By the lead's decision it gets
the whoop's own parts: `sim_set_part_table(SIM_PARTS_WHOOP_SCALED)` is the
real whoop's table as a dynamically similar model in that world, lengths
by L = 0.1735 / 0.0506, masses by M = 0.71 / 0.0234, forces by M L,
moments by M L^2, stiffness by M, stresses by M / L. A crash the real 23 g
whoop survives maps onto one this survives (`crash:core`: a wall at a
brisk walk and a drop from head height break nothing; full speed into a
gate side chips props and knocks the camera, frame and motors whole).

### Where the drawn models and the plant disagree

- The Skyhunter's drawn prop is at x -0.268 and camera at (0.365,
  -0.005); the plant's thrust is at -0.12 and camera at (0.42, 0.02). The
  parts follow the drawing.
- The 5 inch's drawn pack bottom is 30 mm under the CG; the plant's 45 mm
  (configs/airframes.js's drop test) is the copy of record and is used.
- The whoop's, the Slow Stick's and the Radian's residual root centre lies
  outside the root's own drawn box (4.7, 77 and 1.5 mm): the plant puts
  the CG lower than the named parts' masses do (the Slow Stick's 0.1 kg
  wing is 9 cm over the stick). The CG was not moved; the root carries the
  difference, and it stays inside the airframe.
- The planes' video antennas are not drawn; each is placed where an FPV
  plane carries its whip, and the table says so.

### The contact resolves parts, and is still the box until something
breaks

The plan asked for a contact that resolves parts instead of the box, bit
identical until a damaging contact. Both cannot hold if the parts' hulls
replace the box in the solver: a flat landing on the pack and one on the
eight box corners are different contacts, and every gate with a ground
contact would move. So an intact airframe keeps the reconciled box, and
every impulse the solver applies is **attributed to the part the real
airframe meets the surface with**: the parts' hull support in the
contact's direction, within 5 mm, the point in that band nearest the
solver's. A flat landing on eight corners is a landing on the pack, a
tilted one on an arm, a motor or a prop, a wall met square is met by the
props that stand furthest out. Once a part has left, the box no longer
describes the airframe, and the solver samples the hulls of the parts
still on it (`CRASH.hull_parts`): a quad without its pack lies lower, one
without a prop rests on the arm.

A limitation that follows: while intact, a prop is struck only when the
box corner near it is in contact and the prop is the real support there.
A 5 inch rolled less than about 60 degrees rests on its box corner with
its props clear of the ground.

## 3. Damage

### From contact to load

Every contact of a step (the ground plane's impulses, the wheels' and
floats' forces, the water and the crowns on parts), or one
`sim_contact_at`, is a batch. Impulses are merged per part and turned into
a peak force through the part's and the surface's stiffness in series,
`F = sqrt(k J v)`, the peak of a linear contact that takes momentum J at
closing speed v: timestep independent, where the solver's one step
impulse is not. Forces the plant already knows (a strut, a float, the
water) are used as they are.

Every joint is then judged by the free body diagram of the parts beyond
it: the craft decelerates as a rigid body under the batch's contact
forces; the subtree has to be given its share of that through its joint,
less the contact forces acting on it directly. One rule gives both load
paths: an arm struck at its tip carries the tip force as a moment at its
clamp, and a pack that is not struck is torn off its strap by everything
else stopping. A push that seats a part on its parent (a pack under the
frame, landed on) goes into bearing, not the strap: 2 percent of it counts
(`BEARING_SHARE`), it grips the pad at friction 1.0 (`SEAT_GRIP`), and it
relieves the moment inside the seat's footprint.

**A wing panel rings** (round 3). A joint judged as above is judged as a
rigid body: a foam panel's root would see its share of the craft's
deceleration the millisecond the belly touches, which broke both of a
Skyhunter's panels 2 ms into a stall landing at 52 g. A panel on a carbon
spar (and the Skyhunter's carbon booms) is a cantilever whose first
bending period is long against that blow, and its root sees the mode's
force. Such a part now carries a spring of its own first mode, driven by
the joint's quasi static load: it takes each batch's momentum as a kick
(the impulses themselves, not the peak forces, so a one step host
contact loads it by the momentum it carried) and rings on through the
steps, damped by its joints (below, "A ring's damping and what rides on
it"; it was 3 percent of critical, chosen), until it dies away under
1 mN. The mode is the cantilever's, w = sqrt(3 E I / (L^3 (0.2427 m +
M))), m its own mass, M the parts it carries taken at its tip (Rayleigh's
tip mass form, exact at M = 0 as 3.516 sqrt(E I / (m L^3))), L its reach.
E I follows from the limit the tables already derive from the spar, M =
sigma I / r, so E I = (E / sigma) M r, with pultruded carbon tube's
flexural modulus of 127 GPa (TAP Plastics, "Pultruded Carbon Rods and
Tubes", minimum properties; flexural strength 1,370 MPa where the tables
take 1,000) and each spar's outer radius (`CARBON_SPAR` in the tables): the
foam planes' panels ring at 8 to 13 Hz, inside the 5 to 20 Hz that small
UAV wings' ground vibration tests report for their first bending, and the
Skyhunter's booms at about 15. The spar alone is stiffer than a panel
with its outboard foam, so these are the fastest the parts ring.

**A foam boom rings on its own walls** (round 4). The Cub's, the Radian's
and the Timber's tail booms are the foam fuselage aft of the wing, with no
carbon in the tables, and judged as rigid bodies they broke in the stalls
(the Cub's at 1.18 times its limit, the Radian's at 3.7) on the craft's
deceleration in the millisecond the nose met the grass. They ring the same
way, E I = (E / sigma) M c, with bead foam's flexural modulus and c the
section's half depth (the tables' `sect_c` and `sect_eos`,
`FOAM_SECTION`). The modulus: simple bending of bead foam beams at 10 to
30 kg/m^3, Negussey and Anasthas ("Young's modulus of EPS geofoam by
simple bending test", EPS Geofoam 2001, Syracuse), E = 0.82 rho - 4.9 MPa,
19.7 MPa at 30 g/L, with flexural strength 16.9 rho - 86 kPa (421 kPa);
their tension and compression moduli agree within 3 percent below 0.5
percent strain, so the bending modulus is the section's. No datasheet for
EPO (a polystyrene and polyethylene bead copolymer, ARCEL's 70/30 class)
gives a modulus; polystyrene bead foam is the stiffer of the two, so this
is an upper bound on the frequency, as the carbon spar's is. Over the 0.6
MPa the boom limits take for EPO, E / sigma is 33: the Cub's boom (c 35
mm) rings at about 37 Hz, the Timber's (45 mm) at 31, the Radian's (20
mm, a thin boom) at 10.

**EPO's own numbers** (round 5). Still no modulus: NOVA's "ARCEL versus
EPS" sheet draws ARCEL as more flexible than EPS at every density, with no
numbers on the axis, which confirms that the bead foam modulus bounds it
from above. NOVA's "ARCEL 730 Property Comparison" (AC0111-1158, the 70/30
grade) plots two strengths against density: the crush at 25 percent, 26 to
31 psi over 30 to 35 g/L, 179 to 214 kPa, which sources EPO_CRUSH's 200
kPa; and the tensile strength, 67.5 to 84 psi, 0.465 to 0.58 MPa, so the
booms' 0.6 MPa is its top, about 36 g/L. Taken alone it would cut the
booms' limits by up to a quarter (the Cub's 16 N m to 12.4); tried, it
broke the Cub's tail at the pole in crash:core's wing clip, which the
owner's flight had judged wrong, and the Timber's in its nose over and on
its float. It was not shipped: the ring's stiffness is still the upper
bound, and a stiffer boom rings harder on the same kick, so a sourced
strength paired with a modulus bounded from above breaks booms that a
real EPO boom, more flexible, would ring through. The two move together
once EPO's modulus is found.

**A part riding on a ringing part is shaken by it** (round 4). A tail on
its boom, a fin on a boom, was judged by the craft's rigid deceleration
even once the boom rang: the Radian's fin broke at 2.6 times its limit the
moment its boom stopped breaking. The boom's tip moves with the ring, and
what it carries is at its tip in the ring's mass, so a part whose nearest
ringing ancestor is ringing takes that ancestor's acceleration, the ring's
force over the mass it rings with, in place of the craft's (and no angular
term: the ring carries it). A part with no section (every quad part, the
fuselages) and not riding on one is judged as before, with the same
arithmetic in the same order.

**A composite panel rings on its shell** (round 5). The Bramor's outer
panels had no section, so they were judged as rigid bodies and broke on
the craft's deceleration: on main ae57a29 a panel came off in the tree
crown (bramor-tree, at 1.31 times its limit) and both under the chute's 5
m/s landing (1.21 and 1.24). With the ring neither does. Its
construction is published: "the fully composite structure ... uses only
carbon- and Kevlar-reinforced plastic ... to form skins separated and
stiffened by a non-metallic honeycomb", "no structural metal", and each
wing "slides ... over the end of a carbon fibre guide rod" and clicks into
place (UST 011, pp. 22 and 25, on the Bramor ppX, the same airframe). So a
panel is a sandwich box whose bending is carried by its carbon skins, and
it rings the same way as a spar, E I = (E / sigma) M c, with c the panel's
half depth at its root, 17 mm (the drawn 34 mm, BRAMOR-STAGE1's planform
at y 0.30), and E / sigma woven carbon laminate's, 70 GPa over 600 MPa,
117 (DragonPlate, R-ARM; Easy Composites' sheet, 45 to 55 GPa at 571 to
880 MPa, is the softer end, so like the spar's this is an upper bound on
the frequency). At the table's 300 N m, E I is 595 N m^2 and a panel
carrying its elevon and winglet rings at 17.5 Hz, inside the 5 to 20 Hz of
small UAV wings' first bending. The 300 N m itself is still chosen: the
skins' thickness and the guide rod's diameter are not published, and
neither is a design load factor for the Bramor.

Weakest link first: joints on a contact's path to the root fail before
joints that only carry inertia; a joint that fails caps the loads through
it at what it carried (the contact divided by the load ratio), the rest is
judged again without it, and the side of the craft that was not in the
contact keeps the velocity the failed joint could not take from it.

**A struck part takes the blow** (the owner's wing clip, 2026-09-25). The
paragraph above claimed a wing panel that meets a pole at speed leaves and
the fuselage goes on. It did not: the owner clipped a Cub's wing and "it
all kind of explodes; it's not like just the wing falls off". Measured on
main 5a72379 (cub-pole, a 25 cm pole at 60 percent of the half span at
13.5 m/s): the host's contact on the right panel crushed its leading edge
at the plateau, 230 N, for the whole 20 ms a first host call stands for,
4.6 N s on the rigid craft at the tip, dv 3.6 m/s and a yaw kick; the tail
boom, rung by that kick, broke 1 ms later at 2.13 times its limit (26 N m
of 16), the struck panel only 4 ms later, the left panel at 1.61, and the
next host pass stopped what was left by another 6.5 m/s. Twelve parts off,
10 m/s of 13.5 gone at the pole.

The judgement above was right; what the craft had been given before it
ran was not. An obstacle's contact on a part reaches the rest of the craft
only through the joints between that part and the root, and no harder than
the weakest of them holds. For each joint on the chain the force at the
contact point it holds is F_lim = min(F_max, M_max / a), a the contact's
lever about it across the normal; the least of them is the chain's. The
blow on the chain is the contact's peak through the part's spring, the
surface's and the chain's bending in series, v sqrt(k m_eff) with m_eff
the point's own effective mass, or the part's crush plateau if that is
lower. Past F_lim the joint fails in that contact (`sever_pre` in
`crash.c`): the force at the point rose through the series spring to
F_lim and no further, so the craft is given F_lim^2 / (2 k v), the impulse
of a linear ramp to F_lim at closing speed v, capped at F_lim times the
call's time, with no bounce; the judge breaks that joint first, loads
every other joint with F_lim at the point, hands nothing back (the craft
never took more), and the part and what it carries leave with the craft's
motion to meet the obstacle as a free body. The chain's bending is each
ringing joint's cantilever at the point, 3 E I / a^3, with the E I its
ring is built on (above): a foam panel on its spar gives far more across
its span than its skin does under the pole, and that give is what makes
the ramp last long enough to carry anything. Only an obstacle: the
ground's contact is its spring, which already shares the load along the
airframe.

The Cub's right panel now lets go at 79 N, its 40 N m root at the lever to
the tip it is met at, 2.92 times over, the craft takes 0.6 N s (dv 0.46
m/s), and nothing else breaks at the pole. A bound on it from the table
alone: the root can pass at most about 110 N at the pole's lever for the
40 ms the fuselage takes to pass the pole, 4.3 N s of the craft's 17.8, so
at least 0.75 of the speed is kept (`crash:core`, "a Cub clips a pole with
its right wing at cruise": 0.964; on main 0.386, with the boom, the left
panel and the prop off).

**A contact on a part that has gone** (the wing clip's rule, replaced in
round 5). The host's hull spanned a panel that had left and met the pole
the panel met, with nothing of the aircraft there; the wing clip dropped
such a contact, or placed the craft by its own parts, when the plant knew
the solid. The plant now meets every solid it knows with the parts still
on and drops the host's contact on one (below), so the rule and its
placement are gone.

**The parts' hull** (the wing clip's open item). The disc did worse than
meet a pole early: the point it handed the plant stood in the air ahead of
the aircraft, and the plant gives a host's contact to the part whose hull
stands furthest toward the solid, so the Slow Stick's pole went to its
motor and the Bramor's to its nose, which stopped it dead at 1357 g. A
fixed wing now meets the world with its parts (`src/game/airframehull.js`,
`collide.js` `setCraftParts`): one box per part of this table
(`sim_part_info`'s hull box), swept by the shell's contact pass every 4 ms
at the craft's attitude, exactly against a box (the fifteen separating
axes of two boxes, one moving) and by a conservative advance on the
exact axis to box distance against a capsule. The contact reports the
point on the part it met and the part, the shell hands the plant that
point and names the part (`sim_contact_part`), and with the mode on the
contact is that part's, at that point held to its hull box, in place of
the furthest part's. A part the readback says has left is out of the hull,
its boxes placed about the live CG the plant has moved to. Quads keep the
discs. With it every plane's pole scenario meets the wing panel where the
pole stands, and only the panel and what it carries leave at the pole
(the crash suite's `firstObstacle`; `crash:core`, "a pole met by the parts'
hull is the wing panel's"; the real shell, `scripts/wing-hull-check.js`).

This was chosen over the plant resolving its own parts against
`sim_obstacle_*` every step, because the plant knows only the 64 solids
nearest the craft, refreshed every 12 m, and a plane would have met a city
with two hulls at once. Round 5 does both without the double (below): the
shell's sweep still finds every contact, and its clip watch, sounds and
scoring still read it, but a host's impulse reaches the craft only on a
solid the plant was not told of.

**The plant meets the solids it knows** (round 5). A host's obstacle
contact was one impulse per call, and a call stands for up to 20 steps:
the craft took its whole change of speed at a gate, a wall or a pole in
one millisecond (a five inch clipping a gate at 15 m/s 1,102 g, the pole
runs' Timber 1,318 g), where the ground has been a spring since round 2.
With the mode on, every solid the plant has been told of
(`sim_obstacle_*` and a tree's trunk) is now met by the parts themselves
in every step (`crash.c` `crash_touches`, `sim.c` `obstacle_apply`), one
contact a part at its deepest sample: its hull points and eight points on
every segment between them, since a hull is a few points and a pole at mid
span stands between a panel's root and tip. The normal is taken when the
contact starts, a box's face or a pole's radius through the first point
in, and held while it lasts; the depth is along it, over the solid's width
across it, so a prop disc that swallows a gate's upright is as deep as it
has gone over the pole and not the pole's radius. Each contact is a
spring, the part's, the surface's and the struck chain's bending (3 E I /
a^3 of every ringing joint to the root, as the wing clip took it) in
series: while the part is driven in its impulse in a step is at most k x
dt and never more than stops it; once it has stopped it is the rigid
contact, with no push back out but the position correction. A foam part
crushes when the force the spring has reached reaches its plateau, not on
the rigid estimate v sqrt(k m), so a panel on its spar bends before its
leading edge crushes. Where k x would pass what the chain's weakest joint
holds at the point, that joint lets go at its limit in that step: the
wing clip's sever, reached over the steps it takes. A host's contact is
dropped with its pose (`crash_contact_known`) when its point, carried along
-n by 2 cm plus the distance the craft closes in the time the call stands
for, or the line from the CG along -n out to the airframe's reach, is
inside a solid the plant knows: a quad's host hands the plant its prop
disc's centre, not the rim that met the gate. `sim_obstacle_contacts()`
says how many parts met one in the last step, for a host that dated a hit
by its own call. A contact on anything the plant was not told of is the
host's, as always. The whoop the shell flies meets the solids the same
way, with its parts' springs scaled with it, and keeps only the rigid
ground, since its room is scaled and the floor's surface is not. (Round 5
kept it on the host's contact because losing its pack at a gate set off
the explicit gyroscopic step's runaway, fixed since: THE RATES OF A
DAMAGED AIRFRAME in plant.c.)

Measured (crash suite, Node, against main d043d2a): the gate clip at 15
m/s 1,102 to 244 g, a prop now breaks at the gate and the quad tumbles 20 m
on; the pole runs no longer peak at the pole, and their peaks are the
ground hits that follow (Cub 893 to 123 g, Timber 1,318 to 292);
`crash:core`'s Cub clip still loses only its right panel and keeps 0.916
of its speed (0.964 with the one call sever). Two
checks moved the wrong way, both in how they are measured: slowstick-pole
dates its impact from a host call, and the pole contact is now the
plant's, so its retained energy and rest distance are taken from a later
ground hit (with `sim_obstacle_contacts` counted as a contact they pass);
bramor-pole's 199 g is the step a panel breaks off at a ground hit and the
CG moves to the parts left. The five inch into masonry stays about 2,300 g:
its props and arms break and the frame, 5e6 N/m against concrete's 5e7, is
a spring of half a millisecond, inside one step; a frame that crushes needs
a crush in the tables.

**A wreck on its side, and on its back** (round 5, `sim.c`, mode on only).
A craft between upright and inverted met the ground at one support vertex,
a rule from the rigid contact so that four coplanar contacts could not
lock a roll. With every part its own spring there is nothing to lock, and
the single support let the rest of the airframe sink unresolved while a
folding leg held the projection aside: the Cub rolled on its side after
the clip had its fuselage 15 cm into the grass when the support switched
to it, and the position bias threw it out at 715 g, taking the pack,
canopy, fin, stabiliser and boom at once. On its side the craft now meets
the ground with every sampler; inverted keeps its bump, for turtle. And
the resting stop for a craft on its back, which zeroes its motion when the
hull touches, now waits until it has all but stopped (the slide and spin
thresholds the other stops use): it took a Timber sliding inverted at 4.4
m/s and a five inch tumbling at 10 m/s to rest in one millisecond, 454 and
1,096 g. Both keep the whoop the shell flies as it was.

**The feel round: the loads of flight, and how a break is judged**
(2026-09-25, after the owner's feel round, PR #75, found the crashes too
fragile). Two questions, in order: does any table limit fail in normal
flight, and is the judge putting the right load against the right limit.

*The loads of normal flight* (`crash:core`, "every joint carries the loads
of normal flight"; `flightLoads` in `scripts/lib/crash-scenarios.js`). For
every part of every table, the loads it carries flying, times the ultimate
factor of 1.5 over the limit load that 14 CFR 23.303 asks of an
aeroplane, must be under its limits. A plane's limit load factor is the
least of 14 CFR 23.337(a)'s normal category 3.8 and (V_top / V_s)^2, the
stall line of its own V-n diagram at the fastest it flies level (each STAGE
doc's gated top and stall speeds; the Radian's top speed is not written,
and flown in the plant at full throttle it reads 21.1 m/s still climbing,
so 22 is taken). The wing parts carry n W by Schrenk's approximation over
the semi-span less n g on what they carry; a stabiliser or fin its STAGE
doc's area at a lift coefficient of 1.0 at V_top; a hinged surface the same
at V_D = 1.25 V_top (14 CFR 23.335(b)(1)), or the Bramor's published 30
m/s, its moment about its own hinge line left to the servo; a canopy that
pressure as suction; props their thrust. A quad's load factor is its thrust
to weight, 8.43 and 4.7, with 3 g of vibration on top in any direction
(chosen). On main e731697 it fails one airframe: the Radian's tail boom
(7.5 N m in flight, 11.3 at 1.5, against a chosen 10) and fin (1.5 N m,
2.26 at 1.5, against a chosen 2). Both are now bounded below by flight, as
the Bramor's winglets were: 12 and 2.4 N m. Every other part passes; the
closest are the Bramor's winglets (1.00, the doc's own lower bound) and
the Skyhunter's and Timber's hatches (0.84 and 0.94).

The Bombshell was the brief's first suspect: its right wing panel broke at
"1 N" at 2.81 times its limit, which reads as a limit of 0.36 N. It is not.
The figure the sheet prints is the joint's force; the ratio was its moment,
4.77 N m on the wing's 1.9 N m saddle (and 4.2 N m on the right panel's 2.11
N m spar), with almost no net force: a pure couple. At its own V-n limit,
2.43 g, the panels carry 1.24 N m and the bands 10.7 N, 0.88 and 0.80 of
their limits with the factor of 1.5 on. At the 3.8 g normal category
standard the panels would fail (4.4 g is where they break), but the
Bombshell cannot pull 3.8 g flying level. The break came from the judge,
below.

*How a break is judged.* Instrumenting every break in the feel round's
crashes, flown in Node on a flat grass plane (the load the judge put on each
joint, split into force and moment vectors, and the craft's acceleration
behind it), found five errors, each a load put against the wrong limit or
not there at all:

- **A panel bent in its own plane.** Nearly every wing that broke in a
  cartwheel or a stall broke about body z: a tip dug into the grass, or a
  belly stopped while the panels went on, bends a panel fore and aft, and
  the judge held the whole moment vector to the spar's flapwise limit. Fore
  and aft a panel's depth is its chord: `m_max_z`, the foam slab's
  sigma t c^2 / 6 at the root (EPO 0.465 MPa, the low end of NOVA's ARCEL
  730 sheet; EPP 0.38, JSP ARPRO), with the spar's share left out (the slab
  cracks at 2.4 percent strain with the spar at a tenth of its own), so a
  lower bound: Skyhunter 139 N m, Cub 121, Timber 151, Radian 56, the wing
  1000's 171; the Bramor's composite box c / (3 t) times its flapwise 300,
  765; the Bombshell's sticks each about their own vertical axis, its
  trailing edge's plank on edge, 8.1 N m against 2.1. A moment is held to
  the ellipsoid through both, 1 / |(ux, uy) / m_max, uz / m_max_z|
  (`joint_m_lim`). A solid met at a point (a pole) crushes through the slab
  to the spar, so the struck chain's hold (`chain_hold`) keeps the spar's
  limit every way.
- **A pack in its bay.** The foam planes' packs sit in bays and their
  hatches in recesses (`IN_BAY`, open upward). The judge held a pack's
  whole load to its hook and loop: a Skyhunter's was torn off at 6.4 times
  144 N in a stall it met the grass flat in, pushed forward against the
  bay's front wall. Now only a pull out through the opening is the strap's
  or the magnets'; a push against the floor or a wall is the parent's foam
  crush plateau over the part's face that way, past which it crushes
  through, as one load ratio |(F_a / limit_a)|; the walls take the moments.
  A parent that does not crush (the Bramor's composite, the Bombshell's
  balsa) gives no wall, and those packs keep their straps.
- **A motor in the nose.** A tractor's motor crushes the nose behind it
  (`NOSE_CRUSH`), and that plateau was put through the motor's four screws:
  the Cub's broke at a 10 N m firewall on 1,360 N of crushing nose. The
  plateau bears on the foam round the motor, so it is left out of the
  motor's own joint.
- **The prop tip's skid.** The plant's prop tip skid is a spring and a
  linear damper, k 3000 N/m and c 40 N s/m, which meets the ground with c v
  and no depth: 200 N in the first millisecond of a 15 m/s dive, 45 g on a
  Bombshell, which broke both panels under their own weight in that step.
  With the mode on a skid that is a part is that part's spring and the
  surface's in series (the blade gives before the nose meets the ground,
  as the part's own hull contact does) with Lankarani and Nikravesh's
  hysteresis damping (J. Mech. Design 112, 1990), F = k x (1 + 3 (1 - e^2)
  / 4 v / v_in), which rises from nothing with the depth. The wire legs'
  wheels were already capped at their fold.
- **A joint that lets go held until it did.** A part torn off by the craft's
  deceleration alone was judged gone, and the same contacts then stopped a
  lighter craft harder in the same batch, so its neighbours saw more than
  before it went: a cascade inside one step. It pulled on the rest up to its
  limit, its load over rho, and that pull is now on the rest when it is
  judged again (`g_pull_*`). It changes none of the feel round's crashes
  after the four above, and is kept because it is the load the rest saw.

Checked and right: units (every F in N, M in N m, body frame, the ring a
force with its impulse's units), the lever arms (the joint point to each
part's centre and each contact's point, live after the CG moves), and a
free body's or a crushed part's own load (a free body is not judged; a
crushing part's force is its plateau and reaches its joint only as a
contact on its subtree).

Measured, the real shell (`SIM_GPU=1 npm run crash:feel`), what breaks,
main e731697 against this round:

| Crash | main | this round |
| --- | --- | --- |
| cub-pole | motor, battery, canopy, both wing panels | motor |
| sky-cartwheel, 17 m/s | battery, left wing, both fins, an aileron | both fins, both ailerons, both wings, elevator, stabiliser |
| timber-cartwheel, 13 m/s | boom, an aileron, battery, left wing, canopy, the other aileron, right wing | boom, both ailerons, right wing, a gear leg, motor |
| sky-stall | both rudders, elevator, a fin | the same |
| cub-stall | nothing | nothing |
| bombshell-ground, 15 m/s at 30 deg | prop, left wing, the wing off its bands, battery, motor, stabiliser | both panels, battery, stabiliser, rudder |
| bombshell-roof | left wing, the wing off its bands, motor, boom, battery | nothing (it glides on 76 m) |
| quad-gate-15 | arm, battery (1.32x) | arm, battery (1.11x) |

No pack leaves a foam plane in any of them now. The cartwheel at 17 m/s
still takes the Skyhunter's wings: the struck panel's root reads 114 N m
about an axis between flapwise and fore and aft, past the ellipsoid
through its 60 and 139, and its fins break on the carbon booms' ring. The
Bombshell's panels break at 1.3 times their 2.1 N m in the shell's dive (in Node, on a flat plane with the engine idle, nothing breaks), the stick sum
being a lower bound (its ribs' frame is left out). Open: the five inch's
pack on its strap is judged as rigidly held under the arm's 0.6 ms blow,
where a strap is a spring slower than that (no source for its stiffness);
the plane stalls still peak at 180 to 280 g, the crush plateau taken over
its whole section from the first millimetre.

The crash suite (`node scripts/crash-suite.js`, Node, replay and Chrome):
9 of 60 inside every band on main and here, all 60 deterministic; failing
checks 115 to 120. Into band: cub-cartwheel and timber-cartwheel
timeToRestS, radian-pole timeToRestS, and peakG of radian-nose-in (535 to
276 g), slowstick-stall (17 to 8.1) and bramor-nose-in (406 to 358). Out,
with the cause: sky-cartwheel and timber-cartwheel mustBreak wing, and the
Timber's minUpZ and restAttitude, and timberf-float-catch's minUpZ and
restAttitude (a panel dragged fore and aft by the grass or the water now
holds its chord's depth, so it stays on and the airframe does not go
over); radian-nose-in mustBreak fuselage (its canopy, the suite's
fuselage, now bears in its recess); cub-nose-over restAttitude (its prop
tip now meets the grass through the blade's own spring, most likely why it stops
nose down short of going over); radian-nose-in and bramor-nose-in
retainedFirst, -0.00 against a band from 0 (a sign in the last digit);
cubf-porpoise, 10 pitch reversals on the water against 4 to 8.

**A contact on a ringing part reaches the rest through its ring** (the
feel round's items, 2026-09-26). The Skyhunter's cartwheel still took the
whole aircraft (feel sheet on main 8fe1135: both fins at t+0.30, 1.12 times
on 23 N, an aileron, the left wing, the other aileron, the right wing, the
elevator, the stabiliser; 8 breaks, 10 pieces). Flown in Node (banked 75
deg, 8 nose down, 17 m/s sinking at 3, onto grass), the right tip met the
grass at 0.282 s and crushed at its plateau, 406 N, and both fins broke 13
ms later: the judge put the tip's force on the craft as a rigid body, and
the yaw and roll it gave the tail 0.75 m behind (a rigid body kick into the
booms' ring, then the fins on it at 1,000 m/s^2) arrived before the struck
panel had rung at all. A panel on its spar is a spring of 8 to 13 Hz
between the tip and the fuselage: an impulse I short against a mode's
period loads its support as w I sin(w t), nothing at first and its peak a
quarter period on (Chopra, Dynamics of Structures, sections 4.1 and 4.8 to
4.9). So a contact on a ringing part, or on anything it carries, is now
left out of the craft's rigid response, and every ringing part passes the
rest its ring's root load instead, as the batch found it (`craft_accel`).
Along its span a spar or a boom is a column, not a spring: that component
of a contact passes to the rest at once at the part's joint, and the ring
no longer carries it (a wing stood on its tip by a craft on its side rang
its 500 N axial push at the wing's frequency and pumped the booms' ring to
107 N at their root). Every ringing part hangs on the root, so no other
joint lies between such a contact and the root.

The elevator the sheet printed at "2.25x at 0 N" was not judged on its
hinge line. Its joint's moment at the break, main in Node, was (-0.83,
-0.15, 1.77) N m, almost all about body z: its tip corner had met the grass
0.23 m out from the pod's centre line as the wreck slid (a contact of 8 N
there), bending the hinge line in its own plane against the generic 1 N m
of a hinged surface (`PL_SURF_M`), with 0.15 N m about the hinge line
itself. The "0 N" is the bearing rule (`seat_load`), whose grip took the
9.4 N at the joint to nothing for the force ratio. Nothing was changed for
it: with the tail riding the strike it no longer breaks in this crash.

Measured, Node, what breaks, main against this and the crack's change
before it (the same throws as the feel round's):

| Crash | main | now |
| --- | --- | --- |
| sky-cartwheel | fins 13 ms after the strike (1.20), right aileron, right wing, left aileron, left wing, elevator (1.85): 7 breaks | right wing 28 ms after the strike (1.02, 139 N m); both fins 0.20 s after the strike, when the left tip digs in; hatch and pack on the inverted landing at 0.93 s: 5 |
| timber-cartwheel | boom, both ailerons, left wing, gear leg, motor | boom and right wing at the strike, left wing when the other tip digs in |

The fins that still go are on the booms' ring, pumped by the second tip
digging in on top of the ring the first left (3 percent of critical,
chosen then); the boom's root reaches 0.74 of its 180 N m.

`crash:core` holds the first 100 ms: "a Skyhunter's wingtip catches the
grass" (on main the fins break at 13 ms, with only the crack's change at 15
ms). The crash suite, Node, against the crack's change: 10 of 60 in every
band on both, failing checks 119 to 116. Into band: cub-cartwheel minUpZ,
restAttitude and restDistM (it goes over, inverted, 5.6 m on), bramor-stall
restDistM. Out: radian-stall mustNotBreak, its boom and tail now off: the
Radian's panels ring at 7.3 Hz and its thin foam boom at 11.2, and their
ring passed to the fuselage drives the boom near its own mode, where the
rigid response did not. Worse without a band moving: bramor-catapult-stall
now loses a panel (1.01 of its 300 N m) and bramor-tree its pack. The
rings do not load each other back (a ring passes its root load on and
takes no energy from what it drives), which bounds none of this from
above; a coupled model of the airframe's modes is the fix if the owner
finds these wrong in the air.

**A ring's damping and what rides on it** (branch crash-ring-crush). Two
changes to the ring, neither of which moves a limit:

- Its damping is sourced, not chosen. In a built up structure the ring's
  energy goes into its joints: along the fibre carbon laminate dissipates
  of the order of one percent of its strain energy a cycle (Adams and
  Bacon, "Effect of fibre orientation and laminate geometry on the dynamic
  properties of CFRP", J. Composite Materials 7, 1973), about a tenth of a
  percent of critical. Newmark and Hall's damping by construction (Chopra,
  Dynamics of Structures, 4th ed., Table 11.2.1) gives a bolted or riveted
  structure 5 to 7 percent of critical up to half its yield and 10 to 15
  at or just under it, and one without such joints (welded) 2 to 3 and 5
  to 7. A spar plugged into the fuselage, a tube clamped in it with screws
  and the Bramor's plug in shells are the first kind (`sect_joint` 1, set
  by `CARBON_SPAR` and `SHELL_SECTION`), a foam boom moulded with its
  fuselage the second (`FOAM_SECTION`). The low end of each range, which
  rings longest, from half the joint's limit to its limit on the load the
  last batch judged it at. The table is for buildings; no ground vibration
  test of a foam model could be consulted for this branch, so what carries
  over is the class of construction, not the size. It is the first thing
  to replace when one is found.
- What rides on a ring is shaken by the ring's load over the mass that load
  was built for. The ring is driven by the subtree's quasi static load,
  m_sub times the craft's motion less the contacts on it, and the tail on
  the Skyhunter's booms was shaken by that over the mode's tip mass
  (m_eff, 0.11 kg against the ring's 0.16), 1.4 times the craft's
  acceleration even in a steady deceleration. Now the tip's acceleration
  is the ring plus the contacts on the subtree, over m_sub: the craft's own
  when nothing rings, and a ring that overshoots shakes the tip by as much
  more. The mode's frequency stays the intact one. Taken live on what
  still rides on it (a fin that breaks off takes its mass out of the mode)
  it was tried and left out: the Radian's panels rang faster once an
  aileron was off, nearer the boom's 11.2 Hz, and the boom, at its limit
  either way, went in the stall where main 2a1b33b keeps it.

The rings' reaction on the craft was already there (every ring passes its
root load to the rigid craft, and every other ring is driven by that
craft), so the "no energy back" of the feel round was not a missing
coupling but the 1.4 over drive and the chosen damping. What the ring
still does not do: the rigid craft keeps the rings' mass as well as their
root loads, which under estimates its deceleration by m_sub over m in a
steady load. Taking it out is right in principle and was tried: the
craft's inertia less the subtrees' is under zero on the Bramor (0.63
against 0.589 kg m^2 in roll, the plant's inertia and the part tables'
point masses disagreeing) and 0.0001 on the wing 1000, where the lagged
coupling is unstable. So it stays, recorded.

Measured with the ring change alone, main 2a1b33b against it. Node, the
feel round's throws: the Skyhunter cartwheel from the struck wing, both
fins 0.59 s after the strike (1.21, 1.11) and the pack, to the struck
wing and the other aileron, the tail kept; the Timber adds a gear leg,
the Cub loses its fin, antenna and boom where it lost both ailerons, the
pack, the fin and the antenna, the Radian the same. The real shell (crash:feel, CPU
renderer): the Skyhunter cartwheel from the struck wing, both fins at
t+0.90 (1.19, 1.17) and the pack, inverted, to the struck wing, an
aileron and both fins at t+1.67 (1.12, 1.30), upright, so its fins still
go late in the tumble; the Timber the same breaks and a gear leg; the
stalls unchanged. The fins go on a sustained load, not a ring: the second
tip, once its 12 cm of crush is spent, stands on the ground's spring at
about 700 N, which yaws the craft at about 2,000 rad/s^2 and puts 1,500
m/s^2 on the tail quasi statically; the crush change below takes that
load off. The Radian's stall keeps its tail on main 2a1b33b and here;
where it lost it (main 39315bb, before the turf's grip), it went in the
step the nose first met the grass, 1,514 N on the pod, with the pack, the
motor and the prop, and the panels' 7.3 Hz ring driving the 11.2 Hz boom
broke nothing in the 50 ms before (they crushed at 300 N for 3 ms, the
tail stayed on until the nose). Suite: failing checks 110 to 111. Out:
cub-cartwheel mustBreak wing (the struck panel holds, the tail goes),
minUpZ and restAttitude (it ends upright, not on its side). Into band:
timber-cartwheel peakG (82 to 64 g) and timeToRestS (0.83 to 1.90 s).
crash:core 225 of 226 on both, the one failure main's ("a five inch loses
a prop in flight", 9.2 rad/s).

**Why the Cub does not nose over where the Timber does** (the feel round's
items, 2026-09-26). Thrown level on its wheels at 6 m/s on grass, full
power and full down elevator in Manual, the Timber goes over at 1.28 s and
the Cub rolls on tail up at 11.6 m/s, 5 to 7 deg nose down, and swings 90
deg left in 2.8 s. Flown in Node with damage on and off the Cub's run is
the same to the digit, so nothing in the crash physics holds it up. It is
the gear's geometry, and the plant is right to keep it upright:

- The Cub's main wheels meet the grass 0.068 m ahead of the CG and 0.162 m
  under it, so it tips over them at 22.8 deg nose down; its prop's tip meets
  the grass first, at 9.3 deg (CUB-STAGE1, the landing gear). The Timber's
  meet it 0.057 m ahead and 0.232 m under, so it tips at 13.8 deg, and its
  prop tip, 87 mm up, would not touch until 21.5 deg: it is over its mains
  before anything can stop it (TIMBER-STAGE1). R-NOSEOVER's "nothing to stop
  them nosing over except the propeller" is the difference.
- Held full down at 11 m/s the Cub's stabiliser, at the tail's negative
  angle as it rises, balances its elevator (Cmdelta_e 0.89 on 15 deg against
  the Timber's 1.175) at 5 to 7 deg, short of the prop, and the load on the
  mains ahead of the CG holds it there. cub:gates C21 pushes from the three
  point attitude at 8 m/s, and the pitch rate carries it to 9.5 deg and a
  prop strike; a level start comes up with no rate to spend.
- Nothing slows it: going over the mains takes a retarding force of 0.42 of
  their load (0.068 / 0.162), and mown grass rolls at 0.08, with no brakes
  on an FMS Cub. The AFH's nose overs come from soft spots, tall grass,
  snow or brakes, which is the suite's cub-nose-over on sand (it strikes
  the prop and rocks back; whether a blade digging into sand holds harder
  than the tip's 0.8 skid is CUB-STAGE1's open question).
- The swing: with the tail up the tailwheel carries nothing (0 N from 0.1
  s) and the left main lifts as it turns (0 N from 0.9 s), so no tyre holds
  the torque and P factor with no right rudder in, which is why a real one
  swings too (CUB-STAGE1, the model).

### Under the break, per material (`crash.c`)

| Part | Onset, load over limit | What happens | Flight effect |
| --- | --- | --- | --- |
| prop | 0.33 | chip grows to 0.5 at the limit | thrust x (1 - 0.6 chip), torque x (1 - 0.5 chip), rotor inertia x (1 - 0.3 chip), gyro line x (1 + 25 chip) |
| prop spinning in a contact | the tip's impact stress over the blade's strength, 1 | chip += (tip speed / 100 m/s)^2 x hardness x dt / 0.2 s x (1 - strength / stress) | as above; lost at chip 1 |
| prop spinning past that limit | its tip's blow at its root over the blade's limits (round 3) | the blow, v_tip sqrt(k m), bends the blade at its root: chip past the yield, lost past the shear | as above |
| arm | 0.60 | the mount twists in its clamp, up to 0.10 rad | that motor's thrust axis turns |
| music wire (gear, struts) | 0.45, yield at 1 / 2.21 of the break | bends, up to 0.20 rad; a gear leg in contact folds at its plastic hinge, 0.77 of the break (round 4) | recorded for the shell |
| aluminium boom or gear | 0.70 | bends, up to 0.15 rad | recorded |
| camera, antenna | 0.50 | knocked, up to 0.60 rad | the camera part's orientation: the FPV picture tilts |
| anything else | 0.70 | cracks: its joint loses up to half its strength | the next hit breaks it sooner |
| foam | the plateau force | crushes, below | the dent is stored |

**A spinning blade chips only past its impact limit.** A blade tip that
meets a surface at speed v is loaded, for the first instant, by the
elastic impact of two half spaces, sigma = v Z_b Z_s / (Z_b + Z_s), Z = rho
c each one's acoustic impedance (Goldsmith, Impact, 1960, ch. 4; Johnson,
Impact Strength of Materials, 1972). The blade is glass filled nylon, PA6
GF30 conditioned: 1360 kg/m^3, E 7.5 GPa, so Z_b = 3.19e6 Pa s/m, and a
tensile strength of 120 MPa (the typical datasheet range for PA6 GF30, dry
to conditioned, is about 9.5 to 6 GPa and 185 to 120 MPa; the weaker end,
since a prop in service has taken up moisture). The surface's impedance is
its blade hardness times concrete's, 2400 kg/m^3 at 3750 m/s, 9.0e6. That
puts the limit at a 51 m/s tip on concrete, rock and metal, 52 on
asphalt, 60 on wood, 64 on a generic obstacle, 71 on pvc and sand, 82 on
dirt, and past 700 m/s, beyond any tip speed a hobby prop reaches, on
grass, snow, foliage and water: props that brush grass at
full power come back unmarked, props that touch concrete at hover come
back nicked. DERIVED from the material data; the hardness column is still
chosen (section 5). A whoop's blades are polycarbonate, Makrolon 2407
(R-PROPS, the datasheet: 2400 MPa, 1200 kg/m^3, yield 66 MPa), so Z_b =
1.70e6 and the limit is the yield: a 46 m/s tip on concrete. The whoop the
shell flies is the five inch's plant in a room 3.43 (L) times life size
with time unscaled, so its speeds are L times a real whoop's; stresses
scale by M / L and impedances by M / L^2, which puts its blade limit at L
times the real tip speed. The plant takes its tip back to life size and
meets it with the real blade and surface (round 2; before, the scaled
whoop used the five inch's glass nylon at an unscaled limit). Under the
limit a spinning contact writes nothing at
all, so hardness changes the damage only through a contact past the limit.
Past it the surface stops the tip rather than giving way, and since round
3 the blade is stopped by its own spring: the tip's blow is v_tip sqrt(k
m), k the blade's tip stiffness and the surface's in series, m a third of
one blade's mass (a rod turned about the hub, struck at its end; the
tables carry each prop's blade count, three on both quads, two on the
planes), at the tip's own speed, and it bends the blade at its root over
its radius. The root is judged by it like any joint (under the yield
nothing new, past it a chip, past the shear the blade leaves), where
before a strike could only chip and a blade left only after 0.2 s of
sustained chipping. Past it the chip grows at the rate in the table, faded in from nothing at
the limit, and a strike is one chip event when it starts (a blade that
touches again within 20 ms is the same strike) and one more for every
0.05 of chip after: a flight with no event is a flight nothing was written
in. Before this a spinning contact on any face chipped: the crash shell's
identity check found a Slow Stick grazed at 5 cm/s from below in cruise,
its prop tip taking the contact, written 1.5e-4 of chip with no event and
flying a different trace (round 1, `crash:core` now flies that graze on
both a plain obstacle and a pvc gate and holds it identical).

A part's damage is the largest of its crack, chip, crush over its depth
and bend over its maximum, and 1 when it has left. Damage follows a
part's peak: a load under an earlier one adds nothing, so a sustained
load cannot pile up events.

**A crack weakens the joint for the next load** (the feel round's items,
2026-09-26). The sentence above did not hold for a crack. Its loss came
off the strength the load in hand was judged against, so that load's ratio
rose with no rise in the load, which was a new peak and a deeper crack:
any load held past about 0.72 of a limit cracked its way to a break in a
few steps. Every feel round sheet showed it as crack, crack, crack, break
(the Skyhunter's fins at 0.73, 0.86 and 1.20 of theirs; the Radian's boom
in its stall at 1.09 on a load that had peaked at 0.72 of its 12 N m and
was falling). A table's limit is its joint's intact ultimate strength, and
the table above says what a crack is for: the next hit breaks it sooner.
So peaks are kept over the intact strength, and the crack a load makes is
held while that load is on and taken off the strength once the load has
fallen back under the 0.70 onset, or the contact has ended (`crack_settle`
in `crash.c`). The readback's damage shows the crack at once. A load now
breaks a joint at its limit; a crack from an earlier hit still lowers it.

Measured, the crash suite in Node against main: 9 to 10 of 60 in every
band, failing checks 120 to 119. Into band: timber-cartwheel minUpZ,
restAttitude and restDistM (its wings hold long enough for the tip to throw
it over, inverted, 5.1 m on), radian-stall mustNotBreak (its wing stays;
its pack now leaves, which that band does not name), radian-nose-in
retainedFirst, bramor-pole peakG (105 to 91 g), cubf-porpoise (10 pitch
reversals to 8). Out: radian-pole timeToRestS (2.68 to 3.24 s, band to 2.8),
and two float capsizes that went over only after a crack cascade broke the
tail: cubf-nose-dig (on main the boom broke at 0.206 s at 1.43 of a cracked
strength, 0.94 of its intact 16 N m, and the Cub went over; now its boom
holds at 0.87 and the Cub pitches no further than an up axis of 0.93) and
timberf-capsize (main shed its boom, a wing and the motor before rolling
over; now it keeps them and stays upright, up axis 0.46). The same Cub nose
dig is `crash:core`'s "floats: ... a nose low touchdown digs in and goes
over", which now fails: the bow's dig does not pitch a float plane over by
itself, which is the water's to answer, and the check is left failing, not
moved.

### Crush is the contact's duration

A foam part struck past its plateau stress over its crush area crushes at
that stress. While it crushes the solver's normal impulse on it is capped
at the plateau force times the batch's time, its restitution is zero, and
the solver's position corrections stand aside: the craft keeps moving into
the surface by the depth it crushes, at the plateau force, while the foam
lasts. The contact has a duration, which is what brings a foam impact's
peak load from a one step impulse to the references' range (a Cub nosing
in at 10 m/s: 343 g at the CG where the rigid contact gave 1,020 g). The
crush area is the table's section (a cowl, a pole's width of a leading
edge) unless a part meets the ground within 25 degrees of flat on one of
its faces, when it is half that face (a belly slam takes far more before
it gives). Against the ground the decision uses the craft's whole mass,
against an obstacle the point's effective mass. A tractor's motor crushes
with the nose behind it.

**The patch grows as the foam goes in** (branch crash-ring-crush). A
foam part crushed at its plateau over its whole section, or half a face,
from the first millimetre. Now a foam part's crushed patch is the section
of the ellipsoid its hull box holds at the depth the front has reached,
pi e0 e1 e2 / h (2 u - u^2), u = d / h, h its reach along the normal,
up to the area it had before (`crush_area`, `crush_patch`). The depth is
the front (its dent along the normal) and the give before the foam
yields: the foam's own strain at its plateau (crush_s over bead foam's
19.7 MPa, `FOAM_E`: 1.0 percent for EPO) over about the patch's width
(Boussinesq's field under a loaded area), and the surface's own give at
the force reached. The part's own spring is left out of that give: on a
panel it is the panel bending away. Grass gives centimetres, so on grass
the patch reaches its full section within the give and a belly does not
crush (the Skyhunter dropped flat at 5 m/s: nothing written, as before);
concrete gives nothing, so there a belly crushes from its first
millimetre over a growing patch. A quad's frame keeps the table's section
(`crush_foam`: EPO and EPP only).

With it, three things the crush did not do:

- A solid the plant knows has a shape: a box's face is a plane, a pole of
  radius R a chord 2 sqrt(2 R d - d^2) across its axis times the part's
  section along the axis (`CR_POLE`). The owner's pole nick, a Cub at 14
  m/s, a 0.15 m wooden pole overlapping the right tip by d (Node,
  `sim_obstacle_cylinder`, main 39315bb against this): 0 cm nothing on
  both; 0.5, 1, 2, 5 cm nothing on main, a crush event and a dent of 2.3,
  3.9, 9.2 and 11.5 mm here, the speed kept the same (0.884, 0.863,
  0.818, 0.722); 10 cm the aileron off on both, a 4.6 mm dent here.
  Against a solid the crush goes on only while the chain's spring is past
  the plateau (past it the panel bends away; a crush held at its plateau
  put more through the panel than its root holds, and the Cub's pole clip
  in crash:core kept 0.62 of its speed against the 0.75 its root allows),
  and the front goes no deeper than the part overlaps the solid.
- A crushed part's hull is flat where it crushed (`samplers_rebuild`), so
  the projection (sim.c) no longer lifts the craft out of a depth the foam
  gave up and takes its speed with it; and a crush is driven while the
  craft still comes on, not only while the point the solver visited
  does. Together these took a Skyhunter dropped flat onto concrete at 5
  m/s from 433 g (the settle's stop in one step) to 226 g (main: 156, its
  elastic spring, the foam never crushing).
- Pressed in and held, the part's own spring at its depth is the force on
  the foam: the Skyhunter's second tip in the cartwheel stood on about 700
  N through the ground's spring after its 12 cm crush, which yawed the
  craft and put its fins past their limit 0.21 s after the strike (main
  39315bb); it now crushes at its plateau, and the fins stay on until the
  grass strikes the tail itself (below).

The stall peaks the feel round named (180 to 280 g) are not the crush's.
On main 2a1b33b the Skyhunter's stall into the grass writes no crush; its
139 g is one millisecond in which the hull, sunk on the ground's spring
with the projection standing aside, is lifted out by the projection with
its speed into the ground zeroed (z 0.171 to 0.259 m, vz -1.36 to 0.00);
the Bramor's 154 g is the ground's spring on its composite pod, 3.3 kN,
which does not crush at all; the Radian's 110 to 122 g is a real crush,
about 1 kN on its pod as the nose meets the grass. The first two are the
ground's spring and sim.c's projection, not this branch's, and are left
for their owner.

Measured, main 2a1b33b against both changes. The pole nick, above. A
Skyhunter dropped flat at 5 m/s: on grass nothing written on both, on
concrete 156 g on main (its elastic spring, the foam never crushing) and
226 g here, the belly crushed 3 cm, the pack and the camera off. Node, the
feel round's throws: the Skyhunter cartwheel loses the struck wing, the
other aileron, and a rudder, the elevator and a fin 0.64 s after the
strike, struck by the grass themselves at 5.5 m/s (3.2 to 3.9 times their
limits); the Timber
the boom, the struck wing and a gear leg. The real shell (crash:feel, CPU
renderer): the Skyhunter cartwheel from 4 breaks (the struck wing, both
fins at t+0.90, the pack), 7 pieces, inverted, to the struck wing and one
aileron, 3 pieces, upright; the Timber unchanged (boom and both wings,
upright); the stalls unchanged. Suite against
main: failing checks 110 to 113, 10 of 60 in every band on both. Into
band: radian-nose-in peakG (500 to 277 g), timber-cartwheel restDistM
(2.7 to 14.4 m). Out: sky-cartwheel minUpZ and restAttitude (it ends
upright: its tips crush at their plateau instead of standing on the
ground's spring, so nothing lifts it over), cub-cartwheel mustBreak wing,
timber-cartwheel mustBreak wing (its tip ploughs 14 m crushing, 12 g, and
nothing breaks), timber-nose-in retainedFirst (-0.00 against a band from
0, the sign in the last digit).

**A panel bends before its tip crushes** (the lead's return of #86). With
the growing patch neither cartwheel went over: the lead asked why the tip
no longer pivots. It was not the plough and not the flattened hull (both
tried off: the Skyhunter and the Timber stayed up). It was when the tip
starts to crush. The crush was decided on the blow's peak, v sqrt(k m),
against the plateau on a patch that is a point at first contact, so the tip
crushed from the first millimetre and went on crushing at 300 to 600 N in
its first 10 ms, a force the panel's own bending spring (a few kN/m) could
not have reached yet: the tip was stopped at the grass's face mostly along
its normal, which rolls the craft back rather than yawing it. Now a foam
part's foam on the ground feels what its spring has been pressed to by the
end of the step, k (x + v dt), no more than the peak; and a part that rings
(a panel, a boom), whose spring is its own bending, crushes only in the
steps that spring is past the plateau on its patch. The panel bends first,
the tip is held in the grass while it loads, and the drag at the tip
pivots the craft, as on main before the growing patch. A part that does
not ring (a pod) is stiff against its crush and, once started, crushes on
while the craft drives it in (so a flat belly drop onto concrete stays at
227 g, where a stop and start crush put it at 444).

What it does, main 00b7d54 against this commit (Node, the feel round's
throws; the suite): the Skyhunter cartwheel goes over again, inverted, in
the feel throw and in the suite (sky-cartwheel minUpZ and restAttitude back
into band, 0.07 and upright with the growing patch alone); the Timber and
Cub cartwheels in the suite do not go over (timber-cartwheel upright, as on
main; cub-cartwheel minUpZ -0.93 on main to 0.51). Suite failing checks:
main 115, the growing patch 118, this 114. The pole nick sweep is
unchanged (the solid contact already worked this way).

What decides whether a cartwheel goes over is sensitive past the first
strike, and one thing in it is an artifact on main and here alike: when the
struck tip's ground spring stops (it had gone 10 to 30 cm into the plane on
its panel's bending), the rigid contact takes over and sim.c's position
corrections take the craft back out of that depth in one or two steps, 14
cm up for the Timber on main and 9 here, 32 cm for the Skyhunter in one
variant, with no change of speed. The Timber on main goes over after that
lift; here, lifted less, its other tip lands sooner and rolls it back. A
part coming back out on its spring instead (the solver pushing it out no
harder than its spring at its depth, nothing else lifting it) was tried.
For every part it removes the lift, but the ground spring's share per
point then does not hold a belly's weight at rest: the belly sits 2.8 cm
into the grass and its plough stops a slide at 1.5 g where the sled's is
0.45 (crash:core fails five checks). For the parts that ring only,
crash:core passes but the suite fails 118 checks and neither the Timber
nor the Cub goes over. So it is not in, and it is the next thing to fix
in the ground's spring.

**The ground is a spring** (round 2, by the lead's decision that with
the mode on every contact may have its physical duration, docs/CRASH-PLAN.md).
Until round 2 an impact under every limit was a one step impulse, so the
craft took its whole change of speed inside a millisecond (a Skyhunter
stalled in from 8 m read 380 g, a Timber 716) while the judge estimated
the joints' loads as `F = sqrt(k J v)`, the peak of a linear contact of
stiffness k. The two now agree: a part driven into the ground plane is
stopped by that spring, the part's k and the surface's in series, at the
depth x its deepest point has reached, `F = k x`:

- While a part is going in, its normal impulse in a step is at most
  `k x dt`, shared among the points it meets the ground at by each point's
  own depth (so a pack landed flat is pushed at its middle, whatever order
  the solver visits its corners in), and never more than stops it (no bias
  push, no bounce). The solver's position corrections stand aside, as
  for a crush, and the resting stops (`ground_settle`) turn to Coulomb
  friction, as they do for a canopy in wind.
- When it has stopped going in (under 0.05 m/s, as a crush), the contact
  is the rigid one again and the position correction brings the part out
  of its depth without throwing it (no bias impulse in that step).
- A contact the spring already holds at its point's depth, a craft standing
  on its belly or its pack, is rigid from the start.
- The judge takes a sprung part's force as what the solver gave it,
  `jn / dt`.
- **Every part, over its travel** (round 3). Round 2 sprang only parts
  stiffer than the ground and left the rest (a blade, a wing tip, a camera
  on grass, and every part on concrete, which is stiffer than all of them)
  the rigid one step contact, because how far a soft part gives before the
  stiffer airframe behind it meets the ground was not in the tables. It
  is: a part's travel is how far it stands out past the stiffer parts
  along the contact, from the parts' own hulls. Every part now meets the
  ground through its own spring and the surface's in series until its
  travel runs out; past it the stiffer part that stands out furthest adds
  its own spring (with the surface's) at its own point, and carries that
  share of the force through its own joint, so the soft part's joint sees
  only its own spring's. The stiffest part has no travel to run out of,
  which is round 2's rule for it.
- The depth the spring is at is the part's own point's, not the solver's
  box corner's, which stands centimetres past a round prop disc on a
  tilted quad. In the first step of a contact a part's force is shared by
  its hull points within the attribution band of its lowest (after that,
  by the points it met in the last step), so the first corner the solver
  visits does not take a flat pack's whole landing.
- Not sprung: a whip, which loaded along its length buckles and folds
  (sprung, and capped at its yield, it broke the five inch's whip and pack
  on its back, against the references); the whoop the shell flies, whose
  room is scaled 3.43 times but whose surfaces are not; a solid the plant
  was not told of, which is the host's one impulse per call (the solids it
  knows are springs since round 5, section 3); and wheels and floats,
  which were springs already.
- **A music wire gear leg folds** (round 4). Round 3 left it the rigid one
  step contact, and landing on one was 473 g in the Cub's cartwheel; its
  wheel's spring and damper, elastic to the end, broke the Cub's and the
  Timber's legs off in the stalls at 1.02 to 1.15 times the break (the
  damper alone gives 245 N a leg at a 5.7 m/s touchdown). A leg is a
  spring until the moment at its root reaches the plastic hinge's, 1.7
  times the yield moment of a round section (ASTM A228: 1,600 MPa in
  bending, E 207 GPa; the tables' `WIRE_M`, the break, is 2.21 times the
  yield), and then bends at that moment without carrying more, until it
  has folded as far as it reaches below its root, when the fuselage meets
  the ground. The hinge's force is the moment over the leg's own lever,
  root to foot (its hull point farthest from the root), across the
  contact's normal, and when the leg itself is met, plus the ground's
  friction at the foot on the whole reach (mu times the reach), since the
  friction bends it too. Through the wheel (`crash_wheel_force`, the one
  hook in sim.c's gear) the strut force, spring and damper, is capped at
  it, and the plastic set grows by what the elastic leg would carry past
  it; on the leg's own hull the solver's impulse is capped at it while the
  leg is driven in, as a crush is, and the leg's box, which is the leg
  unfolded, goes on giving at it until the airframe beside it meets the
  ground, which is where a folded leg lies. The legs' wheel stiffness in
  plant.c is within a third of 3 E I / L^3 for their drawn wire (the
  Timber's 4 mm leg over 0.16 m: 1,900 N/m, the plant's 1,500). The
  Timber's two legs fold at 141 N each, 17 g on its 1.7 kg; the Slow
  Stick's 2 mm legs at about 20 N. The judge then sees the leg at 0.77 of
  its break, a bend, not a break.

Measured, crash:core: a five inch dropped flat from 1.5 m onto grass peaks
at 126 g where the rigid contact gave 526 (130 g in round 2, when it came
to rest within 1 mm of the rigid contact's rest); settling at 1 m/s, 46 g
against 188. The
crash suite on main da32758, per scenario, is in docs/CRASH-PLAN.md,
round 2. The rule under every limit is now: with the mode off every
flight is byte identical (scripts/crash-identity.js); with it on, nothing
is written, the blow of a stiff part's ground contact has its duration,
and the craft comes to rest where the ground's grip puts it. Since round 3
the flat drop rests 2.72 mm from the rigid contact's rest: the landing
leaves a small sideways kick, and a flat pack slides that out at a sled's
grip counted once, where the rigid contact makes a larger kick (0.45 m/s)
and stops it dead with the shell's grip counted twice (section 5). Round
4 replaced that check's premise, since the rigid contact's rest is not a
reference once the grip is a sourced one: crash:core now holds the drop to
the grip it should have, the kick left when the blow ends (0.189 m/s)
sliding out at 0.461 g against the sled's 0.45 (within 0.02, as the
Skyhunter's belly slide is held), and at rest 2.44 mm on, inside the 4.03
mm that grip stops that kick in. The settle at 1 m/s still rests where the
rigid contact left it (0.26 mm).

### Flight effects

- **Quad** (`plant.c`, `bf/bf_glue.c`): per motor scales on thrust, prop
  torque and rotor inertia; a dead motor draws nothing; a bent arm turns
  its thrust axis (Rodrigues about the cant axis); a chipped prop's once
  per revolution line in the gyro grows with its imbalance through the
  existing gyro path, so Betaflight's filters and PID meet it. Measured:
  raw roll gyro 1.03 deg/s RMS sound, 2.32 with one prop at chip 0.4; a
  prop lost at 10 m: 40.6 rad/s of yaw and on the ground in 2.1 s; a fully
  bent arm: 1.0 m of drift in 3 s where the intact quad drifts 0.02.
- **Plane** (`plant_wing.c`): thrust scale and a dead motor; a lost wing
  panel's share of the lift taken from its spanwise centroid (the Cub,
  stabiliser on, rolls to -59 deg in 1.5 s); a lost aileron, elevon,
  elevator or rudder moves nothing (full stick 2.62 to 1.34 rad/s with one
  aileron); a lost stabiliser or fin takes its share of the tail's
  derivatives, leaving an unstable wing and body (`WING_BODY_*`, chosen
  from the tail volume argument).
- **Both**: the pack gone is no power (volts, current and thrust zero; a
  plane's servos trail); what is left gets its own mass, CG and inertia,
  the state moves to the new CG, and a plane's aero forces take their arm
  about it.
- **The rates of a damaged airframe**: once any flight effect is in force
  (`CRASH.active`), both plants step I omega_dot = tau - omega x (I omega
  + h) with the free rigid body split by axis (each part an exact
  rotation of the angular momentum, the torque a half kick either side)
  instead of the explicit step. The explicit step adds |dt omega x L|^2
  to |L|^2 every step, which a powered quad's controller and rotors take
  out and a wreck with its pack gone does not: a five inch or the shell's
  whoop that lost its pack in a 150 rad/s tumble ran away to 6,000 rad/s
  in 1.3 s, and to 100,000 in the round 5 gate clip. A rotation cannot
  change |L|, so an unpowered tumble now keeps its rate for any inertia
  (`crash:core`: 163 rad/s from 163 over 1.5 s). An intact flight never
  takes it, so it is bit identical.

### Limits and their sources

| Joint | Limit | Derivation | Source |
| --- | --- | --- | --- |
| 5 inch arm, 16 x 7.6 mm quasi isotropic CF | 73.9 N m (1,160 N at the motor) | Z = b h^2 / 6 = 1.54e-7 m^3 at 600 MPa, x 0.8 for the clamp's holes | R-ARM (571 to 880 MPa, DragonPlate 600); R-ARM's derived 470 N is for a 5 mm arm, the drawn one is 7.6 |
| the same arm in its own plane (feel round) | 155.6 N m | Z = h b^2 / 6 = 3.243e-7 m^3, its 16 mm width the depth; held in the sever path too (chain_hold), since a carbon arm has no slab to crush first | R-ARM (1,100 N sideways against 470 N from above) |
| its tip stiffness | 3.43e5 N/m | 3 E I / L^3, 50 GPa, L 0.0635 m | R-ARM (45 to 55 GPa) |
| 5 inch prop | yields 2.5 N m, shears off at 7.5 | 12 x 2.5 mm root at 200 MPa; ductile | R-PROPS (PC bends before it breaks, over 50 percent at break) |
| 2207 on its arm | 48 N m | two M3 pulling out at 1.5 kN on 16 mm | chosen |
| 5 inch nose and top crush (feel round) | 2.4 kN over 40 mm, met within 60 degrees of up and forward | four 5 mm aluminium standoffs on a 3 mm bore racking between the plates, 4 Mp / h each, Mp = 276 MPa (D^3 - d^3) / 6 = 4.5 N m over 30 mm; from below the bottom plate and pack bear it | 6061 yield as ALU_BEND_ONSET; the travel R-ARM's 15 to 40 mm |
| 5 inch pack strap | 250 N, 6 N m | the strap's buckle slipping | chosen |
| its travel (feel round) | 36 mm of slide before the pack is free | the strap crosses the pack's middle: half its drawn 72 mm; the webbing's stretch at 250 N left out (nylon harness webbing stretches 20 to 30 percent only at 11 kN, Wikipedia "Webbing") | drawn model |
| FPV camera in TPU | 0.8 N m, 60 N | side screws in a TPU mount | chosen |
| FPV whip in TPU | 1.0 N m, 40 N | a whip flexes a long way before it tears | chosen |
| whoop motor | 0.25 N m, 30 N | two M1.4 in PP | chosen |
| whoop prop press fit | 0.10 N m, 6 N | 1 mm shaft, set so R-WHOOP's walls leave it on | R-WHOOP, chosen |
| whoop canopy | 0.30 N m, 20 N | two M1.4 in PP 10 mm apart | chosen |
| EPO, EPP crush | 200, 180 kPa | plateau at 25 percent strain, 30 to 35 g/L | EPO: NOVA ARCEL 730, 179 to 214 kPa at 25 percent over 30 to 35 g/L (round 5); EPP: JSP ARPRO data; R-A14-FOAM's own nose check uses 0.2 MPa |
| a foam part's crushed patch (crash-ring-crush) | the section of the ellipsoid its hull box holds at the front's depth, up to the table's area; a pole's chord 2 sqrt(2 R d - d^2) times the part's section along its axis | a curved face meets a plane or a pole at a point | derived; the shape is the hull box's, not a drawn curvature |
| the give before foam yields | crush_s / 19.7 MPa (1.0 percent for EPO) times the patch's width, plus the surface's give at the force | the foam's elastic strain at its plateau, strained about as deep as the patch is wide | Negussey and Anasthas 2001 (modulus), NOVA ARCEL 730 (plateau); the depth of the strained zone is Boussinesq's order, chosen |
| EPO's strength in the foam booms | 0.6 MPa | the outer fibre of the Cub's, Timber's and Radian's booms | the top of NOVA ARCEL 730's tensile strength, 0.465 to 0.58 MPa over 30 to 35 g/L; kept at the top while the modulus is an upper bound (round 5) |
| 11 inch plane prop | yields 8 N m, sheds a blade at 16 | 20 x 4 mm root at 150 MPa | R-PROPS (glass nylon snaps at 3 to 5 percent) |
| plane firewall | 10 N m, 400 N | ply or moulded, four screws | chosen |
| Cub panel | 40 N m | 8/6 mm carbon joiner and struts | UD carbon tube, 1,000 MPa in bending |
| Timber panel | 58 N m | 10/8 mm joiner, Z 5.80e-8 m^3 | as above |
| Skyhunter panel | 60 N m | two spars | as above |
| Radian panel | 45 N m | carbon joiner | as above |
| Bramor panel | 300 N m | carbon skins on a honeycomb core, plugged onto a carbon guide rod (UST 011) | chosen: neither the skins nor the rod is published |
| Bramor winglet | 1.5 N m, 15 N | Kevlar, 20 g, on magnets (UST 011) | chosen; a lower bound: at the 30 m/s never exceed speed (551 Pa) a 0.020 m^2 winglet at the stall of a surface of its aspect ratio, CL about 1.1, carries 12 N at about 0.1 m, 1.2 N m, so the magnets hold at least that in flight |
| hinge line | 1 N m, 40 N | foam or tape hinge pulling out | chosen |
| hook and loop | 96 N | 8 N/cm^2 over 12 cm^2 | VELCRO brand shear, about 8 N/cm^2 |
| hatch magnets | 20 N | two 6 x 3 mm N52 | supermagnete S-06-03-N: a 6 x 3 mm N45 disc pulls about 990 g (9.7 N) off steel, and slides off at about 200 g (1.9 N) |
| music wire gear, break | 3.2 mm 11.4 N m, 4 mm 22, 2 mm 2.8, 1.5 mm 1.2 | 1,600 MPa yield, plastic hinge 1.7, ultimate 1.3 x yield | ASTM A228 |
| float struts | 220 N m, 3,140 N | a 1 mm bracing wire in tension (1,570 N) on the 0.14 m strut spacing | ASTM A228; a bare 3 mm strut buckles at Euler's 348 N |
| Slow Stick stick | 23 N m | 10 mm square 6061, 0.8 mm wall, 276 MPa | ASM 6061-T6 |
| Skyhunter booms | 180 N m | two 12/10 mm carbon tubes | UD carbon tube |
| Bombshell balsa sticks (stabiliser, fin, panels, aft fuselage) | 20 MPa b h^2 / 6 each | balsa's modulus of rupture along the grain at the kit's 150 to 175 kg/m^3, 17.6 to 20.5 MPa | Wood Handbook FPL-GTR-190 Table 5-5a (21.6 MPa at specific gravity 0.16), scaled by density (Gibson and Ashby); docs/BOMBSHELL-STAGE1.md |
| Bombshell wing on its bands, engine on its firewall | 20 N and 1.9 N m; 200 N a screw, 4 N m | four #32 bands at 4.4 N; two #2 screws in 1/8 in birch ply | Treloar's rubber (Ogden's fit); Wood Handbook eq. 8-10a, 290 N an upper bound |
| a spar's bending stiffness, for its ring (round 3) | E I = 127 M r: wing1000 3 mm, Skyhunter 4 (two spars) and booms 6, Cub 4, Radian 4.5, Timber 5 mm outer radius | M = sigma I / r at the tables' 1,000 MPa, E 127 GPa | TAP Plastics pultruded carbon tube, minimum properties (flexural 127 GPa, 1,370 MPa) |
| a ring's damping | 5 to 10 percent of critical (a spar, a tube, a plug in shell), 2 to 5 (a foam boom), from half the limit to the limit | the joints dissipate, the fibre does not | Chopra, Dynamics of Structures, 4th ed., Table 11.2.1 (Newmark and Hall); Adams and Bacon 1973 for the fibre |
| a composite panel's bending stiffness, for its ring (round 5) | E I = 117 M c: Bramor 17 mm half depth, 595 N m^2, 17.5 Hz | woven carbon laminate, 70 GPa over 600 MPa | DragonPlate (R-ARM); construction from UST 011, pp. 22 and 25 |
| a foam boom's bending stiffness, for its ring (round 4) | E I = 33 M c: Cub 35 mm, Radian 20, Timber 45 mm half depth | bead foam E = 0.82 rho - 4.9 MPa, 19.7 MPa at 30 g/L, over EPO's 0.6 MPa | Negussey and Anasthas 2001, simple bending of EPS beams |
| a music wire leg's fold (round 4) | 1.7 x the yield moment over the leg's lever | a round section's plastic hinge | ASTM A228 (E 207 GPa, 1,600 MPa) |
| a blade's tip blow (round 3) | v_tip sqrt(k m_blade / 3) at its radius | the blade's spring against its own inertia | derived |
| a struck chain's hold (wing clip) | F_lim = min(F_max, M_max / a) over the joints to the root, the craft given F_lim^2 / (2 k v) | a linear ramp to the weakest joint's limit through the part's, the surface's and the chain's cantilever springs in series, 3 E I / a^3 each | derived; E I as the ring's (TAP Plastics, Negussey and Anasthas) |
| a known solid's contact (round 5) | k x dt a step while driven in, k the part's, the surface's and the struck chain's 3 E I / a^3 in series; the weakest joint lets go when k x reaches its hold | the ground's spring, and the wing clip's chain, followed step by step | derived |
| a host contact on a known solid (round 5) | the host's point, or the CG out to the airframe's reach, carried 2 cm plus the closing speed times the call's time along -n into a solid the plant knows | the host's call stands for the steps since its last, at most 20 | chosen |
| Radian boom, fin (feel round) | 12, 2.4 N m | bounded below by flight: 7.5 and 1.5 N m at 3.8 g and 22 m/s, times 1.5 | crash:core's loads of normal flight; GLIDER-STAGE1 areas |
| a panel in its own plane (feel round) | m_max_z: Skyhunter 139, Cub 121, Timber 151, Radian 56, wing 1000 171, Bramor 765, Bombshell 8.1 N m | the root's foam slab, sigma t c^2 / 6; a composite box c / (3 t) times its flapwise; balsa sticks about their own vertical axes | NOVA ARCEL 730 (0.465 MPa), JSP ARPRO (0.38 MPa), Wood Handbook balsa |
| a pack or hatch in a bay (feel round) | its strap or magnets outward, the parent's crush plateau over its face every other way | a bay's walls bear it | EPO and EPP crush, above |
| a part's skid (feel round) | the part's spring and the surface's in series, F = k x (1 + 3 (1 - e^2) / 4 v / v_in) | hysteresis damping that starts from nothing | Lankarani and Nikravesh, J. Mech. Design 112, 1990 |

"Chosen" is an engineering estimate with its reasoning in the table's
comment, not a measurement. The suite's bands are what will say whether
each is right, and the loop is where they move.

**What is still chosen** (round 5, every table). Sourced or derived from a
section and a published strength: the five inch's arm and props, the
carbon joiners and spars (wing 1000, Skyhunter, Cub, Timber; the Radian's
45 N m is on a 9 mm joiner whose wall is not written), the Skyhunter's booms,
the Slow Stick's stick, every music wire leg and float strut, the balsa
sticks, EPO and EPP crush, the rings' sections, the hatch magnets and the
bands and screws the Bombshell's rows bound. Chosen, each an estimate with
a reason and no measurement behind it:

| Airframe | Joints whose limit is chosen |
| --- | --- |
| every one | camera and whip mounts (0.8 N m, 60 N; 1.0 N m, 40 N), hook and loop's 8 N/cm^2 (a brand figure, no datasheet), every part's contact stiffness k, and most force limits f_max |
| 5 inch | motor on its arm (48 N m, two M3 pull outs), pack strap (250 N, 6 N m, free after 36 mm of slide) |
| whoop | motor (0.25 N m), prop press fit (set so R-WHOOP's walls leave it on), pack holder (5 N, free after 33 mm of slide, its drawn length), canopy (0.30 N m), nano camera (0.02 N m) |
| foam planes | firewall (10 N m), hinge lines (1 N m, 40 N), hstab and fin roots (2 to 4 N m), canopies (0.5 to 1 N m), packs (3 to 8 N m); the Timber's boom section (the Cub's is drawn; the Radian's boom and fin are bounded below by flight since the feel round, 12 and 2.4 N m) |
| Slow Stick | wing on its saddle (6 N m, 60 N), tail sheet roots (0.5 to 1 N m), motor mount (4 N m), its prop at 0.6 of the 11 inch's |
| Bramor | panels (300 N m: neither skin nor guide rod is published), elevons (3 N m), winglet magnets (1.5 N m, 15 N; bounded below by their load at the never exceed speed), motor (25 N m), pack hatch (40 N m, 400 N), chute bay lid (2 N m), gimbal (6 N m, 300 N) |
| Bombshell | the aft fuselage's halving for glue joints, the tissue hinges (0.4 N m), the prop's 150 MPa root, which is a glass filled nylon's figure for a prop the table calls unfilled (not checked against a datasheet this round) |

## 4. Free bodies

A part that breaks off, with the parts beyond it, becomes a free rigid
body: their mass and centre, a diagonal inertia (each part a point mass
plus its own box, floored at a 1 cm radius of gyration), their hull points
as samplers. It leaves with the rigid motion of its own centre. Each step:
gravity; the air's quadratic drag on its largest face (a 5 inch prop
flutters down at 2.1 m/s); a slow loss of spin; the ground plane
(impulses at its points with the ground's material, a projection out, and
resting friction at mu g with a matching spin brake, so a part on its face
stops); the declared obstacles and tree trunks; the crowns; the water
(buoyancy on its volume, the smaller of its box and its mass over its
material's density, so foam floats and a pack sinks). Spin is capped at
300 rad/s. It is at rest after 300 ms touching something at under 0.10 m/s
and 0.5 rad/s, and is no longer stepped (a settle event). On the ground
plane it must also be able to stand (the feel round): its centre, seen
along the normal, inside the hull of its points within 5 mm of the ground
(`fb_stable`). Before, both of a Skyhunter's panels came to rest on their
ends after a cartwheel, their centres 0.40 and 0.42 m up: the lying brake took
the spin off every axis where it meant the axis along the normal, the slide
brake held the centre while it swung about the edge it stood on, and a slow
body's friction took the rest. Now the spin brake is about the normal only,
and a body that cannot stand gets neither the slide brake nor the slow
body's friction, so it falls over; in the feel round's crashes every panel
now rests within 25 mm of the grass. A body lying on a box's top (a normal
within 45 degrees of up) is braked the same way as on the ground: with no
brake there, the gate clip's broken arm, which changed course with the
spin brake, rocked and crept on the gate's base for good. At most 12 move
at once; a 13th retires the one that has lain still longest, or failing
that the oldest, frozen where it is (`crash:core`: a Bramor taken apart in
the air, 12 at most, all at rest in 8 s, none under the ground).

## 5. Surfaces, trees and water

| Material | mu | mu of a face | e | stiffness N/m | blade hardness |
| --- | --- | --- | --- | --- | --- |
| default, the ground | 1.40 (0.45 and the plough with damage on) | 0.45 | 0 | 5e4 | 0.01 |
| default, an obstacle | 0.40 | 0.40 | 0.15 | 2e6 | 0.5 |
| grass | 1.40 (0.45 and the plough with damage on) | 0.45 | 0 | 5e4 | 0.01 |
| dirt | 1.00 | 1.00 | 0.05 | 2e5 | 0.3 |
| asphalt | 0.60 | 0.60 | 0.12 | 3e7 | 0.9 |
| concrete, rock | 0.42 | 0.42 | 0.15 | 5e7 | 1.0 |
| snow | 0.20 | 0.20 | 0 | 1e4 | 0.02 |
| wood | 0.50 | 0.50 | 0.12 | 5e6 | 0.6 |
| metal | 0.35 | 0.35 | 0.20 | 1e8 | 1.0 |
| pvc | 0.30 | 0.30 | 0.22 | 2e5 | 0.4 |
| foliage | 1.00 | 1.00 | 0 | 2e3 | 0.02 |
| water | 0.05 | 0.05 | 0 | 1e4 | 0.01 |
| sand | 0.60 | 0.60 | 0 | 1e5 | 0.4 |

**A face slides; an edge ploughs** (round 3). The shell's grass grips at
1.40, which is what a quad's arms and blades get ploughing into turf. A
smooth body sliding on natural grass was measured at 0.45: Linthorne and
Cooper, "Effect of the coefficient of friction of a running surface on
sprint time in a sled-towing exercise", Sports Biomechanics 12(2), 2013,
a steel runnered sled towed over a rugby pitch, the gradient of tow force
against weight up to 55 kg (they put the effective value on uneven turf
nearer 0.6). With the damage mode on, a part that meets the ground within
25 degrees of flat on one of its faces (the test the belly slam's crush
area already makes) slides at the surface's face grip, an edge, a corner
or a tip keeps the surface's mu, faded between over those 25 degrees; the
resting slide takes the grip of the part the craft lies on. Only grass and
the default ground have a measured face grip; every other surface's is
its own mu. Measured (`crash:core`): a Skyhunter slid on its belly at 4
m/s slows at 0.434 g with the mode on, 1.386 with it off.

**The grip is a slide and a plough** (feel round). The edge's 1.40 had
no source, and it stopped quads dead on grass: q5-slope kept 0.02 of its
energy through the first contact where R-A4-REBOUND puts 0.25 to 0.5,
and came apart at 421 g. A flat 0.60 on every edge kept 0.24, and lost
the planes' wing tip catches and nose ins. Grip rising with depth alone
cannot tell the two apart, because they are as deep as each other:
measured on main, a five inch's motor bells were 7 to 11 mm into the
turf on the slope and a cartwheeling Cub's wing tip 5 to 10 mm. What
separates them is the load: the motors at 170 to 365 N a contact, the
tip at 12 to 27 N. A plough's resistance is the turf's over the front of
the groove, not a multiple of the load, so it separates them.

With the damage mode on, everything on grass (and the default ground)
slides at the sled's 0.45, the resting slide too. A part that is in the
turf also gets the plough: 0.7 MPa over the groove's front, its width
times its depth. The width is the part's across the slide, and no more
than twice the depth (a box edge or corner driven in opens a V). The depth
is the deeper of where the part's point is, less the solver's 2 mm slop,
and the crater its normal load in the batch presses into the turf's
spring (a crushing nose's plateau force over 5e4 N/m). A part flat on a
face does not plough, faded over the same 25 degrees. A prop does not
plough: its box is the disc it sweeps, where the blade's front is a few
millimetres thick, and its tip stiffness is the blade's own bending,
which lifts the tip out of the turf. The plough can only stop a slide,
and a part gets it once a batch (`crash_contact_grip`, called from the
solver's friction clamp with the damage mode on only).

The 0.7 MPa is DERIVED from two studs 13 mm long, each 170 mm^2 in side
profile, under 350 N on a sand based natural turf pitch's samples. Fully
in (gravimetric moisture 21.7 and 23.0 percent) they held 370 and 430 N at
10 mm of travel. Less the stud plate's sled grip, 0.45 of 350 N, that is
212 to 272 N on 340 mm^2, 0.62 to 0.80 MPa (Clarke and Carre, "The
influence of gravimetric moisture content on studded shoe-surface
interactions in soccer", Sports Engineering 19, 2016, Table 1 and Fig. 10;
the dry samples the studs could not fully enter held 165 to 200 N). It is
consistent with a studded boot's translational traction on natural grass,
1.9 to 2.5 of a 300 N load (Thomson et al., PLOS ONE 14(4) e0216364, 2019,
S2T2 rig, SG studs 11 mm long), taking six such studs (ASSUMPTION, the
paper gives no count or area). At the ends of the source's range the
suite fails 116 checks at 0.62 MPa and 111 at 0.80, against 111 at 0.7
and 111 on main (all on 7e579b8); q5-slope keeps 0.495 at all three.

Measured, the crash suite in Node against main 39315bb: q5-slope's
retained energy 0.038 to 0.495, its peak 448 to 143 g, its rest 0.39 to
3.8 m down the slope, nothing broken (the arms, motors, pack and camera
came off before). The Skyhunter's cartwheel now goes over (minUpZ 0.62 to -1.00,
inverted). The Cub's and the Timber's now take the struck wing off. The
nose ins stop in their craters: the Cub, Radian, Slow Stick and Timber
keep -0.001 to 0.006 of their energy. Failing checks 110 to 110 (13
fixed, 13 moved out of their bands). The out-of-band moves are all in the
PR with their reasons.

The resting slide also counted the ground twice once the spring's corner
impulses carried the weight: their own Coulomb friction, and the settle's
mu g on top (0.88 g on a 0.45 face). With the mode on the settle now
carries only the share of the weight the step's ground impulses did not.
This is what round 2's "0.76 where 1.40 is expected" was measuring into:
the grip on the part hulls at main reads 1.39 (Skyhunter) and 1.16 (five
inch) with the mode on, and the normal force is not capped by the crush.

mu and e are `src/game/collide.js`'s where the shell already had them
(grass, gates, bark, walls, rock); the rest and every stiffness and
hardness are chosen, soft ground softer, and are numbers for the loop to
band. The default ground is the shell's grass; the default obstacle is a
hard generic face, since an unnamed obstacle could be anything.

**Entries.** The craft going into the water (a part other than a float
wet) or into a crown (a hull point inside one) is an event of its own,
type 8 or 9, whether or not anything breaks: the part, the point, the
surface's normal (for a crown, out from the trunk's axis), the speed the
point comes in at, and the surface, water or foliage. So the suite and the
shell learn that a craft hit water or went into a tree however many steps
they take between reads; the flags `SIM_DMG_IN_WATER` and `SIM_DMG_IN_TREE`
are only the last step's. An entry rearms after 250 ms out, so a tip
dipping into every crest of a swell is one entry. Measured (`crash:core`):
a five inch let down onto a lake reads one water entry on its pack at 2.4
m/s and no damage; a Slow Stick flown into a crown at 7 m/s reads one
entry on its prop and breaks nothing.

**Trees.** In a crown every part's hull points are dragged as twigs in a
porous medium, 0.5 rho_c A v^2 with rho_c 15 kg/m^3 on each part's area
projected on its motion, and a craft slowed under 2 m/s is held by the
branches up to 60 N per square metre of its plan area inside
(`CROWN_HOLD`): a Cub (44 N/m^2) is caught 5 m up, a 5 inch (about 116)
punches through at 8.9 m/s out of 15. Held, the branches take its
attitude too. Both constants are chosen and flagged.

**Posts that give** (the post compliance round, after #82). A race
gate's upright is a PVC pipe standing in its base, and the obstacles were
immovable and rigid: a five inch clipping one from inside the opening broke
its struck arm at 1.08 to 1.09 times its in plane limit (about 2 kN, the
feel round's `quad-gate-15` and `-30`), where the reference (R-A4-OFFSET,
q5-gate-15) keeps the frame whole. With `sim_obstacle_compliance` a
cylinder is a post: a lumped Euler Bernoulli beam of 8 nodes up its
height, clamped at its base and free at its top, each node carrying its
length of pipe, the bending force the central difference of M = E I u'',
integrated in substeps inside symplectic Euler's bound (2 per step on a
1.8 m gate upright). A part meets the post where the post has got to at its
height and at its speed there, and the impulse it takes goes into the two
nodes either side of the point. So a blow of a few milliseconds meets the
pipe near the point (at a millisecond's frequency the bending wave reaches
about a quarter of a metre), and the post then swings back on its first
mode. A single mass on the cantilever's spring was tried first: its mass
at the contact, the first mode's (Rayleigh's static shape, 0.64 kg at 1.24
m on a 1.8 m 1 inch upright), is three times the arm's, and the arm still
broke at 1.11 times its limit.

At 1 kHz a part at 15 m/s is 15 mm into the pipe before the solver sees
it, and judged on that depth against a pipe held still for the step the
arm met 2 kN in its first millisecond whatever the pipe did after. The
pipe's point, of mass m, gives F dt^2 / (2 m) under a force F held for the
step, so its inertia over the step is a compliance in series with the
part's spring (0 for every rigid solid).

A post snaps or leaves its base when the moment at its base passes
`m_free`, and then flies on with its speed, out of the world once no part
is on it. Free bodies meet a post where it stands and do not move it.
Nothing in the plant draws the bend: the shell draws the gate where it
stands.

The shell and the suite declare every upright `gate` capsule
(`src/game/crashworld.js` `postGive`): schedule 40 PVC, the pipe whose
outside diameter is nearest the drawn one over the world's gate scale
(`GATE_SCALE` 1.15 on a full size course; `src/units.js` takes a MultiGP
gate for 1 inch schedule 40), standing the length it is drawn. A micro
room is not declared: the whoop is the five inch's plant in a room 3.43
times its size, and no real pipe's give is what it meets there.

| | 1 inch sch 40 | 1-1/4 inch sch 40 |
| --- | --- | --- |
| outside diameter, minimum wall | 33.40 mm, 3.38 mm | 42.16 mm, 3.56 mm |
| mass per metre | 0.476 kg | 0.640 kg |
| E I | 103.6 N m^2 | 231.0 N m^2 |
| moment it snaps at | 113 N m | 200 N m |
| first mode on a 1.8 m upright | 2.55 Hz | 3.28 Hz |

Sources: Engineering ToolBox, "PVC and CPVC Pipes, Schedule 40" (outside
diameter, minimum wall, weight per foot); Vinidex, "PVC Properties"
(PVC-U flexural modulus 2.7 to 3.0 GPa at 1 percent strain over 100 s, the
middle, 2.85 GPa, taken; ultimate tensile strength 52 MPa). The snapping
moment is where the outer fibre reaches 52 MPa, 52 MPa I / (D / 2).
Chosen and flagged: the base is taken to hold at least that (nothing found
gives the moment a slip fit base or turf lets a post go at); PVC's
mechanical loss factor is not in either source, so the post rings with no
damping but its own reflections; the drawn upright on a full size course
is 1.15 times a real one's height with a real pipe's section, so it is a
little softer at the top than a real gate.

Measured (`crash:core`, a gate post that gives): a five inch's front right
arm into a 1.8 m 1 inch upright at 15 m/s, 1.2 m up and 8 cm in from the
centre line: held rigid the arm breaks (1.33 times, 2.9 kN); as the pipe
the arm holds, the post goes 0.10 m and snaps at its base, and the motor on
that arm lets go at 1.02 times its limit. Touched at 5 m/s the post rings
with a half period of 199 ms against Euler and Bernoulli's 196 ms, and its
swing holds within 3 percent over 3 s; cleared and declared again every 20
ms, as the shell does, the flight is the same to the bit.

The same post, rigid against giving, from 6 to 12 cm off the centre line
(scratch runs of the plant alone, the struck part and its load):

| | rigid | 1 inch sch 40 |
| --- | --- | --- |
| 15 m/s, 6 cm | arm 1.17x, 1,967 N | camera 1.14x; prop (left, later) |
| 15 m/s, 8 cm | arm 1.33x, 2,878 N | motor 1.02x, 1,836 N |
| 15 m/s, 10 cm | prop 1.02x | nothing |
| 15 m/s, 12 cm | prop 1.13x | prop 1.05x |
| 30 m/s, 6 cm | arms fr 1.20x and rr 1.25x, camera | camera 3.6x |
| 30 m/s, 10 cm | prop 1.23x | prop 1.20x |

In the shell (`npm run crash:feel`, the inside clips, CPU renderer), main
52b464c against this. At 15 m/s main breaks the struck arm at 1.08 times
(2,005 N) with the rear prop, and the pack 1.5 s later on the grass; with
the post giving nothing breaks at all, the props chip (seven chips), and
the quad goes on 15 m and comes to rest upright, the frame whole. At 30 m/s
the struck arm still breaks (1.50 times its limit at 2,187 N; main 1.09
times at 2,138 N, the direction differing), which the reference allows
("an arm possibly snapped at the motor"). An estimate, not a measurement:
a point mass of the arm's order (0.2 kg) against the pipe's local mass
(about 0.14 kg at a millisecond's frequency) through a spring of 1.5e5 N/m
peaks near 3.3 kN at 30 m/s and 1.7 kN at 15, either side of the arm's 1.9
kN in its own plane. Neither clip snaps a prop, which the reference asks
for: a blade judged by its tip's own blow is under what a PVC gate asks of
glass nylon (round 3), and a pipe that gives asks less.

In the suite (`node scripts/crash-suite.js`, Node and Chrome, against main
52b464c) 58 of 60 traces are the same to the bit; the two that move are
the five inch's gate clips, whose upright is 1 inch schedule 40 standing 3
m (the suite's staging, met 2 m up by the prop disc). q5-gate-15 keeps its
pack (mustNotBreak into its band), peaking at 251 g against 259 and at rest
in 2.37 s against 2.57; q5-gate-30 moves inside its bands (at rest in 3.43
s against 3.45), with the same breaks. No check leaves its band.

A plane's wing on a gate post changes little: a foam panel breaks at tens
of newtons, far under what the pipe's local mass holds back. A Cub at 13.5
m/s with the post 0.9 of its half span out loses its aileron against the
rigid post (2.9 times) and nothing against the giving one; at 0.6 of the
half span neither breaks anything; a Slow Stick's wing and a Skyhunter's
panel break the same either way (1.03 and 1.08 times against 1.06 and
1.10).

**Water.** With the damage mode on, every attached part that is not a
float is buoyed and dragged (Cd 1 on its projected area) at its hull points
under the waves, each a force through its joints: a float plane's wing
tip that goes in drags the nose round and loads the panel (the Timber
rolled 28 degrees at 10 m/s on the water yaws at 10.3 rad/s against 1.9
without, and tears the panel off: the float catch and cartwheel
FLOATS-STAGE1 flagged). A float driven under its own deck gets a plate's
drag on the deck (`FLOAT_BURY_CD`).

**The nose dig** (round 1). Touched down 12 to 25 degrees nose low at
14 m/s the floats used to throw the nose up (to 45 and 66 degrees), never
down. Three things in the floats' strip theory, all with the damage mode
on only, so the floats' gates keep their traces with it off
(`src/native/sim.c`, `float_apply`; docs/FLOATS-STAGE1.md derives them):

- *A dug in bow tip.* The first wet strip took its slice of water as
  pushed from nothing to its full immersion inside one strip, a vertical
  stem, which is right while the keel crosses the surface behind the tip
  and throws the bow up however it meets the water once the tip itself is
  under. With the tip under, the slice ahead of it is the rocker's line
  carried one strip on, so the bottom meets the water at its own slope and
  the rest goes over the deck, where the deck's drag (`FLOAT_BURY_CD`)
  takes it. This is what turns the dig over; without it neither aircraft
  goes over.
- *Suction on a forebody running nose low*: the other half of Zarnick's
  d/dt (m_a V_n), u m_a dV_n where the bottom rises away from the slice
  under it (V_n < 0) ahead of the step, capped at the atmosphere's
  pressure; a flat forebody at a trim of -tau takes the planing lift of
  +tau with its sign turned. Nose up (V_n > 0 all along) nothing changes.
- *Added mass*, implicit, below.

Measured (`crash:core`, the suite's own nose dig): 12 degrees nose low at
1.6 times the stall, hands off at the touch, both the Timber and the Cub
dig in and go over onto their backs (up axis to -1.00); 3 degrees nose up
at 1.1 times the stall both stay upright (up axis at least 0.96). In the
suite (Node): both nose digs now meet their flip and rest attitude bands
and fail only peak g and time or distance to rest; both capsizes, flown
with wind now, go over and fail only peak g.

Corrected in the feel round: those 12 degree flips were the tail booms'
crack cascade (#80), not the water. A 12 degree dive is shallower than the
bows' own rise (17.5 degrees on the Timber, 19.6 on the Cub), so the rise
planes and throws the nose up, and both skip and stay upright. The nose
dig is staged past the rise now, 20 and 22 degrees (docs/FLOATS-STAGE1.md,
the nose dig, derives it), where both go over with the planing pressure
along the rise's own normal; crash:core holds the 12 degree skip as its
own check.

**Added mass** (round 1). The water a float heaves against moves with
it: each wet strip carries the (pi/2) rho c^2 per metre the planing force
already uses, along the bottom's normal, a 3 x 3 added mass in heave,
roll and pitch, applied implicitly, (M + M_a) d = M d_rigid on the step's
whole change of (w, p, q), because at rest it is 1.8 times the Timber's
mass (3.47 kg against 1.93, on 1.22 m of wetted keel; the earlier
estimate was 2.70) and 1.65 times the Cub's (2.53 against 1.53), which an
explicit force would not survive. Let down 3 cm onto still water, the
heave period is 496 ms on the Timber and 487 on the Cub, the derivation's
288 and 294 ms carried by sqrt((m + m_a) / m) to 482 and 479, within 3
percent. The radiation damping was read against the bob without it
(FLOATS-STAGE1) and is left as it was: with the added mass the bob rings
a little longer, about 0.45 of each swing left at the next.

The capsize needed horizontal wind, which is in the round too (below).

**Wind** (round 1). `sim_set_wind(vx, vy, gust)`: a horizontal wind, the
air's velocity in m/s in the plant's world frame, z up, so (vx, vy) is the
way it blows; and gusts on top, their RMS per horizontal axis. Every
aerodynamic term reads the craft's velocity less the wind: the quad's
rotors and body drag, a plane's whole aerodynamics and thrust, the
Bramor's canopy, and with the damage mode on the free bodies' drag. The
gusts are a fixed sum of seven cosines per axis on the sim clock, periods
30 to 1.5 s, each carrying its band's share of a Dryden spectrum with a
4 s time scale (40 m in a 10 m/s wind), the two axes the same RMS as
MIL-F-8785C's low altitude turbulence has it and uncorrelated. It is the
same everywhere and a function of time alone: no random numbers, no host
maths, so a gust is exactly repeatable. Still air, (0, 0, 0), is the
default and a world property kept across resets like the water; with it
no step reads any of the wind, so every flight without it is bit
identical. The sea's wind, `sim_water_wind`, is a separate declaration: a
host that wants the air and the waves to agree sets both. Measured
(`crash:core`): `sim_set_wind(0, 0, 0)` flies the plain trace to the bit;
a Cub launched at 14 m/s through the air into a 5 m/s headwind flies the
same airspeed as in still air, 12.033 m/s after 4 s, to the ninth digit,
and 5 m/s less over the ground; a five inch falling at idle is carried
1.85 m/s down a 5 m/s crosswind in 4 s; the Bramor under its canopy drifts
at the wind's 6.00 m/s; gusts asked for at 2 m/s about 4 m/s read 2.05 and
2.08 RMS about 4.06 over 120 s, and the same twice.

## 6. Bit identity

`node scripts/crash-identity.js` runs every script that loads the module
three times, with the module on main before this work (base), this
module (off, the default), and this module built with the mode on by
default (on), and compares their whole output, exit code included. The
gates print their measurements to the digit and the recorded flights'
SHA-256, so the same output is the same trace.

Run 2026-09-25 against main at 8dac74f (base module sha256 afa65731...):

| Script | exit base/off/on | off == base | on == base |
| --- | --- | --- | --- |
| wing:gates | 0/0/0 | identical | identical |
| skyhunter:gates | 0/0/0 | identical | identical |
| cub:gates | 0/0/0 | identical | identical |
| glider:gates | 0/0/0 | identical | identical |
| bramor:gates | 0/0/0 | identical | identical |
| slowstick:gates | 0/0/0 | identical | identical |
| timber:gates | 0/0/0 | identical | identical |
| floats:gates | 0/0/0 | identical | differs, F2t |
| whoop:gates | 0/0/0 | identical | identical |
| wing:contact | 0/0/1 | identical | differs, nose in |
| contact:selftest | 0/0/1 | identical | differs, wall shove |
| wing:math | 0/0/0 | identical | identical |
| wing:stab, skyhunter:stab, cub:stab, glider:stab, bramor:stab, slowstick:stab, timber:stab | 0/0/0 | identical | identical |
| waves:selftest | 0/0/0 | identical | identical |
| score:selftest | 1/1/1 | identical | identical |
| lint:presets | 0/0/0 | identical | identical |
| lint:fc | 0/0/0 | identical | identical |
| wing:e2e (FDFPV_BOARD) | 0/0/0 | identical | identical |

With the mode off every one is identical to base. With it on, 21 of 24
are identical to base, which includes every recorded flight, every gate's
digest, the wing course end to end and the Node against Chrome checks
inside them. The three that move, and why:

- **floats:gates F2t**, the Timber on floats in a 0.3 m swell: its stopped
  prop's tips dip into the crests and are dragged. Nothing is damaged:
  this is a new contact, a part other than a float in the water, which the
  old plant did not have at all, and not a damage limit being crossed. The
  gate still passes (heave at 2.512 s against 2.509). It is the one place
  the rule as written and the water physics part 4 asks for disagree;
  excluding a stopped prop from the water would restore it, and is a one
  line decision for the lead.
- **wing:contact**, a nose in at 10 to 13 m/s at 45 degrees: every
  aircraft's nose crushes, as it should, and the check that the box's
  corners stay within 5 cm of the ground fails, because a crushed nose is
  in the ground by the depth it crushed and a box that has lost parts is
  no longer the aircraft.
- **contact:selftest**, a seated 5 inch shoved by a wall moving at 8 m/s:
  the props and the pack go, and the hull sits lower than the intact
  hull's rest height the check holds it to.

Both self test failures are crashes past a limit, checked against the
rigid hull that crash physics replaces; with the mode off, which is what
they run, they pass. Recorded flights with crashes in them: none of the
existing recordings has a damaging contact, so nothing was re-recorded.

Round 2 (the ground's spring), against main da32758: off is identical
on all 24. On, 19 are identical; floats:gates F1t creeps 0.040 m/s for
0.039 (its F5c is round 1's, below); whoop:gates W15's parked Skyhunter
rests 1.99 mm from its origin for 2.00; wing:contact and
contact:selftest fail with the mode on as they do on main (6 and 2
checks against 7 and 2 there: the crushed nose in the ground, the hull
slide), both checks of the rigid hull that crash physics replaces, and pass with it off, which is how
they run.

Round 3 (a face's grip, the ringing panels, every part's spring and the
blade's blow), against main 613cd0c, with FDFPV_BOARD set for wing:e2e:
off is identical on all 24. On, 18 are identical; cub:gates C21's prop
tip load reads 8.2 N for 8.7 (the gate holds); bramor:gates B12 fails
with the mode on (it passes with it off, which is how the gates run): the
Bramor, come down on its back under the canopy, now meets the grass through
its winglets' springs, their magnets let go under its 4.5 kg (1.5 N m
each, BRAMOR-STAGE1), and it rests on its fuselage at 0.111 m where the
rigid box held it on the winglet tips at 0.255; floats:gates F1t and
whoop:gates W15 as in round 2; wing:contact and contact:selftest fail 7
and 8 checks with the mode on (6 and 2 in round 2): the springs now let
every part, and so the box's corners, into the ground by their depth,
and a face slides further, both what the rigid hull checks exist to
forbid, and both pass with the mode off.

Round 4 (the foam booms' ring, the parts riding on a ring, the wire
gear's fold), against main c0cb07f, with FDFPV_BOARD set for wing:e2e: off
is identical on all 24. On, the same 18 are identical and the same six
move as in round 3 (cub:gates C21, bramor:gates B12, floats:gates F1t,
whoop:gates W15, wing:contact, contact:selftest), each against round 3's
own mode on output unchanged but for two: floats:gates' flagged, ungated
F7 nose digs (peak 20.9 to 20.6 g on the Timber, 25.0 to 28.9 on the
Cub), and wing:contact, 7 to 9 checks failing with the mode on: a Slow
Stick nosing in whose leg folds lets a box corner 0.118 m into the
ground, and a Timber after its tip strike rests on its box with its
folded legs' wheels unloaded. Both are checks of the rigid hull, as a
crush already fails them there, and both pass with the mode off.

The wing clip (a struck part's chain, and a contact on a part that has
gone), against main 5a72379: off is identical on all 24. On, every
script's output is byte for byte the output main's own mode on build
gives, the same six moving against base as in round 4: none of the gates
flies a host contact past a joint's limit or after a part has left.

The parts' hull (`sim_contact_part`), against main 4a9a30b: off is
identical on all 24. On, every script's output is byte for byte main's own
mode on build's (26 files): no gate names a part.

Round 5, ground impact (the plant meets the solids it knows, a wreck on
its side and on its back), against main d043d2a, with FDFPV_BOARD set:
off is identical on all scripts. On, set against main 0eaa193 built with
the mode on, cub:gates, bombshell:gates, floats:gates and whoop:gates are
byte for byte its output; three move, each a rigid hull check or its
known mode on failure: bramor:gates B12 still fails (11.1 deg from flat and 0.185 m up, 4.3 and
0.211 on main's mode on), wing:contact and contact:selftest fail the same
number of checks as main's mode on (14 and 8) with different depths, and
contact:selftest's "after turtle, throttle is flight again" now passes
with the mode on.

The feel round (the loads of flight, how a break is judged, a body that
rests only where it can stand), against main e731697, with FDFPV_BOARD set:
off is identical on all 26 scripts. On, 19 are identical to base; the moves
are the known mode on ones (bramor:gates B12, floats:gates F1t, whoop:gates
W15; wing:contact and contact:selftest fail 11 and 8 checks with the mode
on, 14 and 8 in round 5, both pass with it off) and two new, both the prop
tip's skid now meeting the ground through the blade's own spring:
cub:gates C21's prop tip load reads 3.2 N for 9.2 (the gate still passes),
and bombshell:gates S17's hash of another aircraft's recorded flight moves
with the mode on (it passes with it off, which is how the gates run).

**A reset is a fresh module** (the feel round's items, 2026-09-26). A five
inch reset after a violent flight flew the same throw 1e-13 m and 1e-9 m/s
off a fresh module's from the first step, then diverged; the Cub came out
identical. Found by copying a fresh module's static memory into the reset
one symbol by symbol (the linker's map names them) until the traces
matched: four pieces of Betaflight's loop state outlived `sim_reset`, all
needed together. The D term's last gyro rate (a function static in
`pidController`, so the first step's derivative kick was the last flight's),
pidRuntime's loop fields (the last setpoint, the TPA factor, anti
gravity's throttle derivative; pidInit writes only the configured ones),
the mixer's `motorMixRange` and the dynamic lowpass's update clock. Patch
0002 hoists the statics and clears them with the loop fields in
`pidResetTransientState` and a new `mixerResetTransientState`, and
`bridge_reset` clears pidData. A whole clear of pidRuntime was tried and
moved every trace: pidInit builds iterm relax's filters only when the
itermRelax a previous pidInit left there is set. The planes do not fly
Betaflight, which is why the Cub was clean. `crash:core`, "a reset after a
violent flight is a fresh module", holds every airframe and the shell's
whoop to it with the mode on (on main the five inch and both whoops fail
it); off is identical to base on all 26 identity scripts, so no gate or
recording flew through the stale state. A caller's order still matters in
one place: `sim_set_cell_voltage` after `sim_reset` leaves the first step's
loaded pack voltage at the pack's before (the plant rewrites it every
step), so a fresh module, whose pack is 4.2 V at the reset inside
`sim_init`, is matched only by a reset from 4.2 V.

`score:selftest` exits 1 on base as well as here: a failure on main that
predates this work, reported and not touched. So do slowstick:gates and
bombshell:stab on main d043d2a, with the mode off and on alike.

## 7. What the shell must build (Phase A item 4)

- Turn it on: `sim_set_damage(1)` when the pilot's damage setting is on,
  and `sim_set_part_table(1)` when it seats the whoop.
- Declare the world: `sim_set_ground_material` for the map's ground,
  `sim_contact_at_mat` instead of `sim_contact_at` with the collider's
  material (collide.js `contactMaterial` maps onto the ids, gates to pvc,
  trees to wood, walls to concrete or rock), `sim_tree_add` for trees with
  crowns, and `sim_obstacle_box` and `sim_obstacle_cylinder` for what is
  near a crash so the pieces have something to land on besides the ground.
- Draw what the module says: every part's pose from `sim_parts_state` (the
  attached ones ride the craft, with a bent arm or a knocked camera turned
  by its own orientation; the free ones fly on their own), hide or detach
  the mesh of a part whose status is not 0, dent a crushed part by its
  deformation, and spawn dust, grass, spray and splinters from
  `sim_damage_events`' points, normals, surfaces and energies.
- The FPV feed: tilt the picture by the camera part's orientation against
  the craft's when `SIM_DMG_CAMERA_KNOCKED`, switch to the chase camera on
  `SIM_DMG_CAMERA_LOST`, break the feed up on `SIM_DMG_ANTENNA_LOST`, and
  go dark on `SIM_DMG_BATTERY_EJECTED`.
- Stop faking the crash: with the mode on, `beginClipCrash`'s freeze and
  re-seat is not needed for a real crash; `sim_reset` clears the damage for
  the reset to the pad. Crashflip stays for a quad that still has its props.
- The live `sim_prop_strike` the shell calls on a hard hit takes rotor speed
  off every prop regardless; with the mode on, the plant chips and breaks
  the props that were actually struck, so the shell should stop calling it.

## 8. What the plan got wrong, found while building this

- **"Resolves parts instead of the box, bit identical until a damaging
  contact"** cannot both hold (section 2): the intact contact stays the
  box, attributed to parts; the parts' hulls take over when one leaves.
- **"Existing exports: set pose, velocity"**: there was no velocity setter
  for a quad; `sim_set_velocity` is new.
- **The whoop** the shell flies is the five inch's plant at 3.43 scale, not
  airframe 1 (also in CRASH-REFERENCES section 6); it has its own scaled
  table.
- **The 1000 mm wing has no drawn model** any more; its table is from the
  plant and WING-STAGE1.
- **Peak loads from contact duration**: crush gives foam impacts a
  duration; since round 2 the ground's spring gives every stiff part's
  ground contact one too, with the mode on (section 3).
- **"Detached parts collide with the obstacles the shell declares"**: the
  shell had no way to declare any to the plant; `sim_obstacle_*` and
  `sim_tree_add` are new.
- **The nose dig** needs the floats' bow physics, not only parts in the
  water (section 5).

## 9. The part tables as the module reads them

### 5 inch

| # | part | parent | material | mass kg | centre m | joint m | M limit N m | F limit N | k N/m | crush kPa |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | frame | root | cf-plate | 0.2980 | 0.005, -0.000, 0.008 |  |  |  | 5.0e+6 |  |
| 1 | arm rear right | frame | cf-plate | 0.0120 | -0.040, -0.040, 0.002 | -0.021, -0.021, 0.002 | 73.90 | 4000 | 3.4e+5 |  |
| 2 | arm front right | frame | cf-plate | 0.0120 | 0.040, -0.040, 0.002 | 0.021, -0.021, 0.002 | 73.90 | 4000 | 3.4e+5 |  |
| 3 | arm rear left | frame | cf-plate | 0.0120 | -0.040, 0.040, 0.002 | -0.021, 0.021, 0.002 | 73.90 | 4000 | 3.4e+5 |  |
| 4 | arm front left | frame | cf-plate | 0.0120 | 0.040, 0.040, 0.002 | 0.021, 0.021, 0.002 | 73.90 | 4000 | 3.4e+5 |  |
| 5 | motor rear right | arm rear right | alu | 0.0330 | -0.078, -0.078, 0.013 | -0.078, -0.078, 0.000 | 48.00 | 3000 | 2.0e+6 |  |
| 6 | motor front right | arm front right | alu | 0.0330 | 0.078, -0.078, 0.013 | 0.078, -0.078, 0.000 | 48.00 | 3000 | 2.0e+6 |  |
| 7 | motor rear left | arm rear left | alu | 0.0330 | -0.078, 0.078, 0.013 | -0.078, 0.078, 0.000 | 48.00 | 3000 | 2.0e+6 |  |
| 8 | motor front left | arm front left | alu | 0.0330 | 0.078, 0.078, 0.013 | 0.078, 0.078, 0.000 | 48.00 | 3000 | 2.0e+6 |  |
| 9 | prop rear right | motor rear right | nylon-gf | 0.0045 | -0.078, -0.078, 0.034 | -0.078, -0.078, 0.030 | 7.50 | 400 | 1.7e+3 |  |
| 10 | prop front right | motor front right | nylon-gf | 0.0045 | 0.078, -0.078, 0.034 | 0.078, -0.078, 0.030 | 7.50 | 400 | 1.7e+3 |  |
| 11 | prop rear left | motor rear left | nylon-gf | 0.0045 | -0.078, 0.078, 0.034 | -0.078, 0.078, 0.030 | 7.50 | 400 | 1.7e+3 |  |
| 12 | prop front left | motor front left | nylon-gf | 0.0045 | 0.078, 0.078, 0.034 | 0.078, 0.078, 0.030 | 7.50 | 400 | 1.7e+3 |  |
| 13 | battery | frame | lipo | 0.2000 | -0.012, 0.000, -0.026 | -0.012, 0.000, -0.006 | 6.00 | 250 | 3.0e+5 |  |
| 14 | camera | frame | electronics | 0.0100 | 0.092, 0.000, 0.018 | 0.085, 0.000, 0.018 | 0.80 | 60 | 3.0e+4 |  |
| 15 | antenna left | frame | wire | 0.0040 | -0.034, 0.014, 0.045 | -0.036, 0.012, 0.024 | 1.00 | 40 | 1.0e+3 |  |

### whoop, true scale

| # | part | parent | material | mass kg | centre m | joint m | M limit N m | F limit N | k N/m | crush kPa |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | frame | root | pc | 0.0037 | -0.006, -0.000, -0.006 |  |  |  | 1.0e+5 |  |
| 1 | motor rear right | frame | alu | 0.0019 | -0.023, -0.023, 0.003 | -0.023, -0.023, 0.000 | 0.25 | 30 | 5.0e+5 |  |
| 2 | motor front right | frame | alu | 0.0019 | 0.023, -0.023, 0.003 | 0.023, -0.023, 0.000 | 0.25 | 30 | 5.0e+5 |  |
| 3 | motor rear left | frame | alu | 0.0019 | -0.023, 0.023, 0.003 | -0.023, 0.023, 0.000 | 0.25 | 30 | 5.0e+5 |  |
| 4 | motor front left | frame | alu | 0.0019 | 0.023, 0.023, 0.003 | 0.023, 0.023, 0.000 | 0.25 | 30 | 5.0e+5 |  |
| 5 | prop rear right | motor rear right | pc | 0.0005 | -0.023, -0.023, 0.004 | -0.023, -0.023, 0.004 | 0.10 | 6 | 8.0e+2 |  |
| 6 | prop front right | motor front right | pc | 0.0005 | 0.023, -0.023, 0.004 | 0.023, -0.023, 0.004 | 0.10 | 6 | 8.0e+2 |  |
| 7 | prop rear left | motor rear left | pc | 0.0005 | -0.023, 0.023, 0.004 | -0.023, 0.023, 0.004 | 0.10 | 6 | 8.0e+2 |  |
| 8 | prop front left | motor front left | pc | 0.0005 | 0.023, 0.023, 0.004 | 0.023, 0.023, 0.004 | 0.10 | 6 | 8.0e+2 |  |
| 9 | battery | frame | lipo | 0.0068 | -0.003, 0.000, -0.007 | 0.000, 0.000, -0.004 | 0.10 | 5 | 5.0e+5 |  |
| 10 | canopy | frame | pc | 0.0015 | 0.009, 0.000, 0.012 | 0.000, 0.000, 0.006 | 0.30 | 20 | 5.0e+4 |  |
| 11 | camera | canopy | electronics | 0.0015 | 0.022, 0.000, 0.011 | 0.020, 0.000, 0.012 | 0.02 | 8 | 1.0e+4 |  |
| 12 | antenna left | frame | wire | 0.0003 | -0.009, 0.002, 0.017 | -0.009, 0.002, 0.006 | 0.02 | 3 | 2.0e+2 |  |

### whoop as the shell flies it (SIM_PARTS_WHOOP_SCALED)

| # | part | parent | material | mass kg | centre m | joint m | M limit N m | F limit N | k N/m | crush kPa |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | frame | root | pc | 0.1123 | -0.021, -0.001, -0.022 |  |  |  | 3.0e+6 |  |
| 1 | motor rear right | frame | alu | 0.0576 | -0.079, -0.079, 0.010 | -0.079, -0.079, 0.000 | 89.18 | 3121 | 1.5e+7 |  |
| 2 | motor front right | frame | alu | 0.0576 | 0.079, -0.079, 0.010 | 0.079, -0.079, 0.000 | 89.18 | 3121 | 1.5e+7 |  |
| 3 | motor rear left | frame | alu | 0.0576 | -0.079, 0.079, 0.010 | -0.079, 0.079, 0.000 | 89.18 | 3121 | 1.5e+7 |  |
| 4 | motor front left | frame | alu | 0.0576 | 0.079, 0.079, 0.010 | 0.079, 0.079, 0.000 | 89.18 | 3121 | 1.5e+7 |  |
| 5 | prop rear right | motor rear right | pc | 0.0152 | -0.079, -0.079, 0.012 | -0.079, -0.079, 0.012 | 35.67 | 624 | 2.4e+4 |  |
| 6 | prop front right | motor front right | pc | 0.0152 | 0.079, -0.079, 0.012 | 0.079, -0.079, 0.012 | 35.67 | 624 | 2.4e+4 |  |
| 7 | prop rear left | motor rear left | pc | 0.0152 | -0.079, 0.079, 0.012 | -0.079, 0.079, 0.012 | 35.67 | 624 | 2.4e+4 |  |
| 8 | prop front left | motor front left | pc | 0.0152 | 0.079, 0.079, 0.012 | 0.079, 0.079, 0.012 | 35.67 | 624 | 2.4e+4 |  |
| 9 | battery | frame | lipo | 0.2063 | -0.010, 0.000, -0.023 | 0.000, 0.000, -0.012 | 35.67 | 520 | 1.5e+7 |  |
| 10 | canopy | frame | pc | 0.0455 | 0.031, 0.000, 0.040 | 0.000, 0.000, 0.021 | 107.02 | 2081 | 1.5e+6 |  |
| 11 | camera | canopy | electronics | 0.0455 | 0.074, 0.000, 0.039 | 0.069, 0.000, 0.041 | 7.13 | 832 | 3.0e+5 |  |
| 12 | antenna left | frame | wire | 0.0091 | -0.031, 0.006, 0.059 | -0.031, 0.006, 0.021 | 7.13 | 312 | 6.1e+3 |  |

### flying wing 1000

| # | part | parent | material | mass kg | centre m | joint m | M limit N m | F limit N | k N/m | crush kPa |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | fuselage | root | epp | 0.1640 | 0.070, 0.000, 0.000 |  |  |  | 2.0e+5 | 180 over 36.0 cm2, 60 mm |
| 1 | wing left | fuselage | epp | 0.0900 | -0.075, 0.280, -0.000 | 0.000, 0.060, 0.000 | 21.00 | 400 | 3.0e+3 | 180 over 12.0 cm2, 100 mm |
| 2 | wing right | fuselage | epp | 0.0900 | -0.075, -0.280, -0.000 | 0.000, -0.060, 0.000 | 21.00 | 400 | 3.0e+3 | 180 over 12.0 cm2, 100 mm |
| 3 | elevon left | wing left | epp | 0.0120 | -0.185, 0.275, 0.000 | -0.160, 0.250, 0.000 | 1.00 | 40 | 2.0e+3 |  |
| 4 | elevon right | wing right | epp | 0.0120 | -0.185, -0.275, 0.000 | -0.160, -0.250, 0.000 | 1.00 | 40 | 2.0e+3 |  |
| 5 | motor | fuselage | alu | 0.0600 | -0.105, 0.000, 0.000 | -0.090, 0.000, 0.000 | 10.00 | 400 | 1.0e+6 |  |
| 6 | prop | motor | nylon-gf | 0.0080 | -0.130, -0.000, -0.000 | -0.125, 0.000, 0.000 | 3.00 | 200 | 1.5e+3 |  |
| 7 | battery | fuselage | lipo | 0.2000 | 0.060, 0.000, -0.003 | 0.060, 0.000, -0.020 | 4.00 | 96 | 3.0e+5 |  |
| 8 | camera | fuselage | electronics | 0.0100 | 0.198, 0.000, 0.020 | 0.190, 0.000, 0.020 | 0.80 | 60 | 3.0e+4 |  |
| 9 | antenna | fuselage | wire | 0.0040 | -0.060, 0.000, 0.060 | -0.060, 0.000, 0.035 | 1.00 | 40 | 1.0e+3 |  |

### Skyhunter 1800

| # | part | parent | material | mass kg | centre m | joint m | M limit N m | F limit N | k N/m | crush kPa |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | fuselage | root | epo | 0.7730 | 0.110, 0.000, -0.021 |  |  |  | 3.0e+5 | 200 over 110.0 cm2, 120 mm |
| 1 | wing left | fuselage | epo | 0.2250 | -0.022, 0.484, 0.065 | -0.040, 0.068, 0.045 | 60.00 | 600 | 3.0e+3 | 200 over 15.0 cm2, 120 mm |
| 2 | wing right | fuselage | epo | 0.2250 | -0.022, -0.484, 0.065 | -0.040, -0.068, 0.045 | 60.00 | 600 | 3.0e+3 | 200 over 15.0 cm2, 120 mm |
| 3 | aileron left | wing left | epo | 0.0200 | -0.130, 0.610, 0.063 | -0.120, 0.610, 0.060 | 1.00 | 40 | 2.0e+3 |  |
| 4 | aileron right | wing right | epo | 0.0200 | -0.130, -0.610, 0.063 | -0.120, -0.610, 0.060 | 1.00 | 40 | 2.0e+3 |  |
| 5 | boom | fuselage | cf-tube | 0.0600 | -0.410, 0.000, 0.051 | -0.030, 0.000, 0.051 | 180.00 | 1500 | 5.0e+4 |  |
| 6 | hstab | boom | epo | 0.0400 | -0.745, 0.000, 0.051 | -0.750, 0.000, 0.051 | 4.00 | 150 | 3.0e+3 |  |
| 7 | elevator | hstab | epo | 0.0150 | -0.810, 0.000, 0.051 | -0.785, 0.000, 0.051 | 1.00 | 40 | 2.0e+3 |  |
| 8 | fin left | boom | epo | 0.0150 | -0.740, 0.232, 0.124 | -0.740, 0.232, 0.050 | 2.00 | 100 | 3.0e+3 |  |
| 9 | fin right | boom | epo | 0.0150 | -0.740, -0.232, 0.124 | -0.740, -0.232, 0.050 | 2.00 | 100 | 3.0e+3 |  |
| 10 | rudder left | fin left | epo | 0.0060 | -0.815, 0.232, 0.122 | -0.790, 0.232, 0.120 | 1.00 | 40 | 2.0e+3 |  |
| 11 | rudder right | fin right | epo | 0.0060 | -0.815, -0.232, 0.122 | -0.790, -0.232, 0.120 | 1.00 | 40 | 2.0e+3 |  |
| 12 | motor | fuselage | alu | 0.1100 | -0.247, 0.000, 0.032 | -0.235, 0.000, 0.032 | 10.00 | 500 | 1.0e+6 |  |
| 13 | prop | motor | nylon-gf | 0.0200 | -0.268, 0.000, 0.032 | -0.262, 0.000, 0.032 | 16.00 | 300 | 1.1e+3 |  |
| 14 | battery | fuselage | lipo | 0.5000 | 0.100, 0.000, -0.065 | 0.100, 0.000, -0.090 | 8.00 | 144 | 3.0e+5 |  |
| 15 | canopy | fuselage | epo | 0.0300 | 0.209, 0.000, 0.045 | 0.210, 0.000, 0.043 | 1.00 | 20 | 2.0e+4 |  |
| 16 | camera right | fuselage | electronics | 0.0150 | 0.365, -0.005, -0.005 | 0.350, -0.005, -0.005 | 0.80 | 60 | 3.0e+4 |  |
| 17 | antenna right | fuselage | wire | 0.0050 | -0.150, -0.020, 0.100 | -0.150, -0.020, 0.055 | 1.00 | 40 | 1.0e+3 |  |

### Cub 1400

| # | part | parent | material | mass kg | centre m | joint m | M limit N m | F limit N | k N/m | crush kPa |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | fuselage | root | epo | 0.5020 | 0.017, 0.000, -0.053 |  |  |  | 3.0e+5 | 200 over 68.0 cm2, 100 mm |
| 1 | boom | fuselage | epo | 0.0400 | -0.477, 0.000, 0.020 | -0.350, 0.000, 0.020 | 16.00 | 300 | 2.0e+4 |  |
| 2 | hstab | boom | epo | 0.0200 | -0.512, 0.000, 0.043 | -0.540, 0.000, 0.043 | 3.00 | 120 | 3.0e+3 |  |
| 3 | elevator | hstab | epo | 0.0080 | -0.573, 0.000, 0.043 | -0.542, 0.000, 0.043 | 1.00 | 40 | 2.0e+3 |  |
| 4 | fin | boom | epo | 0.0120 | -0.549, 0.000, 0.100 | -0.560, 0.000, 0.040 | 2.00 | 100 | 3.0e+3 |  |
| 5 | rudder | fin | epo | 0.0060 | -0.609, 0.000, 0.083 | -0.578, 0.000, 0.090 | 1.00 | 40 | 2.0e+3 |  |
| 6 | wing left | fuselage | epo | 0.1500 | -0.044, 0.374, 0.105 | -0.020, 0.048, 0.099 | 40.00 | 500 | 3.0e+3 | 200 over 11.5 cm2, 100 mm |
| 7 | wing right | fuselage | epo | 0.1500 | -0.044, -0.374, 0.105 | -0.020, -0.048, 0.099 | 40.00 | 500 | 3.0e+3 | 200 over 11.5 cm2, 100 mm |
| 8 | aileron left | wing left | epo | 0.0100 | -0.119, 0.502, 0.101 | -0.090, 0.500, 0.100 | 1.00 | 40 | 2.0e+3 |  |
| 9 | aileron right | wing right | epo | 0.0100 | -0.119, -0.502, 0.101 | -0.090, -0.500, 0.100 | 1.00 | 40 | 2.0e+3 |  |
| 10 | motor | fuselage | alu | 0.1000 | 0.213, 0.000, 0.002 | 0.200, 0.000, 0.002 | 10.00 | 400 | 1.0e+6 | 200 over 68.0 cm2, 100 mm |
| 11 | prop | motor | nylon-gf | 0.0200 | 0.230, 0.000, 0.002 | 0.226, 0.000, 0.002 | 16.00 | 300 | 1.1e+3 |  |
| 12 | battery | fuselage | lipo | 0.1900 | 0.123, 0.000, -0.037 | 0.120, 0.000, -0.054 | 4.00 | 96 | 3.0e+5 |  |
| 13 | canopy | fuselage | epo | 0.0200 | -0.020, 0.000, 0.090 | -0.020, 0.000, 0.090 | 0.50 | 20 | 2.0e+4 |  |
| 14 | gear left | fuselage | wire | 0.0300 | 0.075, 0.080, -0.109 | 0.090, 0.030, -0.050 | 11.38 | 600 | 1.2e+3 |  |
| 15 | gear right | fuselage | wire | 0.0300 | 0.075, -0.080, -0.109 | 0.090, -0.030, -0.050 | 11.38 | 600 | 1.2e+3 |  |
| 16 | gear | boom | wire | 0.0060 | -0.596, 0.000, -0.030 | -0.586, 0.000, -0.021 | 1.17 | 100 | 3.0e+2 |  |
| 17 | camera | fuselage | electronics | 0.0120 | 0.163, 0.000, 0.057 | 0.155, 0.000, 0.057 | 0.80 | 60 | 3.0e+4 |  |
| 18 | antenna | fuselage | wire | 0.0040 | -0.160, 0.000, 0.105 | -0.160, 0.000, 0.070 | 1.00 | 40 | 1.0e+3 |  |

### Slow Stick

| # | part | parent | material | mass kg | centre m | joint m | M limit N m | F limit N | k N/m | crush kPa |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | fuselage | root | alu | 0.0670 | -0.309, -0.000, -0.085 |  |  |  | 5.0e+4 |  |
| 1 | boom | fuselage | alu | 0.0120 | -0.430, 0.000, -0.003 | -0.250, 0.000, -0.003 | 23.00 | 800 | 2.0e+4 |  |
| 2 | hstab | boom | epo | 0.0090 | -0.498, 0.000, 0.005 | -0.500, 0.000, 0.005 | 1.00 | 40 | 1.5e+3 |  |
| 3 | elevator | hstab | epo | 0.0040 | -0.569, 0.000, 0.005 | -0.537, 0.000, 0.005 | 0.50 | 20 | 1.5e+3 |  |
| 4 | fin | boom | epo | 0.0040 | -0.496, 0.000, 0.103 | -0.500, 0.000, 0.007 | 0.80 | 30 | 1.5e+3 |  |
| 5 | rudder | fin | epo | 0.0030 | -0.586, 0.000, 0.103 | -0.540, 0.000, 0.100 | 0.50 | 20 | 1.5e+3 |  |
| 6 | wing | fuselage | epo | 0.1000 | -0.052, 0.000, 0.094 | -0.040, 0.000, 0.028 | 6.00 | 60 | 2.0e+3 | 200 over 10.0 cm2, 100 mm |
| 7 | motor | fuselage | alu | 0.0700 | 0.279, 0.000, -0.012 | 0.286, 0.000, -0.007 | 4.00 | 150 | 5.0e+5 |  |
| 8 | prop | motor | nylon-gf | 0.0120 | 0.310, 0.000, -0.003 | 0.305, 0.000, -0.003 | 9.60 | 150 | 9.0e+2 |  |
| 9 | battery | fuselage | lipo | 0.1000 | 0.155, 0.000, -0.016 | 0.155, 0.000, -0.007 | 1.50 | 58 | 3.0e+5 |  |
| 10 | gear left | fuselage | wire | 0.0120 | 0.150, 0.045, -0.085 | 0.105, 0.000, -0.007 | 2.78 | 150 | 3.0e+2 |  |
| 11 | gear right | fuselage | wire | 0.0120 | 0.150, -0.045, -0.085 | 0.105, 0.000, -0.007 | 2.78 | 150 | 3.0e+2 |  |
| 12 | gear | boom | wire | 0.0040 | -0.568, 0.000, -0.040 | -0.568, 0.000, -0.007 | 0.60 | 40 | 2.1e+2 |  |
| 13 | camera | fuselage | electronics | 0.0080 | 0.218, 0.000, 0.017 | 0.210, 0.000, 0.006 | 0.40 | 30 | 3.0e+4 |  |
| 14 | antenna | fuselage | wire | 0.0030 | -0.100, 0.000, 0.037 | -0.100, 0.000, 0.003 | 1.00 | 40 | 1.0e+3 |  |

### Radian 2000

| # | part | parent | material | mass kg | centre m | joint m | M limit N m | F limit N | k N/m | crush kPa |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | fuselage | root | epo | 0.3990 | 0.029, -0.000, -0.053 |  |  |  | 3.0e+5 | 200 over 40.0 cm2, 80 mm |
| 1 | boom | fuselage | epo | 0.0300 | -0.540, 0.000, 0.030 | -0.300, 0.000, 0.035 | 12.00 | 250 | 1.5e+4 |  |
| 2 | hstab | boom | epo | 0.0150 | -0.696, 0.000, 0.075 | -0.700, 0.000, 0.075 | 2.00 | 80 | 3.0e+3 |  |
| 3 | elevator | hstab | epo | 0.0050 | -0.754, 0.000, 0.075 | -0.740, 0.000, 0.075 | 1.00 | 40 | 2.0e+3 |  |
| 4 | fin | boom | epo | 0.0120 | -0.665, 0.000, 0.157 | -0.620, 0.000, 0.045 | 2.40 | 80 | 3.0e+3 |  |
| 5 | rudder | fin | epo | 0.0040 | -0.808, 0.000, 0.147 | -0.790, 0.000, 0.150 | 1.00 | 40 | 2.0e+3 |  |
| 6 | wing left | fuselage | epo | 0.1350 | -0.042, 0.421, 0.061 | -0.030, 0.042, 0.030 | 45.00 | 400 | 2.5e+3 | 200 over 9.0 cm2, 100 mm |
| 7 | wing right | fuselage | epo | 0.1350 | -0.042, -0.421, 0.061 | -0.030, -0.042, 0.030 | 45.00 | 400 | 2.5e+3 | 200 over 9.0 cm2, 100 mm |
| 8 | aileron left | wing left | epo | 0.0080 | -0.112, 0.750, 0.085 | -0.100, 0.750, 0.080 | 1.00 | 40 | 2.0e+3 |  |
| 9 | aileron right | wing right | epo | 0.0080 | -0.112, -0.750, 0.085 | -0.100, -0.750, 0.080 | 1.00 | 40 | 2.0e+3 |  |
| 10 | motor | fuselage | alu | 0.0700 | 0.270, 0.000, -0.008 | 0.260, 0.000, -0.008 | 10.00 | 400 | 1.0e+6 | 200 over 40.0 cm2, 80 mm |
| 11 | prop | motor | nylon-gf | 0.0200 | 0.293, 0.000, -0.008 | 0.285, 0.000, -0.008 | 32.00 | 300 | 1.1e+3 |  |
| 12 | battery | fuselage | lipo | 0.1100 | 0.125, 0.000, -0.020 | 0.120, 0.000, -0.035 | 3.00 | 96 | 3.0e+5 |  |
| 13 | canopy | fuselage | pc | 0.0150 | 0.170, 0.000, 0.051 | 0.170, 0.000, 0.050 | 0.50 | 20 | 2.0e+4 |  |
| 14 | camera | fuselage | electronics | 0.0100 | 0.228, 0.000, 0.035 | 0.220, 0.000, 0.035 | 0.80 | 60 | 3.0e+4 |  |
| 15 | antenna | fuselage | wire | 0.0040 | -0.050, 0.000, 0.095 | -0.050, 0.000, 0.060 | 1.00 | 40 | 1.0e+3 |  |

### Timber 1500

| # | part | parent | material | mass kg | centre m | joint m | M limit N m | F limit N | k N/m | crush kPa |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | fuselage | root | epo | 0.4320 | -0.018, 0.000, -0.019 |  |  |  | 3.0e+5 | 200 over 95.0 cm2, 100 mm |
| 1 | boom | fuselage | epo | 0.0600 | -0.505, 0.000, 0.005 | -0.360, 0.000, 0.000 | 22.00 | 350 | 2.0e+4 |  |
| 2 | hstab | boom | epo | 0.0300 | -0.560, 0.000, 0.006 | -0.560, 0.000, 0.006 | 4.00 | 150 | 3.0e+3 |  |
| 3 | elevator | hstab | epo | 0.0120 | -0.635, 0.000, 0.006 | -0.605, 0.000, 0.006 | 1.00 | 40 | 2.0e+3 |  |
| 4 | fin | boom | epo | 0.0150 | -0.595, 0.000, 0.123 | -0.600, 0.000, 0.050 | 3.00 | 120 | 3.0e+3 |  |
| 5 | rudder | fin | epo | 0.0120 | -0.682, 0.000, 0.080 | -0.650, 0.000, 0.080 | 1.00 | 40 | 2.0e+3 |  |
| 6 | wing left | fuselage | epo | 0.2000 | -0.056, 0.398, 0.070 | -0.060, 0.057, 0.080 | 58.00 | 600 | 3.0e+3 | 200 over 17.0 cm2, 120 mm |
| 7 | wing right | fuselage | epo | 0.2000 | -0.056, -0.398, 0.070 | -0.060, -0.057, 0.080 | 58.00 | 600 | 3.0e+3 | 200 over 17.0 cm2, 120 mm |
| 8 | aileron left | wing left | epo | 0.0150 | -0.147, 0.520, 0.080 | -0.115, 0.520, 0.080 | 1.00 | 40 | 2.0e+3 |  |
| 9 | aileron right | wing right | epo | 0.0150 | -0.147, -0.520, 0.080 | -0.115, -0.520, 0.080 | 1.00 | 40 | 2.0e+3 |  |
| 10 | motor | fuselage | alu | 0.1800 | 0.270, 0.000, 0.000 | 0.255, 0.000, 0.000 | 10.00 | 500 | 1.0e+6 | 200 over 95.0 cm2, 100 mm |
| 11 | prop | motor | nylon-gf | 0.0250 | 0.290, 0.000, 0.000 | 0.285, 0.000, 0.000 | 16.00 | 300 | 1.1e+3 |  |
| 12 | battery | fuselage | lipo | 0.3300 | 0.150, 0.000, -0.030 | 0.150, 0.000, -0.050 | 6.00 | 144 | 3.0e+5 |  |
| 13 | canopy | fuselage | epo | 0.0300 | -0.058, 0.000, 0.065 | -0.050, 0.000, 0.065 | 0.80 | 20 | 2.0e+4 |  |
| 14 | gear left | fuselage | wire | 0.0600 | 0.055, 0.100, -0.151 | 0.070, 0.030, -0.070 | 22.22 | 800 | 1.5e+3 |  |
| 15 | gear right | fuselage | wire | 0.0600 | 0.055, -0.100, -0.151 | 0.070, -0.030, -0.070 | 22.22 | 800 | 1.5e+3 |  |
| 16 | gear | boom | wire | 0.0080 | -0.650, 0.000, -0.063 | -0.640, 0.000, -0.040 | 1.17 | 100 | 3.5e+2 |  |
| 17 | camera | fuselage | electronics | 0.0120 | 0.204, 0.000, 0.049 | 0.195, 0.000, 0.049 | 0.80 | 60 | 3.0e+4 |  |
| 18 | antenna | fuselage | wire | 0.0040 | -0.200, 0.000, 0.095 | -0.200, 0.000, 0.060 | 1.00 | 40 | 1.0e+3 |  |

### Bramor 2300

| # | part | parent | material | mass kg | centre m | joint m | M limit N m | F limit N | k N/m | crush kPa |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | fuselage | root | cf-plate | 1.5540 | 0.135, 0.000, -0.015 |  |  |  | 2.0e+6 |  |
| 1 | wing left | fuselage | cf-plate | 0.5000 | -0.243, 0.725, 0.010 | -0.080, 0.300, 0.008 | 300.00 | 2500 | 1.0e+4 |  |
| 2 | wing right | fuselage | cf-plate | 0.5000 | -0.243, -0.725, 0.010 | -0.080, -0.300, 0.008 | 300.00 | 2500 | 1.0e+4 |  |
| 3 | elevon left | wing left | cf-plate | 0.0400 | -0.370, 0.775, 0.010 | -0.350, 0.780, 0.010 | 3.00 | 150 | 5.0e+3 |  |
| 4 | elevon right | wing right | cf-plate | 0.0400 | -0.370, -0.775, 0.010 | -0.350, -0.780, 0.010 | 3.00 | 150 | 5.0e+3 |  |
| 5 | fin left | wing left | pc | 0.0200 | -0.455, 1.143, 0.132 | -0.400, 1.140, 0.014 | 1.50 | 15 | 3.0e+3 |  |
| 6 | fin right | wing right | pc | 0.0200 | -0.455, -1.142, 0.132 | -0.400, -1.140, 0.014 | 1.50 | 15 | 3.0e+3 |  |
| 7 | motor | fuselage | alu | 0.2000 | -0.332, 0.000, 0.087 | -0.320, 0.000, 0.087 | 25.00 | 800 | 1.0e+6 |  |
| 8 | prop | motor | nylon-gf | 0.0300 | -0.350, -0.000, 0.087 | -0.345, 0.000, 0.087 | 32.00 | 400 | 1.1e+3 |  |
| 9 | battery | fuselage | lipo | 1.3000 | 0.050, 0.000, -0.010 | 0.050, 0.000, -0.050 | 40.00 | 400 | 3.0e+5 |  |
| 10 | canopy | fuselage | cf-plate | 0.0400 | 0.090, 0.000, 0.066 | 0.090, 0.000, 0.065 | 2.00 | 30 | 2.0e+4 |  |
| 11 | camera | fuselage | electronics | 0.2500 | 0.361, 0.000, -0.012 | 0.330, 0.000, -0.012 | 6.00 | 300 | 1.0e+5 |  |
| 12 | antenna right | fuselage | wire | 0.0060 | -0.060, -0.041, 0.090 | -0.060, -0.041, 0.070 | 1.00 | 40 | 1.0e+3 |  |

### Timber on floats

| # | part | parent | material | mass kg | centre m | joint m | M limit N m | F limit N | k N/m | crush kPa |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | fuselage | root | epo | 0.5600 | 0.001, 0.000, -0.014 |  |  |  | 3.0e+5 | 200 over 95.0 cm2, 100 mm |
| 1 | boom | fuselage | epo | 0.0600 | -0.505, 0.000, 0.032 | -0.360, 0.000, 0.027 | 22.00 | 350 | 2.0e+4 |  |
| 2 | hstab | boom | epo | 0.0300 | -0.560, 0.000, 0.033 | -0.560, 0.000, 0.033 | 4.00 | 150 | 3.0e+3 |  |
| 3 | elevator | hstab | epo | 0.0120 | -0.635, 0.000, 0.033 | -0.605, 0.000, 0.033 | 1.00 | 40 | 2.0e+3 |  |
| 4 | fin | boom | epo | 0.0150 | -0.595, 0.000, 0.149 | -0.600, 0.000, 0.077 | 3.00 | 120 | 3.0e+3 |  |
| 5 | rudder | fin | epo | 0.0120 | -0.682, 0.000, 0.106 | -0.650, 0.000, 0.107 | 1.00 | 40 | 2.0e+3 |  |
| 6 | wing left | fuselage | epo | 0.2000 | -0.056, 0.398, 0.097 | -0.060, 0.057, 0.107 | 58.00 | 600 | 3.0e+3 | 200 over 17.0 cm2, 120 mm |
| 7 | wing right | fuselage | epo | 0.2000 | -0.056, -0.398, 0.097 | -0.060, -0.057, 0.107 | 58.00 | 600 | 3.0e+3 | 200 over 17.0 cm2, 120 mm |
| 8 | aileron left | wing left | epo | 0.0150 | -0.147, 0.520, 0.107 | -0.115, 0.520, 0.107 | 1.00 | 40 | 2.0e+3 |  |
| 9 | aileron right | wing right | epo | 0.0150 | -0.147, -0.520, 0.107 | -0.115, -0.520, 0.107 | 1.00 | 40 | 2.0e+3 |  |
| 10 | motor | fuselage | alu | 0.1800 | 0.270, 0.000, 0.027 | 0.255, 0.000, 0.027 | 10.00 | 500 | 1.0e+6 | 200 over 95.0 cm2, 100 mm |
| 11 | prop | motor | nylon-gf | 0.0250 | 0.290, 0.000, 0.027 | 0.285, 0.000, 0.027 | 16.00 | 300 | 1.1e+3 |  |
| 12 | battery | fuselage | lipo | 0.3300 | 0.150, 0.000, -0.003 | 0.150, 0.000, -0.023 | 6.00 | 144 | 3.0e+5 |  |
| 13 | canopy | fuselage | epo | 0.0300 | -0.058, 0.000, 0.091 | -0.050, 0.000, 0.092 | 0.80 | 20 | 2.0e+4 |  |
| 14 | camera | fuselage | electronics | 0.0120 | 0.204, 0.000, 0.076 | 0.195, 0.000, 0.076 | 0.80 | 60 | 3.0e+4 |  |
| 15 | antenna | fuselage | wire | 0.0040 | -0.200, 0.000, 0.122 | -0.200, 0.000, 0.087 | 1.00 | 40 | 1.0e+3 |  |
| 16 | float left | fuselage | epo | 0.1170 | -0.030, 0.180, -0.211 | 0.050, 0.090, -0.043 | 219.91 | 3142 | 1.0e+4 | 200 over 31.9 cm2, 50 mm |
| 17 | float right | fuselage | epo | 0.1170 | -0.030, -0.180, -0.211 | 0.050, -0.090, -0.043 | 219.91 | 3142 | 1.0e+4 | 200 over 31.9 cm2, 50 mm |

### Cub on floats

| # | part | parent | material | mass kg | centre m | joint m | M limit N m | F limit N | k N/m | crush kPa |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | fuselage | root | epo | 0.5680 | 0.051, 0.000, -0.027 |  |  |  | 3.0e+5 | 200 over 68.0 cm2, 100 mm |
| 1 | boom | fuselage | epo | 0.0400 | -0.477, 0.000, 0.046 | -0.350, 0.000, 0.046 | 16.00 | 300 | 2.0e+4 |  |
| 2 | hstab | boom | epo | 0.0200 | -0.512, 0.000, 0.069 | -0.540, 0.000, 0.069 | 3.00 | 120 | 3.0e+3 |  |
| 3 | elevator | hstab | epo | 0.0080 | -0.573, 0.000, 0.069 | -0.542, 0.000, 0.069 | 1.00 | 40 | 2.0e+3 |  |
| 4 | fin | boom | epo | 0.0120 | -0.549, 0.000, 0.126 | -0.560, 0.000, 0.066 | 2.00 | 100 | 3.0e+3 |  |
| 5 | rudder | fin | epo | 0.0060 | -0.609, 0.000, 0.109 | -0.578, 0.000, 0.116 | 1.00 | 40 | 2.0e+3 |  |
| 6 | wing left | fuselage | epo | 0.1500 | -0.044, 0.374, 0.131 | -0.020, 0.048, 0.125 | 40.00 | 500 | 3.0e+3 | 200 over 11.5 cm2, 100 mm |
| 7 | wing right | fuselage | epo | 0.1500 | -0.044, -0.374, 0.131 | -0.020, -0.048, 0.125 | 40.00 | 500 | 3.0e+3 | 200 over 11.5 cm2, 100 mm |
| 8 | aileron left | wing left | epo | 0.0100 | -0.119, 0.502, 0.128 | -0.090, 0.500, 0.126 | 1.00 | 40 | 2.0e+3 |  |
| 9 | aileron right | wing right | epo | 0.0100 | -0.119, -0.502, 0.128 | -0.090, -0.500, 0.126 | 1.00 | 40 | 2.0e+3 |  |
| 10 | motor | fuselage | alu | 0.1000 | 0.213, 0.000, 0.028 | 0.200, 0.000, 0.028 | 10.00 | 400 | 1.0e+6 | 200 over 68.0 cm2, 100 mm |
| 11 | prop | motor | nylon-gf | 0.0200 | 0.230, 0.000, 0.028 | 0.226, 0.000, 0.028 | 16.00 | 300 | 1.1e+3 |  |
| 12 | battery | fuselage | lipo | 0.1900 | 0.123, 0.000, -0.011 | 0.120, 0.000, -0.028 | 4.00 | 96 | 3.0e+5 |  |
| 13 | canopy | fuselage | epo | 0.0200 | -0.020, 0.000, 0.116 | -0.020, 0.000, 0.116 | 0.50 | 20 | 2.0e+4 |  |
| 14 | camera | fuselage | electronics | 0.0120 | 0.163, 0.000, 0.083 | 0.155, 0.000, 0.083 | 0.80 | 60 | 3.0e+4 |  |
| 15 | antenna | fuselage | wire | 0.0040 | -0.160, 0.000, 0.131 | -0.160, 0.000, 0.096 | 1.00 | 40 | 1.0e+3 |  |
| 16 | float left | fuselage | epo | 0.1060 | -0.090, 0.150, -0.179 | 0.025, 0.075, -0.030 | 219.91 | 3142 | 1.0e+4 | 200 over 32.0 cm2, 50 mm |
| 17 | float right | fuselage | epo | 0.1060 | -0.090, -0.150, -0.179 | 0.025, -0.075, -0.030 | 219.91 | 3142 | 1.0e+4 | 200 over 32.0 cm2, 50 mm |

### Buzzard Bombshell

| # | part | parent | material | mass kg | centre m | joint m | M limit N m | F limit N | k N/m | crush kPa |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | fuselage | root | balsa | 0.2409 | 0.074, 0.000, -0.033 |  |  |  | 1.5e+5 |  |
| 1 | boom | fuselage | balsa | 0.0350 | -0.391, 0.000, -0.005 | -0.130, 0.000, 0.000 | 18.00 | 200 | 2.0e+4 |  |
| 2 | hstab | boom | balsa | 0.0120 | -0.555, 0.000, 0.002 | -0.580, 0.000, 0.001 | 2.44 | 50 | 2.0e+3 |  |
| 3 | elevator | hstab | balsa | 0.0040 | -0.634, 0.000, 0.002 | -0.615, 0.000, 0.002 | 0.40 | 20 | 1.5e+3 |  |
| 4 | fin | boom | balsa | 0.0060 | -0.520, 0.000, 0.062 | -0.520, 0.000, 0.005 | 1.44 | 40 | 1.5e+3 |  |
| 5 | rudder | fin | balsa | 0.0040 | -0.607, 0.000, 0.060 | -0.563, 0.000, 0.060 | 0.40 | 20 | 1.5e+3 |  |
| 6 | wing | fuselage | balsa | 0.0200 | -0.033, 0.000, 0.073 | -0.030, 0.000, 0.064 | 1.90 | 20 | 2.0e+3 |  |
| 7 | wing left | wing | balsa | 0.0450 | -0.032, 0.255, 0.101 | -0.030, 0.040, 0.070 | 2.11 | 80 | 2.0e+3 |  |
| 8 | wing right | wing | balsa | 0.0450 | -0.032, -0.255, 0.101 | -0.030, -0.040, 0.070 | 2.11 | 80 | 2.0e+3 |  |
| 9 | motor | fuselage | alu | 0.0450 | 0.134, 0.000, 0.016 | 0.107, 0.000, -0.005 | 4.00 | 200 | 1.0e+6 |  |
| 10 | prop | motor | nylon-gf | 0.0060 | 0.170, 0.000, -0.005 | 0.162, 0.000, -0.005 | 5.40 | 100 | 7.0e+2 |  |
| 11 | battery | fuselage | lipo | 0.0700 | 0.100, 0.000, -0.043 | 0.100, 0.000, -0.040 | 2.00 | 58 | 3.0e+5 |  |
| 12 | gear left | fuselage | wire | 0.0060 | 0.055, 0.049, -0.105 | 0.030, 0.018, -0.065 | 1.42 | 80 | 4.7e+2 |  |
| 13 | gear right | fuselage | wire | 0.0060 | 0.055, -0.049, -0.105 | 0.030, -0.018, -0.065 | 1.42 | 80 | 4.7e+2 |  |
| 14 | gear | boom | wire | 0.0020 | -0.577, 0.000, -0.035 | -0.567, 0.000, -0.024 | 1.42 | 30 | 1.5e+2 |  |
| 15 | camera | fuselage | electronics | 0.0100 | 0.113, 0.000, 0.031 | 0.110, 0.000, 0.020 | 0.80 | 60 | 3.0e+4 |  |
| 16 | antenna | fuselage | wire | 0.0030 | -0.192, 0.000, 0.072 | -0.193, 0.000, 0.040 | 1.00 | 40 | 1.0e+3 |  |
