/*
 * keys-golden.js: what the shell does with a key, a gamepad poll and the
 * flight swap buttons (Ui.prototype handleKey, pollPad, pollFlightPad),
 * held to a record taken from the methods as they stood in src/ui/ui.js.
 *
 *     node scripts/keys-golden.js            compare
 *     node scripts/keys-golden.js --record   write tests/fixtures/keys-golden.json
 *
 * The three methods only route: they read the shell's state and call one
 * of its other methods. So each is called on a stand-in `this` whose
 * state is set case by case (the screen, an open dialog, the hangar or the
 * picker open, a drop-down, the calibration and pad pick flags, the
 * bench's search) and whose methods only write down that they were called
 * and with what. The record is, per state and input, the return value,
 * the calls in order and the state the method left behind.
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

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const FILE = join(root, 'tests', 'fixtures', 'keys-golden.json');
const RECORD = process.argv.includes('--record');
const { Ui } = await import('../src/ui/ui.js');

const RECORDED = [
  'noteInteraction', 'openBugReport', 'act', 'show', 'openSwap', 'cycleSwap', 'back', 'moveDrop', 'confirmDrop',
  'closeDrop', 'move', 'adjust', 'select', 'pageMove', 'jumpEdge', 'renderMenu', 'setCursor', 'restoreSearchCaret',
  'onUiSound',
];
const STATE = ['screen', 'lastInput', 'padPrev', 'padRearm', 'swapPadPrev', 'searchCaret', 'fcSearch'];

function standIn(over) {
  const calls = [];
  const self = {
    screen: 'courses',
    nameDialog: null,
    hangar: { isOpen: false, handleKey: (c) => { calls.push(['hangar.handleKey', c]); return 'hangar'; }, pollPad: (n) => calls.push(['hangar.pollPad', JSON.stringify(n)]) },
    carousel: { isOpen: false, handleKey: (c) => { calls.push(['carousel.handleKey', c]); return 'carousel'; }, pollPad: (n) => calls.push(['carousel.pollPad', JSON.stringify(n)]) },
    calCanSave: false, calCanZeroThrottle: false, calCanReverse: false, calOnConfirm: false, calCanSkip: false,
    padPickPhase: 'listen',
    dropEl: null,
    fc: { confirm: false, search: null },
    lastInput: 'start',
    padPrev: { up: false, down: false, left: false, right: false, select: false, back: false },
    padRearm: false,
    swapPadPrev: null,
    cursor: 0,
    rowOffset: 1,
    searchCaret: null,
    card: false,
    gate: false,
    rows: [{ label: 'a', adjust: () => {} }],
    cardScreen() { calls.push(['cardScreen']); return this.card; },
    onGate() { calls.push(['onGate']); return this.gate; },
    items() { return this.rows; },
    firstStop(items, offset) { calls.push(['firstStop', items.length, offset]); return 3; },
    calls,
  };
  for (const name of RECORDED) {
    self[name] = (...args) => { calls.push([name, ...args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : a))]); };
  }
  return Object.assign(self, over);
}
function after(self, ret) {
  const state = {};
  /* Key order inside a state object (the pad snapshot) is not behaviour. */
  const sorted = (v) => (v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v);
  for (const k of STATE) state[k] = sorted(k === 'fcSearch' ? self.fc.search : self[k]);
  return { ret: ret === undefined ? '<undefined>' : ret, calls: self.calls, state };
}

const SCREENS = ['flight', 'calibrate', 'padpick', 'title', 'quad', 'rates', 'pids', 'fc', 'courses', 'freestyle', 'paused', 'pilot'];
const VARIANTS = {
  plain: {},
  dialog: { nameDialog: { hidden: false } },
  dialogHidden: { nameDialog: { hidden: true } },
  hangar: { hangar: undefined },
  carousel: { carousel: undefined },
  drop: { dropEl: {} },
  cal: { calCanSave: true, calCanZeroThrottle: true, calCanReverse: true, calOnConfirm: true },
  calSkip: { calCanSkip: true },
  confirm: { padPickPhase: 'confirm' },
  card: { card: true },
  gate: { gate: true },
  fcConfirm: { fc: { confirm: true, search: null } },
  fcSearching: { fc: { confirm: false, search: 'ro' } },
  noAdjust: { rows: [{ label: 'a' }] },
  noRows: { rows: [] },
  rearm: { padRearm: true },
};
function build(screen, variant) {
  const over = { screen, ...VARIANTS[variant] };
  const self = standIn(over);
  if (variant === 'hangar') self.hangar = { ...standIn({}).hangar, isOpen: true, handleKey: (c) => { self.calls.push(['hangar.handleKey', c]); return 'hangar'; }, pollPad: (n) => self.calls.push(['hangar.pollPad', JSON.stringify(n)]) };
  if (variant === 'carousel') self.carousel = { isOpen: true, handleKey: (c) => { self.calls.push(['carousel.handleKey', c]); return 'carousel'; }, pollPad: (n) => self.calls.push(['carousel.pollPad', JSON.stringify(n)]) };
  return self;
}

const CODES = [
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'Enter', 'Space', 'Escape',
  'Backspace', 'Tab', 'F8', 'BracketLeft', 'BracketRight', 'KeyT', 'KeyR', 'KeyM', 'Slash', 'PageUp', 'PageDown',
  'Home', 'End', 'KeyQ', 'NumpadEnter', 'Digit1',
];
const keys = {};
for (const screen of SCREENS) {
  for (const variant of Object.keys(VARIANTS)) {
    for (const code of CODES) {
      for (const repeat of [false, true]) {
        const self = build(screen, variant);
        const ret = Ui.prototype.handleKey.call(self, code, repeat);
        keys[`${screen}/${variant}/${code}/${repeat}`] = after(self, ret);
      }
    }
  }
}

const NAV = ['up', 'down', 'left', 'right', 'select', 'back'];
const press = (...held) => Object.fromEntries([...NAV, 'alt', 'look'].map((k) => [k, held.includes(k)]));
const SEQUENCES = {
  each: NAV.flatMap((k) => [press(k), press()]),
  hold: [press('up'), press('up'), press('up'), press()],
  chord: [press('up', 'select'), press('select'), press('back', 'left'), press()],
  truthy: [{ up: 1, select: 'x' }, {}, { down: 2 }],
  /* Start: a press pauses a flight or resumes the pause menu, once a hold. */
  start: [{ ...press(), start: true }, { ...press(), start: true }, press(), { ...press(), start: true }],
};
const pads = {};
for (const screen of SCREENS) {
  for (const variant of Object.keys(VARIANTS)) {
    for (const [name, seq] of Object.entries(SEQUENCES)) {
      const self = build(screen, variant);
      const steps = seq.map((nav) => {
        const mark = self.calls.length;
        const ret = Ui.prototype.pollPad.call(self, nav);
        const out = after(self, ret);
        return { ...out, calls: out.calls.slice(mark) };
      });
      pads[`${screen}/${variant}/${name}`] = JSON.parse(JSON.stringify(steps));
    }
  }
}

const swaps = {};
const B = (open, prev, next) => ({ open, prev, next });
const swapSeqs = {
  open: [B(0, 0, 0), B(1, 0, 0), B(1, 0, 0), B(0, 0, 0)],
  cycle: [B(0, 0, 0), B(0, 1, 0), B(0, 0, 1), B(0, 1, 1), B(0, 0, 0)],
  first: [B(1, 1, 1), B(0, 0, 0)],
  missing: [null, B(1, 0, 0), undefined, B(0, 1, 0)],
};
for (const screen of ['flight', 'paused', 'title']) {
  for (const [name, seq] of Object.entries(swapSeqs)) {
    const self = build(screen, 'plain');
    const steps = seq.map((b) => {
      const mark = self.calls.length;
      const ret = Ui.prototype.pollFlightPad.call(self, b);
      const out = after(self, ret);
      return { ...out, calls: out.calls.slice(mark) };
    });
    swaps[`${screen}/${name}`] = JSON.parse(JSON.stringify(steps));
  }
}

const got = JSON.parse(JSON.stringify({ keys, pads, swaps }));
/* The full record is large and regular; it is kept as one hash per case,
 * with two screens' plain cases and the swap buttons in full so that a
 * difference can be read back. */
const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const compact = {};
for (const [group, cases] of Object.entries(got)) {
  compact[group] = {};
  for (const [k, v] of Object.entries(cases)) compact[group][k] = /^(courses|flight)\/plain\//.test(k) || group === 'swaps' ? v : hash(v);
}
const count = Object.values(compact).reduce((n, g) => n + Object.keys(g).length, 0);
if (RECORD) {
  writeFileSync(FILE, `${JSON.stringify(compact, null, 1)}\n`);
  console.log(`wrote ${count} cases to ${FILE}`);
  process.exit(0);
}
if (!existsSync(FILE)) {
  console.log(`FAIL no record at ${FILE}`);
  process.exit(1);
}
const want = JSON.parse(readFileSync(FILE, 'utf8'));
const bad = [];
for (const group of Object.keys({ ...want, ...compact })) {
  for (const k of Object.keys({ ...want[group], ...compact[group] })) {
    if (JSON.stringify(want[group]?.[k]) !== JSON.stringify(compact[group]?.[k])) bad.push(`${group}:${k}`);
  }
}
if (bad.length) {
  console.log(`FAIL ${bad.length} of ${count} cases differ: ${bad.slice(0, 12).join(', ')}`);
  process.exit(1);
}
console.log(`ok ${count} cases equal to the record`);
