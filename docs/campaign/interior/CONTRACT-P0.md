# The Interior, Phase 0: the room's contract

Written 2026-10-05 by track ROOM for track VIEW (camera ball, capture
scoring, quiet HUD, debrief, main.js wiring) and track WORLD (the map,
canopy, routes). It is what the room holds and says for a mission of the
new kind (an "ops" mission: The Interior first, Defend the Paraná later),
with field names and units. Nothing here names The Interior in code: the
campaign's words, roles, classes and lines are its mission data
(`src/share/interior/missions/`).

Where the room is: `edge/rooms/ops.js` (`RoomOps`, a sibling of
`edge/rooms/war.js`), on pure modules in `src/share/ops/`:
`contacts.js` (N13), `roles.js` (N16), `alert.js` (N17),
`capture.js` (N5's room judge), `stages.js` (N6, on
`src/share/war/stages.js`), and `missions.js` (the registry of ops
missions). Stand ins for WORLD's functions: `src/share/ops/fixtures/`.

## 1. Frame, units, time

- **The ops frame** is `src/render/frame.js`'s document frame: right
  handed, **z up**, x east, y north, metres. The room converts each pose
  (scene metres, y up, as POSE carries it) with `threePosToDoc`, imported
  from frame.js and not copied, so the conversion stays in that one file.
  Every position in this contract and in mission data is in the ops
  frame. Its origin is the map's scene origin (WORLD's choice); mission
  data writes MISSIONS.md 1.9's design grid through one constant per
  mission (`ORIGIN`), so a shift is one number.
- **Units:** metres, seconds in data (`s`), room milliseconds on the wire
  (`t`, `at`), radians nowhere: the camera's field of view is sent as
  `tanHalf`, the tangent of half the horizontal field of view, so the room
  needs no trigonometry (determinism, CLAUDE.md).
- **Time** is the room clock (`core.roomMs`), as every game uses it. The
  room judges on a fixed grid of `GRID_MS` = 100 ms of room time, behind
  the war's frontier (every seat heard from in the last 2 s has covered
  it, or it is 400 ms old), so a laggy run and a zero latency run fire
  every trigger at the same room ms.

## 2. WORLD's functions, as the room calls them

```js
canopyBlocks(from, to)        // [x,y,z], [x,y,z] ops frame -> boolean: crowns block the line
poseOnRoute(routeId, ms)      // -> { x, y, z, heading, action } or null once the route is over
```

- `ms` is **route local**: milliseconds since that contact started the
  route (`roomMs - contact.t0`). A route cannot know its own start: the
  pair starts at a seeded time after the corridor is crossed, the
  dispersal on a trigger, an alternate route at a hard threshold.
  **Open question for WORLD:** confirm `ms` is route local. If it is
  absolute room ms, the room passes `roomMs` and routes must not start
  on events, which the mission cannot live with.
- `null` (or `action: 'gone'`) means the contact has left the picture
  (into the forest, out of the map): its record becomes `vanished`.
- Both must be pure and deterministic (no `Math.sin`, `Math.cos`,
  `Math.pow` on the room's path), the same in Node and the browser.
- Until WORLD lands: `src/share/ops/fixtures/world.js` exports the same
  two names over a flat test map. The room takes them as an argument
  (`new RoomOps(meta, { world })`), so the real ones plug in at one import
  in `src/share/ops/missions.js` (`worldFor(map)`).

## 3. Client to room

Every message is JSON `{ type: 'ops', op, ... }`. A refused one is
answered `{ type: 'ops', error }` to the sender alone.

| op | Who | Fields | What the room does |
| --- | --- | --- | --- |
| `start` | host | `mission` (id), `intro` (bool), `from: 'checkpoint'` (optional) | starts it: a briefing of the mission's `filmMs` when `intro` and it has one, then the countdown (`COUNTDOWN_MS`), then the first stage; or again from the stage a lost match was lost in. Refused: `mission`, `unreleased` (campaign.js gate), `map`, `busy` (another game on), `private` (a public room: P0 runs only in private rooms), `checkpoint` |
| `end` | host | | ends the match, `state: 'ended'` |
| `cam` | any seat | `t` (room ms), `dir` [x,y,z] (unit, ops frame), `tanHalf` (> 0), `aspect` (width / height) | the seat's camera from `t` until its next report, at most `CAM_STALE_MS` = 1000 ms. At most one each `CAM_MIN_MS` = 100 ms is kept; send 5 to 10 a second while flying. **Before the camera ball (N14) lands, send the nose's direction and the screen's own `tanHalf`.** Nothing is seen by a seat that sends no `cam` |
| `capture` | any seat | `item` (id), `t` (room ms of the still), `grade` (`clean`, `usable`, `poor`), `framing` { `size` (fraction of frame width), `off` (0 centre to 1 edge), `blur` (0 to 1) } | judged (section 7): recorded, or refused `capture` with `why` |
| `take` | any seat | `role` (a role id) | takes a free role: an unheld core role, or a new copy of a scaling role (section 5). Refused `locked`, `role` |
| `active` | any seat | `key` (a role key it holds) | which of its roles it is flying now |
| `swap` | any seat | `seat` (the other), `give` (a key the sender holds, or null), `take` (a key the other holds, or null; not both null) | a request, in the view's `roles.swaps`, until `SWAP_MS` = 20 000 ms |
| `swapAccept`, `swapDecline` | the asked seat | `id` (the request's) | accept exchanges the keys at once; decline drops it |
| `lock` | host | `on` (bool) | host lock: no role changes until unlocked |

## 4. Room to client

| Message | When | What |
| --- | --- | --- |
| `{ type: 'ops', ops }` | every change, and in the welcome | the view, section 4.1 |
| `{ type: 'ops', op: 'cue', cues }` | as cues fall due | `[{ at, stage, heard, radio?, text?, music?, card? }]`: **filtered per seat by the room** (section 6), so a screen plays everything it is sent |
| `{ type: 'ops', error, why? }` | to a refused sender | the codes in section 3 |

No binary message. Wire range taken in `~/Desktop/fdfpv-loop/multiplayer/COORD.md`:
binary **0xC0 to 0xCF held, none used**, JSON type **`ops`**.

### 4.1 The view

```js
{
  state,        // 'lobby' | 'briefing' | 'countdown' | 'live' | 'won' | 'lost' | 'ended'
  id,           // the match's number in this room
  mission,      // 'interior-1'
  campaign,     // the mission's campaign id, 'interior'
  goAt, briefAt, f, endAt,   // room ms: the go, the briefing's start (or null), the judged frontier, the end
  why,          // the end's reason (a mission `lost` rule's `why`, 'boundary', 'end', 'track', ...), or null
  stage: { id, n, at, title, text, music, lockRoles } | null,   // id is the script's checkpoint name
  cards,        // section 4.2
  contacts,     // section 4.3
  sites,        // { siteId: { value, level, at } }: alertness 0 to 1, the level reached ('calm', then the mission's names), at each level's room ms
  captures,     // [{ item, seat, t, grade, at }]: at the room ms it was recorded
  flags,        // { NAME: true | string }: the mission's script flags so far
  search,       // [{ id, at: [x, y], r, contact }]: SEARCH AREA circles (r metres); contact the id it is for, or null
  boundary,     // { seat: 'warning' | 'final' }: seats outside the operational boundary
  roles,        // section 5
  dials,        // { name: value }: what the seed chose (MISSIONS.md 1.4)
  result,       // null, or at the end { won, stars, starIds, flags, restarted }
  checkpoint,   // a lost match's stage to play again from: { stage, n, title }, or null
  restarted,    // the checkpoint stage id this match restarted from, or null (stars capped at 2)
}
```

### 4.2 Objective cards

`[{ id, text, tier, state, roles, star, progress? }]`, the current
stage's, only those already shown:

- `text`: a string key (`ops.<campaign>.<id>` in the strings), never prose.
- `tier`: `primary`, `secondary`, `optional`, `rule` (MISSION RULE: the
  card the script shows for ENGAGEMENT NOT AVAILABLE; never done).
- `state`: `active`, `done`, `failed`.
- `roles`: null (the squad's: every screen) or `[roleIds]`: only screens
  holding one of them draw it. The room sends every card to everyone; the
  screen filters by its own `roles.held`, since a card is state, not a
  line.
- `star`: whether it is one of the mission's three stars (also listed in
  `result.starIds`).
- `progress`: `[k, n]` for a count (`capturedN`).

### 4.3 Contacts (N13)

`[{ id, kind, group, route, t0, state, cls, label, lkp, seenAt, lostSince, by, hards }]`,
every contact the mission has put on the map so far:

| Field | Meaning |
| --- | --- |
| `id`, `kind`, `group` | the mission's: `kind` is `person`, `vehicle`, `aircraft`, `site`; `group` a name several share (`pair`) or null |
| `route`, `t0` | where to draw it: `poseOnRoute(route, roomMs - t0)`. Changes at a hard threshold and at a scripted move; every screen draws every contact from this, discovered or not (people are seen from the air before the room knows them) |
| `state` | `undiscovered` (never seen), `seen` (in some pilot's frame now), `lost` (seen before, in nobody's frame since `lostSince`), `vanished` (its route ended) |
| `cls` | null until discovered, then the campaign's class id (below) |
| `label` | a group label string key (`NEW COLUMN (UNCONFIRMED)`), or null |
| `lkp` | [x, y, z]: where it was when last in a frame, or null |
| `seenAt` | room ms the current or last sighting began, or null |
| `lostSince` | room ms it left the last frame, or null while seen |
| `by` | the seats whose frames hold it now |
| `hards` | how many hard thresholds moved it this stage |

**The truth never travels.** A contact's faction (its hidden truth) is in
mission data the room reads and is never in the view.

**Classes are campaign data**, the mission's `classes`. The Interior's
(BIBLE.md 6): `unknown`, `civilian`, `friendly`, `poi` (PERSON OF
INTEREST), `column-linked`, `network-linked`, `hostile` (HOSTILE
CONFIRMED). The HUD word is the string key `ops.class.<id>`. A contact
takes `unknown`, the first class, when discovered. **A class changes only
by scripted evidence**: a stage cue `classify` the mission's triggers fire;
no client message sets a class in P0 (a pilot's CONFIRM IDENTIFICATION is
M3, MISSIONS.md 1.6, and will be a room judged designation, not a click).

**Seen**, judged on the grid, for each seat with a pose and a fresh `cam`:
the contact is inside the frame (the angle off the camera's axis under the
frame's edge, from `dir` and `tanHalf`), big enough to notice (its `size`
over its distance at least `NOTICE` = 0.003 of the frame's width, about 6
px on a 1920 px screen, so zoom matters), and `canopyBlocks(camera,
contact)` is false. In a frame for `SEEN_MS` = 500 ms: `seen`. Out of
every frame: `lost` from the last grid ms it was in one.

**Recovery** (MISSIONS.md 1.7, per contact in data): `soft` s and `hard`
s. At `lostSince + hard` the room moves the contact to its alternate
route (`route`, `t0` change; `hards` + 1).

## 5. Roles (N16)

```js
roles: {
  defs:   [{ id, core, guide, platforms }],  // the mission's, in its order
  held:   { seat: [key] },                   // key: a core role's id ('isr'), a scaling copy's id and number ('tracker:2')
  active: { seat: key },                     // the role each seat flies now
  locked: bool,                              // the host's lock
  beat:   null | 'briefing' | 'stage' | 'host',   // why changes are refused now, or null
  swaps:  [{ id, from, to, give, take, until }],
}
```

- **The deal**, at the go (and at a restart's go), from the match's seed:
  the seats here in an order the seed shuffles; the core roles dealt round
  the shuffled seats (one pilot holds them all; two split them); then one
  scaling copy for each seat still without a role, numbered from 1.
  Recorded in the match, so a late joiner and a restore agree.
- **Take:** an unheld core role, or a new copy of a scaling role. A seat
  that takes a role drops its scaling copies (one job of that kind each);
  core roles it holds stay, so a core role is never left unheld.
- **Swap:** both seats agree; a request lapses after `SWAP_MS` or when
  either key changes hands.
- **Locked beats:** the briefing (every film), a stage with `lockRoles:
  true`, and the host's lock. The room refuses `take`, `swap`,
  `swapAccept` with `locked`.
- **Joins and leaves** (MISSIONS.md 1.5): a joiner takes the first unheld
  core role, else a new scaling copy. A leaver's core roles pass to the
  seat holding fewest roles (the lower seat on a tie); its copies end.
- **No upper bound** in data or code; the room's cap (8 private, 16
  public) is the only limit.

## 6. Cues and guide routing

A cue is told when due (`at` s after the stage's entry, or after its
`when` trigger), each with `heard`:

- `'all'`: every seat (story lines, VEGA's calls).
- `{ role: [ids] }`: only seats holding one of those roles. A role nobody
  holds hears nothing; a solo pilot holds every core role and hears every
  core role's guide.
- `{ seat: n }`: one seat (a boundary warning goes to the pilot crossing).

The room sends each seat only what it hears. Cue fields: `radio` (a line
id, `int1-s4-lost`; the voices are a later track, the id is the
contract), `text` (a string key for the stage line), `music`, `card` (a
card event key: `PRIMARY OBJECTIVE UPDATED`, `CONTACT CLASSIFICATION
UPDATED`, `INTELLIGENCE ADDED`, `SEARCH AREA ADDED`, `LAST KNOWN POSITION`,
`ARCHIVE MATCH SEARCHING`, as BIBLE.md 6 writes them, as string keys).

## 7. Captures (N5), judged by the room

The screen proposes; the room decides. `src/share/ops/capture.js`
exports `judgeCapture(item, pilot, cam, world)` and `gradeOf(size, off)`,
which VIEW's scorer should import rather than write a second time. The
room, for a `capture`:

1. finds the seat's pose at `t` (no older than the frontier's last 2 s)
   and its `cam` in force at `t`; refused `pose` or `cam` without them;
2. the item must be one the current stage or mission lists, not yet
   captured at that grade or better; refused `item`;
3. measures from the room's own numbers: `size` (the item's size over its
   distance, over the frame's width), `off` (0 at the centre, 1 at the
   edge) and occlusion (`canopyBlocks`); refused `frame` outside the
   frame, `blocked` behind crowns;
4. grades: **clean** at size >= 0.10 and off <= 0.25; **usable** at size
   >= 0.04 and off <= 0.5; **poor** at size >= 0.01 inside the frame;
5. records the lower of its grade and the screen's (the screen knows the
   blur, the room does not), `{ item, seat, t, grade, at }`.

Captures are the squad's: one pilot's counts for everyone.

## 8. Alert and standoff (N17)

A site (mission data `sites`): `{ id, at: [x, y], z0 (its ground), r,
below, reach, rise, fall, levels }`. On the grid, each aircraft within
`reach` metres that is inside `r` or lower than `below` metres over `z0`
adds `rise` a second to the site's value; with none, it falls by `fall`
a second; clamped 0 to 1. A level (`{ wary: 0.5, high: 1 }`) is reached
once, at a room ms (`sites[id].at[level]`), which fires `alert(site,
level)`. More aircraft close in raise it faster.

## 9. Stages, triggers, checkpoints (N6)

Stages are the war's engine (`src/share/war/stages.js`: stages, exits,
objectives, holds, seeded draws, `time`, `any`, `all`, `objective`,
`visited`), with the ops triggers added through one hook. The ops
triggers, in the ops frame:

| Trigger | Fires |
| --- | --- |
| `{ seen: C, now? }` | C (a contact or group) first seen in the stage; with `now`, the start of the sighting in force |
| `{ discovered: C }` | the first `seen` of the match |
| `{ captured: item or [items], n?, grade? }` | n of them captured at or above grade |
| `{ lost: C, s }` | C out of every frame for s seconds (a group: every member) |
| `{ reacquired: C }` | seen again after being lost for its `soft` seconds |
| `{ classified: C, is }` | C's class became `is` |
| `{ alert: site, level }` | the site reached that level |
| `{ route: C, point }` | C came within the mission's `points[point].r` of it |
| `{ vanished: C, watched? }` | every member's route ended; `watched`: each was in a frame in its last `WATCH_MS` = 10 000 ms |
| `{ zone: point, roles?, ms? }` | a seat (holding one of `roles`) inside the point's circle, for ms |
| `{ above: m, roles }` | every seat holding those roles over m metres above the mission's `z0` |
| `{ landed: point, roles }` | a seat holding those roles on the ground (not airborne) inside the point, after flying |
| `{ dwell: point, s }` | a seat's camera held on the point (off <= 0.3, not blocked) for s seconds |
| `{ boundary: level }` | a seat reached `warning` (outside), `final` (15 s later) or `out` (15 s after that) |
| `{ downed: roles, alone: true }` | a seat flying one of those roles crashed with no other seat airborne |
| `{ clock: s }` | s seconds after the go |
| `{ flag: NAME }` | the flag was set |
| `{ chosen: name, is }` | the choice `name` was made `is` (a cue `choose`) |
| `{ hards: C, n }` | C moved by n hard thresholds in the stage |

- **Mission loss rule** in place of the war's output floor: the mission's
  `lost: [{ when, why }]`, checked in every stage; the first to fire loses
  the match with that `why`. Boundary `out` loses it as `boundary`.
- **Checkpoints:** each stage's id is the script's checkpoint name. A lost
  match keeps the stage it was lost in; `start` with `from:
  'checkpoint'` plays it again with the contacts, captures, flags, sites
  and dials as they were when that stage opened; stars at most 2.
- **Stars:** the mission's `stars: [{ id, text, when }]`, judged at the
  end of a won match.
- **Flags:** set by a cue `flag: NAME` (value true, or `value`); the
  result carries them for the campaign's synced progress (N20,
  `src/game/campaign.js` `applyResult`).

## 10. The campaign entry (N20)

`src/game/campaign.js` exports `INTERIOR` beside `ACT1`: `interior-1` to
`interior-5`. `interior-1` is `release: 'development'` (held: it opens only
when it is 100 % and the owner has flown it); 2 to 5 are `release:
'soon'` with `label: 'development'`, so the card reads **Under
development** (the owner's words) while the gate keeps its meaning (no
mission file). `released(id, dev)` gates both lists; the room refuses
`unreleased`; a developer's rooms server (`DEV_MISSIONS=on`) and the
checks start `interior-1`. The campaign's progress gains `flags` (a flag
once true stays true; a string flag keeps the incoming copy's value).
**For VIEW:** the campaign shows armed conflict, so its card needs the
war's consent screen (`consent: true` on the campaign's entry); the text
is VIEW's to write.

## 11. What is not here yet

Films (N9, N18, N24) beyond holding the briefing for `filmMs`; the
camera ball (N14); designation and strikes (M3); platform holds (N15);
public rooms for ops missions; any mode registry entry
(`src/share/modes.js`) and menu card.
