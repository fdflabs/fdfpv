#!/usr/bin/env bash
# backup.sh: pull tonight's backup of the VM's state to this desktop.
#
#   deploy/vm/backup.sh            (fdfpv-backup.timer runs it nightly)
#
# Runs on the owner's desktop with the deploy's SSH access (FDFPV_VM_KEY,
# default ~/.ssh/fdfpv-oracle; FDFPV_VM, default opc@129.151.39.48). The VM
# half, backup-remote.sh, is streamed to `sudo bash -s` and answers with a
# tar of the Postgres dump, the SQLite snapshots and /etc/fdfpv (what each
# is and why: that file). Nothing is installed on the VM.
#
# Into FDFPV_BACKUP_DIR (default ~/fdfpv-backups, mode 700):
#   daily/<UTC date>/   board.dump, tracks.db.gz, rooms.db.gz, metrics.db.gz,
#                       etc-fdfpv.tar.gz, TAKEN, REVISIONS, SHA256SUMS
#   weekly/<UTC date>/  a hard linked copy of the first daily of each ISO week
#   latest              a link to the newest daily
#   last-success        the UTC time of the last backup that passed its checks,
#                       read by the monitor for the backup's freshness
# Kept: the newest 14 dailies and the newest 8 weeklies.
#
# A backup is checked before it counts, and a failed check leaves the day's
# directory as <date>.failed and exits non zero:
#   - pg_restore --list reads the whole dump's table of contents,
#   - PRAGMA integrity_check on each SQLite file says ok,
#   - gzip -t on every gzip, sha256sum -c on the manifest written here.
# The restore drill (restore-drill.sh) is the stronger check: the backup
# restored and served.
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

VM="${FDFPV_VM:-opc@129.151.39.48}"
KEY="${FDFPV_VM_KEY:-$HOME/.ssh/fdfpv-oracle}"
DEST="${FDFPV_BACKUP_DIR:-$HOME/fdfpv-backups}"
HERE="$(cd "$(dirname "$0")" && pwd)"
DAILY_KEEP=14
WEEKLY_KEEP=8

day="$(date -u +%Y-%m-%d)"
dir="$DEST/daily/$day"
work="$dir.partial"
mkdir -p "$DEST/daily" "$DEST/weekly"
chmod 700 "$DEST"
rm -rf "$work"
mkdir "$work"

fail() {
  echo "backup.sh: $*" >&2
  rm -rf "$dir.failed"
  mv "$work" "$dir.failed"
  exit 1
}

ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=20 "$VM" 'sudo bash -s' < "$HERE/backup-remote.sh" \
  | tar -x -C "$work" || fail "the VM half failed"

cd "$work"
for f in board.dump tracks.db rooms.db metrics.db etc-fdfpv.tar TAKEN REVISIONS; do
  [[ -s $f ]] || fail "$f is missing or empty"
done

pg_restore --list board.dump > /dev/null || fail 'board.dump does not read back'
for db in tracks.db rooms.db metrics.db; do
  ok="$(node --disable-warning=ExperimentalWarning -e '
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(process.argv[1], { readOnly: true });
    console.log(db.prepare("PRAGMA integrity_check").get().integrity_check);
  ' "$db")" || fail "$db does not open"
  [[ $ok == ok ]] || fail "$db integrity_check: $ok"
done

gzip -9 tracks.db rooms.db metrics.db etc-fdfpv.tar
gzip -t ./*.gz || fail 'a gzip does not test'
sha256sum board.dump ./*.gz TAKEN REVISIONS > SHA256SUMS
sha256sum --quiet -c SHA256SUMS || fail 'SHA256SUMS does not verify'
cd "$DEST"

rm -rf "$dir"
mv "$work" "$dir"
ln -sfn "daily/$day" "$DEST/latest"

week="$(date -u -d "$day" +%G-W%V)"
if ! grep -qx "$week" <(for w in "$DEST"/weekly/*/; do [[ -d $w ]] && date -u -d "$(basename "$w")" +%G-W%V; done); then
  cp -al "$dir" "$DEST/weekly/$day"
fi

# Dated names sort by age; failed and partial ones go with the dailies.
prune() {
  local keep="$1"; shift
  local all=("$@")
  local n=${#all[@]}
  if (( n > keep )); then
    rm -rf -- "${all[@]:0:n-keep}"
  fi
}
shopt -s nullglob
prune "$DAILY_KEEP" "$DEST"/daily/????-??-??
prune "$WEEKLY_KEEP" "$DEST"/weekly/????-??-??
for stale in "$DEST"/daily/*.failed "$DEST"/daily/*.partial; do
  [[ $stale == "$DEST/daily/$day.failed" ]] || rm -rf -- "$stale"
done

date -u +%Y-%m-%dT%H:%M:%SZ > "$DEST/last-success"
echo "backup.sh: $dir ($(du -sh "$dir" | cut -f1))"
