# FDFPV multiplayer: a shared sky

Written 2026-09-27. Design only: nothing here is built. It replaces the
live ghost relay of docs/PHASE5-DESIGN.md section 4 with rooms on
Cloudflare Durable Objects, and adds what that section left out on
purpose: other pilots flying their real aircraft in their own paint,
their pilots standing on the field, real mid air crashes, shared debris,
shared races, and the controls a room full of children needs.

The owner's goal, in their words: "a multi tenant world where the skies
are shared as well as everything else". Planes spawn in different places
on the field, other people are seen as other aircraft (their airframe,
livery and add ons) with their pilots standing on the field as figures,
and everything is shared.

The owner's decisions, final, and this document designs within them:

1. **Hosting** is Cloudflare Workers plus Durable Objects, one object per
   room, WebSockets through the hibernation API. The Node relay in the
   leaderboard repo is replaced, not deployed.
2. **Collisions are real crashes.** Two aircraft that meet in the air both
   break, through the existing crash physics.
3. **Who joins:** public rooms per map plus private invite codes. Children
   play: no free text chat, display names from a picker or filtered,
   report and kick, rate limits and abuse controls at the room object, room
   caps, no accounts, no personal data stored, no email anywhere.

## 0. What exists, checked against main

Checked on `origin/main` at 8a413cc (merge of #104), 2026-09-27, and on the
leaderboard checkout at `~/Desktop/fdfpv-leaderboard`.

| Claim | Where | Holds? |
| --- | --- | --- |
| Socket per room, retry 1, 2, 4, 8, 16 s, JSON welcome, join, leave | `src/share/live.js` | Yes. |
| Client frame 24 bytes: u32 sender ms plus the 20 byte ghost sample; the relay prepends a u16 peer id | `src/share/ghostdata.js` `LIVE_FRAME_BYTES`, `decodeLiveFrame` | Yes. A decoder refuses any length other than 26, so a different frame size is silently ignored by today's client. |
| Peers rendered 150 ms behind the sender, stale after 2 s, catch up at 100 ms | `src/game/ghost.js` `LiveGhost` | Yes. |
| The sender resamples the render pose to 30 Hz | `LiveSender`, `main.js` `liveFrame` | Yes. It stamps samples with `performance.now()` of the sender, so two senders share no clock. Fine for drawing a ghost, unusable for judging a contact between two of them. |
| Wiring in `main.js` around 1599 to 1720 | `main.js` | Yes, 1596 to 1720. |
| Relay: `/api/live/:trackId`, `ws`, in memory, 16 peers, 60 frames per second cap, track must exist on the board | `fdfpv-leaderboard/src/live.js` | Yes. Not deployed. |
| Board tracks only, no collisions, one spawn | `main.js` `liveListing`, map `spawn` | Yes. |

Found stale or missing while checking:

- **A live peer is always drawn as the five inch quad.** `livePeerJoin`
  calls `buildGhostCraft()` with no airframe id, and nothing on the wire
  says what the peer flies. A pilot flying the Cub is seen by everyone
  else as a quad.
- **Live cannot be reached on the deployed site.** The Live row needs a
  board track (`ghostListing` needs a `shareId`), and on the deployed site
  `boardConfigured()` is false because `PRODUCTION_BOARD_ORIGIN` is the
  placeholder `https://fdfpv.example/board`. docs/PLAN.md still says the
  placeholder is `https://fdfpv-board.onrender.com` and "already right";
  the constant was changed when the edge router was written.
- **`src/replay/` does not exist** on main, on any branch on origin, or in
  any worktree on this machine as of this writing. The crash cam agent's
  replay design could not be read, so section 6.7 states what multiplayer
  needs from a replay as an interface for that agent to accept or amend.
- **The jelly pieces** (`src/game/jelly.js`, pylons and sky hoops that
  whack a plane instead of breaking it) are on the `sky-hoops` branch,
  not on main. This design treats them as landing.
- **Liveries and parts** are feature detected, as asked: `settings.livery`
  (`configs/liveries.js`, on main) and `settings.parts` as
  `{ prop, addons, damage }` (`configs/hangar-parts.js`, on the
  `hangar-parts` branch, not on main).
- PLAN.md's "Not yet seen by two humans in two browsers" is still true.

## 1. The shape of it

```
browser (sim)  --wss-->  Worker "fdfpv-rooms"  --stub.fetch-->  Room DO (one per room)
                              |                                     |
                              +--> Lobby DO (one, the directory) <--+ counts only
```

- **One Room Durable Object per room.** It owns the roster, the spawn
  slots, the race, the loaded track, the kick list and the collision
  referee. A Durable Object runs one event at a time, so the room's state
  has exactly one owner and no locks: every message is handled to the end
  before the next starts.
- **Each client owns its own plant and nothing else.** No client ever
  simulates another pilot's aircraft. A peer is a pose stream, drawn.
- **One Lobby Durable Object** holds, per map, how many are in each public
  room shard, so the Worker can send a joiner to a shard with room. Rooms
  report joins and leaves to it; it never sees a pose.
- **The code lives in this repository**, under `edge/rooms/`, beside the
  existing `edge/router.js`. That is deliberate: the room imports the
  simulator's own pure modules (the name filter, the wire format, the
  hull tables, the track document normaliser) by relative path, and
  wrangler bundles them. The board had to pin the simulator as a
  submodule and keep MIRRORS; the rooms do not.
- The room logic is a plain module, `edge/rooms/core.js`, with no
  Cloudflare API in it: `onOpen`, `onMessage`, `onClose`, `tick(nowMs)`,
  each returning the messages to send. `edge/rooms/do.js` is the thin
  Durable Object adapter. The headless harnesses drive `core.js` in Node
  directly, so every check in section 10 runs without Cloudflare.
- Until there is a domain, the Worker runs on its `workers.dev` hostname,
  which needs no DNS. When the domain lands, `edge/router.js` gains a
  `/rooms` mount. Deployment is `npx wrangler deploy --config
  edge/rooms/wrangler.toml`, the same no dependency pattern the router
  already uses.

### 1.1 Why the hibernation API, and what it does not save

The hibernation API (`ctx.acceptWebSocket`, `webSocketMessage`,
`webSocketClose`, `ws.serializeAttachment` up to 16,384 bytes,
`ctx.setWebSocketAutoResponse`) lets a room with open sockets and no
events leave memory without dropping its clients, and a room that is
idle is not billed for duration [CF-WS] [CF-PRICE].

Be honest about when that happens: **a room with anyone flying is never
idle.** Poses arrive 30 times a second, so the object is awake and billed
for duration the whole time somebody flies. Hibernation pays off in the
hours that matter for the bill anyway: rooms where everyone is in a menu,
in the hangar, watching a replay or has the tab in the background. For
that, the client sends no pose unless it is flying (it already does not,
`liveFrame` feeds only in `mode === 'flight'`), and the keepalive is a
fixed `ping` string that `setWebSocketAutoResponse` answers `pong` without
waking the object.

In memory state is lost on hibernation [CF-WS], so everything a room must
keep across a sleep lives in its SQLite storage (roster by token, slots,
race, loaded track, kick list, all small), and per socket facts (peer id,
token, name, airframe) in the socket's attachment. An alarm purges the
room's storage ten minutes after the last pilot leaves.

## 2. Rooms and who joins

| Kind | Name (`idFromName`) | Cap | Who picks the world |
| --- | --- | --- | --- |
| Public | `pub:<mapId>:<shard>` | 16 | The map; free flight, the map's own hoops. |
| Private | `prv:<code>` | 8 by default, host may raise to 16 | The host: a map, and optionally a track. |

- **Public rooms per map.** Pick a map, press Fly with others, and the
  Worker asks the Lobby for the fullest shard of that map with a free
  seat (fullest, so a quiet evening puts the few pilots together rather
  than one per shard), or opens the next shard.
- **Private rooms by invite code.** Six characters from
  `BCDFGHJKLMNPQRSTVWXZ23456789` (no vowels, so a code cannot spell a
  word, no 0, O, 1 or I to misread): 28^6 is about 482 million codes. The
  creator is the host. A code lives while the room has anyone in it and
  ten minutes after. A share link is `.../sim/?room=K7PZ2M`.
- **The cap of 16** is where it is for two measured reasons: at 30 Hz a
  full room is 480 incoming messages a second, under half the 1,000 a
  second soft limit of one object [CF-LIMITS], and a full room is 185
  kbit/s down per player (section 5), which a phone on a weak connection
  can carry.
- **No accounts, nothing personal.** A joiner sends a picked or filtered
  display name, an airframe id, a livery and parts profile, and a pilot
  figure choice. The room issues a random 128 bit **seat token**, kept in
  the tab's `sessionStorage`, only so a dropped socket can take its seat
  back. The browser's P-256 identity key (`src/share/identity.js`) is never
  sent to a room: a stable public key is a persistent identifier, and a
  room has no use for one.
- **Origin check.** The Worker refuses an upgrade whose `Origin` is not
  one of the simulator's origins, so another site cannot put its visitors
  in our rooms.

## 3. The wire, version 2

The existing live wire (24 byte frames on `/api/live/:trackId`) had no
deployed endpoint, because the relay that spoke it was never deployed, so
no pilot anywhere depends on it. Version 2 therefore replaces it rather
than living beside it, and it is versioned so the next change does not
have to be a replacement:

- The endpoint carries the version: `wss://<rooms>/v2/room?...`.
- The first text message from a client is `hello` with `proto: 2` and the
  build's short hash. A room that does not speak it closes with code 4001
  and the reason `update`, and the client says "a newer version is out,
  reload" instead of retrying.
- Every binary message starts with a type byte. A receiver drops a type
  it does not know rather than failing, so a type can be added without a
  version bump; changing an existing type's layout is a version bump.
- A v1 client (today's `live.js`) cannot reach a v2 room at all (different
  path), and would ignore v2 frames if it did (its decoder takes only 26
  byte messages).

**The ghost format is untouched.** `FPVGHST1` version 1 is the published
contract: the board stores it and `src/game/verify.js` checks laps with
it. Nothing here writes or changes a ghost. The pose sample inside a
ghost (f32 position, i16 quaternion) is reused as the core of the live
frame so the two stay one idea.

### 3.1 Binary frames, little endian

**`0x10` POSE, client to room, 30 Hz while flying. 46 bytes.**

| Bytes | Field |
| --- | --- |
| u8 | type `0x10` |
| u8 | flags: bit 0 airborne, 1 crashed, 2 smoke on, 3 lights on, 4 chute out, 5 gear down, 6 spawning (untouchable), 7 reserved |
| u16 | sequence |
| u32 | sample time, room clock ms (section 7) |
| f32 x 3 | position, scene world metres (the ghost frame, y up) |
| i16 x 4 | attitude quaternion, component x 32767, hemisphere aligned |
| i16 x 3 | velocity, cm/s (plus or minus 327 m/s) |
| i16 x 3 | body rates, mrad/s (plus or minus 32.7 rad/s, 1,875 deg/s; a quad at full roll rate saturates here, harmlessly, since rates only drive extrapolation) |
| i8 x 4 | a plane's left aileron, right aileron, elevator, rudder; a quad's four rotor speeds; scaled to the full throw |
| u8 | throttle, 0 to 255 |
| u8 | flaps notch (2 bits), brake (3 bits), spare (3 bits) |

**`0x20` ROOM BATCH, room to client, one per room tick (30 Hz).**
A header (u8 type, u8 count, u32 room ms) and then per peer u8 seat plus
the POSE body without its type byte (45 bytes). One message per tick per
client, instead of one per peer per frame, is fifteen times fewer
messages in a full room and under half the bytes once transport overhead is
counted (section 5).

**`0x11` PARTS, client to room, 10 Hz while any broken part moves, then
one final frame at rest.** u8 type, u8 count, u32 room ms, and per part
u8 part index, f32 x 3 position, i16 x 4 attitude: 21 bytes a part, at
most 24 parts (the wreck's own limit), so 510 bytes at the worst. The
room relays it in a `0x21` batch.

### 3.2 Text frames, JSON

| Message | Direction | Carries |
| --- | --- | --- |
| `hello` | c to r | `proto`, `build`, `token` (if reconnecting), `name` or `namePick`, `profile` |
| `welcome` | r to c | your seat and token, room clock, peers with profiles, your spawn slot, race state, the loaded track id or document |
| `join`, `leave`, `profile` | r to c | a seat's arrival, departure, or changed profile |
| `t` | both | clock sync: `{c}` out, `{c, s}` back |
| `event` | c to r to c | `crash`, `whack` (a jelly piece), `hoop`, `gate`, `chat` (a preset id), `emote` |
| `hit` | r to c | the referee's mid air contact (section 6) |
| `race` | r to c | countdown start time, results |
| `report`, `kick`, `track` | c to r | a report with a reason id; a host's kick; a host's track |

A **profile** is `{ airframe, livery, parts, figure }`. `livery` is the
entry `normaliseEntry` returns for that plane (`configs/liveries.js`),
`parts` is `{ prop, addons }` from `configs/hangar-parts.js` (the
`damage` record stays home: a peer's damage in flight arrives as parts
frames, not as a stored record), `figure` is the pilot figure's preset.
The receiver runs its own `normaliseEntry` and `normalisePlane` on it, so
an id its build does not know is dropped, not an error, and a build
without `configs/hangar-parts.js` ignores `parts` altogether. Capped at
2 KB; larger is refused.

## 4. What is shared, and at what rate

| Thing | How | Rate |
| --- | --- | --- |
| Pose, velocity, body rates | `0x10` | 30 Hz |
| Control surfaces, rotor speed, throttle | `0x10` | 30 Hz |
| Smoke, lights, gear, chute, flaps, brake | `0x10` flags | 30 Hz |
| Airframe, livery, add ons, prop, pilot figure | `profile` | on join and on change |
| Smoke trail puffs | not sent: drawn by the receiver from the pose and the smoke flag, as `src/render/smoke.js` draws its own (puffs on a clock, jitter hashed from the puff index) | none |
| Crash: which parts broke, where | `event crash`, then `0x11` | once, then 10 Hz until rest |
| Crash sparks and dust | not sent: `debris.js` emits locally from the crash event | none |
| Jelly pylon or hoop wobble | `event whack {piece, t, impulse}`; the receiver runs the same wobble | per whack |
| Hoop or gate scored | `event hoop {index, t}` | per pass |
| A track for everyone | `track`, the host's document once, stored by the room | per load |
| Race start and results | `race` from the room | per race |
| Quick chat and emotes | `event chat {id}` | 1 per 2 s, burst 3 |

**Liveries on a peer.** `src/render/livery.js` paints each built model
through one global source (`setLiverySource`), which is right for the
pilot's own aircraft and wrong for a peer. `dressLivery(craft, airframeId,
colours)` already takes the colours explicitly, so a peer's rig is built
by the airframe's own builder in `src/render/craft.js` (not the mint
hologram of `ghostcraft.js`, which stays the ghost's look) and dressed
with `coloursFor(airframe, peer.livery)`. Add ons are drawn by the parts
agent's fitter (`src/render/partsfit.js` on `hangar-parts`) against the
peer's own entry.

**A track in a room.** A private room's host may load a track: a board
track by id (every client fetches it from the board as today), or their
own track document, sent once, run through `src/game/trackdoc.js`
normalisation in the room, capped at 64 KB, stored in the room's SQLite
for the room's life and handed to every joiner in `welcome`. The world is
the document's `map`.

**Race state.** The room is the race director: it announces a countdown
that ends at a room clock time T, and every client starts its lap clock
at T on its own sim clock. Each client scores its own gates and hoops
exactly as today (`src/game/race.js`, `score.js`) and reports each pass;
the room orders the results. Laps in a room are not board times: posting
one to the board still goes through the existing signed, ghost checked
path.

## 5. Bandwidth

Transport overhead per WebSocket message is taken as 6 bytes of client
frame header (masked) or 2 of server header, 22 of TLS 1.3 record, and 52
of TCP/IP with timestamps. ACKs are left out.

| | Per message | Per second at 30 Hz | kbit/s |
| --- | --- | --- | --- |
| Up, one player | 46 + 6 + 22 + 52 = 126 B | 3,780 B | 30 |
| Down, room of 2 | 6 + 45 + 1 + 2 + 22 + 52 = 128 B | 3,840 B | 31 |
| Down, room of 8 | 450 B | 12,120 B | 97 |
| Down, room of 16 | 772 B | 23,160 B | 185 |
| Down, room of 16, unbatched (today's relay shape) | 15 x 124 B | 55,800 B | 446 |

Per room of 16: 60 KB/s in, 371 KB/s out. Cloudflare charges nothing for
egress or WebSocket bandwidth [CF-WORKERS], so bandwidth is a question of
the player's connection, not of money. Parts frames add at most 5 KB/s
for three seconds around a crash, and the text traffic is noise.

**Interest management.** At 16 a room, every player gets every other at
full rate; the batch is the whole room. Big maps (the Alps valley is six
kilometres long) still gain from thinning, and it is what lets the cap be
raised later: per recipient, a peer within 300 m comes every tick, 300 m
to 1.5 km every sixth tick (5 Hz), and beyond that once a second, for the
name tags and the map. The room decides this, per tick, from the latest
poses it already has; it costs a distance per pair. The referee (section
6) ignores it and sees everything.

## 6. Mid air collisions: real crashes under lag

### 6.1 The options

**A. Each client judges its own view.** Each client tests its craft
against its drawn peers and crashes on contact. Instant, and wrong: A
sees B 150 ms in the past, B sees A 150 ms in the past, and a pass that
misses on one screen hits on the other. One player crashes alone.
Refused: the owner's requirement is that both screens agree.

**B. Both clients apply one rule to the same relayed samples.** Each
client runs the same deterministic test on its own sent samples and the
peer's, and both reach the same answer because they fed it the same
bytes. It agrees only if both hold exactly the same samples for the
interval, which interest management, a reconnect or a stalled tab each
break; two engines must also agree on the arithmetic to the bit, and a
client that disagrees with the rule simply does not crash. No single
place is the truth.

**C. The room is the referee.** The room already receives both sample
streams. It judges contact on those samples, on the senders' room clock
timestamps, once both streams cover the interval, and sends one `hit` to
both. Both clients apply the same event. They agree by construction,
since there is one decision; the rule runs in one engine, so cross engine
float agreement is not needed; and the same module runs in the Node
harness.

**Picked: C, the room as referee,** with the rule in a pure module,
`src/game/midair.js`, which the room imports and the harness drives. The
cost is time: a hit is known a little after it happened (section 6.4),
which is the same on both screens and is dealt with there.

### 6.2 The rule

Each airframe's hull is its part table's boxes, the same boxes the crash
physics breaks and `src/game/airframehull.js` and `src/render/wreck.js`
already use. The part table lives in the WASM (`crash_parts.h`), and the
room has no WASM, so a generated `configs/hulls.js` holds every
airframe's part boxes, written by a script that reads them through
`sim_part_info` in Node, with a check in CI that the file matches the
built module. The same pattern as `lint:catalog`.

For every pair of seats, each tick:

1. **Broadphase.** Skip the pair unless their bounding spheres, grown by
   each one's travel over the interval, overlap. With 16 seats that is
   120 cheap tests and almost always zero survivors.
2. **Window.** The interval judged is `[t0, t1]`, the newest span both
   seats' samples cover, on the room clock. A seat whose samples lag the
   room clock by more than `LATE_MS` (400 ms) is not waited for: its
   uncovered interval is judged as no contact. When in doubt, nobody
   crashes.
3. **Sweep.** Both poses are interpolated between their bracketing 30 Hz
   samples (position linear, attitude nlerp, exactly `LiveGhost.sample`),
   stepped at 1 ms, and each step tests every part box of one against
   every part box of the other with the separating axis test. Quaternion
   to matrix is multiply and add; the whole test has no trigonometry. At
   a 50 m/s turn of 5 g, linear interpolation between 30 Hz samples is
   off the true path by a·dt²/8, about 7 mm, far inside the hull.
4. **Margin.** A contact counts only when the boxes, each shrunk by
   `MARGIN` (5 cm), still overlap. Section 6.6 says why.
5. **Excluded:** a seat flagged `spawning` (the five seconds after a spawn
   or respawn and until 30 m from its slot), a seat already crashed, and
   a pair both on the ground below 3 m/s (taxiing wingtips).
6. **Out.** The first step of contact gives the time `tc`, the two parts
   that met, the contact point, the normal (the separating axis of least
   overlap, pointing from B into A), and both velocities at `tc`.

The room sends one `hit` to both seats:

```
{ type: 'hit', id, tc, a: seatA, b: seatB,
  n: [x, y, z],              world, from B toward A
  pa: [x, y, z], pb: [...],  contact point in A's and in B's body frame
  partA, partB,              part indices in each table
  va: [...], vb: [...],      velocities at tc, world
  ma, mb }                   all up masses, kg, from each profile
```

### 6.3 How the other aircraft's body enters the local crash sim

The plant already has the door, used by the city's train until the city
was retired on 2026-09-28:
`sim_contact_part(part)` then `sim_contact_at_mat(n, mat, p, vs, r)`,
a rigid body contact with a caller given arm `r` and a moving surface
velocity `vs`, judged by the damage mode against the struck part's
limits. The peer is that moving surface, kinematic, a collider with
the peer's pose and velocity at the moment of contact.

**The surface velocity is the pair's centre of mass velocity.** The plant
treats a surface as infinitely heavy. For a contact along n with
restitution e, a body A striking a surface moving at vs changes its
normal velocity by (1 + e)(vs - vA)·n; two free bodies change A's by
(1 + e) mB / (mA + mB) (vB - vA)·n. The two are equal exactly when

    vs = (mA vA + mB vB) / (mA + mB)

so passing the centre of mass velocity makes an infinitely heavy surface
hit A as hard as B really would along the normal. That matters here: the
fleet runs from the 23 g whoop to the 4.5 kg Bombshell, and a 420 g
foamie meeting a 2.1 kg scale Cub should lose, and the Cub should
survive it more often than not. Each client computes the same vs from the
same event and applies its own side. The rotational terms (a hit far
from each centre of gravity) are left to each plant's own contact solve;
the harness measures how far the pair's total momentum drifts, and if it
is too much, the fix is an additive ABI call for a two body contact, not a
cleverer vs.

**The material** is the struck part of the other aircraft. Today's
surfaces are ground and furniture; there is no foam, balsa or carbon
airframe. Phase 3 adds `SIM_SURF_FOAM` and `SIM_SURF_CARBON` as additive
ABI, each sourced in docs/CRASH-STAGE1.md like the others, and each part
of `configs/hulls.js` names its own.

**Where.** The event arrives after the contact (section 6.4), and by then
A has flown on. The contact is applied at A's current pose with the
event's geometry in A's body frame: the arm is `pa`, the point is A's
current pose plus the arm, and the normal is rotated by A's rotation since
`tc`. The hit lands where you are, with the geometry of when it happened.
The alternative, rewinding the plant to `tc`, would need a state write
the ABI does not have and would rewrite the last 100 to 200 ms of a
flight the pilot already saw; refused.

**Bit identity.** A client that never receives a `hit` never calls either
function. Both are additive ABI whose comments in `src/native/sim_abi.h`
say a host that never calls them is the host it was, and the damage
mode's bit identity rule holds under a contact that breaks nothing.

### 6.4 Both screens agree, and what each sees

With one-way latencies LA and LB to the room, a contact at `tc` is judged
when both samples covering it have arrived, about `tc + max(LA, LB) +
one tick`, and applied on A's screen about LA after that. On a typical
home connection (30 to 80 ms one way) a hit lands 100 to 200 ms after it
happened, on both screens, the same event.

What each pilot sees at that moment matters as much as the rule:

- **Near peers are drawn in the present, far peers in the past.** Today
  every peer is drawn 150 ms behind its sender. That is smooth, and it
  would show the pilot a peer several metres from where the room judges
  it: at 30 m/s, 150 ms plus the latency is 6 m. So a peer within 60 m is
  extrapolated to the present on the room clock, from its last sample's
  velocity and body rates, capped at 250 ms of extrapolation, and blended
  back to the smooth delayed pose past 100 m. A near peer then sits within
  about a metre of where the referee has it.
- **On `hit`**, each client applies its own contact, freezes the peer's
  rig at its extrapolated pose, and flashes the impact at the contact
  point. The peer's own `crash` event and parts frames arrive one hop
  later (under 100 ms), and the frozen rig is replaced by the peer's real
  wreck, driven part by part by `0x11` frames through `src/render/wreck.js`
  and the peer's own airframe model.
- **The crash cam and the replay show the true moment**, because the
  replay holds both aircraft's samples (section 6.7).

### 6.5 Debris on both screens

Each client's plant breaks its own aircraft and reports it. The sender
sends `event crash` with the parts that broke and then `0x11` frames of
every broken part's pose at 10 Hz until they rest, and one at rest. A
receiver draws the peer's pieces by cutting the peer's model with the
same part table, exactly as `wreck.js` cuts the pilot's own, and
interpolates the 10 Hz poses. Sparks, dust and splashes are emitted
locally from the event by `debris.js`, seeded by the event id, so both
screens show the same kind of burst without sending it. Wreckage at rest
stays in the room until its owner respawns.

### 6.6 Fairness, and the test that measures it

**What the rule promises.** The decision depends only on the samples'
contents and their sender timestamps, never on when they arrived. So:

1. **Agreement.** Both seats receive the same `hit` or neither does.
2. **Latency does not decide.** Any latency or jitter under `LATE_MS`
   changes when a pilot learns of a hit, never whether it happened.
   Swapping two players' latencies changes nothing.
3. **Lag above the cutoff never crashes anyone.** Samples later than
   `LATE_MS` are judged as no contact for both. A laggy player can
   ghost through; they cannot cause a crash they could not see.
4. **Honest resolution.** With perfect clocks the rule is exact to the
   30 Hz sampling and the shrink: each box is shrunk by the 5 cm `MARGIN`,
   so a true clearance is never judged a hit and a true overlap under
   about 10 cm may be judged a miss. Real clocks are not perfect (section
   7): a clock error of d ms moves a seat along its own path by v·d, so
   5 ms at 40 m/s is 0.2 m. That error comes from how unequal a link's two
   directions are, not from how slow it is, and it is the one way a
   network can change the answer. The harness measures it separately.

**The test**, `node scripts/midair-harness.js`, in CI. It drives
`edge/rooms/core.js` in Node with two headless clients whose true
trajectories are scripted at 1 kHz (the scenarios below), each client
sampling them to 30 Hz exactly as `LiveSender` does, over simulated links:
FIFO (a TCP stream cannot reorder), delay = base + jitter, with stalls
(head of line blocking, 200 ms) injected at random. Scenarios: head on,
crossing at 90 degrees, overtaking from behind, wingtip graze at depths
from minus 20 cm to plus 20 cm in 1 cm steps, formation at 1 m, one
client stalled mid pass, one client reconnecting mid pass. Grid: base
latency 0, 25, 50, 100, 200, 300 ms, independently per client, jitter
0, 10, 30, 60 ms, 20 seeds each. It runs twice.

**Run 1, exact clocks** (every client knows the room clock), which tests
the rule and the network apart from the clock:

| Measure | Pass |
| --- | --- |
| Both seats got the same set of hits | 100 percent of runs |
| Hit set equals the zero latency run, for every latency under `LATE_MS` | 100 percent |
| Swapping A and B's links changes the hit set | never |
| Truth clearance of any size judged a hit | 0 |
| Truth overlap deeper than 15 cm judged a miss | 0 |
| Decision delay, p95, over max(LA, LB) | under 60 ms |
| Peer drawn distance from the referee's pose at the hit, near peers, 50 ms links | median under 1 m |

**Run 2, synced clocks** (section 7 running, each link's two directions
differing by 0 to 20 ms): the first three rows must still pass, since
the room makes one decision whatever the clocks say; the accuracy rows
are reported as a band, the truth clearance at which false hits start
and the truth overlap at which misses stop, against the asymmetry. That
band is the real resolution of the rule. It is reported, not hidden, it
is the number to watch if the rate or the clock sync changes, and whether
it is acceptable is a flying question for the owner. A second pass runs the same
grid with the real plant (`tests/lib/simmod.js`) on each side, stick
scripts instead of kinematic paths, applying hits through the ABI, and
checks that both aircraft broke in the head on and crossing cases above
10 m/s closing, and the pair's momentum drift.

### 6.7 Replays, and single player determinism

**Mid air contact is an external input, recorded.** The plant only ever
learns of a peer through a `hit`, applied at a known sim step. The
recording of a flight in a room is therefore:

1. what a single player recording already is (the sticks and the shell's
   calls, whatever the replay agent settles);
2. **external inputs**: at sim step k, `contact_part(partA)` and
   `contact_at_mat(n, mat, p, vs, r)` with the exact doubles applied;
3. **peer tracks**: every `0x20` and `0x21` frame as received, keyed by
   the local sim step of arrival, plus the profiles, for drawing the
   other aircraft and their debris in the replay. Visual only.

Replaying 1 and 2 reproduces the pilot's own flight to the bit, crash
included, with no network. 3 lets the crash cam show the other aircraft
arriving, at the true `tc`, not the late moment the event landed. A
single player flight has no 2 or 3, so it is the recording it is today.

**What this asks of `src/replay/`**, which does not exist yet: a way to
record `(step, kind, payload)` for kinds it does not own and to hand them
back in order on playback, and a side track of timestamped opaque frames
for the renderer. If the replay agent's design already has an event
stream, both are two more event kinds on it.

### 6.8 As built in Phase 3, and where it differs from the above

Built on 2026-09-28: `configs/hulls.js` (generated by
`scripts/hulls-gen.js`, held by `hulls:check`), the rule in
`src/game/midair.js`, the room's side in `edge/rooms/referee.js` (two
dispatch lines in `core.js`), the client in `src/main.js` (a dispatch line
in `src/share/rooms.js`), and the checks `midair:harness`, `midair:plant`,
`rooms:selftest`'s mid air section and `scripts/midair-two-page.js`.

Where the design above was wrong or changed, found by its own checks:

- **MARGIN is a penetration of 2 cm, not a 5 cm shrink per box.** A five
  inch's frame box is 38 mm wide and its motors 28 mm: shrunk by 5 cm a
  side there is nothing left, and a quad could never be hit. What the
  margin covers is the interpolation's error, a·dt²/8 between 30 Hz
  samples: 7 mm at 5 g, 14 mm for a quad at 10 g. A contact counts when
  two boxes overlap by more than 2 cm on every separating axis.
- **The normal is the axis the two parts crossed,** the one that
  separated them a millisecond before contact, not the least overlap at
  the first millisecond. At 16 m/s closing two motors 26 mm tall go 16 mm
  into each other in a millisecond, the least overlap was their height,
  and both plants were handed a normal square to the closing velocity:
  a contact with nothing to stop, and no damage.
- **No new surfaces.** A contact's peak force is the surface's stiffness
  in series with the part's own, and the existing surfaces already carry
  the stiffnesses `crash_parts.h` gives each material's parts: foam
  fuselages 2e5 N/m (the race gate's PVC), a carbon frame 5e6 (wood),
  metal for motors and wire. `SIM_SURF_FOAM` and `SIM_SURF_CARBON` would
  have carried the same numbers, so they were not added: no ABI change
  and `dist/sim.wasm` is the module single player already flies.
- **The hit carries each side in its own plant body frame:** the part
  struck, the material that struck it, the arm, the normal, and its
  velocity relative to the pair's centre of mass. The client turns them
  by its attitude now, and passes the plant a surface velocity of its own
  velocity less that relative velocity: the hit lands where the aircraft
  is, with the geometry and the closing speed of the contact, whatever
  the pilot did in the 150 ms since.
- **Both break, at 10 m/s closing or more** (`BREAK_MPS`). The plant
  solves each side against an infinitely heavy surface, and a prop met
  nose to nose, or a wingtip met far from the CG, can leave one side
  under every limit: in `midair:plant` the limits alone broke both in 88
  of 120 passes above 10 m/s. The owner's rule is that both break, so
  each side also breaks off the part it was struck on (`sim_part_break`,
  the crash core's forced break; the nearest part when the root was
  struck). The one number to change if the rule should be gentler.
- **Momentum is not conserved between the two plants** (section 6.3's
  risk, measured): the drift |dPA + dPB| over the larger is a median 37
  percent over `midair:plant`'s passes, p95 99. A prop that meets a
  fuselage stops the fuselage's owner and barely slows its own. The
  plan's fallback, an additive two body contact call that tells the
  plant the other body's effective mass at the point, is the fix; not
  built.
- **The hit goes to everyone in the room,** not only the two, so a third
  pilot sees the flash at the contact point.
- **Spawning** is set by the client: five seconds after a flight starts
  (the sim clock starting again) and until 30 m from where it started.
- **Replays (section 6.7):** the plant's side is recorded for free. The
  shell's module calls already go through `src/replay/journal.js`, which
  exists now (section 0 said it did not), so a hit is two more journaled
  calls at a known step and TAKE OVER flies it again to the bit;
  `midair:plant` P3 proves the same calls on a fresh module give the same
  plant. The peer tracks for the crash cam (6.7 item 3) are not built:
  the replay shows the pilot's own crash, not the other aircraft
  arriving.

Measured, full grid (20 seeds, 256,320 runs per clock mode): both seats
agree in every run; the hit set equals the zero latency run's in every
run inside `LATE_MS`; swapping links never changes it; no hit is ever
decided more than `LATE_MS` after its contact. Exact clocks: no false
hit, no miss at 15 cm, hits start at 2 cm (head on graze) and 4 cm
(crossing), decision delay p95 31 ms over max(LA, LB), near peers drawn a
median 0.00 m from the referee on straight passes and 0.39 m in a 6 g
turn, contact to screen median 144 ms and p95 217 ms on 50 ms links.
Synced clocks (0 to 20 ms asymmetry): the first four rows still hold in
every run; the head on graze is unmoved (a clock error slides each along
its own path); the crossing graze at 20 m/s is judged a hit in 3 percent
of runs at 30 cm of true clearance and missed in some at up to 36 cm of
true overlap, rising through 33 percent at the truth's own edge. That is
the plan's v·d: 20 m/s times up to 17 ms of the two clocks' difference.
It is the rule's real resolution, and it is the number to fly.

Two real pages (`scripts/midair-two-page.js`, two Cubs thrown nose to
nose at 15 m/s each, 60 m over the Swiss valley, against `wrangler
dev`): one hit, the same id, moment and point on both pages, applied on
each to its own plant with the module answering OK, and both broke: one
lost a prop and flew on, the other lost its motor and tail and was a
wreck, and each screen showed the same one falling.

## 7. Clock sync

The room's clock is `Date.now()` in the Durable Object. Workers advance
it only between I/O events, which is exactly the resolution needed here:
a timestamp per message.

On join, the client sends eight `t` pings a quarter second apart and
keeps the offset from the one with the smallest round trip:
`offset = s + rtt / 2 - c_recv`. The same, one ping every 30 s while
flying, tracks drift; the estimate moves by at most 2 ms per update so
the peers do not jump. The client stamps each POSE with its room clock
estimate of the instant the sample stands for (the render pose's own sim
time mapped to wall time, not the moment the frame was painted).

The error is half the asymmetry of the path, typically a few
milliseconds; section 6.6 says what it costs and the harness measures it
by giving the two directions of a link different delays.

## 8. Spawn points, and the pilots on the field

**Spawn slots.** A map's `spawn { x, z, yaw }` stays the single player
spawn. A map may add `spawns`, a list of `{ x, z, yaw, kind, pilot: { x,
z } }`, `kind` one of `strip` (a plane on its wheels), `pad` (a quad),
`hand` (a hand launch, the pilot's own spot). A map without the list gets
slots derived from its spawn: a row 8 m apart across its heading, quads
in front, planes behind.

For the airfield, where it is concrete: the runway is 120 by 12 m with
the spawn 8 m in from its threshold. Plane slots are staggered along the
taxi edge beside the runway, 12 m apart; quad pads are a row of eight on
the grass 15 m off the runway's side, 4 m apart; the pilots' stations are
a line 25 m off the runway, 3 m apart, the way a club flight line is laid
out, and every slot's pilot stands at the station nearest its slot. A
track in a room uses its start pads as slots: `startBlockLaneOffset`
already knows the block's lanes, and a block has as many as it was built
with.

**Occupancy aware.** The room assigns slots, since it is the one place
that knows who is where. A joiner gets the first slot whose last occupant
has flown 30 m clear and is not `spawning`; a respawn gets the same
treatment. A seat holds its slot until it is 30 m away and five seconds
airborne. If every slot is held, the joiner waits, with its countdown on
screen, rather than spawning into someone.

**The pilots.** Phase 1 draws each pilot as a simple static figure, a
low poly person holding a transmitter, in one of a dozen preset looks
(the `figure` id: a suit colour and a cap, nothing more personal than
that), standing at its station with its name above it. The head turns to
follow its own aircraft, one yaw and one pitch, which is what makes a
figure on a flight line read as a pilot and costs a look at per frame. A
rigged character with idle and cheer animations is a later refinement if
the static one looks dead in the owner's eyes. A pilot flying first
person is still drawn at their station: that is where their body is.

## 9. Children in the room: safety and abuse controls

No free text of any kind reaches another player: not a chat, not a name
typed into a public room, not a track name.

- **Names.** Public rooms show **picker names only**: an adjective, an
  animal and a two digit number ("Swift Heron 42"), from curated lists in
  the string table, in both languages, chosen from three offered. The
  room receives the three indices, not a string, so there is nothing to
  filter. Private rooms, where everyone has the code from someone they
  know, may use the pilot's typed name, passed through the filter.
- **The filter**, `src/share/namefilter.js`, one module run by the client
  (instant feedback) and by the room (the decision). On the existing
  `NAME_RE` charset: fold to lower case, map look alike characters (0 o,
  1 i and l, 3 e, 4 a, 5 s, 7 t, $ s, @ a), drop spaces, dots, dashes and
  underscores, collapse runs of the same letter, then refuse a name that
  contains a blocked term (English and Spanish), five or more digits in a
  row (a phone number), or anything shaped like a handle or an address
  ("www", "http", "com", "net", "insta", "tiktok", "snap"). An allow list
  keeps the innocent words a substring match would catch (the
  Scunthorpe problem). The source list is the owner's call (section 14).
- **Quick chat and emotes.** A fixed set of presets ("Nice flying!",
  "Race?", "Follow me", "Wait for me", "Oops", "Good game", "Landing") and
  emotes (wave, thumbs up, a smoke puff), sent as an id and shown in the
  receiver's own language. 1 per 2 s, burst 3.
- **Mute.** Any player can hide another's name, chat and emotes on their
  own screen. Local, nothing sent.
- **Report.** Any player can report another with a reason id (name,
  ramming, spam). In a public room, reports from distinct seats within
  five minutes that reach max(2, a third of the room) remove the target
  for 30 minutes. A reporter may file 3 reports per 5 minutes.
- **Kick.** In a private room the host kicks directly, for the room's
  life.
- **Ramming.** Real crashes invite a player who rams on purpose. It costs
  them their aircraft too, and the report has a reason for it. There is
  no automatic rule: a bench (a seat in more than three mid airs in five
  minutes made `spawning`, untouchable and unable to touch, for two
  minutes, with nothing on screen to say so) was built and then removed
  by the owner on 2026-09-29 ("kill anti ramming rule"). Every mid air
  counts, in every room and in a Catch the Ace match.
- **Pose sanity.** The room refuses POSE frames that break the airframe's
  envelope (speed, acceleration, a teleport), with the numbers
  `src/game/verify.js` already uses, and marks the seat `spawning` while it
  does: a forged pose cannot ram anyone.
- **Rate limits at the room.** POSE over 35 a second dropped; text over 5
  a second dropped, with the clock's pings counted apart (5 a second of
  their own, `edge/rooms/core.js` CLOCK_PER_S); over 20 texts a second, of
  any kind, closes the socket. Joins: 10 a
  minute per address per room, and the Worker applies a per address limit
  across rooms before it ever reaches one.
- **What a kick remembers, and for how long.** A removal is keyed on the
  seat token and the connecting address, held **in the room's memory
  only**, for its 30 minutes, never written to storage or logs. If the
  room hibernates, the list is lost; a hibernating room is an empty room,
  and an empty room has nobody to protect. Workers observability logging
  stays off for the rooms Worker, so addresses do not land in logs.
- **Stored: nothing personal.** SQLite holds seat tokens, picker indices
  or filtered names, profiles, slots, the race and the loaded track,
  purged ten minutes after the room empties. No email field exists
  anywhere in this design.

## 10. Checks

| Check | What it is | Runs |
| --- | --- | --- |
| `rooms:selftest` | `core.js` in Node: join, welcome, caps, slots, reconnect with a token, hibernation (a fresh core from the stored state and attachments), version refusal, rate limits, reports, kicks | CI |
| `midair:harness` | section 6.6, two clients, latency and jitter grid | CI |
| `midair:plant` | section 6.6, real plant on both sides | CI |
| `rooms:load` | 16 clients a room, 64 rooms, one process, for 10 simulated minutes: messages and bytes per client against section 5, the core's CPU per tick, interest thinning | CI, short; long on request |
| `hulls:check` | `configs/hulls.js` equals the built module's part tables | CI |
| wrangler dev soak | two, then 16, real sockets against `wrangler dev` (local workerd) for 10 minutes: the adapter, hibernation with idle clients, auto response | by hand, per phase |
| two page shots | `scripts/shots.js` with two headless pages in one room, a picture of each seeing the other in its paint | per visual phase |
| `?netsim=base,jitter` | a debug query that wraps the socket in delay queues, for flying with lag on purpose | by hand |
| existing gates | `crash:rules`, `crash:handoff`, `contact:selftest`, `verify` on the ABI change | per phase that touches them |
| fly it | the owner and one other person, two browsers, one room | end of every phase |

## 11. Costs

Prices from Cloudflare's pages as read on 2026-09-27 [CF-PRICE]
[CF-WORKERS]:

- Durable Objects on the Free plan: 100,000 requests a day, 13,000 GB-s
  of duration a day, SQLite storage only.
- On Workers Paid, $5 a month minimum, including 1 million requests and
  400,000 GB-s a month; then $0.15 per million requests and $12.50 per
  million GB-s.
- An incoming WebSocket message is billed as 1/20 of a request. Outgoing
  messages and protocol pings are free. Duration is billed on 128 MB per
  awake object, whatever it uses. No egress charge.

**The unit costs of this design.** A flying player sends 30 POSE plus
about 0.2 other messages a second: 30.2 × 3,600 / 20 = **5,436 billable
requests a player hour**. A room with anyone flying is awake:
0.128 GB × 3,600 s = **460.8 GB-s a room hour**. So on Paid, a player
hour costs $0.00082 in requests and a room hour $0.0058 in duration.

**The Free plan** covers 100,000 / 5,436 = **18 player hours a day** and
13,000 / 460.8 = 28 room hours a day, whichever runs out first: ten
friends for an hour and three quarters, every day. What happens past the
daily limit is to be confirmed on the account before anyone relies on it;
the working assumption is that requests fail until the daily reset, so
the free plan is a test bed, not a launch.

**Paid, at a concurrency held around the clock** (730 hours a month; an
upper bound, since real concurrency is a peak, not a floor), with rooms
assumed 8 players on average:

| Concurrent | Rooms | Requests a month | Request cost | GB-s a month | Duration cost | Total a month |
| --- | --- | --- | --- | --- | --- | --- |
| 10 | 2 | 39.7 M | $5.80 | 672,768 | $3.41 | **$14** |
| 100 | 13 | 396.8 M | $59.37 | 4,372,992 | $49.66 | **$114** |
| 1,000 | 125 | 3,968 M | $595 | 42,048,000 | $521 | **$1,121** |

The Worker requests that open the sockets are well inside Paid's 10
million a month. Hibernation earns its keep in the hours when rooms are
open and nobody flies, which this table does not charge for at all.

**Levers**, if the bill ever matters: send two samples per message at
15 Hz (halves requests, adds 33 ms of delay to every peer); pose at 20 Hz
(a third off requests, the attitude of a fast roll gets coarser); fuller
rooms (duration is per room, so 12 a room instead of 8 takes a third off
duration). None is taken now: the numbers above are small next to what
the design has to get right.

## 12. Phases

Estimates are agent days of build and check, plus the owner's flying,
honestly padded for a network feature that has not been flown by two
humans yet.

**Phase 0, the room.** `edge/rooms/` core and adapter, v2 wire, the
Lobby, public shards and invite codes, clock sync, reconnect with a
token, caps and rate limits, picker names, the origin check, deployed to
`workers.dev`. Peers still drawn as today's ghost, but on the room clock.
Check: `rooms:selftest`, the wrangler dev soak with two sockets, two
browsers seeing each other. **3 to 4 days.** Needs: a Cloudflare account.

**Phase 1, a shared field.** Peers in their own airframe, livery, add
ons, surfaces, prop, smoke and lights; spawn slots on every map; the
pilot figures at their stations; near peer extrapolation. Check: two page
shots, `rooms:load`. **4 to 5 days.**

**Phase 2, shared wrecks and jelly.** Crash events, parts frames, the
peer's wreck, whacks. Check: shots of a peer's crash from the other page,
`rooms:selftest` extended. **2 to 3 days.**

**Phase 3, mid air crashes.** `src/game/midair.js`, `configs/hulls.js`
and its check, the referee in the room, the ABI materials for airframes,
applying hits, recording them as external inputs with the replay agent.
Check: `midair:harness`, `midair:plant`, the crash gates, and the owner
and a friend flying into each other on purpose at the airfield. **6 to 9
days**, the riskiest phase: the tuning of feel under lag is where the
estimate can slip.

**Phase 4, racing together.** Shared countdown, per player gate and hoop
scoring, results, a host's track loaded for everyone. Check: a two client
race in Node through `race.js`, then two browsers. **3 to 4 days.**

As built (2026-09-28): the room's half is `edge/rooms/race.js`, the
client's `src/share/roomrace.js`, the screens `src/ui/roomhud.js`. Where
it departs from sections 4 and 7:

- The host sends the track document their seat holds (My tracks, the
  online tracks and the casual sky course are all one kind of map track
  document); there is no board track by id. The room normalises it with
  the builder's own `normalize` (`src/trackbuilder/model.js`, as the
  tracks server does), not `trackdoc.js`, which is the retired race
  field's; it drops the logos, runs the name through the tracks server's
  word list and caps it at 64 KB.
- Race times are on the room clock, ms from goAt, not on each sim clock:
  the plant does not step while an aircraft sits parked, so a sim clock
  started at goAt would not count a pilot's wait on the line. Each pass is
  stamped at its crossing (the race's own interpolated time), not at the
  frame that saw it.
- The racers are the seats whose world had the track standing when the
  host pressed start; anybody else, and a joiner mid race, flies the track
  free and watches the order until the next one.
- The track and the race are kept in the room's storage for a
  hibernation; readiness is not.
- Checks: `rooms:selftest` (the race sections, two clients each with a
  real `Race` over the builder's gates), and `rooms:racetwopage` by hand
  against `wrangler dev`, two pages on swiss2.

**Phase 5, safety complete.** Quick chat, emotes, mute, reports, kicks,
the pose sanity rule, the name filter with its lists (the ramming rule
was built here and removed on 2026-09-29, section 9).
Check: `rooms:selftest` cases for each, and the owner reading every
preset in both languages. **2 to 3 days.** **Public rooms stay closed
until this lands**; Phases 0 to 4 run on private codes only.

**Phase 6, scale.** Interest thinning, a cap above 16 if the load test
supports it, the cost counters (billable messages and awake room time per
day, from the room's own counts). Check: `rooms:load` at 32 a room.
**2 to 3 days.**

As built (2026-09-29), for the VM rather than Cloudflare: since the move to
the owner's one core VM (`deploy/vm/README.md`) "cost" means that core,
its memory and its egress, not a bill of requests.

- **Interest thinning** is `edge/rooms/core.js` `INTEREST`, as section 5
  planned: a peer within 300 m every tick (30 Hz), to 1.5 km every sixth
  (5 Hz), beyond that every thirtieth (1 Hz), judged per recipient each
  tick from the two newest poses. A seat that is not flying (no pose for a
  second: a menu, a crash cam, just joined) is sent everybody at the full
  rate. Only the batches are thinned: the referee, a tag match and a
  combat round judge every pose as it arrives, and a far peer that stops
  still has its last pose delivered. The client (`src/game/peer.js`) draws
  a far peer DELAY_MS plus however much longer than 33 ms its samples now
  come apart, the delay slewing at 20% so a change of band never jumps,
  and carries a late sample on at its velocity rather than holding it; a
  peer at the full rate is drawn exactly as before, and a near peer's
  present never depended on the delay.
- **The counters** are `edge/rooms/health.js`, counted at the sockets in
  `edge/rooms/node.js`, at `GET /v2/admin/health` with the tracks server's
  admin secret (the rooms unit reads the same `/etc/fdfpv/tracks.env`):
  pilots, rooms, messages and bytes a second each way for the server and
  per room (a private room without its code), this process's CPU and the
  host's, the loop's p50, p99 and worst delay, memory, and the UTC day's
  totals (egress, messages, pilot hours, room hours, the peak, refusals).
- **The valve**: while this process averages half the core over 10 s, or
  the loop's p99 delay averages 20 ms, or its resident size passes 200 MB,
  a new public room is refused (503 `busy` on a create, and on a quick
  join that finds no room with a seat), and the list says `busy: true`,
  which the room browser shows in place of Make a room and quick join. It
  opens after 30 calm seconds in a row. Rooms flying, joins into them and
  private rooms are never refused.
- **The cap stays 16.** The numbers below say a public room of 24 or 32
  fits the core alone but not several of them busy at once, and the
  client colours sixteen seats.

**rooms:load** (`scripts/rooms-load.js`) flies headless pilots at the
client's rates: poses at 30 Hz, clock pings, keepalives, a quick chat
every 8 to 20 s, a crash a pilot a minute (the event, then PARTS at 10 Hz
for 3 s), then a race (a six gate track, everyone ready, three laps, every
gate reported), then a combat round (a fifty link streamer at 10 Hz from
the countdown). Free flight is spread as on a big map: half the room
within 250 m, a quarter 300 m to 1.5 km out, a quarter 1.5 to 4 km. The
server's numbers come from its own admin route. CI runs `--quick`: 32 in
one room, 5 s a phase, checking function only.

Measured 2026-09-29 on the owner's desktop (Core Ultra 7 265, 20 cores)
against a local `node.js`, 20 s a phase, **with the machine at a load
average of 18 to 32 from other agents**, so CPU is CPU time (a fraction of
one core) and not wall share, and the loop's delay includes the host's
scheduling. CPU is the rooms process; "per pilot" is the payload each
pilot received; "near" is the rate and p99 gap of peers within 300 m;
"saved" is the pose entries thinning did not send against every pose to
everybody.

| Phase | Rooms x pilots | CPU | Loop p99 mean / worst ms | Out kB/s (a room) | Out msgs/s | Per pilot kB/s | Near Hz / p99 gap ms | Saved |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| free | 1 x 8 | 5.0% | 3.0 / 5.3 | 42 | 239 | 4.9 | 29.8 / 67.5 | 76% |
| race | 1 x 8 | 2.8% | 2.9 / 4.2 | 67 | 246 | 8.5 | 29.1 / 67.5 | 16% |
| combat | 1 x 8 | 3.9% | 2.9 / 4.4 | 170 | 799 | 21.3 | 29.8 / 67.5 | 3% |
| free | 1 x 16 | 6.0% | 3.2 / 6.9 | 186 | 776 | 10.8 | 28.9 / 67.5 | 74% |
| race | 1 x 16 | 3.6% | 2.6 / 4.6 | 307 | 532 | 19.2 | 29.1 / 67.5 | 10% |
| combat | 1 x 16 | 10.1% | 9.6 / 51.2 | 722 | 2,883 | 45.0 | 28.8 / 67.5 | 5% |
| free | 1 x 24 | 7.6% | 3.2 / 4.9 | 434 | 1,512 | 16.9 | 29.4 / 67.5 | 73% |
| race | 1 x 24 | 5.1% | 3.1 / 7.4 | 649 | 849 | 27.1 | 29.2 / 67.5 | 17% |
| combat | 1 x 24 | 14.1% | 15.1 / 48.8 | 1,662 | 6,261 | 69.1 | 28.7 / 67.5 | 5% |
| free | 1 x 32 | 9.7% | 3.3 / 6.2 | 772 | 2,561 | 22.5 | 29.3 / 67.5 | 73% |
| race | 1 x 32 | 6.9% | 3.7 / 7.9 | 1,104 | 1,192 | 34.7 | 29.0 / 67.5 | 21% |
| combat | 1 x 32 | 25.0% | 28.6 / 49.5 | 2,918 | 10,883 | 91.0 | **26.9 / 82.5** | 11% |
| free | 4 x 16 | 14.1% | 3.6 / 5.7 | 182 | 3,104 | 10.5 | 29.2 / 67.5 | 75% |
| race | 4 x 16 | 11.3% | 4.4 / 8.4 | 310 | 2,117 | 19.4 | 29.2 / 67.5 | 9% |
| combat | 4 x 16 | 24.1% | 14.9 / 42.9 | 724 | 11,508 | 45.1 | 28.8 / 72.5 | 5% |
| free | 8 x 16 | 23.5% | 4.3 / 6.7 | 186 | 6,260 | 10.8 | 29.2 / 67.5 | 74% |
| combat | 8 x 16 | 49.9% | 38.6 / 58.0 | 661 | 22,382 | 41.2 | **23.2 / 102.5** | 23% |
| free | 16 x 8 | 20.4% | 3.7 / 5.9 | 41 | 3,924 | 4.8 | 29.6 / 67.5 | 77% |
| combat | 16 x 8 | 39.7% | 26.2 / 52.5 | 162 | 12,321 | 19.9 | **25.0 / 102.5** | 17% |

Resident size rose from 95 MB (one room of 8) to 176 MB (sixteen rooms
of 8 in combat) on this machine's Node 22; the VM measured 70 MB by `ps`
and 34 MB by its cgroup for 32 pilots flying, so these are an upper side.

**Thinning against main** (the same run, one room of 16 in free flight,
30 s, twice each, main's `edge/rooms/node.js` against this one): each
pilot received **23.7 kB/s before and 8.9 kB/s after, 62% less**, at a
CPU of 4.5% before and 5.0 to 5.2% after (the distances and the per recipient
bookkeeping; the messages are as many, one batch a tick). Near peers:
29.5 Hz before, 29.0 to 29.3 after, the same 67.5 ms p99 gap. With the
room all within a few hundred metres it saves 22% (some pairs are still
past 300 m once height is counted) and the rest is sent as before.

**What limits the VM.** Combat, by far: every streamer frame is relayed
to every other pilot at 10 Hz, so a combat room's messages grow with the
square of its pilots (10,883 a second for 32), and its loop delay with
them. Near peers first arrived late (under 29 Hz, a p99 gap past two
ticks) at a loop p99 averaging 26 to 39 ms; at 15 ms they did not. That
is the valve's 20 ms. To carry this to the VM: the four rooms of eight of
`rooms-soak.js` that the VM ran at 10% of its core ran here at 7%, and
`combat:harness`, 113 ms of CPU a second on the VM, ran here at 122 to
136 ms, so the VM is about 0.9 to 1.4 times this loaded machine's CPU
time, and Caddy's TLS adds about 0.6 of the rooms' own (6% beside 10% on
the VM). Taking the heavier 1.4 and Caddy's 0.6, the core costs about
2.2 times the CPU column: a combat room of 16 about 22% of the VM's core,
one of 32 about 56%, and a free flight room of 16 about 13%. So with
headroom (the valve at about 80%) the VM carries roughly **three busy
combat rooms of 16, or eight to ten free flight rooms of 16**, and not
two combat rooms of 32. These are estimates from this machine until the
live run below is made (`deploy/vm/README.md`).

**Egress.** A free flight room of 16 sends about 190 kB/s of payload, a
race 310, a combat round 720 (plus about 76 bytes of headers a message).
One combat room of 16 held all month is about 2.4 TB; Oracle's Always
Free allowance is published as 10 TB a month (to confirm on the account).
The counters' `day.outBytes` is the number to watch.

**Next, if combat rooms crowd the VM:** thin the streamer relay as the
poses are (a far pilot's paper at 2 Hz, or none past 300 m), or send the
streamers in the tick's batch; either cuts the messages that make combat
the limit.

Total: **22 to 31 agent days**, in that order, each phase ending with the
owner flying it.

## 13. Risks

- **A hit that lands late can feel unfair,** even when both screens agree.
  100 to 200 ms after contact the aircraft breaks a few metres past where
  the pilot saw the other one. Near peer extrapolation hides most of it;
  the crash cam showing the true moment hides the rest. If it still feels
  wrong, the fix is in presentation, not in the rule.
- **The centre of mass surface velocity** matches two body physics along
  the normal only. A glancing wingtip strike puts spin in, which each
  plant computes against an infinitely heavy surface. Measured in
  `midair:plant`; the fallback is an additive two body contact call.
- **Workers' `Date.now()` does not advance during one event.** That is
  fine for stamping, and it means the room cannot time a tick by spinning;
  the tick is an alarm or a `setTimeout` that only runs while someone
  flies.
- **The 1,000 message a second soft limit** is per object. A cap raised
  past about 30 at 30 Hz meets it.
- **On the VM, combat is the limit** (section 12, Phase 6 as built): its
  streamer relay grows with the square of a room's pilots, and three busy
  combat rooms of 16 are about what one core carries with headroom. The
  valve refuses new public rooms before the rooms flying degrade.
- **The Free plan fails closed** when a day's requests run out. A launch
  is on Paid.
- **Children and real crashes.** The owner chose jelly pylons so that a
  child never loses a run to a cone, and chose real mid air crashes. The
  two can sit together (a cone is scenery, another pilot is a player),
  and section 14 asks.
- **Moderation is never finished.** Picker names in public rooms close
  the biggest door; reports and removals cover what is left. A report
  queue a human reads does not exist, by design (nothing is stored).

## 14. Open questions for the owner

1. **Can a room turn crashes off?** A "friendly" room, for young
   children, where peers pass through each other as ghosts. One flag in
   the room, costs nothing to build; it is a product call.
2. **Races in public rooms?** This design races only in private rooms (a
   host starts them). A public room could race a map's own hoops on a
   vote.
3. **The name filter's source list.** An open list such as LDNOOBW is
   CC BY 4.0, which the FSF lists as compatible with GPLv3 (to confirm before shipping it); a hand made
   list in both languages is the alternative. And may a private room use
   typed names, or picker only everywhere?
4. **Keeping an address in memory for a 30 minute removal.** Cloudflare
   sees addresses regardless; the room would hold one in memory for a
   kick's duration and write it nowhere. Acceptable, or removals keyed on
   the seat token only (which a reload escapes)?
5. **Cloudflare account and plan.** Phase 0 runs on the Free plan on
   `workers.dev`; a public launch needs Paid ($5 a month plus usage).
6. **Room cap.** 16 public, 8 private by default. More is Phase 6.
7. **Should board tracks keep a live room of their own,** as the current
   Live row does, or do track races move into private rooms only?

## Sources

- [CF-PRICE] Cloudflare, Durable Objects pricing,
  https://developers.cloudflare.com/durable-objects/platform/pricing/
  (page updated 2026-08-25, read 2026-09-27): request and duration
  allowances and rates, the 20 to 1 WebSocket message ratio, free
  outgoing messages, 128 MB duration basis, SQLite only on Free, the
  hibernation example.
- [CF-WORKERS] Cloudflare, Workers pricing,
  https://developers.cloudflare.com/workers/platform/pricing/ (updated
  2026-08-28, read 2026-09-27): the $5 minimum, Durable Objects included,
  no egress or bandwidth charge.
- [CF-WS] Cloudflare, Durable Objects WebSockets best practices,
  https://developers.cloudflare.com/durable-objects/best-practices/websockets/
  (updated 2026-06-19, read 2026-09-27): the hibernation API, in memory
  state reset on hibernation, the 16,384 byte attachment limit.
- [CF-LIMITS] Cloudflare, Durable Objects limits,
  https://developers.cloudflare.com/durable-objects/platform/limits/
  (updated 2026-06-01, read 2026-09-27): 1,000 requests a second soft
  limit per object, 32 MiB message size, 1 GB per object on Free.
