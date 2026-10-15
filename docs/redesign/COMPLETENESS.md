# Completeness: the owner's 84 item checklist, against the code

**Status: LEDGER, kept to the tree** (2026-10-14). First written
2026-10-03 as a proposal for the owner's review, against `main` at
1c64b964 (after #370); since then each phase that builds an item sets its
verdict here and brings its body to the tree, and the counts below are
2026-10-14's.

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
- **DECIDED**: the item asked for a product decision, not a build; the
  decision is logged with its date, who made it, and the evidence from
  the tree it rests on.

Each PARTIAL and MISSING item ends with **Done**: what done means here,
the check that would prove it, its size (S a day or less, M a few days, L
a week or more) and its phase (PLAN.md section 5).

"CI" means the script runs in `.github/workflows/checks.yml`; "local"
means it does not (every browser check, and `npm run verify`, by the
workflow's own header). Paths are from the repository root.

**Counts over the 83 items with a verdict** (2026-10-15, the first verdict
in each item's heading): 35 EXISTS, 41 BUILT (since built by a phase), 3
PARTIAL, 0 MISSING, 3 N/A, 1 DECIDED. Item 84 is held by the owner and has no verdict.

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

**1. Save-state architecture. BUILT (phase 19).** Built (2026-10-13,
w38-save-events): src/share/save.js, the envelope `{ saveVersion,
settings, controllers, aircraft, player, records }` over the keys where
they lie, `saveVersion` 4 under `fdfpv.save.version`, the ordered
`MIGRATIONS` (one step, 3 to 4, nothing moved on disk), opened once per
boot from src/boot.js; the sync blob's `v` is read
(src/share/progressmerge.js). Decided otherwise than the spec below: the
retired aircraft and worlds stay a repair on every read, not migration
steps, since the same ids arrive from rooms, the account and replays
(save.js header), and the whoop's generations went with the whoop.
Check: `save:selftest` (CI) over tests/fixtures/save-pre-envelope.json.
What follows is the gap as first written. There is a de facto main save:
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

**2. Autosave rules. BUILT (phase 19).** Built (2026-10-15 batch,
w43-saves): `save:selftest` (CI) runs each row of save.js's SAVE POINTS
table as the game calls it, on a store of its own, and holds it to the
key it writes: a settings change through `Ui.persistSettings`, Unlock
all, a challenge (hoops_10 by ten gates, `Progress.gatePass`; twice
writes once; nine gates write nothing), a landing counted and the
deadstick challenge on it (a run seated and its frames, `startRun` and
`tick`, paid through progress.js awardFlight), a campaign
commit, a calibration accepted and forgotten, a pad chosen and set back
to automatic, a build saved, renamed and deleted through the Ui, a new
best lap and a first lap, a better record from the account, the name,
the language; and each reader, a slower or equal lap, a refused name, a
refused rename, a flight with nothing to count, a second ask for firsts
and a second `openSave` to writing nothing. Every key of the envelope
must have a save point there, so a new key without one fails. The
shell's own calls (flight time, `src/main.js` commitFlightTime and
pageLeaving; the voice prefs, voiceui.js writePrefs) are held by their
source. Stale, and corrected: the table said "never on exit", but
flight time's last held seconds are written when the page is hidden or
left (`pagehide`), as they must be; there is still no `beforeunload`
save, and the check says so. What follows is the item as it was. The
table of save points is
src/share/save.js's header (SAVE POINTS), each with its trigger and its
file: writes happen on change, with no `beforeunload` save
and none needed. The settings blob on every settings change
(`saveSettings`, src/ui/settings.js, through `Ui.persistSettings`), and
with it progression (a lap, a challenge, Unlock all, a first sight, a
landing or a crash counted, src/ui/progress-ui.js) and the campaign (a
commit of `createCampaignStore`, src/game/campaign.js); the controllers
on a calibration accepted or a pad chosen (src/input/stickstore.js);
builds on save, rename or delete (src/ui/builds.js); a best lap on a new
best (src/game/race.js); the name and the language (src/share/pilot.js,
src/share/sharedkeys.js); the version, backups and quarantine once per
boot (`openSave`, src/boot.js). `save:selftest` (CI) holds the keys to
their modules, not each trigger. The war's result closed the gap (2026-10-15 batch,
w41-warpay): the room sends a war's result only to the seats whose pilot
flew it (enlisted at any point, a late joiner too, by seat token: war.js
`flew`), never to a watcher or a seat that sat it out, in every view and
in the welcome, with the war's `uid` (war.js `warUid`: the wall clock
start, the room code, the match id, unique across rooms and sortable).
The page pays a result once per uid, kept in the campaign's `wars` in
the save, not in memory (src/game/campaign.js `payResult`,
src/ui/campaign.js `observe`), so a reload, a reconnect or a late join
into the result card is paid, and paid once. A room from before uid is
paid as before. Held by `rooms:selftest` (who is sent the result),
`campaign:selftest` (paid once across a reload, an end seen alone pays)
and `progress:selftest` (its firsts once). An ops match's result (The
Interior's stars and flags) follows the same rule (2026-10-15 batch,
w41-opspay): the room sends it only to the seats whose pilot took part
(seated while it was on at any point, by token, kept in the match's
`pilots`: ops.js `took`), with the match's `uid` (warUid, kind `o`); the
page pays it once per uid in the same `wars` list, which keeps the
newest by start time whatever the kind (src/ui/opscampaign.js `record`,
called while a result shows, so a reload at the debrief is paid).
Held by `rooms:selftest` and `campaign:selftest`.
**Done:** a table of save points in `save.js`'s header, each with its
trigger (built), and the war's result paid once per war by an id kept in
the save (built), and `save:selftest` asserting each trigger writes
(built). Not added: `campaign:check` (local) reloading during the result
card; its Node half is `campaign:selftest`'s (paid once across a
reload), and The Interior's is `interior:coop`'s. Phase 19.

**3. Recovery from corrupted saves. BUILT (phase 19).** Built
(2026-10-15 batch, w43-saves): the pilot is told. boot.js hands
`openSave`'s report to main.js, which shows it once in a dialog (after
the retired world's, one dialog at a time; ui.askNotice, one button,
src/ui/dialogs.js) in the pilot's language: what was put back from its
last good copy and what starts fresh with none, each blob named in
plain words (save.js SECTIONS `part`: the settings, progress and
campaign; voice chat choices; stick calibration; joystick choice; the
planes in My Hangar), and that the unreadable copy is kept in this
browser (save.js `saveNotice`). Once: a blob with no backup stays
broken until its reader next writes, so `openSave` reports a broken
text already kept as `.corrupt` as `known`, and `saveNotice` says only
what is new. Held by `save:selftest` (CI: each part named in en and es,
put back and fresh said apart, the next boot silent, a blob broken
differently said again) and `save:notice` (local: a truncated settings
blob with a backup, in English, and a broken My Hangar with none, in
Spanish, each read on screen, closed with one press, the settings read
as the backup's, and silent after a reload). What follows is the item as
it was. Every read is still
wrapped by its own reader (`loadSettings`, `normaliseProgress`,
`cleanCampaign`, `normaliseBuilds` and the rest), and under them, once
per boot before any reader runs, src/share/save.js `openSave` keeps each
JSON blob that reads well as `<key>.prev` and copies one that does not
to `<key>.corrupt`, putting its `.prev` back when there is one (BACKUP
AND QUARANTINE in its header); the migration chain is item 1's. Settings
has a Saved data section with Reset settings and Reset progress
(src/ui/items.js), each behind a confirm (src/ui/actions.js `askReset`)
and each clearing only its half (save.js `resetSettings`,
`resetProgress`); Reset progress is offered signed out only, since the
account's merge grows only. Held by `save:selftest` (CI): truncated JSON,
an empty string, null, an array and a string each quarantined and
restored, no backup leaving the reader's fallback as it was, a broken
backup not put back, and each reset keeping the other half. Missing: the
pilot is not told. A quarantine or a refused step is a `logWarn('save',
...)` line (src/boot.js `openStorage`), in the bug report's ring and the
console, never on screen (built since, above). **Done:** the pilot told
once, in words, when a blob was quarantined (restored or not), en and
es (built); check: a `save` case that boots with a broken blob and reads
the notice (`save:notice`, built). Size S. Phase 19.

## 2. Sessions and multiplayer (items 4 to 11)

**4. Session lifecycle. BUILT.** The room server owns every state, but
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
Phase 21. **Named states built** (2026-10-14, w40-states), as the
brief of that lane had them and not the list above: `SESSION_STATES` is
`lobby`, `countdown`, `live`, `between`, `over`, `abandoned`, the states
of a game's round; reconnecting, outdated, removed and a load failure are
a seat's, kept where they are (the 30 s reconnecting mark, close codes,
the `fail` op below). `GAME_STATES` lists each game's own and
`sessionOf(id, view, roomNow)` maps them (a race's countdown is its goAt
on the room clock; an abandon is the room's, settleGames, marked
`abandoned` on the race, tag, jam, combat and war views). The wire
changed, additively: each game's view, in the welcome and every
broadcast, carries `session` as it stands when sent (and the jam's
`turn`); a client from before passes over both, so ROOM_LEVEL stays 4.
The lobby screen reads it (src/main.js LOBBY_GAMES view, lobbySession,
lobbyRoundOn, lobbySeenFrame) in place of each game's own on and ended.
Not moved onto it yet: the rooms panel's `activity()` and the HUD's own
branches (the war's briefing film and round result, a race's countdown),
which read finer states than these. Checks: `modes:selftest` (every
game's every state maps, each game's mapping), `rooms:selftest` (the
named states as the room says them, game by game, an abandon among
them). A race and a jam in a room made for them end on their own before
ABANDON_MS when their players are all gone, so their abandon is held in
a room where they were started in passing. **Load failure built** (2026-10-14, w40-states), as an op and
not a profile status: a client from before throws on a status it has no
string for (src/main.js roomAwayText, every frame), and passes over a
message type it does not know. A page whose room world fails to build
(src/main.js syncWorldNow, roomWorldFailed) sends `{ type: 'fail', map }`,
stops being summoned to it and says so (`rooms.load_failed`); the room
(core.js fail, failed()) counts the seat out of every game: not on a
race's grid (a racer retired), not a tag or jam player, not enlisted in
a war nor waited for by its briefing, no cuts in combat, not in the
lobby's flags, and not present for ABANDON_MS; the others are told
`{ type: 'fail', seat, map }` (`rooms.away_failed`), map null when its
profile stands on the room's world again. `rooms:selftest` (a load
failure counted out). No browser case: a bad `?map=` fails at boot
before any socket, and nothing cheap forces an in room build to fail.
**The start's count built** (2026-10-15 batch, w43-sessions): a failed
seat still counted toward the `alone` check of a start in passing (tag.js
and jam.js read `core.seats.size`), so a host could start a round the
room abandoned ABANDON_MS later. Decided: a start counts the seats on the
room's world and not failed, bots included (edge/rooms/core.js fielded);
a round on keeps present(). Held by `rooms:selftest` (a load failure
counted out: refused alone with the other failed, then on another world,
then the start goes once it stands on the room's world). Combat started
in passing has no alone check at all, and `rooms:server` holds a host
alone starting one (its restart section): left as it is, a combat round
alone in passing still ends ABANDON_MS later. Not moved onto the named
states, on purpose: the rooms panel's `activity()` says what a joiner
meets (a countdown, a round on with its wave or round number, a lobby
with its ready count), which the named states do not carry, and the
HUD's branches read finer states again (the war's briefing film, a
race's countdown); neither would gain from the move. Every other part of
the Done above is built.

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
can take the seat back. **Built (phase 21):** 4005 is final, said as
`friends.failed_replaced`; `rooms:server` drives the browser's own link
through it, and without the entry the two links trade the seat.

**7. Join in progress rules. BUILT.** Per mode, as the checklist asks:
`allowDropIn` in src/share/modes.js (race false; tag, combat, war, free
true), and `modes:selftest` (CI) asserts race is the only round a
newcomer waits out. But the field is read by nothing at run time (only
scripts/modes-selftest.js 94): the behaviour comes from each game's own
code (race.js 296 fixes its racers; war `join()` enlists; combat gives
paper; tag makes a hunter). The table and the behaviour can drift.
**Done:** the rooms server reads `allowDropIn` where a newcomer arrives
in a running round, and the race's own rule is that field. Check:
`rooms:selftest` flips the field in a test registry and sees the
behaviour follow. Size S. Phase 21. **Built for every game**: core.js
join reads it through the room's registry and hands it to each game (the
race's grid, the war's enlist, combat's paper, the Ace's hunters, the
jam's turns); `rooms:selftest` turns each over, and a newcomer that
waits a round out has no paper, no hunt and no turn until the next.
Checked against the tree 2026-10-15 (w43-sessions): one read
(edge/rooms/core.js join, `dropIn`), and rooms-selftest-gamelobby.js
flips race, war, combat, tag and jam; free flight has no round to wait
out, and an ops match (no registry entry yet) always takes a newcomer.

**8. Multiplayer authority. BUILT.** Decided and mostly server side,
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
**Built:** docs/MULTIPLAYER-PLAN.md 4.1, race passes kept client scored.
The table has every server row's harness, the pay-once rows of the war
and the ops (w41), and since the 2026-10-15 batch (w43-sessions) the ops
match, its captures and a world that will not load.

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

**11. Offline behaviour. BUILT (phase 6).** Built (2026-10-15 batch,
w43-saves): one answer for whether the page can reach its servers,
src/share/offline.js: the device offline (navigator.onLine, the
`online` event), or online with the rooms server not answering (a fetch
that fails on the network, from the room list or a card's room, counts
the rooms down for RETRY_MS, 60 s, or until a fetch gets through or the
device is back). While cut off, `roomLinkState.available()` is false
(src/share/rooms.js), so the cards fly solo and the room games leave the
hubs, the rule a page with no rooms server has had since #372 (stale in
this item: with `?rooms=off` the cards already flew solo, ui.js
pickForWay; flow:check holds Free Flight's); Track Day's or Free
Flight's card pressed as the server stops answering flies solo on the
same press, a room game's asks to try again (src/main.js onGameCard). The pilot is told once a spell, and once when
it ends, in en and es (`offline.down`, `offline.back`), on the toasts,
which queue: on the one notice line the reconnect's "Progress synced."
replaced the line within a frame. The account's
sync sends nothing offline, what changed staying changed
(progressChanged), and sends it the moment the device is back rather
than on the next minute; a failed send is said once until one gets
through (src/ui/accountui.js). Tracks were already kept and sent on
`online` (cloud.js). Decided otherwise than the spec below: the room
games are left off the hubs with the reason said, not drawn disabled,
the representation the no-server page already had; and a cold load
offline stays out (CDN, a CLAUDE.md decision), as does a file the page
has not fetched yet (a tune never flown says it could not be loaded and
the flight keeps the one it has). Held by `offline:check` (local: its
own rooms server and a signed in page; the device offline through
Chromium's network emulation: told once, no room games, Free Flight and
Track Day each reach a flight, the sync sends and says nothing; back
online: told, room games back, the held change sent at once; the rooms
server stopped: the Free Flight card flies solo on its press; the server
back: after RETRY_MS the card makes its room again, told). What follows
is the item as it was. Tracks are offline safe ("Saved in
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
src/share/trackseat.js 273), tracks (`cloud.offline`), assets
(`main.could_not_be_loaded`, `loading.could_not_start`), the GPU
(`gpuinfo.the_webgl_context_was_lost_reload`), account sync
(`account.sync_failed`, `account.unreachable`). A controller disconnect is
item 18. Checks: `cloud:selftest`, `rooms:selftest` (CI); `rooms:session`
(local).

## 4. Controllers and input (items 15 to 20)

**15. Controller hot plugging. BUILT (w43-hotplug).** The roster is
polled every input poll rather than trusted to `gamepadconnected`
(`PadRoster.track`, src/input/padpick.js): a single new pad is taken, a
new pad beside another queues the picker (`hotplug`), the chosen pad
reappearing on any port is found by its id (`match`) and is its return,
not a question, and Choose joystick switches device without a restart.
Losing the flying device is item 18; its return is reported once
(`takeDeviceBack`, src/input/input.js) with its name and whether its own
calibration flies (each device keeps its map, dead zone and expo under its
id, `followDevice`; pad buttons are one binding for every standard pad, so
nothing per device to restore there). The shell (main.js `padLossFrame`)
says each in en and es: lost in flight, item 18's pause or room hold; lost
on a menu or the pause menu, the keys fly until it is back; lost in a
replay, the replay plays on and the loss is answered as one in flight when
the run comes back on screen, unless a device flies first; a hotplug
picker waits for the replay to close. The Controller screen is drawn again
when the device changes under it (src/ui/controller.js `controllerKey`).
Written up in docs/KEYBINDS.md. Checks: `input:selftest` (CI) drives a
fake roster through a radio plugged in after launch, pulled, back on
another port with its calibration and dead zone, another radio taken and
flying its own map, the first back beside it (picker queued) and picked,
a blip between two frames and the keyboard chosen meanwhile;
`input:trace` (CI) pins the picker frame by frame; `lint:input` (local)
pulls and replugs the pad in flight, on the pause menu and in a replay;
`controller:check` (local) with the Controller screen open. The room
branch is checked in Node only (it needs a room server).

**16. Controller identification. BUILT (FOUNDATIONS #9).** The device
is parsed from the browser's id in both browser forms (`parsePadId`,
src/input/padprofiles.js) and a calibration is stored per device under
`deviceKey` = vendor:product:name (`fdfpv.stick_maps.v2`,
src/input/stickstore.js); the old single map was migrated to the device it
was made on. Pad buttons are one binding for every standard pad (the W3C
layout is the same on each), `settings.padbinds` (phase 20). Checks:
`input:selftest` (CI) with two radios and the migration, `padprofiles:selftest`
(CI), `lint:input` (local) two radio page.

**17. Axis sanity checks. BUILT (the message, phase 20); the dead zone
setting is phase 7.** The wizard rejects a noisy centre, demands range on
the sweep, refuses an axis already claimed, learns direction and offers
reverse, tracks endpoints, and says when the radio unplugs mid wizard. A
sweep eight seconds short of full travel now names every axis that never
moved, as a channel when the device's map is vouched for ("yaw (axis 1)")
and as an axis otherwise (`stuckAxes`, src/input/calibrate.js). The dead
zone is per device since phase 7: 0 to 15 percent on roll, pitch and yaw
(src/input/padmap.js `DEAD_ZONES`, `normaliseFeel`), on top of the fixed
0.012 deadband that keeps a resting gimbal from creeping, kept beside the
device's calibration (src/input/stickstore.js) and set on the Controller
screen (src/ui/controller.js `feelRows`). Checks: `input:selftest` (CI)
with a frozen axis on a radio and on a standard pad, and a dead zone kept
per device across a reload; `controller:check` (local) sets one with the
arrow key and reads it stored with the device.

**18. Controller loss failsafe. BUILT (phase 20).** The roster reports
the flying device's loss once (`takeDeviceLoss`, src/input/input.js); the
keys' sticks centre and their collective is marked unused, so the throttle
holds where the device left it. Solo, the run pauses and a notice says
why; in a room (which cannot pause its world, item 23) the craft flies on
centred sticks and a held throttle and a notice says so. With another
device present the picker is queued as before and opens over the pause.
Betaflight's own failsafe stays out of play (standing rule 1). Checks:
`input:selftest` (CI) removes the device mid flight, alone and with
another present; `lint:input` (local) unplugs the pad in a solo flight and
sees the pause. The room branch has no browser check (it needs a room
server).

**19. Keyboard, mouse and gamepad fallback. EXISTS.** Keyboard flight
(WASD and arrows as a Mode 2 radio, hold time as the analogue, input.js
20 to 29), mouse flight with sensitivity, expo, invert and centring
(ui.js 719 to 723), touch sticks (src/input/touchsticks.js), a standard
gamepad with no calibration (`standardPadMap`, input.js 96). Checks:
`input:selftest` (CI); `lint:input`, `mouse:shell` (local).

**20. Input abstraction. BUILT (phase 20).** Flight is abstracted as
before (four channels, timestamped samples). Actions are one table,
src/input/actions.js: each action's default key and default standard pad
button. Keys move through keybinds.js and buttons through padbinds.js, on
the same rules (src/input/bindings.js); in flight a bound button arrives
as its action's key, so main.js's key readers serve the pad, and the pad
only actions (replay, talk, swap) and stepping out read their button by
name (`input.padAction`). No module outside src/input reads a device: the
crash cam, the builder's camera and buttons, push to talk, the camera
ball and the turtle and flip ask src/input. Remappable in Settings >
Controls (docs/KEYBINDS.md). Not built: named camera axes (`cameraPitch`,
`cameraYaw`) and menu navigation as actions; the builder and menu buttons
are read through src/input by name but are fixed. Checks: `lint:input`
(local) fails on `getGamepads`, `.axes[` or `.buttons[` outside src/input;
`input:selftest` (CI) asserts the actions from keys and pad;
`keybinds:check` (local) binds a pad button on the real page.

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
(core.js 178), and the war counts a silent pilot out (war.js 40). The
rule is written in SESSIONS.md (pause, leaving and abandon) and
`rooms:selftest` holds that a pause stops nothing in the room.

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

**25. Central gameplay event bus. BUILT (phase 22).** Built (2026-10-13,
w38-save-events): src/game/events.js, the vocabulary below as the frozen
`EVENT_TYPES`, one append only log per flight on the sim and room
clocks; every achievement paid from it by one fold (item 28), the
counts per aircraft folded from it (item 27) and the Defence lessons
judged from it. Four words added with item 28 (2026-10-15, w43-achieve),
so the challenges read the run's aircraft and power and discovery reads
a place found from the log: `seated` (a new run key, its aircraft,
power and pack), `engine_out` and `battery_low` (the two edges RunWatch
detects in the frames) and `found` (a named place flown into). Three
more with item 26 (2026-10-15, w44-eventwords), so every debrief fact
that is an event is read from the log: `lap_void` (a lap race.js's log
keeps that progression does not count: voided, with its reason, or a
builder's test flight lap off a casual track, with its time), `bail`
(every bail freestyle's scorer counts, a hard bounce included, which
the crash flag's `crash` edge is not) and `trick` (a trick the scorer
took, its id and points); and an Interior match's `mission_end` now
carries its match, state, stars earned and whether it paid, logged
before its debrief shows and, for a match already paid by its uid,
logged unpaid, which nothing counts (src/game/progress.js foldEvents).
None of the three pays anything: `events:selftest` runs its thousand
seeded runs again with them between every call (every answer the
same), and `progress:selftest` folds a thousand seeded flights with and
without them (the same achievements and progress). The log is in
memory only, never stored or sent. Check:
`events:selftest` (CI). What follows is the gap as first written. There
are at least six
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
`mission_start`, `mission_end`, and `contact`, the avionics camera's
primary track held or let go, for Training's Defence track), the room's war ops mapped onto it
unchanged on the wire. Producers are today's call sites; consumers move
one per PR: RunWatch first, then the debrief (phase 10), progression
(phase 11), the replay's events. Deliberately not a pub/sub of
callbacks: a log that consumers fold, so a debrief and a replay read the
same facts in the same order. Check: `events:selftest` (Node, CI) folds a
recorded stream and asserts RunWatch gives today's answers from it. Size
M. Phase 22.

**26. Debrief from events. BUILT (phase 10).** Built (2026-10-15,
w43-achieve and w44-eventwords): phase 10's one debrief frame
(src/game/debrief.js, every activity a builder, PLAN.md row 10) reads
every fact that is an event from the log (item 25): a race's laps from
its run's `lap` and `lap_void` rows (fromRace: clean laps, the run time,
the record line), freestyle's tricks and crashes from its `trick` and
`bail` rows (fromFree), an ops mission's result and stars earned from
its match's `mission_end` (fromOps; src/ui/opscampaign.js record logs it
before the debrief shows, unpaid for a match already paid, and fromOps
fails loudly without one), and a room game's points from its last
`round` (fromRoom). A race and a freestyle run outlive their flights (a
recovery, a seat swap or a placement each start a new log), so their
debriefs read the run's events (src/ui/progress-ui.js runEvents, kept
with the run's bests and forgotten with them, in memory only). Handed in,
each deliberately: what is measured, not an event (the time in the air,
the route, the replay, the condition, a plane down and whole at the end,
a freestyle run's clock), what is worked out from the events by their
owner (the score, score.js's; a room's places and the war card's kills,
the room's order), and what the course and the mission are (the record
chased, the stars there are); a run end event carrying them would make a
rebuild pass by construction and prove nothing. Checks: `debrief:selftest`
(CI) keeps the old readers as oracles and, per activity, drives the log
beside what the screen used to read (five hundred races over one to
three flights with voided and test flight laps, three hundred scored
freestyle runs on a real FreestyleScore, the Interior's results through
opscampaign.js record, a reload at the debrief included) and asserts the
debrief from the log, and from a JSON round trip of it, is the old one;
`events:selftest` and `campaign:selftest` (CI) hold the producers;
`debrief:race`, `debrief:free`, `interior:debrief` and `tag:twopage`
(local) hold each page's debrief equal to its log's (the race's laps
over thirteen flights, three tricks landed through the judge's callback,
each match's logged result, each pilot's round). What follows is the
gap as first written. The war's round card
(src/ui/warround.js) reads counters the room accumulates during play
(`m.roundMw`, war.js 1750; `player.kills`, 1576) and logs each round
(`this.log.push({ what: 'round', ... })`, 1924), which is event shaped.
Race results are computed from final state (`end()` calls `standings()`,
edge/rooms/race.js 197 to 228). Each game has its own end screen; there
is no shared debrief (PILLARS 20). **Done:** PLAN.md phase 10's one
debrief frame reads phase 22's log, so route, time, crashes, landings and
kills come from what happened. Check: phase 10's results checks, plus
`events:selftest` folding a debrief. Size M. Phase 10, after 22.

**27. Unified statistics. BUILT (phase 11).** Built (2026-10-13): landings,
crashes, laps, kills and missions started and completed per aircraft,
folded from phase 22's log into `progress` (src/game/progress.js
COUNTED, foldEvents), merged as the higher by progressmerge, checked by
`progress:selftest` (a stream folded twice gives one count). A kill is
logged only for a victim the room credited (war.js `dead` carries
`credited`, `rooms:selftest`). A mission is started when the client
sees its war begin and completed when its result is applied, won or
lost (src/ui/campaign.js observe). The Interior's mission_start is
logged where its match goes live (src/main.js, the ops state to
`live`, 2026-10-13), the vantage its mission_end is recorded from, so
started and completed count alike for both campaigns. What follows
is the gap as first written. stats.js sends three anonymous
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

**28. Achievement triggers. BUILT (phase 14).** Built (2026-10-15,
w43-achieve): one function pays every achievement from the flight's
event log, src/game/progress.js `awardFlight`: per event in log order a
lap's XP and its course's first lap (awardLap), its medal (awardMedal),
the bests (bestsOf), the aircraft challenges (aircraftChallengesOf), the
seven challenges and a place `found` (awardPlace), then the counts
(foldEvents) and last the firsts. Each award keeps what it paid, and
the fold's cursor means a log folded twice pays nothing twice. The
seven challenges are rows of `CHALLENGES`, each `on` one event type with
a `when` over the run's state (`challengeRun`, folded by
`challengesOn`, carried across a run's flights and reset by `seated`);
RunWatch only detects (a landing, the engine quitting, LOW BATTERY) and
the log says what it found. src/ui/progress-ui.js Progress logs and
toasts and pays nothing itself: `foldFlight` is its one call into
awardFlight, and `checkFirsts` is that fold. The firsts stay read from
the pilot's record, not the log: a mission's win and stars are the
campaign's, merged from every computer, an aircraft's milestones its
flight time, and src/game/economy.js pays tokens from that same list.
Checks: `events:selftest` (CI) keeps the old judge as an oracle and
drives it and the log's rows call for call over a recorded flight, a
new seat inside a contact and a crash, and a thousand seeded random
runs that fire all seven (every run agrees), and holds the producers in
progress-ui.js to logging only; `progress:selftest` (CI) feeds recorded
logs to awardFlight and asserts exactly which achievements fire, in
order (a hoop streak, a lap's XP and medal, two bests, the first lap
and the clean Timber lap, a place, the endurance, the dead stick, two
firsts), then nothing on a second fold, and no achievement twice on the
whole log again; a run's laps carried over three flights; dead stick,
the glide and a seat mid crash from the log. What follows is the gap as
first written. Seven challenges (progress.js 141)
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

**33. AI debug overlay. BUILT (phase 28).** src/ui/wardebug.js, in
developer mode only (its `set` turns on only under devhooks.js DEV, and
the toggle `__warDebug(true | false)` is a devHooks hook): over the
picture, every live attacker's route from now, 60 s ahead (routes.js
poseAt), its next waypoint (the end of its leg, an orbit's centre, a
line's end), a Hunter's target seat as HUNTS said it with a line to that
pilot, and a label of its kind, id and the stage whose spawn it is.
Drawn from roomwar `debugAt`, after the frame's render as the war markers
are. Check: `war:markers` (local, GPU): off until the toggle and off
again draws nothing; on, every live attacker listed with its stage, each
but a Hunter with a route and a next waypoint, the faced contact's route
and label on the picture, and a next waypoint that is a point of the
mission file's own route; a picture in its outdir.

**34. Spawn and stage tools. BUILT (phase 28), invulnerability and wind
left.** URL flags: `?time=`, `?spawn=`, `?craft=`, `?gpu=low`, `?map=`
(main.js, ui.js); developer hooks `__placeCraft`, `__setCam`,
`__crashSetDamage`, `__weather`, and `__warDo('start' | 'brief' | 'end' |
'skip' | 'complete')`. The war's room (edge/rooms/war.js devOp) takes
`{ op: 'skip' }`, the stage left by its first exit that is not a loss as
if it had fired, and `{ op: 'complete', objective? }`, the stage's
objective (every open one, without an id) done at the frontier; both
logged as `{ what: 'dev' }`. Host only; a public room refuses them
`'public'`, and a private room `'dev'` unless the server starts missions
in development (DEV_MISSIONS) or the host is one of its DEV_ACCOUNTS. The
admission is the server's, decided by the lead, not a flag the client
sets on the room: a mission won by a skip counts. Check: `rooms:selftest`
(CI), the war section's developer ops: both refusals, a non host, an
unknown objective, complete, skip into the result beat and the next
stage after it. Not built: invulnerability and changing the wind in a
room.

**35. Developer console. BUILT (phase 28).** No typed console, decided by
the author: a console that parses commands is a second UI to maintain.
src/share/devhooks.js HOOKS indexes every `window.__` hook src defines,
180 of them, with what each changes or null for one that only reads;
`window.__dev.help()` lists the gated ones in developer mode
(`help(true)` all). Check: `lint:shell` (CI) fails a hook missing from the
index, an index row nothing in src names, and `window.__dev.help()` on a
local host that does not list the index's gated hooks.

**36. Debug and release builds. BUILT (phase 28).** Pages excludes
tests/browser, scripts, edge, docs' markdown and more
(.github/workflows/pages.yml 42 to 47), and the client holds no server
secret. The 62 hooks that change state (placing the craft, damage, war
ops, the shell's own objects) and `__dev` itself are assigned to
`devHooks`, and the one flag a check sets that src reads,
`__showSticks`, is read through it. devHooks is window
only in developer mode: `?dev=1`, or a local host by devhooks.js
LOCAL_HOST, the one rule the Itaipu map's local data and index.html's
front door use too (the front door, which runs before any module, holds a
copy marked KEEP IN STEP). Elsewhere they land in an object nothing holds.
Read only hooks stay on window. Every browser check runs on 127.0.0.1, so
none passes a flag. Check: `lint:shell` (CI) fails a gated hook assigned
to window, a read only one assigned to devHooks, the front door's copy
differing from LOCAL_HOST, and a second page served under a public host
name (openPage `host`) that shows any gated or unindexed hook.

**37. Content validation. EXISTS.** In CI: `lint:presets` (every tune),
`lint:catalog`, `modes:selftest` (the registry whole, its strings and
pictures present), `films:lint` (films as data, both languages),
`strings:selftest` (key parity), `hulls:check` (every airframe),
`war:routes` and `war:stages` (every mission), `itaipu:courses`,
`campaign:selftest`, `parts:check`, `tuning:check`, `motors:check`,
`lint:copy`, `lint:nouns`, `lint:dashes`. Local only: `check:craft` (every
airframe drawn), `itaipu:spawns`. Phase 12 adds `airframes:check`.

## 10. Words (items 38 to 39)

**38. Localization readiness. BUILT (phase 24).** English and Spanish
(src/strings/en.js, es.js); `strings:selftest` (CI) holds parity,
placeholders and plurals; `lint:copy` (CI) fails on prose outside the
tables and on a label of one capitalised word that is not compared
against (isWord: key names, proper names, units and a few ids excused by
name, 13 fixed samples first). A refused replay says why in the pilot's
language, one key per reason (src/replay/file.js REFUSALS: not a replay,
too large, a version this build cannot read, an aircraft or map it lacks,
damaged), the English detail kept for the log; `crashcam:selftest`
proves each. Trick names, and a pad's Pitch and Roll key caps, are
proper names by decision.

**39. Text expansion. BUILT (phase 24).** `lint:devices` walks every
device in English and Spanish and `modes:card` page H opens home, Flight
Club and a lobby with ?lang=es at four sizes; both fail on a cut word
(text past the box that clips it, an ellipsis included) after one cut on
purpose is found, and both run in CI on shard-3. What they found was
fixed in the layout: menu rows wrap a control under its label and a
value onto two lines rather than cut them, the phone's command bar
comes down a step, and on a touch phone home's hub links stay 44 px and
the hubs scroll.

## 11. Comfort, audio, graphics (items 40 to 47)

**40. Accessibility fundamentals. BUILT except hold or toggle choices.**
Present: rates and mouse sensitivity, mouse invert, reverse per channel,
stick modes 1 to 4, field of view and camera angle, angle mode, three HUD
styles, subtitles in the war films (src/render/warintro.js),
`prefers-reduced-motion` in several places. Key and pad button remapping
in Settings > Controls (phase 20, docs/KEYBINDS.md). The war radio's
story, guide, briefing and debrief lines are captions (main.js
warSubtitles; the calls are the HUD's callouts), now behind a Radio
subtitles setting, on by default (phase 25). A Menu size of 100, 115 or
130 percent, as CSS zoom on the menu screens because the sheet sizes type
in px (phase 25). Missing: hold or toggle choices (manual flip is hold
only). Checks: `war:radio` (CI) asserts a one line caption per line in
both languages; `uiscale:check` (local) at 130 percent; `lint:responsive
-- --ui-scale 130` (local).

**41. Motion sickness controls. BUILT (phase 25).** Field of view (75 to
115, src/render/lens.js) and angle mode exist. A Camera shake setting (on,
reduced to a third, off) scales the lens shake, the impact kick and the
war's shake together where they are applied; on is the default and the
measured picture, and a pilot whose system asks for reduced motion and
never chose starts on reduced. Chase smoothing (tight 60 ms, standard
120 ms as before, smooth 300 ms) sets the chase camera's follow, the
pilot's and the spectator's. Head bob and motion blur do not exist.
Check: `comfort:selftest` (CI).

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
(ui.js 387) and a dynamic resolution pacer that holds the GPU to the
owner's 90 frames per second by scaling the internal buffer, with a
check that a step bought its time back (src/render/dynres.js,
`TARGET_HZ = 90`; there is no src/render/pace.js). What it floors is the
render scale (0.75 Balanced, 0.5 Performance), not a frame rate: no 30
fps floor is defined (item 71). No check holds the pacer: phase 29 did
not add one, because its frame times on this box's shared card measure
the other lanes (docs/BUDGETS.md: alps-low at Low 49 ms a frame with the
card 100 % busy, 6.1 ms at 25 %). A pacer check needs a quiet card.

**46. Performance budgets. BUILT (the full room within the contract
since 2026-10-14, the war at mission 1's peak since branch
w44-perfwar).**
docs/BUDGETS.md is one table:
the menu (`title`), each world (`alps-low`, `swiss-low`, `itaipu-stream`,
`interior-ops`), the war at full load (`itaipu-war`), the war at its
peak (`itaipu-war-peak`: mission 1's First Light in a full room, eight
pilots enlisted, 45 to 49 attackers alive at most, the seven defenders'
quads in view, the dam, the explosions; flown through the room's
developer skip, measured 2026-10-14 three runs a tier) and a full room
(`peers`: seven more pilots' 7 inches in view, from perf-play on the
room's wire), at Low, Medium and High, measured on this box 2026-10-13
and 14. Draw calls, triangles, live textures and the GPU floor are held
at a ceiling set from the measurement beside it by `perf -- --budgets`
(scripts/perf-play.js, local: one run per tier, an Itaipu set peaks at
4.3 GB); frame times are written with the card's busy share beside them
and never held, and so are the attackers alive in the war's window (1,
in stage 1, Eyes: the window is early in mission 1, not at its peak) and the peers in view (7). The contract is the main view's at
High, 300 calls and 2.5 M triangles (4.0 M at Itaipu), the thermal inset
apart at 110 calls (docs/BUDGETS.md, The contract, 2026-10-13): every
world's and the war's main view is within it, and since branch w43-perf
so is a full room: 368 calls as a whole frame at High (739 before), 279
in the main view and 105 in the inset at the busiest frame (perf-play
`--calls`, which splits a frame by pass; 557 and 194 before). A peer's
inks and blur discs are one mesh each (src/render/combatcraft.js
joinPeerHulls), a peer under 1 % of its view's height draws a far model,
its palettes, lens, motors and rotors as one mesh, the rotors still
(combatcraft.js peerFarModel, src/render/peers.js PEER_FAR_SHARE, the
documented rule; a thermal draw keeps the motors apart for their heat),
its name tag left the ink prepass and the thermal picture, and a pilot
figure is five meshes, not ten. Pixels: an in page A/B against the base
tree, 0 to 42 px different per case over eight views and three passes
(docs/PERF.md, A full room under the contract). The war's peak is within
it too since branch w44-perfwar: 278 calls in the main view and 103 in
the inset at High in every run of three (299 and 120 before; 361 calls
as a whole frame, 379 before). An instanced mesh with nothing in it, or
an attacker kind with nothing in a camera's view, issues no draw
(src/render/attackers.js drawCount, paradrops.js, breakage.js: three
r160 draws a count of 0), 0 px different over eight views and three
passes in an in page A/B; and a sensor's own colour picture leaves the
name tags out, as its thermal one did (src/render/sensorview.js
sensorHide), each 1 to 3 of the inset's 270 rows tall at the row's 20 to
102 m. No attacker is dropped or simplified, so a target is drawn as
before at every range (docs/PERF.md, The war at its peak). A peer nearer than
about 23 m in the row's view draws its near model, 10 calls a pass. The
ceilings hold today's cost; whether a row is within the contract is
the column "Over the written contract". Texture megabytes are not
measured and cannot be from here: three's `renderer.info.memory` counts
textures, WebGL has no query for what one holds on the card, and
perf-play's upload bytes are a frame's uploads, not what stays
allocated. The peers' GPU floor moves by half between runs on the shared
card, so it is held from the highest of three. Checks: `perf --
--budgets` (local), `render:golden`, `check:combat-models`,
`kits:quads`, `rooms:wrecks` (local), `war:twopage`, `sensor:check`.
Size S. Phase 30.

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

**50. Spawn safety. EXISTS.** Every start on every buildable world is
checked: the map's own, spawnFor's answer per kind and `?spawn=` wish,
each float start, each moved to all eight room seats, and the pilots'
stations, read off the seated map's height, water and colliders: above
the ground and not covered, dry (on the water for a float), clear of
solids, facing a 1 in 4 climb out clear for 150 m, with negative
controls per world (scripts/world-spawns-check.js, `world:spawns`, CI,
216 checks in 59 s). It found Itaipu's room stations under the dam
(200 to 219 m); the crest start now carries its own station line
(src/maps/itaipu/spawns.js, src/game/slots.js). Itaipu's starts also
settle undamaged in the plant, its seats and courses too
(`itaipu:spawns`, local). Courses too, on every world a track is built
in (alps, swiss2, Itaipu): each course a world ships (Itaipu's two,
docs/itaipu-courses; the valleys ship none) and the casual sky track My
tracks makes there for a plane and for a quad (src/builder/course.js
casualCourse, from the spawn), its start (startFor) and each gate's
approach above the ground, clear of solids and inside the playable
square (src/game/edges.js), with controls per world: a course start
under the ground, a gate in a solid, a gate past the square. The
Interior has no float start, so its water control is a ground start on
Río Sereno (420, 470), where the ground the shell seats on is the
water; on the channel's bank the plant's water runs 0.8 m under the
ground, so the control looks for the water at the ground. The Interior
is no build world (src/maps/registry.js), so it has no courses. Not
checked: a floatplane's course start, which is the same gate's air
start (course.js floatStart), and a player's saved track, which is
judged by the builder's own line (src/builder/line.js) when it is laid.

**51. Camera collision. EXISTS.** The chase camera, a wing's, a
wreck's and the one behind a watched peer, pulls in along the line to
the craft until it is 0.4 m clear of every solid the plant meets
(src/render/chasearm.js pullIn, after the smoothing in src/main.js
chaseCamera and watchCamera); a craft nearer a solid than that lends the
camera its own gap, so a plane parked on a deck keeps its arm. Above the
ground and the roofs it is clamped as before. Checks:
`chasearm:selftest` (CI, real colliders, each case proven wrong
unfixed), `chase:walls` (local: the plane by a wall on the alps and by
the dam on Itaipu; with the fix removed it fails, the line 0.00 m from
the wall).

**52. Respawn logic. EXISTS**, per mode as the checklist asks: combat
tops up paper, unlimited (combat.js 26); the war spends an airframe per
loss, earns one per kill, 10 s respawn, spectate when out (war.js 29 to
50); tag holds a wreck uncatchable until it respawns; a race resets
itself and the server accepts the voided lap (race.js 327); a teleport is
`FLAG_SPAWNING` for 5 s. Checks: `combat:restart`, `combat:harness`,
`war:harness` (CI).

**53. Boundary handling. EXISTS.** One rule for every world
(src/game/edges.js, src/main.js edgeFrame): past the world's playable
square the banner says turn back with the start's bearing and distance,
past twice it a five second notice and then the R key's own reset,
called off by coming back inside. No wall and no force. The squares are
3000 m for the alps and swiss2 (the valley's field), 10240 m for Itaipu
(half its data) and 8000 m for the Interior (its play area), squares
because every world's data is one; past each is ground (far range,
apron). A live operation keeps its own boundary instead (edge/rooms/
ops.js `BOUNDARY_MS`). Strings `edge.turn_back`, `edge.leaving`, en and
es. Checks: `edges:selftest` (CI: each square against its source
constant, twice it inside what the world draws, the rule with
controls), `edges:page` (local, the alps).

**54. Anti-frustration. EXISTS.** R resets (main.js 12962), X unsticks
in place (12974), turtle mode rights a flipped quad from the arrows
(8287), T holds a crash flip (7859), Restart run and Fly again from the
pause and results (ui.js 7358, 7457). Checks: `wreck:check`,
`crash:feel` (local).

## 13. First minutes and returning (items 55 to 58)

**55. Tutorial interruption. BUILT (phase 8).** Built (2026-10-14,
w43-return): TRAINING.md section 10 is the rule, by cause, each said in
a toast in English and Spanish. The pause menu however it opens (Escape,
the tab hidden, the flying controller lost in a solo flight) holds the
lesson, and Resume carries on in the same step: the judge counts on the
sim clock (src/game/training.js LessonWatch), stopped while paused, and
src/ui/actions.js `pause` says it. A crash starts the steps again
(section 9's rule), now said once per crash (LessonWatch `crashes`). A
room joined that is not the lesson's own ends it (src/game/training.js
`lessonFliesIn`, from src/main.js roomSessionWelcome into
src/ui/progress-ui.js `roomJoined`); Racing a pilot and the Defence
lessons keep their rooms. A reload or a closed browser: the lesson in
flight is kept under `fdfpv.lessonInFlight`, so the next load says it
was interrupted (`lessonReloaded`); its settings already go back on that
load. A lesson left either way is marked Interrupted on the Learn to fly
page, which lists every lesson with Fly for replay, from step 1. The
lessons themselves (TRAINING.md phases 1 to 5, 26 of them) were built
by the training lanes before this. Checks: `training:selftest` (CI: a
pause across a gap in the frames held in its step, a near miss, Turns
resumed on its second circle, a crash counted once, which rooms a lesson
keeps, the notices in both languages) and `training:check` (local: the
tab hidden in a lesson's flight, Resume, a crash's notice, a reload mid
lesson and the Interrupted mark, a combat room joined over Turns).
Decided against the first spec (w43-return, 2026-10-14): a retry is from
step 1, as the lead's crash rule in TRAINING.md section 9 already has it
(a step's progress belongs to the flight that made it), and lesson one
is Sticks (`first_sticks`), with the first flight hint left as the hint
it is. What follows is the gap as first
written. How to fly can be opened again
from the menus (ui.js 6497, 7420); the calibration wizard has Cancel and
Skip (ui.js 4403); the first flight hint retires itself. But the first
flight hint cannot be replayed, and there are no lessons yet. **Done:**
TRAINING.md's lessons (phase 8) each pausable, retryable per step,
skippable, and listed for replay; the first flight hint is lesson one.
Check: `progress:selftest` runs each lesson's judge (phase 8's check).
Size M. Phase 8.

**56. First-run experience. BUILT (phase 7).** Built (2026-10-13,
w38-controller): "What will you fly with?" asked once on a first visit,
before any queued picker (src/ui/flywith.js), a radio straight to the
calibration wizard and the rest to How to fly. Check: `controller:check`
(local, the question in the real page) in place of a `flow:check` case.
What follows is the gap as first written. A first run is detected
(`detectFirstRun`, ui.js 964) and gets the first flight row; the language
follows the browser (src/strings/index.js 104). The controller question
appears only with two pads. Decided already: "What will you fly with?"
once, a radio straight to calibration (PLAN.md 6 item 19). **Done:**
PLAN.md phase 7. Check: `flow:check` (local) adds the first run question.
Size M. Phase 7.

**57. Returning-player experience. BUILT (phase 27).** Built
(2026-10-13, w38-continue): the last activity kept (settings
`lastActivity`, synced), and Continue stands in that activity's link on
its hub, one press into it through openSession with the remembered Who
joins (src/ui/actions.js, src/ui/cards.js); home's order unchanged;
hidden for an unknown id, a room game with no server and a campaign with
no mission this page may play. Check: `modes:card` (local). Built
(2026-10-14, w43-return): the campaigns. A campaign's Play records it as
the last activity (src/ui/campaign.js play1 the war, src/ui/opscampaign.js
go The Interior, whose card has no registry row: src/ui/continuity.js
widens `lastActivity` to it, and a build that does not know the id shows
no Continue, so no migration). Continue on a campaign is its next
mission's Play, the consent and room as that Play's (action
`continue-mission`), the mission named in the link's title; the next
mission is not stored but derived from the synced campaign progress (the
first this page may play and the pilot has not won), so a reload, a sign
in and another computer agree on it. With every playable mission won,
Continue opens the campaign's page. Checks: `campaign:check` (local:
after mission 1's win and a reload, Continue holds mission 2; another
computer signed in as the owner gets it by the sync and one click asks
the consent and makes mission 2's room; The Interior's Play makes it the
last activity, Continue its mission 1, then mission 2 once 1 is won) and
`actions:golden` (CI, `continue war|interior campaign:...` cases).
Before 2026-10-14 the gap was wider than this item said: a campaign's
Play went in by the Defend Itaipu way, which has no registry card, so the
war was recorded only by a Who joins change in its lobby, and The
Interior never. What follows is the gap as first written. The last
activity is not
remembered (`this.mode = linkedMode()` reads only the URL, ui.js 3432);
nothing says "last flown" or "continue". The aircraft and worlds are
remembered. **Done:** the last activity and, for Operations, the next
unplayed mission are stored per pilot (phase 19's save); home shows one
Continue link under the hub that holds it, one click into that session.
Home's order is untouched (Flight Club first, #386) and nothing opens on
its own. Check: `modes:card` (local) reloads after a Track Day and finds
the Continue link. Size S. Phase 27.

**58. Quit and abandon. BUILT.** The room keeps the mission and the
lost stage across a reload (war.js 1071, 963); a war with nobody left
ends after 10 s (`abandon`, war.js 950); leaving is not scored as a
failure. Missing: a written rule, and the result lost when the client was
not watching (item 2). **Done:** the rule written in SESSIONS.md
(leaving mid mission keeps the room's checkpoint for the others; the
leaver keeps stars already earned; nothing is lost but the round in
progress), and item 2's fix. Check: phase 19's `campaign:check` case.
Size S. Phases 19 and 21. **Built** (checked against the tree 2026-10-15,
w43-sessions): the rule is SESSIONS.md 3, "Pause, leaving and abandon"
(a drop keeps its seat RESEAT_MS, leaving mid mission keeps the room's
checkpoint, abandon after ABANDON_MS, never in an empty room, a world
that will not load, who counts at a start); item 2's fix is w41's: the
room sends a war's or an ops match's result to every seat that flew it,
and the page pays it once per uid in the save, whether or not it saw the
end. Held by `rooms:selftest` (who is sent the result, the abandon, the
load failure), `campaign:selftest` (an end seen alone pays, once across
a reload) and `interior:coop` (local: a reload at the end). The
`campaign:check` browser case is not added: its Node half is
`campaign:selftest`'s (PLAN.md row 19).

## 14. Online safety (items 59 to 62)

**59. Leaderboard sanity. EXISTS.** The board re-flies every published
lap's geometry: it starts on the line, passes every gate in order,
crosses again, matches its clock within 60 ms and never moves over 100
m/s (src/game/verify.js `checkLap`, imported by the board's repository);
a lap with a gate skipped is refused with 422. The arcade flight style is
kept off the public board (PILLARS 19). Checks: `lap:selftest` (CI);
`wing:e2e`, `board:live` (local).

**60. Privacy controls. EXISTS.** Mute per seat, kept through a reseat
(edge/rooms/safety.js 159); report, with removal for 30 minutes at a
third of the room (safety.js); kick in private rooms; private rooms with
a code; chat and emotes from preset lists only (no free text); voice push
to talk by default, per peer volume, and the room refuses voice between
muted pairs (edge/rooms/voice.js 71). Missing: a block that outlasts the
room (mutes are per seat in memory, src/share/roomsafety.js 9). **Done:**
a signed in pilot's blocks are stored by account key on the account; a
blocked pilot is muted on sight and never quick joined into the same
public room; since 2026-10-14 the room list and quick join leave out,
on the server, any room holding a pilot the joiner blocks or who blocks
the joiner (the page sends its session as a Bearer header; quick join is
`GET /v2/public/<map>` for a code, then the join; 503 `accounts` when
the accounts server is down, never an unfiltered guess; a guest mute
excludes nothing). Checks: `rooms:accounts` (CI), `rooms:selftest`
blocks section. Size M. Phase 30.

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
**Built** (2026-10-15, w44-anticheat): a race's passes and finishes
are no longer taken on the client's word. The room keeps its own count of
each racer's race from the racer's 30 Hz poses against the track's gates
(edge/rooms/anticheat.js, the witness; race.js hands it every claim and
core.js judge every pose), erring toward the racer at every step: a gate
counts within its widest scoring box and, for a plane, PLANE_REACH; the
path between two poses is given the slack 100 m/s allows; a gap or a
respawn is credited with every gate reachable at 100 m/s; the count never
loses a gate. A claim further on than that count at its time plus LATE_MS
is refused: a pass is dropped, a finish retires the racer, and nobody is
removed from the room for it. Real flights, zero refusals: the 24 stick
recordings in tests/inputs flown on the plant and scored by the shell's
own Race (174 passes), the AI racers on the plant, and two browser pages
racing (8 claims). Negative controls refuse a finish of laps not flown,
passes for gates not visited, a finish 1.5 s early, a finish unreachable
from the last pose, and every one of a quad's recorded passes claimed a
second early. Checks: `rooms:selftest` (CI), the race witness and AI
racers sections; `rooms:racetwopage` (local). Checked against the tree,
already held: hits and kills are decided by the room (referee.js, war.js
blasts), never claimed; text, pose and join rates (core.js TEXT_PER_S,
POSE_PER_S, JOINS_PER_MIN); the board re-flies every lap (item 59, the
board's server.js `checkLap`); the tracks server takes no lap time and
prices the wallet itself. Not built, and why: a per airframe speed limit
(`topSpeed` is level flight on a fresh pack, a dive exceeds it, the Power
tab fits stronger motors the room's profile does not carry, and pose
velocity includes the wind), so safety.js POSE_MAX_SPEED stays the one
limit; Trick Battle numbers (docs/JAM-PLAN.md, the trust boundary); a
racer that sends no pose at all is not judged.
**Fixed** (2026-10-15, w44-roomsfix): AI racers' passes ran ahead of
their own poses, about 20 ms a second of race (seat 2 of a live race:
claim 63498 against pose 62366 by its last gate), so their race times
came out long. The plant steps whole ms and the room's tick is 33.3 ms:
each tick stepped from where the plant had stopped, rounding up two
thirds of a ms every tick. edge/rooms/airace.js now keeps the AI clock
in the room's ms, unrounded, and flies the plant to it. Check:
`rooms:selftest`, AI racers section: every AI claim within one pose
interval of its newest pose (was 204 to 1730 ms past it before the fix,
-1.7 to 30.3 ms after), the witness refusing none.
**Fixed** (2026-10-15, w44-roomsfix): a refused finish left the page
out of step: it still showed its own time and place and resent the
finish every 1.5 s, which the room dropped. The race's row for a racer
whose finish was refused now carries the witness's reason (`why`, on
that row only, additive, ROOM_LEVEL 4), and src/share/roomrace.js takes
the room's row over its own finish: out, no resend; the results screen
says why (roomrace.refused_laps_not_flown, en and es). Checks:
`rooms:selftest`, race witness section (the cheater's page: out, one
finish sent, was five); `rooms:racetwopage` local, a third race whose
finish from B the room refuses (B out with the reason line, 0 resent
in 4.5 s, was 9).
**Built** (2026-10-15, w44-roomsfix): the witness's verdicts are in the
VM's health (edge/rooms/health.js, GET /v2/admin/health): `race.claims`
and `race.refused` since the process started, the UTC day's
(`day.raceClaims`, `day.raceRefused`), and each room's since it woke
(`perRoom` rows), so a refusal in production is seen. Checks:
`rooms:selftest`, scale section (two rooms, one waking with a fresh
witness: 26 judged, 4 refused); `rooms:server` (the fields on the live
route).

## 15. Telemetry and diagnostics (items 63 to 67)

**63. Analytics events. PARTIAL.** Three anonymous events and nothing
else, by design (src/share/stats.js 11 to 20: no address, no user agent,
no pilot, no timestamp sent). No `mode_selected`, `mission_started`,
`mission_abandoned`, `tutorial_completed`. **Done:** an owner decision
(section 21). If yes: the same three event rule kept, with the session
event carrying the activity and the flush event counting missions
started, completed and abandoned as day totals, no new identifiers.
Check: `stats` keeps its refusal list; a Node selftest asserts the new
fields are counts. Size S. Phase 23, if decided.

Checked 2026-10-14 (w43-telemetry), nothing built: privacy.html's Site
statistics names what the board counts (pilots, sessions, laps, flight
time, crashes; country, aircraft, input, map), and neither the activity
nor a mission count is in it, so under its own rule (change the page in
the same pull request as what is kept) nothing new may leave before the
owner's yes. Nothing is built ahead of it either: a fold with no sender
is a switch nobody sets. The yes is one change in two repositories, all
three parts in the same release:

- here, src/share/stats.js: the session event gains `activity`, the
  mode registry's id (src/share/modes.js, a fixed list); the flush event
  gains `started`, `finished` and `abandoned`, the missions since the
  previous flush, folded from the gameplay log's `mission_start` and
  `mission_end` (src/game/events.js; a start with no end when the flight
  closes is abandoned), capped in `PER_FLUSH` like laps. No mission id,
  no result, no stars, no time. `stats:selftest` asserts the four new
  fields are an id from the registry and three integers, and its
  refusal list stands as it is.
- the board's repository: public/stats.js kept in step, and its event
  validator taking the four fields and counting them per day.
- privacy.html, both languages, Site statistics' first sentence:
  "The board counts pilots, sessions, laps, flight time, crashes and
  missions started, finished and given up as totals per day, with the
  country as two letters and the aircraft, input, map and activity as
  one of a fixed list." and "El tablero cuenta pilotos, sesiones,
  vueltas, tiempo de vuelo, choques y misiones empezadas, terminadas y
  abandonadas como totales por día, con el país en dos letras y la
  aeronave, el control, el mapa y la actividad de una lista fija."
  with its Last changed date.

**64. Crash reporting. BUILT (phase 23); sending unasked is the owner's
decision.** Built (2026-10-13, w38-save-events): the bug report carries
the build (src/share/bugs.js `reportFields`) and item 65's log of the
last 50 lines beside the crash record. Checks: `bugs:selftest`,
`crashrecord:selftest` (CI). What follows is the gap as first written.
Page errors and unhandled rejections
are recorded locally (src/share/crashrecord.js 148, from boot.js 44) and
sent only inside a bug report the pilot files with F8 (src/share/bugs.js,
`submitBug`, ui.js 5807), with up to four screenshots. Nothing is sent on
its own, and the report carries no build version. **Done:** the bug
report carries the build and the last 50 recorded errors; whether errors
are also sent unasked is an owner decision (section 21). Check: phase
23's `bugs:selftest`. Size S. Phase 23.

**65. Structured logs. BUILT (phase 23).** Built (2026-10-13,
w38-save-events; every site 2026-10-14, w43-telemetry): one ring of
`{ atMs, cat, msg, count }` in src/share/crashrecord.js, 50 lines, the
checklist's eight categories and `ui` for the shell's own screens and
loads (`LOG_CATEGORIES`), written by `logWarn` and `logError` and read by
the bug report; a line repeated counts up instead of filling the ring.
Every warning and error the game writes goes through them: the 34 bare
`console.warn` and `console.error` calls left in src were moved onto
them, the console line unchanged, and `lint:console` (CI,
scripts/console-lint.js) fails on a new one anywhere in src outside
crashrecord.js. Checks: `crashrecord:selftest`, `lint:console` (CI). What
follows is the gap as first written. No log module: 6 `console.warn`, 24
`console.error`, no categories, no timestamps. **Done:** one ring buffer
in crashrecord.js of `{ t, cat, msg }` with the checklist's categories
(input, network, physics, ai, mission, render, save, audio), written by
the existing warn and error sites, read by the bug report. No log levels,
no console spam. Check: `crashrecord:selftest` (CI). Size S. Phase 23.

**66. Bug-report contents. BUILT (phase 23).** Built (2026-10-13,
w38-save-events): the build, the aircraft id, the activity and the
controller's id from a pure function (src/share/bugs.js `reportFields`),
and item 65's log. Check: `bugs:selftest` (CI). What follows is the gap
as first written. `bugSnapshot` (ui.js 5512 to 5579)
already carries the screen, world, course, flight mode, rates, graphics,
GPU, user agent, viewport, input rates and the crash record. Missing: the
build version, the aircraft id, the activity, the controller's id, the
log of item 65. **Done:** those five fields; the snapshot builder moved to
a pure function so it can be tested. Check: `bugs:selftest` (Node, CI).
Size S. Phase 23.

**67. Build version visible. BUILT (phase 23).** Built (2026-10-13,
w38-save-events and w38-replay-v18): the build in the credits
(src/ui/credits.js), a Build row in Settings (src/ui/items.js), every
replay clip's header (clip version 18, `crashcam:selftest` case 25) and
the bug report (item 66). Checks: `boot:loader` reads the loader's line
and `bugs:selftest` the report's; no check reads the credits' or
Settings' line. What follows is the gap as first written. Shown only at
the foot of the
loading screen ("Build {version}", loading.js 480); the title shows a
beta note without it (ui.js 3855). **Done:** the build in the credits and
at the foot of Settings, and in every replay file's meta (item 24) and
bug report (item 66). Check: `lockup:check` (local) or a shell case reads
it. Size S. Phase 23.

## 16. Testing (items 68 to 71)

**68. Automated smoke tests. BUILT (phase 23).** Built (2026-10-13,
w38-save-events): `npm run smoke` (local, scripts/smoke.js) boots a
fresh profile, starts the solo drill in a private room on a rooms server
of its own, flies it to its result, reloads and finds the time flown
still in the profile, with no page error; named in DEPLOY.md. The drill
pays no stars, so a reload that finds a mission's stars stays
`campaign:check`'s. What follows is the gap as first written. `npm run
verify` (local, 16
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

**70. Device matrix. BUILT (phase 30).** Built (2026-10-13, w38-blocks):
docs/DEVICES.md, one row per real device and date the repository
records, ten rows (the Pocket over USB and Bluetooth, an Xbox pad, a
FlySky FS-i6, a Boxer, phones, a keyboard, two machines); a row is added
when someone flies one. What follows is the gap as first written.
Viewports are checked (lint:devices: 390
by 844 to 1180 by 820; modes:card: 1280 by 720 to 2560 by 1080; both
local); nothing records a real device run (operating systems, the Pocket,
a pad, a low end GPU, a high refresh display). **Done:** a table in
docs/DEVICES.md, one row per device and date, filled when someone flies
one; the owner's machines and the Pocket first. Size S. Phase 30.

**71. Frame-rate targets. PARTIAL (the number is the owner's; what it
drives is built).** Two targets are written: the
owner's 90 frames per second, which the dynamic resolution holds
(src/render/dynres.js `TARGET_HZ = 90`, perf-play.js `BUDGET_MS`), and 60
at 1080p on a five year old mid range laptop (budget.js 4, ITAIPU-PLAN.md
570). Both are in docs/BUDGETS.md. The minimum is one constant,
src/render/floor.js `FLOOR_FPS`, null and marked the owner's floor,
pending, with the measured candidates beside it; set, the shell says
once a world in flight when the 95th percentile frame of the last 600
is under it, naming the Graphics preset below (perf.floor_lower and
perf.floor_lowest, en and es), and never under the pilot's own cap
(built 2026-10-14, w43-perf; `perf:floor:selftest`). docs/BUDGETS.md,
The floor, reads every row's frame p95 at Low, Medium and High on this
box's GPU 1 against 30 and 60: 30 holds everywhere, 60 everywhere but a
full room above Low (measured on a busy card); on the Jetson AGX Orin
at Low 30 holds in three of five worlds. No reference machine is named;
the tiers name eras only (Low "Steam Deck and similar handhelds", Medium
"a 2020-era laptop with integrated graphics", High "a 2021-era PC or a
strong laptop"). **Done:** the owner's number in `FLOOR_FPS` and a named
recommended machine, written in docs/BUDGETS.md. Owner decision pending.
Size S. Phase 29.

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

**74. Local multiplayer decision. DECIDED (2026-10-14, the lead, round 7
w43-content): no split screen; local play is two devices in one Friends
room.** Written into docs/PILLARS.md section 5 with the how-to. The
evidence, from the tree and one measurement:

- *Two plants in one page already run.* The solo race's AI opponent is a
  second dist/sim.wasm on its own plant beside the pilot's
  (src/game/aiopponent.js header, `seatOpponent` from src/main.js
  `pickOpponent`), and the launch stand is the precedent. So the plant is
  not what stops split screen.
- *Input is one pilot per page.* src/input/padpick.js picks one pad as the
  pilot's (two or more plugged in open the picker, which keeps one); the
  mouse is one pointer lock on one canvas (src/main.js
  `requestPointerLock`); the keyboard is one. A second pilot on one page
  needs a second input owner through every reader of the action map
  (item 20), the HUD, the pause menus and the radio.
- *A second camera costs a second frame.* Measured on GPU 1, 2026-10-14:
  scripts/perf-play.js at High, `--mode=quality`, `swiss-low` (the 7 inch
  with its IR inset), 15 s, against a scratch copy of it (not committed)
  that draws the composer's frame a second time, as a second full view
  would. One view: frame avg 12.4 ms (p95 15.7), GPU avg 8.85 ms (floor
  6.78), 298 draw calls and 3.51 M triangles a frame. Drawn twice: frame
  avg 25.2 ms (p95 30.3), GPU avg 18.4 ms (floor 13.0), 512 calls and
  5.71 M triangles. 80 fps became 40; 592 of 596 frames missed 60 Hz.
  A split screen draws each view at half the pixels, which saves fill but
  not the draw calls and triangles, and the main view's contract is 300
  calls and 2.5 M triangles at High (docs/BUDGETS.md, 2026-10-13): two
  main views are about twice it. The IR inset is the scene drawn a
  second time already, and it is held to 480 by 270 and 110 calls for
  that reason.
- *Two devices already work.* A Friends room seats up to eight by its
  six letter code (`friends.create`, `friends.join`); the seat token is
  per tab (src/share/rooms.js, sessionStorage), so each device is its
  own pilot. LAN without the internet is possible in the tree and not
  checked end to end: the rooms server runs on any machine
  (edge/rooms/node.js) and `?rooms=http://host:port` points each page
  at it (src/share/rooms.js `roomsOrigin`), with the game served from a
  LAN machine too, since an https page may not open an http server's
  socket. No discovery, by this decision.

Revisit when a pilot asks for couch play and the budget has room for a
second main view. Checks that hold the parts: `rooms:selftest` (CI),
`rooms:twopage` (local), `perf --budgets` (local).

**75. Spectator join. BUILT (phase 17).** Built (472c2316b, then
2026-10-13 w38-watch, w38-watch-state, w38-watch-war): a watch seat in any room
(edge/rooms/core.js, `join(code, { watch: true })`), past the cap with
eight of its own, never seated and never the host; the race's, tag's,
jam's, combat's, the war's and the ops' state sent to it, no result paid
on it. Checks: `rooms:selftest`, `rooms:server` (CI), `watch:twopage`
(local). What follows is the gap as first written. A war pilot out of
airframes watches a
teammate (main.js 2784); a race's late joiner watches the race. The watch
seat in any room is decided (PLAN.md 6 item 18). **Done:** PLAN.md phase
17. Size M. Phase 17.

**76. Rematch and next mission. BUILT (2026-10-15 batch, w43-sessions and w44-warend).** Every room goes back to its
lobby after a round, nobody ready (gamelobby.js 35); a lost mission offers
its stage; the host picks the next mission in the lobby. Missing: a Next
mission action on the result, Change aircraft from the result. **Done:**
phase 10's debrief puts Again, Next mission, Change aircraft and Back to
lobby under the cursor. Size S inside phase 10. Phase 10. **Again and
Next mission built** (2026-10-15 batch, w43-sessions): the host has one
press on every end screen, and the room's start brings every pilot along
(SESSIONS.md 3, "Again and next"). Race again and Play again already led
the race's and the Ace's results; Battle again now leads the Trick
Battle's (src/main.js roomResultsRows). The war's end banner gives the
host Restart (from the lost stage after such a loss) and, after a win,
Next mission when the host may start it (the campaign's playable), over
the lobby's seconds in a room made for the war, where it used to be only
a notice (src/ui/warhud.js; src/main.js warNext moves Play's mission in
that room with it, src/ui/campaign.js follow). The ops debrief gives the
host Next mission after a win and Play again from the start beside the
checkpoint's (src/ui/debrief.js), and another pilot's debrief closes as
the new match begins. Which presses, in order, is one pure function
(src/game/debrief.js missionEndActions). Held by `debrief:selftest` (CI,
the presses), `interior:debrief` (Next mission sends the next one's
start), `interior:coop` (Play again, and the other pilot follows; its debrief
was not open there, so the closing is not yet seen by a check),
`war:twopage --main` (the banner's presses; Restart, and B follows) and
`jam:twopage` (Battle again, and B follows), the last four local.
**Next mission in the war lobby built** (2026-10-15 batch, w44-warend):
once the banner's seconds are over the host's lobby has Next mission
beside Start now after a win, one press to the next mission's briefing,
the lobby's mission moving with it (src/main.js warNextRows, warNext).
A won mission's outro plays to its end before the banner and its
seconds (src/main.js gameLobbyFrame), where the lobby used to come up
under the film with every press the film's. Held by `war:lobby`
(local: the row after a win, its press, the outro past the 8 s).
**Streamer Combat's end screen built** (2026-10-15 batch, w44-warend):
a round over in a room made for combat shows its results (standings,
this pilot's points, the debrief) with the host's Combat again under
the cursor, then the lobby as the others' (src/ui/combathud.js
combatResultsView, src/main.js combatResults); a pilot who joins a room
whose round is already over is not shown it. Held by `game:lobby
--game=combat` (local). **Change aircraft on a room's results built**
(2026-10-15 batch, w44-warend): every room game's results (the race's,
the Ace's, the Trick Battle's, combat's) have Change aircraft after the
replay, the picker seating the aircraft for the room's next round, the
war's in a war room (src/ui/items.js resultsRows, src/game/debrief.js
nextActions). Held by `debrief:selftest` (CI) and `game:lobby
--game=combat` (local). Nothing of the item is left unbuilt.

**77. Party persistence. EXISTS.** The room is the party: its code and
pilots survive rounds, mission changes and, in private rooms, world
moves (core.js 937); its host can start another Flight Club game in
passing (`minElsewhere`, `hostCheck`, core.js 479). Since 2026-10-14 the
host of a private room changes its activity between rounds (`setup
{ mode }`, host only; refused in public rooms, while a round runs, while
free flight is flying, and for the war off a war mission's world; leaving
the war drops its match). Moving into the war asks each pilot but the
host for consent; a pilot who declines stays in the lobby marked SITTING
OUT with a Join the war row, also after a reload, and is never enlisted
or waited for. Public rooms keep one activity, so the public list stays
honest. Checks: `rooms:selftest` setup section (CI), `game:lobby`
(local, tag/race/combat with the Activity case), `war:twopage`. Size M.
Phase 27.

## 18. Structure and words (items 78 to 84)

**78. Content ownership hierarchy. BUILT (phase 24, then 2026-10-14
w43-content).** The gap as first written is closed: the glossary fixes
the words (item 83, docs/SPANISH-GLOSSARY.md "The game's nouns",
`lint:nouns`) and session.js is src/share/trackseat.js, renamed in a pure
rename (PLAN.md phase 24). The owners are distinct in code: the account
(account.js; `accounts`, tracks-api/migrations/0002), the pilot (name and
key, pilot.js, identity.js), the room (rooms.js, edge/rooms), which is
also the party (item 77), the mission, the aircraft, the world, the
build. Extended by the lead's round 7 brief, 2026-10-14, beyond the item
as first written: one place says who owns each content kind,
docs/CONTENT-OWNERS.md, the shipped kinds (airframes, worlds and their
posters, tracks, missions, films, liveries, voice lines, music, strings,
tunes) each under the one registry module that lists it, and the content
a pilot makes (tracks, times, liveries, progress, builds, replays) under
the pilot key, the account or the browser. `content:owners` (CI,
scripts/content-owners.js) pairs every file in each of the 15 places with
its owner's registry: an unregistered file is an orphan, a registered id
with no file is missing, and the support modules beside content are named
with a reason; 2238 files today, none orphaned (one reference file kept on
purpose, configs/betaflight-default.diff, is named as support). It also
fails when the doc loses a row or a check the doc cites stops running in
CI, and twenty negative controls each fail. Not swept, on purpose:
textures, fonts and art under assets/ and string keys nothing reads, both
named at run time. Checks: `content:owners`, `lint:nouns`,
`trackseat:selftest` (CI).

**79. Stable IDs. EXISTS.** Every airframe, world, mission, challenge,
mode and preset has an id apart from its shown name, and shown names are
string keys: `id: 'alps'` with `name: str('registry.the_alps')`
(src/maps/registry.js 72), missions `itaipu-1` to `itaipu-4`, modes
`race`, `tag`, `combat`, `war`, `free` (modes.js 81). Two things are keyed
by a name a pilot typed, deliberately: saved liveries (hangar-paint.js
936) and board callsigns. Checks: `modes:selftest`, `war:stages`,
`hulls:check` (CI).

**80. Configuration vs code. BUILT for both campaigns' missions and the
aircraft checklist (phase 26, 2026-10-13).** Data: a track (a builder JSON
document), mission text (string keys), an activity's art and facts
(modes.js), a world's entry (registry.js). A war mission's file states
its campaign place (`act`, `order`, `key`, `free`, `release`) and
src/game/campaign.js derives `ACT1` from the registry
(src/share/war/missions/index.js) with `actOf`, which throws at load on
an order twice or missing, an impossible release, a missing key or two
free missions; a mission with no file yet is a row of `PLANNED` beside
the registry. So a new mission is a file, an import and its strings.
The Interior's list (`INTERIOR`) is derived the same way by
`opsCampaignOf` from src/share/ops/rows.js (`campaign`, `order`, `key`,
`release`, `label`), a module with no import: campaign.js reaches the
tracks Worker and the browser's settings, and the ops registry
(src/share/ops/missions.js) would carry the three mission files' worlds,
films and routes there (28 modules). The registry imports the rows and
throws at load when a mission file and its row disagree (`checkRows`).
A new aircraft is a folder (docs/AIRCRAFT-FOLDER.md),
its plant table generated into the C, a renderer in src/render. The
aircraft checklist is in scripts/airframes-check.js's header and
docs/AIRCRAFT-FOLDER.md: name, blurb, facts, size, weight, cameras,
class, roles, kit, and the description and note in English and
Spanish, each with a negative control; a renderer is held by
src/render/craft.js at load and a hull by `hulls:check`. There is no
picture field: the picker and the hangar draw the model. Checks:
`campaign:selftest` (with an import graph walk that fails if
campaign.js reaches the ops registry), `airframes:check`,
`aircraft:folder`, `war:stages` (CI).

**81. Feature flags. BUILT (phase 26).** No flags
system, decided by the author: one place to hide a row is enough. A war
mission's gate is its file's `release` (available, development, soon;
the owner's 2026-10-04 rule), an Interior mission's is its row's `release` in
src/share/ops/rows.js, both read through campaign.js `released` by the
rooms server (core.js, front.js, war.js, ops.js), the campaign lists
and the war's briefing; kept three valued rather than a `hidden` boolean, because Under
development and Coming soon are different cards. `inBuild` is gone. An
upgrade waits on an act (`later: 2`, campaign.js UPGRADES); servers can
be switched off (`?rooms=off`). **Built (w38-sessions):** a `hidden`
field on the mode registry's rows (src/share/modes.js), false on every
row today; a hidden row draws no card (src/ui/ways.js gateWays) and is
never home's Continue, and `modes:selftest` (CI) hides the race in a
registry of its own and sees Track Day's card go and no other. Asked
again on 2026-10-14 (w43-telemetry: one registry of the non-mission
flags, read at boot, with `?dev` overrides) and not built, with the
author's decision kept: the non-mission switches this item names each
have one home and a check already, the `hidden` field on the mode
registry (`modes:selftest`), an upgrade's `later` on its row (src/game/campaign.js
UPGRADES) and the rooms server's `?rooms=off` (src/share/rooms.js), and
no row is hidden today, so a second registry would be a second place to
hide the same row with nothing to switch. A `?dev` override of `hidden`
is worth its line the day a row ships hidden. Checks: `modes:selftest`,
`campaign:selftest` (CI).

**82. No silent placeholders. EXISTS.** What is not built says so and is
disabled: "Coming soon" on an unbuilt mission (`campaign.not_built`,
src/ui/campaign.js 188), "Coming in Act {n}" on a later upgrade
(`campaign.later`, 215), invented mock elements dropped rather than faked
(PLAN.md section 1, PILLARS 12 on AI fill). No TODO or FIXME in src. No
check enforces it.

**83. Consistent terminology. BUILT (phase 24).** One glossary,
docs/SPANISH-GLOSSARY.md "The game's nouns": operation, mission, stage,
activity, session, lobby, round, room, party not used, in both
languages, with where today's copy still differs (match for round,
session for a browser's visit, Spanish sesión for a run). `lint:nouns`
(CI) holds a rule per word that is gone from the copy: course (track) and
party; a word still used in the old sense gets its rule when its copy
moves. Checks: `lint:nouns`.

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

1. **More analytics (item 63).** stats.js promises three anonymous
   events. Adding which activity and how many missions start, finish and
   are abandoned changes that promise. *Recommend:* yes, as day counts
   only, no new identifier, and privacy.html updated in the same PR.
2. **Errors sent unasked (item 64).** Today an error leaves the browser
   only inside a bug report the pilot files. *Recommend:* send the error
   message, file, line and build (no screen, no name) automatically,
   counted per day like stats; privacy.html updated.
3. **Item 84**, held for discussion as the owner asked.

Decided by the author (cheap, reversible, each a line to change):
controller loss pauses solo and centres the sticks in a room (item 18,
not Betaflight's failsafe, because of standing rule 1); no developer
console, a documented hook index instead (35); no flags system, a
`hidden` field (81); signed war results deferred until an economy has a
price (62); Operations solo stays online (11); a private room may change
activity, a public one may not (77). Decided by the lead, 2026-10-14
(round 7): no split screen, local play is two devices in one Friends
room, LAN through a self hosted rooms server (74, with its measurement).
