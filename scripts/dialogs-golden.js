/*
 * dialogs-golden.js: the shell's modal dialogs (the name form, the yes or
 * no, the unsaved guard, the bug report and the flight feel report) held
 * to a record taken from the methods as they stood inside the Ui class.
 *
 *     node scripts/dialogs-golden.js            compare
 *     node scripts/dialogs-golden.js --record   write tests/fixtures/dialogs-golden.json
 *
 * The methods are called on an object made from Ui.prototype, so the same
 * script reads them wherever they are installed from. A stand-in document
 * keeps every element built: tag, class, the properties the dialogs set,
 * dataset, style, which listeners hang on it, text and children in order.
 * Each scenario opens a dialog, drives the listeners it registered the way
 * a pilot would (keys, clicks, a backdrop click, a pasted file) and writes
 * down what was drawn, what got focus, what the promise resolved to, what
 * the Ui was asked to do and what went to the board. English and Spanish.
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
const FILE = join(root, 'tests', 'fixtures', 'dialogs-golden.json');
const RECORD = process.argv.includes('--record');

/* ---- the stand-in page ---- */

const PROPS = ['hidden', 'type', 'value', 'maxLength', 'rows', 'placeholder', 'autocomplete', 'disabled',
  'selected', 'title', 'tabIndex', 'accept', 'multiple', 'alt', 'src'];

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
    this.connected = false;
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

  remove() {
    if (!this.parent) return;
    const kids = this.parent.childNodes;
    kids.splice(kids.indexOf(this), 1);
    this.parent = null;
  }

  get isConnected() {
    for (let n = this; n; n = n.parent) if (n.connected) return true;
    return false;
  }

  setAttribute(k, v) { this.attrs.push([k, String(v)]); }

  set textContent(t) {
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

  removeEventListener(type, fn, opts) {
    const capture = typeof opts === 'boolean' ? opts : Boolean(opts && opts.capture);
    this.listeners = this.listeners.filter((l) => !(l.type === type && l.fn === fn && l.capture === capture));
  }

  focus() { document.activeElement = this; }

  select() { this.selectedAll = true; }

  click() {}
}
for (const p of PROPS.filter((x) => x !== 'value')) {
  Object.defineProperty(FakeElement.prototype, p, {
    get() { return this[`_${p}`]; },
    set(v) { this[`_${p}`] = v; },
  });
}
/* A field reads '' until something is typed, and a select reads its
 * chosen option, as on the page. */
Object.defineProperty(FakeElement.prototype, 'value', {
  get() {
    if (this._value !== undefined) return this._value;
    if (this.tagName === 'SELECT') {
      const opt = this.childNodes.find((o) => o._selected) || this.childNodes[0];
      return opt ? opt._value : '';
    }
    return /^(INPUT|TEXTAREA)$/.test(this.tagName) ? '' : undefined;
  },
  set(v) { this._value = v; },
});

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};
globalThis.document = { createElement: (tag) => new FakeElement(tag), activeElement: null };
globalThis.window = {
  location: { href: 'https://example.test/?map=track', search: '', hostname: 'example.test', origin: 'https://example.test' },
  innerWidth: 1600,
  innerHeight: 900,
  devicePixelRatio: 2,
};
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'Mozilla/5.0 (golden) Stand-in/1.0', language: 'en' },
  configurable: true,
  writable: true,
});
let clock = 1000;
Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true, writable: true });

const posts = [];
let boardAnswer = { status: 200, body: { id: 'bug-0000golden' } };
globalThis.fetch = async (url, init) => {
  posts.push({ url, method: init.method, headers: init.headers, body: JSON.parse(init.body) });
  const { status, body } = boardAnswer;
  return { ok: status >= 200 && status < 300, status, text: async () => (body == null ? '' : JSON.stringify(body)) };
};

const { Ui } = await import('../src/ui/ui.js');
const { DEFAULTS } = await import('../src/ui/settings.js');
const { crashRecord } = await import('../src/share/crashrecord.js');
const { useLocale } = await import('../src/strings/index.js');

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
  if (node.selectedAll) out.selectedAll = true;
  if (node.listeners.length) {
    out.on = [...new Set(node.listeners.map((l) => `${l.type}${l.capture ? '!' : ''}`))].sort();
  }
  if (node.childNodes.length) out.children = node.childNodes.map(tree);
  return out;
}

function walk(node, fn) {
  if (!(node instanceof FakeElement)) return null;
  if (fn(node)) return node;
  for (const c of node.childNodes) {
    const hit = walk(c, fn);
    if (hit) return hit;
  }
  return null;
}

function all(node, fn, out = []) {
  if (!(node instanceof FakeElement)) return out;
  if (fn(node)) out.push(node);
  for (const c of node.childNodes) all(c, fn, out);
  return out;
}

const flush = () => new Promise((r) => setImmediate(r));

function makeUi(extra = {}) {
  const ui = Object.create(Ui.prototype);
  const calls = [];
  const overlay = new FakeElement('div');
  overlay.className = 'name-dialog';
  overlay.hidden = true;
  overlay.connected = true;
  const settings = structuredClone(DEFAULTS);
  Object.assign(ui, {
    calls,
    nameDialog: overlay,
    settings,
    screen: 'menu',
    nameWait: null,
    nameKeyHandler: null,
    nameClickHandler: null,
    bugFiling: false,
    discarding: null,
    gpuInfo: { display: 'Stand-in GPU 9000', name: 'raw' },
    pidsLive: { roll: [45, 80, 30], pitch: [47, 84, 32], yaw: [45, 80, 0] },
    resultsFastest: 61234,
    stickProbe: () => ({ source: 'gamepad', padHz: 250 }),
    syncChips() { calls.push('syncChips'); },
    renderMenu() { calls.push('renderMenu'); },
    act(a) { calls.push(`act:${a}`); },
    show(s) { calls.push(`show:${s}`); this.screen = s; },
    onSettings(s) { calls.push(`onSettings:${s === settings}`); },
  }, extra);
  return ui;
}

function describe(node) {
  if (!node) return null;
  return `${node.tagName}.${node.className}|${node.textContent.slice(0, 40)}`;
}

/* A recorder per scenario: steps are written in order, so a change in
 * what happens between two steps shows up at the step it changed. */
function recorder(ui) {
  const steps = [];
  let resolved = 'pending';
  let lastTree = '';
  const r = {
    steps,
    watch(p) {
      p.then((v) => { resolved = v === undefined ? 'undefined' : v; });
      return p;
    },
    async note(label) {
      await flush();
      const sameOr = (t) => {
        const text = JSON.stringify(t);
        if (text === lastTree) return 'unchanged';
        lastTree = text;
        return t;
      };
      steps.push({
        label,
        dialog: { hidden: ui.nameDialog.hidden, tree: sameOr(tree(ui.nameDialog)) },
        focus: describe(document.activeElement),
        resolved,
        calls: ui.calls.splice(0),
        state: {
          nameWait: typeof ui.nameWait,
          nameKeyHandler: typeof ui.nameKeyHandler,
          nameClickHandler: typeof ui.nameClickHandler,
          discarding: typeof ui.discarding,
          bugFiling: ui.bugFiling,
          yawTipAsked: ui.yawTipAsked,
          feelAsked: ui.settings.feelAsked,
        },
        posts: posts.splice(0),
        store: Object.fromEntries(store),
      });
    },
  };
  return r;
}

function key(ui, k) {
  const e = {
    key: k,
    target: document.activeElement,
    prevented: false,
    stopped: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; },
  };
  for (const l of [...ui.nameDialog.listeners]) if (l.type === 'keydown') l.fn(e);
  return { prevented: e.prevented, stopped: e.stopped };
}

/* A click on `node`, bubbling to the overlay the way the page does. A
 * disabled button takes no click. */
function click(node) {
  if (!node) throw new Error('click on nothing');
  if (node.disabled) return;
  const e = { target: node, preventDefault() {}, stopPropagation() {} };
  for (let n = node; n; n = n.parent) {
    for (const l of [...n.listeners]) if (l.type === 'click') l.fn(e);
  }
}

function paste(box) {
  const file = { type: 'image/png', name: 'shot.png', size: 10 };
  const e = {
    target: box,
    clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }], types: ['Files'] },
    preventDefault() {},
  };
  for (const l of [...box.listeners]) if (l.type === 'paste') l.fn(e);
}

const byClass = (ui, cls) => walk(ui.nameDialog, (n) => n.className === cls);
const byText = (ui, text) => walk(ui.nameDialog, (n) => n.tagName === 'BUTTON' && n.textContent === text);
const buttons = (ui, cls) => all(ui.nameDialog, (n) => n.tagName === 'BUTTON' && (!cls || n.classList.contains(cls)));
const inputs = (ui) => all(ui.nameDialog, (n) => /name-dialog-input/.test(n.className));

/* ---- scenarios ---- */

const scenarios = {
  async formDefault() {
    store.set('webfpv.pilot.name', 'Old Name');
    const ui = makeUi();
    const r = recorder(ui);
    r.watch(ui.askForm());
    await r.note('opened with no fields');
    inputs(ui)[0].value = 'x';
    click(buttons(ui, 'on')[0]);
    await r.note('save with a name the rules refuse');
    inputs(ui)[0].value = '  Ace  Pilot ';
    await r.note('typed');
    r.steps.push({ enter: key(ui, 'Enter') });
    await r.note('enter saves');
    store.clear();
    return r.steps;
  },

  async formFields() {
    const ui = makeUi();
    const r = recorder(ui);
    r.watch(ui.askForm({
      title: 'Publish',
      detail: 'Some detail',
      confirmLabel: 'Go',
      fields: [
        { key: 'name', label: 'Name', value: 'Track', maxLength: 40, placeholder: 'Track name', empty: 'Needs a name' },
        { key: 'note', label: 'Note', value: '', required: false },
        { key: 'who', label: '', value: '', rules: 'Two letters at least' },
      ],
    }));
    await r.note('opened');
    const [name, , who] = inputs(ui);
    name.value = '   ';
    click(buttons(ui, 'on')[0]);
    await r.note('blank required field with its own empty line');
    name.value = 'Track two';
    click(buttons(ui, 'on')[0]);
    await r.note('third field blank, no empty line');
    who.value = '  Me ';
    click(walk(ui.nameDialog, (n) => n.tagName === 'H2'));
    await r.note('click inside the box does nothing');
    click(buttons(ui, 'on')[0]);
    await r.note('saved');
    return r.steps;
  },

  async formCancelPaths() {
    const out = {};
    for (const how of ['Escape', 'backdrop', 'cancel', 'second', 'otherKey']) {
      const ui = makeUi();
      const r = recorder(ui);
      r.watch(ui.askForm({ title: 'T', fields: [{ key: 'k', label: '', value: 'v' }] }));
      if (how === 'Escape') r.steps.push({ key: key(ui, 'Escape') });
      if (how === 'backdrop') click(ui.nameDialog);
      if (how === 'cancel') click(buttons(ui)[1]);
      if (how === 'otherKey') r.steps.push({ key: key(ui, 'a') });
      if (how === 'second') {
        r.watch(ui.askForm({ title: 'Second' }));
        await r.note('first resolved, second open');
        click(ui.nameDialog);
      }
      await r.note(how);
      out[how] = { steps: r.steps, listenersLeft: ui.nameDialog.listeners.length };
    }
    return out;
  },

  async ratePresetName() {
    const out = {};
    for (const suggested of [undefined, 'Not saved yet']) {
      const ui = makeUi();
      const r = recorder(ui);
      r.watch(ui.askRatePresetName(suggested));
      await r.note('opened');
      inputs(ui)[0].value = '';
      key(ui, 'Enter');
      await r.note('empty refused');
      inputs(ui)[0].value = ' Mine ';
      key(ui, 'Enter');
      await r.note('named');
      out[String(suggested)] = r.steps;
    }
    const ui = makeUi();
    const r = recorder(ui);
    r.watch(ui.askRatePresetName('x'));
    key(ui, 'Escape');
    await r.note('cancelled');
    out.cancel = r.steps;
    return out;
  },

  async name() {
    store.set('webfpv.pilot.name', 'Stored');
    const out = {};
    for (const args of [undefined, { title: 'Who', detail: 'Why' }]) {
      const ui = makeUi();
      const r = recorder(ui);
      r.watch(ui.askName(args));
      await r.note('opened');
      inputs(ui)[0].value = 'New Callsign';
      click(buttons(ui, 'on')[0]);
      await r.note('saved');
      out[args ? 'custom' : 'default'] = r.steps;
    }
    const ui = makeUi();
    const r = recorder(ui);
    r.watch(ui.askName());
    click(buttons(ui)[1]);
    await r.note('cancelled');
    out.cancel = r.steps;
    store.clear();
    return out;
  },

  async confirmPlain() {
    const out = {};
    for (const k of ['Enter', 'y', 'Y', 'n', 'N', 'Escape', 'q', 'ArrowLeft']) {
      const ui = makeUi();
      const r = recorder(ui);
      clock = 5000;
      r.watch(ui.askConfirm({ title: 'Sure?', detail: 'Really', yes: 'Do it', no: 'Keep' }));
      r.steps.push({ deaf: key(ui, k) });
      await r.note('inside the deaf period');
      clock = 5300;
      r.steps.push({ live: key(ui, k) });
      await r.note('after it');
      out[k] = r.steps;
    }
    for (const which of ['yes', 'no', 'backdrop']) {
      const ui = makeUi();
      const r = recorder(ui);
      clock = 7000;
      r.watch(ui.askConfirm({ title: 'Plain' }));
      await r.note('opened with default labels');
      const [noBtn, yesBtn] = buttons(ui);
      clock = 7299;
      click(which === 'yes' ? yesBtn : noBtn);
      await r.note('299 ms in');
      clock = 7301;
      click(which === 'yes' ? yesBtn : which === 'no' ? noBtn : ui.nameDialog);
      await r.note('301 ms in');
      out[which] = r.steps;
    }
    return out;
  },

  async confirmDanger() {
    const out = {};
    for (const path of [['Enter'], ['ArrowRight', 'Enter'], ['ArrowLeft', 'ArrowLeft', 'Enter'], ['y', 'Y', 'Escape'], ['ArrowRight', 'n']]) {
      const ui = makeUi();
      const r = recorder(ui);
      clock = 9000;
      r.watch(ui.askConfirm({ title: 'Delete it?', yes: 'Delete', no: 'Keep', danger: true }));
      await r.note('opened');
      clock = 9500;
      for (const k of path) {
        r.steps.push({ k, ev: key(ui, k) });
        await r.note(k);
      }
      out[path.join('+')] = r.steps;
    }
    return out;
  },

  async yawTip() {
    const out = {};
    for (const answer of [true, false]) {
      const ui = makeUi();
      ui.settings.cameraAngle = 45;
      ui.settings.rates = { ...ui.settings.rates, type: 'ACTUAL' };
      ui.settings.rates.yaw = { ...(ui.settings.rates.yaw || {}), srate: 67 };
      const r = recorder(ui);
      clock = 11000;
      ui.offerYawTip();
      await r.note('offered');
      clock = 12000;
      click(answer ? buttons(ui)[1] : buttons(ui)[0]);
      await r.note('answered');
      r.steps.push({ yaw: ui.settings.rates.yaw });
      out[String(answer)] = r.steps;
      store.clear();
    }
    return out;
  },

  async discardGuard() {
    const out = {};
    for (const press of ['clean', 'keep', 'send', 'discard']) {
      const ui = makeUi();
      const r = recorder(ui);
      const box = new FakeElement('div');
      box.className = 'name-dialog-box bug';
      ui.nameDialog.append(box);
      ui.nameDialog.hidden = false;
      const log = [];
      const asked = ui.confirmDiscard(box, {
        dirty: () => press !== 'clean',
        submit: () => log.push('submit'),
        discard: () => log.push('discard'),
      });
      r.steps.push({ asked, log: [...log], boxDisplay: box.style.display });
      await r.note('after the guard decided');
      if (press !== 'clean') {
        const label = { keep: 1, send: 0, discard: 2 }[press];
        click(buttons(ui, 'name-dialog-btn')[label]);
        r.steps.push({ log: [...log], boxDisplay: box.style.display });
        await r.note(`pressed ${press}`);
      }
      out[press] = r.steps;
    }
    {
      const ui = makeUi();
      const box = new FakeElement('div');
      ui.nameDialog.append(box);
      ui.confirmDiscard(box, { dirty: () => true, submit() {}, discard() {} });
      const restore = ui.discarding;
      restore();
      out.restoreFn = { panelGone: !byClass(ui, 'name-dialog-box bug'), display: box.style.display, discarding: ui.discarding };
    }
    return out;
  },

  async closeDialog() {
    const ui = makeUi();
    const r = recorder(ui);
    const got = [];
    ui.nameWait = (v) => got.push(v);
    ui.bugFiling = true;
    ui.discarding = () => {};
    ui.nameDialog.hidden = false;
    ui.nameDialog.append(new FakeElement('div'));
    const kh = () => {};
    const ch = () => {};
    ui.nameKeyHandler = kh;
    ui.nameClickHandler = ch;
    ui.nameDialog.addEventListener('keydown', kh, true);
    ui.nameDialog.addEventListener('click', ch);
    ui.nameDialog.addEventListener('keydown', () => {}, false);
    ui.closeNameDialog({ some: 'value' });
    r.steps.push({ got, listeners: ui.nameDialog.listeners.map((l) => `${l.type}${l.capture ? '!' : ''}`) });
    await r.note('closed');
    ui.closeNameDialog(null);
    await r.note('closed again with nothing open');
    return r.steps;
  },

  async snapshots() {
    const out = {};
    const ui = makeUi({ screen: 'flight' });
    ui.settings.map = 'meadow';
    ui.settings.weight = 130;
    ui.settings.flightMode = 'acro';
    out.plain = ui.bugSnapshot();
    window.__frameFault = { message: 'x is not a function'.repeat(30), stack: Array.from({ length: 9 }, (_, i) => `at frame${i} (main.js:${i}:1)`).join('\n'), atMs: 4321 };
    clock = 20000;
    crashRecord.noteCraft({ kind: 'wreck', airframe: 'five', map: 'meadow', flags: ['arm'], hits: [{ part: 'arm', type: 'ground', surface: 'grass', closing: 12.345 }], speed: 20.11, agl: 0.2, at: [1, 2, 3] });
    clock = 25000;
    crashRecord.noteError('boom', 'main.js:1:1');
    out.faulted = ui.bugSnapshot();
    window.__frameFault = { message: '' };
    ui.stickProbe = null;
    ui.gpuInfo = { name: 'only name' };
    out.emptyFault = ui.bugSnapshot();
    ui.gpuInfo = undefined;
    ui.settings = undefined;
    out.noSettings = ui.bugSnapshot();
    delete window.__frameFault;
    const feelUi = makeUi({ screen: 'results' });
    feelUi.settings.map = 'meadow';
    out.feel = feelUi.feelSnapshot();
    feelUi.resultsFastest = undefined;
    feelUi.settings.tune = 'nope';
    out.feelNoLap = feelUi.feelSnapshot();
    clock = 1e9;
    return JSON.parse(JSON.stringify(out));
  },

  async openBug() {
    const out = {};
    for (const screen of ['flight', 'paused', 'menu']) {
      const ui = makeUi({ screen });
      ui.settings.map = 'meadow';
      const r = recorder(ui);
      ui.openBugReport();
      await r.note('opened');
      ui.openBugReport();
      await r.note('second press while open');
      inputs(ui)[1].value = 'A specific title';
      inputs(ui)[2].value = 'Twenty characters or more of it.';
      click(buttons(ui, 'on')[0]);
      await r.note('sent, so the context it took is on the board');
      out[screen] = r.steps;
    }
    {
      const ui = makeUi();
      ui.nameDialog.hidden = false;
      const r = recorder(ui);
      ui.openBugReport();
      await r.note('blocked by an open dialog');
      out.blocked = r.steps;
    }
    return out;
  },

  async bugForm() {
    const out = {};
    const fill = (ui, title, what) => {
      const fields = inputs(ui);
      fields[1].value = title;
      fields[2].value = what;
      return fields;
    };
    {
      const ui = makeUi();
      const r = recorder(ui);
      r.watch(Promise.resolve(ui.askBugReport({ screen: 'menu' })));
      await r.note('opened');
      click(byText(ui, buttons(ui, 'on')[0].textContent));
      await r.note('send empty');
      fill(ui, '  Seven77  ', 'x'.repeat(40));
      click(buttons(ui, 'on')[0]);
      await r.note('seven letter title');
      fill(ui, 'Eight888', ` ${'y'.repeat(19)} `);
      click(buttons(ui, 'on')[0]);
      await r.note('eight letter title, nineteen letter story');
      fill(ui, 'Eight888', 'z'.repeat(20));
      boardAnswer = { status: 418, body: { error: 'boundary passed' } };
      click(buttons(ui, 'on')[0]);
      await r.note('twenty letters goes to the board');
      const f = fill(ui, 'A specific title', 'Twenty characters or more of it.');
      f[3].value = 'expected';
      f[4].value = 'steps';
      f[0].value = 'visual';
      f[5].value = 'Reporter';
      boardAnswer = { status: 500, body: { error: 'board is down' } };
      click(buttons(ui, 'on')[0]);
      await r.note('board refused');
      boardAnswer = { status: 503, body: null };
      click(buttons(ui, 'on')[0]);
      await r.note('board refused with no body');
      boardAnswer = { status: 200, body: { id: 'bug-0000golden' } };
      click(buttons(ui, 'on')[0]);
      await r.note('sent');
      r.steps.push({ esc: key(ui, 'Escape') });
      await r.note('escape on the sent screen');
      out.send = r.steps;
    }
    {
      const ui = makeUi();
      const r = recorder(ui);
      ui.askBugReport({});
      fill(ui, 'A specific title', 'Twenty characters or more of it.');
      click(buttons(ui, 'on')[0]);
      await r.note('sent');
      click(buttons(ui, 'on')[0]);
      await r.note('closed from the sent screen');
      out.closeSent = r.steps;
    }
    for (const how of ['Escape', 'backdrop', 'cancel']) {
      const ui = makeUi();
      const r = recorder(ui);
      ui.askBugReport({});
      const leave = () => {
        if (how === 'Escape') key(ui, 'Escape');
        if (how === 'backdrop') click(ui.nameDialog);
        if (how === 'cancel') click(buttons(ui.nameDialog.childNodes[0] ? ui : ui).filter((b) => b.className === 'name-dialog-btn')[0]);
      };
      leave();
      await r.note('clean form closes');
      ui.askBugReport({});
      inputs(ui)[2].value = 'something written';
      leave();
      await r.note('dirty form asks');
      leave();
      await r.note('second try while the guard is up');
      if (!buttons(ui, 'danger')[0]) leave();
      key(ui, 'Escape');
      await r.note('escape over the guard keeps editing');
      leave();
      click(buttons(ui, 'danger')[0]);
      await r.note('discarded');
      out[how] = r.steps;
    }
    {
      const ui = makeUi();
      const r = recorder(ui);
      ui.askBugReport({});
      paste(walk(ui.nameDialog, (n) => /name-dialog-box/.test(n.className)));
      key(ui, 'Escape');
      await r.note('a pasted shot makes it dirty');
      out.shot = r.steps;
    }
    {
      const ui = makeUi();
      const r = recorder(ui);
      ui.askBugReport({});
      inputs(ui)[1].value = 'A specific title';
      inputs(ui)[2].value = 'Twenty characters or more of it.';
      key(ui, 'Escape');
      click(buttons(ui, 'on')[0]);
      await r.note('send it from the guard');
      out.sendFromGuard = r.steps;
    }
    {
      const ui = makeUi({ screen: 'menu' });
      const r = recorder(ui);
      ui.askBugReport({});
      click(byClass(ui, 'name-dialog-door'));
      await r.note('the feel door on a clean form');
      out.door = r.steps;
    }
    {
      const ui = makeUi();
      const r = recorder(ui);
      const held = [];
      ui.nameWait = (v) => held.push(v);
      ui.askBugReport({ crash: { craft: { ageS: 12.4 } } });
      r.steps.push({ held });
      await r.note('aircraft crash attached, a dialog was open');
      ui.askBugReport({ crash: { errors: [{ message: 'first' }, { message: 'last one' }] } });
      await r.note('page errors open on crash');
      ui.askBugReport({ fault: { message: 'frame threw' }, crash: { errors: [{ message: 'e' }], craft: { ageS: 3 } } });
      await r.note('a frame fault wins the message');
      out.attached = r.steps;
    }
    return out;
  },

  async feelOffer() {
    const out = {};
    const realTimeout = globalThis.setTimeout;
    for (const name of ['asked', 'fires', 'leftResults', 'dialogOpen', 'filing']) {
      const ui = makeUi({ screen: 'results' });
      ui.settings.feelAsked = name === 'asked';
      const timers = [];
      globalThis.setTimeout = (fn, ms) => { timers.push(ms); fn.pending = true; timers.fn = fn; return 1; };
      ui.maybeOfferFeel();
      globalThis.setTimeout = realTimeout;
      const r = recorder(ui);
      r.steps.push({ timers: [...timers] });
      if (name === 'leftResults') ui.screen = 'menu';
      if (name === 'dialogOpen') ui.nameDialog.hidden = false;
      if (name === 'filing') ui.bugFiling = true;
      if (timers.fn) timers.fn();
      await r.note('timer fired');
      out[name] = r.steps;
      store.clear();
    }
    {
      const ui = makeUi({ screen: 'paused' });
      ui.settings.feelAsked = true;
      const r = recorder(ui);
      ui.openFeelReport();
      await r.note('opened from the row after it was asked');
      out.rowAfterAsked = r.steps;
      store.clear();
    }
    return out;
  },

  async feelForm() {
    const out = {};
    const chips = (ui, i) => all(ui.nameDialog, (n) => n.className === 'feel-chips')[i].childNodes;
    {
      const ui = makeUi({ screen: 'results' });
      ui.settings.weight = 100;
      const r = recorder(ui);
      ui.askFeelReport(ui.feelSnapshot());
      await r.note('opened');
      click(buttons(ui, 'on').find((b) => b.className === 'name-dialog-btn on'));
      await r.note('send with no word');
      click(chips(ui, 0)[1]);
      click(chips(ui, 0)[3]);
      await r.note('two words, last wins');
      click(chips(ui, 0)[3]);
      await r.note('same word again clears');
      click(chips(ui, 0)[4]);
      click(chips(ui, 1)[5]);
      await r.note('throttle ticked');
      click(chips(ui, 1)[6]);
      await r.note('floaty ticked');
      click(chips(ui, 1)[5]);
      click(chips(ui, 1)[0]);
      await r.note('throttle off, sluggish on');
      inputs(ui)[0].value = '  Wants more snap.  ';
      inputs(ui)[1].value = 'Feeler';
      click(buttons(ui).find((b) => b.className === 'name-dialog-btn on'));
      await r.note('sent');
      click(buttons(ui).find((b) => b.className === 'name-dialog-btn on'));
      await r.note('closed');
      out.send = r.steps;
    }
    {
      const ui = makeUi({ screen: 'results' });
      ui.settings.weight = 999;
      ui.settings.rates = { ...ui.settings.rates, throttleCap: 75 };
      const r = recorder(ui);
      ui.askFeelReport(ui.feelSnapshot());
      click(chips(ui, 1)[5]);
      click(chips(ui, 1)[6]);
      await r.note('capped and heaviest: no hints');
      click(chips(ui, 0)[2]);
      boardAnswer = { status: 400, body: { error: 'nope' } };
      click(buttons(ui).find((b) => b.className === 'name-dialog-btn on'));
      await r.note('board refused');
      boardAnswer = { status: 200, body: { id: 'bug-0000golden' } };
      out.noHints = r.steps;
    }
    for (const how of ['Escape', 'backdrop', 'dismiss']) {
      const ui = makeUi({ screen: 'results' });
      const r = recorder(ui);
      const leave = () => {
        if (how === 'Escape') key(ui, 'Escape');
        if (how === 'backdrop') click(ui.nameDialog);
        if (how === 'dismiss') click(buttons(ui).find((b) => b.className === 'name-dialog-btn'));
      };
      ui.askFeelReport(ui.feelSnapshot());
      leave();
      await r.note('clean form closes');
      ui.askFeelReport(ui.feelSnapshot());
      click(chips(ui, 1)[2]);
      leave();
      await r.note('one chip makes it dirty');
      key(ui, 'Escape');
      await r.note('escape over the guard keeps editing');
      leave();
      click(buttons(ui, 'danger')[0]);
      await r.note('discarded');
      out[how] = r.steps;
    }
    return out;
  },
};

async function runAll() {
  const out = {};
  for (const [name, fn] of Object.entries(scenarios)) {
    clock = 1000;
    store.clear();
    posts.length = 0;
    document.activeElement = null;
    /* A scenario that cannot finish has changed: written down as the
     * error so it differs from the record by name instead of ending the run. */
    try {
      out[name] = await fn();
    } catch (e) {
      out[name] = { threw: String(e && e.message) };
    }
  }
  return JSON.parse(JSON.stringify(out));
}

const got = { en: await runAll() };
await useLocale('es');
got.es = await runAll();

if (RECORD) {
  /* One scenario per line: half the size of an indented record, and a
   * diff still names the scenario that moved. */
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
    if (JSON.stringify(want[lang][k]) !== JSON.stringify(got[lang][k])) bad.push(`${lang}.${k}`);
  }
}
if (bad.length) {
  console.log(`FAIL ${bad.length} scenario(s) differ: ${bad.join(', ')}`);
  process.exit(1);
}
console.log(`ok ${Object.keys(scenarios).length} dialog scenarios x 2 locales equal to the record`);
