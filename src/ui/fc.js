/*
 * fc.js: the flight-controller screen, restored.
 *
 * Configurator-shaped tabs and fields. The UI never writes a PID. It edits
 * a CLI dump of the running module. Save is sim.init of that dump, and the
 * shell then adopts the result as the pilot's own tune, "Your edits" on
 * the Tune row, alongside the shipped three.
 *
 * HISTORY, because this file has been deleted once and that record is the
 * reason it looks the way it does. The first flight-controller screen was
 * removed for being unusable, and its jobs were split into the screens
 * that still exist: Rates, PIDs and the Tune row. The owner then asked for
 * the full surface back, minus exactly one thing: THERE IS NO WAY TO PASTE
 * OR UPLOAD CLI TEXT HERE. The CLI tab, the textarea and the drop-a-diff
 * import from the first version did not come back. Every field is edited
 * through a control with firmware bounds, and every edit still travels as
 * CLI through setCliValue, so the honesty of the first version survives
 * without its foot-gun.
 *
 * OWNERSHIP, so this screen and the simple ones cannot fight. Rates
 * belong to the Rates screen: the Rateprofile page here is a signpost plus
 * the leftovers, and Save routes any rate keys in the dump back INTO the
 * pilot's rate profile rather than around it. PIDs edited here become part
 * of the saved dump, which becomes the "custom" tune, whose baseline is
 * exactly what the PIDs screen then shows.
 *
 * Colours and tab names are a homage of Betaflight Configurator 10.10
 * (firmware 4.5.1). This is not that app: no Vue, no MSP, no iframe.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { keyNote, hasKeyNote } from '../fc/keynotes.js';
import { normaliseRates, RATE_DEFAULTS } from '../../configs/rates.js';
import { OFFERED_TUNES, tunePath } from '../../configs/registry.js';
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

/* Configurator's tab list from the catalog, minus CLI: pasting a dump is
 * the one door the owner asked to keep shut. */
const TABS_SHOWN = TABS.filter((t) => t.id !== 'cli');

/* Measured, not chosen: a full teardown render of 690 rows costs about 57 ms
 * per keystroke on this container. Sixty results is a screenful and a half
 * and renders inside a frame. See `this.search` in the constructor. */
const SEARCH_CAP = 60;

const PID_PAGES = [
  { id: 'pid', label: str('fc.pid_profile_settings') },
  { id: 'filters', label: str('fc.filter_settings') },
  { id: 'rates', label: str('fc.rateprofile_settings') },
];

/* Step through a list with wraparound. */
export function cycle(list, value, dir) {
  const i = list.indexOf(value);
  const n = list.length;
  return list[((i < 0 ? 0 : i) + dir + n) % n];
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function formatField(field, raw) {
  if (raw == null || raw === '') {
    return 'unset';
  }
  if (field.units) {
    return `${raw} ${field.units}`;
  }
  return String(raw);
}

function sectionFor(field, page) {
  const k = field.key;
  if (page === 'pid') {
    if (k.startsWith('simplified_')) {
      return str('fc.simplified_tuning');
    }
    if (/^[pidf]_/.test(k) || k.startsWith('d_min')) {
      return 'PID';
    }
    if (k.startsWith('iterm_')) {
      return str('fc.iterm_relax');
    }
    if (k.startsWith('anti_gravity')) {
      return str('fc.anti_gravity');
    }
    if (k.startsWith('tpa_') || k.startsWith('throttle_boost')) {
      return 'TPA';
    }
    if (k.startsWith('feedforward_')) {
      return 'Feedforward';
    }
    if (k.startsWith('angle_') || k.startsWith('horizon_') || k.startsWith('level_')) {
      return 'Angle';
    }
    return 'Advanced';
  }
  if (page === 'filters') {
    if (k.startsWith('simplified_')) {
      return str('fc.simplified_filters');
    }
    if (k.startsWith('gyro_lpf')) {
      return str('fc.gyro_lowpass');
    }
    if (k.startsWith('dyn_notch')) {
      return str('fc.dynamic_gyro_notch');
    }
    if (k.startsWith('dterm_') || k.startsWith('yaw_lowpass')) {
      return str('fc.d_term');
    }
    if (k.startsWith('rpm_')) {
      return str('fc.rpm_filter');
    }
    return 'Filters';
  }
  if (page === 'rates') {
    return str('fc.throttle_and_limits');
  }
  if (field.tab === 'receiver') {
    if (k.startsWith('rc_smoothing')) {
      return str('fc.rc_smoothing');
    }
    if (/check$|mid_rc|airmode_start/.test(k)) {
      return 'Receiver';
    }
    return str('ui.radio_link');
  }
  if (field.tab === 'motors') {
    if (/^dshot_|^motor_poles|^bidir/.test(k)) {
      return 'DShot';
    }
    return 'Mixer';
  }
  if (field.tab === 'configuration') {
    return 'Configuration';
  }
  return '';
}

function fieldRank(field, page) {
  const k = field.key;
  if (page === 'pid') {
    if (k.startsWith('simplified_')) {
      return 0;
    }
    if (/^[pidf]_/.test(k) || k.startsWith('d_min')) {
      return 1;
    }
    return 2;
  }
  if (page === 'filters') {
    if (k.startsWith('simplified_')) {
      return 0;
    }
    if (k.startsWith('gyro_lpf')) {
      return 1;
    }
    if (k.startsWith('dyn_notch')) {
      return 2;
    }
    if (k.startsWith('dterm_') || k.startsWith('yaw_lowpass')) {
      return 3;
    }
    if (k.startsWith('rpm_')) {
      return 4;
    }
    return 5;
  }
  return 0;
}

function fieldNote(field, session) {
  const look = (key) => session.cliValue(key);
  if (field.key === 'gyro_lpf1_static_hz' && Number(look('gyro_lpf1_dyn_min_hz')) > 0) {
    return str('fc.firmware_inits_lpf1_from_gyro_lpf1');
  }
  if (field.status === STATUS.GATED) {
    return field.reason;
  }
  if (!fieldEnabled(field)) {
    return field.reason;
  }
  if (field.key.startsWith('simplified_')) {
    return str('fc.writes_the_slider_then_simplified_tuning');
  }
  /*
   * This used to be `return field.key`, so the help column beside 115 typed
   * rows read the key name back at a pilot who had just moved the cursor
   * onto a row labelled with that key name. See src/fc/keynotes.js, which
   * also explains why the sentences do not live in the generated catalog.
   */
  return keyNote(field);
}

function ratesForCompose(draft) {
  return normaliseRates(ratesFromDump(draft));
}

export class FcSession {
  constructor() {
    this.snapshot = '';
    this.draft = '';
    /* See cliMapCached: the parsed draft and the text it was parsed from. */
    this.cliCache = null;
    this.cliCacheText = null;
    this.tab = 'pid';
    this.page = 'pid';
    this.runActive = false;
    /*
     * Walk every key, including the ones this build does not implement.
     *
     * Off by default, so Up and Down travel only the live rows: the
     * Configuration tab has 141 stops and 3 things you can change, and
     * walking the other 138 to reach Save is the defect. On, the arrows
     * stop everywhere, which is what a pilot who has read a guide naming
     * a key needs in order to find it and read why it is not here.
     *
     * It is a row rather than a hidden key because a mode nobody can see
     * is a mode nobody uses, and because the row itself is the place to
     * explain what the greyed keys are.
     */
    this.walkAll = false;
    /*
     * SEARCH, and the reason it is a mode this screen owns rather than a
     * text field in the list.
     *
     * The sidebar is 23 flat tabs with no grouping and no cross-tab search,
     * which is a memory test: a pilot who has read a guide naming
     * `failsafe_procedure` has to know which tab Betaflight files it under
     * before they can go and find out that this build does not have it.
     * Travel is one arrow press per row and there are 696 keys.
     *
     * A field inside the scrolling list would take the cursor with it and
     * fight the arrow keys, which is the same mistake as putting Save in
     * the list. This is a mode: `/` turns the whole body into results
     * across every tab, Escape leaves it, and the arrow keys keep meaning
     * what they meant.
     *
     * CAPPED, honestly. A full teardown render of 690 rows costs about
     * 57 ms per keystroke on this container, which is a menu that feels
     * broken. So results stop at SEARCH_CAP and the row underneath says how
     * many more there were, rather than quietly pretending the rest do not
     * exist.
     */
    this.search = null;
    /*
     * SHOW ONLY WHAT I CHANGED. The other half of the same problem: a pilot
     * who has been editing for ten minutes has no way to see what they are
     * about to save except by walking every tab.
     */
    this.onlyModified = false;
    this.confirm = null;
    this.presetId = '';
    this.motorDuty = [0, 0, 0, 0];
    this.attitude = {
      w: 1, x: 0, y: 0, z: 0,
    };
    this.getFlightMode = () => 'acro';
    this.setFlightMode = () => {};
    this.getLaunchControl = () => false;
    this.setLaunchControl = () => {};
    this.motorTestAllowed = () => false;
    this.onMotorTest = () => {};
    this.exitAfterSave = false;
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

  /*
   * The parsed draft, built at most once per distinct draft text. cliMap
   * scans the whole 20 kB dump; items() runs per keystroke; without this
   * the Configuration tab fell below a readable frame rate. Keyed on the
   * string itself, so it can never go stale.
   */
  cliMapCached() {
    if (!this.cliCache || this.cliCacheText !== this.draft) {
      this.cliCache = cliMap(this.draft);
      this.cliCacheText = this.draft;
    }
    return this.cliCache;
  }

  cliValue(key) {
    return this.cliMapCached().get(key) ?? null;
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
    if (id === 'pid' && !PID_PAGES.some((p) => p.id === this.page)) {
      this.page = 'pid';
    }
  }

  setValue(key, value) {
    const f = FIELDS.find((row) => row.key === key);
    if (!f || !fieldEnabled(f)) {
      return;
    }
    this.draft = setCliValue(this.draft, key, value);
    this.presetId = '';
  }

  setFeature(name, on) {
    const row = FEATURES.find((f) => f.name === name);
    if (!row || row.status !== STATUS.LIVE) {
      return;
    }
    this.draft = setFeatureLine(this.draft, name, on);
    this.presetId = '';
  }

  /*
   * A registry tune into the draft, through the same composeConfig the
   * shell inits from, with the rates the DRAFT currently carries kept:
   * choosing a preset here changes the tune, never the stick. Save is
   * still required, exactly as Configurator's presets stage before Save.
   */
  async applyPreset(id) {
    const path = tunePath(id);
    const res = await fetch(path);
    if (!res.ok) {
      throw new Error(`preset ${id} HTTP ${res.status}`);
    }
    const text = await res.text();
    this.draft = composeConfig(text, ratesForCompose(this.draft), RATES_KEEP);
    this.presetId = id;
    this.tab = 'pid';
    this.page = 'pid';
  }

  /* Betaflight 4.5.1's own ACTUAL profile, the same numbers the Rates
   * screen's revert row writes, so the two doors agree about "default". */
  resetRatesToDefault() {
    const d = RATE_DEFAULTS;
    this.setValue('rates_type', d.type);
    this.setValue('roll_rc_rate', String(d.roll.rcRate));
    this.setValue('pitch_rc_rate', String(d.pitch.rcRate));
    this.setValue('yaw_rc_rate', String(d.yaw.rcRate));
    this.setValue('roll_srate', String(d.roll.srate));
    this.setValue('pitch_srate', String(d.pitch.srate));
    this.setValue('yaw_srate', String(d.yaw.srate));
    this.setValue('roll_expo', String(d.roll.expo));
    this.setValue('pitch_expo', String(d.pitch.expo));
    this.setValue('yaw_expo', String(d.yaw.expo));
  }

  stopMotors() {
    this.motorDuty = [0, 0, 0, 0];
    this.onMotorTest(-1, -1);
  }

  setMotorDuty(index, duty) {
    if (!this.motorTestAllowed()) {
      return;
    }
    const d = clamp(duty, 0, 1);
    if (index < 0) {
      this.motorDuty = [d, d, d, d];
      this.onMotorTest(-1, d > 0 ? d : -1);
      if (d === 0) {
        this.onMotorTest(-1, -1);
      }
      return;
    }
    this.motorDuty[index] = d;
    this.onMotorTest(index, d > 0 ? d : -1);
  }

  exportText() {
    return exportCli(this.draft);
  }

  /* How many keys on the current tab this build does not implement. The
   * same predicate fieldItem uses, so the count and the rows cannot drift. */
  skippedOnTab() {
    const tab = TABS_SHOWN.find((t) => t.id === this.tab) ?? TABS_SHOWN[0];
    let n = 0;
    for (const field of this.visibleFields()) {
      const dynMinOn = field.key === 'gyro_lpf1_static_hz'
        && Number(this.cliValue('gyro_lpf1_dyn_min_hz')) > 0;
      if (tab.grey || !fieldEnabled(field) || dynMinOn) {
        n += 1;
      }
    }
    return n;
  }

  items() {
    if (this.confirm === 'save-run') {
      return [
        {
          label: str('fc.save_and_restart_the_run'),
          action: 'fc-save-restart',
          note: str('fc.save_writes_the_dump_through_sim'),
        },
        {
          label: str('fc.wait_until_the_result_screen'),
          action: 'fc-wait',
          note: str('fc.keeps_the_draft_save_when_the'),
        },
      ];
    }

    /*
     * Escape with unsaved edits asks first. Three rows rather than two,
     * because "save it" is what a pilot who pressed Escape by accident
     * usually wants and making them cancel, find Save and press again is
     * the kind of friction that teaches people to fear the key.
     */
    if (this.confirm === 'leave') {
      return [
        {
          label: str('ui.keep_editing'),
          action: 'fc-keep-editing',
          note: str('fc.stays_here_with_the_draft_intact'),
        },
        {
          label: str('fc.save_and_leave'),
          action: 'fc-save-exit',
          note: this.runActive
            ? str('fc.writes_the_dump_then_asks_whether')
            : str('fc.writes_the_draft_through_sim_init'),
        },
        {
          label: str('fc.discard_and_leave'),
          action: 'fc-discard-leave',
          note: str('fc.throws_the_draft_away_and_restores'),
        },
      ];
    }

    const tab = TABS_SHOWN.find((t) => t.id === this.tab) ?? TABS_SHOWN[0];
    const rows = [];

    /*
     * SEARCH REPLACES THE TAB STRIP while it is on, because the whole point
     * of it is that a pilot does not have to know which of 23 tabs
     * Betaflight files a key under. Tab, Page and Walk every key are all
     * about a tab, so none of them is offered here.
     */
    if (this.search != null) {
      const found = this.searchHits(this.search);
      rows.push({
        label: str('fc.search'),
        key: 'fc-search',
        note: this.search
          ? str('fc.key_s_match_across_every_tab', { total: found.total, label: tab.label })
          : str('fc.type_part_of_a_key_name'),
        /*
         * Its own control, not the typed number row's. That one commits on
         * blur, carries stepper arrows and declares a decimal input mode,
         * and all three are wrong for a name being typed a letter at a
         * time. See makeSearch in ui.js.
         */
        text: { value: this.search, placeholder: str('fc.part_of_a_key_name') },
        onText: (v) => { this.search = String(v == null ? '' : v); },
      });
      if (!this.search) {
        rows.push({
          label: str('fc.nothing_typed_yet'),
          info: true,
          disabled: true,
          rowClass: 'row-grey',
          note: str('fc.every_key_in_the_catalog_is'),
        });
        return rows;
      }
      if (!found.total) {
        rows.push({
          label: str('fc.no_key_contains', { search: this.search }),
          info: true,
          disabled: true,
          rowClass: 'row-grey',
          note: str('fc.not_in_betaflight_4_5_1'),
        });
        return rows;
      }
      for (const field of found.hits) {
        rows.push(this.fieldItem(field, false));
      }
      if (found.total > found.hits.length) {
        /*
         * The honest line. A full teardown render of 690 rows costs about
         * 57 ms per keystroke, so the cap is real; pretending the rest do
         * not exist would be the kind of lie that makes a pilot conclude
         * the key is missing.
         */
        rows.push({
          label: str('fc.more_not_shown', { v1: found.total - found.hits.length }),
          info: true,
          disabled: true,
          rowClass: 'row-grey',
          note: str('fc.keys_match_and_the_first_are', { total: found.total, length: found.hits.length }),
        });
      }
      return rows;
    }

    rows.push({
      label: 'Tab',
      note: tab.grey ? tab.reason : str('fc.configurator_tabs_grey_tabs_can_be'),
      value: tab.label,
      current: tab.id,
      options: TABS_SHOWN.map((t) => ({ value: t.id, label: t.label })),
      pick: (v) => this.setTab(v),
      adjust: (d) => this.setTab(cycle(TABS_SHOWN.map((t) => t.id), this.tab, d)),
    });

    /*
     * Sits directly under Tab, because it changes what Tab lands you in.
     * The count is the honest part: it says how many keys on THIS tab are
     * in Betaflight 4.5.1 and not in this build, so the number a pilot
     * sees is the number they would have had to walk.
     */
    const skipped = this.skippedOnTab();
    if (skipped > 0) {
      rows.push({
        /* A switch, not a two item popup. See toggle() in ui.js. */
        label: str('fc.walk_every_key'),
        sw: true,
        on: this.walkAll,
        value: this.walkAll ? 'On' : 'Off',
        current: this.walkAll,
        adjust: (d) => { this.walkAll = d > 0; },
        flip: () => { this.walkAll = !this.walkAll; },
        note: this.walkAll
          ? str('fc.up_and_down_stop_on_all', { skipped })
          : str('fc.up_and_down_skip_the_key', { skipped }),
      });
    }

    /*
     * SHOW ONLY WHAT I CHANGED. A pilot ten minutes into an edit had no way
     * to see what they were about to save except by walking every tab, and
     * Save says only how many. Offered only when there is something to
     * show, so it is not a permanent row that reads Off forever.
     */
    const changedCount = this.modifiedKeys().size;
    if (changedCount > 0 || this.onlyModified) {
      rows.push({
        label: str('fc.only_what_i_changed'),
        sw: true,
        on: this.onlyModified,
        value: this.onlyModified ? 'On' : 'Off',
        current: this.onlyModified,
        adjust: (d) => { this.onlyModified = d > 0; },
        flip: () => { this.onlyModified = !this.onlyModified; },
        note: this.onlyModified
          ? str('fc.showing_only_the_key_s_this', { changedCount })
          : str('fc.key_s_differ_from_the_dump', { changedCount }),
      });
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
        adjust: (d) => { this.page = cycle(PID_PAGES.map((p) => p.id), this.page, d); },
      });
    }

    rows.push({
      label: str('ui.save'),
      action: 'fc-save',
      rowClass: 'fc-btn',
      note: this.dirty()
        ? str('fc.writes_the_draft_dump_through_sim')
        : str('fc.no_edits_save_does_not_re'),
    });
    if (this.dirty()) {
      rows.push({
        label: str('ui.save_and_exit'),
        action: 'fc-save-exit',
        rowClass: 'fc-btn',
        note: this.runActive
          ? str('fc.writes_the_dump_then_asks_whether')
          : str('fc.writes_the_dump_through_sim_init'),
      });
    }
    rows.push({
      label: str('ui.discard'),
      action: 'fc-discard',
      rowClass: 'fc-btn',
      note: str('fc.restores_the_dump_that_was_live'),
    });
    rows.push({
      label: str('fc.export'),
      action: 'fc-export',
      rowClass: 'fc-btn',
      note: str('fc.downloads_cli_text_a_4_5'),
    });
    rows.push({
      label: this.dirty() ? str('ui.exit_without_saving') : 'Exit',
      action: 'fc-back',
      rowClass: 'fc-btn',
      note: this.dirty()
        ? str('fc.leaves_and_restores_the_dump_that')
        : str('fc.leaves_this_screen_escape_does_the'),
    });

    if (this.tab === 'pid' && this.page === 'rates') {
      rows.push({
        label: str('ui.rates'),
        value: str('fc.on_the_rates_screen'),
        note: str('fc.rates_belong_to_you_not_to'),
        info: true,
      });
      rows.push({
        label: str('fc.open_the_rates_screen'),
        action: 'rates',
        note: str('fc.leaves_the_flight_controller_unsaved_edits'),
      });
    }

    if (this.tab === 'presets') {
      for (const t of OFFERED_TUNES) {
        rows.push({
          label: t.name,
          action: `fc-preset:${t.id}`,
          note: str('fc.keep_mine_rates_save_still_required', { note: t.note }),
        });
      }
      rows.push({
        label: 'firmware-presets',
        value: 'Unavailable',
        note: str('fc.optional_later_fetch_from_betaflight_firmware'),
        info: true,
        disabled: true,
        rowClass: 'row-grey',
      });
      return rows;
    }

    if (this.tab === 'modes') {
      const angle = this.getFlightMode() === 'angle';
      rows.push({
        label: str('fc.arm'),
        value: str('fc.always_on'),
        note: str('fc.the_sim_is_always_armed_a'),
        info: true,
        disabled: true,
        rowClass: 'row-grey',
      });
      rows.push({
        label: str('fc.angle'),
        note: str('fc.on_or_off_same_sim_set'),
        sw: true,
        on: angle,
        value: angle ? 'On' : 'Off',
        current: angle,
        adjust: (d) => this.setFlightMode(d > 0),
        flip: () => this.setFlightMode(!angle),
      });
      rows.push({
        label: str('fc.launch_control'),
        note: str('fc.on_or_off_same_launch_control'),
        sw: true,
        on: this.getLaunchControl(),
        value: this.getLaunchControl() ? 'On' : 'Off',
        current: this.getLaunchControl(),
        adjust: (d) => this.setLaunchControl(d > 0),
        flip: () => this.setLaunchControl(!this.getLaunchControl()),
      });
      rows.push({
        label: str('fc.horizon'),
        value: 'Unavailable',
        note: str('fc.no_aux_channels_until_they_are'),
        info: true,
        disabled: true,
        rowClass: 'row-grey',
      });
      rows.push({
        label: str('fc.gps_rescue'),
        value: 'Unavailable',
        note: str('fc.no_gps_sensor_in_the_plant'),
        info: true,
        disabled: true,
        rowClass: 'row-grey',
      });
      return rows;
    }

    if (this.tab === 'setup') {
      rows.push({
        label: str('ui.attitude'),
        value: 'Live',
        note: str('fc.horizon_from_the_plant_quaternion_sim'),
        info: true,
      });
    }

    if (this.tab === 'configuration') {
      rows.push({
        label: str('fc.features'),
        info: true,
        disabled: true,
        rowClass: 'fc-section',
        note: str('fc.feature_lines_in_the_dump_same'),
      });
      for (const feat of FEATURES) {
        const live = feat.status === STATUS.LIVE;
        const on = featureEnabled(this.draft, feat.name);
        const shown = on == null ? (live ? 'unset' : 'Off') : (on ? 'On' : 'Off');
        if (!live) {
          rows.push({
            label: str('fc.feature', { name: feat.name }),
            value: shown,
            note: feat.reason,
            info: true,
            disabled: true,
            rowClass: 'row-grey',
          });
          continue;
        }
        const current = Boolean(on);
        rows.push({
          label: str('fc.feature', { name: feat.name }),
          key: `feature ${feat.name}`,
          note: feat.reason,
          sw: true,
          on: current,
          value: current ? 'On' : 'Off',
          current,
          adjust: (d) => this.setFeature(feat.name, d > 0),
          flip: () => this.setFeature(feat.name, !current),
        });
      }
    }

    if (this.tab === 'motors') {
      const allowed = this.motorTestAllowed();
      if (!allowed) {
        rows.push({
          label: str('fc.motor_test'),
          value: 'Unavailable',
          note: str('fc.motor_test_uses_sim_motor_override'),
          info: true,
          disabled: true,
          rowClass: 'row-grey',
        });
      } else {
        rows.push({
          label: str('fc.all_motors'),
          note: str('fc.title_only_sim_motor_override_the'),
          value: `${Math.round(this.motorDuty[0] * 100)} %`,
          step: true,
          adjust: (d) => this.setMotorDuty(-1, this.motorDuty[0] + d * 0.05),
        });
        for (let i = 0; i < 4; i += 1) {
          rows.push({
            label: str('fc.motor', { v1: i + 1 }),
            note: str('fc.betaflight_order_1_rear_right_2'),
            value: `${Math.round(this.motorDuty[i] * 100)} %`,
            step: true,
            adjust: (d) => this.setMotorDuty(i, this.motorDuty[i] + d * 0.05),
          });
        }
        rows.push({
          label: str('fc.stop_motors'),
          action: 'fc-motors-stop',
          note: str('fc.clears_sim_motor_override'),
        });
      }
    }

    const fields = this.visibleFields();
    if (tab.grey && fields.length === 0) {
      rows.push({
        label: tab.label,
        value: 'Unavailable',
        note: tab.reason,
        info: true,
        disabled: true,
        rowClass: 'row-grey',
      });
    }
    let lastSection = '';
    for (const field of fields) {
      const section = sectionFor(field, this.tab === 'pid' ? this.page : '');
      if (section && section !== lastSection) {
        lastSection = section;
        rows.push({
          label: section,
          info: true,
          disabled: true,
          rowClass: 'fc-section',
          note: str('fc.configurator_group_values_still_travel_as'),
        });
      }
      rows.push(this.fieldItem(field, tab.grey));
    }
    return rows;
  }

  /*
   * Every key whose name matches, across every tab, ranked so an exact hit
   * comes first and a prefix beats a substring. Betaflight key names are
   * long and share stems, so `d_min` has to put `d_min_roll` above
   * `simplified_d_min_ratio` or the search is worse than the tabs.
   */
  searchHits(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) {
      return { hits: [], total: 0 };
    }
    const scored = [];
    for (const f of FIELDS) {
      if (f.key.startsWith('#')) {
        continue;
      }
      const k = f.key.toLowerCase();
      const at = k.indexOf(q);
      if (at < 0) {
        continue;
      }
      /* 0 exact, 1 prefix, 2 anywhere. Then shorter first, so the plain
       * key outranks the one with three more words on the end. */
      const rank = k === q ? 0 : (at === 0 ? 1 : 2);
      /*
       * LIVE KEYS FIRST, above the rank, because a key this build does not
       * implement cannot be changed and a key it does can. Searching `gyro`
       * put seven bus and alignment keys the sim has no hardware for above
       * gyro_lpf1_type, which is the one a pilot searching for gyro almost
       * certainly wants. The dead ones stay in the list, underneath, since
       * finding out a key is missing is an answer too. It is the same
       * ordering visibleFields already applies inside a tab.
       */
      scored.push({ f, live: fieldEnabled(f) ? 0 : 1, rank, len: k.length });
    }
    scored.sort((a, b) => a.live - b.live || a.rank - b.rank || a.len - b.len
      || (a.f.key < b.f.key ? -1 : 1));
    return { hits: scored.slice(0, SEARCH_CAP).map((x) => x.f), total: scored.length };
  }

  /* Which keys the draft has moved off the snapshot it opened with. The
   * same comparison `dirty()` makes, per key rather than in bulk. */
  modifiedKeys() {
    /* cliMapCached takes no argument: it always parses the draft, and its
     * cache is keyed on the draft text. The snapshot has to go through
     * cliMap directly or this would compare the draft with itself. */
    const now = this.cliMapCached();
    const was = cliMap(this.snapshot);
    const out = new Set();
    for (const [k, v] of now) {
      if (String(was.get(k) ?? '') !== String(v ?? '')) {
        out.add(k);
      }
    }
    return out;
  }

  visibleFields() {
    /* Search replaces the tab entirely: the whole point is that it does not
     * matter which tab Betaflight files a key under. */
    if (this.search) {
      return this.searchHits(this.search).hits;
    }
    let list = tabFields(this.tab);
    if (this.tab === 'pid') {
      list = list.filter((f) => f.page === this.page);
      if (this.page === 'rates') {
        /* The Rates screen owns these; offering them here again as raw
         * CLI steppers is how the menu and the module learned to disagree
         * the first time round. */
        list = list.filter((f) => !RATE_KEYS.has(f.key));
      }
    }
    if (this.tab === 'presets' || this.tab === 'modes') {
      return [];
    }
    const enabled = [];
    const grey = [];
    for (const f of list) {
      if (f.key.startsWith('#')) {
        grey.push(f);
        continue;
      }
      if (fieldEnabled(f)) {
        enabled.push(f);
      } else {
        grey.push(f);
      }
    }
    const page = this.tab === 'pid' ? this.page : '';
    enabled.sort((a, b) => fieldRank(a, page) - fieldRank(b, page));
    const all = enabled.concat(grey);
    if (this.onlyModified) {
      const changed = this.modifiedKeys();
      return all.filter((f) => changed.has(f.key));
    }
    return all;
  }

  fieldItem(field, tabGrey) {
    const raw = this.cliValue(field.key);
    const dynMinOn = field.key === 'gyro_lpf1_static_hz'
      && Number(this.cliValue('gyro_lpf1_dyn_min_hz')) > 0;
    const enabled = !tabGrey && fieldEnabled(field) && !dynMinOn;
    const note = fieldNote(field, this);
    const greyClass = enabled ? (field.status === STATUS.GATED ? 'row-gated' : '') : 'row-grey';
    if (!enabled) {
      return {
        label: field.key,
        /* The firmware key, unslugged, is this row's stable id. See
         * stampIds in ui.js: a key is unique in the catalog by
         * construction, and search is about to want to match on it. */
        key: field.key,
        value: formatField(field, raw),
        note,
        info: true,
        disabled: true,
        /*
         * The arrows step over this row, PageUp, PageDown, Home, End and a
         * click still land on it. The note above is the whole reason it is
         * still rendered: it says which Betaflight subsystem this build
         * leaves out and why, and that sentence is only readable when the
         * cursor can rest here. See isSkip in ui.js.
         */
        skip: !this.walkAll,
        rowClass: greyClass.trim(),
      };
    }
    const lut = field.lookup ? lookupValues(field.lookup) : null;
    if (lut && lut.length) {
      const current = lut.includes(raw) ? raw : (raw ?? lut[0]);
      return {
        label: field.key,
        key: field.key,
        note,
        value: formatField(field, current),
        current,
        options: lut.map((c) => ({ value: c, label: c })),
        pick: (v) => this.setValue(field.key, v),
        adjust: (d) => this.setValue(field.key, cycle(lut, current, d)),
        rowClass: greyClass,
      };
    }
    const { min, max } = fieldBounds(field);
    const n = Number(raw);
    const cur = Number.isFinite(n) ? n : min;
    /*
     * The simplified tuning keys draw as REAL SLIDERS, the control
     * Configurator gives them: they are the one family here whose whole
     * point is a sweep, and 0 to 200 percent is a track, not twelve arrow
     * presses. Everything else keeps the stepper; a filter cutoff is a
     * number you know, not a feel you drag toward.
     */
    if (field.key.startsWith('simplified_') && field.key !== 'simplified_pids_mode') {
      const spec = {
        cliMin: min, cliMax: max, scale: 1, decimals: 0, unit: '',
      };
      return {
        label: field.key,
        key: field.key,
        note,
        num: {
          spec, cli: cur, text: String(cur), unit: '',
        },
        range: { min, max },
        adjust: (d) => {
          this.setValue(field.key, String(clamp(cur + d, min, max)));
        },
        typed: (raw2) => {
          const t = String(raw2).trim();
          if (t === '') {
            return null;
          }
          const v = Math.round(Number(t));
          if (!Number.isFinite(v)) {
            return null;
          }
          return clamp(v, min, max);
        },
        set: (v) => {
          this.setValue(field.key, String(v));
        },
        rowClass: greyClass,
      };
    }
    /*
     * Every remaining field is a TYPED number row, the same control the
     * Rates screen earned when its lists could not hold a pilot's own
     * numbers. These were arrow steppers, and a board report made the
     * arithmetic plain: a filter cutoff spanning 1000 at one press per
     * unit is not a control, it is a punishment, and the alternative the
     * report reached for was pasting CLI, which is the one door this
     * screen does not have. The arrows stay, one firmware unit each,
     * taking the typed text as their base; the field takes the number a
     * pilot already knows. Commit is on blur or Enter, exactly as the
     * Rates screen argues.
     */
    const spec = {
      cliMin: min, cliMax: max, scale: 1, decimals: 0, unit: '',
    };
    return {
      label: field.key,
      key: field.key,
      note,
      num: {
        spec, cli: cur, text: String(cur), unit: '',
      },
      adjust: (d) => {
        this.setValue(field.key, String(clamp(cur + d, min, max)));
      },
      typed: (raw2) => {
        const t = String(raw2).trim();
        if (t === '') {
          return null;
        }
        const v = Math.round(Number(t));
        if (!Number.isFinite(v)) {
          return null;
        }
        return clamp(v, min, max);
      },
      set: (v) => {
        this.setValue(field.key, String(v));
      },
      rowClass: greyClass,
    };
  }
}

export function paintTabStrip(nav, session, onPick) {
  if (!nav.dataset.ready) {
    nav.textContent = '';
    for (const t of TABS_SHOWN) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fc-tab';
      b.dataset.id = t.id;
      b.textContent = t.label;
      b.addEventListener('click', () => onPick(t.id));
      nav.append(b);
    }
    nav.dataset.ready = '1';
  }
  for (const b of nav.children) {
    const t = TABS_SHOWN.find((x) => x.id === b.dataset.id);
    b.classList.toggle('on', session.tab === b.dataset.id);
    b.classList.toggle('grey', Boolean(t && t.grey));
  }
}

export function paintPageStrip(nav, session, onPick) {
  if (!nav) {
    return;
  }
  const show = session.tab === 'pid' && !session.confirm;
  nav.hidden = !show;
  if (!show) {
    return;
  }
  if (!nav.dataset.ready) {
    nav.textContent = '';
    for (const p of PID_PAGES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fc-page';
      b.dataset.id = p.id;
      b.textContent = p.label;
      b.addEventListener('click', () => onPick(p.id));
      nav.append(b);
    }
    nav.dataset.ready = '1';
  }
  for (const b of nav.children) {
    b.classList.toggle('on', session.page === b.dataset.id);
  }
}

/*
 * A Configurator-shaped horizon from the plant quaternion. Body-to-world,
 * z up. Not Betaflight's Three.js widget and not their assets.
 */
export function drawAttitude(canvas, q) {
  if (!canvas) {
    return;
  }
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx || w < 8 || h < 8) {
    return;
  }
  const qw = q.w;
  const qx = q.x;
  const qy = q.y;
  const qz = q.z;
  const sinr = 2 * (qw * qx + qy * qz);
  const cosr = 1 - 2 * (qx * qx + qy * qy);
  const roll = Math.atan2(sinr, cosr);
  /*
   * The sign is the whole point here. This instrument is drawn the way an
   * aviation horizon is drawn, which assumes the aerospace NED frame: x
   * forward, y RIGHT, z DOWN. The quaternion it is fed is the plant's, and
   * that frame is x forward, y LEFT, z UP, so a positive rotation about
   * body y is nose DOWN, not nose up. Negating the pitch term is the frame
   * change, and it belongs here, at the instrument, because this is a
   * drawing and not the render boundary: the one conversion physics is
   * allowed lives in src/render/frame.js. Roll reads the same both ways.
   */
  const sinp = 2 * (qz * qx - qw * qy);
  const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(sinp);
  ctx.fillStyle = '#3a81c5';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-roll);
  const y = pitch * (h / Math.PI);
  ctx.fillStyle = '#6b4a2b';
  ctx.fillRect(-w, y, w * 2, h * 2);
  ctx.strokeStyle = '#ffbb00';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-w, y);
  ctx.lineTo(w, y);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = '#ffbb00';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w * 0.2, h / 2);
  ctx.lineTo(w * 0.45, h / 2);
  ctx.moveTo(w * 0.55, h / 2);
  ctx.lineTo(w * 0.8, h / 2);
  ctx.moveTo(w / 2 - 6, h / 2);
  ctx.lineTo(w / 2 + 6, h / 2);
  ctx.stroke();
}

export function downloadCli(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'betaflight.diff';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
