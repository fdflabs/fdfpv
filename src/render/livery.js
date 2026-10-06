/*
 * livery.js: a plane's paint, on the materials its builder made.
 *
 * Every plane builder (src/render/*craft.js) colours its model by material,
 * one material per colour of the real aircraft's scheme. A LIVERY is a
 * colour per named region of that scheme (configs/liveries.js): the wing,
 * the fuselage, the tail, the trim. So a builder hands each region's
 * materials to paintRegions() below as it makes them, and the craft it
 * returns carries `livery`, which sets and reads those colours and hands
 * the paint shop each region's materials for its finish.
 *
 * A region has BASE materials, which take the region's colour as it is,
 * and SHADE materials, the slightly darker covering a builder puts on the
 * moving surfaces so the hinge line reads. A shade keeps its stock
 * brightness against the base: it is the new colour times the stock
 * shade's luminance over the stock base's, in linear light.
 *
 * STOCK IS EXACT. A region whose colour is its stock colour, or has none
 * given, puts every material back on the very hex it was built with, so
 * the default look is the builder's own and not a colour computed back
 * from a ratio.
 *
 * The Kadet's translucent film is baked into maps, not a material colour,
 * and its builder keeps the same `livery` contract with its own setter
 * (src/render/kadetcraft.js).
 *
 * WHICH LIVERY A NEW MODEL WEARS is asked of the source the shell sets
 * (setLiverySource): the flown craft, the picker's and the hangar's models
 * and the title's aircraft are all built through it, and the ghost is not
 * (src/render/ghostcraft.js paints it one flat hologram).
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

import * as THREE from 'three';
import { dressDecals } from './decals.js';
import { dressFinish } from './finish.js';

function luminance(c) {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/*
 * The region table a builder fills. base(id, mat) and shade(id, mat) return
 * the material, so a builder can write `const wing = paint.base('wing',
 * cel({...}))`. A region's first base names its stock colour and every
 * other base in it must be built in that same colour, because a region is
 * one colour of the scheme; a shade must come after its region's base.
 */
export function paintRegions() {
  const regions = new Map();
  function region(id) {
    let r = regions.get(id);
    if (!r) {
      r = { stock: null, base: [], shade: [] };
      regions.set(id, r);
    }
    return r;
  }
  function base(id, mat) {
    const r = region(id);
    const hex = mat.color.getHex();
    if (r.stock === null) {
      r.stock = hex;
    } else if (hex !== r.stock) {
      throw new Error(`livery: region ${id} is one colour, and a base was built in another`);
    }
    r.base.push({ mat, stock: hex });
    return mat;
  }
  function shade(id, mat) {
    const r = regions.get(id);
    if (!r || r.stock === null) {
      throw new Error(`livery: a shade of ${id} before its base`);
    }
    const k = luminance(mat.color) / Math.max(1e-6, luminance(new THREE.Color(r.stock)));
    r.shade.push({ mat, stock: mat.color.getHex(), k });
    return mat;
  }
  const livery = {
    /* Region id to its stock hex, as the builder built it. */
    stock() {
      return Object.fromEntries([...regions].map(([id, r]) => [id, r.stock]));
    },
    /* colours: region id to a 0xRRGGBB number; a region left out, or on
     * its stock colour, goes back to exactly how it was built. */
    set(colours = {}) {
      for (const [id, r] of regions) {
        const want = colours[id];
        if (want === undefined || want === null || want === r.stock) {
          for (const p of [...r.base, ...r.shade]) {
            p.mat.color.setHex(p.stock);
          }
          continue;
        }
        for (const p of r.base) {
          p.mat.color.setHex(want);
        }
        for (const p of r.shade) {
          p.mat.color.setHex(want).multiplyScalar(p.k);
        }
      }
    },
    /* What each region is drawn in now: its first base's colour. */
    read() {
      return Object.fromEntries([...regions].map(([id, r]) => [id, r.base[0].mat.color.getHex()]));
    },
    /* Each region's materials, base and shade, for its finish
     * (src/render/finish.js). */
    materials() {
      return Object.fromEntries([...regions].map(([id, r]) => [id, [...r.base, ...r.shade].map((p) => p.mat)]));
    },
  };
  return { base, shade, livery };
}

/*
 * The shell's answer to "what does this aircraft wear": a function of an
 * airframe id returning its LOOK, { colours, finishes, decals }
 * (configs/liveries.js lookFor: region colours as 0xRRGGBB numbers, the
 * paint shop's finishes and decals), or null for stock. Null until the
 * shell sets it, so a model built by a check or a preview page with no
 * settings is the stock aircraft.
 */
let source = null;

export function setLiverySource(fn) {
  source = typeof fn === 'function' ? fn : null;
}

export function liveryFor(airframeId) {
  return source ? source(airframeId) : null;
}

/* Dress a craft in a look, by default its airframe's: the colours, then
 * the finishes over them (src/render/finish.js), then the decals
 * (src/render/decals.js). A craft without regions (a quad) is left as it
 * is. */
export function dressLivery(craft, airframeId, look = liveryFor(airframeId)) {
  if (craft && craft.livery) {
    craft.livery.set((look && look.colours) ?? {});
    dressFinish(craft, (look && look.finishes) ?? {}, (look && look.wear) || 0);
    dressDecals(craft, (look && look.decals) ?? []);
  }
  return craft;
}
