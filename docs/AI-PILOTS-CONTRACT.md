# AI pilots: the contract (Wave 3 item 20, first half)

Lane "aipilots", 2026-10-07. The plan's note on item 20: "deterministic,
room-authoritative". This file says where AI pilots fly, how they stay cheap
and repeatable, how players see them, how they leave, what ships in which PR,
what it does not do, and the checks that prove it. Weather (item 20's second
half) is another lane's.

## What the player sees

- A room made for Catch the Ace that has fewer pilots than its fill target
  has AI pilots in it. Each is a peer like any other: an aircraft in the air,
  a seat on the scoreboard, a name tag. Its name always says it is an AI
  pilot: `AI Brave Fox 3` in English, `IA Zorro Valiente 3` in Spanish
  (`bots.name` in src/strings). An AI pilot is never shown without the mark.
- The game lobby shows the AI pilots in its seat list, marked the same way.
  The host's row (AI pilots, Off / Easy / Normal / Hard) is PR 4; until it
  lands a room made for tag fills at Normal.
- A real pilot joining a room takes a seat an AI pilot held: the AI pilot
  leaves (a normal leave on every screen) and the newcomer is never refused
  `full` because of AI pilots.
- An AI pilot never hosts, never votes or is reported (there is nobody to
  report), is never in voice chat, never appears in the room browser's
  pilot count, and never earns, sets or appears on a record, a medal, a
  star or any progression. A match won by an AI pilot shows its marked name
  as winner and records nothing for anybody.

## The decision: the room flies them

AI pilots are flown by the rooms server, inside the room, on the room tick.
Not by a host client.

- A host client's AI dies when the host leaves, reloads or backgrounds its
  tab, and every other pilot sees it stop. The room outlives any one pilot.
- The room already judges every tag, cut and mid air from poses it is sent.
  An AI flown in the room hands its poses to the same judges directly, so
  nothing new is trusted and no client can steer an AI to win.
- The room already does this once: the war's hunters (edge/rooms/warhunt.js)
  are steered by the room and their poses sent in AGENTS frames.

AI pilots are SEATS, not a side list. A bot is a seat record in
`RoomCore.seats` whose key is a `BotConn` (an object with no-op `send`,
`close` and `serializeAttachment`, so host.js `run()` needs no change) and
whose record carries `bot: { level, ... }`. Its poses go through the same
path a pilot's relayed pose does after the pose rules (referee, tag, combat,
the tick's batches). So the games (tag.js, combat.js, race.js), the client's
peers, scoreboard and name tags need no second code path for them. Counted
on main at d1dc5113: about 75 sites in the games read `core.seats` as "who is
flying"; 17 sites mean "the people here" and get a guard (host and hosting,
the cap and freeSeat, room empty and purge, the safety votes, voice, the
lobby listing's count, node.js's pilot counters, the game lobby's empty
check, the tick's batch recipients). Those 17 go through one helper,
`core.people()`, so the guard is one function, not 17 branches.

## Deterministic and cheap

- Steering is warhunt.js's recipe: plain arithmetic and `Math.sqrt` only,
  sine and cosine by Taylor series, elapsed room time flown in equal
  substeps of at most SUB_MS, a gap over GAP_MS flies only GAP_MS. The same
  calls give the same poses bit for bit, whatever the tick jitter.
- Every random choice (a wander point, a reaction delay, a name) is drawn
  from a seeded generator whose state is in the stored value, never
  `Math.random`. So a restart mid match continues the same flight.
- Stored as `{ store: 'bots', value }` and restored by host.js into
  `core.bots.restore()` (the README's rule: the key is the part's name),
  before the seats; the bot seats are rebuilt from it, since they have no
  socket attachment.
- Cost budget: the VM is one core and 5.6 GB, the tick is 33 ms, and
  health.js's valve closes new public rooms on the process's own CPU, so
  AI cost is counted there without a line. Measured (bots:selftest's cost
  row, 7 AI pilots for 60 room seconds at 30 Hz, this lane's 20 core desktop
  on 2026-10-07): 0.016 to 0.038 ms CPU per AI pilot per room second for the
  flight and the choices, so 7 in a room are under 0.3 ms of every second.
  What they add to the room's judging (tag's frontier moves on every tick,
  pairs grow with seats) measured in PR 3 through RoomCore (rooms:selftest,
  3 AI pilots and one person in a live match for 120 room seconds): 2 to 3 ms
  CPU a room second for the whole room, judging, relaying and flying, on
  this desktop. A room never has more than FILL_TO - 1 = 3 AI pilots, so
  that is the cap; a VM core two or three times slower still spends under
  1 % of itself on such a room. The VM's own number is the same check run
  there after the deploy.

## How they fly

- An AI pilot flies a fixed-wing model of the room's own: constant speed per
  difficulty, a turn rate cap, bank drawn from the turn rate, nose along the
  path. Its profile names the Zagi (`zagi1219`, a flying wing: no gear,
  flaps or rudder to animate), so its hull (src/game/midair.js hullFor)
  and its drawing are an ordinary peer's.
- Tag: as a hunter, pure pursuit with lead on the Ace (warhunt.js's) at
  tag's CHASE_BOOST, as a person hunting flies; as the Ace, flee: away from
  the nearest hunter along the valley; with the orb free, fly to the orb.
  On the last 150 m to a target it may come down to the target's height
  (never under 2 m), or a pilot sat on the strip could never be caught.
- v1 AI pilots never crash: a mid air with one breaks the person as any
  mid air does (the referee's hit), and the AI pilot flies on. Crashing
  them (and their wreck) is a later PR if the owner wants it.
- Where: AI pilots fly only where the server knows the ground. v1 is
  swiss2 (tag's home world): the valley floor corridor, within 150 m of the
  valley axis (src/maps/alps/terrain.js valleyAxis, copied with a selftest
  that it matches) and between 20 m and 120 m over the flat floor. A room on
  another world gets no AI pilots until that world has a server floor.
- Difficulty: speed, turn rate, lead and a reaction delay, three steps.
  Easy is beatable by a first-week pilot, Hard is not a sure thing for the
  owner. The numbers are in edge/rooms/bots.js with the reason for each.

## Fill and leave

- A room made for tag fills up to FILL_TO pilots (people plus AI) while it
  has at least one person, at the host's difficulty; the default is Normal
  in a room made for the game and Off anywhere else.
- A person arriving when people plus AI would pass FILL_TO or the cap: the
  newest AI pilot leaves first, so the person is seated.
- The last person leaving: the AI pilots leave with them, and the room
  empties and purges exactly as today (an AI never keeps a room alive).
- AI pilots appear only in a room whose every person runs a build that
  draws them as AI (ROOM_LEVEL 3, src/share/roomwire.js). A tab from before
  is closed with CLOSE.update by the existing level rule, so no screen ever
  shows an AI pilot as a person.

## What it does NOT do

- Weather, the war, ops missions: no AI pilots there (the war has its own
  attackers).
- No AI on worlds without a server floor (alps, itaipu, interior in v1).
- No progression, record, medal or credit from or for an AI pilot.
- No client-side AI and no AI in solo offline flight.
- No chat, no voice, no reports, no host.

## PRs, in order

1. This contract.
2. edge/rooms/bots.js: the flight model, the seeded generator, save and
   restore, tag behaviour; scripts/bots-selftest.js with the measured cost.
   Pure, nothing in the room yet.
3. The room: bot seats in core.js through `people()`, fill and leave,
   ROOM_LEVEL 3, the host's row, the client's marked names (en and es); the
   two-page browser check (one page alone in a tag room sees marked AI
   pilots and the crown move; a second page joins and an AI leaves).
   Needs a VM deploy.
4. Streamer Combat: the room trails a streamer behind each AI pilot (cut.js
   frames from its path) and the AI hunts streamers. Needs a VM deploy.
5. Races: the AI flies the gates of the track the host loaded (race.js has
   the doc) and reports its own passes to the room. Needs a VM deploy.
6. Trick Battle: after that mode exists.

## Checks

- `npm run bots:selftest`: same seed twice is bit identical; a save and
  restore mid match continues bit identical; the corridor's axis matches
  alps/terrain.js; every pose stays inside the corridor and the height band;
  a hunter reaches a straight-flying Ace's bubble on Normal; the Ace bot
  keeps the crown longer on Hard than on Easy.
- `npm run rooms:selftest` additions (PR 3): a person joining a full room
  of AI is seated and an AI leaves; no AI ever holds the host; the lobby
  listing counts people only; the room empties when the last person leaves.
- bots:selftest's cost row, and PR 3's room tick cost with AI pilots in a
  live tag match; BOT_CAP is set from the second.
- PR 3's two-page browser check through `~/.cache/run-check-slot.sh`.
- lint:header, lint:dashes, lint:copy on every PR.

## Questions for the owner (built with the recommended default meanwhile)

1. Fill target and default: recommended FILL_TO 4, on (Normal) in rooms made
   for the game, off elsewhere, the host can switch it off.
2. Does a win against AI pilots count for anything (Flight Club records,
   medals, credits)? Recommended: no, never.
3. Difficulty shown to joiners: recommended yes, on the lobby's AI row.
