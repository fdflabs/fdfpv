# Spotted: being seen by the people you photograph (contract)

Owner, 2026-10-08: in missions where you photograph people, flying too low gets
you spotted: a warning first, then the mission fails with a short end scene, a
radio voice telling you specifically what to do better, and a reset to the
last checkpoint.

## What the player sees

1. Low and close over a watched group: the HUD shows "They're looking up" and
   the radio says "You're too low. Climb." (to everybody, once per approach).
2. Climb or back off and the value falls; the cue goes away; the run goes on.
3. Stay and the group SPOTS you: radio "They've seen you." then one advice
   line chosen from what happened (below); the people run their scatter
   routes for SCENE seconds (the end scene, the match still live so every
   screen draws them going), then the match is lost with why `spotted`.
4. The fail card / debrief shows the same advice, with the height you came in
   at, and offers the checkpoint restart (the existing path).

Advice, picked from the exposure at the moment of being spotted:
- `loud`: the aircraft was fast (at or over the spotter's `loud` m/s) while
  exposed: "Full power that close, they heard you. Throttle back on the
  approach."
- `over`: horizontally within `overR` metres of a person: "You flew straight
  over them. Offset and orbit wide."
- `low`: otherwise: "You came in too low. Stay high and use the zoom."

## Data shape (mission data, any ops mission)

```js
spotters: [{
  id: 'pair',             // a key of m.spot, and of the triggers below
  group: 'pair',          // a contact id or group (contacts.js membersOf)
  stage: 'M1_CP_...',     // optional: hears nothing before this stage opens
  height: 200,            // m above a person: lower than this is exposed
  range: 450,             // m slant range: nearer than this is exposed
  overR: 60,              // m horizontal: nearer than this is "over them"
  loud: 30,               // m/s ground speed: at or over it is heard
  rise: 0.1,              // a second, each exposed aircraft (doubled loud)
  fall: 0.05,             // a second, with none exposed
  levels: { looking: 0.4, spotted: 1 },
  warn: 'int-spot-warn',  // line told when `looking` is reached
  lines: { spotted: 'int-spot-seen', low: 'int-spot-low', over: 'int-spot-over', loud: 'int-spot-loud' },
  scene: 6,               // s of end scene before the loss
  scatter: [{ contacts, route }], // applyCue `move` entries run when spotted
}]
```

An aircraft is EXPOSED to a person when it is airborne, lower than `height`
over the person and nearer than `range` (slant). With a crown between them
(`world.canopyBlocks`, the same line of sight contacts.js uses) it counts
half: people under trees hear an engine they cannot see. Speed
is the room's: the distance between the seat's poses one second apart (the
pose wire carries no throttle, and speed is what makes a propeller loud).

State, `m.spot[id] = { value, level, at: { looking?, spotted? }, worst, advice }`,
room-authoritative, stepped on the room's grid like alert.js, rounded to the
millionth. `at.looking` re-arms when the value falls back to 0. It is in the
view (sent again on a level or a 0 crossing, as a site's). It is NOT in the
checkpoint: a restart is a fresh approach, nobody looking up.

Triggers (stages.js): `{ looking: id }`, `{ spotted: id }`, the room ms the
level was reached. A mission loses on it with a `lost` rule:

```js
lost: [{ when: { spotted: 'pair' }, why: 'spotted', spot: 'pair' }]
```

`spot` makes the room delay the loss by the spotter's `scene` and tell
`[lines.spotted, 1, lines[advice]]` instead of `radio`. `view.spotAdvice` is
`{ id, advice, h }` once lost to it.

## Builds on

src/share/ops/alert.js (shape and stepping), contacts.js (centreOf,
membersOf), the room's grid (edge/rooms/ops.js gridStep, checkpoint, view),
stages.js triggers, applyCue `move` for the scatter, lines.json and the TTS
pipeline, src/ui/debrief.js.

## Does NOT do

No per-person AI, no hiding animation beyond the scatter routes, no camera
cut (the scene is the people leaving, seen live), no change to alert.js
sites (a site is a place's alertness; a spotter is people noticing you).

## Checks

- interior:stages: an ordinary run finishes as before; low over the pair is
  warned then spotted, lost `spotted` with advice, checkpoint restart;
  warned then climbed out goes on.
- lint:header, lint:dashes, lint:copy.

Needs a VM deploy (edge/rooms).
