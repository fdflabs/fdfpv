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
  the hunters. (Since 2026-09-29 "touches" is "enters the Ace's 6 m
  bubble", decision 2.)
- The match ends automatically the instant the first player reaches X
  points. X is configurable: **Lightning** is a low goal, a quick match of
  about five minutes; **Epic** a high one, long sessions of endurance,
  strategy and revenge.

## Decisions

The lead's decisions are the first seven; each says where the code agreed
or argued. The rest are this build's, with the reason.

1. **A tag is not a crash, and a collision is.** Superseded on
   2026-09-29 by the owner: "keep collisions for ace". Entering the
   Ace's bubble (decision 2) takes the crown and breaks nothing, since a
   hunter can do it metres clear of the Ace. A real collision is what it
   is in free flight: the room's mid air referee (Phase 3,
   `edge/rooms/referee.js`) judges every pose in a match as it does
   outside one and sends the `hit`, and both aircraft take the normal mid
   air wreck. A hunter that rams the Ace has flown through the bubble on
   the way in, so it takes the crown first and crashes a moment later.
   What a crash does to the match is what it always did to a wreck
   (decision 8): a crashed seat, and then a respawned one while it is
   spawning, cannot tag or be tagged, and a crashed Ace scores nothing
   and drops the crown where it went down (decision 14). The
   first build had the referee send no `hit` from the countdown to the
   results, as in a friendly room; `edge/rooms/core.js` now hands every
   pose to both the referee and the match. A friendly room still has no
   mid airs, match or not.
2. **The room judges the tag: the Ace's bubble.** The owner, 2026-09-29:
   "I want there to be a bubble light ghost bubble around the leader, 6
   meter bubble around it, and when you enter that then you change
   leaders." So a tag is no longer a touch. A hunter takes the crown the
   first millisecond any of its crash part boxes (`configs/hulls.js`)
   comes within **`BUBBLE_M` = 6 m** of the Ace's centre, the point its
   pose carries (its CG): `within()` in `src/game/midair.js`, on Phase 3's
   interpolated 30 Hz samples on the room clock, with Phase 3's untouchable
   flags and taxiing pair, and nothing else new. Every screen draws that
   sphere round the Ace (`src/render/acebubble.js`). This replaced `TAG_M`
   = 0.8 m, a gap between the two hulls on every separating axis.
3. **From the centre, not the Ace's skin.** The rule is the sphere that is
   drawn: a hunter sees its wingtip meet the glow and that is the tag. The
   widest hull reaches under 1.5 m from its CG, so any Ace sits well inside
   its bubble, and a wide Ace gets no bigger bubble than a quad. The
   hunter's whole hull counts, as a touch did, so a Cub's wingtip enters
   before its nose. What the pilot sees is still not exactly what the room
   judges (the near peer drawing error and the clock band, below), but
   against 6 m those 0.4 m are small, and a pass at 6.5 m is never a tag
   and one at 5.5 m always is (`npm run tag:harness`).
4. **Tag back protection, `PROTECT_MS` = 3 s.** At the moment of a tag the
   two are within 0.8 m, often on one heading at one speed. Without a
   window the old Ace, now a hunter, takes the crown straight back on the
   next millisecond; with the bubble the old Ace starts inside it. The new
   Ace learns it holds the crown 100 to 400 ms
   after the touch (the decision waits for every seat's samples, up to
   `LATE_MS`, then one hop down), so 3 s leaves at least 2.6 s to break
   away: at a closing speed of 5 m/s between two aircraft that were
   flying together that is 13 m, clear of the 6 m bubble, and a re-tag is
   a chase, not a reflex. The bubble is drawn at half its brightness while
   the Ace is protected. Protection covers the new Ace
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
6. **The Ace is marked for everybody.** A crown over the Ace's aircraft
   on every screen, and a crown before its name; the Ace's own screen says
   so; the scoreboard puts a crown by the Ace. The PEER MARKERS agent
   (branch `peer-markers`) is adding a role hook for exactly this,
   `setPeerRole(seat, 'ace')`: this build calls it from one function in
   the shell, `tagMarkPeers()`, and touches none of their files.
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
   be caught for **`DROP_MS` = 10 s** in a row drops the crown as a
   crashed one does (decision 14): nobody is the Ace, and the orb is free
   where the Ace could last be caught. 10 s is longer than any take off
   roll or respawn needs to clear 30 m, and short enough that an Ace who
   went to the menu does not stall the match. It used to hand the crown
   to a hunter drawn at random; the owner's orb rule (decision 14) took
   that out, and an Ace that is never seen at all, so has no place to
   drop the orb, keeps a crown it scores nothing with.
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
   mute, report and the host's kick. There is no ramming bench any more
   (the owner removed it on 2026-09-29), so a pilot who crashes into
   others on purpose is a report. Spawn protection is honoured
   (decision 8).
13. **Strings in both languages**, the owner's names: "Catch the Ace!" and
   "¡Atrapa al As!", Lightning / Relámpago, Standard / Estándar, Epic /
   Épica, the Ace / el As, hunters / cazadores.
14. **A crashed Ace drops the crown: the free orb.** The owner,
   2026-09-29: "ok when a person crashes, their orb just stays in that
   spot, nobody is ace, and whoever goes and catches it, is the new ace".
   The first millisecond the Ace's pose is a wreck (`FLAG_CRASHED`, a mid
   air or anything else) nobody is the Ace (`ace: null`) and nobody
   scores, and the Ace's bubble stays in the air where it went down, a
   free orb (`orb: { t, from, px, py, pz }`, the pose's place at that
   millisecond). The first pilot flying (catchable, so not crashed and
   not spawning, and `FLAG_AIRBORNE` in both bracketing samples, so not
   taxiing or sat on the ground) with any part box within `BUBBLE_M` of
   the orb's centre is the Ace: the steal's rule round a centre that does
   not move (`catchOrb`), a tie on the millisecond to the lower seat,
   with the new Ace's `PROTECT_MS`. The crashed pilot may catch it too,
   once it has respawned and its protection is over. A catch is a crown
   change (`why: 'catch'`, `from` the Ace that dropped it) with the coin,
   the burst and a banner of its own. A match can only end with the orb
   free when the host ends it or too few players are left: the results
   stand as they are, nobody is crowned, and the view stops sending the
   orb. An earlier rule of the same day, the crown handed at once to the
   pilot flying nearest the wreck, was replaced by this one before it
   shipped.

## Rules as the room applies them

A match is `{ id, goal, goAt, state, ace, reignFrom, protectUntil,
untouchSince, seenAt, orb, f, players: { seat: { ms } }, crowns: [...], winner, endAt }`.
All times are room clock ms (edge/rooms/core.js `roomMs`).

- **Start.** The host sends `{ type: 'tag', op: 'start', goal }`. The room
  sets `goAt` = now + 6 s (the race's `COUNTDOWN_MS`), and every client in
  the room's world puts its aircraft back on its slot and holds it there
  until `goAt`, the race's hold. The players are everybody in the room;
  a joiner joins as a hunter with nothing.
- **The first Ace** is drawn at `goAt`, at random among the seats present,
  by `Math.random` in the room (the harness puts a seeded generator in its
  place, `room.tag.random`). The frontier `f` starts at `goAt`.
- **The judged timeline.** The room judges room milliseconds in order, up
  to `t1`: the oldest newest sample among the seats heard from in the last
  `WAIT_MS` (2 s), but never older than `LATE_MS` behind the room clock.
  So a millisecond is decided once every live seat has covered it, or once
  it is `LATE_MS` old, whichever is first, and a sample that arrives after
  its millisecond was decided is never used: the Phase 3 promises, for
  every pair at once. Over `(f, t1]`:
  1. **The tag**: for each hunter, in seat order, `within()` of the Ace
     against it over `(max(f, protectUntil), t1]` with `BUBBLE_M`.
     The earliest `tc` wins; a tie goes to the lower seat, so the answer
     is one answer.
  2. **The points**: each millisecond up to the touch (or `t1`) where the
     Ace's interpolated pose can be caught (bracketed by two samples no
     more than `GAP_MS` apart, not spawning, not crashed) adds one to the
     Ace's ms. The millisecond its ms reaches `goal x 1000` ends the match
     there: `endAt`, `winner`, results.
  3. **The drop**: the first millisecond the Ace's pose is crashed, or the
     millisecond it has been uncatchable for `DROP_MS`, nobody is the Ace
     and the orb is free: where it went down, or where it could last be
     caught (decision 14).
  3a. **The catch**: while the orb is free nobody scores, and the first
     millisecond a flying pilot has a part within `BUBBLE_M` of the orb's
     centre it is the Ace (a tie to the lower seat), with protection.
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
goal, goAt, ace, bubble, orb, protectUntil, f, scores: [{ seat, ms, gone
}], crowns: [{ t, seat, from, why }] (the last 8), winner, endAt }`.
`ace` is null and `orb` is `{ t, from, px, py, pz }` while the orb is
free (decision 14), else `orb` is null; `why` is `start`, `tag`,
`catch` or `leave`. A client from before the orb reads a free orb as a
match with nobody crowned: no bubble, no crown mark, everybody told to
hunt, and the catch as a plain new Ace. No token, no
address, nothing typed. A full view for 16 seats is under 1 KB, sent at
most once a second while scoring plus once per crown change.

**No binary type is used** (0x90 to 0x9F stay reserved for this mode): a
crown changes a few times a minute and the points once a second, so JSON
costs nothing that matters. **The event kind `tag` is not used**: clients
never claim a touch, the room judges it, so there is no client event to
relay. That is a departure from the COORD entry, stated here.

Hibernation: the match is kept in the room's storage (`{ store: 'tag' }`,
the race's pattern; `edge/rooms/host.js` hands every stored key back to
`core[key].restore()` on load, on Cloudflare and on the VM alike); the
samples are memory only, since a room that hibernated had nobody flying.

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
  tagged, and as the Ace they do not score (decision 8). A seat silent for
  more than `WAIT_MS` (a menu, a tab in the background) is not waited
  for, so one pilot on a menu does not hold every decision back; when it
  flies again, its first samples, as many milliseconds as it is late, are
  judged without it.
- **What the clock costs**: a clock error of d ms between two seats moves
  each along its own path by v d, the Phase 3 band (0.36 m at 20 m/s,
  17 ms). Against the 6 m bubble it is small (decision 3); the harness
  reports the band.
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
   - a collision in a match is a mid air crash (decision 1): the furballs
     collide, and every client gets exactly the hits the referee sent;
   - no false tag: every tag's hunter is within `BUBBLE_M` of the Ace's
     centre (plus 5 cm for the 30 Hz interpolation) on the true 1 kHz
     paths at `tc`: 0 failures;
   - no missed tag: a scripted pass at 15 cm or more inside `BUBBLE_M`, the
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
   hibernation mid match, a collision in a match sent as a mid air `hit`
   after the bubble's tag, no token in any view, and two `createRoomTag` clients (`src/share/roomtag.js`) against
   the core agreeing with it.
3. **`scripts/tag-two-page.js`** by hand against `wrangler dev`, three
   headless pages of the real shell (`tests/lib/page.js`, `SIM_GPU=1`) on
   swiss2: A hosts, B and C join, A starts a match at a low goal. B is
   made the Ace (by entering its bubble if the draw was another), A is
   thrown into B's bubble 0.5 m off its wing: the crown moves on all three
   screens at the same `t`, no aircraft breaks, since nothing touched, the
   points tick, the match ends at the goal and the
   three results agree. Pictures, looked at, in
   `~/Desktop/fdfpv-loop/multiplayer/tag/`, not in the repository.
4. **Single player is bit identical.** Nothing in a flight alone calls
   anything of this mode: `npm run verify` 16 of 16, `npm run
   crash:identity`, and every `checks.yml` command.

## As built (2026-09-28)

Where the build departs from the plan above, and why:

- **`WAIT_MS` = 2 s.** The first harness run had the frontier waiting only
  for seats heard from in the last `LATE_MS`, and a seat that paused for a
  second came back to find the room had judged the milliseconds its
  delayed samples covered: 6 of 1,185 on time runs differed from the zero
  latency run. A seat is now waited for while it has been heard from in
  the last `WAIT_MS` (the referee's `KEEP_MS`); every row holds.
- **`judge()` takes a negative margin as a gap** (`src/game/midair.js`,
  Phase 3's file: four lines). Its two broadphase radii grow by the gap;
  with a positive margin the arithmetic is what it was, and
  `midair:harness` and `midair:twopage` pass as before.
- **The go is a whole room millisecond** (`Math.ceil`): the judgement
  steps on them, and the Durable Object's clock is whole already.
- **The crown is the peer marks' role** (#138, `src/ui/peermarks.js`,
  landed on main during this build as `peerMarks.setRole(seat, 'ace')`,
  not `setPeerRole`): a crown caret in the Ace's seat colour over its
  aircraft that never fades, and a larger arrow at the frame's edge when
  it is out of the picture. `tagMarkPeers` sets it when the crown moves
  and clears it when the match ends or the room is left. A gold crown
  sprite of this branch's own was built first and deleted once the hook
  was on main, so there is one crown, not two. The name tag carries a
  crown glyph too, which the peer marks' label repeats.
- **The scoreboard is the race's box** (`RoomRaceHud`, a second one), the
  results the race's screen (`ui.showRoomResults`), with the shell told
  whose results are up (`roomResultsOf`), since only one game runs at a
  time.
- **A match plays where the room lives**: free flight in the room's own
  world. A pilot elsewhere at the countdown (a track, another world) is
  seated there from a menu and joins as a hunter when they fly.

Found on the way, for their owners:

- **Phase 5's spawn window is on arrival time** (`edge/rooms/safety.js`:
  `spawnUntil = now + SPAWN_MS`, compared with each sample's arrival), so
  where a respawn's protection ends moves by a sample with the link's
  jitter. For the mid air referee that is the edge of a 5 s window; for a
  tag Ace it would move a score by up to 33 ms. The harness's crashes
  stamp their own `FLAG_SPAWNING`, as the client does, and avoid
  teleports; stamping the window by sample time in `safety.js` would make
  it exact. Not changed here.
- **The Phase 3 merge had left conflict markers in `package.json`** on
  this branch (fixed in its own commit). Phases 2, 3 and 4 merged into one
  another here conflict only where each added a line beside the others'
  (core.js, main.js, rooms.js, the selftest), resolved by keeping every
  side.
- `score:selftest` fails one case ("the same lap without the flip is a
  Maverick Loop") on `origin/main` itself; it is not in `checks.yml`.

Measured:

- `npm run tag:harness`, the full grid (12 furball seeds and 22 scripted
  passes, 16 random link sets each, 2,496 runs over both clock modes,
  25 s on this machine): exact clocks, every row passes over 1,248 runs
  and 2,432 tags (1,808 in the furballs): no client disagrees, no on time
  run differs from its zero latency run, no mid air hit in a match, no
  early tag, every score recounted exactly, every furball ends at exactly
  40 points; the truth gap at a tag is at most 0.802 m; a head on pass is
  a tag at 0.75 m of truth gap and not at 0.80 m, in every run. Decision
  delay (decided less the touch) median 249 ms, p95 356 ms, max 389 ms,
  on links of 0 to 300 ms. Clocks off by up to 10 ms each: the same rows
  pass; the band is a truth gap at the tag of p95 0.874 m and max
  0.938 m (256 of 2,432 tags past 0.85 m), and the head on pass band does
  not move. The station keeper's tag back is 3,001 ms after the tag in
  every run.
- `scripts/tag-two-page.js`, three pages against `wrangler dev` on
  swiss2, two Cubs and a five inch: 20 passed. The crown moved to A on
  all three pages at the same room time, 5 s after A was thrown in
  (its own spawn protection), with 20 cm of wing overlap and no hit, both
  Cubs whole; the match ended at 15 points to A on all three.

## As changed (2026-09-29): collisions count in a match

The owner: "ok keep collisions for ace, kill anti ramming rule". Decision
1 is rewritten above; this is what changed in the code and what was
measured.

- `edge/rooms/core.js` `pose()` hands every relayed pose to the mid air
  referee and then to the match, where it used to hand it to one or the
  other by `tag.on()`. The two rules are independent: the bubble decides
  the crown, the referee decides the crash, on the same bytes.
- Nothing in the match changed. A wreck was already uncatchable
  (decision 8), so a crash in a match is judged by the rules a wreck
  always had: no tag and no points while crashed or spawning. (Since
  decision 14 a crashed Ace drops the crown at once, as a free orb.)
- A hunter that rams the Ace takes the crown on the way in (the bubble
  is 6 m, the hulls meet later) and then both crash. The new Ace is
  protected for `PROTECT_MS` and a wreck, so it scores nothing until it
  has respawned and flown clear of its spawn protection.
- The ramming bench is gone (`edge/rooms/safety.js`, docs/
  MULTIPLAYER-PLAN.md section 9), so repeated collisions in a match cost
  nobody their seat.

Measured, all against this change:

- `rooms:selftest`, "catch the ace: a collision is a crash": A flies
  into B's lane and on into B: the tag first, the hit 200 ms or so after
  it, the same hit on all three seats, parts broken on both, and the new
  Ace, a wreck, scores nothing while it is one. It fails on main (no
  hit). "Lag does not decide" now also holds the mid airs up to the end
  the same under 0 to 300 ms of lag.
- `tag:harness`: the row "a touch is never a crash" became "a collision
  in a match is a mid air crash": 64 hits in the furballs, every client
  got every one.
- `scripts/midair-ace-two-page.js` against `edge/rooms/node.js`: two
  Cubs flown nose to nose into a match, the hunter took the crown and
  213 ms later both broke on the one hit.
- `scripts/tag-two-page.js` now throws A 0.5 m off B's wing, a tag
  without a touch, where it used to push 20 cm of wing through B's to
  show a touch was no crash. It has not been run since the change.
