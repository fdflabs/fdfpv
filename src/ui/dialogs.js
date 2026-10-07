/*
 * dialogs.js: the shell's modal dialogs, installed on Ui.prototype by
 * src/ui/ui.js so callers keep writing ui.askForm(), ui.askConfirm() and
 * so on. All of them draw into the one overlay node, ui.nameDialog:
 *
 *   askForm, askName, askRatePresetName  typed fields, resolving values
 *   askConfirm, offerYawTip              a yes or no
 *   confirmDiscard                       the "keep this report?" guard
 *   openBugReport, askBugReport          the F8 bug report
 *   maybeOfferFeel, openFeelReport,
 *   askFeelReport                        the flight feel report
 *   bugSnapshot, feelSnapshot            what a report carries about the shell
 *   closeNameDialog                      the single way out of all of them
 *
 * One overlay, not one per dialog, because three things already key off
 * it: handleKey swallows menu keys while it is shown, the music dock and
 * the chips hide under it, and accountui.js and the campaign screens open
 * their own boxes in it and close them through closeNameDialog. A second
 * overlay would need all of that twice.
 *
 * The overlay's state lives on the Ui instance: nameWait (whoever is
 * waiting on the open dialog), nameKeyHandler and nameClickHandler (the
 * listeners to take off on close), discarding (the guard's restore, while
 * the guard is up) and bugFiling (a report is open). Scripts read some of
 * these through window.__ui, so the names are part of the contract.
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

import { str } from '../strings/index.js';
import { btn, el } from './widgets.js';
import { createShotTray } from './bugshots.js';
import { clampWeight, gravityScaleFor, saveSettings, WEIGHT_MAX } from './settings.js';
import { nameRules, readPilotName, writePilotName } from '../share/pilot.js';
import { BUG_KINDS, submitBug } from '../share/bugs.js';
import { crashRecord } from '../share/crashrecord.js';
import { activeCourseSummary } from '../share/summary.js';
import {
  fullStickDeg, hoverStickPercent, normaliseRates, ratesSummary, throttleSummary,
} from '../../configs/rates.js';
import { PRESET_NAME_MAX, RATES_STORAGE_WARNING, presetNamed } from '../../configs/ratepresets.js';
import { pidsSummary } from '../../configs/pids.js';
import { tuneById } from '../../configs/registry.js';
import { cameraTiltRad } from '../render/lens.js';
/* A cycle: ui.js imports this module to install it. Read only inside
 * methods, never at load, when the binding may not exist yet. */
import { YAW_TIP_RATE } from './ui.js';

/*
 * A yes or no ignores every answer for this long after it opens. Under the
 * roughly 250 ms it takes anyone to react to something that just appeared,
 * so the only input it can eat is input already queued when it opened: the
 * rest of a click burst on the stepper that raised it.
 */
const CONFIRM_DEAF_MS = 300;

/* Clipped to what the board accepts in a report context: 8000 characters
 * over at most 32 keys, and these are the fields with no natural length. */
const HREF_CHARS = 300;
const AGENT_CHARS = 180;
const FAULT_MESSAGE_CHARS = 300;
const FAULT_STACK_CHARS = 400;
/* Where it threw is the question; the frames under that are the loop. */
const FAULT_FRAMES = 4;

const TITLE_MIN = 8;
const STORY_MIN = 20;

/* The automatic feel offer waits for the results screen to land, so a
 * record celebration is not remembered as a form in the way. */
const FEEL_OFFER_DELAY_MS = 1400;

/* What the default single field of askForm and askName is: the pilot's
 * stored name, checked and written back by share/pilot.js. */
function pilotNameSpec(extra = {}) {
  return {
    key: 'name',
    label: '',
    value: readPilotName() || '',
    maxLength: 24,
    placeholder: str('ui.name'),
    ...extra,
    rules: nameRules(),
    save: writePilotName,
  };
}

/* A form control. Only the properties given are written, because a
 * property set to a default is still a property set. */
function control(tag, className, props) {
  const node = document.createElement(tag);
  node.className = className;
  if (tag === 'input') {
    node.type = 'text';
  }
  Object.assign(node, props);
  return node;
}

const textBox = (props) => control('textarea', 'name-dialog-input name-dialog-area', props);

/* The optional "your name" field both reports end with. Prefilled, so it
 * never counts as something the pilot wrote. */
function reporterField() {
  return control('input', 'name-dialog-input', {
    maxLength: 24,
    autocomplete: 'nickname',
    value: readPilotName() || '',
    placeholder: str('ui.leave_blank_to_stay_anonymous'),
  });
}

const label = (text) => el('p', 'name-dialog-label', text);

function buttonRow(...buttons) {
  const row = el('div', 'name-dialog-row');
  row.append(...buttons);
  return row;
}

function isOpen(ui) {
  return Boolean(ui.nameDialog && !ui.nameDialog.hidden);
}

/* Put `box` on the overlay, replacing whatever was there. */
function present(ui, box) {
  ui.nameDialog.textContent = '';
  ui.nameDialog.append(box);
  ui.nameDialog.hidden = false;
}

/* Keys are caught on the way down so they never reach the menu, and the
 * backdrop is the overlay itself: a click whose target is the overlay
 * landed beside the box. closeNameDialog takes both off again. */
function holdKeys(ui, onKey) {
  ui.nameKeyHandler = onKey;
  ui.nameDialog.addEventListener('keydown', onKey, true);
}

function holdBackdrop(ui, onBackdrop) {
  ui.nameClickHandler = (e) => {
    if (e.target === ui.nameDialog) {
      onBackdrop();
    }
  };
  ui.nameDialog.addEventListener('click', ui.nameClickHandler);
}

function swallow(e) {
  e.preventDefault();
  e.stopPropagation();
}

function clip(text, n) {
  return String(text || '').slice(0, n);
}

/* The first fault main.js caught in the frame loop, if any. A frame body
 * that throws every frame freezes the picture with nothing on screen to
 * say why, so this is the one field that tells a freeze report apart. */
function frameFault() {
  try {
    const f = window.__frameFault;
    if (!f || !f.message) {
      return null;
    }
    return {
      message: clip(f.message, FAULT_MESSAGE_CHARS),
      stack: String(f.stack || '').split('\n').slice(0, FAULT_FRAMES).join(' | ').slice(0, FAULT_STACK_CHARS),
      atMs: Number(f.atMs) || 0,
    };
  } catch (e) {
    /* The page itself is what broke. The report still goes, without it. */
    return null;
  }
}

function safely(read) {
  try {
    return read();
  } catch (e) {
    return '';
  }
}

/*
 * The part both report forms share: the unsaved guard, the in-flight lock,
 * the post and the screen after it. Each form builds its own fields and
 * hands over:
 *
 *   box, send, dismiss, shots, err   the nodes this drives
 *   dirty()                          whether closing would lose something
 *   collect()                        the payload without images, or null
 *                                    once it has said what is missing
 *   doneTitle, doneText()            the screen once it is on the board
 *
 * Returns leave(after), which runs `after` through the guard.
 *
 * Nothing closes the form while the POST is in flight: a pilot who saw it
 * vanish mid send believed it was lost and sent it again. And a report on
 * the board is no longer dirty, though its detached fields still hold text.
 */
function runReport(ui, form) {
  const { box, send, dismiss, shots, err } = form;
  let posting = false;
  let landed = false;
  const close = (value) => ui.closeNameDialog(value);
  const dirty = () => !landed && form.dirty();

  const post = async () => {
    err.textContent = '';
    const fields = form.collect();
    if (!fields) {
      return;
    }
    const lock = (on) => {
      posting = on;
      send.disabled = on;
      dismiss.disabled = on;
      shots.lock(on);
      send.textContent = on ? str('ui.sending') : str('ui.send');
    };
    lock(true);
    let posted;
    try {
      posted = await submitBug({ ...fields, images: await shots.dataUrls() });
    } catch (e) {
      lock(false);
      err.textContent = e.message || str('ui.the_board_could_not_take_that');
      return;
    }
    posting = false;
    landed = true;
    const done = btn('name-dialog-btn on', str('ui.close'));
    done.addEventListener('click', () => close(posted));
    box.textContent = '';
    box.append(el('h2', null, form.doneTitle), el('p', 'lede', form.doneText(posted)), buttonRow(done));
    done.focus();
  };

  const leave = (after) => {
    if (posting || ui.discarding) {
      return;
    }
    ui.confirmDiscard(box, { dirty, submit: post, discard: after });
  };
  const dismissed = () => leave(() => close(null));

  /* Something must be waiting for closeNameDialog to see an open dialog,
   * and a report resolves nothing: the board is where it goes. */
  ui.nameWait = () => {};
  holdKeys(ui, (e) => {
    if (e.key !== 'Escape') {
      return;
    }
    swallow(e);
    if (posting) {
      return;
    }
    /* Escape while the guard asks means keep editing: the answer that
     * loses nothing. */
    if (ui.discarding) {
      ui.discarding();
      return;
    }
    dismissed();
  });
  /* A stray click beside the box is how reports got lost, so while the
   * guard is up the backdrop does nothing. */
  holdBackdrop(ui, () => {
    if (!posting && !ui.discarding) {
      dismissed();
    }
  });
  dismiss.addEventListener('click', dismissed);
  send.addEventListener('click', post);
  return leave;
}

export const dialogMethods = {
  /*
   * Typed fields, which the stick menu cannot enter. Resolves an object
   * keyed by each field's `key`, or null on Cancel, Escape or the backdrop.
   * Without `fields` it asks for the pilot's name.
   *
   * A field spec: key, label, value, maxLength (80), placeholder,
   * autocomplete ('off'), rules (a line under the label, and the error when
   * `save` refuses), save (checks and stores the raw value, returning what
   * it kept or nothing to refuse it), required (default true) and empty
   * (the error for a blank required field). A refused field keeps the
   * dialog open with the error under it; nothing is invented to fill it.
   */
  askForm({
    title, detail, confirmLabel, fields,
  } = {}) {
    if (this.nameWait) {
      this.closeNameDialog(null);
    }
    const specs = Array.isArray(fields) && fields.length ? fields : [pilotNameSpec()];
    return new Promise((resolve) => {
      this.nameWait = resolve;
      const box = el('div', 'name-dialog-box');
      box.append(el('h2', null, title || str('ui.your_name')));
      if (detail) {
        box.append(el('p', 'lede', detail));
      }
      const entries = specs.map((spec) => {
        if (spec.label) {
          box.append(label(spec.label));
        }
        if (spec.rules) {
          box.append(el('p', 'lede', spec.rules));
        }
        const input = control('input', 'name-dialog-input', {
          maxLength: spec.maxLength || 80,
          autocomplete: spec.autocomplete || 'off',
          value: spec.value || '',
          placeholder: spec.placeholder || spec.label || '',
        });
        input.dataset.key = spec.key;
        box.append(input);
        return { spec, input };
      });
      const err = el('p', 'name-dialog-err', '');
      const save = btn('name-dialog-btn on', confirmLabel || str('ui.save'));
      const cancel = btn('name-dialog-btn', str('ui.cancel'));
      box.append(err, buttonRow(save, cancel));
      present(this, box);

      const refuse = (input, message) => {
        err.textContent = message;
        input.focus();
        return null;
      };
      const values = () => {
        const out = {};
        for (const { spec, input } of entries) {
          const kept = spec.save ? spec.save(input.value) : String(input.value || '').trim();
          if (spec.save && !kept) {
            return refuse(input, spec.rules || str('ui.that_value_is_not_usable'));
          }
          if (!spec.save && !kept && spec.required !== false) {
            return refuse(input, spec.empty || str('ui.that_needs_a_name'));
          }
          out[spec.key] = kept;
        }
        return out;
      };
      const confirm = () => {
        const got = values();
        if (got) {
          this.closeNameDialog(got);
        }
      };
      const cancelled = () => this.closeNameDialog(null);

      holdKeys(this, (e) => {
        if (e.key === 'Enter') {
          swallow(e);
          confirm();
        } else if (e.key === 'Escape') {
          swallow(e);
          cancelled();
        }
      });
      save.addEventListener('click', confirm);
      cancel.addEventListener('click', cancelled);
      /* Click beside the box to cancel. A listener held and removed on
       * close, not a once listener: once is spent by the first click
       * inside the box, and it outlives a dialog closed by a button. */
      holdBackdrop(this, cancelled);
      entries[0].input.focus();
      entries[0].input.select();
    });
  },

  /*
   * Name the rate profile about to be saved. There is no inline name field,
   * so a blank name never reaches the store: askForm refuses it with the
   * `empty` line. `suggested` is the loaded preset's name when the numbers
   * match one, so saving a nudged profile replaces it (the button says so)
   * instead of growing a copy. The storage warning rides along because this
   * is when the pilot decides the profile is worth keeping, in this browser
   * only. Resolves the name or null.
   */
  async askRatePresetName(suggested = '') {
    const got = await this.askForm({
      title: str('ui.name_this_preset'),
      detail: RATES_STORAGE_WARNING,
      confirmLabel: presetNamed(suggested) ? str('app.replace') : str('ui.save'),
      fields: [{
        key: 'name',
        label: '',
        value: suggested,
        maxLength: PRESET_NAME_MAX,
        placeholder: str('ui.preset_name'),
        empty: str('ui.a_preset_needs_a_name'),
      }],
    });
    return got ? got.name : null;
  },

  /*
   * A yes or no on the shared overlay. Resolves true or false; Escape and
   * N are false, Enter and Y are true.
   *
   * There is no backdrop dismissal. These open uninvited, under the cursor
   * of a pilot who was clicking something (the camera angle stepper), and
   * the backdrop covers that spot, so the next click of the burst answered
   * no before the question was read. The deaf period covers the other
   * window sizes, where the burst lands on a button instead.
   *
   * `danger` is for a yes that cannot be undone. Then the safe button has
   * focus and the primary colour, Enter presses whichever has focus, Y is
   * no shortcut and the arrows move between the two, so deleting takes a
   * deliberate move and a press.
   */
  askConfirm({
    title, detail, yes, no, danger = false,
  }) {
    return new Promise((resolve) => {
      this.nameWait = resolve;
      const box = el('div', 'name-dialog-box');
      box.append(el('h2', null, title));
      if (detail) {
        box.append(el('p', 'lede', detail));
      }
      const yesBtn = btn(danger ? 'name-dialog-btn danger' : 'name-dialog-btn on', yes || 'Yes');
      const noBtn = btn(danger ? 'name-dialog-btn on' : 'name-dialog-btn', no || 'No');
      box.append(buttonRow(noBtn, yesBtn));
      present(this, box);

      const openedAt = performance.now();
      const answer = (value) => {
        if (performance.now() - openedAt >= CONFIRM_DEAF_MS) {
          this.closeNameDialog(value);
        }
      };
      const shortcuts = danger
        ? { Escape: false, n: false, N: false }
        : {
          Escape: false, n: false, N: false, y: true, Y: true, Enter: true,
        };
      holdKeys(this, (e) => {
        if (danger && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
          swallow(e);
          (document.activeElement === yesBtn ? noBtn : yesBtn).focus();
          return;
        }
        const value = danger && e.key === 'Enter' ? document.activeElement === yesBtn : shortcuts[e.key];
        if (value === undefined) {
          return;
        }
        swallow(e);
        answer(value);
      });
      yesBtn.addEventListener('click', () => answer(true));
      noBtn.addEventListener('click', () => answer(false));
      (danger ? noBtn : yesBtn).focus();
    });
  },

  /*
   * Raised by the camera angle stepper once per session, crossing upward
   * past the tilt where yaw rolls the horizon hard, when the yaw rate is
   * above the suggestion. Figures are this pilot's, in deg/s at full stick
   * as the Rates screen draws them. Yes sets yaw's Max rate, which on the
   * Actual and Quick systems (the only ones the stepper offers this on) is
   * srate in tens of deg/s.
   */
  offerYawTip() {
    const s = this.settings;
    this.yawTipAsked = true;
    const tilt = Math.sin(cameraTiltRad(s.cameraAngle));
    const yawNow = fullStickDeg(s.rates, 'yaw');
    this.askConfirm({
      title: str('ui.yaw_will_roll_the_horizon'),
      detail: str('ui.at_degrees_of_tilt_percent_of', {
        cameraAngle: s.cameraAngle,
        pct: Math.round(tilt * 100),
        now: Math.round(yawNow * tilt),
        yawNow,
        YAW_TIP_RATE,
        then: Math.round(YAW_TIP_RATE * tilt),
      }),
      yes: str('ui.set_yaw_to', { YAW_TIP_RATE }),
      no: str('ui.leave_it_at', { yawNow }),
    }).then((ok) => {
      if (!ok) {
        return;
      }
      this.settings.rates.yaw.srate = YAW_TIP_RATE / 10;
      saveSettings(this.settings);
      this.renderMenu();
      if (this.onSettings) {
        this.onSettings(this.settings);
      }
    });
  },

  /* The pilot's name, for posted times and published tracks. Resolves the
   * stored name, or null if they cancel. */
  async askName({ title, detail } = {}) {
    const got = await this.askForm({
      title: title || str('ui.your_name'),
      detail: detail || str('ui.posted_times_and_published_tracks_carry'),
      confirmLabel: str('ui.save'),
      fields: [pilotNameSpec({ autocomplete: 'nickname' })],
    });
    return got ? got.name : null;
  },

  /*
   * The guard in front of closing a report form. Escape, Cancel and above
   * all a missed click on the backdrop used to throw away a typed report
   * without a word, and a pilot retyped one several times before working
   * out what ate it.
   *
   * An untouched form (dirty() false) closes at once through discard(): a
   * guard that asks about nothing teaches people to click through guards.
   * Otherwise the form is hidden, not rebuilt, so every field and the caret
   * survive, and a panel asks: Send it (back to the form, then submit, so a
   * draft that fails validation shows the form's own error), Keep editing
   * (back to the form), Discard (the one path that loses anything).
   * ui.discarding holds the way back while the panel is up.
   *
   * Returns true when it asked.
   */
  confirmDiscard(box, { dirty, submit, discard }) {
    if (!dirty()) {
      discard();
      return false;
    }
    const sendIt = btn('name-dialog-btn on', str('ui.send_it'));
    const keep = btn('name-dialog-btn', str('ui.keep_editing'));
    const drop = btn('name-dialog-btn danger', str('ui.discard'));
    const panel = el('div', 'name-dialog-box bug');
    panel.append(
      el('h2', null, str('ui.keep_this_report')),
      el('p', 'lede', str('ui.you_have_written_something_that_has')),
      buttonRow(sendIt, keep, drop),
    );
    const backToForm = () => {
      panel.remove();
      box.style.display = '';
      this.discarding = null;
    };
    sendIt.addEventListener('click', () => {
      backToForm();
      submit();
    });
    keep.addEventListener('click', backToForm);
    drop.addEventListener('click', () => {
      this.discarding = null;
      discard();
    });
    this.discarding = backToForm;
    box.style.display = 'none';
    this.nameDialog.append(panel);
    keep.focus();
    return true;
  },

  /*
   * Close whatever the overlay holds and hand `value` to whoever waits on
   * it. Every dialog here, and the ones accountui.js and the campaign
   * screens open, leaves through this, so the listeners, the guard and the
   * report flag cannot outlive the dialog that set them.
   */
  closeNameDialog(value) {
    const overlay = this.nameDialog;
    if (this.nameKeyHandler) {
      overlay.removeEventListener('keydown', this.nameKeyHandler, true);
      this.nameKeyHandler = null;
    }
    if (this.nameClickHandler) {
      overlay.removeEventListener('click', this.nameClickHandler);
      this.nameClickHandler = null;
    }
    overlay.hidden = true;
    overlay.textContent = '';
    this.discarding = null;
    this.bugFiling = false;
    const waiting = this.nameWait;
    this.nameWait = null;
    if (waiting) {
      waiting(value);
    }
    this.syncChips();
    this.renderMenu();
  },

  /*
   * What a bug report says about the shell besides the pilot's words. Each
   * field is here because a report arrived without it and could not be read:
   * the rate profile and throttle curve for "cannot set my rates" and
   * "throttle is touchy"; the weight slider and the gravity multiple it
   * makes on this airframe (the base has moved once, so both); how the
   * sticks arrive (stickProbe: a keyboard, a radio and two thumbs had all
   * been filed as one quad's feel); a frame fault and the last crash or page
   * errors, noted when they happened because by F8 the wreck is reset.
   * `fault` and `crash` are present only when there is one.
   */
  bugSnapshot() {
    const s = this.settings || {};
    const seat = s.map === 'track' ? activeCourseSummary() : null;
    const gpu = this.gpuInfo || {};
    const fault = frameFault();
    const crash = crashRecord.report();
    const rates = s.rates || {};
    return {
      href: safely(() => clip(window.location.href, HREF_CHARS)),
      screen: this.screen,
      map: s.map || '',
      ...(fault && { fault }),
      ...(crash && { crash }),
      courseId: (seat && (seat.shareId || (seat.doc && seat.doc.id))) || '',
      courseName: (seat && seat.name) || '',
      flightMode: s.flightMode || '',
      rates: ratesSummary(rates),
      throttle: throttleSummary(rates, s.airframe),
      weight: clampWeight(s.weight),
      gravityScale: gravityScaleFor(s.weight, s.airframe),
      stick: this.stickProbe ? this.stickProbe() : null,
      graphics: s.graphics || '',
      cameraAngle: s.cameraAngle,
      cameraFov: s.cameraFov,
      packVoltage: s.packVoltage,
      link: s.link || '',
      gpu: gpu.display || gpu.name || '',
      userAgent: safely(() => clip(navigator.userAgent, AGENT_CHARS)),
      viewport: {
        w: window.innerWidth || 0,
        h: window.innerHeight || 0,
        dpr: window.devicePixelRatio || 1,
      },
    };
  },

  /* F8 and the Report bug chip. The snapshot is taken before pausing, so a
   * report from the air says screen: flight; then pause, so typing does
   * not fly the quad. */
  openBugReport() {
    if (this.bugFiling || isOpen(this)) {
      return;
    }
    this.bugFiling = true;
    const context = this.bugSnapshot();
    if (this.screen === 'flight') {
      this.act('pause');
      this.show('paused');
    }
    this.askBugReport(context);
  },

  askBugReport(context) {
    if (this.nameWait) {
      this.closeNameDialog(null);
    }
    const crash = context && context.crash;
    const fault = context && context.fault;
    const pageErrors = crash && crash.errors;
    /* A page error or frame fault opens on Crash or freeze. An aircraft
     * crash does not: a wreck is the game working, and the report after one
     * is usually about how it flew. */
    const broke = Boolean(fault || pageErrors);

    const box = el('div', 'name-dialog-box bug');
    /* A pilot who came to say how it flies goes to the feel form, which
     * asks that, instead of filing an opinion as a defect. */
    const toFeel = btn('name-dialog-door', str('ui.just_here_to_say_how_it'));
    box.append(
      el('h2', null, str('ui.report_a_bug')),
      el('p', 'lede', str('ui.title_and_what_happened_are_enough')),
      toFeel,
    );
    /* Said on the form because the pause menu covers the wreck and the
     * pilot reads that as the crash being gone from the report too. */
    if (crash && crash.craft) {
      box.append(el('p', 'lede', str('ui.bug_crash_attached', { age: Math.round(crash.craft.ageS) })));
    }
    if (broke) {
      const message = fault ? fault.message : pageErrors[pageErrors.length - 1].message;
      box.append(el('p', 'lede', str('ui.bug_error_attached', { message })));
    }

    const kind = control('select', 'name-dialog-input', {});
    const startKind = broke ? 'crash' : 'wrong';
    for (const { id, label: text } of BUG_KINDS) {
      const option = el('option', null, text);
      option.value = id;
      if (id === startKind) {
        option.selected = true;
      }
      kind.append(option);
    }
    const title = control('input', 'name-dialog-input', {
      maxLength: 120,
      placeholder: str('ui.short_specific'),
      autocomplete: 'off',
    });
    const what = textBox({ maxLength: 4000, rows: 4, placeholder: str('ui.what_you_saw_heard_or_could') });
    const expected = textBox({ maxLength: 2000, rows: 2 });
    const steps = textBox({ maxLength: 2000, rows: 2 });
    const reporter = reporterField();
    /* The tray listens on the whole box, so a paste into a field counts. */
    const shots = createShotTray(box);
    const err = el('p', 'name-dialog-err', '');
    const send = btn('name-dialog-btn on', str('ui.send'));
    const cancel = btn('name-dialog-btn', str('ui.cancel'));
    box.append(
      label(str('ui.kind')), kind,
      label(str('ui.title')), title,
      label(str('ui.what_happened')), what,
      label(str('ui.what_you_expected_optional')), expected,
      label(str('ui.how_to_reproduce_optional')), steps,
      label(str('ui.shots_label')), shots.node,
      label(str('ui.your_name_optional')), reporter,
      err, buttonRow(send, cancel),
    );
    present(this, box);
    this.syncChips();

    const tooShort = (field, min, message) => {
      if (field.value.trim().length >= min) {
        return false;
      }
      err.textContent = message;
      field.focus();
      return true;
    };
    const leave = runReport(this, {
      box,
      send,
      dismiss: cancel,
      shots,
      err,
      /* The name is prefilled, so it is not something written. */
      dirty: () => Boolean([title, what, expected, steps].some((f) => f.value.trim()) || shots.count()),
      collect: () => {
        if (tooShort(title, TITLE_MIN, str('ui.a_title_needs_at_least_eight'))
          || tooShort(what, STORY_MIN, str('ui.say_what_happened_at_least_a'))) {
          return null;
        }
        return {
          kind: kind.value,
          title: title.value,
          what: what.value,
          expected: expected.value,
          steps: steps.value,
          reporter: reporter.value,
          context,
        };
      },
      doneTitle: str('ui.sent'),
      doneText: (posted) => str('ui.ticket_is_on_the_board_thanks', { id: posted.id }),
    });
    toFeel.addEventListener('click', () => {
      leave(() => {
        this.closeNameDialog(null);
        this.openFeelReport();
      });
    });
    title.focus();
  },

  /*
   * A bug snapshot plus what the tune work reads off a feel report: the
   * tune flown, the pilot's PID edits, the PIDs the module actually ran
   * (the readback, not the menu) and the best lap if there was a race.
   */
  feelSnapshot() {
    const s = this.settings || {};
    return {
      ...this.bugSnapshot(),
      tune: s.tune || '',
      tuneName: tuneById(s.tune).name,
      pids: pidsSummary(s.pids, s.tune),
      pidsLive: this.pidsLive,
      bestLapMs: Number.isFinite(this.resultsFastest) ? this.resultsFastest : null,
    };
  },

  /*
   * Called by showResults. The feel question asks itself once ever, after
   * the first finished race; from then on it is a row on Results and the
   * pause menu, because a prompt that keeps returning gets closed unread.
   */
  maybeOfferFeel() {
    if (this.settings.feelAsked) {
      return;
    }
    setTimeout(() => {
      const stillWanted = !this.settings.feelAsked && this.screen === 'results';
      if (stillWanted && !this.bugFiling && !isOpen(this)) {
        this.openFeelReport();
      }
    }, FEEL_OFFER_DELAY_MS);
  },

  /* Opening it on either path counts as asked. No pause step as in
   * openBugReport: this is only reachable from the paused and results
   * menus. */
  openFeelReport() {
    if (this.bugFiling || isOpen(this)) {
      return;
    }
    if (!this.settings.feelAsked) {
      this.settings.feelAsked = true;
      saveSettings(this.settings);
    }
    this.askFeelReport(this.feelSnapshot());
  },

  askFeelReport(context) {
    if (this.nameWait) {
      this.closeNameDialog(null);
    }
    const feels = [
      ['floppy', 'ui.floppy'],
      ['soft', 'ui.soft'],
      ['right', 'ui.about_right'],
      ['stiff', 'ui.stiff'],
      ['twitchy', 'ui.twitchy'],
    ].map(([id, key]) => ({ id, label: str(key) }));
    /* Floaty has its own chip because it kept arriving typed under "about
     * right", where nothing could answer it. */
    const issues = [
      ['sluggish', 'ui.slow_to_answer_the_stick'],
      ['bounce', 'ui.bounces_back_after_a_stop'],
      ['propwash', 'ui.wobbles_in_propwash'],
      ['drift', 'ui.drifts_off_attitude'],
      ['yaw', 'ui.yaw_is_lazy'],
      ['throttle', 'ui.throttle_is_touchy'],
      ['floaty', 'ui.floaty_carries_too_far'],
      ['locked', 'ui.locked_in_no_complaints'],
    ].map(([id, key]) => ({ id, label: str(key) }));

    let feel = null;
    const noticed = new Set();
    const chipsFor = (options, onPick) => {
      const wrap = el('div', 'feel-chips');
      const chips = options.map((option) => {
        const chip = btn('feel-chip', option.label);
        chip.addEventListener('click', () => onPick(option.id));
        wrap.append(chip);
        return { id: option.id, chip };
      });
      return { wrap, chips };
    };
    const feelChips = chipsFor(feels, (id) => {
      feel = feel === id ? null : id;
      for (const c of feelChips.chips) {
        c.chip.classList.toggle('on', c.id === feel);
      }
    });

    /*
     * Two complaints this shell can answer on the spot, each with a line
     * offered when its chip is ticked, and only while the setting it names
     * would still change something: a throttle already capped, or weight
     * already at the top of its range, is a complaint about something else
     * (or about the default), and the report says so better undisturbed.
     * The report sends either way.
     */
    const s = this.settings;
    const hints = [
      {
        node: el('p', 'lede feel-hint', ''),
        text: () => {
          const cap = normaliseRates(s.rates || {}).throttleCap;
          if (!(noticed.has('throttle') && cap >= 100)) {
            return null;
          }
          return str('ui.this_quad_hovers_at_percent_of', {
            now: hoverStickPercent(100, s.airframe).toFixed(1),
            eased: hoverStickPercent(75, s.airframe).toFixed(1),
          });
        },
      },
      {
        node: el('p', 'lede feel-hint', ''),
        text: () => {
          const weight = clampWeight(s.weight);
          if (!(noticed.has('floaty') && weight < WEIGHT_MAX)) {
            return null;
          }
          return str('ui.the_weight_slider_between_the_sticks', { weight });
        },
      },
    ];
    const refreshHints = () => {
      for (const hint of hints) {
        const text = hint.text();
        hint.node.hidden = text === null;
        if (text !== null) {
          hint.node.textContent = text;
        }
      }
    };
    for (const hint of hints) {
      hint.node.hidden = true;
    }
    const issueChips = chipsFor(issues, (id) => {
      if (!noticed.delete(id)) {
        noticed.add(id);
      }
      issueChips.chips.find((c) => c.id === id).chip.classList.toggle('on', noticed.has(id));
      refreshHints();
    });

    const words = textBox({ maxLength: 2000, rows: 3, placeholder: str('ui.what_you_would_tell_the_person') });
    const reporter = reporterField();
    const box = el('div', 'name-dialog-box bug feel');
    const shots = createShotTray(box);
    const err = el('p', 'name-dialog-err', '');
    const send = btn('name-dialog-btn on', str('ui.send'));
    const notNow = btn('name-dialog-btn', str('ui.not_now'));
    box.append(
      el('h2', null, str('ui.how_does_it_fly')),
      el('p', 'lede', str('ui.one_honest_word_steers_the_tune', { tuneName: context.tuneName })),
      label(str('ui.the_quad_felt')), feelChips.wrap,
      label(str('ui.anything_specific_pick_any')), issueChips.wrap,
      ...hints.map((h) => h.node),
      label(str('ui.in_your_own_words_optional')), words,
      label(str('ui.shots_label')), shots.node,
      label(str('ui.your_name_optional')), reporter,
      err, buttonRow(send, notNow),
    );
    present(this, box);
    this.syncChips();

    runReport(this, {
      box,
      send,
      dismiss: notNow,
      shots,
      err,
      /* Meant to be answered in two clicks, so two clicks are worth
       * guarding. The prefilled name is not. */
      dirty: () => Boolean(feel || noticed.size || words.value.trim() || shots.count()),
      collect: () => {
        if (!feel) {
          err.textContent = str('ui.pick_a_word_on_the_first');
          return null;
        }
        const feelLabel = feels.find((f) => f.id === feel).label.toLowerCase();
        const picked = issues.filter((i) => noticed.has(i.id)).map((i) => i.label.toLowerCase());
        /* The weight slider goes in the sentence as well as the context:
         * "floaty at 100" judges the default, "floaty at 140" the range. */
        const lines = [
          str('ui.the_quad_felt_this_run', { feelLabel }),
          str('ui.weight_slider_at_percent_which_is', { weight: context.weight, v2: context.gravityScale.toFixed(2) }),
          picked.length ? str('ui.noticed', { v1: picked.join('; ') }) : '',
          words.value.trim(),
        ].filter(Boolean);
        return {
          kind: 'feel',
          title: str('ui.flight_feel_2', { feelLabel, v2: picked.length ? `, ${picked[0]}` : '' }),
          what: lines.join('\n'),
          reporter: reporter.value,
          context,
        };
      },
      doneTitle: str('ui.thanks'),
      doneText: () => str('ui.landed_with_your_tune_and_rates'),
    });
    /* Keyboard first like every menu: the first word has focus, Tab walks
     * the rest. handleKey keeps Enter from reaching the menu below. */
    feelChips.chips[0].chip.focus();
  },
};
