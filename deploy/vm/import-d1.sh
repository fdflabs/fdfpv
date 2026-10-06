#!/usr/bin/env bash
# import-d1.sh: replace the VM's tracks database with an export of the D1 one.
#
#   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
#     npx wrangler@4 d1 export fdfpv-tracks --remote \
#       --config tracks-api/wrangler.toml --output /outside/the/repo/d1.sql
#   deploy/vm/import-d1.sh /outside/the/repo/d1.sql
#
# For the move off Cloudflare, and for nothing after it: the VM's database
# is replaced whole, so a track saved to the VM since is lost. The one it
# replaces is kept beside it as tracks.db.before-import-<time>. The export
# carries wrangler's d1_migrations table, so tracks-api/d1sqlite.js opens
# it with its migrations already counted.
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

EXPORT="${1:-}"
VM="${FDFPV_VM:-opc@129.151.39.48}"
KEY="${FDFPV_VM_KEY:-$HOME/.ssh/fdfpv-oracle}"

if [ -z "$EXPORT" ] || [ ! -f "$EXPORT" ]; then
  echo "usage: deploy/vm/import-d1.sh /path/to/d1-export.sql" >&2
  exit 2
fi

scp -q -i "$KEY" -o BatchMode=yes "$EXPORT" "$VM:/tmp/fdfpv-d1-export.sql"
ssh -i "$KEY" -o BatchMode=yes "$VM" 'sudo bash -s' <<'REMOTE'
set -euo pipefail
dir=/var/lib/fdfpv-tracks
stamp=$(date -u +%Y%m%dT%H%M%SZ)
install -o fdfpv-tracks -g fdfpv-tracks -m 600 /tmp/fdfpv-d1-export.sql "$dir/import.sql"
rm -f /tmp/fdfpv-d1-export.sql
systemctl stop fdfpv-tracks
if [ -f "$dir/tracks.db" ]; then
  # A clean stop checkpointed the WAL, so the .db alone is the database.
  mv "$dir/tracks.db" "$dir/tracks.db.before-import-$stamp"
  rm -f "$dir/tracks.db-wal" "$dir/tracks.db-shm"
fi
sudo -u fdfpv-tracks node --disable-warning=ExperimentalWarning -e '
  const { DatabaseSync } = require("node:sqlite");
  const fs = require("node:fs");
  const db = new DatabaseSync(process.argv[1] + "/tracks.db");
  db.exec(fs.readFileSync(process.argv[1] + "/import.sql", "utf8"));
  const n = db.prepare("SELECT COUNT(*) AS n FROM tracks").get().n;
  const m = db.prepare("SELECT GROUP_CONCAT(name) AS m FROM d1_migrations").get().m;
  console.log(`imported ${n} tracks, migrations ${m}`);
  db.close();
' "$dir"
rm -f "$dir/import.sql"
systemctl start fdfpv-tracks
sleep 1
systemctl is-active fdfpv-tracks
REMOTE
