/*
 * ratespanel.js: the Rates screen's picture of what each stick asks for.
 *
 * The rows beside this panel edit the pilot's rate profile; configs/rates.js
 * stores it and turns it into CLI, and the module flies it. This panel only
 * looks. It plots degrees per second against stick travel for every axis,
 * with the numbers a pilot actually reasons with (quarter, half and full
 * stick, and where hover sits) listed under the plot, and amber dots that
 * follow the live sticks along the curve each one will fly.
 *
 * Every rate comes from angleRateDeg in src/fc/ratescurve.js, the display
 * copy of Betaflight's rc.c that fc-trace checks against the compiled
 * module. Nothing in this file computes a rate.
 *
 * Roll and pitch are one curve until the pilot gives pitch numbers of its
 * own, because two identical curves drawn on top of each other look like one
 * curve in the wrong colour.
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

import {
  hoverStickPercent, normaliseRates, pitchMatchesRoll, rateAxis,
} from '../../configs/rates.js';
import { ANGLE_RATE_SAMPLES, angleRateDeg } from '../fc/ratescurve.js';
import { str } from '../strings/index.js';

/* Canvas colours. A 2D context cannot resolve var(--...), so the index.html
 * palette is repeated here as literals. The PIDs panel imports the axis
 * colours and surface tints from this file so both canvases agree on which
 * colour is which axis. */
export const INK = 'rgba(12, 18, 14, 0.55)';
export const AXIS = 'rgba(244, 236, 214, 0.26)';
export const LABEL = 'rgba(235, 230, 215, 0.62)';
export const SAKURA = '#e8a8b8';
export const MINT = '#7dffb4';
export const SLATE = '#9db3c8';
const GRIDLINE = 'rgba(244, 236, 214, 0.10)';
const STICK_DOT = '#ffd45c';

const FONT = '11px system-ui, -apple-system, "Segoe UI", sans-serif';

/* Stick positions the readout lists, as fractions of full travel. */
const READOUT_AT = [0.25, 0.5, 1];

/* Plot margins in CSS pixels: room for the scale on the left, the per curve
 * maxima on the right and the left/centre/right words underneath. */
const MARGIN = {
  left: 44, right: 52, top: 14, bottom: 26,
};

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

function curve(id, label, color, dash, profile, axisName) {
  const c = { id, label, color };
  if (dash) {
    c.dash = dash;
  }
  c.type = profile.type;
  c.axis = rateAxis(profile, axisName);
  return c;
}

/*
 * What gets drawn for a rate profile, in ratescurve.js's units (the stored
 * uint8s, untouched).
 *
 * Yaw is last and dashed so that on a profile where all three axes agree the
 * yaw dashes sit inside the roll line and both stay visible; drawn solid, or
 * first, one would hide the other. A split pitch gets its own dash pattern
 * for the same reason.
 */
export function ratesCurves(rates) {
  const profile = normaliseRates(rates || {});
  const yaw = curve('yaw', 'Yaw', SLATE, [5, 4], profile, 'yaw');
  if (pitchMatchesRoll(profile)) {
    return [curve('rollpitch', str('ui.roll_pitch'), SAKURA, null, profile, 'roll'), yaw];
  }
  return [
    curve('roll', str('ratespanel.roll'), SAKURA, null, profile, 'roll'),
    curve('pitch', str('ui.pitch'), MINT, [2, 3], profile, 'pitch'),
    yaw,
  ];
}

const rateAt = (c, stick) => angleRateDeg(c.type, c.axis, stick);

/* The curve a live stick is drawn on: its own axis, else the shared roll and
 * pitch line, else whatever is first. */
function riddenBy(curves, axisName) {
  return curves.find((c) => c.id === axisName)
    || curves.find((c) => c.id === 'rollpitch')
    || curves[0];
}

function spokenSummary(curves) {
  const perCurve = curves.map((c) => {
    const points = READOUT_AT.map((stick) => str('ratespanel.at', {
      v1: Math.round(rateAt(c, stick)),
      v2: stick === 1 ? str('ratespanel.the_stop') : `${stick * 100} percent`,
    }));
    return str('ratespanel.degrees_per_second', { label: c.label, v2: points.join(', ') });
  });
  return str('ratespanel.stick_to_rate_curve', { v1: perCurve.join('. ') });
}

/* Sizes the backing store to the wrap at the device pixel ratio and hands
 * back a context scaled to CSS pixels, or null when there is no context.
 * Assigning width or height wipes a canvas and its context state, so it is
 * only done when the size really changed. */
function fitCanvas(canvas, wrap) {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const width = Math.max(200, wrap.clientWidth || 520);
  const height = Math.max(150, wrap.clientHeight || 240);
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

/* The plot rectangle and its two mappings: stick (-1..1) to x, and deg/s
 * (-scale..scale) to y. */
function plotArea(width, height, scale) {
  const w = Math.max(20, width - MARGIN.left - MARGIN.right);
  const h = Math.max(20, height - MARGIN.top - MARGIN.bottom);
  const cx = MARGIN.left + w / 2;
  const cy = MARGIN.top + h / 2;
  return {
    left: MARGIN.left,
    top: MARGIN.top,
    right: MARGIN.left + w,
    bottom: MARGIN.top + h,
    w,
    h,
    cx,
    cy,
    scale,
    x: (stick) => cx + stick * (w / 2),
    y: (deg) => cy - (deg / scale) * (h / 2),
  };
}

/* Gridlines sit on half pixels so a one pixel line covers one row of
 * pixels instead of smearing over two. */
const crisp = (v) => Math.round(v) + 0.5;

function paintBackdrop(ctx, plot) {
  ctx.fillStyle = INK;
  ctx.fillRect(plot.left, plot.top, plot.w, plot.h);

  ctx.setLineDash([]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = GRIDLINE;
  ctx.beginPath();
  for (const stick of [-0.75, -0.5, -0.25, 0.25, 0.5, 0.75]) {
    const x = crisp(plot.x(stick));
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, plot.bottom);
  }
  for (const half of [-0.5, 0.5]) {
    const y = crisp(plot.cy - half * (plot.h / 2));
    ctx.moveTo(plot.left, y);
    ctx.lineTo(plot.right, y);
  }
  ctx.stroke();

  ctx.strokeStyle = AXIS;
  ctx.beginPath();
  ctx.moveTo(plot.left, crisp(plot.cy));
  ctx.lineTo(plot.right, crisp(plot.cy));
  ctx.moveTo(crisp(plot.cx), plot.top);
  ctx.lineTo(crisp(plot.cx), plot.bottom);
  ctx.stroke();
}

function paintCurves(ctx, plot, curves) {
  ctx.lineWidth = 2;
  for (const c of curves) {
    ctx.setLineDash(c.dash || []);
    ctx.strokeStyle = c.color;
    ctx.beginPath();
    for (let i = 0; i <= ANGLE_RATE_SAMPLES; i += 1) {
      const stick = (2 * i) / ANGLE_RATE_SAMPLES - 1;
      const x = plot.x(stick);
      const y = plot.y(rateAt(c, stick));
      if (i) {
        ctx.lineTo(x, y);
      } else {
        ctx.moveTo(x, y);
      }
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function paintScale(ctx, plot) {
  ctx.font = FONT;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = LABEL;
  ctx.textAlign = 'right';
  const scaleX = plot.left - 6;
  ctx.fillText(String(plot.scale), scaleX, plot.y(plot.scale));
  ctx.fillText('0', scaleX, plot.cy);
  ctx.fillText(`-${plot.scale}`, scaleX, plot.y(-plot.scale));

  ctx.textAlign = 'center';
  const wordsY = plot.bottom + 12;
  ctx.fillText('centre', plot.cx, wordsY);
  ctx.fillText('left', plot.left + 16, wordsY);
  ctx.fillText('right', plot.right - 16, wordsY);
}

/* Each curve's full stick rate beside the plot in its own colour. Curves
 * that end at the same rate would print on one line, so each label steps
 * down until it is clear of the ones already written. */
function paintMaxima(ctx, plot, curves) {
  ctx.textAlign = 'left';
  const taken = [];
  for (const c of curves) {
    const top = rateAt(c, 1);
    let y = plot.y(top);
    while (taken.some((other) => Math.abs(other - y) < 12)) {
      y += 12;
    }
    taken.push(y);
    ctx.fillStyle = c.color;
    ctx.fillText(String(Math.round(top)), plot.right + 6, y);
  }
}

function paintSticks(ctx, plot, curves, sticks) {
  ctx.fillStyle = STICK_DOT;
  for (const axisName of ['roll', 'pitch', 'yaw']) {
    const raw = sticks[axisName];
    const on = riddenBy(curves, axisName);
    if (!Number.isFinite(raw) || !on) {
      continue;
    }
    const stick = Math.min(1, Math.max(-1, raw));
    ctx.beginPath();
    ctx.arc(plot.x(stick), plot.y(rateAt(on, stick)), 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

/*
 * The legend and the readout table for one set of curves. The returned
 * handles are what each paint writes into; they are rebuilt only when the
 * set of curves changes (a pitch split or rejoined), so a knob step costs
 * text writes and no new nodes.
 *
 * Each readout number is its own span in its curve's colour, in curve
 * order, so the legend's colours say which number is which axis without a
 * label per number.
 */
function buildKey(legend, readout, curves) {
  legend.textContent = '';
  readout.textContent = '';
  const maxima = curves.map((c) => {
    const swatch = make('span', c.dash ? 'rates-key-dot rates-key-dash' : 'rates-key-dot');
    swatch.style.background = c.color;
    const value = make('span', 'rates-key-val', '');
    const entry = make('span', 'rates-key');
    entry.append(swatch, make('span', 'rates-key-lab', c.label), value);
    legend.append(entry);
    return value;
  });

  const rows = READOUT_AT.map((stick) => {
    const heading = stick === 1 ? str('ratespanel.full_stick') : str('ratespanel.stick', { v1: stick * 100 });
    const numbers = make('dd', null, '');
    const slots = curves.map((c, i) => {
      const sep = i > 0 ? make('span', 'rates-num-sep', ' / ') : null;
      const num = make('span', 'rates-num');
      num.style.color = c.color;
      if (sep) {
        numbers.append(sep);
      }
      numbers.append(num);
      return { sep, num };
    });
    numbers.append(make('span', 'rates-num-unit', ' deg/s'));
    const row = make('div', 'rates-cell');
    row.append(make('dt', null, heading), numbers);
    readout.append(row);
    return { stick, slots };
  });

  const hover = make('dd', null, '');
  const hoverRow = make('div', 'rates-cell');
  hoverRow.append(make('dt', null, str('ratespanel.hover_sits_at')), hover);
  readout.append(hoverRow);

  return { maxima, rows, hover };
}

/* Writes one readout row. A number equal to the one before it is blanked
 * along with its separator: on a profile where every axis agrees the row
 * says 670 once rather than "670 / 670 / 670". */
function fillRow(row, curves) {
  let previous = null;
  row.slots.forEach((slot, i) => {
    const deg = Math.round(rateAt(curves[i], row.stick));
    const repeat = deg === previous;
    slot.num.textContent = repeat ? '' : String(deg);
    slot.num.hidden = repeat;
    if (slot.sep) {
      slot.sep.hidden = repeat;
    }
    previous = deg;
  });
}

export function mountRatesPanel() {
  const canvas = document.createElement('canvas');
  canvas.className = 'rates-graph';
  canvas.setAttribute('role', 'img');
  const graphWrap = make('div', 'rates-graph-wrap');
  graphWrap.append(canvas);
  const legend = make('div', 'rates-legend');
  const readout = make('dl', 'rates-readout');
  const root = make('div', 'rates-panel');
  root.append(graphWrap, legend, readout);

  /* Curves are always rebuilt from the profile handed to paint and never
   * cached in the key: a key holding stale curve objects once showed one
   * rates type's numbers under another type's legend. The key keys on the
   * list of curve ids only. */
  let curves = ratesCurves(null);
  let sticks = { roll: 0, pitch: 0, yaw: 0 };
  let key = null;
  let keyIds = '';

  function draw() {
    const fit = fitCanvas(canvas, graphWrap);
    if (!fit) {
      return;
    }
    const { ctx } = fit;
    const fastest = Math.max(...curves.map((c) => rateAt(c, 1)), 100);
    /* Rounded up to whole hundreds so the plot keeps its scale while a knob
     * steps through a range. */
    const plot = plotArea(fit.width, fit.height, Math.ceil(fastest / 100) * 100);
    paintBackdrop(ctx, plot);
    paintCurves(ctx, plot, curves);
    paintScale(ctx, plot);
    paintMaxima(ctx, plot, curves);
    paintSticks(ctx, plot, curves, sticks);
  }

  /*
   * `rates` is the profile to show, which on the Rates screen may carry a
   * number the pilot is still typing. `stick`, when given, replaces the live
   * stick object. `airframe` picks the hover table's column and may be left
   * out for the default aircraft.
   */
  function paint(rates, stick, airframe) {
    const profile = normaliseRates(rates || {});
    curves = ratesCurves(profile);
    if (stick) {
      sticks = stick;
    }
    const ids = curves.map((c) => c.id).join(',');
    if (ids !== keyIds) {
      keyIds = ids;
      key = buildKey(legend, readout, curves);
    }
    curves.forEach((c, i) => {
      key.maxima[i].textContent = str('ratespanel.deg_s', { v1: Math.round(rateAt(c, 1)) });
    });
    for (const row of key.rows) {
      fillRow(row, curves);
    }
    key.hover.textContent = str('ratespanel.stick', {
      v1: hoverStickPercent(profile.throttleCap, airframe).toFixed(1),
    });
    canvas.setAttribute('aria-label', spokenSummary(curves));
    draw();
  }

  /* The frame loop's entry, called only while the Rates screen shows. It
   * moves the dots and leaves the text alone, since the text cannot have
   * changed between two frames. */
  function paintStick(stick) {
    if (stick) {
      sticks = stick;
    }
    draw();
  }

  return { root, paint, paintStick };
}
