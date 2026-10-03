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
