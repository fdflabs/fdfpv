# The Interior, N15: platform holds, the contract and its size

Written 2026-10-08 by lane interior2 (sub-agent "holds"). TECH-NEEDS.md
N15, MISSIONS.md 1.5. This is the contract and the design. No code ships
with it: the work is larger than one PR, and section 5 says why and how
it splits.

## 1. What the player sees

- In an ops room, a pilot holding more than one core role (Mission 2: a
  solo pilot holds `isr` on the Bramor 2300 and `recon` on the 7 inch)
  has one aircraft per role alive, launched as the role's platform.
- The aircraft not flown is on a **hold**: a fixed wing orbits a point
  (where it was when the pilot left it) at its altitude, at its loiter
  speed, on a fixed radius; a quad hovers in place.
- **Switch**: a key, a pad button, a tap on the HUD's aircraft strip.
  View and sticks move to the other aircraft where it is, at its speed,
  with no jump in position. The one left takes the hold at once.
- The HUD shows a strip, one entry per aircraft: role, platform, state
  (`flown`, `orbit`, `hover`, `down`), height, battery or fuel.
- Free flight, races and wars keep today's hot swap (`src/main.js`
  `hotSwap`): one aircraft, replaced in place. Holds are ops rooms only.

## 2. What the tree does today (verified 2026-10-08 on origin/main 6b24ab4b)

- **One plant per page.** The flight model is one WASM instance (`sim.e`,
  Betaflight plus the plant). `seatSwap` re-inits that one plant for the
  new airframe at the old pose, level on the old heading.
- **One aircraft drawn per pilot.** `src/render/shell.js` has one
  `shell.quad`; `swapCraft` replaces its group.
- **One pose per seat on the wire.** `src/share/roomwire.js` POSE is 46
  bytes with no craft index; its 8 flag bits are all taken
  (`FLAG_AIRBORNE` .. `FLAG_QUAD`). `edge/rooms/core.js` refuses any
  other length. Peers draw one aircraft per seat (`src/render/peers.js`).
- **The ops room reads one pose per seat.** `edge/rooms/ops.js`
  `seats: seat -> { track, cams }`, `poseOf(seat, t)`, `camOf(seat, t)`,
  `pilotsAt` gives one pilot per seat, and triggers and captures read it.
- **Roles already allow several per seat.** `src/share/ops/roles.js`
  `held[seat]` is a list and `active[seat]` one key of it;
  `setActive` and the room's `op: 'active'` change it, never locked.
  The client flies `opsRoleCraft(v)` (the active role's first platform)
  and `opsCrafts()` limits the pickers to it, so changing the active
  role today goes through the hot swap: the old aircraft is gone.
- **No autopilot exists** for an unattended aircraft.

## 3. Stale in the brief

- "Mission 2 in `src/share/interior/missions/interior-2.js`": not on
  origin/main; it is on the lane's branch `w34-interior2-m2`. Holds
  cannot be checked against the real Mission 2 until that merges.
- "the room sees both aircraft": the room cannot today; it needs a wire
  change (section 4.3), which is a published contract and a VM deploy.
- "a switch hands over without a jump": position and velocity, yes;
  attitude, no, as the reseat starts level (the hot swap's rule). A
  banked Bramor rolls level at the hand over unless the plant takes an
  attitude at seat time; that is a plant ABI question (section 4.2).
- `craftLimit` and `opsCrafts` are as the brief says.

## 4. Design

### 4.1 The hold is kinematic, not a second plant

A second WASM plant per held aircraft doubles memory and the 1000 Hz
step for an aircraft nobody flies. A real ISR on loiter is a flight
controller holding a circle, and what the mission needs from it is where
it is and where its camera points. So the held aircraft is a **scripted
path on the room clock**, `src/share/ops/hold.js`, pure and deterministic
(no `Math.sin`/`cos`: the orbit is stepped by an exact rotation of fixed
angle per tick, as the physics path is held to):

```
hold = { kind: 'orbit' | 'hover', c: [x, y, z], r, v, dir: 1 | -1,
         t0, p0: [x, y, z], heading0 }
holdPose(hold, t) -> { p, q, v }       // ops frame, room ms
holdOf(pose, airframe, t) -> hold      // where it was left
```

- Orbit: centre is the point a radius off the craft's side on the turn,
  radius `r = v^2 / (g tan(bankHold))`, `v` the airframe's loiter speed
  (`configs/airframes.js`, cited, not invented: for the Bramor, its
  catalogue cruise), so the circle starts tangent to the craft's track
  and its position at the hand over equals the craft's.
- Hover: `p` fixed, `v = 0`, heading kept.
- Fuel and battery drain on hold at the airframe's loiter draw, so a
  hold is not free; `down` when empty (the chute rule a Bramor has).

### 4.2 The switch

Switch = the hot swap's reseat (`seatSwap`) fed the held aircraft's
`holdPose` instead of the flown one's pose, plus: the flown one's pose
becomes a new hold (`holdOf`), drawn as a peer-style model. Position and
velocity are continuous by construction. Attitude needs
`sim_set_attitude` (or the reseat taking a quaternion) in the plant ABI;
until then the reseat is level on the held heading, as the hot swap is.

### 4.3 The wire and the room

- POSE gains a craft index: a new message type `TYPE_POSE_CRAFT` (47
  bytes: POSE plus a u8 craft slot), old POSE kept as slot 0, so older
  clients and the VM keep working (no contract broken). BATCH entries
  carry the slot. `PROTO` bumps.
- The held aircraft's pose is sent by its owner as slot 1..n, from
  `holdPose`, at a low rate (the room can also extrapolate a hold exactly
  from `hold` itself: a `hold` op sending the record is smaller and
  exact; preferred).
- `edge/rooms/ops.js` `seats` becomes `seat -> { crafts: [{ role, track,
  cams, hold }] }`; `pilotsAt` returns one entry per aircraft with its
  role, and `seen`, `region`, captures read the aircraft holding the
  role a trigger names. This is the bulk of the room change.
- Peers draw each slot (`src/render/peers.js`).

### 4.4 HUD and input

A strip in the ops HUD (`src/ui/`), one entry per aircraft; a key (the
role cycle), a pad button, a tap. Every word in `src/strings` en and es.

## 5. Size and split

L, about five PRs, in order; each with its own check:

1. `src/share/ops/hold.js` and `platforms:hold` (Node): a Bramor on hold
   stays within its radius for ten minutes of room clock; a quad within
   0.5 m; `holdPose(holdOf(pose), t0)` equals `pose` (no jump). No
   caller yet, so it lands with PR 2, not alone.
2. Client: several aircraft per seat in an ops room, the switch through
   `seatSwap`, the held one drawn. Browser check through
   `run-check-slot.sh`: a real key switches, position delta under 0.1 m.
3. Wire and room: `TYPE_POSE_CRAFT` or the `hold` op, `ops.js` per
   aircraft, `pilotsAt` per role. `ops:selftest` extended: the room sees
   both. Needs a VM deploy.
4. HUD strip and pad button, strings en and es. `interior:hud`.
5. Plant attitude at seat time (ABI), if the level hand over is felt.

Mission 2 depends on 1 to 4. Mission 1 needs none of it (one aircraft
per pilot).

## 6. What it does NOT do

- No second physics plant, no autopilot that flies the plant.
- No holds outside ops rooms; the hot swap is unchanged.
- No returning-along-path for quads (TECH-NEEDS N15 lists "hovers or
  returns"): hover only, until a mission asks for return.
