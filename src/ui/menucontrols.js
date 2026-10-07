/*
 * menucontrols.js: what sits inside a menu row and what moves between rows.
 *
 * The controls a row can carry (a two state switch, a strip of named
 * choices, a stepper, a typed number, a drag slider, the bench's search
 * field and a drop-down list), the cursor and the browser focus that
 * follows it, and the pictures beside three menus that are repainted with
 * every rebuild: the Rates curve, the PID bars and the flight controller
 * bench's tabs, horizon and exit bar.
 *
 * Installed on Ui.prototype at the end of src/ui/ui.js, so `this` is the
 * Ui and every caller still writes ui.setCursor(), ui.openDrop() and so on.
 * scripts/menucontrols-golden.js holds these methods to a record.
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

import { formatRate } from '../../configs/rates.js';
import { pidsAdjusted, pidsEntry } from '../../configs/pids.js';
import { tuneById } from '../../configs/registry.js';
import { str } from '../strings/index.js';
import { drawAttitude, paintPageStrip, paintTabStrip } from './fc.js';
import { saveSettings } from './settings.js';
import { btn, el } from './widgets.js';
/* A cycle: ui.js installs this module. Only read inside methods, never at
 * this module's top level, where the binding is not yet initialised. */
import { courseCardKey } from './ui.js';

/* Each search keystroke rebuilds the bench, about 57 ms measured, so the
 * rebuild waits until the typing pauses. Under about 100 ms it would still
 * be one rebuild per letter for a fast typist, and the field drops letters. */
const SEARCH_SETTLE_MS = 120;

/* Where the bench goes back to when it is left. Anywhere else it was opened
 * from has no menu of its own to return to, so it lands on the title. */
const FC_RETURNS_TO = new Set(['paused', 'quad', 'pids']);

/* The help element each screen keeps its row notes in, by field name. The
 * room pages carry theirs on their own objects; see helpNode. */
const HELP_FIELD = {
  title: 'titleHelp',
  howto: 'howtoHelp',
  tricks: 'trickHelp',
  credits: 'creditsHelp',
  courses: 'coursesHelp',
  freestyle: 'freestyleHelp',
  pilot: 'pilotHelp',
  friends: 'friendsHelp',
  quad: 'quadHelp',
  launch: 'launchHelp',
  standings: 'standingsHelp',
  rates: 'ratesHelp',
  pids: 'pidsHelp',
  fc: 'fcHelp',
  paused: 'pausedHelp',
  results: 'resultsHelp',
};

/* Keys that take the caret out of the search field, and how far each one
 * moves the cursor once it has. */
const SEARCH_EXITS = new Map([['ArrowDown', 1], ['Enter', 1], ['ArrowUp', -1], ['Escape', 0]]);

/* The drop-down list's placement, in CSS pixels: kept off the window edge,
 * a small gap from the control it hangs from, never narrower than a short
 * label needs, and assumed this wide when deciding whether it fits. */
const DROP_EDGE = 8;
const DROP_GAP = 4;
const DROP_MIN_WIDTH = 148;
const DROP_ROOM = 240;

const stopOnly = (e) => e.stopPropagation();

function swallow(e) {
  e.preventDefault();
  e.stopPropagation();
}

/* preventScroll: the caller has already scrolled the row where it belongs,
 * and the browser's own focus scroll would fight it. */
function focusQuietly(node) {
  node.focus({ preventScroll: true });
}

/* A click on a control makes its row the cursor's row first. No scroll: the
 * pointer is already on it. */
function claimRow(ui, i) {
  ui.cursor = i;
  ui.syncCursor(false);
}

/* Entering a field leaves whatever row an open list belongs to, and the
 * field swallows its own clicks, so the list is closed here or it would stay
 * up under a caret somewhere else. */
function enterRow(ui, i) {
  ui.closeDrop();
  claimRow(ui, i);
}

function textInput(className, value, label) {
  const field = document.createElement('input');
  field.className = className;
  field.type = 'text';
  field.autocomplete = 'off';
  field.spellcheck = false;
  field.value = value;
  field.setAttribute('aria-label', label);
  return field;
}

/* The sentence under the Rates and PIDs pictures. A pilot who came in from
 * a paused run gets the one the pause menu's row carries. */
function backHint(returnTo) {
  return str(returnTo === 'paused' ? 'ui.arrow_keys_move_left_and_right' : 'ui.arrow_keys_move_left_and_right_2');
}

function paintCurve(ui) {
  ui.ratesPanel.paint(ui.settings.rates, ui.ratesStick, ui.settings.airframe);
}

function pidsCaption(s, live) {
  const name = tuneById(s.tune).name;
  if (!live) {
    return str('ui.is_loading', { name });
  }
  const entry = pidsEntry(s.pids, s.tune);
  if (entry && entry.mode === 'expert' && entry.pids) {
    return str('ui.pids_set_by_hand_read_back', { name });
  }
  const key = pidsAdjusted(s.pids, s.tune) ? 'ui.through_your_sliders_read_back_from' : 'ui.as_it_ships_read_back_from';
  return str(key, { name });
}

/* The horizon is only drawn on the Setup tab, and not under a confirm
 * panel, which takes the tab's place. */
function horizonShown(ui) {
  return ui.screen === 'fc' && ui.fc.tab === 'setup' && !ui.fc.confirm;
}

/* The row note for whatever the cursor is on, into the screen's help box. */
function showNote(ui, item) {
  const help = ui.helpNode();
  if (!help) {
    return;
  }
  const note = (item && item.note) || '';
  /* A scrolled note keeps its scroll when its text changes, so the next
   * long note would open part way down. Reset it only on a change: this
   * runs on every cursor move and a scrollTop write forces a layout. */
  if (help.textContent !== note) {
    help.textContent = note;
    help.scrollTop = 0;
  }
  /* The title's note is positioned out of flow and grows upward over the
   * brand copy above it. Only one of the two is being read, so the brand
   * copy fades (CSS, on this class) while a note is showing. */
  if (ui.screens.title) {
    ui.screens.title.classList.toggle('has-help', help === ui.titleHelp && note !== '');
  }
}

/* A row's choices drawn side by side, the live one lit, each clickable:
 * the pilot sees what the other choices are called and goes straight to
 * one. Choosing the lit one does nothing. */
function choiceStrip(ui, it, i, choices, choose) {
  const strip = el('div', 'row-control row-switch');
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', it.label);
  for (const c of choices) {
    const b = btn(c.lit ? 'sw-seg on' : 'sw-seg', c.label);
    b.setAttribute('aria-pressed', String(c.lit));
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      claimRow(ui, i);
      if (!c.lit) {
        choose(c.value);
      }
    });
    strip.append(b);
  }
  return strip;
}

/* The up and down arrows beside a value. With keepFocus, pressing one does
 * not take focus from a field being typed in: that blur would commit and
 * rebuild the row, and the click on its way would land on a button that no
 * longer exists, so the first press after typing did nothing. */
function arrowColumn(label, step, keepFocus) {
  const col = el('span', 'step-col');
  for (const [glyph, dir, key] of [['▲', 1, 'ui.increase'], ['▼', -1, 'ui.decrease']]) {
    const b = btn('step', glyph);
    b.setAttribute('aria-label', str(key, { label }));
    if (keepFocus) {
      b.addEventListener('mousedown', (e) => e.preventDefault());
    }
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      step(dir);
    });
    col.append(b);
  }
  return col;
}

/*
 * A field a number is typed into. It commits on Enter or when it loses
 * focus, never per keystroke: clamping as you type turns the 1 of 1500 into
 * the minimum, and each commit re-inits the module, which puts the quad back
 * on the start line. Escape puts the stored value back and leaves the field;
 * it has to be stopped here because src/input/input.js forwards Escape out
 * of text fields on purpose. With walksMenu, Up and Down commit and move the
 * cursor, so a field clicked into can be left from the keyboard.
 */
function typedField(ui, it, i, className, label, walksMenu) {
  const field = textInput(className, it.num.text, label);
  field.inputMode = 'decimal';
  field.addEventListener('click', stopOnly);
  field.addEventListener('focus', () => {
    enterRow(ui, i);
    field.select();
  });
  field.addEventListener('blur', () => {
    /* Removing a focused field fires blur. A field a rebuild has already
     * replaced carries a value that whatever rebuilt it has just written. */
    if (field.isConnected) {
      ui.commitNumber(it, field.value);
    }
  });
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      swallow(e);
      ui.commitNumber(it, field.value);
    } else if (e.key === 'Escape') {
      swallow(e);
      field.value = it.num.text;
      ui.syncRates();
      field.blur();
    } else if (walksMenu && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      swallow(e);
      ui.commitNumber(it, field.value);
      ui.move(e.key === 'ArrowDown' ? 1 : -1);
    }
  });
  return field;
}

function withUnit(wrap, it) {
  if (it.num.unit) {
    wrap.append(el('span', 'row-num-unit', it.num.unit));
  }
}

/* Store a value from a typed row, or put the stored one back on screen when
 * there is nothing new to store (the field may hold "67x", or a number that
 * rounds to what is already there). */
function storeTyped(ui, it, next) {
  if (next == null || next === it.num.cli) {
    ui.renderMenu();
    return;
  }
  it.set(next);
  ui.writeSettings();
}

/* Hang the list under the control, or above it when it would run off the
 * bottom of the window. Its height is only known once it is in the page. */
function placeDropList(list, at) {
  const left = Math.min(at.left, window.innerWidth - DROP_ROOM);
  list.style.left = `${Math.max(DROP_EDGE, left)}px`;
  list.style.minWidth = `${Math.max(at.width, DROP_MIN_WIDTH)}px`;
  list.style.top = `${at.bottom + DROP_GAP}px`;
  const box = list.getBoundingClientRect();
  if (box.bottom > window.innerHeight - DROP_EDGE) {
    list.style.top = `${Math.max(DROP_EDGE, at.top - box.height - DROP_GAP)}px`;
  }
}

export const menuControlMethods = {
  /* Every row on the Rates screen writes a setting and rebuilds the menu,
   * which calls this, so the curve is always the stored rates. */
  syncRates() {
    if (!this.ratesPanel || this.screen !== 'rates') {
      return;
    }
    if (this.ratesHint) {
      this.ratesHint.textContent = backHint(this.returnTo);
    }
    paintCurve(this);
  },

  /* Live sticks from the frame loop. They are kept even while the screen is
   * down, so the curve opens on the sticks as they are. */
  paintRates(stick) {
    if (stick) {
      this.ratesStick = stick;
    }
    if (this.ratesPanel && this.screen === 'rates') {
      this.ratesPanel.paintStick(this.ratesStick);
    }
  },

  /* The PID bars come only from the module's readback (setPidsLive). A
   * readback for another tune is stale and shows as loading. */
  syncPids() {
    if (!this.pidsPanel || this.screen !== 'pids') {
      return;
    }
    if (this.pidsHint) {
      this.pidsHint.textContent = backHint(this.returnTo);
    }
    const s = this.settings;
    const live = this.pidsLive && this.pidsLive.tune === s.tune ? this.pidsLive : null;
    this.pidsPanel.paint(live, pidsCaption(s, live));
  },

  /* The bench's tab rail, PID page strip, horizon and unsaved flag, all
   * repainted with the menu because every bench edit rebuilds it. */
  syncFcChrome() {
    if (!this.fcTabs) {
      return;
    }
    if (this.screen === 'fc') {
      /* A confirm panel is a question, and switching tab under it would
       * leave the question asked about a page nobody is looking at. */
      const turnTo = (apply) => (id) => {
        if (this.fc.confirm) {
          return;
        }
        apply(id);
        this.cursor = 0;
        this.renderMenu();
      };
      paintTabStrip(this.fcTabs, this.fc, turnTo((id) => this.fc.setTab(id)));
      paintPageStrip(this.fcPages, this.fc, turnTo((id) => { this.fc.page = id; }));
    }
    const horizon = horizonShown(this);
    this.fcAttitude.hidden = !horizon;
    if (horizon) {
      drawAttitude(this.fcAttitude, this.fc.attitude);
    }
    this.syncFcDirty();
  },

  syncFcDirty() {
    if (this.fcDirty) {
      this.fcDirty.textContent = this.fc.dirty() ? str('ui.unsaved') : '';
    }
    this.syncFcExit();
  },

  syncFcExit() {
    const bar = this.fcExit;
    if (!bar) {
      return;
    }
    const dirty = this.fc.dirty();
    /* The save-run confirm asks whether to restart a live run, and an Exit
     * beside it would be a third answer. The leave confirm keeps the bar:
     * it is the leave question, and hiding the bar would collapse the
     * header so the first row slid under the brand block. */
    bar.hidden = this.screen !== 'fc' || this.fc.confirm === 'save-run';
    if (this.fcSaveExit) {
      this.fcSaveExit.hidden = !dirty;
    }
    if (this.fcLeave) {
      this.fcLeave.textContent = str(dirty ? 'ui.exit_without_saving' : 'ui.exit');
    }
    if (this.fcExitCopy) {
      this.fcExitCopy.textContent = dirty ? 'exits without saving' : 'returns';
    }
  },

  leaveFc() {
    this.fc.stopMotors();
    this.fc.confirm = null;
    this.show(FC_RETURNS_TO.has(this.fcFrom) ? this.fcFrom : 'title');
  },

  /* The Setup tab's horizon, fed by the frame loop. */
  paintFcAttitude() {
    if (horizonShown(this)) {
      drawAttitude(this.fcAttitude, this.fc.attitude);
    }
  },

  /* The module readback after each successful sim_init. Nothing on the PIDs
   * screen computes a PID itself, so a control that stopped reaching
   * Betaflight shows as a control that moves nothing. */
  setPidsLive(live) {
    this.pidsLive = live || null;
    if (this.screen === 'pids') {
      this.renderMenu();
    }
  },

  helpNode() {
    if (this.screen === 'rooms' || this.screen === 'roomnew') {
      const page = this.roomPages[this.screen];
      return page && page.help;
    }
    const field = HELP_FIELD[this.screen];
    return field ? this[field] : undefined;
  },

  syncCursor(scroll = true) {
    const items = this.items();
    this.markBars(items);
    const current = items[this.cursor];
    /* Remembered by id so a rebuild that changes the list's length (the
     * bench's filters, the launch card, the rooms) puts the cursor back on
     * the same row rather than the same index. See restoreFocusRow. */
    if (current && current.id) {
      this.focusId = current.id;
    }
    for (const [k, row] of this.menuRows.entries()) {
      const lit = k + this.rowOffset === this.cursor;
      row.classList.toggle('on', lit);
      /* Roving tabindex, rows only: headings sit in menuRows too and are
       * not focusable. */
      if (row.classList.contains('row')) {
        row.tabIndex = lit ? 0 : -1;
        row.setAttribute('aria-selected', String(lit));
      }
    }
    showNote(this, current);
    const row = this.menuRows[this.cursor - this.rowOffset];
    if (!row) {
      return;
    }
    if (scroll) {
      row.scrollIntoView({ block: 'nearest' });
    }
    /* Focus follows the cursor only when it is already in the menu: taking
     * it from the bench's search field mid-word, or from a page nobody has
     * touched yet, is worse than a focus ring one row behind. */
    if (row !== document.activeElement && this.focusInMenu()) {
      focusQuietly(row);
    }
  },

  /* Focus the cursor's row even from outside the menu. Leaving the search
   * field with Down is the one deliberate exit from a field: without this
   * focus dropped to the body, a screen reader followed nothing and Tab
   * started again at the top of the page. */
  focusCursorRow() {
    const row = this.menuRows && this.menuRows[this.cursor - this.rowOffset];
    if (row && row.classList.contains('row')) {
      focusQuietly(row);
    }
  },

  /* A row, or a control inside one, but not a text field: a field owns its
   * caret. Anything outside the menu is not ours to move. */
  focusInMenu() {
    const live = document.activeElement;
    if (!live || live === document.body || live.tagName === 'INPUT' || live.tagName === 'TEXTAREA') {
      return false;
    }
    return this.menuRows.some((row) => row.contains(live));
  },

  /* After a rebuild, back onto the row the cursor was on. When that row is
   * gone the clamped index the caller left is the least surprising place. */
  restoreFocusRow() {
    if (!this.focusId) {
      return;
    }
    const at = this.items().findIndex((it) => it && it.id === this.focusId && this.isStop(it));
    if (at >= 0) {
      this.cursor = at;
    }
  },

  /* Chromium sends mousemove when the element under a still pointer changes
   * because the list scrolled or was rebuilt. Only a real move counts, and
   * the first event, with nothing to compare against, does not. */
  pointerMoved(e) {
    const [x, y] = [this.ptrX, this.ptrY];
    this.ptrX = e.clientX;
    this.ptrY = e.clientY;
    return x != null && (x !== e.clientX || y !== e.clientY);
  },

  hoverCursor(e, i) {
    if (this.pointerMoved(e) && i !== this.cursor) {
      this.setCursor(i, true);
    }
  },

  /*
   * `pointer` means the mouse moved the cursor. Then there is no scroll, as
   * the row is under the pointer already and a nudge near a scroller's end
   * slides another row under it, which moves the cursor again in a loop;
   * and there is no move sound, which is a rattle when a sweep crosses
   * twenty rows.
   */
  setCursor(i, pointer = false) {
    this.noteInteraction();
    if (i === this.cursor) {
      return;
    }
    this.closeDrop();
    this.cursor = i;
    const item = this.items()[i];
    if (this.screen === 'courses' && item && item.course) {
      this.lastCardKey = courseCardKey(item);
    }
    /* Cards and the trick film are lit by the cursor, and a cursor move does
     * not rebuild the menu, so they are repainted here or they stay on the
     * first card and the first trick. */
    if (this.cardScreen()) {
      this.markCards();
    }
    if (this.screen === 'tricks') {
      this.renderTricks();
    }
    this.syncCursor(!pointer);
    if (!pointer && this.onUiSound) {
      this.onUiSound('move');
    }
  },

  /* The bench's search: a plain text field that filters as it is typed in.
   * Unlike a typed number it has no arrows, no decimal keypad and no commit
   * on blur. */
  makeSearch(it, i) {
    const wrap = el('div', 'row-control row-search');
    const field = textInput('row-num row-textfield', it.text.value || '', it.label);
    field.placeholder = it.text.placeholder || '';
    field.addEventListener('click', stopOnly);
    field.addEventListener('focus', () => enterRow(this, i));
    field.addEventListener('input', () => {
      const typed = field.value;
      window.clearTimeout(this.searchTimer);
      this.searchTimer = window.setTimeout(() => {
        if (!it.onText) {
          return;
        }
        it.onText(typed);
        /* The rebuild replaces the field, so the caret is carried over by
         * hand or the browser would drop it at the end. */
        this.searchCaret = field.selectionStart;
        this.renderMenu();
        this.restoreSearchCaret();
      }, SEARCH_SETTLE_MS);
    });
    field.addEventListener('keydown', (e) => {
      /* Typing must not reach the menu: `d` is Right on this shell and
       * would adjust a row mid-word. */
      e.stopPropagation();
      if (!SEARCH_EXITS.has(e.key)) {
        return;
      }
      /* Up, Down and Enter walk out into the results; Escape only leaves the
       * field, and a second Escape on the row leaves search, the same two
       * steps as a typed number. */
      e.preventDefault();
      field.blur();
      const step = SEARCH_EXITS.get(e.key);
      if (step) {
        this.move(step);
        this.focusCursorRow();
      }
    });
    wrap.append(field);
    return wrap;
  },

  restoreSearchCaret() {
    const row = this.menuRows && this.menuRows[this.cursor - this.rowOffset];
    const field = row && row.querySelector('.row-textfield');
    if (!field) {
      return;
    }
    field.focus();
    const at = this.searchCaret ?? field.value.length;
    field.setSelectionRange(at, at);
  },

  /* Off and On, both labelled: half of these rows are two named behaviours
   * rather than an on and an off in the pilot's head. */
  makeSwitch(it, i) {
    const choices = [false, true].map((on) => ({ label: on ? 'On' : 'Off', lit: it.on === on, value: on }));
    return choiceStrip(this, it, i, choices, (on) => this.setSwitch(it, on));
  },

  /* A handful of named choices (Acro or Angle, Low, High or Ultra), all
   * on the row: a popup hides every option but the chosen one. */
  makeSegments(it, i) {
    const choices = it.options.map((opt) => ({
      label: opt.label,
      lit: String(opt.value) === String(it.current),
      value: opt.value,
    }));
    return choiceStrip(this, it, i, choices, (value) => {
      if (!it.disabled && !it.info) {
        this.pick(value);
      }
    });
  },

  /* The one writer for a switch, so the mouse and the keys share the guard,
   * the save, the repaint and the sound. */
  setSwitch(it, on) {
    if (!it || !it.sw || it.disabled || it.info || it.on === Boolean(on)) {
      return;
    }
    it.adjust(on ? 1 : -1);
    this.writeSettings();
  },

  makeStepper(it, i) {
    const wrap = el('div', 'row-control');
    const bump = (dir) => {
      this.cursor = i;
      this.adjust(dir);
    };
    const value = el('span', 'row-value', it.value);
    value.addEventListener('click', (e) => {
      e.stopPropagation();
      bump(1);
    });
    wrap.append(value, arrowColumn(it.label, bump, false));
    return wrap;
  },

  /*
   * A typed number with arrows. While typing, the Rates curve already shows
   * the half-typed value (previewNumber); the store waits for the commit.
   * The arrows step from the typed text when there is some, so 800 then Up
   * is 810, not one step from the stored value.
   */
  makeNumber(it, i) {
    const wrap = el('div', 'row-control');
    const field = typedField(this, it, i, 'row-num', it.label, true);
    /* Clicking from one field into another. Left to the browser, the blur
     * of the field being left commits and rebuilds the rows, and the field
     * the click was going to is gone before focus lands. So the old field is
     * blurred on purpose and renderMenu focuses the rebuilt one
     * (numberFocusWanted). A click inside the focused field is the caret's. */
    field.addEventListener('mousedown', (e) => {
      const live = document.activeElement;
      if (live === field) {
        return;
      }
      e.preventDefault();
      if (live && live.classList && live.classList.contains('row-num')) {
        this.numberFocusWanted = i;
        live.blur();
      } else {
        field.focus();
      }
    });
    field.addEventListener('input', () => this.previewNumber(it, field.value));
    wrap.append(field);
    withUnit(wrap, it);
    wrap.append(arrowColumn(it.label, (dir) => {
      this.cursor = i;
      this.stepNumber(it, dir, field.value);
    }, true));
    return wrap;
  },

  /*
   * A drag slider with its number beside it, as Betaflight Configurator
   * draws simplified tuning. The track is a native range input, so touch,
   * mouse and a focused arrow key all work. It applies on release, not per
   * pixel: each apply re-inits the module, and a re-init per pixel would
   * stutter and rebuild the menu under the pointer mid-drag.
   */
  makeSliderControl(it, i) {
    const wrap = el('div', 'row-control row-slider');
    const track = document.createElement('input');
    track.type = 'range';
    track.className = 'row-range';
    /* Bounds before the value: a range input clamps its value to the bounds
     * it has when the value is set. */
    track.min = String(it.range.min);
    track.max = String(it.range.max);
    track.step = '1';
    track.value = String(it.num.cli);
    track.setAttribute('aria-label', it.label);
    track.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      enterRow(this, i);
    });
    track.addEventListener('click', stopOnly);
    const field = typedField(this, it, i, 'row-num row-range-num', str('ui.value', { label: it.label }), false);
    field.addEventListener('pointerdown', stopOnly);
    track.addEventListener('input', () => {
      field.value = formatRate(it.num.spec, Number(track.value));
    });
    track.addEventListener('change', () => {
      const v = Number(track.value);
      if (Number.isFinite(v) && v !== it.num.cli) {
        it.set(v);
        this.writeSettings();
      }
    });
    wrap.append(track, field);
    withUnit(wrap, it);
    return wrap;
  },

  /* The caret into a typed row's field, from a click on the row or Enter. */
  focusNumber(i) {
    const row = this.menuRows[i - this.rowOffset];
    const field = row && row.querySelector('.row-num');
    if (field) {
      field.focus();
    }
  },

  /* The curve the typed text would fly, drawn without keeping it. The row's
   * setter is the only thing that knows where the value goes (and whether
   * roll carries pitch along), so the value really is written and then put
   * back; nothing can read the settings in between. */
  previewNumber(it, raw) {
    if (!this.ratesPanel || this.screen !== 'rates') {
      return;
    }
    const trial = it.typed(raw);
    if (trial == null) {
      return;
    }
    const stored = it.num.cli;
    it.set(trial);
    try {
      paintCurve(this);
    } finally {
      it.set(stored);
    }
  },

  commitNumber(it, raw) {
    storeTyped(this, it, it.typed(raw));
  },

  stepNumber(it, dir, raw) {
    const { cliMin, cliMax } = it.num.spec;
    const from = it.typed(raw) ?? it.num.cli;
    storeTyped(this, it, Math.min(cliMax, Math.max(cliMin, from + dir)));
  },

  /* Every settings change ends here: store, rebuild, refresh what reads the
   * settings elsewhere (the title's freestyle line and the score overlay;
   * see refreshBest), sound, and tell the shell. */
  writeSettings() {
    saveSettings(this.settings);
    this.renderMenu();
    this.refreshBest();
    if (this.onUiSound) {
      this.onUiSound('adjust');
    }
    if (this.onSettings) {
      this.onSettings(this.settings);
    }
  },

  makeDrop(it, i) {
    const wrap = el('div', 'row-control');
    const opener = btn('drop-btn', it.value);
    opener.setAttribute('aria-haspopup', 'listbox');
    opener.setAttribute('aria-label', it.label);
    opener.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.dropIndex === i) {
        this.closeDrop();
      } else {
        this.openDrop(i, opener, it);
      }
    });
    wrap.append(opener);
    return wrap;
  },

  /* The keyboard's way in. The list hangs from the row's button, or from
   * the row itself when the row draws its value some other way. */
  openDropForCursor() {
    const it = this.items()[this.cursor];
    const row = this.menuRows && this.menuRows[this.cursor - this.rowOffset];
    if (!row || !it || !it.options || !it.options.length) {
      return;
    }
    if (this.onUiSound) {
      this.onUiSound('select');
    }
    this.openDrop(this.cursor, row.querySelector('.drop-btn') || row, it);
  },

  openDrop(i, anchor, it) {
    this.closeDrop();
    this.cursor = i;
    this.syncCursor();
    /* A row whose choices are better seen than read (the Aircraft row)
     * opens its own picker instead of a list. */
    if (it.open) {
      it.open();
      return;
    }
    const lit = it.options.findIndex((opt) => String(opt.value) === String(it.current));
    const choices = it.options.map((opt, j) => {
      const b = btn(j === lit ? 'drop-opt on' : 'drop-opt', opt.label);
      b.setAttribute('role', 'option');
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeDrop();
        this.cursor = i;
        this.pick(opt.value);
      });
      return b;
    });
    const list = el('div', 'drop-list');
    list.setAttribute('role', 'listbox');
    list.append(...choices);
    this.root.append(list);
    placeDropList(list, anchor.getBoundingClientRect());
    this.dropEl = list;
    this.dropIndex = i;
    this.dropChoices = choices;
    this.dropLit = Math.max(lit, 0);
    this.markDropHi();
  },

  markDropHi() {
    if (!this.dropChoices) {
      return;
    }
    this.dropChoices.forEach((b, j) => b.classList.toggle('on', j === this.dropLit));
    const lit = this.dropChoices[this.dropLit];
    if (lit) {
      lit.scrollIntoView({ block: 'nearest' });
    }
  },

  /* The keyboard highlight, wrapping at both ends. */
  moveDrop(dir) {
    const n = this.dropChoices ? this.dropChoices.length : 0;
    if (!this.dropEl || n === 0) {
      return;
    }
    this.dropLit = (this.dropLit + dir + n) % n;
    this.markDropHi();
    if (this.onUiSound) {
      this.onUiSound('move');
    }
  },

  confirmDrop() {
    const it = this.items()[this.cursor];
    const opt = it && it.options && it.options[this.dropLit];
    this.closeDrop();
    if (opt) {
      this.pick(opt.value);
    }
  },

  closeDrop() {
    if (this.dropEl) {
      this.dropEl.remove();
    }
    this.dropEl = null;
    this.dropIndex = null;
    this.dropChoices = null;
    this.dropLit = 0;
  },

  /* A choice for the cursor's row, from a list, a segment or the keys. */
  pick(value) {
    const it = this.items()[this.cursor];
    if (!it || !it.pick) {
      return;
    }
    it.pick(value);
    this.writeSettings();
  },
};
