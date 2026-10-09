# The Hercules: the aircraft, its doors and the paradrop (contract)

The owner, 2026-10-08: "add a balsa large scale model of something like a
hercules and with the o key you open the loading doors and with every
press of p a parachute drops and keeps falling taking into account wind,
falls on the ground and stays there for the duration of the rooms
existance".

This is the contract for four stacked pull requests, written before any
of them is built. docs/HERCULES-STAGE1.md holds the aircraft's numbers
and their sources.

## What the brief said, checked against the tree

- "Following how #825 added the Extra 300 3D (airframe 29)": true, #825
  is the pattern, and 30 is the next free id (checked against every open
  pull request's branch on 2026-10-08).
- "A T-shaped tail": stale. The C-130 has a conventional tail: its
  tailplane sits on the upswept rear fuselage under a tall fin, not on top
  of the fin. It is drawn as the real one is.
- "Four props: multi-engine thrust lines, the wash over the tail,
  asymmetric thrust if one quits": the fixed wing plant has ONE thrust
  line (`thrust_static`, `thrust_z`, `torque_arm`, `pfactor`, `j_prop`).
  Four identical props turning the same way on symmetric lines sum
  exactly into it, so that is how they are modelled. An engine quitting
  makes the lines asymmetric, which the plant cannot express: not
  modelled. The plant's slipstream (`slip_r`) is one prop on the
  centreline washing the fin and the stabiliser; the Hercules' props are
  on the wing, the fin is in none of their wash and the inboard pair only
  reaches the tailplane's inner half. The plant cannot place a wash off
  the centreline, so it is left off (`slip_r` 0) and said so.
- "The doors' drag and pitch act on the plant if the plant supports a
  configurable drag/moment input (like flaps or gear)": the gear has a
  drag input (`cd_gear`) and no moment; the flaps have lift, drag and
  moment but are flaps. Neither is the ramp. PR 2 adds one small additive
  channel in the gear's pattern: `door_time`, `cd_door`, `cm_door`, zero
  on every other table, so their arithmetic is untouched (proved by every
  recorded flight's hash).
- "O and P": `main.js` gives O to the wing smoke (when fitted) and P to
  the parachute (the Bramor's recovery chute). The Hercules has neither a
  chute nor, by default, smoke; while flying the Hercules O is the doors
  and P is the paradrop, and nowhere else. On every other aircraft they
  do what they did.
- "A round cargo chute descends at about 5 to 7 m/s": a full size G-12
  cargo canopy comes down at about 8.7 m/s; at the model's scale what
  decides it is the model's load and canopy, so the rate is derived from
  them (below), and lands in the brief's band.

## What the player sees

1. **The aircraft.** A 3077 mm balsa C-130H, AeroTetris's laser cut kit,
   in the hangar from level 8 (the lead's decision): four props, high wing,
   the upswept tail with its ramp, USAF grey. Manual by default (a kit
   ships without a gyro); Stabilised and Acro are offered as any real gyro
   a builder fits.
2. **The doors (O).** O opens the rear ramp and the upper cargo door
   together; O again closes them. They take 4 s each way (the scale of
   the full size's ramp and door, which take about 15 to 20 s, would be
   too slow to read at model scale; 4 s is a model's slow servo). While
   open, the ramp's drag and its nose down moment act on the plant. The
   brief asked for a radio switch and a gamepad button "in the same
   pattern as flaps and retracts (F/G)": checked against the tree, F and G
   are keyboard only (main.js), with no pad or radio mapping, so O and P
   follow that same pattern and are keyboard only too.
3. **The paradrop (P).** Each press with the doors fully open drops one
   load off the ramp: it falls, its canopy opens, it comes down drifting
   with the wind, lands, the canopy collapses beside it and it stays. With
   the doors not open nothing drops and the HUD says "Open the doors (O)".
4. **Everyone sees the same drops.** In a room the server keeps every drop
   for the room's life and tells everyone, late joiners included; they go
   when the room closes. Solo they last for the session.
5. **The cap.** 300 drops a room (200 solo, the session's). At the cap the
   HUD says the field is full and P does nothing; no earlier drop is ever
   removed.

## Data shapes

The aircraft: `configs/airframes.js` id `hercules3077`, simId 30, its
tables in every file #825 touched (docs/HERCULES-STAGE1.md lists them).

The doors: `sim_wing_set_door(open)` and `sim_wing_door()` (0 closed to 1
open), in the gear's pattern; the shell keeps the selected state.

A drop, as the dropper sends it and the room keeps it:

```
{ id,            // the room's, an integer from 1, in order
  seat,          // the dropper's seat
  af: 'hercules3077',
  t,             // the weather clock at release, s (the room's clock, or the run's solo)
  tp,            // the dropper's plant clock at release, s (the gusts' clock)
  p: [x, y, z],  // world position at release, m (the ramp's lip)
  v: [vx, vy, vz], // world velocity at release, m/s (the aircraft's)
  air: { map, preset, seed } or null, // the weather it falls through
  rest: [x, y, z], // where it lies, as the dropper's client computed it
  wet: false }   // landed in water
```

The path between `p` and `rest` is a pure function of the record
(`src/game/paradrop.js`): only + - * /, sqrt and a fixed polynomial
cosine, so every client draws the same fall. A pilot who joins after it
landed draws it at `rest`, which the room holds, so a client's own
terrain or float rounding never moves a landed load.

Room wire: `{ type: 'drop', ...record without id }` to the room; the room
checks it, numbers it, keeps it under `drops` in its storage and sends
`{ type: 'drop', ...record }` to everyone; on a hello it sends
`{ type: 'drops', list }`. Nothing else changes in the wire.

## The physics of a drop

- **The load**: a scale A-22 cargo bag, 93 mm a side (the full size's 48
  in at 1:13.13), 250 g with its packed canopy (ESTIMATED: balsa and foam
  with ballast to fall true). Its density, 311 kg/m^3, is under water's,
  so it floats: a load landing in water stays at the surface.
- **The canopy**: an 18 in (0.457 m) flat circular canopy, the model
  rocketry size for this load. Knacke, Parachute Recovery Systems Design
  Manual (NWC TP 6575, 1991), table 5-1: a flat circular canopy's C_D0 is
  0.75 to 0.80 on its nominal area; 0.78 taken. Rate of descent at sea
  level, `v = sqrt(2 m g / (rho (C_D S0 + the box's C_D A)))` = sqrt(2
  0.25 9.81 / (1.225 (0.128 + 0.009))) = **5.40 m/s**.
- **The opening**: a static line, 0.6 m, pulls the canopy as the load
  clears the ramp; it fills in `n D0 / v` with Knacke's fill constant n
  about 8 for a solid flat canopy, and the drag area grows with the
  filled area over that time.
- **Before it opens**: the box's drag, C_D 1.05 on its face (Hoerner).
- **The air**: the same air the aircraft flies in: `makeWeather(map,
  preset, seed).at(x, y, z, t)` at the load's own position and height on
  the weather clock (the mean wind with height, the zones, fronts, the
  thermals and ridge lift as the vertical air), plus the plant's gust sum
  (plant_wind's seven cosines at the RMS the weather gives) on the gusts'
  clock. Drag is on the load's speed through that air.
- **Landing**: on the ground (`view.height`) or the water's surface; the
  canopy collapses downwind of the load over 1.5 s and stays.

## What it does NOT do

- No engine failure, no per engine throttle.
- The loads do not change the aircraft's mass or balance (the plant has
  no hold to empty); a finite hold is a product question for the owner.
- A load does not hit other aircraft, trees or buildings on the way down;
  it lands on the ground or the water under it.
- A landed load is not pushed by later wind or by other aircraft.
- Nothing is kept after the room closes or the session ends.

## PRs (stacked, in this order)

1. `w34-hercules-aircraft`: this contract and docs/HERCULES-STAGE1.md, the
   aircraft as airframe 30 in every table, its drawn model, gates.
2. `w34-hercules-doors`: the plant's door channel, O and the switches.
3. `w34-hercules-drop`: src/game/paradrop.js, P, the drawn loads, solo.
4. `w34-hercules-roomdrops`: the room keeps and sends drops; the cap's perf
   A/B. Needs a VM deploy.

## The checks

- `npm run hercules:gates`: stall, take off run, cruise and sink against
  tests/hercules-thresholds.json, each band from scripts/hercules-derive.js.
- Every recorded flight's hash unchanged (PR 2's plant change).
- `npm run paradrop:selftest`: a drop in steady wind lands where the hand
  calculation says, and the same record twice gives the same path bit for
  bit, with gusts.
- `npm run hercules:keys` (browser): O and P on the Hercules, and on the
  Bramor P still its chute and O no door.
- `npm run hercules:room` (browser, two pages and a late joiner): the same
  drops at the same places.
- lint:header, lint:dashes, lint:copy.
