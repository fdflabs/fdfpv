#!/usr/bin/env bash
# restore-drill.sh: restore a backup into throwaway servers on this desktop
# and prove they serve it. Touches nothing on the VM.
#
#   deploy/vm/restore-drill.sh [backup dir] [fdfpv-leaderboard checkout]
#
# The backup dir defaults to ~/fdfpv-backups/latest (backup.sh), the
# checkout to ../fdfpv-leaderboard beside this repository, as deploy-board.sh
# has it. Needs Docker (the postgres:16 image, the VM's major version) and
# Node. Every step prints pass or FAIL; the exit status is the number of
# FAILs.
#
#   1. SHA256SUMS verifies.
#   2. board.dump restores into a fresh Postgres 16 container, and every
#      table holds as many rows as the dump's own COPY blocks carry.
#   3. The board, from the checkout, starts on the restored database and
#      answers /api/health from Postgres and /api/tracks with every track.
#   4. tracks.db and /etc/fdfpv restore into a scratch directory; the tracks
#      server starts on them with the restored ADMIN_SECRET and
#      ACCOUNTS_SECRET, its admin overview counts the same accounts and
#      tracks as the file, and tracks-api/smoke.js passes against it
#      (publish, update, refuse, filter, rate limit, then delete).
#   5. rooms.db and metrics.db open and pass integrity_check.
#
# The container, the servers and the scratch directory (which holds the
# restored secrets) are removed on exit, pass or fail.
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

set -uo pipefail
umask 077

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKUP="$(cd "${1:-$HOME/fdfpv-backups/latest}" && pwd -P)"
BOARD="$(cd "${2:-$ROOT/../fdfpv-leaderboard}" && pwd)"
PG_IMAGE=postgres:16

failed=0
check() {
  if [[ $2 == 0 ]]; then
    echo "  pass  $1${3:+  ($3)}"
  else
    echo "  FAIL  $1${3:+  ($3)}"
    failed=$((failed + 1))
  fi
}

scratch="$(mktemp -d "${TMPDIR:-/tmp}/fdfpv-drill.XXXXXX")"
container="fdfpv-drill-$$"
pids=()
cleanup() {
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  docker rm -f "$container" > /dev/null 2>&1 || true
  rm -rf "$scratch"
}
trap cleanup EXIT

free_port() {
  node -e 'const s = require("net").createServer().listen(0, "127.0.0.1", () => { console.log(s.address().port); s.close(); })'
}

# Waits up to $2 seconds for a URL to answer 200.
wait_for() {
  for _ in $(seq "$2"); do
    curl -fsS -o /dev/null "$1" 2>/dev/null && return 0
    sleep 1
  done
  return 1
}

echo "backup: $BACKUP (taken $(cat "$BACKUP/TAKEN"))"

echo '1. the manifest'
(cd "$BACKUP" && sha256sum --quiet -c SHA256SUMS); check 'SHA256SUMS verifies' $?

echo '2. Postgres'
pg_port="$(free_port)"
docker run -d --rm --name "$container" -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=fdfpvboard \
  -p "127.0.0.1:$pg_port:5432" "$PG_IMAGE" > /dev/null
url="postgres://postgres:drill@127.0.0.1:$pg_port/fdfpvboard"
for _ in $(seq 60); do
  docker exec "$container" pg_isready -q -U postgres -d fdfpvboard 2>/dev/null \
    && psql -q "$url" -c 'select 1' > /dev/null 2>&1 && break
  sleep 1
done
# The container's own pg_restore: a newer client writes settings (SET
# transaction_timeout, from 17) that a 16 server refuses.
docker exec -i "$container" pg_restore --no-owner --no-acl --exit-on-error -U postgres -d fdfpvboard \
  < "$BACKUP/board.dump"; check 'board.dump restores' $?

# Rows per table as the dump carries them: the lines of each COPY block.
pg_restore --data-only -f - "$BACKUP/board.dump" | awk '
  /^COPY / { split($2, t, "."); name = t[2] == "" ? t[1] : t[2]; n = 0; inside = 1; next }
  inside && /^\\\.$/ { print name, n; inside = 0; next }
  inside { n++ }' | sort > "$scratch/dump-counts"
while read -r table rows; do
  got="$(psql -Atq "$url" -c "select count(*) from public.\"$table\"")"
  [[ $got == "$rows" ]]; check "board.$table has the dump's $rows rows" $? "restored $got"
done < "$scratch/dump-counts"
tracks_rows="$(awk '$1 == "tracks" { print $2 }' "$scratch/dump-counts")"
all_rows="$(awk '{ n += $2 } END { print n + 0 }' "$scratch/dump-counts")"
[[ $all_rows -gt 0 ]]; check 'the board backup is not empty' $? "$all_rows rows in $(wc -l < "$scratch/dump-counts") tables"

echo '3. the board on it'
board_port="$(free_port)"
(cd "$BOARD" && DATABASE_URL="$url" PORT="$board_port" BOARD_HOST=127.0.0.1 exec node src/server.js) \
  > "$scratch/board.log" 2>&1 &
pids+=($!)
wait_for "http://127.0.0.1:$board_port/api/health" 30; check 'the board starts' $?
health="$(curl -fsS "http://127.0.0.1:$board_port/api/health" || true)"
[[ $health == *'"store":"postgres"'* ]]; check 'it answers from Postgres' $? "$health"
listed="$(curl -fsS "http://127.0.0.1:$board_port/api/tracks" | node -e 'let s="";process.stdin.on("data",(d)=>s+=d).on("end",()=>console.log(JSON.parse(s).tracks.length))' || echo error)"
visible="$(psql -Atq "$url" -c 'select count(*) from public.tracks where not coalesce(hidden, false)' 2>/dev/null || echo "$tracks_rows")"
[[ $listed == "$visible" ]]; check 'it lists every track' $? "$listed listed, $visible in the table"

echo '4. the tracks server'
mkdir -p "$scratch/etc"
tar -xzf "$BACKUP/etc-fdfpv.tar.gz" -C "$scratch/etc"
gunzip -c "$BACKUP/tracks.db.gz" > "$scratch/tracks.db"
admin_secret="$(sed -n 's/^ADMIN_SECRET=//p' "$scratch/etc/fdfpv/tracks.env")"
accounts_secret="$(sed -n 's/^ACCOUNTS_SECRET=//p' "$scratch/etc/fdfpv/accounts.env")"
[[ -n $admin_secret && -n $accounts_secret ]]; check 'the secrets restore with the data' $?
counts() {
  node --disable-warning=ExperimentalWarning -e '
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(process.argv[1], { readOnly: true });
    const n = (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
    console.log(`${n("accounts")} ${n("tracks")}`);
  ' "$1"
}
read -r file_accounts file_tracks < <(counts "$scratch/tracks.db")
tracks_port="$(free_port)"
(cd "$ROOT" && TRACKS_DB="$scratch/tracks.db" PORT="$tracks_port" ADMIN_SECRET="$admin_secret" \
  ACCOUNTS_SECRET="$accounts_secret" exec node --disable-warning=ExperimentalWarning tracks-api/node.js) \
  > "$scratch/tracks.log" 2>&1 &
pids+=($!)
wait_for "http://127.0.0.1:$tracks_port/api/health" 30; check 'the tracks server starts on the restored file' $?
overview="$(curl -fsS -H "authorization: Bearer $admin_secret" "http://127.0.0.1:$tracks_port/api/admin/overview" || echo '{}')"
served="$(node -e 'const o = JSON.parse(process.argv[1]); console.log(`${o.accounts} ${o.tracks}`)' "$overview")"
[[ $served == "$file_accounts $file_tracks" ]]; check 'its admin overview counts every account and track' $? \
  "served $served, file $file_accounts $file_tracks"
[[ $file_accounts -gt 0 ]]; check 'the accounts backup is not empty' $? "$file_accounts accounts"
(cd "$ROOT" && ADMIN_SECRET="$admin_secret" node tracks-api/smoke.js "http://127.0.0.1:$tracks_port" > "$scratch/smoke.log" 2>&1)
rc=$?
check 'tracks-api/smoke.js passes against it' $rc "$(grep -cE '^ *(pass|ok)' "$scratch/smoke.log" || true) lines passed"
[[ $rc == 0 ]] || sed 's/^/    /' "$scratch/smoke.log" | grep -v -i secret | tail -20

echo '5. the other SQLite files'
for db in rooms metrics; do
  gunzip -c "$BACKUP/$db.db.gz" > "$scratch/$db.db"
  ok="$(node --disable-warning=ExperimentalWarning -e '
    const { DatabaseSync } = require("node:sqlite");
    console.log(new DatabaseSync(process.argv[1], { readOnly: true }).prepare("PRAGMA integrity_check").get().integrity_check);
  ' "$scratch/$db.db" 2>&1 || true)"
  [[ $ok == ok ]]; check "$db.db opens and is intact" $? "$ok"
done

echo
if (( failed )); then
  echo "$failed FAILED"
else
  echo 'restore drill: every step passed'
fi
exit "$failed"
