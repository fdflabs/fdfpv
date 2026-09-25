/*
 * water.c: the water bodies the host declares and the waves on them.
 *
 * A water body is still water at a height, over a polygon in the plant's
 * world frame (or everywhere, with no polygon), and a wave field on it: a
 * sum of linear deep water waves, each a cosine travelling one way, which
 * is the textbook Airy wave and the whole of what a lake's surface does at
 * the size an aircraft on floats feels. docs/FLOATS-STAGE1.md derives it.
 *
 * The waves come from two things a host says about the water. WIND: a
 * speed, a direction and the fetch, the open water the wind has blown
 * over, from which the Shore Protection Manual's fetch limited growth
 * laws (1984, eqs. 3-33 and 3-34, the JONSWAP fits) give the significant
 * height and the peak period of the sea it raises, capped at the fully
 * developed sea. That sea is six components: four swells round the peak
 * and two short chop waves, spread in period and in direction about the
 * wind, with a fixed share of the sea's energy each. SWELL: one more
 * component, a height, a period and a direction, for waves that came from
 * somewhere else; a lake has none, and the gates use one because a single
 * period is what a rocking can be measured against.
 *
 * Nothing is random and nothing reads a clock: the components are fixed
 * when the host declares them and the surface is a function of (x, y, t),
 * t the sim's own clock. Zero wind and zero swell is flat water, which is
 * the default and every body's state until a host says otherwise. With no
 * body declared nothing here runs, so every trace from before water
 * existed is bit identical.
 *
 * THE RENDERER READS THE SAME FUNCTION. water_sample below is written so
 * it ports line for line to GLSL: the components are uniforms (a host
 * reads them back through sim_water_components), the phase is one dot
 * product, and the surface is a sum of a cos and the slope a sum of a sin.
 * src/game/waves.js is the same arithmetic in JS, for the tests only: it
 * must agree with this file bit for bit, and it never runs in the
 * physics path.
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

#include "sim_internal.h"
#include "libm/sim_math.h"

/* Gravity for the waves' dispersion, the SPM's g. Not the weight slider:
 * a pilot making the aircraft heavier does not change how water moves. */
#define WATER_G 9.81
#define WATER_TWO_PI 6.28318530717958647692
/* The steepest a component may be, a k: a height over its wavelength of
 * 0.032, a fifth of the 1/7 at which a deep water wave breaks. */
#define WATER_STEEP_MAX 0.1

/*
 * The wind sea's six components: period as a share of the peak period,
 * direction off the wind (cos, sin of 0, +20, -25, +40, -55 and +70 deg,
 * to 17 digits), share of the sea's energy (summing to one), and phase.
 * The periods and shares are a coarse sampling of a JONSWAP spectrum
 * about its peak, the directions its cos^2 spread; the phases are fixed
 * numbers with no common factor so the sea does not repeat inside a
 * minute. docs/FLOATS-STAGE1.md.
 */
static const double SEA_T[WATER_SEA] = { 1.00, 0.85, 0.72, 0.60, 0.45, 0.33 };
static const double SEA_COS[WATER_SEA] = {
  1.0, 0.93969262078590838, 0.90630778703664994,
  0.76604444311897801, 0.57357643635104609, 0.34202014332566871,
};
static const double SEA_SIN[WATER_SEA] = {
  0.0, 0.34202014332566871, -0.42261826174069944,
  0.64278760968653933, -0.81915204428899178, 0.93969262078590838,
};
static const double SEA_E[WATER_SEA] = { 0.34, 0.24, 0.17, 0.11, 0.08, 0.06 };
static const double SEA_PHASE[WATER_SEA] = { 0.0, 2.1, 4.3, 1.3, 5.5, 3.7 };

static WaterBody g_water[WATER_BODIES_MAX];
static int g_water_count = 0;

/* Cube root by Newton's method from a start above the root, a fixed count
 * of steps, so it is the same double on every host. Only for the peak
 * period's growth law, once per declaration. x > 0. */
static double water_cbrt(double x) {
  double y = x > 1.0 ? x : 1.0;
  for (int i = 0; i < 200; i += 1) {
    y = y - (y * y * y - x) / (3.0 * y * y);
  }
  return y;
}

/* A component of height a (amplitude, m), period T (s), travelling along
 * the unit (dx, dy), at phase ph. Deep water: omega^2 = g k. */
static void water_set_comp(WaterComp *c, double a, double T, double dx, double dy, double ph) {
  const double om = WATER_TWO_PI / T;
  const double k = om * om / WATER_G;
  if (a * k > WATER_STEEP_MAX) {
    a = WATER_STEEP_MAX / k;
  }
  c->a = a;
  c->kx = k * dx;
  c->ky = k * dy;
  c->om = om;
  c->ph = ph;
}

/* The components from the wind and the swell. Built once per declaration,
 * so the sampling below is a sum and nothing else. */
static void water_build(WaterBody *b) {
  b->ncomp = 0;
  const double U = b->wind;
  if (U > 0.0 && b->fetch > 0.0) {
    const double U2 = U * U;
    const double X = WATER_G * b->fetch / U2;
    double hs = 1.6e-3 * sim_sqrt(X) * U2 / WATER_G;
    double tp = 0.2857 * water_cbrt(X) * U / WATER_G;
    if (hs > 0.2433 * U2 / WATER_G) hs = 0.2433 * U2 / WATER_G;
    if (tp > 8.134 * U / WATER_G) tp = 8.134 * U / WATER_G;
    b->hs = hs;
    b->tp = tp;
    for (int i = 0; i < WATER_SEA; i += 1) {
      /* Energy share e of a sea whose variance is hs^2 / 16: a^2 / 2 = e hs^2 / 16. */
      const double a = sim_sqrt(2.0 * SEA_E[i]) * hs * 0.25;
      const double dx = b->wdx * SEA_COS[i] - b->wdy * SEA_SIN[i];
      const double dy = b->wdx * SEA_SIN[i] + b->wdy * SEA_COS[i];
      water_set_comp(&b->comp[b->ncomp], a, tp * SEA_T[i], dx, dy, SEA_PHASE[i]);
      b->ncomp += 1;
    }
  } else {
    b->hs = 0.0;
    b->tp = 0.0;
  }
  if (b->swell_h > 0.0 && b->swell_t > 0.0) {
    water_set_comp(&b->comp[b->ncomp], 0.5 * b->swell_h, b->swell_t, b->sdx, b->sdy, 0.0);
    b->ncomp += 1;
  }
}

void water_clear(void) {
  g_water_count = 0;
}

int water_count(void) {
  return g_water_count;
}

int water_add(double z0, double ox, double oy) {
  if (g_water_count >= WATER_BODIES_MAX) {
    return -1;
  }
  WaterBody *b = &g_water[g_water_count];
  b->z0 = z0;
  b->ox = ox;
  b->oy = oy;
  b->nvert = 0;
  b->wind = 0.0;
  b->wdx = 1.0;
  b->wdy = 0.0;
  b->fetch = 0.0;
  b->swell_h = 0.0;
  b->swell_t = 0.0;
  b->sdx = 1.0;
  b->sdy = 0.0;
  water_build(b);
  g_water_count += 1;
  return g_water_count - 1;
}

int water_vertex(int i, double x, double y) {
  if (i < 0 || i >= g_water_count || g_water[i].nvert >= WATER_VERTS_MAX) {
    return -1;
  }
  WaterBody *b = &g_water[i];
  b->vx[b->nvert] = x;
  b->vy[b->nvert] = y;
  if (b->nvert == 0) {
    b->xmin = x;
    b->xmax = x;
    b->ymin = y;
    b->ymax = y;
  } else {
    if (x < b->xmin) b->xmin = x;
    if (x > b->xmax) b->xmax = x;
    if (y < b->ymin) b->ymin = y;
    if (y > b->ymax) b->ymax = y;
  }
  b->nvert += 1;
  return 0;
}

int water_wind(int i, double speed, double dx, double dy, double fetch) {
  if (i < 0 || i >= g_water_count) {
    return -1;
  }
  WaterBody *b = &g_water[i];
  b->wind = speed;
  b->wdx = dx;
  b->wdy = dy;
  b->fetch = fetch;
  water_build(b);
  return 0;
}

int water_swell(int i, double height, double period, double dx, double dy) {
  if (i < 0 || i >= g_water_count) {
    return -1;
  }
  WaterBody *b = &g_water[i];
  b->swell_h = height;
  b->swell_t = period;
  b->sdx = dx;
  b->sdy = dy;
  water_build(b);
  return 0;
}

/* Which body the point is over, the first declared wins; -1 for none. A
 * body without a polygon is everywhere. Even odd crossing test, which is
 * exact arithmetic on the vertices and needs no tolerance. */
int water_body_at(double x, double y) {
  for (int i = 0; i < g_water_count; i += 1) {
    const WaterBody *b = &g_water[i];
    if (b->nvert < 3) {
      return i;
    }
    if (x < b->xmin || x > b->xmax || y < b->ymin || y > b->ymax) {
      continue;
    }
    int inside = 0;
    for (int j = 0, k = b->nvert - 1; j < b->nvert; k = j, j += 1) {
      const double yj = b->vy[j], yk = b->vy[k];
      if ((yj > y) != (yk > y)) {
        const double xc = b->vx[j] + (y - yj) * (b->vx[k] - b->vx[j]) / (yk - yj);
        if (x < xc) {
          inside = !inside;
        }
      }
    }
    if (inside) {
      return i;
    }
  }
  return -1;
}

/*
 * The surface of body i at (x, y) and time t: out[0] its height, world z;
 * out[1], out[2] its slope dz/dx and dz/dy; out[3..5] the water's own
 * velocity there, the waves' orbital motion at the surface. Per
 * component, theta = kx (x - ox) + ky (y - oy) - omega t + phase:
 *   z  += a cos theta
 *   dz/dx -= a kx sin theta, and dz/dy with ky
 *   the velocity is a omega cos theta along the wave's travel and
 *   a omega sin theta up, which is the time derivative of the height.
 */
void water_sample(int i, double x, double y, double t, double out[6]) {
  const WaterBody *b = &g_water[i];
  double z = b->z0, sx = 0.0, sy = 0.0, u = 0.0, v = 0.0, w = 0.0;
  const double px = x - b->ox;
  const double py = y - b->oy;
  for (int c = 0; c < b->ncomp; c += 1) {
    const WaterComp *k = &b->comp[c];
    const double th = k->kx * px + k->ky * py - k->om * t + k->ph;
    const double cs = sim_cos(th);
    const double sn = sim_sin(th);
    const double kk = sim_sqrt(k->kx * k->kx + k->ky * k->ky);
    const double aom = k->a * k->om;
    z += k->a * cs;
    sx -= k->a * k->kx * sn;
    sy -= k->a * k->ky * sn;
    u += aom * cs * k->kx / kk;
    v += aom * cs * k->ky / kk;
    w += aom * sn;
  }
  out[0] = z;
  out[1] = sx;
  out[2] = sy;
  out[3] = u;
  out[4] = v;
  out[5] = w;
}

const WaterBody *water_body(int i) {
  if (i < 0 || i >= g_water_count) {
    return 0;
  }
  return &g_water[i];
}
