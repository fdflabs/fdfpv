#!/usr/bin/env bash
# turn-install.sh: coturn, voice chat's TURN relay, on the VM. Runs as root
# ON THE VM from /opt/fdfpv/deploy/vm, called by deploy-turn.sh with the
# VM's public address. Safe to rerun: each step checks before it changes
# anything, and a server is restarted only when a file it reads at start is
# newer than the server, so a run that stopped halfway is finished by the
# next.
#
#   1. coturn from EPEL (Oracle's own EPEL build, oracle-epel-release-el9),
#   2. the first time only, /etc/fdfpv/turn.env (root, mode 600):
#      TURN_SECRET, 32 random bytes made here and never printed or copied
#      off the VM, and TURN_URLS, the relay's three addresses, which the
#      rooms server hands to pilots with their credentials,
#   3. /etc/coturn/turnserver.conf (root:coturn, 0640): turnserver.conf
#      beside this file, plus external-ip (public/private, since Oracle
#      maps the public address to the VM's private one) and the secret,
#   4. the TLS certificate: fdfpv-turn-cert.timer copies Caddy's for the
#      address to /etc/coturn/tls every six hours, and reloads coturn when
#      it changed (turn-cert.sh),
#   5. firewalld: 3478 UDP and TCP, 5349 TCP, 49160 to 49200 UDP,
#   6. coturn enabled and running, with the drop-in beside this file,
#   7. the rooms server restarted when turn.env is newer than it, so it
#      reads it (fdfpv-rooms.service's EnvironmentFile; its pilots
#      reconnect into their seats).
#
# Oracle's security list must allow the same ports (deploy/vm/README.md).
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

# True when the unit is not running, or started no later than any of the
# files (whole seconds, so a tie counts as stale).
stale() {
  local unit="$1" since f
  shift
  since="$(systemctl show -p ActiveEnterTimestamp --value "$unit")"
  if ! systemctl is-active -q "$unit" || [[ -z $since ]]; then
    return 0
  fi
  since="$(date -d "$since" +%s)"
  for f in "$@"; do
    if [[ -f $f ]] && (( $(stat -c %Y "$f") >= since )); then
      return 0
    fi
  done
  return 1
}

PUBLIC="${1:-}"
if [[ ! $PUBLIC =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo 'usage: turn-install.sh <the VM public IPv4 address>' >&2
  exit 2
fi
if [[ $(id -u) -ne 0 ]]; then
  echo 'turn-install.sh runs as root' >&2
  exit 1
fi

# Voice needs the rooms server that knows it (deploy.sh), and that
# server's unit reads turn.env.
if ! grep -q '^EnvironmentFile=-/etc/fdfpv/turn.env' /etc/systemd/system/fdfpv-rooms.service; then
  echo 'turn-install.sh: the rooms unit does not read turn.env yet; run deploy.sh first, then this' >&2
  exit 1
fi

if ! rpm -q oracle-epel-release-el9 >/dev/null 2>&1; then
  say 'enabling Oracle EPEL'
  dnf -y -q install oracle-epel-release-el9
fi
# The release package leaves its repository disabled on Oracle Linux 9, so
# coturn was not found until it was enabled (first deploy, 2026-09-30).
dnf config-manager --set-enabled ol9_developer_EPEL
if ! rpm -q coturn >/dev/null 2>&1; then
  say 'installing coturn'
  dnf -y -q install coturn
fi

env=/etc/fdfpv/turn.env
if [[ ! -f $env ]]; then
  say "making the TURN secret in $env"
  install -d -m 755 /etc/fdfpv
  (
    umask 077
    printf 'TURN_SECRET=%s\nTURN_URLS=turn:%s:3478?transport=udp,turn:%s:3478?transport=tcp,turns:%s:5349?transport=tcp\n' \
      "$(openssl rand -hex 32)" "$PUBLIC" "$PUBLIC" "$PUBLIC" > "$env"
  )
fi
chown root:root "$env"
chmod 600 "$env"

private="$(ip -4 route get 1.1.1.1 | sed -n 's/.* src \([0-9.]*\).*/\1/p')"
if [[ -z $private ]]; then
  echo 'turn-install.sh: could not find the VM private address' >&2
  exit 1
fi
secret="$(sed -n 's/^TURN_SECRET=//p' "$env")"
conf="$(mktemp)"
trap 'rm -f "$conf"' EXIT
{
  cat "$HERE/turnserver.conf"
  printf '\n# Added on the VM by turn-install.sh.\nexternal-ip=%s/%s\nstatic-auth-secret=%s\n' "$PUBLIC" "$private" "$secret"
} > "$conf"
unset secret
if ! cmp -s "$conf" /etc/coturn/turnserver.conf; then
  install -m 640 -o root -g coturn "$conf" /etc/coturn/turnserver.conf
  say 'installed /etc/coturn/turnserver.conf'
fi
install -d -m 750 -o root -g coturn /etc/coturn/tls
put "$HERE/coturn.conf" /etc/systemd/system/coturn.service.d/fdfpv.conf || true

put "$HERE/fdfpv-turn-cert.service" /etc/systemd/system/fdfpv-turn-cert.service || true
put "$HERE/fdfpv-turn-cert.timer" /etc/systemd/system/fdfpv-turn-cert.timer || true
systemctl daemon-reload
# The certificate before coturn starts, so its TLS listener comes up with it.
# Without one, TURN over UDP and TCP still work, so it does not stop here.
if ! systemctl start fdfpv-turn-cert.service; then
  say 'no certificate copied (journalctl -u fdfpv-turn-cert says why); TURN over TLS waits for one'
fi
systemctl enable -q --now fdfpv-turn-cert.timer

for port in 3478/udp 3478/tcp 5349/tcp 49160-49200/udp; do
  if ! firewall-cmd -q --permanent --query-port="$port"; then
    say "firewalld: opening $port"
    firewall-cmd -q --permanent --add-port="$port"
    reload=1
  fi
done
if [[ ${reload:-0} == 1 ]]; then
  firewall-cmd -q --reload
fi

systemctl enable -q coturn
if stale coturn /etc/coturn/turnserver.conf /etc/systemd/system/coturn.service.d/fdfpv.conf; then
  say 'starting coturn with its config'
  systemctl restart coturn
fi

if stale fdfpv-rooms "$env"; then
  say 'restarting the rooms server to read turn.env'
  systemctl restart fdfpv-rooms
fi

for unit in coturn fdfpv-turn-cert.timer fdfpv-rooms; do
  say "$unit $(systemctl is-active "$unit")"
done
