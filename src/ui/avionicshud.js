/*
 * avionicshud.js: the HUDRenderer, the Avionics HUD preset over the FPV
 * camera (docs/AVIONICS-HUD.md section 8), laid out after the owner's
 * reference picture of 2026-10-01: a heading tape at the top, speed and
 * AGL tapes either side of the middle, an attitude arc and a compact pitch
 * ladder, the reticle with LEAD and CLOSURE when there is a track, and
 * four translucent corner panels: mode and tracking top left (the primary
 * track's whole readout), link and compute top right, energy bottom left,
 * the camera with its picture in picture bottom right.
 *
 * THE MIDDLE IS SPARSE (the owner's brief): attitude, the reticle, the
 * tracks as boxes with a one line tag, the lead cue and a line of closure.
 * Everything else is at the perimeter. Three levels of it, the pilot's
 * choice (Y): FULL adds the ladder's labels both sides, the line to the
 * lead and the other tracks' numbers; STANDARD is the default; MINIMAL is
 * the tapes, the attitude, the reticle and the primary's box alone. The
 * war's own markers stand down for an object the HUD has a box on, and
 * the war's kind for it goes into the box's tag: one marker an object.
 *
 * IT DRAWS STATE AND COMPUTES NONE. Every number comes from a system's
 * state object (src/avionics/telemetry.js, sensors.js, tracks.js,
 * hudstate.js), each with its provenance tag. What it does compute is
 * drawing: where a direction lands on the screen through the camera, how
 * many pixels a degree is, where a panel fits.
 *
 * HOW IT IS DRAWN. One canvas for the instruments, repainted at HUD_HZ,
 * and four DOM panels whose text changes only when a value does. The
 * tapes stand 0.37 of the height either side of the middle, where the FPV
 * OSD's sidebars stand, so they clear the war HUD's left column (which is
 * built to stop short of that line, src/ui/warhud.js) by construction. A
 * corner panel is put in its corner and slid away from the edge it hangs
 * from until it meets none of the game's own furniture and none of the
 * panels placed before it, the way src/ui/fpvhud.js places its readouts.
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
import { attitudeOf } from './fpvhud.js';

const HUD_HZ = 30;
/* Panels' text, which a pilot reads rather than watches. */
const TEXT_HZ = 10;
/* The game's furniture is looked for this often (it comes and goes). */
const KEEP_OUT_MS = 1000;
/* The inset's width as a share of the screen's at each size the pilot
 * picks (U) above the small one, which is the fixed 13em it always was.
 * place() gives a larger one less when the room right of the height tape,
 * or under the top right panel, is narrower. */
const INSET_SHARE = { medium: 0.2, large: 1 / 3 };
const INSET_SMALL_EM = 13;
/* The panels' margin from the window and from each other, CSS px. */
const PANEL_EDGE = 16;
const PANEL_GAP = 8;
const MAX_DPR = 3;
const DEG = 180 / Math.PI;

/* Ink. Cyan for the instruments, green for what is well, white for
 * values, amber for a caution, red for the target and for a failure. */
const CYAN = '#63e3ff';
const GREEN = '#6dff9e';
const WHITE = '#eef7fa';
const AMBER = '#ffbf3c';
const RED = '#ff4b4b';
const HALO = 'rgba(0, 0, 0, 0.75)';
const FONT = 'ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace';

/* The tapes' line from the middle, as a share of the height: the FPV
 * OSD's sidebar line, which the war HUD stops short of. */
const TAPE_FROM_MID = 0.37;
/* Speed tape: km/h either side of the box, and its ticks. */
const SPD_SPAN = 40;
const SPD_TICK = 10;
const SPD_LABEL = 20;
/* AGL tape: metres either side, ticks, labels. */
const AGL_SPAN = 50;
const AGL_TICK = 10;
const AGL_LABEL = 20;
/* Heading tape: degrees either side of the box. */
const HDG_SPAN = 60;
/* Track confidence (that the object is real) under which the box is
 * dashed (docs/AVIONICS-HUD.md 8.2). The class words are the
 * TrackManager's: it holds AIR OBJECT until a class is likely. */
const CONF_FIRM = 0.6;
const BOX_MIN_PX = 18;
/* A pitch rung's half width in azimuth, rad, and the horizon's: a compact
 * ladder round the reticle, as a conventional HUD's. */
const RUNG_HALF = 0.09;
const RUNG_HORIZON = 0.2;
/* The ladder's ink, thinner and dimmer than the instruments'. */
const RUNG_ALPHA = 0.4;
const RUNG_WIDTH = 0.9;
/* An interval wider than this ratio (hi over lo) says too little to be
 * drawn as one: it is shown as an estimate, ~ its geometric middle. */
const WIDE_RATIO = 2;
/* A war marker this close to a drawn box, CSS px past its half side, is
 * the same object (the box is drawn at HUD_HZ, the markers every frame). */
const CLAIM_PX = 14;
/* A stale value's ink. */
const STALE_ALPHA = 0.45;
const GHOST_ALPHA = 0.3;

/* The war markers' radar, as src/ui/warmarkers.js draws it (RADAR_PX,
 * RADAR_TOP_PX, its 18 px right inset and 20 px of label over it).
 * scripts/avionics-layout.js reads the real numbers from that file and
 * fails if these drift. */
const RADAR_PX = 86;
const RADAR_TOP_PX = 164;


const CSS = `
.avx { position: absolute; inset: 0; pointer-events: none; display: none; font-family: ${FONT};
  font-size: clamp(10px, 1.4vh, 14px); color: ${WHITE}; letter-spacing: 0.04em; }
.avx canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.avx-panel { position: absolute; background: rgba(6, 12, 18, 0.62); border: 1px solid rgba(120, 190, 215, 0.32);
  padding: 0.55em 0.8em; line-height: 1.5; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8); white-space: nowrap; }
.avx-row { display: grid; grid-template-columns: 7.5em auto; column-gap: 0.8em; }
.avx-row > span > span + span { margin-left: 0.7em; }
.avx-k { color: rgba(238, 247, 250, 0.72); }
.avx-ok { color: ${GREEN}; }
.avx-warn { color: ${AMBER}; }
.avx-bad { color: ${RED}; }
.avx-stale { opacity: ${STALE_ALPHA}; }
.avx-tag { font-size: 0.72em; color: ${CYAN}; border: 1px solid rgba(99, 227, 255, 0.45); padding: 0 0.3em; margin-left: 0.6em;
  vertical-align: 0.1em; letter-spacing: 0.06em; }
.avx-tabs { display: flex; gap: 0.3em; margin-bottom: 0.5em; align-items: center; }
.avx-tab { padding: 0.05em 0.5em; color: rgba(238, 247, 250, 0.4); }
.avx-tab.on { background: ${GREEN}; color: #04140a; text-shadow: none; }
.avx-head { color: ${WHITE}; font-weight: 700; margin-bottom: 0.2em; }
.avx-bar { height: 0.45em; background: rgba(238, 247, 250, 0.16); margin: 0.25em 0 0.45em; position: relative; }
.avx-bar > i { position: absolute; left: 0; top: 0; bottom: 0; background: ${GREEN}; }
.avx-motors { display: grid; grid-template-columns: repeat(4, auto) min-content; column-gap: 1.1em; align-items: center; }
.avx-motors .avx-bar { height: 0.3em; margin: 0.15em 0 0; }
.avx-cam { display: flex; gap: 0.9em; }
.avx-cam.avx-cam-col { flex-direction: column; gap: 0.5em; }
.avx-pip { position: relative; width: ${INSET_SMALL_EM}em; aspect-ratio: 16 / 10; border: 1px solid rgba(120, 190, 215, 0.4);
  background: rgba(0, 0, 0, 0.55); overflow: hidden; }
.avx-pip > canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.avx-pip > b { position: absolute; left: 0.45em; top: 0.25em; font-weight: 400; font-size: 0.9em; z-index: 1; }
.avx-sel { display: inline-block; padding: 0 0.35em; color: rgba(238, 247, 250, 0.5); }
.avx-sel.on { color: ${WHITE}; border: 1px solid ${WHITE}; }
.avx-rec { color: ${RED}; }
#ui.avx-on .osd-top, #ui.avx-on .osd-corner { display: none; }
.avx.avx-minimal .avx-panel, .avx-panel.avx-off { display: none; }
`;

/* A DOM element with a class and optional text. */
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

/* m:ss. */
function mmss(s) {
  if (!Number.isFinite(s)) {
    return '--:--';
  }
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/* A field whose text and class are written only when they change. */
class Field {
  constructor(parent, cls = '') {
    this.e = el('span', cls, parent);
    this.text = null;
    this.cls = cls;
    this.base = cls;
  }

  set(text, cls = '') {
    if (text !== this.text) {
      this.text = text;
      this.e.textContent = text;
    }
    const want = cls ? `${this.base} ${cls}`.trim() : this.base;
    if (want !== this.cls) {
      this.cls = want;
      this.e.className = want;
    }
  }
}

/* A row: a key and fields after it, and a provenance tag. */
function row(parent, key) {
  const r = el('div', 'avx-row', parent);
  el('span', 'avx-k', r, key);
  const v = el('span', '', r);
  return v;
}

function tag(parent) {
  return new Field(parent, 'avx-tag');
}

const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export class AvionicsHud {
  constructor(root) {
    this.root = root;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.el = el('div', 'avx');
    this.el.setAttribute('aria-hidden', 'true');
    /* First child, so every banner, dialog and menu paints over it. */
    root.prepend(this.el);
    this.canvas = el('canvas', '', this.el);
    this.g = this.canvas.getContext('2d');
    this.on = false;
    this.dim = false;
    this.textPx = 11;
    this.nextDrawMs = 0;
    this.nextTextMs = 0;
    this.keepOutAt = 0;
    this.keepOut = [];
    this.w = 0;
    this.h = 0;
    this.s = 1;
    this.sizeDirty = true;
    this.src = null;
    this.camAtt = { pitch: 0, roll: 0, heading: 0 };
    this.proj = { x: 0, y: 0, ok: false };
    this.rungDir = [0, 0, 0];
    this.placed = [];
    this.stats = { ticks: 0, tickMs: 0, worstTickMs: 0 };
    /* 'full', 'standard' or 'minimal': the pilot's choice (Y). */
    this.level = 'standard';
    /* The boxes drawn this paint, { id, x, y, r, tag }, which the war's
     * markers read (src/ui/warmarkers.js setClaims) and write the war's
     * kind into; and that kind by track id, kept from the paint before. */
    this.claims = [];
    this.kindOf = new Map();
    /* What the last paint filled and wrote, CSS px, for the checks. */
    this.fills = [];
    this.texts = [];
    /* Whether the last paint drew IN RANGE on the primary, for the checks. */
    this.inRangeDrawn = false;
    this.build();
    window.addEventListener('resize', () => { this.sizeDirty = true; });
    window.__avionicsHud = () => ({
      on: this.on,
      state: this.src ? this.src.hud.state : null,
      reasons: this.src ? [...this.src.hud.reasons] : [],
      panels: this.panelRects(),
      tapes: this.tapeRects(),
      keepOut: this.keepOut.map((r) => ({ ...r })),
      stats: { ...this.stats },
      level: this.level,
      fills: this.fills.map((r) => ({ ...r })),
      texts: this.texts.map((r) => ({ ...r })),
      claims: this.claims.map((c) => ({ ...c })),
      inRange: this.inRangeDrawn,
    });
  }

  build() {
    const P = (name) => el('div', `avx-panel avx-${name}`, this.el);
    /* Top left: mode and tracking. */
    const mode = P('mode');
    const tabs = el('div', 'avx-tabs', mode);
    el('span', 'avx-k', tabs, str('avionics.hud.mode'));
    this.tabManual = new Field(tabs, 'avx-tab');
    this.tabTrack = new Field(tabs, 'avx-tab');
    this.tabAssist = new Field(tabs, 'avx-tab');
    el('div', 'avx-head', mode, str('avionics.hud.tracking'));
    this.fAi = new Field(row(mode, str('avionics.hud.ai_track')));
    /* The primary track's readout, here and not at the target, so the
     * middle of the picture stays the pilot's. */
    const target = row(mode, str('avionics.hud.target'));
    this.fTarget = new Field(target);
    this.fConf = new Field(target);
    const src = row(mode, str('avionics.hud.source'));
    this.fSource = new Field(src);
    const age = row(mode, str('avionics.hud.track_time'));
    this.fTrackTime = new Field(age);
    this.fVis = new Field(age);
    const rng = row(mode, str('avionics.hud.rng'));
    this.fRng = new Field(rng);
    this.fBrg = new Field(rng);
    const spd = row(mode, str('avionics.hud.spd'));
    this.fSpd = new Field(spd);
    this.fAlt = new Field(spd);
    const nav = row(mode, str('avionics.hud.nav'));
    this.fNav = new Field(nav);
    this.fState = new Field(row(mode, str('avionics.hud.state')));

    /* Top right: link, navigation sources, compute. */
    const health = P('health');
    const link = row(health, str('avionics.hud.link'));
    this.fLink = new Field(link);
    this.fLinkDetail = new Field(link);
    this.fLinkTag = tag(link);
    const gnss = row(health, str('avionics.hud.gnss'));
    this.fGnss = new Field(gnss);
    this.fGnssAcc = new Field(gnss);
    this.fGnssState = new Field(gnss);
    this.fGnssTag = tag(gnss);
    const vio = row(health, str('avionics.hud.vio'));
    this.fVio = new Field(vio);
    this.fVioWhy = new Field(vio);
    this.fVioTag = tag(vio);
    const cpu = row(health, str('avionics.hud.cpu'));
    this.fCpu = new Field(cpu);
    tag(cpu).set('SIM');
    const temp = row(health, str('avionics.hud.temp'));
    this.fTemp = new Field(temp);
    tag(temp).set('SIM');

    /* Bottom left: energy and propulsion. */
    const energy = P('energy');
    const batt = el('div', 'avx-row', energy);
    el('span', 'avx-k', batt, str('avionics.hud.batt'));
    const bv = el('span', '', batt);
    this.fBatt = new Field(bv);
    tag(bv).set('FC');
    const bar = el('div', 'avx-bar', energy);
    this.battFill = el('i', '', bar);
    const endu = row(energy, str('avionics.hud.endurance'));
    this.fEndurance = new Field(endu);
    const motors = el('div', 'avx-motors', energy);
    this.motorF = [];
    this.motorBars = [];
    for (let i = 0; i < 4; i += 1) {
      const cell = el('div', '', motors);
      this.motorF.push(new Field(cell));
      const mb = el('div', 'avx-bar', cell);
      this.motorBars.push(el('i', '', mb));
    }
    tag(motors).set('SIM');

    /* Bottom right: the camera, and the picture in picture slot the
     * SensorManager fills (docs/AVIONICS-HUD.md section 5). */
    const cam = P('cam');
    cam.classList.add('avx-cam');
    this.pip = el('div', 'avx-pip', cam);
    this.fPipTitle = new Field(el('b', '', this.pip));
    this.pipCanvas = null;
    this.pipShown = true;
    this.inset = 'small';
    const ctl = el('div', '', cam);
    const camRow = row(ctl, str('avionics.hud.cam'));
    this.fCamEo = new Field(camRow, 'avx-sel');
    this.fCamIr = new Field(camRow, 'avx-sel');
    const zoomRow = row(ctl, str('avionics.hud.zoom'));
    this.zoomF = [1, 2, 4].map(() => new Field(zoomRow, 'avx-sel'));
    this.fExp = new Field(row(ctl, str('avionics.hud.exp')));
    this.fStab = new Field(row(ctl, str('avionics.hud.stab')));
    this.fRec = new Field(row(ctl, str('avionics.hud.rec')));
    this.panels = { mode, health, energy, cam };
  }

  /* Each panel on the screen, CSS px. */
  panelRects() {
    const out = {};
    for (const [id, p] of Object.entries(this.panels)) {
      const r = p.getBoundingClientRect();
      out[id] = { x: r.left, y: r.top, w: r.width, h: r.height };
    }
    return out;
  }

  /* The tapes and the heading tape as boxes, CSS px, for the layout check. */
  tapeRects(L = this.layout()) {
    return {
      speed: { x: L.spdX - L.box * 1.4, y: L.cy - L.tapeH / 2 - L.font * 2, w: L.box * 2.6, h: L.tapeH + L.font * 3 },
      agl: { x: L.aglX - L.box * 1.2, y: L.cy - L.tapeH / 2 - L.font * 2, w: L.box * 2.6, h: L.tapeH + L.font * 3 },
      heading: { x: L.cx - L.hdgW / 2, y: L.hdgY - L.font, w: L.hdgW, h: L.font * 4.5 },
    };
  }

  /* Each panel and tape as peermarks reads the FPV OSD's readouts, so a
   * room's lines and arrows slide off them as they do off the OSD's. */
  readoutRects(fn) {
    if (!this.on) {
      return;
    }
    for (const r of [...Object.values(this.panelRects()), ...Object.values(this.tapeRects())]) {
      fn(r.x, r.y, r.w, r.h);
    }
  }

  /*
   * Every frame. `want`: the Avionics style chosen, the FPV camera live,
   * flight or pause. src: { tel, sensor, sensors, snap, hud, camera,
   * radar, fuze } (radar: the war markers are up, so their radar is
   * furniture; fuze: the room would set this aircraft's warhead off on
   * the primary track's attacker now, src/ui/warmarkers.js inRangeAt).
   */
  tick(want, paused, nowMs, src) {
    const on = Boolean(want && src);
    if (on !== this.on) {
      this.on = on;
      this.el.style.display = on ? 'block' : 'none';
      this.root.classList.toggle('avx-on', on);
      this.nextDrawMs = 0;
      this.nextTextMs = 0;
      this.keepOutAt = 0;
    }
    if (paused !== this.dim) {
      this.dim = paused;
      this.el.style.opacity = paused ? '0.4' : '1';
    }
    if (!on) {
      this.claims.length = 0;
      return;
    }
    this.src = src;
    if (src.sensors && src.sensors.pip !== this.pipCanvas) {
      if (this.pipCanvas) {
        this.pipCanvas.remove();
      }
      this.pipCanvas = src.sensors.pip;
      if (this.pipCanvas) {
        this.pip.prepend(this.pipCanvas);
      }
    }
    /* The sensor full screen is the inset's picture already (I). */
    const pipShown = src.sensor.mainView !== 'sensor';
    if (pipShown !== this.pipShown || src.sensor.inset !== this.inset) {
      this.pipShown = pipShown;
      this.inset = src.sensor.inset;
      this.pip.style.display = pipShown ? '' : 'none';
      /* The camera block changed size: place the panels again now. */
      this.keepOutAt = 0;
    }
    const t0 = performance.now();
    if (nowMs >= this.nextTextMs) {
      this.nextTextMs = nowMs + 1000 / TEXT_HZ;
      this.text(src);
    }
    if (this.sizeDirty) {
      this.resize();
    }
    if (nowMs >= this.keepOutAt) {
      this.keepOutAt = nowMs + KEEP_OUT_MS;
      this.readKeepOut(src.radar);
      this.place();
    }
    if (nowMs >= this.nextDrawMs) {
      this.nextDrawMs = Math.max(this.nextDrawMs + 1000 / HUD_HZ, nowMs);
      this.draw(src);
    }
    const ms = performance.now() - t0;
    this.stats.ticks += 1;
    this.stats.tickMs += ms;
    this.stats.worstTickMs = Math.max(this.stats.worstTickMs, ms);
  }

  /* The declutter level, one of 'full', 'standard', 'minimal'. MINIMAL
   * hides the corner panels too. */
  setLevel(level) {
    this.level = level;
    this.el.classList.toggle('avx-minimal', level === 'minimal');
    this.nextDrawMs = 0;
    this.keepOutAt = 0;
  }

  resize() {
    this.sizeDirty = false;
    this.keepOutAt = 0;
    const r = this.el.getBoundingClientRect();
    this.w = r.width;
    this.h = r.height;
    this.s = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.w * this.s);
    this.canvas.height = Math.round(this.h * this.s);
    this.textPx = parseFloat(getComputedStyle(this.el).fontSize) || 11;
  }

  /* The game's furniture this second, CSS px relative to the HUD. */
  readKeepOut(radar) {
    const o = this.el.getBoundingClientRect();
    this.keepOut.length = 0;
    /* The game's own things over a flight that no panel may sit on. */
    for (const e of document.querySelectorAll('.bug-chip, .music-dock, .osd-gimbal, .osd-sticks, .osd-air, .war-hud, .war-calls, .war-round, .banner')) {
      if (this.el.contains(e)) {
        continue;
      }
      const r = e.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none') {
        /* A banner is a line of text that comes and goes: soft. */
        this.keepOut.push({ x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height, soft: e.classList.contains('banner') });
      }
    }
    if (radar) {
      this.keepOut.push({ x: this.w - RADAR_PX * 2 - 18, y: RADAR_TOP_PX - 20, w: RADAR_PX * 2, h: RADAR_PX * 2 + 20 });
    }
  }

  /*
   * The corner panels, each in its corner and slid away from the edge it
   * hangs from until clear of the furniture and of the panels before it.
   * The order is the precedence: the energy and camera panels first,
   * since they are the ones a pilot needs in a hurry.
   */
  place() {
    const order = [['energy', 'l', 'b'], ['cam', 'r', 'b'], ['mode', 'l', 't'], ['health', 'r', 't']];
    this.placed.length = 0;
    const tapes = this.tapeRects();
    const fixed = [tapes.heading];
    this.sizeInset(tapes.agl, fixed);
    for (const [id] of order) {
      this.panels[id].classList.remove('avx-off');
    }
    /* In precedence order: on a screen too crowded for all four (a phone
     * in a war), the last ones give way rather than sit on the first. */
    for (const [id, ax, ay] of order) {
      const me = this.slide(this.panels[id], ax, ay, [...this.keepOut, ...this.placed, ...fixed]);
      if (!me) {
        this.panels[id].classList.add('avx-off');
        continue;
      }
      this.panels[id].style.left = `${Math.round(me.x)}px`;
      this.panels[id].style.top = `${Math.round(me.y)}px`;
      this.placed.push(me);
    }
  }

  /*
   * Panel p in its corner, slid away from the edge it hangs from until
   * clear of `against`. On a narrow screen a centre banner reaches both
   * columns, and sliding under it pushed the top panels off the bottom of
   * a phone: when no place inside the window clears everything, the
   * panel dodges only what stays (not the soft banners), since sitting
   * under a passing line of text beats sitting on another panel or not
   * being there. Failing that too, null: no room for it on this screen.
   */
  slide(p, ax, ay, against) {
    const w = p.offsetWidth;
    const h = p.offsetHeight;
    const x = ax === 'l' ? PANEL_EDGE : this.w - PANEL_EDGE - w;
    const home = ay === 't' ? PANEL_EDGE : this.h - PANEL_EDGE - h;
    let me = null;
    for (const set of [against, against.filter((r) => !r.soft)]) {
      me = { x, y: home, w, h };
      for (let tries = 0; tries < 16; tries += 1) {
        const hit = set.find((r) => meets(r, me));
        if (!hit) {
          return me;
        }
        const y = ay === 't' ? hit.y + hit.h + PANEL_GAP : hit.y - PANEL_GAP - h;
        if (y < PANEL_EDGE || y + h > this.h - PANEL_EDGE) {
          break;
        }
        me.y = y;
      }
    }
    return null;
  }

  /*
   * A medium or large inset's width, CSS px: its share of the screen, but
   * no wider than the room right of the height tape and no taller than
   * the room under the top right panel, so it never sits on either.
   */
  sizeInset(agl, fixed) {
    const share = INSET_SHARE[this.inset];
    const cam = this.panels.cam;
    cam.classList.remove('avx-cam-col');
    this.pip.style.width = '';
    if (!share || !this.pipShown) {
      return;
    }
    /* Measured with the camera's rows under the picture, as it will be. */
    cam.classList.add('avx-cam-col');
    const cs = getComputedStyle(cam);
    const chromeW = cam.offsetWidth - cam.clientWidth + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const chromeH = cam.offsetHeight - this.pip.offsetHeight;
    /* Where the top right panel will sit: under the game's chips there. */
    const health = this.slide(this.panels.health, 'r', 't', [...this.keepOut, ...fixed]);
    const above = health ? health.y + health.h + PANEL_GAP : PANEL_EDGE;
    const roomW = this.w - PANEL_EDGE - (agl.x + agl.w + PANEL_GAP) - chromeW;
    const roomH = this.h - PANEL_EDGE - above - chromeH;
    const w = Math.floor(Math.min(share * this.w, roomW, roomH * 1.6));
    /* No room for more than the small inset (a phone): small's layout,
     * with the larger size's sharper pixels in it. */
    if (w <= INSET_SMALL_EM * this.textPx) {
      cam.classList.remove('avx-cam-col');
      return;
    }
    this.pip.style.width = `${w}px`;
  }

  /* The panels' text from the state objects. */
  text(src) {
    const { tel, sensor, snap, hud } = src;
    const prim = snap.primaryId != null ? snap.tracks.find((t) => t.id === snap.primaryId) : null;
    const ai = hud.ai;
    this.tabManual.set(str('avionics.hud.manual'), hud.state === 'MANUAL' ? 'on' : '');
    this.tabTrack.set(str('avionics.hud.track_ai'), ai ? 'on' : '');
    this.tabAssist.set(str('avionics.hud.acro_assist'), hud.state === 'ASSIST' ? 'on' : '');
    this.fAi.set(ai ? str('avionics.hud.on') : str('avionics.hud.off'), ai ? 'avx-ok' : '');
    if (prim) {
      const firm = prim.confidence >= CONF_FIRM;
      const kind = this.kindOf.get(prim.id);
      const cls = str(`avionics.track.cls.${prim.cls}`);
      this.fTarget.set(kind ? str('avionics.hud.kind_cls', { kind, cls }) : cls, prim.stale ? 'avx-stale' : '');
      this.fConf.set(`${Math.round(prim.confidence * 100)}%`, firm ? 'avx-ok' : 'avx-warn');
      this.fSource.set(str(`avionics.hud.src.${prim.sourceSensor.toLowerCase()}`));
      this.fTrackTime.set(str('avionics.hud.seconds', { s: prim.ageS.toFixed(1) }));
      this.fVis.set(prim.occlusion > 0.5 ? str('avionics.hud.occ') : str('avionics.hud.vis'), prim.occlusion > 0.5 ? 'avx-warn' : '');
      const r = prim.rangeM;
      this.fRng.set(r ? rangeText(r) : '--', r && wide(r) ? 'avx-stale' : '');
      this.fBrg.set(str('avionics.hud.brg_of', { d: String(Math.round((prim.bearing.azRad * DEG + 360) % 360)).padStart(3, '0') }));
      this.fSpd.set(prim.speedMs ? str('avionics.hud.kmh_est', { n: Math.round(((prim.speedMs.lo + prim.speedMs.hi) / 2) * 3.6) }) : '--');
      const alt = prim.altM ? (prim.altM.lo + prim.altM.hi) / 2 : null;
      this.fAlt.set(alt === null ? '' : str('avionics.hud.alt_of', { n: Math.round(alt), d: signed(Math.round(alt - tel.agl.m)) }));
    } else {
      this.fTarget.set(ai ? str('avionics.hud.searching') : str('avionics.hud.none'), ai ? 'avx-warn' : '');
      this.fConf.set('');
      this.fSource.set(ai ? str(`avionics.hud.src.${sensorFamily(sensor.mode).toLowerCase()}`) : '--');
      this.fTrackTime.set('--');
      this.fVis.set('');
      this.fRng.set('--');
      this.fBrg.set('');
      this.fSpd.set('--');
      this.fAlt.set('');
    }
    const navCls = tel.nav.source === 'DR' ? 'avx-bad' : tel.nav.source === 'VIO' ? 'avx-warn' : 'avx-ok';
    this.fNav.set(str(`avionics.hud.navsrc.${tel.nav.source.toLowerCase()}`), navCls);
    this.fState.set(str(`avionics.hud.st.${hud.state.toLowerCase()}`), hud.state === 'DEGRADED' ? 'avx-bad' : '');

    const L = tel.link;
    this.fLink.set(str(`avionics.hud.link_${L.state}`), L.state === 'ok' ? 'avx-ok' : L.state === 'weak' ? 'avx-warn' : 'avx-bad');
    this.fLinkDetail.set(str('avionics.hud.link_detail', { ms: Math.round(L.latencyMs), lq: L.lq, hz: L.hz }));
    this.fLinkTag.set('FC');
    const G = tel.gnss;
    const gCls = G.state === 'ok' ? '' : G.state === 'denied' ? 'avx-bad' : 'avx-warn';
    this.fGnss.set(str('avionics.hud.sats', { n: G.sats }), gCls);
    this.fGnssAcc.set(G.sats ? str('avionics.hud.metres', { n: G.hdopM.toFixed(1) }) : '--', gCls);
    this.fGnssState.set(str(`avionics.hud.gnss_${G.state}`), G.state === 'ok' ? 'avx-ok' : gCls);
    this.fGnssTag.set('GNSS', G.state === 'ok' ? '' : 'avx-stale');
    const V = tel.vio;
    const vCls = V.state === 'ok' ? 'avx-ok' : V.state === 'degraded' ? 'avx-warn' : 'avx-bad';
    this.fVio.set(str(`avionics.hud.vio_${V.state}`), vCls);
    this.fVioWhy.set(V.why ? str(`avionics.hud.why_vio.${V.why}`) : '', vCls);
    this.fVioTag.set(tel.nav.source === 'VIO' ? str('avionics.hud.in_use') : 'VIO');
    this.fCpu.set(str('avionics.hud.cpu_load', { pct: Math.round(tel.compute.load * 100) }));
    this.fTemp.set(str('avionics.hud.degc', { n: Math.round(tel.compute.tempC) }));

    const B = tel.battery;
    this.fBatt.set(str('avionics.hud.batt_line', {
      v: B.volts.toFixed(1), pct: `${B.percentFrom === 'voltage' ? '~' : ''}${Math.round(B.percent * 100)}`, a: B.amps.toFixed(1), w: Math.round(B.watts),
    }),
      B.state === 'critical' ? 'avx-bad' : B.state === 'warning' ? 'avx-warn' : '');
    this.battFill.style.width = `${Math.round(B.percent * 100)}%`;
    this.battFill.style.background = B.state === 'ok' ? GREEN : B.state === 'warning' ? AMBER : RED;
    const E = tel.endurance;
    this.fEndurance.set(E ? `${mmss(E.remainS)} / ${mmss(E.totalS)}` : str('avionics.hud.not_modelled'), E ? '' : 'avx-stale');
    tel.motors.forEach((m, i) => {
      this.motorF[i].set(str('avionics.hud.motor', { i: i + 1, t: Math.round(m.tempC) }));
      const u = Math.max(0, Math.min(1, (m.tempC - 20) / 80));
      this.motorBars[i].style.width = `${Math.round(u * 100)}%`;
      this.motorBars[i].style.background = m.tempC > 85 ? RED : m.tempC > 65 ? AMBER : GREEN;
    });

    const fam = sensorFamily(sensor.mode);
    this.fPipTitle.set(str(`avionics.hud.cam_mode.${sensor.pipMode}`));
    this.fCamEo.set(str('avionics.hud.src.eo'), fam === 'EO' ? 'on' : '');
    this.fCamIr.set(fam === 'EO' ? str('avionics.hud.src.ir') : str(`avionics.hud.cam_mode.${sensor.mode}`), fam === 'EO' ? '' : 'on');
    [1, 2, 4].forEach((z, i) => this.zoomF[i].set(`${z}x`, sensor.zoom === z ? 'on' : ''));
    this.fExp.set(sensor.exposure.auto ? str('avionics.hud.auto') : str('avionics.hud.ev', { n: signed(sensor.exposure.ev.toFixed(1)) }));
    this.fStab.set(sensor.stab ? str('avionics.hud.on') : str('avionics.hud.off'), sensor.stab ? 'avx-ok' : '');
    this.fRec.set(sensor.rec.on ? `● ${mmss(sensor.rec.s)}` : str('avionics.hud.off'), sensor.rec.on ? 'avx-rec' : '');
  }

  /* Where things stand this frame, CSS px. */
  layout() {
    const w = this.w;
    const h = this.h;
    const font = this.textPx;
    const cx = w / 2;
    const cy = h / 2;
    return {
      w, h, font, cx, cy,
      spdX: cx - TAPE_FROM_MID * h + font * 3.2,
      aglX: cx + TAPE_FROM_MID * h - font * 3.2,
      tapeH: h * 0.34,
      box: font * 2.6,
      hdgW: Math.min(w * 0.36, h * 0.75),
      hdgY: Math.max(18, h * 0.035),
    };
  }

  /* A render frame direction on the screen, through the camera: into
   * this.proj, ok false when it is behind. */
  project(camera, d) {
    const e = camera.matrixWorldInverse.elements;
    const x = e[0] * d[0] + e[4] * d[1] + e[8] * d[2];
    const y = e[1] * d[0] + e[5] * d[1] + e[9] * d[2];
    const z = e[2] * d[0] + e[6] * d[1] + e[10] * d[2];
    const P = this.proj;
    if (z >= -1e-3) {
      P.ok = false;
      return P;
    }
    const f = 1 / Math.tan((camera.fov / DEG) / 2);
    P.x = this.w / 2 + ((x / -z) * f / camera.aspect) * (this.w / 2);
    P.y = this.h / 2 - ((y / -z) * f) * (this.h / 2);
    P.ok = true;
    return P;
  }

  draw(src) {
    const g = this.g;
    const s = this.s;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.setTransform(s, 0, 0, s, 0, 0);
    const L = this.layout();
    const thermal = src.hud.state === 'THERMAL';
    const ink = thermal ? WHITE : CYAN;
    g.lineWidth = 1.25;
    g.lineJoin = 'round';
    g.font = `${L.font}px ${FONT}`;
    g.textBaseline = 'middle';
    g.shadowColor = HALO;
    g.shadowBlur = 3;
    this.fills.length = 0;
    this.texts.length = 0;
    this.heading(L, src, ink);
    this.speedTape(L, src.tel, ink);
    this.aglTape(L, src.tel, ink);
    this.reticle(L, ink);
    this.tracks(L, src);
    /* After the tracks: a ladder number gives way to their words. */
    this.attitude(L, src, ink);
    this.degraded(L, src.hud);
  }

  /* Where words drawn at x, y with the canvas's font and alignment go. */
  textRect(text, x, y) {
    const m = this.g.measureText(text);
    return {
      text, x: x - m.actualBoundingBoxLeft, y: y - m.actualBoundingBoxAscent, w: m.actualBoundingBoxLeft + m.actualBoundingBoxRight, h: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent,
    };
  }

  /* fillText, and where the words went, for the checks. */
  say(text, x, y) {
    this.g.fillText(text, x, y);
    this.texts.push(this.textRect(text, x, y));
  }

  /* say(), unless the words would land on words already said. */
  sayClear(text, x, y) {
    const me = this.textRect(text, x, y);
    if (!this.texts.some((r) => meets(r, me))) {
      this.g.fillText(text, x, y);
      this.texts.push(me);
    }
  }

  /* fillRect, and where and how solid, for the checks. */
  fillBox(x, y, w, h, style, alpha) {
    this.g.fillStyle = style;
    this.g.fillRect(x, y, w, h);
    this.fills.push({ x, y, w, h, alpha });
  }

  heading(L, src, ink) {
    const g = this.g;
    const hdg = src.tel.attitude.heading * DEG;
    const x0 = L.cx - L.hdgW / 2;
    const pxPerDeg = L.hdgW / (HDG_SPAN * 2);
    const y = L.hdgY;
    g.strokeStyle = ink;
    g.fillStyle = WHITE;
    g.textAlign = 'center';
    const first = Math.ceil((hdg - HDG_SPAN) / 10) * 10;
    for (let d = first; d <= hdg + HDG_SPAN; d += 10) {
      const x = L.cx + (d - hdg) * pxPerDeg;
      const n = ((d % 360) + 360) % 360;
      const big = n % 30 === 0;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y + (big ? L.font * 1.1 : L.font * 0.6));
      g.stroke();
      /* Not under the boxed heading, which says it. */
      if (big && Math.abs(x - L.cx) > L.font * 3.2) {
        const card = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[n];
        this.say(card || String(n), x, y + L.font * 2);
      }
    }
    g.beginPath();
    g.moveTo(x0, y);
    g.lineTo(x0 + L.hdgW, y);
    g.globalAlpha = 0.35;
    g.stroke();
    g.globalAlpha = 1;
    /* The lubber line and the boxed heading. */
    const bw = L.font * 3.6;
    const by = y + L.font * 1.35;
    this.fillBox(L.cx - bw / 2, by, bw, L.font * 1.6, 'rgba(6, 12, 18, 0.7)', 0.7);
    g.strokeStyle = WHITE;
    g.strokeRect(L.cx - bw / 2, by, bw, L.font * 1.6);
    g.fillStyle = WHITE;
    g.font = `700 ${L.font * 1.1}px ${FONT}`;
    this.say(String(Math.round(hdg) % 360).padStart(3, '0'), L.cx, by + L.font * 0.82);
    g.font = `${L.font}px ${FONT}`;
    g.beginPath();
    g.moveTo(L.cx, y - 1);
    g.lineTo(L.cx - 5, y - 9);
    g.lineTo(L.cx + 5, y - 9);
    g.closePath();
    g.fill();
    /* The primary track's bearing, a red caret on the tape. */
    const prim = primaryOf(src.snap);
    if (prim) {
      let db = prim.bearing.azRad * DEG - hdg;
      db = ((db + 540) % 360) - 180;
      const x = L.cx + Math.max(-HDG_SPAN, Math.min(HDG_SPAN, db)) * pxPerDeg;
      g.fillStyle = RED;
      g.beginPath();
      g.moveTo(x, y + 2);
      g.lineTo(x - 5, y + 10);
      g.lineTo(x + 5, y + 10);
      g.closePath();
      g.fill();
    }
  }

  /* A vertical tape: line at x, value v in the box, ticks every `tick`,
   * labels every `label`, `span` either side, the labels on side `dir`
   * (-1 left, +1 right). */
  tape(L, x, v, span, tick, label, dir, title, boxText, ink, dimmed) {
    const g = this.g;
    const top = L.cy - L.tapeH / 2;
    const pxPer = L.tapeH / (span * 2);
    g.strokeStyle = ink;
    g.fillStyle = WHITE;
    g.globalAlpha = dimmed ? STALE_ALPHA : 1;
    g.beginPath();
    g.moveTo(x, top);
    g.lineTo(x, top + L.tapeH);
    g.stroke();
    g.textAlign = dir > 0 ? 'left' : 'right';
    const first = Math.max(0, Math.ceil((v - span) / tick) * tick);
    for (let k = first; k <= v + span; k += tick) {
      const y = L.cy - (k - v) * pxPer;
      const big = k % label === 0;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + dir * (big ? L.font * 0.9 : L.font * 0.5), y);
      g.stroke();
      /* Not over the box, nor over the unit under it. */
      if (big && (y < L.cy - L.font * 1.2 || y > L.cy + L.font * 2.9)) {
        this.say(String(k), x + dir * L.font * 1.3, y);
      }
    }
    g.textAlign = 'center';
    this.say(title, x, top - L.font * 1.2);
    /* The box, across the line, with its pointer from the inside. */
    const bw = L.box;
    const bh = L.font * 1.9;
    const bx = x - bw / 2;
    this.fillBox(bx, L.cy - bh / 2, bw, bh, 'rgba(6, 12, 18, 0.45)', 0.45);
    g.strokeStyle = WHITE;
    g.strokeRect(bx, L.cy - bh / 2, bw, bh);
    g.fillStyle = WHITE;
    g.font = `700 ${L.font * 1.25}px ${FONT}`;
    this.say(boxText, x, L.cy + 0.5);
    g.font = `${L.font}px ${FONT}`;
    const px = dir > 0 ? bx - 3 : bx + bw + 3;
    g.beginPath();
    g.moveTo(px, L.cy);
    g.lineTo(px - dir * 7, L.cy - 5);
    g.lineTo(px - dir * 7, L.cy + 5);
    g.closePath();
    g.fill();
    g.globalAlpha = 1;
  }

  speedTape(L, tel, ink) {
    const kph = tel.speed.ms * 3.6;
    const sig = tel.speed.sigma * 3.6;
    const text = tel.speed.sigma > 1 ? `${Math.round(kph)}±${Math.round(sig)}` : String(Math.round(kph));
    this.tape(L, L.spdX, kph, SPD_SPAN, SPD_TICK, SPD_LABEL, 1, str('avionics.hud.spd'), text, ink, tel.nav.source === 'DR');
    this.g.textAlign = 'center';
    this.g.fillStyle = WHITE;
    this.say('km/h', L.spdX, L.cy + L.font * 2);
  }

  aglTape(L, tel, ink) {
    const m = tel.agl.m;
    this.tape(L, L.aglX, m, AGL_SPAN, AGL_TICK, AGL_LABEL, -1, str('avionics.hud.alt_agl'), String(Math.round(m)), ink, false);
    const g = this.g;
    g.textAlign = 'center';
    g.fillStyle = WHITE;
    this.say('m', L.aglX, L.cy + L.font * 2);
    /* Vertical speed: a caret beside the box, 1 px per 0.1 m/s, held to
     * the tape. */
    const vy = Math.max(-L.tapeH / 2, Math.min(L.tapeH / 2, -tel.vs.ms * 10));
    g.fillStyle = GREEN;
    const x = L.aglX + L.box / 2 + 6;
    g.beginPath();
    g.moveTo(x, L.cy + vy);
    g.lineTo(x + 7, L.cy + vy - 4);
    g.lineTo(x + 7, L.cy + vy + 4);
    g.closePath();
    g.fill();
  }

  /* The roll arc at the bottom with the craft's roll, and a pitch ladder
   * through the camera, where the real horizon is in the picture. */
  attitude(L, src, ink) {
    const g = this.g;
    const roll = src.tel.attitude.roll;
    const R = L.h * 0.3;
    const ax = L.cx;
    const ay = L.h * 0.81 + R;
    g.strokeStyle = ink;
    g.fillStyle = WHITE;
    g.beginPath();
    g.arc(ax, ay, R, -Math.PI / 2 - 0.62, -Math.PI / 2 + 0.62);
    g.stroke();
    for (const d of [-30, -20, -10, 0, 10, 20, 30]) {
      const a = -Math.PI / 2 + d / DEG;
      const len = d % 30 === 0 ? 10 : 6;
      g.beginPath();
      g.moveTo(ax + Math.cos(a) * R, ay + Math.sin(a) * R);
      g.lineTo(ax + Math.cos(a) * (R + len), ay + Math.sin(a) * (R + len));
      g.stroke();
    }
    const a = -Math.PI / 2 - roll;
    const px = ax + Math.cos(a) * (R - 2);
    const py = ay + Math.sin(a) * (R - 2);
    g.save();
    g.translate(px, py);
    g.rotate(-roll);
    g.beginPath();
    g.moveTo(0, -1);
    g.lineTo(-7, 11);
    g.lineTo(7, 11);
    g.closePath();
    g.fill();
    g.restore();

    /* The ladder: the horizon and every 10 deg either side, each rung the
     * real direction at that elevation on the camera's azimuth, projected
     * through the camera, so it lies on the picture's own horizon. Compact
     * and dim, held to a band round the reticle; FULL reaches 20 deg and
     * labels both ends, STANDARD 10 deg and the right end, MINIMAL is the
     * horizon alone. */
    const cam = src.camera;
    attitudeOf(cam.quaternion, this.camAtt);
    const az = this.camAtt.heading / DEG;
    const base = Math.round(this.camAtt.pitch / 10) * 10;
    const reach = { full: 20, standard: 10, minimal: 0 }[this.level];
    const bandW = (L.aglX - L.spdX) * 0.5;
    const bandH = L.h * 0.36;
    g.save();
    g.beginPath();
    g.rect(L.cx - bandW / 2, L.cy - bandH / 2, bandW, bandH);
    g.clip();
    g.textAlign = 'center';
    g.lineWidth = RUNG_WIDTH;
    for (let d = base - reach; d <= base + reach; d += 10) {
      if (d < -90 || d > 90 || (reach === 0 && d !== 0)) {
        continue;
      }
      const half = d === 0 ? RUNG_HORIZON : RUNG_HALF;
      const a = this.rungEnd(cam, az - half, d);
      const b = this.rungEnd(cam, az + half, d);
      if (!a || !b) {
        continue;
      }
      /* Leave the middle open, as a ladder does, round the reticle. */
      const gap = d === 0 ? 0.3 : 0.4;
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      g.globalAlpha = d === 0 ? 0.7 : RUNG_ALPHA;
      g.setLineDash(d < 0 ? [4, 4] : []);
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.lineTo(a[0] + (mx - a[0]) * (1 - gap), a[1] + (my - a[1]) * (1 - gap));
      g.moveTo(b[0], b[1]);
      g.lineTo(b[0] + (mx - b[0]) * (1 - gap), b[1] + (my - b[1]) * (1 - gap));
      g.stroke();
      if (d !== 0) {
        if (this.level === 'full') {
          this.sayClear(String(d), a[0] - L.font * 1.2, a[1]);
        }
        this.sayClear(String(d), b[0] + L.font * 1.2, b[1]);
      }
    }
    g.setLineDash([]);
    g.globalAlpha = 1;
    g.lineWidth = 1.25;
    g.restore();
  }

  /* Where the direction at azimuth az, elevation d degrees lands on the
   * screen, or null behind the camera. */
  rungEnd(cam, az, d) {
    const e = d / DEG;
    const c = Math.cos(e);
    this.rungDir[0] = Math.sin(az) * c;
    this.rungDir[1] = Math.sin(e);
    this.rungDir[2] = -Math.cos(az) * c;
    const P = this.project(cam, this.rungDir);
    return P.ok ? [P.x, P.y] : null;
  }

  reticle(L, ink) {
    const g = this.g;
    const r = L.h * 0.032;
    g.strokeStyle = WHITE;
    g.beginPath();
    g.arc(L.cx, L.cy, r, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = GREEN;
    g.beginPath();
    g.arc(L.cx, L.cy, 2.2, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = ink;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      g.beginPath();
      g.moveTo(L.cx + dx * r * 0.6, L.cy + dy * r * 0.6);
      g.lineTo(L.cx + dx * r * 1.5, L.cy + dy * r * 1.5);
      g.stroke();
    }
  }

  /*
   * The tracks: boxes, the primary's one line tag, prediction, lead and
   * closure, and ghosts for the lost. Every box drawn is a claim the war's
   * markers stand down for; the kind they write into it comes back as the
   * tag's first word on the next paint.
   */
  tracks(L, src) {
    const { snap, hud, camera } = src;
    const g = this.g;
    for (const c of this.claims) {
      if (c.tag) {
        this.kindOf.set(c.id, c.tag);
      }
    }
    this.claims.length = 0;
    this.inRangeDrawn = false;
    if (!hud.ai) {
      this.kindOf.clear();
      return;
    }
    const degraded = hud.state === 'DEGRADED';
    const minimal = this.level === 'minimal';
    if (!minimal) {
      for (const t of snap.lost) {
        if (this.project(camera, t.losW).ok) {
          const side = this.boxSide(L, camera, t);
          g.globalAlpha = GHOST_ALPHA;
          this.box(this.proj.x, this.proj.y, side, RED, true);
          g.globalAlpha = 1;
        }
      }
    }
    for (const t of snap.tracks) {
      const primary = t.id === snap.primaryId;
      if ((degraded && t.stale) || (minimal && !primary)) {
        continue;
      }
      if (!this.project(camera, t.losW).ok) {
        continue;
      }
      const x = this.proj.x;
      const y = this.proj.y;
      const side = this.boxSide(L, camera, t);
      /* inRange: this box carries the IN RANGE cue, so the war's marker
       * may stand down for an attacker in range too. */
      const cue = primary && Boolean(src.fuze);
      this.claims.push({
        id: t.id, x, y, r: side / 2 + CLAIM_PX, tag: null, inRange: cue,
      });
      g.globalAlpha = t.stale ? STALE_ALPHA : primary ? 1 : 0.7;
      this.box(x, y, side, primary ? RED : AMBER, t.confidence < CONF_FIRM);
      if (cue) {
        this.inRange(L, x, y, side);
        this.inRangeDrawn = true;
      }
      g.textAlign = 'center';
      if (primary) {
        if (!minimal) {
          this.primaryTag(L, x, y - side / 2 - L.font * 1.6, t);
        }
        if (!degraded && !minimal) {
          this.prediction(L, camera, t);
        }
      } else {
        this.otherTag(L, x, y - side / 2 - L.font * 1.6, t);
      }
      g.globalAlpha = 1;
    }
  }

  /* The one line at the primary: the war's kind when it has one, the
   * class and the confidence. The rest is in the TRACKING block. */
  primaryTag(L, x, y, t) {
    const g = this.g;
    const kind = this.kindOf.get(t.id);
    const cls = str('avionics.track.cls.' + t.cls);
    const pct = Math.round(t.confidence * 100);
    const text = kind ? str('avionics.hud.tag_kind', { kind, cls, pct }) : str('avionics.hud.tag', { cls, pct });
    g.fillStyle = RED;
    g.font = '700 ' + L.font + 'px ' + FONT;
    this.say(text, this.clearOfTapes(L, text, x, y), y);
    g.font = L.font + 'px ' + FONT;
  }

  /*
   * Where a tag centred over x at y may stand, so its words keep off the
   * tapes' numbers: the speed tape's are written inside its line, the
   * AGL tape's inside its own, and on a phone on its side the room between
   * them is barely wider than the primary's tag (844x390: 173 px for 147),
   * so a target a few pixels right of the middle put "STRIKER AIR OBJECT"
   * over the AGL tape's "40" (check:avionics-layout's owner scene, a
   * failure that came and went with where the Striker stood). A target
   * between the tapes keeps its tag between them, slid toward the middle
   * no further than it must; one out past a tape, or a tag above or below
   * the tapes, keeps its place. Measured in the font the tag is in; the
   * numbers are at most three digits in the regular one.
   */
  clearOfTapes(L, text, x, y) {
    const g = this.g;
    const tape = this.tapeRects().speed;
    if (x <= L.spdX || x >= L.aglX || y < tape.y || y > tape.y + tape.h) {
      return x;
    }
    const half = this.textRect(text, 0, 0).w / 2;
    const tagFont = g.font;
    g.font = L.font + 'px ' + FONT;
    const label = this.textRect('000', 0, 0).w;
    g.font = tagFont;
    const gap = L.font * 0.5;
    const lo = L.spdX + L.font * 1.3 + label + gap + half;
    const hi = L.aglX - L.font * 1.3 - label - gap - half;
    return lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, x));
  }

  /* Another track's: its kind, and in FULL its number too. */
  otherTag(L, x, y, t) {
    const kind = this.kindOf.get(t.id);
    const id = 'T' + String(t.id).padStart(2, '0');
    const said = this.level === 'full' ? (kind ? str('avionics.hud.id_kind', { id, kind }) : id) : kind;
    if (said) {
      this.g.fillStyle = AMBER;
      this.say(said, this.clearOfTapes(L, said, x, y), y);
    }
  }

  boxSide(L, camera, t) {
    const px = (t.sizeRad * DEG / camera.fov) * L.h;
    return Math.max(BOX_MIN_PX, px) * (1 + (1 - t.confidence));
  }

  /* Corner brackets, dashed when the estimate is soft. */
  box(x, y, side, colour, soft) {
    const g = this.g;
    const h = side / 2;
    const k = side * 0.3;
    g.strokeStyle = colour;
    g.lineWidth = 1.5;
    g.setLineDash(soft ? [3, 3] : []);
    g.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      g.moveTo(x + sx * h, y + sy * (h - k));
      g.lineTo(x + sx * h, y + sy * h);
      g.lineTo(x + sx * (h - k), y + sy * h);
    }
    g.stroke();
    g.setLineDash([]);
    g.lineWidth = 1.25;
    g.fillStyle = colour;
    g.beginPath();
    g.moveTo(x, y - h - 3);
    g.lineTo(x - 5, y - h - 11);
    g.lineTo(x + 5, y - h - 11);
    g.closePath();
    g.fill();
  }

  /* IN RANGE on the primary's box: the box washed red and the words
   * under it. */
  inRange(L, x, y, side) {
    const g = this.g;
    const h = side / 2;
    g.globalAlpha = 0.25;
    this.fillBox(x - h, y - h, side, side, RED, 0.25);
    g.globalAlpha = 1;
    g.lineWidth = 3;
    g.strokeStyle = RED;
    g.strokeRect(x - h, y - h, side, side);
    g.lineWidth = 1.5;
    g.font = `700 ${L.font}px ${FONT}`;
    g.textAlign = 'center';
    g.fillStyle = RED;
    this.say(str('avionics.hud.in_range'), x, y + h + L.font * 1.3);
    g.font = `${L.font}px ${FONT}`;
  }

  /*
   * Dotted: where it is going, and the cue to point at to meet it, with
   * its time beside it; FULL draws the line to the cue from the reticle
   * too. Closure is one line of text right of the reticle.
   */
  /*
   * The lead cue's time, right of the cue, else left of it, else not at
   * all: the cue's dot is kept between the tapes, but its words are wider
   * than the dot and ran onto the AGL tape's on a phone.
   */
  leadLabel(L, text, x, y) {
    const g = this.g;
    const tapes = this.tapeRects(L);
    const keepOut = [tapes.speed, tapes.agl, ...this.texts];
    g.fillStyle = GREEN;
    for (const [align, at] of [['left', x + 8], ['right', x - 8]]) {
      g.textAlign = align;
      const me = this.textRect(text, at, y);
      if (!keepOut.some((r) => meets(r, me))) {
        g.fillText(text, at, y);
        this.texts.push(me);
        return;
      }
    }
  }

  prediction(L, camera, t) {
    const g = this.g;
    g.setLineDash([2, 4]);
    g.strokeStyle = RED;
    if (t.predicted && t.predicted.length) {
      this.project(camera, t.losW);
      g.beginPath();
      g.moveTo(this.proj.x, this.proj.y);
      for (const p of t.predicted) {
        if (this.project(camera, p.losW).ok) {
          g.lineTo(this.proj.x, this.proj.y);
        }
      }
      g.stroke();
    }
    g.strokeStyle = GREEN;
    /* Only between the tapes: a cue out past them is no aim, and its
     * words landed on the panels. */
    if (t.lead && this.project(camera, t.lead.losW).ok && this.proj.x > L.spdX + L.box && this.proj.x < L.aglX - L.box) {
      if (this.level === 'full') {
        g.beginPath();
        g.moveTo(L.cx, L.cy);
        g.lineTo(this.proj.x, this.proj.y);
        g.stroke();
      }
      g.setLineDash([]);
      g.beginPath();
      g.arc(this.proj.x, this.proj.y, 4, 0, Math.PI * 2);
      g.stroke();
      this.leadLabel(L, str('avionics.hud.lead', { s: t.lead.tS.toFixed(1) }), this.proj.x, this.proj.y);
    }
    g.setLineDash([]);
    if (t.closureMs) {
      g.fillStyle = WHITE;
      g.textAlign = 'center';
      this.say(closureText(t.closureMs), L.cx, L.cy + L.h * 0.075);
    }
  }

  /* DEGRADED: one red line under the heading tape naming each cause. */
  degraded(L, hud) {
    if (hud.state !== 'DEGRADED') {
      return;
    }
    const g = this.g;
    g.fillStyle = RED;
    g.textAlign = 'center';
    g.font = `700 ${L.font * 1.1}px ${FONT}`;
    const why = hud.reasons.map((r) => str(`avionics.hud.why.${r}`)).join('  ');
    this.say(`${str('avionics.hud.st.degraded')}  ${why}`, L.cx, L.hdgY + L.font * 4.6);
    g.font = `${L.font}px ${FONT}`;
  }
}

function primaryOf(snap) {
  return snap.primaryId != null ? snap.tracks.find((t) => t.id === snap.primaryId) || null : null;
}

/* EO or IR, the family a sensor mode belongs to. */
function sensorFamily(mode) {
  return mode === 'eo' || mode === 'lowlight' || mode === 'contrast' ? 'EO' : 'IR';
}

/* Closure, m/s: an interval, or ~ its middle when it is wider than that
 * middle (it can be negative: opening), as rangeText does. */
function closureText(c) {
  const mid = (c.lo + c.hi) / 2;
  return c.hi - c.lo > Math.abs(mid)
    ? str('avionics.hud.closure_est', { n: Math.round(mid) })
    : str('avionics.hud.closure_line', { lo: Math.round(c.lo), hi: Math.round(c.hi) });
}

/* Whether an interval is too wide to say as one (WIDE_RATIO). */
function wide(r) {
  return r.hi > WIDE_RATIO * Math.max(1, r.lo);
}

/*
 * An interval of metres, in km once it reaches one. One too wide to mean
 * much (0.1 to 2.1 km) is said as an estimate, ~ its geometric middle to
 * one figure, rather than as a precise looking pair (the brief's
 * uncertainty grammar: an estimate is soft).
 */
function rangeText(r) {
  if (wide(r)) {
    const mid = Math.sqrt(Math.max(1, r.lo) * r.hi);
    const p = 10 ** Math.floor(Math.log10(mid));
    const one = Math.round(mid / p) * p;
    return one >= 1000 ? str('avionics.hud.range_est_km', { n: one / 1000 }) : str('avionics.hud.range_est_m', { n: one });
  }
  return r.hi >= 1000
    ? str('avionics.hud.range_km', { lo: (r.lo / 1000).toFixed(1), hi: (r.hi / 1000).toFixed(1) })
    : str('avionics.hud.range_m', { lo: Math.round(r.lo), hi: Math.round(r.hi) });
}

function signed(n) {
  return Number(n) > 0 ? `+${n}` : String(n);
}
