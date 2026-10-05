# The Interior: the films

Written 2026-10-05. Every film of The Interior as a shot list in the
film timeline's own terms (`src/share/war/film.js`, the house language
of docs/campaign/INTROS.md sections 1 to 4: lenses on a 36 mm frame,
camera types, easing, transitions, anchors, the shot sized by its
lines). What the timeline must grow is TECH-NEEDS.md N9 and N18; the
voices are BIBLE.md section 5; the lines' triggers in play are
MISSIONS.md.

## 0. The rules of these films

1. **Faceless room** (PLAN 9 B). The operations room is shown only on
   its **BOARD** (N18: the sector map and its layers, stills, archive
   matches, split screens, alerts) and in a few handheld shots of
   monitors, a table, at most a hand placing a still or touching a
   screen. No face, no figure, no body. Where the treatment has a
   character "look toward the player's station", the camera looks from
   the player's station at the BOARD, and the line carries the look.
2. **People from the air only.** World shots may show people on the
   ground as the aircraft's camera sees them: small, through the camera
   ball's picture with its HUD, or a long lens from high. Never a
   ground level shot of a person.
3. **Timed by the voice** (house INTROS 2): a shot's length is the
   longest of its `min` and its lines (lead, the longer language, tail);
   every key is anchored to `start`, `end`, `vo.start`, `vo.end`.
4. **Skipping** (house INTROS 3): the first viewing of each film is
   unskippable for that pilot; after it, hold any key, button or tap for
   2 s to skip; "seen" is per pilot and per film version (N20 keeps it
   with the Interior's progress). In a room the host ends a film for all
   only when every pilot present has seen this version.
5. **Length 30 to 75 s** (`films:lint`, `FILM_MIN_S`, `FILM_MAX_S`). The
   campaign's opening is its own film so that no threshold changes
   (TECH-NEEDS section 4).
6. **Hand off.** A mission's intro ends on Pista Cero or over the
   mission's first ground, blending into the pilot's own camera as in
   the house rule; outros and endings end on black and the debrief.
7. **Grade.** Archive: desaturated, grain, warm paper. Room: dim, cool,
   monitor glow. Air: the camera ball's own picture with the quiet HUD
   (N7), never the mocks' coordinates or area name.

**BOARD shot notation** (N18): `camera: board`, then the layers it shows
and when, by anchor. Layers: `sectors` (Alpha, Bravo, Charlie boxes),
`roads`, `routes`, `contacts` (UNKNOWN dots), `stills [ids]`, `match
[a, b]`, `split [left, right]`, `alert text`, `faction [old, new,
network]`, `zoom from to` (the map's scale). Stills named `cap:<item>`
are the squad's own captures from the room record, with the authored
fallback `rec:<item>` (the analyst reconstruction) when missing.

Columns: **#**, **s** (target seconds; the build recomputes), **camera**,
**lens** (mm, world shots), **from** / **to**, **subject and motion**,
**ease**, **VO** (line id), **sound**, **out**.

Line columns: **id**, **cue** (shot, lead, target English length), **who**,
**EN**. Spanish goes into the same rows when generated, ustedes to the
players, usted between characters.

---

## P. The campaign's opening: "Where are they?" (`interior-prologue`)

Plays once before M1's intro the first time a pilot opens the campaign,
and from the menu after. **Idea:** years of not finding, then a modern
camera opening on the land. **Music:** none, then THE INTERIOR's first
notes under the title. **Length:** about 57 s.

| # | s | camera | lens | from | to | subject and motion | ease | VO | sound | out |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 6 | board | | black | black | nothing; radio static | hold | film-intp-1, film-intp-2, film-intp-3 | static, an old receiver's hum | cut |
| 2 | 7 | board | | `stills [arch-checkpoint]` | `stills [arch-road]` | old photographs, grain, slow push in: a road checkpoint, an empty dirt road | io | film-intp-4 | static | cut |
| 3 | 8 | board | | `stills [arch-forest, arch-aerial]` | `stills [arch-poster]` | dense forest from an old aircraft; a missing person poster with no readable name; a camp of tarps, abandoned | io | film-intp-5, film-intp-6 | the voices begin to overlap | cut |
| 4 | 6 | board | | `stills [arch-radios, arch-map]` | the map, circles drawn over circles | confiscated radios; a paper map covered in circles | io | film-intp-7 (spans 4 to 5) | overlap builds, then cuts to silence on `end` | smash |
| 5 | 2 | board | | black | black | silence | hold | | silence | smash |
| 6 | 9 | drone | 24 | the camera ball's picture switching on: noise, then the HUD drawing in | wide farmland at 17:00, Sector Alpha, Puente Doble in the distance | rides a Bramor's route over Sector Alpha; crisp, modern clarity against the archive's grain | lin | film-intp-8 | wind, the pusher prop, faint | cut |
| 7 | 9 | drone | 50 | the farmland | Monte Cerrado's edge, endless | the camera ball slews slowly toward the forest | io | film-intp-9 | wind | cut |
| 8 | 7 | board | | black | the title THE INTERIOR | the title in the HUD's type, letter spaced | hold | film-intp-10 | THE INTERIOR's first notes | dip |
| 9 | 3 | board | | black | black | | hold | | | cut (to M1's intro) |

| id | cue | who | EN |
| --- | --- | --- | --- |
| film-intp-1 | shot 1, lead 1.0, target 2.0 | ARCHIVE (man) | We have movement near the tree line. |
| film-intp-2 | after 1, lead 0.4, target 0.8 | ARCHIVE (second) | How many? |
| film-intp-3 | after 2, lead 1.2, target 0.8 | ARCHIVE (man) | Can't tell. |
| film-intp-4 | shot 2, lead 0.8, target 2.4 | ARCHIVE (third) | Units searched the sector. Negative contact. |
| film-intp-5 | shot 3, lead 0.6, target 1.8 | ARCHIVE (man) | Tracks disappeared near the river. |
| film-intp-6 | after 5, lead 0.5, target 1.0 | ARCHIVE (second) | No confirmation. |
| film-intp-7 | shot 4, lead 0.2, target 3.0, spans 2 | ARCHIVE (all three, overlapping) | No confirmation. No confirmation. No confirmation. |
| film-intp-8 | shot 6, lead 2.5, target 3.0 | IBARRA | For years, everyone asked the same question. |
| film-intp-9 | shot 7, lead 3.0, target 1.4 | IBARRA | Where are they? |
| film-intp-10 | shot 8, lead 2.0, target 1.8 | IBARRA | Maybe that was the wrong question. |

The archive stills are staged in engine or drawn for the game; none is a
real photograph, none shows a readable name or a face.

---

## M1. The Old War

**Loading card** (not a film; shown while the map streams): an aerial
still of farmland meeting forest, the two lines in sequence, then the
mission block (MISSIONS M1).

### M1 intro (`int1-intro`, M1_00)

**Idea:** a temporary room with nothing glamorous in it; three sectors on
a map; a job described as routine by people who suspect it is not.
**Grade:** room, then air. **Music:** none, THE INTERIOR bed at the
launch. **Length:** about 53 s.

| # | s | camera | lens | from | to | subject and motion | ease | VO | sound | out |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 6 | handheld | 35 | a row of portable monitors on a folding table, dim | the BOARD's edge | slow drift past cables, a plastic chair's back, a coffee cup; no person | io | film-int1-1 | a generator outside, a fan | cut |
| 2 | 6 | board | | `sectors` drawn: Alpha, Bravo, Charlie over the Interior | the same | the three survey boxes | hold | film-int1-2, film-int1-3 | room tone | cut |
| 3 | 9 | board | | `stills [int1-gen, int1-moto]` | `stills [int1-mast, int1-pair]` | a burned generator, an abandoned motorcycle, a communications mast, a blurry photograph of two people near a tree line (tiny, faceless) | io | film-int1-4, film-int1-5 | | cut |
| 4 | 7 | board | | the stills fading | `roads` over the sectors | the stills give way to the map | io | film-int1-6, film-int1-7 | | cut |
| 5 | 8 | board | | `sectors`, `roads` | the same with bridges and towers ticked | each word's thing marks on the map as it is said | hold | film-int1-8 | | cut |
| 6 | 6 | handheld | 50 | the BOARD from the player's station, slightly low | the same | the camera is the player's seat; the line is said to it | hold | film-int1-9, film-int1-10 | | smash |
| 7 | 5 | handheld | 35 | the Bramor on its catapult rail at Pista Cero, late sun | the same | nobody in frame; the propeller starts | in | | the motor spooling | smash |
| 8 | 6 | drone | 24 | behind the Bramor as the rail throws it | climbing over Sector Alpha | rides the launch | lin | | the rail's bang, the prop, wind | handoff |

| id | cue | who | EN |
| --- | --- | --- | --- |
| film-int1-1 | shot 1, lead 1.5, target 2.4 | VEGA | You weren't sent here to hunt anybody. |
| film-int1-2 | shot 2, lead 0.6, target 2.6 | VEGA | Officially, we're updating infrastructure imagery. |
| film-int1-3 | after 2, lead 0.4, target 1.2 | ROJAS | And unofficially? |
| film-int1-4 | shot 3, lead 0.5, target 3.4 | IBARRA | Unofficially, people have been reporting strange activity for months. |
| film-int1-5 | after 4, lead 1.5, target 1.8 | IBARRA | Nothing significant individually. |
| film-int1-6 | shot 4, lead 0.4, target 2.2 | ROJAS | Which usually means everyone ignores it. |
| film-int1-7 | after 6, lead 0.5, target 3.0 | IBARRA | Until the insignificant things start forming a pattern. |
| film-int1-8 | shot 5, lead 0.8, target 4.0 | VEGA | Roads. Bridges. Towers. Construction. Vehicles. |
| film-int1-9 | shot 6, lead 0.6, target 2.2 | VEGA | If you see something unusual, mark it. |
| film-int1-10 | after 9, lead 1.5 (the beat), target 2.0 | VEGA | Do not invent a story around it. |

Spanish note: Vega's lines 9 and 10 address the players: "Si ven algo
inusual, márquenlo." "No inventen una historia alrededor."

### M1 outro (`int1-outro`, M1_10)

**Idea:** the night after; the squad's own stills; the symbol against an
old photograph; the camp shrinking to nothing inside the region.
**Grade:** room at night. **Music:** a single sustained COLUMN note,
then nothing. **Length:** about 43 s. Plays after the ISR lands (fade
from the landing to the room).

| # | s | camera | lens | from | to | subject and motion | ease | VO | sound | out |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 5 | drone | 35 | the Bramor under its parachute at dusk over Pista Cero | the ground | the landing | out | | the canopy's flutter | dip |
| 2 | 8 | board | | `stills [cap:bridge, cap:shelters, cap:motorcycles, cap:antenna, cap:personnel]` | the same | the squad's own captures appear one after another, each with its capturer's seat tag | io | | room tone | cut |
| 3 | 8 | board | | `match [cap:symbol or rec:symbol, arch-symbol]` | the same | the new image of the mark beside an old photograph of it; a hand's shadow passes over the screen (at most a hand) | hold | film-int1-11, film-int1-12, film-int1-13 | | cut |
| 4 | 5 | board | | the match | the same | | hold | film-int1-14 | | cut |
| 5 | 8 | board | | `zoom` on Claro Viejo | the whole Interior; the camp a dot | the map zooms out | io | film-int1-15 | | cut |
| 6 | 7 | board | | the whole Interior | `roads`, bridges, settlements, forest marked around the dot | the marks appear | io | film-int1-16 | the note fades | dip |
| 7 | 2 | board | | black | MISSION COMPLETE | | hold | | silence | cut (to the debrief) |

Shot 3's still is the squad's symbol capture if `M1_SYMBOL_CAPTURED`,
else the analyst reconstruction frame marked RECONSTRUCTION (N8).

| id | cue | who | EN |
| --- | --- | --- | --- |
| film-int1-11 | shot 3, lead 1.5, target 1.6 | ROJAS | So they're back. |
| film-int1-12 | after 11, lead 0.6, target 0.8 | IBARRA | Maybe. |
| film-int1-13 | after 12, lead 0.4, target 2.2 | ROJAS | You just said that's their symbol. |
| film-int1-14 | shot 4, lead 1.0, target 3.6 | IBARRA | Symbols don't need permission to survive the people who created them. |
| film-int1-15 | shot 5, lead 3.5, target 2.6 | VEGA | Tomorrow we stop looking at the camp. |
| film-int1-16 | shot 6, lead 2.5, target 2.8 | VEGA | Tomorrow we look at everything around it. |

---

## M2. Eyes in the Forest

### M2 intro (`int2-intro`, M2_00)

**Idea:** the camp, empty, at ground level, as a body camera would see it
with nobody in frame (TECH-NEEDS F5); then two stills side by side.
**Length:** about 49 s.

| # | s | camera | lens | from | to | subject and motion | ease | VO | sound | out |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 7 | handheld (amp high, body camera gait) | 18 | Claro Viejo's edge, morning, low | the middle of the empty clearing | walks in; a cooking pot on cold ash; nobody in frame, ever | lin | film-int2-1 | footsteps, insects, a radio's squelch | cut |
| 2 | 5 | handheld | 35 | a rope hanging from a pole | the same | it swings slightly | hold | film-int2-2, film-int2-3 | wind | cut |
| 3 | 9 | board | | `split [cap:camp-overview or rec:camp, int2-empty]` | the same, timestamps several hours apart | camp occupied and camp empty | hold | film-int2-4 | room tone | cut |
| 4 | 9 | board | | the split | the same | | hold | film-int2-5, film-int2-6, film-int2-7, film-int2-8 | | cut |
| 5 | 7 | board | | `zoom` from the camp | the sector, `roads` appearing | the map expands | io | film-int2-9, film-int2-10 | | cut |
| 6 | 6 | board | | `roads` | `roads` with sight lines from the roads to the camp | | io | film-int2-11, film-int2-12 | | cut |
| 7 | 6 | drone | 35 | the recon quad on the ground at Claro Viejo's edge, nobody near | lifting under the canopy | rides its take off | in | film-int2-13 | the quad's motors | handoff |

| id | cue | who | EN |
| --- | --- | --- | --- |
| film-int2-1 | shot 1, lead 3.0, target 0.6 | ROJAS | Gone. |
| film-int2-2 | shot 2, lead 0.8, target 0.8 | VEGA | How long? |
| film-int2-3 | after 2, lead 0.4, target 1.0 | ROJAS | Long enough. |
| film-int2-4 | shot 3, lead 1.2, target 3.4 | IBARRA | They left before the first ground vehicle crossed into the sector. |
| film-int2-5 | shot 4, lead 0.5, target 1.4 | FERRER | Radio interception? |
| film-int2-6 | after 5, lead 0.3, target 0.6 | IBARRA | Maybe. |
| film-int2-7 | after 6, lead 0.3, target 0.8 | ROJAS | Informant? |
| film-int2-8 | after 7, lead 0.3, target 0.6 | IBARRA | Maybe. |
| film-int2-9 | shot 5, lead 1.0, target 2.0 | VEGA | We're asking the wrong question. |
| film-int2-10 | after 9, lead 1.0, target 1.8 | VEGA | Don't ask how they escaped. |
| film-int2-11 | shot 6, lead 1.2, target 1.2 | VEGA | Ask what they saw. |
| film-int2-12 | after 11, lead 1.0, target 2.2 (if `M1_SYMBOL_CAPTURED`) | IBARRA | You caught the symbol before I did. |
| film-int2-12b | the same cue (if not) | IBARRA | We only got the symbol from a partial angle. |
| film-int2-13 | shot 7, lead 1.0, target 2.4 | IBARRA | (new) Low and slow. Everything they left is a sentence. |

### M2 outro (`int2-outro`, M2_10)

**Idea:** two camps side by side; history matches only the old one; then
the alarm that starts Mission 3. **Length:** about 35 s.

| # | s | camera | lens | from | to | subject and motion | ease | VO | sound | out |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 9 | board | | `split [cap:claro-viejo or rec, cap:claro-nuevo or rec]` | the same, personnel stills populating under each | historical photographs match some old faces as silhouettes (no faces rendered: matches are shown as frames joined by lines), no matches under the young | io | film-int2-14, film-int2-15 | room tone | cut |
| 2 | 8 | board | | the split | the same | | hold | film-int2-16, film-int2-17, film-int2-18 | | cut |
| 3 | 4 | board | | the split | `alert REMOTE SECURITY POST / COMMUNICATION LOST` on another screen | the alert | hold | film-int2-19 | an alert tone | smash |
| 4 | 8 | board | | the alert | `zoom` to Puesto Arenal | | io | film-int2-20, film-int2-21, film-int2-22 | | cut |
| 5 | 4 | handheld | 50 | the BOARD from the player's station | the same | | hold | film-int2-23 | | smash |
| 6 | 2 | board | | black | black | CUT TO BLACK | hold | | silence | cut |

| id | cue | who | EN |
| --- | --- | --- | --- |
| film-int2-14 | shot 1, lead 2.0, target 2.0 | IBARRA | The old group knows the terrain. |
| film-int2-15 | after 14, lead 1.0, target 2.0 | IBARRA | The new group knows the old group. |
| film-int2-16 | shot 2, lead 0.6, target 1.8 | IBARRA | But they're not living together. |
| film-int2-17 | after 16, lead 0.5, target 0.6 | ROJAS | So? |
| film-int2-18 | after 17, lead 0.6, target 4.0 | IBARRA | So maybe we've been looking for one organization that stopped being one organization. |
| film-int2-19 | shot 3, lead 0.6, target 1.6 | FERRER | Command, priority traffic. |
| film-int2-20 | shot 4, lead 1.0, target 1.2 | ROJAS | That's my sector. |
| film-int2-21 | after 20, lead 0.4, target 0.8 | VEGA | How many? |
| film-int2-22 | after 21, lead 0.4, target 0.8 | ROJAS | Twelve. |
| film-int2-23 | shot 5, lead 1.2, target 0.8 | VEGA | Launch. |

---

## M3. No Man's Land

### M3 intro (`int3-intro`, M3_00)

**Idea:** rapid cuts of a post closing up, seen from high; then the map
filling with UNKNOWN; Vega's mantra. **Length:** about 42 s.

| # | s | camera | lens | from | to | subject and motion | ease | VO | sound | out |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 3 | telephoto | 400 | Puesto Arenal from a mast camera, high | the gate | the gate closing; small figures, no faces | lin pan | | wind, distant engines | smash |
| 2 | 3 | telephoto | 600 | a road | the same | a car leaving in its dust; another | lin | film-int3-1 | intermittent radio | smash |
| 3 | 3 | drone | 35 | over a road blocked by abandoned vehicles | the same | | lin | | radio breaking into static (story effect, the film's only) | smash |
| 4 | 7 | board | | `stills [int3-post]` | the same | | hold | film-int3-2, film-int3-3, film-int3-4 | | cut |
| 5 | 8 | board | | the post | `contacts` UNKNOWN populating around it | | io | film-int3-5, film-int3-6, film-int3-7 | | cut |
| 6 | 12 | board | | the UNKNOWN dots | the same, each word lighting one dot then all | | hold | film-int3-8, film-int3-9, film-int3-10, film-int3-11 | a single low pulse per word | cut |
| 7 | 6 | drone | 24 | behind the Bramor climbing out of Pista Cero, afternoon cloud | toward the north west | | lin | | the prop | handoff |

| id | cue | who | EN |
| --- | --- | --- | --- |
| film-int3-1 | shot 2, lead 0.5, target 2.4 | ROJAS | Post has intermittent communications. |
| film-int3-2 | shot 4, lead 0.4, target 1.2 | VEGA | Hostiles confirmed? |
| film-int3-3 | after 2, lead 0.3, target 0.6 | ROJAS | No. |
| film-int3-4 | after 3, lead 0.4, target 1.8 | IBARRA | Then don't call them hostiles. |
| film-int3-5 | shot 5, lead 0.6, target 3.2 | ROJAS | Fine. Armed individuals reported near the perimeter. |
| film-int3-6 | after 5, lead 0.5, target 2.4 | IBARRA | That description applies to half the region. |
| film-int3-7 | after 6, lead 0.5, target 1.6 | VEGA | Pilot builds the picture. |
| film-int3-8 | shot 6, lead 1.0, target 0.6 | VEGA | Find. |
| film-int3-9 | after 8, lead 1.0, target 0.6 | VEGA | Follow. |
| film-int3-10 | after 9, lead 1.0, target 0.8 | VEGA | Identify. |
| film-int3-11 | after 10, lead 2.0 (the longer pause), target 2.2 | VEGA | Then we decide what happens. |

### M3 outro (`int3-outro`, M3_09)

**Length:** about 33 s.

| # | s | camera | lens | from | to | subject and motion | ease | VO | sound | out |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 10 | board | | `stills [cap:north-vehicle or rec]` | the same | the strange vehicle's still: newer equipment, commercial containers, unfamiliar communications gear | hold | film-int3-12, film-int3-13, film-int3-14 | room tone, night | cut |
| 2 | 9 | board | | the still | `zoom` into the containers | | io | film-int3-15 | | cut |
| 3 | 11 | board | | another still of the same vehicle | the same, held in silence after the line | | hold | film-int3-16, film-int3-17 | | dip |
| 4 | 3 | board | | black | | | hold | | | cut |

| id | cue | who | EN |
| --- | --- | --- | --- |
| film-int3-12 | shot 1, lead 1.5, target 1.8 | ROJAS | Column supply vehicle. |
| film-int3-13 | after 12, lead 0.6, target 1.2 | IBARRA | I don't think so. |
| film-int3-14 | after 13, lead 0.4, target 0.6 | ROJAS | Why? |
| film-int3-15 | shot 2, lead 0.8, target 3.6 | IBARRA | Because these people have spent years surviving with almost nothing. |
| film-int3-16 | shot 3, lead 0.8, target 1.6 | IBARRA | Whoever supplied that... |
| film-int3-17 | after 16, lead 1.2 (the beat), target 1.0 | IBARRA | ...has money. |
| film-int3-18 | after 17 (only if the unknown drone completed its watch) | FERRER | (new) And the drone that watched the post got everything it came for. |

---

## M4. The Other War

### M4 intro (`int4-intro`, M4_00)

**Length:** about 45 s.

| # | s | camera | lens | from | to | subject and motion | ease | VO | sound | out |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 9 | board | | `routes` one vehicle track across the west with timestamps | the same, three camera icons lit | | io | film-int4-1, film-int4-2 | room tone, before dawn | cut |
| 2 | 7 | board | | the track | the same | | hold | film-int4-3, film-int4-4, film-int4-5 | | cut |
| 3 | 7 | board | | `stills [cap:claro-nuevo-*]` younger Column contacts | the same | | io | film-int4-6 | | cut |
| 4 | 10 | handheld | 50 | the BOARD from the player's station | the same | | hold | film-int4-7, film-int4-8, film-int4-9, film-int4-10 | | cut |
| 5 | 6 | board | | the track | the same | the callback line | hold | film-int4-11, film-int4-12 | | cut |
| 6 | 6 | drone | 35 | behind the Bramor over Ruta Nueva in the blue hour | headlights on the road below | | lin | | the prop, distant trucks | handoff |

| id | cue | who | EN |
| --- | --- | --- | --- |
| film-int4-1 | shot 1, lead 1.0, target 3.4 | FERRER | Three cameras have seen the same vehicle in forty-eight hours. |
| film-int4-2 | after 1, lead 0.5, target 1.8 | IBARRA | Never near the historical camps. |
| film-int4-3 | shot 2, lead 0.4, target 1.0 | VEGA | Destination? |
| film-int4-4 | after 3, lead 0.3, target 0.8 | FERRER | Changes. |
| film-int4-5 | after 4, lead 0.4, target 1.8 | ROJAS | Then what makes it interesting? |
| film-int4-6 | shot 3, lead 0.5, target 1.6 | IBARRA | Who keeps meeting it. |
| film-int4-7 | shot 4, lead 0.6, target 1.6 | VEGA | Today's rule is simple. |
| film-int4-8 | after 7, lead 0.8, target 2.0 | VEGA | Nobody touches that vehicle. |
| film-int4-9 | after 8, lead 0.4, target 1.8 | ROJAS | Even if we get something clear? |
| film-int4-10 | after 9, lead 0.5, target 1.0 | VEGA | Especially then. |
| film-int4-11 | shot 5, lead 0.5, target 2.6 (if `M3_ZERO_CIVILIAN_ERRORS`) | VEGA | Keep the same discipline you showed at the post. |
| film-int4-11b | the same cue (if not) | VEGA | Today, no assumptions. We already know what assumptions cost. |
| film-int4-12 | after 11, lead 0.5, target 1.8 (if `M3_HOSTILE_DRONE_INTERCEPTED`) | FERRER | You've seen this game before. |
| film-int4-12b | the same cue (if not) | FERRER | Last time we watched one of these. This time we may not get that luxury. |

### M4 outro (`int4-outro`, M4_11)

**Length:** about 36 s.

| # | s | camera | lens | from | to | subject and motion | ease | VO | sound | out |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 9 | board | | `faction [old, new]` layer COLUMN ACTIVITY over a small region | the same | | hold | | room tone | cut |
| 2 | 9 | board | | COLUMN ACTIVITY | the layer lifting away; NETWORK ROUTES underneath, running far past the map's edge | a hand's shadow drags the layer (at most a hand) | io | film-int4-13, film-int4-14 | THE NETWORK, low | cut |
| 3 | 7 | board | | `stills [cap:new-column-*]` | the same | | hold | film-int4-15, film-int4-16 | | cut |
| 4 | 9 | board | | the map | `contacts` several known identities converging on Monte Cerrado | | io | film-int4-17, film-int4-18, film-int4-19, film-int4-20 | an alert tone | dip |
| 5 | 2 | board | | black | | CUT TO BLACK | hold | | silence | cut |

| id | cue | who | EN |
| --- | --- | --- | --- |
| film-int4-13 | shot 2, lead 2.5, target 2.4 | IBARRA | We thought we were mapping an insurgency. |
| film-int4-14 | after 13, lead 0.6, target 1.8 | VEGA | We were mapping a corridor. |
| film-int4-15 | shot 3, lead 0.8, target 0.8 | ROJAS | And them? |
| film-int4-16 | after 15, lead 0.6, target 2.2 | IBARRA | Useful people in useful territory. |
| film-int4-17 | shot 4, lead 0.8, target 0.8 | FERRER | Movement. |
| film-int4-18 | after 17, lead 2.0, target 1.0 | IBARRA | They're meeting. |
| film-int4-19 | after 18, lead 0.4, target 0.5 | VEGA | Who? |
| film-int4-20 | after 19, lead 0.8, target 0.8 | IBARRA | Everyone. |

---

## M5. The Last Column

### M5 intro (`int5-intro`, M5_00)

**Length:** about 37 s.

| # | s | camera | lens | from | to | subject and motion | ease | VO | sound | out |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 6 | board | | the map, crowded, pre dawn | the same | nobody speaks | hold | | room tone, a clock | cut |
| 2 | 12 | board | | `contacts` west | `contacts` south east, then north | each group lights as it is named | io | film-int5-1, film-int5-2, film-int5-3, film-int5-4 | | cut |
| 3 | 9 | handheld | 50 | the BOARD from behind the player's station | the same | | hold | film-int5-5, film-int5-6, film-int5-7 | | cut |
| 4 | 4 | handheld | 50 | the same | the same | | hold | film-int5-8 | | smash |
| 5 | 6 | drone | 24 | behind the Bramor in the dark over Monte Cerrado, the camera ball in thermal | the forest's heat | | lin | | the prop | handoff |

| id | cue | who | EN |
| --- | --- | --- | --- |
| film-int5-1 | shot 2, lead 0.8, target 3.0 | IBARRA | Confirmed historical members approaching from the west. |
| film-int5-2 | after 1, lead 0.5, target 3.0 | FERRER | Two vehicles associated with the younger cell from the southeast. |
| film-int5-3 | after 2, lead 0.5, target 1.6 | ROJAS | Ground teams are staged. |
| film-int5-4 | after 3, lead 0.5, target 1.8 | FERRER | Possible Network vehicle north. (if `M4_CACHE_DOCUMENTED`: "Network vehicle north.", `film-int5-4b`) |
| film-int5-5 | shot 3, lead 0.6, target 1.0 | VEGA | Nobody moves. |
| film-int5-6 | after 5, lead 0.4, target 0.6 | ROJAS | Major? |
| film-int5-7 | after 6, lead 0.6, target 2.0 | VEGA | Not until we understand the picture. |
| film-int5-8 | shot 4, lead 1.2, target 0.8 | VEGA | Build it. |

### Ending A, EXECUTE (`int5-end-a`)

**Length:** about 34 s. Starts from the strike's white out in play.

| # | s | camera | lens | from | to | subject and motion | ease | VO | sound | out |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 5 | drone | 85 | white | the feed returning: Rancho Sin Nombre, the boxes gone in smoke, no person shown | the camera ball's picture, the HUD | out | | silence | dip |
| 2 | 10 | handheld | 35 | a small radio speaker on the table | the BOARD beyond it | the news heard faintly | hold | film-int5-a1 | the news under room tone | cut |
| 3 | 8 | board | | `faction [network]` markers remaining | one new UNKNOWN appearing | | hold | film-int5-a2, film-int5-a3 | | cut |
| 4 | 11 | drone | 35 | an empty clearing at Rincón Quemado, morning | the same, slow | | io | film-int5-a4, film-int5-a5 | wind | dip (to the final cinematic) |

| id | cue | who | EN |
| --- | --- | --- | --- |
| film-int5-a1 | shot 2, lead 1.5, target 3.4 | NEWS | Major elements of the armed organization have been dismantled... |
| film-int5-a2 | shot 3, lead 0.8, target 1.6 | ROJAS | That's what they wanted. |
| film-int5-a3 | after a2, lead 0.6, target 0.6 | IBARRA | Maybe. |
| film-int5-a4 | shot 4, lead 2.0, target 1.8 | IBARRA | We destroyed the history. |
| film-int5-a5 | after a4, lead 1.2, target 3.0 | IBARRA | That doesn't mean we destroyed what came after it. |

### Ending B, PRESERVE (`int5-end-b`)

**Length:** about 33 s. Starts as ARCHIVE TRANSFER COMPLETE shows.

| # | s | camera | lens | from | to | subject and motion | ease | VO | sound | out |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 8 | drone | 85 | the archive in frame, the transfer bar full | the same | ARCHIVE TRANSFER COMPLETE | hold | | silence; Ibarra says nothing | dip |
| 2 | 14 | board | | the network graph: the Column's few nodes | hundreds of connections; the Column shrinking inside, the Network growing | | io | film-int5-b1, film-int5-b2 | THE NETWORK, then quiet | cut |
| 3 | 11 | handheld | 50 | the BOARD from the player's station | the same, held in silence after the line | the line is said to the station | hold | film-int5-b3 | | dip (to the final cinematic) |

| id | cue | who | EN |
| --- | --- | --- | --- |
| film-int5-b1 | shot 2, lead 3.0, target 1.8 | ROJAS | So this whole thing... |
| film-int5-b2 | after b1, lead 0.8, target 1.8 | IBARRA | Was becoming something else. |
| film-int5-b3 | shot 3, lead 1.5, target 1.4 | VEGA | And now we know. |

### Ending C, FOLLOW (`int5-end-c`)

The follow itself is play (MISSIONS M5 stage 6). The film starts when
the two old men meet at Vado del Manso. **Length:** about 33 s.

| # | s | camera | lens | from | to | subject and motion | ease | VO | sound | out |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 13 | drone | 200 | the ford from high, two small figures, a car | the boxes passing from one to the other | through the camera ball, the HUD; no weapons raised | hold | film-int5-c1 | water, birds | cut |
| 2 | 10 | board | | `faction [network]` tracks on another screen | the same | | hold | film-int5-c2, film-int5-c3 | | cut |
| 3 | 10 | board | | `alert OLD COLUMN ATTEMPTING SEPARATION FROM NETWORK` | the same | the card | hold | | silence | dip (to the final cinematic) |

| id | cue | who | EN |
| --- | --- | --- | --- |
| film-int5-c1 | shot 1, lead 4.0, target 1.6 | IBARRA | They're separating it. |
| film-int5-c2 | shot 2, lead 0.8, target 0.8 | ROJAS | From what? |
| film-int5-c3 | after c2, lead 1.5, target 0.8 | IBARRA | From them. |

### The final cinematic (`int5-final`, M5_12)

Whatever the ending. **Idea:** the same farmland, river, road and forest
as Mission 1, in morning light, no music at first; flashes of the
campaign from the squad's own captures; Ibarra's question turned round.
**Length:** about 68 s, leaving room under the 75 s bound for the
measured Spanish lines; if they still push past it, the memory flashes in
shot 2 shorten, never the lines.

| # | s | camera | lens | from | to | subject and motion | ease | VO | sound | out |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 8 | drone | 24 | over Sector Alpha at morning, Puente Doble and Río Sereno | Ruta Vieja | rides a Bramor's route over M1's ground | lin | | wind only | match |
| 2 | 9 | board | | `stills` in quick succession: the first thermal contacts, the hidden camp, the road watcher, the younger faction, the hostile drone, the Network meeting, the archive | the archive still | each from the squad's captures (`cap:*`), else the authored frame; the inserts read the flags (`M5_ARCHIVE_COMPLETE` adds archive frames) | lin, 1.3 s each | | a single note per still | match |
| 3 | 8 | drone | 35 | over Rincón Quemado, abandoned | the forest | it looks almost insignificant | io | film-int5-f1 | wind | cut |
| 4 | 5 | drone | 35 | Monte Cerrado filling the frame | the same | | lin | film-int5-f2 | | cut |
| 5 | 5 | drone | 35 | Ruta Vieja | the same | | lin | film-int5-f3 | | cut |
| 6 | 5 | drone | 50 | Claro Viejo, empty | the same | | lin | film-int5-f4 | | cut |
| 7 | 7 | crane | 24 | low over the forest | rising: the whole region | the drone climbs | io | film-int5-f5, film-int5-f6 | THE INTERIOR enters | cut |
| 8 | 7 | drone | 18 | the whole Interior from high | the same | | hold | film-int5-f7 | | cut |
| 9 | 6 | board | | the map, Old Column markers | the markers fading; new UNKNOWN markers appearing elsewhere | not enemies, just unknowns | io | | | smash |
| 10 | 3 | board | | black | black | three seconds of silence | hold | | silence | cut |
| 11 | 5 | board | | black | the title: PARAGUAYAN / COMBAT DRONE / SIMULATOR, THE INTERIOR, CAMPAIGN COMPLETE | | hold | | | cut (to the credits) |

| id | cue | who | EN |
| --- | --- | --- | --- |
| film-int5-f1 | shot 3, lead 3.0, target 2.4 | IBARRA | We spent years asking where they were. |
| film-int5-f2 | shot 4, lead 1.5, target 1.0 | IBARRA | Every search. |
| film-int5-f3 | shot 5, lead 1.0, target 1.0 | IBARRA | Every patrol. |
| film-int5-f4 | shot 6, lead 1.2, target 1.2 | IBARRA | Every operation. |
| film-int5-f5 | shot 7, lead 1.5, target 1.4 | IBARRA | The same question. |
| film-int5-f6 | after f5, lead 2.5 (the pause), target 1.2 | IBARRA | Where are they? |
| film-int5-f7 | shot 8, lead 1.5, target 3.0 | IBARRA | We should have been asking what they were becoming. |

### The stinger (`int5-stinger`)

After the credits. **Extremely short; no dialogue.** The bound of 30 s
holds it at its floor: a 6 s black lead in is part of it, as the credits'
last frame fades. **Length:** 30 s.

| # | s | camera | lens | from | to | subject and motion | ease | VO | sound | out |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 6 | board | | black | black | | hold | | silence | cut |
| 2 | 7 | handheld | 50 | a plain table at night, a cheap consumer quad on it, no identifiable place | the same | unmarked walls out of focus | hold | | a fridge's hum | cut |
| 3 | 5 | handheld | 85 | the quad's battery bay | the same | a hand inserts a battery (the only person: a hand) | hold | | the click, the quad's startup beeps | cut |
| 4 | 7 | handheld | 50 | a laptop beside it | the screen: a frozen frame of one of the squad's aircraft (the Bramor from below, a grainy still) | | io | | | cut |
| 5 | 3 | handheld | 50 | the laptop | black | a hand closes it | in | | the lid | cut |
| 6 | 2 | board | | black | black | | hold | | silence | end |

The frozen frame is the Bramor or the recon quad, whichever the squad
flew most in M5 (the room knows). The 6 s of black that opens it exists
only to meet the 30 s floor. Appending the stinger to the final
cinematic's film instead was considered and does not fit: about 68 s
and 24 s of picture is over the 75 s bound. So the padding is the plan,
and no threshold changes.

---

## 1. Direction notes for the voice takes

- **Vega** never performs. "Launch." is quiet. "Your aircraft." is a
  handing over, not a challenge.
- **Ibarra's** archive "Oh." is almost a whisper; "Maybe." is a real
  maybe, not a sneer. The final cinematic is reflective, not sad.
- **Rojas** "Twelve." lands like a weight. "That's it?" is disbelief,
  not contempt.
- **Ferrer** is dry; "That's not how physics works." is a fact, not a
  joke.
- **ARCHIVE** reads flat, tired, procedural; their overlap in the
  prologue is built in the mix, not in the takes.
- **COMMANDER** is outside the room in every sense: clipped, neutral.
- Each film line is generated in en and es and measured; the shot holds
  the longer (film.js `timing`).
