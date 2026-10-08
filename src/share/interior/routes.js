/*
 * routes.js: every authored route a person or a vehicle walks in the
 * Interior's Mission 1 (TECH-NEEDS N3, N4), and where on it each one is
 * at any millisecond: the room's contacts and every screen's figures read
 * the same function, so all of them place a person identically.
 *
 * A ROUTE is data: points (design grid km, places.js's layout), a speed
 * in m/s, dwells { i, s, action } (hold at point i for s seconds doing
 * action), segment actions { from, to, action } (walk the points from..to
 * doing it: carrying a long object, pushing a motorcycle), and how it
 * ends: 'gone' (null from then: into the forest, out of the picture),
 * 'stay' (standing at its last point) or loop. `deck` lifts a route off
 * the ground (the lookout on its platform), metres.
 *
 *   poseOnRoute(routeId, ms)  ms SINCE THE CONTACT STARTED THE ROUTE (the
 *                             room starts routes on events: the pair after
 *                             the corridor is crossed, the dispersal on a
 *                             trigger, an alternate at a hard threshold)
 *                             -> { x, y, z, heading, headingDoc, action }
 *                             in the scene frame (frame.js: y up, z
 *                             south; ops.js turns it to the room's), or
 *                             null once a 'gone' route is over
 *
 * Actions: walk, stand, lookUp, carryLong, sit, crouchTarp,
 * takeDownAntenna, pushMotorcycle (people, TECH-NEEDS N3's Mission 1
 * list), drive and park (vehicles).
 *
 * Arithmetic only on the room's path (+ - * /, Math.sqrt, Math.floor);
 * the headings, which only a screen reads, are worked out once per
 * segment when the routes are made (Math.atan2).
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
import { CAMP_PROPS, PLACES } from './places.js';

export const ACTIONS = [
  'walk', 'stand', 'lookUp', 'carryLong', 'sit', 'crouchTarp', 'takeDownAntenna', 'pushMotorcycle', 'drive', 'park',
];

/* The pair's pace (MISSIONS.md M1 stage 4) and the camp's amble. */
const WALK = 1.3;
const AMBLE = 0.7;

/* A route's points from grid km to scene [x, z], or from camp offsets
 * (metres east, metres south of the clearing's middle). */
const km = (pts) => pts.map(([e, n]) => gridToWorld(e, n));
const [CX, CZ] = CAMP_PROPS.middle;
const camp = (pts) => pts.map(([ox, oz]) => [CX + ox, CZ + oz]);

/*
 * THE PAIR'S CONCEALMENT ROUTES (MISSIONS.md M1 stage 4; the dial picks
 * one): from the forest's edge on the cañada's west side, under the
 * crowns, through two gaps, across the old logging cut (the path
 * crossing), past a small clearing, through the narrow opening where the
 * long objects show, to the camp's edge. Each keeps its own gaps and
 * clearing (places.js OPENINGS: west-, mid-, east-gap-1, -clearing,
 * -gap-2). NAMED[route] gives the point index of each place the mission
 * names, for the room's mission data.
 */
const EDGE = [9.0, 8.72];
const OPEN_A = [8.655, 9.33];
const OPEN_B = [8.632, 9.385];
const CAMP_EDGE = [8.594, 9.428];
const CONCEAL = {
  west: [EDGE, [8.93, 8.8], [8.885, 8.86], [8.8, 8.95], [8.705, 9.016], [8.645, 9.1], [8.6, 9.17], [8.62, 9.27], OPEN_A, OPEN_B, CAMP_EDGE],
  mid: [EDGE, [8.985, 8.8], [8.97, 8.88], [8.9, 8.98], [8.86, 9.035], [8.8, 9.1], [8.74, 9.16], [8.69, 9.27], OPEN_A, OPEN_B, CAMP_EDGE],
  east: [EDGE, [9.015, 8.83], [9.03, 8.94], [9.005, 9.053], [8.965, 9.12], [8.92, 9.18], [8.83, 9.24], [8.76, 9.29], OPEN_A, OPEN_B, CAMP_EDGE],
};
/* Index of each named place along every concealment route. */
export const CONCEAL_POINTS = {
  'forest-edge': 0, gap1: 2, 'path-crossing': 4, clearing: 6, gap2: 7, opening: 8, 'camp-edge': 10,
};
/* Each route's alternate reacquisition point (the HARD_THRESHOLD move,
 * MISSIONS.md M1): west and east from the cañada, mid from a second path
 * crossing north of its clearing (places.js picada-norte), so Vega's
 * "the path crossing north of last contact" points where the search
 * ring is; each its own route from there. */
const ALT = {
  west: [[9.065, 9.11], [8.97, 9.17], [8.86, 9.22], [8.76, 9.29], OPEN_A, OPEN_B, CAMP_EDGE],
  mid: [[8.8, 9.235], [8.77, 9.245], [8.74, 9.255], [8.69, 9.27], OPEN_A, OPEN_B, CAMP_EDGE],
  east: [[9.075, 9.24], [8.95, 9.25], [8.83, 9.24], [8.76, 9.29], OPEN_A, OPEN_B, CAMP_EDGE],
};
export const ALT_POINTS = { reacquire: 0, opening: 4, 'camp-edge': 6 };

/* The second of the pair walks 2.5 m to the first's right and a step
 * behind: a fixed offset, metres east and south. */
const beside = (pts) => pts.map(([x, z]) => [x + 2.2, z + 1.4]);

/* The camp's eight (MISSIONS.md M1 routes and spawn sets): each a loop in
 * the clearing on camp offsets, with dwells doing what the camp does. */
const SHELTERS = Object.fromEntries(CAMP_PROPS.shelters.map((s) => [s.id, s]));
const MAST = CAMP_PROPS.mast.at;
const LOOK = CAMP_PROPS.lookout.at;
const off = ([x, z]) => [x - CX, z - CZ];
const CAMP_LOOPS = {
  'camp-look': {
    pts: [off(LOOK), [off(LOOK)[0] + 1.2, off(LOOK)[1]]], deck: CAMP_PROPS.lookout.deckY, dwell: [{ i: 0, s: 40, action: 'lookUp' }, { i: 1, s: 30, action: 'stand' }],
  },
  'camp-tarp': { pts: [[-14, -4], [-6, 1], [2, 4], [-10, 3]], dwell: [{ i: 0, s: 25, action: 'crouchTarp' }, { i: 2, s: 30, action: 'sit' }] },
  'camp-up': { pts: [[4, 3], [12, -4], [6, 9]], dwell: [{ i: 0, s: 35, action: 'sit' }, { i: 1, s: 8, action: 'lookUp' }] },
  'camp-mast': { pts: [[off(MAST)[0] + 1.5, off(MAST)[1] + 1], [-2, -8], [3, -2]], dwell: [{ i: 0, s: 30, action: 'stand' }, { i: 2, s: 25, action: 'sit' }] },
  'camp-moto-1': { pts: [[-18, 3], [-9, 8], [-1, 4]], dwell: [{ i: 0, s: 30, action: 'crouchTarp' }, { i: 2, s: 30, action: 'sit' }] },
  'camp-moto-2': { pts: [[18, 4], [9, 11], [0, 6]], dwell: [{ i: 0, s: 25, action: 'stand' }, { i: 2, s: 35, action: 'sit' }] },
  'camp-1': { pts: [[-2, 1], [-12, 10], [-20, -2], [-8, -12]], dwell: [{ i: 0, s: 45, action: 'sit' }, { i: 2, s: 15, action: 'stand' }] },
  'camp-2': { pts: [[12, -10], [16, 8], [4, 14], [-4, -4]], dwell: [{ i: 1, s: 30, action: 'sit' }, { i: 3, s: 20, action: 'stand' }] },
};

/* The tarp mover's one move, at whichever shelter carries the mark (the
 * dial: shelter-1, -2 or -3): to its corner, crouch, pull the tarp back. */
function tarpMove(shelter) {
  const [sx, sz] = off(shelter.at);
  return {
    pts: [[-6, 1], [sx + 2, sz + 2]], dwell: [{ i: 1, s: 60, action: 'crouchTarp' }], end: 'stay', speed: AMBLE,
  };
}

/* The dispersal (MISSIONS.md M1): two a direction, into the forest, last
 * visible some minutes after it starts. The antenna comes down first;
 * the motorcycles are pushed under the trees. Camp offsets out to
 * 420 m, then gone. */
const OUT = {
  'out-n-a': { pts: [off(LOOK), [4, -60], [10, -180], [-6, -320], [0, -430]] },
  'out-n-b': { pts: [[6, 9], [-8, -40], [-20, -170], [-10, -310], [-18, -420]], dwell: [{ i: 0, s: 6, action: 'lookUp' }] },
  'out-e-a': { pts: [[off(MAST)[0] + 1.5, off(MAST)[1] + 1], [40, -20], [170, -40], [300, -10], [420, -30]], dwell: [{ i: 0, s: 25, action: 'takeDownAntenna' }] },
  'out-e-b': { pts: [[-6, 1], [40, 10], [160, 20], [290, 40], [410, 30]] },
  'out-s-a': { pts: [[-20, 2], [-14, 50], [10, 170], [0, 300], [15, 420]], segments: [{ from: 0, to: 2, action: 'pushMotorcycle' }] },
  'out-s-b': { pts: [[-2, 1], [10, 45], [30, 160], [20, 300], [35, 410]] },
  'out-w-a': { pts: [[19, 4], [-45, 15], [-170, 30], [-300, 10], [-420, 25]], segments: [{ from: 0, to: 2, action: 'pushMotorcycle' }] },
  'out-w-b': { pts: [[4, 14], [-40, 30], [-160, 55], [-290, 40], [-410, 60]] },
};

/* The pair leaves by the camp's access path to the north west. */
const PAIR_OUT = [[8.594, 9.428], [8.565, 9.48], [8.52, 9.62], [8.43, 9.8], [8.36, 9.94]];

/* Sector Bravo's public road and the colonia (MISSIONS.md M1 stage 2):
 * the motorcycle passing through, the pickup at the store, and the
 * colonia's people about their afternoon. */
const BRAVO_MOTO = [[5.6, 5.9], [6.6, 5.96], [7.4, 6.02], [8.1, 6.06], [8.6, 6.1], [8.86, 6.13], [9.1, 6.16], [9.45, 6.16], [9.8, 6.12], [10.3, 6.02], [10.9, 5.75], [11.45, 5.2]];

export const ROUTES = {};
/* The long objects show only from the narrow opening on (the script's
 * M1_06 reveal), not from the forest's edge: before it they are still an
 * unknown pair. */
const LONG_FROM = { conceal: CONCEAL_POINTS.opening, alt: ALT_POINTS.opening };
for (const [k, pts] of Object.entries(CONCEAL)) {
  const dwell = [{ i: 2, s: 12, action: 'stand' }, { i: 6, s: 10, action: 'lookUp' }, { i: 8, s: 6, action: 'stand' }];
  ROUTES[`conceal-${k}-a`] = {
    pts: km(pts), speed: WALK, dwell, end: 'stay', segments: [{ from: LONG_FROM.conceal, to: pts.length - 1, action: 'carryLong' }],
  };
  ROUTES[`conceal-${k}-b`] = {
    pts: beside(km(pts)), speed: WALK, dwell, end: 'stay', segments: [{ from: LONG_FROM.conceal, to: pts.length - 1, action: 'carryLong' }],
  };
  ROUTES[`conceal-${k}-alt-a`] = {
    pts: km(ALT[k]), speed: WALK, end: 'stay', segments: [{ from: LONG_FROM.alt, to: ALT[k].length - 1, action: 'carryLong' }],
  };
  ROUTES[`conceal-${k}-alt-b`] = { pts: beside(km(ALT[k])), speed: WALK, end: 'stay' };
}
for (const [id, r] of Object.entries(CAMP_LOOPS)) {
  ROUTES[`${id}-loop`] = {
    pts: camp([...r.pts, r.pts[0]]), speed: AMBLE, loop: true, dwell: r.dwell, deck: r.deck,
  };
}
for (const [k, s] of [['', SHELTERS['shelter-1']], ['-s1', SHELTERS['shelter-1']], ['-s2', SHELTERS['shelter-2']], ['-s3', SHELTERS['shelter-3']]]) {
  const t = tarpMove(s);
  ROUTES[`camp-tarp-move${k}`] = { ...t, pts: camp(t.pts) };
}
for (const [id, r] of Object.entries(OUT)) {
  ROUTES[id] = {
    pts: camp(r.pts), speed: WALK, dwell: r.dwell, segments: r.segments, end: 'gone',
  };
}
ROUTES['pair-out-a'] = { pts: km(PAIR_OUT), speed: WALK, end: 'gone', segments: [{ from: 0, to: PAIR_OUT.length - 1, action: 'carryLong' }] };
ROUTES['pair-out-b'] = { pts: beside(km(PAIR_OUT)), speed: WALK, end: 'gone' };
/* The motorcycle rides the road out and back for the whole stage: a
 * single pass is over in ten minutes, before a pilot who surveys Alpha
 * first ever looks at Bravo (owner's flight, 2026-10-07: never found). */
const BRAVO_MOTO_RIDE = [...BRAVO_MOTO, ...BRAVO_MOTO.slice(0, -1).reverse()];
ROUTES['bravo-moto'] = {
  pts: km(BRAVO_MOTO_RIDE), speed: 11, loop: true, segments: [{ from: 0, to: BRAVO_MOTO_RIDE.length - 1, action: 'drive' }], vehicle: 'motorcycle',
};
ROUTES['colonia-pickup'] = {
  pts: km([[9.18, 6.17], [9.18, 6.17]]), speed: 1, end: 'stay', dwell: [{ i: 0, s: 1, action: 'park' }], vehicle: 'pickup',
};
const COLONIA = PLACES.coloniaArroyoManso.at;
const col = (pts) => pts.map(([ox, oz]) => [COLONIA[0] + ox, COLONIA[1] + oz]);
ROUTES['colonia-civ-1'] = {
  pts: km([[9.1, 6.16], [9.45, 6.16], [9.8, 6.12], [9.45, 6.16], [9.1, 6.16]]), speed: 1.1, loop: true, dwell: [{ i: 1, s: 40, action: 'stand' }],
};
ROUTES['colonia-civ-2'] = { pts: col([[60, -40], [62, -30], [60, -40]]), speed: 0.8, loop: true, dwell: [{ i: 0, s: 90, action: 'sit' }] };
ROUTES['colonia-civ-3'] = { pts: col([[-80, 30], [10, 26], [120, 20], [-80, 30]]), speed: 1.2, loop: true };
ROUTES['colonia-civ-4'] = { pts: col([[150, -48], [160, -46], [150, -48]]), speed: 0.6, loop: true, dwell: [{ i: 0, s: 60, action: 'stand' }] };

/*
 * MISSION 3's ROUTES (MISSIONS.md M3), `m3-` prefixed. M3_AT is where its
 * places stand on the design grid (km): MISSIONS 1.9's first layout, the
 * northern exit brought inside the boundary's warning line (16.0 km is
 * the map's edge; the warning is 0.4 km in). WORLD lays them on the land
 * when the map is built (TECH-NEEDS N1); the mission data reads them here.
 */
export const M3_AT = {
  post: [4, 14],
  gate: [4.06, 13.93],
  checkpoint: [4.12, 13.86],
  farmhouse: [5.2, 13.1],
  field: [4.5, 13.55],
  obsA: [4.55, 14.35],
  obsB: [3.55, 13.45],
  meet: [6.05, 12.95],
  coverW: [3.86, 13.98],
  coverE: [4.2, 14.06],
  v1Stop: [5.6, 12.4],
  v2Stop: [4.926, 14.424],
  command: [7.17, 15.265],
  relay: [5.6, 14.6],
  turn: [6.95, 15.1],
  edge: [6.6, 15.3],
  exit: [6.5, 15.5],
};
const M3_PICKUP = 11;
const drive = (pts, speed, end, extra = {}) => ({
  pts: km(pts), speed, end, segments: [{ from: 0, to: pts.length - 1, action: 'drive' }], vehicle: 'pickup', ...extra,
});
/* Stage 1's five: A the family's pickup to the farmhouse, B the police
 * motorcycle to the checkpoint, C two walkers leaving south, E the field
 * workers, D the parked pickup at its two observation spots in either
 * order (a dial), then to the meeting on Senda del Vigía. */
ROUTES['m3-a-pickup'] = drive([[6.4, 12.2], [5.9, 12.6], M3_AT.farmhouse], M3_PICKUP, 'stay', { dwell: [{ i: 2, s: 1, action: 'park' }] });
ROUTES['m3-a-family'] = { pts: km([M3_AT.farmhouse, [5.205, 13.11], M3_AT.farmhouse]), speed: AMBLE, loop: true, dwell: [{ i: 0, s: 20, action: 'stand' }] };
ROUTES['m3-b-police'] = {
  pts: km([[5.4, 12], [4.6, 13.2], M3_AT.checkpoint]), speed: 9, end: 'stay', segments: [{ from: 0, to: 2, action: 'drive' }], dwell: [{ i: 2, s: 1, action: 'park' }], vehicle: 'motorcycle',
};
for (const [k, dx] of [['1', 0], ['2', 0.003]]) {
  ROUTES[`m3-c-walker-${k}`] = { pts: km([[4.1 + dx, 13.8], [4.4 + dx, 13.0], [4.7 + dx, 12.0]]), speed: WALK, end: 'gone' };
}
for (let k = 0; k < 3; k += 1) {
  const [e, n] = [M3_AT.field[0] + 0.012 * k, M3_AT.field[1]];
  ROUTES[`m3-e-worker-${k + 1}`] = { pts: km([[e, n], [e + 0.006, n + 0.004], [e, n]]), speed: AMBLE, loop: true, dwell: [{ i: 1, s: 30 + 9 * k, action: 'stand' }] };
}
for (const [order, [s1, s2]] of [['ab', [M3_AT.obsA, M3_AT.obsB]], ['ba', [M3_AT.obsB, M3_AT.obsA]]]) {
  ROUTES[`m3-d-${order}`] = drive([[3.3, 14.8], s1, s2, [4.8, 13.4], M3_AT.meet], 8, 'stay', { dwell: [{ i: 1, s: 70, action: 'park' }, { i: 2, s: 70, action: 'park' }, { i: 4, s: 1, action: 'park' }] });
}
/* The courier Mission 2 followed, walking Senda del Vigía west to D. */
ROUTES['m3-courier'] = { pts: km([[6.3, 12.86], [6.17, 12.91], M3_AT.meet]), speed: WALK, end: 'stay', dwell: [{ i: 2, s: 1, action: 'stand' }] };
/* Stage 2: civilians out of the vegetation by the road; the concealed
 * pair on the side the dial picks, still a while, then onto the gate
 * with the long objects raised, and into the post if nobody stops it. */
ROUTES['m3-leaver-1'] = { pts: km([[3.9, 14.15], [4.3, 13.6], [4.8, 12.8]]), speed: WALK, end: 'gone' };
ROUTES['m3-leaver-2'] = { pts: km([[4.15, 14.2], [4.5, 13.55], [5, 12.7]]), speed: WALK, end: 'gone' };
for (const [side, at] of [['w', M3_AT.coverW], ['e', M3_AT.coverE]]) {
  for (const [k, dx] of [['a', 0], ['b', 0.002]]) {
    const pts = [[at[0] + dx, at[1]], [at[0] + dx, at[1] + 0.001], [M3_AT.gate[0] + dx, M3_AT.gate[1] + 0.012], [M3_AT.gate[0] + dx, M3_AT.gate[1]], M3_AT.post];
    ROUTES[`m3-pair-${side}-${k}`] = {
      pts: km(pts), speed: WALK, end: 'stay', dwell: [{ i: 1, s: 75, action: 'stand' }, { i: 3, s: 90, action: 'stand' }], segments: [{ from: 1, to: 4, action: 'carryLong' }],
    };
  }
}
/* Spotted (CONTRACT-SPOTTED.md): the pair back into the scrub west of
 * the gate, the courier back the way he came along Senda del Vigía. */
for (const [k, dx] of [['a', 0], ['b', 0.003]]) {
  ROUTES[`m3-pair-scatter-${k}`] = { pts: km([[4.06 + dx, 13.95], [3.95 + dx, 13.9], [3.75 + dx, 13.82]]), speed: 2.6, end: 'gone' };
}
ROUTES['m3-courier-scatter'] = { pts: km([M3_AT.meet, [6.17, 12.91], [6.4, 12.85]]), speed: 2.6, end: 'gone' };
/* A stopped threat or a struck vehicle: gone at once (no aftermath). */
ROUTES['m3-stopped'] = { pts: km([M3_AT.gate, [M3_AT.gate[0] + 0.001, M3_AT.gate[1]]]), speed: 10, end: 'gone' };
/* Stage 3: three look alike pickups from the post's outskirts. */
ROUTES['m3-v1'] = drive([[4.2, 13.75], [4.9, 13], M3_AT.v1Stop], M3_PICKUP, 'stay', { dwell: [{ i: 2, s: 1, action: 'park' }] });
ROUTES['m3-v1-people'] = { pts: km([M3_AT.v1Stop, [5.62, 12.37], [5.7, 12.25]]), speed: WALK, end: 'gone' };
ROUTES['m3-v2'] = drive([[4.1, 14.15], [4.5, 14.3], M3_AT.v2Stop], M3_PICKUP, 'stay', { dwell: [{ i: 2, s: 1, action: 'park' }] });
ROUTES['m3-v3'] = drive([[4.25, 14], [5.2, 14.3], [6, 14.6], [6.7, 15], [7.12, 15.215]], M3_PICKUP, 'stay', { dwell: [{ i: 4, s: 1, action: 'park' }] });
/* Stage 4: the temporary command site's people. */
ROUTES['m3-radio-op'] = { pts: km([[7.172, 15.267], [7.174, 15.268], [7.172, 15.267]]), speed: AMBLE, loop: true, dwell: [{ i: 0, s: 50, action: 'sit' }] };
ROUTES['m3-command-2'] = { pts: km([[7.16, 15.255], [7.18, 15.26], [7.16, 15.255]]), speed: AMBLE, loop: true, dwell: [{ i: 1, s: 35, action: 'stand' }] };
/* Stage 5: the northern vehicle, out of the command site, a turn north
 * that is wrong, then to the edge of coverage and over it. */
ROUTES['m3-north'] = drive([[7.15, 15.245], [7.05, 15.18], M3_AT.turn, M3_AT.edge, M3_AT.exit], 9, 'gone');

/* A route walked: its legs, each a hold or a stretch of walking, with
 * when each starts and ends, ms. */
function plan(route) {
  const legs = [];
  let t = 0;
  const dwellAt = new Map((route.dwell ?? []).map((d) => [d.i, d]));
  const actionOf = (i) => {
    for (const s of route.segments ?? []) {
      if (i >= s.from && i < s.to) {
        return s.action;
      }
    }
    return 'walk';
  };
  for (let i = 0; i < route.pts.length; i += 1) {
    const d = dwellAt.get(i);
    if (d) {
      legs.push({
        hold: true, i, t0: t, t1: t + d.s * 1000, action: d.action,
      });
      t += d.s * 1000;
    }
    if (i < route.pts.length - 1) {
      const [ax, az] = route.pts[i];
      const [bx, bz] = route.pts[i + 1];
      const len = Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az));
      const ms = (len / route.speed) * 1000;
      legs.push({
        hold: false, i, t0: t, t1: t + ms, action: actionOf(i), len, heading: Math.atan2(bx - ax, -(bz - az)),
      });
      t += ms;
    }
  }
  /* A hold faces where the last walk went. */
  let face = 0;
  for (const l of legs) {
    if (l.hold) {
      l.heading = face;
    } else {
      face = l.heading;
    }
  }
  if (legs[0] && legs[0].hold) {
    legs[0].heading = (legs.find((l) => !l.hold) || { heading: 0 }).heading;
  }
  return { legs, total: t };
}

/*
 * The routes over a world (world.js makeWorld): { poseOnRoute(id, ms),
 * ids, total(id), length(id), route(id) }. heading is the scene's
 * (radians clockwise from north, -z, seen from above: a turn about +y by
 * -heading faces it), headingDoc the ops frame's (anticlockwise from
 * east), both for drawing only.
 */
export function makeRoutes(world, routes = ROUTES) {
  const plans = new Map(Object.entries(routes).map(([id, r]) => [id, plan(r)]));
  const out = {
    x: 0, y: 0, z: 0, heading: 0, headingDoc: 0, action: 'stand',
  };
  function at(route, x, z, heading, action) {
    out.x = x;
    out.z = z;
    out.y = world.groundAt(x, z) + (route.deck || 0);
    out.heading = heading;
    out.headingDoc = Math.PI / 2 - heading;
    out.action = action;
    return { ...out };
  }
  function poseOnRoute(routeId, ms) {
    const route = routes[routeId];
    if (!route) {
      throw new Error(`interior routes: no route ${routeId}`);
    }
    const { legs, total } = plans.get(routeId);
    let t = ms;
    if (route.loop && total > 0) {
      t -= Math.floor(t / total) * total;
    } else if (t >= total) {
      if ((route.end ?? 'gone') === 'gone') {
        return null;
      }
      const last = legs[legs.length - 1];
      const p = route.pts[route.pts.length - 1];
      return at(route, p[0], p[1], last ? last.heading : 0, 'stand');
    }
    t = t < 0 ? 0 : t;
    let leg = legs[legs.length - 1];
    for (const l of legs) {
      if (t < l.t1) {
        leg = l;
        break;
      }
    }
    const [ax, az] = route.pts[leg.i];
    if (leg.hold) {
      return at(route, ax, az, leg.heading, leg.action);
    }
    const [bx, bz] = route.pts[leg.i + 1];
    const u = leg.t1 > leg.t0 ? (t - leg.t0) / (leg.t1 - leg.t0) : 1;
    return at(route, ax + u * (bx - ax), az + u * (bz - az), leg.heading, leg.action);
  }
  return {
    poseOnRoute,
    ids: Object.keys(routes),
    route: (id) => routes[id],
    total: (id) => plans.get(id).total,
    length: (id) => plans.get(id).legs.reduce((s, l) => s + (l.len || 0), 0),
  };
}
