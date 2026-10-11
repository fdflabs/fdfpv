#!/usr/bin/env bash
# entrypoint.sh: register one ephemeral runner, take one job, exit. Runs as
# uid 1001 inside the image of deploy/ci-runner/Dockerfile, started by
# run-slot.sh.
#
# The registration token is read from stdin, never from the environment: a
# variable here would sit in /proc/1/environ for the whole job, where any step
# could read it. It reaches config.sh's argv during registration, before any
# job exists, and the shell that held it is replaced by run.sh. The runner's
# own session credential (.credentials) is readable by the job, as on any
# self-hosted runner; it is good for this one ephemeral registration only.
#
# Labels: only `fdfpv-ci` (--no-default-labels), so a workflow that asks for
# `self-hosted` or `linux` can never land here; checks.yml names fdfpv-ci for
# the `node` job and nothing else does.
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
: "${RUNNER_NAME:?run-slot.sh sets RUNNER_NAME, e.g. fdfpv-ci-1}"

IFS= read -r token || true
if [[ -z "$token" ]]; then
  echo "entrypoint: no registration token on stdin" >&2
  exit 1
fi

cd /home/runner
# --replace: the slot's name is stable, so a registration a killed container
# left behind is superseded here. Nothing ever deletes offline runners: a
# sibling is offline between config.sh and its session, and BurnLedger's pool
# emptied itself on 2026-09-12 by pruning exactly that.
./config.sh --unattended --ephemeral --replace --disableupdate \
  --url https://github.com/fdflabs/fdfpv --token "$token" \
  --name "$RUNNER_NAME" --no-default-labels --labels fdfpv-ci --work _work
unset token
exec ./run.sh
