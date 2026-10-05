# The Interior: the films, how they play

Written 2026-10-05 by track FILMS (TECH-NEEDS N9, N10, N18, N22, N24,
Mission 1 only). INTROS.md is what the films are; this is what was built,
how the screen plays it, and how it is checked. The screen's side (the
calls below in `src/main.js`) is track VIEW's.

## 1. What exists

| Film | Id | Moment | Length (with the 2.5 s preload) | Where |
| --- | --- | --- | --- | --- |
| "Where are they?" | `interior-prologue` | the campaign's opening, once, before Mission 1's intro | see films:lint | `src/share/interior/films/prologue.js` |
| The Old War, intro | `int1-intro` | Mission 1's briefing (M1_00) | see films:lint | `src/share/interior/films/int1-intro.js` |
| The Old War, outro | `int1-outro` | after Survey One lands (M1_10) | see films:lint | `src/share/interior/films/int1-outro.js` |

Every length comes from the measured voice files (film.js `timing`, the
longer of English and Spanish), so `npm run films:lint` prints the real
ones; the house rule holds each film's shots to 30 to 75 s.

The parts:

- **The timeline** stays `src/share/war/film.js`, grown without changing a
  war film (films:lint prints the war films' lines byte for byte as before):
  a line may `overlap` the one before it (the prologue's three archive
  voices); a `vo.start` anchor may take `u`, a share of its line; a camera
  may be `agl` (heights over the Interior's real ground) or `board`; a
  shot may carry a `board`, a `set`, a camera `ball` and `music` cues; a
  film may name its `map` and set `music: null` to use its own cues.
- **The player** stays `src/render/warintro.js` (every film of the game,
  the war's unchanged): the BOARD insert (`src/render/filmboard.js`), the
  operations room set (`src/render/filmroom.js`), the camera ball's
  picture, the `card` title, the Interior's grades, the music cues, and a
  refusal to play a film over another map's world (`opts.map`, #412).
- **The Interior's data**: `src/share/interior/films/` (the films, the
  BOARD's map from WORLD's places and rivers, the stills drawn for the
  game, the room's place).
- **The voices**: Vega, Ibarra, Rojas, Ferrer and three archive voices in
  `assets/audio/war/lines.json` (group `interior` and the `film-int*`
  lines), built by `tools/voice/build.py` like the war radio.
- **The beds**: THE INTERIOR, THE COLUMN and three sound beds, generated
  by `tools/voice/beds.py` (section 5).

## 2. How the screen plays them (for VIEW)

One call, from `src/render/interiorfilms.js`:

```js
import { playInteriorFilm, filmsFor, INTERIOR_FILM_IDS } from './render/interiorfilms.js';
import { markSeen, seenFilm } from './game/campaign.js';
import { FILMS } from './share/interior/films/index.js';

const h = playInteriorFilm(shell.quad.parent || view.scene, shell.camera, id, {
  map: view.id,                         // required: refused unless 'interior'
  canvas: shell.canvas,
  audio,                                // MotorAudio: voices and beds
  ground: (x, z) => view.height(x, z, Infinity),
  seen: seenFilm(store.load(), id, FILMS[id].version),
  onSeen: () => store.save(markSeen(store.load(), id, FILMS[id].version)),
  // per moment, below: clock, hold, title, capture
});
// every rendered frame: h.frame(performance.now()) after the shell's own
// camera chain and before the draw; h.afterDraw(shell.canvas) after it.
// h.done resolves when it is over; h.dispose() when leaving.
```

It is the war's `play()` (src/render/warintro.js, read its header for
every option) with the Interior's BOARD, stills and land picture filled
in, and an orbit round Pista Cero after a skip in a briefing. Play a film
only once the Interior's world stands (as `warFilmWorldUp` does for the
war): its shots are that map's metres.

`filmsFor('interior-1')` is `{ prologue: 'interior-prologue', intro:
'int1-intro', outro: 'int1-outro' }`.

### The chain (N24)

1. **Prologue, on the pilot's own screen.** The first time this pilot opens
   The Interior (its campaign card, or a room of it joined by a link) and
   `seenFilm(..., 'interior-prologue', version)` is false: stand up the
   Interior's world, play `interior-prologue` with no `clock` (it runs on
   the screen's own) and wait for `h.done`. A first viewing cannot be
   skipped; a seen one skips on a 2 s hold. Not room state: each pilot sees
   it once, whoever else is in the room.
2. **Intro, the room's briefing.** The host starts `interior-1` with
   `intro: true`; the room holds the briefing for the mission's `filmMs`,
   which is now `int1-intro`'s length (`src/share/interior/missions/
   interior-1.js`, from `briefingMs('interior-1')`). While the ops view is
   in `briefing`, every screen plays `int1-intro` with
   `clock: () => roomNow() - v.briefAt`, `hold: true` and
   `title: { key: 'ops.interior.m1.title', n: 1 }`; stop it when the view
   leaves `briefing`. A pilot joining late starts where the room is (that
   viewing is not "seen"). The film ends behind the Bramor on its
   catapult and hands off to the pilot's own camera, where stage 1
   (LAUNCH SURVEY ONE) begins.
3. **Outro, after the landing.** When the ops view turns `won` (the ISR
   landed at Pista Cero after the dispersal), every screen plays
   `int1-outro` with `clock: () => roomNow() - v.endAt` and `capture`,
   then shows the debrief when `h.done` resolves. `capture(item)` returns
   the squad's still of a capture item (`bridge`, `shelters`,
   `motorcycles`, `antenna`, `personnel`, `symbol`) as `{ image, seat }`
   (`image` any canvas image source, `seat` the room seat that took it), or
   null; a null shows the analyst reconstruction marked RECONSTRUCTION
   (N8), so the outro plays whether or not the debrief has pictures yet.
   No outro on `lost`.
4. **Menu, later.** `INTERIOR_FILM_IDS` in story order; list the ones
   `seenFilm` says this pilot has seen, play with no `clock` and
   `seen: true`.

A host's skip that ends the briefing for everybody (the war's
`skipIntro`) does not exist in the ops room yet: a seen pilot who holds to
skip circles Pista Cero until the briefing ends. That is the room's
(`edge/rooms/ops.js`) to add, with a `seen` message like the war's.

### Radio lines and subtitles

Every Mission 1 line id that `interior-1.js` cues (`int1-*`, `int-*`) is
in `assets/audio/war/lines.json`, built in English and Spanish into
`assets/audio/war/voice/<lang>/<id>.webm|.mp3`, so the war's radio plays
them as they are (`warVoiceUrl`, `WarRadio.say`); a line's subtitle is
its `en` or `es` text there. A number in a cue's radio list is a pause in
seconds (CONTRACT-P0.md section 6), not a line.

### Music in play

`audio.setWarBed(name)` with `'interior'`, `'column'` or `''` follows the
stage's `music` (MISSIONS.md M1 Music: THE INTERIOR from the launch,
silence through the anomaly until "Follow.", a faint COLUMN under the
camp cut to silence at the symbol, THE INTERIOR at sunset). The beds loop
(warradio.js `BEDS`). A film sets its own beds and gives the one it found
back when it ends, except in a briefing (`hold`), where it leaves its
last one playing into the countdown.

## 3. Departures from INTROS.md

Each is written in its film's file too.

- The prologue's three overlapping "No confirmation." are three takes,
  one a voice, overlapped by the timeline; they stay in shot 4, which
  smashes to shot 5's silence.
- The intro does not ride the launch: launching Survey One is stage 1's
  objective, so the film ends behind the Bramor on its rail and hands off
  there.
- The effects the player has no channel for (static, wind, the room's
  generator, the canopy's flutter) are sound beds, one at a time with the
  music.
- The BOARD's towers, construction and vehicles ticked in the intro's
  fifth shot are map symbols, not things the world draws.
- The outro's single sustained COLUMN note is THE COLUMN's bed, which
  opens on one held note for 30 s.

## 4. Faceless, and checked so

No figure is built for any film: the room is a set of a table, monitors,
cables, a chair's back and a cup; the only person is a hand's shadow
passing over the outro's match. Stills are drawn for the game (no
photograph, no readable name, no face): `stills.js` gives each still the
height of the tallest person it draws, none over 6 % of the still
(`PEOPLE_MAX`), and films:lint holds every still to it. The browser check
fails on anything in a film's scenery named as a person.

## 5. Voices and beds: sources and licences

- **Voices** (`assets/audio/war/CREDITS.md`): Kokoro 82M (Apache 2.0)
  speaks each speaker's reference text in a stock voice; Chatterbox
  Multilingual (MIT) speaks every line in that voice; Whisper large v3
  turbo (MIT) rejects bad takes. The same pinned revisions the war's licence
  check covered; no model added. English: Vega `am_adam`, Ibarra
  `af_heart`, Rojas `am_eric`, Ferrer `af_sarah`, archive `am_echo`,
  `am_liam`, `bm_daniel` (none of them a war voice). Spanish: Vega
  `em_alex`, Ibarra `ef_dora`, Rojas `em_santa`, Ferrer `pf_dora` (so she
  is told from Ibarra), archive `pm_alex`, `pm_santa`, `em_alex`. Each
  speaker has its own radio colour (`radio.py`: consola, analista, campo,
  banco, archivo). Takes are the first that pass the gate; none is chosen
  by ear yet (build.py `--takes N` writes candidates to pin).
- **Beds**: generated by `tools/voice/beds.py` from oscillators, noise, a
  plucked string model and a noise reverb; no sample, recording or model;
  GPLv3 with the repository. THE INTERIOR (90 s loop), THE COLUMN (75 s,
  a held note alone for 30 s), static, wind, room.

## 6. Checks

| Check | What it holds | Where it runs |
| --- | --- | --- |
| `npm run films:lint` | both campaigns' films: timing by the voice, lines, anchors, aircraft (the Interior's `FILM_AIRFRAMES`); and the Interior's map on every film, every world camera over the Interior's ground and inside the played square, a room shot inside its set, the BOARD's parts, layers and stills (a capture always has its reconstruction), no still's person over `PEOPLE_MAX`, every music cue a bed, ids not shared with the war, interior-1's briefing its intro's length | CI |
| `npm run films:time -- --check` | voicelen.js is the manifest's lengths | CI |
| `npm run voice:check` | every line: no digit, no dash, ustedes, the take's gate, credits, sha256; the beds credited and in the manifest | CI |
| `SIM_GPU=1 npm run film:world:interior` | every film played whole in the shell over the Interior's world: the standing map is `interior` on every frame, every shot drawn, cameras over the ground or inside the set, subtitles, seen, skipping, the refusal of another map | local, one browser |
| `SIM_GPU=1 npm run board:render` | every BOARD shot stepped: every still from a picture (capture, reconstruction or authored), the land's picture painted, a BOARD frame under 12 ms | local, one browser |

Frames from the two browser checks go to `~/Desktop/fdfpv-loop/interior/
films/`, never into the repository.
