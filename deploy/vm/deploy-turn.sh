#!/usr/bin/env bash
# deploy-turn.sh: voice chat's TURN relay (coturn) on the VM. Safe to rerun.
#
#   deploy/vm/deploy-turn.sh
#
# Run from the owner's desktop, after deploy.sh has put a rooms server that
# knows voice on the VM (FDFPV_VM_KEY, default ~/.ssh/fdfpv-oracle; FDFPV_VM,
# default opc@129.151.39.48; FDFPV_ADDRESS, default 129.151.39.48):
#
#   1. rsyncs this directory into /opt/fdfpv/deploy/vm,
#   2. turn-install.sh as root on the VM: coturn, the secret (made there,
#      the first time, never printed), its config, the certificate timer,
#      firewalld, and a restart of the rooms server when the secret is new,
#   3. checks that STUN answers on 3478 over UDP from here, which is the
#      Oracle security list letting it through as much as coturn running.
#
# Voice works without this, peer to peer through public STUN; this adds the
# relay for the pilots whose networks need it. Oracle's security list must
# allow UDP 3478, TCP 3478, TCP 5349 and UDP 49160 to 49200 (README.md).
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

VM="${FDFPV_VM:-opc@129.151.39.48}"
KEY="${FDFPV_VM_KEY:-$HOME/.ssh/fdfpv-oracle}"
ADDRESS="${FDFPV_ADDRESS:-129.151.39.48}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

remote() {
  ssh -i "$KEY" -o BatchMode=yes "$VM" "$@"
}

echo '1. the deploy files'
cd "$ROOT"
rsync -a --relative -e "ssh -i $KEY -o BatchMode=yes" deploy/vm "$VM:/opt/fdfpv/"

echo '2. coturn'
remote "sudo bash /opt/fdfpv/deploy/vm/turn-install.sh $ADDRESS"

echo '3. STUN from here'
sleep 2
node "$ROOT/scripts/stun-check.js" "$ADDRESS" 3478
