# Combat drones: the 7 inch and the 10 inch, their payloads and accessories

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
- `npm run combat:gates`: both quads hover, and hover where section 1 says;
  thrust to weight, motor time constant and roll authority in bands from
  outside this repo; the five inch unmoved (its fingerprint, as
  `whoop:gates` W14); the payload makes the craft heavier, measurably: hover
  duty up and climb rate down with each heavier payload, and back to the
  bare figures with `none`; the descriptor in `configs/airframes.js` equal
  to the derive script's; and the war mapping of section 3.
