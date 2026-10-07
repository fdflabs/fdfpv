#!/usr/bin/env bash
# build-wasm.sh: compile the physics module into dist/sim.wasm with
# Emscripten: the simulator's own C sources in src/native plus a fixed set
# of Betaflight controller sources, which are compiled and linked in. Run
# with npm run build:wasm.
#
# dist/sim.wasm is committed and must rebuild byte identical from the same
# sources and toolchain (emsdk 6.0.10, docs/PLAN.md), so every flag, every
# file and the order of the files below is data. The determinism flags are
# load-bearing: no fast math, no FP contraction, no relaxed SIMD.
#
# The patches in patches/ are applied to vendor/betaflight for the compile
# and reverted on exit, so the vendor tree is never left modified (STAGE1
# check 1, enforced by npm run verify, wants git diff --stat
# vendor/betaflight empty after a build). 0001 adds the rotor telemetry the
# plant feeds the RPM filter. 0002 and 0003 reset runtime statics on init
# so a re-init is a real reset rather than a warm start; 0003 covers the
# receiver and failsafe state, which hardware initialises once at boot
# from zeroed memory, so on hardware it changes nothing.
#
# SIM_EXTRA_CFLAGS is for a proof build only: scripts/crash-identity.js
# builds a module with crash physics on by default to show every gate is
# unmoved by it. A shipped module is built without it.
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
  for dir in "${EMSDK:-}" "$HOME/emsdk" /opt/emsdk; do
    if [ -n "$dir" ] && [ -f "$dir/emsdk_env.sh" ]; then
      source "$dir/emsdk_env.sh" >/dev/null 2>&1 || true
      break
    fi
  done
fi
if ! command -v emcc >/dev/null 2>&1; then
  echo "build:wasm: emcc not found. Install emsdk (https://emscripten.org) or set EMSDK." >&2
  exit 1
fi

mkdir -p dist build/obj

# With Windows core.autocrlf the patches check out as CRLF and git apply
# then fails to match the LF vendor tree, so CR is stripped on the way in,
# in both directions.
feed_patch() {
  tr -d '\r' < "$1" | git -C vendor/betaflight apply "${@:2}"
}

revert_patches() {
  local patch
  for patch in "${patches[@]}"; do
    feed_patch "$patch" -R || true
  done
}

shopt -s nullglob
patches=(patches/*.patch)
shopt -u nullglob
if [ "${#patches[@]}" -gt 0 ]; then
  for patch in "${patches[@]}"; do
    feed_patch "$patch"
  done
  trap revert_patches EXIT
fi

read -r -a extra_cflags <<< "${SIM_EXTRA_CFLAGS:-}"
# The guarded expansion keeps an empty array legal under set -u on bash
# older than 4.4 (macOS ships 3.2).
common_flags=(-std=gnu17 -O2 -fno-fast-math -ffp-contract=off ${extra_cflags[@]+"${extra_cflags[@]}"})

sim_sources=(
  src/native/sim.c
  src/native/plant.c
  src/native/plant_wing.c
  src/native/water.c
  src/native/crash.c
  src/native/bridge.c
  src/native/libm/sim_math.c
)

# failsafe.c is Betaflight's failsafe and rx/rx.c the receiver path that
# decides a link is lost and substitutes stage 1 and stage 2 channel
# values. No receiver driver is compiled: bf_glue.c registers one the way
# target/SITL/sitl.c does, fed by the shell's sticks and sim_rx_signal.
# SIM_ROTOR_TELEMETRY is read by patch 0001 and switches on the dynamic
# notch, the RPM filter and dynamic idle: on hardware all three need DShot
# telemetry to learn rotor speed, this simulator knows it exactly, so a
# target guard was the only thing in the way.
bf_flags=(-I vendor/betaflight/src/main/target/SITL -I vendor/betaflight/src/main -DSIMULATOR_BUILD -DSIM_ROTOR_TELEMETRY)
bf_sources=(
  src/native/bf/bf_glue.c
  src/native/bf/bf_settings.c
  src/native/bf/bf_stubs.c
  vendor/betaflight/src/main/sensors/gyro.c
  vendor/betaflight/src/main/sensors/gyro_init.c
  vendor/betaflight/src/main/sensors/boardalignment.c
  vendor/betaflight/src/main/config/simplified_tuning.c
  vendor/betaflight/src/main/fc/rc.c
  vendor/betaflight/src/main/fc/rc_controls.c
  vendor/betaflight/src/main/fc/rc_modes.c
  vendor/betaflight/src/main/fc/controlrate_profile.c
  vendor/betaflight/src/main/fc/runtime_config.c
  vendor/betaflight/src/main/flight/failsafe.c
  vendor/betaflight/src/main/rx/rx.c
  vendor/betaflight/src/main/flight/pid.c
  vendor/betaflight/src/main/flight/pid_init.c
  vendor/betaflight/src/main/flight/mixer.c
  vendor/betaflight/src/main/flight/mixer_init.c
  vendor/betaflight/src/main/flight/dyn_notch_filter.c
  vendor/betaflight/src/main/flight/rpm_filter.c
  vendor/betaflight/src/main/common/maths.c
  vendor/betaflight/src/main/common/filter.c
  vendor/betaflight/src/main/common/sdft.c
  vendor/betaflight/src/main/common/bitarray.c
  vendor/betaflight/src/main/pg/rx.c
  vendor/betaflight/src/main/pg/motor.c
  vendor/betaflight/src/main/pg/dyn_notch.c
  vendor/betaflight/src/main/pg/rpm_filter.c
  vendor/betaflight/src/main/config/feature.c
  vendor/betaflight/src/main/build/debug.c
)

objects=()
for src in "${sim_sources[@]}"; do
  obj="build/obj/$(basename "$src" .c).o"
  emcc -c "$src" -I src/native "${common_flags[@]}" -Wall -o "$obj"
  objects+=("$obj")
done

# Betaflight has more than one file with the same basename
# (flight/rpm_filter.c and pg/rpm_filter.c). A basename-only object name
# silently overwrites one with the other, which the linker then reports as
# a pile of duplicate symbols from a single object, so the parent folder is
# part of the name.
for src in "${bf_sources[@]}"; do
  obj="build/obj/bf_$(basename "$(dirname "$src")")_$(basename "$src" .c).o"
  emcc -c "$src" -I src/native "${bf_flags[@]}" "${common_flags[@]}" -o "$obj"
  objects+=("$obj")
done

emcc "${objects[@]}" --no-entry -sSTANDALONE_WASM=1 -sEXPORTED_FUNCTIONS=_malloc,_free -sALLOW_MEMORY_GROWTH=1 -o dist/sim.wasm

echo "build:wasm: wrote dist/sim.wasm"
