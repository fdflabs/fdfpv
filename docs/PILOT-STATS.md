# Pilot stats on Flight Club: the contract

Lane "stats", 2026-10-08. The owner, with a picture of Flight Club's page:
"ok here i need prominently to see the game stats, played hours in total
etc". The room between the wordmark and the row of mode cards was empty.

## What the player sees

On Flight Club's page (the gate with hub `club`), between the brand and the
cards, one panel in the page's own language: bracketed mono labels, the dark
glass of the rooms panel, the cards' name face for the numbers.

- Headline: TOTAL FLIGHT TIME, hours and minutes, large; under it the
  flights flown and, signed in, the account's tokens.
- Tiles: pilot level with its XP to the next and a bar; aircraft flown and
  the most flown with its time; medals (gold, silver, bronze); tracks
  lapped; campaign missions won with stars out of every mission's three.
- Along the foot: the time flown in each Flight Club mode (Track Day, Free
  Flight, Streamer Combat, Catch the Ace!, Trick Battle). Catch the Ace!
  and Trick Battle add the matches won of those played and the best
  score, once one is played.
- A new or signed out pilot with no time: zeros, level 1 and one line in
  the modes' place, "Take off on any card below and your hours start
  counting here."
- On a phone (under 861 wide or under 521 tall) one line: the total time and
  the level, so six stacked cards keep their height. Under 821 tall the
  tiles drop their second lines for the same reason, and so do the
  bracketed title (the flights line takes its place) and the room games'
  results (in Spanish they wrap the modes onto a row the cards need).

Only on Flight Club. Home keeps its rooms band in that place; Operations and
the Hangar are not asked for.

## Where each number comes from

| Number | Source |
| --- | --- |
| Total flight time, time per mode | `flightTotals(settings.flightTime)` (src/share/flighttime.js), the record the firsts are paid from; `.seconds`, `.byActivity` |
| Aircraft flown, most flown | `flightTotals(...).byAirframe`, a float version counted as its land plane, a retired id under its own name |
| Level, XP to next | `levelInfo(settings.progress.xp)` (src/game/progress.js); full bar with Unlock all, as the Challenges tab |
| Medals | `settings.progress.medals`, counted per step (src/game/medals.js MEDAL_STEPS) |
| Tracks lapped | `Object.keys(settings.progress.courses).length`, the courses a lap was closed on |
| Flights | `countTotals(settings.pilotCounts).flights` (src/share/pilotcounts.js) |
| Catch the Ace!, Trick Battle: won of played, best | `countTotals(settings.pilotCounts).tag` / `.jam` |
| Tokens | `readWallet().balance` (src/share/account.js): the wallet every progress sync's answer carries, held in local storage. No call is made to paint; signed out, no line |
| Missions won, stars | `cleanCampaign(settings.campaign).missions` (src/game/campaign.js), both campaigns |

All of these are synced sections (src/share/progressmerge.js), and the sync
ends in `ui.renderMenu()`, which repaints the panel when any number moved.

## Flights and room game results (lane "stats2", 2026-10-08)

The record is `settings.pilotCounts`, its own synced section (kind
`counts` in src/share/progressmerge.js):

    { [device]: { flights: { [activity]: n },
                  tag: { played, won, best }, jam: { played, won, best } } }

- A FLIGHT is a run that logged at least one whole second airborne, by the
  clock that counts the hours (src/main.js commitFlightTime). Counted once
  per run. A run ends wherever the craft is put back on a spot
  (src/main.js resetCraft, through parkAtSpawn): a restart, the respawn
  after a crash, each Trick Battle turn and Catch the Ace! respawn, and an
  aircraft swap. So a three turn Trick Battle the pilot flies in is
  three flights, as three launches are. A pause, a landing and a take off
  again in one run are one flight; a run left on the stand or crashed in
  the first second is none.
- A MATCH is counted when the room ends it (edge/rooms is the authority):
  the client records from the room's final standings in the same place it
  opens the results (roomTag/roomJam takeResults), whatever screen is up,
  and only for a pilot with a seat in them. Catch the Ace!: won is the
  room's winner, best the pilot's points. Trick Battle: won is being among
  the room's winners (a shared win counts), best the pilot's best run
  total. A reconnect into a finished match records nothing (takeResults
  says it once).
- MERGE: flightTime's rule. One grow only slot per browser (the same
  device id), merged counter by counter to the larger; totals sum the
  slots, best is the highest. Two computers keep both, a slot sent twice
  counts once, an old copy takes nothing away. The slot ceiling is
  flightTime's FLIGHT_DEVICES_MAX (256), refused past it.
- Its own section, not keys in flightTime: a server that does not know
  the section leaves it out of its answer and the page keeps its own,
  where a flightTime slot with new keys would come back stripped and
  overwrite the counts. So the page is safe to ship before the server,
  and the counts sync from the VM deploy on.
- MIGRATION: a profile from before has no section and reads nought. The
  hours cannot honestly be turned into launches and no score was kept.

## What it does NOT do
- Not a control: no focusable element, pointer-events none. The arrows, a
  pad and Tab walk the cards exactly as before.

## Checks

`npm run pilot:stats` (scripts/pilot-stats-check.js, in CI): a seeded
profile's every number read off the screen in en and es, a second
computer's hour put to the account and a sync moving the total, the empty
state, the arrows and Tab walking past the panel, and at 390 by 844 and 360
by 640 the panel inside the window, on no card, every card's tags clear of
the command bar. The flights and both room games' results over two seeded
computers in en and es, a third computer's counts arriving by sync (summed,
its best the new best), the tokens equal to the account server's wallet, no
tokens signed out, and an old profile with no counts reading nought.
`test:tracks` (tracks-api/accounts-selftest.js) runs the merge, the shape
cleaning, the slot ceiling and the old profile in Node; `flighttime:check`
flies one run with a pause and a landing and finds one flight.
