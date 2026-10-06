/*
 * stills.js: the photographs The Interior's films show on the BOARD
 * (docs/campaign/interior/INTROS.md: the archive's, the room's recent
 * ones, and the analyst reconstructions behind the squad's captures),
 * each drawn for the game from shapes on a 2D canvas context. INTROS P:
 * "none is a real photograph, none shows a readable name or a face".
 *
 * A STILL is { kind, people, draw(ctx, w, h), overlay?(ctx, w, h, u) }:
 *   kind     'archive' (old, sepia, a print's border), 'recent' (the
 *            room's, washed colour) or 'rec' (an analyst reconstruction
 *            in the camera ball's look; the drawer stamps it
 *            RECONSTRUCTION)
 *   people   the tallest person drawn, as a share of the still's height,
 *            0 for none: no still shows a person larger than PEOPLE_MAX,
 *            so none can show a face (scripts/films-lint.js)
 *   draw     paints the still once (the drawer keeps it)
 *   overlay  paints over the kept still at u, 0 to 1 through its time on
 *            screen (the map's circles, drawn one over another)
 *
 * Deterministic: every random thing is drawn from a generator seeded by
 * the still's id, so every screen shows the same photograph.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { markCoverage } from '../../../render/interior/mark.js';

/* The tallest a person may be drawn in any still, a share of its height:
 * a figure this small has no face to show. */
export const PEOPLE_MAX = 0.06;
/* The shape every still is drawn at: 16:10. */
export const STILL_ASPECT = 1.6;

/* A seeded generator, [0, 1). */
function rng(seedText) {
  let s = 2166136261;
  for (const ch of seedText) {
    s = Math.imul(s ^ ch.charCodeAt(0), 16777619) >>> 0;
  }
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const grey = (v, a = 1) => `rgba(${v},${v},${v},${a})`;

/* The tone over a painted still, pixel by pixel: grey with a tint, grain,
 * a vignette; 'archive' adds the print's white border and its scratches. */
function finish(ctx, w, h, kind, r) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const tint = kind === 'archive' ? [1.08, 0.98, 0.82] : kind === 'rec' ? [0.86, 1.02, 0.9] : [1.02, 1.0, 0.95];
  const keep = kind === 'recent' ? 0.35 : 0;
  const grain = kind === 'archive' ? 34 : kind === 'rec' ? 22 : 14;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const k = (y * w + x) * 4;
      const l = 0.3 * d[k] + 0.59 * d[k + 1] + 0.11 * d[k + 2];
      const dx = x / w - 0.5;
      const dy = y / h - 0.5;
      const vig = 1 - 0.9 * (dx * dx + dy * dy);
      const n = (r() - 0.5) * grain;
      for (let c = 0; c < 3; c += 1) {
        const v = (l * (1 - keep) + d[k + c] * keep) * tint[c] * vig + n;
        d[k + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  if (kind === 'archive') {
    ctx.strokeStyle = 'rgba(255,250,235,0.18)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i += 1) {
      const x = r() * w;
      ctx.beginPath();
      ctx.moveTo(x, r() * h * 0.3);
      ctx.lineTo(x + (r() - 0.5) * 12, h * (0.6 + r() * 0.4));
      ctx.stroke();
    }
    const b = Math.round(Math.min(w, h) * 0.035);
    ctx.fillStyle = '#e9e1cf';
    ctx.fillRect(0, 0, w, b);
    ctx.fillRect(0, h - b * 1.6, w, b * 1.6);
    ctx.fillRect(0, 0, b, h);
    ctx.fillRect(w - b, 0, b, h);
  }
}

function sky(ctx, w, h, horizon, top, bottom) {
  const g = ctx.createLinearGradient(0, 0, 0, h * horizon);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h * horizon + 1);
}

/* A tree line's ragged top along y, from x0 to x1, heights in pixels. */
function treeLine(ctx, r, w, h, y, height, colour, x0 = 0, x1 = 1) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(x0 * w, y);
  for (let x = x0 * w; x <= x1 * w; x += w / 90) {
    ctx.lineTo(x, y - height * (0.5 + r() * 0.5) - (r() < 0.12 ? height * 0.6 : 0));
  }
  ctx.lineTo(x1 * w, y + 2);
  ctx.lineTo(x0 * w, y + 2);
  ctx.closePath();
  ctx.fill();
}

/* A dirt road from the bottom edge to a vanishing point. */
function road(ctx, w, h, vx, vy, halfBottom, colour) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(w * 0.5 - halfBottom * w, h);
  ctx.lineTo(vx * w - 2, vy * h);
  ctx.lineTo(vx * w + 2, vy * h);
  ctx.lineTo(w * 0.5 + halfBottom * w, h);
  ctx.closePath();
  ctx.fill();
}

/* Crowns seen from above or far off: overlapping dark discs, lit tops. */
function canopy(ctx, r, w, h, x0, y0, x1, y1, size, n) {
  for (let i = 0; i < n; i += 1) {
    const x = (x0 + r() * (x1 - x0)) * w;
    const y = (y0 + r() * (y1 - y0)) * h;
    const s = size * (0.6 + r() * 0.8) * (0.5 + (y / h) * 0.8);
    ctx.fillStyle = grey(Math.round(38 + r() * 30));
    ctx.beginPath();
    ctx.arc(x, y, s, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = grey(Math.round(70 + r() * 40), 0.6);
    ctx.beginPath();
    ctx.arc(x - s * 0.25, y - s * 0.25, s * 0.45, 0, 2 * Math.PI);
    ctx.fill();
  }
}

/* A person far off: a dark upright sliver, no head detail. */
function figure(ctx, x, y, tall) {
  ctx.fillStyle = 'rgba(25,25,25,0.85)';
  ctx.beginPath();
  ctx.ellipse(x, y - tall * 0.55, tall * 0.13, tall * 0.45, 0, 0, 2 * Math.PI);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y - tall * 0.95, tall * 0.09, 0, 2 * Math.PI);
  ctx.fill();
}

/* The camera ball's frame over a reconstruction: corner brackets and a
 * centre cross, no words (the drawer writes RECONSTRUCTION). */
function ballFrame(ctx, w, h) {
  ctx.strokeStyle = 'rgba(220,240,225,0.8)';
  ctx.lineWidth = Math.max(1, w / 400);
  const a = w * 0.06;
  for (const [x, y, sx, sy] of [[0.06, 0.08, 1, 1], [0.94, 0.08, -1, 1], [0.94, 0.92, -1, -1], [0.06, 0.92, 1, -1]]) {
    ctx.beginPath();
    ctx.moveTo(x * w, y * h + sy * a);
    ctx.lineTo(x * w, y * h);
    ctx.lineTo(x * w + sx * a, y * h);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(w * 0.47, h * 0.5);
  ctx.lineTo(w * 0.49, h * 0.5);
  ctx.moveTo(w * 0.51, h * 0.5);
  ctx.lineTo(w * 0.53, h * 0.5);
  ctx.moveTo(w * 0.5, h * 0.46);
  ctx.lineTo(w * 0.5, h * 0.48);
  ctx.moveTo(w * 0.5, h * 0.52);
  ctx.lineTo(w * 0.5, h * 0.54);
  ctx.stroke();
}

/* The ground seen straight down through the ball: a grassy field. */
function field(ctx, r, w, h, base) {
  ctx.fillStyle = grey(base);
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i += 1) {
    ctx.fillStyle = grey(base + Math.round((r() - 0.5) * 30), 0.35);
    ctx.fillRect(r() * w, r() * h, 2 + r() * 6, 2 + r() * 6);
  }
}

/* The mark painted on canvas, square of side s at (x, y), weathered by
 * wear (0 sharp, 1 half gone). */
function paintMark(ctx, r, x, y, s, wear, ochre) {
  const n = 72;
  const cell = s / n;
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const u = (i + 0.5) / n * 2 - 1;
      const v = 1 - (j + 0.5) / n * 2;
      if (markCoverage(u, v) > 0 && r() > wear * 0.6) {
        ctx.fillStyle = ochre;
        ctx.fillRect(x + i * cell, y + j * cell, cell + 0.5, cell + 0.5);
      }
    }
  }
}

/* A small motorcycle from the side at (x, y) ground, length L pixels. */
function moto(ctx, x, y, L, colour) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = Math.max(1.5, L * 0.06);
  const rw = L * 0.2;
  ctx.beginPath();
  ctx.arc(x - L * 0.32, y - rw, rw, 0, 2 * Math.PI);
  ctx.arc(x + L * 0.32 + rw, y - rw, rw, Math.PI, 3 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - L * 0.32, y - rw);
  ctx.lineTo(x - L * 0.05, y - rw * 2.2);
  ctx.lineTo(x + L * 0.2, y - rw * 2.2);
  ctx.lineTo(x + L * 0.32, y - rw);
  ctx.moveTo(x + L * 0.2, y - rw * 2.2);
  ctx.lineTo(x + L * 0.26, y - rw * 3.0);
  ctx.stroke();
  ctx.fillStyle = colour;
  ctx.fillRect(x - L * 0.18, y - rw * 2.6, L * 0.28, rw * 0.5);
}

export const STILLS = {
  'arch-checkpoint': {
    kind: 'archive',
    people: 0,
    draw(ctx, w, h) {
      const r = rng('arch-checkpoint');
      sky(ctx, w, h, 0.46, '#d8d4c8', '#bdb8aa');
      ctx.fillStyle = '#6d6a5c';
      ctx.fillRect(0, h * 0.46, w, h);
      treeLine(ctx, r, w, h, h * 0.47, h * 0.07, '#3d3c34');
      road(ctx, w, h, 0.55, 0.47, 0.32, '#a59d88');
      /* The hut by the road, the barrier pole across it, a blank sign. */
      ctx.fillStyle = '#4b4840';
      ctx.fillRect(w * 0.74, h * 0.38, w * 0.1, h * 0.16);
      ctx.fillStyle = '#2e2c27';
      ctx.fillRect(w * 0.72, h * 0.36, w * 0.14, h * 0.03);
      ctx.fillStyle = '#383630';
      ctx.fillRect(w * 0.27, h * 0.56, w * 0.018, h * 0.2);
      const n = 9;
      for (let i = 0; i < n; i += 1) {
        ctx.fillStyle = i % 2 ? '#e6e1d4' : '#3a3833';
        const x0 = 0.28 + (i / n) * 0.46;
        ctx.beginPath();
        ctx.moveTo(w * x0, h * (0.585 - i * 0.004));
        ctx.lineTo(w * (x0 + 0.46 / n), h * (0.585 - (i + 1) * 0.004));
        ctx.lineTo(w * (x0 + 0.46 / n), h * (0.6 - (i + 1) * 0.004));
        ctx.lineTo(w * x0, h * (0.6 - i * 0.004));
        ctx.fill();
      }
      ctx.fillStyle = '#d5cfbf';
      ctx.fillRect(w * 0.18, h * 0.5, w * 0.07, h * 0.06);
      finish(ctx, w, h, 'archive', r);
    },
  },
  'arch-road': {
    kind: 'archive',
    people: 0,
    draw(ctx, w, h) {
      const r = rng('arch-road');
      sky(ctx, w, h, 0.5, '#e0dccf', '#c9c3b2');
      ctx.fillStyle = '#7a7664';
      ctx.fillRect(0, h * 0.5, w, h);
      treeLine(ctx, r, w, h, h * 0.505, h * 0.05, '#46443a', 0, 0.42);
      treeLine(ctx, r, w, h, h * 0.505, h * 0.035, '#55524a', 0.62, 1);
      road(ctx, w, h, 0.47, 0.505, 0.22, '#b0a891');
      ctx.strokeStyle = '#3c3a33';
      ctx.lineWidth = 2;
      for (let i = 1; i < 9; i += 1) {
        const k = i / 9;
        const y = h * (0.505 + 0.495 * k * k);
        const x = w * (0.47 - (0.47 - 0.12) * k * k);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - h * 0.08 * k * k - 3);
        ctx.stroke();
      }
      finish(ctx, w, h, 'archive', r);
    },
  },
  'arch-forest': {
    kind: 'archive',
    people: 0,
    draw(ctx, w, h) {
      const r = rng('arch-forest');
      sky(ctx, w, h, 0.16, '#d6d2c6', '#a9a596');
      ctx.fillStyle = '#4e4c43';
      ctx.fillRect(0, h * 0.16, w, h);
      canopy(ctx, r, w, h, 0, 0.17, 1, 1, w * 0.018, 1400);
      /* A river bend, pale, through the trees. */
      ctx.strokeStyle = 'rgba(200,195,180,0.75)';
      ctx.lineWidth = w * 0.012;
      ctx.beginPath();
      ctx.moveTo(w * 0.1, h);
      ctx.bezierCurveTo(w * 0.3, h * 0.6, w * 0.65, h * 0.75, w * 0.58, h * 0.3);
      ctx.bezierCurveTo(w * 0.55, h * 0.22, w * 0.7, h * 0.19, w * 0.8, h * 0.17);
      ctx.stroke();
      finish(ctx, w, h, 'archive', r);
    },
  },
  'arch-aerial': {
    kind: 'archive',
    people: 0,
    draw(ctx, w, h) {
      const r = rng('arch-aerial');
      ctx.fillStyle = '#4a483f';
      ctx.fillRect(0, 0, w, h);
      canopy(ctx, r, w, h, 0, 0, 1, 1, w * 0.02, 1100);
      /* The clearing and its tarps, left behind. */
      ctx.fillStyle = '#8f8a78';
      ctx.beginPath();
      ctx.ellipse(w * 0.52, h * 0.5, w * 0.17, h * 0.2, 0.3, 0, 2 * Math.PI);
      ctx.fill();
      for (const [x, y, a] of [[0.45, 0.43, 0.3], [0.56, 0.42, -0.2], [0.58, 0.57, 0.5], [0.46, 0.58, 0.1]]) {
        ctx.save();
        ctx.translate(w * x, h * y);
        ctx.rotate(a);
        ctx.fillStyle = '#c9c4b2';
        ctx.fillRect(-w * 0.03, -h * 0.025, w * 0.06, h * 0.05);
        ctx.restore();
      }
      ctx.strokeStyle = 'rgba(160,155,140,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w * 0.62, h * 0.62);
      ctx.quadraticCurveTo(w * 0.8, h * 0.8, w * 0.95, h);
      ctx.stroke();
      finish(ctx, w, h, 'archive', r);
    },
  },
  'arch-poster': {
    kind: 'archive',
    people: 0,
    draw(ctx, w, h) {
      const r = rng('arch-poster');
      /* Planks of a post, then a sheet on them: a heading, an empty frame
       * where a photograph was, and lines nobody can read. */
      for (let i = 0; i < 8; i += 1) {
        ctx.fillStyle = grey(Math.round(70 + r() * 30));
        ctx.fillRect((i / 8) * w, 0, w / 8 - 2, h);
      }
      ctx.save();
      ctx.translate(w * 0.5, h * 0.52);
      ctx.rotate(-0.04);
      const pw = w * 0.42;
      const ph = h * 0.84;
      ctx.fillStyle = '#ddd6c4';
      ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
      ctx.fillStyle = '#3b3934';
      ctx.fillRect(-pw * 0.4, -ph * 0.44, pw * 0.8, ph * 0.08);
      ctx.strokeStyle = '#5a564c';
      ctx.lineWidth = 2;
      ctx.strokeRect(-pw * 0.28, -ph * 0.3, pw * 0.56, ph * 0.38);
      ctx.fillStyle = 'rgba(150,140,120,0.5)';
      ctx.fillRect(-pw * 0.26, -ph * 0.28, pw * 0.52, ph * 0.34);
      ctx.fillStyle = 'rgba(220,214,198,0.9)';
      ctx.beginPath();
      ctx.moveTo(pw * 0.28, -ph * 0.3);
      ctx.lineTo(pw * 0.1, -ph * 0.3);
      ctx.lineTo(pw * 0.28, -ph * 0.14);
      ctx.fill();
      ctx.fillStyle = '#7d786c';
      for (let i = 0; i < 7; i += 1) {
        ctx.fillRect(-pw * 0.36, ph * (0.14 + i * 0.045), pw * (0.4 + r() * 0.32), ph * 0.014);
      }
      ctx.fillStyle = '#2b2925';
      ctx.beginPath();
      ctx.arc(0, -ph * 0.48, w * 0.008, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
      finish(ctx, w, h, 'archive', r);
    },
  },
  'arch-radios': {
    kind: 'archive',
    people: 0,
    draw(ctx, w, h) {
      const r = rng('arch-radios');
      ctx.fillStyle = '#6a6455';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 30; i += 1) {
        ctx.fillStyle = grey(Math.round(90 + r() * 25), 0.25);
        ctx.fillRect(0, r() * h, w, 1 + r() * 2);
      }
      for (const [x, y, s, a] of [[0.22, 0.42, 1, -0.1], [0.47, 0.52, 1.15, 0.08], [0.72, 0.4, 0.95, 0.15], [0.6, 0.78, 0.8, -0.3]]) {
        ctx.save();
        ctx.translate(w * x, h * y);
        ctx.rotate(a);
        const bw = w * 0.13 * s;
        const bh = h * 0.3 * s;
        ctx.fillStyle = '#2a2925';
        ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
        ctx.fillStyle = '#4c4a44';
        for (let gy = 0; gy < 6; gy += 1) {
          for (let gx = 0; gx < 5; gx += 1) {
            ctx.fillRect(-bw * 0.35 + gx * bw * 0.16, -bh * 0.1 + gy * bh * 0.08, bw * 0.06, bh * 0.03);
          }
        }
        ctx.fillStyle = '#5c5a52';
        ctx.beginPath();
        ctx.arc(-bw * 0.2, -bh * 0.33, bw * 0.08, 0, 2 * Math.PI);
        ctx.arc(bw * 0.2, -bh * 0.33, bw * 0.08, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = '#1e1d1a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(bw * 0.35, -bh / 2);
        ctx.lineTo(bw * 0.42, -bh * 1.15);
        ctx.stroke();
        ctx.fillStyle = '#d8d1bd';
        ctx.fillRect(-bw * 0.3, bh * 0.52, bw * 0.45, bh * 0.14);
        ctx.restore();
      }
      finish(ctx, w, h, 'archive', r);
    },
  },
  'arch-map': {
    kind: 'archive',
    people: 0,
    draw(ctx, w, h) {
      const r = rng('arch-map');
      ctx.fillStyle = '#d9d0b8';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(120,110,90,0.35)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 10; i += 1) {
        ctx.beginPath();
        ctx.moveTo((i / 10) * w, 0);
        ctx.lineTo((i / 10) * w, h);
        ctx.moveTo(0, (i / 10) * h);
        ctx.lineTo(w, (i / 10) * h);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(110,95,70,0.5)';
      for (let k = 0; k < 9; k += 1) {
        const cx = r() * w;
        const cy = r() * h;
        const rad = w * (0.04 + r() * 0.08);
        ctx.beginPath();
        for (let a = 0; a <= 2 * Math.PI + 0.01; a += 0.2) {
          const q = rad * (1 + 0.25 * Math.sin(a * 3 + k));
          ctx.lineTo(cx + q * Math.cos(a), cy + q * 0.7 * Math.sin(a));
        }
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(70,80,95,0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.7);
      ctx.bezierCurveTo(w * 0.3, h * 0.55, w * 0.5, h * 0.9, w, h * 0.45);
      ctx.stroke();
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = 'rgba(60,50,40,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w * 0.1, 0);
      ctx.lineTo(w * 0.35, h * 0.5);
      ctx.lineTo(w * 0.8, h);
      ctx.stroke();
      ctx.setLineDash([]);
      finish(ctx, w, h, 'archive', r);
    },
    /* Circles drawn over circles in pencil, more of them as it holds:
     * every search that found nothing. */
    overlay(ctx, w, h, u) {
      const r = rng('arch-map-circles');
      const n = 14;
      const shown = Math.floor(2 + u * (n - 2));
      ctx.strokeStyle = 'rgba(45,38,30,0.7)';
      ctx.lineWidth = Math.max(1.5, w / 380);
      for (let i = 0; i < n; i += 1) {
        const cx = w * (0.38 + r() * 0.3);
        const cy = h * (0.3 + r() * 0.4);
        const rad = w * (0.03 + r() * 0.12);
        const wob = r() * 6;
        if (i >= shown) {
          continue;
        }
        ctx.beginPath();
        for (let a = 0; a <= 2 * Math.PI + 0.3; a += 0.15) {
          const q = rad * (1 + 0.04 * Math.sin(a * 5 + wob));
          ctx.lineTo(cx + q * Math.cos(a), cy + q * Math.sin(a));
        }
        ctx.stroke();
      }
    },
  },
  'arch-symbol': {
    kind: 'archive',
    people: 0,
    draw(ctx, w, h) {
      const r = rng('arch-symbol');
      ctx.fillStyle = '#5c6248';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 400; i += 1) {
        ctx.fillStyle = `rgba(40,44,30,${(0.1 + r() * 0.15).toFixed(3)})`;
        ctx.fillRect(r() * w, r() * h, 1 + r() * w * 0.02, 1);
      }
      const s = h * 0.66;
      paintMark(ctx, r, w / 2 - s / 2, h / 2 - s / 2, s, 0.1, '#b47436');
      finish(ctx, w, h, 'archive', r);
    },
  },
  'int1-gen': {
    kind: 'recent',
    people: 0,
    draw(ctx, w, h) {
      const r = rng('int1-gen');
      sky(ctx, w, h, 0.3, '#c9d2d6', '#dfe2d8');
      ctx.fillStyle = '#7f8a52';
      ctx.fillRect(0, h * 0.3, w, h);
      treeLine(ctx, r, w, h, h * 0.31, h * 0.05, '#3f4a2c');
      ctx.fillStyle = '#2c2a26';
      ctx.beginPath();
      ctx.ellipse(w * 0.5, h * 0.72, w * 0.3, h * 0.12, 0, 0, 2 * Math.PI);
      ctx.fill();
      /* The generator, blackened: a box on a frame, its panel burst. */
      ctx.fillStyle = '#3a3733';
      ctx.fillRect(w * 0.38, h * 0.48, w * 0.24, h * 0.22);
      ctx.fillStyle = '#1c1b19';
      ctx.fillRect(w * 0.41, h * 0.52, w * 0.09, h * 0.12);
      ctx.fillStyle = '#5a4a3a';
      ctx.fillRect(w * 0.53, h * 0.52, w * 0.06, h * 0.05);
      ctx.strokeStyle = '#161513';
      ctx.lineWidth = 4;
      ctx.strokeRect(w * 0.37, h * 0.47, w * 0.26, h * 0.24);
      finish(ctx, w, h, 'recent', r);
    },
  },
  'int1-moto': {
    kind: 'recent',
    people: 0,
    draw(ctx, w, h) {
      const r = rng('int1-moto');
      sky(ctx, w, h, 0.35, '#cfd6d8', '#e2e3d9');
      ctx.fillStyle = '#8a8f58';
      ctx.fillRect(0, h * 0.35, w, h);
      treeLine(ctx, r, w, h, h * 0.36, h * 0.06, '#46512f');
      ctx.strokeStyle = '#6b5e48';
      ctx.lineWidth = 3;
      for (let i = 0; i < 6; i += 1) {
        ctx.beginPath();
        ctx.moveTo(w * (0.05 + i * 0.17), h * 0.62);
        ctx.lineTo(w * (0.05 + i * 0.17), h * 0.46);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(0, h * 0.5);
      ctx.lineTo(w, h * 0.49);
      ctx.moveTo(0, h * 0.56);
      ctx.lineTo(w, h * 0.555);
      ctx.stroke();
      moto(ctx, w * 0.48, h * 0.8, w * 0.36, '#2d2b28');
      ctx.strokeStyle = 'rgba(120,128,70,0.9)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 260; i += 1) {
        const x = r() * w;
        const y = h * (0.62 + r() * 0.38);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (r() - 0.5) * 10, y - h * (0.03 + r() * 0.08));
        ctx.stroke();
      }
      finish(ctx, w, h, 'recent', r);
    },
  },
  'int1-mast': {
    kind: 'recent',
    people: 0,
    draw(ctx, w, h) {
      const r = rng('int1-mast');
      sky(ctx, w, h, 1, '#aebfc8', '#e4e6e0');
      treeLine(ctx, r, w, h, h, h * 0.12, '#3c4630');
      /* A lattice mast from below, its bracing, two dishes, guy wires. */
      const top = [w * 0.55, h * 0.06];
      const l = [w * 0.47, h];
      const rr = [w * 0.61, h];
      ctx.strokeStyle = '#2f3233';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(...l);
      ctx.lineTo(top[0] - 4, top[1]);
      ctx.moveTo(...rr);
      ctx.lineTo(top[0] + 4, top[1]);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 14; i += 1) {
        const a = i / 14;
        const b = (i + 1) / 14;
        const xl = (k) => l[0] + (top[0] - 4 - l[0]) * k;
        const xr = (k) => rr[0] + (top[0] + 4 - rr[0]) * k;
        const y = (k) => h + (top[1] - h) * k;
        ctx.moveTo(xl(a), y(a));
        ctx.lineTo(xr(b), y(b));
        ctx.moveTo(xr(a), y(a));
        ctx.lineTo(xl(b), y(b));
      }
      ctx.stroke();
      ctx.fillStyle = '#3a3d3e';
      ctx.beginPath();
      ctx.ellipse(w * 0.6, h * 0.2, w * 0.025, h * 0.04, 0, 0, 2 * Math.PI);
      ctx.ellipse(w * 0.5, h * 0.3, w * 0.02, h * 0.035, 0, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,40,40,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(...top);
      ctx.lineTo(0, h * 0.9);
      ctx.moveTo(...top);
      ctx.lineTo(w, h * 0.85);
      ctx.stroke();
      finish(ctx, w, h, 'recent', r);
    },
  },
  'int1-pair': {
    kind: 'recent',
    people: 0.035,
    draw(ctx, w, h) {
      const r = rng('int1-pair');
      /* A long lens on a tree line, soft: two small figures at its edge. */
      sky(ctx, w, h, 0.3, '#c6cdc8', '#d6d8cd');
      ctx.fillStyle = '#7e8556';
      ctx.fillRect(0, h * 0.3, w, h);
      if ('filter' in ctx) {
        ctx.filter = `blur(${Math.max(1, Math.round(w / 300))}px)`;
      }
      ctx.fillStyle = '#353d27';
      ctx.fillRect(0, h * 0.3, w, h * 0.26);
      treeLine(ctx, r, w, h, h * 0.31, h * 0.08, '#2e3622');
      figure(ctx, w * 0.56, h * 0.6, h * 0.035);
      figure(ctx, w * 0.6, h * 0.605, h * 0.033);
      if ('filter' in ctx) {
        ctx.filter = 'none';
      }
      finish(ctx, w, h, 'recent', r);
    },
  },
  'rec:bridge': {
    kind: 'rec',
    people: 0,
    draw(ctx, w, h) {
      const r = rng('rec:bridge');
      field(ctx, r, w, h, 120);
      ctx.fillStyle = grey(55);
      ctx.beginPath();
      ctx.moveTo(w * 0.35, 0);
      ctx.bezierCurveTo(w * 0.45, h * 0.4, w * 0.3, h * 0.6, w * 0.42, h);
      ctx.lineTo(w * 0.62, h);
      ctx.bezierCurveTo(w * 0.5, h * 0.6, w * 0.65, h * 0.4, w * 0.55, 0);
      ctx.fill();
      ctx.fillStyle = grey(185);
      ctx.fillRect(w * 0.18, h * 0.46, w * 0.64, h * 0.08);
      ctx.fillStyle = grey(70);
      ctx.fillRect(w * 0.49, h * 0.54, w * 0.02, h * 0.04);
      ctx.fillStyle = grey(150);
      ctx.fillRect(0, h * 0.475, w * 0.18, h * 0.05);
      ctx.fillRect(w * 0.82, h * 0.475, w * 0.18, h * 0.05);
      finish(ctx, w, h, 'rec', r);
      ballFrame(ctx, w, h);
    },
  },
  'rec:shelters': {
    kind: 'rec',
    people: 0,
    draw(ctx, w, h) {
      const r = rng('rec:shelters');
      ctx.fillStyle = grey(60);
      ctx.fillRect(0, 0, w, h);
      canopy(ctx, r, w, h, 0, 0, 1, 1, w * 0.03, 500);
      ctx.fillStyle = grey(125);
      ctx.beginPath();
      ctx.ellipse(w * 0.5, h * 0.5, w * 0.26, h * 0.34, 0.2, 0, 2 * Math.PI);
      ctx.fill();
      for (const [x, y, a] of [[0.4, 0.38, 0.4], [0.6, 0.36, -0.3], [0.62, 0.62, 0.6], [0.4, 0.63, 0.1]]) {
        ctx.save();
        ctx.translate(w * x, h * y);
        ctx.rotate(a);
        ctx.fillStyle = grey(190);
        ctx.fillRect(-w * 0.06, -h * 0.05, w * 0.12, h * 0.1);
        ctx.strokeStyle = grey(90);
        ctx.beginPath();
        ctx.moveTo(-w * 0.06, 0);
        ctx.lineTo(w * 0.06, 0);
        ctx.stroke();
        ctx.restore();
      }
      finish(ctx, w, h, 'rec', r);
      ballFrame(ctx, w, h);
    },
  },
  'rec:motorcycles': {
    kind: 'rec',
    people: 0,
    draw(ctx, w, h) {
      const r = rng('rec:motorcycles');
      field(ctx, r, w, h, 115);
      for (let i = 0; i < 4; i += 1) {
        ctx.save();
        ctx.translate(w * (0.32 + i * 0.12), h * 0.5);
        ctx.rotate(0.15);
        ctx.fillStyle = grey(35);
        ctx.fillRect(-w * 0.012, -h * 0.13, w * 0.024, h * 0.26);
        ctx.fillRect(-w * 0.03, -h * 0.1, w * 0.06, h * 0.015);
        ctx.fillStyle = grey(60, 0.6);
        ctx.fillRect(w * 0.012, -h * 0.12, w * 0.02, h * 0.26);
        ctx.restore();
      }
      finish(ctx, w, h, 'rec', r);
      ballFrame(ctx, w, h);
    },
  },
  'rec:antenna': {
    kind: 'rec',
    people: 0,
    draw(ctx, w, h) {
      const r = rng('rec:antenna');
      field(ctx, r, w, h, 120);
      ctx.strokeStyle = grey(40);
      ctx.lineWidth = Math.max(2, w / 160);
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.62);
      ctx.lineTo(w * 0.53, h * 0.2);
      ctx.stroke();
      ctx.strokeStyle = grey(70, 0.5);
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.62);
      ctx.lineTo(w * 0.85, h * 0.75);
      ctx.stroke();
      ctx.strokeStyle = grey(30, 0.8);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const [x, y] of [[0.3, 0.75], [0.72, 0.8], [0.6, 0.45]]) {
        ctx.moveTo(w * 0.525, h * 0.3);
        ctx.lineTo(w * x, h * y);
      }
      ctx.stroke();
      finish(ctx, w, h, 'rec', r);
      ballFrame(ctx, w, h);
    },
  },
  'rec:personnel': {
    kind: 'rec',
    people: 0.03,
    draw(ctx, w, h) {
      const r = rng('rec:personnel');
      ctx.fillStyle = grey(70);
      ctx.fillRect(0, 0, w, h);
      canopy(ctx, r, w, h, 0, 0, 1, 1, w * 0.03, 420);
      ctx.fillStyle = grey(130);
      ctx.beginPath();
      ctx.ellipse(w * 0.5, h * 0.52, w * 0.3, h * 0.36, 0, 0, 2 * Math.PI);
      ctx.fill();
      /* Six people from above: a dot each and its long shadow. */
      for (const [x, y] of [[0.38, 0.45], [0.44, 0.6], [0.55, 0.42], [0.6, 0.58], [0.66, 0.5], [0.5, 0.68]]) {
        ctx.fillStyle = grey(45, 0.5);
        ctx.fillRect(w * x, h * y, w * 0.03, h * 0.008);
        ctx.fillStyle = grey(30);
        ctx.beginPath();
        ctx.arc(w * x, h * y, h * 0.012, 0, 2 * Math.PI);
        ctx.fill();
      }
      finish(ctx, w, h, 'rec', r);
      ballFrame(ctx, w, h);
    },
  },
  'rec:symbol': {
    kind: 'rec',
    people: 0,
    draw(ctx, w, h) {
      const r = rng('rec:symbol');
      ctx.fillStyle = grey(60);
      ctx.fillRect(0, 0, w, h);
      /* The tarp's underside seen from its bearing band: the mark leaning
       * away, half of it worn. */
      ctx.save();
      ctx.translate(w * 0.5, h * 0.52);
      ctx.transform(1, 0, -0.35, 0.62, 0, 0);
      ctx.fillStyle = grey(110);
      ctx.fillRect(-h * 0.5, -h * 0.5, h, h);
      paintMark(ctx, r, -h * 0.36, -h * 0.36, h * 0.72, 0.65, grey(175));
      ctx.restore();
      finish(ctx, w, h, 'rec', r);
      ballFrame(ctx, w, h);
    },
  },
};
