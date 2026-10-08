# First Light against The Interior's Mission 1: the audit

Written 2026-10-07 (wave 34, lane firstlight). The owner held First Light
(`itaipu-1`) under development on 2026-10-07 (PR #666): "no narration, less
finished than The Interior's Mission 1". This is what Mission 1 has, what
First Light has, measured against the tree at 33c57145, and what this lane
adds. The release flag (`src/game/campaign.js` ACT1, `release:
'development'`) is the owner's and is not touched here.

## 1. What "finished" means in The Interior's Mission 1

| Piece | Where | What the player gets |
| --- | --- | --- |
| Briefing film, voiced, subtitled | `src/share/interior/films/int1-intro.js`, lines `film-int1-*` | a film timed to its voice, en and es |
| Stage radio | `interior-1.js` stage `cues`, lines `int1-s*` | the story told as it happens |
| Guide lines | each primary objective's `guide` (`int1-g-*`, speaker `ibarra-guide`), `src/share/ops/guide.js` | a voice saying plainly what to do now, each time the objective changes |
| First flight lines | `int-g-first-1`, `-2` | once per pilot: what the job is and how it is done |
| Nudges | `guide.js` `createNudger`, `nudgeOf`; lines `int-g-next`, `int-g-clock-*`, `int-g-dist-*` | after idle time with no progress: what, the clock bearing off the nose, how far |
| Objective cards | stage cues' `card` (`card.primary_updated` and others) | a banner each time the objective changes |
| HUD goal line and arrow | `guide.js` `goalLine`, `targetOf` | the objective with its count, and where it is |
| Debrief | `interior-1.js` `debrief`, the outro film `int1-outro.js` | a reconstruction of what was missed, then a film |

## 2. What First Light has

| Piece | State | Evidence |
| --- | --- | --- |
| Briefing film, voiced, subtitled | present: 7 lines `film-itaipu-1-1..7`, en and es voice files exist (`assets/audio/war/voice/{en,es}/*.webm`), subtitles from lines.json (`src/render/warintro.js` 449) | `films/first-light.js` |
| Stage radio | present: 2 countdown lines, 18 stage cues over 5 stages and 3 twists, all voiced en and es | `itaipu-1.js` `cues`, `radio` |
| Win and lose debrief lines | present, voiced | `debrief-itaipu-1-win`, `-lose` |
| Objectives in the HUD | present, one per stage, en and es | `war.obj.itaipu_1.*`, `war.obj.protect_*` |
| Stage titles (lower third) | present | `war.stage.itaipu_1.*` |
| Generic calls (bearing, kind, hit, kill) | present, shared by every war mission | lines groups `bearing`, `kill`, `hit`, `wave` |
| **Guide lines** | **missing**: no voice says, in plain words, what the player should do now; the stage cues tell the story (who is coming) but not the task (where to fly, what to hit) | no `guide` in `itaipu-1.js`, no `itaipu-1-g-*` line |
| **First flight lines** | **missing**: the countdown's two lines (Crest's premise, Taller's rack rule) do not say how a kill is made | `itaipu-1-s0-*` |
| **Nudges** | **missing**: the war has no idle nudge; `src/share/ops/guide.js` reads an ops view, not a war view | no war caller of `createNudger` |
| **Objective cards** | **missing**: the stage title shows once at the stage's open; nothing marks a twist's objective appearing | war cues carry `text`, not `card` |
| **Open face line** | **missing**: MISSIONS.md M1 "If the face opens" names `itaipu-1-op`; it is not in lines.json and no cue says it | `grep itaipu-1-op` finds only the doc |
| **Outro film** | **missing**: the debrief is one line; Mission 1 ends on a film | no `films/` outro for itaipu-1 |
| Film check | `warintro:check` fails 3 rows on main (KNOWN-BROKEN, 2026-10-05: stale cast list, wave defenders, title card) after the First Light reframes | fdfpv-loop/KNOWN-BROKEN.md |

So the film and the story radio are there. What "no narration" reads as
in play is the guide: Mission 1 has a voice that tells the pilot what to
do at every change of objective (the owner's own words on 2026-10-06 that
made `guide.js`: "no voice telling me what to do, no arrows pointing, no
indications, nothing"), and First Light has none.

## 3. What this lane adds (in order)

1. **Guide lines as data**: one `itaipu-1-g-*` line per objective,
   CREST speaking (an act voice, so no new voice is introduced; reversible),
   en and es, in lines.json group `itaipu-guide`; said as stage cues at the
   objective's start, after the story cue it follows, so the story radio's
   one line at a time queue (warradio.js) orders them with no new code.
2. **First flight lines**: two `itaipu-1-g-first-*` lines in the countdown,
   after the rules: how a kill is made and what the radar shows.
3. **Voiced** with tools/voice/build.py `--only` the new ids, en and es,
   every take passing its Whisper judge.
4. **Checks**: war:stages (every cue's line exists), war:radio, the voice
   check, lint:dashes, lint:header, lint:copy; war:legacy unchanged (flight
   untouched).

## 4. Not in this lane, the next PRs

- Nudges for the war: a war reading of `guide.js` (the nearest attacker
  heading for the stage's targets as the target; the war view carries
  contacts openly, so the quiet rule does not bind), the clock and distance
  lines in the act's voices. Needs its own contract.
- Objective cards on the war HUD (twist objectives shown on `show`).
- `itaipu-1-op` once the war's Contain (MISSIONS.md 1.9) exists in stages.
- An outro film for First Light (INTROS.md has no storyboard for one yet:
  a writing job first).
- warintro:check's 3 stale rows.
