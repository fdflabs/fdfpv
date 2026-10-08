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

import { DRAWN, KIT_VERSION, kitParts, slotsFor } from '../../configs/kits.js';
import { liveryKey } from '../../configs/liveries.js';
import { str } from '../strings/index.js';
import { registerHangarTab } from './hangar.js';
import { el } from './dom.js';

function button(cls, text) {
  const b = el('button', cls, text);
  b.type = 'button';
  return b;
}

/* The entry with one slot set; all stock leaves no kit at all. */
function withSlot(entry, family, slot, option) {
  const parts = { ...kitParts(family, entry.kit), [slot]: option };
  const fitted = Object.fromEntries(Object.entries(parts).filter(([, o]) => o !== 'stock'));
  const out = { ...entry };
  delete out.kit;
  if (Object.keys(fitted).length) {
    out.kit = { v: KIT_VERSION, parts: fitted };
  }
  return out;
}

registerHangarTab({
  id: 'kit',
  focus: 'overview',
  paint(hangar) {
    const box = el('div', 'hangar-tab kit-tab');
    const family = liveryKey(hangar.id);
    const slots = DRAWN.has(family) ? slotsFor(family) : [];
    if (!slots.length) {
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
        hangar.trial(b, { entry: withSlot(hangar.entry, family, s.id, option) }, 'overview');
        b.addEventListener('click', () => {
          hangar.entry = withSlot(hangar.entry, family, s.id, option);
          hangar.changed(`kit-${s.id}-${option}`);
        });
        grid.append(b);
      });
      box.append(grid);
    }
    box.append(el('p', 'hangar-source', str('kit.note')));
    return box;
  },
});
