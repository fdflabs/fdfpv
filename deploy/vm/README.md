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
  not the board's JSON file is in the board's README.
- State in `/var/lib/fdfpv-rooms/rooms.db` (a private room's code and race,
  so pilots reconnect into their seats after a restart) and
  `/var/lib/fdfpv-tracks/tracks.db` (every track). The tracks admin secret
  is in `/etc/fdfpv/tracks.env`, root, mode 600, and the board's secrets
  (`BUGS_TOKEN`, `BOARD_ADMIN_TOKEN`, `BOARD_SESSION_SECRET`,
  `BOARD_ADMINS`) in `/etc/fdfpv/board.env`, root, mode 600.
- `dnf-automatic` applying security errata daily (Node and the OS; Caddy's
  COPR publishes no errata, so `sudo dnf upgrade caddy` by hand).
- firewalld: ssh, http, https. Oracle's security list allows 22, 80, 443.
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

- `GOOGLE_CLIENT_ID`, public, in `fdfpv-tracks.service`; the same string
  as `GOOGLE_CLIENT_ID` in `src/share/account.js`.
- `ACCOUNTS_SECRET`, which seals the pilot keys the accounts carry,
  generated on the VM by `deploy.sh` step 4b into
  `/etc/fdfpv/accounts.env` (root, mode 600), read by the tracks unit
  only. It never leaves the VM and is never rotated: a changed secret
  cannot open the keys sealed with the old one. Back it up with
  `tracks.db`, together.

Without either, every `/api/account` route answers 503 and the rest of
the tracks server is as it was. The server fetches Google's keys from
www.googleapis.com, so the VM needs outbound HTTPS (it has it; dnf uses
it). The rooms unit asks the tracks server about a signed in pilot's
session over loopback (`ACCOUNTS_ORIGIN` in `fdfpv-rooms.service`); if
that fails the pilot is seated as a guest. The board takes a callsign
claim and a key link on `/board/api/pilots` and `/board/api/pilots/link`,
which need nothing configured.

Is it on, after a deploy:

```sh
curl -sS -X POST -H 'content-type: application/json' -d '{"credential":"x"}' \
  https://129.151.39.48/api/account/google
```

answers 401 with `"reason":"not a token"` when it is, 503 when it is not.

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
