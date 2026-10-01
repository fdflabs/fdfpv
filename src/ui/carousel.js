/*
 * carousel.js: choosing an aircraft by looking at it.
 *
 * The aircraft used to be a word on a row and a card with a plan drawing.
 * This is the same choice made in front of the machines themselves: the
 * models the sim flies, one centred and slowly turning, its neighbours
 * smaller at the sides, the name, the size, the weight and one line about
 * it underneath. It is opened from every place an aircraft is chosen (the
 * two cards on the front page, the Aircraft row, and in flight to swap
 * the one being flown), and it is the same object in all of them.
 *
 * THIS FILE IS THE CHOICE AND NOT THE PICTURE. It owns the overlay's DOM,
 * the list, which one is centred, the animation that moves between them
 * and every way of moving it: the wheel, the arrow keys, a drag or a swipe
 * on the stage, a gamepad, a click. The models are drawn by
 * src/render/carousel3d.js into the shell's own canvas, under the stage
 * this file leaves transparent, from the numbers frame() hands it. The
 * split is a constraint rather than a taste: scripts import src/ui/ui.js
 * in Node, and three.js is an import map away from Node, so nothing on
 * this side may import it.
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

import { AIRFRAMES, airframeById, floatVersionOf, isFloatVersion, landPlaneOf } from '../../configs/airframes.js';
import { currentLocale, str } from '../strings/index.js';
import { paintable } from '../../configs/liveries.js';
import { BUILD_PREFIX } from './builds.js';

/* Which lists the tabs offer. A card or a row opens on one kind and the
 * pilot can widen it to every aircraft. */
export const PICK_FILTERS = ['quad', 'plane', 'all'];
/* And beside them My Hangar, the pilot's saved builds (src/ui/builds.js):
 * one more tab, its cards keyed BUILD_PREFIX and the build's id. */
export const MINE = 'mine';
const TABS = [...PICK_FILTERS, MINE];

export function kindOf(id) {
  return airframeById(id).fixedWing ? 'plane' : 'quad';
}

/* The aircraft a tab shows, in configs/airframes.js order, which is the
 * order the menus have always listed them in. A float version is not a
 * card of its own: it is its land plane with the Floats switch on, here
 * and in the hangar (configs/airframes.js floatVersionOf). */
export function pickList(filter) {
  return AIRFRAMES
    .filter((a) => !isFloatVersion(a.id) && (filter === 'all' || kindOf(a.id) === filter))
    .map((a) => a.id);
}

/* The next aircraft for the direct cycle, [ and ]: every aircraft, round
 * and round, so two keys reach all of them without an overlay. It answers
 * with the card's id, the land plane; the caller seats its floats. */
export function cycleCraft(id, dir) {
  const ids = pickList('all');
  const i = Math.max(0, ids.indexOf(landPlaneOf(id)));
  return ids[(i + dir + ids.length) % ids.length];
}

/* The size line: a plane's span, a quad's motor to motor diagonal. */
export function sizeText(id) {
  const af = airframeById(id);
  return str(af.fixedWing ? 'carousel.span' : 'carousel.wheelbase', { mm: af.sizeMm });
}

export function weightText(id) {
  const g = airframeById(id).grams;
  if (g < 1000) {
    return str('carousel.grams', { n: Math.round(g) });
  }
  const kg = (g / 1000).toLocaleString(currentLocale(), { maximumFractionDigits: 2 });
  return str('carousel.kilograms', { n: kg });
}

/*
 * WHERE EACH MODEL STANDS, as a function of how far it is from the centre
 * in list places (d, fractional while the list moves). Shared with the
 * renderer so that what a drag moves under the finger and what is drawn
 * under it are the same distance: x is in half widths of the stage, the
 * units a clip space x is in.
 *
 * The neighbours sit SLOT from the centre and anything further out closes
 * up behind them at TAIL of that, so two a side are in view and a third is
 * already leaving the frame.
 */
export const SLOT = 0.7;
const TAIL = 0.55;

export function slotX(d) {
  const a = Math.abs(d);
  const x = a <= 1 ? a * SLOT : SLOT + (a - 1) * SLOT * TAIL;
  return d < 0 ? -x : x;
}

/* The inverse, for a click or a drag: how many list places a point on the
 * stage is from the centre. */
export function slotOf(x) {
  const a = Math.abs(x);
  const d = a <= SLOT ? a / SLOT : 1 + (a - SLOT) / (SLOT * TAIL);
  return x < 0 ? -d : d;
}

/* How big a model is drawn off centre: the centre one at full size, the
 * next ones at half, and the rest smaller again. */
export function slotScale(d) {
  const a = Math.min(Math.abs(d), 2.5);
  return a <= 1 ? 1 - 0.5 * a : 0.5 - 0.12 * (a - 1);
}

/* The spring the list rides between places: stiff enough that one press is
 * a clear move, damped so it lands without bouncing. Per second squared
 * and per second. */
const SPRING_K = 140;
const SPRING_C = 2 * Math.sqrt(SPRING_K);
/* How far a drag must travel, in CSS pixels, before it is a drag and not a
 * click on a model. */
const DRAG_SLOP = 6;
/* A wheel notch is 100 to 120 pixels on most mice, and a trackpad sends
 * dozens of small deltas: this much wheel is one place, so a notch is one
 * aircraft and a trackpad swipe is a few. */
const WHEEL_STEP = 100;

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

export class Carousel {
  /* `host` is the Ui's root. Everything else in it is hidden while the
   * carousel is up, so nothing is drawn over the stage: the models are in
   * the canvas under the whole of the UI. */
  constructor(host) {
    this.host = host;
    this.isOpen = false;
    this.filter = 'all';
    this.ids = pickList('all');
    this.drawn = new Map();
    this.index = 0;
    /* The list's animated position, in places, and its speed. */
    this.pos = 0;
    this.vel = 0;
    this.drag = null;
    this.wheelAcc = 0;
    this.padPrev = null;
    this.hintKind = 'key';
    this.opts = null;
    this.build();
  }

  build() {
    const root = el('div', 'carousel');
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    this.root = root;

    const head = el('div', 'carousel-head');
    this.titleEl = el('div', 'carousel-title');
    this.tabs = el('div', 'carousel-tabs');
    this.tabs.setAttribute('role', 'tablist');
    this.tabEls = {};
    const labels = { quad: 'carousel.quads', plane: 'carousel.planes', all: 'carousel.all', [MINE]: 'mine.tab' };
    for (const f of TABS) {
      const t = button(`carousel-tab${f === MINE ? ' carousel-tab-mine' : ''}`, str(labels[f]));
      t.setAttribute('role', 'tab');
      t.addEventListener('click', () => this.setFilter(f));
      this.tabEls[f] = t;
      this.tabs.append(t);
    }
    head.append(this.titleEl, this.tabs);

    /* The window onto the canvas. Transparent on purpose, and the pointer
     * surface for the drag, the swipe, the wheel and a click on a model. */
    this.stage = el('div', 'carousel-stage');
    this.prevBtn = button('carousel-arrow carousel-prev', '‹');
    this.prevBtn.setAttribute('aria-label', str('carousel.previous'));
    this.nextBtn = button('carousel-arrow carousel-next', '›');
    this.nextBtn.setAttribute('aria-label', str('carousel.next'));
    this.prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.step(-1);
    });
    this.nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.step(1);
    });
    this.stage.append(this.prevBtn, this.nextBtn);
    this.bindStage();

    const info = el('div', 'carousel-info');
    this.nameEl = el('div', 'carousel-name');
    this.nameEl.setAttribute('aria-live', 'polite');
    /* The span, the weight and, for a plane with a float version, the
     * Floats switch: built once and only relabelled, so the switch keeps
     * its focus across a flip. Styled as the hangar's (index.html). */
    this.factsEl = el('div', 'carousel-facts');
    this.sizeEl = el('span', 'carousel-fact');
    this.weightEl = el('span', 'carousel-fact');
    this.floatsBtn = button('hangar-floats carousel-floats', str('hangar.floats'));
    this.floatsBtn.dataset.key = 'floats';
    this.floatsBtn.setAttribute('role', 'switch');
    this.floatsBtn.addEventListener('click', () => this.toggleFloats());
    /* A build's card names the plane it is built on first; a stock card's
     * row stays the span, the weight and the switch (paint). */
    this.baseEl = el('span', 'carousel-fact carousel-base');
    this.factsEl.append(this.sizeEl, this.weightEl, this.floatsBtn);
    /* A build's own two, Rename and Delete, on its card only, and the
     * line that takes the name's place while one is open (startRename,
     * startDelete). */
    this.toolsEl = el('div', 'carousel-mine-tools');
    this.renameBtn = button('carousel-mine-tool', str('mine.rename'));
    this.renameBtn.dataset.key = 'mine-rename';
    this.renameBtn.addEventListener('click', () => this.startRename());
    this.deleteBtn = button('carousel-mine-tool', str('mine.delete'));
    this.deleteBtn.dataset.key = 'mine-delete';
    this.deleteBtn.addEventListener('click', () => this.startDelete());
    this.toolsEl.append(this.renameBtn, this.deleteBtn);
    this.formEl = el('div', 'carousel-mine-form');
    this.formEl.hidden = true;
    this.form = null;
    this.noteEl = el('p', 'carousel-note');
    this.dots = el('div', 'carousel-dots');
    info.append(this.nameEl, this.formEl, this.factsEl, this.toolsEl, this.noteEl, this.dots);

    const foot = el('div', 'carousel-foot');
    this.warnEl = el('p', 'carousel-warn');
    const buttons = el('div', 'carousel-buttons');
    this.backBtn = button('carousel-back', str('ui.back'));
    this.chooseBtn = button('carousel-choose', str('carousel.choose'));
    /* The hangar for the plane in the middle (src/ui/hangar.js): shown when
     * the opener offers it and the centred aircraft can be painted. */
    this.customBtn = button('carousel-back carousel-custom', str('hangar.customise'));
    this.backBtn.addEventListener('click', () => this.cancel());
    this.chooseBtn.addEventListener('click', () => this.choose());
    this.customBtn.addEventListener('click', () => this.customise());
    buttons.append(this.backBtn, this.customBtn, this.chooseBtn);
    this.hintEl = el('p', 'carousel-hint');
    foot.append(this.warnEl, buttons, this.hintEl);

    const panel = el('div', 'carousel-panel');
    this.panel = panel;
    panel.append(head, this.stage, info, foot);
    root.append(panel);
    /* A click that misses every control must not reach the menu under it,
     * which is hidden but still in the document. */
    root.addEventListener('click', (e) => e.stopPropagation());
    root.addEventListener('keydown', (e) => {
      /* The window's own listener routes the keys; the buttons must not
       * also fire on Enter and Space, or one press chooses twice. */
      const typing = e.target && e.target.tagName === 'INPUT';
      if (!typing && (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter')) {
        e.preventDefault();
      }
    });
    this.host.append(root);
  }

  bindStage() {
    const s = this.stage;
    s.style.touchAction = 'none';
    s.addEventListener('pointerdown', (e) => {
      if (e.target !== s || (e.pointerType === 'mouse' && e.button !== 0)) {
        return;
      }
      e.preventDefault();
      this.hintKind = e.pointerType === 'touch' ? 'touch' : 'key';
      const w = Math.max(1, s.getBoundingClientRect().width);
      this.drag = {
        id: e.pointerId, x0: e.clientX, pos0: this.pos, moved: false, lastX: e.clientX, lastT: performance.now(), v: 0, w,
      };
      s.setPointerCapture(e.pointerId);
    });
    s.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) {
        return;
      }
      if (Math.abs(e.clientX - d.x0) > DRAG_SLOP) {
        d.moved = true;
      }
      if (!d.moved) {
        return;
      }
      /* Half a stage width is one clip space unit. */
      const places = slotOf(-2 * (e.clientX - d.x0) / d.w);
      this.pos = Math.max(-0.35, Math.min(this.ids.length - 0.65, d.pos0 + places));
      const now = performance.now();
      const dt = Math.max(1, now - d.lastT) / 1000;
      d.v = (slotOf(-2 * (e.clientX - d.lastX) / d.w)) / dt;
      d.lastX = e.clientX;
      d.lastT = now;
    });
    const end = (e) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) {
        return;
      }
      this.drag = null;
      if (s.hasPointerCapture(e.pointerId)) {
        s.releasePointerCapture(e.pointerId);
      }
      if (e.type === 'pointercancel') {
        this.goTo(Math.round(this.pos));
        return;
      }
      if (!d.moved) {
        this.clickAt(e.clientX);
        return;
      }
      /* A flick carries on a little the way it was going. */
      const coast = Math.max(-1.5, Math.min(1.5, d.v * 0.12));
      this.vel = d.v;
      this.goTo(Math.round(this.pos + coast));
    };
    s.addEventListener('pointerup', end);
    s.addEventListener('pointercancel', end);
    s.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.hintKind = 'key';
      const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 400 : 1;
      const delta = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * unit;
      this.wheelAcc += delta;
      while (Math.abs(this.wheelAcc) >= WHEEL_STEP) {
        const dir = Math.sign(this.wheelAcc);
        this.wheelAcc -= dir * WHEEL_STEP;
        this.step(dir);
      }
    }, { passive: false });
  }

  /* A click on the stage, not a drag: the centre model chooses, a model to
   * the side comes to the centre. */
  clickAt(clientX) {
    const r = this.stage.getBoundingClientRect();
    const x = (2 * (clientX - r.left)) / Math.max(1, r.width) - 1;
    const d = Math.round(slotOf(x));
    if (d === 0) {
      this.choose();
      return;
    }
    this.goTo(this.index + d);
  }

  /*
   * Open it. `current` is centred first; `filter` is the tab it opens on;
   * `compact` is the in flight version, a band over the paused flight
   * rather than a page; `warn` is a line under the choice, for what a
   * choice will cost. onChoose gets the card's aircraft id and, for a
   * build, the build; onCancel nothing; onCustomise the id, a reopen and
   * the build. `floats` is the Floats switch, { on(id), set(id, on) } by
   * land plane id (src/ui/ui.js openPicker); without it no card shows one.
   * `builds` is My Hangar, { list(), drawn(card, build), rename(id, name),
   * remove(id) } (src/ui/ui.js pickerBuilds); without it there is no tab.
   */
  open({ current, filter = 'all', compact = false, title = str('carousel.choose_your_aircraft'), warn = '', hint = 'key', floats = null, builds = null, onChoose, onCancel, onCustomise } = {}) {
    this.opts = { onChoose, onCancel, onCustomise, floats, builds };
    this.openArgs = { filter, compact, title, warn, floats, builds, onChoose, onCancel, onCustomise };
    this.isOpen = true;
    this.hintKind = hint;
    this.root.classList.toggle('compact', Boolean(compact));
    this.titleEl.textContent = title;
    this.warnEl.textContent = warn || '';
    this.warnEl.hidden = !warn;
    this.tabEls[MINE].hidden = !builds;
    this.filter = this.offered().includes(filter) ? filter : 'all';
    this.closeForm();
    this.relist();
    const at = this.ids.indexOf(this.filter === MINE ? current : landPlaneOf(current));
    this.index = at >= 0 ? at : 0;
    this.pos = this.index;
    this.vel = 0;
    this.wheelAcc = 0;
    this.drag = null;
    this.padPrev = null;
    this.root.hidden = false;
    this.host.classList.add('carousel-open');
    this.paint();
  }

  close() {
    if (!this.isOpen) {
      return;
    }
    this.closeForm();
    this.isOpen = false;
    this.opts = null;
    this.drag = null;
    this.root.hidden = true;
    this.host.classList.remove('carousel-open');
  }

  /* The tabs this opener offers: My Hangar only with its builds. */
  offered() {
    return this.opts && this.opts.builds ? TABS : PICK_FILTERS;
  }

  /*
   * The tab's cards, and how each is drawn when it is not simply its
   * airframe in the slots: a build in its own fit, a stock plane whose
   * family is wearing a build in the pilot's own customisation. Made here
   * and kept, not every frame, because the renderer repaints a model when
   * the look it is handed is another object (src/render/carousel3d.js).
   */
  relist() {
    const builds = this.opts && this.opts.builds;
    this.ids = this.filter === MINE ? builds.list().map((b) => `${BUILD_PREFIX}${b.id}`) : pickList(this.filter);
    this.drawn = new Map();
    for (const key of this.ids) {
      const build = this.buildOf(key);
      const how = builds ? builds.drawn(build ? null : this.shown(key), build) : null;
      if (how) {
        this.drawn.set(key, how);
      }
    }
  }

  current() {
    return this.ids[this.index];
  }

  /* The build a card is, or null for a stock aircraft's. */
  buildOf(key) {
    const builds = this.opts && this.opts.builds;
    if (!builds || typeof key !== 'string' || !key.startsWith(BUILD_PREFIX)) {
      return null;
    }
    return builds.list().find((b) => `${BUILD_PREFIX}${b.id}` === key) ?? null;
  }

  /* The airframe a card stands for: a build's own, or the stock plane as
   * its Floats switch is set. */
  airframeOf(key) {
    const build = this.buildOf(key);
    return build ? build.airframe : this.shown(key);
  }

  choose() {
    const pick = this.opts && this.opts.onChoose;
    const key = this.current();
    if (!key) {
      return;
    }
    const build = this.buildOf(key);
    /* A plane progression has not opened (src/ui/progress-ui.js). */
    if (this.blocked && this.blocked(build ? landPlaneOf(build.airframe) : key)) {
      return;
    }
    this.close();
    if (pick) {
      pick(build ? build.airframe : key, build);
    }
  }

  cancel() {
    const back = this.opts && this.opts.onCancel;
    this.close();
    if (back) {
      back();
    }
  }

  canCustomise() {
    const key = this.current();
    return Boolean(this.opts && this.opts.onCustomise) && Boolean(key) && paintable(this.airframeOf(key));
  }

  /* To the hangar with the centred plane, the picker put away and handed
   * over as `reopen`, which brings it back on the same card and tab, or on
   * a card it names (a build just saved), in My Hangar. */
  customise() {
    if (!this.canCustomise()) {
      return;
    }
    const key = this.current();
    const build = this.buildOf(key);
    const args = { ...this.openArgs, filter: this.filter, hint: this.hintKind };
    const go = this.opts.onCustomise;
    this.close();
    go(build ? build.airframe : key, (card) => this.open({ ...args, current: card ?? key, filter: card ? MINE : args.filter }), build);
  }

  /* A card's Floats switch: true or false, or null for a card with no
   * float version or an opener that offers none. A build's floats are its
   * airframe, changed in its Customise. */
  floatsOn(id) {
    const f = this.opts && this.opts.floats;
    return f && floatVersionOf(id) ? Boolean(f.on(id)) : null;
  }

  /* The machine a card stands for as its switch is set: the one drawn, and
   * whose span and weight are read out. */
  shown(id) {
    return this.floatsOn(id) ? floatVersionOf(id) : id;
  }

  toggleFloats() {
    const id = this.current();
    const on = this.floatsOn(id);
    if (on === null) {
      return;
    }
    this.opts.floats.set(id, !on);
    this.relist();
    this.paint();
  }

  goTo(i) {
    const n = Math.max(0, Math.min(this.ids.length - 1, i));
    if (n !== this.index) {
      this.closeForm();
      this.index = n;
      this.paint();
    }
  }

  step(dir) {
    this.goTo(this.index + dir);
  }

  /* A tab, keeping the centred aircraft if the new list has it. */
  setFilter(f) {
    if (!this.offered().includes(f) || f === this.filter) {
      return;
    }
    const keep = this.current();
    this.closeForm();
    this.filter = f;
    this.relist();
    const at = this.ids.indexOf(keep);
    this.index = at >= 0 ? at : 0;
    this.pos = this.index;
    this.vel = 0;
    this.paint();
  }

  cycleFilter(dir) {
    const tabs = this.offered();
    const i = tabs.indexOf(this.filter);
    this.setFilter(tabs[(i + dir + tabs.length) % tabs.length]);
  }

  /* The words under the models: only when the centred one changes. */
  paint() {
    const key = this.current();
    const build = this.buildOf(key);
    this.root.classList.toggle('mine', this.filter === MINE);
    for (const [f, t] of Object.entries(this.tabEls)) {
      t.classList.toggle('on', f === this.filter);
      t.setAttribute('aria-selected', String(f === this.filter));
    }
    this.dots.textContent = '';
    this.ids.forEach((other, i) => {
      const b = this.buildOf(other);
      const dot = button(`carousel-dot${i === this.index ? ' on' : ''}`, '');
      dot.setAttribute('aria-label', b ? b.name : airframeById(other).name);
      dot.addEventListener('click', () => this.goTo(i));
      this.dots.append(dot);
    });
    this.prevBtn.disabled = this.index <= 0;
    this.nextBtn.disabled = this.index >= this.ids.length - 1;
    this.chooseBtn.textContent = str('carousel.choose');
    this.customBtn.hidden = !this.canCustomise();
    this.chooseBtn.hidden = !key;
    this.toolsEl.hidden = !build || Boolean(this.form);
    this.factsEl.hidden = !key;
    this.paintHint();
    /* An empty My Hangar says how a build gets into it. */
    if (!key) {
      this.nameEl.textContent = str('mine.empty_title');
      this.noteEl.textContent = str('mine.empty');
      return;
    }
    const id = build ? build.airframe : key;
    const seen = this.airframeOf(key);
    this.nameEl.textContent = build ? build.name : airframeById(id).name;
    this.nameEl.hidden = Boolean(this.form);
    if (build) {
      this.baseEl.textContent = airframeById(id).name;
      this.factsEl.prepend(this.baseEl);
    } else {
      this.baseEl.remove();
    }
    this.sizeEl.textContent = sizeText(seen);
    this.weightEl.textContent = weightText(seen);
    const floats = build ? null : this.floatsOn(id);
    this.floatsBtn.hidden = floats === null;
    this.floatsBtn.classList.toggle('on', Boolean(floats));
    this.floatsBtn.setAttribute('aria-checked', String(Boolean(floats)));
    this.noteEl.textContent = str(`carousel.note.${id}`);
    if (this.decorate) {
      this.decorate(this, build ? landPlaneOf(id) : id);
    }
  }

  paintHint() {
    const kind = this.hintKind === 'touch' ? 'touch' : this.hintKind === 'pad' ? 'pad' : 'keys';
    const mine = this.filter === MINE && this.buildOf(this.current()) && kind !== 'touch' ? '_mine' : '';
    this.hintEl.textContent = str(`carousel.hint_${kind}${mine}`);
  }

  /*
   * RENAME AND DELETE, a build's card's own, each in place on the card:
   * Rename puts the name in a field (Enter keeps it, Escape leaves it as it
   * was), Delete asks first with Keep under the cursor, so a stray Enter
   * keeps the build.
   */
  startRename() {
    const build = this.buildOf(this.current());
    if (!build) {
      return;
    }
    this.form = { mode: 'rename', id: build.id };
    this.formEl.textContent = '';
    const field = el('input', 'carousel-name-field');
    field.type = 'text';
    field.maxLength = 32;
    field.value = build.name;
    field.dataset.key = 'mine-name';
    field.setAttribute('aria-label', str('mine.rename'));
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.submitRename();
      }
    });
    const ok = button('carousel-mine-tool on', str('hangar.save'));
    ok.dataset.key = 'mine-name-save';
    ok.addEventListener('click', () => this.submitRename());
    const no = button('carousel-mine-tool', str('ui.cancel'));
    no.dataset.key = 'mine-name-cancel';
    no.addEventListener('click', () => this.closeForm(true));
    this.formError = el('p', 'carousel-mine-error');
    this.formError.hidden = true;
    const row = el('div', 'carousel-mine-row');
    row.append(field, ok, no);
    this.formEl.append(row, this.formError);
    this.formEl.hidden = false;
    this.paint();
    field.focus();
    field.select();
  }

  submitRename() {
    const f = this.form;
    const field = this.formEl.querySelector('input');
    if (!f || f.mode !== 'rename' || !field) {
      return;
    }
    const why = this.opts.builds.rename(f.id, field.value);
    if (why) {
      this.formError.textContent = why;
      this.formError.hidden = false;
      field.focus();
      return;
    }
    this.closeForm(true);
  }

  startDelete() {
    const build = this.buildOf(this.current());
    if (!build) {
      return;
    }
    this.form = { mode: 'delete', id: build.id };
    this.formEl.textContent = '';
    const ask = el('p', 'carousel-mine-ask', str('mine.delete_ask', { name: build.name }));
    const keep = button('carousel-mine-tool on', str('mine.keep'));
    keep.dataset.key = 'mine-keep';
    keep.addEventListener('click', () => this.closeForm(true));
    const del = button('carousel-mine-tool carousel-mine-danger', str('mine.delete'));
    del.dataset.key = 'mine-delete-yes';
    del.addEventListener('click', () => this.confirmDelete());
    const row = el('div', 'carousel-mine-row');
    row.append(keep, del);
    this.formEl.append(ask, row);
    this.formEl.hidden = false;
    this.paint();
    keep.focus();
  }

  confirmDelete() {
    const f = this.form;
    if (!f || f.mode !== 'delete') {
      return;
    }
    this.opts.builds.remove(f.id);
    this.closeForm();
    this.relist();
    this.index = Math.max(0, Math.min(this.index, this.ids.length - 1));
    this.pos = this.index;
    this.vel = 0;
    this.paint();
  }

  /* The card's own line back. `repaint` when it was open on the card: a
   * rename shows its new name, its models stay as they were. */
  closeForm(repaint = false) {
    if (!this.form) {
      return;
    }
    this.form = null;
    this.formEl.textContent = '';
    this.formEl.hidden = true;
    this.nameEl.hidden = false;
    if (document.activeElement && this.root.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    if (repaint) {
      this.paint();
    }
  }

  /* The keys while Rename or Delete is open. In the name field only Escape
   * gets here (src/input/input.js leaves typing alone); on the question
   * the arrows move between Keep and Delete and Enter presses one. */
  formKey(code) {
    if (code === 'Escape' || code === 'Backspace' || code === 'Tab') {
      this.closeForm(true);
      return;
    }
    if (this.form.mode === 'rename') {
      if (code === 'Enter' || code === 'NumpadEnter') {
        this.submitRename();
      }
      return;
    }
    const stops = [...this.formEl.querySelectorAll('button')];
    const at = stops.indexOf(document.activeElement);
    if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(code)) {
      stops[at === 0 ? 1 : 0].focus();
    } else if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') {
      (stops[at] ?? stops[0]).click();
    }
  }

  /* Every key while it is up is the carousel's. Returns true so the menu
   * and the flight keys under it never see one. */
  handleKey(code) {
    if (this.hintKind !== 'key') {
      this.hintKind = 'key';
      this.paintHint();
    }
    if (this.form) {
      this.formKey(code);
      return true;
    }
    if (code === 'ArrowLeft' || code === 'KeyA' || code === 'BracketLeft') {
      this.step(-1);
    } else if (code === 'ArrowRight' || code === 'KeyD' || code === 'BracketRight') {
      this.step(1);
    } else if (code === 'ArrowUp' || code === 'KeyW') {
      this.cycleFilter(-1);
    } else if (code === 'ArrowDown' || code === 'KeyS') {
      this.cycleFilter(1);
    } else if (code === 'Home') {
      this.goTo(0);
    } else if (code === 'End') {
      this.goTo(this.ids.length - 1);
    } else if (code === 'Space' && document.activeElement === this.floatsBtn) {
      this.toggleFloats();
    } else if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') {
      this.choose();
    } else if (code === 'KeyF') {
      this.toggleFloats();
    } else if (code === 'KeyC') {
      this.customise();
    } else if (code === 'KeyR') {
      this.startRename();
    } else if (code === 'Delete') {
      this.startDelete();
    } else if (code === 'Escape' || code === 'Backspace' || code === 'Tab') {
      this.cancel();
    }
    return true;
  }

  /*
   * A gamepad or a radio, as the shell resolves it: { up, down, left, right,
   * select, back, alt, floats }, levels, alt being a standard pad's X and
   * floats its Y. Edge triggered, and the first poll after
   * opening only learns where the sticks are, because the press that
   * opened this is usually still held.
   */
  pollPad(nav) {
    const now = {
      up: Boolean(nav.up),
      down: Boolean(nav.down),
      left: Boolean(nav.left),
      right: Boolean(nav.right),
      select: Boolean(nav.select),
      back: Boolean(nav.back),
      alt: Boolean(nav.alt),
      floats: Boolean(nav.floats),
    };
    const prev = this.padPrev;
    this.padPrev = now;
    if (!prev) {
      return;
    }
    const edge = (k) => now[k] && !prev[k];
    if (['up', 'down', 'left', 'right', 'select', 'back', 'alt', 'floats'].some(edge) && this.hintKind !== 'pad') {
      this.hintKind = 'pad';
      this.paintHint();
    }
    /* Delete's question by pad: left and right between Keep and Delete, A
     * presses the one under the cursor, B keeps. A name cannot be typed on
     * a pad, so Rename waits for B. */
    if (this.form) {
      if (edge('left') || edge('right')) {
        this.formKey('ArrowRight');
      }
      if (edge('select')) {
        this.formKey('Enter');
      } else if (edge('back')) {
        this.closeForm(true);
      }
      return;
    }
    if (edge('left')) {
      this.step(-1);
    }
    if (edge('right')) {
      this.step(1);
    }
    if (edge('up')) {
      this.cycleFilter(-1);
    }
    if (edge('down')) {
      this.cycleFilter(1);
    }
    /* A standard pad's X and Y are also buttons a menu takes as select, so
     * X customises first, Y flips the floats, and the same press chooses
     * nothing. On a build, which has no switch, Y asks to delete it. */
    if (edge('floats')) {
      if (this.buildOf(this.current())) {
        this.startDelete();
      } else {
        this.toggleFloats();
      }
    } else if (edge('alt')) {
      this.customise();
    } else if (edge('select')) {
      this.choose();
    } else if (edge('back')) {
      this.cancel();
    }
  }

  /*
   * Advance the animation by dtMs of wall clock and say what to draw: each
   * model in view with its distance from the centre in places, and where
   * the stage and the panel are, in CSS pixels. Null when closed.
   * Wall clock is right here: nothing in it reaches the flight.
   */
  frame(dtMs) {
    if (!this.isOpen) {
      return null;
    }
    /* Capped where the shell caps a frame, so a slow machine moves the
     * list at its own speed in fewer frames rather than in slow motion. */
    let left = Math.min(Math.max(dtMs, 0), 100) / 1000;
    /* In steps of at most a sixtieth: the spring is stiff enough that one
     * step of a tenth of a second would overshoot and ring. */
    while (!this.drag && left > 0) {
      const h = Math.min(left, 1 / 60);
      left -= h;
      this.vel += (SPRING_K * (this.index - this.pos) - SPRING_C * this.vel) * h;
      this.pos += this.vel * h;
    }
    if (!this.drag && Math.abs(this.index - this.pos) < 1e-4 && Math.abs(this.vel) < 1e-3) {
      this.pos = this.index;
      this.vel = 0;
    }
    const items = [];
    for (let i = 0; i < this.ids.length; i += 1) {
      const d = i - this.pos;
      if (Math.abs(d) < 2.6) {
        const key = this.ids[i];
        items.push({ id: this.airframeOf(key), d, ...(this.drawn.get(key) ?? {}) });
      }
    }
    const r = this.stage.getBoundingClientRect();
    return {
      items,
      rect: { left: r.left, top: r.top, width: r.width, height: r.height },
      /* The top of the whole panel, CSS pixels, which is where the compact
       * picker's band begins. */
      top: this.panel.getBoundingClientRect().top,
      compact: this.root.classList.contains('compact'),
    };
  }
}
