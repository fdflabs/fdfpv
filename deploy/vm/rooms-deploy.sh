#!/usr/bin/env bash
# rooms-deploy.sh: the rooms server's new version live without dropping a
# room (docs/ROOMS-DRAIN.md). Runs as root ON THE VM from
# /opt/fdfpv/deploy/vm, called by install.sh once deploy.sh has put the
# code and REVISION in /opt/fdfpv. Never waits for a room: the owner's
# rule is that deploys are never held.
#
#   1. whatever still runs on the port not live is the drain of the deploy
#      before this one: stopped, as a restart (1012); its pilots come back
#      through the live instance, which takes their rooms in,
#   2. that port's own copy of the code, /opt/fdfpv-rooms/<port>, from
#      /opt/fdfpv (fdfpv-rooms@.service),
#   3. fdfpv-rooms@<port> started, ROOMS_PEER the live one, and refused
#      unless its /v2/version names the commit in /opt/fdfpv/REVISION,
#   4. Caddy pointed at it (lib.sh apply_caddy) and the port written to
#      /etc/fdfpv/rooms-live; open room sockets stay on the old instance
#      (stream_close_delay),
#   5. the old instance told to drain (SIGUSR2): its rooms fly on and it
#      exits when they empty, or at its 20 minute cap. Enabled at boot: the
#      new one only.
#
# A failure before 4 stops the new instance and leaves the live one and
# Caddy as they were; so does a Caddyfile that does not validate in 4. A
# reload that fails after validating leaves /etc/caddy/Caddyfile naming
# the stopped port for the next deploy to rewrite, and fails loudly. The first run finds the one unit fdfpv-rooms on 8797
# and drains it the same way; the run after it removes that unit.
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

CODE=/opt/fdfpv
COPIES=/opt/fdfpv-rooms
UNITS=/etc/systemd/system
# How long the new instance has to answer its version: it restores nothing
# while the old one answers, so it is up in well under a second.
START_S=20

commit="$(cut -d' ' -f1 "$CODE/REVISION")"
live="$(rooms_live)"
live_unit="$(rooms_unit)"
next=$((8797 + 8798 - live))
next_unit="fdfpv-rooms@$next"

put "$HERE/fdfpv-rooms@.service" "$UNITS/fdfpv-rooms@.service" || true
put "$HERE/rooms-8797.env" /etc/fdfpv/rooms-8797.env || true
put "$HERE/rooms-8798.env" /etc/fdfpv/rooms-8798.env || true
systemctl daemon-reload

# 1.
if systemctl is-active -q "$next_unit"; then
  say "$next_unit still draining from the deploy before: stopped"
fi
systemctl stop "$next_unit"
if [[ $next == 8797 && -f $LEGACY_ROOMS_UNIT ]]; then
  say 'fdfpv-rooms, the one unit before fdfpv-rooms@: stopped and removed'
  systemctl disable -q --now fdfpv-rooms
  rm -f "$LEGACY_ROOMS_UNIT"
  rm -rf "$UNITS/fdfpv-rooms.service.d"
  systemctl daemon-reload
fi

# 2.
install -d -m 755 "$COPIES"
rm -rf "${COPIES:?}/$next"
cp -a "$CODE" "$COPIES/$next"

# 3.
trap 'echo "rooms-deploy.sh: failed; $next_unit stopped, $live_unit and Caddy as they were" >&2; systemctl stop "$next_unit"' EXIT
systemctl start "$next_unit"
up=0
for _ in $(seq 1 $((START_S * 2))); do
  if version="$(curl -fsS -m 2 "http://127.0.0.1:$next/v2/version" 2>/dev/null)" && [[ $version == *"\"$commit\""* ]]; then
    up=1
    break
  fi
  sleep 0.5
done
if [[ $up != 1 ]]; then
  echo "rooms-deploy.sh: $next_unit did not answer /v2/version with $commit in ${START_S} s" >&2
  journalctl -u "$next_unit" -n 20 --no-pager >&2
  exit 1
fi

# 4.
apply_caddy "$next"
printf '%s\n' "$next" > "$ROOMS_LIVE"
chmod 644 "$ROOMS_LIVE"
trap - EXIT

# 5.
if systemctl is-active -q "$live_unit"; then
  if [[ $live_unit == fdfpv-rooms ]]; then
    # The one unit restarts on any exit (Restart=always), and a drain
    # ends in one: it would come back as a third version.
    install -D -m 644 /dev/stdin "$UNITS/fdfpv-rooms.service.d/drain.conf" <<< $'[Service]\nRestart=no'
    systemctl daemon-reload
  fi
  systemctl kill -s SIGUSR2 "$live_unit"
  say "$live_unit draining"
fi
systemctl disable -q "$live_unit"
systemctl enable -q "$next_unit"
say "$next_unit live on $next, $commit"
