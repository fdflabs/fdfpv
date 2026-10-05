# The Interior: what the engine needs

Written 2026-10-05 for the agents who build The Interior, one phase at a
time (PLAN.md section 8). Every design in MISSIONS.md and INTROS.md cites
a row here (N1 to N23). Each row says what exists today, read on
`origin/main` at bfe2b425, what has to be built, the check named before
building, and a rough size. **Verify each "today" claim before building
on it**: this was written from a read of the tree, not from running every
path.

Sizes: **S** a day or less, **M** two to four days, **L** about a week,
**XL** more than a week (a phase of its own). They are for ordering work,
not promises.

**Phase 0 is Mission 1 only.** A row marked **P0** is built in Phase 0
and nothing in it is for a later mission. A row marked M2 to M5 waits for
that mission's build. Where a row grows over several missions, each
growth is listed under the mission that needs it (section 3).

## 0. The standard this campaign sets (owner, 2026-10-05)

The owner: The Interior is "our first real model that will set up the
complexity standard". Roles, guides and any pilot count apply to The
Interior **only for now**; once they have landed and flown, what was
learned is carried to Defend the Paraná and later work. So:

- **Campaign agnostic modules, data per campaign.** The role system
  (N16), capture (N5), the quiet HUD (N7), objective cards (N6) and guide
  routing (N16) are written as modules that read a campaign's data and
  know nothing of The Interior: no Interior names, ids, voices or
  platforms in their code. The Interior is their first data set; Itaipu
  can adopt them later by writing data, not by forking code.
- **What each phase learns** goes into `LESSONS.md` in this folder as the
  phase lands, so the port to Itaipu starts from evidence. This document
  does not plan that port.

## 1. Found while planning: what PLAN.md and the brief assumed, checked against the code

| # | The assumption | What the code says | What this plan does |
| --- | --- | --- | --- |
| F1 | PLAN 4: classification states "are a field on the existing tracks, not a second contact system". | `src/avionics/tracks.js` is a **per screen** tracker of **air objects**: its classes are `fixed_wing_uav, loitering_munition, multirotor, light_aircraft, boat, unknown` (`perception.js` CLASSES), a track is stale after 0.6 s, dropped after 2.5 s, a ghost for 3 s (`STALE_S`, `COAST_S`, `GHOST_S`). It never reads ground truth and is not room state. | The Interior's people and vehicles are a **room owned contact registry** (N13): authored, with discovered, classification, last known position and lost since, the same for every pilot. The screen's tracker may draw the live box over a contact a pilot is looking at; it never owns a classification. The script's loss thresholds are tens of seconds, not 2.5. |
| F2 | PLAN 8: "a solo pilot switches between all of them by hot swap". | The hot swap (`src/main.js`, "THE HOT SWAP: another aircraft, now, where this one is") replaces the one aircraft in flight with another at the same spot. Only one aircraft is ever alive per pilot, and there is no autopilot that could keep an unattended one flying (no orbit or hover hold in `src/`). | M2_01, M2_05, M3_05 and M5_06 need the ISR still orbiting, or the relay still on station, while the pilot flies another. N15 builds **platform holds**: several aircraft alive per pilot, the unattended ones on a scripted hold (a fixed wing orbiting a point, a quad hovering or returning), and switching view and sticks between them. Mission 1 needs one aircraft per pilot, so N15 is M2, not Phase 0. |
| F3 | PLAN 4: the sensor manager gives "zoom, stabilisation". | `src/avionics/sensors.js`: the sensor is the pilot's own camera; `ZOOM_LEVELS = [1, 2, 4]`, a digital crop. Nothing slews it. The Bramor's blurb says "a camera ball in its nose", but no code points it. | Survey, orbit and capture, and M1_08's "camera reaches required angle", need a **camera ball** (N14): slew, a ground point lock that holds a spot while the aircraft orbits, and a longer zoom (the mocks show 8x). Phase 0. |
| F4 | PLAN 4: missions are "stages opened by events" on `src/share/war/stages.js`. | True, and the engine is good, but its triggers are the war's: `born`, `killed`, `leaked`, `cleared`, `down`, `crossed` count **attackers**, and the match is lost "the instant the output is under floorMw". The useful general ones are there: `time`, `region` (pilot poses in a cylinder, held for ms), `objective`, `held`, `visited`, `ready`, `any`, `all`. | N6 adds the Interior's facts as triggers on the same engine: `seen`, `captured`, `lost`, `classified`, `alert`, `linked`, `post`, `chosen` (section 2.2), and a mission level loss rule that is not an output floor. `region` already shows the room reading pilot poses at the frontier; `seen` is built the same way, with N2's line of sight. |
| F5 | PLAN 5 N9: the room films on "the room's monitors, maps and stills". | `src/share/war/film.js` has world cameras (dolly, crane, orbit, handheld, drone, telephoto) and one 2D insert, SCOPE (the war's radar). Nothing draws a map with layers, a still, or a split screen. | N18 adds a **BOARD** insert to the film timeline: map layers that appear and hide, stills (authored and the player's own captures), an archive match side by side, a split screen, alerts. M2's intro in the treatment is body camera footage of personnel walking through the empty camp; under answer B it becomes ground level footage of the empty camp only (the pot, the rope), no figure (INTROS.md). |
| F6 | PLAN 3: Missions 2 to 5 "show Under development". | `src/game/campaign.js`: `'development'` means "has code in the build", and a developer's rooms server lets it start (`released(id, dev)`); `'soon'` means "only planned, has no mission file". M2 to M5 will have no mission file until their build. | The Interior's rows are M1 `'development'` until 100 %, then `'available'`; M2 to M5 `'soon'` in the gate's meaning, with the card's label string reading **Under development** as the owner asked (N20). The gate's meaning is kept; only the word on the card follows the owner. |
| F7 | PLAN 4: Alps fauna for "cattle, workers, a dog: ambient life". | `src/maps/alps/fauna.js`: "decoration on the wall clock", not deterministic, not room state. | Fine for ambient life nobody can classify (M1's cattle, the workers by the machines). Anything a pilot may classify, follow or strike is a contact (N13) on the room clock (N3). |
| F8 | N10: "Four voices". | The script also speaks the archive recordings (opening film), an external ground COMMANDER (M5_11, END_C) and a news reader (END_A). | Four cast voices plus three one off voices (N10), generated and licence checked the same way. |
| F9 | Act 1's radio rule "no spelled number that reads as a quantity" (`tools/voice/script.py` comment, BIBLE rule 5). | The checker enforces digits only. The owner's Interior script speaks "Twelve", "Fourteen", "forty-eight hours", "Eleven o'clock". | The Interior keeps the owner's spelled numbers (they carry the story: fourteen people). No digit is ever spoken, so the checker passes. Recorded in BIBLE.md. |
| F10 | "Infinitely multiplayer" (owner addendum). | `edge/rooms/core.js` `PRIVATE_CAP = 8`; `src/share/roomwire.js` `PUBLIC_CAP = 16`; `edge/rooms/node.js` `roomCap` up to 64 for `scripts/rooms-load.js` only. | The mission logic has no upper bound (N16): roles are dealt from a list whose scaling roles repeat. The real ceiling today is 8 in a private room and 16 in a public one. Raising it is a server and load question of its own, not part of this campaign. |
| F11 | PLAN 6: the Bramor "M1 onward" as the ISR. | `configs/airframes.js` `bramor2300`: catapult, chute, `topSpeed: 25.0` m/s, `stall: 13`. Good for an ISR. | Kept. The mocks' speeds (98 to 104 kt) are art, not a target. |
| F12 | Time of day. | `?time=` and `options.time` are Itaipu's (`src/main.js` near line 617); M1 wants late afternoon into sunset, M3 dusk into night, M5 pre dawn into sunrise. | N1 includes the Interior map's own time of day and a sun that moves across a mission on the room clock. |

## 2. The parts

### N1. The Interior map (P0: the M1 corridor; the rest per mission)

- **Today:** streamed tile maps exist (Itaipu, Yellowstone pipeline); no
  Interior map.
- **Build:** ~16 x 16 km of recognisably northern Paraguayan land from
  open elevation and land cover data with a GPLv3 compatible licence,
  credited; **invented** roads, settlements and buildings on it, named
  only with BIBLE.md section 2's invented names; no real place name, no
  real coordinates in any string, texture or file name. Layout and each
  mission's places: MISSIONS.md section 1.9.
- **Phase 0 scope:** the M1 corridor only: Pista Cero, Sector Alpha
  (fields, Puente Doble, the road stretch, the sheds, the burned field),
  Sector Bravo (Colonia Arroyo Manso, the schoolteacher's house on the
  arroyo), Sector Charlie (the forest edge, the anomaly corridor, the
  drainage line), Claro Viejo and the return corridor.
- **Time of day** on the room clock, from a mission's start time, moving
  the sun across the mission (M1: 16:40 to sunset).
- **Checks:** `interior:views` (budget 300 draw calls, 2.5 M triangles,
  as Itaipu), `interior:collide` sweep, photo loop rounds as swiss2 and
  Itaipu; a name lint that fails any string in the map's data not in the
  BIBLE's list.
- **Size:** XL (corridor L in Phase 0, the rest M per mission).

### N2. Canopy that hides people (P0)

- **Build:** one pure function `visible(from, point)`: open, blocked by
  crowns, or through a gap; thermal sees through gaps only. Deterministic,
  the same in Node and the browser, so the room can ask it (N6 `seen`).
- **Check:** `canopy:los`: authored points under canopy, in gaps and in
  clearings, each seen or not seen as expected from a set of orbits.
- **Size:** L.

### N3. People on foot (P0: walk, stand, look up, carry, sit; later poses per mission)

- **Build:** low detail figures, instanced, decimated at range, on
  **authored routes** on the room clock (never free roaming): a route is
  a list of points with dwell, pose and speed, so the room and every
  screen place each person identically. Ambient people nobody classifies
  may stay screen side decoration (F7).
- **Poses by mission:** M1 walk, stand, look up, carry a long object,
  sit, crouch to move a tarp, take down an antenna, push a motorcycle.
  M2 add stand by a motorcycle, ride, hand over a small object, collect
  an item. M3 add unload a pickup (family, children as small figures),
  close a gate, conceal and watch, use a handheld radio, run. M4 add
  carry a crate, refuel, load a vehicle, observe with optics. M5 add
  carry boxes, unload containers.
- **No harm shown, ever** (PLAN 9 A): a person stopped by a strike is
  removed during the white out; nothing is drawn after it.
- **Check:** `people:route`: every authored route walked on the sim
  clock, the same positions in Node and the browser.
- **Size:** L (Phase 0), M per later mission.

### N4. Vehicles (P0: one motorcycle, one pickup; later per mission)

- **Build:** vehicles on road splines and trails, authored like people.
  Later: trucks, look alike pickups (M3_04), the decoy swap (M4_02: one
  enters a structure, several leave) as authored data, a convoy (M2_03),
  traffic (M4_01), the archive vehicle (M5_09).
- **Check:** `vehicles:route`; `vehicles:decoy` runs the M4 swap
  headless and proves which leaver is the target in every seeded variant.
- **Size:** M (Phase 0), M per later mission.

### N5. Capture (P0, campaign agnostic)

- **Build:** centre, zoom, hold, capture. A still is scored from the
  sensor's own numbers: the item's size in frame, its centring, its
  occlusion (N2), motion blur from the camera's rates. Grades: clean,
  usable, poor. The screen proposes a capture; the **room validates** it
  against the pilot's pose, the camera ball's pointing and line of sight,
  then records it (the item, the grade, the seat, the room ms, the
  framing numbers) so the debrief (N8) can show it on every screen.
  Captures are room state: one pilot's capture counts for the squad.
- **Data per campaign:** capture items are mission data (`{ id, at,
  size, minGrade, kind }`); the module knows nothing else.
- **Check:** `capture:score`: synthetic frames with known framing give
  the expected grade; a forged capture from the wrong pose is refused.
- **Size:** M.

### N6. Objectives, mission rules, checkpoints (P0, campaign agnostic)

- **Build on `stages.js`**, which already gives stages, exits, cues,
  seeded draws, holds and the room clock. Add:
  - **Triggers** (MISSIONS.md 1.2): `seen`, `captured`, `lost`,
    `reacquired`, `classified`, `alert`, `linked`, `post`, `chosen`,
    `dwell` (a camera held on a place), `boundary`.
  - **Objective cards**: primary, secondary, optional; the card texts
    are string keys; the card events of the script ("PRIMARY OBJECTIVE
    UPDATED", "CONTACT CLASSIFICATION UPDATED", "INTELLIGENCE ADDED",
    "MISSION RULE") as one card type each. Objectives may be scoped to a
    role (N16) so each pilot sees their own.
  - **A mission level loss rule** in place of `floorMw`: a mission names
    its fails as triggers (`lost: [{ trigger, why }]`); the war keeps
    its floor.
  - **Checkpoints**: the script's checkpoint names are stage ids; a lost
    mission restarts from the last checkpoint reached, with the state it
    had there (Act 1's restart rule, T1.14 there).
  - **Boundary**: a warning at the edge, a final warning, a fail after
    it (the script's "leaves operational boundary after final warning").
- **Check:** `interior:stages`, a selftest like `war:stages`: every
  mission's graph reaches every exit, every trigger fires at the same
  room ms on a laggy and a zero latency run.
- **Size:** L.

### N7. Interior HUD mode, the quiet HUD (P0, campaign agnostic)

- **Build:** a HUD mode that draws **no marker for an undiscovered
  contact**: search areas, last known position circles, bearing hints,
  the objective cards (N6), classification labels only once the room
  has them. Look per the mocks: survey box, gimbal angles (N14), the
  EO / IR / MAP / TGT row, the IR inset, a minimap with scale, alt, speed,
  heading, local time. Never the mocks' coordinates or area name.
  Faction colours appear only once M4_05 has earned them.
- **Data per campaign:** which marks a campaign may draw and when;
  Itaipu's loud markers stay Itaipu's data.
- **Check:** `interior:hud` shots at every device size; a headless check
  that no mark is drawn for a contact whose room state is undiscovered.
- **Size:** L.

### N8. Debrief over the player's stills (P0)

- **Build:** the debrief shows the squad's own captures from the room
  record (N5), each credited to its seat; where a required one is
  missing, an authored **analyst reconstruction** frame (M1_10's rule)
  marked as such. Stars, flags and the next mission's lock state.
- **Check:** `interior:debrief`: a run with and without the symbol
  capture shows the player's frame or the reconstruction.
- **Size:** M.

### N9. The room films, faceless (P0 for M1's films)

- **Build:** the films are told on the room's monitors, maps and stills
  (PLAN 9 B): the BOARD insert (N18), a few world shots, and at most a
  hand on a table or a monitor's edge in a handheld shot. No face, no
  figure. Timed by the four voices like every film (film.js).
- **Checks:** `films:lint`, `films:time`, `film:world` (existing), plus
  N18's own.
- **Size:** M per mission's films (the BOARD itself is N18).

### N10. The voices (P0: all four, the archive voices; M5: the commander, the news)

- **Build:** Vega, Ibarra, Rojas, Ferrer in `lines.json` (or a sibling
  file for this campaign, the pipeline's choice), en and es, generated
  like the war radio, each take chosen by ear, licence checked against
  GPLv3 as before. Three one off voices: **ARCHIVE** (two or three old
  radio voices, heavy band limit, opening film), **COMMANDER** (an
  external ground commander, M5), **NEWS** (a reader under a room's
  noise, END_A).
- **Checks:** `voice:check` (the ustedes check, no digit, no dash).
- **Size:** M (Phase 0), S each later mission's lines.

### N11. Relay and interference as story (M3, M5)

- **Build:** owner rule of 4 October, "story moments only": the relay is
  a placed volume the stage checks (`region` with `ms`), the forward
  feed's degradation a scripted picture effect while it is unmet; M5's
  disruption a scripted effect on named seats' pictures and on the
  contact registry's confidence display for a window. Dormant
  `src/game/signal.js` may be reused for the look only. No RF model, no
  link loss in the flight model.
- **Check:** stage selftests (N6).
- **Size:** M.

### N12. Strike, interceptor, enemy drones (M3 to M5)

- **Build:** strike per PLAN 9 A. The strike platform's warhead is safe
  unless the contact under its reticle is HOSTILE CONFIRMED in the room
  or an authorized target (M5_11). Presentation: sensor white out,
  "Threat stopped", the contact removed during the white out, no body,
  no gore, no slow motion, no kill banner, no score jingle. A HOSTILE
  CONFIRMED that was a pilot's own wrong designation (MISSIONS.md 1.6)
  struck is a civilian or friendly error: a consequence, never a reward.
  Interceptor and enemy drones reuse the war's air combat (kamikaze
  quads, `routes.js` flights, `warhunt.js` behaviours), drawn in N7's
  quieter style.
- **Check:** `interior:strike` rows: refused before confirmation; a
  wrong designation struck sets the error flag; no aftermath drawn.
- **Size:** L.

### N13. The contact registry (P0, campaign agnostic)

- **Build:** room state, one record per authored contact (person,
  group, vehicle, aircraft, item site): `{ id, kind, route, faction
  (hidden truth), state: undiscovered | seen | lost, class (one of
  BIBLE.md section 6's states), lkp, lostSince, seenBy, evidence }`.
  Updated on the judgement's frontier from N2 and the pilots' camera
  balls; drives N6's triggers and N7's marks. The truth (faction) never
  reaches a screen before the class does.
- **Check:** `contacts:selftest`: a scripted run where a contact is
  seen, lost past the soft and hard thresholds, reacquired, classified;
  every pilot's view agrees.
- **Size:** L.

### N14. The camera ball (P0)

- **Build:** a gimbal on ISR and recon platforms: slew on a stick or the
  mouse, a ground point lock (the camera holds a point on the ground
  while the aircraft orbits), zoom to at least 8x (optical in the story,
  the picture's own pixels honest about it), the angles shown on the HUD.
  The sensor manager's modes (EO, white hot, black hot, low light,
  fusion) stay as they are.
- **Check:** `camera:lock`: an orbit of the Bramor at survey altitude
  keeps a locked point inside 1 % of frame centre; the pointing used by
  N5 and N13 equals the picture's.
- **Size:** L.

### N15. Platform holds: several aircraft alive per pilot (M2)

- **Build:** a pilot may have more than one aircraft alive; the one not
  flown is on a hold: a fixed wing orbits a point at its altitude, a quad
  hovers or returns along its path. Switch view and sticks between them
  (a key, a pad button, a tap); the HUD shows each one's state. The old
  hot swap stays for free flight.
- **Check:** `platforms:hold`: a Bramor on hold orbits for ten minutes
  within its radius; a switch hands the sticks over without a jump.
- **Size:** L. Not Phase 0 (F2).

### N16. Roles, deal and guides (P0, campaign agnostic)

The owner's addendum (2026-10-05): "infinitely multiplayer with
different roles and guides ... it doesn't matter if I play one person or
6 people ... randomized what roles you play ... choose which role you fly
or ... change the role". The design is MISSIONS.md section 1.5; this is
what it needs.

- **Role registry (data per campaign, per mission):** `roles: [{ id,
  platforms, guide, objectives, core: true | false, scale }]`. A **core**
  role must be held for the mission to work (one pilot may hold several);
  a **scaling** role repeats for every pilot past the core count, each
  copy with its own assignment (a search box, a second track, a second
  relay volume, an extra interceptor). No fixed upper bound in the data
  or the code.
- **Deal:** at the mission's start the room deals roles from the seed:
  core roles first, spread over the pilots (a solo pilot holds them all,
  one active at a time), then scaling copies. Recorded in the match like
  every draw, so a late joiner and a restore agree.
- **Change:** a pilot may take any free role at any time; a swap with
  another pilot is a request both accept; the host may lock roles. Locked
  beats (the room refuses a change): MISSIONS.md 1.5.
- **Joins and leaves:** a joiner takes the first unheld core role, else
  a new scaling copy; a leaver's core roles pass to the pilot holding the
  fewest, their aircraft to holds (N15) or, before N15, landed.
- **Guide routing:** every radio line is tagged `all` (heard by
  everyone: story lines, Vega's command calls) or a role; a role's
  guide lines play only on screens holding that role; objective cards
  likewise. A solo pilot hears every guide.
- **Check:** `roles:deal`: a headless room at 1, 2, 3, 6 and 8 pilots
  (and 16 on a public room) proving every core role is dealt, every
  pilot holds at least one role, a free take and a two party swap work,
  locked beats refuse, a leaver's core role passes on, and a 1 pilot run
  finishes Mission 1.
- **Size:** L.

### N17. Alert and standoff (P0)

- **Build:** a site's **alertness** (M1's camp, M2's property and
  second camp, M4's meeting): rises while aircraft are inside its
  standoff (below an altitude band, inside a radius, the quad within
  hearing range), falls outside it; crossing a threshold fires `alert`
  (N6). More aircraft close in raise it faster, so a big squad must keep
  discipline too.
- **Check:** in `interior:stages`: an orbit at standoff never alerts the
  camp before the timer; a low pass does.
- **Size:** S.

### N18. The BOARD film insert (P0)

- **Build:** a 2D insert in `film.js` beside SCOPE: a sector map of the
  Interior (invented names only) with layers that fade in and out on
  anchors (sectors, roads, routes, contacts, faction layers), stills in
  frames (authored stills; the player's own captures from the room
  record at the film's start, with the authored fallback), an archive
  match (two stills side by side, a SEARCHING line), a split screen, an
  alert banner, timestamps. Its contents are named in the film data so
  `films:lint` can hold them to their shots.
- **Check:** `films:lint` extended; `board:render` draws every BOARD
  shot of every Interior film headless and fails a missing still or an
  undefined layer.
- **Size:** M.

### N19. The final decision as actions (M5)

- **Build:** M5_11 without a menu: EXECUTE is the strike platform
  engaging the authorized archive vehicle; PRESERVE is a hold on the
  archive with the transmit action until ARCHIVE TRANSFER COMPLETE;
  FOLLOW is neither within the window, the vehicle leaving and a pilot
  following it. The host's seat makes the choice (PLAN 8); the room
  records `M5_FINAL_CHOICE`.
- **Check:** `interior:choice`: each of the three actions, and the
  window's expiry, records the right value and opens the right ending.
- **Size:** M.

### N20. The campaign shell for The Interior (P0)

- **Build:** a second campaign list beside `ACT1` (`INTERIOR`, ids
  `interior-1` to `interior-5`), the same release gate, stars from
  each mission's three optional objectives, the script's flags in the
  synced progress section (merge: a flag once true stays true; the
  final choice keeps the latest), the seen films. No credits, no shop:
  platforms unlock by mission. The consent screen the war shows (armed
  conflict). The card lists all five; M1 is `'development'` until the
  owner calls it 100 %, then `'available'`; M2 to M5 `'soon'` with the
  label **Under development** (F6).
- **Check:** `campaign:selftest` and `campaign:check` extended: the gate
  refuses `'soon'` and `'development'` on the live server; flags merge.
- **Size:** M.

### N21. Ambient world (P0 for M1)

- **Build:** the civilian world the script asks for, outside the
  contact registry: cattle, workers near machines, a family outside a
  house, a motorcycle on the public road, a tractor. Screen side, cheap
  (F7), never something a pilot can classify. M3 to M5 add traffic,
  which is contacts when it can be confused with a target (M4_01).
- **Check:** `interior:views` counts it in the budget.
- **Size:** M.

### N22. Music in layers per identity (P0 for THE INTERIOR theme)

- **Build:** three identities (BIBLE.md section 8): THE INTERIOR (P0),
  THE COLUMN (P0, the camp and the symbol), THE NETWORK (M4). Layers
  crossfaded on cues, with silence as a cue of its own (the script: "use
  silence aggressively").
- **Check:** the war's music check, extended to the Interior's beds.
- **Size:** M (P0), S per later identity.

### N23. Props and assets

Listed per mission in section 3; each made low detail, instanced where
repeated, checked by `interior:views`.

## 3. What each mission needs beyond the one before

### Mission 1, The Old War: Phase 0, everything marked P0

| Need | Parts | Check | Size |
| --- | --- | --- | --- |
| The M1 corridor, its time of day (16:40 to sunset) | N1 | `interior:views`, `interior:collide`, name lint | L |
| Canopy line of sight | N2 | `canopy:los` | L |
| People: walk, stand, look up, carry a long object, sit, crouch at a tarp, take down an antenna, push a motorcycle | N3 | `people:route` | L |
| One motorcycle (and the camp's three or four of it), one pickup | N4 | `vehicles:route` | M |
| Capture | N5 | `capture:score` | M |
| Stages, new triggers, cards, checkpoints, boundary, the mission loss rule | N6 | `interior:stages` | L |
| Quiet HUD | N7 | `interior:hud` | L |
| Debrief over stills, the reconstruction frame | N8 | `interior:debrief` | M |
| Contact registry | N13 | `contacts:selftest` | L |
| Camera ball | N14 | `camera:lock` | L |
| Roles, deal, swap, guide routing (M1's roles: ISR, TRACKER) | N16 | `roles:deal` | L |
| Camp alertness and standoff | N17 | in `interior:stages` | S |
| BOARD insert; the opening film, M1 intro and outro | N18, N9 | `films:lint`, `films:time`, `board:render` | M |
| Four voices, the archive voices, M1's lines in en and es | N10 | `voice:check` | M |
| Campaign card with all five, flags, consent | N20 | `campaign:selftest`, `campaign:check` | M |
| Ambient world for M1 | N21 | `interior:views` | M |
| THE INTERIOR and THE COLUMN beds | N22 | music check | M |

**Assets, M1:** Pista Cero (a catapult rail on a cleared strip, a
recovery field, a container and a tent: the temporary operations site
seen in the films' world shots), Puente Doble (a two span concrete road
bridge over the river), the sheds of Sector Alpha (a grain silo and two
open sheds), a burned field (a decal and a fire scar line), a damaged
road stretch (washout, potholes), Colonia Arroyo Manso (fifteen to
twenty low houses, a school, a small football pitch, fences), the
schoolteacher's house by the arroyo, agricultural machines (a tractor, a
harvester parked), cattle; the camp at Claro Viejo: four shelters of
poles and **tarps** (one tarp movable, with the Column mark painted on
the underside of its shelter's roof), a mast **antenna** that can be
taken down, a small **solar panel** on a stand, three or four
**motorcycles**, cooking gear, water drums, crates, hammocks, a lookout
position (a platform in a tree at the clearing's edge), the access
path; the Column mark (BIBLE.md section 9) as a faded painted texture.

### Mission 2, Eyes in the Forest

| Need | Parts | Check | Size |
| --- | --- | --- | --- |
| The recon quad, picked from `7inch`, `10inch`, `interceptor` by flight feel under canopy (PLAN 6) | platform data | an owner flight | S |
| Several aircraft alive per pilot, holds, switching | N15 | `platforms:hold` | L |
| Close range capture prompts ("SCAN / CAPTURE only within close range") | N5 growth | `capture:score` rows at 2 to 10 m | S |
| Quad detection by the returning contact (sound and sight cone) | N17 growth | in `interior:stages` | S |
| Map: the three observation zones, Cruce Tranquera, Loma del Vigía, Corral Viejo, Estancia La Ceniza, Claro Nuevo, the convoy road | N1 | `interior:views` | M |
| Poses: stand by a motorcycle, ride, hand over, collect an item | N3 | `people:route` | S |
| A friendly convoy (three vehicles), more motorcycles (newer models for Claro Nuevo) | N4 | `vehicles:route` | S |
| A branch on a player's choice (follow A or B) | N6 (`chosen`) | `interior:stages` | S |
| Roles: ISR, RECON, TRACKER | N16 data | `roles:deal` at 1 to 8 | S |
| M2 films (ground level empty camp, split screen, alert) | N9, N18 | films checks | M |
| Ferrer's voice joins in mission | N10 | `voice:check` | S |

**Assets, M2:** the emptied Claro Viejo at close range (extinguished
fire with ash, a cut cable, impressions where equipment stood, tyre and
foot tracks, the observation diagram scratched on a board, old
batteries, food packaging, a cooking pot, a hanging rope that swings),
Estancia La Ceniza (an overgrown yard, a house with a broken roof, old
farm equipment, a battery stash, a radio set, notes pinned on a wall),
Claro Nuevo (more disciplined spacing, newer tarps, a newer radio and
antenna, consumer electronics, better batteries, newer motorcycles).

### Mission 3, No Man's Land

| Need | Parts | Check | Size |
| --- | --- | --- | --- |
| Strike platform and the abstract strike | N12 | `interior:strike` | L |
| Pilot designation ("CONFIRM IDENTIFICATION") and the error flags | N6, N13 | `interior:stages` | M |
| Relay volume and the forward feed's story degradation | N11 | stage selftests | M |
| Enemy surveillance quad (observes, repositions, can be intercepted) | N12 | `interior:strike`, war harness rows | M |
| The post's condition (holds or collapses) as room state | N6 (`post`) | `interior:stages` | S |
| Night: dusk into dark, thermal first | N1 time of day | `interior:views` at night | S |
| Map: Puesto Arenal, the farmhouse, the roads, culverts, the marsh edge, the northern exit | N1 | `interior:views` | M |
| Poses: unload, children, close a gate, conceal, radio, run | N3 | `people:route` | M |
| Three look alike pickups, a police motorcycle, the suspicious parked vehicle | N4 | `vehicles:route` | S |
| Roles: ISR, RECON, STRIKE, RELAY, TRACKER, INTERCEPTOR (if unlocked: here optional) | N16 data | `roles:deal` | S |
| M3 films | N9, N18 | films checks | M |

**Assets, M3:** Puesto Arenal (a fenced post, a gate that closes, a
small building, a mast, sandbags), abandoned vehicles across a road, a
farmhouse, a temporary command site (a tarp shelter, a radio operator's
table, hidden motorcycles, route markers on trees), the enemy quad (a
cheap consumer shape, unmarked).

### Mission 4, The Other War

| Need | Parts | Check | Size |
| --- | --- | --- | --- |
| Traffic that can be confused with the target | N4, N13 | `vehicles:route` | M |
| The decoy swap in the covered structure | N4 | `vehicles:decoy` | M |
| Three factions' marks, earned at M4_05 | N7 data | `interior:hud` | S |
| Several simultaneous tracks; "any two of three" | N13, N6 | `interior:stages` | S |
| Counter surveillance drone that searches for friendly aircraft | N12 | war harness rows | M |
| Ground intercept support (friendly ground team as contacts that react to the picture) | N13, N3, N4 | `interior:stages` | M |
| Map: Ruta Nueva, the fuel stop, Galpones del Cruce, La Pista Larga, Silo Viejo, the river crossing | N1 | `interior:views` | L |
| Roles: add GROUND SUPPORT; INTERCEPTOR becomes core | N16 data | `roles:deal` | S |
| THE NETWORK music | N22 | music check | S |
| M4 films | N9, N18 | films checks | M |

**Assets, M4:** cleaner Network vehicles (two SUVs, a box truck), the
covered structure with several look alike vehicles, a fuel stop,
warehouses, an old airstrip, crates, document cases, fuel cans, the
storage structure at Silo Viejo with regional maps, ledgers,
photographs, communication devices (none of them readable as real
documents).

### Mission 5, The Last Column

| Need | Parts | Check | Size |
| --- | --- | --- | --- |
| Scripted feed disruption on named seats and on confidence display | N11 | stage selftests | M |
| Several enemy drones contesting the air | N12 | war harness rows | S |
| The final decision as actions, host's seat | N19 | `interior:choice` | M |
| Three endings and the final cinematic reading the flags | N9, N18, N20 | films checks | L |
| The stinger (a hand, a battery, a laptop) | N9 | films checks | S |
| COMMANDER and NEWS voices | N10 | `voice:check` | S |
| Map: Rincón Quemado, Rancho Sin Nombre, Vado del Manso, the west, south east and north exits | N1 | `interior:views` | M |
| Poses: carry boxes, unload containers | N3 | `people:route` | S |
| Fourteen people at the gathering, all authored | N3, N13 | `contacts:selftest` | S |
| Roles: every role, all three music identities overlapping | N16 data, N22 | `roles:deal` | S |

**Assets, M5:** Rincón Quemado (several small structures, covered
vehicles, a generator, a concealed antenna, storage containers,
temporary shelters), the older ordinary archive vehicle, the **archive
boxes** (open cardboard and metal boxes: old photographs, faded insignia
of the Column mark, notebooks, obsolete radios, printed records, a few
newer papers), the stinger's table (a cheap consumer drone, a battery, a
laptop).

## 4. What the script asks that the engine should not do, and the faithful alternative

| Beat | The script | Why not literally | What we do instead |
| --- | --- | --- | --- |
| M2_00 body camera | "Ground team enters camp"; personnel on body camera | PLAN 9 B: room films faceless | Ground level footage of the empty camp only: the pot, the rope swinging, the lens moving like a body camera, no figure in frame; Rojas's lines over it |
| M3_00 intro, people at the post | "Personnel closing gates. Civilians leaving." | Figures are allowed from the air, not in the room | Shot from high, through a long lens, as a drone or a mast camera would see it: small figures, never a face |
| M3_05, M5_06 link and interference | "fictionalized connectivity", "feeds degrade" | Owner rule: no RF or jamming model | Story effects only (N11) |
| M5_11 "actions rather than menu if possible" | Possible | | N19 |
| M5 END_A news audio over the operations room | People in a room | Faceless | A radio's speaker and the BOARD; the news as audio only |
| M3_03 strike | "Fictionalized strike drone gameplay" | PLAN 9 A | N12, abstract |
| Faction colours "may now be used after player has earned them" | | | N7 data, from M4_05 |
| "Optical zoom" of a real camera ball | | | N14, honest digital and optical zoom |
| The opening film's length (archive audio, stills, a drone camera activating, the title) | Likely over 75 s | `films:lint` holds a film to 30 to 75 s (`FILM_MAX_S`) | The opening is its own film (the campaign's prologue, played once before M1's intro the first time), each inside the bound; no threshold changes |
