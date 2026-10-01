# Defend Itaipu: the war mode, the plan and the contract

Written 2026-09-29. The contract for a co-op game mode in a private room:
the pilots of a room defend the Itaipu dam (docs/ITAIPU-PLAN.md) against
waves of attack drones flown by the room. Itaipu is mission 1 of a
campaign; the mode is built so a second map is a second mission file, not
a second mode.

Several parts are built in parallel worktrees against this file, so this
file is the thing that must not drift. A part that finds it wrong says so
in its pull request rather than working around it.

## 0. The owner's decisions, final

In conversation on 2026-09-29, in order:

1. **Battle, not inspection.** "this needs to be a battle oriented thing
   ... how would you fit this into modern warfare?"
2. **Defend only, in a team.** Players never attack; the room's AI does.
3. **Not child friendly, and that is fine.** It is the first mature
   content in the game, so it is gated (section 9).
4. **Multiplayer is a must, and every aircraft is available**, not only
   quadcopters.
5. **Kamikaze only.** Every defender carries a warhead and kills by
   detonating on an attacker. No guns, no dropped charges.
6. **Hunter drones that chase the defenders are in v1.**
7. **A cinematic intro**: it is 2030, this is the world stage, and we
   must defend critical infrastructure with our collection of RC
   airplanes and drones, modified for the modern battleground. **Call of
   Duty feel, generated narration.**
8. **"just go"**: build it without waiting for a review of this split.
9. **No signal, no jamming, for now** (2026-09-29, after flying the war
   for the first time): "eliminate the jamming and all of that, that's
   too complex right now". The war flies on the pilot's own link, exactly
   as outside one; no jammer waves. See the note at 6.1 for what was left
   dormant.

Where this file and the owner differ, the owner wins.

## 1. The brief, checked against the tree

Checked on `main` at da4b5eb3 by three surveys on 2026-09-29. What was
wrong in the conversation's first sketch, and what changed because of it:

| Claim in the sketch | Holds? | So |
| --- | --- | --- |
| Betaflight's failsafe can be triggered on link loss | **No.** `flight/failsafe.c`, `rx/rx.c` and `fc/core.c` are not in `BF_SRC` (`scripts/build-wasm.sh:88-116`); `failsafeIsActive()` is stubbed false and `rxIsReceivingSignal()` true (`src/native/bf/bf_stubs.c:52,81`); every `failsafe_` setting is filtered (`bf_settings.c:460`). A quad that loses packets holds its last sticks forever (`sim.c:2621-2629`). | CLAUDE.md: a missing Betaflight behaviour is fixed by compiling more Betaflight. Package D2 compiles it (section 6.4). |
| Fixed wings fail over like quads | **No.** Ids 2 to 23 never run Betaflight; sticks go to `plant_wing_step` (`sim.c:2631,2670`, `sim_abi.h:376-378`). | Planes get a documented shell failsafe (section 6.4), since there is no flight controller to port for them. |
| The intakes and the switchyard are targets | **Not built.** `dam.json` has 20 intake points, but `dam/index.js` never reads them; `osm/power.json` lists 6 substations and nothing in `src/` draws them. Spillway gates are built but their collider ids are thrown away (`dam/index.js:1004-1010`). | Package M builds them with ids (section 8). |
| Planes take off from the crest road | **No.** Package H of the Itaipu plan never started: every land craft spawns at the Mirante (`src/maps/itaipu.js:69`). | Package M adds the runway spawn. |
| A room can send AI aircraft to clients | **No.** BATCH entries are seats, and a client drops a seat it has no peer for (`main.js:2004-2011`). | New binary type and a new peer kind (section 5). |
| The room can steer hunters | **Blind.** Nothing under `edge/` imports a map. | A coarse heightfield ships to the server (section 4.4). |
| A hit always breaks the craft | **Only with damage mode on.** With it off `applyHit` returns SIM_ERR_BAD_STATE (`midair.js:758-760`). | A war game forces damage on for its duration (section 6.3). |
| Rooms hold 16 | **Private rooms hold 8** (`PRIVATE_CAP`, `edge/rooms/core.js:74`); `SLOT_RIGHT_M` has 8 slots (`src/game/slots.js:36`). | A war room is a squad of up to 8. |
| Combat and tag are private only | **Not in code.** A public room's host can start either (`core.js:383-388`), whatever COMBAT-PLAN and TAG-PLAN say. | War is refused in a public room by code, not by a doc (section 9). |
| The streamer can be a fibre optic cable | **Partly.** Fixed length, tension, splitting: yes. Collision with trees and towers: no, only the ground (`streamer.js` `groundContact`). | Fibre is phase 2 (section 11). |
| The hangar is full size aircraft | **No, every one is an RC model** (the F-16 is Freewing's 70 mm EDF, the P-51 is FMS's 2.35 kg). | The war is fought at drone scale, which is what modern drone war is. Attacker speeds are set against the hangar's (section 3). |
| `wing1000` exists | **Retired**, mapped to the Bramor (`airframes.js:1431-1436`). | The roster in section 2 is the live one. |
| There is already a combat mode | **Yes**, the toilet paper game (`combat`). | This mode's game id is `war`, never `combat`. |

## 2. The hangar goes to war: roles

Every aircraft flies. Speeds are level flight at full throttle from
`configs/airframes.js`; the role follows from the speed, as in the real
war (fast interceptors for strike drones, slow trainers for scouts,
fixed wings as radio relays).

| Aircraft | Top m/s | Role |
| --- | --- | --- |
| F-16 (f16878) | 45.8 | the only thing that runs down a Striker from behind |
| 5 inch quad | 40 | interceptor: dives from altitude, point defence of the intakes |
| Whoop 65 | 40 (five inch model) | close defence where only a whoop fits: gantries, under the switchyard wires, between penstocks |
| Zagi | 29.7 | mid screen against Loiterers |
| Bramor, Skyhunter, Radian | 25, 23.5, 21.9 | **relays** (section 6.2) and long patrol |
| Timber, Ugly Stik, P-51, Tiger Moth, Kadet, Cub | 18 to 24 | cut off intercepts, scouts, sea drones |
| Timber and Cub on floats | 22.4, 16.9 | reservoir patrol, relaunch from the water |
| Slow Stick, Bombshell | 8.4, 10.1 | sea drones and circling scouts only: a tripwire, not a chaser |
| NRJ glider | 41 thrown, no motor | one shot: thrown into a head-on pass |

A slow aircraft can still kill a fast one head on: the bubble (section
4.3) is judged on the closest approach, not on catching up.

## 3. The threats

Class names are generic on purpose: the enemy is never named, and neither
are its weapons. All speeds are metres per second, chosen against section 2,
then slowed to 0.7 of that on the owner's word on 2026-09-29 ("make all
enemy drones 30% slower"): turn radii, circles and weaves keep their
shape (src/share/war/routes.js KIND, edge/rooms/warhunt.js).

| Kind | id | Speed | Flies | Wants | Kill |
| --- | --- | --- | --- | --- | --- |
| Scout | `scout` | 10.5 | circles at 250 m over a point for 90 s, then leaves | nothing: while it lives, the next wave's routes are exact (section 4.2) | any bubble |
| Loiterer | `loiter` | 19.6 cruise, 28 dive | high approach, circles, dives on its target | an intake or a gate | any bubble |
| Striker | `strike` | 26.6 | low, 30 m over water or 60 m over ground, straight | the switchyard or an intake | any bubble |
| Swarm FPV | `fpv` | 21 | groups of 4 to 8 up the gorge, weaving | an intake or a penstock | any bubble |
| Hunter FPV | `hunter` | 25.2 | steered by the room at the nearest defender (section 4.4) | a defender | any bubble; it also kills the defender it reaches |
| Sea drone | `boat` | 9.8 | on the reservoir surface at 219.0 m, weaving | the upstream face at an intake | any bubble |
| Jammer | `jammer` | 3.5 on water, 0 ashore | parks and jams | blinds the defenders (section 6.1) | any bubble; killing it lifts its jamming |

Attackers carry no colliders: the static set is at 11 775 of 15 000
(commit 07280efc). They are poses, a bubble, and a model.

## 4. The room: `edge/rooms/war.js`

The room's half of the game, beside `tag.js` and `combat.js`, built the
way docs/TAG-PLAN.md and docs/COMBAT-PLAN.md built theirs: a module the
core calls, returning the core's actions, owning nothing it cannot store.

### 4.1 Wiring

- `RoomCore` constructs `this.war = new RoomWar(meta)` and calls it at the
  same points as tag and combat: `hello` (welcome view), text `message`
  (`{type:'war'}`), `pose()` after the referee, `tick()`, `kick`/`close`
  (`leave`), `restore`. The store key is `war`.
- `games()` gains `war`, so "one game at a time" (TAG-PLAN decision 10)
  holds without new code. `ROOM_GAMES` and `ROOM_MODES` in
  `src/share/roomwire.js` gain `'war'`.
- `waiting()` is true while a war game is on, because attackers move
  when nobody sends a pose, and the tick stops otherwise (`core.js:347-349,786`).
- Host only: `{type:'war', op:'start', mission}` and `{type:'war', op:'end'}`.
  `hostCheck` refuses `start` in a public room with `'private'` (section 9).
- `safety.remove()` does not call the modes' `leave` today (`safety.js:243-256`).
  War needs it called; the fix is a line in `safety.js`, and it fixes
  combat's and tag's `leave` on the same path.

### 4.2 Waves are data, and deterministic

A mission is a plain module, `src/share/war/missions/<id>.js`, shared by
room and client:

```js
export default {
  id: 'itaipu-1', map: 'itaipu',
  targets: { 'intake-0': { mw: 700, at: [x, y, z], r: 12 }, ..., 'yard-right': { mw: 2800, ... } },
  floorMw: 7000,                    // lose when output falls below
  rack: 3,                          // airframes per seat
  waves: [
    { at: 20, kind: 'scout', n: 1, route: 'reservoir-orbit' },
    { at: 60, kind: 'strike', n: 3, route: 'reservoir-low', target: 'yard-right', spread: 40 },
    ...
  ],
  routes: { 'reservoir-low': [[x, y, z], ...], ... },
};
```

`src/share/war/routes.js` turns a scripted attacker (kind, route, spawn
time, index in its group, the room's seed) into a pose at any room
millisecond. It is pure: plain arrays, no three.js, runs in Node. Room and
client call the same function, so **a scripted attacker's pose is never
sent**: the room sends only its birth and its death (5.1), and every
client draws the same path. This is what keeps 60 attackers cheap on the
wire and on a one core VM.

While a Scout lives, later waves fly their routes exactly; once every
Scout of a wave is dead, later waves get a seeded lateral error of up to
`spread` metres. Killing scouts makes the defence easier; that is the
Scout's whole job.

**Power lines are a hazard to the attackers too** (the owner,
2026-10-01: "make the enemy drones hit them sometimes"). At a scripted
attacker's birth the room finds where its planned path crosses a span of
the map's lines within 3 m of a wire's height
(`src/share/war/wires.js`, on the chords `scripts/war-targets.js` writes
into `src/share/war/itaipu-wires.js` from the built map), and draws from
its seed, for each crossing in turn, whether it strikes (0.1 a crossing).
The first that does goes into the birth record as `wire`, the room ms;
`routes.js` ends the flight there (`end: 'wire'`), so every client flies
it to the same point, and the room's death there is `why: 'wire'`, by
nobody, taking no output. The routes are not moved off the lines: most
crossings are the runs into the right bank switchyard, where every line
of the dam converges. `npm run war:routes` prints the crossings and the
strikes a game they make (0.3 to 1.5 in missions 1 and 4 from one pilot
to eight, 0.5 to 2.3 in mission 2, 1.9 to 9.3 in mission 3); the HUD
calls each one ("STRIKER DOWN ON THE LINES").

### 4.3 Detonation: the kamikaze referee

A defender's warhead goes off when any part box of the defender comes
within `BLAST_M = 6` of an attacker's centre: `within()` in
`src/game/midair.js:520-567`, the same test tag's bubble uses at
`BUBBLE_M = 6`. The attacker is a Track of the room's own samples (no
lag on its side); the defender's is the relayed stream, judged on tag's
single timeline (`tag.js:13-22`): the frontier is `LATE_MS` behind the
room clock or the slowest seat heard from in `WAIT_MS`, the earliest
detonation wins, a tie to the lower seat.

- A detonation kills the attacker and the defender, and every other
  attacker within `BLAST_M` of the point (a swarm dies together).
- Spawning and crashed defenders cannot detonate (`FLAG_SPAWNING`,
  `FLAG_CRASHED`), as in tag.
- A Hunter that reaches `BLAST_M` of a defender detonates both, judged the
  same way with the roles swapped.
- The harness holds tag's bands: no false detonation past r plus 5 cm, no
  miss 15 cm inside, the same answer as the zero latency run.

### 4.4 Hunters

Hunters are the one kind whose path depends on players, so the room
steers them and sends their poses (5.1).

- Pure pursuit with lead on the target defender's last relayed velocity,
  turn rate capped at 1.75 rad/s, speed 25.2 (0.7 of the first 2.5 and
  36, section 3), at 30 Hz on the room tick.
- Target: the nearest live defender within 1 500 m; re-chosen when it
  dies or every 5 s.
- Terrain: a coarse heightfield, `src/share/war/itaipu-height.bin`, 40 m
  cells over the hero square (256 x 256 Uint16, 128 KB), built from the
  hero tiles by `tools/itaipu/build_war_height.py`. A hunter holds at
  least 25 m over the higher of ground and water. The room loads it once
  per process.
- Budget: a hunter is a few hundred flops a tick. The measured cost to
  beat is combat's referee, 25 ms of CPU a second at 16 seats
  (COMBAT-PLAN.md:219-222). A war room at 8 seats and 60 attackers is
  480 pairs; the harness reports its CPU, and it must stay under 60 ms a
  second on this machine (so under about 15 % of the VM's one core at the
  measured 2.2 times).

### 4.5 Output, rounds, airframes, winning

The owner's rules of 2026-09-29, as `edge/rooms/war.js` plays them:

- **Output** starts at 14 000 MW (20 units of 700). An attacker that
  reaches its target alive subtracts that target's `mw` once; a target
  already down takes nothing more. The mission's `targets` table is the
  only place a number lives.
- **Rounds.** A mission is rounds of waves (a wave's `round`; its `at`
  counts from its round's start). Mission 1 has 5.
- **Airframes, per pilot.** At each round's start every pilot has the
  mission's `airframes` (4). Every detonation, crash or lost link spends
  one of that pilot's; every attacker its warhead kills earns it one more
  for the round (a swarm of N, N). Earned ones go with the round: the
  next starts at 4 again. A pilot who has spent all it has spectates, and
  cannot go off, until the round ends.
- **A round ends** the instant either
  - every wave of it is born and no attacker of it is left but Scouts:
    **win** if the dam lost nothing in it, **damaged** if it did; or
  - no pilot here is still flying: **lost**, and every attacker of it
    still alive with a target gets through at once. A pilot is not
    flying when it has spent everything, or when on its last airframe
    it has been silent for `STALE_MS` (2 s: a menu, a pause, a dropped
    link), sat on the ground for `GROUND_MS` (3 s) after taking off, or
    not taken off again `RESPAWN_MS` (10 s) after its last loss. A pilot
    who left is not here at all, so a round never waits on anyone.
  
  What is left (Scouts; on a loss, Hunters) is cleared. `RESULT_MS`
  (6 s) of result follows, then the next round starts by itself.
- **Win** when the last round ends with output at or above `floorMw`
  (7 700 for mission 1). **Lose** only the instant output falls below
  it. An empty rack never loses on its own.
- **The view** carries `round`, `rounds`, `roundState` (`live` or
  `result`), `roundResult` (`win`, `damaged` or `lost`), `roundMw`,
  `nextRoundAt`, `airframes`, `spent` and `earned` (by seat), and
  `rack` and `rackMax`: the match's airframes left and had this round,
  earned ones included.
- **Score** per pilot: kills, assists (within 50 m of a kill in the 3 s
  before it), and megawatts saved (the `mw` of each killed attacker's
  target). The team's number is the output at the end.
- The match is stored on every change of state, as tag stores its crown.

## 5. The wire and the client

### 5.1 Wire

`war` takes **0xA0 to 0xAF** (the first free range, COORD.md) and JSON
type `war`. In `src/share/roomwire.js`, in a block marked `war`:

- `0xA0 AGENTS` (room to client, binary): room ms (u32), then per hunter:
  id (u16), kind (u8), position (3 x f32), attitude (4 x i16), 30 Hz,
  thinned by the interest bands of `core.js:126-130`.
- JSON `{type:'war', war}`: the view (state, wave, output, rack, scores),
  sent on every change and in each welcome.
- JSON `{type:'war', op:'born', agents:[{id, kind, route, t0, k}]}` and
  `{type:'war', op:'dead', ids, at, by, p}`: births and deaths of
  scripted attackers.
- JSON `{type:'war', op:'boom', seat, at, p}`: a defender detonated. The
  seat it names applies it to its own craft (6.3); everybody draws it.

### 5.2 Client

- `src/share/roomwar.js`: the client's half, as `roomtag.js` is tag's:
  the view, births and deaths, hunter tracks, and pose-at-time for every
  attacker by routes.js.
- `src/render/attackers.js`: one `InstancedMesh` per kind, so 60
  attackers are 7 draw calls, not 60 (budget: 300 calls a view,
  ITAIPU-PLAN section 13). Deaths burst through `debris.emit` with
  `surface = -1`, `kind = 'break'` (`src/render/debris.js:270`).
- `src/ui/warhud.js`: output in MW, the wave, the rack, the pilot's
  kills, the signal bar, and callouts as text under the voice.
- `src/main.js` wiring is the lead's, not a package's.

## 6. The defender's aircraft

### 6.1 Signal

> **Out of the war since 2026-09-29 (decision 9).** The war no longer
> judges a signal: no snow from it, no degraded or lost link, no
> Betaflight failsafe or planes' rule from it, no `lost` airframe sent to
> the room, no LINK bar on the HUD, no signal, relay or jammer radio
> lines, and mission 1 spawns no jammer. Left in place, dormant and still
> tested: `src/game/signal.js`, `RcLink.setSignal`, `fpvFail.signal`, the
> Betaflight failsafe and `sim_rx_signal` (#201, 6.4), the generic `jammer` kind
> in `src/share/war/routes.js`, the room's `lost` op (harmless if
> sent), and the voice files. What follows is the design as it was, for
> when it comes back.

`src/game/signal.js`, pure and deterministic, called once per rendered
frame for the local craft:

- **Ground station**: the pilot's standing point, `stationFor(sp, slot)`
  (`slots.js:55-59`), at 1.5 m.
- **Line of sight**: sample the segment station to craft every 20 m on
  `terrain.finestAt(x, z)` (`src/maps/yellowstone/terrain/engine.js:731-754`),
  never `terrain.height`, whose answer depends on the camera's LOD. Blocked
  when terrain stands above the line less 2 m.
- **Range**: quality 1 to 1 500 m, falling linearly to 0 at 4 000 m.
- **Jammers**: each live jammer multiplies quality by `min(1, d / 600)`.
- **Relays**: any live teammate on the relay list (Bramor, Skyhunter,
  Radian) at least 150 m over ground is a second station; quality is the
  best of direct and station to relay to craft (each leg judged as
  above, the product of the two).
- Quality below 0.5 drives `fpvfail` snow; below 0.25 the link degrades
  through `src/input/link.js` (delay 120 ms, loss rising to 90 %); at 0
  for 0.5 s the link is lost (6.4).

### 6.2 The video

`src/render/fpvfail.js` already draws snow, rolling bands and sync tears
for a lost antenna (`:132-165`). It renders only with damage mode on
(`main.js:6595`); signal drives it through `fpvFail.set` in a war game
regardless. No new shader.

### 6.3 The warhead

A war game forces crash damage on for its duration and restores the
pilot's setting after. On `boom` for its own seat, the client breaks
every part (`sim_part_break` over the hull's parts, `sim_abi.h:1178`),
emits a burst, and goes through the normal wreck and respawn path, which
takes a rack slot. The warhead has no mass in v1: the hangar's aircraft
fly as they do today.

### 6.4 Failsafe

- **Quads (D2)**: compile Betaflight's failsafe: `flight/failsafe.c` and
  what it needs from `rx/rx.c` and `fc/core.c`, as patches under
  `patches/`, with a new export `sim_rx_signal(bool)` in `sim_abi.h`.
  Stage 1 then stage 2 as the pilot's Betaflight settings say; the
  failsafe tab in `src/fc/catalog.js:99,358` becomes live. **Flight
  without link loss must be bit identical to today**: the state trace
  check proves it.
- **Planes**: no flight controller runs them, so the shell does it,
  written as a rule and nowhere else: on link loss the wing goes to
  Stabilised (`sim_wing_set_stab`) with the throttle cut, and glides.
  The Bramor opens its parachute (`sim_wing_chute`).
- A lost link for 3 s with no recovery is a lost airframe: it takes a
  rack slot.

## 7. The intro, the voice and the sound

### 7.1 "2030"

About 75 s, rendered in engine on the map with the real models, the same
route system flying the attackers, the output counter, and fpvfail's
static. Skippable by any key; plays the first time a pilot enters the
mode and on demand from the war menu; in a room it plays over the start
countdown for everyone.

| # | Shot | Voice (English; Spanish in the strings) |
| --- | --- | --- |
| 1 | Black. Dawn over the reservoir, slow push toward the crest. Title card "2030". | "Twenty thirty." |
| 2 | Low over the water, a shadow crosses; one Striker, then ten. | "Wars aren't won with jets anymore. They're won with swarms. Cheap. Fast. Endless." |
| 3 | Along the crest, the intakes and penstocks; the counter reads 14 000 MW. | "Every country's lights hang on a few structures. Ours hang on this one." |
| 4 | A shed on the crest road: bench, packs, a P-51, a Cub, a rack of quads, a warhead under every belly. | "The interceptors ran out in the first week. What we have left... is you." |
| 5 | Cuts: quad props spin up, a Skyhunter thrown, a float plane taxis, the F-16 spools. | "Every aircraft in your hangar carries a warhead now. One flight. One kill. Make it count." |
| 6 | FPV: static breaks the feed in the gorge, then clears. | "Lose your signal, you lose your bird. Stay high. Stay in line of sight." |
| 7 | Wide: the first wave on the horizon, defenders rising from both banks. "DEFEND ITAIPU / Mission 1". | "Contacts north, over the water. All pilots... get up there." |

The same voice is the mission's radio: wave calls ("Strikers, low, over
the reservoir"), losses ("Intake seven is hit. We're down seven hundred
megawatts"), signal ("Relay's down over the gorge").

Rules for every line: the enemy is never named; the defenders are the
pilots of both banks; no real figure is spoken until a source for it is
in this file.

### 7.2 Generated narration and music

- The voice model is chosen for its licence first: the audio ships in a
  GPLv3 repository, so the model's weights licence and its terms on
  generated output must allow it. A local model on this machine's GPUs is
  preferred, so a changed line is regenerated, not re-recorded.
  Candidates to check, not choices: Kokoro 82M, Piper voices (each voice
  has its own licence).
- Every line is generated in English and Spanish from one script file,
  `assets/audio/war/lines.json`, by `tools/voice/`. The script is the
  source; the audio is built output, published like the map data if it
  is large.
- A radio filter (band pass, light distortion, static bed) is applied at
  build time.
- Music: CC0 or CC BY with attribution in the credits, or generated
  under a licence that allows it. Every file's source and licence is
  listed in `assets/audio/war/CREDITS.md`.

## 8. The map's part: targets and spawns

Package M, in `src/maps/itaipu/**` and `tools/itaipu/**`:

- **Intakes**: build the 20 from `dam.json` `intakes.points`
  ((-202.2, -1794.2) to (430.8, -1655.0), west to east): gate frames on
  the upstream face, 8.2 m wide, sill 177.6, servomotor houses on the
  crest at 225. Ids `intake-0` to `intake-19`.
- **Spillway gates**: keep the ids the build throws away; `gate-0` to
  `gate-13`, west to east.
- **Right bank switchyard**, OSM w32302779, centroid (-2128, -434), 48
  ha: a fenced yard with gantries and transformer rows. Id `yard-right`.
- **Targets API**: `map.targets` is `{ id: { at: [x, y, z], r, part } }`
  for every id above plus `penstock-0` to `penstock-19`, read by the
  mission file and by the renderer's damage smoke. The structure never
  breaks: a hit target smokes and burns.
- **Runway spawn** for planes on the left bank rockfill crest road:
  (975, -1487), yaw -2.313 (ITAIPU-PLAN section 10), and the hand launch
  spawn for aircraft with no gear at the same place. Room slots lay out
  along the road.
- Budgets hold: static solids stay under 15 000; draw calls under 300.

## 9. Mature content: the gate

The multiplayer design assumes children in public rooms
(MULTIPLAYER-PLAN.md:8,23-25, section 9). This mode is not for them, so:

- `war` starts only in a **private** room: `hostCheck` refuses it in a
  public one, by code. Quick join never lands in a war game.
- A title card shows it, because the owner asked for one on 2026-09-29;
  no public room listing does. The card, Make a room's Game row and the
  host's game menu all reach it only in a private room on the Itaipu map,
  and only after the consent screen below.
- Everything else in section 9 of the multiplayer plan still holds in a
  war room: no free text, picker names, report and kick.
- The first time a pilot opens it, one screen says what it is (simulated
  drone war, no people shown harmed) and asks to continue.
- No people are shown harmed, ever: aircraft break, structures burn.

Opening it wider is the owner's decision, later, and a one line change.

## 10. Work packages

Each package is one worktree, one branch, one pull request, and owns only
the files named. A file not named is not touched; a package that needs a
change in another's file asks for it in its PR. `package.json` is shared:
each package adds its own `scripts` lines and nothing else there. The
lead resolves adjacent line conflicts at merge and does all of
`src/main.js`.

Every package: branch from `origin/main`, merge `origin/main` again before
the PR, run the checks CI runs (.github/workflows/checks.yml) and report
their real output. Headless browser checks run under
`systemd-run --user --scope -p MemoryMax=8G`, and remove their Chrome
profiles from /tmp.

**Phase 1, now, in parallel:**

| Pkg | Owns | Delivers | Checks |
| --- | --- | --- | --- |
| **A** room | `edge/rooms/war.js`, the `war` block of `src/share/roomwire.js`, `src/share/war/**` except the heightfield, a dispatch line or two in `core.js`, the `leave` line in `safety.js`, `scripts/war-harness.js`, a `war` section in `scripts/rooms-selftest*.js` | 4.1 to 4.5 (hunter steering behind the interface 4.4 names, a straight line placeholder until B), 5.1, the mission file with placeholder targets | `rooms:selftest`, `war:harness` (bands of 4.3, CPU of 4.4), `rooms:load --quick` |
| **B** hunters | `edge/rooms/warhunt.js`, `tools/itaipu/build_war_height.py`, `src/share/war/itaipu-height.bin` | 4.4: steering, targeting, terrain floor; `step(ms, seats) -> poses` | its own selftest in `war:harness`'s style; CPU reported |
| **D** signal | `src/game/signal.js`, `src/input/link.js` (a runtime loss field), `src/render/fpvfail.js` (render without damage mode), `scripts/signal-check.js` | 6.1, 6.2, the plane failsafe rule of 6.4 as a function main.js calls | `signal:check`: LOS over the gorge, relay, jammer, determinism across two runs |
| **D2** failsafe | `patches/`, `scripts/build-wasm.sh`, `src/native/bf/**`, `src/native/sim_abi.h` (one export), `src/fc/catalog.js` | 6.4 for quads | `npm run verify` (it is physics), plus a trace showing stage 1 then stage 2 on a cut link |
| **M** map | `src/maps/itaipu/**`, `tools/itaipu/**`, `src/maps/itaipu.js` | section 8 | `itaipu:check`, `check:dam`, `town:check`, and shots of each target |
| **V** voice | `tools/voice/**`, `assets/audio/war/**` | 7.2: the model chosen with its licence quoted, every line of 7.1 in both languages, the radio filter, music with credits | a licence table in the PR; every file listed in CREDITS.md |

**Phase 2, after A merges:**

| Pkg | Owns | Delivers |
| --- | --- | --- |
| **C** client | `src/share/roomwar.js`, `src/render/attackers.js`, attacker models, `src/ui/warhud.js`, strings | 5.2; the two page check `war:twopage` |
| **E** intro | `src/render/warintro.js`, camera paths | 7.1 |
| **G** mission 1 | `src/share/war/missions/itaipu-1.js` | the real waves, routes and numbers, tuned by flying |

**Phase 3**: fibre optic quads (the streamer with snagging on
`nearestTrees`/`nearestSolids`, `crashworld.js:372,399`, tension
tearing); the war mode on a second map.

## 10a. Act 1: Defend the Paraná (#251)

The campaign's first act, four missions on Itaipu
(`src/share/war/missions/`). All four use the rules of 4.5 (rounds, 4
airframes a pilot plus one a kill, lost only on output):

| id | title (string key) | targets | floor | starMw |
| --- | --- | --- | --- | --- |
| itaipu-1 | Defend the intakes | intakes, penstocks, gates, the yard | 7 700 | 11 200 |
| itaipu-2 | Save the spillway gates | the 14 gates (350 MW each) | 11 200 | 11 900 |
| itaipu-3 | Switchyard blackout | the yard, with decoys; intakes and penstocks too | 9 700 | 12 600 |
| itaipu-4 | Night raid | itaipu-1's, at night (`night: true`) | 7 700 | 11 200 |

- **Decoys**: the kind `decoy` (appended to KINDS, byte 7) flies and
  looks like a Striker: model, paint, nav lights, and a marker that
  says STRIKER until 300 m. It is worth nothing where it arrives, and a
  kill of one saves nothing.
- **Night**: a night mission's world is built at night and its
  attackers wear nav lights (`src/main.js` warNightFrame). Its
  countdown is `prepMs` longer (15 s for itaipu-4), so every screen has
  rebuilt before the go.
- **Result** (`edge/rooms/war.js` resultOf, the room's): when the
  mission ends, `view.result` is `{ won, stars, credits, criteria }`.
  The criteria are *held* (every round a win), *noLosses* (in every
  round no pilot spent more airframes than it earned) and *output*
  (the output at the end at least `starMw`). Stars are the criteria
  met on a won mission, and 0 on a loss. Credits are 100 a star plus 10
  a kill of the team's.
- **Loadouts** (`parseLoadout`): `{type:'war', op:'loadout', loadout:
  {rack, warhead, speedMul}}`, from any pilot any time but a live war
  (and the host's inside `start`), echoed in `view.loadouts`.
  - `rack` 4 to 6 (rounded, clamped), in place of the base 4
  - `speedMul` 1 to 1.15 (clamped), flown by the client with the
    plant's boost
  - `warhead`: `standard` (6 m); `wide` (9 m); `penetrator` (its first
    hit of an airframe takes that one attacker and the flight goes on);
    or `emp` (goes off as standard, and stalls every attacker within
    30 m for 4 s: `op:'stall'`, the routes' clock stopped, a Hunter
    held)
  - anything else is refused `loadout`
- **Briefings**: two lines a mission over its countdown and a debrief
  at its end, win or lose (`assets/audio/war/lines.json`, group
  `mission`, English and Spanish).

## 11. What is not in v1

Guns and dropped charges (decision 5). Fibre optic quads (phase 3).
Weather. Attackers with physics (they are routes and steering, not
plants). The structure breaking. Warhead mass. Public rooms.

## 12. Done

v1 is done when, in a private room of two pilots on the Itaipu map, on
the live site: the intro plays; mission 1 runs start to finish on both
screens with the same output, rack and kills; a detonation breaks the
defender and the attacker on both screens; a hunter kills a defender;
flying down the gorge from the Mirante breaks the video and a relay
restores it; a quad on a cut link enters Betaflight failsafe; and the
owner has flown it and said so.
