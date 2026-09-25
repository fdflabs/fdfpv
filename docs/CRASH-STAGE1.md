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

**Status of this file.** Section 1, the readback ABI, is complete and is
what the suite and the shell wire against. The later sections are filled
in as each stage lands; a section that says "pending" is not built yet.

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
  antenna), the energy it has absorbed, kind and parent.
- `sim_damage_events(out[max x 16], max)`: the events since the last call,
  oldest first, returns the count. Each: step, part, type (1 break, 2
  crush, 3 chip, 4 bend, 5 knock, 6 crack, 7 settle), the load over the
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

### Surfaces and the world

- `sim_set_ground_material(mat)`, `sim_contact_at_mat(n, mat, p, vs, r)`,
  `sim_material_info(mat, out[4])` (mu, restitution, stiffness, hardness).
  Materials `SIM_SURF_*`: default (today's contact), grass, dirt, asphalt,
  concrete, rock, snow, wood, metal, pvc, foliage, water, sand. Where the
  shell already names a material (`src/game/collide.js`
  `contactMaterial`, `GROUND_MU`, `GROUND_E`) the module's mu and e are the
  same numbers.
- `sim_obstacle_box`, `sim_obstacle_cylinder`, `sim_obstacle_clear`: what
  the free bodies meet, which the shell does not track. The craft itself
  still meets the world through the shell's `sim_contact_at`.
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

Pending in this file; the tables are in `src/native/crash_parts.h` with a
comment per limit, and `scripts/crash-core-selftest.js` checks that each
airframe's masses sum to its mass with the CG at the origin (the root's
mass and centre are the residual, by construction).

## 3. Damage

Pending.

## 4. Free bodies

Pending.

## 5. Surfaces, trees and water

Pending.

## 6. Bit identity

Pending: `scripts/crash-identity.js` output.
