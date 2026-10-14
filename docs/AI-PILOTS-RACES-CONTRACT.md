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
changed by this. Nothing below is built yet.

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
