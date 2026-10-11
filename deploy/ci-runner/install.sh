#!/usr/bin/env bash
# install.sh: build the runner image and install or update the runner slots,
# on the owner's DESKTOP, as the desktop user (no root). Safe to rerun; run it
# from a checkout of the commit you want live.
#
# An update never kills a job. A slot whose container is idle (no
# Runner.Worker process) is replaced at once and comes back on the new image;
# a busy one finishes its job on the old image and its next cycle starts on
# the new one, because run-slot.sh starts every container from
# fdfpv-ci-runner:current.
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
SLOTS=(1 2)

docker build -t fdfpv-ci-runner:current "$HERE"

install -D -m 0755 "$HERE/run-slot.sh" "$HOME/.local/lib/fdfpv-ci/run-slot.sh"
install -D -m 0644 "$HERE/fdfpv-ci@.service" "$HOME/.config/systemd/user/fdfpv-ci@.service"
systemctl --user daemon-reload

for slot in "${SLOTS[@]}"; do
  name="fdfpv-ci-$slot"
  if docker container inspect "$name" >/dev/null 2>&1; then
    if docker top "$name" -eo args | grep -q Runner.Worker; then
      echo "install: $name is running a job; it takes the new image on its next cycle"
    else
      echo "install: $name is idle; replacing it"
      docker rm -f "$name" >/dev/null
    fi
  fi
  systemctl --user enable --now "fdfpv-ci@$slot.service"
done
