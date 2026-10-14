#!/usr/bin/env bash
# perf-jetson.sh: fly docs/BUDGETS.md's rows on the reference machine, a
# Jetson AGX Orin on the LAN, and bring the numbers home.
#
#     scripts/perf-jetson.sh OUT_DIR [--scenarios=title,alps-low,...]
#         [--presets=low,medium,high] [--seconds=15]
#
# Copies this tree to the Jetson (no .git, no node_modules), runs
# scripts/perf-play.js there one scenario at a time, each with the
# BUDGETS run settings (--mode=quality, 1600 by 900, free running), and
# fetches each run's perf-play.json to OUT_DIR/<preset>-<scenario>/. It
# prints one line a row and writes OUT_DIR/summary.md, the table for
# docs/BUDGETS.md (Reference machine: Jetson AGX Orin).
#
# Not --budgets: those ceilings are the 3060 Ti's, and the Orin is held
# to no ceiling, only measured.
#
# The Orin shares its GPU with whatever else runs there (ComfyUI, Ollama).
# Before each row the script waits until the GPU's own load
# (the nvgpu sysfs `load`, per mille) has stayed under IDLE_MAX for
# IDLE_SECONDS, and gives up after WAIT_MINUTES. nvidia-smi reports no
# utilisation on Tegra, so perf-play's "gpu load" is empty there. The
# load gives no owner, and a ComfyUI job or an Ollama model may start
# mid row, so each row also records ComfyUI's queue and Ollama's loaded
# models before and after it; a row with either busy is marked.
#
# One time setup on the Jetson, all under ~/fdfpv-ref (docs/PERF.md,
# The reference machine): Node 22 in node/, Playwright's arm64 Chromium
# in pw-browsers/. The script checks both and stops if either is missing.
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
cd "$(dirname "$0")/.."

JETSON=${JETSON:-smallbrain@192.168.100.246}
IDLE_MAX=${IDLE_MAX:-100}
IDLE_SECONDS=${IDLE_SECONDS:-10}
WAIT_MINUTES=${WAIT_MINUTES:-60}

out=''
scenarios=title,alps-low,swiss-low,itaipu-stream,interior-ops,itaipu-war
presets=low,medium,high
seconds=15
for a in "$@"; do
  case "$a" in
    --scenarios=*) scenarios=${a#*=} ;;
    --presets=*) presets=${a#*=} ;;
    --seconds=*) seconds=${a#*=} ;;
    --*) echo "perf-jetson: unknown option $a" >&2; exit 2 ;;
    *) out=$a ;;
  esac
done
if [[ -z "$out" ]]; then
  echo 'perf-jetson: usage: scripts/perf-jetson.sh OUT_DIR [--scenarios=...] [--presets=...] [--seconds=15]' >&2
  exit 2
fi
mkdir -p "$out"

remote() { ssh -o BatchMode=yes -o ServerAliveInterval=30 "$JETSON" "$@"; }

# The remote side's paths, relative to the Jetson user's home. The GPU
# load file is the nvgpu device's on JetPack 6 (R36).
read -r -d '' REMOTE_ENV <<'EOF' || true
set -euo pipefail
R=$HOME/fdfpv-ref
LOAD=/sys/devices/platform/bus@0/17000000.gpu/load
others() {
  local comfy ollama
  comfy=$(curl -s -m 3 127.0.0.1:8188/queue | grep -o '"queue_[a-z]*": \[\[' | wc -l)
  ollama=$(curl -s -m 3 127.0.0.1:11435/api/ps | grep -o '"name"' | wc -l)
  echo "comfyui $comfy ollama $ollama"
}
# The kernel's nvgpu errors since the Jetson booted. On 2026-10-13 the
# Orin's GR engine wedged as one row's Chrome closed (ctxsw busy, failed
# to power off) and failed its reset as the next row's opened; the next
# browser to touch the GPU hung in the kernel, unkillable, and only a
# reboot can bring it back (docs/PERF.md, The reference machine). The
# boot had logged none before it, so any error since boot stops the run
# before a browser opens, and a row that leaves one says so.
gpu_errors() {
  journalctl -k -b --no-pager | grep -E "nvgpu.*\[ERR\]" | tail -5 || true
}
export PATH=$R/node/bin:$PATH TMPDIR=$R/tmp SIM_GPU=1 SIM_CHROME_BIN=$R/chrome-orin
mkdir -p "$TMPDIR"
EOF

remote "$REMOTE_ENV"'
errors=$(gpu_errors)
if [[ -n "$errors" ]]; then
  printf "perf-jetson: not started, the kernel logged nvgpu errors since the Jetson booted (a reboot clears it):\n%s\n" "$errors" >&2
  exit 3
fi
node -e "if (+process.versions.node.split(\".\")[0] < 22) process.exit(1)" \
  || { echo "perf-jetson: no Node 22 in $R/node (docs/PERF.md, The reference machine)" >&2; exit 1; }
chrome=$(ls -d "$R"/pw-browsers/chromium-*/chrome-linux-arm64/chrome 2>/dev/null | sort -V | tail -1)
[[ -x "$chrome" ]] || { echo "perf-jetson: no Chromium in $R/pw-browsers (docs/PERF.md, The reference machine)" >&2; exit 1; }
# tests/lib/page.js asks ANGLE for desktop GL, which wants an X display
# the headless Jetson has none of. GLES over EGL (gl-egl) makes a context
# on the Orin, but its GPU process dies as the shell boots unless
# compositing goes to the CPU, which reads every frame back; ANGLE over
# Vulkan draws and composites on the Orin with no crash (docs/PERF.md,
# The reference machine). Chromium takes the last of two --use-angle
# switches.
printf "#!/bin/sh\nexec %s \"\$@\" --use-angle=vulkan --enable-features=Vulkan\n" "$chrome" > "$R/chrome-orin"
chmod +x "$R/chrome-orin"
cat > "$R/renderer.html" <<HTML
<body><script>
const gl = document.createElement("canvas").getContext("webgl2");
const ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
document.body.textContent = "RENDERER=" + (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "no WebGL2");
</script>
HTML
mkdir -p "$R/tree"
'
rsync -a --delete --exclude=/.git --exclude=/node_modules --exclude=/tmp --exclude=/vendor ./ "$JETSON:fdfpv-ref/tree/"
remote "$REMOTE_ENV"'
cd "$R/tree"
stamp=$(sha256sum package-lock.json | cut -c1-64)
if [[ "$(cat "$R/npm-ci.stamp" 2>/dev/null)" != "$stamp" ]]; then
  npm ci --no-audit --no-fund >/dev/null
  echo "$stamp" > "$R/npm-ci.stamp"
fi
'

{
  echo "commit $(git rev-parse --short=9 HEAD)$(git diff --quiet HEAD -- || echo ' (with uncommitted changes)')"
  remote "$REMOTE_ENV"'
    echo "taken $(date "+%Y-%m-%d %H:%M %Z")"
    echo "model $(tr -d "\0" < /proc/device-tree/model)"
    echo "l4t $(head -1 /etc/nv_tegra_release)"
    echo "power $(nvpmodel -q 2>/dev/null | head -1)"
    echo "gpu max $(( $(cat /sys/devices/platform/bus@0/17000000.gpu/devfreq/17000000.gpu/max_freq) / 1000000 )) MHz"
    echo "chrome $($SIM_CHROME_BIN --version)"
    rm -rf "$TMPDIR/renderer-profile"
    echo "renderer $(timeout 60 $SIM_CHROME_BIN --headless=new --no-sandbox --ignore-gpu-blocklist --enable-gpu \
      --user-data-dir="$TMPDIR/renderer-profile" --virtual-time-budget=3000 --dump-dom "file://$R/renderer.html" 2>/dev/null \
      | grep -o "RENDERER=[^<]*" | cut -d= -f2-)"'
} > "$out/machine.txt"
cat "$out/machine.txt"
if ! grep -q '^renderer .*Orin' "$out/machine.txt"; then
  echo 'perf-jetson: WebGL2 is not on the Orin (renderer line above); not measuring' >&2
  exit 1
fi

IFS=, read -r -a scenario_list <<< "$scenarios"
IFS=, read -r -a preset_list <<< "$presets"
for preset in "${preset_list[@]}"; do
  for id in "${scenario_list[@]}"; do
    row="$preset-$id"
    remote "$REMOTE_ENV"'
      row='"$row"' id='"$id"' preset='"$preset"' seconds='"$seconds"'
      idle_max='"$IDLE_MAX"' idle_seconds='"$IDLE_SECONDS"' wait_minutes='"$WAIT_MINUTES"'
      deadline=$(( $(date +%s) + wait_minutes * 60 )) quiet=0
      while (( quiet < idle_seconds )); do
        if (( $(cat $LOAD) <= idle_max )); then quiet=$((quiet + 1)); else quiet=0; fi
        if (( $(date +%s) > deadline )); then
          echo "perf-jetson: $row: the GPU did not go quiet in $wait_minutes min (load $(cat $LOAD) per mille)" >&2
          exit 1
        fi
        sleep 1
      done
      rm -rf "$R/out/$row" && mkdir -p "$R/out/$row"
      echo "load $(cat $LOAD) $(others)" > "$R/out/$row/before.txt"
      cd "$R/tree"
      status=0
      timeout 900 node scripts/perf-play.js "$R/out/$row" --scenarios="$id" --preset="$preset" \
        --seconds="$seconds" --mode=quality > "$R/out/$row/perf-play.log" 2>&1 || status=$?
      echo "$(others)" > "$R/out/$row/after.txt"
      rm -rf "$TMPDIR"/sim-page-*
      # The wedge showed 5 s after a Chrome closed, when the GPU tried to
      # power down.
      sleep 15
      errors=$(gpu_errors)
      if [[ -n "$errors" ]]; then
        printf "perf-jetson: %s: the kernel logged nvgpu errors during or after this row:\n%s\n" "$row" "$errors" >&2
        exit 3
      fi
      exit $status' || { echo "perf-jetson: $row failed; its log:" >&2; remote "tail -30 fdfpv-ref/out/$row/perf-play.log" >&2 || true; exit 1; }
    rsync -a "$JETSON:fdfpv-ref/out/$row/" "$out/$row/"
    echo "perf-jetson: $row done"
  done
done

node --input-type=module - "$out" "$presets" "$scenarios" <<'EOF'
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [out, presets, scenarios] = process.argv.slice(2);
const f = (x, d = 1) => (x == null || !Number.isFinite(x) ? 'n/a' : x.toFixed(d));
const lines = [
  '| Row | Tier | Frame avg / p95, ms | fps at avg / p95 | GPU median / floor, ms | Draw calls, triangles M | GPU load before, others before / after | 30 fps | 60 fps |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
];
for (const id of scenarios.split(',')) {
  for (const preset of presets.split(',')) {
    const dir = join(out, `${preset}-${id}`);
    const s = JSON.parse(readFileSync(join(dir, 'perf-play.json'), 'utf8')).scenarios[0].summary;
    const [, load, ...before] = readFileSync(join(dir, 'before.txt'), 'utf8').trim().split(' ');
    const after = readFileSync(join(dir, 'after.txt'), 'utf8').trim().split(' ');
    const busy = (o) => (o[1] !== '0' || o[3] !== '0' ? 'BUSY' : 'idle');
    const gpu = s.pace.gpu || '';
    // The shell's own name for the GPU (src/render/gpuinfo.js) reads
    // ANGLE's Vulkan renderer string as "Google Inc. (NVIDIA)".
    if (!/NVIDIA/.test(gpu) || /SwiftShader|llvmpipe/i.test(gpu)) {
      throw new Error(`perf-jetson: ${preset}-${id} drew on "${gpu}", not the Orin`);
    }
    const { avg, p95 } = s.frameMs;
    lines.push(`| \`${id}\`, Orin | ${preset} | ${f(avg)} / ${f(p95)} | ${f(1000 / avg, 0)} / ${f(1000 / p95, 0)} | ${f(s.gpuMs.p50)} / ${f(s.gpuMs.floor)} | ${s.calls.max}, ${f(s.trisM.max, 2)} | ${f(load / 10, 0)} %, ${busy(before)} / ${busy(after)} | ${p95 <= 1000 / 30 ? 'holds' : 'no'} | ${p95 <= 1000 / 60 ? 'holds' : 'no'} |`);
  }
}
const text = `${readFileSync(join(out, 'machine.txt'), 'utf8')}\n${lines.join('\n')}\n`;
writeFileSync(join(out, 'summary.md'), text);
process.stdout.write(text);
EOF
