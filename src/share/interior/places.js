/*
 * places.js: what the Interior's story put on the land, for Mission 1's
 * corridor (docs/campaign/interior/MISSIONS.md 1.9 and M1): every place,
 * road, bridge, building, opening in the forest and painting over the
 * land cover, authored once and read by the room and every screen.
 *
 * INVENTED, ALL OF IT. The land under it is real (world.js); the names
 * are BIBLE.md section 2's and nothing else, and the roads, buildings
 * and openings are where this file puts them, not where anything stands
 * on the source's ground. A `name` is a string key (src/strings, en and
 * es: interior.place.*); scripts/interior-names.js holds every English
 * one to the BIBLE's list.
 *
 * POSITIONS are written in MISSIONS.md's design grid (km east, km north
 * of the played square's south west corner, frame.js gridToWorld) because
 * the plan is written in it, and exported in world metres, [x, z], frame
 * Y up. Where the real land would not take a place where 1.9 put it, it
 * moved, and docs/campaign/interior/WORLD.md lists each move and why; the
 * room reads positions from here, never from the table.
 *
 * A direction is a unit vector [dx, dz] in world metres (the long axis
 * of a building, a bridge's run), made from two points by dirOf, so this
 * file carries no angle and needs no trigonometry: the room may read
 * anything here and get the same answer to the bit on every engine.
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

import { gridToWorld } from './frame.js';
import { LAND } from './world.js';

const g = gridToWorld;
const path = (pts) => pts.map(([e, n]) => g(e, n));

/* The unit vector from a to b, world [dx, dz]. */
export function dirOf(a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l = Math.sqrt(dx * dx + dz * dz);
  return [dx / l, dz / l];
}

/* The nearest point of a polyline to (x, z): { d, x, z, seg, t, dir }. */
export function nearestOnLine(points, x, z) {
  let best = null;
  for (let k = 0; k + 1 < points.length; k += 1) {
    const [ax, az] = points[k];
    const [bx, bz] = points[k + 1];
    const ux = bx - ax;
    const uz = bz - az;
    const l2 = ux * ux + uz * uz;
    let t = l2 > 0 ? ((x - ax) * ux + (z - az) * uz) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + ux * t;
    const pz = az + uz * t;
    const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (!best || d2 < best.d2) {
      best = {
        d2, x: px, z: pz, seg: k, t,
      };
    }
  }
  const [ax, az] = points[best.seg];
  const [bx, bz] = points[best.seg + 1];
  return { ...best, d: Math.sqrt(best.d2), dir: dirOf([ax, az], [bx, bz]) };
}

/* Point in polygon ([[x, z]]), even odd. */
export function inPolygon(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/*
 * THE NAMED PLACES. `name` is the BIBLE's (shown only where the story
 * shows it: the BOARD, a card); `at` world [x, z]; `r` metres, the place's
 * reach where it has one. Missions 2 to 5's places are added when they are
 * built (TECH-NEEDS N1): this is Mission 1's corridor.
 */
/*
 * MISSION 2's PLACES (MISSIONS.md M2): where they stand on the design
 * grid (km), * MISSIONS 1.9's first layout, each moved to the nearest ground the
 * canopy leaves open from seven of eight sides at 250 m (a watcher hid
 * under a crown is never found). The three watcher zones, Claro Nuevo
 * and the handoffs sit within 2 km of Estancia La Ceniza so a run fits
 * the mission's 25 to 35 minutes (lead decision 2026-10-08: 1.9's zones
 * made it 39 to 43). Estancia La Ceniza's buildings are
 * BUILDINGS', Claro Nuevo's camp NUEVO_PROPS.
 */
export const M2_AT = {
  cruce: [11.575, 11.4],
  loma: [12.4, 13.2],
  corral: [13.7, 11.05],
  handoffN: [13.675, 12.625],
  handoffS: [13.625, 12.225],
  postA: [13.35, 12.725],
  estancia: [13.95, 12.475],
  yard: [13.95, 12.44],
  gate: [14.07, 12.6],
  claroNuevo: [14.7, 13.225],
  nuevoEdge: [14.62, 13.15],
};

export const PLACES = {
  pistaCero: { name: 'interior.place.pista_cero', at: g(3.0, 2.0), r: 250 },
  rutaVieja: { name: 'interior.place.ruta_vieja' },
  rioSereno: { name: 'interior.place.rio_sereno' },
  puenteDoble: { name: 'interior.place.puente_doble', at: g(5.6, 7.735), r: 60 },
  sectorAlpha: { name: 'interior.place.sector_alpha', at: g(5.4, 4.8), r: 1600 },
  sectorBravo: { name: 'interior.place.sector_bravo', at: g(9.25, 6.15), r: 900 },
  sectorCharlie: { name: 'interior.place.sector_charlie', at: g(8.8, 9.0), r: 1000 },
  coloniaArroyoManso: { name: 'interior.place.colonia_arroyo_manso', at: g(9.35, 6.18), r: 420 },
  arroyoManso: { name: 'interior.place.arroyo_manso' },
  teacherHouse: { name: 'interior.place.teacher_house', at: g(9.43, 6.355), r: 25 },
  monteCerrado: { name: 'interior.place.monte_cerrado', at: g(10.5, 10.5), r: 4000 },
  canada: { name: 'interior.place.canada', at: g(9.25, 9.2), r: 400 },
  claroViejo: { name: 'interior.place.claro_viejo', at: g(8.58, 9.455), r: 32 },
  /* Where Stage 3's pair is spawned once a pilot crosses the corridor
   * (MISSIONS M1 stage 3): the forest's edge on the cañada's west side. */
  anomalyCorridor: {
    name: 'interior.place.anomaly_corridor',
    box: [g(8.7, 8.95), g(9.6, 7.95)],
  },
  /* The square a pilot may fly in before the boundary warns
   * (MISSIONS 1.7): the played square, less a margin. */
  boundary: { name: 'interior.place.boundary', warn: 7600, final: 7900 },
  /* Mission 2's (M2_AT). */
  cruceTranquera: { name: 'interior.place.cruce_tranquera', at: g(...M2_AT.cruce), r: 300 },
  lomaDelVigia: { name: 'interior.place.loma_del_vigia', at: g(...M2_AT.loma), r: 300 },
  corralViejo: { name: 'interior.place.corral_viejo', at: g(...M2_AT.corral), r: 300 },
  estanciaLaCeniza: { name: 'interior.place.estancia_la_ceniza', at: g(...M2_AT.estancia), r: 60 },
  claroNuevo: { name: 'interior.place.claro_nuevo', at: g(...M2_AT.claroNuevo), r: 32 },
};

/*
 * THE ROADS, as drawn and as the canopy opens over them: { id, name?,
 * width m, surface, points [[x, z]] }. Ruta Vieja runs south west to
 * north east and crosses Río Sereno on Puente Doble; the colonia's road
 * leaves it in Sector Alpha for Colonia Arroyo Manso and runs on east.
 */
export const ROADS = [
  {
    id: 'ruta-vieja',
    name: 'interior.place.ruta_vieja',
    width: 7,
    surface: 'earth',
    points: path([
      [-0.6, 2.25], [0.4, 2.35], [1.4, 2.5], [2.25, 2.62], [2.95, 2.85], [3.55, 3.25], [4.15, 3.85], [4.6, 4.45],
      [4.98, 5.1], [5.28, 5.85], [5.45, 6.6], [5.56, 7.25], [5.6, 7.62], [5.61, 7.85], [5.64, 8.2], [5.86, 8.75],
      [6.4, 9.3], [7.3, 9.88], [8.2, 10.2], [8.9, 10.52], [9.5, 10.68], [9.85, 10.98], [10.5, 11.38], [11.3, 11.7],
      [12.2, 12.0], [13.5, 12.48], [14.8, 12.95], [16.6, 13.5],
    ]),
  },
  {
    id: 'colonia-road',
    width: 5.5,
    surface: 'earth',
    points: path([
      [5.28, 5.85], [5.8, 5.9], [6.6, 5.96], [7.4, 6.02], [8.1, 6.06], [8.6, 6.1], [8.86, 6.13], [9.1, 6.16],
      [9.45, 6.16], [9.8, 6.12], [10.3, 6.02], [10.9, 5.75], [11.45, 5.2], [11.9, 4.4], [12.3, 3.3], [12.6, 1.9],
      [12.9, -0.6],
    ]),
  },
  {
    id: 'pista-cero-track',
    width: 4,
    surface: 'earth',
    points: path([[2.42, 2.64], [2.55, 2.4], [2.72, 2.12], [2.9, 2.02]]),
  },
  {
    id: 'alpha-sheds-track',
    width: 4,
    surface: 'earth',
    points: path([[4.86, 4.85], [5.1, 4.86], [5.36, 4.84], [5.46, 4.84]]),
  },
];

/* The bridge: a two span concrete road bridge (TECH-NEEDS M1 assets),
 * its deck from `from` to `to` (world [x, z]) at deckY, width m. */
const BRIDGE_FROM = g(5.597, 7.665);
const BRIDGE_TO = g(5.612, 7.81);
export const BRIDGES = [
  {
    id: 'puente-doble',
    name: 'interior.place.puente_doble',
    from: BRIDGE_FROM,
    to: BRIDGE_TO,
    dir: dirOf(BRIDGE_FROM, BRIDGE_TO),
    width: 8,
    deckY: 246.2,
    deckThick: 1.1,
    spans: 2,
    rail: 1.0,
  },
];

/* The colonia's road crossing Arroyo Manso: a low concrete causeway
 * (MISSIONS M1 stage 2's "river crossing at the colonia"). */
export const CROSSINGS = [
  { id: 'bravo-crossing', name: 'interior.place.arroyo_manso', at: g(8.86, 6.13), dir: dirOf(g(8.6, 6.1), g(9.1, 6.16)), width: 6, length: 16 },
];

/*
 * BUILDINGS: { id, kind, at [x, z], dir [dx, dz] (the long axis), w along
 * dir, d across, h to the eaves, roof 'gable' | 'shed' | 'flat' | 'none',
 * ridge m over the eaves, colour }. The colonia's houses face its road.
 */
function onRoad(id, e, n, side, setback) {
  const road = ROADS.find((r) => r.id === id).points;
  const [x, z] = g(e, n);
  const near = nearestOnLine(road, x, z);
  const [dx, dz] = near.dir;
  /* The left normal of the road's run, so side 1 is north of an eastward road. */
  return {
    at: [near.x + dz * side * setback, near.z - dx * side * setback],
    dir: near.dir,
  };
}

const HOUSE_COLOURS = ['#c9b79a', '#d8cdb8', '#b9a07c', '#e1d6c2', '#c4a98a', '#a9b3a0'];
function colonia() {
  const out = [];
  const lots = [
    [9.02, 1, 34], [9.08, -1, 30], [9.14, 1, 40], [9.2, -1, 36], [9.27, 1, 32], [9.33, -1, 44], [9.4, 1, 30],
    [9.48, -1, 34], [9.55, 1, 38], [9.6, -1, 30], [9.67, 1, 34], [9.74, -1, 40], [9.8, 1, 32], [9.86, -1, 36],
    [8.98, -1, 46], [9.22, 1, 92], [9.62, 1, 86],
  ];
  lots.forEach(([e, side, back], k) => {
    const { at, dir } = onRoad('colonia-road', e, 6.14, side, back);
    out.push({
      id: `colonia-house-${k}`, kind: 'house', at, dir, w: 9 + (k % 3), d: 6.5 + (k % 2), h: 2.7, roof: 'hip', ridge: 1.6, colour: HOUSE_COLOURS[k % HOUSE_COLOURS.length],
    });
  });
  const school = onRoad('colonia-road', 9.36, 6.14, -1, 42);
  out.push({
    id: 'colonia-school', kind: 'school', at: school.at, dir: school.dir, w: 22, d: 8, h: 3.2, roof: 'hip', ridge: 1.8, colour: '#e3dccb',
  });
  const store = onRoad('colonia-road', 9.18, 6.14, 1, 14);
  out.push({
    id: 'colonia-store', kind: 'store', at: store.at, dir: store.dir, w: 10, d: 7, h: 3, roof: 'shed', ridge: 0.8, colour: '#d6c6a4',
  });
  out.push({
    id: 'teacher-house', kind: 'house', at: PLACES.teacherHouse.at, dir: dirOf(g(9.36, 6.42), g(9.49, 6.49)), w: 10, d: 7, h: 2.8, roof: 'hip', ridge: 1.7, colour: '#d9c9a9',
  });
  return out;
}

const PISTA_DIR = dirOf(g(2.75, 1.95), g(3.25, 2.05));
/* Metres east and north of Estancia La Ceniza's house, in the scene. */
const estancia = (e, n) => {
  const [x, z] = g(...M2_AT.estancia);
  return [x + e, z - n];
};
export const BUILDINGS = [
  ...colonia(),
  /* Pista Cero: the container, the tent, the catapult's trailer. */
  {
    id: 'pista-container', kind: 'container', at: g(2.93, 2.06), dir: PISTA_DIR, w: 6.06, d: 2.44, h: 2.59, roof: 'flat', ridge: 0, colour: '#56604a',
  },
  {
    id: 'pista-tent', kind: 'tent', at: g(2.955, 2.075), dir: PISTA_DIR, w: 6, d: 4.5, h: 1.9, roof: 'hip', ridge: 1.2, colour: '#6b6a4e',
  },
  /* Sector Alpha's agricultural structure: a silo and two open sheds. */
  {
    id: 'alpha-silo', kind: 'silo', at: g(5.488, 4.858), dir: [1, 0], w: 7, d: 7, h: 12, roof: 'cone', ridge: 2.4, colour: '#b8bcbf',
  },
  {
    id: 'alpha-shed-1', kind: 'openshed', at: g(5.47, 4.83), dir: [1, 0], w: 30, d: 14, h: 6, roof: 'gable', ridge: 2.2, colour: '#9aa0a3',
  },
  {
    id: 'alpha-shed-2', kind: 'openshed', at: g(5.51, 4.825), dir: [0, 1], w: 24, d: 12, h: 5.5, roof: 'shed', ridge: 1.2, colour: '#8d9396',
  },
  /* Estancia La Ceniza (MISSIONS M2 stage 3): the old house, its walls
   * gone to posts and its roof half off, so the recon quad flies in to
   * the stash, the radio and the notes; the farm shed beside the yard. */
  {
    id: 'estancia-house', kind: 'openshed', at: g(...M2_AT.estancia), dir: [1, 0], w: 12, d: 8, h: 3.2, roof: 'shed', ridge: 0.9, colour: '#b9a988',
  },
  {
    id: 'estancia-shed', kind: 'openshed', at: g(13.972, 12.448), dir: [0, 1], w: 10, d: 7, h: 4, roof: 'gable', ridge: 1.4, colour: '#8f8a80',
  },
  /* Inside the house, what the recon quad documents (interior-2.js's
   * stash, radio and notes, metres east and north of the house's middle
   * there): the battery boxes, the radio set on its crates, the notes
   * pinned to a board on a post. */
  {
    id: 'estancia-stash', kind: 'crate', at: estancia(0, 0), dir: [1, 0], w: 0.9, d: 0.6, h: 0.5, roof: 'flat', ridge: 0, colour: '#2f3a2c',
  },
  {
    id: 'estancia-radio', kind: 'crate', at: estancia(3, 2), dir: [1, 0], w: 0.55, d: 0.4, h: 1.05, roof: 'flat', ridge: 0, colour: '#24272a',
  },
  {
    id: 'estancia-notes', kind: 'crate', at: estancia(-2, 3), dir: [1, 0], w: 0.9, d: 0.08, h: 1.9, roof: 'flat', ridge: 0, colour: '#8a7a5c',
  },
];

/*
 * THE CAMP AT CLARO VIEJO (MISSIONS M1 stage 5): four shelters of poles
 * and tarps round the clearing, one of three carrying the Column's mark
 * under its roof (a dial), the mast, the solar panel, the motorcycles,
 * the lookout's platform in a tree at the north edge. Positions are
 * offsets in metres from the clearing's middle, x east, z south.
 */
const CAMP = PLACES.claroViejo.at;
const camp = (ox, oz) => [CAMP[0] + ox, CAMP[1] + oz];
export const CAMP_PROPS = {
  middle: CAMP,
  shelters: [
    { id: 'shelter-1', at: camp(-14, -8), dir: dirOf([0, 0], [3, 1]), w: 6, d: 4.5, h: 1.9, markable: true },
    { id: 'shelter-2', at: camp(13, -10), dir: dirOf([0, 0], [3, -2]), w: 5.5, d: 4, h: 1.8, markable: true },
    { id: 'shelter-3', at: camp(10, 13), dir: dirOf([0, 0], [1, 0]), w: 6, d: 4, h: 2.0, markable: true },
    { id: 'shelter-4', at: camp(-12, 12), dir: dirOf([0, 0], [2, 1]), w: 5, d: 4, h: 1.8, markable: false },
  ],
  /* The one tarp a person moves (camp-tarp's route), on the marked shelter. */
  mast: { id: 'camp-mast', at: camp(2, -16), h: 9 },
  solar: { id: 'camp-solar', at: camp(-4, -15), dir: dirOf([0, 0], [0, -1]), w: 1.6, d: 1.0 },
  lookout: { id: 'camp-lookout', at: camp(1, -31), deckY: 7.5, w: 2.4 },
  fire: { id: 'camp-fire', at: camp(1, 2) },
  motorcycles: [
    { id: 'camp-moto-1', at: camp(-20, 2), dir: dirOf([0, 0], [1, 2]) },
    { id: 'camp-moto-2', at: camp(-21, 5), dir: dirOf([0, 0], [1, 2]) },
    { id: 'camp-moto-3', at: camp(19, 3), dir: dirOf([0, 0], [-1, 3]) },
    { id: 'camp-moto-4', at: camp(20, 6), dir: dirOf([0, 0], [-1, 3]) },
  ],
  drums: [camp(6, -6), camp(7.2, -5.4), camp(6.4, -4.4)],
  crates: [camp(-7, 6), camp(-6, 7.2), camp(-8.2, 7.4), camp(15, -4)],
  hammocks: [
    { from: camp(-17, -3), to: camp(-12, -2) },
    { from: camp(16, 9), to: camp(18, 14) },
  ],
};

/*
 * THE SECOND CAMP AT CLARO NUEVO (MISSIONS M2 stage 4): CAMP_PROPS' shape
 * (its shelters keep CAMP_PROPS' ids: camp.js dresses them by id),
 * spread over the clearing east of its middle (the forest stands west),
 * spaced wider and kept tidier, with no mark under any roof; the newer
 * radio's mast, three newer motorcycles. Offsets as Claro Viejo's.
 */
const NUEVO = g(...M2_AT.claroNuevo);
const nuevo = (ox, oz) => [NUEVO[0] + ox, NUEVO[1] + oz];
export const NUEVO_PROPS = {
  middle: NUEVO,
  shelters: [
    { id: 'shelter-1', at: nuevo(-4, -24), dir: dirOf([0, 0], [1, 0]), w: 6, d: 4.5, h: 2.0, markable: false },
    { id: 'shelter-2', at: nuevo(26, -22), dir: dirOf([0, 0], [1, 0]), w: 6, d: 4.5, h: 2.0, markable: false },
    { id: 'shelter-3', at: nuevo(24, 6), dir: dirOf([0, 0], [1, 0]), w: 6, d: 4.5, h: 2.0, markable: false },
    { id: 'shelter-4', at: nuevo(0, 14), dir: dirOf([0, 0], [1, 0]), w: 6, d: 4.5, h: 2.0, markable: false },
  ],
  mast: { id: 'nuevo-mast', at: nuevo(10, -30), h: 11 },
  solar: { id: 'nuevo-solar', at: nuevo(14, -29), dir: dirOf([0, 0], [0, -1]), w: 1.8, d: 1.1 },
  lookout: { id: 'nuevo-lookout', at: nuevo(15, -40), deckY: 7.5, w: 2.4 },
  fire: { id: 'nuevo-fire', at: nuevo(10, 0) },
  motorcycles: [
    { id: 'nuevo-moto-1', at: nuevo(13, 16), dir: dirOf([0, 0], [1, 0]) },
    { id: 'nuevo-moto-2', at: nuevo(15, 17), dir: dirOf([0, 0], [1, 0]) },
    { id: 'nuevo-moto-3', at: nuevo(17, 18), dir: dirOf([0, 0], [1, 0]) },
  ],
  drums: [nuevo(25, -5), nuevo(25.8, -3.8)],
  crates: [nuevo(29, 1), nuevo(30.2, 1.4)],
  hammocks: [],
};

/*
 * THE FOREST'S OPENINGS (canopy.js): no crown stands over these, so a
 * line of sight from the air into them is open where the forest's height
 * allows. A circle { id, at, r } or a strip { id, points, width }. The
 * concealment routes' gaps, clearings and narrow opening, the old logging
 * cut they cross (the path crossing), the camp's clearing and its access
 * path, and every road through the forest. The cañada needs none: it is
 * open pasture in the land cover itself.
 */
export const OPENINGS = [
  { id: 'claro-viejo', at: CAMP, r: 30 },
  /* Pista Cero's strip and recovery field, kept clear for the launch
   * and the parachute. */
  { id: 'pista-cero', at: g(3.0, 1.98), r: 260 },
  { id: 'narrow-opening', points: path([[8.655, 9.33], [8.632, 9.385]]), width: 7 },
  { id: 'picada', points: path([[9.09, 9.06], [8.85, 9.04], [8.6, 8.99], [8.35, 8.9], [8.1, 8.74], [7.92, 8.58]]), width: 5 },
  /* An older, narrower cut north of the mid route's clearing: its
   * alternate reacquisition point (routes.js ALT) is where it crosses. */
  { id: 'picada-norte', points: path([[8.98, 9.2], [8.8, 9.235], [8.69, 9.27]]), width: 4 },
  { id: 'camp-access', points: path([[8.565, 9.48], [8.52, 9.62], [8.43, 9.8], [8.33, 9.98], [8.24, 10.15]]), width: 3.5 },
  { id: 'west-gap-1', at: g(8.885, 8.86), r: 9 },
  { id: 'west-clearing', at: g(8.6, 9.17), r: 18 },
  { id: 'west-gap-2', at: g(8.62, 9.27), r: 7 },
  { id: 'mid-gap-1', at: g(8.97, 8.88), r: 8 },
  { id: 'mid-clearing', at: g(8.74, 9.16), r: 17 },
  { id: 'mid-gap-2', at: g(8.69, 9.27), r: 7 },
  { id: 'east-gap-1', at: g(9.03, 8.94), r: 8 },
  { id: 'east-clearing', at: g(8.92, 9.18), r: 16 },
  { id: 'east-gap-2', at: g(8.76, 9.29), r: 7 },
  ...ROADS.map((r) => ({ id: `road-${r.id}`, points: r.points, width: r.width + 2 })),
];

/*
 * PAINTED OVER THE LAND COVER: { cls, circle | polygon | strip }. Pista
 * Cero's cleared strip and recovery field, the burned field in Sector
 * Alpha, the yards of the colonia, the camp's trodden clearing.
 */
const STRIP_A = g(2.78, 1.94);
const STRIP_B = g(3.24, 2.03);
export const LAND_EDITS = [
  { cls: LAND.bare, strip: { points: [STRIP_A, STRIP_B], width: 26 } },
  { cls: LAND.pasture, circle: { at: g(3.12, 1.82), r: 110 } },
  { cls: LAND.burned, polygon: path([[6.02, 5.06], [6.44, 5.12], [6.5, 5.38], [6.31, 5.46], [6.06, 5.33]]) },
  { cls: LAND.bare, circle: { at: CAMP, r: 22 } },
  { cls: LAND.pasture, polygon: path([[8.9, 6.05], [9.95, 6.0], [9.95, 6.32], [9.55, 6.4], [9.1, 6.28], [8.9, 6.2]]) },
  ...BUILDINGS.filter((b) => b.kind === 'house' || b.kind === 'school' || b.kind === 'store')
    .map((b) => ({ cls: LAND.built, circle: { at: b.at, r: b.w * 0.9 } })),
  /* The colonia's football pitch, grass: a rectangle along the road. */
  { cls: LAND.pasture, polygon: path([[9.5, 6.06], [9.57, 6.06], [9.57, 6.02], [9.5, 6.02]]) },
];

/* Buckets of 128 m over the data's square, so a point asks only the
 * openings and edits near it. */
const BUCKET = 128;
function bucketKey(i, j) {
  return i * 4096 + j;
}
function boundsOf(item) {
  if (item.at && item.r != null) {
    return [item.at[0] - item.r, item.at[1] - item.r, item.at[0] + item.r, item.at[1] + item.r];
  }
  const pts = item.points || item.polygon;
  const pad = item.width ? item.width / 2 : 0;
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const [x, z] of pts) {
    x0 = Math.min(x0, x);
    z0 = Math.min(z0, z);
    x1 = Math.max(x1, x);
    z1 = Math.max(z1, z);
  }
  return [x0 - pad, z0 - pad, x1 + pad, z1 + pad];
}
function bucketed(items, reach) {
  const map = new Map();
  for (const it of items) {
    const [x0, z0, x1, z1] = boundsOf(it);
    for (let i = Math.floor((x0 - reach) / BUCKET); i <= Math.floor((x1 + reach) / BUCKET); i += 1) {
      for (let j = Math.floor((z0 - reach) / BUCKET); j <= Math.floor((z1 + reach) / BUCKET); j += 1) {
        const k = bucketKey(i + 2048, j + 2048);
        if (!map.has(k)) {
          map.set(k, []);
        }
        map.get(k).push(it);
      }
    }
  }
  return (x, z) => map.get(bucketKey(Math.floor(x / BUCKET) + 2048, Math.floor(z / BUCKET) + 2048)) || null;
}

/* The widest crown canopy.js plants, so an opening's bucket reaches
 * every tree whose crown could overhang it. */
const CROWN_REACH = 8;
const openingsNear = bucketed(OPENINGS, CROWN_REACH);
const editsNear = bucketed(
  LAND_EDITS.map((e) => ({
    ...e, at: e.circle && e.circle.at, r: e.circle && e.circle.r, points: e.strip && e.strip.points, width: e.strip && e.strip.width, polygon: e.polygon,
  })),
  0,
);

/* How far inside an opening (x, z) is: positive inside, metres. */
function insideBy(o, x, z) {
  if (o.r != null && o.at) {
    const dx = x - o.at[0];
    const dz = z - o.at[1];
    return o.r - Math.sqrt(dx * dx + dz * dz);
  }
  return o.width / 2 - nearestOnLine(o.points, x, z).d;
}

/* Whether a crown of radius r centred at (x, z) would overhang an
 * opening: the crown's edge reaches within 15 % of its radius of it. */
export function opened(x, z, r) {
  const near = openingsNear(x, z);
  if (!near) {
    return false;
  }
  for (const o of near) {
    if (insideBy(o, x, z) > -0.85 * r) {
      return true;
    }
  }
  return false;
}

/* The land class at (x, z) once this file has painted over it: the
 * edits in order, the last that covers the point winning. world.js
 * makeWorld's `edits`. */
export function landEdit(x, z, cls) {
  const near = editsNear(x, z);
  if (!near) {
    return cls;
  }
  let out = cls;
  for (const e of near) {
    const hit = e.polygon ? inPolygon(e.polygon, x, z) : insideBy(e, x, z) >= 0;
    if (hit) {
      out = e.cls;
    }
  }
  return out;
}

/* The string key of every name this file gives a player to read, for
 * the name lint. */
export const NAMES = [
  ...Object.values(PLACES).map((p) => p.name),
  ...ROADS.filter((r) => r.name).map((r) => r.name),
  ...BRIDGES.map((b) => b.name),
  ...CROSSINGS.map((c) => c.name),
];
