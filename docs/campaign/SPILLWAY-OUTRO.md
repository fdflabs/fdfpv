# The Spillway's outro: storyboard

Written 2026-10-08 (wave 34, lane spillway), item 3 of
docs/campaign/SPILLWAY-AUDIT.md. Built as `src/share/war/films/
spillway-outro.js` on First Light's outro machinery (#847: a mission's
`outro`, `main.js` warOutroFrame, `warradio.js` OUTROS). It follows
INTROS.md section 1 and BIBLE.md (the enemy never named, no real figure
spoken, ustedes to the squad), and FIRST-LIGHT-OUTRO.md's answers.

## 1. When it plays

- **On `won` only.** A loss keeps `debrief-itaipu-2-lose` and the card.
- **Its first line is the win debrief** (`debrief-itaipu-2-win`), so the
  win is said once; the radio does not also say it (warradio.js OUTROS,
  war:radio holds it).
- On the room's clock from the end, skippable as the intros (INTROS.md 3).
- **No next mission card** while Lights Out (`itaipu-3`) is held; it ends
  on the switchyard. Adding the card is one `titles` entry when the owner
  releases mission 3.

## 2. Shots (about 31 s; films:lint holds a film to 30 s at least)

| # | s | camera | lens | subject and motion | VO | out |
| --- | --- | --- | --- | --- | --- | --- |
| 1 `spill` | 8 | orbit, r 230 m, 100 m up | 35 | on round from where the intro's orbit left the gates, onto the spray over the chute; the working gates open (the room's `gates`) | debrief-itaipu-2-win (CREST) | cut |
| 2 `pier` | 5 | handheld, the intro's pier shot | 50 | the ten inch home on the pier, its props running down | film-itaipu-2-o2 (TALLER) | cut |
| 3 `river` | 7 | telephoto, over the gates' downstream side | 50 | down the chute to the plume and the river below it | film-itaipu-2-o3 (MIRADOR) | dip |
| 4 `yard` | 10 | telephoto from the crest, as First Light's outro | 300 | the right bank's switchyard in the late light: tonight's target | film-itaipu-2-o4 (CREST) | hand-off |

Only the war's aircraft (the ten inch); no attacker in any shot; no
person. Grade: steel at the water, warm on the pier and the yard.

## 3. Lines

| id | cue | who | del | EN | ES |
| --- | --- | --- | --- | --- | --- |
| debrief-itaipu-2-win | shot 1, lead 1.0 s | CREST | calm | The spill held and the river did what we told it. Nice work on the water. | (as voiced) |
| film-itaipu-2-o2 | shot 2, lead 0.8 s | TALLER | firm | Every bird that came home, I'll have ready by dark. | Cada aparato que volvió, lo tengo listo antes de que oscurezca. |
| film-itaipu-2-o3 | shot 3, lead 1.2 s | MIRADOR | calm | West arm's empty. They've gone to look at something else. | El brazo oeste está vacío. Se fueron a mirar otra cosa. |
| film-itaipu-2-o4 | shot 4, lead 1.0 s | CREST | firm | Everything we make leaves through that yard. Tonight, they'll want it dark. | Todo lo que generamos sale por esa subestación. Esta noche la van a querer a oscuras. |

Line o4 is the bridge to Lights Out (MISSIONS.md M3: the yard, dusk into
dark), as First Light's o4 is to The Spillway.

## 4. Checks

- films:lint: lenses, lengths, every line in lines.json.
- `warintro:check -- --film=spillway-outro`: every line decoded and
  subtitled in its shot, never under the ground, no attacker in any shot,
  the ten inch on the pier, no title card on the yard.
- `war:outropage -- --mission=itaipu-2`: a won Spillway on the real shell
  starts this film, every shot reached and pictured, the win said once,
  the HUD back after.
- war:radio: the win line is the film's first.
