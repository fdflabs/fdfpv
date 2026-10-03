# The redesign: three hubs, one session system, one design system

**Status: PROPOSAL, awaiting the owner's approval.** Nothing in this file
is built yet except the UI playground (section 4.5). Written 2026-10-02
against `main` at 6ba32c70, with the unmerged lobby work read from branch
`one-click-lobbies` (c4dd2abe) and PR #359. OVERVIEW.md is the one page
version for the owner.

The owner's direction, in short: an aviation simulator that happens to
contain combat; a home of three hubs (Operations, Flight Club, Hangar);
one flow for every activity (choose it, configure the session, Ready,
fly); multiplayer as a property of a session, never a mode; modes as data;
one session system; one design system. The owner's own warning governs
every row below: the five mockups are art direction, not a spec, and
every element is checked against what the game supports.

## 0. What the code says, before anything is designed

Checked against the tree, because the brief this plan answers was partly
out of date.

1. **The mode registry already exists, four times.** Every mode is keyed
   by the same few ids in four tables that nothing holds together:
   `WAYS` (src/ui/ui.js 3132: the title cards, their art, airframes,
   world), `LOBBY_GAMES` (src/main.js on `one-click-lobbies`: the lobby's
   per game start, setting and rows), `GAMES` (edge/rooms/gamelobby.js in
   #359: the server's per game start and setting) and `ROOM_MODES` /
   `ROOM_SETUPS` (src/share/roomwire.js 565: what a room may be made
   for). The owner's "modes are configuration objects" is a merge of
   these, not a new structure.
2. **The lobby is one parameterised lobby, with leaky edges.** It is not
   five lobby implementations: one `RoomGameLobby` class on the server,
   one lobby screen on the client, each driven by its table. But the
   tables do not carry everything that differs, so about five branches on
   the game's id remain on the server (core.js `games()` minimum players
   for tag and combat, the free flight `live` listing, combat's results
   wait, tag's abandon rule, two war checks) and about thirteen on the
   client (main.js: war only result line, war consent, race track summon,
   the combat/tag/race start chain, tag hot join; roombrowser.js:
   `doingNow` for war and combat). Each becomes a field (section 3).
3. **There is no client lobby PR.** #359 is the server half; the client
   is the pushed branch `one-click-lobbies` with no pull request yet.
4. **The owner already decided part of this on 2 October** (FLOW-AUDIT.md
   rules 11 to 17, on the lobby branch): Fly with friends is gone, every
   card is one click into its game's lobby, every lobby is played alone
   too, a card press joins the busiest public room for its game or makes
   one. So after the merge the title has five cards, not six, and a
   session layer exists. This plan builds the hubs over it and keeps its
   click count (section 2.3).
5. **The title's checks all run in a browser, none in CI.** `lint:shell`,
   `modes:card`, `friends:card`, `war:card`, `campaign:check`,
   `boot:loader`, `flow:check` and the branch's `game:lobby` drive
   headless Chromium locally. Every phase below names which it rewrites.
6. **`wordmark()` exists on main** (ui.js 1849); #368 reskins it in Saira,
   a webfont subset to the name's capitals only. Every other face is the
   system's (IBM Plex where installed). A condensed face for hub and mode
   names is a new decision (section 6).
7. **The campaign code has four missions**, `itaipu-1` to `itaipu-4`
   (src/game/campaign.js `ACT1`); docs/campaign/ designs seven, and the
   mission engine (#363) and films (#365) are open PRs.
8. **No dev build exists.** No flag, no `?dev`. What the site leaves out
   is what `.github/workflows/pages.yml` excludes, which includes
   `tests/browser`, where the dev pages (craft preview, harnesses) live.
   The playground goes there.
9. **No check enforces the no dash rule** across the repo. `lint:copy`
   checks that prose lives in src/strings; the only dash test is
   `scripts/editor-ui-check.js` 77, on replay strings. The playground's
   check tests its own files and these docs; a repo wide copy lint is
   phase 2.
10. **Solo combat and solo Catch the Ace are practice against nobody.**
   The lobby branch lets every game start alone; there are no AI pilots
   anywhere in edge/rooms. The war's attackers are the only AI.

## 1. The five mockups, element by element

Verdicts: **exists** (the game has it; what it maps to), **rename** (it
has it under another name or shape), **defer** (worth having, not yet
built, named phase), **invented** (not in the game and not proposed;
dropped). **Rule** marks an element the project's rules forbid.

### 1.1 mock-home.png

| Element | Verdict | In the game |
| --- | --- | --- |
| Flag bar, PARAGUAYAN DRONE COMBAT SIMULATOR | exists | `wordmark()`, Saira lockup in #368. The flag is horizontal, red white blue, as drawn. |
| FLY / TRAIN / COMPETE / DEFEND tagline | invented | No train mode. Dropped; the hubs say it. |
| Paraguay outline, coordinates, top right | invented | Decoration that reads as data. Dropped from home. |
| Hero photograph: a soldier in goggles over a river | invented | AI art, and a person: the campaign bible puts no person on screen. Replaced by the live title world (the menu already stands over it) or an in-engine render. |
| Three numbered hub cards | rename | New hub cards built from today's mode card (`gate-card`), section 4. |
| OPERATIONS art: drone over smoke | rename | `assets/posters/itaipu.jpg` today; a war render from the replay scene (src/replay/warscene.js) in phase 3. |
| CAMPAIGN | exists | It IS Defend the Paraná (the `campaign` way). One entry, not two. |
| QUICK MISSION, INTERCEPT, RECON, STRIKE | invented | No such modes. Dropped. |
| DEFEND THE PARANÁ | exists | The campaign: Act 1 at Itaipu, missions `itaipu-1` to `itaipu-4`. |
| FLIGHT CLUB art: quad and race gates | rename | `assets/gate/race.jpg` / `flight.jpg` (scripts/gatecards.js renders). |
| FREE FLIGHT | exists | The `freestyle-wing1000` way. |
| TRACK DAY | rename | Track mode (`race-5inch`). Rename is a decision (section 6). |
| STREAMER COMBAT | rename | Toilet paper combat (`combat`). Lead decision: renamed, the toilet paper kept in the line. |
| CATCH THE ACE | exists | The `ace` way, room game `tag`. |
| THE ALPS | rename | A world (`alps`), not an activity: a choice inside Free Flight's session. |
| HANGAR art: drone on a bench | rename | An in-engine render from the hangar's 3D garage (src/ui/hangar.js) via the craft preview path. |
| AIRCRAFT | exists | The aircraft picker (src/ui/carousel.js), 20 aircraft. |
| LOADOUTS | exists | Hangar Loadout tab (combat craft) and the campaign loadout (rack, warhead, speed). |
| CAMERAS | rename | Camera angle and field of view, today global settings; per aircraft in phase 6. |
| UPGRADES | rename | The campaign shop (src/game/campaign.js `UPGRADES`), moved under Hangar. |
| CONTROLLER | exists | Choose joystick, Calibrate sticks, Check sticks, Stick mode (Settings today). |
| SETTINGS | exists | The Pilot screen; secondary navigation, not a hub. |
| Avatar, FERNANDO, PILOT | rename | Pilot name exists (src/share/pilot.js); level exists (src/game/progress.js). Avatar invented. |
| Friends, language, settings icons | rename | Language and settings exist. Friends list invented (rooms have invite codes, not friends). |
| Clock 17:32 | invented | Dropped. |

### 1.2 mock-overview-9screens.png

| Screen and element | Verdict | In the game |
| --- | --- | --- |
| 1. Main menu as a list, SETTINGS, EXIT | rename | The hubs as cards; Settings secondary. Exit is meaningless in a browser tab: invented. |
| 1. v0.1.0 BETA | exists | `ui.beta` note; version in version.json. |
| 2. Operations, six operation cards | invented, but one | One operation exists (Defend the Paraná). Operations opens on its missions (section 2.2). |
| 3. Briefing text | exists | `campaign.m.<key>_blurb` today; per mission briefings in docs/campaign/MISSIONS.md once #363 lands. |
| 3. Map with threat markers | defer | The Itaipu map exists; a briefing render of it does not. Phase 4 uses the poster; a marked map is later. |
| 3. EST. TIME 15 to 30 minutes | rename | Real: 9 to 20 min by mission (MISSIONS.md section 2), after #363. |
| 3. PLAYERS 1 to 4 (co-op) | rename | Real: 1 to 8, the war scales by pilot count (MISSIONS.md 1.6). |
| 3. CONTINUE | rename | Ready, in the session. |
| 4. Flight Club, five activity cards | exists, three renames | As in 1.1: The Alps folds into Free Flight. |
| 5. STREAMER COMBAT, VALLEY AIRFIELD | rename | The world is the room's: Swiss valley by default. "Valley Airfield" is invented. |
| 5. 3 to 8 MINUTES, 1 to 8 PILOTS | rename | Real: 3 or 5 minute rounds (the host's setting); 8 pilots private, 16 public. |
| 5. Pilot list with READY | exists | The lobby's pilot slots (`war-lobby-pilot`, generalised on the lobby branch). |
| 5. Open slots | rename | Today's list shows pilots only; empty seats up to the cap are new display, phase 5. |
| 5. Visibility: Friends Only | rename | Rooms are public or private. "Friends" means private with an invite code; there is no friends list. |
| 5. Allow join during game | exists | A behaviour of each game (drop in), not a setting. Shown as a fact, not a switch. |
| 5. AI opponents (if empty) | invented | No AI pilots exist. Hidden until a mode has them. |
| 5. Invite code | exists | Private rooms show it (`lobbyInviteRows`). |
| 5. READY, "starts immediately if you are alone" | exists | The lobby branch: Ready alone runs the five seconds. |
| 6. HUD: speed, altitude, battery, mode | exists | OSD, game and avionics HUD styles. Out of this redesign's scope. |
| 6. Target label SHAHED, RKT x 2 | invented, rule | A real weapon's name; the enemy is never named. Warheads and rack exist without it. |
| 7. Categories ALL, FIXED WING, MULTIROTOR, CUSTOM | rename | Picker tabs today: all, quad, plane, mine (`kindOf`). |
| 7. FAVORITES | defer | Not in the game. Cheap; phase 6. |
| 7. A1 Trainer, A2 Racer, A3 Combat Wing, Q1, Q2 | invented | The real 20 aircraft (configs/airframes.js). |
| 7. Speed, agility, endurance, payload bars | rename | Real bars: weight, speed, flight time (`hangar-stat-bar`). Agility and payload invented. |
| 7. CUSTOMIZE | exists | The picker's Customise opens the hangar. |
| 8. Loadout list General, Racing, Streamer, Combat | rename | My Hangar saved builds per plane (src/ui/builds.js). Role named loadouts are invented. |
| 8. Fuselage, wings, streamer, camera choices | invented | The streamer is a rule of the game, not a part. Parts that exist: power, prop, add-ons, paint. |
| 8. SAVE LOADOUT | exists | Hangar Save. |
| 9. Settings sections | rename | One Pilot screen today; sections are a layout change. Network: link presets exist. Accessibility: none as a section. Credits: exists. |
| 9. Device dropdown RadioMaster Pocket | rename | Choose joystick, by the browser's device name. No vendor profiles. |
| 9. Calibrate | exists | The calibration wizard with live gimbals and the raw axis strip. |
| 9. CH1 to CH9 channel table | defer | Mapping is learned by moving sticks; no manual channel editor. Phase 7. |
| 9. Radio picture | invented | Art of a real product. The live gimbal plates show the same thing truthfully. |
| 9. Reset to default, Apply | exists | Cancel, Save mapping. |

### 1.3 mock-operations.png

| Element | Verdict | In the game |
| --- | --- | --- |
| Top nav PLAY, OPERATIONS, FLIGHT CLUB, HANGAR, SETTINGS | rename | Hubs plus settings. PLAY is redundant with the hubs: dropped. |
| Coordinates panel, Paraguay outline | invented | Dropped. |
| Profile with a rank chevron badge, LVL 12 | rename, rule | Name and level exist; a military rank insignia is against the rules. |
| Power button | invented | A browser tab has none. |
| Hero satellite photograph of the river | rename | An in-engine render of the Itaipu map (posters/itaipu.jpg, or a replay war scene). |
| OPERATION // BORDER DEFENSE, PARANÁ RIVER | rename | "Act 1, Itaipu". "Border" is the mock's story, not the bible's. |
| SATELLITE FEED LIVE inset, EO 1.0x, ALT 1200 m | invented | Fake telemetry on a menu. Dropped. Real telemetry belongs to the flight HUD. |
| Target coordinates, scale bar, north arrow | invented | Only with a real map render; deferred with it. |
| DEFEND THE PARANÁ | exists | `campaign.card`. |
| FOUR POSITIONS. A RIVER. A NATION TO PROTECT. | invented | New copy; the campaign's own line is `campaign.card_blurb`. |
| Paragraph of story | rename | One sentence per card, by the owner's own card rule; the story is told by the films (#365). |
| OPERATION AREA Río Paraná, Alto Paraná | rename | Itaipu, on the Paraná (the `itaipu` world). |
| MISSION TYPE Defense, multi-objective | exists | Stages and objectives (#363). |
| EST. DURATION 30 to 45 min | rename | Per mission, 9 to 20 min (MISSIONS.md). |
| RECOMMENDED PLAYERS 1 to 4 | rename | 1 to 8. |
| Session visibility SOLO, FRIENDS, PUBLIC | rename | Public and private exist; three values map onto them (section 2.4). |
| DIFFICULTY Recruit, Regular, Veteran | invented | No difficulty setting; the war scales by pilot count and seed. Dropped. |
| DEPLOY | rename | The Operations name for Ready. |
| Right column of six operations | invented, but one | As in 1.2. |

### 1.4 mock-flight-club.png

| Element | Verdict | In the game |
| --- | --- | --- |
| Nav, profile with level 23 | rename | As in 1.3. |
| Friends count 3, notification bell | invented | No friends list or notifications. |
| FLIGHT CLUB headline, FLY ANYTHING. ANYWHERE. TOGETHER. | rename | New strings, one line. The paragraph under it breaks the owner's no paragraph rule: dropped. |
| Hero: quad among race gates at sunset | rename | An in-engine render (swiss2 or alps); scripts/gatecards.js already renders gates. |
| Card [01] FREE FLIGHT, open maps, no objectives | exists | Free Flight. |
| [02] TRACK DAY, race gates, time trials, leaderboards | rename | Track mode; ghosts and the board exist. |
| [03] STREAMER COMBAT, FFA, TEAMS, CUSTOM LOBBIES | rename | Combat. Free for all only: teams invented. |
| [04] CATCH THE ACE, dynamic target, timed rounds, EVENTS | exists | Tag, first to a goal. Events invented. |
| [05] THE ALPS, photo mode | rename | A world in Free Flight. Photo mode invented (replays and clips exist). |
| SESSION TYPE Solo, Friends, Public | rename | Section 2.4. |
| PLAY, launch free flight | rename | Ready. |
| CURRENT LOCATION Paraguay Valley, San Bernardino | invented | The world row: Swiss valley, The Alps, Itaipu. |
| SQUAD 3/4 with faces, INVITE FRIENDS | rename | The room's pilots and its invite code. Faces invented. |

### 1.5 mock-hangar.png

| Element | Verdict | In the game |
| --- | --- | --- |
| FUERZA AÉREA PY profile, roundel badge | invented, rule | Real military insignia. Never. |
| "FUERZA AÉREA PARAGUAYA" and a roundel on the airframe | invented, rule | Never. Paint and decals exist; no military markings among them. |
| A flag hung vertically in the hangar | invented, rule | The flag is always horizontal. |
| Date and clock | invented | Dropped. |
| Nav tabs LOADOUTS, CAMERAS, UPGRADES, CONTROLLER | rename | Hangar sections (section 2.5). |
| Aircraft list CONDOR-06, TACUARA, YVYRA, ÑANDU | invented | The real 20 aircraft. |
| CUSTOM BUILD, experimental | exists | My Hangar saved builds. |
| Favourite star | defer | Phase 6. |
| Role line, tags RECON, STRIKE, LONG ENDURANCE, MODULAR | invented | Real facts only: kind, span, weight, power. |
| MALE-class UAV description | invented | Each aircraft's own note in the picker. |
| Hero aircraft render in a hangar | rename | The 3D garage exists; its background is the game's own, never AI art. |
| Stats: max speed, cruise, endurance 8 h, range, ceiling, payload | rename | Real: weight, top speed, flight time from the power model. Range and ceiling invented. |
| Airframe, avionics, propulsion, battery health % | rename | Crash damage and repair (Parts tab) is the real one. Battery health invented. |
| Total flight time, last maintenance, next service | invented | Dropped. |
| Payload and equipment slots 4/6 | rename | Combat craft Loadout: payload and accessories. |
| Battery and power: endurance, voltage, temperature | rename | Power tab: pack, flight time; pack charge setting. Temperature invented. |
| Camera preview EO/IR | invented | FPV view and camera angle exist; EO/IR does not. |
| LAUNCH MISSION | rename | Back to the session it came from, or Fly. |

## 2. Information architecture and state model

### 2.1 Four states, not pages

The shell has one place that says what is on screen (`ui.screen`) and,
since FLOW-AUDIT.md, one rule that says where the pilot is: in a room or
not. The redesign names four states over those, each a function of data
the shell already holds:

| State | What it is | Held in | Today's nearest |
| --- | --- | --- | --- |
| **Hub** | home, operations, flightclub or hangar | `ui.screen` plus a `hub` id | the title gate |
| **Activity** | one entry of the mode registry, and for Operations a mission | the registry id | a title card, `ui.mode` |
| **Session** | the room set up for that activity, its lobby, its pilots and visibility | the room (server) | the friends screen in a room, the lobby |
| **Flight** | a round of that session in the air | the room's game state | flying |

Transitions, and nothing else:

```
Hub --pick activity--> Session (lobby) --Ready, round starts--> Flight
Flight --round over--> Session          (lobby rule 12: back to the lobby)
Session --Leave--> the Hub the activity belongs to   (FLOW-AUDIT rule 5)
Hub <--> Hub                             (never in a room: rule 3)
Hangar <--> Session                      (aircraft changes, then back; the room stays)
```

The existing FLOW-AUDIT rules carry over unchanged: no hub is ever in a
room (rule 3, "the title" becomes "any hub"); inside a session, Back and
Escape stop at its lobby and Leave is the one way out (rules 4, 5); a
reload lands in the same session (rule 6). The breadcrumb is a reading of
the state, not a separate table: `HOME / OPERATIONS / DEFEND THE PARANÁ /
MISSION 2` or `HOME / FLIGHT CLUB / STREAMER COMBAT / SESSION`, built from
hub, activity and session. The `CRUMBS` table (ui.js 272) stays for the
settings screens.

### 2.2 The three hubs and what each holds

**Operations** holds the operations; there is one, Defend the Paraná.
With one, Operations opens straight on its missions (Act 1, four playable
today, seven when #363 lands); a choose-an-operation screen appears only
when a second operation exists. Pick a mission: the briefing (section
2.4), which is the session's lobby with the mission's facts above it.

**Flight Club** holds Free Flight, Track Day, Streamer Combat, Catch the
Ace: four activities, from the registry, in that order. Worlds (The Alps,
Swiss valley, Itaipu) are a row in a session, not activities. The open
public sessions, today's title rooms panel, become a strip here ("Join a
session"), since joining a stranger's game is a Flight Club thing.

**Hangar** holds Aircraft, Loadout, Paint, Parts, Tuning, Upgrades,
Controller: today's hangar tabs plus the campaign shop and the controller
screens, which today sit in Settings and the campaign dialog.

**Secondary navigation** (the frame's corners, not cards): Settings,
pilot name and level, language, sign in, report bug, credits, join with a
code.

### 2.3 Click depth: the hubs do not cost a click

The owner's 2 October rule is one click from the title into a lobby. The
mock home's answer is right and is kept: each hub card carries its
activities as links (the row under OPERATIONS, FLIGHT CLUB, HANGAR in
mock-home.png). A link is one click into that activity's session; the
card's body opens the hub to browse. So: home, Streamer Combat, Ready is
one click and a Ready, as on the lobby branch today.

### 2.4 The session: one system for Operations and Flight Club

The session is the room and its lobby, exactly the lobby branch's: one
server class (`RoomGameLobby`), one screen. What this plan adds is
display and three fields, not a second lobby:

| Session field | Source | Today |
| --- | --- | --- |
| Activity, world, setting (minutes, goal, mission, track) | the room's `meta.mode`, `meta.map`, the lobby's setting | exists |
| Pilots, ready, host, me | `welcome.lobby.ready`, peers | exists |
| Empty slots up to the cap | registry `maxPlayers` | new display |
| Visibility: Solo, Friends, Public | `meta.public` plus whether the code is shown | partly |
| Invite code | private rooms | exists |
| Drop in | registry `allowDropIn` | exists as behaviour |
| AI fill | registry `allowAI` | none; the row is hidden while false |
| Ready / Deploy | `lobby ready` op | exists |

**Visibility, honestly.** Rooms are public (listed, quick joined) or
private (code only). Three values map onto those with no server change:
**Public** is a public room; **Friends** is a private room with its code
shown; **Solo** is a private room whose code is not shown, so nobody can
find or join it. Changing visibility alone in a lobby is a quiet move to
a fresh room (nobody else to move). Changing it with others present is a
host action that needs the server to change `meta.public` in place: a
new host message, server first, the same contract path as FLOW-AUDIT PR
8.

**Offline** (no rooms server): Track Day and Free Flight still run, with a
local session whose only visibility is Solo; the other values and the
room games are shown disabled with the reason. One screen either way.

**Operations' briefing is the session**, with the mission's facts above
the pilots: objective, location (Itaipu), eligible aircraft, estimated
duration, recommended pilots, visibility, and Deploy (Ready). Difficulty
is not a field (section 1.3).

### 2.5 Hangar as an aircraft ecosystem

Data first: `configs/airframes.js` has no category field, and the
picker infers one (`kindOf`: quad or plane). Phase 6 adds `class`
(multirotor, plane, wing, glider) and `roles` (race, combat, interceptor)
to each row, derived from the flags already there (`fixedWing`,
`trackClass`, `combat`, `noMotor`), so the hangar filters by data and a
new aircraft is one row. Favourites is a list of ids in settings. Cameras
become per aircraft (an override map beside today's global
`cameraAngle`, `cameraFov`, which stay the default, so the settings key
`webfpv.settings.v3` keeps its shape). Upgrades are the campaign shop's,
moved, with the level unlocks beside them. Nothing invents stats,
maintenance or health the game does not model.

### 2.6 Controller

The setup exists (src/input/input.js): device choice by wiggle, the
calibration wizard with live gimbals and a raw axis strip, per channel
reverse, stick modes 1 to 4. Missing: a configurable dead zone (hard
coded 0.012, input.js 2495), expo on a gamepad, a manual channel
editor, named presets per device, per aircraft profiles, WebHID. Phase 7
builds one Controller screen in the Hangar from what exists plus the
first four; profiles are per aircraft class (a quad's sprung throttle and
a plane's are different sticks), not per aircraft id. WebHID stays
deferred: the Gamepad API already reads a RadioMaster in joystick mode.

## 3. The mode registry

One module, `src/share/modes.js`, beside roomwire.js because both the
page and the rooms server read it. `WAYS`, `LOBBY_GAMES`, the server's
`GAMES` and `ROOM_MODES` are derived from it or check against it; each
inline branch counted in section 0.2 becomes a field. Presentation (art,
string keys) sits in the same entry; the server ignores it.

### 3.1 Schema

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | The room's `meta.mode` (`free` for free flight); stable, on the wire. |
| `category` | `operations` or `flightclub` | Its hub. |
| `title`, `description` | string keys | Name, one sentence. |
| `tags` | string keys, 2 to 4 | The card's facts. |
| `image` | path | An in-engine render under assets/. |
| `minPlayers` | number | To start a round. 1 everywhere since the lobby branch. |
| `maxPlayers` | `{ public, private }` | Seats: today the room caps, 16 public and 8 private. |
| `allowSolo` | boolean | Ready alone starts it. |
| `allowAI` | boolean | AI pilots fill seats. False everywhere: none exist. |
| `allowDropIn` | boolean | A pilot arriving mid round flies in. |
| `visibilityOptions` | of `solo`, `friends`, `public` | What the session offers. |
| `supportedAircraft` | named filter | `all`, `planes`, `room` (all but the whoop): today's three lists in WAYS. |
| `mapPool` | world ids | Worlds the session offers; `home` is the default. |
| `estimatedDuration` | `{ min, max }` minutes, or null | Null for open ended. |
| `setting` | `{ key, choices }` or null | The host's one lobby setting. |
| `consent` | boolean | The war's one time question first. |
| `missions` | ids, or absent | An operation's missions, in order. |

### 3.2 The real entries

| id | category | title (key) | min, max | solo | AI | drop in | visibility | aircraft | worlds | duration | setting |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `free` | flightclub | Free Flight | 1, 16/8 | yes | no | yes | solo, friends, public | planes solo; room in a room | swiss2 (home), alps, itaipu | open | none |
| `race` | flightclub | Track Day (now Track mode) | 1, 16/8 | yes | no | **no**: waits for the next race | solo, friends, public | all (a plane must fit the gates) | the track's world | laps 1 to 10 | track |
| `combat` | flightclub | Streamer Combat (now Toilet paper combat) | 1, 16/8 | yes, practice | no | yes | solo, friends, public | room | swiss2 (home), alps, itaipu | 3 or 5 | minutes 3, 5 |
| `tag` | flightclub | Catch the Ace | 1, 16/8 | yes, practice | no | yes | solo, friends, public | room | swiss2 (home), alps, itaipu | to a goal | goal |
| `war` | operations | Defend the Paraná | 1, 16/8 (missions tuned for 1 to 8) | yes | no (attackers are the game) | yes | solo, friends, public | room | itaipu only | per mission | mission |

`war.missions`: `itaipu-1` First Light (free), `itaipu-2`, `itaipu-3`,
`itaipu-4`; `itaipu-5` to `itaipu-7` appended when the engine ships them
(the ids are save keys and never change). Per mission duration comes from
MISSIONS.md section 2 once #363 is merged; before that the field is
null, not a guess.

Open questions the registry makes visible: whether Free Flight in a room
takes quads (WAYS' solo card is planes only, its room cards take all but
the whoop), and TAG-PLAN decision 9 (no tag in public rooms) against the
lobby branch listing public tag rooms. Both are one field each now.

## 4. The design system

Derived from the PDCS tokens in index.html (the bootloader #343, the
menus #348, the accents #354), not replacing them.

### 4.1 Tokens

Existing, kept as they are (the playground draws every one, grouped):

- **Ground**: `--pdcs-bg`, `--pdcs-ground`, `--pdcs-panel`, `--pdcs-scrim`, `--pdcs-plate`, the two grids.
- **Line**: `--pdcs-line`, `--pdcs-line-soft`.
- **Text**: `--pdcs-bright`, `--pdcs-text`, `--pdcs-muted` (small text, over 7:1), `--pdcs-dim` (rules and large labels only).
- **Accent**: `--pdcs-blue` and its strong, dim and wash: cursor, focus, selection, links.
- **State**: `--pdcs-green` (READY, the one thing to press), `--pdcs-green-live` (live), `--pdcs-warn`, `--pdcs-fail`.
- **Flag**: `--py-red`, `--py-white`, `--py-blue`, horizontal bands only.
- **Type**: `--pdcs-mono` (telemetry, labels), `--pdcs-read` (sentences).

Proposed, phase 2:

- **Spacing**: `--sp-1` to `--sp-7` = 4, 8, 12, 16, 24, 32, 48 px. Today every gap is typed by hand.
- **Radius**: 0 for frames and cards (today's gate cards), 2 px for buttons and chips. The sheet has 82 hand typed `border-radius` values to fold into these.
- **Type roles**: `--type-display` (the lockup's Saira, #368), `--type-name` (a condensed sans for hub and mode names, a decision in section 6), `--type-read` = `--pdcs-read`, `--type-mono` = `--pdcs-mono`.
- **Hub tone**: ONE token, `--hub-accent` (with `-dim` and `-wash`), set by `data-hub` on the screen, over the same PDCS ground. Operations `--pdcs-blue` #6aa3c8 (7.3:1 on `--pdcs-bg`, today's accent, tactical); Flight Club a warm copper #e09a5f (8.5:1, 7.9:1 on the ground's light centre; distinct from `--pdcs-warn` #d9b46c so a warning never reads as a hub); Hangar steel #a9b4bb (9.4:1). Ratios computed for this plan; phase 2 writes them beside the tokens as #354 did. Three palettes would triple every state rule; one token changes the accent and nothing else.

### 4.2 States, one vocabulary for every component

| State | Look | Today |
| --- | --- | --- |
| rest | `--pdcs-panel`, soft inset line | everywhere |
| hover / cursor | blue bar or outline, a step brighter | `.row.on`, `.gate-card.on` (outline plus a 2 px top rule) |
| chosen | mint inset | `.map-card.chosen` |
| disabled | slate, 0.85 | `.row-grey` |
| ready | green flag | `.war-lobby-pilot.ready` |
| live | green-live inset bar | `.gate-room.is-live` |
| warning | warn | `.row-warn` |
| danger | fail | `.name-dialog-btn.danger`, which types #ff8f8f instead of `var(--pdcs-fail)`: a phase 2 fix |

### 4.3 Typography

Display: the lockup only. Names (hubs, modes, missions, aircraft):
condensed, uppercase, tracked. Sentences: the readable face, one line on
a card. Telemetry and labels: monospace, tabular figures. Today names use
the monospace; a condensed face is the visible change.

### 4.4 Motion and sound

Restrained, as today: 140 ms state transitions, the lobby countdown's
blink, the hangar's spring. Added: a hub change that moves the camera
over the live world rather than cutting (the title already flies over
it), and nothing that loops on a menu. `prefers-reduced-motion` already
stops the blink; every new motion obeys it. Menu sound exists
(`onUiSound`: move, adjust, select, back); a hub change reuses select, no
new sounds.

### 4.5 The components, and the playground

`tests/browser/playground.html` draws every component below in each of
its states with the game's own sheet, plus every token. Development only:
Pages does not publish tests/browser, and nothing the site serves links
to it. `npm run ui:playground` (scripts/playground-check.js, Node, in
CI) holds the list to the sheet and to this table: a component here and
not there, or a class the sheet no longer styles, fails it.

<!-- components -->
| id | Component | Kind | Source | Status |
| --- | --- | --- | --- | --- |
| `type-wordmark` | Wordmark lockup | type, heading | ui.js `wordmark()` | exists |
| `type-section` | Section heading | type, heading | ui.js menu sections | exists |
| `type-lede` | Lede | type | `.screen-lede` | exists |
| `type-dialog-heading` | Dialog heading | type, heading | `askConfirm` | exists |
| `row` | Menu row: rest, cursor, navigation, link, primary, info, disabled, warning | row, button | `renderMenu` | exists |
| `control-switch` | Switch | control | `makeSwitch` | exists |
| `control-segments` | Segments | control | `makeSegments` | exists |
| `control-dropdown` | Dropdown, closed and open | control, dropdown | `makeDrop` | exists |
| `control-stepper` | Stepper | control | `makeStepper` | exists |
| `control-slider` | Slider with a typed number | control | `makeSliderControl` | exists |
| `button-dialog` | Dialog button: rest, primary, danger | button | `askConfirm` | exists |
| `button-chip` | Corner chip | button, status | pause and aircraft chips | exists |
| `card-mode` | Mode card | card | `renderTitleCards` | exists; becomes the activity card |
| `card-world` | World card: rest, cursor, chosen | card | the maps screen | exists |
| `card-part` | Hangar choice card | card | hangar-parts.js | exists |
| `card-mission` | Mission card with stars | card, status | campaign.js `missionCard` | exists |
| `nav-breadcrumb` | Breadcrumb | navigation | `CRUMBS` | exists |
| `nav-context-chip` | Frame context chip | navigation, status | `contextChips` | exists |
| `lobby-slot` | Lobby pilot slot: waiting, ready, me and host | lobby slot | the lobby view | exists |
| `lobby-status` | Lobby status: waiting, counting down | lobby slot, status | the lobby view | exists |
| `room-entry` | Room entry: rest, live, cursor | card, status | `renderTitleRooms` | exists; moves to Flight Club |
| `status-beta` | Beta notice | status | the title brand | exists |
| `modal-confirm` | Confirm dialog | modal | `askConfirm` | exists |
| `tooltip` | Tooltip | tooltip | none | gap: the help column does this job |
| `hub-card` | Hub card | card | none | proposed, phase 3 |
| `session-visibility` | Session visibility, three values | control | none | proposed, phase 5 |
| `briefing-panel` | Mission briefing facts | card | none | proposed, phase 4 |
<!-- /components -->

### 4.6 Clutter to take off player screens

Read from the code; to be confirmed on screen in phase 3 with `shots`:
the best lap line and the two keep notes on the title (they belong to
Track Day and to a first flight), the rooms panel's counts on home (to
Flight Club), "(in development)" in Itaipu's name where the campaign
shows it, and every "[ ]" bracket that frames a non interactive label.

## 5. Phases

Each phase ships alone, behind its checks, and changes nothing a later
phase needs undone. Browser checks run locally (they are not in CI);
each PR states their output. Nothing starts until `one-click-lobbies`
and #359 are merged, because phases 1 to 5 touch their files.

| # | What ships | Checks it rewrites or adds |
| --- | --- | --- |
| 0 | This plan, OVERVIEW.md, the UI playground and its check. No player visible change. | Adds `ui:playground` (Node, CI). |
| 1 | `src/share/modes.js`; `WAYS`, `LOBBY_GAMES`, server `GAMES`, `ROOM_MODES` derived from it; the inline branches of section 0.2 become fields. Server half first. No visible change. | Adds `modes:selftest` (Node, CI): every table entry has a registry entry and back, every field valid. `rooms:selftest`, `rooms:server`, `rooms:load` unchanged and green; `game:lobby` for all five games, `modes:card` unchanged and green (the proof nothing moved). |
| 1b | Streamer Combat: `combat.card` "Streamer combat", Spanish "Combate de serpentinas"; the toilet paper stays in the line and the card art. | `strings:selftest`, `lint:copy`; the label is read by `modes:card`, `war:card`, `friends:card`, which are updated to the new name. |
| 2 | Tokens of section 4.1 into the sheet, the sheet moved out of index.html into a file of its own, the danger button on `--pdcs-fail`, a repo wide no dash lint for strings and docs. Pixel identical. | `ui:playground` grows to the new tokens; adds `lint:dashes` (Node, CI); `boot:loader`, `lint:responsive` green; `shots` before and after compared. |
| 3 | Home becomes three hub cards with activity links; hubs as screens; rooms panel to Flight Club; breadcrumb from state. | Rewrites `lint:shell` (2 offline cards becomes 3 hubs, offline Operations disabled with its reason), `modes:card` (hubs and activity cards fit at 1280x720, 1920x1080, 2560x1080, 390x844, 360x640, 844x390), `friends:card` (becomes the Join a session strip), `war:card`, `campaign:check` (card count and positions), `boot:loader` (the hub's ground), `flow:check` (no hub is in a room). |
| 4 | Operations: the mission list and the briefing as the war session's head; the `war` entry's facts from the registry. | Rewrites `campaign:check` (Operations, mission 2, briefing facts, Deploy); `war:lobby`, `game:lobby --game=war` green. |
| 5 | Session staging: visibility Solo, Friends, Public; empty slots; facts from the registry; the in place visibility change (server message first). | `game:lobby` for all five rewritten to the new screen and adds the visibility rows; `rooms-server-check` adds the visibility op; `flow:check`. |
| 6 | Hangar ecosystem: `class` and `roles` on airframes, favourites, per aircraft cameras, Upgrades and Controller under the Hangar. | `hangar:check`, `hangar:mine`, `campaign:selftest` (shop moved, prices unchanged), `progress:check`; adds `airframes:check` (Node, CI): every airframe has a class and roles. |
| 7 | Controller screen: dead zone, gamepad expo, manual channel editor, presets per device, per class profiles. | `input:selftest` (Node, CI) extended; `lint:input`, `lint:devices` green. |

## 6. Owner decisions

Short, each with a recommendation. Everything else in this plan is
decided by the code or by earlier decisions.

1. **Approve the three hubs over the one click lobbies?** The hubs add a
   layer; the activity links on each hub card keep the 2 October one
   click. *Recommend: yes, with the links.*
2. **What visibility does a card press open on?** Today's rule (11) joins
   the busiest public room. The mocks default to Solo. *Recommend: keep
   Public as decided on 2 October, and remember each pilot's last choice
   per activity.*
3. **Is "Friends" the right word** for "private, by invite code" when
   there is no friends list? *Recommend: yes, with "invite code" under
   it; a friends list is not planned.*
4. **A condensed face for names:** extend #368's Saira (OFL) with Saira
   Condensed, Latin with Spanish accents, one weight, subset and self
   hosted like the lockup, or stay on the system's faces? *Recommend:
   Saira Condensed, one weight; its size goes in the PR that adds it.*
5. **Hub tones as one accent token** (blue, copper, steel) over the same
   dark PDCS ground, rather than three palettes. *Recommend: one token.*
6. **Track mode becomes Track Day?** *Recommend: yes, it says what the
   mock means: a day at the track, alone or with friends.*
