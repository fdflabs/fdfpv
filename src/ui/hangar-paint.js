/*
 * hangar-paint.js: the paint shop, the hangar's Colours tab past its
 * scheme and its colours.
 *
 * The Colours tab (src/ui/hangar.js) opens on PAINT, the schemes and each
 * region's colour, and this adds the region's FINISH under its colours and
 * two more pages beside it, on a switch at the top of the tab:
 *
 *   DECALS    race numbers, stripes, checks, chevrons, stars, roundels and
 *             generic sponsor style marks (configs/paint.js), each put on
 *             the model by pointing at it: the mouse, a tap, or an aim the
 *             arrows or the stick move over the plane. Then sized,
 *             stretched, turned, coloured, mirrored onto the other side,
 *             moved or taken off.
 *   LIVERIES  the pilot's own saved liveries for this plane, by name: put
 *             one on, duplicate it, delete it (asked first, and the answer
 *             the cursor starts on is Keep); and the livery on the plane
 *             as a code to copy, or a code pasted in and checked field by
 *             field before anything of it is used.
 *
 * The racing games' livery editors are the model: the camera turns to the
 * side being worked on, the plane holds still under the aim, the decal
 * under the aim is on the plane before it is placed, and every choice is
 * tried on as the cursor passes it, like the rest of the hangar.
 *
 * Nothing here is kept until the hangar's Save, as everywhere in it,
 * except the saved liveries: a livery saved by name, duplicated, deleted or
 * imported is written to the settings at once (onLibrary), since that list
 * is a library of the pilot's work and not the plane's paint.
 *
 * Like hangar.js, THIS FILE IS THE CHOICE AND NOT THE PICTURE: no three.js.
 * The thumbnails are drawn by src/render/decalart.js, which has none either.
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

import {
  DECAL_FONTS, DECAL_KINDS, DECAL_KIND_IDS, DECAL_LIMITS, FINISHES, MAX_DECALS, MAX_SAVED,
  checkDecal, cleanName, encodeLivery, finishOf, newDecal, numberAspect,
} from '../../configs/paint.js';
import { PALETTE, normaliseEntry, readCode } from '../../configs/liveries.js';
import { drawDecal } from '../render/decalart.js';
import { str } from '../strings/index.js';

export const PAINT_PAGES = ['paint', 'decals', 'saved'];

/* The camera's views for decal work (src/render/hangarstage.js). */
const DECAL_VIEWS = ['top', 'side_left', 'side_right', 'nose', 'tail'];
/* The aim's step for a key press or a poll of a held stick, CSS pixels. */
const AIM_STEP = 9;
/* A press and release on the plane that moved less than this is a click
 * that places, not a drag that turns it. CSS pixels. */
const CLICK_SLOP = 6;
/* Size and stretch change by this factor a press; the turn by this many
 * degrees. */
const SIZE_STEP = 1.12;
const TURN_STEP = 15;

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

const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

/* The opaque covering, which is what a decal is cut from. */
const DECAL_COLOURS = PALETTE.filter((c) => !c.film);

/* A small picture of a decal, drawn by the renderer's own art. */
function thumb(d, w = 54, h = 34) {
  const c = el('canvas', 'paint-thumb');
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const g = c.getContext('2d');
  if (!g) {
    return c;
  }
  /* The decal's box, d.a wide by 1 high, fitted into the thumbnail. */
  const k = Math.min((c.width * 0.9) / d.a, c.height * 0.9);
  g.setTransform(k, 0, 0, k, (c.width - k * d.a) / 2, (c.height - k) / 2);
  drawDecal(g, d, d.a);
  return c;
}

/* The name a copy of a livery gets: "Name (2)", "Name (3)", the first
 * free. A number at the end is the livery's own (Race 7), not a copy's. */
function copyName(name, taken) {
  const base = name.replace(/\s\(\d+\)$/, '');
  for (let i = 2; i < 1000; i += 1) {
    const n = cleanName(`${base.slice(0, 26)} (${i})`);
    if (!taken.includes(n)) {
      return n;
    }
  }
  return base;
}

export class PaintShop {
  constructor(hangar) {
    this.h = hangar;
    this.page = 'paint';
    this.reticle = el('div', 'paint-reticle');
    this.reticle.hidden = true;
    hangar.stage.append(this.reticle);
    this.reset();
  }

  /* Back to the start, for a hangar just opened. `library` is the saved
   * list for this plane, onLibrary(list) stores a changed one. */
  reset({ library = [], onLibrary = null } = {}) {
    this.page = 'paint';
    this.sel = -1;
    this.adding = false;
    this.placing = null;
    this.slot = 'c';
    this.style = { c: '#f2f2f2', c2: '#0e1213' };
    this.library = library.map((x) => ({ name: x.name, entry: x.entry }));
    this.onLibrary = onLibrary;
    this.form = null;
    this.lastName = null;
    this.view = 'side_left';
    this.reticle.hidden = true;
  }

  get decals() {
    return this.h.entry.decals ?? [];
  }

  setDecals(list, focusKey, sound = 'select') {
    const e = { ...this.h.entry };
    if (list.length) {
      e.decals = list;
    } else {
      delete e.decals;
    }
    this.h.entry = e;
    this.h.changed(focusKey, sound);
  }

  /* The entry the plane shows: the hangar's, with the decal under the aim
   * on it while one is being placed or moved. */
  shownEntry(entry) {
    const p = this.placing;
    if (!p || !p.hit) {
      return entry;
    }
    const d = checkDecal({ ...p.decal, p: p.hit.p, n: p.hit.n }).decal;
    if (!d) {
      return entry;
    }
    const list = [...(entry.decals ?? [])];
    if (p.index >= 0) {
      list[p.index] = d;
    } else {
      list.push(d);
    }
    return { ...entry, decals: list };
  }

  /* What the camera looks at while this page is up, or null for the
   * hangar's own choice. */
  focus() {
    return this.page === 'decals' ? this.view : null;
  }

  /* Whether the plane holds where the hand turned it: while placing, a
   * turn to see the other side must not spring back under the aim. */
  stay() {
    return this.page === 'decals';
  }

  setPage(p) {
    if (p === this.page || !PAINT_PAGES.includes(p)) {
      return;
    }
    this.stopPlacing();
    this.page = p;
    this.form = null;
    this.adding = false;
    this.h.changed(`page-${p}`, 'adjust');
  }

  /* The switch at the top of the Colours tab. */
  switcher() {
    const row = el('div', 'paint-pages');
    row.setAttribute('role', 'tablist');
    for (const p of PAINT_PAGES) {
      const b = button(`paint-page${p === this.page ? ' on' : ''}`, str(`hangar.page_${p}`));
      b.dataset.key = `page-${p}`;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(p === this.page));
      b.addEventListener('click', () => this.setPage(p));
      row.append(b);
    }
    return row;
  }

  /* The page's body when it is not Paint, which hangar.js draws itself. */
  body() {
    return this.page === 'decals' ? this.decalsPage() : this.savedPage();
  }

  /* THE FINISH, under the region's colours on the Paint page. */
  finishRow(region) {
    const box = el('div', 'paint-finish');
    box.append(el('h3', 'hangar-h', str('hangar.finish')));
    if (region.finish === false) {
      box.append(el('p', 'hangar-source', str('hangar.finish_shared')));
      return box;
    }
    const current = finishOf(region, this.h.entry);
    const kit = region.film ? 'film' : 'kit';
    const row = el('div', 'paint-chips');
    for (const f of [kit, ...FINISHES]) {
      const on = f === current;
      const b = button(`paint-chip paint-finish-${f}${on ? ' on' : ''}`, str(`hangar.finish_${f}`));
      b.dataset.key = `finish-${f}`;
      b.setAttribute('aria-pressed', String(on));
      this.h.trial(b, { region: region.id, finish: f }, region.id);
      b.addEventListener('click', () => this.pickFinish(region.id, f));
      row.append(b);
    }
    box.append(row);
    if (region.film && current !== 'film') {
      box.append(el('p', 'hangar-source', str('hangar.finish_film_off')));
    }
    return box;
  }

  pickFinish(regionId, f) {
    const finishes = { ...(this.h.entry.finishes ?? {}) };
    if (f === 'kit' || f === 'film') {
      delete finishes[regionId];
    } else {
      finishes[regionId] = f;
    }
    const e = { ...this.h.entry, finishes };
    if (!Object.keys(finishes).length) {
      delete e.finishes;
    }
    this.h.entry = e;
    this.h.changed(`finish-${f}`);
  }

  /* A finish tried on under the cursor, over the entry. */
  withFinish(entry, regionId, f) {
    const finishes = { ...(entry.finishes ?? {}), [regionId]: f };
    if (f === 'kit' || f === 'film') {
      delete finishes[regionId];
    }
    return { ...entry, finishes };
  }

  /* THE DECALS PAGE. */
  decalsPage() {
    const box = el('div', 'hangar-tab paint-body');
    const list = this.decals;
    const views = el('div', 'paint-views');
    views.append(el('span', 'paint-label', str('hangar.decal_view')));
    for (const v of DECAL_VIEWS) {
      const b = button(`paint-chip paint-view${v === this.view ? ' on' : ''}`, str(`hangar.view_${v}`));
      b.dataset.key = `view-${v}`;
      b.dataset.focus = v;
      b.addEventListener('click', () => {
        this.view = v;
        this.h.focus = v;
        this.h.changed(`view-${v}`, 'move');
      });
      views.append(b);
    }
    box.append(views);

    box.append(el('h3', 'hangar-h', str('hangar.decals_count', { n: list.length, max: MAX_DECALS })));
    const row = el('div', 'paint-decals');
    list.forEach((d, i) => {
      const b = button(`paint-decal${i === this.sel ? ' on' : ''}`);
      b.dataset.key = `decal-${i}`;
      b.append(thumb(d), el('span', 'paint-decal-name', this.decalName(d)));
      b.setAttribute('aria-pressed', String(i === this.sel));
      b.addEventListener('click', () => this.select(i));
      row.append(b);
    });
    if (list.length < MAX_DECALS) {
      const add = button(`paint-decal paint-add${this.adding ? ' on' : ''}`, str('hangar.decal_add'));
      add.dataset.key = 'decal-add';
      add.addEventListener('click', () => this.openKinds());
      row.append(add);
    }
    box.append(row);

    if (this.placing) {
      box.append(this.placingBox());
    } else if (this.adding) {
      box.append(this.kindsBox());
    } else if (this.sel >= 0 && list[this.sel]) {
      box.append(this.editorBox(list[this.sel]));
    } else {
      box.append(el('p', 'hangar-source', str(list.length ? 'hangar.decal_pick' : 'hangar.decal_none')));
    }
    return box;
  }

  decalName(d) {
    return d.k === 'num' ? str('hangar.decal_number', { n: d.t }) : str(`hangar.decal_${d.k}`);
  }

  openKinds() {
    this.stopPlacing();
    this.adding = !this.adding;
    this.sel = -1;
    this.h.changed(this.adding ? 'kind-num' : 'decal-add');
  }

  select(i) {
    this.stopPlacing();
    this.adding = false;
    this.sel = i === this.sel ? -1 : i;
    const d = this.decals[i];
    if (d && this.sel === i) {
      this.view = this.viewFor(d);
    }
    this.h.changed(`decal-${i}`, 'move');
  }

  /* The view that faces a decal: from above on a wing, else its side. */
  viewFor(d) {
    if (Math.abs(d.n[1]) > 0.7) {
      return 'top';
    }
    if (Math.abs(d.n[2]) > 0.8) {
      return d.n[2] < 0 ? 'nose' : 'tail';
    }
    return d.n[0] < 0 ? 'side_left' : 'side_right';
  }

  kindsBox() {
    const box = el('div', 'paint-kinds');
    DECAL_KIND_IDS.forEach((k, i) => {
      const sample = newDecal(k, [0, 0, 0], [0, 1, 0], this.style);
      const b = button('paint-kind');
      b.dataset.key = `kind-${k}`;
      b.style.setProperty('--i', String(i));
      b.append(thumb(sample, 64, 40), el('span', 'paint-kind-name', str(`hangar.decal_${k}`)));
      b.addEventListener('click', () => this.startPlacing(sample, -1));
      box.append(b);
    });
    return box;
  }

  /* PLACING: the aim over the plane, a decal under it. `index` is the
   * decal being moved, -1 for a new one. */
  startPlacing(decal, index) {
    const r = this.h.stage.getBoundingClientRect();
    this.adding = false;
    this.placing = {
      decal,
      index,
      aim: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
      hit: null,
      place: false,
    };
    this.reticle.hidden = false;
    this.moveReticle();
    this.h.changed('place-cancel');
  }

  stopPlacing() {
    if (this.placing) {
      this.placing = null;
      this.reticle.hidden = true;
      this.h.preview();
    }
  }

  placingBox() {
    const box = el('div', 'paint-placing');
    const hint = this.h.hintKind === 'pad' ? 'hangar.place_pad' : this.h.hintKind === 'touch' ? 'hangar.place_touch' : 'hangar.place_keys';
    box.append(el('p', 'hangar-note', str(hint)));
    const cancel = button('paint-chip', str('ui.cancel'));
    cancel.dataset.key = 'place-cancel';
    cancel.addEventListener('click', () => {
      this.stopPlacing();
      this.h.changed(this.sel >= 0 ? `decal-${this.sel}` : 'decal-add', 'back');
    });
    box.append(cancel);
    return box;
  }

  moveReticle() {
    const p = this.placing;
    if (!p) {
      return;
    }
    const r = this.h.stage.getBoundingClientRect();
    p.aim.x = Math.min(r.right - 2, Math.max(r.left + 2, p.aim.x));
    p.aim.y = Math.min(r.bottom - 2, Math.max(r.top + 2, p.aim.y));
    this.reticle.style.transform = `translate(${p.aim.x - r.left}px, ${p.aim.y - r.top}px)`;
    this.reticle.classList.toggle('on', Boolean(p.hit));
  }

  /* Where the aim is, for the renderer to pick against: client pixels. */
  aim() {
    return this.placing ? { ...this.placing.aim } : null;
  }

  /* The renderer's answer for the aim: a point and normal on the model or
   * null. A click waiting for it places there. */
  aimed(hit) {
    const p = this.placing;
    if (!p) {
      return;
    }
    const same = JSON.stringify(hit) === JSON.stringify(p.hit);
    p.hit = hit;
    this.reticle.classList.toggle('on', Boolean(hit));
    if (!same) {
      this.h.preview();
    }
    if (p.place) {
      p.place = false;
      if (hit) {
        this.place();
      } else {
        this.h.sound('back');
      }
    }
  }

  place() {
    const p = this.placing;
    const d = checkDecal({ ...p.decal, p: p.hit.p, n: p.hit.n }).decal;
    if (!d) {
      return;
    }
    const list = [...this.decals];
    let at = p.index;
    if (at >= 0) {
      list[at] = d;
    } else {
      list.push(d);
      at = list.length - 1;
    }
    this.placing = null;
    this.reticle.hidden = true;
    this.sel = at;
    this.h.pulseSeq += 1;
    this.setDecals(list, `decal-${at}`);
  }

  /* The stage's pointer: over it, the aim follows; a click places. */
  pointerMove(e) {
    if (this.placing && e.pointerType !== 'touch') {
      this.placing.aim = { x: e.clientX, y: e.clientY };
      this.moveReticle();
    }
  }

  pointerClick(e, moved) {
    if (!this.placing || moved > CLICK_SLOP) {
      return false;
    }
    this.placing.aim = { x: e.clientX, y: e.clientY };
    this.placing.place = true;
    this.moveReticle();
    return true;
  }

  /* THE EDITOR for the decal chosen. */
  editorBox(d) {
    const box = el('div', 'paint-editor');
    const i = this.sel;
    if (d.k === 'num') {
      const row = el('div', 'paint-row');
      row.append(el('span', 'paint-label', str('hangar.decal_digits')));
      const minus = button('paint-step', '-');
      minus.dataset.key = 'digits-down';
      minus.setAttribute('aria-label', str('hangar.decal_digits_down'));
      minus.addEventListener('click', () => this.stepNumber(-1));
      const field = el('input', 'paint-digits');
      field.type = 'text';
      field.inputMode = 'numeric';
      field.maxLength = 3;
      field.value = d.t;
      field.setAttribute('aria-label', str('hangar.decal_digits'));
      field.addEventListener('input', () => {
        const t = field.value.replace(/[^0-9]/g, '').slice(0, 3);
        field.value = t;
        if (t) {
          this.setNumber(t, false);
        }
      });
      const plus = button('paint-step', '+');
      plus.dataset.key = 'digits-up';
      plus.setAttribute('aria-label', str('hangar.decal_digits_up'));
      plus.addEventListener('click', () => this.stepNumber(1));
      row.append(minus, field, plus);
      box.append(row);
      const fonts = el('div', 'paint-row');
      fonts.append(el('span', 'paint-label', str('hangar.decal_font')));
      for (const f of DECAL_FONTS) {
        const b = button(`paint-chip${f === d.f ? ' on' : ''}`, str(`hangar.font_${f}`));
        b.dataset.key = `font-${f}`;
        b.setAttribute('aria-pressed', String(f === d.f));
        this.h.trial(b, { decal: i, patch: { f } }, this.view);
        b.addEventListener('click', () => this.patch({ f }, `font-${f}`));
        fonts.append(b);
      }
      box.append(fonts);
    }

    const slots = el('div', 'paint-row');
    for (const s of ['c', 'c2']) {
      const b = button(`paint-chip paint-slot${s === this.slot ? ' on' : ''}`);
      b.dataset.key = `slot-${s}`;
      const dot = el('span', 'hangar-dot');
      dot.style.background = d[s];
      b.append(dot, el('span', null, str(s === 'c' ? 'hangar.decal_colour' : 'hangar.decal_colour2')));
      b.addEventListener('click', () => {
        this.slot = s;
        this.h.changed(`slot-${s}`, 'move');
      });
      slots.append(b);
    }
    box.append(slots);
    const pal = el('div', 'hangar-palette');
    DECAL_COLOURS.forEach((c, k) => {
      const on = c.hex === d[this.slot];
      const b = button(`hangar-swatch${on ? ' on' : ''}`);
      b.dataset.key = `dcolour-${c.hex}`;
      b.style.setProperty('--swatch', c.hex);
      b.style.setProperty('--i', String(k));
      b.title = `${c.brand} ${c.name}`;
      b.setAttribute('aria-label', `${c.brand} ${c.name}`);
      b.setAttribute('aria-pressed', String(on));
      this.h.trial(b, { decal: i, patch: { [this.slot]: c.hex } }, this.view);
      b.addEventListener('click', () => this.setColour(c.hex));
      pal.append(b);
    });
    const custom = button('hangar-swatch hangar-swatch-custom', '+');
    custom.dataset.key = 'dcustom';
    custom.title = str('hangar.custom');
    custom.setAttribute('aria-label', str('hangar.custom'));
    custom.addEventListener('click', () => {
      this.h.customTarget = (hex) => this.setColour(hex);
      this.h.customInput.value = d[this.slot];
      this.h.customInput.click();
    });
    pal.append(custom);
    box.append(pal);

    const steps = [
      ['size', { s: clamp(d.s * SIZE_STEP, DECAL_LIMITS.size) }, { s: clamp(d.s / SIZE_STEP, DECAL_LIMITS.size) }, `${Math.round(d.s * 1000)} mm`],
      ['stretch', { a: clamp(d.a * SIZE_STEP, DECAL_LIMITS.aspect) }, { a: clamp(d.a / SIZE_STEP, DECAL_LIMITS.aspect) }, `${d.a.toFixed(2)}`],
      ['turn', { r: this.turned(d.r, TURN_STEP) }, { r: this.turned(d.r, -TURN_STEP) }, `${d.r}°`],
    ];
    const grid = el('div', 'paint-steps');
    for (const [id, up, down, value] of steps) {
      grid.append(el('span', 'paint-label', str(`hangar.decal_${id}`)));
      const minus = button('paint-step', '-');
      minus.dataset.key = `${id}-down`;
      minus.setAttribute('aria-label', str(`hangar.decal_${id}_down`));
      this.h.trial(minus, { decal: i, patch: down }, this.view);
      minus.addEventListener('click', () => this.patch(down, `${id}-down`, 'adjust'));
      const plus = button('paint-step', '+');
      plus.dataset.key = `${id}-up`;
      plus.setAttribute('aria-label', str(`hangar.decal_${id}_up`));
      this.h.trial(plus, { decal: i, patch: up }, this.view);
      plus.addEventListener('click', () => this.patch(up, `${id}-up`, 'adjust'));
      grid.append(minus, el('span', 'paint-value', value), plus);
    }
    box.append(grid);

    const acts = el('div', 'paint-row paint-acts');
    const mirror = button(`paint-chip${d.m ? ' on' : ''}`, str('hangar.decal_mirror'));
    mirror.dataset.key = 'mirror';
    mirror.setAttribute('aria-pressed', String(d.m));
    mirror.addEventListener('click', () => this.patch({ m: !d.m }, 'mirror'));
    const move = button('paint-chip', str('hangar.decal_move'));
    move.dataset.key = 'move';
    move.addEventListener('click', () => this.startPlacing(d, i));
    const del = button('paint-chip paint-danger', str('hangar.decal_delete'));
    del.dataset.key = 'decal-delete';
    del.addEventListener('click', () => this.removeDecal(i));
    acts.append(mirror, move, del);
    box.append(acts);
    return box;
  }

  turned(r, by) {
    let v = r + by;
    if (v > 180) {
      v -= 360;
    } else if (v < -180) {
      v += 360;
    }
    return v;
  }

  /* A change to the chosen decal, made valid, or nothing if it is not. */
  patched(i, patch) {
    const d = this.decals[i];
    return d ? checkDecal({ ...d, ...patch }).decal : null;
  }

  patch(patch, focusKey, sound = 'select') {
    const d = this.patched(this.sel, patch);
    if (!d) {
      return;
    }
    if (patch.c) {
      this.style.c = patch.c;
    }
    if (patch.c2) {
      this.style.c2 = patch.c2;
    }
    const list = [...this.decals];
    list[this.sel] = d;
    this.setDecals(list, focusKey, sound);
  }

  setColour(hex) {
    this.patch({ [this.slot]: hex.toLowerCase() }, `dcolour-${hex.toLowerCase()}`);
  }

  /* A number's digits, its stretch following their count. */
  setNumber(t, refocus = true) {
    const d = this.decals[this.sel];
    if (!d || d.k !== 'num' || t === d.t) {
      return;
    }
    const a = clamp(d.a * (numberAspect(t) / numberAspect(d.t)), DECAL_LIMITS.aspect);
    const next = this.patched(this.sel, { t, a });
    if (!next) {
      return;
    }
    const list = [...this.decals];
    list[this.sel] = next;
    const e = { ...this.h.entry, decals: list };
    this.h.entry = e;
    if (refocus) {
      this.h.changed('digits-up', 'adjust');
    } else {
      /* Typing: the field keeps the caret, only the plane changes. */
      this.h.preview();
      this.h.saveBtn.classList.toggle('dirty', this.h.dirty());
    }
  }

  stepNumber(by) {
    const d = this.decals[this.sel];
    if (!d) {
      return;
    }
    const n = (Number(d.t) + by + 1000) % 1000;
    this.setNumber(String(n));
    this.h.focusKey(by > 0 ? 'digits-up' : 'digits-down');
  }

  removeDecal(i) {
    const list = this.decals.filter((_, k) => k !== i);
    this.sel = -1;
    this.setDecals(list, list.length ? `decal-${Math.min(i, list.length - 1)}` : 'decal-add', 'back');
  }

  /* A decal change tried on under the cursor, over the entry. */
  withDecal(entry, i, patch) {
    const list = [...(entry.decals ?? [])];
    const d = list[i] ? checkDecal({ ...list[i], ...patch }).decal : null;
    if (!d) {
      return entry;
    }
    list[i] = d;
    return { ...entry, decals: list };
  }

  /* THE LIVERIES PAGE. */
  savedPage() {
    const box = el('div', 'hangar-tab paint-body');
    box.append(el('h3', 'hangar-h', str('hangar.saved_count', { n: this.library.length, max: MAX_SAVED })));
    const f = this.form;
    if (f && f.mode === 'name') {
      box.append(this.nameForm());
    } else if (this.library.length < MAX_SAVED) {
      const b = button('paint-wide', str('hangar.saved_new'));
      b.dataset.key = 'saved-new';
      b.addEventListener('click', () => this.openForm({ mode: 'name', text: this.lastName ?? '' }, 'name-field'));
      box.append(b);
    }
    const list = el('div', 'paint-saved');
    if (!this.library.length) {
      list.append(el('p', 'hangar-source', str('hangar.saved_none')));
    }
    this.library.forEach((item, i) => {
      const row = el('div', 'paint-saved-row');
      if (f && f.mode === 'confirm' && f.index === i) {
        row.classList.add('confirm');
        row.append(el('span', 'paint-saved-name', str('hangar.saved_delete_ask', { name: item.name })));
        const keep = button('paint-chip on', str('hangar.saved_keep'));
        keep.dataset.key = `keep-${i}`;
        keep.addEventListener('click', () => this.closeForm(`delete-${i}`, 'back'));
        const yes = button('paint-chip paint-danger', str('hangar.saved_delete'));
        yes.dataset.key = `really-${i}`;
        yes.addEventListener('click', () => this.deleteSaved(i));
        row.append(keep, yes);
        list.append(row);
        return;
      }
      const wear = button('paint-saved-name paint-wear', item.name);
      wear.dataset.key = `wear-${i}`;
      wear.title = str('hangar.saved_wear');
      this.h.trial(wear, { entry: item.entry }, 'overview');
      wear.addEventListener('click', () => this.wear(i));
      const dup = button('paint-chip', str('hangar.saved_duplicate'));
      dup.dataset.key = `dup-${i}`;
      dup.addEventListener('click', () => this.duplicate(i));
      const del = button('paint-chip paint-danger', str('hangar.saved_delete'));
      del.dataset.key = `delete-${i}`;
      del.addEventListener('click', () => this.openForm({ mode: 'confirm', index: i }, `keep-${i}`));
      row.append(wear, dup, del);
      list.append(row);
    });
    box.append(list);

    box.append(el('h3', 'hangar-h', str('hangar.share')));
    const share = el('div', 'paint-row');
    const exp = button('paint-chip', str('hangar.code_copy'));
    exp.dataset.key = 'code-copy';
    exp.addEventListener('click', () => this.exportCode());
    const imp = button('paint-chip', str('hangar.code_paste'));
    imp.dataset.key = 'code-paste';
    imp.addEventListener('click', () => this.openForm({ mode: 'import', text: '' }, 'code-field'));
    share.append(exp, imp);
    box.append(share);
    if (f && f.mode === 'export') {
      const area = el('textarea', 'paint-code');
      area.readOnly = true;
      area.value = f.text;
      area.dataset.key = 'code-out';
      area.rows = 3;
      box.append(area, el('p', 'hangar-source', str(f.copied ? 'hangar.code_copied' : 'hangar.code_select')));
    }
    if (f && f.mode === 'import') {
      const area = el('textarea', 'paint-code');
      area.value = f.text;
      area.placeholder = str('hangar.code_placeholder');
      area.dataset.key = 'code-field';
      area.rows = 3;
      area.maxLength = 8000;
      area.addEventListener('input', () => {
        f.text = area.value;
      });
      const row = el('div', 'paint-row');
      const go = button('paint-chip on', str('hangar.code_import'));
      go.dataset.key = 'code-import';
      go.addEventListener('click', () => this.importCode(area.value));
      const no = button('paint-chip', str('ui.cancel'));
      no.dataset.key = 'code-cancel';
      no.addEventListener('click', () => this.closeForm('code-paste', 'back'));
      row.append(go, no);
      box.append(area, row);
      if (f.error) {
        box.append(el('p', 'paint-error', str(`hangar.code_${f.error}`)));
      }
    }
    return box;
  }

  nameForm() {
    const f = this.form;
    const box = el('div', 'paint-row paint-name');
    const field = el('input', 'paint-name-field');
    field.type = 'text';
    field.maxLength = 32;
    field.value = f.text;
    field.placeholder = str('hangar.saved_name');
    field.dataset.key = 'name-field';
    field.setAttribute('aria-label', str('hangar.saved_name'));
    field.addEventListener('input', () => {
      f.text = field.value;
    });
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.saveNew(field.value);
      }
    });
    const ok = button('paint-chip on', str('hangar.save'));
    ok.dataset.key = 'name-save';
    ok.addEventListener('click', () => this.saveNew(field.value));
    const no = button('paint-chip', str('ui.cancel'));
    no.dataset.key = 'name-cancel';
    no.addEventListener('click', () => this.closeForm('saved-new', 'back'));
    box.append(field, ok, no);
    if (f.error) {
      const err = el('p', 'paint-error', str(f.error));
      const wrap = el('div');
      wrap.append(box, err);
      return wrap;
    }
    return box;
  }

  openForm(form, focusKey) {
    this.form = form;
    this.h.changed(focusKey, 'select');
    const field = this.h.panel.querySelector(`[data-key="${focusKey}"]`);
    if (field && (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA')) {
      field.focus();
      field.select();
    }
  }

  closeForm(focusKey, sound = 'select') {
    this.form = null;
    this.h.changed(focusKey, sound);
  }

  store(focusKey) {
    if (this.onLibrary) {
      this.onLibrary(this.library.map((x) => ({ name: x.name, entry: x.entry })));
    }
    this.form = null;
    this.h.changed(focusKey);
  }

  saveNew(raw) {
    const name = cleanName(raw);
    if (!name) {
      this.form = { ...this.form, text: raw, error: 'hangar.saved_name_empty' };
      this.h.changed('name-field', 'back');
      return;
    }
    if (this.library.length >= MAX_SAVED) {
      return;
    }
    const entry = normaliseEntry(this.h.family, this.h.entry) ?? {};
    const at = this.library.findIndex((x) => x.name === name);
    if (at >= 0) {
      this.library[at] = { name, entry };
    } else {
      this.library.push({ name, entry });
    }
    this.lastName = name;
    this.store(`wear-${at >= 0 ? at : this.library.length - 1}`);
  }

  wear(i) {
    const item = this.library[i];
    if (!item) {
      return;
    }
    this.h.entry = JSON.parse(JSON.stringify(item.entry));
    this.lastName = item.name;
    this.h.pulseSeq += 1;
    this.h.changed(`wear-${i}`);
  }

  duplicate(i) {
    const item = this.library[i];
    if (!item || this.library.length >= MAX_SAVED) {
      return;
    }
    const name = copyName(item.name, this.library.map((x) => x.name));
    this.library.splice(i + 1, 0, { name, entry: JSON.parse(JSON.stringify(item.entry)) });
    this.store(`wear-${i + 1}`);
  }

  deleteSaved(i) {
    this.library.splice(i, 1);
    this.store(this.library.length ? `wear-${Math.min(i, this.library.length - 1)}` : 'saved-new');
    this.h.sound('back');
  }

  exportCode() {
    const entry = normaliseEntry(this.h.family, this.h.entry) ?? {};
    const text = encodeLivery(this.h.family, this.lastName ?? '', entry);
    this.form = { mode: 'export', text, copied: false };
    this.h.changed('code-copy');
    const done = () => {
      if (this.form && this.form.text === text) {
        this.form.copied = true;
        this.h.changed('code-copy');
      }
    };
    try {
      navigator.clipboard.writeText(text).then(done, () => {});
    } catch {
      /* No clipboard here (an insecure page, an old browser): the code is
       * in the box under the button, selected, to copy by hand. */
    }
    const area = this.h.panel.querySelector('[data-key="code-out"]');
    if (area) {
      area.select();
    }
  }

  /* A pasted code: refused whole with the reason, or put on the plane and
   * added to the saved list under its own name. */
  importCode(text) {
    const got = readCode(text);
    let error = got.error ?? null;
    if (!error && got.family !== this.h.family) {
      error = 'other_plane';
    }
    if (!error && this.library.length >= MAX_SAVED) {
      error = 'full';
    }
    if (error) {
      this.form = { mode: 'import', text, error };
      this.h.changed('code-field', 'back');
      return;
    }
    const taken = this.library.map((x) => x.name);
    const wanted = got.name || str('hangar.code_imported');
    const name = taken.includes(wanted) ? copyName(wanted, taken) : wanted;
    this.library.push({ name, entry: got.entry });
    this.h.entry = JSON.parse(JSON.stringify(got.entry));
    this.lastName = name;
    this.h.pulseSeq += 1;
    this.store(`wear-${this.library.length - 1}`);
  }

  /*
   * Keys while the paint shop has them: placing takes the arrows for the
   * aim, Enter to place, Escape to stop, Q and E to turn the plane; a form
   * takes Escape to close it (and a confirm's Escape is Keep). Returns
   * whether the key was used.
   */
  handleKey(code) {
    const p = this.placing;
    if (p) {
      const step = { ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] }[code];
      if (step) {
        p.aim.x += step[0] * AIM_STEP;
        p.aim.y += step[1] * AIM_STEP;
        this.moveReticle();
        return true;
      }
      if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') {
        p.place = true;
        return true;
      }
      if (code === 'KeyQ' || code === 'KeyE') {
        this.h.turn += code === 'KeyQ' ? -0.35 : 0.35;
        return true;
      }
      if (code === 'Escape' || code === 'Backspace') {
        this.stopPlacing();
        this.h.changed(this.sel >= 0 ? `decal-${this.sel}` : 'decal-add', 'back');
        return true;
      }
      return true;
    }
    const a = document.activeElement;
    const typing = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && this.h.panel.contains(a);
    if (code === 'Escape' && (this.form || typing)) {
      if (this.form) {
        const back = this.form.mode === 'confirm' ? `delete-${this.form.index}` : this.form.mode === 'name' ? 'saved-new' : 'code-paste';
        this.closeForm(back, 'back');
      } else {
        a.blur();
        this.h.focusKey('digits-up');
      }
      return true;
    }
    if (code === 'Escape' && this.adding) {
      this.adding = false;
      this.h.changed('decal-add', 'back');
      return true;
    }
    return false;
  }

  /* The stick while placing: held directions move the aim every poll, A
   * places, B stops, X turns the plane. Returns whether it was used. */
  pollPad(now, edge) {
    const p = this.placing;
    if (!p) {
      return false;
    }
    const dx = (now.right ? 1 : 0) - (now.left ? 1 : 0);
    const dy = (now.down ? 1 : 0) - (now.up ? 1 : 0);
    if (dx || dy) {
      p.aim.x += dx * AIM_STEP * 0.7;
      p.aim.y += dy * AIM_STEP * 0.7;
      this.moveReticle();
    }
    if (edge('select')) {
      p.place = true;
    } else if (edge('back')) {
      this.handleKey('Escape');
    } else if (edge('alt')) {
      this.h.turn += 0.5;
    }
    return true;
  }
}
