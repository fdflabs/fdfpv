/*
 * hangarroom.js: the walkable hangar's floor plan and the pilot's walk on
 * it (docs/HANGAR-ROOM.md). Data and arithmetic only, no three.js, so the
 * layouts and the walk are checked in Node (scripts/hangar-room-check.js)
 * and src/render/hangarroomview.js draws exactly what is checked here.
 *
 * THE GRID. A room is a rectangle of CELL sized cells, x across and z
 * deep, centred on the origin, its door in the +z wall. A piece of
 * furniture is { kind, at: [i, j], rot }: its footprint's first cell and
 * a quarter turn count. Its front (where a pilot stands to use it) faces
 * +z before the turn, and each quarter turn swings it clockwise seen from
 * above. Nothing overlaps and nothing leaves the room: checkLayout says
 * so, and the walk treats every covered cell as solid.
 *
 * HEADING is clockwise from -z (the scene's north, figures.js's), so a
 * pilot at heading h walks along (sin h, -cos h).
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

/* Metres a side. */
export const CELL = 0.5;

/* The space tiers, in cells, and the ceiling, m. */
export const ROOMS = {
  garage: { w: 12, d: 10, h: 2.8 },
  workshop: { w: 20, d: 16, h: 4 },
  airfield: { w: 40, d: 28, h: 7 },
  /* The war's field hangar (owner 2026-10-07: a second room, apart from
   * the main one): a tent over dirt, sandbags along its sides. */
  field: { w: 20, d: 14, h: 3.6, look: 'field' },
};
export const TIERS = ['garage', 'workshop', 'airfield'];
/* The pilot's level (src/game/progress.js, XP from flying) each tier opens
 * at; never bought (lead decision 2026-10-07). Spaced inside the planes'
 * own unlock levels, so a bigger room comes as the bigger planes do. */
export const TIER_LEVELS = { garage: 1, workshop: 4, airfield: 7 };

/* The biggest tier a level has opened; everything with unlockAll. */
export function tierFor(level, unlockAll = false) {
  return unlockAll ? 'airfield' : TIERS.filter((t) => level >= TIER_LEVELS[t]).pop();
}
/* Every room there is: the tiers and the field hangar. */
export const ROOM_IDS = [...TIERS, 'field'];

/* Footprints in cells before the turn, and the station a kind is, if any:
 * what a pilot standing at its front can use. */
export const KINDS = {
  stand: { size: [4, 4], station: 'stand' },
  bench: { size: [4, 2], station: 'bench' },
  shelf: { size: [3, 1], station: 'shelf' },
  shop: { size: [2, 1], station: 'shop' },
  trophies: { size: [4, 1], station: 'trophies' },
  tv: { size: [3, 1], station: 'tv' },
  chest: { size: [2, 1] },
  couch: { size: [4, 2] },
  crates: { size: [2, 2] },
};

/*
 * The default layout of each tier. Wall pieces stand against the back
 * (j 0) or a side wall, front to the room; the stand is in the middle
 * with room to walk round it; the door's half of the room is kept clear.
 */
export const LAYOUTS = {
  garage: [
    { kind: 'stand', at: [4, 2], rot: 0 },
    { kind: 'bench', at: [0, 0], rot: 0 },
    { kind: 'shelf', at: [9, 0], rot: 0 },
    { kind: 'trophies', at: [11, 2], rot: 1 },
    { kind: 'tv', at: [0, 4], rot: 3 },
    { kind: 'shop', at: [11, 6], rot: 1 },
  ],
  workshop: [
    { kind: 'stand', at: [8, 5], rot: 0 },
    { kind: 'bench', at: [1, 0], rot: 0 },
    { kind: 'chest', at: [5, 0], rot: 0 },
    { kind: 'shelf', at: [13, 0], rot: 0 },
    { kind: 'trophies', at: [8, 0], rot: 0 },
    { kind: 'shop', at: [19, 4], rot: 1 },
    { kind: 'tv', at: [0, 5], rot: 3 },
    { kind: 'couch', at: [5, 5], rot: 1 },
    { kind: 'crates', at: [17, 0], rot: 0 },
  ],
  airfield: [
    { kind: 'stand', at: [18, 9], rot: 0 },
    { kind: 'bench', at: [2, 0], rot: 0 },
    { kind: 'bench', at: [7, 0], rot: 0 },
    { kind: 'chest', at: [12, 0], rot: 0 },
    { kind: 'trophies', at: [18, 0], rot: 0 },
    { kind: 'shelf', at: [26, 0], rot: 0 },
    { kind: 'shelf', at: [30, 0], rot: 0 },
    { kind: 'crates', at: [35, 0], rot: 0 },
    { kind: 'crates', at: [37, 0], rot: 0 },
    { kind: 'shop', at: [39, 8], rot: 1 },
    { kind: 'tv', at: [0, 8], rot: 3 },
    { kind: 'couch', at: [5, 8], rot: 1 },
    { kind: 'crates', at: [37, 14], rot: 0 },
  ],
  field: [
    { kind: 'stand', at: [8, 5], rot: 0 },
    { kind: 'bench', at: [1, 0], rot: 0 },
    { kind: 'shelf', at: [6, 0], rot: 0 },
    { kind: 'chest', at: [10, 0], rot: 0 },
    { kind: 'crates', at: [14, 0], rot: 0 },
    { kind: 'crates', at: [16, 0], rot: 0 },
    { kind: 'crates', at: [18, 4], rot: 0 },
    { kind: 'crates', at: [0, 6], rot: 0 },
  ],
};

/* The footprint after the turn, cells. */
export function footprint(item) {
  const [w, d] = KINDS[item.kind].size;
  return item.rot % 2 ? [d, w] : [w, d];
}

/* Every problem with a layout: { kind, at, problem: 'unknown' | 'outside'
 * | 'overlap', other }, other the kind overlapped. None is an empty list. */
export function checkLayout(room, layout) {
  const problems = [];
  const taken = new Map();
  for (const item of layout) {
    if (!KINDS[item.kind]) {
      problems.push({ kind: item.kind, at: item.at, problem: 'unknown' });
      continue;
    }
    const [fw, fd] = footprint(item);
    const [i0, j0] = item.at;
    if (i0 < 0 || j0 < 0 || i0 + fw > room.w || j0 + fd > room.d) {
      problems.push({ kind: item.kind, at: item.at, problem: 'outside' });
      continue;
    }
    for (let i = i0; i < i0 + fw; i += 1) {
      for (let j = j0; j < j0 + fd; j += 1) {
        const k = `${i},${j}`;
        const other = taken.get(k);
        if (other && !problems.some((x) => x.at === item.at && x.other === other)) {
          problems.push({ kind: item.kind, at: item.at, problem: 'overlap', other });
        }
        taken.set(k, item.kind);
      }
    }
  }
  return problems;
}

/* The centre of cell (i, j) in metres. */
export function cellCentre(room, i, j) {
  return [(i + 0.5) * CELL - (room.w * CELL) / 2, (j + 0.5) * CELL - (room.d * CELL) / 2];
}

/* The cell a point is in. */
export function cellAt(room, x, z) {
  return [Math.floor((x + (room.w * CELL) / 2) / CELL), Math.floor((z + (room.d * CELL) / 2) / CELL)];
}

/* One byte a cell, 1 where furniture stands. Indexed j * w + i. */
export function occupancy(room, layout) {
  const occ = new Uint8Array(room.w * room.d);
  for (const item of layout) {
    const [fw, fd] = footprint(item);
    for (let i = item.at[0]; i < item.at[0] + fw; i += 1) {
      for (let j = item.at[1]; j < item.at[1] + fd; j += 1) {
        occ[j * room.w + i] = 1;
      }
    }
  }
  return occ;
}

/* The heading a piece's front faces: +z (heading pi) turned clockwise a
 * quarter per rot. */
export function frontHeading(item) {
  return Math.PI + (item.rot % 4) * (Math.PI / 2);
}

/* Where a piece's footprint centre is, m, and its half extents. */
export function placement(room, item) {
  const [fw, fd] = footprint(item);
  const x = (item.at[0] + fw / 2) * CELL - (room.w * CELL) / 2;
  const z = (item.at[1] + fd / 2) * CELL - (room.d * CELL) / 2;
  return { x, z, hw: (fw * CELL) / 2, hd: (fd * CELL) / 2 };
}

/* How far out from a station's front its spot is, m, and how near the
 * pilot has to be to it to use it. */
const SPOT_OUT = 0.5;
export const USE_RADIUS = 0.9;

/*
 * The stations of a layout: { id, x, z, heading } with x, z where the
 * pilot stands to use it and heading the way they then face. The door is
 * one too, inside the +z wall at its middle. The stand is walked round,
 * so its spot is its front edge's middle like any other.
 */
export function stations(room, layout) {
  const out = [];
  for (const item of layout) {
    const station = KINDS[item.kind].station;
    if (!station) {
      continue;
    }
    const p = placement(room, item);
    const h = frontHeading(item);
    const fx = Math.sin(h);
    const fz = -Math.cos(h);
    const reach = Math.abs(fx) > 0.5 ? p.hw : p.hd;
    out.push({ id: station, x: p.x + fx * (reach + SPOT_OUT), z: p.z + fz * (reach + SPOT_OUT), heading: h + Math.PI });
  }
  out.push({ id: 'door', x: 0, z: (room.d * CELL) / 2 - SPOT_OUT, heading: Math.PI });
  return out;
}

/* Where the pilot starts: inside the door, facing into the room. */
export function startPose(room) {
  return { x: 0, z: (room.d * CELL) / 2 - 1.2, heading: 0 };
}

/* The pilot's walk: m/s, turn rad/s, and the body's radius against walls
 * and furniture. */
export const WALK_SPEED = 2.2;
export const TURN_RATE = 2.6;
export const BODY_R = 0.2;

/* Whether the body standing at x, z would be in a wall or furniture. */
export function blocked(room, occ, x, z) {
  const hw = (room.w * CELL) / 2;
  const hd = (room.d * CELL) / 2;
  if (x < -hw + BODY_R || x > hw - BODY_R || z < -hd + BODY_R || z > hd - BODY_R) {
    return true;
  }
  /* The body's square against every cell it touches. */
  const [i0, j0] = cellAt(room, x - BODY_R, z - BODY_R);
  const [i1, j1] = cellAt(room, x + BODY_R - 1e-6, z + BODY_R - 1e-6);
  for (let j = j0; j <= j1; j += 1) {
    for (let i = i0; i <= i1; i += 1) {
      if (occ[j * room.w + i]) {
        return true;
      }
    }
  }
  return false;
}

/*
 * One step of the walk: input { forward, turn } each -1 to 1 (forward
 * back, turn right positive), dt seconds. Each axis is tried on its own
 * so the pilot slides along a wall rather than sticking to it. Returns a
 * new pose; `moving` says whether the body went anywhere, for the
 * stride.
 */
export function walk(room, occ, pose, input, dt) {
  const heading = pose.heading + (input.turn || 0) * TURN_RATE * dt;
  const v = Math.max(-1, Math.min(1, input.forward || 0)) * WALK_SPEED * dt;
  let { x, z } = pose;
  const nx = x + Math.sin(heading) * v;
  const nz = z - Math.cos(heading) * v;
  if (!blocked(room, occ, nx, z)) {
    x = nx;
  }
  if (!blocked(room, occ, x, nz)) {
    z = nz;
  }
  return { x, z, heading, moving: x !== pose.x || z !== pose.z };
}

/* The station the pilot can use: the nearest within USE_RADIUS, or null. */
export function stationNear(list, pose) {
  let best = null;
  let bestD = USE_RADIUS;
  for (const s of list) {
    const d = Math.hypot(s.x - pose.x, s.z - pose.z);
    if (d <= bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

/* Whether the pilot can walk from one point to another: a flood over the
 * cells a body fits in, from the start's cell. */
export function reachable(room, occ, from, to) {
  const free = (i, j) => {
    if (i < 0 || j < 0 || i >= room.w || j >= room.d) {
      return false;
    }
    const [x, z] = cellCentre(room, i, j);
    return !blocked(room, occ, x, z);
  };
  const [si, sj] = cellAt(room, from.x, from.z);
  const [ti, tj] = cellAt(room, to.x, to.z);
  const seen = new Uint8Array(room.w * room.d);
  const queue = [[si, sj]];
  seen[sj * room.w + si] = 1;
  while (queue.length) {
    const [i, j] = queue.shift();
    if (i === ti && j === tj) {
      return true;
    }
    for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
      if (free(a, b) && !seen[b * room.w + a]) {
        seen[b * room.w + a] = 1;
        queue.push([a, b]);
      }
    }
  }
  return false;
}
