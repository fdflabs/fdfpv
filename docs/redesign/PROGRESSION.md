# Progression: mastery and discovery, no grind

**Status: PROPOSAL** (2026-10-03), under docs/PILLARS.md sections 7, 8, 9
and 22. Nothing here is built. It extends what exists and replaces none of
it.

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
| Track Day | as today: laps, firsts on a course; plus a medal's first award (section 4) |
| Free Flight | each world's landmarks, found once each (section 6) |
| Streamer Combat | a round finished, once per world; a new best score |
| Catch the Ace | a match finished, once per world; a new best time as Ace |
| Defend the Paraná | a mission's first win, and each star the first time it is earned (credits stay as they are) |
| Training | each lesson passed, once (TRAINING.md) |

The amounts sit on the existing scale (40 to 200), so a war pilot reaches
the same hangar a racer does, at a racer's pace. Where the War pays XP is
an owner decision (section 9).

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

Progress stays `v: 1`, additive: `hours: { [airframe]: seconds }`,
`landings: { [airframe]: n }`, `medals: { [course]: 'bronze' | 'silver' |
'gold' }`, `places: { [world]: { [place]: true } }`, `lessons`, `certs`,
`bests: { [activity]: { [world]: n } }`. `normaliseProgress` fills each
from nothing, so an old profile reads as a new pilot of these and keeps
its XP. `progressmerge.js` merges counts as the higher, sets as the union,
medals as the better.

Checks: `progress:selftest` grows a case per rule of section 2 (the same
first twice pays once; a best that is not better pays nothing; a merge of
two devices never exceeds either; Unlock all opens a new kind);
`campaign:selftest` proves credits and XP never convert.

## 10. Phases

Each ships alone:

1. Firsts and bests from Streamer Combat, Catch the Ace and the war (XP
   only).
2. Aircraft flight time and landings, shown in the hangar.
3. Medals on built courses (the builder sets them).
4. Discovery points in the three worlds.
5. Per aircraft challenges, thirteen new.
6. The pilot record screen; certifications arrive with TRAINING.md's
   phases.
