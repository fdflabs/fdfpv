# Trick Battle (Batalla de Trucos): a freestyle jam for a room

Written 2026-10-07, before the build, over `origin/main` at d1dc5113. The
owner approved the mode on 2026-10-07 as the third Flight Club room game:
"a head to head freestyle jam. Each pilot gets a short timed run on the same
spot while the others watch; the game's trick detector scores difficulty,
clean landings and variety (repeats score less); best of three rounds."

The registry id is `jam` (src/share/modes.js), the wire's `{ type: 'jam' }`,
the strings' `jam.*`. The player sees "Trick Battle" / "Batalla de Trucos".

## What the player sees

1. Flight Club's title row has a Trick Battle card. One click is the lobby of
   a public room made for it (as tag and combat, scripts/game-lobby-check.js).
   The host's one setting is the run's length: 45, 60 or 90 seconds (60 until
   chosen). R is ready; everybody ready, or the lobby's deadline, starts it.
2. The match is three rounds. In each round every pilot flies once, one after
   the other. On your turn: a three second count, then your run from the
   room's spawn, the clock and your score on the jam HUD. Everybody else is
   held on the ground with the camera on the runner and the runner's score,
   tricks and last trick live on their HUD.
3. A run ends when its clock runs out or when the runner presses the end key.
   A crash costs the open combo, as in freestyle, and the run goes on after
   the respawn. The next pilot's count starts at once.
4. After each round the HUD says who took it. After the last round (or when a
   pilot can no longer be caught) the results: round wins, totals, the winner.
   Then back to the lobby.
5. Alone in a room made for it, a pilot flies all three rounds against their
   own best (minPlayers 1, the owner 2026-10-02).

## Scoring: the freestyle scorer as it is

Each run is one `FreestyleScore` (src/game/score.js) with `runMs` set to the
run's length. Nothing in its arithmetic changes, so a jam run scores exactly
what the same flight scores in freestyle:

- difficulty: each trick's base points (tricks.js `trickPoints`, the sheet);
- clean landings: the execution grade (CLEAN 1, SLOPPY 0.65, BUMP 0.5,
  MISSED and CRASH 0; a crash also kills the streak and the open combo);
- variety: `repeatTrickFactor` (the same trick again pays less every time),
  `backToBackFactor` (the same trick twice in a row halves), the obstacle
  repeat factor and the obstacle switch bonus at the end.

A run's score is the scorer's `total()` after `finish()`.

## THE TRUST BOUNDARY (lead decision, owner to confirm)

Tag is refereed by the room because a tag is geometry the room can answer
from 30 Hz poses. A trick is not: trickdetect.js integrates body rates per
physics step against the obstacle lines, and its output is pinned bit for
bit to recorded flights. The room cannot re-run it from interpolated poses,
and it cannot run Betaflight. So:

- **The runner's own client scores its run** with the detector and scorer the
  game already has, and sends the room its running score.
- **The room owns everything else**: who runs, when the run starts and ends
  on the room clock, that only the runner may send scores and only during its
  run, that the numbers are in shape (whole numbers, in range, a total and a
  trick count that never go down, since banked points never do), the record,
  and the winners.
- The runner's flight is recorded as every flight is (replays), which is the
  audit trail. Detection on the server is a non-goal of this build.

This is the same trust a freestyle score on the board has today. If the owner
wants more, the next step is the runner uploading its recorded flight and the
tracks API re-simulating it, which is the board's question too.

## Rules (lead decisions)

- **Turn order**: the match's pilots by seat, round 1 lowest seat first;
  each later round starts one pilot further on (round 2's first runner is
  round 1's second), so nobody always goes first.
- **Round timer**: the room's run is `goAt` to `endAt = goAt + seconds`. The
  runner's client stops its scorer at its own clock; the room accepts the
  runner's numbers until `endAt + SLACK_MS` (2 s, a late last message), then
  closes the run with the last numbers it heard.
- **Round winner**: the highest run total; a tie goes to fewer crashes; still
  tied, every tied pilot takes the round.
- **Match winner**: the most round wins; a tie goes to the higher sum of run
  totals; still tied, a shared win. With two or more pilots the match ends
  early when the leader's round wins can no longer be caught.
- **Disconnects**: a runner who leaves ends its run at once with what the room
  heard (`why: 'left'`). A pilot who left is skipped for the rest of the
  match; what they scored stays on the table. Too few of the match's pilots
  left (core.js settleGames) ends it with results as they stand. The host's
  end does too.
- **Newcomers**: a pilot arriving mid match watches (allowDropIn false); they
  fly in the next match.
- Spawn: every run starts from the room's spawn for the room's world, the
  same for everybody (the "same spot").

## The room protocol (edge/rooms/jam.js; constants in src/share/roomjam.js)

Client to room, JSON text:

    { type: 'jam', op: 'start', seconds }   host: count down a match
    { type: 'jam', op: 'end' }              host: results now
    { type: 'jam', op: 'score', total, tricks, unique, crashes, last }
                                            the runner, during its run
    { type: 'jam', op: 'done',  total, tricks, unique, crashes }
                                            the runner: its run is over

`last` is null or `{ name, execution, points }`: the trick just landed, for
the watchers' HUD (a name up to 40 characters, an execution of the sheet's
five, whole points). A message from anybody else, outside the run, or out of
shape is ignored; a start refused is `{ type: 'jam', error }` ('busy',
'seconds', 'alone'), as tag's.

Room to every seat and every watcher, on every change and every score:

    { type: 'jam', jam: view }

    view = { state: 'lobby' }  before the first match, else
    { state: 'turn'|'run'|'results', id, seconds, rounds, round, order,
      runner, goAt, endAt, live, runs, wins, winners }

- `turn`: the runner's count (TURN_MS, 3 s, the first turn COUNTDOWN_MS)
  until `goAt`; `run`: until the run closes; `results` at the end.
- `order`: this round's seats in turn order; `runner` the seat flying or
  about to.
- `live`: the runner's numbers this run `{ total, tricks, unique, crashes,
  last }`.
- `runs`: every closed run `{ round, seat, total, tricks, unique, crashes,
  why }`, why 'done'|'time'|'left'.
- `wins`: `{ seat: round wins }`; `winners`: the seats that won, at results.

The match is stored (`{ store: 'jam' }`) on every change of turn or state,
and restored after a hibernation like tag's.

## Builds on

modes.js (the registry entry), edge/rooms/gamelobby.js (the lobby entry),
edge/rooms/core.js (dispatch, games(), welcome, store, the clock), the watch
seat (#717: watchers get the same broadcast), score.js / trickdetect.js
unchanged, the lobby table and room client in src/main.js, the debrief's room
results (src/ui/results.js, debrief.js).

## What it does NOT do

No server side trick detection, no AI pilots, no change to the scorer or the
detector, no medals or weekly events yet (later, flightclub lane), no new
world, no soft currency for a jam.

## Checks that prove it

- `npm run rooms:selftest`: a jam section (start refusals, turn order and
  rotation, only the runner's scores, monotone and in range, the timer slack,
  a runner leaving, round and match winners with ties, the early clinch,
  solo three rounds, store and restore).
- `npm run game:lobby -- --game=jam`: the card, the lobby, a round alone and
  with two (scripts/game-lobby-check.js).
- `npm run jam:twopage`: two pages, one runs while the other sees the score
  live, then the other runs; results on both agree.
- lint:header, lint:dashes, lint:copy (en and es).

Server side: every PR touching edge/rooms needs a VM deploy.
