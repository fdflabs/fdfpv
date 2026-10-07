/*
 * hangar-parts.js: the hangar's Parts tab (registered with
 * src/ui/hangar.js): the prop, the add-ons, and the parts the last crash
 * broke, each repaired or taped. configs/hangar-parts.js is the data and
 * what each thing does to the plant; src/render/partsfit.js draws them on
 * the model, which shows the tab's choice before it is saved (frame()).
 *
 * Saved into settings.parts[airframeId] with the rest of the hangar, and
 * put on the plane at the next seat, or at once by a refit when it is the
 * plane in the air, like a new motor.
 *
 * Like the rest of the hangar, nothing here imports three.js.
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

import { POWER, powerBlock, powerChoice, powerOption, SIM_POWER } from '../../configs/power.js';
import {
  ADDONS, PROPS, addonsFor, normalisePlane, partsEntry, partsSummary, propOf, propShape, tapeable,
} from '../../configs/hangar-parts.js';
import { PROP_ESTIMATES } from '../../configs/prop-estimates.js';
import { PART_KINDS } from '../../configs/parts.js';
import { hasMotors, packOption } from '../../configs/motors.js';
import { NEW, RETIRED_BELOW, normalisePacks, normaliseWearRecord, packSpec, repair } from '../../configs/wear.js';
import { currentLocale, str } from '../strings/index.js';
import { registerHangarTab } from './hangar.js';
import { el } from './dom.js';

/* The tab's state for the plane on the stand. */
let st = null;

function button(cls, text) {
  const b = el('button', cls, text);
  b.type = 'button';
  return b;
}

function number(n, digits = 0, trim = false) {
  return n.toLocaleString(currentLocale(), { maximumFractionDigits: digits, minimumFractionDigits: trim ? 0 : digits });
}

/* Where the camera looks while an add-on's card has the cursor: the
 * hangar's own views (src/render/hangarstage.js). */
const ADDON_FOCUS = { tundra: 'floats', pod: 'floats', lights: 'wing', smoke: 'tail' };

const clone = (e) => JSON.parse(JSON.stringify(e));
const sameEntry = (a, b) => JSON.stringify(normalisePlane(st.id, a)) === JSON.stringify(normalisePlane(st.id, b));

/* The power option the plane flies with the Power tab's choice now. */
function optionNow(hangar) {
  const id = st.id;
  if (!POWER[id]) {
    return null;
  }
  const c = hangar.choice && hangar.choice.option ? hangar.choice : powerChoice(id, st.settings.power);
  return { option: powerOption(id, c.option), pack: c.pack };
}

function baseMass(id, now) {
  return powerBlock(id, now.option.id, now.pack)[SIM_POWER.MASS];
}

/* "Wing, left": the part's kind, and its side when it has a twin. */
function partName(p) {
  const kind = str(`parts.kind.${PART_KINDS[p.kind]}`);
  if (Math.abs(p.cg[1]) < 0.02) {
    return kind;
  }
  return str(p.cg[1] > 0 ? 'parts.part_left' : 'parts.part_right', { part: kind });
}

function changed(hangar, key) {
  hangar.changed(key);
}

function propCards(hangar, box, now) {
  const id = st.id;
  const props = PROPS[id];
  box.append(el('h3', 'hangar-h', str('parts.prop')));
  const row = el('div', 'hangar-cards hangar-cards-small');
  props.forEach((p, i) => {
    const shape = propShape(id, now.option, p.id);
    const on = st.entry.prop === p.id;
    const b = button(`hangar-card${on ? ' on' : ''}`);
    b.dataset.key = `prop-${p.id}`;
    b.dataset.focus = 'nose';
    b.style.setProperty('--i', String(i));
    b.setAttribute('aria-pressed', String(on));
    const name = p.id === 'stock'
      ? str('parts.prop.stock_size', { d: number(shape.propIn, 2, true), p: number(shape.pitchIn, 2, true) })
      : str('parts.prop.apc', { d: number(shape.propIn, 2, true), p: number(shape.pitchIn, 2, true) });
    b.append(el('span', 'hangar-card-name', name));
    b.append(el('span', 'hangar-card-detail', str(shape.blades === 3 ? 'parts.blades_3' : 'parts.blades_2')));
    b.addEventListener('pointerenter', () => {
      hangar.focus = 'nose';
    });
    b.addEventListener('click', () => {
      st.entry.prop = p.id;
      changed(hangar, `prop-${p.id}`);
    });
    hangar.lockMark(b, 'prop', p.id);
    row.append(b);
  });
  box.append(row);
  if (props.length === 1) {
    box.append(el('p', 'hangar-source', str(`parts.prop_only.${id}`)));
  }
}

function addonCards(hangar, box, now) {
  const id = st.id;
  const fit = addonsFor(id);
  if (!fit.length) {
    return;
  }
  box.append(el('h3', 'hangar-h', str('parts.addons')));
  const grid = el('div', 'hangar-cards hangar-cards-small');
  fit.forEach((a, i) => {
    const on = st.entry.addons.includes(a);
    const b = button(`hangar-card parts-toggle${on ? ' on' : ''}`);
    b.dataset.key = `addon-${a}`;
    b.dataset.focus = ADDON_FOCUS[a];
    b.style.setProperty('--i', String(i));
    b.setAttribute('aria-pressed', String(on));
    b.addEventListener('pointerenter', () => {
      hangar.focus = ADDON_FOCUS[a];
    });
    const grams = partsSummary(id, { prop: 'stock', addons: [a], damage: null }, now.option, baseMass(id, now)).grams;
    b.append(el('span', 'hangar-card-name', str(`parts.addon.${a}`)));
    b.append(el('span', 'hangar-card-detail', str('parts.plus_grams', { n: number(grams) })));
    b.addEventListener('click', () => {
      const set = new Set(st.entry.addons);
      if (on) {
        set.delete(a);
      } else {
        set.add(a);
      }
      st.entry.addons = fit.filter((x) => set.has(x));
      changed(hangar, `addon-${a}`);
    });
    hangar.lockMark(b, 'addon', a);
    grid.append(b);
  });
  box.append(grid);
  if (st.entry.addons.includes('smoke')) {
    box.append(el('p', 'hangar-source', str('parts.smoke_key')));
  }
}

function damageList(hangar, box) {
  box.append(el('h3', 'hangar-h', str('parts.damage')));
  const d = st.entry.damage;
  if (!d) {
    box.append(el('p', 'hangar-source', str(st.settings.crashDamage === false ? 'parts.no_damage_off' : 'parts.no_damage')));
    return;
  }
  const list = el('div', 'parts-damage');
  for (const p of d.parts) {
    const row = el('div', `parts-damage-row ${p.state}`);
    const words = el('div', 'parts-damage-words');
    words.append(el('span', 'parts-damage-name', partName(p)), el('span', 'parts-damage-state', str(`parts.state_${p.state}`)));
    row.append(words);
    const acts = el('div', 'parts-damage-acts');
    const repair = button('parts-act', str('parts.repair'));
    repair.dataset.key = `repair-${p.i}`;
    repair.dataset.focus = 'overview';
    repair.addEventListener('click', () => {
      d.parts = d.parts.filter((x) => x.i !== p.i);
      if (!d.parts.length) {
        st.entry.damage = null;
      }
      changed(hangar, 'damage-done');
    });
    acts.append(repair);
    if (p.state === 'broken' && tapeable(p.kind)) {
      const tape = button('parts-act tape', str('parts.tape'));
      tape.dataset.key = `tape-${p.i}`;
      tape.dataset.focus = 'overview';
      tape.addEventListener('click', () => {
        p.state = 'taped';
        changed(hangar, `repair-${p.i}`);
      });
      acts.append(tape);
    }
    row.append(acts);
    list.append(row);
  }
  box.append(list);
  if (d.parts.length > 1) {
    const all = button('hangar-reset parts-repair-all', str('parts.repair_all'));
    all.dataset.key = 'repair-all';
    all.addEventListener('click', () => {
      st.entry.damage = null;
      changed(hangar, 'damage-done');
    });
    box.append(all);
  }
}

/* The specs this airframe's packs come in, for the shelf. */
function specsOf(id) {
  const ids = hasMotors(id) ? [packOption(id, null).id] : (POWER[id] || []).flatMap((o) => o.packs.map((p) => p.id));
  return new Set(ids.map((p) => packSpec(id, p)).filter(Boolean));
}

const percent = (health) => number(Math.round((health * 100) / NEW));

/* The part tables the shell has read from the module, by airframe: each
 * index's kind and side, so the bench can name a worn part (the hangar
 * has no module of its own). */
const PART_TABLES = {};
const REPAIR_FROM = 0.85;
/* A quad's arm, motor and prop are named by corner, front or rear too. */
const QUAD_CORNER = new Set(['arm', 'motor', 'prop']);
export function learnPartTable(id, table) {
  const quad = hasMotors(id);
  PART_TABLES[id] = table.map((t) => ({
    kind: t.kind,
    side: Math.abs(t.cg[1]) < 0.02 ? 0 : t.cg[1] > 0 ? 1 : -1,
    end: quad && QUAD_CORNER.has(PART_KINDS[t.kind]) ? (t.cg[0] > 0 ? 'front' : 'rear') : null,
  }));
}

function wornName(id, i) {
  const t = PART_TABLES[id] && PART_TABLES[id][i];
  if (!t) {
    return str('parts.wear_part', { n: number(i) });
  }
  const kind = str(`parts.kind.${PART_KINDS[t.kind]}`);
  if (t.side === 0) {
    return kind;
  }
  const side = t.side > 0 ? 'left' : 'right';
  return str(t.end ? `parts.part_${t.end}_${side}` : `parts.part_${side}`, { part: kind });
}

/*
 * CAREER AND WAR WEAR (configs/wear.js): each worn part of the entry's
 * record by its crash part index, repaired here (free until the economy
 * prices it) and saved with the tab, and the packs on the shelf that fit
 * this airframe, which are replaced, never repaired.
 */
function wearList(hangar, box) {
  const id = st.id;
  box.append(el('h3', 'hangar-h', str('parts.wear')));
  const record = normaliseWearRecord(st.entry.wear);
  const worn = record ? Object.keys(record.parts).map(Number).sort((a, b) => a - b) : [];
  if (!worn.length) {
    box.append(el('p', 'hangar-source', str('parts.wear_none')));
  } else {
    const list = el('div', 'parts-damage');
    for (const i of worn) {
      /* The training lane's bands: from 0.85 a part is due a repair. */
      const row = el('div', `parts-damage-row ${record.parts[i] >= REPAIR_FROM ? 'due' : 'worn'}`);
      const words = el('div', 'parts-damage-words');
      const left = Math.round((1 - record.parts[i]) * 100);
      words.append(el('span', 'parts-damage-name', wornName(id, i)), el('span', 'parts-damage-state', str('parts.wear_health', { n: number(left) })));
      const fix = button('parts-act', str('parts.repair'));
      fix.dataset.key = `wear-repair-${i}`;
      fix.dataset.focus = 'overview';
      fix.addEventListener('click', () => {
        st.entry.wear = repair(record, i);
        changed(hangar, 'wear-done');
      });
      const acts = el('div', 'parts-damage-acts');
      acts.append(fix);
      row.append(words, acts);
      list.append(row);
    }
    box.append(list);
    if (worn.length > 1) {
      const all = button('hangar-reset parts-repair-all', str('parts.repair_all'));
      all.dataset.key = 'wear-repair-all';
      all.addEventListener('click', () => {
        st.entry.wear = repair(record);
        changed(hangar, 'wear-done');
      });
      box.append(all);
    }
  }
  const specs = specsOf(id);
  const packs = Object.entries(normalisePacks(st.settings.packs)).filter(([, p]) => specs.has(p.spec)).sort(([a], [b]) => (a < b ? -1 : 1));
  if (packs.length) {
    box.append(el('h3', 'hangar-h', str('parts.packs')));
    const list = el('div', 'parts-damage');
    for (const [k, p] of packs) {
      const m = /^(\d+)s(\d+)/.exec(p.spec);
      const row = el('div', `parts-damage-row pack${p.health < RETIRED_BELOW ? ' retired' : ''}`);
      row.dataset.key = `pack-${k}`;
      const words = el('div', 'parts-damage-words');
      words.append(
        el('span', 'parts-damage-name', str('power.pack', { cells: m[1], mah: m[2] })),
        el('span', 'parts-damage-state', str('parts.pack_line', { health: percent(p.health), cycles: number(p.cycles), charge: str(`parts.charge_${p.charge}`) })),
      );
      if (p.health < RETIRED_BELOW) {
        words.append(el('span', 'parts-damage-state', str('parts.pack_retired')));
      }
      row.append(words);
      list.append(row);
    }
    box.append(list);
  }
  box.append(el('p', 'hangar-source', str('parts.wear_note')));
}

function statsBlock(box, now) {
  const id = st.id;
  const s = partsSummary(id, st.entry, now.option, baseMass(id, now));
  const p = propOf(id, st.entry.prop);
  const est = p.id === 'stock' ? null : PROP_ESTIMATES[id][now.option.id][p.id];
  const thrust = est ? est.thrustN : now.option.thrustN;
  const pitchSpeed = est ? est.pitchSpeedMs : now.option.pitchSpeedMs;
  const cg = s.cgMm[0];
  const stats = [
    { label: 'parts.stat_weight', value: str('parts.plus_grams', { n: number(s.grams) }) },
    { label: 'parts.stat_drag', value: str('parts.cm2', { n: number(s.dragCm2, 1) }) },
    { label: 'parts.stat_thrust', value: str('parts.newtons', { n: number(thrust, 1) }) },
    { label: 'parts.stat_cg', value: Math.abs(cg) < 0.05 ? str('parts.cg_level') : str(cg > 0 ? 'parts.cg_fwd' : 'parts.cg_aft', { n: number(Math.abs(cg), 1) }) },
  ];
  const grid = el('div', 'hangar-stats parts-stats');
  for (const x of stats) {
    const t = el('div', 'hangar-stat');
    t.append(el('span', 'hangar-stat-label', str(x.label)), el('span', 'hangar-stat-value', x.value));
    grid.append(t);
  }
  box.append(grid);
  box.append(el('p', 'hangar-source', str('parts.prop_numbers', { v: number(pitchSpeed * 3.6) })));
  const sources = [];
  if (p.id !== 'stock') {
    sources.push('apcprop.com');
  }
  for (const a of st.entry.addons) {
    for (const u of ADDONS[a].source) {
      const m = /^https?:\/\/(?:www\.)?([^/]+)/.exec(u);
      if (m && !sources.includes(m[1])) {
        sources.push(m[1]);
      }
    }
  }
  if (sources.length) {
    box.append(el('p', 'hangar-source', str('hangar.source', { source: sources.join(', ') })));
  }
}

registerHangarTab({
  id: 'parts',
  focus: 'overview',
  open(hangar, settings) {
    const id = hangar.id;
    const saved = PROPS[id] || hasMotors(id) ? partsEntry(settings.parts, id) : null;
    st = { id, settings, saved, entry: saved ? clone(saved) : null };
  },
  close() {
    st = null;
  },
  dirty() {
    return Boolean(st && st.entry && !sameEntry(st.entry, st.saved));
  },
  reset() {
    if (st && st.entry) {
      st.entry.prop = 'stock';
      st.entry.addons = [];
    }
  },
  /* The grams the chosen add-ons and prop put on, for the spec sheet. */
  grams(hangar) {
    const now = st && st.entry ? optionNow(hangar) : null;
    return now ? partsSummary(st.id, st.entry, now.option, baseMass(st.id, now)).grams : 0;
  },
  save() {
    if (!st || !st.entry || sameEntry(st.entry, st.saved)) {
      return null;
    }
    const map = { ...(st.settings.parts ?? {}) };
    const e = normalisePlane(st.id, st.entry);
    if (e) {
      map[st.id] = e;
    } else {
      delete map[st.id];
    }
    return { parts: map };
  },
  frame(hangar) {
    if (!st || !st.entry || !PROPS[st.id]) {
      return null;
    }
    const now = optionNow(hangar);
    return { id: st.id, entry: normalisePlane(st.id, st.entry) ?? { prop: 'stock', addons: [], damage: null }, option: now ? now.option.id : null };
  },
  paint(hangar) {
    const box = el('div', 'hangar-tab parts-tab');
    if (!st || !st.entry || !PROPS[st.id]) {
      box.append(el('p', 'hangar-note', str('parts.none_here')));
      if (st && st.entry) {
        wearList(hangar, box);
      }
      return box;
    }
    const now = optionNow(hangar);
    propCards(hangar, box, now);
    addonCards(hangar, box, now);
    damageList(hangar, box);
    statsBlock(box, now);
    wearList(hangar, box);
    return box;
  },
});
