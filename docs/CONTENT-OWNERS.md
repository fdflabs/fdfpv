# Content owners

Who owns each kind of content, in one place (docs/redesign/COMPLETENESS.md
item 78). Two halves: the content the game ships, each kind owned by one
registry module that is the only list of it; and the content a pilot makes,
owned by the pilot's key, the account or the browser.

`npm run content:owners` (scripts/content-owners.js, CI) holds the first
half: every file in each place below is registered by its owner, every
registered id has its file, and nothing else lives there but the support
modules the script names with a reason. It also fails when a row here
loses its kind, place or owner, or when a check named below stops being
run by CI. Adding a kind is a row in the script's `ROWS` and a row here.

## What the game ships

| Kind | Where | Owner | A new one is | Checks (CI) |
| --- | --- | --- | --- | --- |
| airframes | `aircraft/` | `configs/aircraft.js` | a folder and its line in `FOLDERS` (docs/AIRCRAFT-FOLDER.md) | `aircraft:folder`, `airframes:check`, `hulls:check` |
| airframes | `aircraft/<id>/` | `configs/aircraft.js` | `aircraft.js`, and `plant.json` exactly when the airframe is fixed wing | `aircraft:folder`, `aircraft:ctable` |
| worlds | `src/maps/` | `src/maps/registry.js` | a module a `MAPS` row's `load` imports | `registry:selftest` |
| worlds | `src/maps/<id>/` | `src/maps/registry.js` | a folder named for a `MAPS` id (`terrain/` is the shared engine) | |
| worlds | `assets/posters/` | `src/maps/registry.js` | a `MAPS` row's `poster` (npm run gen:posters) | |
| tracks | `docs/itaipu-courses/` | `scripts/itaipu-courses.js` | a `COURSES` row; the script writes the builder document | `itaipu:courses`, `track:golden`, `world:spawns` |
| missions | `src/share/war/missions/` | `src/share/war/missions/index.js` | a file imported into `MISSIONS`; a planned one is a `PLANNED` row | `campaign:selftest`, `war:stages` |
| missions | `src/share/interior/missions/` | `src/share/ops/missions.js` | a file in `MISSIONS` and its row in src/share/ops/rows.js | `campaign:selftest` |
| films | `src/share/war/films/` | `src/share/war/films/index.js` | a file imported into `FILMS` | `films:lint` |
| films | `src/share/interior/films/` | `src/share/interior/films/index.js` | a file imported into `FILMS` | none in CI; `interior:filmplay` and `film:world:interior` (local) |
| liveries | `configs/liveries.js LIVERIES` | `configs/liveries.js` | an entry under the land plane's id (a float version shares it, `liveryKey`), or the folder's `livery` | `kits:selftest` |
| voice lines | `assets/audio/war/voice/` | `assets/audio/war/lines.json` | a line in lines.json, built by tools/voice/build.py into manifest.json | `voice:check` |
| music | `assets/audio/war/music/` | `assets/audio/war/manifest.json` | a manifest row and its credit (scripts/music.js) | `voice:check` |
| strings | `src/strings/` | `src/strings/en.js` | a key in en.js and the same key in es.js (docs/SPANISH-GLOSSARY.md) | `strings:selftest`, `lint:copy`, `lint:es-leaks` |
| tunes | `configs/*.diff` | `configs/registry.js` | a `TUNES` row naming its diff | `registry:selftest` |

Support files that sit beside content and are not content, each named in
the script with its reason: src/maps/registry.js, retired.js, build-cost.js
and README.md; each films folder's index.js, and The Interior's board.js,
common.js and stills.js; the war missions' index.js; src/strings/index.js;
configs/betaflight-default.diff, untouched Betaflight kept as the benches'
reference with no tune row (configs/registry.js).

Not swept, on purpose: textures, fonts and art under assets/, whose names a
map builds at run time (docs/ASSET-LIBRARY.md owns the families), and
string keys nothing reads, since keys are built at run time too
(`airframe.blurb.<id>`).

## What a pilot makes

| Content | Owned by | Kept in | Follows the pilot by |
| --- | --- | --- | --- |
| Tracks filed online | the pilot key (`tracks.owner`, tracks-api/migrations/0001) | the tracks server | the account carrying the key (src/share/cloud.js) |
| Tracks in the builder | the browser | localStorage (src/trackbuilder/storage.js) | filing them online |
| Times on the board | the pilot key, which signs each (src/share/identity.js) | the board | the key, exported or carried by the account |
| Saved liveries | the browser, by the name typed (`MAX_SAVED`) | the settings | the account's synced settings (src/share/progressmerge.js) |
| Published liveries | the account (`gallery.account_id`, tracks-api/migrations/0006) | the tracks server | the account |
| Progress, unlocks, tunes | the browser's save (src/share/save.js) | the settings | the account's synced settings |
| My Hangar builds | the browser (src/ui/builds.js) | their own key | the account's synced view |
| Replays and clips | the browser | IndexedDB (src/replay/store.js) | not synced: the account's settings do not carry them |

## Who owns whom

The account (src/share/account.js, `accounts`) is optional and carries the
pilot key between computers; the pilot is a name and that key
(src/share/pilot.js, src/share/identity.js); the room (src/share/rooms.js,
edge/rooms) seats pilots by a per tab token and is the party (item 77); a
round, a mission or a free flight runs inside a room or solo. The words
are fixed by docs/SPANISH-GLOSSARY.md "The game's nouns" (item 83) and held
by `lint:nouns`; "session" for the track seat was renamed: it is
src/share/trackseat.js.
