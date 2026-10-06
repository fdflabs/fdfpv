#!/usr/bin/env bash
# build-flood.sh: compile the shallow water solver (src/sim/water/flood.c)
# to dist/flood.wasm with Emscripten.
#
# Its own module, not part of dist/sim.wasm: the flood steps on the war
# room's clock, the plant on the craft's, and a change to one must not
# move a bit of the other's traces. The determinism flags are the same
# as build-wasm.sh's and as load-bearing: no fast math, no fp
# contraction, no SIMD. dist/flood.wasm is committed, so CI's checks run
# without a toolchain; rebuild and commit it with every change to
# flood.c (scripts/water-check.js fails when they disagree). FLOOD_OUT
# names another output, for that check's rebuild.
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

if ! command -v emcc >/dev/null 2>&1; then
  for d in "${EMSDK:-}" "$HOME/emsdk" /opt/emsdk; do
    if [ -n "$d" ] && [ -f "$d/emsdk_env.sh" ]; then
      # shellcheck disable=SC1091
      source "$d/emsdk_env.sh" >/dev/null 2>&1 || true
      break
    fi
  done
fi

if ! command -v emcc >/dev/null 2>&1; then
  echo "build:flood: emcc not found. Install emsdk (https://emscripten.org) or set EMSDK." >&2
  exit 1
fi

OUT="${FLOOD_OUT:-dist/flood.wasm}"
mkdir -p "$(dirname "$OUT")"

emcc src/sim/water/flood.c \
  -I src/native \
  -std=gnu17 -O2 -fno-fast-math -ffp-contract=off -Wall -Werror \
  --no-entry \
  -sSTANDALONE_WASM=1 \
  -sEXPORTED_FUNCTIONS=_malloc,_free \
  -sALLOW_MEMORY_GROWTH=1 \
  -o "$OUT"

echo "build:flood: wrote $OUT"
