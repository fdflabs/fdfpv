# Completeness: the owner's 84 item checklist, against the code

**Status: PROPOSAL for the owner's review** (2026-10-03). Written against
`main` at 1c64b964 (after #370), with open PR #386 (Flight Club first on
home) read but not assumed merged.

The owner handed in a "Development Completeness Checklist" (84 items and
five closing priorities) and asked that it be worked into the things we
must do. This file answers every item against the tree, specs what is
missing, and orders it. PLAN.md section 5 carries the result as phases 19
to 31.

## 0. How to read this

Verdicts:

- **EXISTS**: in `main` today. The file and line are cited, and the check
  that holds it. Where no check holds it, that is said, and the item still
  counts as EXISTS only when the behaviour is plain on screen.
- **PARTIAL**: some of it is there; what is missing is said, with a spec.
- **MISSING**: nothing of it is there; a spec follows.
- **N/A**: not applicable, or decided otherwise; the decision is cited
  (CLAUDE.md, docs/PILLARS.md, PLAN.md section 6, or the architecture
  that makes the question moot).

Each PARTIAL and MISSING item ends with **Done**: what done means here,
the check that would prove it, its size (S a day or less, M a few days, L
a week or more) and its phase (PLAN.md section 5).

"CI" means the script runs in `.github/workflows/checks.yml`; "local"
means it does not (every browser check, and `npm run verify`, by the
workflow's own header). Paths are from the repository root.

**Counts over the 83 items with a verdict:** 30 EXISTS, 43 PARTIAL, 7
MISSING, 3 N/A. Item 84 is held by the owner and has no verdict.

**Standing decisions every spec below keeps** (PILLARS.md section 0 and
the owner since): no jamming, signal loss or radio breakup (rule 1);
defend only, kamikaze only (rule 2); the campaign of docs/campaign; public
sessions by default with each pilot's last choice remembered (rule 8);
determinism and the 1000 Hz plant (rule 12); Flight Club first on home
(owner 2026-10-03, #386); combat drones only in wars, and the 5 inch quad
and the 65 mm whoop removed from the whole game with saves migrated (owner
2026-10-03, relayed by the lead). The last two are not in the tree yet:
`configs/airframes.js` 117 still has `id: '5inch'`, the settings default
is `airframe: '5inch'` (src/ui/ui.js 578) and ui.js 983 still migrates the
whoop. That removal is the first real customer of item 1's migrations.

## 1. Saves and progress (items 1 to 3)

**1. Save-state architecture. PARTIAL.** There is a de facto main save:
the settings blob `webfpv.settings.v3` (src/ui/ui.js 368), which holds the
last aircraft, the worlds, liveries, parts, power, tuning, PIDs, rates,
progress (XP, challenges, Unlock all: `{ v: 1, ... }`, src/game/progress.js
181) and the campaign (`v: 1`, src/game/campaign.js 136, stored through
`createCampaignStore`, campaign.js 332). Around it sit about thirty other
keys, each versioned in its own name or not at all: the pilot name
`webfpv.pilot.name` (src/share/pilot.js 26, no version), the stick map
`webfpv_stick_map_v1` and the pad `webfpv.pad.v1` (src/input/input.js 61,
62), My Hangar `webfpv.builds.v1` (src/ui/builds.js 64), best laps under
hashed `webfpv.best.*` keys (src/main.js 6708), the voice prefs
`fdfpv.voice` (src/ui/voiceui.js 45), the language, stats, the track
builder's six keys, the replay store in IndexedDB. There is no
`saveVersion`: the settings version is the key's name, and ui.js 352 says
the v3 bump "IS the migration", the old blob simply not read. Last used
mode and tutorial completion are not stored (item 57; ui.js 964 infers a
first run from the keys present). The account sync blob is `{ v: 1, data,
stamps }` (src/share/progressmerge.js), and its `v` is never read.
Checks: `progress:selftest`, `campaign:selftest`, `retired:selftest`,
`test:tracks` (CI) hold the sections' shapes, nothing holds the whole.
**Done:** one module, `src/share/save.js`, owns a versioned envelope
`{ saveVersion, player, progression, aircraft, campaign, records,
settings, controllers }` assembled from the existing keys (which stay
where they are on disk until a migration moves one, so nothing is
rewritten for its own sake). `SAVE_VERSION` starts at 4, one past the
settings key, and each version step is a pure function `n` to `n + 1` in
one ordered list; the ad hoc migrations that exist (the whoop's
generations at ui.js 1000, `retiredAirframe` at ui.js 1073) move into that
list, and the 5 inch and whoop removal becomes step 5. The sync blob's
sections keep their shape (a published contract with tracks-api), and
its `v` is checked. Check: `save:selftest` (Node, CI) loads a fixture of
every historic shape (a v3 profile, a pre progression profile, whoop
generations 0 to 2, a retired airframe, a seat on the 5 inch) and asserts
the migrated result and that migrating twice is a no op. Size L. Phase
19.

**2. Autosave rules. PARTIAL.** Writes happen on change, not on exit:
`saveSettings` (ui.js 1342) at 18 sites; progress on a lap, a challenge,
Unlock all and a first sight (src/ui/progress-ui.js 225 to 437); the
campaign on its commit (src/ui/campaign.js 117); calibration when the
mapping is accepted (input.js 1158); builds on edit; best laps on a new
best (src/game/race.js 755). There is no `beforeunload` save and none is
needed. The gap is the war: a mission's stars and credits are recorded on
the client only while it polls an open room and watched the war before
its result appeared (campaign.js 320 to 352: the first sighting of a war
that already shows a result is marked seen and never paid, the guard
against paying one result twice), so a pilot who reloads or leaves at
the result card loses them. No check states the rules.
**Done:** a table of save points in `save.js`'s header, each with its
trigger, and the war's result written the moment the room reports it,
whoever was watching, paid once per war by its room code and id kept in
the save rather than in memory (the room already holds `resultOf`,
edge/rooms/war.js 290). Check: `save:selftest` asserts each trigger writes;
`campaign:check` (local) adds a reload during the result card. Size M.
Phase 19.

**3. Recovery from corrupted saves. PARTIAL.** Every read is wrapped:
`loadSettings` falls back to `{}` on bad JSON (ui.js 1029), checks each
value's type against `DEFAULTS` and that list values are still on their
lists; `normaliseProgress`, `cleanCampaign`, `normaliseBuilds` clean their
sections; pilot.js 40, input.js 347 and 1136, builds.js 278 are wrapped
too. Missing: a backup (bad JSON today silently becomes the defaults and
the next save overwrites the evidence), a migration chain (item 1), and
reset controls: there is no "Reset settings" that keeps progress nor
"Reset progress" that keeps settings; only per plane "Reset to stock"
(`hangar.reset`) and account deletion (src/share/account.js 288). No
check feeds a broken blob in. **Done:** `save.js` keeps the last blob
that parsed and validated as `.prev` beside each key it owns; an
unreadable blob is kept as `.corrupt`, the `.prev` is loaded, and the
pilot is told once; two rows in Settings, Reset settings and Reset
progress, each behind `askConfirm`, each clearing only its half. Check:
`save:selftest` with truncated JSON, wrong types and an empty string,
asserting progress survives a settings reset and the reverse. Size M.
Phase 19.

## 2. Sessions and multiplayer (items 4 to 11)

**4. Session lifecycle. PARTIAL.** The room server owns every state, but
there is no one named state machine. The lobby is derived from data (a
`ready` set, `countdownAt`, `deadlineAt`, edge/rooms/gamelobby.js 175 to
190; 5 s countdown, 45 s deadline, 78, 79), and each game keeps its own
states: race `on`, `results` (edge/rooms/race.js 143); tag `countdown`,
`live`, `results` (tag.js 148); combat `idle`, `countdown`, `on`, `over`
(combat.js 124 to 283); war `briefing`, `countdown`, `live`, `won`,
`lost`, `ended` (war.js 492). The client has its own: rooms.js 268
(`idle`, `connecting`, `open`, `failed`) and the race roles (roomrace.js
178). Abnormal states mostly exist under other names: a dropped pilot's
seat is held 60 s (`RESEAT_MS`, core.js 117); a game with too few pilots
ends after 10 s (`ABANDON_MS`, core.js 123); a host's end or stop
(`hostCheck`, core.js 484); a version mismatch closes with `update` (item
10). Load failed has no state: the client reports `status: 'loading'`
(roomwire.js 179) and the war treats a silent pilot as not flying.
Checks: `rooms:selftest`, `rooms:server` (CI), `game:lobby` (local).
**Done:** a table `SESSION_STATES` in src/share/modes.js (`lobby`,
`countdown`, `live`, `results`, plus `reconnecting`, `abandoned`,
`cancelled`, `outdated`, `removed`, `load_failed`), and one pure function
per game mapping its own state onto it, used by the lobby screen, the
rooms panel (`core.js activity()` already reports three) and the HUD.
Nothing on the wire changes; each game keeps its states. A client whose
world fails to build reports `status: 'failed'` and the room counts it
out as it does a silent pilot. Check: `modes:selftest` asserts every
game's every state maps; `rooms:selftest` adds a load failure. Size M.
Phase 21.

**5. Host migration. N/A.** Rooms are server authoritative: one RoomCore
is "the only owner of the room's state" (edge/rooms/core.js 21), so there
is no peer host to migrate. "Host" is only a seat with setting rights;
when it leaves, the earliest joined pilot acts as host at once (`host()`,
core.js 339) and takes the token after `RESEAT_MS` (core.js 367), and
`handhost` hands it on by choice. Held by `rooms:selftest` and
`rooms:server` (CI).

**6. Reconnection. EXISTS.** The client retries at 1, 2, 4, 8 and 16 s
(src/share/rooms.js 64) with the code and seat token in sessionStorage,
so a reload rejoins; the server gives the seat back within 60 s
(core.js 709); the war restores the pilot's airframes in the same round
(`enlist`, war.js 791); others see "reconnecting" for 30 s
(`ROOM_GONE_MS`, src/main.js 2259); after five failures the pilot is told
"Lost the room. Join again with its code." The aircraft does vanish for
others while away, and no AI takes over (none exists). Checks:
`rooms:selftest` (CI); `rooms:restart`, `rooms:session` (local). One
finding: close code 4005 (`replaced`, a second tab took the seat) is not
in the client's `FINAL` map (rooms.js 72), so the replaced tab retries and
can take the seat back. Fixed in phase 21 (S).

**7. Join in progress rules. PARTIAL.** Per mode, as the checklist asks:
`allowDropIn` in src/share/modes.js (race false; tag, combat, war, free
true), and `modes:selftest` (CI) asserts race is the only round a
newcomer waits out. But the field is read by nothing at run time (only
scripts/modes-selftest.js 94): the behaviour comes from each game's own
code (race.js 296 fixes its racers; war `join()` enlists; combat gives
paper; tag makes a hunter). The table and the behaviour can drift.
**Done:** the rooms server reads `allowDropIn` where a newcomer arrives
in a running round, and the race's own rule is that field. Check:
`rooms:selftest` flips the field in a test registry and sees the
behaviour follow. Size S. Phase 21.

**8. Multiplayer authority. PARTIAL.** Decided and mostly server side,
but written down only in file headers. Server: midair collisions
(edge/rooms/referee.js 7), combat cuts (combat.js 16), tags (tag.js),
everything in the war: attackers, warheads, damage, stages, output,
results (war.js 7 to 24, 168 to 180, 281); timers on the room clock
(core.js 284, src/share/roomclock.js). Client, sanity checked: poses
(speed, world limit, impossible count: edge/rooms/safety.js 77 to 83).
Client, trusted: race gate passes (race.js 5: "Each client scores its own
gates"), and a war airframe lost (`op: 'lost'`, war.js 115). Checks:
`midair:harness`, `tag:harness`, `war:harness`, `combat:harness` (CI).
**Done:** one authority table in docs/MULTIPLAYER-PLAN.md (system, owner,
what the server checks), and an explicit decision on race passes: keep
them client scored inside the bounds `passOf` checks (race.js 69), since
the board already re verifies every published lap (item 59). Check: the
table names the harness that holds each server row. Size S. Phase 21.

**9. Deterministic scoring. EXISTS.** Every screen shows the same number,
because each number has one author. Hits, tags, cuts and kills are judged
by the room on a millisecond frontier of sample stamps, ties to the lower
seat (tag.js, war.js 63 to 75). A race time is measured once, by the
racer, on the shared room clock since `goAt`, and the room relays that one
number to everyone (race.js 27 to 30; `orderStandings` in
src/share/roomrace.js). Board laps are re checked by geometry
(src/game/verify.js `checkLap`, 60 ms tolerance). Checks: `lap:selftest`,
`rooms:selftest`, `tag:harness`, `war:harness` (CI). Trust, as opposed to
agreement, is items 59 and 62.

**10. Version compatibility. EXISTS.** The wire carries `PROTO = 2` and
`ROOM_LEVEL = 2` (src/share/roomwire.js 53, 71); `hello()` closes an
older or mismatched client with `update` (core.js 673 to 686) and closes
older seats when a newer level joins (core.js 760). The pilot reads "A new
version is out. Reload to keep playing with your friends." with a Reload
button (`friends.failed_update`, `rooms.reload`, main.js 4521), and an
open tab learns of a new deploy from `version.json` every three minutes
(src/ui/update.js). Checks: `version:check`, `rooms:selftest` (CI);
`version:reload` (local).

**11. Offline behaviour. PARTIAL.** Tracks are offline safe ("Saved in
this browser. It goes online when the connection is back",
`cloud.offline`; src/share/cloud.js 424 retries on `online`); rooms,
accounts and the board fail with a sentence (item 14); the loader says
"This device looks offline." (src/ui/loading.js 413, 452). Not offline:
a cold load, since Three.js comes from a CDN import map (index.html 5961,
a CLAUDE.md decision) and there is no service worker; and Operations
solo, which needs the rooms server because the room flies the attackers
(war.js 7, the war's design, docs/WARFARE-PLAN.md). The planned local
Solo session for Free Flight and Track Day is SESSIONS.md section 4.
**Done:** with no rooms server, Free Flight and Track Day run as a local
Solo session, and the room games show disabled with the reason
(SESSIONS.md 4). Operations solo offline is not planned: it would need a
second copy of the war's server logic in the page. Check: `lint:shell`
(local) with `?rooms=off` reaches a flight in both. Size M. Phase 6.

## 3. Loading and failure (items 12 to 14)

**12. Loading architecture. EXISTS.** No bundle: index.html loads
src/boot.js, which shows the loader and then imports Three.js, the
strings and main.js (boot.js 152 to 161). Worlds load on demand
(`load: () => import('./alps.js')`, src/maps/registry.js 79, 93, 106);
so do the locale (src/strings/index.js 84), the builder (main.js 12804),
Itaipu's war yard and water, and the movie muxers (src/replay/export.js
276). Aircraft renderers and audio are static imports of main.js (190 to
203): small next to a world. Check: `lint:memory` (local) holds map
laziness and release.

**13. Loading feedback. EXISTS.** The PDCS bootloader runs named stages
(`planStages(['three', 'board', 'sim', 'module', 'world', 'frame'])`,
boot.js 126), each with a real progress source (bytes, module counts, the
builder's progress; loading.js 29 to 42), a stall notice after 6 s
(`STALL_MS`), a hold for reconnects and a failure screen with Try again
(loading.js 977, 1016). Checks: `boot:loader`, `lint:boot` (local).

**14. Graceful failure. EXISTS.** Each dependency has its sentence: the
rooms server (`roombrowser.unreachable`, `friends.failed_noserver`,
`friends.failed_lost`, `loading.held_restart`), the board
(`ui.the_board_is_not_answering_so`; a lap that could not be sent is kept,
src/share/session.js 273), tracks (`cloud.offline`), assets
(`main.could_not_be_loaded`, `loading.could_not_start`), the GPU
(`gpuinfo.the_webgl_context_was_lost_reload`), account sync
(`account.sync_failed`, `account.unreachable`). A controller disconnect is
item 18. Checks: `cloud:selftest`, `rooms:selftest` (CI); `rooms:session`
(local).

## 4. Controllers and input (items 15 to 20)

**15. Controller hot plugging. PARTIAL.** The roster is polled every
input poll rather than trusted to `gamepadconnected` (input.js 1504 to
1534): a single new pad is taken, two or more open the picker (`hotplug`),
the chosen pad reappearing on another port is found by its id
(`matchPad`, input.js 1452), and Choose joystick switches device without a
restart (main.js 12585). Missing: no check exercises any of it, and losing
the only pad is item 18. **Done:** `input:selftest` (CI) drives a fake
roster through connect after launch, disconnect, reconnect on another
index and a switch, asserting the chosen device and the queued picker.
Size S. Phase 20.

**16. Controller identification. PARTIAL.** The device is stored as the
browser's `id` string plus `index` (`webfpv.pad.v1`, input.js 370); the
vendor and product are stripped for display only (input.js 335); the
axis count is checked live, not stored; and the stick mapping is one
global blob (`webfpv_stick_map_v1`, input.js 61), not per device. So a
pilot with a radio and a gamepad recalibrates on every swap. **Done:**
mappings keyed by device (`{ id, vendor, product, axisCount, buttonCount,
mapping, calibratedAt }`, vendor and product parsed from the id where the
browser puts them), the global map migrated to the device it was made on
(phase 19's migration list). This is the data PLAN.md phase 7's "presets
per device" needs. Check: `input:selftest` (CI) with two devices and a
swap. Size M. Phase 20.

**17. Axis sanity checks. PARTIAL.** The wizard (input.js 2380 to 2470)
rejects a noisy centre (`REST_NOISE 0.08` over 900 ms), demands range on
the sweep (`SWEEP_TRAVEL 0.55`, `THROTTLE_MIN_RANGE 0.3`), refuses an axis
already claimed (`pickUnusedAxis`, so duplicates cannot happen), learns
direction and offers reverse per channel, tracks endpoints (the selftest
has a stick wound in to half travel), and says when the radio unplugs
mid wizard. Missing: a named stuck or dead channel message (today the
sweep just never completes) and a dead zone setting (hard coded 0.012,
PLAN.md 2.6). **Done:** the sweep names the channel that never moved; the
dead zone is a setting (phase 7's controller screen). Check:
`input:selftest` (CI) with a frozen axis. Size S. Phase 20 (the message),
phase 7 (the setting).

**18. Controller loss failsafe. MISSING.** Undefined, and untested. Read
from the code: when the only pad goes, `poll()` falls to the keyboard;
roll, pitch and yaw go to zero, and the throttle holds the pad's last
value because the keyboard collective mirrored it and does not spring
unless W or S were used (input.js 2630, 2977). Nothing pauses: the picker
is queued as `missing` only when another pad remains (input.js 1533).
Betaflight's own failsafe is compiled in (`sim_rx_signal`, sim_abi.h 306;
`failsafe:trace`, local) but standing rule 1 (no signal loss in the flight
model) keeps it out of play. **Done, decided by the author (cheap,
reversible):** solo pauses the moment the flying device goes, and opens
the picker; in a room (where pause cannot freeze the world, item 23) the
sticks centre, the throttle holds, and the picker opens over the flight
with the room still running, exactly today's sticks made deliberate and
shown. Check: `input:selftest` (CI) removes the pad mid flight in both
cases. Size S. Phase 20.

**19. Keyboard, mouse and gamepad fallback. EXISTS.** Keyboard flight
(WASD and arrows as a Mode 2 radio, hold time as the analogue, input.js
20 to 29), mouse flight with sensitivity, expo, invert and centring
(ui.js 719 to 723), touch sticks (src/input/touchsticks.js), a standard
gamepad with no calibration (`standardPadMap`, input.js 96). Checks:
`input:selftest` (CI); `lint:input`, `mouse:shell` (local).

**20. Input abstraction. PARTIAL.** Flight is abstracted: every source
becomes the same four channels (`roll`, `pitch`, `yaw`, `throttle`, the
sim_abi.h convention), queued as timestamped samples (input.js 30 to 37;
`input.drain()`, main.js 14426). Actions are not: they arrive as key
codes (`input.onKey`, main.js 12938: `KeyR` reset, `KeyX` unstick) and
several modules read devices directly: src/replay/crashcam.js 623 calls
`navigator.getGamepads()`; src/builder/buildmode.js 1241 reads `gp.axes`
for its camera; src/ui/voiceui.js 270 reads a pad button for push to
talk; main.js 7726 to 7803 and 7892 read arrow keys and `KeyT` from
`input.keys` for turtle and flip. No camera axes, no `action1`. **Done:**
src/input owns an action table (`reset`, `unstick`, `flip`, `replay`,
`talk`, `ready`, `cameraPitch`, `cameraYaw`, menu navigation), each with
default bindings per source as data; callers ask `input.action(name)` or
`input.axis(name)`; the four readers above move onto it. Bindings become
remappable in phase 7's controller screen (item 40). Check: `lint:input`
grows a grep that fails on `getGamepads`, `.axes[` or `.buttons[` outside
src/input; `input:selftest` (CI) asserts each action from each source.
Size M. Phase 20.

## 5. Physics and frame (items 21 to 22)

**21. Physics presets. EXISTS.** Aircraft are rows, not scripts: one
`PlantParams` per airframe in `PLANT_TABLE` (src/native/plant.c 155) and
one `FixedWingParams` per plane in plant_wing.c, on one shared code path
(the single per id branch is crash.c 636); configs/airframes.js maps each
id to its row (`simId`), and configs/power.js overrides the stock power at
run time (`sim_set_power`, `sim_set_motors`). That the rows live in C and
a new one needs a WASM rebuild is deliberate: the plant is the
deterministic, Betaflight compiled flight model (CLAUDE.md), not shell
data. Checks: `power:check`, `motors:check` and each family's `*:gates`
and `*:stab` (CI).

**22. Time-step independence. EXISTS**, a project law (CLAUDE.md,
"Physics never reads frame time"). 1000 Hz on an accumulator
(`SIM_HZ = 1000`, main.js 494; 14579). Check: `npm run verify` check 4,
`frame-independence`, replays at 30, 60, 144 and 240 Hz render and
requires one state hash (tests/lib/checks.js 237, tests/thresholds.json
60); checks 2 and 3 hold determinism across runs and hosts (local, by the
workflow's choice).

## 6. Pause and replays (items 23 to 24)

**23. Pause semantics. EXISTS.** Solo: the plant steps only in
`mode === 'flight'`, so pause freezes the pilot's world (main.js 14541).
In a room nothing else stops: the room clock and its game run on, the
pilot shows as paused to the others (`status: 'paused'`, main.js 2150;
`rooms.away_paused`), the server stops repeating that pilot's pose
(core.js 178), and the war counts a silent pilot out (war.js 40). No check
names the rule; phase 21 adds it to `rooms:selftest`.

**24. Replay architecture. EXISTS**, ahead of the checklist. The
recorder keeps per frame columns (sim time, poses, plant, parts, smoke,
flags, a state hash) and typed events in a 30 s ring
(src/replay/recorder.js 58 to 277); the journal keeps every call into the
plant and page diffs of its memory so a replay can be flown again bit for
bit (src/replay/journal.js); the war's attackers, hits and damage are kept
by birth record and room clock (src/replay/warrec.js); cameras are keys
(`KEY_KEYS`); sound and voices since #369 and #370. The file is versioned:
`"FDFR"`, `FILE_VERSION = 13`, every version from 1 read
(src/replay/file.js 12, 162, 188). Checks: `crashcam:selftest`,
`crashrecord:selftest`, `export:selftest` (CI); `replay:selftest`,
`replay:world`, `replay:sound` (local). One gap for item 66: the file's
`META_KEYS` (file.js 308) carry no build version.

## 7. Events, debrief, statistics, achievements (items 25 to 28)

**25. Central gameplay event bus. MISSING.** There are at least six
separate channels, each with its own vocabulary: the recorder's
`event()` (`off`, `impact`, `debris`, `cue`, recorder.js 276);
`audio.event('takeoff' | 'land' | 'gate' | 'crash' | 'clip')` across
main.js; RunWatch's method calls (`gatePass`, `touch`, `lap`, `tick`,
progress-ui.js 252 to 266); the war's room messages (`born`, `dead`,
`boom`, `damage`, `cue`, `stall`, `end`, src/share/roomwar.js 240 to 271);
the war server's own `this.log.push({ what })` (war.js 927 to 1929); and
stats.js's beacons. No two consumers read the same stream. **Done:**
`src/game/events.js`, pure: one append only log per flight of typed
events on the sim clock (and the room clock in a room), with a fixed
vocabulary (`spawned`, `gate`, `lap`, `touch`, `crash`, `landing`,
`objective`, `stage`, `kill`, `hit`, `round`, `joined`, `left`,
`mission_start`, `mission_end`), the room's war ops mapped onto it
unchanged on the wire. Producers are today's call sites; consumers move
one per PR: RunWatch first, then the debrief (phase 10), progression
(phase 11), the replay's events. Deliberately not a pub/sub of
callbacks: a log that consumers fold, so a debrief and a replay read the
same facts in the same order. Check: `events:selftest` (Node, CI) folds a
recorded stream and asserts RunWatch gives today's answers from it. Size
M. Phase 22.

**26. Debrief from events. PARTIAL.** The war's round card
(src/ui/warround.js) reads counters the room accumulates during play
(`m.roundMw`, war.js 1750; `player.kills`, 1576) and logs each round
(`this.log.push({ what: 'round', ... })`, 1924), which is event shaped.
Race results are computed from final state (`end()` calls `standings()`,
edge/rooms/race.js 197 to 228). Each game has its own end screen; there
is no shared debrief (PILLARS 20). **Done:** PLAN.md phase 10's one
debrief frame reads phase 22's log, so route, time, crashes, landings and
kills come from what happened. Check: phase 10's results checks, plus
`events:selftest` folding a debrief. Size M. Phase 10, after 22.

**27. Unified statistics. MISSING.** stats.js sends three anonymous
counters to the board (visit, session, flush: laps, flight seconds,
crashes since the last flush) and keeps none of them (src/share/stats.js
11 to 20). There is no per pilot lifetime model: no flight time, distance,
crash or landing totals. PROGRESSION.md 9 already specs the storage
(`hours`, `landings` per aircraft, additive on `progress` v1). **Done:**
counters are a fold of phase 22's log into `progress` (flight time,
landings, crashes, laps, missions started and completed, kills, per
aircraft hours), merged as the higher by progressmerge. Check:
`progress:selftest` (CI) folds a stream twice and gets one count. Size M.
Phase 11, after 22.

**28. Achievement triggers. PARTIAL.** Seven challenges (progress.js 141)
judged by one class, `RunWatch` (progress.js 450), fed event shaped calls
from the shell, which is the right shape; but each condition is an `if`
on its id inside RunWatch (`lap()` at 491, `tick()` at 556). Adding the
thirteen per aircraft challenges of PROGRESSION.md 5 there would grow
that class by thirteen branches. **Done:** a challenge is a row with a
condition over phase 22's events (counts, flags, the aircraft, the
power), evaluated by one function; the seven move over unchanged. Check:
`progress:selftest` (CI) gives the same seven answers on recorded streams.
Size M. Phase 14, after 22.

## 8. Missions (items 29 to 32)

**29. Modular objectives. EXISTS.** src/share/war/stages.js: a mission is
a graph of stages; objectives are `{ id, text, kind, done, fail }`
(stages.js 37) whose `done` and `fail` are reusable triggers: `time`,
`cleared`, `allOut`, `destroyed`, `hit`, `killed`, `leaked`, `left`,
`born`, `down`, `gone`, `crossed`, `spent`, `output`, `region`, `breach`,
`ready`, `objective`, `visited`, `all`, `any` (83 to 118). Checklist types
map onto them: defend is `protect` with `output` and `destroyed`, reach
area is `region`, survive is `time`, recon is `visited`. Escort does not
exist and is not planned (no friendly convoy; PILLARS 4). Check:
`war:stages` (CI).

**30. Mission scripting layer. EXISTS.** Missions are data in
src/share/war/missions/*.js: stages, exits (`to`, `after`, `why`), seeded
spawn dials, cues (`radio`, `music`, `cutaway`, `text`), wrapped by
`withWaves` (stages.js 258); itaipu-1.js has a few small helpers for its
own rows. The engine is not touched to add one. Checks: `war:stages`,
`war:routes`, `films:lint` (CI). The places a new mission must be named
are item 80.

**31. Checkpoints. EXISTS.** A lost mission restarts from the stage it
was lost in, at most two stars (owner 2 October; `checkpointOf`, war.js
963; `RESTART_STARS`, 308; "RESTART FROM STAGE {n}", `war.restart_stage`);
restart mission from the start (`war.restart`); R restarts a run in
Flight Club. Checks: `war:stages` (CI), the gamelobby cases of
`rooms:selftest` (CI).

**32. Systemic difficulty. N/A, decided otherwise.** No difficulty
selector (PLAN.md 6 item 10; PILLARS 3). What the checklist asks for is
how the war already scales: pace per pilot count (`pace`, itaipu-1.js
161), adaptive dials (`ADAPT_HIGH`, `ADAPT_LOW`, stages.js 170), wave
size per pilot, airframes per round, seeded variation; and assists are
the player's difficulty (PILLARS 19). Enemy health is never the knob.

## 9. Developer tools (items 33 to 37)

**33. AI debug overlay. MISSING.** Nothing draws an attacker's state,
target or route; there are console hooks (`window.__war`, `__warAt`,
`__warMap`, main.js 5080 to 5155). **Done:** behind phase 28's dev gate,
an overlay draws each attacker's route (routes.js already computes it),
its hunter target, its stage and its next waypoint. Check: `war:markers`
(local) gains a dev screenshot assertion. Size M. Phase 28.

**34. Spawn and stage tools. PARTIAL.** URL flags exist: `?time=`,
`?spawn=`, `?craft=`, `?gpu=low`, `?map=` (main.js 616, 1742, ui.js
3384); console hooks `__placeCraft`, `__setCam`, `__crashSetDamage`,
`__warDo('start' | 'brief' | 'end')` (main.js 17507, 16865, 17698, 5207).
Missing: skip stage, complete objective, invulnerability, change wind.
**Done:** the war's room accepts `skip`, `complete` and `invulnerable`
ops only from a room made with a dev flag that public rooms refuse. Check:
`rooms:selftest` (CI) asserts a public room refuses them. Size M. Phase
28.

**35. Developer console. PARTIAL.** 141 `window.__` hooks in main.js
plus others, used by the browser checks; no command layer. **Done,
decided by the author:** no typed console; the hooks get one documented
index (`window.__dev.help()`) behind the dev gate. A console that parses
commands is a second UI to maintain. Size S. Phase 28.

**36. Debug and release builds. PARTIAL.** Pages excludes tests/browser,
scripts, edge, docs' markdown and more (.github/workflows/pages.yml 42 to
47), and the client holds no server secret. But every `window.__` hook
and URL flag ships to players, ungated. **Done:** hooks that change state
(placing the craft, damage, war ops) register only under `?dev=1` or on a
local host (the `LOCAL_HOSTS` test already in src/maps/itaipu.js 207);
the browser checks pass `?dev=1`. Read only hooks may stay. Check: a new
case in `lint:shell` (local) loads without the flag and finds no state
changing hook. Size M. Phase 28.

**37. Content validation. EXISTS.** In CI: `lint:presets` (every tune),
`lint:catalog`, `modes:selftest` (the registry whole, its strings and
pictures present), `films:lint` (films as data, both languages),
`strings:selftest` (key parity), `hulls:check` (every airframe),
`war:routes` and `war:stages` (every mission), `itaipu:courses`,
`campaign:selftest`, `parts:check`, `tuning:check`, `motors:check`,
`lint:copy`, `lint:nouns`, `lint:dashes`. Local only: `check:craft` (every
airframe drawn), `itaipu:spawns`. Phase 12 adds `airframes:check`.

## 10. Words (items 38 to 39)

**38. Localization readiness. PARTIAL**, nearly done. English and Spanish,
3301 keys each (src/strings/en.js, es.js); `strings:selftest` (CI) holds
parity, placeholders and plurals; `lint:copy` (CI) fails on prose outside
the tables; the bootloader's rows are keys (`data-label`, loading.js 817).
Left: four stage names typed in English beside two that are keys
(`STAGE_NAMES`, loading.js 98: Renderer, Board, Map, World), and
`ReplayFileError` messages shown inside a translated line
(src/replay/editor.js 461, 1141). Trick names are proper names by
decision (copy-lint.js `EXCUSED`). Portuguese is a new table, not a
retrofit. **Done:** those strings are keys. Check: `lint:copy` narrows
loading.js's excuse to the recovery advice. Size S. Phase 24.

**39. Text expansion. PARTIAL.** Spanish ships and runs longer, so the
problem is real, but every layout check (`lint:responsive`,
`lint:devices`, `modes:card`, all local) runs in English only. **Done:**
`modes:card` and `lint:devices` run once more with `?lang=es` and assert
no clipped label (scrollWidth over clientWidth) on the title, the hubs and
the lobby. Size S. Phase 24.

## 11. Comfort, audio, graphics (items 40 to 47)

**40. Accessibility fundamentals. PARTIAL.** Present: rates and mouse
sensitivity, mouse invert, reverse per channel, stick modes 1 to 4,
field of view and camera angle, angle mode, three HUD styles, subtitles
in the war films (src/render/warintro.js 549), `prefers-reduced-motion`
in two places. Missing: key and button remapping (item 20 makes it
possible), text scaling, in flight subtitles for the war radio (warSay,
main.js 3337, is audio only), hold or toggle choices (manual flip is hold
only). **Done:** remapping in phase 7's controller screen; radio lines
shown as one line captions when a Subtitles setting is on (on by
default; the lines' text is already in the strings); a UI scale setting
of 100, 115, 130 percent on the root font size. Check: `war:radio` (local)
asserts a caption per line; `lint:responsive` (local) at 130 percent.
Size M. Phase 25 (phase 7 for remapping).

**41. Motion sickness controls. PARTIAL.** Field of view (75 to 115,
src/render/lens.js 79) and angle mode exist. Camera shake is always on
(lens shake, lens.js 163; impact kick; the war's shake) and chase
smoothing is a fixed lerp (main.js 15684). Head bob and motion blur do not
exist, so there is nothing to switch off. **Done:** a Camera shake
setting (on, reduced, off) scaling the three shakes, and `prefers-reduced-
motion` defaulting it to reduced; a chase smoothing choice. Check: a
selftest of the shake scale (pure). Size S. Phase 25.

**42. Audio mixer categories. EXISTS.** Master (`volume`), motors, wind,
music, effects, voice, ambience, other (ui.js 862 to 881), on the buses of
src/render/audio.js 18 to 25. Menu sounds sit on `other` rather than a UI
bus: not worth a slider until someone asks. Checks: `audio:specs`,
`audio:metrics` (CI).

**43. Audio priority. EXISTS.** Four peer engines at most, swapped by
loudness and range (`PEER_VOICES = 4`, `PEER_RANGE_M = 400`, audio.js
158 to 167); the war's world sources shed from 14 to 4 voices under load
(docs/AUDIO.md 803); distance, air absorption, delay and Doppler (AUDIO.md
5); a 64 node budget. Checks: `audio:guard`, `audio:world -- --check`,
`audio:flights` (CI).

**44. Graphics presets. EXISTS.** Low, medium, high (src/render/quality.js
76), each setting pixel ratio, shadows, outline, bloom and a pixel budget;
detected on first run (`detectDefaultGraphics`, quality.js 189) and
lowered at boot from the GPU probe; render scale and an fps cap exposed
beside it. No Ultra: high is the top this renderer has. Check:
`lint:quality` (local).

**45. Resolution scaling. EXISTS.** Render scale 100, 85, 70, 55
(ui.js 387) and a dynamic pacer that holds 60 frames per second by
scaling the internal buffer, with CPU bound detection
(src/render/pace.js, `TARGET_HZ = 60`). No check holds the pacer; phase 29
adds one.

**46. Performance budgets. PARTIAL.** Written: 300 draw calls, 2.5 M
triangles, never under 60 fps at 1080p on a five year old mid range laptop
(docs/ITAIPU-PLAN.md 570, docs/SWISS2-LOOP.md 28, src/render/budget.js 4).
Enforced only for Itaipu's views (`BUDGET`, scripts/itaipu-views.js 211,
local) and the damage shots; verify compares a round trip with its own
boot, not an absolute. Nothing for the menu, the Alps or the valley, no
AI count or texture memory line. **Done:** one budget table in
a new docs/BUDGETS.md (menu, each world, war at full load: calls,
triangles, texture MB, attackers, peers), each row held by a local check
that fails over it. Size M. Phase 29.

**47. Object pooling. EXISTS.** Explosions, debris, breakage pieces,
smoke, attackers and war markers are fixed pools or instanced meshes that
take the oldest slot when full (src/render/explosion.js 23, debris.js 14,
smoke.js 82, attackers.js 343, src/ui/warmarkers.js 115). There are no
projectiles (kamikaze only, PILLARS 0 rule 2). No check holds the
allocation; `lint:memory` (local) holds release.

## 12. Worlds (items 48 to 54)

**48. World origin. N/A at this scale.** The largest world, Itaipu, is
40.96 km across around its origin (`RING_HALF = 20480`,
src/maps/itaipu/terrain/frame.js 31); a float32 at 20 km resolves about 2
mm, and the plant integrates in doubles. A floating origin becomes needed
past roughly 100 km from the origin; any map that large re-opens this
item.

**49. Map streaming. EXISTS** where it is needed: Itaipu's terrain is a
chunked quadtree LOD (src/maps/terrain/engine.js) over height tiles
fetched under a byte ceiling (src/maps/terrain/tiles.js). The valley and
the Alps load whole. Checks: `itaipu:check` (local), `grid:check`.

**50. Spawn safety. PARTIAL.** Itaipu's spawns are checked offline:
every spawn settles undamaged 2 s after start, every seat of an eight
pilot room settles, courses too (scripts/itaipu-spawns-check.js,
`itaipu:spawns`, local); seats are 8 m apart (src/game/slots.js). No such
check for the valley or the Alps, and nothing at run time. **Done:**
`itaipu:spawns` generalised to every world and every mode's spawn list.
Size S. Phase 29.

**51. Camera collision. PARTIAL.** The FPV and chase cameras are clamped
above the terrain (main.js 15419, 15682), not against buildings, walls
or the dam. **Done:** the chase camera pulls in along a ray to the craft
against the world's collision boxes (the obstacles the plant already
has). Check: a local shot at the dam's face. Size M. Phase 29.

**52. Respawn logic. EXISTS**, per mode as the checklist asks: combat
tops up paper, unlimited (combat.js 26); the war spends an airframe per
loss, earns one per kill, 10 s respawn, spectate when out (war.js 29 to
50); tag holds a wreck uncatchable until it respawns; a race resets
itself and the server accepts the voided lap (race.js 327); a teleport is
`FLAG_SPAWNING` for 5 s. Checks: `combat:restart`, `combat:harness`,
`war:harness` (CI).

**53. Boundary handling. PARTIAL.** Past each world's edge there is a
landable apron (src/maps/terrain/apron.js), so nothing falls out of the
world; but there is no warning, no prompt, no defined end. **Done:** one
rule for every world: past its playable radius (a field in the registry
row) the HUD says "Turn back" with a bearing home, and past twice that
radius the craft is reset to its spawn after a five second notice. No
invisible wall. Check: a Node test of the rule on the registry's radii.
Size S. Phase 29.

**54. Anti-frustration. EXISTS.** R resets (main.js 12962), X unsticks
in place (12974), turtle mode rights a flipped quad from the arrows
(8287), T holds a crash flip (7859), Restart run and Fly again from the
pause and results (ui.js 7358, 7457). Checks: `wreck:check`,
`crash:feel` (local).

## 13. First minutes and returning (items 55 to 58)

**55. Tutorial interruption. PARTIAL.** How to fly can be opened again
from the menus (ui.js 6497, 7420); the calibration wizard has Cancel and
Skip (ui.js 4403); the first flight hint retires itself. But the first
flight hint cannot be replayed, and there are no lessons yet. **Done:**
TRAINING.md's lessons (phase 8) each pausable, retryable per step,
skippable, and listed for replay; the first flight hint is lesson one.
Check: `progress:selftest` runs each lesson's judge (phase 8's check).
Size M. Phase 8.

**56. First-run experience. PARTIAL.** A first run is detected
(`detectFirstRun`, ui.js 964) and gets the first flight row; the language
follows the browser (src/strings/index.js 104). The controller question
appears only with two pads. Decided already: "What will you fly with?"
once, a radio straight to calibration (PLAN.md 6 item 19). **Done:**
PLAN.md phase 7. Check: `flow:check` (local) adds the first run question.
Size M. Phase 7.

**57. Returning-player experience. MISSING.** The last activity is not
remembered (`this.mode = linkedMode()` reads only the URL, ui.js 3432);
nothing says "last flown" or "continue". The aircraft and worlds are
remembered. **Done:** the last activity and, for Operations, the next
unplayed mission are stored per pilot (phase 19's save); home shows one
Continue link under the hub that holds it, one click into that session.
Home's order is untouched (Flight Club first, #386) and nothing opens on
its own. Check: `modes:card` (local) reloads after a Track Day and finds
the Continue link. Size S. Phase 27.

**58. Quit and abandon. PARTIAL.** The room keeps the mission and the
lost stage across a reload (war.js 1071, 963); a war with nobody left
ends after 10 s (`abandon`, war.js 950); leaving is not scored as a
failure. Missing: a written rule, and the result lost when the client was
not watching (item 2). **Done:** the rule written in SESSIONS.md
(leaving mid mission keeps the room's checkpoint for the others; the
leaver keeps stars already earned; nothing is lost but the round in
progress), and item 2's fix. Check: phase 19's `campaign:check` case.
Size S. Phases 19 and 21.

## 14. Online safety (items 59 to 62)

**59. Leaderboard sanity. EXISTS.** The board re-flies every published
lap's geometry: it starts on the line, passes every gate in order,
crosses again, matches its clock within 60 ms and never moves over 100
m/s (src/game/verify.js `checkLap`, imported by the board's repository);
a lap with a gate skipped is refused with 422. The arcade flight style is
kept off the public board (PILLARS 19). Checks: `lap:selftest` (CI);
`wing:e2e`, `board:live` (local).

**60. Privacy controls. PARTIAL.** Mute per seat, kept through a reseat
(edge/rooms/safety.js 159); report, with removal for 30 minutes at a
third of the room (safety.js); kick in private rooms; private rooms with
a code; chat and emotes from preset lists only (no free text); voice push
to talk by default, per peer volume, and the room refuses voice between
muted pairs (edge/rooms/voice.js 71). Missing: a block that outlasts the
room (mutes are per seat in memory, src/share/roomsafety.js 9). **Done:**
a signed in pilot's blocks are stored by account key on the account; a
blocked pilot is muted on sight and never quick joined into the same
public room. Check: `rooms:accounts` (CI). Size M. Phase 30.

**61. User-generated names. EXISTS.** Guest names are never typed: three
indices into word lists (`validNamePick`, roomwire.js 156); callsigns
match `^[A-Za-z0-9._\- ]{2,24}$` (pilot.js 51) and the word filter
(tracks-api/accounts.js 136); room names 3 to 32 Latin letters
(roomwire.js 565) and the filter (edge/rooms/front.js 218); track names 80
characters, no control characters, the filter (tracks-api/worker.js 112);
lines are set with `textContent`, never markup. Checks: `rooms:selftest`,
`test:tracks` (CI).

**62. Basic anti-cheat. PARTIAL.** The room refuses impossible poses,
out of range race passes, non host actions, and rates over its limits
(core.js 726, safety.js 77); clients cannot send a hit or a cut. Trusted:
the synced progress blob is checked for shape and size only
(`blobRefusal`, progressmerge.js 140) and merged by maximum, so stars,
credits and unlocks are whatever a client says. Unlocks are free anyway
(Unlock all, item 72), and nothing is competitive on stars. **Done, later
(decided by the author, reversible):** the rooms server signs each war
result and the accounts server credits stars and credits only from a
signed result. Not before an economy with a price exists. Size M. Phase 31.

## 15. Telemetry and diagnostics (items 63 to 67)

**63. Analytics events. PARTIAL.** Three anonymous events and nothing
else, by design (src/share/stats.js 11 to 20: no address, no user agent,
no pilot, no timestamp sent). No `mode_selected`, `mission_started`,
`mission_abandoned`, `tutorial_completed`. **Done:** an owner decision
(section 19). If yes: the same three event rule kept, with the session
event carrying the activity and the flush event counting missions
started, completed and abandoned as day totals, no new identifiers.
Check: `stats` keeps its refusal list; a Node selftest asserts the new
fields are counts. Size S. Phase 23, if decided.

**64. Crash reporting. PARTIAL.** Page errors and unhandled rejections
are recorded locally (src/share/crashrecord.js 148, from boot.js 44) and
sent only inside a bug report the pilot files with F8 (src/share/bugs.js,
`submitBug`, ui.js 5807), with up to four screenshots. Nothing is sent on
its own, and the report carries no build version. **Done:** the bug
report carries the build and the last 50 recorded errors; whether errors
are also sent unasked is an owner decision (section 19). Check: phase
23's `bugs:selftest`. Size S. Phase 23.

**65. Structured logs. MISSING.** No log module: 6 `console.warn`, 24
`console.error`, no categories, no timestamps. **Done:** one ring buffer
in crashrecord.js of `{ t, cat, msg }` with the checklist's categories
(input, network, physics, ai, mission, render, save, audio), written by
the existing warn and error sites, read by the bug report. No log levels,
no console spam. Check: `crashrecord:selftest` (CI). Size S. Phase 23.

**66. Bug-report contents. PARTIAL.** `bugSnapshot` (ui.js 5512 to 5579)
already carries the screen, world, course, flight mode, rates, graphics,
GPU, user agent, viewport, input rates and the crash record. Missing: the
build version, the aircraft id, the activity, the controller's id, the
log of item 65. **Done:** those five fields; the snapshot builder moved to
a pure function so it can be tested. Check: `bugs:selftest` (Node, CI).
Size S. Phase 23.

**67. Build version visible. PARTIAL.** Shown only at the foot of the
loading screen ("Build {version}", loading.js 480); the title shows a
beta note without it (ui.js 3855). **Done:** the build in the credits and
at the foot of Settings, and in every replay file's meta (item 24) and
bug report (item 66). Check: `lockup:check` (local) or a shell case reads
it. Size S. Phase 23.

## 16. Testing (items 68 to 71)

**68. Automated smoke tests. PARTIAL.** `npm run verify` (local, 16
checks: build, determinism, frame independence, flight physics, a clean
console, audio, world scale, map isolation), `flow:check` (reloads, room
links, card lobbies), `game:lobby` per game, `campaign:check`; CI runs
Node checks only, by the workflow's choice. Missing: one run that goes
boot, menu, start a mission, spawn, finish it, save, reload, find the
result. **Done:** `npm run smoke` (local) chains the solo war drill
(`itaipu-drill`) to its result and a reload that finds the stars, and is
named in the deploy checklist (DEPLOY.md). Size M. Phase 23.

**69. Content regression. EXISTS.** In CI over every row: `hulls:check`
(every airframe), `war:routes` and `war:stages` (every mission),
`lint:presets` (every tune), the gates and stability checks of ten
aircraft families, `crashcam:selftest` (replay encode and decode across
versions). Local: `check:craft`, `itaipu:spawns`, `replay:selftest`.

**70. Device matrix. PARTIAL.** Viewports are checked (lint:devices: 390
by 844 to 1180 by 820; modes:card: 1280 by 720 to 2560 by 1080; both
local); nothing records a real device run (operating systems, the Pocket,
a pad, a low end GPU, a high refresh display). **Done:** a table in
docs/DEVICES.md, one row per device and date, filled when someone flies
one; the owner's machines and the Pocket first. Size S. Phase 30.

**71. Frame-rate targets. PARTIAL.** A target exists: 60 frames per
second at 1080p on a five year old mid range laptop (budget.js 4,
ITAIPU-PLAN.md 570), and the pacer holds it (pace.js). No minimum
playable or recommended machine is written. **Done:** the three lines in
docs/BUDGETS.md beside item 46's budgets: minimum 30 (the pacer's
floor), target 60, recommended the reference laptop named. Size S. Phase
29.

## 17. Progression and groups (items 72 to 77)

**72. Progression never blocks Free Flight. EXISTS.** Quads are never
locked (`planeLevel` returns 1 for a quad, progress.js 249); four
planes start open (`STARTER_PLANES`, 81); a locked plane's Choose says
"Unlock everything" and one press opens it all and flies
(progress-ui.js 407 to 426). Check: `progress:selftest` (CI).

**73. Guest mode. EXISTS.** Signing in is optional, "a guest plays as
before" (src/share/account.js 2); a guest's progress lives in the browser;
a guest's room name is three picked words. Checks: `rooms:accounts`,
`test:tracks` (CI).

**74. Local multiplayer decision. MISSING**, as a decision. Online rooms
only: one pilot per page (input.js reads one pad), no split screen. LAN
works by accident: the rooms server runs anywhere
(edge/rooms/node.js) and `?rooms=` points a page at it (rooms.js 26), with
no discovery. **Done:** an owner decision (section 19), written into
PILLARS 5.

**75. Spectator join. PARTIAL.** A war pilot out of airframes watches a
teammate (main.js 2784); a race's late joiner watches the race. The watch
seat in any room is decided (PLAN.md 6 item 18). **Done:** PLAN.md phase
17. Size M. Phase 17.

**76. Rematch and next mission. PARTIAL.** Every room goes back to its
lobby after a round, nobody ready (gamelobby.js 35); a lost mission offers
its stage; the host picks the next mission in the lobby. Missing: a Next
mission action on the result, Change aircraft from the result. **Done:**
phase 10's debrief puts Again, Next mission, Change aircraft and Back to
lobby under the cursor. Size S inside phase 10. Phase 10.

**77. Party persistence. PARTIAL.** The room is the party: its code and
pilots survive rounds, mission changes and, in private rooms, world
moves (core.js 937); its host can start another Flight Club game in
passing (`minElsewhere`, `hostCheck`, core.js 479). But a room's activity
is fixed at its making (`meta.mode`, edge/rooms/host.js 211; no setter),
and a war needs a room made for it when public. So a group in Streamer
Combat who want to defend the Paraná make a new room and share a new
code. **Done:** the host of a private room can change its activity
between rounds (`setup { mode }`, the message FLOW-AUDIT.md proposed);
moving into the war asks each pilot's consent and seats only those who
give it. Public rooms keep one activity, so the public list stays
honest. Check: `rooms:server` (CI) and `game:lobby` (local). Size M.
Phase 27.

## 18. Structure and words (items 78 to 84)

**78. Content ownership hierarchy. PARTIAL.** Distinct in code: the
account (account.js; `accounts`, tracks-api/migrations/0002), the pilot
(name and key, pilot.js, identity.js), the room (rooms.js, edge/rooms),
the mission, the aircraft, the world, the build. Blurred: the party is
the room (no separate party, item 77); "session" means three things
(src/share/session.js is the track seat, the account has session tokens,
and the redesign's session is the room). **Done:** item 83's glossary
fixes the words; session.js renamed to what it holds in a pure rename PR.
Size S. Phase 24.

**79. Stable IDs. EXISTS.** Every airframe, world, mission, challenge,
mode and preset has an id apart from its shown name, and shown names are
string keys: `id: 'alps'` with `name: str('registry.the_alps')`
(src/maps/registry.js 72), missions `itaipu-1` to `itaipu-4`, modes
`race`, `tag`, `combat`, `war`, `free` (modes.js 81). Two things are keyed
by a name a pilot typed, deliberately: saved liveries (hangar-paint.js
936) and board callsigns. Checks: `modes:selftest`, `war:stages`,
`hulls:check` (CI).

**80. Configuration vs code. PARTIAL.** Data: a track (a builder JSON
document), mission text (string keys), an activity's art and facts
(modes.js), a world's entry (registry.js). Code: a new mission is a file,
an import in src/share/war/missions/index.js 40, an entry in `ACT1`
(src/game/campaign.js 62) and its strings, three places that can
disagree; a new aircraft is a plant row in C, a WASM build, a renderer in
src/render, and static imports in main.js 190 to 203. The aircraft's C row
is decided (item 21). **Done:** `ACT1` derived from the mission registry
(each mission carries its act and order), so a mission is a file and an
import; an aircraft checklist in configs/airframes.js's header that
phase 12's `airframes:check` enforces (a renderer, a hull, a picture, its
strings). Check: `campaign:selftest` and `war:stages` (CI). Size S. Phase
26.

**81. Feature flags. PARTIAL.** No flags system; unfinished things are
hidden ad hoc: a mission not in the build is filtered (`inBuild`, main.js
5438), an upgrade waits on an act (`later: 2`, campaign.js 97), servers
can be switched off (`?rooms=off`). **Done, decided by the author:** no
general flags object (one place to hide a row is enough); a `hidden`
field on the mode registry's rows and on missions, read where `inBuild`
reads today. Unfinished code otherwise lives on its branch. Check:
`modes:selftest` (CI) asserts a hidden row reaches no card. Size S.
Phase 26.

**82. No silent placeholders. EXISTS.** What is not built says so and is
disabled: "Coming soon" on an unbuilt mission (`campaign.not_built`,
src/ui/campaign.js 188), "Coming in Act {n}" on a later upgrade
(`campaign.later`, 215), invented mock elements dropped rather than faked
(PLAN.md section 1, PILLARS 12 on AI fill). No TODO or FIXME in src. No
check enforces it.

**83. Consistent terminology. PARTIAL.** `lint:nouns` (CI) holds one
rule: the pilot reads "track", never "course" (scripts/noun-lint.js);
docs/SPANISH-GLOSSARY.md fixes the Spanish (track pista, room sala). But
the strings say room 230 times, lobby 43, game 23, match 12, session 6,
and the redesign's words (operation, mission, activity, session, party)
are not fixed anywhere. **Done:** one glossary in
docs/SPANISH-GLOSSARY.md, both languages: operation (Defend the Paraná),
mission (one of its seven), activity (a Flight Club entry), session (a
room set up for an activity, what the pilot sees), round (one go in a
session), room (the code's word, never shown where session fits), party
not used (the session's pilots); `lint:nouns` grows a rule per settled
word. Size S. Phase 24.

**84. Protect the family-origin use case. Held by the owner: to be
discussed with the owner later.**

## 19. The checklist's closing five, honestly

1. **A clean input abstraction layer: half there.** The hard half is
   right: every source (radio, pad, keyboard, mouse, touch) becomes the
   same four timestamped channels the plant consumes, which is why a
   RadioMaster and a keyboard fly the same physics. The other half is
   not: actions are key codes, and four modules read devices directly
   (item 20); mappings are global, not per device (item 16); losing the
   pad mid flight is undefined (item 18). Phase 20 finishes it, and it
   must land before phase 7's controller screen, which would otherwise
   be built on the global map.
2. **A session and party state machine: the server owns it, unnamed.**
   Rooms are authoritative, reconnection and host handover work, version
   mismatch is caught: the expensive part is done. What is missing is
   the vocabulary: each game has its own states and the lobby is
   derived from flags (item 4), and the party is the room, fixed to one
   activity (item 77). Phase 21 names the states without changing the
   wire; phase 27 lets a private room change activity.
3. **Data-driven content: yes, with two seams.** Activities (modes.js),
   worlds (registry.js), missions (stage graphs of reusable triggers),
   tracks, strings, tunes, power options and unlockables are rows. The
   seams: a mission is named in three places (item 80), and an aircraft
   needs C, a renderer and imports, of which only the C row is a
   decision.
4. **A central gameplay event system: missing, and the most expensive
   gap.** Six channels with six vocabularies (item 25). The debrief
   (phase 10), progression (phase 11), achievements (phase 14),
   statistics and analytics are all about to be built, and each would
   otherwise grow its own feed. Phase 22 comes before all of them.
5. **A versioned save system: partial, and urgent.** Sections carry
   `v: 1` and every read is defended, but there is no envelope version,
   no backup, no migration chain and no reset that keeps half (items 1 to
   3). The owner's removal of the 5 inch and the whoop needs exactly that
   migration now, and phases 11 and 14 add fields to progress. Phase 19
   first.

## 20. Before more content: the order

Missions and modes wait on the first four; the rest can interleave.

1. **Phase 19, versioned save**, with the 5 inch and whoop removal as its
   first migration (items 1, 2, 3, 58).
2. **Phase 22, the gameplay event log** (items 25, 26, 27, 28), before
   phases 10, 11 and 14.
3. **Phase 20, input actions and device profiles** (items 15 to 18, 20),
   before phase 7.
4. **Phase 21, named session states** (items 4, 6, 7, 8, 23).
5. **Phase 23, diagnostics**: build version everywhere, the bug report's
   missing fields, a categorised error log, a local smoke run (items 64
   to 68).
6. **Phase 26, content in one place**: missions named once, the
   aircraft checklist, a `hidden` field (items 80, 81).
7. **Phase 24, words**: the last English strings, Spanish layout checks,
   the glossary (items 38, 39, 78, 83).
8. **Phase 27, session continuity**: Continue on home, a private room
   that changes activity (items 57, 77).
9. **Phase 25, comfort**: camera shake, radio captions, UI scale (items
   40, 41).
10. **Phase 29, world edges and budgets**: spawns, chase camera, the
    boundary rule, written budgets (items 46, 50, 51, 53, 71).

Then phase 28 (dev tools), phase 30 (blocks, device table) and phase 31
(signed results), in that order, none before content.

## 21. Owner decisions needed

Only what is genuinely the owner's; each has a recommendation.

1. **Local multiplayer (item 74).** Online rooms only, LAN through a
   self hosted rooms server, or split screen and two pilots on one PC?
   *Recommend:* online rooms, plus a documented LAN path (the rooms
   server already runs on any machine). Split screen doubles the render
   cost the budget (item 46) is spent on.
2. **More analytics (item 63).** stats.js promises three anonymous
   events. Adding which activity and how many missions start, finish and
   are abandoned changes that promise. *Recommend:* yes, as day counts
   only, no new identifier, and privacy.html updated in the same PR.
3. **Errors sent unasked (item 64).** Today an error leaves the browser
   only inside a bug report the pilot files. *Recommend:* send the error
   message, file, line and build (no screen, no name) automatically,
   counted per day like stats; privacy.html updated.
4. **Item 84**, held for discussion as the owner asked.

Decided by the author (cheap, reversible, each a line to change):
controller loss pauses solo and centres the sticks in a room (item 18,
not Betaflight's failsafe, because of standing rule 1); no developer
console, a documented hook index instead (35); no flags system, a
`hidden` field (81); signed war results deferred until an economy has a
price (62); Operations solo stays online (11); a private room may change
activity, a public one may not (77).
