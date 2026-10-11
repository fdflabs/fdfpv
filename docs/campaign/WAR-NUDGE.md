# The war's guide nudge: contract

Written 2026-10-08 (wave 34, lane firstlight), the second step of
docs/campaign/FIRST-LIGHT-AUDIT.md.

## What the player hears

In First Light, when a pilot has made no progress for 20 s, CREST says
where the attacker nearest the mission's targets is: "Closest to the dam.
Ten o'clock. About three kilometres." Said only into a quiet radio, never
over a story line or a call; the gap between nudges grows while nothing
changes (20 s, then x1.5, up to 60 s), exactly as The Interior's guide.

Progress (any resets the idle clock): the stage moving on, the number of
live attackers changing (a kill, a leak, a birth), the nearest threat
being a different attacker, or the pilot getting 100 m nearer it.

## Data and code

- `src/share/war/nudge.js` (pure, Node): `threatOf(live, targets)`,
  `nudgeOf(threat, here, heading)`, `ground`, `headingOf`, `DIST_BANDS`;
  re-exports `createNudger` from `src/share/ops/guide.js` (not copied).
- A mission opts in with `nudge: true`. `itaipu-1` and `itaipu-2` do; every other
  mission, the drill and the legacy games are unchanged.
- `src/main.js` `warNudgeFrame`, once a second in the war frame, only in
  flight, not under a film or the pause menu.
- Lines: `war-g-next`, `war-g-clock-1..12`, `war-g-dist-{500,1k,2k,3k,5k,far}`
  (CREST, en and es, group `itaipu-guide`), the Interior's wording.

## Storage, sync, server

None. Nothing crosses the wire; the room decides nothing. No VM deploy.

## What it does NOT do

No arrow or HUD mark (the war markers already frame every attacker), no
first flight card, no per-role guide. A spectator is not nudged.

## Checks

`npm run war:nudge` (scripts/war-nudge-selftest.js, in CI next to
war:stages): the threat rule, the clock in the scene frame, every line
voiced in both languages, the pacing, and that only First Light opts in.
war:stages, war:radio, war:legacy, voice check, lint:dashes, lint:header,
lint:copy.
