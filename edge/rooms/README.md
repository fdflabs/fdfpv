# edge/rooms: the rooms server

One room's logic, and the two platforms that serve it. The plan is
`docs/MULTIPLAYER-PLAN.md`; the wire is `src/share/roomwire.js`.

| File | What it is | Platform |
| --- | --- | --- |
| `core.js` | `RoomCore`, one room's logic: seats, hello, poses, ticks, kicks. Returns actions, never touches a socket. | none |
| `safety.js`, `wrecks.js`, `race.js` | the phases' modules, called by the core | none |
| `lobby.js` | the room browser's book of public rooms: `LobbyBook` (the logic) and `Lobby` (its object) | none |
| `host.js` | `RoomHost`, a room as a server holds it: load, the action loop, init, accept, message, close, alarm | none |
| `front.js` | the HTTP front: routes, origin check, limits, a typed room name judged (the tracks server's word filter) | none |
| `do.js` | Cloudflare: the `Room` Durable Object around a `RoomHost`, and the Worker | Cloudflare |
| `node.js` | Node: namespaces, a queue per object, SQLite storage, timers for alarms, `ws` sockets, the counters | the VM |
| `health.js` | what the server costs (GET /v2/admin/health) and the valve that refuses new public rooms while the core is short | the VM |
| `voice.js` | voice chat's signalling: offers, answers and candidates passed to a seat, never past a mute, on an allowance of their own | none |
| `turn.js` | short lived TURN credentials for voice chat's relay, from `TURN_SECRET` and `TURN_URLS` | the VM |

Production is `node.js` on the owner's VM since 2026-09-28
(`deploy/vm/README.md`). The Worker, `fdfpv-rooms` on workers.dev, is still
deployed and `do.js` keeps it working: `npm run rooms:server` proves either
one over the wire.

## The adapter contract

`host.js` needs from its platform exactly this, the shape of a Durable
Object's state, and `do.js` and `node.js` each supply it:

- `ctx.storage.get(key)`, `put(key, value)`, `list()`, `deleteAll()`,
  `setAlarm(ms)`, async, values structured clone data. Storage outlives a
  hibernation on Cloudflare and a restart on the VM.
- `ctx.getWebSockets()`: the room's open sockets.
- A socket: `send(data)` (string or `Uint8Array`), `close(code, reason)`,
  `serializeAttachment(value)` and `deserializeAttachment()`, each a
  structured clone.
- One room's calls into the host run one at a time, never interleaved
  across an await. A Durable Object's input gate does it on Cloudflare;
  `node.js` queues every call per room.
- A text `ping` is answered `pong` without reaching the room.

And the platform calls `host.init`, `host.accept`, `host.message`,
`host.close` and `host.alarm` as its events arrive.

## Adding to a room

A new feature is a module the core calls, returning the core's actions:

| Action | Means |
| --- | --- |
| `{ send: conn, data }` | a message to one socket |
| `{ close: conn, code, reason }` | close it |
| `{ attach: conn, value }` | keep this with the socket |
| `{ store: key, value }` | keep this in the room's storage |
| `{ tick: true }` | call `tick()` again in `TICK_MS` |
| `{ empty: true }` | nobody is left: schedule the purge |

What a feature must keep across a hibernation or a restart it returns as
`{ store: key, value }`, and `host.js` hands the value back on load to
`core[key].restore(value)`, before the seats are restored. So a part of
the core named `race` stores under `'race'`, one named `tag` under
`'tag'`, and neither needs a line in any adapter. A stored key with no
such part throws at load rather than coming back empty.

Only a new kind of action changes `host.js`, once, and then both
platforms have it. Nothing ever needs to change in `do.js` or `node.js`
unless the platform contract above does.

## Checks

- `npm run rooms:selftest`: the core and its modules, in plain Node.
- `npm run voicechat:selftest`: voice chat's relay and TURN credentials,
  and `npm run voicechat:twopage [origin]`, two browsers talking.
- `npm run rooms:server [origin]`: a running server over real sockets.
  With no origin it starts `node.js` itself and adds a restart with two
  pilots flying. Against `npx wrangler dev --config edge/rooms/wrangler.toml`
  it proves `do.js`.
- `node scripts/rooms-soak.js <origin> <seconds> <clients>`: a soak.
- `npm run rooms:load [origin] [--pilots=8,16 --rooms=4 ...]`: load, many
  pilots through free flight, a race and a combat round, with the
  server's own counters; `--quick` (CI) is 32 in one room.
- The two page browser checks (`rooms:twopage`, `rooms:safety`,
  `rooms:wrecks`, `rooms:racetwopage`, `rooms:restart`) against any origin.
- `npm run rooms:browser [origin]`: the room browser, three pages through
  the real shell; with no origin it starts `node.js` itself.
