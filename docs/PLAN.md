# Making our own WebFPV: the plan

Written 2026-09-23 against WebFPVSimulator commit 9ed8b9c (552 commits, last
touched 2026-09-22) and WebFPVSimulator-LeaderBoard, both cloned to
~/Desktop.

## 0. The premise, corrected once

There is nothing to reverse engineer. Both repositories are full source under
GPLv3, with 552 commits of history, a 2.2 MB PROGRESS.md design log, and a
verification harness. The job is a fork, not a reverse engineering effort.

The licence sets the one hard boundary on "our own":

- We may copy, rebrand, change anything, host it, and charge for hosting.
- Whatever we ship must stay GPLv3 with source available to our users, and
  the original copyright notices and NOTICE file stay in place.
- It cannot become closed source. The flight controller is Betaflight
  (GPLv3) compiled to WASM, and `dist/sim.wasm` is a derivative of it. A
  proprietary version would need a clean room flight controller and a clean
  room plant model, which is months of work and throws away the one thing
  that makes this simulator credible: a real Betaflight loop at 1 kHz.

Recommendation: fork under GPLv3, keep the physics core, rebrand and replace
the shell over time. The rest of this plan assumes that.

## 1. What we are holding

| Layer | Where | Size | Verdict |
| --- | --- | --- | --- |
| Flight controller | `vendor/betaflight` submodule + `patches/` (2 patches) | upstream | Keep as is. Never edit vendored files, only patches. |
| Plant model + integrator | `src/native/` C, `dist/sim.wasm` (99 KB) | 4.2k lines | Keep. This is the crown jewel. |
| Sim bridge in JS | `src/fc/` | 8.2k | Keep. |
| Game rules | `src/game/` (track, race, score, collide, ghost, tricks) | 13.4k | Keep, then extend. |
| Renderer | `src/render/` Three.js from CDN import map | 13.4k | Keep, restyle later. |
| Maps | `src/maps/` incl. 3.2 MB vendored city (MIT) | 68k | Keep field, evaluate city, add our own. |
| Track builder | `src/trackbuilder/` | 23.6k | Keep. |
| UI shell | `src/ui/` + 199 KB `index.html` | 17.2k | This is where the rebrand lives. |
| Sharing | `src/share/` | 5.7k | Repoint to our board. |
| Input | `src/input/` WebHID, Gamepad, keyboard, touch | 3.3k | Keep. |
| Leaderboard | separate repo, Node + `pg`, JSON file fallback | small | Keep, redeploy under our domain. |
| Edge router | `edge/` Cloudflare Worker joining 3 deploys | 50 lines | Replace with our own hosting map. |
| Assets | `assets/music` 92 MB, gates, posters | | Audit licences in `assets/credits` before shipping. |
| Process residue | `.loop/`, `PROGRESS.md` (2.2 MB), `prompts/`, `.claude/` | | Drop from our fork. |

The design rules are in the repo's own CLAUDE.md and STAGE1.md. The ones we
must not break, because the whole harness depends on them:

- Physics is fixed step 1000 Hz and never reads frame time.
- Physics is bit deterministic: no JS Math in the physics path, own libm in WASM.
- Coordinates: physics is Z-up right handed, Three.js is Y-up, converted once
  in `src/render/frame.js`.
- Betaflight behaviour is compiled in, never reimplemented in JS.

## 2. Phases

Each phase ends with a check that proves it. Do not start the next until the
check passes.

### Phase 0: Reproduce their build (1 to 2 sessions)

Goal: prove we can rebuild what they ship, so we own it rather than carry it.

1. Fetch the Betaflight submodule (running now).
2. Install Emscripten (emsdk) and Chromium for the browser checks.
3. `npm run build:wasm`, then replay `tests/inputs/baseline.rec` through
   both the shipped and the rebuilt module and compare the state trace
   hash. Bytes will differ between Emscripten versions (their own log says
   so); the trace hash is what the determinism checks compare, and it must
   match. If it does not, stop and find out why before trusting anything.
4. `npm run verify`. Expected: 16 checks, all pass, check 1 no longer SKIP.
5. Run the leaderboard locally (`npm install`, then `PORT=3199 npm start`,
   because 3100 is taken on this machine) and publish a track to it.

Check: verify green with 0 skips, and a track round trips sim to board to sim.

DONE 2026-09-23. emsdk 6.0.10 at ~/emsdk. Build 8 s, vendor tree clean.
Trace hash de0401cd4266c395 for both shipped and rebuilt. verify 16 of 16.
Board round trip over its API: publish 201, document 200, time 201.
One board selftest fails at upstream HEAD: the Patreon link opens a bare
new tab and their own test forbids it. Goes away with the link in Phase 2.

### Phase 1: Understand it (2 to 3 sessions)

Goal: our own ARCHITECTURE.md, written by us, short enough to read in ten
minutes. Not a copy of theirs.

1. Trace one physics tick: radio sample, `sim_input`, `sim_step`, `sim_state`,
   `frame.js`, Three.js. Name the file and function at each hop.
2. Trace one lap: gate detection in `src/game/track.js`, scoring in
   `score.js`, posting in `src/share/board.js`.
3. Read the two patches in `patches/` and the ABI in `src/native/sim_abi.h`.
   That interface (about 30 functions) is the contract between C and JS.
4. Read the board API: `/api/tracks/{id}/document` and the post time route.
5. List every place the product name, domain, and board URL are hard coded.
   Known so far: `src/share/board.js`, board `public/origins.js`,
   `edge/router.js`, `render.yaml` in both repos, icons, `og.png`, the
   Patreon link on the title, and `scripts/noun-lint.js` which enforces
   their vocabulary.

Check: ARCHITECTURE.md exists and a second person can find the gate
detection code from it without grep.

DONE 2026-09-23. Two files beside this one: docs/ARCHITECTURE.md (the
ten minute read, both traces, the C contract, the seams) and
docs/REBRAND-INVENTORY.md (every hard coded string, grouped by what to
do with it, which is the Phase 3 checklist). Every path and function the
architecture file names was checked to exist. Findings that change later
phases: WebHID is documented but not implemented, only the Gamepad API;
posting a time is unauthenticated; the board ships a built in admin
account under the upstream author's email with the plaintext password in
its selftest; the music has no recorded licence; the whoop flies the five
inch plant in a scaled world and a true whoop plant already sits unused
in plant.c.

### Phase 2: Fork and strip (1 session)

1. Create our GitHub org and two repos. Push with full history preserved.
   Keep the originals as an `upstream` remote so physics fixes can be merged.
2. Delete from our main: `.loop/`, `prompts/`, `.claude/`, `PROGRESS.md`,
   `CITY-PERF-PLAN.md`, `TRACK-FROM-GIF.md`. Git remembers them.
3. Add our own NOTICE entry naming the upstream project and commit, keep the
   existing NOTICE and every GPL header untouched.
4. Decide on `tracks/`: those are real Australian and FAI event tracks. Keep
   the ones we will actually offer, drop the rest.
5. Audit `assets/music` (92 MB) and `assets/credits`. Anything without a
   clear licence goes.

Check: `npm run lint:shell` and the cheap selftests still pass after the cut.

DONE 2026-09-23. Name FDFPV. Repos github.com/fdflabs/fdfpv and
github.com/fdflabs/fdfpv-leaderboard, private, full upstream history,
`upstream` remote kept. Local clones renamed to ~/Desktop/fdfpv and
~/Desktop/fdfpv-leaderboard. One strip commit removed 265 files; the
freestyle scoring definitions moved to tests/fixtures/freestyle-scoring
because a selftest reads them. lint:shell green, 11 of 12 cheap checks
green; score:selftest fails one check identically at upstream HEAD.
Board: 1 selftest fails identically at upstream HEAD (the Patreon tab).
Left for a decision: tracks/ (13 real event tracks, untouched) and
assets/music (92 MB, no recorded licence, still wired into the audio
bed and verify check 14, so removal is a code change for Phase 3).

### Phase 3: Rebrand (1 to 2 sessions)

1. New name, domain, icons (`npm run gen:icons`), og image (`npm run gen:og`).
2. Repoint the three URL constants and the edge router, or replace the
   router with a single host if we do not need three deploys.
3. Retitle every user facing string. Either retire `lint:nouns` or rewrite
   its word list to ours.
4. Remove the Patreon and support links.

Check: `node scripts/shots.js` screenshots show no upstream name or domain
anywhere, and `npm run lint:board` passes against our board URL.

DONE 2026-09-23. Name FDFPV, wordmark FD + FPV. Placeholders everywhere:
fdfpv.example, fdfpv.onrender.com, fdfpv-board.onrender.com,
fdflabs.github.io/fdfpv-landing. Icons and og cards regenerated for all
three sites. Patreon gone from both repos. Board ships no admin account;
BOARD_ADMINS is the whole list. Dev board port moved to 3180 in both
repos because 3100 is taken on this machine. GPL headers, copyright
lines and NOTICE untouched. localStorage keys keep the webfpv prefix on
purpose. Kept as decided: tracks/ and assets/music.
Evidence: title, builder, board and bugs screenshots read FDFPV with no
support link; lint:shell, lint:input, lint:responsive, lint:board, 11
Node selftests, board selftest all green. score:selftest still fails
its one upstream check. Two commits per repo, pushed.

### Phase 4: Own the deploy (1 session)

Their layout: static site for the sim, Node service for the board, Postgres
behind it, Cloudflare Worker in front. Options in order of least effort:

1. Same layout on Render + Cloudflare, following their DEPLOY.md. Cheapest.
2. One VPS with nginx: static sim at `/`, board as a systemd service at
   `/board`, Postgres local. The board repo ships a docker-compose.yml.

Check: a public URL where a stranger can fly, build, publish, and post a time.

HALF DONE 2026-09-23. Both repos public. Simulator live at
https://fdflabs.github.io/fdfpv/ from .github/workflows/pages.yml on every
push to main (25 s deploy, wasm served as application/wasm, title screen
renders in headless Chrome with no page errors). The Cloudflare Worker is
not deployed: no domain yet. Front page links point at the live sim.
WAITING ON THE OWNER: the board. Nothing on this machine is logged in to
a host, so the owner creates a Render Blueprint from fdflabs/fdfpv-leaderboard
(render.yaml is ready, service fdfpv-board plus Postgres fdfpv-board-db) and
sets SIM_ORIGIN=https://fdflabs.github.io/fdfpv and BOARD_ADMINS. If Render
grants the name fdfpv-board, the sim's PRODUCTION_BOARD_ORIGIN placeholder
https://fdfpv-board.onrender.com is already right; otherwise change that
one constant in src/share/board.js and push. Then run the check above.
Also done: .github/workflows/checks.yml in both repos runs the pure-Node
selftests and lints on every push (the sim's fetches the Betaflight
submodule for lint:catalog). Both green on main.

### Phase 5: Diverge on purpose (ongoing)

Only now do we add. Candidates, to be ranked with you:

- Localisation. The shell is English only and strings are inline. A string
  table is the first real structural change.
- Our own maps and gate sets. `src/maps/registry.js` is the seam.
- Local league features on the board: seasons, classes, club pages.
- Multiplayer ghosts or live races. Physics is deterministic, so replaying
  another pilot's input stream reproduces their flight exactly. That is a
  large gift and the most interesting thing to build on.
- Own airframes in `configs/airframes.js`.

Rule for this phase: physics changes are made as patches and upstreamed or
kept mergeable. Shell changes are ours and may diverge freely.

STARTED 2026-09-23. Design in docs/PHASE5-DESIGN.md in this directory.
Order agreed: verified times, whoop physics, localisation, multiplayer.
Verified times Tier A DONE: src/game/verify.js checks a posted ghost
against the course headlessly (start on the line, every gate in order,
line again, clock agrees with claim and splits); the board pins the
simulator as a submodule under vendor/fdfpv, requires a ghost on every
posted time, and refuses with the reason as a 422. lap:selftest (12
checks) and the board selftest are green. Whoop physics: built nothing,
the upstream owner flew the true plant and rejected it; the step list is
in the design. Tier B DONE the same day: src/share/identity.js makes a P-256 key per
browser, every posted time is signed over track, lap and ghost hash, the
board verifies with the same module and files the name under the first
key (403 for another key). Settings has Pilot key export and import.
identity:selftest 16 checks, board selftest green.
Multiplayer DONE the same day: the board relays live rooms over
WebSocket (/api/live/:trackId, ws dependency), the sim has a Live row
beside Ghost, sends its pose at 30 Hz and draws each peer as a ghost
craft 150 ms behind its sender. live:selftest 17 checks, board selftest
with two sockets, and two client links driven against the real relay in
Node. Not yet seen by two humans in two browsers.
Localisation, language independent half, DONE the same day: every
sentence the pilot reads (2,018) lives in src/strings/en.js, looked up
through str(key, vars) in src/strings/index.js; lint:copy fails on any
prose literal outside the table (19 files excused with reasons: wire
formats, trick and music names, GLSL, pre-boot copy); strings:selftest
checks key parity and placeholders for any second locale. A second
language is one file, es.js or pt.js, plus its code in LOCALES. The
board page has its own table under public/strings with the same lint.
Spanish DONE 2026-09-23: src/strings/es.js (2,002 keys) and the board's
public/strings/es.js (214), translated by nine agents against one
glossary (neutral Latin American, tú, FPV jargon kept in English),
parity and placeholders checked by strings:selftest in both repos. A
Language row in Settings and a footer toggle on the board; links
between the two carry ?lang=. Still to do: a real lap flown by the owner
posted to a running board as the end to end check, and a Spanish speaker
reading the copy in place.

## 3. Risks

- The shipped wasm and the source could disagree. Phase 0 step 3 checked it: they agree.
- Three.js is loaded from a CDN import map. Pin the version and consider
  self hosting before going public.
- The verify suite takes minutes and drives headless Chromium. Run it on
  physics changes only, cheap lints for everything else, as their CLAUDE.md
  says.
- The upstream author moves fast (commits the day before our clone). Merge
  from `upstream` regularly while our shell still overlaps, or the merges
  become impossible.
- 92 MB of music in every clone. Consider Git LFS or dropping it.

## 4. First command of the next session

```bash
cd ~/Desktop/WebFPVSimulator
source ~/emsdk/emsdk_env.sh
npm run build:wasm && git status --short   # dist/sim.wasm modified, nothing else
```
