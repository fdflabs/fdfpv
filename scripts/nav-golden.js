/*
 * nav-golden.js: the menu's painter and the moves between screens and rows
 * (the Ui methods in src/ui/nav.js) held to a record taken from the methods
 * as they stood inside the Ui class in src/ui/ui.js.
 *
 *     node scripts/nav-golden.js            compare
 *     node scripts/nav-golden.js --record   write tests/fixtures/nav-golden.json
 *
 * The methods are called off Ui.prototype on a stand-in Ui, so the same
 * script reads the class before the split and the installed module after
 * it. Every collaborator outside the range (the row controls, the cursor
 * painter, the card and trick painters, the course loaders, the chips) is
 * a stub that writes a line to a log, and a small stand-in document records
 * what each method builds, the attributes it sets, the scroll it keeps, the
 * events a row answers and the URL it rewrites. Each scenario keeps its log,
 * the DOM it left and the Ui fields other code reads, in English and
 * Spanish.
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
const FILE = join(root, 'tests', 'fixtures', 'nav-golden.json');
const RECORD = process.argv.includes('--record');

let log = [];
const say = (...parts) => log.push(parts.map(show).join(' '));

function show(v) {
  if (v instanceof FakeElement) {
    if (v.name) return `<${v.name}>`;
    const text = v.textContent;
    return `<${v.tagName.toLowerCase()}${v.className ? `.${v.className.trim().split(/\s+/).join('.')}` : ''}${text ? ` "${text.slice(0, 24)}"` : ''}>`;
  }
  if (typeof v === 'string') return v;
  if (typeof v === 'function') return '[fn]';
  if (v && v.target instanceof FakeElement) return `[event ${v.type} on ${show(v.target)}]`;
  return JSON.stringify(v);
}

const PROPS = ['hidden', 'type', 'title', 'tabIndex', 'scrollTop'];

class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.cls = '';
    this.childNodes = [];
    this.parent = null;
    this.attrs = {};
    this.dataset = {};
    this.listeners = {};
    /* Every write to text, class and width is counted: the write-only-what
     * changed statics are held to the count, not just the end state. */
    this.writes = 0;
    const self = this;
    this.style = {
      props: {},
      setProperty(k, v) { self.writes += 1; this.props[k] = v; },
      set width(v) { self.writes += 1; this.props.width = v; },
      get width() { return this.props.width; },
    };
  }
  get className() { return this.cls; }
  set className(v) { this.writes += 1; this.cls = v; }
  get classList() {
    const tokens = () => this.cls.split(/\s+/).filter(Boolean);
    const write = (list) => { this.cls = list.join(' '); };
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
  closest(sel) {
    const c = sel.replace(/^\./, '');
    for (let n = this; n; n = n.parent) if (n.classList.contains(c)) return n;
    return null;
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  set textContent(t) {
    this.writes += 1;
    for (const c of this.children) c.parent = null;
    this.childNodes = t === '' ? [] : [String(t)];
  }
  get textContent() { return this.childNodes.map((c) => (typeof c === 'string' ? c : c.textContent)).join(''); }
  all() { return this.children.flatMap((c) => [c, ...c.all()]); }
  querySelectorAll(sel) { return this.all().filter((n) => n.classList.contains(sel.replace(/^\./, ''))); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  fire(type, init = {}) {
    const ev = { type, target: this, ...init };
    say('>', type, this);
    for (const fn of this.listeners[type] || []) fn(ev);
    return ev;
  }
}

const BODY = new FakeElement('body');
const doc = {
  createElement: (tag) => new FakeElement(tag),
  createTextNode: (t) => String(t),
  body: BODY,
  activeElement: BODY,
};
globalThis.document = doc;
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};
const location = { href: 'https://example.test/', hash: '', search: '' };
const setUrl = (href) => {
  const u = new URL(href);
  location.href = u.href;
  location.hash = u.hash;
  location.search = u.search;
};
globalThis.window = {
  location,
  addEventListener(type, fn) { say('window.addEventListener', type); window.handlers[type] = fn; },
  handlers: {},
};
globalThis.history = {
  replaceState(state, title, url) {
    say('history.replaceState', String(url));
    setUrl(String(url));
  },
};
let touchPoints = 0;
Object.defineProperty(globalThis, 'navigator', { configurable: true, get: () => ({ maxTouchPoints: touchPoints }) });

function tree(node) {
  if (typeof node === 'string') return node;
  if (!node) return null;
  const out = { tag: node.tagName };
  if (node.name) out.name = node.name;
  if (node.cls) out.cls = node.cls;
  if (Object.keys(node.attrs).length) out.attrs = Object.fromEntries(Object.entries(node.attrs).sort());
  if (Object.keys(node.dataset).length) out.dataset = { ...node.dataset };
  if (Object.keys(node.style.props).length) out.style = Object.fromEntries(Object.entries(node.style.props).sort());
  for (const p of PROPS) if (node[p] !== undefined) out[p] = node[p];
  if (node.childNodes.length) out.children = node.childNodes.map(tree);
  return out;
}

const { Ui, courseCardKey } = await import('../src/ui/ui.js');
const { useLocale } = await import('../src/strings/index.js');

function named(tag, name, cls = '') {
  const n = new FakeElement(tag);
  n.name = name;
  n.cls = cls;
  return n;
}

const MENU_SCREENS = ['title', 'howto', 'tricks', 'credits', 'courses', 'freestyle', 'pilot', 'friends', 'quad', 'launch',
  'standings', 'rates', 'pids', 'fc', 'paused', 'results'];

/* The frame, the title's hint line and one menu host per screen, named so
 * the log and the tree say where each thing landed. */
function frameNodes() {
  const hint = named('p', 'titleHint');
  const keys = named('span', 'hintKeys', 'hint-keys');
  const copy = named('span', 'hintCopy', 'hint-copy');
  hint.append(keys, copy);
  const nodes = {
    root: named('div', 'root'), frameTop: named('div', 'frameTop'), frameBot: named('div', 'frameBot'),
    crumb: named('div', 'crumb'), frameContext: named('div', 'frameContext'), frameLegend: named('div', 'frameLegend'),
    framePrimary: named('button', 'framePrimary'), osd: named('div', 'osd'), titleHint: hint, launchLede: named('p', 'launchLede'),
    screens: {}, roomPages: {},
  };
  for (const s of MENU_SCREENS) {
    nodes[`${s}Menu`] = named('div', `${s}Menu`, 'menu');
    nodes.screens[s] = named('section', `${s}Screen`, `screen screen-${s}`);
  }
  nodes.screens.flight = named('section', 'flightScreen');
  for (const s of ['rooms', 'roomnew']) {
    nodes.roomPages[s] = { menu: named('div', `${s}Menu`, 'menu') };
    nodes.screens[s] = named('section', `${s}Screen`);
  }
  BODY.append(nodes.root);
  return nodes;
}

/* A stand-in Ui: real methods off the prototype, stubs for everything the
 * range calls outside itself. items() answers from `lists`, keyed by
 * screen. */
function makeUi(extra = {}) {
  const ui = Object.create(Ui.prototype);
  Object.assign(ui, frameNodes(), {
    screen: 'quad', returnTo: null, cursor: 0, rowOffset: 0, menuRows: [], focusId: null, cursorMemory: {},
    settings: { map: 'alps', airframe: 'quad' }, mode: 'race', craftGate: false, hub: null, firstRun: false,
    lastInput: 'keys', lists: {}, numberFocusWanted: null, inRoom: null, carousel: null, hangar: null, trickPlayer: null,
    ratesFrom: null, pidsFrom: null, fcFrom: null, roomFrom: null, ratesNotice: null, padRearm: false, swapPadPrev: {},
    mapCards: 'x', courseCards: 'x', courseCardKey: 'x', cardSubject: null, lastCardKey: null, newTrackOpen: true,
  });
  ui.items = () => ui.lists[ui.screen] || [];
  const quiet = ['syncChips', 'paintStandings', 'closeDrop', 'renderMapCards', 'renderCourseCards', 'renderTricks', 'renderTitleCards',
    'renderTitleRooms', 'hoverCursor', 'syncCursor', 'select', 'focusNumber', 'restoreFocusRow', 'syncRates', 'syncPids', 'syncFcChrome',
    'stopReels', 'loadLocalCourses', 'loadBoardCourses', 'loadCloudCourses', 'renderHowto', 'noteInteraction', 'syncScoreVisible',
    'act', 'back'];
  for (const n of quiet) ui[n] = (...a) => say(n, ...a);
  ui.setCursor = (i, pointer) => { say('setCursor', i, pointer ?? ''); ui.cursor = i; };
  for (const n of ['makeSliderControl', 'makeNumber', 'makeSearch', 'makeSwitch', 'makeSegments', 'makeDrop', 'makeStepper']) {
    ui[n] = (it, i) => { say(n, it.id || it.label, i); return named('span', `${n}:${it.id || it.label}`, 'row-control'); };
  }
  ui.onGate = () => ui.screen === 'title' && (ui.craftGate || !ui.mode);
  ui.cardScreen = () => ui.screen === 'courses' || ui.screen === 'freestyle' || ui.onGate();
  ui.gateLabel = () => 'GATE-LABEL';
  ui.titleStop = () => { say('titleStop'); return ui.firstStop(ui.items()); };
  ui.onScreenChange = (s) => say('onScreenChange', s);
  Object.assign(ui, extra);
  return ui;
}

function state(ui) {
  return {
    screen: ui.screen, cursor: ui.cursor, rowOffset: ui.rowOffset, focusId: ui.focusId, returnTo: ui.returnTo,
    cursorMemory: ui.cursorMemory, padRearm: ui.padRearm, swapPadPrev: ui.swapPadPrev, numberFocusWanted: ui.numberFocusWanted,
    ratesFrom: ui.ratesFrom, pidsFrom: ui.pidsFrom, fcFrom: ui.fcFrom, roomFrom: ui.roomFrom, ratesNotice: ui.ratesNotice,
    cards: [ui.mapCards, ui.courseCards, ui.courseCardKey, ui.cardSubject, ui.lastCardKey, ui.newTrackOpen],
    menuRows: ui.menuRows.map((r) => show(r)),
    url: location.href,
  };
}

const frame = (ui) => ({
  top: tree(ui.frameTop), bot: tree(ui.frameBot), rootCls: ui.root.cls, rootStyle: ui.root.style.props,
  crumb: tree(ui.crumb), context: tree(ui.frameContext), legend: tree(ui.frameLegend), primary: tree(ui.framePrimary),
});

/* One of every row kind the painter tells apart. */
const ROWS = [
  { section: true, label: 'Flight' },
  { id: 'nav', label: 'Rates', action: 'rates', note: 'n' },
  { id: 'link', label: 'Board', action: 'leaderboard' },
  { id: 'act', label: 'Reset' },
  { id: 'sw', label: 'Air mode', sw: true, adjust: () => {} },
  { id: 'step', label: 'Laps', step: 1, adjust: () => {}, value: '3' },
  { id: 'seg', label: 'Style', options: [{ label: 'A' }, { label: 'B' }], adjust: () => {}, value: 'A' },
  { id: 'drop', label: 'Map', options: Array.from({ length: 8 }, (_, k) => ({ label: `A very long option label ${k}` })), adjust: () => {} },
  { id: 'num', label: 'Rate', num: { text: '670' } },
  { id: 'slider', label: 'Weight', num: { text: '0.6' }, range: { min: 0, max: 1 } },
  { id: 'text', label: 'Search', text: true },
  { id: 'val', label: 'Version', value: 'v1.2' },
  { id: 'info', label: 'Build', value: 'abc123 long value', info: true },
  { id: 'grey', label: 'Fly', disabled: true, primary: true },
  { id: 'go', label: 'Fly now', primary: true, rowClass: 'row-mint' },
  { id: 'skip', label: 'Firmware key', skip: true, note: 'missing' },
  { id: 'spec', label: 'Spec', spec: {}, action: 'rates' },
  { label: 'No id', adjust: () => {} },
];

const scenarios = {
  rows() {
    const ui = makeUi();
    ui.lists.quad = ROWS;
    ui.cursor = 4;
    ui.quadMenu.scrollTop = 120;
    ui.quadMenu.scrollHeight = 900;
    ui.quadMenu.clientHeight = 400;
    ui.renderMenu();
    const out = { menu: tree(ui.quadMenu), first: state(ui), frame: frame(ui) };
    out.kinds = ROWS.map((it) => ui.rowKind(it));
    out.kindOfNothing = ui.rowKind(null);
    out.segments = ROWS.map((it) => ui.fitsAsSegments(it));
    const rows = ui.quadMenu.children.filter((r) => r.cls.includes('row'));
    rows[0].fire('focus');
    rows[4].fire('focus');
    rows[4].fire('focus');
    /* A finger's move is no hover; the mouse's is. */
    rows[3].fire('pointermove', { pointerType: 'touch', clientX: 1, clientY: 2 });
    rows[1].fire('pointermove', { pointerType: 'mouse', clientX: 3, clientY: 4 });
    for (const r of rows) r.fire('click');
    const control = ui.quadMenu.querySelector('row-control');
    control.fire('click');
    rows[2].fire('click', { target: control });
    out.afterEvents = state(ui);
    /* A short list under a tall box: the kept scroll is dropped. */
    ui.quadMenu.scrollTop = 120;
    ui.quadMenu.scrollHeight = 100;
    ui.cursor = 99;
    ui.numberFocusWanted = 7;
    ui.renderMenu();
    out.short = { scrollTop: ui.quadMenu.scrollTop, state: state(ui) };
    ui.cursor = 0;
    ui.renderMenu();
    out.onHeading = state(ui);
    ui.screen = 'nowhere';
    ui.renderMenu();
    out.noHost = state(ui);
    return out;
  },

  bench() {
    const ui = makeUi({ screen: 'fc' });
    ui.lists.fc = [
      { id: 'a', label: 'Setup', rowClass: 'fc-tab' },
      { id: 'save', label: 'Save', rowClass: 'fc-btn' },
      { id: 'b', label: 'Key', skip: true },
      { id: 'exit', label: 'Exit', rowClass: 'fc-btn' },
    ];
    ui.renderMenu();
    const out = { menu: tree(ui.fcMenu), state: state(ui), frame: frame(ui) };
    /* The same rows off the bench stay a list. */
    ui.screen = 'quad';
    ui.lists.quad = ui.lists.fc;
    ui.renderMenu();
    out.offBench = tree(ui.quadMenu);
    return out;
  },

  cards() {
    const out = {};
    const ui = makeUi({ screen: 'courses' });
    ui.lists.courses = [
      { id: 'm1', label: 'Alps', map: {} }, { id: 'c1', label: 'Track', course: { kind: 'map', track: { id: 't1' } } }, { id: 'k', label: 'Card', card: true },
      { id: 'l', label: 'Lobby', lobby: {} }, { id: 'bar', label: 'Barred', bar: true }, { section: true, label: 'Tracks' },
      { id: 'new', label: 'New track' }, { id: 'back', label: 'Back' },
    ];
    ui.cursor = 1;
    ui.renderMenu();
    out.courses = { menu: tree(ui.coursesMenu), state: state(ui), legend: tree(ui.frameLegend) };
    ui.screen = 'freestyle';
    ui.lists.freestyle = ui.lists.courses;
    ui.cursor = 7;
    ui.renderMenu();
    out.freestyle = { menu: tree(ui.freestyleMenu), state: state(ui) };
    ui.screen = 'quad';
    ui.lists.quad = ui.lists.courses;
    ui.renderMenu();
    out.notCards = { menu: tree(ui.quadMenu), state: state(ui) };
    return out;
  },

  title() {
    const out = {};
    const ui = makeUi({ screen: 'title', mode: null, firstRun: true });
    ui.lists.title = [{ id: 'hub-club', label: 'Flight Club', action: 'hub-club', card: true }, { id: 'fly', label: 'Fly', primary: true }, { id: 'gate', label: 'What to fly' }];
    ui.renderMenu();
    out.gate = { screen: tree(ui.screens.title), hint: tree(ui.titleHint), menu: tree(ui.titleMenu), frame: frame(ui), state: state(ui) };
    ui.hub = 'club';
    ui.renderMenu();
    out.hub = { frame: frame(ui), hint: tree(ui.titleHint) };
    ui.mode = 'race';
    ui.hub = null;
    ui.firstRun = false;
    ui.renderMenu();
    out.menu = { screen: tree(ui.screens.title), hint: tree(ui.titleHint), menu: tree(ui.titleMenu), frame: frame(ui), state: state(ui) };
    ui.craftGate = true;
    ui.renderMenu();
    out.craftGate = { screen: tree(ui.screens.title), hint: tree(ui.titleHint), state: state(ui) };
    ui.titleHint.childNodes = [];
    ui.renderMenu();
    out.bareHint = tree(ui.titleHint);
    ui.titleHint = null;
    ui.renderMenu();
    out.noHint = state(ui);
    return out;
  },

  hint() {
    const ui = makeUi();
    const keys = ui.titleHint.children[0];
    ui.setTitleHint(true);
    const out = { gate: tree(ui.titleHint), writes: keys.writes };
    ui.setTitleHint(true);
    out.gateAgain = keys.writes;
    ui.setTitleHint(false);
    out.menu = tree(ui.titleHint);
    out.menuWrites = keys.writes;
    ui.setTitleHint(false);
    out.menuAgain = keys.writes;
    return out;
  },

  lede() {
    const out = {};
    const ui = makeUi({ screen: 'launch' });
    ui.lists.launch = [{ id: 'radio', label: 'Radio link', options: [{ label: 'x' }], adjust: () => {} }, { id: 'fly', label: 'Fly', primary: true }];
    ui.renderMenu();
    out.alps = { lede: ui.launchLede.textContent, state: state(ui), frame: frame(ui) };
    ui.settings.map = 'nowhere';
    ui.renderMenu();
    out.unknownMap = ui.launchLede.textContent;
    ui.launchLede = null;
    ui.renderMenu();
    out.noLede = state(ui);
    ui.screen = 'standings';
    ui.lists.standings = [{ id: 'fly', label: 'Fly this track', primary: true }];
    ui.renderMenu();
    out.standings = { state: state(ui), frame: frame(ui) };
    return out;
  },

  show() {
    const out = {};
    const ui = makeUi({ screen: 'quad', cursor: 1 });
    ui.lists.quad = ROWS;
    ui.lists.rates = [{ id: 'r1', label: 'Roll' }, { id: 'r2', label: 'Pitch' }];
    ui.lists.pids = [{ id: 'p1', label: 'P' }];
    ui.lists.fc = [{ id: 'f1', label: 'Setup' }];
    ui.lists.courses = [{ id: 'c1', label: 'Track', course: { kind: 'map', track: { id: 'c1' } } }, { id: 'back', label: 'Back' }];
    ui.lists.title = [{ id: 'fly', label: 'Fly', primary: true }];
    ui.lists.credits = [{ id: 'back', label: 'Back' }];
    ui.lists.paused = [{ section: true, label: 'Paused' }, { id: 'resume', label: 'Resume', primary: true }];
    ui.lists.howto = [{ id: 'h', label: 'Keys' }];
    ui.lists.tricks = [{ id: 't', label: 'Roll' }];
    ui.lists.friends = [{ id: 'fr', label: 'Rooms' }];
    const displays = () => Object.fromEntries(Object.entries(ui.screens).map(([k, v]) => [k, v.style.props.display ?? null]));
    const snap = (name) => { out[name] = { state: state(ui), displays: displays(), osd: tree(ui.osd), frame: frame(ui) }; };
    ui.ratesNotice = 'old complaint';
    ui.cursor = 4;
    ui.show('rates');
    snap('rates');
    ui.cursor = 1;
    ui.ratesFrom = 'quad';
    ui.show('rates');
    snap('ratesAgain');
    ui.show('quad');
    snap('backToQuad');
    ui.pidsFrom = 'quad';
    ui.show('pids');
    ui.show('fc');
    snap('bench');
    ui.show('pids');
    snap('pidsFromBench');
    ui.show('quad');
    snap('pidsLeft');
    ui.roomFrom = 'freestyle';
    ui.show('courses');
    snap('courses');
    ui.show('freestyle');
    snap('leftCourses');
    ui.show('title');
    snap('title');
    ui.fcFrom = 'paused';
    ui.screen = 'fc';
    ui.show('paused');
    snap('paused');
    ui.show('flight');
    snap('flight');
    ui.show('howto');
    ui.show('tricks');
    snap('tricks');
    return out;
  },

  showCollaborators() {
    const out = {};
    const ui = makeUi({ screen: 'title' });
    ui.lists.title = [{ id: 'fly', label: 'Fly' }];
    ui.lists.friends = [{ id: 'fr', label: 'Rooms' }];
    ui.lists.tricks = [{ id: 't', label: 'Roll' }];
    ui.lists.credits = [{ id: 'back', label: 'Back' }];
    ui.inRoom = () => true;
    ui.show('title');
    out.inRoom = state(ui);
    ui.inRoom = () => false;
    ui.carousel = { isOpen: true, close: () => say('carousel.close') };
    ui.hangar = { isOpen: true, cancel: () => say('hangar.cancel') };
    ui.show('friends');
    ui.show('friends');
    out.pickersClosed = state(ui);
    ui.trickPlayer = { stop: () => say('trickPlayer.stop') };
    ui.trickShown = 'roll';
    ui.show('tricks');
    out.tricks = { trickShown: ui.trickShown, state: state(ui) };
    ui.show('credits');
    out.credits = state(ui);
    ui.onScreenChange = null;
    ui.show('title');
    out.noListener = state(ui);
    ui.screens = {};
    ui.show('title');
    return out;
  },

  hash() {
    const out = {};
    const ui = makeUi({ screen: 'quad' });
    ui.lists.credits = [{ id: 'back', label: 'Back' }];
    ui.lists.title = [{ id: 'fly', label: 'Fly' }];
    setUrl('https://example.test/play/?map=alps#credits');
    ui.show('title');
    out.pinned = state(ui);
    /* Re-entering the pinned screen is not a change: the focus row stays. */
    ui.focusId = 'credits:back';
    ui.show('title');
    out.pinnedAgain = state(ui);
    ui.returnTo = 'quad';
    ui.show('title');
    out.pinnedReturn = state(ui);
    ui.show('quad');
    out.left = state(ui);
    setUrl('https://example.test/play/#other');
    ui.show('credits');
    out.other = state(ui);
    ui.show('title');
    out.otherKept = state(ui);
    setUrl('https://example.test/play/');
    ui.bindLocationHash();
    out.bound = state(ui);
    for (const [hash, screen] of [['#credits', 'quad'], ['#credits', 'flight'], ['#credits', 'paused'], ['#credits', 'credits'], ['', 'credits'], ['#x', 'credits'], ['', 'quad']]) {
      setUrl(`https://example.test/play/${hash}`);
      ui.screen = screen;
      say('hashchange', hash, screen);
      window.handlers.hashchange();
    }
    return out;
  },

  cursor() {
    const out = {};
    const ui = makeUi({ screen: 'pilot' });
    const items = [
      { section: true, label: 'A' }, { id: 'a', label: 'a' }, { id: 'b', label: 'b', skip: true }, { id: 'c', label: 'c' },
      { section: true, label: 'B' }, { id: 'd', label: 'd', skip: true }, { id: 'e', label: 'e', primary: true }, { id: 'f', label: 'f' },
    ];
    ui.lists.pilot = items;
    out.stops = items.map((it) => [ui.isStop(it), ui.isSkip(it)]);
    out.stopsOfNothing = [ui.isStop(null), ui.isSkip(undefined), ui.isStop({ section: false })];
    out.arrowStops = ui.arrowStops(items);
    out.first = [0, 1, 2, 4, 7, 8, -3].map((from) => ui.firstStop(items, from));
    out.firstOfNone = [ui.firstStop([]), ui.firstStop([{ section: true }]), ui.firstStop([{ section: true }, { section: true }], 1)];
    out.primary = ui.primaryItem() && ui.primaryItem().id;
    ui.lists.quad = [{ id: 'x', label: 'x', primary: true, disabled: true }, { id: 'y', label: 'y' }];
    ui.screen = 'quad';
    out.primaryDisabled = ui.primaryItem();
    ui.screen = 'pilot';
    out.restoreFresh = ui.restoreCursor();
    ui.cursorMemory.pilot = 'f';
    out.restoreRemembered = ui.restoreCursor();
    ui.cursorMemory.pilot = 'b';
    out.restoreSkipped = ui.restoreCursor();
    ui.cursorMemory.pilot = 'gone';
    out.restoreGone = ui.restoreCursor();
    ui.cursorMemory.pilot = 'A';
    out.restoreHeading = ui.restoreCursor();
    ui.cursorMemory = {};
    ui.lists.pilot = items.map((it) => ({ ...it, primary: false }));
    out.restoreNoPrimary = ui.restoreCursor();
    ui.lists.pilot = items;
    const walk = (fn, from, dir, times = 1) => {
      ui.cursor = from;
      const path = [];
      for (let k = 0; k < times; k += 1) {
        fn(dir);
        path.push(ui.cursor);
      }
      return path;
    };
    out.moveDown = walk((d) => ui.move(d), 1, 1, 6);
    out.moveUp = walk((d) => ui.move(d), 1, -1, 6);
    out.moveFromSkip = walk((d) => ui.move(d), 2, 1, 2);
    out.moveFromHeading = walk((d) => ui.move(d), 0, -1, 2);
    ui.lists.pilot = [];
    out.moveEmpty = walk((d) => ui.move(d), 3, 1);
    ui.lists.pilot = [{ section: true }, { section: true }];
    out.moveHeadingsOnly = walk((d) => ui.move(d), 0, 1, 2);
    ui.lists.pilot = [{ id: 'k1', skip: true }, { section: true }, { id: 'k2', skip: true }];
    out.arrowStopsAllSkipped = ui.arrowStops(ui.lists.pilot);
    out.moveAllSkipped = walk((d) => ui.move(d), 0, 1, 3);
    ui.lists.pilot = items;
    ui.menuScrollNode = () => { say('menuScrollNode'); return ui.scroller; };
    const sizes = {};
    for (const h of [null, 0, 43, 44, 220, 440, 1100, 2000]) {
      ui.scroller = h === null ? null : { clientHeight: h };
      sizes[String(h)] = ui.pageSize();
    }
    out.pageSizes = sizes;
    ui.scroller = { clientHeight: 220 };
    out.pageDown = walk((d) => ui.pageMove(d), 1, 1, 3);
    out.pageUp = walk((d) => ui.pageMove(d), 7, -1, 3);
    out.pageFromHeading = walk((d) => ui.pageMove(d), 4, 1);
    out.pageFromNowhere = walk((d) => ui.pageMove(d), 99, -1);
    ui.lists.pilot = Array.from({ length: 30 }, (_, k) => ({ id: `r${k}`, label: `r${k}`, skip: k % 2 === 1 }));
    out.pageLong = walk((d) => ui.pageMove(d), 0, 1, 4);
    ui.lists.pilot = items;
    out.end = walk((d) => ui.jumpEdge(d), 3, 1);
    out.home = walk((d) => ui.jumpEdge(d), 3, -1);
    out.homeZero = walk((d) => ui.jumpEdge(d), 3, 0);
    ui.lists.pilot = [{ section: true }];
    out.edgeOfNone = walk((d) => ui.jumpEdge(d), 0, 1);
    out.pageOfNone = walk((d) => ui.pageMove(d), 0, 1);
    return out;
  },

  cardCursor() {
    const out = {};
    const ui = makeUi({ screen: 'courses' });
    const card = (id, kind) => ({ id, label: id, course: { kind, track: { id } } });
    ui.lists.courses = [{ id: 'm', label: 'Alps', map: {} }, card('t1', 'map'), card('t2', 'board'), { id: 'back', label: 'Back' }];
    out.noSubject = ui.subjectCard();
    out.noLast = ui.cardCursor();
    ui.cardSubject = courseCardKey(ui.lists.courses[2]);
    ui.lastCardKey = courseCardKey(ui.lists.courses[1]);
    out.subject = ui.subjectCard() && ui.subjectCard().id;
    out.last = ui.cardCursor();
    ui.cardSubject = 'nope';
    ui.lastCardKey = 'nope';
    out.subjectGone = ui.subjectCard();
    out.lastGone = ui.cardCursor();
    return out;
  },

  legend() {
    const out = {};
    const ui = makeUi();
    ui.lists.quad = ROWS;
    ui.lists.title = [{ id: 'fly', label: 'Fly' }];
    ui.lists.courses = [{ id: 'c', label: 'c', course: { kind: 'map', track: { id: 'c' } } }];
    const cases = {
      quadAction: { screen: 'quad', cursor: 3 }, quadValue: { screen: 'quad', cursor: 5 }, quadOff: { screen: 'quad', cursor: 99 },
      cards: { screen: 'courses', cursor: 0 }, titleMenu: { screen: 'title', mode: 'race', hub: null },
      titleGate: { screen: 'title', mode: null, hub: null }, titleHub: { screen: 'title', mode: null, hub: 'club' },
      flight: { screen: 'flight' }, bench: { screen: 'fc' },
    };
    for (const [name, c] of Object.entries(cases)) {
      for (const input of ['keys', 'pad', 'none']) {
        for (const points of [0, 5]) {
          Object.assign(ui, { mode: 'race', hub: null, cursor: 0 }, c);
          ui.lastInput = input;
          touchPoints = points;
          out[`${name}/${input}/${points}`] = ui.legendFor();
        }
      }
    }
    touchPoints = 0;
    return out;
  },

  chips() {
    const out = {};
    const ui = makeUi();
    out.quad = ui.contextChips();
    store.set('webfpv.pilot.name', '  Ace Pilot ');
    out.named = ui.contextChips();
    ui.settings.map = 'nowhere';
    out.unknownMap = ui.contextChips();
    for (const s of ['flight', 'fc']) {
      ui.screen = s;
      out[s] = ui.contextChips();
    }
    store.clear();
    return out;
  },

  frame() {
    const out = {};
    const ui = makeUi();
    ui.lists.quad = ROWS;
    ui.lists.title = [{ id: 'fly', label: 'Fly', primary: true }];
    for (const s of [...MENU_SCREENS, 'rooms', 'roomnew', 'flight', 'calibrate', 'unknown']) {
      ui.screen = s;
      ui.mode = 'race';
      ui.hub = null;
      ui.lastInput = 'keys';
      ui.syncFrame();
      out[s] = frame(ui);
    }
    ui.screen = 'title';
    ui.mode = null;
    ui.hub = 'club';
    ui.lastInput = 'pad';
    ui.syncFrame();
    out.hub = frame(ui);
    ui.hub = 'nowhere';
    ui.syncFrame();
    out.hubUnknown = frame(ui);
    ui.screen = 'quad';
    ui.syncFrame();
    const act = ui.frameLegend.all().find((n) => n.cls.includes('legend-act'));
    out.legendButton = act ? show(act) : null;
    ui.screen = 'title';
    ui.syncFrame();
    const back = ui.frameLegend.all().find((n) => n.cls.includes('legend-act'));
    if (back) back.fire('click');
    out.afterClick = frame(ui);
    return out;
  },

  statics() {
    const out = {};
    const node = named('span', 'node');
    Ui.text(null, 'x');
    Ui.klass(null, 'x');
    Ui.bar(null, 0.5);
    const values = ['a', 'a', '', null, undefined, 0, 0, '0', false, 'b'];
    const texts = [];
    for (const v of values) { Ui.text(node, v); texts.push([node.textContent, node.writes]); }
    out.text = texts;
    const cls = named('span', 'cls');
    const classes = [];
    for (const v of ['hud', 'hud', 'hud dim', null, '', undefined, 1, 'hud']) { Ui.klass(cls, v); classes.push([cls.cls, cls.writes]); }
    out.klass = classes;
    const bar = named('i', 'bar');
    const widths = [];
    for (const v of [0.5, 0.5, 0.50004, 0.5006, 1.2, -1, 0, 0.0004, 0.12345, 0.99999, NaN]) { Ui.bar(bar, v); widths.push([bar.style.width, bar.writes]); }
    out.bar = widths;
    return out;
  },
};

function runAll() {
  const out = {};
  for (const [name, fn] of Object.entries(scenarios)) {
    log = [];
    BODY.childNodes = [];
    setUrl('https://example.test/');
    window.handlers = {};
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
