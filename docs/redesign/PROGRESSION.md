# Progression: mastery and discovery, no grind

**Status: PARTLY BUILT** (proposed 2026-10-03, under docs/PILLARS.md
sections 7, 8, 9 and 22; state as of 2026-10-14). docs/ECONOMY.md is the
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
- phase 6, in part: the pilot's numbers on Flight Club's page
  (src/ui/pilotstats.js, docs/PILOT-STATS.md), landings among them.

Waiting for content, not code: discovery (section 6) needs each world's
named places, their radii and an XP amount; the per aircraft challenges
(section 5) need their stories and amounts. Certifications arrive with
TRAINING.md. It extends what exists and replaces none of it.

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

## 6. Discovery in Free Flight

Each world gets a short list of named places (the Alps' church and lake,
the Swiss valley's falls and strip, Itaipu's crest, spillway and
switchyard), each a point and a radius in the world's registry entry.
Flying through one the first time marks it found and pays XP once. A world
"explored" when all are found. This is the Flight Club's quiet reason to
fly somewhere new, and it costs nothing at runtime: one distance test a
frame against a dozen points.

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
and class). `normaliseProgress` fills each from nothing, so an old profile
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
4. Discovery points in the three worlds.
5. Per aircraft challenges, thirteen new.
6. The pilot record screen; certifications arrive with TRAINING.md's
   phases.
