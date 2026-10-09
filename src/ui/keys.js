/*
 * keys.js: where a key press, a gamepad poll and the in flight swap
 * buttons go. Installed on Ui.prototype (see the end of ui.js), so `this`
 * is the shell. These methods decide and route; what a move, a select or
 * a back does is the shell's other methods.
 *
 * handleKey returns true when the shell took the key, so main.js does not
 * also hand it to flight. Gamepads and radios are polled every frame as
 * levels and acted on at the edge, the poll a button first reads held.
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

/* Keys by what they mean, the arrows and WASD alike. */
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const OK = new Set(['Enter', 'Space']);
const LEAVE = new Set(['Escape', 'Backspace']);
const isArrow = (code) => UP.has(code) || DOWN.has(code) || LEFT.has(code) || RIGHT.has(code);

/* The calibration screen's keys, each with the condition the screen
 * sets for it, its sound and its action. The first that applies wins;
 * Enter saves when it can and skips otherwise. */
const CALIBRATION_KEYS = [
  { keys: OK, when: 'calCanSave', sound: 'select', action: 'calibrate-save' },
  { keys: new Set(['KeyT']), when: 'calCanZeroThrottle', sound: 'select', action: 'calibrate-zero-throttle' },
  { keys: new Set(['KeyR']), when: 'calCanReverse', sound: 'select', action: 'calibrate-reverse' },
  { keys: new Set(['KeyM']), when: 'calOnConfirm', sound: 'adjust', action: 'calibrate-stick-mode' },
  { keys: OK, when: 'calCanSkip', sound: 'select', action: 'calibrate-skip' },
];

/* Menu keys that only step the cursor. */
const CURSOR_KEYS = {
  PageUp: (ui) => ui.pageMove(-1),
  PageDown: (ui) => ui.pageMove(1),
  Home: (ui) => ui.jumpEdge(-1),
  End: (ui) => ui.jumpEdge(1),
};

/* Screens where a pad's directions are left to the radio's hold to
 * press (src/input/menus.js) and only A and B are read here. The title
 * counts once the gate is passed. */
const AB_ONLY = new Set(['quad', 'rates', 'pids', 'fc']);

const PAD_KEYS = ['up', 'down', 'left', 'right', 'select', 'back'];
const released = () => Object.fromEntries(PAD_KEYS.map((k) => [k, false]));

/* In flight the shell takes only pause and the build swap; everything
 * else is flying. */
function flightKey(ui, code) {
  if (code === 'Escape') {
    ui.act('pause');
    ui.show('paused');
    return true;
  }
  if (code === 'Tab') {
    ui.openSwap('flight');
    return true;
  }
  if (code === 'BracketLeft' || code === 'BracketRight') {
    ui.cycleSwap(code === 'BracketRight' ? 1 : -1);
    return true;
  }
  return false;
}

/* Start pauses a flight and resumes the pause menu, on its press. */
function startPress(ui, down) {
  const was = ui.padStartPrev;
  ui.padStartPrev = down;
  if (!down || was) return false;
  if (ui.screen === 'flight') {
    ui.lastInput = 'pad';
    flightKey(ui, 'Escape');
    return true;
  }
  if (ui.screen === 'paused') {
    ui.lastInput = 'pad';
    ui.act('resume');
    return true;
  }
  return false;
}

function calibrationKey(ui, code) {
  if (LEAVE.has(code)) {
    ui.back();
    return;
  }
  const hit = CALIBRATION_KEYS.find((k) => k.keys.has(code) && ui[k.when]);
  if (!hit) return;
  ui.onUiSound?.(hit.sound);
  ui.act(hit.action);
}

/* An open drop-down takes the vertical arrows, Enter and leave; any
 * other key falls through to the menu. */
function dropKey(ui, code) {
  if (UP.has(code)) ui.moveDrop(-1);
  else if (DOWN.has(code)) ui.moveDrop(1);
  else if (OK.has(code)) ui.confirmDrop();
  else if (LEAVE.has(code)) ui.back();
  else return false;
  return true;
}

function menuKey(ui, code) {
  if (UP.has(code) || DOWN.has(code)) {
    ui.move(UP.has(code) ? -1 : 1);
    return;
  }
  if (LEFT.has(code) || RIGHT.has(code)) {
    /* Sideways moves between cards on a card screen and changes the
     * value of a row anywhere else. */
    const dir = LEFT.has(code) ? -1 : 1;
    if (ui.cardScreen()) ui.move(dir);
    else ui.adjust(dir);
    return;
  }
  if (code === 'Slash' && ui.screen === 'fc' && !ui.fc.confirm) {
    openBenchSearch(ui);
    return;
  }
  if (CURSOR_KEYS[code]) {
    CURSOR_KEYS[code](ui);
    return;
  }
  if (OK.has(code)) ui.select();
  else if (LEAVE.has(code)) ui.back();
}

/* Slash starts typing a search on the bench; pressed again it does
 * nothing, so the caret stays where the pilot left it. */
function openBenchSearch(ui) {
  if (ui.fc.search != null) return;
  ui.fc.search = '';
  ui.renderMenu();
  ui.setCursor(ui.firstStop(ui.items(), ui.rowOffset));
  ui.searchCaret = 0;
  ui.restoreSearchCaret();
}

export const keyMethods = {
  handleKey(code, repeat = false) {
    this.noteInteraction();
    /* A text field is open: typing is for it. */
    if (this.nameDialog && !this.nameDialog.hidden) return true;

    /* Held keys repeat only as navigation; a repeated Enter or Escape
     * would press twice. */
    const arrow = isArrow(code);
    for (const overlay of [this.hangar, this.carousel]) {
      if (overlay.isOpen) return repeat && !arrow ? true : overlay.handleKey(code);
    }
    if (repeat && !arrow) return this.screen !== 'flight';

    if (code === 'F8') {
      this.openBugReport();
      return true;
    }
    if (this.screen === 'flight') return flightKey(this, code);
    if (this.screen === 'walk') return this.walkKey(code);
    if (this.screen === 'calibrate') {
      calibrationKey(this, code);
      return true;
    }
    if (this.screen === 'padpick') {
      if (LEAVE.has(code)) {
        this.back();
      } else if (OK.has(code) && this.padPickPhase === 'confirm') {
        this.onUiSound?.('select');
        this.act('padpick-yes');
      }
      return true;
    }
    if (this.dropEl && dropKey(this, code)) return true;

    this.lastInput = 'key';
    menuKey(this, code);
    return true;
  },

  /* The open, previous and next buttons of the build swap in flight. The
   * first poll only learns what is held. */
  pollFlightPad(b) {
    const now = { open: Boolean(b && b.open), prev: Boolean(b && b.prev), next: Boolean(b && b.next) };
    const was = this.swapPadPrev;
    this.swapPadPrev = now;
    if (!was || this.screen !== 'flight') return;
    if (now.open && !was.open) {
      this.lastInput = 'pad';
      this.openSwap('flight');
    } else if (now.prev && !was.prev) {
      this.cycleSwap(-1);
    } else if (now.next && !was.next) {
      this.cycleSwap(1);
    }
  },

  pollPad(nav) {
    if (startPress(this, Boolean(nav.start))) return;
    const anyHeld = PAD_KEYS.some((k) => nav[k]);
    /* The hangar and the picker read the pad themselves. Leaving them,
     * the next poll only learns what is still held, so the press that
     * closed one does not also press the menu under it. */
    for (const overlay of [this.hangar, this.carousel]) {
      if (!overlay.isOpen) continue;
      if (anyHeld) this.lastInput = 'pad';
      overlay.pollPad(nav);
      this.padRearm = true;
      return;
    }
    if (this.screen === 'flight') {
      this.padPrev = released();
      return;
    }
    if (anyHeld) this.lastInput = 'pad';
    const now = Object.fromEntries(PAD_KEYS.map((k) => [k, Boolean(nav[k])]));
    /* The walk reads the pad's directions held, as it reads the keys. */
    if (this.walk) {
      this.walk.pad = now;
    }
    const was = this.padPrev;
    const pressed = (k) => now[k] && !was[k];
    const done = () => { this.padPrev = now; };

    if (this.padRearm) {
      this.padRearm = false;
      done();
      return;
    }
    if ((this.nameDialog && !this.nameDialog.hidden) || this.screen === 'padpick') {
      done();
      return;
    }
    if (this.screen === 'calibrate') {
      if (pressed('back')) this.act('calibrate-cancel');
      if (pressed('select') && this.calCanSave) this.act('calibrate-save');
      done();
      return;
    }
    if (AB_ONLY.has(this.screen) || (this.screen === 'title' && !this.onGate())) {
      if (pressed('select')) this.select();
      if (pressed('back')) this.back();
      done();
      return;
    }
    const row = this.items()[this.cursor];
    /* Sideways on a value row changes it; on anything else right goes in
     * and left goes back, like A and B. */
    const sidewaysAdjusts = Boolean(row && row.adjust) && !this.cardScreen();
    if (this.dropEl) {
      if (pressed('up')) this.moveDrop(-1);
      if (pressed('down')) this.moveDrop(1);
      if (pressed('right') || pressed('select')) this.confirmDrop();
      if (pressed('left') || pressed('back')) {
        this.closeDrop();
        this.onUiSound?.('back');
      }
      done();
      return;
    }
    if (pressed('up')) this.move(-1);
    if (pressed('down')) this.move(1);
    if (pressed('right')) {
      if (sidewaysAdjusts) this.adjust(1);
      else this.select();
    }
    if (pressed('left')) {
      if (sidewaysAdjusts) this.adjust(-1);
      else this.back();
    }
    if (pressed('select')) this.select();
    if (pressed('back')) this.back();
    done();
  },
};
