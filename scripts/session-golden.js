/*
 * session-golden.js: the Ui's session rows (Ghost, Live, Fly with friends,
 * the room's seat rows and the war lobby), the chips and bars that float
 * over the world, the music dock, the tutorial column and the small
 * predicates, held to a record taken from the methods as they stood inside
 * the Ui class. The Ui constructor is held the same way: the fields a fresh
 * Ui owns, in order, with their values, for several stored profiles and
 * links, and what the closures it wires do when driven.
 *
 *     node scripts/session-golden.js            compare
 *     node scripts/session-golden.js --record   write tests/fixtures/session-golden.json
 *
 * The methods are called on an object made from Ui.prototype, so the same
 * script reads them wherever they are installed from. A stand-in document
 * keeps every element built: tag, class, properties, dataset, style,
 * listeners, text and children in order, and counts the writes to its
 * text, so a guard that skips an equal write is pinned as well as the
 * text it would have written. The constructor runs on a subclass whose
 * build(), show() and a few collaborators only write down that they were
 * called, so what is recorded is the constructor's own work. English and
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
const FILE = join(root, 'tests', 'fixtures', 'session-golden.json');
const RECORD = process.argv.includes('--record');

/* ---- the stand-in page ---- */

const PROPS = ['hidden', 'type', 'title', 'tabIndex', 'value', 'disabled'];

class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.className = '';
    this.childNodes = [];
    this.parent = null;
    this.attrs = [];
    this.dataset = {};
    this.style = {};
    this.listeners = [];
    this.textWrites = 0;
  }

  append(...nodes) {
    for (const n of nodes) {
      if (n instanceof FakeElement) {
        n.remove();
        n.parent = this;
      }
      this.childNodes.push(n);
    }
  }

  before(...nodes) {
    this.append(...nodes);
  }

  remove() {
    if (!this.parent) return;
    const kids = this.parent.childNodes;
    kids.splice(kids.indexOf(this), 1);
    this.parent = null;
  }

  setAttribute(k, v) { this.attrs.push([k, String(v)]); }

  set textContent(t) {
    this.textWrites += 1;
    for (const c of this.childNodes) if (c instanceof FakeElement) c.parent = null;
    this.childNodes = t === '' ? [] : [String(t)];
  }

  get textContent() {
    return this.childNodes.map((c) => (typeof c === 'string' ? c : c.textContent)).join('');
  }

  get classList() {
    const node = this;
    const list = () => node.className.split(/\s+/).filter(Boolean);
    const write = (l) => { node.className = l.join(' '); };
    return {
      contains: (c) => list().includes(c),
      add: (c) => { if (!list().includes(c)) write([...list(), c]); },
      remove: (c) => write(list().filter((x) => x !== c)),
      toggle: (c, force) => {
        const on = force === undefined ? !list().includes(c) : Boolean(force);
        write(on ? (list().includes(c) ? list() : [...list(), c]) : list().filter((x) => x !== c));
        return on;
      },
    };
  }

  addEventListener(type, fn, opts) {
    const capture = typeof opts === 'boolean' ? opts : Boolean(opts && opts.capture);
    this.listeners.push({ type, fn, capture });
  }

  contains(node) {
    for (let n = node; n; n = n.parent) if (n === this) return true;
    return false;
  }

  closest() { return null; }
}
for (const p of PROPS) {
  Object.defineProperty(FakeElement.prototype, p, {
    get() { return this[`_${p}`]; },
    set(v) { this[`_${p}`] = v; },
  });
}

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};
globalThis.document = { createElement: (tag) => new FakeElement(tag) };
const windowListeners = [];
globalThis.window = {
  location: { href: 'https://example.test/', search: '', hash: '', hostname: 'paraguayandronecombatsimulator.com', origin: 'https://example.test' },
  innerWidth: 1600,
  innerHeight: 900,
  devicePixelRatio: 2,
  addEventListener(type, fn, opts) {
    const capture = typeof opts === 'boolean' ? opts : Boolean(opts && opts.capture);
    windowListeners.push({ type, fn, capture });
  },
};
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'Mozilla/5.0 (golden) Stand-in/1.0', language: 'en' },
  configurable: true,
  writable: true,
});
Object.defineProperty(globalThis, 'performance', { value: { now: () => 1000 }, configurable: true, writable: true });

const { Ui } = await import('../src/ui/ui.js');
const { DEFAULTS: LIVE_DEFAULTS, SETTINGS_KEY } = await import('../src/ui/settings.js');
/* loadSettings hands out DEFAULTS' own objects where nothing is stored, so
 * a Ui that then edits its progress edits the defaults for the next one.
 * The methods are given a copy taken before any constructor ran. */
const DEFAULTS = structuredClone(LIVE_DEFAULTS);
const { ACCOUNT_KEY } = await import('../src/share/pilot.js');
const { writeShareImport } = await import('../src/share/session.js');
const { useLocale } = await import('../src/strings/index.js');

const MAP_TRACK = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'map-track-v4.json'), 'utf8'));

/* ---- recording ---- */

function tree(node) {
  if (typeof node === 'string') return node;
  const out = { tag: node.tagName };
  if (node.className) out.cls = node.className;
  if (node.attrs.length) out.attrs = node.attrs;
  if (Object.keys(node.dataset).length) out.dataset = { ...node.dataset };
  const style = Object.fromEntries(Object.entries(node.style).filter(([, v]) => v !== '' && v != null));
  if (Object.keys(style).length) out.style = style;
  for (const p of PROPS) if (node[`_${p}`] !== undefined && node[`_${p}`] !== '') out[p] = node[`_${p}`];
  if (node.listeners.length) {
    out.on = [...new Set(node.listeners.map((l) => `${l.type}${l.capture ? '!' : ''}`))].sort();
  }
  if (node.textWrites) out.writes = node.textWrites;
  if (node.childNodes.length) out.children = node.childNodes.map(tree);
  return out;
}

/* A row as the menu would read it: every value, and the name of every
 * function it carries, so a handler that goes missing is a difference. */
function item(it) {
  const out = {};
  for (const [k, v] of Object.entries(it)) out[k] = typeof v === 'function' ? 'fn' : v;
  return out;
}

const el = (tag, cls) => {
  const n = new FakeElement(tag);
  if (cls) n.className = cls;
  return n;
};

/* The Ui the session methods see: every element they write and every
 * collaborator they call, the latter writing down the call. */
function makeUi(extra = {}) {
  const ui = Object.create(Ui.prototype);
  const calls = [];
  const dialog = el('div', 'name-dialog');
  dialog.hidden = true;
  const screens = { friends: el('section', 'screen screen-friends'), title: el('section', 'screen') };
  const stick = () => ({ nub: el('div', 'osd-nub') });
  Object.assign(ui, {
    calls,
    root: el('div', 'ui'),
    settings: structuredClone(DEFAULTS),
    screen: 'title',
    nameDialog: dialog,
    screens,
    warLobbyEl: el('div', 'war-lobby'),
    warLobbyOn: false,
    warLobbyKey: null,
    roomBar: el('div', 'update-bar room-bar'),
    roomBarText: el('span'),
    roomBarButton: el('button', 'update-reload'),
    roomBarView: null,
    roomBarKey: undefined,
    bugChip: el('button', 'bug-chip'),
    pauseChip: el('button', 'bug-chip pause-chip'),
    swapChip: el('button', 'bug-chip swap-chip'),
    signinChip: el('button', 'bug-chip signin-chip'),
    signinPanel: el('div', 'signin-panel'),
    updateBar: el('div', 'update-bar'),
    updateReady: false,
    updateReload: el('button', 'update-reload'),
    barStopCount: 0,
    musicDock: el('div', 'music-dock'),
    musicTitle: el('button', 'music-title'),
    musicNow: { id: 'bed1', name: 'Menu bed one', selection: 'rotation', index: 0, context: 'menu' },
    warState: undefined,
    howtoKeys: el('dl', 'howto-keys'),
    howtoTabs: { keyboard: el('button'), radio: el('button'), touch: el('button'), mouse: el('button'), launch: el('button') },
    howtoLive: el('p', 'howto-live'),
    howtoMode: el('p', 'howto-mode'),
    howtoSource: 'keyboard',
    howtoStickLeft: stick(),
    howtoStickRight: stick(),
    craftCaption: el('p', 'craft-caption'),
    cursor: 0,
    cursorMemory: {},
    craftGate: true,
    mode: null,
    share: null,
    timePosted: null,
    ghostRow: null,
    liveRow: null,
    onHotSwap: null,
    onMusicSkip: null,
    onSettings: null,
    stops: [],
    rows: [],
    renderMenu() { calls.push('renderMenu'); },
    setCursor(i) { calls.push(`setCursor:${i}`); this.cursor = i; },
    firstStop(items) { calls.push(`firstStop:${items.length}`); return 0; },
    restoreCursor() { calls.push('restoreCursor'); return 7; },
    syncCursor(scroll) { calls.push(`syncCursor:${scroll}`); },
    markBars(items) { calls.push(`markBars:${items.length}`); },
    isStop(it) { return !it.heading; },
    items() { calls.push('items'); return [...this.rows, ...this.stops]; },
    barStops() { return this.stops; },
    announce(text) { calls.push(`announce:${text}`); },
    openCraftRow(midRun) { calls.push(`openCraftRow:${midRun}`); },
    writeSettings() { calls.push('writeSettings'); },
  }, extra);
  ui.root.append(...[dialog, ui.musicDock, ui.bugChip].filter(Boolean));
  if (ui.musicDock) ui.musicDock.append(ui.musicTitle);
  if (ui.roomBar) ui.roomBar.append(ui.roomBarText, ui.roomBarButton);
  return ui;
}

/* What the chips, bars and dock look like right now. */
function chrome(ui) {
  const look = (n) => {
    if (!n) return null;
    const out = { hidden: n.hidden, cls: n.className, text: n.textContent };
    if (n.title) out.title = n.title;
    if (Object.keys(n.dataset).length) out.dataset = { ...n.dataset };
    if (n.textWrites) out.writes = n.textWrites;
    return out;
  };
  return {
    bug: look(ui.bugChip),
    pause: look(ui.pauseChip),
    swap: look(ui.swapChip),
    signin: look(ui.signinChip),
    panel: look(ui.signinPanel),
    roomBar: look(ui.roomBar),
    roomBarText: look(ui.roomBarText),
    roomBarButton: look(ui.roomBarButton),
    updateBar: look(ui.updateBar),
    dock: look(ui.musicDock),
    dockTitle: look(ui.musicTitle),
    root: ui.root.className,
    cursor: ui.cursor,
    barStopCount: ui.barStopCount,
    roomBarKey: ui.roomBarKey,
    roomBarView: ui.roomBarView,
    calls: ui.calls.splice(0),
  };
}

const SCREENS = ['title', 'courses', 'results', 'paused', 'friends', 'flight', 'calibrate', 'padpick', 'howto', 'menu'];

/* ---- scenarios: the methods ---- */

const scenarios = {
  setShare() {
    const out = {};
    for (const screen of SCREENS) {
      for (const share of [{ id: 's1', name: 'Loop', author: 'Ace', board: 'b' }, null, undefined]) {
        const ui = makeUi({ screen, timePosted: { ok: true } });
        ui.setShare(share);
        out[`${screen}:${share === undefined ? 'undefined' : JSON.stringify(share)}`] = { share: ui.share, timePosted: ui.timePosted, calls: ui.calls.splice(0) };
      }
    }
    return out;
  },

  ghostAndLive() {
    const out = {};
    for (const which of ['Ghost', 'Live']) {
      for (const screen of SCREENS) {
        const cycled = [];
        const row = { value: `${which} value`, note: `${which} note`, cycle: (d) => cycled.push(d) };
        const ui = makeUi({ screen });
        ui[`set${which}Row`](row);
        const items = ui[`${which.toLowerCase()}Items`]();
        for (const it of items) {
          it.adjust(1);
          it.adjust(-1);
        }
        const withRow = { field: ui[`${which.toLowerCase()}Row`], items: items.map(item), cycled: [...cycled], calls: ui.calls.splice(0) };
        ui[`set${which}Row`](undefined);
        for (const it of items) it.adjust(1);
        const without = { field: ui[`${which.toLowerCase()}Row`], items: ui[`${which.toLowerCase()}Items`](), cycledAfter: [...cycled], calls: ui.calls.splice(0) };
        out[`${which}:${screen}`] = { withRow, without };
      }
    }
    return out;
  },

  friendsItems() {
    const out = {};
    const rows = {
      none: undefined,
      null: () => null,
      plain: () => ({ value: 'Open', note: 'Make a room' }),
      inRoom: () => ({ value: 'Room 7', note: 'Three pilots', inRoom: true }),
    };
    for (const [name, friendsRow] of Object.entries(rows)) {
      const ui = makeUi({ friendsRow });
      out[name] = ui.friendsItems().map(item);
    }
    return out;
  },

  setWarLobby() {
    const out = {};
    const pilots = [
      { name: 'Ace', ready: true, me: true, host: true, aircraft: 'Interceptor' },
      { name: 'Bo', ready: false, me: false, host: false, aircraft: 'Cub' },
      { name: 'Cy', ready: true, me: false, host: false, aircraft: 'Zagi' },
      { name: 'Di', ready: false, me: true, host: true, aircraft: 'F-16' },
    ];
    const views = {
      waiting: { mission: 'Dam run', pilots, countdown: null, deadline: null, last: null, brief: null },
      countdown: { mission: 'Dam run', pilots, countdown: 5, deadline: 90, last: null, brief: null },
      countdownZero: { mission: 'Dam run', pilots: [], countdown: 0, deadline: null, last: null, brief: null },
      deadlineShort: { mission: 'Dam run', pilots, countdown: null, deadline: 5, last: null, brief: null },
      deadlineMinute: { mission: 'Dam run', pilots, countdown: null, deadline: 65, last: null, brief: null },
      deadlineHour: { mission: 'Dam run', pilots, countdown: null, deadline: 3600, last: null, brief: null },
      lastWon: { mission: 'Dam run', pilots, countdown: null, deadline: null, last: { state: 'won', stars: 2, kills: 3 }, brief: null },
      lastLostNoStars: { mission: 'Dam run', pilots, countdown: null, deadline: null, last: { state: 'lost', kills: 0 }, brief: null },
      briefFull: {
        mission: 'Dam run', pilots, countdown: null, deadline: 30, last: null,
        brief: { line: 'Hold the dam.', objectives: ['Reach the wall', 'Mark the gun'], facts: [{ label: 'Where', value: 'Itaipu' }, { label: 'When', value: 'Dawn' }] },
      },
      briefBare: { mission: 'Dam run', pilots: [], countdown: null, deadline: null, last: null, brief: { line: '', objectives: [], facts: [] } },
    };
    for (const screen of ['friends', 'title']) {
      for (const [name, v] of Object.entries(views)) {
        const ui = makeUi({ screen, rows: [{ heading: true, label: 'h' }, { label: 'Fly' }] });
        ui.setWarLobby(v);
        const first = { on: ui.warLobbyOn, key: ui.warLobbyKey, hidden: ui.warLobbyEl.hidden, friendsCls: ui.screens.friends.className, tree: tree(ui.warLobbyEl), calls: ui.calls.splice(0) };
        ui.setWarLobby({ ...v });
        const again = { key: ui.warLobbyKey, writes: ui.warLobbyEl.textWrites, calls: ui.calls.splice(0) };
        ui.setWarLobby({ ...v, mission: 'Other' });
        const changed = { key: ui.warLobbyKey, writes: ui.warLobbyEl.textWrites, text: ui.warLobbyEl.textContent, calls: ui.calls.splice(0) };
        ui.setWarLobby(null);
        const off = { on: ui.warLobbyOn, key: ui.warLobbyKey, hidden: ui.warLobbyEl.hidden, friendsCls: ui.screens.friends.className, writes: ui.warLobbyEl.textWrites, calls: ui.calls.splice(0) };
        ui.setWarLobby(undefined);
        const offAgain = { on: ui.warLobbyOn, hidden: ui.warLobbyEl.hidden, calls: ui.calls.splice(0) };
        out[`${screen}:${name}`] = { first, again, changed, off, offAgain };
      }
    }
    return out;
  },

  roomSeatRows() {
    const out = {};
    const seats = {
      defaults: {},
      alps: { freestyleMap: 'alps', map: 'alps' },
      swiss: { freestyleMap: 'swiss2', map: 'track' },
      unknown: { freestyleMap: 'nowhere', map: 'track' },
      plane: { airframe: 'cub1400' },
    };
    for (const [name, patch] of Object.entries(seats)) {
      for (const inRoom of [true, false]) {
        for (const shown of ['none', 'war']) {
          const ui = makeUi(shown === 'war' ? { craftShown: (s) => `war-of-${s.airframe}` } : {});
          Object.assign(ui.settings, patch);
          const rows = ui.roomSeatRows(inRoom);
          const drove = [];
          for (const r of rows) {
            if (r.open) { r.open(); drove.push({ open: ui.calls.splice(0) }); }
            if (r.adjust) {
              r.adjust(1);
              drove.push({ adjust: 1, freestyleMap: ui.settings.freestyleMap, map: ui.settings.map });
              r.adjust(-1);
              drove.push({ adjust: -1, freestyleMap: ui.settings.freestyleMap, map: ui.settings.map });
            }
            if (r.pick) {
              r.pick('itaipu');
              drove.push({ pick: 'itaipu', freestyleMap: ui.settings.freestyleMap, map: ui.settings.map });
              r.pick('track');
              drove.push({ pick: 'track', freestyleMap: ui.settings.freestyleMap, map: ui.settings.map });
            }
          }
          out[`${name}:${inRoom ? 'in' : 'out'}:${shown}`] = { rows: rows.map(item), drove, calls: ui.calls.splice(0) };
        }
      }
    }
    return out;
  },

  refreshFriends() {
    const out = {};
    const rows = { none: undefined, null: () => null, out: () => ({ value: 'v', note: 'n' }), in: () => ({ value: 'v', note: 'n', inRoom: true }) };
    for (const [name, friendsRow] of Object.entries(rows)) {
      for (const screen of ['title', 'paused', 'friends', 'rooms', 'roomnew', 'flight', 'results']) {
        for (const was of [false, true]) {
          const ui = makeUi({ screen, friendsRow, friendsInRoom: was, cursorMemory: { friends: 'Make', title: 'Fly' } });
          ui.refreshFriends();
          out[`${name}:${screen}:${was ? 'was' : 'new'}`] = {
            inRoom: ui.friendsInRoom, friendsCls: ui.screens.friends.className, cursorMemory: ui.cursorMemory, cursor: ui.cursor, calls: ui.calls.splice(0),
          };
        }
      }
    }
    {
      const ui = makeUi({ screen: 'friends', friendsRow: () => ({ inRoom: true }), screens: undefined });
      ui.refreshFriends();
      out.noScreens = { inRoom: ui.friendsInRoom, calls: ui.calls.splice(0) };
    }
    return out;
  },

  markTimePosted() {
    const out = {};
    for (const screen of SCREENS) {
      for (const posted of [undefined, null, { ok: false, error: 'late' }, { ok: true, rank: 3 }]) {
        const ui = makeUi({ screen });
        ui.markTimePosted(posted);
        out[`${screen}:${JSON.stringify(posted) ?? 'undefined'}`] = { timePosted: ui.timePosted, calls: ui.calls.splice(0) };
      }
    }
    return out;
  },

  setRoomBar() {
    const out = {};
    const steps = [
      ['fly', { text: 'Fly, the others are', button: 'Fly', act: 'fly' }],
      ['same', { text: 'Fly, the others are', button: 'Fly', act: 'fly' }],
      ['textOnly', { text: 'Alone in the room' }],
      ['textOnlyAgain', { text: 'Alone in the room', button: '' }],
      ['reload', { text: 'Too old a build', button: 'Reload', reload: true }],
      ['null', null],
      ['nullAgain', undefined],
      ['back', { text: 'Fly, the others are', button: 'Fly' }],
    ];
    for (const screen of ['title', 'flight', 'friends']) {
      const ui = makeUi({ screen, updateReady: true, rows: [{ label: 'a' }, { label: 'b' }] });
      ui.cursor = 1;
      const seq = [];
      for (const [name, view] of steps) {
        ui.stops = view && view.button ? [{ bar: 'room' }] : [];
        ui.setRoomBar(view);
        seq.push({ name, ...chrome(ui) });
      }
      out[screen] = seq;
    }
    return out;
  },

  syncChips() {
    const out = {};
    const accounts = {
      none: null,
      noCallsign: { session: 'tok' },
      ace: { session: 'tok', callsign: 'ace pilot' },
      emoji: { session: 'tok', callsign: '\u{1F600}man' },
      noSession: { callsign: 'ghost' },
    };
    for (const screen of ['title', 'flight', 'paused', 'friends', 'calibrate']) {
      for (const [acc, record] of Object.entries(accounts)) {
        for (const dialogOpen of [false, true]) {
          for (const hot of [false, true]) {
            store.clear();
            if (record) store.set(ACCOUNT_KEY, JSON.stringify(record));
            const ui = makeUi({ screen, onHotSwap: hot ? () => {} : null, updateReady: true });
            ui.nameDialog.hidden = !dialogOpen;
            ui.syncChips();
            out[`${screen}:${acc}:${dialogOpen ? 'dialog' : 'clear'}:${hot ? 'hot' : 'cold'}`] = chrome(ui);
          }
        }
      }
    }
    store.clear();
    /* The bars and the cursor they take with them. */
    const bars = {};
    const cases = {
      updateOnly: { updateReady: true, view: null },
      roomPlain: { updateReady: true, view: { text: 'Alone' } },
      roomButton: { updateReady: true, view: { text: 'Fly', button: 'Fly' } },
      roomReload: { updateReady: true, view: { text: 'Old', button: 'Reload', reload: true } },
      roomReloadNoUpdate: { updateReady: false, view: { text: 'Old', button: 'Reload', reload: true } },
      nothing: { updateReady: false, view: null },
    };
    for (const [name, want] of Object.entries(cases)) {
      for (const screen of ['title', 'flight']) {
        for (const [stopsName, stops] of Object.entries({ no: [], one: [{ bar: 'update', label: 'Reload' }], two: [{ bar: 'update' }, { bar: 'room' }] })) {
          for (const [rowsName, rows] of Object.entries({ short: [{ label: 'only' }], tail: [{ label: 'a' }, { heading: true }, { heading: true }], headings: [{ heading: true }, { heading: true }] })) {
            for (const cursor of [0, 2, 5]) {
              for (const count of [0, 1]) {
                const ui = makeUi({ screen, updateReady: want.updateReady, roomBarView: want.view, stops, rows, barStopCount: count });
                ui.cursor = cursor;
                ui.syncChips();
                const c = chrome(ui);
                bars[`${name}:${screen}:${stopsName}:${rowsName}:c${cursor}:n${count}`] = {
                  cursor: c.cursor, count: c.barStopCount, update: c.updateBar.hidden, room: c.roomBar.hidden, dockCls: c.dock.cls, calls: c.calls,
                };
              }
            }
          }
        }
      }
    }
    out.bars = bars;
    {
      const ui = makeUi({ bugChip: null, pauseChip: null, swapChip: null, signinChip: null, signinPanel: null, roomBar: null, updateBar: null, musicDock: null, screen: 'menu' });
      ui.syncChips();
      out.bare = chrome(ui);
    }
    return out;
  },

  flying() {
    const ui = makeUi();
    const out = {};
    for (const screen of SCREENS) {
      ui.screen = screen;
      out[screen] = { flying: ui.flying(), modal: ui.isModal() };
    }
    return out;
  },

  skipMusic() {
    const out = {};
    for (const [name, hook] of Object.entries({ fn: 'fn', null: null, string: 'nope', undefined })) {
      const got = [];
      const ui = makeUi({ onMusicSkip: hook === 'fn' ? (d) => got.push(d) : hook });
      ui.skipMusic(1);
      ui.skipMusic(-1);
      out[name] = got;
    }
    return out;
  },

  toggleMusicMute() {
    const out = {};
    for (const [name, start] of Object.entries({ five: 5, two: 2, zero: 0, zeroWithMemory: 0 })) {
      for (const hook of [true, false]) {
        store.clear();
        const given = [];
        const ui = makeUi({ onSettings: hook ? (s) => given.push(s.musicLevel) : null, screen: 'paused' });
        ui.settings.musicLevel = start;
        if (name === 'zeroWithMemory') ui.musicLevelWas = 3;
        const seq = [];
        for (let i = 0; i < 3; i += 1) {
          ui.toggleMusicMute();
          seq.push({ level: ui.settings.musicLevel, was: ui.musicLevelWas, given: [...given], stored: JSON.parse(store.get(SETTINGS_KEY)).musicLevel, dock: chrome(ui).dock, title: ui.musicTitle.title, calls: ui.calls.splice(0) });
        }
        out[`${name}:${hook ? 'hook' : 'nohook'}`] = seq;
      }
    }
    store.clear();
    return out;
  },

  setMusicNow() {
    const out = {};
    const ui = makeUi();
    ui.setMusicNow(null);
    out.null = { now: ui.musicNow, dock: chrome(ui).dockTitle };
    ui.setMusicNow({ id: 'f1', name: 'Flight crate', selection: 'f1', index: 2, context: 'flight' });
    out.set = { now: ui.musicNow, dock: chrome(ui).dockTitle };
    ui.setMusicNow({ id: '', name: '' });
    out.empty = { now: ui.musicNow, dock: chrome(ui).dock };
    ui.setMusicNow(undefined);
    out.undefined = { now: ui.musicNow };
    return out;
  },

  setWarState() {
    const ui = makeUi();
    const seq = [];
    for (const state of ['lobby', 'lobby', 'briefing', 'briefing', 'flying', 'end', 'lobby', undefined, null, 'lobby']) {
      ui.setWarState(state);
      seq.push({ state: ui.warState, root: ui.root.className, dock: ui.musicDock.hidden, calls: ui.calls.splice(0) });
    }
    return seq;
  },

  syncMusicDock() {
    const out = {};
    const nows = { named: { name: 'Bed' }, unnamed: { name: '' }, null: null };
    for (const screen of ['title', 'flight', 'paused', 'calibrate', 'padpick', 'menu']) {
      for (const [nowName, now] of Object.entries(nows)) {
        for (const dialogOpen of [false, true]) {
          for (const sound of [true, false]) {
            for (const level of [5, 0]) {
              for (const war of [undefined, 'lobby', 'open']) {
                const ui = makeUi({ screen, musicNow: now, warState: war });
                ui.nameDialog.hidden = !dialogOpen;
                ui.settings.sound = sound;
                ui.settings.musicLevel = level;
                ui.syncMusicDock();
                const c = chrome(ui);
                out[`${screen}:${nowName}:${dialogOpen ? 'dialog' : 'clear'}:${sound ? 'sound' : 'silent'}:${level}:${war}`] = { dock: c.dock, title: c.dockTitle };
              }
            }
          }
        }
      }
    }
    const ui = makeUi({ musicDock: null });
    ui.syncMusicDock();
    out.noDock = { title: chrome(ui).dockTitle };
    return out;
  },

  renderHowto() {
    const out = {};
    for (const source of ['keyboard', 'radio', 'touch', 'mouse', 'launch', 'bogus', undefined]) {
      for (const mode of [1, 2, 3, 4, 9]) {
        const ui = makeUi({ howtoSource: source });
        ui.settings.stickMode = mode;
        ui.renderHowto();
        out[`${source}:${mode}`] = {
          keys: tree(ui.howtoKeys),
          tabs: Object.fromEntries(Object.entries(ui.howtoTabs).map(([k, b]) => [k, b.className])),
          live: ui.howtoLive.textContent,
          mode: ui.howtoMode.textContent,
        };
      }
    }
    const ui = makeUi({ howtoKeys: null });
    ui.renderHowto();
    out.noKeys = { live: ui.howtoLive.textContent, tabs: ui.howtoTabs.keyboard.className };
    return out;
  },

  setHowtoSticks() {
    const out = {};
    const chans = { centre: { throttle: 0.5, pitch: 0, roll: 0, yaw: 0 }, corner: { throttle: 1, pitch: -1, roll: 1, yaw: -1 }, over: { throttle: 2, pitch: 3, roll: -4, yaw: 5 } };
    for (const screen of ['howto', 'title']) {
      for (const mode of [1, 2, 3, 4]) {
        for (const [name, ch] of Object.entries(chans)) {
          const ui = makeUi({ screen });
          ui.settings.stickMode = mode;
          ui.setHowtoSticks(ch);
          out[`${screen}:${mode}:${name}`] = { left: ui.howtoStickLeft.nub.style, right: ui.howtoStickRight.nub.style };
        }
      }
    }
    const ui = makeUi({ screen: 'howto', howtoStickLeft: null });
    ui.setHowtoSticks(chans.corner);
    out.noStick = ui.howtoStickRight.nub.style;
    return out;
  },

  setCraftCaption() {
    const ui = makeUi();
    const seq = [];
    for (const text of ['Interceptor', 'Interceptor', '', null, undefined, 42, 'Cub']) {
      ui.setCraftCaption(text);
      seq.push({ text: ui.craftCaption.textContent, writes: ui.craftCaption.textWrites });
    }
    const bare = makeUi({ craftCaption: null });
    bare.setCraftCaption('x');
    return seq;
  },

  seatCraft() {
    const out = {};
    const quad = { ...MAP_TRACK, id: 'doc1' };
    const docs = {
      null: null,
      fits: quad,
      notMap: { ...quad, map: 'nowhere' },
      old: { ...quad, schemaVersion: 3 },
    };
    for (const airframe of ['interceptor', 'cub1400', 'sky1800', 'bramor2300']) {
      for (const [name, doc] of Object.entries(docs)) {
        const ui = makeUi();
        ui.settings.airframe = airframe;
        ui.settings.airframeAsked = false;
        const got = ui.seatCraftForDoc(doc);
        out[`doc:${airframe}:${name}`] = { got: got ? got.id : got, airframe: ui.settings.airframe, asked: ui.settings.airframeAsked, calls: ui.calls.splice(0) };
      }
      for (const map of ['track', 'alps']) {
        for (const seated of [false, true]) {
          store.clear();
          const ui = makeUi();
          ui.settings.airframe = airframe;
          ui.settings.map = map;
          ui.settings.airframeAsked = false;
          store.set(SETTINGS_KEY, JSON.stringify(ui.settings));
          if (seated) writeShareImport({ id: 'share1', name: 'Loop', document: quad });
          const got = ui.seatCraftForCourse();
          out[`course:${airframe}:${map}:${seated ? 'seated' : 'empty'}`] = { got: got ? got.id : got, airframe: ui.settings.airframe, asked: ui.settings.airframeAsked, calls: ui.calls.splice(0) };
        }
      }
    }
    store.clear();
    return out;
  },

  gate() {
    const out = { label: makeUi().gateLabel() };
    for (const screen of ['title', 'courses', 'freestyle', 'paused', 'menu']) {
      for (const craftGate of [true, false]) {
        for (const mode of [null, 'race', 'freestyle']) {
          const ui = makeUi({ screen, craftGate, mode });
          out[`${screen}:${craftGate}:${mode}`] = { onGate: ui.onGate(), card: ui.cardScreen() };
        }
      }
    }
    return out;
  },
};

/* ---- scenarios: the constructor ---- */

/* A Ui whose page is never built: the methods the constructor hands off to
 * only write down the call, so what is left is the constructor's own work. */
class Probe extends Ui {
  build() { this.calls.push('build'); this.carousel = { isOpen: false }; this.hangar = { isOpen: false }; }

  show(s) { this.calls.push(`show:${s}`); }

  act(a) { this.calls.push(`act:${a}`); }

  back() { this.calls.push('back'); }

  renderMenu() { this.calls.push('renderMenu'); }

  loadLocalCourses() { this.calls.push('loadLocalCourses'); }

  renderCourseCards() { this.calls.push('renderCourseCards'); }

  closeDrop() { this.calls.push('closeDrop'); }
}
/* The log lives on the prototype so the constructor can push to it before
 * any own field exists, and so it is not an own property of the record. */
Probe.prototype.calls = null;

function fieldValue(v) {
  if (typeof v === 'function') return 'fn';
  if (v && typeof v === 'object' && v.constructor && v.constructor.name === 'FcSession') {
    const out = { kind: 'FcSession' };
    for (const k of Object.keys(v)) out[k] = typeof v[k] === 'function' ? 'fn' : v[k];
    return out;
  }
  if (v instanceof FakeElement) return { element: v.className };
  return v === undefined ? 'undefined' : v;
}

function construct(search, hash, seed) {
  store.clear();
  windowListeners.length = 0;
  for (const [k, v] of Object.entries(seed)) store.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  window.location.search = search;
  window.location.hash = hash;
  window.location.href = `https://example.test/${search}${hash}`;
  const rootEl = el('div', 'ui');
  Probe.prototype.calls = [];
  const ui = new Probe(rootEl);
  const calls = ui.calls;
  const fields = {};
  /* Copied now: the closures driven below write into settings. */
  for (const k of Object.getOwnPropertyNames(ui)) fields[k] = JSON.parse(JSON.stringify(fieldValue(ui[k])));
  const out = {
    fields,
    calls: calls.splice(0),
    windowOn: windowListeners.map((l) => `${l.type}${l.capture ? '!' : ''}`),
    rootOn: rootEl.listeners.map((l) => `${l.type}${l.capture ? '!' : ''}`),
    store: Object.fromEntries(store),
  };
  /* The closures, driven. */
  const drive = {};
  const given = [];
  ui.onFcAngle = (on) => given.push(['angle', on]);
  ui.onSettings = (s) => given.push(['settings', s.launchControl]);
  ui.onFcMotor = (m, d) => given.push(['motor', m, d]);
  drive.flightMode0 = ui.fc.getFlightMode();
  ui.fc.setFlightMode(1);
  drive.flightMode1 = [ui.fc.getFlightMode(), ui.settings.flightMode, JSON.parse(store.get(SETTINGS_KEY)).flightMode, calls.splice(0)];
  ui.fc.setFlightMode(0);
  drive.flightMode2 = [ui.fc.getFlightMode(), ui.settings.flightMode, calls.splice(0)];
  drive.launch0 = ui.fc.getLaunchControl();
  ui.fc.setLaunchControl('yes');
  drive.launch1 = [ui.fc.getLaunchControl(), ui.settings.launchControl, JSON.parse(store.get(SETTINGS_KEY)).launchControl, calls.splice(0)];
  ui.fc.setLaunchControl(0);
  drive.launch2 = [ui.fc.getLaunchControl(), calls.splice(0)];
  ui.onFcAngle = null;
  ui.onSettings = null;
  ui.fc.setFlightMode(1);
  ui.fc.setLaunchControl(1);
  drive.noHooks = calls.splice(0);
  drive.motorAllowed = [];
  for (const [run, from] of [[false, null], [true, null], [false, 'paused'], [true, 'paused'], [false, 'settings']]) {
    ui.fc.runActive = run;
    ui.fcFrom = from;
    drive.motorAllowed.push(ui.fc.motorTestAllowed());
  }
  ui.fc.onMotorTest(2, 0.4);
  ui.onFcMotor = null;
  ui.fc.onMotorTest(1, 0.1);
  drive.given = given;
  const key = (code) => {
    const e = { code, prevented: false, preventDefault() { this.prevented = true; } };
    for (const l of windowListeners) if (l.type === 'keydown') l.fn(e);
    return e.prevented;
  };
  drive.tab = {};
  for (const [name, patch] of Object.entries({ title: {}, flight: { screen: 'flight' }, carousel: { carousel: { isOpen: true } }, hangar: { hangar: { isOpen: true } } })) {
    const was = { screen: ui.screen, carousel: ui.carousel, hangar: ui.hangar };
    Object.assign(ui, patch);
    drive.tab[name] = [key('Tab'), key('Enter')];
    Object.assign(ui, was);
  }
  const sync = () => {
    for (const l of windowListeners) if (l.type === 'webfpv-tracks-sync') l.fn({});
    return calls.splice(0);
  };
  drive.sync = { title: sync() };
  ui.screen = 'courses';
  drive.sync.courses = sync();
  ui.screen = 'title';
  const mouse = (target) => {
    for (const l of rootEl.listeners) if (l.type === 'mousedown') l.fn({ target });
    return calls.splice(0);
  };
  const inside = el('span');
  const outside = el('span');
  drive.mouse = { noDrop: mouse(outside) };
  ui.dropEl = el('div', 'drop');
  ui.dropEl.append(inside);
  drive.mouse.inside = mouse(inside);
  drive.mouse.outside = mouse(outside);
  out.drive = drive;
  return out;
}

async function constructorScenarios() {
  const out = {};
  const seeds = {
    fresh: {},
    visited: { 'webfpv.best.track': '1' },
    returning: { [SETTINGS_KEY]: { ...DEFAULTS, airframe: 'cub1400', airframeAsked: true, musicTrack: 'rotation', musicLevel: 0, flightMode: 'angle', launchControl: true } },
    whoop: { [SETTINGS_KEY]: { ...DEFAULTS, airframe: 'whoop65', airframeAsked: true } },
    unasked: { [SETTINGS_KEY]: { ...DEFAULTS, airframe: 'cub1400', airframeAsked: false } },
  };
  const links = ['', '?map=alps', '?map=track', '?map=nope', '?share=abc', '?ghost=g1&map=alps', '?craft=cub1400', '?craft=bogus', '?craft=wing1000', '?craft=cub1400&map=track'];
  /* The first variant is written in full; every other one as what differs
   * from it, so a field that moves or changes value in one variant reads
   * as that variant's line. */
  let base = null;
  for (const [seedName, seed] of Object.entries(seeds)) {
    for (const search of links) {
      for (const hash of ['', '#credits', '#other']) {
        if (hash && seedName !== 'fresh' && seedName !== 'returning') continue;
        const got = construct(search, hash, seed);
        const name = `${seedName}:${search || 'nolink'}:${hash || 'nohash'}`;
        if (!base) {
          base = got;
          out[name] = got;
          continue;
        }
        const delta = {};
        for (const k of Object.keys({ ...base, ...got })) {
          if (k === 'fields') continue;
          if (JSON.stringify(base[k]) !== JSON.stringify(got[k])) delta[k] = got[k];
        }
        const fields = {};
        for (const k of Object.keys({ ...base.fields, ...got.fields })) {
          if (JSON.stringify(base.fields[k]) !== JSON.stringify(got.fields[k])) fields[k] = k in got.fields ? got.fields[k] : 'MISSING';
        }
        if (Object.keys(fields).length) delta.fields = fields;
        delta.order = Object.keys(got.fields).join(',') === Object.keys(base.fields).join(',') ? 'same' : Object.keys(got.fields);
        out[name] = delta;
      }
    }
  }
  store.clear();
  window.location.search = '';
  window.location.hash = '';
  return out;
}

async function runAll() {
  const out = {};
  for (const [name, fn] of Object.entries(scenarios)) {
    store.clear();
    /* A scenario that cannot finish has changed: written down as the
     * error so it differs from the record by name instead of ending the run. */
    try {
      out[name] = await fn();
    } catch (e) {
      out[name] = { threw: String(e && e.stack) };
    }
  }
  try {
    out.constructor = await constructorScenarios();
  } catch (e) {
    out.constructor = { threw: String(e && e.stack) };
  }
  return JSON.parse(JSON.stringify(out));
}

const got = { en: await runAll() };
await useLocale('es');
got.es = await runAll();

if (RECORD) {
  const lines = [];
  for (const [lang, scen] of Object.entries(got)) {
    const rows = Object.entries(scen).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
    lines.push(` ${JSON.stringify(lang)}: {\n${rows.join(',\n')}\n }`);
  }
  writeFileSync(FILE, `{\n${lines.join(',\n')}\n}\n`);
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
    if (JSON.stringify(want[lang][k]) !== JSON.stringify(got[lang][k])) {
      const w = want[lang][k] || {};
      const g = got[lang][k] || {};
      const keys = Object.keys({ ...w, ...g }).filter((x) => JSON.stringify(w[x]) !== JSON.stringify(g[x]));
      bad.push(`${lang}.${k} (${keys.slice(0, 4).join(', ')}${keys.length > 4 ? ', ...' : ''})`);
    }
  }
}
if (bad.length) {
  console.log(`FAIL ${bad.length} scenario(s) differ: ${bad.join('; ')}`);
  process.exit(1);
}
console.log(`ok ${Object.keys(scenarios).length + 1} session scenarios x 2 locales equal to the record`);
