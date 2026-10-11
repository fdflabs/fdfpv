# Training and readable damage: the contract (Wave 3 items 18 and 19)

Lane "training", 2026-10-07. Builds on docs/redesign/TRAINING.md (the
curriculum proposal) and the owner decisions of 2026-10-07 (full part wear
and repair). This file says what ships, its data, what it does not do, and
the checks that prove it.

## The rule over everything here

Nothing in this lane writes to the plant, the controller or the input
stream. Assists are the flight modes that already exist (Betaflight angle
mode on quads; Stabilised, Acro and Manual on planes, configs/registry.js),
chosen by a lesson the way the settings choose them today, plus visual aids
drawn by the renderer. Damage and wear are read after a step, never fed
back. So a recorded flight, `crash:core` and `war:legacy` are bit identical
with any of this on or off, and the PRs that touch src/main.js run both.

## Item 19: damage the player can read

### What the player sees

- In flight, one word on the OSD warning row (fpvhud.js `warningFor`):
  `DAMAGED PROP` (or ARM, CAMERA, ...) when the aircraft still flies with a
  broken part; nothing when it is whole. A wreck already has its banner and
  its REPLAY prompt, so DESTROYED adds no new text in flight. The damaged
  line sits under every power and link warning (LAND NOW outranks it) and
  over BATT < FULL; it does not blink.
- On the Avionics HUD (the combat drones' default), a DMG row in the health
  panel: OK, IMPAIRED with the part, or DESTROYED, coloured as the panel
  colours link and navigation. The Game HUD draws no warnings at all today,
  so it gets none here; giving it a warning line is a separate decision.
- In the hangar: unchanged here; the parts lane owns the parts bench
  (src/ui/hangar-parts.js), repair and wear.
- In the debrief: the debrief lane (item 16) renders it; this lane hands
  them one call (below).

### Data

`conditionOf(flags, fixedWing)` in src/game/damage.js, a pure function of
the plant's damage flags (configs/parts.js `DAMAGE_FLAGS`):

| Condition | When |
| --- | --- |
| `destroyed` | `isWreck(flags, fixedWing)`, the same test that ends the flight today |
| `impaired` | any damage flag that is not a wreck flag (inTree and inWater are where the craft is, not damage, and do not count) |
| `operational` | no damage flag |

`damagedPart(flags)` names the worst impairing flag for the OSD word, in a
fixed order, worst first (battery, wing, tail, arm, motor, prop, camera, ...).

The shell's `crashSummary()` (the dev hook the checks read) gains
`condition`. The debrief lane reads the same function on the run's final
flags.

### Wear: the shape proposed to the parts lane

The parts lane owns wear accumulation, repair and storage; this lane owns
showing it in flight and in the debrief. Today a plane's stored parts
entry carries `damage: { parts: [{ i, kind, cg, mass, joint, state }] }`
(main.js `recordBroken`), `i` the part's index in the plant's part table.
Proposed, as a sibling keyed the same way:

```
entry.wear = { v: 1, parts: { [i]: w } }   // w in [0, 1]: 0 new, 1 worn out
```

and three display bands: `w < 0.5` good, `0.5 <= w < 0.85` worn, `w >= 0.85`
needs repair. Adopted by the lead 2026-10-07; the parts lane's
configs/wear.js holds the record (`wearRecordOf`), and src/game/damage.js
holds the bands (`WEAR_BANDS`, `wearBand`) and `worstWorn(record, kinds)`,
the one part the pilot is told about. Wear exists only in career and war
(owner 2026-10-05); casual modes read no wear.

In flight, wear is shown before arming: the OSD's warning row reads
`WORN: MOTOR` (or `REPAIR: MOTOR` past the repair band) for the worst part,
and the Avionics HUD's DMG row reads WORN or REPAIR with the part. The
shell hands it as the OSD context's `worn`, set from the career or war
sortie (the parts lane's wiring); with no sortie it is null and nothing
shows. Wear changes nothing
in the physics from this lane; whether wear changes thrust or strength is
the parts lane's call and its own determinism check.

## Item 18: training

### What ships

1. Lessons as data in a new src/game/training.js: `{ id, track, airframe,
   place, assist, objective }`, with `LessonWatch`, which takes the same
   `tick({ simMs, crashed, grounded, power, battery })` and gate and lap
   calls RunWatch takes and says when the objective is met. Track 1 (First
   flight) and Track 4 (Racing) first, because they need only judges that
   exist.
2. A `training` activity in configs/registry.js whose setting is the
   lesson, so a lesson is a solo session (SESSIONS.md). The "Learn to fly"
   row is Flight Club's (lane 21); this lane offers the activity and a
   picker, and lane 21 places the row.
3. Visual aids, off outside lessons unless the pilot turns them on: a
   glide path to the strip (landing help) and the next gate's direction
   on the HUD (racing line). Drawn with src/game/guide.js's paint.
4. "I fly already": a track's first lesson offers it; one demonstration
   passes the track's basics. Acro lessons are for experts and are not a
   gate.

### Storage

Lesson passes are player data in the progress blob, which is lane 17's.
Proposed: `progress.lessons = { [lessonId]: passedAtMs }`, with a
versioned migration that seeds an absent field to `{}`. Built after lane
17 answers in the plan file; until then lessons judge and report but do
not store.

### What it does NOT do

- No new stabilising or stick shaping code: auto level is angle mode or
  Stabilised, which exist.
- Gates nothing: every card, aircraft and the war (after its consent) stay
  open from the first minute. No XP, no certifications here (PROGRESSION.md
  is lane 17's).
- No controller-first onboarding screen (TRAINING.md phase 1): it rewrites
  every new player's first minute and is not item 18.
- Track 5 (Defence) waits for the stage engine's practice stage.

## Checks

| Feature | Check |
| --- | --- |
| conditionOf, damagedPart | `npm run damage:selftest` (Node): every flag alone, the wreck sets per quad and plane, inTree and inWater alone stay operational |
| OSD word | the same selftest drives fpvhud's `warningFor` with a condition and with none, and the order against LAND NOW |
| Determinism | `npm run crash:core` and `npm run war:legacy` on every PR that touches src/main.js |
| Lessons | `npm run training:selftest`: each lesson's judge on recorded tick streams, passing and failing |
| Words | lint:copy (en and es), lint:dashes, lint:header |
