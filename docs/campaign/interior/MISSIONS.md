# The Interior: the missions

Written 2026-10-05. The five missions of The Interior, each planned to
the depth needed to build it later without re-planning, on the model of
Defend the Paraná's Act 1 (docs/campaign/MISSIONS.md). The world, the
voices, the HUD words and the mark are BIBLE.md; each mission's films are
INTROS.md; the engine parts cited as N1 to N23 are TECH-NEEDS.md.

**Scope (owner, 2026-10-05):** only Mission 1 is built now, to
completion. Missions 2 to 5 are planned here in full and show **Under
development** until each is built and opened, one at a time.

**Source:** the owner's in game mission script v1.0 is the authority for
every trigger, objective, flag, checkpoint and line below. Lines are kept
in meaning; a few are tightened; the cut off "Major" is written without a
dash. Lines marked **(new)** are the lead's, written only where the
script needs a voice it does not give (a boundary warning, a role's
guide, a fail), each in the voice's manner and checked against the
script's rules. Nothing here is copied from the source files verbatim
beyond the owner's own dialogue.

## 1. The shared vocabulary

### 1.1 Stages and checkpoints

A mission is a stage graph on `src/share/war/stages.js` (N6). **The
script's checkpoints are the stage ids**: each stage starts at a
checkpoint and runs the script's sections up to the next one. A lost
mission restarts from the last checkpoint reached, with the state it had
when that stage opened (contacts, captures, flags so far), and stars
capped at two, as in Act 1. Between stages there is no lull by rule: the
Interior's pacing is the script's, often continuous; where the script
cuts, the stage says so.

### 1.2 Triggers the Interior adds

The war's general triggers stay (`time`, `region`, `objective`, `held`,
`visited`, `ready`, `any`, `all`). The Interior adds (N6, N13, N17):

| Trigger | Fires when |
| --- | --- |
| `seen(C)` | contact C is inside a pilot's camera frame, not blocked by canopy (N2), at enough pixels to be noticed (N14 zoom), for 0.5 s: its state becomes `seen` |
| `discovered(C)` | the first `seen(C)` of the match |
| `captured(I, grade?)` | the room accepted a capture of item I at or above the grade (N5) |
| `capturedN(set, n)` | n items of a set captured |
| `lost(C, s)` | contact C has been out of every pilot's view for s seconds |
| `reacquired(C)` | `seen(C)` after a `lost(C, soft)` |
| `classified(C, state)` | C's class became that state |
| `alert(site, level)` | a site's alertness crossed a level (N17) |
| `linked(C, D)` | contacts C and D within a few metres of each other, both seen (a meeting) |
| `dwell(place, s)` | a pilot's camera held on a named place for s seconds (the "stares at house" line) |
| `boundary(level)` | a pilot crossed the operational boundary's warning or final line |
| `post(state)` | M3's post condition reached `steady`, `pressed` or `critical` |
| `chosen(branch)` | which branch a player choice took (M2's A or B, M5's decision) |
| `route(C, point)` | contact C reached a named point on its authored route |

### 1.3 Objectives, cards, stars, flags

- **Cards** (N6, BIBLE 6): primary, secondary, optional; each a string
  key; the card events as the script writes them. A card may be scoped
  to a role (1.5): that role's pilots see it; the squad's primary is
  everyone's.
- **Stars**: three per mission, each one of the mission's optional
  objectives, named in its section. A mission restarted from a
  checkpoint caps at two.
- **Flags**: the script's eleven (1.10), kept in the campaign's synced
  progress (N20). Achievements are recorded beside them.

### 1.4 Seeded dials: variation that never breaks the story

Each mission turns dials from the match's seed (`stages.js` `draw`),
recorded in the match so every pilot and a restore agree. A dial chooses
between **authored** variants only: which of two or three concealment
routes, which shelter carries the mark, a time inside a window, where
ambient life stands. **Never varies:** the stage order, the story's
beats, which contact is the real one, the lines, the endings. Each
mission lists its dials.

### 1.5 Roles, guides and any number of pilots

The owner's addendum (2026-10-05): "infinitely multiplayer with
different roles and guides ... it doesn't matter if I play one person or
6 people, we can all fly the same mission, but it will be randomized what
roles you play ... maybe you get to choose which role you fly or you can
change the role". Built as campaign agnostic data and code (N16).

**Roles, not just platforms.** A role is a job with a platform, a guide
voice, its own objective cards and its own radio. The set, across the
campaign:

| Role | Platform | Guide | Job | Kind |
| --- | --- | --- | --- | --- |
| ISR, "Survey One" | Bramor (fixed wing, camera ball) | IBARRA | the wide picture: survey, search, classify, the main track | core, every mission |
| TRACKER, "Survey Two, Three..." | a second Bramor | IBARRA | a second eye: another search box, a second track, a picket on a reacquisition point, another angle | scaling, every mission |
| RECON | the recon quad | IBARRA | close inspection under canopy, inside structures; stealth | core from M2 |
| RELAY | fixed wing loiterer | FERRER | hold the relay volume so a forward aircraft keeps its feed | core in M3's relay beat, M4, M5; a second copy scales |
| STRIKE | the strike platform | ROJAS (and VEGA's clearance to all) | the abstract strike, only on HOSTILE CONFIRMED or authorized | core from M3_03 |
| INTERCEPTOR | `interceptor` | FERRER | find and stop hostile air contacts that threaten the picture | optional in M3 from M3_07, core in M4 and M5; copies scale |
| GROUND SUPPORT | ISR or TRACKER platform | ROJAS | give the ground team the picture: roads, routes, what is moving toward them | core in M4_08 and M5 |

**Guides.** VEGA's command calls and every story line are heard by
**everyone** (`heard: all`). A role's guide lines (`heard: <role>`) play
only on the screens of the pilots holding that role, and its cards show
only there. A solo pilot holds every role and hears every guide. So each
pilot always has a clear job and a voice telling them about it, and the
story stays one story.

**The deal (lead decision, owner may change).** At the mission's start
the room deals roles from the seed: the mission's core roles first,
spread as evenly as the pilots allow (one pilot holds them all; two split
them; and so on), then one scaling copy for each pilot past the core
count. The deal is random because the owner asked for it; a pilot is
never stuck with it:

- **Take:** any pilot may take any free role (an unheld core role or a
  new scaling copy) at any time.
- **Swap:** a pilot may ask another to swap; both accept; done.
- **Host lock:** the host may lock roles for the rest of the mission.
- **Locked beats** (the room refuses any change during them): every
  film; M3_03 from CONFIRM IDENTIFICATION to the strike's outcome; a
  relay hold in progress (M3_05, M4, M5); M5_11's FINAL DECISION.
- **Joins and leaves:** a joiner takes the first unheld core role, else a
  new scaling copy; a leaver's core roles pass to the pilot holding
  fewest, and their aircraft go on hold (N15) or land.

**One pilot to the room's cap.** One pilot holds every core role, one
active at a time, switching aircraft (M1 needs only one aircraft; from
M2 the others wait on holds, N15). Two pilots and up split the core
roles. **Past the core count every extra pilot gets a scaling copy that
does real work**: another search box, a second track, a picket, a second
relay, another interceptor; never an idle seat. More pilots change
**coverage and air pressure, never the plot**: the authored contacts,
their routes and the lines are the same at one pilot or sixteen. What
scales: how much of the map is watched at once, how many simultaneous
tracks can be held, how many enemy drones search (M4, M5, where no line
counts them), the sites' alertness (more aircraft close in alarm a camp
faster, N17), and the timing windows (wider for small squads, Act 1's
rule: x1.6 at one pilot, x1.3 at two or three).

**The cap, honestly** (TECH-NEEDS F10): the room holds 8 pilots in a
private room and 16 in a public one today. Nothing in the mission logic
or the role data has an upper bound; raising the room cap is a server and
load question of its own.

Each mission gives its role table: minimum pilots, the useful maximum
(past which more pilots add redundancy rather than new coverage), what
each scaling copy does, and which beats need the host.

### 1.6 Identification and strikes (M3 onward)

PLAN 9 A, applied: a strike may target only a contact the room shows
**HOSTILE CONFIRMED**, or the one authorized target of M5_11. A contact
reaches HOSTILE CONFIRMED in one of two ways:

1. **Scripted evidence** (M3_02's historical correlation): the room sets
   it; Ibarra says it; the card shows it.
2. **A pilot's designation**: CONFIRM IDENTIFICATION on a boxed contact
   (M3_03, M3_04, M4_08). The room accepts it, the strike platform may
   then engage, and the room knows the truth. If the evidence was there,
   it is a correct identification. If it was not (a civilian pickup, the
   empty decoy), a strike on it is a **civilian or friendly error**:
   score penalty, the error flag, Rojas's and Ibarra's lines, and the
   world's consequence (the farmhouse's family stops, the post's people
   take cover). Two errors in a mission fail it (the script's "If
   repeated: Mission fail"). A designation alone, without a strike,
   costs only Ibarra's warning and a minor mark.

Presentation, always: the white out, `THREAT STOPPED`, the contact
removed during it, no aftermath. No celebration line; Vega: "Continue
observing."

### 1.7 Recovery: soft and hard thresholds

The script fails for loss of function, never for imperfection. Shared
defaults (tunable per mission in its data, measured in flights before
release):

| Rule | Default | What happens |
| --- | --- | --- |
| SOFT_THRESHOLD | a tracked contact out of every view for 20 s | the guide says it is lost; the HUD shows LAST KNOWN POSITION |
| HARD_THRESHOLD | 45 s | the contact is moved to an authored alternate reacquisition point; a hint line names the area; a SEARCH AREA card |
| Recovery windows | three hard thresholds in one stage | soft fail: restart from the stage's checkpoint |
| Discovery window | per beat (M1_04: 25 s after the corridor) | the guide prompts with a bearing hint and a search area |
| Boundary | warning line, then a final line 15 s later | leaving after the final warning fails the mission |

### 1.8 The radio

- **Ids:** `int<N>-<stage>-<slug>`, the mission's films `film-int<N>-<n>`,
  shared lines `int-<slug>`.
- **Columns:** id, cue (the trigger and offset), who, heard (all or a
  role), EN. Lines wait their turn in the radio's queue; a story line
  outranks a guide line; an end line outranks everything.
- **Spanish:** every line gets its es text in the same row of the voice
  file when it is generated (the brief: no es table now). Ustedes when the
  line addresses the players; usted between characters (BIBLE 0.8). Each
  mission's section notes where its es lines go.
- **Silence is scored.** The script: "Use silence aggressively". Gaps in
  the tables are deliberate.

Shared lines, every mission:

| id | cue | who | heard | EN |
| --- | --- | --- | --- | --- |
| int-boundary | `boundary(warning)` | VEGA | the pilot crossing | (new) Pilot, you're at the edge of the sector. Turn back. |
| int-boundary-final | `boundary(final)` | VEGA | the pilot crossing | (new) Last warning. Turn back now. |
| int-lost-aircraft | a platform destroyed while others remain | FERRER | all | (new) We lost that aircraft. Bring up another. |
| int-fail-function | a mission fail for lost capability | VEGA | all | (new) We've lost the picture. We go again. |
| int-take-role | a pilot took a free role | FERRER | that pilot | (new) Feed's yours. |

### 1.9 The map, authored once for all five

One map (N1), ~16 by 16 km. Positions are a design grid in km east and
north of the map's south west corner: scene positions for the builders,
never shown, never real coordinates.

| Place | Grid (km) | Missions |
| --- | --- | --- |
| Pista Cero (base, catapult, recovery field) | 3.0, 2.0 | all |
| Ruta Vieja (old dirt road), south west to north east | 1, 3 to 12, 12 | all |
| Río Sereno, from the west edge to the east edge in wide bends | 0, 10 to 16, 5 | all |
| Sector Alpha: fields, the sheds (silo, two open sheds), the damaged road stretch, the burned field | 4 to 7, 3 to 6 | M1, M5 film |
| Puente Doble (Ruta Vieja over Río Sereno) | 5.6, 7.0 | M1, M5 film |
| Sector Bravo: Colonia Arroyo Manso, pasture | 7.5 to 9.5, 6.5 to 8.5 | M1, M3 echo, M5 film |
| the schoolteacher's house on the Arroyo Manso | 8.9, 7.9 | M1 |
| Sector Charlie: Monte Cerrado's south edge | 9.5 to 12, 8.5 to 9.5 | M1 |
| ANOMALY_CORRIDOR (the transit between Bravo and Charlie) | 9.6 to 10.6, 8.2 to 9.0 | M1 |
| the concealment routes (three variants, about 800 m each) | 10.8, 9.1 to 11.8, 10.4 | M1 |
| the narrow opening (where the long objects show) | 11.3, 9.8 | M1 |
| the cañada (drainage line east of the routes) | 11.9, 9.4 to 12.1, 10.2 | M1 |
| Claro Viejo (the first camp) | 11.9, 10.5 | M1, M2, M5 |
| Senda del Vigía (the watchers' footpath) | 11.9, 10.5 to 6.0, 13.0 | M2, M3 |
| Loma del Vigía (ridge over Ruta Vieja) | 9.8, 11.4 | M2 |
| Cruce Tranquera (crossroads) | 8.2, 10.2 | M2 |
| Corral Viejo (abandoned corral) | 13.2, 8.4 | M2 |
| the convoy road (Ruta Vieja's north stretch) | 9 to 12, 10 to 12 | M2 |
| Estancia La Ceniza | 14.0, 12.4 | M2 |
| Claro Nuevo (the second camp) | 15.0, 14.6 | M2, M5 |
| Puesto Arenal (security post) and its marsh | 4.0, 14.0 | M3 |
| the farmhouse near the post | 5.2, 13.1 | M3 |
| the temporary command site | 6.8, 14.9 | M3 |
| the northern exit (the edge of coverage) | 6.5, 16.0 | M3 |
| Ruta Nueva (gravel road with traffic), along the west edge | 1.0, 1 to 1.0, 15 | M4 |
| Galpones del Cruce and the fuel stop | 1.4, 8.8 | M4 |
| La Pista Larga (old airstrip) | 13.5, 3.0 | M4 |
| the old observer's tree line | 14.3, 3.7 | M4 |
| Silo Viejo (storage) | 11.0, 1.8 | M4 |
| Rincón Quemado (the gathering) | 12.8, 12.9 | M5 |
| Rancho Sin Nombre (archive site) | 15.3, 11.0 | M5 |
| Vado del Manso (ford, ending C) | 10.2, 6.1 | M5 |
| exits: west, south east, north | 9, 13 / 15, 9 / 13, 16 | M5 |

Build order (N1): the M1 corridor first (Pista Cero, Alpha, Bravo,
Charlie, Claro Viejo, the return), then each mission's places as it is
built.

### 1.10 Flags and callbacks

| Flag | Set in | Read in |
| --- | --- | --- |
| `M1_SYMBOL_CAPTURED` | M1_08 | M1_10 debrief (the player's frame or the reconstruction); M2 intro callback |
| `M1_CAMP_FULLY_DOCUMENTED` | M1_09 | M2 debrief variation |
| `M2_ALL_WATCHERS_FOUND` | M2_09 | M5_01 (Ibarra names the bike) |
| `M2_SECOND_CAMP_UNDETECTED` | M2_06 pending, M2_08 true | M2 debrief |
| `M3_ZERO_CIVILIAN_ERRORS` | M3 end | M4 intro (Vega's line) |
| `M3_HOSTILE_DRONE_INTERCEPTED` | M3_07 | M4 intro (Ferrer's line) |
| `M4_TARGET_VEHICLE_NEVER_LOST` | M4_02 | M4 debrief |
| `M4_ALL_FACTIONS_TRACKED` | M4_06 | M4 debrief |
| `M4_CACHE_DOCUMENTED` | M4_09 | M5 (Network contacts named with more certainty) |
| `M5_ARCHIVE_COMPLETE` | M5_10 | the endings (richer evidence montage) |
| `M5_FINAL_CHOICE` | M5_11: EXECUTE, PRESERVE or FOLLOW | the ending; the final cinematic's inserts |

Achievements (recorded, not graded): EYES OPEN, HISTORY LESSON (M1);
THE WATCHERS, UNSEEN (M2); POSITIVE ID, NOT ALONE (M3); THREAD THE
NEEDLE, THREE STORIES (M4); THE WHOLE PICTURE (M5); EVERYONE IS LOOKING
(finish); YOU'RE LOOKING FOR THE TRUTH (PRESERVE after all major
intelligence objectives).

## 2. The campaign at a glance

| # | id | Title | Time | The player learns | New platform | New for the player | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `interior-1` | The Old War | late afternoon to sunset | I can see | ISR (Bramor) | survey, capture, tracking under canopy | build now |
| 2 | `interior-2` | Eyes in the Forest | morning to midday | I can follow | recon quad | two platforms, stealth, a choice of contact | planned, Under development |
| 3 | `interior-3` | No Man's Land | afternoon into night | I must identify | strike, relay, interceptor (optional) | classification under pressure, the first strike, the first enemy drone | planned, Under development |
| 4 | `interior-4` | The Other War | before dawn to day | I cannot watch everything | (all) | traffic, the decoy swap, three factions, counter surveillance | planned, Under development |
| 5 | `interior-5` | The Last Column | pre dawn to sunrise | seeing the truth does not tell me what to do with it | (full package) | everything at once, the disruption, the final decision | planned, Under development |

---

## M1. The Old War (`interior-1`): build now

**Type:** aerial survey and reconnaissance. **Tone:** quiet,
investigative, increasingly uneasy; almost too quiet. **Time:** 16:40
into sunset; the return at sunset. **Weather:** hot, hazy, light wind.
**Weapons:** none, and the HUD says so (MISSION RULE: ENGAGEMENT NOT
AVAILABLE). **Length:** 20 to 30 minutes, long enough for routine to
settle before the anomaly. **Unlocks:** Mission 2 (subject to its
release). **Platform unlocked:** the ISR, Bramor C4EYE (catapult,
parachute recovery).

**Loading card** (INTROS M1): "Most of the Interior is not empty. It
merely looks empty from the road." MISSION 01, THE OLD WAR, OPERATION
TYPE: AERIAL SURVEY, STATUS: ROUTINE.

**Briefing (campaign card).** EN: "Officially, the detachment is
updating infrastructure imagery across three sectors north of Pista
Cero: roads, bridges, towers, construction, vehicles. Unofficially,
people have been reporting strange activity for months. If you see
something unusual, mark it. Do not invent a story around it." The es
text goes beside it in the strings (ustedes: "Si ven algo inusual,
márquenlo. No inventen una historia alrededor.").

### Places used

Pista Cero, Ruta Vieja, Sector Alpha (the sheds, the road stretch, the
burned field), Puente Doble, Río Sereno, Sector Bravo (Colonia Arroyo
Manso, the schoolteacher's house, pasture), ANOMALY_CORRIDOR, Sector
Charlie (Monte Cerrado's edge), the concealment routes, the narrow
opening, the cañada, Claro Viejo, the return corridor (1.9).

### Stages

| # | Stage (checkpoint) | Script | Opens on | Objectives (cards) | World and spawns | Exit |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `M1_CP_START` | M1_00, M1_01 | the film's hand off (the intro, INTROS M1) | primary LAUNCH SURVEY ONE; tutorial prompts THROTTLE / LAUNCH, CLIMB TO SURVEY ALTITUDE, SWITCH EO / THERMAL, OPEN TACTICAL MAP (each shown once, cleared when done) | no threats; civilian world active (N21); ambient traffic minimal | every ISR holder over survey altitude (500 m AGL by default) |
| 2 | `M1_CP_AIRBORNE` | M1_02, M1_03 | stage 1's exit, at once | primary SURVEY SECTOR ALPHA: capture the bridge, the road condition, the agricultural structure (`capturedN(alpha, 3)`); optional DOCUMENT BURNED FIELD; then primary SURVEY SECTOR BRAVO: capture the settlement overview and the river crossing at the colonia (`capturedN(bravo, 2)`) | Bravo's scripted civilian elements: workers near a tractor and harvester, cattle on pasture, a family outside a house, a motorcycle on the public road (an ambient contact the room knows, never classified hostile) | Bravo complete |
| 3 | `M1_CP_BRAVO_COMPLETE` | M1_04 | stage 2's exit | primary SURVEY SECTOR CHARLIE | two people at the forest edge spawn when an ISR or TRACKER crosses ANOMALY_CORRIDOR, partly hidden, state UNKNOWN; if not `seen` in the discovery window (25 s), Ibarra prompts and a SEARCH AREA appears | `discovered(pair)` and Vega's "Follow." |
| 4 | `M1_CP_CONTACT_FOUND` | M1_05, M1_06 | stage 3's exit | primary MAINTAIN OBSERVATION OF UNKNOWN CONTACTS; MISSION RULE ENGAGEMENT NOT AVAILABLE | the pair walks one of three authored concealment routes (dial) at 1.3 m/s with dwells, losing direct view under canopy; reacquisition through gaps, clearings, path crossings and thermal glimpses; at the narrow opening one or both carry long objects; class UNKNOWN to PERSON OF INTEREST, card INTELLIGENCE UPDATED / POSSIBLE ARMED PERSONNEL | `route(pair, camp-edge)` (they enter the camp zone) |
| 5 | `M1_CP_CAMP_FOUND` | M1_07 to M1_10 | stage 4's exit | primary DOCUMENT THE SITE: shelters, motorcycles, antenna, personnel, access route (`capturedN(camp, 5)`); optional lookout position, solar equipment, historical symbol; then primary RETURN TO BASE; optional MAINTAIN DISTANT VISUAL UNTIL LAST CONTACT DISAPPEARS | the camp, revealed as aircraft orbit (N2): four shelters, three or four motorcycles, the antenna, the solar panel, the lookout, six to eight people visible at different times on authored loops (cook, sit, walk between shelters, the lookout climbing), none classified hostile; the mark under one shelter's roof, visible from one bearing band at depression under 35 degrees, or shown when a person moves the tarp after three required captures; the camp's alertness (N17) climbs for any aircraft under 300 m AGL or inside 400 m; at required intel complete or the maximum observation timer (8 min) or `alert(camp, high)`, the dispersal | `region(pista-cero, landed)` for the ISR, then the debrief |

The debrief (M1_10) is the mission's end, played as the outro film over
the squad's captures (INTROS M1, N8).

### Routes and spawn sets

- **The pair** (`pair-a`, `pair-b`): two people, spawn at the forest edge
  on the corridor's north side, 120 m apart from where they are first
  seen; walk together, 2 to 4 m apart. Three authored routes to the camp
  (`conceal-west`, `conceal-mid`, `conceal-east`), each about 800 m with
  two gaps, one path crossing, one clearing, and the narrow opening; each
  route's alternate reacquisition point is on the cañada or a second
  path crossing (the HARD_THRESHOLD move).
- **The camp** (`camp-1` to `camp-8`): eight people on loops inside the
  clearing, six to eight visible at a time; a lookout (`camp-look`) on
  the platform at the north edge; the tarp mover (`camp-tarp`); the one
  who looks up first (`camp-up`); the antenna man (`camp-mast`); two who
  push motorcycles under cover (`camp-moto-1`, `-2`).
- **The dispersal:** at M1_09 the camp splits in four directions on
  authored routes into the forest, last visible between 2 and 5 minutes
  after it starts (one route per direction: `out-n`, `out-e`, `out-s`,
  `out-w`), two people each, the motorcycles pushed under trees on the
  first minute.
- **Ambient (N21):** workers and machines in Alpha and Bravo, cattle,
  the family, one motorcycle on Ruta Vieja passing through Bravo, a
  pickup at the colonia's store.

### Dials (1.4)

| Dial | Choices |
| --- | --- |
| Concealment route | `conceal-west`, `conceal-mid`, `conceal-east` |
| Anomaly time | the pair appears 5 to 20 s after the corridor is crossed |
| Which shelter carries the mark | one of three shelters, so the angle that reveals it changes |
| The road condition item | one of two damaged stretches on Ruta Vieja |
| Dispersal order | which direction leaves first |
| Ambient | where the workers, cattle and the family stand |

### Recovery and fails

- **Soft (M1_05):** `lost(pair, 20)`: Ibarra "I've lost them." Vega
  "Pilot?" LAST KNOWN POSITION. `reacquired(pair)`: Ibarra "There. Good
  eye."
- **Hard:** `lost(pair, 45)`: the pair moves to its route's alternate
  reacquisition point; Vega "Check the drainage line east of last
  contact." (on routes whose alternate is a path crossing, the same line
  names "the path crossing north of last contact": a second take,
  `int1-s4-hard-b`).
- **Soft fail:** three hard thresholds before the camp: restart at
  `M1_CP_CONTACT_FOUND`.
- **Early alert:** `alert(camp, high)` before the required intel:
  dispersal starts early; documentation continues on what remains; the
  optional full documentation is still possible; no fail.
- **Fail:** the ISR destroyed with no other aircraft of the squad
  airborne; leaving the boundary after the final warning; the required
  survey impossible (a required item destroyed or the light gone: the
  sun sets two minutes after the latest the script can need, so this
  only fires on a broken run).
- **Never fail:** for briefly losing a contact, imperfect framing, time,
  or a different valid route.

### Stars (three optionals) and flags

1. **The symbol**: `M1_SYMBOL_CAPTURED` (captured at usable grade or
   better). HISTORY LESSON if before the tarp moves.
2. **The whole camp**: `M1_CAMP_FULLY_DOCUMENTED` (distant visual held
   until the last dispersing contact disappears).
3. **Eyes open**: every optional item: the burned field, the lookout,
   the solar equipment (EYES OPEN).

### Roles and co-op

| Role | Who | What it does in M1 |
| --- | --- | --- |
| ISR, Survey One | core: always held | the survey, the main track, the camp, the return |
| TRACKER, Survey Two and on | scaling: one per pilot past the first | survey: captures the current sector's other items in parallel; tracking: pickets the gap, clearing or cañada ahead of the pair (Ibarra assigns the next one); camp: holds another orbit sector, so another angle (the mark's bearing band); dispersal: follows one direction each, so the optional full documentation is a squad's work |

- **Minimum 1.** A solo pilot flies Survey One and does everything; the
  mission is built and tuned for one.
- **Useful maximum 5** (ISR and one tracker per dispersal direction).
  From 6 to 8, extra trackers picket the camp's three access routes and
  back up a dispersal track (a lost track is handed over). Past 8 (a
  public room), copies double up on assignments: redundancy, never an
  idle seat.
- **More pilots change:** how fast the survey goes, how much of the
  route is pre covered, how many angles on the camp at once, the camp's
  alertness (every aircraft inside the standoff adds to it, so a big
  squad must keep high). Nothing about the contacts or the lines.
- **Beats that need the host:** none. The debrief plays when the ISR
  holder lands (any ISR holder if the role passed).
- **Guides:** Vega to all; Ibarra to ISR and TRACKER (TRACKER lines are
  the (new) `int1-tr-*` below).

### Music

THE INTERIOR bed from the launch, sparse; silence through the anomaly
until "Follow."; a faint COLUMN texture under the camp, cut to silence at
the symbol, back after Ibarra's "But somebody remembers it."; THE
INTERIOR at sunset for the return.

### Radio

Every line of the script's Mission 1, by trigger. The film lines
(M1_00, M1_10) are in INTROS.md.

| id | cue | who | heard | EN |
| --- | --- | --- | --- | --- |
| int1-s1-clean | stage 1, survey altitude reached | FERRER | all | Survey One telemetry clean. |
| int1-s1-proceed | after s1-clean | VEGA | all | Proceed Sector Alpha. |
| int1-s2-hold | `captured` the first Alpha item | IBARRA | ISR, TRACKER | Good. Hold the frame for a second. |
| int1-s2-alpha | `capturedN(alpha, 3)` | VEGA | all | Alpha complete. Continue Bravo. |
| int1-s2-burned-1 | optional burned field captured | ROJAS | all | That burned last week. |
| int1-s2-burned-2 | after burned-1 | IBARRA | all | Accidental? |
| int1-s2-burned-3 | after burned-2 | ROJAS | all | Probably. |
| int1-s2-burned-4 | after burned-3 | IBARRA | all | Probably isn't useful. |
| int1-s2-burned-5 | after burned-4 | ROJAS | all | You're going to love this place. |
| int1-s2-teacher-1 | `dwell(teacher-house, 4)` | ROJAS | all | House near the water belongs to the local schoolteacher. |
| int1-s2-teacher-2 | after teacher-1 | IBARRA | all | Relevant? |
| int1-s2-teacher-3 | after teacher-2 | ROJAS | all | No. |
| int1-s2-teacher-4 | after teacher-3, a beat of 1.5 s | ROJAS | all | That's my point. |
| int1-s2-charlie | Bravo complete | VEGA | all | Proceed Charlie. |
| int1-s3-hold | discovery window ran out | IBARRA | all | Survey One, hold. |
| int1-s3-bearing | after s3-hold | IBARRA | all | Tree line. Eleven o'clock from your nose. |
| int1-s3-class | `discovered(pair)` (+1.5 s) | VEGA | all | Classification? |
| int1-s3-none | after s3-class | IBARRA | all | None. |
| int1-s3-road | after s3-none | ROJAS | all | They're avoiding the road. |
| int1-s3-notclass | after s3-road | IBARRA | all | That isn't a classification. |
| int1-s3-follow | after s3-notclass | VEGA | all | Follow. |
| int1-s4-welcome | the first `lost(pair, 8)` of the stage | ROJAS | all | Welcome to the Interior. |
| int1-s4-lost | `lost(pair, 20)` | IBARRA | all | I've lost them. |
| int1-s4-pilot | after s4-lost | VEGA | all | Pilot? |
| int1-s4-there | `reacquired(pair)` | IBARRA | all | There. |
| int1-s4-goodeye | after s4-there, a beat | IBARRA | all | Good eye. |
| int1-s4-hard | `lost(pair, 45)`, alternate on the cañada | VEGA | all | Check the drainage line east of last contact. |
| int1-s4-hard-b | `lost(pair, 45)`, alternate on a path crossing | VEGA | all | Check the path crossing north of last contact. |
| int1-s4-armed | `route(pair, opening)` and `seen(pair)` | ROJAS | all | Armed. |
| int1-s4-possible | after s4-armed | IBARRA | all | Possible. |
| int1-s4-comeon | after s4-possible | ROJAS | all | Come on. |
| int1-s4-rifle | after s4-comeon | IBARRA | all | One object consistent with a rifle. One unclear. |
| int1-s4-know | after s4-rifle | VEGA | all | Then that's what we know. |
| int1-s5-nolow | stage 5 opens (+2 s) | VEGA | all | No low pass. |
| int1-s5-record | after s5-nolow | IBARRA | all | Record everything. |
| int1-s5-receiving | `captured(symbol)` | IBARRA | all | Command, confirm you are receiving. |
| int1-s5-weare | after s5-receiving | VEGA | all | We are. |
| int1-s5-checking | after s5-weare; HUD ARCHIVE MATCH SEARCHING... | IBARRA | all | I'm checking something. |
| int1-s5-historical | after s5-checking, a pause of 3 s | IBARRA | all | That mark is historical. |
| int1-s5-column | after s5-historical | ROJAS | all | The Column? |
| int1-s5-years | after s5-column | IBARRA | all | That symbol hasn't appeared in years. |
| int1-s5-answer | after s5-years | VEGA | all | Doesn't answer his question. |
| int1-s5-no | after s5-answer | IBARRA | all | No. |
| int1-s5-remembers | after s5-no, a beat; group COLUMN-LINKED (UNCONFIRMED) | IBARRA | all | But somebody remembers it. |
| int1-s5-moving | the dispersal starts (one looks up, the antenna comes down) | ROJAS | all | They're moving. |
| int1-s5-high | after s5-moving | VEGA | all | Pilot, remain high. |
| int1-s5-people | after s5-high | ROJAS | all | We can get people moving toward them. |
| int1-s5-noway | after s5-people | VEGA | all | No. |
| int1-s5-major | after s5-noway | ROJAS | all | Major. |
| int1-s5-fivemin | after s5-major | VEGA | all | We found them five minutes ago. |
| int1-s5-understand | after s5-fivemin, a beat | VEGA | all | That does not mean we understand what we found. |
| int1-s5-early | `alert(camp, high)` before the required intel | IBARRA | all | (new) They heard you. Climb. |
| int1-tr-assign | a TRACKER copy dealt, the stage's assignment shown | IBARRA | TRACKER | (new) Survey Two, take the far side. I'll call what I need. |
| int1-tr-picket | stage 4, a TRACKER's next picket assigned | IBARRA | TRACKER | (new) Get ahead of them. Watch the next gap. |
| int1-tr-angle | stage 5, a TRACKER in its orbit sector | IBARRA | TRACKER | (new) Hold that side of the clearing. Different angle, same distance. |
| int1-tr-split | the dispersal starts, a TRACKER given a direction | IBARRA | TRACKER | (new) Take the ones going your way. Don't go low. |
| int1-fail | the mission failed | VEGA | all | (new) We lost the picture today. We go again tomorrow. |

The en text above becomes `lines.json` rows; each row's es text is
written there when the lines are generated, with ustedes wherever the
line speaks to the players ("Piloto" lines are the third person or
ustedes, never tú). Rojas's cut off "Major." takes the es "Mayor."

### What the player learns

Looking is not seeing: center, zoom, hold, capture. Ordinary life is
most of what the camera sees. People disappear under trees; predict
where they come out. An object is "consistent with" a rifle until it is
more. Restraint: remain high, and come home without firing a shot.

---
## M2. Eyes in the Forest (`interior-2`): planned, Under development

**Type:** persistent surveillance and investigation. **Tone:**
methodical, intimate, increasingly unsettling; the landscape itself
feels hostile. **Time:** early morning into midday. **Weather:** humid,
overcast, brightening. **Weapons:** none. **Length:** 25 to 35 minutes.
**Unlocks:** Mission 3. **Platform unlocked:** the recon quad (PLAN 6:
Phase 0's pick from `7inch`, `10inch`, `interceptor` by feel under
canopy, decided when M2 is built).

**Loading card:** "You don't need to see a patrol to know it is coming."
MISSION 02, EYES IN THE FOREST, OPERATION TYPE: PERSISTENT SURVEILLANCE,
STATUS: ACTIVE INVESTIGATION.

**Briefing (campaign card).** EN: "Ground units reached Claro Viejo at
dawn. Empty. They left before the first vehicle crossed into the sector.
Today you are not looking for fighters. You are looking for watchers."

### Places used

Claro Viejo (close range), Cruce Tranquera, Loma del Vigía, Corral Viejo
(the three observation zones), the convoy road on Ruta Vieja, Senda del
Vigía, Estancia La Ceniza, Claro Nuevo (1.9).

### Stages

| # | Stage (checkpoint) | Script | Opens on | Objectives | World and spawns | Exit |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `M2_CP_START` | M2_00 to M2_02 | the intro film's hand off | primary INSPECT THE ABANDONED CAMP: the extinguished fire, the cut cable, equipment impressions, vehicle tracks, the observation diagram (`capturedN(camp-close, 5)`, SCAN / CAPTURE prompts only within 10 m); then IDENTIFY POSSIBLE OBSERVATION POSTS: three search zones, one required watcher, two optional | the empty camp (props only); civilians in the zones (a farmer at the corral, a rider on the road, a man fixing a fence at the crossroads) so a watcher is not trivial; the required watcher's zone is a dial; the other two zones hold optional watchers (a motorcycle under a tree, one man, no visible weapon, looking at a road) | `seen(watcher-req)` held 20 s and the convoy dial's time |
| 2 | `M2_CP_WATCHER` | M2_03, M2_04 | the friendly convoy crosses the distant road and the watcher leaves at once | primary FOLLOW THE WATCHER; then the choice: follow Contact A or Contact B (any pilot's camera box chooses; with two trackers both are followed) | the watcher rides Senda del Vigía, meets a second person at a handoff point (a dial of two), a small object changes hands, they separate; A rides to an alternate observation post, B walks to Estancia La Ceniza; if A is chosen, a courier later leaves A's post for the same property | `route(B, property-yard)` or `route(courier, property-yard)` |
| 3 | `M2_CP_PROPERTY` | M2_05, M2_06 | stage 2's exit; the property's last visitor gone | primary INSPECT THE PROPERTY: the battery stash, the radio equipment, the observation notes (RECON, inside the house); then AVOID DETECTION and OBSERVE THE CONTACT | Estancia La Ceniza empty; then the returning contact on foot or motorcycle (dial); the property's alertness (N17: the quad's sound within 15 m, its body in the contact's view cone) | the contact leaves with the item (calm or fast) |
| 4 | `M2_CP_SECOND_CAMP` | M2_07 to M2_10 | `route(returner, claro-nuevo-edge)` | primary DOCUMENT THE SECOND GROUP: younger personnel, new vehicles, new communications equipment, camp overview (`capturedN(claro-nuevo, 4)`); OBSERVE the meeting; then OBSERVE BOTH GROUPS (ISR wide) | Claro Nuevo: six younger people, newer motorcycles, a newer radio; after the documentation threshold an older known contact (from M1's camp) enters, a short exchange, leaves; the map shows OLD SITE / NETWORK and NEW SITE / NETWORK; at mission completion the emergency transition (in the outro film) | the outro film |

### Routes and spawn sets

- `watcher-req` and up to two optional watchers (`watch-cruce`,
  `watch-loma`, `watch-corral`; the dial picks which is required), each
  a man and a motorcycle on a short loop (stand, look, smoke, check a
  phone, stand).
- `convoy`: three friendly vehicles on Ruta Vieja's north stretch,
  visible from the required watcher's spot.
- `contact-a`, `contact-b`: after the handoff; `courier` (only if A is
  followed): leaves A's post 3 to 5 minutes later toward the property.
- `returner`: enters the property, collects an item from the battery
  stash, leaves; calm route or fast route, depending on detection.
- `claro-nuevo-1` to `-6` (younger), `old-courier` (the older contact).

### Dials

Which observation zone holds the required watcher; the handoff point
(two); the returner on foot or by motorcycle; the second camp's layout
(two); the convoy's time (a window of 30 s); civilians in the zones.

### Recovery and fails

- **Soft:** the watcher or a contact out of view 20 s: Ibarra loses it,
  LAST KNOWN POSITION. **Hard** at 45 s: moved to the next point on its
  route that has a clear view from the air, with a search area.
- **Detected at the property** (soft fail): the returner leaves fast;
  tracking continues in a harder state (shorter dwell, more canopy);
  UNSEEN and `M2_SECOND_CAMP_UNDETECTED` are lost; no mission fail.
- **Choosing "wrong":** no fail. Contact A leads to an alternate post
  and then a courier to the same property.
- **Fail:** every required platform lost; the returning contact
  permanently inaccessible after three recovery windows; the boundary.

### Stars and flags

1. **The watchers**: all three observation posts found
   (`M2_ALL_WATCHERS_FOUND`, THE WATCHERS). Contact A's alternate post
   counts as one.
2. **Unseen**: the property and the meeting observed without detection
   (`M2_SECOND_CAMP_UNDETECTED` true at M2_08, UNSEEN).
3. **Both groups**: every optional comparison capture (the old courier
   and a younger member in one frame; Claro Nuevo's motorcycles; its
   radio).

Reads `M1_SYMBOL_CAPTURED` for Ibarra's callback in the intro film.

### Roles and co-op

| Role | Kind | M2 |
| --- | --- | --- |
| ISR | core | the zones, the watcher, the follow, the wide picture |
| RECON | core | the camp up close, the property, the second camp's detail |
| TRACKER | scaling | a search zone each (the optional watchers found in parallel); at the handoff, a second tracker follows the other contact; at the property, watches the approach and calls the returner early (Ferrer's "Movement." is everyone's) |

- **Minimum 1:** solo holds ISR and RECON; the Bramor waits on an orbit
  hold over the camp or property while the quad flies (N15).
- **Useful maximum 5:** ISR, RECON, three trackers (one per zone, two
  of them then one per contact). 6 to 8: a second RECON copy inspects
  the camp's points in parallel (doubling the property's detection risk
  if both go in, said by Ibarra), extra trackers watch Claro Nuevo's
  approaches.
- **Scales:** zones covered at once, contacts followed at once, the
  quad's detection risk when several go close. Not the contacts.
- **Host:** none.
- **Guides:** Vega to all; Ibarra to ISR, TRACKER, RECON; Ferrer's
  system lines to all.

### Music

Close motor, wind, insects, distant vehicles. No music at the property
("The mission becomes quiet"). A COLUMN texture under Claro Nuevo, with
a newer, cleaner edge than M1's.

### Radio

The intro and outro (M2_00, M2_10) are films (INTROS M2).

| id | cue | who | heard | EN |
| --- | --- | --- | --- | --- |
| int2-s1-notmap | `captured(diagram)` | IBARRA | all | That's not a map of the camp. |
| int2-s1-road | after s1-notmap | ROJAS | all | Road network. |
| int2-s1-points | after s1-road; card IDENTIFY POSSIBLE OBSERVATION POSTS | IBARRA | all | Observation points. |
| int2-s1-back | after s1-points (a solo pilot is handed back to the ISR) | IBARRA | ISR | (new) Back up high. Three places someone could sit and watch the road. |
| int2-s1-guy | `seen(watcher-req)` | ROJAS | all | That your guy? |
| int2-s1-man | after s1-guy | IBARRA | all | He's a man standing next to a motorcycle. |
| int2-s1-thanks | after s1-man | ROJAS | all | Thank you, Sofía. |
| int2-s1-welcome | after s1-thanks | IBARRA | all | You're welcome. |
| int2-s1-optional | `seen` an optional watcher | IBARRA | ISR, TRACKER | (new) Another one. Same habits. Mark it. |
| int2-s2-interesting | the watcher leaves as the convoy passes | IBARRA | all | Now he's interesting. |
| int2-s2-which | the handoff's `linked(watcher, second)` ends | ROJAS | all | Which one? |
| int2-s2-second | after s2-which | IBARRA | all | Second contact. |
| int2-s2-why | after s2-second | ROJAS | all | Why? |
| int2-s2-see | after s2-why | IBARRA | all | Because the first man's job may only have been to see. |
| int2-s2-courier | `chosen(A)` and the courier leaves A's post | IBARRA | all | (new) Someone's leaving his post. Follow that one. |
| int2-s3-warning | `capturedN(property, 3)` | IBARRA | all | This is their warning system. |
| int2-s3-this | after s3-warning | ROJAS | all | This? |
| int2-s3-this2 | after s3-this | IBARRA | all | This. |
| int2-s3-radio | after s3-this2 | ROJAS | all | A radio and a guy on a motorcycle? |
| int2-s3-satellites | after s3-radio | IBARRA | all | You were expecting satellites? |
| int2-s3-movement | the returner spawns | FERRER | all | Movement. |
| int2-s3-quiet | after s3-movement | IBARRA | RECON | (new) Stay where he can't see you. Let him come. |
| int2-s3-seen | `alert(property, high)` | IBARRA | all | (new) He saw you. He's running. Stay on him. |
| int2-s4-radio | `discovered(claro-nuevo)` | FERRER | all | That's a newer radio. |
| int2-s4-newer | after s4-radio | IBARRA | all | Everything here is newer. |
| int2-s4-replacement | after s4-newer | ROJAS | all | Replacement camp? |
| int2-s4-people | after s4-replacement; group NEW COLUMN (UNCONFIRMED) | IBARRA | all | Replacement people. |
| int2-s4-hold | the old courier enters | IBARRA | all | Hold. |
| int2-s4-same | the courier leaves | VEGA | all | Same organization? |
| int2-s4-myth | after s4-same | IBARRA | all | Same mythology. |
| int2-s4-asked | after s4-myth | VEGA | all | Not what I asked. |
| int2-s4-only | after s4-asked; card POSSIBLE INTERNAL SPLIT | IBARRA | all | It's the only answer I have. |
| int2-s4-cells | OBSERVE BOTH GROUPS opens | IBARRA | all | Two cells. |
| int2-s4-orgs | after s4-cells | VEGA | all | Or two organizations. |
| int2-s4-routes | after s4-orgs | IBARRA | all | Same routes. Same symbols. Different people. |
| int2-tr-zone | a TRACKER dealt a zone | IBARRA | TRACKER | (new) Take that zone. Look for someone who isn't working. |
| int2-tr-other | a TRACKER on the contact nobody chose | IBARRA | TRACKER | (new) You take the other one. Both of them matter. |

Spanish: in the same rows when generated; ustedes to the players;
"Gracias, Sofía." takes no verb form, so it is safe for the checker.

### What the player learns

The camp was never the defence: the landscape was. A man next to a
motorcycle is a man next to a motorcycle until the convoy passes. Two
cameras at once: one high, one close. Some things are only seen by not
being seen.

---

## M3. No Man's Land (`interior-3`): planned, Under development

**Type:** overwatch, identification, first combat. **Tone:** urgent,
uncertain, increasingly pressured. **Time:** late afternoon into night;
thermal matters more as the light goes. **Weather:** unstable cloud.
**Length:** 30 to 40 minutes. **Unlocks:** Mission 4. **Platforms
unlocked:** the strike platform (Striker or the quad PLAN 6 picks), the
relay (a fixed wing loiterer), and the interceptor as an optional role
from M3_07 (the script lists "Optional interceptor" for M3; PLAN 6 had it
from M4, the script wins).

**Loading card:** "A thermal signature has no uniform." MISSION 03, NO
MAN'S LAND, OPERATION TYPE: OVERWATCH, STATUS: FRIENDLY UNIT ISOLATED.

**Briefing.** EN: "Puesto Arenal has twelve people and intermittent
communications. Local traffic is still moving. Nobody is a target
because they're carrying a weapon. Find. Follow. Identify. Engage only
when cleared."

**Mission rule:** ENGAGE ONLY CONFIRMED HOSTILE CONTACTS (1.6).

### Places used

Puesto Arenal and its marsh, the farmhouse, the roads around the post,
culverts, Senda del Vigía (the corridor from M2), the temporary command
site, the northern exit (1.9).

### Stages

| # | Stage (checkpoint) | Script | Opens on | Objectives | World and spawns | Exit |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `M3_CP_START` | M3_00 to M3_02 | the intro's hand off; the map shows UNKNOWN contacts | primary CLASSIFY KEY CONTACTS AROUND THE POST | contacts A civilian pickup (to the farmhouse, a family and children unload supplies: CIVILIAN), B police motorcycle (to the post's checkpoint: FRIENDLY), C pedestrians leaving the region (CIVILIAN once seen leaving), D a parked vehicle (unresolved), E an agricultural worker group (CIVILIAN at work); then D moves between observation spots, its occupants watch the post and use a radio, drive toward Senda del Vigía and meet the M2 courier: HOSTILE CONFIRMED | `classified(D, hostile)` |
| 2 | `M3_CP_CONFIRMED_CONTACT` | M3_03 | stage 1's exit, 20 to 40 s later (dial) | primary IDENTIFY THREATS NEAR THE POST | thermal signatures in the vegetation round the post: some civilians moving away (authored, they leave by the road), some concealed and watching; when hostile action is unambiguous (a concealed pair moves on the post's gate with long objects raised, scripted), Rojas calls contact; CONFIRM IDENTIFICATION; Vega clears; the strike role unlocks | the threat stopped |
| 3 | `M3_CP_FIRST_ENGAGEMENT` | M3_04 | stage 2's exit | primary TRACK DEPARTING VEHICLES | three look alike pickups leave the post's outskirts on three roads: 1 civilians (to the colonia's road), 2 an empty decoy (stops in a field, nobody leaves it), 3 confirmed hostile occupants (toward the command site); all UNKNOWN; scripted evidence resolves each (people seen leaving 1, nobody near 2, 3 meeting a known contact) | all three resolved, or 3 stopped or lost after its evidence |
| 4 | `M3_CP_RELAY` | M3_05, M3_06 | stage 3's exit | primary RESTORE DRONE NETWORK LINK; then the forward recon identifies the radio operator, temporary shelter, motorcycles, route markers | the forward feed degrades (N11) as the quad passes the ridge line toward the command site; a highlighted broad volume; a relay aircraft held in it for 10 s restores the feed | the four command site items captured |
| 5 | `M3_CP_AIR_CONTACT` | M3_07 to M3_09 | stage 4's exit | primary TRACK OR INTERCEPT UNKNOWN DRONE; then FOLLOW THE NORTHERN VEHICLE | a small quad appears near the post, observes friendly positions, repositions to keep watching; tracked until it leaves (about 3 minutes) or intercepted; night deepens; one tracked vehicle leaves north; engagement not allowed; at the edge of coverage it disappears | the vehicle crosses the northern exit, then the outro film |

### The post's condition

A room value (`post`): `steady`, `pressed`, `critical`. It moves toward
`pressed` while concealed hostiles near the post are unobserved, and
back while they are watched; a correct strike in stage 2 resets it.
`critical` for 60 s is the script's "critical collapse": fail. The radio
tells it (Rojas), never a number.

### Dials

Contact D's observation spots (two orders); which road each look alike
pickup takes; the concealed pair's approach side; the enemy quad's
arrival bearing; the northern vehicle's departure time.

### Recovery and fails

- **Soft and hard** as 1.7 for D, the three pickups and the northern
  vehicle (the northern vehicle has no hard move: losing it at the
  boundary is the story).
- **Wrong vehicle engaged:** the error (1.6); a second error fails.
- **Unknown drone completes its watch** (soft consequence): the outro
  and M4's intro note friendly positions were exposed (a variant line).
- **Fail:** the post `critical` for 60 s; all ISR capability lost;
  repeated engagement of civilians or friendlies; abandoning the zone.

### Stars and flags

1. **Positive ID**: zero civilian or friendly errors
   (`M3_ZERO_CIVILIAN_ERRORS`, POSITIVE ID).
2. **Not alone**: the unknown drone intercepted
   (`M3_HOSTILE_DRONE_INTERCEPTED`, NOT ALONE; NOT ALONE is also given
   for tracking it until it leaves, the star is not).
3. **The command site**: every command site item captured and the relay
   never broken once established.

### Roles and co-op

| Role | Kind | M3 |
| --- | --- | --- |
| ISR | core | builds the picture, contact D, the threats near the post, the northern vehicle |
| RECON | core | the forward recon to the command site (behind the ridge) |
| STRIKE | core from stage 2 | the first engagement; idle until then by the story (its pilot also holds TRACKER work until the unlock, so no idle seat) |
| RELAY | core in stage 4 | holds the volume; its pilot flies TRACKER work before stage 4 |
| TRACKER | scaling | a contact each in stage 1 (A to E resolved in parallel); one pickup each in stage 3; the northern vehicle with the ISR |
| INTERCEPTOR | optional from stage 5, scaling | stops the unknown drone |

- **Minimum 1:** solo holds every core role, switching (N15 holds the
  ISR's orbit while the strike, relay or quad flies).
- **Useful maximum 6:** ISR, RECON, STRIKE, RELAY, two trackers (three
  pickups need three eyes with the ISR). 7 and 8: a second relay copy
  (a second volume covering the quad's return), an interceptor. Past 8:
  trackers double up on the three pickups.
- **Scales:** tracks held at once; the post's pressure rises faster for
  big squads (the hostiles are the same; the post's pressure rate is
  tuned per pilot count so the squad must still divide), timing windows.
- **Host:** none; CONFIRM IDENTIFICATION is any pilot's on the contact in
  their box, and its beat is locked (1.5).
- **Guides:** Vega to all (clearances); Ibarra to ISR, TRACKER, RECON;
  Ferrer to RELAY and INTERCEPTOR; Rojas to STRIKE and the post's state.

### Music

Rising radio traffic; the THE INTERIOR bed thinned to pulse; silence
after "Threat stopped." for ten seconds; low and cold for the vehicle
north.

### Radio

The intro and outro (M3_00, M3_09) are films.

| id | cue | who | heard | EN |
| --- | --- | --- | --- | --- |
| int3-s1-watch | `classified(A, civilian)` | IBARRA | all | This is why we watch. |
| int3-s1-ours | `classified(B, friendly)` | ROJAS | all | That's one of ours. |
| int3-s1-pattern | D's second observation stop with its radio seen | IBARRA | all | Behavior matches the warning network. |
| int3-s1-enough | after s1-pattern | ROJAS | all | Enough? |
| int3-s1-no | after s1-enough | IBARRA | all | No. |
| int3-s1-corr | `linked(D, m2-courier)` | IBARRA | all | We have historical correlation. |
| int3-s1-sayit | after s1-corr | ROJAS | all | Say it. |
| int3-s1-confirmed | after s1-sayit; card UNKNOWN > HOSTILE CONFIRMED | IBARRA | all | Confirmed Column contact. |
| int3-s2-contact | the hostile action | ROJAS | all | We have contact. |
| int3-s2-pilot | after s2-contact; card CONFIRM IDENTIFICATION | VEGA | all | Pilot? |
| int3-s2-cleared | CONFIRM IDENTIFICATION on the right contact | VEGA | all | Cleared. |
| int3-s2-stopped | the strike's white out ends | ROJAS | all | Threat stopped. |
| int3-s2-continue | after s2-stopped | VEGA | all | Continue observing. |
| int3-s2-pressed | `post(pressed)` | ROJAS | all | (new) They're closing on the post. I need eyes on the tree line. |
| int3-s2-notyet | CONFIRM IDENTIFICATION before the evidence | IBARRA | all | (new) We don't have that yet. |
| int3-s3-chassis | the three pickups leave | FERRER | all | Same chassis. Same heat. Same road. |
| int3-s3-answers | after s3-chassis | IBARRA | all | Different answers. |
| int3-s3-error | a strike on vehicle 1 or 2 | ROJAS | all | (new) There were people in that one. Stop. |
| int3-s3-error-2 | after s3-error | VEGA | all | (new) Nobody engages anything else without my word. |
| int3-s4-losing | the forward feed starts degrading | FERRER | all | You're losing the forward feed. |
| int3-s4-both | after s4-losing; card RESTORE DRONE NETWORK LINK | FERRER | all | Keep another aircraft where the network can still see both sides. |
| int3-s4-normal | after s4-both | ROJAS | all | In normal language? |
| int3-s4-talk | after s4-normal | FERRER | all | Put one drone where it can talk to the other drone. |
| int3-s4-cando | after s4-talk | ROJAS | all | See? You can do it. |
| int3-s4-stable | the relay held in the volume | FERRER | all | Forward feed stable. |
| int3-s4-random | three command site items captured | IBARRA | all | This isn't random movement. |
| int3-s4-command | after s4-random | VEGA | all | Command position? |
| int3-s4-temp | after s4-command; card COORDINATED ACTIVITY CONFIRMED | IBARRA | all | Temporary, maybe. |
| int3-s5-hold | the unknown quad spawns | FERRER | all | Hold. |
| int3-s5-unid | after s5-hold, a beat | FERRER | all | Unidentified aircraft. |
| int3-s5-civ | after s5-unid | VEGA | all | Civilian? |
| int3-s5-broadcast | after s5-civ | FERRER | all | Not broadcasting anything I recognize. |
| int3-s5-theirs | the quad begins observing the friendly position | ROJAS | all | That's theirs. |
| int3-s5-dontknow | after s5-theirs | IBARRA | all | We don't know that. |
| int3-s5-guess | the quad repositions to keep watching; card TRACK OR INTERCEPT UNKNOWN DRONE | FERRER | all | Now I'm comfortable guessing. |
| int3-s5-intercepted | the quad intercepted; card UNKNOWN AIR CONTACT > HOSTILE SURVEILLANCE | FERRER | all | (new) It's down. It saw enough to come back. |
| int3-s5-left | the quad left after its full watch | FERRER | all | (new) It's gone. It saw everything it wanted. |
| int3-s5-wrong | the northern vehicle turns north | IBARRA | all | That's wrong. |
| int3-s5-what | after s5-wrong | VEGA | all | What? |
| int3-s5-direction | after s5-what | IBARRA | all | Direction. |
| int3-s5-edge | the vehicle within 1 km of the northern exit | FERRER | all | You're at the edge of coverage. |
| int3-s5-boundary | after s5-edge | VEGA | all | Do not follow beyond boundary. |
| int3-tr-contact | a TRACKER given a contact (A to E) | IBARRA | TRACKER | (new) That one's yours. Watch it until it tells you what it is. |
| int3-re-volume | the RELAY role's volume shown | FERRER | RELAY | (new) That box is where you live now. Don't leave it. |
| int3-st-ready | the strike role unlocked | ROJAS | STRIKE | (new) You're the one they'll call. Not before. |
| int3-in-launch | the interceptor role opens | FERRER | INTERCEPTOR | (new) Small, slow, curious. Stay on it. |

Spanish: in the same rows; ustedes; Vega's "Autorizado." for "Cleared."
and "Amenaza neutralizada." for "Threat stopped." (BIBLE 11).

### What the player learns

Everyone looks suspicious until watched. A classification is earned.
The first strike is quiet. The same truck can be three answers. A relay
is infrastructure. Someone else is in the sky now.

---
## M4. The Other War (`interior-4`): planned, Under development

**Type:** long range surveillance, multi faction tracking. **Tone:**
complex, colder, wider. **Time:** before dawn into full daylight.
**Weather:** clear, dust on the roads. **Length:** 35 to 45 minutes.
**Unlocks:** Mission 5. **Platforms:** all unlocked surveillance
systems, the recon quad, the relay, the interceptor (now core), the
strike with restricted authorization. No new platform.

**Loading card:** "The hardest target to follow is the one that looks
like everything else." MISSION 04, THE OTHER WAR, OPERATION TYPE:
LONG-RANGE SURVEILLANCE, STATUS: DO NOT INTERVENE.

**Briefing.** EN: "Three cameras have seen the same vehicle in
forty-eight hours, never near the historical camps. We follow it.
Nobody touches it. If you lose it, do not guess which one it became."

**Mission rule:** DO NOT ENGAGE TARGET VEHICLE.

### Places used

Ruta Nueva and its traffic, the fuel stop, Galpones del Cruce, the
river crossing, La Pista Larga, the old observer's tree line, Silo
Viejo, hidden access tracks (1.9).

### Stages

| # | Stage (checkpoint) | Script | Opens on | Objectives | World and spawns | Exit |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `M4_CP_START` | M4_00, M4_01 | the intro's hand off | primary LOCATE THE VEHICLE: a broad area, an approximate route, a last seen time, a general description (a grey double cab pickup with a roof rack and a pale tailgate); then MAINTAIN SURVEILLANCE | Ruta Nueva traffic: agricultural trucks, pickups, motorcycles, two other grey pickups, all contacts the room knows (N13); no target box until positively reacquired: held observation 5 s gives "Possible match", 10 s more "Confirmed" | the target confirmed |
| 2 | `M4_CP_TARGET_ACQUIRED` | M4_02 | stage 1's exit | MAINTAIN SURVEILLANCE; at the sheds, TARGET LOST / REACQUIRE | the target enters Galpones del Cruce; after 40 to 70 s (dial) four look alike pickups leave by three exits; the target is one of them, told by authored clues: the pale tailgate seen only from behind, the roof rack's load, the route behaviour (it turns off Ruta Nueva at the second track, the others go on), the timing (it leaves third or last, a dial); a wrong one followed reaches a harmless destination (a farm, the fuel stop, a house) within three minutes, then a recovery search zone | the target leaves the public road |
| 3 | `M4_CP_MEETING` | M4_03, M4_04 | `route(target, pista-larga)` | primary DOCUMENT THE MEETING: convoy overview, personnel interaction, equipment exchange, vehicle association (`capturedN(meeting, 4)`) | younger Column contacts arrive (two motorcycles, a pickup); then a cleaner convoy (two SUVs, a box truck): UNKNOWN THIRD PARTY; crates, documents, fuel, equipment change hands; class UNKNOWN THIRD PARTY > NETWORK-LINKED; card NEW FACTION IDENTIFIED / THE NETWORK | the exchange captured |
| 4 | `M4_CP_THREE_FACTIONS` | M4_05 | stage 3's exit | primary MAINTAIN TRACKS ON ALL THREE FACTIONS; the HUD may now draw faction marks (OLD COLUMN, NEW COLUMN, NETWORK) | the old Column observer at the tree line, watching the meeting, not the drones | documentation complete (meeting and observer) |
| 5 | `M4_CP_BREAKDOWN` | M4_06 to M4_08 | stage 4's exit | primary track relationships (any two of three faction tracks held to their exits); PROTECT AERIAL SURVEILLANCE; SUPPORT GROUND INTERCEPT while keeping at least one strategic track | the unexplained trigger (a dial: a local patrol on a distant road, a Network lookout noticing movement, a vehicle starting early); the meeting dissolves in three directions; a Network counter surveillance drone searches the areas where friendly aircraft are (one, plus one per three pilots past three); a friendly ground team moves on one Network vehicle; strike authorization may appear only against the scripted confirmed threat (a Network guard who raises a weapon at the ground team) | a Network vehicle stops at Silo Viejo |
| 6 | `M4_CP_CACHE` | M4_09 to M4_11 | `route(network-2, silo-viejo)` | primary DOCUMENT THE STORAGE SITE: regional maps, ledgers, photographs, communication devices, references to multiple sectors (three needed, five for the star); the old observer withdraws | the abandoned material inside the storage structure (RECON); the observer leaves alone under the trees | the outro film |

### Dials

The target's clue set (two of three clues present), its leaving order
from the sheds, the sheds' exits; the breakdown's trigger; the
directions each faction leaves by (two variants); the counter
surveillance drone's search order.

### Recovery and fails

- **Soft and hard** (1.7) for the target before the meeting, with the
  wrong vehicle rule (a harmless destination, then a search zone).
- **One faction track lost in the breakdown** (soft fail): the mission
  continues; reduced intelligence; the debrief varies.
- **Fail:** the target permanently lost before the meeting after every
  recovery path; the protected target vehicle destroyed; all
  surveillance lost; the key unknown faction struck before
  identification; the boundary.

### Stars and flags

1. **Thread the needle**: the target never lost through the decoy
   sequence (`M4_TARGET_VEHICLE_NEVER_LOST`).
2. **Three stories**: all three faction tracks held through the
   breakdown (`M4_ALL_FACTIONS_TRACKED`).
3. **The whole cache**: all five storage items (`M4_CACHE_DOCUMENTED`).

Reads `M3_ZERO_CIVILIAN_ERRORS` and `M3_HOSTILE_DRONE_INTERCEPTED` for
the intro's callbacks.

### Roles and co-op

| Role | Kind | M4 |
| --- | --- | --- |
| ISR | core | the target, the meeting overview |
| TRACKER | core one copy, then scaling | a second eye on the sheds' exits; one faction each in the breakdown |
| RECON | core | close captures at the meeting (risky), the cache |
| INTERCEPTOR | core, scaling | the counter surveillance drones |
| RELAY | core in stage 5 | keeps the recon's feed at Silo Viejo (the storage is in a hollow) |
| GROUND SUPPORT | core in stage 5 | the picture for Rojas's team: routes, what moves toward them |
| STRIKE | restricted | only the scripted confirmed threat in M4_08 |

- **Minimum 1:** solo holds all; two tracks of three are enough to
  progress, so a solo pilot can finish (the script: "the player cannot
  perfectly follow all of them").
- **Useful maximum 7:** ISR, two TRACKERs (with the ISR, three
  factions), RECON, INTERCEPTOR, RELAY, GROUND SUPPORT. 8 and beyond:
  more interceptors and trackers on the sheds' four leavers (the needle
  threaded by numbers, not luck: each leaver watched).
- **Scales:** tracks held, the sheds' leavers watched, counter
  surveillance drones (one plus one per three pilots past three; no line
  counts them), timing windows.
- **Host:** none.
- **Guides:** Vega to all; Ibarra to ISR, TRACKER, RECON; Ferrer to
  INTERCEPTOR and RELAY; Rojas to GROUND SUPPORT and STRIKE.

### Music

Layered radio, competing feeds; THE NETWORK enters at the cleaner
convoy, cold and rhythmic; THE COLUMN thin under the old observer.

### Radio

The intro (M4_00) and outro (M4_11) are films.

| id | cue | who | heard | EN |
| --- | --- | --- | --- | --- |
| int4-s1-possible | the target in a box, held 5 s | FERRER | all | Possible match. |
| int4-s1-confirmed | held 10 s more | FERRER | all | Confirmed. That's our vehicle. |
| int4-s2-certainty | the first look alike leaves the sheds; card TARGET LOST / REACQUIRE | FERRER | all | And there goes certainty. |
| int4-s2-nice | the target reacquired within 60 s | FERRER | all | Nice. |
| int4-s2-dont | after s2-nice | IBARRA | all | Don't compliment them yet. |
| int4-s2-both | after s2-dont | FERRER | all | I can compliment them and remain suspicious. |
| int4-s2-wrong | a wrong leaver reached its harmless destination | IBARRA | all | (new) That's a farm truck going home. We lost ours. |
| int4-s3-forest | the cleaner convoy arrives | FERRER | all | Those aren't forest people. |
| int4-s3-no | after s3-forest | IBARRA | all | No. |
| int4-s3-who | after s3-no | VEGA | all | Who are they? |
| int4-s3-new | after s3-who; group UNKNOWN THIRD PARTY | IBARRA | all | New question. |
| int4-s3-comfortable | the exchange begins | ROJAS | all | They look comfortable. |
| int4-s3-worries | after s3-comfortable; NETWORK-LINKED; NEW FACTION IDENTIFIED | IBARRA | all | That's what worries me. |
| int4-s4-hold | the observer spawns | IBARRA | all | Hold. |
| int4-s4-old | after s4-hold | IBARRA | all | Old faction. |
| int4-s4-at | after s4-old | VEGA | all | At the meeting? |
| int4-s4-no | after s4-at | IBARRA | all | No. |
| int4-s4-watching | `seen(observer)` facing the meeting | IBARRA | all | They're watching. |
| int4-s4-us | after s4-watching | FERRER | all | Us? |
| int4-s4-them | after s4-us | IBARRA | all | Them. |
| int4-s5-rel | the meeting dissolves | VEGA | all | Track relationships. |
| int4-s5-which | after s5-rel | ROJAS | all | Which vehicle? |
| int4-s5-all | after s5-which | VEGA | all | All of them. |
| int4-s5-physics | after s5-all | FERRER | all | That's not how physics works. |
| int4-s5-prioritize | after s5-physics | VEGA | all | Then prioritize. |
| int4-s5-ground | the counter surveillance drone spawns | FERRER | all | That's not looking at the ground. |
| int4-s5-meaning | after s5-ground | IBARRA | all | Meaning? |
| int4-s5-us | after s5-meaning; PROTECT AERIAL SURVEILLANCE | FERRER | all | It's looking for us. |
| int4-s5-team | SUPPORT GROUND INTERCEPT opens | ROJAS | all | Ground team has one Network vehicle. |
| int4-s5-picture | after s5-team | VEGA | all | Pilot, give them the picture. |
| int4-s5-keep | a pilot's last strategic track left while supporting | VEGA | all | (new) Keep one of them. Whatever happens on the road. |
| int4-s6-mark | `route(network-2, silo-viejo)` | IBARRA | all | Mark that location. |
| int4-s6-chain | three storage items captured | IBARRA | all | That's not a local supply chain. |
| int4-s6-far | after s6-chain | VEGA | all | How far? |
| int4-s6-map | after s6-far | IBARRA | all | Farther than our map. |
| int4-s6-running | the observer withdraws | ROJAS | all | Running? |
| int4-s6-no | after s6-running | IBARRA | all | No. |
| int4-s6-what | after s6-no | ROJAS | all | Then what? |
| int4-s6-see | after s6-what | IBARRA | all | I think he came here to see what happened to his organization. |
| int4-gs-route | GROUND SUPPORT, the team moving | ROJAS | GROUND SUPPORT | (new) Tell me what's on the road ahead of my people. Not later. Now. |
| int4-in-search | INTERCEPTOR, a searcher near a friendly aircraft | FERRER | INTERCEPTOR | (new) It's getting close to one of ours. Get between them. |
| int4-tr-faction | TRACKER, a faction dealt in the breakdown | IBARRA | TRACKER | (new) Yours is the one going your way. Don't trade it for a better one. |

Spanish: in the same rows; ustedes; "La Red" for the Network on the
card and in the lines.

### What the player learns

The hardest target looks like everything else. Clues, not omniscience.
Three factions, one corridor. You cannot watch everything; choose, and
know what you gave up.

---

## M5. The Last Column (`interior-5`): planned, Under development

**Type:** full spectrum aerial overwatch, campaign finale. **Tone:**
dense, pressured, ambiguous, then reflective. **Time:** pre dawn into
sunrise; the final cinematic in morning light. **Weather:** low mist in
hollows, clear above. **Length:** 40 to 55 minutes. **Platforms:** the
full package; weapons available but governed by identification and the
one authorization.

**Loading card:** a black and white archival photograph (an
unidentified young man beside a primitive shelter, face not legible):
"Organizations survive longer than the reasons they were created."
MISSION 05, THE LAST COLUMN, OPERATION TYPE: JOINT AERIAL OVERWATCH,
STATUS: HIGH PRIORITY. (The photograph is a staged in engine still,
never a real photograph; the face is turned or out of focus.)

**Briefing.** EN: "Movement from three known sectors is converging.
Historical identities, younger cell members, possibly the Network.
Ground forces will move only after we build the picture. No assumptions
today."

### Places used

Monte Cerrado, Claro Viejo's surroundings, Rincón Quemado, the three
exits (west, south east, north), Rancho Sin Nombre, Vado del Manso; the
final cinematic flies over Sector Alpha, Puente Doble, Ruta Vieja,
Claro Viejo (1.9).

### Stages

| # | Stage (checkpoint) | Script | Opens on | Objectives | World and spawns | Exit |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `M5_CP_START` | M5_00 to M5_04 | the intro's hand off | LOCATE CONVERGING CONTACTS; FOLLOW CONVERGENCE; MAP THE GATHERING: old faction cluster, new faction cluster, Network representative, lookouts, key vehicles, communications point, exit routes (card INTELLIGENCE PICTURE N % COMPLETE); no combat | groups A Old Column (on foot and two old motorcycles, from the west; one is M2's eastern observer's bike), B New Column (two vehicles from the south east), C a Network vehicle (north), D civilians and neutral traffic; the gathering found gradually (heat, then structures, then vehicles, then people); fourteen visible at dawn; scripted observations: an older member enters a structure, younger members stay outside, a New Column contact meets the Network representative apart, a courier moves between | the picture at 80 % and the fracture observed; card ORGANIZATIONAL FRACTURE CONFIRMED |
| 2 | `M5_CP_PICTURE_BUILT` | M5_05 | stage 1's exit | TRACK PRIORITY CONTACTS; SUPPORT GROUND MOVEMENT; PROTECT AERIAL PICTURE (competing on purpose) | ground teams move; lookouts leave, vehicles reposition, radio traffic rises, some contacts disperse; unknown aircraft launch | the first enemy drone airborne |
| 3 | `M5_CP_GROUND_MOVE` | M5_06 | stage 2's exit, 30 to 60 s later | restore a functional picture: switch to a redundant platform | the scripted disruption (N11) on the seats flying the ISR and the first TRACKER: video distortion, confidence decay on the marks, intermittent blackout, delayed card updates, for 60 to 90 s; aircraft fly normally (no link loss in the flight model) | a functional feed restored on any platform, or the window ends |
| 4 | `M5_CP_AIRSPACE_CONTEST` | M5_07, M5_08 | stage 3's exit | choose which air contact to prioritize; then SELECT PRIORITY TRACK as the gathering breaks | three airborne contacts (the line counts them): two merely observe, one threatens the ISR's picture in game terms; pilots evade, intercept or keep watching under pressure; then OLD COLUMN west, NEW COLUMN south east, NETWORK north, unknowns scatter; several strike requests appear (refused unless confirmed) | `route(archive-car, leave)` and the archive vehicle seen, or Ibarra's prompt and a search area if not seen in 40 s |
| 5 | `M5_CP_ARCHIVE_SITE` | M5_09, M5_10 | `route(archive-car, rancho)` | FOLLOW THE UNUSUAL VEHICLE; DOCUMENT THE MATERIAL: old photographs, faded insignia, notebooks, obsolete radios, historical records, newer references linking the younger faction and the Network (three needed, six for `M5_ARCHIVE_COMPLETE`) | an older ordinary car leaves at low urgency; at Rancho Sin Nombre an older man unloads boxes and equipment; RECON close; abrupt quiet: music out, radio sparse | three items captured, then the commander's call |
| 6 | `M5_CP_FINAL_DECISION` | M5_11, END_A, END_B, END_C, M5_12, stinger | the commander's authorization | FINAL DECISION (no menu: actions, N19) | the archive and the man stay in view; the strike platform armed on the authorized target; the transmit action available to the host's seat; a window of 90 s, then the car departs | EXECUTE, PRESERVE or FOLLOW, then the ending film, the final cinematic, the title, the stinger |

### The final decision (host's seat)

Owner, PLAN 8: "the M5 final order is the host's, with the squad's
captures". For the beat, roles are locked; the host is handed the strike
platform and the transmit action if they hold neither (a hot swap to the
strike platform over the archive). Other pilots keep their aircraft and
their cameras on the archive; their captures count for PRESERVE.

- **EXECUTE:** the host's strike on the authorized archive vehicle:
  white out, the feed returns, the archive destroyed. No music.
- **PRESERVE:** the host holds the archive in frame and the transmit
  action until ARCHIVE TRANSFER COMPLETE (20 s; every squad capture of
  the archive counted into it), before any strike.
- **FOLLOW:** no strike and no transfer within the window: the commander
  repeats, the car leaves, the squad follows it to Vado del Manso, where
  the old man meets another aging figure and they exchange the archive.
- The room records `M5_FINAL_CHOICE`. None of the three is a failure.

### Dials

Each faction's approach route (two each), the fourteen's places in the
gathering (two layouts), which air contact threatens, the archive car's
route to the rancho (two), which seats the disruption hits first.

### Recovery and fails

- **Soft and hard** (1.7) for priority contacts and the archive car;
  the archive vehicle always becomes discoverable by direct
  observation, Ibarra's prompt, or later reacquisition (the script).
- **One faction escapes unclassified** (soft fail, a branch): the
  debrief and the ending montage show its gap.
- **Fail:** all critical aerial surveillance lost during the main
  operation; catastrophic repeated misidentification (two errors);
  leaving the area during the critical operation.
- **Never fail** for EXECUTE, PRESERVE or FOLLOW.

### Stars and flags

1. **The whole picture**: the complete archive (`M5_ARCHIVE_COMPLETE`,
   THE WHOLE PICTURE).
2. **Clean hands**: zero misidentification and no unconfirmed
   engagement.
3. **Every face we knew**: every recurring contact positively identified
   (the eastern observer's bike, the old courier, the old observer, the
   younger members from M2).

The endings are not graded. YOU'RE LOOKING FOR THE TRUTH: PRESERVE with
every major intelligence objective. Reads `M2_ALL_WATCHERS_FOUND` (the
bike line), `M4_CACHE_DOCUMENTED` (Network contacts named "Network" at
once, else "possible Network" until the meeting apart is seen), and
every flag for the final cinematic's inserts.

### Roles and co-op

| Role | Kind | M5 |
| --- | --- | --- |
| ISR | core | the search, the gathering, the picture |
| TRACKER | core one copy, scaling | the converging groups, the leadership contacts, the breaking factions |
| RECON | core | the gathering's detail, the archive |
| RELAY | core | keeps the recon's feed in Monte Cerrado's hollows |
| INTERCEPTOR | core, scaling | the airspace contest |
| GROUND SUPPORT | core | Rojas's road coverage |
| STRIKE | core in stage 6 | the one authorized target; the host's for the decision |

- **Minimum 1:** solo holds all; the disruption makes them switch
  (that is the beat); a solo pilot can finish because the archive is
  always made discoverable.
- **Useful maximum 8:** one per core role plus a second tracker. Past 8:
  more trackers on the scattering unknowns, more interceptors.
- **Scales:** tracks held, interceptors; the air contest's pressure (the
  first three are fixed because the line counts them; from the fourth
  pilot, one more observer drone joins every two minutes, no line
  counting it), timing windows. Never the fourteen.
- **Host:** the final decision. If the host leaves during it, the room's
  next host inherits the beat and its window restarts.
- **Guides:** Vega to all; Ibarra to ISR, TRACKER, RECON; Ferrer to
  RELAY, INTERCEPTOR and the disruption for everyone; Rojas to GROUND
  SUPPORT and STRIKE.

### Music

Information overload through stages 2 to 4, all three identities
overlapping; abrupt quiet at the archive; silence over the decision; no
triumphant music after EXECUTE.

### Radio

The intro (M5_00), the endings, the final cinematic and the stinger are
films (INTROS M5).

| id | cue | who | heard | EN |
| --- | --- | --- | --- | --- |
| int5-s1-bike | `seen(old-bike)` and `M2_ALL_WATCHERS_FOUND` | IBARRA | all | Same bike from the eastern observer. |
| int5-s1-possible | `seen(old-bike)` without the flag | IBARRA | all | Possible historical contact. |
| int5-s1-him | a recurring old contact identified | IBARRA | all | That's him. |
| int5-s1-unknown | a converging contact with no history | IBARRA | ISR, TRACKER | Unknown. |
| int5-s1-many | dawn and the gathering 60 % mapped | ROJAS | all | How many? |
| int5-s1-fourteen | after s1-many | FERRER | all | Visible? Fourteen. |
| int5-s1-fourteen2 | after s1-fourteen | ROJAS | all | Fourteen? |
| int5-s1-cover | after s1-fourteen2 | IBARRA | all | Maybe more under cover. |
| int5-s1-thatsit | after s1-cover, then 6 s of silence | ROJAS | all | That's it? |
| int5-s1-hold | the picture at 80 % | VEGA | all | Ground teams hold. |
| int5-s1-mixing | after s1-hold | IBARRA | all | They're not mixing. |
| int5-s1-together | the four fracture observations seen | IBARRA | all | They're not meeting together. |
| int5-s1-explain | after s1-together | VEGA | all | Explain. |
| int5-s1-cant | after s1-explain | IBARRA | all | I can't. |
| int5-s1-command | after s1-cant, a beat | IBARRA | all | But whatever this is, it isn't a command meeting. |
| int5-s2-teams | stage 2 opens | ROJAS | all | Teams moving. |
| int5-s2-warning | lookouts leave | IBARRA | all | Warning network. |
| int5-s2-leaders | after s2-warning | VEGA | all | Pilot, keep the leadership contacts. |
| int5-s2-road | after s2-leaders | ROJAS | all | I need road coverage. |
| int5-s2-aircraft | the first enemy drone launches | FERRER | all | Unknown aircraft launching. |
| int5-s3-degraded | the disruption starts | FERRER | all | Feed degraded. |
| int5-s3-cause | after s3-degraded | VEGA | all | Cause? |
| int5-s3-dontknow | after s3-cause | FERRER | all | Don't know. |
| int5-s3-switch | a blackout on the ISR seat | FERRER | all | Switch platform. |
| int5-s3-alive | a functional picture restored within 20 s | FERRER | all | Good. Keep that feed alive. |
| int5-s3-east | a feed restored | ROJAS | all | We have movement east. |
| int5-s3-ignore | after s3-east | IBARRA | all | Ignore it. |
| int5-s3-excuse | after s3-ignore | ROJAS | all | Excuse me? |
| int5-s3-west | after s3-excuse | IBARRA | all | Old faction is moving west. That's the historical leadership. |
| int5-s3-decides | after s3-west | VEGA | all | Pilot decides. |
| int5-s4-three | stage 4 opens | FERRER | all | Three airborne contacts. |
| int5-s4-whose | after s4-three | ROJAS | all | Whose? |
| int5-s4-knew | after s4-whose | FERRER | all | If I knew, I wouldn't call them contacts. |
| int5-s4-lose | the gathering breaks | ROJAS | all | We're going to lose them. |
| int5-s4-chase | after s4-lose | VEGA | all | Do not chase every vehicle. |
| int5-s4-lose2 | after s4-chase | ROJAS | all | We're going to lose them. |
| int5-s4-knowing | after s4-lose2 | VEGA | all | Then we lose them knowing what they are. |
| int5-s4-wait | the archive car unnoticed for 40 s; SEARCH AREA | IBARRA | all | Wait. |
| int5-s4-that | after s4-wait, or the car seen | ROJAS | all | That? |
| int5-s4-keep | after s4-that | IBARRA | all | Keep watching. |
| int5-s5-closer | the man unloads boxes | IBARRA | all | Get closer. |
| int5-s5-oh | the second archive item captured | IBARRA | all | Oh. |
| int5-s5-what | after s5-oh | VEGA | all | What? |
| int5-s5-org | after s5-what | IBARRA | all | That's the organization. |
| int5-s5-talking | after s5-org | ROJAS | all | What are you talking about? |
| int5-s5-people | after s5-talking | IBARRA | all | Not the people. |
| int5-s5-memory | after s5-people, a beat | IBARRA | all | The memory. |
| int5-s5-everything | the fourth archive item captured | IBARRA | all | They documented everything. |
| int5-s5-capture | after s5-everything | FERRER | all | Can we capture it? |
| int5-s5-doing | after s5-capture | IBARRA | all | Already doing it. |
| int5-s6-auth | stage 6 opens | COMMANDER | all | Air element, target confirmed hostile. Strike authorized. |
| int5-s6-pilot | after s6-auth, 4 s of silence | VEGA | all | Pilot. |
| int5-s6-heard | after s6-pilot | VEGA | all | You heard the authorization. |
| int5-s6-yours | after s6-heard, a beat; card FINAL DECISION | VEGA | all | Your aircraft. |
| int5-s6-upload | the host starts the transmit action | FERRER | all | Full-resolution upload? |
| int5-s6-execute | the window at 45 s, no action | COMMANDER | all | Air element, execute. |
| int5-s6-pilot2 | after s6-execute | VEGA | all | Pilot? |
| int5-gs-road | GROUND SUPPORT, a team's road unwatched | ROJAS | GROUND SUPPORT | (new) My road. Somebody, my road. |
| int5-in-threat | INTERCEPTOR, the threatening contact closing on the ISR | FERRER | INTERCEPTOR | (new) That one's going for our picture. Not the others. That one. |

The endings' lines (END_A news, ROJAS, IBARRA; END_B ROJAS, IBARRA,
VEGA; END_C IBARRA, ROJAS) and the final cinematic's are film lines in
INTROS M5. Spanish: in the same rows; ustedes; the commander's lines in
a flat procedural register ("Elemento aéreo, blanco confirmado hostil.
Ataque autorizado.").

### What the player learns

The organisation is fourteen people and a box of memory. Everyone wants
something from the pilot at once. Seeing the truth does not tell you
what to do with it; the choice is an interpretation, not a grade.
