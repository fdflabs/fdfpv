/*
 * decalart.js: the paint shop's decal pictures (configs/paint.js), drawn
 * into a 2D canvas context.
 *
 * The lettering and the shapes are drawn from strokes and paths, the same
 * on every machine, with no font to load and no image to fetch. The
 * sponsor style shapes are generic marks, no maker's logo or name. The
 * renderer draws them into a model's decal atlas (src/render/decals.js)
 * and the hangar into its thumbnails (src/ui/hangar-paint.js), so this
 * file imports no three.js.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */
/*
 * THE NUMBERS' STROKES, per digit, in a box 0.66 wide and 1 high, y down:
 * polylines through the corners of a condensed racing figure, stroked
 * STROKE wide, first in the second colour OUTLINE wider for the outline.
 */
const STROKE = 0.17;
const OUTLINE = 0.065;
const L = 0.15;
const R = 0.51;
const T = 0.15;
const B = 0.85;
const M = 0.5;
const C = (L + R) / 2;
const DIGITS = {
  0: [[[L, T], [R, T], [R, B], [L, B], [L, T], [R, T]]],
  1: [[[C - 0.13, T + 0.12], [C + 0.03, T], [C + 0.03, B]]],
  2: [[[L, T], [R, T], [R, M], [L, M], [L, B], [R, B]]],
  3: [[[L, T], [R, T], [R, B], [L, B]], [[L + 0.06, M], [R, M]]],
  4: [[[L, T], [L, M + 0.08], [R, M + 0.08]], [[R - 0.04, T], [R - 0.04, B]]],
  5: [[[R, T], [L, T], [L, M], [R, M], [R, B], [L, B]]],
  6: [[[R, T], [L, T], [L, B], [R, B], [R, M], [L, M]]],
  7: [[[L, T], [R, T], [C - 0.02, B]]],
  8: [[[L, T], [R, T], [R, B], [L, B], [L, T], [R, T]], [[L, M], [R, M]]],
  9: [[[L, B], [R, B], [R, T], [L, T], [L, M], [R, M]]],
};
const DIGIT_W = 0.66;

function polyline(g, pts, radius) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i += 1) {
    if (radius > 0) {
      g.arcTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], radius);
    } else {
      g.lineTo(pts[i][0], pts[i][1]);
    }
  }
  g.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
}

/*
 * A STENCIL'S BRIDGES: a stencilled letter is cut from a sheet, so the
 * paint breaks where the sheet held its middle. Cut out of what is drawn,
 * a narrow band across at mid height and one up the middle of each
 * figure, which reads as stencil on any letter and keeps every shape.
 */
function stencilCut(g, w, count) {
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = '#000';
  g.fillRect(0, 0.47, w, 0.06);
  const bw = w / Math.max(1, count);
  for (let i = 0; i < count; i += 1) {
    g.fillRect(i * bw + bw * 0.48, 0.12, bw * 0.04, 0.2);
  }
  g.restore();
}

function drawNumber(g, d, w) {
  const text = d.t;
  const bw = w / text.length;
  const round = d.f === 'round';
  const skew = d.f === 'italic' ? 0.2 : 0;
  g.lineJoin = round ? 'round' : 'miter';
  g.lineCap = round ? 'round' : 'square';
  g.miterLimit = 4;
  for (const pass of [0, 1]) {
    g.strokeStyle = pass === 0 ? d.c2 : d.c;
    g.lineWidth = pass === 0 ? STROKE + OUTLINE * 2 : STROKE;
    for (let i = 0; i < text.length; i += 1) {
      g.save();
      /* Each figure centred in its share of the width; the italic's slant
       * is about the figure's middle so it stays inside the cell. */
      g.translate(i * bw + (bw - DIGIT_W) / 2, 0);
      if (skew) {
        g.transform(1, 0, -skew, 1, skew * 0.5, 0);
      }
      for (const line of DIGITS[text[i]]) {
        polyline(g, line, round ? 0.13 : 0);
        g.stroke();
      }
      g.restore();
    }
  }
  if (d.f === 'stencil') {
    stencilCut(g, w, text.length);
  }
}

/*
 * The pilot's own words, upper case, in the lettering the decal names:
 * drawn with the browser's heavy sans at a hundred times the box and
 * scaled down, so the glyphs are outlines and not a tiny bitmap, and
 * squeezed or spread to fill the width the decal was given.
 */
function drawText(g, d, w) {
  const S = 100;
  g.save();
  g.scale(1 / S, 1 / S);
  const style = d.f === 'italic' ? 'italic 800' : '800';
  g.font = `${style} ${0.8 * S}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.lineJoin = d.f === 'round' ? 'round' : 'miter';
  const measured = Math.max(1, g.measureText(d.t).width);
  const k = (w * S * 0.94) / measured;
  g.translate(w * S * 0.03, 0.54 * S);
  g.scale(k, 1);
  g.lineWidth = 0.14 * S / Math.max(0.6, k);
  g.strokeStyle = d.c2;
  g.strokeText(d.t, 0, 0);
  g.fillStyle = d.c;
  g.fillText(d.t, 0, 0);
  g.restore();
  if (d.f === 'stencil') {
    stencilCut(g, w, d.t.length);
  }
}

/* The flag of Paraguay as a decal: its three bands, and the star of the
 * arms in a ring at the middle. The colours are the flag's own. */
const PY = { red: '#d52b1e', white: '#ffffff', blue: '#0038a8', gold: '#f2c500', green: '#2e7d32' };

function fillPath(g, pts) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) {
    g.lineTo(p[0], p[1]);
  }
  g.closePath();
}

/* Every kind, drawn into a box `w` wide and 1 high (y down), in the
 * decal's colour `c` and its second colour `c2`. */
const DRAW = {
  num: drawNumber,
  stripe(g, d, w) {
    g.fillStyle = d.c2;
    g.fillRect(0, 0.02, w, 0.07);
    g.fillRect(0, 0.91, w, 0.07);
    g.fillStyle = d.c;
    g.fillRect(0, 0.14, w, 0.3);
    g.fillRect(0, 0.56, w, 0.3);
  },
  checker(g, d, w) {
    const rows = 2;
    const cols = Math.max(1, Math.round(w * rows));
    const cw = w / cols;
    for (let i = 0; i < cols; i += 1) {
      for (let j = 0; j < rows; j += 1) {
        g.fillStyle = (i + j) % 2 ? d.c2 : d.c;
        g.fillRect(i * cw, j / rows, cw + 0.002, 1 / rows + 0.002);
      }
    }
  },
  chevron(g, d, w) {
    const k = w / 3.2;
    g.lineJoin = 'miter';
    for (let i = 0; i < 3; i += 1) {
      const x = 0.12 * k + i * 1.0 * k;
      fillPath(g, [[x, 0.06], [x + 0.55 * k, 0.06], [x + 1.2 * k, 0.5], [x + 0.55 * k, 0.94], [x, 0.94], [x + 0.65 * k, 0.5]]);
      g.lineWidth = 0.06;
      g.strokeStyle = d.c2;
      g.stroke();
      g.fillStyle = d.c;
      g.fill();
    }
  },
  star(g, d, w) {
    const cx = w / 2;
    const r = 0.44;
    const pts = [];
    for (let i = 0; i < 10; i += 1) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.42 : r;
      pts.push([cx + rr * Math.cos(a) * Math.min(1, w), 0.53 + rr * Math.sin(a)]);
    }
    g.lineJoin = 'miter';
    fillPath(g, pts);
    g.lineWidth = 0.08;
    g.strokeStyle = d.c2;
    g.stroke();
    g.fillStyle = d.c;
    g.fill();
  },
  roundel(g, d, w) {
    const cx = w / 2;
    const s = Math.min(1, w);
    [[0.48, d.c], [0.34, d.c2], [0.17, d.c]].forEach(([r, col]) => {
      g.beginPath();
      g.ellipse(cx, 0.5, r * s, r, 0, 0, Math.PI * 2);
      g.fillStyle = col;
      g.fill();
    });
  },
  bolt(g, d, w) {
    const k = w / 0.62;
    const pts = [[0.36, 0.02], [0.08, 0.56], [0.28, 0.56], [0.2, 0.98], [0.56, 0.4], [0.35, 0.4], [0.5, 0.02]].map(([x, y]) => [x * k, y]);
    g.lineJoin = 'miter';
    fillPath(g, pts);
    g.lineWidth = 0.06;
    g.strokeStyle = d.c2;
    g.stroke();
    g.fillStyle = d.c;
    g.fill();
  },
  flame(g, d, w) {
    /* Hot rod flames: a solid front at x = 0 and tongues licking back
     * from it, each a curved point, the outer in c and a shorter, thinner
     * inner set in c2. */
    const LEN = [0.62, 0.9, 1, 0.78, 0.5];
    const tongues = (reach, thick, col) => {
      g.fillStyle = col;
      LEN.forEach((l, i) => {
        const yc = 0.14 + i * 0.18;
        const len = w * l * reach;
        const h = 0.13 * thick;
        g.beginPath();
        g.moveTo(0, yc - h);
        g.bezierCurveTo(len * 0.45, yc - h * 1.1, len * 0.8, yc - h * 0.2, len, yc - h * 0.9);
        g.bezierCurveTo(len * 0.75, yc + h * 0.3, len * 0.4, yc + h * 1.2, 0, yc + h);
        g.closePath();
        g.fill();
      });
      g.fillRect(0, 0.14 - 0.13 * thick, w * 0.1 * reach, 0.72 + 0.26 * thick);
    };
    tongues(1, 1, d.c);
    tongues(0.62, 0.5, d.c2);
  },
  shield(g, d, w) {
    const k = w / 0.84;
    const outline = [[0.06, 0.04], [0.78, 0.04], [0.78, 0.5], [0.42, 0.97], [0.06, 0.5]].map(([x, y]) => [x * k, y]);
    g.lineJoin = 'round';
    fillPath(g, outline);
    g.fillStyle = d.c;
    g.fill();
    g.lineWidth = 0.07;
    g.strokeStyle = d.c2;
    g.stroke();
    g.fillStyle = d.c2;
    fillPath(g, [[0.16, 0.3], [0.42, 0.5], [0.68, 0.3], [0.68, 0.46], [0.42, 0.66], [0.16, 0.46]].map(([x, y]) => [x * k, y]));
    g.fill();
  },
  skull(g, d, w) {
    /* Drawn in its own 0.86 by 1 and stretched to the box. */
    g.save();
    g.scale(w / 0.86, 1);
    g.lineJoin = 'round';
    const head = () => {
      g.beginPath();
      g.ellipse(0.43, 0.4, 0.35, 0.33, 0, 0, Math.PI * 2);
      g.moveTo(0.24, 0.6);
      g.lineTo(0.24, 0.84);
      g.quadraticCurveTo(0.43, 0.94, 0.62, 0.84);
      g.lineTo(0.62, 0.6);
      g.closePath();
    };
    head();
    g.lineWidth = 0.08;
    g.strokeStyle = d.c2;
    g.stroke();
    g.fillStyle = d.c;
    g.fill();
    g.fillStyle = d.c2;
    for (const x of [0.3, 0.56]) {
      g.beginPath();
      g.ellipse(x, 0.44, 0.09, 0.1, 0, 0, Math.PI * 2);
      g.fill();
    }
    fillPath(g, [[0.43, 0.54], [0.38, 0.64], [0.48, 0.64]]);
    g.fill();
    g.lineWidth = 0.025;
    g.strokeStyle = d.c2;
    for (const x of [0.33, 0.4, 0.46, 0.53]) {
      g.beginPath();
      g.moveTo(x, 0.72);
      g.lineTo(x, 0.86);
      g.stroke();
    }
    g.restore();
  },
  shark(g, d, w) {
    /* The nose art of the shark mouth: a red grin running back from the
     * nose (x = 0 is the front), white teeth along both lips, an eye. */
    const k = w / 2.2;
    const X = (x) => x * k;
    const upper = (x) => 0.42 - 0.26 * (x / 2.2) ** 0.7;
    const lower = (x) => 0.56 + 0.34 * (x / 2.2) ** 0.7;
    g.beginPath();
    g.moveTo(X(0.06), 0.49);
    for (let x = 0.1; x <= 2.1; x += 0.1) {
      g.lineTo(X(x), upper(x));
    }
    for (let x = 2.1; x >= 0.1; x -= 0.1) {
      g.lineTo(X(x), lower(x));
    }
    g.closePath();
    g.lineJoin = 'round';
    g.lineWidth = 0.07;
    g.strokeStyle = d.c2;
    g.stroke();
    g.fillStyle = '#b3122a';
    g.fill();
    g.fillStyle = d.c;
    for (let x = 0.3; x < 2.0; x += 0.18) {
      const u = upper(x);
      const l = lower(x);
      fillPath(g, [[X(x - 0.07), u], [X(x + 0.07), u], [X(x), u + 0.14]]);
      g.fill();
      fillPath(g, [[X(x - 0.07), l], [X(x + 0.07), l], [X(x), l - 0.14]]);
      g.fill();
    }
    g.beginPath();
    g.arc(X(1.72), 0.1, 0.075, 0, Math.PI * 2);
    g.fillStyle = d.c2;
    g.fill();
    g.beginPath();
    g.arc(X(1.74), 0.09, 0.03, 0, Math.PI * 2);
    g.fillStyle = d.c;
    g.fill();
  },
  flag_py(g, d, w) {
    [PY.red, PY.white, PY.blue].forEach((col, i) => {
      g.fillStyle = col;
      g.fillRect(0, i / 3, w, 1 / 3 + 0.002);
    });
    const cx = w / 2;
    g.beginPath();
    g.arc(cx, 0.5, 0.15, 0, Math.PI * 2);
    g.lineWidth = 0.035;
    g.strokeStyle = PY.green;
    g.stroke();
    const pts = [];
    for (let i = 0; i < 10; i += 1) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 0.04 : 0.095;
      pts.push([cx + r * Math.cos(a), 0.5 + r * Math.sin(a)]);
    }
    fillPath(g, pts);
    g.fillStyle = PY.gold;
    g.fill();
    g.lineWidth = 0.02;
    g.strokeStyle = d.c2;
    g.strokeRect(0.01, 0.01, w - 0.02, 0.98);
  },
  text: drawText,
  wings(g, d, w) {
    const cx = w / 2;
    const span = w / 2 - 0.04;
    g.fillStyle = d.c;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i += 1) {
        const y = 0.3 + i * 0.16;
        const len = span * (1 - i * 0.2);
        const x0 = cx + side * 0.2;
        const x1 = cx + side * len;
        fillPath(g, [[x0, y], [x1, y - 0.1 + i * 0.03], [x1 - side * 0.06, y + 0.06], [x0, y + 0.12]]);
        g.fill();
      }
    }
    g.beginPath();
    g.arc(cx, 0.5, 0.26, 0, Math.PI * 2);
    g.fillStyle = d.c2;
    g.fill();
    g.beginPath();
    g.arc(cx, 0.5, 0.15, 0, Math.PI * 2);
    g.fillStyle = d.c;
    g.fill();
  },
};

/*
 * Draw decal `d` (its kind, colours, number and lettering) into a box
 * `w` wide and 1 high, y down, in the context's current transform. A
 * caller maps that box onto its texels, squeezed if it must: the box is
 * the decal's own proportions on the model.
 */
export function drawDecal(g, d, w) {
  DRAW[d.k](g, d, w);
}
