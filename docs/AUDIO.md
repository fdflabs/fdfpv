# Audio: audit, design and the physically driven prototype

The owner, 2 October 2026: "I want to change all of them for real audio,
that's responsive, doesn't feel tiring, done right". The plan has four
phases: (1) audit, design and measurement tools, (2) a prototype of the
motor and prop sound and the wind for the 5 inch and the Striker (prop and
jet) with a listening page, (3) the owner's verdict, (4) roll out. This
file is phases 1 and 2. Nothing here reaches a player: the prototype is
behind a flag that is off (section 8).

Every figure below is from a command in this repository, named next to
it. A loudness is LUFS (ITU-R BS.1770-4) unless it says dBFS.

## 1. Inventory: every sound in the game

All synthesis lives in one class, `MotorAudio`, in `src/render/audio.js`
(line numbers are this branch's). Recorded audio is three things: the
music crates, the war radio's voice lines and the war's two music tracks.

| Sound | Where | Triggered by | Made of | Gain staging | Nodes |
| --- | --- | --- | --- | --- | --- |
| Motors, all aircraft | `attachVoices` l.989, `update` l.1595 | every frame, `src/main.js` l.15257, RPM from the state block `st[14..17]` | synthesized: per motor a PeriodicWave oscillator (5 harmonics, or the glow and fan waves) at the blade pass, one lowpass, gain, pan; a shared detune noise | voice law `0.139 + 0.139 x` (6 dB span), `FLIGHT_STEM` 0.3, Motors setting (default 5 of 10), highpass 60 Hz | 18 (4 x 4, plus detune source and gain) |
| Wind | `attachVoices` l.1051, `update` | every frame, airspeed (ground speed: `speedNow`) | synthesized: a 1 s looped noise buffer, lowpass at 900 Hz (quad) or 600 to 1700 Hz (wings) | `0.085 + 0.71 r^2 + 0.17 loudest`, `FLIGHT_STEM`, Wind setting | 3 |
| Crash | `event('crash')` l.1110 | `main.js` l.7276 (`feelImpact`, impact over `IMPACT_FULL` 12 m/s above 0.45) and l.9206 (the glitch catch) | the shared noise loop through a lowpass swept 1800 to 220 Hz | peak 2.6 x level into the soft clip, ducks motors to 0.28 and music to 0.25 | 3, shared |
| Frame graze, light hit | `event('clip')` | l.7276 (below 0.45), l.7474 | the same noise chain and the cue triangle oscillator | 1.1 and 0.6 | shared |
| Gate pass click | `event('gate')` | l.14384 | the same two voices, 4.2 kHz knuckle and a falling tick | 1.35 and 0.75 | 2, shared |
| Land, takeoff blips | `event('land' / 'takeoff')` | l.7497, l.14038, l.9375, l.10385, l.13684 | the cue triangle oscillator | 0.62 | shared |
| Wreck: snap, crunch, chip, splash | `wreck()` l.1238 | `main.js` l.8758 to 8767 (part breaks, fpvfail), l.8870 (sinking) | a band passed copy of the noise loop | up to 3.2 x level | 3 |
| Combat SCHWING | `schwing()` l.1295 | l.2435 | scrape, whoosh, shing, a 4 partial ring | the cue peaks into the soft clip | 18 |
| Catch the Ace coin | `coin()` l.1348 | l.5287 | the SCHWING's gate square, retuned | 0.21 | 1 |
| War explosion | `boom()` l.1392 | l.3484, with level and distance | re-uses the SCHWING's and coin's voices: a falling thump, a roar, a crack near, a crackle; delayed d / 343 s, darker and quieter with distance | `lv / (1 + d / 250)`, ducks the flight | 0 (borrowed) |
| Menu taps | `ui()` l.1465 | l.11517 | cue oscillator and noise chain | 0.085 to 0.18 | shared |
| Binaural focus tone | `attach` l.803 | the Focus setting (off by default) | two sines, 1000 and 1006 Hz | 0.15 x setting | 5 |
| Music bed | `src/render/music.js` `attach` l.225 | always, menus and flight | recorded: 16 titles in `assets/music`, Opus in WebM with an mp3 fallback, one `MediaElementSource` | flight `MUSIC_BUS` 0.60 x setting, menu `MENU_BUS` 0.20; ducked by cues | 4 |
| War music | `src/render/warradio.js` `music()` l.342 | the war's countdown and fight | recorded: 2 tracks, `assets/audio/war/music` | an `HTMLAudioElement` BESIDE the graph: `el.volume` = master x music x 0.5 or 0.22 | 0 |
| War radio voice | `warradio.js` `say()` l.288 | `main.js` l.3080, war events | recorded (generated TTS): 108 lines a language, en and es | `el.volume` = master; ducks motors and wind to 0.55; ducked 10 dB under voice chat | 0 |
| Voice chat | `src/share/voice.js` | push to talk | WebRTC, its own AudioContext | distance law 30 to 400 m, floor 0.3 | its own graph |
| Replay and movie sound | `src/replay/crashcam.js` `sound()`, `src/replay/soundtrack.js` | replay and export | a second `MotorAudio` | as live | its own |

What is NOT voiced at all: another pilot's aircraft (peers are silent),
the war's attackers in flight (only their explosion is heard), the
environment (the ambience stem was removed), the surface a crash hit
(grass and concrete sound identical: the OLD crash renders below are the
same to the hundredth of a LU), and the jet: the Striker's turbojet plays
the F-16's ducted fan voice (`edf`, `configs/airframes.js` l.1630).

### Findings the audit turned up

- **The noise is not noise.** Every noise buffer in `audio.js` is filled
  by `s = (s * 1103515245 + 12345) & 0x7fffffff`. In JavaScript that
  product passes 2^53 and loses its low bits, and the sequence repeats
  every **10466 samples, 0.218 s at 48 kHz** (measured: `node -e` over the
  recurrence from the wind's seed). The wind, the crash and the wreck are
  a 4.6 Hz loop, which the ear hears as a buzz or a hum: this is likely
  part of the "hum" the owner reported. The repetition metric (section 9)
  sees it: OLD hover scores 0.706, NEW 0.077. The fix is `Math.imul`;
  it is not made in the shipped voices here because that is phase 4.
- **The live graph is AT its budget.** The shell with the flag off, title
  screen after a key: 64 nodes, exactly the cap in
  `tests/thresholds.json` `audio-bed.max_nodes` (scripts/shots.js, see
  section 9). Nothing can be added to the shipped graph without removing
  something.
- **The motors are not quieter than the music.** The music crate measures
  -12.9 to -17.1 LUFS a title (ffmpeg `ebur128`, all 16), a 4.2 dB spread
  with no per title normalisation. Through the flight bus (0.6 x 0.5) and
  the master at the default volume (0.6 x 0.85) the bed sits near -30
  LUFS, and the OLD motors at hover measure -27.2 LUFS: the motors are
  about 3 dB over the bed, the opposite of the owner's "70 percent quieter
  than the music".
- **The war audio bypasses the mix.** Its music and voice play on media
  elements outside the graph, so the master limiter, the ducks and any
  loudness normalisation never see them. The combat track is -10.9 LUFS
  with a +1.9 dBFS sample peak in the file itself.
- The wind is fed ground speed, not airspeed, and has no sideslip.

## 2. The graph and its limits

    sources ─> motorBus ─> highpass 60 Hz ─┐
    noise   ─> windBus  ───────────────────┼─> flightDuck ─┐
    cues, wreck, SCHWING, coin ─────────────────────────────┼─> tanh soft clip (2x) ─> master (level x 0.85) ─> out
    music (MediaElementSource ─> level ─> swap ─> duck) ────┘
    war music and voice: media elements, outside the graph

Limits: 64 nodes (checked by verify check 14 and `npm run war:boom`); one
noise buffer shared by everything; a tanh as the only peak control (no
limiter, so a loud sum is distorted rather than turned down); all ducks
are fixed depth envelopes; no distance, delay or Doppler except the
explosion's arrival delay.

## 3. What the sim exposes, per frame

From the state block (`src/native/sim_abi.h`, `SIM_STATE_DOUBLES` 20),
read by `main.js` every frame:

- **per motor RPM**, `st[14..17]`, Betaflight order; a fixed wing's
  engine, glow or turbine shaft is slot 0. The turbine's spool lag is in
  it (the plant's `fan_spool`, idle 25,000 to 125,000 rpm over 2.5 to 5 s).
- velocity (world) `st[4..6]` and attitude quaternion `st[7..10]`, so body
  frame velocity: airspeed, **sideslip**, **angle of attack**, and the
  **descent rate along the thrust axis** that prop wash depends on.
- body rates `st[11..13]`; pack voltage `st[18]` and **pack current**
  `st[19]` (total, not per motor).
- not per frame: per motor current and throttle (the throttle is the
  shell's stick input, available in `main.js`); the wing's alpha, beta and
  thrust through `sim_wing_debug`; the power state (fuel, lean run) through
  `sim_power_state`.
- events: ground and obstacle contacts (`sim_ground_contacts`,
  `sim_obstacle_contacts`), the surface **material** of a contact
  (`SIM_SURF_*`, with `sim_material_info`: friction, restitution,
  stiffness and **hardness**, concrete 1, grass 0.05), part breaks; the war's
  events with positions (`roomWar`, `warBoomHeard` gives level and
  distance).

## 4. The model per source class

The prototype is `src/render/engine-worklet.js`, one AudioWorkletProcessor.
Its numbers are physics where there is a source and tuning where there is
not; the tuning ones are marked ESTIMATED.

### Multirotor (the 5 inch, `quad`)

Per motor, from that motor's own RPM, so four motors beat against each
other the way they do:

- **Blade pass tone**: fundamental `B rpm / 60`, B = 3 (the plant's
  5 x 4.3 x 3 prop), harmonics falling at 12 dB an octave at rest and 9 dB
  when the prop is loaded (thrust proxy `(rpm / rpm_hover)^2` plus how fast
  the motor is being driven up). A prop biting harder is brighter, which is
  the "punch" a pilot hears.
- **Shaft orders**: every revolution's harmonics between the blade pass
  ones, a few percent, from blade to blade imbalance (each motor seeded
  differently, so four props are four props). They are what keeps the tone
  from being a synthesiser's comb.
- **Motor whine**: the electrical frequency `(poles / 2) rpm / 60`, 14
  poles (12N14P, the 2207 class) and its second harmonic, its level
  following the pack current shared over the motors.
- **Broadband blade vortex noise**: one band of noise near five blade
  passes, level with tip speed, amplitude modulated at the blade pass
  (the "chop").
- **Prop wash**: descending along the thrust axis into the rotors' own
  wake. With `x` the descent rate over the induced velocity at this RPM
  (7.2 m/s at hover: 1.6 N a motor through a 5.1 in disc,
  `v = sqrt(T / (2 rho A))`), the vortex ring state is around `x = 1`
  (Johnson, Helicopter Theory, 4.1); the effect is a bump there: a 5 to
  15 Hz random modulation of the tones and a low rumble.
- **Loudness law**: level as RPM to the 0.6, so hover to full (3.1 times
  the RPM on this plant) is about 6 dB, the span the owner approved for the
  shipped voice. The aeroacoustic power law (fourth to sixth power) would
  be 30 dB, which is the fatigue.

### Fixed wing: piston (the Striker's 110 cc boxer twin, `boxer2`; the glow engines)

- **Firing**: a two stroke boxer twin's cylinders fire together, so one
  pulse a revolution: 83 Hz at 5,000 rpm. ASSUMED: the plant and
  `docs/COMBAT-DRONES.md` 7.3 say "110 cc boxer twin" without the firing
  order; the common 110 cc gasoline twins (DLE-111 class) are two strokes
  on a 180 degree crank firing together. A four stroke model (`glow4`) fires
  every other revolution.
- **Blowdown pulse** per cycle (the same physics as the shipped glow
  waves, Heywood 1988), each cycle's strength and timing varied, most at
  idle, with an occasional miss at idle (a two stroke's four stroking).
- **Muffler**: three resonators (115, 420, 1500 Hz, ESTIMATED), struck by
  each pulse, brighter under load.
- **Prop**: the 30 x 14 two blade's blade pass and harmonics, and its
  broadband, by the same recurrence as the quad.

### Fixed wing: turbojet (the Striker's jet, `turbojet`)

- **Spool**: the plant's shaft RPM, 125,000 at full, with its seconds of lag.
- **Compressor whine**: 14 blades (7 main, 7 splitter, ESTIMATED for the
  class) at the shaft rate: 5.8 kHz at idle, sweeping out of hearing as it
  spools (faded above 16 kHz). The idle whine on the rail and its rise are
  the turbine's signature.
- **Jet mixing noise**: broadband, peaking at a Strouhal number of 0.2 on
  the jet velocity over the nozzle (0.06 m, 420 m/s at full, ESTIMATED),
  level with the jet velocity, with a first order tilt above 2.5 kHz.
- **Combustion rumble** with the fuel flow.

### Wind and airflow

Broadband, decorrelated left and right, level with airspeed to the 1.2
(aerodynamic noise goes as a high power; compressed for the same reason as
the motors), its corner rising with speed to 1.8 kHz, a 40 Hz high pass,
louder and gustier in a **sideslip** and biased to the side the air comes
from.

### Impacts

Struck by the impulse (N s), the surface's hardness and the closing speed:
a noise burst whose decay (60 ms on grass, 25 ms on concrete) and
brightness follow hardness; a thump, more on soft ground; four plate modes
of the frame (820, 1930, 3310, 4870 Hz, ESTIMATED for a 5 mm carbon X)
struck harder on a hard surface. The level rises with hardness as well as
impulse, because a hard surface stops the craft in a fraction of the time,
which is a far higher peak force. Every strike draws its own mode tuning
and decay: no two hits are the same samples.

### Explosions (phase 4)

The existing `boom()` already delays by d / 343 and darkens with distance.
Phase 4 moves it onto the propagation below (so it gets Doppler, air
absorption and the ground reflection for free), gives it a layered body
(near crack, mid roar, far rumble) whose balance is set by distance, and
makes it duck the music and the wind (section 6).

## 5. Propagation

Implemented in the worklet for a source off board (any `dist` over 0.5 m):

- **Delay and Doppler from one mechanism**: the source is written into a
  1 s delay line and read back `d / 343` seconds late with fractional
  interpolation. A delay that shortens is a pitch that rises, so the
  Doppler shift is exact and needs no separate computation.
- **Distance**: spherical spreading, referenced so a source at 16 m is as
  loud as on board (`REF_M`): a 20 m pass is then about as loud as the
  cockpit, and another aircraft is never louder than the pilot's own.
- **Air absorption**: a lowpass whose corner falls with distance,
  `24 kHz x (10 / d)^0.7`, within a few dB of ISO 9613-1's 0.03 dB/m at
  4 kHz and 0.1 dB/m at 8 kHz (20 C, 50 percent humidity) from 10 to 300 m.
- **Ground reflection**: an image source under the ground at half pressure,
  its own delay, darker. This is the comb sweep heard in every real fly-by.
- **Early reflections near large surfaces** (the dam, canyon walls): phase
  4. The cheap form is one more image tap for the nearest large plane the
  map already knows (a height field or the dam's face), at its own delay
  and a wall absorption; no reverb node.
- **Occlusion**: phase 4, only if cheap: one ray from the listener to the
  source against the terrain the collision code already queries, a lowpass
  and 6 to 10 dB when blocked.

## 6. The mix, and how it stops being tiring

### Loudness targets (default volume 6, master 0.51)

| Category | Target | Why |
| --- | --- | --- |
| The pilot's aircraft, steady (hover, cruise) | -27 LUFS integrated | the instrument a pilot flies by: always there, never the loudest thing; leaves room for music under and the radio over |
| The pilot's aircraft, hardest flying (punch, dive) | integrated no louder than -22, short term (3 s) at most -18 | responsive (about 6 dB from hover to full) without a loudness jump that tires |
| Air (wind) at top speed | about -28 alone | equal partner of the motors at speed, never a hiss over them |
| Impacts | momentary (400 ms) at most -14 | heard through full throttle, not a jump scare |
| Music bed, flight | -30 (as now) | under the aircraft; phase 4 normalises every title to this, the crate spreads 4.2 dB today |
| War radio voice | -24 | over the aircraft, the one thing that must be understood |
| Explosions, near | momentary at most -12 | the biggest thing in the game, by 2 dB, not by 12 |

The whole mix then lands around -23 LUFS, EBU R 128's figure for
programme heard at home, a level a headphone listener can sit in for an
hour. Platform guidance for games is in the same range (Sony's ASWG-R001,
-24 LUFS for console titles). These are integrated figures at the default
volume; the volume setting moves them all together.

### Mechanisms

- **Master limiter** ahead of the soft clip: a fast, high ratio
  compressor holding the sum under -6 dBFS, so the tanh is a safety net and
  not a sound. True peak at most -1 dBTP is a bar on every render.
- **Ducking**: the cues already duck the motors and wind; phase 4 adds a
  sidechain style duck of the music and ambience under explosions and
  impacts, and routes the war's media elements through the graph so they
  are ducked and limited too.
- **2 to 5 kHz harshness control**: the band the ear is most sensitive in
  and tires in first. Every source is shaped to keep its tones out of it
  (prop harmonics fade between 6 and 9 kHz, steep slopes, the jet's tilt,
  the wind's 1.8 kHz corner) and the engine output carries a dynamic band
  guard: when the 2 to 5 kHz envelope exceeds 30 percent of the whole, the
  band is pulled down, by at most 9 dB. A bar on every render: at most 35
  percent of the A weighted power in that band.
- **Variation, no identical repeats**: every noise is a real, seeded
  xorshift, not a loop; four motors are four seeded props; every engine
  cycle and every impact draws its own variation. Measured by the
  repetition metric.
- **Per category volume sliders in Settings**: Motors, Wind and Music
  exist. Phase 4 adds Effects (impacts, explosions, cues), Radio (the war
  voice) and Other aircraft, each landing on its own bus, which the node
  budget allows once the worklet has replaced the 21 nodes of the motor and
  wind chains.

## 7. Recordings, licences and the download budget

Phase 2 ships **no recordings**: every prototype sound is synthesized, so
it adds nothing to the download and needs no licence. Recordings are for
phase 4, where synthesis is weakest: impact sweeteners (carbon cracks,
gravel skitter), explosion bodies, ambience beds.

- **CC0 only by preference**, Freesound's CC0 filter first: no attribution
  is legally needed, but every file is still credited in a CREDITS.md next
  to it (the pattern `assets/audio/war/CREDITS.md` set, with sha256 pins and
  a CI check, `npm run voice:check`). CC BY is acceptable with its
  attribution shown in the game's credits.
- **Sonniss GDC bundles are out.** Their licence (read 2026-10-02,
  https://sonniss.com/gdc-bundle-license/) forbids supplying "the sound
  effects as sound effects to any other person", whether "on their own or
  as part of ... an asset pack, project template, software development kit
  or anything similar". This repository is GPLv3 and the site publishes
  the whole tree, so every raw file in it is redistributed. A Sonniss
  sound may only ever be baked into something that is not the sound.
- Not to be repeated: `NOTICE` records the music crate's licence as NOT
  RECORDED. Any new file without a recorded licence does not go in.

**Download budget.** Today: music 42 MB (webm, which a modern browser
loads; 50 MB as mp3), the war's music and voice 4.6 MB (webm). Phase 2
adds: the worklet, about 30 KB of JavaScript, loaded only with the flag
on. Phase 4's recordings: a budget of **1.5 MB** in total, Opus at 64 to
96 kb/s mono, loaded lazily with the world that needs them. The
listening page's traces (`tools/audio/flights.json`, 366 KB) are a
developer file; the page fetches them only when opened.

## 8. The prototype, and how to hear it

Behind a flag, **off by default**:

- in the game: `?audiolab=1` on the URL, or `localStorage
  'fdfpv.audiolab' = '1'`, before the first key press;
- in code: `MotorAudio.setLab(true)` before `attach()`.

With it off, `attach()` builds exactly the graph it always did (the old
chains moved into `attachVoices` unchanged). With it on, the four motor
chains and the wind chain (21 nodes) are not built; one AudioWorkletNode
(`src/render/engine-worklet.js`) with three outputs (engine onto the
Motors bus, air onto the Wind bus, impacts beside the cues) and a limiter
replace them. Per frame state goes in as AudioParams, never port
messages, so an offline render hears exactly what the live page does.
`main.js` adds the body frame velocity and the pack current; the Striker
says which engine it has (`labModelForCraft`).

**The listening page**: `tools/audio/listen.html`. Run `npm run serve`,
open http://127.0.0.1:8000/tools/audio/listen.html, and press OLD or NEW
on any flight. Both are rendered in the browser through the real graph
from the same plant trace, and played matched to -23 LUFS (never past a
-1 dBTP peak), so the comparison is of character, not of level: a flight
on its integrated loudness, a fly-by on its pass (loudest 400 ms).

## 9. Measurement tools, and the before and after

- `tools/audio/metrics.js`: BS.1770-4 loudness (integrated, gated;
  short term 3 s and momentary 400 ms maxima; loudness range), true peak
  (4x oversampled), band shares plain and A weighted with the 2 to 5 kHz
  share, repetition (autocorrelation of the onset envelope, 0.25 to 4 s
  lags), non finite and subnormal sample counts. Node and browser alike.
  `npm run audio:metrics` proves it against EBU Tech 3341's cases (a 1 kHz
  stereo sine at -23 and -33 dBFS reads -22.99 and -32.99 LUFS; the gating
  case -23.01; true peak of a quarter rate sine 0.09 dBTP with a -3.01 dBFS
  sample peak). In CI.
- `tools/audio/flights.js`: the twelve scripted flights flown by
  `dist/sim.wasm` in Node, written to `tools/audio/flights.json`.
  `npm run audio:flights` re flies them and fails if the file is not what
  the plant flies now. In CI, so a change to the plant's trajectories has
  to regenerate the file (`node tools/audio/flights.js`) and re-render the
  comparison: the sound was measured on the old flights.
- `tools/audio/render.js` (`npm run audio:lab`): renders every flight OLD
  and NEW in headless Chromium through the real graph, writes WAVs to
  `build/audio-lab`, measures them, `--check` holds NEW to the bars,
  `--write` records `tools/audio/measured.json`, `--stem=engine|air`
  isolates a category. Render cost is wall time over audio time on an
  OfflineAudioContext, which is a proxy for the audio thread's load (an
  offline context reports nothing per quantum).

The bars for NEW (`--check`): integrated -29 to -22 LUFS (a fly-by is
judged on its pass, the loudest 400 ms, -30 to -20, because a fly-by is
far away for most of its length by definition); short term at most -18;
momentary at most -14; true peak at most -1.0 dBTP; no non finite or
subnormal sample; nodes at most 64 and no more than OLD's; at most 35
percent of the A weighted power in 2 to 5 kHz; render cost under 0.25 s a
second.

Measured, `npm run audio:lab -- --check --write` (default volume, no
music; `tools/audio/measured.json` has every field):

| Flight | OLD LUFS | NEW LUFS | NEW short max | NEW dBTP | OLD / NEW 2 to 5 kHz % | OLD / NEW repetition | OLD / NEW nodes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 5 inch hover | -27.17 | -26.71 | -26.17 | -18.92 | 0.1 / 3.4 | 0.706 / 0.077 | 63 / 44 |
| 5 inch punch-out | -28.55 | -22.91 | -19.57 | -11.39 | 1.2 / 6.6 | 0.768 / 0.654 | 63 / 44 |
| 5 inch dive | -28.75 | -25.28 | -21.42 | -12.85 | 1.1 / 7.7 | 0.654 / 0.416 | 63 / 44 |
| 5 inch prop wash | -29.21 | -25.68 | -21.98 | -13.10 | 1.3 / 8.9 | 0.691 / 0.535 | 63 / 44 |
| 5 inch crash, grass | -25.08 | -26.22 | -25.65 | -9.96 | 7.8 / 3.1 | 0.195 / 0.698 | 63 / 44 |
| 5 inch crash, concrete | -25.08 | -25.91 | -25.22 | -6.54 | 7.8 / 7.4 | 0.195 / 0.413 | 63 / 44 |
| Striker prop, rail takeoff | -30.66 | -23.92 | -23.77 | -17.06 | 19.7 / 0.6 | 0.880 / 0.498 | 63 / 44 |
| Striker prop, cruise | -31.67 | -26.39 | -25.06 | -17.71 | 17.4 / 0.6 | 0.665 / 0.612 | 63 / 44 |
| Striker prop, fly-by 20 m | -28.72 | -32.29 (pass -26.65) | -28.53 | -18.88 | 22.7 / 0.6 | 0.697 / 0.736 | 63 / 44 |
| Striker jet, rail takeoff | -31.61 | -22.92 | -21.18 | -12.93 | 20.6 / 31.6 | 0.889 / 0.879 | 63 / 44 |
| Striker jet, cruise | -28.69 | -27.41 | -25.37 | -16.41 | 21.8 / 22.9 | 0.657 / 0.062 | 63 / 44 |
| Striker jet, fly-by 20 m | -28.17 | -34.27 (pass -26.60) | -31.62 | -17.75 | 23.0 / 31.6 | 0.721 / 0.759 | 63 / 44 |

Render cost: OLD 0.02 s a second, NEW 0.04 (Striker) to 0.11 (four
motors) s a second, all under the 0.25 bar.

Reading it:

- **Responsive**: OLD's loudness range on the punch-out is 2.1 LU, NEW's
  11.9: OLD barely moves with the throttle in level (by design, its pitch
  does) and its 0.2 s noise loop flattens everything; NEW moves about 6 dB
  hover to full and brightens. Same for the dive (1.6 against 8.7 LU).
- **Surface**: OLD's grass and concrete crashes are identical; NEW's
  concrete has a sample peak 3.4 dB higher and more than twice the 2 to
  5 kHz share (the crack), grass a duller, longer thump.
- **Repetition**: the 5 inch hover goes from 0.706 (the noise loop) to
  0.077 and the jet's cruise from 0.657 to 0.062. The Striker prop's
  cruise stays high (0.665 to 0.612): its throttle step at 6 s and the
  engine's own regular firing are what the envelope finds, and it is a
  thing to listen for. Elsewhere a high NEW score is the flight repeating
  (a pass, a punch and its recovery), not the sound.
- **The Striker**: OLD was the wind loop over a quiet engine (17 to 23
  percent of its A weighted power in 2 to 5 kHz from that hiss); NEW is an
  engine first. OLD's fly-by is the on board sound at full throttle,
  because OLD has no listener: no distance, delay or Doppler.
- **The jet** is the harshest NEW sound (31.6 percent in 2 to 5 kHz on the
  rail takeoff), under its bar and the first thing to listen for.
- The OLD figures are not judged. Most sit under NEW's -29 floor, and
  OLD was still heard as too loud and tiring: what tires is the fixed hiss
  loop and a tone that does not move, not the integrated level, and the
  music under it is quieter still (section 1).

Regression evidence for the flag off: `scripts/audio-probe.js
--trace=flight --seconds=8 --cue=crash@4` before and after the change to
`audio.js`: nodes 63 and 63, RMS -30.0406 dBFS both (to 1e-7 dB), every one
third octave band identical to 0.00 dB. (The probe's sample digests differ
between two runs of the same code, so they are not usable for this.) The
live shell with the flag off: 64 nodes, music playing; with it on: 45
nodes, the engine loaded, no console errors.

## 10. Roll out (phase 4), once the owner has listened

1. The owner's verdict on the listening page, flight by flight.
2. Fix the noise generator in the shipped voices (`Math.imul`), whatever
   the verdict: it is a defect on its own.
3. Make the prototype the default for the quads and the Striker, then the
   other airframes' models (`wing`, `edf`, `glow2`, `glow4` already exist
   in the worklet, untuned).
4. Hand the crash path its surface material and impulse (`feelImpact`
   knows the contact; the prototype currently strikes a middling surface
   from the shell's crash call).
5. Voice other aircraft (peers, the war's attackers) through the
   propagation: one worklet instance can carry several sources once a
   source list replaces the single engine.
6. Explosions on the propagation; music normalised per title to -30;
   the war's media elements routed through the graph; the new sliders.
7. Recordings for impacts and explosions within the 1.5 MB budget, each
   credited.
8. When the prototype is the default, verify check 14 (which asserts four
   motor chains, `motors.length === 4`) and `scripts/audio-probe.js` (built
   on the oscillator chains) move to the engine node; the 64 node bar
   stays.
