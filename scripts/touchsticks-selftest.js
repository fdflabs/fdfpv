/*
 * touchsticks-selftest.js: the thumb sticks (src/input/touchsticks.js)
 * driven through a stand-in DOM in plain Node, pinned against a golden.
 *
 * lint:input proves the sticks on a real page with touch emulation, a few
 * gestures deep. This drives many more, deterministically: touchdown,
 * drags inside and past the stop, two thumbs at once, a second finger on a
 * held plate, lift and the spring back over time, cancel, the pen and the
 * mouse (which the zones must ignore), all four stick modes including a
 * mode change mid hold, hide and reset while held, and the pause and
 * aircraft buttons. After every step it records what the input ladder
 * would read (sample, active), what the overlay shows (nub positions,
 * held plates, captions, visibility) and debug(), and it pins the overlay's
 * element tree, because the stylesheet and lint:input select on it.
 *
 * tests/fixtures/touchsticks-trace.json was written from the shipped
 * module before it was rewritten. `--write` regenerates it; only ever from
 * a module whose behaviour is the one players already have.
 *
 *   node scripts/touchsticks-selftest.js
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
import { fileURLToPath } from 'node:url';

const GOLDEN = fileURLToPath(new URL('../tests/fixtures/touchsticks-trace.json', import.meta.url));
const WRITE = process.argv.includes('--write');

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

/* ------------------------------------------------------------ the DOM */

/* Just enough of an element for the overlay: a tree, classes, inline
 * style, listeners, pointer capture and a layout box the test sets. */
class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.dataset = {};
    this.attrs = {};
    this.listeners = {};
    this.captured = [];
    this.box = null;
    this.textValue = '';
    this.classSet = new Set();
    const self = this;
    this.classList = {
      add: (...c) => c.forEach((x) => self.classSet.add(x)),
      remove: (...c) => c.forEach((x) => self.classSet.delete(x)),
      toggle: (c, on) => {
        const want = on === undefined ? !self.classSet.has(c) : Boolean(on);
        if (want) {
          self.classSet.add(c);
        } else {
          self.classSet.delete(c);
        }
        return want;
      },
      contains: (c) => self.classSet.has(c),
    };
  }

  get className() { return [...this.classSet].join(' '); }

  set className(v) { this.classSet = new Set(String(v).split(/\s+/).filter(Boolean)); }

  get textContent() { return this.textValue + this.children.map((c) => c.textContent).join(''); }

  set textContent(v) {
    this.children = [];
    this.textValue = v == null ? '' : String(v);
  }

  get hidden() { return 'hidden' in this.attrs; }

  set hidden(v) {
    if (v) {
      this.attrs.hidden = '';
    } else {
      delete this.attrs.hidden;
    }
  }

  append(...nodes) {
    for (const n of nodes) {
      const node = typeof n === 'string' ? Object.assign(new FakeElement('#text'), { textValue: n }) : n;
      node.parentNode = this;
      this.children.push(node);
    }
  }

  appendChild(n) {
    this.append(n);
    return n;
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
      this.parentNode = null;
    }
  }

  setAttribute(k, v) { this.attrs[k] = String(v); }

  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }

  removeAttribute(k) { delete this.attrs[k]; }

  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }

  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn); }

  setPointerCapture(id) { this.captured.push(id); }

  releasePointerCapture() {}

  hasPointerCapture(id) { return this.captured.includes(id); }

  getBoundingClientRect() {
    const b = this.box || { left: 0, top: 0, width: 0, height: 0 };
    return { ...b, x: b.left, y: b.top, right: b.left + b.width, bottom: b.top + b.height };
  }

  fire(type, init = {}) {
    let prevented = false;
    const e = {
      type, target: this, currentTarget: this, button: 0, buttons: 1, isPrimary: true, ...init,
      preventDefault() { prevented = true; },
      stopPropagation() {},
      stopImmediatePropagation() {},
    };
    for (const fn of this.listeners[type] || []) {
      fn(e);
    }
    return prevented;
  }

  /* The tree as the stylesheet sees it, listeners noted. */
  shape() {
    if (this.tagName === '#TEXT') {
      return JSON.stringify(this.textValue);
    }
    const on = Object.keys(this.listeners).filter((k) => this.listeners[k].length).sort();
    const attrs = Object.entries(this.attrs).sort().map(([k, v]) => `${k}=${v}`);
    const own = this.textValue ? ` "${this.textValue}"` : '';
    const head = `${this.tagName.toLowerCase()}.${[...this.classSet].sort().join('.')}${attrs.length ? `[${attrs.join(',')}]` : ''}${on.length ? `{${on.join(',')}}` : ''}${own}`;
    return this.children.length ? [head, this.children.map((c) => c.shape())] : head;
  }

  walk(fn) {
    fn(this);
    for (const c of this.children) {
      c.walk(fn);
    }
  }
}

globalThis.document = {
  createElement: (tag) => new FakeElement(tag),
  createTextNode: (t) => Object.assign(new FakeElement('#text'), { textValue: t }),
};
const nav = { maxTouchPoints: 5 };
Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });

const { touchWanted, mountTouchSticks } = await import('../src/input/touchsticks.js');
const everything = await import('../src/input/touchsticks.js');

/* ------------------------------------------------------------- touchWanted */

console.log('touchWanted');
check('the module exports touchWanted and mountTouchSticks and nothing else',
  JSON.stringify(Object.keys(everything).sort()) === '["mountTouchSticks","touchWanted"]', Object.keys(everything).join(' '));
for (const [what, value, want] of [
  ['five touch points', 5, true], ['one', 1, true], ['none', 0, false], ['undefined', undefined, false],
  ['null', null, false], ['a string "2"', '2', true], ['negative', -1, false],
]) {
  nav.maxTouchPoints = value;
  check(`${what}: ${want}`, touchWanted() === want);
}
Object.defineProperty(globalThis, 'navigator', { get() { throw new Error('no navigator'); }, configurable: true });
check('a navigator that throws: false', touchWanted() === false);
Object.defineProperty(globalThis, 'navigator', { value: { maxTouchPoints: 5 }, configurable: true, writable: true });

/* ------------------------------------------------------------- the trace */

const trace = [];
const calls = [];
const touch = mountTouchSticks({ onPause: () => calls.push('pause'), onSwap: () => calls.push('swap') });
const root = touch.root;

const zones = [];
const plates = [];
const nubs = [];
const caps = [];
const clickables = [];
root.walk((n) => {
  if (n.classSet.has('touch-zone')) { zones.push(n); }
  if (n.classSet.has('touch-plate')) { plates.push(n); }
  if (n.classSet.has('touch-nub')) { nubs.push(n); }
  if (n.classSet.has('osd-gimbal-cap')) { caps.push(n); }
  if ((n.listeners.click || []).length) { clickables.push(n); }
});
const [leftZone, rightZone] = zones;
const [leftPlate, rightPlate] = plates;
/* Two 126 px plates, the phone layout's size, at known places. */
leftPlate.box = { left: 40, top: 200, width: 126, height: 126 };
rightPlate.box = { left: 600, top: 200, width: 126, height: 126 };
leftZone.box = { left: 0, top: 0, width: 380, height: 400 };
rightZone.box = { left: 380, top: 0, width: 380, height: 400 };
const centre = (p) => [p.box.left + p.box.width / 2, p.box.top + p.box.height / 2];

const round = (v) => (typeof v === 'number' ? Number(v.toPrecision(12)) : v);
const tidy = (o) => JSON.parse(JSON.stringify(o, (k, v) => round(v)));

function snap(label, dtMs = null) {
  const row = { label };
  if (dtMs != null) {
    row.sample = tidy(touch.sample(dtMs));
  }
  row.active = touch.active();
  row.nubs = nubs.map((n) => `${n.style.left || ''} ${n.style.top || ''}`);
  row.held = plates.map((p) => p.classSet.has('is-held'));
  row.caps = caps.map((c) => c.textContent);
  row.root = `${root.className}|${root.hidden}|${root.style.display || ''}|${root.style.visibility || ''}`;
  row.debug = tidy(touch.debug());
  row.calls = calls.join(',');
  trace.push(row);
}

const ev = (id, x, y, type = 'touch') => ({ pointerId: id, clientX: x, clientY: y, pointerType: type });

snap('mounted, before anything is shown');
check('sample hands out a fresh object each call', touch.sample(0) !== touch.sample(0));
touch.setVisible(true);
touch.paint();
snap('mounted and shown', 16);

/* One thumb, left plate, Mode 2: touchdown off centre, a drag, past the
 * stop in every direction, then lift and spring back over time. */
const [lx, ly] = centre(leftPlate);
const [rx, ry] = centre(rightPlate);
snap(`down pointerdown prevented=${leftZone.fire('pointerdown', ev(1, lx + 10, ly + 5))}`, 16);
touch.paint();
for (const [dx, dy] of [[20, 0], [0, -30], [-45, 45], [200, 0], [0, 200], [-200, -200], [3, -7]]) {
  leftZone.fire('pointermove', ev(1, lx + 10 + dx, ly + 5 + dy));
  touch.paint();
  snap(`left drag ${dx},${dy}`, 16);
}
leftZone.fire('pointermove', ev(9, lx + 50, ly));
snap('a move from a pointer this zone never saw', 16);
leftZone.fire('pointerup', ev(1, lx, ly));
touch.paint();
for (const dt of [1, 16, 16, 33, 50, 100, 250, 1000]) {
  snap(`released, ${dt} ms`, dt);
}

/* Two thumbs at once, then a second finger on an already held plate. */
leftZone.fire('pointerdown', ev(2, lx, ly));
rightZone.fire('pointerdown', ev(3, rx, ry));
leftZone.fire('pointermove', ev(2, lx - 30, ly - 40));
rightZone.fire('pointermove', ev(3, rx + 25, ry + 60));
touch.paint();
snap('two thumbs', 16);
leftZone.fire('pointerdown', ev(4, lx + 60, ly + 60));
leftZone.fire('pointermove', ev(4, lx + 70, ly + 70));
snap('a second finger on the held left plate', 16);
leftZone.fire('pointerup', ev(4, lx, ly));
snap('the second finger lifts', 16);
rightZone.fire('pointercancel', ev(3, rx, ry));
snap('right cancelled', 16);
snap('right cancelled, later', 200);

/* Mode changes, including one mid hold. */
for (const mode of [1, 3, 4, 2, 'x', 3]) {
  touch.setStickMode(mode);
  touch.paint();
  leftZone.fire('pointermove', ev(2, lx - 10, ly + 30));
  snap(`mode ${mode} while left is held`, 16);
}
leftZone.fire('pointerup', ev(2, lx, ly));
snap('left lifts in mode 3', 16);
snap('left lifts in mode 3, later', 500);
rightZone.fire('pointerdown', ev(5, rx + 40, ry - 40));
rightZone.fire('pointermove', ev(5, rx + 80, ry - 80));
touch.paint();
snap('mode 3 right stick', 16);
touch.setStickMode(2);
touch.paint();
snap('back to mode 2 while right is held', 16);

/* Hiding and resetting while held. */
touch.setVisible(false);
touch.paint();
snap('hidden while held', 16);
rightZone.fire('pointermove', ev(5, rx, ry + 90));
snap('a move while hidden', 16);
touch.setVisible(true);
touch.paint();
snap('shown again', 16);
touch.reset();
touch.paint();
snap('reset while held', 16);
rightZone.fire('pointermove', ev(5, rx - 50, ry));
snap('a move after reset from the old finger', 16);
rightZone.fire('pointerup', ev(5, rx, ry));
snap('the old finger lifts', 16);

/* Pointers the zones should not answer to. */
for (const type of ['mouse', 'pen', 'touch']) {
  const prevented = leftZone.fire('pointerdown', ev(10, lx + 40, ly, type));
  leftZone.fire('pointermove', ev(10, lx + 50, ly - 20, type));
  snap(`${type} pointer down and move, prevented=${prevented}`, 16);
  leftZone.fire('pointerup', ev(10, lx, ly, type));
  snap(`${type} pointer up`, 300);
}
check('the context menu is suppressed on a zone', leftZone.fire('contextmenu', {}) === true);

/* The buttons. */
for (const b of clickables) {
  b.fire('click', {});
  snap(`click ${b.className} "${b.textContent}"`);
}
touch.setVisible(false);
for (const b of clickables) {
  b.fire('click', {});
  snap(`hidden, click ${b.className}`);
}

/* The same mode again while held, hiding while held off centre, and a
 * pointer type the browser left blank. */
touch.setVisible(true);
leftZone.fire('pointerdown', ev(20, lx, ly));
rightZone.fire('pointerdown', ev(21, rx, ry));
leftZone.fire('pointermove', ev(20, lx + 30, ly - 30));
rightZone.fire('pointermove', ev(21, rx - 30, ry + 30));
snap('both held off centre', 16);
touch.setStickMode(2);
leftZone.fire('pointermove', ev(20, lx + 40, ly - 40));
snap('the mode it already had, while held', 16);
rightZone.fire('pointermove', ev(21, rx - 40, ry + 40));
touch.setVisible(false);
snap('hidden while held off centre', 0);
snap('hidden, time passes', 16);
snap('hidden, more time', 300);
touch.setVisible(true);
leftZone.fire('pointerup', ev(20, lx, ly));
rightZone.fire('pointerup', ev(21, rx, ry));
snap('lifted after showing again', 16);
leftZone.fire('pointerdown', ev(22, lx, ly, ''));
leftZone.fire('pointermove', ev(22, lx + 20, ly, ''));
snap('a blank pointer type', 16);
leftZone.fire('pointerup', ev(22, lx, ly, ''));
snap('a blank pointer type lifts', 400);

/* Touchdown far from the plate, and a plate that resizes or has no size
 * yet mid drag. */
leftZone.fire('pointerdown', ev(23, 5, 390));
leftZone.fire('pointermove', ev(23, 25, 380));
snap('touchdown far from the plate', 16);
leftPlate.box = { left: 40, top: 200, width: 200, height: 200 };
leftZone.fire('pointermove', ev(23, 45, 370));
snap('the plate grows mid drag', 16);
leftZone.fire('pointerup', ev(23, 0, 0));
snap('lift', 400);
leftPlate.box = { left: 0, top: 0, width: 0, height: 0 };
leftZone.fire('pointerdown', ev(24, 100, 100));
leftZone.fire('pointermove', ev(24, 120, 90));
snap('a plate with no size', 16);
leftZone.fire('pointerup', ev(24, 0, 0));
leftPlate.box = { left: 40, top: 200, width: 126, height: 126 };
snap('lift from the sizeless plate', 400);

/* Tiny time steps and a zero step, which a stalled frame produces. */
touch.setVisible(true);
leftZone.fire('pointerdown', ev(11, lx, ly));
leftZone.fire('pointermove', ev(11, lx + 63, ly - 63));
leftZone.fire('pointerup', ev(11, lx, ly));
for (const dt of [0, 0.5, 4, 1e-3, 16]) {
  snap(`spring at dt ${dt}`, dt);
}

const result = {
  shape: root.shape(),
  captures: zones.map((z) => z.captured),
  trace,
};

console.log('\ngolden');
if (WRITE) {
  writeFileSync(GOLDEN, `${JSON.stringify(result, null, 1)}\n`);
  console.log(`wrote ${trace.length} steps to ${GOLDEN}`);
}
const want = JSON.parse(readFileSync(GOLDEN, 'utf8'));
check('the overlay\'s element tree, classes, attributes and listeners',
  JSON.stringify(want.shape) === JSON.stringify(result.shape), JSON.stringify(result.shape).slice(0, 400));
check('pointer capture on every touchdown the zones accept',
  JSON.stringify(want.captures) === JSON.stringify(result.captures), JSON.stringify(result.captures));
check('the same number of steps', want.trace.length === trace.length, `${trace.length} against ${want.trace.length}`);
for (let i = 0; i < want.trace.length; i += 1) {
  const w = JSON.stringify(want.trace[i]);
  const g = JSON.stringify(trace[i]);
  check(`step ${i}: ${want.trace[i].label}`, w === g, `\n      want ${w}\n      got  ${g}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
