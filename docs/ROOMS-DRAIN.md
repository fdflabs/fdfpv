<!--
This file is part of the Paraguayan Drone Combat Simulator.

The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or (at
your option) any later version.

The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
WITHOUT ANY WARRANTY, without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
General Public License for more details.

You should have received a copy of the GNU General Public License
along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
-->

# Rooms drain: deploys that let live rooms finish

Foundations item 8. Today a deploy restarts the rooms server with SIGTERM:
every socket is closed with 1012, pilots reconnect, and whatever the room
had in memory (poses, the second of a race being flown) is gone. The goal
is that a deploy puts the new version live for new joins at once (the
owner's rule: deploys are never held) while rooms already flying finish on
the old process.

## Slice 1 (this one): drain in the server, proven locally

`edge/rooms/node.js`, `drain(capMs)`, sent by **SIGUSR2**:

- Refused, 503 `{ error: 'busy' }` (the word the client already knows): a
  new room (`POST /v2/create`), a quick join (`/v2/public/<map>`), and a
  socket to a code whose room this process does not hold in memory.
- Kept: every room the process holds, its pilots, new pilots joining it, a
  dropped pilot reseating with its token, `/v2/version` and the rest.
- Exits 0 when no socket is open at all ("drained (empty)" in the journal),
  or at the cap, `DRAIN_CAP_MS` (default 20 minutes), through today's
  stop(): 1012 to everyone, then exit ("drained (cap)").
- A pilot who dropped and has not reconnected when the last socket closes
  is not waited for: in slices 2 and 3 their reconnect reaches the new
  process. A drain never holds a deploy for RESEAT_MS.
- SIGTERM keeps its meaning, also during a drain.

deploy/vm/rooms-deploy.sh sends it (slice 3).

Proof: `npm run rooms:drain` (scripts/rooms-drain-check.js, in CI), two
processes from one tree on their own ports, SQLite files and REVISIONs
(`REVISION_FILE`, for the check only): a room on v1 keeps ~30 Hz poses with
no close while v1 drains, new rooms land on v2, v1 exits when the room
empties, a short cap closes with 1012 at the cap, and a drain that closes
at once fails the same probe.

## Slice 2: two processes side by side, one rooms.db (built, local proof)

The survey planned a rooms.db per colour. That loses a room at the cap: the
pilots closed with 1012 reconnect to a process that never saw the old
file and are told `nosuch`. So both processes open the same `ROOMS_DB`,
and a room is held by exactly one of them, the one with its core in
memory. `edge/rooms/node.js`, with **ROOMS_PEER** naming the other
process (`PEER_HEADER` there has the rules):

- At start, while the peer answers, nothing stored is restored: it is the
  peer's. Without a peer (every check, a lone process) a start restores
  everything, as before.
- A socket to a stored room this process does not hold is forwarded to
  the peer, marked `x-fdfpv-peer`. A peer holding it takes it; a draining
  peer that does not answers 503 and the room is restored here (a room
  whose own process restarted); a process sent a marked socket never
  forwards it back. Caddy strips the header from pilots.
- `/v2/rooms` adds the peer's public rooms that have pilots in them.
- The peer is polled every second. Once its port refuses, and a second
  later (a draining process writes its last closes in the 500 ms after
  its listener closes), every stored room it did not hold is taken in,
  alarms and listing, as a restart does.
- SQLite `busy_timeout` 5 s: two writers on one file, and an unawaited
  SQLITE_BUSY would end the process.

Caddy: `stream_close_delay 30m` on the rooms' `reverse_proxy`. Measured on
Caddy 2.11.4 (the VM's): without it a reload closes every proxied
WebSocket at once with 1001, so every Caddyfile change and every board
deploy has been dropping every room.

Proof, local:

- `npm run rooms:drain` (CI): on one file, a join and a token reseat to v2
  fly with v1's pilots, v2 lists v1's flying room and makes new ones, v1
  exits when empty and v2 takes its rooms in; at the cap both pilots
  reseat through v2 and fly. Controls: forwarding off fails two checks; a
  v2 without ROOMS_PEER seats a pilot in a second copy of the room.
- `CADDY=... npm run rooms:deploy-caddy` (needs caddy, not CI): the VM's
  Caddyfile in front, the whole flip: the room flies on through the
  reload and the drain, `/v2/version` through Caddy is v2's, a join to the
  old room flies with its pilots, also with a forged peer header, v1
  exits and v2 takes in. Control: without `stream_close_delay` the reload
  closes both pilots (1001).

## Slice 3: the VM (written, dry run only)

- `fdfpv-rooms@.service`, one instance per port, 8797 and 8798, each on
  its own copy of the code (`/opt/fdfpv-rooms/<port>`, bind mounted at
  `/opt/fdfpv` for that unit), so the next deploy's rsync never changes the
  files under a draining process. `Restart=on-failure`: a drain ends with
  exit 0 and must stay down. `rooms-<port>.env` holds ROOMS_PEER.
- `rooms-deploy.sh` (from `install.sh`): stop whatever still runs on the
  port not live (the previous drain, at most two versions alive), copy
  the code, start it, require its `/v2/version` to name the commit, point
  Caddy at it (`lib.sh apply_caddy`, which renders the rooms upstream from
  `/etc/fdfpv/rooms-live` for board deploys too), write rooms-live, send
  the old instance SIGUSR2. It never waits for a room. The first run
  drains today's one unit `fdfpv-rooms` (kept from restarting by a
  `Restart=no` drop-in), and the run after removes it.
- `monitor.sh` and `turn-install.sh` ask the live instance.
- Proof: `CADDY=... npm run rooms:deploy-dryrun` runs `rooms-deploy.sh`
  against a fake VM (stub systemctl and curl, the real `caddy validate`):
  the migration from `fdfpv-rooms`, two more deploys while the previous one
  drains, and a deploy whose new instance answers the wrong commit, which
  fails with everything left as it was. Plus `bash -n`, shellcheck and
  `systemd-analyze verify` on the template. The VM itself is the lead's
  next deploy.

The tracks server keeps a plain restart: it is short HTTP requests on
SQLite and needs no drain.
