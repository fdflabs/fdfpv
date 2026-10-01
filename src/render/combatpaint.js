/*
 * combatpaint.js: the paint hook the combat models hand the garage.
 *
 * The garage (src/ui/hangar.js, another part's) paints a combat model and
 * puts decals on it without reaching into the builder. So every combat
 * builder (src/render/combatcraft.js, src/render/strikercraft.js) fills a
 * paintRegions table (src/render/livery.js) as the other aircraft do, which
 * is what dressLivery, dressFinish and dressDecals already read, and puts
 * on its return `combat.paint`:
 *
 *   regions   the region ids it paints by, each one colour as built;
 *   finishes  the finish ids set() takes: kit (as built), gloss, matte,
 *             carbon (a clear coated dark weave) and aluminium (bare
 *             metal), the last two a colour as well as a finish;
 *   surfaces  where a decal goes: { id, p, n, size, mirror }, a point on
 *             the skin and its outward normal in the craft group's frame,
 *             the largest decal height that stays on that face, and
 *             whether the face has a twin across x = 0 (a decal entry's
 *             `m`). These are configs/paint.js decal entries' p, n and s,
 *             so the garage writes { k, p, n, s, a, r, m } from one;
 *   set({ colours, finish, finishes, wear })
 *             colours: region id to 0xRRGGBB, a region left out on its
 *             finish's colour or its own; finish: one finish id for every
 *             region, finishes: region id to finish id over it; wear: 0
 *             (as built) to 1 (scuffed to primer and dust at the edges of
 *             a colour's reach). Throws on an id it does not know or a
 *             wear outside 0..1, because a garage that sent one has a bug
 *             a quietly unpainted model would hide;
 *   read()    what set() was last given.
 *
 * Wear is a colour, not a texture: each region's colour drawn toward a
 * worn tint by up to WEAR_REACH of the way. It costs nothing a frame and
 * needs no texture layout, which the merged models do not have.
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

import * as THREE from 'three';
import { dressFinish } from './finish.js';

/* Each finish as finish.js's finish and, for the two that are a material
 * as much as a coat, the colour it brings. */
export const COMBAT_FINISHES = {
  kit: { finish: 'kit' },
  gloss: { finish: 'gloss' },
  matte: { finish: 'matte' },
  carbon: { finish: 'gloss', colour: 0x1c1f22 },
  aluminium: { finish: 'metallic', colour: 0xc3c8cd },
};

const WEAR_TINT = new THREE.Color(0x8a8578);
const WEAR_REACH = 0.35;

/*
 * Hang the hook on a built combat model. `craft` is the builder's return
 * (it gains `livery`, as every paintable aircraft has); `coat` the
 * paintRegions() table the builder filled; `surfaces` its decal faces.
 */
export function paintHook(craft, coat, surfaces) {
  const livery = coat.livery;
  const regions = Object.keys(livery.stock());
  let last = { colours: {}, finish: 'kit', finishes: {}, wear: 0 };
  craft.livery = livery;
  function set({ colours = {}, finish = 'kit', finishes = {}, wear = 0 } = {}) {
    const known = (id) => regions.includes(id);
    for (const id of [...Object.keys(colours), ...Object.keys(finishes)]) {
      if (!known(id)) {
        throw new Error(`combatpaint: no region ${JSON.stringify(id)}; this model paints ${regions.join(', ')}`);
      }
    }
    for (const f of [finish, ...Object.values(finishes)]) {
      if (!COMBAT_FINISHES[f]) {
        throw new Error(`combatpaint: no finish ${JSON.stringify(f)}`);
      }
    }
    if (!(wear >= 0 && wear <= 1)) {
      throw new Error(`combatpaint: wear is 0 to 1, not ${wear}`);
    }
    const finishOf = (id) => COMBAT_FINISHES[finishes[id] ?? finish];
    const want = {};
    for (const id of regions) {
      const c = colours[id] ?? finishOf(id).colour;
      if (c !== undefined) {
        want[id] = c;
      }
    }
    livery.set(want);
    dressFinish(craft, Object.fromEntries(regions.map((id) => [id, finishOf(id).finish])));
    if (wear > 0) {
      for (const mats of Object.values(livery.materials())) {
        for (const mat of mats) {
          mat.color.lerp(WEAR_TINT, wear * WEAR_REACH);
        }
      }
    }
    last = { colours: { ...colours }, finish, finishes: { ...finishes }, wear };
    return craft;
  }
  return {
    regions,
    finishes: Object.keys(COMBAT_FINISHES),
    surfaces,
    set,
    read: () => last,
  };
}
