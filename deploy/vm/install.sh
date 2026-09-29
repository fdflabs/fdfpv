#!/usr/bin/env bash
# install.sh: the VM's config from deploy/vm/, installed and applied. Runs as
# root ON THE VM from /opt/fdfpv/deploy/vm, called by deploy.sh after the
# code is in place. Safe to rerun.
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

HERE="$(cd "$(dirname "$0")" && pwd)"

say() { printf 'install: %s\n' "$*"; }

# Copies src to dst when they differ; true when it did.
put() {
  local src="$1" dst="$2"
  if [[ -f $dst ]] && cmp -s "$src" "$dst"; then
    return 1
  fi
  install -D -m 644 "$src" "$dst"
  say "installed $dst"
}

if put "$HERE/journald.conf" /etc/systemd/journald.conf.d/fdfpv.conf; then
  systemctl restart systemd-journald
fi

put "$HERE/fdfpv-rooms.service" /etc/systemd/system/fdfpv-rooms.service || true
put "$HERE/fdfpv-tracks.service" /etc/systemd/system/fdfpv-tracks.service || true
systemctl daemon-reload

caddy validate --config "$HERE/Caddyfile" --adapter caddyfile >/dev/null 2>&1 || {
  echo 'install: the Caddyfile does not validate, Caddy left as it was' >&2
  caddy validate --config "$HERE/Caddyfile" --adapter caddyfile >&2
  exit 1
}
caddy_changed=0
if put "$HERE/Caddyfile" /etc/caddy/Caddyfile; then
  caddy_changed=1
fi

systemctl enable -q fdfpv-rooms fdfpv-tracks caddy
systemctl restart fdfpv-rooms fdfpv-tracks
if ! systemctl is-active -q caddy; then
  systemctl start caddy
elif [[ $caddy_changed == 1 ]]; then
  systemctl reload caddy
fi

for unit in fdfpv-rooms fdfpv-tracks caddy; do
  say "$unit $(systemctl is-active "$unit")"
done
