# Daytime: the contract (Foundations item 7)

Survey: ~/Desktop/fdfpv-loop/FND-7-SURVEY.md (2026-10-10, main d839f05c).

## The problem

No shared time of day exists. Itaipu builds once at a named time
(`look/light.js` TIMES), the Interior moves its sun on the room clock
(`interior/sun.js`, `look.js setLocalTime`), and "is it night" is decided in
five places from different sources (scene flag, `roomWar.night()`,
`worldTime`, war time, and PR #914's `worldlight.js`). So perception, world
audio and nav lights can disagree with the sky the pilot sees: solo
`?time=night`, Interior after dusk, swiss2 and alps with `?time=night`.

## What this adds (slice 1, additive)

`src/share/daytime.js`, three-free, importable by the page and the room:

| Export | Meaning |
|---|---|
| `TIME_NAMES` | `day, morning, noon, golden, night`, Itaipu TIMES's order |
| `SUN_OF[name]` | `{ azimuth, elevation }` in degrees, azimuth clockwise from north, equal to TIMES |
| `NIGHT_SIN` | `-0.05`: night when the sine of the sun's elevation is at or below it (the Interior's shipped flip, sun 2.9 degrees under) |
| `isNightSun(sinEl)` | night for a moving sun |
| `nightOfTime(name)` | night for a named time; null is the map's own (day); an unknown name throws |

The values are copied from the map modules, not imported, because those need
three. The selftest makes the copy safe.

## Slice 2: the room's game clock (owner decisions 2026-10-10)

Owner: night is reachable in normal play; one game time per room, shared by
all its players (free, race, tag, combat, jam, war, ops).

**The clock.** `{ hour, rate, at }`: the local solar hour `hour` at room ms
`at`, and `rate` hours of day per hour of room; `null` is no clock, each
world at its own time (what every world did before clocks). Added to
`src/share/daytime.js`:

| Export | Meaning |
|---|---|
| `TIME_HOUR[name]` | the hour a named time stands for: the hour whose sun (`sunSinAt`, the Interior's `sun.js`) is nearest `SUN_OF`'s elevation, within a degree; noon is the sun's highest |
| `timeOfHour(h)` | night when `isNightSun`, else the nearest daylight name |
| `clockOfTime(name)` | a standing clock (`rate` 0) at the name's hour; null for null |
| `clockOf(x)` | a clock from the network or the address, checked, or null |
| `hourAt(clock, roomMs)` | `localHour`'s arithmetic (`src/share/interior/clock.js`) |
| `timeOfClock(clock)` | the named time a world built once is built at: its clock's start |
| `publishDaytime(night, builtAt)`, `daytimeNow()` | the frame's one `{ night, time }` |

**Who owns it.** The room server (`edge/rooms/core.js daytime`):

- an ops match: its mission's clock, `{ startHour, 0, 0 }` until the go,
  then `{ startHour, rate, goAt }`, so the Interior's sun moves for every
  screen from the go (it did before, computed on each screen);
- a war: the match's mission time while it is on; in a war room the
  lobby's mission's time between matches (so every screen builds the
  mission's world before the briefing, as `warTimeFrame` did from the
  client's lobby); a war started in another room keeps its time over its
  end and its result, as the client did. Since 2026-10-14 (TECH-NEEDS
  T1.11) the mission's light may move across its stages:
  `missionClock(time, stages, stage, endAt)` (slice 4, below);
- any other room: the time its host set, `meta.daytime`, a `TIME_NAMES`
  name or null. The room's creator's setting is its time from its start
  (`POST /v2/create { daytime }`); after that the host's
  `{ type: 'daytime', time }`, offered at the host's run start as the
  weather is. Only the host; anything not a name or null is nothing.

It goes to every pilot and watcher in the welcome (`daytime`) and as
`{ type: 'daytime', daytime }` whenever it changes (checked after every
text message and every tick). A build from before this passes over both.
`src/share/rooms.js` checks it at the network's edge (`clockOf`).

**Solo.** The address's `?hour=` or `?time=`, else the pilot's **Time of
day** setting: `own` (the default, each world's own time, so nothing
changes for anyone who never touches it), day, morning, noon, golden,
night. The row sits under Weather in Free Flight's settings, the least
intrusive place: the same screen, the same room rule as the air, and no
new UI. In a room the host's choice is everyone's, as the air is.

**The world.** A world built once at a named time (Itaipu) is built at
`timeOfClock` and rebuilt through `syncWorld` when that moves. A world that
moves its sun (the Interior, `setLocalTime`) is never rebuilt for the time:
`daytimeFrame` tells it `hourAt(clock, roomMs)` every frame, or its own
hour (`ownHour`) with no clock. Swiss2 and the Alps draw their one sun
whatever the clock (slice 3); their scene has no night flag, so everything
below stays day there, agreeing with the sky.

**One value per frame.** `src/main.js daytimeFrame`, first in the frame
(`dressWorld`), publishes the craft's world's `scene.userData.timeOfDay`.
Everything that acts on the dark reads `daytimeNow()`:

| Reader | Before |
|---|---|
| detection's light, `avxEnv.light` | `roomWar.night()`: war rooms only |
| world audio (`worldAudio.post` time) | `worldTime`, the build's name: night sounds over swiss2's day sky |
| the sensors' time of day (`sensors.js`) | the scene flag, re-read once a second |
| thermal weather (`thermal.js sceneWeather`) | the scene flag |
| Night Timber factory lights (`nighttimbercraft.js`) | `src/render/worldlight.js` (#914), folded in and deleted |
| war attackers' nav lights | the war's mission time |

`roomwar.js time()` and `night()` lost their last reader and are gone.

## Slice 4: a war mission's light across its stages (2026-10-14)

A stage may carry `daytime: { to, ms }`, a `TIME_NAMES` name and a
length. The clock gains an optional `to`, an hour after `hour` and less
than a day on (`clockOf` keeps it, or drops it): where a moving clock
stops (`hourAt` stops there, and never runs back before `hour`), or the
last hour a standing one will reach.

| Export | What |
|---|---|
| `missionLight(time, stages)` | each stage's starting hour by the stage graph (exits, picks), each ramp's end, the last; throws when two ways into a stage disagree |
| `missionClock(time, stages, stage, endAt)` | the room's clock: the start standing (`to` the last hour) before any stage; a ramp stage's moving clock from its room ms; standing at the hour reached over the end |
| `hourAfter(from, name)` | the first hour after `from` that is the name's |

A clock with a `to` builds Itaipu for both ends (`options.toward`,
`src/main.js timeOptionsOf`), with `setLocalTime`, so `daytimeFrame`
moves its light as the Interior's, and the world is kept while the
clock's times stay inside its `timeSpan` (`worldTimeMatches`).
`?time=A&toward=B` builds one solo, standing at A. A mission with no ramp
has its named time's clock everywhere, as before. `npm run daytime:ramp`
(local, GPU) holds both ends of a ramp to the worlds built there;
`npm run daytime:war` (local, GPU) flies Lights Out's ramp on a room.

**Release order for slice 4: the page first, or with the VM.** An old
page on the new server drops the clock's `to`, builds Itaipu at the
golden hour as before, and rebuilds it mid mission when The Dark's
standing night clock arrives (and The Long Night's end, if it stands
in the morning). A new page on the old server is told the mission's one
time, as before: no ramp, nothing worse. Both missions are
`development`, so only developer rooms meet the gap.

## What it does NOT do (yet)

- Maps keep their own looks: colour, irradiance, exposure, sky stay in the map.
- A free room's time stands (rate 0): no map but the Interior can draw a
  moving sun, and the Interior's moving clock is its missions'.
- Thermal's own fade (-0.05 to 0.15) is a blend, not a night verdict; left alone.
- Swiss2 and alps still take a time they cannot draw (slice 3, owner
  question if a night valley is wanted).

**Release order.** The rooms server needs a VM deploy. A new page on an old
server is told no clock, so a night war mission would be built by day until
the VM is deployed; an old page on the new server passes over the clock and
works as before. Deploy the VM first, or with the page.

## The check

`npm run daytime:selftest` (CI, checks.yml), Node only:

- `TIME_NAMES` equals itaipu `Object.keys(TIMES)` (live module, three stubbed)
  and, minus `day`, `main.js ADDRESS_TIMES` (parsed from source);
- `SUN_OF[n]` equals `TIMES[n]` azimuth and elevation for every name;
- the Interior's threshold parsed from `look.js` equals `NIGHT_SIN`, and
  `isNightSun` agrees with it at every minute of `sunAt(h)` over 0 to 24 h
  (one dusk, one dawn);
- `nightOfTime(missionTime(m))` equals `m.night === true || m.time === 'night'`
  for every war mission, and at least one mission is at night;
- negative control: a threshold 0.01 off either way disagrees with the sweep.
