/*
 * sim_math.h: deterministic maths for the physics path.
 *
 * CLAUDE.md requires a fixed maths implementation compiled into the WASM
 * module: no JS Math and no libc libm anywhere near the trajectory. These
 * helpers use only IEEE 754 basic operations (add, subtract, multiply,
 * divide) and the wasm f64.sqrt instruction, all of which are specified to
 * bit precision, so the same inputs produce the same bits on every engine
 * and every host.
 *
 * The trig here is intentionally small-angle only. The integrator rotates
 * the attitude quaternion by |omega| * dt per 1 ms step, which stays far
 * inside the polynomial's accurate range. Guard checks enforce that.
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

#ifndef SIM_MATH_H
#define SIM_MATH_H

/* f64.sqrt is a single deterministic wasm instruction. */
static inline double sim_sqrt(double x) { return __builtin_sqrt(x); }

static inline double sim_fabs(double x) { return x < 0.0 ? -x : x; }

/*
 * sin and cos for |x| <= 0.5 rad by Taylor series. At 0.5 rad the
 * truncation error is below 3e-10 for sin (x^9 term) and 2e-8 for cos
 * (x^8 term), far smaller than anything the plant resolves, and every
 * term is an exact IEEE operation. The integrator asserts its half-angle
 * stays under this bound.
 */
double sim_sin_small(double x);
double sim_cos_small(double x);

/*
 * atan and atan2 for the wing's angle of attack and sideslip. atan by
 * argument halving, atan(x) = 2 atan(x / (1 + sqrt(1 + x^2))), applied
 * twice so |x| <= 1 lands under 0.21, then the odd Taylor series to x^15
 * whose truncation error is under 1e-13 there. Every step is an exact
 * IEEE operation or f64.sqrt, so the result is the same on every host.
 * |x| > 1 goes through pi/2 - atan(1/x). atan2 fixes the quadrant the
 * way the C library does, zeros and signed zeros included.
 */
double sim_atan(double x);
double sim_atan2(double y, double x);

/*
 * sin and cos at any angle up to 1e6 rad, for the wave field, whose phase
 * is a wavenumber times a distance less a frequency times the sim clock.
 * The angle is brought to within pi/4 of a multiple of pi/2 by Cody and
 * Waite's reduction, pi/2 held as a 33 bit head and a tail so the head
 * times the multiple is exact for every multiple under 2^20, and then the
 * odd and even Taylor series to x^17 and x^18, whose truncation is under
 * 1e-17 at pi/4. The multiple is rounded by a truncating cast of x times
 * 2/pi plus or minus a half, one wasm instruction. Every step is an exact
 * IEEE operation, so the result is the same on every host, and a JS
 * mirror doing the same operations in the same order is bit identical
 * (src/game/waves.js). Past 1e6 rad the reduction loses digits it cannot
 * afford and the answer is 0, which the wave field never asks for: its
 * phases stay under 1e6 for more than a day of sim clock.
 */
double sim_sin(double x);
double sim_cos(double x);

#endif /* SIM_MATH_H */
