# WebFPV architecture, as read on 2026-09-23

Written against WebFPVSimulator 9ed8b9c and its leaderboard. Every path is
relative to the repo root. Line numbers will drift; function names will not.

## The shape

Two repos, three deploys, one payload.

```
Simulator (static site)          Board (Node + Postgres)        Edge (Cloudflare Worker)
index.html + src/                WebFPVSimulator-LeaderBoard    edge/router.js
  dist/sim.wasm (physics)          src/server.js (API)            / -> landing page
  three.js from CDN import map     public/ (board page)           /sim -> simulator
                                   data/board.json or Postgres    /board -> board
```

The only thing that crosses between them is the track document, a JSON
object with `field`, `elements[]` (gates, flags, cones, ground logo) and
`sequence[]` (flying order). The board stores it, the simulator builds a
world from it, and lap times post back against its id.

## Where the code is

| Directory | Lines | What lives there |
| --- | --- | --- |
| `src/native/` | 4.2k C | Plant model, integrator, Betaflight glue and stubs, own libm |
| `vendor/betaflight` + `patches/` | submodule | Betaflight 4.5.1, two patches applied at build time only |
| `src/main.js` | 6k+ | The game loop. Accumulator, physics stepping, race update, render pose |
| `src/input/input.js` | 3.3k | Gamepad API, keyboard, touch. Calibration wizard |
| `src/game/` | 13k | `race.js` gates and laps, `track.js` lap maths, `collide.js`, `ghost.js`, `score.js` (freestyle only) |
| `src/render/` | 13k | Three.js scene, `frame.js` coordinate boundary, audio, post |
| `src/maps/` | 68k | `registry.js` is the seam. `field.js`, `custom.js` (board tracks), `city/` (3 MB vendored MIT city) |
| `src/trackbuilder/` | 24k | Separate page. Writes track documents to localStorage, publishes to the board |
| `src/share/` | 5.7k | `board.js` HTTP client and origin constants, `session.js` localStorage seats, ghost encoding |
| `src/ui/ui.js` | 17k | Every menu. Title, settings, PIDs, rates, credits |
| `src/fc/` | 8k | Betaflight CLI diff parsing, tune registry, rates curve preview |
| `tests/lib/simmod.js` | | The WASM loader. Despite the path, this is the production loader too |
| `configs/` | | Shipped tune (Betaflight default), airframes, rate presets |

## One physics tick

Physics runs at exactly 1000 Hz on the main thread. There is no Worker.

1. `src/input/input.js` `InputManager.poll` runs on a 2 ms `setInterval`, reads `navigator.getGamepads()`, maps axes through the calibration to roll, pitch, yaw in -1..1 and throttle in 0..1, and pushes `{wallT, roll, pitch, yaw, throttle}` onto a plain array queue. WebHID is not implemented, whatever STAGE1.md says.
2. `src/main.js` `frameBody` (the rAF callback) drains that queue into `rcPending`, then runs the accumulator: `acc += dt; steps = floor(acc / 1 ms)`, with dt capped at 100 ms.
3. Samples are resampled onto a 250 Hz RC grid (or a link preset with delay and jitter) and handed to `sim.input(t_seconds, roll, pitch, yaw, throttle)`.
4. `src/native/sim.c` `sim_input` rejects non-monotonic time and stores the sample in an 8192-entry C ring.
5. `main.js` loops `sim.step(1)` for each step, reading state after each so the trick detector and obstacle contact see every millisecond. The last two states become `statePrev` and `stateCurr`.
6. `sim.c` `sim_step`: consume queued samples whose timestamp has arrived, `bridge_run`, apply motor override, ground plane, `plant_step`, `ground_apply`, launch stand.
7. `src/native/bf/bf_glue.c` `bridge_run`: body rates to deg/s plus deterministic vibration, rotor speed to the RPM filter, sticks to `rcData` 1000..2000, then real Betaflight: `gyroUpdate`, `gyroFiltering`, `updateRcCommands` (only on a new RC frame, so feedforward sees true intervals), `processRcCommand`, `pidController`, `mixTable`. DShot values become duty 0..1.
8. `src/native/plant.c` `plant_step`: pack sag, per-motor first-order spin with prop load and ground effect, thrust and torque from RPM squared, airframe drag, then semi-implicit Euler with a quaternion renormalise. Motor time constant is emergent from rotor inertia and winding resistance, measured at 26 ms by verify check 8.
9. `sim_state` writes 20 doubles: t, pos xyz, vel xyz, quat wxyz, body rates pqr, four motor RPM (Betaflight order RR FR RL FL), pack volts, pack amps. JS reads them by raw index.
10. `main.js` interpolates with `a = acc` (valid only because a step is exactly 1 ms), converts both states through `src/render/frame.js` `simPosToThree` (x,y,z) to (-y, z, -x) and `simQuatToThree`, lerps position, slerps rotation, and copies the result onto `shell.quad`.

Determinism holds because the plant uses its own polynomial sin and cos in
`src/native/libm/sim_math.c`, Betaflight is compiled with no fast math and
no fp contraction, and vibration noise is an xorshift seeded per reset.

## One lap

Timing is purely geometric on position. No speed or attitude check.

1. `src/game/trackdoc.js` `courseFromDocument` converts the document to scene frame, scales gates by 1.15, walks the sequence and emits `stations[]`, one per aperture in flying order. Flags and cones become virtual apertures.
2. `src/render/scene.js` `buildFieldScene` turns stations into meshes and a `gates[]` array with position, heading, apertures and `flyOrder`.
3. `src/game/race.js` `Race` sorts gates by `flyOrder` and builds a local frame per gate. The timing gate is the first non-virtual one.
4. Each frame `main.js` calls `race.update(prevPos, currPos, simNow, ...)`. `tryPass` sweeps the segment prev to curr against the next gate only, as a box: half the clear width and height minus a 2 cm margin, plus or minus 0.5 m depth, forward motion only. Crossing time is interpolated on the sim clock, never wall time.
5. A lap is timing gate, every gate in order, timing gate again. Out of order passes cost nothing; the owner overruled the MultiGP rule and left `voidLap` dead by design. Crashes do not void.
6. `src/game/track.js` `fastestLap` and `fastestThreeConsecutive` compute the two board numbers. `threeMs` is the sum of three consecutive clean laps, and only micro tracks post it.
7. `src/game/ghost.js` records position and quaternion resampled to 30 Hz, 20 bytes a sample, about 36 KB a minute. It is state, not input, so a ghost is a replay of where the craft was, not a re-simulation.
8. `src/share/board.js` `postTime` sends `{name, lapMs, threeMs?, ghost?}` to `POST /api/tracks/{id}/times`. There is no authentication on that route. Anyone can post any time to any track; the ghost check only proves the ghost's duration matches the claimed lap.
9. Board `src/server.js` validates, and `src/store.js` inserts and returns the rank. The `editKey` returned on first publish guards republishing and the track's gif only, never times. A republish that changes the layout hash deletes every time on that track.

`src/game/score.js` is freestyle trick scoring, not racing. It posts to a
separate `/api/runs` route.

## The C contract

`src/native/sim_abi.h`, version 1. Every entry returns 0 for ok or a
negative error. Frames are world Z-up, body X forward Y left Z up, SI
units. The functions fall into five groups: lifecycle (`sim_init` with a
Betaflight diff, `sim_reset`), input (`sim_input`, `sim_step`), contact
(`sim_contact`, `sim_contact_at`, `sim_deflect`, `sim_set_ground`,
`sim_prop_strike`), modes (angle, launch control, crashflip, arcade,
airframe, air and gravity scale), and state (`sim_state`, 20 doubles).
Three extra exports in `bf_glue.c` read and dump Betaflight settings.

The two patches: 0001 turns on the dyn notch, RPM filter and dynamic idle
under a simulator define, because the plant knows rotor speed exactly.
0002 hoists Betaflight function-local statics to file scope and zeroes
them on init, so a second init on one WASM instance is a real reset.

What is compiled in: gyro filter chain, PID with feedforward, TPA, iterm
relax, anti-gravity, mixer, dynamic idle, rc smoothing, rates, launch
control, crashflip, angle mode, simplified tuning. What is not: the
scheduler, IMU and AHRS, all RX protocols, failsafe, GPS, OSD, blackbox,
MSP, CLI, and every driver. Those are stubbed in `bf_stubs.c`.

## Three airframes, two plants

`plant.c` has three parameter tables, a 0.71 kg five inch on 6S, a 23 g
65 mm whoop on 1S and a 0.65 kg 1000 mm flying wing on 4S. The whoop is
never selected: `configs/airframes.js` gives it `simId: 0`, so it flies the
five inch plant in a scaled world, and the comment says so. Building a true
whoop is a Phase 5 option that is already half done in C.

The wing is `simId: 2` and is a second plant, `src/native/plant_wing.c`,
behind the same 20 double state block and the same contact code. It has
no flight controller: `sim_step` skips the Betaflight bridge for it and
the sticks drive two elevons through rates and expo in C. Lift, drag and
the moments come from a stability derivative model written in the
aeronautical convention and mapped into the body frame at the boundary,
with a cubic stall and a propeller whose thrust falls with airspeed. The
numbers and where each came from are in `docs/WING-STAGE1.md`; the eleven
bands the plant has to land in are `scripts/wing-gates.js`, and the ground
cases are `scripts/wing-contact-selftest.js`. The plant needs `atan2`,
which the fixed libm did not have, so `sim_math.c` gained one that agrees
with the host to 1e-12 across a grid (`scripts/wing-math-selftest.js`).
The quad's replay hash is pinned by those checks and has not moved.

## Seams for our own work

- New map: a row in `src/maps/registry.js` and a module like `field.js`.
- New airframe: a table in `plant.c`, a row in `configs/airframes.js`, an id in `sim_set_airframe`. A new kind of aircraft is a second plant with a `kind` in the table, the way `plant_wing.c` is; see `docs/WING-PLAN.md` for the stages that took.
- New tune: a Betaflight diff in `configs/` and a row in `configs/registry.js`.
- Board origin: two constants in `src/share/board.js` and one in the board's `public/origins.js`.
- Multiplayer or shared ghosts: the ghost wire format in `src/share/ghostdata.js` is already position plus quaternion at 30 Hz. Live races would send the same stream over a socket.
- Localisation: strings are inline in `src/ui/ui.js` and `index.html`. There is no string table. That is the first structural change.

## What surprised us

- The production WASM loader lives under `tests/`.
- WebHID is documented as the primary input and does not exist.
- Time posting is unauthenticated. Fine for a hobby board, not for a league.
- Ghosts are recorded state, so they cannot be re-verified by re-simulation, although the deterministic physics would allow it if inputs were recorded instead.
- `NOTICE` says the music licence is not recorded. It must be resolved or the 92 MB removed before we ship.
- The board ships a built-in admin account with the upstream author's email and a published password hash, and its selftest contains the plaintext password. Delete on fork.
