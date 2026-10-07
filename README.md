# Paraguayan Drone Combat Simulator

Made by [fdflabs.com](https://fdflabs.com). The Paraguayan Drone Combat
Simulator (repository name fdfpv) is fdflabs.com's GPLv3 fork of Mathew
Harvey's
[WebFPVSimulator](https://github.com/Mathew-Harvey/WebFPVSimulator); see
NOTICE and the Credits section below for whose work it stands on.

A browser FPV simulator whose only current goal is flight feel
indistinguishable from a real quad. Stage 1 is physics only: Betaflight
4.5.1 compiled to WASM flying a first principles plant model, verified by
a fixed harness. See CLAUDE.md and STAGE1.md for the rules.

There is a second aircraft: a 1000 mm flying wing on 4S with no flight
controller, thrown by hand from the title's fourth card and flown on the
sticks. Its model, its bands and its progress are in `docs/WING-STAGE1.md`,
`docs/WING-PLAN.md` and `docs/WING-PROGRESS.md`.

This is a GPLv3 fork of
[Mathew-Harvey/WebFPVSimulator](https://github.com/Mathew-Harvey/WebFPVSimulator).
See NOTICE for what was taken and what was removed.

## Where the thinking is

`docs/PLAN.md` is the fork's plan with every phase and its evidence,
`docs/ARCHITECTURE.md` the ten minute read of how the code fits,
`docs/PHASE5-DESIGN.md` the design of verified times, claimed names, live
rooms and localisation, `docs/REBRAND-INVENTORY.md` what changed from
upstream and why, and `docs/SPANISH-GLOSSARY.md` the rules the Spanish
table was translated by.

## Requirements

To fly it: Node 22 or newer, nothing else. `dist/sim.wasm` is committed so
the toolchain is optional, and there are no npm dependencies to install.

To rebuild the physics module or run the full verification: Emscripten
(emsdk on PATH, or in `$EMSDK`, `~/emsdk` or `/opt/emsdk`), a shell that
can run `scripts/build-wasm.sh` (Git Bash or WSL on Windows), and a Chrome
or Chromium install for the browser checks (`SIM_CHROME_BIN` overrides the
location).

## Fly

```bash
git clone --recurse-submodules <this repo>
npm run serve        # then open http://127.0.0.1:8000/
```

On Windows, PowerShell may refuse to run npm with "running scripts is
disabled on this system". Either start the server directly with
`node scripts/serve.js`, or allow local scripts once with
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

Rebuild the module after changing anything under `src/native` or
`patches/`:

```bash
npm run build:wasm
```

Sticks: put your radio in joystick mode before loading the page (it
enumerates as a gamepad), then run **Calibrate sticks** in Settings; the
mapping is remembered. Or fly on keyboard: W/S throttle, A/D yaw, arrows
are the right stick (up arrow pushes the stick forward, nose down). On a
phone or tablet, turn it sideways: thumb sticks appear in flight, left
thumb yaw and throttle (throttle stays where you leave it), right thumb
roll and pitch, and they fly whichever Flight mode Settings says, Acro
included.

Keys in flight: R resets to the start line, X cuts the motors, L arms
launch control on the start line when Settings has it on, F8 opens the bug
report, Escape pauses. Everything else is a row in a menu: the pack
voltage, the camera, the tune, the rates and the PIDs are all in Settings,
where they can say what they do. **How to fly** on the title and pause
menus is the list this paragraph is a summary of, and it is the copy that
is generated from the bindings rather than typed twice.

One tune ships on the Tune row of the title and pause menus: the Betaflight
default, which is what a freshly flashed quad flies. Every other feel is
yours to make, because a shipped opinion about how a quad should feel is the
one thing a simulator chasing real flight feel should not hand you. The PIDs
screen adjusts whichever tune is loaded with Betaflight's own tuning
sliders, or lets you set every PID by hand, and the Firmware bench edits any
field the firmware has. Save a dump on the bench and it joins the Tune row
as your own, with its own adjustment. Rates are yours and stay put across
all of them: the Rates screen draws the stick to rate curve with your sticks
on it.

Track mode races tracks built in a world. It opens on **My tracks**: the
tracks you have built, and the board's when there is one, each with Play,
Edit, Duplicate and Delete, and **New track**, which asks for the world
(the Alps or the Swiss valley) and opens the builder there. B in flight
opens the same builder on the track you are flying; B again test flies it,
and Escape brings you back to My tracks. Every quad races every track, and
a plane races the ones whose every gate it fits.

Tracks you build stay in this browser. Clearing it, or another device,
starts you from nothing. P in the builder publishes a track to the public
board. The board is a separate site,
[fdfpv-leaderboard](https://github.com/fdflabs/fdfpv-leaderboard), live at
https://129.151.39.48/board/. Locally it serves at
`http://127.0.0.1:3180/`. Fly this course from the board opens this
simulator in another tab with `?share=` and the track. F8, and the flight
feel form behind it, file their tickets there too.

## Posting a time, and flying with others

A lap posted to the board travels with its ghost, position and attitude
at 30 Hz, and the board runs this simulator's own gate detector over it
before the time goes up: start on the line, every gate in flying order,
line again, and the course's clock has to agree with the claim and with
every split. A lap that does not hold up is refused with the reason. The
check is `src/game/verify.js`, and the board imports it from a pinned
checkout of this repository, so the two can never disagree about what a
gate is. `npm run lap:selftest` threads a synthetic lap through the
reference course and then breaks it seven ways.

Your name on the board belongs to a key this browser makes the first time
you post, and every post is signed with it. Another browser posting under
your name is refused. **Pilot key** in Settings copies the key so you can
carry your name to another browser with **Import pilot key**, and keep it
safe: whoever has it is you on the board. `src/share/identity.js`, checked
by `npm run identity:selftest`.

**Live**, beside Ghost on a board track, opens a socket to the board's
room for that track. Other pilots flying it right now appear as ghost
craft with their names, posed a fraction of a second behind their own
clock, and they see you. Nothing is scored between you and nothing
collides. `src/share/live.js` and `LiveGhost` in `src/game/ghost.js`,
checked by `npm run live:selftest`.

## Host it

The simulator is a static site on GitHub Pages, deployed by every push to
`main`. The servers it talks to, tracks, multiplayer rooms and the board
with its Postgres, run on the owner's VM at https://129.151.39.48 and are
put there by the scripts in `deploy/vm/`, whose README has the commands.
[DEPLOY.md](DEPLOY.md) has the whole picture, including the constants in
`src/share/` that name each server and the Render blueprints that are the
other way to host them.

## Verify

```bash
npm run verify
```

Runs the Stage 1 checks from STAGE1.md headlessly, including bit exact
determinism between Node and headless Chrome, and prints a table. Fifteen
checks, all passing, with one SKIP.

The SKIP is check 1, the build. It compiles Betaflight through emcc and
asserts the vendored tree came out unmodified, so on a machine with no
Emscripten and no submodule there is nothing to compile and nothing to
diff. It prints why, and the summary counts skips on their own line, so a
green run cannot quietly mean an unbuilt one. An emsdk with no sources, or
sources with no emsdk, is still a failure: that is a machine that was set
up to build and did not.

Cheaper checks that do not need a toolchain, and are the ones to reach for
first: `npm run lint:shell`, `lint:input`, `lint:nouns`, `lint:memory`,
`lint:fc`, `lint:presets`, `lint:catalog`, `lint:responsive`, and
`npm run input:selftest`, `score:selftest`, `ghost:selftest`,
`contact:selftest`, `link:selftest`, `music:selftest`.
`input:selftest` drives the calibration wizard and the stick modes in plain
Node against synthetic radios, one check per shipped defect; `lint:input`
is the same tickets' other half, the calibrate screen, the title's trouble
rows, the Settings room and the thumb sticks, through headless Chromium.

## Credits

The Paraguayan Drone Combat Simulator is made by
[fdflabs.com](https://fdflabs.com). It stands on other
people's work, and each of them keeps their credit:

- Mathew Harvey's
  [WebFPVSimulator](https://github.com/Mathew-Harvey/WebFPVSimulator), the
  upstream this is a fork of, and its board
  WebFPVSimulator-LeaderBoard. Every upstream file keeps its GPLv3 header
  and copyright line.
- [NOTICE](NOTICE): the third party material in the combined work
  (Betaflight, three.js, the music, the LANPY mark, the explosions), its
  licences, and the origin of this fork.
- The in-game credits, Credits on the title and pause menus or `#credits`,
  built by `src/ui/credits.js`: the upstream maker, the beta test pilots,
  Betaflight, Track Draw and the Dutch Drone Squad, and the data behind
  the Itaipu map with its licence notices.
- [tools/explosions/README.md](tools/explosions/README.md): the war's
  explosions, rendered from JangaFX's EmberGen simulation (CC0).
- [assets/audio/war/CREDITS.md](assets/audio/war/CREDITS.md): every war
  mode music and voice file, its author, source and licence.
- The map data repository carries its own source attributions:
  [fdfpv-itaipu-data](https://github.com/fdflabs/fdfpv-itaipu-data).

## Licence

GPLv3. Compiling Betaflight's control loop in makes this a derivative
work; see LICENSE.
