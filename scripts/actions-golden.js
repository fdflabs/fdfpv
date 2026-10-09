/*
 * actions-golden.js: what every menu action, Back and Enter does, held to
 * a record taken from the Ui methods as they stood inside the class
 * (act, back, select, the hub cards, seatMap, flown, seatMatchesMode, and
 * the chosen card's rows: openBuilder, actOnCard, duplicateCard,
 * storeCardChange, openBoardCourse).
 *
 *     node scripts/actions-golden.js            compare
 *     node scripts/actions-golden.js --record   write tests/fixtures/actions-golden.json
 *
 * The methods are called on an object made from Ui.prototype, so the same
 * script reads them wherever they are installed from. Everything the
 * methods reach outside their own range (the screens, the menu, the
 * dialogs, the shell's on* hooks, the window, the board) is a recorder:
 * each scenario sets the shell up in one state, presses one thing, and
 * writes down what was called in what order, which screen it ended on
 * and which fields of the Ui and of storage changed.
 *
 * Three sweeps: act() with every action name the shell dispatches, in
 * every state; back() from every state; select() over a row of every
 * kind, in the states where the kind means something.
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
const FILE = join(root, 'tests', 'fixtures', 'actions-golden.json');
const RECORD = process.argv.includes('--record');

/* ---- the stand-in page ---- */

class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.className = '';
    this.childNodes = [];
    this.listeners = [];
    this.dataset = {};
    this.style = {};
    this.scrollTop = 0;
  }

  append(...nodes) { this.childNodes.push(...nodes); }

  appendChild(node) { this.childNodes.push(node); return node; }

  remove() {}

  setAttribute() {}

  addEventListener(type, fn) { this.listeners.push({ type, fn }); }

  removeEventListener() {}

  click() { page.push(['click', this.tagName.toLowerCase(), this.download || '']); }

  set textContent(t) { this.childNodes = t === '' ? [] : [String(t)]; }

  get textContent() { return this.childNodes.map((c) => (typeof c === 'string' ? c : c.textContent)).join(''); }

  get classList() {
    const node = this;
    const list = () => node.className.split(/\s+/).filter(Boolean);
    return {
      contains: (c) => list().includes(c),
      add: (c) => { if (!list().includes(c)) node.className = [...list(), c].join(' '); },
      remove: (c) => { node.className = list().filter((x) => x !== c).join(' '); },
      toggle: (c, force) => {
        const on = force === undefined ? !list().includes(c) : Boolean(force);
        node.className = (on ? [...new Set([...list(), c])] : list().filter((x) => x !== c)).join(' ');
        return on;
      },
    };
  }
}

/* What went to the window: tabs opened, reloads, the hash, downloads,
 * and what was reported to the console. */
const page = [];
console.error = (e) => page.push(['console.error', String(e && e.message || e)]);

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};
globalThis.document = {
  createElement: (tag) => new FakeElement(tag),
  body: new FakeElement('body'),
  activeElement: null,
};
globalThis.window = {
  location: {
    href: 'http://localhost:8080/?map=track#credits', search: '', hash: '#credits', hostname: 'localhost', origin: 'http://localhost:8080',
    reload() { page.push(['reload']); },
  },
  innerWidth: 1600,
  innerHeight: 900,
  devicePixelRatio: 2,
  open(url, name) { page.push(['open', url, name]); return { focus() { page.push(['focus']); } }; },
  addEventListener() {},
  dispatchEvent() {},
  localStorage: globalThis.localStorage,
  top: null,
  self: null,
};
window.top = window;
window.self = window;
globalThis.history = { replaceState(state, title, url) { page.push(['replaceState', String(url)]); } };
globalThis.Event = class { constructor(type) { this.type = type; } };
globalThis.Blob = class { constructor(parts, opts) { this.text = parts.join(''); this.type = opts && opts.type; } };
globalThis.URL.createObjectURL = (blob) => { page.push(['blob', blob.type, blob.text.length]); return 'blob:golden'; };
globalThis.URL.revokeObjectURL = () => {};
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'Mozilla/5.0 (golden) Stand-in/1.0', language: 'en' },
  configurable: true,
  writable: true,
});
Object.defineProperty(globalThis, 'performance', { value: { now: () => 1000 }, configurable: true, writable: true });
/* Ids and stamps are minted from these; held still so a copy of a track
 * is the same copy every run. */
Math.random = () => 0.5;
const FIXED_MS = Date.UTC(2026, 9, 7, 12, 0, 0);
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [FIXED_MS])); }

  static now() { return FIXED_MS; }
};

/* The board, asked for a track's document: answers with one, or refuses
 * when the scenario says the network is down. */
let boardDown = false;
globalThis.fetch = async (url) => {
  page.push(['fetch', String(url).replace(/^https?:\/\/[^/]+/, '')]);
  if (boardDown) throw new Error('board offline');
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({ document: boardDoc }),
    text: async () => JSON.stringify({ document: boardDoc }),
  };
};

const { Ui } = await import('../src/ui/ui.js');
const { DEFAULTS, SETTINGS_KEY } = await import('../src/ui/settings.js');
const { WAYS } = await import('../src/ui/ways.js');
const { onSignInNeeded } = await import('../src/share/account.js');
const { writeShareImport } = await import('../src/share/session.js');
const { saveTrack } = await import('../src/trackbuilder/storage.js');
const { saveRatePreset } = await import('../configs/ratepresets.js');
const { mapTrackDocument } = await import('../tests/lib/maptrack.js');
const { useLocale } = await import('../src/strings/index.js');

useLocale('en');

const boardDoc = mapTrackDocument({ id: 'trk-board0001', name: 'Board ring', gates: 3 });
const localDoc = mapTrackDocument({ id: 'trk-local0001', name: 'My ring', gates: 3 });

/* ---- the stand-in Ui ---- */

/* Fields whose value after the press is written down when it changed. */
const STATE_KEYS = [
  'screen', 'mode', 'craftGate', 'hub', 'returnTo', 'roomFrom', 'ratesFrom', 'pidsFrom', 'fcFrom', 'roomGame',
  'cardSubject', 'lastCardKey', 'newTrackOpen', 'guided', 'firstRun', 'openingBoardCourse', 'ratesNotice', 'cursor',
  'standingsFor', 'lobbyCard', 'dropEl',
];
const SETTINGS_KEYS = ['airframe', 'airframeAsked', 'map', 'freestyleMap', 'cameraFov', 'cameraAngle', 'tune', 'ratesSplitPitch'];
const FC_KEYS = ['confirm', 'exitAfterSave', 'search', 'presetId'];

const plain = (a) => (a === null || ['string', 'number', 'boolean', 'undefined'].includes(typeof a) ? a
  : Array.isArray(a) ? `array:${a.length}` : typeof a === 'function' ? 'fn' : a.name || a.id || typeof a);

function makeUi(state) {
  const ui = Object.create(Ui.prototype);
  const calls = [];
  const log = (name, ...args) => calls.push([name, ...args.map(plain)]);
  const recorder = (name, ret) => function rec(...args) { log(name, ...args); return typeof ret === 'function' ? ret.call(this, ...args) : ret; };
  const settings = structuredClone(DEFAULTS);
  const dialogAnswer = state.answer ?? 'yes';
  const fc = {
    confirm: null, exitAfterSave: false, search: null, presetId: 'bf', runActive: false, draft: { name: 'draft' },
    isDirty: false,
    dirty() { log('fc.dirty'); return this.isDirty; },
    stopMotors: recorder('fc.stopMotors'),
    discard: recorder('fc.discard'),
    exportText: recorder('fc.exportText', 'set x = 1\n'),
    applyPreset: recorder('fc.applyPreset', () => Promise.resolve()),
  };
  Object.assign(ui, {
    calls,
    settings,
    fc,
    screen: 'title',
    mode: null,
    craftGate: true,
    hub: null,
    returnTo: 'title',
    roomFrom: null,
    ratesFrom: null,
    pidsFrom: null,
    fcFrom: null,
    roomGame: null,
    cardSubject: null,
    lastCardKey: null,
    newTrackOpen: false,
    guided: false,
    firstRun: false,
    openingBoardCourse: false,
    ratesNotice: null,
    cursor: 0,
    rowOffset: 0,
    standingsFor: null,
    standingsTimes: [],
    lobbyCard: null,
    dropEl: null,
    share: null,
    boardCourses: [],
    padPickPhase: null,
    padPickReason: null,
    boardNote: new FakeElement('p'),
    localNote: new FakeElement('p'),
    fcMenu: new FakeElement('div'),
    roomBarView: { act: recorder('roomBarView.act') },
    rows: [],
    items() { return this.rows; },
    show: recorder('show', function show(s) { this.screen = s; }),
    renderMenu: recorder('renderMenu'),
    renderCourseCards: recorder('renderCourseCards'),
    setCursor: recorder('setCursor', function setCursor(i) { this.cursor = i; }),
    subjectCard: recorder('subjectCard', function subjectCard() { return this.card || null; }),
    cardCursor: recorder('cardCursor', 3),
    leaveFc: recorder('leaveFc'),
    showStandings: recorder('showStandings'),
    seatLocal: recorder('seatLocal', (id) => id === 'trk-local0001'),
    seatCloud: recorder('seatCloud', (t, then) => then()),
    seatCraftForCourse: recorder('seatCraftForCourse'),
    play: recorder('play'),
    openSwap: recorder('openSwap'),
    openCraftRow: recorder('openCraftRow'),
    openHangar: recorder('openHangar', (id, then) => then()),
    wornBuild: recorder('wornBuild', null),
    openBugReport: recorder('openBugReport'),
    openFeelReport: recorder('openFeelReport'),
    pickForWay: recorder('pickForWay'),
    openDropForCursor: recorder('openDropForCursor'),
    focusNumber: recorder('focusNumber'),
    adjust: recorder('adjust'),
    closeDrop: recorder('closeDrop'),
    loadLocalCourses: recorder('loadLocalCourses'),
    loadCloudCourses: recorder('loadCloudCourses'),
    editCloudCopy: recorder('editCloudCopy'),
    setShare: recorder('setShare'),
    writeSettings: recorder('writeSettings'),
    askForm: recorder('askForm', (o) => Promise.resolve(dialogAnswer === 'yes' ? { name: `${o.fields[0].value} 2` } : null)),
    askConfirm: recorder('askConfirm', () => Promise.resolve(dialogAnswer === 'yes')),
    askRatePresetName: recorder('askRatePresetName', (v) => Promise.resolve(dialogAnswer === 'yes' ? v || 'Fresh preset' : '')),
    onAction: recorder('onAction'),
    onSettings: recorder('onSettings'),
    onUiSound: recorder('onUiSound'),
    onBuild: recorder('onBuild', () => (state.buildFails ? Promise.reject(new Error('gone')) : Promise.resolve())),
    onBoardCourse: recorder('onBoardCourse', () => (state.board === 'throws' ? Promise.reject(new Error('timeout')) : Promise.resolve(state.board !== 'refuses'))),
    onTrackChosen: recorder('onTrackChosen', Boolean(state.trackChosen)),
    onStandingsGhost: recorder('onStandingsGhost'),
    onLobbyBack: recorder('onLobbyBack'),
    onFriends: recorder('onFriends'),
    onFcOpen: recorder('onFcOpen'),
    onFcSave: recorder('onFcSave'),
    inRoom: recorder('inRoom', Boolean(state.inRoom)),
    inLobby: recorder('inLobby', Boolean(state.inLobby)),
  });
  /* Hooks the shell leaves unset in some states. */
  for (const k of state.without || []) ui[k] = null;
  return ui;
}

function snapshot(ui) {
  const out = {};
  for (const k of STATE_KEYS) out[k] = plain(ui[k]);
  for (const k of SETTINGS_KEYS) out[`settings.${k}`] = ui.settings[k];
  for (const k of FC_KEYS) out[`fc.${k}`] = ui.fc[k];
  out.boardNote = ui.boardNote.textContent;
  out.localNote = ui.localNote.textContent;
  out.fcMenuScroll = ui.fcMenu.scrollTop;
  for (const [k, v] of store) {
    const fields = jsonObject(v);
    if (fields) {
      for (const [f, fv] of Object.entries(fields)) out[`store.${k}.${f}`] = short(JSON.stringify(fv));
    } else {
      out[`store.${k}`] = short(v);
    }
  }
  return out;
}

/* A stored JSON object is written down field by field, so a step's record
 * names the fields it changed. A hash of the whole blob changed in every
 * step that saved settings whenever any pull request added a setting, and
 * two such pull requests, each green, made main red together
 * (docs/GOLDENS.md). */
function jsonObject(text) {
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch (e) {
    return null;
  }
}

/* A long value is written down by size and hash, without a page of JSON
 * per step. */
function short(text) {
  return text.length > 80 ? `${text.length} chars, hash ${hash(text)}` : text;
}

function hash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

function changed(before, after) {
  const out = {};
  for (const k of Object.keys(after)) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) out[k] = after[k];
  }
  /* A field a step removed (a deleted track in the stored library) is a
   * change too. */
  for (const k of Object.keys(before)) {
    if (!(k in after)) out[k] = '(removed)';
  }
  return out;
}

const flush = async () => { for (let i = 0; i < 4; i += 1) await new Promise((r) => setImmediate(r)); };

/* ---- states ---- */

const localCard = { course: { kind: 'local', track: { id: 'trk-local0001', name: 'My ring', map: 'swiss2' } } };
const boardCard = { course: { kind: 'board', track: { id: 'trk-board0001', name: 'Board ring', map: 'swiss2', board: 'https://board.test' } } };
const cloudCard = { course: { kind: 'cloud', track: { id: 'cld-1', name: 'Cloud ring', map: 'swiss2' } } };

/* Storage before the press. A seated race track is a share import with
 * gates; the library holds the pilot's own ring. */
function seedStore(state) {
  store.clear();
  if (state.seat === 'track') {
    writeShareImport({ id: 'trk-board0001', name: 'Board ring', board: 'https://board.test', document: boardDoc });
  }
  if (state.library !== false) {
    saveTrack(structuredClone(localDoc));
  }
  if (state.preset) {
    saveRatePreset('Mine', structuredClone(DEFAULTS.rates));
  }
  if (state.visitor) {
    store.set('webfpv.tracks.origin', 'https://tracks.test');
  }
  store.set(SETTINGS_KEY, JSON.stringify(DEFAULTS));
}

const STATES = {
  'gate-home': { screen: 'title', craftGate: true, mode: null },
  'gate-hub-club': { screen: 'title', craftGate: true, mode: null, hub: 'club' },
  'gate-hub-hangar': { screen: 'title', craftGate: true, mode: null, hub: 'hangar', lobbyCard: 'way-combat' },
  'gate-visitor': { screen: 'title', craftGate: true, mode: null, visitor: true },
  'title-race': { screen: 'title', craftGate: false, mode: 'race', settings: { map: 'track', airframeAsked: true }, seat: 'track' },
  'title-race-noseat': { screen: 'title', craftGate: false, mode: 'race', settings: { map: 'track', airframeAsked: true } },
  'title-freestyle': { screen: 'title', craftGate: false, mode: 'freestyle', settings: { map: 'swiss2', freestyleMap: 'swiss2', airframe: 'bramor2300', cameraAngle: 45 } },
  'title-freestyle-itaipu': { screen: 'title', craftGate: false, mode: 'freestyle', settings: { map: 'itaipu', freestyleMap: 'itaipu' } },
  'title-freestyle-noseat': { screen: 'title', craftGate: false, mode: 'freestyle', settings: { map: 'track', freestyleMap: 'alps' } },
  'title-firstrun': { screen: 'title', craftGate: false, mode: 'race', firstRun: true, settings: { map: 'track' }, seat: 'track' },
  paused: { screen: 'paused', craftGate: false, mode: 'race', returnTo: 'paused', settings: { map: 'track' }, seat: 'track' },
  'paused-freestyle': { screen: 'paused', craftGate: false, mode: 'freestyle', returnTo: 'paused', settings: { map: 'swiss2', freestyleMap: 'swiss2' } },
  /* Paused by Escape in flight: nothing set returnTo on the way in. */
  'paused-by-escape': { screen: 'paused', craftGate: false, mode: 'race', returnTo: 'title', settings: { map: 'track' }, seat: 'track' },
  quick: { screen: 'quick', craftGate: false, mode: 'race', returnTo: 'paused', settings: { map: 'track' }, seat: 'track' },
  'rates-from-quick': { screen: 'rates', mode: 'race', craftGate: false, returnTo: 'paused', ratesFrom: 'quick' },
  'pids-from-quick': { screen: 'pids', mode: 'race', craftGate: false, returnTo: 'paused', pidsFrom: 'quick' },
  courses: { screen: 'courses', mode: 'race', craftGate: false, settings: { map: 'track' } },
  'courses-local': { screen: 'courses', mode: 'race', craftGate: false, cardSubject: 'local:trk-local0001', card: localCard, settings: { map: 'track' } },
  'courses-local-chosen': { screen: 'courses', mode: 'race', craftGate: false, cardSubject: 'local:trk-local0001', card: localCard, trackChosen: true },
  'courses-local-no': { screen: 'courses', mode: 'race', craftGate: false, cardSubject: 'local:trk-local0001', card: localCard, answer: 'no' },
  'courses-local-seated': { screen: 'courses', mode: 'race', craftGate: false, cardSubject: 'local:trk-local0001', card: localCard, seatLocalId: 'trk-local0001' },
  'courses-board': { screen: 'courses', mode: 'race', craftGate: false, cardSubject: 'board:trk-board0001', card: boardCard, boardCourses: [boardCard.course.track] },
  'courses-board-refused': { screen: 'courses', mode: 'race', craftGate: false, cardSubject: 'board:trk-board0001', card: boardCard, boardCourses: [boardCard.course.track], board: 'refuses', boardDown: true },
  'courses-board-throws': { screen: 'courses', mode: 'race', craftGate: false, cardSubject: 'board:trk-board0001', card: boardCard, boardCourses: [boardCard.course.track], board: 'throws' },
  'courses-board-nohook': { screen: 'courses', mode: 'race', craftGate: false, cardSubject: 'board:trk-board0001', card: boardCard, boardCourses: [boardCard.course.track], without: ['onBoardCourse'] },
  'courses-cloud': { screen: 'courses', mode: 'race', craftGate: false, cardSubject: 'cloud:cld-1', card: cloudCard },
  'courses-local-buildfails': { screen: 'courses', mode: 'race', craftGate: false, cardSubject: 'local:trk-local0001', card: localCard, buildFails: true },
  'courses-stale': { screen: 'courses', mode: 'race', craftGate: false, cardSubject: 'local:gone', card: null, buildFails: true },
  freestyle: { screen: 'freestyle', mode: 'freestyle', craftGate: false, settings: { map: 'swiss2' } },
  'friends-out': { screen: 'friends', mode: 'freestyle', craftGate: false },
  'friends-room': { screen: 'friends', mode: 'freestyle', craftGate: false, inRoom: true },
  'friends-lobby': { screen: 'friends', mode: 'freestyle', craftGate: false, inRoom: true, inLobby: true },
  'friends-room-paused': { screen: 'friends', mode: 'freestyle', craftGate: false, inRoom: true, returnTo: 'paused' },
  'friends-from-courses': { screen: 'friends', mode: 'race', craftGate: false, roomFrom: 'courses' },
  rooms: { screen: 'rooms', mode: 'freestyle', craftGate: false },
  roomnew: { screen: 'roomnew', mode: 'freestyle', craftGate: false },
  'fc-clean': { screen: 'fc', mode: 'race', craftGate: false, fcFrom: 'quad' },
  'fc-dirty': { screen: 'fc', mode: 'race', craftGate: false, fcDirty: true },
  'fc-dirty-run': { screen: 'fc', mode: 'race', craftGate: false, fcDirty: true, fcRun: true },
  'fc-search': { screen: 'fc', mode: 'race', craftGate: false, fcDirty: true, fcSearch: 'pid' },
  'fc-confirm': { screen: 'fc', mode: 'race', craftGate: false, fcDirty: true, fcConfirm: 'leave' },
  quad: { screen: 'quad', mode: 'race', craftGate: false },
  pilot: { screen: 'pilot', mode: 'race', craftGate: false, settings: { tune: 'karate' } },
  'rates-from-pilot': { screen: 'rates', mode: 'race', craftGate: false, ratesFrom: 'pilot' },
  'rates-plain': { screen: 'rates', mode: 'race', craftGate: false, answer: 'no' },
  'rates-preset': { screen: 'rates', mode: 'race', craftGate: false, preset: true },
  'rates-preset-no': { screen: 'rates', mode: 'race', craftGate: false, preset: true, answer: 'no' },
  'pids-from-quad': { screen: 'pids', mode: 'race', craftGate: false, pidsFrom: 'quad' },
  'pids-plain': { screen: 'pids', mode: 'race', craftGate: false },
  standings: { screen: 'standings', mode: 'race', craftGate: false, standingsFor: boardCard.course.track, standingsTimes: [{ id: 'lap-1', hasGhost: false }, { id: 'lap-2', hasGhost: true }], boardCourses: [boardCard.course.track] },
  'standings-noghost': { screen: 'standings', mode: 'race', craftGate: false, standingsFor: boardCard.course.track, standingsTimes: [{ id: 'lap-1' }] },
  'standings-empty': { screen: 'standings', mode: 'race', craftGate: false },
  'padpick-confirm': { screen: 'padpick', padPickPhase: 'confirm', padPickReason: 'menu' },
  'padpick-menu': { screen: 'padpick', padPickPhase: 'ask', padPickReason: 'menu' },
  'padpick-boot': { screen: 'padpick', padPickPhase: 'ask', padPickReason: 'boot' },
  credits: { screen: 'credits', mode: 'race', craftGate: false },
  results: { screen: 'results', mode: 'race', craftGate: false, settings: { map: 'track' }, seat: 'track' },
  flight: { screen: 'flight', mode: 'race', craftGate: false },
  calibrate: { screen: 'calibrate', mode: 'race', craftGate: false },
  howto: { screen: 'howto', mode: 'race', craftGate: false },
  launch: { screen: 'launch', mode: 'race', craftGate: false, settings: { map: 'track' }, seat: 'track' },
  tricks: { screen: 'tricks', mode: 'freestyle', craftGate: false },
  'drop-open': { screen: 'pilot', mode: 'race', craftGate: false, dropEl: 'drop' },
};

function setUp(name) {
  const state = STATES[name];
  seedStore(state);
  boardDown = Boolean(state.boardDown);
  const ui = makeUi(state);
  for (const k of ['screen', 'craftGate', 'mode', 'hub', 'returnTo', 'roomFrom', 'ratesFrom', 'pidsFrom', 'fcFrom', 'cardSubject', 'card',
    'firstRun', 'standingsFor', 'standingsTimes', 'boardCourses', 'padPickPhase', 'padPickReason', 'lobbyCard', 'dropEl']) {
    if (k in state) ui[k] = state[k];
  }
  Object.assign(ui.settings, state.settings || {});
  if (state.fcDirty) ui.fc.isDirty = true;
  if (state.fcRun) ui.fc.runActive = true;
  if (state.fcSearch) ui.fc.search = state.fcSearch;
  if (state.fcConfirm) ui.fc.confirm = state.fcConfirm;
  if (state.seat === 'track') ui.share = { board: 'https://board.test' };
  return ui;
}

/* ---- the sweeps ---- */

/* Every action name a row, a card, a button or the shell dispatches, with
 * one example of each prefixed family. */
const ACTIONS = [
  'update-reload', 'room-bar', 'hotswap', 'hangar-aircraft', 'customise', 'leaderboard', 'reportbug', 'feel', 'firstflight',
  'card-back', 'card-standings', 'card-board', 'card-fly', 'card-edit', 'card-duplicate', 'card-rename', 'card-delete', 'card-editcopy',
  'standings', 'standings-fly', 'standings-ghost', 'cloud-more', 'newtrack', 'newtrack-back', 'newtrack:swiss2', 'casualtrack:alps',
  ...WAYS.map((w) => w.action),
  'friends-leave', 'friends-join', 'lobby:rooms', 'lobby:roomnew', 'rooms', 'roomnew',
  'howto', 'pilot', 'quad', 'courses', 'freestyle', 'credits', 'tricks', 'friends',
  'fly', 'launch-go', 'rates', 'pids', 'fc', 'fc-save', 'fc-save-exit', 'fc-save-restart', 'fc-wait', 'fc-motors-stop', 'fc-preset:bf',
  'fc-keep-editing', 'fc-discard-leave', 'fc-discard', 'fc-export', 'fc-back', 'pids-default', 'rates-default', 'rates-save', 'rates-delete',
  'map:alps', 'map:track', 'back', 'mode-gate', 'mytracks', 'title', 'paused', 'quick',
  'pause', 'restart', 'resume', 'postrun', 'posttime', 'noop', 'setname', 'choosepad', 'downloadflightlog', 'exportkey', 'importkey',
  'trackbuilder', 'remix', 'editown', 'race', 'calibrate', 'calibrate-cancel', 'calibrate-save', 'padpick-yes', 'padpick-no', 'padpick-cancel',
  'padpick-skip', 'accountsignin', 'accountsignout', 'hub-club', 'hub-hangar', 'nosuchaction',
];

/* The sign in gate (a visitor on a loopback host plays; a tracks origin
 * in storage with no account does not): what it parks is run once a sign
 * in lands, so the parked press is recorded as a second step, signed in. */
let parkedResume = null;
onSignInNeeded((resume) => { parkedResume = resume; });

async function press(ui, fn) {
  const before = snapshot(ui);
  page.length = 0;
  parkedResume = null;
  let error = null;
  try {
    fn();
    await flush();
  } catch (e) {
    error = String(e && e.message || e);
  }
  const step = { calls: ui.calls.splice(0), changed: changed(before, snapshot(ui)) };
  if (page.length) step.page = page.splice(0);
  if (error) step.error = error;
  if (parkedResume) {
    step.parked = true;
    store.delete('webfpv.tracks.origin');
    step.resumed = await press(ui, parkedResume);
  }
  return step;
}

async function actSweep() {
  const out = {};
  for (const name of Object.keys(STATES)) {
    out[name] = {};
    for (const action of ACTIONS) {
      const ui = setUp(name);
      out[name][action] = await press(ui, () => ui.act(action));
    }
    /* A card answered with an aircraft, and the rooms panel's way in. */
    for (const w of WAYS) {
      const ui = setUp(name);
      out[name][`${w.action} picked:cub`] = await press(ui, () => ui.act(w.action, 'cub'));
      const ui2 = setUp(name);
      out[name][`${w.action} keepWorld`] = await press(ui2, () => ui2.act(w.action, null, { keepWorld: true }));
    }
  }
  return out;
}

async function backSweep() {
  const out = {};
  for (const name of Object.keys(STATES)) {
    const ui = setUp(name);
    out[name] = await press(ui, () => ui.back());
  }
  return out;
}

/* One row of every kind select() tells apart. */
const ROWS = [
  { section: true, label: 'Heading' },
  { label: 'Info', info: true, action: 'noop' },
  { label: 'Disabled', disabled: true, action: 'fly' },
  { label: 'Typed', num: true, value: 3, action: 'noop' },
  { label: 'Switch', sw: true, flip: null, action: 'noop' },
  { label: 'Switch flipping', sw: true, flip: 'flip', action: 'noop' },
  { label: 'Long list', options: [{ label: 'one' }, { label: 'two' }, { label: 'three' }, { label: 'four' }, { label: 'five' }, { label: 'six' }, { label: 'seven' }, { label: 'eight' }], action: 'noop' },
  { label: 'Pick only', options: [{ label: 'a' }, { label: 'b' }], pickOnly: true, action: 'noop' },
  { label: 'Segmented', options: [{ label: 'a' }, { label: 'b' }], action: 'noop' },
  { label: 'Stepper', step: 1, action: 'noop' },
  { label: 'Adjustable', adjust: true, action: 'noop' },
  { label: 'Track card', course: localCard.course, card: 'local:trk-local0001', action: 'card-fly' },
  { label: 'Hub card', card: 'hub-club', hub: 'club', action: 'hub-club' },
  { label: 'Way card', card: 'way-race-5inch', action: 'way-race-5inch' },
  { label: 'Hangar card', card: 'hangar-sticks', action: 'calibrate' },
  { label: 'Plain row', action: 'quad' },
  { label: 'Fly row', action: 'fly', primary: true },
];

async function selectSweep() {
  const out = {};
  for (const name of ['gate-home', 'gate-hub-club', 'title-race', 'courses', 'courses-local', 'pilot']) {
    out[name] = {};
    for (let i = 0; i < ROWS.length; i += 1) {
      const ui = setUp(name);
      const row = structuredClone(ROWS[i]);
      if (row.flip === 'flip') row.flip = () => ui.calls.push(['flip']);
      ui.rows = ROWS.map((r, k) => (k === i ? row : { label: r.label, action: 'noop', ...(r.section ? { section: true } : {}) }));
      ui.cursor = i;
      out[name][ROWS[i].label] = await press(ui, () => ui.select());
    }
    const ui = setUp(name);
    ui.rows = [];
    ui.cursor = 0;
    out[name]['(no row)'] = await press(ui, () => ui.select());
  }
  return out;
}

async function cardsSweep() {
  const out = {};
  for (const [airframe, rooms] of [['interceptor5', true], ['interceptor5', false], ['bramor2300', true], ['cub', false]]) {
    const ui = setUp('gate-home');
    ui.settings.airframe = airframe;
    const strip = (c) => ({ ...c, svg: c.svg ? `svg:${c.svg.length}` : c.svg });
    out[`${airframe} rooms:${rooms}`] = {
      hub: ui.hubCards(rooms).map(strip),
      hangar: ui.hangarCards().map(strip),
      calls: ui.calls.splice(0),
    };
  }
  return out;
}

async function helpersSweep() {
  const out = {};
  for (const name of ['title-race', 'title-race-noseat', 'title-freestyle', 'title-freestyle-noseat', 'gate-home', 'title-firstrun', 'paused']) {
    const ui = setUp(name);
    out[`${name} seatMatchesMode`] = { value: ui.seatMatchesMode(), calls: ui.calls.splice(0) };
    const ui2 = setUp(name);
    out[`${name} flown`] = await press(ui2, () => ui2.flown());
    for (const [id, opts] of [['alps', {}], ['itaipu', { stay: true }], ['track', {}], ['nosuchmap', {}]]) {
      const ui3 = setUp(name);
      out[`${name} seatMap ${id}${opts.stay ? ' stay' : ''}`] = await press(ui3, () => ui3.seatMap(id, opts));
    }
    const ui4 = setUp(name);
    ui4.rows = [{ label: 'a', action: 'x' }, { section: true }, { label: 'b', action: 'hub-club', card: 'hub-club' }];
    out[`${name} openHub`] = await press(ui4, () => ui4.openHub('club'));
    const ui5 = setUp(name);
    out[`${name} openBuilder nohook`] = await press(ui5, () => { ui5.onBuild = null; ui5.openBuilder({ map: 'alps' }); });
  }
  return out;
}

const got = {
  act: await actSweep(),
  back: await backSweep(),
  select: await selectSweep(),
  cards: await cardsSweep(),
  helpers: await helpersSweep(),
};

/* ---- compare or record ---- */

function flat(obj, prefix = '', out = {}) {
  if (obj && typeof obj === 'object' && !Array.isArray(obj) && Object.keys(obj).some((k) => typeof obj[k] === 'object' && obj[k] && !Array.isArray(obj[k]) && 'calls' in obj[k])) {
    for (const [k, v] of Object.entries(obj)) flat(v, prefix ? `${prefix} / ${k}` : k, out);
    return out;
  }
  if (obj && typeof obj === 'object' && !Array.isArray(obj) && !('calls' in obj) && !('value' in obj) && !('hub' in obj)) {
    for (const [k, v] of Object.entries(obj)) flat(v, prefix ? `${prefix} / ${k}` : k, out);
    return out;
  }
  out[prefix] = JSON.stringify(obj);
  return out;
}

if (RECORD) {
  writeFileSync(FILE, `${JSON.stringify(got, null, 1)}\n`);
  console.log(`recorded ${Object.keys(flat(got)).length} steps to ${FILE}`);
  process.exit(0);
}
if (!existsSync(FILE)) {
  console.error(`no golden at ${FILE}; run with --record on the code that is known good`);
  process.exit(2);
}
const want = flat(JSON.parse(readFileSync(FILE, 'utf8')));
const have = flat(got);
let bad = 0;
for (const k of new Set([...Object.keys(want), ...Object.keys(have)])) {
  if (want[k] === have[k]) continue;
  bad += 1;
  if (bad <= 30) {
    console.log(`DIFF ${k}\n  want ${want[k] ?? '(missing)'}\n  have ${have[k] ?? '(missing)'}`);
  }
}
const total = Object.keys(want).length;
if (bad) {
  console.log(`actions-golden: ${bad} of ${total} steps differ`);
  process.exit(1);
}
console.log(`actions-golden: ${total} steps identical`);
