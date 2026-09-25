/*
 * crashworld.js: what the world is made of, as the crash physics wants it.
 *
 * The plant's crash physics (docs/CRASH-STAGE1.md, surfaces and trees)
 * gives every contact a material and flies a craft INTO a tree's crown
 * rather than off it. It knows nothing about maps, so the shell names the
 * world to it: the ground's material under the craft, each obstacle's
 * material when the craft meets it, the trees near the craft, and the
 * solids near the craft for the parts that break off, which the shell's
 * own sweep does not track. This file is the one place that reads a map
 * for those answers, from what every map already has (its colliders, its
 * height field, its water) plus one optional method a map may export when
 * its ground is more than one thing:
 *
 *   view.surfaceAt(x, z, y)  the material name under a map point whose
 *                          ground is at height y (a roof over the
 *                          terrain is another material than the grass
 *                          under it), one of configs/parts.js SURFACES,
 *                          or null for "ask the default"
 *
 * Everything here is a pure function of the map and a position, so the
 * shell can call it on the sim clock and the answer is the same on every
 * machine. None of it is consulted with the damage mode off.
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

import { SURFACE } from '../../configs/parts.js';
import { contactMaterial, KINDS } from './collide.js';

/*
 * THE GROUND BY MAP, where the map does not answer for itself. Grass is
 * the plant's default ground to the bit (mu 1.40, e 0, the shell's
 * GROUND_MU and GROUND_E), so the field, the custom courses and the
 * Swiss valley's meadows change nothing a pilot already flies. The city is
 * streets; Yellowstone's geyser basin is bare earth. A room for the whoop
 * keeps today's contact: its floor is not grass, but choosing what it is
 * changes the whoop's bounce, which the crash suite measures, so it waits
 * for the loop.
 */
const MAP_GROUND = {
  city: 'asphalt',
  yellowstone: 'dirt',
};

/* Steeper than this (the up component of the ground's normal, about 41
 * degrees) and a map that does not say otherwise is rock: nothing else
 * holds on a face that steep in these valleys. */
const ROCK_NORMAL_Y = 0.75;

/*
 * The ground's material under (x, z). `normalY` is the up component of
 * the ground's unit normal there, which the shell already samples for the
 * ground plane; `wet` is whether the point is on a declared water body;
 * `y` is the height of the ground the plane was put at.
 */
export function groundSurface(view, x, z, normalY, wet, y) {
  if (wet) {
    return SURFACE.water;
  }
  if (view && typeof view.surfaceAt === 'function') {
    const name = view.surfaceAt(x, z, y);
    if (name && SURFACE[name] != null) {
      return SURFACE[name];
    }
  }
  if (view && view.trackClass === 'micro') {
    return SURFACE.default;
  }
  const byMap = view ? MAP_GROUND[view.id] : null;
  if (normalY < ROCK_NORMAL_Y && view && view.id !== 'city') {
    return SURFACE.rock;
  }
  return SURFACE[byMap ?? 'grass'];
}

/*
 * AN OBSTACLE'S MATERIAL, by collider kind, and only where the module's
 * material has the SAME friction and restitution the shell already gives
 * that kind (src/game/collide.js contactMaterial): then sim_contact_at_mat
 * resolves exactly the contact sim_contact_at did, and only the damage
 * judgement learns what was hit. A kind whose numbers differ keeps
 * sim_contact_at and its own numbers, and the judgement reads it as the
 * default surface. obstacleSurfaces holds the table to the module. A
 * crown the plant has not taken over (a hedge, an awning, a tree past the
 * 32 it holds) is not bark, whatever its numbers, so it stays default.
 */
const KIND_SURFACE = {
  gate: 'pvc',
  pole: 'pvc',
  tree: 'wood',
  wall: 'concrete',
  cliff: 'rock',
  rock: 'rock',
  obstacle: 'default',
};

/*
 * The table checked against the module: kind index to surface id, or -1
 * for "use sim_contact_at with the shell's own numbers". `materialInfo`
 * is (mat) => [mu, e] from sim_material_info. Run once per module.
 */
export function obstacleSurfaces(materialInfo) {
  const out = new Int32Array(KINDS.length).fill(-1);
  for (let k = 0; k < KINDS.length; k += 1) {
    const name = KIND_SURFACE[KINDS[k]];
    if (name == null) {
      continue;
    }
    const want = contactMaterial(KINDS[k]);
    const id = SURFACE[name];
    /* The default surface reads what the caller passes, and
     * sim_contact_at_mat passes 0.40 and 0.15 for it. */
    const got = id === SURFACE.default ? [0.40, 0.15] : materialInfo(id);
    if (got && got[0] === want.mu && got[1] === want.e) {
      out[k] = id;
    }
  }
  return out;
}

/*
 * A solid's material for the parts that break off and hit it
 * (sim_obstacle_box and sim_obstacle_cylinder). The craft never meets
 * these, so this is the material's own name whatever the shell's contact
 * numbers are: a train is metal, a crane boom is metal, anything the map
 * did not name is concrete.
 */
const SOLID_SURFACE = { ...KIND_SURFACE, train: 'metal', boom: 'metal', obstacle: 'concrete' };

export function solidSurface(kindName) {
  return SURFACE[SOLID_SURFACE[kindName] ?? 'concrete'];
}

/*
 * THE TREES, from the colliders every map already builds: a trunk is a
 * vertical 'tree' post, and a broadleaf's crown is one or more 'canopy'
 * spheres over it. The plant wants a tree as a trunk and a crown cylinder
 * (sim_tree_add), so each post collects the spheres over it into the
 * cylinder that holds them. A conifer is drawn with no crown spheres and a
 * post as wide as its branches (src/maps/alps/nature.js, the Swiss
 * forest), so a post wider than any trunk is read as the crown itself on a
 * thin trunk. Posts and spheres are collider indices, so the shell can let
 * the sweep pass through exactly the crowns the plant has taken over.
 *
 * Built once per map. World frame, Three.js metres.
 */
const TRUNK_MAX_R = 0.6;
const CONIFER_TRUNK_R = 0.25;
const CONIFER_CROWN_FROM = 0.25;

export function collectTrees(colliders) {
  if (!colliders || !colliders.built) {
    return [];
  }
  const TREE = KINDS.indexOf('tree');
  const CANOPY = KINDS.indexOf('canopy');
  const n = colliders.count;
  /* The crown spheres by 4 m cell, so a post finds its own in a few
   * lookups rather than a scan of every sphere on the map. */
  const CELL = 4;
  const cells = new Map();
  const cellKey = (cx, cz) => `${cx},${cz}`;
  for (let i = 0; i < n; i += 1) {
    if (colliders.fkind[i] !== CANOPY || colliders.fbox[i]) {
      continue;
    }
    const k = cellKey(Math.floor(colliders.fax[i] / CELL), Math.floor(colliders.faz[i] / CELL));
    if (!cells.has(k)) {
      cells.set(k, []);
    }
    cells.get(k).push(i);
  }
  const trees = [];
  for (let i = 0; i < n; i += 1) {
    if (colliders.fkind[i] !== TREE || colliders.fbox[i]) {
      continue;
    }
    const x = colliders.fax[i];
    const z = colliders.faz[i];
    /* A post is vertical; a leaning 'tree' capsule is a fallen log. */
    if (Math.abs(colliders.fbx[i] - x) > 1e-3 || Math.abs(colliders.fbz[i] - z) > 1e-3) {
      continue;
    }
    const y0 = Math.min(colliders.fay[i], colliders.fby[i]);
    const y1 = Math.max(colliders.fay[i], colliders.fby[i]);
    const r = colliders.fr[i];
    const crown = [];
    let cy0 = Infinity;
    let cy1 = -Infinity;
    let cr = 0;
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    for (let ox = -1; ox <= 1; ox += 1) {
      for (let oz = -1; oz <= 1; oz += 1) {
        for (const j of cells.get(cellKey(cx + ox, cz + oz)) ?? []) {
          const sx = colliders.fax[j] - x;
          const sz = colliders.faz[j] - z;
          const sr = colliders.fr[j];
          const d = Math.sqrt(sx * sx + sz * sz);
          /* Over this trunk: its centre within its own radius of the
           * trunk's line, and above the trunk's foot. */
          if (d > sr || colliders.fay[j] < y0) {
            continue;
          }
          crown.push(j);
          cy0 = Math.min(cy0, colliders.fay[j] - sr);
          cy1 = Math.max(cy1, colliders.fay[j] + sr);
          cr = Math.max(cr, d + sr);
        }
      }
    }
    if (crown.length > 0) {
      trees.push({
        x, z, y0, trunkR: r, crownY0: Math.max(cy0, y0), crownY1: cy1, crownR: cr,
        post: -1, crown,
      });
    } else if (r > TRUNK_MAX_R) {
      trees.push({
        x, z, y0, trunkR: CONIFER_TRUNK_R,
        crownY0: y0 + (y1 - y0) * CONIFER_CROWN_FROM, crownY1: y1 + r, crownR: r,
        post: i, crown,
      });
    }
  }
  return trees;
}

/*
 * The `max` trees nearest (x, z) within `reach` metres, nearest first,
 * into `out` (cleared). Ties go to the lower index, so the choice is a
 * pure function of the position.
 */
export function nearestTrees(trees, x, z, reach, max, out) {
  out.length = 0;
  const r2 = reach * reach;
  for (let i = 0; i < trees.length; i += 1) {
    const t = trees[i];
    const dx = t.x - x;
    const dz = t.z - z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= r2) {
      out.push({ d2, i });
    }
  }
  out.sort((a, b) => a.d2 - b.d2 || a.i - b.i);
  if (out.length > max) {
    out.length = max;
  }
  return out;
}

/*
 * THE SOLIDS THE BROKEN PARTS MEET: the `max` static colliders nearest
 * (x, y, z) within `reach`, trees excluded (sim_tree_add gives every tree
 * it holds a trunk for the free bodies, and a crown is foliage). Each is { box, kind, i } with a box's world
 * corners or a capsule's two ends and radius, nearest first by the
 * distance to its bounding box. `skip`, when given, marks colliders to
 * leave out: the walls under a roof the craft is on (src/main.js).
 */
export function nearestSolids(colliders, x, y, z, reach, max, out, skip = null) {
  out.length = 0;
  if (!colliders || !colliders.built) {
    return out;
  }
  const CANOPY = KINDS.indexOf('canopy');
  const TREE = KINDS.indexOf('tree');
  for (let i = 0; i < colliders.count; i += 1) {
    if (colliders.fkind[i] === CANOPY || colliders.fkind[i] === TREE || (skip && skip[i])) {
      continue;
    }
    const r = colliders.fbox[i] ? 0 : colliders.fr[i];
    const lx = Math.min(colliders.fax[i], colliders.fbx[i]) - r;
    const ly = Math.min(colliders.fay[i], colliders.fby[i]) - r;
    const lz = Math.min(colliders.faz[i], colliders.fbz[i]) - r;
    const hx = Math.max(colliders.fax[i], colliders.fbx[i]) + r;
    const hy = Math.max(colliders.fay[i], colliders.fby[i]) + r;
    const hz = Math.max(colliders.faz[i], colliders.fbz[i]) + r;
    const dx = x < lx ? lx - x : x > hx ? x - hx : 0;
    const dy = y < ly ? ly - y : y > hy ? y - hy : 0;
    const dz = z < lz ? lz - z : z > hz ? z - hz : 0;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 <= reach * reach) {
      out.push({ d2, i });
    }
  }
  out.sort((a, b) => a.d2 - b.d2 || a.i - b.i);
  if (out.length > max) {
    out.length = max;
  }
  return out;
}
