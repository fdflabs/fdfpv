/*
 * pids.js: the pilot's PID adjustment for each tune, owned here and
 * nowhere else.
 *
 * Two ways to adjust, both Configurator's: its tuning sliders, and its
 * expert table of gains. Neither is computed here. Sliders are written as
 * the firmware's `set simplified_*` keys and the CLI command
 * `simplified_tuning apply`, so Betaflight's own simplified_tuning.c,
 * compiled into the module, turns a master of 185 into gains. The expert
 * table is written as plain `set p_roll = ...` lines under
 * `simplified_pids_mode = OFF`, which is what Configurator's expert mode
 * writes.
 *
 * Adjustments are keyed by tune id, unlike rates: gains belong to the
 * tune, and one global override would make every tune fly the same.
 *
 * Storage is sparse. A slider is stored only while it differs from the
 * tune's own value; returning it removes it, and an entry that adjusts
 * nothing is removed, so "back where it was" and "stock" are the same
 * blob and compose to the same config text, which keeps best-lap keys
 * (a hash of that text) stable.
 *
 * Bounds are enforced here because the module's CLI shim does not enforce
 * valueTable ranges (it accepted 250 and flew it). Sliders are percent up
 * to SIMPLIFIED_TUNING_MAX, 200; the ones that scale a gain stop at 30,
 * since 0 is a quad with no controller, while 0 feedforward and 0 dynamic
 * damping are real setups. Expert gains use the 4.5.1 valueTable limits:
 * PID_GAIN_MAX 250, D_MIN_GAIN_MAX 250, F_GAIN_MAX 1000.
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

import { CUSTOM_TUNE, TUNES } from './registry.js';

// Ids an adjustment can be stored under, in the order normalisePids
// writes them: the shipped tunes, then the pilot's saved dump.
const TUNE_IDS = [...TUNES, CUSTOM_TUNE].map((tune) => tune.id);

const SLIDER_MAX = 200;
const GAIN_FLOOR = 30;

/*
 * Configurator's sliders, master first. Each row is
 * [menu key, CLI key, label, lowest value, note]; the menu shows them as
 * whole percent, one arrow press per percent.
 */
const SLIDER_ROWS = [
  ['master', 'simplified_master_multiplier', 'Master multiplier', GAIN_FLOOR,
    'Everything at once: P, I, D and feedforward all scale together, ratios kept. This is the "make it stiffer" knob, and the one the flight feel feedback asked for. Stock sits at 100; the stiff preset that used to ship here sat at 185, which is about the size of step that feedback was asking for.'],
  ['pi', 'simplified_pi_gain', 'Tracking, P and I', GAIN_FLOOR,
    'How hard the quad chases the rate the stick asks for. Low is lazy and smooth, high snaps onto the setpoint and holds it.'],
  ['i', 'simplified_i_gain', 'Drift and wobble, I', GAIN_FLOOR,
    'The slow-error term on its own. Too low drifts off attitude in wind-up moves; too high winds during a long throw and dumps it as a twitch when the stick centres. On this plant the twitch arrives well before the drift.'],
  ['d', 'simplified_d_gain', 'Damping, D', GAIN_FLOOR,
    'Resists rotation, smooths stops, calms propwash. On a real quad D is paid for in motor heat and gyro noise; this model’s gyro is clean, so damping is nearly free and the stiff tunes run it high.'],
  ['dmax', 'simplified_dmax_gain', 'Dynamic damping, D max', 0,
    'How much extra D arrives during fast moves and stops, on top of the base D. Zero holds D constant.'],
  ['ff', 'simplified_feedforward_gain', 'Stick response, FF', 0,
    'Feedforward pushes on stick movement itself, before any error exists. High is immediate; too high overshoots the start of every move. Zero flies on P and D alone.'],
  ['pitchPi', 'simplified_pitch_pi_gain', 'Pitch tracking', GAIN_FLOOR,
    'Pitch P and I relative to roll. A quad is longer than it is wide, so pitch usually carries a few percent more.'],
  ['pitchD', 'simplified_pitch_d_gain', 'Pitch damping', GAIN_FLOOR,
    'Pitch D relative to roll, for the same reason pitch tracking exists.'],
];

export const SLIDER_KEYS = SLIDER_ROWS.map(([key]) => key);

export const SLIDERS = Object.fromEntries(SLIDER_ROWS.map(([key, cli, label, cliMin, note]) => [key, {
  cli, label, cliMin, cliMax: SLIDER_MAX, scale: 1, decimals: 0, unit: '%', note,
}]));

export const PID_AXES = ['roll', 'pitch', 'yaw'];
export const PID_FIELDS = ['p', 'i', 'd', 'dmax', 'f'];

/*
 * The expert columns, Configurator's names and order. Since Betaflight 4.3
 * the column Configurator calls D is the CLI's d_min_<axis> and the one it
 * calls D max is d_<axis>; the display was renamed and the firmware was
 * not. CLI_STEM is the only place that mapping lives.
 */
const CLI_STEM = { p: 'p', i: 'i', d: 'd_min', dmax: 'd', f: 'f' };

const gainColumn = (label, cliMax, note) => ({
  label, cliMin: 0, cliMax, scale: 1, decimals: 0, unit: '', note,
});

export const PID_FIELD_SPECS = {
  p: gainColumn('P', 250,
    'Proportional: how hard the quad pushes toward the rate the stick asks for, right now. The stiffness knob.'),
  i: gainColumn('I', 250,
    'Integral: holds attitude against slow, persistent error. Too high winds during a held move and twitches when the stick centres.'),
  d: gainColumn('D', 250,
    'Damping. This is the CLI’s d_min: the D flown most of the time. Configurator apps call it D, the firmware calls it d_min, and both mean this number.'),
  dmax: gainColumn('D max', 250,
    'The ceiling D rises to during fast moves and stops. This is the CLI’s d_roll / d_pitch / d_yaw. Careful at the bottom: at or below D the firmware turns the D-to-D-max range off and flies THIS value constant (pid_init.c gates on d_min < D), so D max 0 is zero damping, not damping held at D.'),
  f: gainColumn('Feedforward', 1000,
    'Pushes on stick movement itself, before any error exists. The immediacy knob.'),
};

export function pidCliKey(field, axis) {
  return `${Object.hasOwn(CLI_STEM, field) ? CLI_STEM[field] : undefined}_${axis}`;
}

/*
 * Betaflight 4.5.1's factory gains (pgResetTemplate in flight/pid.c, and
 * what the compiled module reads back), in the expert table's columns.
 * The panel marks its bars with them and seeds the table from them when
 * the module has not been read.
 */
const frozenRow = (p, i, d, dmax, f) => Object.freeze({ p, i, d, dmax, f });

export const STOCK_PIDS = Object.freeze({
  roll: frozenRow(45, 80, 30, 40, 120),
  pitch: frozenRow(47, 84, 34, 46, 125),
  yaw: frozenRow(45, 80, 0, 0, 120),
});

const isRecord = (v) => Boolean(v) && typeof v === 'object';

/*
 * A stored or typed value onto a column, or null when there is no number.
 * null and '' are absent, not zero (Number(null) is 0, and a hand-edited
 * "master": null must be dropped, not flown at the floor).
 */
function onColumn(spec, value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(spec.cliMax, Math.max(spec.cliMin, n)) : null;
}

// A complete expert table from `source`, or null when any gain is missing.
function fullTable(source) {
  const table = {};
  for (const axis of PID_AXES) {
    const row = isRecord(source[axis]) ? source[axis] : {};
    table[axis] = {};
    for (const f of PID_FIELDS) {
      const gain = onColumn(PID_FIELD_SPECS[f], row[f]);
      if (gain === null) return null;
      table[axis][f] = gain;
    }
  }
  return table;
}

/*
 * A stored blob onto what the menu and firmware accept, as normaliseRates
 * does for rates: unknown tune ids, out of range or missing numbers are
 * dropped or clamped. An incomplete expert table is dropped (the entry
 * falls back to sliders rather than flying half a table), and an entry
 * that adjusts nothing is dropped, so stock has one representation.
 */
export function normalisePids(p) {
  const out = {};
  if (!isRecord(p)) return out;
  for (const id of TUNE_IDS) {
    const stored = p[id];
    if (!isRecord(stored)) continue;
    const given = isRecord(stored.sliders) ? stored.sliders : {};
    const sliders = {};
    for (const key of SLIDER_KEYS) {
      const v = onColumn(SLIDERS[key], given[key]);
      if (v !== null) sliders[key] = v;
    }
    const pids = isRecord(stored.pids) ? fullTable(stored.pids) : null;
    if (!pids && Object.keys(sliders).length === 0) continue;
    out[id] = { mode: stored.mode === 'expert' && pids ? 'expert' : 'sliders', sliders };
    if (pids) out[id].pids = pids;
  }
  return out;
}

// The stored entry for a tune, which the editing helpers below change in
// place; the settings loader has normalised it already.
export function pidsEntry(p, tuneId) {
  const entry = isRecord(p) ? p[tuneId] : null;
  return isRecord(entry) ? entry : null;
}

function entryFor(p, tuneId) {
  if (!pidsEntry(p, tuneId)) p[tuneId] = { mode: 'sliders', sliders: {} };
  return p[tuneId];
}

// Remove an entry that no longer changes anything, so undoing every edit
// is the same as never having made one.
function dropIfEmpty(p, tuneId) {
  const entry = pidsEntry(p, tuneId);
  if (!entry || entry.mode === 'expert' || entry.pids) return;
  if (Object.keys(entry.sliders).length === 0) delete p[tuneId];
}

/*
 * Move one slider. tuneValue is what the tune itself holds for it, read
 * from the running module; landing on it removes the override.
 */
export function setPidSlider(p, tuneId, key, value, tuneValue) {
  const v = onColumn(SLIDERS[key], value);
  if (v === null) return;
  const { sliders } = entryFor(p, tuneId);
  if (tuneValue !== null && tuneValue !== undefined && v === tuneValue) delete sliders[key];
  else sliders[key] = v;
  dropIfEmpty(p, tuneId);
}

/*
 * Switch the expert table on or off. The first switch on fills the table
 * from `seed` (the gains the module is flying, read by the caller), any
 * gap from STOCK_PIDS. Both the table and the slider overrides survive a
 * switch either way, inactive, so flipping back loses nothing.
 */
export function setPidsExpert(p, tuneId, on, seed) {
  const entry = entryFor(p, tuneId);
  entry.mode = on ? 'expert' : 'sliders';
  if (on && !entry.pids) {
    const source = seed || STOCK_PIDS;
    entry.pids = {};
    for (const axis of PID_AXES) {
      const row = source[axis] ? source[axis] : {};
      entry.pids[axis] = {};
      for (const f of PID_FIELDS) {
        entry.pids[axis][f] = onColumn(PID_FIELD_SPECS[f], row[f]) ?? STOCK_PIDS[axis][f];
      }
    }
  }
  dropIfEmpty(p, tuneId);
}

export function clearPidsFor(p, tuneId) {
  if (isRecord(p)) delete p[tuneId];
}

export function pidsAdjusted(p, tuneId) {
  return pidsDiffFor(p, tuneId) !== '';
}

function activeEntry(p, tuneId) {
  const all = normalisePids(p);
  return Object.hasOwn(all, tuneId) ? all[tuneId] : null;
}

const movedSliders = (entry) => SLIDER_KEYS.filter((key) => Object.hasOwn(entry.sliders, key));

/*
 * The adjustment as CLI text, which composeConfig puts after the tune and
 * before the rates. It is empty for an unadjusted tune, and that is a
 * contract: the composed text is then what it was before this module
 * existed, so stored best laps keep their keys.
 *
 * The slider block leaves simplified_pids_mode alone, so the tune's own
 * mode decides whether the sliders reach yaw, as in Configurator.
 */
export function pidsDiffFor(p, tuneId) {
  const entry = activeEntry(p, tuneId);
  if (!entry) return '';
  if (entry.mode === 'expert') {
    const gains = PID_AXES.flatMap((axis) => PID_FIELDS.map((f) => `set ${pidCliKey(f, axis)} = ${entry.pids[axis][f]}`));
    return ['', '# PIDs, set by hand on the PIDs screen. See configs/pids.js.', 'profile 0',
      'set simplified_pids_mode = OFF', ...gains, ''].join('\n');
  }
  const moved = movedSliders(entry);
  if (moved.length === 0) return '';
  const sets = moved.map((key) => `set ${SLIDERS[key].cli} = ${entry.sliders[key]}`);
  return ['', '# PID sliders, from the PIDs screen. See configs/pids.js.', 'profile 0',
    ...sets, 'simplified_tuning apply', ''].join('\n');
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// A short phrase for the Tune row: is this tune stock, and if not, how.
export function pidsSummary(p, tuneId) {
  const entry = activeEntry(p, tuneId);
  if (!entry) return 'Stock';
  if (entry.mode === 'expert') return 'Set by hand';
  const moved = movedSliders(entry);
  if (moved.length === 0) return 'Stock';
  if (!Object.hasOwn(entry.sliders, 'master')) return `${plural(moved.length, 'slider')} moved`;
  const others = moved.length - 1;
  const master = `Master ${entry.sliders.master}%`;
  return others === 0 ? master : `${master}, ${others} more ${others === 1 ? 'slider' : 'sliders'}`;
}
