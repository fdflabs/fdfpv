# Catch the Ace! (¡Atrapa al As!): a tag game for a room

Written 2026-09-28, before the build, on the branch `multiplayer-tag`,
over `origin/main` at 5c86b0d with Phase 4 (#132, the room's race) and
Phase 3 (#134, the mid air referee) merged in, since both are due on main
first and this mode is built on them. It is a game mode for a private
room of Fly with friends (docs/MULTIPLAYER-PLAN.md).

## The owner's spec

Translated from the owner's Spanish, intent kept exactly:

- At the start a random plane becomes the **Ace** and from that instant
  accumulates points, second by second, on the scoreboard. Everyone hunts
  it.
- The others dive, turn tight and try to **touch** the Ace with fuselage
  or wings.
- The instant any player touches the Ace, the crown changes owner: the
  toucher becomes the new Ace (now scoring), and the previous Ace joins
  the hunters.
- The match ends automatically the instant the first player reaches X
  points. X is configurable: **Lightning** is a low goal, a quick match of
  about five minutes; **Epic** a high one, long sessions of endurance,
  strategy and revenge.

## Decisions

The lead's decisions are the first seven; each says where the code agreed
or argued. The rest are this build's, with the reason.

1. **A touch is a tag, not a crash.** Nobody breaks from touching in a
   tag match: the room's mid air referee (Phase 3, `edge/rooms/referee.js`)
   sends no `hit` from the countdown until the results, exactly as in a
   friendly room. A crash into the ground, a tree or a building is still a
   crash, by the pilot's own crash settings.
2. **The room judges the touch**, with Phase 3's rule and nothing new: the
   same interpolated 30 Hz samples on the room clock, the same crash part
   boxes (`configs/hulls.js`), the same separating axis sweep on the whole
   millisecond (`judge()` in `src/game/midair.js`). The only difference is
   the margin: a crash needs the boxes to overlap by 2 cm (`MARGIN_M`); a
   tag needs them to come within **`TAG_M` = 0.8 m** of each other on every
   separating axis. `judge()` already takes the margin as a number, and a
   negative one is a gap; its two broadphase radii grow by the gap so a
   near miss is not thrown out before it is looked at. A graze counts.
3. **`TAG_M` = 0.8 m, from the hulls and the lag.** The hulls run from the
   quads' 0.28 m frame to the Bramor's 2.3 m span. What the pilot sees is
   not what the room judges: Phase 3 measured a near peer drawn 0.39 m off
   the referee's pose in a 6 g turn, and a clock error of up to 17 ms
   between two seats sliding a 20 m/s crossing by up to 0.36 m. Those add
   to 0.75 m, so a pass that looks like a touch on the hunter's screen is
   judged one at 0.8 m. Measured on every separating axis, the gap is 0.8 m
   face on and at most 0.8 times root 3, 1.39 m, corner to corner, still
   inside the lead's 0.5 to 1.5 m. Smaller would make the quads (a 0.28 m
   target) miss touches their pilots saw; larger and a plane's wingtip a
   body length away would take the crown.
4. **Tag back protection, `PROTECT_MS` = 3 s.** At the moment of a tag the
   two are within 0.8 m, often on one heading at one speed. Without a
   window the old Ace, now a hunter, takes the crown straight back on the
   next millisecond. The new Ace learns it holds the crown 100 to 400 ms
   after the touch (the decision waits for every seat's samples, up to
   `LATE_MS`, then one hop down), so 3 s leaves at least 2.6 s to break
   away: at a closing speed of 5 m/s between two aircraft that were
   flying together that is 13 m, well clear of 0.8 m and far enough that
   a re-tag is a chase, not a reflex. Protection covers the new Ace
   against everybody, not only the old Ace: a third pilot in the same
   furball would otherwise take it on the same pass.
5. **One point per second** of reign, as the owner said. Counted on the
   millisecond of the room clock, shown as whole points (the floor). The
   goal presets: **Lightning 90, Standard 240, Epic 600**, and a custom
   goal from 5 to 995 in steps of 5. Why 90 for "about five minutes": a
   match lasts about X over the leader's share of the crown times the
   share of the time an Ace can score (0.85 is a fair guess: take offs and
   respawns do not score, decision 8). With two pilots the leader holds
   the crown about 55 percent of the time, with four about 35, with eight
   about 20, so 300 s is X = 140, 90 and 50. 90 is the four pilot answer,
   quicker with two, slower with eight, and it is a number to fly.
   Standard 240 is about fifteen minutes with four, Epic 600 forty or more.
6. **The Ace is marked for everybody.** A gold crown over the Ace's
   aircraft and its name in gold, on every screen; the Ace's own screen
   says so; the scoreboard puts a crown by the Ace. The PEER MARKERS agent
   (branch `peer-markers`) is adding a role hook for exactly this,
   `setPeerRole(seat, 'ace')`. At the time of writing that branch is not
   on origin and its file has no such hook, so this build draws its own
   crown in its own file (`src/render/crown.js`) and calls one function in
   the shell, `tagMarkPeers()`, which is where `setPeerRole` goes when it
   lands. Their files are not touched.
7. **A live scoreboard, results, rematch; the host picks the mode in a
   private room.** The room section of Fly with friends gets a Catch the
   Ace section under the race's, with the goal and Start for the host.
   The flight screen shows everybody's points, Ace first, crowned. The
   results screen is the race's (`ui.showRoomResults`), with Play again
   (the same goal) for the host.
8. **The Ace scores only while it can be caught.** A seat that is
   spawning (Phase 5: five seconds after a start or a teleport, and until
   30 m from where it started), crashed, or not seen by the room (its
   samples missing or later than `LATE_MS`, a tab on a menu or in the
   background) cannot be touched, so it does not score either. Otherwise
   an Ace would sit on its slot, spawning, and win. And an Ace that cannot
   be caught for **`DROP_MS` = 10 s** in a row drops the crown: it goes to
   a hunter chosen at random among those that can be caught at that
   millisecond, or stays put if there is none. 10 s is longer than any
   take off roll or respawn needs to clear 30 m, and short enough that an
   Ace who went to the menu does not stall the match.
9. **Public rooms: no tag.** A public room is strangers on a map. A match
   takes over everybody's flight: it puts them back on their slot, holds
   them for the countdown and makes them players. In a public room nobody
   asked for that, there is no host with the standing to impose it (Phase
   5 gave public rooms no kick for the same reason), and the lobby would
   need a mode per shard to let pilots choose. The race is private only
   for the same reasons. A private code is how friends agree to play.
10. **One mode at a time.** A room runs a race, a tag match, or (being
   built on `multiplayer-combat`) a combat match, never two. The room
   core gets one question, `game()`, which says what is on; a tag start
   while a race is on is refused with `busy`, and a race start or a new
   track while a match is on the same. The combat branch adds itself to
   `game()`; nothing of it is touched here.
11. **Planes and quads, mixed.** Every airframe with a hull can play, the
   same `hullFor` the referee uses. A big plane is a bigger target and a
   quad a smaller one; that is the aircraft, the same as in the air, and
   a pilot who wants to be hard to catch flies a quad. Recorded as a
   fairness note, not corrected.
12. **Kid safe.** A match adds no text anybody types: the host sends a
   number (the goal), the room sends seats and numbers, and names are the
   picker names every screen already renders. Phase 5 applies unchanged:
   mute, report and the host's kick. A tag is not a ramming hit
   (`safety.noteHit` is fed by crash hits only): touching the Ace is the
   game. Spawn protection is honoured (decision 8).
13. **Strings in both languages**, the owner's names: "Catch the Ace!" and
   "¡Atrapa al As!", Lightning / Relámpago, Standard / Estándar, Epic /
   Épica, the Ace / el As, hunters / cazadores.

## Rules as the room applies them

A match is `{ id, goal, goAt, state, ace, reignFrom, protectUntil,
untouchSince, f, players: { seat: { ms } }, crowns: [...], winner, endAt }`.
All times are room clock ms (edge/rooms/core.js `roomMs`).

- **Start.** The host sends `{ type: 'tag', op: 'start', goal }`. The room
  sets `goAt` = now + 6 s (the race's `COUNTDOWN_MS`), and every client in
  the room's world puts its aircraft back on its slot and holds it there
  until `goAt`, the race's hold. The players are everybody in the room;
  a joiner joins as a hunter with nothing.
- **The first Ace** is drawn at `goAt`, at random among the seats present,
  by a generator seeded from the room's own random source (`newToken`, so
  the harness can seed it). The frontier `f` starts at `goAt`.
- **The judged timeline.** The room judges room milliseconds in order, up
  to `t1`: the oldest newest sample among the seats seen in the last
  `LATE_MS`, but never older than `LATE_MS` behind the room clock. So a
  millisecond is decided once every live seat has covered it, or once it
  is `LATE_MS` old, whichever is first, and a sample that arrives after
  its millisecond was decided is never used: the Phase 3 promises, for
  every pair at once. Over `(f, t1]`:
  1. **The touch**: for each hunter, in seat order, `judge()` of the Ace
     against it over `(max(f, protectUntil), t1]` with the gap `TAG_M`.
     The earliest `tc` wins; a tie goes to the lower seat, so the answer
     is one answer.
  2. **The points**: each millisecond up to the touch (or `t1`) where the
     Ace's interpolated pose can be caught (bracketed by two samples no
     more than `GAP_MS` apart, not spawning, not crashed) adds one to the
     Ace's ms. The millisecond its ms reaches `goal x 1000` ends the match
     there: `endAt`, `winner`, results.
  3. **The drop**: the millisecond the Ace has been uncatchable for
     `DROP_MS`, the crown goes to a random catchable hunter, if any.
  4. **The touch applies** at `tc` (after the Ace's points for `tc`): the
     toucher is the Ace from `tc`, `protectUntil` = `tc + PROTECT_MS`, and
     the judgement goes on from `tc` with the new Ace.
- **The Ace leaves** (closes, is kicked or removed): the crown goes at `f`
  to a random catchable hunter, else a random seat, with protection. A
  player who leaves keeps their points while their seat token can come
  back (`RESEAT_MS`); results list the gone at the bottom.
- **End.** At `goal` exactly, the instant it is reached. The host may also
  end it early (`op: 'end'`): the results as they stand, no winner.
- **Rematch.** From the results the host starts again (same or another
  goal): a new id, everybody at zero.
- **A match that nobody finishes** (everybody gone) is dropped with the
  room; one with pilots in menus waits, since nobody scores.

## Wire

JSON text only, type `tag` both ways (COORD.md gives this mode 0x90 to
0x9F and the event kind `tag` as well):

| Message | Direction | Carries |
| --- | --- | --- |
| `{ type: 'tag', op: 'start', goal }` | host to room | start a match (or a rematch) |
| `{ type: 'tag', op: 'end' }` | host to room | results now |
| `{ type: 'tag', tag }` | room to all | the match as everybody sees it, on every change and on every whole point the Ace adds |
| `{ type: 'tag', error }` | room to one | `busy`, `public`, `goal`, `alone` |
| welcome `tag` | room to joiner | the match, so a joiner or a reconnect sees it at once |

`tag` (the view) is `{ state: 'lobby'|'countdown'|'live'|'results', id,
goal, goAt, ace, protectUntil, f, scores: [{ seat, ms, gone }], crowns:
[{ t, seat, from, why }] (the last 8), winner, endAt }`. No token, no
address, nothing typed. A full view for 16 seats is under 1 KB, sent at
most once a second while scoring plus once per crown change.

**No binary type is used** (0x90 to 0x9F stay reserved for this mode): a
crown changes a few times a minute and the points once a second, so JSON
costs nothing that matters. **The event kind `tag` is not used**: clients
never claim a touch, the room judges it, so there is no client event to
relay. That is a departure from the COORD entry, stated here.

Hibernation: the match is kept in the room's storage (`{ store: 'tag' }`,
the race's pattern, restored by `edge/rooms/do.js`); the samples are
memory only, since a room that hibernated had nobody flying.

## Fairness under lag, and what each screen sees

- **Every client agrees who holds the crown and when**, by construction:
  there is one timeline, decided in the room, and each change is sent
  with its room time `t`. A client that missed a message gets the whole
  view on the next.
- **Latency does not decide**, inside `LATE_MS`: the answer depends on the
  samples' contents and stamps, never on when they arrived, and every
  millisecond waits for every live seat. A pilot on a slow link learns of
  a tag later, never differently. A pilot whose samples are later than
  `LATE_MS` is judged as not there for that span: they cannot tag or be
  tagged, and as the Ace they do not score (decision 8).
- **What the clock costs**: a clock error of d ms between two seats moves
  each along its own path by v d, the Phase 3 band (0.36 m at 20 m/s,
  17 ms). `TAG_M` is sized to cover it (decision 3); the harness reports
  the band.
- **On screen**: a tag reaches the screens 100 to 400 ms after the touch.
  The crown moves to the new Ace's aircraft, a banner says who took it
  ("You are the Ace!" on the toucher's), and the scoreboard's crown moves.
  The points on the board are the room's, at most one room tick behind
  the room's frontier; they are not extrapolated, so they never run
  backwards when a tag lands in the past.

## Checks, with the bands they are held to

1. **`npm run tag:harness`** (new, `scripts/tag-harness.js`, in CI with a
   short seed count). The real room core in Node with three or four
   clients on random smooth paths through a shared 40 m volume (planes
   and quads mixed), so the Ace is passed around by real touches, each
   client sampling at 30 Hz and stamping the room clock, over FIFO links
   with base latency 0 to 300 ms, jitter 0 to 60 ms and random 200 ms
   stalls, and scripted passes for the edges. Held to, over every run:
   - every client's crown timeline and final scores equal the room's:
     100 percent;
   - the crown timeline and the scores equal the zero latency run's for
     every run whose samples all reached the room inside `LATE_MS`: 100
     percent;
   - no false tag: every tag's pair is within `TAG_M` (plus 5 cm for the
     30 Hz interpolation) on the true 1 kHz paths at `tc`: 0 failures;
   - no missed tag: a scripted pass at 15 cm or more inside `TAG_M`, the
     Ace catchable and not protected, is a tag: 0 misses;
   - tag back protection: no crown change by touch inside `PROTECT_MS` of
     the last, and a scripted re-touch at 1.5 s is not a tag and at 3.5 s
     is: 0 failures;
   - scores add up: the sum of every player's ms equals the Ace's
     catchable ms on the timeline, recounted independently from the
     truth: exact;
   - the match ends at exactly X: the winner's ms is `goal x 1000`, the
     first to get there, nobody else at or over it, `endAt` the
     millisecond it happened: exact;
   - decision delay (decided minus `tc`): p95 reported, and under
     `LATE_MS` plus a tick always.
   A second run with synced clocks (each seat off by up to 10 ms) holds
   the first two rows and reports the false tag and miss band.
2. **`npm run rooms:selftest`**, its own section "catch the ace": the host
   only, private only, one mode at a time both ways, the countdown and the
   random first Ace, a touch moves the crown, protection, points tick and
   are broadcast, the end at exactly X, rematch, the Ace leaving, a
   hibernation mid match, no mid air `hit` during a match, no token in any
   view, and two `createRoomTag` clients (`src/share/roomtag.js`) against
   the core agreeing with it.
3. **`scripts/tag-two-page.js`** by hand against `wrangler dev`, three
   headless pages of the real shell (`tests/lib/page.js`, `SIM_GPU=1`) on
   swiss2: A hosts, B and C join, A starts a match at a low goal. B is
   made the Ace (by touching it if the draw was another), A is thrown at
   B and touches it: the crown moves on all three screens at the same `t`,
   no aircraft breaks, the points tick, the match ends at the goal and the
   three results agree. Pictures, looked at, in
   `~/Desktop/fdfpv-loop/multiplayer/tag/`, not in the repository.
4. **Single player is bit identical.** Nothing in a flight alone calls
   anything of this mode: `npm run verify` 16 of 16, `npm run
   crash:identity`, and every `checks.yml` command.
