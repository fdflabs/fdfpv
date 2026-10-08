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
| shop | the hangar on its Shop tab (`hangar-shop`) | progression lane | yes |
| trophy wall | campaign progress and records | progression lane | no: drawn, no prompt until it lands |
| tv | replays | this lane later (item 28) | no: drawn, no prompt until it lands |
| door | Fly (`fly`, the same as the launch card) | existing | yes |

  A station opens its screen through `ui.act(action)`, the same door a
  hub card uses; when that screen closes the pilot is back where they
  stood. Other lanes add a station by naming its action in the plan
  file's Wave 4 hooks line; the room never draws a screen of its own.

- **The aircraft on its stand** is the seated aircraft, at its real size,
  in its livery (src/render/livery.js and the decals, finish and parts
  dressing carousel3d.js already applies).
- **Space tiers**: garage corner (6 by 5 m), workshop (10 by 8 m),
  airfield hangar (20 by 14 m), opened by the pilot's level from flying
  (src/game/progress.js): the workshop at level 4, the airfield hangar at
  level 7 (TIER_LEVELS), all of them with Unlock all. Never bought (lead
  decision 2026-10-07). The room is the biggest tier opened.
- **Grid furniture**: the floor is a 0.5 m grid. Furniture is a list of
  `{ kind, at: [i, j], rot }` (rot in quarter turns), each kind a
  footprint in cells; nothing overlaps and nothing leaves the room, held
  by a Node check over every layout. Each tier has a default layout.
  Moving furniture by hand is not in this item (see Questions).
- **War field hangar** (third PR): a second room, `field` in ROOMS (10 by
  7 m, a tent over a dirt floor, timber poles, sandbags along its sides,
  crates), opened from a **Field hangar** card under Operations. Same code,
  its own layout and palette. Its door reads "To the front" and opens the
  first Operations card the pilot could open from the hub (it needs a
  rooms server; without one the door gives no prompt); Escape returns to
  Operations. No real insignia, no flags on walls (the flag is always
  horizontal). Measured within the same budget: 17 calls at Low, 32 at
  Medium and High, 8.4 k to 13.8 k triangles (hangar:perf), 30 calls in
  the real shell.

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

## Perf budget

The room replaces the world's draw, so its budget is a share of the 11.1
ms frame (docs/PERF.md, 90 fps) that leaves the UI room. Per frame, the
largest tier, aircraft and pilot in it, shadow pass included:

| Preset | Draw calls | Triangles | Textures | GPU ms, median (this box) |
| --- | --- | --- | --- | --- |
| low | 40 | 150 k | 2 | 2.0 |
| medium | 60 | 150 k | 3 | 3.0 |
| high | 70 | 150 k | 3 | 4.0 |

Textures: the room itself uses none (vertex colours); the count is the
render target and the shadow map. The GPU column is a small share of the
frame on purpose: a Low machine (Steam Deck class) is several times
slower than this box's RTX 3060 Ti. `npm run hangar:perf` fails a run
over the budget.

### Measured 2026-10-07 (RTX 3060 Ti, ANGLE GL ES 3.2, 1600 by 900)

The budget was written before the first run; the first runs broke it on
draw calls (Bramor on the stand: 55 at Low, 108 with its shadow pass),
which is why the parked aircraft is now drawn as one merged copy per
material. After that, airfield tier with the Bramor (69 meshes, the most
of the hangar's aircraft):

| Preset | Calls | Triangles | Textures | GPU ms median | CPU submit ms |
| --- | --- | --- | --- | --- | --- |
| low | 17 | 12.6 k | 2 | 0.10 | 0.30 |
| medium | 32 | 19.3 k | 3 | 0.61 | 0.40 |
| high | 32 | 19.3 k | 3 | 1.13 | 0.40 |

The same room with the furniture as one mesh per piece: 138 calls at
Low, 273 at Medium and High. GPU 95th percentiles reached 15 ms in some
runs: GPU 0 is shared with the desktop and other lanes' checks (load
average 17 during the run), and those spikes moved between runs and
presets, so they measure the neighbours, not the room.

## Perf test

`scripts/hangar-room-perf.js` opens `scripts/hangar-room-perf.html` on the
GPU (SIM_GPU=1), builds each tier with the default layout, the pilot and
the aircraft with the most meshes of a list that covers every builder kind (the Bramor, 69), walks the
pilot a fixed loop with the camera following, and per preset reads
renderer.info (calls, triangles, textures, geometries, programs) and GPU
time (EXT_disjoint_timer_query_webgl2) over 300 frames. It also builds
the naive variant, one mesh per furniture piece, to show what merging
saves. Pictures of every tier and preset land in the out dir. It runs through `~/.cache/run-check-slot.sh`, never alongside
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

Answered 2026-10-07 (lead): the tiers open by level from flying, never
bought; moving furniture comes later, with the shop's furniture.
