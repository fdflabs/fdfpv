#!/usr/bin/env bash
# deploy-board.sh: put the board on the VM, or update it. Safe to rerun.
#
#   deploy/vm/deploy-board.sh /path/outside/the/repo/BOARD-ADMIN.txt [BOARD_CHECKOUT]
#
# BOARD_CHECKOUT is a checkout of fdflabs/fdfpv-leaderboard with its
# vendor/fdfpv submodule initialised, ../fdfpv-leaderboard beside this
# repository by default. Run from the owner's desktop, like deploy.sh
# (FDFPV_VM_KEY, FDFPV_VM, FDFPV_ORIGIN are read the same way). Each step
# is skipped or a no-op when already done:
#
#   1. host.sh as root on the VM (Postgres and the fdfpv-board user
#      included); it restarts nothing,
#   2. refuses to go on if the VM's sshd allows passwords,
#   3. refuses a checkout with uncommitted changes or a vendor/fdfpv that
#      is not at its pinned commit, so the commit written to
#      /opt/fdfpv-board/REVISION is exactly what runs; rsyncs what the
#      board imports into /opt/fdfpv-board, and npm ci there,
#   4. rsyncs this repository's deploy/vm into /opt/fdfpv/deploy/vm, the
#      config only: the rooms and tracks code is deploy.sh's,
#   5. the first time only, makes the admin file named above (mode 600:
#      the sign in address, then the password, then a dated note),
#   6. the first time only, makes /etc/fdfpv/board.env (root, mode 600):
#      BUGS_TOKEN, BOARD_ADMIN_TOKEN and BOARD_SESSION_SECRET generated on
#      the VM and never printed, and BOARD_ADMINS, the scrypt record of the
#      admin file's password, hashed here. Delete the env file on the VM and
#      rerun to rotate all of them,
#   7. board-install.sh as root on the VM: the database, the unit and the
#      Caddyfile, then restarts the board alone and reloads Caddy,
#   8. checks the board answers through Caddy, over HTTPS, and that its
#      GET /api/version names the commit from step 3 (the board reads
#      REVISION as it starts; fdflabs/fdfpv-leaderboard#9 added the route,
#      so a board checkout from before it fails here, after its restart).
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

ADMIN_FILE="${1:-}"
VM="${FDFPV_VM:-opc@129.151.39.48}"
KEY="${FDFPV_VM_KEY:-$HOME/.ssh/fdfpv-oracle}"
ORIGIN="${FDFPV_ORIGIN:-https://129.151.39.48}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BOARD="$(cd "${2:-$ROOT/../fdfpv-leaderboard}" && pwd)"

if [ -z "$ADMIN_FILE" ]; then
  echo "usage: deploy/vm/deploy-board.sh /path/to/BOARD-ADMIN.txt [board checkout]" >&2
  exit 2
fi

remote() {
  ssh -i "$KEY" -o BatchMode=yes "$VM" "$@"
}

# The VM has one core and the rooms server shares it with pilots in the
# air, so the package installs and npm run niced: slower for the deploy,
# no later for a relayed frame.
echo '1. the host'
remote 'sudo nice -n 10 bash -s' < "$ROOT/deploy/vm/host.sh"

echo '2. ssh is key only'
if ! remote 'sudo sshd -T' | grep -qx 'passwordauthentication no'; then
  echo 'deploy-board.sh: the VM sshd allows password login; fix that first' >&2
  exit 1
fi

echo '3. the board'
if [ -n "$(git -C "$BOARD" status --porcelain --untracked-files=no)" ]; then
  echo "deploy-board.sh: $BOARD has uncommitted changes; commit them first" >&2
  exit 1
fi
pin="$(git -C "$BOARD" submodule status vendor/fdfpv)"
case "$pin" in
  ' '*) ;;
  *)
    echo "deploy-board.sh: vendor/fdfpv is not at its pinned commit ($pin); git submodule update --init vendor/fdfpv" >&2
    exit 1
    ;;
esac
revision="$(git -C "$BOARD" rev-parse HEAD) vendor/fdfpv $(git -C "$BOARD/vendor/fdfpv" rev-parse HEAD)"
cd "$BOARD"
# What src/server.js imports and serves, and the simulator modules the lap
# check and the signature check import from vendor/fdfpv (its package.json
# says the modules are ES modules). Not the simulator's assets or WASM.
rsync -a --delete --relative -e "ssh -i $KEY -o BatchMode=yes" \
  package.json package-lock.json schema.sql src public \
  vendor/fdfpv/package.json vendor/fdfpv/src vendor/fdfpv/configs vendor/fdfpv/tracks-api \
  "$VM:/opt/fdfpv-board/"
printf '%s\n' "$revision" | remote 'cat > /opt/fdfpv-board/REVISION'
remote 'cd /opt/fdfpv-board && nice -n 10 npm ci --omit=dev --no-audit --no-fund --loglevel=error'
echo "   $revision"

echo '4. the VM config'
cd "$ROOT"
rsync -a --delete --relative -e "ssh -i $KEY -o BatchMode=yes" deploy/vm "$VM:/opt/fdfpv/"

echo '5. the admin file'
if [ -e "$ADMIN_FILE" ]; then
  echo '   already here, left as it is'
else
  (
    umask 077
    {
      printf 'owner@fdfpv.local\n'
      openssl rand -base64 18
      printf '# FDFPV board admin: sign in address (first line) and password (second), generated %s. Admin, on https://129.151.39.48/board/.\n' "$(date -u +%Y-%m-%d)"
    } > "$ADMIN_FILE"
  )
  echo "   written to $ADMIN_FILE (mode 600)"
fi

echo '6. the board secrets'
if remote 'sudo test -f /etc/fdfpv/board.env'; then
  echo '   already on the VM, left as it is'
else
  record="$(sed -n 2p "$ADMIN_FILE" | tr -d '\n' | node "$BOARD/scripts/admin-hash.js" "$(sed -n 1p "$ADMIN_FILE")")"
  # The record goes over stdin, not the command line, so it is in no
  # process list on either machine.
  printf '%s\n' "$record" | remote "sudo sh -c 'umask 077; r=\$(cat); {
    printf \"BUGS_TOKEN=%s\\n\" \"\$(openssl rand -hex 24)\";
    printf \"BOARD_ADMIN_TOKEN=%s\\n\" \"\$(openssl rand -hex 24)\";
    printf \"BOARD_SESSION_SECRET=%s\\n\" \"\$(openssl rand -hex 32)\";
    printf \"BOARD_ADMINS=%s\\n\" \"\$r\";
  } > /etc/fdfpv/board.env'"
  echo '   generated on the VM into /etc/fdfpv/board.env (root, mode 600)'
fi

echo '7. database, unit, Caddy, restart the board'
remote 'sudo bash /opt/fdfpv/deploy/vm/board-install.sh'

echo '8. the board, through Caddy'
sleep 2
curl -fsS "$ORIGIN/board/api/health" && echo
version="$(curl -fsS "$ORIGIN/board/api/version")"
echo "   /board/api/version $version"
case "$version" in
  *"\"${revision%% *}\""*) ;;
  *)
    echo "deploy-board.sh: /board/api/version does not name ${revision%% *}; the board is not running this deploy" >&2
    exit 1
    ;;
esac
