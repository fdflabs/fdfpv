/*
 * world.js: the valley's world data for alps and swiss2, without three.js,
 * so the page, the room and an offline bake all ask what is at (x, z)
 * and get one answer (plan: fdfpv-loop FND-6-SURVEY.md).
 *
 * makeValleyWorld(map) returns
 *   groundAt(x, z)   the contact ground without roofs: the field, the far
 *                    range, the alps' headwall, the strip, the lake's
 *                    surface. src/maps/alps.js lays its roofs over it and
 *                    edge/rooms/grounds.js hands it to the AI pilots.
 *   surfaceAt(x, z)  the ground's material without roofs
 *   field            the valley's heightfield (heights.js or swiss2's)
 *   far              the range beyond, as the grid its mesh is drawn from
 *                    (src/maps/alps/terrain.js farRange)
 *   headwall         the alps' headwall as triangles, the ones its mesh
 *                    draws (src/maps/alps/nature.js buildHeadwall), or null
 *
 * scripts/world-layer-selftest.js holds the page's drawn far range and
 * headwall to these, and the room's ground to groundAt.
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

import { fbm, noise2, smoothstep } from '../../render/library/noise.js';
import {
  HALF, LAKE_N, LAKE_Y, LIP_DX, POOL, SIDE_Z, SNOW_LINE, SNOW_MAX_SLOPE, STRIP_L, STRIP_W, STRIP_Y, TREE_LINE,
  buildHeightfield, forestDensity, lakeBasin, valleyAxis,
} from '../../maps/alps/heights.js';

/*
 * The ranges beyond the valley, ground a craft can fly over and hit
 * rather than scenery it passes through: 24 km across against the
 * valley's 6. The grid farRange (src/maps/alps/terrain.js) draws its mesh
 * from, vertex (i, j) at x = i * cell - size / 2, z = j * cell - size / 2,
 * index i + (n + 1) * j as PlaneGeometry lays it flat, held in a
 * Float32Array as the mesh's position attribute holds it. height(x, z)
 * reads it on the mesh's own triangles, split on the diagonal
 * PlaneGeometry uses, so what stops a craft is what is drawn.
 */
export function farGrid(field) {
  const size = 24000;
  /* 300 m cells: all of it stands in fog, and at 250 the strip's view
   * swung over its 600k triangle budget with the traffic. 300 also puts a
   * grid line on the field's edge at 3 km, so the seam is a shared edge. */
  const n = 80;
  const cell = size / n;
  const data = new Float32Array((n + 1) * (n + 1));
  for (let j = 0; j <= n; j += 1) {
    for (let i = 0; i <= n; i += 1) {
      const x = i * cell - size / 2;
      const z = j * cell - size / 2;
      const r = Math.hypot(x, z);
      /* Nothing inside the field, a skirt rising from the field's edge,
       * peaks to two and a half kilometres beyond it. The skirt starts at
       * the edge rather than inside it: begun six hundred metres in, it
       * stood up through the valley floor as a bare green wall a few
       * hundred metres past the lake's far shore. */
      const skirt = smoothstep(HALF - 100, HALF + 2300, r);
      let h = skirt * (1500 + 900 * fbm(x / 2200, z / 2200, 4) + 350 * fbm(x / 700, z / 700, 3)) - 40 * (1 - skirt);
      /* Past the field's edge the range starts where the valley's own
       * ground stops and eases into its peaks. Without this the valley's
       * side walls ended at 1.3 km and the range began at the bottom of a
       * trench round the whole world. The heightfield clamps to its edge,
       * so outside it reads the edge height straight out. */
      const out = Math.max(Math.abs(x), Math.abs(z)) - HALF;
      if (out >= 0) {
        h = Math.max(h, field.height(x, z) * (1 - smoothstep(0, 2500, out)));
      }
      data[i + (n + 1) * j] = h;
    }
  }
  const at = (i, j) => data[Math.max(0, Math.min(n, j)) * (n + 1) + Math.max(0, Math.min(n, i))];
  const height = (x, z) => {
    const u = (x + size / 2) / cell;
    const v = (z + size / 2) / cell;
    const i = Math.floor(u);
    const j = Math.floor(v);
    const fu = Math.max(0, Math.min(1, u - i));
    const fv = Math.max(0, Math.min(1, v - j));
    const h00 = at(i, j);
    const h10 = at(i + 1, j);
    const h01 = at(i, j + 1);
    const h11 = at(i + 1, j + 1);
    if (fu + fv <= 1) {
      return h00 + (h10 - h00) * fu + (h01 - h00) * fv;
    }
    return h11 + (h01 - h11) * (1 - fu) + (h10 - h11) * (1 - fv);
  };
  return { size, n, data, height };
}

/* The village plateau's footprint, the same terms terrainHeight holds it
 * flat with, so the mown stripes stop where the plateau does. */
function plateauAt(x, z) {
  return (1 - smoothstep(STRIP_L / 2 + 60, STRIP_L / 2 + 260, Math.abs(z))) * (1 - smoothstep(150, 320, Math.abs(x + 60)));
}

/*
 * What the ground is at (x, z), as weights from nought to one, read with
 * the slope taken `d` metres either side. The cel paint mixes its colours
 * from these and the photographic ground blends its texture layers by
 * them, so both looks agree where the forest floor, the scree, the rock,
 * the snow and the shore are. Fills and returns `out`:
 *
 *   y, slope, grain, patch  the height, the slope and two noises
 *   flat                    the village plateau
 *   up                      floor to pasture, by height
 *   hay                     the hayfield patches (before `up` fades them)
 *   bloom                   the flower patches on the pasture
 *   forest                  forestDensity, exactly what the trees read
 *   scree, screeLight       the fans below the cliffs, and which streak
 *   rock, faces             rock above the trees and on steep ground, and
 *                           the steep faces that carry strata
 *   snow                    snow above the line and old snow in hollows
 *   lake, shore, silt, bed  inside the basin: the gravel round the shore,
 *                           and silt and the bed under it (times shore)
 */
export function groundZone(field, x, z, d, out) {
  const y = field.height(x, z);
  const sx = (field.height(x + d, z) - field.height(x - d, z)) / (2 * d);
  const sz = (field.height(x, z + d) - field.height(x, z - d)) / (2 * d);
  const slope = Math.hypot(sx, sz);
  const grain = fbm(x / 80, z / 80, 2);
  const patch = noise2(x / 34 + 9.1, z / 34 + 3.7);
  out.y = y;
  out.slope = slope;
  out.grain = grain;
  out.patch = patch;
  out.flat = plateauAt(x, z);
  /* The floor and the pasture. Hayfields are patches of a yellower
   * green a hundred metres across. */
  out.up = smoothstep(60, 500, y);
  out.hay = smoothstep(0.55, 0.7, noise2(x / 140 + 3.3, z / 140 + 8.8));
  /* Flower patches on the pasture below the tree line: a warmer
   * green, and the texels speckle it. */
  out.bloom = smoothstep(0.58, 0.7, patch) * smoothstep(40, 120, y) * (1 - smoothstep(TREE_LINE - 200, TREE_LINE, y)) * (1 - smoothstep(0.45, 0.7, slope));
  /* The forest floor, exactly under the density the trees are
   * planted with. */
  out.forest = forestDensity(x, y, z, slope, sz);
  /* Scree below the cliffs, streaked down the fall line. Uphill is
   * against the gradient; steep ground forty five metres up from a
   * moderate slope is where the cliff sheds. */
  out.scree = 0;
  out.screeLight = false;
  if (slope > 0.04 && slope < 0.85) {
    const ax = x - sx / slope * 45;
    const az = z - sz / slope * 45;
    const usx = (field.height(ax + 6, az) - field.height(ax - 6, az)) / 12;
    const usz = (field.height(ax, az + 6) - field.height(ax, az - 6)) / 12;
    const sc = smoothstep(0.85, 1.15, Math.hypot(usx, usz)) * smoothstep(0.3, 0.55, slope);
    if (sc > 0.02) {
      out.scree = sc;
      out.screeLight = noise2((-sz * x + sx * z) / slope / 7 + 1.7, y / 40) > 0.5;
    }
  }
  /* Rock on the steep faces and above the trees; the faces get
   * their strata from the texels. */
  const rockiness = Math.max(smoothstep(0.8, 1.05, slope), smoothstep(TREE_LINE + 80, TREE_LINE + 220, y + 60 * grain));
  out.rock = rockiness;
  out.faces = smoothstep(0.7, 1.0, slope) * rockiness;
  /* Snow above the line on anything that will hold it, and old snow
   * in the hollows below it. */
  const line = SNOW_LINE + 150 * grain;
  let snowy = smoothstep(line - 100, line + 100, y) * (1 - smoothstep(SNOW_MAX_SLOPE - 0.3, SNOW_MAX_SLOPE + 0.3, slope));
  if (y > line - 330 && slope < 0.8) {
    const hollow = smoothstep(0.66, 0.74, noise2(x / 60 + 2.2, z / 60 + 7.9)) * smoothstep(line - 330, line - 180, y) * (1 - smoothstep(0.5, 0.8, slope));
    snowy = Math.max(snowy, hollow);
  }
  out.snow = snowy;
  /* The lake basin: gravel round the shore, silt under the
   * shallows, the bed under the deep water. */
  out.lake = y < LAKE_Y + 3.5 && z > LAKE_N;
  out.shore = 0;
  out.silt = 0;
  out.bed = 0;
  if (out.lake) {
    const basin = lakeBasin(z);
    out.shore = (1 - smoothstep(LAKE_Y + 1.5, LAKE_Y + 3.5, y)) * smoothstep(0.2, 0.5, basin);
    out.silt = 1 - smoothstep(LAKE_Y - 3, LAKE_Y - 1.2, y);
    out.bed = 1 - smoothstep(LAKE_Y - 9, LAKE_Y - 4, y);
  }
  return out;
}

/*
 * THE HEADWALL'S BAND. The side valley's trough, which the stream follows
 * up to the fall, and the cliff band the fall drops over. The band runs
 * along the hanging valley's lip, its foot twenty metres short of LIP_DX
 * and its top the ground thirty metres past it, with a level ledge
 * between the two over the slope the heightfield can hold. It is full
 * height across the side valley and dies away into the hillside either
 * side as the lip does, so its ends are the lip's own ends. faceDx is how
 * far out from the axis the face stands at z, wandering a little.
 * natureSites (src/maps/alps/nature.js) places the stream, the fall and
 * where nothing grows by these.
 */
export function headwallBand(heightAt) {
  const trough = (dx) => SIDE_Z + 10 * smoothstep(700, 1000, dx) + 6 * Math.sin(dx / 60);
  const fallZ = trough(POOL.dx + POOL.r);
  const BAND = 430;
  const faceDx = (z) => LIP_DX - 20 + 7 * (noise2(z / 45 + 3.3, 8.1) - 0.5);
  const BACK_DX = LIP_DX + 30;
  const bandTop = (z, foot) => {
    const full = heightAt(valleyAxis(z) + BACK_DX, z);
    const w = smoothstep(0.35, 0.75, Math.exp(-Math.pow((z - SIDE_Z) / 420, 2)));
    return foot + Math.max(0, full - foot) * w;
  };
  return { trough, fallZ, BAND, faceDx, BACK_DX, bandTop };
}

/*
 * THE HEADWALL. The heightfield's thirty metre cells cannot hold a face
 * much steeper than forty five degrees, and water laid down a slope that
 * shallow read as a white stripe painted on the hill. So the lip gets a
 * cliff of its own: banded rock from the foot of the lip to its top,
 * broken into crags by the noise, with a turf ledge back to where the
 * ground comes up to meet it.
 *
 * The ground the plant meets there is the wall as seen from above
 * (topDown), which the world raises its heightfield to, and the material
 * of it: the ledge's flat top is turf as drawn, so grass to the crash
 * model; the face, and the slope the grid leans out of it, are rock.
 * Without it the craft met the heightfield's forty five degree slope,
 * which stands up to sixty metres behind the drawn face, and flew through
 * the rock.
 *
 * Returns the triangles, nine numbers each in `pos`, and per triangle in
 * `kinds` what it is drawn as: 'rock', 'strata' (a dark band in three,
 * following the rows round) or 'turf' (the ledge). buildHeadwall
 * (src/maps/alps/nature.js) draws these and topDown makes the ground of
 * them, whose ties hang on the order they are laid in. Winding: the face
 * looks down the valley at the pool, the ledge looks up.
 */
function headwallTriangles(heightAt) {
  const { fallZ, BAND, faceDx, bandTop, BACK_DX } = headwallBand(heightAt);
  const COLS = Math.round((2 * BAND) / 6);
  const ROWS = 16;
  const pos = [];
  const kinds = [];
  const face = [];
  const ledge = [];
  for (let k = 0; k <= COLS; k += 1) {
    const z = fallZ - BAND + (2 * BAND * k) / COLS;
    const ax = valleyAxis(z);
    const fx = ax + faceDx(z);
    const foot = heightAt(fx, z);
    const top = bandTop(z, foot);
    const base = foot - 3;
    const rows = [];
    for (let r = 0; r <= ROWS; r += 1) {
      const y = base + ((top - base) * r) / ROWS;
      const crag = r === 0 || r === ROWS ? 0 : 3.2 * (noise2(k * 0.83 + 4.1, r * 0.91 + 2.3) - 0.5);
      rows.push([fx - crag, y, z]);
    }
    face.push(rows);
    ledge.push([[fx, top, z], [ax + BACK_DX, top, z]]);
  }
  const tri = (a, b, c, kind) => {
    kinds.push(kind);
    pos.push(...a, ...b, ...c);
  };
  for (let k = 0; k < COLS; k += 1) {
    for (let r = 0; r < ROWS; r += 1) {
      const a = face[k][r];
      const b = face[k][r + 1];
      const c = face[k + 1][r];
      const d = face[k + 1][r + 1];
      const kind = r % 3 === 1 ? 'strata' : 'rock';
      tri(a, c, b, kind);
      tri(c, d, b, kind);
    }
    const a = ledge[k][0];
    const b = ledge[k][1];
    const c = ledge[k + 1][0];
    const d = ledge[k + 1][1];
    tri(a, c, b, 'turf');
    tri(c, d, b, 'turf');
  }
  return { pos, kinds };
}

/* The headwall's ground grid, metres a cell: under a metre, so the
 * crags the face is broken into (3.2 m deep) stand where they are drawn. */
const HEADWALL_CELL = 0.5;
/* The steepest the plant is handed the face, metres up a metre out. The
 * ground plane's normal is sampled across 0.35 m and refreshed every
 * eighth step (src/main.js sampleGroundNormal), so a craft pressed a
 * metre or two into a sheer face stood its probe on the ledge behind it,
 * read the ledge's level normal there, and was thrown fifty metres up
 * onto it. At this rise the face is a slope the probe stays on. */
const HEADWALL_RISE = 20;

/*
 * A heightfield of triangle soup `pos` (x, y, z triples), as a ray from
 * straight above meets it: each cell holds the highest point of any
 * triangle over it, -Infinity where none is. A cell's centre takes the
 * triangles whose plan covers it; the edges are walked at a quarter cell
 * as well, for the faces near vertical, whose plan is a sliver no centre
 * falls in and whose highest point is on an edge.
 *
 * Then no cell is let stand more than `rise` times its width over the
 * cell before it on the -x side, which is where the face looks: a cell
 * that would is raised, so the face leans out over its foot as a slope
 * that steep, never back behind what is drawn.
 *
 * `isTurf[t]` says triangle t (pos, nine numbers a triangle) is drawn as
 * turf. Each cell remembers whether the triangle that set its height is,
 * and a cell the slope raised is rock: that is the face leaning out.
 *
 * Returns { height, surface }. height(x, z) is bilinear between the four
 * cells round the point when all four hold the wall, else the highest of
 * those that do, so the face is never drawn in front of what the grid
 * holds. surface(x, z) is 'grass' where all four cells round the point are
 * turf, so the level ledge and not its lip, where a cell holds the face's
 * top beside the ledge's; else 'rock'; null where none holds the wall.
 */
function topDown(pos, isTurf, cell, rise) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  let y0 = Infinity, y1 = -Infinity;
  for (let k = 0; k < pos.length; k += 3) {
    x0 = Math.min(x0, pos[k]);
    x1 = Math.max(x1, pos[k]);
    y0 = Math.min(y0, pos[k + 1]);
    y1 = Math.max(y1, pos[k + 1]);
    z0 = Math.min(z0, pos[k + 2]);
    z1 = Math.max(z1, pos[k + 2]);
  }
  /* Room on the -x side for the slope's foot. */
  x0 -= cell + (y1 - y0) / rise;
  z0 -= cell;
  const nx = Math.ceil((x1 - x0) / cell) + 2;
  const nz = Math.ceil((z1 - z0) / cell) + 2;
  const top = new Float32Array(nx * nz).fill(-Infinity);
  const turfCell = new Uint8Array(nx * nz);
  let turfNow = false;
  /* The ledge wins a tie with the face: the ledge's lip is where the
   * face's top row meets it, at the same height. */
  const put = (i, j, y) => {
    if (i < 0 || j < 0 || i >= nx || j >= nz) {
      return;
    }
    const at = j * nx + i;
    const f = Math.fround(y);
    if (f > top[at] || (f === top[at] && turfNow)) {
      top[at] = f;
      turfCell[at] = turfNow ? 1 : 0;
    }
  };
  const edge = (ax, ay, az, bx, by, bz) => {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / (cell / 4)) + 1;
    for (let q = 0; q <= n; q += 1) {
      const t = q / n;
      put(Math.round((ax + (bx - ax) * t - x0) / cell), Math.round((az + (bz - az) * t - z0) / cell), ay + (by - ay) * t);
    }
  };
  for (let k = 0; k < pos.length; k += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = pos.slice(k, k + 9);
    turfNow = isTurf[k / 9];
    edge(ax, ay, az, bx, by, bz);
    edge(bx, by, bz, cx, cy, cz);
    edge(cx, cy, cz, ax, ay, az);
    const area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
    if (Math.abs(area) < 1e-6) {
      continue;
    }
    const i0 = Math.ceil((Math.min(ax, bx, cx) - x0) / cell);
    const i1 = Math.floor((Math.max(ax, bx, cx) - x0) / cell);
    const j0 = Math.ceil((Math.min(az, bz, cz) - z0) / cell);
    const j1 = Math.floor((Math.max(az, bz, cz) - z0) / cell);
    for (let j = j0; j <= j1; j += 1) {
      const z = z0 + j * cell;
      for (let i = i0; i <= i1; i += 1) {
        const x = x0 + i * cell;
        const u = ((bx - x) * (cz - z) - (cx - x) * (bz - z)) / area;
        const v = ((cx - x) * (az - z) - (ax - x) * (cz - z)) / area;
        const w = 1 - u - v;
        if (u >= 0 && v >= 0 && w >= 0) {
          put(i, j, u * ay + v * by + w * cy);
        }
      }
    }
  }
  for (let j = 0; j < nz; j += 1) {
    for (let i = nx - 2; i >= 0; i -= 1) {
      const raised = top[j * nx + i + 1] - rise * cell;
      if (raised > top[j * nx + i]) {
        top[j * nx + i] = raised;
        turfCell[j * nx + i] = 0;
      }
    }
  }
  const height = (x, z) => {
    const gx = (x - x0) / cell;
    const gz = (z - z0) / cell;
    const i = Math.floor(gx);
    const j = Math.floor(gz);
    if (i < 0 || j < 0 || i >= nx - 1 || j >= nz - 1) {
      return -Infinity;
    }
    const a = top[j * nx + i];
    const b = top[j * nx + i + 1];
    const c = top[(j + 1) * nx + i];
    const d = top[(j + 1) * nx + i + 1];
    if (a === -Infinity || b === -Infinity || c === -Infinity || d === -Infinity) {
      return Math.max(a, b, c, d);
    }
    const fu = gx - i;
    const fv = gz - j;
    return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv;
  };
  const surface = (x, z) => {
    const i = Math.floor((x - x0) / cell);
    const j = Math.floor((z - z0) / cell);
    if (i < 0 || j < 0 || i >= nx - 1 || j >= nz - 1) {
      return null;
    }
    const around = [j * nx + i, j * nx + i + 1, (j + 1) * nx + i, (j + 1) * nx + i + 1];
    if (around.every((k) => top[k] === -Infinity)) {
      return null;
    }
    return around.every((k) => turfCell[k]) ? 'grass' : 'rock';
  };
  return { height, surface };
}

/* A map's spec: its field, and whether its nature stands the headwall (the
 * cel alps do). Only the alps' is here: the alps boot with this module, and
 * a second valley's field is fetched only by a pilot who chooses it (lint:memory),
 * so a style carries its own spec (SWISS_WORLD, swiss2/field.js). */
const MAPS = Object.freeze({
  alps: { field: buildHeightfield, headwall: true },
});

export function makeValleyWorld(map, spec = MAPS[map]) {
  if (!spec) {
    throw new Error(`valley world: no map ${map}`);
  }
  const field = spec.field();
  const far = farGrid(field);
  const heightAt = (x, z) => field.height(x, z);
  const headwall = spec.headwall ? headwallTriangles(heightAt) : null;
  const wall = headwall ? topDown(headwall.pos, headwall.kinds.map((k) => k === 'turf'), HEADWALL_CELL, HEADWALL_RISE) : null;
  const inField = (x, z) => Math.abs(x) <= HALF && Math.abs(z) <= HALF;
  const onStrip = (x, z) => Math.abs(x) <= STRIP_W / 2 && Math.abs(z) <= STRIP_L / 2;
  /* Inside the field the far range sits under the valley's ground, so the
   * higher of the two is the ground, and so is the headwall over the
   * field. Outside it only the far range is drawn: the heightfield there
   * is its own edge clamped outward, an invisible floor that is not what
   * the pilot sees. The strip's two centimetres, and the lake's surface:
   * a wing that lands on the water rests on it rather than in the basin. */
  const groundAt = (x, z) => {
    const h = inField(x, z)
      ? Math.max(field.height(x, z), far.height(x, z), wall ? wall.height(x, z) : -Infinity)
      : far.height(x, z);
    if (onStrip(x, z)) {
      return Math.max(h, STRIP_Y);
    }
    return h < LAKE_Y ? LAKE_Y : h;
  };
  /* The headwall's material where its grid is the ground, else null: the
   * ledge's turf top is grass and the face rock. The terrain painted under
   * the wall says nothing about what is drawn. */
  const wallSurface = (x, z) => {
    if (!wall || !inField(x, z)) {
      return null;
    }
    return wall.height(x, z) >= Math.max(field.height(x, z), far.height(x, z)) ? wall.surface(x, z) : null;
  };
  /* The ground's material off the zones it is painted by, so the snow a
   * wing digs into is the snow on screen. The far range is rock. */
  const zone = {};
  const terrainSurface = (x, z) => {
    if (!inField(x, z)) {
      return 'rock';
    }
    if (onStrip(x, z)) {
      return 'grass';
    }
    groundZone(field, x, z, 2, zone);
    if (zone.snow > 0.5) {
      return 'snow';
    }
    if (zone.rock > 0.5 || zone.scree > 0.5) {
      return 'rock';
    }
    if (zone.lake && zone.shore > 0.5) {
      return 'dirt';
    }
    return 'grass';
  };
  return {
    map,
    field,
    far,
    headwall,
    groundAt,
    surfaceAt: (x, z) => wallSurface(x, z) ?? terrainSurface(x, z),
  };
}
