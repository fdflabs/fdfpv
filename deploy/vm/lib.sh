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

# What rooms-deploy.sh keeps: the port Caddy sends pilots to, and the one
# rooms unit there was before its first run.
ROOMS_LIVE=/etc/fdfpv/rooms-live
LEGACY_ROOMS_UNIT=/etc/systemd/system/fdfpv-rooms.service

# The live rooms port, 8797 or 8798: ROOMS_LIVE's, or 8797 before the first
# rooms-deploy.sh, where fdfpv-rooms listened.
rooms_live() {
  local port=8797
  if [[ -f $ROOMS_LIVE ]]; then
    port="$(<"$ROOMS_LIVE")"
  fi
  if [[ $port != 8797 && $port != 8798 ]]; then
    echo "$(basename "$0"): $ROOMS_LIVE says '$port', not 8797 or 8798" >&2
    exit 1
  fi
  echo "$port"
}

# The unit serving the live port: fdfpv-rooms@<port>, or the one unit
# fdfpv-rooms before the first rooms-deploy.sh.
rooms_unit() {
  if [[ ! -f $ROOMS_LIVE && -f $LEGACY_ROOMS_UNIT ]]; then
    echo fdfpv-rooms
  else
    echo "fdfpv-rooms@$(rooms_live)"
  fi
}

# Validates the Caddyfile beside this file, its rooms upstream on `port`
# (the live one when not given), and installs it when it differs from the
# live one, then starts Caddy or reloads it. A reload closes the
# WebSockets the old config proxied unless their reverse_proxy has
# stream_close_delay, which the rooms' has (Caddyfile). A Caddyfile that
# does not validate leaves the live one in place and fails the script.
apply_caddy() {
  local here port rendered
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  port="${1:-$(rooms_live)}"
  # The rooms' upstream is the file's one 127.0.0.1:8797; a second would
  # be moved with it.
  if [[ $(grep -c '127\.0\.0\.1:8797' "$here/Caddyfile") != 1 ]]; then
    echo "$(basename "$0"): the Caddyfile names 127.0.0.1:8797 other than once, Caddy left as it was" >&2
    exit 1
  fi
  rendered="$(mktemp)"
  sed "s/127\.0\.0\.1:8797/127.0.0.1:$port/" "$here/Caddyfile" > "$rendered"
  if ! caddy validate --config "$rendered" --adapter caddyfile >/dev/null 2>&1; then
    echo "$(basename "$0"): the Caddyfile does not validate, Caddy left as it was" >&2
    caddy validate --config "$rendered" --adapter caddyfile >&2
    rm -f "$rendered"
    exit 1
  fi
  local changed=0
  if put "$rendered" /etc/caddy/Caddyfile; then
    changed=1
  fi
  rm -f "$rendered"
  systemctl enable -q caddy
  if ! systemctl is-active -q caddy; then
    systemctl start caddy
  elif [[ $changed == 1 ]]; then
    systemctl reload caddy
  fi
}
