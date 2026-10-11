# Client reports: the contract (Foundations item 10)

Survey: ~/Desktop/fdfpv-loop/FND-10-SURVEY.md (2026-10-10, main d839f05c).

## The problem

When a page throws or a machine runs at 20 fps, nobody learns of it unless
the pilot files F8. Page errors are already caught (`src/share/crashrecord.js`)
and frame times already measured (`closeFrame` into `src/ui/perfoverlay.js`),
but neither leaves the browser.

## What already exists and is reused

The anonymous channel in `src/share/stats.js` to the board's
`POST /api/stats/events`: Global Privacy Control and the shared opt out stop
every send, the board stamps the day, caps the body at 2000 bytes, limits per
address, refuses unknown kinds, and keeps day counters with no row for one
browser. No new endpoint, no new setting.

## Data shapes (v 1, two new kinds)

- `error`: `sig` (8 hex, FNV-1a of the reduced text), `msg` (at most 120
  characters, URLs, emails, paths, quoted values, addresses, ids and words with
  digits replaced by placeholders), `where` (at most 3 `src/`, `dist/` or
  `vendor/` frames with line and column), `count` (1 to 999).
- `frames`: `b` (10 counts, frame block ms with upper edges 8.4, 11.2, 13.9,
  16.8, 20, 25, 33.4, 50, 100 and then slower; each at most 15000), `gpu`
  (software, integrated, discrete or hidden; never the renderer string), `cap`
  (nearest of 0, 30, 60, 90, 120, 144, 240), `scale` (dynamic resolution in
  quarters, 0.25 to 1).

## What it does NOT do

No ids, no user agent, no screen size, no address, no timestamps, no renderer
string, no free text past the scrub. Slice 1 sends nothing: it is not wired,
and the board refuses both kinds until slice 2.

## Slices

1. `src/share/clientreport.js` + `clientreport:selftest` (this).
2. Board: both kinds in `STATS_KINDS`, validators that refuse anything off
   these shapes, day counters per `sig` and per bucket; needs a VM deploy.
3. Wiring without `src/main.js`: errors from `watchPageErrors`, frames inside
   `perfoverlay.frame()`, sent with the stats flush; privacy.html in en and es
   in the same PR.

## Checks

`npm run clientreport:selftest`: a seeded fuzz of 4000 events with planted
emails, share links, home paths, addresses, ids, tokens and callsigns finds
none of them on the wire; keys stay on the allowlist; events stay under 600
(error) and 200 (frames) bytes; opt out and GPC send nothing through the real
sender; a clip-only builder (negative control) is caught by the same scan.
