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

## A hangar that's yours (walk plan slice 7, 2026-10-11)

Every pilot's room is built from that pilot's own data on their own
computer, and nothing of it is sent anywhere new: a visit
(docs/HANGAR-VISITS.md) still carries only its five fields, so another
pilot's room never shows your builds or your wallet. Owner answer
2026-10-11: the room grows with the level (6 by 5, 10 by 8, 20 by 14 m),
the same rooms as the tiers above; the walk plan's door (slice 4) opens
this same room.

- **The bays** (`bay` in KINDS: the stand's plinth without its ring, no
  station). None in the garage corner, one in the workshop, three in the
  airfield hangar, so with the main stand the room holds 1, 2 and 4 of
  the pilot's aircraft. Which aircraft (src/game/hangarmine.js bayFill):
  the saved builds (src/ui/builds.js), the last changed first, leaving out
  the one the seated aircraft wears; then the planes the pilot's level
  opened, the newest first, each family once and never the seated one;
  then the starters. A bay with nothing left stays empty.
- **The paint chart**: a chip for each shop finish and decal the wallet
  owns (tracks-api/wallet.js; src/game/hangarmine.js paintChart), on the
  wall behind the shop, two rows of four, its name under it in the
  pilot's language. A finish chip is a paint maker's card of the finish
  (a gradient and the finish's highlight, drawn in 2D); a decal chip is
  the decal's own drawing (src/render/decalart.js). Kits are not on it.
  Signed out there is no wallet and no chart. The wallet last known
  hangs at once, and the server's answer replaces it when it comes.
- **The trophy wall** and **the photo wall** are as before: the pilot's
  firsts and medals, the pilot's own photos.
- **When it changes**: decided as the room opens. A build saved, a level
  reached or an item bought shows the next time the pilot walks in; a
  stand never appears under the pilot's feet.
- Not in a visit, the war's field hangar or the room's lineup: those
  rooms are not the pilot's own.

**Cheap by construction, as the room.** A bay's aircraft is baked: every
part it shows into one geometry, its paint as vertex colours, and all
the bays one mesh with one material, so the bays cost one draw (and one
in the shadow pass) however many aircraft and parts. What a vertex colour
cannot carry, a finish's shine and the decals, is the main stand's to
show; a bay is seen from across the room. The paint chart shares the
photo wall's atlas (one texture, now 1536 by 864, 5.3 MB, made only when
there is a photo or a chip to hang) and its draw, because the budget has
no texture to spare at Low or Medium. Measured with every bay holding a
Bramor (the most meshes) and every chip hung, in the table below.

## Look

The game's own: flat shaded low poly, vertex colours, no textures, the
pale sky and olive ground of the worlds outside the door, the Interior's
people (src/render/library/people/figures.js) for the pilot's body. No face, no
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
- `src/render/library/people/figures.js` makeFigures: the pilot, one instance.
- `src/render/craft.js` craftBuilderFor and livery.js: the aircraft.

## Perf budget

The room replaces the world's draw, so its budget is a share of the 11.1
ms frame (docs/PERF.md, 90 fps) that leaves the UI room. Per frame, the
largest tier, aircraft and pilot in it, shadow pass included:

| Preset | Draw calls | Triangles | Textures | GPU ms, median (this box) |
| --- | --- | --- | --- | --- |
| low | 40 | 150 k | 3 | 2.0 |
| medium | 60 | 150 k | 4 | 3.0 |
| high | 70 | 150 k | 4 | 4.0 |

Textures: the furniture uses none (vertex colours); the count is the
render target, the shadow map and, since item 28's photo wall
(docs/SHOW-IT-OFF.md), one atlas of the newest six photos, 1536 by 576,
3.5 MB, made only when there is a photo. The texture column went up by
that one on purpose, written here before it was measured; nothing else
in the budget moved. Since the paint chart (above) that atlas is the
wall atlas, 1536 by 864, 5.3 MB, still one texture: the chart's chips
are its third band. The budget itself lives in src/game/hangarroom.js
(ROOM_BUDGET), read by hangar:perf and foot:mine alike. The GPU column is a small share of the
frame on purpose: a Low machine (Steam Deck class) is several times
slower than this box's RTX 3060 Ti. `npm run hangar:perf` fails a run
over the budget.

### Measured 2026-10-11 with the bays and the paint chart (Intel ARL iGPU, ANGLE GL ES 3.2, 1600 by 900)

hangar:perf, every bay with a Bramor and all seven chips, against the
same run on the tree before (same machine, same hour):

| Preset | Tier | Calls before | Calls now | Triangles before | Triangles now | Textures |
| --- | --- | --- | --- | --- | --- | --- |
| low | airfield | 19 | 20 | 13.5 k | 26.3 k | 3, unchanged |
| medium | airfield | 35 | 37 | 21.0 k | 46.7 k | 4, unchanged |
| high | airfield | 35 | 37 | 21.0 k | 46.7 k | 4, unchanged |
| medium | workshop | 35 | 37 | 16.6 k | 25.2 k | 4, unchanged |

The check chose the Intel chip, not the 3060 Ti the GPU column was
written on, and its GPU medians fail that column before this change as
after it (medium airfield 7.35 ms before, 6.13 ms now, budget 3.0): they
measure the chip and the other lanes' checks sharing it, not the room.

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
  the room or enters furniture; the bays per tier, which aircraft stand
  on them and what the paint chart hangs (src/game/hangarmine.js).
- `npm run foot:mine` (browser, in CI): two pilots signed in to an
  accounts server of the check's own, with their own levels, builds,
  wallets and firsts; each room matches its pilot's data and not the
  other's, a lap's level up grows the first pilot's room the next time
  they walk in, and the full airfield hangar is within the Medium draw
  call and triangle budget in the real shell.
- Second PR adds a browser check driving the real UI: walk in from the
  hub with real key presses, reach each placed station, its prompt
  shows, E opens its screen, Escape returns, the door flies.

## Questions for the owner

Answered 2026-10-07 (lead): the tiers open by level from flying, never
bought; moving furniture comes later, with the shop's furniture.
