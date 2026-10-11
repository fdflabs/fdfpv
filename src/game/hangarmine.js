/*
 * hangarmine.js: what makes a pilot's hangar theirs (docs/HANGAR-ROOM.md,
 * "A hangar that's yours"). The room's size is the pilot's level
 * (hangarroom.js tierFor); this says what is in it, from the pilot's own
 * data only: the saved builds (src/ui/builds.js) and the aircraft their
 * level has opened on the bays, and the finishes and decals their wallet
 * owns (tracks-api/wallet.js) on the paint chart. Nothing here is sent
 * anywhere: a visit (src/share/hangarvisit.js) carries none of it, so in
 * a room nobody sees another pilot's builds or wallet.
 *
 * Data only, no three.js and no DOM, so the choice is checked in Node
 * and the room draws exactly what is checked.
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

import { LAYOUTS } from './hangarroom.js';
import { STARTER_PLANES, levelOf, unlockables } from './progress.js';
import { ITEMS } from './economy.js';
import { liveryKey } from '../../configs/liveries.js';

/* How many bays a room has: its layout says, so the two cannot drift. */
export function bayCount(tier) {
  return (LAYOUTS[tier] || []).filter((it) => it.kind === 'bay').length;
}

/* The planes the pilot's level has opened, the newest first (the highest
 * unlock level, then catalogue order), then the starters every pilot
 * has. Everything with Unlock all. */
export function unlockedPlanes(progress) {
  const p = progress || { xp: 0 };
  const level = levelOf(p.xp || 0);
  const opened = unlockables()
    .filter((it) => it.kind === 'plane' && (p.unlockAll || it.level <= level))
    .sort((a, b) => b.level - a.level);
  return [...opened.map((it) => it.id), ...STARTER_PLANES];
}

/*
 * What stands on the bays, in bay order: [{ airframe, build }], build a
 * saved build's id or null for the stock aircraft. The builds first, the
 * last changed first, leaving out the one the seated aircraft wears (it
 * is on the main stand already); then the planes the level opened, the
 * newest first, each family once and none already in the room. A bay
 * with nothing left to hold stays empty.
 */
export function bayFill(n, { seated, worn = null, builds = [], planes = [] }) {
  const out = [];
  const families = new Set([liveryKey(seated)]);
  const recent = [...builds].sort((a, b) => (b.updated || b.created || 0) - (a.updated || a.created || 0));
  for (const b of recent) {
    if (out.length < n && b.id !== worn) {
      out.push({ airframe: b.airframe, build: b.id });
      families.add(liveryKey(b.airframe));
    }
  }
  for (const id of planes) {
    if (out.length < n && !families.has(liveryKey(id))) {
      out.push({ airframe: id, build: null });
      families.add(liveryKey(id));
    }
  }
  return out;
}

/* The paint chart: the shop's finishes and decals this wallet owns, in
 * the shop's order. A wallet of null (signed out, or not asked yet) owns
 * none, and the chart is not hung. */
export function paintChart(wallet) {
  const owned = (wallet && wallet.owned) || {};
  const has = (kind) => ITEMS.filter((it) => it.kind === kind && owned[it.id]).map((it) => it.paint);
  return { finishes: has('finish'), decals: has('decal') };
}
