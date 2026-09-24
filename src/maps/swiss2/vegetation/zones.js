/*
 * zones.js: where things may grow and where the water runs, in the Swiss
 * valley, for swiss2's vegetation and water.
 *
 * The valley's shape is the alps map's (src/maps/alps/terrain.js), read
 * through ctx.heightAt. The placement rules are nature.js's: the same
 * headwall band along the hanging valley's lip, the same pool, the same
 * stream line, the same lake shore marched out along rays, and the same
 * places nothing grows (the strip, the road, the street, the village,
 * the eastern farm, the headwall). nature.js keeps all of that in closures
 * inside buildNature, so it cannot be imported; it is restated here, term
 * for term, and anything that changes there has to change here too.
 *
 * Ground cover needs a finer mask than the trees: the trees keep off the
 * whole village box, but grass has to grow up to the strip's edge and
 * between the houses. coverOff is that mask; the map can refine it with
 * the buildings' real footprints through ctx.footprints.
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

import { noise2, smoothstep } from '../../alps/noise.js';
import {
  STRIP_L, STRIP_W, LAKE_N, LAKE_Y, LAKE_END, SIDE_Z, LIP_DX, POOL,
  valleyAxis, streamX,
} from '../../alps/terrain.js';

/* The valley road, as village.js lays it: along the axis, 55 m east of
 * it, 6.5 m of asphalt from z -2700 to the lake shore at ROAD_END; the
 * street west off it at STREET_Z, 5 m wide, to the square. */
export const ROAD_DX = 55;
export const ROAD_END = 1950;
export const STREET_Z = 115;
export const SQUARE = { x: -190, z: 115, w: 34, d: 30 };

/*
 * The layout for one heightfield. Everything here is a pure function of
 * heightAt and the terrain's constants, so the vegetation and the water
 * agree on the stream, the pool and the lip without talking to each
 * other.
 */
export function valleyLayout(heightAt, footprints = []) {
  const slopeAt = (x, z) => {
    const sx = (heightAt(x + 10, z) - heightAt(x - 10, z)) / 20;
    const sz = (heightAt(x, z + 10) - heightAt(x, z - 10)) / 20;
    return { sx, sz, s: Math.hypot(sx, sz) };
  };

  /* The side valley's trough and the headwall band, nature.js's terms. */
  const trough = (dx) => SIDE_Z + 10 * smoothstep(700, 1000, dx) + 6 * Math.sin(dx / 60);
  const fallZ = trough(POOL.dx + POOL.r);
  const BAND = 430;
  const inBand = (z) => Math.abs(z - fallZ) < BAND;
  const faceDx = (z) => LIP_DX - 20 + 7 * (noise2(z / 45 + 3.3, 8.1) - 0.5);
  const BACK_DX = LIP_DX + 30;
  const bandTop = (z, foot) => {
    const full = heightAt(valleyAxis(z) + BACK_DX, z);
    const w = smoothstep(0.35, 0.75, Math.exp(-(((z - SIDE_Z) / 420) ** 2)));
    return foot + Math.max(0, full - foot) * w;
  };
  /* The ground with the headwall's ledge on it. */
  const groundAt = (x, z) => {
    const h = heightAt(x, z);
    const dx = x - valleyAxis(z);
    if (!inBand(z) || dx < faceDx(z) || dx > BACK_DX) {
      return h;
    }
    return Math.max(h, bandTop(z, heightAt(valleyAxis(z) + faceDx(z), z)));
  };
  const lipY = bandTop(fallZ, heightAt(valleyAxis(fallZ) + faceDx(fallZ), fallZ));
  const fallX = valleyAxis(fallZ) + faceDx(fallZ);
  const pool = { x: valleyAxis(POOL.z) + POOL.dx, z: POOL.z, r: POOL.r, y: POOL.y };

  /* Where no tree stands: nature.js's keepOff, unchanged. */
  const eastFarm = { x: valleyAxis(450) + 105, z: 468 };
  const keepOff = (x, z) => {
    if (Math.abs(x) < STRIP_W / 2 + 25 && Math.abs(z) < STRIP_L / 2 + 70) {
      return true;
    }
    if (x > -355 && x < 85 && z > -320 && z < 350) {
      return true;
    }
    if (Math.abs(x - eastFarm.x) < 75 && Math.abs(z - eastFarm.z) < 70) {
      return true;
    }
    if (inBand(z) && x - valleyAxis(z) > faceDx(z) - 30 && x - valleyAxis(z) < BACK_DX + 6) {
      return true;
    }
    if (Math.hypot(x - pool.x, z - pool.z) < POOL.r + 12) {
      return true;
    }
    if (Math.abs(z - STREET_Z) < 8 && x < valleyAxis(STREET_Z) + 70 && x > -215) {
      return true;
    }
    return z > -2720 && z < 1980 && Math.abs(x - (valleyAxis(z) + ROAD_DX)) < 9;
  };

  /*
   * THE STREAM, nature.js's three polylines: the upper run from the
   * hanging valley down the trough (split at the fall into the part on
   * the ledge and the part below it) and the lower run down the floor to
   * the lake, west of the strip.
   */
  const topDx = streamX(SIDE_Z) - valleyAxis(SIDE_Z);
  const upper = [];
  for (let dx = LIP_DX + 260; dx > topDx; dx -= 5) {
    const z = trough(dx);
    upper.push({ x: valleyAxis(z) + dx, z });
  }
  const lower = [];
  for (let z = SIDE_Z; z <= LAKE_END && heightAt(streamX(z), z) > LAKE_Y + 0.2; z += 12) {
    lower.push({ x: streamX(z), z });
  }
  const onLedge = (p) => inBand(p.z) && p.x - valleyAxis(p.z) >= faceDx(p.z);
  const aboveFall = upper.filter(onLedge);
  const belowFall = upper.filter((p) => !onLedge(p));

  /*
   * Ground cover's mask: water, the strip and its margins, the road and
   * the street with their verges, the square, the headwall, and the
   * buildings. Without the map's footprints the buildings are the
   * village core west of the stream and the eastern farm's yard, drawn
   * as boxes; with them, each footprint and two metres round it.
   */
  const coverOff = (x, z) => {
    if (Math.abs(x) < STRIP_W / 2 + 1.5 && Math.abs(z) < STRIP_L / 2 + 4) {
      return true;
    }
    const road = z > -2720 && z < ROAD_END + 4 && Math.abs(x - (valleyAxis(z) + ROAD_DX)) < 4.6;
    if (road || (Math.abs(z - STREET_Z) < 3.6 && x < valleyAxis(STREET_Z) + ROAD_DX && x > SQUARE.x)) {
      return true;
    }
    if (Math.abs(x - SQUARE.x) < SQUARE.w / 2 + 2 && Math.abs(z - SQUARE.z) < SQUARE.d / 2 + 2) {
      return true;
    }
    if (inBand(z) && x - valleyAxis(z) > faceDx(z) - 4 && x - valleyAxis(z) < BACK_DX) {
      return true;
    }
    if (footprints.length) {
      for (const f of footprints) {
        if (x > f.minX - 2 && x < f.maxX + 2 && z > f.minZ - 2 && z < f.maxZ + 2) {
          return true;
        }
      }
    } else if ((x > -345 && x < -60 && z > -40 && z < 330) || (Math.abs(x - eastFarm.x) < 40 && Math.abs(z - eastFarm.z) < 35)) {
      return true;
    }
    return false;
  };
  /* Water under a point, and how far it is from the stream's line: the
   * ground cover thins to nothing on the banks. */
  const lakeWet = (x, z) => z > LAKE_N - 40 && heightAt(x, z) < LAKE_Y + 0.35;
  const streamDist = (x, z) => {
    if (z > SIDE_Z - 40 && z < LAKE_END) {
      return Math.abs(x - streamX(z));
    }
    return Infinity;
  };

  return {
    slopeAt, trough, fallZ, BAND, inBand, faceDx, BACK_DX, bandTop, groundAt, lipY, fallX, pool,
    keepOff, coverOff, lakeWet, streamDist, upper, lower, aboveFall, belowFall, onLedge,
    eastFarm,
  };
}

/*
 * The lake's shore, marched out from the middle of the basin along rays
 * until the ground comes up through the water: nature.js's march, with
 * the depth read at every step kept, so the water can colour itself by
 * how much of it there is.
 */
export function lakeShore(heightAt, rays = 144) {
  const cz = (LAKE_N + LAKE_END) / 2;
  const cx = valleyAxis(cz);
  const shore = [];
  for (let k = 0; k < rays; k += 1) {
    const a = (k / rays) * Math.PI * 2;
    const ux = Math.cos(a);
    const uz = Math.sin(a);
    let r = 0;
    while (r < 1100 && heightAt(cx + ux * r, cz + uz * r) < LAKE_Y) {
      r += 3;
    }
    const h0 = heightAt(cx + ux * (r - 3), cz + uz * (r - 3));
    const h1 = heightAt(cx + ux * r, cz + uz * r);
    const rs = r - 3 + 3 * Math.max(0, Math.min(1, (LAKE_Y - h0) / Math.max(1e-3, h1 - h0)));
    shore.push({ x: cx + ux * rs, z: cz + uz * rs, r: rs, a });
  }
  return { cx, cz, shore };
}
