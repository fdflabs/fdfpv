/*
 * bed.js: the ground the flood runs on (src/sim/water/flood.c), on the
 * flood's own grid, and the structures water goes through rather than
 * over (docs/FLOOD.md).
 *
 * Built from what every client already has, the ground the terrain
 * draws (conformed to the concrete, so the #336 cut is in it), the
 * map's water.json and dam.json, with plain arithmetic and Math.sqrt
 * only, so Node and every browser build the same bits, which the
 * flood's determinism starts from.
 *
 *   THE GRID lies along the spillway, not the map's axes: u across the
 *   chute and d down it (dam/index.js spillLayout's frame), cells of a
 *   fifth of the piers' pitch, 5.093 m, placed so that every pier is one
 *   column of cells and every bay four (20.37 m for the gates' 20), and
 *   the gates one row. On a grid along the map's axes a 20 m bay at 19.6
 *   degrees was a staircase of 4 m cells that passed some 60 % of what
 *   the gate's opening does (docs/FLOOD.md).
 *
 *   THE GROUND outside the water is the drawn ground at each cell's
 *   centre.
 *
 *   UNDER THE WATER the data has no bed: the pipeline lowered the ground
 *   inside each outline to a flat bed bedDepth (3 m) under the surface
 *   (docs/ITAIPU-PLAN.md section 4). A 3 m river would carry the
 *   spillway's flow at twenty metres a second. So the river's bed is
 *   the water part's own rule for how deep it draws the water, bedDepth
 *   and then DEEPEN per metre from dry ground (water/index.js field),
 *   which makes the drawn and the simulated river the same depth; and
 *   the reservoir's, in front of the dam, is the spillway's published
 *   foundation, RESERVOIR_BED, under the sill as an ogee's approach is.
 *   Still water stands wherever it reaches below its level, not only
 *   inside the outlines: a hollow the outline missed is full.
 *
 *   THE DAM. Every dam.json footprint stands at its crest, 225, over any
 *   water there is: the flood never overtops it. So does a band
 *   CREST_HALF either side of the whole crest road (dam.json's `whole
 *   dam` axis): the footprints do not meet end to end, and the ground
 *   the terrain cuts round the spillway's ends (terrain/conform.js) is
 *   an excavation the drawing needs and the real abutments fill. Inside
 *   the spillway the bays are cut back down to the concrete the water
 *   runs on, the sill and then dam/index.js chuteFloor to each bay's
 *   lip, with its piers, its training walls and its dividers standing up
 *   out of them, each at least a cell wide.
 *
 *   THE GATES are walls across the bays a little upstream of the sill,
 *   and a link each (flood.c LINKS) from the cells in front of the gate
 *   to the cells behind it: the flow under a gate standing open, or
 *   through a hole a war tears in its leaf under the water, is the
 *   link's. A hole open to the sky cuts the gate's own cells (flood.js
 *   openGate).
 *
 * The spillway's layout (SPILL) restates dam/index.js's, which does not
 * export it.
 *
 * Cell classes, each with its Manning's n (Chow, Open-Channel Hydraulics,
 * 1959, table 5-6): CHANNEL, a large river's bed of rock and gravel,
 * 0.035; CONCRETE, the spillway's finished concrete, 0.015; BANK, the
 * forest and brush along the river, 0.07; RESERVOIR, 0.03.
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

import { chuteFloor } from '../dam/index.js';

export const CLASS = {
  channel: 0, concrete: 1, bank: 2, reservoir: 3,
};
export const MANNING = [0.035, 0.015, 0.07, 0.03];

/* The water part's depth rule (water/index.js FIELD's DEEPEN), m per m
 * from dry ground. */
const DEEPEN = 0.08;
/* The spillway's published foundation, dam.json baseY. */
const RESERVOIR_BED = 181.3;
const CREST_Y = 225;
/* Half the crest's width the dam line is held at, m: the crest roads
 * are 10 to 20 m wide. */
const CREST_HALF = 6;

/* dam/index.js's SPILL, restated. */
const SPILL = {
  width: 362,
  gates: 14,
  gateWidth: 20,
  gateHeight: 21.34,
  gateOpen: 5,
  upstream: -8,
  ogee: 12,
  pierEnd: 42,
  dividers: [4, 8],
  bayEnds: [483, 456, 423],
  wallHeight: 8,
  dividerWidth: 3,
  gate: [-6.5, -5],
};

/* The prototype's grid in the chute's frame (docs/FLOOD.md): cells of a
 * fifth of the piers' pitch; WEST cells west of the westmost pier's
 * column and NORTH rows upstream of the gates' row, NX by NZ: the
 * reservoir 150 m in front of the spillway, the spillway, the chute,
 * and the river from the tailrace's bend to some 850 m below the lips. */
const PER_PITCH = 5;
const WEST = 118;
const NORTH = 30;
export const FLOOD_GRID = { nx: 287, nz: 287 };

/* The gates' links, in metres down the chute: the cells in front of a
 * gate whose level drives it, those behind that take its water, and the
 * pool whose level drowns it, the chute past the ogee, where a gate's
 * water runs shallow and fast whatever the gate passes. */
const UP = [-17, -10];
const DOWN = [-2, 6];
const TAIL = [60, 68];
/* The approach: the reservoir's outline stops some 20 m short of the
 * sill and the drawn ground there is the cut's slope up to it, which
 * would stand in front of every gate as a weir 3 m under the water. A
 * spillway's approach is dug out to its foundation: from APPROACH
 * metres upstream of the sill to the sill, across the spillway's width,
 * the bed is the reservoir's. */
const APPROACH = -40;
/* The approach graded up to RAMP_UNDER under the sill rather than one
 * 18 m step: the hydrostatic reconstruction loses energy at a step tall
 * against the water over it (Delestre et al., 2012), and passed some 70 %
 * of a crest's critical flow over this one. */
const RAMP_UNDER = 0;

/* The distance from (x, z) to the polyline `line` [[x, z]...]. */
function toLine(line, x, z) {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i += 1) {
    const [ax, az] = line[i];
    const [bx, bz] = line[i + 1];
    const ex = bx - ax;
    const ez = bz - az;
    const l2 = ex * ex + ez * ez;
    let t = l2 > 0 ? ((x - ax) * ex + (z - az) * ez) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + ex * t - x;
    const pz = az + ez * t - z;
    const d = Math.sqrt(px * px + pz * pz);
    if (d < best) best = d;
  }
  return best;
}

/* Even-odd: whether (x, z) is inside the polygon [[x, z]...]. */
function inside(poly, x, z) {
  let c = false;
  for (let i = 0, m = poly.length - 1; i < poly.length; m = i, i += 1) {
    const [xi, zi] = poly[i];
    const [xm, zm] = poly[m];
    if ((zi > z) !== (zm > z) && x < xi + ((z - zi) * (xm - xi)) / (zm - zi)) {
      c = !c;
    }
  }
  return c;
}

/*
 * The spillway in its chute's frame (dam/index.js spillLayout) and the
 * grid laid along it: u across (a, toward the chute's east), d down
 * (n). Plain arithmetic and Math.sqrt only (Math.hypot is not exact to
 * the bit on every engine), so every client lays the same grid.
 */
export function floodFrame(dam) {
  const sp = dam.find((p) => p.part === 'spillway');
  const chute = sp.sections.find((s) => s.at === 'chute');
  const [c0, c1] = chute.axis;
  const ex = c1[1] - c0[1];
  const ez = -(c1[0] - c0[0]);
  const l = Math.sqrt(ex * ex + ez * ez);
  const a = [ex / l, ez / l];
  const n = [-a[1], a[0]];
  const W = SPILL.width / 2;
  const pierW = (SPILL.width - SPILL.gates * SPILL.gateWidth) / (SPILL.gates + 1);
  const pitch = pierW + SPILL.gateWidth;
  const pierU = Array.from({ length: SPILL.gates + 1 }, (_, k) => -W + pierW / 2 + k * pitch);
  const walls = [0, ...SPILL.dividers, SPILL.gates];
  const bays = SPILL.bayEnds.map((end, k) => ({ u0: pierU[walls[k]], u1: pierU[walls[k + 1]], end }));
  const wallEnd = (k) => Math.max(k > 0 ? SPILL.bayEnds[k - 1] : 0, k < SPILL.bayEnds.length ? SPILL.bayEnds[k] : 0);
  const floor = chuteFloor(sp).y;
  const dx = pitch / PER_PITCH;
  const gateD = (SPILL.gate[0] + SPILL.gate[1]) / 2;
  const grid = {
    ...FLOOD_GRID,
    dx,
    /* The grid's own x and z are u and d: its corner. */
    x0: pierU[0] - (WEST + 0.5) * dx,
    z0: gateD - (NORTH + 0.5) * dx,
    origin: c0,
    a,
    n,
  };
  return {
    sp,
    W,
    pierW,
    pierU,
    walls,
    bays,
    wallEnd,
    gateD,
    grid,
    sill: sp.figures.sillY,
    floor: (d) => (d <= SPILL.ogee ? sp.figures.sillY : floor(d)),
    local: (x, z) => {
      const px = x - c0[0];
      const pz = z - c0[1];
      return [px * a[0] + pz * a[1], px * n[0] + pz * n[1]];
    },
    /* The world (x, z) at (u, d). */
    at: (u, d) => [c0[0] + a[0] * u + n[0] * d, c0[1] + a[1] * u + n[1] * d],
  };
}

/* The spillway's concrete at (u, d): the floor's height and the top of
 * what stands there, or null outside the bays. Piers, walls and the
 * gates' row lie along the grid, each at least one cell wide. */
function spillAt(S, u, d) {
  if (d < SPILL.upstream || u < -S.W || u > S.W) {
    return null;
  }
  const bay = S.bays.find((b) => u >= b.u0 && u <= b.u1);
  if (!bay || d > bay.end) {
    return null;
  }
  const floor = S.floor(d);
  const half = S.grid.dx / 2;
  let top = floor;
  for (const pu of S.pierU) {
    if (Math.abs(u - pu) <= Math.max(S.pierW / 2, half) && d <= SPILL.pierEnd) {
      top = CREST_Y;
    }
  }
  S.walls.forEach((p, k) => {
    const w = k === 0 || k === S.walls.length - 1 ? S.pierW / 2 : SPILL.dividerWidth / 2;
    if (Math.abs(u - S.pierU[p]) <= Math.max(w, half) && d <= S.wallEnd(k)) {
      top = Math.max(top, floor + SPILL.wallHeight);
    }
  });
  if (Math.abs(d - S.gateD) <= Math.max((SPILL.gate[1] - SPILL.gate[0]) / 2, half)) {
    top = CREST_Y;
  }
  return { floor, top };
}

/*
 * The bed and the classes over the grid, and the gates' links. `ground(x,
 * z)` is the drawn ground; `water` and `dam` the data's water.json and
 * dam.json. Returns { frame (floodFrame's), grid, b (Float64Array), cls
 * (Uint8Array), wet (Int8Array: -1 dry ground, else the index of the
 * body whose still water covers the cell), level (each body's), names,
 * gates: [{ id, up, down, tail, wall, bay, middle, at, dir, sill, width,
 * height, open }] }: `wall` the cells of the gate itself, { k, u (m
 * across the bay from its middle), floor }; `bay` its bay's cells with
 * their d.
 */
export function floodBed({ ground, water, dam }) {
  const S = floodFrame(dam);
  const { grid } = S;
  const {
    x0, z0, dx, nx, nz,
  } = grid;
  const n = nx * nz;
  const b = new Float64Array(n);
  const cls = new Uint8Array(n).fill(CLASS.bank);
  const wet = new Int8Array(n).fill(-1);
  /* The cells on the pipeline's lowered bed, whose ground is not a bed,
   * and the approach's, with their d. */
  const lowered = new Uint8Array(n);
  const approach = new Map();
  const { sp } = S;
  const prints = dam.filter((p) => p.footprint && p.footprint.length > 2);
  const crest = dam.find((p) => p.part === 'whole dam');
  if (!crest || !crest.axis) {
    throw new Error('flood bed: dam.json has no whole dam crest axis');
  }
  const bodies = water.map((w) => ({
    name: w.name, y: w.y, depth: w.bedDepth, outline: w.outline,
  }));
  const reservoir = bodies.findIndex((w) => w.name === 'reservoir');
  if (reservoir < 0) {
    throw new Error('flood bed: water.json has no reservoir');
  }
  for (let j = 0; j < nz; j += 1) {
    const d = z0 + (j + 0.5) * dx;
    for (let i = 0; i < nx; i += 1) {
      const u = x0 + (i + 0.5) * dx;
      const [x, z] = S.at(u, d);
      const k = j * nx + i;
      const g = ground(x, z);
      b[k] = g;
      /* Still water: inside an outline and on the pipeline's lowered bed. */
      bodies.forEach((w, q) => {
        if (wet[k] < 0 && g < w.y && inside(w.outline, x, z)) {
          wet[k] = q;
        }
      });
      if (prints.some((p) => inside(p.footprint, x, z)) || toLine(crest.axis, x, z) <= CREST_HALF) {
        b[k] = Math.max(g, CREST_Y);
        wet[k] = -1;
      }
      if (u >= -S.W && u <= S.W && d >= APPROACH && d < SPILL.upstream) {
        wet[k] = reservoir;
        approach.set(k, d);
      }
      const s = spillAt(S, u, d);
      /* The sill and the gates stand a little upstream of the footprint
       * OpenStreetMap drew; the chute is inside it. */
      if (s && (d <= SPILL.ogee || inside(sp.footprint, x, z))) {
        b[k] = s.top;
        cls[k] = CLASS.concrete;
        wet[k] = -1;
      }
      lowered[k] = wet[k] >= 0 ? 1 : 0;
    }
  }
  /* Still water stands wherever it reaches below its level: a fill from
   * each body's cells, by faces. */
  const queue = new Int32Array(n);
  bodies.forEach((w, q) => {
    let head = 0; let tail = 0;
    for (let k = 0; k < n; k += 1) {
      if (wet[k] === q) queue[tail++] = k;
    }
    while (head < tail) {
      const k = queue[head++];
      const i = k % nx;
      const near = [i > 0 ? k - 1 : -1, i + 1 < nx ? k + 1 : -1, k >= nx ? k - nx : -1, k + nx < n ? k + nx : -1];
      for (const m of near) {
        if (m >= 0 && wet[m] < 0 && b[m] < w.y) {
          wet[m] = q;
          queue[tail++] = m;
        }
      }
    }
  });
  /* The river's depth: a two pass chamfer of the distance to dry ground
   * in cells, then bedDepth and DEEPEN per metre under the level. */
  const far = 1e9;
  const dist = new Float64Array(n);
  for (let k = 0; k < n; k += 1) {
    dist[k] = wet[k] >= 0 ? far : 0;
  }
  const E = Math.SQRT2;
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const k = j * nx + i;
      let v = dist[k];
      if (i > 0) v = Math.min(v, dist[k - 1] + 1);
      if (j > 0) {
        v = Math.min(v, dist[k - nx] + 1);
        if (i > 0) v = Math.min(v, dist[k - nx - 1] + E);
        if (i + 1 < nx) v = Math.min(v, dist[k - nx + 1] + E);
      }
      dist[k] = v;
    }
  }
  for (let j = nz - 1; j >= 0; j -= 1) {
    for (let i = nx - 1; i >= 0; i -= 1) {
      const k = j * nx + i;
      let v = dist[k];
      if (i + 1 < nx) v = Math.min(v, dist[k + 1] + 1);
      if (j + 1 < nz) {
        v = Math.min(v, dist[k + nx] + 1);
        if (i + 1 < nx) v = Math.min(v, dist[k + nx + 1] + E);
        if (i > 0) v = Math.min(v, dist[k + nx - 1] + E);
      }
      dist[k] = v;
    }
  }
  for (let k = 0; k < n; k += 1) {
    const q = wet[k];
    if (q < 0 || !lowered[k]) continue;
    const w = bodies[q];
    if (approach.has(k)) {
      /* Graded from the reservoir's bed up to the sill (RAMP_FROM). */
      const t = (approach.get(k) - APPROACH) / (SPILL.upstream - APPROACH);
      b[k] = RESERVOIR_BED + (S.sill - RAMP_UNDER - RESERVOIR_BED) * (t < 0 ? 0 : t > 1 ? 1 : t);
      cls[k] = CLASS.reservoir;
    } else if (q === reservoir) {
      b[k] = RESERVOIR_BED;
      cls[k] = CLASS.reservoir;
    } else {
      b[k] = w.y - w.depth - DEEPEN * dist[k] * dx;
      cls[k] = CLASS.channel;
    }
  }
  /* The gates: each bay's four columns between two piers', and its rows. */
  const gates = [];
  for (let g = 0; g < SPILL.gates; g += 1) {
    const u0 = S.pierU[g] + dx / 2;
    const u1 = S.pierU[g + 1] - dx / 2;
    const middle = (S.pierU[g] + S.pierU[g + 1]) / 2;
    const up = []; const down = []; const tail = []; const wall = []; const bay = [];
    for (let j = 0; j < nz; j += 1) {
      const d = z0 + (j + 0.5) * dx;
      for (let i = 0; i < nx; i += 1) {
        const u = x0 + (i + 0.5) * dx;
        if (u <= u0 || u >= u1) continue;
        const k = j * nx + i;
        if (d > APPROACH && d < 120) bay.push({ k, d });
        if (Math.abs(d - S.gateD) < dx / 2) {
          wall.push({ k, u: u - middle, floor: S.floor(d) });
        }
        if (d >= UP[0] && d <= UP[1]) up.push(k);
        if (d >= DOWN[0] && d <= DOWN[1]) down.push(k);
        if (d >= TAIL[0] && d <= TAIL[1]) tail.push(k);
      }
    }
    if (!up.length || !down.length || !tail.length || !wall.length) {
      throw new Error(`flood bed: gate ${g} lacks cells on this grid (${up.length} up, ${down.length} down, ${tail.length} tail, ${wall.length} wall)`);
    }
    gates.push({
      id: `gate-${g}`,
      up,
      down,
      tail,
      wall,
      bay,
      middle,
      /* Where the gate stands in plan, the middle of its bay at the skin
       * plate. */
      at: S.at(middle, S.gateD),
      /* Down the chute, in the grid's frame. */
      dir: [0, 1],
      sill: S.sill,
      width: SPILL.gateWidth,
      height: SPILL.gateHeight,
      open: SPILL.gateOpen,
    });
  }
  return {
    frame: S, grid, b, cls, wet, level: bodies.map((w) => w.y), names: bodies.map((w) => w.name), gates, dist,
  };
}
