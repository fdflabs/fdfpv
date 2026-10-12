# An aircraft as one folder of data

Foundations item 5, slice 1 (2026-10-10), slice 2 (2026-10-12).

## Layout

`aircraft/<id>/aircraft.js`, one file per aircraft: the GPLv3 header, then `export default` and plain
JSON. It is an ES module rather than a `.json` file because a JSON module import (`with { type: 'json' }`)
needs Firefox 138 and Safari 17.2, and a module that fails to parse stops the whole boot; nothing else in
the game needs a browser that new. The selftest holds the file to header, `export default`, JSON and `;`,
so it stays data a generator in any language can read. Sections:

| section | today's hand module row |
|---|---|
| `airframe` | `configs/airframes.js` AIRFRAMES row; `gear` and `floats` state `restPitchDeg`, which the assembler turns into `restPitch` by the hand rows' own `deg * Math.PI / 180` |
| `kit.slots`, `kit.drawn` | `configs/kits.js` KITS[id], membership of DRAWN |
| `tuning` | `configs/tuning.js` TUNING[id] |
| `power.table`, `power.options`, `power.estimates` | `configs/power.js` TABLE[id] and POWER[id], `configs/power-estimates.js` ESTIMATES[id] |
| `hangar.props`, `hangar.anchors` | `configs/hangar-parts.js` PROPS[id], ANCHORS[id] |
| `livery` | `configs/liveries.js` LIVERIES[id] |
| `tunes` | `configs/registry.js` TUNES rows with `airframe: id` |
| `progress.level` | `src/game/progress.js` PLANE_LEVELS[id] |
| `strings.en`, `strings.es` | the aircraft's keys in `src/strings/en.js` and `es.js` |

`configs/aircraft.js` imports every folder statically (`FOLDERS`), validates each folder's sections and
id, and assembles the tables in the hand modules' shapes (`AIRCRAFT`). It loads the same in the browser,
the servers and the scripts. `npm run aircraft:folder` (in CI) proves `FOLDERS` names exactly the folders
on disk, each file is data only, every assembled row equals the hand module's row exactly (key order,
types, doubles by `Object.is`), the stated stock packs and rates equal a hand row's (`packStates()`,
`stockRates()`), and that eleven single-field changes made in memory each fail.

## Covered

The P-51 (`p51d1450`), the CAP 580 (`cap1702`, generated from its hand rows when it was added, 2026-10-11), and the Slick 580 (`slick2680`, docs/SLICK-STAGE1.md), which was born with its
folder on 2026-10-11 (strings: its carousel note, blurb, power option and three schemes). Values are the evaluated rows: source strings built from shared constants and
template literals in the hand modules are stored as their full text, and the kv650's `massKg` (written
`2.35 + 0.045`) as 2.395, which is the same double.

## Not in the folder yet (computed or not data)

- Tune diffs `configs/p51-{stab,acro,manual}.diff`, the builder `src/render/p51craft.js`, camera mount in
  `src/main.js`, per-plane branches in `navlights.js`, `partsfit.js`, `wreck.js`, `floatset.js`.
- `configs/motors.js`, `motor-estimates.js`, `prop-estimates.js`, `rates.js`, `ratepresets.js`, `hulls.js`,
  `hullfit.js`, `paint.js` rows; `src/share/session.js` id list.
- The C plant (`plant_wing.c` FW_* constants, `sim_internal.h` ids), crash rows, and the per-plane checks
  (`scripts/p51-*.js`, `tests/p51-thresholds.json`, baselines, `docs/P51-STAGE1.md`).

## Next

1. After the open lane PRs drain: the hand modules read the P-51 from `configs/aircraft.js` (a
   browser-safe load, likely a JSON import), goldens unchanged; decide how a folder states the computed
   fields.
2. The rest of the fleet, then the lists above, then a generator for the C tables whose output diff is empty.
