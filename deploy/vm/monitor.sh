#!/usr/bin/env bash
# monitor.sh: watch the live game and the VM from the owner's DESKTOP, and
# tell the owner's phone when something changes.
#
#   deploy/vm/monitor.sh            (fdfpv-monitor.timer, every 5 minutes)
#   deploy/vm/monitor.sh --dry-run  (prints what it would send, sends nothing,
#                                    keeps no state)
#
# Each check answers ok or fail with a short reason:
#   site       the game's page answers 200 and carries a deploy stamp
#   pages      the stamp (version.json) is main's head; fails when it has
#              not been for PAGES_LAG_MIN minutes (a Pages deploy takes a few)
#   tracks     /api/version answers a commit
#   rooms      /v2/version answers the same commit (deploy.sh deploys both;
#              two commits is a half finished deploy), and /v2/rooms lists
#              rooms through the lobby
#   board      /board/api/health answers from Postgres
#   tls-site, tls-api  each certificate has more than TLS_DAYS days left
#   vm         over SSH, read only: the root disk under DISK_PCT used, memory
#              available over MEM_PCT, every server unit active
#   backup     ~/fdfpv-backups/last-success is under BACKUP_HOURS old
#
# A check alerts when its state CHANGES, and only once it has held for two
# runs in a row, so one dropped request at a busy minute pages nobody. A
# recovery is an alert too. Once a day, on the first run after HEARTBEAT_HOUR
# local, a heartbeat says the monitor is alive, lists what is failing, and
# says how far the VM's commit is behind main (the lead deploys the VM by
# hand, so its lag is information, not a fault).
#
# Alerts are ntfy posts. The topic and its token are in
# ~/.config/fdfpv-monitor/ntfy.env (NTFY_URL, NTFY_TOKEN), mode 600, never in
# the repo. Every curl is pinned to IPv4 by the unit (CURL_HOME): ntfy.sh's
# free quota is per source address and this LAN's IPv6 /64 is spent by
# another device most afternoons.
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

set -uo pipefail

SITE="${FDFPV_SITE:-https://paraguayandronecombatsimulator.com}"
API="${FDFPV_API:-https://api.paraguayandronecombatsimulator.com}"
REPO="${FDFPV_REPO:-https://github.com/fdflabs/fdfpv}"
VM="${FDFPV_VM:-opc@129.151.39.48}"
KEY="${FDFPV_VM_KEY:-$HOME/.ssh/fdfpv-oracle}"
BACKUPS="${FDFPV_BACKUP_DIR:-$HOME/fdfpv-backups}"
STATE="${FDFPV_MONITOR_STATE:-$HOME/.local/state/fdfpv-monitor}"
CONF="${FDFPV_MONITOR_CONF:-$HOME/.config/fdfpv-monitor/ntfy.env}"
PAGES_LAG_MIN=45
TLS_DAYS=14
DISK_PCT=85
MEM_PCT=10
BACKUP_HOURS=26
HEARTBEAT_HOUR=9
UNITS='caddy postgresql fdfpv-rooms fdfpv-tracks fdfpv-board'

DRY=0
[[ ${1:-} == --dry-run ]] && DRY=1

get() { curl -sS -m 20 -H "origin: $SITE" "$@"; }
json() { node -e 'let s="";process.stdin.on("data",(d)=>s+=d).on("end",()=>{try{const v=JSON.parse(s)[process.argv[1]];console.log(v ?? "")}catch{console.log("")}})' "$1"; }

declare -A RESULT
ok() { RESULT[$1]="ok|$2"; }
bad() { RESULT[$1]="fail|$2"; }

main_head="$(git ls-remote "$REPO" refs/heads/main 2>/dev/null | cut -c1-40)"

check_site() {
  local page
  if ! page="$(get -f "$SITE/")"; then bad site "the page did not answer"; return; fi
  if [[ $page != *'name="fdfpv-version"'* ]]; then bad site "the page has no deploy stamp"; return; fi
  ok site 'up'
}

check_pages() {
  local deployed since now
  deployed="$(get -f "$SITE/version.json" | json version)"
  if [[ -z $deployed ]]; then bad pages 'version.json did not answer'; return; fi
  if [[ -z $main_head ]]; then ok pages "deployed $deployed (main unknown)"; return; fi
  now="$(date +%s)"
  if [[ $main_head == "$deployed"* ]]; then
    rm -f "$STATE/pages-behind-since"
    ok pages "deployed $deployed is main"
    return
  fi
  if [[ ! -f $STATE/pages-behind-since ]] && (( ! DRY )); then
    echo "$now" > "$STATE/pages-behind-since"
  fi
  since="$(cat "$STATE/pages-behind-since" 2>/dev/null || echo "$now")"
  if (( now - since > PAGES_LAG_MIN * 60 )); then
    bad pages "the site is $deployed, main is ${main_head:0:12}, for $(( (now - since) / 60 )) min"
  else
    ok pages "deploying ${main_head:0:12} (site $deployed)"
  fi
}

check_api() {
  local tracks rooms list
  tracks="$(get -f "$API/api/version" | json commit)"
  rooms="$(get -f "$API/v2/version" | json commit)"
  if [[ -z $tracks ]]; then bad tracks '/api/version did not answer'; else ok tracks "${tracks:0:12}"; fi
  echo "$tracks" > "$STATE/vm-commit.tmp" 2>/dev/null || true
  list="$(get -f "$API/v2/rooms" | json open)"
  if [[ -z $rooms ]]; then bad rooms '/v2/version did not answer'
  elif [[ -n $tracks && $rooms != "$tracks" ]]; then bad rooms "rooms run ${rooms:0:12} but tracks ${tracks:0:12}"
  elif [[ -z $list ]]; then bad rooms '/v2/rooms did not list'
  else ok rooms "${rooms:0:12}, lobby answers"; fi
}

check_board() {
  local store
  store="$(get -f "$API/board/api/health" | json store)"
  if [[ $store == postgres ]]; then ok board 'on postgres'; else bad board "health says '${store:-nothing}'"; fi
}

check_tls() {
  local name="$1" host="$2" end days
  end="$(echo | timeout 20 openssl s_client -servername "$host" -connect "$host:443" 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)"
  if [[ -z $end ]]; then bad "$name" "no certificate read from $host"; return; fi
  days=$(( ($(date -d "$end" +%s) - $(date +%s)) / 86400 ))
  if (( days < TLS_DAYS )); then bad "$name" "$host certificate ends in $days days"; else ok "$name" "$days days left"; fi
}

check_vm() {
  local out disk avail total down
  if ! out="$(ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=15 -o LogLevel=ERROR "$VM" \
    "df -P / | awk 'NR==2 {print \$5}'; free -m | awk '/^Mem:/ {print \$2, \$7}'; systemctl is-active $UNITS | paste -sd' '" 2>/dev/null)"; then
    bad vm 'ssh did not answer'; return
  fi
  disk="$(sed -n 1p <<< "$out" | tr -d '%')"
  read -r total avail <<< "$(sed -n 2p <<< "$out")"
  down=""
  local i=0
  for state in $(sed -n 3p <<< "$out"); do
    i=$((i + 1))
    [[ $state == active ]] || down+=" $(cut -d' ' -f$i <<< "$UNITS")"
  done
  if [[ -n $down ]]; then bad vm "not active:$down"
  elif (( disk >= DISK_PCT )); then bad vm "disk ${disk}% used"
  elif (( avail * 100 < total * MEM_PCT )); then bad vm "memory: ${avail} MB of ${total} available"
  else ok vm "disk ${disk}%, ${avail}/${total} MB free"; fi
}

check_backup() {
  local last age
  last="$(cat "$BACKUPS/last-success" 2>/dev/null)"
  if [[ -z $last ]]; then bad backup "no backup has succeeded ($BACKUPS/last-success)"; return; fi
  age=$(( ($(date +%s) - $(date -d "$last" +%s)) / 3600 ))
  if (( age >= BACKUP_HOURS )); then bad backup "last good backup ${age} h ago"; else ok backup "${age} h old"; fi
}

send() {
  local title="$1" prio="$2" body="$3"
  if [[ $DRY == 1 ]]; then
    printf -- '--- would send [%s] %s\n%s\n' "$prio" "$title" "$body"
    return 0
  fi
  source "$CONF"
  local auth=()
  [[ -n ${NTFY_TOKEN:-} ]] && auth=(-H "Authorization: Bearer $NTFY_TOKEN")
  curl -sf -m 15 -X POST "${auth[@]}" -H "Title: $title" -H "Priority: $prio" -H 'Tags: helicopter' \
    -d "$body" "$NTFY_URL" > /dev/null
}

mkdir -p "$STATE"
check_site
check_pages
check_api
check_board
check_tls tls-site "${SITE#https://}"
check_tls tls-api "${API#https://}"
check_vm
check_backup

alerts=()
failing=()
for name in $(printf '%s\n' "${!RESULT[@]}" | sort); do
  IFS='|' read -r now detail <<< "${RESULT[$name]}"
  printf '%-9s %-4s %s\n' "$name" "$now" "$detail"
  [[ $now == fail ]] && failing+=("$name: $detail")
  (( DRY )) && continue
  told="$(cat "$STATE/$name.told" 2>/dev/null || echo ok)"
  last="$(cat "$STATE/$name.last" 2>/dev/null || echo ok)"
  echo "$now" > "$STATE/$name.last"
  # Two runs in a row in the new state before anybody is told.
  if [[ $now != "$told" && $now == "$last" ]]; then
    if [[ $now == fail ]]; then alerts+=("DOWN $name: $detail"); else alerts+=("RECOVERED $name: $detail"); fi
    echo "$now" > "$STATE/$name.told"
  fi
done

rc=0
if (( ${#alerts[@]} )); then
  prio=default
  printf '%s\n' "${alerts[@]}" | grep -q '^DOWN' && prio=high
  send "FDFPV: ${#failing[@]} failing" "$prio" "$(printf '%s\n' "${alerts[@]}")" || rc=1
fi

today="$(date +%F)"
if (( ! DRY )) && (( 10#$(date +%H) >= HEARTBEAT_HOUR )) && [[ $(cat "$STATE/heartbeat" 2>/dev/null) != "$today" ]]; then
  vm_commit="$(cat "$STATE/vm-commit.tmp" 2>/dev/null)"
  behind="unknown"
  if [[ -n $vm_commit && -n $main_head ]]; then
    behind="$(gh api "repos/fdflabs/fdfpv/compare/$vm_commit...$main_head" --jq .ahead_by 2>/dev/null || echo unknown)"
  fi
  if (( ${#failing[@]} )); then
    summary="$(printf '%s\n' "${failing[@]}")"
  else
    summary='every check ok'
  fi
  if send 'FDFPV: daily heartbeat' low "$summary
VM runs ${vm_commit:0:12}, $behind commits behind main ${main_head:0:12}."; then
    echo "$today" > "$STATE/heartbeat"
  else
    rc=1
  fi
fi
rm -f "$STATE/vm-commit.tmp"
exit "$rc"
