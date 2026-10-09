#!/usr/bin/env bash
# backup-remote.sh: the VM half of a backup. Run as root on the VM by
# backup.sh over the deploy's SSH access (`ssh ... 'sudo bash -s' <
# backup-remote.sh`), so nothing is installed on the VM for it. Writes one
# uncompressed tar to stdout and nothing else there; progress goes to
# stderr.
#
# What it takes, each consistent on its own while the servers run:
#   board.dump   pg_dump -Fc of fdfpvboard (tracks, times, ghosts, bugs and
#                their screenshots, pilots, events, statistics),
#   tracks.db    every track, account, gallery entry and the waitlist,
#   rooms.db     a private room's code, seats and race, for reconnects,
#   metrics.db   the admin page's history,
#   etc-fdfpv.tar  /etc/fdfpv: the secrets the servers start with. Without
#                ACCOUNTS_SECRET a restored tracks.db cannot open the pilot
#                keys sealed with it (README.md, the optional Google sign in),
#                so a backup without it does not restore the accounts.
# The SQLite files are copied with VACUUM INTO on a read only connection: a
# snapshot of one transaction, the WAL included, with no lock on the
# writers beyond a read.
#
# Not taken: /var/lib/fdfpv-vids (the rendered films, rebuilt from the repo
# and redeployed), /opt (code, redeployed by deploy.sh), the journal.
#
# This file is part of the Paraguayan Drone Combat Simulator.
#
# The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or (at
# your option) any later version.
#
# The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
# WITHOUT ANY WARRANTY, without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
# General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.

set -euo pipefail
umask 077

work="$(mktemp -d /var/tmp/fdfpv-backup.XXXXXX)"
trap 'rm -rf "$work"' EXIT

runuser -u postgres -- pg_dump -Fc -d fdfpvboard > "$work/board.dump"
echo "board.dump $(stat -c %s "$work/board.dump") bytes" >&2

for db in /var/lib/fdfpv-tracks/tracks.db /var/lib/fdfpv-rooms/rooms.db /var/lib/fdfpv-metrics/metrics.db; do
  out="$work/$(basename "$db")"
  node --disable-warning=ExperimentalWarning -e '
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(process.argv[1], { readOnly: true });
    db.exec(`VACUUM INTO '"'"'${process.argv[2]}'"'"'`);
    db.close();
  ' "$db" "$out"
  echo "$(basename "$db") $(stat -c %s "$out") bytes" >&2
done

tar -C /etc -cf "$work/etc-fdfpv.tar" fdfpv
date -u +%Y-%m-%dT%H:%M:%SZ > "$work/TAKEN"
for rev in /opt/fdfpv/REVISION /opt/fdfpv-board/REVISION; do
  echo "$rev: $(cat "$rev" 2>/dev/null || echo missing)"
done > "$work/REVISIONS"

tar -C "$work" -cf - .
