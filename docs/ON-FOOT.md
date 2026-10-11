# The pilot on foot

Slice 1 of the walk-the-field plan (owner request 2026-10-11): in free flight, a landed and
stopped pilot steps out of any aircraft and walks the field in first person, then flies again
from wherever they stand. The hangar door, the interior and the plane change inside are later
slices.

## What the pilot sees

- Landed and stopped (`landed`, plant speed under 0.5 m/s, throttle under the takeoff release),
  in free flight only (the mode registry's `onFoot`, `src/share/modes.js`; not a war, a mission,
  a watcher's seat or the builder): the foot key steps out. After a landing the banner says so.
- Keyboard: `1` (keybind action `foot`, movable in Settings > Controls). Every letter is taken in
  flight, and F is the flaps, which a pilot sets while parked. Pad: hold B half a second (View
  enters the builder on worlds it works in). Touch: the Step out / Fly chip under Aircraft.
- On foot: W A S D or the arrows walk, Shift runs, the mouse looks while captured (a click
  captures it, Escape frees it and pauses). Pad: left stick walks, right stick looks, L3 runs
  until the stick comes back to rest. Touch: the left thumb walks, the right thumb looks.
- The same control flies again. The pilot and line of sight views then look from where the
  pilot stands.
- R restarts the run (back in the air at the spawn, the pilot's spot reseated). Every other
  flight key is swallowed on foot. Esc pauses and resumes on foot. A swap ends the walk.

## Human numbers (`src/game/human.js`)

| Value | Number | Source |
|---|---|---|
| Stature | 1.75 m | the room pilot figure (`src/share/peers.js` buildPilotFigure) |
| Eye height | 1.64 m | 0.936 of stature. Drillis, R. and Contini, R. (1966), *Body Segment Parameters*, Technical Report 1166-03, School of Engineering and Science, New York University. Their segment length proportions are reproduced in Winter, D. A., *Biomechanics and Motor Control of Human Movement*, chapter Anthropometry. 0.936 x 1.75 = 1.638. |
| Walk | 1.4 m/s | comfortable gait speed, adults 20 to 59: 1.39 to 1.46 m/s. Bohannon, R. W. (1997), Comfortable and maximum walking speed of adults aged 20-79 years: reference values and determinants, *Age and Ageing* 26(1):15-19, doi:10.1093/ageing/26.1.15. |
| Run (fast walk) | 2.5 m/s | maximum walking speed of adults in their twenties, about 2.5 m/s (men 2.53, women 2.47), same source. |
| To pace / to a stop | 0.5 s | ESTIMATED, about one step. |
| Body radius | 0.25 m | ESTIMATED, a shoulder half width. |
| Step up | 0.35 m | ESTIMATED, a knee high step. A higher rise is a wall. |
| Steepest slope | 35 deg | ESTIMATED. |
| Gravity | 9.81 m/s^2 | |

The line of sight camera stood at a literal 1.7 m before this; it now stands at the same 1.64 m
eye, a 6 cm change.

## How the walk works (`src/game/onfoot.js`)

- The body is an upright capsule. Every solid of the map blocks it, through a new read only
  query, `Colliders.bodyPush` (`src/game/collide.js`): the deepest solid the capsule sinks into
  and the level way out. Gates, tree crowns and banners are walked through; trunks are not.
  Solids' tops are not walked on: the ground is the map's own `height(x, z, fromY)`, asked from
  a step over the feet, so a roof is never stepped onto from below.
- A move is refused rather than half taken when it would rise more than the step, climb ground
  steeper than 35 deg (a rise that keeps climbing past the stride; a rise that levels off is a
  step), enter water, or end inside a solid. A refused move tries its two level axes alone, so the
  body slides along what stopped it. Off a ledge higher than a step, the body falls at g.
- Water: the lake's `height` is its surface on alps and swiss2 and no map gives the bed there,
  so the walker does not enter any water body at all (the plan's 0.6 m wading depth needs a bed
  query; not built).
- Moving solids (trains, a builder's moving pieces) are not seen by the walk.

## The pilot's spot

`pilotSpot {x, z, fromY}` in `src/main.js`, seated once per spawn (`adoptSpawn`, 20 m right
and 15 m ahead of the spawn, as before) and after that moved only by walking. Before, the spot
was worked out from the spawn every frame, and a clip recovery or a swap in the air moves the
spawn (`resetCraft(at)` from `finishClipCrash`), so the pilot was carried off with the craft.

## Determinism

A step out needs a landed craft, and a landed craft is not stepped (`advancePlant`). On foot the
flight ladder answers centred sticks at zero throttle (`src/input/input.js` rung 1a), so
nothing reaches the plant, and the walk's queries write nothing a sweep reads. No map's
colliders change, so no recorded clip re-flies differently.

## The crash cam

The ring stops at the step out (a parked aircraft for minutes is not a clip) and flying again
starts a new clip (`src/replay/crashcam.js` record).

## Checks

- `npm run foot:node` (Node): 20,000 random frames among walls, turned walls, posts and lying
  capsules never end inside a solid by two different queries; 0.35 m step walked, 0.40 m blocked;
  30 deg climbed, 40 deg refused; gate, crown and banner passed, trunk stops; 1.4 and 2.5 m/s;
  water refused; a 2 m drop falls in free fall time.
- `npm run foot:walk` (page, swiss2): refused while rolling; steps out on the spot at a 1.64 m
  eye; the ring stops; pace 1.4 and 2.5 m/s within 7 %; eye 1.64 m over the terrain the whole
  way to the hangar, whose wall stops the body outside; Escape pauses on foot; flies again with
  the aircraft unchanged and the pilot view from the walked spot; a recovery of the craft leaves
  the pilot where they stood; the pad's B and the sticks; the phone's chips and thumbs.

## Not this slice

The hangar door and interior, plane change inside, others seeing the walker (slices 4 to 7).
`walker.inHangar` is the seam for the door, false for now. The hub hangar walk keeps its own
2.2 m/s (`hangar:walk` asserts it); the field's 1.4 m/s is different on purpose, for the owner to
feel.
