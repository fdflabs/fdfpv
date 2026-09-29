# deploy/vm: the rooms and tracks servers on the owner's VM

Since 2026-09-28 both servers the simulator talks to run on the owner's
Oracle Cloud VM instead of Cloudflare Workers. The Free plan's 100,000
Worker requests a day are shared with another project that uses about
126,000, so both Workers answered HTTP 429 (error 1027) most of the day.

| | |
| --- | --- |
| Address | https://129.151.39.48, both servers |
| Tracks | `/api/*`, tracks-api/node.js on 127.0.0.1:8787 |
| Rooms | `/v2/*` and `/`, edge/rooms/node.js on 127.0.0.1:8797, WebSockets included |
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
- `fdfpv-rooms` and `fdfpv-tracks`, systemd units here, Node 24 from the
  Oracle Linux appstream module, each as its own system user with no
  shell, loopback only, `Restart=always`, a hardened sandbox, and a
  `MemoryMax` set from a measured peak (the measurement is in the unit).
- State in `/var/lib/fdfpv-rooms/rooms.db` (a private room's code and race,
  so pilots reconnect into their seats after a restart) and
  `/var/lib/fdfpv-tracks/tracks.db` (every track). The tracks admin secret
  is in `/etc/fdfpv/tracks.env`, root, mode 600.
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
Logs: `sudo journalctl -u fdfpv-rooms -u fdfpv-tracks -u caddy`.

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
