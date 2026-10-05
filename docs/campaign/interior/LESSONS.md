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
7. **For Itaipu:** the war's stage engine took the ops triggers through
   one hook, so Defend the Paraná can adopt cards, roles and guides by
   writing data and adding a hook kind, not by forking stages.js.
