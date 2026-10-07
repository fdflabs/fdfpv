/*
 * fc.js: the flight controller bench, a Configurator-shaped screen over
 * the running module's CLI dump.
 *
 * Nothing here writes a PID directly. The bench keeps a draft copy of the
 * dump, every control edits that draft through setCliValue within the
 * firmware's bounds, and Save hands the draft to sim.init. The shell then
 * keeps the result as the pilot's own tune, "Your edits" on the Tune row.
 *
 * Owner rules this screen exists under:
 * - There is no way to paste or upload CLI text. The first bench had a CLI
 *   tab, a textarea and a drop-a-diff import, and was removed as unusable;
 *   it came back on the condition that that door stays shut. Export, the
 *   other direction, is allowed.
 * - Rates belong to the Rates screen. The Rateprofile page signposts it and
 *   shows only what is left, and Save routes rate keys back into the
 *   pilot's rate profile. PIDs edited here become part of the saved dump,
 *   which is the "custom" tune the PIDs screen then shows as its baseline.
 * - The firmware's own name for the rates type stays off the screen
 *   (2 Oct 2026): it reads as the Rates screen's Classic. Only the label
 *   changes; the value written and exported is the firmware's.
 *
 * Tab names and colours follow Betaflight Configurator 10.10 (firmware
 * 4.5.1) as a homage. It is not that app: no MSP, no Vue, no iframe.
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

import { keyNote } from '../fc/keynotes.js';
import { normaliseRates, RATE_DEFAULTS } from '../../configs/rates.js';
import { TUNES, tunePath } from '../../configs/registry.js';
import { str } from '../strings/index.js';
import {
  FEATURES,
  FIELDS,
  STATUS,
  TABS,
  fieldBounds,
  fieldEnabled,
  lookupValues,
  tabFields,
} from '../fc/catalog.js';
import {
  cliMap,
  composeConfig,
  exportCli,
  featureEnabled,
  RATE_KEYS,
  RATES_KEEP,
  ratesFromDump,
  setCliValue,
  setFeatureLine,
} from '../fc/dump.js';

const BENCH_TABS = TABS.filter((tab) => tab.id !== 'cli');
const BENCH_TAB_IDS = BENCH_TABS.map((tab) => tab.id);

const FIELD_BY_KEY = new Map();
for (const f of FIELDS) {
  if (!FIELD_BY_KEY.has(f.key)) FIELD_BY_KEY.set(f.key, f);
}

/* Configurator splits PID Tuning into three sub-tabs. The labels resolve
 * once, when the module loads, which is when the Page row and the page
 * strip have always read them. */
const PID_PAGES = [
  ['pid', str('fc.pid_profile_settings')],
  ['filters', str('fc.filter_settings')],
  ['rates', str('fc.rateprofile_settings')],
].map(([id, label]) => ({ id, label }));
const PID_PAGE_IDS = PID_PAGES.map((p) => p.id);

/* A full re-render of about 690 rows measured 57 ms per keystroke, so
 * search results stop here and a row says how many more matched. */
const SEARCH_LIMIT = 60;

/* Display labels for lookup values, keyed by the firmware's value. */
const LOOKUP_LABEL = { BETAFLIGHT: 'CLASSIC' };
const shownLookup = (value) => LOOKUP_LABEL[value] ?? value;

/*
 * Configurator's groupings, as a table per scope: the first pattern a key
 * matches names its section heading and, on the two PID Tuning pages that
 * reorder live keys, its place in the list. A scope is a PID page while
 * the PID tab is open and the field's own tab otherwise. `text` is shown
 * as written, `say` is a string table key looked up when the row is drawn.
 */
const ANY = /(?:)/;
const GROUPS = {
  'pid:pid': [
    { re: /^simplified_/, say: 'fc.simplified_tuning', order: 0 },
    { re: /^[pidf]_|^d_min/, text: 'PID', order: 1 },
    { re: /^iterm_/, say: 'fc.iterm_relax', order: 2 },
    { re: /^anti_gravity/, say: 'fc.anti_gravity', order: 2 },
    { re: /^tpa_|^throttle_boost/, text: 'TPA', order: 2 },
    { re: /^feedforward_/, text: 'Feedforward', order: 2 },
    { re: /^angle_|^horizon_|^level_/, text: 'Angle', order: 2 },
    { re: ANY, text: 'Advanced', order: 2 },
  ],
  'pid:filters': [
    { re: /^simplified_/, say: 'fc.simplified_filters', order: 0 },
    { re: /^gyro_lpf/, say: 'fc.gyro_lowpass', order: 1 },
    { re: /^dyn_notch/, say: 'fc.dynamic_gyro_notch', order: 2 },
    { re: /^dterm_|^yaw_lowpass/, say: 'fc.d_term', order: 3 },
    { re: /^rpm_/, say: 'fc.rpm_filter', order: 4 },
    { re: ANY, text: 'Filters', order: 5 },
  ],
  'pid:rates': [{ re: ANY, say: 'fc.throttle_and_limits', order: 0 }],
  receiver: [
    { re: /^rc_smoothing/, say: 'fc.rc_smoothing', order: 0 },
    { re: /check$|mid_rc|airmode_start/, text: 'Receiver', order: 0 },
    { re: ANY, say: 'ui.radio_link', order: 0 },
  ],
  motors: [
    { re: /^dshot_|^motor_poles|^bidir/, text: 'DShot', order: 0 },
    { re: ANY, text: 'Mixer', order: 0 },
  ],
  configuration: [{ re: ANY, text: 'Configuration', order: 0 }],
};

function groupOf(field, scope) {
  const table = GROUPS[scope];
  return table ? table.find((g) => g.re.test(field.key)) : undefined;
}

function headingOf(group) {
  if (!group) return '';
  return group.say ? str(group.say) : group.text;
}

/* Only the two PID Tuning pages reorder their live keys. */
function orderOf(field, page) {
  if (page !== 'pid' && page !== 'filters') return 0;
  return groupOf(field, `pid:${page}`).order;
}

const limit = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* The next item in a list, wrapping at both ends. A value not in the list
 * counts as the first item. */
export function cycle(list, value, dir) {
  const n = list.length;
  const from = Math.max(0, list.indexOf(value));
  return list[(from + dir + n) % n];
}

function shownValue(field, raw) {
  if (raw === null || raw === undefined || raw === '') return 'unset';
  return field.units ? `${raw} ${field.units}` : String(raw);
}

const onOff = (on) => (on ? 'On' : 'Off');

/* A row that explains something and can be landed on but never changed. */
function greyRow(label, value, note) {
  const row = { label };
  if (value !== undefined) row.value = value;
  return Object.assign(row, {
    note, info: true, disabled: true, rowClass: 'row-grey',
  });
}

function heading(label, note) {
  return {
    label, info: true, disabled: true, rowClass: 'fc-section', note,
  };
}

function toggleRow(label, on, set, note, extra = {}) {
  return {
    label,
    ...extra,
    note,
    sw: true,
    on,
    value: onOff(on),
    current: on,
    adjust: (d) => set(d > 0),
    flip: () => set(!on),
  };
}

function button(label, action, note) {
  return {
    label, action, rowClass: 'fc-btn', note,
  };
}

/* Typed text to a whole firmware unit inside the bounds, or null for text
 * that is not a number. */
function parseTyped(text, min, max) {
  const t = String(text).trim();
  if (t === '') return null;
  const v = Math.round(Number(t));
  return Number.isFinite(v) ? limit(v, min, max) : null;
}

export class FcSession {
  constructor() {
    this.snapshot = '';
    this.draft = '';
    this.parsed = { text: null, map: null };
    this.tab = 'pid';
    this.page = 'pid';
    this.runActive = false;
    /* Off: Up and Down skip the keys this build does not implement, which
     * on Configuration is all but a handful of 141. On: they stop on every
     * key, for a pilot looking up a key a guide named to read why it is
     * missing. A visible row rather than a hidden key, so it gets used. */
    this.walkAll = false;
    /* null when off. A string, possibly empty, while `/` search is on: the
     * body becomes matches across every tab, because the sidebar has no
     * grouping and a pilot should not need to know where Betaflight files
     * a key to find it. */
    this.search = null;
    this.onlyModified = false;
    this.confirm = null;
    this.presetId = '';
    this.motorDuty = [0, 0, 0, 0];
    this.attitude = {
      w: 1, x: 0, y: 0, z: 0,
    };
    this.exitAfterSave = false;
    /* The shell replaces these with its own settings and motor override. */
    this.getFlightMode = () => 'acro';
    this.setFlightMode = () => {};
    this.getLaunchControl = () => false;
    this.setLaunchControl = () => {};
    this.motorTestAllowed = () => false;
    this.onMotorTest = () => {};
  }

  open(dumpText, opts = {}) {
    this.snapshot = dumpText ?? '';
    this.draft = this.snapshot;
    this.tab = opts.tab || 'pid';
    this.page = opts.page || 'pid';
    this.runActive = Boolean(opts.runActive);
    this.confirm = null;
    this.presetId = '';
    this.exitAfterSave = false;
    this.motorDuty = [0, 0, 0, 0];
  }

  /* The draft parsed, reused while the draft text is unchanged. Keyed on
   * the text itself because main.js assigns draft directly after a save,
   * and rows are rebuilt on every keystroke, which a reparse of the whole
   * dump each time made too slow on the Configuration tab. */
  draftMap() {
    if (this.parsed.text !== this.draft) {
      this.parsed = { text: this.draft, map: cliMap(this.draft) };
    }
    return this.parsed.map;
  }

  cliValue(key) {
    return this.draftMap().get(key) ?? null;
  }

  dirty() {
    return this.draft !== this.snapshot;
  }

  discard() {
    this.draft = this.snapshot;
    this.confirm = null;
    this.presetId = '';
    this.stopMotors();
  }

  setTab(id) {
    this.tab = id;
    if (id === 'pid' && !PID_PAGE_IDS.includes(this.page)) this.page = 'pid';
  }

  setValue(key, value) {
    const field = FIELD_BY_KEY.get(key);
    if (!field || !fieldEnabled(field)) return;
    this.draft = setCliValue(this.draft, key, value);
    this.presetId = '';
  }

  setFeature(name, on) {
    const feature = FEATURES.find((f) => f.name === name);
    if (feature?.status !== STATUS.LIVE) return;
    this.draft = setFeatureLine(this.draft, name, on);
    this.presetId = '';
  }

  /* Stages a registry tune in the draft through the same composeConfig the
   * shell boots from, keeping whatever rates the draft holds: a preset
   * changes the tune, never the stick feel. Save is still needed. */
  async applyPreset(id) {
    const res = await fetch(tunePath(id));
    if (!res.ok) throw new Error(`preset ${id} HTTP ${res.status}`);
    const tune = await res.text();
    const rates = normaliseRates(ratesFromDump(this.draft));
    this.draft = composeConfig(tune, rates, RATES_KEEP);
    this.presetId = id;
    this.tab = 'pid';
    this.page = 'pid';
  }

  /* The firmware's ACTUAL defaults, the same numbers the Rates screen's
   * revert writes, so both screens mean the same thing by default. */
  resetRatesToDefault() {
    const d = RATE_DEFAULTS;
    this.setValue('rates_type', d.type);
    for (const [suffix, prop] of [['rc_rate', 'rcRate'], ['srate', 'srate'], ['expo', 'expo']]) {
      for (const axis of ['roll', 'pitch', 'yaw']) {
        this.setValue(`${axis}_${suffix}`, String(d[axis][prop]));
      }
    }
  }

  /* onMotorTest(motor, duty): motor -1 means all four, duty -1 releases
   * the override. */
  stopMotors() {
    this.motorDuty = [0, 0, 0, 0];
    this.onMotorTest(-1, -1);
  }

  setMotorDuty(index, duty) {
    if (!this.motorTestAllowed()) return;
    const d = limit(duty, 0, 1);
    const sent = d > 0 ? d : -1;
    if (index >= 0) {
      this.motorDuty[index] = d;
      this.onMotorTest(index, sent);
      return;
    }
    this.motorDuty = [d, d, d, d];
    this.onMotorTest(-1, sent);
    /* All four at zero releases twice, the second as an explicit stop. */
    if (d === 0) this.onMotorTest(-1, -1);
  }

  exportText() {
    return exportCli(this.draft);
  }

  currentTab() {
    return BENCH_TABS.find((tab) => tab.id === this.tab) ?? BENCH_TABS[0];
  }

  /* The firmware initialises gyro LPF1 from its dynamic range whenever the
   * dynamic minimum is above zero, so the static cutoff is inert then. */
  lpf1Inert(field) {
    return field.key === 'gyro_lpf1_static_hz' && Number(this.cliValue('gyro_lpf1_dyn_min_hz')) > 0;
  }

  editable(field, tabGrey) {
    return !tabGrey && fieldEnabled(field) && !this.lpf1Inert(field);
  }

  /* How many shown keys the arrows skip. The same test fieldItem uses. */
  skippedOnTab() {
    const grey = Boolean(this.currentTab().grey);
    return this.visibleFields().filter((f) => !this.editable(f, grey)).length;
  }

  /* Ranked key matches across every tab: live keys before keys this build
   * lacks (a key you can change is the likelier answer, a missing one is
   * still an answer), then exact, prefix, anywhere, then shorter, then by
   * name. Shorter first is what puts d_min_roll above
   * simplified_d_min_ratio. */
  searchHits(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return { hits: [], total: 0 };
    const found = [];
    for (const field of FIELDS) {
      if (field.key.startsWith('#')) continue;
      const name = field.key.toLowerCase();
      const pos = name.indexOf(q);
      if (pos === -1) continue;
      let match = 2;
      if (name === q) match = 0;
      else if (pos === 0) match = 1;
      found.push([fieldEnabled(field) ? 0 : 1, match, name.length, field]);
    }
    found.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || (a[3].key < b[3].key ? -1 : 1));
    return { hits: found.slice(0, SEARCH_LIMIT).map((x) => x[3]), total: found.length };
  }

  /* Keys whose draft value differs from the dump the bench opened on. */
  modifiedKeys() {
    const opened = cliMap(this.snapshot);
    const changed = new Set();
    for (const [key, value] of this.draftMap()) {
      if (String(opened.get(key) ?? '') !== String(value ?? '')) changed.add(key);
    }
    return changed;
  }

  visibleFields() {
    if (this.search) return this.searchHits(this.search).hits;
    if (this.tab === 'presets' || this.tab === 'modes') return [];
    const onPid = this.tab === 'pid';
    let list = tabFields(this.tab);
    if (onPid) list = list.filter((f) => f.page === this.page);
    /* The Rates screen owns these; offering them twice as raw CLI is how
     * the menu and the module once came to disagree. */
    if (onPid && this.page === 'rates') list = list.filter((f) => !RATE_KEYS.has(f.key));
    const page = onPid ? this.page : '';
    const live = list.filter((f) => !f.key.startsWith('#') && fieldEnabled(f));
    const rest = list.filter((f) => f.key.startsWith('#') || !fieldEnabled(f));
    live.sort((a, b) => orderOf(a, page) - orderOf(b, page));
    const shown = live.concat(rest);
    if (!this.onlyModified) return shown;
    const changed = this.modifiedKeys();
    return shown.filter((f) => changed.has(f.key));
  }

  noteFor(field) {
    if (this.lpf1Inert(field)) return str('fc.firmware_inits_lpf1_from_gyro_lpf1');
    if (field.status === STATUS.GATED || !fieldEnabled(field)) return field.reason;
    if (field.key.startsWith('simplified_')) return str('fc.writes_the_slider_then_simplified_tuning');
    return keyNote(field);
  }

  fieldItem(field, tabGrey) {
    const { key } = field;
    const raw = this.cliValue(key);
    const note = this.noteFor(field);
    if (!this.editable(field, tabGrey)) {
      /* Still drawn, and still reachable by click, PageUp, PageDown, Home
       * and End, because the note says why this build leaves it out. Only
       * the arrows step over it, unless walkAll is on. */
      return {
        label: key,
        key,
        value: shownValue(field, raw),
        note,
        info: true,
        disabled: true,
        skip: !this.walkAll,
        rowClass: 'row-grey',
      };
    }
    const rowClass = field.status === STATUS.GATED ? 'row-gated' : '';
    const set = (v) => this.setValue(key, v);
    const choices = field.lookup ? lookupValues(field.lookup) : null;
    if (choices && choices.length) {
      const current = choices.includes(raw) ? raw : (raw ?? choices[0]);
      return {
        label: key,
        key,
        note,
        value: shownValue(field, shownLookup(current)),
        current,
        options: choices.map((value) => ({ value, label: shownLookup(value) })),
        pick: (v) => set(v),
        adjust: (d) => set(cycle(choices, current, d)),
        rowClass,
      };
    }
    /*
     * A typed number with one-unit arrows, the control the Rates screen
     * uses: a cutoff spanning a thousand units is not something to reach
     * by arrow presses, and pasting CLI is not on offer. Commit is on blur
     * or Enter. The simplified tuning keys also get a slider, since a
     * sweep is their whole point.
     */
    const { min, max } = fieldBounds(field);
    const n = Number(raw);
    const cur = Number.isFinite(n) ? n : min;
    const row = {
      label: key,
      key,
      note,
      num: {
        spec: {
          cliMin: min, cliMax: max, scale: 1, decimals: 0, unit: '',
        },
        cli: cur,
        text: String(cur),
        unit: '',
      },
      adjust: (d) => set(String(limit(cur + d, min, max))),
      typed: (text) => parseTyped(text, min, max),
      set: (v) => set(String(v)),
      rowClass,
    };
    if (key.startsWith('simplified_') && key !== 'simplified_pids_mode') row.range = { min, max };
    return row;
  }

  confirmRows() {
    if (this.confirm === 'save-run') {
      return [
        { label: str('fc.save_and_restart_the_run'), action: 'fc-save-restart', note: str('fc.save_writes_the_dump_through_sim') },
        { label: str('fc.wait_until_the_result_screen'), action: 'fc-wait', note: str('fc.keeps_the_draft_save_when_the') },
      ];
    }
    /* Escape with unsaved edits. Save is offered here too, because saving
     * is usually what a pilot who hit Escape by accident wanted. */
    if (this.confirm === 'leave') {
      return [
        { label: str('ui.keep_editing'), action: 'fc-keep-editing', note: str('fc.stays_here_with_the_draft_intact') },
        {
          label: str('fc.save_and_leave'),
          action: 'fc-save-exit',
          note: str(this.runActive ? 'fc.writes_the_dump_then_asks_whether' : 'fc.writes_the_draft_through_sim_init'),
        },
        { label: str('fc.discard_and_leave'), action: 'fc-discard-leave', note: str('fc.throws_the_draft_away_and_restores') },
      ];
    }
    return null;
  }

  searchRows(tab) {
    const query = this.search;
    const found = this.searchHits(query);
    const rows = [{
      label: str('fc.search'),
      key: 'fc-search',
      note: query
        ? str('fc.key_s_match_across_every_tab', { total: found.total, label: tab.label })
        : str('fc.type_part_of_a_key_name'),
      /* A plain text control, see makeSearch in ui.js: the number row's
       * commit on blur, steppers and decimal keypad are all wrong for a
       * name typed a letter at a time. */
      text: { value: query, placeholder: str('fc.part_of_a_key_name') },
      onText: (v) => { this.search = String(v ?? ''); },
    }];
    if (!query) {
      rows.push(greyRow(str('fc.nothing_typed_yet'), undefined, str('fc.every_key_in_the_catalog_is')));
      return rows;
    }
    if (found.total === 0) {
      rows.push(greyRow(str('fc.no_key_contains', { search: query }), undefined, str('fc.not_in_betaflight_4_5_1')));
      return rows;
    }
    for (const field of found.hits) rows.push(this.fieldItem(field, false));
    const hidden = found.total - found.hits.length;
    if (hidden > 0) {
      rows.push(greyRow(
        str('fc.more_not_shown', { v1: hidden }),
        undefined,
        str('fc.keys_match_and_the_first_are', { total: found.total, length: found.hits.length }),
      ));
    }
    return rows;
  }

  /* Tab, the view switches and Page: the rows that decide what the body
   * below them shows. */
  controlRows(tab) {
    const rows = [{
      label: 'Tab',
      note: tab.grey ? tab.reason : str('fc.configurator_tabs_grey_tabs_can_be'),
      value: tab.label,
      current: tab.id,
      options: BENCH_TABS.map((t) => ({ value: t.id, label: t.label })),
      pick: (v) => this.setTab(v),
      adjust: (d) => this.setTab(cycle(BENCH_TAB_IDS, this.tab, d)),
    }];
    const skipped = this.skippedOnTab();
    if (skipped > 0) {
      rows.push(toggleRow(
        str('fc.walk_every_key'),
        this.walkAll,
        (on) => { this.walkAll = on; },
        str(this.walkAll ? 'fc.up_and_down_stop_on_all' : 'fc.up_and_down_skip_the_key', { skipped }),
      ));
    }
    /* Offered once there is something to show, so it is not a row that
     * reads Off forever on a clean draft. */
    const changedCount = this.modifiedKeys().size;
    if (changedCount > 0 || this.onlyModified) {
      rows.push(toggleRow(
        str('fc.only_what_i_changed'),
        this.onlyModified,
        (on) => { this.onlyModified = on; },
        str(this.onlyModified ? 'fc.showing_only_the_key_s_this' : 'fc.key_s_differ_from_the_dump', { changedCount }),
      ));
    }
    if (this.tab === 'pid') {
      const page = PID_PAGES.find((p) => p.id === this.page) ?? PID_PAGES[0];
      rows.push({
        label: 'Page',
        note: str('fc.pid_tuning_in_4_5_1'),
        value: page.label,
        current: page.id,
        options: PID_PAGES.map((p) => ({ value: p.id, label: p.label })),
        pick: (v) => { this.page = v; },
        adjust: (d) => { this.page = cycle(PID_PAGE_IDS, this.page, d); },
      });
    }
    return rows;
  }

  buttonRows() {
    const dirty = this.dirty();
    const rows = [button(str('ui.save'), 'fc-save', str(dirty ? 'fc.writes_the_draft_dump_through_sim' : 'fc.no_edits_save_does_not_re'))];
    if (dirty) {
      rows.push(button(str('ui.save_and_exit'), 'fc-save-exit',
        str(this.runActive ? 'fc.writes_the_dump_then_asks_whether' : 'fc.writes_the_dump_through_sim_init')));
    }
    rows.push(
      button(str('ui.discard'), 'fc-discard', str('fc.restores_the_dump_that_was_live')),
      button(str('fc.export'), 'fc-export', str('fc.downloads_cli_text_a_4_5')),
      button(dirty ? str('ui.exit_without_saving') : 'Exit', 'fc-back',
        str(dirty ? 'fc.leaves_and_restores_the_dump_that' : 'fc.leaves_this_screen_escape_does_the')),
    );
    return rows;
  }

  presetRows() {
    const rows = TUNES.map((tune) => ({
      label: tune.name,
      action: `fc-preset:${tune.id}`,
      note: str('fc.keep_mine_rates_save_still_required', { note: tune.note }),
    }));
    rows.push(greyRow('firmware-presets', 'Unavailable', str('fc.optional_later_fetch_from_betaflight_firmware')));
    return rows;
  }

  modeRows() {
    const angle = this.getFlightMode() === 'angle';
    const launch = this.getLaunchControl();
    return [
      greyRow(str('fc.arm'), str('fc.always_on'), str('fc.the_sim_is_always_armed_a')),
      toggleRow(str('fc.angle'), angle, (on) => this.setFlightMode(on), str('fc.on_or_off_same_sim_set')),
      {
        ...toggleRow(str('fc.launch_control'), launch, (on) => this.setLaunchControl(on), str('fc.on_or_off_same_launch_control')),
        /* Read at the press, so a flip always inverts what the shell has. */
        flip: () => this.setLaunchControl(!this.getLaunchControl()),
      },
      greyRow(str('fc.horizon'), 'Unavailable', str('fc.no_aux_channels_until_they_are')),
      greyRow(str('fc.gps_rescue'), 'Unavailable', str('fc.no_gps_sensor_in_the_plant')),
    ];
  }

  featureRows() {
    const rows = [heading(str('fc.features'), str('fc.feature_lines_in_the_dump_same'))];
    for (const feat of FEATURES) {
      const label = str('fc.feature', { name: feat.name });
      const on = featureEnabled(this.draft, feat.name);
      if (feat.status !== STATUS.LIVE) {
        rows.push(greyRow(label, onOff(on), feat.reason));
        continue;
      }
      rows.push(toggleRow(label, Boolean(on), (v) => this.setFeature(feat.name, v), feat.reason, { key: `feature ${feat.name}` }));
    }
    return rows;
  }

  motorRows() {
    if (!this.motorTestAllowed()) {
      return [greyRow(str('fc.motor_test'), 'Unavailable', str('fc.motor_test_uses_sim_motor_override'))];
    }
    const percent = (duty) => `${Math.round(duty * 100)} %`;
    const rows = [{
      label: str('fc.all_motors'),
      note: str('fc.title_only_sim_motor_override_the'),
      value: percent(this.motorDuty[0]),
      step: true,
      adjust: (d) => this.setMotorDuty(-1, this.motorDuty[0] + d * 0.05),
    }];
    this.motorDuty.forEach((duty, i) => {
      rows.push({
        label: str('fc.motor', { v1: i + 1 }),
        note: str('fc.betaflight_order_1_rear_right_2'),
        value: percent(duty),
        step: true,
        adjust: (d) => this.setMotorDuty(i, this.motorDuty[i] + d * 0.05),
      });
    });
    rows.push({ label: str('fc.stop_motors'), action: 'fc-motors-stop', note: str('fc.clears_sim_motor_override') });
    return rows;
  }

  fieldRows(tab) {
    const fields = this.visibleFields();
    const rows = [];
    if (tab.grey && fields.length === 0) rows.push(greyRow(tab.label, 'Unavailable', tab.reason));
    const page = this.tab === 'pid' ? this.page : '';
    let open = '';
    for (const field of fields) {
      const title = headingOf(groupOf(field, page ? `pid:${page}` : field.tab));
      if (title && title !== open) {
        open = title;
        rows.push(heading(title, str('fc.configurator_group_values_still_travel_as')));
      }
      rows.push(this.fieldItem(field, tab.grey));
    }
    return rows;
  }

  items() {
    const asking = this.confirmRows();
    if (asking) return asking;
    const tab = this.currentTab();
    if (this.search != null) return this.searchRows(tab);

    const rows = [...this.controlRows(tab), ...this.buttonRows()];
    if (this.tab === 'pid' && this.page === 'rates') {
      rows.push(
        {
          label: str('ui.rates'), value: str('fc.on_the_rates_screen'), note: str('fc.rates_belong_to_you_not_to'), info: true,
        },
        { label: str('fc.open_the_rates_screen'), action: 'rates', note: str('fc.leaves_the_flight_controller_unsaved_edits') },
      );
    }
    if (this.tab === 'presets') return rows.concat(this.presetRows());
    if (this.tab === 'modes') return rows.concat(this.modeRows());
    if (this.tab === 'setup') {
      rows.push({
        label: str('ui.attitude'), value: 'Live', note: str('fc.horizon_from_the_plant_quaternion_sim'), info: true,
      });
    }
    if (this.tab === 'configuration') rows.push(...this.featureRows());
    if (this.tab === 'motors') rows.push(...this.motorRows());
    return rows.concat(this.fieldRows(tab));
  }
}

/* Builds a strip of buttons once, marking it ready in its dataset, so
 * later paints only move the highlight. */
function buildStrip(nav, entries, className, onPick) {
  if (nav.dataset.ready) return;
  nav.textContent = '';
  for (const { id, label } of entries) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = className;
    b.dataset.id = id;
    b.textContent = label;
    b.addEventListener('click', () => onPick(id));
    nav.append(b);
  }
  nav.dataset.ready = '1';
}

export function paintTabStrip(nav, session, onPick) {
  buildStrip(nav, BENCH_TABS, 'fc-tab', onPick);
  for (const b of nav.children) {
    const tab = BENCH_TABS.find((t) => t.id === b.dataset.id);
    b.classList.toggle('on', b.dataset.id === session.tab);
    b.classList.toggle('grey', Boolean(tab?.grey));
  }
}

export function paintPageStrip(nav, session, onPick) {
  if (!nav) return;
  const visible = session.tab === 'pid' && !session.confirm;
  nav.hidden = !visible;
  if (!visible) return;
  buildStrip(nav, PID_PAGES, 'fc-page', onPick);
  for (const b of nav.children) b.classList.toggle('on', b.dataset.id === session.page);
}

const SKY = '#3a81c5';
const GROUND = '#6b4a2b';
const MARK = '#ffbb00';

/*
 * An attitude indicator from the plant quaternion (body to world, z up).
 * Own drawing, not Betaflight's Three.js widget or its assets.
 *
 * Pitch sign: an aviation horizon assumes NED, y right and z down, while
 * the plant is x forward, y left, z up, where a positive turn about body y
 * lowers the nose. The pitch term is negated here, at the instrument. This
 * is a drawing, not the render boundary, which stays in src/render/frame.js.
 * Roll reads the same in both frames.
 */
export function drawAttitude(canvas, q) {
  if (!canvas) return;
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext('2d');
  if (!ctx || w < 8 || h < 8) return;
  const roll = Math.atan2(2 * (q.w * q.x + q.y * q.z), 1 - 2 * (q.x * q.x + q.y * q.y));
  const s = 2 * (q.z * q.x - q.w * q.y);
  const pitch = Math.abs(s) >= 1 ? Math.sign(s) * (Math.PI / 2) : Math.asin(s);
  /* Half a turn of pitch spans the canvas height. */
  const horizon = pitch * (h / Math.PI);
  const cx = w / 2;
  const cy = h / 2;

  ctx.fillStyle = SKY;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-roll);
  ctx.fillStyle = GROUND;
  ctx.fillRect(-w, horizon, w * 2, h * 2);
  ctx.strokeStyle = MARK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-w, horizon);
  ctx.lineTo(w, horizon);
  ctx.stroke();
  ctx.restore();

  /* The fixed aircraft symbol: two wings and a centre dot. */
  ctx.strokeStyle = MARK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const [x0, x1] of [[w * 0.2, w * 0.45], [w * 0.55, w * 0.8], [cx - 6, cx + 6]]) {
    ctx.moveTo(x0, cy);
    ctx.lineTo(x1, cy);
  }
  ctx.stroke();
}

export function downloadCli(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'flight-controller.diff';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
