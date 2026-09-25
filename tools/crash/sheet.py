# sheet.py: contact sheets for the crash suite.
#
#   python3 tools/crash/sheet.py SUMMARY_JSON FRAMES_DIR OUT_DIR
#
# One sheet per aircraft, one row per scenario: the four frames
# tools/crash/frames.js took (before, impact, just after, at rest), each
# 480 px wide, then a panel with the scenario, the description of the
# reference still it is judged against (a description, not the footage:
# docs/CRASH-REFERENCES.md has the sources), and its bands, failing ones
# first. Built the way tools/swiss2-loop/sheet.py builds the photoreal
# loop's sheets. What the lead scores a round on, 1 absurd to 9
# indistinguishable (docs/CRASH-PLAN.md).
#
# This file is part of WebFPVSimulator, GPLv3; see the header of any
# JavaScript file in this repository for the full notice.
import json, os, sys, textwrap
from PIL import Image, ImageDraw

summary, frames, out = sys.argv[1], sys.argv[2], sys.argv[3]
report = json.load(open(summary))
W, H, LABEL, PANEL = 480, 270, 20, 560
FRAMES = ['before', 'impact', 'after', 'rest']

def fit(path):
    if not os.path.exists(path):
        return Image.new('RGB', (W, H), (60, 0, 0))
    im = Image.open(path).convert('RGB')
    r = max(W / im.width, H / im.height)
    im = im.resize((round(im.width * r), round(im.height * r)))
    x, y = (im.width - W) // 2, (im.height - H) // 2
    return im.crop((x, y, x + W, y + H))

by_craft = {}
for s in report['scenarios']:
    by_craft.setdefault(s['craft'], []).append(s)

for craft, rows in by_craft.items():
    sheet = Image.new('RGB', (W * 4 + PANEL, (H + LABEL) * len(rows)), (20, 20, 20))
    draw = ImageDraw.Draw(sheet)
    for i, s in enumerate(rows):
        y = i * (H + LABEL)
        for c, which in enumerate(FRAMES):
            sheet.paste(fit(os.path.join(frames, f"{s['id']}-{which}.jpg")), (c * W, y))
            ms = (s.get('frames') or {}).get(which)
            draw.text((c * W + 6, y + H + 4), f"{which}  {'' if ms is None else round(ms / 1000, 2)} s", fill=(230, 230, 230))
        x = 4 * W + 10
        lines = [f"{s['id']}  {s['status'].upper()}", s['title']]
        if s.get('blocked'):
            lines.append(f"BLOCKED: {s['blocked']}")
        if s.get('standIn'):
            lines.append(f"STAND IN: {s['standIn']}")
        lines.append('')
        lines.append(f"Reference: {s.get('refStill') or 'none written'}")
        lines.append('')
        checks = sorted(s['checks'], key=lambda c: c['status'] == 'pass')
        for c in checks:
            v = c.get('value')
            if isinstance(v, float):
                v = round(v, 2)
            lines.append(f"{'pass' if c['status'] == 'pass' else 'FAIL'}  {c['metric']}: {v}  (band {c.get('band')})")
        text = []
        for l in lines:
            text.extend(textwrap.wrap(l, 88) or [''])
        draw.multiline_text((x, y + 6), '\n'.join(text[: (H + LABEL - 12) // 12]), fill=(230, 230, 230), spacing=1)
    path = os.path.join(out, f'{craft}.png')
    sheet.save(path)
    print(path, sheet.size)
