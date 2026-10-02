# ground.py: the numbers behind "a smear", "a lawn" and "a pink beach".
#
#   python3 tools/swiss2-loop/ground.py IMAGE_OR_DIR [IMAGE_OR_DIR ...]
#
# Per image (every .png and .jpg in a folder, renders and photographs
# alike), over its ground: the frame cropped to 16:9 and scaled to
# 1280x720, the sky taken out (bright, blue, unsaturated pixels in the
# upper half, and anything above the first row that is mostly ground).
#
#   veg h s v   vegetation pixels (HSV hue 50 to 170 deg, saturation over
#               0.12): median hue in degrees, median saturation and value,
#               and in brackets the saturation's interquartile range, how
#               varied the greens are;
#   veg%        the vegetation's share of the ground;
#   soil r/g b/g  bare soil pixels (hue under 40 or over 340 deg, saturation
#               over 0.25): the median linear red over green and blue over
#               green. Terra roxa is a deep red: well over 2 in red over
#               green. A ratio is the soil's own hue whatever the exposure;
#   soil%       the soil's share of the ground;
#   tile        the strongest repeat in the bottom 40 per cent of the frame:
#               the luminance high passed (less its 6 px blur), its
#               autocorrelation by FFT, the largest value at least 12 px
#               off the centre. A texture tiled across a field repeats and
#               scores high; ground with no repeat sits near the noise
#               floor, about 0.1 to 0.2;
#   hf          detail in the bottom quarter, the ground nearest the lens
#               in a low pass: the standard deviation of luminance less its
#               1.5 px blur, over the mean luminance. A magnified 10 m
#               pixel is a smear and scores low.
#
# A render and a photograph are under different suns and exposures, so
# compare hue, saturation, the ratios and the spreads; value is printed
# for the record.
#
# This file is part of WebFPVSimulator, GPLv3; see the header of any
# JavaScript file in this repository for the full notice.
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

W, H = 1280, 720


def load(path):
    im = Image.open(path).convert('RGB')
    r = max(W / im.width, H / im.height)
    im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
    x, y = (im.width - W) // 2, (im.height - H) // 2
    return im.crop((x, y, x + W, y + H))


def hsv(a):
    mx = a.max(-1)
    mn = a.min(-1)
    d = mx - mn
    s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    dd = np.maximum(d, 1e-6)
    h = np.where(mx == r, ((g - b) / dd) % 6, np.where(mx == g, (b - r) / dd + 2, (r - g) / dd + 4)) * 60
    h = np.where(d > 0, h, 0)
    return h, s, mx


def linear(a):
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def blur(lum, radius):
    im = Image.fromarray(np.clip(lum * 255, 0, 255).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32) / 255


def ground_mask(a, h, s, v):
    sky = (h > 180) & (h < 260) & (s < 0.55) & (v > 0.45)
    sky[H // 2:] = False
    rows = (~sky).mean(1)
    first = int(np.argmax(rows > 0.9)) if (rows > 0.9).any() else H
    m = ~sky
    m[:first] = False
    return m


def tile_peak(lum):
    band = lum[int(H * 0.6):]
    hp = band - blur(band, 6)
    hp = hp - hp.mean()
    f = np.fft.rfft2(hp)
    ac = np.fft.irfft2(f * np.conj(f), s=hp.shape)
    ac = np.fft.fftshift(ac) / max(ac.flat[0], 1e-12)
    cy, cx = ac.shape[0] // 2, ac.shape[1] // 2
    yy, xx = np.ogrid[:ac.shape[0], :ac.shape[1]]
    far = (yy - cy) ** 2 + (xx - cx) ** 2 >= 12 ** 2
    return float(ac[far].max())


def hf(lum):
    band = lum[int(H * 0.75):]
    return float((band - blur(band, 1.5)).std() / max(band.mean(), 1e-6))


def measure(path):
    im = load(path)
    a = np.asarray(im, dtype=np.float32) / 255
    h, s, v = hsv(a)
    g = ground_mask(a, h, s, v)
    lum = a @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    veg = g & (h >= 50) & (h <= 170) & (s > 0.12)
    soil = g & ((h < 40) | (h > 340)) & (s > 0.25)
    out = {'tile': tile_peak(lum), 'hf': hf(lum), 'veg%': veg.sum() / max(g.sum(), 1), 'soil%': soil.sum() / max(g.sum(), 1)}
    if veg.sum() > 500:
        q = np.percentile(s[veg], [25, 75])
        out['veg'] = (np.median(h[veg]), np.median(s[veg]), np.median(v[veg]), q[1] - q[0])
    if soil.sum() > 500:
        lin = linear(a[soil])
        gg = np.maximum(lin[:, 1], 1e-4)
        out['soil'] = (np.median(lin[:, 0] / gg), np.median(lin[:, 2] / gg))
    return out


def row(name, m):
    if 'veg' in m:
        vh, vs, vv, vq = m['veg']
        veg = f'{vh:5.0f} {vs:4.2f} {vv:4.2f} ({vq:4.2f})'
    else:
        veg = f'{"":5} {"":4} {"":4}  {"":4} '
    soil = f'{m["soil"][0]:5.2f} {m["soil"][1]:5.2f}' if 'soil' in m else f'{"":5} {"":5}'
    return f'{name:34} {veg} {m["veg%"]:5.0%} | {soil} {m["soil%"]:5.0%} | {m["tile"]:5.2f} {m["hf"]:5.3f}'


def main(args):
    files = []
    for a in args:
        if os.path.isdir(a):
            files += sorted(os.path.join(a, f) for f in os.listdir(a) if f.lower().endswith(('.png', '.jpg', '.jpeg')))
        else:
            files.append(a)
    print(f'{"image":34} {"veg h":>5} {"s":>4} {"v":>4} {"(iqr)":>6} {"veg%":>5} | {"r/g":>5} {"b/g":>5} {"soil%":>5} | {"tile":>5} {"hf":>5}')
    for f in files:
        print(row(os.path.relpath(f, os.path.dirname(os.path.dirname(f)))[-34:], measure(f)))


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit('usage: ground.py IMAGE_OR_DIR [IMAGE_OR_DIR ...]')
    main(sys.argv[1:])
