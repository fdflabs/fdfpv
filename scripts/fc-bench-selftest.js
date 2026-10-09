/*
 * fc-bench-selftest.js: pin everything src/ui/fc.js exports, the flight
 * controller bench, so its implementation can be replaced without the shell
 * seeing a different screen. Plain Node, no browser. Run with
 * npm run fc-bench:selftest.
 *
 * The session is driven over tests/fixtures/fc-bench-dump.txt, the text
 * moduleDump returned from dist/sim.wasm booted on the default tune with
 * RATE_DEFAULTS, which is exactly what main.js opens the bench with. It is
 * a copy so that a WASM rebuild does not move the digest. Regenerate it
 * with --regen-dump, which boots dist/sim.wasm the same way and rewrites
 * the fixture; the digest then needs re-recording in the same commit.
 *
 * The contract is wider than the exports. ui.js, main.js and shell-check.js
 * read and assign session fields directly (snapshot, draft, runActive,
 * attitude, confirm, exitAfterSave, presetId, search, tab, page, walkAll,
 * onlyModified, motorDuty and the six injected callbacks), and the rows
 * items() returns are consumed by ui.js's generic row renderer by property
 * name. So every row is recorded with its keys sorted (property order is
 * invisible to the renderer), and every closure a row carries is called and
 * its effect on the draft, the session and the injected callbacks recorded,
 * since a closure's text says nothing about what it does. The DOM exports
 * run against small recording fakes rather than a DOM library.
 *
 * The digest was recorded from the code this file was written to hold
 * still; see scripts/lib/transcript.js for how to read a failure.
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

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as FC from '../src/ui/fc.js';
import { TABS } from '../src/fc/catalog.js';
import { cliMap } from '../src/fc/dump.js';
import { TUNES } from '../configs/registry.js';
import { transcript } from './lib/transcript.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DUMP_PATH = join(root, 'tests/fixtures/fc-bench-dump.txt');

if (process.argv.includes('--regen-dump')) {
  const { composeConfig, moduleDump, RATES_KEEP } = await import('../src/fc/dump.js');
  const { RATE_DEFAULTS } = await import('../configs/rates.js');
  const { loadSim, SIM_OK } = await import('../tests/lib/simmod.js');
  const sim = await loadSim(readFileSync(join(root, 'dist/sim.wasm')));
  const tune = readFileSync(join(root, 'configs/betaflight-default.diff'), 'utf8');
  const code = sim.init(composeConfig(tune, RATE_DEFAULTS, RATES_KEEP));
  if (code !== SIM_OK) throw new Error(`sim_init returned ${code}`);
  writeFileSync(DUMP_PATH, moduleDump(sim));
  console.log(`wrote ${DUMP_PATH}`);
  process.exit(0);
}

const DUMP = readFileSync(DUMP_PATH, 'utf8');
const t = transcript();

// Rows reach ui.js as plain objects read by name, so key order and closure
// source are not behaviour; closures are exercised separately below.
function norm(v) {
  if (typeof v === 'function') return 'fn';
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = norm(v[k]);
    return out;
  }
  return v;
}

// What the shell, main.js and shell-check.js read or assign from outside.
// Internal fields, such as a parse cache, are not part of the contract.
const PUBLIC_FIELDS = [
  'snapshot', 'draft', 'tab', 'page', 'runActive', 'walkAll', 'search', 'onlyModified', 'confirm', 'presetId',
  'motorDuty', 'attitude', 'exitAfterSave', 'getFlightMode', 'setFlightMode', 'getLaunchControl', 'setLaunchControl',
  'motorTestAllowed', 'onMotorTest',
];

const SCALARS = ['tab', 'page', 'walkAll', 'onlyModified', 'search', 'confirm', 'presetId', 'runActive', 'exitAfterSave'];

function makeSession() {
  const s = new FC.FcSession();
  const calls = [];
  const env = { mode: 'acro', launch: false, motors: false };
  s.getFlightMode = () => env.mode;
  s.setFlightMode = (on) => { calls.push(['setFlightMode', on]); env.mode = on ? 'angle' : 'acro'; };
  s.getLaunchControl = () => env.launch;
  s.setLaunchControl = (on) => { calls.push(['setLaunchControl', on]); env.launch = Boolean(on); };
  s.motorTestAllowed = () => env.motors;
  s.onMotorTest = (m, d) => { calls.push(['onMotorTest', m, d]); };
  return { s, calls, env };
}

function snap(s) {
  const o = { draft: s.draft, motorDuty: [...s.motorDuty] };
  for (const k of SCALARS) o[k] = s[k];
  return o;
}

function restore(s, o) {
  s.draft = o.draft;
  s.motorDuty = [...o.motorDuty];
  for (const k of SCALARS) s[k] = o[k];
}

function draftDelta(before, after) {
  const a = cliMap(before);
  const b = cliMap(after);
  const out = [];
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    if (a.get(k) !== b.get(k)) out.push([k, a.get(k) ?? null, b.get(k) ?? null]);
  }
  const fa = before.split('\n').filter((l) => l.startsWith('feature ')).sort().join('|');
  const fb = after.split('\n').filter((l) => l.startsWith('feature ')).sort().join('|');
  if (fa !== fb) out.push(['features', fa, fb]);
  return out;
}

// Calls fn against the session, records what moved, then puts it all back.
function effect(ctx, label, fn) {
  const { s, calls, env } = ctx;
  const before = snap(s);
  const envBefore = { ...env };
  calls.length = 0;
  let ret;
  try {
    ret = fn();
  } catch (err) {
    ret = `throws ${err?.message}`;
  }
  const after = snap(s);
  const moved = {};
  for (const k of SCALARS) if (before[k] !== after[k]) moved[k] = after[k];
  if (String(before.motorDuty) !== String(after.motorDuty)) moved.motorDuty = after.motorDuty;
  t.note(label, {
    ret: norm(ret), draft: draftDelta(before.draft, after.draft), moved, calls: [...calls],
  });
  restore(s, before);
  Object.assign(env, envBefore);
}

const TYPED = ['', '  ', 'abc', '12', ' 12.6 ', '-12.4', '99999', '-99999', '1e3', 'NaN', 'Infinity'];

function exerciseRows(ctx, where) {
  const rows = ctx.s.items();
  t.note(`${where} rows`, norm(rows));
  rows.forEach((row, i) => {
    const tag = `${where} [${i}] ${row.key ?? row.label}`;
    if (row.adjust) {
      effect(ctx, `${tag} adjust +1`, () => row.adjust(1));
      effect(ctx, `${tag} adjust -1`, () => row.adjust(-1));
    }
    if (row.flip) effect(ctx, `${tag} flip`, () => row.flip());
    if (row.pick && row.options) {
      for (const o of [row.options[0], row.options[1], row.options[row.options.length - 1]]) {
        if (o) effect(ctx, `${tag} pick ${o.value}`, () => row.pick(o.value));
      }
    }
    if (row.typed) t.note(`${tag} typed`, TYPED.map((x) => row.typed(x)));
    if (row.set) {
      effect(ctx, `${tag} set 7`, () => row.set(7));
      effect(ctx, `${tag} set "250"`, () => row.set('250'));
    }
    if (row.onText) {
      for (const v of ['gyro', '', null, undefined, 42]) effect(ctx, `${tag} onText ${String(v)}`, () => row.onText(v));
    }
  });
}

// Exports and the pure helper.
t.note('exports', Object.keys(FC).sort());
for (const [list, value, dir] of [
  [['a', 'b', 'c'], 'a', 1], [['a', 'b', 'c'], 'c', 1], [['a', 'b', 'c'], 'a', -1], [['a', 'b', 'c'], 'b', -1],
  [['a', 'b', 'c'], 'zz', 1], [['a', 'b', 'c'], 'zz', -1], [['a', 'b', 'c'], 'b', 2], [['a', 'b', 'c'], 'b', -2],
  [['x'], 'x', 1], [['x'], 'q', -1], [[1, 2, 3], 2, 1], [[true, false], false, 1],
]) {
  t.rec(`cycle ${JSON.stringify([list, value, dir])}`, () => FC.cycle(list, value, dir));
}

// A fresh session, before open: what ui.js constructs at boot.
{
  const s = new FC.FcSession();
  t.note('fresh fields', norm(Object.fromEntries(PUBLIC_FIELDS.map((k) => [k, s[k]]))));
  t.rec('fresh getFlightMode', () => s.getFlightMode());
  t.rec('fresh getLaunchControl', () => s.getLaunchControl());
  t.rec('fresh motorTestAllowed', () => s.motorTestAllowed());
  t.rec('fresh setFlightMode', () => s.setFlightMode(true));
  t.rec('fresh onMotorTest', () => s.onMotorTest(0, 1));
  t.rec('fresh dirty', () => s.dirty());
  t.rec('fresh items', () => norm(s.items()));
  t.rec('fresh exportText', () => s.exportText());
  t.rec('fresh cliValue', () => s.cliValue('p_roll'));
}

// open() and its defaults.
for (const [text, opts] of [
  [DUMP, undefined], [DUMP, {}], [DUMP, { tab: 'motors', page: 'filters', runActive: 1 }],
  [null, { runActive: 0 }], [undefined, { tab: '', page: '' }], ['set p_roll = 1\n', { tab: 'setup' }],
]) {
  const { s } = makeSession();
  s.confirm = 'leave';
  s.presetId = 'x';
  s.exitAfterSave = true;
  s.motorDuty = [1, 1, 1, 1];
  s.walkAll = true;
  s.search = 'q';
  s.onlyModified = true;
  if (opts === undefined) s.open(text); else s.open(text, opts);
  t.note(`open ${JSON.stringify([text === DUMP ? 'DUMP' : text, opts])}`, { ...snap(s), snapshot: s.snapshot === DUMP ? 'DUMP' : s.snapshot, draft: s.draft === DUMP ? 'DUMP' : s.draft });
}

const ctx = makeSession();
const { s } = ctx;
s.open(DUMP, { runActive: false });
t.rec('opened dirty', () => s.dirty());
t.rec('exportText', () => s.exportText());

// The parse cache must follow the draft text even when main.js assigns it.
s.draft = 'set p_roll = 99\n';
t.rec('external draft cliValue', () => s.cliValue('p_roll'));
s.draft = DUMP;
t.rec('restored draft cliValue', () => s.cliValue('p_roll'));
t.rec('cliValue missing', () => s.cliValue('not_a_key'));

// Every tab, every PID page, walkAll both ways, with a lookup and every
// injected switch state, closures exercised.
const SHOWN = TABS.filter((x) => x.id !== 'cli').map((x) => x.id);
for (const walk of [false, true]) {
  s.walkAll = walk;
  for (const id of [...SHOWN, 'cli', 'nonsense']) {
    s.setTab(id);
    const pages = id === 'pid' ? ['pid', 'filters', 'rates', 'bogus'] : [s.page];
    for (const page of pages) {
      s.page = page;
      const where = `walk=${walk} tab=${id} page=${page}`;
      t.rec(`${where} skippedOnTab`, () => s.skippedOnTab());
      t.rec(`${where} visibleFields`, () => s.visibleFields().map((f) => f.key));
      exerciseRows(ctx, where);
    }
  }
}
s.walkAll = false;
s.page = 'pid';

// setTab keeps or resets the page.
for (const [from, to] of [['rates', 'pid'], ['bogus', 'pid'], ['bogus', 'motors'], ['filters', 'setup'], ['filters', 'pid']]) {
  s.page = from;
  s.setTab(to);
  t.note(`setTab ${from} -> ${to}`, [s.tab, s.page]);
}
s.setTab('pid');
s.page = 'pid';

// Switch rows under every injected state.
for (const [mode, launch, motors] of [['angle', true, true], ['acro', false, true], ['angle', false, false]]) {
  Object.assign(ctx.env, { mode, launch, motors });
  for (const id of ['modes', 'motors']) {
    s.setTab(id);
    exerciseRows(ctx, `env ${mode}/${launch}/${motors} tab=${id}`);
  }
}
Object.assign(ctx.env, { mode: 'acro', launch: false, motors: false });

// The motor test path, with every callback call recorded.
for (const allowed of [false, true]) {
  ctx.env.motors = allowed;
  for (const [i, d] of [[0, 0.5], [3, 2], [1, -1], [-1, 0.25], [-1, 0], [-1, 1.5], [2, 0], [-1, -3]]) {
    effect(ctx, `allowed=${allowed} setMotorDuty ${i} ${d}`, () => s.setMotorDuty(i, d));
  }
  effect(ctx, `allowed=${allowed} stopMotors`, () => s.stopMotors());
}
{
  ctx.env.motors = true;
  ctx.calls.length = 0;
  s.setMotorDuty(1, 0.3);
  s.setMotorDuty(-1, 0.6);
  s.setMotorDuty(2, 0.1);
  t.note('motor sequence', { duty: [...s.motorDuty], calls: [...ctx.calls] });
  s.setTab('motors');
  t.note('motor rows mid-test', norm(s.items()));
  s.discard();
  t.note('discard stops motors', { duty: [...s.motorDuty], calls: [...ctx.calls] });
  ctx.env.motors = false;
}

// setValue and setFeature guards.
for (const [k, v] of [
  ['p_roll', '50'], ['p_roll', 'abc'], ['p_roll', ''], ['not_a_key', '1'], ['gyro_lpf1_dyn_min_hz', '0'],
  ['rates_type', 'ACTUAL'], ['rates_type', 'BETAFLIGHT'], ['dshot_bidir', 'ON'], ['simplified_master_multiplier', '120'],
  ['#notes', '1'], ['roll_srate', '70'], ['failsafe_procedure', 'DROP'],
]) {
  effect(ctx, `setValue ${k} ${JSON.stringify(v)}`, () => s.setValue(k, v));
}
s.presetId = 'kept';
effect(ctx, 'setValue clears presetId', () => s.setValue('p_roll', '51'));
effect(ctx, 'setValue on disabled keeps presetId', () => s.setValue('not_a_key', '1'));
for (const [n, on] of [['AIRMODE', false], ['AIRMODE', true], ['ANTI_GRAVITY', false], ['GPS', true], ['NOPE', true]]) {
  effect(ctx, `setFeature ${n} ${on}`, () => s.setFeature(n, on));
}
s.presetId = '';

// The low pass the firmware inits from the dynamic one.
for (const dyn of ['0', '250']) {
  s.draft = DUMP;
  s.setValue('gyro_lpf1_dyn_min_hz', dyn);
  s.setTab('pid');
  s.page = 'filters';
  t.rec(`dyn_min=${dyn} skippedOnTab`, () => s.skippedOnTab());
  t.rec(`dyn_min=${dyn} rows`, () => norm(s.items()));
}
s.draft = DUMP;
s.page = 'pid';

// Values the controls do not offer, and keys the dump does not carry: a
// lookup holding a value outside its table, a lookup and numbers missing.
s.draft = DUMP
  .replace('set iterm_relax_type = SETPOINT', 'set iterm_relax_type = JUNK')
  .replace('set iterm_relax = RP\n', '')
  .replace('set p_roll = 45\n', '')
  .replace('set iterm_relax_cutoff = 15', 'set iterm_relax_cutoff = ')
  .replace('set dterm_lpf1_type = PT1', 'set dterm_lpf1_type = ')
  .replace('set p_pitch = 47', 'set p_pitch = abc')
  .replace('set d_roll = 40', 'set d_roll = -Infinity');
for (const page of ['pid', 'filters']) {
  s.page = page;
  exerciseRows(ctx, `odd values page=${page}`);
}
s.draft = DUMP;
s.page = 'pid';

// Edits, the modified set, only-what-I-changed, and the save rows.
s.setValue('p_roll', '60');
s.setValue('gyro_lpf1_static_hz', '300');
s.setFeature('AIRMODE', false);
t.rec('edited dirty', () => s.dirty());
t.rec('modifiedKeys', () => s.modifiedKeys());
t.rec('edited exportText', () => s.exportText());
for (const runActive of [false, true]) {
  s.runActive = runActive;
  for (const only of [false, true]) {
    s.onlyModified = only;
    for (const [id, page] of [['pid', 'pid'], ['pid', 'filters'], ['configuration', 'pid'], ['motors', 'pid']]) {
      s.setTab(id);
      s.page = page;
      t.rec(`edited run=${runActive} only=${only} ${id}/${page} visibleFields`, () => s.visibleFields().map((f) => f.key));
      t.rec(`edited run=${runActive} only=${only} ${id}/${page} items`, () => norm(s.items()));
    }
  }
}
s.onlyModified = true;
s.discard();
t.rec('only on with nothing changed', () => norm(s.items()));
s.onlyModified = false;
s.runActive = false;

// Confirmation pages.
for (const confirm of ['save-run', 'leave', 'other']) {
  for (const runActive of [false, true]) {
    s.confirm = confirm;
    s.runActive = runActive;
    t.rec(`confirm=${confirm} run=${runActive}`, () => norm(s.items()));
  }
}
s.confirm = null;
s.runActive = false;

// Search across every tab.
for (const q of ['', '   ', 'gyro', 'GYRO', ' d_min ', 'd_min', 'failsafe_procedure', '_', 'p', 'zzzz_not_a_key', '#', 'rates_type', 'roll']) {
  t.rec(`searchHits ${JSON.stringify(q)}`, () => {
    const r = s.searchHits(q);
    return { total: r.total, hits: r.hits.map((f) => f.key) };
  });
}
t.rec('searchHits null', () => s.searchHits(null));
for (const q of ['', 'gyro', 'd_min', '_', 'zzzz_not_a_key', 'rates_type', 'simplified']) {
  s.search = q;
  s.setTab('modes');
  t.rec(`search ${JSON.stringify(q)} visibleFields`, () => s.visibleFields().map((f) => f.key));
  exerciseRows(ctx, `search ${JSON.stringify(q)}`);
}
s.search = 'gyro';
s.walkAll = true;
t.rec('search walkAll', () => norm(s.items()));
s.walkAll = false;
s.search = null;

// Rates back to Betaflight's own default profile.
s.setValue('rates_type', 'BETAFLIGHT');
s.setValue('roll_rc_rate', '150');
s.setValue('yaw_expo', '40');
s.presetId = 'x';
effect(ctx, 'resetRatesToDefault', () => s.resetRatesToDefault());
s.discard();

// Presets, through a fetch that reads the registry's files.
const realFetch = globalThis.fetch;
let refuseFetch = false;
globalThis.fetch = async (path) => {
  const u = String(path);
  if (refuseFetch) return { ok: false, status: 404, text: async () => '' };
  return { ok: true, status: 200, text: async () => readFileSync(fileURLToPath(u), 'utf8') };
};
for (const tune of TUNES) {
  s.discard();
  s.setValue('roll_srate', '77');
  s.setTab('motors');
  s.page = 'filters';
  await s.applyPreset(tune.id);
  t.note(`applyPreset ${tune.id}`, { draft: s.draft, presetId: s.presetId, tab: s.tab, page: s.page, dirty: s.dirty() });
}
s.setTab('presets');
exerciseRows(ctx, 'after preset tab=presets');
{
  const before = snap(s);
  let thrown = null;
  refuseFetch = true;
  try {
    await s.applyPreset(TUNES[0].id);
  } catch (err) {
    thrown = err.message;
  }
  t.note('applyPreset not ok', { thrown, unchanged: JSON.stringify(snap(s)) === JSON.stringify(before) });
}
globalThis.fetch = realFetch;
s.discard();

// The DOM exports, against recording fakes.
const log = [];
function fakeElement(tag) {
  const el = {
    tag,
    dataset: {},
    children: [],
    hidden: false,
    type: '',
    className: '',
    textContent: '',
    listeners: {},
    classes: new Set(),
    classList: {
      toggle(name, on) {
        log.push(['toggle', el.dataset.id ?? el.tag, name, on]);
        if (on) el.classes.add(name); else el.classes.delete(name);
      },
    },
    addEventListener(type, fn) { el.listeners[type] = fn; },
    append(child) { el.children.push(child); },
    appendChild(child) {
      log.push(['appendChild', child.tag]);
      child.parent = el;
      el.children.push(child);
    },
    click() { log.push(['click', el.tag, el.href, el.download]); },
    remove() {
      log.push(['remove', el.tag]);
      if (el.parent) el.parent.children = el.parent.children.filter((c) => c !== el);
    },
  };
  let text = '';
  Object.defineProperty(el, 'textContent', {
    get: () => text,
    set: (v) => { text = v; if (v === '') el.children = []; },
  });
  return el;
}
function view(el) {
  return {
    hidden: el.hidden,
    ready: el.dataset.ready,
    kids: el.children.map((c) => [c.tag, c.type, c.className, c.dataset.id, c.textContent, [...c.classes].sort().join(' '), Object.keys(c.listeners)]),
  };
}
globalThis.document = {
  createElement: (tag) => fakeElement(tag),
  body: fakeElement('body'),
};

{
  const nav = fakeElement('nav');
  nav.textContent = 'stale';
  const picked = [];
  const pick = (id) => picked.push(id);
  for (const tab of ['pid', 'setup', 'osd', 'cli', 'presets']) {
    s.tab = tab;
    log.length = 0;
    FC.paintTabStrip(nav, s, pick);
    t.note(`paintTabStrip ${tab}`, { view: view(nav), log: [...log] });
  }
  nav.children[3].listeners.click();
  nav.children[0].listeners.click();
  t.note('paintTabStrip clicks', picked);
}
{
  t.rec('paintPageStrip null', () => FC.paintPageStrip(null, s, () => {}));
  const nav = fakeElement('nav');
  const picked = [];
  for (const [tab, page, confirm] of [
    ['setup', 'pid', null], ['pid', 'filters', 'leave'], ['pid', 'filters', null], ['pid', 'rates', null], ['pid', 'bogus', null], ['motors', 'pid', null],
  ]) {
    s.tab = tab;
    s.page = page;
    s.confirm = confirm;
    log.length = 0;
    FC.paintPageStrip(nav, s, (id) => picked.push(id));
    t.note(`paintPageStrip ${tab}/${page}/${confirm}`, { view: view(nav), log: [...log] });
  }
  for (const c of nav.children) c.listeners.click();
  t.note('paintPageStrip clicks', picked);
  s.tab = 'pid';
  s.page = 'pid';
  s.confirm = null;
}

/*
 * A canvas that records what was painted rather than which calls painted it:
 * every fill as its colour and its four corners in canvas pixels, every
 * stroke as its colour, width and segments in canvas pixels. Two drawings
 * that put the same paint in the same places in the same order record the
 * same, however their calls are grouped. Coordinates are rounded to 1e-9 px
 * so a different but equivalent sum cannot move the digest.
 */
function fakeCanvas(w, h, noCtx = false) {
  const ops = [];
  let m = [1, 0, 0, 1, 0, 0];
  const stack = [];
  let path = [];
  let pen = null;
  const r = (v) => Math.round(v * 1e9) / 1e9 + 0;
  const at = (x, y) => [r(m[0] * x + m[2] * y + m[4]), r(m[1] * x + m[3] * y + m[5])];
  const ctx2d = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    save() { stack.push({ m: [...m], fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth }); },
    restore() {
      const top = stack.pop();
      if (!top) return;
      m = top.m;
      this.fillStyle = top.fillStyle;
      this.strokeStyle = top.strokeStyle;
      this.lineWidth = top.lineWidth;
    },
    translate(x, y) { m = [m[0], m[1], m[2], m[3], m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; },
    rotate(a) {
      const c = Math.cos(a);
      const s = Math.sin(a);
      m = [m[0] * c + m[2] * s, m[1] * c + m[3] * s, m[2] * c - m[0] * s, m[3] * c - m[1] * s, m[4], m[5]];
    },
    fillRect(x, y, rw, rh) {
      ops.push(['fill', this.fillStyle, at(x, y), at(x + rw, y), at(x + rw, y + rh), at(x, y + rh)]);
    },
    beginPath() { path = []; pen = null; },
    moveTo(x, y) { pen = at(x, y); },
    lineTo(x, y) {
      const p = at(x, y);
      if (pen) path.push([pen, p]);
      pen = p;
    },
    stroke() { ops.push(['stroke', this.strokeStyle, this.lineWidth, ...path]); },
  };
  const strict = new Proxy(ctx2d, {
    get(obj, k) {
      if (!(k in obj)) throw new Error(`fake canvas has no ${String(k)}`);
      return typeof obj[k] === 'function' ? obj[k].bind(obj) : obj[k];
    },
    set(obj, k, v) {
      if (!(k in obj)) throw new Error(`fake canvas has no ${String(k)}`);
      obj[k] = v;
      return true;
    },
  });
  const canvas = {
    width: w,
    height: h,
    getContext: (kind) => {
      ops.push(['getContext', kind]);
      return noCtx ? null : strict;
    },
  };
  return { canvas, ops };
}
t.rec('drawAttitude null', () => FC.drawAttitude(null, { w: 1, x: 0, y: 0, z: 0 }));
for (const [w, h] of [[7, 100], [100, 7], [8, 8]]) {
  const { canvas, ops } = fakeCanvas(w, h);
  FC.drawAttitude(canvas, { w: 1, x: 0, y: 0, z: 0 });
  t.note(`drawAttitude ${w}x${h}`, ops);
}
{
  const { canvas, ops } = fakeCanvas(200, 120, true);
  FC.drawAttitude(canvas, { w: 1, x: 0, y: 0, z: 0 });
  t.note('drawAttitude no context', ops);
}
const r2 = Math.SQRT1_2;
for (const q of [
  { w: 1, x: 0, y: 0, z: 0 },
  { w: r2, x: r2, y: 0, z: 0 },
  { w: r2, x: 0, y: r2, z: 0 },
  { w: r2, x: 0, y: -r2, z: 0 },
  { w: r2, x: 0, y: 0, z: r2 },
  { w: 0.9, x: 0.1, y: 0.3, z: -0.2 },
  { w: 0.5, x: 0.5, y: 0.5, z: 0.5 },
  { w: 0.5, x: -0.5, y: 0.5, z: -0.5 },
  { w: 0, x: 0, y: 1, z: 0 },
  { w: 0.6, x: 0, y: 0.8, z: 0 },
  { w: -1, x: 0, y: 0, z: 0 },
  { w: 0.71, x: 0.01, y: 0.71, z: 0.02 },
]) {
  const { canvas, ops } = fakeCanvas(240, 135);
  FC.drawAttitude(canvas, q);
  t.note(`drawAttitude ${JSON.stringify(q)}`, ops);
}

{
  const realBlob = globalThis.Blob;
  const realURL = globalThis.URL;
  globalThis.Blob = class {
    constructor(parts, opts) { this.parts = parts; this.opts = opts; log.push(['Blob', parts, opts]); }
  };
  let n = 0;
  globalThis.URL = {
    createObjectURL: (b) => { n += 1; log.push(['createObjectURL', b.parts]); return `blob:${n}`; },
    revokeObjectURL: (u) => log.push(['revokeObjectURL', u]),
  };
  for (const [name, text] of [['flight-controller.diff', 'set p_roll = 1\n'], ['', 'x'], [undefined, ''], ['a.txt', s.exportText()]]) {
    log.length = 0;
    FC.downloadCli(name, text);
    t.note(`downloadCli ${JSON.stringify(name)}`, { log: [...log], bodyKids: document.body.children.length });
  }
  globalThis.Blob = realBlob;
  globalThis.URL = realURL;
}

t.finish('src/ui/fc.js', 'a76846eace4db1d1153b0e23a027d7571ea3f8c36ebf6b2ac75107b5b4005335');
