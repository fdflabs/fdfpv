/*
 * hangar-kit.js: the hangar's Kit tab, the visual part kits
 * (docs/KITS.md, configs/kits.js). A row of options per slot; pointing at
 * one tries it on the model, pressing fits it. What is fitted is the
 * livery entry's `kit`, so the paint's own Save, dirty and Reset carry it
 * and nothing here is stored on its own.
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

import { DRAWN, KIT_VERSION, LED_PATTERNS, LIGHTS_VERSION, kitParts, lightsFor, slotsFor } from '../../configs/kits.js';
import { liveryKey } from '../../configs/liveries.js';
import { airframeById } from '../../configs/airframes.js';
import { str } from '../strings/index.js';
import { registerHangarTab } from './hangar.js';
import { el } from './dom.js';
import { kitItem } from '../game/economy.js';
import { kitStanding, showInShop } from './hangar-shop.js';

function button(cls, text) {
  const b = el('button', cls, text);
  b.type = 'button';
  return b;
}

/* The entry with one slot set; all stock leaves no kit at all. */
export function withSlot(entry, family, slot, option) {
  const parts = { ...kitParts(family, entry.kit), [slot]: option };
  const fitted = Object.fromEntries(Object.entries(parts).filter(([, o]) => o !== 'stock'));
  const out = { ...entry };
  delete out.kit;
  if (Object.keys(fitted).length) {
    out.kit = { v: KIT_VERSION, parts: fitted };
  }
  return out;
}

/* The LED colours offered: the common LED strip colours, not the paint
 * palette, since a light is a colour of light. */
const LED_COLOURS = ['#ff2a1a', '#ff8a00', '#ffe600', '#22ff44', '#00b7ff', '#7a3cff', '#ff2bd6', '#ffffff'];

/* The entry with its lights changed; nothing on means no lights. */
function withLights(entry, change) {
  const lights = { v: LIGHTS_VERSION, ...(entry.lights ?? {}), ...change };
  const out = { ...entry };
  delete out.lights;
  if (lights.led || lights.nav || lights.strobe) {
    out.lights = lights;
  }
  return out;
}

function ledRows(hangar, box) {
  const lights = hangar.entry.lights ?? {};
  box.append(el('h3', 'hangar-h', str('kit.leds')));
  const colours = el('div', 'hangar-cards hangar-cards-small');
  [null, ...LED_COLOURS].forEach((hex, i) => {
    const on = (lights.led ?? null) === hex;
    const b = button(`hangar-card${on ? ' on' : ''}`);
    b.dataset.key = `led-${hex ? hex.slice(1) : 'off'}`;
    b.style.setProperty('--i', String(i));
    b.setAttribute('aria-pressed', String(on));
    const name = el('span', 'hangar-card-name', hex ? '\u25cf' : str('kit.led_off'));
    if (hex) {
      name.style.color = hex;
      b.setAttribute('aria-label', hex);
    }
    b.append(name);
    hangar.trial(b, { entry: withLights(hangar.entry, { led: hex }) }, 'overview');
    b.addEventListener('click', () => {
      hangar.entry = withLights(hangar.entry, { led: hex });
      hangar.changed(b.dataset.key);
    });
    colours.append(b);
  });
  box.append(colours);
  if (!lights.led) {
    return;
  }
  box.append(el('h3', 'hangar-h', str('kit.pattern')));
  const patterns = el('div', 'hangar-cards hangar-cards-small');
  LED_PATTERNS.forEach((p, i) => {
    const on = (lights.pattern ?? 'solid') === p;
    const b = button(`hangar-card${on ? ' on' : ''}`);
    b.dataset.key = `pattern-${p}`;
    b.style.setProperty('--i', String(i));
    b.setAttribute('aria-pressed', String(on));
    b.append(el('span', 'hangar-card-name', str(`kit.pattern.${p}`)));
    b.addEventListener('click', () => {
      hangar.entry = withLights(hangar.entry, { pattern: p });
      hangar.changed(b.dataset.key);
    });
    patterns.append(b);
  });
  box.append(patterns);
  box.append(el('p', 'hangar-source', str('kit.pattern_note')));
}

/* A plane's nav lights and wingtip strobes, each on or off. */
function navRows(hangar, box) {
  const lights = hangar.entry.lights ?? {};
  box.append(el('h3', 'hangar-h', str('kit.lights')));
  const grid = el('div', 'hangar-cards hangar-cards-small');
  ['nav', 'strobe'].forEach((k, i) => {
    const on = lights[k] === true;
    const b = button(`hangar-card parts-toggle${on ? ' on' : ''}`);
    b.dataset.key = `light-${k}`;
    b.style.setProperty('--i', String(i));
    b.setAttribute('aria-pressed', String(on));
    b.append(el('span', 'hangar-card-name', str(`kit.light.${k}`)));
    b.addEventListener('click', () => {
      hangar.entry = withLights(hangar.entry, { [k]: !on });
      hangar.changed(b.dataset.key);
    });
    grid.append(b);
  });
  box.append(grid);
}

registerHangarTab({
  id: 'kit',
  focus: 'overview',
  paint(hangar) {
    const box = el('div', 'hangar-tab kit-tab');
    const family = liveryKey(hangar.id);
    /* On floats a plane has no wheels to dress (the builders draw none). */
    const floats = Boolean(airframeById(hangar.id).floats);
    const slots = (DRAWN.has(family) ? slotsFor(family) : []).filter((s) => !(floats && s.id === 'wheels'));
    const has = lightsFor(family);
    if (!slots.length && !has.led && !has.nav) {
      box.append(el('p', 'hangar-note', str('kit.none_here')));
      return box;
    }
    const fitted = kitParts(family, hangar.entry.kit);
    for (const s of slots) {
      box.append(el('h3', 'hangar-h', str(`kit.slot.${s.id}`)));
      const grid = el('div', 'hangar-cards hangar-cards-small');
      s.options.forEach((option, i) => {
        const on = fitted[s.id] === option;
        const b = button(`hangar-card${on ? ' on' : ''}`);
        b.dataset.key = `kit-${s.id}-${option}`;
        b.style.setProperty('--i', String(i));
        b.setAttribute('aria-pressed', String(on));
        b.append(el('span', 'hangar-card-name', str(`kit.option.${option}`)));
        /* A Shop or earned option (docs/KITS.md section 7) is tried on
         * like any other; pressed while not owned, it opens in the Shop.
         * One already fitted (a code, a save from before) stays fitted. */
        const item = kitItem(family, s.id, option);
        const locked = item && !on && kitStanding(item.id) !== 'owned';
        if (item && kitStanding(item.id) !== 'owned') {
          b.append(el('span', 'hangar-card-detail', item.price ? str('shop.tokens', { n: item.price }) : str('shop.earned_only')));
        }
        hangar.trial(b, { entry: withSlot(hangar.entry, family, s.id, option) }, 'overview');
        b.addEventListener('click', () => {
          if (locked) {
            showInShop(hangar, item.id);
            return;
          }
          hangar.entry = withSlot(hangar.entry, family, s.id, option);
          hangar.changed(`kit-${s.id}-${option}`);
        });
        grid.append(b);
      });
      box.append(grid);
    }
    if (has.led) {
      ledRows(hangar, box);
    }
    if (has.nav) {
      navRows(hangar, box);
    }
    box.append(el('p', 'hangar-source', str('kit.note')));
    return box;
  },
});
