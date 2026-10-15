# Progression: mastery and discovery, no grind

**Status: PARTLY BUILT** (proposed 2026-10-03, under docs/PILLARS.md
sections 7, 8, 9 and 22; state as of 2026-10-15). docs/ECONOMY.md is the
later contract and wins where the two differ: three currencies, not two
(tokens buy cosmetics), progress is `v: 2`, and the mastery milestones are
first flight, ten minutes and an hour. Built, by the phases of section 10:

- phase 1: firsts from the war (a mission's win and each star), training
  (a lesson flown and passed), Streamer Combat and Catch the Ace! (a round
  or a match finished, once per world); bests (section 3.1, the lead's
  rule of 2026-10-14) for Track Day laps and runs, Streamer Combat and
  Catch the Ace!, none yet for training or the war;
- phase 2: flight time per aircraft (src/share/flighttime.js) with its
  milestones as pips in the hangar; landings, crashes and laps per
  aircraft counted from the event log (src/game/events.js) into progress;
- phase 3: medals on built courses (src/game/medals.js);
- phase 4: discovery (section 6, the lead's decision of 2026-10-15):
  twelve named places at Itaipu, none yet in the other three worlds
  (section 6.1 says why);
- phase 5: the aircraft challenges (section 5.1, the same decision):
  three on every aircraft, by its class;
- phase 6, in part: the pilot's numbers on Flight Club's page
  (src/ui/pilotstats.js, docs/PILOT-STATS.md), landings among them.

Certifications arrive with TRAINING.md. It extends what exists and
replaces none of it.

## 1. What exists, and stays

| System | Where | What it does |
| --- | --- | --- |
| XP and levels | src/game/progress.js | XP from laps (`LAP_XP`, 40 to 50 a lap, 40 more the first time on a course) and seven challenges (40 to 200). `LEVEL_XP` 0, 60, 180 ... 3100, then 800 a level. Levels open planes (`PLANE_LEVELS`), power options, paint schemes past the first two, props, add-ons, decals. |
| Unlock all | settings, the hangar's Challenges tab | Opens everything; on for any profile from before progression. |
| Challenges | progress.js `CHALLENGES`, judged by `RunWatch` | Seven small stories ("round a course on the small tank before the engine quits"). |
| The war's economy | src/game/campaign.js | Stars (three a mission), credits (100 a star, 10 a team kill), a shop: warheads, rack slots, speed. |
| Records | src/share/board.js | Lap times and ghosts per track. |
| Sync | src/share/progressmerge.js | XP the higher of two devices, flown courses and challenges the union, the campaign's upgrades the union. |

The owner's rule on this, in progress.js: plane racing stays casual and
finishable by a small child; a child flying twenty minutes sees most of
the hangar. Nothing below slows that.

## 2. The rules

1. **New XP comes from firsts and bests, never from repetition.** A thing
   done for the first time, or done better than before, pays; the same
   thing again pays nothing. Grind is impossible by construction, not by a
   cap. (Laps keep paying as they do: that is the child's curve, the
   owner's decision.)
2. **Two economies, never exchanged.** XP and levels open the hangar.
   Credits and stars belong to the war and buy only its loadout. No item
   can be bought with the other's currency.
3. **Nothing makes an aircraft better.** Unlocks are aircraft, power
   options the real kit offers, paint, props and add-ons the kit takes. A
   later aircraft is different, not superior (PILLARS 9).
4. **Nothing expires.** No weekly event, no streak, no daily login, no
   timer on a reward.
5. **Everything syncs by the same rule as today:** counts merge as the
   higher of two devices, sets as their union. A pilot flying two devices
   offline may undercount; nobody can overcount.
6. **Unlock all keeps working** for every new kind of unlock.

## 3. XP from every activity

Today only Track Day pays. Each activity gets a first and a best:

| Activity | Pays XP for |
| --- | --- |
| Track Day | as today: laps, firsts on a course; plus a medal's first award (section 4); a new best lap and run per course and class (3.1) |
| Free Flight | each world's landmarks, found once each (section 6) |
| Streamer Combat | a round finished, once per world; a new best score per world (3.1) |
| Catch the Ace | a match finished, once per world; a new best score per world (3.1; the first sketch said time as Ace, the lead's rule of 2026-10-14 names the score) |
| Defend the Paraná | a mission's first win, and each star the first time it is earned (credits stay as they are) |
| Training | each lesson passed, once (TRAINING.md) |

The amounts sit on the existing scale (40 to 200), so a war pilot reaches
the same hangar a racer does, at a racer's pace.

### 3.1 Bests (the lead's decision, 2026-10-14)

**The rule.** A best is a personal record the game already measures with
a clear better direction, per activity and per place. It is set only
from the event log (src/game/events.js) of a finished, valid run, never
from the screen. XP is paid once for the first best on a key and a
smaller amount each time it improves by a real margin, never for matching
it. Where the rule cannot value an activity, it is left out, and why is
written here.

| Best | Key in `bests` | Better | Margin | Read from |
| --- | --- | --- | --- | --- |
| A lap, per course and aircraft class | `lap:<class>:<course>` | lower ms | 10 ms | the `lap` event's `ms`, `course`, `airframe` |
| A solo run of N laps, per course and class | `run:<N>:<class>:<course>` | lower ms | 10 ms | the run's N `lap` events, `n` 1 to N of `of` N |
| A Streamer Combat round, per world | `combat:<world>` | higher points | 1 point | the `round` event's `points` |
| A Catch the Ace! match, per world | `tag:<world>` | higher points | 1 point | the same |

<class> is the aircraft's (configs/airframes.js CLASSES: multirotor,
plane, wing, glider), <course> the course key a lap's first is filed under
(src/main.js progressCourse).

**Valid.** A lap counts only when it began inside its flight's log: its
`ms` is no longer than the log's time since `spawned`. A reset
(src/main.js resetCraft, a recovery that keeps the lap clock running) and
a developer hook putting the craft somewhere (__placeCraft, which every
gate check flies by) both start a new log, so no lap across either is a
best. A run counts only when all its laps, 1 to N, closed in one log in
order, on one course and one aircraft; a room race has no solo run, so
its laps count and its runs do not. A round's points are the room's own
final standings (edge/rooms is the authority) and no developer op of the
rooms touches Streamer Combat or Catch the Ace!, so a round is valid as
logged.

**The margin** is the resolution the pilot reads the number at. A time is
shown in hundredths (src/ui/format.js formatTime) and the gate judge
interpolates the crossing to well under that (src/game/race.js pass), so
10 ms is the least gain the clock can show the pilot; a gain under it is
kept as the record (a record is a record) and pays nothing. Points are
counted, never measured, so one point is a real gain. Creeping under the
margin many times never pays: each step is judged against the best held.

**XP:** `BEST_XP` 40 for the first best on a key, 20 for a real
improvement (src/game/progress.js), the lane's call on the firsts' scale,
reversible. They stack with what the same act already pays: a first lap
on a new course pays its lap (40 to 50), the first lap bonus (40) and the
first lap best (40); a first round on a world pays its first (40) and its
first best (40). Bests pay XP only, never tokens: built courses make the
list unbounded, so they stay out of `firstsOf` (src/game/economy.js pays
tokens from that finite list).

**Left out, and why:**

- **Training.** No lesson is timed (src/game/training.js LESSONS: laps,
  clean laps, a ghost, a medal, holds); a lesson's laps are course laps
  and set the course's lap best like any other.
- **The war** (Defend the Paraná and The Interior). The `mission_end`
  event carries the mission, won and stars, no time and no losses; the
  view's result does not say whether the host used the developer skip or
  complete ops (edge/rooms/war.js devOp), so a valid run cannot be told
  from the log. Its ladder is already the firsts: the win and each star
  once, and No losses is a star. A time and a loss count would need the
  war's result to carry them and a dev mark, which is the rooms' to add.
- **Trick Battle and Free Flight** were not in the decision; the board
  already keeps Free Flight's best score (debrief.run_best).

**Where it shows.** A toast when a best pays ("New best"), a "New best
lap", "New best run" or "New best score" line first in the debrief's
records, with the new value and the one it replaced (src/game/debrief.js
withBests, src/ui/factlines.js), on the solo race, the room race (laps)
and Catch the Ace!'s results. Streamer Combat's end is a card in flight
(docs/DEBRIEF.md), with no facts block, so its best shows as the toast
and on Flight Club. Flight Club's pilot numbers (docs/PILOT-STATS.md):
Track Day's line counts its lap and run bests, Streamer Combat's shows
its highest round; Catch the Ace!'s line already shows its best match
(src/share/pilotcounts.js), the same number over every world.

**Beside what exists.** src/share/records.js keeps the lap board's best
per course, aircraft, pack voltage and gravity, and the race debrief's
"Track record" line reads it; it pays nothing and stays. A best is
coarser (per aircraft class) and pays XP. That the war pays XP,
for firsts only, was decided by the lead on 2026-10-03, reversible
(PLAN.md 6, item 15).

## 4. Medals on courses

Every course gets bronze, silver and gold times:

- a built course (the track builder) carries its builder's three times,
  set in the builder from the builder's own laps (gold at the builder's
  best, silver and bronze at fixed ratios), so the medals mean "fly it the
  way its maker did";
- a course with board entries can also show where a time sits among them,
  but medals never depend on other people's times, so they never move.

A medal pays XP once, the first time it is reached. The pilot record shows
medals per course.

## 5. Aircraft mastery

Per aircraft, all counted by the shell from what it already knows (the sim
clock in flight, the plant's grounded state, the crash flag):

- **flight time** (sim seconds in the air, summed);
- **landings** (a ground contact under a gentle sink rate with no part
  past its limit, the damage mode's own judgement);
- **one challenge per aircraft**, judged by `RunWatch` like the seven
  that exist (twenty aircraft, so thirteen to write; each a small story of
  that kit, the way `bombshell_glide` and `kadet_small_tank` are);
- **milestones**: first flight, first landing, its challenge, an hour in
  the air. Each milestone shows on the aircraft in the hangar. The hour
  opens one livery for that aircraft, its only reward that is not XP.

### 5.1 The aircraft challenges (the lead's decision, 2026-10-15)

**Changed from the sketch above:** not one hand written story per
aircraft but three per airframe class, the same three stories for every
class, each built from what the event log (src/game/events.js) already
measures, with the amount the class's own measured numbers give, written
next to it in src/game/progress.js (`CLASS_CHALLENGES`). Each is paid once
per aircraft (by family: a float plane's is its land plane's), XP only,
`AIRCRAFT_CHALLENGE_XP` 60 (a lesson's first, the lane's call on the
firsts' scale), kept in `progress.aircraftChallenges` as
'<family>:<challenge>', shown in the hangar's Challenges tab first, under
the aircraft's name, as a toast when it is done, and as a "Challenge
complete" line on the debrief that follows it, where one does (the race,
the room race, a room game's end, the scored freestyle run;
src/game/debrief.js withBests). Free Flight with scoring off has no
debrief, so there the toast is the notice.

| Challenge | Read from | multirotor | plane | wing | glider |
| --- | --- | --- | --- | --- | --- |
| landings | `landing` events in one log, no `crash` between, one aircraft | 3 | 3 | 3 | 3 |
| lap | a `lap` of kind `casual`, valid as a best is (3.1) | 360 m at 13 m/s: 28 s | 3 200 m at (stall + top) / 2 | as plane | 3 200 m at best glide |
| endurance | a `landing`'s `airMs`, take off to touchdown, inside its log | 300 s | 300 s | 300 s | 600 s |

Where each amount comes from:

- **3 landings**: the approaches lesson's three (src/game/training.js
  wing_approaches), read from it.
- **The casual track**: its size is fixed by the aircraft it was made
  with (src/builder/course.js CASUAL, 8 gates 45 m apart for a quad, 400 m
  for a fixed wing). A multirotor's pace is the AI pilot's measured
  13 m/s, the fastest it follows the plant through gates
  (scripts/aipilot-harness.js; the casual quad oval is sized to that
  line's tightest turn). A plane's and a wing's pace is the middle of its
  own measured stall and top speed (configs/airframes.js), so from the
  F-16's 111 s to the Slow Stick's 436 s. A glider's top speed is a dive
  or the throw, so its pace is its best glide, the speed its plant trims
  at (the Radian 7.7 m/s, 416 s; the NRJ 5.13 m/s, 624 s): a lap that asks
  for lift. Rounded up to the second.
- **Endurance**: half the ten minute milestone (`MILESTONE_S.ten`), and
  all of it on a glider, whose flight is soaring.

**Left out, and why:** the brief named a trick for an aircraft with
tricks, but the log carries no trick (the detectors land them on the
freestyle scorer in src/main.js, outside the log), so the three are what
the log measures. Known edge, accepted: the lap event does not say which
size of casual track it was, so a plane flying a quad's 360 m track meets
its 3 200 m time easily; it pays 60 XP once.

## 6. Discovery in Free Flight

Each world gets a short list of named places (the Alps' church and lake,
the Swiss valley's falls and strip, Itaipu's crest, spillway and
switchyard), each a point and a radius in the world's registry entry.
Flying through one the first time marks it found and pays XP once. A world
"explored" when all are found. This is the Flight Club's quiet reason to
fly somewhere new, and it costs nothing at runtime: one distance test a
frame against a dozen points.

### 6.1 As built (the lead's decision, 2026-10-15)

**The rule.** A place is a named, real thing in the world's own data,
with one short factual line (en and es) from a source the repository
already cites; no invented history, no person named; 6 to 12 a world.
Found by flying within its radius across the ground and no higher than
its radius over what is under the craft, any flight in that world, and
not on a flight that began inside it (a spawn, a room's start slot, a
developer placement). Paid once, `PLACE_XP` 40, the firsts table's Flight
Club amount (`FIRST_XP.game`), XP only: a place is not in `firstsOf`, so
no token is paid for it. The places live in src/game/discovery.js, not
the registry entry, since the registry pulls the string table and the
server reads progress.js. Shown as a toast with the place and its line.

**Itaipu, twelve** (coordinates from the map's dam data and
docs/ITAIPU-PLAN.md section 4; facts from ITAIPU-PLAN.md, which quotes
Itaipu's own pages, and src/maps/itaipu/town/bridge.js):

| Place | Its line |
| --- | --- |
| Main dam | hollow gravity and buttress, 1 064 m long, 196 m high |
| Diversion structure | concrete gravity, 170 m long, 162 m high |
| Right wing dam | concrete buttress, 998 m long, 64.5 m high |
| Spillway | 14 gates of 20 by 21.34 m, up to 62 200 m3/s |
| Powerhouse | 968 m long, 20 penstocks of 690 m3/s each |
| Rockfill dam | left bank, 1 984 m long, 70 m high |
| Left bank earth dam | 2 294 m long, 30 m high |
| Itaipu reservoir | normal level 220.30 m, 223.10 m in a flood |
| Paraná River | below the dam it runs at about 1 m/s |
| Right bank substation | 50 Hz and 500 kV, on 48 ha |
| Acaray hydro plant | Paraguayan, 210 MW |
| Friendship Bridge | a concrete deck arch |

**The other three worlds have none, on the rule.** The Alps and the Swiss
valley are one procedural valley that takes Lauterbrunnen only as an art
reference (docs/SWISS2-ASSETS.md: "Nothing here is a real map, a real
village"); its church, lake, falls and strip are real in the data but
have no name and no sourced fact. Every name in The Interior is invented
on purpose (src/share/interior/places.js, `lint:interior-names`). Either
can be given places by a looser rule (the valley's features by what they
are, the Interior's by the campaign bible's names and lines): a row
each in discovery.js, the lead's call.

## 7. Certifications

The training curriculum (TRAINING.md) ends each track in a certification:
**Multirotor, Fixed wing, Glider, Racing, Defence**. A certification is a
badge on the pilot record and on the pilot's lobby slot, and nothing else:
it opens no content and gates no room. **Changed from the thread:** no
ranks (PILLARS 7); certifications are civil, like a pilot's ratings.

## 8. The pilot record

One screen, the pilot's: callsign, level, total and per aircraft flight
time, landings, medals, certifications, worlds explored, mission stars,
best laps. All read from the progress and campaign state already synced;
no new server.

## 9. Storage and checks

Progress is `v: 2` (docs/ECONOMY.md), additive inside it: `hours: {
[airframe]: seconds }`, `landings: { [airframe]: n }`, `medals: { [course]:
'bronze' | 'silver' | 'gold' }`, `places: { [world]: { [place]: true } }`,
`lessons`, `certs`, `bests: { [key]: n }` (section 3.1; the earlier
sketch `{ [activity]: { [world]: n } }` could not hold a lap per course
and class). As built, `places` is flat, `{ '<world>:<place>': true }`,
and `aircraftChallenges` the same, `{ '<family>:<challenge>': true }`, so
both merge as the union with the other flag maps; the nested sketch above
would have needed a merge of its own for nothing. `normaliseProgress` fills each from nothing, so an old profile
reads as a new pilot of these and keeps its XP. `progressmerge.js` merges
counts as the higher, sets as the union, medals as the better, bests per
key as the better by the key's direction.

**Bests and the save's migrations.** No step was added to the progress
version list (src/game/progress.js PROGRESS_MIGRATIONS) or the save's
(src/share/save.js MIGRATIONS, phase 19): `bests` is additive, as medals
and the counts were, and a profile from before it is correctly a pilot
with none, so there is nothing to move. A step would only be needed if
an older value had to be read as a best, and none was ever stored under
the name. `progress:selftest` holds the case (a v2 and a v1 profile load
with `bests` empty and everything else kept). The server merges bests
once it runs this progressmerge.js; until then an older server keeps the
sending side's `bests` whole, as it did for medals.

Checks: `progress:selftest` grows a case per rule of section 2 (the same
first twice pays once; a best that is not better pays nothing; a merge of
two devices never exceeds either; Unlock all opens a new kind);
`campaign:selftest` proves credits and XP never convert.

## 10. Phases

Each ships alone:

1. Firsts and bests from Streamer Combat, Catch the Ace and the war (XP
   only). Built: the firsts; bests for Track Day, Streamer Combat and
   Catch the Ace! (section 3.1); the war's bests left out (no time, no
   losses, no dev mark in its result).
2. Aircraft flight time and landings, shown in the hangar.
3. Medals on built courses (the builder sets them).
4. Discovery points. Built at Itaipu, twelve places (section 6.1).
5. Per aircraft challenges. Built as three per class (section 5.1).
6. The pilot record screen; certifications arrive with TRAINING.md's
   phases.
