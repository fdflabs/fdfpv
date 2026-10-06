#!/usr/bin/env bash
# deploy.sh: put the tracks server on Cloudflare, or update it. Safe to rerun.
#
#   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
#     tracks-api/deploy.sh /path/outside/the/repo/ADMIN-SECRET.txt
#
# The token needs Workers Scripts edit and D1 edit on the account. It is read
# from the environment only; nothing here prints it or writes it anywhere.
#
# What it does, each step skipped when it is already done:
#   1. creates the D1 database fdfpv-tracks and writes its id into
#      wrangler.toml (commit that change),
#   2. applies every migration in migrations/ to it,
#   3. deploys the Worker fdfpv-tracks on its workers.dev address,
#   4. the first time only, generates the admin secret, stores it with
#      `wrangler secret put`, and writes it to the file named above with
#      mode 600. That file is the only copy: keep it out of the repository.
#
# Then set PRODUCTION_TRACKS_ORIGIN in src/share/cloud.js to the address it
# prints, and prove it with tracks-api/smoke.js.
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

SECRET_FILE="${1:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$HERE/wrangler.toml"
WRANGLER="${WRANGLER:-npx --yes wrangler@4}"
DB=fdfpv-tracks
PLACEHOLDER=00000000-0000-0000-0000-000000000000

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "deploy.sh: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set" >&2
  exit 2
fi
if [ -z "$SECRET_FILE" ]; then
  echo "usage: tracks-api/deploy.sh /path/to/ADMIN-SECRET.txt" >&2
  exit 2
fi

db_id() {
  $WRANGLER d1 list --json --config "$CONFIG" \
    | node -e 'let s="";process.stdin.on("data",(d)=>{s+=d}).on("end",()=>{const r=JSON.parse(s).find((d)=>d.name===process.argv[1]);process.stdout.write(r?r.uuid:"")})' "$DB"
}

# 1. The database.
if grep -q "$PLACEHOLDER" "$CONFIG"; then
  id="$(db_id)"
  if [ -z "$id" ]; then
    $WRANGLER d1 create "$DB" --config "$CONFIG" >/dev/null
    id="$(db_id)"
  fi
  if [ -z "$id" ]; then
    echo "deploy.sh: could not find or create the D1 database $DB" >&2
    exit 1
  fi
  sed -i "s/$PLACEHOLDER/$id/" "$CONFIG"
  echo "database $DB is $id, written into tracks-api/wrangler.toml"
fi

# 2. The schema.
$WRANGLER d1 migrations apply "$DB" --remote --config "$CONFIG"

# 3. The Worker.
$WRANGLER deploy --config "$CONFIG"

# 4. The admin secret, once.
if ! $WRANGLER secret list --config "$CONFIG" | grep -q '"ADMIN_SECRET"'; then
  if [ -e "$SECRET_FILE" ]; then
    echo "deploy.sh: $SECRET_FILE exists but the Worker has no ADMIN_SECRET; move it aside first" >&2
    exit 1
  fi
  umask 077
  secret="$(openssl rand -base64 32)"
  printf '%s\n' "$secret" > "$SECRET_FILE"
  chmod 600 "$SECRET_FILE"
  printf '%s' "$secret" | $WRANGLER secret put ADMIN_SECRET --config "$CONFIG"
  unset secret
  echo "admin secret stored on the Worker and in $SECRET_FILE (mode 600)"
fi
