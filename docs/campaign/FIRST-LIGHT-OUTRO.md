# First Light's outro: storyboard

Written 2026-10-08 (wave 34, lane firstlight), the outro item of
docs/campaign/FIRST-LIGHT-AUDIT.md. Built as src/share/war/films/
first-light-outro.js after the owner's answers (section 5); the
departures from this board are in section 6. It follows the language of INTROS.md section 1 (lenses,
camera types, eases, transitions, the voice timing the film) and the rules
of BIBLE.md (the enemy never named, no real figure spoken, no person in
the water's way, ustedes to the squad). Open questions for the owner are
in section 5.

## 1. Why, and when it plays

The Interior's Mission 1 ends on a film (`int1-outro`, after Survey One
lands) that closes the day and opens the next. First Light ends on one
line (`debrief-itaipu-1-win`), then the result card. The outro is the
act's first close: the dawn the film opened on is now day, the dam held,
and the reservoir is rising, which is The Spillway's premise
(MISSIONS.md M2: "the reservoir is high and rising ... this afternoon we
open the spillway").

- **Plays on `won` only**, as The Interior's (FILMS.md 2: no outro on
  `lost`). A loss keeps today's line and card: a film over a loss is a
  lecture.
- **After the debrief line**, under the result card's arrival, on the
  room's clock (`roomNow() - v.endAt`, as `int1-outro`), so every pilot
  sees the same frame. Skippable on the same rule as the intros
  (INTROS.md 3): first viewing unskippable only for its first 3 s.
- **Grade:** day (`warm` into `steel`). **Music:** the war's intro track's
  tail or a short sting; no new music (FILMS.md 5). **Length:** about 35 s,
  set by the voice.

## 2. Shots

| # | s | camera | lens | from | to | subject and motion | ease | VO | sound | out |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 (`crest`) | 6 | crane | 24 | over the crest deck, the line of aircraft where the film's shot 6 left it, fewer of them | rising over the upstream face, the reservoir to the horizon | the sun high over the east shore; the dawn haze burnt off | io | film-itaipu-1-o1 | wind, a fan winding down | cut |
| 2 (`smoke`) | 5 | telephoto | 300 | the right bank's switchyard | the same | **if the yard was hit**: its smoke rising thin against the day; otherwise the yard whole, a transformer's heat shimmer | lin | | far sirens off (none if whole) | cut |
| 3 (`rack`) | 5 | handheld | 35 | the crest deck, a quad landing on its pad | the quad settled, props stopping | one survivor home; its warhead still slung (unspent birds come back) | io | film-itaipu-1-o2 | props winding down | cut |
| 4 (`gauge`) | 6 | dolly | 50 | the upstream face's level marks at the waterline | a few metres along | the water a hand higher on the marks than in the film's shot 5; a rain front upstream on the horizon | lin | film-itaipu-1-o3 | water against concrete | dip |
| 5 (`gates`) | 8 | telephoto, then wide | 200 to 35 | the spillway's fourteen gates, shut | the chute below, dry | the title card: the next mission's, "The Spillway", over "Mission 2" (as the intro's mission card) | io | film-itaipu-1-o4 | the music's last chord | black |

Only the war's aircraft (configs/airframes.js `WAR_AIRFRAMES`); no
attacker in frame (the day is over); no person anywhere.

**What the engine already has for it** (src/render/warintro.js,
src/share/war/film.js): crane, telephoto, handheld, dolly cameras; the
crest's line of aircraft (`linePlace`, 2030.js); the mission card
(`mission: true` titles); the yard's smoke (the war's damage smoke).
**What it needs:** shot 2's branch on the match's result (the yard hit
or not: the first film whose picture depends on the match; the room
already knows `destroyed`), shot 4's raised water (the map's reservoir
level, which The Spillway's spill already moves), and the next mission's
card in place of this one's.

## 3. Lines (draft, to be voiced with tools/voice/build.py)

| id | cue | who | del | EN | ES |
| --- | --- | --- | --- | --- | --- |
| film-itaipu-1-o1 | shot 1, lead 1.0 s | CREST | calm | First light, and the dam's still standing. That was the easy one. | Primera luz, y la represa sigue en pie. Esa fue la fácil. |
| film-itaipu-1-o2 | shot 3, lead 0.8 s | TALLER | firm | Whatever comes back, I rearm. Whatever doesn't, I build again. | Lo que vuelve, lo rearmo. Lo que no vuelve, lo armo de nuevo. |
| film-itaipu-1-o3 | shot 4, lead 1.5 s | MIRADOR | calm | Rain upstream all night. The water's still rising. | Llovió río arriba toda la noche. El agua sigue subiendo. |
| film-itaipu-1-o4 | shot 5, lead 1.0 s | CREST | firm | This afternoon we open the gates. They'll know it too. | Esta tarde abrimos las compuertas. Ellos también lo van a saber. |

No digit in any line (script.py); the Spanish addresses no single pilot.
Line o1 sits under the debrief line's tail: the debrief (`Sun's up and
the dam's still ours`) and o1 must not repeat each other, so if the film
ships, the debrief line moves into it as o1 and the separate debrief line
is dropped (section 5).

## 4. Checks it will need

- films:lint (the war films' lint): every shot's lens, cast and lengths;
  no attacker in any shot.
- warintro:check `--film=first-light-outro`: every line decoded and
  subtitled in its shot; shot 2's two branches both drawn; the next
  mission's card; never under the ground.
- war:stages: the outro named only on `won`.

## 5. For the owner

1. **Win only?** Recommended: yes, as The Interior. A loss keeps one line.
2. **The debrief line and the film:** recommended to fold
   `debrief-itaipu-1-win` into the film as its first line, so the win is
   said once.
3. **Show the next mission's card** while The Spillway is still held in
   development? Recommended: show it only when Mission 2 is released;
   until then shot 5 ends on the gates without a card.

**The owner, 2026-10-08:** win only; the win debrief folded into the film
as its first line; no Spillway card while Mission 2 is held.

## 6. As built

- Shot 1's line is `debrief-itaipu-1-win` itself (already voiced), so
  `film-itaipu-1-o1` was not written; the radio no longer says the win
  debrief for a mission with an outro (warradio.js OUTROS).
- Shot 2 needs no branch: the film plays in the match's own world, so a
  yard the squad let through smokes in it as it did in play.
- Shot 4 keeps the reservoir at its level (no raised water in the film
  engine); the rising water is the voice's.
- Shot 5 has no title card. The music is every war film's, the war bed's
  intro track from the first shot (warintro:check holds every film to it).
