# colour.py: the numbers behind "too green, too even, no air".
#
#   python3 tools/swiss2-loop/colour.py REF_DIR ROUND_DIR [ROUND_DIR ...]
#
# Per view in the first ROUND_DIR's stats.json, and for its reference
# photograph, prints:
#   S      mean HSV saturation over the frame, 0 to 1
#   V      mean HSV value
#   Sg     mean saturation of the green pixels only (hue 60 to 170 deg),
#          the floor and the forests, which is where the eye says "game"
#   far/near  local contrast (the mean standard deviation of luminance in
#          16 px blocks) in the frame's upper middle band, 30 to 50 per cent
#          down, over the same in its bottom band, 70 to 100 per cent. A
#          photograph's far walls lose contrast to the air, so this is well
#          under one; a model with no air keeps it near one. The bands are
#          a proxy for distance: sky in the far band is excluded (blocks
#          whose mean is bluer and brighter than any ground).
#   blue   in the far band, mean (B - G) / V of the non sky blocks: how far
#          the far ground has gone blue grey.
# Every image is first cropped to 16:9 and scaled to 640x360 as sheet.py
# does, so a photograph and a render are measured over the same framing.
#
# This file is part of WebFPVSimulator, GPLv3; see the header of any
# JavaScript file in this repository for the full notice.
import json, os, sys
from PIL import Image
import numpy as np

W, H, B = 640, 360, 16


def load(path):
    im = Image.open(path).convert('RGB')
    r = max(W / im.width, H / im.height)
    im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
    x, y = (im.width - W) // 2, (im.height - H) // 2
    return np.asarray(im.crop((x, y, x + W, y + H)), dtype=np.float32) / 255.0


def measure(a):
    mx = a.max(axis=2)
    mn = a.min(axis=2)
    s = np.where(mx > 1e-4, (mx - mn) / np.maximum(mx, 1e-4), 0.0)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    d = np.maximum(mx - mn, 1e-4)
    hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    green = (hue > 60) & (hue < 170) & (s > 0.08)
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b

    def band(y0, y1):
        stds, blues = [], []
        for y in range(int(H * y0), int(H * y1) - B + 1, B):
            for x in range(0, W - B + 1, B):
                blk = a[y:y + B, x:x + B]
                m = blk.reshape(-1, 3).mean(axis=0)
                sky = m[2] > m[1] + 0.02 and m.mean() > 0.55
                if sky:
                    continue
                stds.append(lum[y:y + B, x:x + B].std())
                blues.append((m[2] - m[1]) / max(m.max(), 1e-3))
        return (float(np.mean(stds)) if stds else float('nan'), float(np.mean(blues)) if blues else float('nan'))

    far, blue = band(0.30, 0.50)
    near, _ = band(0.70, 1.0)
    return {
        'S': float(s.mean()),
        'V': float(mx.mean()),
        'Sg': float(s[green].mean()) if green.any() else float('nan'),
        'fn': far / near if near > 0 else float('nan'),
        'blue': blue,
    }


def fmt(m):
    return f"S {m['S']:.2f}  V {m['V']:.2f}  Sg {m['Sg']:.2f}  far/near {m['fn']:.2f}  blue {m['blue']:+.2f}"


ref_dir, rounds = sys.argv[1], sys.argv[2:]
views = json.load(open(os.path.join(rounds[0], 'stats.json')))
totals = {k: [] for k in ['ref'] + rounds}
for v in views:
    print(v['id'])
    ref = measure(load(os.path.join(ref_dir, v['ref'] + '.jpg')))
    totals['ref'].append(ref)
    print(f"  {'ref ' + v['ref']:<28} {fmt(ref)}")
    for rd in rounds:
        p = os.path.join(rd, v['id'] + '.png')
        if not os.path.exists(p):
            continue
        m = measure(load(p))
        totals[rd].append(m)
        print(f"  {os.path.basename(rd.rstrip('/')):<28} {fmt(m)}")
print('mean over the views')
for k, ms in totals.items():
    if ms:
        avg = {q: float(np.nanmean([m[q] for m in ms])) for q in ms[0]}
        print(f"  {os.path.basename(k.rstrip('/')):<28} {fmt(avg)}")
