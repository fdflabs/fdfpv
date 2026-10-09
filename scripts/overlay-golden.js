/*
 * overlay-golden.js: the flight overlay, the results screens, calibration
 * and pad pick, held to a record taken from the Ui methods as they stood
 * inside src/ui/ui.js before they moved to src/ui/overlay.js and
 * src/ui/results.js.
 *
 *     node scripts/overlay-golden.js            compare
 *     node scripts/overlay-golden.js --record   write tests/fixtures/overlay-golden.json
 *
 * Every method is called through Ui.prototype on a stand-in Ui, so the
 * same script reads the old class body and the moved modules alike. The
 * stand-in document logs every write a node takes (text, class, style,
 * hidden, disabled, value), and the per-frame methods (setOsd, setBanner,
 * setTargetLock) are called twice with the same values so the record
 * holds the fact that a frame with nothing new writes nothing. Storage,
 * timers and the calls out to the rest of the Ui (show, renderMenu,
 * writeSettings and so on) are logged too. Recorded in English and Spanish.
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

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const FILE = join(root, 'tests', 'fixtures', 'overlay-golden.json');
const RECORD = process.argv.includes('--record');

/* One log for the whole scenario, in call order, so the record shows what
 * was written and in which order relative to the calls out of the Ui. */
let log = [];
const note = (...entry) => log.push(entry.join(' '));

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); note('storage.set', k); },
  removeItem: (k) => { store.delete(k); note('storage.remove', k); },
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
  clear: () => store.clear(),
};

/* The board's stats call, answered here so nothing leaves the machine. */
globalThis.fetch = async (url) => {
  note('fetch', String(url).replace(/^https?:\/\/[^/]+/, ''));
  return { ok: true, json: async () => ({ allTime: { flightS: 4321 } }) };
};
const settle = () => new Promise((r) => setImmediate(r));

const timers = [];
globalThis.setTimeout = (fn, ms) => { timers.push(fn); note('setTimeout', ms); return timers.length; };
globalThis.clearTimeout = (id) => note('clearTimeout', id);

let nodeIds = 0;
const PROPS = ['hidden', 'disabled', 'value', 'tabIndex', 'type', 'min', 'max', 'step'];
class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.id = ++nodeIds;
    this._className = '';
    this.childNodes = [];
    this.attrs = [];
    this.dataset = {};
    this.writes = [];
    this.listeners = {};
    this.box = { top: 0, bottom: 0 };
    this.offsetHeight = 0;
    this.offsetParent = null;
    const styles = {};
    const self = this;
    this.styles = styles;
    this.style = new Proxy(styles, {
      set(t, k, v) { t[k] = v; self.writes.push(`style.${String(k)}`); return true; },
    });
    const cls = () => this._className.split(/\s+/).filter(Boolean);
    this.classList = {
      add: (...c) => { this.className = [...new Set([...cls(), ...c])].join(' '); },
      remove: (...c) => { this.className = cls().filter((x) => !c.includes(x)).join(' '); },
      toggle: (c, on) => {
        const want = on === undefined ? !cls().includes(c) : Boolean(on);
        if (want) this.classList.add(c); else this.classList.remove(c);
        return want;
      },
      contains: (c) => cls().includes(c),
    };
  }
  get className() { return this._className; }
  set className(v) { this._className = String(v); this.writes.push('className'); }
  get offsetWidth() { this.writes.push('read.offsetWidth'); return 100; }
  getBoundingClientRect() { return { ...this.box }; }
  append(...nodes) { this.childNodes.push(...nodes.map((n) => (n instanceof FakeElement ? n : String(n)))); this.writes.push('append'); }
  setAttribute(k, v) { this.attrs.push([k, String(v)]); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  fire(type, event = {}) {
    const e = { stopPropagation: () => note('stopPropagation', type), preventDefault: () => note('preventDefault', type), ...event };
    for (const fn of this.listeners[type] || []) fn(e);
  }
  blur() { note('blur', this._className || this.tagName); if (globalThis.document.activeElement === this) globalThis.document.activeElement = null; }
  set textContent(t) { this.childNodes = t === '' ? [] : [String(t)]; this.writes.push('textContent'); }
  get textContent() { return this.childNodes.map((c) => (typeof c === 'string' ? c : c.textContent)).join(''); }
}
for (const p of PROPS) {
  Object.defineProperty(FakeElement.prototype, p, {
    get() { return this[`_${p}`]; },
    set(v) { this[`_${p}`] = v; this.writes.push(p); },
  });
}
globalThis.document = { createElement: (tag) => new FakeElement(tag), activeElement: null };

function tree(node) {
  if (node == null) return node;
  if (typeof node === 'string') return node;
  const out = { tag: node.tagName };
  if (node._className) out.cls = node._className;
  if (Object.keys(node.styles).length) out.style = { ...node.styles };
  for (const p of PROPS) if (node[`_${p}`] !== undefined) out[p] = node[`_${p}`];
  /* Which properties were written, not how often: the per-frame guards
   * are pinned by a repeat call writing nothing at all, and a one-shot
   * screen may write a field twice on the way to its final state. */
  if (node.writes.length) out.writes = [...new Set(node.writes)].sort();
  if (node.childNodes.length) out.children = node.childNodes.map(tree);
  return out;
}
/* Write logs are per step: read them, then clear them, so a second
 * identical call shows up as no writes at all. */
function take(node) {
  const touched = (n) => n instanceof FakeElement && (n.writes.length > 0 || n.childNodes.some(touched));
  /* A node nothing wrote to since the last step is as the last step left
   * it, and saying so keeps the record readable. */
  if (node instanceof FakeElement && !touched(node)) return 'unchanged';
  const t = tree(node);
  const clear = (n) => { if (n instanceof FakeElement) { n.writes = []; n.childNodes.forEach(clear); } };
  clear(node);
  return t;
}

const { Ui } = await import('../src/ui/ui.js');
const { el, makeGimbal, makeWeightSlider } = await import('../src/ui/widgets.js');
const { DEFAULTS, SETTINGS_KEY, WEIGHT_MIN, WEIGHT_MAX, WEIGHT_STEP, WEIGHT_STOCK } = await import('../src/ui/settings.js');
const { writeShareImport, writeEditKey, writeBind } = await import('../src/share/session.js');
const { MAPS } = await import('../src/maps/registry.js');
const { useLocale } = await import('../src/strings/index.js');

const FREESTYLE_MAP = MAPS.find((m) => m.mode === 'freestyle').id;
const RACE_MAP = MAPS.find((m) => m.mode !== 'freestyle').id;

const SPIES = ['show', 'renderMenu', 'renderHowto', 'maybeOfferFeel', 'writeSettings', 'onSettings'];
const FIELDS = [
  'calCanSave', 'calCanSkip', 'calCanReverse', 'calCanZeroThrottle', 'calMoving', 'calOnConfirm', 'padPickPhase',
  'padPickReason', 'roomResults', 'freestyleRun', 'runPosted', 'timePosted', 'resultsFastest', 'lastBestMs', 'osdMode',
  'stickModeDrawn', 'airHintDone', 'bannerText', 'padInfo', 'gpuInfo', 'everyoneFlightS', 'everyoneFlightAsked',
];

/* A Ui with no constructor run: the handles the range writes, built the
 * way build() builds them, and spies for everything outside the range. */
function stubUi() {
  const ui = Object.create(Ui.prototype);
  for (const name of SPIES) ui[name] = (...args) => note(`call.${name}`, JSON.stringify(args.length ? args[0] : null));
  /* onSettings is handed the whole profile; its weight is the range's part. */
  ui.onSettings = (s) => note('call.onSettings', JSON.stringify({ weight: s.weight, same: s === ui.settings }));
  ui.settings = { ...DEFAULTS, map: RACE_MAP, stickMode: 2, weight: WEIGHT_STOCK, freestyleScoring: 'scored' };
  ui.screen = 'flight';
  ui.share = null;
  ui.scoreHud = {
    setCalloutsOnly: (on) => note('score.setCalloutsOnly', on),
    setVisible: (on) => note('score.setVisible', on),
    update: (v) => note('score.update', JSON.stringify(v)),
    events: (l) => note('score.events', JSON.stringify(l)),
    reset: () => note('score.reset'),
  };
  for (const k of ['brandSub', 'titleBest', 'osdBest', 'resultsBody', 'resultsNote', 'resultsKicker', 'resultsHead',
    'resultsHeroCap', 'resultsHeroTime', 'resultsHeroMeta', 'announcer', 'osdTopBlock',
    'osdClockLabel', 'osdTimer', 'osdGate', 'osdPack', 'osdLast', 'osdGhost', 'osdPackBar', 'osdSpeed', 'osdFlight',
    'osdFlaps', 'osdGear', 'osdLaunch', 'osdAlt', 'osdThrBar', 'osdHits', 'osdSticks',
    'calPrompt', 'calKicker', 'calHint', 'calList', 'calAxes', 'calSaveBtn', 'calSkipBtn', 'calZeroBtn', 'calRevBtn',
    'calModeBtn', 'padPrompt', 'padKicker', 'padHint', 'padCards', 'padYesBtn', 'padNoBtn', 'padSkipBtn']) {
    ui[k] = el('div', k);
  }
  ui.screens = { results: el('div', 'screen') };
  const holder = el('div', 'holder');
  holder.box = { top: 20, bottom: 700 };
  ui.banner = el('div', 'banner');
  ui.banner.offsetParent = holder;
  ui.osdTopBlock.offsetHeight = 64;
  ui.osdTopBlock.box = { top: 30, bottom: 94.6 };
  ui.osdStickLeft = makeGimbal('L');
  ui.osdStickRight = makeGimbal('R');
  ui.calStickLeft = makeGimbal('L');
  ui.calStickRight = makeGimbal('R');
  ui.howtoStickLeft = makeGimbal('L');
  ui.howtoStickRight = makeGimbal('R');
  ui.howtoKeys = el('div', 'howto');
  ui.calAxisCells = [];
  ui.padCardNodes = new Map();
  ui.airHintDone = false;
  ui.airHintTimer = 0;
  ui.timePosted = null;
  ui.freestyleRun = null;
  ui.runPosted = null;
  ui.padInfo = { count: 0, using: 'Keyboard' };
  ui.gpuInfo = null;
  ui.stickProbe = null;
  return ui;
}

/* What storage holds, cut down to what the range writes: the settings
 * profile is everybody's (its defaults move with other work), so only the
 * two fields the range sets are kept, and a seat's import stamp is a clock. */
function storedValue(key, raw) {
  let v;
  try { v = JSON.parse(raw); } catch (e) { return raw; }
  if (key === SETTINGS_KEY) return { weight: v.weight, stickMode: v.stickMode };
  if (v && typeof v === 'object') delete v.importedUtc;
  return v;
}

function fields(ui) {
  const out = {};
  for (const k of FIELDS) if (ui[k] !== undefined) out[k] = ui[k];
  return JSON.parse(JSON.stringify(out));
}

/* Runs one scenario on a fresh Ui and fresh storage and returns its steps:
 * after each named step, the nodes it lists, the log since the last step
 * and the fields other code reads. */
async function scenario(build) {
  store.clear();
  timers.length = 0;
  globalThis.document.activeElement = null;
  log = [];
  const ui = stubUi();
  const steps = [];
  const step = (name, nodes) => {
    const snap = { name, nodes: {}, log, fields: fields(ui) };
    for (const [k, n] of Object.entries(nodes)) snap.nodes[k] = take(n);
    snap.storage = Object.fromEntries([...store.entries()].sort().map(([k, v]) => [k, storedValue(k, v)]));
    steps.push(snap);
    log = [];
  };
  await build(ui, step);
  return steps;
}

const call = (ui, name, ...args) => {
  try {
    return { ret: JSON.parse(JSON.stringify(Ui.prototype[name].apply(ui, args) ?? null)) };
  } catch (e) {
    return { threw: e.message };
  }
};

async function snapshot() {
  const out = {};

  out.best = await scenario((ui, step) => {
    const n = () => ({ brandSub: ui.brandSub, titleBest: ui.titleBest, osdBest: ui.osdBest });
    call(ui, 'setBest', 61234, 'race'); step('record', n());
    call(ui, 'setBest', null); step('no record', n());
    call(ui, 'refreshBest'); step('refresh', n());
    call(ui, 'setBest', undefined); step('unbuilt race seat', n());
    ui.settings.map = FREESTYLE_MAP;
    call(ui, 'setBest', undefined); step('unbuilt freestyle seat', n());
    call(ui, 'setBest', 5000, 'freestyle'); step('freestyle scored', n());
    ui.settings.freestyleScoring = 'free'; ui.screen = 'paused';
    call(ui, 'refreshBest'); step('freestyle free paused', n());
    ui.settings.freestyleScoring = 'off';
    call(ui, 'refreshBest'); step('freestyle off', n());
    ui.settings.map = 'track';
    call(ui, 'setBest', 4000, 'race'); step('track seat', n());
    const bare = stubUi();
    bare.titleBest = null;
    out.bestNoTitle = call(bare, 'refreshBest');
  });

  const resultNodes = (ui) => ({
    screen: ui.screens.results, kicker: ui.resultsKicker, head: ui.resultsHead, cap: ui.resultsHeroCap,
    time: ui.resultsHeroTime, meta: ui.resultsHeroMeta, body: ui.resultsBody, note: ui.resultsNote,
  });
  out.results = await scenario((ui, step) => {
    call(ui, 'showResults', [], null, null); step('empty', resultNodes(ui));
    call(ui, 'showResults', [{ n: 1, ms: 42000 }], 42000, null); step('first lap, first record', resultNodes(ui));
    call(ui, 'showResults', [{ n: 1, ms: 42000 }, { n: 2, ms: null, reason: 'Missed\nGATE 3' }, { n: 3, ms: 39000 }], 39000, 41000, 'Beat the ghost by 0.4 s');
    step('record beaten, void lap, ghost note', resultNodes(ui));
    call(ui, 'showResults', [{ n: 1, ms: 41000 }, { n: 2, ms: 43000 }], 41000, 41000); step('matched', resultNodes(ui));
    call(ui, 'showResults', [{ n: 1, ms: 45500 }, { n: 2, ms: 44000 }, { n: 3, ms: 50000 }], 40000, 40000); step('off the record', resultNodes(ui));
    call(ui, 'showResults', [{ n: 1, ms: 30000, score: 120 }, { n: 2, ms: 31000, score: 80 }, { n: 3, ms: null }], 29000, 29000);
    step('scored plane laps', resultNodes(ui));
    call(ui, 'showResults', [{ n: 1, ms: null, reason: 'Cut' }], 30000, 30000); step('only a void lap', resultNodes(ui));
    call(ui, 'showResults', [{ n: 1, ms: 0 }], null, NaN); step('zero lap, NaN record', resultNodes(ui));
    call(ui, 'showResults', [{ n: 1, ms: 4000 }, { n: 2, ms: 60000 }], 4000, 5000); step('short lap floors its bar', resultNodes(ui));
  });
  const doc = (name) => ({ schemaVersion: 4, name, map: 'alps', elements: [] });
  out.resultsTrack = await scenario((ui, step) => {
    ui.settings.map = 'track';
    call(ui, 'showResults', [{ n: 1, ms: 50000 }], 50000, null); step('track, nothing seated', resultNodes(ui));
    ui.share = { id: 'abc', name: 'Valley', author: 'Rita' };
    call(ui, 'showResults', [{ n: 1, ms: 50000 }], 50000, null); step('share with author', resultNodes(ui));
    ui.share = { id: 'abc' };
    call(ui, 'showResults', [{ n: 1, ms: 50000 }], 50000, null); step('share without name', resultNodes(ui));
    ui.share = null;
    const local = writeShareImport({ id: 'loc1', name: 'Mine', document: doc('Mine'), local: true });
    call(ui, 'showResults', [{ n: 1, ms: 52000 }], 52000, null); step(`local seat ${local}`, resultNodes(ui));
    const comm = writeShareImport({ id: 'pub1', name: 'Public', document: doc('Public'), author: 'Ana' });
    call(ui, 'showResults', [{ n: 1, ms: 53000 }], 53000, 60000); step(`community seat ${comm}`, resultNodes(ui));
    writeEditKey('pub1', 'k');
    writeBind('pub1', { board: 'b', author: 'Ana', nameOnBoard: 'Public', layoutFingerprint: 'different' });
    call(ui, 'showResults', [{ n: 1, ms: 54000 }], 54000, 60000); step('owned with drift', resultNodes(ui));
  });

  out.room = await scenario((ui, step) => {
    ui.screen = 'flight';
    const v = { kicker: 'Room 7', head: 'You won', heroCap: 'Place', heroTime: '1st', heroMeta: 'of 3', win: true,
      rows: [{ label: 'You', time: '40.00', tag: 'winner', me: true }, { label: 'Bo', time: '41.00' }, { label: 'Cy', time: 'out', out: true }] };
    ui.roomResults = false;
    call(ui, 'showRoomResults', v); step('first', resultNodes(ui));
    ui.screen = 'results';
    call(ui, 'showRoomResults', { ...v, win: false, head: 'Second', rows: [] }); step('again on results', resultNodes(ui));
  });

  out.freestyle = await scenario((ui, step) => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ name: `Trick ${i}`, count: (i % 3) + 1, points: i === 9 ? 30 : 1200 - i * 100 }));
    call(ui, 'showFreestyleResults', { tricks: 0, unique: 0, total: 0, bestCombo: 0, bonus: 0, crashes: 0, rows: [] });
    step('nothing landed', resultNodes(ui));
    call(ui, 'showFreestyleResults', { timed: false, tricks: 0, unique: 0, total: 0, bestCombo: 0, bonus: 0, crashes: 2, rows: [] });
    step('free flight, nothing landed', resultNodes(ui));
    const clean = { tricks: 14, unique: 12, total: 9876, bestCombo: 1500, bonus: 300, crashes: 0, rows };
    call(ui, 'showFreestyleResults', clean); step('clean, twelve kinds', resultNodes(ui));
    call(ui, 'showFreestyleResults', { ...clean, crashes: 1, bestCombo: 0, bonus: 0, rows: rows.slice(0, 11) }); step('one crash, eleven kinds', resultNodes(ui));
    call(ui, 'showFreestyleResults', { ...clean, timed: false, crashes: 3, rows: [{ name: 'Flip', count: 1, points: 0 }] }); step('zero point row', resultNodes(ui));
    call(ui, 'markRunPosted', null); step('posted off results', {});
    ui.screen = 'results';
    call(ui, 'markRunPosted', { ok: false, why: 'x' }); step('posted on results', {});
    call(ui, 'resetScore'); step('reset', {});
  });

  out.score = await scenario((ui, step) => {
    ui.osdMode = 'freestyle';
    for (const [screen, scoring] of [['flight', 'scored'], ['paused', 'free'], ['title', 'scored'], ['flight', 'off']]) {
      ui.screen = screen; ui.settings.freestyleScoring = scoring;
      call(ui, 'syncScoreVisible'); step(`${screen} ${scoring}`, {});
    }
    ui.osdMode = 'race'; ui.screen = 'flight';
    call(ui, 'syncScoreVisible'); step('race', {});
    call(ui, 'setScore', { total: 5 }); call(ui, 'scoreEvents', [{ name: 'Flip' }]); step('view and events', {});
    const bare = stubUi();
    bare.scoreHud = null;
    out.scoreNoHud = call(bare, 'syncScoreVisible');
  });

  out.banner = await scenario((ui, step) => {
    const n = () => ({ banner: ui.banner, announcer: ui.announcer });
    call(ui, 'setBanner', ''); step('empty', n());
    call(ui, 'setBanner', 'Throttle up to take off'); step('text', n());
    call(ui, 'setBanner', 'Throttle up to take off'); step('same again', n());
    call(ui, 'setBanner', 'Big box', true); step('panelled', n());
    call(ui, 'setBanner', 'Wreck', 'edge'); step('edge', n());
    ui.osdTopBlock.box = { top: 30, bottom: 140.2 };
    call(ui, 'setBanner', 'Wreck', 'edge'); step('block grew', n());
    call(ui, 'setBanner', null); step('cleared', n());
    ui.osdTopBlock.offsetHeight = 0;
    call(ui, 'setBanner', 'Hidden block'); step('block hidden', n());
    call(ui, 'announce', 7); call(ui, 'announce', '7'); call(ui, 'announce', null); step('announce', n());
    ui.announcer = null;
    out.announceNoNode = call(ui, 'announce', 'x');
  });

  out.lock = await scenario((ui, step) => {
    out.lockBeforeBuild = call(ui, 'setTargetLock', { show: true, x: 1, y: 1, size: 10, angle: 0, edge: false, wrong: false, distance: 5, fade: 1 });
    const node = Ui.prototype.buildTargetLock.call(ui);
    const n = () => ({ lock: node });
    step('built', n());
    const base = { show: true, x: 100.04, y: 200.06, size: 80.4, angle: 12.34, edge: false, wrong: false, distance: 24.6, fade: 1 };
    call(ui, 'setTargetLock', base); step('in frame', n());
    call(ui, 'setTargetLock', base); step('same again', n());
    call(ui, 'setTargetLock', { ...base, x: 100.01, distance: 24.7 }); step('sub rounding move', n());
    call(ui, 'setTargetLock', { ...base, edge: true, wrong: true, angle: -45.06, fade: 0.5 }); step('edge, wrong, faded', n());
    call(ui, 'setTargetLock', { ...base, fade: 0.996, size: 30 }); step('back in frame', n());
    call(ui, 'setTargetLock', { show: false }); step('off', n());
    call(ui, 'setTargetLock', { show: false }); step('off again', n());
  });

  const osdNodes = (ui) => Object.fromEntries(['osdClockLabel', 'osdTimer', 'osdGate', 'osdPack', 'osdLast', 'osdGhost',
    'osdPackBar', 'osdSpeed', 'osdFlight', 'osdFlaps', 'osdGear', 'osdLaunch', 'osdAlt', 'osdThrBar', 'osdHits']
    .map((k) => [k, ui[k]]));
  const frame = {
    mode: 'race', lapMs: null, lastLapMs: null, gate: 1, gateCount: 8, gateCue: '', volts: 16.84, packFrac: 0.99994,
    altitude: 2.345, speedKph: 41.6, throttle: 0.5, flightMode: 'acro', bounces: 0, launchState: 0, launchPitch: 0,
    ghostGapMs: null, ghostFinal: false,
  };
  out.osd = await scenario((ui, step) => {
    const frames = [
      ['race, before the first gate', frame],
      ['same frame again', frame],
      ['tiny pack move', { ...frame, packFrac: 0.99996 }],
      ['racing', { ...frame, lapMs: 12345, lastLapMs: 40000, gate: 3, gateCue: 'left', ghostGapMs: -420, flightMode: 'angle', bounces: 1 }],
      ['behind ghost, final', { ...frame, lapMs: 22000, gate: 8, ghostGapMs: 1234, ghostFinal: true, flightMode: 'stab', bounces: 3, throttle: 1.4 }],
      ['ghost gap zero', { ...frame, lapMs: 1, ghostGapMs: 0, flightMode: 'manual', packFrac: -0.2 }],
      ['turtle', { ...frame, flightMode: 'turtle', launchState: 1 }],
      ['launch armed', { ...frame, launchState: 1, launchPitch: 2 }],
      ['launch hot', { ...frame, launchState: 2, launchPitch: 14.6 }],
      ['launch go', { ...frame, launchState: 3 }],
      ['plane flaps gear', { ...frame, flaps: 1, gear: 'up' }],
      ['plane flaps full gear down', { ...frame, flaps: 2, gear: 'down' }],
      ['plane gear moving', { ...frame, flaps: 0, gear: 'moving' }],
      ['freestyle scoring off', { ...frame, mode: 'freestyle', runScored: false, lapMs: 65000, lastLapMs: 3000, ghostGapMs: 10 }],
      ['freestyle scoring off, waiting', { ...frame, mode: 'freestyle', runScored: false, lapMs: NaN }],
      ['freestyle free flight', { ...frame, mode: 'freestyle', runTimed: false }],
      ['freestyle ready', { ...frame, mode: 'freestyle', runState: 'ready', runRemainMs: 120000 }],
      ['freestyle flying', { ...frame, mode: 'freestyle', runState: 'flying', runRemainMs: 65400 }],
      ['freestyle last ten', { ...frame, mode: 'freestyle', runState: 'flying', runRemainMs: 10000 }],
      ['freestyle over', { ...frame, mode: 'freestyle', runState: 'over', runRemainMs: undefined }],
      ['bounces back to zero', { ...frame, bounces: 0 }],
    ];
    for (const [name, f] of frames) {
      call(ui, 'setOsd', f);
      step(name, osdNodes(ui));
    }
    for (const k of ['osdGhost', 'osdFlight', 'osdFlaps', 'osdGear', 'osdLaunch', 'osdHits']) ui[k] = null;
    call(ui, 'setOsd', { ...frame, lapMs: 5000, ghostGapMs: 100, flaps: 1, gear: 'up', launchState: 2, bounces: 2 });
    step('optional readouts absent', osdNodes(ui));
  });

  out.sticks = await scenario((ui, step) => {
    const n = () => ({ left: ui.osdStickLeft.box, right: ui.osdStickRight.box });
    call(ui, 'setStickOverlay', { show: false, roll: 0, pitch: 0, yaw: 0, throttle: 0 }); step('hidden', n());
    call(ui, 'setStickOverlay', { show: true, roll: 0.5, pitch: -0.25, yaw: 1, throttle: 0.75 }); step('shown', n());
    ui.settings.stickMode = 1;
    call(ui, 'setStickOverlay', { show: true, roll: 0.5, pitch: -0.25, yaw: 1, throttle: 0.75 }); step('mode 1', n());
    ui.osdSticks = null;
    call(ui, 'setStickOverlay', { show: false }); step('no block', n());
  });

  out.air = await scenario((ui, step) => {
    out.airNoSlider = [call(ui, 'bindAirSlider'), call(ui, 'setAirSlider', true), call(ui, 'dismissAirHint'), call(ui, 'paintAir')];
    ui.osdAir = makeWeightSlider({ min: WEIGHT_MIN, max: WEIGHT_MAX, step: WEIGHT_STEP, value: WEIGHT_STOCK, label: 'Weight' });
    const a = ui.osdAir;
    const n = () => ({ box: a.box, sticks: ui.osdSticks });
    const parts = () => ({ hint: a.hint, cap: a.cap, range: a.range });
    take(a.box);
    call(ui, 'bindAirSlider'); step('bound', { ...n(), ...parts() });
    out.airListeners = Object.fromEntries([a.range, a.dismiss].map((x, i) => [i ? 'dismiss' : 'range', Object.fromEntries(Object.entries(x.listeners).map(([k, v]) => [k, v.length]))]));
    call(ui, 'setAirSlider', false); step('hidden', n());
    call(ui, 'setAirSlider', true, false); step('shown, on the ground', { ...n(), ...parts() });
    call(ui, 'setAirSlider', true, true); step('shown, flying', { ...n(), ...parts() });
    call(ui, 'setAirSlider', true, true); step('shown again', { ...n(), ...parts() });
    a.range.value = String(WEIGHT_STOCK + WEIGHT_STEP);
    a.range.fire('input'); step('dragged off stock', parts());
    a.range.fire('input'); step('same value again', parts());
    a.range.value = String(WEIGHT_STOCK + WEIGHT_STEP / 2 + 0.1);
    a.range.fire('input'); step('between steps', parts());
    a.range.value = '9999';
    a.range.fire('input'); step('past the end', parts());
    globalThis.document.activeElement = a.range;
    a.range.fire('pointerup'); step('released with focus', parts());
    a.range.fire('pointercancel'); a.range.fire('change'); step('released without focus', parts());
    a.range.fire('click'); step('click', parts());
    a.range.fire('pointerdown'); step('touched', { ...n(), ...parts() });
    timers.forEach((fn) => fn()); step('timer fires after', parts());
    a.dismiss.fire('click'); step('dismiss after done', parts());
    ui.settings.weight = WEIGHT_STOCK;
    call(ui, 'paintAir'); step('painted at stock', parts());
  });
  out.airTimer = await scenario((ui, step) => {
    ui.osdAir = makeWeightSlider({ min: WEIGHT_MIN, max: WEIGHT_MAX, step: WEIGHT_STEP, value: WEIGHT_STOCK, label: 'Weight' });
    const a = ui.osdAir;
    call(ui, 'setAirSlider', true); step('shown', { hint: a.hint });
    timers.forEach((fn) => fn()); step('ten seconds later', { hint: a.hint });
    a.hint.hidden = true; ui.airHintDone = false;
    call(ui, 'setAirSlider', true); step('seen already', { hint: a.hint });
  });
  out.airDismiss = await scenario((ui, step) => {
    ui.osdAir = makeWeightSlider({ min: WEIGHT_MIN, max: WEIGHT_MAX, step: WEIGHT_STEP, value: WEIGHT_STOCK, label: 'Weight' });
    const a = ui.osdAir;
    call(ui, 'bindAirSlider');
    call(ui, 'setAirSlider', true); step('shown', { hint: a.hint });
    a.dismiss.fire('click'); step('got it', { hint: a.hint });
    ui.onSettings = null;
    a.range.value = String(WEIGHT_MIN);
    a.range.fire('input'); step('no onSettings', { cap: a.cap });
  });

  const calNodes = (ui) => ({
    kicker: ui.calKicker, prompt: ui.calPrompt, hint: ui.calHint, list: ui.calList, axes: ui.calAxes, save: ui.calSaveBtn,
    skip: ui.calSkipBtn, zero: ui.calZeroBtn, rev: ui.calRevBtn, mode: ui.calModeBtn,
    left: ui.calStickLeft.nub, right: ui.calStickRight.nub,
  });
  out.cal = await scenario((ui, step) => {
    call(ui, 'setCalibration', null); step('closed', calNodes(ui));
    const axes = [{ i: 0, v: 0.02, rest: 0, mapped: true }, { i: 1, v: -0.8, lo: -0.9, hi: 0.3, rest: 0 }, { i: 2, v: 1.4, lo: -2, hi: 3 }, { i: 3, v: 0.18, rest: 0 }];
    call(ui, 'setCalibration', { stepIndex: 0, stepCount: 8, step: 'center', title: 'Centre', prompt: 'Let go', hint: 'Hands off', axes });
    step('centre', calNodes(ui));
    call(ui, 'setCalibration', { stepIndex: 0, stepCount: 8, step: 'center', title: 'Centre', prompt: 'Let go', hint: 'Hands off', axes });
    step('centre again', calNodes(ui));
    call(ui, 'setCalibration', {
      stepIndex: 3, stepCount: 8, step: 'roll', title: 'Roll', prompt: 'Roll right', hint: 'Right stick', canSave: false,
      canSkip: true, canZeroThrottle: true, canReverse: true, moving: 'roll', reverse: { roll: false },
      channels: { roll: 0.5, pitch: 0.1, yaw: -0.2, throttle: 0.3 }, axes: axes.slice(0, 2),
      steps: ['center', 'sweep', 'throttle', 'roll', 'pitch', 'yaw', 'select', 'confirm', 'mystery'],
    });
    step('roll, reversible', calNodes(ui));
    call(ui, 'setCalibration', {
      stepIndex: 3, stepCount: 8, step: 'roll', title: 'Roll', prompt: 'Roll right', hint: 'Right stick',
      canReverse: true, moving: 'roll', reverse: { roll: true }, axes: axes.slice(0, 2),
    });
    step('roll, reversed', calNodes(ui));
    ui.settings.stickMode = 3;
    call(ui, 'setCalibration', { stepIndex: 7, stepCount: 8, step: 'confirm', title: 'Check', prompt: 'Fly it', hint: 'Looks right?', canSave: true, axes: [] });
    step('confirm', calNodes(ui));
    call(ui, 'setCalibration', null); step('closed again', calNodes(ui));
    for (const k of ['calSaveBtn', 'calSkipBtn', 'calZeroBtn', 'calRevBtn', 'calModeBtn']) ui[k] = null;
    call(ui, 'setCalibration', { stepIndex: 1, stepCount: 8, step: 'sweep', title: 'Range', prompt: 'p', hint: 'h', canSave: true, canReverse: true, moving: 'yaw' });
    call(ui, 'setCalibration', null);
    step('no buttons', calNodes(ui));
    ui.calAxes = null;
    out.calNoAxes = call(ui, 'setCalAxes', [{ i: 0, v: 0 }]);
    ui.calPrompt = null;
    out.calNoPrompt = call(ui, 'setCalibration', { stepIndex: 0 });
  });

  out.stickMode = await scenario((ui, step) => {
    const n = () => ({
      osdL: ui.osdStickLeft.cap, osdR: ui.osdStickRight.cap, howL: ui.howtoStickLeft.cap, howR: ui.howtoStickRight.cap ?? null,
      calL: ui.calStickLeft?.cap ?? null, calR: ui.calStickRight.cap,
    });
    call(ui, 'setStickMode', 2); step('mode 2', n());
    call(ui, 'setStickMode', '2'); step('mode 2 again', n());
    call(ui, 'setStickMode', 1); step('mode 1', n());
    call(ui, 'setStickMode', 'nonsense'); step('nonsense', n());
    ui.howtoKeys = null;
    ui.calStickLeft = null;
    ui.howtoStickRight = { box: el('div') };
    call(ui, 'setStickMode', 4); step('mode 4, partial', n());
    out.cycle = [];
    ui.settings.stickMode = 1;
    for (let i = 0; i < 5; i++) out.cycle.push(call(ui, 'cycleStickMode'));
    ui.settings.stickMode = 'x';
    out.cycle.push(call(ui, 'cycleStickMode'));
    step('cycled', {});
  });

  out.pad = await scenario((ui, step) => {
    ui.screen = 'title';
    call(ui, 'setPadInfo', { count: 1, using: 'Radio', buttons: 0, hasSelect: false }); step('no buttons on title', {});
    call(ui, 'setPadInfo', { count: 1, using: 'Radio', buttons: 0, hasSelect: false, name: 'moved' }); step('same label', {});
    call(ui, 'setPadInfo', null); step('gone', {});
    ui.screen = 'flight';
    call(ui, 'setPadInfo', { count: 1, using: 'Radio', buttons: 0, hasSelect: false }); step('off the title', {});
    const n = () => ({ kicker: ui.padKicker, prompt: ui.padPrompt, hint: ui.padHint, cards: ui.padCards, yes: ui.padYesBtn, no: ui.padNoBtn, skip: ui.padSkipBtn });
    call(ui, 'setPadPick', null); step('pick closed', n());
    const pads = [
      { key: 'a', title: 'Left', name: 'TX16S', live: true, chosen: false, axes: [0.5, -0.5, 2, -2] },
      { key: 'b', title: 'Right', name: 'Pocket', live: false, chosen: true },
    ];
    call(ui, 'setPadPick', { pads, prompt: 'Wiggle', hint: 'Move a stick', canAccept: false, skipLabel: 'Keyboard', phase: 'wiggle', reason: 'boot' });
    step('two pads', n());
    call(ui, 'setPadPick', { pads: [{ ...pads[0], live: false }, { ...pads[1], chosen: false, live: true }], prompt: 'Wiggle', hint: 'Move a stick', canAccept: true, skipLabel: 'Keyboard', phase: 'confirm', reason: 'menu' });
    step('same pads, new states', n());
    call(ui, 'setPadPick', { pads: [pads[1]], prompt: 'One', hint: 'h', canAccept: true, skipLabel: 'Skip', phase: 'confirm', reason: 'menu' });
    step('one pad', n());
    call(ui, 'setPadPick', { pads: [], prompt: 'None', hint: 'h', canAccept: false, skipLabel: 'Skip', phase: 'wiggle', reason: 'boot' });
    step('no pads', n());
    for (const k of ['padYesBtn', 'padNoBtn', 'padSkipBtn']) ui[k] = null;
    call(ui, 'setPadPick', { pads: [pads[0]], prompt: 'p', hint: 'h', canAccept: true, skipLabel: 's', phase: 'x', reason: 'y' });
    step('no buttons', n());
    ui.padCards = null;
    out.padNullCards = call(ui, 'setPadPick', null);
    ui.padPrompt = null;
    out.padNoPrompt = call(ui, 'setPadPick', { pads: [] });
  });

  out.misc = await scenario(async (ui, step) => {
    call(ui, 'persistSettings'); step('persist', {});
    ui.screen = 'pilot';
    out.everyone = [call(ui, 'everyoneFlight'), call(ui, 'everyoneFlight')];
    step('everyone asked', {});
    for (let i = 0; i < 5; i++) await settle();
    out.everyone.push(call(ui, 'everyoneFlight'));
    step('everyone answered', {});
    ui.screen = 'flight';
    call(ui, 'setGpuInfo', { renderer: 'x' }); ui.screen = 'pilot'; call(ui, 'setGpuInfo', null); step('gpu', {});
    out.stickPath = [];
    out.stickPath.push(call(ui, 'stickPathRow'));
    call(ui, 'setStickProbe', 'not a function'); out.stickPath.push(call(ui, 'stickPathRow'));
    for (const st of [null, { source: 'touch' }, { source: 'keyboard+touch' }, { source: 'keyboard' }, { source: 'gamepad', padHz: 0 },
      { source: 'gamepad', padHz: 100, fps: 60 }, { source: 'gamepad', padHz: 58, fps: 60, stickLevels: 256 },
      { source: 'gamepad', padHz: 140, fps: 144, stickLevels: 1024 }, { source: 'gamepad', padHz: 30, fps: 36 },
      { source: 'gamepad', padHz: 'x', fps: 'y', stickLevels: 600 }]) {
      call(ui, 'setStickProbe', () => st);
      out.stickPath.push(call(ui, 'stickPathRow'));
    }
    step('probe', {});
  });
  return out;
}

const en = await snapshot();
await useLocale('es');
const got = JSON.parse(JSON.stringify({ en, es: await snapshot() }));
const text = JSON.stringify(got);
if (RECORD) {
  /* One step per line: a diff of the record then names the step that moved. */
  const lines = (v) => (Array.isArray(v) ? `[\n${v.map((x) => `   ${JSON.stringify(x)}`).join(',\n')}\n  ]` : JSON.stringify(v));
  const body = Object.entries(got).map(([lang, parts]) => ` ${JSON.stringify(lang)}: {\n${Object.entries(parts)
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${lines(v)}`).join(',\n')}\n }`).join(',\n');
  writeFileSync(FILE, `{\n${body}\n}\n`);
  console.log(`wrote ${FILE}`);
  process.exit(0);
}
if (!existsSync(FILE)) {
  console.log(`FAIL no record at ${FILE}`);
  process.exit(1);
}
const want = JSON.parse(readFileSync(FILE, 'utf8'));
const bad = [];
for (const lang of ['en', 'es']) {
  for (const k of Object.keys({ ...want[lang], ...got[lang] })) {
    const w = want[lang][k];
    const g = got[lang][k];
    if (JSON.stringify(w) === JSON.stringify(g)) continue;
    /* Name the first step that differs, which is what a reader needs. */
    const at = Array.isArray(w) && Array.isArray(g) ? w.findIndex((s, i) => JSON.stringify(s) !== JSON.stringify(g[i])) : -1;
    bad.push(at >= 0 ? `${lang}.${k}[${at}] "${(w[at] || g[at]).name}"` : `${lang}.${k}`);
  }
}
if (bad.length) {
  console.log(`FAIL ${bad.length} part(s) differ: ${bad.join(', ')}`);
  process.exit(1);
}
console.log(`ok ${text.length} bytes of overlay, results, calibration and pad pick equal to the record`);
