# The Spillway against First Light: the audit and contract

Written 2026-10-08 (wave 34, lane spillway). The owner held the Itaipu
campaign for having "no narration, no nothing" until it reaches The
Interior's standard; First Light (`itaipu-1`) was brought to it in PRs
#785, #805, #820 and #847. This is the same audit for its second mission,
The Spillway (`itaipu-2`), measured against the tree at 10fc77de, and the
contract for what this lane adds. The release flag (`src/game/campaign.js`
ACT1, `release: 'development'`) is already held and is not touched: the
mission is flown from /dev and shown held to players.

## 1. What The Spillway already has

The lane's brief described The Spillway as unbuilt. It is not: the
mission, its radio and its intro film are in the tree.

| Piece | State | Evidence |
| --- | --- | --- |
| Mission data on the real map | present: 4 stages, one of 3 twists drawn, a 240 s hold on the seed's working gates (hoists raise them, `worth` doubles a hit), the spray that hides markers, routes on the reservoir, the approach channel, the west arm and the chute | `src/share/war/missions/itaipu-2.js` |
| Win, lose, stars | present: floor 11 200 MW, third star at 11 900, a lost mission restarts from its stage | `floorMw`, `starMw`, war.js |
| Stage radio | present: 2 countdown lines, 19 stage and twist cues, voiced en and es | `itaipu-2-s*`, `-t*` in lines.json |
| Briefing film, voiced, subtitled | present: 6 shots, 4 lines, en and es | `films/spillway.js`, INTROS.md 5.2 |
| Win and lose debrief lines | present, voiced | `debrief-itaipu-2-win`, `-lose` |
| Objectives in the HUD, stage titles | present, en and es | `war.obj.itaipu_2.*`, `war.stage.itaipu_2.*` |
| Objective cards | present: generic in `src/ui/warhud.js` `objectiveCards`; the twist objective appears on `show: { born }`, which war:stages already holds | war:cards, war:stages |
| Working gates marked | present: `src/ui/warmarkers.js` marks the view's working sets | warmarkers.js 182 |
| Scripted mission check in CI | present: war:stages flies ten bot games (1 and 4 good pilots) to a win and three games with nobody shooting to a loss in Open the Gates | scripts/war-stages-selftest.js, checks.yml |
| Release | held `development` | campaign.js ACT1 |

## 2. What is missing (the First Light gaps, here)

| Piece | State |
| --- | --- |
| **Guide lines** | missing: no voice says what to do at each objective; First Light has one per objective (`itaipu-1-g-*`) |
| **Nudges** | missing: `nudge: true` is on itaipu-1 only |
| **Outro film** | missing: the win is one line; First Light ends on a film (#847, open) |
| **Length check** | missing: war:stages checks the win, not that it lands in the mission's `estimatedMinutes` |
| Spotted rule | not applicable: CONTRACT-SPOTTED.md is The Interior's photograph rule for people on the ground; the war mission has no person in it (BIBLE.md: no person in the water's way) |

## 3. What this lane adds, one PR each, in order

1. **Guide lines and the nudge** (this PR). Seven `itaipu-2-g-*` lines,
   CREST, group `itaipu-guide`, en and es, one per objective: the gates
   (stage 1 open), the channel (stage 2 open), the spill (stage 3, after
   s3-open; says the one new rule, a hit on a working gate costs double
   while it spills), one per twist after its `why` line and skipped once
   the twist's group is down, and the working gates (stage 4, after
   s4-order). Cued in itaipu-2.js as First Light's are; voiced with
   tools/voice/build.py `--only`, every take through its Whisper judge.
   `nudge: true`, so CREST's clock and distance nudge (WAR-NUDGE.md)
   runs here too. No new code.
2. **The length check.** war:stages measures every won bot game against
   `estimatedMinutes`. Measured on 10fc77de: the ten games end 12.2 to 14.6
   min after the go; two run past the doc's 14, so the estimate moves to
   what the room plays (section 4), not the check.
3. **The outro film**, stacked on #847 (the `outro` mechanism):
   storyboard first (SPILLWAY-OUTRO.md), then `films/spillway-outro.js`,
   its voiced lines, `outro: 'spillway-outro'`, war:outropage and
   warintro:check rows, films:lint.

Data shapes: none new. Storage and sync: none. Server: itaipu-2.js is
read by edge/rooms, so each PR touching it **needs a VM deploy** to reach
the room.

## 4. Decisions taken (owner's to overturn)

- Guide lines in CREST's voice, as First Light's (no new voice).
- The spill's guide line states the double cost; it is the mission's one
  new rule and nothing else says it plainly.
- The estimate becomes 12 to 15 minutes, from the bot measurement.
- The outro is win only and ends without the next mission's card while
  Lights Out is held (FIRST-LIGHT-OUTRO.md section 5's answers).
- No spotted rule (section 2).

## 5. What it does NOT do

No change to the stages, twists, routes, floor or stars; no Interior
file; no flight model; no release change.

## 6. Checks

war:stages (every cue's line exists; the guide lines said in each game;
the length band), war:nudge, war:radio, war:cards, voice:check,
lint:dashes, lint:header, lint:copy; for the outro, films:lint,
warintro:check and war:outropage through run-check-slot.sh.
