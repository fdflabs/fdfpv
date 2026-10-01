# Avionics HUD: the five systems, their state, and what the HUD draws

The single source of truth for the Avionics HUD preset. Three agents build to
it at once; when the code and this file disagree, one of them is wrong, and
the fix is to change both in the same commit.

The owner's request of 2026-10-01 is a reference picture (an EO picture over
the Itaipu dam with a heading tape, speed and AGL tapes, an attitude arc, a
red target box with LEAD and CLOSURE cues, and four dark corner panels) and a
design text. Its rule, which everything below follows:

> The interface only shows what the vehicle, its simulated sensors, or the
> game's mission system actually know. The HUD never calculates the
> simulation; it displays state from FlightTelemetry, SensorManager,
> PerceptionAI and TrackManager.

So the renderer reads state objects and draws them. It never reads the
plant, the room, the attackers or the camera's truth to decide what to say.
It does project a direction the TrackManager hands it through the camera,
since putting a box where a direction is IS drawing.

## 1. Who owns what

| System | File | Owner |
| --- | --- | --- |
| FlightTelemetry | `src/avionics/telemetry.js` | agent 1 (lead) |
| HUD state machine | `src/avionics/hudstate.js` | agent 1 |
| HUDRenderer | `src/ui/avionicshud.js` | agent 1 |
| SensorManager | `src/avionics/sensors.js` | agent 2 |
| Camera post-processing, thermal | `src/render/thermal.js` (and any new `src/render/*` it needs) | agent 2 |
| PerceptionAI | `src/avionics/perception.js` | agent 3 |
| TrackManager | `src/avionics/tracks.js` | agent 3 |
| Wiring in `src/main.js`, settings, keys | `src/main.js`, `src/ui/ui.js` | agent 1 |
| Layout check | `scripts/avionics-layout.js` (`npm run check:avionics-layout`) | agent 1 |
| This file | `docs/AVIONICS-HUD.md` | agent 1 |

Pilot facing text goes in `src/strings/en.js` and `src/strings/es.js`, each
agent under its own prefix so the merges stay mechanical: `avionics.hud.*`
(agent 1), `avionics.sensor.*` (agent 2), `avionics.track.*` (agent 3).

Branches: the lead works on `avionics-hud`. Agents 2 and 3 branch from it as
`avionics-hud-sensors` and `avionics-hud-tracks`, push there, and say when
a commit is ready; the lead merges them into `avionics-hud`, and there is one
pull request. Nobody but the lead edits `src/main.js`. A system that needs
something from the shell asks for it here, by adding it to its input below.

The lead commits a stub of each of the three modules agents 2 and 3 own, with
the exact interface below and the dumbest behaviour that satisfies it, so the
HUD runs end to end from the first day. The owner of a module replaces the
stub's body and keeps its exports.

## 2. Rules every system keeps

- **SI inside, degrees and km/h only on screen.** Angles are radians,
  distances metres, speeds m/s, times seconds. The renderer converts.
- **The sim clock, not the frame.** Every `update` takes `tS`, the plant's
  clock (`st[0]`). Anything random is a seeded xorshift32 reset with the run,
  never `Math.random`. None of this reaches the plant, so the physics
  contract (physics never reads frame time) is untouched, but a replay of a
  run must still give the same tracks.
- **Render frame for directions.** Directions handed between systems are unit
  vectors in the render world (three.js, Y up, north is -Z, see
  `src/ui/fpvhud.js` attitudeOf). The plant's Z up frame never leaves
  `src/render/frame.js` and the shell.
- **No allocation per frame in the hot path** where avoidable: state objects
  are made once and written in place.
- **Intervals, not fake precision.** An estimate is `{ lo, hi }` (or a value
  with `sigma`), never a bare number that looks exact.
- Plain JavaScript, three.js only, GPLv3 header on every file, no em or en
  dashes anywhere.

## 3. Provenance tags

Every value on the HUD carries where it came from, as a tiny tag beside it.

| Tag | Meaning |
| --- | --- |
| `FC` | the flight controller's own sensors: gyro and accelerometer attitude, the current sensor, the pack voltage, the baro |
| `GNSS` | the satellite fix (a game model, section 4.3) |
| `VIO` | visual inertial odometry (a game model, section 4.3) |
| `EO` | the day camera's picture, through PerceptionAI |
| `IR` | the thermal camera's picture, through PerceptionAI |
| `MISSION` | what the mission system says: the war's wave, output, objectives |
| `EXT` | external data over the link (the room's attacker list, a teammate). Goes stale when the link drops |
| `SIM` | a game model the plant does not have (motor temperatures, the compute load and its temperature). Shown so the panel reads like the picture, tagged so it never pretends |

`FC` and `SIM` are additions to the owner's list: without them a value would
either go untagged or be tagged as something it is not.

## 4. FlightTelemetry (`src/avionics/telemetry.js`, agent 1)

Reads only what the shell already computes for the FPV OSD: the `osdView`
handed to `ui.setOsd` and the context handed to `fpvOsd.feed` (plant state
block `st`, the pack, the render quaternion, the link), plus the OSD's own
Betaflight faithful results it computes from them (filtered pack voltage,
battery state, LQ). The FPV OSD is fed every flight frame whatever HUD is
shown, so its numbers are the flight controller's numbers.

```js
const telemetry = createFlightTelemetry();
telemetry.feed(osdView, x, fpvOsd, extra);   // every flight frame, after fpvOsd.feed
telemetry.state                              // read only, written in place
```

`extra` is `{ videoSnow, cameraLost }` from `src/render/fpvfail.js` level(),
what the picture is doing, for VIO and the DEGRADED state.

### 4.1 `telemetry.state`

```
tS                    plant clock, s
armed, fixedWing      booleans
flightMode            'acro' | 'angle' | 'turtle' | 'manual' | 'stab' (the OSD's)
attitude  { pitch, roll, heading }   rad, heading clockwise from north (-Z)   FC
speed     { ms, sigma }              ground speed and its 1 sigma, m/s        nav source
vs        { ms }                     vertical speed, m/s, from the plant      FC
agl       { m }                      height over the ground under the craft   FC
battery   { volts, amps, watts, percent, percentFrom, state, cells }
          volts: Betaflight's filtered pack voltage (fpvOsd.vFilt)            FC
          amps:  plant current, 0 when disarmed                               FC
          watts: volts * amps
          percent: 0..1. percentFrom 'charge' when the plant counts charge
                   (a plane's pack, docs/POWER-STAGE1.md), 'voltage' when it
                   does not (a quad's pack never empties; the percent is the
                   sagged voltage on the LiPo span and says so)
          state: 'ok' | 'warning' | 'critical' (Betaflight's, from the OSD)
endurance { remainS, totalS } | null
          from the REAL current draw: the plant's charge left over a 5 s
          filtered current, and the whole pack over the same current.
          null when the pack has no capacity (quads, glow): the panel then
          says the pack is not modelled rather than inventing a clock.
motors    [{ rpm, tempC }] x4, Betaflight order RR FR RL FL
          rpm from the plant. tempC is SIM: a first order model, heat in
          proportional to (rpm / rpmMax)^3, cooling toward ambient faster
          with airspeed. The plant has no thermal model.
link      { preset, hz, latencyMs, lossPct, lq, state }
          preset and hz from src/input/link.js, latencyMs the preset's mean
          delay plus any signal age, lossPct from the link's own sent and
          dropped counters, lq the OSD's (Betaflight's LQ). state 'ok' at
          lq >= 70, 'weak' below, 'lost' at 0. 'perfect' reads lq 100, 0 ms.
gnss      { sats, fix, hdopM, state }   section 4.3
vio       { state, why }                section 4.3
nav       { source, sinceFixS }         'GNSS' | 'VIO' | 'DR'
compute   { load, tempC }               SIM. load from PerceptionAI.load, tempC first order toward ambient + 40 * load
video     { snow, lost }                from fpvfail
```

### 4.2 What drives the battery and endurance

The owner's text asks that aggressive flying collapses endurance and cruise
recovers it. That is exactly what the plant's current does: endurance is the
charge left over the current, so a punch halves it and a cruise brings it
back. Only airframes whose plant drains a pack (planes, and any quad the
plant gives a capacity later) show it; the rest say `NOT MODELLED`.

### 4.3 GNSS and VIO are game models, and this is what drives them

The plant has no satellites and no visual odometry, and since 2026-09-29 the
war has no jammers (docs/WAR-WIRING.md). So both are small deterministic
models in FlightTelemetry, driven only by things the game really has:

- **GNSS.** Acquisition after the run starts: 0 satellites at `tS` 0, rising
  to 12 over the first `GNSS_ACQUIRE_S` (8 s) of sim time, 2D fix at 4, 3D
  at 6. Near the ground the fix degrades (multipath, a stand in for buildings
  and the dam wall): under `GNSS_LOW_AGL_M` (3 m) HDOP doubles. A crash that
  takes the video antenna (fpvfail cameraLost) does not touch GNSS. A test
  hook `window.__avionics.deny('gnss', true)` (and `'vio'` for VIO) cuts it for checks and
  for flying the degraded path; nothing in normal play denies it yet. When a
  mission adds denial, it becomes an input here, documented here.
- **VIO.** Needs a picture and texture at a usable depth: `ok` while the
  video is not lost and snow is under 0.5, AGL is at most `VIO_MAX_AGL_M`
  (150 m) and ground speed is at most `VIO_MAX_MS` (45 m/s); `degraded`
  inside 1.25 times either limit; `lost` past them or with no picture.
- **Nav source.** GNSS with a 3D fix, else VIO when ok or degraded, else DR
  (dead reckoning). Speed's sigma grows with the source: GNSS 0.2 m/s, VIO
  0.5, DR 0.5 + 0.3 per second since the last good source. The HUD shows a
  plus or minus once sigma passes 1 m/s.

## 5. SensorManager (`src/avionics/sensors.js`, agent 2)

The camera as a sensor: what it is looking with, and the picture in the
picture. Agent 2's detail is docs/AVIONICS-SENSORS.md.

**The inset is the sensor.** As in the owner's reference, the main view
stays the pilot's own picture (the map's look, 1x, untouched) and the camera
block's inset shows the sensor: J's mode, K's zoom, the exposure and the
stabilisation all apply to it, and `pipMode` is always `mode`, so the
inset's label follows J. `I` (`setMainView('sensor')`) puts the sensor full
screen instead, and `I` again puts the pilot's picture back; only then does
the main view change mode. While the sensor is full screen the inset is not
drawn and its slot is hidden, because it would only repeat the main view.
Every new run starts on the pilot's picture.

`U` steps the inset through small, medium and large, and the choice is a
setting (`avxInset`), kept across reloads. Each size is drawn at its own
resolution (`INSET_SIZES` in src/render/sensorview.js: 320x200, 480x300,
640x400), so a larger inset is sharper and the small one costs what it
always did. Small is 13em on screen; medium and large take a fifth and a
third of the screen's width, stack the camera's rows under the picture,
and give way to the room right of the height tape and under the top right
panel, so they never sit on either.

```js
const sensors = createSensorManager({ renderer, scene, camera });  // scene() is a function: maps swap scenes
sensors.update(tS, dtS, video); // every flight frame, after the camera is placed; video is fpvfail's { snow, lost }
sensors.render(post);           // in place of view.post.render() while the Avionics HUD is up: draws the main view and the inset
sensors.setTracks(snapshot);    // once, TrackManager's snapshot (written in place): the inset boxes the tracks itself
sensors.setMotorTemp(c);        // the hottest of telemetry.state.motors[].tempC, for the motors in a thermal picture
sensors.project(losW, out, aspect, view)  // a world direction to NDC in 'main' or 'pip', through zoom, crop and stabilisation when that view shows the sensor
sensors.setMainView(v);         // I: 'eo' (default) or 'sensor'
sensors.setInset(size);         // U: 'small' (default), 'medium' or 'large'
sensors.cycleMode();            // J
sensors.cycleZoom();            // K
sensors.toggleRec();            // not bound yet
sensors.state                   // read only
sensors.pip                     // HTMLCanvasElement or null, drawn by SensorManager
```

The module also exports `SENSOR_MODES`, `ZOOM_LEVELS` and
`thermalMode(mode)` (true for the IR modes and fusion), which the HUD state
machine uses for THERMAL.

### 5.1 `sensors.state`

```
mode       'eo' | 'ir_wh' | 'ir_bh' | 'lowlight' | 'fusion' | 'contrast'   (ids are string key safe: lower case, underscores)
zoom       1 | 2 | 4            digital, degrading resolution, not magic
zoomLevels [1, 2, 4]
fovRad     the sensor's vertical field of view after zoom and the stabilisation's crop
exposure   { auto: bool, ev }   ev in stops
stab       bool                 electronic stabilisation on
rec        { on: bool, s }      recording and its length, sim seconds
pipMode    the mode the picture in picture shows: always mode
mainView   'eo' | 'sensor'      the pilot's picture (default) or the sensor full screen
inset      'small' | 'medium' | 'large'   the inset's size
healthy    bool                 false while the picture is lost (fpvfail)
noise      0..1                 how much the sensor's picture is noise (low light, zoom, snow); PerceptionAI reads it
timeOfDay  'day' | 'night'      the map's, for the thermal weather
detect     { sensor, pxPerRad, light, contrast, quality }   what a detector gets from this mode (docs/AVIONICS-SENSORS.md section 4)
```

The renderer adopts `sensors.pip` into its camera panel (section 8) and
sizes it with CSS; SensorManager draws into it at whatever rate it likes. The
thermal look (white hot, black hot, fusion) is SensorManager's and
`src/render/thermal.js`'s; objects get a temperature, not a palette swap
(owner's text).

## 6. PerceptionAI (`src/avionics/perception.js`, agent 3)

Turns what the sensor could see into detections. It reads truth through one
adapter the shell hands it, and nothing it emits says which truth it came
from beyond what a real detector could know.

```js
const perception = createPerception({ seed, heightAt });
perception.update(tS, sensors.state, truth, ownship, env);  // every flight frame
perception.detections            // this frame's, read only
perception.load                  // 0..1, a compute model (SIM), FlightTelemetry shows it
perception.reset()               // a new run
```

The full model (detection range, classes, noise, occlusion, the thermal
advantage) is agent 3's, written up in `docs/AVIONICS-PERCEPTION.md`.

- `truth`: the shell's adapter, today `roomWar.attackersAt(roomNow)` in a
  live war (`{ id, kind, p: [x, y, z], q }`, render metres), else an empty
  list. Combat drones outside a war are not targets yet.
- `heightAt(x, z)`: the top of the map under a point (ground, water, the
  dam), `view.height(x, z, Infinity)`. Without it nothing is ever hidden
  behind terrain or the dam.
- `ownship`: `{ p: [x, y, z], v: [x, y, z], camera }`, render frame. `p` is
  the CAMERA's position (the sensor is where it looks from, which matters
  in a chase view), `v` the craft's velocity, `camera` as placed this frame.
- `env`: `{ light }`, 0 at night to 1 by day; the shell passes 0.05 while
  the war is at night (`roomWar.night()`), else 1.
- A detection: `{ losW: [x, y, z], sizeRad, hypotheses: [{ cls, p }], quality, sensor: 'EO' | 'IR' | 'FUSION', rangeM: { lo, hi }, truthKey }`.
  `truthKey` is opaque and for checks ONLY: the TrackManager associates by
  direction and range like a real tracker, never by truthKey, or losing a
  target behind the dam and swapping two tracks could never happen. The HUD
  never reads it.

## 7. TrackManager (`src/avionics/tracks.js`, agent 3)

Turns detections into tracks with an age, an estimate and a prediction.

```js
const tracks = createTrackManager({ heightAt });
tracks.update(tS, perception.detections, ownship);
tracks.snapshot                  // read only, written in place
tracks.cycle(dir)                // pick the next track as primary (not bound yet)
tracks.reset()                   // a new run: no tracks
```

### 7.1 `tracks.snapshot`

```
tracks     Track[]              live and stale tracks
primaryId  number | null        the selected one, TRACK state's
lost       Track[]              tracks dropped in the last GHOST_S (3 s), drawn as ghost boxes
```

### 7.2 Track

Brief names on the right, camelCase in code because the code base is.

```
id                 number, and label 'T07'                     track_id
cls                top hypothesis class id                     class
hypotheses         [{ cls, p }] sorted by p, sum <= 1         (top hypotheses)
confidence         0..1, that the track is a real object       confidence
sourceSensor       'EO' | 'IR' | 'FUSION' | 'EXT'              source_sensor
ageS               s since first detection                     track_age
losW               [x, y, z] unit, render frame, now           bearing (direction)
bearing            { azRad, elRad } true azimuth from north clockwise, elevation   bearing
sizeRad            apparent size                               apparent_size
rangeM             { lo, hi } | null                           estimated_range
relVel             { v: [x, y, z], sigma } m/s                 relative_velocity
closureMs          { lo, hi } | null  positive when closing    (closure)
speedMs            { lo, hi } | null
altM               { lo, hi } | null  over the ground under it
visibility         0..1                                        visibility
occlusion          0..1                                        occlusion
predictionQuality  0..1                                        prediction_quality
stale              bool, no detection for STALE_S (0.6 s)
lastSeenS          tS of the last detection
predicted          [{ dtS, losW }]   future directions, every 0.5 s to 2 s
lead               { tS, losW } | null  where to point to meet it at this vehicle's speed; tS is a duration, s
```

Class ids and their words (`avionics.track.cls.<id>`; string keys are `[a-z0-9_.]` only, so every id here is lower case with underscores): `fixed_wing_uav`,
`multirotor`, `light_aircraft`, `loitering_munition`, `boat`, `air_object`,
`unknown`. `cls` stays `air_object` until the top hypothesis reaches 0.6
(owner's text: AIR OBJECT before UAV), and the renderer shows `cls` as given.

## 8. HUDRenderer (`src/ui/avionicshud.js`, agent 1)

DOM panels plus one canvas for the instruments, monospace, thin lines, dark
translucent panels, cyan and green and white, red for the target. It reads
`telemetry.state`, `sensors.state`, `tracks.snapshot`, `hudState` and the
war's `MISSION` lines, and draws:

| Element | Where | Contents |
| --- | --- | --- |
| Heading tape | top centre | ticks every 10 deg, cardinal letters, boxed heading, the primary track's bearing as a red caret |
| Speed tape | left of centre | km/h, boxed value, `±` when nav sigma > 1 m/s |
| AGL tape | right of centre | m, boxed value, vertical speed caret |
| Attitude arc and ladder | bottom centre, and a compact band round the reticle | roll arc with pointer; short, thin, dim pitch rungs every 10 deg (section 8.3) |
| Reticle | centre | ring and dot; with a primary track, the LEAD cue (the lead point and `LEAD 0.7 s` beside it, only between the tapes) and one line of `CLOSURE` under it |
| Target box | where the track's direction projects | section 8.2 |
| Mode block | top left | MODE row `MANUAL` `TRACK (AI)` `ACRO ASSIST` (the one in force lit), TRACKING block, the primary track's whole readout: AI TRACK, TARGET (the war's kind when it has one, the class, the confidence), SOURCE, TRACK TIME and `VIS` or `OCC`, RNG and BRG, SPD and ALT with the difference to ours; nav source line |
| Health block | top right | LINK, GNSS, VIO, CPU, TEMP |
| Energy block | bottom left | BATT V % A W and bar, ENDURANCE, M1 to M4 temps |
| Camera block | bottom right | the picture in picture slot, CAM EO / IR, ZOOM 1x 2x 4x, EXP, STAB, REC |

**The middle is the pilot's** (the owner's brief: attitude, the tracked
object, relative motion, a lead cue, closure; everything else at the
perimeter). Nothing opaque is drawn between the tapes in the middle third of
the height: the tape value boxes are translucent, the target has a box and
one line of tag, and the readout is in the mode block.

The tapes sit relative to the centre at 0.37 of the height, as the FPV OSD's
sidebars do, so they clear the war HUD's left column by construction. Every
corner panel is placed by sliding it away from its edge until it is clear of
the game's own furniture (the chips, the music dock, the gimbals, the war HUD
box, the war callouts, the markers' radar) and of the heading tape and the
panels placed before it, the way `src/ui/fpvhud.js` places its readouts.
A slide never leaves the window: when nothing inside it clears everything, a
panel may sit under a banner (a soft keep-out), and when even that fails it
is hidden for the moment, the camera and energy blocks last (on a phone on
its side in a war, only the energy block fits).
The markers' edge arrows are not avoided: they run round every edge, so a
corner panel cannot clear them, and an arrow is a moment's cue drawn over
whatever is there. A room's lines and the peer marks (`src/ui/peermarks.js`)
slide off the panels, because the renderer hands peermarks its panel rects
exactly as the FPV OSD hands its readouts. In a private room with many pilots
not flying, those lines start under the mode panel, so eight of them can
reach the war HUD's top: a known limit, the same one the FPV OSD has with
more room.

### 8.1 Visual grammar

- **Exact:** crisp solid lines and plain numbers (attitude, heading, the FC's
  volts and amps).
- **Estimated:** soft lines, `~` or `lo - hi` intervals, `±` (speed in DR,
  range, closure, target speed and altitude). An interval too wide to mean
  much is said as `~` its middle, to one figure, dimmed: a range whose top
  is over twice its bottom (`~400 m`, not `0.1 - 2.1 km`), a closure wider
  than its middle.
- **Predicted:** dotted (the prediction trail, the lead line).
- **Lost:** a ghost box, dashed and faint, where the track was last, for
  GHOST_S.
- **Stale:** dimmed to 45 percent (a stale track, EXT data with the link
  weak or lost, GNSS values with no fix).

### 8.2 The target box

Centred on the projection of `losW`, side from `sizeRad` (at least 18 px),
grown by `(1 - confidence)` as an uncertainty margin, solid red at confidence
at least 0.6, dashed under it, dimmed when stale. Over it, one line: the
war's kind when it has one, the class words of `cls` and the confidence
(`STRIKER  AIR OBJECT 84%`); the rest of what is known is in the mode block.
With `predicted`, a dotted trail; with `lead`, the lead cue. Another track's
box carries its war kind, and in FULL its number.

**One marker an object.** Every box drawn is a claim (`avionicsHud.claims`,
`{ id, x, y, r, tag }`, handed to `warMarkers.setClaims` once): the war's
markers draw nothing for an attacker inside one, and write its kind's tag
into the claim, which the next paint puts in the box's tag. An attacker the
sensor has no track on keeps its war marker; off screen, its edge arrow and
its radar dot stay.

### 8.3 Declutter

`Y` steps the level, a setting (`avxLevel`, kept across reloads):

| Level | Draws |
| --- | --- |
| FULL | everything: the ladder to 20 deg labelled both ends, the line from the reticle to the lead cue, the other tracks' numbers |
| STANDARD (default) | the ladder to 10 deg labelled at its right end, the lead cue point, the other tracks' kinds |
| MINIMAL | the tapes, the roll arc and the horizon, the reticle and the primary's box; no panels, no tag, no lead or closure |

A ladder number gives way to any other word it would land on.

## 9. HUD states (`src/avionics/hudstate.js`, agent 1)

One state at a time, recomputed every frame from the systems, never stored
as truth anywhere else. Precedence, first that holds:

| State | When | What the HUD shows |
| --- | --- | --- |
| DEGRADED | link `lost` or `weak`, or video lost or snow at least 0.5, or nav `DR`, or battery `critical` | stripped down: attitude, tapes, energy and health blocks, a red `DEGRADED` line naming each cause; tracks only if not stale, no prediction or lead, EXT dimmed |
| TRACK | AI on and `primaryId` set | everything: box, callout, LEAD, CLOSURE, TRACKING block full |
| SEARCH | AI on, no primary | detections as thin boxes, `SEARCHING` in the TRACKING block |
| THERMAL | AI off, the sensor mode is an IR mode or fusion and the sensor is full screen (`mainView` 'sensor') | flight data unchanged, the HUD's ink turns white or black to read over the thermal picture |
| ASSIST | AI off, flight mode `angle` or `stab` | the MODE row lights `ACRO ASSIST` |
| MANUAL | otherwise | the MODE row lights `MANUAL`, TRACKING says `AI TRACK OFF` |

AI is the pilot's switch: `H` toggles it (MANUAL or ASSIST to SEARCH and
back). `Y` steps how much is drawn (section 8.3). `J` cycles the camera
mode, `K` the zoom, and `I` puts the sensor
full screen and back (section 5), so thermal full screen is `I` then `J` to
an IR mode or fusion, and THERMAL holds from then on while the AI is off.
`U` steps the inset's size (section 5). The keys act only while the Avionics HUD is on screen. None of them has a
pad button: a radio reports its switches as latched buttons, and the only
flight buttons are a standard pad's swap buttons (src/input/input.js).

## 10. The preset, its default, and war

- `ui.settings.hudStyle` keeps its values `osd` and `game` and gains
  `avionics`. The choice is now per airframe: `settings.hudStyleBy` maps an
  airframe id to the pilot's choice, written by the menu, so changing one
  aircraft's HUD leaves the others alone. A stored choice beats the default.
- **The default (owner, 2026-10-01: "make this be the default for war
  drones, but not regular drones"):** Avionics for every airframe with a
  `combat` descriptor in `configs/airframes.js` (today `7inch`, `10inch`, and
  the coming `interceptor`), on any map and in any mode. Every other airframe
  (the 5 inch, the whoops, all planes) defaults to the old global
  `hudStyle`, which is `osd` unless the pilot changed it before this
  existed, so nobody's racing HUD moves.
- `src/ui/fpvhud.js` is untouched and stays the racing default.
- **War.** The war HUD (`src/ui/warhud.js`: output, wave line, rack, kills)
  and the markers (`src/ui/warmarkers.js`: boxes, edge arrows, radar) stay
  where they are and stay theirs. They are MISSION and EXT data, already in
  the war's own green, and other agents are changing them; duplicating them
  in the avionics panels would show the same number twice. The avionics
  panels slide clear of them instead (section 8), and the layout check holds
  that with the war HUD present. The war markers' box round an attacker and
  the avionics target box can both be up: one is EXT (the room's list), the
  other is this aircraft's own perception, and the difference is the point.

## 11. Checks

- `npm run check:avionics-layout` (`scripts/avionics-layout.js`): every
  avionics panel inside the window and no two overlapping, at 1280x720 and
  1920x1080, alone and in a live war with the war HUD up (and not meeting
  the war HUD, its callouts or the radar); seating the
  7 inch shows Avionics, the 5 inch the FPV OSD, and a pilot's override
  sticks across a reload. And the owner's scene (the Striker in a war, nose
  on to a Striker attacker, the AI tracking) at 1280x720, 1625x1034 and a
  phone, at each declutter level: nothing opaque in the middle, one marker
  an object with the war's kind in the box's tag, no two words on each
  other or on a panel. `-- --owner` runs that scene alone.
- `npm run war:hudlayout`, `npm run lint:copy`, `npm run lint:shell` still
  pass.
- Screenshots are looked at against the reference and not committed.
