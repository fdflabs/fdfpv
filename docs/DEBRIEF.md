# The debrief: one frame after every flight

Wave 3 item 16 (owner, IMPLEMENTATION-PLAN.md): "Debrief after every flight
(result, route, time, accuracy, records, next action), fed by replays."
It is PLAN.md phase 10 and COMPLETENESS.md items 26 and 76. Written
2026-10-07 over origin/main 736df09e, before the build.

## What the player sees

When a flight ends, in any activity, the end screen opens with the same
six facts in the same order, under the activity's own head:

1. **Result.** One line: new record, run complete, won, lost, mission
   complete, crashed out. The activity's words, as today.
2. **Route.** A small top down line of where the craft went, start and end
   marked, with the distance flown and the highest point. The course's
   gates (or the mission's items) as dots on it where there are any.
3. **Time.** Time in the air this flight; the lap or round time where the
   activity has one.
4. **Accuracy.** The activity's own measure, as a fraction and never a
   grade letter: clean laps of laps (race), gates passed of gates (race),
   landed tricks of tricks with a crash count (freestyle), items captured
   of required (ops), hits of shots where the war counts them.
5. **Records.** What this flight beat or did not: the track record (already
   stored by race.js), the run score against the pilot's best posted one,
   and the aircraft's total flight time after this flight (#392,
   src/share/flighttime.js). "Improved" or "still stands", with the delta.
6. **Next action.** Under the cursor: Fly again first; then Watch the
   replay; then the activity's next (Next mission, Change aircraft, Back to
   the lobby); Title last. Enter takes the highlighted one, Escape goes
   back as today.

**Watch the replay** opens the crash cam editor (src/replay/crashcam.js)
on the flight's last 30 s, the window the recorder keeps
(recorder.js WINDOW_S). When the recorder holds no clip (a flight shorter
than a second, a replay already open) the row is greyed with the reason;
never a dead button.

## Which screen

The existing results screen (src/ui/page.js resultsScreen, results.js
resultsMethods, items.js resultsRows) becomes the frame: it already has
keyboard, gamepad and pointer navigation, Escape, and the checks PLAN.md
names. The facts are one block at the top of its body; the activity's own
table (laps, tricks, standings) stays under it. The ops debrief
(src/ui/debrief.js) keeps its stills grid as its body and gets the same
facts block and next row last. The war round card (src/ui/warround.js)
gets the facts block above its table.

## Activities (brief word to registry id, src/share/modes.js)

| Brief | Registry / code path | End call today (src/main.js) |
| --- | --- | --- |
| race | `race`, solo | `ui.showResults(race.log, ...)` |
| freestyle | `free`, scored or free flight | `ui.showFreestyleResults(score.summary())` |
| wing | not a mode: a fixed wing airframe in `race` or `free`; adds a landing line (down and whole when the run ends) in `free`, where the pilot ends the flight; a race ends at the line, in the air | the two above |
| war | `war`, the room's round: the pilot flies on, so the round card (and combat's results card) end on one debrief line, time in the air, distance and the key that opens the replay | warround.js card, combathud |
| ops | the Interior campaign over a `war` room | `debrief.show(...)` |
| Flight Club | room results: `race` room and `tag` on the results screen (place of N, points, replay under Fly on); `combat` ends on an in flight card (combathud), with the war's card in PR 5 | `ui.showRoomResults(view)`, combathud |

## Data

One plain, JSON safe record, built by a pure module `src/game/debrief.js`
from what each activity already holds at its end. One builder per activity
normalises its inputs; one renderer reads the record.

```
{
  activity: 'race' | 'free' | 'war' | 'ops' | 'tag' | 'combat',
  aircraft: airframe id, fixedWing: bool,
  result: { kind: 'record'|'matched'|'complete'|'won'|'lost'|'ended'|'crashed', landed: bool|null },
  route: { points: [[x, z], ...] (<= 240), distanceM, topM, marks: [[x, z], ...] } | null,
  time: { flightMs, runMs|null },
  accuracy: [{ what: string key, n, of }],
  records: [{ what: string key, now, before, improved: bool|null }],
  replay: { ok: bool, why: string key|null },
  next: [action ids, in order],
}
```

The route comes from a sampler in the same module: the shell hands it the
craft's position on the sim clock; it keeps one point per half second and,
when full, drops every other point, so a long flight keeps its shape in a
bounded array. In memory only.

## Storage and sync

Nothing new is stored and no synced section changes. Records read what
already exists: race.js's track record, the freestyle board answer
(`ui.runPosted`), flighttime.js's per aircraft totals. So no migration.

## What it does NOT do

- No event bus (COMPLETENESS item 25, phase 22); the builders read today's
  end of run state. When the bus lands, the builders fold it instead and
  the record and the screen stay as they are.
- No XP, currency or rewards: that is the progression lane (items 17, 25).
  The record has no reward field until that lane asks for one.
- No new stored best (a freestyle personal best kept locally would be new
  player data and a migration; the board's answer is used instead).
- No whole flight replay: the replay is the recorder's 30 s window.
- Does not touch RunWatch or progress.js (progression lane).
- Never opens over the crash cam editor or a replay (`mode === 'replay'`).

## Checks that prove it

- `debrief:selftest` (Node, CI, checks.yml): each builder on recorded end
  states gives the expected record; the route sampler stays bounded and
  keeps the start and end; next actions in order per activity.
- A browser check per wired activity, reaching the rows with a real
  pointer: the facts block shows the six facts, Watch the replay opens the
  editor and closing it returns to the end screen, Fly again flies.
- items:golden and the results goldens re-recorded deliberately where the
  rows change, said so in the PR.
- lint:header, lint:dashes, lint:copy (en and es).

## PRs

1. This contract, the pure module and `debrief:selftest`.
2. Race (solo): facts block, route sampler wired, Watch the replay row.
3. Freestyle and wing landing line.
4. Flight Club room results (race room, tag, combat).
5. War round card.
6. Ops debrief: facts and next row.
