# The River Below's outro: storyboard

Written 2026-10-16 (wave 50, lane w50-films). Built as `src/share/war/
films/river-below-outro.js` on First Light's outro machinery (a
mission's `outro`, `main.js` warOutroFrame, `warradio.js` OUTROS). It
follows INTROS.md section 1 and BIBLE.md (the enemy never named, no real
figure spoken, ustedes to the squad), as SPILLWAY-OUTRO.md does.

## 1. When it plays

- **On `won` only.** A loss keeps `debrief-itaipu-5-lose` and the card.
- **Its first line is the win debrief** (`debrief-itaipu-5-win`,
  CARANCHO), so the win is said once; the radio does not also say it
  (warradio.js OUTROS, war:radio holds it).
- On the room's clock from the end, skippable as the intros (INTROS.md 3).
- **No next mission card**, as no Act 1 outro has one. It ends on the
  power lines leaving the dam: The Corridor's premise (MISSIONS.md M6,
  "they want to cut it off").

## 2. Shots (about 34 s; films:lint holds a film to 30 s at least)

| # | s | camera | lens | subject and motion | VO | out |
| --- | --- | --- | --- | --- | --- | --- |
| 1 `river` | 8 | telephoto from over the right bank | 135 | the river's reach below the dam, the gorge quiet, the pan easing out along it: the intro's opening lens with nothing on the water | debrief-itaipu-5-win (CARANCHO) | cut |
| 2 `home` | 5 | handheld, low on the crest road | 28 | the heavy pair home, the ten inch's props running down, the Striker's nose beside it | film-itaipu-5-o2 (TALLER) | cut |
| 3 `scope` | 7 | SCOPE insert | | the river below the dam where the intro's tracks rose: nothing | film-itaipu-5-o3 (MIRADOR) | dip |
| 4 `lines` | 10 | telephoto on the west line's axis, behind its first tower | 200 | the towers stacked, leaving the right bank for the towns, the pan running out along them | film-itaipu-5-o4 (CREST) | hand-off |

Only the war's aircraft (the ten inch and the Striker); no attacker in
any shot; no person. Grade: steel at the water and on the scope, warm on
the road and the lines (the match's day world).

## 3. Lines

| id | cue | who | del | EN | ES |
| --- | --- | --- | --- | --- | --- |
| debrief-itaipu-5-win | shot 1, lead 1.0 s | CARANCHO | calm | Crest, Carancho. River's quiet. Thanks for covering us. | (as voiced) |
| film-itaipu-5-o2 | shot 2, lead 0.8 s | TALLER | calm | The heavy ones came home. I'll have them armed again by dusk. | Los pesados volvieron. Los tengo armados de nuevo antes del atardecer. |
| film-itaipu-5-o3 | shot 3, lead 0.8 s | MIRADOR | calm | Nothing on the river. Nothing coming up the gorge. | Nada en el río. Nada subiendo por el cañón. |
| film-itaipu-5-o4 | shot 4, lead 1.0 s | CREST | firm | They can't reach the dam from the river now. So they'll go after what it feeds. | Ya no llegan a la represa por el río. Así que van a ir por lo que alimenta. |

Line o4 is the bridge to The Corridor (day two, dusk), as the Spillway
outro's o4 is to Lights Out; o2's "by dusk" is the same evening. Voiced
on the Jetson Orin (tools/voice/jetson.sh, orin.py), one voice per
speaker as in the mission's other lines, Whisper-checked in both
languages.

## 4. Checks

- films:lint: lenses, lengths, every line in lines.json.
- `warintro:check -- --film=river-below-outro`: every line decoded and
  subtitled in its shot, never under the ground, no attacker in any shot.
- `war:outropage -- --mission=itaipu-5`: a won River Below on the real
  shell starts this film, every shot reached and pictured, the win said
  once, the HUD back after.
- war:radio: the win line is the film's first.
