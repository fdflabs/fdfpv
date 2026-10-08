/*
 * hangar.js: one plane on the stand, and what it flies with and wears.
 *
 * Opened from the aircraft picker's Customise (src/ui/carousel.js) on the
 * plane in the middle, and from the pause menu for the plane being flown.
 * The plane stands on a lit floor in a dark room drawn by the picker's own
 * renderer (src/render/carousel3d.js, src/render/hangarstage.js) from the
 * numbers frame() hands it: one model, no second WebGL context. Two tabs
 * beside it:
 *
 *   POWER    the motor or engine and the pack or tank, from the power
 *            options the shell hands in (configs/power.js through
 *            src/main.js), with the weight, the speed and the time in the
 *            air they make. Without power options it shows the stock
 *            setup, which is the only one there is.
 *   COLOURS  the preset schemes (configs/liveries.js), each region's
 *            colour from a palette of real covering, and a colour of the
 *            pilot's own.
 *
 * IT IS A GARAGE, NOT A FORM. The racing games' garages are the model
 * here (the design notes are in the pull request that brought this in):
 * the camera goes to what is being edited, so choosing the wing's colour
 * looks down on the wing and the Power tab looks at the nose; the cursor
 * PREVIEWS, so a swatch or a scheme under the cursor or the pointer is on
 * the plane before it is chosen and leaving it puts the choice back; a
 * scheme going on lands with a small pop and a ring running out across the
 * floor; the numbers count to their new values; the tabs slide; every move
 * of the cursor and every choice makes the menu's own sound. Nothing is
 * kept until Save, which hands back the livery entry and the power choice
 * the settings store. Back leaves them as they were. Reset to stock puts
 * both back to the kit's.
 *
 * Like the picker, THIS FILE IS THE CHOICE AND NOT THE PICTURE: nothing
 * here imports three.js, because scripts import src/ui/ui.js in Node.
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

import { airframeById } from '../../configs/airframes.js';
import {
  coloursFor, liveryKey, lookFor, normaliseEntry, paletteColour, paletteFor, regionsFor, schemesFor,
} from '../../configs/liveries.js';
import { currentLocale, str } from '../strings/index.js';
import { flightTimeText, sizeText, weightText } from './carousel.js';
import { flightTotals } from '../share/flighttime.js';
import { milestonesOf } from '../game/progress.js';
import { MAX_BUILDS, checkBuildName } from './builds.js';
import { WEAR_MAX, WEAR_STEP, cleanWear } from '../../configs/paint.js';
import { PaintShop } from './hangar-paint.js';
import { el, padLevels } from './dom.js';

export const HANGAR_TABS = ['power', 'colours'];

/*
 * TABS FROM OTHER MODULES. A module that adds a tab registers it here
 * instead of growing this file, and ui.js imports that module so it is
 * registered before the hangar first opens. A tab is
 *
 *   { id, paint(hangar) -> element,
 *     focus        where the camera goes when the tab comes up, or a
 *                  function answering it,
 *     open(hangar, settings)  the hangar opened on hangar.id: read what
 *                  the tab edits from the settings (read only),
 *     dirty()      whether Save would change anything,
 *     reset()      Reset to stock,
 *     save(hangar) -> { key: value } top level settings to replace, or null,
 *     frame(hangar, now) -> numbers the renderer reads under
 *                  frame().hangar.tabs[id],
 *     grams(hangar) -> what the tab's choice hangs on the plane, for the
 *                  spec sheet's weight,
 *     close(hangar)  shut, saved or not }
 *
 * Every hook but id and paint is optional. Its label is the string
 * hangar.tab_<id>. A tab asks for a repaint with hangar.changed(key).
 */
const TAB_HOOKS = {};

export function registerHangarTab(tab) {
  if (!tab || !tab.id || typeof tab.paint !== 'function' || HANGAR_TABS.includes(tab.id)) {
    throw new Error(`hangar tab ${tab && tab.id} is malformed or registered twice`);
  }
  TAB_HOOKS[tab.id] = tab;
  HANGAR_TABS.push(tab.id);
}

/* `quad`: a quad's motors are at its arms' ends, not at a nose, so its
 * Power tab has the one view (src/render/hangarstage.js `quad`). */
function tabFocus(t, quad) {
  const h = TAB_HOOKS[t];
  if (h && h.focus) {
    return typeof h.focus === 'function' ? h.focus() : h.focus;
  }
  if (t !== 'power') {
    return 'overview';
  }
  return quad ? 'quad' : 'nose';
}

function motorFocus(quad) {
  return quad ? 'quad' : 'motor';
}

function eachHook(fn) {
  for (const t of HANGAR_TABS) {
    if (TAB_HOOKS[t]) {
      fn(TAB_HOOKS[t], t);
    }
  }
}

/* The model's turn under a drag: radians per CSS pixel. */
const DRAG_TURN = 0.012;
/*
 * THE PILOT'S OWN VIEW over the one the tab asks for: the camera raised
 * or lowered (radians over the floor, added to the view's) and moved in
 * or out (a multiple of its distance), by a drag up and down, the wheel,
 * I K U O on the keys and a pad's right stick. Turning is the drag across
 * and J L. Kept while the hangar is open, back to the tab's when it opens.
 */
const ORBIT_ELEV = [-0.5, 0.9];
const ORBIT_ZOOM = [0.5, 1.8];
const DRAG_TILT = 0.006;
const KEY_TURN = 0.3;
const KEY_TILT = 0.12;
const KEY_ZOOM = 1.15;
/* A pad's right stick fully over, per poll (a frame). */
const PAD_TURN = 0.05;
const PAD_TILT = 0.025;
/* How long a number takes to count to its new value, ms. */
const COUNT_MS = 520;
/* The fewest ms between two cursor sounds from the pointer passing over
 * swatches, so a sweep across a row is a ripple and not a buzz. */
const HOVER_SOUND_MS = 70;
/* What pollPad edge triggers on; the right stick's look is read as a level. */
const PAD_KEYS = ['up', 'down', 'left', 'right', 'select', 'back', 'alt', 'flip'];
/* The workshop's preset views (docs/redesign/WORKSHOP-PAINT.md): a camera
 * view of src/render/hangarstage.js and whether the plane is flipped for
 * it, null leaving Flip as it is. Bottom is Top with the plane rolled
 * over, since the camera never goes under the floor. Keys 1 to 6. */
const VIEW_PRESETS = [
  { id: 'top', focus: 'top', flip: false },
  { id: 'bottom', focus: 'top', flip: true },
  { id: 'left', focus: 'side_left', flip: null },
  { id: 'right', focus: 'side_right', flip: null },
  { id: 'front', focus: 'front', flip: null },
  { id: 'rear', focus: 'rear', flip: null },
];

function button(cls, text) {
  const b = el('button', cls, text);
  b.type = 'button';
  return b;
}

function number(n, digits = 0) {
  return n.toLocaleString(currentLocale(), { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

/*
 * THE POWER THE HANGAR OFFERS WITHOUT POWER OPTIONS: the aircraft as
 * configs/airframes.js has it, one setup, its weight and its top speed.
 * The shape is the one src/main.js builds from configs/power.js, so the
 * tab draws either the same way.
 */
export function stockPower(airframeId) {
  const af = airframeById(airframeId);
  /* A glider with no motor (airframes.js `noMotor`): nothing to choose,
   * and the tab says why rather than offering a motor it does not have. */
  if (af.noMotor) {
    return {
      options: [{ id: 'stock', name: str('hangar.no_motor_setup'), kind: 'none', packs: [] }],
      stock: { option: 'stock', pack: null },
      estimate: () => ({ grams: af.grams, topSpeed: null, minutes: null, thrustToWeight: null }),
    };
  }
  return {
    options: [{ id: 'stock', name: str('hangar.stock_setup'), kind: af.voice === 'glow' ? 'glow' : 'electric', packs: [] }],
    stock: { option: 'stock', pack: null },
    estimate: () => ({ grams: af.grams, topSpeed: af.topSpeed ?? null, minutes: null, thrustToWeight: null }),
  };
}

/* An entry on a scheme, its own colours dropped and its finishes, decals
 * (src/ui/hangar-paint.js) and wear kept. */
function withScheme(entry, scheme) {
  const out = scheme === 'stock' ? {} : { scheme };
  if (entry.finishes) {
    out.finishes = entry.finishes;
  }
  if (entry.decals) {
    out.decals = entry.decals;
  }
  if (entry.wear) {
    out.wear = entry.wear;
  }
  return out;
}

/* An entry with a region's underside in `hex`. Kept even when it is the
 * top's colour in the entry: a combat aircraft's top is drawn in its
 * loadout finish's colour (src/render/combatpaint.js), not the entry's,
 * so the entry cannot tell an underside that matches from one that does
 * not. */
function withUnder(entry, region, hex) {
  return { ...entry, under: { ...(entry.under ?? {}), [region]: hex } };
}

/* The power choice a stored one names, made valid for these options. A
 * quad's has a prop as well (`power.props`, src/main.js quadPower). */
export function powerChoice(power, stored) {
  const option = power.options.find((o) => stored && o.id === stored.option) ?? power.options[0];
  const packs = option.packs ?? [];
  const pack = packs.find((p) => stored && p.id === stored.pack) ?? packs[0] ?? null;
  const out = { option: option.id, pack: pack ? pack.id : null };
  if (power.props) {
    out.prop = (power.props.find((p) => stored && p.id === stored.prop) ?? power.props[0]).id;
  }
  return out;
}

const samePower = (a, b) => a.option === b.option && a.pack === b.pack && a.prop === b.prop;

/* The readouts on the Power tab: how each is shown, and which way is up. */
const STATS = [
  { key: 'grams', label: 'hangar.weight', text: (v) => str('carousel.grams', { n: number(v) }), less: true },
  { key: 'topSpeed', label: 'hangar.top_speed', text: (v) => str('hangar.kmh', { n: number(v * 3.6) }) },
  { key: 'thrustToWeight', label: 'hangar.thrust', text: (v) => str('hangar.thrust_ratio', { n: number(v, 1) }) },
  { key: 'minutes', label: 'hangar.flight_time', text: (v) => str('hangar.minutes', { n: number(v) }) },
  /* A quad's (configs/motors.js motorStats): its pack at a hover and at
   * full throttle, which is where a hotter motor costs the pack. */
  { key: 'hoverMinutes', label: 'hangar.hover_time', text: (v) => str('hangar.minutes', { n: number(v, 1) }) },
  { key: 'fullMinutes', label: 'hangar.full_time', text: (v) => str('hangar.minutes', { n: number(v, 1) }) },
  /* Handling: a plane's wing loading, a quad's motor time constant. Less
   * of either is better, as less weight is. The wing loading is the spec
   * sheet's only, beside the parts that change it: the Power tab keeps
   * its four readouts, which fit the panel without a scroll. */
  { key: 'wingLoading', label: 'hangar.wing_loading', text: (v) => str('hangar.g_dm2', { n: number(v) }), less: true, specOnly: true },
  { key: 'responseMs', label: 'hangar.motor_response', text: (v) => str('hangar.ms', { n: number(v) }), less: true },
];

/* An estimate with the parts on: their grams on the weight, their thrust
 * change on the thrust, and both on the thrust to weight and the wing
 * loading. */
function fitted(estimate, extraG, thrustK) {
  const est = { ...estimate };
  if (!extraG && thrustK === 1) {
    return est;
  }
  const k = est.grams / (est.grams + extraG);
  if (est.thrustToWeight != null) {
    est.thrustToWeight *= k * thrustK;
  }
  if (est.wingLoading != null) {
    est.wingLoading /= k;
  }
  est.grams += extraG;
  return est;
}

export class Hangar {
  constructor(host) {
    this.host = host;
    this.isOpen = false;
    this.opts = null;
    this.tab = HANGAR_TABS[0];
    this.turn = 0;
    this.drag = null;
    this.padPrev = null;
    this.hintKind = 'key';
    this.focus = 'overview';
    this.orbit = { elev: 0, zoom: 1 };
    this.flip = false;
    this.view = null;
    /* Which side of the region the colours paint: 'top' or 'under'. */
    this.paintSide = 'top';
    this.hover = null;
    this.revealSeq = 0;
    this.pulseSeq = 0;
    this.lastHoverSound = 0;
    /* The numbers on show and where each is counting to. */
    this.counts = {};
    this.build();
  }

  build() {
    const root = el('div', 'hangar');
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    this.root = root;

    const head = el('div', 'hangar-head');
    const titles = el('div', 'hangar-titles');
    this.titleEl = el('div', 'hangar-title', str('hangar.title'));
    this.nameEl = el('div', 'hangar-name');
    this.factsEl = el('div', 'carousel-facts hangar-facts');
    titles.append(this.titleEl, this.nameEl, this.factsEl);
    this.tabs = el('div', 'carousel-tabs hangar-tabs');
    this.tabs.setAttribute('role', 'tablist');
    this.tabPill = el('span', 'hangar-tab-pill');
    this.tabs.append(this.tabPill);
    this.tabEls = {};
    this.buildTabs();
    head.append(titles);

    this.stage = el('div', 'hangar-stage');
    this.bindStage();
    /* The spec sheet over the stage's corner: the numbers every choice
     * moves, on every tab but Power, which has them whole. */
    this.specEl = el('div', 'hangar-spec');
    this.stage.append(this.specEl);
    /* FLIP (docs/redesign/WORKSHOP-PAINT.md): the plane rolled over on its
     * stand, its underside up. On the stage, which takes every press to
     * turn the plane, so the button keeps its own. */
    this.flipBtn = button('hangar-flip', str('hangar.flip'));
    this.flipBtn.dataset.key = 'flip';
    this.flipBtn.setAttribute('aria-pressed', 'false');
    this.flipBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.flipBtn.addEventListener('click', () => this.toggleFlip());
    this.viewsEl = el('div', 'hangar-views');
    this.viewBtns = VIEW_PRESETS.map((v) => {
      const b = button('hangar-view', str(`hangar.view_${v.id}`));
      b.dataset.key = `view-${v.id}`;
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', () => this.pickView(v.id));
      return b;
    });
    this.viewsEl.append(...this.viewBtns);
    this.stage.append(this.flipBtn, this.viewsEl);
    this.side = el('div', 'hangar-side');
    this.side.addEventListener('pointerleave', () => this.endHover());

    /* THE CATEGORIES DOWN ONE SIDE, a garage's and not a form's: the tabs
     * stand in a rail between the plane and what the tab edits (a row
     * over the panel on a phone, index.html). */
    const body = el('div', 'hangar-body');
    body.append(this.stage, this.tabs, this.side);

    const foot = el('div', 'hangar-foot');
    this.warnEl = el('p', 'carousel-warn hangar-warn');
    const buttons = el('div', 'hangar-buttons');
    this.resetBtn = button('hangar-reset', str('hangar.reset'));
    this.resetBtn.dataset.key = 'reset';
    this.backBtn = button('carousel-back', str('ui.back'));
    this.backBtn.dataset.key = 'back';
    this.saveBtn = button('carousel-choose hangar-save', str('hangar.save'));
    this.saveBtn.dataset.key = 'save';
    this.resetBtn.addEventListener('click', () => this.reset());
    this.backBtn.addEventListener('click', () => this.cancel());
    this.saveBtn.addEventListener('click', () => this.save());
    /* MY HANGAR (src/ui/builds.js): what is on the stand kept as a build
     * of its own, named first in a line that takes the buttons' place
     * (startMine). On a build, Save keeps it and this saves a new one. */
    this.mineBtn = button('carousel-back hangar-mine', str('mine.save_new'));
    this.mineBtn.dataset.key = 'mine-new';
    this.mineBtn.addEventListener('click', () => this.startMine());
    const right = el('div', 'hangar-buttons-end');
    right.append(this.mineBtn, this.backBtn, this.saveBtn);
    buttons.append(this.resetBtn, right);
    this.buttonsEl = buttons;
    this.mineForm = el('div', 'hangar-mine-form');
    this.mineForm.hidden = true;
    this.naming = false;
    this.hintEl = el('p', 'carousel-hint');
    foot.append(this.warnEl, buttons, this.mineForm, this.hintEl);

    /* The pilot's own colour: the browser's picker, opened by a button. */
    this.customInput = el('input', 'hangar-custom-input');
    this.customInput.type = 'color';
    this.customInput.tabIndex = -1;
    this.customInput.addEventListener('input', () => (this.customTarget ?? ((v) => this.pickColour(v)))(this.customInput.value));

    const panel = el('div', 'hangar-panel');
    this.panel = panel;
    panel.append(head, body, foot, this.customInput);
    /* The camera follows the cursor: whatever control has it says what it
     * is about (data-focus), and the view goes there. */
    panel.addEventListener('focusin', (e) => {
      const f = e.target.dataset && e.target.dataset.focus;
      if (f) {
        this.focus = f;
      }
    });
    root.append(panel);
    /* The Colours tab's decals, finishes and saved liveries. */
    this.shop = new PaintShop(this);
    root.addEventListener('click', (e) => e.stopPropagation());
    root.addEventListener('keydown', (e) => {
      /* Not in a field, or a name could not have a space in it. */
      const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
      if (!typing && (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter')) {
        e.preventDefault();
      }
    });
    /* The rail is a column on a wide screen and a row on a phone: the pill
     * follows the tab when the window changes shape. */
    window.addEventListener('resize', () => {
      if (this.isOpen) {
        this.placePill();
      }
    });
    this.host.append(root);
  }

  /* A tab button for every tab, including any registered since the last. */
  buildTabs() {
    for (const t of HANGAR_TABS) {
      if (this.tabEls[t]) {
        continue;
      }
      const b = button('carousel-tab hangar-tab-btn', str(`hangar.tab_${t}`));
      b.setAttribute('role', 'tab');
      b.dataset.key = `tab-${t}`;
      b.addEventListener('click', () => this.setTab(t));
      this.tabEls[t] = b;
      this.tabs.append(b);
    }
  }

  bindStage() {
    const s = this.stage;
    s.style.touchAction = 'none';
    s.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) {
        return;
      }
      e.preventDefault();
      if (e.pointerType === 'touch') {
        this.setHint('touch');
      }
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
      s.setPointerCapture(e.pointerId);
    });
    s.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomBy(Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)));
    }, { passive: false });
    s.addEventListener('pointermove', (e) => {
      if (!this.drag || e.pointerId !== this.drag.id) {
        this.shop.pointerMove(e);
        return;
      }
      this.turn += (e.clientX - this.drag.x) * DRAG_TURN;
      /* Placing a decal the aim follows the pointer, so only a turn. */
      if (!this.shop.placing) {
        this.tiltBy((e.clientY - this.drag.y) * DRAG_TILT);
      }
      this.drag.moved += Math.abs(e.clientX - this.drag.x) + Math.abs(e.clientY - this.drag.y);
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
    });
    const end = (e) => {
      if (this.drag && e.pointerId === this.drag.id) {
        /* A press that did not turn the plane is a click on it, which
         * places a decal while one is being placed. */
        if (e.type === 'pointerup') {
          this.shop.pointerClick(e, this.drag.moved);
        }
        this.drag = null;
      }
    };
    s.addEventListener('pointerup', end);
    s.addEventListener('pointercancel', end);
  }

  /*
   * Open it on one plane. `livery` is its stored entry (settings.livery),
   * `power` the options src/main.js built for it with the stored choice
   * (`power.chosen`), `warn` a line over the buttons for what saving will
   * cost. onPreview(look) is called with the look (src/render/livery.js)
   * on every change, onSave({ livery, power, liveryChanged, powerChanged })
   * with what to store, onCancel with nothing, sound(kind) for the menu's
   * sounds, onTry(choice) when a new motor or engine is picked, for its
   * voice. `settings` is what registered tabs read theirs from, and Save
   * hands back their patch as `settings` beside the rest; the paint shop
   * reads the plane's saved liveries from it too (settings.liverySaves),
   * and onLibrary(list) stores a changed list at once
   * (src/ui/hangar-paint.js). `mine` offers My Hangar, { name, suggest,
   * full }: `name` the build being edited or null for the stock plane,
   * `suggest` the name a new build is offered, `full` when there is no
   * room for one; a save as a new build hands onSave `asNew: { name }`.
   */
  open({ airframe, livery = null, power = null, floats = null, mine = null, warn = '', hint = 'key', tab = null, settings = {}, onLibrary = null, onPreview, onSave, onCancel, onTry, sound } = {}) {
    this.buildTabs();
    this.closeMine(false);
    this.mine = mine;
    this.mineBtn.hidden = !mine;
    this.mineBtn.textContent = str(mine && mine.name ? 'mine.save_as_new' : 'mine.save_new');
    this.titleEl.textContent = mine && mine.name ? mine.name : str('hangar.title');
    this.id = airframe;
    this.family = liveryKey(airframe);
    this.saved = normaliseEntry(this.family, livery) ?? {};
    this.entry = JSON.parse(JSON.stringify(this.saved));
    this.power = power ?? stockPower(airframe);
    this.savedPower = powerChoice(this.power, this.power.chosen);
    this.choice = { ...this.savedPower };
    this.regions = regionsFor(airframe);
    this.region = this.regions.length ? this.regions[0].id : null;
    this.opts = { onPreview, onSave, onCancel, onTry, sound };
    this.tab = HANGAR_TABS.includes(tab) ? tab : HANGAR_TABS[0];
    this.hintKind = hint;
    this.turn = 0;
    this.orbit = { elev: 0, zoom: 1 };
    this.setFlip(false);
    this.setView(null);
    this.paintSide = 'top';
    this.drag = null;
    this.padPrev = null;
    this.hover = null;
    this.pin = null;
    this.counts = {};
    this.customTarget = null;
    this.shop.reset({ library: (settings.liverySaves || {})[this.family] ?? [], onLibrary });
    this.revealSeq += 1;
    this.focus = tabFocus(this.tab, this.quad());
    this.isOpen = true;
    eachHook((h) => h.open && h.open(this, settings));
    const af = airframeById(airframe);
    this.nameEl.textContent = af.name;
    this.factsEl.textContent = '';
    /* The pilot's time in the air on this aircraft, once there is some
     * (settings.flightTime, src/share/flighttime.js). */
    const flown = flightTotals(settings.flightTime).byAirframe[airframe] || 0;
    const facts = [sizeText(airframe), weightText(airframe)];
    if (flown > 0) {
      facts.push(str('flight.on_craft', { time: flightTimeText(flown), craft: af.name }));
    }
    for (const f of facts) {
      this.factsEl.append(el('span', 'carousel-fact', f));
    }
    /* Its mastery milestones (src/game/progress.js MILESTONE_S): each one
     * reached is lit, the rest wait, so the next one is the reason to fly. */
    const reached = milestonesOf(flightTotals(settings.flightTime).byAirframe, airframe);
    const pips = el('span', 'carousel-fact hangar-milestones');
    pips.dataset.key = 'milestones';
    for (const [m, on] of Object.entries(reached)) {
      const pip = el('span', `hangar-milestone${on ? ' on' : ''}`, str(`hangar.milestone.${m}`));
      pip.dataset.milestone = m;
      pips.append(pip);
    }
    this.factsEl.append(pips);
    /* A plane with a float version has the Floats toggle beside its span and
     * weight (`floats`: { on, set(on) }, src/ui/ui.js openHangar). Flipping
     * it opens the hangar again on the other version, so an unsaved change
     * here would be lost: it asks for a save first instead. */
    if (floats) {
      const b = button(`hangar-floats${floats.on ? ' on' : ''}`, str('hangar.floats'));
      b.dataset.key = 'floats';
      b.setAttribute('role', 'switch');
      b.setAttribute('aria-checked', String(floats.on));
      b.addEventListener('click', () => {
        if (this.dirty()) {
          this.warnEl.textContent = str('hangar.floats_save_first');
          this.warnEl.hidden = false;
          return;
        }
        this.sound('select');
        floats.set(!floats.on);
      });
      this.factsEl.append(b);
    }
    this.warnEl.textContent = warn || '';
    this.warnEl.hidden = !warn;
    this.root.hidden = false;
    this.host.classList.add('hangar-open');
    /* The entrance: the panel and the header play their CSS reveal once. */
    this.root.classList.remove('entering');
    void this.root.offsetWidth;
    this.root.classList.add('entering');
    this.openT = performance.now();
    this.paint(0);
    this.preview();
    this.focusKey(`tab-${this.tab}`);
    this.sound('select');
  }

  close() {
    if (!this.isOpen) {
      return;
    }
    this.isOpen = false;
    this.closeMine(false);
    this.shop.stopPlacing();
    eachHook((h) => h.close && h.close(this));
    this.opts = null;
    this.drag = null;
    this.hover = null;
    this.root.hidden = true;
    this.host.classList.remove('hangar-open');
  }

  sound(kind) {
    if (this.opts && this.opts.sound) {
      this.opts.sound(kind);
    }
  }

  /* Whether the aircraft on the stand is a quad. */
  quad() {
    return Boolean(this.id) && !airframeById(this.id).fixedWing;
  }

  colours(entry = this.entry) {
    return coloursFor(this.id, entry);
  }

  /* The entry on show: the chosen one, with whatever the cursor or the
   * pointer is over tried on it. */
  shownEntry() {
    return this.shop.shownEntry(this.triedEntry());
  }

  triedEntry() {
    /* `pin`: a look a tab keeps on show without the pointer over it (the
     * Shop's chosen item, src/ui/hangar-shop.js); the pointer still wins. */
    const h = this.hover ?? this.pin;
    if (!h) {
      return this.entry;
    }
    if (h.scheme) {
      return withScheme(this.entry, h.scheme);
    }
    if (h.entry) {
      return h.entry;
    }
    if (h.finish) {
      return this.shop.withFinish(this.entry, h.region, h.finish);
    }
    if (h.patch) {
      return this.shop.withDecal(this.entry, h.decal, h.patch);
    }
    if (h.side === 'under') {
      return withUnder(this.entry, h.region, h.hex);
    }
    return { ...this.entry, regions: { ...(this.entry.regions ?? {}), [h.region]: h.hex } };
  }

  /* Painting the underside of the region on show: not a film's. */
  underSide() {
    const r = this.regions.find((x) => x.id === this.region);
    return this.paintSide === 'under' && Boolean(r) && !r.film;
  }

  /* Show the plane in what is on show now. Due rather than done: the
   * next frame paints it once, however many things changed in between,
   * which matters for the Kadet, whose films are maps drawn in script. */
  preview() {
    this.previewDue = true;
  }

  flushPreview() {
    if (this.previewDue && this.opts && this.opts.onPreview) {
      this.previewDue = false;
      this.opts.onPreview(lookFor(this.id, this.shownEntry()));
    }
  }

  /* The cursor or the pointer is over a choice: try it on the plane. */
  tryOn(h) {
    if (this.hover === h) {
      return;
    }
    this.hover = h;
    this.preview();
  }

  endHover() {
    if (this.hover) {
      this.hover = null;
      this.preview();
    }
    const a = document.activeElement;
    if (a && this.panel.contains(a) && a.dataset.focus) {
      this.focus = a.dataset.focus;
    }
  }

  dirty() {
    const a = JSON.stringify(normaliseEntry(this.family, this.entry));
    const b = JSON.stringify(normaliseEntry(this.family, this.saved));
    let tabs = false;
    eachHook((h) => {
      tabs = tabs || Boolean(h.dirty && h.dirty());
    });
    return tabs || a !== b || !samePower(this.choice, this.savedPower);
  }

  setTab(t) {
    if (!HANGAR_TABS.includes(t) || t === this.tab) {
      return;
    }
    const dir = HANGAR_TABS.indexOf(t) > HANGAR_TABS.indexOf(this.tab) ? 1 : -1;
    this.shop.stopPlacing();
    this.setView(null);
    this.tab = t;
    this.hover = null;
    this.pin = null;
    this.focus = tabFocus(t, this.quad());
    this.paint(dir);
    this.preview();
    this.focusKey(`tab-${t}`);
    this.sound('adjust');
  }

  cycleTab(dir) {
    const i = HANGAR_TABS.indexOf(this.tab);
    this.setTab(HANGAR_TABS[(i + dir + HANGAR_TABS.length) % HANGAR_TABS.length]);
  }

  /* A preset: its colours whole, the pilot's own per region dropped; the
   * finishes and the decals stay, being over the colours. */
  pickScheme(id) {
    this.entry = withScheme(this.entry, id);
    this.pulseSeq += 1;
    this.changed(`scheme-${id}`);
  }

  /* The underside is painted with the plane rolled over, so it faces the
   * camera; the top with it upright. */
  pickSide(side) {
    this.paintSide = side;
    this.setFlip(side === 'under');
    this.changed(`side-${side}`, 'move');
  }

  pickRegion(id) {
    this.region = id;
    this.focus = id;
    this.changed(`region-${id}`, 'move');
  }

  /* A colour for the region being painted. The scheme's own colour there
   * is no override, so picking it back takes the override away. */
  pickColour(hex) {
    if (!this.region) {
      return;
    }
    const v = hex.toLowerCase();
    if (this.underSide()) {
      this.entry = withUnder(this.entry, this.region, v);
      this.changed(`colour-${v}`);
      return;
    }
    const bare = coloursFor(this.id, { scheme: this.entry.scheme })[this.region];
    const regions = { ...(this.entry.regions ?? {}) };
    if (v === bare) {
      delete regions[this.region];
    } else {
      regions[this.region] = v;
    }
    this.entry = { ...this.entry, regions };
    if (!Object.keys(regions).length) {
      delete this.entry.regions;
    }
    this.changed(`colour-${v}`);
  }

  pickOption(id) {
    this.choice = powerChoice(this.power, { ...this.choice, option: id });
    this.focus = motorFocus(this.quad());
    this.changed(`option-${id}`);
    if (this.opts && this.opts.onTry) {
      this.opts.onTry({ ...this.choice });
    }
  }

  pickPack(id) {
    this.choice = { ...this.choice, pack: id };
    this.focus = 'pack';
    this.changed(`pack-${id}`);
  }

  /* A quad's prop turns at its own speed, so the stand hears it. */
  pickProp(id) {
    this.choice = { ...this.choice, prop: id };
    this.focus = motorFocus(this.quad());
    this.changed(`prop-${id}`);
    if (this.opts && this.opts.onTry) {
      this.opts.onTry({ ...this.choice });
    }
  }

  /* A card progression may not have opened yet: src/ui/progress-ui.js
   * sets markLock when the hangar opens, and it dims and disables it. */
  lockMark(b, kind, id) {
    if (this.markLock) {
      this.markLock(b, kind, id);
    }
  }

  reset() {
    this.entry = {};
    this.choice = { ...this.power.stock };
    eachHook((h) => h.reset && h.reset());
    this.pulseSeq += 1;
    this.changed('reset');
  }

  changed(focusKey, sound = 'select') {
    this.hover = null;
    this.paint(0);
    this.preview();
    this.focusKey(focusKey);
    this.sound(sound);
  }

  /* `asNew`, { name }, keeps it as a new My Hangar build instead. */
  save(asNew = null) {
    const save = this.opts && this.opts.onSave;
    const result = {
      livery: normaliseEntry(this.family, this.entry),
      power: { ...this.choice },
      liveryChanged: JSON.stringify(normaliseEntry(this.family, this.entry)) !== JSON.stringify(normaliseEntry(this.family, this.saved)),
      powerChanged: !samePower(this.choice, this.savedPower),
      settings: {},
      asNew,
    };
    eachHook((h) => {
      if (h.save) {
        Object.assign(result.settings, h.save(this));
      }
    });
    this.sound('select');
    this.close();
    if (save) {
      save(result);
    }
  }

  /* Save to My Hangar: the name first, in a field offered the next free
   * one, so Enter alone (or A on a pad) saves it. */
  startMine() {
    if (!this.mine) {
      return;
    }
    if (this.mine.full) {
      this.warnEl.textContent = str('mine.full', { n: MAX_BUILDS });
      this.warnEl.hidden = false;
      return;
    }
    this.naming = true;
    this.mineForm.textContent = '';
    const field = el('input', 'paint-name-field hangar-mine-field');
    field.type = 'text';
    field.maxLength = 32;
    field.value = this.mine.suggest;
    field.dataset.key = 'mine-name';
    field.setAttribute('aria-label', str('mine.name'));
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.submitMine();
      }
    });
    const ok = button('carousel-choose', str('hangar.save'));
    ok.dataset.key = 'mine-name-save';
    ok.addEventListener('click', () => this.submitMine());
    const no = button('carousel-back', str('ui.cancel'));
    no.dataset.key = 'mine-name-cancel';
    no.addEventListener('click', () => this.closeMine());
    this.mineError = el('p', 'carousel-warn');
    this.mineError.hidden = true;
    const row = el('div', 'hangar-mine-row');
    row.append(el('span', 'hangar-mine-label', str('mine.name')), field, ok, no);
    this.mineForm.append(row, this.mineError);
    this.buttonsEl.hidden = true;
    this.mineForm.hidden = false;
    this.sound('select');
    field.focus();
    field.select();
  }

  submitMine() {
    const field = this.mineForm.querySelector('input');
    if (!this.naming || !field) {
      return;
    }
    const named = checkBuildName(field.value);
    if (!named.name) {
      this.mineError.textContent = str(`mine.name_${named.error}`);
      this.mineError.hidden = false;
      field.focus();
      return;
    }
    this.save({ name: named.name });
  }

  /* The buttons back. `focus` puts the cursor on Save to My Hangar. */
  closeMine(focus = true) {
    if (!this.naming) {
      return;
    }
    this.naming = false;
    this.mineForm.textContent = '';
    this.mineForm.hidden = true;
    this.buttonsEl.hidden = false;
    if (focus) {
      this.sound('back');
      this.focusKey('mine-new');
    }
  }

  cancel() {
    const back = this.opts && this.opts.onCancel;
    this.sound('back');
    this.close();
    if (back) {
      back();
    }
  }

  /* Everything in the side panel, from the state. Called on every change:
   * a few dozen buttons, and only when the pilot does something. `slide`
   * is the direction a new tab comes in from, 0 for none. */
  paint(slide) {
    for (const [t, b] of Object.entries(this.tabEls)) {
      b.classList.toggle('on', t === this.tab);
      b.setAttribute('aria-selected', String(t === this.tab));
    }
    this.placePill();
    this.side.textContent = '';
    const hook = TAB_HOOKS[this.tab];
    const tab = hook ? hook.paint(this) : this.tab === 'power' ? this.powerTab() : this.coloursTab();
    if (slide) {
      tab.classList.add(slide > 0 ? 'from-right' : 'from-left');
    }
    this.side.append(tab);
    this.specEl.textContent = '';
    if (this.tab !== 'power') {
      this.specEl.append(this.statsBlock(this.addedGrams(), this.thrustScale(), true));
    }
    this.saveBtn.classList.toggle('dirty', this.dirty());
    this.paintHint();
  }

  /* What the registered tabs hang on the plane beyond its power setup,
   * grams (the Parts tab's add-ons and prop, src/ui/hangar-parts.js). */
  addedGrams() {
    let g = 0;
    eachHook((h) => {
      g += h.grams ? h.grams(this) : 0;
    });
    return g;
  }

  /* The tabs' change to the full throttle thrust, a ratio (the Parts
   * tab's prop). */
  thrustScale() {
    let k = 1;
    eachHook((h) => {
      k *= h.thrustScale ? h.thrustScale(this) : 1;
    });
    return k;
  }

  /* The tabs' pill slides under the tab that is on. */
  placePill() {
    const b = this.tabEls[this.tab];
    if (!b || !b.offsetWidth) {
      requestAnimationFrame(() => {
        if (this.isOpen && b.offsetWidth) {
          this.placePill();
        }
      });
      return;
    }
    this.tabPill.style.width = `${b.offsetWidth}px`;
    this.tabPill.style.height = `${b.offsetHeight}px`;
    this.tabPill.style.transform = `translate(${b.offsetLeft}px, ${b.offsetTop}px)`;
  }

  setHint(kind) {
    if (this.hintKind !== kind) {
      this.hintKind = kind;
      this.paintHint();
    }
  }

  paintHint() {
    this.hintEl.textContent = str(`hangar.hint_${this.hintKind === 'touch' ? 'touch' : this.hintKind === 'pad' ? 'pad' : 'keys'}`);
  }

  /* A button the cursor tries on: over it, or onto it with the keys, the
   * plane wears it; off it, the plane goes back. */
  trial(b, h, focus) {
    b.dataset.focus = focus;
    const on = () => this.tryOn(h);
    b.addEventListener('pointerenter', () => {
      this.focus = focus;
      on();
      const now = performance.now();
      if (now - this.lastHoverSound > HOVER_SOUND_MS) {
        this.lastHoverSound = now;
        this.sound('move');
      }
    });
    b.addEventListener('focus', on);
    const off = () => {
      if (this.hover === h) {
        this.hover = null;
        this.preview();
      }
    };
    b.addEventListener('blur', off);
    b.addEventListener('pointerleave', off);
  }

  /* A power card's readouts on the pointer or the focus. */
  previewOn(b, choice) {
    const on = () => this.previewStats({ choice });
    const off = () => this.previewStats(null);
    b.addEventListener('pointerenter', on);
    b.addEventListener('focus', on);
    b.addEventListener('pointerleave', off);
    b.addEventListener('blur', off);
  }

  powerTab() {
    const box = el('div', 'hangar-tab');
    const option = this.power.options.find((o) => o.id === this.choice.option) ?? this.power.options[0];
    const glow = option.kind === 'glow';
    const none = option.kind === 'none';
    box.append(el('h3', 'hangar-h', str(none ? 'hangar.no_motor' : glow ? 'hangar.engine' : 'hangar.motor')));
    const opts = el('div', 'hangar-cards');
    this.power.options.forEach((o, i) => {
      const b = button(`hangar-card${o.id === option.id ? ' on' : ''}`);
      b.dataset.key = `option-${o.id}`;
      b.dataset.focus = motorFocus(this.quad());
      b.style.setProperty('--i', String(i));
      b.append(el('span', 'hangar-card-name', o.name));
      if (o.detail) {
        b.append(el('span', 'hangar-card-detail', o.detail));
      }
      b.setAttribute('aria-pressed', String(o.id === option.id));
      b.addEventListener('pointerenter', () => {
        this.focus = motorFocus(this.quad());
      });
      this.previewOn(b, { option: o.id });
      b.addEventListener('click', () => this.pickOption(o.id));
      this.lockMark(b, 'power', o.id);
      opts.append(b);
    });
    box.append(opts);
    const props = this.power.props ?? [];
    if (props.length > 1) {
      box.append(el('h3', 'hangar-h', str('hangar.prop')));
      const row = el('div', 'hangar-cards hangar-cards-small');
      props.forEach((p, i) => {
        const b = button(`hangar-card${p.id === this.choice.prop ? ' on' : ''}`);
        b.dataset.key = `prop-${p.id}`;
        b.dataset.focus = motorFocus(this.quad());
        b.style.setProperty('--i', String(i));
        b.append(el('span', 'hangar-card-name', p.name));
        if (p.detail) {
          b.append(el('span', 'hangar-card-detail', p.detail));
        }
        b.setAttribute('aria-pressed', String(p.id === this.choice.prop));
        b.addEventListener('pointerenter', () => {
          this.focus = motorFocus(this.quad());
        });
        this.previewOn(b, { prop: p.id });
        b.addEventListener('click', () => this.pickProp(p.id));
        row.append(b);
      });
      box.append(row);
    }
    const packs = option.packs ?? [];
    if (packs.length) {
      box.append(el('h3', 'hangar-h', str(glow ? 'hangar.tank' : 'hangar.pack')));
      const row = el('div', 'hangar-cards hangar-cards-small');
      packs.forEach((p, i) => {
        const b = button(`hangar-card${p.id === this.choice.pack ? ' on' : ''}`);
        b.dataset.key = `pack-${p.id}`;
        b.dataset.focus = 'pack';
        b.style.setProperty('--i', String(i));
        b.append(el('span', 'hangar-card-name', p.name));
        if (p.detail) {
          b.append(el('span', 'hangar-card-detail', p.detail));
        }
        b.setAttribute('aria-pressed', String(p.id === this.choice.pack));
        b.addEventListener('pointerenter', () => {
          this.focus = 'pack';
        });
        this.previewOn(b, { pack: p.id });
        b.addEventListener('click', () => this.pickPack(p.id));
        row.append(b);
      });
      box.append(row);
    }
    box.append(this.statsBlock());
    if (none) {
      box.append(el('p', 'hangar-note', str('hangar.no_motor_note')));
    }
    box.append(el('p', 'hangar-note', str(`carousel.note.${this.id}`)));
    if (option.source) {
      box.append(el('p', 'hangar-source', str('hangar.source', { source: option.source })));
    }
    return box;
  }

  /*
   * The readouts, each a number that counts from what was on show to the
   * new value (frame() moves it) and a bar against the most any choice on
   * offer makes, with the difference from the kit's own under it.
   */
  /* `extraG` grams on the plane beyond the power setup's (the spec
   * sheet's, with the parts fitted): the weight takes them and the
   * thrust to weight is thrust over that weight; `thrustK` the parts'
   * change to the thrust; `spec` true on the spec sheet. */
  statsBlock(extraG = 0, thrustK = 1, spec = false) {
    const est = fitted(this.power.estimate(this.choice), extraG, thrustK);
    this.statBase = { extraG, thrustK };
    const stock = this.power.estimate(this.power.stock);
    const all = [];
    const props = this.power.props ?? [{ id: undefined }];
    for (const o of this.power.options) {
      const packs = (o.packs && o.packs.length) ? o.packs : [{ id: null }];
      for (const p of packs) {
        for (const q of props) {
          all.push(this.power.estimate({ option: o.id, pack: p.id, prop: q.id }));
        }
      }
    }
    const stats = el('div', 'hangar-stats');
    this.statEls = {};
    for (const s of STATS) {
      const v = est[s.key];
      if (v == null || (s.specOnly && !spec)) {
        continue;
      }
      const top = Math.max(...all.map((e) => e[s.key] ?? 0), v, 1e-9);
      const box = el('div', 'hangar-stat');
      const value = el('span', 'hangar-stat-value');
      const bar = el('span', 'hangar-stat-bar');
      const fill = el('span', 'hangar-stat-fill');
      const ghost = el('span', 'hangar-stat-ghost');
      bar.append(fill, ghost);
      const delta = el('span', 'hangar-stat-delta');
      const d = stock[s.key] != null ? v - stock[s.key] : 0;
      if (Math.abs(d) > 1e-9) {
        delta.textContent = `${d > 0 ? '+' : '-'}${s.text(Math.abs(d))}`;
      }
      const stockText = delta.textContent;
      box.append(el('span', 'hangar-stat-label', str(s.label)), value, bar, delta);
      stats.append(box);
      const c = this.counts[s.key];
      const from = c ? c.shown : v;
      this.counts[s.key] = { from, to: v, shown: from, t0: performance.now() };
      this.statEls[s.key] = { value, fill, text: s.text, top, delta, stockText, v, less: Boolean(s.less) };
      value.textContent = s.text(from);
      fill.style.transform = `scaleX(${Math.max(0.02, from / top)})`;
      /* BEFORE AND AFTER: what the choice before this one made, a faint
       * bar ending in a tick, over which the new value counts. It stays
       * until the next change, so the two can be read side by side. */
      const was = c ? c.to : v;
      if (Math.abs(was - v) > 1e-9) {
        ghost.style.width = `${Math.min(100, Math.max(2, (100 * was) / top))}%`;
        ghost.classList.add('on');
      }
    }
    return stats;
  }

  /*
   * BEFORE EQUIPPING: while the pointer or the focus is on a card, each
   * readout's line under its bar says what that card would make it, in
   * mint where it is better and amber where it is worse; nothing is
   * chosen until the card is pressed. `want` is { choice } for a power
   * card (merged over the choice on show) or { extraG, thrustK } for a
   * part, or null to put the lines back. The numbers are the same
   * estimate the readouts show, never a second model.
   */
  previewStats(want) {
    if (!this.statEls || !this.statBase) {
      return;
    }
    const base = this.statBase;
    const est = want ? fitted(this.power.estimate({ ...this.choice, ...(want.choice || {}) }),
      want.extraG ?? base.extraG, want.thrustK ?? base.thrustK) : null;
    for (const [key, e] of Object.entries(this.statEls)) {
      const v = est ? est[key] : null;
      e.delta.classList.remove('better', 'worse');
      /* A change too small to read is no change. */
      if (v == null || e.text(v) === e.text(e.v)) {
        e.delta.textContent = e.stockText;
        continue;
      }
      e.delta.textContent = str('hangar.preview', { v: e.text(v) });
      e.delta.classList.add((v < e.v) === e.less ? 'better' : 'worse');
    }
  }

  /* Count the readouts on toward their values: called every frame. */
  countOn(now) {
    if (!this.statEls) {
      return;
    }
    for (const [key, c] of Object.entries(this.counts)) {
      const e = this.statEls[key];
      if (!e || c.shown === c.to) {
        continue;
      }
      const t = Math.min(1, (now - c.t0) / COUNT_MS);
      const k = 1 - (1 - t) ** 3;
      c.shown = t >= 1 ? c.to : c.from + (c.to - c.from) * k;
      e.value.textContent = e.text(c.shown);
      e.fill.style.transform = `scaleX(${Math.max(0.02, c.shown / e.top)})`;
    }
  }

  coloursTab() {
    if (this.shop.page !== 'paint') {
      const page = this.shop.body();
      page.prepend(this.shop.switcher());
      return page;
    }
    const box = el('div', 'hangar-tab');
    box.append(this.shop.switcher());
    const colours = this.colours();
    const own = this.entry.regions ?? {};
    const current = this.entry.scheme ?? 'stock';

    box.append(el('h3', 'hangar-h', str('hangar.schemes')));
    const grid = el('div', 'hangar-schemes');
    schemesFor(this.id).forEach((sc, i) => {
      const on = sc.id === current;
      const b = button(`hangar-scheme${on ? ' on' : ''}`);
      b.dataset.key = `scheme-${sc.id}`;
      b.style.setProperty('--i', String(i));
      b.setAttribute('aria-pressed', String(on));
      const strip = el('span', 'hangar-strip');
      for (const [id, hex] of Object.entries(coloursFor(this.id, { scheme: sc.id }))) {
        const bar = el('span', `hangar-strip-bar${this.filmRegion(id) ? ' film' : ''}`);
        bar.style.background = hex;
        strip.append(bar);
      }
      b.append(strip, el('span', 'hangar-scheme-name', str(`livery.scheme.${this.family}.${sc.id}`)));
      if (on && Object.keys(own).length) {
        b.append(el('span', 'hangar-scheme-tag', str('hangar.modified')));
      }
      this.trial(b, { scheme: sc.id }, 'overview');
      b.addEventListener('click', () => this.pickScheme(sc.id));
      this.lockMark(b, 'scheme', sc.id);
      grid.append(b);
    });
    box.append(grid);
    const scheme = schemesFor(this.id).find((s) => s.id === current);
    if (scheme && scheme.source) {
      box.append(el('p', 'hangar-source', str('hangar.source', { source: scheme.source.label })));
    }

    box.append(el('h3', 'hangar-h', str('hangar.regions')));
    const list = el('div', 'hangar-regions');
    for (const r of this.regions) {
      const on = r.id === this.region;
      const b = button(`hangar-region${on ? ' on' : ''}`);
      b.dataset.key = `region-${r.id}`;
      b.dataset.focus = r.id;
      b.setAttribute('aria-pressed', String(on));
      const dot = el('span', `hangar-dot${r.film ? ' film' : ''}`);
      dot.style.background = colours[r.id];
      b.append(dot, el('span', 'hangar-region-name', str(`livery.region.${r.id}`)));
      b.addEventListener('pointerenter', () => {
        this.focus = r.id;
      });
      b.addEventListener('click', () => this.pickRegion(r.id));
      list.append(b);
    }
    box.append(list);

    const region = this.regions.find((r) => r.id === this.region);
    if (region && !region.film) {
      const sides = el('div', 'hangar-sides');
      for (const side of ['top', 'under']) {
        const on = this.paintSide === side;
        const b = button(`hangar-side-btn${on ? ' on' : ''}`, str(`hangar.side_${side}`));
        b.dataset.key = `side-${side}`;
        b.dataset.focus = region.id;
        b.setAttribute('aria-pressed', String(on));
        b.addEventListener('click', () => this.pickSide(side));
        sides.append(b);
      }
      box.append(sides);
    }
    if (region) {
      const under = this.underSide();
      const hex = under ? ((this.entry.under && this.entry.under[region.id]) ?? colours[region.id]) : colours[region.id];
      /* The scheme's own colour here, which is the first swatch, so there
       * is always a way back to it. */
      const kit = under ? colours[region.id] : coloursFor(this.id, { scheme: this.entry.scheme })[region.id];
      const named = paletteColour(hex);
      const nameBox = el('div', 'hangar-colour');
      const chip = el('span', `hangar-colour-chip${region.film ? ' film' : ''}`);
      chip.style.setProperty('--swatch', hex);
      const words = el('span', 'hangar-colour-words');
      const brand = named ? named.brand : str(hex === kit ? 'hangar.kit_colour' : 'hangar.custom');
      words.append(
        el('span', 'hangar-colour-brand', brand),
        el('span', 'hangar-colour-name', named ? named.name : hex),
      );
      nameBox.append(chip, words);
      box.append(nameBox);
      const pal = el('div', 'hangar-palette');
      const swatches = paletteFor(region);
      if (!swatches.some((c) => c.hex === kit)) {
        swatches.unshift({ brand: str('hangar.kit_colour'), name: kit, hex: kit, film: region.film });
      }
      swatches.forEach((c, i) => {
        const on = c.hex === hex;
        const b = button(`hangar-swatch${c.film ? ' film' : ''}${on ? ' on' : ''}`);
        b.dataset.key = `colour-${c.hex}`;
        b.style.setProperty('--swatch', c.hex);
        b.style.setProperty('--i', String(i));
        b.title = `${c.brand} ${c.name}`;
        b.setAttribute('aria-label', `${c.brand} ${c.name}`);
        b.setAttribute('aria-pressed', String(on));
        this.trial(b, { region: region.id, hex: c.hex, side: under ? 'under' : 'top' }, region.id);
        b.addEventListener('click', () => this.pickColour(c.hex));
        pal.append(b);
      });
      const custom = button(`hangar-swatch hangar-swatch-custom${!swatches.some((c) => c.hex === hex) ? ' on' : ''}`, '+');
      custom.dataset.key = 'custom';
      custom.dataset.focus = region.id;
      custom.title = str('hangar.custom');
      custom.setAttribute('aria-label', str('hangar.custom'));
      custom.addEventListener('click', () => {
        this.customTarget = null;
        this.customInput.value = hex;
        this.customInput.click();
      });
      pal.append(custom);
      box.append(pal);
      if (region.film) {
        box.append(el('p', 'hangar-source', str('hangar.film_note')));
      }
      box.append(this.shop.finishRow(region));
    }
    box.append(this.wearRow());
    return box;
  }

  /*
   * WEAR, the whole plane's (configs/paint.js, drawn by src/render/
   * finish.js): factory new to battle worn, two steps a press of the
   * buttons either side, or a click along the bar, on the plane at once.
   * Unlike a swatch a step is not tried on under the cursor: the plane
   * would always show the step after the one the bar reads.
   */
  wearRow() {
    const box = el('div', 'hangar-wear');
    const w = this.entry.wear ?? 0;
    box.append(el('h3', 'hangar-h', str('hangar.wear')));
    const row = el('div', 'hangar-wear-row');
    const step = (dir) => Math.max(0, Math.min(WEAR_MAX, w + dir * WEAR_STEP * 2));
    const less = button('paint-step', '-');
    less.dataset.key = 'wear-down';
    less.dataset.focus = 'overview';
    less.setAttribute('aria-label', str('hangar.wear_down'));
    less.addEventListener('click', () => this.setWear(step(-1), 'wear-down'));
    const more = button('paint-step', '+');
    more.dataset.key = 'wear-up';
    more.dataset.focus = 'overview';
    more.setAttribute('aria-label', str('hangar.wear_up'));
    more.addEventListener('click', () => this.setWear(step(1), 'wear-up'));
    const bar = el('div', 'hangar-wear-bar');
    const fill = el('span', 'hangar-wear-fill');
    fill.style.width = `${w}%`;
    bar.append(fill, el('span', 'hangar-wear-value', str('hangar.wear_value', { n: w })));
    bar.addEventListener('click', (e) => {
      const r = bar.getBoundingClientRect();
      this.setWear((100 * (e.clientX - r.left)) / Math.max(1, r.width), 'wear-up');
    });
    row.append(less, bar, more);
    const ends = el('div', 'hangar-wear-ends');
    ends.append(el('span', null, str('hangar.wear_new')), el('span', null, str('hangar.wear_worn')));
    box.append(row, ends);
    return box;
  }

  setWear(v, focusKey) {
    const w = cleanWear(Math.max(0, Math.min(WEAR_MAX, v))) ?? 0;
    const e = { ...this.entry, wear: w };
    if (!w) {
      delete e.wear;
    }
    this.entry = e;
    this.changed(focusKey, 'adjust');
  }

  filmRegion(id) {
    const r = this.regions.find((x) => x.id === id);
    return Boolean(r && r.film);
  }

  /* The controls the cursor walks: every enabled button showing, and My
   * Hangar's name field while it is open. */
  stops() {
    return [...this.panel.querySelectorAll('button, .hangar-mine-field')].filter((b) => !b.disabled && b.offsetParent !== null);
  }

  focusKey(key) {
    const b = this.stops().find((x) => x.dataset.key === key) ?? this.stops()[0];
    if (b) {
      b.focus({ preventScroll: false });
    }
  }

  /*
   * The cursor, by where things are on screen rather than by a list: the
   * nearest control in the direction pressed, a sideways offset counting
   * double, so a swatch grid, a column of regions and the row of buttons
   * all walk the way they look.
   */
  move(dx, dy) {
    const stops = this.stops();
    const at = stops.indexOf(document.activeElement);
    if (at < 0) {
      if (stops[0]) {
        stops[0].focus();
      }
      return;
    }
    const r0 = stops[at].getBoundingClientRect();
    const cx = r0.left + r0.width / 2;
    const cy = r0.top + r0.height / 2;
    let best = null;
    let bestScore = Infinity;
    for (const b of stops) {
      if (b === stops[at]) {
        continue;
      }
      const r = b.getBoundingClientRect();
      const x = r.left + r.width / 2 - cx;
      const y = r.top + r.height / 2 - cy;
      const along = x * dx + y * dy;
      if (along <= 1) {
        continue;
      }
      const across = Math.abs(dx ? y : x);
      const score = along + 2 * across;
      if (score < bestScore) {
        bestScore = score;
        best = b;
      }
    }
    if (!best) {
      return;
    }
    /* Leaving the side panel downward while it has more below its fold:
     * the readouts and the notes under the last control are not stops, so
     * Down shows them first and leaves for the buttons on the next press. */
    const leavingSide = dy > 0 && this.side.contains(stops[at]) && !this.side.contains(best);
    if (leavingSide && this.side.scrollTop + this.side.clientHeight < this.side.scrollHeight - 1) {
      this.side.scrollTo(0, this.side.scrollHeight);
    } else {
      best.focus();
    }
    this.sound('move');
  }

  activate() {
    const b = document.activeElement;
    if (b && this.panel.contains(b) && b.tagName === 'BUTTON') {
      b.click();
    }
  }

  /* The pilot's view: up and in are positive, each held to its range. */
  tiltBy(rad) {
    this.orbit.elev = Math.max(ORBIT_ELEV[0], Math.min(ORBIT_ELEV[1], this.orbit.elev + rad));
  }

  zoomBy(k) {
    this.orbit.zoom = Math.max(ORBIT_ZOOM[0], Math.min(ORBIT_ZOOM[1], this.orbit.zoom * k));
  }

  setFlip(on) {
    this.flip = on;
    this.flipBtn.setAttribute('aria-pressed', String(on));
    this.flipBtn.classList.toggle('on', on);
  }

  /* A preset view holds until another is picked, the same one is picked
   * again, or the tab changes. */
  setView(id) {
    this.view = VIEW_PRESETS.find((v) => v.id === id) ?? null;
    this.viewBtns.forEach((b, i) => {
      const on = this.view === VIEW_PRESETS[i];
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  pickView(id) {
    if (this.view && this.view.id === id) {
      this.setView(null);
    } else {
      this.setView(id);
      if (this.view.flip !== null) {
        this.setFlip(this.view.flip);
      }
    }
    this.turn = 0;
    this.sound('select');
  }

  toggleFlip() {
    this.setFlip(!this.flip);
    this.sound('select');
  }

  /* The keys that move the view rather than the cursor. True if used. */
  viewKey(code) {
    if (code === 'KeyV') {
      this.toggleFlip();
      return true;
    }
    const preset = VIEW_PRESETS[['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].indexOf(code)];
    if (preset && !this.naming) {
      this.pickView(preset.id);
      return true;
    }
    const turn = { KeyJ: -KEY_TURN, KeyL: KEY_TURN }[code];
    const tilt = { KeyI: KEY_TILT, KeyK: -KEY_TILT }[code];
    const zoom = { KeyU: 1 / KEY_ZOOM, KeyO: KEY_ZOOM }[code];
    if (turn) {
      this.turn += turn;
    } else if (tilt) {
      this.tiltBy(tilt);
    } else if (zoom) {
      this.zoomBy(zoom);
    }
    return Boolean(turn || tilt || zoom);
  }

  /* Every key while it is up is the hangar's. */
  handleKey(code) {
    this.setHint('key');
    /* The name field takes its own typing (src/input/input.js), so only
     * Escape reaches here from it: the name goes, the buttons come back. */
    if (this.naming && (code === 'Escape' || code === 'Backspace')) {
      this.closeMine();
      return true;
    }
    if (this.shop.handleKey(code)) {
      return true;
    }
    if (this.viewKey(code)) {
      return true;
    }
    if (code === 'ArrowLeft' || code === 'KeyA') {
      this.move(-1, 0);
    } else if (code === 'ArrowRight' || code === 'KeyD') {
      this.move(1, 0);
    } else if (code === 'ArrowUp' || code === 'KeyW') {
      this.move(0, -1);
    } else if (code === 'ArrowDown' || code === 'KeyS') {
      this.move(0, 1);
    } else if (code === 'KeyQ' || code === 'PageUp') {
      this.cycleTab(-1);
    } else if (code === 'KeyE' || code === 'PageDown') {
      this.cycleTab(1);
    } else if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') {
      this.activate();
    } else if (code === 'Escape' || code === 'Backspace') {
      this.cancel();
    }
    return true;
  }

  /* A gamepad or a radio, { up, down, left, right, select, back, alt },
   * edge triggered, the first poll only learning what is held
   * (Carousel.pollPad). X, alt, turns the tabs. */
  pollPad(nav) {
    const now = padLevels(nav, PAD_KEYS);
    const prev = this.padPrev;
    this.padPrev = now;
    if (!prev) {
      return;
    }
    const edge = (k) => now[k] && !prev[k];
    if (Object.keys(now).some(edge)) {
      this.setHint('pad');
    }
    /* The right stick, a level and not an edge: the view moves for as
     * long as it is held over. */
    const look = nav.look;
    if (look && (look.x || look.y)) {
      this.setHint('pad');
      this.turn += look.x * PAD_TURN;
      this.tiltBy(-look.y * PAD_TILT);
    }
    /* The name for a new build, which a pad cannot type: A on the field
     * saves the name it was offered, B puts it away. */
    if (this.naming) {
      const a = document.activeElement;
      if (edge('back')) {
        this.closeMine();
        return;
      }
      if (edge('select') && a && a.tagName === 'INPUT') {
        this.submitMine();
        return;
      }
    }
    if (this.shop.pollPad(now, edge)) {
      return;
    }
    if (edge('left')) {
      this.move(-1, 0);
    }
    if (edge('right')) {
      this.move(1, 0);
    }
    if (edge('up')) {
      this.move(0, -1);
    }
    if (edge('down')) {
      this.move(0, 1);
    }
    if (edge('flip')) {
      this.toggleFlip();
    }
    if (edge('alt')) {
      this.cycleTab(1);
    } else if (edge('select')) {
      this.activate();
    } else if (edge('back')) {
      this.cancel();
    }
  }

  /*
   * What the renderer draws, once a frame: the one plane at the centre of
   * the stage, how far a drag has turned it since the last frame, what the
   * camera should look at (`focus`, a region or the nose), and counters
   * that tick when the set should play its reveal or its pulse. Null when
   * shut. The readouts count on here too, on the frame's clock.
   */
  frame() {
    if (!this.isOpen) {
      return null;
    }
    const now = performance.now();
    this.countOn(now);
    this.flushPreview();
    /* The entrance plays once; a tile drawn later appears as it is. */
    if (now - this.openT > 1200) {
      this.root.classList.remove('entering');
    }
    const r = this.stage.getBoundingClientRect();
    const turn = this.turn;
    this.turn = 0;
    const tabs = {};
    eachHook((h, t) => {
      if (h.frame) {
        tabs[t] = h.frame(this, now);
      }
    });
    return {
      items: [{ id: this.id, d: 0 }],
      rect: { left: r.left, top: r.top, width: r.width, height: r.height },
      top: this.panel.getBoundingClientRect().top,
      compact: false,
      turn,
      hangar: {
        focus: (this.view && this.view.focus) || (this.tab === 'colours' && this.shop.focus()) || this.focus,
        orbit: { ...this.orbit },
        flip: this.flip,
        reveal: this.revealSeq,
        pulse: this.pulseSeq,
        hold: Boolean(this.drag),
        /* The Power tab's choice, which the set pulls apart to show. */
        power: this.tab === 'power' ? { airframe: this.id, ...this.choice } : null,
        stay: this.tab === 'colours' && this.shop.stay(),
        aim: this.shop.aim(),
        tabs,
      },
    };
  }

  /* Where the aim (frame().hangar.aim) landed on the model, from the
   * renderer: { p, n } in the model's frame, or null. */
  aimed(hit) {
    this.shop.aimed(hit);
  }
}
