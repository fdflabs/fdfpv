# The Interior: lessons to carry over

The owner, 2026-10-05: The Interior is "our first real model that will
set up the complexity standard"; once roles, guides and any pilot count
have landed and flown here, what was learned is applied to Defend the
Paraná and later work. This file is where each phase writes it down as
it lands, so that port starts from evidence. It does not plan the port.

## What to record, every phase

Add a section per phase or mission (newest last) with:

1. **What landed:** the parts (TECH-NEEDS N rows) and the PRs.
2. **Measured, not guessed:** the numbers the checks and flights gave
   (draw calls and triangles, people and vehicles on screen, room tick
   cost per contact and per pilot, capture scoring against the owner's
   eye, loss thresholds that felt right in flight).
3. **Which module stayed campaign agnostic, and where it did not:** any
   place the role system, capture, the quiet HUD, the objective cards or
   guide routing had to know about the Interior, and why. Each one is a
   cost the Itaipu port will pay.
4. **Roles at scale:** what the 1, 2, 3, 6, 8 (and 16) pilot runs
   showed: idle seats, roles nobody wanted, swaps that confused, locked
   beats that annoyed, what the deal should have done instead.
5. **Guides:** whether per role radio made the job clear; lines that
   collided in the queue; what a pilot missed because it was another
   role's line.
6. **The owner's flight:** what he flagged, in his words, and what
   changed because of it.
7. **For Itaipu:** one line per lesson that would change how Defend the
   Paraná is built, without designing that change here.

## Phase 0

### Track ROOM (2026-10-05)

1. **What landed:** N13 (contacts), N16 (roles, deal, guides), N6 (ops
   triggers, cards, checkpoints, boundary, loss rules), N17 (alert), N20
   (the campaign entry, flags), Mission 1's data; the contract for VIEW
   and WORLD is CONTRACT-P0.md. On a fixture world until WORLD's lands.
2. **Measured:** the solo scripted run of Mission 1 takes 29 minutes of
   room time on the fixture (the script asks 20 to 30); the whole
   interior:stages check (five full or partial missions) runs in about
   5 s of wall clock.
3. **Campaign agnostic:** nothing in `src/share/ops/` or
   `edge/rooms/ops.js` names The Interior; its classes, roles, lines,
   points, sites and stars are data. The one place a campaign is named is
   the registry, `src/share/ops/missions.js`.
4. **Roles at scale:** dealt and checked at 1, 2, 3, 6, 8, 16 and 64
   seats (roles:deal); not yet flown by people.
5. **Guides:** routing proven headless (a tracker's line reaches
   trackers only); the radio queue's collisions are the voice track's.
6. **The owner's flight:** not yet.
   On WORLD's map (2026-10-05): the solo run takes 28 of the 32
   minutes to sunset. Under the real canopy a pilot straight over the
   pair loses it for at most 36 to 38 s between gaps; from 150 m off to
   one side, up to 56 s, so at the default 45 s an orbiting fixed wing
   tripped the hard threshold while doing everything right. Lead
   decision (reversible): Mission 1's hard threshold is 60 s, and
   interior:stages orbits the pair at 150 m over all three routes with
   no hard threshold. Canopy round #467 measured up to 57.6 to 58.1 s
   from the 150 m orbit, two seconds under 60: the threshold is now 75 s
   (lead, reversible), and the orbit rows run at 150 m and 200 m. Still
   to check in the owner's flight. The dispersal routes' last
   glimpse comes up to 22 s before they end (WATCH_MS is 30 s). The
   lookout's deck sits inside its own tree's crown, hidden from every
   side; its capture item is the foot of its ladder.
7. **For Itaipu:** the war's stage engine took the ops triggers through
   one hook, so Defend the Paraná can adopt cards, roles and guides by
   writing data and adding a hook kind, not by forking stages.js.

### Track FILMS (2026-10-05)

1. **What landed:** N10 (Vega, Ibarra, Rojas, Ferrer and three archive
   voices, Mission 1's lines and films in en and es), N18 (the BOARD and
   the operations room set), N9 (the opening, M1's intro and outro), N24
   (prologue on the pilot's screen, intro as the briefing, outro from the
   end), N22 (THE INTERIOR, THE COLUMN and three sound beds, generated).
   How it plays: FILMS.md.
2. **Measured:** the films' lengths are films:lint's (from the measured
   voices); a BOARD frame draws in 6 ms at worst on an RTX 3060 Ti once its
   stills are painted in the preload (painted on first sight, a still
   cost 50 to 100 ms: a visible hitch); a 2048 px land picture paints in
   about 80 ms; the voice build peaked at 12.4 GB of RAM and spends most
   of a take in the CPU word timing.
3. **Campaign agnostic:** the timeline (film.js), the player (warintro.js),
   the BOARD drawer (filmboard.js) and the room set (filmroom.js) know
   nothing of the Interior; its map layers, stills, places and beds are
   data. The war's films lint byte for byte as before. The one campaign
   name in shared code is the bed table in warradio.js, by name.
4. **Roles at scale:** not touched; films are the same for every seat
   except a late joiner, who starts where the room is.
5. **Guides:** every line is one speaker's; the routing is ROOM's.
6. **The owner's flight:** not yet. To listen for: the takes (none chosen
   by ear), the generated beds (never heard by their maker), Ferrer's
   Spanish voice (pf_dora, so she is told from Ibarra).
7. **For Itaipu:** Chatterbox's alignment analyzer crashes on a text of
   five tokens or fewer ("No.", "There."): build.py now spaces the stop off
   such a line, so a one word radio call is safe for any campaign.

### Track VIEW (2026-10-05)

1. **What landed:** N14 (the camera ball), N5's screen half (the capture
   scorer and the stills), N7 (the quiet HUD), N16's screen (the role
   board), N8 (the debrief over the squad's stills), N20's screen (The
   Interior's card, its page and consent); the ops room client
   (`src/share/roomops.js`); Mission 1 started from its card and flown
   on WORLD's map (a private room on it, the start, the room's contacts
   drawn by the map). PRs #432, #434, #438, #439. `interior:fly` proves
   it against a real rooms server, single pilot, on the rail: the match
   live at M1_CP_START, the camp's people drawn from the room's view, a
   capture judged on the page's real pose and camera.
2. **Measured:** a still stamped with the room clock is ahead of every
   pose the room holds when it lands (the room needs a pose on both
   sides of the still's ms), so every capture was refused `pose` on a
   real server; stamped with the last pose sent, floored to whole ms, it
   is judged. A locked ball holds its point to 1e-13 of the frame
   through a weaving orbit, and the room's `sight()` and the screen's
   three.js camera agree to 1.4e-13 over 8000 points (`camera:lock`):
   building the picture on the room's own basis made the two one
   geometry rather than two that agree within a tolerance. At 16x
   optical a 2 m mark at the camp's standoff grades usable, at 8x poor
   (ROOM's figure, the lead's call).
3. **Campaign agnostic:** the ball, the scorer, the HUD, the board, the
   debrief and the campaign page name no campaign; words are string keys
   under the mission's campaign, roles and classes its ids. Two places
   know a little more than they should: the tutorial prompts are cleared
   by a table of screen actions keyed by the prompt's last word (launch,
   climb, eo_thermal, map), and the debrief infers which items are
   required from the primary objectives and the stars, because mission
   data has neither a `debrief` block nor a per item map flag. Both are a
   field of mission data away from being pure.
4. **Roles at scale:** the board was checked against injected views (a
   seat, a squadmate, a swap request), not yet against a live room of
   several pages; nobody has flown it.
5. **Guides:** a role's cards are filtered by the screen from the view
   (`roles` on a card); radio lines have no text yet, so a pilot without
   the voices hears nothing of another role's guide, by design.
6. **The owner's flight:** not yet.
7. **For Itaipu:** the war's HUD can take the quiet HUD's one rule
   (`markOf`, a mark only for what the room has said) as a mode, and the
   room's `sight()` is the right basis for any sensor a room judges.

## Mission 2

### Lane interior2 (2026-10-07 to 2026-10-08)

1. **What landed:** Mission 2's data, routes and places (#786: CONTRACT-M2.md
   lists each gap and its status), its radio and films voiced, its camps
   on the map, the debrief row; holds (N15) in their own PRs (#827, #836
   and after).
2. **Measured, not guessed:** every place in MISSIONS 1.9's first layout
   was under the canopy on the real land (a watcher there is never seen,
   from the side or overhead): each was moved to the nearest ground open
   from seven of eight sides at 250 m. A scripted solo run took 39 to 43
   min with 1.9's zones against the script's 25 to 35; with the zones
   within 2 km of the property, 30 and 34. The collide sweep must judge a
   far camp with the camera over it: the LOD ground there is up to 3 m off
   the true one.
3. **Campaign agnostic, and where not:** nothing in src/share/ops/ names
   Mission 2. The map grew a second camp from the same builder (camp.js
   takes its layout) shown per mission (`camp.world`), and film.js a line
   said instead when a campaign flag is not set (`or`), both general.
4. **Roles at scale:** not flown with a squad yet.
5. **Guides:** eight briefs (int2-g-*), one per primary objective.
6. **The owner's flight:** none yet.
7. **For Itaipu:** lay a mission's places on the land before writing its
   data, and time a scripted pilot at the real aircraft's speed against
   the script's length before anything else.
