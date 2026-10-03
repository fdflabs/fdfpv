# Defend the Paraná, Act 1: what the engine needs

Written 2026-10-02 for the agent building the mission engine and the
intro sequencer in parallel. Every design in MISSIONS.md and INTROS.md
cites a row here (T1.x mission engine, T2.x sequencer, T3.x audio, T4.x
HUD). Each row says what exists today, read on `origin/main` at
51dd7684, and what has to be built. **Verify each "today" claim before
building on it**; this was written from a read of the tree, not from
running every path, and the parallel branches move fast.

## 0. What the engine does today

| Area | Today | File |
| --- | --- | --- |
| A mission | `{ id, title, map, targets, output, floorMw, starMw, airframes, waves, routes }`, plus `night` and `prepMs` | `src/share/war/missions/*.js` |
| A wave | `{ round, at, kind, n, per, route, target, spread }`; born at `roundAt + at * 1000`, nothing else gates it | `edge/rooms/war.js` `births` |
| Variation | the match's `seed` draws each attacker's lateral `err` (only once every scout is dead) and its power line strike; nothing else | `war.js` `draw`, `wireDraw` |
| A round | ends when all its waves are born and none but scouts is left (`win` or `damaged`), or when no pilot can fly (`lost`, the rest get through); 6 s of result; then the next | `war.js` `roundStep` |
| Kinds | `scout, loiter, strike, fpv, hunter, boat, jammer, decoy`, the order of the wire's kind byte | `src/share/war/routes.js` `KINDS` |
| Routes | a list of points per name per mission; pure, deterministic, flown identically by the room and every client | `routes.js` `planAgent`, `poseAt` |
| Targets | 20 intakes, 20 penstocks, 14 gates, `yard-right`; a hit target never comes back within a match | `missions/itaipu-1.js`, `war.js` `take` |
| Lights | night districts dark by the room's hits and wire strikes, deterministic, nothing restored | `src/share/war/grid.js`, `src/maps/itaipu/look/night.js` |
| Time of day | `night: true` (a night build before the go); `morning`, `noon`, `golden` only in open PR #344 (`?time=`, `options.time`) | `itaipu-4.js`, PR #344 |
| Radio | one voice (Crest Control), a queue of three, stale after 6 s, end lines interrupt; per mission `brief-<id>-1/-2` and `debrief-<id>-win/-lose` derived from the `MISSIONS` keys | `src/render/warradio.js` |
| Music | two tracks, `intro` and `combat` | `warradio.js`, `assets/audio/war/music/` |
| Voice build | one `voice` per language (Kokoro reference cloned by Chatterbox), first take that passes Whisper is kept | `tools/voice/build.py`, `script.py` |
| Intro | one six shot film for every mission, shot lengths typed in `intro.js` `SHOT_MS`, the room's briefing is their sum `INTRO_MS`; any key skips; host skip ends the briefing for all | `src/render/warintro.js`, `src/share/war/intro.js`, `war.js` `skipIntro` |
| Campaign | `ACT1` lists itaipu-1 to 4, unlocked in order, itaipu-1 free | `src/game/campaign.js` |
| Damage, flood | in progress on `origin/war-damage-structures` (`op: 'damage'`, chunked structures, openings) and `origin/water-flood` (shallow water solver in WASM); contract in `~/Desktop/fdfpv-loop/itaipu/DAMBREAK-CONTRACT.md` | branches |

## T1. The mission engine (room and shared data)

### T1.1 Stages and triggers

A mission may carry `stages` instead of rounds. A mission without
`stages` plays exactly as today (each round is a stage that opens when
the last one's result ends), so nothing in flight breaks.

```js
stages: [
  {
    id: 'eyes',                      // the HUD's lower third: war.stage.itaipu_1.eyes
    open: { on: 'go' },              // or { on: 'beat', ms: [10000, 15000] } after the previous exit
    objectives: [{ id: 'scout', kind: 'kill', group: 'scout' }],
    groups: [
      { id: 'scout', kind: 'scout', n: 1, per: 0.25, route: { sector: ['HIGH', 'N'] }, at: { on: 'open', ms: [0, 0] } },
      { id: 'yard', kind: 'strike', n: 1, per: 0.5, route: { sector: 'NW' }, target: 'yard-right', spread: 60,
        at: { on: 'open', ms: [25000, 40000] } },
    ],
    exit: { any: [{ on: 'scoutsDown' }, { on: 'scoutGone' }, { on: 'open', ms: 80000 }], then: 'cleared' },
  },
  ...
]
```

- **Trigger evaluation** runs in the room's tick at the judgement's
  frontier `f`, as `roundStep` does, so a trigger fires at the same room
  ms whatever the lag. Every trigger in MISSIONS.md 1.2: `go`,
  `open+[a,b]`, `after(G)+[a,b]`, `cleared`, `killed(G)`, `scoutsDown`,
  `scoutGone`, `hit(T)`, `outputBelow(mw)`, `held(O)`, `opening(T)`,
  `crossed(G, line)`, `spent(f)`, and `any`/`all` of them.
- `crossed` needs named lines in the mission data (`lines: { 'east-shore-mid':
  [[x, z], [x, z]] }`), tested on the attacker's route at its birth
  (deterministic, computed once like `wireStrike`).
- A **group** is today's wave with an `id`, and `at` that is a trigger.
  Its `n`, `k`, `t0`, `err`, `wire` ride in the birth exactly as today.
- A **beat** replaces `RESULT_MS` between stages: its length is the
  stage's `open.ms` window, drawn from the seed.
- **The economy maps onto stages**: `m.round` becomes the stage index, and
  `spent`/`earned` reset at each stage's open as they do at each round's.
  `rounds()` is `stages.length`. `resultOf` reads `results` per stage.
- **Groups that span stages** (M7 stage 3 runs alongside stage 2): a
  stage may name `with: 'heavy-hulls'`, opening while that stage is open
  and closing with it.
- Room ops: the view gains `stage` (index), `stageId`, `stageOpenAt`,
  `beatUntil`; a new event `{ type: 'war', op: 'stage', at, stage }`.
- Checks: `rooms:selftest` and `war:harness` gain a staged mission; the
  harness proves the same trigger fires at the same room ms on a laggy
  and a zero latency run, as it does for detonations.

### T1.2 Objectives

`objectives: [{ id, kind: 'protect'|'kill'|'hold'|'spot', targets, group, ms }]`.
The view carries each one's state (`live`, `done`, `failed`) and a hold's
progress (`heldMs`). A hold pauses nothing: its timer is room ms from its
start and fails on a hit of a named target. Objectives never decide the
mission (the output floor does, as today); they feed the radio, the HUD,
the stage exits and the stars (a failed hold makes its stage `damaged`).

### T1.3 Seeded dials

All draws from `m.seed` with a salt per purpose and the stage and group
index, through the room's existing integer `draw`:

| Dial | Data | Draw |
| --- | --- | --- |
| Bearing | `route: 'name'`, or `{ sector: 'N' }`, or `{ sector: ['HIGH', 'N'] }` | pick a sector, then a route of the sector's family; never the sector of the previous group of the same stage; weighted by T1.5 |
| Composition | `kind: ['fpv', 'loiter']`, or `mix: [['strike', 1], ['decoy', 2]]` | pick, or deal a group's k slots by the mix |
| Timing | `at: { on, ms: [a, b] }` | uniform in the window, scaled by the pilot rule of MISSIONS.md 1.6 |
| Twist | `twists: [{ id: 'a', ... }, ...]` on a stage | pick one per match |
| Working set | `pick: { from: ids('gate', [...]), n: [3, 4] }` | M2's working gates |

Every draw is **recorded** in the match (`m.draws`) and sent in the view,
so a late joiner, a restore and the film agree with the room without
re-deriving anything. `restore` keeps them.

### T1.4 Routes and sectors

- Each route in a mission's `routes` gains `sector: 'N'|'NW'|'NE'|'HIGH'|'WATER'|'GORGE'|'RIVER'|'LINES'`.
- New routes to author (MISSIONS.md 1.4): `reservoir-nne`, `west-arm-high`,
  `east-shore-low`, `east-shore-high`, `high-north`, `surface-mid`,
  `surface-west-arm`, `gorge-left-rim`, `river-surface`, `river-west-bank`,
  `corridor-west`, `corridor-east`, plus the breachers' long route from
  the far north (M7).
- **The river below the dam**: boats there hold the downstream water's
  surface, not the reservoir's 219 m. Read it from the map's water data
  (the same source `itaipu-height.bin` was built from) and teach
  `war-routes-check.js` that a boat on a RIVER route holds that level.
- `npm run war:routes` must cover every route of every family at 1 to 8
  pilots, as it does today.

### T1.5 The adaptive axis (the Aggressor's "mind")

At a stage's open the room has every death's position (`dead` records
with `p`) and every seat's spend. Two deterministic weights, applied to
the bearing draw of the stage's groups:

- each sector's weight is `1 / (1 + kills in that sector last stage)`;
- if the squad ended the last stage with at least 0.75 of its airframes
  spent, the stage's first `at` window moves 30 % later; with under 0.25
  spent, 30 % earlier.

Pure arithmetic on room state; record the result in `m.draws`.

### T1.6 New kinds and targets

Append to `KINDS` (the wire's kind byte keeps its order):

| Kind | id | Speed m/s | Flies | hp | Notes |
| --- | --- | --- | --- | --- | --- |
| Carrier | `carrier` | 7 | RIVER routes, weaving slowly, then holds | 2 | While alive, the room births a child group (its `launch` spec: kind, n, per, every [35, 50] s) at its current pose; the children's route starts there. Needs `routes.js` to plan a route that starts at a runtime point (the carrier's pose at the launch ms, which is itself deterministic). |
| Breacher | `breacher` | 6 | long WATER routes from the far north, at the surface | 2 | Aimed at a gate or intake under the waterline; its arrival is the damage model's biggest charge (agree the number with the damage agent: `damage.js`'s `boat` is 260). |

New targets (`map.targets` and the mission's MW table):

| Target | Ids | MW | Source |
| --- | --- | --- | --- |
| 500 kV towers | `tower-w-0..`, `tower-e-0..` along the two corridors | the line's share (agree with grid.js: a west corridor tower cuts its district as a wire strike does today) | the spans in `src/share/war/itaipu-wires.js` / OSM; `scripts/war-targets.js` writes them |
| Emergency gantries | `gantry-intakes` (serves every intake and penstock), `gantry-spillway` (every gate) | 0 (hold targets, not output) | crest structures on their rails by the intakes and over the spillway's piers; each needs a model, a collider and the stoplogs' descent animation (map package) |

`src/render/attackers.js` needs a model for each new kind (the carrier
and breacher are unmarked grey hulls, bigger than a sea drone);
`src/ui/warmarkers.js` labels them (NODRIZA/CARRIER, ROMPEDOR/BREACHER).

### T1.7 Hit points

`KIND[k].hp` (default 1). A detonation on an attacker with hp over 1
decrements it and sends `{ op: 'hurt', id, at, by, hp }` instead of
`dead`; the defender is spent as today; a `penetrator` warhead removes
all of a kind's hp in one hit. Kills, assists and earned airframes count
on the death only. The harness's bands hold for the decrement.

### T1.8 Spotting

The first role for the slow long winged aircraft now the relay role is
dormant (no signal, decision 9):

- Spotters: the airframes that were relays (Bramor, Skyhunter, Radian)
  plus Slow Stick, Bombshell, Cub, Kadet, Tiger Moth. Listed in
  `src/share/war/fuze.js` or a sibling, one table.
- A spotter seat within 450 m of an attacker, with the attacker above the
  ground line of sight (`terrain.finestAt`, as signal.js samples it),
  for 1.5 s continuous, spots it: `{ op: 'spot', id, at, by }`.
- Spotted attackers are marked for every seat at any range; a spotted
  decoy reads DECOY/SEÑUELO for everybody (today a decoy reads STRIKER
  until 300 m, `warmarkers.js`).
- The `spot` objective is done when its group is spotted.
- CPU: a seat to attacker distance per tick, the same pairs the referee
  already walks; report it in `war:harness` against the 60 ms a second
  budget (WARFARE-PLAN 4.4).

### T1.9 Target states for the story

- **Working gates** (M2): a per match subset drawn by T1.3; while the
  spill objective runs their `mw` is doubled in `take`; the view lists
  them; the HUD outlines them.
- **The spill** (M2): the gates' open state (the hoists raised) and water
  down the chute. The map draws it; the room only says when (`op:
  'spill'`, at). Check with the water agent whether the flood solver can
  drive the chute or whether it is a visual.
- **Spray zone** (M2 twist A): a volume near the chute where markers past
  150 m are hidden on every screen while the spill runs.

### T1.10 Lights that come back, and lights put out by order

`grid.js` states "nothing comes back". Two room events change that,
both deterministic and stored:

- `{ op: 'restore', at, districts }` (M3's reroute, M6's islanding):
  those districts return over the same cascade and flicker the hit used,
  in reverse.
- `{ op: 'station', at, on: false }` (M4 twist A): the dam's station
  service lights out by order; the stage's groups draw `err` as if their
  scouts were dead.

`war:grid` gains both cases.

### T1.11 Time of day per mission, and across one

- `time: 'morning'|'day'|'golden'|'night'` on a mission, read at the
  world build, once PR #344 is merged; `night: true` stays as an alias.
- **Across a mission** (M3 dusk into dark, M4 night to sunrise, M6 golden
  into dark, M7 blue hour to sunrise): a `light` track on the stages,
  `{ at: stage, to: 'night', ms }`, that ramps sun, sky, exposure and the
  night lights' level without a rebuild. night.js's lights are already
  levels in a shader; they need a global level besides the districts'.
  If a ramp cannot be done without a rebuild, the fallback is: the
  mission plays at its starting time, and the change happens in the
  debrief film.
- `prepMs` for any mission that builds night lights at the go, as
  itaipu-4 does.

### T1.12 Openings and Contain, in every mission

Decided 2 October: the dam can open in any mission (MISSIONS.md 1.9).
No per mission flag; the damage model's openings are live everywhere.

- Consume the damage branch's `op: 'damage'` openings as the `opening(T)`
  trigger, with the attacker kind that made it (M7 branches on a
  breacher's).
- On an opening the room adds a Contain objective to the stage under way:
  hold on the gantry serving the structure (`gantry-intakes` for an
  intake or penstock, `gantry-spillway` for a gate), 120 s or 150 s;
  holds the stage's exit and beat until it ends; retargets the next group
  born at that gantry (its `target` replaced, recorded in `m.draws`).
- Held: the room sends the opening closed (the contract's opening event
  with zero size), the flood solver drains, the mission's stars are
  capped at two. Gantry hit while an opening is open: the mission is
  lost (`why: 'shutdown'`), a new end reason for the result and the
  debrief (`contain-lost`).
- One closure per gantry at a time; a second opening on it queues.
- The stoplogs' descent is a map animation driven by the hold's progress.
- Until the damage and flood branches merge, `opening(T)` never fires
  and every mission plays without Contain, so missions 1 to 6 do not wait
  on them.
- The checkpoint (T1.14) must snapshot the damage state (chunks broken,
  openings) at each stage's open, so a restart restores the structures.

### T1.13 Per mission radio as data

- A mission's `radio: [{ id, on: <trigger>, delay: [a, b], who, prio }]`
  replaces the hard coded `BRIEF_LINES` and `END_LINES` in
  `warradio.js`, which today derive `brief-<id>-1/-2` and
  `debrief-<id>-win/-lose` from every key of `MISSIONS`: a new mission
  without those four lines points the radio at files that do not exist.
  Until the data replaces them, every new mission needs those four ids in
  `lines.json`.
- Debrief variants: `debrief-itaipu-7-held` (won through Contain).
- The shared bearing calls (MISSIONS.md 1.8) chain before the kind call
  on a group's birth.

### T1.14 Restart from the lost stage (decided 2 October)

At every stage's open the room stores `m.checkpoint = { stage, output,
down, draws, damage }` (damage: the chunks broken and the openings, from
the damage branch, once merged). On a lost mission the host may restart
from the checkpoint: the same seed and draws, the output and targets down
as they were, the structures restored to that state, the stage's beat
then its groups. A mission won after any restart has its stars capped at
two. The result and the campaign record carry `restarted: true`.

### T1.15 Campaign

`ACT1` appends itaipu-5 to 7 (ids unchanged for 1 to 4: they key saved
progress); new strings `war.mission.itaipu_5..7` and the titles of 1 to 4
renamed; `campaign:check` updated. M1 stays the free mission.

### T1.16 Balance and variety checks

- `war:balance` per mission over a set of seeds (say 20) at 1, 2, 4 and 8
  pilots, reporting win rate and output by seed, so a seed that makes a
  mission unwinnable is found before a pilot finds it.
- A **variety check**: over those seeds, each stage shows at least two
  distinct bearings and every twist is drawn at least once; the same
  check fails a mission whose stages are all the same kind.

## T2. The intro sequencer

### T2.1 A film per mission, as data

`src/share/war/films/<mission>.js`, data only, like the missions: shots
of one camera primitive each, their anchors, their lines, their cast, the
agents' passes, the inserts and the titles (INTROS.md section 5). The
player stays `src/render/warintro.js`, generalised to play any film.

### T2.2 Camera primitives and lenses

`dolly`, `crane`, `orbit`, `handheld`, `dronePov`, `telephoto` (INTROS.md
1.2), each a function of shot time to (position, look, roll). Lens in mm
on a 36 mm wide frame; the player sets `camera.fov = 2 atan(tan(hfov /
2) / aspect)` with `hfov = 2 atan(18 / mm)`, so the horizontal framing
holds on every screen. Easings `lin`, `io`, `out`, `in`, `hold`.
Handheld uses a seeded smooth noise (summed octaves of a value noise on
the shot time), not `Math.sin` sums, so it does not read as a pattern.

### T2.3 Timing from the voice

- A shot's length is `max(min, lead + max(seconds.en, seconds.es) + tail)`
  over its lines, from `assets/audio/war/manifest.json`.
- A node script (`npm run films:time`) writes `src/share/war/filmtime.js`:
  `FILM_MS[missionId]` and each shot's start. The room's briefing reads
  it in place of `INTRO_MS`, so every screen and the room agree whatever
  the language mix. CI fails if the generated file is stale against the
  manifest.
- Anchors: `shot.start + x`, `vo.start + x`, `vo.end + x`, `shot.end - x`.

### T2.4 Agents placed by their passes

`pass: { kind, route, k, n, at: <anchor>, point: [x, y, z] }`: the
sequencer finds the route parameter nearest `point` and solves `t0` so
the attacker is there at the anchor, using `planAgent`'s own arc length
and `KIND` speeds. This removes the bug class measured in INTROS.md
section 0 (a typed 38 m/s against a real 26.6). The film lint fails a
pass more than 0.1 s or 2 m off.

### T2.5 One clock, preloaded

- Before the film, decode its lines (both languages' files are not
  needed: the page's language only) and its music into AudioBuffers; hold
  black with the mission title while they load.
- Run the film on `AudioContext.currentTime`; schedule every line with
  `AudioBufferSourceNode.start(when)`.
- A late start plays a line under way from its offset
  (`start(when, offset)`); `SAY_LATE_MS` goes.
- Without a user gesture yet (no audio context), the film runs on
  `performance.now()` silent, as today, with subtitles.

### T2.6 Seen, and the skip rule

- A per pilot record, `films: { [missionId]: version }`, in the campaign
  store (`src/game/campaign.js`), set when a film's last shot is reached
  on this screen having started at its first.
- Hold to skip, 2 s, with a ring; only on a seen film.
- The room: the hello carries the pilot's seen films; the welcome and
  view carry, per seat, whether this match's film is seen;
  `op: 'skipIntro'` from the host is refused unless every seat present
  has seen it (today it always ends the briefing for everyone).
- A pilot's own skip, as today, leaves the film for the hold orbit.

### T2.7 The film lint, and the existing check

- `npm run films:lint` (Node, no browser): every shot one primitive, its
  length at least its lines', the film 30 to 75 s, every pass on time,
  every cast member clear of colliders (`nearestSolids`), every line id
  in `lines.json` and the manifest, every title key in both string
  tables.
- `npm run warintro:check` (`scripts/warintro-check.js`, built, plays the
  film headless with `SIM_GPU=1`) runs every film and reports frames per
  shot, the subtitle at each line's middle, and the attackers drawn in
  each passing shot.

### T2.8 Inserts

SCOPE and GRID (INTROS.md 1.5), 2D overlays drawn on the film's overlay:
SCOPE is a canvas map of the reservoir with the film's agents drawn from
`poseAt`; GRID is `grid.js`'s districts as tiles with the towns' names
(strings). Each is a shot type with `min` length and an optional
progression (`tracks appear over 0 to 4 s`).

### T2.9 In-mission camera moments (optional)

A stage may name one `moment: { film shot }` played only during a beat
and only while no pilot is airborne, never in live flight; the shell
returns the pilot's camera after. If that cannot be guaranteed in a room,
leave it out: the films and the world carry the story without it.

### T2.10 The hand-off

The last shot's final 1.5 s blend from the film camera to the pilot's
own seat camera (each screen its own slot's spawn), the letterbox opens
over the same time, and the countdown starts as it finishes. Today the
film ends and the shell's camera returns with no blend.

### T2.11 Stage props the films need

| Prop | Films | Today |
| --- | --- | --- |
| Attackers on routes | all | built (`createAttackers`, `planAgent`) |
| Standing and flying cast | all | built (`craftBuilderFor`, baked) |
| Nav lights off per aircraft | M4 | needs a toggle on the baked cast |
| Night world, towns coming on | M3, M4 | night build built; the ramp is T1.11 |
| Thermal look | M4 | the Avionics HUD's thermal, as a full frame grade |
| Smoke on a structure | M5 | built for hit targets; a film needs to light it without a hit |
| Spill state | M2 | T1.9 |
| Gantry and stoplogs | M7 | T1.6, T1.12 |
| Corridor towers and wires | M3, M6 | drawn by the map (town/wires.js); the drone POV needs a path between them clear of the wires |

## T3. Audio

### T3.1 The radio: speakers and priority

- `lines.json` lines gain `speaker` (`crest`, `mirador`, `taller`,
  `despacho`, `carancho`); the files stay `voice/<lang>/<id>`.
- The queue gets a priority per line: end lines (interrupt, as today) >
  story lines (the mission's `radio` data) > shared calls (bearing, kind,
  hit, kill). A story line waiting may push a shared call out of the
  queue; never the reverse. Stale stays 6 s for calls, 12 s for story
  lines.
- A bearing call and its kind call are one queue item, so nothing is said
  between them.

### T3.2 The voice pipeline: several voices and chosen takes

- `voice` becomes `voices: { crest: { en, es }, mirador: { en, es }, ... }`,
  each with its Kokoro stock voice and reference text; `script.load`
  validates that every line's speaker exists.
- Candidates (BIBLE.md 5.2): Spanish Kokoro has three stock voices
  (`ef_dora`, `em_alex`, `em_santa`); DESPACHO and CARANCHO try the
  Brazilian Portuguese ones (`pf_dora`, `pm_alex`) reading Spanish.
  Check the names against the installed Kokoro before building.
- **Takes**: build N takes a line (say 4) that pass Whisper, keep them in
  a review folder, and pin one per line and language in `lines.json`
  (`take: { en: seed, es: seed }`); `check.py` fails a line whose pinned
  take's sha does not match the manifest. Unpinned lines build as today.
- Guaraní words (TALLER's "aguyje", "jaha") need `heard` readings
  checked; Whisper will not spell them the same, and a homophone check is
  by ear.
- The rule list of `script.py` is unchanged: no digit, no dash, ustedes.

### T3.3 Radio colours

`radio.py` today applies one filter. A preset per speaker: CREST the
current console band; MIRADOR wider with a data hiss; TALLER handheld
with room noise; DESPACHO telephone band and hum; CARANCHO farthest, more
static. No preset drops or cuts words: there is no radio breakup effect
in any mission (the lead's decision of 2 October, under the owner's no
jamming rule). Deterministic, as the current filter is.

### T3.4 Music in layers

- Per mission, or one set for the act: stems `amb`, `pulse`, `full`, a
  `sting`, `win`, `lose`, same tempo and key so they crossfade on the
  bar. Licence first, as the current tracks (CC0, CC BY with credit in
  `assets/audio/war/CREDITS.md`, or generated under a licence that
  allows a GPLv3 repository).
- `WarRadio`'s bed becomes a layer mixer: the mission's cue changes
  (MISSIONS.md 1.5) set target levels; crossfade at the next bar.
- `war:radio` gains the cue logic as a pure function of events, as the
  calls are today.

## T4. The HUD

- **Objectives**: one line each under the output, with state and a hold's
  progress bar ("HOLD THE YARD", "KILL THE CARRIER", "REROUTE"), strings
  in both languages.
- **Stage title**: a lower third for 3 s at a stage's open ("STAGE 2:
  PROBE" / "FASE 2: SONDEO").
- **Working gates and named targets** outlined on the markers.
- **Spotted** attackers marked for everyone; DECOY when spotted.
- `war:hudlayout` and `check:avionics-layout` cover the new lines at
  every supported aspect.

## Build order

1. **M1 as the vertical slice**: T1.1 to T1.3 (stages, objectives,
   dials), T1.13 (radio as data), T2.1 to T2.7 (the film player rebuilt
   around the voice clock), T3.1 to T3.2 for CREST, MIRADOR and TALLER,
   T4's objectives and stage title. Fly it.
2. M2 to M4 on the same engine plus T1.9, T1.10, T1.11, DESPACHO.
3. M5 and M6: T1.4's new sectors, T1.6 (carrier, towers), T1.7, T1.8,
   CARANCHO.
4. Contain in every mission and M7, once the damage and flood branches
   have merged: T1.6 (breacher, gantries), T1.12, the damage snapshot of
   T1.14.

The decisions of 2 October (OVERVIEW.md) are built into the rows above.
