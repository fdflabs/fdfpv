/*
 * hangar.js: one plane on the stand, and what it flies with and wears.
 *
 * Opened from the aircraft picker's Customise (src/ui/carousel.js) on the
 * plane in the middle, and from the pause menu for the plane being flown.
 * The plane stands on a lit floor in a dark room drawn by the picker's own
 * renderer (src/render/carousel3d.js, src/render/hangarstage.js) from the
 * numbers frame() hands it: one model, no second WebGL context. Two tabs
 * beside it:
 *
 *   POWER    the motor or engine and the pack or tank, from the power
 *            options the shell hands in (configs/power.js through
 *            src/main.js), with the weight, the speed and the time in the
 *            air they make. Without power options it shows the stock
 *            setup, which is the only one there is.
 *   COLOURS  the preset schemes (configs/liveries.js), each region's
 *            colour from a palette of real covering, and a colour of the
 *            pilot's own.
 *
 * IT IS A GARAGE, NOT A FORM. The racing games' garages are the model
 * here (the design notes are in the pull request that brought this in):
 * the camera goes to what is being edited, so choosing the wing's colour
 * looks down on the wing and the Power tab looks at the nose; the cursor
 * PREVIEWS, so a swatch or a scheme under the cursor or the pointer is on
 * the plane before it is chosen and leaving it puts the choice back; a
 * scheme going on lands with a small pop and a ring running out across the
 * floor; the numbers count to their new values; the tabs slide; every move
 * of the cursor and every choice makes the menu's own sound. Nothing is
 * kept until Save, which hands back the livery entry and the power choice
 * the settings store. Back leaves them as they were. Reset to stock puts
 * both back to the kit's.
 *
 * Like the picker, THIS FILE IS THE CHOICE AND NOT THE PICTURE: nothing
 * here imports three.js, because scripts import src/ui/ui.js in Node.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { airframeById } from '../../configs/airframes.js';
import {
  coloursFor, colourNumbers, liveryKey, normaliseEntry, paletteColour, paletteFor, regionsFor, schemesFor,
} from '../../configs/liveries.js';
import { currentLocale, str } from '../strings/index.js';
import { sizeText, weightText } from './carousel.js';

export const HANGAR_TABS = ['power', 'colours'];

/*
 * TABS FROM OTHER MODULES. A module that adds a tab registers it here
 * instead of growing this file, and ui.js imports that module so it is
 * registered before the hangar first opens. A tab is
 *
 *   { id, paint(hangar) -> element,
 *     focus        where the camera goes when the tab comes up,
 *     open(hangar, settings)  the hangar opened on hangar.id: read what
 *                  the tab edits from the settings (read only),
 *     dirty()      whether Save would change anything,
 *     reset()      Reset to stock,
 *     save(hangar) -> { key: value } top level settings to replace, or null,
 *     frame(hangar, now) -> numbers the renderer reads under
 *                  frame().hangar.tabs[id],
 *     close(hangar)  shut, saved or not }
 *
 * Every hook but id and paint is optional. Its label is the string
 * hangar.tab_<id>. A tab asks for a repaint with hangar.changed(key).
 */
const TAB_HOOKS = {};

export function registerHangarTab(tab) {
  if (!tab || !tab.id || typeof tab.paint !== 'function' || HANGAR_TABS.includes(tab.id)) {
    throw new Error(`hangar tab ${tab && tab.id} is malformed or registered twice`);
  }
  TAB_HOOKS[tab.id] = tab;
  HANGAR_TABS.push(tab.id);
}

function tabFocus(t) {
  const h = TAB_HOOKS[t];
  return h && h.focus ? h.focus : t === 'power' ? 'nose' : 'overview';
}

function eachHook(fn) {
  for (const t of HANGAR_TABS) {
    if (TAB_HOOKS[t]) {
      fn(TAB_HOOKS[t], t);
    }
  }
}

/* The model's turn under a drag: radians per CSS pixel. */
const DRAG_TURN = 0.012;
/* How long a number takes to count to its new value, ms. */
const COUNT_MS = 520;
/* The fewest ms between two cursor sounds from the pointer passing over
 * swatches, so a sweep across a row is a ripple and not a buzz. */
const HOVER_SOUND_MS = 70;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) {
    n.className = cls;
  }
  if (text != null) {
    n.textContent = text;
  }
  return n;
}

function button(cls, text) {
  const b = el('button', cls, text);
  b.type = 'button';
  return b;
}

function number(n, digits = 0) {
  return n.toLocaleString(currentLocale(), { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

/*
 * THE POWER THE HANGAR OFFERS WITHOUT POWER OPTIONS: the aircraft as
 * configs/airframes.js has it, one setup, its weight and its top speed.
 * The shape is the one src/main.js builds from configs/power.js, so the
 * tab draws either the same way.
 */
export function stockPower(airframeId) {
  const af = airframeById(airframeId);
  return {
    options: [{ id: 'stock', name: str('hangar.stock_setup'), kind: af.voice === 'glow' ? 'glow' : 'electric', packs: [] }],
    stock: { option: 'stock', pack: null },
    estimate: () => ({ grams: af.grams, topSpeed: af.topSpeed ?? null, minutes: null, thrustToWeight: null }),
  };
}

/* The power choice a stored one names, made valid for these options. */
export function powerChoice(power, stored) {
  const option = power.options.find((o) => stored && o.id === stored.option) ?? power.options[0];
  const packs = option.packs ?? [];
  const pack = packs.find((p) => stored && p.id === stored.pack) ?? packs[0] ?? null;
  return { option: option.id, pack: pack ? pack.id : null };
}

/* The readouts on the Power tab: how each is shown, and which way is up. */
const STATS = [
  { key: 'grams', label: 'hangar.weight', text: (v) => str('carousel.grams', { n: number(v) }) },
  { key: 'topSpeed', label: 'hangar.top_speed', text: (v) => str('hangar.kmh', { n: number(v * 3.6) }) },
  { key: 'thrustToWeight', label: 'hangar.thrust', text: (v) => str('hangar.thrust_ratio', { n: number(v, 1) }) },
  { key: 'minutes', label: 'hangar.flight_time', text: (v) => str('hangar.minutes', { n: number(v) }) },
];

export class Hangar {
  constructor(host) {
    this.host = host;
    this.isOpen = false;
    this.opts = null;
    this.tab = HANGAR_TABS[0];
    this.turn = 0;
    this.drag = null;
    this.padPrev = null;
    this.hintKind = 'key';
    this.focus = 'overview';
    this.hover = null;
    this.revealSeq = 0;
    this.pulseSeq = 0;
    this.lastHoverSound = 0;
    /* The numbers on show and where each is counting to. */
    this.counts = {};
    this.build();
  }

  build() {
    const root = el('div', 'hangar');
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    this.root = root;

    const head = el('div', 'hangar-head');
    const titles = el('div', 'hangar-titles');
    this.titleEl = el('div', 'hangar-title', str('hangar.title'));
    this.nameEl = el('div', 'hangar-name');
    this.factsEl = el('div', 'carousel-facts hangar-facts');
    titles.append(this.titleEl, this.nameEl, this.factsEl);
    this.tabs = el('div', 'carousel-tabs hangar-tabs');
    this.tabs.setAttribute('role', 'tablist');
    this.tabPill = el('span', 'hangar-tab-pill');
    this.tabs.append(this.tabPill);
    this.tabEls = {};
    this.buildTabs();
    head.append(titles, this.tabs);

    this.stage = el('div', 'hangar-stage');
    this.bindStage();
    this.side = el('div', 'hangar-side');
    this.side.addEventListener('pointerleave', () => this.endHover());

    const body = el('div', 'hangar-body');
    body.append(this.stage, this.side);

    const foot = el('div', 'hangar-foot');
    this.warnEl = el('p', 'carousel-warn hangar-warn');
    const buttons = el('div', 'hangar-buttons');
    this.resetBtn = button('hangar-reset', str('hangar.reset'));
    this.resetBtn.dataset.key = 'reset';
    this.backBtn = button('carousel-back', str('ui.back'));
    this.backBtn.dataset.key = 'back';
    this.saveBtn = button('carousel-choose hangar-save', str('hangar.save'));
    this.saveBtn.dataset.key = 'save';
    this.resetBtn.addEventListener('click', () => this.reset());
    this.backBtn.addEventListener('click', () => this.cancel());
    this.saveBtn.addEventListener('click', () => this.save());
    const right = el('div', 'hangar-buttons-end');
    right.append(this.backBtn, this.saveBtn);
    buttons.append(this.resetBtn, right);
    this.hintEl = el('p', 'carousel-hint');
    foot.append(this.warnEl, buttons, this.hintEl);

    /* The pilot's own colour: the browser's picker, opened by a button. */
    this.customInput = el('input', 'hangar-custom-input');
    this.customInput.type = 'color';
    this.customInput.tabIndex = -1;
    this.customInput.addEventListener('input', () => this.pickColour(this.customInput.value));

    const panel = el('div', 'hangar-panel');
    this.panel = panel;
    panel.append(head, body, foot, this.customInput);
    /* The camera follows the cursor: whatever control has it says what it
     * is about (data-focus), and the view goes there. */
    panel.addEventListener('focusin', (e) => {
      const f = e.target.dataset && e.target.dataset.focus;
      if (f) {
        this.focus = f;
      }
    });
    root.append(panel);
    root.addEventListener('click', (e) => e.stopPropagation());
    root.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') {
        e.preventDefault();
      }
    });
    this.host.append(root);
  }

  /* A tab button for every tab, including any registered since the last. */
  buildTabs() {
    for (const t of HANGAR_TABS) {
      if (this.tabEls[t]) {
        continue;
      }
      const b = button('carousel-tab hangar-tab-btn', str(`hangar.tab_${t}`));
      b.setAttribute('role', 'tab');
      b.dataset.key = `tab-${t}`;
      b.addEventListener('click', () => this.setTab(t));
      this.tabEls[t] = b;
      this.tabs.append(b);
    }
  }

  bindStage() {
    const s = this.stage;
    s.style.touchAction = 'none';
    s.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) {
        return;
      }
      e.preventDefault();
      if (e.pointerType === 'touch') {
        this.setHint('touch');
      }
      this.drag = { id: e.pointerId, x: e.clientX };
      s.setPointerCapture(e.pointerId);
    });
    s.addEventListener('pointermove', (e) => {
      if (!this.drag || e.pointerId !== this.drag.id) {
        return;
      }
      this.turn += (e.clientX - this.drag.x) * DRAG_TURN;
      this.drag.x = e.clientX;
    });
    const end = (e) => {
      if (this.drag && e.pointerId === this.drag.id) {
        this.drag = null;
      }
    };
    s.addEventListener('pointerup', end);
    s.addEventListener('pointercancel', end);
  }

  /*
   * Open it on one plane. `livery` is its stored entry (settings.livery),
   * `power` the options src/main.js built for it with the stored choice
   * (`power.chosen`), `warn` a line over the buttons for what saving will
   * cost. onPreview(numbers) is called with the region colours on every
   * change, onSave({ livery, power, liveryChanged, powerChanged }) with
   * what to store, onCancel with nothing, sound(kind) for the menu's
   * sounds. `settings` is what registered tabs read theirs from, and Save
   * hands back their patch as `settings` beside the rest.
   */
  open({ airframe, livery = null, power = null, warn = '', hint = 'key', tab = null, settings = {}, onPreview, onSave, onCancel, sound } = {}) {
    this.buildTabs();
    this.id = airframe;
    this.family = liveryKey(airframe);
    this.saved = normaliseEntry(this.family, livery) ?? {};
    this.entry = JSON.parse(JSON.stringify(this.saved));
    this.power = power ?? stockPower(airframe);
    this.savedPower = powerChoice(this.power, this.power.chosen);
    this.choice = { ...this.savedPower };
    this.regions = regionsFor(airframe);
    this.region = this.regions.length ? this.regions[0].id : null;
    this.opts = { onPreview, onSave, onCancel, sound };
    this.tab = HANGAR_TABS.includes(tab) ? tab : HANGAR_TABS[0];
    this.hintKind = hint;
    this.turn = 0;
    this.drag = null;
    this.padPrev = null;
    this.hover = null;
    this.counts = {};
    this.revealSeq += 1;
    this.focus = tabFocus(this.tab);
    this.isOpen = true;
    eachHook((h) => h.open && h.open(this, settings));
    const af = airframeById(airframe);
    this.nameEl.textContent = af.name;
    this.factsEl.textContent = '';
    for (const f of [sizeText(airframe), weightText(airframe)]) {
      this.factsEl.append(el('span', 'carousel-fact', f));
    }
    this.warnEl.textContent = warn || '';
    this.warnEl.hidden = !warn;
    this.root.hidden = false;
    this.host.classList.add('hangar-open');
    /* The entrance: the panel and the header play their CSS reveal once. */
    this.root.classList.remove('entering');
    void this.root.offsetWidth;
    this.root.classList.add('entering');
    this.openT = performance.now();
    this.paint(0);
    this.preview();
    this.focusKey(`tab-${this.tab}`);
    this.sound('select');
  }

  close() {
    if (!this.isOpen) {
      return;
    }
    this.isOpen = false;
    eachHook((h) => h.close && h.close(this));
    this.opts = null;
    this.drag = null;
    this.hover = null;
    this.root.hidden = true;
    this.host.classList.remove('hangar-open');
  }

  sound(kind) {
    if (this.opts && this.opts.sound) {
      this.opts.sound(kind);
    }
  }

  colours(entry = this.entry) {
    return coloursFor(this.id, entry);
  }

  /* The entry on show: the chosen one, with whatever the cursor or the
   * pointer is over tried on it. */
  shownEntry() {
    const h = this.hover;
    if (!h) {
      return this.entry;
    }
    if (h.scheme) {
      return h.scheme === 'stock' ? {} : { scheme: h.scheme };
    }
    return { ...this.entry, regions: { ...(this.entry.regions ?? {}), [h.region]: h.hex } };
  }

  /* Show the plane in what is on show now. Due rather than done: the
   * next frame paints it once, however many things changed in between,
   * which matters for the Kadet, whose films are maps drawn in script. */
  preview() {
    this.previewDue = true;
  }

  flushPreview() {
    if (this.previewDue && this.opts && this.opts.onPreview) {
      this.previewDue = false;
      this.opts.onPreview(colourNumbers(this.colours(this.shownEntry())));
    }
  }

  /* The cursor or the pointer is over a choice: try it on the plane. */
  tryOn(h) {
    if (this.hover === h) {
      return;
    }
    this.hover = h;
    this.preview();
  }

  endHover() {
    if (this.hover) {
      this.hover = null;
      this.preview();
    }
    const a = document.activeElement;
    if (a && this.panel.contains(a) && a.dataset.focus) {
      this.focus = a.dataset.focus;
    }
  }

  dirty() {
    const a = JSON.stringify(normaliseEntry(this.family, this.entry));
    const b = JSON.stringify(normaliseEntry(this.family, this.saved));
    let tabs = false;
    eachHook((h) => {
      tabs = tabs || Boolean(h.dirty && h.dirty());
    });
    return tabs || a !== b || this.choice.option !== this.savedPower.option || this.choice.pack !== this.savedPower.pack;
  }

  setTab(t) {
    if (!HANGAR_TABS.includes(t) || t === this.tab) {
      return;
    }
    const dir = HANGAR_TABS.indexOf(t) > HANGAR_TABS.indexOf(this.tab) ? 1 : -1;
    this.tab = t;
    this.hover = null;
    this.focus = tabFocus(t);
    this.paint(dir);
    this.preview();
    this.focusKey(`tab-${t}`);
    this.sound('adjust');
  }

  cycleTab(dir) {
    const i = HANGAR_TABS.indexOf(this.tab);
    this.setTab(HANGAR_TABS[(i + dir + HANGAR_TABS.length) % HANGAR_TABS.length]);
  }

  /* A preset: its colours whole, the pilot's own per region dropped. */
  pickScheme(id) {
    this.entry = id === 'stock' ? {} : { scheme: id };
    this.pulseSeq += 1;
    this.changed(`scheme-${id}`);
  }

  pickRegion(id) {
    this.region = id;
    this.focus = id;
    this.changed(`region-${id}`, 'move');
  }

  /* A colour for the region being painted. The scheme's own colour there
   * is no override, so picking it back takes the override away. */
  pickColour(hex) {
    if (!this.region) {
      return;
    }
    const v = hex.toLowerCase();
    const bare = coloursFor(this.id, { scheme: this.entry.scheme })[this.region];
    const regions = { ...(this.entry.regions ?? {}) };
    if (v === bare) {
      delete regions[this.region];
    } else {
      regions[this.region] = v;
    }
    this.entry = { ...this.entry, regions };
    if (!Object.keys(regions).length) {
      delete this.entry.regions;
    }
    this.changed(`colour-${v}`);
  }

  pickOption(id) {
    this.choice = powerChoice(this.power, { option: id, pack: this.choice.pack });
    this.focus = 'motor';
    this.changed(`option-${id}`);
  }

  pickPack(id) {
    this.choice = { ...this.choice, pack: id };
    this.focus = 'pack';
    this.changed(`pack-${id}`);
  }

  /* A card progression may not have opened yet: src/ui/progress-ui.js
   * sets markLock when the hangar opens, and it dims and disables it. */
  lockMark(b, kind, id) {
    if (this.markLock) {
      this.markLock(b, kind, id);
    }
  }

  reset() {
    this.entry = {};
    this.choice = { ...this.power.stock };
    eachHook((h) => h.reset && h.reset());
    this.pulseSeq += 1;
    this.changed('reset');
  }

  changed(focusKey, sound = 'select') {
    this.hover = null;
    this.paint(0);
    this.preview();
    this.focusKey(focusKey);
    this.sound(sound);
  }

  save() {
    const save = this.opts && this.opts.onSave;
    const result = {
      livery: normaliseEntry(this.family, this.entry),
      power: { ...this.choice },
      liveryChanged: JSON.stringify(normaliseEntry(this.family, this.entry)) !== JSON.stringify(normaliseEntry(this.family, this.saved)),
      powerChanged: this.choice.option !== this.savedPower.option || this.choice.pack !== this.savedPower.pack,
      settings: {},
    };
    eachHook((h) => {
      if (h.save) {
        Object.assign(result.settings, h.save(this));
      }
    });
    this.sound('select');
    this.close();
    if (save) {
      save(result);
    }
  }

  cancel() {
    const back = this.opts && this.opts.onCancel;
    this.sound('back');
    this.close();
    if (back) {
      back();
    }
  }

  /* Everything in the side panel, from the state. Called on every change:
   * a few dozen buttons, and only when the pilot does something. `slide`
   * is the direction a new tab comes in from, 0 for none. */
  paint(slide) {
    for (const [t, b] of Object.entries(this.tabEls)) {
      b.classList.toggle('on', t === this.tab);
      b.setAttribute('aria-selected', String(t === this.tab));
    }
    this.placePill();
    this.side.textContent = '';
    const hook = TAB_HOOKS[this.tab];
    const tab = hook ? hook.paint(this) : this.tab === 'power' ? this.powerTab() : this.coloursTab();
    if (slide) {
      tab.classList.add(slide > 0 ? 'from-right' : 'from-left');
    }
    this.side.append(tab);
    this.saveBtn.classList.toggle('dirty', this.dirty());
    this.paintHint();
  }

  /* The tabs' pill slides under the tab that is on. */
  placePill() {
    const b = this.tabEls[this.tab];
    if (!b || !b.offsetWidth) {
      requestAnimationFrame(() => {
        if (this.isOpen && b.offsetWidth) {
          this.placePill();
        }
      });
      return;
    }
    this.tabPill.style.width = `${b.offsetWidth}px`;
    this.tabPill.style.transform = `translateX(${b.offsetLeft - 3}px)`;
  }

  setHint(kind) {
    if (this.hintKind !== kind) {
      this.hintKind = kind;
      this.paintHint();
    }
  }

  paintHint() {
    this.hintEl.textContent = str(`hangar.hint_${this.hintKind === 'touch' ? 'touch' : this.hintKind === 'pad' ? 'pad' : 'keys'}`);
  }

  /* A button the cursor tries on: over it, or onto it with the keys, the
   * plane wears it; off it, the plane goes back. */
  trial(b, h, focus) {
    b.dataset.focus = focus;
    const on = () => this.tryOn(h);
    b.addEventListener('pointerenter', () => {
      this.focus = focus;
      on();
      const now = performance.now();
      if (now - this.lastHoverSound > HOVER_SOUND_MS) {
        this.lastHoverSound = now;
        this.sound('move');
      }
    });
    b.addEventListener('focus', on);
    const off = () => {
      if (this.hover === h) {
        this.hover = null;
        this.preview();
      }
    };
    b.addEventListener('blur', off);
    b.addEventListener('pointerleave', off);
  }

  powerTab() {
    const box = el('div', 'hangar-tab');
    const option = this.power.options.find((o) => o.id === this.choice.option) ?? this.power.options[0];
    const glow = option.kind === 'glow';
    box.append(el('h3', 'hangar-h', str(glow ? 'hangar.engine' : 'hangar.motor')));
    const opts = el('div', 'hangar-cards');
    this.power.options.forEach((o, i) => {
      const b = button(`hangar-card${o.id === option.id ? ' on' : ''}`);
      b.dataset.key = `option-${o.id}`;
      b.dataset.focus = 'motor';
      b.style.setProperty('--i', String(i));
      b.append(el('span', 'hangar-card-name', o.name));
      if (o.detail) {
        b.append(el('span', 'hangar-card-detail', o.detail));
      }
      b.setAttribute('aria-pressed', String(o.id === option.id));
      b.addEventListener('pointerenter', () => {
        this.focus = 'motor';
      });
      b.addEventListener('click', () => this.pickOption(o.id));
      this.lockMark(b, 'power', o.id);
      opts.append(b);
    });
    box.append(opts);
    const packs = option.packs ?? [];
    if (packs.length) {
      box.append(el('h3', 'hangar-h', str(glow ? 'hangar.tank' : 'hangar.pack')));
      const row = el('div', 'hangar-cards hangar-cards-small');
      packs.forEach((p, i) => {
        const b = button(`hangar-card${p.id === this.choice.pack ? ' on' : ''}`);
        b.dataset.key = `pack-${p.id}`;
        b.dataset.focus = 'pack';
        b.style.setProperty('--i', String(i));
        b.append(el('span', 'hangar-card-name', p.name));
        if (p.detail) {
          b.append(el('span', 'hangar-card-detail', p.detail));
        }
        b.setAttribute('aria-pressed', String(p.id === this.choice.pack));
        b.addEventListener('pointerenter', () => {
          this.focus = 'pack';
        });
        b.addEventListener('click', () => this.pickPack(p.id));
        row.append(b);
      });
      box.append(row);
    }
    box.append(this.statsBlock());
    box.append(el('p', 'hangar-note', str(`carousel.note.${this.id}`)));
    if (option.source) {
      box.append(el('p', 'hangar-source', str('hangar.source', { source: option.source })));
    }
    return box;
  }

  /*
   * The readouts, each a number that counts from what was on show to the
   * new value (frame() moves it) and a bar against the most any choice on
   * offer makes, with the difference from the kit's own under it.
   */
  statsBlock() {
    const est = this.power.estimate(this.choice);
    const stock = this.power.estimate(this.power.stock);
    const all = [];
    for (const o of this.power.options) {
      const packs = (o.packs && o.packs.length) ? o.packs : [{ id: null }];
      for (const p of packs) {
        all.push(this.power.estimate({ option: o.id, pack: p.id }));
      }
    }
    const stats = el('div', 'hangar-stats');
    this.statEls = {};
    for (const s of STATS) {
      const v = est[s.key];
      if (v == null) {
        continue;
      }
      const top = Math.max(...all.map((e) => e[s.key] ?? 0), v, 1e-9);
      const box = el('div', 'hangar-stat');
      const value = el('span', 'hangar-stat-value');
      const bar = el('span', 'hangar-stat-bar');
      const fill = el('span', 'hangar-stat-fill');
      bar.append(fill);
      const delta = el('span', 'hangar-stat-delta');
      const d = stock[s.key] != null ? v - stock[s.key] : 0;
      if (Math.abs(d) > 1e-9) {
        delta.textContent = `${d > 0 ? '+' : '-'}${s.text(Math.abs(d))}`;
      }
      box.append(el('span', 'hangar-stat-label', str(s.label)), value, bar, delta);
      stats.append(box);
      const c = this.counts[s.key];
      const from = c ? c.shown : v;
      this.counts[s.key] = { from, to: v, shown: from, t0: performance.now() };
      this.statEls[s.key] = { value, fill, text: s.text, top };
      value.textContent = s.text(from);
      fill.style.transform = `scaleX(${Math.max(0.02, from / top)})`;
    }
    return stats;
  }

  /* Count the readouts on toward their values: called every frame. */
  countOn(now) {
    if (!this.statEls) {
      return;
    }
    for (const [key, c] of Object.entries(this.counts)) {
      const e = this.statEls[key];
      if (!e || c.shown === c.to) {
        continue;
      }
      const t = Math.min(1, (now - c.t0) / COUNT_MS);
      const k = 1 - (1 - t) ** 3;
      c.shown = t >= 1 ? c.to : c.from + (c.to - c.from) * k;
      e.value.textContent = e.text(c.shown);
      e.fill.style.transform = `scaleX(${Math.max(0.02, c.shown / e.top)})`;
    }
  }

  coloursTab() {
    const box = el('div', 'hangar-tab');
    const colours = this.colours();
    const own = this.entry.regions ?? {};
    const current = this.entry.scheme ?? 'stock';

    box.append(el('h3', 'hangar-h', str('hangar.schemes')));
    const grid = el('div', 'hangar-schemes');
    schemesFor(this.id).forEach((sc, i) => {
      const on = sc.id === current;
      const b = button(`hangar-scheme${on ? ' on' : ''}`);
      b.dataset.key = `scheme-${sc.id}`;
      b.style.setProperty('--i', String(i));
      b.setAttribute('aria-pressed', String(on));
      const strip = el('span', 'hangar-strip');
      for (const [id, hex] of Object.entries(coloursFor(this.id, { scheme: sc.id }))) {
        const bar = el('span', `hangar-strip-bar${this.filmRegion(id) ? ' film' : ''}`);
        bar.style.background = hex;
        strip.append(bar);
      }
      b.append(strip, el('span', 'hangar-scheme-name', str(`livery.scheme.${this.family}.${sc.id}`)));
      if (on && Object.keys(own).length) {
        b.append(el('span', 'hangar-scheme-tag', str('hangar.modified')));
      }
      this.trial(b, { scheme: sc.id }, 'overview');
      b.addEventListener('click', () => this.pickScheme(sc.id));
      this.lockMark(b, 'scheme', sc.id);
      grid.append(b);
    });
    box.append(grid);
    const scheme = schemesFor(this.id).find((s) => s.id === current);
    if (scheme && scheme.source) {
      box.append(el('p', 'hangar-source', str('hangar.source', { source: scheme.source.label })));
    }

    box.append(el('h3', 'hangar-h', str('hangar.regions')));
    const list = el('div', 'hangar-regions');
    for (const r of this.regions) {
      const on = r.id === this.region;
      const b = button(`hangar-region${on ? ' on' : ''}`);
      b.dataset.key = `region-${r.id}`;
      b.dataset.focus = r.id;
      b.setAttribute('aria-pressed', String(on));
      const dot = el('span', `hangar-dot${r.film ? ' film' : ''}`);
      dot.style.background = colours[r.id];
      b.append(dot, el('span', 'hangar-region-name', str(`livery.region.${r.id}`)));
      b.addEventListener('pointerenter', () => {
        this.focus = r.id;
      });
      b.addEventListener('click', () => this.pickRegion(r.id));
      list.append(b);
    }
    box.append(list);

    const region = this.regions.find((r) => r.id === this.region);
    if (region) {
      const hex = colours[region.id];
      /* The scheme's own colour here, which is the first swatch, so there
       * is always a way back to it. */
      const kit = coloursFor(this.id, { scheme: this.entry.scheme })[region.id];
      const named = paletteColour(hex);
      const nameBox = el('div', 'hangar-colour');
      const chip = el('span', `hangar-colour-chip${region.film ? ' film' : ''}`);
      chip.style.setProperty('--swatch', hex);
      const words = el('span', 'hangar-colour-words');
      const brand = named ? named.brand : str(hex === kit ? 'hangar.kit_colour' : 'hangar.custom');
      words.append(
        el('span', 'hangar-colour-brand', brand),
        el('span', 'hangar-colour-name', named ? named.name : hex),
      );
      nameBox.append(chip, words);
      box.append(nameBox);
      const pal = el('div', 'hangar-palette');
      const swatches = paletteFor(region);
      if (!swatches.some((c) => c.hex === kit)) {
        swatches.unshift({ brand: str('hangar.kit_colour'), name: kit, hex: kit, film: region.film });
      }
      swatches.forEach((c, i) => {
        const on = c.hex === hex;
        const b = button(`hangar-swatch${c.film ? ' film' : ''}${on ? ' on' : ''}`);
        b.dataset.key = `colour-${c.hex}`;
        b.style.setProperty('--swatch', c.hex);
        b.style.setProperty('--i', String(i));
        b.title = `${c.brand} ${c.name}`;
        b.setAttribute('aria-label', `${c.brand} ${c.name}`);
        b.setAttribute('aria-pressed', String(on));
        this.trial(b, { region: region.id, hex: c.hex }, region.id);
        b.addEventListener('click', () => this.pickColour(c.hex));
        pal.append(b);
      });
      const custom = button(`hangar-swatch hangar-swatch-custom${!swatches.some((c) => c.hex === hex) ? ' on' : ''}`, '+');
      custom.dataset.key = 'custom';
      custom.dataset.focus = region.id;
      custom.title = str('hangar.custom');
      custom.setAttribute('aria-label', str('hangar.custom'));
      custom.addEventListener('click', () => {
        this.customInput.value = hex;
        this.customInput.click();
      });
      pal.append(custom);
      box.append(pal);
      if (region.film) {
        box.append(el('p', 'hangar-source', str('hangar.film_note')));
      }
    }
    return box;
  }

  filmRegion(id) {
    const r = this.regions.find((x) => x.id === id);
    return Boolean(r && r.film);
  }

  /* The controls the cursor walks: every enabled button showing. */
  stops() {
    return [...this.panel.querySelectorAll('button')].filter((b) => !b.disabled && b.offsetParent !== null);
  }

  focusKey(key) {
    const b = this.stops().find((x) => x.dataset.key === key) ?? this.stops()[0];
    if (b) {
      b.focus({ preventScroll: false });
    }
  }

  /*
   * The cursor, by where things are on screen rather than by a list: the
   * nearest control in the direction pressed, a sideways offset counting
   * double, so a swatch grid, a column of regions and the row of buttons
   * all walk the way they look.
   */
  move(dx, dy) {
    const stops = this.stops();
    const at = stops.indexOf(document.activeElement);
    if (at < 0) {
      if (stops[0]) {
        stops[0].focus();
      }
      return;
    }
    const r0 = stops[at].getBoundingClientRect();
    const cx = r0.left + r0.width / 2;
    const cy = r0.top + r0.height / 2;
    let best = null;
    let bestScore = Infinity;
    for (const b of stops) {
      if (b === stops[at]) {
        continue;
      }
      const r = b.getBoundingClientRect();
      const x = r.left + r.width / 2 - cx;
      const y = r.top + r.height / 2 - cy;
      const along = x * dx + y * dy;
      if (along <= 1) {
        continue;
      }
      const across = Math.abs(dx ? y : x);
      const score = along + 2 * across;
      if (score < bestScore) {
        bestScore = score;
        best = b;
      }
    }
    if (!best) {
      return;
    }
    /* Leaving the side panel downward while it has more below its fold:
     * the readouts and the notes under the last control are not stops, so
     * Down shows them first and leaves for the buttons on the next press. */
    const leavingSide = dy > 0 && this.side.contains(stops[at]) && !this.side.contains(best);
    if (leavingSide && this.side.scrollTop + this.side.clientHeight < this.side.scrollHeight - 1) {
      this.side.scrollTo(0, this.side.scrollHeight);
    } else {
      best.focus();
    }
    this.sound('move');
  }

  activate() {
    const b = document.activeElement;
    if (b && this.panel.contains(b) && b.tagName === 'BUTTON') {
      b.click();
    }
  }

  /* Every key while it is up is the hangar's. */
  handleKey(code) {
    this.setHint('key');
    if (code === 'ArrowLeft' || code === 'KeyA') {
      this.move(-1, 0);
    } else if (code === 'ArrowRight' || code === 'KeyD') {
      this.move(1, 0);
    } else if (code === 'ArrowUp' || code === 'KeyW') {
      this.move(0, -1);
    } else if (code === 'ArrowDown' || code === 'KeyS') {
      this.move(0, 1);
    } else if (code === 'KeyQ' || code === 'PageUp') {
      this.cycleTab(-1);
    } else if (code === 'KeyE' || code === 'PageDown') {
      this.cycleTab(1);
    } else if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') {
      this.activate();
    } else if (code === 'Escape' || code === 'Backspace') {
      this.cancel();
    }
    return true;
  }

  /* A gamepad or a radio, { up, down, left, right, select, back, alt },
   * edge triggered, the first poll only learning what is held
   * (Carousel.pollPad). X, alt, turns the tabs. */
  pollPad(nav) {
    const now = {
      up: Boolean(nav.up),
      down: Boolean(nav.down),
      left: Boolean(nav.left),
      right: Boolean(nav.right),
      select: Boolean(nav.select),
      back: Boolean(nav.back),
      alt: Boolean(nav.alt),
    };
    const prev = this.padPrev;
    this.padPrev = now;
    if (!prev) {
      return;
    }
    const edge = (k) => now[k] && !prev[k];
    if (Object.keys(now).some(edge)) {
      this.setHint('pad');
    }
    if (edge('left')) {
      this.move(-1, 0);
    }
    if (edge('right')) {
      this.move(1, 0);
    }
    if (edge('up')) {
      this.move(0, -1);
    }
    if (edge('down')) {
      this.move(0, 1);
    }
    if (edge('alt')) {
      this.cycleTab(1);
    } else if (edge('select')) {
      this.activate();
    } else if (edge('back')) {
      this.cancel();
    }
  }

  /*
   * What the renderer draws, once a frame: the one plane at the centre of
   * the stage, how far a drag has turned it since the last frame, what the
   * camera should look at (`focus`, a region or the nose), and counters
   * that tick when the set should play its reveal or its pulse. Null when
   * shut. The readouts count on here too, on the frame's clock.
   */
  frame() {
    if (!this.isOpen) {
      return null;
    }
    const now = performance.now();
    this.countOn(now);
    this.flushPreview();
    /* The entrance plays once; a tile drawn later appears as it is. */
    if (now - this.openT > 1200) {
      this.root.classList.remove('entering');
    }
    const r = this.stage.getBoundingClientRect();
    const turn = this.turn;
    this.turn = 0;
    const tabs = {};
    eachHook((h, t) => {
      if (h.frame) {
        tabs[t] = h.frame(this, now);
      }
    });
    return {
      items: [{ id: this.id, d: 0 }],
      rect: { left: r.left, top: r.top, width: r.width, height: r.height },
      top: this.panel.getBoundingClientRect().top,
      compact: false,
      turn,
      hangar: {
        focus: this.focus,
        reveal: this.revealSeq,
        pulse: this.pulseSeq,
        hold: Boolean(this.drag),
        /* The Power tab's choice, which the set pulls apart to show. */
        power: this.tab === 'power' ? { airframe: this.id, ...this.choice } : null,
        tabs,
      },
    };
  }
}
