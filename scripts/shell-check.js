/*
 * shell-check.js: every menu screen of the real shell, walked in headless
 * Chromium through window.__ui.
 *
 *   node scripts/shell-check.js                 check at 1600x900
 *   node scripts/shell-check.js --record        write today's fit into the baseline, then check
 *   node scripts/shell-check.js --w=1280 --h=720
 *
 * For each screen it asks: can the arrows, page keys and edge jumps reach
 * every row that takes the cursor, so a row's help can be read; does
 * Escape land on a screen that exists; and does the list fit the window no
 * worse than tests/shell-baseline.json says it did. The baseline only
 * counts at the window it was recorded at. Every row must carry an id that
 * is present, unique and the same across two rebuilds. Then a set of
 * behaviour rows, each a promise the shell made to a pilot (focus memory,
 * the tuning path, the firmware bench, the radio banner and select hold,
 * the gate cards), is exercised and judged.
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

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { mapTrackDocument } from '../tests/lib/maptrack.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BASELINE_PATH = join(ROOT, 'tests', 'shell-baseline.json');

const SCREENS = [
  'title', 'courses', 'freestyle', 'quad', 'pilot', 'launch', 'rates', 'pids', 'fc', 'paused',
  'results', 'howto', 'tricks', 'credits',
];
const FC_TABS = ['setup', 'configuration', 'pid', 'receiver', 'motors'];

/* Owned by src/trackbuilder/storage.js and src/share/session.js, neither of
 * which exports its key. */
const LIBRARY_KEY = 'webfpv.trackbuilder.library.v1';
const IMPORT_KEY = 'webfpv.share.import.v1';

const LIBRARY_DOCS = [0, 1].map((i) => ({
  ...mapTrackDocument({ id: `trk-5e1f00${i}0`, name: `Ring ${i + 1} (mine)` }),
  modifiedUtc: `2026-0${i + 1}-01T00:00:00.000Z`,
}));
const LIBRARY = Object.fromEntries(LIBRARY_DOCS.map((doc) => [doc.id, doc]));

const BASELINE_NOTE = "Today's overflow, in CSS pixels, at the window below. Not a target: a screen may already overflow. The check fails when a screen gets worse than this.";

function parseArgs(argv) {
  const opts = { w: 1600, h: 900, record: false };
  for (const arg of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (!m) {
      continue;
    }
    const [, name, value] = m;
    if (value === undefined) {
      opts[name] = true;
    } else {
      opts[name] = /^\d+$/.test(value) ? Number(value) : value;
    }
  }
  return opts;
}

/* ------------------------------------------------------------------
 * Page side. These functions are never called in Node: their source is
 * shipped into the page, so they may only use what the page has. */

function caught(fn) {
  try {
    return fn();
  } catch (e) {
    return { error: (e && e.message) || String(e) };
  }
}

function pastGate(ui) {
  ui.firstRun = false;
  ui.craftGate = false;
  if (!ui.mode) {
    ui.mode = 'race';
  }
}

/* Down arrow from the first stop until the cursor sticks or comes round
 * again. The set holds every index the cursor rested on, start included. */
function arrowWalk(ui, items) {
  ui.setCursor(ui.firstStop(items));
  const seen = new Set([ui.cursor]);
  for (let n = 0; n < items.length * 2; n += 1) {
    const prev = ui.cursor;
    ui.move(1);
    if (ui.cursor === prev || seen.has(ui.cursor)) {
      break;
    }
    seen.add(ui.cursor);
  }
  return seen;
}

function scrollerOf(ui, name) {
  return ui.root.querySelector(`.screen-${name} .menu-scroll, .screen-${name} .menu`);
}

function walkScreen(ui, name) {
  ui.show(name);
  const fc = name === 'fc' && ui.fc ? ui.fc : null;
  if (fc) {
    fc.walkAll = true;
  }

  /* Measured on arrival, before any key has scrolled the list. */
  let belowFold = 0;
  let rowsSeen = 0;
  const box = scrollerOf(ui, name);
  if (box) {
    const r = box.getBoundingClientRect();
    belowFold = Math.max(0, Math.round(r.bottom - innerHeight));
    rowsSeen = [...document.querySelectorAll(`.screen-${name} .menu .row`)].filter((row) => {
      const b = row.getBoundingClientRect();
      return b.top >= 0 && b.bottom <= innerHeight && b.top >= r.top - 1 && b.bottom <= r.bottom + 1;
    }).length;
  }

  const items = ui.items();
  const stops = items.map((it, i) => (ui.isStop(it) ? i : -1)).filter((i) => i >= 0);
  if (stops.length === 0) {
    return { stops: 0, arrow: 0, reached: 0, unreachable: [], notesLost: 0, overflow: 0 };
  }

  const reached = arrowWalk(ui, items);
  let arrow = reached.size;
  ui.jumpEdge(-1);
  reached.add(ui.cursor);
  for (let n = 0; n < items.length + 4; n += 1) {
    const prev = ui.cursor;
    ui.pageMove(1);
    reached.add(ui.cursor);
    if (ui.cursor === prev) {
      break;
    }
  }
  ui.jumpEdge(1);
  reached.add(ui.cursor);

  /* The bench walks every key for reach, but a pilot's arrows only stop on
   * the default rows, so its travel is counted with walkAll off. */
  if (fc) {
    fc.walkAll = false;
    arrow = arrowWalk(ui, ui.items()).size;
    fc.walkAll = true;
  }

  const lost = stops.filter((i) => !reached.has(i));
  const after = scrollerOf(ui, name);
  return {
    stops: stops.length,
    arrow,
    reached: reached.size,
    unreachable: lost.slice(0, 8).map((i) => items[i].label || `index ${i}`),
    notesLost: lost.filter((i) => items[i].note).length,
    overflow: after ? Math.max(0, Math.round(after.scrollHeight - after.clientHeight)) : 0,
    belowFold,
    rowsSeen,
  };
}

function walkProbe(ui, { screens }) {
  pastGate(ui);
  return Object.fromEntries(screens.map((name) => [name, caught(() => walkScreen(ui, name))]));
}

function escapeProbe(ui, { screens }) {
  pastGate(ui);
  const known = new Set([...Object.keys(ui.screens), 'flight']);
  return Object.fromEntries(screens.map((name) => [name, caught(() => {
    ui.show(name);
    ui.back();
    return { to: ui.screen, known: known.has(ui.screen) };
  })]));
}

function fcTabsProbe(ui, { tabs }) {
  ui.show('fc');
  const fc = ui.fc;
  const out = {};
  for (const id of tabs) {
    out[id] = caught(() => {
      fc.setTab(id);
      fc.walkAll = false;
      const arrowDefault = arrowWalk(ui, ui.items()).size;
      fc.walkAll = true;
      const all = ui.items();
      const stops = all.filter((it) => ui.isStop(it)).length;
      const arrowAll = arrowWalk(ui, all).size;
      return { stops, arrowDefault, arrowAll };
    });
  }
  fc.walkAll = false;
  fc.setTab('setup');
  return out;
}

function idsProbe(ui, { screens }) {
  pastGate(ui);
  return Object.fromEntries(screens.map((name) => [name, caught(() => {
    ui.show(name);
    const first = ui.items();
    const second = ui.items();
    const seen = new Set();
    const missing = [];
    const dupes = [];
    first.forEach((row, i) => {
      if (!row.id) {
        missing.push(row.label || `row ${i}`);
        return;
      }
      if (seen.has(row.id)) {
        dupes.push(row.id);
      }
      seen.add(row.id);
    });
    const unstable = [];
    for (let i = 0; i < Math.min(first.length, second.length); i += 1) {
      const a = first[i] ? first[i].id : null;
      const b = second[i] ? second[i].id : null;
      if (a !== b) {
        unstable.push(`${a} -> ${b}`);
      }
    }
    return {
      missing, dupes, unstable, lengthChanged: first.length !== second.length, rows: first.length,
    };
  })]));
}

function behaviourProbe(ui, { screens, tabs, importKey }) {
  const out = {};
  const items = () => ui.items();
  const indexOf = (pred) => items().findIndex(pred);
  const labels = (rows) => rows.map((r) => r.label);
  const stopItems = () => items().filter((it) => ui.isStop(it));
  const isRow = (el) => el.classList.contains('row');
  const bumpRoll = (fc) => fc.setValue('p_roll', String(Number(fc.cliValue('p_roll') || 0) + 3));

  out.focusMemory = caught(() => {
    ui.show('pilot');
    ui.move(1);
    ui.move(1);
    ui.move(1);
    const want = items()[ui.cursor].label;
    ui.show('rates');
    ui.show('pilot');
    const got = items()[ui.cursor].label;
    return { want, got, ok: want === got };
  });

  out.trickFilm = caught(() => {
    ui.show('tricks');
    ui.setCursor(ui.firstStop(items()));
    const first = ui.trickName.textContent;
    ui.move(1);
    const second = ui.trickName.textContent;
    ui.move(1);
    const third = ui.trickName.textContent;
    return {
      first, second, third, rows: items().length, ok: Boolean(first) && first !== second && second !== third,
    };
  });

  out.freshOpen = caught(() => {
    ui.cursorMemory = {};
    ui.show('pilot');
    const it = items()[ui.cursor];
    return { label: it && it.label, ok: ui.isStop(it) };
  });

  out.enterOnList = caught(() => {
    ui.show('pids');
    const i = indexOf((r) => r.id === 'pids:tune');
    ui.setCursor(i);
    const row = items()[i];
    const before = row && row.value;
    ui.select();
    const rebuilt = items()[i];
    const after = rebuilt && rebuilt.value;
    const result = {
      found: i >= 0, before, after, unchanged: before === after, opened: Boolean(ui.dropEl),
    };
    ui.closeDrop();
    return result;
  });

  out.tuningPath = caught(() => {
    ui.returnTo = 'title';
    ui.show('quad');
    const step = (label) => {
      const i = indexOf((r) => r.label === label);
      if (i < 0) {
        return `no such row: ${label}`;
      }
      ui.setCursor(i);
      ui.select();
      return ui.screen;
    };
    const toPids = step('Tune');
    const toBench = step('Every setting');
    ui.back();
    const backToPids = ui.screen;
    ui.back();
    const backToQuad = ui.screen;
    return {
      toPids, toBench, backToPids, backToQuad,
    };
  });

  out.tuneRows = caught(() => {
    const kinds = {};
    for (const name of screens) {
      ui.returnTo = 'title';
      ui.show(name);
      for (const row of items()) {
        if (row.label !== 'Tune') {
          continue;
        }
        const kind = row.options ? 'picker' : (row.action || 'dead');
        (kinds[kind] = kinds[kind] || []).push(name);
      }
    }
    return kinds;
  });

  out.switchRow = caught(() => {
    ui.show('pilot');
    /* By id: Pilot also has a Sound heading. */
    const i = indexOf((r) => r.id === 'pilot:sound');
    ui.setCursor(i);
    const on = () => items()[i].on;
    const row = items()[i];
    const start = on();
    ui.select();
    const flipped = on();
    ui.select();
    const back = on();
    ui.adjust(-1);
    const off = on();
    ui.adjust(-1);
    const stillOff = on();
    ui.adjust(1);
    const onAgain = on();
    ui.adjust(start ? 1 : -1);
    return {
      found: i >= 0,
      isSwitch: Boolean(row.sw),
      flips: flipped === !start,
      flipsBack: back === start,
      leftIsOff: off === false && stillOff === false,
      rightIsOn: onAgain === true,
      noPopup: !row.options,
    };
  });

  out.noTinyPopups = caught(() => {
    const offenders = [];
    for (const name of screens) {
      ui.show(name);
      for (const row of items()) {
        if (row.options && row.options.length === 2 && !ui.fitsAsSegments(row)) {
          offenders.push(`${name}:${row.label}`);
        }
      }
    }
    return { offenders };
  });

  out.focusAuthority = caught(() => {
    ui.show('pilot');
    ui.setCursor(ui.firstStop(items(), ui.rowOffset));
    ui.menuRows.find(isRow).focus();
    ui.move(1);
    ui.move(1);
    const rows = ui.menuRows;
    const painted = rows.filter((el) => el.classList.contains('on')).length;
    const focusFollows = rows[ui.cursor - ui.rowOffset] === document.activeElement;
    const tabbable = rows.filter((el) => isRow(el) && el.tabIndex === 0).length;
    const selected = rows.filter((el) => el.getAttribute('aria-selected') === 'true').length;
    const last = rows.filter(isRow).pop();
    if (last) {
      last.focus();
    }
    const cursorFollowedFocus = last ? ui.menuRows[ui.cursor - ui.rowOffset] === last : false;
    if (document.activeElement) {
      document.activeElement.blur();
    }
    return {
      painted, focusFollows, tabbable, selected, cursorFollowedFocus,
    };
  });

  out.stickyCursor = caught(() => {
    ui.show('fc');
    const fc = ui.fc;
    const tab = fc.tab;
    fc.setTab('pid');
    fc.discard();
    bumpRoll(fc);
    ui.renderMenu();
    const keyAtCursor = () => {
      const row = items()[ui.cursor];
      return row ? row.key : null;
    };
    ui.setCursor(indexOf((r) => r.key === 'p_roll'));
    const before = keyAtCursor();
    const beforeIndex = ui.cursor;
    fc.onlyModified = true;
    ui.renderMenu();
    const after = keyAtCursor();
    const movedIndex = ui.cursor !== beforeIndex;
    fc.onlyModified = false;
    fc.discard();
    fc.setTab(tab);
    ui.renderMenu();
    return {
      before, after, sameRow: before === after, movedIndex,
    };
  });

  out.benchSearch = caught(() => {
    ui.show('fc');
    const fc = ui.fc;
    const startTab = fc.tab;
    const keyed = (rows) => rows.filter((r) => r.key && r.key !== 'fc-search');

    fc.search = 'failsafe_procedure';
    const foundAcrossTabs = items().some((r) => r.key === 'failsafe_procedure') && fc.tab === startTab;

    fc.search = 'd_min';
    const keys = keyed(items()).map((r) => r.key);
    const firstIsPrefix = keys.length > 0 && keys[0].startsWith('d_min');

    fc.search = '_';
    const wide = items();
    const moreLine = wide.some((r) => /more not shown/.test(r.label));
    const shown = keyed(wide).length;

    fc.search = 'zzzz_not_a_key';
    const missLine = items().some((r) => /No key contains/.test(r.label));

    fc.search = 'gyro';
    ui.renderMenu();
    ui.setCursor(ui.firstStop(items(), ui.rowOffset));
    ui.focusCursorRow();
    const rowEl = ui.menuRows[ui.cursor - ui.rowOffset];
    const field = rowEl && rowEl.querySelector('.row-textfield');
    let focusLeftTheField = false;
    if (field) {
      field.focus();
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      const active = document.activeElement;
      focusLeftTheField = active === ui.menuRows[ui.cursor - ui.rowOffset] && active !== field;
    }

    fc.search = null;
    items();
    return {
      focusLeftTheField,
      foundAcrossTabs,
      firstIsPrefix,
      capped: moreLine && shown <= 60,
      shown,
      saysMiss: missLine,
      tabRestored: fc.tab === startTab,
    };
  });

  out.benchHelp = caught(() => {
    ui.show('fc');
    const fc = ui.fc;
    const tab = fc.tab;
    fc.walkAll = true;
    let checked = 0;
    const offenders = [];
    for (const t of tabs) {
      fc.setTab(t);
      for (const row of items()) {
        if (!row.key || row.key === 'fc-search') {
          continue;
        }
        checked += 1;
        const note = String(row.note || '').trim();
        if (!note || note === row.key || note === row.label) {
          offenders.push(`${t}:${row.key}`);
        }
      }
    }
    fc.walkAll = false;
    fc.setTab(tab);
    return { checked, offenders };
  });

  out.benchModified = caught(() => {
    ui.show('fc');
    const fc = ui.fc;
    const tab = fc.tab;
    fc.setTab('pid');
    const before = fc.modifiedKeys().size;
    bumpRoll(fc);
    const after = fc.modifiedKeys().size;
    fc.onlyModified = true;
    const rows = items().filter((r) => r.key && r.key !== 'fc-search');
    const onlyTheOne = rows.length === 1 && rows[0].key === 'p_roll';
    fc.onlyModified = false;
    fc.discard();
    const cleaned = fc.modifiedKeys().size;
    fc.setTab(tab);
    return {
      startedClean: before === 0,
      sawTheEdit: after === 1,
      onlyTheOne,
      rows: rows.length,
      discardClears: cleaned === 0,
    };
  });

  out.hoverScroll = caught(() => {
    const jumps = {};
    for (const name of ['pilot', 'fc']) {
      ui.show(name);
      const host = ui.menuRows[0].parentElement;
      host.scrollTop = 0;
      let jump = 0;
      let last = host.scrollTop;
      let x = 0;
      for (const row of ui.menuRows.filter(isRow).slice(0, 25)) {
        const b = row.getBoundingClientRect();
        if (b.height === 0) {
          continue;
        }
        for (let k = 0; k < 3; k += 1) {
          /* The shell ignores a pointer that did not move, so x must change. */
          x += 1;
          row.dispatchEvent(new MouseEvent('mousemove', {
            bubbles: true, clientX: 200 + (x % 3), clientY: Math.round(b.top + b.height / 2),
          }));
          jump += Math.abs(host.scrollTop - last);
          last = host.scrollTop;
        }
      }
      jumps[name] = jump;
    }
    ui.show('title');
    return jumps;
  });

  out.roomReturn = caught(() => {
    const go = (id) => {
      const i = indexOf((r) => r.id === id);
      if (i < 0) {
        return false;
      }
      ui.setCursor(i);
      ui.select();
      return true;
    };
    const reset = (room) => {
      ui.show('title');
      ui.roomFrom = null;
      ui.returnTo = null;
      ui.show(room);
    };
    const result = {};
    for (const room of ['freestyle', 'launch', 'pilot']) {
      reset(room);
      if (!go(`${room}:a-quad`)) {
        result[room] = { missing: true };
        continue;
      }
      const at = ui.screen;
      ui.back();
      result[room] = { at, back: ui.screen };
    }
    reset('freestyle');
    go('freestyle:a-quad');
    go('quad:a-rates');
    const deep = [ui.screen];
    ui.back();
    deep.push(ui.screen);
    ui.back();
    deep.push(ui.screen);
    result.deep = deep;
    ui.show('title');
    ui.returnTo = 'paused';
    ui.roomFrom = 'freestyle';
    ui.show('quad');
    ui.back();
    result.paused = ui.screen;
    ui.returnTo = null;
    ui.roomFrom = null;
    ui.show('title');
    return result;
  });

  out.launchGate = caught(() => {
    const seen = [];
    for (const m of window.__maps().filter((map) => map.mode === 'freestyle')) {
      const savedMap = ui.settings.map;
      const savedMode = ui.mode;
      ui.settings.map = m.id;
      ui.mode = 'freestyle';
      ui.show('title');
      const onAction = ui.onAction;
      let launched = false;
      ui.onAction = (action) => {
        if (action === 'fly') {
          launched = true;
        }
      };
      try {
        ui.act('fly');
      } finally {
        ui.onAction = onAction;
      }
      const landed = ui.screen;
      ui.settings.map = savedMap;
      ui.mode = savedMode;
      ui.show('title');
      seen.push({ map: m.id, landed, launched });
    }
    return { seen };
  });

  out.oneHome = caught(() => {
    const thing = new Map([['Tune', 'tune'], ['PIDs', 'pids'], ['Rates', 'rates']]);
    const homes = { tune: [], pids: [], rates: [] };
    const doors = { tune: [], pids: [], rates: [] };
    const opens = { pids: [], rates: [] };
    for (const name of screens) {
      ui.show(name);
      for (const row of items()) {
        if (row.action === 'pids') {
          opens.pids.push(name);
        }
        if (row.action === 'rates') {
          opens.rates.push(name);
        }
        const k = thing.get(row.label);
        if (!k) {
          continue;
        }
        if (row.options || row.sw || row.num || row.step) {
          homes[k].push(name);
        } else if (row.action) {
          doors[k].push(name);
        }
      }
    }
    return {
      tune: homes.tune,
      pids: homes.pids,
      rates: homes.rates,
      tuneDoors: doors.tune,
      pidsDoors: doors.pids,
      ratesDoors: doors.rates,
      pidsOpens: opens.pids,
      ratesOpens: opens.rates,
    };
  });

  out.midRun = caught(() => {
    const warns = (row) => String(row.note).includes('back on the start line');
    const scan = (screen, returnTo) => {
      ui.returnTo = returnTo;
      ui.show(screen);
      const all = items();
      const rows = all.filter((r) => r.label === 'Tune' || r.label === 'PIDs');
      const rates = all.filter((r) => r.label === 'Rates');
      return {
        rows: rows.length,
        warned: rows.filter(warns).length,
        ratesRows: rates.length,
        ratesWarned: rates.filter(warns).length,
      };
    };
    const result = {
      quadPaused: scan('quad', 'paused'),
      pilotPaused: scan('pilot', 'paused'),
      quadTitle: scan('quad', 'title'),
      pilotTitle: scan('pilot', 'title'),
    };
    ui.returnTo = 'title';
    ui.show('title');
    return result;
  });

  /* One try for both halves, so a throw anywhere leaves padSelect absent. */
  const pad = caught(() => {
    const input = window.__input;
    const saved = { padInfo: ui.padInfo, craftGate: ui.craftGate, mode: ui.mode };
    ui.craftGate = false;
    ui.mode = ui.mode || 'race';
    const rowAt0 = (info) => {
      ui.setPadInfo(info);
      /* The earlier sweep left #credits pinned, and show() would map the
       * title onto it. */
      if (location.hash) {
        history.replaceState(null, '', location.pathname + location.search);
      }
      ui.show('title');
      const first = items()[0];
      return {
        onTitle: ui.screen === 'title',
        label: first ? first.label : null,
        action: first ? first.action : null,
        cls: first ? first.rowClass : null,
      };
    };
    const radio = {
      count: 1, using: 'Joystick 1, TX16S', buttons: 0, hasSelect: false, calibrated: false,
    };
    const noButtons = rowAt0(radio);
    const uncal = rowAt0({ ...radio, buttons: 12 });
    const fine = rowAt0({ ...radio, buttons: 12, calibrated: true });
    const keyboard = rowAt0({ count: 0, using: 'Keyboard' });
    ui.setPadInfo(saved.padInfo);
    ui.craftGate = saved.craftGate;
    ui.mode = saved.mode;
    ui.show('title');

    const warnsToCalibrate = (c) => c.onTitle && c.cls === 'row-warn' && c.action === 'calibrate';
    const padBanner = {
      onTitle: [noButtons, uncal, fine, keyboard].every((c) => c.onTitle),
      noButtons: warnsToCalibrate(noButtons),
      uncalibrated: warnsToCalibrate(uncal),
      distinct: Boolean(noButtons.label && uncal.label && noButtons.label !== uncal.label),
      namesTheCause: /button/i.test(noButtons.label),
      quietWhenFine: fine.cls !== 'row-warn',
      quietOnKeyboard: keyboard.cls !== 'row-warn',
    };

    const fake = {
      index: 0, id: 'fake', axes: [0, 0, 0, 0], buttons: [],
    };
    const firstGamepad = input.firstGamepad;
    input.firstGamepad = () => fake;
    const savedMap = input.map;
    const savedRest = input.navRest;
    let padSelect;
    try {
      input.map = { ...savedMap, select: null };
      input.navRest = [0, 0, 0, 0];
      input.holdMs = 0;
      input.holdFired = false;
      input.holdAt = 0;
      const press = () => input.padMenuButtons().select;

      const atRest = press();

      fake.axes = [0, 0, 0, 0.9];
      input.holdMs = 0;
      input.holdFired = false;
      input.holdAt = performance.now() - 100;
      const early = press();

      /* 650 ms banked plus a tick of at most 100 clears the 700 ms hold. */
      input.holdMs = 650;
      input.holdFired = false;
      input.holdAt = performance.now() - 100;
      const fired = press();

      input.holdAt = performance.now() - 100;
      const again = press();

      fake.axes = [0, 0, 0, 0];
      input.holdAt = performance.now();
      press();
      fake.axes = [0, 0, 0, 0.9];
      input.holdMs = 650;
      input.holdAt = performance.now() - 100;
      const rearmed = press();

      input.map = {
        ...savedMap,
        select: {
          axis: 3, center: 0, pos: 1, neg: -1,
        },
      };
      fake.axes = [0, 0, 0, 0.9];
      const switchOn = press();
      fake.axes = [0, 0, 0, 0];
      const switchOff = press();

      padSelect = {
        quietAtRest: atRest === false,
        notBeforeTheHold: early === false,
        firesOnHold: fired === true,
        oncePerHold: again === false,
        rearmsAfterRelease: rearmed === true,
        assignedSwitchOn: switchOn === true,
        assignedSwitchOff: switchOff === false,
      };
    } finally {
      input.firstGamepad = firstGamepad;
      input.map = savedMap;
      input.navRest = savedRest;
    }
    return { padBanner, padSelect };
  });
  if (pad.error) {
    out.padBanner = pad;
  } else {
    out.padBanner = pad.padBanner;
    out.padSelect = pad.padSelect;
  }

  out.discardGuard = caught(() => {
    ui.show('fc');
    const fc = ui.fc;
    const before = fc.dirty();
    bumpRoll(fc);
    const dirty = fc.dirty();
    ui.back();
    const result = {
      wasClean: before === false,
      dirty,
      stayed: ui.screen === 'fc',
      panel: fc.confirm === 'leave',
      stillDirty: fc.dirty(),
    };
    fc.confirm = null;
    fc.discard();
    ui.show('title');
    return result;
  });

  /* One try for both, so a throw anywhere leaves mine absent. */
  const gate = caught(() => {
    const saved = { mode: ui.mode, firstRun: ui.firstRun, craftGate: ui.craftGate };
    const cards = () => [...document.querySelectorAll('.screen-title .gate-card')].map((card) => {
      const shot = card.querySelector('.gate-card-shot');
      return {
        shot: shot ? shot.getAttribute('src') : null,
        drawn: Boolean(card.querySelector('.gate-card-mark svg')),
        wide: card.getBoundingClientRect().width > 0,
      };
    });
    const pictured = (list) => list.every((c) => c.shot && c.drawn);

    ui.firstRun = false;
    ui.craftGate = true;
    ui.mode = null;
    ui.hub = null;
    ui.show('title');
    ui.renderMenu();
    const homeItems = stopItems();
    const home = labels(homeItems);
    const homeCards = cards();

    ui.openHub('club');
    const gateItems = stopItems();
    const gateLabels = labels(gateItems);
    const clubCards = cards();

    ui.mode = 'race';
    ui.show('title');
    ui.renderMenu();
    const titleEl = document.querySelector('.screen-title');
    const modeSetGate = {
      isGate: Boolean(titleEl && titleEl.classList.contains('is-gate')),
      cards: cards(),
      keepNote: [...document.querySelectorAll('.screen-title .keep-note')]
        .filter((n) => n.getBoundingClientRect().height > 0).length,
    };

    ui.craftGate = true;
    ui.mode = null;
    ui.show('title');
    ui.settings.airframe = '7inch';
    ui.act('way-race-5inch');
    const whoop = {
      craft: ui.settings.airframe,
      mode: ui.mode,
      screen: ui.screen,
      gate: ui.onGate(),
      menu: labels(stopItems()),
      cards: items().filter((r) => r.card).length,
    };

    ui.show('courses');
    const isLocal = (r) => r.course && r.course.kind === 'local';
    const localCards = items().filter(isLocal);
    const picked = (localCards[0] && localCards[0].course.track) || null;
    const seatedOk = picked ? ui.seatLocal(picked.id) : false;
    let seat = null;
    try {
      seat = JSON.parse(localStorage.getItem(importKey));
    } catch (e) {
      /* An unreadable seat is judged the same as no seat. */
      seat = null;
    }
    const mine = {
      count: localCards.length,
      names: labels(localCards),
      pickedId: picked ? picked.id : null,
      seatedOk,
      seat: seat ? { id: seat.id, local: seat.local, map: seat.document && seat.document.map } : null,
      listedAfter: items().filter(isLocal).length,
    };

    ui.show('title');
    ui.back();
    const backFromWhoop = labels(stopItems());

    ui.settings.airframe = 'bramor2300';
    ui.act('way-race-5inch');
    const landed = ui.screen;
    const planeCraft = ui.settings.airframe;
    ui.show('title');
    const race = labels(items());
    ui.mode = 'freestyle';
    const free = labels(items());
    ui.mode = saved.mode;
    ui.firstRun = saved.firstRun;
    ui.craftGate = saved.craftGate;
    ui.show('title');

    const modeGate = {
      gate: gateLabels,
      cards: clubCards,
      backFromWhoop,
      whoop,
      home,
      homeCards,
      asksHubs: home.join(',') === 'Flight Club,Hangar' && homeItems.every((it) => it.card)
        && homeCards.length === 2 && pictured(homeCards),
      asksWays: gateLabels.length === 2 && gateLabels.join(',') === 'Track Day,Free Flight'
        && !gateItems.some((it) => !it.card),
      asCards: clubCards.length === 2 && pictured(clubCards),
      modeSetGate,
      gateWithMode: modeSetGate.isGate && modeSetGate.cards.length === 2
        && modeSetGate.cards.every((c) => c.wide) && modeSetGate.keepNote === 0,
      onePress: whoop.craft === '7inch' && whoop.mode === 'race' && whoop.screen === 'courses'
        && !whoop.gate && whoop.cards === 0 && !whoop.menu.includes('Freestyle'),
      escapeToGate: backFromWhoop.join(',') === gateLabels.join(','),
      answered: landed === 'courses',
      landed,
      planeCraft,
      race,
      free,
      raceNamesTrack: race.includes('Track') && !race.includes('Race') && !race.includes('Freestyle'),
      freeNamesMap: free.includes('The world') && !free.includes('Race') && !free.includes('Freestyle'),
    };
    return { mine, modeGate };
  });
  if (gate.error) {
    out.modeGate = gate;
  } else {
    out.mine = gate.mine;
    out.modeGate = gate.modeGate;
  }

  return out;
}

/* The helpers every probe may call, declared ahead of it in the page. */
const PAGE_HELPERS = [caught, pastGate, arrowWalk, scrollerOf, walkScreen].join('\n');

async function runProbe(page, probe, args) {
  const source = `(() => {
    ${PAGE_HELPERS}
    return JSON.stringify((${probe})(window.__ui, ${JSON.stringify(args)}));
  })()`;
  return JSON.parse(await page.evaluate(source));
}

/* ------------------------------------------------------------------
 * Node side: verdicts. */

const problem = (r) => (r && r.error) || 'no result';
const broken = (r) => !r || r.error;

function judgeScreens({ walk, escape }, baseline, opts, fail, note, table) {
  const scored = baseline && baseline.window.w === opts.w && baseline.window.h === opts.h;
  for (const name of SCREENS) {
    const w = walk[name];
    const e = escape[name];
    if (broken(w)) {
      fail(`${name}: walk failed: ${problem(w)}`);
      continue;
    }
    if (w.unreachable.length) {
      fail(`${name}: ${w.unreachable.length} stop(s) unreachable by any key: ${w.unreachable.join(', ')}`);
    }
    if (w.notesLost > 0) {
      fail(`${name}: ${w.notesLost} unreachable row(s) carry a note, so their help can never be shown`);
    }
    if (broken(e)) {
      fail(`${name}: Escape failed: ${problem(e)}`);
    } else if (!e.known) {
      fail(`${name}: Escape landed on unknown screen "${e.to}"`);
    }
    if (scored) {
      const saved = baseline.screens[name] || {};
      const base = saved.overflow;
      if (base !== undefined) {
        if (w.overflow > base) {
          fail(`${name}: overflow grew from ${base} to ${w.overflow} px`);
        } else if (w.overflow < base) {
          note(`${name}: overflow improved from ${base} to ${w.overflow} px, re-record the baseline`);
        }
      }
      const foldBase = saved.belowFold;
      if (foldBase !== undefined) {
        if (w.belowFold > foldBase) {
          fail(`${name}: the list hangs ${w.belowFold} px off the bottom of the window, was ${foldBase} px (${w.rowsSeen} of ${w.stops} rows visible)`);
        } else if (w.belowFold < foldBase) {
          note(`${name}: below the fold improved from ${foldBase} to ${w.belowFold} px, re-record the baseline`);
        }
      }
    }
    const n4 = (v) => String(v).padStart(4);
    table.push(`  ${name.padEnd(10)} stops ${n4(w.stops)}  arrow ${n4(w.arrow)}  reached ${n4(w.reached)}  overflow ${n4(w.overflow)} px  below ${n4(w.belowFold)} px  seen ${String(w.rowsSeen).padStart(3)}  escape -> ${(e && e.to) || '?'}`);
  }
}

function judgeIds(ids, fail, note) {
  let total = 0;
  for (const name of SCREENS) {
    const r = ids[name];
    if (broken(r)) {
      fail(`ids on ${name}: ${problem(r)}`);
      continue;
    }
    total += r.rows;
    if (r.missing.length) {
      fail(`ids on ${name}: ${r.missing.length} row(s) carry no id: ${r.missing.slice(0, 4).join(', ')}`);
    }
    if (r.dupes.length) {
      fail(`ids on ${name}: ${r.dupes.length} duplicate id(s): ${r.dupes.slice(0, 4).join(', ')}`);
    }
    if (r.lengthChanged) {
      fail(`ids on ${name}: two calls to items() returned different lengths`);
    }
    if (r.unstable.length) {
      fail(`ids on ${name}: ${r.unstable.length} id(s) changed between two rebuilds: ${r.unstable.slice(0, 4).join(', ')}`);
    }
  }
  note(`ids: ${total} rows across ${SCREENS.length} screens, all named, unique and stable`);
}

const TUNING_STEPS = [
  ['toPids', 'pids', "Quad's Tune row did not open the PIDs room"],
  ['toBench', 'fc', 'Every setting did not open the bench'],
  ['backToPids', 'pids', 'leaving the bench did not come back to the PIDs room'],
  ['backToQuad', 'quad', 'leaving the PIDs room did not come back to Quad'],
];

const or = (list, empty) => list.join(', ') || empty;

/*
 * The behaviour rows in the order they are reported: the probe key, the
 * prefix a missing or failed block is reported under, and the judge. A
 * row with a null prefix judges an absent result itself.
 */
const BEHAVIOUR = [
  ['focusMemory', 'focus memory', (r, fail) => {
    if (!r.ok) {
      fail(`focus memory: left Settings on "${r.want}", came back on "${r.got}"`);
    }
  }],
  ['trickFilm', 'trick film', (r, fail, note) => {
    if (!r.ok) {
      fail(`trick film: the panel does not follow the cursor. Across three rows it showed "${r.first}", "${r.second}", "${r.third}"`);
    } else {
      note(`trick film: follows the cursor across ${r.rows} tricks`);
    }
  }],
  ['freshOpen', null, (r, fail) => {
    if (!r || r.error || !r.ok) {
      fail(`fresh open: ${(r && r.error) || 'did not land on a stop'}`);
    }
  }],
  ['enterOnList', 'Enter on a list', (r, fail) => {
    if (!r.found) {
      fail('Enter on a list: the Tune row was not found, so nothing was exercised');
    }
    if (!r.unchanged) {
      fail(`Enter on a list: Enter changed the tune from "${r.before}" to "${r.after}"`);
    }
    if (!r.opened) {
      fail('Enter on a list: Enter did not open the picker either, so the row is dead');
    }
  }],
  ['tuningPath', 'tuning path', (r, fail) => {
    for (const [key, want, said] of TUNING_STEPS) {
      if (r[key] !== want) {
        fail(`tuning path: ${said} (landed on "${r[key]}", wanted "${want}")`);
      }
    }
  }],
  ['tuneRows', 'tune rows', (r, fail, note) => {
    const picker = r.picker || [];
    const doors = r.pids || [];
    if (picker.length !== 1) {
      fail(`tune rows: the picker is on ${picker.length} screens (${picker.join(', ')}), wanted exactly one`);
    }
    const stray = Object.keys(r).filter((k) => k !== 'picker' && k !== 'pids').sort();
    if (stray.length) {
      fail(`tune rows: a row labelled Tune goes somewhere other than the PIDs room: ${stray.map((k) => `${k} on ${r[k].join(', ')}`).join('; ')}`);
    }
    note(`tune rows: picker on ${picker.join(', ')}, doors on ${doors.join(', ')}`);
  }],
  ['switchRow', 'switch row', (r, fail) => {
    const checks = [
      [r.found, 'the Sound row was not found, so nothing was exercised'],
      [r.isSwitch, 'Sound is not a switch'],
      [r.flips, 'Enter did not flip it'],
      [r.flipsBack, 'Enter again did not put it back'],
      [r.leftIsOff, 'Left does not set it off, it cycles'],
      [r.rightIsOn, 'Right does not set it on'],
      [r.noPopup, 'it would still open a popup'],
    ];
    for (const [ok, said] of checks) {
      if (!ok) {
        fail(`switch row: ${said}`);
      }
    }
  }],
  ['mine', null, (r, fail) => {
    if (!r) {
      fail('My tracks: the library seat probe returned nothing');
      return;
    }
    const n = LIBRARY_DOCS.length;
    if (r.count !== n) {
      fail(`My tracks lists ${r.count} of the pilot's own ${n} saved track(s): ${or(r.names, 'none')}`);
    }
    if (!r.pickedId || !(r.pickedId in LIBRARY)) {
      fail(`My tracks offered ${r.pickedId || 'no'} saved track, which the seeded library does not carry`);
    }
    if (!r.seatedOk || !r.seat || r.seat.id !== r.pickedId || r.seat.local !== true) {
      fail(`choosing a saved track seated ${JSON.stringify(r.seat)}, not ${r.pickedId} as the pilot's own`);
    }
    if (r.listedAfter !== n) {
      fail(`with one saved track seated My tracks lists ${r.listedAfter}, not ${n}`);
    }
  }],
  ['modeGate', 'the gate', (r, fail) => {
    const m = r.modeSetGate;
    const w = r.whoop;
    const checks = [
      [r.asksHubs, `home opens on ${or(r.home, 'nothing')} drawn as ${JSON.stringify(r.homeCards)}, not on Flight Club and the Hangar, each with a picture and a plan`],
      [r.asksWays, `Flight Club opens on ${or(r.gate, 'nothing')}, not on the two ways in`],
      [r.asCards, `the gate: ${r.cards.length} card(s) drawn as ${JSON.stringify(r.cards)}, so a card is a row again or has lost its picture or its plan`],
      [r.gateWithMode, `the gate: with the mode already answered it drew ${m.cards.length} card(s), ${m.cards.filter((c) => c.wide).length} of them visible, is-gate ${m.isGate}, ${m.keepNote} menu note(s) still showing`],
      [r.onePress, `the gate: Track mode with the whoop seated left ${w.craft} in ${w.mode} on ${w.screen}, gate ${w.gate}, and landed on ${or(w.menu, 'nothing')}`],
      [r.escapeToGate, `the gate: Escape from the menu reached ${or(r.backFromWhoop, 'nothing')}, not the three cards`],
      [r.answered, `the gate: answering Track mode with a plane seated stayed on ${r.landed}, not My tracks`],
      [r.planeCraft === 'bramor2300', `the gate: Track mode with a plane seated seated ${r.planeCraft}, and a plane that fits a track races it`],
      [r.raceNamesTrack, `the title in Race names ${r.race.join(', ')}, which is not a Track row without a mode beside it`],
      [r.freeNamesMap, `the title in Freestyle names ${r.free.join(', ')}, which is not a The world row without a mode beside it`],
    ];
    for (const [ok, said] of checks) {
      if (!ok) {
        fail(said);
      }
    }
  }],
  ['noTinyPopups', 'two item popups', (r, fail) => {
    if (r.offenders.length) {
      fail(`two item popups: ${r.offenders.length} row(s) still open a menu to answer yes or no: ${r.offenders.slice(0, 5).join(', ')}`);
    }
  }],
  ['focusAuthority', 'focus authority', (r, fail) => {
    const checks = [
      [r.painted === 1, `${r.painted} rows look selected, not 1`],
      [r.focusFollows, 'the browser focus is not on the row the cursor is on'],
      [r.tabbable === 1, `${r.tabbable} rows are Tab reachable, not 1`],
      [r.selected === 1, `${r.selected} rows report aria-selected, not 1`],
      [r.cursorFollowedFocus, 'focus arriving from Tab or a screen reader does not move the cursor'],
    ];
    for (const [ok, said] of checks) {
      if (!ok) {
        fail(`focus authority: ${said}`);
      }
    }
  }],
  ['stickyCursor', 'sticky cursor', (r, fail) => {
    if (!r.movedIndex) {
      fail('sticky cursor: the filter did not change the row index, so nothing was exercised');
    }
    if (!r.sameRow) {
      fail(`sticky cursor: a filter moved the cursor from "${r.before}" to "${r.after}"`);
    }
  }],
  ['benchSearch', 'bench search', (r, fail) => {
    const checks = [
      [r.foundAcrossTabs, 'failsafe_procedure is not findable without knowing its tab'],
      [r.firstIsPrefix, 'a prefix hit does not rank above a substring hit'],
      [r.capped, `a search matching more than it shows does not say so (${r.shown} rows)`],
      [r.saysMiss, 'a search that matches nothing shows an empty list rather than saying so'],
      [r.tabRestored, 'leaving search moved the pilot to a different tab'],
      [r.focusLeftTheField, 'Down out of the search field leaves the focus behind, on nothing'],
    ];
    for (const [ok, said] of checks) {
      if (!ok) {
        fail(`bench search: ${said}`);
      }
    }
  }],
  ['benchHelp', 'bench help', (r, fail, note) => {
    if (r.offenders.length) {
      fail(`bench help: ${r.offenders.length} of ${r.checked} row(s) have help that is empty or just the key name: ${r.offenders.slice(0, 5).join(', ')}`);
    } else {
      note(`bench help: ${r.checked} rows across 5 tabs, none repeating its own label`);
    }
  }],
  ['benchModified', 'bench modified', (r, fail) => {
    const checks = [
      [r.startedClean, 'the draft was already dirty, so nothing was exercised'],
      [r.sawTheEdit, 'an edited key is not reported as modified'],
      [r.onlyTheOne, `show-only-modified listed ${r.rows} rows for one edit`],
      [r.discardClears, 'discarding the draft leaves keys reported as modified'],
    ];
    for (const [ok, said] of checks) {
      if (!ok) {
        fail(`bench modified: ${said}`);
      }
    }
  }],
  ['hoverScroll', 'hover scroll', (r, fail) => {
    for (const [name, px] of Object.entries(r)) {
      if (px > 0) {
        fail(`hover scroll: the ${name} list moved ${px}px under the pointer during a sweep`);
      }
    }
  }],
  ['roomReturn', 'room return', (r, fail) => {
    for (const room of ['freestyle', 'launch', 'pilot']) {
      const it = r[room];
      if (!it || it.missing) {
        fail(`room return: ${room} has no door into Quad, so nothing was exercised`);
        continue;
      }
      if (it.at !== 'quad') {
        fail(`room return: the Quad door on ${room} opened "${it.at}"`);
      }
      if (it.back !== room) {
        fail(`room return: Back from Quad opened from ${room} landed on "${it.back}"`);
      }
    }
    const deep = (r.deep || []).join(' -> ');
    if (deep !== 'rates -> quad -> freestyle') {
      fail(`room return: freestyle to quad to rates and back twice went "${deep}"`);
    }
    if (r.paused !== 'paused') {
      fail(`room return: a paused run lost its pause chain, Back landed on "${r.paused}"`);
    }
  }],
  ['launchGate', 'launch gate', (r, fail) => {
    for (const s of r.seen) {
      if (s.landed === 'launch') {
        fail(`launch gate: Fly on the freestyle world "${s.map}" stopped at the launch card`);
      }
      if (!s.launched) {
        fail(`launch gate: Fly on the freestyle world "${s.map}" did not launch at all`);
      }
    }
  }],
  ['oneHome', 'one room per thing', (r, fail) => {
    const editable = (label, list) => `one room per thing: ${label} is editable on ${list.length} screens: ${list.join(', ')}`;
    if (r.tune.length > 2) {
      fail(editable('Tune', r.tune));
    }
    if (r.pids.length > 1) {
      fail(editable('PIDs', r.pids));
    }
    if (r.rates.length > 1) {
      fail(editable('Rates', r.rates));
    }
    if (r.tune.length === 0) {
      fail('one room per thing: Tune cannot be changed anywhere');
    }
    if (r.pids.length === 0 && r.pidsOpens.length === 0) {
      fail('one room per thing: PIDs is not reachable from anywhere');
    }
    if (r.ratesOpens.length === 0) {
      fail('one room per thing: Rates is not reachable from anywhere');
    }
  }],
  ['midRun', 'mid-run warning', (r, fail) => {
    const paused = [['Quad', r.quadPaused], ['Pilot', r.pilotPaused]];
    const atTitle = [['Quad', r.quadTitle], ['Pilot', r.pilotTitle]];
    if (r.quadPaused.rows === 0) {
      fail('mid-run warning: Quad entered from a paused run has no tuning row to warn about');
    }
    for (const [name, s] of paused) {
      if (s.warned < s.rows) {
        fail(`mid-run warning: ${name} entered from a paused run warns on ${s.warned} of ${s.rows} tuning rows`);
      }
    }
    for (const [name, s] of [...paused, ...atTitle]) {
      if (s.ratesWarned > 0) {
        fail(`mid-run warning: ${name} warns that changing rates restarts the run, which it no longer does`);
      }
    }
    for (const [name, s] of atTitle) {
      if (s.warned > 0) {
        fail(`mid-run warning: ${name} warns about a run that is not happening`);
      }
    }
  }],
  ['padBanner', 'radio banner', (r, fail) => {
    const checks = [
      [r.onTitle, 'one of the cases did not land on the title, so it measured nothing'],
      [r.noButtons, 'a pad reporting no buttons gets no warning row on the title'],
      [r.uncalibrated, 'an uncalibrated pad gets no warning row on the title'],
      [r.distinct, 'the no-buttons and uncalibrated cases say the same thing'],
      [r.namesTheCause, 'the no-buttons row does not mention buttons'],
      [r.quietWhenFine, 'a working, calibrated pad is warned at anyway'],
      [r.quietOnKeyboard, 'a keyboard-only visitor is warned about a radio'],
    ];
    for (const [ok, said] of checks) {
      if (!ok) {
        fail(`radio banner: ${said}`);
      }
    }
  }],
  ['padSelect', 'radio select', (r, fail) => {
    const checks = [
      [r.quietAtRest, 'a pad at rest presses something'],
      [r.notBeforeTheHold, 'a brief stick excursion presses, so the cursor cannot move'],
      [r.firesOnHold, 'holding a stick never presses, so the pad has no Enter at all'],
      [r.oncePerHold, 'a held stick presses repeatedly rather than once'],
      [r.rearmsAfterRelease, 'releasing and holding again does not press, so a radio gets one press per page load'],
      [r.assignedSwitchOn, 'an assigned menu switch does not press'],
      [r.assignedSwitchOff, 'an assigned menu switch presses while it is off'],
    ];
    for (const [ok, said] of checks) {
      if (!ok) {
        fail(`radio select: ${said}`);
      }
    }
  }],
  ['discardGuard', 'discard guard', (r, fail) => {
    const checks = [
      [r.dirty, 'the draft did not become dirty, so the guard was not exercised'],
      [r.stayed, 'Escape left the firmware bench with unsaved edits'],
      [r.panel, 'Escape did not raise the leave panel'],
      [r.stillDirty, 'the draft was discarded without an answer'],
    ];
    for (const [ok, said] of checks) {
      if (!ok) {
        fail(`discard guard: ${said}`);
      }
    }
  }],
];

function judgeBehaviour(behaviour, fail, note) {
  for (const [key, prefix, judge] of BEHAVIOUR) {
    const r = behaviour[key];
    if (prefix && broken(r)) {
      fail(`${prefix}: ${problem(r)}`);
      continue;
    }
    judge(r, fail, note);
  }
}

function judgeFcTabs(fcTabs, fail, lines) {
  for (const [id, t] of Object.entries(fcTabs)) {
    if (t.error) {
      fail(`fc tab ${id}: ${t.error}`);
      continue;
    }
    lines.push(`  ${id.padEnd(14)} stops ${String(t.stops).padStart(4)}  arrows stop on ${String(t.arrowDefault).padStart(4)}  (${t.stops - t.arrowDefault} skipped)`);
    if (t.arrowAll < t.stops) {
      fail(`fc tab ${id}: walk-every-key reaches ${t.arrowAll} of ${t.stops} stops`);
    }
    if (t.arrowDefault > t.stops) {
      fail(`fc tab ${id}: default travel ${t.arrowDefault} exceeds ${t.stops} stops`);
    }
  }
}

/* The board is a separate service the product must work without, so a
 * refused fetch is a note, not a failure. */
function judgeConsole(errors, fail, note) {
  const offline = errors.filter((m) => /net::ERR_|Failed to load resource/.test(m));
  if (offline.length) {
    note(`${offline.length} network fetch(es) refused, the board is not running here`);
  }
  for (const m of errors) {
    if (!offline.includes(m)) {
      fail(`console: ${m}`);
    }
  }
}

function recordBaseline(walk, opts) {
  const screens = Object.fromEntries(SCREENS.map((name) => {
    const w = walk[name] || {};
    return [name, { overflow: w.overflow || 0, belowFold: w.belowFold || 0 }];
  }));
  const file = { note: BASELINE_NOTE, window: { w: opts.w, h: opts.h }, screens };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(file, null, 2)}\n`);
  console.log(`recorded baseline at ${opts.w}x${opts.h}: ${BASELINE_PATH}`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : null;

  const settingsSeed = `try {
    const s = JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) || '{}');
    s.graphics = 'low';
    s.graphicsAuto = false;
    localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, JSON.stringify(s));
  } catch (e) { /* storage refused: the run goes on with defaults */ }`;
  const librarySeed = `try {
    localStorage.setItem(${JSON.stringify(LIBRARY_KEY)}, ${JSON.stringify(JSON.stringify(LIBRARY))});
  } catch (e) { /* storage refused: My tracks will say so */ }`;

  const page = await openPage({
    root: ROOT, width: opts.w, height: opts.h, seed: [settingsSeed, librarySeed],
  });
  const results = {};
  try {
    await page.until('window.__shellReady === true', 90000);
    await page.until('!!window.__ui', 10000);
    results.walk = await runProbe(page, walkProbe, { screens: SCREENS });
    results.escape = await runProbe(page, escapeProbe, { screens: SCREENS });
    results.fcTabs = await runProbe(page, fcTabsProbe, { tabs: FC_TABS });
    results.behaviour = await runProbe(page, behaviourProbe, {
      screens: SCREENS, tabs: FC_TABS, importKey: IMPORT_KEY,
    });
    results.ids = await runProbe(page, idsProbe, { screens: SCREENS });
    await page.evaluate('window.__ui.show("title")');
  } finally {
    await page.close();
  }

  if (opts.record) {
    recordBaseline(results.walk, opts);
  }

  const failures = [];
  const notes = [];
  const table = [];
  const fcLines = [];
  const fail = (m) => failures.push(m);
  const note = (m) => notes.push(m);

  judgeScreens(results, baseline, opts, fail, note, table);
  judgeIds(results.ids, fail, note);
  judgeBehaviour(results.behaviour, fail, note);
  judgeFcTabs(results.fcTabs, fail, fcLines);
  judgeConsole(page.errors, fail, note);

  console.log(`shell check at ${opts.w}x${opts.h}`);
  for (const line of table) {
    console.log(line);
  }
  console.log('');
  console.log('  firmware bench, arrow travel per tab');
  for (const line of fcLines) {
    console.log(line);
  }
  for (const n of notes) {
    console.log(`note: ${n}`);
  }
  if (failures.length) {
    console.error(`\nFAIL, ${failures.length} problem(s):`);
    for (const f of failures) {
      console.error(`  ${f}`);
    }
    process.exitCode = 1;
  } else {
    console.log('\nPASS');
  }
}

main().catch((e) => {
  console.error((e && e.stack) || e);
  process.exitCode = 1;
});
