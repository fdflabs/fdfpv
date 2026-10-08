/*
 * weather.js: the air a room flies in, docs/WEATHER-CONTRACT.md.
 *
 * A pure function of (map, preset, seed, position, time): every pilot given
 * the same four flies the same air, and a replay meets it again. The plant
 * takes one horizontal wind and a gust RMS (sim_set_wind), with no position,
 * so the shell evaluates this at the craft before every step and hands the
 * answer over. That puts it in the physics path: only + - * /, comparisons,
 * Math.floor, Math.sqrt (correctly rounded by IEEE 754) and Math.imul, never
 * Math.sin, cos or pow, whose last bits differ between engines.
 *
 * Map frame (Three.js): x and z horizontal, y up, metres; t in seconds.
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

/* The ABI's limits (sim_abi.h, sim_set_wind): mean speed, gust RMS. The
 * mean is held a little under the ABI's 30 so a unit direction's last bit
 * can never carry it over and have the call refused. */
export const WIND_MAX = 29.5;
export const GUST_MAX = 10;
/* A non calm air never reaches exactly zero: SIM_WIND_ON going off mid
 * flight would switch a wing's ground contact model under it. */
const GUST_FLOOR = 0.01;
/* How far a seed turns the prevailing direction: tan of about 25 degrees. */
const SEED_TURN = 0.45;

/* speed m/s at the map's base height; layers [height above base m, mean
 * multiplier], piecewise linear, flat past the ends; gust RMS m/s. */
const LAYERS = [[0, 0.6], [10, 1], [60, 1.35], [200, 1.7]];
export const PRESETS = {
  calm: null,
  breeze: { speed: 3, layers: LAYERS, gust: 0.6, front: null },
  gusty: { speed: 6, layers: LAYERS, gust: 2, front: null },
  front: {
    speed: 5, layers: LAYERS, gust: 1.2,
    front: { every: 2400, width: 300, speed: 8, boost: 2.2, gust: 3, rain: 1 },
  },
};
export const PRESET_IDS = Object.keys(PRESETS);

/* Per map: the height the layers count from (m, map y), the prevailing
 * direction the wind blows toward (unit, map frame), and zones: a line
 * ([[x, z], ...], one segment or more) and the band of radius r round it
 * where the mean is multiplied by shelter
 * and gust m/s added at the axis, both fading to nothing at r, and with
 * height from `top` metres above the base to twice that, so the air well
 * above a ridge or a dam is the open air's.
 *
 * Itaipu: the dam crest, from dam/index.js's main dam frame, at the crest
 * road's 225 m; the air spilling over 196 m of concrete is rough.
 * Swiss2 and the Alps (one valley, src/maps/alps/terrain.js and swiss2's
 * ground, measured with window.__heightAt on a 100 m grid, 2026-10-08): a
 * floor about 600 m wide at x 0 running north and south, walls to 1200 to
 * 1500 m from x -1500 and x 1500. Wind in a deep valley is channelled
 * along its axis, the floor is sheltered from the wind aloft, and the rims
 * are where it breaks into rotor and turbulence.
 * The Interior: rolling ground 230 to 360 m. Paraguay's prevailing wind
 * is from the north east; the only shelter worth a zone is Rio Sereno's
 * lowland (src/share/interior/hydro.js RIVER, inside the played square,
 * simplified to 250 m), a little calmer and a little rougher at the banks'
 * tree lines. */
const VALLEY = [
  { line: [[0, -4500], [0, 4500]], r: 700, shelter: 0.65, gust: 0.3, top: 300 },
  { line: [[-1700, -4500], [-1700, 4500]], r: 600, shelter: 1, gust: 2, top: 1500 },
  { line: [[1700, -4500], [1700, 4500]], r: 600, shelter: 1, gust: 2, top: 1500 },
];
const RIO_SERENO = [
  [-8586, -4388], [-8008, -4555], [-7573, -3750], [-6869, -4377], [-5872, -4371], [-4628, -2829],
  [-3490, -2170], [-3569, -1088], [-2911, 236], [-455, -90], [437, 480], [1098, 210], [1220, 770],
  [1887, 811], [1967, 1487], [3570, 2456], [4539, 2789], [5108, 2349], [6144, 3894], [6597, 3871],
  [6468, 4368], [7252, 4463], [7478, 5527], [8186, 5639], [8101, 6324], [8586, 7170],
];
export const MAPS = {
  itaipu: {
    base: 220, toX: 0.6, toZ: 0.8,
    zones: [{ line: [[-352.9, -1826.5], [636.7, -1610.5]], r: 260, shelter: 0.8, gust: 2.5, top: 60 }],
  },
  swiss2: { base: 0, toX: 0, toZ: -1, zones: VALLEY },
  alps: { base: 0, toX: 0, toZ: -1, zones: VALLEY },
  interior: {
    base: 240, toX: -0.6, toZ: 0.8,
    zones: [{ line: RIO_SERENO, r: 400, shelter: 0.85, gust: 0.4, top: 80 }],
  },
};

/* 0 to 1, a cubic: smoothstep without pow. */
function smooth(e0, e1, x) {
  if (!(x > e0)) {
    return 0;
  }
  if (!(x < e1)) {
    return 1;
  }
  const u = (x - e0) / (e1 - e0);
  return u * u * (3 - 2 * u);
}

/* An unsigned 32 bit hash to [-1, 1). Math.imul is exact integer maths. */
function hashUnit(seed, salt) {
  let h = (seed ^ Math.imul(salt, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 2147483648 - 1;
}

function layerMul(layers, h) {
  if (!(h > layers[0][0])) {
    return layers[0][1];
  }
  for (let i = 1; i < layers.length; i += 1) {
    const [h1, m1] = layers[i];
    if (h < h1) {
      const [h0, m0] = layers[i - 1];
      return m0 + (m1 - m0) * (h - h0) / (h1 - h0);
    }
  }
  return layers[layers.length - 1][1];
}

/* The squared distance from (x, z) to the nearest point of a polyline. */
function lineDist2(line, x, z) {
  let best = Infinity;
  for (let i = 1; i < line.length; i += 1) {
    const d = segDist2(line[i - 1], line[i], x, z);
    best = d < best ? d : best;
  }
  return best;
}

/* The squared distance from (x, z) to the segment a b. */
function segDist2(a, b, x, z) {
  const ex = b[0] - a[0];
  const ez = b[1] - a[1];
  const len2 = ex * ex + ez * ez;
  let u = len2 > 0 ? ((x - a[0]) * ex + (z - a[1]) * ez) / len2 : 0;
  u = u < 0 ? 0 : (u > 1 ? 1 : u);
  const dx = x - a[0] - u * ex;
  const dz = z - a[1] - u * ez;
  return dx * dx + dz * dz;
}

/*
 * The air for one room: null for calm (the shell then sets still air once,
 * and the plant is exactly what it was before weather existed), else
 * { at(x, y, z, t, out) } writing out.x, out.z (the mean, m/s, toward),
 * out.gust (RMS, m/s), within the ABI's limits, and out.wet, how hard it
 * rains, 0 to 1, which only the picture reads. Throws on an unknown map or
 * preset: a room naming one is a bug to see, not still air to fly in.
 */
export function makeWeather(mapId, presetId, seed) {
  if (!Object.hasOwn(PRESETS, presetId)) {
    throw new Error(`weather: unknown preset ${presetId}`);
  }
  const map = MAPS[mapId];
  if (!map) {
    throw new Error(`weather: unknown map ${mapId}`);
  }
  const p = PRESETS[presetId];
  if (!p) {
    return null;
  }
  const s = seed >>> 0;
  const turn = SEED_TURN * hashUnit(s, 1);
  let dx = map.toX - map.toZ * turn;
  let dz = map.toZ + map.toX * turn;
  const n = Math.sqrt(dx * dx + dz * dz);
  dx /= n;
  dz /= n;
  const f = p.front;
  const phase = f ? f.every * 0.5 * (hashUnit(s, 2) + 1) : 0;
  return {
    at(x, y, z, t, out) {
      const above = y - map.base;
      let mean = p.speed * layerMul(p.layers, above);
      let gust = p.gust;
      let wet = 0;
      for (const zone of map.zones) {
        const k = (1 - smooth(0, zone.r * zone.r, lineDist2(zone.line, x, z)))
          * (1 - smooth(zone.top, 2 * zone.top, above));
        mean *= 1 + (zone.shelter - 1) * k;
        gust += zone.gust * k;
      }
      if (f) {
        const along = x * dx + z * dz - f.speed * t + phase;
        const u = along - f.every * Math.floor(along / f.every) - 0.5 * f.every;
        const k = 1 - smooth(0, 0.5 * f.width, u < 0 ? -u : u);
        mean *= 1 + (f.boost - 1) * k;
        gust += f.gust * k;
        wet = f.rain * k;
      }
      mean = mean < WIND_MAX ? mean : WIND_MAX;
      out.x = dx * mean;
      out.z = dz * mean;
      out.gust = gust < GUST_FLOOR ? GUST_FLOOR : (gust > GUST_MAX ? GUST_MAX : gust);
      out.wet = wet;
      return out;
    },
  };
}
