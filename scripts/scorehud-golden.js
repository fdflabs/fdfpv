/*
 * scorehud-golden.js: src/ui/scorehud.js held to what it put on the screen
 * when tests/fixtures/scorehud-golden.json was written. npm run scorehud:golden.
 *
 * The overlay is driven through a fake document, a fake clock and fake
 * animation events, and after every scripted call the case writes the whole
 * tree under the host element ui.js hands the constructor. So what is pinned
 * is the DOM a player's browser would hold: every node, its tag, its class
 * set, its own text, whether it is hidden and its inline style, in order.
 *
 * WHAT IS NORMALISED, so a rewrite is free in how it gets there:
 *   classes        written as a sorted set: CSS does not read their order.
 *   text           empty text nodes dropped, adjacent ones merged, so
 *                  textContent = '' and replaceChildren() are the same tree.
 *   style          only non-empty properties, camelCase assignment and
 *                  setProperty folded to the same kebab name.
 *   hidden         the property and the attribute are one flag.
 *
 * WHAT IS NOT NORMALISED: animationend bubbles here as it does in a browser,
 * with a target and once listeners, because the burst inside a name row ends
 * before the row does and what that does to the row is something a player
 * sees. Timers run off a clock the case advances by hand, and the snapshots
 * either side of each lifetime pin when a node leaves the screen.
 *
 * WHAT IT CANNOT SEE: the forced reflows that restart a CSS animation on a
 * node that is already running one (the verdict, the tier badge) leave the
 * same final tree whether they happened or not. Those are kept in the code
 * on purpose and checked by eye.
 *
 * The record is written with --record; see scripts/lib/golden.js. Write it
 * again only on purpose, with the reason in the pull request.
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

import { goldenMain, seeded } from './lib/golden.js';
import { setLocale, useLocale } from '../src/strings/index.js';

/* ------------------------------------------------------------------ *
 * A clock. setTimeout is replaced before the module loads, so every
 * timer the overlay starts lands here and fires only when a case says
 * time has passed.
 * ------------------------------------------------------------------ */

const clock = {
  now: 0,
  seq: 0,
  timers: [],
  reset() {
    this.now = 0;
    this.timers = [];
  },
  advance(ms) {
    const end = this.now + ms;
    for (;;) {
      const due = this.timers
        .filter((t) => t.at <= end)
        .sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
      if (!due) break;
      this.timers.splice(this.timers.indexOf(due), 1);
      this.now = due.at;
      due.fn();
    }
    this.now = end;
  },
};

globalThis.setTimeout = (fn, ms = 0) => {
  clock.seq += 1;
  const t = { fn, at: clock.now + Math.max(0, Number(ms) || 0), seq: clock.seq };
  clock.timers.push(t);
  return t;
};
globalThis.clearTimeout = (t) => {
  const i = clock.timers.indexOf(t);
  if (i >= 0) clock.timers.splice(i, 1);
};

/* ------------------------------------------------------------------ *
 * A document small enough to read and wide enough that a rewrite does
 * not have to pick its DOM calls to suit the check.
 * ------------------------------------------------------------------ */

const kebab = (k) => (k.startsWith('--') ? k : k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));

function makeStyle() {
  const props = new Map();
  const api = {
    setProperty(k, v) { if (v == null || v === '') props.delete(k); else props.set(k, String(v)); },
    removeProperty(k) { props.delete(k); },
    getPropertyValue(k) { return props.get(k) ?? ''; },
  };
  return {
    props,
    proxy: new Proxy(api, {
      get(t, k) { return k in t ? t[k] : (typeof k === 'string' ? props.get(kebab(k)) ?? '' : undefined); },
      set(t, k, v) { api.setProperty(kebab(k), v); return true; },
    }),
  };
}

class FakeText {
  constructor(text) {
    this.nodeType = 3;
    this.data = String(text);
    this.parentNode = null;
  }

  get textContent() { return this.data; }

  set textContent(v) { this.data = String(v); }
}

class FakeElement {
  constructor(tag) {
    this.nodeType = 1;
    this.tagName = tag.toUpperCase();
    this.childNodes = [];
    this.parentNode = null;
    this.classes = [];
    this.hidden = false;
    this.listeners = [];
    const s = makeStyle();
    this.styleProps = s.props;
    this.style = s.proxy;
    const self = this;
    this.classList = {
      add(...c) { for (const x of c) if (!self.classes.includes(x)) self.classes.push(x); },
      remove(...c) { self.classes = self.classes.filter((x) => !c.includes(x)); },
      contains(c) { return self.classes.includes(c); },
      toggle(c, force) {
        const on = force === undefined ? !self.classes.includes(c) : Boolean(force);
        if (on) this.add(c); else this.remove(c);
        return on;
      },
      replace(a, b) {
        const i = self.classes.indexOf(a);
        if (i < 0) return false;
        self.classes[i] = b;
        self.classes = self.classes.filter((x, j) => self.classes.indexOf(x) === j);
        return true;
      },
      get length() { return self.classes.length; },
    };
  }

  get className() { return this.classes.join(' '); }

  set className(v) { this.classes = String(v).split(/\s+/).filter(Boolean); }

  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }

  get childElementCount() { return this.children.length; }

  get firstChild() { return this.childNodes[0] ?? null; }

  get lastChild() { return this.childNodes[this.childNodes.length - 1] ?? null; }

  get firstElementChild() { return this.children[0] ?? null; }

  get lastElementChild() { const c = this.children; return c[c.length - 1] ?? null; }

  get isConnected() {
    let n = this;
    while (n.parentNode) n = n.parentNode;
    return n === host;
  }

  get offsetWidth() { return 0; }

  get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }

  set textContent(v) {
    for (const n of this.childNodes) n.parentNode = null;
    this.childNodes = [];
    if (v != null && v !== '') this.appendChild(new FakeText(v));
  }

  setAttribute(k, v) {
    if (k === 'class') this.className = v;
    else if (k === 'hidden') this.hidden = true;
    else if (k === 'style') throw new Error('fake: style attribute not supported');
    else (this.attrs ??= new Map()).set(k, String(v));
  }

  removeAttribute(k) {
    if (k === 'class') this.classes = [];
    else if (k === 'hidden') this.hidden = false;
    else this.attrs?.delete(k);
  }

  toggleAttribute(k, force) {
    if (k !== 'hidden') throw new Error(`fake: toggleAttribute(${k}) not supported`);
    this.hidden = force === undefined ? !this.hidden : Boolean(force);
    return this.hidden;
  }

  #adopt(n) {
    const node = typeof n === 'string' ? new FakeText(n) : n;
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    return node;
  }

  appendChild(n) { this.childNodes.push(this.#adopt(n)); return n; }

  append(...ns) { for (const n of ns) this.appendChild(n); }

  prepend(...ns) { this.childNodes.unshift(...ns.map((n) => this.#adopt(n))); }

  insertBefore(n, ref) {
    if (ref == null) return this.appendChild(n);
    const node = this.#adopt(n);
    this.childNodes.splice(this.childNodes.indexOf(ref), 0, node);
    return n;
  }

  removeChild(n) {
    const i = this.childNodes.indexOf(n);
    if (i < 0) throw new Error('fake: removeChild of a node that is not a child');
    this.childNodes.splice(i, 1);
    n.parentNode = null;
    return n;
  }

  remove() { if (this.parentNode) this.parentNode.removeChild(this); }

  replaceChildren(...ns) {
    this.textContent = '';
    this.append(...ns);
  }

  addEventListener(type, fn, opts) {
    const once = typeof opts === 'object' && opts !== null && Boolean(opts.once);
    if (this.listeners.some((l) => l.type === type && l.fn === fn)) return;
    this.listeners.push({ type, fn, once });
  }

  removeEventListener(type, fn) {
    this.listeners = this.listeners.filter((l) => !(l.type === type && l.fn === fn));
  }
}

/* An animationend at node, bubbling to the top as a real one does. */
function fire(node, type = 'animationend') {
  const path = [];
  for (let n = node; n; n = n.parentNode) path.push(n);
  let stopped = false;
  const ev = {
    type,
    target: node,
    bubbles: true,
    animationName: 'fake',
    stopPropagation() { stopped = true; },
  };
  for (const n of path) {
    ev.currentTarget = n;
    for (const l of n.listeners.filter((x) => x.type === type)) {
      if (l.once) n.removeEventListener(type, l.fn);
      l.fn.call(n, ev);
    }
    if (stopped) break;
  }
}

globalThis.document = { createElement: (tag) => new FakeElement(tag) };

let host = new FakeElement('div');

function snap(n) {
  if (n.nodeType === 3) return null;
  const kids = [];
  for (const c of n.childNodes) {
    if (c.nodeType === 3) {
      if (c.data === '') continue;
      if (typeof kids[kids.length - 1] === 'string') kids[kids.length - 1] += c.data;
      else kids.push(c.data);
    } else {
      kids.push(snap(c));
    }
  }
  const style = [...n.styleProps].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}:${v}`);
  const out = { tag: n.tagName, cls: [...n.classes].sort() };
  if (n.hidden) out.hidden = true;
  if (style.length) out.style = style;
  if (kids.length) out.kids = kids;
  return out;
}

/* The nodes a case aims an event at, found by class the way CSS would. */
function all(cls, under = host) {
  const out = [];
  const walk = (n) => {
    if (n.nodeType !== 1) return;
    if (n.classes.includes(cls)) out.push(n);
    n.childNodes.forEach(walk);
  };
  walk(under);
  return out;
}

await useLocale('es');
setLocale('en');
const { ScoreHud } = await import('../src/ui/scorehud.js');

const FIXTURE = new URL('../tests/fixtures/scorehud-golden.json', import.meta.url);

/*
 * A case is a script of steps. Each step is [label, fn(hud)] and the tree
 * is written after it, so the stream reads as a film of the overlay.
 */
function scripted(id, locale, steps) {
  return {
    id,
    run(s) {
      setLocale(locale);
      clock.reset();
      host = new FakeElement('div');
      const hud = new ScoreHud(host);
      s.say('new', snap(host));
      for (const [label, fn] of steps) {
        s.call(label, () => fn(hud));
        s.say('dom', snap(host));
      }
      setLocale('en');
    },
  };
}

const view = (total, combo) => ({ total, streak: 0, state: 'run', remainMs: 60000, combo });
const combo = (points, mult, remain) => ({ names: [], points, mult, value: points * mult, remain });
const trick = (name, points, execution) => ({ kind: 'trick', name, points, execution });
const adv = (ms) => [`advance ${ms}`, () => clock.advance(ms)];
const fireOn = (cls, i = -1) => [`fire ${cls}[${i}]`, () => {
  const list = all(cls);
  const n = list.at(i);
  if (!n) return 'none';
  fire(n);
  return 'fired';
}];

const cases = [];

cases.push(scripted('construct-and-dispose', 'en', [
  ['dispose', (h) => h.dispose()],
  ['dispose again', (h) => h.dispose()],
]));

cases.push(scripted('visibility', 'en', [
  ['show', (h) => h.setVisible(true)],
  ['show again', (h) => h.setVisible(true)],
  ['hide', (h) => h.setVisible(false)],
  ['hide again', (h) => h.setVisible(false)],
  ['update while hidden', (h) => h.update(view(1234, combo(300, 3, 0.5)))],
  ['show with a tier', (h) => h.setVisible(true)],
  ['update tier 4', (h) => h.update(view(1234, combo(500, 4, 0.4)))],
  ['hide with a tier', (h) => h.setVisible(false)],
  ['show after hide', (h) => h.setVisible(true)],
]));

cases.push(scripted('nulls-and-unknowns', 'en', [
  ['update null', (h) => h.update(null)],
  ['update undefined', (h) => h.update(undefined)],
  ['events null', (h) => h.events(null)],
  ['events empty', (h) => h.events([])],
  ['events finish', (h) => h.events([{ kind: 'finish', points: 900, bonus: 0, mult: 2 }])],
  ['update total 0 no combo', (h) => h.update(view(0, null))],
  ['update total 0 again', (h) => h.update(view(0, null))],
]));

/* Every multiplier from nothing to past the top tier, up and back down,
 * two frames each, so a class that lives one frame shows as one frame. */
{
  const steps = [['show', (h) => h.setVisible(true)]];
  const mults = [0, 1, 2, 3, 4, 5, 6, 9, 5, 4, 3, 2, 1, 0, 3, 3, 5];
  mults.forEach((m, i) => {
    const v = view(1000 * i, combo(100 * i + 7, m, 1 - i / mults.length));
    steps.push([`update mult ${m}`, (h) => h.update(v)]);
    steps.push([`update mult ${m} again`, (h) => h.update(v)]);
  });
  steps.push(['combo ends', (h) => h.update(view(99999, null))]);
  steps.push(['combo ends again', (h) => h.update(view(99999, null))]);
  steps.push(['new combo tier 3', (h) => h.update(view(99999, combo(10, 3, 1)))]);
  steps.push(['combo ends', (h) => h.update(view(99999, null))]);
  steps.push(['new combo mult 1', (h) => h.update(view(99999, combo(10, 1, 1)))]);
  steps.push(['hide', (h) => h.setVisible(false)]);
  steps.push(['update tier 5 hidden', (h) => h.update(view(99999, combo(10, 5, 0.25)))]);
  steps.push(['show', (h) => h.setVisible(true)]);
  cases.push(scripted('combo-tiers', 'en', steps));
}

cases.push(scripted('numbers', 'en', [
  ['big total', (h) => h.update(view(1234567.6, combo(999.5, 2, 0)))],
  ['negative', (h) => h.update(view(-4321, combo(-1000, 1, 1)))],
  ['fractional remain', (h) => h.update(view(-4321, combo(1000, 1, 0.123456789)))],
  ['remain 1e-7', (h) => h.update(view(1000000, combo(1000, 1, 1e-7)))],
  ['trick fractional', (h) => h.events([trick('Power Loop', 1234.5, 'CLEAN')])],
  ['bank big', (h) => h.events([{ kind: 'bank', points: 1234567, mult: 3, names: [] }])],
]));

{
  const steps = [['show', (h) => h.setVisible(true)]];
  ['CLEAN', 'SLOPPY', 'BUMP', 'MISSED', 'CLEAN', 'BUMP', 'SLOPPY', 'CLEAN'].forEach((ex, i) => {
    steps.push([`trick ${ex}`, (h) => h.events([trick(`Trick ${i}`, 100 * (i + 1), ex)])]);
    steps.push(adv(100));
  });
  steps.push(adv(99));
  steps.push(adv(1));
  steps.push(adv(1000));
  steps.push(adv(299));
  steps.push(adv(1));
  steps.push(adv(5000));
  cases.push(scripted('name-stack-and-lifetimes', 'en', steps));
}

/* Each lifetime on its own, with a snapshot a millisecond either side. */
cases.push(scripted('lifetimes', 'en', [
  ['show', (h) => h.setVisible(true)],
  ['trick', (h) => h.events([trick('Roll', 100, 'CLEAN')])],
  adv(899),
  adv(1),
  ['bank', (h) => h.events([{ kind: 'bank', points: 100, mult: 1, names: [] }])],
  adv(1199),
  adv(1),
  adv(499),
  adv(1),
  ['bail', (h) => h.events([{ kind: 'bail', points: 5, names: [] }])],
  adv(1199),
  adv(1),
]));

cases.push(scripted('animationend', 'en', [
  ['show', (h) => h.setVisible(true)],
  ['three tricks', (h) => h.events([trick('A', 1, 'CLEAN'), trick('B', 2, 'SLOPPY'), trick('C', 3, 'BUMP')])],
  fireOn('score-burst', 0),
  fireOn('score-name-points', 0),
  fireOn('score-name-text', -1),
  fireOn('score-burst', -1),
  fireOn('score-name', 0),
  ['bank', (h) => h.events([{ kind: 'bank', points: 600, mult: 2, names: [] }])],
  fireOn('score-ring', 0),
  fireOn('score-verdict', 0),
  fireOn('score-ring', 0),
  ['bail', (h) => h.events([{ kind: 'bail', points: 20, names: [] }])],
  fireOn('score-ring', -1),
  fireOn('score-hud', 0),
  adv(900),
  adv(300),
  adv(2000),
]));

cases.push(scripted('bank-bail-reset', 'en', [
  ['show', (h) => h.setVisible(true)],
  ['combo', (h) => h.update(view(500, combo(250, 3, 0.8)))],
  ['tricks', (h) => h.events([trick('Roll', 100, 'CLEAN'), trick('Flip', 150, 'SLOPPY')])],
  ['bank', (h) => h.events([{ kind: 'bank', points: 750, mult: 3, names: [] }])],
  ['after bank', (h) => h.update(view(1250, null))],
  adv(1199),
  adv(1),
  ['tricks again', (h) => h.events([trick('Roll', 50, 'BUMP'), trick('Dive', 70, 'CLEAN')])],
  ['combo again', (h) => h.update(view(1250, combo(120, 2, 0.6)))],
  ['bail with points', (h) => h.events([{ kind: 'bail', points: 240, names: [] }])],
  ['bail with zero', (h) => h.events([{ kind: 'bail', points: 0, names: [] }])],
  ['bank and trick same frame', (h) => h.events([
    trick('Snap', 10, 'CLEAN'), { kind: 'bank', points: 10, mult: 1, names: [] }, trick('Next', 20, 'CLEAN'),
  ])],
  ['reset', (h) => h.reset()],
  ['update total after reset', (h) => h.update(view(0, null))],
  ['update total 5', (h) => h.update(view(5, null))],
  ['hide', (h) => h.setVisible(false)],
  ['reset hidden', (h) => h.reset()],
  adv(10000),
]));

cases.push(scripted('spanish', 'es', [
  ['show', (h) => h.setVisible(true)],
  ['combo', (h) => h.update(view(12000, combo(4000, 5, 0.5)))],
  ['trick', (h) => h.events([trick('Bucle', 4000, 'SLOPPY')])],
  ['bail with points', (h) => h.events([{ kind: 'bail', points: 20000, names: [] }])],
  ['bail with zero', (h) => h.events([{ kind: 'bail', points: 0, names: [] }])],
  ['bank', (h) => h.events([{ kind: 'bank', points: 1500, mult: 2, names: [] }])],
]));

/* A seeded walk through everything at once, the way a run mixes it. */
for (const seed of [1, 2, 3, 4, 5, 6]) {
  const r = seeded(seed * 7919);
  const steps = [];
  let total = 0;
  for (let i = 0; i < 120; i += 1) {
    const roll = r.next();
    if (roll < 0.35) {
      const c = r.chance(0.25) ? null : combo(r.int(0, 5000), r.int(0, 7), r.int(0, 100) / 100);
      if (r.chance(0.2)) total += r.int(0, 3000);
      const v = view(total, c);
      steps.push(['update', (h) => h.update(v)]);
    } else if (roll < 0.6) {
      const list = [];
      const n = r.int(0, 3);
      for (let k = 0; k < n; k += 1) {
        const kind = r.pick(['trick', 'trick', 'trick', 'bank', 'bail', 'finish']);
        if (kind === 'trick') {
          list.push(trick(r.pick(['Roll', 'Flip', 'Power Loop', 'Split-S', 'Matty']), r.int(0, 2000) + r.pick([0, 0.5]),
            r.pick(['CLEAN', 'CLEAN', 'SLOPPY', 'BUMP'])));
        } else {
          list.push({ kind, points: r.pick([0, r.int(1, 90000)]), names: [] });
        }
      }
      const arg = r.chance(0.05) ? null : list;
      steps.push(['events', (h) => h.events(arg)]);
    } else if (roll < 0.8) {
      steps.push(adv(r.int(1, 1500)));
    } else if (roll < 0.9) {
      const on = r.chance(0.7);
      steps.push([`visible ${on}`, (h) => h.setVisible(on)]);
    } else if (roll < 0.95) {
      steps.push(fireOn(r.pick(['score-burst', 'score-name', 'score-name-points', 'score-ring']), r.pick([0, -1])));
    } else {
      steps.push(['reset', (h) => h.reset()]);
    }
  }
  cases.push(scripted(`walk-${seed}`, seed % 2 ? 'en' : 'es', steps));
}

goldenMain('scorehud:golden', FIXTURE, cases);
