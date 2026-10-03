# Defend the Paraná: the story bible

Written 2026-10-02 for the owner's request of that day: "a new intro for
every single mission ... custom missions ... interesting ... story driven
... different ... in stages ... buildup ... telling a story ... like a real
200 million dollar game". This file is the world, the people on the radio
and the rules of tone. MISSIONS.md is Act 1 mission by mission, INTROS.md
is each mission's film, TECH-NEEDS.md is what the engine has to grow, and
OVERVIEW.md is the one page for the owner.

The hard rules come first because everything else is built inside them.

## 0. The rules nothing in the story breaks

These are the owner's decisions (docs/WARFARE-PLAN.md section 0) and the
voice script's rules (`tools/voice/script.py`), restated so a writer does
not have to go looking.

1. **Defend only, co-op against the room's AI, kamikaze only.** The
   players never attack anything. Every story beat is a defence.
2. **No people shown harmed, ever.** Aircraft break, structures burn,
   lights go out, water moves. The camera never shows a person, and no
   line describes a person hurt. Where the story needs the human stakes
   (a town, a hospital, a riverbank) it says the place is dark, on backup
   or already cleared, never that someone is hurt.
3. **The enemy is never named.** No state, no group, no insignia, no
   slogan, no flag, no language of its own on screen. Its aircraft are
   unmarked grey. On the radio it is "they", "the launchers", "the other
   side of the water", or simply the contacts. Its design label in these
   documents is **the Aggressor**, and that word is never spoken or
   shown.
4. **No real organisations speak, and no real people.** The dam, the
   towns, the river and the lines are real places; the people on the
   radio are fictional volunteers. No real military unit, ministry,
   utility or plant operator is cast, quoted or named as a participant.
5. **No real figure is spoken.** No digit in any line, and no spelled
   number that reads as a quantity (megawatts, counts, casualties,
   distances). Designators are fine ("intake seven", "mission three"),
   counts are not ("six contacts"). The HUD carries every number; the
   radio carries meaning. This rule turned out to be a gift: the voices
   call bearings by landmarks ("off the east shore", "out of the west
   arm"), which is how people who live there would talk anyway.
6. **The squad is ustedes.** Every Spanish line addresses the pilots in
   the plural (the checker rejects tú forms). Voseo is not used on air.
7. **No en or em dashes** in any line, note or document (CLAUDE.md).
8. **Mature content, gated.** Everything here sits behind the war's
   consent screen (WARFARE-PLAN section 9). Tone, not gore, is what makes
   it adult.
9. **No signal, no jamming in the flight model** (owner, 2026-09-29). The
   Aggressor's doctrine below includes electronic warfare because a
   credible 2030 adversary would use it, but no Act 1 mission depends on
   a defender losing a link, and no mission breaks up the radio voices
   either (the lead's decision of 2 October, under the owner's rule; it
   can be revisited if the owner asks). Electronic warfare is backstory.

## 1. Premise

It is 2030. For a month a war nobody declared has been fought against the
region's power. Substations, fuel depots and relay towers along the
river have been hit by cheap unmarked drones launched from somewhere
beyond the horizon: no pilots to capture, no aircraft to shoot down that
cost more than the missile that would kill it. The air defence that
existed ran out of interceptors in the first week (the 2030 prologue's
line, kept).

Itaipu has not been touched. It is the largest thing on the river: twenty
generating units in one long wall of concrete between Paraguay and
Brazil, the spillway on the right bank, the switchyard behind it, and the
500 kV lines that carry its power to both countries. Everyone on both
banks knows that if the war comes to the river, it comes here.

What the two banks have is their own pilots. Hobby fliers, racers, farm
survey crews, the model aircraft club, the kid who builds whoops in his
kitchen: a volunteer cell organised on the dam's crest, flying everything
they own with a warhead slung under it. One flight, one kill. They call
themselves nothing in particular; the radio calls them **pilots of both
banks**.

Act 1, **Defend the Paraná**, is the three days in which the war comes to
the dam.

## 2. Stakes, and how they are shown

The stakes are never bodies. They are, in rising order:

| Stake | How the player sees it | How the radio says it |
| --- | --- | --- |
| Output | The HUD's megawatts, the twenty unit bars | "We're losing output", "we just lost a unit" |
| The lights | Towns going dark district by district at night (src/share/war/grid.js and look/night.js already do this: a hit sheds districts in order, with a flicker) | Despacho names the towns: "Hernandarias is on backup", "the Foz side just dropped" |
| Control of the river | Gates that cannot open; the spillway that must spill and cannot | "If they take the gates, we lose the river" |
| The dam itself | An opening in the face; real water moving through it (the dam break solver in progress); the gantry lowering the stoplogs | Possible in any mission where a hit gets through (decided 2 October), always answered by a Contain hold (MISSIONS.md 1.9); in Breach it is the enemy's whole aim |

The output number is the score. The lights are the emotion. The water is
the fear.

## 3. Escalation across Act 1

Each mission moves the Aggressor one step up its ladder. The player
should feel the enemy learning.

| Day | Mission | The Aggressor's step | The defenders' lesson |
| --- | --- | --- | --- |
| Day 1, dawn | 1 First Light | Probes: one scout, single Strikers on different bearings, timing the response | Kill the eyes first; intercept, do not chase |
| Day 1, afternoon | 2 The Spillway | Saturation on one structure: Loiterers from above, boats on the water at once | Split by altitude; the water is a lane |
| Day 1, dusk | 3 Lights Out | Deception: decoys in the Striker stream, the real one hidden in the pack | Close before you spend a bird |
| Night 1 | 4 The Long Night | Darkness and hunters: sea drones with no lights, Hunter FPVs that come for the pilots | Fly for each other; read the markers |
| Day 2 | 5 The River Below | A new axis: from downstream, up the gorge, a carrier boat that launches swarms | Kill the source, not the stream |
| Day 2, dusk | 6 The Corridor | Strategic: cut the plant off from the grid by the lines, not the dam | Spread out; the spotters see for everyone |
| Day 3, before dawn | 7 Breach | The line nobody should cross: an attempt to open the dam to the river | Everything at once; and if it opens, contain it |

## 4. The Aggressor's doctrine

Written so the mission designer can make attacks feel authored by one
mind that adapts, not spawned by a timer. Each technique below is a
mechanic the mission engine can express (TECH-NEEDS.md names what each
needs). Nothing here is real-world tactics beyond what any news reader
already knows; it is a game's adversary.

### 4.1 Principles

1. **Cheap mass beats expensive precision.** Every attacker costs less
   than the defender's airframe it eats. Its main weapon against the
   defence is the **rack**: four birds a pilot a stage, one more a kill.
   Every attack is designed to make a pilot spend a bird badly.
2. **Look first.** Scouts circle before a real attack. While a scout
   lives, the next attackers fly exact lines; once every scout is dead
   they fly with error (WARFARE-PLAN 4.2, built). Story: the eyes matter.
3. **Never the same door twice.** After an attack is beaten on one
   bearing, the next comes from another. In the engine this is the seeded
   azimuth draw plus the adaptive axis (TECH-NEEDS T1.5): the room favours
   the bearing where the defenders killed least.
4. **Pull, then push.** A visible attack on one side to pull the
   defenders there, the real one on the other (the twists in MISSIONS.md
   are mostly this).
5. **Hit what costs most to fix.** The switchyard before the turbines; the
   lines before the yard; the gates before anything, because the gates
   are the river.

### 4.2 The techniques, in the order the player meets them

| Technique | What it looks like | First in | Counter the player learns |
| --- | --- | --- | --- |
| Probe | A lone Striker on an odd bearing; a scout circling high | M1 | Meet it early; do not chase it into the dam |
| Saturation | Several kinds landing on one structure in the same minute | M1 climax, M2 | Split by height and lane; call who takes what |
| Altitude split | Loiterers circling high over low Strikers | M1, M2 | High planes and the F-16 go up; quads stay low |
| Sea drones | Boats weaving on the reservoir toward the upstream face | M2 | Float planes, slow planes, low quads over water |
| Decoys | Striker lookalikes worth nothing, mixed in the stream | M3 | Get within 300 m before committing (marker truth range, built) |
| Night | No lights on boats; nav lights on the rest | M4 | Markers, spotters, thermal on the Avionics HUD |
| Hunter-killers | FPVs steered at the nearest defender (built) | M1 twist, M4 | Fly in pairs; bait and cross |
| New axis | Up the river from the south, under the gorge rims | M5 | Patrol the gorge; kill the launcher |
| Carriers | A larger boat that launches swarms while it lives | M5 | Kill the source |
| Grid strikes | Towers on the 500 kV corridor, the yard, line crossings | M3, M6 | Spread out; spotters call the corridor |
| Electronic warfare | Nothing: heard of on the news, never heard on the net or felt in flight (no jamming, no breakup) | none in Act 1 | none |
| The dam | Breachers: heavy slow sea drones built to open a gate or an intake | M7 | Kill them far out; if one gets through, contain |

### 4.3 How it adapts inside a mission

The room is the only author, so the "mind" is a small deterministic
director (TECH-NEEDS T1.5) that reads what the room already knows:

- **Where the defenders killed.** The next stage's bearing is drawn
  weighted away from the sector with the most kills in the stage just
  played.
- **How the defenders spent.** If the squad ended a stage with most of
  its rack spent, the next stage's opening is lighter and longer (the
  Aggressor thinks it has won the trade and probes again); if the squad
  spent little, the next opening is heavier and faster.
- **Whether its eyes are open.** A stage that starts with a live scout
  gets exact routes; with none, error. The radio tells the players this
  every time it matters, so killing scouts becomes a habit with a reason.

## 5. The friendly side

### 5.1 Who they are

A volunteer cell on the crest, run from a room in the crest's service
building that the camera never enters. Nobody in it is a soldier. Their
equipment is what the two banks owned on the first of the month, armed in
a shed on the crest road (the prologue's hangar shot, kept).

The players are the pilots. The radio is five voices, each with a job,
so a line's speaker tells the player what kind of information it is
before the words do.

### 5.2 The voices

Each voice has its own radio colour so they are told apart in a fight
(TECH-NEEDS T3.3). The Kokoro stock voices named are candidates to
audition, checked against the installed Kokoro's own voice list before
anyone builds with them; the pipeline clones each from a synthetic
reference, so no real person's voice is used (tools/voice/build.py).

#### CREST (Crest Control / Control Cresta): the commander

- **Who:** a retired operations engineer who knows every unit of the
  plant by its number and has been awake for three days. Runs the cell.
  Already the voice of every war line today (`am_onyx`, `em_alex`); he
  stays.
- **Job on air:** orders, the state of the plant, the mission's frame.
- **Personality:** calm by discipline, not by nature. Dry. Speaks in plant
  terms (units, output, the face, the gates). Praise is rare and short.
  When he raises his voice it means something.
- **Speech, English:** short declaratives, no filler, imperative mood.
  "Copy." "Hold what you have." "Both banks, on me." Signs off big
  moments with "Crest out."
- **Speech, Spanish:** neutral Paraguayan formal, ustedes always.
  "Copiado." "Mantengan lo que tienen." "Las dos márgenes, conmigo."
  "Cresta, fuera."
- **Radio colour:** the existing filter: clean console, narrow band.

#### MIRADOR (Mirador): intel and the eyes

- **Who:** the analyst on the observation post at the shore (the name is
  the lookout, after the Mirante viewpoint on the map). Reads the radar,
  the cameras on the towers, and the spotters' calls. Younger than Crest;
  sharper; sleeps less.
- **Job on air:** what is coming, from where, and what it means. Every
  bearing is a landmark.
- **Personality:** fast, precise, hedged where she is unsure ("probable",
  "consistent with"), never guesses out loud twice. Dry humour only when
  things are quiet. She is the one who notices the pattern first, which
  makes her the twist's messenger in most missions.
- **Speech, English:** clipped reports, landmark first, then kind, then
  intent. "East shore, low, boats. Heading for the face."
- **Speech, Spanish:** same order. "Costa este, bajo, lanchas. Rumbo a la
  cara."
- **Candidates:** `bf_emma` or `af_nicole` (en), `ef_dora` (es).
- **Radio colour:** wider band, a faint data hiss under it.

#### TALLER (Taller): the hangar chief

- **Who:** the man in the shed who straps the warheads on. Older, a
  mechanic all his life, owns half the aircraft in the rack himself.
- **Job on air:** the rack, the aircraft, resupply between stages, the
  occasional dry morale line. He is the warmth in the net.
- **Personality:** gruff, practical, affectionate about machines,
  allergic to speeches. Talks about aircraft as birds and sometimes by
  name ("the yellow Cub"). Never jokes about anything being hurt.
- **Speech, English:** plain, a little rough. "Birds are hot. Go."
- **Speech, Spanish:** Paraguayan, with a little Guaraní where a
  Paraguayan would use it, never more than a word a line and never a
  word the scene needs to be understood: "jaha" (let's go), "aguyje"
  (thanks), "ndaipóri" (there are none). Each Guaraní word needs a
  `heard` reading checked through Whisper (TECH-NEEDS T3.2).
- **Candidates:** `bm_george` (en), `em_santa` (es).
- **Radio colour:** handheld, more room noise, a fan somewhere.

#### DESPACHO (Dispatch / Despacho): the grid

- **Who:** the load dispatcher on a patched line from the regional grid
  control room, far from the dam. Never seen, never named, never says
  who employs them (rule 4).
- **Job on air:** consequence. What the hits mean beyond the dam: which
  towns are dark, what is on backup, how long a reroute takes.
- **Personality:** procedural and cool, the only voice on the net that
  is not in danger, and that distance is what makes their lines land.
- **Speech, English:** "Hernandarias is on backup. Rerouting." 
- **Speech, Spanish:** "Hernandarias está con respaldo. Redirigiendo."
- **Candidates:** `am_michael` (en), `pf_dora` reading Spanish (es; a
  Brazilian Portuguese voice gives the Foz side's dispatcher a colour of
  the other bank; audition, and drop it for `ef_dora` with a pitch shift
  if Whisper or the owner rejects it).
- **Radio colour:** telephone band, compressed, a line hum.

#### CARANCHO (Carancho): the other flight

- **Who:** the lead of a second volunteer flight working the river below
  the dam on the Brazilian bank, named for the hawk. Off screen almost
  always; in mission 5 the players fly into Carancho's sector.
- **Job on air:** the war beyond the player's sight. Carancho's flight
  takes the hits the players hear about: "Carancho's out of birds, we're
  falling back to the bridge." Aircraft lost, never people.
- **Personality:** young, quick, warm, a little reckless. Uses a
  Portuguese word now and then ("beleza") because that is how the border
  talks.
- **Candidates:** `am_puck` or `am_eric` (en), `pm_alex` reading Spanish
  (es), auditioned as Despacho's.
- **Radio colour:** the farthest: more static under him, never a dropout.

All five are in (the owner, 2 October).

### 5.3 The pilots, on air

The players have no callsigns on air: the radio addresses "pilots",
"both banks", or a sector ("west side", "anyone on the water"). A line
never names a player, because every line is generated before anyone
joins. The HUD names players (`war.kill_by`, built); the radio does not.

## 6. Tone

- **Sober.** These are tired people doing a hard job. Nobody cheers a
  kill beyond "good kill". Nobody makes a speech.
- **Tense.** Silence is used. The best line in a stage is often the one
  that is not said: Mirador saying nothing for twenty seconds when the
  scope is quiet is part of the score.
- **Credible.** Plant vocabulary (units, intakes, penstocks, gates,
  output, station service), landmarks the map really has, aircraft the
  hangar really has. No technobabble, no superweapons, no countdown to a
  nuclear anything.
- **No glorification.** The war is not exciting to the people in it. The
  win line is relief ("the lights stay on tonight"), never triumph. The
  enemy is never mocked and never a cartoon.
- **Bilingual by nature.** Both banks, two languages, one net. The
  Spanish is written as Spanish, not translated English: idiom first.

Reference points for the feel, not to copy: the radio nets of documentary
footage, a control room on a bad night, the quiet of a dispatcher's voice.

## 7. Themes

1. **What a few people can hold.** A handful of hobby aircraft against a
   machine that does not get tired.
2. **Infrastructure is the people.** A dam is the lights in a kitchen in
   Hernandarias. The story shows the kitchen's window going dark, never
   the kitchen.
3. **Two banks, one river.** Paraguay and Brazil share the dam; the cell
   shares the net. The other bank is never the enemy.
4. **The cost of the trade.** Every kill costs a bird. The rack is the
   theme made into a rule.
5. **Restraint.** The water is never used as spectacle until it has to
   be, and then it is shown as a thing to stop.

## 8. Telling a story with no one on screen

The camera never shows a person, so the story is carried by five
channels. Each mission uses all five; MISSIONS.md marks which beat uses
which.

1. **The radio.** Five voices with distinct jobs and colours. The story's
   spine. Lines are short (one to five seconds), timed to events, and
   never talk over each other (warradio.js's queue, built, plus the
   priorities in TECH-NEEDS T3.1).
2. **The HUD.** Output falling, unit bars going out, the rack, objective
   lines that appear and change ("HOLD THE YARD: REROUTE 60 %"), the
   stage's title as a lower third. Text the HUD shows is the one place a
   number may appear.
3. **The world.** Lights going out across the towns (built, grid.js),
   smoke from a hit target (built), the spillway open and spilling (needs
   a spill state, TECH-NEEDS T1.9), the time of day moving across a
   mission (dusk to dark, night to dawn), water moving when the dam opens.
4. **The camera.** Each mission's intro (INTROS.md), and in mission a
   short authored camera moment at most once a mission (a two second
   cut to a breach, or to a town going dark) only where it cannot cost a
   pilot their aircraft: between stages, while every pilot is on the
   ground or respawning, never in live flight (TECH-NEEDS T2.9).
5. **The music.** Cues per stage: ambient while the scope is quiet,
   pulse when contacts are called, full when they land, a sting for the
   twist, a release when a stage clears (TECH-NEEDS T3.4).

Things that are never used, because they need a person: cutscenes of the
control room, faces on a screen, hands on a bench, a pilot's breathing.
The hangar is shown empty, the aircraft standing on their own.

## 9. Words

A short glossary so every line uses the same words in both languages
(extends docs/SPANISH-GLOSSARY.md, whose game wide terms still hold).

| English | Spanish | Note |
| --- | --- | --- |
| bird | aparato | an aircraft of the rack (built lines use it) |
| rack | aparatos (the rack is never "rack" on air) | |
| both banks | las dos márgenes | |
| the face (upstream) | la cara (aguas arriba) | |
| intake | toma | |
| penstock | tubería forzada | |
| spillway gate | compuerta del vertedero | |
| switchyard | subestación | |
| the lines | las líneas | the 500 kV corridor |
| unit | unidad | a generating unit |
| output | generación | |
| Striker | dron de ataque | |
| Loiterer | merodeador | |
| Swarm | enjambre | |
| Hunter | cazador | |
| sea drone, boat | dron naval, lancha | |
| decoy | señuelo | |
| scout | explorador | |
| carrier | nodriza | new kind, mission 5 |
| breacher | rompedor | new kind, mission 7 |
| splash | uno menos | a kill |
| reroute | redirigir | Despacho |
| backup | respaldo | |
| breach | brecha | said whenever the face opens |
