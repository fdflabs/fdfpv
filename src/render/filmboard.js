/*
 * filmboard.js: the BOARD film insert drawn (docs/campaign/interior/
 * TECH-NEEDS.md N18, src/share/war/film.js boardAt): the operations
 * room's screen, a map with layers that fade in and out, stills in
 * frames, an archive match, a split screen, an alert and at most a
 * hand's shadow. It knows the layer kinds of a board map (src/share/
 * interior/films/board.js) and nothing of any campaign, so a later
 * campaign's films draw on it by writing data.
 *
 * createBoard({ map, stills, capture, raster }) returns { draw(ctx, w, h,
 * state, tFilm, dpr), source(id) }:
 *   map       the board map: { bounds, layers: { id: { kind, items,
 *             style } } }
 *   stills    the authored stills by id ({ kind, people, draw, overlay? })
 *   capture   (item) => { image, seat } | null: the squad's own still of a
 *             capture item, from the room's record (the screen's, VIEW's);
 *             without one, cap:<item> shows rec:<item>, marked
 *             RECONSTRUCTION
 *   raster    (layerId) => a canvas or null: a raster layer's picture,
 *             covering the map's bounds
 * draw paints boardAt's state over ctx from its origin, w by h pixels,
 * and returns what it drew, for the checks: every still with its source
 * ('capture', 'reconstruction', 'authored' or 'missing'); source(id) is
 * how a still id resolves.
 *
 * Each still is painted once into a canvas of its own and kept: a board
 * frame costs blits, the vector layers and the screen's grain.
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

import { str } from '../strings/index.js';

/* The size every still is painted at once: 16:10. */
export const STILL_W = 800;
export const STILL_H = 500;

const COLOURS = {
  water: '#5b9bd0',
  road: '#c9a45e',
  sector: '#74d6ca',
  place: '#e9e4d6',
  mark: '#ffd36b',
  alert: '#ff6b4f',
  forest: '#7fb07a',
};
/* A list joined, not one literal: it is used in canvas fonts too, where a
 * CSS variable would void the whole font. */
const FONT = ['ui-monospace', '"SFMono-Regular"', 'Menlo', 'Consolas', 'monospace'].join(', ');

function canvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(w, h);
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/* A slot's rectangle in pixels: [x, y, w, h]. */
function slotRect(slot, w, h) {
  let r;
  if (slot === 'left') {
    r = [0.04, 0, 0.45];
  } else if (slot === 'right') {
    r = [0.51, 0, 0.45];
  } else if (Array.isArray(slot)) {
    r = slot;
  } else {
    r = [0.08, 0, 0.84];
  }
  let sw = r[2] * w;
  let sh = sw / 1.6;
  if (sh > h * 0.86) {
    sh = h * 0.86;
    sw = sh * 1.6;
  }
  const x = Array.isArray(slot) ? r[0] * w : r[0] * w + (r[2] * w - sw) / 2;
  const y = Array.isArray(slot) ? r[1] * h : (h - sh) / 2 - h * 0.03;
  return [x, y, sw, sh];
}

export function createBoard({
  map, stills, capture = () => null, raster = () => null,
}) {
  const kept = new Map();
  let grain = null;

  /* A still's picture and how it got it: the squad's capture, its
   * reconstruction, an authored one, or nothing. */
  function source(id) {
    if (id.startsWith('cap:')) {
      const item = id.slice(4);
      const cap = capture(item);
      if (cap && cap.image) {
        return { kind: 'capture', image: cap.image, seat: cap.seat ?? null, def: null };
      }
      return { ...authored(`rec:${item}`), via: id };
    }
    return authored(id);
  }

  function authored(id) {
    const def = stills[id];
    if (!def) {
      return { kind: 'missing', id, image: null, def: null };
    }
    if (!kept.has(id)) {
      const c = canvas(STILL_W, STILL_H);
      def.draw(c.getContext('2d'), STILL_W, STILL_H);
      kept.set(id, c);
    }
    return {
      kind: def.kind === 'rec' ? 'reconstruction' : 'authored', id, image: kept.get(id), def,
    };
  }

  /* The screen's grain, a tile of noise drawn once. */
  function grainTile() {
    if (!grain) {
      grain = canvas(128, 128);
      const g = grain.getContext('2d');
      const img = g.createImageData(128, 128);
      let s = 12345;
      for (let i = 0; i < img.data.length; i += 4) {
        s = (Math.imul(s, 1103515245) + 12345) >>> 0;
        const v = s >>> 24;
        img.data[i] = v;
        img.data[i + 1] = v;
        img.data[i + 2] = v;
        img.data[i + 3] = 22;
      }
      g.putImageData(img, 0, 0);
    }
    return grain;
  }

  function drawStill(ctx, id, rect, alpha, push, u, dpr, shownList) {
    if (alpha <= 0) {
      return;
    }
    const src = source(id);
    shownList.push({ id, source: src.kind });
    const [x, y, w, h] = rect;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 3 * dpr, y - 3 * dpr, w + 6 * dpr, h + 6 * dpr);
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    if (!src.image) {
      ctx.fillStyle = '#400';
      ctx.fillRect(x, y, w, h);
      ctx.restore();
      return;
    }
    const k = 1 + push;
    const dw = w * k;
    const dh = h * k;
    const dx = x - (dw - w) / 2;
    const dy = y - (dh - h) / 2;
    ctx.drawImage(src.image, dx, dy, dw, dh);
    if (src.def && src.def.overlay) {
      ctx.translate(dx, dy);
      ctx.scale(dw / STILL_W, dh / STILL_H);
      src.def.overlay(ctx, STILL_W, STILL_H, u);
    }
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `600 ${Math.round(Math.max(10, h * 0.055))}px ${FONT}`;
    ctx.textBaseline = 'bottom';
    if (src.kind === 'reconstruction') {
      ctx.fillStyle = 'rgba(160, 30, 20, 0.85)';
      ctx.fillRect(x, y, w, h * 0.1);
      ctx.fillStyle = '#ffe9e0';
      ctx.textAlign = 'left';
      ctx.fillText(str('interior.board.reconstruction'), x + w * 0.03, y + h * 0.085);
    } else if (src.kind === 'capture' && src.seat != null) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(x, y + h * 0.88, w * 0.5, h * 0.12);
      ctx.fillStyle = '#d9f0e0';
      ctx.textAlign = 'left';
      ctx.fillText(str('interior.board.seat', { n: src.seat + 1 }), x + w * 0.03, y + h * 0.98);
    }
    ctx.restore();
  }

  function toScreen(view, w, h) {
    const s = w / view.span;
    return (p) => [w / 2 + (p[0] - view.at[0]) * s, h / 2 + (p[1] - view.at[1]) * s];
  }

  function label(ctx, text, x, y, colour, size) {
    ctx.font = `600 ${size}px ${FONT}`;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillText(text, x + 1, y + 1);
    ctx.fillStyle = colour;
    ctx.fillText(text, x, y);
  }

  function drawLayer(ctx, layer, id, alpha, view, w, h, dpr, tFilm) {
    if (alpha <= 0 || !layer) {
      return;
    }
    const at = toScreen(view, w, h);
    const colour = COLOURS[layer.style] ?? '#ffffff';
    const size = Math.round(Math.max(9, w / 110));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.textBaseline = 'bottom';
    if (layer.kind === 'raster') {
      const img = raster(id);
      if (img) {
        const [a, b] = map.bounds.map(at);
        ctx.globalAlpha = alpha * 0.85;
        ctx.drawImage(img, a[0], a[1], b[0] - a[0], b[1] - a[1]);
      }
    } else if (layer.kind === 'line') {
      ctx.lineWidth = (layer.style === 'water' ? 2.2 : layer.style === 'mark' ? 3 : 1.6) * dpr;
      ctx.lineJoin = 'round';
      for (const it of layer.items) {
        ctx.beginPath();
        it.points.forEach((p, k) => {
          const [x, y] = at(p);
          if (k === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();
      }
    } else if (layer.kind === 'box' || layer.kind === 'ring') {
      ctx.lineWidth = 1.6 * dpr;
      ctx.setLineDash([6 * dpr, 4 * dpr]);
      for (const it of layer.items) {
        const [x, y] = at(it.at);
        const r = (it.r * w) / view.span;
        ctx.beginPath();
        if (layer.kind === 'box') {
          ctx.rect(x - r, y - r, 2 * r, 2 * r);
        } else {
          ctx.arc(x, y, r, 0, 2 * Math.PI);
        }
        ctx.stroke();
        if (it.name) {
          ctx.textAlign = 'left';
          label(ctx, str(it.name).toUpperCase(), layer.kind === 'box' ? x - r + 4 * dpr : x - r * 0.3, layer.kind === 'box' ? y - r - 3 * dpr : y - r * 0.6, colour, size);
        }
      }
      ctx.setLineDash([]);
    } else if (layer.kind === 'point' || layer.kind === 'tick' || layer.kind === 'dot') {
      for (const it of layer.items) {
        const [x, y] = at(it.at);
        if (layer.kind === 'dot') {
          const pulse = 0.5 + 0.5 * Math.sin(tFilm / 260);
          ctx.beginPath();
          ctx.arc(x, y, (5 + 5 * pulse) * dpr, 0, 2 * Math.PI);
          ctx.globalAlpha = alpha * (0.35 + 0.3 * (1 - pulse));
          ctx.fill();
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.arc(x, y, 3.5 * dpr, 0, 2 * Math.PI);
          ctx.fill();
          continue;
        }
        const s = (layer.kind === 'tick' ? 6 : 3.5) * dpr;
        ctx.beginPath();
        if (layer.kind === 'tick') {
          ctx.moveTo(x, y - s);
          ctx.lineTo(x + s, y);
          ctx.lineTo(x, y + s);
          ctx.lineTo(x - s, y);
          ctx.closePath();
          ctx.lineWidth = 2 * dpr;
          ctx.stroke();
        } else {
          ctx.arc(x, y, s, 0, 2 * Math.PI);
          ctx.fill();
        }
        if (it.name) {
          ctx.textAlign = 'left';
          label(ctx, str(it.name).toUpperCase(), x + s + 4 * dpr, y - 2 * dpr, colour, size);
        }
      }
    }
    ctx.restore();
  }

  function pair(ctx, p, w, h, dpr, header, shownList) {
    if (!p || p.alpha <= 0) {
      return;
    }
    const left = slotRect('left', w, h);
    const right = slotRect('right', w, h);
    drawStill(ctx, p.a, left, p.alpha, 0, 0, dpr, shownList);
    drawStill(ctx, p.b, right, p.alpha, 0, 0, dpr, shownList);
    if (!header) {
      return;
    }
    ctx.save();
    ctx.globalAlpha = p.alpha;
    const size = Math.round(Math.max(11, w / 70));
    ctx.font = `700 ${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#d6efe2';
    ctx.fillText(str('interior.board.archive_match'), w / 2, left[1] - size * 0.6);
    ctx.textBaseline = 'top';
    ctx.fillStyle = p.matched ? '#ffd36b' : '#9fb8ad';
    ctx.fillText(p.matched ? str('interior.board.match') : str('interior.board.searching'), w / 2, left[1] + left[3] + size * 0.6);
    ctx.restore();
  }

  function draw(ctx, w, h, state, tFilm, dpr = 1) {
    const shownList = [];
    ctx.save();
    ctx.fillStyle = state.black ? '#000' : '#05090c';
    ctx.fillRect(0, 0, w, h);
    if (!state.black && state.view) {
      for (const l of state.layers) {
        drawLayer(ctx, map.layers[l.id], l.id, l.alpha, state.view, w, h, dpr, tFilm);
      }
      for (const m of state.marks) {
        drawLayer(ctx, map.layers[m.layer], m.layer, m.alpha, state.view, w, h, dpr, tFilm);
      }
    }
    for (const s of state.stills) {
      drawStill(ctx, s.id, slotRect(s.slot, w, h), s.alpha, s.push, s.u, dpr, shownList);
    }
    pair(ctx, state.match, w, h, dpr, true, shownList);
    pair(ctx, state.split, w, h, dpr, false, shownList);
    if (state.alert && state.alert.alpha > 0) {
      ctx.globalAlpha = state.alert.alpha;
      ctx.fillStyle = 'rgba(120, 18, 12, 0.9)';
      ctx.fillRect(0, h * 0.06, w, h * 0.1);
      ctx.fillStyle = '#ffe6dc';
      ctx.font = `700 ${Math.round(h * 0.05)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(str(state.alert.key), w / 2, h * 0.11);
      ctx.globalAlpha = 1;
    }
    if (state.hand) {
      /* A hand's shadow passing over the screen, no hand drawn. */
      const u = state.hand.u;
      const x = w * (1.15 - 1.3 * u);
      const y = h * (0.9 - 0.5 * u);
      const g = ctx.createRadialGradient(x, y, 0, x, y, w * 0.32);
      g.addColorStop(0, `rgba(0,0,0,${(0.55 * Math.sin(Math.PI * u)).toFixed(3)})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    /* The screen: scan lines, its grain, the glass's falloff. */
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 0; y < h; y += 3 * dpr) {
      ctx.fillRect(0, y, w, dpr);
    }
    const tile = grainTile();
    const off = Math.floor(tFilm / 41) % 64;
    ctx.globalAlpha = 1;
    for (let y = -off; y < h; y += 128) {
      for (let x = -off; x < w; x += 128) {
        ctx.drawImage(tile, x, y);
      }
    }
    const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    return shownList;
  }

  return { draw, source };
}
