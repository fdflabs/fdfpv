/*
 * opshud.js: the quiet HUD of an ops mission (docs/campaign/interior/
 * TECH-NEEDS.md N7), over the camera ball's picture. A HUD mode of its
 * own, not a tuning of the war's: the war wants its enemies very obvious,
 * an ops mission the opposite, so nothing here marks what the room has
 * not told the squad.
 *
 * WHAT IT DRAWS. The centre cross and the survey box (the capture's cuts:
 * inside the inner brackets a framed item is centred enough to grade
 * clean, inside the outer ones usable, CONTRACT-P0.md 7); the ball's
 * zoom, gimbal angles and lock; the sensor's mode; and the capture's
 * word: what a still would grade before the press, for an item the HUD
 * may name, and what the room made of it after.
 *
 * IT DRAWS STATE AND COMPUTES NONE: every number comes from the ball
 * (src/avionics/camball.js), the sensor (src/avionics/sensors.js) and the
 * capture scorer (src/avionics/capture.js). Campaign agnostic: words are
 * string keys, items are named by the mission's own keys.
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

import { str } from '../strings/index.js';
import { CUTS } from '../share/ops/capture.js';

const HUD_HZ = 30;
const MAX_DPR = 3;
const DEG = 180 / Math.PI;
/* How long a capture's word and a notice stay, ms. */
const SAY_MS = 2600;

/* Ink: a pale, quiet white for the instruments, amber for a caution,
 * the grades in three steps of the same green. */
const INK = 'rgba(236, 244, 240, 0.86)';
const DIM = 'rgba(236, 244, 240, 0.45)';
const AMBER = '#ffc04a';
const GRADE_INK = { clean: '#8dffb5', usable: '#d8f7a0', poor: '#f2d48a' };
const HALO = 'rgba(0, 0, 0, 0.7)';
const FONT = 'ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace';

const CSS = `
.ops { position: absolute; inset: 0; pointer-events: none; display: none; font-family: ${FONT};
  font-size: clamp(10px, 1.5vh, 14px); color: ${INK}; letter-spacing: 0.08em; text-shadow: 0 1px 2px ${HALO}; }
.ops canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.ops-read { position: absolute; top: 24%; right: max(16px, env(safe-area-inset-right));
  text-align: right; line-height: 1.6; white-space: nowrap; }
.ops-read .ops-k { color: ${DIM}; margin-right: 0.6em; }
.ops-say { position: absolute; left: 50%; bottom: max(18%, 96px); transform: translateX(-50%); text-align: center;
  white-space: nowrap; font-size: 1.1em; letter-spacing: 0.14em; }
.ops-say.warn { color: ${AMBER}; }
.ops-cue { position: absolute; left: 50%; top: calc(50% + 4.2em); transform: translateX(-50%); font-size: 0.9em;
  letter-spacing: 0.16em; white-space: nowrap; }
`;

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) {
    e.className = cls;
  }
  if (text != null) {
    e.textContent = text;
  }
  if (parent) {
    parent.append(e);
  }
  return e;
}

/* A text node that is only written when it changes. */
class Field {
  constructor(parent, cls = '') {
    this.el = el('span', cls, parent);
    this.v = null;
  }

  set(v) {
    if (v !== this.v) {
      this.v = v;
      this.el.textContent = v;
    }
  }
}

export class OpsHud {
  constructor(root) {
    this.root = root;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.el = el('div', 'ops');
    this.el.setAttribute('aria-hidden', 'true');
    root.prepend(this.el);
    this.canvas = el('canvas', '', this.el);
    this.g = this.canvas.getContext('2d');
    this.on = false;
    this.dim = false;
    this.nextDrawMs = 0;
    this.w = 0;
    this.h = 0;
    this.s = 1;
    this.sizeDirty = true;
    this.src = null;
    this.saying = null;
    /* What the last paint drew, CSS px, for the checks: every mark with
     * what it is for. */
    this.marks = [];
    const read = el('div', 'ops-read', this.el);
    const line = (k) => {
      const d = el('div', '', read);
      el('span', 'ops-k', d, k);
      return new Field(d);
    };
    this.fMode = line(str('ops.hud.sensor'));
    this.fZoom = line(str('ops.hud.zoom'));
    this.fGimbal = line(str('ops.hud.gimbal'));
    this.fLock = line(str('ops.hud.lock'));
    this.cue = new Field(this.el, 'ops-cue');
    this.say = new Field(this.el, 'ops-say');
    window.addEventListener('resize', () => { this.sizeDirty = true; });
    window.__opsHud = () => ({
      on: this.on,
      marks: this.marks.map((m) => ({ ...m })),
      cue: this.cue.v,
      say: this.saying ? this.saying.text : null,
      read: {
        mode: this.fMode.v, zoom: this.fZoom.v, gimbal: this.fGimbal.v, lock: this.fLock.v,
      },
    });
  }

  /* A word for the pilot under the reticle: a capture's grade, a refusal. */
  tell(text, { warn = false, grade = null } = {}) {
    this.saying = {
      text, warn, grade, until: performance.now() + SAY_MS,
    };
  }

  /*
   * Every frame. `want`: the ball's picture is the screen. src: { ball (a
   * camball state), digital, mode (a sensor mode), tanHalf, cue (the
   * grade a still would get now, for an item the HUD may name, or null) }.
   */
  tick(want, paused, nowMs, src) {
    const on = Boolean(want && src);
    if (on !== this.on) {
      this.on = on;
      this.el.style.display = on ? 'block' : 'none';
      this.nextDrawMs = 0;
    }
    if (paused !== this.dim) {
      this.dim = paused;
      this.el.style.opacity = paused ? '0.4' : '1';
    }
    if (!on) {
      this.marks.length = 0;
      return;
    }
    this.src = src;
    const b = src.ball;
    this.fMode.set(str(`avionics.hud.cam_mode.${src.mode}`));
    this.fZoom.set(str('ops.hud.zoom_of', { z: (b.zoom * src.digital).toFixed(1) }));
    /* Depression is down from the horizon; bearing clockwise from north. */
    this.fGimbal.set(str('ops.hud.gimbal_of', {
      dep: Math.round(-b.tilt * DEG),
      brg: String((Math.round(b.bearing * DEG) + 360) % 360).padStart(3, '0'),
    }));
    this.fLock.set(str(b.lock ? (b.track ? 'ops.hud.lock_track' : 'ops.hud.lock_ground') : 'ops.hud.lock_free'));
    this.cue.set(src.cue ? str('ops.hud.cue', { grade: str(`ops.grade.${src.cue}`) }) : '');
    this.cue.el.style.color = src.cue ? GRADE_INK[src.cue] : '';
    const now = performance.now();
    if (this.saying && now > this.saying.until) {
      this.saying = null;
    }
    this.say.set(this.saying ? this.saying.text : '');
    this.say.el.classList.toggle('warn', Boolean(this.saying && this.saying.warn));
    this.say.el.style.color = this.saying && this.saying.grade ? GRADE_INK[this.saying.grade] : '';
    if (nowMs < this.nextDrawMs) {
      return;
    }
    this.nextDrawMs = nowMs + 1000 / HUD_HZ;
    this.paint();
  }

  resize() {
    const s = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const w = this.el.clientWidth || window.innerWidth;
    const h = this.el.clientHeight || window.innerHeight;
    if (w !== this.w || h !== this.h || s !== this.s || this.sizeDirty) {
      this.w = w;
      this.h = h;
      this.s = s;
      this.canvas.width = Math.round(w * s);
      this.canvas.height = Math.round(h * s);
      this.sizeDirty = false;
    }
  }

  paint() {
    this.resize();
    const { g, w, h } = this;
    g.setTransform(this.s, 0, 0, this.s, 0, 0);
    g.clearRect(0, 0, w, h);
    this.marks.length = 0;
    const cx = w / 2;
    const cy = h / 2;
    g.lineWidth = 1.25;
    g.strokeStyle = INK;
    g.shadowColor = HALO;
    g.shadowBlur = 3;
    /* The centre cross, open in the middle so the centre stays the
     * picture's. */
    const a = Math.max(10, Math.min(w, h) * 0.022);
    g.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      g.moveTo(cx + dx * a * 0.35, cy + dy * a * 0.35);
      g.lineTo(cx + dx * a, cy + dy * a);
    }
    g.stroke();
    this.marks.push({ kind: 'reticle', x: cx, y: cy });
    /* The survey box: the capture's centring cuts as brackets, off is the
     * larger of the horizontal and vertical offsets over the half frame. */
    const box = (off, alpha) => {
      const hx = (w / 2) * off;
      const hy = (h / 2) * off;
      const c = Math.min(hx, hy) * 0.28;
      g.globalAlpha = alpha;
      g.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        g.moveTo(cx + sx * hx, cy + sy * (hy - c));
        g.lineTo(cx + sx * hx, cy + sy * hy);
        g.lineTo(cx + sx * (hx - c), cy + sy * hy);
      }
      g.stroke();
      g.globalAlpha = 1;
      this.marks.push({
        kind: 'survey', off, x: cx, y: cy, w: hx * 2, h: hy * 2,
      });
    };
    box(CUTS.clean.off, 0.85);
    box(CUTS.usable.off, 0.4);
    if (this.src.ball.lock) {
      /* A small diamond on the lock: it is at the centre, by the ball's
       * construction, and says the ball is holding. */
      g.beginPath();
      g.moveTo(cx, cy - a * 0.3);
      g.lineTo(cx + a * 0.3, cy);
      g.lineTo(cx, cy + a * 0.3);
      g.lineTo(cx - a * 0.3, cy);
      g.closePath();
      g.stroke();
      this.marks.push({ kind: 'lock', x: cx, y: cy });
    }
    g.shadowBlur = 0;
  }
}
