/*
 * uirest-golden.js: the parts of src/ui/ui.js no other golden reaches, held
 * to a record taken from them before they were rewritten. The track byline,
 * the seat predicates (seatIsRace, liveListing, liveWorld), the radio trouble
 * row, the aircraft row's swap, the picker's drawn fits, and the Ui methods
 * play, setHowtoSource, titleStop, menuScrollNode and adjust.
 *
 *     node scripts/uirest-golden.js            compare
 *     node scripts/uirest-golden.js --record   write tests/fixtures/uirest-golden.json
 *
 * The methods run on objects made from Ui.prototype with stand-in
 * collaborators that write down what they were asked, so the record holds
 * the method's own work. English and Spanish.
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
const FILE = join(root, 'tests', 'fixtures', 'uirest-golden.json');
const RECORD = process.argv.includes('--record');

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => { store.clear(); },
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};
globalThis.window = {
  location: { href: 'https://example.test/', search: '', hash: '', hostname: 'example.test', origin: 'https://example.test' },
  addEventListener() {},
  removeEventListener() {},
};

const ui = await import('../src/ui/ui.js');
const { Ui } = ui;
const { useLocale } = await import('../src/strings/index.js');
const { writeShareImport, clearShareImport } = await import('../src/share/session.js');
const { AIRFRAME_IDS } = await import('../configs/airframes.js');
const { MAPS } = await import('../src/maps/registry.js');
const { HUBS } = await import('../src/ui/ways.js');

/* Plain data for the record: functions become a marker, errors their message. */
const plain = (v) => JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'function' ? '[fn]' : x)) ?? 'null');
function attempt(fn) {
  try {
    return plain(fn());
  } catch (e) {
    return { threw: String(e && e.message) };
  }
}

function course(gates, waypoints = 0) {
  const elements = [];
  const sequence = [];
  for (let i = 0; i < gates; i += 1) {
    elements.push({ id: `g${i}`, type: 'gate' });
    sequence.push({ elementId: `g${i}` });
  }
  for (let i = 0; i < waypoints; i += 1) {
    elements.push({ id: `w${i}`, type: 'waypoint' });
    sequence.push({ elementId: `w${i}` });
  }
  return { schemaVersion: 4, map: 'alps', name: 'Seat', elements, sequence };
}

const SEATS = {
  empty: null,
  nogates: { id: 's0', document: course(0) },
  waypoints: { id: 's1', document: course(0, 3) },
  gates: { id: 's2', document: course(2, 1) },
  local: { id: 's3', document: course(3), local: true },
};

function seat(name) {
  clearShareImport('full');
  clearShareImport('wing');
  if (SEATS[name]) {
    writeShareImport(SEATS[name]);
  }
}

function seatRows() {
  const out = {};
  for (const name of Object.keys(SEATS)) {
    seat(name);
    const live = attempt(() => ui.liveListing());
    out[name] = {
      listing: live && { kind: live.kind, gates: live.gates, name: live.name },
      race: Object.fromEntries(['track', ...MAPS.map((m) => m.id), 'nope'].map((id) => [id, attempt(() => ui.seatIsRace({ map: id }))])),
    };
  }
  seat('empty');
  return out;
}

function bylines() {
  const cases = [null, undefined, {}, { author: 'ann' }, { designer: 'dee' }, { designer: 'dee', author: 'ann' }, { designer: '', author: 'ann' }, { author: '' }];
  return cases.map((t) => attempt(() => ui.byLine(t)));
}

function worlds() {
  return Object.fromEntries(['track', ...MAPS.map((m) => m.id), 'nope', '', undefined].map((id) => [String(id), attempt(() => {
    const w = ui.liveWorld(id);
    return w && w.id;
  })]));
}

function troubleRows() {
  const out = {};
  const flags = ['buttons', 'hasSelect', 'calibrated', 'mapKnown', 'mapUsable', 'guessNoYaw'];
  out.none = attempt(() => ui.padTroubleItem(null));
  out.nocount = attempt(() => ui.padTroubleItem({ count: 0 }));
  out.keyboard = attempt(() => ui.padTroubleItem({ count: 1, using: 'Keyboard' }));
  for (let bits = 0; bits < 1 << flags.length; bits += 1) {
    const info = { count: 1, using: 'Radio' };
    flags.forEach((f, i) => { info[f] = Boolean(bits & (1 << i)); });
    const row = attempt(() => ui.padTroubleItem(info));
    out[bits.toString(2).padStart(flags.length, '0')] = row && row.label ? row.label : row;
  }
  out.notes = {};
  for (const row of [{ buttons: false, hasSelect: false }, { buttons: true }, { buttons: true, guessNoYaw: true, mapUsable: true }]) {
    const got = ui.padTroubleItem({ count: 2, ...row });
    out.notes[JSON.stringify(row)] = plain(got);
  }
  return out;
}

function craftRows() {
  const out = {};
  for (const swapping of [false, true]) {
    const s = { airframe: AIRFRAME_IDS[0], rates: null };
    const swaps = [];
    const swap = swapping ? (...args) => { swaps.push(args); return 'ignored'; } : undefined;
    const item = ui.craftItem(s, swap, AIRFRAME_IDS[1]);
    const view = plain(item);
    const picked = attempt(() => item.set ? item.set(AIRFRAME_IDS[2]) : item.pick(AIRFRAME_IDS[2]));
    out[swapping ? 'swap' : 'seat'] = { view, picked, swaps, after: plain(s), keys: Object.keys(item) };
  }
  return out;
}

function drawnFits() {
  const out = {};
  const fits = {
    bare: {},
    full: { livery: 'red', parts: { prop: 'big', addons: ['lights'] }, power: 'high', combat: { load: 'x' } },
  };
  for (const id of AIRFRAME_IDS) {
    for (const [fitName, fit] of Object.entries(fits)) {
      const fake = Object.create(Ui.prototype);
      fake.settings = {
        airframe: id,
        fits: { [id]: fit },
        buildFits: { [id]: { airframe: id, build: 'b1', stock: { [id]: fit } } },
      };
      fake.buildList = [];
      const picker = Ui.prototype.pickerBuilds.call(fake);
      out[`${id}:${fitName}`] = {
        build: attempt(() => picker.drawn(id, { id: 'b1', airframe: id, fit })),
        card: attempt(() => picker.drawn(id, null)),
      };
    }
    const unfitted = Object.create(Ui.prototype);
    unfitted.settings = { airframe: id };
    unfitted.buildList = [];
    out[`${id}:unfitted`] = attempt(() => Ui.prototype.pickerBuilds.call(unfitted).drawn(id, null));
  }
  return out;
}

function methods() {
  const out = {};
  const log = [];
  const fake = (extra = {}) => Object.assign(Object.create(Ui.prototype), {
    settings: { map: 'alps', airframe: AIRFRAME_IDS[0] },
    mode: null,
    hub: null,
    returnTo: 'paused',
    onAction: (a, s) => log.push(['onAction', a, s && s.map]),
    onUiSound: (k) => log.push(['sound', k]),
    renderHowto() { log.push(['renderHowto', this.howtoSource]); },
    writeSettings() { log.push(['writeSettings']); },
    firstStop(items) { log.push(['firstStop', items.length]); return 99; },
    ...extra,
  });

  log.length = 0;
  const p = fake();
  Ui.prototype.play.call(p);
  out.play = { log: [...log], map: p.settings.map, mode: p.mode, returnTo: p.returnTo, stored: JSON.parse(store.get(ui.SETTINGS_KEY) ?? 'null')?.map ?? null };
  log.length = 0;
  const quiet = fake({ onAction: null });
  Ui.prototype.play.call(quiet);
  out.playQuiet = { log: [...log], map: quiet.settings.map, mode: quiet.mode, returnTo: quiet.returnTo };

  out.howto = {};
  for (const id of ['radio', 'launch', 'touch', 'mouse', 'keyboard', 'gamepad', '', undefined]) {
    log.length = 0;
    const h = fake();
    Ui.prototype.setHowtoSource.call(h, id);
    out.howto[String(id)] = { source: h.howtoSource, log: [...log] };
  }
  log.length = 0;
  const hs = fake({ onUiSound: null });
  Ui.prototype.setHowtoSource.call(hs, 'radio');
  out.howtoQuiet = { source: hs.howtoSource, log: [...log] };

  out.titleStop = {};
  const actions = ['calibrate', ...HUBS.map((h) => `hub-${h.id}`), ...ui.WAYS.map((w) => w.action)];
  for (const gate of [false, true]) {
    for (const hub of [null, HUBS[0].id]) {
      for (const mode of [null, 'race', 'freestyle']) {
        for (const list of ['all', 'nohubs', 'nofirst', 'empty']) {
          log.length = 0;
          const rows = {
            all: actions,
            nohubs: actions.filter((a) => !a.startsWith('hub-')),
            nofirst: actions.filter((a) => a !== `hub-${HUBS[0].id}`),
            empty: [],
          }[list];
          const t = fake({ hub, mode, onGate: () => gate, items: () => rows.map((a) => ({ action: a })) });
          const at = attempt(() => Ui.prototype.titleStop.call(t));
          out.titleStop[`${gate}:${hub}:${mode}:${list}`] = { at, action: rows[at] ?? null, log: [...log] };
        }
      }
    }
  }

  const host = (sel) => ({ querySelector: (q) => (sel.includes(q) ? `node${q}` : null) });
  out.menuScroll = {
    noScreens: attempt(() => Ui.prototype.menuScrollNode.call(fake({ screens: null, screen: 'title' }))),
    noHost: attempt(() => Ui.prototype.menuScrollNode.call(fake({ screens: {}, screen: 'title' }))),
    both: attempt(() => Ui.prototype.menuScrollNode.call(fake({ screens: { title: host(['.menu-scroll', '.menu']) }, screen: 'title' }))),
    menuOnly: attempt(() => Ui.prototype.menuScrollNode.call(fake({ screens: { title: host(['.menu']) }, screen: 'title' }))),
    neither: attempt(() => Ui.prototype.menuScrollNode.call(fake({ screens: { title: host([]) }, screen: 'title' }))),
  };

  out.adjust = {};
  const rows = [{ label: 'a' }, { label: 'b', adjust: (d) => log.push(['adjust b', d]) }];
  for (const cursor of [0, 1, 2]) {
    for (const dir of [-1, 1]) {
      log.length = 0;
      Ui.prototype.adjust.call(fake({ cursor, items: () => rows }), dir);
      out.adjust[`${cursor}:${dir}`] = [...log];
    }
  }
  return out;
}

function scenarios() {
  store.clear();
  return {
    bylines: bylines(),
    worlds: worlds(),
    seats: seatRows(),
    trouble: troubleRows(),
    craft: craftRows(),
    drawn: drawnFits(),
    methods: methods(),
  };
}

const got = {};
await useLocale('en');
got.en = scenarios();
await useLocale('es');
got.es = scenarios();

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
for (const locale of Object.keys(want)) {
  for (const key of Object.keys(want[locale])) {
    if (JSON.stringify(got[locale]?.[key]) !== JSON.stringify(want[locale][key])) {
      bad.push(`${locale}:${key}`);
    }
  }
}
if (bad.length) {
  console.log(`FAIL ${bad.length} scenario(s) differ:\n  ${bad.join('\n  ')}`);
  process.exit(1);
}
console.log(`ok ${Object.keys(got.en).length} scenario groups per locale, equal to the record`);
