/*
 * pidspanel.js: the PIDs screen's bar chart of the gains the module is
 * running.
 *
 * The numbers come from the module itself (sim_bf_get after each init, which
 * src/main.js publishes and ui.js hands to paint), not from the menu. The
 * menu says what the pilot asked for; this panel says what Betaflight ended
 * up with, so a row that silently changes nothing shows as exactly that.
 *
 * Five groups of three bars: P, I, D, D max and feedforward, roll, pitch and
 * yaw inside each. A group is scaled to its own tallest value, live or
 * stock, because feedforward runs near three times P and a shared scale
 * would squash every P bar to a sliver. Inside a group the bars compare
 * directly. A thin notch on each bar marks Betaflight 4.5.1's factory value
 * (configs/pids.js STOCK_PIDS), which is the same on every tune and so stays
 * still while tunes change around it.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { PID_AXES, PID_FIELDS, STOCK_PIDS } from '../../configs/pids.js';
/* Axis colours and surface tints from the rates panel, so an axis is the
 * same colour on both screens. */
import {
  AXIS, INK, LABEL, MINT, SAKURA, SLATE,
} from './ratespanel.js';
import { str } from '../strings/index.js';

const STOCK_MARK = 'rgba(244, 236, 214, 0.75)';
const FONT = '11px system-ui, -apple-system, "Segoe UI", sans-serif';

const AXES = {
  roll: { name: 'Roll', color: SAKURA },
  pitch: { name: 'Pitch', color: MINT },
  yaw: { name: 'Yaw', color: SLATE },
};

/* Captions under each group and prefixes in the readout. Read once at load,
 * like the rest of the module's constants. */
const FIELD_NAME = {
  p: 'P', i: 'I', d: 'D', dmax: str('pidspanel.d_max'), f: 'FF',
};

/* Chart geometry in CSS pixels. */
const PAD_TOP = 10;
const PAD_BOTTOM = 22;
const PAD_SIDE = 8;
const BAR_GAP = 3;
/* Room above the tallest bar in a group, as a factor of its value. */
const HEADROOM = 1.12;

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text != null) {
    node.textContent = text;
  }
  return node;
}

function gainsLine(row) {
  return str('pidspanel.p_i_d_d_max_feedforward', {
    p: row.p, i: row.i, d: row.d, dmax: row.dmax, f: row.f,
  });
}

/* The canvas's text alternative. The stock line is built from STOCK_PIDS,
 * the table the notches are drawn from, so what is read aloud and what is
 * drawn cannot disagree. */
function spokenSummary(pids) {
  const perAxis = PID_AXES.map((axis) => `${AXES[axis].name} ${gainsLine(pids[axis])}`);
  return str('pidspanel.pid_values_the_module_is_flying', {
    v1: perAxis.join('. '),
    line: gainsLine(STOCK_PIDS.roll),
  });
}

/* Same contract as the rates panel's: backing store at the device pixel
 * ratio, resized only on a real change because a resize wipes the canvas,
 * and a context in CSS pixels or null. */
function fitCanvas(canvas, wrap) {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const width = Math.max(200, wrap.clientWidth || 520);
  const height = Math.max(140, wrap.clientHeight || 220);
  const deviceW = Math.round(width * dpr);
  const deviceH = Math.round(height * dpr);
  if (canvas.width !== deviceW || canvas.height !== deviceH) {
    canvas.width = deviceW;
    canvas.height = deviceH;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

/* One field's three bars and stock notches, then its caption. `left` is
 * the group's left edge and `groupW` its width. */
function paintGroup(ctx, field, pids, left, groupW, barW, chartH) {
  const live = pids ? PID_AXES.map((axis) => pids[axis][field]) : [];
  const stock = PID_AXES.map((axis) => STOCK_PIDS[axis][field]);
  /* The 1 floor keeps an all zero group (yaw D on stock tunes, everything on
   * a zeroed readback) from scaling by zero. */
  const top = Math.max(...live, ...stock, 1) * HEADROOM;
  const baseline = PAD_TOP + chartH;
  const barsW = PID_AXES.length * barW + (PID_AXES.length - 1) * BAR_GAP;
  const firstX = left + (groupW - barsW) / 2;
  PID_AXES.forEach((axis, i) => {
    const x = firstX + i * (barW + BAR_GAP);
    if (pids) {
      const barH = (pids[axis][field] / top) * chartH;
      ctx.fillStyle = AXES[axis].color;
      ctx.fillRect(x, baseline - barH, barW, barH);
    }
    const factory = STOCK_PIDS[axis][field];
    if (factory > 0) {
      ctx.fillStyle = STOCK_MARK;
      ctx.fillRect(x - 1, baseline - (factory / top) * chartH, barW + 2, 1.5);
    }
  });
  ctx.fillStyle = LABEL;
  ctx.fillText(FIELD_NAME[field], left + groupW / 2, baseline + 15);
}

export function mountPidsPanel() {
  const caption = make('div', 'pids-caption', '');
  const canvas = document.createElement('canvas');
  canvas.className = 'rates-graph';
  canvas.setAttribute('role', 'img');
  const graphWrap = make('div', 'rates-graph-wrap pids-graph-wrap');
  graphWrap.append(canvas);

  const legend = make('div', 'rates-legend');
  const readout = make('dl', 'rates-readout pids-readout');
  const values = {};
  for (const axis of PID_AXES) {
    const { name, color } = AXES[axis];
    const swatch = make('span', 'rates-key-dot');
    swatch.style.background = color;
    const entry = make('span', 'rates-key');
    entry.append(swatch, make('span', 'rates-key-lab', name));
    legend.append(entry);

    const value = make('dd', null, '');
    value.style.color = color;
    const row = make('div', 'rates-cell');
    row.append(make('dt', null, name), value);
    readout.append(row);
    values[axis] = value;
  }

  const root = make('div', 'rates-panel pids-panel');
  root.append(caption, graphWrap, legend, readout);

  /* The last readback painted, or null while the module is still being read
   * for the tune on the menu. */
  let pids = null;

  function draw() {
    const fit = fitCanvas(canvas, graphWrap);
    if (!fit) {
      return;
    }
    const { ctx, width, height } = fit;
    const chartH = Math.max(20, height - PAD_TOP - PAD_BOTTOM);
    const groupW = (width - PAD_SIDE * 2) / PID_FIELDS.length;
    const barW = Math.max(4, Math.min(16, (groupW - 18) / PID_AXES.length));

    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = AXIS;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD_SIDE, PAD_TOP + chartH + 0.5);
    ctx.lineTo(width - PAD_SIDE, PAD_TOP + chartH + 0.5);
    ctx.stroke();

    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    PID_FIELDS.forEach((field, i) => {
      paintGroup(ctx, field, pids, PAD_SIDE + i * groupW, groupW, barW, chartH);
    });
  }

  /*
   * `live` is the readback object ui.js passes (null, or one without pids,
   * while the module has not been read for this tune yet; the panel then
   * says it is reading rather than showing the last tune's bars).
   * `captionText` is the line above the chart.
   */
  function paint(live, captionText) {
    pids = live && live.pids ? live.pids : null;
    caption.textContent = captionText || '';
    for (const axis of PID_AXES) {
      values[axis].textContent = pids
        ? PID_FIELDS.map((field) => `${FIELD_NAME[field]} ${pids[axis][field]}`).join('  ')
        : str('pidspanel.reading_the_module');
    }
    canvas.setAttribute('aria-label', pids ? spokenSummary(pids) : str('pidspanel.pid_values_are_being_read_from'));
    draw();
  }

  /* Only menu rebuilds call paint, so without this a window resize would
   * leave the bars stretched until the next keypress. A hidden screen has
   * a zero width wrap and nothing to fit, so it is skipped. */
  window.addEventListener('resize', () => {
    if (graphWrap.clientWidth) {
      draw();
    }
  });

  return { root, paint };
}
