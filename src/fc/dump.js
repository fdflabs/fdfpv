/*
 * dump.js: Betaflight CLI text in and out, and composeConfig, the single
 * place a tune, the pilot's PID adjustment and the pilot's rates become
 * the text the module boots on.
 *
 * The shell writes no CLI of its own. Boot and the Tune row both call
 * composeConfig, so they cannot drift apart. Several helpers here
 * (setCliValue, exportCli, featureEnabled, the use-dump policy) have no
 * caller in the shell any more; scripts/fc-trace.js drives them against
 * the compiled module, and those traces are the evidence that a line
 * written here lands in Betaflight.
 *
 * Text conventions every function shares: lines split on \n with one
 * trailing \r dropped, a line is matched on its trimmed form, and text
 * this module builds ends in exactly one newline.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { normaliseRates, ratesDiff } from '../../configs/rates.js';

export const RATES_KEEP = 'keep-mine';
export const RATES_DUMP = 'use-dump';

/*
 * localStorage key for the Flight controller screen's saved dump, kept out
 * of the settings blob because it is tens of kilobytes and settings are
 * rewritten on every control change. What is stored is tuneBody(dump), so
 * a saved dump never carries rates past the Rates screen.
 */
export const FC_DUMP_KEY = 'fdfpv.fc.v1';

/*
 * localStorage key for the airframe that dump was saved on, so a dump from
 * one aircraft is not offered on another. Missing means the dump predates
 * a second aircraft.
 */
export const FC_DUMP_AIRFRAME_KEY = 'fdfpv.fc.airframe.v1';

/*
 * Both keys were named webfpv.* before the project took its own name.
 * moveRenamedDumpKeys carries a pilot's saved dump across: it copies an old
 * key's value to the new key unless the new one already holds something
 * (then the old value is the stale one), and deletes the old key only
 * after that, so a refused write leaves it to try again next load. Running
 * it again changes nothing. src/share/move.js carries fdfpv.* keys between
 * origins as it did webfpv.* ones.
 */
const RENAMED_KEYS = [
  ['webfpv.fc.v1', FC_DUMP_KEY],
  ['webfpv.fc.airframe.v1', FC_DUMP_AIRFRAME_KEY],
];

export function moveRenamedDumpKeys(storage) {
  for (const [old, now] of RENAMED_KEYS) {
    const value = storage.getItem(old);
    if (value === null) continue;
    if (storage.getItem(now) === null) storage.setItem(now, value);
    storage.removeItem(old);
  }
}

// On load, because the shell reads FC_DUMP_KEY straight from storage. A
// browser that refuses storage (a private window, blocked site data) has
// nothing saved to move, and the shell's own reads already treat it as
// empty, so there is nothing to do with that error but let the page boot.
if (typeof localStorage !== 'undefined') {
  try {
    moveRenamedDumpKeys(localStorage);
  } catch {
    /* storage unavailable: nothing to move */
  }
}

/*
 * Keys that belong to the pilot rather than the tune. composeConfig strips
 * them from every tune and appends the pilot's own, so switching tune can
 * never change stick authority and two tunes stay comparable. fc-trace F7
 * and F8 hold it to that.
 */
export const RATE_KEYS = new Set([
  'rates_type',
  'roll_rc_rate',
  'pitch_rc_rate',
  'yaw_rc_rate',
  'roll_expo',
  'pitch_expo',
  'yaw_expo',
  'roll_srate',
  'pitch_srate',
  'yaw_srate',
  'roll_rate_limit',
  'pitch_rate_limit',
  'yaw_rate_limit',
  'quickrates_rc_expo',
  'thr_mid',
  'thr_expo',
  'throttle_limit_type',
  'throttle_limit_percent',
]);

const APPLY = 'simplified_tuning apply';
const WEIGHT_KEYS = ['rpm_filter_weights_1', 'rpm_filter_weights_2', 'rpm_filter_weights_3'];

const dropCR = (line) => line.replace(/\r$/, '');
const rawLines = (text) => (text ?? '').split('\n');
const lines = (text) => rawLines(text).map(dropCR);

// The key of a `set` line, or null. Betaflight's CLI ends a key at a
// space or `=`, so `set key=value` and `set key = value` name the same key.
function keyOfSet(line) {
  const m = /^set ([^ =]+)/.exec(line.trim());
  return m ? m[1] : null;
}

const isRateLine = (line) => RATE_KEYS.has(keyOfSet(line)) || line.trim().startsWith('rateprofile ');

function withoutTrailingBlanks(list) {
  let end = list.length;
  while (end > 0 && list[end - 1] === '') end -= 1;
  return list.slice(0, end);
}

// Lines back to text ending in one newline, however many blank lines the
// list ended on.
const closed = (list) => `${list.join('\n').replace(/\n+$/, '')}\n`;

// Lines back to text, adding a final newline only to non-empty text.
function terminated(list) {
  const text = list.join('\n');
  return text && !text.endsWith('\n') ? `${text}\n` : text;
}

/*
 * The `set` assignments and the other commands in a dump, in order.
 * A set needs a key, an `=` and a non-empty value, and its value is the
 * first word after the `=`. A command is recorded as its first two words.
 * Blank lines and # comments are skipped.
 */
export function parseCli(text) {
  const sets = [];
  const commands = [];
  for (const raw of text.split('\n')) {
    const line = dropCR(raw).replace(/^[ \t]+/, '');
    if (!line || line.startsWith('#')) continue;
    if (!line.startsWith('set ')) {
      const [w0, rest = ''] = splitWord(line);
      commands.push({ w0, w1: splitWord(rest.trim())[0] });
      continue;
    }
    const key = keyOfSet(line);
    const eq = line.indexOf('=');
    const value = eq < 0 ? '' : splitWord(line.slice(eq + 1).trim())[0];
    if (key && value) sets.push({ key, value });
  }
  return { sets, commands };
}

// [first word, everything after it], split at the first whitespace.
function splitWord(s) {
  const at = s.search(/\s/);
  return at < 0 ? [s] : [s.slice(0, at), s.slice(at)];
}

// Last assignment wins; a key keeps the position of its first assignment.
export function cliMap(text) {
  return new Map(parseCli(text).sets.map(({ key, value }) => [key, value]));
}

export function cliGet(text, key) {
  return cliMap(text).get(key) ?? null;
}

export function dumpCarriesRates(text) {
  return parseCli(text).sets.some(({ key }) => RATE_KEYS.has(key));
}

// true or false from the last `feature NAME` / `feature -NAME` line, null
// when the text never mentions it.
export function featureEnabled(text, name) {
  const verdicts = { [`feature ${name}`]: true, [`feature -${name}`]: false };
  let on = null;
  for (const line of lines(text)) {
    const t = line.trim();
    if (Object.hasOwn(verdicts, t)) on = verdicts[t];
  }
  return on;
}

export function setFeatureLine(text, name, on) {
  const mine = new Set([`feature ${name}`, `feature -${name}`]);
  const kept = lines(text).filter((line) => !mine.has(line.trim()));
  return `${[...withoutTrailingBlanks(kept), on ? `feature ${name}` : `feature -${name}`].join('\n')}\n`;
}

// A tune without the pilot's keys: no rate assignments, no rateprofile.
export function tuneBody(text) {
  return terminated(lines(text).filter((line) => !isRateLine(line)));
}

/*
 * Exactly one `simplified_tuning apply`, as the last line. A dump read back
 * from the module carries the expert P/I/D the previous apply wrote; an
 * apply above them would be undone by them, and a slider would move and
 * change nothing.
 */
export function ensureSimplifiedApply(text) {
  const kept = rawLines(text).filter((raw) => dropCR(raw).trim() !== APPLY);
  return `${[...withoutTrailingBlanks(kept), APPLY].join('\n')}\n`;
}

const lastIndex = (list, test) => list.findLastIndex(test);

/*
 * Assign one key. An existing assignment (the last one) is rewritten in
 * place, otherwise the line is appended. A simplified_ key is followed by
 * an apply. Any other key written into text that has an apply goes after
 * the apply, or the apply would overwrite it.
 */
export function setCliValue(text, key, value) {
  const assignment = `set ${key} = ${value}`;
  const list = rawLines(text);
  const at = lastIndex(list, (raw) => keyOfSet(dropCR(raw)) === key);
  const edited = at >= 0
    ? list.map((raw, i) => (i === at ? assignment : raw))
    : [...withoutTrailingBlanks(list), assignment];
  const out = closed(edited);
  if (key.startsWith('simplified_')) return ensureSimplifiedApply(out);
  return afterApply(out, key);
}

function afterApply(text, key) {
  const list = rawLines(text);
  const isApply = (raw) => dropCR(raw).trim() === APPLY;
  const apply = lastIndex(list, isApply);
  const at = lastIndex(list, (raw) => keyOfSet(dropCR(raw)) === key);
  if (apply < 0 || at < 0 || at > apply) return text;
  const moved = list.filter((_, i) => i !== at);
  moved.splice(apply, 0, list[at]);
  return closed(moved);
}

/*
 * The dump as Betaflight's own CLI writes it: the module stores the RPM
 * filter weights as three keys, the CLI as one comma list, with a missing
 * weight written as 100.
 */
export function exportCli(text) {
  const map = cliMap(text);
  const kept = lines(text).filter((line) => !WEIGHT_KEYS.includes(keyOfSet(line)));
  if (!WEIGHT_KEYS.some((k) => map.has(k))) return closed(kept);
  const list = WEIGHT_KEYS.map((k) => map.get(k) ?? '100').join(',');
  return closed([...withoutTrailingBlanks(kept), `set rpm_filter_weights = ${list}`]);
}

/*
 * A dump's rate profile as the Rates screen holds it. The screen stores the
 * same uint8 fields as the firmware under the dump's own rates_type, so
 * every type reads straight across; normaliseRates fills and clamps the
 * rest. Reached from scripts/fc-trace.js, not from the shell.
 */
export function ratesFromDump(text) {
  const map = cliMap(text);
  const num = (key) => {
    const n = Number(map.get(key));
    return Number.isFinite(n) ? n : undefined;
  };
  const axis = (a) => ({ rcRate: num(`${a}_rc_rate`), srate: num(`${a}_srate`), expo: num(`${a}_expo`) });
  return normaliseRates({
    type: map.get('rates_type'),
    roll: axis('roll'),
    pitch: axis('pitch'),
    yaw: axis('yaw'),
    throttleCap: num('throttle_limit_percent'),
    thrMid: num('thr_mid'),
    thrExpo: num('thr_expo'),
  });
}

/*
 * The inverse of exportCli: a `set rpm_filter_weights = a,b,c` line (the
 * last, if several) becomes the three keys the module stores, each
 * replacing that key's first assignment or appended. An empty or missing
 * weight is 100. Text without the line is returned as given.
 */
export function expandRpmWeights(text) {
  let weights = null;
  const kept = [];
  for (const line of lines(text)) {
    if (keyOfSet(line) !== 'rpm_filter_weights') {
      kept.push(line);
      continue;
    }
    const eq = line.indexOf('=');
    weights = eq < 0 ? '' : line.slice(eq + 1).trim();
  }
  if (weights === null) return text ?? '';
  const given = weights.split(',').map((w) => w.trim());
  WEIGHT_KEYS.forEach((key, i) => {
    const assignment = `set ${key} = ${given[i] || '100'}`;
    const at = kept.findIndex((line) => keyOfSet(line) === key);
    if (at < 0) kept.push(assignment);
    else kept[at] = assignment;
  });
  return closed(kept);
}

/*
 * The text the module boots on: the tune without the pilot's keys, then
 * the PID block configs/pids.js chose for this tune, then the menu rates.
 * The PID block re-runs its apply over the tune's slider state, as moving
 * a slider in Configurator does, and the rates come last so they decide
 * their own keys. With no PID block the text is exactly what it was before
 * the PID screen existed, which keeps stored best-lap keys valid.
 *
 * RATES_DUMP, which only fc-trace F7 uses as the control for the keep-mine
 * traces, appends the tune's own rate lines after the menu's.
 */
export function composeConfig(tuneText, rates, policy = RATES_KEEP, pidsText = '') {
  const tune = expandRpmWeights(tuneText ?? '');
  const composed = tuneBody(tune) + (pidsText || '') + ratesDiff(rates);
  if (policy !== RATES_DUMP) return composed;
  const tuneRates = lines(tune).filter((line) => RATE_KEYS.has(keyOfSet(line)));
  return tuneRates.length ? `${composed}${tuneRates.join('\n')}\n` : composed;
}

/*
 * Module memory helpers. Every buffer is malloc'd in the module and freed
 * on the way out, success or not.
 */
function borrow(sim, size, what) {
  const ptr = sim.e.malloc(size);
  if (!ptr) throw new Error(`sim.wasm malloc failed for ${what} buffer`);
  return ptr;
}

function textAt(sim, ptr, length) {
  return length > 0 ? new TextDecoder().decode(new Uint8Array(sim.e.memory.buffer, ptr, length)) : '';
}

function requireExport(sim, name) {
  if (typeof sim.e[name] !== 'function') {
    throw new Error(`sim.wasm does not export ${name}; rebuild with npm run build:wasm`);
  }
}

/*
 * The module's live settings as CLI text. sim_bf_dump returns the length it
 * needed; when that does not fit, ask again with room for it and its NUL,
 * a few times at most.
 */
const DUMP_ATTEMPTS = 4;

export function moduleDump(sim, cap = 65536) {
  requireExport(sim, 'sim_bf_dump');
  let room = cap;
  for (let attempt = 0; attempt < DUMP_ATTEMPTS; attempt += 1) {
    const buf = borrow(sim, room, 'dump');
    let needed;
    try {
      needed = sim.e.sim_bf_dump(buf, room);
      if (needed < 0) throw new Error('sim_bf_dump failed');
      if (needed < room) return textAt(sim, buf, needed);
    } finally {
      sim.e.free(buf);
    }
    room = needed + 2;
  }
  throw new Error('sim_bf_dump did not fit');
}

// One key's current value as the module prints it, or null for a key it
// does not know. Values are short; the answer is cut at 63 bytes.
const GET_ROOM = 64;

export function moduleGet(sim, key) {
  requireExport(sim, 'sim_bf_get');
  const name = new TextEncoder().encode(`${key}\0`);
  const held = [];
  try {
    const namePtr = borrow(sim, name.length, 'get');
    held.push(namePtr);
    const out = borrow(sim, GET_ROOM, 'get');
    held.push(out);
    new Uint8Array(sim.e.memory.buffer, namePtr, name.length).set(name);
    const n = sim.e.sim_bf_get(namePtr, out, GET_ROOM);
    return n < 0 ? null : textAt(sim, out, Math.min(n, GET_ROOM - 1));
  } finally {
    for (const ptr of held) sim.e.free(ptr);
  }
}
