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
 *   1. Character buffers. Every tick the elements write codes into them,
 *      exactly as the firmware does. There are two, each on its own canvas:
 *      the readouts, on a grid of small cells over the whole screen, so the
 *      text is small and each group sits on its own edge or corner the way
 *      an HD goggle OSD lays it out; and the instruments, on the 30 by 16
 *      PAL grid over nine tenths of the screen, so the crosshair, the
 *      horizon, the sidebars, the ladder and the heading tape keep the size
 *      and the angles they have in analog goggles.
 *   2. A font ROM per buffer. Each character is drawn once, white with a
 *      black outline, into an atlas canvas at the cell size the screen
 *      gives, and redrawn only when the screen changes size.
 *   3. The screen is each buffer blitted through its atlas: one drawImage
 *      per changed cell.
 *
 * It ticks at OSD_HZ, not per frame, and a tick whose buffers came out
 * identical to the last does not touch the canvases at all. The sizes come
 * from the resize event. The one layout it reads is where the game's own
 * chips and stick gimbals are (Report bug, Pause, Aircraft, the music
 * dock, the keyboard's gimbals), once a second, so that no readout is laid
 * on one of them.
 *
 * WHAT IS NOT MODELLED, said here once so the readouts do not pretend:
 *
 *   - A quad's pack never empties. Its plant holds the open circuit
 *     voltage the pilot chose and sags it under load (src/native/plant.c),
 *     so the voltage here falls under throttle and comes back off it, and
 *     LOW BATTERY is Betaflight's own filtered-voltage test against that
 *     sag. The mAh count is the plant's current integrated on the sim
 *     clock. A fixed wing's pack DOES empty (docs/POWER-STAGE1.md): the
 *     plant counts the charge drawn and walks the open circuit voltage
 *     down the LiPo curve, so the mAh here is the plant's own count and
 *     the same Betaflight test fires when the real pack gets low. A glow
 *     engine burns a tank instead, and its fuel is shown and warned on.
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

/* The instruments' grid, the PAL one. */
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
/* The instrument grid's share of the screen. A goggle shows the OSD inside
 * the overscan, so the outer cells never touch the frame's edge. */
const GRID_W = 0.9;
const GRID_H = 0.9;
/* How far an instrument cell may be stretched from square, width over
 * height and height over width. */
const CELL_WIDEST = 1.4;
const CELL_TALLEST = 1.8;

/*
 * THE TYPE. The owner's yardstick is the music player's song title, top
 * left in flight: no OSD character may stand taller than it. So the size
 * is read off that element (11 px, 10 on a narrow phone), and of the sizes
 * from there down to TYPE_FLOOR of it, in steps of TYPE_STEP, the one whose
 * digits come out tallest without standing taller than the title's is
 * taken. It is measured in pixels, not font metrics, because hinting snaps
 * a bold monospace digit to whole pixels (8 of them for anything from
 * 10.25 to 11.25 px here) where the title's sans is not snapped at all
 * (7.47 at 11 px), and the snapping is not even monotonic in the size.
 * TEXT_PX is the size when there is no title to read.
 */
const TEXT_PX = 11;
const TYPE_STEP = 0.25;
const TYPE_FLOOR = 0.6;
const TYPE_REF = '.music-title';
/* A readout cell, in ems: the monospace advance, 0.6, and most of the one
 * pixel border each side, so neighbours' borders just meet the way a
 * MAX7456's do; a line, with air between the rows of outlined type. */
const CELL_W_EM = 0.72;
const CELL_H_EM = 1.35;
/* Where a character's middle sits in its cell, as a share of the height.
 * The heading tape's letters sit on the tape's line, 0.7 down. */
const TEXT_Y = 0.54;
const TAPE_Y = 0.7;
/* How far the readouts stay off the screen's edge, CSS px: the gutter the
 * game's own chips keep. */
const EDGE_PX = 16;
/* How often the game's chips and gimbals are looked for (readKeepOut),
 * since they come and go with the screen. */
const KEEP_OUT_MS = 1000;
/* Device pixels per CSS pixel. A 3x phone gets its own, so the small type
 * is drawn at the pixels it is shown at. */
const MAX_DPR = 3;

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
/* A plane's ladder: a rung every ten degrees, INAV's default interval. Its
 * top is under the heading tape and the home arrow, wherever the race
 * readout has pushed them; its bottom keeps it above the stick gimbals. */
const LADDER_STEP = 10;
const LADDER_BOTTOM = 12;
/* The widest line the race readout may take, top centre. */
const RACE_WIDE = 28;
/* The widest line of a banner, the PAL grid's own width, and the widest
 * the readout grid is happy to give it on a phone. */
const BANNER_WIDE = 30;
/* The home arrow's half size in its instrument cell, as drawSymbol draws
 * it, so the row it takes can be chosen clear of the heading. */
const ARROW_HALF = 0.42;

/*
 * THE FONT. Printable ASCII is itself; every symbol is a private use code
 * point, named here the way osd_symbols.h names them. Codes are what the
 * buffers hold and what the atlases are keyed by.
 */
const P = 0xE000;
const SYM = {
  BATT: P, /* P + 0..6, full to empty, battery.c's seven fill levels */
  BATT_CRIT: P + 7,
  HOME: P + 16,
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
/*
 * The firmware fonts spell a label (THR, LQ) or a unit (mAh, km/h) in one
 * small character. In a cell sized for 11 px type that is letters three
 * pixels wide, which nobody reads, so here a label spans the cells its
 * letters need: the same small letters, drawn once across the span, each
 * cell of it a code of its own from P + 64 on. The launch countdown's digit
 * is the same thing the other way: one character at twice the type size,
 * two cells wide and two rows tall, the one exception to the rule that no
 * HUD text stands taller than the song title, because a single 11 px "3"
 * is unreadable in a goggle. LABEL_PART maps a code to the text, its span
 * in cells and rows, which cell of the span the code is, and the size as a
 * share of the type's.
 */
const LABELS = [
  ['LQ', 'LQ', 2, 1, 0.78],
  ['THR', 'THR', 2, 1, 0.78],
  ['ON_M', 'ON', 2, 1, 0.78],
  ['FLY_M', 'FLY', 2, 1, 0.78],
  ['MAH', 'mAh', 2, 1, 0.78],
  ['KMH', 'KM/H', 3, 1, 0.78],
  ['MS', 'M/S', 2, 1, 0.78],
  ['AIR', 'AS', 2, 1, 0.78],
  ['GS', 'GS', 2, 1, 0.78],
  ...'0123456789'.split('').map((d) => [`BIG_${d}`, d, 2, 2, 2]),
];
const LABEL_PART = new Map();
LABELS.reduce((code, [name, text, cols, rows, size]) => {
  SYM[name] = code;
  for (let j = 0; j < rows; j += 1) {
    for (let k = 0; k < cols; k += 1) {
      LABEL_PART.set(code + j * cols + k, [text, cols, rows, k, j, size]);
    }
  }
  return code + cols * rows;
}, P + 64);

const ch = (code) => String.fromCharCode(code);
/* A label's rows, each the codes of its cells. */
const labelRows = (code) => {
  const [, cols, rows] = LABEL_PART.get(code);
  const out = [];
  for (let j = 0; j < rows; j += 1) {
    let line = '';
    for (let k = 0; k < cols; k += 1) {
      line += ch(code + j * cols + k);
    }
    out.push(line);
  }
  return out;
};
const label = (code) => labelRows(code)[0];

/*
 * The page's rules for the OSD, injected once rather than shipped as a
 * stylesheet: the shell has no .css file and neither of its servers
 * (scripts/serve.js, tests/lib/server.js) knows the type, so a link would
 * be refused in the harness and pass on the deploy, the worst split.
 *
 * With the OSD up, the game's clock, corners, launch overlay and banner
 * step aside, because the OSD carries all of them: the banner's text (the
 * takeoff prompt, the countdown, Crashed, Wrecked, the lap flash, a notice)
 * is drawn by buildBanner in the OSD's own type, where a Betaflight OSD
 * puts its warnings. The banner element keeps its text for the screen
 * reader's announcer. The stick gimbals, the weight slider and the score
 * stay: they are the game's aids, not the flight controller's.
 */
const OSD_CSS = `
canvas.fpv-osd { position: absolute; inset: 0; width: 100%; height: 100%; display: none; pointer-events: none; }
#ui.fpv-osd-on .osd-top, #ui.fpv-osd-on .osd-corner, #ui.fpv-osd-on .osd-launch, #ui.fpv-osd-on .banner { display: none; }
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
 * How tall "100" stands in a font, in pixels of white ink, on a whole
 * pixel baseline, with the font `setFont` puts on the context: each row
 * counts for as much of a pixel as its whitest pixel is white. `pitch` 0
 * sets it as a line of text is set; otherwise
 * each digit starts on a whole pixel that far from the last, as the atlas
 * puts one to a cell, since the phase of a stem in its pixel moves this
 * measure by a few tenths. scripts/osd-check.js measures the same way.
 */
let inkCanvas = null;
function inkHeight(setFont, size, pitch) {
  if (!inkCanvas) {
    inkCanvas = document.createElement('canvas');
  }
  inkCanvas.width = Math.ceil(size * 4);
  inkCanvas.height = Math.ceil(size * 3);
  const g = inkCanvas.getContext('2d', { willReadFrequently: true });
  setFont(g, size);
  g.fillStyle = '#fff';
  g.textBaseline = 'alphabetic';
  const x = Math.round(size / 2);
  const y = Math.round(size * 2);
  if (pitch) {
    ['1', '0', '0'].forEach((d, i) => g.fillText(d, x + i * pitch, y));
  } else {
    g.fillText('100', x, y);
  }
  const img = g.getImageData(0, 0, inkCanvas.width, inkCanvas.height);
  let sum = 0;
  for (let y = 0; y < img.height; y += 1) {
    let m = 0;
    for (let x = 0; x < img.width; x += 1) {
      const i = (y * img.width + x) * 4;
      m = Math.max(m, (Math.min(img.data[i], img.data[i + 1], img.data[i + 2]) * img.data[i + 3]) / 65025);
    }
    sum += m;
  }
  return sum;
}

/*
 * THE GLYPHS, drawn once per size into an atlas `a`: a cell a.w by a.h
 * device pixels, with a.u the height of one MAX7456 pixel (a cell is 18 of
 * them tall) for the shapes. The ink is not scaled with the cell: a white
 * stroke a.core wide with a.edge of black round it, one CSS pixel at the
 * least, so an instrument line is as fine as the type beside it.
 */
function inkLine(g, a, build) {
  g.beginPath();
  build();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = '#000';
  g.lineWidth = a.core + 2 * a.edge;
  g.stroke();
  g.strokeStyle = '#fff';
  g.lineWidth = a.core;
  g.stroke();
}

function inkFill(g, a, build) {
  g.beginPath();
  build();
  g.lineJoin = 'round';
  g.strokeStyle = '#000';
  g.lineWidth = 2 * a.edge;
  g.stroke();
  g.fillStyle = '#fff';
  g.fill();
}

/* The OSD's type. */
function osdFont(g, size) {
  g.font = `bold ${size}px ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, "Liberation Mono", monospace`;
}

/* Centred on x and on y, the capitals' middle, with the left edge and the
 * baseline on whole pixels, so the hinted glyph lands crisp and as tall as
 * inkHeight says. `maxW` only ever squeezes. The outline is stroked
 * centred on the glyph's edge and the fill laid over it, so a.edge of it
 * shows outside. */
function inkText(g, a, text, x, y, size, maxW) {
  osdFont(g, size);
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  const wide = g.measureText(text).width;
  const sx = wide > maxW ? maxW / wide : 1;
  const cap = g.measureText('H').actualBoundingBoxAscent;
  g.save();
  g.translate(Math.round(x - (wide * sx) / 2), Math.round(y + cap / 2));
  g.scale(sx, 1);
  g.lineJoin = 'round';
  g.strokeStyle = '#000';
  g.lineWidth = 2 * a.edge;
  g.strokeText(text, 0, 0);
  g.fillStyle = '#fff';
  g.fillText(text, 0, 0);
  g.restore();
}

/* One cell of a label: the whole label is drawn centred on its span, in
 * this cell's coordinates, and the slot's clip keeps this cell's slice. */
function drawLabel(g, code, a) {
  const [text, cols, rows, k, j, size] = LABEL_PART.get(code);
  inkText(g, a, text, (cols / 2 - k) * a.w, (rows * TEXT_Y - j) * a.h, a.textPx * size, cols * a.w - 2 * a.edge);
}

function drawSymbol(g, code, a) {
  const { w, h, u } = a;
  const cx = w / 2;
  const cy = h / 2;
  if (LABEL_PART.has(code)) {
    drawLabel(g, code, a);
    return;
  }
  if (code >= SYM.AH_BAR && code < SYM.AH_BAR + AH_SYMBOLS) {
    const y = h * ((code - SYM.AH_BAR) + 0.5) / AH_SYMBOLS;
    inkLine(g, a, () => { g.moveTo(u, y); g.lineTo(w - u, y); });
    return;
  }
  if (code >= SYM.ARROW && code < SYM.ARROW + 16) {
    const ang = ((code - SYM.ARROW) * Math.PI) / 8;
    const s = Math.min(w, h) * ARROW_HALF;
    const pt = (px, py) => [cx + px * Math.cos(ang) - py * Math.sin(ang), cy + px * Math.sin(ang) + py * Math.cos(ang)];
    inkFill(g, a, () => {
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
    const bw = Math.min(w * 0.7, 8 * u);
    const bh = Math.min(h * 0.66, 13 * u);
    const x0 = cx - bw / 2;
    const y0 = cy - bh / 2 + u;
    const nub = Math.max(a.core, 1.5 * u);
    inkLine(g, a, () => {
      g.rect(x0, y0, bw, bh);
      g.moveTo(cx - bw * 0.25, y0 - nub);
      g.lineTo(cx + bw * 0.25, y0 - nub);
    });
    if (code === SYM.BATT_CRIT) {
      inkLine(g, a, () => { g.moveTo(cx - bw * 0.3, cy + u); g.lineTo(cx + bw * 0.3, cy + u); });
      return;
    }
    /* Filled up to the white outline's inside, so a full pack is a solid
     * cell and an emptying one opens from the top. */
    const level = 6 - (code - SYM.BATT);
    const inset = a.core / 2;
    if (level > 0) {
      const fh = ((bh - 2 * inset) * level) / 6;
      g.fillStyle = '#fff';
      g.fillRect(x0 + inset, y0 + bh - inset - fh, bw - 2 * inset, fh);
    }
    return;
  }
  switch (code) {
    case SYM.HOME:
      inkFill(g, a, () => {
        const s = Math.min(w * 0.5, h * 0.3);
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
      const s = Math.min(w * 0.5, h * 0.3);
      inkFill(g, a, () => {
        g.moveTo(cx, cy + d * s);
        g.lineTo(cx + s * 0.8, cy);
        g.lineTo(cx - s * 0.8, cy);
        g.closePath();
      });
      inkLine(g, a, () => { g.moveTo(cx, cy); g.lineTo(cx, cy - d * s); });
      return;
    }
    case SYM.AH_CL:
      inkLine(g, a, () => { g.moveTo(w * 0.35, cy); g.lineTo(w - u, cy); });
      return;
    case SYM.AH_CR:
      inkLine(g, a, () => { g.moveTo(u, cy); g.lineTo(w * 0.65, cy); });
      return;
    case SYM.AH_C:
      inkLine(g, a, () => {
        g.moveTo(u, cy);
        g.lineTo(cx - 2.5 * u, cy);
        g.moveTo(cx + 2.5 * u, cy);
        g.lineTo(w - u, cy);
        g.moveTo(cx, cy - 2.5 * u);
        g.lineTo(cx, cy - 6 * u);
      });
      return;
    case SYM.AH_DEC:
      inkLine(g, a, () => { g.moveTo(cx - 2 * u, cy); g.lineTo(cx + 2 * u, cy); });
      return;
    case SYM.AH_LEFT:
    case SYM.AH_RIGHT: {
      /* The level markers point in, at the crosshair. */
      const d = code === SYM.AH_LEFT ? 1 : -1;
      const s = Math.min(w, h) * 0.3;
      inkFill(g, a, () => {
        g.moveTo(cx + d * s, cy);
        g.lineTo(cx - d * s * 0.7, cy - s * 0.8);
        g.lineTo(cx - d * s * 0.7, cy + s * 0.8);
        g.closePath();
      });
      return;
    }
    case SYM.PLANE_L:
      inkLine(g, a, () => { g.moveTo(u, cy); g.lineTo(w, cy); g.lineTo(w, cy + 3 * u); });
      return;
    case SYM.PLANE_R:
      inkLine(g, a, () => { g.moveTo(w - u, cy); g.lineTo(0, cy); g.lineTo(0, cy + 3 * u); });
      return;
    case SYM.PLANE_C:
      inkLine(g, a, () => { g.arc(cx, cy, 2.5 * u, 0, Math.PI * 2); g.moveTo(cx, cy - 2.5 * u); g.lineTo(cx, cy - 5.5 * u); });
      return;
    case SYM.HEAD_LINE:
      inkLine(g, a, () => { g.moveTo(0, h * TAPE_Y); g.lineTo(w, h * TAPE_Y); });
      return;
    case SYM.HEAD_DIV:
      inkLine(g, a, () => { g.moveTo(0, h * TAPE_Y); g.lineTo(w, h * TAPE_Y); g.moveTo(cx, h * TAPE_Y); g.lineTo(cx, h * 0.4); });
      return;
    default:
      break;
  }
}

/*
 * A font ROM. A glyph is drawn the first time a buffer asks for it, into
 * the next free slot, and kept until the cell size changes. MAX7456 fonts
 * have capitals only, so text is upper cased before it reaches here.
 * `s` is device pixels per CSS pixel, `textPx` the type's size in device
 * pixels and `textY` where a character's middle sits in the cell.
 */
class Atlas {
  constructor(w, h, s, textPx, textY) {
    this.w = w;
    this.h = h;
    this.u = h / 18;
    this.edge = s;
    this.core = Math.max(s, Math.min(2 * this.u, 2 * s));
    this.textPx = textPx;
    this.textY = textY;
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
      drawSymbol(g, code, this);
    } else {
      inkText(g, this, String.fromCharCode(code), this.w / 2, this.h * this.textY, this.textPx, this.w);
    }
    g.restore();
    return i;
  }
}

/*
 * One character buffer, the grid it is laid on, its font and the canvas it
 * is painted to. `ox`, `oy` are where cell 0,0 starts, device pixels.
 */
class Layer {
  constructor(root, name) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = `fpv-osd fpv-osd-${name}`;
    this.canvas.setAttribute('aria-hidden', 'true');
    this.g = this.canvas.getContext('2d');
    /* First child, so every banner, dialog and menu paints over it. */
    root.prepend(this.canvas);
    this.cols = 0;
    this.rows = 0;
    this.cw = 1;
    this.ch = 1;
    this.ox = 0;
    this.oy = 0;
    this.buf = new Uint16Array(0);
    this.shown = new Uint16Array(0);
    this.atlas = null;
  }

  /* A new grid. Sizing the canvas clears it, so every cell is repainted. */
  grid(w, h, cols, rows, cw, chh, ox, oy, atlas) {
    this.canvas.width = w;
    this.canvas.height = h;
    Object.assign(this, { cols, rows, cw, ch: chh, ox, oy, atlas });
    if (this.buf.length !== cols * rows) {
      this.buf = new Uint16Array(cols * rows);
      this.shown = new Uint16Array(cols * rows);
    }
    this.shown.fill(0xFFFF);
  }

  put(col, row, text) {
    if (row < 0 || row >= this.rows) {
      return;
    }
    for (let i = 0; i < text.length; i += 1) {
      const c = col + i;
      if (c >= 0 && c < this.cols) {
        const code = text.charCodeAt(i);
        this.buf[row * this.cols + c] = code === 32 ? 0 : code;
      }
    }
  }

  /* Whether text of that length would land on nothing but empty cells. */
  free(col, row, len) {
    if (row < 0 || row >= this.rows || col < 0 || col + len > this.cols) {
      return false;
    }
    for (let c = col; c < col + len; c += 1) {
      if (this.buf[row * this.cols + c]) {
        return false;
      }
    }
    return true;
  }

  /* One horizon bar glyph at a cell and a ninth of a row. */
  bar(col, ninths) {
    if (ninths < 0) {
      return;
    }
    const row = Math.floor(ninths / AH_SYMBOLS);
    if (row < 0 || row >= this.rows) {
      return;
    }
    this.buf[row * this.cols + col] = SYM.AH_BAR + (ninths % AH_SYMBOLS);
  }

  /* Only the cells that changed: a digit ticking over or the horizon
   * stepping is a handful of cells, not a screen. */
  paint() {
    const { buf, shown, g, atlas: a } = this;
    let cells = 0;
    for (let i = 0; i < buf.length; i += 1) {
      const code = buf[i];
      if (code === shown[i]) {
        continue;
      }
      shown[i] = code;
      const col = i % this.cols;
      const row = (i - col) / this.cols;
      const x = this.ox + col * this.cw;
      const y = this.oy + row * this.ch;
      g.clearRect(x, y, this.cw, this.ch);
      if (code) {
        const slot = a.slot(code);
        g.drawImage(a.canvas, (slot % a.per) * a.w, Math.floor(slot / a.per) * a.h, a.w, a.h, x, y, a.w, a.h);
      }
      cells += 1;
    }
    return cells;
  }

  /* The grid as lines of text, symbols as '#', for the check and for a
   * human reading a log. */
  rowsText() {
    const out = [];
    for (let r = 0; r < this.rows; r += 1) {
      let line = '';
      for (let c = 0; c < this.cols; c += 1) {
        const code = this.shown[r * this.cols + c];
        line += !code || code === 0xFFFF ? ' ' : (code >= P ? '#' : String.fromCharCode(code));
      }
      out.push(line);
    }
    return out;
  }
}

/*
 * THE OSD. One per shell. feed() is called on every flight frame with the
 * values the game already computes for its own readout; it only integrates
 * what has to be integrated on the sim clock. tick() decides visibility and,
 * at OSD_HZ, rebuilds the buffers and paints them.
 */
export class FpvOsd {
  constructor(root) {
    this.root = root;
    const style = document.createElement('style');
    style.textContent = OSD_CSS;
    document.head.append(style);
    /* The readouts over the instruments: each prepends, so the last made
     * is the one underneath. */
    this.t = new Layer(root, 'text');
    this.i = new Layer(root, 'inst');
    this.layers = [this.i, this.t];
    this.s = 1;
    this.textPx = TEXT_PX;
    this.typeKey = null;
    this.keepOut = [];
    this.keepOutAt = 0;
    this.placed = [];
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
     * the grids as text, where everything is and what it costs. */
    window.__fpvOsd = () => ({
      on: this.on,
      rows: this.t.rowsText(),
      instRows: this.i.rowsText(),
      values: { ...this.values },
      stats: { ...this.stats },
      layout: this.layoutOut(),
    });
  }

  /* The layout in CSS pixels, but for the canvas, which is in device ones. */
  layoutOut() {
    const s = this.s;
    const T = this.t;
    const grid = (L) => ({ cols: L.cols, rows: L.rows, cw: L.cw / s, ch: L.ch / s, ox: L.ox / s, oy: L.oy / s });
    const rect = (r) => ({ x: r.x / s, y: r.y / s, w: r.w / s, h: r.h / s });
    return {
      w: T.canvas.width,
      h: T.canvas.height,
      scale: s,
      textPx: this.textPx,
      text: grid(T),
      inst: grid(this.i),
      readouts: this.placed.map((b) => ({
        id: b.id,
        ...rect({ x: T.ox + b.col * T.cw, y: T.oy + b.row * T.ch, w: b.cols * T.cw, h: b.rows * T.ch }),
      })),
      keepOut: this.keepOut.map(rect),
    };
  }

  resetRun() {
    this.lastSimT = null;
    this.lastWall = null;
    this.mah = 0;
    this.power = null;
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
   * position, the camera, home, the link, the arming picture and the
   * game's banner text.
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
    /* A pack that drains is the plant's to count, and at rest it reads the
     * curve's voltage for what is left, not the voltage it was seated at. */
    const pw = x.power;
    const drains = Boolean(pw && pw.capacityC > 0);
    const rest = drains ? pw.cellOcv * x.cells : x.restVolts;
    const volts = x.armed ? st[18] : rest;
    if (drains) {
      this.mah = pw.chargeC / 3.6;
    } else {
      this.mah += (amps * dt * 1000) / 3600;
    }
    this.power = pw || null;
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
      for (const L of this.layers) {
        L.canvas.style.display = on ? 'block' : 'none';
        L.shown.fill(0xFFFF);
      }
      this.root.classList.toggle('fpv-osd-on', on);
      this.nextTickMs = 0;
      this.keepOutAt = 0;
    }
    if (paused !== this.dim) {
      this.dim = paused;
      for (const L of this.layers) {
        L.canvas.style.opacity = paused ? '0.4' : '1';
      }
    }
    if (!on || nowMs < this.nextTickMs) {
      return;
    }
    const t0 = performance.now();
    this.nextTickMs = Math.max(this.nextTickMs + 1000 / OSD_HZ, nowMs);
    if (this.sizeDirty) {
      this.resize();
    }
    if (nowMs >= this.keepOutAt) {
      this.readKeepOut();
      this.keepOutAt = nowMs + KEEP_OUT_MS;
    }
    this.build(nowMs);
    this.values.at = nowMs;
    const cells = this.t.paint() + this.i.paint();
    if (cells) {
      this.stats.paints += 1;
      this.stats.cells += cells;
    }
    const ms = performance.now() - t0;
    this.stats.ticks += 1;
    this.stats.tickMs += ms;
    this.stats.worstTickMs = Math.max(this.stats.worstTickMs, ms);
  }

  resize() {
    this.sizeDirty = false;
    this.keepOutAt = 0;
    const s = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    this.s = s;
    const w = Math.max(1, Math.round(window.innerWidth * s));
    const h = Math.max(1, Math.round(window.innerHeight * s));
    this.textPx = this.typeSize();
    const px = this.textPx * s;
    /* The instruments. A MAX7456 cell is 12 by 18. A 16:9 goggle
     * stretches it to about square, which is what a landscape screen gets;
     * past that the cell is held to a sane shape and the grid shrinks
     * toward the crosshair instead, or a phone held upright would draw
     * every glyph as a sliver. Cell MID_COL, MID_ROW is centred. */
    const cw = Math.floor((w * GRID_W) / OSD_COLS);
    const chh = Math.floor((h * GRID_H) / OSD_ROWS);
    const icw = Math.min(cw, Math.floor(chh * CELL_WIDEST));
    const ich = Math.min(chh, Math.floor(cw * CELL_TALLEST));
    this.i.grid(w, h, OSD_COLS, OSD_ROWS, icw, ich,
      Math.round(w / 2 - (MID_COL + 0.5) * icw), Math.round(h / 2 - (MID_ROW + 0.5) * ich),
      new Atlas(icw, ich, s, px, TAPE_Y));
    /* The readouts: as many cells of the type's size as fit inside the
     * edge, the grid centred so its sides are the same distance in. */
    const tcw = Math.max(1, Math.round(px * CELL_W_EM));
    const tch = Math.max(1, Math.round(px * CELL_H_EM));
    const edge = EDGE_PX * s;
    const cols = Math.max(1, Math.floor((w - 2 * edge) / tcw));
    const rows = Math.max(1, Math.floor((h - 2 * edge) / tch));
    this.t.grid(w, h, cols, rows, tcw, tch, Math.round((w - cols * tcw) / 2), Math.round((h - rows * tch) / 2),
      new Atlas(tcw, tch, s, px, TEXT_Y));
  }

  /* The type's size in CSS pixels. See TEXT_PX and inkHeight. It is kept
   * while the title's font and the pixel ratio stay what they were. */
  typeSize() {
    const ref = document.querySelector(TYPE_REF);
    const cs = ref ? getComputedStyle(ref) : null;
    const px = cs ? parseFloat(cs.fontSize) : NaN;
    if (!(px > 0)) {
      return TEXT_PX;
    }
    const s = this.s;
    const key = `${cs.fontWeight} ${px} ${cs.fontFamily} ${s}`;
    if (key === this.typeKey) {
      return this.textPx;
    }
    this.typeKey = key;
    const theirs = inkHeight((g, size) => { g.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`; }, px * s, 0);
    let best = px * TYPE_FLOOR;
    let bestInk = -1;
    for (let size = px; size >= px * TYPE_FLOOR; size -= TYPE_STEP) {
      const ink = inkHeight(osdFont, size * s, Math.round(size * s * CELL_W_EM));
      if (ink <= theirs && ink > bestInk) {
        best = size;
        bestInk = ink;
      }
    }
    return best;
  }

  /*
   * Where the game's own things over a flight are, which no readout may
   * sit on, in device pixels on the OSD's canvas: its chips and the
   * keyboard's stick gimbals, which reach the bottom corners of an upright
   * phone. The thumb sticks' plates are not here: they are most of a
   * phone's lower half, and a readout over their glass is how a thumb pilot
   * reads it anyway.
   */
  readKeepOut() {
    const s = this.s;
    const o = this.root.getBoundingClientRect();
    this.keepOut.length = 0;
    for (const el of document.querySelectorAll('.bug-chip, .music-dock, .osd-gimbal')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        this.keepOut.push({ x: (r.left - o.left) * s, y: (r.top - o.top) * s, w: r.width * s, h: r.height * s });
      }
    }
  }

  /* The first thing a box of readout cells would sit on: a readout placed
   * before it this tick, a cell already written (a ladder number), or one
   * of the game's chips and gimbals. */
  blocker(col, row, cols, rows) {
    const T = this.t;
    const hits = (b) => b.col < col + cols && col < b.col + b.cols && b.row < row + rows && row < b.row + b.rows;
    for (const b of this.placed) {
      if (hits(b)) {
        return b;
      }
    }
    for (let r = row; r < row + rows; r += 1) {
      if (r >= 0 && r < T.rows && !T.free(Math.max(0, col), r, Math.min(cols, T.cols - Math.max(0, col)))) {
        return { col, row: r, cols, rows: 1 };
      }
    }
    for (const r of this.keepOut) {
      const c0 = Math.floor((r.x - T.ox) / T.cw);
      const r0 = Math.floor((r.y - T.oy) / T.ch);
      const b = {
        col: c0, row: r0, cols: Math.ceil((r.x + r.w - T.ox) / T.cw) - c0, rows: Math.ceil((r.y + r.h - T.oy) / T.ch) - r0,
      };
      if (hits(b)) {
        return b;
      }
    }
    return null;
  }

  /*
   * A readout: lines of text anchored to the screen. `ax` is 'l', 'r' or
   * 'c' (the lines flush left, flush right or each centred), or a column;
   * `ay` is 't', 'b' or 'm', or a row. It is then moved, away from the edge
   * it hangs from, until it is clear of the game's chips and of every
   * readout placed before it this tick, so the order of the calls is the
   * order of precedence.
   */
  readout(id, ax, ay, lines) {
    const T = this.t;
    const n = lines.length;
    let wide = 0;
    for (const line of lines) {
      wide = Math.max(wide, line.length);
    }
    if (!wide) {
      return null;
    }
    let col = ax;
    if (ax === 'l') {
      col = 0;
    } else if (ax === 'r') {
      col = T.cols - wide;
    } else if (ax === 'c') {
      col = Math.round((T.canvas.width / 2 - T.ox) / T.cw - wide / 2);
    }
    let row = ay;
    if (ay === 't') {
      row = 0;
    } else if (ay === 'b') {
      row = T.rows - n;
    } else if (ay === 'm') {
      row = Math.round((T.canvas.height / 2 - T.oy) / T.ch - n / 2);
    }
    for (let tries = 0; tries < 16; tries += 1) {
      const hit = this.blocker(col, row, wide, n);
      if (!hit) {
        break;
      }
      row = ay === 'b' ? hit.row - n : hit.row + hit.rows;
    }
    for (let k = 0; k < n; k += 1) {
      const line = lines[k];
      let c = col;
      if (ax === 'r') {
        c = col + wide - line.length;
      } else if (ax === 'c') {
        c = col + Math.floor((wide - line.length) / 2);
      }
      T.put(c, row + k, line);
    }
    const b = { id, col, row, cols: wide, rows: n };
    this.placed.push(b);
    return b;
  }

  /* The readout row a device pixel height falls in. */
  textRow(y) {
    return Math.floor((y - this.t.oy) / this.t.ch);
  }

  build(nowMs) {
    const v = this.view;
    const x = this.x;
    for (const L of this.layers) {
      L.buf.fill(0);
    }
    this.placed.length = 0;
    attitudeOf(x.quat, this.att);
    const blinkOn = Math.floor((nowMs / 1000) * BLINK_HZ) % 2 === 0;
    this.buildCorners(v, x);
    const race = this.buildRace(v);
    if (x.fixedWing) {
      this.buildPlane(v, x, race);
    } else {
      this.buildQuad();
    }
    this.buildWarnings(v, x, blinkOn);
    this.buildBanner(x);
  }

  /*
   * The four corners. Link and the armed timer top left, throttle and the
   * on timer top right, the flight mode over the pack bottom left
   * (osdElementAverageCellVoltage over osdElementMainBatteryVoltage, both
   * off the filtered voltage), current and consumption bottom right.
   */
  buildCorners(v, x) {
    const thr = Math.round(Math.max(0, Math.min(1, v.throttle)) * 100);
    this.readout('lq-fly', 'l', 't', [`${label(SYM.LQ)}${pad(String(this.lq), 3)}`, `${label(SYM.FLY_M)}${mmss(this.flyS)}`]);
    this.readout('thr-on', 'r', 't', [`${label(SYM.THR)}${pad(String(thr), 3)}`, `${label(SYM.ON_M)}${mmss(this.onS)}`]);
    /* osdElementFlymode's precedence over the modes the shell has, and
     * for a plane INAV's names. */
    const mode = x.fixedWing
      ? ({ manual: 'MANU', stab: 'ANGL', acro: 'ACRO' }[v.flightMode] || 'MANU')
      : (v.flightMode === 'angle' ? 'ANGL' : (this.airmode ? 'AIR' : 'ACRO'));
    const cellV = this.vFilt / x.cells;
    const packV = this.vFilt;
    const sym = batterySymbol(cellV, this.batt);
    const pack = [mode, `${sym}${cellV.toFixed(2)}V`, `${sym}${packV.toFixed(packV >= 10 ? 1 : 2)}V`];
    if (x.fixedWing && v.flaps != null) {
      pack.unshift([str('osd.flaps_up'), str('osd.flaps_half'), str('osd.flaps_full')][v.flaps]);
    }
    this.readout('mode-batt', 'l', 'b', pack);
    const amps = x.armed ? x.st[19] : 0;
    /* A glow engine's tank, over the current. */
    const fuel = this.power && this.power.tankM3 > 0 ? Math.round(this.power.fuelFrac * 100) : null;
    const draw = [`${pad(amps.toFixed(2), 6)}A`, `${pad(String(Math.round(this.mah)), 4)}${label(SYM.MAH)}`];
    if (fuel !== null) {
      draw.unshift(str('osd.fuel', { pct: pad(String(fuel), 3) }));
    }
    this.readout('amps-mah', 'r', 'b', draw);
    Object.assign(this.values, {
      mode,
      lq: this.lq,
      throttle: thr,
      flyS: this.flyS,
      onS: this.onS,
      cellV,
      packV,
      amps,
      mah: this.mah,
      fuel,
      simT: this.lastSimT,
      battery: this.batt,
      roll: this.att.roll,
      pitch: this.att.pitch,
    });
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
        this.i.bar(MID_COL + dx, top + y);
      }
    }
    return { roll, pitch };
  }

  buildQuad() {
    const I = this.i;
    const ah = this.quadHorizon();
    /* osdBackgroundHorizonSidebars. */
    for (let dy = -AH_SIDEBAR_H; dy <= AH_SIDEBAR_H; dy += 1) {
      I.put(MID_COL - AH_SIDEBAR_W, MID_ROW + dy, ch(SYM.AH_DEC));
      I.put(MID_COL + AH_SIDEBAR_W, MID_ROW + dy, ch(SYM.AH_DEC));
    }
    I.put(MID_COL - AH_SIDEBAR_W + 1, MID_ROW, ch(SYM.AH_LEFT));
    I.put(MID_COL + AH_SIDEBAR_W - 1, MID_ROW, ch(SYM.AH_RIGHT));
    I.put(MID_COL - 1, MID_ROW, ch(SYM.AH_CL) + ch(SYM.AH_C) + ch(SYM.AH_CR));
    this.values.ahRoll = ah.roll;
    this.values.ahPitch = ah.pitch;
  }

  /*
   * INAV's horizon and ladder, drawn where the real horizon is in the
   * picture: the camera's own orientation and field of view, which is what
   * INAV's osd_camera_uptilt and osd_camera_fov settings are for. The
   * rungs are the same line pushed to their elevation, on the instrument
   * grid from instrument row `top` down; their numbers are readout type,
   * beside each rung's outer end where the cells are free.
   */
  planeLadder(x, top) {
    const I = this.i;
    const T = this.t;
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
    const w = I.canvas.width;
    const h = I.canvas.height;
    const f = (h / 2) / Math.tan((x.camera.fov * Math.PI) / 360);
    /* The line runs along (ny, -nx) in image space, y up. In screen space,
     * y down, the slope of a line of constant elevation is dy/dx: */
    if (Math.abs(ny) < 0.2) {
      return null;
    }
    const slope = nx / ny;
    const cxScreen = w / 2;
    const cyScreen = h / 2;
    const onLadder = (y) => {
      const row = Math.floor((y - I.oy) / I.ch);
      return row >= top && row <= LADDER_BOTTOM;
    };
    const rung = (deg, half, gap, text) => {
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
        const yy = lineY(I.ox + (col + 0.5) * I.cw);
        if (onLadder(yy)) {
          I.bar(col, Math.floor(((yy - I.oy) / I.ch) * AH_SYMBOLS));
        }
      }
      if (!text) {
        return;
      }
      for (const side of [-1, 1]) {
        const endX = I.ox + (MID_COL + side * half + (side > 0 ? 1 : 0)) * I.cw;
        const yy = lineY(endX);
        if (!onLadder(yy)) {
          continue;
        }
        const row = this.textRow(yy);
        const col = side < 0
          ? Math.floor((endX - T.cw / 2 - T.ox) / T.cw) - text.length + 1
          : Math.ceil((endX + T.cw / 2 - T.ox) / T.cw);
        if (T.free(col, row, text.length)) {
          T.put(col, row, text);
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

  /*
   * A plane: the heading tape top centre, under the race readout, with the
   * heading under it and the home arrow under that; the speeds on the left
   * edge and the altitude and vario on the right, level with the centre;
   * the ladder below the arrow.
   */
  buildPlane(v, x, race) {
    const I = this.i;
    const T = this.t;
    const raceBottom = race ? T.oy + (race.row + race.rows) * T.ch : 0;
    const tapeRow = Math.max(0, Math.ceil((raceBottom - I.oy) / I.ch));
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
      I.put(MID_COL + dx, tapeRow, glyph);
    }
    const hdg = Math.round(head) % 360;
    const tapeY = I.oy + (tapeRow + TAPE_Y) * I.ch;
    const heading = this.readout('heading', 'c', Math.ceil((tapeY - T.oy) / T.ch), [`${pad(String(hdg), 3).replace(/ /g, '0')}°`]);
    /* Home: the arrow turned by the bearing home less the heading, on the
     * first instrument row clear of the heading, and the horizontal
     * distance to the launch point beside it. */
    const dxh = x.home.x - x.pos.x;
    const dzh = x.home.z - x.pos.z;
    const dist = Math.hypot(dxh, dzh);
    let bearing = (Math.atan2(dxh, -dzh) * 180) / Math.PI - head;
    bearing = ((bearing % 360) + 360) % 360;
    const dir = Math.round(bearing / 22.5) % 16;
    const arrowHalf = Math.min(I.cw, I.ch) * ARROW_HALF;
    const headingBottom = T.oy + (heading.row + heading.rows) * T.ch;
    const homeRow = Math.max(tapeRow + 1, Math.ceil((headingBottom + arrowHalf - I.oy) / I.ch - 0.5));
    I.put(MID_COL, homeRow, ch(SYM.ARROW + dir));
    const arrowRight = I.ox + (MID_COL + 0.5) * I.cw + arrowHalf;
    this.readout('home', Math.ceil((arrowRight + T.cw / 2 - T.ox) / T.cw), this.textRow(I.oy + (homeRow + 0.5) * I.ch),
      [`${ch(SYM.HOME)}${Math.round(dist)}M`]);
    /* Speeds on the left edge, altitude over home and the vario on the
     * right, level with the crosshair. */
    const st = x.st;
    const vx = st[4];
    const vy = st[5];
    const vz = st[6];
    const gsKph = Math.hypot(vx, vy) * 3.6;
    const w = this.windNow(x.sim);
    const asKph = Math.hypot(vx - w[0], vy - w[1], vz) * 3.6;
    this.readout('speeds', 'l', 'm', [
      `${label(SYM.GS)}${pad(String(Math.round(gsKph)), 3)}${label(SYM.KMH)}`,
      `${label(SYM.AIR)}${pad(String(Math.round(asKph)), 3)}${label(SYM.KMH)}`,
    ]);
    const alt = x.pos.y - x.home.y;
    const vario = Math.abs(vz) < 0.05 ? 0 : vz;
    const arrow = vario > 0 ? ch(SYM.VARIO_UP) : (vario < 0 ? ch(SYM.VARIO_DN) : ' ');
    this.readout('alt-vario', 'r', 'm', [
      `${pad(String(Math.round(alt)), 4)}M`,
      `${arrow}${pad(Math.abs(vario).toFixed(1), 4)}${label(SYM.MS)}`,
    ]);
    I.put(MID_COL - 1, MID_ROW, ch(SYM.PLANE_L) + ch(SYM.PLANE_C) + ch(SYM.PLANE_R));
    const ladder = this.planeLadder(x, homeRow + 1);
    Object.assign(this.values, {
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

  /*
   * The game's own clocks, in the firmware's type, top centre: the lap or
   * the run, the gate, the gate's cue, last and best, and the ghost's gap
   * while it is lit. A race keeps all five rows, lit or not, so what hangs
   * under the readout does not jump when a line comes and goes.
   */
  buildRace(v) {
    const up = (s) => s.toUpperCase();
    const fit = (s) => (s.length > RACE_WIDE ? s.slice(0, RACE_WIDE) : s);
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
      clock = fit(up(clock));
      this.values.clock = clock;
      return this.readout('race', 'c', 't', [clock]);
    }
    const running = v.lapMs != null && Number.isFinite(v.lapMs);
    clock = fit(up(str('osd.lap', { t: running ? formatTime(v.lapMs) : '0.00' })));
    const gate = fit(up(str('osd.gate', { gate: v.gate, gateCount: v.gateCount })));
    const cue = fit(up(v.gateCue || ''));
    const parts = [];
    if (v.lastLapMs != null) {
      parts.push(str('osd.last', { t: formatTime(v.lastLapMs) }));
    }
    if (this.x.bestMs != null) {
      parts.push(str('osd.best', { t: formatTime(this.x.bestMs) }));
    }
    const laps = fit(up(parts.join('  ')));
    let ghost = '';
    if (v.ghostGapMs != null) {
      const gap = `${v.ghostGapMs <= 0 ? '-' : '+'}${(Math.abs(v.ghostGapMs) / 1000).toFixed(2)}`;
      ghost = fit(up(str(v.ghostFinal ? 'osd.ghost_lap' : 'osd.ghost', { gap })));
    }
    Object.assign(this.values, { clock, gate, cue, laps, ghost });
    return this.readout('race', 'c', 't', [clock, gate, cue, laps, ghost]);
  }

  /* renderOsdWarning's order, over the conditions the shell can be in, and
   * osdElementDisarmed above it: centred, two and three instrument rows
   * under the crosshair, inside the horizon's sidebars. */
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
    } else if (this.power && this.power.tankM3 > 0 && !this.power.running) {
      warning = str('osd.engine_out');
      blink = true;
    } else if (this.power && this.power.lean) {
      warning = str('osd.low_fuel');
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
    const I = this.i;
    const under = (rows) => this.textRow(I.oy + (MID_ROW + rows + 0.5) * I.ch);
    const disarmed = !x.armed && !x.crashFlip;
    if (disarmed) {
      this.readout('disarmed', 'c', under(2), [str('osd.disarmed')]);
    }
    if (warning && (!blink || blinkOn)) {
      this.readout('warning', 'c', under(3), [warning]);
    }
    this.values.warning = warning;
    this.values.disarmed = disarmed;
  }

  /*
   * The game's banner, in the OSD's type under the warnings: capitals, as
   * a MAX7456 font has, the lines wrapped at BANNER_WIDE and centred. A
   * lone digit is the launch countdown, drawn two rows tall (see LABELS).
   */
  buildBanner(x) {
    const text = x.banner || '';
    this.values.banner = text;
    if (!text) {
      return;
    }
    let lines;
    if (/^[0-9]$/.test(text)) {
      lines = labelRows(SYM[`BIG_${text}`]);
    } else {
      const wide = Math.min(BANNER_WIDE, this.t.cols);
      lines = [];
      for (const para of text.toUpperCase().split('\n')) {
        let line = '';
        for (const word of para.split(' ')) {
          if (!word) {
            continue;
          }
          if (line && line.length + 1 + word.length > wide) {
            lines.push(line);
            line = '';
          }
          line = line ? `${line} ${word}` : word.slice(0, wide);
        }
        lines.push(line);
      }
    }
    const I = this.i;
    this.readout('banner', 'c', this.textRow(I.oy + (MID_ROW + 4.5) * I.ch), lines);
  }
}
