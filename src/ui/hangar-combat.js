/*
 * hangar-combat.js: the hangar's Loadout tab (registered with
 * src/ui/hangar.js): what a combat quad carries under its belly and what
 * is bolted on it, docs/COMBAT-DRONES.md. configs/combat.js is the data
 * and what each choice does to the plant; the drawing is the combat
 * model's, which reads the same choice.
 *
 * On the Striker, a fixed wing pushed two ways, the tab picks its engine
 * too, the piston or the turbojet, each its own plant (the doc's section
 * 7).
 *
 * Saved into settings.combat[airframeId] with the rest of the hangar, and
 * put on the quad at the next seat, or at once by a refit when it is the
 * quad in the air, like the Parts tab's add-ons. In a war the payload is
 * the warhead (the doc's section 3), which the tab says.
 *
 * Like the rest of the hangar, nothing here imports three.js.
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

import { airframeById } from '../../configs/airframes.js';
import { NO_PAYLOAD, combatChoice, combatMass, propulsionOf } from '../../configs/combat.js';
import { currentLocale, str } from '../strings/index.js';
import { registerHangarTab } from './hangar.js';

/* The tab's state for the quad on the stand, or null for any other. */
let st = null;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) {
    n.className = cls;
  }
  if (text != null) {
    n.textContent = text;
  }
  return n;
}

function button(cls, text) {
  const b = el('button', cls, text);
  b.type = 'button';
  return b;
}

function number(n, digits = 0) {
  return n.toLocaleString(currentLocale(), { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* What pushes it, on an aircraft pushed more than one way (the Striker):
 * each its own engine, mass and speed. */
function propulsionCards(hangar, box) {
  const list = st.af.combat.propulsion;
  if (!list) {
    return;
  }
  box.append(el('h3', 'hangar-h', str('loadout.propulsion')));
  const grid = el('div', 'hangar-cards hangar-cards-small');
  list.forEach((x, i) => {
    const on = st.entry.propulsion === x.id;
    const b = button(`hangar-card${on ? ' on' : ''}`);
    b.dataset.key = `propulsion-${x.id}`;
    b.dataset.focus = 'overview';
    b.style.setProperty('--i', String(i));
    b.setAttribute('aria-pressed', String(on));
    b.append(el('span', 'hangar-card-name', str(`loadout.propulsion.${x.id}`)));
    b.append(el('span', 'hangar-card-detail', str('loadout.top_speed', { n: number(x.topSpeed * 3.6) })));
    b.addEventListener('click', () => {
      st.entry.propulsion = x.id;
      hangar.changed(`propulsion-${x.id}`);
    });
    grid.append(b);
  });
  box.append(grid);
}

function payloadCards(hangar, box) {
  const c = st.af.combat;
  box.append(el('h3', 'hangar-h', str('loadout.payload')));
  const grid = el('div', 'hangar-cards hangar-cards-small');
  const ids = [NO_PAYLOAD, ...c.payloads.map((p) => p.id)];
  ids.forEach((id, i) => {
    const on = st.entry.payload === id;
    const p = c.payloads.find((x) => x.id === id);
    const b = button(`hangar-card${on ? ' on' : ''}`);
    b.dataset.key = `payload-${id}`;
    b.dataset.focus = 'overview';
    b.style.setProperty('--i', String(i));
    b.setAttribute('aria-pressed', String(on));
    b.append(el('span', 'hangar-card-name', str(`loadout.payload.${id}`)));
    b.append(el('span', 'hangar-card-detail', p ? str('parts.plus_grams', { n: number(p.massKg * 1000) }) : str('loadout.payload_bare')));
    b.addEventListener('click', () => {
      st.entry.payload = id;
      hangar.changed(`payload-${id}`);
    });
    grid.append(b);
  });
  box.append(grid);
  box.append(el('p', 'hangar-source', str('loadout.war_note')));
}

function accessoryCards(hangar, box) {
  const list = st.af.combat.accessories;
  box.append(el('h3', 'hangar-h', str('loadout.accessories')));
  const grid = el('div', 'hangar-cards hangar-cards-small');
  list.forEach((a, i) => {
    const on = st.entry.accessories.includes(a.id);
    const b = button(`hangar-card parts-toggle${on ? ' on' : ''}`);
    b.dataset.key = `accessory-${a.id}`;
    b.dataset.focus = 'overview';
    b.style.setProperty('--i', String(i));
    b.setAttribute('aria-pressed', String(on));
    b.append(el('span', 'hangar-card-name', str(`loadout.accessory.${a.id}`)));
    b.append(el('span', 'hangar-card-detail', str('parts.plus_grams', { n: number(a.massKg * 1000) })));
    b.addEventListener('click', () => {
      const set = new Set(st.entry.accessories);
      if (on) {
        set.delete(a.id);
      } else {
        set.add(a.id);
      }
      st.entry.accessories = list.filter((x) => set.has(x.id)).map((x) => x.id);
      hangar.changed(`accessory-${a.id}`);
    });
    grid.append(b);
  });
  box.append(grid);
}

/* The all up mass and the thrust to weight it leaves, off the airframe's
 * own static figure (configs/airframes.js thrustToWeight, which is the
 * bare machine's), or its propulsion's where it has them. */
function statsBlock(box) {
  const af = st.af;
  const kg = combatMass(af, af.grams, st.entry);
  const bare = propulsionOf(af, st.entry) ?? af;
  const tw = bare.thrustToWeight * (bare.grams / 1000) / kg;
  const grid = el('div', 'hangar-stats parts-stats');
  for (const [label, value] of [
    ['loadout.stat_all_up', str('loadout.kg', { n: number(kg, 2) })],
    ['loadout.stat_thrust_to_weight', str('loadout.to_one', { n: number(tw, 1) })],
  ]) {
    const t = el('div', 'hangar-stat');
    t.append(el('span', 'hangar-stat-label', str(label)), el('span', 'hangar-stat-value', value));
    grid.append(t);
  }
  box.append(grid);
}

registerHangarTab({
  id: 'loadout',
  focus: 'overview',
  open(hangar, settings) {
    const af = airframeById(hangar.id);
    const saved = af.id === hangar.id ? combatChoice(af, settings.combat ? settings.combat[af.id] : null) : null;
    st = saved ? { af, settings, saved, entry: { ...saved, accessories: [...saved.accessories] } } : null;
  },
  close() {
    st = null;
  },
  dirty() {
    return Boolean(st && !same(st.entry, st.saved));
  },
  reset() {
    if (st) {
      st.entry = combatChoice(st.af, null);
    }
  },
  save() {
    if (!st || same(st.entry, st.saved)) {
      return null;
    }
    return { combat: { ...(st.settings.combat ?? {}), [st.af.id]: combatChoice(st.af, st.entry) } };
  },
  /* The stand's preview of the choice before it is saved. */
  frame() {
    return st ? { id: st.af.id, combat: combatChoice(st.af, st.entry) } : null;
  },
  paint(hangar) {
    const box = el('div', 'hangar-tab combat-tab');
    if (!st) {
      box.append(el('p', 'hangar-note', str('loadout.none_here')));
      return box;
    }
    propulsionCards(hangar, box);
    payloadCards(hangar, box);
    accessoryCards(hangar, box);
    statsBlock(box);
    return box;
  },
});
