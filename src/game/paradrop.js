/*
 * paradrop.js: a load dropped off the Hercules' ramp under a round cargo
 * canopy, from the drop's record to where it lies (docs/HERCULES-CONTRACT.md).
 *
 * A pure function of the record and the world: the same record falls the
 * same way on every machine, so every pilot in a room draws the same fall.
 * Only + - * /, comparisons, Math.floor and Math.sqrt (correctly rounded
 * by IEEE 754) are used, never Math.sin, cos or pow, as src/game/weather.js;
 * the gusts' cosines are dcos below, a fixed polynomial.
 *
 * World frame (Three.js): x and z horizontal, y up, metres, seconds.
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

/*
 * THE LOAD AND ITS CANOPY. A scale A-22 cargo bag, the full size's 48 in
 * at 1:13.13, 93 mm a side, 250 g with its packed canopy (ESTIMATED: balsa
 * and foam ballasted to fall true): 311 kg/m^3, under water's, so it
 * floats. Its box falls at Hoerner's C_D 1.05 for a cube face on. The
 * canopy is an 18 in (0.457 m) flat circular one: Knacke, Parachute
 * Recovery Systems Design Manual (NWC TP 6575), table 5-1, C_D0 0.75 to
 * 0.80 on the nominal area, 0.78 taken. A 0.6 m static line pulls it as
 * the load falls clear of the ramp, and it fills in n D0 / v, Knacke's
 * fill constant n about 8 for a solid flat canopy, its drag area growing
 * as the filled diameter's square. At sea level it comes down at
 * sqrt(2 m g / (rho (C_D S0 + the box's))), 5.40 m/s.
 */
export const LOAD = {
  mass: 0.25,
  side: 0.093,
  cdBox: 1.05,
  canopyD: 0.4572,
  canopyCd: 0.78,
  staticLine: 0.6,
  fillN: 8,
  density: 0.25 / (0.093 * 0.093 * 0.093),
};
const RHO = 1.225;
const G = 9.81;
const PI = 3.14159265358979323846;
const CDA_BOX = LOAD.cdBox * LOAD.side * LOAD.side;
const CDA_CANOPY = LOAD.canopyCd * PI * LOAD.canopyD * LOAD.canopyD / 4;
/* The step: 100 Hz, fine against the canopy's 0.08 s fill time constant
 * at 5.6 m/s and the box's few seconds. */
export const DROP_DT = 0.01;
/* A fall is given up past ten minutes: a load in a thermal's core could
 * otherwise rise for good. It is then laid where it is over the ground. */
const MAX_S = 600;
/* Every this many steps the path keeps a sample for the renderer. */
export const SAMPLE_EVERY = 5;

/* The descent rate a full canopy settles at in still sea level air. */
export const DESCENT_RATE = Math.sqrt(2 * LOAD.mass * G / (RHO * (CDA_CANOPY + CDA_BOX)));

/*
 * A cosine from + - * / and Math.floor: the argument folded into
 * [-pi/2, pi/2] about a multiple of pi, then the Taylor series to x^22,
 * whose last term is under 1e-17 there; the fold's own rounding grows
 * with the argument, 1e-15 of it. Not the libm's last bit, but the
 * same bits on every engine, which is what a shared fall needs.
 */
export function dcos(x) {
  const k = Math.floor(x / PI + 0.5);
  const r = x - k * PI;
  const r2 = r * r;
  let term = 1;
  let sum = 1;
  for (let n = 1; n <= 11; n += 1) {
    term = -term * r2 / ((2 * n - 1) * (2 * n));
    sum += term;
  }
  return k - 2 * Math.floor(k / 2) === 0 ? sum : -sum;
}

/*
 * THE GUSTS, the plant's own (src/native/plant_wing.c, plant_wind): seven
 * cosines a horizontal axis, a Dryden spectrum's shares at a 4 s time
 * scale, on the dropper's plant clock, at the RMS the weather gives where
 * the load is. Here on the world's x and z, where the plant has them on
 * its spawn's axes: the same air, statistically and in time.
 */
const GUST_W = [0.20944, 0.349066, 0.571199, 0.966644, 1.570796, 2.617994, 4.18879];
const GUST_A = [0.7228, 0.7088, 0.6243, 0.5072, 0.4059, 0.3169, 0.2512];
const GUST_PX = [0.8608, 4.744, 2.3441, 6.2273, 3.8273, 1.4274, 5.3106];
const GUST_PZ = [2.9106, 0.5106, 4.3939, 1.9939, 5.8771, 3.4772, 1.0772];

function gustAt(t, rms, out) {
  let gx = 0;
  let gz = 0;
  for (let k = 0; k < 7; k += 1) {
    gx += GUST_A[k] * dcos(GUST_W[k] * t + GUST_PX[k]);
    gz += GUST_A[k] * dcos(GUST_W[k] * t + GUST_PZ[k]);
  }
  out.gx = rms * gx;
  out.gz = rms * gz;
}

/*
 * The fall. record: { t, tp, p: [x, y, z], v: [vx, vy, vz] } (the weather
 * clock and the plant clock at release, s; the world position and
 * velocity). world: { weather, surface(x, z) } where weather is
 * makeWeather's (or null for still air) and surface is the height the
 * load stops at, { y, wet }: the ground, or the water over it. Returns
 * { path: Float64Array of [tau, x, y, z, fill] every SAMPLE_EVERY steps,
 * rest: [x, y, z], wet, landS, openS, windAtRest: [x, z] }.
 */
export function fall(record, world) {
  const air = { x: 0, z: 0, gust: 0, up: 0 };
  const gust = { gx: 0, gz: 0 };
  let x = record.p[0];
  let y = record.p[1];
  let z = record.p[2];
  let vx = record.v[0];
  let vy = record.v[1];
  let vz = record.v[2];
  const x0 = x;
  const y0 = y;
  const z0 = z;
  let openS = -1;
  let fillS = 0;
  const samples = [];
  const steps = Math.floor(MAX_S / DROP_DT);
  let landed = null;
  for (let i = 0; i <= steps; i += 1) {
    const tau = i * DROP_DT;
    if (world.weather) {
      world.weather.at(x, y, z, record.t + tau, air);
      gustAt(record.tp + tau, air.gust, gust);
    }
    const wx = world.weather ? air.x + gust.gx : 0;
    const wy = world.weather ? air.up : 0;
    const wz = world.weather ? air.z + gust.gz : 0;
    const rx = vx - wx;
    const ry = vy - wy;
    const rz = vz - wz;
    const speed = Math.sqrt(rx * rx + ry * ry + rz * rz);
    /* The static line: taut once the load is its length from the ramp's
     * lip, which flies on at the release's velocity; then the canopy fills
     * in n D0 over the speed it met it at. */
    if (openS < 0) {
      const dx = x - (x0 + record.v[0] * tau);
      const dy = y - (y0 + record.v[1] * tau);
      const dz = z - (z0 + record.v[2] * tau);
      if (dx * dx + dy * dy + dz * dz >= LOAD.staticLine * LOAD.staticLine) {
        openS = tau;
        fillS = LOAD.fillN * LOAD.canopyD / (speed > 1 ? speed : 1);
      }
    }
    let fill = 0;
    if (openS >= 0) {
      const u = (tau - openS) / fillS;
      fill = u < 1 ? u * u : 1;
    }
    if (i % SAMPLE_EVERY === 0) {
      samples.push(tau, x, y, z, fill);
    }
    const here = world.surface(x, z);
    if (y <= here.y && i > 0) {
      landed = { y: here.y, wet: here.wet, tau, wind: [wx, wz] };
      break;
    }
    const k = 0.5 * RHO * (CDA_BOX + fill * CDA_CANOPY) * speed / LOAD.mass;
    vx += -k * rx * DROP_DT;
    vy += (-G - k * ry) * DROP_DT;
    vz += -k * rz * DROP_DT;
    x += vx * DROP_DT;
    y += vy * DROP_DT;
    z += vz * DROP_DT;
  }
  if (!landed) {
    const here = world.surface(x, z);
    landed = { y: here.y, wet: here.wet, tau: steps * DROP_DT, wind: [0, 0] };
  }
  samples.push(landed.tau, x, landed.y, z, 1);
  return {
    path: Float64Array.from(samples),
    rest: [x, landed.y, z],
    wet: landed.wet,
    landS: landed.tau,
    openS,
    windAtRest: landed.wind,
  };
}

/* Where the load is tau seconds after release, along a fall's samples:
 * [x, y, z, fill], linear between them, at rest past the landing. */
export function pathAt(f, tau, out) {
  const p = f.path;
  const n = p.length / 5;
  if (tau >= p[(n - 1) * 5]) {
    out[0] = p[(n - 1) * 5 + 1];
    out[1] = p[(n - 1) * 5 + 2];
    out[2] = p[(n - 1) * 5 + 3];
    out[3] = 1;
    return out;
  }
  const step = DROP_DT * SAMPLE_EVERY;
  let i = Math.floor((tau > 0 ? tau : 0) / step);
  if (i > n - 2) {
    i = n - 2;
  }
  const a = i * 5;
  const b = a + 5;
  const span = p[b] - p[a];
  const u = span > 0 ? ((tau > 0 ? tau : 0) - p[a]) / span : 0;
  for (let k = 1; k < 5; k += 1) {
    out[k - 1] = p[a + k] + (p[b + k] - p[a + k]) * u;
  }
  return out;
}

/* The caps (docs/HERCULES-CONTRACT.md): a room keeps this many, a solo
 * session this many; at the cap P refuses, and nothing is ever taken
 * away. */
export const ROOM_CAP = 300;
export const SOLO_CAP = 200;
