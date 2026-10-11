/*
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

/*
 * The hangar's Surfaces tab: the control surface tiers (configs/surfaces.js,
 * docs/SURFACES-STAGE1.md), Stock, Sport, 3D and Extreme for the ailerons,
 * the elevator and the rudder. Each tier is earned by level, never bought
 * (src/game/progress.js), since it changes how the plane flies. The model
 * shows the bigger surfaces as soon as a card is pointed at or pressed
 * (src/render/surfacesource.js previewSurfaces), and the three bars are the
 * flight model's own numbers (configs/surfaces-stats.js, from
 * scripts/surfaces-gates.js): each axis's rate at full stick and at a fifth
 * of a stick, and the speed kept through 2 s of full stick, each read from
 * its surface's tier with the other two stock.
 */

import {
  SURFACES, SURFACE_KEYS, TIERS, normaliseSurfaces, normaliseTiers, surfaceGrowth, tierPoints, unlockId,
} from '../../configs/surfaces.js';
import { SURFACE_TIERS } from '../../configs/surfaces-tiers.js';
import { SURFACE_STATS } from '../../configs/surfaces-stats.js';
import { previewSurfaces } from '../render/surfacesource.js';
import { currentLocale, str } from '../strings/index.js';
import { registerHangarTab } from './hangar.js';
import { el } from './dom.js';

let st = null;

function button(cls, text) {
  const b = el('button', cls, text);
  b.type = 'button';
  return b;
}

const number = (n, digits = 0) => n.toLocaleString(currentLocale(), { maximumFractionDigits: digits, minimumFractionDigits: digits });
const same = (a, b) => JSON.stringify(normaliseTiers(a, st.id)) === JSON.stringify(normaliseTiers(b, st.id));

/* What the model shows: the tiers pointed at, else the ones chosen. */
function show(tiers) {
  previewSurfaces(st.id, surfaceGrowth(st.id, tiers));
}

/* The three bars' numbers for a choice of tiers: each axis read off its
 * own surface's row, as a share of the stock aircraft's. */
function statsOf(tiers) {
  const s = SURFACE_STATS[st.id];
  const row = (k) => s[k][TIERS.indexOf(tiers[k])];
  const stock = (k) => s[k][0];
  const mean = (f) => SURFACE_KEYS.reduce((a, k) => a + f(k), 0) / SURFACE_KEYS.length;
  return {
    agility: mean((k) => row(k).full / stock(k).full),
    stability: mean((k) => stock(k).fifth / row(k).fifth),
    speed: mean((k) => row(k).kept / stock(k).kept),
    full: SURFACE_KEYS.map((k) => row(k).full),
    fifth: SURFACE_KEYS.map((k) => row(k).fifth),
    kept: mean((k) => row(k).kept),
  };
}

function statBlock(box) {
  const now = statsOf(st.tiers);
  const stats = el('div', 'hangar-stats surfaces-stats');
  /* Each bar against the most any choice of tiers reaches, so a full
   * bar is the most there is on this plane. */
  const top = statsOf({ a: 'extreme', e: 'extreme', r: 'extreme' });
  const bars = [
    ['agility', now.agility, Math.max(top.agility, 1), str('surfaces.stat_agility_value', { roll: number(now.full[0]), pitch: number(now.full[1]), yaw: number(now.full[2]) })],
    ['stability', now.stability, 1, str('surfaces.stat_stability_value', { roll: number(now.fifth[0]), pitch: number(now.fifth[1]), yaw: number(now.fifth[2]) })],
    ['speed', now.speed, 1, str('surfaces.stat_speed_value', { n: number(now.kept * 100) })],
  ];
  for (const [key, v, max, detail] of bars) {
    const one = el('div', 'hangar-stat');
    one.dataset.key = `surfaces-stat-${key}`;
    const bar = el('span', 'hangar-stat-bar');
    const fill = el('span', 'hangar-stat-fill');
    fill.style.transform = `scaleX(${Math.max(0.02, Math.min(1, v / max))})`;
    bar.append(fill);
    one.append(
      el('span', 'hangar-stat-label', str(`surfaces.stat_${key}`)),
      el('span', 'hangar-stat-value', str('surfaces.percent', { n: number(v * 100) })),
      bar,
      el('span', 'hangar-stat-delta surfaces-stat-detail', detail),
    );
    stats.append(one);
  }
  box.append(stats);
  box.append(el('p', 'hangar-source', str('surfaces.stat_note')));
}

function row(hangar, box, key) {
  box.append(el('h3', 'hangar-h', str(`surfaces.${key}`)));
  if (!SURFACE_TIERS[st.id].offered[key]) {
    box.append(el('p', 'hangar-note', str('surfaces.not_offered')));
    return;
  }
  const cards = el('div', 'hangar-cards hangar-cards-small');
  SURFACE_TIERS[st.id][key].forEach((t, i) => {
    const on = st.tiers[key] === t.tier;
    const b = button(`hangar-card${on ? ' on' : ''}`);
    b.dataset.key = `surface-${key}-${t.tier}`;
    b.dataset.focus = 'overview';
    b.style.setProperty('--i', String(i));
    b.setAttribute('aria-pressed', String(on));
    b.append(el('span', 'hangar-card-name', str(`surfaces.tier.${t.tier}`)));
    b.append(el('span', 'hangar-card-detail', str('surfaces.detail', { cf: number(t.cf * 100), deg: number(t.throwDeg) })));
    if (t.dKg > 0) {
      b.append(el('span', 'hangar-card-detail', str('surfaces.servo_grams', { n: number(t.dKg * 1000) })));
    }
    const trial = { ...st.tiers, [key]: t.tier };
    const on2 = () => show(trial);
    const off = () => show(st.tiers);
    b.addEventListener('pointerenter', on2);
    b.addEventListener('focus', on2);
    b.addEventListener('pointerleave', off);
    b.addEventListener('blur', off);
    b.addEventListener('click', () => {
      st.tiers = { ...st.tiers, [key]: t.tier };
      show(st.tiers);
      hangar.changed(b.dataset.key);
    });
    if (i > 0) {
      hangar.lockMark(b, 'surface', unlockId(key, t.tier));
    }
    cards.append(b);
  });
  box.append(cards);
}

registerHangarTab({
  id: 'surfaces',
  focus: 'overview',
  open(hangar, settings) {
    const id = hangar.id;
    const saved = normaliseTiers(settings.surfaces && settings.surfaces[id], id);
    st = { id, settings, saved, tiers: { ...saved }, offered: Boolean(SURFACES[id]) };
  },
  close() {
    if (st) {
      previewSurfaces(st.id, undefined);
    }
    st = null;
  },
  dirty() {
    return Boolean(st && st.offered && !same(st.tiers, st.saved));
  },
  reset() {
    if (st && st.offered) {
      st.tiers = { a: 'stock', e: 'stock', r: 'stock' };
      show(st.tiers);
    }
  },
  /* The bigger servos' grams, for the spec sheet's weight. */
  grams() {
    return st && st.offered ? tierPoints(st.id, st.tiers).reduce((a, p) => a + p.kg * 1000, 0) : 0;
  },
  save() {
    if (!st || !st.offered || same(st.tiers, st.saved)) {
      return null;
    }
    return { surfaces: normaliseSurfaces({ ...(st.settings.surfaces ?? {}), [st.id]: st.tiers }) };
  },
  paint(hangar) {
    const box = el('div', 'hangar-tab surfaces-tab');
    if (!st || !st.offered) {
      box.append(el('p', 'hangar-note', str('surfaces.none_here')));
      return box;
    }
    box.append(el('h3', 'hangar-h', str('surfaces.title')));
    box.append(el('p', 'hangar-note', str('surfaces.lead')));
    for (const key of SURFACE_KEYS) {
      row(hangar, box, key);
    }
    statBlock(box);
    return box;
  },
});
