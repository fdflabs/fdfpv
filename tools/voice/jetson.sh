#!/usr/bin/env bash
# jetson.sh: build.py's environment on the Jetson AGX Orin (JetPack 6,
# R36.5, driver CUDA 12.6, Python 3.10), so a voice build can run there
# and leave this desktop's GPUs alone.
#
# Runs ON the Orin, from a mirror of this folder at
# ~/fdfpv-voice/tools/voice (script.py finds lines.json two folders up,
# so the mirror also holds ~/fdfpv-voice/assets/audio/war/lines.json and
# manifest.json):
#
#     tools/voice/jetson.sh setup             venv, torch, cuDNN, the locked deps
#     tools/voice/jetson.sh build ARGS...     build.py ARGS with that environment
#
# Hold the Orin's GPU lease (~/gpu-lease/gpu-lease acquire) for a build:
# the box is shared, and a build beside a ComfyUI video job does not fit
# in its memory. Build with --out a folder of its own holding a copy of
# manifest.json, bring that folder's manifest.json and _work/<id>-<lang>.wav
# back, and run orin.py here: it encodes them and fills the manifest.
#
# The model caches (Kokoro, Chatterbox, Whisper at build.py's revisions)
# are copied from the desktop's ~/.cache/huggingface/hub with
# `rsync -aL --exclude blobs` (the desktop's blobs are links into a shared
# store, so they are dereferenced), and the build runs with
# HF_HUB_OFFLINE=1, so a missing revision fails instead of downloading.
#
# Why each piece is what it is:
# - Python 3.10: the only torch 2.6.0 (chatterbox-tts 0.1.7 pins it) that
#   NVIDIA builds for JetPack 6 is cp310, on jetson-ai-lab's jp6/cu128
#   index; PyPI's aarch64 torch is SBSA or CPU and does not drive the
#   Orin's iGPU. pyproject.toml asks for 3.12, so five locked packages
#   that need 3.11 or later are held at the newest release for 3.10
#   (RELAXED below), and ADDED fills what 3.10 needs besides.
# - cuDNN 9.8 for Tegra (NVIDIA's linux-aarch64 redist, unpacked here):
#   the cu128 torch is built against 9.8 and refuses JetPack's 9.3; pip's
#   nvidia-cudnn-cu12 is the SBSA build and has no engine for sm_87
#   ("GET was unable to find an engine").
# - nvidia-cudss-cu12 without its dependencies: torch links libcudss, and
#   its pip CUDA toolkit dependency breaks cuBLAS on the native driver
#   (found setting up ComfyUI there). No CUDA compat libcuda is needed.
# - en_core_web_sm 3.8.0: misaki downloads it at first use with pip,
#   which a uv venv does not have.
#
# The Orin's take is not the desktop's: with every pin, model file, seed
# and setting the same, Kokoro's reference clip already differs (same
# length and loudness, correlation 0.991), so Chatterbox clones a voice
# that is not bit for bit the committed one, and ffmpeg there is 4.4, not
# the desktop's 8.0, so even the same wav encodes to other bytes. The
# Orin's voice is accepted, with that difference, and is where every
# voice build runs now; assets/audio/war/CREDITS.md (Where the voices are
# built) has the rule that keeps a mission's speaker one voice.
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

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
VENV=$ROOT/.venv
UV=${UV:-$HOME/.local/bin/uv}

LAB=https://pypi.jetson-ai-lab.io
TORCH=($LAB/jp6/cu128/+f/f8b/bd758e3ca0567/torch-2.6.0-cp310-cp310-linux_aarch64.whl
       f8bbd758e3ca05675e825bf7e230e7f7e01202b8f75fcd27f9720e78753387ed)
TORCHAUDIO=($LAB/jp6/cu129/+f/e1a/c927d4536ffd2/torchaudio-2.6.0-cp310-cp310-linux_aarch64.whl
            e1ac927d4536ffd28fcc6820ffd54c29fbc9f490c561a25fd7aaf9b7694c687d)
CUDNN_NAME=cudnn-linux-aarch64-9.8.0.87_cuda12-archive
CUDNN=(https://developer.download.nvidia.com/compute/cudnn/redist/cudnn/linux-aarch64/$CUDNN_NAME.tar.xz
       f03ece3ff07d1719f06218973a8797cec1be387cc317baab5bb118dc988199e7)
SPACY_EN=https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl
RELAXED=(deprecated==1.3.1 networkx==3.4.2 pandas==2.3.3 rpds-py==0.30.0 scikit-learn==1.7.2)
# pandas 2 needs tzdata on Linux too; the lock has it for Windows only.
ADDED=(tomli==2.5.0 exceptiongroup==1.3.1 tzdata==2026.4)

fetch() {
    local url=$1 sum=$2 dir=$3 file
    file=$dir/$(basename "$url")
    [ -f "$file" ] || curl -sSfL -o "$file.part" "$url"
    [ -f "$file" ] || mv "$file.part" "$file"
    echo "$sum  $file" | sha256sum -c --quiet
}

setup() {
    mkdir -p "$ROOT/wheels" "$ROOT/cudnn"
    fetch "${TORCH[@]}" "$ROOT/wheels"
    fetch "${TORCHAUDIO[@]}" "$ROOT/wheels"
    if [ ! -d "$ROOT/cudnn/$CUDNN_NAME" ]; then
        fetch "${CUDNN[@]}" "$ROOT/cudnn"
        tar -xf "$ROOT/cudnn/$CUDNN_NAME.tar.xz" -C "$ROOT/cudnn"
        rm "$ROOT/cudnn/$CUDNN_NAME.tar.xz"
    fi
    [ -x "$VENV/bin/python" ] || "$UV" venv -q --python /usr/bin/python3.10 "$VENV"

    local req=$ROOT/requirements-jetson.txt pin
    (cd "$HERE" && "$UV" export --frozen --no-hashes --no-emit-project --no-header --no-annotate) |
        grep -v -e '^torch==' -e '^torchaudio==' -e '^nvidia-' -e '^triton==' > "$req"
    for pin in "${RELAXED[@]}"; do
        sed -i "s/^${pin%%==*}==[^ ;]*/$pin/" "$req"
    done
    printf '%s\n' "${ADDED[@]}" >> "$req"

    "$UV" pip install -q --python "$VENV/bin/python" --no-deps \
        "$ROOT/wheels/$(basename "${TORCH[0]}")" "$ROOT/wheels/$(basename "${TORCHAUDIO[0]}")" \
        nvidia-cudss-cu12==0.8.0.10 "$SPACY_EN" -r "$req"
    run python -c 'import torch, chatterbox.mtl_tts, kokoro, transformers
assert torch.__version__ == "2.6.0" and torch.cuda.is_available(), torch.__version__
x = torch.nn.Conv1d(80, 80, 5).cuda()(torch.randn(1, 80, 64, device="cuda"))
print("jetson.sh: torch", torch.__version__, "cuda", torch.version.cuda,
      "cudnn", torch.backends.cudnn.version(), torch.cuda.get_device_name())'
}

run() {
    local nv=$VENV/lib/python3.10/site-packages/nvidia
    LD_LIBRARY_PATH=$ROOT/cudnn/$CUDNN_NAME/lib:$nv/cu12/lib HF_HUB_OFFLINE=1 \
        "$VENV/bin/$1" "${@:2}"
}

case "${1:-}" in
    setup) setup ;;
    build) shift; cd "$HERE"; run python build.py "$@" ;;
    *) echo "usage: jetson.sh setup | build [build.py args]" >&2; exit 2 ;;
esac
