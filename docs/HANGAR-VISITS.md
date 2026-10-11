# Read-only hangar visits (Wave 4 item 28, part 4)

A pilot walks round another pilot's hangar: their room size, their
aircraft on its stand in its livery and parts, their trophy wall. Nothing
in it can be used or changed.

## Privacy

- Off by default. The switch is in the walkable hangar's command bar
  ("Closed to visitors" / "Open to visitors"), sent to the account at
  once. Off: the server answers 404 to anyone asking, the same
  as for a callsign nobody holds, so whether the pilot exists is not
  given away.
- What is shared when on: callsign, tier, the seated aircraft's id, its
  livery (colours, decals, finish, wear) and parts, the list of firsts
  (keys only). Never: XP numbers, wallet, builds other than the seated
  one, clips, photos, email.

## Server (needs a VM deploy)

- tracks-api: `GET /api/hangar/<callsign>` (no session needed, 120 per
  address in the accounts' ten minute window) answers `{ callsign, tier, airframe, look,
  parts, firsts }` from the held progress blob when the owner's `visits`
  flag is on, else 404.
- `PUT /api/account/progress` already carries the blob; the switch is a
  new synced section `hangarVisit: { on, airframe }` ('whole', stamped,
  the newer write wins), airframe the one seated when its pilot last
  walked in. A blob without the section, which is every blob before it,
  is closed: the absence already means off, so no migration step; the
  selftest's first row reads such a blob and gets 404.
- A tracks-api selftest row each: on, off (404), unknown (404), and a
  blob that would leak a field not in the list (the answer is built from
  an allow list, never by deleting from the blob).

## Client

- From the walkable hangar, the command bar's Visit asks for a callsign,
  and in a room it also offers the room's pilots by name (up to three,
  "Visit <callsign>"), one press each; in an accounts room a pilot's name
  is their callsign. Known: inside a room the title is the room screen,
  so the hangar is reached before joining, not from the room. The
  visit opens the room read only: the visited pilot's tier and layout,
  their aircraft, their trophy wall; no prompts but the door, which
  reads "Home" and brings the visitor back to their own hangar.

## Checks

- tracks-api selftest rows above (Node, CI).
- Browser (npm run hangar:visit): the page's own accounts server
  (tests/lib/account.js); a second account opens its hangar from Node with
  the requests its page would send; the page visits it by typed callsign
  (real pointer on Visit, typed text, Enter), sees its tier, aircraft and
  trophies, no prompt at its stand (the pilot is put on the stand's spot
  directly for that one row), Home by Escape; then the page's own switch
  opens and closes its hangar and the server answers 200 then 404.

## Not

No live presence (the visited pilot is not there), no chat, no leaving
notes, no photos of others' hangars saved (photo mode is off in a visit).
