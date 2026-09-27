/*
 * fpvhud.js: the flight controller's on screen display, over the FPV camera.
 *
 * WHAT IS BEING COPIED. A real FPV pilot does not see the game's readout in
 * the goggles: they see the characters their flight controller writes into
 * the analog video through a MAX7456, white glyphs with a one pixel black
 * border, no panels and no boxes, sitting straight on the camera picture.
 * Betaflight draws it for a quad and INAV for a plane. This file draws the
 * same thing, with the same elements, the same strings and, where the value
 * is computed rather than laid out, the same arithmetic, read out of the
 * vendored Betaflight tree (src/main/osd/osd_elements.c, osd_warnings.c and
 * sensors/battery.c at the pinned commit).
 *
 * HOW IT IS DRAWN, and it is the MAX7456's own design, because that design
 * is what makes it cheap:
 *
 *   1. A character buffer, 30 columns by 16 rows, the PAL grid. Every tick
 *      the elements write codes into it, exactly as the firmware does.
 *   2. A font ROM. Each character is drawn once, white with a black
 *      outline, into an atlas canvas at the cell size the screen gives, and
 *      redrawn only when the screen changes size.
 *   3. The screen is the buffer blitted through the atlas: one drawImage per
 *      lit cell, onto one 2D canvas over the WebGL view.
 *
 * It ticks at OSD_HZ, not per frame, and a tick whose buffer came out
 * identical to the last one does not touch the canvas at all. Nothing here
 * reads layout: the size comes from the resize event.
 *
 * WHAT IS NOT MODELLED, said here once so the readouts do not pretend:
 *
 *   - The pack never empties. The plant holds the open circuit voltage the
 *     pilot chose and sags it under load (src/native/plant.c), so the
 *     voltage here falls under throttle and comes back off it, and LOW
 *     BATTERY is Betaflight's own filtered-voltage test against that sag.
 *     The mAh count is the plant's real current integrated on the sim
 *     clock; it has no capacity to run out of.
 *   - There is no arming step. The shell arms the moment the throttle
 *     lifts the craft, so Betaflight's THROTTLE arming refusal can never be
 *     true and is not drawn. DISARMED means the motors are stopped: before
 *     takeoff, parked, or cut by a crash.
 *   - LQ is the radio link's own count (src/input/link.js): the percentage
 *     of the last 100 packets that arrived. The default link is a perfect
 *     wire, so it reads 100.
 *   - Heading: the world's -Z is north. The maps carry no compass, so it is
 *     a convention, stated here.
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
import { formatTime, formatRunClock } from './ui.js';

export const OSD_COLS = 30;
export const OSD_ROWS = 16;
/* The cell whose centre is the centre of the screen. Betaflight's crosshair
 * sits at column 14 on the 30 wide grid; the grid is placed so that cell is
 * dead centre rather than half a cell off it. */
const MID_COL = 14;
const MID_ROW = 7;
/* Betaflight's analog OSD runs at 12 Hz (OSD_FRAMERATE_DEFAULT_HZ). The
 * horizon visibly steps at that rate on a monitor, so this runs at 25, half
 * the PAL field rate, which is what the faster digital systems refresh at. */
const OSD_HZ = 25;
/* osd_elements.c: OSD_BLINK_FREQUENCY_HZ, a full on and off cycle. */
const BLINK_HZ = 2;
/* The grid's share of the screen. A goggle shows the OSD inside the
 * overscan, so the outer cells never touch the frame's edge. */
const GRID_W = 0.9;
const GRID_H = 0.9;
/* How far a cell may be stretched from square, width over height and
 * height over width. */
const CELL_WIDEST = 1.4;
const CELL_TALLEST = 1.8;
/* The side columns, symmetric about MID_COL. The right one stops a column
 * short of the grid so the top right readouts clear the game's own Pause
 * and Aircraft chips, which live in that corner in flight. */
const LEFT_COL = 1;
const RIGHT_COL = 27;

/* sensors/battery.c defaults, volts per cell. */
const CELL_WARN = 3.5;
const CELL_CRIT = 3.3;
const CELL_MAX = 4.3;
const CELL_FULL = 4.1;
const CELL_HYST = 0.01;
/* vbat_display_lpf_period 30, tenths of a second: a PT1 at 1/3 Hz, whose
 * time constant is 1/(2 pi f). The voltage on screen and the warnings both
 * read this filtered value, which is why a punch has to be held to warn. */
const VBAT_TAU_S = 3 / (2 * Math.PI);
/* osd.c: link_quality_alarm. */
const LQ_ALARM = 80;
const LQ_WINDOW = 100;
/* osd.c: ahMaxPitch, ahMaxRoll, degrees; osd_elements.c: the sidebars and
 * the nine sub-row positions of a horizon bar glyph. */
const AH_MAX_PITCH = 20;
const AH_MAX_ROLL = 40;
const AH_SYMBOLS = 9;
const AH_SIDEBAR_W = 7;
const AH_SIDEBAR_H = 3;
/* A plane's ladder: a rung every ten degrees, INAV's default interval,
 * kept off the rows the race uses above it and the home readout and the
 * heading below. */
const LADDER_STEP = 10;
const LADDER_TOP = 5;
const LADDER_BOTTOM = 10;
/* The race readout's rows, top centre, and the widest line it may take:
 * the timers sit either side of the first two rows. */
const RACE_ROW = 0;
const RACE_WIDE = 28;
const RACE_NARROW = 14;
/* A plane's heading: the tape and the number, bottom centre, where INAV
 * pilots commonly put them once the top is taken. */
const HEADING_ROW = 13;
const HOME_ROW = 11;

/*
 * THE FONT. Printable ASCII is itself; every symbol is a private use code
 * point, named here the way osd_symbols.h names them. Codes are what the
 * buffer holds and what the atlas is keyed by.
 */
const P = 0xE000;
const SYM = {
  BATT: P, /* P + 0..6, full to empty, battery.c's seven fill levels */
  BATT_CRIT: P + 7,
  THR: P + 8,
  LQ: P + 9,
  ON_M: P + 10,
  FLY_M: P + 11,
  MAH: P + 12,
  KMH: P + 13,
  MS: P + 14,
  ALT_M: P + 15,
  HOME: P + 16,
  AIR: P + 17,
  GS: P + 18,
  VARIO_UP: P + 19,
  VARIO_DN: P + 20,
  AH_CL: P + 21,
  AH_C: P + 22,
  AH_CR: P + 23,
  AH_DEC: P + 24,
  AH_LEFT: P + 25,
  AH_RIGHT: P + 26,
  PLANE_L: P + 27,
  PLANE_C: P + 28,
  PLANE_R: P + 29,
  HEAD_LINE: P + 30,
  HEAD_DIV: P + 31,
  AH_BAR: P + 32, /* P + 32..40, nine sub-row positions */
  ARROW: P + 48, /* P + 48..63, sixteen directions, 0 is straight ahead */
};

const ch = (code) => String.fromCharCode(code);

/*
 * The page's rules for the OSD, injected once rather than shipped as a
 * stylesheet: the shell has no .css file and neither of its servers
 * (scripts/serve.js, tests/lib/server.js) knows the type, so a link would
 * be refused in the harness and pass on the deploy, the worst split.
 *
 * With the OSD up, the game's clock, corners and launch overlay step aside,
 * because the OSD carries all of them. The stick gimbals, the weight slider
 * and the score stay: they are the game's aids, not the flight controller's.
 * Banners (Crashed, Wrecked, the lap flash, the takeoff prompt) are the game
 * talking and they stay too, but in the goggles they read as OSD text:
 * white capitals with a hard black edge and no panel under them, below the
 * warnings, where the race readout and the horizon are not.
 */
const OSD_CSS = `
canvas.fpv-osd { position: absolute; inset: 0; width: 100%; height: 100%; display: none; pointer-events: none; }
#ui.fpv-osd-on .osd-top, #ui.fpv-osd-on .osd-corner, #ui.fpv-osd-on .osd-launch { display: none; }
#ui.fpv-osd-on .banner { top: 66%; }
#ui.fpv-osd-on .banner, #ui.fpv-osd-on .banner.panel, #ui.fpv-osd-on .banner.edge {
  font-family: ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, "Liberation Mono", monospace;
  font-weight: 700; color: #fff; text-transform: uppercase; letter-spacing: 0.02em;
  background: none; box-shadow: none; border-radius: 0;
  text-shadow: -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000,
    0 -2px 0 #000, 0 2px 0 #000, -2px 0 0 #000, 2px 0 0 #000;
}
`;

/* Betaflight's battery glyph: the average cell over min..max mapped to
 * eight steps and clamped to the seven glyphs. */
function batterySymbol(cellV, state) {
  if (state === 'critical') {
    return ch(SYM.BATT_CRIT);
  }
  const step = Math.round(((cellV - CELL_CRIT) / (CELL_MAX - CELL_CRIT)) * 8);
  return ch(SYM.BATT + 6 - Math.max(0, Math.min(6, step)));
}

/* osdFormatTime at second precision: MM:SS. */
function mmss(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m < 10 ? '0' : ''}${m}:${r < 10 ? '0' : ''}${r}`;
}

/*
 * Whether Betaflight's airmode feature is on in a CLI diff. The bridge
 * starts from FEATURE_AIRMODE (src/native/bf/bf_glue.c) and applies the
 * diff's feature lines in order, so the last AIRMODE line wins.
 */
export function airmodeIn(diff) {
  let on = true;
  for (const m of String(diff || '').matchAll(/^\s*feature\s+(-?)AIRMODE\s*$/gim)) {
    on = m[1] !== '-';
  }
  return on;
}

function pad(text, width) {
  return text.length >= width ? text : ' '.repeat(width - text.length) + text;
}

/*
 * Attitude from a three.js quaternion (Y up, the craft's nose along -Z),
 * the render's own. Degrees: pitch nose up positive, roll right wing down
 * positive, heading clockwise from -Z. Written into `out` so a tick
 * allocates nothing.
 */
export function attitudeOf(q, out) {
  const { x, y, z, w } = q;
  /* Rotated -Z (the nose) and +Y (the top) and +X (the right wing), only
   * the components used. */
  const fx = -(2 * (x * z + w * y));
  const fy = -(2 * (y * z - w * x));
  const fz = -(1 - 2 * (x * x + y * y));
  const uy = 1 - 2 * (x * x + z * z);
  const ry = 2 * (x * y + w * z);
  const deg = 180 / Math.PI;
  out.pitch = Math.asin(Math.max(-1, Math.min(1, fy))) * deg;
  out.roll = Math.atan2(-ry, uy) * deg;
  let h = Math.atan2(fx, -fz) * deg;
  if (h < 0) {
    h += 360;
  }
  out.heading = h;
  return out;
}

/*
 * THE GLYPHS, drawn once per size into the atlas. Everything is in the
 * cell's own box, w by h device pixels, with u the height of one MAX7456
 * pixel (a cell is 18 of them tall). White ink, one pixel of black round it.
 */
function inkLine(g, u, build) {
  g.beginPath();
  build();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = '#000';
  g.lineWidth = 4 * u;
  g.stroke();
  g.strokeStyle = '#fff';
  g.lineWidth = 2 * u;
  g.stroke();
}

function inkFill(g, u, build) {
  g.beginPath();
  build();
  g.lineJoin = 'round';
  g.strokeStyle = '#000';
  g.lineWidth = 2 * u;
  g.stroke();
  g.fillStyle = '#fff';
  g.fill();
}

/* `fitW` stretches the text to that width, which is how one character
 * fills its cell the way a MAX7456 glyph does; `maxW` only ever squeezes. */
function inkText(g, u, text, x, y, size, maxW, fitW = 0) {
  g.font = `bold ${size}px ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, "Liberation Mono", monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const wide = g.measureText(text).width;
  let sx = wide > maxW ? maxW / wide : 1;
  if (fitW > 0 && wide > 0) {
    sx = Math.max(0.6, Math.min(1.8, fitW / wide));
  }
  g.save();
  g.translate(x, y);
  g.scale(sx, 1);
  g.lineJoin = 'round';
  g.strokeStyle = '#000';
  g.lineWidth = Math.max(2, 2.2 * u);
  g.strokeText(text, 0, 0);
  g.fillStyle = '#fff';
  g.fillText(text, 0, 0);
  g.restore();
}

/* Two rows of small letters in one cell, the way the firmware fonts spell a
 * unit (mAh, km/h, m/s) or a label (THR, LQ) in a single character. */
function tinyGlyph(g, w, h, u, top, bottom) {
  if (bottom) {
    inkText(g, u * 0.7, top, w / 2, h * 0.3, h * 0.42, w * 0.96);
    inkText(g, u * 0.7, bottom, w / 2, h * 0.72, h * 0.42, w * 0.96);
  } else {
    inkText(g, u * 0.7, top, w / 2, h * 0.52, h * 0.5, w * 0.96);
  }
}

function drawSymbol(g, code, w, h, u) {
  const cx = w / 2;
  const cy = h / 2;
  if (code >= SYM.AH_BAR && code < SYM.AH_BAR + AH_SYMBOLS) {
    const y = h * ((code - SYM.AH_BAR) + 0.5) / AH_SYMBOLS;
    inkLine(g, u, () => { g.moveTo(u, y); g.lineTo(w - u, y); });
    return;
  }
  if (code >= SYM.ARROW && code < SYM.ARROW + 16) {
    const a = ((code - SYM.ARROW) * Math.PI) / 8;
    const s = Math.min(w, h) * 0.42;
    const pt = (px, py) => [cx + px * Math.cos(a) - py * Math.sin(a), cy + px * Math.sin(a) + py * Math.cos(a)];
    inkFill(g, u, () => {
      const pts = [pt(0, -s), pt(s * 0.62, s * 0.2), pt(s * 0.2, s * 0.2), pt(s * 0.2, s), pt(-s * 0.2, s), pt(-s * 0.2, s * 0.2), pt(-s * 0.62, s * 0.2)];
      g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i += 1) {
        g.lineTo(pts[i][0], pts[i][1]);
      }
      g.closePath();
    });
    return;
  }
  if (code >= SYM.BATT && code <= SYM.BATT_CRIT) {
    /* Upright cell, nub on top, filled from the bottom. */
    const bw = Math.min(w * 0.5, 7 * u);
    const bh = 13 * u;
    const x0 = cx - bw / 2;
    const y0 = cy - bh / 2 + u;
    inkLine(g, u, () => {
      g.rect(x0, y0, bw, bh);
      g.moveTo(cx - bw * 0.25, y0 - 1.5 * u);
      g.lineTo(cx + bw * 0.25, y0 - 1.5 * u);
    });
    if (code === SYM.BATT_CRIT) {
      inkLine(g, u, () => { g.moveTo(cx - bw * 0.3, cy + u); g.lineTo(cx + bw * 0.3, cy + u); });
      return;
    }
    const level = 6 - (code - SYM.BATT);
    if (level > 0) {
      const fh = ((bh - 3 * u) * level) / 6;
      g.fillStyle = '#fff';
      g.fillRect(x0 + 1.5 * u, y0 + bh - 1.5 * u - fh, bw - 3 * u, fh);
    }
    return;
  }
  switch (code) {
    case SYM.THR: tinyGlyph(g, w, h, u, 'THR'); return;
    case SYM.LQ: tinyGlyph(g, w, h, u, 'LQ'); return;
    case SYM.ON_M: tinyGlyph(g, w, h, u, 'ON'); return;
    case SYM.FLY_M: tinyGlyph(g, w, h, u, 'FLY'); return;
    case SYM.MAH: tinyGlyph(g, w, h, u, 'mAh'); return;
    case SYM.KMH: tinyGlyph(g, w, h, u, 'KM', 'H'); return;
    case SYM.MS: tinyGlyph(g, w, h, u, 'M', 'S'); return;
    case SYM.ALT_M: tinyGlyph(g, w, h, u, 'M'); return;
    case SYM.AIR: tinyGlyph(g, w, h, u, 'AS'); return;
    case SYM.GS: tinyGlyph(g, w, h, u, 'GS'); return;
    case SYM.HOME:
      inkFill(g, u, () => {
        const s = Math.min(w, h) * 0.34;
        g.moveTo(cx, cy - s * 1.1);
        g.lineTo(cx + s, cy - s * 0.1);
        g.lineTo(cx + s * 0.7, cy - s * 0.1);
        g.lineTo(cx + s * 0.7, cy + s);
        g.lineTo(cx - s * 0.7, cy + s);
        g.lineTo(cx - s * 0.7, cy - s * 0.1);
        g.lineTo(cx - s, cy - s * 0.1);
        g.closePath();
      });
      return;
    case SYM.VARIO_UP:
    case SYM.VARIO_DN: {
      const d = code === SYM.VARIO_UP ? -1 : 1;
      const s = Math.min(w, h) * 0.34;
      inkFill(g, u, () => {
        g.moveTo(cx, cy + d * s);
        g.lineTo(cx + s * 0.8, cy);
        g.lineTo(cx - s * 0.8, cy);
        g.closePath();
      });
      inkLine(g, u, () => { g.moveTo(cx, cy); g.lineTo(cx, cy - d * s); });
      return;
    }
    case SYM.AH_CL:
      inkLine(g, u, () => { g.moveTo(w * 0.35, cy); g.lineTo(w - u, cy); });
      return;
    case SYM.AH_CR:
      inkLine(g, u, () => { g.moveTo(u, cy); g.lineTo(w * 0.65, cy); });
      return;
    case SYM.AH_C:
      inkLine(g, u, () => {
        g.moveTo(u, cy);
        g.lineTo(cx - 2.5 * u, cy);
        g.moveTo(cx + 2.5 * u, cy);
        g.lineTo(w - u, cy);
        g.moveTo(cx, cy - 2.5 * u);
        g.lineTo(cx, cy - 6 * u);
      });
      return;
    case SYM.AH_DEC:
      inkLine(g, u, () => { g.moveTo(cx - 2 * u, cy); g.lineTo(cx + 2 * u, cy); });
      return;
    case SYM.AH_LEFT:
    case SYM.AH_RIGHT: {
      /* The level markers point in, at the crosshair. */
      const d = code === SYM.AH_LEFT ? 1 : -1;
      const s = Math.min(w, h) * 0.3;
      inkFill(g, u, () => {
        g.moveTo(cx + d * s, cy);
        g.lineTo(cx - d * s * 0.7, cy - s * 0.8);
        g.lineTo(cx - d * s * 0.7, cy + s * 0.8);
        g.closePath();
      });
      return;
    }
    case SYM.PLANE_L:
      inkLine(g, u, () => { g.moveTo(u, cy); g.lineTo(w, cy); g.lineTo(w, cy + 3 * u); });
      return;
    case SYM.PLANE_R:
      inkLine(g, u, () => { g.moveTo(w - u, cy); g.lineTo(0, cy); g.lineTo(0, cy + 3 * u); });
      return;
    case SYM.PLANE_C:
      inkLine(g, u, () => { g.arc(cx, cy, 2.5 * u, 0, Math.PI * 2); g.moveTo(cx, cy - 2.5 * u); g.lineTo(cx, cy - 5.5 * u); });
      return;
    case SYM.HEAD_LINE:
      inkLine(g, u, () => { g.moveTo(0, h * 0.7); g.lineTo(w, h * 0.7); });
      return;
    case SYM.HEAD_DIV:
      inkLine(g, u, () => { g.moveTo(0, h * 0.7); g.lineTo(w, h * 0.7); g.moveTo(cx, h * 0.7); g.lineTo(cx, h * 0.4); });
      return;
    default:
      break;
  }
}

/*
 * The font ROM. A glyph is drawn the first time the buffer asks for it, into
 * the next free slot, and kept until the cell size changes. MAX7456 fonts
 * have capitals only, so text is upper cased before it reaches here.
 */
class Atlas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.u = h / 18;
    this.per = 16;
    this.canvas = document.createElement('canvas');
    this.canvas.width = w * this.per;
    this.canvas.height = h * this.per;
    this.g = this.canvas.getContext('2d');
    this.slots = new Map();
  }

  slot(code) {
    let i = this.slots.get(code);
    if (i !== undefined) {
      return i;
    }
    i = this.slots.size;
    if (i >= this.per * this.per) {
      throw new Error(`OSD font atlas full at code ${code}`);
    }
    this.slots.set(code, i);
    const g = this.g;
    g.save();
    g.translate((i % this.per) * this.w, Math.floor(i / this.per) * this.h);
    g.beginPath();
    g.rect(0, 0, this.w, this.h);
    g.clip();
    if (code >= P) {
      drawSymbol(g, code, this.w, this.h, this.u);
    } else {
      inkText(g, this.u, String.fromCharCode(code), this.w / 2, this.h * 0.54, this.h * 0.9, this.w, this.w * 0.74);
    }
    g.restore();
    return i;
  }
}

/*
 * THE OSD. One per shell. feed() is called on every flight frame with the
 * values the game already computes for its own readout; it only integrates
 * what has to be integrated on the sim clock. tick() decides visibility and,
 * at OSD_HZ, rebuilds the buffer and paints it.
 */
export class FpvOsd {
  constructor(root) {
    this.root = root;
    const style = document.createElement('style');
    style.textContent = OSD_CSS;
    document.head.append(style);
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'fpv-osd';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.g = this.canvas.getContext('2d');
    /* First child, so every banner, dialog and menu paints over it. */
    root.prepend(this.canvas);
    this.buf = new Uint16Array(OSD_COLS * OSD_ROWS);
    this.shown = new Uint16Array(OSD_COLS * OSD_ROWS);
    this.atlas = null;
    this.sizeDirty = true;
    this.on = false;
    this.dim = false;
    this.nextTickMs = 0;
    this.att = { pitch: 0, roll: 0, heading: 0 };
    this.view = null;
    this.x = null;
    this.configSeen = null;
    this.airmode = true;
    this.windPtr = 0;
    this.wind = [0, 0];
    this.stats = { feeds: 0, feedMs: 0, ticks: 0, paints: 0, cells: 0, tickMs: 0, worstTickMs: 0 };
    this.resetRun();
    window.addEventListener('resize', () => { this.sizeDirty = true; });
    /* What the headless check reads: the values each element is showing,
     * the grid as text, and what it costs. */
    window.__fpvOsd = () => ({
      on: this.on,
      rows: this.rowsText(),
      values: { ...this.values },
      stats: { ...this.stats },
      layout: {
        w: this.canvas.width, h: this.canvas.height, cw: this.cw, ch: this.ch, ox: this.ox, oy: this.oy,
      },
    });
  }

  resetRun() {
    this.lastSimT = null;
    this.lastWall = null;
    this.mah = 0;
    this.flyS = 0;
    this.onS = 0;
    this.vFilt = null;
    this.batt = 'ok';
    this.lq = 100;
    this.lqSent = 0;
    this.lqDropped = 0;
    this.values = {};
  }

  /*
   * One flight frame. `v` is the object the game hands its own setOsd, `x`
   * the rest: the plant state block, the pack, the render's attitude and
   * position, the camera, home, the link and the arming picture.
   */
  feed(v, x) {
    const t0 = performance.now();
    const st = x.st;
    const t = st[0];
    /* sim_reset puts the plant clock back to zero: a new run, a fresh pack,
     * and the firmware's counters with it. */
    if (this.lastSimT === null || t < this.lastSimT - 1e-9) {
      this.resetRun();
      this.lastSimT = t;
    }
    const dt = t - this.lastSimT;
    this.lastSimT = t;
    /* Stopped motors draw nothing, and a pack with no load reads its open
     * circuit voltage. The plant is not stepped while the craft is parked,
     * so its last current and sagged voltage are stale then, not true. */
    const amps = x.armed ? st[19] : 0;
    const volts = x.armed ? st[18] : x.restVolts;
    this.mah += (amps * dt * 1000) / 3600;
    if (x.armed) {
      this.flyS += dt;
    }
    /* The ON timer is the wall clock while there is a flight to be on for;
     * a pause or a hidden tab adds at most a second. */
    const now = performance.now();
    const wallS = this.lastWall === null ? 0 : Math.min(now - this.lastWall, 1000) / 1000;
    this.lastWall = now;
    this.onS += wallS;
    /* pt1FilterApply, with the gain pt1FilterGain gives for this step. The
     * parked frames step the filter on the wall clock, since the sim clock
     * stands still while the pack recovers. */
    const fdt = dt > 0 ? dt : wallS;
    if (this.vFilt === null) {
      this.vFilt = volts;
    } else {
      this.vFilt += (fdt / (VBAT_TAU_S + fdt)) * (volts - this.vFilt);
    }
    if (x.config !== this.configSeen) {
      this.configSeen = x.config;
      this.airmode = airmodeIn(x.config);
    }
    this.batteryState(x.cells);
    this.linkQuality(x.link);
    this.view = v;
    this.x = x;
    this.stats.feeds += 1;
    this.stats.feedMs += performance.now() - t0;
  }

  /* batteryUpdateVoltageState, with vbat_duration_for_warning at its
   * default of zero. */
  batteryState(cells) {
    const warn = CELL_WARN * cells;
    const crit = CELL_CRIT * cells;
    const v = this.vFilt;
    if (this.batt === 'ok' && v <= warn - CELL_HYST) {
      this.batt = 'warning';
    }
    if (this.batt === 'warning') {
      if (v <= crit - CELL_HYST) {
        this.batt = 'critical';
      } else if (v > warn) {
        this.batt = 'ok';
      }
    } else if (this.batt === 'critical' && v > crit) {
      this.batt = 'warning';
    }
  }

  /* Percent of the last LQ_WINDOW packets that arrived, recomputed each
   * time that many more have been sent. A perfect link sends nothing
   * through the model and stays at 100. */
  linkQuality(link) {
    if (!link || link.isPerfect()) {
      this.lq = 100;
      return;
    }
    const sent = link.sent - this.lqSent;
    if (sent < 0) {
      this.lqSent = link.sent;
      this.lqDropped = link.dropped;
      return;
    }
    if (sent >= LQ_WINDOW) {
      const dropped = link.dropped - this.lqDropped;
      this.lq = Math.round(100 * (1 - dropped / sent));
      this.lqSent = link.sent;
      this.lqDropped = link.dropped;
    }
  }

  /*
   * Every frame. `want` is whether the OSD belongs on screen at all: the
   * FPV style chosen, the FPV camera live, flight or pause. Paused, it
   * stays up dimmed like the game's own readout.
   */
  tick(want, paused, nowMs) {
    const on = Boolean(want && this.view);
    if (on !== this.on) {
      this.on = on;
      this.canvas.style.display = on ? 'block' : 'none';
      this.root.classList.toggle('fpv-osd-on', on);
      this.nextTickMs = 0;
      this.shown.fill(0xFFFF);
    }
    if (paused !== this.dim) {
      this.dim = paused;
      this.canvas.style.opacity = paused ? '0.4' : '1';
    }
    if (!on || nowMs < this.nextTickMs) {
      return;
    }
    const t0 = performance.now();
    this.nextTickMs = Math.max(this.nextTickMs + 1000 / OSD_HZ, nowMs);
    if (this.sizeDirty) {
      this.resize();
    }
    this.build(nowMs);
    this.values.at = nowMs;
    this.paint();
    const ms = performance.now() - t0;
    this.stats.ticks += 1;
    this.stats.tickMs += ms;
    this.stats.worstTickMs = Math.max(this.stats.worstTickMs, ms);
  }

  resize() {
    this.sizeDirty = false;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(window.innerWidth * dpr));
    const h = Math.max(1, Math.round(window.innerHeight * dpr));
    this.canvas.width = w;
    this.canvas.height = h;
    /* A MAX7456 cell is 12 by 18. A 16:9 goggle stretches it to about
     * square, which is what a landscape screen gets; past that the cell is
     * held to a sane shape and the grid shrinks toward the crosshair
     * instead, or a phone held upright would draw every glyph as a sliver. */
    const cw = Math.floor((w * GRID_W) / OSD_COLS);
    const chh = Math.floor((h * GRID_H) / OSD_ROWS);
    this.cw = Math.min(cw, Math.floor(chh * CELL_WIDEST));
    this.ch = Math.min(chh, Math.floor(cw * CELL_TALLEST));
    /* Cell MID_COL, MID_ROW centred on the screen. */
    this.ox = Math.round(w / 2 - (MID_COL + 0.5) * this.cw);
    this.oy = Math.round(h / 2 - (MID_ROW + 0.5) * this.ch);
    this.atlas = new Atlas(this.cw, this.ch);
    this.shown.fill(0xFFFF);
  }

  put(col, row, text) {
    if (row < 0 || row >= OSD_ROWS) {
      return;
    }
    for (let i = 0; i < text.length; i += 1) {
      const c = col + i;
      if (c >= 0 && c < OSD_COLS) {
        const code = text.charCodeAt(i);
        this.buf[row * OSD_COLS + c] = code === 32 ? 0 : code;
      }
    }
  }

  putRight(endCol, row, text) {
    this.put(endCol - text.length + 1, row, text);
  }

  putMid(row, text) {
    this.put(MID_COL - Math.floor((text.length - 1) / 2), row, text);
  }

  /* One horizon bar glyph at a cell and a ninth of a row. */
  bar(col, ninths) {
    if (ninths < 0) {
      return;
    }
    const row = Math.floor(ninths / AH_SYMBOLS);
    if (row < 0 || row >= OSD_ROWS) {
      return;
    }
    this.buf[row * OSD_COLS + col] = SYM.AH_BAR + (ninths % AH_SYMBOLS);
  }

  build(nowMs) {
    const v = this.view;
    const x = this.x;
    this.buf.fill(0);
    attitudeOf(x.quat, this.att);
    const blinkOn = Math.floor((nowMs / 1000) * BLINK_HZ) % 2 === 0;
    if (x.fixedWing) {
      this.buildPlane(v, x);
    } else {
      this.buildQuad(v, x);
    }
    this.buildCommon(v, x, blinkOn);
  }

  /* osdElementArtificialHorizon, the integer arithmetic and all. */
  quadHorizon() {
    const roll = Math.max(-AH_MAX_ROLL * 10, Math.min(AH_MAX_ROLL * 10, Math.round(this.att.roll * 10)));
    let pitch = Math.max(-AH_MAX_PITCH * 10, Math.min(AH_MAX_PITCH * 10, Math.round(this.att.pitch * 10)));
    pitch = Math.trunc((pitch * 25) / (AH_MAX_PITCH * 10));
    /* The element sits four rows above the centre, and 41 ninths down is
     * the level line; nose up moves the line down the screen. */
    const top = (MID_ROW - 4) * AH_SYMBOLS;
    for (let dx = -4; dx <= 4; dx += 1) {
      const y = Math.trunc((-roll * dx) / 64) + pitch + 41;
      if (y >= 0 && y <= 81) {
        this.bar(MID_COL + dx, top + y);
      }
    }
    return { roll, pitch };
  }

  buildQuad(v, x) {
    const ah = this.quadHorizon();
    /* osdBackgroundHorizonSidebars. */
    for (let dy = -AH_SIDEBAR_H; dy <= AH_SIDEBAR_H; dy += 1) {
      this.put(MID_COL - AH_SIDEBAR_W, MID_ROW + dy, ch(SYM.AH_DEC));
      this.put(MID_COL + AH_SIDEBAR_W, MID_ROW + dy, ch(SYM.AH_DEC));
    }
    this.put(MID_COL - AH_SIDEBAR_W + 1, MID_ROW, ch(SYM.AH_LEFT));
    this.put(MID_COL + AH_SIDEBAR_W - 1, MID_ROW, ch(SYM.AH_RIGHT));
    this.put(MID_COL - 1, MID_ROW, ch(SYM.AH_CL) + ch(SYM.AH_C) + ch(SYM.AH_CR));
    /* osdElementFlymode's precedence, over the modes the shell has. */
    const mode = v.flightMode === 'angle' ? 'ANGL' : (this.airmode ? 'AIR' : 'ACRO');
    this.put(LEFT_COL, 13, mode);
    this.values.ahRoll = ah.roll;
    this.values.ahPitch = ah.pitch;
    this.values.mode = mode;
  }

  /*
   * INAV's horizon and ladder, drawn where the real horizon is in the
   * picture: the camera's own orientation and field of view, which is what
   * INAV's osd_camera_uptilt and osd_camera_fov settings are for. The
   * rungs are the same line pushed to their elevation.
   */
  planeLadder(x) {
    const q = x.camera.quaternion;
    const { x: qx, y: qy, z: qz, w: qw } = q;
    /* World up seen from the camera: the y components of its right, up and
     * back axes. */
    const ux = 2 * (qx * qy + qw * qz);
    const uy = 1 - 2 * (qx * qx + qz * qz);
    const uz = 2 * (qy * qz - qw * qx);
    const nLen = Math.hypot(ux, uy);
    if (nLen < 0.2) {
      return null;
    }
    const nx = ux / nLen;
    const ny = uy / nLen;
    const elev = Math.asin(Math.max(-1, Math.min(1, -uz)));
    const w = this.canvas.width;
    const h = this.canvas.height;
    const f = (h / 2) / Math.tan((x.camera.fov * Math.PI) / 360);
    /* The line runs along (ny, -nx) in image space, y up. In screen space,
     * y down, the slope of a line of constant elevation is dy/dx: */
    if (Math.abs(ny) < 0.2) {
      return null;
    }
    const slope = nx / ny;
    const cxScreen = w / 2;
    const cyScreen = h / 2;
    const rung = (deg, half, gap, label) => {
      const a = elev - (deg * Math.PI) / 180;
      if (Math.abs(a) > 1.4) {
        return;
      }
      /* Distance from the centre along the sky normal, image space, then
       * the point on the line straight above or below the centre column. */
      const s = -f * Math.tan(a);
      const px = s * nx;
      const py = -s * ny;
      const lineY = (colX) => cyScreen + py + (colX - cxScreen - px) * slope;
      for (let dx = -half; dx <= half; dx += 1) {
        if (Math.abs(dx) < gap) {
          continue;
        }
        const col = MID_COL + dx;
        const colX = this.ox + (col + 0.5) * this.cw;
        const yy = lineY(colX);
        const row = Math.floor((yy - this.oy) / this.ch);
        if (row < LADDER_TOP || row > LADDER_BOTTOM) {
          continue;
        }
        this.bar(col, Math.floor(((yy - this.oy) / this.ch) * AH_SYMBOLS));
      }
      if (label) {
        for (const side of [-1, 1]) {
          const col = MID_COL + side * (half + 1);
          const colX = this.ox + (col + 0.5) * this.cw;
          const row = Math.floor((lineY(colX) - this.oy) / this.ch);
          if (row >= LADDER_TOP && row <= LADDER_BOTTOM) {
            if (side < 0) {
              this.putRight(col, row, label);
            } else {
              this.put(col, row, label);
            }
          }
        }
      }
    };
    rung(0, 9, 2, null);
    for (let deg = LADDER_STEP; deg <= 80; deg += LADDER_STEP) {
      rung(deg, 4, 2, String(deg));
      rung(-deg, 4, 2, String(-deg));
    }
    return { elevDeg: (elev * 180) / Math.PI, slope };
  }

  buildPlane(v, x) {
    const ladder = this.planeLadder(x);
    this.put(MID_COL - 1, MID_ROW, ch(SYM.PLANE_L) + ch(SYM.PLANE_C) + ch(SYM.PLANE_R));
    /* The heading tape: one character per 15 degrees, the cardinals as
     * letters, a tick every 45. */
    const head = this.att.heading;
    const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
    for (let dx = -6; dx <= 6; dx += 1) {
      const deg = (Math.round(head / 15) * 15 + dx * 15 + 720) % 360;
      let glyph = ch(SYM.HEAD_LINE);
      if (names[deg]) {
        glyph = names[deg];
      } else if (deg % 45 === 0) {
        glyph = ch(SYM.HEAD_DIV);
      }
      this.put(MID_COL + dx, HEADING_ROW, glyph);
    }
    const hdg = Math.round(head) % 360;
    this.putMid(HEADING_ROW + 1, `${pad(String(hdg), 3).replace(/ /g, '0')}°`);
    /* Speeds, left of centre. */
    const st = x.st;
    const vx = st[4];
    const vy = st[5];
    const vz = st[6];
    const gsKph = Math.hypot(vx, vy) * 3.6;
    const w = this.windNow(x.sim);
    const asKph = Math.hypot(vx - w[0], vy - w[1], vz) * 3.6;
    this.put(LEFT_COL, MID_ROW - 1, `${ch(SYM.GS)}${pad(String(Math.round(gsKph)), 3)}${ch(SYM.KMH)}`);
    this.put(LEFT_COL, MID_ROW + 1, `${ch(SYM.AIR)}${pad(String(Math.round(asKph)), 3)}${ch(SYM.KMH)}`);
    /* Altitude over home and the vario, right of centre. */
    const alt = x.pos.y - x.home.y;
    const altText = pad(String(Math.round(alt)), 4);
    this.putRight(RIGHT_COL, MID_ROW - 1, `${altText}${ch(SYM.ALT_M)}`);
    const vario = Math.abs(vz) < 0.05 ? 0 : vz;
    const arrow = vario > 0 ? ch(SYM.VARIO_UP) : (vario < 0 ? ch(SYM.VARIO_DN) : ' ');
    const vText = `${arrow}${pad(Math.abs(vario).toFixed(1), 4)}${ch(SYM.MS)}`;
    this.putRight(RIGHT_COL, MID_ROW + 1, vText);
    /* Home: the arrow turned by the bearing home less the heading, and the
     * horizontal distance to the launch point. */
    const dxh = x.home.x - x.pos.x;
    const dzh = x.home.z - x.pos.z;
    const dist = Math.hypot(dxh, dzh);
    let bearing = (Math.atan2(dxh, -dzh) * 180) / Math.PI - head;
    bearing = ((bearing % 360) + 360) % 360;
    const dir = Math.round(bearing / 22.5) % 16;
    this.putMid(HOME_ROW, `${ch(SYM.HOME)}${ch(SYM.ARROW + dir)}${pad(String(Math.round(dist)), 4)}M`);
    /* The flight mode, as INAV names it. */
    const mode = { manual: 'MANU', stab: 'ANGL', acro: 'ACRO' }[v.flightMode] || 'MANU';
    this.put(LEFT_COL, 13, mode);
    if (v.flaps != null) {
      this.put(LEFT_COL, 12, [str('osd.flaps_up'), str('osd.flaps_half'), str('osd.flaps_full')][v.flaps]);
    }
    Object.assign(this.values, {
      mode,
      heading: hdg,
      gsKph,
      asKph,
      alt,
      vario,
      homeDist: dist,
      homeDir: dir,
      horizonElevDeg: ladder ? ladder.elevDeg : null,
      flaps: v.flaps,
      home: { x: x.home.x, y: x.home.y, z: x.home.z },
    });
  }

  /* sim_wind: the air's own velocity, world x and y, so airspeed is the
   * speed through the air and not over the ground. */
  windNow(sim) {
    if (!sim || typeof sim.e.sim_wind !== 'function') {
      return this.wind;
    }
    if (!this.windPtr) {
      this.windPtr = sim.e.malloc(2 * 8);
    }
    sim.e.sim_wind(this.windPtr);
    const out = new Float64Array(sim.e.memory.buffer, this.windPtr, 2);
    this.wind[0] = out[0];
    this.wind[1] = out[1];
    return this.wind;
  }

  buildCommon(v, x, blinkOn) {
    /* Link and throttle along the top, the firmware's timers under them. */
    this.put(LEFT_COL, 0, `${ch(SYM.LQ)}${pad(String(this.lq), 3)}`);
    const thr = Math.round(Math.max(0, Math.min(1, v.throttle)) * 100);
    this.putRight(RIGHT_COL, 0, `${ch(SYM.THR)}${pad(String(thr), 3)}`);
    this.put(LEFT_COL, 1, `${ch(SYM.FLY_M)}${mmss(this.flyS)}`);
    this.putRight(RIGHT_COL, 1, `${ch(SYM.ON_M)}${mmss(this.onS)}`);
    /* The pack, bottom left: osdElementAverageCellVoltage over
     * osdElementMainBatteryVoltage, both off the filtered voltage. */
    const cellV = this.vFilt / x.cells;
    const sym = batterySymbol(cellV, this.batt);
    this.put(LEFT_COL, 14, `${sym}${cellV.toFixed(2)}V`);
    const packV = this.vFilt;
    this.put(LEFT_COL, 15, `${sym}${packV.toFixed(packV >= 10 ? 1 : 2)}V`);
    /* Current and consumption, bottom right. */
    const amps = x.armed ? x.st[19] : 0;
    this.putRight(RIGHT_COL, 14, `${pad(amps.toFixed(2), 6)}A`);
    this.putRight(RIGHT_COL, 15, `${pad(String(Math.round(this.mah)), 4)}${ch(SYM.MAH)}`);
    this.buildRace(v);
    this.buildWarnings(v, x, blinkOn);
    Object.assign(this.values, {
      lq: this.lq,
      throttle: thr,
      flyS: this.flyS,
      onS: this.onS,
      cellV,
      packV,
      amps,
      mah: this.mah,
      simT: this.lastSimT,
      battery: this.batt,
      roll: this.att.roll,
      pitch: this.att.pitch,
    });
  }

  /*
   * The game's own clocks, in the firmware's type, centred at the top: the
   * lap or the run, the gate, the gate's cue, last and best, and the
   * ghost's gap while it is lit. The first two rows have the timers either
   * side, so they are held narrow; the rest may run the width.
   */
  buildRace(v) {
    const up = (s) => s.toUpperCase();
    const fit = (s, n) => (s.length > n ? s.slice(0, n) : s);
    let clock;
    if (v.mode === 'freestyle') {
      if (v.runScored === false) {
        clock = str('osd.air', { t: v.lapMs != null && Number.isFinite(v.lapMs) ? formatTime(v.lapMs) : '0.00' });
      } else if (v.runTimed === false) {
        clock = str('osd.free');
      } else {
        const ready = v.runState !== 'flying' && v.runState !== 'over';
        clock = str('osd.run', { t: ready ? '2:00' : formatRunClock(Number.isFinite(v.runRemainMs) ? v.runRemainMs : 0) });
      }
      clock = fit(up(clock), RACE_NARROW);
      this.putMid(RACE_ROW, clock);
      this.values.clock = clock;
      return;
    }
    const running = v.lapMs != null && Number.isFinite(v.lapMs);
    clock = fit(up(str('osd.lap', { t: running ? formatTime(v.lapMs) : '0.00' })), RACE_NARROW);
    const gate = fit(up(str('osd.gate', { gate: v.gate, gateCount: v.gateCount })), RACE_NARROW);
    const cue = fit(up(v.gateCue || ''), RACE_WIDE);
    const parts = [];
    if (v.lastLapMs != null) {
      parts.push(str('osd.last', { t: formatTime(v.lastLapMs) }));
    }
    if (this.x.bestMs != null) {
      parts.push(str('osd.best', { t: formatTime(this.x.bestMs) }));
    }
    const laps = fit(up(parts.join('  ')), RACE_WIDE);
    let ghost = '';
    if (v.ghostGapMs != null) {
      const gap = `${v.ghostGapMs <= 0 ? '-' : '+'}${(Math.abs(v.ghostGapMs) / 1000).toFixed(2)}`;
      ghost = fit(up(str(v.ghostFinal ? 'osd.ghost_lap' : 'osd.ghost', { gap })), RACE_WIDE);
    }
    [clock, gate, cue, laps, ghost].forEach((line, i) => this.putMid(RACE_ROW + i, line));
    Object.assign(this.values, { clock, gate, cue, laps, ghost });
  }

  /* renderOsdWarning's order, over the conditions the shell can be in, and
   * osdElementDisarmed above them. */
  buildWarnings(v, x, blinkOn) {
    let warning = '';
    let blink = false;
    if (x.crashFlip) {
      warning = str('osd.crash_flip');
    } else if (v.launchState === 1 || v.launchState === 2) {
      warning = str('osd.launch', { deg: Math.round(v.launchPitch || 0) });
      blink = v.launchState === 2;
    } else if (this.lq < LQ_ALARM) {
      warning = str('osd.link_quality');
      blink = true;
    } else if (this.batt === 'critical') {
      warning = str('osd.land_now');
      blink = true;
    } else if (this.batt === 'warning') {
      warning = str('osd.low_battery');
      blink = true;
    } else if (!x.armed && !x.flown && this.vFilt / x.cells < CELL_FULL) {
      warning = str('osd.batt_not_full');
    }
    if (warning && (!blink || blinkOn)) {
      this.putMid(MID_ROW + 3, warning);
    }
    const disarmed = !x.armed && !x.crashFlip;
    if (disarmed) {
      this.putMid(MID_ROW + 2, str('osd.disarmed'));
    }
    this.values.warning = warning;
    this.values.disarmed = disarmed;
  }

  /* Only the cells that changed: a digit ticking over or the horizon
   * stepping is a handful of cells, not a screen. */
  paint() {
    const buf = this.buf;
    const shown = this.shown;
    const g = this.g;
    const a = this.atlas;
    let cells = 0;
    for (let i = 0; i < buf.length; i += 1) {
      const code = buf[i];
      if (code === shown[i]) {
        continue;
      }
      shown[i] = code;
      const col = i % OSD_COLS;
      const row = (i - col) / OSD_COLS;
      const x = this.ox + col * this.cw;
      const y = this.oy + row * this.ch;
      g.clearRect(x, y, this.cw, this.ch);
      if (code) {
        const slot = a.slot(code);
        g.drawImage(a.canvas, (slot % a.per) * a.w, Math.floor(slot / a.per) * a.h, a.w, a.h, x, y, a.w, a.h);
      }
      cells += 1;
    }
    if (cells) {
      this.stats.paints += 1;
      this.stats.cells += cells;
    }
  }

  /* The grid as 16 lines of text, symbols as '#', for the check and for a
   * human reading a log. */
  rowsText() {
    const out = [];
    for (let r = 0; r < OSD_ROWS; r += 1) {
      let line = '';
      for (let c = 0; c < OSD_COLS; c += 1) {
        const code = this.shown[r * OSD_COLS + c];
        line += !code || code === 0xFFFF ? ' ' : (code >= P ? '#' : String.fromCharCode(code));
      }
      out.push(line);
    }
    return out;
  }
}
