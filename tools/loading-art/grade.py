# grade.py: the key art behind the title, from the raw frames to the
# shipped files.
#
#   python3 tools/loading-art/grade.py RAW_DIR assets/keyart [SHOT,SHOT]
#
# RAW_DIR holds wide.png and tall.png from scripts/loading-art.js, which
# renders them in the game; this only grades them. Every step is a
# per-pixel function of the frame or of the pixel's position: a downscale,
# an exposure, a contrast curve, a split tone (cool shadows, warm light), a
# little less saturation, a darker sky at the top edge and a vignette.
# Nothing is painted in, moved or generated.
#
# WebP only: the game needs WebGL 2, and every browser with WebGL 2 decodes
# WebP, so a JPEG fallback would be bytes nobody fetches.
#
# This file is part of WebFPVSimulator, GPLv3; see the header of any
# JavaScript file in this repository for the full notice.
import os
import sys

import numpy as np
from PIL import Image

# Output size per frame: 1920 wide for a desktop, and a phone's portrait at
# twice the CSS pixels of a 390 by 844 screen.
SIZES = {'wide': (1920, 1080), 'tall': (780, 1688), 'boom-wide': (3840, 2160)}
# WebP quality. The wide file has to stay under about 350 KB so it never
# competes with the boot for the connection (index.html's preload says why).
QUALITY = 88

EXPOSURE = 0.9
# Contrast about a mid grey: a smooth S, strength 0 is none.
CONTRAST = 0.42
PIVOT = 0.42
# Split tone: multipliers for the darkest and the brightest pixels, mixed
# by luminance.
SHADOW_TINT = np.array([0.88, 0.98, 1.08])
LIGHT_TINT = np.array([1.16, 1.0, 0.78])
SATURATION = 0.94
# How much darker the top edge is than the middle, fading out by TOP_FADE
# of the height: the cloud deck reads heavier, as a sunset's does.
TOP_DARK = 0.38
TOP_FADE = 0.42
# Vignette: the corners' darkening, and the radius (as a share of the
# half diagonal) where it starts.
VIGNETTE = 0.62
VIGNETTE_START = 0.35


def grade(img, size):
    img = img.convert('RGB').resize(size, Image.LANCZOS)
    x = np.asarray(img, dtype=np.float32) / 255.0
    x = x * EXPOSURE
    # The S: a smoothstep blended in by CONTRAST, pivoted so mid grey holds.
    t = np.clip(x, 0.0, 1.0)
    s = np.where(t < PIVOT,
                 PIVOT * (t / PIVOT) ** (1.0 + CONTRAST),
                 1.0 - (1.0 - PIVOT) * ((1.0 - t) / (1.0 - PIVOT)) ** (1.0 + CONTRAST))
    x = s
    lum = (x @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32))[..., None]
    x = lum + (x - lum) * SATURATION
    k = np.clip(lum, 0.0, 1.0)
    x = x * (SHADOW_TINT * (1.0 - k) + LIGHT_TINT * k)
    h, w = x.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    top = 1.0 - TOP_DARK * np.clip(1.0 - (yy / h) / TOP_FADE, 0.0, 1.0) ** 1.6
    # Elliptical: distance in units of each half axis, so a phone's tall
    # frame vignettes its sides and its ends alike.
    r = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2) / np.sqrt(2.0)
    v = 1.0 - VIGNETTE * np.clip((r - VIGNETTE_START) / (1.0 - VIGNETTE_START), 0.0, 1.0) ** 1.8
    x = x * (top * v)[..., None]
    return Image.fromarray((np.clip(x, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8))


def main():
    raw, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    # A third argument names the shots to grade, comma separated.
    only = sys.argv[3].split(',') if len(sys.argv) > 3 else list(SIZES)
    for name in only:
        size = SIZES[name]
        src = os.path.join(raw, f'{name}.png')
        dst = os.path.join(out, f'{name}.webp')
        grade(Image.open(src), size).save(dst, 'WEBP', quality=QUALITY, method=6)
        print(f'{src} -> {dst} {os.path.getsize(dst) // 1024} KB')


if __name__ == '__main__':
    main()
