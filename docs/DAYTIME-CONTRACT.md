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

## What it does NOT do (yet)

- No existing file reads it in this slice. Nothing the player sees changes.
- Maps keep their own looks: colour, irradiance, exposure, sky stay in the map.
- No room state: free rooms do not share a time (owner question).
- Thermal's own fade (-0.05 to 0.15) is a blend, not a night verdict; left alone.

## Next slices

2. After #914 merges: the flight loop publishes one daytime from
   `scene.userData.timeOfDay`; perception light, world audio, attacker nav
   lights and `worldlight.js` read it instead of war state or `worldTime`.
   Browser check at `?map=interior&hour=22` and `?map=itaipu&time=night`.
3. Swiss2 and alps stop accepting a `?time=` they cannot draw (owner question
   if a night valley is wanted).

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
