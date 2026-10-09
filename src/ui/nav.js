/*
 * nav.js: the menu's painter and the moves between screens and rows.
 *
 * renderMenu draws the current screen's rows from items(), with the
 * controls menucontrols.js makes; show switches screens and settles what
 * one visit leaves behind; the cursor moves (arrows, pages, edges) and
 * where the cursor lands on arrival; the frame around every menu (the
 * breadcrumb, the loaded-track chips, the key legend and the command
 * button); the title's hint line; and the #credits address.
 *
 * Installed on Ui.prototype at the end of src/ui/ui.js, so `this` is the
 * Ui and every caller still writes ui.show(), ui.move() and so on.
 * scripts/nav-golden.js holds these methods to a record.
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

import { MAPS } from '../maps/registry.js';
import { readPilotName } from '../share/pilot.js';
import { activeCourseSummary } from '../share/summary.js';
import { str } from '../strings/index.js';
import { fitsAsSegments } from './rows.js';
import { HUBS } from './ways.js';
import { btn, el } from './widgets.js';
/* A cycle: ui.js installs this module. Only read inside methods, never at
 * this module's top level, where the bindings are not yet initialised. */
import { SCREEN_ACTIONS, SCREEN_TITLES, byLine, courseCardKey } from './ui.js';

/* Rows that leave for another tab rather than another screen. */
const LINK_ACTIONS = new Set(['leaderboard']);

/* The breadcrumb per screen, root first. A room inside a room shows the
 * trail, so Escape has one obvious destination. Resolved once, at load,
 * in the locale the page booted with, the same as the screen titles. */
const CRUMBS = {
  title: ['ui.product_name'],
  courses: ['ui.track_mode', 'ui.my_tracks'],
  freestyle: ['ui.freestyle'],
  pilot: ['ui.settings'],
  quad: ['ui.quad'],
  launch: ['ui.before_you_fly'],
  standings: ['ui.race', 'ui.standings'],
  rates: ['ui.settings', 'ui.rates'],
  pids: ['ui.quad', 'PIDs'],
  fc: ['ui.quad', 'ui.firmware_bench'],
  paused: ['ui.paused'],
  results: ['ui.run_complete'],
  howto: ['ui.how_to_fly'],
  tricks: ['ui.freestyle', 'ui.trick_list'],
  credits: ['ui.credits'],
  controls: ['ui.settings', 'keybinds.title'],
  friends: ['friends.title'],
  rooms: ['friends.title', 'roombrowser.title'],
  roomnew: ['friends.title', 'roombrowser.title', 'roombrowser.new_title'],
};
for (const [screen, parts] of Object.entries(CRUMBS)) {
  CRUMBS[screen] = parts.map((p) => (p.includes('.') ? str(p) : p));
}

/* The Ui field holding each screen's menu box. The room pages keep theirs
 * on their own page objects; see menuHost. */
const MENU_FIELD = {
  title: 'titleMenu',
  howto: 'howtoMenu',
  tricks: 'trickMenu',
  credits: 'creditsMenu',
  courses: 'coursesMenu',
  freestyle: 'freestyleMenu',
  pilot: 'pilotMenu',
  friends: 'friendsMenu',
  quad: 'quadMenu',
  launch: 'launchMenu',
  standings: 'standingsMenu',
  rates: 'ratesMenu',
  pids: 'pidsMenu',
  controls: 'controlsMenu',
  fc: 'fcMenu',
  paused: 'pausedMenu',
  results: 'resultsMenu',
};

function menuHost(ui) {
  const field = MENU_FIELD[ui.screen];
  if (field) {
    return ui[field];
  }
  const page = ui.roomPages && ui.roomPages[ui.screen];
  return page ? page.menu : null;
}

/* Rows the card screens draw as cards above the menu, not as rows. */
const isCardRow = (it) => Boolean(it.map || it.course || it.card || it.lobby);

/* The key hints on the title's line, by state: the gate is the root, so no
 * Escape there. */
const HINT_KEYS = { gate: ['←→', 'Enter'], menu: ['↑↓', 'Enter', 'Esc'] };

/* One row's height in CSS pixels, for turning the scroller into a page. */
const ROW_PX = 44;
const PAGE_MIN = 5;
const PAGE_MAX = 25;
const PAGE_UNMEASURED = 10;

/* The one screen that lives at an address: #credits is linkable, so it is
 * pinned over the title until the pilot backs off it. */
const HASH_SCREEN = 'credits';

function hashScreen() {
  return (window.location.hash || '').replace(/^#/, '');
}

function writeHash(hash) {
  const url = new URL(window.location.href);
  url.hash = hash;
  history.replaceState(null, '', url);
}

const anyStop = (ui, items) => items.map((it, i) => (ui.isStop(it) ? i : -1)).filter((i) => i >= 0);

/* One menu row for item `it` at list index `i`: its kind as a class so
 * CSS can mark it, a roving tabindex, its control, and its mouse and
 * focus handlers. */
function paintRow(ui, it, i) {
  const kind = ui.rowKind(it);
  const cls = ['row'];
  if (kind === 'navigation') {
    cls.push('row-nav');
  }
  if (kind === 'link') {
    cls.push('row-link');
  }
  if (it.info) {
    cls.push('row-info');
  }
  if (it.disabled) {
    cls.push('row-grey');
  }
  if (it.primary) {
    cls.push('row-primary');
  }
  if (it.rowClass) {
    cls.push(it.rowClass);
  }
  const row = el('div', cls.join(' '));
  /* Listbox contract: exactly the cursor's row is reachable by Tab, the
   * rest only by script, so document.activeElement and ui.cursor are
   * one authority. A reader follows the cursor and the focus ring sits
   * on the painted bar. Options in a listbox, not nine unrelated
   * buttons. */
  const under = i === ui.cursor;
  row.tabIndex = under ? 0 : -1;
  row.setAttribute('role', 'option');
  row.setAttribute('aria-selected', String(under));
  if (it.id) {
    row.dataset.rowId = it.id;
  }
  /* Focus the shell did not drive (Tab, a reader, a click) moves the
   * cursor, or the two authorities disagree with the roles reversed. */
  row.addEventListener('focus', () => {
    if (ui.cursor !== i) {
      ui.cursor = i;
      ui.syncCursor(false);
    }
  });
  row.append(el('span', 'row-label', it.label));
  const control = controlFor(ui, it, i);
  if (control) {
    row.append(control);
  }
  /* mousemove, not mouseenter: a rebuilt row under a still pointer, or
   * the scroll after scrollIntoView, must not snap the cursor back. */
  row.addEventListener('mousemove', (e) => ui.hoverCursor(e, i));
  row.addEventListener('click', (e) => {
    if (e.target.closest('.row-control')) {
      return;
    }
    ui.closeDrop();
    ui.cursor = i;
    ui.syncCursor(false);
    /* A typed row's label is the biggest thing to aim at, so it opens
     * the field. Other value rows change through their control; the
     * label only focuses them. Action rows fire. */
    if (it.num) {
      ui.focusNumber(i);
      return;
    }
    if (!it.adjust && !it.options && !it.step && !it.info) {
      ui.select();
    }
  });
  return row;
}

/* The control on the right of a row, or null for a plain action row.
 * Typed rows come before the stepper test because a typed row has
 * arrows too, and the field is the point of it. */
function controlFor(ui, it, i) {
  if (it.num) {
    return it.range ? ui.makeSliderControl(it, i) : ui.makeNumber(it, i);
  }
  if (it.text) {
    return ui.makeSearch(it, i);
  }
  if (it.sw) {
    return ui.makeSwitch(it, i);
  }
  if (fitsAsSegments(it)) {
    return ui.makeSegments(it, i);
  }
  if (it.options) {
    return ui.makeDrop(it, i);
  }
  if (it.step || it.adjust) {
    return ui.makeStepper(it, i);
  }
  if (it.value == null) {
    return null;
  }
  const val = el('span', 'row-value', it.value);
  if (it.info) {
    val.title = it.value;
  }
  return val;
}


/* What one visit leaves behind, given the screen being moved to. The
 * `from` fields each belong to one trip, and a trip is over when its
 * origin is left for anywhere but the next room in. */
function leaveFor(ui, screen) {
  const from = ui.screen;
  const leaving = (s) => from === s && screen !== s;
  if (leaving('courses')) {
    /* Nothing draws a thumbnail for a screen nobody is looking at. */
    ui.stopReels();
    ui.mapCards = null;
    ui.courseCards = null;
    ui.courseCardKey = null;
    ui.cardSubject = null;
    ui.lastCardKey = null;
    ui.newTrackOpen = false;
  }
  if (ui.roomFrom && (screen === 'title' || screen === ui.roomFrom)) {
    ui.roomFrom = null;
  }
  if (leaving('rates')) {
    ui.ratesFrom = null;
  }
  if (leaving('walk')) {
    ui.closeWalk();
  }
  /* A storage complaint belongs to the visit that caused it. */
  if (screen === 'rates' && from !== 'rates') {
    ui.ratesNotice = null;
  }
  /* pidsFrom survives the bench, because the bench comes back to PIDs:
   * dropping it there is how Quad, Tune, Every setting, back, back once
   * landed on the title. */
  if (leaving('controls')) {
    ui.binding = null;
    ui.keybindMsg = null;
  }
  if (leaving('pids') && screen !== 'fc') {
    ui.pidsFrom = null;
  }
  if (leaving('fc')) {
    ui.fcFrom = null;
  }
  if (leaving(HASH_SCREEN) && hashScreen() === HASH_SCREEN) {
    writeHash('');
  }
}

/* What a screen loads or starts on entry. ui.screen is already the new
 * one. */
function arriveAt(ui, screen) {
  if (screen === 'courses') {
    /* Read on every entry, not cached: the builder hands the pilot back
     * here, and a track saved there has to be on this list. */
    ui.loadLocalCourses();
    ui.loadBoardCourses();
    ui.loadCloudCourses();
  }
  if (screen === 'howto') {
    ui.renderHowto();
  }
  /* The trick film is the one thing asking for frames outside flight: it
   * runs on exactly one screen. */
  if (ui.trickPlayer) {
    if (screen === 'tricks') {
      ui.trickShown = '';
      ui.renderTricks();
    } else {
      ui.trickPlayer.stop();
    }
  }
  if (screen === HASH_SCREEN && hashScreen() !== HASH_SCREEN) {
    writeHash(HASH_SCREEN);
  }
}

/* The breadcrumb's parts, root first. A hub on the gate names itself
 * under the product; a screen without a trail shows its title. */
function crumbTrail(ui) {
  const hub = ui.screen === 'title' && ui.onGate() && ui.hub ? HUBS.find((h) => h.id === ui.hub) : null;
  if (hub) {
    return [str('ui.product_name'), str(hub.label)];
  }
  /* A walkable hangar is under the hub it was opened from. */
  if (ui.screen === 'walk' && ui.walk) {
    return ui.walk.tier === 'field' ? [str('hub.ops'), str('walk.field')] : [str('hub.hangar'), str('walk.card')];
  }
  return CRUMBS[ui.screen] || [SCREEN_TITLES[ui.screen] || ui.screen];
}

export const navMethods = {
  renderMenu() {
    /* The sign in chip's label can change without the screen changing. */
    this.syncChips();
    if (this.screen === 'standings') {
      this.paintStandings();
    }
    if (this.screen === 'launch' && this.launchLede) {
      const seat = activeCourseSummary();
      const map = MAPS.find((m) => m.id === this.settings.map) ?? MAPS[0];
      const parts = [
        seat && seat.name ? seat.name : map.name,
        seat && seat.gates ? `${seat.gates} gates` : '',
        byLine(seat),
      ];
      this.launchLede.textContent = parts.filter(Boolean).join(' · ');
    }
    this.closeDrop();
    if (this.screen === 'courses') {
      this.renderMapCards();
      this.renderCourseCards();
    } else if (this.screen === 'freestyle') {
      this.renderMapCards();
    } else if (this.screen === 'tricks') {
      this.renderTricks();
    } else if (this.screen === 'title') {
      this.renderTitleCards();
      this.renderTitleRooms();
      this.renderTitleStats();
    }
    if (this.screens && this.screens.title) {
      /* onGate(), the one definition of "the gate is up", and never
       * `!this.mode` alone: a link can answer the mode while the aircraft
       * is still being asked, and dressing that as the menu left the front
       * page with an empty panel and no way to fly. */
      const gate = this.onGate();
      this.screens.title.classList.toggle('is-first', Boolean(this.firstRun));
      this.screens.title.classList.toggle('is-gate', gate);
      this.setTitleHint(gate);
    }
    const host = menuHost(this);
    if (!host) {
      return;
    }
    const items = this.items();
    if (this.cursor >= items.length || !this.isStop(items[this.cursor])) {
      /* titleStop, so the gate's first paint lands on the seated aircraft;
       * on every other screen it is the first stop. */
      this.cursor = this.titleStop();
    }
    const kept = host.scrollTop;
    host.textContent = '';
    const drawn = items.filter((it) => !it.bar);
    const rows = this.cardScreen() ? drawn.filter((it) => !isCardRow(it)) : drawn;
    /* Row k of the list is item k + offset: the cards above it hold the
     * first indexes, and syncCursor subtracts the offset back off. */
    const offset = drawn.length - rows.length;
    this.rowOffset = offset;
    this.menuRows = [];
    /* The bench's Save, Discard, Export and Exit sit in one button bar at
     * the point the first of them appears. */
    let fcBar = null;
    rows.forEach((it, k) => {
      const i = k + offset;
      if (it.section) {
        const head = el('div', 'menu-section', it.label);
        host.append(head);
        this.menuRows.push(head);
        return;
      }
      const row = paintRow(this, it, i);
      if (this.screen === 'fc' && it.rowClass === 'fc-btn') {
        if (!fcBar) {
          fcBar = el('div', 'fc-bar');
          host.append(fcBar);
        }
        fcBar.append(row);
      } else {
        host.append(row);
      }
      this.menuRows.push(row);
    });
    /* The scroll survives a rebuild of the same list and not a shorter
     * one: a three row confirm panel restored to 3600 px is a question the
     * pilot cannot see. */
    host.scrollTop = host.scrollHeight > host.clientHeight ? kept : 0;
    /* Focus first, because the cursor belongs to a row and the list may
     * have changed length under it. */
    this.restoreFocusRow();
    this.syncFrame();
    this.syncCursor(false);
    this.syncRates();
    this.syncPids();
    this.syncFcChrome();
    /* A click that was travelling between typed fields, landing now that
     * the field it aimed at exists again (see makeNumber). */
    if (this.numberFocusWanted != null) {
      const want = this.numberFocusWanted;
      this.numberFocusWanted = null;
      this.focusNumber(want);
    }
  },

  show(screen) {
    this.closeDrop();
    /* Inside a room the room is home (docs/FLOW-AUDIT.md rules 3 and 4):
     * whatever ends on the title ends on the room instead. */
    if (screen === 'title' && this.inRoom && this.inRoom()) {
      screen = 'friends';
    }
    /* A stick held through a screen change is not a gesture on the new
     * screen. pollPad is edge triggered, and flight, calibrate and the pad
     * picker all leave it believing every stick is centred, so the first
     * poll after a change seeds the tracker instead of acting on it. A
     * flick in the same two milliseconds is swallowed: let go and flick
     * again, which the edge trigger already costs everywhere else. */
    this.padRearm = true;
    this.swapPadPrev = null;
    /* A picker belongs to the screen it opened over, and so does the
     * hangar, unsaved paint and all. */
    const changing = screen !== this.screen;
    if (changing && this.carousel && this.carousel.isOpen) {
      this.carousel.close();
    }
    if (changing && this.hangar && this.hangar.isOpen) {
      this.hangar.cancel();
    }
    /* The address wins over the title until the pilot backs off it: world
     * load, a map swap and the constructor all show('title'). */
    if (screen === 'title' && hashScreen() === HASH_SCREEN) {
      screen = HASH_SCREEN;
      if (!this.returnTo) {
        this.returnTo = 'title';
      }
    }
    leaveFor(this, screen);
    const leaving = this.items()[this.cursor];
    if (this.screen && leaving && leaving.id) {
      /* By id, never by index or label: the lists change length with the
       * loaded track and the dirty flag, and Back is on nine screens. */
      this.cursorMemory[this.screen] = leaving.id;
    }
    /* After the hash pin: landing on the pinned screen again is not a
     * change. Ids are screen prefixed, so a stale one could not match
     * anyway; clearing it says so on purpose. */
    if (this.screen !== screen) {
      this.focusId = null;
    }
    /* Arriving is interaction: a preview recorder must not start into the
     * frame still painting the room. */
    this.noteInteraction();
    this.screen = screen;
    this.cursor = this.restoreCursor();
    arriveAt(this, screen);
    for (const [name, node] of Object.entries(this.screens)) {
      node.style.display = name === screen ? '' : 'none';
    }
    this.syncFrame();
    /* Paused keeps the flight display up, dimmed: the clock and the pack
     * are what the pilot paused to read. */
    const flying = screen === 'flight' || screen === 'paused';
    this.osd.style.display = flying ? '' : 'none';
    this.osd.className = screen === 'paused' ? 'osd dim' : 'osd';
    this.syncScoreVisible();
    this.renderMenu();
    this.syncChips();
    /* Last, and on every show, including a re-entry: a listener reads a
     * settled screen, and the shell side is idempotent. */
    if (typeof this.onScreenChange === 'function') {
      this.onScreenChange(screen);
    }
  },

  bindLocationHash() {
    this.applyLocationHash();
    window.addEventListener('hashchange', () => this.applyLocationHash());
  },

  /* The address bar as a command: #credits opens the credits unless a run
   * is up, and clearing it from the credits goes back. */
  applyLocationHash() {
    if (hashScreen() === HASH_SCREEN) {
      if (!['credits', 'flight', 'paused'].includes(this.screen)) {
        this.act(HASH_SCREEN);
      }
      return;
    }
    if (this.screen === HASH_SCREEN) {
      this.back();
    }
  },

  /* The card `cardSubject` names, or null. Cards are rebuilt by every
   * items() call, so the chosen one is found by key, not by reference. */
  subjectCard() {
    if (!this.cardSubject) {
      return null;
    }
    return this.items().find((it) => it.course && courseCardKey(it) === this.cardSubject) || null;
  },

  /* Where the cursor goes when a chosen card closes: back on that card,
   * rather than the top of the strip. */
  cardCursor() {
    const items = this.items();
    const at = items.findIndex((it) => it.course && courseCardKey(it) === this.lastCardKey);
    return at < 0 ? this.firstStop(items) : at;
  },

  setTitleHint(gate) {
    if (!this.titleHint) {
      return;
    }
    const keys = this.titleHint.querySelector('.hint-keys');
    const copy = this.titleHint.querySelector('.hint-copy');
    if (!keys || !copy) {
      return;
    }
    const want = gate ? HINT_KEYS.gate : HINT_KEYS.menu;
    const have = [...keys.children].map((k) => k.textContent);
    if (have.join('\n') !== want.join('\n')) {
      keys.textContent = '';
      keys.append(...want.map((k) => el('kbd', null, k)));
    }
    copy.textContent = gate ? str('ui.left_and_right_choose_enter_opens') : str('ui.arrow_keys_move_enter_selects_escape');
  },

  /* A heading is in the list so it paints in place, and it is not
   * somewhere the cursor can land. */
  isStop(it) {
    return Boolean(it) && !it.section;
  },

  /* A row the arrow keys step over and nothing else does. The bench lists
   * hundreds of keys this build does not implement, each with a note
   * saying why; making them non-stops would delete the notes, so skipping
   * is a property of the travel: pages, edges and clicks still land. */
  isSkip(it) {
    return Boolean(it) && Boolean(it.skip);
  },

  /* Where Up and Down stop. A screen of nothing but skipped rows still has
   * to be walkable, so then every stop counts. */
  arrowStops(items) {
    const stops = anyStop(this, items);
    const walked = stops.filter((i) => !this.isSkip(items[i]));
    return walked.length ? walked : stops;
  },

  /* The first stop at or after `from`, else the first stop anywhere, else
   * 0. The offset lets a chosen course card put the cursor on its own
   * list rather than back on the first card in the strip. */
  firstStop(items, from = 0) {
    const stops = anyStop(this, items);
    const after = stops.find((i) => i >= from);
    return after ?? stops[0] ?? 0;
  },

  /* The module predicate, reachable from the shell check, so the check
   * and the painter cannot disagree about which rows draw as a strip. */
  fitsAsSegments(it) {
    return fitsAsSegments(it);
  },

  /* The row grammar, which decides what Enter does and what the row looks
   * like: a value row is changed in place by Left and Right, a navigation
   * row opens a screen (a chevron), a link row leaves for a tab (an
   * arrow), and everything else does a thing. */
  rowKind(it) {
    if (!it) {
      return 'action';
    }
    if (it.adjust || it.options || it.spec || it.num) {
      return 'value';
    }
    if (it.action && LINK_ACTIONS.has(it.action)) {
      return 'link';
    }
    if (it.action && SCREEN_ACTIONS.has(it.action)) {
      return 'navigation';
    }
    return 'action';
  },

  /* The row the command bar's button fires: the screen's `primary` row,
   * while it can be chosen. */
  primaryItem() {
    return this.items().find((it) => it && it.primary && !it.disabled) || null;
  },

  /* The bars around the menu, repainted whenever the screen or the cursor
   * changes. The legend speaks for the input device used last, not both
   * at once. */
  syncFrame() {
    const onFlight = this.screen === 'flight';
    const bench = this.screen === 'fc';
    /* The title is its own branding, and a breadcrumb under the wordmark
     * would land on the bug chip and the music dock. The bench paints its
     * own chrome, so it keeps only the legend. */
    this.frameTop.hidden = onFlight || bench || this.screen === 'title';
    this.frameBot.hidden = onFlight;
    /* The floating chips move out from under the bar whenever there is
     * one, which is the condition, not a window width. */
    this.root.classList.toggle('bar-shown', !this.frameTop.hidden);
    if (onFlight) {
      this.root.style.setProperty('--bar-top', '0px');
      this.root.style.setProperty('--bar-bot', '0px');
      return;
    }
    this.root.style.setProperty('--bar-top', bench ? '0px' : '48px');
    this.root.style.setProperty('--bar-bot', '52px');

    this.crumb.textContent = '';
    const trail = crumbTrail(this);
    trail.forEach((part, i) => {
      if (i) {
        this.crumb.append(el('span', 'crumb-sep', '/'));
      }
      this.crumb.append(el('span', i === trail.length - 1 ? 'crumb-here' : 'crumb-up', part));
    });

    this.frameContext.textContent = '';
    for (const chip of this.contextChips()) {
      const node = el('span', 'frame-chip');
      node.append(el('span', 'frame-chip-key', chip.label), el('b', null, chip.value));
      this.frameContext.append(node);
    }

    this.frameLegend.textContent = '';
    const kbd = this.lastInput === 'pad' ? 'kbd pad' : 'kbd';
    for (const hint of this.legendFor()) {
      /* A hint carrying an action is a button, for whoever is not holding
       * a keyboard. The rest stay text: a legend that looks clickable and
       * mostly is not would be worse. */
      const node = hint.action ? btn('legend-act', '') : el('i', null);
      node.append(...hint.keys.map((k) => el('span', kbd, k)), document.createTextNode(` ${hint.text}`));
      if (hint.action) {
        node.dataset.action = hint.action;
        node.addEventListener('click', () => this.act(hint.action));
      }
      this.frameLegend.append(node);
    }

    const primary = this.primaryItem();
    this.framePrimary.hidden = !primary;
    if (primary) {
      this.framePrimary.textContent = primary.label;
    }
  },

  /* What the next run will fly and who is flying it, so no screen has to
   * be left to find out. */
  contextChips() {
    if (this.screen === 'flight' || this.screen === 'fc') {
      return [];
    }
    const seat = activeCourseSummary();
    const map = MAPS.find((m) => m.id === this.settings.map) ?? MAPS[0];
    const chips = [{ label: str('ui.flying'), value: seat && seat.name ? seat.name : map.name }];
    const name = readPilotName();
    if (name) {
      chips.push({ label: str('ui.pilot'), value: name });
    }
    return chips;
  },

  /* The keys this screen answers, kept short. Three voices: pad, keyboard,
   * and touch for a phone that has neither, which gets words about tapping
   * and a Back it can press. lastInput wins once something has spoken. */
  legendFor() {
    const title = this.screen === 'title';
    const gate = this.onGate();
    const hubBack = title && gate && Boolean(this.hub);
    const touch = this.lastInput === 'none'
      && typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 0;
    if (touch) {
      const hints = [{ keys: [], text: this.cardScreen() ? str('ui.tap_a_card') : str('ui.tap_a_row') }];
      /* The title's own way out is the last row of its menu, under a
       * thumb; see titleItems. */
      if (!title || hubBack) {
        hints.push({ keys: [], text: str('ui.back'), action: 'back' });
      }
      return hints;
    }
    const pad = this.lastInput === 'pad';
    if (this.screen === 'walk' && this.walk && this.walk.photo) {
      return [
        { keys: pad ? ['Roll'] : ['Drag', 'Wheel'], text: str('walk.photo_aim') },
        { keys: [pad ? 'A' : 'Space'], text: str('walk.photo_take'), action: 'walk-photo-take' },
        { keys: [pad ? 'B' : 'P'], text: str('walk.photo_done'), action: 'walk-photo' },
      ];
    }
    if (this.screen === 'walk') {
      return [
        { keys: ['P'], text: str('walk.photo'), action: 'walk-photo' },
        { keys: pad ? ['Pitch', 'Roll'] : ['W A S D'], text: str('walk.walk') },
        { keys: [pad ? 'A' : 'E'], text: str('walk.use') },
        { keys: [pad ? 'B' : 'Esc'], text: str('ui.back'), action: 'back' },
      ];
    }
    const hints = [];
    const arrows = (a, b) => (pad ? ['Pitch'] : [a, b]);
    if (this.cardScreen()) {
      /* Pitch walks a card strip on the pad; roll chooses and backs. */
      hints.push({ keys: arrows('←', '→'), text: str('ui.move') });
    } else {
      hints.push({ keys: arrows('↑', '↓'), text: str('ui.move') });
      if (this.rowKind(this.items()[this.cursor]) === 'value') {
        hints.push({ keys: pad ? ['Roll'] : ['←', '→'], text: str('ui.adjust') });
      }
    }
    hints.push({ keys: [pad ? 'A' : 'Enter'], text: str('ui.choose') });
    const backKey = [pad ? 'B' : 'Esc'];
    if (!title) {
      hints.push({ keys: backKey, text: str('ui.back') });
    } else if (hubBack) {
      /* A hub's way home, a button as well as a key, for the mouse. */
      hints.push({ keys: backKey, text: str('ui.back'), action: 'back' });
    } else if (!gate) {
      /* Escape on the menu reopens the gate, the only way to change mode
       * or aircraft without reloading, and it is named for what it opens:
       * Back on the front page reads as leaving the game. The gate itself
       * is the root, where Escape does nothing, so no hint there. */
      hints.push({ keys: backKey, text: this.gateLabel() });
    }
    return hints;
  },

  /* Where the cursor lands on arrival: the remembered row if it is still
   * there and still a stop, else the row the screen exists for (Fly,
   * Resume), else the first stop. The primary row rather than the first
   * stop because on the launch card the first stop is a dropdown, and a
   * pilot who read "Enter flies it" was getting a list of packet rates. */
  restoreCursor() {
    const items = this.items();
    const want = this.cursorMemory[this.screen];
    const remembered = want ? items.findIndex((it) => it && it.id === want && this.isStop(it)) : -1;
    if (remembered >= 0) {
      return remembered;
    }
    const primary = items.findIndex((it) => it && it.primary && this.isStop(it));
    return primary >= 0 ? primary : this.firstStop(items);
  },

  move(dir) {
    const items = this.items();
    const n = items.length;
    if (!n) {
      return;
    }
    /* A Set: the bench is 144 rows rebuilt on every keypress. The walk is
     * bounded by n so a list of nothing but headings cannot spin. */
    const walkable = new Set(this.arrowStops(items));
    let next = (this.cursor + dir + n) % n;
    for (let tries = 0; tries < n && !walkable.has(next); tries += 1) {
      next = (next + dir + n) % n;
    }
    this.setCursor(next);
  },

  /* PageUp and PageDown travel by a screenful and, unlike the arrows, land
   * on skipped rows: a greyed firmware key is readable without walking
   * 138 of its neighbours. */
  pageMove(dir) {
    const items = this.items();
    const stops = anyStop(this, items);
    if (!stops.length) {
      return;
    }
    const at = Math.max(0, stops.indexOf(this.cursor));
    const to = Math.max(0, Math.min(stops.length - 1, at + dir * this.pageSize()));
    this.setCursor(stops[to]);
  },

  /* A page is what the live scroller shows, so a short window pages by
   * less, clamped so a collapsed or unmeasured box still moves. */
  pageSize() {
    const scroll = this.menuScrollNode();
    const visible = scroll && scroll.clientHeight ? Math.floor(scroll.clientHeight / ROW_PX) : 0;
    return Math.max(PAGE_MIN, Math.min(PAGE_MAX, visible || PAGE_UNMEASURED));
  },

  /* Home and End, landing on any stop, skipped or not. */
  jumpEdge(dir) {
    const stops = anyStop(this, this.items());
    if (!stops.length) {
      return;
    }
    this.setCursor(dir < 0 ? stops[0] : stops[stops.length - 1]);
  },
};
