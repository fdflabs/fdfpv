/*
 * board.js: the Interior's map as the operations room's BOARD draws it
 * (docs/campaign/interior/TECH-NEEDS.md N18, INTROS.md section 0): every
 * layer a film may show, built from WORLD's own data (src/share/interior/
 * places.js, hydro.js), so the BOARD's roads, river, bridge and clearing
 * are where the land has them. Data only; the drawer is src/render/
 * filmboard.js, which knows the kinds and nothing of the Interior.
 *
 * A LAYER is { kind, items, style }:
 *   raster  the land cover, painted by the screen from the world's bytes
 *           (src/render/interiorfilms.js landRaster); no items
 *   line    items [{ points: [[x, z]...] }]
 *   box     items [{ at: [x, z], r, name }]: a square of half side r
 *   ring    items [{ at, r, name? }]: a dashed circle
 *   point   items [{ at, name }]: a dot and its name
 *   tick    items [{ at, name? }]: a mark that appears when ticked
 *   dot     items [{ at }]: a contact's dot, pulsing
 * `name` is a string key (src/strings, en and es). `style` names one of
 * the drawer's colours: water, road, sector, place, mark, alert, forest.
 *
 * The towers, the construction and the vehicles ticked in the intro's
 * fifth shot ("Roads. Bridges. Towers. Construction. Vehicles.") are map
 * symbols of the survey's brief, not things the world draws: the BOARD
 * is the room's picture of the region, as a real one would be.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { HALF, gridToWorld } from '../frame.js';
import { RIVER, STREAMS } from '../hydro.js';
import {
  BRIDGES, BUILDINGS, CROSSINGS, PLACES, ROADS,
} from '../places.js';
import { M3_AT } from '../routes.js';

/* Every k-th point of a long line, its ends kept: the BOARD draws the
 * river at a few pixels a point, not the hydrology's 20 m. */
function thin(points, k) {
  const out = points.filter((p, i) => i % k === 0);
  if (out[out.length - 1] !== points[points.length - 1]) {
    out.push(points[points.length - 1]);
  }
  return out;
}

/* Streams big enough to read on the BOARD, km2 of catchment. */
const STREAM_KM2 = 10;
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const building = (id) => BUILDINGS.find((b) => b.id === id).at;
/* Mission 3's UNKNOWN contacts round Puesto Arenal as its intro lights
 * them (INTROS.md M3 shots 5 and 6): where its stage 1 starts them. */
const M3_DOTS = [M3_AT.farmhouse, M3_AT.checkpoint, [4.25, 13.5], M3_AT.obsA, M3_AT.field, M3_AT.obsB, [3.85, 14.2], M3_AT.meet]
  .map(([e, n]) => ({ at: gridToWorld(e, n) }));

export const BOARD_MAP = Object.freeze({
  /* The ground the land's picture covers: the data's whole square, a
   * little past the played one, so a view near its edge is still land. */
  bounds: [[-HALF, -HALF], [HALF, HALF]],
  layers: {
    land: { kind: 'raster', style: 'land' },
    river: {
      kind: 'line',
      style: 'water',
      items: [{ points: thin(RIVER.points, 6) }, ...STREAMS.filter((s) => s.km2 >= STREAM_KM2).map((s) => ({ points: thin(s.points, 4) }))],
    },
    roads: { kind: 'line', style: 'road', items: ROADS.map((r) => ({ points: r.points, name: r.name ?? null })) },
    'roads-tick': { kind: 'line', style: 'mark', items: ROADS.filter((r) => r.name).map((r) => ({ points: r.points })) },
    sectors: {
      kind: 'box',
      style: 'sector',
      items: [PLACES.sectorAlpha, PLACES.sectorBravo, PLACES.sectorCharlie].map((p) => ({ at: p.at, r: p.r, name: p.name })),
    },
    pista: { kind: 'point', style: 'place', items: [{ at: PLACES.pistaCero.at, name: PLACES.pistaCero.name }] },
    bridges: {
      kind: 'tick',
      style: 'mark',
      items: [...BRIDGES.map((b) => ({ at: mid(b.from, b.to), name: b.name })), ...CROSSINGS.map((c) => ({ at: c.at }))],
    },
    towers: {
      kind: 'tick',
      style: 'mark',
      items: [{ at: gridToWorld(9.58, 6.34), name: 'interior.board.tower' }, { at: gridToWorld(6.9, 5.25), name: 'interior.board.tower' }],
    },
    construction: {
      kind: 'tick',
      style: 'mark',
      items: [{ at: building('alpha-silo'), name: 'interior.board.works' }, { at: gridToWorld(7.75, 6.5), name: 'interior.board.works' }],
    },
    vehicles: {
      kind: 'tick',
      style: 'mark',
      items: [{ at: gridToWorld(7.4, 6.02), name: 'interior.board.vehicle' }, { at: gridToWorld(4.6, 4.45), name: 'interior.board.vehicle' }],
    },
    settlements: {
      kind: 'point',
      style: 'place',
      items: [PLACES.coloniaArroyoManso, PLACES.pistaCero, PLACES.puenteDoble].map((p) => ({ at: p.at, name: p.name })),
    },
    forest: { kind: 'ring', style: 'forest', items: [{ at: PLACES.monteCerrado.at, r: PLACES.monteCerrado.r * 0.55, name: PLACES.monteCerrado.name }] },
    camp: { kind: 'dot', style: 'alert', items: [{ at: PLACES.claroViejo.at }] },
    /* Mission 2's (INTROS.md M2): the places a watcher could see the road
     * from, a line from each to the camp they warned; both camps, named;
     * the remote post whose alarm ends the mission (Mission 3's `post`). */
    'm2-zones': {
      kind: 'tick',
      style: 'mark',
      items: [PLACES.cruceTranquera, PLACES.lomaDelVigia, PLACES.corralViejo].map((p) => ({ at: p.at, name: p.name })),
    },
    'm2-sight': {
      kind: 'line',
      style: 'mark',
      items: [PLACES.cruceTranquera, PLACES.lomaDelVigia, PLACES.corralViejo].map((p) => ({ points: [p.at, PLACES.claroViejo.at] })),
    },
    'm2-camps': {
      kind: 'point',
      style: 'place',
      items: [PLACES.claroViejo, PLACES.claroNuevo].map((p) => ({ at: p.at, name: p.name })),
    },
    'm2-arenal': { kind: 'dot', style: 'alert', items: [{ at: gridToWorld(...M3_AT.post), name: 'interior.place.puesto_arenal' }] },
    post: { kind: 'point', style: 'place', items: [{ at: gridToWorld(...M3_AT.post), name: 'interior.place.puesto_arenal' }] },
    'post-unknown': { kind: 'dot', style: 'mark', items: M3_DOTS },
    'post-find': { kind: 'dot', style: 'mark', items: M3_DOTS.slice(0, 1) },
    'post-follow': { kind: 'dot', style: 'mark', items: M3_DOTS.slice(0, 3) },
    'post-identify': { kind: 'dot', style: 'mark', items: M3_DOTS.slice(0, 5) },
  },
});
