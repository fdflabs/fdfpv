#!/usr/bin/env bash
# board-install.sh: the board's config from deploy/vm/, installed and
# applied. Runs as root ON THE VM from /opt/fdfpv/deploy/vm, called by
# deploy-board.sh after the board's code is in /opt/fdfpv-board and its
# env file is in /etc/fdfpv/board.env. Safe to rerun.
#
# It restarts the board and nothing else. fdfpv-rooms and fdfpv-tracks are
# install.sh's, and a Caddy reload is graceful, so pilots flying in a room
# stay connected through a board deploy.
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
# shellcheck source=lib.sh
source "$HERE/lib.sh"

if [[ ! -f /etc/fdfpv/board.env ]]; then
  echo 'board-install: /etc/fdfpv/board.env is missing; deploy-board.sh makes it' >&2
  exit 1
fi
if [[ ! -f /opt/fdfpv-board/src/server.js || ! -f /opt/fdfpv-board/vendor/fdfpv/src/game/verify.js ]]; then
  echo 'board-install: the board is not in /opt/fdfpv-board, vendor/fdfpv included' >&2
  exit 1
fi

# The role is the service user's name, so peer authentication over the
# socket needs no password; it owns its database, so the board's own
# schema.sql creates the tables at start.
pgq() { runuser -u postgres -- psql -qtAX -c "$1"; }
if [[ $(pgq "SELECT 1 FROM pg_roles WHERE rolname = 'fdfpv-board'") != 1 ]]; then
  runuser -u postgres -- createuser fdfpv-board
  say 'Postgres: role fdfpv-board'
fi
if [[ $(pgq "SELECT 1 FROM pg_database WHERE datname = 'fdfpvboard'") != 1 ]]; then
  runuser -u postgres -- createdb -O fdfpv-board fdfpvboard
  say 'Postgres: database fdfpvboard'
fi

put "$HERE/fdfpv-board.service" /etc/systemd/system/fdfpv-board.service || true
systemctl daemon-reload
systemctl enable -q fdfpv-board
systemctl restart fdfpv-board
apply_caddy

for unit in postgresql fdfpv-board caddy; do
  say "$unit $(systemctl is-active "$unit")"
done
