# The walkable hangar (Wave 4 item 26)

Contract for the hangar as a place: a room the pilot walks through in third
person, with the aircraft on its stand and the hangar's screens behind
the things in it. Owner decisions 2026-10-05 (a walkable 3D room) and
2026-10-07 (a pilot body seen in third person; war gets a second room, a
field hangar). Plan: ~/Desktop/fdfpv-loop/IMPLEMENTATION-PLAN.md, Wave 4.

Order is fixed: the browser perf test and its budget first (this PR), the
main room with the pilot second, the war field hangar third.

## What the player sees

- From the Hangar hub, **Walk in** puts the pilot in the room, standing by
  the door. The camera sits behind and above them and follows.
- Keys: W/S or the arrows walk and turn (A/D turn), a mouse drag turns the
  camera round the pilot, E or Enter uses what the pilot faces, Escape
  leaves to the hub. A pad: left stick walks, A uses, B leaves.
- Near a station a prompt names it and its key. The stations:

| Station | Opens | Owner of the screen | Exists today |
| --- | --- | --- | --- |
| stand | the aircraft picker (`hangar-aircraft`) | this lane | yes |
| bench | paint and parts (`customise`) | paint lane, parts lane | yes, today's hangar tabs |
| shelf | parts bench | parts lane | no: `customise` until it lands |
| shop | the shop | progression lane | no: the station is not placed until it lands |
| trophy wall | campaign progress and records | progression lane | no: not placed until it lands |
| tv | replays | this lane later (item 28) | no: not placed until it lands |
| door | Fly (`fly`, the same as the launch card) | existing | yes |

  A station opens its screen through `ui.act(action)`, the same door a
  hub card uses; when that screen closes the pilot is back where they
  stood. Other lanes add a station by naming its action in the plan
  file's Wave 4 hooks line; the room never draws a screen of its own.

- **The aircraft on its stand** is the seated aircraft, at its real size,
  in its livery (src/render/livery.js and the decals, finish and parts
  dressing carousel3d.js already applies).
- **Space tiers**: garage corner (6 by 5 m), workshop (10 by 8 m),
  airfield hangar (20 by 14 m). What unlocks a tier is the progression
  lane's rule and an owner decision (see Questions); until then the room
  is the garage corner.
- **Grid furniture**: the floor is a 0.5 m grid. Furniture is a list of
  `{ kind, at: [i, j], rot }` (rot in quarter turns), each kind a
  footprint in cells; nothing overlaps and nothing leaves the room, held
  by a Node check over every layout. Each tier has a default layout.
  Moving furniture by hand is not in this item (see Questions).
- **War field hangar** (third PR): a second room, a tent over a dirt
  floor with sandbags and crates, entered from the war's own lobby, its
  door flying the war sortie. Same code, its own layout and palette. No
  real insignia, no flags on walls (the flag is always horizontal).

## Look

The game's own: flat shaded low poly, vertex colours, no textures, the
pale sky and olive ground of the worlds outside the door, the Interior's
people (src/render/interior/figures.js) for the pilot's body. No face, no
rank, no insignia.

## Data and storage

- Layouts and tiers are data in `src/render/hangarroom.js` (ROOMS,
  LAYOUTS). Nothing is stored in this PR or the next: the tier comes from
  the progression lane's account data when it exists, the layout is the
  tier's default. A stored layout, when moving furniture lands, is account
  data with a versioned migration (BRIEF process 6).

## Built on

- `src/render/carousel3d.js` pattern: the shell's own renderer, no second
  context, a multisampled target with depth (the canvas has none), a blit
  to the canvas, renderer state put back.
- `src/main.js` drawFrame: the world's draw is skipped while the room is
  open, as it already is for the hangar.
- `src/render/quality.js` presets: pixel ratio and shadows per preset.
- `src/render/interior/figures.js` makeFigures: the pilot, one instance.
- `src/render/craft.js` craftBuilderFor and livery.js: the aircraft.

## Perf budget (measured, see "Perf test" below)

The room replaces the world's draw, so its budget is a share of the 11.1
ms frame (docs/PERF.md, 90 fps) that leaves the UI room. Per frame, the
largest tier, aircraft and pilot in it:

| Preset | Draw calls | Triangles | Textures | GPU ms (this box) |
| --- | --- | --- | --- | --- |
| low | 40 | 150 k | 2 | 2.0 |
| medium | 60 | 150 k | 3 | 3.0 |
| high | 70 | 150 k | 3 | 4.0 |

Textures: the room itself uses none (vertex colours); the count is the
render target and the shadow map. Draw calls are dominated by the
aircraft (one per part); the room is a handful of merged meshes, one per
material, whatever the furniture count. `npm run hangar:perf` fails a
run over the budget. Numbers measured are in the PR and in the table
below.

## Perf test

`scripts/hangar-room-perf.js` opens `scripts/hangar-room-perf.html` on the
GPU (SIM_GPU=1), builds each tier with the default layout, the pilot and
an aircraft (the Cub, the most parts of the hangar's planes), walks the
pilot a fixed loop with the camera following, and per preset reads
renderer.info (calls, triangles, textures, geometries, programs) and GPU
time (EXT_disjoint_timer_query_webgl2) over 300 frames. It also builds
the naive variant, one mesh per furniture piece, to show what merging
saves. It runs through `~/.cache/run-check-slot.sh`, never alongside
another GPU run on GPU 0 (`nvidia-smi pmon -c 1` first).

## Does not do

No physics, no collision but the grid and the walls, no jumping, no
running animation beyond the figures' two strides, no other pilots in the
room (item 28's visits), no stored layout, no furniture editing, no
shop, trophy or replay screens (other lanes' and item 28's).

## Checks

- `npm run hangar:perf` (browser, GPU): the budget above, per preset.
- `npm run hangar:room` (Node): every layout in bounds and overlap free,
  every station reachable on foot from the door, walking never leaves
  the room or enters furniture.
- Second PR adds a browser check driving the real UI: walk in from the
  hub with real key presses, reach each placed station, its prompt
  shows, E opens its screen, Escape returns, the door flies.

## Questions for the owner

1. What opens the workshop and the airfield hangar tiers? Recommended:
   the pilot's level from flying (PROGRESSION.md XP), never bought.
2. Moving furniture by hand: in this item or later? Recommended: later,
   after the shop has furniture to place.
