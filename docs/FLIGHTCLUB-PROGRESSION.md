# Flight Club progression: records, medals, weekly events, the watch seat

**Status: CONTRACT** (2026-10-07, Wave 3 item 21, lane "flightclub"). Each
section below ships as its own PR, in the order given, and each PR names the
check that proves it. Owner decisions this rests on: everything syncs to the
account and the server is the truth (2026-10-05); Flight Club weekly events
pay soft currency and do expire, with no dailies, no login rewards and no
other timers (2026-10-07); a watch seat in any room (lead 2026-10-03,
confirmed 2026-10-04).

**Stale, superseded by the owner on 2026-10-07:** docs/redesign/PROGRESSION.md
rule 4 ("Nothing expires. No weekly event") and the 2026-10-03 lead line "no
expiring events" in the plan. A weekly event is the one thing that expires;
rule 4 still holds for everything else. PROGRESSION.md belongs to the
progression lane and is left for it to amend.

## What exists and is built on

| Piece | Where | Today |
| --- | --- | --- |
| Lap records | src/game/race.js `loadRecord`, main.js `recordKey` | Best lap per course, aircraft, pack voltage and gravity, in localStorage under `webfpv.best.*`. Not synced: a second computer starts with no records. |
| Board times and ghosts | src/share/board.js, the board repo | Every posted lap, signed by the pilot key, with its ghost. |
| Progress and sync | src/game/progress.js, src/share/progressmerge.js, tracks-api/accounts.js | XP, flags; merged on the server by section kind. |
| Course documents | src/trackbuilder/schema.md | Top level keys outside the layout hash do not clear a course's times (board src/validate.js `layoutHash`). |
| Spectating | src/share/roomrace.js `'spectating'`, main.js `warWatchSeat` / `watchCamera` | A race's late joiner watches; a war pilot out of airframes follows a teammate. Both take a flying seat. |

## 1. Records that follow the account

**The player sees** the same best laps on every computer they sign in on;
the "new track record" line fires only on a lap better than the account's
best.

**Data.** A new synced section `records`, kind `best`:
`{ [recordKey]: lapMs }`, the key exactly as main.js `recordKey` builds it
(`webfpv.best.<course hash>.<volts>[.arcade].<airframe>[.g<n>]`), the value a
whole number of ms, 1 to 3,600,000. Merge: per key the LOWER lap wins; a key
on one side only is kept; stamps play no part. At most 1000 keys (about
55 kB of the 512 kB blob): past that a merge keeps the first 1000 key names
in sorted order, so every side drops the same ones.

**Storage and migration.** race.js keeps localStorage as its working store
and is unchanged. src/share/records.js reads every `webfpv.best.*` key into
the synced view at each sync and writes back only laps better than the
local one. Sending them all every time is also the migration: records from
before go up with the first sync, no marker needed.

**Does not:** post anything to the board, change what a lap pays, or rank
the pilot against anyone.

**Check:** `records:selftest` (seeded old keys go up; lower wins; one side
kept; malformed dropped; cap; write back only better; idempotent) and
`account:browser` (a lap set on one computer arrives on the second).

## 2. Medals on built courses

**The player sees** bronze, silver and gold times on a built course's card
and in its lobby, the medal their best lap reached on the result line, and
their medals on the course cards. A medal is reached once and kept.

**Data.** In the course document, top level, outside the layout hash:
`medals: { goldMs }`, a whole number of ms. Silver is `goldMs * 1.15` and
bronze `goldMs * 1.35`, rounded up to the ms, computed where read (one
number, so the three can never disagree). The builder sets `goldMs` from
the builder's own best lap on the course, never from other pilots' times,
so medals never move once published. A course without `medals` shows none.
In progress: `medals: { [courseKey]: 'bronze' | 'silver' | 'gold' }`,
merged as the better of the two.

**XP:** a medal's first award pays XP once per medal step (amount owned by
the progression lane, item 17). Map courses with no builder get medals in a
follow up, once each has a gold set by a flown lap.

**Board:** no schema change; the board shows the three times on a course's
page if `medals.goldMs` is present (board PR, needs a board deploy).

**Check:** `progress:selftest` (better medal wins, same medal twice pays
once), `edit:selftest` (the builder writes `goldMs` from its best and the
layout hash is unchanged by it), board `npm test` (validate keeps `medals`).

## 3. The watch seat

**The player sees** a Watch button beside Join on a room in Flight Club's
Join a session strip and in a room's lobby. Watching, they have no aircraft,
take no flying seat and are not counted against the room's cap; the camera
follows a pilot (J cycles, as in a replay); Leave exits. A watcher can take a
flying seat between rounds if one is free.

**Data / wire.** The hello carries `watch: true`; the rooms server seats the
session as a watcher, kept in its own list apart from the pilots' seats:
never sent a start slot, never counted by the cap, the host or "everyone
ready", and never announced to the pilots (lead, 2026-10-07: watchers do
not show in the pilot list). Everything a watcher sends but clock pings is
dropped. Watchers are capped separately (8 a room). J or [ ] cycles the
pilot followed. Built in #717.

**Does not:** chat moderation changes, voice for watchers (a follow up if
asked), a watcher list for the public.

**Check:** `rooms:server` (a watcher does not count against the cap, is not
in ready, gets peers' poses, cannot send a pose), `game:lobby` (Watch
reached with a real pointer, camera follows, Leave exits), `flow:check`.

## 4. Weekly events

**The player sees** one card at the top of Flight Club: this week's course,
its end (date and time in the pilot's zone, the only countdown in the game),
their best lap in the window, their standing, and the payout table. Flying
it is ordinary Track Day on that course: laps post to the board as today.

**Rules.** A week is Monday 00:00 UTC to the next Monday 00:00 UTC. The
board picks the week's course the first time anyone asks in that week, by a
deterministic rotation over published raceable courses that carry
`medals.goldMs` (sorted by id, index by week number), and stores the pick so
a course deleted or added mid-week changes nothing. Standings are each pilot
key's best lap on that course posted inside the window, on the board the
medals were set on (quads, or the plane board when `medals.wing`). Laps
posted after Monday 00:00 UTC are not in that week: this is how an event
expires.

**Tiers, final when posted.** What a pilot earns is a tier, never a
placing: `finish` for any lap in the window, then `bronze`, `silver` or
`gold` by that lap against the event's gold (stored with the pick). A tier
is absolute, so it is final the moment the lap is posted, and there is no
week-close freeze and no top-three prize (the shape the progression lane
set in docs/ECONOMY.md section 3, superseding this section's first draft).

**Board data** (fdfpv-leaderboard #37). `events (id, week UNIQUE, track_id,
name, map, gold_ms, wing, starts_utc, ends_utc)`, written by the week's
first read; no foreign key, so a removed course leaves its week. Routes:
`GET /api/events/current` (the event and its standings: name, lapMs, medal;
no pilot keys) and `GET /api/events/tiers?key=` (the tier that pilot key
reached in each of the last 8 events). The event id is
`<yyyy>-w<nn>-<trackId>`.

**Payout** (#728). tracks-api/eventpay.js asks the board's tiers route with
the account's pilot key whenever the wallet is read or progress syncs, and
pays each through wallet.js `grantEvent`: finish 20, bronze 40, silver 60,
gold 100 tokens, a higher tier paying the lower ones too, each once per
event per account. A board that does not answer pays nothing then and
everything on a later read. Nothing for logging in, nothing for a second
lap. The lead chose (2026-10-07) a rotating track with no admin pick.

**Check:** board `events:check` (ISO week edges, rotation, window both
sides, one row per pilot at best, plane laps off a quad event, tiers, no
keys served, the pick outlives its course), tracks-api accounts selftest
(asked with the account's key, paid once, a dead board pays nothing), and
`weekly:check` (the hub card with a real pointer, seating the track).

## Not in this lane

Dailies, streaks, login rewards, any timer besides a weekly event's end;
ranks; the wallet and the shop (item 25); map course medal times; AI
pilots (item 20).
