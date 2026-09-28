/*
 * hangar-tuning.js: the hangar's Tuning tab, a plane set up on the bench.
 *
 * Registered into the hangar (src/ui/hangar.js, registerHangarTab) rather
 * than written into it. Three pages under one tab, each turning the
 * camera to what it is about:
 *
 *   BALANCE  the CG: the battery slid in its bay, lead in the nose or on
 *            the tail, and where that puts the CG against the maker's
 *            mark and range (configs/tuning.js), with the static margin
 *            it leaves and a warning past the range or near the neutral
 *            point. The model shows a CG mark over the plane and a gauge
 *            on the floor under it (src/render/hangar-tuning3d.js).
 *   RATES    low, mid or high throws from the manual, the expo on each
 *            surface with the stick to surface curve drawn, the elevator
 *            trim, and on the Timber the flaps the run starts on and the
 *            manual's flap to elevator mix. The model's surfaces sweep
 *            through the throws on show.
 *   STAND    the motor or the engine run on the bench: a throttle, the
 *            static thrust, the current, the prop's rpm and the pack's
 *            volts or the fuel, live, from the plant itself run headless
 *            (src/game/teststand.js), and the time the pack or the tank
 *            lasts at that throttle, run down on the same plant. The prop
 *            turns on the model and the shell plays the motor's voice
 *            (standSound, read by src/main.js).
 *
 * Nothing is kept until the hangar's Save, which stores the setup as
 * settings.tuning[airframeId], stock fields left out; the shell seats it
 * with the plane (src/main.js applyTuning). The stock setup is no setup:
 * the plant flies its own table, bit for bit.
 *
 * Like hangar.js, THIS FILE IS THE CHOICE AND NOT THE PICTURE: nothing
 * here imports three.js.
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

import { registerHangarTab } from './hangar.js';
import {
  MARGIN_WARN, RATES, TRIM_MAX_DEG, balance, curve, fullEntry, normalizeEntry, setupFor, throwsFor,
  tuneBlock, tuningFor,
} from '../../configs/tuning.js';
import { TABLE, powerCells, powerOption, powerParams } from '../../configs/power.js';
import { currentLocale, str } from '../strings/index.js';

const SECTIONS = ['balance', 'rates', 'stand'];
const FOCUS = { balance: 'fuselage', rates: 'trim', stand: 'nose' };
const SURFACES = ['a', 'e', 'r'];
/* The steps the controls move in: mm of battery, g of lead, percent of
 * expo, degrees of trim (a radio's trim click), percent of throttle. */
const PACK_STEP = 5;
const LEAD_STEP = 5;
const EXPO_STEP = 5;
const TRIM_STEP = 0.25;
const THROTTLE_STEP = 5;
/* The stand runs at most this much sim time a frame, ms, so a frame the
 * browser drops does not make it run a burst. */
const STAND_FRAME_MS = 50;
/* The run down's steps a frame: about 5 ms of work on the machines the
 * checks were measured on (scripts/tuning-check.js runs a million a
 * second in Node). */
const RUN_DOWN_STEPS = 5000;
/* The surfaces' sweep on the model on the Rates page, a full stick and
 * back, seconds. */
const SWEEP_S = 3.2;

/*
 * The shell's side (src/main.js, setTuningShell): stand() resolves to the
 * TestStand on a second instance of the module, made the first time the
 * bench is used. Null in Node, where there is no stand to run.
 */
let shell = null;
export function setTuningShell(s) {
  shell = s;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) {
    n.className = cls;
  }
  if (text != null) {
    n.textContent = text;
  }
  return n;
}

function button(cls, text) {
  const b = el('button', cls, text);
  b.type = 'button';
  return b;
}

function number(n, digits = 0, least = digits) {
  return n.toLocaleString(currentLocale(), { maximumFractionDigits: digits, minimumFractionDigits: least });
}

function hostOf(text) {
  const m = /https?:\/\/(?:www\.)?([^/\s]+)/.exec(text || '');
  return m ? m[1] : null;
}

/* The tab's state, one plane at a time; the hangar is one screen. */
const T = {
  h: null,
  id: null,
  settings: null,
  saved: null,
  entry: null,
  section: 'balance',
  stand: null,
  standOn: false,
  throttle: 0.5,
  reading: null,
  runDown: null,
  endurance: null,
  standKey: '',
  lastMs: 0,
  els: null,
  sweepT0: 0,
  cells: 0,
  voice: 'wing',
};

/* What the setup is balanced on: the Power tab's choice on show, saved or
 * not. */
function setup(h) {
  return setupFor(T.id, h.choice);
}

function normalised(h, entry) {
  return normalizeEntry(T.id, entry, setup(h).limits);
}

function changed(h, key, sound = 'select') {
  T.endurance = null;
  h.changed(key, sound);
}

/* The entry with one field moved, snapped and clamped by the config. */
function setField(h, key, field, value) {
  T.entry = fullEntry(T.id, normalised(h, { ...T.entry, [field]: value }));
  changed(h, key, 'adjust');
}

function setExpo(h, key, surface, value) {
  T.entry = fullEntry(T.id, normalised(h, { ...T.entry, expo: { ...T.entry.expo, [surface]: value } }));
  changed(h, key, 'adjust');
}

/* A value between a minus and a plus, the cursor's way to move a number. */
function stepper(h, { key, label, value, focus, dec, inc, canDec, canInc }) {
  const row = el('div', 'tn-row');
  row.append(el('span', 'tn-row-label', label));
  const box = el('div', 'tn-stepper');
  const minus = button('tn-step', '\u2212');
  minus.dataset.key = `${key}-dec`;
  minus.dataset.focus = focus;
  minus.setAttribute('aria-label', `${label}, ${str('tuning.less')}`);
  minus.disabled = !canDec;
  minus.addEventListener('click', dec);
  const plus = button('tn-step', '+');
  plus.dataset.key = `${key}-inc`;
  plus.dataset.focus = focus;
  plus.setAttribute('aria-label', `${label}, ${str('tuning.more')}`);
  plus.disabled = !canInc;
  plus.addEventListener('click', inc);
  box.append(minus, el('span', 'tn-value', value), plus);
  row.append(box);
  return row;
}

/* A row of choices, one on. */
function segmented(h, { key, items, on, focus, pick }) {
  const row = el('div', 'tn-seg');
  row.setAttribute('role', 'radiogroup');
  for (const it of items) {
    const b = button(`tn-seg-btn${it.id === on ? ' on' : ''}`, it.label);
    b.dataset.key = `${key}-${it.id}`;
    b.dataset.focus = focus;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(it.id === on));
    b.addEventListener('click', () => pick(it.id));
    row.append(b);
  }
  return row;
}

function sectionNav(h) {
  const nav = segmented(h, {
    key: 'tuning',
    items: SECTIONS.map((s) => ({ id: s, label: str(`tuning.section.${s}`) })),
    on: T.section,
    focus: FOCUS[T.section],
    pick: (s) => {
      if (s !== T.section) {
        T.section = s;
        h.focus = FOCUS[s];
        stopStand();
        T.sweepT0 = performance.now();
        changed(h, `tuning-${s}`, 'adjust');
      }
    },
  });
  nav.classList.add('tn-nav');
  return nav;
}

/* ---- BALANCE ---- */

function cgText(t, shift) {
  const mm = Math.round(shift * 10000) / 10;
  if (t.cg.mm != null) {
    return str('tuning.cg_mm', { n: number(t.cg.mm - shift * 1000, 1, 0) });
  }
  if (Math.abs(mm) < 0.05) {
    return str('tuning.cg_at_stock');
  }
  return str(mm > 0 ? 'tuning.cg_ahead' : 'tuning.cg_behind', { n: number(Math.abs(mm), 1) });
}

/* The warning the balance earns, or '' for none. */
function balanceWarning(t, b) {
  if (b.margin < 0) {
    return str('tuning.warn_unstable');
  }
  if (b.margin < MARGIN_WARN) {
    return str('tuning.warn_neutral');
  }
  if (t.cg.range && t.cg.mm != null) {
    const at = t.cg.mm - b.shift * 1000;
    if (at < t.cg.range[0] - 0.05) {
      return str('tuning.warn_fwd');
    }
    if (at > t.cg.range[1] + 0.05) {
      return str('tuning.warn_aft');
    }
  }
  return '';
}

/* The gauge: the CG's reach from nose to tail, the maker's range lit, the
 * kit's mark, and where it is now. */
function gauge(t, b, reach) {
  const box = el('div', 'tn-gauge');
  const track = el('div', 'tn-gauge-track');
  const span = reach[1] - reach[0];
  /* Nose on the left: the shift is forward positive, so the left end is
   * the most forward. */
  const x = (shift) => `${(100 * (reach[1] - shift)) / span}%`;
  if (t.cg.range && t.cg.mm != null) {
    const fore = (t.cg.mm - t.cg.range[0]) / 1000;
    const aft = (t.cg.mm - t.cg.range[1]) / 1000;
    const band = el('span', 'tn-gauge-band');
    band.style.left = x(Math.min(reach[1], fore));
    band.style.right = `${100 - parseFloat(x(Math.max(reach[0], aft)))}%`;
    track.append(band);
  }
  const kit = el('span', 'tn-gauge-kit');
  kit.style.left = x(0);
  const now = el('span', 'tn-gauge-now');
  now.style.left = x(Math.max(reach[0], Math.min(reach[1], b.shift)));
  track.append(kit, now);
  const ends = el('div', 'tn-gauge-ends');
  ends.append(el('span', '', str('tuning.nose')), el('span', '', str('tuning.tail')));
  box.append(track, ends);
  return box;
}

/* How far the CG can go each way with what the bay and the lead allow. */
function reachOf(h) {
  const s = setup(h);
  const fwd = balance(T.id, { packMm: s.limits.packMm, ballastG: s.limits.ballastG }, s.massKg, s.packKg).shift;
  const aft = balance(T.id, { packMm: -s.limits.packMm, ballastG: -s.limits.ballastG }, s.massKg, s.packKg).shift;
  return [aft, fwd];
}

function balancePage(h, box) {
  const t = tuningFor(T.id);
  const s = setup(h);
  const e = T.entry;
  const b = balance(T.id, e, s.massKg, s.packKg);
  const reach = reachOf(h);

  box.append(el('h3', 'hangar-h', str('tuning.cg')));
  const head = el('div', 'tn-cg');
  head.append(
    el('span', 'tn-cg-value', cgText(t, b.shift)),
    el('span', 'tn-cg-datum', t.cg.mm != null ? str(t.cg.datum) : ''),
  );
  box.append(head);
  box.append(gauge(t, b, reach));
  box.append(el('p', 'tn-range', t.cg.range ? str('tuning.range', { a: number(t.cg.range[0], 1, 0), b: number(t.cg.range[1], 1, 0) }) : str('tuning.range_none')));

  const stats = el('div', 'hangar-stats tn-stats');
  const stat = (label, value, warn = false) => {
    const tile = el('div', `hangar-stat${warn ? ' tn-stat-warn' : ''}`);
    tile.append(el('span', 'hangar-stat-label', label), el('span', 'hangar-stat-value', value));
    return tile;
  };
  stats.append(
    stat(str('tuning.margin'), str('tuning.percent', { n: number(b.margin * 100, 1) }), b.margin < MARGIN_WARN),
    stat(str('tuning.weight'), str('carousel.grams', { n: number(Math.round(b.mass * 1000)) })),
  );
  box.append(stats);

  const warn = balanceWarning(t, b);
  if (warn) {
    box.append(el('p', 'tn-warn', warn));
  }

  if (s.limits.packMm > 0) {
    const v = e.packMm;
    box.append(stepper(h, {
      key: 'pack',
      label: str('tuning.pack'),
      value: v === 0 ? str('tuning.centred') : str(v > 0 ? 'tuning.pack_fwd' : 'tuning.pack_back', { n: number(Math.abs(v)) }),
      focus: 'fuselage',
      canDec: v > -s.limits.packMm,
      canInc: v < s.limits.packMm,
      dec: () => setField(h, 'pack-dec', 'packMm', v - PACK_STEP),
      inc: () => setField(h, 'pack-inc', 'packMm', v + PACK_STEP),
    }));
  }
  const g = e.ballastG;
  box.append(stepper(h, {
    key: 'lead',
    label: str('tuning.lead'),
    value: g === 0 ? str('tuning.lead_none') : str(g > 0 ? 'tuning.lead_nose' : 'tuning.lead_tail', { n: number(Math.abs(g)) }),
    focus: 'fuselage',
    canDec: g > -s.limits.ballastG,
    canInc: g < s.limits.ballastG,
    dec: () => setField(h, 'lead-dec', 'ballastG', g - LEAD_STEP),
    inc: () => setField(h, 'lead-inc', 'ballastG', g + LEAD_STEP),
  }));
  box.append(el('p', 'hangar-note', str('tuning.balance_note')));
  const host = hostOf(t.cg.source);
  if (host) {
    box.append(el('p', 'hangar-source', str('hangar.source', { source: host })));
  }
}

/* ---- RATES ---- */

/* The stick to surface curve, the plant's, for each surface the plane has,
 * as a share of the highest throw on show. */
function curveSvg(t, throws, expo) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-1.08 -1.08 2.16 2.16');
  svg.setAttribute('class', 'tn-curve');
  svg.setAttribute('aria-hidden', 'true');
  const grid = document.createElementNS(NS, 'path');
  grid.setAttribute('d', 'M-1 0H1M0 -1V1M-1 -1H1V1H-1Z');
  grid.setAttribute('class', 'tn-curve-grid');
  svg.append(grid);
  const top = Math.max(...throws, 1e-9);
  SURFACES.forEach((k, i) => {
    if (!(throws[i] > 0)) {
      return;
    }
    let d = '';
    for (let j = 0; j <= 40; j += 1) {
      const x = -1 + j / 20;
      const y = (curve(x, expo[k]) * throws[i]) / top;
      d += `${j ? 'L' : 'M'}${x.toFixed(3)} ${(-y).toFixed(3)}`;
    }
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', `tn-curve-line tn-curve-${k}`);
    svg.append(p);
  });
  return svg;
}

function ratesPage(h, box) {
  const t = tuningFor(T.id);
  const e = T.entry;
  const throws = throwsFor(T.id, e.rate);
  box.append(el('h3', 'hangar-h', str('tuning.rates')));
  box.append(segmented(h, {
    key: 'rate',
    items: RATES.map((r) => ({ id: r, label: str(`tuning.rate.${r}`) })),
    on: e.rate,
    focus: 'trim',
    pick: (r) => {
      T.entry = fullEntry(T.id, normalised(h, { ...T.entry, rate: r }));
      T.sweepT0 = performance.now();
      changed(h, `rate-${r}`);
    },
  }));

  const table = el('div', 'tn-surfaces');
  const plot = el('div', 'tn-plot');
  plot.append(curveSvg(t, throws, e.expo));
  const legend = el('div', 'tn-legend');
  SURFACES.forEach((k, i) => {
    if (!(throws[i] > 0)) {
      return;
    }
    const item = el('div', `tn-surface tn-surface-${k}`);
    item.append(
      el('span', 'tn-surface-name', str(`tuning.surface.${k}`)),
      el('span', 'tn-surface-throw', str('tuning.throw', { n: number(throws[i], 1) })),
    );
    legend.append(item);
  });
  plot.append(legend);
  table.append(plot);
  box.append(table);
  box.append(el('p', 'tn-caption', str('tuning.curve')));

  box.append(el('h3', 'hangar-h', str('tuning.expo')));
  SURFACES.forEach((k, i) => {
    if (!(throws[i] > 0)) {
      return;
    }
    const v = e.expo[k];
    box.append(stepper(h, {
      key: `expo-${k}`,
      label: str(`tuning.surface.${k}`),
      value: str('tuning.percent', { n: number(v) }),
      focus: k === 'a' ? 'wing' : 'tail',
      canDec: v > 0,
      canInc: v < 100,
      dec: () => setExpo(h, `expo-${k}-dec`, k, v - EXPO_STEP),
      inc: () => setExpo(h, `expo-${k}-inc`, k, v + EXPO_STEP),
    }));
  });

  box.append(el('h3', 'hangar-h', str('tuning.trim')));
  const tr = e.trimDeg;
  box.append(stepper(h, {
    key: 'trim',
    label: str('tuning.surface.e'),
    value: tr === 0 ? str('tuning.centred') : str(tr > 0 ? 'tuning.trim_up' : 'tuning.trim_down', { n: number(Math.abs(tr), 2) }),
    focus: 'tail',
    canDec: tr > -TRIM_MAX_DEG,
    canInc: tr < TRIM_MAX_DEG,
    dec: () => setField(h, 'trim-dec', 'trimDeg', tr - TRIM_STEP),
    inc: () => setField(h, 'trim-inc', 'trimDeg', tr + TRIM_STEP),
  }));

  box.append(el('h3', 'hangar-h', str('tuning.flaps')));
  if (t.flaps) {
    box.append(el('span', 'tn-sub', str('tuning.flap_start')));
    box.append(segmented(h, {
      key: 'flap',
      items: [0, 1, 2].map((n) => ({ id: n, label: str(`tuning.flap.${n}`) })),
      on: e.flapStart,
      focus: 'wing',
      pick: (n) => {
        T.entry = fullEntry(T.id, normalised(h, { ...T.entry, flapStart: n }));
        changed(h, `flap-${n}`);
      },
    }));
    box.append(el('span', 'tn-sub', str('tuning.flap_mix')));
    box.append(segmented(h, {
      key: 'mix',
      items: [{ id: 'on', label: str('tuning.flap_mix_on') }, { id: 'off', label: str('tuning.flap_mix_off') }],
      on: e.flapMix ? 'on' : 'off',
      focus: 'tail',
      pick: (m) => {
        T.entry = fullEntry(T.id, normalised(h, { ...T.entry, flapMix: m === 'on' }));
        changed(h, `mix-${m}`);
      },
    }));
  } else {
    box.append(el('p', 'hangar-note tn-flat', str(T.id === 'radian2000' ? 'tuning.crow_none' : 'tuning.flaps_none')));
  }
  if (e.rate === 'mid') {
    box.append(el('p', 'hangar-source', str('tuning.mid_note')));
  }
  const host = hostOf(t.throws.source);
  if (host) {
    box.append(el('p', 'hangar-source', str('hangar.source', { source: host })));
  }
}

/* ---- STAND ---- */

function standVoice(h) {
  const o = powerOption(T.id, h.choice && h.choice.option);
  return o ? o.voice : 'wing';
}

function stopStand() {
  T.standOn = false;
  T.runDown = null;
  T.reading = null;
}

/* The stand seated on what is on show now: the Power tab's choice and
 * this tab's setup. Reseated whenever either changes. */
function seatStand(h) {
  const choice = h.choice || {};
  const key = JSON.stringify([T.id, choice, T.entry]);
  if (T.standKey === key) {
    return true;
  }
  const s = setup(h);
  const block = tuneBlock(T.id, normalised(h, T.entry), s.massKg, s.packKg);
  T.stand.seat(TABLE[T.id].simId, powerParams(T.id, choice.option, choice.pack), block);
  T.standKey = key;
  return true;
}

function standCells(h) {
  const c = h.choice || {};
  const o = powerOption(T.id, c.option);
  return o.kind === 'electric' ? powerCells(T.id, c.option, c.pack) : 0;
}

function standPage(h, box) {
  const glow = powerOption(T.id, h.choice && h.choice.option).kind === 'glow';
  box.append(el('h3', 'hangar-h', str('tuning.section.stand')));
  const th = Math.round(T.throttle * 100);
  box.append(stepper(h, {
    key: 'throttle',
    label: str('tuning.throttle'),
    value: str('tuning.percent', { n: number(th) }),
    focus: 'nose',
    canDec: th > 0,
    canInc: th < 100,
    dec: () => {
      T.throttle = Math.max(0, th - THROTTLE_STEP) / 100;
      T.endurance = null;
      h.changed('throttle-dec', 'adjust');
    },
    inc: () => {
      T.throttle = Math.min(100, th + THROTTLE_STEP) / 100;
      T.endurance = null;
      h.changed('throttle-inc', 'adjust');
    },
  }));
  const run = button(`tn-run${T.standOn ? ' on' : ''}`, str(T.standOn ? 'tuning.stop' : glow ? 'tuning.start_engine' : 'tuning.start'));
  run.dataset.key = 'stand-run';
  run.dataset.focus = 'nose';
  run.disabled = !shell;
  run.addEventListener('click', () => {
    if (T.standOn) {
      stopStand();
      h.changed('stand-run', 'back');
      return;
    }
    startStand(h, () => {
      T.runDown = null;
      T.standOn = true;
      T.stand.restart();
      T.lastMs = performance.now();
    });
  });
  box.append(run);

  const stats = el('div', 'hangar-stats tn-stats');
  const tile = (label) => {
    const t = el('div', 'hangar-stat');
    const v = el('span', 'hangar-stat-value', '');
    const sub = el('span', 'tn-stat-sub', '');
    t.append(el('span', 'hangar-stat-label', label), v, sub);
    stats.append(t);
    return { v, sub };
  };
  T.els = {
    thrust: tile(str('tuning.thrust')),
    current: glow ? null : tile(str('tuning.current')),
    rpm: tile(str('tuning.rpm')),
    pack: tile(str(glow ? 'tuning.fuel' : 'tuning.volts')),
  };
  if (glow) {
    T.els.pack.v.dataset.glow = '1';
  }
  T.cells = standCells(h);
  box.append(stats);
  paintReading();

  box.append(el('h3', 'hangar-h', str('tuning.endurance')));
  const row = el('div', 'tn-endurance');
  const out = el('span', 'tn-endurance-value', T.endurance
    ? str('tuning.minutes_at', { n: number(T.endurance.seconds / 60, 1), pct: number(Math.round(T.endurance.throttle * 100)) })
    : '');
  T.els.endurance = out;
  const measure = button('tn-seg-btn tn-measure', str('tuning.measure'));
  measure.dataset.key = 'stand-measure';
  measure.dataset.focus = 'nose';
  measure.disabled = !shell || Boolean(T.runDown);
  measure.addEventListener('click', () => {
    startStand(h, () => {
      T.standOn = false;
      T.endurance = null;
      T.runDown = { throttle: T.throttle, cells: standCells(h) };
    });
  });
  row.append(measure, out);
  box.append(row);
  box.append(el('p', 'hangar-note', str('tuning.stand_note')));
}

/* The stand, made on first use, seated, then `go`. */
function startStand(h, go) {
  if (!shell) {
    return;
  }
  Promise.resolve(T.stand || shell.stand())
    .then((stand) => {
      if (!stand || T.id == null) {
        return;
      }
      T.stand = stand;
      seatStand(h);
      go();
      h.changed(T.runDown ? 'stand-measure' : 'stand-run', 'select');
    })
    .catch((e) => {
      console.error('test stand failed', e);
    });
}

function paintReading() {
  const r = T.reading;
  const E = T.els;
  if (!E || !E.thrust) {
    return;
  }
  for (const k of ['thrust', 'current', 'rpm', 'pack']) {
    if (E[k]) {
      E[k].v.parentElement.classList.toggle('tn-idle', !r);
    }
  }
  if (!r) {
    E.thrust.v.textContent = str('tuning.newtons', { n: number(0, 1) });
    E.thrust.sub.textContent = str('tuning.grams_force', { n: number(0) });
    if (E.current) {
      E.current.v.textContent = str('tuning.amps', { n: number(0, 1) });
      E.current.sub.textContent = str('tuning.watts', { n: number(0) });
    }
    E.rpm.v.textContent = str('tuning.rpm_value', { n: number(0) });
    /* At rest: a full tank, or a charged pack's 4.2 V a cell. */
    E.pack.v.textContent = E.pack.v.dataset.glow
      ? str('tuning.percent', { n: number(100) })
      : str('tuning.volts_value', { n: number(4.2 * T.cells, 2) });
    E.pack.sub.textContent = '';
    return;
  }
  E.thrust.v.textContent = str('tuning.newtons', { n: number(r.thrustN, 1) });
  E.thrust.sub.textContent = str('tuning.grams_force', { n: number(Math.round((r.thrustN / 9.80665) * 1000)) });
  if (E.current) {
    E.current.v.textContent = str('tuning.amps', { n: number(r.currentA, 1) });
    E.current.sub.textContent = str('tuning.watts', { n: number(Math.round(r.currentA * r.volts)) });
  }
  E.rpm.v.textContent = str('tuning.rpm_value', { n: number(Math.round(r.rpm / 10) * 10) });
  if (r.power.tankM3 > 0) {
    E.pack.v.textContent = str('tuning.percent', { n: number(r.power.fuelFrac * 100) });
  } else {
    E.pack.v.textContent = str('tuning.volts_value', { n: number(r.volts, 2) });
    E.pack.sub.textContent = str('tuning.percent', { n: number(r.power.soc * 100) });
  }
}

/* The bench, once a frame: the live run in real time, or a slice of the
 * run down. */
function standFrame(h, now) {
  if (!T.stand) {
    return;
  }
  if (T.standOn) {
    seatStand(h);
    const ms = Math.min(STAND_FRAME_MS, Math.max(0, now - T.lastMs));
    T.lastMs = now;
    T.stand.setThrottle(T.throttle);
    T.stand.steps(Math.round(ms));
    T.reading = T.stand.reading();
    paintReading();
    return;
  }
  if (T.runDown) {
    const r = T.stand.endurance(T.runDown.throttle, T.runDown.cells, RUN_DOWN_STEPS);
    if (r) {
      T.endurance = { ...r, throttle: T.runDown.throttle };
      T.runDown = null;
      h.changed('stand-measure', 'select');
    } else if (T.els && T.els.endurance) {
      T.els.endurance.textContent = str('tuning.measuring', { n: number(T.stand.t / 60, 1) });
    }
  }
}

/* What the shell's audio plays while the bench runs: the prop's rpm in
 * the motor's voice, or null. */
export function standSound() {
  if (!T.standOn || !T.reading) {
    return null;
  }
  return { rpm: T.reading.rpm, voice: T.voice };
}

/* ---- THE TAB ---- */

function paint(h) {
  const box = el('div', 'hangar-tab tn');
  injectStyle();
  if (!tuningFor(T.id)) {
    return box;
  }
  box.append(sectionNav(h));
  if (T.section === 'balance') {
    balancePage(h, box);
  } else if (T.section === 'rates') {
    ratesPage(h, box);
  } else {
    standPage(h, box);
  }
  return box;
}

/* The numbers the renderer draws the tab with (src/render/
 * hangar-tuning3d.js): the CG and its gauge on Balance, the surfaces
 * sweeping on Rates, the prop on the Stand. */
function frame(h, now) {
  if (h.tab !== 'tuning' || !tuningFor(T.id)) {
    if (T.standOn || T.runDown) {
      stopStand();
    }
    return null;
  }
  T.voice = standVoice(h);
  standFrame(h, now);
  const t = tuningFor(T.id);
  const s = setup(h);
  const b = balance(T.id, T.entry, s.massKg, s.packKg);
  const out = { section: T.section, cg: null, surfaces: null, rpm: T.reading && T.standOn ? T.reading.rpm : 0, flaps: 0 };
  if (T.section === 'balance') {
    const range = t.cg.range && t.cg.mm != null
      ? [(t.cg.mm - t.cg.range[0]) / 1000, (t.cg.mm - t.cg.range[1]) / 1000]
      : null;
    out.cg = { shift: b.shift, reach: reachOf(h), range, warn: balanceWarning(t, b) !== '' };
  } else if (T.section === 'rates') {
    const th = throwsFor(T.id, T.entry.rate).map((d) => (d * Math.PI) / 180);
    const phase = ((now - T.sweepT0) / 1000 / SWEEP_S) % 1;
    const x = Math.sin(phase * 2 * Math.PI);
    const e = T.entry.expo;
    const trim = (T.entry.trimDeg * Math.PI) / 180;
    const da = curve(x, e.a) * th[0];
    const de = Math.max(-th[1], Math.min(th[1], curve(x, e.e) * th[1] + trim));
    const dr = -curve(x, e.r) * th[2];
    if (t.elevons) {
      out.surfaces = [de - da, de + da, 0, 0];
    } else {
      out.surfaces = [-da, da, de, dr];
    }
    if (t.flaps) {
      out.flaps = t.flaps.angles[T.entry.flapStart];
    }
  }
  return out;
}

registerHangarTab({
  id: 'tuning',
  focus: () => FOCUS[T.section],
  open(h, settings) {
    T.h = h;
    T.id = h.id;
    T.settings = settings;
    const stored = (settings && settings.tuning && settings.tuning[h.id]) || null;
    T.saved = normalizeEntry(h.id, stored, tuningFor(h.id) ? setupFor(h.id, h.choice).limits : { packMm: 0, ballastG: 0 });
    T.entry = fullEntry(h.id, T.saved);
    T.section = 'balance';
    T.throttle = 0.5;
    T.endurance = null;
    T.standKey = '';
    T.sweepT0 = performance.now();
    stopStand();
  },
  paint,
  dirty() {
    if (!tuningFor(T.id)) {
      return false;
    }
    return JSON.stringify(normalised(T.h, T.entry)) !== JSON.stringify(T.saved);
  },
  reset() {
    if (tuningFor(T.id)) {
      T.entry = fullEntry(T.id, null);
      T.endurance = null;
      stopStand();
    }
  },
  save(h) {
    if (!tuningFor(T.id)) {
      return null;
    }
    const entry = normalised(h, T.entry);
    const map = { ...((T.settings && T.settings.tuning) || {}) };
    if (entry) {
      map[T.id] = entry;
    } else {
      delete map[T.id];
    }
    return { tuning: map };
  },
  frame,
  close() {
    stopStand();
    T.els = null;
  },
});

/* The tab's own look, beside the hangar's in index.html: kept here so the
 * tab is one file. */
let styled = false;
function injectStyle() {
  if (styled || typeof document === 'undefined') {
    return;
  }
  styled = true;
  const css = el('style');
  css.textContent = `
    .tn-nav { margin-bottom: 4px; }
    .tn-seg { display: flex; gap: 4px; padding: 3px; border-radius: 999px; background: rgba(0, 0, 0, 0.32); border: 1px solid rgba(243, 234, 212, 0.1); }
    .tn-seg-btn {
      appearance: none; flex: 1; padding: 8px 10px; border: 0; border-radius: 999px; cursor: pointer;
      background: transparent; color: var(--cream); font: 700 13px/1 var(--ui-font); white-space: nowrap;
      transition: background 160ms, color 160ms, transform 220ms var(--hg-spring);
    }
    .tn-seg-btn:hover, .tn-seg-btn:focus-visible { background: rgba(243, 234, 212, 0.1); }
    .tn-seg-btn.on { background: var(--cream); color: var(--deep); box-shadow: 0 2px 12px rgba(243, 234, 212, 0.2); }
    .tn-seg-btn:disabled { opacity: 0.45; cursor: default; }
    .tn-cg { display: flex; flex-direction: column; gap: 4px; }
    .tn-cg-value { font: 800 34px/1 var(--ui-font); color: var(--amber); font-variant-numeric: tabular-nums; }
    .tn-cg-datum { font: 600 13px/1.3 var(--ui-font); color: var(--slate); }
    .tn-gauge { margin: 14px 0 4px; }
    .tn-gauge-track {
      position: relative; height: 12px; border-radius: 6px; background: rgba(243, 234, 212, 0.08);
      box-shadow: inset 0 0 0 1px rgba(243, 234, 212, 0.12);
    }
    .tn-gauge-band { position: absolute; top: 0; bottom: 0; border-radius: 6px; background: rgba(125, 255, 180, 0.28); box-shadow: inset 0 0 0 1px rgba(125, 255, 180, 0.55); }
    .tn-gauge-kit { position: absolute; top: -4px; bottom: -4px; width: 2px; margin-left: -1px; background: var(--cream); opacity: 0.7; }
    .tn-gauge-now {
      position: absolute; top: 50%; width: 18px; height: 18px; margin: -9px 0 0 -9px; border-radius: 50%;
      background: conic-gradient(#141c16 0 90deg, var(--amber) 90deg 180deg, #141c16 180deg 270deg, var(--amber) 270deg);
      box-shadow: 0 0 0 2px var(--amber), 0 2px 10px rgba(0, 0, 0, 0.6);
      transition: left 420ms var(--hg-spring);
    }
    .tn-gauge-ends { display: flex; justify-content: space-between; margin-top: 6px; font: 700 10px/1 var(--ui-font); letter-spacing: 0.14em; text-transform: uppercase; color: var(--slate); }
    .tn-range { margin: 8px 0 0; font: 600 12px/1.3 var(--ui-font); color: var(--slate); }
    .tn-stats { margin-top: 14px; }
    .tn-stat-warn { border-color: rgba(255, 120, 90, 0.6); }
    .tn-stat-warn .hangar-stat-value { color: #ff8a6a; }
    .tn-idle .hangar-stat-value { opacity: 0.35; }
    .tn-stat-sub { min-height: 12px; font: 700 12px/1 var(--ui-font); color: var(--slate); font-variant-numeric: tabular-nums; }
    .tn-warn {
      margin: 12px 0 0; padding: 10px 12px; border-radius: 10px; font: 600 13px/1.4 var(--ui-font);
      color: #ffd0c2; background: rgba(255, 110, 80, 0.12); border: 1px solid rgba(255, 120, 90, 0.4);
    }
    .tn-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; }
    .tn-row-label { font: 600 14px/1.2 var(--ui-font); }
    .tn-stepper { display: flex; align-items: center; gap: 6px; }
    .tn-step {
      appearance: none; width: 34px; height: 34px; border-radius: 10px; cursor: pointer; padding: 0;
      border: 1px solid rgba(243, 234, 212, 0.18); background: rgba(243, 234, 212, 0.05); color: var(--cream);
      font: 700 18px/1 var(--ui-font); transition: transform 220ms var(--hg-spring), background 160ms, border-color 160ms;
    }
    .tn-step:hover, .tn-step:focus-visible { transform: translateY(-1px); border-color: rgba(243, 234, 212, 0.55); background: rgba(243, 234, 212, 0.1); }
    .tn-step:disabled { opacity: 0.3; cursor: default; transform: none; }
    .tn-value { min-width: 128px; text-align: center; font: 700 14px/1.2 var(--ui-font); color: var(--amber); font-variant-numeric: tabular-nums; }
    .tn-surfaces { margin-top: 12px; }
    .tn-plot { display: grid; grid-template-columns: 118px minmax(0, 1fr); gap: 14px; align-items: center; }
    .tn-curve { width: 118px; height: 118px; border-radius: 12px; background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(243, 234, 212, 0.1); }
    .tn-curve-grid { fill: none; stroke: rgba(243, 234, 212, 0.14); stroke-width: 0.012; }
    .tn-curve-line { fill: none; stroke-width: 0.05; stroke-linecap: round; stroke-linejoin: round; }
    .tn-curve-a { stroke: var(--amber); }
    .tn-curve-e { stroke: var(--mint); }
    .tn-curve-r { stroke: #8fc3ff; }
    .tn-legend { display: flex; flex-direction: column; gap: 8px; }
    .tn-surface { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding-left: 12px; position: relative; }
    .tn-surface::before { content: ""; position: absolute; left: 0; top: 50%; width: 6px; height: 6px; margin-top: -3px; border-radius: 50%; }
    .tn-surface-a::before { background: var(--amber); }
    .tn-surface-e::before { background: var(--mint); }
    .tn-surface-r::before { background: #8fc3ff; }
    .tn-surface-name { font: 600 13px/1.2 var(--ui-font); }
    .tn-surface-throw { font: 800 17px/1 var(--ui-font); color: var(--cream); font-variant-numeric: tabular-nums; }
    .tn-caption { margin: 6px 0 0; font: 700 10px/1 var(--ui-font); letter-spacing: 0.14em; text-transform: uppercase; color: var(--slate); }
    .tn-sub { display: block; margin: 10px 0 6px; font: 600 13px/1.2 var(--ui-font); color: var(--slate); }
    .tn-flat { margin-top: 0; }
    .tn-run {
      appearance: none; width: 100%; margin-top: 14px; padding: 13px 16px; border-radius: 12px; cursor: pointer;
      border: 1px solid rgba(255, 212, 92, 0.6); background: linear-gradient(180deg, rgba(255, 212, 92, 0.22), rgba(255, 180, 60, 0.12));
      color: var(--amber); font: 800 15px/1 var(--ui-font); letter-spacing: 0.06em; text-transform: uppercase;
      transition: transform 220ms var(--hg-spring), background 160ms;
    }
    .tn-run:hover, .tn-run:focus-visible { transform: translateY(-2px); }
    .tn-run.on { border-color: rgba(255, 120, 90, 0.7); background: rgba(255, 110, 80, 0.16); color: #ffb09a; animation: tn-pulse 1.1s ease-in-out infinite; }
    .tn-run:disabled { opacity: 0.4; cursor: default; }
    @keyframes tn-pulse { 50% { box-shadow: 0 0 0 5px rgba(255, 120, 90, 0.14), 0 0 22px rgba(255, 120, 90, 0.3); } }
    .tn-endurance { display: flex; align-items: center; gap: 14px; }
    .tn-measure { flex: none; padding: 10px 16px; background: rgba(243, 234, 212, 0.08); }
    .tn-endurance-value { font: 800 20px/1.1 var(--ui-font); color: var(--amber); font-variant-numeric: tabular-nums; }
  `;
  document.head.append(css);
}

/* For the checks: the tab's state, read only. */
export function tuningState() {
  return {
    id: T.id, section: T.section, entry: T.entry, standOn: T.standOn, throttle: T.throttle,
    reading: T.reading, endurance: T.endurance, runDown: Boolean(T.runDown),
  };
}
