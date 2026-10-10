/*
 * world.js: the valley's world data for alps and swiss2, without three.js,
 * so the page, the room and an offline bake can all ask what is at (x, z)
 * and get one answer (docs and plan: fdfpv-loop FND-6-SURVEY.md, slice 1).
 *
 * makeValleyWorld(map) returns
 *   groundAt(x, z)   the contact ground without roofs: src/maps/alps.js
 *                    `ground` (field, far range, the alps' headwall, the
 *                    strip, the lake's surface)
 *   surfaceAt(x, z)  the ground's material without roofs: alps.js
 *                    `wallSurface ?? terrainSurface`
 *
 * Nothing imports this yet. scripts/world-layer-selftest.js proves it
 * answers as the page code does; slice 2 points alps.js and
 * edge/rooms/grounds.js at it.
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
import { buildSwissField } from '../../maps/swiss2/field.js';

/* Copied from src/maps/alps/terrain.js farRange (its height sampler, no
 * mesh), which imports three; slice 2 deletes the original. Heights go
 * through a Float32Array as the mesh's position attribute does. */
function farHeight(field) {
  const size = 24000;
  const n = 80;
  const cell = size / n;
  const data = new Float32Array((n + 1) * (n + 1));
  for (let j = 0; j <= n; j += 1) {
    for (let i = 0; i <= n; i += 1) {
      const x = i * cell - size / 2;
      const z = j * cell - size / 2;
      const r = Math.hypot(x, z);
      const skirt = smoothstep(HALF - 100, HALF + 2300, r);
      let h = skirt * (1500 + 900 * fbm(x / 2200, z / 2200, 4) + 350 * fbm(x / 700, z / 700, 3)) - 40 * (1 - skirt);
      const out = Math.max(Math.abs(x), Math.abs(z)) - HALF;
      if (out >= 0) {
        h = Math.max(h, field.height(x, z) * (1 - smoothstep(0, 2500, out)));
      }
      data[i + (n + 1) * j] = h;
    }
  }
  const at = (i, j) => data[Math.max(0, Math.min(n, j)) * (n + 1) + Math.max(0, Math.min(n, i))];
  return (x, z) => {
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
}

/* Copied from src/maps/alps/terrain.js plateauAt and groundZone, which
 * import three; slice 2 deletes the originals. */
function plateauAt(x, z) {
  return (1 - smoothstep(STRIP_L / 2 + 60, STRIP_L / 2 + 260, Math.abs(z))) * (1 - smoothstep(150, 320, Math.abs(x + 60)));
}

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
  out.up = smoothstep(60, 500, y);
  out.hay = smoothstep(0.55, 0.7, noise2(x / 140 + 3.3, z / 140 + 8.8));
  out.bloom = smoothstep(0.58, 0.7, patch) * smoothstep(40, 120, y) * (1 - smoothstep(TREE_LINE - 200, TREE_LINE, y)) * (1 - smoothstep(0.45, 0.7, slope));
  out.forest = forestDensity(x, y, z, slope, sz);
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
  const rockiness = Math.max(smoothstep(0.8, 1.05, slope), smoothstep(TREE_LINE + 80, TREE_LINE + 220, y + 60 * grain));
  out.rock = rockiness;
  out.faces = smoothstep(0.7, 1.0, slope) * rockiness;
  const line = SNOW_LINE + 150 * grain;
  let snowy = smoothstep(line - 100, line + 100, y) * (1 - smoothstep(SNOW_MAX_SLOPE - 0.3, SNOW_MAX_SLOPE + 0.3, slope));
  if (y > line - 330 && slope < 0.8) {
    const hollow = smoothstep(0.66, 0.74, noise2(x / 60 + 2.2, z / 60 + 7.9)) * smoothstep(line - 330, line - 180, y) * (1 - smoothstep(0.5, 0.8, slope));
    snowy = Math.max(snowy, hollow);
  }
  out.snow = snowy;
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

/* Copied from src/maps/alps/nature.js (natureSites' band, buildHeadwall's
 * triangles without the mesh, topDown), which imports three; slice 2
 * deletes the originals. Returns { height, surface } as buildHeadwall
 * does. */
const HEADWALL_CELL = 0.5;
const HEADWALL_RISE = 20;

function headwall(heightAt) {
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
  const COLS = Math.round((2 * BAND) / 6);
  const ROWS = 16;
  const pos = [];
  const face = [];
  const ledge = [];
  const isTurf = [];
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
  const tri = (a, b, c, turf) => {
    isTurf.push(turf);
    pos.push(...a, ...b, ...c);
  };
  for (let k = 0; k < COLS; k += 1) {
    for (let r = 0; r < ROWS; r += 1) {
      const a = face[k][r];
      const b = face[k][r + 1];
      const c = face[k + 1][r];
      const d = face[k + 1][r + 1];
      tri(a, c, b, false);
      tri(c, d, b, false);
    }
    const a = ledge[k][0];
    const b = ledge[k][1];
    const c = ledge[k + 1][0];
    const d = ledge[k + 1][1];
    tri(a, c, b, true);
    tri(c, d, b, true);
  }
  return topDown(pos, isTurf, HEADWALL_CELL, HEADWALL_RISE);
}

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
  x0 -= cell + (y1 - y0) / rise;
  z0 -= cell;
  const nx = Math.ceil((x1 - x0) / cell) + 2;
  const nz = Math.ceil((z1 - z0) / cell) + 2;
  const top = new Float32Array(nx * nz).fill(-Infinity);
  const turfCell = new Uint8Array(nx * nz);
  let turfNow = false;
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

/* Per map: its field, and whether its nature stands the headwall (the cel
 * alps do; swiss2's nature returns no ground, src/maps/swiss2.js). */
const MAPS = Object.freeze({
  alps: { field: buildHeightfield, headwall: true },
  swiss2: { field: buildSwissField, headwall: false },
});

export function makeValleyWorld(map) {
  const spec = MAPS[map];
  if (!spec) {
    throw new Error(`valley world: no map ${map}`);
  }
  const field = spec.field();
  const far = farHeight(field);
  const wall = spec.headwall ? headwall((x, z) => field.height(x, z)) : null;
  const inField = (x, z) => Math.abs(x) <= HALF && Math.abs(z) <= HALF;
  const onStrip = (x, z) => Math.abs(x) <= STRIP_W / 2 && Math.abs(z) <= STRIP_L / 2;
  const groundAt = (x, z) => {
    const h = inField(x, z)
      ? Math.max(field.height(x, z), far(x, z), wall ? wall.height(x, z) : -Infinity)
      : far(x, z);
    if (onStrip(x, z)) {
      return Math.max(h, STRIP_Y);
    }
    return h < LAKE_Y ? LAKE_Y : h;
  };
  const wallSurface = (x, z) => {
    if (!wall || !inField(x, z)) {
      return null;
    }
    return wall.height(x, z) >= Math.max(field.height(x, z), far(x, z)) ? wall.surface(x, z) : null;
  };
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
    groundAt,
    surfaceAt: (x, z) => wallSurface(x, z) ?? terrainSurface(x, z),
  };
}
