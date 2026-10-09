# Pilot stats on Flight Club: the contract

Lane "stats", 2026-10-08. The owner, with a picture of Flight Club's page:
"ok here i need prominently to see the game stats, played hours in total
etc". The room between the wordmark and the row of mode cards was empty.

## What the player sees

On Flight Club's page (the gate with hub `club`), between the brand and the
cards, one panel in the page's own language: bracketed mono labels, the dark
glass of the rooms panel, the cards' name face for the numbers.

- Headline: TOTAL FLIGHT TIME, hours and minutes, large.
- Tiles: pilot level with its XP to the next and a bar; aircraft flown and
  the most flown with its time; medals (gold, silver, bronze); tracks
  lapped; campaign missions won with stars out of every mission's three.
- Along the foot: the time flown in each Flight Club mode (Track Day, Free
  Flight, Streamer Combat, Catch the Ace!, Trick Battle).
- A new or signed out pilot with no time: zeros, level 1 and one line in
  the modes' place, "Take off on any card below and your hours start
  counting here."
- On a phone (under 861 wide or under 521 tall) one line: the total time and
  the level, so six stacked cards keep their height. Under 821 tall the
  tiles drop their second lines for the same reason.

Only on Flight Club. Home keeps its rooms band in that place; Operations and
the Hangar are not asked for.

## Where each number comes from (nothing new is tracked)

| Number | Source |
| --- | --- |
| Total flight time, time per mode | `flightTotals(settings.flightTime)` (src/share/flighttime.js), the record the firsts are paid from; `.seconds`, `.byActivity` |
| Aircraft flown, most flown | `flightTotals(...).byAirframe`, a float version counted as its land plane, a retired id under its own name |
| Level, XP to next | `levelInfo(settings.progress.xp)` (src/game/progress.js); full bar with Unlock all, as the Challenges tab |
| Medals | `settings.progress.medals`, counted per step (src/game/medals.js MEDAL_STEPS) |
| Tracks lapped | `Object.keys(settings.progress.courses).length`, the courses a lap was closed on |
| Missions won, stars | `cleanCampaign(settings.campaign).missions` (src/game/campaign.js), both campaigns |

All of these are synced sections (src/share/progressmerge.js), and the sync
ends in `ui.renderMenu()`, which repaints the panel when any number moved.

## What it does NOT do

- No sortie count: nothing stores the number of flights, and a counter
  would be a new synced field with a merge rule and a migration.
- No Trick Battle or Catch the Ace results: a round's score is not kept
  after the round. Their time in the air is shown instead.
- No token balance: the wallet is a server answer the Hangar shop asks for
  (src/ui/hangar-shop.js); the title does not call the server to paint.
- Not a control: no focusable element, pointer-events none. The arrows, a
  pad and Tab walk the cards exactly as before.

## Checks

`npm run pilot:stats` (scripts/pilot-stats-check.js, in CI): a seeded
profile's every number read off the screen in en and es, a second
computer's hour put to the account and a sync moving the total, the empty
state, the arrows and Tab walking past the panel, and at 390 by 844 and 360
by 640 the panel inside the window, on no card, every card's tags clear of
the command bar.
