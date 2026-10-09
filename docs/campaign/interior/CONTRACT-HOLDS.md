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

- Orbit: a left turn onto a circle tangent to the craft's track, so the
  circle's first point is where the craft was and its first velocity is
  the craft's track. Speed: the craft's ground speed or its air start
  speed (`configs/airframes.js` `airStartSpeed`, 1.3 times stall, 16.9
  m/s for the Bramor), whichever is faster. Radius `r = v^2 / (g
  tan(25 deg))`, 25 degrees being inside the 30 to 45 degree bank limit
  small UAV loiter autopilots fly (Beard and McLain, Small Unmanned
  Aircraft, 2012, ch. 9): 62 m at 16.9 m/s. A fixed wing with no track
  (on the ground) is not held: `holdOf` throws.
- Hover: `p` fixed, `v = 0` (lead decision 2026-10-08: quads hover only).
- Room ms are integers; the orbit is the per ms turn raised to the
  elapsed ms by squaring, renormalised at each product.
- Fuel and battery on hold: not modelled yet (no mission asks); a hold
  lasts as long as the mission.

### 4.2 The switch

Switch = the hot swap's reseat (`seatSwap`) fed the held aircraft's
`holdPose` instead of the flown one's pose, plus: the flown one's pose
becomes a new hold (`holdOf`), drawn as a peer-style model. Position and
velocity are continuous by construction. Attitude needs
`sim_set_attitude` (or the reseat taking a quaternion) in the plant ABI;
until then the reseat is level on the held heading, as the hot swap is.

Built (PR 2): `src/main.js` PLATFORM HOLDS. The keys are `[` and `]`
(and the pad's shoulders, which already call `ui.cycleSwap`): in a live
ops match where the seat holds two roles or more, they ask the room for
the next role (`op: 'active'`) instead of cycling aircraft; the role
board's FLY THIS is the tap. The hand over happens when the room's view
says the active role changed. A role not flown yet this match is
launched where the pilot is, by the hot swap's rules. With no room clock
(no link) no hold is taken. Holds are cleared when the match is not
live.

### 4.3 The wire and the room (built, PR 3)

The binary POSE is not touched: old clients and the VM's relay keep
working. A held aircraft is one JSON ops message, sent once when it is
left, and the room makes the hold itself:

```
{ type: 'ops', op: 'hold', key, t,            // role key, room ms (integer)
  pose: { p: [x, y, z], v: [vx, vy, vz], airborne },   // ops frame
  cam: { aim: [x, y, z], tanHalf, aspect } | null }    // the ball's lock
```

- Refused (`{ error: 'hold', why }`): `role` (a key the seat does not
  hold, or the one it flies), `shape`, `pose` (more than `HOLD_NEAR` =
  100 m from the seat's newest pose), `cam`, `track` (a fixed wing in
  the air with no track). `t` within `HOLD_BACK_MS` = 5 s behind the
  clock and `AHEAD_MS` ahead.
- `m.holds: { seat: { key: { airframe, hold, cam } } }`, stored with the
  match (a VM restart keeps it). A hold stands while the seat holds its
  key and does not fly it (`liveHolds`): flown again or given up, it is
  gone.
- The view gains `holds` (the standing ones); every screen draws the
  other seats' holds from it with `holdPose`. Old clients ignore it.
- `pilotsAt` gives one entry per aircraft, each with its `role`; held
  ones carry `held: true` and the camera from their `cam` aim. Triggers
  with `roles` (`zone`, `above`, `landed`) count an aircraft for its own
  role only (`withRoles`). Downs and the boundary are the flown
  aircraft's only. Contacts, sites and `dwell` see held aircraft too.

Mission data needs no new field: `roles[].platforms[0]` is the airframe
a hold is made for.

### 4.4 HUD and input (built, PR 4)

The quiet HUD's aircraft strip (`src/ui/opshud.js` `.ops-fleet`), shown
only when the seat holds two roles or more in a live match: one button
per role, its name, its aircraft (hidden on a phone), its state
(FLYING, ORBIT, HOVER, ON THE GROUND, NOT LAUNCHED) and its height over
the ground. A tap on a row asks the room for that role. It sits under
the read panel on the right, or on the left when the right is full (a
landscape phone). Keys `[` `]` and the pad's shoulders (PR 2). Words in
`src/strings` en and es (`ops.fleet.*`). Battery and fuel are not shown:
holds do not drain (section 6).

## 5. Size and split

L, about five PRs, in order; each with its own check:

1. `src/share/ops/hold.js` and `platforms:hold` (Node): a Bramor on hold
   stays within its radius for ten minutes of room clock; a quad within
   0.5 m; `holdPose(holdOf(pose), t0)` equals `pose` (no jump). Its
   caller is PR 2.
2. Client: several aircraft per seat in an ops room, the switch through
   `seatSwap`, the held one drawn. Browser check through
   `run-check-slot.sh`: a real key switches, position delta under 0.1 m.
3. Wire and room: the `hold` op, `ops.js` per aircraft, `pilotsAt`
   per role. `ops:selftest` extended: the room sees
   both. Needs a VM deploy.
4. HUD strip with a tap per aircraft, strings en and es. `interior:hud`
   and `platforms:hold-ui`.
5. Plant attitude at seat time (ABI), if the level hand over is felt.

Mission 2 depends on 1 to 4. Mission 1 needs none of it (one aircraft
per pilot).

## 6. What it does NOT do

- No second physics plant, no autopilot that flies the plant.
- No holds outside ops rooms; the hot swap is unchanged.
- No returning along the path for quads (TECH-NEEDS N15 lists "hovers
  or returns"): hover only, the lead's decision 2026-10-08.
- No fuel or battery drain on hold.
