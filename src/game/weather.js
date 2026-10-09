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
/* sim_set_air_vertical's limit, m/s either way. */
export const UP_MAX = 10;
/* A non calm air never reaches exactly zero: SIM_WIND_ON going off mid
 * flight would switch a wing's ground contact model under it. */
const GUST_FLOOR = 0.01;
/* How far a seed turns the prevailing direction: tan of about 25 degrees. */
const SEED_TURN = 0.45;

/* speed m/s at the map's base height; layers [height above base m, mean
 * multiplier], piecewise linear, flat past the ends; gust RMS m/s. */
const LAYERS = [[0, 0.6], [10, 1], [60, 1.35], [200, 1.7]];
/*
 * Thermals, docs/WEATHER-CONTRACT.md: a core's rise, m/s. Fair weather
 * cumulus thermals rise 1 to 3 m/s in their cores, are 100 to 300 m
 * across, stand about the boundary layer's depth apart (1 to 2 km) and
 * live 10 to 20 minutes (Stull, An Introduction to Boundary Layer
 * Meteorology, 11.1; FAA Glider Flying Handbook, chapter 9). A strong wind
 * shears them apart, and an overcast front has none.
 */
export const PRESETS = {
  calm: null,
  breeze: { speed: 3, layers: LAYERS, gust: 0.6, front: null, thermal: 2.2 },
  gusty: { speed: 6, layers: LAYERS, gust: 2, front: null, thermal: 1.2 },
  front: {
    speed: 5, layers: LAYERS, gust: 1.2, thermal: 0,
    front: { every: 2400, width: 300, speed: 8, boost: 2.2, gust: 3 },
  },
};
/* One thermal at most in each square this wide, m, and the chance that it
 * has one; a core's radius, m; a cycle from first rise to gone, s; the
 * heights above the base it rises between, m: it forms off the ground and
 * fades under the cloud base. */
const THERMAL_CELL = 1200;
const THERMAL_ODDS = 0.6;
const THERMAL_R = 90;
const THERMAL_LIFE = 900;
const THERMAL_FROM = [5, 40];
const THERMAL_TO = [700, 1000];
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
  { line: [[0, -4500], [0, 4500]], r: 700, shelter: 0.65, gust: 0.3, top: 300, lift: 0 },
  { line: [[-1700, -4500], [-1700, 4500]], r: 600, shelter: 1, gust: 2, top: 1500, lift: 0.65 },
  { line: [[1700, -4500], [1700, 4500]], r: 600, shelter: 1, gust: 2, top: 1500, lift: 0.65 },
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
    zones: [{ line: [[-352.9, -1826.5], [636.7, -1610.5]], r: 260, shelter: 0.8, gust: 2.5, top: 60, lift: 0.6 }],
  },
  swiss2: { base: 0, toX: 0, toZ: -1, zones: VALLEY },
  alps: { base: 0, toX: 0, toZ: -1, zones: VALLEY },
  interior: {
    base: 240, toX: -0.6, toZ: 0.8,
    zones: [{ line: RIO_SERENO, r: 400, shelter: 0.85, gust: 0.4, top: 80, lift: 0 }],
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
    if (d < best) {
      best = d;
      NEAR.seg = i;
    }
  }
  return best;
}
/* Which segment lineDist2 found nearest, for the lift's side and face. */
const NEAR = { seg: 1 };

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
 * The share of the wind across a line's segment k, signed: + on the side
 * the wind comes from (the air there meets the face and rises), - in its
 * lee. (dx, dz) is the unit direction the wind blows toward.
 */
function faceRate(line, k, x, z, dx, dz) {
  const a = line[k - 1];
  const b = line[k];
  const ex = b[0] - a[0];
  const ez = b[1] - a[1];
  const n = Math.sqrt(ex * ex + ez * ez);
  /* The face's normal and the wind's component along it: 0 for a wind
   * along the ridge, 1 straight across it. */
  const nx = -ez / n;
  const nz = ex / n;
  const across = dx * nx + dz * nz;
  const side = (x - a[0]) * nx + (z - a[1]) * nz;
  const windward = side * across < 0;
  const m = across < 0 ? -across : across;
  return windward ? m : -m;
}

/*
 * The thermals' rise at (x, z) in the frame drifting with the wind, as a
 * share of a strong core's (1 at its axis), at height `above` the base and
 * sim time t: the nine squares round the point, each with a thermal or not
 * by the seed, a core of THERMAL_R with a weak sink round it out to twice
 * that (the air a thermal lifts comes down beside it), each waxing and
 * waning over THERMAL_LIFE from a phase of its own. Integer hashing and + -
 * * / only.
 */
function thermalAt(seed, x, z, t, above) {
  const h = smooth(THERMAL_FROM[0], THERMAL_FROM[1], above) * (1 - smooth(THERMAL_TO[0], THERMAL_TO[1], above));
  if (!(h > 0)) {
    return 0;
  }
  const ci = Math.floor(x / THERMAL_CELL);
  const cj = Math.floor(z / THERMAL_CELL);
  let w = 0;
  for (let i = ci - 1; i <= ci + 1; i += 1) {
    for (let j = cj - 1; j <= cj + 1; j += 1) {
      const key = (Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) >>> 0;
      if (0.5 * (hashUnit(seed ^ key, 3) + 1) > THERMAL_ODDS) {
        continue;
      }
      const tx = (i + 0.2 + 0.3 * (hashUnit(seed ^ key, 4) + 1)) * THERMAL_CELL;
      const tz = (j + 0.2 + 0.3 * (hashUnit(seed ^ key, 5) + 1)) * THERMAL_CELL;
      const ex = x - tx;
      const ez = z - tz;
      const q = (ex * ex + ez * ez) / (THERMAL_R * THERMAL_R);
      if (q >= 4) {
        continue;
      }
      /* Its life: a triangle from 0 to 1 and back over THERMAL_LIFE. */
      const ph = t / THERMAL_LIFE + 0.5 * (hashUnit(seed ^ key, 6) + 1);
      const u = ph - Math.floor(ph);
      const life = u < 0.5 ? 2 * u : 2 - 2 * u;
      w += life * (q < 1 ? (1 - q) * (1 - q) : -0.15 * (1 - (q - 1) / 3));
    }
  }
  return w * h;
}

/*
 * The air for one room: null for calm (the shell then sets still air once,
 * and the plant is exactly what it was before weather existed), else
 * { at(x, y, z, t, out) } writing out.x, out.z (the mean, m/s, toward),
 * out.gust (RMS, m/s) and out.up (the air's vertical speed, m/s, up
 * positive: thermals and ridge lift and sink), within the ABI's limits. Throws on an unknown map or
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
  /* Thermals drift with the wind at its mean low down. */
  const driftX = dx * p.speed;
  const driftZ = dz * p.speed;
  const lift = new Float64Array(map.zones.length * 2);
  return {
    at(x, y, z, t, out) {
      const above = y - map.base;
      let mean = p.speed * layerMul(p.layers, above);
      let gust = p.gust;
      for (let i = 0; i < map.zones.length; i += 1) {
        const zone = map.zones[i];
        const k = (1 - smooth(0, zone.r * zone.r, lineDist2(zone.line, x, z)))
          * (1 - smooth(zone.top, 2 * zone.top, above));
        mean *= 1 + (zone.shelter - 1) * k;
        gust += zone.gust * k;
        lift[2 * i] = k;
        lift[2 * i + 1] = k > 0 && zone.lift ? faceRate(zone.line, NEAR.seg, x, z, dx, dz) : 0;
      }
      if (f) {
        const along = x * dx + z * dz - f.speed * t + phase;
        const u = along - f.every * Math.floor(along / f.every) - 0.5 * f.every;
        const k = 1 - smooth(0, 0.5 * f.width, u < 0 ? -u : u);
        mean *= 1 + (f.boost - 1) * k;
        gust += f.gust * k;
      }
      mean = mean < WIND_MAX ? mean : WIND_MAX;
      /* A face across the wind lifts the air on its windward side, about
       * the wind across it times the slope's sine (the glider handbook's
       * ridge lift), and lets it down in its lee, more weakly. */
      let up = 0;
      for (let i = 0; i < map.zones.length; i += 1) {
        const r = lift[2 * i + 1];
        up += map.zones[i].lift * lift[2 * i] * mean * (r > 0 ? r : 0.5 * r);
      }
      if (p.thermal > 0) {
        up += thermalAt(s, x - driftX * t, z - driftZ * t, t, above) * p.thermal;
      }
      out.up = up > UP_MAX ? UP_MAX : (up < -UP_MAX ? -UP_MAX : up);
      out.x = dx * mean;
      out.z = dz * mean;
      out.gust = gust < GUST_FLOOR ? GUST_FLOOR : (gust > GUST_MAX ? GUST_MAX : gust);
      return out;
    },
  };
}
