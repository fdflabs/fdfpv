# The war's explosion flipbook

`assets/explosions/midair.webp` is every fireball and its smoke in the war
mode (src/render/explosion.js). It is not drawn by hand and not generated:
it is a fluid simulation, rendered here.

## Source

- **What:** "Midair Explosion 01", one of JangaFX's free EmberGen VDB
  animations.
- **Where:** https://jangafx.com/software/embergen/download/free-vdb-animations
  (the download is `Midair_Explosion_01.rar`, SHA-256
  `a0d3429e44611fa46872b61657608e97a398dc44e1da031462c964b6f0d380b6`).
- **Licence:** CC0 1.0, public domain. The archive's LICENSE.txt: "VDB SETS
  WERE CREATED WITH EMBERGEN BY JANGAFX LLC (https://jangafx.com)",
  Creative Commons Public Domain CC0,
  https://creativecommons.org/publicdomain/zero/1.0/. Its README asks that
  users spread the word, so the game credits JangaFX and EmberGen anyway
  (the in-game credits, NOTICE, the README).
- **Files used:** `embergen_midair_explosion_a_1.vdb` to
  `embergen_midair_explosion_a_125.vdb` (frame 0 is empty). The sheet takes
  64 of them, evenly: frame `1 + round(k * 124 / 63)` for k = 0 to 63. Each
  has `density`, `flames` and `temperature` grids; the render uses
  `density` and `flames`.

The VDBs are 1.6 GB and are never committed, here or anywhere; only the
sheet is.

## Rendering it again

Blender 5.2 headless, Cycles on CUDA. On this project's machine the first
GPU is the desktop's and may be a pilot's, so only the second is shown:

    CUDA_DEVICE_ORDER=PCI_BUS_ID CUDA_VISIBLE_DEVICES=1 \
      blender -b -P tools/explosions/render.py -- \
        --vdb ~/Desktop/fdfpv-loop/explosions/vdb --out assets/explosions

About 1 min 40 s on one RTX 3060 Ti. Blender's peak resident memory was
6.8 GB (measured with `/usr/bin/time -v`; most of it is the grids of all 126
frames, read once to frame the camera). `--test N` renders simulation
frame N alone to `midair-test-N.webp` for a quick look; `--work DIR` keeps
the per frame EXRs. ffmpeg writes the lossless WebP.

The last line it prints is the sheet's constants: its layout, and the
point of a cell that the game puts where the explosion went off (the
fire's middle over the simulation's first second, so a pilot 6 m from it
is in the fire, not under it). src/render/explosion.js keeps them in
`SHEET`; copy them across when the layout or the framing changes. A
second render is the same picture to within Cycles' sampling noise, not
byte for byte.

## What is in the sheet

8 x 8 cells of 256 px, 2048 x 2048, frames left to right and top to
bottom. Opaque RGB, three channels for the renderer's two pools (the header
of render.py has the detail):

| channel | holds | drawn by |
| --- | --- | --- |
| R | the fire's light leaving the volume, square root, over the sheet's 99.7th percentile | the additive pool, coloured by brightness |
| G | the smoke's shade under a sun from above, 0 to 1 | the blended pool, tinted |
| B | the smoke's opacity | the blended pool |

1.6 MB to download. On the GPU it is RGBA8 whatever the file: 16 MiB, 21.3
MiB with its mipmaps, one texture shared by every explosion layer in the
page.

Why not the free ground explosion set as well, for an attacker reaching
its target: it was looked at (a quick sheet, not in the game) and not
taken. The mid air one already reads at an intake on the dam face; the
ground set is exported with a different up axis, so it would need its own
camera; and drawing it only for an arrival would mean carrying the
explosion's kind through the replay files (src/replay/warrec.js and
paper.js keep a boom as a place and a size), for a second 21 MiB texture.
