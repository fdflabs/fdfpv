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
- Not: Flight Club medals. Brief said they are on main; on origin/main at
  cd3a666d there is no `medals` key in progress.js or anywhere in src, so
  they join the wall when the Flight Club lane lands them.

## 0b. TV

- The TV shows the pilot's newest saved clip's thumbnail (My clips,
  src/replay/store.js) on its screen. At it, E opens My clips; Play there
  plays the clip in the replay viewer (crashcam.js playSaved), and leaving
  the replay comes back to the room.
- Data: read only, IndexedDB clips. Nothing new stored.

## 1. Photo mode and photo wall

- In the walkable hangar, P (or the Photo button in the command bar) hides
  the HUD and the pilot, frees the camera to orbit the aircraft on its
  stand (drag, wheel to zoom), and a Take button saves a picture.
- A picture is a JPEG at the canvas's size, at most 1920 wide, kept in
  IndexedDB (`fdfpv.photos.v1`, at most 24, the oldest go and the save
  says so) with { id, created, airframe, blob }. Download from the wall.
- The photo wall: the room's back wall carries up to 6 frames with the
  newest pictures as textures (each at most 512 wide; 6 textures, inside
  the room budget's texture headroom, measured in hangar:perf).
- Not synced to the account: pictures are megabytes and the account blob
  is capped; a picture leaves this computer only when downloaded. Question
  for the owner below.

## 2. Turntable GIF or video

- In photo mode, Turntable records the aircraft turning once on its stand
  (6 s) and saves a WebM (MediaRecorder off the canvas, the export path
  src/replay/export.js already uses when WebCodecs is missing), 1280 by
  720, downloaded. GIF is not built: a 6 s GIF at 720p is tens of MB; a
  WebM plays everywhere a GIF is shared today.

## 3. Lineup before launch

- Flying from the hangar door (or any launch card), the launch card shows
  the aircraft as it will fly: its livery and parts on a small turntable
  in the card, its name, weight, flight time, the map. In a room (rooms
  server), the lineup is every pilot's aircraft side by side before the
  start, each in their own livery (the peers already carry their look).
- Data: what the launch card and the peers already know. Nothing stored.

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
