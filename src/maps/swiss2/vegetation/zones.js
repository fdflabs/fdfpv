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
import { RUNWAY_HALF, APRON } from '../ground.js';
import {
  STRIP_L, STRIP_W, LAKE_N, LAKE_Y, LAKE_END, SIDE_Z, LIP_DX, POOL, FIELD, HALF,
  valleyAxis, streamX,
} from '../../alps/terrain.js';

/* The valley road, as village.js lays it: along the axis, 55 m east of
 * it, 6.5 m of asphalt from z -2700 to the lake shore at ROAD_END; the
 * street west off it at STREET_Z, 5 m wide, to the square. */
export const ROAD_DX = 55;
export const ROAD_END = 1950;
export const STREET_Z = 115;
export const SQUARE = { x: -190, z: 115, w: 34, d: 30 };

/* ground.js's s2Hash, s2Noise and s2Fbm, in JavaScript, so what is
 * planted can agree with what the splat paints. */
const fract = (v) => v - Math.floor(v);
function s2Hash(x, y) {
  let a = fract(x * 0.1031);
  let b = fract(y * 0.1031);
  let c = fract(x * 0.1031);
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  a += d;
  b += d;
  c += d;
  return fract((a + b) * c);
}
export function s2Noise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = s2Hash(ix, iy);
  const b = s2Hash(ix + 1, iy);
  const c = s2Hash(ix, iy + 1);
  const e = s2Hash(ix + 1, iy + 1);
  return (a + (b - a) * ux) + ((c + (e - c) * ux) - (a + (b - a) * ux)) * uy;
}
function s2Fbm(x, y) {
  return s2Noise(x, y) * 0.55 + s2Noise(x * 2.07 + 17.1, y * 2.07 + 17.1) * 0.3 + s2Noise(x * 4.13 + 3.7, y * 4.13 + 3.7) * 0.15;
}

/* ground.js's parcels (MEADOW_GLSL's s2Parcel and the kind s2Meadow
 * reads off it), in JavaScript, so a fence can stand on the line
 * between two fields the paint draws, and a bale lie in a field the
 * paint has mown. Term for term: a change there has to be made here.
 * (Its s2StreamX is terrain.js's streamX.) */
function s2Cut(k, w, seed) {
  return s2Hash(k, seed) < 0.3 ? 1e7 : (k + 0.8 * (s2Hash(k, seed + 1.3) - 0.5)) * w;
}
function s2Cuts(x, w, seed) {
  const k0 = Math.floor(x / w);
  let lo = -1e7;
  let hi = 1e7;
  let klo = k0 - 4;
  for (let i = -3; i <= 4; i += 1) {
    const k = k0 + i;
    const c = s2Cut(k, w, seed);
    if (c > 1e6) {
      continue;
    }
    if (c <= x && c > lo) {
      lo = c;
      klo = k;
    }
    if (c > x && c < hi) {
      hi = c;
    }
  }
  return [lo, hi, klo];
}
/*
 * The field at (x, z): its id (own), the distance to its nearest
 * boundary (edge), the point in its strip's frame (u, v), and what the
 * paint makes of it (kind: 'uncut', 'regrown', 'cut', 'pasture' or
 * 'dry'), with `plateau`, how far into the kept short village greens.
 */
export function meadowField(x, z) {
  let qx = x - streamX(z);
  let qy = z;
  qy += 60 * (s2Noise(x / 700 + 4, z / 700 + 4) - 0.5) + 14 * (s2Noise(x / 140 + 9, z / 140 + 9) - 0.5);
  qx += 40 * (s2Noise(x / 520 + 7, z / 520 + 7) - 0.5);
  const sv = s2Cuts(qy, 42, 5.7);
  const strip = sv[2];
  const slant = 0.9 * (s2Hash(strip, 2.9) - 0.5);
  const u = qx + slant * (qy - 0.5 * (sv[0] + sv[1]));
  const wu = 90 + 140 * s2Hash(strip, 6.1);
  const off = wu * s2Hash(strip, 3.3);
  const su = s2Cuts(u + off, wu, strip * 1.7 + 0.4);
  const eAcross = Math.min(qy - sv[0], sv[1] - qy);
  const eAlong = Math.min(u + off - su[0], su[1] - u - off) / Math.sqrt(1 + slant * slant);
  const own = [su[2], strip];
  const k = s2Hash(own[0] + 4.4, own[1] + 4.4);
  const kind = k < 0.28 ? 'uncut' : k < 0.5 ? 'regrown' : k < 0.7 ? 'cut' : k < 0.93 ? 'pasture' : 'dry';
  const plateau = (1 - smoothstep(140, 340, Math.abs(z))) * (1 - smoothstep(150, 320, Math.abs(x + 60)));
  return {
    own, edge: Math.min(eAcross, eAlong), across: eAcross < eAlong, u, v: qy, kind, plateau,
    /* Whether the mown rows are lines of one u (else of one v). */
    rowsOnU: s2Hash(own[0] + 2.2, own[1] + 2.2) >= 0.5,
    /* The ground by the stream is left uncut. */
    damp: 1 - smoothstep(18, 75, Math.abs(x - streamX(z)) + 25 * (s2Noise(x / 45, z / 45) - 0.5)),
  };
}

/*
 * The airfield as ground.js's s2Air lays it, for the grass: the runway,
 * the long grass beside it, the wheel tracks and the ground worn where
 * the aircraft turn and stand, each nought to one, as seen from far
 * enough that none of it is finer than a pixel. Term for term: a change
 * there has to be made here.
 */
/* ground.js's s2Line and s2Rut with the pixel left out: a line w wide
 * about 0, shading off to its edges. */
const line = (x, w) => 1 - smoothstep(0.1 * w, 0.5 * w, Math.abs(x));
export function airfield(x, z) {
  const ax = Math.abs(x);
  const az = Math.abs(z);
  const wob = 0.5 * (s2Noise(x / 9 + 3.1, z / 9 + 3.1) - 0.5) + 0.2 * (s2Noise(x / 1.7 + 8.3, z / 1.7 + 8.3) - 0.5);
  const ends = 1 - smoothstep(STRIP_L / 2 + 5, STRIP_L / 2 + 8, az + 2 * (s2Noise(x / 6 + 1.9, z / 6 + 1.9) - 0.5));
  const runway = (1 - smoothstep(RUNWAY_HALF, RUNWAY_HALF + 0.25, ax + wob)) * ends;
  const side = 1 - smoothstep(16, 30, ax + 10 * (s2Noise(x / 27 + 5.3, z / 27 + 5.3) - 0.5));
  const along = 1 - smoothstep(STRIP_L / 2 + 8, STRIP_L / 2 + 30, az);
  const rough = (1 - runway) * side * along;
  const lane = x - 0.5 * Math.sin(z / 41) - 0.25 * Math.sin(z / 13 + 1.3);
  const tw = 0.45 + 0.3 * s2Noise(x / 3 + 7, z / 3 + 7);
  const mains = Math.max(line(lane - 1, tw), line(lane + 1, tw));
  const tail = 0.5 * line(lane, 0.3);
  const use = 0.4 + 0.6 * smoothstep(15, 60, az);
  const patchy = smoothstep(0.2, 0.65, s2Noise(x * 0.3 + 11, z * 0.25 + 11));
  const track = Math.max(mains, tail) * use * runway * patchy * (0.65 + 0.35 * s2Noise(x / 4 + 2.2, z / 4 + 2.2));
  const turn = 1 - smoothstep(5, 10, Math.hypot(x, az - (STRIP_L / 2 - 6)) + 3 * (s2Noise(x / 3.5 + 4.4, z / 3.5 + 4.4) - 0.5));
  const ax2 = Math.max(Math.abs(x - APRON.x) - APRON.hx, 0);
  const az2 = Math.max(Math.abs(z - APRON.z) - APRON.hz, 0);
  const apron = (1 - smoothstep(0.5, 4, Math.hypot(ax2, az2) + 2.5 * (s2Noise(x / 3 + 6.6, z / 3 + 6.6) - 0.5)))
    * (0.35 + 0.65 * smoothstep(0.3, 0.6, s2Noise(x / 5.5 + 1.4, z / 5.5 + 1.4)));
  const worn = Math.max(turn * (0.55 + 0.45 * s2Noise(x / 2.5, z / 2.5)), apron);
  /* On the apron's concrete itself. */
  const paved = Math.abs(x - APRON.x) < APRON.hx - 0.2 && Math.abs(z - APRON.z) < APRON.hz - 0.2;
  return {
    runway, rough, track, worn, paved,
  };
}

/*
 * The lines between the parcels on the floor (ground under 40 m), as
 * polylines in metre steps: the strips' sides across the valley, and
 * each strip's cuts into fields along it. Each is walked in the frame
 * meadowField reads (the strips bend with the stream and wander by the
 * noise), solving for the world point on it by a few fixed point steps,
 * which converge because the wander is slow.
 */
export function meadowCuts(heightAt) {
  const warpY = (x, z) => 60 * (s2Noise(x / 700 + 4, z / 700 + 4) - 0.5) + 14 * (s2Noise(x / 140 + 9, z / 140 + 9) - 0.5);
  const warpX = (x, z) => 40 * (s2Noise(x / 520 + 7, z / 520 + 7) - 0.5);
  const lines = [];
  let run = [];
  const end = () => {
    if (run.length > 3) {
      lines.push(run);
    }
    run = [];
  };
  const visit = (x, z) => {
    if (heightAt(x, z) < 40) {
      run.push({ x, z });
    } else {
      end();
    }
  };
  const cuts = [];
  for (let k = Math.floor(-2850 / 42); k <= Math.ceil(2000 / 42); k += 1) {
    const c = s2Cut(k, 42, 5.7);
    if (c < 1e6) {
      cuts.push({ k, c });
    }
  }
  for (const { c } of cuts) {
    const ax = valleyAxis(c);
    for (let x = ax - 560; x <= ax + 560; x += 1) {
      let z = c;
      for (let i = 0; i < 4; i += 1) {
        z = c - warpY(x, z);
      }
      visit(x, z);
    }
    end();
  }
  for (let i = 0; i + 1 < cuts.length; i += 1) {
    const strip = cuts[i].k;
    const v0 = cuts[i].c;
    const v1 = cuts[i + 1].c;
    const mid = 0.5 * (v0 + v1);
    const slant = 0.9 * (s2Hash(strip, 2.9) - 0.5);
    const wu = 90 + 140 * s2Hash(strip, 6.1);
    const off = wu * s2Hash(strip, 3.3);
    const seed = strip * 1.7 + 0.4;
    for (let j = Math.floor((off - 640) / wu); j <= Math.ceil((off + 640) / wu); j += 1) {
      const c = s2Cut(j, wu, seed);
      if (c > 1e6) {
        continue;
      }
      const target = c - off;
      for (let v = v0; v <= v1; v += 1) {
        let z = v;
        let x = target + streamX(v);
        for (let n = 0; n < 4; n += 1) {
          z = v - warpY(x, z);
          x = target - slant * (v - mid) + streamX(z) - warpX(x, z);
        }
        visit(x, z);
      }
      end();
    }
  }
  return lines;
}

/* Whether (x, z) is by nature.js's jetty, which it builds off the north
 * shore in line with the road's end (buildShore), or the boat it pulls
 * up on the gravel beside it: the water and the beach there are kept
 * clear of stones and reeds. */
export function jettyClear(heightAt) {
  const jx = valleyAxis(ROAD_END) + ROAD_DX;
  let jz = ROAD_END;
  while (heightAt(jx, jz) > LAKE_Y && jz < LAKE_END) {
    jz += 1;
  }
  return (x, z) => (Math.abs(x - jx) < 9 && z > jz - 14 && z < jz + 32) || Math.hypot(x - (jx - 14), z - (jz - 6)) < 6;
}

/* How high the lake's gravel beach reaches over the water at (x, z), as
 * ground.js lays it (its beachTop): half a metre to two. */
export function beachTop(x, z) {
  return LAKE_Y + 0.5 + 1.6 * s2Fbm(x / 41, z / 41) + 0.7 * (s2Noise(x / 7, z / 7) - 0.5);
}

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
    const road = z > -2720 && z < ROAD_END + 4 && Math.abs(x - (valleyAxis(z) + ROAD_DX)) < 3.7;
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
  /* Water or the lake's beach under a point, and how far it is from the
   * stream's line: the ground cover thins to nothing on the banks. */
  const lakeWet = (x, z) => z > LAKE_N - 60 && heightAt(x, z) < beachTop(x, z) - 0.3;
  const streamDist = (x, z) => {
    if (z > SIDE_Z - 40 && z < LAKE_END) {
      return Math.abs(x - streamX(z));
    }
    return Infinity;
  };

  /* Whether a tree's trunk would stand on or against a wall (a house's
   * or a hay hut's): the footprints three metres wide on a grid of four
   * metre cells, so the forest's million candidates each read one cell. */
  const SOLID = 4;
  const solidN = Math.ceil(FIELD / SOLID);
  const solid = new Uint8Array(solidN * solidN);
  for (const f of footprints) {
    const i0 = Math.max(0, Math.floor((f.minX - 3 + HALF) / SOLID));
    const i1 = Math.min(solidN - 1, Math.floor((f.maxX + 3 + HALF) / SOLID));
    const j0 = Math.max(0, Math.floor((f.minZ - 3 + HALF) / SOLID));
    const j1 = Math.min(solidN - 1, Math.floor((f.maxZ + 3 + HALF) / SOLID));
    for (let j = j0; j <= j1; j += 1) {
      solid.fill(1, j * solidN + i0, j * solidN + i1 + 1);
    }
  }
  const solidAt = (x, z) => {
    const i = Math.floor((x + HALF) / SOLID);
    const j = Math.floor((z + HALF) / SOLID);
    return i >= 0 && j >= 0 && i < solidN && j < solidN && solid[j * solidN + i] === 1;
  };

  return {
    slopeAt, trough, fallZ, BAND, inBand, faceDx, BACK_DX, bandTop, groundAt, lipY, fallX, pool,
    keepOff, coverOff, lakeWet, streamDist, upper, lower, aboveFall, belowFall, onLedge,
    eastFarm, footprints, solidAt,
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
