#!/usr/bin/env bash
# install.sh: the VM's config from deploy/vm/, installed and applied. Runs as
# root ON THE VM from /opt/fdfpv/deploy/vm, called by deploy.sh after the
# code is in place. Safe to rerun.
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

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
source "$HERE/lib.sh"

if put "$HERE/journald.conf" /etc/systemd/journald.conf.d/fdfpv.conf; then
  systemctl restart systemd-journald
fi

put "$HERE/fdfpv-rooms.service" /etc/systemd/system/fdfpv-rooms.service || true
put "$HERE/fdfpv-tracks.service" /etc/systemd/system/fdfpv-tracks.service || true
put "$HERE/fdfpv-metrics.service" /etc/systemd/system/fdfpv-metrics.service || true
put "$HERE/fdfpv-metrics.timer" /etc/systemd/system/fdfpv-metrics.timer || true
systemctl daemon-reload

# Validated before anything restarts, so a bad Caddyfile stops the deploy
# with both servers still as they were.
caddy validate --config "$HERE/Caddyfile" --adapter caddyfile >/dev/null

systemctl enable -q fdfpv-rooms fdfpv-tracks
systemctl restart fdfpv-rooms fdfpv-tracks
apply_caddy
# The admin page's history (tracks-api/collect.js); a oneshot a minute,
# so nothing to restart: the next run is the new code.
systemctl enable --now -q fdfpv-metrics.timer

for unit in fdfpv-rooms fdfpv-tracks fdfpv-metrics.timer caddy; do
  say "$unit $(systemctl is-active "$unit")"
done
