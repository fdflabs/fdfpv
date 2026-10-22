/*
 * items-golden.js: every menu screen's item list, held to a record taken
 * from Ui.items(), buildItems(), roomExit(), barStops() and markBars() as
 * they stood inside the Ui class.
 *
 *     node scripts/items-golden.js            compare
 *     node scripts/items-golden.js --record   write tests/fixtures/items-golden.json
 *     node scripts/items-golden.js --dump es  print one language's rows as JSON
 *
 * The browser golden (scripts/ui-golden.js) walks the screens of seven
 * stored profiles, which is most of what these methods do, but it cannot
 * reach every combination: a paused run inside a room, a results screen
 * with a lap waiting to be posted, a rates library with a matching preset,
 * the PIDs room before the tune has loaded. This one can, because the
 * methods are called on an object made from Ui.prototype with the state
 * fields they read set by hand, and the modules they read storage through
 * are seeded through their own writers.
 *
 * For every item the plain fields are written down (label, value, note,
 * action, flags, options, the firmware number), and every function on it
 * is driven once from a fresh copy of the state: an arrow each way, a pick
 * of the next option, a flip, a typed number, the row's open. What each
 * drive changed in the settings, in storage and in what the Ui was asked
 * to do is recorded beside the row, so a setter wired to the wrong field
 * fails the comparison as surely as a wrong label. English and Spanish.
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

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const FILE = join(root, 'tests', 'fixtures', 'items-golden.json');
const RECORD = process.argv.includes('--record');
/* --dump takes the language before any screen module loads, as the page
 * does (src/boot.js): rows built from the table at load time, like
 * MID_RUN_WARNING and the SCREEN_TITLES a note names, are only in that
 * language then. The record and the compare take each language from its
 * own --dump for the same reason, since a language switch after loading
 * would leave those words English in the es half. */
const DUMP = process.argv.includes('--dump') ? process.argv[process.argv.indexOf('--dump') + 1] : null;

/* ---- the stand-in page ---- */

/* Enough of an element for what the screens touch: the lede's text and
 * the bar buttons' `on` class. */
class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.childNodes = [];
    this.style = {};
    this.dataset = {};
  }

  append() {}

  remove() {}

  setAttribute() {}

  addEventListener() {}

  removeEventListener() {}

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
}

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => { store.clear(); },
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};
globalThis.document = { createElement: (tag) => new FakeElement(tag), activeElement: null, hidden: false };
const calls = [];
globalThis.window = {
  location: {
    href: 'https://example.test/?map=track',
    search: '',
    hostname: 'paraguayandronecombatsimulator.com',
    origin: 'https://example.test',
    reload: () => { calls.push('reload'); },
  },
  innerWidth: 1600,
  innerHeight: 900,
  devicePixelRatio: 2,
  addEventListener() {},
  removeEventListener() {},
};
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'Mozilla/5.0 (golden) Stand-in/1.0', language: 'en' },
  configurable: true,
  writable: true,
});
Object.defineProperty(globalThis, 'performance', { value: { now: () => 1000 }, configurable: true, writable: true });
globalThis.fetch = async () => ({ ok: false, status: 503, text: async () => '' });

if (DUMP) {
  const { useLocale: take } = await import('../src/strings/index.js');
  if (await take(DUMP) !== DUMP) {
    console.error(`items-golden: no language ${DUMP}`);
    process.exit(1);
  }
}
const { Ui } = await import('../src/ui/ui.js');
const { DEFAULTS } = await import('../src/ui/settings.js');
const { normaliseRates, RATE_DEFAULTS } = await import('../configs/rates.js');
const { setPidSlider, setPidsExpert, SLIDER_KEYS, PID_AXES, PID_FIELDS } = await import('../configs/pids.js');

/* ---- seeding ---- */

const clone = (v) => JSON.parse(JSON.stringify(v));

/* A profile: the defaults with the scenario's own fields over them. */
function profile(over = {}) {
  return { ...clone(DEFAULTS), ...clone(over) };
}

/* The tracks server on, which is also what makes accounts available. */
function seedTracksServer() {
  store.set('webfpv.tracks.origin', 'https://tracks.test');
}

function seedSignedIn(callsign) {
  seedTracksServer();
  store.set('webfpv.account.v1', JSON.stringify({ session: 'sess-golden', callsign, publicKey: 'pk' }));
}

/* Rate presets under fixed ids: saveRatePreset would draw random ones. */
function seedPresets(presets) {
  const library = {};
  presets.forEach(([name, rates], k) => {
    const id = `rp-golden-${k}`;
    library[id] = { id, name, savedUtc: `2026-09-0${k + 1}T00:00:00Z`, rates };
  });
  store.set('fdfpv.rates.library.v1', JSON.stringify(library));
}

/* The state every scenario starts from. The hooks main.js installs are
 * recorders; the methods other modules install on Ui.prototype are the
 * real ones, called with this state. */
function makeUi(fields = {}) {
  const ui = Object.create(Ui.prototype);
  Object.assign(ui, {
    settings: profile(),
    screen: 'title',
    mode: 'race',
    hub: null,
    craftGate: false,
    firstRun: false,
    returnTo: 'title',
    cursor: 0,
    padInfo: null,
    gpuInfo: null,
    pidsLive: null,
    ratesNotice: '',
    warLobbyOn: false,
    roomResults: false,
    updateBar: { hidden: true },
    roomBar: { hidden: true },
    roomBarView: null,
    updateReload: new FakeElement('button'),
    roomBarButton: new FakeElement('button'),
    yawTipAsked: false,
    everyoneFlightAsked: true,
    everyoneFlightS: null,
    stickProbe: null,
    fc: { items: () => [{ label: 'bench row', action: 'fc-row' }] },
    friendsRow: null,
    friendsRows: null,
    roomRows: null,
    titleRooms: null,
    roomResultsRows: null,
    inRoom: null,
    onHotSwap: null,
    craftShown: null,
    swapTo(id) { calls.push(`swapTo:${id}`); },
    openCraftRow(midRun) { calls.push(`openCraftRow:${midRun}`); },
    offerYawTip() { calls.push('offerYawTip'); this.yawTipAsked = true; },
  }, fields);
  return ui;
}

/* ---- recording ---- */

const PLAIN = ['id', 'label', 'value', 'note', 'action', 'section', 'info', 'disabled', 'primary', 'rowClass',
  'pickOnly', 'card', 'hub', 'art', 'blurb', 'facts', 'bar', 'sw', 'on', 'step', 'current', 'range', 'lobby', 'join', 'key'];

function plain(it) {
  const out = {};
  for (const k of PLAIN) {
    if (it[k] !== undefined) out[k] = it[k];
  }
  if (it.svg !== undefined) out.svg = it.svg === null ? null : `<svg ${String(it.svg).length} chars>`;
  if (it.options) out.options = it.options.map((o) => ({ value: o.value, label: o.label }));
  if (it.num) out.num = { cli: it.num.cli, text: it.num.text, unit: it.num.unit, label: it.num.spec.label, min: it.num.spec.cliMin, max: it.num.spec.cliMax };
  if (it.course) out.course = { kind: it.course.kind, id: it.course.track.id };
  if (it.map) out.map = it.map.id;
  if (it.links) out.links = it.links;
  const fns = Object.keys(it).filter((k) => typeof it[k] === 'function').sort();
  if (fns.length) out.fns = fns;
  return out;
}

function diff(before, after, path = '') {
  if (JSON.stringify(before) === JSON.stringify(after)) return {};
  const same = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!same(before) || !same(after)) return { [path || '.']: after === undefined ? '<gone>' : after };
  const out = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    Object.assign(out, diff(before[k], after[k], path ? `${path}.${k}` : k));
  }
  return out;
}

const storeSnap = () => Object.fromEntries([...store.entries()].sort());

/*
 * What one drive of a row's function changes. The list is rebuilt from
 * the scenario's own state for every drive, so the closures each row
 * holds see exactly the state the record describes and no earlier drive.
 */
function drive(scenario, locale, i, fnName, args) {
  const ui = scenario.make();
  const before = { settings: clone(ui.settings), store: storeSnap(), yawTipAsked: ui.yawTipAsked };
  calls.length = 0;
  const it = ui.items()[i];
  const fn = it && it[fnName];
  if (typeof fn !== 'function') return { missing: fnName };
  let returned;
  let threw = null;
  try {
    returned = fn(...args);
  } catch (e) {
    threw = String(e && e.message || e);
  }
  const out = {};
  const settings = diff(before.settings, ui.settings);
  if (Object.keys(settings).length) out.settings = settings;
  const stored = diff(before.store, storeSnap());
  if (Object.keys(stored).length) out.store = stored;
  if (calls.length) out.calls = [...calls];
  if (ui.yawTipAsked !== before.yawTipAsked) out.yawTipAsked = ui.yawTipAsked;
  if (returned !== undefined) out.returned = returned;
  if (threw) out.threw = threw;
  return out;
}

/* The drives a row offers, by the functions it carries. The pick is of
 * the option after the current one, so it changes something. */
function drives(scenario, locale, i, it) {
  const out = {};
  if (it.adjust) {
    out['adjust(+1)'] = drive(scenario, locale, i, 'adjust', [1]);
    out['adjust(-1)'] = drive(scenario, locale, i, 'adjust', [-1]);
  }
  if (it.flip) out['flip()'] = drive(scenario, locale, i, 'flip', []);
  if (it.pick && it.options && it.options.length) {
    const at = it.options.findIndex((o) => String(o.value) === String(it.current));
    const next = it.options[(at + 1) % it.options.length];
    out[`pick(${JSON.stringify(String(next.value))})`] = drive(scenario, locale, i, 'pick', [String(next.value)]);
  }
  if (it.num) {
    out[`set(${it.num.cli + 1})`] = drive(scenario, locale, i, 'set', [it.num.cli + 1]);
  }
  if (it.open) out['open()'] = drive(scenario, locale, i, 'open', []);
  if (it.cycle) out['cycle(1)'] = drive(scenario, locale, i, 'cycle', [1]);
  return out;
}

function recordScenario(scenario, locale) {
  const ui = scenario.make();
  calls.length = 0;
  const items = ui.items();
  const entry = {
    screen: ui.screen,
    items: items.map((it, i) => ({ ...plain(it), drives: drives(scenario, locale, i, it) })),
  };
  if (calls.length) entry.buildCalls = [...calls];
  /* The bar stops and the lit button, at every cursor position. */
  const bars = ui.barStops().map(plain);
  if (bars.length) {
    entry.bars = bars;
    entry.lit = items.map((it, i) => {
      ui.cursor = i;
      ui.markBars();
      return `${ui.updateReload.className}|${ui.roomBarButton.className}`;
    });
    ui.cursor = 0;
    ui.markBars(items);
    entry.litFromGiven = `${ui.updateReload.className}|${ui.roomBarButton.className}`;
  }
  return entry;
}

/* ---- scenarios ---- */

const padNoButtons = { count: 1, using: 'Radio', buttons: 0, hasSelect: false, calibrated: false, mapKnown: false, mapUsable: false };
const padGuessing = { count: 1, using: 'Radio', buttons: 4, hasSelect: true, calibrated: false, mapKnown: false, mapUsable: false };
const padNoYaw = { count: 2, using: 'Radio', buttons: 4, hasSelect: true, calibrated: false, mapKnown: true, mapUsable: true, guessNoYaw: true };
const padFine = { count: 1, using: 'Taranis', buttons: 4, hasSelect: true, calibrated: true, mapKnown: true, mapUsable: true };

const friendsRowInRoom = () => ({ inRoom: true, value: 'OWLS', note: 'Two pilots in the room.' });
const friendsRowOut = () => ({ inRoom: false, value: 'No room', note: 'Make one or join one.' });
const friendsRowsPlain = () => [
  { label: 'Room', value: 'OWLS', action: 'friends-room', note: 'The code.' },
  { label: 'Leave the room', action: 'friends-leave', note: 'Back to flying alone.' },
];
const friendsRowsStarted = () => [
  { label: 'Start the race', action: 'friends-lobby-start', primary: true, note: 'Everybody is ready.' },
  ...friendsRowsPlain(),
];

function pidsLiveFor(s, baselineMode = 'RPY') {
  const pids = Object.fromEntries(PID_AXES.map((axis) => [axis, Object.fromEntries(PID_FIELDS.map((f, k) => [f, 40 + k * 7]))]));
  return { tune: s.tune, baselineMode, baseline: Object.fromEntries(SLIDER_KEYS.map((k) => [k, 100])), pids };
}

/*
 * Each scenario builds a fresh Ui from scratch (and reseeds storage), so
 * a drive on one row never leaks into the next. `fields` are set on the
 * Ui, `seed` fills storage, `settings` goes over the defaults.
 */
function scenario(name, { settings = {}, fields = {}, seed = () => {} } = {}) {
  return {
    name,
    make() {
      store.clear();
      seed();
      return makeUi({ settings: profile(settings), ...clone(fields), ...functionsOf(fields) });
    },
  };
}

/* clone() drops functions; put the hooks back by reference. */
function functionsOf(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'function') out[k] = v;
    else if (v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).some((x) => typeof x === 'function')) out[k] = v;
  }
  return out;
}

const SCENARIOS = [
  /* The title: the gate (home, with and without rooms, and the Hangar), and the menu behind it. */
  scenario('title-gate-home', { fields: { mode: null, craftGate: true } }),
  scenario('title-gate-home-rooms', { fields: { mode: null, craftGate: true, friendsRow: friendsRowOut, titleRooms: (home) => [{ label: `Rooms panel home=${home}`, lobby: 'room', action: 'lobby:owls' }] } }),
  scenario('title-gate-home-pad', { fields: { mode: null, craftGate: true, padInfo: padNoButtons } }),
  scenario('title-gate-hangar', { fields: { mode: null, craftGate: true, hub: 'hangar', padInfo: padNoYaw } }),
  scenario('title-gate-plane', { settings: { airframe: 'bramor2300' }, fields: { mode: null, craftGate: true } }),
  scenario('title-race-no-seat', { fields: { padInfo: padFine } }),
  scenario('title-race-first-no-seat', { fields: { firstRun: true } }),
  scenario('title-race-named', { seed: () => { store.set('webfpv.pilot.name', 'Ace Pilot'); }, fields: { friendsRow: friendsRowInRoom, inRoom: () => true } }),
  scenario('title-freestyle', { settings: { map: 'interior', freestyleMap: 'interior' }, fields: { mode: 'freestyle', firstRun: true } }),
  scenario('title-freestyle-not-loaded', { settings: { map: 'track' }, fields: { mode: 'freestyle' } }),
  scenario('title-plane', { settings: { airframe: 'bramor2300', tune: 'wing-manual' }, fields: {} }),
  scenario('title-update-bar', { fields: { updateBar: { hidden: false } } }),
  scenario('title-both-bars', { fields: { updateBar: { hidden: false }, roomBar: { hidden: false }, roomBarView: { button: 'Rejoin', text: 'OWLS is still open.' } } }),
  scenario('title-room-bar-no-button', { fields: { roomBar: { hidden: false }, roomBarView: { button: '', text: 'nothing' } } }),

  scenario('howto', { fields: { screen: 'howto' } }),
  scenario('credits', { fields: { screen: 'credits' } }),

  /* Friends: between runs and paused, in and out of a room, the war. */
  scenario('friends-no-hooks', { fields: { screen: 'friends' } }),
  scenario('friends-out', { fields: { screen: 'friends', friendsRow: friendsRowOut, friendsRows: friendsRowsPlain } }),
  scenario('friends-in-race', { fields: { screen: 'friends', friendsRow: friendsRowInRoom, friendsRows: friendsRowsPlain, inRoom: () => true } }),
  scenario('friends-in-started', { fields: { screen: 'friends', friendsRow: friendsRowInRoom, friendsRows: friendsRowsStarted, inRoom: () => true } }),
  scenario('friends-in-freestyle', { settings: { map: 'interior' }, fields: { screen: 'friends', mode: 'freestyle', friendsRow: friendsRowInRoom, friendsRows: friendsRowsPlain, inRoom: () => true } }),
  scenario('friends-in-freestyle-shown', { settings: { map: 'interior' }, fields: { screen: 'friends', mode: 'freestyle', friendsRow: friendsRowInRoom, friendsRows: friendsRowsPlain, craftShown: () => '7inch' } }),
  scenario('friends-paused-freestyle', { settings: { map: 'interior' }, fields: { screen: 'friends', mode: 'freestyle', returnTo: 'paused', friendsRow: friendsRowInRoom, friendsRows: friendsRowsPlain } }),
  scenario('friends-war', { settings: { map: 'interior' }, fields: { screen: 'friends', mode: 'freestyle', warLobbyOn: true, friendsRow: friendsRowInRoom, friendsRows: friendsRowsPlain, inRoom: () => true } }),
  scenario('friends-war-paused', { fields: { screen: 'friends', returnTo: 'paused', warLobbyOn: true, friendsRow: friendsRowInRoom, friendsRows: friendsRowsStarted } }),
  scenario('rooms', { fields: { screen: 'rooms', roomRows: (screen) => [{ label: `rows of ${screen}`, action: 'friends-room-owls' }] } }),
  scenario('rooms-no-hook', { fields: { screen: 'rooms' } }),
  scenario('roomnew', { fields: { screen: 'roomnew', roomRows: (screen) => [{ label: `rows of ${screen}`, action: 'friends-make' }] } }),

  /* Freestyle: as it stands and arcade with crash damage off. */
  scenario('freestyle-off', { settings: { map: 'interior' }, fields: { screen: 'freestyle', mode: 'freestyle' } }),
  scenario('freestyle-arcade', { settings: { map: 'interior', flightStyle: 'arcade', crashDamage: false }, fields: { screen: 'freestyle', mode: 'freestyle' } }),

  /* Quad: between runs, paused with and without the hot swap, the yaw tip. */
  scenario('quad', { fields: { screen: 'quad' } }),
  scenario('quad-paused', { fields: { screen: 'quad', returnTo: 'paused' } }),
  scenario('quad-paused-hotswap', { settings: { flightMode: 'angle', launchControl: true }, fields: { screen: 'quad', returnTo: 'paused', onHotSwap: () => {} } }),
  scenario('quad-yaw-tip', { settings: { cameraAngle: 39 }, fields: { screen: 'quad' } }),
  scenario('quad-yaw-tip-asked', { settings: { cameraAngle: 39 }, fields: { screen: 'quad', yawTipAsked: true } }),
  scenario('quad-yaw-tip-slow-yaw', { settings: { cameraAngle: 39, rates: { ...clone(RATE_DEFAULTS), yaw: { rcRate: 7, srate: 40, expo: 0 } } }, fields: { screen: 'quad' } }),
  scenario('quad-yaw-tip-betaflight', { settings: { cameraAngle: 39, rates: { ...clone(RATE_DEFAULTS), type: 'BETAFLIGHT' } }, fields: { screen: 'quad' } }),
  scenario('quad-angle-max', { settings: { cameraAngle: 90, cameraFov: 120 }, fields: { screen: 'quad' } }),
  scenario('quad-adjusted', { settings: { pids: { 'betaflight-interceptor': { mode: 'sliders', sliders: { master: 120 } } } }, fields: { screen: 'quad' } }),
  scenario('quad-custom-tune', { seed: () => { store.set('fdfpv.fc.v1', '# dump'); store.set('fdfpv.fc.airframe.v1', 'interceptor'); }, settings: { tune: 'custom' }, fields: { screen: 'quad' } }),
  scenario('quad-plane', { settings: { airframe: 'bramor2300', tune: 'wing-stab' }, fields: { screen: 'quad' } }),

  /* Pilot: guest, accounts on, signed in, mouse flight, flight time. */
  scenario('pilot-guest', { fields: { screen: 'pilot' } }),
  scenario('pilot-named-pad', { seed: () => { store.set('webfpv.pilot.name', 'Ace Pilot'); }, fields: { screen: 'pilot', padInfo: padFine, gpuInfo: { display: 'Stand-in GPU 9000', note: 'A fine card.' }, stickProbe: () => ({ source: 'gamepad', padHz: 250, fps: 60 }) } }),
  scenario('pilot-accounts-out', { seed: seedTracksServer, fields: { screen: 'pilot', padInfo: { count: 0 } } }),
  scenario('pilot-signed-in', { seed: () => seedSignedIn('Callsign'), settings: { flightTime: { 'device0a': { first: '2026-09-01', by: { interceptor: { race: 3600, free: 1800, combat: 900, tag: 600, war: 400, other: 10 } } }, 'device0b': { first: '2026-08-15', by: { cub1400: { race: 60 } } } } }, fields: { screen: 'pilot', padInfo: { count: 3, using: 'Keyboard' }, everyoneFlightS: 987654 } }),
  scenario('pilot-signed-in-blank', { seed: () => seedSignedIn(''), fields: { screen: 'pilot', padInfo: padNoButtons } }),
  scenario('pilot-mouse', { settings: { mouseFlight: true, mouseSens: 150, mouseExpo: 30, mouseInvert: true, mouseCentre: 'hold', sound: false, musicLevel: 0, musicTrack: 'rotation', perfOverlay: true, flightLog: true, link: 'elrs250', renderScale: 70, fpsCap: 60, graphics: 'low', graphicsAuto: true, latencyMode: 'standard', perfMode: 'quality', peerMarks: 'off', avxPalette: 'ironbow', hudStyle: 'game', stickMode: 1 }, fields: { screen: 'pilot', returnTo: 'paused' } }),
  scenario('pilot-combat', { settings: { airframe: 'striker2500', hudStyleBy: { striker2500: 'osd' }, volume: 10, motorLevel: 0, windLevel: 10, otherLevel: 0, effectsLevel: 10, ambientLevel: 0, voiceLevel: 10, musicLevel: 10 }, fields: { screen: 'pilot' } }),
  scenario('pilot-flight-time-some', { settings: { flightTime: { 'device0a': { by: { interceptor: { race: 120 } } } } }, fields: { screen: 'pilot', everyoneFlightS: 3599 } }),

  /* The Controller screen (src/ui/controller.js): what Settings held
   * for the sticks, nothing plugged in, mouse flight, a calibrated radio,
   * a gamepad with its feel set, a radio no profile knows, a plane and a
   * wing (the rates are their class's), the question. */
  scenario('controller-none', { fields: { screen: 'controller', padInfo: { count: 0 } } }),
  scenario('controller-mouse', { settings: { mouseFlight: true, mouseSens: 150, mouseExpo: 30, mouseInvert: true, mouseCentre: 'hold', stickMode: 1 }, fields: { screen: 'controller' } }),
  scenario('controller-radio', { fields: { screen: 'controller', padInfo: { ...padFine, device: 'radio', profile: 'edgetx-usb', feel: { deadZone: 4, expo: 0 } } } }),
  scenario('controller-gamepad', { fields: { screen: 'controller', padInfo: { ...padFine, using: 'Joystick 1, Xbox', calibrated: false, device: 'gamepad', profile: 'standard', feel: { deadZone: 8, expo: 25 } } } }),
  scenario('controller-unknown', { fields: { screen: 'controller', padInfo: { ...padGuessing, device: 'radio', profile: 'aetr', feel: { deadZone: 0, expo: 0 } } } }),
  scenario('controller-plane', { settings: { airframe: 'bramor2300', tune: 'wing-stab' }, fields: { screen: 'controller', padInfo: { count: 0 } } }),
  scenario('controller-wing', { settings: { airframe: 'striker2500' }, fields: { screen: 'controller', padInfo: { count: 0 } } }),
  scenario('flywith-gamepad', { fields: { screen: 'flywith', padInfo: { ...padFine, device: 'gamepad', profile: 'standard' } } }),

  /* Paused: alone, in a room, planes. */
  scenario('paused', { fields: { screen: 'paused', returnTo: 'paused' } }),
  scenario('paused-rows', { settings: { map: 'interior', graphics: 'medium' }, fields: { screen: 'paused', returnTo: 'paused', friendsRow: friendsRowOut } }),
  scenario('paused-in-room', { fields: { screen: 'paused', returnTo: 'paused', friendsRow: friendsRowInRoom, inRoom: () => true, roomBar: { hidden: false }, roomBarView: { button: 'Room', text: 'OWLS' } } }),
  scenario('paused-watching', { fields: { screen: 'paused', returnTo: 'paused', friendsRow: friendsRowInRoom, inRoom: () => true, watching: () => true } }),
  scenario('paused-plane', { settings: { airframe: 'bramor2300', tune: 'wing-stab', map: 'interior' }, fields: { screen: 'paused', returnTo: 'paused' } }),
  /* The pause menu's Flight panel: a quad, a quad with its rows, planes. */
  scenario('quick', { fields: { screen: 'quick', returnTo: 'paused' } }),
  scenario('quick-rows', { settings: { map: 'interior', graphics: 'medium' }, fields: { screen: 'quick', returnTo: 'paused' } }),
  scenario('quick-plane', { settings: { airframe: 'bramor2300', tune: 'wing-stab', map: 'interior' }, fields: { screen: 'quick', returnTo: 'paused' } }),
  scenario('quick-striker', { settings: { airframe: 'striker2500', tune: 'striker-manual', map: 'interior' }, fields: { screen: 'quick', returnTo: 'paused' } }),

  /* Results: a room's, a free world, no seat. */
  scenario('results-room', { fields: { screen: 'results', roomResults: true, roomResultsRows: () => [{ label: 'Room results', action: 'friends-results' }, { label: 'Back to title', action: 'title' }], inRoom: () => true } }),
  scenario('results-room-no-rows', { fields: { screen: 'results', roomResults: true } }),
  scenario('results-free-world', { settings: { map: 'interior' }, fields: { screen: 'results' } }),
  scenario('results-no-seat', { fields: { screen: 'results' } }),

  /* Rates: no presets, a matching one, an unrelated one, split, notice. */
  scenario('rates-stock', { fields: { screen: 'rates' } }),
  scenario('rates-changed-split', { settings: { ratesSplitPitch: true, rates: { ...clone(RATE_DEFAULTS), roll: { rcRate: 10, srate: 80, expo: 20 }, throttleCap: 80, thrMid: 40, thrExpo: 10 }, cameraAngle: 45 }, fields: { screen: 'rates', ratesNotice: 'Storage refused the save.', stickProbe: () => ({ source: 'keyboard' }) } }),
  scenario('rates-preset-loaded', { seed: () => seedPresets([['Bando', RATE_DEFAULTS]]), fields: { screen: 'rates' } }),
  scenario('rates-presets-unmatched', { seed: () => seedPresets([['Bando', { ...clone(RATE_DEFAULTS), roll: { rcRate: 10, srate: 80, expo: 20 } }], ['Smooth', { ...clone(RATE_DEFAULTS), type: 'BETAFLIGHT' }]]), fields: { screen: 'rates' } }),
  scenario('rates-quick-touch', { settings: { rates: normaliseRates({ ...clone(RATE_DEFAULTS), type: 'QUICK' }) }, fields: { screen: 'rates', stickProbe: () => ({ source: 'touch' }) } }),
  scenario('rates-plane', { settings: { airframe: 'bramor2300', tune: 'wing-stab' }, fields: { screen: 'rates' } }),

  /* PIDs: loading, sliders, a moved slider, expert, RP sliders, paused. */
  scenario('pids-loading', { fields: { screen: 'pids' } }),
  scenario('pids-stale-live', { fields: { screen: 'pids', pidsLive: { ...pidsLiveFor({ tune: 'other' }) } } }),
  scenario('pids-sliders', { fields: { screen: 'pids', pidsLive: pidsLiveFor({ tune: 'betaflight-interceptor' }) } }),
  scenario('pids-moved-rp', {
    settings: { pids: (() => { const p = {}; setPidSlider(p, 'betaflight-interceptor', 'master', 120, 100); setPidSlider(p, 'betaflight-interceptor', 'd', 90, 100); return p; })() },
    fields: { screen: 'pids', returnTo: 'paused', pidsLive: pidsLiveFor({ tune: 'betaflight-interceptor' }, 'RP') },
  }),
  scenario('pids-expert', {
    settings: { pids: (() => { const p = {}; setPidsExpert(p, 'betaflight-interceptor', true, pidsLiveFor({ tune: 'betaflight-interceptor' }).pids); return p; })() },
    fields: { screen: 'pids', pidsLive: pidsLiveFor({ tune: 'betaflight-interceptor' }) },
  }),
  scenario('pids-custom-tune', { seed: () => { store.set('fdfpv.fc.v1', '# dump'); store.set('fdfpv.fc.airframe.v1', 'interceptor'); }, settings: { tune: 'custom' }, fields: { screen: 'pids', pidsLive: pidsLiveFor({ tune: 'custom' }) } }),

  scenario('fc', { fields: { screen: 'fc' } }),
  scenario('unknown-screen', { fields: { screen: 'calibrate' } }),
];

/* ---- run ---- */

if (DUMP) {
  const one = {};
  for (const sc of SCENARIOS) {
    one[sc.name] = recordScenario(sc, DUMP);
  }
  /* Exit only once a pipe has taken it all: exiting at once cuts it short. */
  process.stdout.write(`${JSON.stringify(one)}\n`, () => process.exit(0));
  await new Promise(() => {});
}

const dumpOf = (locale) => JSON.parse(execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--dump', locale], {
  encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
}));
const got = { en: dumpOf('en'), es: dumpOf('es') };
const text = `${JSON.stringify(got, null, 1)}\n`;

if (RECORD) {
  writeFileSync(FILE, text);
  const n = Object.values(got.en).reduce((a, e) => a + e.items.length, 0);
  console.log(`items-golden: recorded ${SCENARIOS.length} scenarios, ${n} rows per language, to ${FILE}`);
  process.exit(0);
}
if (!existsSync(FILE)) {
  console.error(`items-golden: no record at ${FILE}; run with --record first`);
  process.exit(1);
}
const want = JSON.parse(readFileSync(FILE, 'utf8'));
let bad = 0;
for (const locale of Object.keys({ ...want, ...got })) {
  const names = new Set([...Object.keys(want[locale] || {}), ...Object.keys(got[locale] || {})]);
  for (const name of names) {
    const a = JSON.stringify((want[locale] || {})[name], null, 1);
    const b = JSON.stringify((got[locale] || {})[name], null, 1);
    if (a === b) continue;
    bad += 1;
    const al = a ? a.split('\n') : [];
    const bl = b ? b.split('\n') : [];
    let k = 0;
    while (k < al.length && k < bl.length && al[k] === bl[k]) k += 1;
    console.error(`items-golden: ${locale}/${name} differs at line ${k + 1}:\n  want ${al[k] ?? '<end>'}\n  got  ${bl[k] ?? '<end>'}`);
  }
}
if (bad) {
  console.error(`items-golden: ${bad} scenario(s) differ from ${FILE}`);
  process.exit(1);
}
console.log(`items-golden: ${SCENARIOS.length} scenarios identical in ${Object.keys(got).length} languages`);
