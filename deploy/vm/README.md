# deploy/vm: the rooms, tracks and board servers on the owner's VM

Since 2026-09-28 both servers the simulator talks to run on the owner's
Oracle Cloud VM instead of Cloudflare Workers. The Free plan's 100,000
Worker requests a day are shared with another project that uses about
126,000, so both Workers answered HTTP 429 (error 1027) most of the day.

Since 2026-09-29 the board runs there too: fdflabs/fdfpv-leaderboard, the
published tracks and their verified lap times, the bug tickets F8 and the
flight feel form send, the site statistics and the live ghost rooms. It was
built for Render and a domain that never existed, and until it moved here
every one of those features failed on the live site.

| | |
| --- | --- |
| Address | https://129.151.39.48, all three servers |
| Tracks | `/api/*`, tracks-api/node.js on 127.0.0.1:8787 |
| Rooms | `/v2/*` and `/`, edge/rooms/node.js on 127.0.0.1:8797, WebSockets included |
| Board | `/board/*` with the prefix taken off, fdfpv-leaderboard src/server.js on 127.0.0.1:3180, WebSockets included; Postgres 16 on the Unix socket |
| VM | Oracle Cloud Sao Paulo, Oracle Linux 9, aarch64, 1 core, 5.6 GB, 30 GB disk |
| Access | `ssh -i ~/.ssh/fdfpv-oracle opc@129.151.39.48`, key only; the key lives on the owner's desktop and nowhere else |

## Why an address and not a name

Let's Encrypt issues certificates for bare IP addresses on its six day
`shortlived` profile, and Caddy renews them by itself (about every three
days). The wildcard DNS services that give an address a free name,
sslip.io and nip.io, are on DNS blocklists: the owner's own ISP resolver
answers NXDOMAIN for them, so a pilot on such a network could not have
reached the servers at all. An address needs no DNS.

Both servers share the one origin because their paths never meet (`/api`
for tracks, `/v2` for rooms), so each sees exactly the URLs it saw as a
Worker and the simulator's two origins are the same string.

## What runs there

- `caddy` (COPR `@caddy/caddy`), the TLS front, `Caddyfile` here. No access
  log. It hands each server the client address in `cf-connecting-ip`, the
  header they read on Cloudflare, overwriting any a client sent.
- `fdfpv-rooms`, `fdfpv-tracks` and `fdfpv-board`, systemd units here,
  Node 24 from the Oracle Linux appstream module, each as its own system
  user with no shell, loopback only, `Restart=always`, a hardened sandbox,
  and a `MemoryMax` set from a measured peak (the measurement is in the
  unit). The board's code is in `/opt/fdfpv-board`, with the commit it
  runs in `/opt/fdfpv-board/REVISION`.
- `postgresql`, Postgres 16 from the appstream module, stock config: the
  board's tracks, times, ghosts, tickets and statistics counters in the
  database `fdfpvboard` under `/var/lib/pgsql/data`. The board connects
  over the Unix socket with peer authentication as `fdfpv-board`, so there
  is no database password. It listens on loopback only. Why Postgres and
  not the board's JSON file is in the board's README. Its one change from
  stock is a systemd drop-in, `postgresql.conf` here, installed by
  `board-install.sh`: `MemoryMax=256M`, from a measured peak written in it.
- State in `/var/lib/fdfpv-rooms/rooms.db` (a private room's code and race,
  so pilots reconnect into their seats after a restart) and
  `/var/lib/fdfpv-tracks/tracks.db` (every track). The tracks admin secret
  is in `/etc/fdfpv/tracks.env`, root, mode 600, and the board's secrets
  (`BUGS_TOKEN`, `BOARD_ADMIN_TOKEN`, `BOARD_SESSION_SECRET`,
  `BOARD_ADMINS`) in `/etc/fdfpv/board.env`, root, mode 600.
- `dnf-automatic` applying security errata daily (Node and the OS; Caddy's
  COPR publishes no errata, so `sudo dnf upgrade caddy` by hand).
- firewalld: ssh, http, https. Oracle's security list allows 22, 80, 443.
  With voice chat's relay (below, deploy-turn.sh), also 3478 UDP and TCP,
  5349 TCP and 49160 to 49200 UDP, in both.
- `coturn`, voice chat's TURN relay, from Oracle's EPEL, once
  deploy-turn.sh has run: its secret in `/etc/fdfpv/turn.env`, root, mode
  600, read by the rooms unit too.
- journald capped at 500 MB (`journald.conf`).

Measured on 2026-09-28 with `scripts/rooms-soak.js` from the desktop:
8 pilots in one room, the rooms server at 2 to 3% of the core and 31 MB;
32 pilots in four rooms, rooms 10%, Caddy 6%, the whole VM 27%, rooms
34 MB. Every client saw every other at 29.5 Hz.

## Deploy or update

```sh
deploy/vm/deploy.sh /home/brains/Desktop/fdfpv-loop/online-tracks/ADMIN-SECRET.txt
```

Idempotent. It runs `host.sh` on the VM (packages, firewall, users),
refuses to go on if sshd allows passwords, rsyncs `package*.json`,
`src/`, `configs/`, `edge/`, `tracks-api/` and `deploy/vm/` into
`/opt/fdfpv`, runs `npm ci` there (the one dependency is `ws`), makes the
admin secret the first time, installs the units, the journald cap and the
Caddyfile (`install.sh`), restarts both servers, and fetches both through
Caddy. A restart closes every room socket with 1012 and the simulator
reconnects into its seat.

Which commit is live: deploy.sh writes the commit it copied to
`/opt/fdfpv/REVISION` (with ` dirty` after it from a checkout with
uncommitted changes) before the restart, each server reads it as it
starts, and `GET /v2/version` (rooms) and `GET /api/version` (tracks)
answer `{"commit":"<sha>","dirty":false}`. deploy.sh fails at its last
step if either does not name the commit it deployed. The board does the
same at `GET /board/api/version` (`{"commit","fdfpv"}`), from the
`/opt/fdfpv-board/REVISION` deploy-board.sh writes. Compare any of them
with `git rev-parse origin/main`:

```sh
curl -s https://129.151.39.48/v2/version https://129.151.39.48/api/version https://129.151.39.48/board/api/version
```

The admin secret is generated on the VM the first time and written to the
file named, mode 600: its first line is the secret, its second a dated
note, so read it with `head -n1`. To rotate it, delete
`/etc/fdfpv/tracks.env` on the VM and rerun.

### The board

```sh
deploy/vm/deploy-board.sh /home/brains/Desktop/fdfpv-loop/online-tracks/BOARD-ADMIN.txt \
  /path/to/a/checkout/of/fdfpv-leaderboard
```

The checkout defaults to `../fdfpv-leaderboard` beside this repository,
and has to be committed with `vendor/fdfpv` at its pinned commit: the
script refuses anything else, so `/opt/fdfpv-board/REVISION` is always
what runs. Idempotent. It runs `host.sh` (Postgres and the `fdfpv-board`
user included), rsyncs the board and the simulator modules its lap check
imports into `/opt/fdfpv-board`, rsyncs this directory into
`/opt/fdfpv/deploy/vm`, makes the admin file and `/etc/fdfpv/board.env`
the first time, and runs `board-install.sh`: the database and its role,
the unit, the Caddyfile (validated first, then a graceful reload). It
restarts the board and nothing else, so pilots in a room stay connected,
which `deploy.sh` cannot promise: `install.sh` restarts rooms and tracks.

The admin file is the board's sign in, mode 600: the address on its
first line, the password on its second, a dated note on its third. The
password is hashed on the desktop and only the scrypt record goes to the
VM. To change it, or to rotate `BUGS_TOKEN`, `BOARD_ADMIN_TOKEN` and
`BOARD_SESSION_SECRET`, delete `/etc/fdfpv/board.env` on the VM (and the
admin file, for a new password) and rerun.

### Voice chat's TURN relay

Voice chat (src/share/voice.js) goes pilot to pilot over WebRTC, found
through public STUN, and works with nothing here but the rooms server
that relays its signalling. coturn on this VM is the relay for the pilots
whose networks will not let a direct link through; the client asks for it
only after a direct try has failed, over UDP first and then TCP or TLS.

**Oracle's security list must allow, inbound from 0.0.0.0/0, stateful:**

| Protocol | Port | For |
| --- | --- | --- |
| UDP | 3478 | STUN and TURN |
| TCP | 3478 | TURN over TCP, for networks that block UDP |
| TCP | 5349 | TURN over TLS, for networks that allow only TLS |
| UDP | 49160 to 49200 | the relay's ports, 41, one per allocation |

firewalld opens the same ports on the VM (turn-install.sh). Then, from
the desktop, in this order:

```sh
deploy/vm/deploy.sh /home/brains/Desktop/fdfpv-loop/online-tracks/ADMIN-SECRET.txt
deploy/vm/deploy-turn.sh
npm run voicechat:twopage -- https://129.151.39.48
```

deploy.sh puts the rooms server that knows voice on the VM, with its unit
reading `/etc/fdfpv/turn.env` if there is one; voice works from here on,
through STUN alone. deploy-turn.sh (idempotent) runs `turn-install.sh` as
root on the VM:

- coturn from Oracle's EPEL (`oracle-epel-release-el9`), with the drop-in
  `coturn.conf` (always restarted, `MemoryMax` from a measured peak),
- the first time only, `/etc/fdfpv/turn.env` (root, mode 600):
  `TURN_SECRET`, made on the VM and never printed or copied off it, and
  `TURN_URLS`, the three addresses pilots are handed,
- `/etc/coturn/turnserver.conf` (root:coturn, 0640): `turnserver.conf`
  here, plus `external-ip` (the public address and the private one Oracle
  maps it to) and the secret,
- `fdfpv-turn-cert.timer`: every six hours `turn-cert.sh` copies Caddy's
  certificate for the address to `/etc/coturn/tls` and reloads coturn when
  it changed, since Caddy renews it about every three days,
- firewalld, and a restart of coturn or the rooms server only when a file
  it reads at start is newer than it (the rooms' pilots reconnect).

It ends by sending a STUN request to 3478 over UDP from the desktop
(`scripts/stun-check.js`): no answer means coturn is down or the security
list is not letting UDP 3478 in. The two page check then proves the rest
against the live server: two pilots talk, and a relay candidate is
gathered through coturn over UDP and over TCP or TLS with a credential
the rooms server minted.

The credentials are the TURN REST scheme (`edge/rooms/turn.js`): a
username that is its own expiry, six hours out, and an HMAC of it with
the shared secret, so coturn stores nothing and a credential dies by
itself. coturn keeps no log (`log-file=/dev/null`), refuses to relay into
private and loopback ranges or the metadata address, and holds each
session to 16 kB/s. To rotate the secret, delete `/etc/fdfpv/turn.env`
on the VM and rerun deploy-turn.sh; pilots in a room reconnect, and their
voice links are made again with new credentials.

### Reading bug reports

Open https://129.151.39.48/board/, press **Admin** in the masthead, and
sign in with the two lines of `BOARD-ADMIN.txt`. Then
https://129.151.39.48/board/bugs, in the same tab, lists every ticket F8
and the flight feel form have sent, newest first, and opens and closes
them. A ticket with screenshots pasted into the form shows them under
Resolution as thumbnails; a click opens one full size in a new tab.
Without a sign in the list is refused: tickets carry the reporter's words,
their machine's details and their screenshots. From a script, with the
token from the VM (`/api/bugs/{id}/images/{n}` is screenshot n, 1 to 4):

```sh
BUGS_TOKEN="$(ssh -i ~/.ssh/fdfpv-oracle opc@129.151.39.48 sudo sed -n 's/^BUGS_TOKEN=//p' /etc/fdfpv/board.env)"
curl -fsS -H "authorization: Bearer $BUGS_TOKEN" 'https://129.151.39.48/board/api/bugs?status=open'
```

### The optional Google sign-in

The accounts live in the tracks server (tracks-api/accounts.js, the
tables in tracks-api/migrations/0002_accounts.sql, applied by itself on
the first start after the deploy). It needs two things, both set by the
files here:

- `GOOGLE_CLIENT_ID`, public, in `fdfpv-tracks.service`: a comma separated
  list of client ids (`tracks-api/accounts.js` `parseClientIds`), so the
  id can move. `src/share/account.js` signs in with one id, the first
  (newest) on this list; a page loaded before a deploy, still holding an
  older id, keeps signing in as long as that id stays on the list too.
  Drop an old id from the list once no page in the wild can still be
  holding it.
- `ACCOUNTS_SECRET`, which seals the pilot keys the accounts carry,
  generated on the VM by `deploy.sh` step 4b into
  `/etc/fdfpv/accounts.env` (root, mode 600), read by the tracks unit
  only. It never leaves the VM and is never rotated: a changed secret
  cannot open the keys sealed with the old one. Back it up with
  `tracks.db`, together.

Without a client id, or without `ACCOUNTS_SECRET`, every `/api/account`
route answers 503 and the rest of the tracks server is as it was. The
server fetches Google's keys from
www.googleapis.com, so the VM needs outbound HTTPS (it has it; dnf uses
it). The rooms unit asks the tracks server about a signed in pilot's
session over loopback (`ACCOUNTS_ORIGIN` in `fdfpv-rooms.service`) and
seats nobody without one: no session, or a build from before the sign in,
is refused, and while the tracks server does not answer every join is
refused with its own reason (edge/rooms/node.js helloAccount). The board takes a callsign
claim and a key link on `/board/api/pilots` and `/board/api/pilots/link`,
which need nothing configured.

Is it on, after a deploy:

```sh
curl -sS -X POST -H 'content-type: application/json' -d '{"credential":"x"}' \
  https://129.151.39.48/api/account/google
```

answers 401 with `"reason":"not a token"` when it is, 503 when it is not.

### The owner's missions in development (DEV_ACCOUNTS)

The owner flies a mission before it is released (Act 1's in
development, The Interior's Mission 1) on the live server, and nobody
else may. `DEV_MISSIONS` would open them to everybody, so the VM never
sets it. Instead the rooms unit reads `DEV_ACCOUNTS` from
`/etc/fdfpv/dev-accounts.env` (optional; root, mode 600; never in the
repository): comma separated account ids. A room whose host's seat is
one of those accounts starts missions in `development` (never `soon`),
for the war and the ops missions alike; every other room is as it was.
The id is the accounts server's answer for the seat's session
(edge/rooms/node.js helloAccount), never anything a client says, and an
allowlisted pilot seated in somebody else's room opens nothing there
(edge/rooms/core.js devHost; `npm run dev:accounts` proves it). With the
list set, a private war room may also be made naming a mission in
development (the room still starts it only for such a host); a public
one may not.

The owner's account id, by their callsign, read only (nothing else of
the account is printed):

```sh
ssh -i ~/.ssh/fdfpv-oracle opc@129.151.39.48 "sudo node --disable-warning=ExperimentalWarning -e \"
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('/var/lib/fdfpv-tracks/tracks.db', { readOnly: true });
console.log(db.prepare('SELECT id, callsign FROM accounts WHERE callsign_key = ?').get(process.argv[1].toLowerCase()));
\" OWNER_CALLSIGN"
```

Set it, then restart the rooms (a room in play is restored from its
storage):

```sh
ssh -i ~/.ssh/fdfpv-oracle opc@129.151.39.48 \
  'echo DEV_ACCOUNTS=<id> | sudo install -m 600 -o root /dev/stdin /etc/fdfpv/dev-accounts.env && sudo systemctl restart fdfpv-rooms'
```

To take it away, delete the file and restart `fdfpv-rooms`. The owner
opens the page with `?missions=dev` so the campaign screens offer what is
in development (the client's switch only; the room is the gate, and
anybody else using it is refused `unreleased`). The same list lifts Act
1's win first lock (mission N+1 needs mission N won) for those accounts
alone: the page asks `GET /v2/dev` with its session, and the rooms
server answers from the accounts server's id for it (edge/rooms/front.js
devAccount), so a changed list needs only the restart above. The accounts server must
be from this change on (its `GET /api/account` answers the account's
`id`), so deploy both units.

## Monitoring

The owner's desktop watches the game and the VM from outside every five
minutes (`fdfpv-monitor.timer`, a systemd `--user` timer on the DESKTOP,
`monitor.sh`) and tells the owner's phone through ntfy when something
changes. What it checks: the site and its deploy stamp; that the stamp is
main's head within 45 minutes; `/api/version`, `/v2/version` (the same
commit, or a deploy is half done) and the rooms lobby (`/v2/rooms`); the
board on Postgres; both certificates over 14 days; over SSH, read only,
the VM's root disk under 85%, memory over 10% available and caddy,
postgresql and the three servers active; the last good backup under 26
hours old (`~/fdfpv-backups/last-success`, see Backups).

A check alerts on a change of state held for two runs (so one dropped
request pages nobody), and again when it recovers. A heartbeat goes once a
day after 09:00 local: the monitor is alive, what is failing, and how many
commits the VM is behind main (information: the VM is deployed by hand).

The ntfy topic and token are in `~/.config/fdfpv-monitor/ntfy.env` (mode
600, never in the repo); since 2026-10-08 it is the same topic the
BurnLedger monitor uses, titled "FDFPV". For a topic of its own, change
`NTFY_URL` there and subscribe to it on the phone. Every curl is pinned to
IPv4 (ntfy's free quota is per source address; see the unit).

Install or update it on the desktop:

```sh
mkdir -p ~/.local/lib/fdfpv-monitor ~/.config/fdfpv-monitor/curl-ipv4
install -m 755 deploy/vm/monitor.sh ~/.local/lib/fdfpv-monitor/
install -m 644 deploy/vm/fdfpv-monitor.service deploy/vm/fdfpv-monitor.timer ~/.config/systemd/user/
printf 'ipv4\n' > ~/.config/fdfpv-monitor/curl-ipv4/.curlrc
# ~/.config/fdfpv-monitor/ntfy.env: NTFY_URL=https://ntfy.sh/<topic> and NTFY_TOKEN=<token>, mode 600
systemctl --user daemon-reload
systemctl --user enable --now fdfpv-monitor.timer
deploy/vm/monitor.sh --dry-run     # every check, nothing sent, no state kept
journalctl --user -u fdfpv-monitor -n 20
```

State (what was last told, per check) is in `~/.local/state/fdfpv-monitor`.
To see an alert fire without breaking anything, point one check at a
missing file in a scratch state directory; the second run sends DOWN, two
runs back to normal send RECOVERED:

```sh
T=$(mktemp -d); export CURL_HOME=~/.config/fdfpv-monitor/curl-ipv4
FDFPV_MONITOR_STATE=$T FDFPV_BACKUP_DIR=/nonexistent deploy/vm/monitor.sh   # twice
FDFPV_MONITOR_STATE=$T deploy/vm/monitor.sh                                 # twice
```

## Check it

```sh
ADMIN_SECRET="$(head -n1 /home/brains/Desktop/fdfpv-loop/online-tracks/ADMIN-SECRET.txt)" \
  node tracks-api/smoke.js https://129.151.39.48
npm run rooms:server -- https://129.151.39.48
node scripts/rooms-soak.js https://129.151.39.48 600 2
SIM_GPU=1 node scripts/rooms-two-page.js https://129.151.39.48
SIM_GPU=1 node scripts/rooms-restart-check.js https://129.151.39.48 \
  "ssh -i ~/.ssh/fdfpv-oracle opc@129.151.39.48 sudo systemctl restart fdfpv-rooms"
```

and `rooms:safety`, `rooms:wrecks`, `rooms:racetwopage` the same way.
Logs: `sudo journalctl -u fdfpv-rooms -u fdfpv-tracks -u fdfpv-board -u caddy`.

The board, every feature from the page (scripts/board-live-check.js says
what it files and what it takes back):

```sh
BOARD_ADMIN_FILE=/home/brains/Desktop/fdfpv-loop/online-tracks/BOARD-ADMIN.txt npm run board:live
```

After a board deploy that touched the bug form, `-- --only=paste` runs just
the screenshot path: a paste into F8, the chip, the send, the admin's
read of it and the inbox's thumbnail, then closes its ticket. It publishes
no track and posts no lap.

Nothing in front of the board limits a request body: Caddy passes the
5.6 MB a report with four screenshots at the board's cap can be, and a
body past it gets the board's own 413 (checked through Caddy on
2026-09-29).

## What the rooms cost, and the valve

The rooms server counts itself (edge/rooms/health.js): pilots, rooms,
messages and bytes a second each way, its CPU and the VM's, the event
loop's delay, memory, and the day's egress, pilot hours and room hours.
Only with the admin secret, the tracks server's (the rooms unit reads the
same `/etc/fdfpv/tracks.env`):

```sh
curl -fsS -H "authorization: Bearer $(head -n1 /home/brains/Desktop/fdfpv-loop/online-tracks/ADMIN-SECRET.txt)" \
  https://129.151.39.48/v2/admin/health
```

`busy: true` there means the valve is closed: the core has been short
for ten seconds (rooms at half of it, or the loop's p99 delay at 20 ms,
or 200 MB resident), so new public rooms are refused until thirty calm
seconds; rooms already flying go on. `closings` and `refused` count how
often. The numbers behind the thresholds are in docs/MULTIPLAYER-PLAN.md
section 12, Phase 6 as built.

## The admin page's Server section

admin.html shows the VM: CPU (user, sys, iowait and steal), load, RAM,
swap, disk and inodes, network, open HTTPS connections, every service's
memory against its `MemoryMax` with its CPU, start time, restarts and
revision, what holds the disk, request latency by route, the rooms
server's own report, certificate expiry, Postgres connections, warnings
and errors with addresses masked, charts of all of it over 1 h to 30 d,
and a sizing card that says which wall comes first and when.

Two halves, so the tracks server's sandbox stays as it was:

- The tracks server reads the live counters every user may read (`/proc`,
  `/sys/fs/cgroup`) and times its own requests, in memory
  (`tracks-api/metrics.js`).
- `fdfpv-metrics.timer` runs `tracks-api/collect.js` once a minute as
  `fdfpv-metrics`, a user with the journal's group and a read only
  capability (why, in `fdfpv-metrics.service`). It writes
  `/var/lib/fdfpv-metrics/metrics.db`: minutes for 48 hours, quarter
  hours for 90 days, hours for ever, about a dozen MB a year. The tracks
  server opens it read only.

Is it collecting:

```sh
ssh -i ~/.ssh/fdfpv-oracle opc@129.151.39.48 \
  'systemctl list-timers fdfpv-metrics.timer; systemctl show -p MemoryPeak,CPUUsageNSec,Result fdfpv-metrics'
```

To look at the page without the VM: `node tracks-api/metrics-fixture.js
/tmp/metrics.db 21` makes three weeks of made up history, and a local
tracks server started with `METRICS_DB=/tmp/metrics.db` serves it.

## A load test on the VM (by hand, with the owner's say so)

`scripts/rooms-load.js` against the VM measures the one core itself. It
makes public rooms named "Load test" on the world `loadtest`, which the
room browser lists while they last (a real pilot could join one; no
quick join on a real world lands there), so run it at a quiet hour, and
it makes six rooms a minute at most from one address. Each step is a few
minutes; stop at the first that fails a check or shows the loop's p99
past 20 ms:

```sh
export ADMIN_SECRET="$(head -n1 /home/brains/Desktop/fdfpv-loop/online-tracks/ADMIN-SECRET.txt)"
node scripts/rooms-load.js https://129.151.39.48 --pilots=8,16 --phase=30
node scripts/rooms-load.js https://129.151.39.48 --rooms=2 --pilots=16 --phase=30
node scripts/rooms-load.js https://129.151.39.48 --rooms=3 --pilots=16 --phases=free,combat --phase=30
node scripts/rooms-load.js https://129.151.39.48 --rooms=4 --pilots=16 --phases=free,combat --phase=30
```

and beside it on the VM, the whole core with Caddy's share:
`ssh -i ~/.ssh/fdfpv-oracle opc@129.151.39.48 'top -b -d 5 -n 60 | grep -E "^%Cpu|node|caddy"'`,
and `systemctl show -p MemoryPeak fdfpv-rooms` after. What to write down:
each step's CPU, loop p99, the near peers' rate, the VM's idle, and
whether `busy` turned true (it should, before near peers drop under
29 Hz). The desktop's estimate to check it against is three combat rooms
of 16 at about 70% of the core.

## The tracks moved from D1

The D1 database `fdfpv-tracks` was exported with `wrangler d1 export` and
imported with `import-d1.sh`, which replaces the VM's database whole
(keeping the old file beside it). It is for the move only: after the
switch the VM's database is the record, and running it again would lose
every track saved since.

## Switching back to Cloudflare

The Workers `fdfpv-tracks` and `fdfpv-rooms` are still deployed, with D1
as it was at the export. Set `PRODUCTION_TRACKS_ORIGIN` in
`src/share/cloud.js` to `https://fdfpv-tracks.fdfretes.workers.dev` and
`PRODUCTION_ROOMS_ORIGIN` in `src/share/rooms.js` to
`https://fdfpv-rooms.fdfretes.workers.dev`, and push to main. Tracks saved
on the VM in the meantime are not in D1; copy them first if they matter
(`GET /api/tracks` lists them). The Workers' admin secret is the one in
`ADMIN-SECRET.txt.old` beside the new file.
