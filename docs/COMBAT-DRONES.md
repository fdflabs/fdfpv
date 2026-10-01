# Combat drones: the 7 inch, the 10 inch and the Striker, their payloads and accessories

Written 2026-10-01 against the owner's request of that day: "we need more
combat drones, and their models built with and without their accessories
and differing payloads", with a reference photograph of a 7 to 10 inch long
range FPV quad: a black carbon X frame, big three blade props, two strapped
Li-ion packs on top, a tall video antenna and receiver whips, the FPV camera
in a cage, and an olive drab cylindrical warhead with a pointed metal nose
slung underneath on straps.

**This file is the interface.** Two parts are built in parallel against it:
the flight side and integration (the plant, the shell, the war, the picker;
branch `combat-drones-physics`) and the models (`src/render/**`). Every id,
mass and point below is read by both. A part that finds it wrong says so in
its pull request instead of working around it, and a change lands here
first. `configs/airframes.js`, each combat quad's `combat` block, is the
copy the code reads, and `npm run combat:gates` fails if the two disagree.

This is a game. The numbers are hobby FPV build sheets and visual props, at
the level of a parts list: frame, motors, props, packs, and how heavy a slung
cylinder is. Nothing here is, or should become, real weapon engineering:
the payloads are painted cylinders with a game rule attached (the war's
`warhead`, docs/WARFARE-PLAN.md section 10a).

Section 7 is the Striker, the war's own fixed wing made playable the same
day, on a piston engine or a turbojet, with the same warheads in its nose:
the descriptor gains `propulsion` for it (section 7.3).

## 1. The two aircraft

`scripts/combat-derive.js` (`npm run combat:derive`) builds both from their
parts lists and prints every number in this section. Positions are the
plant's body frame: **x forward, y left, z up, metres from the bare
machine's centre of mass** (the plant's origin). The frame datum the parts
list is written in is the middle of the arm plate; the CG sits above it,
because the pack is on top.

| | 7 inch | 10 inch |
| --- | --- | --- |
| airframe id | `7inch` | `10inch` |
| plant (`simId`, `sim_set_airframe`) | 24 | 25 |
| frame | 315 mm motor to motor X, 5 mm arms | 420 mm motor to motor X, 6 mm arms |
| motors | 2806.5, 1300 kV, 50 g | 3115, 900 kV, 95 g |
| props | 7 x 3.5 three blade | 10 x 5 three blade |
| pack (base) | 6S1P 21700 Li-ion, 4200 mAh, 429 g, one brick | 6S2P 21700 Li-ion, 8400 mAh, 858 g, two bricks side by side |
| bare all up mass | 0.979 kg | 1.848 kg |
| CG above the arm plate | 28.7 mm | 35.0 mm |
| inertia Ixx, Iyy, Izz | 0.00411, 0.00444, 0.00752 kg m^2 | 0.0143, 0.0142, 0.0259 kg m^2 |
| motor centre (x, y) | +-0.11137 m | +-0.14849 m |
| prop radius | 0.0889 m | 0.1270 m |
| prop disc height about the CG | +0.008 m | +0.014 m |
| static thrust, full throttle, fresh pack | 45.6 N (4.75 to 1 bare) | 85.0 N (4.69 to 1 bare) |
| hover duty, bare, fresh pack | 0.31 | 0.28 |
| gravity base (the Weight slider's 100) | 1.0 g | 1.0 g |

The 7 inch with its second pack and the standard warhead is the reference
photograph; the 10 inch carries the photograph's pair of packs as its base.

Why 1.0 g and not the five inch's 1.62: the five inch's weight is a feel
knob the owner set on a machine with nothing to carry. These two carry
their weight for real (section 2), so the payload is what makes them heavy,
and a gravity multiplier on top would count it twice. The pilot's Weight
slider still works on them as on every aircraft.

Sources for the parts list: maker build sheets and stand data for 2806.5
1300 kV and 3115 900 kV motors on 6S with 7 and 10 inch three blades; the
published cell mass (about 69 g) and DC resistance (about 16 mOhm) of a high
drain 4200 mAh 21700 cell. Derivations, assumptions and the motor solve are
in the script's comments.

## 2. The combat descriptor

Each combat quad's entry in `configs/airframes.js` carries:

```js
combat: {
  frame: '7in',                // '7in' | '10in'
  payloads: [                  // what can hang under it; ids are shared
    { id, massKg, dragArea_m2, cgOffset_m: [x, y, z], warhead,
      dims: { d, len } },      // the drawn cylinder, metres
  ],
  accessories: [               // what can be bolted on; mass only flies
    { id, massKg, cgOffset_m: [x, y, z] },
  ],
}
```

and, on an aircraft pushed more than one way, `propulsion` (section 7.3);
and the pilot's choice, per airframe, in `settings.combat[airframeId]`:

```js
{ payload: 'standard' | 'wide' | 'penetrator' | 'emp' | 'none',
  accessories: ['pack2', 'cage', ...] }   // ids of this airframe's, in its order
```

A pilot who never chose has no entry, and that flies `{ payload:
'standard', accessories: [] }`.

- `dragArea_m2` is C_D times area, one number: the plant charges an add on's
  drag the same whichever way the air comes (`SIM_ADDON_CDA`,
  `src/native/sim_abi.h`), so it is the mean of the cylinder's nose on
  (Cd 0.35, a pointed nose) and its two broadside areas (Cd 0.9).
- `cgOffset_m` is where that mass sits about the bare CG.
- `warhead` is the war's name for what it does, one of `edge/rooms/war.js`
  `WARHEADS`. Every payload in v1 has one.
- `dims` is the drawn cylinder, nose included: diameter `d`, length `len`,
  hung with its top on the belly plate's underside and its axis fore and
  aft.

### 2.1 Payloads

7 inch, belly plate underside at -0.0337 m about the CG:

| id | warhead | mass kg | dragArea m^2 | cgOffset m | d, len m |
| --- | --- | --- | --- | --- | --- |
| `standard` | standard | 0.50 | 0.00969 | 0.0233, 0, -0.0637 | 0.060, 0.26 |
| `wide` | wide | 0.75 | 0.01132 | 0.0133, 0, -0.0712 | 0.075, 0.24 |
| `penetrator` | penetrator | 0.55 | 0.009829 | 0.0433, 0, -0.0587 | 0.050, 0.32 |
| `emp` | emp | 0.40 | 0.007407 | 0.0033, 0, -0.0662 | 0.065, 0.18 |

10 inch, belly plate underside at -0.041 m about the CG:

| id | warhead | mass kg | dragArea m^2 | cgOffset m | d, len m |
| --- | --- | --- | --- | --- | --- |
| `standard` | standard | 1.20 | 0.01691 | 0.0284, 0, -0.0810 | 0.080, 0.34 |
| `wide` | wide | 1.80 | 0.02012 | 0.0184, 0, -0.0910 | 0.100, 0.32 |
| `penetrator` | penetrator | 1.30 | 0.01677 | 0.0534, 0, -0.0735 | 0.065, 0.42 |
| `emp` | emp | 1.00 | 0.01290 | 0.0034, 0, -0.0835 | 0.085, 0.24 |

How each looks, for the models, all strapped on with two webbing straps
and a pin as in the photograph:

- `standard`: the photograph's. Olive drab cylinder, pointed bare metal
  nose forward, short tail fins.
- `wide`: shorter and fatter, a ribbed fragmentation sleeve, blunt nose.
- `penetrator`: long and slim, a long pointed steel nose, no fins.
- `emp`: a grey canister with banded coils round it and a flat cap; no
  nose. It reads as "not a bomb" at a glance, which is the point of it.
- `none`: nothing under the belly; the straps are drawn slack or not at
  all.

### 2.2 Accessories

| id | 7 inch | 10 inch | what it is |
| --- | --- | --- | --- |
| `pack2` | 0.429 kg at (-0.0017, 0, 0.0633) | not offered | a second 6S1P brick strapped on top of the first, in parallel |
| `cage` | 0.030 kg at (0.0833, 0, -0.0167) | 0.045 kg at (0.1034, 0, -0.0210) | a printed guard round the FPV camera |
| `lrantenna` | 0.025 kg at (-0.0717, 0, 0.0613) | 0.035 kg at (-0.0866, 0, 0.0750) | the tall video antenna on its mast and the two receiver whips |
| `gps` | 0.015 kg at (-0.0567, 0, 0.0313) | 0.020 kg at (-0.0666, 0, 0.0450) | a GPS puck on a short mast |

"Without accessories" is the bare machine: one pack (the 10 inch's one
6S2P pair), the camera in a plain mount, a stubby video antenna and short
receiver tails, the landing legs, and whatever payload is chosen.

The second pack is mass in v1: the plant flies the same pack resistance
either way, so it costs punch and buys nothing back. Paralleling cells
halves the sag in a real build; that is a plant change for a later turn.

### 2.3 What the plant gets

All of it reaches the plant through the hangar's add on path,
`sim_set_addons` (`src/native/sim_abi.h`), which this branch opens to the
quads: the payload and the accessories chosen become one lumped mass at
their mass weighted point, the CG moves to it, the motors and camera move
the other way about it, and the inertia about the new CG gains the
parallel axes terms. A lump of two masses far apart (a pack on top, a
warhead underneath) has inertia of its own about its mean point that one
point mass loses, so that spread goes in by a new additive entry,
`sim_set_addon_inertia(ixx, iyy, izz)`. The payload's drag acts at the
payload. Between runs, deterministic, in C; nothing in JS does more than
add up masses.

The hull is fixed per plant: it reaches down to the deepest payload's belly
(0.109 m on the 7 inch, 0.141 m on the 10 inch), so the craft parks on
that whether it carries one or not. **The models draw landing legs that
reach that depth**, which is what a payload drone stands on: four legs under
the arms, the payload hanging clear between them.

## 3. The war

The payload is the warhead (docs/WARFARE-PLAN.md decision 5, kamikaze
only). In a war:

- A combat quad flies the payload whose `warhead` the room has for its seat
  (`view.loadouts[seat].warhead`), so what is seen is what goes off. The
  shell seats it between runs (`src/main.js` `combatSeated`,
  `applyCombat`), so a warhead that arrives in the countdown is on the
  craft at the war's start.
- The pilot's payload choice is what the loadout says. The loadout every
  war room is told is the campaign's (`src/ui/campaign.js` polls it into
  any war room before the go), so the campaign shop's ownership holds in
  every war: a combat quad's chosen payload becomes the loadout's
  `warhead` when the pilot owns that warhead (`standard` always), and the
  equipped one otherwise (`configs/combat.js` `warPayload`).
- `none` is not a war loadout. Every defender carries a warhead, so a combat
  quad set to `none` goes to war with the equipped warhead (`standard` when
  nothing else is).
- Every other aircraft is as it was: its warhead has no mass and no model.
- The wire does not change: the loadout message and its echo are the ones
  `src/share/campaignwar.js` already sends and reads, and `edge/` is not
  touched.
- Peers: another pilot's combat quad is drawn with the payload of that
  seat's loadout in a war (`payloadForWarhead(af, view.loadouts[seat].warhead)`),
  and with `standard` outside one (a peer's choice is not on the wire).

## 4. For the models (`src/render/**`)

- Builders keyed by airframe id in `src/render/craft.js` `BUILDERS`:
  `7inch` and `10inch`. Until they exist the shell draws the five inch for
  both, which is the fallback `craftBuilderFor` already has.
- Each builder receives `opts.combat = { payload, accessories }`, the
  resolved choice (section 2), and draws exactly those ids. The resolved
  choice of the pilot's own craft is `combatFor(airframeId)` in
  `configs/combat.js`: the shell registers its source (`setCombatSource`,
  as it does `setLiverySource` and `setPartsSource`), so `buildCraft` reads
  it when its caller passes none, which `shell.swapCraft` does not. The
  shell swaps the craft when the seated choice changes (`src/main.js`
  `dressCraft`), between runs.
- Model about the bare CG, x forward, z up as above; `src/render/frame.js`
  does the one conversion to three.js.
- Scale is real: the drawn motor centres are at the table's, the discs at
  `prop_r`, the legs reach the hull depth of section 2.3, and
  `npm run check:craft` style scale checks apply as for every aircraft.

## 4a. The picker and the hangar

- The quad tab of the picker lists `7inch` and `10inch` after the five inch
  and the whoop; their notes are `carousel.note.7inch` and
  `carousel.note.10inch`.
- Customise (the picker's C, the pause menu's row) opens the hangar for a
  combat quad on a **Loadout** tab, `src/ui/hangar-combat.js`, registered
  like the Parts and Tuning tabs: the payload (none or one of the four) and
  the accessories, each with its mass, and the all up weight and thrust to
  weight they leave. A combat quad is not paintable yet, so its hangar
  opens on that tab; every other aircraft's Loadout tab says it carries no
  payload.
- Save writes `settings.combat[airframeId]`, the same per airframe slot
  shape as `settings.parts`, so a saved build (My Hangar,
  `src/ui/builds.js`) can carry it the way it carries the parts by adding
  `combat` to its fit. A save for the quad in the air refits it.
- The hangar's stand reads the unsaved choice from the tab's frame hook,
  `frame().hangar.tabs.loadout = { id, combat }`, for the models' preview.

## 5. What a payload does, measured

`npm run combat:gates` on the module, fresh pack, no accessories. Hover is
the stick that holds a hover; climb is the height gained in two seconds of
full throttle from it.

| payload | 7 inch hover | 7 inch climb | 10 inch hover | 10 inch climb |
| --- | --- | --- | --- | --- |
| `none` | 0.309 | 26.3 m | 0.278 | 23.7 m |
| `emp` | 0.377 | 20.9 m | 0.363 | 17.8 m |
| `standard` | 0.393 | 19.3 m | 0.381 | 16.5 m |
| `penetrator` | 0.400 | 18.3 m | 0.389 | 15.6 m |
| `wide` | 0.434 | 16.8 m | 0.431 | 13.8 m |

The 7 inch with its second pack, every accessory and the wide warhead has
2.4 times the bare machine's roll inertia; the spread entry is most of
that. Level speed at full throttle, bare: 28.3 m/s and 27.6 m/s.

## 6. Checks

- `npm run combat:derive`: prints sections 1 and 2.
- `npm run combat:shell`: the real shell seats a stored loadout, the
  Loadout tab saves and refits one, a reset keeps it.
- `npm run campaign:check`: in a real room, a combat quad's payload is the
  loadout's warhead when owned and the equipped one when not.
- `npm run combat:gates`: both quads hover, and hover where section 1 says;
  thrust to weight, motor time constant and roll authority in bands from
  outside this repo; the five inch unmoved (its fingerprint, as
  `whoop:gates` W14); the payload makes the craft heavier, measurably: hover
  duty up and climb rate down with each heavier payload, and back to the
  bare figures with `none`; the descriptor in `configs/airframes.js` equal
  to the derive script's; and the war mapping of section 3.

## 7. The Striker, the fixed wing

Added 2026-10-01 against the owner's request of that day: "remember to
also include the fixed wing models to our war aircraft, make them
playable and with the hud also", with the reference sheets of the war's
attacker: a pusher piston engine on a wooden two blade prop behind a
cylindrical fuselage, a cranked delta with a fin at each tip; and the
same airframe on a small turbojet. Until then it was the raid's enemy
alone. It is now a playable fixed wing that a pilot can pick, load and
take to war as a defender, ramming with the warhead in its nose.

`scripts/combat-derive.js` (`npm run combat:derive`, after the quads)
derives everything below from a parts list and the drawn planform, and
prints it. The drawing is `src/render/strikercraft.js`
(docs/COMBAT-DRONES-MODELS.md section 2), which the war's attacker and
the flown aircraft share.

### 7.1 The scale, and why

The drawn machine's, which is the war's: **2.50 m over the wingtip fins,
2.67 m from the nose to the prop's hub**, a 0.34 m fuselage and a 0.76 m
prop. That span is the full size attacker's published one, but the build
is not the full size machine: it is a giant scale hobby airframe of
glass and carbon over foam, on a 110 cc boxer twin or a 140 N class
turbojet, about 14 kg. At the original's 200 kg the wing loads to about
90 kg/m^2 and stalls near 35 m/s, which no rail in this game launches and
no pilot lands; at 14 kg it stalls between 10.5 and 14 m/s with any
warhead, leaves a 3 m rail at 19 m/s, and flies the air the Bramor (2.3
m, 4.5 kg) and the combat quads fly. Sizing it to the drawing keeps one
aircraft for the war's renderer, the shell, the plant, the crash parts
and the mid air referee, with nothing to reconcile.

### 7.2 Ids

| | |
| --- | --- |
| airframe id | `striker2500` (a fixed wing; the picker's Plane tab; the Free flight card) |
| plants (`sim_set_airframe`) | 27 on `prop`, 28 on `jet`; 26 is left for the third combat quad |
| `combat.frame` | `striker` |
| propulsion ids | `prop`, the 110 cc boxer twin and the 30 x 14 wooden pusher; `jet`, the 140 N class turbojet in its nacelle. `prop` is the default |
| payload ids | `standard`, `wide`, `penetrator`, `emp`, each the war's warhead of that name (section 3); `none` |
| accessory ids | `whip`, the whip antenna on the spine (the drawing's `antenna`) |
| tunes | `striker-stab`, `striker-acro` (the default), `striker-manual` |
| launch | `STRIKER_RAIL` in `configs/airframes.js`: a 3 m rail at 15 deg, the CG 1.2 m up on its shoe, let go at 19 m/s |

The pilot's choice is the quads' slot with one more key:
`settings.combat.striker2500 = { payload, accessories, propulsion }`. A
pilot who never chose flies `{ payload: 'standard', accessories: [],
propulsion: 'prop' }`.

### 7.3 The descriptor's propulsion

An aircraft pushed more than one way carries `combat.propulsion`, its
first entry the default:

```js
propulsion: [
  { id, simId,        // the plant this engine is: mass, CG, inertia, thrust law
    grams,            // its bare all up mass, fuel full
    thrustToWeight,   // static, bare
    stall,            // m/s, trimmed, with the standard warhead
    topSpeed,         // m/s, level at full throttle, bare
    voice,            // src/render/audio.js: 'glow2' or 'edf'
    cgDz_m,           // its CG's height over the first one's
    drawing_m },      // the drawing's origin about its CG, body frame
],
```

Each propulsion is its own plant, because the engine is a tenth of the
mass at the tail and its own thrust law, so `configs/combat.js`
`combatSimId(af, choice)` names the plant the shell seats, and the shell
seats it again between runs when the Loadout tab changes it, as it does
for an airframe. The row's own `simId`, `grams`, `stall`, `topSpeed`,
`thrustToWeight` and `voice` are the first propulsion's. The payload and
accessory points are about the first propulsion's CG; `cgDz_m` moves
them onto another's (`configs/combat.js` `masses`).

### 7.4 The aircraft

| | `prop` (plant 27) | `jet` (plant 28) |
| --- | --- | --- |
| engine | 110 cc boxer twin, 8.2 kW, 3.0 kg with ignition and mufflers; 30 x 14 wood at 5,000 rpm static | 140 N class turbojet, 1.36 kg, 125,000 rpm at full, in a 0.24 m nacelle on the tail |
| fuel | 2.5 l gasoline, its tank at 0.55 m from the nose | 4 l kerosene, its tank at 1.26 m, where it balances the CG |
| nose ballast | 0.323 kg (a pusher's tail is heavy) | none |
| bare all up mass | 13.825 kg | 13.492 kg |
| CG | 1.546 m aft of the nose, 20 mm under the fuselage's axis | the same distance aft, 10 mm under the axis |
| static margin, bare | 0.040 of the MAC (1.12 m) | the same |
| inertia Ixx, Iyy, Izz | 1.646, 9.498, 11.03 kg m^2 | 1.619, 5.592, 7.064 kg m^2 |
| static thrust, bare thrust to weight | 283 N, 2.09 | 140 N, 1.06 |
| CD0 | 0.0238 (the uncowled twin 0.020 m^2 of drag area) | 0.0190 (the nacelle 0.010 m^2) |
| cruise, 60 percent of the stick | 18.3 m/s | 44.9 m/s |
| top speed, level, bare | 26.9 m/s, just over the raid's Strikers' 26.6 | 66.3 m/s |
| best climb, bare | 13.8 m/s at 14.2 m/s | 25.2 m/s at 38 m/s |
| trimmed stall, bare and with the standard warhead | 10.5 and 12.5 m/s | 11.1 and 13.3 m/s |
| roll, full stick at cruise | 80 deg/s (7 deg of aileron) | 114 deg/s (4 deg) |
| engine response | the stick's, at once; idles at a quarter of its rpm | spools idle to 90 percent of full in 4.5 s; idles at 4 percent of full thrust, never stops; run up to full on the rail before the shot |

The wing, both: the drawing's cranked delta, 2.47 m tip to tip at the
fins' roots, 2.29 m^2 with the fairing, aspect ratio 2.66; the outer
leading edge swept 46.5 deg; elevons of 0.15 m chord from 0.32 to 1.12 m
out; a 0.42 m fin at each tip, 0.30 m over the wing and 0.12 m under,
with a 0.07 by 0.20 m rudder on the yaw stick. Its derivatives are a
vortex lattice's on that planform and those fins (`scripts/lib/lattice.js`,
the Zagi's, checked there on two textbook wings and against AVL), with
the fuselage's Munk moment and side force added from Raymer; its CL max
an MH 60 class reflexed section's, ESTIMATED; its drag a component build
up, ESTIMATED. Each build's elevons are rigged to trim with the standard
warhead at its own cruise, so the jet, which cruises two and a half times
as fast on the same wing, has the smaller reflex. The derive script's
comments carry every source and say which numbers are estimates.

### 7.5 The warheads and the whip

The warheads ride in the nose bay behind the cap's seam, on the axis,
each ending at the bay's bulkhead 0.50 m from the nose. Under the
airframe's own cap they add no drag; they are mass and inertia, a long
way forward. A full size attacker's warhead is its counterweight, and so
here: bare the Striker is stable but light in pitch (a 4 percent margin),
and each warhead adds margin, nose heaviness and stall speed.

| id | warhead | mass kg | cgOffset m (about the prop's CG) | d, len m |
| --- | --- | --- | --- | --- |
| `standard` | standard | 1.5 | 1.196, 0, 0.0196 | 0.26, 0.30 |
| `wide` | wide | 2.2 | 1.186, 0, 0.0196 | 0.28, 0.28 |
| `penetrator` | penetrator | 1.8 | 1.246, 0, 0.0196 | 0.16, 0.40 |
| `emp` | emp | 1.1 | 1.156, 0, 0.0196 | 0.26, 0.22 |

| id | mass kg | at m (about the prop's CG) |
| --- | --- | --- |
| `whip` | 0.06 | 0.446, 0, 0.2196 |

What each costs, from the derivation and flown on the module
(`npm run combat:gates`):

| load | prop stall | prop climb | jet stall | jet climb |
| --- | --- | --- | --- | --- |
| `none` | 10.5 m/s | 13.8 m/s | 11.1 m/s | 25.2 m/s |
| `emp` | 12.0 | 12.7 | 12.7 | 23.2 |
| `standard` | 12.5 | 12.3 | 13.3 | 22.6 |
| `penetrator` | 13.0 | 12.0 | 13.8 | 22.1 |
| `wide` | 13.4 | 11.7 | 14.2 | 21.5 |

Its top speed barely moves with a warhead (it is mass, not drag), and
never rises. In a war its payload is the room's warhead for its seat, as
a combat quad's is (section 3); `none` goes to war with the equipped one.

### 7.6 Taking off and coming down

It is shot off a rail, as the full size machine is (that one on a
booster): parked, the shell stands it on the rail's pose, and throttle or
L lets it go at 19 m/s along its nose, 1.3 times the trimmed stall of its
heaviest warhead on the jet, the faster stalling of the two. The turbojet
leaves at full power, run up on the rail. It comes down on its belly skid,
251 mm under the CG (261 on the jet), which the plant parks it on; the
pusher's lower blade hangs 108 mm under the skid, so a landing with the
piston engine turning breaks the prop, as on any pusher this size. No
parachute.

### 7.7 For the drawing and the shell

- `src/render/craft.js` draws `striker2500` with
  `buildStrikerCraft({ propulsion, antenna })` from the seated choice, every
  part moved by the propulsion's `drawing_m` (the drawing is about the
  war's pose point, 0.146 m ahead of the CG; the plant's origin is the CG),
  through `src/render/frame.js` `bodyPosToModel`.
- The warheads are inside the nose, so there is no payload to draw; a
  model that wants to show which one is carried may mark the nose cap.
- `STRIKER_CAMERA`, the FPV camera, is the plant's camera point in the
  nose. Having a `combat` block, the Avionics HUD is its default as it is
  the combat quads'.
- The Loadout tab (section 4a) shows its engines first, then the warheads
  and the whip, with the engine's own mass, top speed and thrust to
  weight.

### 7.8 Known limits

- Another pilot's Striker is drawn on its first propulsion: the choice is
  not on the wire, as a peer's payload outside a war is not.
- The rooms' referee and the records know the airframe id and not the
  propulsion: both engines meet the war with the piston one's part boxes
  (`configs/hulls.js`), and share its lap records.
- The shell's rest height is the row's, the piston one's 251 mm; the jet's
  skid is 10 mm lower about its own CG, which the plant takes up at rest.
- The tunes go by the row's plant and fly the jet's alike.

### 7.9 Checks

- `npm run combat:derive`: prints sections 7.1 to 7.5.
- `npm run combat:gates`: for each propulsion, the plant's mass and
  inertia the derivation's; top speed and cruise within 3 percent of it,
  and the table's top speed what it flies; the piston one keeps up with
  the raid's Strikers and the jet runs them down at twice their speed;
  every load's trimmed stall within 6 percent and its climb within 12; a
  heavier warhead climbs less, stalls faster and is never faster; the
  rail's release 1.3 times every load's stall; the jet's spool, idle to 90
  percent, in 2.5 to 5 s, and its idle held with the stick closed; the
  piston's thrust the stick's; off the rail and climbing, and a glide at
  idle to rest on the skid, upright; and the war's mapping and every
  warhead carried.
- `npm run combat:shell`: the Striker stored on its jet is seated on plant
  28 at its mass and voice; its Loadout tab offers both engines, every
  warhead and the whip; choosing the piston there and saving refits it on
  plant 27.
- `npm run war:harness`: the head on pass with the Striker as the
  defender, inside and outside BLAST_M, over random links.
- `npm run check:craft`: the drawn Striker against its collider and hull,
  the prop's lower blade pinned at its 108 mm under the skid.
- `npm run check:combat-models`: its propulsion and accessory ids the
  drawing's.
