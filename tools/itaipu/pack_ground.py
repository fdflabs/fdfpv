# pack_ground.py: Itaipu's own ground photographs, from Poly Haven's 1k
# JPG maps to the two files a terrain layer is (docs/ITAIPU-ASSETS.md).
#
#   python3 tools/itaipu/pack_ground.py SRC_DIR
#
# SRC_DIR holds each set's <id>_diff_1k.jpg, <id>_nor_gl_1k.jpg and
# <id>_disp_1k.jpg as Poly Haven publishes them
# (https://api.polyhaven.com/files/<id>, the 1k jpg of Diffuse, nor_gl
# and Displacement). Writes assets/itaipu/ground/<stem>_col.jpg, the albedo
# at JPEG quality 84, and <stem>_nrh.jpg, the OpenGL normal in red and
# green and the displacement in blue at quality 88: swiss2's packing
# (docs/SWISS2-ASSETS.md), which look/ground.js reads the same way.
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

import sys
from pathlib import Path

from PIL import Image

SIZE = 1024
# Stem in assets/itaipu/ground: Poly Haven id.
SETS = {
    'litter': 'dry_decay_leaves',
    'grass': 'leafy_grass',
    'grass_sparse': 'sparse_grass',
    'laterite': 'red_laterite_soil_stones',
    'tracks': 'muddy_tracks',
}

OUT = Path(__file__).resolve().parents[2] / 'assets' / 'itaipu' / 'ground'


def main(src):
    OUT.mkdir(parents=True, exist_ok=True)
    for stem, pid in SETS.items():
        col = Image.open(src / f'{pid}_diff_1k.jpg').convert('RGB')
        nrm = Image.open(src / f'{pid}_nor_gl_1k.jpg').convert('RGB')
        disp = Image.open(src / f'{pid}_disp_1k.jpg').convert('L')
        for im in (col, nrm, disp):
            if im.size != (SIZE, SIZE):
                raise SystemExit(f'pack_ground: {pid} is {im.size}, not {SIZE} square')
        r, g, _ = nrm.split()
        col.save(OUT / f'{stem}_col.jpg', quality=84, optimize=True)
        Image.merge('RGB', (r, g, disp)).save(OUT / f'{stem}_nrh.jpg', quality=88, optimize=True)
        print(stem, pid)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('usage: pack_ground.py SRC_DIR')
    main(Path(sys.argv[1]))
