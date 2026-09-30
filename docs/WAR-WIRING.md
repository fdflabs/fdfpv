# The war client in src/main.js: what it calls, and where

Defend Itaipu's client half is three modules (docs/WARFARE-PLAN.md
section 5.2): `src/share/roomwar.js` keeps what the room said,
`src/render/attackers.js` draws the attackers, and `src/ui/warhud.js`,
`src/ui/warmarkers.js` and `src/render/warradio.js` tell the pilot. This is
every call `src/main.js` makes into them, by the function it sits in, since
line numbers drift. The block comment at `DEFEND ITAIPU` in main.js is the
short form.

`scripts/war-twopage-wire.js` is a second wiring, with no plant, for the two
page check's default mode; `npm run war:twopage -- --main` runs the same
check against main.js's wiring instead.

There is no radio signal in the war. The owner took the signal, the relays
and the jammers out on 2026-09-29 (#227, plan section 6.1): main.js never
calls `sim_rx_signal`, the war flies on the pilot's own link preset exactly
as outside one, and `src/game/signal.js` is not imported. The radio's
signal, relay and jammer lines are never said; their audio stays.

## 1. Construction

- `createRoomWar(send)` as `roomWar`, beside `roomTag`, before
  `createRoomLink`, whose handlers close over it.
- At `DEFEND ITAIPU`: `createWarHud(roomSeatName)` as `warHud`,
  `createWarMarkers(shell.camera, shell.renderer.domElement)` as
  `warMarkers`, `createWarCalls()` as `warCalls`, and the constants
  `WAR_MISSION` ('itaipu-1'), `WAR_MAP` ('itaipu'), `WAR_STATES` and
  `WAR_FIRE_MS`.
- After `createDebris()`: `createAttackers({ debris, floorAt })` as
  `warAttackers`, added to the scene once a frame by `roomWarFrame`.
- Crest Control's voice and the war's music are `audio.war()` (a
  `WarRadio`, made on first use) and `audio.setWarBed(track)`
  (`'intro'`, `'combat'`, or `''` for the flight music again), in
  src/render/audio.js.

## 2. The room link's handlers (`createRoomLink({ ... })`)

- `onWelcome`: `roomWar.onWelcome(w)` after tag's. The welcome carries the
  war's view, and a pilot seated mid game gets every live attacker as a
  `born` right after it (edge/rooms/war.js `join`).
- `onMessage`: chained after race's and tag's, so a war message refreshes
  the room screen.
- `onBinary`: `roomWar.onBinary(bytes)` first, before combat's. It takes
  AGENTS (0xA0, the hunters' poses) and HUNTS (0xA1, each hunter's target
  seat; src/share/roomwire.js).
- `onState`, when the link goes idle or fails: `roomWar.clear()` and
  `warLeave()` (the attackers cleared, the HUD and markers hidden, and
  `warFinish()` if a war had begun here).

## 3. The frame: `roomWarFrame(now, wallMs, dt)`

Called from `roomFrame` after tag's, at the room clock `now`, so it stops
while the link is not open. In order:

1. `warAttackers.group` into the scene; hidden in the crash cam's replay.
2. `roomWar.on()` changed: `warBegin(view)` or `warFinish()` (section 4).
   This is on the view, not on a `state` event, because a pilot seated
   while a war is live gets its view in the welcome and no event.
3. `roomWar.takeEvents()`, each logged in `warLog` (for `window.__war`):
   a hit target set burning (`warBurn`), the combat music on at `live`,
   and outside a replay `warAttackers.dead(ev)` and `warAttackers.boom(p)`,
   with `warBoomMine()` on this pilot's own warhead. In a replay the
   events are taken and logged but nothing is applied, so none lands late
   on the flight after it.
4. `warTargetsFrame`: a burning target turns to smoke after `WAR_FIRE_MS`.
5. `warHud.events(events)` and `warSay(warCalls.events(events, view))`:
   the HUD's callouts and the radio's lines.
6. `warAttackers.update(roomWar.attackersAt(now), dt)`.
7. `warMarkers.update(live, now, events, mission, x, y, z, seat)`, with
   this aircraft's position and seat, or a spectator's watched teammate's
   (section 6). It returns true when a Hunter has newly picked this pilot
   (by the room's HUNTS target, or from the hunter's heading when the room
   sends none), and main.js then says the radio's `wave-hunter` line
   unless it is already on the air or queued; never for a spectator.
8. Four times a second, `warHud.update(view, seat, now, output)`, null off
   the flight screen.

## 4. A war begins and ends

- `warBegin(view)`: the radio's calls reset, the targets whole and then
  the ones already down set smoking, the music on (`'intro'` in the
  countdown, else `'combat'`), `warCrashDue` set, and the pilot put in the
  air: `ui.onAction('restart')` if flying on the room's world, else the
  room's own `roomCall('game', { restart: true })`.
- `warFinish()`: the targets whole, `warCrashDue` set, the music off. The
  last radio line is left to finish.
- Crash damage: `applyCrashMode(s)` wants damage on while `roomWar.on()`,
  whatever `s.crashDamage` says, and never writes the setting, so it is
  the pilot's own again after. `damage.setMode` clears the crash state, so
  it is applied between runs only: `resetCraft` applies it when
  `warCrashDue` is set.

## 5. The warhead: `warBoomMine()`

On a `boom` event with `mine: true`, while flying: `sim_part_break(i)` on
every part but the root (part 0 is refused). A refusal throws, since the
war forces damage on and so it cannot be off. The frame after goes through
the wreck check; the room counts the boom's rack slot and nothing more for
the wreck that follows (war.js, "A DEFENDER THAT WENT OFF").

## 6. The rack empty: spectating

Plan section 4.5: a pilot whose craft is a wreck while the war is live and
the rack is at 0 has no airframe, and spectates. `warSpectating()` says
so; the room loses the game on an empty rack only while attackers live
(war.js `settle`), so this is the gap after a warhead took a wave's last
attacker with the last airframe.

- `warWatch(step)` picks the teammate to follow: the peers drawn in the
  air here (`drawnPose` set, the newest pose not crashed), in seat order,
  keeping the one followed while it flies. `[` and `]` step through them
  (`WAR_WATCH_KEYS`, checked in `input.onKey` before `ui.handleKey`,
  which otherwise takes them for the aircraft swap); `R`, `X` and `Tab`
  do nothing, and the pause menu's restart is refused in `ui.onAction`.
- The camera chain's `watching` branch puts the camera behind the
  teammate along the way it travels, from the chase camera's smoothed
  vectors; a new teammate snaps.
- The HUD and the markers stay up; the markers measure from the watched
  teammate and frame a Hunter on it. The banner says who is watched
  (`war.watch`), or that nobody is in the air (`war.watch_none`).
- A rack above 0 again, or the war over, and it stops: `R` flies.

## 7. The host's menu

main.js's own, beside `combatRows` and `roomTagRows`: `warRows(host, w)`
(a private room on the Itaipu map only), `warStart()` behind
`warConsented()` (the one screen of section 9, kept in
`settings.warConsent`), and `friends-war-stop` / `friends-end-war` calling
`roomWar.end()`. From outside a room, the title's card
(`ui.onWarCard`) and Make a room's Game row (`roomBrowser`'s `war`) go
through `warEnter(room, card)`: consent, a private room on `WAR_MAP` with
this pilot as host, the map seated, and the room screen with the war's
row first. `roomTarget` flies a war in free flight, as tag.

## 8. The hooks for the checks

- `window.__war()`: seat, view, error, what the attackers drew, the HUD
  (`warHud.shown()`), the markers (`warMarkers.shown()`), the HUD's calls,
  the link (which must stay the preset's), the radio's status, the damage
  mode, the burning targets, `watch` (spectating, the seat watched, the
  camera's position, the wreck, the banner) and the event log.
- `window.__warAt(t)`: `roomWar.attackersAt(t)`.
- `window.__warDo(op, arg)`: the host's `'start'` and `'end'`.
- `window.__warHear(m)`: a room message heard as if the room had sent it,
  for a state the room reaches too seldom to wait for (the two page
  check's empty rack). The room's next view replaces it.
