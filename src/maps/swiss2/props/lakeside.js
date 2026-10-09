/*
 * lakeside.js: what people have built along swiss2's lake, and the boats
 * on it.
 *
 *   buildLakeside(ctx) -> { group, update(dtMs), boat, dispose(), stats }
 *
 * A Swiss lake is never empty shore. From the water's edge you look over
 * boats on their buoys to a village on the far side: whitewashed houses
 * with their timber upper storeys and their gables to the lake, a hotel
 * at the landing stage, a church, boathouses in a row at the water. The
 * lake-shore and lake-edge views had the water and the far slope and
 * nothing on them, so the frame had no subject and no middle distance.
 * This draws:
 *
 *   THE HAMLET on the south shore, eight hundred metres across the water
 *   from the north shore's views: chalets and town houses in rows up
 *   the foot of the slope, close round the landing stage and thinning
 *   along the shore, a hotel at the stage with its terrace, the landing
 *   stage and its ticket hut, a church a little up the rise. Their
 *   footprints go to the map's (`footprints`), so the forest and the
 *   meadow keep off them and the ground under them is trodden.
 *
 *   BOATHOUSES along the south shore and at its two corners, which the
 *   north shore's views see as the frame's far left and right, each with
 *   its slipway out into the water.
 *
 *   THE PROMENADE along the north shore: a gravel path along the top of
 *   the beach, benches on it facing the water, lamps and bins.
 *
 *   BOATS: a mooring field of rowing boats, motor launches and a yacht
 *   or two on buoys off the hamlet and off the jetty, and one sailing
 *   boat under way, back and forth across the wind (updateAnim() moves
 *   it on the step clock; `boat` is where it is and how fast, for the
 *   wake the water draws).
 *
 *   STONES on the beach and in the shallows either side of the jetty,
 *   where the lake-edge view looks down into the water.
 *
 * The buildings are the village's kit (buildings/lake.js, houses.js),
 * put into the `bake` the map bakes as the village is baked, so they
 * have its photographed surfaces and its detail, and the detail only
 * near. Every building is walls under a roof that is ground. The rest
 * is vertex coloured, the props' one program (mesh.js), in one static
 * mesh and the sailing boat's own. What a craft can hit is solid wherever
 * it is: a moored boat's hull a capsule and a yacht's mast a post, the
 * promenade's lamps, benches and bins, and the sailing boat moving boxes
 * on the step clock, as the valley's traffic is (alps/life.js). The
 * stones on the beach are ankle high and stay drawn only.
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

import * as THREE from 'three';
import { makeRng, noise2 } from '../../../render/library/noise.js';
import { LAKE_Y, valleyAxis } from '../../alps/terrain.js';
import {
  lakeShore, jettyClear, ROAD_END, ROAD_DX,
} from '../vegetation/zones.js';
import {
  UP, Mesher, propMaterial, shade, box, frame, roofProxy, albedoOf,
} from './mesh.js';
import { standWalls } from '../../../render/library/roofs.js';
import { setSolidSurface } from '../../../game/crashworld.js';
import { frame as kitFrame } from '../buildings/parts.js';
import { chalet, church } from '../buildings/houses.js';
import {
  townhouse, hotel, boathouse, stageHut, landingStage, cellar,
} from '../buildings/lake.js';

/* Albedos, linear, of what is still drawn here in the props' colours. */
const IRON = [0.03, 0.045, 0.035];
const SLAT = [0.2, 0.12, 0.06];
const CONCRETE = [0.3, 0.29, 0.27];

/*
 * Round 8 drew every house, the church, the hotel and the boathouses in
 * this file's own vertex coloured boxes, choosing their finish from the
 * hamlet's rng. They are the village's kit now (buildings/lake.js), and
 * their finish is each house's own (buildings/houses.js facadeOf), but
 * the rng is still drawn exactly as often as those builders drew it, so
 * every house, boat and stone after them stands where it stood. What a
 * draw chose then chooses the nearest thing the kit has now: the roof's
 * colour its covering, the shutters' colour their paint, a timber
 * storey's shade its larch.
 */
const COVERS = ['slate', 'tile', 'shingle'];
const SHUTTERS = ['shutterGreen', 'shutterRed', 'shutterGreen', null];

function houseDraws(rng, { floors, masonry, plaster, roof, shutter }) {
  if (plaster === undefined) {
    rng();
  }
  const cover = roof === undefined ? COVERS[Math.floor(rng() * COVERS.length)] : roof;
  const paint = shutter === undefined ? SHUTTERS[Math.floor(rng() * SHUTTERS.length)] : shutter;
  let tone = 0.5;
  for (let s = masonry; s < floors; s += 1) {
    tone = rng();
  }
  rng();
  rng();
  rng();
  return { cover, shutter: paint, board: tone < 0.5 ? 'larchDark' : 'larch' };
}

/* The boathouse's draws: a shade per board course and per roof course. */
function shedDraws(rng, h) {
  const n = Math.round(h / 0.28) + 10;
  for (let k = 0; k < n; k += 1) {
    rng();
  }
}

/* The corners of a w by d footprint at (x, z) whose width runs along
 * (cos yaw, sin yaw), as the round 8 builders laid them, and its
 * extent: the footprint the map keeps its grass and trees off. */
function cornersOf(x, z, yaw, w, d) {
  const ex = [Math.cos(yaw), Math.sin(yaw)];
  const ez = [-Math.sin(yaw), Math.cos(yaw)];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({
    x: x + ex[0] * a * w / 2 + ez[0] * b * d / 2,
    z: z + ex[1] * a * w / 2 + ez[1] * b * d / 2,
  }));
}
const footprintOf = (corners) => ({
  minX: Math.min(...corners.map((c) => c.x)),
  maxX: Math.max(...corners.map((c) => c.x)),
  minZ: Math.min(...corners.map((c) => c.z)),
  maxZ: Math.max(...corners.map((c) => c.z)),
});

/*
 * Stand a kit builder into `bake` at (x, z), turned `ry` (alps/kit.js's
 * frame turn), as alps/village.js stands a house: level on the highest
 * of `ground` (points under it) or at `y` where it is given, its
 * foundation cut down to the lowest. Its new roofs are recorded as
 * `kind`. Returns the keep out box its walls are stood in, [x0, y0, z0,
 * x1, y1, z1] round its turned extent, its roofs and its solid parts.
 */
export function placeInto(bake, build, { x, z, ry, ground, y = null, kind }) {
  const top = Math.max(...ground);
  const at = y ?? top + 0.2;
  const found = at - Math.min(...ground) + 0.4;
  const from = bake.roofs.length;
  const fromSolids = bake.solids.length;
  const f = kitFrame(bake, x, at, z, ry);
  const ext = build(f, found);
  const roofs = bake.roofs.slice(from);
  for (const r of roofs) {
    r.kind ??= kind;
  }
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const pts = [[ext.hw, ext.hd], [ext.hw, -ext.hd], [-ext.hw, ext.hd], [-ext.hw, -ext.hd]].map(([lx, lz]) => [x + lx * c + lz * s, z - lx * s + lz * c]);
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  return {
    at,
    box: [Math.min(...xs), at - found, Math.min(...zs), Math.max(...xs), at + ext.top, Math.max(...zs)],
    roofs,
    parts: bake.solids.slice(fromSolids),
  };
}

/*
 * A boathouse at (x, z) on the shore, its length along `yaw` pointing
 * out over the water, its floor over the lake's highest water: the
 * props' own at the north shore and the south shore's row both.
 */
export function placeBoathouse(bake, heightAt, { x, z, yaw, len, w, h }) {
  const y = Math.max(LAKE_Y + 0.6, heightAt(x, z) + 0.1);
  return placeInto(bake, (f) => boathouse(f, {
    len, w, h, heightAt, roofKey: 'shingleDark', slip: y - LAKE_Y + 0.9,
  }), {
    x, z, ry: Math.PI / 2 - yaw, ground: [heightAt(x, z)], y, kind: 'boathouse',
  });
}

/*
 * A hull, `len` long and `beam` wide, its sheer `depth` over its keel, at
 * the origin of frame (c, ex along it bow first, ey up, ez across): lofted
 * through stations from a transom stern to a fine bow. `open` boats show
 * their inside and thwarts; a decked one is closed over.
 */
function hull(m, c, ex, ey, ez, { len, beam, depth, colour, inside, stripe = null, open = true, deck = null }) {
  const stations = [[-0.5, 0.78, 0.9], [-0.25, 0.97, 1], [0, 1, 1], [0.25, 0.86, 1], [0.42, 0.5, 1.04], [0.5, 0.02, 1.1]];
  const at = (t, half, y) => c.clone().addScaledVector(ex, t * len).addScaledVector(ey, y).addScaledVector(ez, half);
  const keelY = (t) => -depth * (0.62 + 0.38 * (1 - Math.abs(t * 2) ** 3)) * 0.55;
  for (let k = 0; k < stations.length - 1; k += 1) {
    const [t0, w0, s0] = stations[k];
    const [t1, w1, s1] = stations[k + 1];
    const h0 = (beam / 2) * w0;
    const h1 = (beam / 2) * w1;
    const top0 = depth * 0.45 * s0;
    const top1 = depth * 0.45 * s1;
    for (const side of [1, -1]) {
      const g0 = at(t0, side * h0, top0);
      const g1 = at(t1, side * h1, top1);
      const c0 = at(t0, side * h0 * 0.7, keelY(t0) * 0.55);
      const c1 = at(t1, side * h1 * 0.7, keelY(t1) * 0.55);
      const k0 = at(t0, 0, keelY(t0));
      const k1 = at(t1, 0, keelY(t1));
      const quad = side > 0 ? (a, b, cc, d, col) => m.quad(a, b, cc, d, col) : (a, b, cc, d, col) => m.quad(d, cc, b, a, col);
      quad(c0, c1, g1, g0, colour);
      quad(k0, k1, c1, c0, shade(colour, 0.7));
      if (stripe) {
        const s0p = at(t0, side * h0 * 1.005, top0 - depth * 0.08);
        const s1p = at(t1, side * h1 * 1.005, top1 - depth * 0.08);
        quad(s0p, s1p, at(t1, side * h1 * 1.005, top1 - depth * 0.02), at(t0, side * h0 * 1.005, top0 - depth * 0.02), stripe);
      }
      if (open) {
        const i0 = at(t0, side * h0 * 0.92, top0);
        const i1 = at(t1, side * h1 * 0.92, top1);
        const f0 = at(t0, side * h0 * 0.6, keelY(t0) * 0.4);
        const f1 = at(t1, side * h1 * 0.6, keelY(t1) * 0.4);
        quad(i0, i1, f1, f0, inside);
      }
    }
    if (open) {
      m.quad(at(t0, -h0 * 0.6, keelY(t0) * 0.4), at(t0, h0 * 0.6, keelY(t0) * 0.4), at(t1, h1 * 0.6, keelY(t1) * 0.4), at(t1, -h1 * 0.6, keelY(t1) * 0.4), shade(inside, 0.8));
    } else {
      m.quad(at(t0, -h0, top0), at(t0, h0, top0), at(t1, h1, top1), at(t1, -h1, top1), deck ?? colour);
    }
  }
  /* The transom. */
  const [ts, ws, ss] = stations[0];
  const hs = (beam / 2) * ws;
  m.quad(at(ts, hs, depth * 0.45 * ss), at(ts, -hs, depth * 0.45 * ss), at(ts, -hs * 0.7, keelY(ts) * 0.55), at(ts, hs * 0.7, keelY(ts) * 0.55), shade(colour, 0.8));
  if (open) {
    for (const t of [-0.12, 0.18]) {
      box(m, at(t, 0, depth * 0.3), ex, ey, ez, 0.12, 0.025, beam * 0.45, shade(inside, 1.3));
    }
  }
}

/* Boats on the lake's moorings: a rowing boat, a motor launch, a small
 * yacht with her sail furled on the boom. */
const HULLS = [[0.55, 0.55, 0.53], [0.52, 0.52, 0.5], [0.08, 0.14, 0.24], [0.22, 0.04, 0.03], [0.2, 0.12, 0.06]];
function mooredBoat(m, rng, x, z, yaw, kind, colliders) {
  const [ex, ey, ez] = frame(yaw);
  const c = new THREE.Vector3(x, LAKE_Y + 0.02, z);
  /* The hull a capsule down its length, as round as its beam, which
   * holds its sheer, a launch's canvas and a yacht's cabin and boom; a
   * yacht's mast a post. Glass fibre is a plastic, and PVC the plant's
   * nearest; a rowing boat is timber. */
  if (colliders) {
    const [len, beam] = { row: [4.2, 1.4], launch: [6, 2.1], yacht: [7.5, 2.4] }[kind];
    const a = c.clone().addScaledVector(ex, -len / 2 + beam / 2).addScaledVector(ey, 0.1);
    const b = c.clone().addScaledVector(ex, len / 2 - beam / 2).addScaledVector(ey, 0.1);
    colliders.add('obstacle', a.x, a.y, a.z, b.x, b.y, b.z, beam / 2);
    setSolidSurface(colliders, colliders.ax.length - 1, kind === 'row' ? 'wood' : 'pvc');
    if (kind === 'yacht') {
      const mast = c.clone().addScaledVector(ex, 0.6);
      colliders.addPost('pole', mast.x, mast.z, c.y + 1, c.y + 9.8, 0.06);
      setSolidSurface(colliders, colliders.ax.length - 1, 'metal');
    }
  }
  const colour = HULLS[Math.floor(rng() * HULLS.length)];
  if (kind === 'row') {
    hull(m, c, ex, ey, ez, { len: 4.2, beam: 1.4, depth: 0.7, colour, inside: [0.2, 0.12, 0.06], stripe: rng() < 0.5 ? [0.3, 0.04, 0.03] : null });
  } else if (kind === 'launch') {
    hull(m, c, ex, ey, ez, { len: 6, beam: 2.1, depth: 1.1, colour: [0.55, 0.55, 0.53], inside: [0.16, 0.1, 0.06], stripe: [0.05, 0.12, 0.25] });
    /* A canvas over the cockpit. */
    box(m, c.clone().addScaledVector(ey, 0.62).addScaledVector(ex, -0.6), ex, ey, ez, 1.7, 0.15, 0.85, [0.06, 0.12, 0.22]);
    box(m, c.clone().addScaledVector(ey, 0.75).addScaledVector(ex, 0.55), ex, ey, ez, 0.05, 0.25, 0.8, [0.1, 0.12, 0.13]);
  } else {
    hull(m, c, ex, ey, ez, { len: 7.5, beam: 2.4, depth: 1.3, colour: [0.56, 0.56, 0.54], inside: [0.2, 0.2, 0.2], open: false, deck: [0.34, 0.3, 0.24] });
    box(m, c.clone().addScaledVector(ey, 0.85).addScaledVector(ex, -0.4), ex, ey, ez, 1.3, 0.28, 0.8, [0.55, 0.55, 0.53]);
    box(m, c.clone().addScaledVector(ey, 5.2).addScaledVector(ex, 0.6), ex, ey, ez, 0.06, 4.6, 0.06, [0.5, 0.5, 0.5]);
    box(m, c.clone().addScaledVector(ey, 1.55).addScaledVector(ex, -0.9), ex, ey, ez, 1.5, 0.12, 0.12, [0.1, 0.18, 0.3]);
  }
  /* The buoy she lies to, off her bow. */
  const b = c.clone().addScaledVector(ex, kind === 'yacht' ? 6.5 : 4.2);
  box(m, b.setY(LAKE_Y + 0.12), ex, ey, ez, 0.22, 0.2, 0.22, rng() < 0.5 ? [0.6, 0.6, 0.58] : [0.7, 0.2, 0.02]);
  if (colliders) {
    colliders.addSphere('obstacle', b.x, b.y, b.z, 0.3);
    setSolidSurface(colliders, colliders.ax.length - 1, 'pvc');
  }
}

/*
 * The sailing boat under way, in its own frame: bow along +x, the wind
 * over the +z side, heeled away from it, the main sheeted out to
 * leeward. Mirrored across its centreline (scale z -1) on the other tack.
 */
function sailingBoat() {
  const m = new Mesher();
  const heel = 0.16;
  const ex = new THREE.Vector3(1, 0, 0);
  const ey = new THREE.Vector3(0, Math.cos(heel), -Math.sin(heel));
  const ez = new THREE.Vector3(0, Math.sin(heel), Math.cos(heel));
  const c = new THREE.Vector3(0, 0.05, 0);
  hull(m, c, ex, ey, ez, { len: 6.5, beam: 2.2, depth: 1.1, colour: [0.58, 0.58, 0.56], inside: [0.2, 0.2, 0.2], open: false, deck: [0.36, 0.32, 0.26], stripe: [0.05, 0.1, 0.2] });
  const at = (a, b, d) => c.clone().addScaledVector(ex, a).addScaledVector(ey, b).addScaledVector(ez, d);
  box(m, at(0.3, 5, 0), ex, ey, ez, 0.06, 4.6, 0.06, [0.55, 0.55, 0.55]);
  /* The main, off the mast to the boom's end out to leeward (-z), and
   * the jib from the forestay to its clew; both faces. */
  const sail = [0.66, 0.65, 0.62];
  const head = at(0.3, 9.4, 0);
  const tack = at(0.3, 1.1, 0);
  const clew = at(-2.6, 1.2, -1.1);
  m.tri(tack, clew, head, sail);
  m.tri(tack, head, clew, shade(sail, 0.85));
  box(m, at(-1.15, 1.15, -0.55), new THREE.Vector3().subVectors(clew, tack).normalize(), ey, new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(clew, tack).normalize(), ey).normalize(), 1.55, 0.05, 0.05, [0.5, 0.5, 0.5]);
  const jHead = at(0.3, 7.8, 0);
  const jTack = at(3.15, 0.55, 0);
  const jClew = at(0.9, 0.9, -1.0);
  m.tri(jTack, jClew, jHead, sail);
  m.tri(jTack, jHead, jClew, shade(sail, 0.85));
  return m.geometry();
}

/* An irregular stone, r across, its top at y + r * 0.45: a squashed
 * sphere pushed about by the noise, grey limestone, darker and greener
 * where the water covers it. */
function stone(m, rng, x, y, z, r) {
  const rows = 4;
  const cols = 7;
  const seed = rng() * 100;
  const squash = 0.45 + 0.25 * rng();
  const pts = [];
  for (let j = 0; j <= rows; j += 1) {
    const lat = -Math.PI / 2 + (j / rows) * Math.PI;
    const row = [];
    for (let i = 0; i < cols; i += 1) {
      const lon = (i / cols) * Math.PI * 2;
      const k = 0.75 + 0.5 * noise2(seed + Math.cos(lon) * 1.3 + j * 0.7, seed + Math.sin(lon) * 1.3);
      row.push(new THREE.Vector3(x + Math.cos(lat) * Math.cos(lon) * r * k, y + Math.sin(lat) * r * squash * k, z + Math.cos(lat) * Math.sin(lon) * r * k));
    }
    pts.push(row);
  }
  const base = shade([0.36, 0.35, 0.32], 0.7 + 0.45 * rng());
  const colourAt = (p) => {
    if (p.y < LAKE_Y + 0.05) {
      return [base[0] * 0.55, base[1] * 0.62, base[2] * 0.45];
    }
    return p.y < LAKE_Y + 0.25 ? shade(base, 0.6) : base;
  };
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const a = pts[j][i];
      const b = pts[j][(i + 1) % cols];
      const c = pts[j + 1][(i + 1) % cols];
      const d = pts[j + 1][i];
      const mid = a.clone().add(c).multiplyScalar(0.5);
      m.quad(a, d, c, b, colourAt(mid));
    }
  }
}

/* A bench on the promenade: two concrete feet, a seat and a back of
 * slats, facing along `yaw`. */
function bench(m, x, y, z, yaw) {
  const [ex, ey, ez] = frame(yaw + Math.PI / 2);
  const at = (a, b, d) => new THREE.Vector3(x, y, z).addScaledVector(ex, a).addScaledVector(ey, b).addScaledVector(ez, d);
  for (const a of [-0.8, 0.8]) {
    box(m, at(a, 0.22, 0), ex, ey, ez, 0.05, 0.22, 0.24, CONCRETE);
    box(m, at(a, 0.62, 0.22), ex, ey, ez, 0.04, 0.3, 0.035, IRON);
  }
  for (let k = 0; k < 3; k += 1) {
    box(m, at(0, 0.46, -0.16 + k * 0.15), ex, ey, ez, 0.95, 0.025, 0.055, shade(SLAT, 0.9 + 0.1 * k));
  }
  for (let k = 0; k < 2; k += 1) {
    box(m, at(0, 0.66 + k * 0.17, 0.25), ex, ey, ez, 0.95, 0.055, 0.02, shade(SLAT, 1 - 0.08 * k));
  }
}

/* A turned post, `sides` round, from radius r0 at y0 to r1 at y1 on
 * the vertical through c. */
function post(m, c, y0, y1, r0, r1, colour, sides = 8) {
  const at = (y, r, k) => new THREE.Vector3(c.x + Math.cos((k / sides) * Math.PI * 2) * r, y, c.z + Math.sin((k / sides) * Math.PI * 2) * r);
  for (let k = 0; k < sides; k += 1) {
    m.quad(at(y0, r0, k + 1), at(y0, r0, k), at(y1, r1, k), at(y1, r1, k + 1), shade(colour, 0.85 + 0.3 * ((k % 4) / 3)));
  }
  if (r1 > 0) {
    const top = new THREE.Vector3(c.x, y1, c.z);
    for (let k = 0; k < sides; k += 1) {
      m.tri(top, at(y1, r1, k + 1), at(y1, r1, k), shade(colour, 1.2));
    }
  }
}

/* A promenade lamp, the cast iron kind the lakeside communes put up: a
 * fluted foot swelling out of the gravel, a slim tapering column with a
 * collar, a lantern of four panes under a hipped cap, and its finial. */
function lamp(m, x, y, z) {
  const c = new THREE.Vector3(x, y, z);
  post(m, c, y - 0.05, y + 0.18, 0.2, 0.18, IRON);
  post(m, c, y + 0.18, y + 0.62, 0.17, 0.09, IRON);
  post(m, c, y + 0.62, y + 0.72, 0.1, 0.1, IRON);
  post(m, c, y + 0.72, y + 3.35, 0.065, 0.045, IRON);
  post(m, c, y + 3.35, y + 3.45, 0.09, 0.09, IRON);
  post(m, c, y + 3.45, y + 3.55, 0.11, 0.15, IRON, 4);
  post(m, c, y + 3.55, y + 3.98, 0.15, 0.19, [0.55, 0.53, 0.46], 4);
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * Math.PI * 2;
    post(m, new THREE.Vector3(x + Math.cos(a) * 0.17, 0, z + Math.sin(a) * 0.17), y + 3.55, y + 3.99, 0.014, 0.014, IRON, 4);
  }
  post(m, c, y + 3.98, y + 4.04, 0.25, 0.25, IRON, 4);
  post(m, c, y + 4.04, y + 4.3, 0.25, 0, IRON, 4);
  post(m, c, y + 4.3, y + 4.42, 0.02, 0.012, IRON, 4);
}

/* A bin by a bench, on its post. */
function bin(m, x, y, z) {
  const [ex, ey, ez] = frame(0.3);
  box(m, new THREE.Vector3(x, y + 0.3, z), ex, ey, ez, 0.035, 0.3, 0.035, IRON);
  box(m, new THREE.Vector3(x, y + 0.62, z), ex, ey, ez, 0.17, 0.22, 0.17, [0.04, 0.09, 0.05]);
  box(m, new THREE.Vector3(x, y + 0.86, z), ex, ey, ez, 0.19, 0.02, 0.19, IRON);
}

/* The sailing boat's course: back and forth across the wind, which blows
 * down the valley toward +x, -z, from one side of the lake to the other,
 * turning at each end. Position and heading at `s` metres along it. It
 * lies 150 m to the north west of the lake's middle, where an aircraft on
 * floats starts (src/game/water.js, x 196, z 2305): through the middle,
 * her wake's arms and trail swept the floats' spawn, a hard edged band of
 * roughened water round the aircraft that read as the edge of something
 * drawn. Out here the nearest leg passes 160 m off it. */
const COURSE = { cx: 65, cz: 2450, ux: 0.6, uz: 0.8, half: 230, turn: 28 };
function onCourse(s) {
  const { cx, cz, ux, uz, half, turn } = COURSE;
  const leg = 2 * half;
  const arc = Math.PI * turn;
  const lap = 2 * (leg + arc);
  let t = ((s % lap) + lap) % lap;
  /* Across the course: to one side on the outward leg, the other back. */
  const vx = -uz;
  const vz = ux;
  if (t < leg) {
    const a = -half + t;
    return { x: cx + ux * a + vx * turn, z: cz + uz * a + vz * turn, hx: ux, hz: uz };
  }
  t -= leg;
  if (t < arc) {
    const th = t / turn;
    const px = cx + ux * half;
    const pz = cz + uz * half;
    const ox = vx * Math.cos(th) + ux * Math.sin(th);
    const oz = vz * Math.cos(th) + uz * Math.sin(th);
    return { x: px + ox * turn, z: pz + oz * turn, hx: -vx * Math.sin(th) + ux * Math.cos(th), hz: -vz * Math.sin(th) + uz * Math.cos(th) };
  }
  t -= arc;
  if (t < leg) {
    const a = half - t;
    return { x: cx + ux * a - vx * turn, z: cz + uz * a - vz * turn, hx: -ux, hz: -uz };
  }
  t -= leg;
  const th = t / turn;
  const px = cx - ux * half;
  const pz = cz - uz * half;
  const ox = -vx * Math.cos(th) - ux * Math.sin(th);
  const oz = -vz * Math.cos(th) - uz * Math.sin(th);
  return { x: px + ox * turn, z: pz + oz * turn, hx: vx * Math.sin(th) - ux * Math.cos(th), hz: vz * Math.sin(th) - uz * Math.cos(th) };
}

/* Metres a second the sailing boat makes, and where on its course it is
 * at the clock's zero: out in the middle of the lake, where the north
 * shore's views and the view from above all see it. */
const BOAT_SPEED = 2.4;
const BOAT_START = 300;
/*
 * The sailing boat's moving boxes, in its own frame (sailingBoat's: x
 * along, y up, z across, the sails to -z before the mirror), each
 * [along, up, across, half side, half height]: three down the hull, and
 * the sails in three bands narrowing to the head, where the heel carries
 * them a metre and a half to leeward. A box is axis aligned and never
 * turns, so each is a square column, as alps/life.js cuts its vehicles.
 */
const SAIL_BOXES = [
  [-2.15, 0.3, 0, 1.1, 0.8], [0, 0.3, 0, 1.1, 0.8], [2.15, 0.3, 0, 1.1, 0.8],
  [-2.0, 2.3, -0.8, 0.75, 1.3], [-0.6, 2.3, -0.8, 0.75, 1.3], [0.8, 2.3, -0.8, 0.75, 1.3], [2.2, 2.3, -0.8, 0.75, 1.3],
  [-1.1, 5.0, -1.0, 0.65, 1.4], [0.1, 5.0, -1.0, 0.65, 1.4], [1.3, 5.0, -1.0, 0.65, 1.4],
  [0.05, 7.95, -1.3, 0.8, 1.55],
];
/*
 * The promenade's path along `line` (points a few metres apart), laid as
 * the lake's paths are: compacted gravel of a warm grey brown, darker and
 * smoother along the two lines people walk, looser between them and at
 * the sides, speckled with pebbles, its edges wandering where the grass
 * has crept in, and tufts growing through. A grid of small cells each
 * shaded on its own with a centimetre of relief, so it has a grain at a
 * few metres and is a worn line from the far shore. Where it meets the
 * jetty's track (at x `trackX`) it widens into it in a curve, as a path
 * does where people turn. Round 8's first try was the map's gravel
 * ribbon, 2.6 m wide with ruled edges: a pale slab across lake-edge.
 */
function promenadePath(m, heightAt, line, trackX) {
  const pts = [];
  for (let k = 1; k < line.length; k += 1) {
    const a = line[k - 1];
    const b = line[k];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.45));
    for (let q = 0; q < n; q += 1) {
      pts.push({ x: a.x + ((b.x - a.x) * q) / n, z: a.z + ((b.z - a.z) * q) / n });
    }
  }
  pts.push(line[line.length - 1]);
  const ACROSS = 6;
  const rows = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 3)];
    const b = pts[Math.min(pts.length - 1, i + 3)];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const nx = -(b.z - a.z) / l;
    const nz = (b.x - a.x) / l;
    const d = Math.abs(p.x - trackX);
    const flare = 2.2 * (1 - Math.min(1, Math.max(0, (d - 1.6) / 4.5))) ** 2;
    const half = 0.85 + 0.25 * noise2(p.x / 9 + 1.7, p.z / 9) + flare;
    const row = [];
    for (let j = 0; j <= ACROSS; j += 1) {
      const u = (j / ACROSS) * 2 - 1;
      const rag = j === 0 || j === ACROSS ? 0.3 * (noise2(p.x / 1.3 + u * 5, p.z / 1.3) - 0.5) : 0;
      const x = p.x + nx * (u * half + rag);
      const z = p.z + nz * (u * half + rag);
      const lift = 0.035 + 0.012 * (noise2(x * 3.1, z * 3.1) - 0.5) - (Math.abs(u) > 0.9 ? 0.02 : 0);
      row.push({ v: new THREE.Vector3(x, heightAt(x, z) + lift, z), u });
    }
    return row;
  });
  const GRAVEL = [0.2, 0.165, 0.12];
  const colourAt = (p, u) => {
    /* The two worn lines, about a third of the way in from each side. */
    const worn = Math.max(0, 1 - Math.abs(Math.abs(u) - 0.38) / 0.22);
    const grain = 0.78 + 0.44 * noise2(p.x * 2.3, p.z * 2.3) + 0.2 * (noise2(p.x * 7.1 + 3, p.z * 7.1) - 0.5);
    let c = shade(GRAVEL, grain * (1 - 0.16 * worn) * (1 + 0.1 * (1 - worn)));
    if (noise2(p.x * 5.3 + 11, p.z * 5.3) > 0.78 && worn < 0.5) {
      c = shade([0.34, 0.31, 0.27], 0.9 + 0.3 * noise2(p.x * 9, p.z * 9));
    }
    /* Earth and grass creeping in at the edges and in the hump between
     * the lines. */
    const edge = Math.max(0, (Math.abs(u) - 0.72) / 0.28) * (0.5 + 0.5 * noise2(p.x / 2.1, p.z / 2.1));
    const hump = (1 - Math.min(1, Math.abs(u) / 0.12)) * 0.35 * noise2(p.x / 3.3 + 7.7, p.z / 3.3);
    const g = Math.min(1, edge + hump);
    return [c[0] + (0.07 - c[0]) * g, c[1] + (0.085 - c[1]) * g, c[2] + (0.035 - c[2]) * g];
  };
  for (let i = 1; i < rows.length; i += 1) {
    if (Math.abs(pts[i].x - trackX) < 1.5) {
      continue;
    }
    for (let j = 0; j < ACROSS; j += 1) {
      const a = rows[i - 1][j];
      const b = rows[i - 1][j + 1];
      const c = rows[i][j + 1];
      const d = rows[i][j];
      m.quad(a.v, d.v, c.v, b.v, colourAt(a.v.clone().add(c.v).multiplyScalar(0.5), (a.u + b.u) / 2));
    }
  }
  /* Tufts through the gravel: at its edges, and here and there in the
   * middle where fewer feet go. Their own rng, so nothing else moves. */
  const trng = makeRng(20261103);
  for (let i = 2; i < rows.length; i += 2) {
    if (Math.abs(pts[i].x - trackX) < 2 || trng() > 0.45) {
      continue;
    }
    const edge = trng() < 0.75;
    const u = edge ? (trng() < 0.5 ? -1 : 1) * (0.8 + 0.2 * trng()) : (trng() - 0.5) * 0.15;
    const j = Math.max(0, Math.min(ACROSS, Math.round(((u + 1) / 2) * ACROSS)));
    const base = rows[i][j].v;
    tuft(m, trng, base.x + (trng() - 0.5) * 0.3, base.y - 0.02, base.z + (trng() - 0.5) * 0.3, edge ? 0.28 : 0.14);
  }
}

/* A tuft of grass, a few blades h high leaning out, both faces. */
function tuft(m, rng, x, y, z, h) {
  const n = 4 + Math.floor(rng() * 4);
  for (let k = 0; k < n; k += 1) {
    const a = rng() * Math.PI * 2;
    const lean = 0.25 + 0.35 * rng();
    const hh = h * (0.6 + 0.6 * rng());
    const w = 0.012 + 0.01 * rng();
    const bx = x + Math.cos(a) * 0.04;
    const bz = z + Math.sin(a) * 0.04;
    const p0 = new THREE.Vector3(bx - Math.sin(a) * w, y, bz + Math.cos(a) * w);
    const p1 = new THREE.Vector3(bx + Math.sin(a) * w, y, bz - Math.cos(a) * w);
    const tip = new THREE.Vector3(bx + Math.cos(a) * hh * lean, y + hh, bz + Math.sin(a) * hh * lean);
    const colour = rng() < 0.2 ? [0.12, 0.11, 0.05] : shade([0.05, 0.085, 0.025], 0.8 + 0.5 * rng());
    m.tri(p0, p1, tip, colour);
    m.tri(p1, p0, tip, colour);
  }
}

/* The water's own wind (water/index.js), which the boats lie to. */
const WIND = new THREE.Vector2(0.8, -0.6).normalize();

/*
 * Build it all. ctx: heightAt, footprints (the map's walls, which the
 * hamlet's houses and the promenade join), `bake`, the kit's bake the
 * buildings are put into (the caller bakes it, buildings/bake.js), and,
 * when the map collides, its colliders and its list of roofs: every
 * building here is walls under a roof that is ground (library/roofs.js),
 * its footprint the one it always had and noted as it always was, by
 * the push below.
 */
export function buildLakeside({
  heightAt, footprints, bake, colliders = null, roofs = [],
}) {
  const rng = makeRng(20261101);
  /* The chalets' own draws (houses.js chalet draws for a balcony on a
   * lower storey), so the hamlet's rng goes on as it did. */
  const houseRng = makeRng(20261104);
  const m = new Mesher();
  /* Stand a building's walls, and put its stand-in for the distance
   * into the lakeside's mesh (props/mesh.js roofProxy; `far` its
   * colours, none for a boathouse, whose open end looks into it). */
  const stand = ({ box: walls, roofs: own, parts }, far = null) => {
    if (colliders) {
      standWalls(colliders, walls, own, 0, { parts, note: false });
      roofs.push(...own);
    }
    if (!far) {
      return;
    }
    for (const rec of own) {
      if (rec.kind !== 'dormer') {
        roofProxy(m, rec, {
          low: far.low ?? walls[1], inset: 0.6, wall: far.wall, roof: albedoOf(String(rec.key).split(':')[0]),
        });
      }
    }
  };
  /* A wall in `below` under the height `split` and `above` over it. */
  const twoTone = (split, below, above) => (y) => albedoOf(y < split ? below : above);
  const group = new THREE.Group();
  group.name = 'swiss2-lakeside';
  const { shore: rim, cx: lakeX, cz: lakeZ } = lakeShore(heightAt, 288);
  const walls = [];
  /* The shore point nearest x on the south or north side, and the unit
   * vector from it away from the water. */
  const shoreAt = (x, south) => {
    const p = rim.filter((q) => (south ? q.z > lakeZ : q.z < lakeZ)).reduce((best, q) => (Math.abs(q.x - x) < Math.abs(best.x - x) ? q : best));
    const l = Math.hypot(p.x - lakeX, p.z - lakeZ);
    return { x: p.x, z: p.z, ox: (p.x - lakeX) / l, oz: (p.z - lakeZ) / l };
  };
  const faceLake = (p) => Math.atan2(-p.ox, p.oz);

  /* THE HAMLET: rows stepping up from the south shore, close together
   * round the church and the hotel and thinning out along the shore
   * either side, as a lake village grows from its landing stage. The
   * front row's gables are to the water; up the slope a house turns
   * its ridge along the contour now and then. Each house's size and
   * finish from the hamlet's own rng. */
  const CENTRE = 90;
  const rows = [
    { back: 15, step: 19, reach: 230 },
    { back: 33, step: 21, reach: 190 },
    { back: 52, step: 23, reach: 150 },
    { back: 72, step: 27, reach: 110 },
  ];
  /* The hotel's and the church's plots, which the rows leave free. */
  const keepClear = [{ x: 76, back: 18, r: 14 }, { x: 58, back: 70, r: 14 }];
  const sites = [];
  let houses = 0;
  rows.forEach(({ back, step, reach }, row) => {
    for (let sx = CENTRE - reach + (row % 2) * step * 0.5; sx <= CENTRE + reach; sx += step) {
      const along = sx + (rng() - 0.5) * step * 0.4;
      const thin = Math.abs(along - CENTRE) / reach;
      const p = shoreAt(along, true);
      const b = back + (rng() - 0.5) * 6;
      const x = p.x + p.ox * b;
      const z = p.z + p.oz * b;
      const g = heightAt(x, z);
      const spare = rng();
      if (spare < thin * 0.55 || g < LAKE_Y + 1 || g > LAKE_Y + 30 || keepClear.some((c) => Math.abs(along - c.x) < c.r && Math.abs(b - c.back) < c.r)) {
        continue;
      }
      const big = rng();
      const turned = row > 0 && rng() < 0.3;
      const w = 8.5 + 3.5 * big;
      const d = 10 + 4 * rng();
      /* Eaves and balconies reach about two metres past the walls. */
      const r = Math.hypot(w, d) / 2 + 2;
      if (sites.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + r)) {
        continue;
      }
      sites.push({ x, z, r });
      const spec = {
        yaw: faceLake(p) + (turned ? Math.PI / 2 : 0) + (rng() - 0.5) * 0.3,
        floors: 2 + (big > 0.6 ? 1 : 0),
        masonry: 1 + (rng() < 0.35 ? 1 : 0),
        balconies: 1 + (big > 0.6 ? 1 : 0),
      };
      const look = houseDraws(rng, spec);
      const corners = cornersOf(x, z, spec.yaw, w, d);
      const common = {
        w, d, board: look.board, shutter: look.shutter, roofKey: look.cover, pitch: 0.42,
      };
      /* A house of one rendered storey is a chalet, its log storeys over
       * it; of two, a town house. Its gable, where the balconies are,
       * to the water (+z of the frame is -ez of the old one). */
      const house = spec.masonry === 1
        ? (f, found) => chalet(f, houseRng, {
          ...common, found, floors: spec.floors - 1, roof: 'gable', base: 'render', balconies: spec.balconies > 1 ? 'both' : 'one',
        })
        : (f, found) => townhouse(f, houseRng, {
          ...common, found, storeys: 2, timber: spec.floors - 2, balconies: spec.balconies,
        });
      /* The slope falls toward the water, under the gable: the cellar's
       * door is there. */
      const build = (f, found) => {
        const ext = house(f, found);
        cellar(kitFrame(f, 0, 0, d / 2 + 0.1, 0), w + 0.2, found);
        return ext;
      };
      const built = placeInto(bake, build, {
        x, z, ry: Math.PI - spec.yaw, ground: corners.map((c) => heightAt(c.x, c.z)), kind: 'lakeHouse',
      });
      const rendered = spec.masonry === 1 ? 2.62 : 0.12 + 2 * 2.8;
      stand(built, { wall: twoTone(built.at + rendered, 'render', look.board) });
      walls.push(footprintOf(corners));
      houses += 1;
    }
  });
  /* The hotel at the landing stage: four limed storeys, a balcony at
   * every room on the lake front, its restaurant's terrace on the shore
   * (buildings/lake.js). Its front is the frame's -x. */
  {
    const p = shoreAt(76, true);
    const x = p.x + p.ox * 18;
    const z = p.z + p.oz * 18;
    const yaw = faceLake(p);
    houseDraws(rng, {
      floors: 4, masonry: 4, plaster: 'given', roof: 'given', shutter: 'given',
    });
    const corners = cornersOf(x, z, yaw, 17, 13);
    stand(placeInto(bake, (f, found) => hotel(f, { w: 13, d: 17, found }), {
      x, z, ry: -yaw - Math.PI / 2, ground: corners.map((c) => heightAt(c.x, c.z)), kind: 'lakeHouse',
    }), { wall: () => albedoOf('renderCream') });
    walls.push(footprintOf(corners));
    /* The landing stage for the lake boats, out from in front of it, and
     * the ticket hut on it. */
    const ys = faceLake(p) - Math.PI / 2;
    const deckY = LAKE_Y + 1.3;
    const ex = { x: Math.cos(ys), z: Math.sin(ys) };
    const root = { x: p.x - ex.x * 4.5, z: p.z - ex.z * 4.5 };
    const stage = kitFrame(bake, root.x, deckY, root.z, -ys);
    landingStage(stage, { len: 27, w: 3.8, heightAt });
    const hutAt = { x: root.x + ex.x * 23.5, z: root.z + ex.z * 23.5 };
    stand(placeInto(bake, (f) => stageHut(f, { w: 3.4, d: 4.0 }), {
      x: hutAt.x, z: hutAt.z, ry: -ys - Math.PI / 2, ground: [deckY], y: deckY, kind: 'kiosk',
    }), { low: deckY + 0.05, wall: () => albedoOf('larch') });
  }
  /* The church, up the slope behind the hotel: the village's church on
   * the lake church's plan, its tower toward the water. 74 m up from
   * the shore, still in its plot: at 70 its tower's corner stood a metre
   * into the house below it, and the nave's walls rose through that
   * house's roof (scripts/collide-audit-swiss2.js). */
  {
    const p = shoreAt(58, true);
    const x = p.x + p.ox * 74;
    const z = p.z + p.oz * 74;
    const yaw = faceLake(p);
    const corners = cornersOf(x, z, yaw, 8.5, 17);
    const built = placeInto(bake, (f, found) => church(f, {
      found, w: 8.5, d: 17, tw: 4.6, towerH: 17, yard: false,
    }), {
      x, z, ry: Math.PI - yaw, ground: corners.map((c) => heightAt(c.x, c.z)), kind: 'church',
    });
    stand(built, { wall: () => albedoOf('render') });
    walls.push(footprintOf(corners));
  }

  /* BOATHOUSES at the water: a row along the hamlet's front and one at
   * each corner of the south shore. */
  let sheds = 0;
  for (const sx of [-150, -96, -18, 180, 232, 330, 560]) {
    const p = shoreAt(sx, true);
    const x = p.x - p.ox * 2;
    const z = p.z - p.oz * 2;
    const spec = {
      x, z, yaw: Math.atan2(-p.oz, -p.ox), len: 8 + 3 * rng(), w: 5 + rng(), h: 2.6 + 0.4 * rng(),
    };
    shedDraws(rng, spec.h);
    stand(placeBoathouse(bake, heightAt, spec));
    sheds += 1;
  }

  /* THE MOORINGS: boats on buoys off the hamlet and off the north
   * shore's jetty, all lying head to the wind. */
  const windYaw = Math.atan2(-WIND.y, -WIND.x);
  const kinds = ['row', 'row', 'launch', 'yacht', 'launch', 'row'];
  let boats = 0;
  const moor = (x, z) => {
    if (LAKE_Y - heightAt(x, z) < 1.2) {
      return;
    }
    mooredBoat(m, rng, x, z, windYaw + (rng() - 0.5) * 0.3, kinds[Math.floor(rng() * kinds.length)], colliders);
    boats += 1;
  };
  for (let k = 0; k < 16; k += 1) {
    const p = shoreAt(-60 + k * 24 + (rng() - 0.5) * 10, true);
    const out = 35 + 45 * rng();
    moor(p.x - p.ox * out, p.z - p.oz * out);
  }
  const clear = jettyClear(heightAt);
  for (let k = 0; k < 7; k += 1) {
    const p = shoreAt(230 + k * 26 + (rng() - 0.5) * 8, false);
    const out = 30 + 40 * rng();
    const x = p.x - p.ox * out;
    const z = p.z - p.oz * out;
    if (!clear(x, z)) {
      moor(x, z);
    }
  }

  /* THE PROMENADE on the north shore: a gravel path along the top of
   * the beach from the stream's mouth to the lake's east end, benches on
   * its lake side facing the water, lamps between them, a bin by every
   * other bench. The benches and lamps are spaced by hand, as a commune
   * spaces them, so that one of each stands where the lake-edge view
   * looks out over them: the jetty's lamp to the left of the track down
   * to it, a bench to the right. */
  const jetty = shoreAt(197, false);
  const UP_BEACH = 10;
  const line = rim
    .filter((q) => q.z < lakeZ && q.x > 60 && q.x < 470)
    .sort((a, b) => a.x - b.x)
    .map((q) => {
      const l = Math.hypot(q.x - lakeX, q.z - lakeZ);
      const ox = (q.x - lakeX) / l;
      const oz = (q.z - lakeZ) / l;
      return { x: q.x + ox * UP_BEACH, z: q.z + oz * UP_BEACH, ox, oz };
    });
  const walk = [];
  for (let k = 1; k < line.length; k += 1) {
    const a = line[k - 1];
    const b = line[k];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 3));
    for (let q = 0; q < n; q += 1) {
      walk.push({ x: a.x + ((b.x - a.x) * q) / n, z: a.z + ((b.z - a.z) * q) / n });
    }
  }
  walk.push(line[line.length - 1]);
  promenadePath(m, heightAt, walk, valleyAxis(ROAD_END) + ROAD_DX);
  /* The path's footprint, in short boxes along it, so the meadow's grass
   * keeps off its middle and leans in over its edges. The path runs
   * east and west, so the boxes are long in x. */
  for (const p of walk) {
    walls.push({ minX: p.x - 1.6, maxX: p.x + 1.6, minZ: p.z - 0.55, maxZ: p.z + 0.55 });
  }
  /* Where the path is at x, and which way the water is from it, two
   * metres toward the water from its middle. */
  const besidePath = (x) => {
    let k = 1;
    while (k < line.length - 1 && line[k].x < x) {
      k += 1;
    }
    const a = line[k - 1];
    const b = line[k];
    const t = Math.max(0, Math.min(1, (x - a.x) / Math.max(1e-6, b.x - a.x)));
    const ox = a.ox + (b.ox - a.ox) * t;
    const oz = a.oz + (b.oz - a.oz) * t;
    const px = a.x + (b.x - a.x) * t - ox * 2;
    const pz = a.z + (b.z - a.z) * t - oz * 2;
    return { x: px, z: pz, y: heightAt(px, pz), yaw: Math.atan2(-oz, -ox), ox, oz };
  };
  const BENCHES = [112, 150, 189, 228, 268, 310, 352, 396, 438];
  const LAMPS = [131, 168, 200, 248, 289, 331, 374, 417];
  /* A bench a bar along its seat and back, a bin and a lamp posts. */
  const solid = (kind, surface, ...args) => {
    if (colliders) {
      colliders.add(kind, ...args);
      setSolidSurface(colliders, colliders.ax.length - 1, surface);
    }
  };
  BENCHES.forEach((bx, k) => {
    const p = besidePath(bx);
    bench(m, p.x, p.y + 0.02, p.z, p.yaw);
    solid('obstacle', 'wood', p.x - p.oz * 0.7, p.y + 0.5, p.z + p.ox * 0.7, p.x + p.oz * 0.7, p.y + 0.5, p.z + p.ox * 0.7, 0.45);
    if (k % 2 === 0) {
      const bx2 = p.x + p.oz * 1.5;
      const bz2 = p.z - p.ox * 1.5;
      solid('pole', 'metal', bx2, p.y, bz2, bx2, p.y + 0.7, bz2, 0.2);
      bin(m, bx2, p.y, bz2);
    }
  });
  for (const lx of LAMPS) {
    const p = besidePath(lx);
    lamp(m, p.x, p.y, p.z);
    solid('pole', 'metal', p.x, p.y, p.z, p.x, p.y + 4.2, p.z, 0.12);
  }
  const benches = BENCHES.length;
  const lamps = LAMPS.length;

  /* STONES along the beach and out into the shallows either side of the
   * jetty: big ones bedded in the gravel at the water's edge, smaller
   * ones scattered out under the water, where the lake-edge view looks
   * down into it. */
  const srng = makeRng(20261102);
  let stones = 0;
  for (let k = 0; k < 160 && stones < 70; k += 1) {
    const x = jetty.x + (srng() - 0.5) * 70;
    const z = jetty.z - 6 + srng() * 26;
    const g = heightAt(x, z);
    const depth = LAKE_Y - g;
    if (clear(x, z) || depth > 1.4 || depth < -0.9) {
      continue;
    }
    const r = (depth > 0.2 ? 0.25 : 0.35) + 0.6 * srng() * srng();
    stone(m, srng, x, g + r * 0.12, z, r);
    stones += 1;
  }

  const mat = propMaterial();
  const mesh = new THREE.Mesh(m.geometry(), mat);
  mesh.name = 'swiss2-lakeside';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  /* The sailing boat under way, a pure function of the step clock as
   * the valley's traffic is (alps/life.js), and solid on it: its boxes
   * are moved by what it could cover since the last update, and seated
   * with no sweep when the clock jumps (a throw, the title's loop). */
  const sail = new THREE.Mesh(sailingBoat(), mat);
  sail.name = 'swiss2-sailing-boat';
  sail.castShadow = true;
  group.add(sail);
  const boat = new THREE.Vector4();
  const sailBoxes = colliders ? SAIL_BOXES.map(([, , , h, hy]) => {
    const i = colliders.addMoving('obstacle', h, hy, h);
    colliders.seatMoving(i, 0, -1e4, 0);
    return i;
  }) : [];
  let lastMs = null;
  const place = (tMs) => {
    const p = onCourse(BOAT_START + BOAT_SPEED * tMs * 0.001);
    sail.position.set(p.x, LAKE_Y, p.z);
    sail.rotation.set(0, Math.atan2(-p.hz, p.hx), 0);
    /* The wind over the port side or the starboard: heel and main to
     * the other. */
    const cross = p.hx * WIND.y - p.hz * WIND.x;
    const flip = cross > 0 ? -1 : 1;
    sail.scale.set(1, 1, flip);
    sail.updateMatrixWorld();
    boat.set(p.x, p.z, p.hx * BOAT_SPEED, p.hz * BOAT_SPEED);
    /* Local z is world (-hz, hx) turned with the hull, mirrored on the
     * other tack. */
    const dt = lastMs === null ? -1 : tMs - lastMs;
    lastMs = tMs;
    const reach = (BOAT_SPEED + 1) * dt * 0.001 + 0.05;
    SAIL_BOXES.forEach(([a, up, c], k) => {
      const i = sailBoxes[k];
      if (i === undefined) {
        return;
      }
      const x = p.x + p.hx * a - p.hz * c * flip;
      const y = LAKE_Y + up;
      const z = p.z + p.hz * a + p.hx * c * flip;
      const moved = Math.hypot(x - colliders.movingCx[i], y - colliders.movingCy[i], z - colliders.movingCz[i]);
      if (dt >= 0 && dt <= 250 && moved <= reach) {
        colliders.setMovingCentre(i, x, y, z);
      } else {
        colliders.seatMoving(i, x, y, z);
      }
    });
  };
  place(0);

  for (const f of walls) {
    footprints.push(f);
  }
  return {
    group,
    boat,
    /* The map's updateAnim and sweepSolids (alps/life.js): the boat at
     * the step clock's tMs, and over a contact pass's stretch of it. */
    updateAnim(tMs) {
      place(tMs);
    },
    sweepSolids(fromMs, toMs) {
      lastMs = null;
      place(fromMs);
      place(toMs);
    },
    /* The boat for the world's sound (src/render/world-audio.js): add(id,
     * kind, x, y, z), at its waterline. */
    audioSources(add, id) {
      add(id, 'sailboat', sail.position.x, LAKE_Y, sail.position.z);
    },
    stats: {
      houses, sheds, boats, benches, lamps, stones, triangles: m.pos.length / 9,
    },
    dispose() {
      group.removeFromParent();
      mesh.geometry.dispose();
      sail.geometry.dispose();
      mat.dispose();
    },
  };
}
