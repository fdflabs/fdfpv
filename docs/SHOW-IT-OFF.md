# Show it off (Wave 4 item 28)

Contract for item 28: a pilot shows their aircraft and their hangar. Built
on the walkable hangar (docs/HANGAR-ROOM.md). Plan:
~/Desktop/fdfpv-loop/IMPLEMENTATION-PLAN.md, Wave 4. One PR each, in this
order; friend visits have their own contract (docs/HANGAR-VISITS.md)
because they need the server.

Also in this lane, before the four: the hangar's trophy wall and TV
(lead 2026-10-07: wired here, not waited for).

## 0a. Trophy wall

- What the player sees: the trophy wall in the room holds one trophy per
  first the pilot has earned (src/game/progress.js firstsOf, paid firsts
  in `progress.firsts`): gold for a mission win, silver for a star, a
  plaque for an aircraft milestone (first flight, ten minutes, an hour),
  a small cup for a passed lesson. Empty slots stay empty. Standing at it,
  E opens the hangar's Challenges tab, which lists them.
- Data: read only, from `ui.progress.state.firsts`. Nothing stored.
- Flight Club medals (progress `medals`, src/game/medals.js, since #711)
  are trophies too, ahead of the firsts: gold, silver and bronze each in
  its own bright metal, best first. A visit (docs/HANGAR-VISITS.md)
  carries them in the same list.

## 0b. TV

- At the TV, once the pilot has saved a clip (My clips,
  src/replay/store.js), the prompt reads Replays; E plays the newest clip
  in the replay viewer (crashcam.js playSaved), whose own My clips lists
  the rest, and leaving the replay is the room again. No clips, no prompt.
- The screen shows no thumbnail: a picture there is one more texture, and
  Low's budget holds two, both taken (docs/HANGAR-ROOM.md).
- Data: read only, IndexedDB clips. Nothing new stored.
- Known: the replay viewer's way out still reads "Back to flight".

## 1. Photo mode and photo wall

- In the walkable hangar, P (or Photo in the command bar) is photo mode:
  the pilot steps out of the picture, the camera turns round the aircraft
  on its stand (drag, wheel to zoom), and Space or Take keeps a picture:
  a JPEG of the canvas (the DOM is not in it), downloaded at once, as the
  replay's Photo does, and kept for the photo wall. P or Escape leaves.
- Kept in IndexedDB (`fdfpv.photos.v1`, src/ui/photostore.js), at most 24,
  the oldest going, as { id, created, airframe, blob }.
- The photo wall: the left wall of each room holds the newest six, three
  by two, from one atlas texture (one draw; budget in docs/HANGAR-ROOM.md).
- Not synced to the account: pictures are megabytes and the account blob
  is capped. Question for the owner below.

## 2. Turntable GIF or video

- In photo mode, T or Turntable turns the camera once round the aircraft
  on its stand in 6 s (by the wall clock, so a slow machine records fewer
  frames, never a shorter turn) while a MediaRecorder takes the canvas at
  up to 30 fps, then downloads a WebM (VP9 where the browser has it, VP8
  otherwise) at the canvas's size. GIF is not built: a 6 s GIF at that
  size is tens of MB, and a WebM plays wherever a GIF is shared today.
  Photo mode cannot be left mid recording.

## 3. Lineup before launch

- Built: flying from a hangar door (either room), the camera sweeps the
  aircraft on its stand for 2.6 s with its card (name, size or span,
  weight, time flown on it), then the door's action runs: Fly, the
  launch card where the seat is a race, or the war's card from the field
  hangar. E or Enter goes at once; Escape stays in the room.
- In a room (rooms server), the room screen's Lineup row (in a game's
  lobby too) opens the airfield hangar with every pilot's aircraft side by
  side on the floor in their own paint and parts, this pilot's first,
  from the room profiles (normalised as peers are), the camera square on
  to the row, and a card naming each pilot and aircraft. Escape is the
  room screen again. Checked on two pages (npm run hangar:lineup).
- Data: what the seat already knows. Nothing stored.

## 4. Read-only friend visits

docs/HANGAR-VISITS.md.

## Checks

Each PR: a browser check through run-check-slot.sh with a real pointer and
keys, pictures under ~/.cache/fdfpv-w34-hangar, lint:header, lint:dashes,
lint:copy, and hangar:perf when it adds anything drawn in the room.

## Questions for the owner

1. Photos synced to the account (server storage per pilot) or kept on the
   computer with a download? Recommended: kept here with a download for
   now; sync when an image store exists.
