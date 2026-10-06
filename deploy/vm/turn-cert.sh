#!/usr/bin/env bash
# turn-cert.sh: hand Caddy's certificate for the VM's address to coturn, for
# TURN over TLS on 5349. Runs as root from fdfpv-turn-cert.service, on its
# timer. Caddy keeps its certificates where only it can read them and renews
# this one about every three days (Let's Encrypt's six day "shortlived"
# profile for an address, deploy/vm/Caddyfile), so the newest is copied to
# /etc/coturn/tls (root:coturn, 0640) whenever it differs, and coturn is
# told: a reload (SIGUSR2, coturn's own certificate reload) when it had one
# already, a restart for the first, which is when its TLS listener opens.
#
#   turn-cert.sh 129.151.39.48
#
# A certificate that has expired or does not match its key is refused, and
# coturn keeps what it has.
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

ADDR="${1:?usage: turn-cert.sh <address>}"
STORE=/var/lib/caddy/.local/share/caddy/certificates
DEST=/etc/coturn/tls

# Newest first, whichever issuer Caddy used (Let's Encrypt, or ZeroSSL when
# it falls back).
crt="$(find "$STORE" -path "*/$ADDR/$ADDR.crt" -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -n1 | cut -d' ' -f2-)"
if [[ -z $crt ]]; then
  echo "turn-cert: Caddy has no certificate for $ADDR yet; TURN over TLS waits for it"
  exit 0
fi
key="${crt%.crt}.key"
if ! openssl x509 -checkend 0 -noout -in "$crt" >/dev/null; then
  echo "turn-cert: $crt has expired; left coturn as it was" >&2
  exit 1
fi
if [[ "$(openssl x509 -noout -pubkey -in "$crt" | sha256sum)" != "$(openssl pkey -pubout -in "$key" | sha256sum)" ]]; then
  echo "turn-cert: $crt does not match its key; left coturn as it was" >&2
  exit 1
fi
if cmp -s "$crt" "$DEST/cert.pem" && cmp -s "$key" "$DEST/key.pem"; then
  exit 0
fi
first=0
if [[ ! -f $DEST/cert.pem ]]; then
  first=1
fi
install -d -m 750 -o root -g coturn "$DEST"
install -m 640 -o root -g coturn "$key" "$DEST/key.pem"
install -m 640 -o root -g coturn "$crt" "$DEST/cert.pem"
echo "turn-cert: copied the certificate for $ADDR, valid until $(openssl x509 -enddate -noout -in "$crt" | cut -d= -f2)"
if systemctl is-active -q coturn; then
  if [[ $first == 1 ]]; then
    systemctl restart coturn
  else
    systemctl reload coturn
  fi
fi
