# STAGE1.md: flight feel

FDFPV is made by [fdflabs.com](https://fdflabs.com) and is free software
under GPLv3. NOTICE records whose work it stands on.

## Deliverable

A grey ground plane, a horizon reference, a quad, and a stick input. You can hover, punch out, roll, flip, powerloop, descend into your own propwash, and crash. No gates, no lap timer, no menus, no textures, no sound.

## Reference airframe

The five inch was removed from the game on 2026-10-03 at the owner's request, and no pilot flies it. Its plant, plant 0, stays in the module as the reference every check below flies, so this section still describes what `npm run verify` measures.

One preset only in Stage 1. A 5 inch freestyle quad:

- All-up mass 0.71 kg
- Battery 6S, 1300 mAh, nominal 22.2 V, 4.20 V per cell charged, 3.50 V per cell empty
- Four motors, 2207 class, at the corners of a 220 mm diagonal: T-Motor's
  F60 Pro V 1950 kV as its maker measured it
- 5 inch tri blade propellers, T-Motor's T5147 (5.1 x 4.7 x 3) as measured
  on that motor
- Thrust-to-weight 9.7 to 1 at full charge on the pack, standing
- Inertia tensor diagonal, roll 0.0035, pitch 0.0038, yaw 0.0068 kg m squared

The last two lines used to read 4.5 to 1 and 0.0055 / 0.0060 / 0.0110, and
neither was ever what the code did. They are corrected to what
`src/native/plant.c` builds and `scripts/flightcheck.js` measures, because
the code is the one with a derivation: its thrust and drag coefficients are a
physical pair fixed by momentum theory with an enforced figure of merit, and
every band in the check table below was fitted against them. The old figures
also do not describe this aircraft. A 650 g 5 inch on 6S with 1900 kV motors
and tri-blades is 9 to 12 to 1 in the real world; 4.5 to 1 is a heavy 7 inch,
and 0.0055 / 0.0060 / 0.0110 is a 7 inch's inertia too. See PROGRESS.md.

The motor, prop and thrust lines moved again on 2026-10-01, by the owner's
decision, from an unnamed stand row (1900 kV, 5 x 4.3 x 3, 26,000 rpm, 1.5
kgf, 33 A; 8.4 to 1) to T-Motor's published F60 Pro V 1950 kV on its T5147
at 24.7 V: 1990.4 g, 31,401 rpm, 49.3 A. Check 6's band moved with it, and
it is the only band that did: 55 to 85 m was set by the stub harness of 11
August before there was a plant, and the plant was fitted into it. On the
measured row the five inch climbs 96.4 m; the band is that, with the old
band's half width over its centre, 21.4 percent, either side. Every other
band holds the corrected five inch unchanged. docs/STOCK-5INCH.md has the
derivation and the numbers before and after. The same day each prop's
thrust and torque against axial speed became its own APC curves
(docs/PROP-CURVES.md); check 6 moved again, to 95 to 147 m by the same
rule around the 121.0 m the five inch then climbs, and check 7 to 35.7 to
56.8 m/s from four published top speed peaks. Both bands rest on no
instrumented level run or punch-out log, which docs/PROP-CURVES.md lists
as open items.
The mass then moved twice more, 0.65 to 0.68 and then 0.71 kg on the
owner's request after a pilot asked for the same quad a little heavier,
which is where 8.4 to 1 comes from: thrust unchanged, sixty grams more
to carry.

## Architecture

```
src/native/          C, compiled to WASM by Emscripten
  sim.c              entry points, fixed-step integrator
  plant.c            motors, props, aero, battery
  bridge.c           Betaflight gyro in, motor out, config shim
  libm/              fixed-precision maths, no libc libm
patches/             patches applied to vendor/betaflight at build
src/render/          Three.js, main thread, read-only view of state
src/input/           WebHID first, Gamepad API fallback
tests/               owned by Loop A, read-only to Loop B
```

The physics module is one deterministic unit: Betaflight's control loop and the plant model in the same compiled module, stepped together at 1000 Hz. Rendering reads a snapshot and interpolates.

## Control loop

Compile from `vendor/betaflight`: `pid.c`, the rates curves (Betaflight, Actual and KISS), the filter chain, the mixer, and rc command handling. Stub the hardware abstraction layer with the simulated gyro and motor outputs. Config comes in as a Betaflight diff, parsed and applied at init.

## Plant model

In order of contribution to feel. Implement in this order.

1. **Motor first-order lag.** Time constant 10 to 30 ms, configurable. Without it everything feels unnaturally crisp and nothing else you do will fix that.
2. **Thrust and torque as functions of RPM, not throttle.** Thrust proportional to RPM squared, torque proportional to RPM squared with a separate coefficient. Motor RPM comes from a first-order response to commanded voltage, loaded by prop drag torque.
3. **Battery sag.** Internal resistance per cell, voltage drops under current draw, available RPM drops with it. This is why a quad feels different at 3.5 V per cell and it is a large part of what pilots read as "authentic".
4. **Prop drag torque.** Yaw coupling falls out of this for free rather than being faked.
5. **Airframe drag.** Roughly quadratic, with separate frontal and plan-area coefficients so it decelerates properly when you flare.

Deferred to Stage 2, do not build now: propwash turbulence, inflow and advance ratio effects, ground effect, wind.

## Input

WebHID first: open the radio as a raw HID device, take `inputreport` events at the endpoint's declared rate, typically 125 Hz to 1000 Hz. Write timestamped samples into a ring buffer. The integrator consumes each sample using the sample's own timestamp, never arrival time, because irregular intervals feeding a fixed-step integrator is what people perceive as floaty, not low sample rate.

Gamepad API is the fallback, wired but not tuned. Keyboard is not required.

The same code path must accept a recorded input file, which is how every check below runs headless.

## Verification checks

Every check is a numeric band in `tests/thresholds.json`. `npm run verify` runs all of them and exits non-zero if any fails.

| # | Check | Method | Pass band |
|---|---|---|---|
| 1 | build-clean | `npm run build:wasm` exits 0, `git diff --stat vendor/betaflight` empty | exact |
| 2 | determinism-repeat | Replay `baseline.rec` twice in one process, SHA-256 the state trace | identical |
| 3 | determinism-cross-host | Replay in Node and headless Chrome, compare hashes | identical |
| 4 | frame-independence | Same input at simulated render rates 30, 60, 144, 240 Hz | all four traces identical |
| 5 | hover-throttle | Trim to steady hover at 4.0 V per cell | 0.20 to 0.30 |
| 6 | punch-out | From hover, full throttle 3.0 s, altitude gained | 95 to 147 m |
| 7 | terminal-velocity | Level, full throttle, 20 s, speed plateau | 35.7 to 56.8 m/s |
| 8 | motor-step-response | Step one motor 0 to 100 percent, time to 63 percent of final RPM | 10 to 30 ms |
| 9 | rate-tracking | Full roll stick, steady-state roll rate vs configured max rate | within 3 percent |
| 10 | yaw-coupling | Hard roll at constant throttle, yaw drift | build-tolerance scale (0.04 to 0.60 deg), correct sign. A symmetric quad cancels this coupling exactly; only asymmetry produces it, so the check bands the modeled tolerance rather than demanding a drift no real quad shows. |
| 11 | battery-sag | Identical punch-out at 4.20 V and 3.60 V per cell, peak RPM | 3.60 V run lower by 4 to 15 percent |
| 12 | diff-passthrough | Parse two Betaflight diffs differing only in rates, run identical input | resulting max roll rates differ by the ratio in the diffs, within 2 percent |
| 13 | console-clean | Browser harness run | zero errors, zero warnings |
| 14 | audio-bed | Real key gesture into the real shell, then read the live audio graph | context running, engine and music graphs attached, music bus above zero at default settings, scheduler advancing, node count inside the 64 budget |

Check 12 is the one that catches a bad port.

Check 14 exists because every other audio claim in this project is measured
by `tools/audio/render.js`, which builds its own graph on an
OfflineAudioContext. That makes the spectral claims reproducible and it also
means the shell could stop building a graph at all without a single check
noticing, which is what happened: a user reported that no music played. This
check drives the page the way a player does, with a real key over the
DevTools protocol, because the shell wakes audio from `input.onKey` and a
window `pointerdown` listener and browsers only honour a real gesture. It
asserts that the bed exists and runs. It deliberately does NOT assert a
tempo: the scheduler's step counter advances in lookahead chunks and two
consecutive 4 s windows measured 46 and 49 steps on a 174 BPM bed, so tempo
stays with the probe, which tests it against a shuffled null hypothesis. If your own diff does not change the sim in the direction you expect, the Betaflight integration is wrong no matter what the other checks say.

## Not in Stage 1

Tracks, gates, lap timing, collision beyond a ground plane, other aircraft, networking, UI, settings persistence, Web Workers, SharedArrayBuffer, multiple airframe presets, visual polish of any kind.
