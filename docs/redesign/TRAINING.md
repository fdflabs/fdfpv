# Training: from the first stick to the first defence

**Status: PROPOSAL** (2026-10-03), under docs/PILLARS.md sections 18, 19
and 26. Built from what exists; a lesson is a challenge on a course or a
world the game already has, judged by the code that already judges
challenges.

## 1. What exists

| Piece | Where |
| --- | --- |
| Device choice by wiggle, hotplug | src/input/input.js `startPadPick`, the Choose joystick screen |
| Calibration wizard: centre, sweep, throttle, each axis, live gimbals, a raw axis strip, reverse, stick modes 1 to 4 | input.js `CAL_STEPS`, the Calibrate screen |
| How to fly: live sticks per input (keyboard, mouse, radio or gamepad, launch control, touch) | ui.js, the howto screen |
| The first flight hint, shown once | ui.js `setAirSlider` |
| A trainer as the first aircraft | ui.js `FIRST_AIRFRAME` (the Turbo Timber); starters Timber, Cub, Slow Stick |
| Assists: angle mode on quads; Stabilised, Acro, Manual on every plane; Arcade flight style; launch control; mouse flight; touch sticks | configs/registry.js, ui.js settings |
| Challenges judged from the run: gates, rims touched, laps, pack and tank, crashes, on the ground | src/game/progress.js `RunWatch`, seven `CHALLENGES` |
| Courses on the worlds, built and published | the track builder, docs/itaipu-courses |
| Defend the Paraná mission 1, free | src/game/campaign.js |

What is missing is order: these are scattered, and nothing says "do this
next".

## 2. Controllers first, in the owner's order

The controller is the product (PILLARS 26), so training starts at it, in
this order of support:

1. **An RC radio** (a RadioMaster or any EdgeTX or OpenTX radio in joystick
   mode over USB): the pilot's own transmitter. Detected by the Gamepad
   API; calibrated by the wizard; its switches never trigger anything by
   accident (input.js already ignores a latched arm switch).
2. **A gamepad**: the standard layout is known; no calibration needed.
3. **Keyboard and mouse**: mouse flight with its sensitivity, expo and
   centring.
4. **Touch**: two on screen sticks.

The first screen a new pilot meets, before any card, asks one question:
"What will you fly with?" with the four, the live device already lit if
one is plugged in. A radio goes straight to the calibration wizard; the
others to How to fly on their own tab. Skippable, and never asked again
once answered.

## 3. The curriculum

Five tracks. Each lesson is one objective on one aircraft in one place,
judged by `RunWatch` (gates, rims, laps, ground, crash, pack), passed or
not, with the replay one press away. Lessons in a track are in order;
tracks are not: a pilot picks.

### Track 1. First flight (everyone)

| Lesson | Aircraft, place | Passed when |
| --- | --- | --- |
| Sticks | none, How to fly | each stick moved through its range (the gimbals already show it) |
| Take off and fly straight | Turbo Timber, Stabilised, the Swiss valley strip | airborne 20 s without touching the ground |
| Turns | Timber, Stabilised | a full circle left and right round a pylon |
| Land | Timber, Stabilised | on the ground, no part past its limit |
| The same, unaided | Timber, Acro | the three above in Acro |

### Track 2. Fixed wing

| Lesson | Passed when |
| --- | --- |
| Throttle as height | a circuit at constant height with the throttle |
| Coordinated turn (the Cub's rudder) | a figure eight on the Cub, rudder used |
| The stall | a stall entered and recovered above a floor height |
| Approaches | three landings on the strip in a row |
| Dead stick | `deadstick` (exists: land with the motor off) |

### Track 3. Multirotor and FPV

| Lesson | Passed when |
| --- | --- |
| Hover | the five inch in angle mode, in a ground box, 15 s |
| Throttle discipline | a climb and a stop at a height mark |
| Acro | the hover box in acro |
| Gates | a casual course, every gate, no rim |
| Precision | `hoops_10` (exists: ten hoops without a touch) |

### Track 4. Racing

| Lesson | Passed when |
| --- | --- |
| A clean lap | `first_course` (exists) |
| A lap under a time | the course's bronze (PROGRESSION.md 4) |
| Racing a ghost | beating your own ghost |
| Racing a pilot | a race finished in a room (any place) |

### Track 5. Defence (behind the war's consent)

| Lesson | Passed when |
| --- | --- |
| Interception | a Striker caught in a training stage (the stage engine's own spawn, no war round) |
| Tracking a target | a target held in the avionics camera for 10 s |
| Working together | mission 1 won with another pilot, or alone |

Interception and tracking need the stage engine (#363) to run a one
attacker practice stage; they ship after it.

Each track ends in its certification (PROGRESSION.md 7): Multirotor,
Fixed wing, Glider (the Radian and the NRJ's thermals, a track of three
after the fixed wing one), Racing, Defence.

**Changed from the thread:** the thread lists formation flying and combat
fundamentals for everyone; formation needs AI pilots (none exist) and the
war is defend only, so "combat fundamentals" are interception and
tracking, and they sit behind the consent like the war.

## 4. Experienced pilots

An FPV or RC pilot skips: every track's first lesson offers "I fly
already", which passes the track's basics on one demonstration (the
track's last basic lesson flown once). Nothing is gated on training: every
card, every aircraft the level opens, the war after its consent, from the
first minute.

## 5. Assists inside lessons

Each lesson names its assist (Stabilised, angle mode, Arcade where a quad
lesson allows) and says when the next lesson takes it away. New assists
planned with the curriculum: a landing aid (the glide path drawn to the
strip), and a racing line (the next gate's direction on the HUD). Both
off outside lessons unless the pilot turns them on.

## 6. Where it lives

Training is a row in Flight Club ("Learn to fly") and the first thing a
new pilot is offered after the controller question. A lesson is a solo
session like any other (SESSIONS.md): the registry gets a `training`
activity whose setting is the lesson, so no new lobby, screen family or
flow.

## 7. Checks

A lesson is data (aircraft, place, assist, objective) and its judgement is
`RunWatch`, so `progress:selftest` can run each objective's judge against
recorded inputs in Node (the crash and lap harnesses already replay input
streams through the plant). The first screen's device question gets a
headless case in `flow:check`.

## 8. Phases

1. The controller question and its routing (radio to the wizard).
2. Track 1 and Track 4 (they use only what exists).
3. Tracks 2 and 3, with the landing aid and the racing line.
4. The Glider track.
5. Track 5, after the stage engine (#363).

## 9. Lead decisions 2026-10-13

The lead's decisions on what sections 3 and 7 leave unsaid. They are
product rules, not physics: where a number is a flight figure it is the
aircraft's own derived one, cited. Each lesson is data in
src/game/training.js and is judged in `training:selftest` on recorded
inputs and the flight's event log, each with a near miss that fails.

- **The `training` activity** in src/share/modes.js is the sessions
  lane's: a row there needs a lobby in src/main.js `LOBBY_GAMES` (the
  shell throws at load without one) and changes the room wire's setups.
  Until it lands, lessons go in by the Free Flight and Track Day cards.
- **Racing a pilot** (`race_pilot`): a race finished in a room with at
  least one other pilot on its grid, so two racers. A race's grid is
  people only (no AI pilots race). The shell logs it as a `round`
  event, game `race`, with the grid's size, once per race and only
  for a pilot whose finish the room recorded. The lesson opens Track
  Day's lobby when a rooms server is there.
- **A lap under a time** (`race_bronze`): a lap at the course's bronze
  or better, read from the `medal` the lap event carries.
- **Certifications**: a track's, earned when every lesson of it is
  passed, an "I fly already" pass included, and awarded with a toast on
  the lesson that completes it. Stored as `progress.certs` (track to the
  time it was earned), synced, merged as the union at the earlier time.
  A stored one is never taken back, so a track is listed in `CERTS` only
  once every lesson this document gives it exists: Multirotor and
  Racing now. Fixed wing waits on its coordinated turn, Glider on its
  track, Defence on the stage engine. First flight has none.
- **Gates** (track 3) is not built: the tree's casual sky tracks are
  offered only to a fixed wing (src/ui/items.js `newTrackRows`), so a
  quad has no casual course to fly. Casual sky tracks for quads are a
  product gap. Multirotor's certification is its other four lessons.
- **Sticks** (`first_sticks`): each stick held at each end of its
  travel for 1 s, any order: roll, pitch and yaw at 95 percent either
  way, the throttle at 95 percent and at 5 percent. 95 percent and 1 s
  are the lead's product numbers; the calibration wizard does not
  measure them (src/input/calibrate.js asks 55 percent of raw travel,
  steady 0.9 s, which is how it finds an axis, not how far a pilot can
  push one). It is judged on the channels the plant gets each frame, so
  it is flown on the Timber in Stabilised on the Swiss valley rather
  than on How to fly (src/ui/ui.js), which is not a flight and has no
  judge. "I fly already" on First flight does not cover it: the
  unaided round asks nothing of full travel.
- **The stall** (`wing_stall`): the airspeed under the aircraft's
  derived clean stall (configs/airframes.js `stall`, the Timber's 7.20
  m/s from tests/timber-thresholds.json T2), then back up to 1.3 times
  it, never under 30 m over the ground in between. 1.3 is
  `AIR_START_STALL_MARGIN`, the margin the air starts and the Bramor's
  catapult already use; 30 m is the lead's floor, the middle of the
  height lesson's 25 to 35 m band. Airspeed is the plant's velocity
  less the air it stepped in (the mean wind and the rising air, gusts
  left out). Flown in AS3X, because SAFE Select caps
  the pitch and levels the wings, which is the thing being taught away.
  Known limit: the rule is speed, the plant stalls on angle of attack,
  and `stall` is flaps up: with flaps down the real stall is slower
  (T4, 6.31 m/s), so a pilot flying slow on full flaps may count a stall
  the wing did not have.
- **Coordinated turn** is not built. The lead's rule is a figure eight
  of two circles with the slip under "the HUD's own ball threshold",
  but the HUD has no slip ball and no threshold anywhere in the tree.
  The slip itself can be read from the plant (the velocity in the body
  frame); what is missing is the number that says how little slip is
  coordinated. Until it is given, Fixed wing has no certification.
