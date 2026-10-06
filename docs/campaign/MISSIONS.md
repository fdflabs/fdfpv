# Defend the Paraná, Act 1: the missions

Written 2026-10-02. Seven missions at Itaipu, in order, each told in
stages that open on events, with authored beats and seeded variation so
no two plays land the same way. The world, the voices and the tone are
BIBLE.md; each mission's film is INTROS.md; what the engine must grow for
all of this is TECH-NEEDS.md (cited here as T1.x, T2.x, T3.x).

## 0. Why the missions feel the same today, checked against the code

The owner: "things coming in at the same predictable places, things
happening the same ... wave after wave of the same". The code agrees:

| What the owner feels | Where it comes from |
| --- | --- |
| Same places | A wave names one `route`, a fixed list of points (`missions/itaipu-*.js`). The only variation is the lateral `err` after the scouts die (up to `spread` metres) and which of a group's targets each attacker takes. |
| Same times | A wave's `at` is seconds after its round starts (`edge/rooms/war.js` `births`). No wave waits for anything the players did. |
| Wave after wave | Every round ends the same way (all born, none left but scouts, `roundStep`), then 6 s of result, then the next. There is no build, no lull, no turn. |
| All missions alike | Missions 1 and 4 are the same waves (`itaipu-4.js` spreads `itaipu-1`); 2 and 3 swap the targets and routes but keep the shape. |
| Nothing happens | The radio says the kind of each wave and the hits (`warradio.js`). There is no story line in a mission after its two briefing lines. |
| Same intro | One film for every mission (`warintro.js`), and its title card says "Mission 1" whatever the mission (`str(title.sub, { n: 1 })`). |

The room's `seed` exists and is already drawn per match; today it only
chooses the error and the power line strikes. Everything below spends
that seed on things a player notices.

## 1. The shared vocabulary

### 1.1 Stages

A mission is 4 to 6 **stages**. A stage is today's round with a door and a
purpose: it opens on a **trigger**, has **objectives** shown on the HUD,
sends its **groups**, and closes on its **exit**. Between two stages is a
**beat**: 8 to 25 s where nothing is born, the radio tells the story, the
music releases, and the pilots land, relaunch and breathe.

**The economy is the owner's and does not change** (WARFARE-PLAN 4.5): a
stage is a round. Every pilot starts each stage with the mission's
airframes (4, or the loadout's rack), earns one a kill, and spends one a
loss. A stage is lost when no pilot is still flying, and its attackers get
through, exactly as a round is today. **A lost mission restarts from
the stage it was lost in** (decided 2 October), with the output, the
targets down and the seeded draws it had when that stage opened, and its
stars capped at two (T1.14).

### 1.2 Triggers

The events a stage, a group, a radio line or a twist can wait on. All are
facts the room already knows or can compute (T1.1):

| Trigger | Fires when |
| --- | --- |
| `go` | the countdown ends |
| `enter+[a,b]` | a seeded time in a to b seconds after the stage opened |
| `after(G)+[a,b]` | a seeded time after group G's last attacker died or arrived |
| `cleared` | every group of the stage is born and none but scouts is left (today's round end) |
| `killed(G)` | every attacker of group G was killed by a defender |
| `scoutsDown` / `scoutGone` | the stage's scouts are all dead / one finished its orbit and left |
| `hit(T)` | an attacker reached target T, or any target of part T (`intake`, `gate`, ...) |
| `outputBelow(mw)` | the output fell under mw |
| `held(O)` | hold objective O's timer completed |
| `opening(T)` | the damage model opened target T to the water (the dam break work) |
| `crossed(G, line)` | the first attacker of G crossed a named line (a gate in space: "the islands", "the gorge mouth") |
| `spent(f)` | the squad has spent fraction f of the stage's airframes |

### 1.3 Objectives

Shown on the HUD as one line each, with state (T2 HUD, T1.2):

| Objective | Means | Fails when |
| --- | --- | --- |
| `protect(T...)` | do not let these be hit | (never fails on its own: the output floor is the loss) |
| `kill(G)` | destroy this group | it reaches its target or leaves |
| `hold(O, s)` | keep the named targets standing while a timer runs (a reroute, a spill, a closure) | a named target is hit before the timer ends |
| `spot(G)` | a spotter aircraft gets within spotting range of the group (T1.8) | the group arrives first |

### 1.4 Seeded variation: the four dials

Every mission turns the same four dials from the match's seed (T1.3).
Each stage table below says which dials it turns.

1. **Bearing.** A group names a route *family* (a sector), not a route.
   The seed picks one of the family's routes, never the same family twice
   in a row in a mission, and the adaptive axis weights it away from where
   the squad killed most last stage (BIBLE 4.3, T1.5). Sectors:

   | Sector | Where | Route family (names for T1.4; points authored and checked by `npm run war:routes`) |
   | --- | --- | --- |
   | N | open reservoir north of the dam | `reservoir-mid`, `reservoir-east`, `reservoir-orbit` (built), `reservoir-nne` (new) |
   | NW | the reservoir's west arm, toward the gates and the right bank | `reservoir-west`, `reservoir-west-far`, `channel-low` (built), `west-arm-high` (new) |
   | NE | the east shore, the Brazilian bank | `east-shore-low`, `east-shore-high` (new) |
   | HIGH | high over the islands, any side | `high-east`, `high-west`, `high-yard` (built), `high-north` (new) |
   | WATER | on the reservoir's surface | `surface-east`, `surface-gates` (built), `surface-mid`, `surface-west-arm` (new) |
   | GORGE | up the gorge from the south, under the rims | `gorge`, `gorge-yard` (built), `gorge-left-rim` (new) |
   | RIVER | on the river below the dam | `river-surface`, `river-west-bank` (new; mission 5) |
   | LINES | along the 500 kV corridors | `corridor-west`, `corridor-east` (new; missions 3 and 6) |

2. **Composition.** A group may list alternatives (`fpv` or `loiter`,
   `strike` or a `strike` and `decoy` mix); the seed picks one. The radio
   calls what came, so the call is never wrong.
3. **Timing.** Every `enter` and `after` is a window, not a number. The
   window is wider for small squads (1.6 below).
4. **Twist.** Each mission has two or three twists; the seed picks one
   per match and the others stay possible on a replay. A twist is a
   stage, or a group plus its lines, that changes what the stage is
   about.

What never varies: the stage order, the story's beats, the climax, and
the lines that carry them. Authored where it matters, seeded where it
keeps the player honest.

### 1.5 Music cues

Five layers of one score per mission, crossfaded on the bar (T3.4):

| Cue | When |
| --- | --- |
| `AMB` | the scope is quiet; a beat between stages; the stage's first seconds |
| `PULSE` | contacts called, nothing yet in range |
| `FULL` | the first attacker of a stage is inside 1 km of a target |
| `STING` | a twist fires, an opening, a hold objective appears (one hit, over the layers) |
| `RELEASE` | a stage cleared; drops to `AMB` over 4 s |
| `WIN` / `LOSE` | the mission's end, under the debrief |

### 1.6 Pilot count, 1 to 8

The rules every mission shares; each mission adds its own line.

- **Group size**: `n + per * (pilots - 1)`, as today (`waveSize`).
- **Sectors at once**: a stage's simultaneous bearings are 1 for 1
  pilot, 2 for 2 or 3, 3 for 4 to 6, 4 for 7 or 8. A solo pilot is never
  asked to be in two places; eight pilots always have to split.
- **Timing windows** stretch for small squads: every gap between groups
  is multiplied by 1.6 at 1 pilot, 1.3 at 2 or 3, 1.0 at 4 or more.
- **Hold timers** never change with pilots: they are story time.
- **Twist size** scales like a group; the twist itself is the same.

### 1.7 The radio, per stage

- 4 to 6 lines a stage for mission 1 (the reference), 3 to 5 for the
  rest. Every line is a file in two languages that somebody generates and
  reviews, so the budget is deliberate.
- **Shared calls** (1.8) cover the kinds and the bearings, said by
  MIRADOR (where) then CREST (what to do), so mission lines are only
  the story.
- Line ids are `<mission>-<stage>-<slug>`; twist lines `<mission>-t<a|b|c>-<slug>`.
- The **cue** column is the trigger and the offset the line plays at.
  Lines wait their turn in the radio's queue (built); a story line
  outranks a shared call, an end line outranks everything (T3.1).
- Speakers: CREST, MIRADOR, TALLER, DESPACHO, CARANCHO (BIBLE 5.2), all
  five in (decided 2 October).
- Deliveries are the voice tool's table: calm, firm, urgent, shout.

### 1.8 Shared calls (new), used by every mission

The existing kind calls (`wave-strike`, `wave-loiter`, ... in
`assets/audio/war/lines.json`) stay CREST's. MIRADOR's bearing calls are
said first, so a wave reads "Out of the west arm." then "Strikers, low,
over the reservoir. Fast movers. Cut them off."

| id | cue | who | del | EN | ES |
| --- | --- | --- | --- | --- | --- |
| bearing-n | a group from N is born | MIRADOR | firm | From the north, over open water. | Desde el norte, sobre agua abierta. |
| bearing-nw | from NW | MIRADOR | firm | Out of the west arm. | Desde el brazo oeste. |
| bearing-ne | from NE | MIRADOR | firm | Off the east shore. | Desde la costa este. |
| bearing-high | from HIGH | MIRADOR | firm | High, over the islands. | En altura, sobre las islas. |
| bearing-water | from WATER | MIRADOR | firm | On the water, coming for the face. | Sobre el agua, rumbo a la cara. |
| bearing-gorge | from GORGE | MIRADOR | firm | Up the gorge, under the rims. | Subiendo por el cañón, bajo los bordes. |
| bearing-river | from RIVER | MIRADOR | firm | On the river, below the dam. | Sobre el río, aguas abajo. |
| bearing-lines | from LINES | MIRADOR | firm | Along the lines, low. | Siguiendo las líneas, bajo. |
| beat-rack | a beat opens | TALLER | calm | Birds are on the bench. Come get them. | Los aparatos están en el banco. Vengan a buscarlos. |
| beat-rack-2 | alternate of beat-rack | TALLER | calm | Warheads on. Same as before. | Ojivas puestas. Igual que antes. |
| stage-lost | a stage is lost | CREST | calm | They got through. Regroup on the crest. | Pasaron. Reagrúpense en la cresta. |

### 1.9 When the face opens: Contain, in every mission

Decided 2 October: the dam can open to the water in any mission, not only
in Breach. The damage work (branch `war-damage-structures`) opens an
intake or a gate with a single Striker or boat that gets through, so an
opening is the price of any lapse, and every mission has to answer it.
Breach is the mission built around it; in the others it is the worst
thing that can happen in a stage.

**What happens, the same in every mission:**

1. `opening(T)` fires. `STING`. CREST calls it (`contain-breach`).
2. A **Contain** objective is added to the stage under way, alongside
   whatever it was doing: hold(closure) on the emergency gantry that
   serves the opened structure (`gantry-intakes` for an intake or a
   penstock, whose intake gate closes it from upstream; `gantry-spillway`
   for a spillway gate; T1.6) while it lowers the stoplogs. Closure time:
   120 s for an intake or penstock, 150 s for a gate.
3. The Aggressor sees it. The next group born after the opening is
   retargeted at the gantry, and MIRADOR says so (`contain-retarget`).
4. The stage cannot clear while a closure runs; its beat waits for it.
5. **Held**: the opening closes (the contract's opening event at zero
   size), the water settles (the flood solver), the lost output stays
   lost. The mission's stars are capped at two (*held* is false).
6. **Gantry hit while open**: the plant cannot be made safe and is shut
   down: the mission is **lost** at once, as on the output floor.
7. Two openings at once: one closure per gantry at a time; a second
   opening on the same gantry queues behind the first and the hold
   restarts for it.
8. With the stage restart (1.1), a lost mission restarts with the
   structures as they were when that stage opened, so an opening made in
   the lost stage is undone, and one made before it is open again with
   its closure to run.

No person is ever in the water's way: DESPACHO says the riverbank was
cleared the first night (`contain-river`), and the camera never shows
anyone below the dam.

Each mission below adds one line of its own for an opening, so the same
event lands differently in each.

| id | cue | who | del | EN | ES |
| --- | --- | --- | --- | --- | --- |
| contain-breach | `opening` | CREST | urgent | Water through the face. Lowering the stoplogs. Protect the gantry. | Entra agua por la cara. Bajando las ataguías. Protejan la grúa. |
| contain-retarget | the first group born after an opening | MIRADOR | urgent | They've seen it. They're turning for the crane. | Lo vieron. Están girando hacia la grúa. |
| contain-river | after contain-breach | DESPACHO | calm | The riverbank below was cleared the first night. Nobody is down there. Just close it. | La ribera de abajo se despejó la primera noche. No hay nadie. Solo ciérrenla. |
| contain-half | the closure at half | TALLER | firm | Stoplogs halfway down. Keep them off my crane. | Las ataguías van por la mitad. Que no lleguen a mi grúa. |
| contain-held | closure `held` | CREST | calm | Closed. The face is closed. Back to it. | Cerrada. La cara está cerrada. A lo nuestro. |
| contain-lost | gantry hit while open | CREST | calm | We can't close it. Shutting the plant down. All pilots, pull back to high ground. | No la podemos cerrar. Paramos la central. Todos los pilotos, repliéguense a lo alto. |

## 2. Act 1 at a glance

| # | id | Title | When | New for the player | Length |
| --- | --- | --- | --- | --- | --- |
| 1 | itaipu-1 | First Light | Day 1, dawn | scouts, intercepts, high and low | 9 to 13 min |
| 2 | itaipu-2 | The Spillway | Day 1, afternoon | boats; a hold objective | 10 to 14 min |
| 3 | itaipu-3 | Lights Out | Day 1, dusk into dark | decoys; Despacho; lights going out and coming back | 10 to 14 min |
| 4 | itaipu-4 | The Long Night | Night 1 to sunrise | night; hunters in force | 12 to 16 min |
| 5 | itaipu-5 | The River Below | Day 2, morning | a new axis; the carrier | 11 to 15 min |
| 6 | itaipu-6 | The Corridor | Day 2, dusk | towers; spotters; split the squad | 12 to 16 min |
| 7 | itaipu-7 | Breach | Day 3, before dawn | breachers; the dam opens, or does not | 14 to 20 min |

**Ids stay.** `itaipu-1` to `itaipu-4` are the keys of every pilot's saved
campaign (`src/game/campaign.js` `ACT1`, unlocked in order), so they keep
their ids and their order; 5 to 7 are appended. The titles change
(string keys `war.mission.itaipu_N`). Mission 1 stays the free one.

**Released one at a time** (the owner, 2026-10-04: "only make the first
mission available, until its 100% correct, then only when storyline,
videos, etc. of mission 2 is done do you make that available"). Each row
of `ACT1` carries a `release`: `available` (offered and started),
`development` (built, shown Under development) or `soon` (only planned,
shown Coming soon). The room refuses to start anything not `available`
(`edge/rooms/war.js` start), so a mission is opened by changing its row
and redeploying the rooms server. Today only First Light is available.

---

## M1. First Light (`itaipu-1`)

**Was:** "Defend the intakes", five fixed rounds. **Keeps:** its targets
and MW table (every mission imports them), its floor and stars, its built
routes, the yard Striker early "so the squad learns what a hit costs"
(the owner's rule for round 1), and the swarm up the gorge. **Changes:**
rounds become five stages with triggers; bearings, composition and timing
are seeded; one of three twists fires; its own intro; the radio tells a
story.

**When:** Day 1, dawn into morning. **Time of day:** `morning` (PR
#344, landed; `itaipu-1.js` `time`).

**Premise.** A month into the war, the first contacts over the reservoir.
Nobody knows yet whether the Aggressor means it or is looking. It is
looking, and then it is not.

**Briefing (campaign card).**
EN: "Day one. Something has been circling the reservoir since before
light. The cell is on the crest, the rack is armed, and the intakes on
the upstream face are the obvious target. Kill their eyes first. Then
hold."
ES: "Día uno. Algo da vueltas sobre el embalse desde antes del amanecer.
La célula está en la cresta, los aparatos armados, y las tomas de la cara
aguas arriba son el blanco obvio. Primero derriben sus ojos. Después,
aguanten."

### Stages

| # | Stage | Opens on | Objectives | Groups (seeded dials) | Exit |
| --- | --- | --- | --- | --- | --- |
| 1 | Eyes | `go` | kill(scout), optional: its death makes every later group fly with error | scout on HIGH or N orbit (bearing); one Striker on the yard on NW after `enter+[25,40]` | `scoutsDown` or `scoutGone` or `enter+80`, then `cleared` |
| 2 | Probe | beat 10 to 15 s | protect(intakes) | Strikers, 1 + 0.5/pilot, bearing A on intakes; then `after(A)+[8,15]` a second group on bearing B (never A's sector) | `cleared` |
| 3 | Pressure | beat 12 to 20 s | protect(intakes, gates) | Loiterers on HIGH onto intakes; `enter+[10,20]` Strikers low on N or NE onto other intakes (composition: Strikers, or Strikers with one decoy for 4+ pilots) | `cleared` |
| 4 | The Turn (twist) | beat 15 s | the twist's | one of A, B, C below, plus a covering Striker group on a third bearing | `cleared` |
| 5 | First Light | beat 20 to 25 s | protect(all) | convergence: three groups timed to land within the same 30 s: Loiterers onto gates (HIGH), Strikers onto intakes (N or NE), a swarm onto penstocks (GORGE); plus the kinds of the two twists that did not fire, smaller | `cleared`: mission won if output is over the floor |

Sectors at once scale as 1.6; in stage 5 a solo pilot meets the three
groups staggered 25 s apart, not together.

### The twist (stage 4), drawn by seed

- **A. The back door.** While a Striker pair runs in from the north, a
  swarm comes up the gorge onto the penstocks, the side nobody watches.
  Fires: the swarm's birth. Teaches: watch behind.
- **B. Low water.** Boats along the east shore under a Loiterer, onto the
  east intakes. Fires: `crossed(boats, east-shore-midpoint)`. Teaches:
  the water is a lane.
- **C. They come for you.** The covering Strikers are bait; Hunters rise
  out of the gorge at the pilots. Fires: the Hunters' birth. Teaches: fly
  in pairs.

### Climax

Stage 5: three kinds from three bearings landing together for the first
time, at dawn, with the sun climbing behind the east shore. It is the
whole first mission in one minute.

### Win, lose, stars

As today (WARFARE-PLAN 10a): won with output at or over 7 700 MW at the
end; lost the instant it falls under. Stars: held, noLosses, output over
11 200.

### Roles that shine

| Role | Aircraft | Where |
| --- | --- | --- |
| Interceptor | interceptor quad, F-16, 5 inch | the Strikers of stages 2 and 3 |
| High screen | Zagi, Skyhunter, Bramor, the Striker fixed wing | the scout of stage 1 (it circles slow and high); the Loiterers of stage 3 |
| Close defence | whoop, 5 inch | penstocks in twist A and stage 5 |
| Water | Timber and Cub on floats, Slow Stick, Bombshell | twist B |
| Bait and cross | any pair | twist C |

### Set pieces

- The scout's slow circle at dawn, its nav light the only moving thing in
  the sky (stage 1).
- The first hit of the act, if it comes: the yard's smoke rising on the
  right bank against the morning light.
- Stage 5's three axes visible together from the crest.

### Music

Stage 1 `AMB` until the scout is called, `PULSE` under it; stage 2 `FULL`
on the first Striker inside 1 km; twist `STING`; stage 5 `FULL` from its
first birth; `WIN` or `LOSE`.

### If the face opens

The act's first opening, if the squad lets one through: the dawn light on
water coming out of the downstream face for the first time in the dam's
life. It turns the tutorial's last stage into a hold on the intakes'
gantry, which is the lesson the act ends on, met early.

| id | cue | who | del | EN | ES |
| --- | --- | --- | --- | --- | --- |
| itaipu-1-op | after contain-breach | CREST | calm | This face has never let water through where it shouldn't. Close it. | Esta cara nunca dejó pasar agua por donde no debía. Ciérrenla. |

### Radio

| id | cue | who | del | EN | ES |
| --- | --- | --- | --- | --- | --- |
| itaipu-1-s0-brief | countdown, first | CREST | firm | Pilots of both banks, this is Crest. Something's been circling since before light. | Pilotos de las dos márgenes, aquí Cresta. Algo da vueltas desde antes del amanecer. |
| itaipu-1-s0-rules | countdown, second | TALLER | firm | Every bird has a warhead. One flight, one kill. Every kill earns another. | Cada aparato lleva su ojiva. Un vuelo, un derribo. Cada derribo gana otro. |
| itaipu-1-s1-eyes | stage 1, scout born +3 s | MIRADOR | calm | Something high over the water. Slow. Circling. | Algo en altura sobre el agua. Lento. Dando vueltas. |
| itaipu-1-s1-why | after s1-eyes | CREST | firm | That's their eyes. Take it down and whatever comes next flies blind. | Esos son sus ojos. Derríbenlo y lo que venga después vuela a ciegas. |
| itaipu-1-s1-down | `scoutsDown` | MIRADOR | firm | Scout's down. They just lost their eyes. | Explorador abatido. Acaban de perder los ojos. |
| itaipu-1-s1-gone | `scoutGone` | MIRADOR | calm | It's gone home. They know where we are now. | Se fue. Ahora saben dónde estamos. |
| itaipu-1-s2-probe | stage 2, first group born +4 s | CREST | firm | A single fast mover. They're timing us. Meet it early. | Uno solo, rápido. Nos están midiendo. Salgan temprano a su encuentro. |
| itaipu-1-s2-again | stage 2, second group born | MIRADOR | urgent | Another one, different side. Same speed. | Otro, por otro lado. Misma velocidad. |
| itaipu-1-s2-clear | stage 2 `cleared` | CREST | calm | That was a test. The next one won't be. | Eso fue una prueba. Lo próximo no. |
| itaipu-1-s3-split | stage 3, Loiterers born +2 s | CREST | firm | High and low together. Planes up top. Quads stay on the deck. | Arriba y abajo a la vez. Aviones arriba. Los cuadricópteros, abajo. |
| itaipu-1-s3-hold | stage 3, first kill | TALLER | calm | That's the way. Bring the next bird back in one piece, if you can. | Así se hace. El próximo aparato tráiganlo entero, si se puede. |
| itaipu-1-s3-clear | stage 3 `cleared` | MIRADOR | calm | Scope's clean. For now. | Pantalla limpia. Por ahora. |
| itaipu-1-ta-turn | twist A, swarm born | MIRADOR | urgent | Wait. Movement in the gorge. Behind you. | Esperen. Movimiento en el cañón. Detrás de ustedes. |
| itaipu-1-ta-why | after ta-turn | CREST | urgent | The north run is the decoy. The swarm wants the penstocks. Somebody turn around. | Lo del norte es la distracción. El enjambre quiere las tuberías. Alguien dé la vuelta. |
| itaipu-1-tb-turn | twist B, boats cross the midpoint | MIRADOR | urgent | Wakes on the east shore. Small, fast, low in the water. | Estelas en la costa este. Chicas, rápidas, bajas en el agua. |
| itaipu-1-tb-why | after tb-turn | CREST | firm | Boats. They'll hug the shore all the way to the face. Get down on the water. | Lanchas. Van a ir pegadas a la costa hasta la cara. Bajen al agua. |
| itaipu-1-tc-turn | twist C, Hunters born | MIRADOR | urgent | Those aren't going for the dam. They're turning toward our birds. | Esos no van por la represa. Están girando hacia nuestros aparatos. |
| itaipu-1-tc-why | after tc-turn | CREST | urgent | Hunters. Pair up. One baits, one kills. | Cazadores. Vuelen de a dos. Uno hace de cebo, el otro derriba. |
| itaipu-1-s5-all | stage 5, first birth | MIRADOR | urgent | Contacts everywhere. North, high, the gorge. This is it. | Contactos por todos lados. Norte, altura, el cañón. Es ahora. |
| itaipu-1-s5-order | after s5-all | CREST | shout | Everybody up. Take the closest and don't chase. | Todos arriba. Tomen el más cercano y no lo persigan. |
| debrief-itaipu-1-win | won | CREST | calm | Sun's up and the dam's still ours. Good flying, both banks. | Salió el sol y la represa sigue siendo nuestra. Buen vuelo, las dos márgenes. |
| debrief-itaipu-1-lose | lost | CREST | calm | Too many got through. We go again. | Pasaron demasiados. Vamos de nuevo. |

The two countdown lines and the two debriefs replace today's
`brief-itaipu-1-1/-2` and `debrief-itaipu-1-*` (warradio.js derives the
ids from the mission; T3.1 moves them to `<id>-s0-*`).

### What the player learns

Kill the scout and the next waves miss; meet a Striker early rather than
chase it; high threats for planes, low for quads; something always comes
from the side nobody watches; Hunters want you, not the dam.

---

## M2. The Spillway (`itaipu-2`)

**Was:** "Save the spillway gates", five fixed rounds on the fourteen
gates. **Keeps:** the gates as the target (350 MW each), its floor and
stars, the built routes (`high-west`, `surface-gates`, `channel-low`).
**Changes:** a story (the spill), a hold objective, a working set of
gates drawn by the seed, three twists.

**When:** Day 1, afternoon, after rain upstream. **Time:** `day`, low
cloud if PR #344's cumulus allows a heavier deck.

**Premise.** The reservoir is rising after rain upstream, and the plant
has to spill this afternoon. Only some of the gates are ready to open.
The Aggressor has worked that out.

**Briefing.**
EN: "The reservoir is high and rising. This afternoon we open the
spillway, and only some of the gates are ready to move. If they take the
working gates, we lose control of the river. Keep them off the right
bank."
ES: "El embalse está alto y sigue subiendo. Esta tarde abrimos el
vertedero, y solo algunas compuertas están listas. Si nos sacan las que
funcionan, perdemos el control del río. Que no lleguen a la margen
derecha."

### Stages

| # | Stage | Opens on | Objectives | Groups | Exit |
| --- | --- | --- | --- | --- | --- |
| 1 | High Water | `go` | protect(gates) | scout (NW or N orbit); Loiterers on two gates that are not working from HIGH at `enter+[15,30]` | `cleared` |
| 2 | The Channel | beat 10 to 15 s | protect(gates) | boats on WATER (`surface-gates` or `surface-west-arm`); `after(boats)+[0,10]` or `enter+[30,45]`, whichever first, Strikers low up `channel-low`; all onto gates that are not working | `cleared` |
| 3 | Open the Gates | beat 15 s, then the working gates (seed: 3 of 14, 4 for 4+ pilots) are marked and start to open | hold(working gates, 240 s); the twist's own objective once it is born | Loiterers onto working gates only; the twist at `enter+[40,60]` (B at `enter+[15,30]`) | `held` and `cleared` |
| 4 | Hold the River | beat 12 s | protect(working gates) | convergence: boats, Loiterers, Strikers onto the working gates within 40 s | `cleared` |

The working gates are worth double while the spill runs (T1.9); the HUD
outlines them. A hit working gate in stage 3 fails the hold: the spill
continues on the rest, the debrief says the river was harder to hold, and
the third star needs the hold.

Built 6 October, against the code (war:stages flies it on the room):

- **The hold is four minutes, not two.** Nothing born in stage 3 reaches
  a gate sooner than 117 s after its birth (a Loiterer's circle, a boat's
  run, measured on routes.js's plans), so a two minute hold from the
  stage's entry was never under attack: the headless pass held it with
  nobody flying. Four minutes holds the stage's arrivals; the hoists
  open 2 m to 4 m over it. Twist B's boats start half way down the west
  arm (`west-arm-mid`) and are born at 15 to 30 s, so they arrive inside
  it.
- **Stages 1 and 2 never go for a working gate** (`{ of, not }`
  targets). The Aggressor keeps them for the spill, when a hit costs
  double. Before, a working gate the draw shared with an early list
  could be hit in stage 1, the hold then ran on fewer gates and stage 4
  had nothing left to hit: the same headless pass won the mission with
  nobody flying. Now, with nobody flying, it is lost in stage 3.
- **A hit's death message carries what it cost** (700 for a working gate
  in the spill, 0 for a target already down), so the HUD's call says the
  real number.

### The twist (stage 3)

- **A. Out of the spray.** Loiterers dive out of the spill's mist, where
  the markers lag (T1.9 spray zone hides markers past 150 m).
- **B. The second boat run.** Boats from the west arm while everyone is
  high over the gates.
- **C. Hunters at the chute.** Hunters come for the pilots who go low
  over the channel.

Each twist puts its own objective on the HUD when it is born (`show`),
not at the stage's entry, which would give it away: "Stop the Loiterers
in the spray", "Stop the boats in the west arm", "Kill the Hunters over
the chute".

### Climax

Stage 4, the spill running white down the chute behind the gates the
squad is holding, everything arriving at the working gates at once.

### Win, lose, stars

Floor 11 200, starMw 11 900, as today. A fourth criterion would need the
result's star rules to change; instead the hold is folded into *held*:
a failed hold counts as a damaged stage.

### Pilots

Working gates 3 at 1 to 3 pilots, 4 at 4 or more. A solo pilot's boats
come in single file.

### Roles

Float planes and slow planes on the channel (stage 2); Zagi, Skyhunter,
F-16 over the gates (stage 3); 5 inch and whoop tight on the gate piers;
Hunters baited by pairs (twist C).

### Set pieces

The gates opening (the hoists rising, water starting over the sills); the
spill's spray drifting across the crest road.

### Music

`AMB` with rain texture; `PULSE` on the channel; `STING` as the gates
open; `FULL` for the hold; `RELEASE` when the timer completes.

### If the face opens

An opened gate with the reservoir at its highest is the worst case of the
act before Breach: an uncontrolled spill beside the planned one. The
spill's hold (stage 3) pauses while the spillway gantry closes the
opened gate, and resumes after; the working gates must still be held.

| id | cue | who | del | EN | ES |
| --- | --- | --- | --- | --- | --- |
| itaipu-2-op | after contain-breach | CREST | urgent | With the reservoir this high, that won't stop on its own. Stoplogs first, then the spill. | Con el embalse así de alto, eso no para solo. Primero las ataguías, después el vertido. |

### Radio

| id | cue | who | del | EN | ES |
| --- | --- | --- | --- | --- | --- |
| itaipu-2-s0-brief | countdown, first | CREST | firm | Reservoir's high and still rising. We spill this afternoon, whatever they think about it. | El embalse está alto y sigue subiendo. Esta tarde vertemos, piensen lo que piensen ellos. |
| itaipu-2-s0-rules | countdown, second | MIRADOR | firm | They've been watching the right bank all morning. They know which gates move. | Estuvieron mirando la margen derecha toda la mañana. Saben qué compuertas se mueven. |
| itaipu-2-s1-eyes | stage 1, scout born +3 s | MIRADOR | calm | Something high, circling slow. It's watching the right bank. | Algo en altura, dando vueltas lentas. Está mirando la margen derecha. |
| itaipu-2-s1-high | stage 1, Loiterers born | CREST | firm | Loiterers. They'll circle, then drop on the gates. Get above them. | Merodeadores. Van a orbitar y después caer sobre las compuertas. Pónganse encima. |
| itaipu-2-s1-clear | stage 1 `cleared` | TALLER | calm | Good. The gates don't know how close that was. | Bien. Las compuertas no saben lo cerca que estuvo. |
| itaipu-2-s2-wakes | stage 2, boats born | MIRADOR | urgent | Wakes in the approach channel. They're using the current. | Estelas en el canal de aproximación. Están usando la corriente. |
| itaipu-2-s2-fast | stage 2, Strikers born | CREST | urgent | And fast movers right behind them, low up the channel. | Y atrás vienen rápidos, bajos por el canal. |
| itaipu-2-s2-clear | stage 2 `cleared` | MIRADOR | calm | Channel's clean. Nothing on the water. | El canal está limpio. Nada sobre el agua. |
| itaipu-2-s3-open | stage 3 opens | CREST | firm | Opening the working gates now. Keep them alive until the spill is running. | Abriendo las compuertas que funcionan. Manténganlas vivas hasta que el vertido corra. |
| itaipu-2-s3-half | hold at half | MIRADOR | calm | Water's over the sills. Halfway. | El agua pasa por los umbrales. Vamos por la mitad. |
| itaipu-2-s3-held | `held` | CREST | firm | Spill's running. The river is ours to steer. | El vertido corre. El río lo manejamos nosotros. |
| itaipu-2-s3-failed | a working gate hit during the hold | CREST | urgent | We lost a working gate. Spill on the rest. Protect what's left. | Perdimos una compuerta en servicio. Vertemos con las demás. Protejan lo que queda. |
| itaipu-2-ta-turn | twist A | MIRADOR | urgent | Something in the spray. I can't hold it on the scope. | Hay algo en la bruma. No lo puedo mantener en pantalla. |
| itaipu-2-ta-why | after ta-turn | CREST | urgent | The spray's hiding them. Stay close to the gates and trust your eyes. | La bruma los esconde. Quédense cerca de las compuertas y confíen en sus ojos. |
| itaipu-2-tb-turn | twist B | MIRADOR | urgent | More wakes, out of the west arm. Everyone's too high. | Más estelas, desde el brazo oeste. Están todos muy altos. |
| itaipu-2-tb-why | after tb-turn | CREST | firm | Boats, hugging the west shore. Somebody get down on the water, now. | Lanchas, pegadas a la costa oeste. Que alguien baje al agua, ya. |
| itaipu-2-tc-turn | twist C | CREST | urgent | Hunters over the chute. Anyone low on the channel, you've got company. | Cazadores sobre el canal de descarga. Los que estén bajos en el canal, tienen compañía. |
| itaipu-2-tc-why | after tc-turn | TALLER | firm | Go down there in pairs. I can't build birds that fast. | Bajen de a dos. No armo aparatos tan rápido. |
| itaipu-2-s4-all | stage 4, first birth | MIRADOR | urgent | Everything's turning for the working gates. | Todo está girando hacia las compuertas en servicio. |
| itaipu-2-s4-order | after s4-all | CREST | shout | Stay on the working gates. Let the others go if you have to. | Quédense sobre las compuertas en servicio. Si hace falta, dejen las otras. |
| itaipu-2-s4-hold | stage 4, first kill | TALLER | calm | That's it. Keep that water running. | Eso es. Que el agua siga corriendo. |
| debrief-itaipu-2-win | won | CREST | calm | The spill held and the river did what we told it. Nice work on the water. | El vertido aguantó y el río hizo lo que le dijimos. Buen trabajo sobre el agua. |
| debrief-itaipu-2-lose | lost | CREST | calm | Too many gates down. We can't steer the river like this. Pull back. | Cayeron demasiadas compuertas. Así no manejamos el río. Repliéguense. |

### What the player learns

Boats are slow but they do not stop; the water is a lane to patrol; a
hold objective means defending a few things hard instead of everything
loosely.

---

## M3. Lights Out (`itaipu-3`)

**Was:** "Switchyard blackout", every wave on the yard, with decoys.
**Keeps:** the yard as the main target, the decoy kind and its 300 m
marker truth, the west intakes and gorge penstocks as secondary dangers,
its floor and stars. **Changes:** dusk into dark across the mission;
Despacho's first appearance; a reroute hold that, once complete, brings
back the lights a lost yard put out (T1.10); twists on the decoys.

**When:** Day 1, dusk. The light falls across the mission and the towns'
lights come on at stage 3 (T1.11; fallback: the mission at `golden`, the
lights at its end in the debrief film).

**Premise.** The yard is how the right bank's power leaves the dam.
Despacho is rerouting the grid so a hit there would darken less, and
needs time. The Aggressor wants the yard before the reroute is done, and
it has learned to lie.

**Briefing.**
EN: "Dispatch is rerouting the grid so a hit on the switchyard can't take
the right bank down. It takes time. Until it's done, the yard is the
whole country. Some of what's coming will be fake. Close before you
spend a bird."
ES: "Despacho está redirigiendo la red para que un impacto en la
subestación no apague la margen derecha. Lleva tiempo. Hasta que
termine, la subestación es todo el país. Parte de lo que viene es falso.
Acérquense antes de gastar un aparato."

### Stages

| # | Stage | Opens on | Objectives | Groups | Exit |
| --- | --- | --- | --- | --- | --- |
| 1 | Dusk | `go` | protect(yard) | scout (NW orbit); one Striker and one decoy on the yard from NW, order seeded | `cleared` |
| 2 | The Lie | beat 12 s | protect(yard) | Striker stream from NW or LINES: decoys 2 to 1 against Strikers, the real ones' places in the stream seeded | `cleared` |
| 3 | Reroute | beat 15 s; DESPACHO comes on | hold(yard, 150 s) | the twist, at `enter+[20,40]`; a swarm on `gorge-yard` at `enter+[60,80]` | `held` and `cleared` |
| 4 | The Dark | beat 15 s, town lights on | protect(yard, west intakes) | Loiterers on the yard from HIGH; Strikers on west intakes from N; decoys mixed | `cleared` |

If the yard was hit, its districts went dark (grid.js, built). When the
reroute's hold completes, Despacho brings back half of them, the near
ones last (T1.10): the first time the act shows lights coming back on.

### The twist (stage 3)

- **A. One real in the pack.** A tight pack of decoys with one real
  Striker inside; markers lie until 300 m.
- **B. The feint.** A loud decoy run at the yard while real Strikers go
  for the west intakes from N.
- **C. Under the wires.** A group flies the line corridor low into the
  yard; the lines take some of them (the wire hazard, built), the rest
  arrive among the gantries where only whoops fit.

### Climax

Stage 3's hold with the light going, then stage 4 in the dark with the
town lit behind the yard: every hit now shows.

### Win, lose, stars

Floor 9 700, starMw 12 600 (as today). The hold folds into *held*.

### Pilots

1 pilot: decoys 1 to 1, the twist's pack smaller. 7 to 8: decoys 3 to 1.

### Roles

Spotters (Bramor, Skyhunter, Radian) reveal decoys early (T1.8: a
spotted decoy's marker reads DECOY for everyone); whoops among the yard's
gantries (twist C); interceptors on the stream.

### Set pieces

The towns lighting up at stage 4; a district flickering out if the yard
is hit (built); the lights coming back after the reroute.

### Music

`AMB` low and warm; `PULSE` with a ticking layer during the hold;
`STING` on the twist; `RELEASE` when the lights come back.

### If the face opens

The yard is structural and holds no water, so an opening here comes from
the secondary Strikers on the west intakes or the swarm on the
penstocks. Despacho is mid reroute with the grid on one leg; the units
tripped by the opening take more districts dark, and the reroute's hold
and the closure run at the same time.

| id | cue | who | del | EN | ES |
| --- | --- | --- | --- | --- | --- |
| itaipu-3-op | after contain-breach | DESPACHO | urgent | Crest, you've got water through the face and I've got a grid on one leg. Close it, then give me the yard. | Cresta, ustedes tienen agua por la cara y yo una red con una sola pata. Ciérrenla, y después denme la subestación. |

### Radio

| id | cue | who | del | EN | ES |
| --- | --- | --- | --- | --- | --- |
| itaipu-3-s0-brief | countdown, first | CREST | firm | The switchyard is how the right bank gets its light. Tonight it's the most important thing we have. | La subestación es por donde le llega la luz a la margen derecha. Esta noche es lo más importante que tenemos. |
| itaipu-3-s0-rules | countdown, second | MIRADOR | urgent | Some of what's coming is fake. Get close before you spend a bird. | Parte de lo que viene es falso. Acérquense antes de gastar un aparato. |
| itaipu-3-s1-pair | stage 1, Striker born | MIRADOR | firm | Fast movers, west arm. Same shape. One of them is lying. | Rápidos, brazo oeste. Misma forma. Uno de ellos miente. |
| itaipu-3-s2-wasted | stage 2, a pilot spends a bird on a decoy | TALLER | calm | That one was cardboard. Don't feed it birds. | Ese era de cartón. No le den aparatos. |
| itaipu-3-s3-despacho | stage 3 opens | DESPACHO | calm | Crest, Dispatch. Starting the reroute. I need the yard standing until I call it. | Cresta, Despacho. Empezamos a redirigir. Necesito la subestación en pie hasta que avise. |
| itaipu-3-s3-half | hold at half | DESPACHO | calm | Halfway. The far towns are moved. Hernandarias is next. | Vamos por la mitad. Los pueblos lejanos ya están. Sigue Hernandarias. |
| itaipu-3-s3-done | `held` | DESPACHO | calm | Reroute complete. If you lose the yard now, the right bank stays lit. | Redirección completa. Si ahora pierden la subestación, la margen derecha sigue con luz. |
| itaipu-3-s3-back | `held` after a yard hit | DESPACHO | calm | Reroute complete. Bringing the right bank back up. | Redirección completa. Volviendo a encender la margen derecha. |
| itaipu-3-ta-turn | twist A | MIRADOR | urgent | Tight pack, all decoys on the scope. That's too neat. One of them is real. | Grupo cerrado, todos señuelos en pantalla. Demasiado prolijo. Uno es real. |
| itaipu-3-tb-turn | twist B | MIRADOR | urgent | The yard run is noise. Real ones over open water, heading for the west intakes. | Lo de la subestación es ruido. Los reales vienen por agua abierta, hacia las tomas del oeste. |
| itaipu-3-tc-turn | twist C | MIRADOR | urgent | Contacts on the line corridor, under the wires. | Contactos en el corredor de las líneas, bajo los cables. |
| itaipu-3-s4-dark | stage 4 opens | CREST | calm | Lights are on in town. Anything we lose now, they'll see from their kitchens. | Se encendieron las luces del pueblo. Lo que perdamos ahora se va a ver desde las cocinas. |
| debrief-itaipu-3-win | won | CREST | calm | The yard held. The lights stayed on. Well done. | La subestación resistió. La luz siguió encendida. Bien hecho. |
| debrief-itaipu-3-lose | lost | DESPACHO | calm | The right bank is dark. We'll get it back. Crest, they're yours. | La margen derecha está a oscuras. La vamos a recuperar. Cresta, son suyos. |

### What the player learns

Do not spend a bird on what you have not looked at; spotters make the
whole squad smarter; the lights are the cost.

---

## M4. The Long Night (`itaipu-4`)

**Was:** "Night raid", mission 1's waves at night. **Keeps:** `night:
true`, `prepMs` (the night world's rebuild before the go), mission 1's
targets, floor and stars. **Changes:** its own waves; a quiet first
stage; Hunters in force; the night's lights as a stake; sunrise as the
end.

**When:** Night 1, from the middle of the night to sunrise (T1.11 for
the dawn ramp; fallback: stage 5 at night and the sunrise only in the
debrief film).

**Premise.** The Aggressor has learned the cell's habits by day. At
night it changes the game: boats with no lights, Hunters that come for
the pilots, and long silences.

**Briefing.**
EN: "They'll come in the dark. Boats you can't see and drones that hunt
pilots, not concrete. Trust your markers. Fly in pairs. Hold until
sunrise."
ES: "Van a venir en la oscuridad. Lanchas que no se ven y drones que
cazan pilotos, no hormigón. Confíen en los marcadores. Vuelen de a dos.
Aguanten hasta el amanecer."

### Stages

| # | Stage | Opens on | Objectives | Groups | Exit |
| --- | --- | --- | --- | --- | --- |
| 1 | Quiet | `go` | none shown: "STAND BY" | nothing for `enter+[40,70]`; then one dark boat on WATER | `killed(boat)` or `hit` |
| 2 | Dark Water | beat 10 s | protect(intakes) | boats on two WATER routes (sectors scale); a Loiterer from HIGH at `enter+[30,50]` | `cleared` |
| 3 | Hunters | beat 15 s | survive: protect(intakes) | Hunters, 1 + 0.5/pilot, out of the gorge; Strikers from N at `enter+[20,35]` as cover | `cleared` |
| 4 | The Turn (twist) | beat 15 s | the twist's | A, B or C | `cleared` |
| 5 | Before Dawn | beat 20 s | protect(all) | convergence on N and WATER and GORGE, with Hunters; dawn rises across it | `cleared` |

### The twist (stage 4)

- **A. Station dark.** Crest orders the dam's own floodlights off to deny
  the attackers their aim: the room gives this stage's groups error as if
  the scouts were dead, and the crest goes dark for everyone (T1.10,
  station lights off by order). A trade the squad hears made.
- **B. The towns.** Strikers on the yard; the right bank's districts at
  stake in the dark.
- **C. A scout in the dark.** A scout over the islands with no lights:
  kill it in stage 4 or stage 5 flies exact.

### Climax

Stage 5: the hardest convergence of the first day, the Hunters among it,
and the sky going grey in the east as the last of it lands.

### Win, lose, stars

Floor 7 700, starMw 11 200 (as today).

### Pilots

Hunters scale as a group; a solo pilot meets them one at a time (each
Hunter's birth waits for the last one's death, T1.1 `after`).

### Roles

The Avionics HUD's thermal on the boats; float planes on the water at
night; pairs against Hunters; spotters marking dark boats (T1.8).

### Set pieces

The first minute of silence; a boat's wake under the town's reflection;
the crest's floodlights going out by order (twist A); sunrise.

### Music

`AMB` almost nothing for stage 1; `PULSE` with a heartbeat low end under
the Hunters; `WIN` at sunrise.

### If the face opens

At night the opening is heard before it is seen: the water's roar below
the dark face, the downstream lights going out unit by unit. The squad
holds the gantry in the dark, by markers, with Hunters about.

| id | cue | who | del | EN | ES |
| --- | --- | --- | --- | --- | --- |
| itaipu-4-op | after contain-breach | MIRADOR | calm | I can hear it before I can see it. Water, below the face. | Lo escucho antes de verlo. Agua, debajo de la cara. |

### Radio

| id | cue | who | del | EN | ES |
| --- | --- | --- | --- | --- | --- |
| itaipu-4-s0-brief | countdown, first | CREST | firm | They'll come in the dark. You'll see less. So will they. | Van a venir en la oscuridad. Van a ver menos. Ellos también. |
| itaipu-4-s0-rules | countdown, second | TALLER | calm | Nav lights are off on every bird. Fly by the markers. | Todos los aparatos con las luces apagadas. Vuelen por los marcadores. |
| itaipu-4-s1-quiet | stage 1 `enter+20` | MIRADOR | calm | Nothing on the scope. I don't like it. | Nada en pantalla. No me gusta. |
| itaipu-4-s1-boat | the boat born | MIRADOR | urgent | There. One wake, no lights, coming for the face. | Ahí. Una estela, sin luces, rumbo a la cara. |
| itaipu-4-s2-water | stage 2 opens | CREST | firm | More on the water. Floats and slow planes, get down there. | Hay más en el agua. Hidros y aviones lentos, bajen. |
| itaipu-4-s3-hunt | stage 3, Hunters born | MIRADOR | urgent | Fast movers out of the gorge. They're not heading for the dam. | Rápidos saliendo del cañón. No van hacia la represa. |
| itaipu-4-s3-pairs | after s3-hunt | CREST | urgent | Hunters. Pairs. Nobody flies alone tonight. | Cazadores. De a dos. Esta noche nadie vuela solo. |
| itaipu-4-ta-turn | twist A | CREST | firm | Killing the station lights. Their aim goes with them. So does ours. | Apagando las luces de la central. Se les va la puntería. A nosotros también. |
| itaipu-4-tb-turn | twist B | DESPACHO | calm | Crest, the right bank is on one feed tonight. Please keep the yard. | Cresta, la margen derecha está con una sola alimentación esta noche. Por favor cuiden la subestación. |
| itaipu-4-tc-turn | twist C | MIRADOR | urgent | Something circling over the islands. No lights. That's a scout. | Algo da vueltas sobre las islas. Sin luces. Es un explorador. |
| itaipu-4-s5-grey | stage 5 `enter+45` | MIRADOR | calm | Sky's going grey in the east. Almost there. | El cielo se aclara al este. Ya casi. |
| debrief-itaipu-4-win | won | CREST | calm | Sunrise, and the dam still stands. Get some sleep. They'll be back. | Amanece, y la represa sigue en pie. Duerman un poco. Van a volver. |
| debrief-itaipu-4-lose | lost | CREST | calm | They got through in the dark. Pull back. We go again tonight. | Pasaron en la oscuridad. Repliéguense. Volvemos esta noche. |

### What the player learns

Silence is not safety; markers and thermal over eyes; pairs beat Hunters;
the squad can trade its own advantage for the enemy's.

---

## M5. The River Below (`itaipu-5`, new)

**When:** Day 2, morning. **Time:** `day`.

**Premise.** Downriver, on the Brazilian bank, Carancho's flight has
held the river all night. In the morning they run out of birds. The
Aggressor's new axis comes up the river, under the gorge's rims, onto the
downstream face, and something on the water is launching the swarms.

**Briefing.**
EN: "Carancho's flight held the river below all night. They're out of
birds. Everything coming up the gorge is ours now, and something down
there is launching it. Find the source."
ES: "La escuadrilla Carancho sostuvo el río toda la noche. Se quedaron sin
aparatos. Todo lo que suba por el cañón ahora es nuestro, y algo allá
abajo lo está lanzando. Encuentren el origen."

**New:** the RIVER sector (routes on the river surface below the dam,
T1.4); the **carrier** kind (T1.6): a larger boat on the river that
launches a swarm group every 35 to 50 s (seeded) while it lives, takes
two detonations (or one penetrator, T1.7), and is the stage's kill
objective. Targets: the penstocks and the downstream face (built
`penstock-*`).

### Stages

| # | Stage | Opens on | Objectives | Groups | Exit |
| --- | --- | --- | --- | --- | --- |
| 1 | Carancho's Call | `go` | protect(penstocks) | swarms up GORGE, two routes, staggered | `cleared` |
| 2 | Up the Gorge | beat 12 s | protect(penstocks) | swarm on `gorge-left-rim`; Hunters at `enter+[25,40]` | `cleared` |
| 3 | The Source | beat 15 s; the carrier appears on RIVER (route seeded) | kill(carrier) | the carrier and its launched swarms; the twist at `enter+[30,50]` | `killed(carrier)` and `cleared` |
| 4 | Clear the River | beat 20 s | protect(penstocks) | convergence: swarms on both GORGE routes, Strikers from RIVER low, Loiterers HIGH onto penstocks | `cleared` |

### The twist (stage 3)

- **A. Two hulls.** A second carrier; one of them launches nothing
  (seeded which). The spotters find out which.
- **B. Hunters from the carrier.** It launches Hunters instead of a swarm
  once its first swarm is dead.
- **C. Carancho's last bird.** CARANCHO has one bird left and spots the
  carrier for everyone, from downriver: the carrier is marked from its
  birth, but its escort is twice the size.

### Climax

Stage 4, once the source is dead: the last of what it launched, and what
the Aggressor sends after it, coming up the gorge together.

### Win, lose, stars

Floor 7 700 (as mission 1), starMw 11 200; a fourth star condition is not
added (the carrier kill is the stage's exit).

### Pilots

Carrier launches scale as a group; a solo pilot's carrier launches every
50 s, eight pilots' every 35 s.

### Roles

The Striker fixed wing and 10 inch (wide warheads) on the carrier; whoops
and 5 inch between the penstocks; fast planes down the river; float
planes on the river surface.

### Set pieces

Flying down the gorge into the river below for the first time; the
carrier's launch (a swarm lifting off its deck); its two hit burn.

### Music

`PULSE` with a low drum under stage 1; `STING` on the carrier; `RELEASE`
on its kill.

### If the face opens

A penstock opened on the downstream face throws its jet into the gorge,
straight down Carancho's stretch of river; the carrier's swarms come up
through the spray. The intake gantry closes it from the crest, far from
where the fight is, so the squad must split.

| id | cue | who | del | EN | ES |
| --- | --- | --- | --- | --- | --- |
| itaipu-5-op | after contain-breach | CARANCHO | urgent | Crest, Carancho. Water coming down the gorge. We're clear of the bank. Close it. | Cresta, Carancho. Baja agua por el cañón. Estamos lejos de la orilla. Ciérrenla. |

### Radio

| id | cue | who | del | EN | ES |
| --- | --- | --- | --- | --- | --- |
| itaipu-5-s0-brief | countdown, first | CARANCHO | urgent | Crest, Carancho. We're out of birds. Falling back. The river is yours. | Cresta, Carancho. Nos quedamos sin aparatos. Nos replegamos. El río es de ustedes. |
| itaipu-5-s0-rules | countdown, second | CREST | firm | Copy, Carancho. Pilots, everything coming up the gorge is ours now. | Copiado, Carancho. Pilotos, todo lo que suba por el cañón ahora es nuestro. |
| itaipu-5-s1-swarm | stage 1, first birth | MIRADOR | urgent | Swarm up the gorge. They'll hug the rims all the way to the face. | Enjambre por el cañón. Van a ir pegados a los bordes hasta la cara. |
| itaipu-5-s2-pattern | stage 2 opens | MIRADOR | calm | They keep coming from the same stretch of river. Something down there is launching them. | Siguen saliendo del mismo tramo del río. Algo allá abajo los está lanzando. |
| itaipu-5-s3-carrier | carrier born | MIRADOR | urgent | Got it. A big hull on the river. It's launching. | Lo tengo. Un casco grande en el río. Está lanzando. |
| itaipu-5-s3-order | after s3-carrier | CREST | firm | Kill the source. One hit won't do it. | Maten el origen. Con un impacto no alcanza. |
| itaipu-5-s3-dead | `killed(carrier)` | TALLER | firm | That's the nest. Aguyje. | Ese era el nido. Aguyje. |
| itaipu-5-ta-turn | twist A | MIRADOR | urgent | A second hull. One of them isn't launching anything. | Un segundo casco. Uno de los dos no lanza nada. |
| itaipu-5-tb-turn | twist B | MIRADOR | urgent | It's launching Hunters now. They want you. | Ahora está lanzando cazadores. Los quieren a ustedes. |
| itaipu-5-tc-turn | twist C | CARANCHO | urgent | Crest, Carancho. One last bird up. I've got eyes on the hull, marking it. Beleza, go. | Cresta, Carancho. Último aparato arriba. Tengo el casco a la vista, lo marco. Beleza, vayan. |
| itaipu-5-s4-last | stage 4 opens | CREST | firm | Whatever it launched is still coming. Clear the river. | Lo que lanzó todavía viene. Limpien el río. |
| debrief-itaipu-5-win | won | CARANCHO | calm | Crest, Carancho. River's quiet. Thanks for covering us. | Cresta, Carancho. El río está tranquilo. Gracias por cubrirnos. |
| debrief-itaipu-5-lose | lost | CREST | calm | The face took too much. Pull back to the crest. | La cara recibió demasiado. Repliéguense a la cresta. |

### What the player learns

Kill the source; the war is bigger than the crest; a new axis means a
new kind of flying (under the rims).

---

## M6. The Corridor (`itaipu-6`, new)

**When:** Day 2, dusk into dark. **Time:** `golden` then night lights
(T1.11).

**Premise.** The Aggressor has stopped trying to break the dam and
started trying to cut it off. If the 500 kV lines go, every unit can spin
and the towns still go dark. The corridors are kilometres long, and the
squad cannot be everywhere.

**Briefing.**
EN: "They've stopped hitting the dam and started hitting the lines. If
the corridors go, the plant can run all night and the towns still go
dark. Spread out. Spotters, you're the squad's eyes tonight."
ES: "Dejaron de atacar la represa y empezaron con las líneas. Si caen los
corredores, la central puede funcionar toda la noche y los pueblos igual
quedan a oscuras. Despliéguense. Los observadores, esta noche ustedes son
los ojos del grupo."

**New:** tower targets on the two corridors (west from the yard, east
from the powerhouse; T1.6 `tower-w-*`, `tower-e-*`), each worth the MW its
line carries and each putting its fed district out through grid.js's
wire path (built for wire strikes); the **spot** objective and the
spotter mechanic (T1.8) are the mission's core.

### Stages

| # | Stage | Opens on | Objectives | Groups | Exit |
| --- | --- | --- | --- | --- | --- |
| 1 | Golden Hour | `go` | protect(towers) | Strikers on LINES west, then `after+[10,20]` LINES east | `cleared` |
| 2 | Spread Thin | beat 12 s | protect(towers); spot(each group) | groups on as many corridor sectors at once as the pilot rule (1.6) allows; Loiterers HIGH | `cleared` |
| 3 | The Yard Again | beat 15 s | protect(yard, towers) | the twist; decoys on the yard from NW | `cleared` |
| 4 | Islanding | beat 15 s; DESPACHO asks to island the grid | hold(the last intact corridor, 120 s) | convergence on the intact corridor from both ends | `held` and `cleared` |

### The twist (stage 3)

- **A. The corridor is cover.** Boats on the east intakes while the squad
  is strung out along the lines.
- **B. Under the wires.** Strikers fly inside the corridor at wire height;
  the wire hazard takes more of them (T1.6 raises the crossing chance for
  that group), the rest are hard to reach without hitting the lines.
- **C. Eyes on the lines.** A scout circling high over the corridor;
  kill it in stage 3 or stage 4's convergence flies exact. (Radio
  breakup was considered here and is out: no breakup effect in any
  mission, the lead's decision of 2 October under the owner's no jamming
  rule.)

### Climax

Stage 4: one corridor left, the towns at the end of it lit, and the
squad converging on it from wherever they were strung out.

### Win, lose, stars

Floor 9 700, starMw 12 600 (as mission 3, since the yard and the towers
are big single losses).

### Pilots

Corridor sectors at once by the rule of 1.6. A solo pilot's corridor
groups come one corridor at a time with 30 s between.

### Roles

Spotters (Bramor, Skyhunter, Radian, the slow trainers) finally have a
job beyond the screen: a spotted group shows to everybody; F-16 and
interceptor on the long legs; whoops around the towers.

### Set pieces

The corridors in golden light, towers in a line to the horizon; a span
going dark and its district flickering out down the line.

### Music

`AMB` with a long drone; `PULSE` as more corridors light up on the
radar; `FULL` in the islanding hold; `WIN` with the towns still lit.

### If the face opens

The squad is strung out along kilometres of corridor when the face opens
behind it. Despacho cannot carry spans down and units tripped at once,
so the closure outranks the corridor until it is held: the hardest
choice of the act before Breach.

| id | cue | who | del | EN | ES |
| --- | --- | --- | --- | --- | --- |
| itaipu-6-op | after contain-breach | DESPACHO | urgent | Water through the face and spans down. I can't carry both. Close the face first. | Agua por la cara y tramos caídos. No puedo con todo. Primero cierren la cara. |

### Radio

| id | cue | who | del | EN | ES |
| --- | --- | --- | --- | --- | --- |
| itaipu-6-s0-brief | countdown, first | DESPACHO | calm | Crest, Dispatch. They're on the lines now. Everything I've got runs through those towers. | Cresta, Despacho. Ahora van por las líneas. Todo lo que tengo pasa por esas torres. |
| itaipu-6-s0-rules | countdown, second | CREST | firm | Spread out along the corridors. Spotters, call what you see. | Despliéguense por los corredores. Observadores, avisen lo que vean. |
| itaipu-6-s1-lines | stage 1, first birth | MIRADOR | urgent | Fast movers along the west corridor. They're following the wires. | Rápidos por el corredor oeste. Siguen los cables. |
| itaipu-6-s2-spread | stage 2 opens | CREST | firm | They're everywhere on purpose. Hold your sector. Don't bunch up. | Están en todos lados a propósito. Mantengan su sector. No se amontonen. |
| itaipu-6-s2-spotted | first `spot` complete | MIRADOR | firm | Spotted. Everyone has it now. | Marcado. Ya lo tienen todos. |
| itaipu-6-s2-tower | a tower hit | DESPACHO | calm | Lost a span. That town is dark. Rerouting what I can. | Perdimos un tramo. Ese pueblo está a oscuras. Redirijo lo que pueda. |
| itaipu-6-ta-turn | twist A | MIRADOR | urgent | Wakes on the east shore. While we're all out on the lines. | Estelas en la costa este. Mientras estamos todos en las líneas. |
| itaipu-6-tb-turn | twist B | MIRADOR | urgent | They're inside the corridor, at wire height. Careful with the lines. | Están dentro del corredor, a la altura de los cables. Cuidado con las líneas. |
| itaipu-6-tc-turn | twist C | MIRADOR | urgent | Something circling high over the corridor. That's a scout. Take it down before the last run. | Algo da vueltas en altura sobre el corredor. Es un explorador. Derríbenlo antes del último ataque. |
| itaipu-6-s4-island | stage 4 opens | DESPACHO | urgent | Crest, I'm islanding the grid on the last corridor. Hold it until I call it. | Cresta, voy a aislar la red en el último corredor. Aguanten hasta que avise. |
| itaipu-6-s4-done | `held` | DESPACHO | calm | Islanded. The towns on that line stay lit, whatever happens to the rest. | Aislado. Los pueblos de esa línea siguen con luz, pase lo que pase con el resto. |
| debrief-itaipu-6-win | won | CREST | calm | The lines held. Somebody tell the towns they owe the spotters. | Las líneas aguantaron. Que alguien les diga a los pueblos que se lo deben a los observadores. |
| debrief-itaipu-6-lose | lost | DESPACHO | calm | Too many spans down. The grid can't carry it. Crest, pull them back. | Cayeron demasiados tramos. La red no lo soporta. Cresta, repliéguelos. |

### What the player learns

Split the squad on purpose; spotting is a weapon; the grid is a network,
and the towers are its weakest links.

---

## M7. Breach (`itaipu-7`, new): the end of Act 1

**When:** Day 3, from before dawn to sunrise.

**Premise.** Intel has seen something new on the far reservoir: heavy,
slow hulls, built for one thing. Everything until now was the Aggressor
learning the defence. This is what it learned it for.

**Briefing.**
EN: "Mirador has heavy hulls on the far reservoir. Slow, big, built to
open the face. If one reaches it, we stop talking about output. Kill
them far out. Everything else tonight is there to pull you off them."
ES: "Mirador tiene cascos pesados en el embalse lejano. Lentos, grandes,
hechos para abrir la cara. Si uno llega, dejamos de hablar de
generación. Mátenlos lejos. Todo lo demás esta noche está para
sacarlos de encima de ellos."

**New:** the **breacher** kind (T1.6): a slow heavy sea drone, two
detonations to kill (one penetrator), aimed at a gate or intake below the
waterline, its approach several minutes long from the far north of the
reservoir and visible on the radar the whole way. An opening made by
anything else runs the shared Contain of 1.9 and the mission goes on; an
opening made by a **breacher** (the biggest charge, the widest opening)
ends the mission's normal course and branches to stage 5b, the act's
finale (T1.12).

### Stages

| # | Stage | Opens on | Objectives | Groups | Exit |
| --- | --- | --- | --- | --- | --- |
| 1 | Everywhere | `go` | protect(all) | small groups on every sector the pilot rule allows, 20 s apart, kinds seeded | `cleared` |
| 2 | Heavy Hulls | beat 15 s | kill(breachers) | breachers, 1 + 0.25/pilot, from the far north on a seeded route, escorted by Loiterers HIGH | `killed(breachers)` or `hit` by a breacher |
| 3 | Pull | starts with stage 2 at `enter+[45,70]`, runs alongside it | protect(intakes, penstocks) | Strikers N and NE, swarm GORGE, Hunters: built to pull pilots off the breachers | ends with stage 2 |
| 4 | The Turn (twist) | beat 10 s | the twist's | A, B or C | `cleared` |
| 5a | First Light | `cleared` with no opening | protect(all) | the last convergence, at sunrise | `cleared`: won |
| 5b | Contain | `opening(T)` made by a breacher, at any time | hold(the emergency closure, 180 s): protect the gantry that serves the opened structure (T1.6) while it lowers the stoplogs | everything the Aggressor has left onto the gantry and the remaining gates | `held`: won, at most two stars; gantry hit: lost |

### The twist (stage 4)

- **A. The split.** The breachers' second group divides, one for the
  gates on the west arm, one for the intakes in the middle.
- **B. Under the cloud.** One breacher on the scope is a decoy; the real
  one comes under a cloud of Loiterers, marked only by a spotter (T1.8).
- **C. They come for the floats.** Hunters go for anyone on or near the
  water, which is where the breachers have to be killed.

### Climax

5a: dawn over the reservoir, the last of them coming in with the light,
and the dam whole behind the squad. 5b: the water already moving through
an opening, the gantry lowering the stoplogs on the crest, and everything
left coming for it. The act ends on the closure, not on the flood.

### Win, lose, stars

Floor 7 700. Won on 5a's clear (stars as today) or 5b's hold (stars
capped at two: *held* is false). Lost on the floor, or the gantry hit in
5b. Openings by anything but a breacher follow 1.9 as in every
mission. In 5b the mission's own lines (`itaipu-7-s5b-*`) are said in
place of the shared `contain-breach`, `contain-river`, `contain-half` and
`contain-held`.

### Pilots

Breachers 1 + 0.25 a pilot; a solo pilot's breachers come one at a time,
the second only when the first is dead.

### Roles

Float planes and the Striker fixed wing on the breachers (long run over
open water, wide and penetrator warheads); spotters for twist B; quads on
the pull groups; whoops on the gantry in 5b.

### Set pieces

The breachers' wakes on the radar, crawling toward the dam for minutes;
in 5b the water through the opening (the flood solver) and the stoplogs
going down; sunrise in 5a.

### Music

`AMB` with a low pedal tone that rises in pitch as the breachers close;
`STING` on an opening; `FULL` through 5b; `WIN` on the closure or at
sunrise.

### Radio

| id | cue | who | del | EN | ES |
| --- | --- | --- | --- | --- | --- |
| itaipu-7-s0-brief | countdown, first | MIRADOR | firm | Heavy hulls on the far reservoir. Slow. Big. Built for the face. | Cascos pesados en el embalse lejano. Lentos. Grandes. Hechos para la cara. |
| itaipu-7-s0-rules | countdown, second | CREST | firm | Everything else tonight is there to pull you off them. Don't let it. | Todo lo demás esta noche está para sacarlos de encima de ellos. No lo permitan. |
| itaipu-7-s1-every | stage 1, third birth | MIRADOR | urgent | Contacts on every side. They're spreading us out. | Contactos por todos lados. Nos están dispersando. |
| itaipu-7-s2-hulls | breachers born | MIRADOR | urgent | Heavy hulls moving. Far north. They're coming. | Cascos pesados en movimiento. Al norte, lejos. Ya vienen. |
| itaipu-7-s2-order | after s2-hulls | CREST | firm | Floats, heavies, wide warheads, on the hulls. Everyone else keeps the rest off them. | Hidros, pesados, ojivas anchas, a los cascos. Los demás les sacan el resto de encima. |
| itaipu-7-s2-close | a breacher inside 1 km of the face | MIRADOR | shout | Hull's almost at the face! | ¡El casco ya casi llega a la cara! |
| itaipu-7-s2-dead | `killed(breachers)` | CREST | calm | Hulls are down. Breathe. Then get back up. | Cascos abatidos. Respiren. Y vuelvan a subir. |
| itaipu-7-ta-turn | twist A | MIRADOR | urgent | They're splitting. West arm and the middle. | Se están separando. Brazo oeste y el medio. |
| itaipu-7-tb-turn | twist B | MIRADOR | urgent | That hull is empty. The real one is under the Loiterers. Spotters. | Ese casco está vacío. El real va debajo de los merodeadores. Observadores. |
| itaipu-7-tc-turn | twist C | CREST | urgent | Hunters on the water. Floats, watch your backs. | Cazadores sobre el agua. Hidros, cuiden sus espaldas. |
| itaipu-7-s5b-breach | `opening` | CREST | calm | We have a breach. Lowering the stoplogs. Protect the gantry. | Tenemos una brecha. Bajando las ataguías. Protejan la grúa. |
| itaipu-7-s5b-river | after s5b-breach | DESPACHO | calm | The riverbank below was cleared at midnight. Nobody's on it. Just close it. | La ribera de abajo se despejó a medianoche. No hay nadie. Solo ciérrenla. |
| itaipu-7-s5b-half | hold at half | TALLER | firm | Halfway down. Keep them off my crane. | Va por la mitad. Que no lleguen a mi grúa. |
| itaipu-7-s5b-held | `held` | CREST | calm | Closed. The face is closed. All pilots, hold where you are. | Cerrada. La cara está cerrada. Todos los pilotos, mantengan posición. |
| itaipu-7-s5a-sun | 5a opens | MIRADOR | calm | First light. And everything they have left. | Primera luz. Y todo lo que les queda. |
| debrief-itaipu-7-win | won | CREST | calm | The dam holds. The lights stay on. That's the first act of this war. Good work, both banks. | La represa resiste. La luz sigue encendida. Ese fue el primer acto de esta guerra. Buen trabajo, las dos márgenes. |
| debrief-itaipu-7-held | won through 5b | CREST | calm | It's closed, and the river's settling. We came closer than anyone will ever know. Good work. | Está cerrada y el río se calma. Estuvimos más cerca de lo que nadie va a saber. Buen trabajo. |
| debrief-itaipu-7-lose | lost | CREST | calm | We couldn't hold it. All pilots, pull back to high ground. | No pudimos sostenerla. Todos los pilotos, repliéguense a lo alto. |

### What the player learns

Everything the act taught at once: kill the eyes, split by role, read the
decoys, spot for each other, kill the source, and if the worst happens,
hold the one thing that fixes it.

---

## 3. Line count

| Mission | Stage, twist, opening and debrief lines | Film lines (INTROS.md) |
| --- | --- | --- |
| 1 | 23 | 7 |
| 2 | 17 | 4 |
| 3 | 15 | 4 |
| 4 | 14 | 4 |
| 5 | 14 | 4 |
| 6 | 14 | 4 |
| 7 | 18 | 5 |
| Shared calls (1.8) and Contain (1.9) | 17 | |
| Total | 132 | 32 |

164 lines, 328 voice files with Spanish, against 54 lines (108 files) in
`lines.json` today; the existing intro, mission and debrief lines they
replace are about 20 of those 54. Every line in MISSIONS.md and INTROS.md
was extracted into a lines.json shaped scratch file and passed
`tools/voice/script.py` `load()` (no digit, no en or em dash, no tú form,
valid id and delivery). A second scan for spelled quantity words found
only the year (the fiction's date, allowed by the script's own rule),
the idioms "las dos márgenes", "de a dos" and "uno de los dos", and the
ordinal "a second hull"; none is a figure.
