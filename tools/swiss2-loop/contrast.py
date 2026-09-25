# contrast.py: the numbers behind "evenly lit, flat, no depth".
#
#   python3 tools/swiss2-loop/contrast.py REF_DIR ROUND_DIR [ROUND_DIR ...]
#
# colour.py measures the colour; this measures the light. Per view in the
# first ROUND_DIR's stats.json, and for its reference photograph, over
# the ground only (sky blocks dropped by colour.py's own test):
#   lc     local contrast: the mean standard deviation of luminance in
#          16 px blocks, over the whole frame. A photograph of a valley in
#          sun has lit faces next to shaded ones and crisp light edges on
#          the ridges; an evenly lit render has neither.
#   p5 p95 the 5th and 95th percentiles of luminance: how deep the
#          shadows go and how bright the lit faces get.
#   layer  mean luminance of the far band (30 to 50 per cent down) less
#          that of the near band (70 to 100): aerial perspective's
#          layering, each ridge lighter than the one in front, is
#          positive; a flat veil is near zero.
#   shB    in the darkest fifth of the ground, mean (B - R) / V: whether
#          the shade is lit by the blue sky (positive) or is a grey or
#          brown darkening (near zero or below).
# Luminance is Rec. 709 on the display values. Every image is cropped
# and scaled as colour.py and sheet.py do.
#
# This file is part of WebFPVSimulator, GPLv3; see the header of any
# JavaScript file in this repository for the full notice.
import json, os, sys
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
    lum = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    ground = np.zeros((H, W), bool)
    stds = []
    for y in range(0, H - B + 1, B):
        for x in range(0, W - B + 1, B):
            m = a[y:y + B, x:x + B].reshape(-1, 3).mean(axis=0)
            if m[2] > m[1] + 0.02 and m.mean() > 0.55:
                continue
            ground[y:y + B, x:x + B] = True
            stds.append(lum[y:y + B, x:x + B].std())
    g = lum[ground]
    if g.size == 0:
        return {q: float('nan') for q in ('lc', 'p5', 'p95', 'layer', 'shB')}
    rows = np.arange(H)[:, None].repeat(W, axis=1)
    far = ground & (rows >= H * 0.30) & (rows < H * 0.50)
    near = ground & (rows >= H * 0.70)
    p5, p20, p95 = np.percentile(g, [5, 20, 95])
    dark = ground & (lum <= p20)
    rgb = a[dark]
    shb = float(np.mean((rgb[:, 2] - rgb[:, 0]) / np.maximum(rgb.max(axis=1), 1e-3)))
    return {
        'lc': float(np.mean(stds)),
        'p5': float(p5),
        'p95': float(p95),
        'layer': float(lum[far].mean() - lum[near].mean()) if far.any() and near.any() else float('nan'),
        'shB': shb,
    }


def fmt(m):
    return f"lc {m['lc']:.3f}  p5 {m['p5']:.2f}  p95 {m['p95']:.2f}  layer {m['layer']:+.2f}  shB {m['shB']:+.2f}"


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
