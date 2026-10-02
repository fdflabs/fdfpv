# Audio: audit, design, the physically driven engine, and its API

The owner, 2 October 2026: "I want to change all of them for real audio,
that's responsive, doesn't feel tiring, done right". The plan has four
phases: (1) audit, design and measurement tools, (2) a prototype of the
motor and prop sound and the wind for the 5 inch and the Striker (prop and
jet) with a listening page, (3) the owner's verdict, (4) roll out.

Phases 1 and 2 shipped in #349. Phase 3, the owner on 2 October after the
listening page: "theyre good - it sounds good... can we do them for every
single plane, every single motor, every vehicle, all of it?" Phase 4 is in
progress, in two tracks: this file's (the engine, the mix, every aircraft
the player flies, other pilots) and the world's (vehicles, boats, the
war's attackers, explosions, ambience: src/render/world-worklet.js), which
plays through the API in section 11. The engine is the game's sound now;
the flag is gone (section 8). Sections 1 to 9 are the record as #349 wrote
it, amended where the roll out changed a fact.

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

**Where each stands after the first phase 4 pull request:** the noise is
real noise (`Math.imul`) in every audio generator (the cue buffer and the
explosion's crackle; the worklet's own were always xorshift); the graph
stands at 49 nodes offline and well under 64 live (section 11); every
music record is levelled and the bed sits at -30 LUFS, under the aircraft
again; the war's music and voice play through the graph, and the combat
file is under -1 dBTP (it needed 3.67 dB, `tools/voice/music.py`); the
engine reads the body frame airspeed and the sideslip. Not audio, and left
alone: the same float generator seeds `src/render/explosion.js`'s
particles and several `scripts/*` test fixtures, whose outputs other
checks depend on.

## 2. The graph and its limits

The graph as of phase 4 (`src/render/audio.js` attach):

    engine (worklet) out 0 ─> motorBus ─> highpass 60 Hz ─┐
                     out 1 ─> windBus ───────────────────┤
    world (worklet)  out 0 ─> otherBus ──────────────────┼─> flightDuck ─┐
                     out 1 ─> ambienceBus ─> ambienceDuck ───────────────┤
    engine out 2, world out 2, wreck, SCHWING, coin ─> effectsBus ───────┤
    war radio calls (MediaElementSource) ─> voiceBus ────────────────────┼─> limiter ─> tanh ─> master ─> out
    music crate and war beds ─> ... ─> music duck ───────────────────────┤
    race cues (gate, graze, land, takeoff), menu taps, focus tone ───────┘

What follows is the graph #349 found:

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

The engine is `src/render/engine-worklet.js`, one AudioWorkletProcessor.
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

## 8. The engine, and how to hear it

**The engine is the game's sound.** Since phase 4 there is no flag: the
four motor chains, the wind loop, the old crash cue and their tables are
deleted (21 nodes), and one AudioWorkletNode (`src/render/engine-worklet.js`)
with three outputs (engine onto the Motors bus, air onto the Wind bus,
impacts onto the Effects bus) and the limiter replace them. The
`?audiolab=0` escape the lead allowed "only if it's free" is not there: it
would have meant keeping every deleted line. The old sound survives only as
`tools/audio/old-audio.js`, a frozen copy the listening page renders OLD
from and the game never loads. Per frame state goes in as AudioParams,
never port messages, so an offline render hears exactly what the live page
does. `main.js` adds the body frame velocity and the pack current; the
Striker says which engine it has (`engineModelForCraft`); the hangar's
prop its blade count (`setBladeScale`, now a whole blade count in the
engine rather than a pitch multiplier).

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

## 10. Roll out (phase 4)

The owner listened on 2 October and asked for all of it. In order, as
pull requests:

1. **Done in the first:** the engine is the default and the old chains are
   deleted; the noise generator fixed; every music record levelled and the
   bed at -30 LUFS; the war's music and voice through the graph and its
   ducks, the combat file under -1 dBTP; the limiter for everything; the
   music and the ambience ducked under impacts and explosions; Settings
   rows for Motors and engines, Wind, Other aircraft, Effects, Ambience,
   Voice and Music beside Volume; the world's API (section 11). Check 14
   now asserts the engine node is attached where it asserted four motor
   chains; the 64 node bar is unchanged. `scripts/audio-probe.js`, built on
   the deleted chains, is retired; `tools/audio/render.js` replaces it.
2. Every aircraft the player flies, each with its own engine: the quads
   (5 inch, whoop, 7 inch, 10 inch, interceptor) with their blade counts,
   poles and the hangar's motors and props; the fixed wings' electric
   outrunners, glow two and four strokes, the Tiger Moth and the P-51, the
   F-16's ducted fan as a fan (not the turbojet), the Striker on both
   engines; gliders silent but for their air; flaps, gear, the catapult and
   the parachute; the crash path handing its surface and impulse over;
   prop strikes and wreck parts.
3. Other pilots in rooms, each from its sent state, through the
   propagation, with a voice budget: the nearest few loud, the rest culled
   smoothly.

**The settings are saved, not synced.** The account sync
(`src/share/progressmerge.js` SYNCED_SECTIONS) carries progress, builds and
loadouts, not the Settings screen, and a new section needs its own limits
on the server (`tracks-api`). The sound levels stay in this browser's
storage like every other Settings row.

## 11. The public API

`src/render/audio.js` exports `MotorAudio`; the shell holds one as
`audio`. What another module may call, and what it promises. A change to
anything here is announced to the lead first.

**The world's node.** `audio.attachWorld(node)`: `node` is any AudioNode
with three stereo outputs (src/render/world-worklet.js is the one this is
for). Output 0 goes to the Other aircraft bus (other pilots, the war's
attackers, vehicles, boats), 1 to the Ambience bus, 2 to the Effects bus
(explosions), each under its Settings row, through the flight duck (0),
the action duck (1), the limiter and the master. Safe before `attach()`:
the node is held and connected when the graph is built. One world node; a
second call replaces the first. The caller owns the node; `nodeCount()`
counts it once it is connected, so it is inside the 64 node budget that
check 14 and `war:boom` hold the page to.

**Ducking under action.** `audio.duckAction(atTime, depth, seconds)`:
ducks the music and the ambience to `depth` (the gain at the bottom, 0
to 1), recovering over `seconds`; a deeper duck already running wins. For
explosions and impacts in the world. `audio.duckFlight(atTime, depth,
seconds)` is the same for the flight stems (the pilot's engine, the wind,
other aircraft), for a sound that must cut through them.

**The pilot's own aircraft**, driven by the shell (src/main.js):

- `audio.update(rpm, speed, atTime, air)` once a frame: `rpm` the four
  motor RPMs, Betaflight order, a fixed wing's engine in slot 0; `speed`
  m/s; `atTime` the context time (omitted live); `air` optional,
  `{ u, v, w, amps, dist, dist2, pan }`: body frame velocity m/s (forward,
  left, up), the pack current A, and for a source heard off board the
  distance, the ground reflection's path, metres, and the pan, -1 to 1.
- `audio.setVoice(name)` (a VOICES key), `audio.setEngineModel(name)`
  (an ENGINE_MODELS name or null), `audio.setBladeScale(k)`.
- `audio.impact(impulse, hardness, speed, atTime)`: N s, the surface's
  hardness 0 to 1 (`sim_material_info`), m/s.
- `audio.event(kind, atTime, level)`, `wreck(kind, level, atTime)`,
  `schwing(level, atTime)`, `coin(level, atTime)`, `boom(level, distM,
  atTime)` and its `booms` counter, `ui(kind)`: the cues, unchanged.
- `audio.ready`: a promise that resolves when the engine node exists. An
  offline render awaits it before scheduling (src/replay/soundtrack.js,
  tools/audio/drive.js).
- `audio.setMix({ motors, wind, music, focus, effects, voice, ambience,
  other })`, each 0 to 1, any subset; an unknown key throws.
- `audio.nodeCount()`.

**Frames and units.** Everything is SI. A position the world hands its
own worklet is its own business; the propagation in the engine takes
distances, not positions, so it has no frame to get wrong.

## 12. The world: everything that sounds and is not the pilot's aircraft

The owner, 2 October, after the prototype: "can we do them for every
single plane, every single motor, every vehicle, all of it ?" The player's
aircraft, other pilots and the mix are sections 8 to 11. This section is
the rest: the war first, then the vehicles, then the ambience, each its
own pull request.

### What there is to voice (checked against the code, 2 October)

- **The war** (`src/share/war/routes.js` KIND, `src/render/attackers.js`):
  strike (the Striker airframe, the Shahed class, 26.6 m/s), decoy (the
  same airframe), scout (a 3 m twin boom pusher, 10.5 m/s), loiter (a
  1.2 m X wing tube with an electric pusher, 19.6 m/s, diving at 28), fpv
  and hunter (0.25 m quads, 21 and 25.2 m/s), boat (a 5 m speedboat on an
  outboard, 9.8 m/s), jammer (a mast on a raft, 3.5 m/s). About 45 alive
  at once in itaipu-1's fourth round with eight pilots; the renderer's
  budget is 60. `roomWar.attackersAt(now)` gives every live one's position
  each frame (no velocity: `WorldAudio` differences positions). The
  explosions are `warBoomAt` in `src/main.js`: a warhead, every kill, a
  swarm's, a target hit.
- **Not in the game**, though the brief listed them: Itaipu has no road
  traffic, people or boats (its town's `update` is empty); no map has a
  train; the jammer is used by no mission (`itaipu-1.js`); the spillway
  has no gate state (`SPILL.gateOpen` is a constant 5); there are no
  sirens or alarms; time of day on `main` is day or night only (morning,
  noon and golden are pull request #344, unmerged).
- **Vehicles, for the next pull request**, all in the Alps and Swiss
  valley (`src/maps/alps/life.js`, room synced): the PostAuto bus, eight
  road cars (one a motorbike), a tractor and trailer, the gondola cabins
  (`alps/lift.js`), the Swiss lake's sailing boat; people and animals on
  the wall clock (hikers, a dog, paragliders, cattle, the village's 21
  figures).

### One node, many voices

`src/render/world-worklet.js` is one AudioWorkletProcessor carrying every
world source; `src/render/world-audio.js` is its main thread side. The
graph pays one node (`MotorAudio.attachWorld`, section 11): 53 nodes on
the war's live page (`war:boom`), 50 in a world scene, against the 64
bar.

- **Transport.** A source's state is not an AudioParam (a war has more
  sources than a node can have params). Each frame `WorldAudio.post`
  sends the listener (the camera: position, forward, right, the ground
  under it) and every source (id, kind, position, velocity) stamped with
  the context time. The processor keeps a history of each and reads it at
  the time the sound left the source. An offline render hands the whole
  timeline over in `processorOptions`, so the listening page and the
  checks run the same code as the live page. Proof: the Node render and
  Chromium's agree to 0.15 LU on every scene the limiter leaves alone
  (`npm run audio:world -- --browser --check`).
- **Propagation, per voice, without a delay line.** Each voice is
  synthesised at the source's retarded time, te = t - d(te) / 343, solved
  by fixed point steps; its phases run at the source's frequencies times
  dte / dt, which is the Doppler factor exactly. Then spherical spreading
  from 16 m (the engine's REF_M: another aircraft at 16 m is as loud as
  the pilot's own), never louder than at 6 m; the engine's air absorption
  lowpass; the ground's image through an 85 ms line (the comb of a real
  fly by); an equal power pan and a darker far ear behind the head.
- **Culling.** A pool of 14 voices goes to the sources loudest at the
  listener, with a 3 dB hysteresis so two at the same distance do not
  trade a voice, and a 60 ms fade in and out. Every other source is
  folded into a far bed per kind: its summed power at its power weighted
  pan and distance, as three detuned copies of the kind's note through
  that distance's air. A swarm at two kilometres is a drone.

### The models (`src/render/world-kinds.js`)

Every kind is a set of parts with numbers: an engine's firing (a pulse
each cycle, its strength and timing varied as Heywood 1988, 9.4,
describes, the odd misfire, ringing three muffler resonances), a prop's
blade pass and harmonics from its own seeded table (each voice's
imbalance its own, so no two engines of a kind are alike: two of a kind
on the same path correlate at most 0.05), its broadband chopped at the
blade pass, an electric motor's whine, a quad's four props beating, a
hull's wash and slap. Rpm follows the speed and the climb; a munition
that powers into its dive (`powerDive`, the loiter) winds up instead of
windmilling. Level follows rpm.

| Kind | Engine, as modelled | Note at cruise | At 16 m (target) |
| --- | --- | --- | --- |
| strike | the player's Striker engine (`boxer2`): a 110 cc two stroke boxer twin firing together, one pulse a rev, 4200 rpm ESTIMATED, a two blade pusher | firing 70 Hz, blade pass 140 Hz | -25 LUFS |
| decoy | a smaller two stroke at 7200 rpm, the same airframe (ESTIMATED: the sound is the tell) | 120 Hz | -28 |
| scout | a 30 cc class two stroke single, 6000 rpm (ESTIMATED) | 100 Hz | -29 |
| loiter | electric pusher, 7000 rpm, 14 poles, two blades (ESTIMATED) | blade pass 233 Hz, whine 817 Hz | -30 |
| fpv, hunter | four three blade props near 20,000 rpm | blade pass about 1 kHz | -29 |
| boat | a three cylinder two stroke outboard, 5500 rpm, its exhaust under water (ESTIMATED), and the hull | firing 275 Hz | -26 |
| jammer | a four stroke generator single, 3600 rpm, and a little wash | 30 Hz | -31 |

The Shahed's "moped" is the strike's engine: a two stroke's raw firing
with a pusher's blade pass an octave over it. "50 cc" is the nickname,
not a displacement: the game's spec is the 110 cc twin above, and the
real Shahed-136's engine is a 550 cc class four cylinder two stroke. The
levels at 16 m are ESTIMATED, ordered by what each machine is (an
outboard over a two stroke drone over a quad over an electric loiterer)
and set inside the mix's targets; `amp` in world-kinds.js is the trim
that meets each (`--calibrate` prints it), and the check holds every kind
within 1 LU.

### Explosions

Every explosion is its own sound now (OLD rang only the loudest a frame),
from where it went off, each a `Blast` in the worklet: the crack (the
shock's N wave, near only), the body (noise whose top falls from what the
air leaves of 1.6 kHz to 120 Hz), the thump (a low sine falling an
octave), the rumble (one shared diffuse low noise for all of them, shaped
by the sum of their envelopes, longer the farther) and a crackle of debris
near. Each draws its numbers from its own seed: two explosions at one
place correlate at 0.11, and the near one's 2 to 5 kHz share is under the
bar for every one of twelve seeds (worst 20.6 percent). It arrives d / 343
s after it went off.

- **Distance law: 4.5 dB a doubling past 60 m, not 6** (ESTIMATED, a mix
  decision for the owner's ears). A warhead at 300 m is far louder than
  an aircraft at 16 m; a mix that keeps the aircraft at its level has to
  compress the explosions' range to keep a boom across the valley a
  boom. The air's lowpass still takes its top.
- **Echoes off the dam.** The Itaipu map declares its concrete faces
  (`map.audioWalls`, from dam.json: every part's axis from its base to its
  crest, but the earth and rockfill embankments, which scatter). An
  explosion gets an image in each wall that it and the listener both
  face, where the path crosses the wall inside its length and height; the
  two nearest are heard, darker, at half the level times the wall's 0.6.
- **A soft knee** on the effects output from the limiter's threshold
  (-6 dBFS) to -0.9 dBFS: a near blast's first milliseconds are noise
  peaks 14 dB over its loudness, which the limiter's 2 ms attack would
  let through.
- **The ducks are boom()'s**: the flight and, through `duckAction`, the
  music and the ambience, under the loudest of the frame when it arrives.

### Measured

`npm run audio:world -- --check` (Node, in CI) and `-- --browser --check`
(headless Chromium through the real graph, local). Default volume, every
world bus at its default, the pilot's own motors stopped. A pass is its
loudest 400 ms.

| Scene | NEW LUFS | NEW loudest 400 ms | NEW dBTP | NEW 2 to 5 kHz % | OLD loudest 400 ms |
| --- | --- | --- | --- | --- | --- |
| an attack wave passing (6 Strikers, 4 loiterers, 5 FPV, 2 boats) | -35.2 | -29.2 | -20.6 | 11.7 | silent |
| one Strike attacker past at 20 m | -34.4 | -26.6 | -20.7 | 1.2 | silent |
| a loiterer circles and dives on a point 25 m away, and its warhead | -25.2 | -15.0 | -6.4 | 11.8 | -13.5 (the warhead) |
| explosion at 40 m | -20.4 | -15.3 | -6.4 | 21.3 | -13.5 |
| explosion at 100 m | -21.8 | -17.2 | -6.8 | 13.2 | -20.6 |
| explosion at 300 m | -32.1 | -25.9 | -10.8 | 6.3 | -20.3 |
| explosion at 300 m, the dam behind | -32.9 | -25.9 | -10.8 | 6.3 | -20.3 |
| explosion at 1000 m | -36.3 | -30.1 | -17.1 | 2.3 | -24.6 |
| ten in two seconds at 400 m | -24.2 | -21.0 | -10.5 | 10.7 | -23.5 |

Browser figures; Node's agree to 0.15 LU where the limiter is idle. OLD
is the frozen baseline (`tools/audio/old-audio.js`), which voiced no
attacker. Its far explosions are louder than NEW's: its law was
`1 / (1 + d / 250)`, so a boom at a kilometre was 11 dB under one at
40 m, against NEW's 15. Whether a distant boom should be louder is for
the owner's ears on the listening page.

**The budget.** The full war, 120 attackers spread over three kilometres
with every kind and a boom every half second (`war-full`): 14 voices and
107 sources bedded, render cost **0.21 and 0.22 s a second of audio** on
Chromium's worklet in two runs (bar 0.25, a quarter of one core), 0.12
in Node; 50 nodes. Measured on a shared host at load 25 on 20 cores; a
run before the far bed went to a quarter rate read 0.26, which is why it
did. The voices are most of it, about 0.009 s a second each.

**The load guard**, for a machine weaker than this one. The worklet
times its own quanta (Date.now, all an AudioWorkletGlobalScope has, over
windows of 128 quanta) and, when a window took more than 0.25 of the
audio's own time, sheds a step: 14 voices, then 10 with the far bed
reduced to its noise, then 6, then 4. A voice that loses its source
fades out as ever and the source goes to the bed. It gives a step back
after four cool windows (under half the budget) in a row, so it does not
hunt. It is off in offline renders, which are not real time and must
hear the same samples every run. Its hot path is a check row
(`--check`, a budget no machine meets): it sheds to the last step, the
full war is still heard within 0.2 LU of full detail (the explosions
carry it), clean, at 0.07 s a second against 0.10. Every bar of `--check` passes: each kind at 16 m within 1 LU, each
pass -30 to -20 LUFS with short term at most -18 and momentary at most
-14, a near explosion at most -12, true peak at most -1 dBTP, no non
finite or subnormal sample, at most 35 percent of the A weighted power in
2 to 5 kHz, and no identical repeats.

**Recordings: none.** Everything here is synthesised: 0 bytes, nothing
to credit; the 1.5 MB budget of section 7 is untouched.

**The listening page** lists the world's scenes after the flights, OLD
and NEW, matched on the pass; `tools/audio/world-scenes.js` is where a
scene is added.

### The valley's traffic

The Alps and the Swiss valley (`src/maps/alps/life.js`, `lift.js`,
`swiss2/props/lakeside.js`) say what drives through `map.audioSources(add)`:
the PostAuto, the eight road cars by what they are (car, van, motorbike),
the tractor, the gondola's cabins and its drive in the bottom station, the
Swiss lake's sailing boat. `src/main.js` hands them over with the traffic
clock each frame, right after `updateAnim` placed them, so what is heard
is where it is drawn, room synced as the traffic is.

| Kind | Made of | At 16 m |
| --- | --- | --- |
| car | a petrol four cylinder four stroke through five gears (idle 800, up at 2900 rpm), muffled; tyres, most of it at 50 km/h | -40 LUFS |
| van | a four cylinder diesel, its knock, heavier tyres | -37 |
| motorbike | a single cylinder four stroke through six gears, revving to 6500; little tyre | -33 |
| bus | a six cylinder diesel through five gears, its knock; it idles at its stop and pulls away loud | -29 |
| tractor | a four cylinder diesel held at 1800 rpm on its work, its knock | -31 |
| cabin | the haul rope's rumble through the grip, the hanger's swing | -50 |
| liftdrive | an electric motor at 1500 rpm, its 100 Hz hum, a 17 tooth gear mesh | -38 |
| sailboat | its hull through the water | -50 |

A road vehicle's rpm climbs through each gear with its speed and drops at
the change up, and its level follows its rpm and how hard it pulls, so
the bus idling at its stop measures 5 dB under the bus pulling away (the
street's figures say up to 10: a call for the owner's ears). The levels
come from the street, not from the war's mix: pass by figures in dB(A)
at 7.5 m (a car at 50 km/h about 68, a van 71, a motorbike 75, a bus 79,
a modern tractor at work 77), 6.6 dB less at 16 m, mapped to the mix by
the war's quad (a 5 inch class at 16 m, about 72 dB(A), is -29 LUFS),
so LUFS = dB(A) - 101. ESTIMATED, every one. A street at 30 m is then
under the pilot's own aircraft, as a street is under a drone.

Their scenes are judged in a quieter window than an aircraft's pass,
`VALLEY_PASS`, -48 to -27 LUFS: there, and never over the pilot's own
aircraft.

| Scene | NEW LUFS | NEW loudest 400 ms | NEW dBTP | NEW 2 to 5 kHz % |
| --- | --- | --- | --- | --- |
| a street at 30 m (the bus, cars, a motorbike, a van) | -40.0 | -36.9 | -23.7 | 12.8 |
| the PostAuto stops 12 m away, idles, pulls away | -35.8 | -28.9 | -15.9 | 5.4 |
| the tractor at work round its field (12 m at its nearest) | -32.6 | -27.7 | -15.1 | 1.2 |
| under the gondola near its station | -47.4 | -44.5 | -34.1 | 1.4 |
| the sailing boat past the shore at 25 m | -52.6 | -49.1 | -36.9 | 1.1 |

Browser figures, OLD silent in every one (nothing voiced the valley). The
whole valley at once (`valley-busy`: the bus, eight cars, the tractor, 30
cabins and the drive, the boat) costs 0.14 s a second on Chromium's
worklet, 14 voices and 29 bedded. Live, `npm run world:live` boots the
Swiss valley on the real shell and reads the worklet: 30 tracks, the
graph 51 nodes, load 0.021, never shed.

Not voiced, and why: people and dogs (footsteps at 1.25 m/s are not heard
past a few metres, and nothing here is a few metres from a pilot for
long); the paragliders (silent but for their wind); the cattle's bells,
which are ambience (the next pull request); a tower's sheaves clacking as
a cabin's grip passes (the cabins carry their rumble; the clack wants a
per tower event, left for later).

### Not yet

- Ambience (the next pull request).
- Occlusion (a hill between a source and the listener): not done; one ray
  against the terrain per voice per frame is the cheap form.
- Interceptions are the pilots' own aircraft (section 10, the player
  track); a hunter's sound is its quad's.
