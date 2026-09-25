/*
 * stab-glide-derive.js: each fixed wing's power off glide attitude and its
 * cruise throttle, the two numbers Stabilised's low throttle pitch down
 * (src/native/plant_wing.c, stab_pitch_down and stab_trim_throttle) is
 * built from, the way ArduPilot's STAB_PITCH_DOWN and TRIM_THROTTLE are.
 *
 * It reads every aircraft's own table, FixedWingParams in plant_wing.c and
 * the mass, gravity and air density in plant.c, and solves two steady
 * states with the elevator neutral, the flaps up and no pitch rate, on the
 * plant's own lift curve, stall blend and stall arms included:
 *
 *   the glide: the throttle closed, so no thrust (every aircraft's idle or
 *   duty_min pitch speed is under its glide, which is checked), the
 *   pitching moment zero; the aero force then carries the weight, and the
 *   body's pitch is the zero lift line's alpha, less its angle under the
 *   body axis, less the glide path's.
 *
 *   the cruise: the throttle stick at which that same neutral elevator
 *   flies level, the thrust line's moment on the trim included. That is
 *   ArduPilot's TRIM_THROTTLE, "the throttle percentage that maintains"
 *   the cruise.
 *
 * stab_pitch_down is then stab_trim_pitch less the glide's pitch: closed,
 * Stabilised asks for the attitude the airframe glides at by itself. With
 * --check it compares the tables with what it derives and fails on a
 * difference past the tables' rounding. Harness arithmetic in JS maths,
 * which is allowed here because nothing it prints is hashed. Run with
 * npm run stab:glide.
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

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DEG = 180 / Math.PI;
const WING_PI = Math.PI;

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/* Every `.name = value` of one initializer whose value is a number or an
 * expression of numbers and WING_PI. Fields left out of a C initializer
 * are zero, and so they read here. */
function fields(body) {
  const out = {};
  for (const m of body.matchAll(/\.(\w+)\s*=\s*([^,{}]+),/g)) {
    const expr = m[2].trim();
    if (!/^[-+*/().\s\dWING_PIe]+$/.test(expr)) continue;
    out[m[1]] = Function('WING_PI', `return (${expr});`)(WING_PI);
  }
  return new Proxy(out, { get: (o, k) => (k in o ? o[k] : 0) });
}

async function tables() {
  const wing = stripComments(await readFile(join(root, 'src/native/plant_wing.c'), 'utf8'));
  const plant = stripComments(await readFile(join(root, 'src/native/plant.c'), 'utf8'));
  const planes = [];
  for (const m of wing.matchAll(/const FixedWingParams (FW_\w+) = \{([\s\S]*?)\n\};/g)) {
    const at = plant.indexOf(`.fw = &${m[1]},`);
    if (at < 0) throw new Error(`${m[1]}: no airframe in plant.c points at it`);
    /* The airframe's own initializer: from the last one closed before it. */
    const start = plant.lastIndexOf('\n},', at);
    const own = fields(plant.slice(start, at));
    for (const k of ['mass_kg', 'gravity', 'rho']) {
      if (!(own[k] > 0)) throw new Error(`${m[1]}: its airframe has no ${k}`);
    }
    planes.push({ name: m[1], fw: fields(m[2]), m: own.mass_kg, g: own.gravity, rho: own.rho });
  }
  return planes;
}

const smoothstep = (a, b, x) => {
  if (x <= a) return 0;
  if (x >= b) return 1;
  const t = (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

/* The plant's coefficients at alpha of the zero lift line, the elevator
 * and flaps neutral, the slats as fitted by default. */
function coeffs(fw, alpha) {
  const clmax = fw.cl_max + fw.slat_dclmax;
  const aStall = clmax / fw.cl_alpha;
  const sigma = smoothstep(aStall - fw.stall_blend, aStall + fw.stall_blend, Math.abs(alpha));
  const clLin = fw.cl_alpha * alpha;
  const clFlat = 2 * Math.sin(alpha) * Math.cos(alpha);
  const cd0 = fw.cd0 + fw.slat_cd0;
  return {
    CL: (1 - sigma) * clLin + sigma * clFlat,
    CD: (1 - sigma) * (cd0 + fw.k_induced * clLin * clLin) + sigma * (cd0 + 2 * Math.sin(alpha) ** 2),
    Cm: fw.cm_0 + fw.cm_alpha * alpha - sigma * (fw.stall_arm_ac * clLin + fw.stall_arm_cp * clFlat),
    aStall,
  };
}

/* The alpha where the pitching moment is cm, on the unstalled branch. */
function trimAlpha(fw, cm) {
  let lo = -0.2, hi = coeffs(fw, 0).aStall;
  if (coeffs(fw, lo).Cm - cm < 0 || coeffs(fw, hi).Cm - cm > 0) return null;
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    if (coeffs(fw, mid).Cm - cm > 0) lo = mid; else hi = mid;
  }
  return lo;
}

/* plant_wing.c's motor: the stick to thrust along body x at forward speed u. */
function thrust(fw, stick, u) {
  if (fw.fold_duty > 0 && stick < fw.fold_duty) return 0;
  let duty = fw.throttle_idle > 0 ? fw.throttle_idle + (1 - fw.throttle_idle) * stick : stick;
  duty = Math.min(1, Math.max(fw.duty_min, duty));
  const t = fw.thrust_static * duty * duty * (1 - Math.max(0, u) / (fw.pitch_speed * duty));
  return fw.fold_duty === 0 && t < 0 ? 0 : t;
}

function glide(p) {
  const { fw } = p;
  const W = p.m * p.g;
  const alpha = trimAlpha(fw, 0);
  if (alpha === null) return null;
  const { CL, CD } = coeffs(fw, alpha);
  const gamma = Math.atan2(CD, CL);
  const V = Math.sqrt(2 * W / (p.rho * fw.area * Math.hypot(CL, CD)));
  const alphaBody = alpha + fw.alpha_zl;
  return {
    alpha, CL, CD, V, gamma,
    sink: V * Math.sin(gamma),
    pitch: alphaBody - gamma,
    idleThrust: thrust(fw, 0, V * Math.cos(alphaBody)),
  };
}

/* Level with the elevator neutral at V: the moment, the thrust line's
 * included, sets alpha; the drag sets the thrust; the stick gives it.
 * Returns the lift left over against the weight, and the stick. */
function levelAt(p, V) {
  const { fw } = p;
  const W = p.m * p.g;
  const q = 0.5 * p.rho * V * V;
  let T = 0, alpha = 0, stick = 0;
  for (let it = 0; it < 60; it += 1) {
    alpha = trimAlpha(fw, fw.thrust_z * T / (q * fw.area * fw.chord));
    if (alpha === null) return null;
    const ab = alpha + fw.alpha_zl;
    const { CD } = coeffs(fw, alpha);
    T = q * fw.area * CD / Math.cos(ab);
    const u = V * Math.cos(ab);
    if (thrust(fw, 1, u) < T) return null;
    let lo = 0, hi = 1;
    for (let i = 0; i < 60; i += 1) {
      const mid = (lo + hi) / 2;
      if (thrust(fw, mid, u) < T) lo = mid; else hi = mid;
    }
    stick = hi;
  }
  const { CL } = coeffs(fw, alpha);
  return { excess: q * fw.area * CL + T * Math.sin(alpha + fw.alpha_zl) - W, stick, alpha };
}

function cruise(p) {
  let lo = 2, hi = 60;
  const ok = (V) => levelAt(p, V);
  if (!ok(lo) || !ok(hi) || ok(lo).excess > 0 || ok(hi).excess < 0) {
    /* Walk in from the ends to where a level solution exists. */
    for (lo = 2; lo < 60 && !(ok(lo) && ok(lo).excess < 0); lo += 0.05);
    for (hi = lo; hi < 60 && ok(hi) && ok(hi).excess < 0; hi += 0.05);
    if (!ok(hi) || ok(hi).excess < 0) return null;
  }
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (ok(mid).excess < 0) lo = mid; else hi = mid;
  }
  return { V: hi, ...ok(hi) };
}

/* Every airframe's glide, cruise and pitch down, for the gates. */
export async function deriveAll() {
  return (await tables()).map((p) => {
    const gl = glide(p);
    return {
      name: p.name, fw: p.fw, glide: gl, cruise: cruise(p),
      alphaStall: coeffs(p.fw, 0).aStall,
      /* ArduPilot's range is 0 to 15 deg: a pitch down. An airframe whose
       * glide is nose higher than its trim pitch already asks for less
       * than its glide with the throttle closed, and gets nothing. */
      down: gl ? Math.max(0, p.fw.stab_trim_pitch - gl.pitch) : null,
    };
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes('--check');
  let bad = 0;
  const f = (x, n = 2) => (x === null || x === undefined ? 'none' : Number(x).toFixed(n));
  console.log('stab glide: the power off glide and the cruise throttle, elevator neutral, from each table');
  console.log(`${'airframe'.padEnd(20)} ${'glide alpha CL V sink pitch'.padEnd(34)} ${'cruise V stick'.padEnd(16)} trim  down  table down, stick`);
  for (const { name, fw, glide: gl, cruise: cr, down } of await deriveAll()) {
    if (!gl || !cr) {
      console.log(`${name.padEnd(20)} no ${gl ? 'level cruise' : 'glide trim'} on the unstalled branch`);
      bad += 1;
      continue;
    }
    if (gl.idleThrust !== 0) {
      console.log(`${name.padEnd(20)} the closed throttle still pulls ${f(gl.idleThrust, 3)} N in the glide`);
      bad += 1;
    }
    /* The tables carry a hundredth of a degree and a thousandth of the stick. */
    const off = Math.abs(fw.stab_pitch_down - down) * DEG > 0.0051 || Math.abs(fw.stab_trim_throttle - cr.stick) > 0.00051;
    console.log(`${name.padEnd(20)} ${`${f(gl.alpha * DEG, 2)} ${f(gl.CL, 3)} ${f(gl.V)} ${f(gl.sink, 3)} ${f(gl.pitch * DEG)}`.padEnd(34)} ${`${f(cr.V)} ${f(cr.stick, 3)}`.padEnd(16)} ${f(fw.stab_trim_pitch * DEG, 1).padStart(4)}  ${f(down * DEG).padStart(5)}  ${f(fw.stab_pitch_down * DEG)}, ${f(fw.stab_trim_throttle, 3)}${check && off ? '  DIFFERS' : ''}`);
    if (check && off) bad += 1;
  }
  if (bad) {
    console.log(`${bad} airframe(s) ${check ? 'differ from their tables or ' : ''}could not be derived`);
    process.exit(1);
  }
}
