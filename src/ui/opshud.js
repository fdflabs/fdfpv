/*
 * opshud.js: the quiet HUD of an ops mission (docs/campaign/interior/
 * TECH-NEEDS.md N7, BIBLE.md 6), over the camera ball's picture or any
 * other view in an ops match. A HUD mode of its own, not a tuning of the
 * war's: the war wants its enemies very obvious, an ops mission the
 * opposite.
 *
 * THE RULE IT KEEPS: nothing is drawn for what the room has not told the
 * squad. A contact gets a box only once the room has discovered it (its
 * class is set), and only while it is in some pilot's frame; a lost one
 * gets its last known position, never where it is; the room's search
 * areas are soft circles; bearing hints are ticks on the compass tape
 * toward those circles and positions. No glowing marker before discovery,
 * no omniscient minimap. `interior:hud` proves it on the HUD's own pixels.
 *
 * WHAT IT DRAWS. Over the ball: the centre cross and the survey box (the
 * capture's cuts: inside the inner brackets a framed item grades clean,
 * inside the outer usable, CONTRACT-P0.md 7), gimbal angles, zoom, lock,
 * the EO / IR / MAP / TGT / LRF row, the IR inset (the sensor's own, the
 * same camera in the other band), and the capture's word. In any view:
 * the stage's objective cards (tier, done, stars, counts; a card scoped to
 * roles only on a screen holding one), the mission rule banner, the card
 * events as they are told, classification chips that change as the room
 * classifies, the compass tape, ALT, SPD, HDG and the mission clock, a
 * minimap with a scale bar, the boundary warning, and the stage's
 * tutorial prompts (the screen's own: the room cannot see a mode switch).
 *
 * IT DRAWS STATE AND COMPUTES NONE: the room's view, the ball, the
 * sensor, the capture scorer and the shell's projection hand it every
 * number. Campaign agnostic: every word is a string key, classes and
 * items are named by the mission's own ids.
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
const TEXT_HZ = 8;
const MAX_DPR = 3;
const DEG = 180 / Math.PI;
/* How long a capture's word, a notice and a card event stay, ms. */
const SAY_MS = 2600;
const CARD_EVENT_MS = 4200;
const STAGE_LINE_MS = 5200;
/* Compass tape: degrees either side of the heading. */
const TAPE_SPAN = 60;
/* The minimap's width in metres, folded and open (MAP). */
const MAP_M = [3000, 9000];
/* A box never smaller than this, CSS px. */
const BOX_MIN_PX = 14;
/* Ground circles are drawn as this many segments. */
const RING = 40;
/* The game's furniture is looked for this often (it comes and goes), and
 * the panels' margin from the window and from each other, CSS px. */
const KEEP_OUT_MS = 1000;
const PANEL_EDGE = 16;
const PANEL_GAP = 8;

const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/* Ink: a pale, quiet white for the instruments, amber for a caution, the
 * grades in three steps of the same green. No red: nothing here is a
 * target. */
const INK = 'rgba(236, 244, 240, 0.86)';
const DIM = 'rgba(236, 244, 240, 0.45)';
const FAINT = 'rgba(236, 244, 240, 0.22)';
const AMBER = '#ffc04a';
const GRADE_INK = { clean: '#8dffb5', usable: '#d8f7a0', poor: '#f2d48a' };
const HALO = 'rgba(0, 0, 0, 0.7)';
const FONT = 'ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace';

const CSS = `
.ops { position: absolute; inset: 0; pointer-events: none; display: none; font-family: ${FONT};
  font-size: clamp(9px, 1.45vh, 14px); color: ${INK}; letter-spacing: 0.08em; text-shadow: 0 1px 2px ${HALO}; }
.ops canvas.ops-ink { position: absolute; inset: 0; width: 100%; height: 100%; }
.ops-k { color: ${DIM}; margin-right: 0.6em; }
.ops-panel { position: absolute; left: 0; top: 0; }
.ops-off { display: none !important; }
.ops-read { text-align: right; line-height: 1.55; white-space: nowrap; }
.ops-read .roles-open { position: static; margin: 0.5em 0 0 auto; }
.ops-obj { max-width: min(34ch, 46vw); line-height: 1.4; }
.ops-obj-title { letter-spacing: 0.2em; color: ${DIM}; margin-bottom: 0.4em; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; }
.ops-card { margin: 0.15em 0; display: grid; grid-template-columns: 1.3em auto; }
.ops-card .ops-mk { color: ${DIM}; }
.ops-card.primary { color: ${INK}; }
.ops-card.secondary, .ops-card.optional { color: rgba(236, 244, 240, 0.7); }
.ops-card.done { color: ${DIM}; text-decoration: line-through; text-decoration-color: rgba(236, 244, 240, 0.35); }
.ops-card.failed { color: ${AMBER}; }
.ops-card .ops-tier { font-size: 0.78em; color: ${DIM}; margin-right: 0.5em; letter-spacing: 0.14em; }
.ops-card .ops-star { color: #f2d48a; margin-left: 0.4em; }
.ops-card .ops-n { color: ${DIM}; margin-left: 0.5em; }
.ops-rule { display: block; border: 1px solid rgba(236, 244, 240, 0.35); padding: 0.2em 0.6em; margin-bottom: 0.5em;
  letter-spacing: 0.14em; font-size: 0.86em; background: rgba(6, 10, 12, 0.35); }
.ops-rule:empty, .ops-events:empty, .ops-tut:empty, .ops-bound:empty, .ops-stage:empty { display: none; }
.ops-events { position: absolute; left: 50%; top: max(150px, 20%); transform: translateX(-50%); text-align: center;
  white-space: nowrap; letter-spacing: 0.16em; line-height: 1.7; }
.ops-events .ops-sub { color: ${DIM}; font-size: 0.86em; }
.ops-stage { position: absolute; left: 50%; bottom: 30%; transform: translateX(-50%); text-align: center; white-space: nowrap;
  letter-spacing: 0.24em; font-size: 1.15em; }
.ops-say { position: absolute; left: 50%; bottom: max(18%, 96px); transform: translateX(-50%); text-align: center;
  white-space: nowrap; font-size: 1.1em; letter-spacing: 0.14em; }
.ops-say.warn { color: ${AMBER}; }
.ops-cue { position: absolute; left: 50%; top: calc(50% + 4.2em); transform: translateX(-50%); font-size: 0.9em;
  letter-spacing: 0.16em; white-space: nowrap; }
.ops-tut { position: absolute; left: 50%; bottom: max(24%, 130px); transform: translateX(-50%); white-space: nowrap;
  padding: 0.35em 1em; border: 1px solid rgba(236, 244, 240, 0.4); background: rgba(6, 10, 12, 0.45); letter-spacing: 0.12em; }
.ops-bound { position: absolute; left: 50%; top: 40%; transform: translateX(-50%); color: ${AMBER}; letter-spacing: 0.2em;
  font-size: 1.15em; white-space: nowrap; }
.ops-row { display: flex; gap: 0.2em; white-space: nowrap; }
.ops-row span { padding: 0.15em 0.6em; color: ${DIM}; border: 1px solid transparent; }
.ops-row span.on { color: ${INK}; border-color: rgba(236, 244, 240, 0.55); }
.ops-map { width: clamp(96px, 22vmin, 220px); height: clamp(96px, 22vmin, 220px); border: 1px solid rgba(236, 244, 240, 0.35);
  background: rgba(6, 10, 12, 0.4); }
.ops-map.open { width: clamp(200px, 46vmin, 460px); height: clamp(200px, 46vmin, 460px); }
.ops-map canvas { width: 100%; height: 100%; display: block; }
.ops-inset { width: clamp(110px, 24vmin, 300px); border: 1px solid rgba(236, 244, 240, 0.35); background: #000; }
.ops-inset:empty { display: none; }
.ops-inset canvas { width: 100%; display: block; }
.ops-inset-tag { position: absolute; left: 0.4em; top: 0.2em; font-size: 0.8em; }
#ui.ops-on .osd-top, #ui.ops-on .osd-corner { display: none; }
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

/* A card's text key as the strings hold it, or the key itself shown
 * plainly when the strings do not have it (a mission newer than them). */
function say(key, vars) {
  try {
    return str(key, vars);
  } catch {
    return key;
  }
}

/* A mission id as a string key's last part: the strings' keys are
 * lower case letters, digits, underscores and dots. */
export const skey = (id) => String(id).toLowerCase().replace(/[^a-z0-9_.]/g, '_');

/* Whether a card belongs on this screen: the squad's, or one of its
 * roles held here (CONTRACT-P0.md 4.2). */
export function cardShown(card, heldRoles) {
  return !card.roles || card.roles.some((r) => heldRoles.includes(r));
}

/* The roles a seat holds, by id (a scaling copy's key is `id:n`). */
export function heldRolesOf(view, seat) {
  return [...new Set(((view.roles && view.roles.held && view.roles.held[seat]) || []).map((k) => String(k).split(':')[0]))];
}

/*
 * What the HUD may mark of a contact (the quiet rule, in one place):
 * 'box' (discovered and in a frame now), 'lkp' (discovered, lost: its
 * last known position), or null (undiscovered, vanished, or nothing
 * known). The truth never reaches the view; this reads only what the room
 * says.
 */
export function markOf(c) {
  if (!c.cls || c.state === 'undiscovered') {
    return null;
  }
  if (c.state === 'seen') {
    return 'box';
  }
  if (c.state === 'lost' && c.lkp) {
    return 'lkp';
  }
  return null;
}

/* Bearing (rad, clockwise from north) from p to q, ops frame. */
const bearing = (p, q) => Math.atan2(q[0] - p[0], q[1] - p[1]);
const wrapDeg = (d) => ((d % 360) + 540) % 360 - 180;

export class OpsHud {
  constructor(root) {
    this.root = root;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.el = el('div', 'ops');
    this.el.setAttribute('aria-hidden', 'true');
    root.prepend(this.el);
    this.canvas = el('canvas', 'ops-ink', this.el);
    this.g = this.canvas.getContext('2d');
    this.on = false;
    this.dim = false;
    this.nextDrawMs = 0;
    this.nextTextMs = 0;
    this.w = 0;
    this.h = 0;
    this.s = 1;
    this.sizeDirty = true;
    this.src = null;
    this.saying = null;
    this.events = [];
    this.stageLine = null;
    this.mapOpen = false;
    /* What the last paint drew, CSS px, for the checks: every mark with
     * what it is for (kind, and the contact id for a contact's). */
    this.marks = [];

    const read = el('div', 'ops-panel ops-read', this.el);
    this.readEl = read;
    const line = (k) => {
      const d = el('div', '', read);
      el('span', 'ops-k', d, k);
      return new Field(d);
    };
    this.fMode = line(str('ops.hud.sensor'));
    this.fZoom = line(str('ops.hud.zoom'));
    this.fGimbal = line(str('ops.hud.gimbal'));
    this.fLock = line(str('ops.hud.lock'));
    this.fAlt = line(str('ops.hud.alt'));
    this.fSpd = line(str('ops.hud.spd'));
    this.fHdg = line(str('ops.hud.hdg'));
    this.fClock = line(str('ops.hud.clock'));
    this.readLines = { ball: [this.fMode, this.fZoom, this.fGimbal, this.fLock] };

    this.obj = el('div', 'ops-panel ops-obj', this.el);
    this.objTitle = new Field(this.obj, 'ops-obj-title');
    this.objTitle.el.style.display = 'block';
    /* The mission rule, a banner at the head of the cards. */
    this.rule = new Field(this.obj, 'ops-rule');
    this.cardsEl = el('div', '', this.obj);
    this.cardsKey = null;
    this.eventsEl = el('div', 'ops-events', this.el);
    this.eventsKey = null;
    this.stage = new Field(this.el, 'ops-stage');
    this.cue = new Field(this.el, 'ops-cue');
    this.say = new Field(this.el, 'ops-say');
    this.tut = new Field(this.el, 'ops-tut');
    this.bound = new Field(this.el, 'ops-bound');
    this.row = el('div', 'ops-panel ops-row', this.el);
    this.rowCells = {};
    for (const k of ['eo', 'ir', 'map', 'tgt', 'lrf']) {
      this.rowCells[k] = new Field(this.row);
    }
    this.mapBox = el('div', 'ops-panel ops-map', this.el);
    this.mapCanvas = el('canvas', '', this.mapBox);
    this.mg = this.mapCanvas.getContext('2d');
    this.inset = el('div', 'ops-panel ops-inset', this.el);
    this.keepOut = [];
    this.keepOutAt = 0;
    this.insetCanvas = null;
    this.insetTag = null;
    window.addEventListener('resize', () => { this.sizeDirty = true; });
    window.__opsHud = () => ({
      on: this.on,
      marks: this.marks.map((m) => ({ ...m })),
      cue: this.cue.v,
      say: this.saying ? this.saying.text : null,
      rule: this.rule.v,
      tutorial: this.tut.v,
      boundary: this.bound.v,
      events: this.events.map((e) => e.lines.join(' / ')),
      cards: [...this.cardsEl.children].map((c) => ({ text: c.dataset.text, cls: c.className })),
      title: this.objTitle.v,
      mapOpen: this.mapOpen,
      inset: Boolean(this.insetCanvas && this.inset.contains(this.insetCanvas)),
      read: {
        mode: this.fMode.v, zoom: this.fZoom.v, gimbal: this.fGimbal.v, lock: this.fLock.v, alt: this.fAlt.v, spd: this.fSpd.v, hdg: this.fHdg.v, clock: this.fClock.v,
      },
      row: Object.fromEntries(Object.entries(this.rowCells).map(([k, f]) => [k, { text: f.v, on: f.el.classList.contains('on') }])),
      rects: this.rects(),
    });
  }

  /* The panels' rectangles, CSS px, for the layout check. */
  rects() {
    const r = (e) => {
      if (!e || !e.isConnected || getComputedStyle(e).display === 'none' || !e.textContent && !e.querySelector('canvas')) {
        return null;
      }
      const b = e.getBoundingClientRect();
      return b.width && b.height ? {
        x: b.left, y: b.top, w: b.width, h: b.height,
      } : null;
    };
    return {
      read: r(this.readEl),
      obj: r(this.obj),
      tape: this.tapeRect ? { ...this.tapeRect } : null,
      row: r(this.row),
      map: r(this.mapBox),
      inset: r(this.inset),
    };
  }

  /* A word for the pilot under the reticle: a capture's grade, a refusal. */
  tell(text, { warn = false, grade = null } = {}) {
    this.saying = {
      text, warn, grade, until: performance.now() + SAY_MS,
    };
  }

  /* A card event (BIBLE.md 6), with an optional second line. */
  cardEvent(lines) {
    this.events.push({ lines, until: performance.now() + CARD_EVENT_MS });
    if (this.events.length > 3) {
      this.events.shift();
    }
  }

  /* A stage entered: its title in the lower third, for a while. */
  stageEntered(title) {
    this.stageLine = { text: title, until: performance.now() + STAGE_LINE_MS };
  }

  toggleMap() {
    this.mapOpen = !this.mapOpen;
    this.mapBox.classList.toggle('open', this.mapOpen);
    this.keepOutAt = 0;
    return this.mapOpen;
  }

  /* Something of the shell's that rides with the readouts (the role
   * board's button), placed with them. */
  mount(node) {
    this.readEl.append(node);
    this.keepOutAt = 0;
  }

  /* The game's furniture this second, CSS px relative to the HUD. */
  readKeepOut() {
    const o = this.el.getBoundingClientRect();
    this.keepOut.length = 0;
    /* The game's own things over a flight that no panel may sit on (the
     * Avionics HUD's list, src/ui/avionicshud.js readKeepOut). */
    for (const e of document.querySelectorAll('.bug-chip, .music-dock, .osd-gimbal, .osd-sticks, .osd-air, .war-hud, .war-calls, .war-round, .banner')) {
      if (this.el.contains(e)) {
        continue;
      }
      const r = e.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none') {
        this.keepOut.push({
          x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height, soft: e.classList.contains('banner'),
        });
      }
    }
  }

  /*
   * The panels, each in its corner and slid away from the edge it hangs
   * from until clear of the game's furniture and the panels before it;
   * the row under the picture's middle, slid up the same way. The order
   * is the precedence: on a screen too small for all, the last give way.
   */
  place() {
    const w = this.el.clientWidth || window.innerWidth;
    const h = this.el.clientHeight || window.innerHeight;
    /* The compass tape first, under the game's chips where they reach
     * the middle: every panel then dodges it. */
    const half = Math.min(w * 0.3, 360);
    const tape = {
      x: w / 2 - half, y: Math.max(32, h * 0.045), w: half * 2, h: 34,
    };
    for (let tries = 0; tries < 8; tries += 1) {
      const hit = this.keepOut.find((r) => !r.soft && meets(r, tape));
      if (!hit) {
        break;
      }
      tape.y = hit.y + hit.h + PANEL_GAP;
    }
    this.tapeTop = tape.y + 12;
    this.tapeRect = this.src && this.src.craft ? tape : null;
    const placed = this.src && this.src.craft ? [tape] : [];
    const order = [[this.mapBox, 'l', 'b'], [this.inset, 'r', 'b'], [this.row, 'c', 'b'], [this.obj, 'l', 't'], [this.readEl, 'r', 't']];
    for (const [p] of order) {
      p.classList.remove('ops-off');
    }
    for (const [p, ax, ay] of order) {
      if (getComputedStyle(p).display === 'none' || (!p.textContent && !p.querySelector('canvas'))) {
        continue;
      }
      const me = this.slide(p, ax, ay, w, h, [...this.keepOut, ...placed]);
      if (!me) {
        p.classList.add('ops-off');
        continue;
      }
      p.style.left = `${Math.round(me.x)}px`;
      p.style.top = `${Math.round(me.y)}px`;
      placed.push(me);
    }
  }

  slide(p, ax, ay, W, H, against) {
    const w = p.offsetWidth;
    const h = p.offsetHeight;
    const x = ax === 'l' ? PANEL_EDGE : ax === 'r' ? W - PANEL_EDGE - w : (W - w) / 2;
    const home = ay === 't' ? PANEL_EDGE : H - PANEL_EDGE - h;
    for (const set of [against, against.filter((r) => !r.soft)]) {
      const me = {
        x, y: home, w, h,
      };
      for (let tries = 0; tries < 16; tries += 1) {
        const hit = set.find((r) => meets(r, me));
        if (!hit) {
          return me;
        }
        const y = ay === 't' ? hit.y + hit.h + PANEL_GAP : hit.y - PANEL_GAP - h;
        if (y < PANEL_EDGE || y + h > H - PANEL_EDGE) {
          break;
        }
        me.y = y;
      }
    }
    return null;
  }

  /*
   * Every frame. `want`: an ops match in flight, or the ball's picture.
   * src: {
   *   ball (a camball state, or null when the ball is not the view),
   *   digital, mode (a sensor mode), cue (a still's grade now, or null),
   *   view, seat, mission (the room's view, this seat, the mission's data,
   *   or null outside a match), now (room ms),
   *   project(p) -> { x, y } CSS px or null (an ops frame point through
   *   the screen's camera), ground(x, y) -> z, poseOf(c) -> [x, y, z] or
   *   null (a contact's centre now),
   *   craft { p, heading, speed (m/s), agl (m) }, aim (the ball's or the
   *   screen's aim point, for LRF), locked (bool),
   *   inset (the sensor's inset canvas, or null), insetMode,
   *   tutorial (a prompt's string key, or null)
   * }
   */
  tick(want, paused, nowMs, src) {
    const on = Boolean(want && src);
    if (on !== this.on) {
      this.on = on;
      this.el.style.display = on ? 'block' : 'none';
      this.root.classList.toggle('ops-on', on);
      this.nextDrawMs = 0;
      this.nextTextMs = 0;
      this.keepOutAt = 0;
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
    if (nowMs >= this.nextTextMs) {
      this.nextTextMs = nowMs + 1000 / TEXT_HZ;
      const before = this.shapeKey();
      this.text();
      if (this.shapeKey() !== before) {
        this.keepOutAt = 0;
      }
    }
    if (nowMs >= this.keepOutAt || this.sizeDirty) {
      this.keepOutAt = nowMs + KEEP_OUT_MS;
      this.readKeepOut();
      this.place();
    }
    if (nowMs < this.nextDrawMs) {
      return;
    }
    this.nextDrawMs = nowMs + 1000 / HUD_HZ;
    this.paint();
    this.paintMap();
  }

  text() {
    const src = this.src;
    const b = src.ball;
    for (const f of this.readLines.ball) {
      f.el.parentElement.style.display = b ? '' : 'none';
    }
    if (b) {
      this.fMode.set(say(`avionics.hud.cam_mode.${src.mode}`));
      this.fZoom.set(str('ops.hud.zoom_of', { z: (b.zoom * src.digital).toFixed(1) }));
      this.fGimbal.set(str('ops.hud.gimbal_of', {
        dep: Math.round(-b.tilt * DEG),
        brg: String((Math.round(b.bearing * DEG) + 360) % 360).padStart(3, '0'),
      }));
      this.fLock.set(str(b.lock ? (b.track ? 'ops.hud.lock_track' : 'ops.hud.lock_ground') : 'ops.hud.lock_free'));
    }
    const c = src.craft;
    this.fAlt.set(c ? str('ops.hud.alt_of', { m: Math.round(c.agl) }) : '');
    this.fSpd.set(c ? str('ops.hud.spd_of', { kmh: Math.round(c.speed * 3.6) }) : '');
    this.fHdg.set(c ? str('ops.hud.hdg_of', { d: String((Math.round(c.heading * DEG) + 360) % 360).padStart(3, '0') }) : '');
    const v = src.view;
    const go = v && v.goAt != null && Number.isFinite(src.now) ? Math.max(0, src.now - v.goAt) : null;
    this.fClock.set(go == null ? '' : str('ops.hud.clock_of', {
      m: String(Math.floor(go / 60000)).padStart(2, '0'), s: String(Math.floor(go / 1000) % 60).padStart(2, '0'),
    }));
    for (const f of [this.fAlt, this.fSpd, this.fHdg, this.fClock]) {
      f.el.parentElement.style.display = f.v ? '' : 'none';
    }

    this.cue.set(src.cue ? str('ops.hud.cue', { grade: str(`ops.grade.${src.cue}`) }) : '');
    this.cue.el.style.color = src.cue ? GRADE_INK[src.cue] : '';
    const now = performance.now();
    if (this.saying && now > this.saying.until) {
      this.saying = null;
    }
    this.say.set(this.saying ? this.saying.text : '');
    this.say.el.classList.toggle('warn', Boolean(this.saying && this.saying.warn));
    this.say.el.style.color = this.saying && this.saying.grade ? GRADE_INK[this.saying.grade] : '';

    /* The stage's cards, filtered to this screen's roles. */
    const held = v ? heldRolesOf(v, src.seat) : [];
    const cards = (v && v.cards) || [];
    const shown = cards.filter((k) => k.tier !== 'rule' && cardShown(k, held));
    this.objTitle.set(v && v.stage && v.stage.title ? say(v.stage.title) : '');
    this.obj.style.display = shown.length || this.objTitle.v ? '' : 'none';
    const key = JSON.stringify(shown);
    if (key !== this.cardsKey) {
      this.cardsKey = key;
      this.cardsEl.textContent = '';
      for (const k of shown) {
        const row = el('div', `ops-card ${k.tier} ${k.state}`, this.cardsEl);
        row.dataset.text = k.text;
        el('span', 'ops-mk', row, k.state === 'done' ? '✓' : k.state === 'failed' ? '×' : '›');
        const body = el('span', '', row);
        if (k.tier !== 'primary') {
          el('span', 'ops-tier', body, str(`ops.tier.${k.tier}`));
        }
        el('span', '', body, say(k.text));
        if (k.progress) {
          el('span', 'ops-n', body, `${k.progress[0]}/${k.progress[1]}`);
        }
        if (k.star) {
          el('span', 'ops-star', body, '★');
        }
      }
    }
    const rule = cards.find((k) => k.tier === 'rule' && cardShown(k, held));
    this.rule.set(rule ? str('ops.hud.rule', { text: say(rule.text) }) : '');

    this.events = this.events.filter((e) => e.until > now);
    const ek = this.events.map((e) => e.lines.join('|')).join('||');
    if (ek !== this.eventsKey) {
      this.eventsKey = ek;
      this.eventsEl.textContent = '';
      for (const e of this.events) {
        const d = el('div', '', this.eventsEl, e.lines[0]);
        if (e.lines[1]) {
          el('div', 'ops-sub', d, e.lines[1]);
        }
      }
    }
    if (this.stageLine && now > this.stageLine.until) {
      this.stageLine = null;
    }
    this.stage.set(this.stageLine ? this.stageLine.text : '');
    this.tut.set(src.tutorial ? say(src.tutorial) : '');
    const bound = v && v.boundary ? v.boundary[src.seat] : null;
    this.bound.set(bound ? str(`ops.hud.boundary_${bound}`) : '');

    /* The EO / IR / MAP / TGT / LRF row. */
    const thermal = src.mode === 'ir_wh' || src.mode === 'ir_bh' || src.mode === 'fusion';
    const cells = this.rowCells;
    cells.eo.set(str('ops.row.eo'));
    cells.eo.el.classList.toggle('on', Boolean(b) && !thermal);
    cells.ir.set(str('ops.row.ir'));
    cells.ir.el.classList.toggle('on', Boolean(b) && thermal);
    cells.map.set(str('ops.row.map'));
    cells.map.el.classList.toggle('on', this.mapOpen);
    cells.tgt.set(str('ops.row.tgt'));
    cells.tgt.el.classList.toggle('on', Boolean(src.locked));
    const range = c && src.aim ? Math.hypot(src.aim[0] - c.p[0], src.aim[1] - c.p[1], src.aim[2] - c.p[2]) : null;
    cells.lrf.set(range != null && range < 19000 ? str('ops.row.lrf_of', { m: Math.round(range) }) : str('ops.row.lrf'));
    cells.lrf.el.classList.toggle('on', range != null && range < 19000);

    /* The IR inset: the sensor's own canvas. */
    if (src.inset !== this.insetCanvas || (src.inset && src.inset.parentElement !== this.inset)) {
      this.inset.textContent = '';
      this.insetCanvas = src.inset;
      if (src.inset) {
        this.inset.append(src.inset);
        this.insetTag = el('span', 'ops-inset-tag', this.inset);
      }
    }
    if (this.insetTag && src.insetMode) {
      this.insetTag.textContent = say(`avionics.hud.cam_mode.${src.insetMode}`);
    }
  }

  /* What changes the panels' sizes: placed again when it does. */
  shapeKey() {
    return [this.readEl, this.obj, this.row, this.mapBox, this.inset].map((e) => `${e.offsetWidth}x${e.offsetHeight}`).join();
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
    const { g, w, h, src } = this;
    g.setTransform(this.s, 0, 0, this.s, 0, 0);
    g.clearRect(0, 0, w, h);
    this.marks.length = 0;
    g.lineWidth = 1.25;
    g.strokeStyle = INK;
    g.fillStyle = INK;
    g.shadowColor = HALO;
    g.shadowBlur = 3;
    g.font = `${Math.max(9, Math.min(14, h * 0.0145))}px ${FONT}`;
    if (src.ball) {
      this.paintBall();
    }
    if (src.view && src.project) {
      this.paintWorld();
    }
    if (src.craft) {
      this.paintTape();
    }
    g.shadowBlur = 0;
  }

  paintBall() {
    const { g, w, h } = this;
    const cx = w / 2;
    const cy = h / 2;
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
    /* The survey box: the capture's centring cuts as brackets; off is the
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
      g.beginPath();
      g.moveTo(cx, cy - a * 0.3);
      g.lineTo(cx + a * 0.3, cy);
      g.lineTo(cx, cy + a * 0.3);
      g.lineTo(cx - a * 0.3, cy);
      g.closePath();
      g.stroke();
      this.marks.push({ kind: 'lock', x: cx, y: cy });
    }
  }

  /* A circle on the ground through the screen's camera, dashed; returns
   * whether any of it was drawn. */
  groundRing(at, r, dash) {
    const { g, src } = this;
    let drawn = false;
    let pen = false;
    g.setLineDash(dash);
    g.beginPath();
    for (let i = 0; i <= RING; i += 1) {
      const a = (i / RING) * 2 * Math.PI;
      const x = at[0] + r * Math.cos(a);
      const y = at[1] + r * Math.sin(a);
      const p = src.project([x, y, src.ground(x, y)]);
      if (!p) {
        pen = false;
        continue;
      }
      if (pen) {
        g.lineTo(p.x, p.y);
      } else {
        g.moveTo(p.x, p.y);
        pen = true;
      }
      drawn = true;
    }
    g.stroke();
    g.setLineDash([]);
    return drawn;
  }

  paintWorld() {
    const { g, src } = this;
    const v = src.view;
    /* Search areas: soft circles on the ground. */
    g.strokeStyle = DIM;
    for (const s of v.search || []) {
      const z = src.ground(s.at[0], s.at[1]);
      if (this.groundRing(s.at, s.r, [6, 6])) {
        const p = src.project([s.at[0], s.at[1], z]);
        if (p) {
          g.fillStyle = DIM;
          g.fillText(str('ops.hud.search_area'), p.x + 6, p.y - 6);
        }
        this.marks.push({ kind: 'search', id: s.id, ...(p ?? {}) });
      }
    }
    /* Contacts the room has told: a box while seen, the last known
     * position once lost. Nothing for the rest. */
    for (const c of v.contacts || []) {
      const mark = markOf(c);
      if (mark === 'box') {
        const at = src.poseOf(c);
        const p = at && src.project(at);
        if (!p) {
          continue;
        }
        const up = src.project([at[0], at[1], at[2] + 2]);
        const side = Math.max(BOX_MIN_PX, up ? Math.abs(up.y - p.y) * 1.6 : BOX_MIN_PX);
        g.strokeStyle = INK;
        /* Confidence as the line's weight (BIBLE.md 6): unknown thin, a
         * class the room has given firmer. */
        g.lineWidth = c.cls === 'unknown' ? 1 : 1.75;
        const hs = side / 2;
        const k = hs * 0.45;
        g.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          g.moveTo(p.x + sx * hs, p.y + sy * (hs - k));
          g.lineTo(p.x + sx * hs, p.y + sy * hs);
          g.lineTo(p.x + sx * (hs - k), p.y + sy * hs);
        }
        g.stroke();
        g.lineWidth = 1.25;
        g.fillStyle = INK;
        const chip = str('ops.hud.id', { cls: say(`ops.class.${skey(c.cls)}`) });
        g.fillText(chip, p.x + hs + 5, p.y - hs + 4);
        if (c.label) {
          g.fillStyle = DIM;
          g.fillText(say(c.label), p.x + hs + 5, p.y - hs + 18);
        }
        this.marks.push({
          kind: 'contact', id: c.id, x: p.x, y: p.y, side, chip,
        });
      } else if (mark === 'lkp') {
        g.strokeStyle = DIM;
        if (this.groundRing(c.lkp, 25, [3, 4])) {
          const p = src.project(c.lkp);
          if (p) {
            g.fillStyle = DIM;
            g.fillText(str('ops.hud.lkp'), p.x + 8, p.y + 4);
          }
          this.marks.push({ kind: 'lkp', id: c.id, ...(p ?? {}) });
        }
      }
    }
  }

  /* The compass tape, top centre, with bearing hints: ticks toward the
   * search areas and last known positions, never toward a contact the
   * room has not told. */
  paintTape() {
    const { g, w, h, src } = this;
    const c = src.craft;
    const top = this.tapeTop ?? Math.max(44, h * 0.06);
    const half = Math.min(w * 0.3, 360);
    const cx = w / 2;
    const hdg = c.heading * DEG;
    const pxPerDeg = half / TAPE_SPAN;
    g.strokeStyle = DIM;
    g.fillStyle = DIM;
    g.textAlign = 'center';
    g.beginPath();
    for (let d = Math.ceil((hdg - TAPE_SPAN) / 5) * 5; d <= hdg + TAPE_SPAN; d += 5) {
      const x = cx + (d - hdg) * pxPerDeg;
      const major = d % 30 === 0;
      g.moveTo(x, top);
      g.lineTo(x, top + (major ? 9 : 5));
      if (major) {
        const n = ((d % 360) + 360) % 360;
        const label = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[n] ?? String(n).padStart(3, '0');
        g.fillText(label, x, top + 21);
      }
    }
    g.stroke();
    g.strokeStyle = INK;
    g.beginPath();
    g.moveTo(cx, top - 6);
    g.lineTo(cx - 4, top - 12);
    g.moveTo(cx, top - 6);
    g.lineTo(cx + 4, top - 12);
    g.stroke();
    this.marks.push({ kind: 'tape', x: cx, y: top });
    const hints = [];
    const v = src.view;
    if (v) {
      for (const s of v.search || []) {
        hints.push({ kind: 'search', id: s.id, at: s.at });
      }
      for (const k of v.contacts || []) {
        if (markOf(k) === 'lkp') {
          hints.push({ kind: 'lkp', id: k.id, at: k.lkp });
        }
      }
    }
    g.fillStyle = AMBER;
    for (const hnt of hints) {
      const d = wrapDeg(bearing(c.p, hnt.at) * DEG - hdg);
      const x = cx + Math.max(-TAPE_SPAN, Math.min(TAPE_SPAN, d)) * pxPerDeg;
      g.beginPath();
      g.moveTo(x, top - 2);
      g.lineTo(x - 4, top - 9);
      g.lineTo(x + 4, top - 9);
      g.closePath();
      g.fill();
      this.marks.push({
        kind: 'bearing', of: hnt.kind, id: hnt.id, x, y: top,
      });
    }
    g.textAlign = 'start';
  }

  /* The minimap: north up, centred on the aircraft, what the squad knows
   * and nothing else. */
  paintMap() {
    const src = this.src;
    const box = this.mapBox;
    const c = src.craft;
    box.style.display = c ? '' : 'none';
    if (!c) {
      return;
    }
    const s = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const W = Math.round(box.clientWidth * s);
    const H = Math.round(box.clientHeight * s);
    if (this.mapCanvas.width !== W || this.mapCanvas.height !== H) {
      this.mapCanvas.width = W;
      this.mapCanvas.height = H;
    }
    const g = this.mg;
    g.setTransform(s, 0, 0, s, 0, 0);
    const w = box.clientWidth;
    const h = box.clientHeight;
    g.clearRect(0, 0, w, h);
    const span = MAP_M[this.mapOpen ? 1 : 0];
    const k = w / span;
    const to = (p) => [w / 2 + (p[0] - c.p[0]) * k, h / 2 - (p[1] - c.p[1]) * k];
    g.lineWidth = 1;
    g.font = `${Math.max(8, Math.min(12, w * 0.055))}px ${FONT}`;
    const v = src.view;
    if (v && src.mission && src.mission.boundary) {
      const b = src.mission.boundary;
      const [x0, y0] = to([b.min[0], b.max[1]]);
      const [x1, y1] = to([b.max[0], b.min[1]]);
      g.strokeStyle = FAINT;
      g.setLineDash([4, 4]);
      g.strokeRect(x0, y0, x1 - x0, y1 - y0);
      g.setLineDash([]);
    }
    if (v) {
      g.strokeStyle = DIM;
      for (const sa of v.search || []) {
        const [x, y] = to(sa.at);
        g.setLineDash([3, 3]);
        g.beginPath();
        g.arc(x, y, Math.max(3, sa.r * k), 0, 2 * Math.PI);
        g.stroke();
        g.setLineDash([]);
      }
      for (const ct of v.contacts || []) {
        const mark = markOf(ct);
        if (mark === 'box') {
          const at = src.poseOf(ct);
          if (at) {
            const [x, y] = to(at);
            g.fillStyle = INK;
            g.fillRect(x - 1.5, y - 1.5, 3, 3);
          }
        } else if (mark === 'lkp') {
          const [x, y] = to(ct.lkp);
          g.strokeStyle = DIM;
          g.beginPath();
          g.arc(x, y, 3, 0, 2 * Math.PI);
          g.stroke();
        }
      }
    }
    /* Where the camera looks: a line to its aim. */
    if (src.aim) {
      const [ax, ay] = to(src.aim);
      g.strokeStyle = 'rgba(141, 255, 181, 0.6)';
      g.beginPath();
      g.moveTo(w / 2, h / 2);
      g.lineTo(ax, ay);
      g.stroke();
    }
    /* The aircraft, its heading up the screen's north. */
    g.fillStyle = INK;
    g.save();
    g.translate(w / 2, h / 2);
    g.rotate(c.heading);
    g.beginPath();
    g.moveTo(0, -6);
    g.lineTo(4, 4);
    g.lineTo(0, 2);
    g.lineTo(-4, 4);
    g.closePath();
    g.fill();
    g.restore();
    g.fillStyle = DIM;
    g.fillText('N', w / 2 - 3, 11);
    /* The scale bar: a round length near a quarter of the map. */
    const want = span / 4;
    const unit = [100, 200, 250, 500, 1000, 2000, 2500, 5000].find((u) => u >= want) ?? 5000;
    const len = unit * k;
    g.strokeStyle = INK;
    g.beginPath();
    g.moveTo(8, h - 10);
    g.lineTo(8 + len, h - 10);
    g.moveTo(8, h - 14);
    g.lineTo(8, h - 6);
    g.moveTo(8 + len, h - 14);
    g.lineTo(8 + len, h - 6);
    g.stroke();
    g.fillStyle = INK;
    g.fillText(unit >= 1000 ? str('ops.hud.km', { n: unit / 1000 }) : str('ops.hud.m', { n: unit }), 12 + len, h - 7);
  }
}
