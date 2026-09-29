#!/usr/bin/env bash
# deploy.sh: put both servers on the VM, or update them. Safe to rerun.
#
#   deploy/vm/deploy.sh /path/outside/the/repo/ADMIN-SECRET.txt
#
# Run from the owner's desktop, the only place the VM's SSH key lives
# (FDFPV_VM_KEY, default ~/.ssh/fdfpv-oracle; FDFPV_VM, default
# opc@129.151.39.48). Each step is skipped or a no-op when already done:
#
#   1. host.sh as root on the VM: Node 24, Caddy, dnf-automatic, firewalld,
#      the service users, /opt/fdfpv,
#   2. refuses to go on if the VM's sshd allows passwords,
#   3. rsyncs what the servers import (package*.json, src/, configs/,
#      edge/, tracks-api/, deploy/vm/) into /opt/fdfpv, and npm ci there,
#   4. the first time only, generates the tracks admin secret ON THE VM
#      into /etc/fdfpv/tracks.env (root, mode 600) and writes the same
#      value to the file named above (mode 600, first line the secret,
#      second a dated note). It is never printed. Delete the env file on
#      the VM and rerun to rotate it.
#   5. install.sh as root on the VM: the units, the journald cap and the
#      Caddyfile, then restarts both servers (rooms clients get 1012 and
#      reconnect into their seats) and reloads Caddy,
#   6. checks both servers answer through Caddy, over HTTPS.
#
# This file is part of WebFPVSimulator.
#
# WebFPVSimulator is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or (at
# your option) any later version.
#
# WebFPVSimulator is distributed in the hope that it will be useful, but
# WITHOUT ANY WARRANTY, without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
# General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.

set -euo pipefail

SECRET_FILE="${1:-}"
VM="${FDFPV_VM:-opc@129.151.39.48}"
KEY="${FDFPV_VM_KEY:-$HOME/.ssh/fdfpv-oracle}"
ORIGIN="${FDFPV_ORIGIN:-https://129.151.39.48}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

if [ -z "$SECRET_FILE" ]; then
  echo "usage: deploy/vm/deploy.sh /path/to/ADMIN-SECRET.txt" >&2
  exit 2
fi

remote() {
  ssh -i "$KEY" -o BatchMode=yes "$VM" "$@"
}

echo '1. the host'
remote 'sudo bash -s' < "$ROOT/deploy/vm/host.sh"

echo '2. ssh is key only'
if ! remote 'sudo sshd -T' | grep -qx 'passwordauthentication no'; then
  echo 'deploy.sh: the VM sshd allows password login; fix that first' >&2
  exit 1
fi

echo '3. the code'
cd "$ROOT"
rsync -a --delete --relative -e "ssh -i $KEY -o BatchMode=yes" \
  --exclude '.wrangler/' --exclude '*.db' --exclude '*.db-*' --exclude '.dev.vars' \
  package.json package-lock.json src configs edge tracks-api deploy/vm \
  "$VM:/opt/fdfpv/"
remote 'cd /opt/fdfpv && npm ci --omit=dev --no-audit --no-fund --loglevel=error'

echo '4. the admin secret'
if remote 'sudo test -f /etc/fdfpv/tracks.env'; then
  echo '   already on the VM, left as it is'
else
  if [ -e "$SECRET_FILE" ]; then
    mv "$SECRET_FILE" "$SECRET_FILE.old"
    echo "   the previous $SECRET_FILE is now $SECRET_FILE.old"
  fi
  (
    umask 077
    remote "sudo sh -c 'umask 077; s=\$(openssl rand -base64 32); printf \"ADMIN_SECRET=%s\\n\" \"\$s\" > /etc/fdfpv/tracks.env; printf \"%s\\n\" \"\$s\"'" > "$SECRET_FILE"
    printf '# VM tracks server admin secret (first line), generated on the VM %s. The Workers secret it replaced is retired.\n' "$(date -u +%Y-%m-%d)" >> "$SECRET_FILE"
  )
  chmod 600 "$SECRET_FILE"
  echo "   generated on the VM and written to $SECRET_FILE (mode 600)"
fi

echo '5. units, journald, Caddy, restart'
remote 'sudo bash /opt/fdfpv/deploy/vm/install.sh'

echo '6. both servers, through Caddy'
sleep 2
curl -fsS "$ORIGIN/api/health" && echo
curl -fsS "$ORIGIN/"
