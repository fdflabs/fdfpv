/*
 * waves.js: the wave field of src/native/water.c, in JS, for the tests.
 *
 * THIS IS NOT THE PHYSICS. The plant samples the water in the module and
 * nothing in the flight path may call this: CLAUDE.md forbids JS maths
 * there. It exists so a test can hold the module's surface against an
 * independent copy of the same arithmetic, operation for operation, and
 * demand they agree to the bit, and so the renderer's port has a readable
 * reference that is known to be the module's. Every operation here is an
 * IEEE add, subtract, multiply, divide or square root, or an exact
 * truncation, in the order water.c and libm/sim_math.c do them, so the
 * doubles come out the same. The only way in is mirrorWaves('tests'),
 * which throws for anything else, so a shell cannot pick it up by
 * accident.
 *
 * THE GLSL PORT, which src/render/lakewaves.js is: upload the numbers
 * sim_water_components returns (per component a, kx, ky, omega, phase,
 * and the body's z0 and origin) as uniforms, in the plant's world frame,
 * which is the map's frame turned by the spawn yaw and moved to the
 * spawn: either convert them or convert the vertex. Then per vertex
 *   theta = kx (x - ox) + ky (y - oy) - omega t + phase
 *   z  = z0 + sum a cos theta
 *   n  = normalize(-dz/dx, -dz/dy, 1), dz/dx = -sum a kx sin theta
 * with t the sim's own clock, state[0], not the wall clock, so the water
 * the pilot sees is the water the floats feel. GLSL's sin and cos are
 * not bit exact, which does not matter for a picture.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

const G = 9.81;
const TWO_PI = 6.28318530717958647692;
const STEEP_MAX = 0.1;
const SEA_T = [1.2195, 1.0, 0.8475, 0.7143, 0.5952, 0.4878];
const SEA_COS = [0.9975640502598242, 0.9455185755993168, 0.8910065241883679, 0.754709580222772, 0.6156614753256583, 0.3907311284892737];
const SEA_SIN = [0.0697564737441253, -0.3255681544571567, 0.45399049973954675, -0.6560590289905073, 0.788010753606722, -0.9205048534524404];
const SEA_E = [0.1214, 0.4589, 0.1961, 0.1106, 0.0681, 0.0449];
const SEA_PHASE = [4.744, 2.3441, 6.2273, 3.8273, 1.4274, 5.3106];

const PIO2_HI = 1.57079632673412561417e+00;
const PIO2_LO = 6.07710050650619224932e-11;
const INV_PIO2 = 6.36619772367581382433e-01;
const TRIG_MAX = 1.0e6;

function sinPoly(r) {
  const r2 = r * r;
  let p = 1.0 / 355687428096000.0;
  p = p * r2 - 1.0 / 1307674368000.0;
  p = p * r2 + 1.0 / 6227020800.0;
  p = p * r2 - 1.0 / 39916800.0;
  p = p * r2 + 1.0 / 362880.0;
  p = p * r2 - 1.0 / 5040.0;
  p = p * r2 + 1.0 / 120.0;
  p = p * r2 - 1.0 / 6.0;
  return r + r * r2 * p;
}

function cosPoly(r) {
  const r2 = r * r;
  let p = 1.0 / 6402373705728000.0;
  p = p * r2 - 1.0 / 20922789888000.0;
  p = p * r2 + 1.0 / 87178291200.0;
  p = p * r2 - 1.0 / 479001600.0;
  p = p * r2 + 1.0 / 3628800.0;
  p = p * r2 - 1.0 / 40320.0;
  p = p * r2 + 1.0 / 720.0;
  p = p * r2 - 1.0 / 24.0;
  p = p * r2 + 0.5;
  return 1.0 - r2 * p;
}

/* [quadrant 0..3, remainder]: the C cast truncates toward zero, and so
 * does Math.trunc, exactly. */
function reduce(x) {
  const kd = x * INV_PIO2;
  const k = Math.trunc(kd >= 0.0 ? kd + 0.5 : kd - 0.5);
  const r = (x - k * PIO2_HI) - k * PIO2_LO;
  return [((k % 4) + 4) % 4, r];
}

function fabs(x) {
  return x < 0.0 ? -x : x;
}

function simSin(x) {
  if (!(fabs(x) <= TRIG_MAX)) return 0.0;
  const [q, r] = reduce(x);
  if (q === 0) return sinPoly(r);
  if (q === 1) return cosPoly(r);
  if (q === 2) return -sinPoly(r);
  return -cosPoly(r);
}

function simCos(x) {
  if (!(fabs(x) <= TRIG_MAX)) return 0.0;
  const [q, r] = reduce(x);
  if (q === 0) return cosPoly(r);
  if (q === 1) return -sinPoly(r);
  if (q === 2) return -cosPoly(r);
  return sinPoly(r);
}

function cbrt(x) {
  let y = x > 1.0 ? x : 1.0;
  for (let i = 0; i < 200; i += 1) {
    y = y - (y * y * y - x) / (3.0 * y * y);
  }
  return y;
}

function comp(a, T, dx, dy, ph) {
  const om = TWO_PI / T;
  const k = om * om / G;
  if (a * k > STEEP_MAX) a = STEEP_MAX / k;
  return { a, kx: k * dx, ky: k * dy, om, ph };
}

/* A body as water.c builds one: { z0, ox, oy, wind: { speed, dx, dy,
 * fetch }, swell: { height, period, dx, dy } }, either optional. */
function build(body) {
  const out = { z0: body.z0, ox: body.ox, oy: body.oy, hs: 0, tp: 0, comps: [] };
  const w = body.wind;
  if (w && w.speed > 0.0 && w.fetch > 0.0) {
    const U = w.speed;
    const U2 = U * U;
    const X = G * w.fetch / U2;
    let hs = 1.6e-3 * Math.sqrt(X) * U2 / G;
    let tp = 0.2857 * cbrt(X) * U / G;
    if (hs > 0.2433 * U2 / G) hs = 0.2433 * U2 / G;
    if (tp > 8.134 * U / G) tp = 8.134 * U / G;
    out.hs = hs;
    out.tp = tp;
    for (let i = 0; i < SEA_T.length; i += 1) {
      const a = Math.sqrt(2.0 * SEA_E[i]) * hs * 0.25;
      const dx = w.dx * SEA_COS[i] - w.dy * SEA_SIN[i];
      const dy = w.dx * SEA_SIN[i] + w.dy * SEA_COS[i];
      out.comps.push(comp(a, tp * SEA_T[i], dx, dy, SEA_PHASE[i]));
    }
  }
  const s = body.swell;
  if (s && s.height > 0.0 && s.period > 0.0) {
    out.comps.push(comp(0.5 * s.height, s.period, s.dx, s.dy, 0.0));
  }
  return out;
}

/* [z, dz/dx, dz/dy, u, v, w], water.c's water_sample. */
function sample(b, x, y, t) {
  let z = b.z0;
  let sx = 0.0;
  let sy = 0.0;
  let u = 0.0;
  let v = 0.0;
  let w = 0.0;
  const px = x - b.ox;
  const py = y - b.oy;
  for (const k of b.comps) {
    const th = k.kx * px + k.ky * py - k.om * t + k.ph;
    const cs = simCos(th);
    const sn = simSin(th);
    const kk = Math.sqrt(k.kx * k.kx + k.ky * k.ky);
    const aom = k.a * k.om;
    z += k.a * cs;
    sx -= k.a * k.kx * sn;
    sy -= k.a * k.ky * sn;
    u += aom * cs * k.kx / kk;
    v += aom * cs * k.ky / kk;
    w += aom * sn;
  }
  return [z, sx, sy, u, v, w];
}

export function mirrorWaves(flag) {
  if (flag !== 'tests') {
    throw new Error('waves.js is the tests\' mirror of the module\'s water, never the physics');
  }
  return { build, sample, sin: simSin, cos: simCos };
}
