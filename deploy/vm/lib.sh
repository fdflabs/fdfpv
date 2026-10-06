#!/usr/bin/env bash
# lib.sh: what install.sh and board-install.sh share, sourced by both. Each
# owns its own servers and restarts only those; the Caddyfile is shared, so
# both apply it the same way here.
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

say() { printf '%s: %s\n' "$(basename "$0" .sh)" "$*"; }

# Copies src to dst when they differ; true when it did.
put() {
  local src="$1" dst="$2"
  if [[ -f $dst ]] && cmp -s "$src" "$dst"; then
    return 1
  fi
  install -D -m 644 "$src" "$dst"
  say "installed $dst"
}

# Validates the Caddyfile beside this file and installs it when it differs
# from the live one, then starts Caddy or reloads it. A reload is graceful:
# connections already open, WebSockets included, stay up. A Caddyfile that
# does not validate leaves the live one in place and fails the script.
apply_caddy() {
  local here
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if ! caddy validate --config "$here/Caddyfile" --adapter caddyfile >/dev/null 2>&1; then
    echo "$(basename "$0"): the Caddyfile does not validate, Caddy left as it was" >&2
    caddy validate --config "$here/Caddyfile" --adapter caddyfile >&2
    exit 1
  fi
  local changed=0
  if put "$here/Caddyfile" /etc/caddy/Caddyfile; then
    changed=1
  fi
  systemctl enable -q caddy
  if ! systemctl is-active -q caddy; then
    systemctl start caddy
  elif [[ $changed == 1 ]]; then
    systemctl reload caddy
  fi
}
