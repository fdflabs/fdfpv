# Avionics perception: PerceptionAI and the TrackManager

The model behind `src/avionics/perception.js` and `src/avionics/tracks.js`,
its numbers, what the check measures, and the changes this side proposes
to `docs/AVIONICS-HUD.md` (sections 6 and 7), which is the lead's file and
the interface. Where the two disagree, section 7 below says which way and
why.

The rule both modules keep: the HUD shows what the aircraft's own sensor
could know. Truth goes into PerceptionAI and nowhere else; what comes out
is a direction, a size in pixels, class hypotheses and a range interval,
each with the noise, the misses and the confusions a real detector has.
The TrackManager builds tracks from those detections alone, by geometry.
Nothing here reaches the plant or the room, so no gameplay outcome
changes; the war's markers and radar (`src/ui/warmarkers.js`) stay the
MISSION and EXT layer, and a track here is always `EO`, `IR` or `FUSION`.

## 1. PerceptionAI

Runs at `PERCEPTION_HZ` (15) on the sim clock: a frame inside a tick keeps
that tick's detections, so the cost and the noise are per tick, not per
frame. Every random number is an integer hash of (seed, object, tick,
channel), so a seed and a sim clock give the same detections in any run.

Per object and tick, in this order:

| Step | Model |
| --- | --- |
| In view | in front of the camera and inside the picture (`fovRad` and the camera's aspect) |
| Occluded | the line of sight sampled at 24 points against `heightAt(x, z)`, the terrain's top: ground, water and the dam. Any sample under it hides the object |
| Pixels | size over range, times the sensor's pixels per radian: 1080 rows (a gimbal EO camera, not the browser window) over the field of view; digital zoom gives back only the square root of its factor; the thermal core has 0.55 of EO's resolution |
| Contrast | the band's, between day and night by `env.light`: EO 0.6 by day, 0.03 at night; low light 0.5 and 0.3; high contrast 0.7 and 0.04; IR 0.45 by day, 0.9 at night, times the object's heat. Ground behind it rather than sky keeps 0.5 to 0.65 of it, the sun within 20 degrees costs EO up to 80 %, the air costs `exp(-ext * km)` (EO 0.3 a km, IR 0.12), the sensor's own noise up to half |
| Motion | up to 35 % more signal at 0.05 rad/s across the picture |
| Detection | signal = pixels x contrast x motion, and x pixels again under one pixel (a sub pixel target's contrast is spread over the pixel). A logistic centred on 0.8 with width 0.1, drawn against a seeded uniform; under 1 % it is never detected (the detector's threshold over its false alarms) |
| Class | from an uninformative prior toward the true class's confusion row as the contrast weighted pixels grow from 2 to 10 (Johnson: a pixel or two detects, about six recognise), at 0.7 of that seen nose on, 25 % seeded noise on each class. A fixed wing is confused with a light aircraft and a loitering munition, a multirotor with an unknown blob |
| Range | the measured size (8 % and a third of a pixel of noise) plus or minus 0.6 px and 12 %, against the size interval of every plausible named class (p at least 0.15). `unknown` adds its 0.2 to 14 m only when no named class is plausible. Once identified (8 to 20 weighted pixels, and only when the top class is right) the type's own size, -20 % to +25 % |

Classes and sizes, metres: `fixed_wing_uav` 1.5 to 4.5, `loitering_munition`
0.8 to 2.0, `multirotor` 0.2 to 0.6, `light_aircraft` 7 to 14, `boat` 3 to 9,
`unknown` 0.2 to 14. The war's kinds map onto them in `WAR_KINDS` (Scout and
Striker and the decoy fixed wing, the Loiterer a loitering munition, FPVs
and Hunters multirotors, boats boats), with the sizes of
`src/render/attackers.js` and a heat for the thermal band. A decoy looks and
burns like a Striker, so perception cannot tell them apart either.

Modes onto bands: `eo`, `lowlight` and `contrast` their own, `ir_wh` and
`ir_bh` the IR band, `fusion` both, keeping the stronger signal, tagged
`FUSION`. `sensors.state.healthy` false detects nothing.

`load` (SIM, for FlightTelemetry's CPU): 0.18 idle, plus 0.03 for each
object in the picture and 0.05 for each detection, at most 1.

## 2. TrackManager

Acts once per perception tick. Association is by geometry only: each track
predicts its line of sight on at its turn rate (an alpha beta filter in
angle, gains 0.5 and 0.15), corrected at once for the aircraft's own known
velocity across the line of sight, and detections go to tracks greedily,
cheapest first (angle over gate plus 0.3 times the log size ratio), inside
a gate of 0.02 rad, plus 0.06 rad a second unseen, plus how far the
aircraft's own motion could have turned the line were the target at the
near end of its range. `truthKey` is never read.

| State | Rule |
| --- | --- |
| tentative | born from a detection nothing claimed; forgotten after 3 misses running; not in the snapshot |
| confirmed | 3 hits in its last 5 ticks |
| stale | no detection for `STALE_S` (0.6 s); it coasts on its prediction and its range moves with its radial velocity |
| dropped | no detection for `COAST_S` (2.5 s): into `snapshot.lost` for `GHOST_S` (3 s), held at its last estimated position and re-aimed from where the aircraft is |
| re-acquired | a detection inside a coasting track's gate keeps its id; after the drop it is a new id |

Estimates:

- **Range**: the detections' intervals, smoothed in log space (0.3 a hit).
  The geometric middle is the point estimate where one is needed.
- **Closure** from looming: the least squares slope of log size over the
  last 45 hits (3 s) is closure over range, whatever the object's real
  size. One standard error each way over the range interval is
  `closureMs`; with fewer than 8 hits there is none, and then no
  prediction or lead either.
- **Relative velocity**: minus closure along the line of sight plus the
  turn rate times the range; `sigma` is half the closure interval plus the
  range interval's half width times the turn rate.
- **Lead**: the smallest positive root of `|r + v t| = s t` at the
  aircraft's own speed, under 60 s; `lead.tS` is that time to go and
  `lead.losW` where to point. A camera standing still has no lead.
- **Class**: log likelihood ratios against the prior, decaying 0.9 a tick
  and adding 0.2 of each detection's, so steady evidence counts twice and
  the hypotheses rest at the prior with none. `cls` is the top hypothesis
  once it reaches 0.6 and is not `unknown`, else `air_object`.
- **Confidence**: a mean (0.12 a tick) of each tick's detection quality, 0
  on a miss: whether the track is real and held, not what it is.
- **Visibility**: the same mean of seen or not. **Occlusion**: while
  unseen, the share of 5 points along the range interval the map hides.
- **Prediction quality**: track age over 2 s, times hits in the last 5,
  times how full the looming window is, over 1 plus the range interval's
  relative width.
- **Primary**: kept while it lives; when there is none, the confirmed, not
  stale track nearest the boresight with confidence at least 0.3.
  `cycle(dir)` steps by id.

## 3. The check

`npm run check:perception` (`scripts/perception-check.js`, about a second,
no browser) flies mission 1's attackers through `src/share/war/routes.js` as
the room does, against the hunters' floor (`src/share/war/itaipu-height.bin`)
for the terrain, with the FPV camera's default 85 degree field of view.
What it measured on seed 11:

| Scenario | Result |
| --- | --- |
| Striker toward a camera over the dam, EO day 4x | nothing past 3 km; first detection 1.92 km, confirmed 1.20 km; confidence 0.31 to 0.86 and p(fixed wing UAV) 0.20 to 0.72 from the far third to the near; range hi over lo 12.4 to 4.8; the interval holds the truth on 561 of 567 tracked ticks; named `fixed_wing_uav` on 101 of 112 ticks inside 400 m; turned away, no detections |
| The same from the gorge, dropping behind the dam | one track through the dive, stale and coasting with occlusion 0.8, dropped at 2.5 s into the ghosts, the ghost gone 3 s later, re-acquired with the camera back up as a new id |
| First confirmed range at 2x | EO day 0.90 km, EO night never, low light night 0.46 km, IR night 1.14 km, IR day 0.57 km |
| FPV on the gorge route, 4x | confirmed at 0.20 km, named `multirotor` on 49 of 65 ticks inside 70 m (a 0.25 m quad is a dozen pixels only there), never another class |
| Camera flying at the Striker at 30 m/s | a lead on 187 ticks, within a factor of 2 of the true time to intercept on 176, its direction 1.4 degrees from the true intercept point (median) |
| Repeat | seed 7 twice identical, seed 8 different |
| Cost, mission 1 round 5 at 8 pilots (47 attackers, 13 tracks) | wall 0.013 to 0.016 ms a frame on average; CPU a tick 0.05 to 0.08 ms mean, 0.2 to 1.0 ms p99, 3 to 7 ms worst (single ticks in 1800, garbage collection or a recompile) over several runs |

The check passed on seeds 1 to 80 (`--seed=N`). Cost is CPU time
(`process.cpuUsage`), not wall time, because this host runs other work
and wall time swung the p99 between 0.4 and 3 ms from run to run. A
frame at 60 Hz has 16.7 ms; perception and tracking average well under
1 % of it.

## 4. Changes proposed to docs/AVIONICS-HUD.md

The lead owns that file, so these are proposals; the code already does
them, and each is additive except 4 and 5.

1. **Construction takes the map.** `createPerception({ seed, heightAt })`
   and `createTrackManager({ heightAt })`, with `heightAt(x, z)` the
   terrain's top in render metres (the shell's `view.height(x, z,
   Infinity)`). Without it nothing is ever occluded and every background
   is sky.
2. **`perception.update` takes `env` fifth**: `{ light, sun, haze }`,
   light 0 (night) to 1 (day), sun a unit vector or null, haze a
   multiplier, default full day. In a war, `light: roomWar.night() ? 0.05 :
   1`. Without it the thermal advantage at night never shows.
3. **A detection also carries `rangeM: { lo, hi }` and `tS`**, and
   `hypotheses` lists every class. The range interval is PerceptionAI's,
   from the size it measured.
4. **`truthKey` is for checks only**, not for association. Section 6 says
   the TrackManager associates by it; a tracker that does cannot lose a
   target behind the dam or swap two close ones, which is half of what the
   owner asked to see. Association is by direction and size.
5. **Class against confidence.** Section 7.2 says the label is AIR OBJECT
   below confidence 0.6. Here `confidence` is the track's existence
   (detection quality held over time), which reaches 0.8 long before the
   class is known, so that rule would print `UNKNOWN` or a guess at 0.3.
   Instead `cls` itself is `air_object` until the top hypothesis reaches
   0.6; the HUD can print `cls`'s words and `confidence` as the percentage,
   which is exactly the reference picture's `AIR OBJECT 82%`.
6. **`lead.tS` is a duration**, the time to go to the intercept, not a sim
   clock instant.
7. **`perception.reset()`** for a new run, as the TrackManager has.
8. **`ownship.v` is used**: the lead and the own motion correction need the
   aircraft's velocity in the render frame, m/s. `ownship.camera` needs
   `quaternion` ({ x, y, z, w }, world) and `aspect`, which the shell's
   camera has, being a child of the scene.
9. `predicted` and `lead` are empty or null until a track has 8 hits (the
   looming fit's least).
