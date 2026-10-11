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

Nothing sends SIGUSR2 yet, so on the VM this slice changes nothing until
slice 3.

Proof: `npm run rooms:drain` (scripts/rooms-drain-check.js, in CI), two
processes from one tree on their own ports, SQLite files and REVISIONs
(`REVISION_FILE`, for the check only): a room on v1 keeps ~30 Hz poses with
no close while v1 drains, new rooms land on v2, v1 exits when the room
empties, a short cap closes with 1012 at the cap, and a drain that closes
at once fails the same probe.

## Slice 2: two processes side by side on the VM

- Release directories, `/opt/fdfpv/releases/<commit>` with a `current`
  symlink, instead of the in-place rsync: the draining process keeps its
  own code tree under it.
- A unit template `fdfpv-rooms@.service` (port 8797 or 8798, the release
  path, its own `rooms.db`), the live one named in `/etc/fdfpv/rooms-live`.
- Caddy `reverse_proxy` with `stream_close_delay` (Caddy 2.6 and later, the
  VM has 2.11.4), so a reload that points `/v2/*` at the new port does not
  close the WebSockets already open to the old one. Proven by a local run
  with Caddy in front (caddy-headers-check style): a reload with an open
  room socket does not close it.
- Ownership: a reconnect to `/v2/room/<CODE>` after the switch lands on the
  new process, which must forward it to the draining one while that one
  holds the code (a list handed over at start, or a shared
  `room_owner(code, port, until)` table). Each room has exactly one owning
  process; two processes never open the same `rooms.db`.
- Lobby: the new process lists its own rooms and the drainer's (its
  `/v2/rooms`) while the drainer lives.

## Slice 3: deploy.sh

Start the new colour, check its health and that `/v2/version` names the
commit, flip Caddy, send the old colour SIGUSR2, return without waiting. A
deploy while an older colour still drains sends that one SIGTERM first, so
at most two versions are ever alive. Memory: two 256M ceilings against 5.6
GB. The tracks server keeps a plain restart: it is short HTTP requests on
SQLite and needs no drain.
