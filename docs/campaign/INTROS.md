# Defend the Paraná, Act 1: the intros

Written 2026-10-02 for the owner: "they often come mistimed ... the
cameras need reworked ... the takes are off ... a new intro for every
single mission ... not easily skippable". One film per mission, 30 to 75
s, in engine on the Itaipu map, no person on screen, the story carried by
the radio voices of BIBLE.md section 5. What the sequencer must grow to
play them is TECH-NEEDS.md part T2.

## 0. What is wrong with today's intro, measured

Today there is one film (`src/render/warintro.js`, six shots timed by
`src/share/war/intro.js` `SHOT_MS`) for every mission. Read against the
code on `origin/main` at 51dd7684, and measured where a number could be
had:

| # | Fault | Evidence | Fix (TECH-NEEDS) |
| --- | --- | --- | --- |
| 1 | **The swarm shot's Strikers arrive after the shot ends.** The film times them from a hand typed 38 m/s (`t0: 2400 - (780 / 38) * 1000`), the speed before the owner slowed every attacker to 0.7 (`routes.js` `KIND.strike.speed` is 26.6). | Flown through `routes.js` `planAgent`/`poseAt` in Node: the lone Striker meant to pass over the camera at 2.4 s passes at **11.17 s** of an 11.0 s shot (18 m away); the ten meant to pass beside it at about 9 s pass at **23.0 s**, twelve seconds after the cut. The shot's whole point is never on screen. | T2.4: agents are placed by "be at point P at shot ms T", solved from `routes.js`, never from a typed speed; a film lint fails any pass outside its shot. |
| 2 | **The closing wave never closes.** | Same measurement for shot 6: the Striker groups are 1 077 to 551 m from the camera across the 20 s shot; the west group sits 19 to 31 degrees off the lens axis while the frame's half width is 9.7 degrees for the first 8.5 s, so it is out of the telephoto frame; the Loiterers are out of it too. | T2.4, and storyboards that frame what the agents really do. |
| 3 | **The shots do not know how long their lines are.** `SHOT_MS` is constants; each voice line starts at a typed `at`. Spanish runs longer: intro-2 is 5.63 s in English and 6.57 s in Spanish (`assets/audio/war/manifest.json`). | A line, a shot and a language can disagree, and nothing checks it. | T2.3: a shot's length is computed from the longer language's measured line plus its pads, at build time, into the table the room reads. |
| 4 | **A late line is dropped, not caught up.** `SAY_LATE_MS` is 1.2 s: a pilot whose frame clock is 1.3 s behind a cue never hears that line. | `warintro.js` `sounds()`. | T2.5: play the line from its offset. |
| 5 | **The voice is fetched on cue.** `WarRadio.play` sets the media element's `src` when the line is due, so its fetch and decode land on the film's clock. The film's clock is `performance.now()` from the first frame; the voice runs on the media element's own. | `warradio.js` `play()`. | T2.5: decode every line of the film before it starts, schedule on the AudioContext clock, and run the film from that clock. |
| 6 | **Every mission says "Mission 1".** | `warintro.js`: `str(title.sub, { n: 1 })`. And the card says "DEFEND ITAIPU" though the act is "Defend the Paraná". | One film per mission (this document). |
| 7 | **Any key skips, and there is no record of having seen it.** | `onInput` skips on the first keydown or pointerdown; `warIntroShown` is the match in memory, so a reload forgets it. | T2.6: a per pilot seen record and the skip rule of section 3. |
| 8 | **The takes are off.** Each line is the first generated take that passes Whisper (`tools/voice/build.py`): correct words, not necessarily the right read. | The build's acceptance gate is words only (`script.judge`). | T3.2: several takes a line, a pinned choice per line after a human listen, and direction notes per line (below). |

## 1. The language of every film

### 1.1 Lenses

Every shot names a lens in millimetres on a full frame sensor, 36 mm
wide. The lens fixes the **horizontal** field of view, which is what the
2.39 letterbox keeps on any screen:

    hfov = 2 atan(18 / f)
    camera.fov (three.js, vertical, whole canvas) = 2 atan(tan(hfov / 2) / canvasAspect)

So the framing is the same on a 16:9 laptop and a 21:9 monitor. Values:

| Lens mm | hfov | three.js fov at 16:9 | the visible 2.39 frame's vertical |
| --- | --- | --- | --- |
| 14 | 104.3 | 71.7 | 56.6 |
| 18 | 90.0 | 58.7 | 45.4 |
| 24 | 73.7 | 45.7 | 34.8 |
| 35 | 54.4 | 32.3 | 24.3 |
| 50 | 39.6 | 22.9 | 17.1 |
| 85 | 23.9 | 13.6 | 10.1 |
| 135 | 15.2 | 8.6 | 6.4 |
| 200 | 10.3 | 5.8 | 4.3 |
| 400 | 5.2 | 2.9 | 2.2 |
| 600 | 3.4 | 1.9 | 1.4 |

A 2.5 m Striker a kilometre away fills about 3 % of the frame's width at
400 mm and a quarter of a percent at 35 mm. Distant waves are filmed long
or not at all.

### 1.2 Camera types

The sequencer's primitives (T2.2). Every shot is exactly one of them.

| Type | What it is | Parameters |
| --- | --- | --- |
| **dolly** | the camera travels a straight or gently curved line; the look is a fixed point or a subject | path points, look target, speed profile |
| **crane** | the camera rises or falls on a vertical arc while tilting to hold a subject; the reveal shot | base point, height from and to, arm radius, tilt target |
| **orbit** | circles a centre at a radius and height, through an arc | centre, radius, height, start and end angle, direction |
| **handheld** | a near still camera with a human's sway: low frequency drift and a little high frequency shake, from a seeded noise, never a sum of sines | anchor, look, amplitude (m), drift period (s) |
| **drone POV** | the camera rides a flight: a cast aircraft's or an attacker's route, with lag, banking into turns, and its own small vibration | the flight it rides, offset, bank gain, lag |
| **telephoto** | a long lens on a fixed or slowly panning head; compression, heat shimmer optional | anchor, look path, pan speed |

### 1.3 Easing

Four, named in each shot row: **lin** (constant speed, for drone POV and
anything that should feel mechanical), **io** (ease in and out, cubic;
the default for dolly and crane), **out** (starts at speed, settles: a
move that arrives), **in** (starts still, leaves: a move that departs).
**hold** is a still frame for the shot or for its tail.

### 1.4 Transitions

**cut** (the default), **smash** (a cut on a sound: a hit, a voice's
first word), **dip** (to black and back, 0.4 to 1.0 s, for time passing),
**match** (the next shot opens on the same shape or motion: a wake to a
wake, a wire to a wire).

### 1.5 Inserts

Two 2D overlays the camera can cut to, because they are how the cell
sees the war and they show no person (T2.8):

- **SCOPE**: MIRADOR's radar, a dark map of the reservoir and the
  landmarks with contact tracks drawn from the same routes the
  attackers fly, so what the scope shows is what will happen.
- **GRID**: DESPACHO's board, the districts of `src/share/war/grid.js`
  as lit or dark tiles, the towns named.

### 1.6 The voice, the music and the sound

- Every film's narration is a set of lines in `lines.json` (group
  `film`), generated by the voice pipeline in the voices of BIBLE.md
  5.2, both languages, with the radio colour of the speaker.
- Each line row below gives its **target length**: what the English read
  should land near. The build measures both languages; the shot that
  carries the line is sized from the longer (section 2).
- Music: one cue per film from the war's music bed (T3.4). Sound effects
  are the world's own (`docs/AUDIO.md` section 12): engines, wind, water,
  the explosions of the war.
- Subtitles in the page's language under every line, as today.

### 1.7 What a film may and may not show

May: the dam, the water, the towns and their lights, the lines and
towers, the attackers (unmarked grey), the hangar's aircraft standing,
taxiing or flying on their own, smoke from a structure, a district's
lights going out, the inserts.

May not: a person, a hand, a face, a figure at a window; anything hurt;
any insignia, flag or slogan; a real organisation's name or logo; a
spoken number of anything real.

## 2. Sync: the film is timed by its voice

The cure for faults 1 to 5 (TECH-NEEDS T2.3 to T2.5):

1. **A shot's length is computed, not typed.** Each shot declares `min`
   (its own seconds), and for each line it carries `lead` (silence before
   the line) and `tail` (after it). Its length is
   `max(min, lead + max(seconds.en, seconds.es) + tail)` from
   `manifest.json`. A tool writes the per film table into a module the
   room imports, so the room's briefing length and every screen agree
   (today's `INTRO_MS` becomes `FILM_MS[missionId]`).
2. **Everything in a shot is anchored.** A camera key, a title, an
   agent's pass or a sound is placed at `shot.start + x`, `vo.start + x`,
   `vo.end + x` or `shot.end - x`, never at an absolute millisecond. If a
   line gets longer, everything after it moves with it.
3. **Agents are placed by where they must be.** "The lone Striker passes
   3 m left of the lens at `vo.start + 0.4`": the sequencer solves the
   attacker's `t0` from `routes.js` (arc length over the kind's real
   speed), and the film lint fails if the pass misses its time by more
   than 0.1 s or its point by more than 2 m.
4. **One clock.** All the film's lines and its music are decoded before
   the film starts (a black hold with the title of the mission while
   they load, never longer than the room's prep); the film then runs on
   the AudioContext's clock, and every line is scheduled on it, so voice
   and picture cannot drift.
5. **A late joiner is caught up, not cut.** A screen that starts at a
   room offset plays the line under way from its offset.
6. **A film lint** (T2.7) fails a build where a shot is shorter than its
   line, a film is outside 30 to 75 s, a pass lands outside its shot, a
   cast member stands in a collider, or a line has no file in either
   language.

## 3. Skipping

- **The first viewing of each film is unskippable** for that pilot.
- After it, **hold any key, button or tap for 2 s** to skip: a ring fills
  in the corner, releasing cancels. A tap does nothing. The hint reads
  "Hold to skip" and appears only on a film this pilot has seen.
- "Seen" is per pilot and per film version, kept with the campaign's
  saved state (T2.6), and set when the film's last shot is reached on
  that screen. A film whose cut changes gets a new version and is
  unskippable once more.
- **In a room**, the briefing lasts the film's length (`FILM_MS`). A pilot
  who skips their own view waits on the hangar orbit with the briefing's
  seconds left, as today. The host can end the briefing for everyone
  only when every pilot present has seen this film's version; otherwise
  the host's hold skips only the host's view. The welcome carries who has
  seen what.
- A pilot who joins mid film sees it from where the room is; that viewing
  does not count as seen unless it reached the last shot from its first.
- **Watch again** from the war menu, any film this pilot has seen.

## 4. The hand-off to play

Every film ends on its last shot settling (`out` easing) over the crest
road, where the aircraft wait. For its last 1.5 s the sequencer blends
from the film's camera to the pilot's own camera at the pilot's own seat
(the slot's spawn, so each screen's last frame is its own), the letterbox
bars open over the same 1.5 s, and the countdown's first number appears
as they finish. The countdown lines (`<mission>-s0-brief`, `-s0-rules`,
MISSIONS.md) play over the countdown, not the film. The music bed's
`AMB` continues under, so there is no silence between the film and the
first stage.

## 5. The films

Each film: its idea, its grade, its shots, its lines. **Shot length is
the target**; the build recomputes it from the lines. Line ids are
`film-<mission>-<n>`; every line passed `tools/voice/script.py` `load()`
(MISSIONS.md section 3).

Columns of the shot tables: **#**, **s** (seconds, target), **camera**,
**lens** (mm), **from** and **to** (framing at the start and end),
**subject and motion**, **ease**, **VO** (the line id it plays under),
**sound** (music cue, sfx), **out** (transition to the next).

---

### 5.1 First Light (`itaipu-1`): "2030", reworked

**Idea.** Today's film kept, because its script is good, and rebuilt
around its faults: the year, the swarms, the structure, the hangar, the
warheads, the first contact. It is the act's prologue and mission 1's
intro at once, so it plays first and longest. **Grade:** dawn, then
steel. **Music:** the intro track (built), from black. **Length:** 70 s.

| # | s | camera | lens | from | to | subject and motion | ease | VO | sound | out |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 6 | dolly | 35 | black; then the reservoir at water level, the crest a line on the horizon | the same, 40 m closer | the camera skims 3 m over the water toward the dam at dawn, mist on the surface; the title "2030" | io | film-itaipu-1-1 | music in; water, wind | dip |
| 2 | 9 | telephoto | 400 | the horizon over the far reservoir, empty | the same, a dot growing | one Striker, head on, grows out of the haze; its engine heard before it is seen | hold, then lin pan 0.5 degree | film-itaipu-1-2 | a boxer twin, far | smash |
| 3 | 5 | handheld | 24 | low on the water, the lens 2 m up, looking north | the same | the Striker passes 6 m over the lens, left to right, at `shot.start + 2.5`; its wash ruffles the water | hold | | the pass, loud, doppler | cut |
| 4 | 7 | telephoto | 600 | the haze | the haze, ten shapes | ten Strikers in a loose line abreast, compressed by the lens, coming on | lin | film-itaipu-1-3 | a swarm's drone, building | cut |
| 5 | 10 | crane | 24 | the upstream face at the waterline, the intakes' gates | over the crest, the whole dam and the river beyond | rises up the face to the crest and over it; the output counter counts up to the plant's full output | io | film-itaipu-1-4 | low string swell | cut |
| 6 | 9 | dolly | 35 | the shed's door, dark inside | along the line of aircraft on the crest deck | the P-51, the Cub, the quads, the Skyhunter, the F-16, the Timber, each with a warhead slung under; nobody there | io | film-itaipu-1-5 | a radio's hiss in the shed; a fan | cut |
| 7a | 3 | handheld | 35 | a 5 inch quad's props, close, still | the props a blur | the props spin up | in | film-itaipu-1-6 (spans 7a to 7c) | the motors' rising whine | smash |
| 7b | 3 | drone POV | 18 | behind a Skyhunter just thrown off the crest | the Skyhunter climbing out over the water | rides the thrown Skyhunter's climb | lin | | a pusher prop, wind | smash |
| 7c | 3 | handheld | 50 | the F-16 from behind and low | the same, its fan spooling, heat shimmer | the F-16's fan spools up | hold | | the fan's rising note | smash |
| 8 | 15 | telephoto, then a crane out | 200 to 24 | the first wave on the horizon (it is the mission's stage 1 scout and the stage 2 Strikers, flown by the real routes) | the crest, defenders rising past the lens from both banks | the lens pulls back as the defenders climb into frame; the title card "FIRST LIGHT", under it "DEFEND THE PARANÁ", act and mission | out | film-itaipu-1-7 | music to its peak, then the bed's `AMB` | hand-off |

**Changes from today:** shot 2 is split into a telephoto reveal (2), a
pass over the lens that is now solved from the route (3) and a long lens
on the ten (4), so the pass that was never seen is the centre of the
shot; the closing wave is shot long, where the agents really are; the
hangar shot gets a real dolly; the title is the mission's.

| id | cue | who | del | EN | ES |
| --- | --- | --- | --- | --- | --- |
| film-itaipu-1-1 | shot 1, lead 1.5 s, target 1.2 s | CREST | calm | Twenty thirty. | Dos mil treinta. |
| film-itaipu-1-2 | shot 2, lead 1.0 s, target 3.0 s | CREST | firm | Wars aren't won with jets anymore. | Las guerras ya no se ganan con aviones de combate. |
| film-itaipu-1-3 | shot 4, lead 0.5 s, target 3.4 s | CREST | firm | They're won with swarms. Cheap. Fast. Endless. | Se ganan con enjambres. Baratos. Rápidos. Interminables. |
| film-itaipu-1-4 | shot 5, lead 2.0 s, target 4.2 s | CREST | calm | Every country's lights hang on a few structures. Ours hang on this one. | La luz de cada país cuelga de un puñado de estructuras. La nuestra cuelga de esta. |
| film-itaipu-1-5 | shot 6, lead 1.5 s, target 4.3 s | CREST | firm | The interceptors ran out in the first week. What we have left... is you. | Los interceptores se acabaron la primera semana. Lo que nos queda... son ustedes. |
| film-itaipu-1-6 | shot 7, lead 0.8 s, target 5.5 s | TALLER | firm | Every bird in the hangar carries a warhead now. One flight. One kill. Make it count. | Cada aparato del hangar lleva una ojiva. Un vuelo. Un derribo. Que cuente. |
| film-itaipu-1-7 | shot 8, lead 2.0 s, target 5.0 s | MIRADOR | urgent | Contacts north, over the water. All pilots... get up there. | Contactos al norte, sobre el agua. Todos los pilotos... ¡arriba! |

Lines 1 to 5 are today's intro-1 to intro-4 text, kept, with intro-2
split in two so each half sits on its own picture. Line 6 moves to TALLER
and line 7 to MIRADOR, so the act's first film introduces three voices.

---

### 5.2 The Spillway (`itaipu-2`)

**Idea.** The river as a living thing. Rain, the reservoir high against
the gates, the scope showing what is gathering in the west arm. **Grade:**
steel, low contrast, wet. **Music:** low pulse, rain texture.
**Length:** 50 s.

| # | s | camera | lens | from | to | subject and motion | ease | VO | sound | out |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 7 | telephoto | 135 | rain on the reservoir's surface, close | the gates in the distance | slow pan from the water to the fourteen gates on the right bank | io | | rain, distant thunder | match |
| 2 | 8 | crane | 24 | at the waterline against a gate's skin, the water near its top | over the gate's hoist house, the spillway chute empty below | rises up the gate and over its pier | io | film-itaipu-2-1 | water against steel | cut |
| 3 | 7 | SCOPE insert | | the reservoir, the west arm, quiet | tracks appearing in the west arm | contact marks fade in one by one (the mission's stage 1 and 2 groups, from their routes) | lin | film-itaipu-2-2 | the scope's tick | smash |
| 4 | 7 | drone POV | 18 | over the approach channel at 30 m, flying toward the gates | the gates filling the frame | the camera rides `channel-low` as a Striker would, the gates growing | lin | film-itaipu-2-3 | wind, a motor | cut |
| 5 | 6 | handheld | 50 | the crest road by the gates, a float plane on its dolly | the float plane, props turning | the Timber on floats, its warhead, rain on its wing | hold | | a glow engine starting | cut |
| 6 | 15 | orbit | 35 | the right bank from the reservoir side, 150 m out, 60 m up | the gates and the chute, the town behind | a half orbit as the working gates (the seed's) are outlined and their hoists start to move; title "THE SPILLWAY" | io | film-itaipu-2-4 | music up; the hoists' motors | hand-off |

| id | cue | who | del | EN | ES |
| --- | --- | --- | --- | --- | --- |
| film-itaipu-2-1 | shot 2, lead 1.5 s, target 4.5 s | CREST | calm | It rained upstream all night. The reservoir's at the top of the gates. | Llovió toda la noche aguas arriba. El embalse está al tope de las compuertas. |
| film-itaipu-2-2 | shot 3, lead 1.0 s, target 4.5 s | MIRADOR | firm | They've been gathering in the west arm since noon. They know we have to spill. | Se están juntando en el brazo oeste desde el mediodía. Saben que tenemos que verter. |
| film-itaipu-2-3 | shot 4, lead 0.5 s, target 4.0 s | CREST | firm | If they take the working gates, we lose control of the river. | Si nos sacan las compuertas que funcionan, perdemos el control del río. |
| film-itaipu-2-4 | shot 6, lead 2.0 s, target 3.0 s | CREST | firm | Opening them now. Keep them alive. | Abriendo ahora. Manténganlas vivas. |

---

### 5.3 Lights Out (`itaipu-3`)

**Idea.** The grid as the stake. The yard in the last light, the lines
running out of it, DESPACHO's board, and the lights of the towns coming
on one by one. Ends on the knowledge that some of what is coming is
false. **Grade:** golden into blue. **Music:** a slow tick. **Length:**
55 s.

| # | s | camera | lens | from | to | subject and motion | ease | VO | sound | out |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 8 | telephoto | 300 | the 500 kV towers in a line, stacked by the lens, golden light | the same, the sun lower | a slow pan along the corridor from the yard toward the horizon | lin | | the lines' hum | cut |
| 2 | 9 | crane | 24 | among the transformer rows, low | over the yard, the right bank beyond | rises out of the yard between the gantries | io | film-itaipu-3-1 | hum, wind | cut |
| 3 | 7 | GRID insert | | the board, every district lit | the same, the right bank's districts outlined | DESPACHO's board: the districts that hang on the yard pulse | hold | film-itaipu-3-2 | a phone line's hum | cut |
| 4 | 9 | dolly | 35 | the edge of Hernandarias from 80 m up, dusk | the same, its street lights coming on | crosses the town's edge as its lights come on district by district (night.js, from day) | io | | the town's distant traffic (AUDIO.md section 12) | cut |
| 5 | 7 | telephoto | 400 | the west arm, two shapes low | the same, closer | two Strikers, identical, one a decoy (the mission's stage 1 pair) | lin | film-itaipu-3-3 | two engines, one slightly off | cut |
| 6 | 15 | orbit | 24 | over the yard at 120 m | the same, quarter turn, the town lit beyond | the squad's aircraft on the right bank's road below, the yard, the lit town; title "LIGHTS OUT" | io | film-itaipu-3-4 | music up | hand-off |

| id | cue | who | del | EN | ES |
| --- | --- | --- | --- | --- | --- |
| film-itaipu-3-1 | shot 2, lead 2.0 s, target 4.0 s | CREST | calm | Everything the right bank makes leaves the dam through this yard. | Todo lo que genera la margen derecha sale de la represa por esta subestación. |
| film-itaipu-3-2 | shot 3, lead 0.5 s, target 4.5 s | DESPACHO | calm | Crest, Dispatch. I can reroute it. I need time, and I need that yard standing. | Cresta, Despacho. Lo puedo redirigir. Necesito tiempo, y necesito esa subestación en pie. |
| film-itaipu-3-3 | shot 5, lead 1.0 s, target 3.8 s | MIRADOR | firm | Same shape, same speed. One of them is lying. | Misma forma, misma velocidad. Uno de los dos miente. |
| film-itaipu-3-4 | shot 6, lead 3.0 s, target 3.5 s | CREST | firm | Get close before you spend a bird. | Acérquense antes de gastar un aparato. |

---

### 5.4 The Long Night (`itaipu-4`)

**Idea.** Darkness and silence. Almost nothing happens, slowly, and that
is the fear. A wake with no lights under the town's reflection. Pilots'
aircraft on the crest with their lights going off one by one. **Grade:**
night, blue black, the town's sodium. **Music:** almost none.
**Length:** 50 s.

| # | s | camera | lens | from | to | subject and motion | ease | VO | sound | out |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 9 | telephoto | 200 | the far shore's lights reflected on black water | the same | still; one reflection breaks: a wake with no lights crosses it | hold | | water, insects, nothing else | cut |
| 2 | 8 | handheld | 35 | the crest's lamps, a row of them | the same, darker | the crest's lights in their row; a gust; the camera breathes | hold | film-itaipu-4-1 | the lamps' buzz | cut |
| 3 | 9 | dolly | 50 | the line of aircraft on the crest deck, nav lights on | the same, every nav light off | dolly along the line; each aircraft's nav light goes out as the camera passes | io | film-itaipu-4-2 | a switch's click per aircraft | cut |
| 4 | 7 | telephoto (thermal look) | 85 | the reservoir in the Avionics HUD's thermal view, grey | a warm dot on the water | the thermal look (built for the HUD) on the reservoir; one small warm shape weaving | hold | film-itaipu-4-3 | the scope's tick | smash |
| 5 | 6 | drone POV | 18 | out of the gorge at 40 m, fast, dark | the dam's downstream face, lit | rides a Hunter's birth route out of the gorge toward the crest | lin | | a Hunter's whine, rising | cut |
| 6 | 11 | crane | 24 | the crest road at deck level | high over the dam, the towns lit on both banks | rises over the dark crest; title "THE LONG NIGHT" | io | film-itaipu-4-4 | music's first chord | hand-off |

| id | cue | who | del | EN | ES |
| --- | --- | --- | --- | --- | --- |
| film-itaipu-4-1 | shot 2, lead 2.0 s, target 3.5 s | CREST | calm | They learned our days. Now they're trying our nights. | Aprendieron nuestros días. Ahora prueban nuestras noches. |
| film-itaipu-4-2 | shot 3, lead 1.0 s, target 3.0 s | TALLER | calm | Lights off on every bird. Fly by the markers. | Luces apagadas en todos los aparatos. Vuelen por los marcadores. |
| film-itaipu-4-3 | shot 4, lead 1.5 s, target 3.5 s | MIRADOR | calm | Something on the water. No lights. Small. | Algo en el agua. Sin luces. Chico. |
| film-itaipu-4-4 | shot 6, lead 2.5 s, target 4.0 s | CREST | firm | Fly in pairs. Hold until the sun comes up. | Vuelen de a dos. Aguanten hasta que salga el sol. |

---

### 5.5 The River Below (`itaipu-5`)

**Idea.** Speed and a new place. The camera flies the gorge the way the
swarms will, and hears Carancho's flight run out of birds. **Grade:**
hard morning light, high contrast in the gorge. **Music:** drums.
**Length:** 45 s.

| # | s | camera | lens | from | to | subject and motion | ease | VO | sound | out |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 6 | telephoto | 400 | the river far below the dam, the morning haze | the same | a smudge of smoke far downriver on the Brazilian bank (a burning structure, nothing more) | hold | film-itaipu-5-1 | far, broken radio static | cut |
| 2 | 9 | drone POV | 14 | at the river's surface below the gorge, 10 m up, upriver | the gorge's walls closing in | rides the `gorge` route at swarm speed, weaving, the rims rushing past | lin | film-itaipu-5-2 | wind roar, a motor | match |
| 3 | 6 | drone POV | 14 | the gorge narrowing | the downstream face and the penstocks filling the frame | continues, pulls up hard at the face | out | | the motor screams, then cuts | smash |
| 4 | 7 | SCOPE insert | | the river below the dam | a cluster of tracks rising from one point on the river | the tracks come from one place, again and again | lin | film-itaipu-5-3 | the scope's tick, faster | cut |
| 5 | 6 | handheld | 50 | the 10 inch quad and the Striker fixed wing on the road | the same | the heavy aircraft with wide warheads, being readied by nobody | hold | | a turbojet starting | cut |
| 6 | 11 | crane | 24 | the plunge pool's spray | over the powerhouse, the river and the gorge below | rises out of the spray; title "THE RIVER BELOW" | io | film-itaipu-5-4 | music up | hand-off |

| id | cue | who | del | EN | ES |
| --- | --- | --- | --- | --- | --- |
| film-itaipu-5-1 | shot 1, lead 1.0 s, target 4.0 s | CARANCHO | urgent | Crest, Carancho. That's the last of our birds. We can't hold the river. | Cresta, Carancho. Ese fue nuestro último aparato. No podemos sostener el río. |
| film-itaipu-5-2 | shot 2, lead 2.0 s, target 3.5 s | CREST | firm | Copy. Everything coming up the gorge is ours. | Copiado. Todo lo que suba por el cañón es nuestro. |
| film-itaipu-5-3 | shot 4, lead 0.5 s, target 4.5 s | MIRADOR | firm | They all start from the same stretch of river. Something is launching them. | Todos salen del mismo tramo del río. Algo los está lanzando. |
| film-itaipu-5-4 | shot 6, lead 2.5 s, target 2.5 s | CREST | firm | Find the source. | Encuentren el origen. |

---

### 5.6 The Corridor (`itaipu-6`)

**Idea.** Scale. The lines run out of sight; the squad cannot be
everywhere. Tower by tower, the lens shows how far it is. **Grade:**
golden, long shadows. **Music:** a long drone. **Length:** 55 s.

| # | s | camera | lens | from | to | subject and motion | ease | VO | sound | out |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 9 | orbit | 24 | under a 500 kV tower, looking up its legs | the tower against the sky, the wires leaving | a quarter orbit at the tower's foot, tilting up | io | | the lines' hum, loud | match |
| 2 | 9 | drone POV | 18 | along the wires at wire height | the next tower, and the next | rides the corridor between the wires, the towers passing | lin | film-itaipu-6-1 | wind, the hum | cut |
| 3 | 8 | GRID insert | | the board, each corridor a line feeding its towns | the same, the corridors pulsing | which towns each corridor feeds | hold | film-itaipu-6-2 | phone hum | cut |
| 4 | 8 | telephoto | 600 | the corridor to the horizon, towers stacked | a dot moving along it, low | one Striker following the corridor | lin | film-itaipu-6-3 | far engine | cut |
| 5 | 6 | handheld | 35 | the Bramor and the Skyhunter on the crest road | the same | the long winged aircraft that will spot; their wings in the golden light | hold | | wind | cut |
| 6 | 15 | crane | 18 | the crest road | very high over the dam, both corridors running away into the dusk | rises until the corridors are lines to both horizons; title "THE CORRIDOR" | io | film-itaipu-6-4 | music up | hand-off |

| id | cue | who | del | EN | ES |
| --- | --- | --- | --- | --- | --- |
| film-itaipu-6-1 | shot 2, lead 1.5 s, target 4.0 s | CREST | calm | They've stopped trying to break the dam. Now they want to cut it off. | Dejaron de intentar romper la represa. Ahora la quieren aislar. |
| film-itaipu-6-2 | shot 3, lead 0.5 s, target 5.0 s | DESPACHO | calm | If the corridors go, the plant can run all night and the towns still go dark. | Si caen los corredores, la central puede funcionar toda la noche y los pueblos igual se apagan. |
| film-itaipu-6-3 | shot 4, lead 1.5 s, target 3.0 s | MIRADOR | firm | They're following the wires. All of them. | Siguen los cables. Todos. |
| film-itaipu-6-4 | shot 6, lead 3.0 s, target 4.5 s | CREST | firm | Spread out. Spotters, tonight you're everybody's eyes. | Despliéguense. Observadores, esta noche ustedes son los ojos de todos. |

---

### 5.7 Breach (`itaipu-7`)

**Idea.** The one film that is slow from first frame to last. Blue before
dawn. The scope with tracks crawling for minutes. The upstream face from
the water, very close. The gantry crane on the crest that nobody ever
looks at. The word "breach" is not said in the film; the film shows why
it might be. **Grade:** blue hour, very low saturation. **Music:** a
pedal tone. **Length:** 65 s.

| # | s | camera | lens | from | to | subject and motion | ease | VO | sound | out |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 10 | telephoto | 600 | the far reservoir, blue, flat | the same, three faint wakes | still; the wakes are barely moving | hold | | silence, then a low tone | cut |
| 2 | 9 | SCOPE insert | | the whole reservoir | slow tracks from the far north, a long way from the dam | the breachers' tracks, crawling; the scope's range rings | lin | film-itaipu-7-1 | the scope's tick, slow | cut |
| 3 | 10 | dolly | 35 | at the waterline 30 m from the upstream face | 3 m from it, the intake gate's frame filling the frame | a slow push on the face at the waterline, the water against the concrete | io | film-itaipu-7-2 | water lapping | cut |
| 4 | 8 | crane | 24 | the bulkhead gantry crane on the crest, from its rails | over its girder, the stoplogs racked beside it | rises up the gantry | io | film-itaipu-7-3 | metal ticking as it cools | cut |
| 5 | 8 | dolly | 50 | the whole line of aircraft on the crest deck | the float planes and the Striker fixed wing at its end | every aircraft the act has used, standing, warheads on | io | film-itaipu-7-4 | wind | cut |
| 6 | 5 | telephoto | 400 | the far reservoir | the wakes, closer | the breachers, heavier and slower than anything yet | lin | | a deep diesel thrum | dip |
| 7 | 15 | crane | 18 | the crest road in blue light | high over the dam, the reservoir and the river, the sky lightening in the east | rises; title "BREACH" | io | film-itaipu-7-5 | music's pedal resolves | hand-off |

| id | cue | who | del | EN | ES |
| --- | --- | --- | --- | --- | --- |
| film-itaipu-7-1 | shot 2, lead 1.5 s, target 4.5 s | MIRADOR | calm | Heavy hulls on the far reservoir. Slow. Bigger than anything we've seen. | Cascos pesados en el embalse lejano. Lentos. Más grandes que todo lo que vimos. |
| film-itaipu-7-2 | shot 3, lead 2.5 s, target 5.0 s | CREST | calm | Everything until now, they were learning us. This is what they learned it for. | Todo lo de hasta ahora fue para aprendernos. Esto es para lo que aprendieron. |
| film-itaipu-7-3 | shot 4, lead 1.5 s, target 4.5 s | TALLER | calm | If it comes to it, the stoplogs go down from here. Nobody touches my crane. | Si hace falta, las ataguías bajan desde acá. Nadie me toca la grúa. |
| film-itaipu-7-4 | shot 5, lead 1.0 s, target 4.5 s | CREST | firm | Kill them far out. Everything else tonight is there to pull you off them. | Mátenlos lejos. Todo lo demás esta noche está para sacarlos de encima de ellos. |
| film-itaipu-7-5 | shot 7, lead 4.0 s, target 2.5 s | CREST | firm | Both banks. On me. | Las dos márgenes. Conmigo. |

`film-itaipu-7-3`'s Spanish "Nadie me toca la grúa" is TALLER speaking of
himself, not addressing a pilot, so the ustedes rule holds.

## 6. Direction notes for the voice takes

Fault 8 is the read, not the words. Every film line carries a `notes`
field for the build (as `lines.json` does today), and these rules for
whoever pins the take (T3.2):

- **CREST** never hurries. A pause before the line's last phrase is
  better than none. No rising ends.
- **MIRADOR** is quick and flat; the urgency is in the pace, never in
  the pitch.
- **TALLER** is rough and close; a little breath is right for him.
- **DESPACHO** is calm the way a phone call at 3 a.m. is calm.
- **CARANCHO** is far away and tired, with the radio breaking.
- A take with a babbled tail, a wrong stress on a place name (Paraná,
  Hernandarias) or a misread Guaraní word is rejected however well
  Whisper scored it.
