# Lights Out's outro: storyboard

Written 2026-10-14 (lane w39-mission-3). Built as `src/share/war/films/
lights-out-outro.js` on First Light's outro machinery (a mission's
`outro`, `main.js` warOutroFrame, `warradio.js` OUTROS). It follows
INTROS.md section 1 and BIBLE.md (the enemy never named, no real figure
spoken, ustedes to the squad), and FIRST-LIGHT-OUTRO.md's answers, as
SPILLWAY-OUTRO.md does.

## 1. When it plays

- **On `won` only.** A loss keeps `debrief-itaipu-3-lose` (DESPACHO) and
  the card.
- **Its first line is the win debrief** (`debrief-itaipu-3-win`), so the
  win is said once; the radio does not also say it (warradio.js OUTROS).
- On the room's clock from the end, skippable as the intros (INTROS.md 3).
- **No next mission card** while The Long Night (`itaipu-4`) is held; it
  ends on the lines out of the yard. Adding the card is one `titles`
  entry when the owner releases mission 4.

## 2. Shots (about 32 s; films:lint holds a film to 30 s at least)

| # | s | camera | lens | subject and motion | VO | out |
| --- | --- | --- | --- | --- | --- | --- |
| 1 `yard` | 8 | orbit, r 360 m, 140 m up | 24 | on round over the yard from where the intro's orbit left it, Hernandarias beyond: whole, or smoking where a Striker got through | debrief-itaipu-3-win (CREST) | cut |
| 2 `rack` | 5 | handheld, First Light's rack shot | 24 | a quad settling on its pad on the crest, props running down | film-itaipu-3-o2 (TALLER) | cut |
| 3 `west-arm` | 7 | telephoto, low over the water | 50 | up the west arm to its far shore, empty | film-itaipu-3-o3 (MIRADOR) | dip |
| 4 `lines` | 10 | telephoto, the intro's first shot | 300 | the 500 kV towers out of the yard, the pan run back toward it, graded to night | film-itaipu-3-o4 (CREST) | hand-off |

Only the war's aircraft (the line on the crest); no attacker in any shot;
no person. Grade: dusk, the last shot night (the world does not change
its light inside a film, TECH-NEEDS T1.11, so the grade carries it).

## 3. Lines

| id | cue | who | del | EN | ES |
| --- | --- | --- | --- | --- | --- |
| debrief-itaipu-3-win | shot 1, lead 1.0 s | CREST | calm | Night's down and the plant's still running. Good flying, both banks. | Cayó la noche y la central sigue andando. Buen vuelo, las dos márgenes. |
| film-itaipu-3-o2 | shot 2, lead 0.8 s | TALLER | firm | Every bird that came back is on the bench. They'll be ready before full dark. | Cada aparato que volvió está en el banco. Van a estar listos antes de que oscurezca del todo. |
| film-itaipu-3-o3 | shot 3, lead 1.2 s | MIRADOR | calm | West arm's quiet. Nothing on the water. That won't last. | El brazo oeste está tranquilo. Nada sobre el agua. Eso no va a durar. |
| film-itaipu-3-o4 | shot 4, lead 1.0 s | CREST | firm | They spent today learning where we are. Tonight they come in the dark. | Hoy aprendieron dónde estamos. Esta noche vienen a oscuras. |

Line o4 is the bridge to The Long Night (MISSIONS.md M4: night), as the
Spillway's o4 is to Lights Out.

## 4. Checks

- films:lint: lenses, lengths, every line in lines.json.
- `warintro:check -- --film=lights-out-outro`: every line decoded and
  subtitled in its shot, never under the ground, no attacker in any shot,
  the quad on the crest, no title card on the lines.
- `war:outropage -- --mission=itaipu-3`: a won Lights Out on the real
  shell starts this film, the win said once, the HUD back after.
