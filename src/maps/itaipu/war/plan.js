/*
 * plan.js: Itaipu's right bank switchyard in numbers (docs/WARFARE-PLAN.md
 * section 8): where its fence runs, where its transformers stand, and the
 * sphere the war mode's target `yard-right` can take from them.
 *
 * OpenStreetMap gives the yard's outline (way w32302779, "Subestacao Foz
 * do Iguacu (Margem Direita)", 500 kV, 48 ha) and the lines that end in
 * it, whose gantries and busbars the town already stands at their nodes
 * (town/power.js), and the buildings in it, which the town draws too. It
 * does not give the equipment. So the equipment is laid out the way a
 * yard's is, in rows along the busbars: a grid on the yard's own axis
 * (the lines inside it, folded to one direction), a transformer on a
 * plinth at each point of the grid that is inside the fence and near a
 * line but clear of it. Nothing stands where the town's wires hang or its
 * buildings stand, so nothing here doubles what the town draws.
 *
 * The fence follows the outline on the ground, in pieces no longer than
 * FENCE.piece between posts on the ground's height.
 *
 * Every number the colliders come from is + - * / and a square root on
 * the data (the yard's axis too, by complex squaring rather than trig),
 * so they are the same on every engine (CLAUDE.md, determinism).
 *
 * Pure: no THREE, so a check can run it in Node.
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

export const YARD_ID = 'w32302779';

/* The grid: metres between transformers along a row and between rows. */
const ALONG = 20;
const ACROSS = 40;
/* A transformer's centre stays CLEAR from every wire in plan and at most
 * CLEAR + BAND from one: the rows are the bays beside the busbars, not
 * the yard's empty ground. EDGE keeps it off the fence. */
const CLEAR = 15;
const BAND = 24;
const EDGE = 15;
/* A 500 kV transformer on its plinth: the tank's length, width and
 * height, the plinth's rise, metres (the aerial-dam photographs'
 * scale; OSM gives none of it). */
export const TANK = {
  length: 8, width: 4, height: 4.2, plinth: 0.3,
};
/* What stands on the tank, metres in its frame (u along its axis):
 * `conservator` a bar of half width r along u from u0 to u1, its axis `y`
 * over the tank's top, and `bushings` at each u, `height` tall, half
 * width r. Sized with the colliders (war/index.js HOLD). */
export const KIT = {
  conservator: {
    u0: -3.4, u1: -0.4, y: 1, r: 0.45,
  },
  bushings: { u: [0.4, 1.8, 3.2], height: 1.8, r: 0.18 },
};
/* A transformer's centre stays this far off every building. */
const HOUSE_CLEAR = 10;
/* The fence: 2.4 m of chain link, a post every piece. */
export const FENCE = { height: 2.4, piece: 25 };
/* How many transformers burn when the yard is hit: the ones nearest its
 * middle. */
const FIRES = 5;

export function inside(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[j];
    if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) {
      c = !c;
    }
  }
  return c;
}

/* Math.sqrt is exact in IEEE 754; Math.hypot is not specified to be. */
function len(x, z) {
  return Math.sqrt(x * x + z * z);
}

function segDist(x, z, a, b) {
  const vx = b[0] - a[0];
  const vz = b[1] - a[1];
  const l2 = vx * vx + vz * vz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / l2)) : 0;
  return len(x - a[0] - vx * t, z - a[1] - vz * t);
}

function nearest(segs, x, z) {
  let d = Infinity;
  for (const [a, b] of segs) {
    d = Math.min(d, segDist(x, z, a, b));
  }
  return d;
}

/*
 * The yard laid out. `power` is osm/power.json, `buildings` the features
 * of osm/buildings.json, `ground(x, z)` the terrain. Throws when the data
 * has no yard: the war mission names it.
 */
/* The yard's outline, [x, z] scene metres (OSM's), from osm/power.json;
 * null when the data has none. */
export function yardOutline(power) {
  const sub = power.substations.find((s) => s.id === YARD_ID);
  return sub ? sub.outer : null;
}

export function planYard(power, buildings, ground) {
  const outline = yardOutline(power);
  if (!outline) {
    throw new Error(`itaipu yard: osm/power.json has no substation ${YARD_ID}`);
  }
  const edges = outline.map((p, i) => [p, outline[(i + 1) % outline.length]]);
  const toEdge = (x, z) => nearest(edges, x, z);
  /* The wires over the yard: every span with an end in it or near it. */
  const wires = [];
  for (const line of power.lines) {
    for (let k = 0; k + 1 < line.points.length; k += 1) {
      const a = line.points[k];
      const b = line.points[k + 1];
      if (inside(outline, a[0], a[1]) || inside(outline, b[0], b[1]) || toEdge(a[0], a[1]) < 60 || toEdge(b[0], b[1]) < 60) {
        wires.push([a, b]);
      }
    }
  }
  /* The buildings in or near the yard, as their edges. */
  const near = (f) => f.outer.some(([x, z]) => inside(outline, x, z) || toEdge(x, z) < 60);
  const houses = buildings.filter(near);
  const houseEdges = houses.flatMap((f) => f.outer.map((p, i) => [p, f.outer[(i + 1) % f.outer.length]]));
  const offHouses = (x, z) => !houses.some((f) => inside(f.outer, x, z)) && nearest(houseEdges, x, z) >= HOUSE_CLEAR;
  if (!wires.length) {
    throw new Error(`itaipu yard: no line reaches substation ${YARD_ID}`);
  }
  /* The yard's axis: the directions of the spans wholly inside it (its
   * busbars and bays), weighted by length and folded a quarter turn
   * (four times the angle, the direction as a complex number squared
   * twice), so the bays across the busbars count with them; then the
   * mean's fourth root, the half angle twice (unit(1 + z)), which lands
   * within 45 degrees of +x. */
  let c4 = 0;
  let s4 = 0;
  for (const [a, b] of wires.filter(([p, q]) => inside(outline, p[0], p[1]) && inside(outline, q[0], q[1]))) {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.sqrt(dx * dx + dz * dz);
    if (!(l > 0)) {
      continue;
    }
    const c = dx / l;
    const s = dz / l;
    const c2 = c * c - s * s;
    const s2 = 2 * c * s;
    c4 += l * (c2 * c2 - s2 * s2);
    s4 += l * 2 * c2 * s2;
  }
  const unit = ([x, z]) => {
    const l = Math.sqrt(x * x + z * z);
    return [x / l, z / l];
  };
  const z4 = unit([c4, s4]);
  const z2 = unit([1 + z4[0], z4[1]]);
  const ax = unit([1 + z2[0], z2[1]]);
  const nx = [-ax[1], ax[0]];
  const at = (u, v) => [ax[0] * u + nx[0] * v, ax[1] * u + nx[1] * v];
  const us = outline.map(([x, z]) => x * ax[0] + z * ax[1]);
  const vs = outline.map(([x, z]) => x * nx[0] + z * nx[1]);
  const u0 = Math.min(...us);
  const u1 = Math.max(...us);
  const v0 = Math.min(...vs);
  const v1 = Math.max(...vs);

  const transformers = [];
  for (let v = v0 + ACROSS / 2; v < v1; v += ACROSS) {
    for (let u = u0 + ALONG / 2; u < u1; u += ALONG) {
      const [x, z] = at(u, v);
      const w = nearest(wires, x, z);
      if (!inside(outline, x, z) || toEdge(x, z) < EDGE || w < CLEAR || w > CLEAR + BAND || !offHouses(x, z)) {
        continue;
      }
      transformers.push({
        x, z, y: ground(x, z), ax: ax[0], az: ax[1],
      });
    }
  }
  if (!transformers.length) {
    throw new Error(`itaipu yard: no transformer fits substation ${YARD_ID}`);
  }

  const fence = [];
  for (const [a, b] of edges) {
    const n = Math.max(1, Math.ceil(len(b[0] - a[0], b[1] - a[1]) / FENCE.piece));
    for (let k = 0; k < n; k += 1) {
      const p = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
      const q = [a[0] + ((b[0] - a[0]) * (k + 1)) / n, a[1] + ((b[1] - a[1]) * (k + 1)) / n];
      fence.push([[p[0], ground(p[0], p[1]), p[1]], [q[0], ground(q[0], q[1]), q[1]]]);
    }
  }

  /* The sphere for the target: the equipment's middle, a tank's height
   * over the ground, reaching every transformer. */
  const mx = transformers.reduce((s, t) => s + t.x, 0) / transformers.length;
  const mz = transformers.reduce((s, t) => s + t.z, 0) / transformers.length;
  const my = ground(mx, mz) + TANK.plinth + TANK.height / 2;
  const r = Math.max(...transformers.map((t) => len(t.x - mx, t.z - mz))) + TANK.length / 2;
  const fires = transformers
    .map((t) => ({ t, d: len(t.x - mx, t.z - mz) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, FIRES)
    .map(({ t }) => [t.x, t.y + TANK.plinth + TANK.height, t.z]);

  return {
    outline,
    axis: ax,
    transformers,
    fence,
    wires: wires.length,
    houses: houses.length,
    site: { at: [mx, my, mz], r: Math.ceil(r), fires },
  };
}
