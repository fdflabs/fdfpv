#!/usr/bin/env bash
# run-slot.sh <slot>: one cycle of one runner slot, run by fdfpv-ci@<slot>.service
# (a systemd --user unit on the owner's desktop, README.md). Mints a
# registration token on the host, starts a fresh container with it on stdin,
# and returns when that container's one job is over; the unit's Restart=always
# starts the next cycle.
#
# The token is minted here, with the host's gh login, so no durable
# credential is ever inside a container. A registration token can only
# register runners on fdflabs/fdfpv and expires in an hour.
#
# Limits, measured in this image over the full `node` job (README.md
# "Measurements"); keep the numbers beside them in step:
#   memory  4750m: peak 4.01 GiB (version:reload) x1.15, no swap
#   cpus    10, a CFS quota and no cpuset. The job is Chrome rendering with
#           SwiftShader, which spreads over every core it may use: results:layout
#           burned 905 cpu-s in 98 s unlimited, 107 s at 10, 164 s pinned to
#           five P-cores, 264 s pinned to the 2P+3E mix first planned. Pinned,
#           the slot also competes for those exact cores with whatever else the
#           desktop is running.
#           midair:harness and tag:harness size their workers from
#           os.availableParallelism(), which ignores the quota and sees 20, and
#           take half: 10 workers, the quota. Change one, change the other.
#   pids    530: peak 263 x2
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

slot="${1:?usage: run-slot.sh <slot>}"
name="fdfpv-ci-$slot"
mem=4750m

# A container from an earlier cycle can outlive this unit (a stop of the unit
# alone, a restart of the user manager). Never start a second one under the
# same name beside it, and never kill it: it may be mid-job. Wait for it.
if docker container inspect "$name" >/dev/null 2>&1; then
  echo "run-slot: $name is still running; waiting for its job to end"
  exec docker wait "$name"
fi

if ! token="$(gh api -X POST repos/fdflabs/fdfpv/actions/runners/registration-token -q .token)" \
   || [[ -z "$token" ]]; then
  # A minute between tries, so an outage costs one API call a minute rather
  # than one every RestartSec.
  echo "run-slot: could not mint a registration token; retrying in 60 s" >&2
  sleep 60
  exit 1
fi

exec docker run --rm -i --name "$name" --init \
  --memory "$mem" --memory-swap "$mem" \
  --cpus 10 --pids-limit 530 \
  --cap-drop ALL --security-opt no-new-privileges \
  -e RUNNER_NAME="$name" \
  -v fdfpv-ci-npm:/home/runner/.npm \
  fdfpv-ci-runner:current <<<"$token"
