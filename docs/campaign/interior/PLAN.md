# The Interior: plan

For the owner, 2026-10-05. A second campaign beside Defend the Paraná,
from the owner's three texts and five reference images (kept outside the
repository in `~/Desktop/fdfpv-loop/interior/source/`, because the
repository is public and the mocks are art direction, not assets).

Status: PLAN, waiting on the owner's answers in section 9. Nothing is
built until they are in.

## 1. Sources and which one wins

| Source | What it is |
| --- | --- |
| `pcds_the_interior_in_game_mission_script.txt` (v1.0) | Triggers, objectives, flags, checkpoints, fail states, every radio line. **The authority.** |
| `paraguayan_combat_drone_simulator_the_interior_cinematic_campaign.txt` | Characters, films, music, motifs, the three endings. |
| `paraguayan_combat_drone_simulator_campaign.txt` | The design intent per mission. |
| Five PNG mocks | Look and HUD direction only. |

Where the texts disagree, the mission script wins, then the cinematic
treatment, then the campaign document. A conflict with a standing owner
rule is not settled by any of them: it is in section 9.

**Hard constraint on every agent brief:** no real country, place,
person, group, symbol, incident or coordinates, anywhere: strings,
textures, HUD, file names. The region is "The Interior", the group is
"The Column", the third party is "The Network". The mocks' real
latitude and longitude, "AREA: CORDILLERA" and the serpent banner are
not used. The symbol is an original mark designed for the game.

## 2. What the campaign is, in five lines

1. **The Old War.** Survey a rural region, notice two people avoiding a road, follow them under canopy to a small camp, record it, watch it dissolve. No weapon. "I can see."
2. **Eyes in the Forest.** The camp is empty. Find the road watcher, follow the relay, search an abandoned property by quad, find a second, younger camp. "I can follow."
3. **No Man's Land.** An isolated post; a map full of UNKNOWN contacts; civilians, police and a confirmed hostile told apart by behaviour; three look-alike vehicles; a relay; the first enemy drone. "I must identify."
4. **The Other War.** Follow one vehicle through traffic and a decoy swap to a meeting with a third party; watch three factions at once; a counter-surveillance drone; a cache. "I cannot watch everything."
5. **The Last Column.** The gathering is fourteen people. Ground forces move, the picture degrades, drones contest the air, the archive vehicle, the final order: Execute, Preserve or Follow. "Seeing the truth does not tell me what to do with it."

## 3. Where it goes in the queue

Reading of the owner's message (reversible): Interior Phase 0 and Mission
1 start **after First Light is 100%, ahead of The Spillway**. Defend the
Paraná mission 2 waits behind Interior Mission 1. All five Interior
missions appear in the campaign list as **Coming soon** from the day the
campaign card exists; each opens through the same release gate as Act 1
(`src/game/campaign.js`, the room refuses anything not `available`).

## 4. What already exists and gets reused

| Need | What is there | Where |
| --- | --- | --- |
| EO, thermal (white hot, black hot), low light, fusion, zoom, stabilisation, REC, the inset | The sensor manager and its picture | `src/avionics/sensors.js`, `src/render/sensorview.js`, `src/render/thermal.js`, docs/AVIONICS-SENSORS.md |
| Contacts with confidence, primary track, lost and stale states | Avionics tracks | `src/avionics/tracks.js`, `src/avionics/perception.js` |
| The long-endurance fixed wing ISR platform | Bramor C4EYE: catapult launch, parachute recovery | `bramor2300`, `src/render/bramorcraft.js` |
| Switching platforms in flight | The carousel's hot swap | #94 |
| Missions as stages opened by events, seeded variation, checkpoints after a loss | The stage engine | `src/share/war/stages.js` |
| Directed intro films timed to voice lines, hold to skip | The film timeline | `src/share/war/film.js`, `src/render/warintro.js` |
| Generated voices, en and es, subtitles, the ustedes check | The war voice pipeline | `check.py`, `src/share/war/voicelen.js` |
| Mission release, stars, campaign progress synced to the account | Campaign shell and gate | `src/game/campaign.js`, #411, #244 |
| Cattle, workers, a dog: ambient life | Alps fauna (decoration only) | `src/maps/alps/fauna.js` |

Classification states (UNKNOWN, CIVILIAN, FRIENDLY, PERSON OF INTEREST,
COLUMN-LINKED, NETWORK-LINKED, HOSTILE CONFIRMED) are a field on the
existing tracks, not a second contact system.

## 5. What is new, each with the check that proves it

| # | New part | Decision taken in this plan | Check (named before building) |
| --- | --- | --- | --- |
| N1 | **The Interior map**: farms, pasture, tree lines, drainage, a settlement, dense forest, clearings, dirt roads, one river, ~16 x 16 km | Real elevation data from a generic lowland area with **invented** roads, fields, settlements and forest, so the land is believable and nothing on it is a real place. Streamed tiles on the Itaipu and Yellowstone pipeline. Procedural only if no suitable data licence is found. | `interior:views` (budget 300 calls / 2.5 M tris like Itaipu), `interior:collide` sweep, photo loop rounds like swiss2 and Itaipu |
| N2 | **Canopy that hides people** | Forest built so a line of sight from the aircraft to a ground point is either open or blocked by crowns; thermal sees through gaps only. One function answers "visible from here?" | `canopy:los`: authored points under canopy, in gaps and in clearings, seen and not seen as expected from orbits |
| N3 | **People on foot** | Low detail human figures, walking, standing, looking up, carrying a long object, sitting; authored routes (the script's "pre-authored concealment route"), never free roaming AI. Decimated at range, instanced. | `people:route`: each authored route walked on the sim clock, deterministic, same positions in Node and browser |
| N4 | **Vehicles** | Motorcycles, pickups, a few trucks, on road splines and trails; the decoy swap (enter structure, several leave) as authored data | `vehicles:route` plus the decoy scenario run headless |
| N5 | **Capture** | Centre, zoom, hold, capture: a still scored by framing (target size in frame, centring, occlusion, motion blur from the sensor's own numbers). Captured stills are kept for the debrief. | `capture:score`: synthetic frames with known framing give the expected grades |
| N6 | **Objectives, mission rules, checkpoints** | One objective card system in the HUD, fed by the stage engine; the script's checkpoint names become stage ids | Stage selftests like `war:stages` |
| N7 | **Interior HUD mode** | The war wants enemies very obvious (owner, 29 Sep); the Interior wants the opposite: no markers before discovery, search areas, last known position circles, bearing hints. A separate HUD mode, not a tuning of the war's. Look per the mocks: survey box, gimbal angles, EO/IR/MAP/TGT row, IR inset, minimap with scale. | `interior:hud` shots at every device size, no marker drawn for an undiscovered contact |
| N8 | **Debrief over the player's stills** | The debrief shows the player's own captures, with an analyst reconstruction when a required one is missing (the script's M1_10 rule) | `interior:debrief` |
| N9 | **Operations room films** | See section 9, question B. If people are allowed on screen: a small set of stylised, consistent character renders in a modest room, lip sync not attempted, the camera holds on monitors and maps as the treatment already favours. If not: the same films told on the room's monitors, maps and stills only, with the four voices. | `films:lint`, `films:time`, `film:world` |
| N10 | **Four voices** | Vega, Ibarra, Rojas, Ferrer, generated like the war radio, en and es, licence checked against GPLv3 as before | `voice:check`, the ustedes check |
| N11 | **Relay and interference** | Scripted story effects, owner rule of 4 Oct ("story moments only"): the relay is a placed volume the stage checks, the interference is a scripted picture effect. Dormant `signal.js` may be reused for presentation only. No RF model. | stage selftests |
| N12 | **Strike, interceptor, enemy drones (M3 to M5)** | Depends on section 9, question A | per answer |

## 6. Aircraft for this campaign

The war's rule "only combat drones fly in wars" (3 Oct) is a rule for the
war. The Interior has its own set, data driven like the war's:

- **ISR:** Bramor C4EYE (M1 onward).
- **Recon quad:** the closest kept quad after the 5 inch and whoop removal; Phase 0 picks it from `7inch`, `10inch` and `interceptor` by flight feel under canopy (M2 onward).
- **Strike:** Striker or the quad chosen above, per question A (M3 onward).
- **Relay:** a fixed wing loiterer from the set above (M3 onward).
- **Interceptor:** `interceptor` (M4 onward).

## 7. Progression

The script's flags (`M1_SYMBOL_CAPTURED` ... `M5_FINAL_CHOICE`) are kept
in the campaign's synced progress section next to Act 1's. Stars come
from the script's optional objectives (three per mission, chosen in each
mission's own doc), so the campaign screen reads the same as Act 1's.
Credits and the shop do not apply: Interior platforms unlock by mission,
as the script says. The three endings are not graded; each is recorded
and the montage reads the flags.

## 8. Phases, one at a time

Each phase is its own PR or small set of PRs, checked, merged and live
before the next starts.

**Phase 0, foundations for Mission 1 only** (nothing for later missions):
N1 map (first the M1 corridor: base, fields, settlement, forest edge,
camp clearing), N2 canopy, N3 people (walk, stand, look up, carry), N4
one motorcycle and one pickup, N5 capture, N6 objectives, N7 HUD, N8
debrief, the campaign card with five Coming soon missions.

**Mission 1, The Old War, to 100%:** the opening film (archive audio and
stills, the title card), the M1 briefing, stages M1_01 to M1_10 with the
script's lines and recovery rules, the camp and its dispersal, the
symbol, the return at sunset, the debrief and outro. Owner flies it. Only
then does it become `available`.

**Then Missions 2 to 5**, one at a time, each opening only when its story,
films and stages are done: M2 adds the quad, the abandoned property and
the second camp; M3 adds classification pressure, relay, the first enemy
drone and whatever question A allows; M4 adds traffic, the decoy swap,
three factions, counter-surveillance and the cache; M5 adds the
gathering, the scripted interference, the archive and the three endings,
the final film and the stinger.

Multiplayer: solo first, inside the shared session system (Operations
solo stays online, the lead's call of 3 Oct). A co-op split (one pilot on
ISR, one on the quad) is a later extension, not part of any phase above.

## 9. Questions for the owner (asked in chat, answers recorded here)

A. **Strikes on people.** Standing rule: players never attack people and
no person is shown harmed; the campaign has no strike operations. The
Interior's M3 first engagement and M5 Execute strike people.
Recommendation: strikes land on vehicles, equipment and drones only; the
story is unchanged (the hostile's vehicle and radio, the archive vehicle).

B. **People on screen.** Act 1 shows no person ever. The Interior has
named characters in a room and people on the ground seen from the air.
Recommendation: people seen from the air, yes (the campaign is about
watching them); the room films told on its monitors and maps with the
four voices, faces kept off screen.

C. **Country.** The texts say "no named country"; the game is the
Paraguayan Drone Combat Simulator and the mocks carry real coordinates.
Recommendation: the Interior stays unnamed, nothing real on screen, the
mocks are art direction only.

D. **Solo or co-op.** Recommendation: solo first, co-op later.

E. **Queue.** Interior after First Light, before The Spillway (section 3).

## 10. Not in scope

A real electronic warfare or radio model; real procedures for strikes,
tracking or interception (the script itself forbids them); gore; kill
banners; any real place or group.
