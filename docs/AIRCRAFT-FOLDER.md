# An aircraft as one folder of data

Foundations item 5, slice 1 (2026-10-10), slices 2 and 3 (2026-10-12), slice 4, the C tables (2026-10-12).

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

A row the aircraft has none of is stated `null` (`kit.slots`, `tuning`, `power.table`, `power.options`,
`power.estimates`, `hangar.props`, `hangar.anchors`, `livery`, `progress.level`), and the assembler gives
that table no key for it, as the hand module has none. The section is always there, so a missing one is
still an error.

The aircraft's keys are one rule, whatever the plane's names look like: every key with the id as a dot
segment (`carousel.note.<id>`, `airframe.blurb.<id>`, `livery.scheme.<id>.*`, a quad's `motors.<id>.*`)
and every key its power options name (`power.cap.stock`), in `en.js` order. A float plane's power options
are its land plane's, so its folder carries copies of the land plane's power keys too; the assembler
takes either, and the selftest holds both to `src/strings`.

`configs/aircraft.js` imports every folder statically (`FOLDERS`), validates each folder's sections and
id, and assembles the tables in the hand modules' shapes (`AIRCRAFT`). It loads the same in the browser,
the servers and the scripts. `npm run aircraft:folder` (in CI) proves `FOLDERS` names exactly the folders
on disk, each file is data only, every assembled row equals the hand module's row exactly (key order,
types, doubles by `Object.is`), every folder states the stock packs and rates (Betaflight 4.5.1's,
which `configs/airframes.js` gives every row), and that twelve single-field changes made in memory each
fail.

## Read from the folder

Every aircraft's AIRFRAMES row in `configs/airframes.js` is `AIRCRAFT`'s, each in its place in the
list, and so are the rows below except where it says otherwise: KITS in `configs/kits.js`, TUNING in
`configs/tuning.js`, ANCHORS in `configs/hangar-parts.js` and the TUNES in `configs/registry.js`. The
P-51, the CAP 580 and the Slick 580 switched in slice 2, the rest of the fleet one aircraft per commit in
slice 3 (2026-10-12). Each switch was proven by every export of those modules and of `power.js`,
`power-estimates.js`, `liveries.js`, `combat.js`, `progress.js` and the string tables, through
`scripts/lib/transcript.js`'s `canon` (key order, `-0`, frozenness), being identical before and after,
with every object reached twice the same object at the same paths; by the pinned `airframes:selftest`
and `registry:selftest` transcripts; and by every plane's recordings writing the same bytes as at the
commit before. A row's inline comments moved into the block comment where the row was.

`BRAMOR_CATAPULT` and `STRIKER_RAIL` are the Bramor's and the Striker's rows' own `catapult` objects, so
the drawn launcher and the harness still read the very object the row holds.

Still hand side, compared to the folders by `aircraft:folder`, because a folder copy would split an
object that is one today or the file is not this work's:

- `PROPS` (`[STOCK]`, the one stock prop object every plane's list starts with; the float planes' lists
  are their land planes') and `DRAWN` membership (a Set whose order is the list's).
- KITS for the Timber and the Night Timber (one list, TIMBER), the 7 and the 10 inch (one list, QUAD)
  and the interceptor (QUAD less its mount, QUAD's own slot objects).
- TUNING for the two float planes, their land planes' rows spread with `float: true`, which share the
  land rows' `cg`, `throws` and `flaps`; and `wing1000`, a retired aircraft with no folder.
- `configs/power.js`, `configs/liveries.js`, `src/game/progress.js` and the string tables: not this
  work's files (the strings are edited by most lanes, power is shared with the plant lanes).
- `configs/power-estimates.js` is GENERATED by `node scripts/power-check.js --estimates`; the folder's
  `power.estimates` stays a copy until that generator writes the folders.

## The plant's tables

`aircraft/<id>/plant.json` holds the aircraft's FixedWingParams tables in `src/native/plant_wing.c`
(the Striker's two, FW_STRIKER_PROP and FW_STRIKER_JET; every other fixed wing one; the quads none, so
they have no file). The C tables are generated from it: `npm run aircraft:ctable` writes them, and
`npm run aircraft:ctable -- --check` (in CI) fails when a folder and the C disagree either way, or when a
table in the C has no folder and is not in the script's `HAND` list (FW_WING1000, the retired wing).
Its negative control changes one value in a folder and one in the C, and fails unless each is caught.
Edit the folder, then run the writer.

A table is its lead comment and its initializer, line by line: a field (`field`, `expr`, the inline
`comment` and the `gap` of spaces before it when that is not one), a field `packed` onto the line
before it, a field whose value spans `rows`, or a comment block (`note`). The file holds one entry per
line, so a changed value is a one line diff.

This section is text, not evaluated values, unlike the rest of the folder, on purpose. The physics
sources lint (`scripts/physics-sources-lint.js`) keys every constant by its expression text and its
baseline holds 2748 such keys, and it counts a constant cited by the comment on its line or the block
directly above. So the folder keeps each field's expression, its comment and the comment blocks
around it in place, they travel into the generated C, and the lint reads them there unchanged. The
other way, the lint reading citations from the folders, would give it a second source and its
baseline a second key form for the same constant.

A lane cut before the tables moved that edits plant_wing.c by hand: merge, then
`npm run aircraft:ctable -- --from-c` reads the C back into the folders.

The tables generate today's file byte for byte, so `dist/sim.wasm` and every recording are
unchanged by the move.

## Deploy

The servers import `configs/`, so the VM's rsync in `deploy/vm/deploy.sh` must carry `aircraft/` too.
Pages stages the whole tree but `*.md`, so the site carries it already, the `plant.json` files too,
which nothing in the browser reads.

## Covered

The whole fleet, 25 aircraft: the P-51 (`p51d1450`, 2026-10-10), the CAP 580 (`cap1702`) and the
Slick 580 (`slick2680`, born with its folder, docs/SLICK-STAGE1.md) on 2026-10-11, and the rest
generated from their hand rows on 2026-10-12. Values are the evaluated rows: source strings built from
shared constants and template literals in the hand modules are stored as their full text, a resting
pitch as the degree literal the hand row multiplied, and the kv650's `massKg` (written `2.35 + 0.045`)
as 2.395, which is the same double. A row a plane has none of is null: the quads and the Striker have
no tuning, power, hangar parts or level, the NRJ no power option, estimates or hangar parts, the float
planes no kit, livery, tunes or level, and the Cub, the Slow Stick and the Timber no level.

## Not in the folder yet (computed or not data)

- Tune diffs `configs/p51-{stab,acro,manual}.diff`, the builder `src/render/p51craft.js`, camera mount in
  `src/main.js`, per-plane branches in `navlights.js`, `partsfit.js`, `wreck.js`, `floatset.js`.
- `configs/motors.js`, `motor-estimates.js`, `prop-estimates.js`, `rates.js`, `ratepresets.js`, `hulls.js`,
  `hullfit.js`, `paint.js` rows; `src/share/session.js` id list.
- The C plant's `sim_internal.h` ids and the rest of `plant_wing.c`, crash rows, and the per-plane checks
  (`scripts/p51-*.js`, `tests/p51-thresholds.json`, baselines, `docs/P51-STAGE1.md`).

## Next

1. The hand side lists above.
