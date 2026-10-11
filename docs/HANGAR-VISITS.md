# Read-only hangar visits (Wave 4 item 28, part 4)

A pilot walks round another pilot's hangar: their room size, their
aircraft on its stand in its livery and parts, their trophy wall. Nothing
in it can be used or changed.

## Privacy

- Off by default. A setting, "Let other pilots visit my hangar", in the
  account panel. Off: the server answers 404 to anyone asking, the same
  as for a callsign nobody holds, so whether the pilot exists is not
  given away.
- What is shared when on: callsign, tier, the seated aircraft's id, its
  livery (colours, decals, finish, wear) and parts, the list of firsts
  (keys only). Never: XP numbers, wallet, builds other than the seated
  one, clips, photos, email.

## Server (needs a VM deploy)

- tracks-api: `GET /api/hangar/<callsign>` (no session needed, rate
  limited as /api/tracks is) answers `{ callsign, tier, airframe, look,
  parts, firsts }` from the held progress blob when the owner's `visits`
  flag is on, else 404.
- `PUT /api/account/progress` already carries the blob; the flag is a
  new key `visits: true|false` in progress, merged last-writer-wins, with
  a version step (PROGRESS_MIGRATIONS v2 to v3: absent means false) and a
  check that seeds a v2 blob.
- A tracks-api selftest row each: on, off (404), unknown (404), and a
  blob that would leak a field not in the list (the answer is built from
  an allow list, never by deleting from the blob).

## Client

- From the walkable hangar, the command bar's Visit asks for a callsign
  (and lists the pilots in the room the pilot is in, when in one). The
  visit opens the room read only: the visited pilot's tier and layout,
  their aircraft, their trophy wall; no prompts but the door, which
  reads "Home" and brings the visitor back to their own hangar.

## Checks

- tracks-api selftest rows above (Node, CI).
- Browser: two accounts on the local accounts server (tests/lib/account.js),
  A turns visits on, B visits A by callsign with real keys, sees A's
  aircraft id on the stand and A's trophies, no station prompt but Home;
  A turns visits off, B gets "No hangar to visit".

## Not

No live presence (the visited pilot is not there), no chat, no leaving
notes, no photos of others' hangars saved (photo mode is off in a visit).
