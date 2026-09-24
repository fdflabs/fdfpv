# sheet.py: contact sheets for the swiss2 photorealism loop.
#
#   python3 tools/swiss2-loop/sheet.py REF_DIR OUT_PNG ROUND_DIR [PREV_ROUND_DIR]
#
# One row per view in ROUND_DIR/stats.json: the reference photograph, then
# the previous round's render when given, then this round's, each 640 px
# wide, the view's id and numbers written under it. What a round is judged
# on, and what the owner sees.
#
# This file is part of WebFPVSimulator, GPLv3; see the header of any
# JavaScript file in this repository for the full notice.
import json, os, sys
from PIL import Image, ImageDraw

ref_dir, out_png, cur = sys.argv[1], sys.argv[2], sys.argv[3]
prev = sys.argv[4] if len(sys.argv) > 4 else None
views = json.load(open(os.path.join(cur, 'stats.json')))
W, H, LABEL = 640, 360, 22
cols = 3 if prev else 2
sheet = Image.new('RGB', (W * cols, (H + LABEL) * len(views)), (20, 20, 20))
draw = ImageDraw.Draw(sheet)

def fit(path):
    if not path or not os.path.exists(path):
        return Image.new('RGB', (W, H), (60, 0, 0))
    im = Image.open(path).convert('RGB')
    r = max(W / im.width, H / im.height)
    im = im.resize((round(im.width * r), round(im.height * r)))
    x, y = (im.width - W) // 2, (im.height - H) // 2
    return im.crop((x, y, x + W, y + H))

for row, v in enumerate(views):
    y = row * (H + LABEL)
    cells = [os.path.join(ref_dir, v['ref'] + '.jpg')]
    if prev:
        cells.append(os.path.join(prev, v['id'] + '.png'))
    cells.append(os.path.join(cur, v['id'] + '.png'))
    for c, path in enumerate(cells):
        sheet.paste(fit(path), (c * W, y))
    s = v.get('stats') or {}
    draw.text((6, y + H + 4), f"{v['id']}  ref {v['ref']}  calls {s.get('calls')}  tris {s.get('triangles')}  frame {round(v.get('frameMs') or 0, 1)} ms", fill=(230, 230, 230))
sheet.save(out_png)
print(out_png, sheet.size)
