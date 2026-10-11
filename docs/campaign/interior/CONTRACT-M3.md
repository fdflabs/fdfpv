# The Interior, Mission 3 (No Man's Land): the build contract

Written 2026-10-08 by lane interior3 (wave 34). The mission's story,
stages, dials, recovery, stars, roles and radio are MISSIONS.md's M3
section; this file is what building it to Mission 1's standard needs,
what this PR builds, and what it leaves for later PRs. M3 is
`release: 'development'` in src/game/campaign.js: only a dev room starts
it; the owner decides its release.

## 1. The gap list: what M3 needs that M1 and M2 do not have

Checked against the tree at origin/main 33c57145 and interior2's branch
w34-interior2-m2 (not against TECH-NEEDS alone).

| # | Need (MISSIONS M3) | In the tree today | Size | This PR |
| --- | --- | --- | --- | --- |
| 1 | Stage graph, cues, objectives, contacts, routes, dials, stars, flags | the room's stage engine runs any mission's data | M | **yes**: interior-3.js, routes.js `m3-` block |
| 2 | The strike (STRIKE role, white out, THREAT STOPPED, the contact removed) | **missing**: no weapon in the room | L | stood in for: CONFIRM IDENTIFICATION is a capture of the box on the contact; Vega's clearance is a choice; the strike is the STRIKE role held 3 s within 150 m of the place (`zone` with `ms`), which removes the contact (a 1 m `gone` route) and shows THREAT STOPPED. No white out. A designation before the action gets Ibarra's "not yet" and then stands: the clearance comes with the action without a second box (the room's `captured` cannot ask for a capture after a moment) |
| 3 | The post's condition (`post`: steady, pressed, critical 60 s fails) | **missing**: no room value of the kind | M | stood in for: Rojas's "closing" line when the pair is out of view 20 s; the pair reaching the post unstopped fails (`why: 'post'`) |
| 4 | The forward feed degrading past the ridge (N11) and the relay restoring it | **missing**: no feed quality | M | the relay volume yes (a search ring; the RELAY role held 10 s in it); the degraded picture is told by Ferrer, not drawn; captures at the site are not gated on the relay |
| 5 | The unknown drone (an air contact that watches and repositions; intercept) and the INTERCEPTOR role | **missing**: contacts are ground routes | L | no. Its ten lines are in MISSIONS.md and unused; NOT ALONE's star and `M3_HOSTILE_DRONE_INTERCEPTED` cannot be earned until it exists |
| 6 | Several aircraft alive per pilot (N15 holds) | **missing** (CONTRACT-M2 gap 6) | L | no. A solo pilot holds every role on one aircraft |
| 7 | Seeded dials | `dials`; cue `at` windows | S | D's stop order, the pair's side; the 20 to 40 s lead and the northern vehicle's 30 to 90 s as seeded windows. Which road each pickup takes is fixed (each pickup's evidence is at its own stop) |
| 8 | Map: Puesto Arenal, its marsh, the farmhouse, the culverts, the command site, the roads round the post | **missing** in places.js and the renderer | M to L | no. Places are routes.js M3_AT on MISSIONS 1.9's grid; the decoy's field and the command site are moved to clearings the canopy leaves open (measured with canopyBlocks), the northern exit inside the boundary's warning line. WORLD lays them on the land |
| 9 | Radio: about 50 int3 lines in lines.json, en and es, voiced | none | M | no: ids are cued; the guide's nine lines are added to MISSIONS.md's table |
| 10 | Strings: titles, objectives, cards, items, role names | none for M3 | S | **yes**, en and es (lint:copy); `ops.role.recon/strike/relay` shared with M2 |
| 11 | Films int3-intro, int3-outro (INTROS M3) | none | M | no |
| 12 | Debrief: required items and the reconstruction | debrief reads `debrief.required` | S | the list yes |
| 13 | Music (radio traffic, silence after THREAT STOPPED) | M1 audit gap 5: no `music` cue | S | no |
| 14 | Night (afternoon into night; thermal matters more) | clock.js has M1's clock only | S | the arctic thermal palette yes; no M3 clock |
| 15 | Spotted (too low over people: warn, fail, the end scene; the spotted lane, CONTRACT-SPOTTED.md) | on branch w34-spotted-detect, unmerged | S | not wired until it merges. Every person is a `person` with a beat's group, so its `spotters` name groups: `pair` (stage 2), `command` (stage 4), `courier` and `walkers` (stage 1) |

## 2. Data shapes (no new room fields)

`roles` (isr, recon, strike, relay core; tracker scaling), `contacts`,
`items` (`confirm-*` are boxes on contacts; `command` the site's four),
`points`, `dials` (`order`, `side`), `stages[].cues` (`spawn`, `move`,
`classify` with `label`, `radio`, `card`, `text`, `search`, `choose`,
`flag`), `stars`, `lost` (ISR down; two civilian errors; the post
overrun), `boundary`. Routes are routes.js ROUTES with the `m3-` prefix.

## 3. Storage and sync

None new: `M3_ZERO_CIVILIAN_ERRORS` and `M3_COMMAND_SITE` go through the
result's `flags` into the campaign's synced progress like M1's. No stored
player data changes shape, so no migration.

## 4. What it does NOT do

No weapon, no post value, no feed quality, no air contact, no holds, no
map or look edits, no voices, no films, no music, no release.

## 5. The checks that prove it

`npm run interior:m3` (scripts/interior-m3-selftest.js, headless, the
real room, in CI after interior:stages): the data lints against
MISSIONS.md and the world (every line, route, point, item, contact,
string, platform; every point inside the boundary; held development),
the live room refuses it and a dev room starts it, and scripted solo
pilots fly it at the Bramor's top speed: a clean run to the northern
exit (A civilian, B friendly, D hostile by correlation, the pair cleared
and stopped, the three pickups resolved, the relay held, the site
documented, POSITIVE ID and the command site's stars and the flag); a
run that never stops the pair (lost: post); a designation before the
action (Ibarra: not yet); two civilian pickups struck (an error, then
lost: errors). Plus lint:header, lint:dashes, lint:copy,
lint:interior-names. src/share changes need a VM deploy (the room runs
them).
