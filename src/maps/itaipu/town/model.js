/*
 * model.js: the town in numbers, drawn through a sink and collided
 * through the streamed set: every building (plan.js), road and bridge
 * (roads.js), tower and wire (power.js) and the Friendship Bridge
 * (bridge.js), from package A's osm/*.json.
 *
 * What it keeps for the flight:
 *
 *   records   every roof and deck as ground (roofs.js records), which the
 *             part hands the map with its own;
 *   fixed     the bridges' decks and rails as boxes, for the static set
 *             (a few hundred; everything else would be tens of thousands
 *             and is streamed);
 *   stream    the map's seam for the streamed set ({ wants, fill,
 *             swapped }, src/maps/itaipu.js): the walls of every
 *             building whose middle is within WALLS_R of the pilot, and
 *             every tower piece and wire chord within WIRES_R; swapped
 *             gives each roof its walls' indices, which roofs.js cover
 *             passes when the roof is the craft's ground.
 *
 * Pure: no THREE, so the checks build the whole town in Node against the
 * data and count it.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import {
  cleanRing, rectOf, styleOf, heightsOf, rectRing, roofOf, wallFaces, wallBoxes, landuseAreas,
} from './plan.js';
import { layRoads, deckOf } from './roads.js';
import { layOut, piecesOf, bracesOf, WIRE_R } from './power.js';
import { buildBridge } from './bridge.js';

/*
 * Section 7: walls within 1 000 m of the pilot, in columns 1 m wide
 * wherever a building is turned. Measured on the data, that is 27 000
 * boxes at the densest point (Hernandarias, 1 776 buildings), more than
 * the whole streamed set may hold with the near trees (25 000, section
 * 13): the plan's guess of the columns was low, because half the town is
 * turned off the world's axes (Foz do Iguacu's grid is) and a turned
 * building is a column per metre of its width.
 *
 * But the craft is never more than MOVE from the centre of the set in
 * force before the next refill is under way, and a refill is in within a
 * few frames. So it can only reach walls within
 * FINE_R of the centre, and those are the columns. From FINE_R to WALLS_R
 * a building is the one box round its walls: every wall within 1 000 m is
 * solid, and the refill that brings the craft near a building brings its
 * columns. The towers and wires are streamed to FINE_R alone, for the
 * same reason: 24 000 chords over the hero would be most of a static set,
 * and nothing past FINE_R can be reached before the next refill.
 */
export const WALLS_R = 1000;
export const FINE_R = 450;
export const WIRES_R = FINE_R;
/* The town's set is refilled when the pilot is this far from where it
 * was filled: sooner than the plan's 400 m (section 7), so the columns'
 * FINE_R stands 150 m clear of anywhere the craft can be before the
 * refill is in, however many frames the map's streamer takes over it. */
export const MOVE = 300;
/* Section 2: the hero square's half side. */
const HERO_HALF = 5120;
/* Galvanised steel, a shade darker than new. */
const STEEL = [0.46, 0.47, 0.48];

const EMPTY = Object.freeze([]);

/*
 * A brace [ax, ay, az, bx, by, bz, r] of structure `s` as it is drawn far
 * off (mesh.js NEAR): a flat strip in its face of the tower, facing out
 * from the tower's middle, as wide as the square bar's diagonal (its
 * widest outline). Two triangles where the bar is eight.
 */
function braceStrip(p, s) {
  const dx = p[3] - p[0];
  const dy = p[4] - p[1];
  const dz = p[5] - p[2];
  const n = [(p[0] + p[3]) / 2 - s.x, 0, (p[2] + p[5]) / 2 - s.z];
  let wx = dy * n[2];
  let wy = dz * n[0] - dx * n[2];
  let wz = -dy * n[0];
  const k = (p[6] * Math.SQRT2) / Math.sqrt(wx * wx + wy * wy + wz * wz);
  wx *= k;
  wy *= k;
  wz *= k;
  return {
    pts: [
      [p[0] - wx, p[1] - wy, p[2] - wz], [p[0] + wx, p[1] + wy, p[2] + wz],
      [p[3] + wx, p[4] + wy, p[5] + wz], [p[3] - wx, p[4] - wy, p[5] - wz],
    ],
    n,
  };
}

function need(data, name) {
  const d = data[name];
  if (!d) {
    throw new Error(`town: the data has no ${name}`);
  }
  return d;
}

/* Every point of a hero feature inside the hero square: A's contract
 * (validate.py), checked where it is read. */
function inHero(points, what) {
  for (const [x, z] of points) {
    if (!(Math.abs(x) <= HERO_HALF + 1e-6 && Math.abs(z) <= HERO_HALF + 1e-6)) {
      throw new Error(`town: ${what} has a point at (${x}, ${z}), outside the hero square`);
    }
  }
}

/*
 * The town. `data` is ctx.data, `ground` ctx.ground, `sink` { face, bar }
 * (mesh.js, or a counter), `progress(f)` the part's share of the bar.
 */
export async function planTown({ data, ground, sink, progress = () => {}, yieldEvery = async () => {} }) {
  const buildingsData = need(data, 'osm/buildings.json');
  const roadsData = need(data, 'osm/roads.json');
  const powerData = need(data, 'osm/power.json');
  const landuse = need(data, 'osm/landuse.json');
  const industrial = landuseAreas(landuse.features, 'industrial');
  const records = [];
  const fixed = [];
  const counts = {
    buildings: 0, roofs: { house: 0, shed: 0, flat: 0 }, heightFrom: {}, crossedFootprints: 0, wallBoxes: 0,
    maxBoxesOneBuilding: 0,
  };

  /* Buildings. */
  const buildings = [];
  const list = buildingsData.features;
  for (let k = 0; k < list.length; k += 1) {
    const f = list[k];
    inHero(f.outer, `building ${f.id}`);
    const ring = cleanRing(f.outer, f.id);
    const rect = rectOf(ring);
    const style = styleOf(f, ring, rect, industrial);
    const drawn = style.onRect ? rectRing(rect) : ring;
    const { base, plate } = heightsOf(drawn, ground, f.height);
    const roof = roofOf(style, drawn, rect, plate, f.id);
    roof.rec.osm = f.id;
    records.push(roof.rec);
    const cast = { cast: true };
    for (const w of wallFaces(drawn, base, plate)) {
      sink.face('render', style.wall, w.pts, w.n, cast);
    }
    for (const gf of roof.gables) {
      sink.face('render', style.wall, gf.pts, gf.n, cast);
    }
    for (const rf of roof.faces) {
      sink.face(style.spec.surface, style.roofTint, rf.pts, rf.n, cast);
    }
    const { boxes, eaves } = wallBoxes(drawn, rect, base, plate, roof.rec, roof.gables);
    /* The one box round the walls, for a building past FINE_R. */
    const env = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const b of boxes.slice(0, eaves)) {
      for (let a = 0; a < 3; a += 1) {
        env[a] = Math.min(env[a], b[a]);
        env[a + 3] = Math.max(env[a + 3], b[a + 3]);
      }
    }
    buildings.push({
      x: rect.cx, z: rect.cz, boxes: Float64Array.from(boxes.flat()), eaves, whole: env, rec: roof.rec,
    });
    counts.buildings += 1;
    counts.roofs[style.kind] += 1;
    counts.heightFrom[f.heightFrom] = (counts.heightFrom[f.heightFrom] ?? 0) + 1;
    counts.wallBoxes += boxes.length;
    counts.maxBoxesOneBuilding = Math.max(counts.maxBoxesOneBuilding, boxes.length);
    if (k % 2500 === 2499) {
      progress(0.6 * (k / list.length));
      await yieldEvery();
    }
  }

  /* Roads and bridges; the Friendship Bridge in the ring. */
  let friendship = null;
  const roadCounts = layRoads(roadsData.features, ground, {
    face: (paving, tint, pts) => sink.face(paving === 'earth' ? 'pathGravel' : paving, tint, pts, [0, 1, 0], { road: true }),
    bridge: (f) => {
      inHero(f.points, `bridge ${f.id}`);
      const d = deckOf(f, ground);
      for (const rec of d.records) {
        rec.osm = f.id;
        records.push(rec);
      }
      fixed.push(...d.boxes);
      for (const face of d.faces) {
        const key = face.key === 'deck' ? (d.paving === 'earth' ? 'pathGravel' : d.paving) : 'liftConcrete';
        const tint = face.key === 'deck' ? d.tint : [0.62, 0.61, 0.58];
        sink.face(key, tint, face.pts, face.n, { cast: true });
      }
    },
  });
  for (const f of roadsData.features) {
    if (f.square !== 'ring') {
      inHero(f.points, `road ${f.id}`);
    }
  }
  const ring = roadsData.features.filter((f) => f.square === 'ring');
  if (ring.length !== 1 || !/Amistad|Amizade/.test(ring[0].name ?? '')) {
    throw new Error(`town: expected the Friendship Bridge as the one ring road, got ${ring.map((f) => f.id).join(', ')}`);
  }
  friendship = buildBridge(ring[0], ground, sink);
  progress(0.8);
  await yieldEvery();

  /* Power. */
  const { structures, wires } = layOut(powerData, ground);
  const pieces = [];
  for (const s of structures) {
    inHero([[s.x, s.z]], `power ${s.id}`);
    for (const p of piecesOf(s)) {
      sink.bar('metal', STEEL, p.slice(0, 3), p.slice(3, 6), p[6], { cast: true });
      pieces.push(p);
    }
    for (const p of bracesOf(s)) {
      sink.bar('metal', STEEL, p.slice(0, 3), p.slice(3, 6), p[6], { cast: true, caps: false, lod: 'near' });
      const far = braceStrip(p, s);
      sink.face('metal', STEEL, far.pts, far.n, { cast: true, lod: 'far' });
      pieces.push(p);
    }
  }
  progress(0.95);

  /* The streamed colliders, flat: pieces then chords, with their middles. */
  const caps = [...pieces, ...wires.map((w) => [...w, WIRE_R])];
  const capMid = new Float64Array(caps.length * 2);
  caps.forEach((c, i) => {
    capMid[i * 2] = (c[0] + c[3]) / 2;
    capMid[i * 2 + 1] = (c[2] + c[5]) / 2;
  });

  /* The roofs that had walls in the set in force, what the refill in
   * progress took (for swapped), and where the set was last filled. */
  let walled = [];
  let taking = [];
  const near = {
    x: NaN, z: NaN, fills: 0, pending: false, last: null,
  };

  /* Adds between two yields of a fill: the densest refill is some 13 000
   * of them, a couple of milliseconds. */
  const SLICE_ADDS = 3000;

  /*
   * The map's seam for the streamed set (src/maps/itaipu.js, the
   * streamer): wants a refill once the pilot is MOVE from where the set
   * was filled, fills round (x, z) a slice at a time, and on the swap
   * gives each roof the indices of the walls under it.
   */
  const stream = {
    near,
    wants(x, z) {
      const dx = x - near.x;
      const dz = z - near.z;
      return !(dx * dx + dz * dz < MOVE * MOVE);
    },
    * fill(list, x, z) {
      near.x = x;
      near.z = z;
      near.fills += 1;
      near.pending = true;
      const took = [];
      taking = took;
      const r2 = WALLS_R * WALLS_R;
      const f2 = FINE_R * FINE_R;
      let whole = 0;
      let walls = 0;
      let since = 0;
      for (const b of buildings) {
        const dx = b.x - x;
        const dz = b.z - z;
        const d2 = dx * dx + dz * dz;
        if (d2 > r2) {
          continue;
        }
        if (d2 > f2) {
          took.push([b, [list.addBox('wall', ...b.whole)], 1]);
          whole += 1;
          walls += 1;
          since += 1;
        } else {
          const idx = [];
          const bx = b.boxes;
          for (let i = 0; i < bx.length; i += 6) {
            idx.push(list.addBox('wall', bx[i], bx[i + 1], bx[i + 2], bx[i + 3], bx[i + 4], bx[i + 5]));
          }
          took.push([b, idx, b.eaves]);
          walls += idx.length;
          since += idx.length;
        }
        if (since >= SLICE_ADDS) {
          since = 0;
          yield;
        }
      }
      const w2 = WIRES_R * WIRES_R;
      let power = 0;
      for (let i = 0; i < caps.length; i += 1) {
        const dx = capMid[i * 2] - x;
        const dz = capMid[i * 2 + 1] - z;
        if (dx * dx + dz * dz > w2) {
          continue;
        }
        const c = caps[i];
        list.add('pole', c[0], c[1], c[2], c[3], c[4], c[5], c[6]);
        power += 1;
      }
      near.last = {
        x, z, buildings: took.length, whole, walls, power, colliders: walls + power,
      };
    },
    swapped(offset) {
      near.pending = false;
      for (const rec of walled) {
        rec.solids = EMPTY;
        rec.eaves = EMPTY;
      }
      walled = [];
      for (const [b, idx, eaves] of taking) {
        const solids = idx.map((i) => i + offset);
        b.rec.solids = solids;
        b.rec.eaves = solids.slice(0, eaves);
        walled.push(b.rec);
      }
    },
  };

  progress(1);
  return {
    records,
    fixed,
    stream,
    buildings,
    structures,
    wires,
    friendship,
    counts: {
      ...counts,
      roads: roadCounts,
      records: records.length,
      fixedBoxes: fixed.length,
      towers: structures.filter((s) => s.kind === 'tower').length,
      portals: structures.filter((s) => s.kind === 'portal').length,
      poles: structures.filter((s) => s.kind === 'pole').length,
      wireChords: wires.length,
      powerPieces: pieces.length,
    },
  };
}
