# Fixed wing: the plan, end to end, without a pilot in the loop

Written 2026-09-23 against fdfpv fd8ba52. Every stage ends with a check
a machine can run, so the whole thing can be built and proven without
waiting on anyone. Where the quad project relied on a pilot's judgement,
this plan substitutes published numbers for a real aircraft of the class
and checks the plant against them, the way `scripts/whoop-gates.js`
checks the whoop plant. A pilot's opinion is still the last word on
feel, and stage 11 says what to look for. It is not on the critical path.

## Decisions taken up front

- **Manual mode, no flight controller.** Betaflight 4.5.1 has no wing
  support and iNav is a second port. The sticks drive the elevons through
  rates and expo computed in C, which is how many wing pilots fly. A
  stabilised mode is a later project, listed at the end.
- **A flying wing, not a conventional plane.** Elevons only, no rudder,
  one pusher motor. It is what FPV wing pilots fly, and it is the simplest
  aero model that is still honest.
- **The quad is not touched.** Its plant, its state block, its checks and
  its verify hash stay bit identical. The wing is airframe id 2, a second
  table and a second `plant_step` behind one switch.
- **Determinism rules stand.** No JS maths in the physics path, every new
  function in the fixed libm, Node and Chrome traces identical.
- **The wing has its own track class.** A five inch course is sixty
  metres with gates you can hover through; a wing needs an airfield. The
  board already separates classes.

## Reference airframe

A 1000 mm span flying wing of the ZOHD Dart XL and AR Wing class, the
one most FPV wing pilots start on. Stage 0 records the derivation of
every number below in `docs/WING-STAGE1.md`, the way `STAGE1.md` did for
the five inch, from the formulas in Anderson's *Introduction to Flight*
and the manufacturers' published figures.

| Quantity | Value | Source |
| --- | --- | --- |
| Span, area, mean chord | 1.0 m, 0.22 m², 0.22 m | class geometry |
| All-up mass | 0.65 kg with a 4S 2200 mAh pack | class figure |
| Wing loading | 29.5 N/m² | derived |
| CL max, CD0, Oswald e | 1.10, 0.030, 0.80 | flying wing typical |
| Stall speed, level | 10.4 m/s | derived from CL max and loading |
| Cruise at 50 percent throttle | 16 to 20 m/s | class figure |
| Top speed, level | 32 to 38 m/s | class figure |
| Glide ratio, power off | 9 to 12 | derived from the polar |
| Roll rate, full elevon | 180 to 300 deg/s | class figure |
| Motor, prop, static thrust | 2216 1400 kV, 6x4, 11 to 13 N | manufacturer |
| Inertia Ixx, Iyy, Izz | 0.012, 0.006, 0.017 kg m² | estimated from a flat plate of the mass and span |

The plant has to land inside every band. Numbers that are estimated say
so in the derivation, and the bands are wide where the estimate is.

## Stages and their checks

Each stage is a commit on green. Effort is a working estimate.

**0. Derivation, half a day.** `docs/WING-STAGE1.md`: the aircraft, every
coefficient with its formula and source, the state and unit conventions,
and the check table below written out with pass bands.
Check: the document exists and every band in it has a source.

**1. Deterministic maths, one day.** `sim_atan2` by range reduction and a
minimax polynomial, `sim_exp_neg` for the stall blend, both in
`src/native/libm`. A Node script compares each against `Math` on a dense
grid, and the existing cross-host check gets a wing trace so the module
is proven identical in Node and headless Chrome.
Check: max error under 1e-6 on the grid, and the two hashes match.

**2. The wing plant, four days.** `src/native/plant_wing.c`: a six degree
of freedom rigid body in the same frames as the quad; lift, drag and
pitching moment from angle of attack and sideslip with a smooth stall;
elevon effectiveness with rates and expo from the CLI diff; a single
motor whose thrust falls with airspeed and whose torque rolls the
airframe; a belly landing hull of nose, tail and wingtips through the
existing contact path. `sim_internal.h` gains `SIM_AIRFRAME_WING1000`,
`plant_step` dispatches on the table's kind, the state block reuses the
twenty doubles with the motor in slot 0 and zeros in the other three,
and a new additive `sim_wing_surfaces(out[2])` reports elevon angles for
the renderer. `sim.c` skips `bridge_run` for a wing and maps sticks to
surfaces in C. `sim_wing_launch(speed)` replaces the launch stand with a
hand throw.
Check: builds clean with the vendor tree unmodified; `npm run verify`
unchanged for the quad, hash and all.

**3. The wing's own gates, two days.** `scripts/wing-gates.js` and
`tests/wing-thresholds.json`, on the pattern of `whoop-gates.js`: W1
trim speed at half throttle, W2 stall speed, W3 glide ratio power off,
W4 top speed, W5 roll rate at full elevon, W6 turn radius at sixty
degrees of bank, W7 climb rate, W8 a hand throw at 8 m/s with sixty
percent throttle stays airborne, W9 a throttle chop from cruise glides
rather than tumbles, W10 the five inch unmoved, W11 Node and Chrome
agree. Iterate the coefficients until every band holds. If ten
iterations do not land the plant inside the published bands, stop and
say so: that is a finding about the model, not a reason to widen a band.
Check: `npm run wing:gates` green.

**4. Shell and input, two days.** `configs/airframes.js` gains the wing
with its dims, hull, sweep radius, four cells, camera, a wing tune diff
in `configs/` carrying only rates and expo, and `trackClass: 'wing'`.
The WAYS cards gain Fixed wing. Settings that have no meaning for a wing
are hidden for it: arcade, angle, turtle, launch control. Throw is the
existing launch key. Roll is elevons differential, pitch is elevons
together, yaw is ignored with a note saying why.
Check: `lint:input`, `input:selftest`, `lint:shell` and `lint:catalog`
green; a title card screenshot shows the third way.

**5. Rendering and sound, three days.** `src/render/wingcraft.js`, a
procedural swept wing with elevons posed from `sim_wing_surfaces`, one
prop spun from motor RPM, a ghost variant, a fixed forward camera with
the wing's own field of view; `audio.js` with one motor voice and a wind
noise scaled by airspeed.
Check: `check:craft` with wing pins, `lint:memory`, `music:selftest`, a
screenshot in flight after a scripted throw through `shots.js`.

**6. Collision, one day.** The sweep radius and hull points come from the
airframe's dims, so the wing gets a wide flat hull. `contact:selftest`
gains wing cases: belly landing, wingtip strike, nose in.
Check: `contact:selftest` and `check:craft` green.

**7. The wing track class, three days.** `TRACK_CLASSES` gains `wing`
in `src/trackbuilder/elements.js`, with gate dims of five metres, a
default field of 400 by 300 metres, `gateScaleFor('wing')` of one, a
pass depth of two metres in `race.js`, a WING toggle in the builder next
to 5 INCH and WHOOP, the board's `trackClassOf` mirror and its third
class card, and the strings in both languages.
Check: `check:clip`, `lap:selftest` with a wing course, the board
selftest with a wing track published and a signed time posted.

**8. An airfield, two days.** `src/maps/airfield.js`: a flat open field
of 500 metres with a runway and a row of pylons, built lazily like every
other world, offered for the wing the way the room is offered for the
whoop.
Check: `lint:memory`, `lint:boot`, a screenshot.

**9. End to end without a browser, two days.** A guidance law in Node,
on the pattern of `scripts/lib/flightrig.js`, flies the wing plant
through a three gate wing course, records a ghost with the real
`GhostRecorder`, signs it with a pilot key and posts it to a local board
over the API. The board's own lap check has to accept it. Then the same
lap with a gate skipped has to be refused.
Check: `npm run wing:e2e` green, and the board answers 201 then 422.

**10. Wiring and docs, one day.** CI runs the new checks; the Pages
deploy carries the new map and craft; README and `docs/PLAN.md` say what
exists; the Spanish table gains every new string.
Check: both repos green in CI, `lint:copy` and `strings:selftest` green,
the live site boots with the wing selectable.

**11. Handover, no code.** What a pilot should judge, because no band
can: whether a throttle chop feels like a glide, whether the stall
breaks the way a real wing does, whether roll has the right heft at
speed, and whether the camera sits where a wing camera sits. Each is
written as a thing to try and what would count as wrong.

## Order and total

Stages 0 to 3 are the physics and gate on each other. Stages 4, 5 and 6
can run in parallel once the module exists, one worktree each. Stages 7
and 8 can run in parallel with 5. Stage 9 needs 2, 3 and 7. About four
weeks of work in sequence, under three with the parallel stages.

## Risks, and what is decided about them

- **The bands are the aircraft.** If the published figures for the
  class disagree with each other, the derivation picks one aircraft and
  says which. Bands are never widened to pass.
- **Determinism.** Any new maths that is not bit identical across hosts
  fails W11 and blocks everything after it. That is the point of W11.
- **Feel.** The upstream author rejected the true whoop plant on feel
  after every band passed. A wing can pass every band above and still
  feel wrong. Stage 11 exists so that judgement is asked for, once, at
  the end, with something concrete to fly.
- **The board mirrors.** A third track class touches `validate.js`,
  `plan.js` and the class cards on the board; the mirror checks in the
  board selftest are the guard.

## Later, and out of scope

- Stabilised modes by compiling iNav's fixed wing PID and servo mixer as
  a second module, with the same patches and stubs discipline.
- A conventional plane with a rudder and a tail.
- Wind, which the plant has no notion of today for the quad either.
