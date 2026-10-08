# The Interior, Mission 2 (Eyes in the Forest): the build contract

Written 2026-10-07 by lane interior2 (wave 34). The mission's story,
stages, dials, recovery, stars, roles and radio are MISSIONS.md's M2
section; this file is what building it to Mission 1's standard needs,
what this PR builds, and what it leaves for later PRs. M2 stays
`release: 'development'` in src/game/campaign.js: only a dev room starts
it; the owner decides its release.

## 1. The gap list: what M2 needs that M1 does not have

Checked against the tree at origin/main 33c57145 (not against
TECH-NEEDS alone). "Exists" means a field the room already reads.

| # | Need (MISSIONS M2) | In the tree today | Size | This PR |
| --- | --- | --- | --- | --- |
| 1 | Stage graph, cues, objectives, contacts, routes, dials, stars, flags | the room's stage engine (src/share/ops/stages.js) runs any mission's data | M | **yes**: interior-2.js, routes |
| 2 | A branch on a player's choice (follow A or B) | `choose` / `chosen` exist; the box is a capture of an item with `contact` | S | **yes**: `follow-a` / `follow-b` items |
| 3 | `seen(watcher) held 20 s` | no held-seen trigger; `discovered` plus a cue offset does it | S | yes, as discovered + 20 s |
| 4 | `linked(C, D)` (the handoff) | not a trigger; the handoff is authored, so `route(watcher, handoff-*)` plus the exchange's offset is the same beat | S | yes, by route |
| 5 | RECON role on the quad | roles are data; `platforms` lists airframes; the pick among `7inch`, `10inch`, `interceptor` is the owner's (PLAN 6: by feel under canopy) | S | role added with `['7inch', '10inch']` until the owner picks |
| 6 | Several aircraft alive per pilot (N15 holds) | **missing**: a solo pilot holding ISR and RECON switches its active role with the old hot swap, one aircraft alive | L | no. Solo is flyable by switching; the Bramor does not wait on an orbit |
| 7 | Close range capture ("SCAN / CAPTURE only within 10 m") | capture grades by the item's size over the frame; small items (0.3 to 1 m) grade clean only close | S | yes, by item size; no hard 10 m gate |
| 8 | The property's alertness to the quad (sound within 15 m, the contact's view cone) | sites alert on aircraft inside `r`, or under `below` inside `reach`; no sight cone, no per platform sound | S | yes as a small site (r 15, below 6) in stage 3 only; the view cone is not built |
| 9 | Detected: the returner leaves fast, harder tracking | `move` on `alert(property, high)` to the fast route; `track` is per contact, not per state | S | the fast route yes; shorter dwell yes; "more canopy" no |
| 10 | Map: Cruce Tranquera, Loma del Vigía, Corral Viejo, Senda del Vigía, Estancia La Ceniza, Claro Nuevo, the emptied Claro Viejo props, the house, the convoy | **missing** in places.js and the renderer; Mission 1's corridor only | M to L | no. Positions are on MISSIONS 1.9's grid (G()); WORLD must lay them on the land (interior:views) and the photoreal lane owns the look files |
| 11 | People poses: stand by a motorcycle, ride, hand over, collect | ride (`drive` + `vehicle`), stand, sit, lookUp exist; hand over and collect are not actions | S | uses `stand` for both |
| 12 | Friendly convoy (three vehicles), newer motorcycles | pickup and motorcycle looks exist; no convoy look | S | three `pickup` contacts on Ruta Vieja |
| 13 | Radio: ~35 int2 lines in lines.json, en and es, voiced | **none** (lines.json has no int2) | M | no: ids are cued, the voices are the next PR |
| 14 | Strings: titles, objectives, items, dispersal text in en and es | none for M2 | S | **yes** (lint:copy) |
| 15 | Films: int2-intro, int2-outro (INTROS M2) | none | M | no |
| 16 | Debrief: required items and the reconstruction | debrief reads `debrief.required` | S | the list yes; checked by a later interior:debrief row |
| 17 | Music (no music at the property, COLUMN at Claro Nuevo) | M1 audit gap 5: the ops cue handler has no `music` | S | no |

## 2. Data shapes (no new room fields)

Everything is MISSIONS-shaped data the room already reads: `roles`,
`contacts`, `items` (with `contact` for a box on a person), `points`,
`sites` (with `stage`), `dials`, `stages[].cues` (`spawn`, `move`,
`choose`, `classify`, `radio`, `card`, `search`, `flag`), `stars`,
`lost`, `boundary`. Dials: `watch` (which zone holds the required
watcher), `handoff` (two points), `returner` (foot or motorcycle),
`layout` (Claro Nuevo, two), `convoy` (a time in a 30 s window, a
`[a, b]` cue offset). Routes are added to routes.js ROUTES with the
`m2-` prefix.

## 3. Storage and sync

None new: flags (`M2_ALL_WATCHERS_FOUND`, `M2_SECOND_CAMP_UNDETECTED`)
go through the result's `flags` into the campaign's synced progress like
M1's. No stored player data changes shape, so no migration.

## 4. What it does NOT do

No holds (N15), no map or look edits, no voices, no films, no music, no
release. It never engages anyone (`ops.rule.no_engagement`).

## 5. The checks that prove it

`npm run interior:m2` (scripts/interior-m2-selftest.js, headless, the
real room): the data lints clean (every route, point, item, set, dial,
string named exists; every int2 radio id is MISSIONS.md's table), the
live room refuses it and a dev room starts it, and a scripted solo pilot
(ISR then RECON, Bramor and quad speeds) flies stage 1 to the outro on
both branches (A and B) with the right stars and flags; a detected run
loses UNSEEN and its flag without failing. Plus lint:header, lint:dashes,
lint:copy. src/share changes need a VM deploy (the room runs them).
