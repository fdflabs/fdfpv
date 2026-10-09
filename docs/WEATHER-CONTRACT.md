# Weather: the contract (Wave 3 item 20, second half)

Lane "weather", 2026-10-07. The plan's note on item 20: "weather as gameplay
(deterministic, room-authoritative)". This file says what the player meets,
how the air is computed and fed to the plant, what is room state, what ships
in which PR, what it does NOT do, and the checks that prove it.

## What the brief said, checked against the tree

- "Flight Club wind is the host's choice (calm by default)": not built. No
  file in src/ calls `sim_set_wind`; only scripts/ do (crash-core-selftest,
  lib/crash-scenarios). Every flight today is in still air. There is no host
  choice to keep, so this work adds the first one.
- "wind/gusts in the plants": true. `sim_set_wind(vx, vy, gust)` is one
  horizontal wind for the whole world plus gusts that are a fixed sum of seven
  cosines on the sim clock (src/native/plant_wing.c, plant_wind). It has no
  position: the plant cannot know about altitude or shelter.
- Vertical air already exists, but fixed: `plant_air_lift` is three thermals
  over the airfield, between 5 and 300 m, felt by the Radian only. There is no
  setter for it.

## What the player sees

- A room's host picks a weather preset in the room's settings: Calm (the
  default, exactly today's flight), Breeze, Gusty, Front. Solo flying uses
  the same picker in the flight settings.
- Every pilot in the room flies the same air: the room hands out one preset
  and one seed, and the air is a pure function of (map, preset, seed,
  position, room time).
- The wind gets stronger with height (layers), is weaker behind shelter and
  rougher near the zones a map names (on Itaipu, the main dam's crest), and a
  gust front sweeps across the map now and then: a band of stronger, rougher
  wind moving downwind.
- The HUD's existing wind reading (fpvhud.js reads `sim_wind`) shows it.
- Later PRs: rain and haze on the sky that follow the preset, within the
  11.1 ms frame budget.

## How the air reaches the plant (the plant is NOT edited)

The flightmodel lane owns src/native/plant_wing.c. The only existing input is
`sim_set_wind`, so the host evaluates the field and pushes it:

- `src/game/weather.js`: `makeWeather(mapId, presetId, seed)` returns null for
  Calm, else `{ at(x, y, z, t, out) }`: map (Three.js) frame, metres, seconds.
  `out` gets the mean wind `x`, `z` (m/s, the way it blows TOWARD) and `gust`,
  the gust RMS m/s. Only `+ - * /`, comparisons, `Math.sqrt` (IEEE correctly
  rounded) and integer hashing: no `Math.sin/cos/pow`, so it is the same
  bits in every engine (CLAUDE.md).
- src/main.js, before every `sim.step(1)` in flight: the craft's plant
  position to the map frame (`plantToWorld`, the path water already uses),
  `at(...)`, the vector back into the plant frame (`waterFrame.dir`), clamped
  to the ABI's limits (speed 30, gust 0 to 10), `sim_set_wind`. Once per sim
  step, keyed on the plant's own clock (state[0]), never per animation frame.
- Calm makes no call, except ONE `sim_set_wind(0, 0, 0)` when a run starts
  after a windy run (any run after a windy one makes that call, so the
  launch stand never steps in the last run's wind): the wind is a world property kept across `sim_reset`, so
  "never call it" would leave a windy run's air in the next calm one, and
  "always call it" would change every calm flight's call stream (recorded
  flights, contact:golden start from restartPlant's order).
- Not on the launch stand: the stand steps in still air, the field starts
  with the first step in flight.
- A non calm preset never reaches exactly zero (gust floored at 0.01 m/s):
  `SIM_WIND_ON` turning off mid flight would switch a wing's ground contact
  model mid flight.
- Replays: the journal (src/replay/journal.js) records every call into the
  module with its doubles, so the per step `sim_set_wind` replays itself.
  Recorded flights from before this are calm and unchanged. A TAKE OVER
  restores the plant's whole region, the wind with it, so it counts as wind
  having been set: the next run clears it.

## Data shapes

```
PRESETS[id] = { speed, layers: [[h, mul], ...], gust, front }
  speed   mean wind at h = 0 above the map's base height, m/s
  layers  piecewise linear multiplier of the mean by height above base, m
  gust    gust RMS everywhere, m/s
  front   null, or { every, width, speed, boost, gust }: bands `every` m
          apart, `width` m wide, moving downwind at `speed` m/s; inside one
          the mean is multiplied by up to `boost` and `gust` m/s is added.
MAPS[mapId] = { base, toX, toZ, zones: [{ line: [[x, z], ...], r, shelter, gust, top }] }
  a zone is the band of radius r round a polyline (map frame); on the line
  the mean is multiplied by `shelter` and `gust` m/s is added, fading to
  nothing at r (smoothstep), and with height from `top` m above base to
  twice that. Overlapping segments of one line count once (nearest point).
seed: unsigned 32 bit. It turns the wind's direction (within about 25
degrees of the map's prevailing direction) and shifts the fronts' phase.
```

Room state (PR 2): the host sends `{ type: 'weather', preset }`; the room
draws the seed (crypto, 0 for calm), keeps `meta.weather = { preset, seed }`,
puts `weather` in every welcome (calm for a room from before it) and tells
everybody `{ type: 'weather', preset, seed }`. A non host is refused
(`why: 'host'`), an unknown preset is ignored. Each pilot's next run flies
it, with `t` = the room's clock at the run's start plus the plant's clock, so
a front is where it is for everyone. A war flies calm. Needs a VM deploy
(edge/rooms).

## The surface (lane weather 2, 2026-10-08)

The thermals know what they rise from. Before this they formed over
Itaipu's reservoir, which real water does not do.

What the player meets: no thermal over the reservoir, the Swiss lake or the
Interior's river and ponds, and weak sink there on a thermal day; thermals
over forest a little weaker than over pasture; over bare red soil, rock,
scree and towns a little stronger; none over lying snow. Calm and Front
(no thermals) fly exactly as before.

Data: `src/game/weather-surface.js`, GENERATED by
`scripts/weather-surface-build.js` (`npm run weather:surface -- --three=DIR
[--check]`), one grid of classes per map (`weather-surface-classes.js`:
water, forest, open, bare, snow), each cell the majority of its samples at
the source's own spacing, committed as runs (45 KB in all):

```
itaipu    160 m cells, 256 a side, the ring (40.96 km): inside water.json's
          two outlines is water, else masks/ring.png's largest channel
          (forest; field = open; red soil + urban = bare). The data folder
          from FDFPV_ITAIPU_DATA or the published one, sha256 checked
          against its manifest.
interior  80 m cells, 288 a side, the data square (23.04 km): land.bin's
          ESA WorldCover classes (forest and wetland = forest; pasture,
          crop, shrub = open; bare, built, burned = bare). 80 m, not 160,
          so Rio Sereno and the ponds (0.3% of the land) survive.
swiss2,   100 m cells, 60 a side, the field (6 km): groundZone on each
alps      map's own field (the lake below LAKE_Y, snow, forest, rock and
          scree = bare, the rest open).
```

At run time no terrain function is called (they use Math.pow): the grid is
read bilinearly between cell centres (+ - * / and floor), so the air stays
the same bits in every engine. A thermal's whole contribution (core and
ring of sink) is multiplied by HEAT at its core's place on the map; water
adds sink at the craft, 0.15 x the preset's core rate x the thermal height
profile (the share the ring of sink round a core already uses).

HEAT, and where the numbers come from:

- Ordering (FAA Glider Flying Handbook, ch. 9): bare and built ground and
  dry fields are good sources, forest weaker, lakes and wet ground poor,
  often sink.
- Ratios, derived: a core rises at about the convective velocity scale
  w* = (g / T x zi x H / (rho cp))^(1/3) (Deardorff 1970; Stull 1988,
  ch. 11), so under one sun and one boundary layer it goes as the
  cube root of the ground's sensible heat H = A x B / (1 + B), B the Bowen
  ratio: about 0.25 for moist forest and wetland, 0.6 for pasture and
  crops, 1.5 for bare soil, rock and built ground (Oke, Boundary Layer
  Climates, 1987: typical ranges by surface, chosen within them, not
  measured for these places). Relative to open ground:
  forest (0.2 / 0.375)^(1/3) = 0.81, bare (0.6 / 0.375)^(1/3) = 1.17,
  used as 0.8 and 1.15. The presets' rates are open ground's, so a
  thermal over pasture is what it was.
- Water and snow: 0. The lake is cooler than the air over it by day and
  snow holds at 0 C, so the air over both is stable.
- Water's sink: continuity says the air lifted elsewhere comes down over
  ground that makes none, not how fast; the model's one figure for that
  is the ring's 0.15 of a core, so Breeze sinks 0.33 m/s over water,
  Gusty 0.18.

Not built: sunlit slopes. Which face the sun heats depends on the hour,
and the Interior's sun moves with the mission clock (src/maps/interior/
sun.js) while the air must not read it; "sunlit ground" here is bare
ground and rock, by its Bowen ratio.

## What it does NOT do

- Vertical air (`out.up`, fed through `sim_set_air_vertical` each step with
  the wind, #849) is thermals and ridge lift only: no rain drag, no
  downbursts. Thermals: at most one per 1.2 km square (60% of squares, by
  the seed), a 90 m core rising up to the preset's rate (Breeze 2.2 m/s,
  Gusty 1.2, Fronts none: overcast) with weak sink out to 180 m, forming
  5 to 40 m above the base and gone 700 to 1000 m up, each waxing and
  waning over 15 minutes and drifting with the wind (Stull, An
  Introduction to Boundary Layer Meteorology 11.1; FAA Glider Flying
  Handbook ch. 9: cores 1 to 3 m/s, 100 to 300 m across, about the
  boundary layer's depth apart). Each is as strong as the ground under its
  core heats the air, and water sinks: see "The surface". Ridge lift: a zone with `lift` (about the face's
  slope sine) lifts the air on its windward side by lift x the wind across
  it, and lets it down in its lee at half that: the dam (0.6) and the
  valley rims (0.65, little in practice: the valley's wind runs along
  them). The Radian's own three thermals (plant_air_lift) stay as well.
- No terrain sampling at run time: zones are authored per map from a
  height probe (window.__heightAt on a 100 m grid). Itaipu: the dam crest.
  Swiss2 and the Alps (one valley): wind along the valley, a sheltered
  floor, rough rims. The Interior: wind from the north east, Rio Sereno's
  lowland a little calmer and rougher. Sources and numbers in weather.js.
- No random numbers at run time, no wall clock.
- No weather in the war mode or campaign until their owners ask.
- Known edge: the map to plant rotation (`qSpawn`) is built with JS trig once
  per spawn, as the water's frame already is. Same seed, same machine, same
  air to the bit; across engines the direction may differ in the last bit.

## PRs

1. This contract, `src/game/weather.js`, `scripts/weather-selftest.js`
   (`npm run weather:selftest`, in checks.yml), the per step hook in main.js,
   reachable only through `window.__weather(preset, seed)` (the next run
   flies it): nothing changes for any player.
2. Room protocol: preset + seed in room settings, room time. VM deploy.
3. Presets UI: host picker (room settings) and solo picker, strings en + es.
4. Visuals: rain and haze from the preset, coordinated with the clouds lane
   through the plan file (sky.js is theirs).

## The checks

`npm run weather:selftest`, Node against the committed dist/sim.wasm:
1. Same map, preset and seed: two fields give the same output to the bit at
   every sample; another seed gives different air.
2. Every preset on every map stays inside the ABI's limits over the map and
   over an hour; non calm never reaches zero.
3. The field has layers (more wind higher), shelter/turbulence in a zone, and
   a front that passes.
4. A flight driven by the field twice from fresh is bit identical.
5. A calm run after a windy one (wind kept across reset) is bit identical to
   a run that never had wind.
6. The surface (3c): a front's air on every map hashes to what it did
   before the surface (recorded at 10fc77de); over Itaipu's reservoir a
   kilometre above the dam no rise at any height over a thermal life and
   sink 0 to -0.5 m/s; the reservoir, the Swiss lake and Rio Sereno are
   water on their grids; over a uniform map of each class every thermal
   is open ground's times 0.8 (forest), 1.15 (bare), 0 (snow), and water
   only sinks.

`npm run weather:surface -- --three=DIR --check` (local, needs three and
the Itaipu data or the network): the committed grids are what the data
gives.

`npm run check:weather`, the real page (a browser check, run locally through
the slot script): a calm run makes no `sim_set_wind` call; after
`__weather('gusty', 42)` a fresh run sets the wind every step and `sim_wind`
reads it; calm again makes exactly one still call and reads still air.

`npm run check:weather-room`: two pages in one room on a rooms server the
check starts; the host's gusty reaches both with the same seed, a non host
is refused, calm again is calm on both. The room's messages are also in
`npm run rooms:selftest` (scripts/rooms-selftest-weather.js, CI).
