# Sessions: choose what, then who, then Ready

**Status: the core EXISTS** (#359 server, #372 client, merged 2026-10-02),
the hubs since #382, and the three visibility values, the empty seats
and the host's in place change since the 2026-10-13 batch (src/main.js
openSession, the one way into a room; edge/rooms/core.js setPublic).
This is the flow as built, the
rules it keeps (docs/FLOW-AUDIT.md rules 1 to 17) and what the redesign
adds, so nobody builds a second lobby.

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
   | Friends: make a private room, its invite code shown [exists]
   | Solo: make a private room, its code not shown       [exists]
   | The war: its consent first, once per pilot           [exists]
   v
 LOBBY (the session)                       home inside a room (FLOW rule 4)
   | pilots and their Ready flags, the open seats (the cap less the
   | people; none shown for Solo), Who joins (Public, Friends, Solo), the
   | host's one setting (mission, minutes, goal, track), the aircraft row,
   | Leave, invite code if private and not solo
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
activity is remembered in settings (`sessionVisibility`, synced). A pilot
alone in a lobby who changes visibility moves to a fresh room of the new
kind (nobody to take along; the war's keeps its mission). The room cannot
tell Solo from Friends, so the Solo room's code is kept in the page's
session storage and a reload into it keeps the code hidden. A host with
others present changes it in place: `{ type: 'public', on }` (edge/rooms/
core.js setPublic), server first, offered only when the welcome's
`publicInPlace` says the room takes it (the FLOW-AUDIT contract path),
Public or Friends (Solo only while it is the room's: there is nobody left
to keep out). The room keeps its code, pilots and game; its cap becomes
the kind's (16 public, 8 private) and its listing follows at once. Going
public follows POST /v2/create's rules (public rooms open, no game on
that a public room runs only when made for it, no ops mission, a war
room only for a released mission); going private needs no more people
than 8. On a server without it, and for a pilot who is not the host, the
row is a fact. The war's public rooms keep their consent for every pilot,
and a mission in development gets a private room whatever was chosen (the
release gate).

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
| Catch the Ace | the goal | yes, AI pilots in a public room | yes | match results |
| Defend the Paraná | the mission | yes | yes (late join) | the round card |

A public room of Catch the Ace or Track Day fills with AI pilots to four,
people and AI together (edge/rooms/roombots.js FILL_TO, src/share/modes.js
allowAI); each gives its seat to a person who comes, and the host's AI
pilots row sets their level or turns them off. A private room starts with
them off. Track Day's AI pilots race a lap (edge/rooms/airace.js). Streamer
Combat alone is still "practice": it has no AI pilots, so alone it is a
lap of the arena.

### Pause, leaving and abandon

- **Pause is the pilot's own.** Solo, the plant stops. In a room nothing
  else stops: the room's clock and its game run on, the others see the
  pilot as paused (`status: 'paused'`), the room stops repeating the
  pilot's last pose (edge/rooms/core.js holding), and a war counts a
  pilot silent for STALE_MS on its last airframe out of play
  (edge/rooms/war.js stillFlying). Held by `rooms:selftest`.
- **A drop is not a leave.** A socket lost without a leave keeps its seat
  for RESEAT_MS (60 s, core.js); a racer back in time is back on the grid,
  a war player has its airframes.
- **A newcomer to a running round** flies in where its game's
  `allowDropIn` says so (a race waits for the next one; the war enlists).
- **Leaving mid mission** ends nothing for the others: the room keeps the
  mission and its lost stage (war.js checkpointOf); the leaver keeps the
  stars already earned; only the round in progress is lost to them.
- **Abandon.** A round with fewer of its players here than its game's
  minimum ends after ABANDON_MS (10 s, core.js settleGames), never in an
  empty room, whose games stand paused for their pilots to come back.
- **A seat another tab took** (close 4005) is final for the tab that lost
  it: it says so and never retries (src/share/rooms.js FINAL).

## 4. Offline and errors

No rooms server: Track Day and Free Flight run as a local session whose
only visibility is Solo; the room games show disabled with the reason. A
room the server will not make says so with one retry (exists, #372). A
reload returns to the same session (FLOW rule 6).

## 5. Spectating (built, PLAN.md phase 17)

A watch seat in any room: the pilot joins without an aircraft and follows
a pilot with the replay's follow camera on the live peers. Counted apart
from the cap's flying seats. For the family case: a parent watching a
child race without taking a slot.

Built as edge/rooms/core.js watch: up to WATCH_CAP (8) watchers a room,
counted apart in the welcome and the room browser (`watchers`). The page
follows a pilot with the war spectator's watch camera (src/main.js
warWatch), not the replay's follow camera. A watcher is sent the pilots'
poses and the race's, tag's, jam's and combat's state (core.js everyone,
the race's passes too), and is welcomed into a game as it stands: the
flight screen shows the standings, the laps and the clock, and over the
end the final order, never a results screen, a score or a logged round
(src/share/roomrace.js WATCH_SEAT; `watch:twopage`). It is sent the war's,
the ops' and the lobby's state too, the war's and the ops' view with no
result (core.js viewed, watchedView), since a page holding one pays the
campaign's stars and credits and records the debrief: the war HUD says
Watching in place of airframes and kills, no war aircraft, role, debrief,
loadout or Ready is its own, and with nobody flying its banner says the
lobby's ready count and countdown or an ops mission's end.

## 6. Checks that hold this flow

`game:lobby` (all five activities, click by click), `flow:check` (no hub in
a room, Leave the only way out), `war:card`, `campaign:check`,
`rooms:selftest` (the lobby's times and flags), `modes:selftest` (the
registry). The visibility phase added the Who joins rows to `game:lobby`
(alone, each a fresh room; with B there, in place), the op to
`rooms:selftest` (rooms-selftest-visibility.js) and to `rooms:server`.
