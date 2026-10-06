/*
 * mouse.js: the mouse as a right-hand gimbal and the wheel as a throttle.
 *
 * Moving the mouse moves a stick (x is roll, y is pitch) and that stick is
 * what the flight controller reads, exactly as from a radio. It is not an
 * aim point: nothing flies the craft toward a cursor.
 *
 * The stick either springs back to centre or holds where it was left.
 * Springing suits a quad in Acro, where a centred stick holds attitude and
 * moving the mouse is turning; holding suits Angle and every plane, where
 * a bank is a stick held over and a spring would roll it straight back
 * out. 'auto' chooses from the craft, and the pilot can pin either. The
 * middle button, or Z, recentres a held stick.
 *
 * The wheel holds its throttle on every craft. One notch is one step:
 * fine on a quad, which lives near a hover point, coarser on a plane,
 * which flies on a power setting. Pulling the mouse toward you is pulling
 * the stick back, nose up, unless the pilot inverts it. The two side
 * buttons stand in for the rudder keys.
 *
 * The window listeners exist only while mouse flight is switched on, so a
 * pilot who never picks it has no wheel handler near any menu.
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

/* The Settings rows, in the order they are offered. */
export const MOUSE_SENS = [50, 75, 100, 150, 200, 300];
export const MOUSE_EXPOS = [0, 25, 50, 75];
export const MOUSE_CENTRES = ['auto', 'spring', 'hold'];
/* Held down, recentres the stick: the middle button's keyboard twin. */
export const MOUSE_CENTRE_KEY = 'KeyZ';

/* Counts of mouse travel for full stick at 100 percent sensitivity. */
const COUNTS_FOR_FULL = 300;
/* The spring's time constant: a steady 1500 counts a second sits near half
 * stick, and a let-go stick is home within a quarter second. */
const SPRING_TAU_MS = 90;
/* Below this the spring snaps to zero, or an exponential that never quite
 * arrives would emit a fresh sample every poll. */
const SPRING_SNAP = 1e-3;
/* One notch in the pixels a browser reports (100 on Windows Chrome, 120 or
 * 53 elsewhere). An event of at least NOTCH_MIN_PX is a physical wheel and
 * counts as whole notches, at least one; smaller deltas are a trackpad and
 * add up until they make a notch. Lines and pages are turned into pixels
 * first. */
const NOTCH_PX = 100;
const NOTCH_MIN_PX = 40;
const pxPerUnit = (mode) => (mode === 1 ? NOTCH_PX / 3 : mode === 2 ? NOTCH_PX : 1);
const QUAD_STEP = 0.02;
const WING_STEP = 0.05;

const fromList = (list, v, fallback) => (list.includes(v) ? v : fallback);
const unit = (v) => Math.max(-1, Math.min(1, v));

/* Expo as a cubic blend: 0 is linear, 1 all cubic. */
function shaped(v, expo) {
  return v * (1 - expo) + v * v * v * expo;
}

export class MouseStick {
  constructor() {
    this.enabled = false;
    this.live = false;
    this.cfg = {
      sens: 100, expo: 0, invert: false, centre: 'auto',
    };
    this.craft = { wing: false, rates: true };
    this.stick = { x: 0, y: 0, thr: 0, acc: 0 };
    /* Key codes the buttons are holding down, read like held keys. */
    this.buttonKeys = new Set();
    this.handlers = null;
  }

  zero() {
    this.stick = { x: 0, y: 0, thr: 0, acc: 0 };
  }

  setLive(live) {
    this.live = Boolean(live);
    if (!this.live) {
      /* A pause must not hold rudder on through the menu. */
      this.buttonKeys.clear();
    }
  }

  /*
   * The Settings values, each checked against its list. Turning mouse
   * flight on or off also starts the stick from centre, drops the live
   * flag until the shell grants it again, and adds or removes the window
   * listeners, which call back into `owner`.
   */
  configure({
    enabled, sens, expo, invert, centre,
  }, owner) {
    this.cfg = {
      sens: fromList(MOUSE_SENS, sens, 100),
      expo: fromList(MOUSE_EXPOS, expo, 0),
      invert: Boolean(invert),
      centre: fromList(MOUSE_CENTRES, centre, 'auto'),
    };
    const on = Boolean(enabled);
    if (on === this.enabled) {
      return;
    }
    this.enabled = on;
    this.zero();
    this.setLive(false);
    if (!on) {
      for (const [type, fn, opts] of this.handlers || []) {
        window.removeEventListener(type, fn, opts);
      }
      this.handlers = null;
      return;
    }
    const whileLive = (fn) => (e) => {
      if (this.live) {
        e.preventDefault();
        fn(e);
      }
    };
    this.handlers = [
      ['mousemove', (e) => owner.mouseMove(e.movementX || 0, e.movementY || 0)],
      ['wheel', whileLive((e) => owner.mouseWheel(e.deltaY, e.deltaMode)), { passive: false }],
      ['mousedown', (e) => owner.mouseButton(e.button, true)],
      ['mouseup', (e) => owner.mouseButton(e.button, false)],
      /* The right button is rudder here, not a menu. */
      ['contextmenu', whileLive(() => {})],
    ];
    for (const [type, fn, opts] of this.handlers) {
      window.addEventListener(type, fn, opts);
    }
  }

  setCraft(wing, rates) {
    this.craft = { wing: Boolean(wing), rates: Boolean(rates) };
  }

  /* 'spring' or 'hold'. A quad on rates springs; Angle and planes hold. */
  centring() {
    if (this.cfg.centre !== 'auto') {
      return this.cfg.centre;
    }
    return this.craft.rates && !this.craft.wing ? 'spring' : 'hold';
  }

  throttleStep() {
    return this.craft.wing ? WING_STEP : QUAD_STEP;
  }

  move(dx, dy) {
    if (!this.live) {
      return;
    }
    const perCount = this.cfg.sens / 100 / COUNTS_FOR_FULL;
    const pull = this.cfg.invert ? -1 : 1;
    this.stick.x = unit(this.stick.x + dx * perCount);
    this.stick.y = unit(this.stick.y + dy * perCount * pull);
  }

  /* Scrolling up is more throttle. */
  wheel(deltaY, deltaMode) {
    if (!this.live || !Number.isFinite(deltaY) || deltaY === 0) {
      return;
    }
    const px = deltaY * pxPerUnit(deltaMode);
    const s = this.stick;
    let notches;
    if (Math.abs(px) >= NOTCH_MIN_PX) {
      notches = Math.sign(px) * Math.max(1, Math.round(Math.abs(px) / NOTCH_PX));
      s.acc = 0;
    } else {
      s.acc += px;
      notches = Math.trunc(s.acc / NOTCH_PX);
      s.acc -= notches * NOTCH_PX;
    }
    const step = this.throttleStep();
    s.thr = Math.max(0, Math.min(1, (Math.round(s.thr / step) - notches) * step));
  }

  /* Middle recentres; left and right hold the rudder keys in `yawKeys`
   * ([negative, positive]). Other buttons are not the stick's. */
  button(button, down, yawKeys) {
    if (!this.live) {
      return;
    }
    if (button === 1) {
      if (down) {
        this.stick.x = 0;
        this.stick.y = 0;
      }
      return;
    }
    const code = { 0: yawKeys[0], 2: yawKeys[1] }[button];
    if (code === undefined) {
      return;
    }
    if (down) {
      this.buttonKeys.add(code);
    } else {
      this.buttonKeys.delete(code);
    }
  }

  /* The stick after `dtMs` of spring, if it springs, recentred while the
   * centre key is held. Returns roll and pitch with expo applied. */
  settle(dtMs, centreHeld) {
    const s = this.stick;
    if (this.centring() === 'spring') {
      const decay = Math.exp(-dtMs / SPRING_TAU_MS);
      const x = s.x * decay;
      const y = s.y * decay;
      s.x = Math.abs(x) < SPRING_SNAP ? 0 : x;
      s.y = Math.abs(y) < SPRING_SNAP ? 0 : y;
    }
    if (centreHeld) {
      s.x = 0;
      s.y = 0;
    }
  }

  shapedStick() {
    const expo = this.cfg.expo / 100;
    return { roll: shaped(this.stick.x, expo), pitch: shaped(this.stick.y, expo) };
  }
}
