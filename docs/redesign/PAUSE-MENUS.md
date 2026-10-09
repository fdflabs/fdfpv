# Pause menus (the Escape menu)

**Status: CONTRACT** (2026-10-08), lane "pause menus" of Waves 3/4. Built in
small PRs, listed in section 7.

The owner, after flying the Extra in a Free Flight room in Spanish: "review
all menus when pressing esc i feel like there shuld be better options easier
clearer more elite choices".

## 1. What is there today (origin/main 10fc77de)

There is ONE pause menu. `pausedRows()` in src/ui/items.js draws it for every
context that flies: solo Free Flight, Track Day, Learn to fly, every room
mode, the war, the Interior missions. Esc (src/ui/keys.js flightKey), the
touch pause button (src/input/touchsticks.js), losing the mouse lock and a
hidden tab all open it. In a room, `roomExit()` turns Quit into Leave the
room. Nothing else changes with the context, the aircraft or the input.

Rows, top to bottom, with what each does and how often a pilot needs it in
the middle of a flight (rows from `node scripts/items-golden.js --dump es`;
pictures in ~/.cache/fdfpv-pause-menus/before/):

| # | Row (en / es) | Opens or does | Mid-flight need | Problem |
| --- | --- | --- | --- | --- |
| 1 | Resume / Reanudar | back to flight | every time | none |
| 2 | Restart run / Reiniciar sesión | new run | often | es says "session"; a run is not a session |
| 3 | Change aircraft / Cambiar de aeronave | the picker | sometimes | none |
| 4 | Customise / Personalizar | the hangar's power and paint | rarely | first-screen weight for a garage task |
| 5 | Ghost, Live (when pushed) | cycle a value | rarely | race tools sitting among navigation |
| 6 | Fly with friends / Volar con amigos | the room screen | sometimes in a room | one row, the room's actions are a screen away; label is the old "Fly with friends" |
| 7 | [Does it feel wrong?] / [¿Se siente mal?] | section | - | a question, not a name for what is inside |
| 8 | Tune / Tune | the PIDs room | quads often, planes: it is the gyro mode | "Tune" in es; on a plane it is a mode, not a tune; the note is the registry's English sentence ("A gyro holds the plane...") |
| 9 | Rates / Rates | the rates room | quads often | "Rates" in es; value "Actual, 670 roll and pitch..." English; Betaflight rates do nothing on a plane |
| 10 | Flight feel / Sensación de vuelo | the feedback form | rarely | fine, but in a "feels wrong" group |
| 11 | [Elsewhere] / [En otro lugar] | section | - | says nothing about what is inside |
| 12 | Quad or Plane / Quad o Avión | the machine screen (camera, flight mode, bench) | rarely | reads as a second "change aircraft" (owner's "Avión" duplicate); value repeats the tune |
| 13 | Settings / Ajustes | Settings | sometimes | value is the rates again (Rates shown twice) |
| 14 | Graphics / Gráficos | cycles Low/Medium/High | rarely, and it rebuilds the world | value English in es; a deep setting on the first screen |
| 15 | How to fly / Cómo volar | help | first flights | help on the first screen of every flight |
| 16 | Credits / Créditos | credits | never mid-flight | first-screen weight |
| 17 | My tracks (track map only) | the tracks list | between runs | fine |
| 18 | Quit to title / Leave the room | leave | sometimes | fine |

Count: 13 rows and 2 headers solo; 16 rows and 2 headers in a room with
Ghost and Live. At 1280 by 720 the list runs past the bottom of the screen:
Quit is below the fold (picture plane-es.png). Duplicates: Rates is on row 9 and the value of row 13; row 12
("Avión") reads as row 3; row 12's value repeats row 8.

Wrong language in es (measured by scripts/es-leak-lint.js, section 6): tune
names (Factory default, Stabilised), the tune's note, the rates summary, the
graphics names and notes, the "Live" row's Off and "n here", Settings' "You"
header, "Tune", "Rates" and "Quad" as es labels. Wrong aircraft: on a plane
the menu offers Rates (quad only), calls the mode a Tune and its door "Abre
PIDs", and its notes say "the quad".

Other contexts the brief asked about, checked in the tree:

| Context | What Escape does | Finding |
| --- | --- | --- |
| Solo Free Flight, Track Day, Learn to fly | the menu above | same rows everywhere |
| Rooms (Streamer Combat, Catch the Ace, Trick Battle, Free Flight) | same, Quit becomes Leave the room | room actions (invite code, players, host) live on the room screen, one row away |
| War (Itaipu) and Interior missions | same | Restart run and Change aircraft show in a mission; whether they should is a product question (section 8) |
| Watching a room (spectator) | Escape LEAVES THE ROOM at once (src/main.js onKey) | no menu, no confirm: one key from a dead end |
| Walkable hangar | leaves the hangar (Backspace too) | fine, it is a place, not a flight |
| Track builder | steps back one thing (inventory, then out) | fine |
| Replay editor | closes the open dialog | fine |
| Touch (phone) | the on-screen pause button opens the same menu | rows are the same long list on a 390 px screen |
| Gamepad / radio | menus driven by src/input/menus.js (select, back, stick or d-pad steps) | rows reachable; no pause button on a pad was found in flight, NOT verified in a browser yet |

## 2. What respected games do

Sources gathered 2026-10-08; several vendor pages refused automated reading,
so this is partial and marked where thin.

- Gran Turismo 7: Continue, Restart, Quick Options (HUD, music, meters),
  Exit; online adds Start Event and Chat. Four rows, and quick tweaks folded
  into one row apart from Settings
  (https://www.gran-turismo.com/gb/gt7/manual/race/01, from a search summary).
- DCS World: Resume, Controls, Options, Quit Mission, a message history
  (https://forum.dcs.world/topic/297960-pause-menu-message-history-behavior,
  search summary).
- Microsoft Flight Simulator: Esc is a hard pause into options; a separate
  Active Pause freezes the aircraft only
  (https://forums.flightsimulator.com/t/accessing-options-esc-key-menu-in-flight-should-not-pause-game-flight/519294,
  https://forums.flightsimulator.com/t/how-to-how-to-actually-pause-the-sim/143817).
- Liftoff: button setup and drone selection reachable from pause; a pause
  menu that hung when closed mid dropdown was a shipped bug
  (https://www.liftoff-game.com/node/155).
- VelociDrone (mobile): a HUD bar with reset, PID/rates and quad settings one
  tap away, deep settings behind a system menu
  (https://velocidrone.com/mobile_manual).
- RealFlight (G3.5 manual, the nearest documented): Reset is a key and a
  controller button, not a menu row.

What recurs: Resume first; four to six rows; one "quick options" place for
the tweaks between attempts, apart from Settings; restart one press away;
exit last; online actions appear only online.

## 3. The design

Rules (lead decisions, product):

- The first screen is short, at most six rows in the common case, Resume
  first with the cursor on it every time the menu opens.
- Only what applies here: this mode, this aircraft kind, a room or not.
- The tweaks between attempts live in ONE panel, Flight. Deep settings live
  in Settings. Help and credits live in Settings' Help group.
- Group labels name what is inside. Values read the same way on every row
  (the setting's current value, short, in the pilot's language).
- Every word through src/strings, both languages, no English in es
  (scripts/es-leak-lint.js holds it).
- Same visual language: the bracketed mono section labels, dark glass, the
  existing row widgets. Navigation is the menus' own (keyboard, pad, radio,
  touch); the panel adds no new control.

### First screen

```
 PAUSED                              EN PAUSA
 > Resume                            > Reanudar
   Restart run                         Reiniciar vuelo
   Flight          Extra, AS3X         Vuelo           Extra, AS3X
   Change aircraft Extra               Cambiar de aeronave  Extra
   Settings                            Ajustes
   Quit to title                       Salir al título
```

In a room, the room's own rows join and Quit becomes Leave:

```
 > Resume
   Restart run
   Flight          Interceptor, Factory default
   Change aircraft Interceptor
   Room            OWLS, 2 pilots      (the room screen: code, players, host)
   Settings
   Leave the room
```

On a built track, My tracks sits above Quit. That is the longest case:
seven rows, eight in a room on a track.

### The Flight panel

One screen, title Flight / Vuelo, opened from the first screen. Rows by
aircraft kind; every row reuses a builder that exists today.

Quad:

```
 [AIRCRAFT]                 [AERONAVE]
   Tune      Factory default  Ajuste PID   De fábrica       (the PIDs room)
   Rates     Actual, 670 ...  Tasas        Actual, 670 ...  (the rates room)
   Flight feel                Sensación de vuelo            (the feedback form)
   Quad setup                 Configurar dron               (camera, flight mode, bench)
   Customise                  Personalizar                  (power and paint)
 [VIEW]                     [VISTA]
   HUD style  ...             Estilo de HUD ...
   Graphics   High            Gráficos  Alto
 [THIS RUN]                 [ESTE VUELO]        (only when the shell pushes them)
   Ghost      Best lap        Fantasma ...
   Live       Off             En vivo  Apagado
   Back                       Volver
```

Plane: the Tune row becomes Flight mode / Modo de vuelo, valued with the
mode word (Stabilised, AS3X, Manual, Acro) and its door is the same PIDs room
where the mode is chosen; the Rates row is left out (Betaflight rates do not
reach the wing plant; flight model 2 owns plane rates and expo and adds
their row here when it lands, section 7); Quad setup reads Plane setup.

Notes on the panel's rows are short and localised; the long per-tune
English description stays on the PIDs room until the registry's notes are
translated (section 7).

### Settings

Settings gains a [HELP] / [AYUDA] group at its foot: How to fly, Credits.

### Where every row went

| Today on the first screen | Now |
| --- | --- |
| Resume, Restart run, Change aircraft, Settings, Quit/Leave, My tracks | first screen, unchanged |
| Tune, Rates, Flight feel | Flight panel, [Aircraft] |
| Quad / Plane (machine screen) | Flight panel, "Quad setup" / "Plane setup" |
| Customise | Flight panel, [Aircraft] |
| Graphics | Flight panel, [View] (and Settings, as today) |
| Ghost, Live | Flight panel, [This run] |
| Fly with friends | first screen as Room in a room; out of a room the same row, unchanged label |
| How to fly, Credits | Settings, [Help] (Credits also on the title, as today) |
| the two section headers | gone: the first screen has no groups |

Nothing a player can use is removed.

## 4. Data and code

- `pausedRows(ui, s)` returns the first screen; a new screen `quick` (the
  name `flight` is taken: it is the screen while flying) with
  `quickRows(ui, s)` beside it in src/ui/items.js, both built from the row
  builders that exist (`tuneRow`, `ratesRow`, `feelRow`, `graphicsRow`, the
  HUD style choice, `ui.ghostItems()`, `ui.liveItems()`).
- `quadRows` (the machine screen) is not reshaped: Settings, the launch card
  and the pause all reach it.
- `ui.returnTo` stays 'paused' for every screen reached from the panel, so a
  change mid run warns and returns the way it does today. Rates and PIDs
  opened from the panel return to it (`ratesFrom`, `pidsFrom`); the setup
  screen returns to the pause menu, as every other pause subscreen does.
- No storage, no sync, no server change.

## 5. What it does NOT do

- No new setting, no new control, no key remapping (the ops lane's screen).
- No plane rates (flight model 2).
- No change to what Escape does outside a flight (hangar, builder, replay).
- No change to the room screen itself.

## 6. The checks

- `npm run items:golden`: the first screen and the panel in every scenario,
  both languages; new scenarios for the plane, the war and the Interior
  before any row moves, so each PR's diff is only its rows.
- `npm run lint:es-leaks` (scripts/es-leak-lint.js): renders every scenario
  in es the way the page loads it and fails on English in the pause menu or
  the Flight panel; leaks elsewhere are listed exactly in
  tests/fixtures/es-leaks.json, a list that may only shrink.
- `npm run nav:golden`, `actions:golden`, `uirest:golden`: re-recorded only
  for the moved rows; the PR shows the diff is those rows.
- `npm run pause:menus` (browser, slot script): flies a quad and a plane in
  en and es and a phone in es, presses Escape as a key (a real tap on the
  touch pause button), holds Resume first with the cursor, no console
  error, and writes the pictures.
- lint:copy, lint:dashes, lint:header.

## 7. Build order

1. Strings: es fixes (tune and rates terms, graphics names, rates value,
   tune mode words, Live row, "You"), and the es leak lint with its list.
2. The first screen and the Flight panel together (splitting them would ship
   a PR whose duplicates have moved but not gone); the pause joins the lint's
   strict scope here.
3. Settings [Help].
4. Contexts: a confirm before a spectator's Escape leaves the room; the
   war/Interior questions in section 8 once answered.

Coordination (IMPLEMENTATION-PLAN.md):
- Flight model 2 (#871, plane controllers): a new tune name needs a
  `tune.name.<word>` key in both tables, or the lint fails; AS3X, Acro,
  Manual and SAFE Select are shared words already. Plane rates/expo get a
  row in the Flight panel's [Aircraft] group when they exist.
- Ops (key remapping): Settings is where it goes; the panel does not link it.
- Stats and foundations: no shared rows.

## 8. Owner questions (recommended option first)

1. In a war or Interior mission, keep Restart run and Change aircraft on the
   pause? Recommend: keep both (today's behaviour) until a mission rule says
   otherwise.
2. A spectator's Escape leaves the room at once. Recommend: Escape opens
   the pause menu (Resume, Leave the room) like a flying pilot's.
3. Out of a room, the row still says "Fly with friends". Recommend: keep it
   until the three-hub session work renames it everywhere at once.
