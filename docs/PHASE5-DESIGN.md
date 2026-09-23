# FDFPV Phase 5 design

Written 2026-09-23 from five read-only investigations of the code. Order
agreed with the owner: verified lap times, whoop physics, localisation,
live multiplayer. Each section says what the code allows, what is built,
and what is deliberately not.

## 1. Verified lap times

### What the code allows

The physics is bit deterministic, but a lap is not a pure function of the
stick recording. The shell interleaves calls into the module every
millisecond that depend on things outside the recording: the ground plane
comes from a height field built inside the Three.js scene builder, the
obstacle colliders are populated inside the same builder, prop strike and
angle mode are gated on wall clock windows, the city's moving colliders
advance once per render frame, and the race is scored on the render
interpolated pose. Reproducing all of that headlessly means extracting the
world builders out of the renderer and replaying every shell call by step
index. That is weeks, and it is the wrong first step.

What the board already receives with every time is a ghost: position and
attitude at 30 Hz for the whole lap, plus splits. Today the board checks
only that its duration matches the claimed lap. The course builder and the
gate detector run in plain Node with no Three.js, and the track builder's
own selftest already drives both headlessly.

### What gets built

**Tier A, geometric verification, in this pass.**

- `src/game/verify.js` in the simulator: `checkLap(document, ghostBytes, lapMs)`.
  Builds the course with `courseFromDocument`, derives the gates with a
  `gatesFromCourse` factored out of the track builder selftest (with the
  elevation fix: gate y is the station's baseY, not 0), runs `Race` over the
  ghost samples on the sim clock, and reports: every gate passed in flying
  order, measured lap time against the claim, top speed and top acceleration
  against the airframe's envelope, no teleports, start and finish at the
  timing gate. Pure function, no DOM, no Three.js.
- The board imports that module from a pinned checkout of the simulator
  under `vendor/fdfpv` (a git submodule), so the two can never disagree
  about what a gate is. The MIRRORS copies in `validate.js` stay for now and
  are retired as the shared code is proven.
- `POST /api/tracks/:id/times` requires a ghost and runs the check. A time
  that fails is refused with the reason. Every time on the board is then
  a lap the board itself watched pass every gate.

**Tier B, claimed names, built 2026-09-23.** A keypair per browser (WebCrypto,
P-256), the board records the first public key seen for a name, and every
post is signed over track id, lap and ghost hash. A name then belongs to
whoever posted under it first, without accounts, passwords or email.
Export and import of the key comes with it so a pilot can move browsers.

**Tier C, true re-simulation, not now.** Record the exact `sim.input`
tuples and step counts, extract `makeHeightField` and the collider builders
from `scene.js` into pure modules, replay the shell's module calls by step
index. Written down so the Tier A and B work does not close the door:
the ghost format gains a version field for a future input stream.

### Check

A selftest with a synthetic lap threaded through the reference course
passes, and the same lap with a skipped gate, a teleport, a 90 m/s
segment, and a wrong claimed time each fail with the named reason. Then a
real lap flown in the browser posts to a local board and is accepted, and
the same payload with the ghost stripped is refused.

## 2. Whoop physics: built nothing, and here is why

The C plant has a true 23 g whoop table, and it is unused on purpose. The
comment on the airframe entry records that the upstream owner flew every
version of the true plant and judged that "it does not feel like flying",
so the whoop flies the five inch plant in a room scaled 3.43 times life
size. The room, the gates, the pass boxes, the camera, the fog, the lights
and the drawn craft are all built at that scale. Flipping the plant id
alone puts a 5 m/s machine in a 34 by 41 m hall with 2.4 m gates.

A true whoop mode is therefore not a switch, it is a second world scale
threaded through seven modules plus a whoop tune, plus re-derived checks,
plus a pilot's judgement that the upstream owner already gave once. The
step list from the investigation is kept below for when the owner wants
to fly that experiment. Until then, nothing changes.

Steps if wanted: plant variants in `configs/airframes.js` (simId, cells,
gravity, dims, world scale per variant); a Settings row; `src/main.js`
reads the variant at the title only rule; world scale from run state in
`track.js`, `trackdoc.js`, `race.js`, `scene.js`, `whoopcraft.js`,
`stage.js`; offer the retired whoop tunes; fix the HUD pack gauge that
assumes 6 cells; re-derive `check:craft` pins for scale 1; run
`whoop:gates`, `micro:check`, `flightcheck --airframe=whoop65`, `verify`.
Then fly it.

## 3. Localisation (table, lint and Spanish built 2026-09-23)

About 2,200 user visible strings, 40 percent in `src/ui/ui.js`, with no
indirection of any kind today. Nine private copies of the same `el(tag,
cls, text)` helper are the natural hook. System font stacks cover Latin
extended, so Spanish or Portuguese cost nothing in fonts; a non Latin
script would need self hosted fonts and a right to left pass.

Plan: `src/strings/en.js` as a flat table of dotted keys, `t(key, vars)`
and `plural(key, n)` in `src/strings/index.js`, locale from `?lang=`, then
localStorage, then `navigator.language`. Extract in this order: trick and
loading tables, screen titles and menu rows, the `el` and `textContent`
sites, `main.js`, share, track builder, then the board with its own table.
Replace the 30 hand rolled plurals. Keep the wordmark, trick proper names,
Betaflight field names and baked signage untranslated. A `lint:copy` built
on the noun lint's tokenizer fails on any prose literal outside the table.
A second language is a second file plus a key parity check.

This runs after section 1 lands, because it touches every file the other
work touches. The target language is the owner's call.

## 4. Live multiplayer ghosts (built 2026-09-23)

The ghost craft, its 30 Hz sample format and the Catmull-Rom playback all
exist. A live peer is the same craft fed from a ring buffer with its own
clock, rendered 150 ms behind the sender.

Design: WebSocket on the board, `ws` as its second dependency, path
`/api/live/:trackId`, room per board track id, in memory only. Client to
server frames are 24 bytes (u32 sender ms plus the 20 byte sample), server
to client adds a u16 peer id and relays without parsing. JSON text frames
for join, leave and roster. Client keeps one `LiveGhost` ring per peer and
one ghost rig per peer, built on join and disposed on leave. A Live row in
the menu beside the Ghost row, default off. Peers have no collisions, no
sound, no server side pose validation. The edge router needs a three line
branch to pass a 101 through if a custom domain ever fronts the board.

Render's free tier sleeps when idle; an open socket keeps it awake, and
the first joiner pays the cold start.

## Order and what each needs from the owner

1. Verified times, Tier A then B. Needs: the board deployed to run the
   end to end check, and the owner to fly one real lap.
2. Localisation. Needs: the language.
3. Multiplayer. Needs: two browsers and a friend.
4. Whoop physics. Needs: a decision to fly the experiment the upstream
   owner already rejected.
