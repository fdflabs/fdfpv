# AI pilots in races: contract

Follows docs/AI-PILOTS-CONTRACT.md (Catch the Ace). Lead, 2026-10-09: races
are the next game for AI pilots, then the Interior map.

**Amended by the lead, 2026-10-13** (redesign phase 18, docs/redesign/PLAN.md
row 18): a room's AI race opponent is the AI pilot of src/game/aipilot.js on a
plant the rooms server runs, seated as a room pilot, judged by
src/game/race.js Race, never on the record. The kinematic Zagi of
edge/rooms/bots.js is retired from this contract: it moves poses, it does not
fly the plant, and PILLARS 12 says an AI pilot flies the same plant under the
same rules. Catch the Ace's AI pilots (docs/AI-PILOTS-CONTRACT.md) are not
changed by this. Built by w39-room-ai, 2026-10-13: see "What is built"
below; the rest of this page is the design it was built to.

## What the player sees

- A race room (Make a room, Race) whose host has loaded a track: the host's
  AI pilots row (Off / Easy / Normal / Hard, #866) is shown in the race
  lobby too. On, AI pilots fill the grid to four with the people, as in
  Catch the Ace, and leave for any person who joins before the start.
- At the start AI pilots go off the grid with everybody, fly the gates in
  order, lap after lap, and finish. They are on the race board and in the
  results, named "AI <name>" (en) / "IA <name>" (es), as on the tag board.
- A race with AI pilots in it posts nothing to the leaderboard for them:
  their times are room results only.
- They crash as a person's plant crashes: the course's ground and solids
  (gate frames among them) meet their plant. A crashed AI pilot is reborn
  on its last gate passed, as a person's R puts them back on the course,
  and its clock runs on.

## Which races

- Worlds the room has the ground for (edge/rooms/grounds.js): swiss2 and
  the alps. Itaipu and the Interior are out until their ground is there.
- **Quads only today**, because the AI pilot flies a multirotor in
  Betaflight's ANGLE mode and nothing else (src/game/aipilot.js). Wing
  tracks are no longer excluded as a class: they come in once the pilot
  flies fixed wings, with its own harness. Until then a wing track's AI
  pilots row says why and stays off.
- Map tracks and the host's own tracks alike: the room already holds the
  loaded track (edge/rooms/race.js) and src/builder/course.js raceGatesOf
  gives every gate's centre, axes and opening from it.

## How (the slice 3 design note, w38-aipilot, 2026-10-13)

What exists to build on: src/game/aipilot.js (the person paced pilot, its
gains from the crossover rule, the next gate's opening flown on the last
stretch), src/game/aiopponent.js (that pilot on a plant of its own, the
ground raised into the plant every step, the hull swept through a collider
set every 4 ms with one sim_contact per face met, its own Race, its sticks
kept), and aipilot:harness, which runs all of it in Node in seconds.

- **Flight.** The room runs one dist/sim.wasm per AI seat in Node, seated as
  the seat's aircraft (default tune, the menu's default rates, ANGLE mode)
  and learnt once (learnSticks, about 0.1 s of CPU) before the start, never
  on the tick. It is stepped 1 ms at a time on the room's clock in equal
  substeps, as warhunt.js's recipe does for its own model; a gap over the
  room's GAP_MS flies only GAP_MS. What it chases: the best lap with a
  recording on this track's board for that aircraft when there is one, else
  a reference lap the room flies itself before the start (the harness's
  reference pilot through a smooth line, at a pace under the pilot's
  measured ceiling). Levels (Easy / Normal / Hard) are the ghost's pace, not
  a different pilot: the person's limits stay the person's.
- **World.** The plant's ground from edge/rooms/grounds.js, the same heights
  the page lays its ground on; the gate frames as a collider set built from
  raceGatesOf, the same solids the page builds. aiopponent.js takes these
  through its world object (toSim, dirToSim, fromSim, floorHeight,
  groundNormal, colliders), so the room supplies a world, not new code.
- **Scoring.** The room is the AI pilot's client: Race (src/game/race.js,
  which loads in Node) judges every 4 ms of its flight, after the solids,
  and its passes become the room's own `{ type: 'event', kind: 'gate' }`
  and `finish` exactly as edge/rooms/race.js receives a person's. Nothing is
  judged twice and nothing new is trusted from a page. Its poses go out as
  any seat's POSE bytes.
- **Determinism and restore.** The sticks are a pure function of the plant's
  states, but the law uses Math.sin, cos and atan2, so the room keeps each AI
  seat's stick rows and, to restore mid race, the plant's state region
  (src/replay/journal.js's method) rather than flying the law again.
- **Cost, to measure before building.** In Node on this desktop the
  opponent costs 4 to 7 ms of CPU per second flown (aipilot:harness: 0.9 to
  1.6 s for 233 s). Three AI seats are about 2 percent of a core; the VM is
  one core and slower, so the number is measured there before a public room
  fills with them.
- **Seats.** roombots.js fills a race room when its game is the race
  (src/share/modes.js race allowAI true), the track is a quad track on a
  ground map, and the host's level is not Off. AI pilots count as ready.

## What is built (w39-room-ai, 2026-10-13)

edge/rooms/airace.js, seated by edge/rooms/roombots.js in a room made for
a race (src/share/modes.js race allowAI is now true; roombots.js keeps
bots.js's kinematic Zagi out of races). Decisions taken in building it:

- **The aircraft** is the interceptor (configs/airframes.js
  DEFAULT_AIRFRAME, the harness's quad), whatever the people fly.
- **Levels** are the ghost's pace along its own path: Easy 6, Normal 8,
  Hard 10 m/s (airace.js RACE_PACES, under the pilot's measured 14 m/s
  ceiling on tests/fixtures/map-track-v4.json). A board lap faster than
  its level is slowed to it, never sped up.
- **The ghost** is the board's best quad lap with a ghost on the track
  when the server has ROOMS_BOARD_ORIGIN (src/share/board.js reads), else
  the room's reference lap. The harness's reference line runs under a
  ground standing course (5 m under a dive gate's exit on swiss2), so the
  room keeps it 0.8 m over the page's ground. Either ghost is proved
  before it is taken: an AI pilot on the room's ground and gate frames
  must close two laps behind it. A board lap that fails gives way to the
  reference; a track neither proves on seats no AI pilot.
- **The grid**: the AI pilots line up one behind another on the ghost's
  line, the first 9 s before the timing gate (6 s more than aiopponent.js
  START_MS: from 3 s out the person was still 1.7 m off the line at the
  timing gate and lost a lap), the next 1 s behind each.
- **The gate frames** are four bars of the built tube round each
  rectangular opening, as aipilot:harness frames them, not the page's
  drawn capsules (src/render/scene.js needs three.js). A hoop and a
  pylon have no frame in the room.
- **A crash is a retire.** Rebirth on the last gate passed is not built.
- **A restore mid race** is not built: a room restored from storage drops
  its AI racers, marks them left in a race on, and fills again.
- **The VM** needs dist/sim.wasm and tests/lib/{simmod, personpilot,
  aireference}.js shipped (deploy/vm/deploy.sh, a separate commit) and a
  rooms deploy; without them the server starts and seats no AI racer.

Checks: rooms:selftest (rooms-selftest-airace.js, the plant in Node) and
airace:twopage (a person races them in the real shell). The lobby's AI
pilots row is drawn by src/main.js roomBotRows, wired today only into
tag's lobby; a race lobby shows it once the race entries there call it,
with lobby.ai_race_note as its note.

## Cost, measured (2026-10-13, this desktop, Node 22)

Three fresh processes each, in two sittings an hour apart whose numbers
differ by up to 30 percent with what else the desktop ran (the slower
second, same code), process CPU (process.cpuUsage, which counts
V8's compiler and collector threads: on the VM's one core they compete
for the same core), tests/fixtures/map-track-v4.json stood on the swiss2
ground at 8 m/s, two laps:

- **Flying**: 3.4 to 4.6 ms of CPU per AI seat per second flown with three
  seats, 4.2 to 4.4 with one (the room's tick, judge and pose bytes
  included); a 33 ms room tick with three AI racers took at most 1.4 to
  4.0 ms. aipilot:harness's opponent alone is 2.0 ms (477 ms for 233 s).
- **Before the first race on a track and level**: 0.64 to 0.88 s of wall
  and 1.0 to 1.35 s of CPU to find and prove the ghost, once per process,
  of which the longest single block of the event loop, the reference lap
  flown in one loop (tests/lib/aireference.js fly), was 323 to 454 ms:
  every room in the process stalls that long. The proof flies in 2 s
  slices and yields between them. Seating a racer's plant after that:
  1 to 3 ms.
- **The VM**: one core, slower than this one. Its figure is the lead's
  to measure before a public room fills with AI racers; at this desktop's
  rate three AI seats are 1.0 to 1.4 percent of a core.

## What it does NOT do

- No AI pilots on wing tracks until the pilot flies wings; none in Streamer
  Combat, Trick Battle or the war.
- No leaderboard entries, no ghosts uploaded, no records, medals or
  progression for AI pilots (docs/AI-PILOTS-CONTRACT.md).
- No flight model of its own: the plant, through sim_input only.

## Checks that will prove it

- aipilot:harness (exists, CI): the pilot behind a plant flown ghost, the
  opponent in framed gates and against a wall.
- rooms:selftest: a race room with a quad track fills; on start the AI
  pilots' gate events and finish reach the race and the results order them
  with a person's; a wing track or Off fills none; a restore mid race flies
  on from the kept state.
- bots:twopage: A loads a quad track in a race room with AI pilots on,
  starts, sees them pass gates on its board and finish in the results;
  B joining before the start takes one's place.
