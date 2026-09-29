#!/usr/bin/env bash
# host.sh: make the VM the host the two servers need. Runs as root ON THE VM,
# piped there by deploy/vm/deploy.sh on every deploy. Safe to rerun: every
# step checks before it changes anything.
#
#   - Node 24 (the LTS) from the Oracle Linux appstream module, so its
#     security errata arrive through dnf-automatic like the rest of the OS,
#   - Caddy from its own COPR, the TLS front (deploy/vm/Caddyfile),
#   - dnf-automatic applying security updates on its timer,
#   - firewalld: http and https open, ssh as it was, nothing else,
#   - the two service users and /opt/fdfpv, where deploy.sh puts the code.
#
# The config files (units, journald cap, Caddyfile) are install.sh's, run
# after the code is in place.
#
# SSH is not touched: the image already has password login off
# (`sshd -T` says passwordauthentication no), and deploy.sh checks it.
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

say() { printf 'host: %s\n' "$*"; }

if [[ $(id -u) -ne 0 ]]; then
  echo 'host.sh runs as root' >&2
  exit 1
fi

if ! rpm -q nodejs >/dev/null 2>&1 || [[ $(node -p 'process.versions.node.split(".")[0]') != 24 ]]; then
  say 'installing Node 24'
  dnf -y -q module reset nodejs
  dnf -y -q module enable nodejs:24
  dnf -y -q install nodejs npm
fi

if ! rpm -q caddy >/dev/null 2>&1; then
  say 'installing Caddy'
  dnf -y -q install dnf-plugins-core
  # Oracle Linux is not a chroot COPR builds for; EPEL 9 is the same ABI.
  dnf -y -q copr enable @caddy/caddy epel-9-aarch64
  dnf -y -q install caddy
fi

if ! rpm -q dnf-automatic >/dev/null 2>&1; then
  say 'installing dnf-automatic'
  dnf -y -q install dnf-automatic
fi
conf=/etc/dnf/automatic.conf
if ! grep -q '^upgrade_type = security' "$conf" || ! grep -q '^apply_updates = yes' "$conf"; then
  say 'dnf-automatic: security updates, applied'
  sed -i -e 's/^upgrade_type *=.*/upgrade_type = security/' -e 's/^apply_updates *=.*/apply_updates = yes/' "$conf"
fi
systemctl enable --now -q dnf-automatic.timer

for svc in http https; do
  if ! firewall-cmd -q --permanent --query-service="$svc"; then
    say "firewalld: opening $svc"
    firewall-cmd -q --permanent --add-service="$svc"
    reload=1
  fi
done
if [[ ${reload:-0} == 1 ]]; then
  firewall-cmd -q --reload
fi

for user in fdfpv-tracks fdfpv-rooms; do
  if ! id "$user" >/dev/null 2>&1; then
    say "adding service user $user"
    useradd --system --no-create-home --home-dir /nonexistent --shell /sbin/nologin "$user"
  fi
done

# The code belongs to the deploying user and is only read by the services.
install -d -m 755 -o opc -g opc /opt/fdfpv
install -d -m 755 /etc/fdfpv
