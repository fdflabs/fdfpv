# Flow audit: rooms, worlds, games and the campaign

Written 2026-10-01 against `main` at 8ecb6fe8 (after #279). A design audit,
not a change: nothing in `src/` or `edge/` was touched to write it.

The owner, 2026-10-01: "there seems to be a specific order in which i need
to do things to avoid being in the wrong room...this all needs to be
simplified very much so that there are no wrong ends...room selection, world
selection, permanence, etc. needs to be all very seamless".

The short answer is that "where am I" is held in eight places that nothing
keeps in step, and each fix of the last two days (#267, #269, #271, #273,
#275) added one more rule about when to read or clear one of them. Section 5
proposes one model with ten rules that removes most of those places instead
of patching them.

Evidence marked **[R]** was reproduced headless against a local rooms server
(section 8 says how); **[C]** is read from the code, with the line.

## 1. The eight places that say where the pilot is

| # | What | Where it lives | Who writes it | Survives a reload |
|---|------|----------------|---------------|-------------------|
| 1 | The screen | `ui.screen` (`src/ui/ui.js`) | every `show()` | no, boot lands on `title` |
| 2 | The answered card | `ui.mode` (race, freestyle, null on the gate) | `act(way-*)`, `mode-gate`, `back()` from the menu | no |
| 3 | The game a card asked for | `ui.roomGame` (combat, tag, war, null) | `act(way-*)` only, ui.js 13100; never cleared on leaving | no |
| 4 | The seat's world | `settings.map`, `settings.freestyleMap` (localStorage `webfpv.settings.v3`) | `seatMap`, `roomSeat`, `warEnter`, the World rows | yes |
| 5 | The world on screen | `view.id` (the built world), read as Make a room's default (`here`, main.js 2226) | `syncWorld` | no |
| 6 | The room | `roomLinkState` phase and code; sessionStorage `fdfpv.room`, `fdfpv.roomToken`; the `?room=` query | `join`, `leave`, `create` (`src/share/rooms.js`) | yes, and `?room=` wins over a Leave |
| 7 | The room's own setup | server `meta.map`, `meta.mode` (race, tag, combat, never war), the running game, the war match | `POST /v2/create`, host `world`, host game starts (`edge/rooms/core.js`) | yes, server side |
| 8 | The campaign mission | `pending { mission, from, code }` in `src/ui/campaign.js` 94 | Play (`play1`, 281), adopted by `bind` (336) | no |

Three of these disagree routinely: 3 against 7 (a card's game against the
room's mode), 4 against 5 against 7 (three ideas of the world), and 6
against 1 (a room the screen does not show).

## 2. States

| State | How it is recognised | Ways out |
|-------|----------------------|----------|
| Gate (title, no card) | `screen === 'title' && mode === null` | a card, the rooms panel, Escape stops here |
| Title menu | `screen === 'title' && mode !== null` | Fly, Fly with friends, the World row, Back to the gate (`mode-gate`) |
| My tracks | `screen === 'courses'` | Play a track, Back |
| Free flight | `mode === 'freestyle'`, flying, no room | pause |
| Room screen, out of a room | `screen === 'friends'`, phase idle or failed | Rooms, Make a room, Join with a code, Back (title) |
| Room screen, in a room | `screen === 'friends'`, phase open | Fly, a game's start row, Leave, Back (**leaves**, see D5) |
| Rooms lobby | `screen === 'rooms'` | join a listed room, quick join, Make a room, Join with a code, Leave (when in one), Back to the room screen |
| Make a room | `screen === 'roomnew'` | Make (public or private, a world, a game), Back to Rooms |
| Campaign screen | `campaign.page() !== null`, drawn on `ui.nameDialog` over whatever screen | Play (missions), Shop, Back |
| War consent | `askConfirm` from `warConsented` (main.js 2675), once per profile | Continue (sets `settings.warConsent`), Back |
| Flying in a room | `mode === 'flight'` and phase open | pause, a game's go, a summon |
| Paused | `screen === 'paused'` | Resume, Restart, Fly with friends, Back to title (**leaves**) |
| Results (race, tag) | `screen === 'results'` | Again (host), Fly on, Fly with friends, Back to title (**leaves**), Escape (**leaves**, back() 12783) |
| War end banner | on the flight screen, `warHud` (main.js 2480) | Restart (host only; others see "waiting"), pause |
| Silently in a room on the title | after a reload: phase open, `screen === 'title'` | any card (see D2, D3), Fly with friends |

A room's game states, from the server: none; race `on` then `results`; tag
on then results; combat `idle`, `countdown`, `on`, `over`; war `lobby`,
`briefing`, `countdown`, `live`, `won`, `lost`, `ended`. The server lets one
run at a time (`hostCheck`, core.js 385; `war.start`, war.js 717 refuses
`busy`), and a war only in a private room on the war's own map (`map`).

## 3. Transitions, with the code that does each

**Title and cards**

1. Gate card, solo (Track mode, Free Flight): `pickForWay` (ui.js 13580) opens the aircraft carousel, then `act(way-*)` (13071): seats the aircraft, sets `mode`, sets `roomGame` to null. Track mode shows My tracks. Free flight seats `way.home` **only when no freestyle world is seated** (13122, 13145); otherwise the remembered world stays (D4).
2. Gate card, room (Fly with friends, Toilet paper combat, Catch the Ace): `pickForWay` goes straight to `act(way-*)`: sets `roomGame` to the card's game, calls `onGameCard` (main.js 4480), which leaves a room only when one is open **and running a different game**, then shows the room screen.
3. Gate card, Defend the Paraná: `onCampaignCard` (main.js 4442) opens the campaign screen. It is the only way to it (D1).
4. Defend Itaipu card: off the gate since #273, but the entry stays as `way-war`, used by campaign Play.
5. Rooms panel on the gate (`roombrowser.titleItems`, 346): `lobby:` actions run `act('way-friends')` then the action (ui.js 13197), so they also reset `roomGame` to null and may seat Swiss valley.
6. Escape on the gate stops; Escape on the menu goes back to the gate (`back()`, 12740); neither leaves a room.

**Rooms**

7. Make a room (`make`, roombrowser.js 296): `POST /v2/create` with the draft's world (default `here()`, the world on screen), public or private, a game from `ROOM_MODES` (race, tag, combat); then `join`. With game War (private and Itaipu only), it calls `warEnter` instead.
8. Join a listed room or quick join (`act`, roombrowser.js 406): `link.join(code)` or `joinPublic(world)`.
9. Join with a code (`onFriends` `friends-join`, main.js 4532).
10. Leave (`friends-leave`, main.js 4549; `roomLeave` 4445): socket closed, `fdfpv.room` and the token removed. `?room=` is **not** removed (D3).
11. Welcome (`onWelcome` main.js 2063, `roomSessionWelcome` 3471): the room's world is seated, no flight (`roomCall('join')`).
12. Drift (`roomDrift`, 3488): a non host, or any pilot of a public room, who seats another world is put back; a host's other world is sent to the room as its world (refused while a game runs).
13. `ui.seatMap` wrapper (main.js 3643): the same rule, applied at the picker.

**Leaving by side effect**

14. `act('title')` from any row or from `back()` calls `onTitle` (ui.js 13550, main.js 4462), which leaves the room. Reached by: Back on the room screen, Back to title in pause and results, Escape on results.
15. `act('mytracks')` (ui.js 13531) goes through the title **without** `onTitle`: the room stays.
16. `onGameCard` (main.js 4480): leaves when the card's game differs from the one running.

**The war and the campaign**

17. Campaign Play (`play1`, campaign.js 281): closes the screen, sets `pending = { mission, from: room code now, code: null }`, then `ui.onWarCard('way-war')` (main.js 2730) then `warEnter` (2710): consent, a **new** private Itaipu room every time, seat Itaipu, `act('way-war')`, join.
18. `bind` (campaign.js 336), every 250 ms: the first open room whose code differs from `from` becomes the mission's room; any other room forgets the mission.
19. Start row (`friends-war-start`, main.js 4488): `campaign.startSelected()` sends the pending mission with the loadout if this is the bound room; otherwise `warStart` (2692) asks consent and starts `itaipu-1`, always mission 1.
20. Restart on the war end banner (main.js 2480): host only, `roomWar.start(v.mission)`, same mission, no intro.
21. Reload (`roomFrame` autojoin, main.js 3329; `wantedRoom`, rooms.js 135): `?room=` else `fdfpv.room` is rejoined; the page boots on the gate; `pending` is gone.

## 4. Dead ends, wrong ends and order dependence

Ordered by how often the owner will meet them.

**D1. The next mission throws the room away, and the friends in it. [R]**
The campaign screen opens only from the title card, the title leaves the
room (14), and Play always makes a new room (17). So mission 1 then mission
2 is: title (leave), campaign, Play, a new private room with a new code.
Probe T2: host in room `9LGKZM` with a friend; title; Play mission 2;
host now in `CL2TJ9`. The friend's socket was still open in `9LGKZM` and
heard `leave` then `host` (made host of an empty war room). Co-op through
the campaign is impossible without reading out a new code each mission.

**D2. A reload drops the pilot on the gate, silently still in the room. [R]**
Probe T3: in `CL2TJ9`, reload: `screen: title, gate: true, phase: open,
code: CL2TJ9`; the title's rooms panel read "No open rooms yet. Make one and
anybody can join." (the room you are in is filtered out, roombrowser.js
`openRooms`), and the room bar is null on the title (main.js 3673). Nothing
says you are in a room. Everything after this is order dependent:

- Free Flight card (T4): still in `CL2TJ9`, `map: itaipu`, though the card says "The Swiss valley". You free fly inside the war room.
- Fly with friends card (T5): the room screen of the war room, `roomGame` reset to null.
- Any `act('title')` (Back, Back to title) now leaves, so the same press that did nothing visible before the reload does something different after it.

**D3. Leave does not survive a reload when you came by a link. [R]**
Probe T7: opened `?room=4746HX`, pressed Leave (`phase: idle`), reloaded:
`phase: open, code: 4746HX`, and `location.search` still
`?...&room=4746HX`. `wantedRoom` reads the query before the session key and
nothing strips it.

**D4. The card's world is not the world you get. [R], [C]**
Free flight cards seat their `home` only when no freestyle world is seated
(ui.js 13122, 13145). After any war, `settings.map` is `itaipu`, so Free Flight,
Fly with friends, combat and Ace all open on Itaipu (T4). Make a room's
default world is a third source again: `here()` is the built world on
screen (main.js 2226), which is why T9 showed Swiss valley there while the
seat said Itaipu. Three answers to "which world" on one screen.

**D5. Back on the room screen leaves the room. [R]**
Probe T6: in a room, `act('back')`: `screen: title, phase: idle`. Back from
Rooms keeps the room, Back from the room screen leaves it, Back to My
tracks from results keeps it (15), Escape on race results leaves it. The
lobby has an explicit Leave, so the same act has two buttons, one labelled
and one not.

**D6. The war's consent can be skipped, and a declined Play haunts the next room. [R]**
Probe T1: fresh profile, campaign Play mission 2, consent answered Back:
`pending = { mission: itaipu-2, from: null, code: null }` stays. Then Fly
with friends, Make a room, private, Itaipu, no game: `bind` adopted it
(`pending.code === CDZH9J`), and its start row sent `{ op: start,
mission: itaipu-2 }`; the room went to `briefing` with `warConsent` still
false. `startSelected` (campaign.js 291) never asks `warConsented`; only
`warStart` does. That is a section 9 gate (docs/WARFARE-PLAN.md) bypassed,
and mission 2 started from a room the pilot made by hand.

**D7. A reload in a mission room forgets the mission. [R]**
Probe R1 and R2: Play mission 2, start row "Start mission 2"; reload, Fly
with friends: the same room, start row "Start mission 1", and pressing it
sent `{ op: start, mission: itaipu-1, intro: true }` with no loadout. The
mission lives only in page memory (`pending`).

**D8. The card says one game, the room screen another. [R]**
Probe T8: a public room made for combat; reload; Catch the Ace card:
`roomGame: tag`, but the room screen's heading "Game: this room is set up
for Toilet paper combat" and combat's start row is the primary.
`friendsRows` (main.js 4325) prefers `welcome.mode` over the card, and
`onGameCard` stays because nothing is running. Same root as #269, which
only handled the case where the other game was already running.

**D9. A game card abandons the room's other pilots. [C]**
`onGameCard` (main.js 4480) leaves a room running another game; since #275
the title does too. Neither asks, and neither tells the others why the host
vanished (the room hands host to the next pilot). Correct for one pilot,
wrong for a host with friends.

**D10. The game a card picked outlives the room. [C]**
`ui.roomGame` is set by every card and cleared by none of the leaving
paths; it is sent in the profile as `game`, and a joiner's room screen leads
with the host's profile game when the room has no `mode` (main.js
`hostPeer.profile.game`). T2b shows `roomGame: war` on the title menu after
leaving. `friendsRows` already carries a comment about this outliving the
room and works around it for the war only.

**D11. Missions 2 to 4 have one door. [C]**
A room's start row starts the bound mission or `itaipu-1`; Make a room's
Game row offers "Defend Itaipu", which is always mission 1. The end banner
offers Restart only, never Next. So the only way to mission N is title,
campaign, Play, which is D1.

**D12. Make a room's War is a different flow from its other games. [C]**
War is not in `ROOM_MODES`, so a room "for the war" is a plain private
room whose heading comes from `ui.roomGame` (D10) and, for joiners, from
the host's profile; the server never knows.

Not reproduced: the "mission 2 HUD with no wave line" bug is another
agent's; I did not chase it.

## 5. The proposed model

Ten rules. Each one replaces a set of special cases rather than adding one.

1. **A room is set up for one thing: a game (race, tag, combat, war) or free flight, and one world.** The server holds both, and for the war the mission. The page never keeps its own copy.
2. **The world follows the setup.** The war is Itaipu. Every other setup has the world chosen when the room is made, defaulting to the card's own world. A card always seats the world it names. There is one "where": the seat, which in a room is the room's world.
3. **The title is never in a room.** Being on the title means not being in one, without exception.
4. **Inside a room, the room screen is home.** Back and Escape stop there; they never leave. Everything about the room (Fly, the game's start, the mission list, Leave) is on it or one press below it.
5. **One way out: Leave.** It is on the room screen, the lobby and the pause menu, it goes to the title, and it is the only thing that leaves a room, apart from closing the tab.
6. **A reload puts you back exactly where you were:** the same room, on its room screen (or in the air if its game is live), with the same setup and mission, because the server holds them.
7. **A card or a mission Play from the title always makes a new room set up for exactly that.** The title is out of a room (rule 3), so there is never a current room to reuse or leave by accident.
8. **Inside a room, its host changes the setup there, and everyone stays.** The next mission, Restart, another game: the host picks it on the room screen, the running game ends first (with one confirm if others are mid game), and the room's pilots follow. Nobody is moved to a new room.
9. **The war's consent is asked once, at the one place a room is set up for the war.** Every start after that is inside a war room, so it is already answered.
10. **A link is used once.** `?room=` is joined, then removed from the address, so Leave then reload stays left.

### What changes for each existing path

| Path today | Under the model |
|------------|-----------------|
| Free Flight card, after a war (D4) | seats Swiss valley, its card's world; the World row still changes it |
| Fly with friends / combat / Ace card | always out of a room (rule 3), so: the room screen out of a room, Make a room first with that setup and the card's world |
| Defend the Paraná card, Play | consent if not given, then a new private Itaipu room set up for the war and that mission (rule 7, 9) |
| Next mission (D1, D11) | the room screen of a war room lists the four missions for the host; picking one sets the room's mission, everyone stays (rule 8). The end banner gets Next mission beside Restart |
| Reload (D2, D7) | lands on the room screen of the same room, start row naming the room's mission |
| Back / Escape in a room (D5) | stops on the room screen |
| Back to title in pause and results | becomes "Leave room" when in a room (rule 5) |
| A link (D3) | joined, then stripped |
| Make a room with Game: War | the same as any other game: `mode: war`, private only, world fixed to Itaipu, mission 1 unless picked |
| Title rooms panel | out of a room only (rule 3), so it never needs a "here" row; the lobby keeps its own |

### What is deleted

- `ui.onGameCard` and its rule (main.js 4480): a card is never pressed in a room.
- `ui.onTitle` leaving by side effect (main.js 4462), and the `mytracks` exception to it: the title is reached only by Leave.
- `campaign.js` `pending`, `bind`, `selectedNumber`'s fallback: the mission is the room's.
- `ui.roomGame` as state, and the profile's `game` field as the source of a room's heading: the heading is `welcome.mode`. The `wanted === 'war' && !warFits(w)` workaround goes with it.
- `warEnter`'s second path through `act('way-war')`, and the `way-war` entry kept only for it (ui.js 3156).
- The `warStart` versus `startSelected` split: one start row, the room's game and mission.
- `here()` as the built world for Make a room: the seat is the world.
- `hereRows` in the lobby stays (it is how you see the room from the lobby), but the title panel needs no counterpart.

### Published contracts this touches

- **Wire, rooms protocol (`src/share/roomwire.js`, `edge/rooms/`).** `ROOM_MODES` gains `war` (private only, server enforced, as `hostCheck` already refuses a public war). The welcome and the lobby list carry it. The room's war mission becomes room state: a new field in the welcome and a host message to set it (or the existing `war start` message's `mission` kept as the room's after the war ends). The server ships first; an older page that does not know `mode: war` reads it as no game, which is today's behaviour, so no `PROTO` bump is needed. If the host's "change the setup" message (rule 8) is added, it is a new message type; an old server passes over a type it does not know (core.js `message` returns nothing for it), so the button would silently do nothing there: ship the server first and show the button only when the welcome says the room takes it.
- **Profile field `game`.** Today peers read it. Keep sending it for one release after the heading stops reading it, then drop it.
- **URL `?room=`.** Still accepted; it is removed from the address after the join. Shared links keep working.
- **Storage keys.** `fdfpv.room`, `fdfpv.roomToken` (sessionStorage) and `webfpv.settings.v3` keep their names and shapes. `settings.freestyleMap` keeps being written; the card's world just wins over it at the card.
- **The war's consent (`settings.warConsent`).** Unchanged as a key; D6 is a bug against it, not a change to it.

## 6. Build order

Small PRs, each green on its own, each with the check that proves it. The
first three are bug fixes that stand whether or not the model is approved.

1. **Ask the war's consent before every war start, and drop a Play whose room never opened.** `startSelected` goes through `warConsented`; `pending` is cleared when the consent is declined or `warEnter` throws. Check: extend `scripts/campaign-check.js`: decline consent on Play, make a private Itaipu room by hand: the start row says Start mission 1 and pressing it asks consent (D6 today: starts mission 2, no question).
2. **Use a `?room=` link once.** After the welcome, `history.replaceState` drops `room` from the address. Check: a headless step: open `?room=CODE`, Leave, reload: `phase: idle` (D3 today: rejoined).
3. **A reload lands on the room screen of the room it rejoined.** Check: in `scripts/mode-cards-check.js` or a new `scripts/flow-check.js`: make a room, reload: `screen: friends`, the room's code on it (D2 today: the gate, nothing shown).
4. **The title is never in a room.** Back and Escape stop at the room screen; Back to title becomes Leave room in a room; delete `onTitle`'s leave, `onGameCard`, the `mytracks` exception. Check: flow-check: Back and Escape from every room screen keep `phase: open`; Leave is the one path to `idle`; then every card from the title starts with `phase: idle` (D5, D8, D9 gone by construction). Run `war-card-check.js` and `mode-cards-check.js` too, since both drive these paths.
5. **The card's world wins.** `act(way-*)` seats `way.home` when the card has one; Make a room defaults to the seat, not `view.id`. Check: flow-check: a war, Leave, Free Flight card: `settings.map === 'swiss2'` (D4 today: itaipu).
6. **The war is a room mode, and the mission is room state** (server first, then client). `ROOM_MODES` gains `war` (private only); the server keeps the war's mission between wars; the welcome carries both. Delete `ui.roomGame` as the heading's source, `pending`, `bind`, `warStart`. Check: `scripts/rooms-server-check.js` (a public `mode: war` refused, a private one listed as war), `campaign-check.js` (Play mission 2, reload: still Start mission 2: D7 today: mission 1), `war-card-check.js`.
7. **The host picks the next mission in the room.** The war room's screen lists Act 1's missions for its host; the end banner gets Next mission. Check: campaign-check with a second page or a node socket as the friend: mission 1 then mission 2, same room code, the friend still in it and in the briefing (D1 today: new room, friend left behind).
8. **Optional, only if wanted: the host changes the room's game in place** (rule 8 beyond the war). A host message `setup { mode }`, refused while others are mid game unless confirmed. Check: rooms-server-check plus flow-check: a combat room switched to Ace keeps its code and pilots.

PRs 1 to 5 are client only. PR 6 is the one contract change and should
land as two PRs, server then client, with the server deployed between them.

## 7. What I did not settle

- Rule 2 overrides the remembered free flight world at the card. The comment at ui.js 13122 chose the remembered world on purpose ("So the Map row names the place you were last in"). The owner should say which wins; the model only needs it to be one.
- Rule 4 means a paused flight's "Back to title" is gone in a room: Leave is the exit. If the owner wants the title reachable while keeping the room, rule 3 has to go, and then D2 comes back in a different shape. The model is built on rule 3; I would not drop it.
- Public rooms: rule 8's "host changes the setup" applies to them too since #271 gave them a host; the war stays private (server enforced).

## 8. How the evidence was taken

A throwaway probe (not committed; it lives in the session's scratchpad)
drives the real shell through `tests/lib/page.js` against
`ROOMS_DB=<tmp> PORT=8893 node edge/rooms/node.js`, the friend in D1 is a
Node `WebSocket` sending the same `hello` as the page (`PROTO`,
`ROOM_LEVEL`). Actions are `window.__ui.act(...)`, the same function the
keys, pad and mouse call; reloads are CDP `Page.reload`. State was read
from `window.__ui`, `window.__rooms()`, `window.__campaign.pending()` and
`window.__war()`. One headless browser, two runs (T1 to T9, then R1 to R3),
no page errors in the first; the second logged one aborted dynamic import
from the reload itself. The rooms server was stopped at the end of each run
and its port checked free.

Probe output, abridged to the fields cited:

```
T1a  Play mission 2, consent Back      pending {itaipu-2, from null, code null}, warConsent false
T1b  hand made private Itaipu room     code CDZH9J, pending.code CDZH9J
T1c  its start row                     sent {war start, mission itaipu-2, intro}, war briefing itaipu-2, warConsent false
T2a  mission 1 room, friend in         code 9LGKZM, peers 1
T2b  title (only way to the campaign)  phase idle, roomGame war
T2c  Play mission 2                    code CL2TJ9, friend still in 9LGKZM, heard welcome, leave, race, host
T3   reload                            screen title, gate true, phase open CL2TJ9, panel "No open rooms yet", room bar null
T4   Free Flight card                  phase open CL2TJ9, map itaipu
T5   Fly with friends card             screen friends, in CL2TJ9 (the war room), roomGame null
T6   Back on the room screen           screen title, phase idle
T8a  public room made for combat       2LHG7T, heading "set up for Toilet paper combat"
T8b  reload, Catch the Ace card        roomGame tag, heading still combat, combat start primary
T7a  ?room=4746HX                      phase open 4746HX
T7b  Leave                             phase idle
T7c  reload                            phase open 4746HX, search still has room=4746HX
R1   Play mission 2                    JB3PVB, row "Start mission 2"
R2   reload, Fly with friends          JB3PVB, row "Start mission 1", pending null
R3   its start row                     sent {war start, mission itaipu-1, intro}, no loadout
```
