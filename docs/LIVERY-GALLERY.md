# Livery gallery: contract

Wave 4 customization (owner 2026-10-08 02:20: "a livery gallery on the board"). Pilots publish a livery
they painted, other pilots browse them by aircraft, sort by new or most liked, like one, and put one on
their own aircraft in one click.

## Where it lives, and why not the board

On the tracks server (tracks-api), not on the leaderboard repo. Publishing and liking need the signed in
account, and the accounts live on the tracks server: its session bearer, its callsigns, its `words.js`
name filter, its `spend()` rate limits and its admin page (`admin.html`, which already hides tracks)
are all there. The board knows a pilot only by a public key and would have to ask the tracks server
for every write, which is the weekly event payout (#728) the other way round for no gain. "On the
board" in the queue line means "a public list anyone can browse"; the list routes need no sign in.

## What the player sees

- Hangar, paint shop, Liveries page: a **Publish** button next to the saved livery (signed in, with a
  callsign). It publishes the code the existing Share button makes.
- A **Gallery** tab beside it: the liveries published for the aircraft the pilot is painting, newest
  first or most liked first, each with its name, the publisher's callsign and its likes. Buttons:
  **Like** (signed in), **Wear** (puts it on the aircraft and adds it to My liveries, the same path as
  pasting a code), **Report**, and **Remove** on one's own.
- Signed out: the list and Wear work; Like, Report and Publish say to sign in.

## Data

New migration `tracks-api/migrations/0006_gallery.sql`. Nothing stored before changes shape.

```
gallery         id TEXT PK (12 base64url chars), account_id, family, name, code,
                likes INTEGER, reports INTEGER, hidden INTEGER 0|1, created_utc
                UNIQUE (account_id, code): publishing the same code twice is one entry
gallery_likes   (gallery_id, account_id) PK
gallery_reports (gallery_id, account_id) PK
```

`code` is the livery code exactly as the paint shop's Share makes it (configs/paint.js
encodeLivery, `FPV1-...`), at most `CODE_MAX` characters. The server never builds or rewrites a code.
`family` and `name` are read out of it by `configs/liveries.js readCode`, the same function the paint
shop's paste uses, so the gallery accepts exactly the codes a paste accepts. **Versioning with the
layered editor lane:** when the code gains a version 2, readCode reads both, and the gallery accepts
v2 from the deploy of the tree that has it; old v1 entries stay readable because readCode keeps
reading v1. No server change is needed for a new code version.

## Endpoints

Public (no session):

- `GET /api/gallery?family=<livery key>&sort=new|liked&page=<n>` -> `{ items: [{ id, family, name,
  callsign, code, likes, createdUtc }], next }`, `GALLERY_PAGE` (24) a page, hidden entries never
  listed. `liked` ties break by newest.

Signed in (session bearer, as every `/api/account/` route):

- `POST /api/account/gallery { code }` -> `{ entry }` (200, the existing entry when already published).
  Refused: 409 `callsign` (no callsign yet: the list shows a callsign, never an email); 422 `code`
  with the readCode error id (`not_code`, `version`, `bad_value`, ...); 422 `words` when the name has a
  word from `words.js` (a text decal with one is already refused by readCode as `code: rude`); 409 `full` past `GALLERY_PER_ACCOUNT` (20) entries.
- `DELETE /api/account/gallery/<id>` -> `{ deleted }`, one's own entry only (404 otherwise).
- `GET /api/account/gallery/liked` -> `{ ids }`, what this account has liked, to draw the buttons.
- `PUT /api/account/gallery/<id>/like`, `DELETE .../like` -> `{ id, likes, liked }`, idempotent.
  A pilot cannot like their own entry (409 `own`).
- `POST /api/account/gallery/<id>/report` -> `{ reported: true }`, once per account (a second is a no
  op). At `GALLERY_REPORT_HIDE` (3) different accounts the entry hides itself until the admin looks.

Admin (ADMIN_SECRET or an ADMIN_EMAILS Google token, as the track routes):

- `GET /api/admin/gallery` -> `{ items }`: every entry with a report or hidden, most reported first.
- `POST /api/admin/gallery/<id> { hidden }` -> hide or show. Showing clears its reports, so the same
  three reports do not hide it again.

## Moderation and abuse limits

- Names: `words.js badWordIn`, the filter callsigns and track names use; text decals already pass
  the same list inside readCode (configs/paint.js checkDecal).
- Writes (publish, remove, like, unlike, report) spend `GALLERY_WRITE_LIMIT` (40) per address per
  ten minute window (`spend()`, label `gallery`); reads are not counted.
- `GALLERY_PER_ACCOUNT` (20) entries per account; a code is at most `CODE_MAX` (6000) characters, so
  one account holds at most 120 kB.
- Deleting the account deletes its entries, likes and reports.
- Auto hide at 3 reports from different accounts (lead decision, reversible: one bad actor cannot hide
  an entry, three can until the admin shows it again).

## What it does NOT do

- No images: the client draws the livery from the code on its own model; nothing is uploaded.
- No comments, no follows, no ranking of pilots, no rewards for likes (no grind; tokens never come
  from the gallery).
- No editing a published entry: remove it and publish again.
- No selling liveries; real money buys cosmetics from the shop only.
- Not the board's admin panel: the tracks server's admin page, where tracks are already hidden.

## Checks

- `test:tracks` (accounts-selftest, CI): publish needs a session and a callsign; a bad code, a dirty
  name and a dirty decal text are refused; the same code twice is one entry; the per account cap;
  list by family, sort new and liked, paging, hidden never listed; like is idempotent, not on one's
  own, counted once per account; reports hide at 3 and the admin shows it again; only the owner
  removes; account deletion removes everything; the rate limit; a fresh database applies 0006.
- Client PR: a browser check through `run-check-slot.sh` that opens the Gallery tab with a real
  pointer, likes, and wears an entry from a seeded tracks server, with pictures; en and es strings.
