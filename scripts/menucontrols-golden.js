/*
 * menucontrols-golden.js: the menu's row controls, cursor and focus, and
 * the Rates, PIDs and bench chrome (the Ui methods in src/ui/menucontrols.js)
 * held to a record taken from the methods as they stood inside the Ui class
 * in src/ui/ui.js.
 *
 *     node scripts/menucontrols-golden.js            compare
 *     node scripts/menucontrols-golden.js --record   write tests/fixtures/menucontrols-golden.json
 *
 * The methods are called off Ui.prototype on a stand-in Ui, so the same
 * script reads the class before the split and the installed module after
 * it. Every collaborator outside the range (renderMenu, move, adjust, the
 * card and trick painters, the sound and settings hooks) is a stub that
 * writes a line to a log, and a small stand-in document records focus,
 * blur, scrolling, events and what each control builds. Each scenario
 * keeps its log, the DOM it left and the Ui fields other code reads, in
 * English and Spanish.
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
const FILE = join(root, 'tests', 'fixtures', 'menucontrols-golden.json');
const RECORD = process.argv.includes('--record');

let log = [];
const say = (...parts) => log.push(parts.map(show).join(' '));

/* An element in a log line: its name when the scenario gave it one, else
 * tag, classes and a little of its text. */
function show(v) {
  if (v instanceof FakeElement) {
    if (v.name) return `<${v.name}>`;
    const text = v.textContent;
    return `<${v.tagName.toLowerCase()}${v.className ? `.${v.className.trim().split(/\s+/).join('.')}` : ''}${text ? ` "${text.slice(0, 24)}"` : ''}>`;
  }
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

const PROPS = ['hidden', 'type', 'min', 'max', 'step', 'value', 'inputMode', 'autocomplete', 'spellcheck', 'placeholder', 'tabIndex', 'scrollTop'];

class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.className = '';
    this.childNodes = [];
    this.parent = null;
    this.attrs = {};
    this.dataset = {};
    this.style = {};
    this.listeners = {};
  }
  get classList() {
    const tokens = () => this.className.split(/\s+/).filter(Boolean);
    const write = (list) => { this.className = list.join(' '); };
    return {
      contains: (c) => tokens().includes(c),
      add: (...cs) => write([...tokens(), ...cs.filter((c) => !tokens().includes(c))]),
      remove: (...cs) => write(tokens().filter((c) => !cs.includes(c))),
      toggle: (c, force) => {
        const want = force === undefined ? !tokens().includes(c) : Boolean(force);
        write(want ? [...tokens().filter((t) => t !== c), c] : tokens().filter((t) => t !== c));
        return want;
      },
    };
  }
  get children() { return this.childNodes.filter((c) => c instanceof FakeElement); }
  append(...nodes) {
    for (const n of nodes) {
      if (n instanceof FakeElement) {
        n.remove();
        n.parent = this;
      }
      this.childNodes.push(n);
    }
  }
  remove() {
    if (!this.parent) return;
    this.parent.childNodes = this.parent.childNodes.filter((c) => c !== this);
    this.parent = null;
  }
  get isConnected() {
    for (let n = this; n; n = n.parent) if (n === BODY) return true;
    return false;
  }
  contains(node) {
    for (let n = node; n; n = n.parent) if (n === this) return true;
    return false;
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  set textContent(t) {
    for (const c of this.children) c.parent = null;
    this.childNodes = t === '' ? [] : [String(t)];
  }
  get textContent() { return this.childNodes.map((c) => (typeof c === 'string' ? c : c.textContent)).join(''); }
  all() { return this.children.flatMap((c) => [c, ...c.all()]); }
  querySelectorAll(sel) { return this.all().filter((n) => n.classList.contains(sel.replace(/^\./, ''))); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  fire(type, init = {}) {
    let prevented = false;
    let stopped = false;
    const ev = {
      type, target: this, ...init,
      preventDefault() { prevented = true; },
      stopPropagation() { stopped = true; },
    };
    say('>', type, init.key || '', this);
    for (const fn of this.listeners[type] || []) fn(ev);
    say('<', type, prevented ? 'prevented' : '', stopped ? 'stopped' : '');
    return ev;
  }
  focus(opts) {
    say('focus', this, opts || '');
    if (this.throwOnFocusOpts && opts) throw new Error('no options');
    const prev = doc.activeElement;
    if (prev === this) return;
    if (prev && prev !== BODY) {
      doc.activeElement = BODY;
      prev.fire('blur');
    }
    doc.activeElement = this;
    if (this.listeners.focus) this.fire('focus');
  }
  blur() {
    say('blur', this);
    if (doc.activeElement !== this) return;
    doc.activeElement = BODY;
    if (this.listeners.blur) this.fire('blur');
  }
  select() { say('select', this); }
  setSelectionRange(a, b) { say('setSelectionRange', this, a, b); }
  scrollIntoView(opts) { say('scrollIntoView', this, opts || ''); }
  getBoundingClientRect() {
    if (this.rect) return this.rect;
    if (this.classList.contains('drop-list')) {
      const top = parseFloat(this.style.top) || 0;
      const height = 30 * this.children.length;
      return { left: parseFloat(this.style.left) || 0, top, width: 160, height, bottom: top + height, right: 0 };
    }
    return { left: 0, top: 0, width: 0, height: 0, bottom: 0, right: 0 };
  }
  getContext() {
    const self = this;
    return new Proxy({}, {
      get(o, k) { return typeof k === 'string' && /^[a-z]/.test(k) && !/Style|Width$/.test(k) ? () => { self.drawCalls = (self.drawCalls || 0) + 1; } : o[k]; },
      set(o, k, v) { o[k] = v; return true; },
    });
  }
}

const BODY = new FakeElement('body');
const doc = { createElement: (tag) => new FakeElement(tag), body: BODY, activeElement: BODY };
globalThis.document = doc;
let timers = [];
let nextTimer = 1;
globalThis.window = {
  innerWidth: 1280,
  innerHeight: 720,
  setTimeout(fn, ms) { const id = nextTimer++; timers.push({ id, fn, ms }); return id; },
  clearTimeout(id) { timers = timers.filter((t) => t.id !== id); },
  addEventListener() {},
  removeEventListener() {},
};
globalThis.localStorage = {
  /* The key is left out: it belongs to settings.js and may be renamed there. */
  setItem(k, v) { say('store', v); },
  getItem() { return null; },
  removeItem() {},
};

function flushTimers() {
  const due = timers;
  timers = [];
  for (const t of due) {
    say('timer', t.ms);
    t.fn();
  }
}

function tree(node) {
  if (typeof node === 'string') return node;
  if (!node) return null;
  const out = { tag: node.tagName };
  if (node.name) out.name = node.name;
  if (node.className) out.cls = node.className;
  if (Object.keys(node.attrs).length) out.attrs = Object.fromEntries(Object.entries(node.attrs).sort());
  if (Object.keys(node.dataset).length) out.dataset = { ...node.dataset };
  if (Object.keys(node.style).length) out.style = Object.fromEntries(Object.entries(node.style).sort());
  for (const p of PROPS) if (node[p] !== undefined) out[p] = node[p];
  if (node.drawCalls) out.drawCalls = node.drawCalls;
  if (node.childNodes.length) out.children = node.childNodes.map(tree);
  return out;
}

const { Ui } = await import('../src/ui/ui.js');
const { useLocale } = await import('../src/strings/index.js');

function named(tag, name, cls = '') {
  const n = new FakeElement(tag);
  n.name = name;
  n.className = cls;
  return n;
}

/* A stand-in Ui: real methods off the prototype, stubs for everything the
 * range calls outside itself. */
function makeUi(extra = {}) {
  const ui = Object.create(Ui.prototype);
  const appRoot = named('div', 'root');
  BODY.append(appRoot);
  Object.assign(ui, {
    screen: 'quad', returnTo: null, cursor: 0, rowOffset: 0, menuRows: [], focusId: null,
    settings: { rates: { r: 1 }, airframe: 'quad', tune: 'wing-acro', pids: {} },
    root: appRoot, ratesStick: { roll: 0, pitch: 0, yaw: 0 }, pidsLive: null,
    dropEl: null, dropIndex: null, ptrX: null, ptrY: null, roomPages: {}, screens: {},
  });
  ui.list = [];
  ui.items = () => ui.list;
  for (const n of ['renderMenu', 'adjust', 'noteInteraction', 'markCards', 'renderTricks', 'refreshBest', 'show']) {
    ui[n] = (...a) => say(n, ...a);
  }
  ui.markBars = (items) => say('markBars', items.length);
  ui.move = (dir) => {
    say('move', dir);
    ui.cursor = Math.max(0, Math.min(ui.list.length - 1, ui.cursor + dir));
  };
  ui.isStop = (it) => !it.gap;
  ui.cardScreen = () => Boolean(ui.cards);
  ui.onUiSound = (k) => say('sound', k);
  ui.onSettings = (s) => say('onSettings', s);
  Object.assign(ui, extra);
  return ui;
}

/* Rows as renderMenu leaves them: a .row per item, headings in between. */
function rowsFor(ui, kinds) {
  const menu = named('div', 'menu');
  ui.root.append(menu);
  ui.menuRows = kinds.map((k, j) => {
    const r = named('div', `row${j}`, k === 'h' ? 'menu-heading' : 'row');
    menu.append(r);
    return r;
  });
  return menu;
}

function state(ui) {
  return {
    cursor: ui.cursor,
    focusId: ui.focusId,
    dropIndex: ui.dropIndex,
    dropEl: tree(ui.dropEl),
    numberFocusWanted: ui.numberFocusWanted ?? null,
    searchCaret: ui.searchCaret ?? null,
    ratesStick: ui.ratesStick,
    pidsLive: ui.pidsLive,
    ptr: [ui.ptrX, ui.ptrY],
    lastCardKey: ui.lastCardKey ?? null,
    settings: ui.settings,
    active: show(doc.activeElement),
  };
}

const numberRow = (ui, extra = {}) => {
  const it = {
    id: 'rate', label: 'Roll rate',
    num: { text: '670', cli: 670, spec: { cliMin: 0, cliMax: 1000, scale: 1, decimals: 0 }, unit: 'deg/s' },
    typed: (raw) => {
      const n = Number(String(raw).trim());
      return String(raw).trim() === '' || !Number.isFinite(n) ? null : Math.round(n);
    },
    set: (v) => { say('set', v); ui.settings.rate = v; },
    ...extra,
  };
  return it;
};

const scenarios = {
  rates() {
    const out = {};
    let ui = makeUi();
    ui.syncRates();
    ui.paintRates({ roll: 1, pitch: 0, yaw: 0 });
    out.noPanel = state(ui);
    const panel = { paint: (...a) => say('ratesPanel.paint', ...a), paintStick: (s) => say('ratesPanel.paintStick', s) };
    ui = makeUi({ ratesPanel: panel });
    ui.syncRates();
    ui.paintRates(null);
    ui.paintRates({ roll: 0.5, pitch: 0, yaw: 0 });
    out.offScreen = state(ui);
    const hint = named('div', 'ratesHint');
    ui = makeUi({ ratesPanel: panel, ratesHint: hint, screen: 'rates', returnTo: 'paused' });
    ui.syncRates();
    out.pausedHint = hint.textContent;
    ui.returnTo = 'title';
    ui.syncRates();
    out.titleHint = hint.textContent;
    ui.ratesHint = null;
    ui.syncRates();
    ui.paintRates({ roll: -1, pitch: 0.25, yaw: 0 });
    ui.paintRates(undefined);
    out.onScreen = state(ui);
    return out;
  },

  pids() {
    const out = {};
    const panel = { paint: (live, caption) => say('pidsPanel.paint', live, caption) };
    const hint = named('div', 'pidsHint');
    let ui = makeUi();
    ui.syncPids();
    ui = makeUi({ pidsPanel: panel, pidsHint: hint, screen: 'quad' });
    ui.syncPids();
    ui.screen = 'pids';
    ui.returnTo = 'paused';
    ui.syncPids();
    out.loading = hint.textContent;
    ui.returnTo = null;
    ui.pidsLive = { tune: 'wing-stab', roll: [1] };
    ui.syncPids();
    ui.pidsLive = { tune: 'wing-acro', roll: [1] };
    ui.syncPids();
    ui.settings.pids = { 'wing-acro': { mode: 'sliders', sliders: { master: 120 } } };
    ui.syncPids();
    ui.settings.pids = { 'wing-acro': { mode: 'expert', pids: { roll: {} } } };
    ui.syncPids();
    ui.settings.pids = { 'wing-acro': { mode: 'expert' } };
    ui.pidsHint = null;
    ui.syncPids();
    out.hint = hint.textContent;
    ui.setPidsLive({ tune: 'wing-acro', roll: [2] });
    ui.screen = 'quad';
    ui.setPidsLive(undefined);
    out.state = state(ui);
    return out;
  },

  fcChrome() {
    const out = {};
    const handles = () => ({
      fcTabs: named('nav', 'fcTabs'), fcPages: named('nav', 'fcPages'), fcAttitude: Object.assign(named('canvas', 'fcAttitude'), { width: 120, height: 80 }),
      fcDirty: named('span', 'fcDirty'), fcExit: named('div', 'fcExit'), fcSaveExit: named('button', 'fcSaveExit'),
      fcLeave: named('button', 'fcLeave'), fcExitCopy: named('span', 'fcExitCopy'),
    });
    let dirty = false;
    const fc = {
      tab: 'setup', page: 'pid-main', confirm: null, attitude: { w: 0.9, x: 0.1, y: 0.2, z: 0.3 },
      dirty: () => dirty,
      setTab(id) { say('fc.setTab', id); this.tab = id; },
      stopMotors() { say('fc.stopMotors'); },
    };
    let ui = makeUi({ fc });
    ui.syncFcChrome();
    ui.syncFcExit();
    ui.syncFcDirty();
    const h = handles();
    ui = makeUi({ fc, ...h });
    const snap = () => Object.fromEntries(Object.entries(h).map(([k, v]) => [k, tree(v)]));
    ui.syncFcChrome();
    out.offScreen = snap();
    ui.screen = 'fc';
    ui.syncFcChrome();
    out.setup = snap();
    ui.cursor = 4;
    h.fcTabs.children[1].fire('click');
    out.afterTab = { tab: fc.tab, cursor: ui.cursor };
    fc.tab = 'pid';
    dirty = true;
    ui.syncFcChrome();
    out.pidDirty = snap();
    ui.cursor = 3;
    if (h.fcPages.children[1]) h.fcPages.children[1].fire('click');
    out.afterPage = { page: fc.page, cursor: ui.cursor };
    fc.confirm = 'leave';
    ui.syncFcChrome();
    out.confirmLeave = snap();
    h.fcTabs.children[0].fire('click');
    fc.confirm = 'save-run';
    ui.syncFcChrome();
    out.confirmSave = snap();
    if (h.fcPages.children[0]) h.fcPages.children[0].fire('click');
    dirty = false;
    fc.confirm = null;
    fc.tab = 'setup';
    ui.fcSaveExit = null;
    ui.fcLeave = null;
    ui.fcExitCopy = null;
    ui.fcDirty = null;
    ui.syncFcChrome();
    out.bare = snap();
    h.fcAttitude.drawCalls = 0;
    ui.paintFcAttitude();
    out.paintSetup = h.fcAttitude.drawCalls;
    fc.confirm = 'leave';
    ui.paintFcAttitude();
    fc.confirm = null;
    fc.tab = 'pid';
    ui.paintFcAttitude();
    ui.screen = 'quad';
    fc.tab = 'setup';
    ui.paintFcAttitude();
    out.paintTotal = h.fcAttitude.drawCalls;
    for (const from of ['paused', 'quad', 'pids', 'title', 'rates', undefined]) {
      fc.confirm = 'leave';
      ui.fcFrom = from;
      ui.leaveFc();
    }
    out.confirmAfterLeave = fc.confirm;
    return out;
  },

  helpNode() {
    const ui = makeUi();
    const names = ['titleHelp', 'howtoHelp', 'trickHelp', 'creditsHelp', 'coursesHelp', 'freestyleHelp', 'pilotHelp', 'friendsHelp',
      'quadHelp', 'launchHelp', 'standingsHelp', 'ratesHelp', 'pidsHelp', 'fcHelp', 'pausedHelp', 'resultsHelp'];
    for (const n of names) ui[n] = named('div', n);
    const out = {};
    const screens = ['title', 'howto', 'tricks', 'credits', 'courses', 'freestyle', 'pilot', 'friends', 'rooms', 'roomnew',
      'quad', 'launch', 'standings', 'rates', 'pids', 'fc', 'paused', 'results', 'hangar', 'bogus'];
    for (const s of screens) {
      ui.screen = s;
      out[s] = show(ui.helpNode() ?? null);
    }
    ui.roomPages = { rooms: { help: named('div', 'roomsHelp') }, roomnew: { help: named('div', 'roomnewHelp') } };
    for (const s of ['rooms', 'roomnew']) {
      ui.screen = s;
      out[`${s}+pages`] = show(ui.helpNode() ?? null);
    }
    return out;
  },

  syncCursor() {
    const out = {};
    const ui = makeUi({ quadHelp: named('div', 'quadHelp'), titleHelp: named('div', 'titleHelp') });
    ui.screens.title = named('section', 'titleScreen', 'screen screen-title');
    const menu = rowsFor(ui, ['r', 'r', 'h', 'r', 'r', 'r']);
    ui.list = [{ id: 'a', note: 'note a' }, { id: 'b', note: 'note b' }, { heading: true }, { id: 'd' }, { note: 'no id' }, { id: 'f', note: 'note f' }];
    const rows = () => ui.menuRows.map((r) => [r.className, r.tabIndex ?? null, r.attrs['aria-selected'] ?? null]);
    ui.cursor = 1;
    ui.syncCursor();
    out.first = { rows: rows(), help: ui.quadHelp.textContent, scrollTop: ui.quadHelp.scrollTop ?? null, state: state(ui) };
    ui.quadHelp.scrollTop = 50;
    ui.syncCursor();
    out.sameNote = ui.quadHelp.scrollTop;
    ui.cursor = 4;
    ui.syncCursor(false);
    out.noId = { rows: rows(), focusId: ui.focusId, help: ui.quadHelp.textContent, scrollTop: ui.quadHelp.scrollTop };
    ui.cursor = 3;
    ui.syncCursor();
    out.emptyNote = ui.quadHelp.textContent;
    doc.activeElement = ui.menuRows[0];
    ui.cursor = 5;
    ui.syncCursor();
    out.focusFollows = show(doc.activeElement);
    const button = named('button', 'inner');
    ui.menuRows[1].append(button);
    doc.activeElement = button;
    ui.cursor = 1;
    ui.syncCursor();
    out.fromInner = show(doc.activeElement);
    const input = new FakeElement('input');
    ui.menuRows[3].append(input);
    doc.activeElement = input;
    ui.cursor = 0;
    ui.syncCursor();
    out.fromInput = show(doc.activeElement);
    const outside = named('button', 'outside');
    BODY.append(outside);
    doc.activeElement = outside;
    ui.cursor = 3;
    ui.syncCursor();
    out.fromOutside = show(doc.activeElement);
    ui.rowOffset = 1;
    ui.cursor = 2;
    doc.activeElement = BODY;
    ui.syncCursor();
    out.offset = rows();
    ui.cursor = 9;
    ui.syncCursor();
    out.past = { rows: rows(), help: ui.quadHelp.textContent };
    ui.rowOffset = 0;
    ui.screen = 'title';
    ui.cursor = 0;
    ui.syncCursor();
    out.titleWithNote = ui.screens.title.className;
    ui.cursor = 3;
    ui.syncCursor();
    out.titleNoNote = ui.screens.title.className;
    ui.screen = 'bogus';
    ui.cursor = 1;
    ui.syncCursor();
    out.noHelp = ui.screens.title.className;
    out.menu = tree(menu);
    return out;
  },

  focus() {
    const out = {};
    const ui = makeUi();
    ui.menuRows = undefined;
    ui.focusCursorRow();
    rowsFor(ui, ['r', 'h', 'r']);
    ui.cursor = 1;
    ui.focusCursorRow();
    ui.cursor = 2;
    ui.focusCursorRow();
    out.afterRow = show(doc.activeElement);
    ui.rowOffset = 1;
    ui.cursor = 1;
    ui.focusCursorRow();
    out.afterOffset = show(doc.activeElement);
    ui.cursor = 7;
    ui.focusCursorRow();
    const probes = {};
    const cases = {
      body: BODY, none: null, row: ui.menuRows[0], button: new FakeElement('button'),
      input: new FakeElement('input'), textarea: new FakeElement('textarea'), outside: new FakeElement('div'),
    };
    ui.menuRows[2].append(cases.button, cases.input, cases.textarea);
    BODY.append(cases.outside);
    for (const [k, v] of Object.entries(cases)) {
      doc.activeElement = v;
      probes[k] = ui.focusInMenu();
    }
    out.focusInMenu = probes;
    doc.activeElement = BODY;
    return out;
  },

  restoreFocusRow() {
    const out = {};
    const ui = makeUi();
    ui.list = [{ id: 'a' }, { id: 'gapped', gap: true }, { id: 'b' }, null, { id: 'c' }, { id: 'gapped' }];
    ui.cursor = 1;
    ui.restoreFocusRow();
    out.noId = ui.cursor;
    for (const id of ['c', 'a', 'gapped', 'gone']) {
      ui.focusId = id;
      ui.cursor = 2;
      ui.restoreFocusRow();
      out[id] = ui.cursor;
    }
    return out;
  },

  pointer() {
    const out = {};
    const ui = makeUi();
    ui.list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    rowsFor(ui, ['r', 'r', 'r']);
    out.moved = [];
    out.moved.push(ui.pointerMoved({ clientX: 10, clientY: 10 }));
    out.moved.push(ui.pointerMoved({ clientX: 10, clientY: 10 }));
    out.moved.push(ui.pointerMoved({ clientX: 11, clientY: 10 }));
    out.moved.push(ui.pointerMoved({ clientX: 11, clientY: 12 }));
    ui.hoverCursor({ clientX: 11, clientY: 12 }, 2);
    ui.hoverCursor({ clientX: 20, clientY: 12 }, 0);
    ui.hoverCursor({ clientX: 30, clientY: 40 }, 2);
    out.state = state(ui);
    return out;
  },

  setCursor() {
    const out = {};
    const ui = makeUi({ coursesHelp: named('div', 'coursesHelp') });
    ui.list = [
      { id: 'a', course: { kind: 'map', track: { id: 't1' } } },
      { id: 'b', note: 'plain' },
      { id: 'c', course: { kind: 'mine', track: { id: 't9' } } },
    ];
    rowsFor(ui, ['r', 'r', 'r']);
    ui.setCursor(0);
    ui.dropEl = named('div', 'staleDrop', 'drop-list');
    ui.root.append(ui.dropEl);
    ui.dropIndex = 0;
    ui.screen = 'courses';
    ui.setCursor(2);
    out.courses = state(ui);
    ui.setCursor(1);
    out.noCourse = ui.lastCardKey;
    ui.cards = true;
    ui.screen = 'freestyle';
    ui.setCursor(0, true);
    ui.cards = false;
    ui.screen = 'tricks';
    ui.setCursor(2);
    ui.onUiSound = null;
    ui.screen = 'quad';
    ui.setCursor(1);
    out.end = state(ui);
    return out;
  },

  search() {
    const out = {};
    const ui = makeUi();
    ui.list = [{ id: 'q' }, { id: 'r1' }, { id: 'r2' }, { id: 'r3' }];
    rowsFor(ui, ['r', 'r', 'r', 'r']);
    const texts = [];
    const it = { id: 'q', label: 'Search', text: { value: 'fai', placeholder: 'Find a setting' }, onText: (v) => { say('onText', v); texts.push(v); } };
    const control = ui.makeSearch(it, 0);
    ui.menuRows[0].append(control);
    out.tree = tree(control);
    out.bare = tree(ui.makeSearch({ id: 'q', label: 'Search', text: {} }, 0));
    const field = control.querySelector('.row-textfield');
    ui.dropEl = named('div', 'staleDrop', 'drop-list');
    ui.root.append(ui.dropEl);
    ui.dropIndex = 2;
    ui.cursor = 2;
    field.focus();
    out.afterFocus = state(ui);
    field.fire('click');
    for (const v of ['fail', 'fails', 'failsafe']) {
      field.value = v;
      field.fire('input');
    }
    out.pending = timers.map((t) => t.ms);
    field.selectionStart = 3;
    flushTimers();
    out.afterFlush = state(ui);
    ui.searchCaret = null;
    ui.restoreSearchCaret();
    for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'd', 'a']) {
      field.focus();
      field.fire('keydown', { key });
    }
    field.value = 'x';
    field.fire('input');
    const silent = ui.makeSearch({ id: 'q', label: 'Search', text: { value: '' } }, 0);
    const silentField = silent.querySelector('.row-textfield');
    silentField.value = 'zz';
    silentField.fire('input');
    flushTimers();
    out.texts = texts;
    ui.cursor = 1;
    ui.restoreSearchCaret();
    ui.menuRows = undefined;
    ui.restoreSearchCaret();
    out.end = state(ui);
    return out;
  },

  switches() {
    const out = {};
    const ui = makeUi();
    const sw = {
      id: 'sw', label: 'Air mode', sw: true, on: false,
      adjust: (d) => { say('it.adjust', d); ui.settings.air = d > 0; },
    };
    ui.list = [{ id: 'x' }, sw];
    rowsFor(ui, ['r', 'r']);
    const control = ui.makeSwitch(sw, 1);
    out.tree = tree(control);
    out.treeOn = tree(ui.makeSwitch({ ...sw, on: true }, 1));
    const [off, on] = control.children;
    off.fire('click');
    on.fire('click');
    out.afterClick = state(ui);
    ui.setSwitch(null);
    ui.setSwitch({ ...sw, sw: false }, true);
    ui.setSwitch({ ...sw, disabled: true }, true);
    ui.setSwitch({ ...sw, info: true }, true);
    ui.setSwitch({ ...sw, on: true }, 1);
    ui.setSwitch({ ...sw, on: true }, 0);
    ui.onUiSound = null;
    ui.onSettings = null;
    ui.setSwitch(sw, 'yes');
    return out;
  },

  segments() {
    const out = {};
    const ui = makeUi();
    const seg = {
      id: 'mode', label: 'Flight mode', current: 1,
      options: [{ value: 0, label: 'Acro' }, { value: '1', label: 'Angle' }, { value: 'h', label: 'Horizon' }],
      pick: (v) => { say('it.pick', v); ui.settings.mode = v; },
    };
    ui.list = [seg, { id: 'other' }];
    rowsFor(ui, ['r', 'r']);
    ui.cursor = 1;
    const control = ui.makeSegments(seg, 0);
    out.tree = tree(control);
    control.children[1].fire('click');
    control.children[2].fire('click');
    const dis = ui.makeSegments({ ...seg, disabled: true }, 0);
    dis.children[0].fire('click');
    const info = ui.makeSegments({ ...seg, info: true }, 0);
    info.children[2].fire('click');
    out.state = state(ui);
    return out;
  },

  stepper() {
    const out = {};
    const ui = makeUi();
    const it = { id: 'st', label: 'Cells', value: '4S' };
    ui.list = [{ id: 'x' }, it];
    const control = ui.makeStepper(it, 1);
    out.tree = tree(control);
    control.querySelector('.row-value').fire('click');
    ui.cursor = 0;
    const [up, down] = control.querySelector('.step-col').children;
    up.fire('click');
    ui.cursor = 0;
    down.fire('click');
    out.state = state(ui);
    return out;
  },

  number() {
    const out = {};
    const panel = { paint: (r) => say('ratesPanel.paint', r === undefined ? 'none' : 'rates', 'rate', ui.settings.rate ?? null) };
    const ui = makeUi({ ratesPanel: panel });
    const it = numberRow(ui);
    const other = numberRow(ui, { id: 'other', label: 'Pitch rate', num: { text: '500', cli: 500, spec: it.num.spec } });
    ui.list = [{ id: 'x' }, it, other];
    rowsFor(ui, ['r', 'r', 'r']);
    const control = ui.makeNumber(it, 1);
    ui.menuRows[1].append(control);
    const otherControl = ui.makeNumber(other, 2);
    ui.menuRows[2].append(otherControl);
    out.tree = tree(control);
    out.noUnit = tree(otherControl);
    const field = control.querySelector('.row-num');
    const otherField = otherControl.querySelector('.row-num');
    ui.dropEl = named('div', 'staleDrop', 'drop-list');
    ui.root.append(ui.dropEl);
    ui.dropIndex = 0;
    field.fire('mousedown');
    out.afterMousedown = state(ui);
    field.fire('mousedown');
    field.fire('click');
    field.value = '80';
    field.fire('input');
    ui.screen = 'rates';
    field.value = '800';
    field.fire('input');
    field.value = '8x0';
    field.fire('input');
    otherField.fire('mousedown');
    out.handoff = state(ui);
    ui.numberFocusWanted = null;
    otherField.focus();
    otherField.value = '';
    otherField.fire('keydown', { key: 'Enter' });
    otherField.value = '510';
    otherField.fire('keydown', { key: 'Escape' });
    out.escaped = { value: otherField.value, active: show(doc.activeElement) };
    field.focus();
    field.value = '700';
    field.fire('keydown', { key: 'ArrowDown' });
    field.value = '670';
    field.fire('keydown', { key: 'ArrowUp' });
    field.fire('keydown', { key: 'a' });
    field.fire('keydown', { key: 'ArrowLeft' });
    field.value = '999';
    field.fire('blur');
    control.remove();
    field.fire('blur');
    ui.menuRows[1].append(control);
    const [up, down] = control.querySelector('.step-col').children;
    field.value = '1000';
    up.fire('mousedown');
    up.fire('click');
    field.value = 'junk';
    down.fire('mousedown');
    down.fire('click');
    field.value = '0';
    down.fire('click');
    out.end = state(ui);
    return out;
  },

  slider() {
    const out = {};
    const ui = makeUi();
    const it = numberRow(ui, {
      id: 'master', label: 'Master',
      range: { min: 20, max: 200 },
      num: { text: '100', cli: 100, spec: { cliMin: 20, cliMax: 200, scale: 0.01, decimals: 2 }, unit: '%' },
    });
    ui.list = [{ id: 'x' }, it];
    rowsFor(ui, ['r', 'r']);
    const control = ui.makeSliderControl(it, 1);
    ui.menuRows[1].append(control);
    out.tree = tree(control);
    out.noUnit = tree(ui.makeSliderControl({ ...it, num: { ...it.num, unit: '' } }, 1));
    const range = control.querySelector('.row-range');
    const field = control.querySelector('.row-range-num');
    ui.dropEl = named('div', 'staleDrop', 'drop-list');
    ui.root.append(ui.dropEl);
    range.fire('pointerdown');
    range.fire('click');
    range.value = '150';
    range.fire('input');
    out.dragged = field.value;
    range.fire('change');
    range.value = '100';
    range.fire('change');
    range.value = 'abc';
    range.fire('change');
    ui.cursor = 0;
    field.fire('pointerdown');
    field.fire('click');
    field.focus();
    out.focused = state(ui);
    field.value = '120';
    field.fire('keydown', { key: 'Enter' });
    field.value = '130';
    field.fire('keydown', { key: 'Escape' });
    out.escaped = field.value;
    field.focus();
    field.fire('keydown', { key: 'ArrowDown' });
    field.value = '90';
    field.blur();
    control.remove();
    field.fire('blur');
    out.end = state(ui);
    return out;
  },

  numberHelpers() {
    const out = {};
    const panel = { paint: () => say('ratesPanel.paint', 'rate', ui.settings.rate ?? null) };
    const ui = makeUi();
    const it = numberRow(ui);
    ui.list = [{ id: 'x' }, it];
    rowsFor(ui, ['r', 'r', 'h']);
    const field = new FakeElement('input');
    field.className = 'row-num';
    ui.menuRows[1].append(field);
    ui.focusNumber(1);
    ui.focusNumber(0);
    ui.focusNumber(5);
    ui.rowOffset = 1;
    ui.focusNumber(2);
    ui.rowOffset = 0;
    ui.previewNumber(it, '700');
    ui.ratesPanel = panel;
    ui.previewNumber(it, '700');
    ui.screen = 'rates';
    ui.previewNumber(it, 'x');
    ui.previewNumber(it, '700');
    ui.ratesPanel = { paint: () => { say('ratesPanel.paint threw'); throw new Error('boom'); } };
    try {
      ui.previewNumber(it, '710');
    } catch (e) {
      say('caught', e.message);
    }
    out.afterPreview = ui.settings.rate;
    ui.commitNumber(it, 'x');
    ui.commitNumber(it, '670');
    ui.commitNumber(it, ' 671 ');
    ui.stepNumber(it, 1, '');
    ui.stepNumber(it, -1, '5');
    ui.stepNumber(it, 1, '1000');
    ui.stepNumber(it, -1, '0');
    ui.stepNumber(it, -1, '671');
    ui.onUiSound = null;
    ui.onSettings = null;
    ui.writeSettings();
    out.end = state(ui);
    return out;
  },

  drop() {
    const out = {};
    const ui = makeUi();
    const picked = (v) => { say('it.pick', v); ui.settings.choice = v; };
    const it = {
      id: 'dd', label: 'Craft', value: 'Beta', current: 'b',
      options: [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }, { value: 3, label: 'Gamma' }],
      pick: picked,
    };
    const noCurrent = { ...it, id: 'nc', current: 'zz' };
    const opener = { ...it, id: 'op', open: () => say('it.open') };
    ui.list = [{ id: 'x' }, it, noCurrent, opener, { id: 'plain' }, { id: 'empty', options: [] }];
    rowsFor(ui, ['r', 'r', 'r', 'r', 'r', 'r']);
    const control = ui.makeDrop(it, 1);
    ui.menuRows[1].append(control);
    out.tree = tree(control);
    const button = control.querySelector('.drop-btn');
    button.rect = { left: 1200, top: 100, width: 90, height: 30, bottom: 130, right: 1290 };
    button.fire('click');
    out.opened = state(ui);
    ui.moveDrop(1);
    ui.moveDrop(1);
    out.wrapped = tree(ui.dropEl);
    ui.moveDrop(-1);
    button.fire('click');
    out.closed = state(ui);
    ui.menuRows[2].rect = { left: 2, top: 650, width: 300, height: 30, bottom: 680, right: 302 };
    ui.cursor = 2;
    ui.openDropForCursor();
    out.flipped = state(ui);
    ui.moveDrop(-1);
    ui.confirmDrop();
    out.confirmed = state(ui);
    ui.cursor = 3;
    ui.openDropForCursor();
    out.opener = state(ui);
    ui.cursor = 4;
    ui.openDropForCursor();
    ui.cursor = 5;
    ui.openDropForCursor();
    ui.cursor = 9;
    ui.openDropForCursor();
    ui.moveDrop(1);
    ui.openDrop(1, button, it);
    ui.dropEl.children[2].fire('click');
    out.optionClick = state(ui);
    ui.openDrop(1, button, it);
    ui.cursor = 4;
    ui.confirmDrop();
    ui.closeDrop();
    ui.markDropHi();
    out.end = state(ui);
    return out;
  },

  pick() {
    const ui = makeUi();
    ui.list = [{ id: 'x' }, { id: 'p', pick: (v) => { say('it.pick', v); ui.settings.p = v; } }];
    ui.pick('nothing');
    ui.cursor = 1;
    ui.pick(7);
    ui.onUiSound = null;
    ui.onSettings = null;
    ui.pick('quiet');
    ui.cursor = 5;
    ui.pick('gone');
    return state(ui);
  },
};

function runAll() {
  const out = {};
  for (const [name, fn] of Object.entries(scenarios)) {
    log = [];
    timers = [];
    doc.activeElement = BODY;
    BODY.childNodes = [];
    const result = fn();
    out[name] = { result: JSON.parse(JSON.stringify(result ?? null)), log };
  }
  return out;
}

const got = { en: runAll() };
await useLocale('es');
got.es = runAll();

if (RECORD) {
  writeFileSync(FILE, `${JSON.stringify(got, null, 1)}\n`);
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
    const a = want[lang][k];
    const b = got[lang][k];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    const at = (a?.log || []).findIndex((line, j) => line !== (b?.log || [])[j]);
    bad.push(`${lang}.${k}${at >= 0 ? ` (log line ${at}: want ${JSON.stringify(a.log[at])}, got ${JSON.stringify(b?.log?.[at])})` : ' (result)'}`);
  }
}
if (bad.length) {
  console.log(`FAIL ${bad.length} scenario(s) differ:\n  ${bad.join('\n  ')}`);
  process.exit(1);
}
const lines = Object.values(got.en).reduce((n, s) => n + s.log.length, 0);
console.log(`ok ${Object.keys(got.en).length} scenarios, ${lines} log lines per locale, equal to the record`);
