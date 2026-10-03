# Game pillars

**Status: PROPOSAL for the owner's approval** (2026-10-03). Once approved,
these are the product rules: a feature that breaks one needs the owner's
word first, the way docs/WARFARE-PLAN.md section 0 already works for the
war.

Where this came from: the "Game Pillars and Feature Constitution" the owner
shaped in a ChatGPT thread (42 sections and a final rule), adopted here and
rewritten to be true for this game. Every feature it names is checked
against the code and marked:

- **exists**: in `main` today, with where it lives;
- **partial**: some of it exists, and what is missing is said;
- **in flight**: an open pull request builds it;
- **planned**: in the roadmap (docs/redesign/PLAN.md section 5), not built;
- **not planned**: the thread proposed it and this document does not.

Where this document makes a different choice from the thread, the line
starts **Changed from the thread:** with the reason. The whole list is in
section 44.

## 0. The owner's standing decisions, which win over the thread

These were decided before the thread or outside it. Nothing below
overrides them.

1. **No jamming, no signal loss, no radio breakup** in the flight model or
   on the voices (owner 2026-09-29; docs/WARFARE-PLAN.md 0.9;
   docs/campaign/BIBLE.md 0.9). Electronic warfare is backstory.
2. **Defend only, co-op against the room's AI, kamikaze only.** Players
   never attack anything (docs/campaign/BIBLE.md 0.1).
3. **No people shown harmed; the enemy is never named;** no real
   organisation or real person speaks (BIBLE 0.2 to 0.5).
4. **No real military insignia or slogans.** The flag is always
   horizontal, red, white, blue, and used sparingly.
5. **No named people on the site.**
6. **The war is mature content behind its one consent** (WARFARE-PLAN 9),
   asked of every pilot who enters a room made for it.
7. **The campaign's decisions of 2 October** (docs/campaign/OVERVIEW.md):
   seven missions, the dam can open in any mission, four new voices, a lost
   mission restarts from its stage with at most two stars.
8. **Sessions: public by default, each pilot's last choice remembered**;
   Solo, Friends (private, invite code shown), Public (2026-10-02).
9. **Names: Streamer Combat** (was Toilet paper combat), **Track Day** (was
   Track mode).
10. **Replays keep the room's voices**, for everyone, behind a notice
    before a pilot's microphone first goes live (owner 2026-10-02, #370).
11. **Plane racing stays casual, finishable by a small child**
    (src/game/progress.js header), with Unlock all for anyone.
12. **The flight physics is Betaflight compiled in, deterministic, SI,
    1000 Hz** (CLAUDE.md). No feature may make a flight's trajectory depend
    on frame time or on anything a room does not share.

## 1. Product identity

An aviation simulator that contains combat. Two sides of one product:

- **Operations**: the war. Today one operation, Defend the Paraná (Act 1 at
  Itaipu, missions `itaipu-1` to `itaipu-4` on main, seven designed in
  docs/campaign).
- **Flight Club**: free flight, Track Day, Streamer Combat, Catch the Ace,
  the scenic worlds (Swiss valley, the Alps, Itaipu).

They share, all **exists**: the flight physics (src/native), the 20
aircraft (configs/airframes.js), the controls (src/input), the pilot
(src/share/pilot.js), the worlds (src/maps/registry.js), the session layer
(the room and its lobby, #372), the replays (src/replay). They share
**partially**: progression (XP and levels earn hangar unlocks from racing
only; the war has its own credits and stars; section 7).

The family root is part of the identity: this began as an RC simulator for
three generations of one family to fly together, and Flight Club is where
that lives. It is not a lesser mode.

## 2. The player fantasy

> I am becoming a better pilot, building a hangar of aircraft I understand,
> completing operations that matter, beating my records, and flying with
> the people I want to fly with.

Success comes from skill, not from stats. **Changed from the thread:**
"building a hangar" means learning aircraft, not buying better ones,
because the game's aircraft are real kits flown on one physics, and a
faster copy of one would be a different aircraft (section 9).

## 3. The loop

**Choose, prepare, fly, debrief, progress, fly again.**

| Step | Today |
| --- | --- |
| Choose | **exists**: a title card is one click into its lobby (#372); the hubs are planned (PLAN.md phase 5) |
| Prepare | **exists**: the lobby (aircraft, the host's one setting, Ready); the hangar (power, paint, parts, tuning, loadout) |
| Fly | **exists** |
| Debrief | **partial**: each game has its own end (race results and standings, the war's round card with stars, combat and Ace results); no shared debrief (section 20) |
| Progress | **partial**: race laps and seven challenges give XP; the war gives credits and stars; the rest gives nothing (section 7) |
| Fly again | **exists**: every room goes back to its lobby after a round, nobody ready (FLOW-AUDIT rule 12) |

**Changed from the thread:** no "difficulty" in Prepare. The war scales by
pilot count and by the seed's dials (MISSIONS.md 1.4, 1.6), and assists
(section 19) are the player's difficulty; an "enemies get more health"
knob is the thing section 19 forbids.

## 4. Structure

Home is three hubs: **Operations, Flight Club, Hangar**; settings, the
pilot, credits in the corners (PLAN.md 2.2, decided).

- **Operations** holds the operations. One exists. **Changed from the
  thread:** its "Quick Mission, Intercept, Recon, Strike, Escort, Patrol"
  are not separate modes. Strike breaks standing rule 2. Intercept,
  recon (as spotting), escort and patrol are kinds of *mission* inside an
  act, built on the stage engine (#363), not new modes with their own
  screens. A second operation is a new act or a new region, when one is
  written.
- **Flight Club** holds Free Flight, Track Day, Streamer Combat, Catch the
  Ace. **Changed from the thread:** The Alps is a world, chosen inside a
  session, not an activity. Landing challenges, precision courses and time
  trials are courses and challenges inside Track Day and Free Flight, not
  new modes (section 22).
- **Hangar** is the persistent aircraft ecosystem (section 9).

## 5. Multiplayer is a property of a session

**Exists** since #372: there is no multiplayer mode; every activity is a
room with a lobby; Ready alone starts it; others drop in; after a round
everyone is back in the lobby. Fly with friends is gone.

| Thread item | Status |
| --- | --- |
| Solo, Friends, Public | **partial**: rooms are public or private today; the three values and the remembered choice are planned (PLAN.md phase 6) |
| Invite code | **exists** (private rooms) |
| Join a friend | **exists**: the code, a link (used once, FLOW-AUDIT rule 10), the rooms panel |
| AI fill | **not planned now**: there are no AI pilots (section 12) |
| Drop in | **exists**, except a race on, whose newcomer waits for the next |
| Spectator slots | **partial** (section 25) |
| Party persistence | **exists** in the room: the next round, the next mission, everyone stays (FLOW-AUDIT rule 8) |

## 6. Session architecture

**Exists** as of #374 (in review): src/share/modes.js is the one list of
activities, read by the page and by the rooms server; one lobby class,
one lobby screen. The thread's schema maps onto it; fields nothing reads
yet arrive with the phase that reads them (`maxPlayers`,
`visibilityOptions`, `mapPool`, `estimatedDuration` in phase 6).
**Changed from the thread:** no `difficultyOptions` (section 3) and no
`allowSpectators` until a spectator seat exists (section 25).

## 7. Progression

Rewards mastery and discovery, never time spent. The design is
docs/redesign/PROGRESSION.md. What exists:

- **XP and levels** (src/game/progress.js): earned by laps and seven
  challenges; levels open planes (PLANE_LEVELS), power options, paint
  schemes, props, add-ons, decals; Unlock all opens everything.
- **The war's economy** (src/game/campaign.js): stars (up to three a
  mission), credits (100 a star, 10 a team kill), a shop of warheads,
  rack slots and a speed upgrade.
- **Records**: lap times and ghosts on the board (src/share/board.js).
- **Sync**: settings, progress, campaign and builds follow a signed in
  pilot (src/share/progressmerge.js).

**Changed from the thread:** the two economies stay separate. XP opens the
hangar; credits buy the war's loadout. A shared currency would make a
child's Track Day laps buy warheads, or a war grind buy planes.
**Changed from the thread:** no pilot *ranks*: a rank is a military
insignia in all but name (standing rule 4). The level stays a number, and
skill is shown by certifications (TRAINING.md) and medals.

## 8. Pilot identity

| Item | Status |
| --- | --- |
| Callsign | **exists** (pilot name, src/share/pilot.js) |
| Pilot level | **exists** |
| Flight hours, per aircraft | **planned** (PROGRESSION.md: the sim time the shell already tracks in flight, summed per aircraft into the synced progress) |
| Operations completed, campaign history | **exists** as mission stars and best results |
| Personal records, race records | **exists** (board, ghosts) |
| Medals, certifications | **planned** |
| Favourite aircraft | **planned** (PLAN.md phase 12) |
| Avatar | **not planned**: no faces (the campaign shows no person); a livery is the pilot's picture |

## 9. Aircraft mastery

Twenty aircraft, each a real kit on one physics (configs/airframes.js and
the stage docs per aircraft): mass, inertia, stall, endurance, landing and
handling all differ because the plant computes them, not because a stat
says so. **Exists.** Mastery without inflating physics:

- aircraft challenges (**partial**: seven exist, five tied to one plane);
- liveries and decals (**exists**, opened by level);
- flight hour milestones and badges per aircraft (**planned**);
- My Hangar saved builds (**exists**).

**Changed from the thread:** "special variants" only where the real kit had
one (the floats versions exist), never a stat boosted copy.

## 10. The campaign

**Exists**: Act 1, four missions, stars, a shop, mission 1 free.
**In flight**: the stage engine (#363) and the films (#365) for seven
missions with stages, seeded twists and a restart from the lost stage.
The thread's "where am I, why, what, what changes" is answered by the
bible and the films. **Changed from the thread:** consequences stay inside
a mission (the dam can open, at most two stars when held) and do not carry
from mission to mission until the owner asks: a persistent consequence
punishes a co-op squad for one pilot's bad night.

## 11. Dynamic missions

**In flight** (#363): four dials per mission drawn from the match's seed
(bearing, composition, timing, which twist fires), so no two plays land
the same. Time of day is per mission (dawn, dusk, night in
`itaipu-4`). **Exists**: enemy routes and waves (edge/rooms/war.js,
warhunt.js). Weather: section 17.

## 12. AI

**Exists**: the war's attackers (Strikers, Loiterers, boats, Hunters that
come for the pilots, decoys, scouts), steered by the room; the valley's
traffic (cars, boats, a gondola) as neutral life; race ghosts (your best,
the board's) as the honest racing opponent.

**Not planned now**: AI pilots (wingmen, racing opponents, AI that fills a
room's empty seats). **Changed from the thread:** "AI fill" is hidden, not
faked, until an AI pilot exists that flies the same plant under the same
rules; a bot that cheats physics would break the one thing the game is.
When it comes, it starts as a race opponent driven along a ghost's line.

## 13. Failure

**Exists**: race lost, run aborted, the war's round lost, out of airframes
(four a round, one more a kill); quick restart (every room's lobby after
a round, nobody ready). **In flight**: restart from the lost stage, at most two stars
(#363). Failure costs nothing to repair outside the war.

## 14. Damage

**Exists**, more than the thread assumed: the plant's damage mode
(src/native/sim_abi.h, sim_set_damage) attributes every contact to the
part it struck, and parts crush, chip, bend and break off; the hangar's
Parts tab repairs or tapes them (`crashDamage` setting, on by default). In
the war a pilot's aircraft is a one way warhead, and Hunters hunt it.

**Changed from the thread:** the thread drops component damage; this game
keeps it, because it is physics the pilot *feels* (a chipped prop vibrates,
a broken wing rolls), not systems the pilot manages. What the thread was
right about is presentation: the HUD and the debrief say it in three
words, **Operational, Impaired, Destroyed**, defined as:

- **Operational**: no part past its limit;
- **Impaired**: a part chipped, bent, taped or lost, still flying;
- **Destroyed**: the plant's crash state, or a war airframe spent.

No motor health, battery health or maintenance hours: not planned.

## 15. Signal and navigation

**Not planned**, by standing rule 1: no RSSI model, no link loss, no GPS
degradation. **Exists** as feel only: the RC link's latency presets
(src/input/link.js) and the avionics HUD's link panel, which shows a link
and never takes it away.

## 16. The realism rule

> Realistic where realism makes flying more satisfying. Abstract where it
> makes the game less enjoyable.

Realistic, **exists**: handling, momentum, scale, camera, control response
(Betaflight itself), real kits' numbers. Abstract: everything in sections
14 and 15.

## 17. Weather

| Effect | Status |
| --- | --- |
| Wind and gusts in flight | **partial**: the plant has them (sim_set_wind: mean up to 30 m/s, gusts as a fixed sum of cosines on the sim clock, deterministic); nothing in the game sets them yet |
| Thermals | **exists** for the soaring planes (sim_air_lift) |
| Water that answers wind | **exists** (src/native/water.c) |
| Time of day | **partial**: per world and per mission |
| Fog, rain, clouds | **partial**: haze and sky per world; no rain |

**Changed from the thread:** weather that changes flight must be
deterministic and room authoritative: the room's setup holds it (calm,
breeze, gusty), every pilot's plant gets the same `sim_set_wind`, and a
replay replays it. Weather that is only seen (rain, fog) may be local.
Calm is the default, so Flight Club stays a child's game unless the host
asks for wind.

## 18. Training

The curriculum is docs/redesign/TRAINING.md. **Exists**: How to fly (live
sticks per input), the calibration wizard, the first flight hint, the
trainer as the first aircraft (Turbo Timber), angle mode and stabilised
wings, launch control, seven challenges, mission 1 of the war free.
**Planned**: a curriculum of lessons judged by the existing challenge
watcher, and certifications.

## 19. Assists

| Assist | Status |
| --- | --- |
| Auto level | **exists**: angle mode (quads), Stabilised tunes (wings) |
| Arcade flight style | **exists**: an ideal quad, off the public board |
| Launch control | **exists** |
| Mouse flight, touch sticks | **exists** |
| Full manual, acro | **exists** |
| Landing aid, trajectory line, racing line | **planned** (TRAINING.md) |

Difficulty is never enemy health (section 3).

## 20. Debrief

**Partial**: race results with standings and ghosts; the war's round card
(stars, kills, credits); combat and Ace results. **Planned**: one debrief
frame every activity fills from its own result (what happened, how I did,
did I improve, what next), with the replay one press away and the next
action (Again, Next mission, Back to lobby) under the cursor. Route,
altitude and speed come from the replay's own recording, which already
holds them.

## 21. Replays

**Exists**, strongly: the crash cam's editor (src/replay): shots, cuts,
six camera rigs (chase, orbit, free, tripod, FPV, follow), speed, looks,
moments, movie export, My clips, war recordings. **In flight**: the map as
the war left it (#367), the flight's sound (#369), the room's voices
behind a notice (#370, standing rule 10).

## 22. Flight Club progression

**Exists**: course records, ghosts, the board, laps for XP, challenges.
**Planned** (PROGRESSION.md): medals per course (bronze, silver, gold
against a time the course's builder set or the board's spread), course
completion per world, discovery of each world's landmarks, a family board
(the pilots of one room, kept on the device). **Changed from the thread:**
no weekly events that expire: a child should not miss something because
they did not play that week.

## 23. Repeatable content

**In flight**: seeded mission variants (#363). **Planned**: a course of the
day from the board (one seed, the same for everyone). **Not planned**:
daily login rewards and streaks (section 40).

## 24. Editors

**Exists**: the track builder (in world, B key; and src/trackbuilder),
publishing to the board. **Not planned** before Act 1 ships: a mission
editor.

## 25. Spectating

**Partial**: a war pilot out of airframes spectates a teammate; a race's
late joiner watches. **Planned**: a watch seat in any room (a parent
watching a child race), using the replay's follow camera on live peers.

## 26. Controllers are core

**Exists** (src/input/input.js): the Gamepad API (a RadioMaster or any
radio in joystick mode, any pad), device choice by wiggle, the calibration
wizard with live gimbals and a raw axis strip, reverse per channel, stick
modes 1 to 4, keyboard, mouse, touch. **Partial**: dead zone (fixed),
expo (mouse only). **Planned** (PLAN.md phase 7): one controller screen
with dead zone, expo, a channel editor, presets per device, profiles per
aircraft class. **Not planned now**: WebHID, because the Gamepad API
already reads the radios.

## 27 to 31. UI structure and visual identity

As PLAN.md section 4, decided: three hubs; secondary items in the corners;
one design system on the PDCS tokens; one accent per hub (Operations
blue, Flight Club copper, Hangar steel); Saira for the name, Saira
Condensed for hub and mode names; in engine art only. **Changed from the
thread:** no Exit item: a browser tab has none.

## 32. Paraguay

Geography first: the Paraná, Itaipu, real place names, coordinates where
they are true. The flag horizontal and rare (standing rule 4).

## 33. Naming

Streamer Combat, the toilet paper kept in its line and its art. Track Day.
Decided.

## 34. Audio

**Exists**: menu sounds (move, adjust, select, back), engines per
aircraft, the world's ambience and vehicles, the war's attackers and
explosions (docs/AUDIO.md). Radio clicks and airfield ambience in menus:
**planned** with the hubs.

## 35. Content from data

**Exists** for activities (#374), aircraft (configs/airframes.js), worlds
(src/maps/registry.js), missions (src/share/war/missions), unlockables
(registerUnlockables). New content is a row, not a screen.

## 36. The design system

**Exists**: the UI playground, development only (tests/browser,
`npm run ui:playground`, #371).

## 37. Screens

The title's checks already hold 1280x720, 1920x1080, 390x844, 360x640,
844x390 (`modes:card`). **Planned**: ultrawide (2560x1080) added with the
hubs.

## 38. Performance

**Changed from the thread:** the thread says not to load a 3D scene for a
menu. This game's menu stands over the world the pilot is about to fly,
already built, so it costs nothing extra; the gate covers it with the boot
screen's ground. No background video: the art is renders of our worlds.

## 39. The feature test

Does it improve flying, mastery, tactical decisions, progression,
replayability, social play, expression, atmosphere or accessibility? If
not, it waits.

## 40. Not this game

An RF engineering simulator; a maintenance simulator; a systems
management damage model; a generic military shooter; a milsim that needs
an encyclopaedia; a grind or a live service (no energy, no daily streaks,
no paid shortcuts, no loot boxes); a set of unrelated minigames; an arcade
game pretending to be a simulator.

## 41. Scope

Depth over systems. A feature that only adds realism, or only copies
another simulator, waits.

## 42. Priorities

**Changed from the thread:** the thread's order (sessions, debrief,
progression, campaign, AI and dynamic missions, training and controllers,
replays) is re-ordered against what has shipped:

1. **Sessions**: done (#372, #374 in review); the three visibilities next.
2. **The campaign engine and films**: in flight (#363, #365); it is the
   war's whole content and it is nearly done, so it lands first.
3. **Training and controllers**: moved up from sixth. Controllers are the
   product's identity and the first five minutes decide whether a new
   pilot stays; everything after assumes a pilot who can fly.
4. **Debrief**: one frame for every activity's end.
5. **Progression**: XP from every activity, medals, flight hours.
6. **Dynamic missions and weather**: the seed dials ship with #363;
   room wind after.
7. **Replays**: moved down from a headline item to finishing work, because
   most of it exists (#367, #369, #370 in flight).
8. **AI pilots**: last, and only as a ghost driven race opponent first.

## 43. The final rule

> **Does this make someone want to fly one more time?**

I have aircraft I know. I have a pilot history that is mine. I have
missions I want to finish. I have records I want to beat. I have people I
fly with. And I want one more flight.

## 44. Every change from the thread, in one list

1. Building a hangar means learning aircraft, not buying better ones (2).
2. No difficulty setting; pilot count, seeds and assists instead (3).
3. Operation types are missions inside acts, and there is no Strike (4).
4. The Alps is a world, not an activity (4).
5. No difficultyOptions or allowSpectators fields until they exist (6).
6. Two economies kept apart: XP for the hangar, credits for the war (7).
7. No pilot ranks: a rank is an insignia in all but name (7).
8. No avatar: no faces (8).
9. No stat boosted aircraft variants (9).
10. Campaign consequences stay inside a mission (10).
11. AI fill hidden, not faked; AI pilots last (12).
12. Component damage kept as physics, shown in three words (14).
13. Weather that changes flight is deterministic and the room's (17).
14. No expiring weekly events (22).
15. No Exit item (27 to 31).
16. The menu keeps the live world behind it (38).
17. Priorities re-ordered against what shipped (42).
