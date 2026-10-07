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
 * MISSIONS.md M1): west and east from the cañada, mid from the path
 * crossing to the west of the routes; each its own route from there. */
const ALT = {
  west: [[9.065, 9.11], [8.97, 9.17], [8.86, 9.22], [8.76, 9.29], OPEN_A, OPEN_B, CAMP_EDGE],
  mid: [[8.45, 8.955], [8.5, 9.06], [8.6, 9.17], [8.62, 9.27], OPEN_A, OPEN_B, CAMP_EDGE],
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
