# FDFPV combat: cut their toilet paper

Written 2026-09-28. The contract for a multiplayer game mode, built on the
rooms of docs/MULTIPLAYER-PLAN.md. The owner's request, verbatim:

> when flying with other people, I want every pilot to have as a tail, 50
> meters of toilet paper, different colors, hanging behind them... you try
> to cut their tails off and get scored and have points for this, this is a
> full on game mode... including physics for the toilet paper stream.

This is real RC streamer combat [AMA-RC] [AMA-CL]: every model tows a paper
streamer, and cutting an opponent's streamer with the propeller or the
airframe scores. Where the real rules and the owner differ, the owner wins:
fifty metres, toilet paper, a different colour for every pilot.

## 0. The brief, checked against the code

Checked on `origin/main` at 5c86b0d and on the open branches, 2026-09-28.

| Claim in the brief | Holds? |
| --- | --- |
| Wire range 0x80 to 0x8F, event kinds `cut`, `combat`, room logic in `edge/rooms/combat.js`, client `src/game/streamer.js` and `src/share/roomcombat.js` (fdfpv-loop COORD.md) | Taken as allocated, less one: no client ever needs to send an event of kind `combat`. What a client would have said with it (my paper tore, I laid a new one) the room reads from the owner's own frames, which cannot disagree with what everyone sees (4.4). The JSON type `combat` carries the round. |
| Phase 3's referee is `edge/rooms/referee.js`, PR #134 | Yes, on `multiplayer-phase3` only, not on main. Its friendly room returns before it stores a sample (`if (this.friendly ...) return []` ahead of `track.push`), so a friendly room's referee holds no poses at all. Combat therefore keeps its own samples, with Phase 3's own pieces: `Track`, `poseAt`, `hullFor`, `LATE_MS`, `GAP_MS` from `src/game/midair.js` and the part boxes of `configs/hulls.js`. The pattern is reused, the instance is not. |
| Phase 5's untouchable flags apply | Yes. `edge/rooms/safety.js` sets `FLAG_SPAWNING` on every relayed pose of a seat that is spawning or benched, and the combat referee reads the relayed bytes, so it sees the same flag every screen does. |
| Phase 4 racing (#132) and Phase 3 (#134) merging next | Both open at this writing. Phase 4 adds `onMessage` for any other text type to `src/share/rooms.js` and a `store` action to the core; combat uses the first once it lands and needs neither to work before. |
| Real toilet paper is about 10 cm wide | Yes: the federal spec's roll sheets are 4.0 or 4.5 inches, 101.6 or 114.3 mm [A-A-59594A]. 101.6 mm is used. |
| "TEARING when tension exceeds TP's wet/dry tensile strength" | Dry is used (section 2.1). Wet bath tissue keeps about 5 to 10 percent of its dry strength [GP-WO2013], and the simulator has no rain. |
| A 50 m streamer can hang behind every pilot | Only below about 22 m/s, and that is the headline finding of section 2.5: fifty metres of real toilet paper towed faster than that tears off at the tail. |

## 1. Decisions

| | Decided | Why, in a line |
| --- | --- | --- |
| Paper | Two ply bath tissue, 101.6 mm wide, 38 g/m2, 131 N/m dry, stretching 19.9 percent before it breaks | Measured retail products and the federal spec (2.1). |
| Length | 50 m, 50 segments of 1 m | The owner's number. |
| Physics | A chain of compliant links, solved directly (tridiagonal) every 1 ms, air drag split along and across, gravity, ground; tears where tension passes the paper's strength | 2.3. |
| Where it runs | Game side, in the shell, on the plant's own 1 ms steps; the plant never learns of it | 2.4. Every airframe bit identical by construction. |
| Who simulates a streamer | Its owner, and nobody else | The same rule as the aircraft (MULTIPLAYER-PLAN section 1). |
| Who decides a cut | The room, on the samples both sides sent, one decision sent to all | Phase 3's referee pattern (4). Nobody can fake a cut, and both screens agree by construction. |
| Scoring | The AMA RC combat sheet [AMA-RC], scaled to 50 m | 5.1. |
| Where | Private rooms, started by the host; not public rooms | 5.3. |
| Friendly rooms | Combat on: paper is cut, aircraft still pass through each other | 5.3. |
| Airframes | Every airframe, quads and planes together | 5.3. |
| Colours | Sixteen, one per seat | A seat is unique in its room, so the colours are too. |
| Text | None: every combat message is numbers | MULTIPLAYER-PLAN section 9. |

## 2. The streamer's physics

### 2.1 The paper

| Quantity | Value used | Source |
| --- | --- | --- |
| Width | 0.1016 m (4.0 in) | [A-A-59594A] Style I roll sheets 101.6 mm or 114.3 mm; "about 10 cm" in the brief. |
| Areal density | 0.038 kg/m2, two ply | Retail two ply measured at 29.3 (Charmin Basic), 38.2 and 39.7 (Charmin Ultra Strong), 45.1 (Cottonelle Ultra), 46.9 g/m2 (Charmin Ultra Soft) [KC-US8834978] [GP-WO2013]; the spec's minimum is 27.7 g/m2 [A-A-59594A]. 38 is the middle of the retail range. |
| Dry tensile strength | 131 N/m, so 13.3 N across the strip | Geometric mean of machine and cross direction for Cottonelle Ultra Big Roll, 1021 gf per 3 in [KC-US8834978], the middle of the three retail products measured (99 to 165 N/m). The roll unwinds along the machine direction, which is stronger than the geometric mean; the perforations are weaker; no source measures either for a retail roll, and the two are taken to cancel. The spec's machine direction minimum is 77 N/m [A-A-59594A]. |
| Wet tensile strength | not used | 3.0 to 8.9 N/m cross direction for retail rolls [GP-WO2013]: about a twentieth of dry. No rain in the simulator. |
| Stretch at break | 19.9 percent | Finished toilet paper, machine direction [VIEIRA-2020] Table 6 (the two ply mother reel: 24.2 percent, Table 5). Taken as linear to the break. |
| Air | 1.225 kg/m3 | ISA sea level. |

Fifty metres of it weigh 0.193 kg. That number matters in section 2.4.

### 2.2 Drag

The one published law for streamers is Carruthers and Filippone's
[CF-2005]: `CD = 0.405 AR^-0.494` on one side's plan area, fitted to cloth
streamers of aspect ratio 3.3 to 30 between 6 and 18 m/s. Fifty metres of
a 10 cm strip is aspect ratio 492, sixteen times past the fit, so the law
is not extrapolated. Instead the drag is split the way Hoerner splits a
flag's [HOERNER] p. 3-25 ("two components of drag; one representing skin
friction ... and a dynamic component representing flutter and
separation"):

- **Along the paper, everywhere:** turbulent skin friction on both sides,
  Schlichting's `Cf = 0.455 / (log10 Re)^2.58` [HOERNER] p. 2-5, 0.0021 a
  side at Re 6.9e7 (50 m at 20 m/s), so `CD_FRICTION = 0.0042` on one
  side's area. It moves by under 15 percent over 10 to 30 m/s and is held.
- **Along the paper, the free end's last 3.05 m (30 widths):** the flutter,
  as Carruthers and Filippone measured it at their longest streamer, aspect
  ratio 30: `CD_FLUTTER = 0.405 x 30^-0.494 = 0.0755`. Flutter grows
  toward the free end; the taut paper near the tow point barely moves.
  Their cloth weighed 64 to 177 g/m2 and they found lighter cloth drags
  more [CF-2005], so tissue at 38 g/m2 likely flutters harder: this is the
  side the model errs on.
- **Across the paper:** a flat plate broadside, `CD_ACROSS = 1.17` [HOERNER]
  p. 3-16 (1.17 at aspect ratio 1, "does not increase appreciably" up to
  10; a metre of 10 cm paper is 10).

Each node carries half of each segment it ends. Drag is applied
implicitly per node, `v / (1 + dt k / m)` along and across separately, so a
3.9 g node in a 30 m/s flow slows toward the air and never past it, at any
speed.

What that gives, towed level (the check measures each, section 7):

| Speed | Pull along the tow, 50 m | Pull at the tow point with weight |
| --- | --- | --- |
| 8 m/s | 1.70 N | 1.84 N |
| 12 m/s | 3.83 N | 3.88 N |
| 16 m/s | 6.81 N | 6.78 N |

And what the whole range of plausible drag laws gives for the speed at
which the full fifty metres tears (pull equals 13.3 N):

| Model | Tear speed, 50 m |
| --- | --- |
| Skin friction only, no flutter (a floor) | 33 m/s |
| **This model: friction plus the tail's flutter** | **22 m/s** |
| Carruthers and Filippone extrapolated to aspect ratio 492 (`CD = 0.019`) | 15 m/s |

### 2.3 The integration

- **Nodes and links.** 51 nodes one metre apart; node 0 is the tow point
  on the aircraft's tail (the rearmost point of its part boxes, on the
  centre line), moved by the shell, never by the paper.
- **Every 1 ms step:** gravity and drag on every free node; every node
  moves by its velocity; every link is put back to its rest length as a
  spring of the paper's own stiffness (13.3 N / 0.199 per metre, 67 N) by
  XPBD [XPBD-2016], and all fifty links are solved at once, because a
  chain's constraint equations are tridiagonal and the Thomas algorithm
  solves them directly in O(n) [GOLDENTHAL-2007]. Two iterations a step.
  The velocity is what the positions did.
- **Paper only pulls.** A link shorter than its length is slack and is left
  out of the solve (one round of an active set).
- **Why compliant, not rigid.** A rigid link turns a slack streamer
  snapping taut into an impulse delivered in one step, so the tension read
  off it is set by the step length, not by the paper: the first version
  tore its tail off in a gentle turn at 50 N. The paper's own stretch
  spreads a snatch over the tens of milliseconds a real one takes, and the
  tension is then the paper's.
- **Tension** comes out of the solve for free (the multiplier over dt
  squared). A link past 13.3 N tears; the part behind it comes off as a
  free piece and falls. Tension is greatest at the tow point, so a
  streamer pulled too hard loses everything there.
- **Ground.** Each node's ground height is asked once every 10 steps and
  held; paper below it is put on it, with sliding friction 0.5.
- **Determinism** (CLAUDE.md): add, multiply, divide, `sqrt`, `abs` only,
  all fixed by IEEE 754. No `Math.sin`, `cos` or `pow`. The shell steps
  the streamer inside its existing per step loop, with that step's plant
  pose, so the frame length cannot reach it: the selftest drives it
  through the shell's accumulator at 30, 60, 144 Hz and at random frame
  lengths and gets the same bits.
- **Pieces** (cut or torn off) are free chains with the same physics. A
  piece is dropped 20 s after it comes to rest, or 90 s after it came
  off, and at most 4 are kept.
- **When the plant does not step** (perched, held, a menu) the paper still
  hangs and falls: it is stepped on its own 1 ms accumulator with the
  aircraft where it stands, which cannot depend on the frames either,
  because the tow point does not move.

### 2.4 The pull stays out of the plant

Real streamers pull on the aircraft, and the physics above knows exactly
how hard: the tow point tension, every step. It is **not** fed to the
plant, for four reasons:

1. **The plant is the product.** Flight feel is this simulator's one goal,
   and every airframe's gates hold it bit for bit. An external force ABI
   touches every one of them, and needs the rebuild and the identity proof
   every ABI change needs. Game side, the proof is free: the plant never
   sees the streamer, so `crash:identity` and `verify` cannot change.
2. **Fifty metres of toilet paper weighs 0.193 kg,** eight times the 65 mm
   whoop's 23.4 g and a third of the 420 g Slow Stick's. Honest physics
   would ground the small end of the fleet, and a room of friends picks
   what it flies.
3. **The pull is bounded by the paper.** It can never pass 13.3 N, the
   tear, and in flight under the tear speed it is 2 to 10 N.
4. **It is measured anyway.** `towTension()` is computed every step and
   shown on the combat HUD, so the owner can fly and see what the paper
   would ask of the aircraft before deciding (section 9, question 2).

If the owner wants the pull, it is an additive ABI call
(`sim_set_external_force`, world frame, applied at the tow point arm),
whose absence leaves the plant as it is; that is its own phase, with
`crash:identity` and `verify` 16 of 16 as its proof.

### 2.5 What fifty metres of toilet paper does in the air

The honest result, and the one the owner should know before flying it:
**at full length it tears off at the tail above about 22 m/s.** A
streamer that is shorter holds more speed (weight left out):

| Length left | Tear speed |
| --- | --- |
| 50 m | 22 m/s |
| 30 m | 25 m/s |
| 10 m | 29 m/s |

Quads race at 25 to 35 m/s; the Cub and the trainers cruise at 12 to
18. So in this mode the paper rewards flying smoothly, and a pilot who
guns it loses their streamer, which is how real combat's own rule reads:
a streamer "broken in any way other than being cut by an opponent" is
lost, and the pilot is "denied any positive scoring until a new streamer
is attached" [AMA-RC] 5.1. Section 5 turns that into the respawn rule.

Where the drag law sits is the least certain number here (the band in
2.2, 15 to 33 m/s). It is the first thing to fly.

### 2.6 How it looks

Render only, off the physics path, so `Math.sin` is free there: a ribbon
through the nodes, one strip 10 cm wide, twisted along its length and in
time, and waved sideways with an amplitude that grows toward the free end,
at 13 Hz, the flutter Carruthers and Filippone measured on their aspect
ratio 30 streamer (13 to 15 Hz at aspect ratio 20 to 30) [CF-2005].
Coloured paper, double sided. A falling piece flutters all along. Ten
centimetres of paper is two pixels at thirty metres, so a ribbon is never
drawn thinner than 2.5 pixels: a pilot has to see what they are chasing.
A cut throws a burst of paper squares in the cut streamer's colour.

### 2.7 Performance, for 16 pilots

- **Each browser simulates one streamer** (its own) and its pieces: 4.2 ms
  of wall time per simulated second in Node on this machine, 0.4 percent
  of a core (measured by the selftest, which fails past 20 ms).
- **It draws sixteen:** 16 ribbons of 51 nodes, 102 vertices each, one
  buffer update per ribbon per frame; a peer's streamer is interpolated
  between its owner's 10 Hz frames, never simulated.
- **The room judges 240 ordered pairs** (every cutter against every other
  streamer) and simulates no paper. Measured by `combat:harness`: 25 ms of
  CPU a second with sixteen seats flying and towing in a 100 m box, a
  fortieth of one core, which is what a one core VM referee has to spare.
- **Drawing sixteen ribbons** costs 0.3 ms a frame to shape in the page
  (`combat:twopage`).

## 3. The wire, and who owns what

### 3.1 Messages (the combat block of `src/share/roomwire.js`)

**`0x80` STREAMER, client to room, 10 Hz while a round is on.**

| Bytes | Field |
| --- | --- |
| u8 | type 0x80 |
| u8 | flags, reserved |
| u32 | sample time, room clock ms |
| u8 | chains, at most 5 |
| per chain | u8 id (0: the streamer on the aircraft, its first node the tow point; any other: a falling piece), u8 segments (at most 64), f32 x 3 first node, then per segment i8 x 2 direction (octahedral) and u8 length (1.25 m at 255) |

A segment is a direction and a length, 3 bytes, instead of a position, 6.
The encoder steers each direction from where the receiver will have the
node before it, so rounding never adds up along the streamer: every node
decodes to within 2 cm of its owner's (1.1 cm measured worst). A full
streamer is 171 bytes.

**`0x81` STREAMER RELAY, room to client:** the same, the sender's seat after
the type byte. The room cuts chain 0 down to what its referee left
(section 4.4) before it relays.

**Text:**

| Message | Direction | Carries |
| --- | --- | --- |
| `{ type: 'combat', op: 'start', minutes }` | host to room | 3 or 5 |
| `{ type: 'combat', op: 'stop' }` | host to room | |
| `{ type: 'combat', round, state, startsAt, endsAt, minutes, scores }` | room to all | state `idle`, `countdown`, `on`, `over`; scores per seat, numbers only |
| `{ type: 'event', kind: 'cut', ... }` | room to all | the referee's cut (4.3) |

A client sends nothing else. A tear and a respawn are read by the room
from the owner's frames: a streamer shorter than the room owes has torn
(section 5.1's no scoring), and one back at the length owed has been laid
again.

### 3.2 Bandwidth

Transport overhead as in MULTIPLAYER-PLAN section 5 (80 bytes a client
message, 76 a server one).

| | Per message | Per second | kbit/s |
| --- | --- | --- | --- |
| Up, one pilot, full streamer | 171 + 80 B | 2,510 B | 20 |
| Down, room of 8 | 7 x (172 + 76) B x 10 | 17,360 B | 139 |
| Down, room of 16 | 15 x 248 B x 10 | 37,200 B | 298 |

On top of the poses (97 and 185 kbit/s). A room of sixteen in combat is
about half a megabit down per pilot. Up is 10 more billable messages a
second per pilot, a third more than poses alone. The levers, none taken
now: relay streamers in the room tick's batch (saves the per message
overhead, about a quarter), and Phase 6's interest thinning (a streamer
more than 300 m away at 2 Hz).

### 3.3 Ownership

- **The owner** simulates its streamer and pieces, sends them, applies the
  referee's cuts to its own paper, reports its own tears.
- **The room** keeps each seat's poses and streamer frames (seconds of
  them, in memory), judges cuts, keeps the round and the scores in memory,
  trims what it relays to what its cuts left.
- **Everyone else** draws a streamer from its owner's frames. Nobody
  simulates a streamer that is not theirs.

## 4. Cutting

### 4.1 The rule, and where it runs

The rule is a pure module, `src/game/cut.js`, which the room imports and
the harness drives, as `src/game/midair.js` is for Phase 3. The room's side
is `edge/rooms/combat.js`.

For every ordered pair (cutter A, streamer of B), each time either side's
samples move the pair's covered span forward:

1. **Window.** The room milliseconds `(f, t1]`, `t1` the oldest of A's
   newest pose, B's newest streamer frame and B's newest pose; `f` the
   pair's frontier, never less than `COMBAT_LATE_MS` behind the room
   clock: a side that has not covered a span by then is judged as no cut.
   `COMBAT_LATE_MS` is Phase 3's `LATE_MS`, 400 ms, plus a streamer
   frame's 100 ms, because a moment is covered only once the frame after
   it has arrived: an owner on a link Phase 3 waits for is waited for
   here too. (The first harness run, with Phase 3's 400 ms alone, lost
   cuts on a 300 ms link with 60 ms of jitter.) Samples further apart than their gap (Phase
   3's `GAP_MS`, 250 ms, for poses; 350 ms for 10 Hz streamer frames)
   bracket nothing.
2. **Broadphase.** A's hull sphere (Phase 3's `hullFor(...).hull.reach`),
   grown by A's travel over the span, against the box round B's streamer
   in both bracketing frames, grown by 1 m. Almost every span ends here.
3. **Which links.** Of B's links, those whose box over both frames comes
   within reach of A's sphere.
4. **Sweep.** Poses interpolated as Phase 3 does, the streamer's nodes
   linearly between its two frames, stepped every quarter millisecond
   (1.5 cm of travel at 60 m/s closing, under half the test's reach, so a
   flat prop disc cannot step over the paper).
5. **The test.** A link is cut when its distance to any of A's part boxes
   (`configs/hulls.js`: props, wings, fuselage, every part) is under the
   paper's half width less a margin: `0.0508 - 0.02 = 0.031 m`. The
   distance from a segment to a box is convex along the segment and is
   found by golden section search, exactly, with no trigonometry.
6. **Excluded:** a cutter or a victim flagged `spawning` or `crashed`
   (Phase 5's and Phase 3's untouchable), a victim's own aircraft (the
   rules score no cut of your own streamer [AMA-RC], and a pilot's aircraft
   passes through its own paper), falling pieces ("streamers not being
   towed ... are not eligible" [AMA-RC]), anything outside a round's `on`
   state, and a victim that sends no poses (a pilot in a menu is out of the
   air, and their paper with them: the rule needs the victim's own flags
   for the moment, and a pilot who is not flying has none).

The margin covers the gap between what the room reconstructs and what the
owner simulated: the codec's 1.1 cm, the interpolation of 10 Hz frames in
a turn (a node moves along the path; the chord of a 25 m radius turn over
100 ms at 20 m/s bows 2 cm), and Phase 3's 7 to 14 mm for poses.

### 4.2 Both screens agree, and nobody fakes a cut

- **One decision.** The room decides and sends one `cut` to everyone,
  including the two pilots; both apply the same event.
- **The cutter cannot claim one.** A client never sends a cut; the room
  judges its poses, which Phase 5 already sanity checks.
- **The victim cannot refuse one.** The owner applies the cut to its own
  paper, and the room also trims every frame it relays to the length its
  referee left, so a client that ignored the cut still shows everyone the
  short streamer.
- **Latency changes when, never whether.** The decision depends only on
  the samples' contents and sender timestamps (Phase 3's promises 1 to 3).

### 4.3 The cut event

```
{ type: 'event', kind: 'cut', id, tc, cutter, victim,
  keep,           links left on B's streamer
  part,           the kind of A's part that cut: 'prop', 'wing', ...
  p: [x, y, z],   where, scene world
  points, pass }  what it scored (0 when it was the same pass)
```

B's client calls `cutTo(keep)`: links `keep` onward come off as one piece
and fall. Everyone draws that piece from B's next frames.

### 4.4 The referee's length

The room keeps, per seat, the links its cuts have left this round, and
trims chain 0 of every relayed frame to it. A tear reported by the owner
shortens what the owner flies, not what it is owed: at a respawn the owner
lays the streamer again at the referee's length (section 5.2).

## 5. The game

### 5.1 Scoring, from the AMA RC combat sheet

The AMA's Radio Control Combat rules [AMA-RC], which are the RC Combat
Association's [RCCA-2009], score a five minute round:

| Real rule | Here |
| --- | --- |
| "Streamer cut (other than your own) +100 per cut" | +100 |
| "Multiple cuts on a single streamer in a single pass count as one cut" | A pass is one cutter on one streamer; contacts within 1.5 s of the last one of that pair are the same pass: the paper is cut, the points are not given again. |
| A cut is "any time one contestant's aircraft removes any part of a streamer" | Any contact with any part of the aircraft. **Deeper does not score more**, in either rulebook. A deep cut costs the victim more at the end, through the next line. |
| "Remaining streamer +4 points per foot ... (+120 max.)" on a 30 ft streamer, "rounded down to the nearest foot" | +2.4 a whole metre left at the end: the same 120 for a whole streamer, scaled to fifty metres. |
| "Continuous 5 minute flight +20" | +20 for a round with no crash; a crash from a mid air (a Phase 3 `hit`) keeps it, as the rules say. |
| "Launch within 90 second launch window ... airborne with a complete streamer when Start Combat is called +20" | +20 for being airborne with the whole streamer at the go. |
| A streamer lost other than by a cut: "denied any positive scoring until a new streamer is attached" | A tear stops the pilot's scoring until they respawn (5.2). |
| Non engagement, safety lines, judges | Not modelled: there are no lines on a map. |
| Intertwined streamers | Not modelled: streamers do not touch each other. |

The control line rules [AMA-CL] score the same 100 a cut, plus a point a
second of airtime, and end the match on a "kill" (the string cut at the
knot). The RC sheet is the one used, because these are RC aircraft; a cut
at the tow point here takes the whole streamer, which is the kill's
consequence without ending anyone's round.

### 5.2 A round

- **Start.** The host of a private room picks Combat, 3 or 5 minutes
  (five is the rules' [AMA-RC]). A 20 s countdown to take off in (the rules
  give 90 s), then the round.
- **Streamers.** Laid at the countdown, fifty metres each, behind the
  aircraft: along its travel if it moves, hanging if it hovers, on the
  ground behind it if it stands.
- **Cuts stay.** A streamer cut short stays short for the round, through
  every respawn.
- **Respawn** (a crash, or R) lays the streamer again behind the aircraft
  at the referee's length: what a tear took comes back, and the pilot may
  score again (the rules' "new streamer attached"); what a cut took does
  not. For five seconds after, Phase 5's spawning flag makes the pilot
  untouchable both ways.
- **The end.** At the clock, the room adds the remaining streamer and
  flight bonuses and sends the results; streamers stay out until the host
  starts another round or stops.
- **Joining mid round.** A pilot who joins during a round tows a streamer
  from their spawn and scores from then on.

### 5.3 Who can play where

- **Private rooms only.** A public room has no host to start a round, and
  a game about chasing strangers invites exactly the "following" report
  reason Phase 5 exists for. Public rooms could vote a round in later, as
  races might (MULTIPLAYER-PLAN section 14, question 2).
- **Friendly rooms play.** A friendly room turns off mid air crashes so
  nobody's aircraft breaks; a cut breaks paper, not an aircraft, so combat
  is the game a friendly room is for.
- **Quads and planes together.** Every airframe in `configs/hulls.js` can
  cut and be cut. Planes carry more paper at their slower cruise (2.5);
  quads turn tighter. That is the matchup, and nothing is handicapped.
- **Not with a race.** A round cannot start while a Phase 4 race is on.
  The other way round is Phase 4's `race.js` to refuse, and is not
  enforced here.

### 5.4 On screen

- **Fly with friends, host:** a Combat row (3 or 5 minutes), then Stop.
  Everyone: the round's state and time.
- **In flight:** time left, your points, your paper in metres, the pull at
  your tail in newtons, and the top three.
- **A cut:** a burst of paper at the point, the piece falling on every
  screen, the score changing on every screen.
- **Results:** every pilot, points, cuts and paper left.
- **Names** are the rooms' picker names; there is no text in any of it.

## 6. What is built where

| File | What |
| --- | --- |
| `src/game/streamer.js` | the physics (2), pure |
| `src/share/roomwire.js` | the combat block (3.1) |
| `src/game/cut.js` | the cut rule (4.1), pure |
| `edge/rooms/combat.js` | the room: rounds, scores, the referee, trimming |
| `edge/rooms/core.js` | dispatch lines only |
| `src/share/roomcombat.js` | the client: own streamer, sending, applying cuts, peers' streamers |
| `src/render/streamers.js` | drawing ribbons |
| `src/ui/combathud.js` | the HUD and results |
| `src/main.js`, `src/strings/*.js` | the hooks, small and grouped |

## 7. Checks, with bands

| Check | What it holds | Band |
| --- | --- | --- |
| `streamer:selftest` (CI) | Hooke on every pulling link, 8 s of turning | 1 mm |
| | no link past the paper's stretch | under 19.9 percent |
| | a piece falling flat, against sqrt(2 m g / (rho CD A)) | 2 percent |
| | towed level at 8, 12, 16 m/s, pull against the cited drag | 10 percent |
| | 90 percent of the predicted tear speed for 30 s | no tear |
| | ramped, tears near the predicted speed / at TEAR_N | 10 / 5 percent |
| | frames at 30, 60, 144 Hz, random | bit identical |
| | cost | under 20 ms a simulated second |
| `rooms:selftest`, combat section (CI) | codec, trimming, host only start, public refused, round flow, scoring by the rules, one pass one cut, untouchable, friendly plays, tear stops scoring, respawn restores | exact |
| `combat:harness` (CI) | randomized passes of a real streamer and a flying cutter over simulated links, latency 0 to 300 ms each way, jitter 0 to 60 ms: both clients and the room hold the same cuts | 100 percent |
| | same cuts as the zero latency run, links under `COMBAT_LATE_MS` | 100 percent |
| | clocks off by up to 10 ms each: still the same cuts on both, and none where the truth missed the paper | 100 percent, 0 |
| | truth clearance over 8 cm judged a cut | never |
| | truth passing through the paper (under 1 cm) missed | never |
| | decision delay over the slower link, p95 | reported, under 250 ms |
| | room CPU, 16 seats all towing | reported |
| `combat:twopage` (by hand, `wrangler dev`) | two headless pages on swiss2, coloured streamers, A cuts B's, both screens the same cut and the piece falling, both scores | pass list |
| existing | `rooms:selftest`, `verify` 16 of 16, `crash:identity`, every `checks.yml` command | unchanged |

## 8. Phases

- **This PR:** everything above, on private rooms. It is not deployed:
  the rooms backend is moving from Cloudflare to the owner's VM (branch
  `vm-backend`), and the lead deploys. Combat needs nothing of a backend
  but what `edge/rooms/do.js` already gives the core: the `send` and
  `tick` actions. A round's clock advances on any message and on the
  room tick, which runs while anyone flies; a round nobody flies ends at
  the next message. No timer, no storage: a restart mid round loses the
  round.
- **Later, on the owner's word:** the pull through the plant (2.4); a
  public room vote; streamers tangling; 2 Hz far streamers (Phase 6).

## 9. Questions for the owner, and the answers

1. **Toilet paper tears at speed** (2.5): the whole fifty metres goes above
   about 22 m/s. Fly it as real paper, or give it the strength of
   something tougher (doubled paper holds twice the pull, about 31 m/s at
   full length)? **Decided by the owner, 2026-09-28: real paper.** It
   tears at about 22 m/s at fifty metres, as built.
2. **Should the paper pull the aircraft?** **Decided by the owner,
   2026-09-28: no.** The pull at the tail is shown on the HUD and not
   applied to the plant, as built (2.4).
3. **Round length:** 3 or 5 minutes offered, 5 by default. Open.

## 10. As built, measured (2026-09-28, this machine)

- `streamer:selftest` 25 of 25. Hooke on every pulling link to 0.000 mm
  over 8 s of turning; the most any link stretched 10.4 percent; a flat
  piece falls at 0.716 m/s against 0.721; towed level the pull along the
  tow is 1.83, 3.87, 6.77 N at 8, 12, 16 m/s against the cited 1.70, 3.83,
  6.81; no tear in 30 s at 20.1 m/s; ramped, it tore at 22.71 m/s against
  the predicted 22.3, at 13.31 N; ten metres holds 26.7 m/s at 11.1 N;
  the same bits through frames of 30, 60, 144 Hz and random lengths; 4 to
  6 ms of wall time a simulated second.
- `rooms:selftest` 181 of 181, 34 of them combat's.
- `combat:harness` 9 of 9: 60 random passes (the five inch, the Cub, the
  P-51 and the Slow Stick through a Cub's streamer) over five link sets
  from 0/0 to 300/40 and 50/300 ms with up to 60 ms of jitter: the same
  cuts on both clients in every run, the same as with no latency, no cut
  more than 8 cm off, none missed within 1 cm. The band: every truth pass
  within 2.7 cm of the paper's centre line was cut, and the nearest left
  uncut was 3.3 cm off it (the rule's reach is 3.08 cm, the paper's edge
  5.08). With each clock off by up to 10 ms, the widest cut was 3.3 cm
  off, still inside the paper. Decision delay over the slower link, p95,
  81 ms.
- `combat:twopage` 19 of 19 (SIM_GPU=1, `wrangler dev` on this machine):
  the page's streamer hash equals Node's; both tow 50 m; A through B's
  paper 25 m down it; one cut on both screens, keep 28, by A's prop, +100;
  B's paper 28 m on both, the piece falling on both; the score on both.
- `crash:identity`: off equals base for all 34 scripts (the plant is not
  touched), exit 0.
- `verify` 16 of 16, after one measurement fix: check 16 counted 43 and 44
  of the Swiss valley's 49 modules, and an untouched copy of main counted
  48. It reads resource timing, which the browser caps at 250 entries and
  then drops silently; main sat at the edge and combat's five modules at
  boot pushed the valley's last ones off. tests/verify.js now raises the
  buffer after the boot, as scripts/memory-check.js does, and counts 49.
- Every `checks.yml` command, 48 of them, exit 0.

## Sources

- [AMA-RC] Academy of Model Aeronautics, Competition Regulations, Radio
  Control Combat 2024 to 2025,
  https://www.modelaircraft.org/sites/default/files/events/rule-books/RC_Combat_2024-2025.pdf
  (read 2026-09-28): 3.7 streamers "thirty (30) feet long", section 5
  scoring (+100 per cut other than your own, remaining streamer +4 a foot
  to +120, continuous flight +20, launch +20), 5.1 loss of streamer,
  "Multiple cuts on a single streamer in a single pass count as one cut",
  mid airs, "five minutes".
- [RCCA-2009] RC Combat Association, Official Scale Rules, revision of
  2009-01-27, archived at
  http://web.archive.org/web/20210515040549/https://rccombat.com/wp-content/uploads/2020/09/2009-Official-Scale-Rules-v2009-1.pdf:
  the same scoring text.
- [AMA-CL] Academy of Model Aeronautics, Control Line Combat 2024 to 2025,
  https://www.modelaircraft.org/sites/default/files/events/rule-books/Control_Line_Combat_2024-2025.pdf:
  "One hundred (100) points will be awarded for each cut and one (1) point
  for each completed second", the cut as "one (1) or more pieces of crepe
  paper falling from a single attack", the kill.
- [A-A-59594A] US GSA, Commercial Item Description A-A-59594A, Toilet
  Tissue, Institutional, 2011-06-01: grammage minimum 27.7 g/m2 two ply,
  roll sheets 101.6 and 114.3 mm, dry tensile minimums, wet tensile 0.
- [KC-US8834978] Kimberly-Clark, US patent 8,834,978 B1, High bulk rolled
  tissue products, Tables 4 and 5: retail two ply basis weight and
  geometric mean tensile (Cottonelle Ultra Big Roll 44.0 g/m2, 1021 gf per
  3 in).
- [GP-WO2013] Georgia-Pacific, WO 2013/016261 A1, Table 16: retail basis
  weights and wet tensile.
- [VIEIRA-2020] Vieira et al., BioResources 15(4) 7475 to 7486 (2020),
  doi 10.15376/biores.15.4.7475-7486, Tables 5 and 6: maximum strain of
  toilet paper, 19.9 percent machine direction.
- [CF-2005] Carruthers, A. C. and Filippone, A., "Aerodynamic Drag of
  Streamers and Flags", Journal of Aircraft 42(4) 976 to 982 (2005), doi
  10.2514/1.9754 (author's post print at
  https://pure.manchester.ac.uk/ws/files/29884977/POST-PEER-REVIEW-NON-PUBLISHERS.PDF):
  `CD = 0.405 AR^-0.494`, one side's area, AR 3.3 to 30, 6 to 18 m/s;
  lighter cloth drags more; flutter 13 Hz at AR 30, 15 Hz at AR 20.
- [HOERNER] Hoerner, S. F., Fluid-Dynamic Drag (1965): p. 2-5 turbulent
  skin friction, p. 3-16 flat plates normal to the flow (1.17 at aspect
  ratio 1, 1.98 two dimensional), p. 3-25 flags' two drag components.
- [XPBD-2016] Macklin, M., Mueller, M. and Chentanez, N., "XPBD: Position
  Based Simulation of Compliant Constrained Dynamics", Motion in Games 2016.
- [GOLDENTHAL-2007] Goldenthal, R. et al., "Efficient Simulation of
  Inextensible Cloth", ACM SIGGRAPH 2007: the fast projection, one linear
  solve per iteration over all constraints.
- [APW-2005] Andersen, A., Pesavento, U. and Wang, Z. J., JFM 541 65 to 90
  (2005), eq. 3.4: a falling plate's speed from its weight and quadratic
  drag, about 0.8 m/s for 38 g/m2 in air (the model gives 0.72).
