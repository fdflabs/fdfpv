# look_measure.py: the numbers behind "sky, light, air and colour" for a
# rendered view against its photograph (docs/ITAIPU-LOOP.md, round 4 A).
#
#   python3 tools/itaipu/look_measure.py REF_DIR VIEW=REF [VIEW=REF ...] -- ROUND_DIR [ROUND_DIR ...]
#
# Per pair, for the photograph REF_DIR/REF.jpg and for ROUND_DIR/VIEW.png
# in each round folder, over a frame cropped to 16:9 and scaled to 640x360
# as tools/swiss2-loop/sheet.py does:
#   L       mean Rec. 709 luminance of the display values, the exposure
#   sky/g   mean luminance of the sky blocks over that of the ground
#           blocks (16 px blocks; sky by colour.py's test, or a smooth,
#           bright block in the upper half); blank with no sky in frame
#   p5 p95  the ground's 5th and 95th percentile of luminance: a grey wash
#           lifts p5, crushed blacks drop it, a dull light drops p95
#   f/n     the far band's local contrast (30 to 50 per cent down) over
#           the near band's (70 to 100), land blocks only (a block half
#           water is dropped: the water's ripples are not the air): the
#           air's veil, under one in a photograph of distance
#   blue    in the far band, mean (B - G) / V of those land blocks: how
#           far the distance has gone blue grey
#   Sg      mean HSV saturation of the green ground pixels (hue 60 to 170)
#   Sw      mean HSV saturation of the blue-green ground pixels (hue 170
#           to 250), which in these frames is the water
#   hiW     mean (R - B) / V over the ground's brightest twentieth: the
#           warmth of the sunlit highlights
#   shB     mean (B - R) / V over the ground's darkest fifth: how blue the
#           shade is with the sky that lights it (from the air, the
#           darkest fifth is often the water, which is bluer still)
#
# This file is part of the Paraguayan Drone Combat Simulator, GPLv3; see the header of any
# JavaScript file in this repository for the full notice.
import os
import sys

import numpy as np
from PIL import Image

W, H, B = 640, 360, 16


def load(path):
    im = Image.open(path).convert('RGB')
    r = max(W / im.width, H / im.height)
    im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
    x, y = (im.width - W) // 2, (im.height - H) // 2
    return np.asarray(im.crop((x, y, x + W, y + H)), dtype=np.float32) / 255.0


def measure(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    mx = a.max(axis=2)
    mn = a.min(axis=2)
    s = np.where(mx > 1e-4, (mx - mn) / np.maximum(mx, 1e-4), 0.0)
    d = np.maximum(mx - mn, 1e-4)
    hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60

    sky = np.zeros((H, W), bool)
    for y in range(0, H - B + 1, B):
        for x in range(0, W - B + 1, B):
            blk = a[y:y + B, x:x + B].reshape(-1, 3)
            m = blk.mean(axis=0)
            smooth = lum[y:y + B, x:x + B].std() < 0.02 and m.mean() > 0.5 and y < H / 2
            if (m[2] > m[1] + 0.02 and m.mean() > 0.55) or smooth:
                sky[y:y + B, x:x + B] = True
    ground = ~sky

    water = ~sky & (hue >= 170) & (hue < 250) & (s > 0.08)

    def band(y0, y1):
        stds, blues = [], []
        for y in range(int(H * y0), int(H * y1) - B + 1, B):
            for x in range(0, W - B + 1, B):
                if sky[y, x] or water[y:y + B, x:x + B].mean() > 0.5:
                    continue
                m = a[y:y + B, x:x + B].reshape(-1, 3).mean(axis=0)
                stds.append(lum[y:y + B, x:x + B].std())
                blues.append((m[2] - m[1]) / max(m.max(), 1e-3))
        return (np.mean(stds) if stds else np.nan, np.mean(blues) if blues else np.nan)

    far, blue = band(0.30, 0.50)
    near, _ = band(0.70, 1.0)
    gl = lum[ground]
    p5, p20, p95 = np.percentile(gl, [5, 20, 95]) if gl.size else (np.nan,) * 3
    green = ground & (hue > 60) & (hue < 170) & (s > 0.08)
    vmax = np.maximum(mx, 1e-3)
    hi = ground & (lum >= p95)
    lo = ground & (lum <= p20)
    return {
        'L': float(lum.mean()),
        'skyg': float(lum[sky].mean() / max(gl.mean(), 1e-3)) if sky.sum() > 0.03 * sky.size else np.nan,
        'p5': float(p5),
        'p95': float(p95),
        'fn': float(far / near) if near > 0 else np.nan,
        'blue': float(blue),
        'Sg': float(s[green].mean()) if green.any() else np.nan,
        'Sw': float(s[water].mean()) if water.sum() > 200 else np.nan,
        'hiW': float(((r - b) / vmax)[hi].mean()) if hi.any() else np.nan,
        'shB': float(((b - r) / vmax)[lo].mean()) if lo.any() else np.nan,
    }


KEYS = ['L', 'skyg', 'p5', 'p95', 'fn', 'blue', 'Sg', 'Sw', 'hiW', 'shB']
HEAD = ['L', 'sky/g', 'p5', 'p95', 'f/n', 'blue', 'Sg', 'Sw', 'hiW', 'shB']


def row(name, m):
    cells = ' | '.join('' if np.isnan(m[k]) else f'{m[k]:+.2f}' if k in ('blue', 'hiW', 'shB') else f'{m[k]:.2f}' for k in KEYS)
    return f'| {name} | {cells} |'


args = sys.argv[1:]
cut = args.index('--')
ref_dir, pairs, rounds = args[0], [p.split('=') for p in args[1:cut]], args[cut + 1:]
print('| view / source | ' + ' | '.join(HEAD) + ' |')
print('| --- ' * (len(HEAD) + 1) + '|')
sums = {}
for view, ref in pairs:
    m = measure(load(os.path.join(ref_dir, ref + '.jpg')))
    sums.setdefault('ref', []).append(m)
    print(row(f'**{view}** ref {ref}', m))
    for rd in rounds:
        p = os.path.join(rd, view + '.png')
        if not os.path.exists(p):
            continue
        m = measure(load(p))
        name = os.path.basename(rd.rstrip('/'))
        sums.setdefault(name, []).append(m)
        print(row(f'{view} {name}', m))
for name, ms in sums.items():
    avg = {k: float(np.nanmean([m[k] for m in ms])) for k in KEYS}
    print(row(f'mean {name}', avg))
# The mean distance to the photographs, per round, on each number.
if 'ref' in sums:
    for name, ms in sums.items():
        if name == 'ref':
            continue
        gaps = {k: float(np.nanmean([abs(m[k] - r[k]) for m, r in zip(ms, sums['ref'])])) for k in KEYS}
        print(row(f'mean abs gap {name}', gaps))
