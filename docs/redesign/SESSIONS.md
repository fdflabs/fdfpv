# Sessions: choose what, then who, then Ready

**Status: the core EXISTS** (#359 server, #372 client, merged 2026-10-02);
the visibility values and the hubs are **planned**. This is the flow as
built, the rules it keeps (docs/FLOW-AUDIT.md rules 1 to 17) and what the
redesign adds, so nobody builds a second lobby.

## 1. The flow

```
 HUB (Operations or Flight Club)           never in a room (FLOW rule 3)
   |
   | pick an activity (one click; hub card links keep it one click)
   v
 FIND OR MAKE THE ROOM
   | Public (default, or the pilot's last choice for this activity):
   |   join the busiest public room made for it on its world with a seat;
   |   none: make one, public, named for the pilot      [exists, #372]
   | Friends: make a private room, its invite code shown [planned, phase 6]
   | Solo: make a private room, its code not shown       [planned, phase 6]
   | The war: its consent first, once per pilot           [exists]
   v
 LOBBY (the session)                       home inside a room (FLOW rule 4)
   | pilots and their Ready flags, the host's one setting (mission,
   | minutes, goal, track), the aircraft row, Leave, invite code if private
   |
   | Ready alone          -> 5 s, then the round            [exists]
   | everyone Ready       -> 5 s, then the round            [exists]
   | 45 s after first Ready -> the round with whoever is   [exists]
   | host Start now       -> the round at once             [exists]
   v
 ROUND (the flight)
   | others join mid round and fly in, except a race on    [exists]
   | out of airframes in the war: spectate a teammate      [exists]
   v
 END: results or the war's round card, then back to the LOBBY,
      nobody ready (FLOW rule 12)                           [exists]
   |
   | Leave (lobby, pause, results): the hub, out of the room (FLOW rule 5)
   v
 HUB
```

Joining someone else's session, three doors, all existing: the invite code,
a link (`?room=`, used once, FLOW rule 10), a room on the rooms panel
(which moves from the title to Flight Club's "Join a session" strip with
the hubs). A round on is joined in one click and the pilot flies straight
in (FLOW rule 14).

## 2. Visibility

| Choice | What it is | On the server |
| --- | --- | --- |
| Public | listed, quick joinable | `public: true` (exists) |
| Friends | not listed; the invite code on the lobby | `public: false`, code shown |
| Solo | not listed; no code shown, so nobody can join | `public: false`, code hidden |

Public is the default (owner, 2026-10-02); each pilot's last choice per
activity is remembered in settings (synced). A pilot alone in a lobby who
changes visibility moves to a fresh room of the new kind (nobody to take
along). A host with others present changes it in place: a new host
message, server first, shown only when the welcome says the room takes it
(the FLOW-AUDIT contract path). The war's public rooms keep their consent
for every pilot.

**Changed from the thread:** Friends means "people with the code", because
there is no friends list; a friends list would need accounts the game does
not require.

## 3. What each activity's session has

From src/share/modes.js (#374), never from a branch on the activity:

| Activity | Host's setting | Solo | Drop in | Round ends |
| --- | --- | --- | --- | --- |
| Free Flight | none (the world row) | yes | yes | never: flying until the room empties |
| Track Day | the track (My tracks) | yes | no: waits for the next race | race results |
| Streamer Combat | 3 or 5 minutes | yes, practice | yes | round over, straight to the lobby |
| Catch the Ace | the goal | yes, practice | yes | match results |
| Defend the Paraná | the mission | yes | yes (late join) | the round card |

"Practice" because there are no AI pilots: alone, combat and the Ace are a
lap of the arena. The lobby says so rather than offering an AI row
(PILLARS 12).

## 4. Offline and errors

No rooms server: Track Day and Free Flight run as a local session whose
only visibility is Solo; the room games show disabled with the reason. A
room the server will not make says so with one retry (exists, #372). A
reload returns to the same session (FLOW rule 6).

## 5. Spectating (planned)

A watch seat in any room: the pilot joins without an aircraft and follows
a pilot with the replay's follow camera on the live peers. Counted apart
from the cap's flying seats. For the family case: a parent watching a
child race without taking a slot.

## 6. Checks that hold this flow

`game:lobby` (all five activities, click by click), `flow:check` (no hub in
a room, Leave the only way out), `war:card`, `campaign:check`,
`rooms:selftest` (the lobby's times and flags), `modes:selftest` (the
registry). The visibility phase adds rows to `game:lobby` and an op to
`rooms:server`.
