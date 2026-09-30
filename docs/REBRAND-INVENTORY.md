# Rebrand inventory

Every place the upstream name, domain, author, funding link or cross-site
URL is hard coded, grouped by what to do with it. Verified by grep on
2026-09-23. S = WebFPVSimulator, B = WebFPVSimulator-LeaderBoard.

## Leave alone

- The GPL header in 225 files in S and 17 in B names "WebFPVSimulator".
  Copyright notices stay. Add our own line beneath, do not replace theirs.
- "Copyright (C) 2026 Mathew Harvey" in S/src/game/proven.js, scripts/park-fly.js, scripts/trick-sweep.js. Same rule.
- S/NOTICE and B/LICENSE. Append, never edit.

## Product name, user visible

- S/index.html: title (line 47), og:site_name, og:title, image alts, twitter:title.
- S/src/trackbuilder/index.html: title and og block. S/src/share/orbit.html, orbit.js, trackbuilder/animate.html titles.
- S/src/ui/ui.js: SCREEN_TITLES (244, 275), `wordmark()` at 1471 builds WEB + FPV, two "Opens the wiki on webfpv.org" notes.
- S/src/ui/loading.js:939 "WebFPV failed to start".
- S/src/share/flightlog.js:221 CSV filename prefix.
- S/scripts/serve.js:183 console banner.
- B/public/index.html: title (37), og block, masthead wordmark (2262), footer (2507). B/public/bugs.html title and kicker.
- B/src/server.js:1240 startup banner, asserted by B/src/selftest.js:701.
- package.json name in both.

## Domain and cross-site URLs

- S/src/share/board.js:73-76: DEFAULT_BOARD_ORIGIN 127.0.0.1:3100, PRODUCTION_BOARD_ORIGIN webfpv.org/board, landing origins. Host check at 126-127.
- B/public/origins.js:97-98: PRODUCTION_LANDING_ORIGIN, LOCAL_LANDING_PORT.
- B/src/server.js:52: SIM_ORIGIN default 127.0.0.1:8000. Reads x-webfpv-country at 634.
- S/edge/router.js:57-58 onrender upstreams, :70 GitHub Pages landing, :180 country header. S/edge/wrangler.toml name and routes. S/edge/selftest.js has 30 URL expectations.
- S/index.html:60-66 canonical and og:url. S/src/trackbuilder/index.html:56-70 same.
- B/index.html:50-64 canonical and og. B/public/index.html has 9 hrefs to 127.0.0.1:8000 and :8080 replaced at boot.
- S/render.yaml, B/render.yaml: service names, repo URLs, SIM_ORIGIN, BOARD_PUBLIC_ORIGIN.
- B/docker-compose.yml:20-22 and B/.env.example: Postgres user, password, db name.
- postMessage types webfpv-orbit-clip and webfpv-orbit-ready: S/src/share/orbit.js, S/src/ui/ui.js:8923, B/public/app.js:2210. Must change together or not at all.
- Window names: S/src/share/windows.js:65-67 and B/public/app.js:305-306, plus 8 target attributes in B/public/index.html. Asserted by B/src/selftest.js:834 and 849.
- Sibling repo path: S/scripts/board-check.js:53, S/scripts/og.js:28-29.

## Author and admin

- github.com/Mathew-Harvey in both render.yaml, both READMEs, S/edge/selftest.js:167-171, B/CLAUDE.md.
- B/src/admin.js:64: built-in admin with the upstream author's email and a scrypt hash. B/src/selftest.js:1332 and 1637-1678 assert it and contain the plaintext password. Delete both on fork and replace with our own via `npm run admin:hash`.
- B/src/admin.js:319 HMAC seed string. Change it; it invalidates nobody's session but ours.

## Funding

- S/src/share/patreon.js:34-36 PATREON_URL and note, consumed by ui.js:172, 3177, 11223 and trackbuilder/app.js:64, 1758.
- B/public/app.js:50-52 duplicate constants. B/public/index.html:2296, 2328, 2516 anchors.
- Patreon red CSS in S/index.html:1815-1830 and trackbuilder/index.html:268-280.
- Removing the link also fixes the one failing board selftest at upstream HEAD.

## Storage keys, do not rename casually

All localStorage keys are prefixed webfpv. Renaming any orphans what a
pilot has stored: their tracks, tunes, stick calibration, best laps.
Either keep the prefix, or write a one-time migration that copies old
keys to new. The full list: settings.v3, airhint.v2, probe, bestLapMs,
best.<hash>, stick_map_v1, pad.v1, fc.v1, fc.airframe.v1, rates.library.v1,
pilot.name, board.origin, stats.v1, share.{import, import.micro, editkeys,
bind, pending, posted, builderIntent}.v1, trackbuilder.{library, autosave,
autosave.micro}.v1. IndexedDB webfpv.orbitclips.v1. Board: sessionStorage
board.admin.v1, bugs.token, localStorage board.craft.v1.

Two seeds derive published ids from the prefix: S/tracks/sources.mjs:32 and
S/scripts/boardpresets.js:138. Changing them changes every preset track id.

## Generated assets

- S/icon.svg, favicon.ico, apple-touch-icon.png, og.png. S/src/trackbuilder same. B/public same.
- All produced by S/scripts/icons.js and S/scripts/og.js. Change the source strings in those scripts and run `npm run gen:icons` and `npm run gen:og`.

## Lints that will fight us

- S and B scripts/noun-lint.js: one rule, user visible text says track, never course. No brand words. Keep it.
- B/scripts/licence-lint.js: every source file must contain "GNU General Public License". Keep it.
- B/src/selftest.js and S/edge/selftest.js assert the upstream literals listed above. Update the assertions with the strings, not after.

## Assets with no licence

- S/assets/music, 16 titles, 92 MB. NOTICE line 80: "Licence NOT RECORDED". Resolve or remove before public.
- S/assets/credits: third party logos and four pilot channel photos. Credit only, per S/src/ui/credits.js. Drop the pilot photos unless we have their consent.

## Second rename, 2026-09-30: FDFPV to Paraguayan Drone Combat Simulator

The owner: "dont call it FDFPV - the new name will be whats on the image
Paraguayan Drone Combat Simulator". The product name changed where a pilot
or a visitor reads it. Every contract kept the old spelling. Verified by
`git grep -n -i fdfpv` on 2026-09-30.

Renamed, visible:

- index.html: title, og:site_name, og:title, twitter:title, both image alts,
  and the loading screen's name, now the key art's lockup (the .lockup rules).
- src/ui/ui.js: `wordmark()` builds the same lockup as the title's heading,
  and the title's screen title and crumb read `ui.product_name`.
- src/strings en.js and es.js: the values of credits.fdfpv_by, the credits
  licence line, loading.fdfpv_failed_to_start, orbit.fdfpv_orbit, and the
  new ui.product_name. The keys keep their names. loading.tagline_over went:
  PARAGUAYAN is part of the mark now, and the mark is English in every locale.
  Spanish running text says "el Simulador de Combate de Drones Paraguayo"
  (docs/SPANISH-GLOSSARY.md).
- terms.html, privacy.html, src/trackbuilder/index.html and
  src/share/orbit.html titles and copy.
- The download names in src/replay/store.js and src/share/flightlog.js:
  `py-drone-combat-<map>-<stamp>`. Nothing reads them back.
- icon.svg's aria-label, through scripts/icons.js (the .ico and .png do not
  change). README's title and prose. NOTICE, appended.

Kept, contract:

- The repository name, fdflabs.github.io/fdfpv and every other URL,
  the fdfpv.example placeholder origins, including the two pilot facing
  "Opens the wiki on fdfpv.example" notes, which are a stale placeholder
  domain rather than the name.
- Storage keys: webfpv.* above, and fdfpv.rooms, fdfpv.room,
  fdfpv.roomToken, fdfpv.pilotPick, fdfpv.pilotFigure, fdfpv.voice.
- Wire formats: the identity prefixes fdfpv-time/v1, fdfpv-track/v1,
  fdfpv-track-delete/v1, fdfpv-name/v1, fdfpv-link/v1 (the board verifies
  them), the rooms hello's `build: 'fdfpv'`, the postMessage types
  fdfpv-orbit-clip and fdfpv-orbit-ready, the fdfpv-orbit-capture lock, the
  window names fdfpv-sim, fdfpv-board and fdfpv-wiki, the fdfpv-version meta.
- package.json name, the FDFPV_*_DATA variables, the dev server's console
  banner, deploy/ (units, Caddyfile, scripts), edge/, tracks-api/, tools/,
  tests/, internal docs, and every GPL header.

Not done: og.png still shows the old wordmark. `npm run gen:og` fails on
main before this change (its wait for the Alps track with six gates never
comes true), so the card needs that fixed first and then a regeneration.
The board repository's own rename is its pull request.
