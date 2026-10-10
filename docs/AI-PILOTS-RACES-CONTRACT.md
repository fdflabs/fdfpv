# AI pilots in races: contract

Follows docs/AI-PILOTS-CONTRACT.md (Catch the Ace). Lead, 2026-10-09: races
are the next game for AI pilots, then the Interior map.

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
- They crash as in Catch the Ace (a part-breaking mid air, the ground);
  a crashed AI pilot is reborn on its last gate passed, as a person's R
  puts them back on the course, and its clock runs on.

## Which races

- Worlds the room has the ground for (edge/rooms/grounds.js): swiss2 and
  the alps. Itaipu and the Interior are out until their ground is there.
- Tracks of the wing class only (src/game/race.js CLASS_BOX.wing: a 2 m
  deep scoring box): the AI pilot is a Zagi on bots.js's flight model,
  whose turn rate (0.75 to 1.5 rad/s, a 13 to 21 m radius at race speed)
  cannot thread a quad track's 5-inch gates. On a quad track the AI pilots
  row says why and stays off.
- Map tracks and the host's own tracks alike: the room already holds the
  loaded track (edge/rooms/race.js) and src/builder/course.js raceGatesOf
  gives every gate's centre, axes and opening from it.

## How

- **Flight.** bots.js gets a `gates` order beside chase/flee/wander: the
  aim is the next gate's centre, led out along its travel axis so the turn
  lines up with the opening before it, the height band set by the gate and
  the ground (grounds.js) rather than the tag corridor. Same determinism
  rules (sinDet, substeps, saved state).
- **Scoring.** The room is the AI pilot's client: it runs the same referee
  a page runs (src/game/race.js Race, which loads in Node) on every bot
  substep's position, and turns its passes into the room's own
  `{ type: 'event', kind: 'gate' }` and `finish` exactly as race.js
  receives a person's, so edge/rooms/race.js orders them with no special
  case. Nothing is judged twice and nothing new is trusted from a page.
- **Seats.** roombots.js fills a race room when its game is the race
  (src/share/modes.js race allowAI true), the track is a wing track on a
  ground map, and the host's level is not Off. AI pilots count as ready.

## What it does NOT do

- No AI pilots on quad tracks, in Streamer Combat, Trick Battle or the war.
- No leaderboard entries, no ghosts, no records for AI pilots.
- No new flight model: bots.js's wing with a new kind of aim.

## Checks that will prove it

- bots:selftest: a Normal AI pilot laps a test wing track gate by gate in
  order, every pass inside the opening by src/game/race.js; lap times per
  level ordered Easy > Normal > Hard; deterministic and restorable mid lap.
- rooms:selftest: a race room with a wing track fills; on start the AI
  pilots' gate events and finish reach the race and the results order them
  with a person's; a quad track or Off fills none.
- bots:twopage: A loads a wing track in a race room with AI pilots on,
  starts, sees them pass gates on its board and finish in the results;
  B joining before the start takes one's place.
