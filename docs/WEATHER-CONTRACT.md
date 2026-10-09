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
  boundary layer's depth apart). They do not yet know water: Itaipu's
  reservoir has them too, which real water does not (a follow up: a per
  map dry ground test). Ridge lift: a zone with `lift` (about the face's
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

`npm run check:weather`, the real page (a browser check, run locally through
the slot script): a calm run makes no `sim_set_wind` call; after
`__weather('gusty', 42)` a fresh run sets the wind every step and `sim_wind`
reads it; calm again makes exactly one still call and reads still air.

`npm run check:weather-room`: two pages in one room on a rooms server the
check starts; the host's gusty reaches both with the same seed, a non host
is refused, calm again is calm on both. The room's messages are also in
`npm run rooms:selftest` (scripts/rooms-selftest-weather.js, CI).
