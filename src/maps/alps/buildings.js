/*
 * buildings.js: what the cel Alps add to the village kit's buildings
 * (src/render/library/kit.js), handed to village.js as the look's
 * `buildings`, the hook swiss2 builds its own houses through. Each
 * wraps the kit's builder and adds to the outside of what it built, on
 * the same frame: no rng drawn, no collider, no roof record, so every
 * house stands where it stood and a craft meets what it met.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { chalet, church, box, SOCLE } from '../../render/library/kit.js';
import { celMaterial } from '../../render/celmat.js';

/* kit.js church's tower and nave heights, which it does not return; the
 * tower's top it does return is these plus the spire and its cross, so
 * a church of other heights fails here rather than dressing the air. */
const TOWER_H = 18;
const NAVE_H = 7;
const SPIRE_AND_CROSS = 15.2;

/*
 * Corner stones up a rendered corner, as the churches of the Bernese
 * Oberland have them: grey blocks, a long face and a short face in
 * turn, three centimetres proud of both walls, from y0 to y1. (cx, cz)
 * is the corner, (sx, sz) the way out of it along x and z.
 */
const QUOIN_H = 0.55;
const QUOIN_LONG = 0.9;
const QUOIN_SHORT = 0.45;
const PROUD = 0.03;
function quoins(f, cx, cz, sx, sz, y0, y1) {
  for (let k = 0; y0 + (k + 1) * QUOIN_H <= y1; k += 1) {
    const ax = k % 2 === 0 ? QUOIN_LONG : QUOIN_SHORT;
    const az = k % 2 === 0 ? QUOIN_SHORT : QUOIN_LONG;
    const y = y0 + (k + 0.5) * QUOIN_H;
    f.put('stone', box(ax, QUOIN_H - 0.04, az), cx + sx * (PROUD - ax / 2), y, cz + sz * (PROUD - az / 2));
  }
}

/*
 * The church with its stonework: corner stones up the tower and the
 * nave, and two cornices round the tower, one under the bell openings
 * (over the clocks) and one under the cap. Rendered walls with nothing
 * on their corners read from the square as a white box with a hat.
 */
function dressedChurch(f, spec) {
  const k = church(f, spec);
  if (Math.abs(k.tower.top - (SOCLE + TOWER_H + SPIRE_AND_CROSS)) > 1e-6) {
    throw new Error(`alps buildings: the kit's church tower is not ${TOWER_H} m; its stonework would float`);
  }
  const { hw, hd } = k;
  const tz = k.tower.z;
  const th = k.tower.half;
  /* The tower's front corners from the ground, its back ones from over
   * the nave's roof where it meets them (pitch 0.95, kit.js church). */
  const behind = SOCLE + NAVE_H + (hw - th) * Math.tan(0.95) + 0.4;
  for (const sx of [-1, 1]) {
    quoins(f, sx * th, tz + th, sx, 1, SOCLE, SOCLE + TOWER_H - 0.4);
    quoins(f, sx * th, tz - th, sx, -1, behind, SOCLE + TOWER_H - 0.4);
    for (const sz of [-1, 1]) {
      quoins(f, sx * hw, sz * hd, sx, sz, SOCLE, SOCLE + NAVE_H - 0.1);
    }
  }
  /* Over the clock rings (6.2 down, 1.3 round) and under the bell
   * openings' frames (2.6 down, 1.2 tall): a stone band between. */
  f.put('stone', box(2 * th + 0.16, 0.24, 2 * th + 0.16), 0, SOCLE + TOWER_H - 4.3, tz);
  f.put('stone', box(2 * th + 0.2, 0.3, 2 * th + 0.2), 0, SOCLE + TOWER_H - 0.17, tz);
  return k;
}

/*
 * Roofs of one age and one colour read, from the air, as a village
 * built in a week. A shingle roof goes from the warm brown of new larch
 * to silver grey in a few winters, and slates come from more than one
 * quarry; each chalet's roof takes one of its kind's tones by where it
 * stands, a hash of its position, so the village is the same on every
 * load and the placer's rng is not drawn. The tones' names keep the
 * kind's prefix, so roofs.js still reads shingle as wood and slate as
 * rock under a craft (roofMaterial).
 */
const ROOF_TONES = {
  shingle: ['shingle', 'shingleSilver', 'shingleWarm'],
  slate: ['slate', 'slateBlue'],
};
export function roofToneMaterials() {
  return {
    shingleSilver: celMaterial({ color: 0x8a857d, rim: 0.12 }),
    shingleWarm: celMaterial({ color: 0x6e5440, rim: 0.12 }),
    slateBlue: celMaterial({ color: 0x343f52, rim: 0.14 }),
  };
}
function roofTone(f, key) {
  const tones = ROOF_TONES[key];
  if (!tones) {
    return key;
  }
  const e = f.m.elements;
  const h = (Math.imul(Math.round(e[12] * 10), 73856093) ^ Math.imul(Math.round(e[14] * 10), 19349663)) >>> 0;
  return tones[(h >>> 7) % tones.length];
}
function tonedChalet(f, rng, spec) {
  return chalet(f, rng, { ...spec, roofKey: roofTone(f, spec.roofKey ?? 'shingle') });
}

/* The look's buildings, over the kit's. */
export const CEL_BUILDINGS = {
  chalet: tonedChalet,
  church: dressedChurch,
};
