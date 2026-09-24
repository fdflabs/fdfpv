# Fixed wing: progress ledger

The stage list is in `docs/WING-PLAN.md`. This file is the state of play,
and the first thing to read when picking the work up: one row per stage,
the commit that closed it, and the check output that proved it. A stage
is DONE only when its check ran green in the same session that wrote it.

## How to resume, unattended

1. Read this file. The first stage not DONE is the current one.
2. Read `docs/WING-STAGE1.md` for the aircraft and the conventions.
3. Run `npm run verify` once at the start of a session that touches
   `src/native`, and after any change there. The quad's hash in check 2
   must not move; if it does, stop and find out why before anything else.
4. Every stage ends with its check green, one commit, a row here, a push.
5. A band is never widened to pass. Ten failed iterations on a stage is
   a finding: write it here under the stage and stop.

## Stages

| Stage | Status | Commit | Evidence |
| --- | --- | --- | --- |
| 0 Derivation | DONE | see git log | docs/WING-STAGE1.md: every number has a formula and a source, bands derived by the script at its end |
| 1 Deterministic maths | DONE | see git log | wing:math 9 of 9, 641,601 grid points within 1e-12 of the host; verify 16 of 16, quad hash de0401cd4266 unmoved |
| 2 Wing plant | DONE | see git log | src/native/plant_wing.c behind airframe id 2, sim_wing_launch, sim_wing_surfaces and sim_wing_debug additive; builds clean, vendor tree unmodified, quad replay hash de0401cd4266c395 unmoved, verify 16 of 16 |
| 3 Wing gates | DONE | see git log | wing:gates 11 of 11: W1 15.32 m/s, W2 7.73, W3 9.90, W4 23.74, W5 237 deg/s, W6 off 7 percent, W7 10.92 m/s, W8 5.4 m and 9.5 m/s, W9 7.9 deg, W10 hash unmoved, W11 node and chrome 5fb5c7f4ada5a87a. Three coefficient sign errors found and fixed by flying, recorded in docs/WING-STAGE1.md |
| 4 Shell and input | DONE | see git log | Fourth card on the gate (Fixed wing, freestyle, airframe wing1000, tune wing-manual); L throws the wing from a metre up at 10 m/s and takes it off the pad hold; pack gauge per cell (4S reads 16.8 V); shots through the card into flight and a throw with 0 console errors (thrown y 0.50 m at 1.2 s, belly down 10 m on at 3.7 s); lint:shell PASS with the gate pinned to four cards, lint:input 84, lint:copy, lint:nouns, strings 11, presets and catalog PASS; verify 16 of 16, quad hash de0401cd4266 unmoved. The wing flies the town until stage 8 lands and wears the quad mesh until stage 5 does |
| 5 Rendering and sound | DONE | see git log | src/render/wingcraft.js: lofted swept wing, elevons on their hinges, pod with the camera in its nose, pusher on a pylon; one builder table in craft.js, the ghost from it, VOICES in audio.js (wing: one centred two blade motor, wind that brightens with airspeed; quad voice measured unchanged, 7e-7 dB). Shell wired: setVoice on seat, sim_wing_surfaces read back each frame into setSurfaces (full roll right reads +0.436 and -0.436 rad on the two elevons in the live page, roll left with up reads -0.436 and 0.225), camera at the pod nose, ghost rebuilt on airframe swap, showcase from the table, pad banner says throw. check:craft 29 of 29, music:selftest, lint:memory, lint:shell, lint:input 84, lint:copy, strings 11 all PASS, shots 0 console errors |
| 6 Collision | DONE | see git log | Hull from the airframe dims (1000 by 500 by 70 mm box, sweep 0.5 m) through the quad's corner contact; wing:contact 7 of 7 (belly landing at 8 m/s skids 1 m and rests on the plane, tip strike at 60 degrees pivots down and lies flat in 0.56 s, nose-in stops, throw from the grass leaves). The settle rule leaves a tipped wing to the corner impulses until it lies within 18 degrees of flat: the centre stops and centre friction, taken every millisecond, had perched it at 50 degrees and then spun it onto its back. Quad path untouched: contact:selftest all pass, W10 and verify hash de0401cd4266 unmoved, verify 16 of 16, wing:gates 11 of 11 with W11 unmoved. check:craft 29 of 29 once stage 5 landed |
| 7 Wing track class | DONE | see git log | TRACK_CLASSES gains 'wing': five metre gates and pylons on a 400 by 300 m field, gate scale one, pass depth 2 m, its own palette, preset, tuning block, share seat and autosave key, a WING toggle beside 5 INCH and WHOOP, wing1000 seated on it; the shell, session, storage, board client and plan read the class three ways rather than micro versus everything else. lap:selftest 21 passed (wing course built by the builder's own model, honest lap at 20 m/s accepted through 4 gates, top speed 20, skipped gate refused); check:clip 531 passed; lint:shell PASS with no baseline change; lint:input 84 passed; lint:copy, lint:nouns, strings:selftest 11 passed; every step of checks.yml green (wing:gates 11 of 11 with both hashes unmoved, verify not run: nothing native changed). Board: TRACK_CLASSES mirror, a third plate on the page, wing strings; npm test publishes a wing course, accepts a signed wing lap at cruise and refuses one that skipped a gate, run against the board's own vendor and against this commit |
| 8 Airfield | DONE | see git log | src/maps/airfield.js registered as 'airfield', freestyle, five inch for now; lint:memory PASS, airfield 1 module, 61 -> 49 -> 62 geometries, 5 -> 4 -> 6 textures; lint:boot 9 of 9; lint:shell PASS; attract-check through 0 of 320; title and runway shots through shots.js with 0 console errors |
| 9 End to end, headless | DONE | see git log | scripts/wing-e2e.js (npm run wing:e2e, and the board's CI runs it against its vendored copy): a pursuit and height law flies the real plant round the builder's four gate airfield loop, 50.5 s, ghost recorded with GhostRecorder from the timing line, signed with a pilot key, published and posted to a board started from ../fdfpv-leaderboard: 201 rank 1; the same flight with gate 3 left out, 422. 9 of 9. The plan said three gates; the loop is the lap selftest's four, so the two checks fly one course |
| 10 Wiring and docs | DONE | see git log | Sim CI runs wing:math, wing:gates and wing:contact; the board CI runs wing:e2e against its vendored simulator, pinned at stage 9 (fdfpv-leaderboard 4111b41, green). Pages carries wingcraft.js, airfield.js, plant_wing.c and the module; the live site loaded in headless Chrome shows the four cards with Fixed wing on the title. README, docs/ARCHITECTURE.md and docs/PLAN.md say what the wing is. Every new string is in es.js (strings:selftest 11, lint:copy PASS). Both CIs green |
| 11 Handover | DONE | see git log | docs/WING-HANDOVER.md: six things to fly (throw, chop, stall, roll at speed, the turn, the camera), each with what a real wing does and what would count as wrong here. Nothing is tuned by ear; a wrong one becomes a band that moves for a stated reason |

## Findings

- Stage 2: the coefficients are written in the aero convention (y right, z down) and the body frame is y left, z up. Sideslip, pitch rate and yaw rate change sign going in; side force, pitch and yaw moments coming out. Getting that wrong made the nose turn away from the wind and the wing depart in yaw the moment it banked. Found with `sim_wing_debug`, not by reasoning; the export stays.
- Stage 4: a landed craft is frozen with the integrator until the throttle comes up, so a wing thrown with L went nowhere until the throw also released the pad hold, the way a quad's take off does.
- Stage 6: ground_settle stops the centre and rubs its velocity down every millisecond, which is right for a quad on a leg and wrong for a wing on a tip, whose weight is half a metre outside the contact. Left to the corner impulses until within 18 degrees of flat, it pivots down and lies flat; the quad path is byte for byte the old one.
- Stage 8: with a second freestyle world the Freestyle card opened a picker; a way card can name a home world, and the wing's is the airfield.
- Stage 9: a target to the left is a positive heading error and needs the left wing down, which is a negative bank in the harness's convention; the first pursuit law had the sign the other way and flew off the field.
- Stage 3: the harness pilot's own maths is JS, not bit specified across engines, so the cross-host gate replays a recorded stick stream (`tests/inputs/wing-baseline.rec`) rather than running the pilot in the browser. Same discipline as the quad's baseline.rec.
