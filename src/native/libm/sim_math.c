/*
 * sim_math.c: deterministic small-angle trig for the integrator.
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

#include "sim_math.h"

double sim_sin_small(double x) {
  const double x2 = x * x;
  /* x - x^3/6 + x^5/120 - x^7/5040 */
  return x * (1.0 + x2 * (-1.0 / 6.0 + x2 * (1.0 / 120.0 + x2 * (-1.0 / 5040.0))));
}

double sim_cos_small(double x) {
  const double x2 = x * x;
  /* 1 - x^2/2 + x^4/24 - x^6/720 */
  return 1.0 + x2 * (-0.5 + x2 * (1.0 / 24.0 + x2 * (-1.0 / 720.0)));
}

static const double SIM_PI = 3.14159265358979323846;
static const double SIM_PI_2 = 1.57079632679489661923;

static double atan_series(double x) {
  /* |x| <= 0.21: odd Taylor series to x^15, Horner form, fixed order. */
  const double x2 = x * x;
  double p = -1.0 / 15.0;
  p = p * x2 + 1.0 / 13.0;
  p = p * x2 - 1.0 / 11.0;
  p = p * x2 + 1.0 / 9.0;
  p = p * x2 - 1.0 / 7.0;
  p = p * x2 + 1.0 / 5.0;
  p = p * x2 - 1.0 / 3.0;
  p = p * x2 + 1.0;
  return p * x;
}

double sim_atan(double x) {
  const double ax = sim_fabs(x);
  double t;
  double r;
  if (ax > 1.0) {
    t = 1.0 / ax;
  } else {
    t = ax;
  }
  /* Two halvings: t <= 1 becomes t <= 0.4143 becomes t <= 0.2071. */
  t = t / (1.0 + sim_sqrt(1.0 + t * t));
  t = t / (1.0 + sim_sqrt(1.0 + t * t));
  r = 4.0 * atan_series(t);
  if (ax > 1.0) {
    r = SIM_PI_2 - r;
  }
  return x < 0.0 ? -r : r;
}

double sim_atan2(double y, double x) {
  if (x > 0.0) {
    return sim_atan(y / x);
  }
  if (x < 0.0) {
    if (y >= 0.0) {
      return sim_atan(y / x) + SIM_PI;
    }
    return sim_atan(y / x) - SIM_PI;
  }
  /* x == 0 */
  if (y > 0.0) {
    return SIM_PI_2;
  }
  if (y < 0.0) {
    return -SIM_PI_2;
  }
  return 0.0;
}
