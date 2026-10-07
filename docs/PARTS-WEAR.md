# Parts bench and wear: the contract (Wave 4 items 24 and 27)

The owner, 2026-10-05 and 2026-10-07: the hangar should be a place, not a
settings screen; parts wear and need repair (FULL PART WEAR, which reverses
the old "no component damage" non-goal); realism lives in career and war
only, and casual modes keep fresh parts and unlimited packs. This file is
what the player sees, the data, where it is stored and synced, what it
builds on, what it does not do, and the checks that prove each piece. It is
written before the code, and each PR that builds a piece cites its section.

## What exists already (verified against main, 736df09e)

- `src/ui/hangar-parts.js`, the Parts tab: prop cards, add-on cards, the
  last crash's broken parts (repair, or tape a panel), and a stats block
  (added grams, drag, thrust, CG shift). Planes only (`PROPS` in
  `configs/hangar-parts.js`).
- `configs/power.js`: each plane's power options and packs, `powerBlock`
  builds the `sim_set_power` block (mass, cells, R_CELL, PACK_C, thrust,
  pitch speed, current). The Bramor 500 kV option (#697) is the pattern
  for a change that reaches the plant: data in, block out, plant untouched.
- `configs/motors.js`: a quad's motor, prop and pack, `motorsBlock` and
  `propPackBlock` (KT, KQ, R_CELL; a quad's pack does not drain, so a
  quad has no capacity input).
- `configs/power-estimates.js` (generated): top speed and minutes per
  option and pack; `motorStats` for a quad's T/W, hover and full minutes.
- `src/render/hangar-exploded.js`: the Power tab's exploded view (prop,
  motor, pack apart). Not clickable.
- `src/ui/builds.js`, My Hangar: named builds whose FIT is livery, power,
  parts, tuning and combat. Synced as the `builds` section.
- `src/replay/journal.js` records every `sim_set_power`,
  `sim_set_motors`, `sim_set_prop_pack` block's doubles.
- `src/share/progressmerge.js` `SYNCED_SECTIONS`: what follows the account.

## Item 24: the parts bench

What the player sees, on the Parts tab (and the Power tab's cards):

1. **Before equipping.** Pointing at (hover or keyboard focus) any prop,
   add-on, power option or pack card shows the change it would make, next
   to today's number: weight (g), thrust to weight, flight time (min) and
   handling. Handling is one real number the game computes: wing loading
   (g/dm^2) for a plane, the motor's time constant (ms) for a quad. Each
   delta is green or red by whether it helps; nothing is equipped until the
   card is pressed. Numbers come from the same functions the seat uses
   (`powerBlock`, `partsSummary`, `ESTIMATES`, `motorStats`), never a
   second model.
2. **Clickable exploded view.** The exploded view also opens on the Parts
   tab, and each drawn part (prop, motor, pack, each add-on) is a target:
   pointing lights it and its card, pressing scrolls to and focuses its
   card. Built in `src/render/hangar-exploded.js` and `hangarstage.js` with
   a raycast against the parts it already draws; the UI side stays three.js
   free (a `pick(partKey)` callback).
3. **Loadout presets ARE builds.** My Hangar already stores a named fit
   with the parts and power in it and syncs it. The bench gets "Save as
   build" and a row of this family's builds to apply, not a second store.
   (Lead decision, cheap and reversible: a separate preset store would be a
   second copy of `builds`.)

Not in item 24: new props or motors, paint, the walkable bench itself
(the hangar lane calls `openHangarTab('parts')`).

## Item 27: realism in career and war

### Where it applies

A flight is a REALISM flight when it is a campaign mission
(`src/game/campaign.js`, the Interior and the war campaign) or a war room.
Everything else (free flight, races, Flight Club, training, casual rooms)
seats fresh parts and a full pack and never accrues wear. One function,
`realismFlight(context)`, decides it, so no caller guesses.

### Data (stored player data, versioned)

Two new synced sections, `keyed`, merged per key like `parts`:

```
settings.packs[packId] = { v: 1,           // per pilot, shared by airframes
  spec: '4s5000',     // cells, capacity, 'li' for Li-ion: configs/wear.js packSpec
  cycles: 37,         // discharges, integer
  health: 912,        // per mille, 1000 new, integer
  charge: 'full' | 'storage' | 'flat',
  from: 'sky1800' | null }                 // the airframe a starter pack came with
settings.wear[airframeId] = { v: 1,
  motor: 1000, prop: 1000,                 // per mille, integers
  parts: { [i]: 870 },                     // structure by crash part index, worn ones only
  flights: 12 }
```

Keyed by pack id so the account's keyed merge handles each pack on its own;
starter packs are `<airframe>-1` and `-2`, so two computers granting them
grant the same keys. The charger has no stored state: two channels
(`CHARGER_CHANNELS`) until the economy sells more.

Integers per mille keep the merge exact and every multiplier below a
rational of small integers, so the block is the same double in Node and
every browser. Ownership of packs and chargers is the economy lane's (item
25, server granted); until it lands every realism airframe owns two packs
of its default spec and one two-channel charger, granted once. A migration
(`v` 1) seeds an empty section from nothing; the check seeds an old
settings blob without either section and proves the result.

### What wear does to the flight (through the plant's own inputs only)

Applied at the seat, once, to the block the shell already builds; never
during a flight. h = health / 1000.

| Wear | Plane (`sim_set_power`) | Quad |
| --- | --- | --- |
| pack health | R_CELL x (2 - h), PACK_C x (0.8 + 0.2 h) | R_CELL x (2 - h) (no capacity input) |
| pack C rating | already in R_CELL (motors.js `g`) | same |
| pack charge 'storage' | PACK_C x 0.6 (flown from 3.85 V a cell) | sag only, cells start lower (needs ABI: deferred) |
| motor | THRUST x (0.9 + 0.1 h), CURRENT unchanged | `sim_set_motors` R x (1.2 - 0.2 h) |
| prop | THRUST x (0.85 + 0.15 h) | KT x (0.85 + 0.15 h) |
| structure (`parts[i]`) | none in the plant (crash damage stays the existing taped and broken parts) | same |

Sources the PR must cite: LiPo end of life at 80 percent capacity with
internal resistance about doubled (maker cycle-life figures), so
health 0 is end of life, not a dead pack. A pack below 600 is RETIRED (the
shelf says so; it can still be flown).

### Accrual (after the flight, never during)

`accrue(state, flight)` is pure: the state before, a flight summary in, the
state after and a DELTA out. The flight summary is read once at the end:

```
flight = { airframe, packId, drawnC, capacityC, minCellV, lvcV,
           fullThrottleS, impacts: [ { kind: 'prop'|'motor'|'structure', i, energyJ } ] }
```

- A pack loses health by its depth of discharge (drawnC / capacityC, one
  full equivalent cycle = 1), more below the LVC, and its charge becomes
  'flat'.
- The motor wears by seconds at full throttle; the prop and the motor by
  impacts (the crash events `sim_damage_events` already reports: prop
  chip, prop lost, motor lost); a structural part, by its crash part table
  index `i` (the index `settings.parts` damage already uses), by impact
  energy.
- Everything rounds to integer per mille, so accruing the same flight twice
  gives the same state on any machine.

### THE SHARED SHAPE with the training lane (items 18 and 19)

This lane owns accrual and repair; the training lane owns how damage and
wear are SHOWN in flight and in the debrief. The debrief reads the DELTA,
nothing else:

```
delta = { airframe,
          pack: { id, spec, before, after, cycles, charge } | null,
          parts: [ { part: 'motor'|'prop'|'structure'|'pack', i?, before, after,
                     cause: 'cycle'|'heat'|'impact'|'overdischarge' } ],
          retired: [packId] }
```

and in flight it may read `wearOf(settings, airframeId)` (the seated
state, per mille) for a HUD line. The training lane proposed per part
index wear as 0..1 with bands (good under 0.5, worn under 0.85, repair at
0.85 and over): that is `parts[i]` here, and `wearLevel(health)` gives
their 0..1 (0 new). Agreed in the plan file; changes go through it.

### Repair, charging and the furniture hooks

- **Repair**: on the bench, each worn part back to 1000. Free until the
  economy lane (item 25) prices it; then it costs soft currency. Packs are
  not repaired; they are replaced (economy) or flown retired.
- **Charging**: a flown pack is 'flat'. Between realism flights the
  charger turns `channels` packs around, flat to full or to storage, per
  sortie, never by the wall clock (no timers, owner 2026-10-07). A pack
  left 'full' through a sortie it did not fly loses 1 per mille; 'storage'
  loses nothing. That is the whole storage-charge rule.
- **Hooks for the hangar room (item 26)**, plain functions, no DOM:
  `packShelf(settings)` (the packs, health, charge, retired), 
  `chargerState(settings)` (channels, what is on it), `benchState(settings,
  airframeId)` (worn parts and what repair would restore). The room's
  stand, shelf, charger and bench call these and open the Parts tab.

### Determinism

- A recorded flight replays identically: wear only changes the blocks the
  journal already copies, and it changes nothing mid-flight.
- Casual modes seat exactly today's blocks (null where today is null), so
  every existing hash and golden is unchanged. The check proves it by
  seating every airframe with realism off and comparing the blocks.

## What this does NOT do

No component damage model in the plant (the plant's crash parts are
unchanged), no wall clock timers, no temperature, no RF, no money for
stats (repair cost is soft currency, earned by flying), no wear in casual
modes, no ABI change in the first pass (a quad's capacity and storage
voltage need one; listed as a later item).

## Checks

- `npm run wear:selftest` (Node): the multipliers for health 1000 give
  the stock blocks bit identical (and null where today is null); a worn
  block is the same doubles on every run; accrue is pure and idempotent on
  repeat input; the migration from a blob without `packs`/`wear`; a flight
  through `src/game/teststand.js` with a worn block replays from the
  journal to the same state trace.
- Parts bench: a browser check through `~/.cache/run-check-slot.sh` that
  points a real pointer at cards and reads the preview, and clicks a part
  in the exploded view; pictures in `~/.cache/fdfpv-w34-parts/`.
- lint:header, lint:dashes, lint:copy on every PR.

## Owner questions (recommended option first)

1. Pack charger turnaround is counted in sorties, not minutes (no timers).
   Recommended: yes, one turnaround per sortie.
2. Starting inventory before the economy lands: two packs of the default
   spec per realism airframe and one two-channel charger. Recommended: yes.
3. Repair cost: soft currency once item 25 lands, free before.
   Recommended: yes.
