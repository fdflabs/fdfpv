# The offline cache (sw.js)

OPS #7, 2026-10-08. A service worker that answers what a deploy cannot
change from a cache, so a returning pilot's load does not wait on the
network for it, and the game boots with no network at all.

## What the pilot sees

Nothing new on screen. A second visit loads faster, and a visit with no
connection still reaches the title (rooms, the board and sign in need the
servers and say so as they do today). A new deploy is offered by the
reload bar exactly as before (src/ui/update.js); pressing Reload loads the
new deploy.

## Why it is safe to cache

GitHub Pages sends `max-age=600` on every file and lets no page set
headers. scripts/stamp-version.js already gives every module and the wasm
a URL no other deploy shares (`?v=<commit>`), so those URLs are immutable.
Everything else under the site (audio, images, fonts, data) is fetched at
a bare path every deploy shares. So the stamp now also writes into sw.js:

- `VERSION`, the commit, and
- `ASSETS`, every file of the staged site but the HTML, `version.json`
  and `sw.js`, mapped to the first 16 hex digits of its sha256.

| Request | Answer |
| --- | --- |
| same origin, `?v=<VERSION>` (modules, wasm) | cache first, `fdfpv-modules`, keyed by URL |
| same origin, path in `ASSETS`, no query | cache first, `fdfpv-assets`, keyed by path and hash; filled with `cache: 'no-cache'` so an HTTP cached copy from the last deploy is never stored under this deploy's hash |
| `cdn.jsdelivr.net/npm/<pkg>@x.y.z/...` (three.js, the muxers) | cache first, `fdfpv-cdn` |
| a navigation (index.html, landing, admin, the orbit iframe) | network first, `fdfpv-pages`; the cached copy only when the network fails |
| `version.json`, `sw.js`, a Range request (media streaming), anything else | not touched |

Only a 200 that the page could read is stored (never a 206, an error, a
redirect or an opaque answer).

## A new deploy

Each deploy's sw.js differs (its VERSION and ASSETS), so the browser
installs it on the next navigation or when update.js asks. It takes over at
once (`skipWaiting`, `clients.claim`) and prunes: modules of other
versions, assets whose hash changed or that left the site, caches it does
not know. An asset whose bytes did not change keeps its cached copy across
deploys; only the changed ones are fetched again.

The order that matters is a NEW page served OLD files. Modules cannot be
(their URLs are new). An asset could, if the old worker still answered for
the new page. update.js closes that: when it sees a new version in
version.json it asks the browser to update the worker at once, so the new
worker has taken over before the pilot presses Reload. The other order, an
old tab given a new deploy's asset, is what the HTTP cache already does
once its ten minutes run out, and that tab is already showing the reload
bar.

## Coordination with FOUNDATIONS #1 (the reload prompt)

The prompt already exists on main (src/ui/update.js, the update bar held
off a flight, scripts/version-reload-check.js). This change keeps its
contract: version.json is never cached by the worker (update.js asks with
`cache: 'no-store'`), the bar and its Reload are unchanged, and a reload
loads the new deploy. Registration lives in update.js because it is the
page's version lifecycle; a page with no stamp (a checkout, the harness)
registers nothing, so every existing check runs as before.

## What it does not do

- No precache. The first visit fills the caches as it goes; the 831 music
  tracks are not fetched unless played. A precache would make the first
  visit slower to make the second complete.
- No offline rooms, board, accounts or uploads: those live on other
  origins and are never touched.
- No push, no background sync.
- The VM's APIs (another origin) are not cached.

## Size

The stamped sw.js carries about 2,500 asset hashes: about 156 KB, 44 KB
gzipped, fetched with each navigation's update check (a 304 when the
deploy has not changed, since registration uses `updateViaCache: 'none'`
and Pages sends an ETag).

## Proof

`npm run sw:check` (scripts/sw-check.js) stages the site as pages.yml
does, stamps it as deploy A and deploy B (B changes the bytes of one asset
the boot fetches), serves it as Pages after its ten minutes (max-age=0,
ETags) with a fixed delay per request, and measures; then proves the update
and offline paths.

Measured 2026-10-08 (run 4, 15 of 15 pass; the machine was shared with
other lanes' checks, so the milliseconds wander by a few seconds between
runs, the request counts do not):

| Visit (max-age=0, 40 ms a request) | No worker | Worker |
| --- | --- | --- |
| 1, cold | 506 requests, 21.8 MB, 19.4 s | 507 requests, 21.9 MB, 16.5 s |
| 2 | 508 requests (504 revalidated), 15.2 s | 364 requests, 16.4 s (the first visit the worker controls fills its caches) |
| 3, returning | 508 requests, 17.4 s | 6 requests (the page, sw.js, version.json, three late first fills), 12.1 s |

Real pilots' round trips to Pages are longer than 40 ms and Pages speaks
HTTP/2, so the saving there is the 500 revalidations, not these exact
seconds. Within Pages' first ten minutes the HTTP cache already answered
without asking; the worker's gain is every visit after that, and offline.

The update: deploy B changed one asset's bytes. The bar showed, Reload
(pressed with the pointer) loaded all 426 modules from B, the changed
asset came back with B's bytes, of the 78 assets cached only that one was
fetched again, and A's modules left the cache. With the server stopped, the
shell booted from the caches.
