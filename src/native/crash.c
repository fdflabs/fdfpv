/*
 * crash.c: crash physics. The parts every airframe is made of, the loads a
 * contact puts through them, what breaks, crushes, chips and bends, what
 * that does to the flight, and the parts that leave as free bodies. The
 * derivations, every limit and its source, are docs/CRASH-STAGE1.md.
 *
 * HOW IT SITS ON THE CONTACT SOLVER. sim.c resolves contacts exactly as it
 * did: an intact airframe meets the ground and the world through the same
 * eight hull corners and the same impulses. What is new reads those
 * impulses. Each one is attributed to the PART the real airframe would have
 * touched there (the parts' hull support in the contact's direction, so a
 * flat landing on the eight corners is a landing on the battery, and a
 * tilted one is a landing on an arm or a prop), turned into a peak force by
 * the part's and the surface's stiffness, and at the end of the step every
 * joint is judged by the free body diagram of the parts beyond it: the
 * contact forces on that side, less what the rest of the craft's
 * deceleration asks of their mass. Until a load passes a limit nothing is
 * written back, which is why a flight under every limit is bit identical
 * to the same flight with crash physics off. Once a part has left, the
 * airframe is no longer the box, and the contact samples the hulls of the
 * parts still on it.
 *
 * Deterministic throughout: fixed orders, the fixed libm, no host maths.
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

#include "sim_abi.h"
#include "sim_internal.h"
#include "libm/sim_math.h"
#include "crash_parts.h"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define SIM_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define SIM_EXPORT
#endif

CrashEffects CRASH;
/* Off by default, the path every existing check takes. A proof build sets
 * it on (scripts/crash-identity.js); nothing shipped does. */
#ifndef SIM_DAMAGE_DEFAULT
#define SIM_DAMAGE_DEFAULT 0
#endif
int SIM_DAMAGE = SIM_DAMAGE_DEFAULT;

#define CR_PI 3.14159265358979323846

/* ---------------------------------------------------------------------
 * SURFACES. mu and e match src/game/collide.js where the shell already
 * names the thing (grass 1.40 and 0, a gate 0.30 and 0.22, bark 0.50 and
 * 0.12, a wall 0.42 and 0.15), so a shell that moves to the material ids
 * changes nothing it already had. The stiffness is the surface's side of
 * the contact spring for a part sized indenter; the hardness is how hard a
 * spinning blade finds it. docs/CRASH-STAGE1.md, Surfaces.
 * ------------------------------------------------------------------- */
typedef struct {
  double mu, e, k, hard;
  double mu_face; /* a smooth face sliding on it, where it differs */
} Surface;

/* The default is two things: the ground plane's default is the shell's
 * grass (GROUND_MU and GROUND_E), and an obstacle's, a sim_contact or a
 * sim_contact_at with no material named, is a hard generic face, the one
 * past the table's end.
 *
 * mu_face is what a smooth face slides at. The shell's grass grips at 1.40,
 * a quad's arms and blades ploughing into turf; a smooth body sliding on a
 * natural grass pitch was measured at 0.45 (Linthorne and Cooper, Sports
 * Biomechanics 12(2), 2013: a steel runnered sled towed over a rugby pitch,
 * the gradient of tow force on weight up to 55 kg; they put the effective
 * value on uneven turf nearer 0.6). A foam belly, a pack's wrap and a
 * canopy are smooth faces. Where nothing was measured it is the surface's
 * own mu. docs/CRASH-STAGE1.md, Surfaces. */
#define SURF_OBSTACLE SIM_SURFACES
static const Surface SURF[SIM_SURFACES + 1] = {
  [SIM_SURF_DEFAULT] = { 1.40, 0.0, 5.0e4, 0.01, 0.45 },
  [SIM_SURF_GRASS] = { 1.40, 0.0, 5.0e4, 0.01, 0.45 },
  [SIM_SURF_DIRT] = { 1.00, 0.05, 2.0e5, 0.30, 1.00 },
  [SIM_SURF_ASPHALT] = { 0.60, 0.12, 3.0e7, 0.90, 0.60 },
  [SIM_SURF_CONCRETE] = { 0.42, 0.15, 5.0e7, 1.00, 0.42 },
  [SIM_SURF_ROCK] = { 0.42, 0.15, 5.0e7, 1.00, 0.42 },
  [SIM_SURF_SNOW] = { 0.20, 0.0, 1.0e4, 0.02, 0.20 },
  [SIM_SURF_WOOD] = { 0.50, 0.12, 5.0e6, 0.60, 0.50 },
  [SIM_SURF_METAL] = { 0.35, 0.20, 1.0e8, 1.00, 0.35 },
  [SIM_SURF_PVC] = { 0.30, 0.22, 2.0e5, 0.40, 0.30 },
  [SIM_SURF_FOLIAGE] = { 1.00, 0.0, 2.0e3, 0.02, 1.00 },
  [SIM_SURF_WATER] = { 0.05, 0.0, 1.0e4, 0.01, 0.05 },
  [SIM_SURF_SAND] = { 0.60, 0.0, 1.0e5, 0.40, 0.60 },
  [SURF_OBSTACLE] = { 0.40, 0.15, 2.0e6, 0.50, 0.40 },
};

/* ---------------------------------------------------------------------
 * THE TABLES, built once for every airframe in one pass, like the plant's
 * thrust axes, so nothing depends on which airframe a run touched first.
 * ------------------------------------------------------------------- */
typedef struct {
  int n;
  PartDef p[SIM_PARTS_MAX];
  double cg[SIM_PARTS_MAX][3];
  double lo[SIM_PARTS_MAX][3];
  double hi[SIM_PARTS_MAX][3];
  unsigned int sub[SIM_PARTS_MAX];   /* the part and everything under it */
  double seat[SIM_PARTS_MAX];        /* half the footprint it seats on, m */
  int wheel_part[SIM_WHEELS_MAX];    /* the part carrying each wheel, -1 */
  int float_part[2];                 /* left, right, -1 */
  double wing_area;                  /* plan area of the wing panels */
  double w1[SIM_PARTS_MAX];          /* a ringing panel's first bending
                                      * mode, rad/s; 0 rigid */
} Table;

static Table T[SIM_AIRFRAME_COUNT];
static int g_ready = 0;

static void part_expand(PartDef *d, int airframe) {
  const PlantParams *P = &PLANT_TABLE[airframe];
  if (d->shape == SH_ARM) {
    const double px = P->pos_x[d->motor], py = P->pos_y[d->motor];
    const double len = sim_sqrt(px * px + py * py);
    const double ux = px / len, uy = py / len;
    const double r0 = d->pts[0][0], r1 = d->pts[0][1], hw = d->pts[0][2];
    const double z0 = d->pts[1][0], z1 = d->pts[1][1];
    int k = 0;
    for (int iz = 0; iz < 2; iz += 1) {
      for (int ir = 0; ir < 2; ir += 1) {
        for (int is = 0; is < 2; is += 1) {
          const double r = ir ? r1 : r0;
          const double s = is ? hw : -hw;
          d->pts[k][0] = ux * r - uy * s;
          d->pts[k][1] = uy * r + ux * s;
          d->pts[k][2] = iz ? z1 : z0;
          k += 1;
        }
      }
    }
    d->npts = 8;
  } else if (d->shape == SH_DISCZ || d->shape == SH_DISCX) {
    const double c[3] = { d->pts[0][0], d->pts[0][1], d->pts[0][2] };
    const double R = d->pts[1][0];
    const double a = R * 0.70710678118654752;
    const double u[8] = { R, a, 0.0, -a, -R, -a, 0.0, a };
    const double v[8] = { 0.0, a, R, a, 0.0, -a, -R, -a };
    for (int k = 0; k < 8; k += 1) {
      if (d->shape == SH_DISCZ) {
        d->pts[k][0] = c[0] + u[k];
        d->pts[k][1] = c[1] + v[k];
        d->pts[k][2] = c[2];
      } else {
        d->pts[k][0] = c[0];
        d->pts[k][1] = c[1] + u[k];
        d->pts[k][2] = c[2] + v[k];
      }
    }
    d->npts = 8;
  }
  d->shape = SH_PTS;
}

static void table_add(Table *t, const PartDef *d, int airframe) {
  if (t->n >= SIM_PARTS_MAX) {
    return;
  }
  t->p[t->n] = *d;
  part_expand(&t->p[t->n], airframe);
  t->n += 1;
}

/*
 * A WING PANEL RINGS ON ITS SPAR, A BOOM ON ITS TUBE. The first bending
 * mode is a cantilever's, w = sqrt(3 E I / (L^3 (0.2427 m + M))), m its own
 * mass spread along it, M the parts it carries taken at its tip (Rayleigh's
 * tip mass form; with M = 0 it is 3.516 sqrt(E I / (m L^3)), the exact
 * first mode), L the reach from the root to its farthest hull point. The
 * joiner's E I follows from the limit the table already derives from it,
 * M = sigma I / r: E I = (E / sigma) M r. Pultruded carbon
 * tube, TAP Plastics' minimum properties: flexural modulus 127 GPa; the
 * tables take its bending strength at 1,000 MPa (the datasheet's minimum
 * is 1,370), so E / sigma = 127. The spar alone is stiffer than the panel
 * with its outboard foam, so this is an upper bound on the frequency, and
 * the shortest period a panel rings with: 8 to 13 Hz for the foam planes'
 * panels, inside the 5 to 20 Hz small UAV wings' ground vibration tests
 * put their first bending. RING_ZETA, its damping, is chosen: a few percent
 * of critical, a lightly damped structure. docs/CRASH-STAGE1.md, Damage.
 */
#define SPAR_E_OVER_S 127.0
#define RING_OWN 0.2427   /* 33 / 140, a cantilever's own mass at its tip */
#define RING_ZETA 0.03
#define RING_STILL 1.0e-3 /* N and N m: a ring below this is over */

/* Masses, centres, boxes, subtrees and the root's residual. */
static void table_finish(Table *t, int airframe) {
  const PlantParams *P = &PLANT_TABLE[airframe];
  double m_rest = 0.0;
  double mc[3] = { 0.0, 0.0, 0.0 };
  for (int i = 0; i < t->n; i += 1) {
    PartDef *d = &t->p[i];
    double c[3] = { 0.0, 0.0, 0.0 };
    for (int a = 0; a < 3; a += 1) {
      t->lo[i][a] = d->pts[0][a];
      t->hi[i][a] = d->pts[0][a];
    }
    for (int k = 0; k < d->npts; k += 1) {
      for (int a = 0; a < 3; a += 1) {
        c[a] += d->pts[k][a];
        if (d->pts[k][a] < t->lo[i][a]) t->lo[i][a] = d->pts[k][a];
        if (d->pts[k][a] > t->hi[i][a]) t->hi[i][a] = d->pts[k][a];
      }
    }
    for (int a = 0; a < 3; a += 1) {
      t->cg[i][a] = c[a] / (double)d->npts;
    }
    if (i > 0) {
      m_rest += d->mass;
      for (int a = 0; a < 3; a += 1) {
        mc[a] += d->mass * t->cg[i][a];
      }
    }
  }
  /* The root carries what the table does not name, placed where it keeps
   * the airframe's CG at the origin. */
  t->p[0].mass = P->mass_kg - m_rest;
  for (int a = 0; a < 3; a += 1) {
    t->cg[0][a] = t->p[0].mass > 0.0 ? -mc[a] / t->p[0].mass : 0.0;
  }
  for (int i = 0; i < t->n; i += 1) {
    t->sub[i] = 1u << i;
    /* The footprint is the part's box less its longest side: half the
     * mean of the two shorter. */
    double d[3];
    for (int a = 0; a < 3; a += 1) d[a] = t->hi[i][a] - t->lo[i][a];
    double mx = d[0];
    if (d[1] > mx) mx = d[1];
    if (d[2] > mx) mx = d[2];
    t->seat[i] = 0.25 * (d[0] + d[1] + d[2] - mx);
  }
  /* Parents precede children in every table, so one backward pass folds
   * each subtree into its parent. */
  for (int i = t->n - 1; i > 0; i -= 1) {
    const int par = t->p[i].parent;
    if (par >= 0) {
      t->sub[par] |= t->sub[i];
    }
  }
  for (int i = 0; i < t->n; i += 1) {
    t->w1[i] = 0.0;
    if (!(t->p[i].spar_r > 0.0) || i == 0) {
      continue;
    }
    double reach = 0.0;
    for (int k = 0; k < t->p[i].npts; k += 1) {
      const double e[3] = { t->p[i].pts[k][0] - t->p[i].joint[0], t->p[i].pts[k][1] - t->p[i].joint[1],
                            t->p[i].pts[k][2] - t->p[i].joint[2] };
      const double r = sim_sqrt(e[0] * e[0] + e[1] * e[1] + e[2] * e[2]);
      if (r > reach) reach = r;
    }
    /* The parts it carries ride at its tip. */
    double m_eff = RING_OWN * t->p[i].mass;
    for (int c = i + 1; c < t->n; c += 1) {
      if (t->sub[i] & (1u << c)) {
        m_eff += t->p[c].mass;
      }
    }
    const double ei = SPAR_E_OVER_S * t->p[i].m_max * t->p[i].spar_r;
    const double w = sim_sqrt(3.0 * ei / (m_eff * reach * reach * reach));
    if (w * SIM_DT < 0.5) {
      t->w1[i] = w;
    }
  }
  for (int w = 0; w < SIM_WHEELS_MAX; w += 1) {
    t->wheel_part[w] = -1;
  }
  t->float_part[0] = -1;
  t->float_part[1] = -1;
  t->wing_area = 0.0;
  for (int i = 0; i < t->n; i += 1) {
    const PartDef *d = &t->p[i];
    if (d->wheel >= 0 && d->wheel < P->wheel_count) {
      t->wheel_part[d->wheel] = i;
    }
    if (d->kind == SIM_PART_FLOAT) {
      t->float_part[t->cg[i][1] > 0.0 ? 0 : 1] = i;
    }
    if (d->kind == SIM_PART_WING) {
      t->wing_area += (t->hi[i][0] - t->lo[i][0]) * (t->hi[i][1] - t->lo[i][1]);
    }
  }
}

/* A float variant: the wheeled table without its gear, raised by dz, and
 * two floats on struts from the plant's float geometry. */
static void table_floats(Table *t, const PartDef *base, int nbase, int airframe, double dz,
                         double strut_x0, double strut_x1, double body_bottom, double float_mass) {
  const PlantParams *P = &PLANT_TABLE[airframe];
  const FloatParams *fp = &P->floats;
  int remap[SIM_PARTS_MAX];
  t->n = 0;
  for (int i = 0; i < nbase; i += 1) {
    remap[i] = -1;
    if (base[i].kind == SIM_PART_GEAR) {
      continue;
    }
    PartDef d = base[i];
    d.parent = d.parent >= 0 ? remap[d.parent] : -1;
    if (d.wheel >= P->wheel_count) {
      d.wheel = -1;
    }
    part_expand(&d, airframe);
    d.joint[2] += dz;
    for (int k = 0; k < d.npts; k += 1) {
      d.pts[k][2] += dz;
    }
    remap[i] = t->n;
    table_add(t, &d, airframe);
  }
  for (int f = 0; f < 2; f += 1) {
    const double yf = f == 0 ? fp->y : -fp->y;
    PartDef d = {
      .kind = SIM_PART_FLOAT, .parent = 0, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
      .mass = float_mass, .m_max = FLOAT_STRUT_M, .f_max = FLOAT_STRUT_F, .k = 1.0e4,
      .crush_s = EPO_CRUSH, .crush_a = 0.5 * fp->beam * fp->depth, .crush_d = 0.05,
    };
    d.joint[0] = 0.5 * (strut_x0 + strut_x1);
    d.joint[1] = 0.5 * yf;
    d.joint[2] = body_bottom + dz;
    const double x0 = fp->x_stern, x1 = fp->x_bow;
    const double y0 = yf - 0.5 * fp->beam, y1 = yf + 0.5 * fp->beam;
    const double z0 = fp->z_keel, z1 = fp->z_keel + fp->depth;
    const double pts[8][3] = {
      { x0, y0, z0 }, { x1, y0, z0 }, { x0, y1, z0 }, { x1, y1, z0 },
      { x0, y0, z1 }, { x1, y0, z1 }, { x0, y1, z1 }, { x1, y1, z1 },
    };
    d.npts = 8;
    for (int k = 0; k < 8; k += 1) {
      for (int a = 0; a < 3; a += 1) {
        d.pts[k][a] = pts[k][a];
      }
    }
    table_add(t, &d, airframe);
  }
}

#define COUNT(a) ((int)(sizeof(a) / sizeof((a)[0])))

/*
 * THE WHOOP THE SHELL FLIES. The shell's whoop is the five inch's plant, its
 * mass and its hull, in a room built MICRO_SCALE times life size
 * (configs/airframes.js: 0.1735 m over 0.0506 m, the two airframes' prop
 * tip sweeps). So it gets the real whoop's parts scaled to that world as a
 * dynamically similar model: lengths by L = 3.4289, masses by M = 0.71 /
 * 0.0234, and every limit by what those do to the loads of the same crash,
 * forces by M L, moments by M L^2, stiffness by M, stresses by M / L. A
 * wall or floor bounce the real 23 g whoop survives maps onto one this
 * survives, which is the lead's decision after the suite's baseline.
 */
#define WHOOP_L (0.1735 / 0.0506)
#define WHOOP_M (0.71 / 0.0234)
static Table T_WHOOP_SCALED;

static void whoop_scaled_build(void) {
  Table *t = &T_WHOOP_SCALED;
  t->n = 0;
  for (int i = 0; i < COUNT(PARTS_WHOOP65); i += 1) {
    PartDef d = PARTS_WHOOP65[i];
    part_expand(&d, SIM_AIRFRAME_WHOOP65);
    for (int k = 0; k < d.npts; k += 1) {
      for (int a = 0; a < 3; a += 1) d.pts[k][a] *= WHOOP_L;
    }
    for (int a = 0; a < 3; a += 1) d.joint[a] *= WHOOP_L;
    d.mass *= WHOOP_M;
    d.m_max *= WHOOP_M * WHOOP_L * WHOOP_L;
    d.f_max *= WHOOP_M * WHOOP_L;
    d.k *= WHOOP_M;
    d.crush_s *= WHOOP_M / WHOOP_L;
    d.crush_a *= WHOOP_L * WHOOP_L;
    d.crush_d *= WHOOP_L;
    table_add(t, &d, SIM_AIRFRAME_5IN);
  }
  table_finish(t, SIM_AIRFRAME_5IN);
}

static void tables_build(void) {
  struct { int id; const PartDef *p; int n; } src[] = {
    { SIM_AIRFRAME_5IN, PARTS_5IN, COUNT(PARTS_5IN) },
    { SIM_AIRFRAME_WHOOP65, PARTS_WHOOP65, COUNT(PARTS_WHOOP65) },
    { SIM_AIRFRAME_WING1000, PARTS_WING1000, COUNT(PARTS_WING1000) },
    { SIM_AIRFRAME_SKY1800, PARTS_SKY1800, COUNT(PARTS_SKY1800) },
    { SIM_AIRFRAME_CUB1400, PARTS_CUB1400, COUNT(PARTS_CUB1400) },
    { SIM_AIRFRAME_SLOWSTICK1180, PARTS_SLOWSTICK1180, COUNT(PARTS_SLOWSTICK1180) },
    { SIM_AIRFRAME_RADIAN2000, PARTS_RADIAN2000, COUNT(PARTS_RADIAN2000) },
    { SIM_AIRFRAME_TIMBER1500, PARTS_TIMBER1500, COUNT(PARTS_TIMBER1500) },
    { SIM_AIRFRAME_BRAMOR2300, PARTS_BRAMOR2300, COUNT(PARTS_BRAMOR2300) },
  };
  for (int s = 0; s < COUNT(src); s += 1) {
    Table *t = &T[src[s].id];
    t->n = 0;
    for (int i = 0; i < src[s].n; i += 1) {
      table_add(t, &src[s].p[i], src[s].id);
    }
    table_finish(t, src[s].id);
  }
  /* The CG drops 26.6 and 26.4 mm on floats (plant.c), which raises every
   * part of the airframe by as much over the new origin. The struts meet
   * the fuselage's belly, 0.070 and 0.056 under the old CG. Each float with
   * its struts is half the set's mass, FLOATS-STAGE1's 0.234 and 0.212 kg. */
  table_floats(&T[SIM_AIRFRAME_TIMBER1500F], PARTS_TIMBER1500, COUNT(PARTS_TIMBER1500),
               SIM_AIRFRAME_TIMBER1500F, 0.0266, 0.12, -0.02, -0.070, 0.117);
  table_finish(&T[SIM_AIRFRAME_TIMBER1500F], SIM_AIRFRAME_TIMBER1500F);
  table_floats(&T[SIM_AIRFRAME_CUB1400F], PARTS_CUB1400, COUNT(PARTS_CUB1400),
               SIM_AIRFRAME_CUB1400F, 0.0264, 0.07, -0.02, -0.056, 0.106);
  table_finish(&T[SIM_AIRFRAME_CUB1400F], SIM_AIRFRAME_CUB1400F);
  whoop_scaled_build();
  g_ready = 1;
}

/* The part table in force: the airframe's own, or the whoop drawn on the
 * five inch's plant (sim_set_part_table). */
static int g_table_sel = SIM_PARTS_OWN;

static const Table *tab(void) {
  if (!g_ready) {
    tables_build();
  }
  if (g_table_sel == SIM_PARTS_WHOOP_SCALED && plant_airframe() == SIM_AIRFRAME_5IN) {
    return &T_WHOOP_SCALED;
  }
  return &T[plant_airframe()];
}

SIM_EXPORT int sim_set_part_table(int which) {
  if (which != SIM_PARTS_OWN && which != SIM_PARTS_WHOOP_SCALED) {
    return SIM_ERR_BAD_ARG;
  }
  g_table_sel = which;
  crash_reset();
  return SIM_OK;
}

SIM_EXPORT int sim_part_table(void) {
  return g_table_sel;
}

/* ---------------------------------------------------------------------
 * DYNAMIC STATE
 * ------------------------------------------------------------------- */
typedef struct {
  int status;
  int body;
  double peak;       /* this step's load over limit */
  double peak_max;   /* the largest it has ever been, which is what damage
                      * follows: a load under an earlier one adds nothing */
  double strength;   /* what a crack has left of the joint, fraction */
  double crush;      /* m */
  double chip;       /* a prop's, 0..1 */
  double chip_evt;   /* the chip at its last event */
  long long chip_step; /* the step of its last spinning chip, or -2 */
  double bend[3];    /* rotation vector, body frame, rad */
  double dent[3];    /* m, body frame */
  double energy;     /* J */
  double damage;
  double ring[6];    /* a ringing panel's joint force and moment, body */
  double ring_d[6];  /* and their rates */
} PartState;

static PartState PS[SIM_PARTS_MAX];

/* Where the CG has moved, table frame, and the live airframe's mass and
 * inertia. g_live is the plant's own entry, copied the first time a part
 * leaves, with the mass, inertia and every body frame position moved to
 * the new CG; PLANT_P points at it from then until the reset. */
static double g_shift[3];
static PlantParams g_live;
static int g_live_on = 0;

/* The contact samplers once a part has left. */
static double g_samp[SIM_PARTS_MAX * SIM_PART_PTS_MAX][3];
static int g_samp_part[SIM_PARTS_MAX * SIM_PART_PTS_MAX];
static int g_nsamp = 0;

/* Events. */
static double g_ev[SIM_DAMAGE_EVENTS_MAX][SIM_DAMAGE_EVENT_DOUBLES];
static int g_ev_head = 0;
static int g_ev_count = 0;
static int g_ev_dropped = 0;
static int g_flags_extra = 0; /* IN_TREE, IN_WATER: this step's */
static long long g_wet_step = -1000000;   /* the last step the craft was wet */
static long long g_crown_step = -1000000; /* and the last it was in a crown */

/* The surface the solver is meeting now. */
static int g_surf = SIM_SURF_DEFAULT;
static int g_ground_mat = SIM_SURF_DEFAULT;
static int g_surf_ground = 0;          /* the contact is the ground plane's */
static unsigned int g_batch_crush = 0; /* parts crushing in this batch */

/* Crush in progress, crash_contact_pre. */
static double g_batch_dt = SIM_DT;
static double g_crush_used[SIM_PARTS_MAX];
static int g_capped_now = 0;
static double g_capped_fc = 0.0;
static int g_crushing = 0;
static unsigned int g_crush_mask = 0;
static long long g_last_contact_step = -1000000;

/* The ground's spring, crash_contact_pre: the parts in a sprung contact in
 * the last step and in this batch, and the deepest each is in this batch. */
static double g_pen = 0.0;
static int g_from_step = 0;
static int g_soft_now = 0;
static unsigned int g_spring_mask = 0;
static unsigned int g_batch_spring = 0;
static double g_batch_pen[SIM_PARTS_MAX];
/* The points each part met the ground at, this step and the last. */
static double g_spring_pts[SIM_PARTS_MAX][SIM_PART_PTS_MAX][3];
static int g_spring_npts[SIM_PARTS_MAX];
static int g_spring_npts_last[SIM_PARTS_MAX];

/* ---------------------------------------------------------------------
 * SMALL VECTOR HELPERS
 * ------------------------------------------------------------------- */
static void qrot(const double q[4], const double v[3], double out[3]) {
  const double w = q[0], x = q[1], y = q[2], z = q[3];
  const double ux = 2.0 * (y * v[2] - z * v[1]);
  const double uy = 2.0 * (z * v[0] - x * v[2]);
  const double uz = 2.0 * (x * v[1] - y * v[0]);
  out[0] = v[0] + w * ux + (y * uz - z * uy);
  out[1] = v[1] + w * uy + (z * ux - x * uz);
  out[2] = v[2] + w * uz + (x * uy - y * ux);
}

static void qrot_inv(const double q[4], const double v[3], double out[3]) {
  const double qc[4] = { q[0], -q[1], -q[2], -q[3] };
  qrot(qc, v, out);
}

static void qmul(const double a[4], const double b[4], double out[4]) {
  out[0] = a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3];
  out[1] = a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2];
  out[2] = a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1];
  out[3] = a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0];
}

static void cross(const double a[3], const double b[3], double out[3]) {
  const double x = a[1] * b[2] - a[2] * b[1];
  const double y = a[2] * b[0] - a[0] * b[2];
  const double z = a[0] * b[1] - a[1] * b[0];
  out[0] = x;
  out[1] = y;
  out[2] = z;
}

static double dot(const double a[3], const double b[3]) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

static double norm(const double a[3]) {
  return sim_sqrt(dot(a, a));
}

/* A rotation vector to a quaternion. The angles here are a few tenths of
 * a radian at most, inside the small angle range. */
static void rotvec_quat(const double v[3], double q[4]) {
  const double ang = norm(v);
  if (!(ang > 1e-12)) {
    q[0] = 1.0;
    q[1] = 0.0;
    q[2] = 0.0;
    q[3] = 0.0;
    return;
  }
  const double h = 0.5 * ang;
  const double s = sim_sin_small(h) / ang;
  q[0] = sim_cos_small(h);
  q[1] = v[0] * s;
  q[2] = v[1] * s;
  q[3] = v[2] * s;
}

/* A part's point, table frame, to the live body frame. */
static void live_pt(const double p[3], double out[3]) {
  out[0] = p[0] - g_shift[0];
  out[1] = p[1] - g_shift[1];
  out[2] = p[2] - g_shift[2];
}

static int attached(int i) {
  return PS[i].status == SIM_PART_ATTACHED;
}

/* ---------------------------------------------------------------------
 * EVENTS
 * ------------------------------------------------------------------- */
static void event_push(const SimState *s, int part, int type, double ratio, double force,
                       double moment, double energy, const double pw[3], const double nw[3],
                       double vin, int surf) {
  double *e;
  if (g_ev_count == SIM_DAMAGE_EVENTS_MAX) {
    g_ev_head = (g_ev_head + 1) % SIM_DAMAGE_EVENTS_MAX;
    g_ev_count -= 1;
    g_ev_dropped += 1;
  }
  e = g_ev[(g_ev_head + g_ev_count) % SIM_DAMAGE_EVENTS_MAX];
  g_ev_count += 1;
  e[0] = (double)s->step_index;
  e[1] = (double)part;
  e[2] = (double)type;
  e[3] = ratio;
  e[4] = force;
  e[5] = moment;
  e[6] = energy;
  for (int a = 0; a < 3; a += 1) {
    e[7 + a] = pw ? pw[a] : 0.0;
    e[10 + a] = nw ? nw[a] : 0.0;
  }
  e[13] = vin;
  e[14] = (double)(surf == SURF_OBSTACLE ? SIM_SURF_DEFAULT : surf);
  e[15] = PS[part].damage;
}

/* ---------------------------------------------------------------------
 * FREE BODIES
 * ------------------------------------------------------------------- */
#define FB_PTS (SIM_PARTS_MAX * SIM_PART_PTS_MAX)
typedef struct {
  int state;          /* 0 unused, else SIM_PART_FREE, _RESTING, _RETIRED */
  long long born;
  int still_ms;
  int touching;
  unsigned int parts;
  double m, I[3];
  double cg0[3];      /* its centre in the table frame */
  double pos[3], vel[3], q[4], w[3]; /* w body frame */
  double cda;         /* drag area, m^2 */
  double vol;         /* displaced volume fully under, m^3 */
  double k;           /* its stiffest part's contact stiffness */
  int npts;
  double pts[FB_PTS][3];
} FreeBody;

static FreeBody FB[SIM_PARTS_MAX];

SIM_EXPORT int sim_free_bodies_active(void) {
  int n = 0;
  for (int b = 0; b < SIM_PARTS_MAX; b += 1) {
    n += FB[b].state == SIM_PART_FREE;
  }
  return n;
}

/* Densities for a free body's buoyancy, kg/m^3 of its hull box: foam
 * floats, a pack and a motor sink. */
static double mat_density(int mat) {
  switch (mat) {
  case SIM_MAT_EPO:
  case SIM_MAT_EPP:
    return 35.0;
  case SIM_MAT_LIPO:
    return 2200.0;
  case SIM_MAT_ALU:
    return 2700.0;
  case SIM_MAT_WIRE:
    return 7800.0;
  case SIM_MAT_ELECTRONICS:
    return 1500.0;
  default:
    return 1400.0;
  }
}

/* One more moving body past the budget retires the one that has lain still
 * longest, and failing that the oldest. Retiring freezes it where it is. */
static void fb_budget(void) {
  int moving = 0;
  int oldest = -1;
  for (int b = 0; b < SIM_PARTS_MAX; b += 1) {
    if (FB[b].state == SIM_PART_FREE) {
      moving += 1;
      if (oldest < 0 || FB[b].still_ms > FB[oldest].still_ms
          || (FB[b].still_ms == FB[oldest].still_ms && FB[b].born < FB[oldest].born)) {
        oldest = b;
      }
    }
  }
  if (moving > SIM_FREE_BODIES_MAX && oldest >= 0) {
    FB[oldest].state = SIM_PART_RETIRED;
    for (int i = 0; i < SIM_PARTS_MAX; i += 1) {
      if (FB[oldest].parts & (1u << i)) {
        PS[i].status = SIM_PART_RETIRED;
      }
    }
  }
}

/* Make a free body of the parts in mask, which have just left the craft.
 * vel_w and w_body are the motion the craft had at its own CG; the body
 * takes the rigid motion of its own centre. */
static int fb_spawn(const SimState *s, unsigned int mask, const double vel_w[3], const double w_body[3]) {
  const Table *t = tab();
  int slot = -1;
  for (int b = 0; b < SIM_PARTS_MAX; b += 1) {
    if (FB[b].state == 0) {
      slot = b;
      break;
    }
  }
  if (slot < 0) {
    return -1;
  }
  FreeBody *f = &FB[slot];
  f->state = SIM_PART_FREE;
  f->born = s->step_index;
  f->still_ms = 0;
  f->touching = 0;
  f->parts = mask;
  f->m = 0.0;
  f->vol = 0.0;
  f->k = 0.0;
  double mc[3] = { 0.0, 0.0, 0.0 };
  double lo[3] = { 1e9, 1e9, 1e9 }, hi[3] = { -1e9, -1e9, -1e9 };
  for (int i = 0; i < t->n; i += 1) {
    if (!(mask & (1u << i))) {
      continue;
    }
    const double m = t->p[i].mass;
    f->m += m;
    for (int a = 0; a < 3; a += 1) {
      mc[a] += m * t->cg[i][a];
      if (t->lo[i][a] < lo[a]) lo[a] = t->lo[i][a];
      if (t->hi[i][a] > hi[a]) hi[a] = t->hi[i][a];
    }
    const double bx = t->hi[i][0] - t->lo[i][0];
    const double by = t->hi[i][1] - t->lo[i][1];
    const double bz = t->hi[i][2] - t->lo[i][2];
    const double v = bx * by * (bz > 0.004 ? bz : 0.004);
    /* A part's displaced volume is its mass over its material's density,
     * capped by its box, so a foam panel floats and a motor sinks. */
    const double vm = m / mat_density(t->p[i].mat);
    f->vol += vm < v ? vm : v;
    if (t->p[i].k > f->k) {
      f->k = t->p[i].k;
    }
  }
  if (!(f->m > 0.0)) {
    f->state = 0;
    return -1;
  }
  for (int a = 0; a < 3; a += 1) {
    f->cg0[a] = mc[a] / f->m;
  }
  /* Inertia: each part a point mass at its centre plus its own box. */
  f->I[0] = f->I[1] = f->I[2] = 0.0;
  f->npts = 0;
  for (int i = 0; i < t->n; i += 1) {
    if (!(mask & (1u << i))) {
      continue;
    }
    const double m = t->p[i].mass;
    const double d[3] = { t->cg[i][0] - f->cg0[0], t->cg[i][1] - f->cg0[1], t->cg[i][2] - f->cg0[2] };
    const double bx = t->hi[i][0] - t->lo[i][0];
    const double by = t->hi[i][1] - t->lo[i][1];
    const double bz = t->hi[i][2] - t->lo[i][2];
    f->I[0] += m * (d[1] * d[1] + d[2] * d[2]) + m * (by * by + bz * bz) / 12.0;
    f->I[1] += m * (d[0] * d[0] + d[2] * d[2]) + m * (bx * bx + bz * bz) / 12.0;
    f->I[2] += m * (d[0] * d[0] + d[1] * d[1]) + m * (bx * bx + by * by) / 12.0;
    for (int k = 0; k < t->p[i].npts && f->npts < FB_PTS; k += 1) {
      for (int a = 0; a < 3; a += 1) {
        f->pts[f->npts][a] = t->p[i].pts[k][a] - f->cg0[a];
      }
      f->npts += 1;
    }
  }
  /* A thin part still has some inertia about its thin axis. */
  const double floor = f->m * 1.0e-4;
  for (int a = 0; a < 3; a += 1) {
    if (f->I[a] < floor) f->I[a] = floor;
  }
  const double sx = hi[0] - lo[0], sy = hi[1] - lo[1], sz = hi[2] - lo[2];
  double area = sx * sy;
  if (sx * sz > area) area = sx * sz;
  if (sy * sz > area) area = sy * sz;
  f->cda = 1.0 * area;
  /* Where its centre is now, and the rigid motion there. */
  double c_live[3];
  live_pt(f->cg0, c_live);
  double r_w[3];
  qrot(s->quat, c_live, r_w);
  double w_w[3];
  qrot(s->quat, w_body, w_w);
  double wr[3];
  cross(w_w, r_w, wr);
  for (int a = 0; a < 3; a += 1) {
    f->pos[a] = s->pos[a] + r_w[a];
    f->vel[a] = vel_w[a] + wr[a];
    f->q[a] = s->quat[a];
    f->w[a] = w_body[a];
  }
  f->q[3] = s->quat[3];
  for (int i = 0; i < t->n; i += 1) {
    if (mask & (1u << i)) {
      PS[i].status = SIM_PART_FREE;
      PS[i].body = slot;
    }
  }
  fb_budget();
  return slot;
}

/* ---------------------------------------------------------------------
 * THE LIVE AIRFRAME. Rebuilt whenever a part leaves: the mass and CG of
 * what is left, its inertia about that CG, and every body frame position
 * the plants read moved to it.
 * ------------------------------------------------------------------- */
static void live_rebuild(SimState *s) {
  const Table *t = tab();
  const PlantParams *P0 = &PLANT_TABLE[plant_airframe()];
  double m = 0.0;
  double mc[3] = { 0.0, 0.0, 0.0 };
  double Irem[3] = { P0->inertia[0], P0->inertia[1], P0->inertia[2] };
  for (int i = 0; i < t->n; i += 1) {
    const double *c = t->cg[i];
    const double mi = t->p[i].mass;
    if (attached(i)) {
      m += mi;
      for (int a = 0; a < 3; a += 1) {
        mc[a] += mi * c[a];
      }
    } else {
      /* Take away its share about the table's origin: a point mass. */
      Irem[0] -= mi * (c[1] * c[1] + c[2] * c[2]);
      Irem[1] -= mi * (c[0] * c[0] + c[2] * c[2]);
      Irem[2] -= mi * (c[0] * c[0] + c[1] * c[1]);
    }
  }
  if (!(m > 0.0)) {
    return;
  }
  double sh[3];
  for (int a = 0; a < 3; a += 1) {
    sh[a] = mc[a] / m;
  }
  /* The state's position is the CG: move it, and its velocity to the
   * velocity of the new CG's point. */
  const double d[3] = { sh[0] - g_shift[0], sh[1] - g_shift[1], sh[2] - g_shift[2] };
  double dw[3];
  qrot(s->quat, d, dw);
  double ww[3];
  qrot(s->quat, s->omega, ww);
  double wd[3];
  cross(ww, dw, wd);
  for (int a = 0; a < 3; a += 1) {
    s->pos[a] += dw[a];
    s->vel[a] += wd[a];
    g_shift[a] = sh[a];
    CRASH.cg_shift[a] = sh[a];
  }
  g_live = *P0;
  g_live.mass_kg = m;
  const double Ic[3] = {
    Irem[0] - m * (sh[1] * sh[1] + sh[2] * sh[2]),
    Irem[1] - m * (sh[0] * sh[0] + sh[2] * sh[2]),
    Irem[2] - m * (sh[0] * sh[0] + sh[1] * sh[1]),
  };
  for (int a = 0; a < 3; a += 1) {
    const double lo = 0.05 * P0->inertia[a];
    g_live.inertia[a] = Ic[a] > lo ? Ic[a] : lo;
  }
  for (int k = 0; k < SIM_MOTOR_COUNT; k += 1) {
    g_live.pos_x[k] = P0->pos_x[k] - sh[0];
    g_live.pos_y[k] = P0->pos_y[k] - sh[1];
    g_live.pos_z[k] = P0->pos_z[k] - sh[2];
  }
  g_live.camera_x = P0->camera_x - sh[0];
  g_live.camera_y = P0->camera_y - sh[1];
  g_live.camera_z = P0->camera_z - sh[2];
  for (int w = 0; w < P0->wheel_count; w += 1) {
    for (int a = 0; a < 3; a += 1) {
      g_live.wheel[w].pos[a] = P0->wheel[w].pos[a] - sh[a];
    }
  }
  /* The floats are symmetric in the table and stay so: a sideways shift
   * of the CG is left out of their geometry, which the doc records. */
  g_live.floats.x_bow = P0->floats.x_bow - sh[0];
  g_live.floats.x_knee = P0->floats.x_knee - sh[0];
  g_live.floats.x_step = P0->floats.x_step - sh[0];
  g_live.floats.x_stern = P0->floats.x_stern - sh[0];
  g_live.floats.rudder_x = P0->floats.rudder_x - sh[0];
  g_live.floats.z_keel = P0->floats.z_keel - sh[2];
  g_live.floats.rudder_z = P0->floats.rudder_z - sh[2];
  g_live_on = 1;
  PLANT_P = &g_live;
  /* The samplers: every attached part's hull. */
  g_nsamp = 0;
  for (int i = 0; i < t->n; i += 1) {
    if (!attached(i)) {
      continue;
    }
    for (int k = 0; k < t->p[i].npts; k += 1) {
      live_pt(t->p[i].pts[k], g_samp[g_nsamp]);
      g_samp_part[g_nsamp] = i;
      g_nsamp += 1;
    }
  }
}

int crash_samplers(const double **pts, const int **part) {
  *pts = &g_samp[0][0];
  *part = g_samp_part;
  return g_nsamp;
}

/* ---------------------------------------------------------------------
 * EFFECTS: what the damage does to the flight, rebuilt from the parts'
 * state whenever it changes.
 * ------------------------------------------------------------------- */
static int find_motor_part(const Table *t, int kind, int motor) {
  for (int i = 0; i < t->n; i += 1) {
    if (t->p[i].kind == kind && t->p[i].motor == motor) {
      return i;
    }
  }
  return -1;
}

static void effects_rebuild(void) {
  const Table *t = tab();
  const PlantParams *P0 = &PLANT_TABLE[plant_airframe()];
  int any = 0;
  int left = 0;
  for (int i = 1; i < t->n; i += 1) {
    if (!attached(i)) {
      left = 1;
    }
  }
  CRASH.hull_parts = left;
  any |= left;
  /* The pack. */
  CRASH.no_power = 0;
  for (int i = 0; i < t->n; i += 1) {
    if (t->p[i].kind == SIM_PART_BATTERY && !attached(i)) {
      CRASH.no_power = 1;
    }
  }
  any |= CRASH.no_power;
  /* The rotors. */
  CRASH.bent = 0;
  for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
    CRASH.kt[m] = 1.0;
    CRASH.kq[m] = 1.0;
    CRASH.jr[m] = 1.0;
    CRASH.imbalance[m] = 1.0;
    CRASH.motor_dead[m] = CRASH.no_power;
    CRASH.bend[m][0] = CRASH.bend[m][1] = CRASH.bend[m][2] = 0.0;
    const int mp = find_motor_part(t, SIM_PART_MOTOR, m);
    const int pp = find_motor_part(t, SIM_PART_PROP, m);
    const int ap = find_motor_part(t, SIM_PART_ARM, m);
    if (mp < 0) {
      continue;
    }
    if (!attached(mp)) {
      CRASH.motor_dead[m] = 1;
      CRASH.kt[m] = 0.0;
      CRASH.kq[m] = 0.0;
      any = 1;
      continue;
    }
    if (pp >= 0 && !attached(pp)) {
      /* The bell spins free: no thrust, a hub's drag, the rotor a third. */
      CRASH.kt[m] = 0.0;
      CRASH.kq[m] = 0.03;
      CRASH.jr[m] = 0.4;
      any = 1;
    } else if (pp >= 0 && PS[pp].chip > 0.0) {
      const double c = PS[pp].chip;
      CRASH.kt[m] = 1.0 - 0.6 * c;
      CRASH.kq[m] = 1.0 - 0.5 * c;
      CRASH.jr[m] = 1.0 - 0.3 * c;
      CRASH.imbalance[m] = 1.0 + 25.0 * c;
      any = 1;
    }
    if (ap >= 0 && norm(PS[ap].bend) > 0.0) {
      for (int a = 0; a < 3; a += 1) {
        CRASH.bend[m][a] = PS[ap].bend[a];
      }
      CRASH.bent = 1;
      any = 1;
    }
  }
  /* The wing. */
  double lost_a = 0.0, lost_ay = 0.0;
  int n_rud = 0, n_rud_left = 0, n_fin = 0, n_fin_left = 0, n_h = 0, n_h_left = 0;
  CRASH.surf_lost[0] = CRASH.surf_lost[1] = CRASH.surf_lost[2] = CRASH.surf_lost[3] = 0;
  for (int i = 0; i < t->n; i += 1) {
    const int k = t->p[i].kind;
    const int on = attached(i);
    const int left_side = t->cg[i][1] > 0.0;
    if (k == SIM_PART_WING && !on) {
      const double a = (t->hi[i][0] - t->lo[i][0]) * (t->hi[i][1] - t->lo[i][1]);
      lost_a += a;
      lost_ay += a * t->cg[i][1];
    }
    if ((k == SIM_PART_AILERON || k == SIM_PART_ELEVON) && !on) {
      CRASH.surf_lost[left_side ? 0 : 1] = 1;
    }
    if (k == SIM_PART_ELEVATOR && !on) {
      CRASH.surf_lost[2] = 1;
    }
    if (k == SIM_PART_RUDDER) {
      n_rud += 1;
      n_rud_left += on;
    }
    if (k == SIM_PART_FIN) {
      n_fin += 1;
      n_fin_left += on;
    }
    if (k == SIM_PART_HSTAB) {
      n_h += 1;
      n_h_left += on;
    }
  }
  CRASH.lift_keep = t->wing_area > 0.0 ? 1.0 - lost_a / t->wing_area : 1.0;
  CRASH.lift_y = lost_a > 0.0 ? lost_ay / lost_a : 0.0;
  CRASH.rudder_keep = n_rud > 0 ? (double)n_rud_left / (double)n_rud : 1.0;
  CRASH.fin_keep = n_fin > 0 ? (double)n_fin_left / (double)n_fin : 1.0;
  CRASH.hstab_keep = n_h > 0 ? (double)n_h_left / (double)n_h : 1.0;
  if (CRASH.rudder_keep < 1.0) {
    CRASH.surf_lost[3] = CRASH.rudder_keep == 0.0;
  }
  for (int w = 0; w < SIM_WHEELS_MAX; w += 1) {
    const int p = t->wheel_part[w];
    CRASH.wheel_lost[w] = (p >= 0 && !attached(p)) ? 1 : 0;
  }
  for (int f = 0; f < 2; f += 1) {
    const int p = t->float_part[f];
    CRASH.float_lost[f] = (p >= 0 && !attached(p)) ? 1 : 0;
  }
  (void)P0;
  CRASH.active = any;
}

/* ---------------------------------------------------------------------
 * RESET
 * ------------------------------------------------------------------- */
static void effects_clear(void) {
  CRASH.active = 0;
  CRASH.hull_parts = 0;
  CRASH.no_power = 0;
  CRASH.bent = 0;
  for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
    CRASH.kt[m] = 1.0;
    CRASH.kq[m] = 1.0;
    CRASH.jr[m] = 1.0;
    CRASH.imbalance[m] = 1.0;
    CRASH.motor_dead[m] = 0;
    CRASH.bend[m][0] = CRASH.bend[m][1] = CRASH.bend[m][2] = 0.0;
  }
  CRASH.lift_keep = 1.0;
  CRASH.lift_y = 0.0;
  CRASH.surf_lost[0] = CRASH.surf_lost[1] = CRASH.surf_lost[2] = CRASH.surf_lost[3] = 0;
  CRASH.rudder_keep = 1.0;
  CRASH.hstab_keep = 1.0;
  CRASH.fin_keep = 1.0;
  CRASH.cg_shift[0] = CRASH.cg_shift[1] = CRASH.cg_shift[2] = 0.0;
  for (int w = 0; w < SIM_WHEELS_MAX; w += 1) {
    CRASH.wheel_lost[w] = 0;
  }
  CRASH.float_lost[0] = CRASH.float_lost[1] = 0;
}

void crash_reset(void) {
  if (!g_ready) {
    tables_build();
  }
  for (int i = 0; i < SIM_PARTS_MAX; i += 1) {
    PartState *p = &PS[i];
    p->status = SIM_PART_ATTACHED;
    p->body = -1;
    p->peak = 0.0;
    p->peak_max = 0.0;
    p->strength = 1.0;
    p->crush = 0.0;
    p->chip = 0.0;
    p->chip_evt = 0.0;
    p->chip_step = -2;
    p->energy = 0.0;
    p->damage = 0.0;
    for (int a = 0; a < 3; a += 1) {
      p->bend[a] = 0.0;
      p->dent[a] = 0.0;
    }
    for (int a = 0; a < 6; a += 1) {
      p->ring[a] = 0.0;
      p->ring_d[a] = 0.0;
    }
    FB[i].state = 0;
  }
  g_shift[0] = g_shift[1] = g_shift[2] = 0.0;
  if (g_live_on) {
    plant_set_airframe(plant_airframe());
    g_live_on = 0;
  }
  g_nsamp = 0;
  g_ev_head = 0;
  g_ev_count = 0;
  g_ev_dropped = 0;
  g_flags_extra = 0;
  g_wet_step = -1000000;
  g_crown_step = -1000000;
  g_surf = SIM_SURF_DEFAULT;
  g_ground_mat = SIM_SURF_DEFAULT;
  g_crush_mask = 0;
  g_crushing = 0;
  g_capped_now = 0;
  g_last_contact_step = -1000000;
  g_spring_mask = 0;
  g_batch_spring = 0;
  g_soft_now = 0;
  for (int i = 0; i < SIM_PARTS_MAX; i += 1) {
    g_spring_npts[i] = 0;
    g_spring_npts_last[i] = 0;
  }
  effects_clear();
}

/* ---------------------------------------------------------------------
 * ATTRIBUTION. The solver's point is a box corner, or the shell's patch
 * arm; the real airframe meets the surface at the parts' hull support in
 * the contact's direction. Of the points within 5 mm of that support, the
 * one nearest the solver's point is taken, so a wall met on the left arm
 * is the left arm's, and a flat landing on eight corners is the pack's.
 * ------------------------------------------------------------------- */
#define ATTR_BAND 0.005

static int g_att_part = 0;
static double g_att_b[3];
static double g_att_nb[3]; /* the contact's normal, body frame */
static int g_hint = -1;

/* The solver is resolving the parts' own sampler k: it is that part's
 * contact, at that point. */
void crash_hint_sampler(int k) {
  g_hint = k;
}

static void attribute(const SimState *s, const double r[3], const double n[3]) {
  const Table *t = tab();
  qrot_inv(s->quat, n, g_att_nb);
  if (g_hint >= 0 && g_hint < g_nsamp) {
    g_att_part = g_samp_part[g_hint];
    g_att_b[0] = g_samp[g_hint][0];
    g_att_b[1] = g_samp[g_hint][1];
    g_att_b[2] = g_samp[g_hint][2];
    return;
  }
  const double mn[3] = { -n[0], -n[1], -n[2] };
  double d[3];
  qrot_inv(s->quat, mn, d);
  double rb[3];
  qrot_inv(s->quat, r, rb);
  double best = -1.0e9;
  for (int i = 0; i < t->n; i += 1) {
    if (!attached(i)) {
      continue;
    }
    for (int k = 0; k < t->p[i].npts; k += 1) {
      double p[3];
      live_pt(t->p[i].pts[k], p);
      const double h = dot(d, p);
      if (h > best) {
        best = h;
      }
    }
  }
  double near = 1.0e9;
  g_att_part = 0;
  g_att_b[0] = rb[0];
  g_att_b[1] = rb[1];
  g_att_b[2] = rb[2];
  for (int i = 0; i < t->n; i += 1) {
    if (!attached(i)) {
      continue;
    }
    for (int k = 0; k < t->p[i].npts; k += 1) {
      double p[3];
      live_pt(t->p[i].pts[k], p);
      if (dot(d, p) < best - ATTR_BAND) {
        continue;
      }
      const double e[3] = { p[0] - rb[0], p[1] - rb[1], p[2] - rb[2] };
      const double q = dot(e, e);
      if (q < near) {
        near = q;
        g_att_part = i;
        g_att_b[0] = p[0];
        g_att_b[1] = p[1];
        g_att_b[2] = p[2];
      }
    }
  }
}

int crash_part_at(const double b[3]) {
  const Table *t = tab();
  double near = 1.0e9;
  int best = 0;
  for (int i = 0; i < t->n; i += 1) {
    if (!attached(i)) {
      continue;
    }
    for (int k = 0; k < t->p[i].npts; k += 1) {
      double p[3];
      live_pt(t->p[i].pts[k], p);
      const double e[3] = { p[0] - b[0], p[1] - b[1], p[2] - b[2] };
      const double q = dot(e, e);
      if (q < near) {
        near = q;
        best = i;
      }
    }
  }
  return best;
}

/* ---------------------------------------------------------------------
 * THE BATCH: every contact of one step, or of one sim_contact_at, merged
 * per part, then judged once.
 * ------------------------------------------------------------------- */
#define HITS_MAX 48
typedef struct {
  int part;
  int surf;
  int force;        /* 1 a force note, 0 an impulse */
  double jn;        /* summed normal impulse, N s */
  double J[3];      /* summed impulse, world */
  double bsum[3];   /* impulse weighted point, body live */
  double rsum[3];   /* the solver's own point, impulse weighted, table
                     * frame: where the impulse was actually applied */
  double F[3];      /* a force note's summed force, world */
  double b[3];      /* a force note's point */
  double vin;       /* the largest closing speed */
  double n[3];
  int crush;        /* its impulses were capped: the part was crushing */
  int soft;         /* its impulses were the ground's spring's */
  double fc;        /* the plateau force it crushed at, N */
  int ground;       /* the ground plane's contact */
} Hit;

static Hit H[HITS_MAX];
static double g_bb[HITS_MAX][3]; /* each hit's point, body live, judge's */
static double g_blow[SIM_PARTS_MAX]; /* a struck blade's own root moment, N m */
static int g_nh = 0;
static double g_pre_vel[3];
static double g_pre_w[3];
static int g_batch_open = 0;

void crash_set_contact_surface(int mat) {
  g_surf = (mat >= 0 && mat <= SURF_OBSTACLE) ? mat : SIM_SURF_DEFAULT;
  g_surf_ground = 0;
}

void crash_set_ground_contact(void) {
  g_surf = g_ground_mat;
  g_surf_ground = 1;
}

/*
 * THE CRUSH AREA. The table's is the section a part crushes through when it
 * meets something with an edge or a corner first: the cowl's front for a
 * nose in, a pole's width of a wing's leading edge. A part that meets the
 * ground plane nearly flat on one of its faces, a belly slam, crushes over
 * as much of that face as meets it, half of it, faded in over the last 25
 * degrees to flat, and being larger takes far more before it gives.
 * Against an obstacle the plant does not know the shape it meets, and the
 * table's is used.
 */
#define CRUSH_PATCH 0.5
#define CRUSH_FLAT 0.90  /* cos 25 degrees */
static double crush_area(const Table *t, int i, const double nb[3], int ground) {
  const double a = t->p[i].crush_a;
  if (!ground) {
    return a;
  }
  const double sx = t->hi[i][0] - t->lo[i][0];
  const double sy = t->hi[i][1] - t->lo[i][1];
  const double sz = t->hi[i][2] - t->lo[i][2];
  const double face[3] = { sy * sz, sx * sz, sx * sy };
  double flat = 0.0;
  for (int k = 0; k < 3; k += 1) {
    double w = (sim_fabs(nb[k]) - CRUSH_FLAT) / (1.0 - CRUSH_FLAT);
    if (w < 0.0) w = 0.0;
    if (w > 1.0) w = 1.0;
    flat += w * CRUSH_PATCH * face[k];
  }
  return flat > a ? flat : a;
}

int crash_obstacle_surface(void) {
  return SURF_OBSTACLE;
}

int crash_ground_material(void) {
  return g_ground_mat;
}

static Hit *hit_get(int part, int force) {
  for (int h = 0; h < g_nh; h += 1) {
    if (H[h].part == part && H[h].force == force && H[h].surf == g_surf) {
      return &H[h];
    }
  }
  if (g_nh == HITS_MAX) {
    return 0;
  }
  Hit *h = &H[g_nh];
  g_nh += 1;
  h->part = part;
  h->surf = g_surf;
  h->force = force;
  h->jn = 0.0;
  h->vin = 0.0;
  h->crush = 0;
  h->soft = 0;
  h->fc = 0.0;
  h->ground = g_surf_ground;
  for (int a = 0; a < 3; a += 1) {
    h->J[a] = 0.0;
    h->bsum[a] = 0.0;
    h->rsum[a] = 0.0;
    h->F[a] = 0.0;
    h->b[a] = 0.0;
    h->n[a] = 0.0;
  }
  return h;
}

static double series_k(double a, double b) {
  return 1.0 / (1.0 / a + 1.0 / b);
}

/*
 * CRUSH IS WHAT MAKES A CONTACT LAST. A foam part struck harder than its
 * plateau stress over its crush area can take crushes at that stress: the
 * force on the craft is the plateau force for as long as the foam lasts,
 * and the craft keeps moving into the surface by the depth it crushes. So
 * while a part crushes, the normal impulse the solver may give it in one
 * batch is capped at the plateau force times the batch's time, the
 * restitution is zero (crushed cells give nothing back), and the solver's
 * position corrections stand aside (crash_crushing) so the craft can move
 * in. Under the plateau, which is a damage limit, none of this happens and
 * the contact is the rigid one it always was.
 */

int crash_crushing(void) {
  return g_crushing;
}

int crash_last_capped(void) {
  return g_capped_now;
}

void crash_contact_depth(double pen) {
  g_pen = pen > 0.0 ? pen : 0.0;
}

/*
 * THE GROUND IS A SPRING. A part that meets the ground plane does not stop
 * in the step it touches: it goes on into the surface until the part and
 * the ground, two springs in series (the k the joints are judged by), push
 * back as hard as it is coming in, F = k x at the depth x it has reached.
 * So while a part is driven into the ground its normal impulse in a batch
 * is at most k x dt, x the deepest of its points, shared by all of them;
 * the solver's position corrections stand aside, as for a crush, so it can
 * go in; and the impulse is never more than stops it there (no bias push).
 * That is the contact the judge has always assumed, F = sqrt(k J v), now
 * also the one the craft moves by: the peak at the CG is v sqrt(k m_eff)
 * over m, where the rigid contact put the whole change of speed into one
 * millisecond.
 *
 * Once the part has stopped going in (under SPRING_GOING, as a crush) the
 * contact is the rigid one again and the position corrections bring it out
 * of its depth, without the bias impulse that would throw it out: the
 * spring shapes the blow, not the rest. A contact the
 * spring already holds at the depth its point is at, a craft standing on
 * its belly, is rigid from the start.
 */
#define SPRING_GOING 0.05

/* The spring a part meets the ground through, at depth x: its own and the
 * surface's in series, k1, over its travel tr, and past that the stiffer
 * airframe behind it as well, k2. A stiff part's travel is unbounded. */
static double g_sp_k1, g_sp_k2, g_sp_tr;
static int g_sp_stiff = -1;       /* the stiffer part past the travel, or -1 */
static double g_sp_bstiff[3];     /* its point, body live */
static double g_sp_frac = 1.0;    /* the soft part's share of the force */

static double spring_force(double x) {
  if (!(x > g_sp_tr)) {
    return g_sp_k1 * x;
  }
  return g_sp_k1 * g_sp_tr + g_sp_k2 * (x - g_sp_tr);
}

static void spring_pre(int i, double vin, double kn, double *e_used, double *jn_cap) {
  const unsigned int bit = 1u << i;
  if (g_pen > g_batch_pen[i]) {
    g_batch_pen[i] = g_pen;
  }
  if (!(g_batch_spring & bit)) {
    const int going = (g_spring_mask & bit) && vin > SPRING_GOING;
    if (!going && (g_spring_mask & bit)) {
      /* Stopped in the ground: the rigid contact takes over, but it does
       * not throw the part back out of the depth it went to. */
      *e_used = 0.0;
      if (*jn_cap < 0.0 || *jn_cap > vin / kn) {
        *jn_cap = vin / kn;
      }
      return;
    }
    const int held = !((1.0 + *e_used) * vin / kn > spring_force(g_batch_pen[i]) * g_batch_dt);
    if (!going && held) {
      return;
    }
  }
  g_batch_spring |= bit;
  /* The part's force is shared by the points it meets the ground at, each
   * its share by its own depth, so a pack landed flat is pushed at its middle
   * whatever order the solver visits its corners in. */
  int known = 0;
  for (int q = 0; q < g_spring_npts[i] && !known; q += 1) {
    const double *b = g_spring_pts[i][q];
    known = b[0] == g_att_b[0] && b[1] == g_att_b[1] && b[2] == g_att_b[2];
  }
  if (!known && g_spring_npts[i] < SIM_PART_PTS_MAX) {
    for (int a = 0; a < 3; a += 1) {
      g_spring_pts[i][g_spring_npts[i]][a] = g_att_b[a];
    }
    g_spring_npts[i] += 1;
  }
  /* How many points it meets the ground at: those the last step met, and
   * in the first step of a contact its hull points within the attribution
   * band of its lowest, so the first corner the solver visits does not
   * take the whole blow on a pack landed flat. */
  int share = g_spring_npts_last[i];
  {
    const Table *t = tab();
    double hmax = -1.0e9;
    int band = 0;
    for (int q = 0; q < t->p[i].npts; q += 1) {
      double p[3];
      live_pt(t->p[i].pts[q], p);
      const double h = -dot(g_att_nb, p);
      if (h > hmax) hmax = h;
    }
    for (int q = 0; q < t->p[i].npts; q += 1) {
      double p[3];
      live_pt(t->p[i].pts[q], p);
      band += -dot(g_att_nb, p) >= hmax - ATTR_BAND;
    }
    if (band > share) share = band;
  }
  if (share < 1) share = 1;
  {
    const double x = g_batch_pen[i];
    const double ft = spring_force(x);
    g_sp_frac = x > g_sp_tr && ft > 0.0 ? g_sp_k1 * x / ft : 1.0;
  }
  double cap = spring_force(g_batch_pen[i]) * g_batch_dt - g_crush_used[i];
  const double own = spring_force(g_pen) * g_batch_dt / (double)share;
  if (cap > own) {
    cap = own;
  }
  if (cap < 0.0) {
    cap = 0.0;
  }
  if (cap > vin / kn) {
    cap = vin / kn;
  }
  *e_used = 0.0;
  *jn_cap = cap;
  g_capped_now = 1;
  g_crushing = 1;
  g_soft_now = 1;
}

void crash_contact_pre(const SimState *s, const double r[3], const double n[3],
                       double vin, double kn, double *e_used, double *jn_cap) {
  g_capped_now = 0;
  g_soft_now = 0;
  if (!SIM_DAMAGE) {
    return;
  }
  attribute(s, r, n);
  if (g_surf_ground) {
    /* The depth the spring is at is the part's own point's: the solver's
     * box corner can stand some way past a round prop disc or a tapered
     * nose, and a spring taken at the corner's depth pushes as if the part
     * were that far in. */
    double rb[3];
    qrot_inv(s->quat, r, rb);
    const double past = dot(g_att_nb, g_att_b) - dot(g_att_nb, rb);
    g_pen = past > 0.0 && past < g_pen ? g_pen - past : (past > 0.0 ? 0.0 : g_pen);
  }
  const Table *t = tab();
  const int i = g_att_part;
  const PartDef *d = &t->p[i];
  const PartState *p = &PS[i];
  if (!(kn > 0.0) || !g_batch_open) {
    return;
  }
  const double k = series_k(d->k, SURF[g_surf].k);
  if (d->crush_s > 0.0 && p->crush < d->crush_d) {
    /* Against the ground the whole craft is driven into the part, which is
     * the momentum the batch's merged impulse shows; against an obstacle it
     * is the point's own effective mass. */
    const double m_dec = g_surf_ground ? PLANT.mass_kg : 1.0 / kn;
    const double f = vin * sim_sqrt(k * m_dec);
    double nb[3];
    qrot_inv(s->quat, n, nb);
    const double fc = d->crush_s * crush_area(t, i, nb, g_surf_ground);
    /* Crushing already, the front keeps advancing while the part is driven
     * in at all; a new impact starts it only past the plateau; and once a
     * part crushes in a batch every contact it takes in that batch shares
     * the plateau's budget, or a point met after the first would be stopped
     * rigidly in its place. */
    const unsigned int bit = 1u << i;
    const int going = ((g_crush_mask & bit) && vin > 0.05) || (g_batch_crush & bit);
    if (f > fc || going) {
      g_batch_crush |= bit;
      *e_used = 0.0;
      g_capped_fc = fc;
      double cap = fc * g_batch_dt - g_crush_used[i];
      if (cap < 0.0) {
        cap = 0.0;
      }
      *jn_cap = cap;
      g_capped_now = 1;
      g_crushing = 1;
      return;
    }
  }
  /* A part meets the ground through its own spring and the surface's in
   * series. It gives until the stiffer airframe behind it meets the
   * ground too: its travel is how far it stands out past the stiffer parts
   * along the contact, from the parts' own hulls, and past it the one of
   * them that stands out furthest adds its spring. The stiffest part has no
   * travel to run out of. A slender wire (a whip, a gear leg) keeps the
   * rigid contact: loaded along its length it buckles and folds over,
   * which is not a spring, and what it then carries is not in the tables
   * (round 3 sprung it too, and the taildraggers' wire gear broke the wing
   * off on a nose over and the five inch's whip broke on its back, both
   * against their references). The whoop the shell flies
   * lives in a room scaled 3.43 times, whose floor the surfaces table does
   * not scale; it keeps the rigid contact. */
  if (!g_surf_ground || tab() == &T_WHOOP_SCALED) {
    return;
  }
  if (d->mat == SIM_MAT_WIRE) {
    return;
  }
  g_sp_k1 = k;
  g_sp_k2 = k;
  g_sp_tr = 1.0e9;
  g_sp_stiff = -1;
  g_sp_frac = 1.0;
  const double mn[3] = { -n[0], -n[1], -n[2] };
  double db[3];
  qrot_inv(s->quat, mn, db);
  double h_part = -1.0e9, h_stiff = -1.0e9;
  int stiff = -1;
  for (int j = 0; j < t->n; j += 1) {
    if (!attached(j) || !(t->p[j].k > d->k)) {
      continue;
    }
    for (int q = 0; q < t->p[j].npts; q += 1) {
      double p[3];
      live_pt(t->p[j].pts[q], p);
      const double h = dot(db, p);
      if (h > h_stiff) {
        h_stiff = h;
        stiff = j;
        g_sp_bstiff[0] = p[0];
        g_sp_bstiff[1] = p[1];
        g_sp_bstiff[2] = p[2];
      }
    }
  }
  if (stiff >= 0) {
    for (int q = 0; q < d->npts; q += 1) {
      double p[3];
      live_pt(d->pts[q], p);
      const double h = dot(db, p);
      if (h > h_part) {
        h_part = h;
      }
    }
    g_sp_tr = h_part > h_stiff ? h_part - h_stiff : 0.0;
    g_sp_k2 = k + series_k(t->p[stiff].k, SURF[g_surf].k);
    g_sp_stiff = stiff;
  }
  spring_pre(i, vin, kn, e_used, jn_cap);
}

/*
 * THE FACE A PART SLIDES ON. A part that meets the ground flat on one of
 * its faces, within 25 degrees as a belly slam's crush is taken, slides on
 * it as a sled does; one driven in on an edge, a corner or a tip (a nose
 * dug in, a wing tip, a blade) ploughs, the shell's grip. Faded between the
 * two over those 25 degrees, as crush_area fades its patch in.
 */
static double flatness(const Table *t, int i, const double nb[3]) {
  const double sx = t->hi[i][0] - t->lo[i][0];
  const double sy = t->hi[i][1] - t->lo[i][1];
  const double sz = t->hi[i][2] - t->lo[i][2];
  const double face[3] = { sy * sz, sx * sz, sx * sy };
  double flat = 0.0;
  for (int k = 0; k < 3; k += 1) {
    if (!(face[k] > 0.0)) {
      continue;
    }
    double w = (sim_fabs(nb[k]) - CRUSH_FLAT) / (1.0 - CRUSH_FLAT);
    if (w < 0.0) w = 0.0;
    if (w > 1.0) w = 1.0;
    if (w > flat) flat = w;
  }
  return flat;
}

static double face_mu(int surf, double flat, double mu) {
  const double mf = SURF[surf].mu_face;
  return mf < mu ? mu + flat * (mf - mu) : mu;
}

double crash_contact_mu(double mu) {
  if (!SIM_DAMAGE || !g_surf_ground) {
    return mu;
  }
  return face_mu(g_surf, flatness(tab(), g_att_part, g_att_nb), mu);
}

static double g_ground_jn = 0.0; /* this step's normal impulse on the ground */

double crash_settle_share(double w) {
  if (!(w > 0.0) || !(g_ground_jn < w)) {
    return 0.0;
  }
  return 1.0 - g_ground_jn / w;
}

double crash_settle_mu(const SimState *s, const double n[3], double mu) {
  const double at[3] = { 0.0, 0.0, 0.0 };
  attribute(s, at, n);
  return face_mu(g_ground_mat, flatness(tab(), g_att_part, g_att_nb), mu);
}

static void hit_add(Hit *h, double jn, const double jt[3], const double n[3], const double b[3],
                    const double rb[3], double vin) {
  h->jn += jn;
  for (int a = 0; a < 3; a += 1) {
    h->J[a] += jn * n[a] + jt[a];
    h->bsum[a] += jn * b[a];
    h->rsum[a] += jn * (rb[a] + g_shift[a]);
  }
  if (vin > h->vin) {
    h->vin = vin;
  }
  if (h->n[0] == 0.0 && h->n[1] == 0.0 && h->n[2] == 0.0) {
    h->n[0] = n[0];
    h->n[1] = n[1];
    h->n[2] = n[2];
  }
}

void crash_contact_post(const SimState *s, const double r[3], const double n[3],
                        double vin, double kn, double jn, const double jt[3]) {
  (void)kn;
  if (!SIM_DAMAGE || !g_batch_open) {
    return;
  }
  Hit *h = hit_get(g_att_part, 0);
  if (!h) {
    return;
  }
  if (g_surf_ground && g_from_step) {
    g_ground_jn += jn;
  }
  if (g_capped_now) {
    g_crush_used[g_att_part] += jn;
    if (g_soft_now) {
      h->soft = 1;
    } else {
      h->crush = 1;
      h->fc = g_capped_fc;
    }
  }
  double rb[3];
  qrot_inv(s->quat, r, rb);
  /* Past a soft part's travel the stiffer part behind it bears the rest of
   * the spring's force at its own point: the soft part carries only its
   * own spring's share through its joint. */
  double f = 1.0;
  if (g_soft_now && g_sp_stiff >= 0 && g_sp_frac < 1.0) {
    f = g_sp_frac;
    Hit *hs = hit_get(g_sp_stiff, 0);
    if (hs) {
      const double js[3] = { (1.0 - f) * jt[0], (1.0 - f) * jt[1], (1.0 - f) * jt[2] };
      hs->soft = 1;
      hit_add(hs, (1.0 - f) * jn, js, n, g_sp_bstiff, rb, vin);
    } else {
      f = 1.0;
    }
  }
  const double jp[3] = { f * jt[0], f * jt[1], f * jt[2] };
  hit_add(h, f * jn, jp, n, g_att_b, rb, vin);
}

void crash_force_note(const SimState *s, const double r[3], const double F[3], int part) {
  if (!SIM_DAMAGE || !g_batch_open || part < 0) {
    return;
  }
  Hit *h = hit_get(part, 1);
  if (!h) {
    return;
  }
  double b[3];
  qrot_inv(s->quat, r, b);
  const double fm = norm(F);
  const double w0 = norm(h->F);
  for (int a = 0; a < 3; a += 1) {
    /* The point, weighted by force. */
    h->b[a] = (w0 + fm) > 0.0 ? (h->b[a] * w0 + b[a] * fm) / (w0 + fm) : b[a];
    h->F[a] += F[a];
  }
  if (fm > 0.0 && h->n[0] == 0.0 && h->n[1] == 0.0 && h->n[2] == 0.0) {
    h->n[0] = F[0] / fm;
    h->n[1] = F[1] / fm;
    h->n[2] = F[2] / fm;
  }
}

/* The table's wheel index to its part: wheels and the prop's skid. */
int crash_wheel_part(int w) {
  if (w < 0 || w >= SIM_WHEELS_MAX) {
    return -1;
  }
  return tab()->wheel_part[w];
}

int crash_float_part(int f) {
  if (f < 0 || f > 1) {
    return -1;
  }
  return tab()->float_part[f];
}

void crash_batch_begin(const SimState *s, int from_step) {
  if (!SIM_DAMAGE) {
    return;
  }
  g_nh = 0;
  g_batch_open = 1;
  g_crushing = 0;
  g_batch_crush = 0;
  g_batch_spring = 0;
  g_from_step = from_step;
  if (from_step) {
    g_ground_jn = 0.0;
    for (int i = 0; i < SIM_PARTS_MAX; i += 1) {
      g_spring_npts_last[i] = g_spring_npts[i];
      g_spring_npts[i] = 0;
    }
  }
  /* A step is a millisecond. A host's contact call stands for the time
   * since its last one, which is a frame's steps, and at most 20 ms. */
  if (from_step) {
    g_batch_dt = SIM_DT;
  } else {
    long long gap = s->step_index - g_last_contact_step;
    if (gap < 1) gap = 1;
    if (gap > 20) gap = 20;
    g_batch_dt = SIM_DT * (double)gap;
    g_last_contact_step = s->step_index;
  }
  for (int i = 0; i < SIM_PARTS_MAX; i += 1) {
    g_crush_used[i] = 0.0;
    g_batch_pen[i] = 0.0;
  }
  for (int a = 0; a < 3; a += 1) {
    g_pre_vel[a] = s->vel[a];
    g_pre_w[a] = s->omega[a];
  }
}

/* ---------------------------------------------------------------------
 * DAMAGE BELOW THE BREAK, per material. docs/CRASH-STAGE1.md, Damage.
 * ------------------------------------------------------------------- */
#define ARM_BEND_ONSET 0.60   /* a carbon arm twisting in its clamp */
#define ARM_BEND_MAX 0.10     /* rad of thrust axis tilt at the break */
#define WIRE_BEND_ONSET 0.45  /* music wire yields at 1 / 2.21 of the break */
#define WIRE_BEND_MAX 0.20
#define ALU_BEND_ONSET 0.70   /* 6061 yields at 276 of 310 MPa, less the
                               * section's shape factor */
#define ALU_BEND_MAX 0.15
#define KNOCK_ONSET 0.50      /* a camera turns in its mount */
#define KNOCK_MAX 0.60
#define CHIP_ONSET 0.33       /* a blade yields, bends and nicks, at a
                               * third of its shearing off */
#define CRACK_ONSET 0.70      /* a brittle joint cracks before it fails */
#define CRACK_LOSS 0.50       /* strength a crack at the break would take */
#define CHIP_SPIN_T 0.20      /* s of a (100 m/s)^2 tip on concrete to lose
                               * a blade set */
/*
 * A spinning blade chips only where its tip's impact stress passes the
 * blade's strength. A blade tip meeting a surface at v is loaded, for the
 * first instant, by the elastic impact of two half spaces, sigma = v Z_b
 * Z_s / (Z_b + Z_s), Z = rho c the acoustic impedance of each (Goldsmith,
 * Impact, 1960, ch. 4; Johnson, Impact Strength of Materials, 1972). The
 * blade is glass filled nylon, PA6 GF30 conditioned: rho 1360 kg/m^3, E
 * 7.5 GPa, tensile strength 120 MPa (the typical datasheet range, dry to
 * conditioned, is 9.5 to 6 GPa and 185 to 120 MPa; the weaker end, since
 * a prop in service has taken up moisture). The surface's impedance is
 * its blade hardness times concrete's, 2400 kg/m^3 at 3750 m/s. On
 * concrete that puts the limit at a 51 m/s tip, on grass, snow, foliage
 * and water past any tip speed a hobby prop reaches, which is what pilots
 * see: props that touch grass at full power come back unmarked, props that
 * touch concrete at hover come back nicked. Under the limit a spinning
 * contact writes nothing at all. docs/CRASH-STAGE1.md, Damage.
 */
#define BLADE_Z 3.194e6       /* sqrt(E rho), Pa s/m */
#define CONCRETE_Z 9.0e6
#define BLADE_STRENGTH 120.0e6
/* A whoop's blades are polycarbonate, Makrolon 2407 (R-PROPS): 2400 MPa,
 * 1200 kg/m^3, yield 66 MPa. PC yields rather than cracks, and the yield is
 * where a blade starts to bend and nick. */
#define PC_BLADE_Z 1.697e6
#define PC_BLADE_STRENGTH 66.0e6
#define BEARING_SHARE 0.02    /* a seating push, against the joint's limit */
#define SEAT_GRIP 1.00        /* friction of a seated face on a rubber pad */

static double part_damage(int i) {
  const Table *t = tab();
  const PartDef *d = &t->p[i];
  const PartState *p = &PS[i];
  if (!attached(i)) {
    return 1.0;
  }
  double dmg = 1.0 - p->strength;
  if (d->kind == SIM_PART_PROP && p->chip > dmg) {
    dmg = p->chip;
  }
  if (d->crush_d > 0.0 && p->crush / d->crush_d > dmg) {
    dmg = p->crush / d->crush_d;
  }
  const double b = norm(p->bend);
  double bmax = ARM_BEND_MAX;
  if (d->kind == SIM_PART_CAMERA || d->kind == SIM_PART_ANTENNA) {
    bmax = KNOCK_MAX;
  } else if (d->mat == SIM_MAT_WIRE) {
    bmax = WIRE_BEND_MAX;
  } else if (d->mat == SIM_MAT_ALU) {
    bmax = ALU_BEND_MAX;
  }
  if (b / bmax > dmg) {
    dmg = b / bmax;
  }
  return dmg > 1.0 ? 1.0 : dmg;
}

/* How far past a behaviour's onset a load ratio is, 0..1. */
static double past(double rho, double onset) {
  if (!(rho > onset)) {
    return 0.0;
  }
  const double f = (rho - onset) / (1.0 - onset);
  return f > 1.0 ? 1.0 : f;
}

/* A new peak on a part under its break: what its material does. Returns
 * the event type, 0 for none, and in *energy what it absorbed. M is the
 * joint moment, body frame. */
static int below_break(int i, double rho, const double M[3], double *energy) {
  const Table *t = tab();
  const PartDef *d = &t->p[i];
  PartState *p = &PS[i];
  const double prev = p->peak_max;
  if (!(rho > prev)) {
    return 0;
  }
  p->peak_max = rho;
  *energy = 0.0;
  const double mm = norm(M);
  double axis[3] = { 0.0, 1.0, 0.0 };
  if (mm > 0.0) {
    axis[0] = M[0] / mm;
    axis[1] = M[1] / mm;
    axis[2] = M[2] / mm;
  }
  if (d->kind == SIM_PART_CAMERA || d->kind == SIM_PART_ANTENNA) {
    const double da = KNOCK_MAX * (past(rho, KNOCK_ONSET) - past(prev, KNOCK_ONSET));
    if (!(da > 0.0)) {
      return 0;
    }
    for (int a = 0; a < 3; a += 1) {
      p->bend[a] -= da * axis[a];
    }
    return SIM_EVENT_KNOCK;
  }
  if (d->kind == SIM_PART_PROP) {
    const double dc = 0.5 * (past(rho, CHIP_ONSET) - past(prev, CHIP_ONSET));
    if (!(dc > 0.0)) {
      return 0;
    }
    p->chip += dc;
    return SIM_EVENT_CHIP;
  }
  double onset = -1.0, bmax = 0.0;
  if (d->kind == SIM_PART_ARM) {
    onset = ARM_BEND_ONSET;
    bmax = ARM_BEND_MAX;
  } else if (d->mat == SIM_MAT_WIRE) {
    onset = WIRE_BEND_ONSET;
    bmax = WIRE_BEND_MAX;
  } else if (d->mat == SIM_MAT_ALU && (d->kind == SIM_PART_BOOM || d->kind == SIM_PART_GEAR)) {
    onset = ALU_BEND_ONSET;
    bmax = ALU_BEND_MAX;
  }
  if (onset > 0.0) {
    const double da = bmax * (past(rho, onset) - past(prev, onset));
    if (!(da > 0.0)) {
      return 0;
    }
    /* The joint yields the way the load turned it. M is the moment the
     * parent puts into the part, so the load's own turn is minus it. */
    for (int a = 0; a < 3; a += 1) {
      p->bend[a] -= da * axis[a];
    }
    /* Plastic work: the moment it yields under through the turn it took. */
    *energy = mm * da;
    p->energy += *energy;
    return SIM_EVENT_BEND;
  }
  const double dl = CRACK_LOSS * (past(rho, CRACK_ONSET) - past(prev, CRACK_ONSET));
  if (!(dl > 0.0)) {
    return 0;
  }
  p->strength *= 1.0 - dl;
  return SIM_EVENT_CRACK;
}

/* One impulse on the craft at body point b, world impulse J. */
static void craft_push(SimState *s, const double b[3], const double J[3]) {
  const double invm = 1.0 / PLANT.mass_kg;
  for (int a = 0; a < 3; a += 1) {
    s->vel[a] += J[a] * invm;
  }
  double Jb[3];
  qrot_inv(s->quat, J, Jb);
  double tau[3];
  cross(b, Jb, tau);
  for (int a = 0; a < 3; a += 1) {
    s->omega[a] += tau[a] / PLANT.inertia[a];
  }
}

#define BREAKS_MAX 8
typedef struct {
  int part;
  double rho, F, M;
  int contact_side;
  int forced;
} Break;

/* Detach the parts under a broken joint that are still attached, with the
 * motion the craft had after the step's impulses, or, for a part that left
 * because the rest was stopped under it, the motion it kept. */
static void detach(SimState *s, const Break *bk) {
  const Table *t = tab();
  unsigned int mask = 0;
  for (int i = 0; i < t->n; i += 1) {
    if ((t->sub[bk->part] & (1u << i)) && attached(i)) {
      mask |= 1u << i;
    }
  }
  if (!mask) {
    return;
  }
  double v[3], w[3];
  const double keep = bk->rho > 1.0 ? 1.0 - 1.0 / bk->rho : 0.0;
  for (int a = 0; a < 3; a += 1) {
    if (bk->contact_side || bk->forced) {
      v[a] = s->vel[a];
      w[a] = s->omega[a];
    } else {
      v[a] = s->vel[a] + keep * (g_pre_vel[a] - s->vel[a]);
      w[a] = s->omega[a] + keep * (g_pre_w[a] - s->omega[a]);
    }
  }
  fb_spawn(s, mask, v, w);
  for (int i = 0; i < t->n; i += 1) {
    if (mask & (1u << i)) {
      PS[i].damage = 1.0;
    }
  }
}

/*
 * WHAT A BREAK ABSORBS: the strain energy the part held at its limit, the
 * load it failed under through its own stiffness, F^2 / 2k for a force and
 * (M / L)^2 / 2k for a moment, with L the reach from the joint to the
 * part's farthest hull point, the lever its tip stiffness is taken at. The
 * five inch arm gives 1.97 J, R-ARM's derivation 2.5. A break forced by a
 * spent blade or by the host fails in bending.
 */
static double break_energy(const Break *bk) {
  const Table *t = tab();
  const PartDef *d = &t->p[bk->part];
  const double st = PS[bk->part].strength;
  if (!(d->k > 0.0)) {
    return 0.0;
  }
  double reach = 0.0;
  for (int k = 0; k < d->npts; k += 1) {
    const double e[3] = { d->pts[k][0] - d->joint[0], d->pts[k][1] - d->joint[1], d->pts[k][2] - d->joint[2] };
    const double r = norm(e);
    if (r > reach) reach = r;
  }
  const double fm = d->f_max * st;
  const double mm = d->m_max * st;
  const int bending = bk->forced || !(bk->F / fm > bk->M / mm);
  if (bending) {
    if (!(reach > 0.0)) {
      return 0.0;
    }
    const double f = mm / reach;
    return f * f / (2.0 * d->k);
  }
  return fm * fm / (2.0 * d->k);
}

static void world_of(const SimState *s, const double b[3], double out[3]) {
  qrot(s->quat, b, out);
  out[0] += s->pos[0];
  out[1] += s->pos[1];
  out[2] += s->pos[2];
}

/* The last judged batch's hits, for the plant tests: part, force body,
 * point body, closing speed, impulse, crushing. 11 doubles each. */
static double g_dbg[HITS_MAX][11];
static int g_ndbg = 0;
SIM_EXPORT int sim_crash_debug(double *out, int max) {
  int n = 0;
  for (; n < g_ndbg && n < max; n += 1) {
    for (int k = 0; k < 11; k += 1) out[11 * n + k] = g_dbg[n][k];
  }
  return n;
}

/* The craft's rigid body response to the batch's contact loads F (forces,
 * or impulses for the momentum they carry), body frame, each scaled by
 * sc, over the mass m still on. */
static void craft_accel(const double F[][3], const double *sc, double m, double acc[3], double alp[3]) {
  double Ft[3] = { 0.0, 0.0, 0.0 }, tau[3] = { 0.0, 0.0, 0.0 };
  for (int h = 0; h < g_nh; h += 1) {
    const double f[3] = { sc[h] * F[h][0], sc[h] * F[h][1], sc[h] * F[h][2] };
    double c[3];
    cross(g_bb[h], f, c);
    for (int a = 0; a < 3; a += 1) {
      Ft[a] += f[a];
      tau[a] += c[a];
    }
  }
  for (int a = 0; a < 3; a += 1) {
    acc[a] = Ft[a] / m;
    alp[a] = tau[a] / PLANT.inertia[a];
  }
}

/* Joint j's load, body frame: what its subtree's share of the craft's
 * motion asks of it, less the contacts on the subtree itself. Returns 1
 * when a contact is on the subtree (the joint is on a load path). */
static int joint_load(const Table *t, int j, const double F[][3], const double *sc, unsigned int gone,
                      const double acc[3], const double alp[3], double Fj[3], double Mj[3]) {
  const int n = t->n;
  int path = 0;
  double pj[3];
  live_pt(t->p[j].joint, pj);
  for (int a = 0; a < 3; a += 1) {
    Fj[a] = 0.0;
    Mj[a] = 0.0;
  }
  for (int i = 0; i < n; i += 1) {
    if (!(t->sub[j] & (1u << i)) || !attached(i) || (gone & (1u << i))) {
      continue;
    }
    double ci[3];
    live_pt(t->cg[i], ci);
    double ai[3];
    cross(alp, ci, ai);
    const double mi = t->p[i].mass;
    double fi[3];
    for (int a = 0; a < 3; a += 1) {
      fi[a] = mi * (acc[a] + ai[a]);
      Fj[a] += fi[a];
    }
    const double arm[3] = { ci[0] - pj[0], ci[1] - pj[1], ci[2] - pj[2] };
    double c[3];
    cross(arm, fi, c);
    for (int a = 0; a < 3; a += 1) Mj[a] += c[a];
  }
  for (int h = 0; h < g_nh; h += 1) {
    if (!(t->sub[j] & (1u << H[h].part))) {
      continue;
    }
    if (sc[h] > 0.0) {
      path = 1;
    }
    const double f[3] = { sc[h] * F[h][0], sc[h] * F[h][1], sc[h] * F[h][2] };
    const double arm[3] = { g_bb[h][0] - pj[0], g_bb[h][1] - pj[1], g_bb[h][2] - pj[2] };
    double c[3];
    cross(arm, f, c);
    for (int a = 0; a < 3; a += 1) {
      Fj[a] -= f[a];
      Mj[a] -= c[a];
    }
  }
  return path;
}

/* A joint carries a push that seats the part on its parent in bearing, the
 * part's face against the frame's, not through its strap or screws: a pack
 * under the frame landed on is pressed into it, not torn off. That
 * component counts at BEARING_SHARE, the seated push grips the pad before
 * the strap takes a sideways load, and a push inside the seat's footprint
 * does not lever the part off. The magnitudes the limits are held to. */
static void seat_load(const Table *t, int j, const double Fj[3], const double Mj[3], double *fm_out, double *mm_out) {
  double fm = norm(Fj);
  double mm = norm(Mj);
  double pj[3], cj[3];
  live_pt(t->p[j].joint, pj);
  live_pt(t->cg[j], cj);
  const double u[3] = { cj[0] - pj[0], cj[1] - pj[1], cj[2] - pj[2] };
  const double ul = norm(u);
  if (ul > 1e-6) {
    const double fb = dot(Fj, u) / ul;
    if (fb > 0.0) {
      const double perp2 = fm * fm - fb * fb;
      double perp = sim_sqrt(perp2 > 0.0 ? perp2 : 0.0) - SEAT_GRIP * fb;
      if (perp < 0.0) perp = 0.0;
      const double seat = fb * BEARING_SHARE;
      fm = sim_sqrt(perp * perp + seat * seat);
      mm -= fb * t->seat[j];
      if (mm < 0.0) mm = 0.0;
    }
  }
  *fm_out = fm;
  *mm_out = mm;
}

static void judge(SimState *s) {
  const Table *t = tab();
  const int n = t->n;
  for (int i = 0; i < SIM_PARTS_MAX; i += 1) {
    g_blow[i] = 0.0;
  }
  double Fb[HITS_MAX][3];
  double (*bb)[3] = g_bb;
  double sc[HITS_MAX];
  int changed = 0;
  Break brk[BREAKS_MAX];
  int nbrk = 0;
  /* Forces: an impulse through the spring of the part and the surface in
   * series, F = sqrt(k J v), the peak of a linear contact that takes the
   * momentum J at closing speed v; a note's force as it came. */
  for (int h = 0; h < g_nh; h += 1) {
    Hit *x = &H[h];
    const int i = x->part;
    const PartDef *d = &t->p[i];
    PartState *p = &PS[i];
    double Fw[3];
    double nb[3];
    qrot_inv(s->quat, x->n, nb);
    sc[h] = 1.0;
    if (!x->force) {
      if (!(x->jn > 0.0)) {
        sc[h] = 0.0;
        Fb[h][0] = Fb[h][1] = Fb[h][2] = 0.0;
        bb[h][0] = bb[h][1] = bb[h][2] = 0.0;
        continue;
      }
      for (int a = 0; a < 3; a += 1) {
        bb[h][a] = x->bsum[a] / x->jn;
      }
      const double k = series_k(d->k, SURF[x->surf].k);
      double fp = sim_sqrt(k * x->jn * x->vin);
      const double en = 0.5 * x->jn * x->vin;
      if (x->soft) {
        /* The spring's force is the force: what the solver gave it. */
        fp = x->jn / g_batch_dt;
      } else if (x->crush && attached(i)) {
        /* Crushing: the force is the plateau's, and the front advanced as
         * far as the part moved into the surface in the batch. */
        const double fc = x->fc;
        double dl = x->vin * g_batch_dt;
        const double avail = d->crush_d - p->crush;
        if (dl > avail) dl = avail;
        const int first = !(g_crush_mask & (1u << i));
        p->crush += dl;
        p->energy += fc * dl;
        for (int a = 0; a < 3; a += 1) {
          p->dent[a] += dl * nb[a];
        }
        g_crush_mask |= 1u << i;
        fp = x->jn / g_batch_dt;
        p->damage = part_damage(i);
        changed = 1;
        if (first || !(p->crush < d->crush_d)) {
          double pw[3];
          world_of(s, bb[h], pw);
          event_push(s, i, SIM_EVENT_CRUSH, sim_sqrt(k * x->jn * x->vin) / fc, fc, 0.0, p->energy, pw, x->n, x->vin, x->surf);
        }
      } else if (d->crush_s > 0.0 && p->crush < d->crush_d && attached(i)) {
        const double fc = d->crush_s * crush_area(t, i, nb, x->ground);
        if (fp > fc) {
          const double el = fc * fc / (2.0 * k);
          double dl = (en - el) / fc;
          const double avail = d->crush_d - p->crush;
          double absorbed;
          const double f0 = fp;
          if (dl <= avail) {
            absorbed = fc * dl;
            fp = fc;
          } else {
            dl = avail;
            absorbed = fc * avail;
            /* Bottomed out: the rest meets the structure behind the foam,
             * ten times stiffer. */
            double rest = en - el - absorbed;
            if (rest < 0.0) rest = 0.0;
            fp = sim_sqrt(2.0 * 10.0 * k * rest);
            if (fp < fc) fp = fc;
          }
          p->crush += dl;
          p->energy += absorbed;
          for (int a = 0; a < 3; a += 1) {
            p->dent[a] += dl * nb[a];
          }
          p->damage = part_damage(i);
          double pw[3];
          world_of(s, bb[h], pw);
          event_push(s, i, SIM_EVENT_CRUSH, f0 / fc, f0, 0.0, absorbed, pw, x->n, x->vin, x->surf);
          changed = 1;
        }
      }
      const double scale = fp / x->jn;
      for (int a = 0; a < 3; a += 1) {
        Fw[a] = x->J[a] * scale;
      }
    } else {
      for (int a = 0; a < 3; a += 1) {
        Fw[a] = x->F[a];
        bb[h][a] = x->b[a];
      }
    }
    qrot_inv(s->quat, Fw, Fb[h]);
    /* A spinning prop in the contact: the blade tips meet the surface at
     * their own speed, whatever the craft's, and the harder the surface
     * the faster they go. */
    if (d->kind == SIM_PART_PROP && d->motor >= 0 && attached(i) && norm(Fw) > 0.0) {
      const double w = s->motor_omega[d->motor];
      double span = t->hi[i][1] - t->lo[i][1];
      if (t->hi[i][0] - t->lo[i][0] > span) span = t->hi[i][0] - t->lo[i][0];
      /* The whoop the shell flies is a model L times life size with time
       * unscaled, so its speeds are L times a real whoop's; stresses scale
       * by M / L and impedances by M / L^2, which puts the blade's limit at
       * L times the real tip speed. So the tip is taken back to life size
       * and met with the real blade and the real surface. */
      const double life = tab() == &T_WHOOP_SCALED ? WHOOP_L : 1.0;
      const double tip = sim_fabs(w) * 0.5 * span / life;
      const double zb = d->mat == SIM_MAT_PC ? PC_BLADE_Z : BLADE_Z;
      const double strength = d->mat == SIM_MAT_PC ? PC_BLADE_STRENGTH : BLADE_STRENGTH;
      const double zs = SURF[x->surf].hard * CONCRETE_Z;
      const double sigma = tip * zb * zs / (zb + zs);
      /* Past the limit the chip grows at the old rate, faded in from
       * nothing at the limit so the damage is continuous in the load. */
      const double over = sigma > strength ? 1.0 - strength / sigma : 0.0;
      /* Past the limit the surface stops the tip rather than giving way,
       * and the blade is stopped by its own spring: the tip's blow is
       * v sqrt(k m), its effective mass a third of a blade's (a rod turned
       * about the hub, struck at its end) and k the blade's tip stiffness
       * and the surface's in series, at the tip's own speed (the model's,
       * for the whoop the shell flies, whose limits are scaled with it).
       * It bends the blade at its root, the lever its radius. */
      if (over > 0.0) {
        const int nb = d->blades > 0 ? d->blades : 2;
        const double m_tip = d->mass / (3.0 * (double)nb);
        const double k_tip = series_k(d->k, SURF[x->surf].k);
        const double blow = tip * life * sim_sqrt(k_tip * m_tip) * 0.5 * span;
        if (blow > g_blow[i]) {
          g_blow[i] = blow;
        }
      }
      const double vt = tip / 100.0;
      const double dc = vt * vt * SURF[x->surf].hard * SIM_DT / CHIP_SPIN_T * over;
      if (dc > 0.0) {
        /* A spinning contact is one event when it starts and one more for
         * every 0.05 of chip after, so a flight with no event is a flight
         * no chip was written in. A blade bouncing on the surface touches
         * every few steps; within 20 ms of its last touch it is the same
         * strike, the window a host's contact call stands for. */
        const int starts = p->chip_step < s->step_index - 20;
        p->chip_step = s->step_index;
        p->chip += dc;
        changed = 1;
        if (p->chip >= 1.0) {
          p->chip = 1.0;
          if (nbrk < BREAKS_MAX) {
            brk[nbrk].part = i;
            brk[nbrk].rho = 1.0;
            brk[nbrk].F = norm(Fw);
            brk[nbrk].M = 0.0;
            brk[nbrk].contact_side = 1;
            brk[nbrk].forced = 1;
            nbrk += 1;
          }
        } else if (starts || p->chip - p->chip_evt >= 0.05) {
          p->chip_evt = p->chip;
          p->damage = part_damage(i);
          double pw[3];
          world_of(s, bb[h], pw);
          event_push(s, i, SIM_EVENT_CHIP, sigma / strength, norm(Fw), 0.0, 0.0, pw, x->n, x->vin, x->surf);
        }
      }
    }
  }

  g_ndbg = g_nh;
  for (int h = 0; h < g_nh; h += 1) {
    g_dbg[h][0] = (double)H[h].part;
    for (int a = 0; a < 3; a += 1) {
      g_dbg[h][1 + a] = Fb[h][a];
      g_dbg[h][4 + a] = bb[h][a];
    }
    g_dbg[h][7] = H[h].vin;
    g_dbg[h][8] = H[h].jn;
    g_dbg[h][9] = (double)H[h].crush;
    g_dbg[h][10] = (double)H[h].force;
  }

  /* The joints: the free body diagram of each part's subtree. The rest of
   * the craft decelerates as a rigid body under every contact; a subtree
   * has to be given its share of that through its joint, less the contact
   * forces that act on it directly. Weakest link first: when a joint
   * fails, the loads that went through it are capped at what it carried,
   * and the rest is judged again without it. A panel that rings (a wing on
   * its spar) is loaded through its first bending mode, below. */
  double Jb[HITS_MAX][3];
  for (int h = 0; h < g_nh; h += 1) {
    double Jw[3];
    for (int a = 0; a < 3; a += 1) {
      Jw[a] = H[h].force ? H[h].F[a] * g_batch_dt : H[h].J[a];
    }
    qrot_inv(s->quat, Jw, Jb[h]);
  }
  const double adv = g_from_step ? SIM_DT : 0.0;
  double ring[SIM_PARTS_MAX][12];
  unsigned int gone = 0;
  double rho0[SIM_PARTS_MAX];
  double M0[SIM_PARTS_MAX][3];
  for (int j = 0; j < n; j += 1) {
    rho0[j] = 0.0;
    M0[j][0] = M0[j][1] = M0[j][2] = 0.0;
    for (int a = 0; a < 6; a += 1) {
      ring[j][a] = PS[j].ring[a];
      ring[j][6 + a] = PS[j].ring_d[a];
    }
  }
  for (int iter = 0; iter < BREAKS_MAX; iter += 1) {
    double m = 0.0;
    for (int i = 0; i < n; i += 1) {
      if (attached(i) && !(gone & (1u << i))) {
        m += t->p[i].mass;
      }
    }
    if (!(m > 0.0)) {
      break;
    }
    double acc[3], alp[3], accJ[3], alpJ[3];
    craft_accel(Fb, sc, m, acc, alp);
    craft_accel(Jb, sc, m, accJ, alpJ);
    /* Two kinds of joint: those a contact's force goes through on its way
     * to the root, and those that only carry their parts' share of the
     * craft's deceleration. The first kind fails first: until the joints
     * on the load path have taken what they can, the rest of the craft has
     * not been decelerated by more than they let through. */
    int best = -1, best_p = -1;
    double best_rho = 0.0, best_F = 0.0, best_M = 0.0;
    double bp_rho = 0.0, bp_F = 0.0, bp_M = 0.0;
    for (int j = 1; j < n; j += 1) {
      if (!attached(j) || (gone & (1u << j))) {
        continue;
      }
      const PartDef *dj = &t->p[j];
      double Fj[3], Mj[3];
      int path = joint_load(t, j, Fb, sc, gone, acc, alp, Fj, Mj);
      if (t->w1[j] > 0.0) {
        /* The panel's first mode, a spring of its own frequency driven by
         * the joint's quasi static load: it takes the batch's momentum as a
         * kick and rings on through the steps. The root sees the mode's
         * force, not the rigid body's, so a blow short against the period
         * loads it by the impulse it carried, not by its peak. */
        double FJ[3], MJ[3];
        joint_load(t, j, Jb, sc, gone, accJ, alpJ, FJ, MJ);
        const double w = t->w1[j];
        const double *y = PS[j].ring;
        const double *yd = PS[j].ring_d;
        double *c = ring[j];
        for (int a = 0; a < 6; a += 1) {
          const double kick = a < 3 ? FJ[a] : MJ[a - 3];
          c[6 + a] = yd[a] + w * w * kick - (w * w * y[a] + 2.0 * RING_ZETA * w * yd[a]) * adv;
          c[a] = y[a] + c[6 + a] * adv;
        }
        for (int a = 0; a < 3; a += 1) {
          Fj[a] = c[a];
          Mj[a] = c[3 + a];
        }
      }
      const double st = PS[j].strength;
      double fm, mm;
      seat_load(t, j, Fj, Mj, &fm, &mm);
      if (g_blow[j] > mm) {
        /* A blade's own blow at its root, about its disc's axis. */
        mm = g_blow[j];
        path = 1;
      }
      double rho = mm / (dj->m_max * st);
      if (fm / (dj->f_max * st) > rho) {
        rho = fm / (dj->f_max * st);
      }
      /* The last pass's, once the load path has given what it will. */
      rho0[j] = rho;
      for (int a = 0; a < 3; a += 1) M0[j][a] = Mj[a];
      if (rho > best_rho) {
        best_rho = rho;
        best = j;
        best_F = fm;
        best_M = mm;
      }
      if (path && rho > bp_rho) {
        bp_rho = rho;
        best_p = j;
        bp_F = fm;
        bp_M = mm;
      }
    }
    if (best_p >= 0 && bp_rho >= 1.0) {
      best = best_p;
      best_rho = bp_rho;
      best_F = bp_F;
      best_M = bp_M;
    }
    if (best < 0 || best_rho < 1.0 || nbrk >= BREAKS_MAX) {
      break;
    }
    int side = 0;
    for (int h = 0; h < g_nh; h += 1) {
      if (t->sub[best] & (1u << H[h].part)) {
        side = 1;
        sc[h] /= best_rho;
      }
    }
    brk[nbrk].part = best;
    brk[nbrk].rho = best_rho;
    brk[nbrk].F = best_F;
    brk[nbrk].M = best_M;
    brk[nbrk].contact_side = side;
    brk[nbrk].forced = 0;
    nbrk += 1;
    gone |= t->sub[best];
  }
  /* The rings go on from the last pass's state. */
  for (int j = 1; j < n; j += 1) {
    if (!(t->w1[j] > 0.0) || !attached(j) || (gone & (1u << j))) {
      continue;
    }
    for (int a = 0; a < 6; a += 1) {
      PS[j].ring[a] = ring[j][a];
      PS[j].ring_d[a] = ring[j][6 + a];
    }
  }

  /* Under the break: each part's new peak, and what its material does. */
  for (int j = 1; j < n; j += 1) {
    if (!attached(j)) {
      continue;
    }
    PS[j].peak = rho0[j];
    if (gone & (1u << j)) {
      continue;
    }
    double eb = 0.0;
    const int ev = below_break(j, rho0[j] < 1.0 ? rho0[j] : 0.999999, M0[j], &eb);
    if (!ev) {
      continue;
    }
    changed = 1;
    PS[j].damage = part_damage(j);
    double pj[3], pw[3];
    live_pt(t->p[j].joint, pj);
    world_of(s, pj, pw);
    event_push(s, j, ev, rho0[j], 0.0, norm(M0[j]), eb, pw, 0, 0.0, g_surf);
    if (t->p[j].kind == SIM_PART_PROP && PS[j].chip >= 1.0 && nbrk < BREAKS_MAX) {
      PS[j].chip = 1.0;
      brk[nbrk].part = j;
      brk[nbrk].rho = 1.0;
      brk[nbrk].F = 0.0;
      brk[nbrk].M = norm(M0[j]);
      brk[nbrk].contact_side = 1;
      brk[nbrk].forced = 1;
      nbrk += 1;
    }
  }

  /* The breaks, in the order they happened. The side of the craft that was
   * not in the contact keeps what the failed joint could not take from it:
   * the impulse went into the rest only up to the joint's limit. */
  if (nbrk > 0) {
    double corr[HITS_MAX][3];
    double corr_at[HITS_MAX][3];
    int ncorr = 0;
    for (int b = 0; b < nbrk; b += 1) {
      const Break *bk = &brk[b];
      if (!attached(bk->part)) {
        continue;
      }
      double pw[3] = { 0.0, 0.0, 0.0 }, nw[3] = { 0.0, 0.0, 0.0 };
      double vin = 0.0;
      int surf = g_surf;
      for (int h = 0; h < g_nh; h += 1) {
        if (!(t->sub[bk->part] & (1u << H[h].part))) {
          continue;
        }
        if (H[h].vin >= vin) {
          vin = H[h].vin;
          world_of(s, bb[h], pw);
          for (int a = 0; a < 3; a += 1) {
            nw[a] = H[h].n[a];
          }
          surf = H[h].surf;
        }
        if (bk->contact_side && !bk->forced && !H[h].force && ncorr < HITS_MAX && bk->rho > 1.0
            && H[h].jn > 0.0) {
          const double f = 1.0 - 1.0 / bk->rho;
          for (int a = 0; a < 3; a += 1) {
            corr[ncorr][a] = -f * H[h].J[a];
            /* The table frame, until the CG has moved. */
            corr_at[ncorr][a] = H[h].rsum[a] / H[h].jn;
          }
          ncorr += 1;
        }
      }
      const double eb = break_energy(bk);
      PS[bk->part].energy += eb;
      detach(s, bk);
      event_push(s, bk->part, SIM_EVENT_BREAK, bk->rho, bk->F, bk->M, eb, pw, nw, vin, surf);
      changed = 1;
    }
    live_rebuild(s);
    for (int c = 0; c < ncorr; c += 1) {
      double at[3];
      live_pt(corr_at[c], at);
      craft_push(s, at, corr[c]);
    }
  }
  if (changed) {
    for (int i = 0; i < n; i += 1) {
      PS[i].damage = part_damage(i);
    }
    effects_rebuild();
  }
}

/* A panel still ringing after its contact has ended goes on being judged
 * until its ring has died away, and is then set still. */
static int ring_live(void) {
  const Table *t = tab();
  int live = 0;
  for (int i = 1; i < t->n; i += 1) {
    if (!(t->w1[i] > 0.0) || !attached(i)) {
      continue;
    }
    double e = 0.0;
    for (int a = 0; a < 6; a += 1) {
      const double v = PS[i].ring_d[a] / t->w1[i];
      e += PS[i].ring[a] * PS[i].ring[a] + v * v;
    }
    if (e < RING_STILL * RING_STILL) {
      for (int a = 0; a < 6; a += 1) {
        PS[i].ring[a] = 0.0;
        PS[i].ring_d[a] = 0.0;
      }
      continue;
    }
    live = 1;
  }
  return live;
}

void crash_batch_end(SimState *s) {
  if (!SIM_DAMAGE || !g_batch_open) {
    return;
  }
  g_batch_open = 0;
  /* The ground's spring lives in the steps: a host's obstacle contact
   * between two of them neither starts nor ends it. */
  if (g_from_step) {
    g_spring_mask = g_batch_spring;
  }
  if (g_nh == 0 && !(g_from_step && ring_live())) {
    const Table *t = tab();
    for (int i = 0; i < t->n; i += 1) {
      PS[i].peak = 0.0;
    }
    g_crush_mask = 0;
    return;
  }
  judge(s);
  /* A crush goes on while the part is still being driven in; a batch that
   * did not cap it has ended it. */
  unsigned int now = 0;
  for (int h = 0; h < g_nh; h += 1) {
    if (H[h].crush) {
      now |= 1u << H[h].part;
    }
  }
  g_crush_mask &= now;
}

/* ---------------------------------------------------------------------
 * OBSTACLES AND TREES, the world the free bodies meet.
 * ------------------------------------------------------------------- */
typedef struct {
  int type; /* 0 box, 1 vertical cylinder */
  int mat;
  double c[3], h[3], q[4];
  double r, z0, z1;
} Obstacle;

typedef struct {
  double x, y, z0, tr, cz0, cz1, cr;
} Tree;

static Obstacle OB[SIM_OBSTACLES_MAX];
static int g_nob = 0;
static Tree TR[SIM_TREES_MAX];
static int g_ntr = 0;

static int finite(double x) {
  return x == x && x - x == 0.0;
}

SIM_EXPORT int sim_obstacle_clear(void) {
  g_nob = 0;
  return SIM_OK;
}

SIM_EXPORT int sim_obstacle_box(double cx, double cy, double cz, double hx, double hy, double hz,
                                double qw, double qx, double qy, double qz, int mat) {
  if (!finite(cx) || !finite(cy) || !finite(cz) || !finite(hx) || !finite(hy) || !finite(hz)
      || !finite(qw) || !finite(qx) || !finite(qy) || !finite(qz)
      || !(hx > 0.0) || !(hy > 0.0) || !(hz > 0.0) || mat < 0 || mat >= SIM_SURFACES) {
    return SIM_ERR_BAD_ARG;
  }
  const double n2 = qw * qw + qx * qx + qy * qy + qz * qz;
  if (!(n2 > 0.25) || !(n2 < 4.0)) {
    return SIM_ERR_BAD_ARG;
  }
  if (g_nob == SIM_OBSTACLES_MAX) {
    return SIM_ERR_BAD_STATE;
  }
  Obstacle *o = &OB[g_nob];
  const double inv = 1.0 / sim_sqrt(n2);
  o->type = 0;
  o->mat = mat;
  o->c[0] = cx;
  o->c[1] = cy;
  o->c[2] = cz;
  o->h[0] = hx;
  o->h[1] = hy;
  o->h[2] = hz;
  o->q[0] = qw * inv;
  o->q[1] = qx * inv;
  o->q[2] = qy * inv;
  o->q[3] = qz * inv;
  g_nob += 1;
  return g_nob - 1;
}

SIM_EXPORT int sim_obstacle_cylinder(double x, double y, double z0, double z1, double r, int mat) {
  if (!finite(x) || !finite(y) || !finite(z0) || !finite(z1) || !finite(r)
      || !(r > 0.0) || !(z1 > z0) || mat < 0 || mat >= SIM_SURFACES) {
    return SIM_ERR_BAD_ARG;
  }
  if (g_nob == SIM_OBSTACLES_MAX) {
    return SIM_ERR_BAD_STATE;
  }
  Obstacle *o = &OB[g_nob];
  o->type = 1;
  o->mat = mat;
  o->c[0] = x;
  o->c[1] = y;
  o->c[2] = 0.5 * (z0 + z1);
  o->r = r;
  o->z0 = z0;
  o->z1 = z1;
  g_nob += 1;
  return g_nob - 1;
}

SIM_EXPORT int sim_tree_clear(void) {
  g_ntr = 0;
  return SIM_OK;
}

SIM_EXPORT int sim_tree_add(double x, double y, double z0, double trunk_r,
                            double crown_z0, double crown_z1, double crown_r) {
  if (!finite(x) || !finite(y) || !finite(z0) || !finite(trunk_r) || !finite(crown_z0)
      || !finite(crown_z1) || !finite(crown_r) || !(trunk_r >= 0.0) || !(crown_r > 0.0)
      || !(crown_z1 > crown_z0) || !(crown_z0 >= z0)) {
    return SIM_ERR_BAD_ARG;
  }
  if (g_ntr == SIM_TREES_MAX) {
    return SIM_ERR_BAD_STATE;
  }
  Tree *t = &TR[g_ntr];
  t->x = x;
  t->y = y;
  t->z0 = z0;
  t->tr = trunk_r;
  t->cz0 = crown_z0;
  t->cz1 = crown_z1;
  t->cr = crown_r;
  g_ntr += 1;
  return g_ntr - 1;
}

/* A world point inside an obstacle: the way out (normal) and how deep. */
static int obstacle_pen(const Obstacle *o, const double p[3], double nrm[3], double *pen) {
  if (o->type == 0) {
    const double d[3] = { p[0] - o->c[0], p[1] - o->c[1], p[2] - o->c[2] };
    double l[3];
    qrot_inv(o->q, d, l);
    double best = 1.0e9;
    int ax = -1;
    for (int a = 0; a < 3; a += 1) {
      const double g = o->h[a] - sim_fabs(l[a]);
      if (!(g > 0.0)) {
        return 0;
      }
      if (g < best) {
        best = g;
        ax = a;
      }
    }
    double nl[3] = { 0.0, 0.0, 0.0 };
    nl[ax] = l[ax] < 0.0 ? -1.0 : 1.0;
    qrot(o->q, nl, nrm);
    *pen = best;
    return 1;
  }
  return 0;
}

static int cylinder_pen(double x, double y, double z0, double z1, double r,
                        const double p[3], double nrm[3], double *pen) {
  if (!(p[2] > z0) || !(p[2] < z1)) {
    return 0;
  }
  const double dx = p[0] - x, dy = p[1] - y;
  const double d2 = dx * dx + dy * dy;
  if (!(d2 < r * r)) {
    return 0;
  }
  const double d = sim_sqrt(d2);
  const double side = r - d;
  const double top = z1 - p[2];
  if (top < side) {
    nrm[0] = 0.0;
    nrm[1] = 0.0;
    nrm[2] = 1.0;
    *pen = top;
    return 1;
  }
  if (d > 1e-9) {
    nrm[0] = dx / d;
    nrm[1] = dy / d;
  } else {
    nrm[0] = 1.0;
    nrm[1] = 0.0;
  }
  nrm[2] = 0.0;
  *pen = side;
  return 1;
}

/* ---------------------------------------------------------------------
 * THE CRAFT IN WATER AND IN A CROWN. Only with the damage mode on: a part
 * other than a float in the water, and every part in a tree's crown, is
 * dragged, and the water buoys it, as a force at its hull points. Each is
 * a force note, so the loads go through the joints: a wing tip that
 * catches in the water is what cartwheels a float plane and tears the
 * panel off it.
 * ------------------------------------------------------------------- */
#define RHO_WATER 1000.0
#define CD_WATER 1.0
/* The crown: twigs as a porous medium, drag 0.5 rho_c A v^2 on each part's
 * projected area, and branches that carry a slowed craft whose weight over
 * its plan area inside is under what they hold. Chosen, flagged in the
 * doc for the crash suite to band. */
#define RHO_CROWN 15.0
#define CROWN_HOLD 60.0
#define CROWN_HOLD_V 2.0

/* A part's box face areas, body frame: the face normal to x, y and z. */
static void part_faces(const Table *t, int i, double A[3]) {
  const double sx = t->hi[i][0] - t->lo[i][0];
  const double sy = t->hi[i][1] - t->lo[i][1];
  const double sz = t->hi[i][2] - t->lo[i][2];
  const double tz = sz > 0.004 ? sz : 0.004;
  const double ty = sy > 0.004 ? sy : 0.004;
  const double tx = sx > 0.004 ? sx : 0.004;
  A[0] = ty * tz;
  A[1] = tx * tz;
  A[2] = tx * ty;
}

/* A force at world offset r applied to the craft for one step, clipped so
 * it cannot reverse the point's motion along it, and noted for the part. */
static void craft_force(SimState *s, int part, const double r[3], const double F[3], double vrel) {
  double b[3];
  qrot_inv(s->quat, r, b);
  double J[3] = { F[0] * SIM_DT, F[1] * SIM_DT, F[2] * SIM_DT };
  const double jm = norm(J);
  if (jm > 0.0 && vrel > 0.0) {
    /* What stops the point along J, through the body's effective mass. */
    const double d[3] = { J[0] / jm, J[1] / jm, J[2] / jm };
    double db[3];
    qrot_inv(s->quat, d, db);
    double rd[3];
    cross(b, db, rd);
    const double kk = 1.0 / PLANT.mass_kg + rd[0] * rd[0] / PLANT.inertia[0]
        + rd[1] * rd[1] / PLANT.inertia[1] + rd[2] * rd[2] / PLANT.inertia[2];
    const double jcap = vrel / kk;
    if (jm > jcap) {
      for (int a = 0; a < 3; a += 1) J[a] *= jcap / jm;
    }
  }
  craft_push(s, b, J);
  crash_force_note(s, r, F, part);
}

/*
 * ENTRY EVENTS. The craft going into the water or into a crown is an event
 * of its own, whether or not anything breaks, so a host that steps many
 * milliseconds between reads, or keeps no flags, still learns that it
 * happened and where: the shell throws spray or leaves from it. An entry
 * is the first step a part other than a float is wet (the floats' water is
 * sim_float_state's), or the first a hull point is inside a crown, after
 * ENTRY_REARM steps of neither, so a tip dipping in and out of every
 * crest of a swell is one entry and not one an oscillation.
 */
#define ENTRY_REARM 250

static void craft_water(SimState *s) {
  if (water_count() == 0) {
    return;
  }
  const int wb = water_body_at(s->pos[0], s->pos[1]);
  if (wb < 0) {
    return;
  }
  const WaterBody *w = water_body(wb);
  const Table *t = tab();
  /* Nothing within reach of the water: the highest crest a sea of this
   * height makes, and the airframe's reach, both generous. */
  if (s->pos[2] - 2.0 > w->z0 + 2.0 * w->hs + 0.5 * w->swell_h + 0.2) {
    return;
  }
  const double tnow = (double)(s->step_index + 1) * SIM_DT;
  double ww[3];
  qrot(s->quat, s->omega, ww);
  int wet_now = 0;
  for (int i = 0; i < t->n; i += 1) {
    if (!attached(i) || t->p[i].kind == SIM_PART_FLOAT) {
      continue;
    }
    double A[3];
    part_faces(t, i, A);
    double thin = t->hi[i][2] - t->lo[i][2];
    for (int a = 0; a < 2; a += 1) {
      const double s_a = t->hi[i][a] - t->lo[i][a];
      if (s_a < thin) thin = s_a;
    }
    if (thin < 0.005) thin = 0.005;
    const double vol = t->p[i].mass / mat_density(t->p[i].mat);
    const int np = t->p[i].npts;
    for (int k = 0; k < np; k += 1) {
      double pl[3], r[3];
      live_pt(t->p[i].pts[k], pl);
      qrot(s->quat, pl, r);
      const double p[3] = { s->pos[0] + r[0], s->pos[1] + r[1], s->pos[2] + r[2] };
      double ws[6];
      water_sample(wb, p[0], p[1], tnow, ws);
      const double h = ws[0] - p[2];
      if (!(h > 0.0)) {
        continue;
      }
      g_flags_extra |= SIM_DMG_IN_WATER;
      const double f = h < thin ? h / thin : 1.0;
      double wr[3];
      cross(ww, r, wr);
      const double v[3] = { s->vel[0] + wr[0] - ws[3], s->vel[1] + wr[1] - ws[4], s->vel[2] + wr[2] - ws[5] };
      const double vm = norm(v);
      if (!wet_now) {
        wet_now = 1;
        if (s->step_index - g_wet_step > ENTRY_REARM) {
          /* The surface's normal from its slope, and the speed the point
           * closes on it. */
          double nw[3] = { -ws[1], -ws[2], 1.0 };
          const double nl = norm(nw);
          for (int a = 0; a < 3; a += 1) nw[a] /= nl;
          const double vc = -dot(v, nw);
          event_push(s, i, SIM_EVENT_WATER, 0.0, 0.0, 0.0, 0.0, p, nw, vc > 0.0 ? vc : 0.0, SIM_SURF_WATER);
        }
      }
      double F[3] = { 0.0, 0.0, 0.0 };
      if (vm > 1e-6) {
        double vb[3];
        qrot_inv(s->quat, v, vb);
        const double ap = (A[0] * sim_fabs(vb[0]) + A[1] * sim_fabs(vb[1]) + A[2] * sim_fabs(vb[2])) / vm;
        const double kd = -0.5 * RHO_WATER * CD_WATER * ap / (double)np * f * vm;
        for (int a = 0; a < 3; a += 1) F[a] = kd * v[a];
      }
      F[2] += RHO_WATER * PLANT.gravity * vol / (double)np * f;
      craft_force(s, i, r, F, vm);
    }
  }
  if (wet_now) {
    g_wet_step = s->step_index;
  }
}

static void craft_crowns(SimState *s) {
  if (g_ntr == 0) {
    return;
  }
  const Table *t = tab();
  double ww[3];
  qrot(s->quat, s->omega, ww);
  double hold_area = 0.0;
  int inside = 0;
  int entered = 0;
  for (int c = 0; c < g_ntr; c += 1) {
    const Tree *tr = &TR[c];
    const double dx = s->pos[0] - tr->x, dy = s->pos[1] - tr->y;
    const double reach = tr->cr + 2.0;
    if (dx * dx + dy * dy > reach * reach || s->pos[2] < tr->cz0 - 2.0 || s->pos[2] > tr->cz1 + 2.0) {
      continue;
    }
    for (int i = 0; i < t->n; i += 1) {
      if (!attached(i)) {
        continue;
      }
      double A[3];
      part_faces(t, i, A);
      const int np = t->p[i].npts;
      int in_part = 0;
      for (int k = 0; k < np; k += 1) {
        double pl[3], r[3];
        live_pt(t->p[i].pts[k], pl);
        qrot(s->quat, pl, r);
        const double p[3] = { s->pos[0] + r[0], s->pos[1] + r[1], s->pos[2] + r[2] };
        const double ex = p[0] - tr->x, ey = p[1] - tr->y;
        if (ex * ex + ey * ey > tr->cr * tr->cr || p[2] < tr->cz0 || p[2] > tr->cz1) {
          continue;
        }
        in_part = 1;
        double wr[3];
        cross(ww, r, wr);
        const double v[3] = { s->vel[0] + wr[0], s->vel[1] + wr[1], s->vel[2] + wr[2] };
        const double vm = norm(v);
        if (!inside && !entered && s->step_index - g_crown_step > ENTRY_REARM) {
          /* Into the crown: its normal, out from the trunk's axis, and the
           * speed the point came in at, the twigs being everywhere. */
          entered = 1;
          const double eh = sim_sqrt(ex * ex + ey * ey);
          const double nw[3] = { eh > 1e-9 ? ex / eh : 0.0, eh > 1e-9 ? ey / eh : 0.0, eh > 1e-9 ? 0.0 : 1.0 };
          event_push(s, i, SIM_EVENT_TREE, 0.0, 0.0, 0.0, 0.0, p, nw, vm, SIM_SURF_FOLIAGE);
        }
        if (!(vm > 1e-6)) {
          continue;
        }
        double vb[3];
        qrot_inv(s->quat, v, vb);
        const double ap = (A[0] * sim_fabs(vb[0]) + A[1] * sim_fabs(vb[1]) + A[2] * sim_fabs(vb[2])) / vm;
        const double kd = -0.5 * RHO_CROWN * ap / (double)np * vm;
        const double F[3] = { kd * v[0], kd * v[1], kd * v[2] };
        craft_force(s, i, r, F, vm);
      }
      if (in_part) {
        inside = 1;
        hold_area += A[2];
      }
    }
  }
  if (!inside) {
    return;
  }
  g_crown_step = s->step_index;
  g_flags_extra |= SIM_DMG_IN_TREE;
  const double vm = norm(s->vel);
  if (!(vm < CROWN_HOLD_V)) {
    return;
  }
  /* The branches under it: at most CROWN_HOLD a square metre of plan
   * area inside, against the weight and whatever motion is left. */
  const double m = PLANT.mass_kg;
  const double g = PLANT.gravity * SIM_GRAVITY;
  double need[3] = { -m * s->vel[0] / SIM_DT, -m * s->vel[1] / SIM_DT, m * g - m * s->vel[2] / SIM_DT };
  const double nm = norm(need);
  const double cap = CROWN_HOLD * hold_area;
  if (nm > cap && nm > 0.0) {
    for (int a = 0; a < 3; a += 1) need[a] *= cap / nm;
  }
  for (int a = 0; a < 3; a += 1) {
    s->vel[a] += need[a] / m * SIM_DT;
  }
  if (cap >= m * g) {
    /* Held: the branches take the attitude too. */
    for (int a = 0; a < 3; a += 1) {
      s->omega[a] *= 0.95;
    }
  }
}

/* ---------------------------------------------------------------------
 * THE FREE BODIES' STEP
 * ------------------------------------------------------------------- */
#define FB_REST_V 0.10
#define FB_REST_W 0.50
#define FB_REST_MS 300
#define FB_ITERS 2
#define FB_W_MAX 300.0

/* The rigid body impulse of sim.c's contact_impulse, for a free body:
 * restitution falling past the same knee, Coulomb friction. r world. */
static void fb_impulse(FreeBody *f, const double r[3], const double n[3], double e, double mu, double pen) {
  double ww[3];
  qrot(f->q, f->w, ww);
  double wr[3];
  cross(ww, r, wr);
  const double vp[3] = { f->vel[0] + wr[0], f->vel[1] + wr[1], f->vel[2] + wr[2] };
  const double vn = dot(vp, n);
  if (vn >= 0.0 && !(pen > 0.002)) {
    return;
  }
  double rb[3], nb[3];
  qrot_inv(f->q, r, rb);
  qrot_inv(f->q, n, nb);
  double rn[3];
  cross(rb, nb, rn);
  const double kn = 1.0 / f->m + rn[0] * rn[0] / f->I[0] + rn[1] * rn[1] / f->I[1] + rn[2] * rn[2] / f->I[2];
  const double vin = vn < 0.0 ? -vn : 0.0;
  double eu = e;
  if (vin > 1.7) {
    eu = e * 1.7 / vin;
  }
  double bias = 0.0;
  if (pen > 0.002) {
    bias = 0.15 * (pen - 0.002) / SIM_DT;
    if (bias > 1.2) bias = 1.2;
  }
  const double jn = ((vn < 0.0 ? -eu * vn : 0.0) + bias - vn) / kn;
  if (!(jn > 0.0)) {
    return;
  }
  double J[3] = { jn * n[0], jn * n[1], jn * n[2] };
  const double vt[3] = { vp[0] - vn * n[0], vp[1] - vn * n[1], vp[2] - vn * n[2] };
  const double vtm = norm(vt);
  if (vtm > 1e-8 && mu > 0.0) {
    const double tdir[3] = { vt[0] / vtm, vt[1] / vtm, vt[2] / vtm };
    double tb[3];
    qrot_inv(f->q, tdir, tb);
    double rt[3];
    cross(rb, tb, rt);
    const double kt = 1.0 / f->m + rt[0] * rt[0] / f->I[0] + rt[1] * rt[1] / f->I[1] + rt[2] * rt[2] / f->I[2];
    double jt = vtm / kt;
    if (jt > mu * jn) jt = mu * jn;
    for (int a = 0; a < 3; a += 1) J[a] -= jt * tdir[a];
  }
  for (int a = 0; a < 3; a += 1) {
    f->vel[a] += J[a] / f->m;
  }
  double Jb[3];
  qrot_inv(f->q, J, Jb);
  double tau[3];
  cross(rb, Jb, tau);
  for (int a = 0; a < 3; a += 1) {
    f->w[a] += tau[a] / f->I[a];
  }
}

static void fb_step(FreeBody *f, const SimState *s, int ground_on, const double gn[3], double gd) {
  const double g = PLANT_TABLE[plant_airframe()].gravity * SIM_GRAVITY;
  const double rho = 1.225;
  /* Gravity, and the air's drag on its biggest face, through the air. */
  double va[3] = { f->vel[0], f->vel[1], f->vel[2] };
  if (SIM_WIND_ON) {
    double wa[3];
    plant_wind(s->step_index, wa);
    va[0] -= wa[0];
    va[1] -= wa[1];
  }
  const double vm = norm(va);
  const double kd = -0.5 * rho * f->cda * vm / f->m;
  for (int a = 0; a < 3; a += 1) {
    f->vel[a] += kd * va[a] * SIM_DT;
  }
  f->vel[2] -= g * SIM_DT;
  /* A tumbling part loses its spin to the air too, slowly. */
  for (int a = 0; a < 3; a += 1) {
    f->w[a] *= 1.0 - 0.5 * SIM_DT;
  }
  /* Rates then attitude then position, as the plant does. */
  const double wx = f->w[0] * SIM_DT, wy = f->w[1] * SIM_DT, wz = f->w[2] * SIM_DT;
  const double ang = sim_sqrt(wx * wx + wy * wy + wz * wz);
  if (ang > 1e-12) {
    double half = 0.5 * ang;
    int nsub = 1;
    while (half > 0.4) {
      half *= 0.5;
      nsub *= 2;
    }
    const double sh = sim_sin_small(half);
    const double dq[4] = { sim_cos_small(half), sh * wx / ang, sh * wy / ang, sh * wz / ang };
    for (int k = 0; k < nsub; k += 1) {
      double q2[4];
      qmul(f->q, dq, q2);
      for (int a = 0; a < 4; a += 1) f->q[a] = q2[a];
    }
    const double qn = sim_sqrt(f->q[0] * f->q[0] + f->q[1] * f->q[1] + f->q[2] * f->q[2] + f->q[3] * f->q[3]);
    for (int a = 0; a < 4; a += 1) f->q[a] /= qn;
  }
  for (int a = 0; a < 3; a += 1) {
    f->pos[a] += f->vel[a] * SIM_DT;
  }
  f->touching = 0;
  /* The ground plane. */
  if (ground_on) {
    const Surface *su = &SURF[g_ground_mat];
    for (int it = 0; it < FB_ITERS; it += 1) {
      for (int k = 0; k < f->npts; k += 1) {
        double r[3];
        qrot(f->q, f->pts[k], r);
        const double pen = gd - (gn[0] * (f->pos[0] + r[0]) + gn[1] * (f->pos[1] + r[1]) + gn[2] * (f->pos[2] + r[2]));
        if (!(pen > -0.002)) {
          continue;
        }
        f->touching = 1;
        fb_impulse(f, r, gn, su->e, su->mu, pen > 0.0 ? pen : 0.0);
      }
    }
    double worst = 0.0;
    for (int k = 0; k < f->npts; k += 1) {
      double r[3];
      qrot(f->q, f->pts[k], r);
      const double pen = gd - (gn[0] * (f->pos[0] + r[0]) + gn[1] * (f->pos[1] + r[1]) + gn[2] * (f->pos[2] + r[2]));
      if (pen > worst) worst = pen;
    }
    if (worst > 0.002) {
      for (int a = 0; a < 3; a += 1) f->pos[a] += gn[a] * (worst - 0.002);
    }
    /* Lying on it: the impulses above only act on a point driven in, so a
     * part at rest on its face slid and spun on the slop for ever. The
     * weight it lays on the ground brakes the slide at mu g and the spin
     * about the normal at mu g over its own radius of gyration, like the
     * craft's own settle, never reversing either. */
    if (worst > -0.002) {
      const double vn = dot(f->vel, gn);
      const double vt[3] = { f->vel[0] - vn * gn[0], f->vel[1] - vn * gn[1], f->vel[2] - vn * gn[2] };
      const double vtm = norm(vt);
      const double dv = su->mu * g * SIM_DT;
      const double keep = vtm > dv ? (vtm - dv) / vtm : 0.0;
      for (int a = 0; a < 3; a += 1) {
        f->vel[a] = vn * gn[a] + vt[a] * keep;
      }
      const double rg = sim_sqrt((f->I[0] + f->I[1] + f->I[2]) / (1.5 * f->m));
      const double wm = norm(f->w);
      const double dw = rg > 1e-4 ? su->mu * g / rg * SIM_DT : wm;
      const double wkeep = wm > dw ? (wm - dw) / wm : 0.0;
      for (int a = 0; a < 3; a += 1) {
        f->w[a] *= wkeep;
      }
    }
  }
  /* Obstacles and the trunks. */
  for (int k = 0; k < f->npts; k += 1) {
    double r[3];
    qrot(f->q, f->pts[k], r);
    const double p[3] = { f->pos[0] + r[0], f->pos[1] + r[1], f->pos[2] + r[2] };
    for (int o = 0; o < g_nob; o += 1) {
      double nrm[3], pen;
      int hit;
      if (OB[o].type == 0) {
        hit = obstacle_pen(&OB[o], p, nrm, &pen);
      } else {
        hit = cylinder_pen(OB[o].c[0], OB[o].c[1], OB[o].z0, OB[o].z1, OB[o].r, p, nrm, &pen);
      }
      if (!hit) {
        continue;
      }
      f->touching = 1;
      fb_impulse(f, r, nrm, SURF[OB[o].mat].e, SURF[OB[o].mat].mu, pen);
      for (int a = 0; a < 3; a += 1) f->pos[a] += nrm[a] * pen * 0.2;
    }
    for (int c = 0; c < g_ntr; c += 1) {
      const Tree *tr = &TR[c];
      double nrm[3], pen;
      if (tr->tr > 0.0 && cylinder_pen(tr->x, tr->y, tr->z0, tr->cz1, tr->tr, p, nrm, &pen)) {
        f->touching = 1;
        fb_impulse(f, r, nrm, SURF[SIM_SURF_WOOD].e, SURF[SIM_SURF_WOOD].mu, pen);
        for (int a = 0; a < 3; a += 1) f->pos[a] += nrm[a] * pen * 0.2;
      }
      const double ex = p[0] - tr->x, ey = p[1] - tr->y;
      if (ex * ex + ey * ey < tr->cr * tr->cr && p[2] > tr->cz0 && p[2] < tr->cz1) {
        /* Twigs: drag on the point's share of its area, and a body that
         * has slowed in them stays. */
        const double share = f->cda / (double)f->npts;
        const double v = norm(f->vel);
        const double kk = -0.5 * RHO_CROWN * share * v / f->m;
        for (int a = 0; a < 3; a += 1) f->vel[a] += kk * f->vel[a] * SIM_DT;
        if (f->m * g < CROWN_HOLD * share * (double)f->npts && v < CROWN_HOLD_V) {
          f->vel[0] *= 0.9;
          f->vel[1] *= 0.9;
          f->vel[2] = f->vel[2] * 0.9 + g * SIM_DT;
          f->touching = 1;
        }
      }
    }
  }
  /* Water: buoyancy on its volume's wet share, drag on its area's. */
  if (water_count() > 0) {
    const int wb = water_body_at(f->pos[0], f->pos[1]);
    if (wb >= 0) {
      const double tnow = (double)(s->step_index + 1) * SIM_DT;
      for (int k = 0; k < f->npts; k += 1) {
        double r[3];
        qrot(f->q, f->pts[k], r);
        const double p[3] = { f->pos[0] + r[0], f->pos[1] + r[1], f->pos[2] + r[2] };
        double ws[6];
        water_sample(wb, p[0], p[1], tnow, ws);
        const double h = ws[0] - p[2];
        if (!(h > 0.0)) {
          continue;
        }
        f->touching = 1;
        const double fr = h < 0.02 ? h / 0.02 : 1.0;
        const double fb = RHO_WATER * g * f->vol / (double)f->npts * fr;
        f->vel[2] += fb / f->m * SIM_DT;
        const double v[3] = { f->vel[0] - ws[3], f->vel[1] - ws[4], f->vel[2] - ws[5] };
        const double v2 = norm(v);
        double kw = 0.5 * RHO_WATER * CD_WATER * f->cda / (double)f->npts * fr * v2 / f->m * SIM_DT;
        if (kw > 1.0) kw = 1.0;
        for (int a = 0; a < 3; a += 1) f->vel[a] -= kw * v[a];
        for (int a = 0; a < 3; a += 1) f->w[a] *= 1.0 - 0.02 * fr;
      }
    }
  }
  /* A splinter struck at a corner cannot spin faster than the air and its
   * own flex let it; 300 rad/s is a prop's hub spun off its shaft. */
  const double wcap = norm(f->w);
  if (wcap > FB_W_MAX) {
    for (int a = 0; a < 3; a += 1) f->w[a] *= FB_W_MAX / wcap;
  }
  /* At rest: slow and touching something for long enough. */
  const double wm = norm(f->w);
  if (f->touching && norm(f->vel) < FB_REST_V && wm < FB_REST_W) {
    f->still_ms += 1;
    if (f->touching) {
      /* Friction's last word: a slow body on the ground does not creep. */
      for (int a = 0; a < 3; a += 1) {
        f->vel[a] *= 0.9;
        f->w[a] *= 0.9;
      }
    }
  } else {
    f->still_ms = 0;
  }
}

void crash_step(SimState *s, int ground_on, const double gn[3], double gd) {
  if (!SIM_DAMAGE) {
    return;
  }
  g_flags_extra = 0;
  craft_water(s);
  craft_crowns(s);
  const Table *t = tab();
  for (int b = 0; b < SIM_PARTS_MAX; b += 1) {
    FreeBody *f = &FB[b];
    if (f->state != SIM_PART_FREE) {
      continue;
    }
    fb_step(f, s, ground_on, gn, gd);
    if (f->still_ms >= FB_REST_MS) {
      f->state = SIM_PART_RESTING;
      int first = -1;
      for (int i = 0; i < t->n; i += 1) {
        if (f->parts & (1u << i)) {
          PS[i].status = SIM_PART_RESTING;
          if (first < 0) first = i;
        }
      }
      for (int a = 0; a < 3; a += 1) {
        f->vel[a] = 0.0;
        f->w[a] = 0.0;
      }
      if (first >= 0) {
        event_push(s, first, SIM_EVENT_SETTLE, 0.0, 0.0, 0.0, 0.0, f->pos, 0, 0.0, g_ground_mat);
      }
    }
  }
}

/* ---------------------------------------------------------------------
 * THE ABI: readback and set up. The exports that need the craft's state
 * are in sim.c, which owns it, and call these.
 * ------------------------------------------------------------------- */
SIM_EXPORT int sim_set_damage(int on) {
  SIM_DAMAGE = on ? 1 : 0;
  return SIM_OK;
}

SIM_EXPORT int sim_damage(void) {
  return SIM_DAMAGE;
}

SIM_EXPORT int sim_parts_count(void) {
  return tab()->n;
}

SIM_EXPORT int sim_part_info(int part, double *out) {
  const Table *t = tab();
  if (out == 0 || part < 0 || part >= t->n) {
    return SIM_ERR_BAD_ARG;
  }
  const PartDef *d = &t->p[part];
  out[0] = (double)d->kind;
  out[1] = (double)d->parent;
  out[2] = (double)d->mat;
  out[3] = (double)d->motor;
  out[4] = d->mass;
  for (int a = 0; a < 3; a += 1) {
    out[5 + a] = t->cg[part][a];
    out[8 + a] = d->joint[a];
    out[18 + a] = t->lo[part][a];
    out[21 + a] = t->hi[part][a];
  }
  out[11] = d->m_max;
  out[12] = d->f_max;
  out[13] = d->k;
  out[14] = d->crush_s;
  out[15] = d->crush_a;
  out[16] = d->crush_d;
  out[17] = (double)d->npts;
  return SIM_OK;
}

SIM_EXPORT int sim_part_hull(int part, double *out) {
  const Table *t = tab();
  if (out == 0 || part < 0 || part >= t->n) {
    return SIM_ERR_BAD_ARG;
  }
  const PartDef *d = &t->p[part];
  out[0] = (double)d->npts;
  for (int k = 0; k < d->npts; k += 1) {
    for (int a = 0; a < 3; a += 1) {
      out[1 + 3 * k + a] = d->pts[k][a];
    }
  }
  return SIM_OK;
}

int crash_parts_state(const SimState *s, double *out) {
  const Table *t = tab();
  for (int i = 0; i < t->n; i += 1) {
    double *o = out + i * SIM_PART_STATE_DOUBLES;
    const PartDef *d = &t->p[i];
    const PartState *p = &PS[i];
    double qk[4];
    rotvec_quat(p->bend, qk);
    o[0] = (double)p->status;
    o[1] = p->damage;
    if (p->status == SIM_PART_ATTACHED) {
      double c[3], r[3], ww[3], wr[3];
      live_pt(t->cg[i], c);
      qrot(s->quat, c, r);
      qrot(s->quat, s->omega, ww);
      cross(ww, r, wr);
      double q[4];
      qmul(s->quat, qk, q);
      for (int a = 0; a < 3; a += 1) {
        o[2 + a] = s->pos[a] + r[a];
        o[9 + a] = s->vel[a] + wr[a];
        o[12 + a] = ww[a];
      }
      for (int a = 0; a < 4; a += 1) o[5 + a] = q[a];
      o[15] = -1.0;
    } else {
      const FreeBody *f = &FB[p->body >= 0 ? p->body : 0];
      const double c[3] = { t->cg[i][0] - f->cg0[0], t->cg[i][1] - f->cg0[1], t->cg[i][2] - f->cg0[2] };
      double r[3], ww[3], wr[3];
      qrot(f->q, c, r);
      qrot(f->q, f->w, ww);
      cross(ww, r, wr);
      double q[4];
      qmul(f->q, qk, q);
      for (int a = 0; a < 3; a += 1) {
        o[2 + a] = f->pos[a] + r[a];
        o[9 + a] = f->vel[a] + wr[a];
        o[12 + a] = ww[a];
      }
      for (int a = 0; a < 4; a += 1) o[5 + a] = q[a];
      o[15] = (double)p->body;
    }
    o[16] = p->peak;
    for (int a = 0; a < 3; a += 1) {
      o[17 + a] = d->crush_s > 0.0 ? p->dent[a] : p->bend[a];
    }
    o[20] = p->energy;
    o[21] = (double)d->kind;
    o[22] = (double)d->parent;
    o[23] = 0.0;
  }
  return SIM_OK;
}

SIM_EXPORT int sim_damage_events(double *out, int max) {
  if (out == 0 || max < 0) {
    return SIM_ERR_BAD_ARG;
  }
  int n = 0;
  while (n < max && g_ev_count > 0) {
    const double *e = g_ev[g_ev_head];
    for (int k = 0; k < SIM_DAMAGE_EVENT_DOUBLES; k += 1) {
      out[n * SIM_DAMAGE_EVENT_DOUBLES + k] = e[k];
    }
    g_ev_head = (g_ev_head + 1) % SIM_DAMAGE_EVENTS_MAX;
    g_ev_count -= 1;
    n += 1;
  }
  return n;
}

SIM_EXPORT int sim_damage_events_dropped(void) {
  return g_ev_dropped;
}

SIM_EXPORT int sim_damage_flags(void) {
  const Table *t = tab();
  int f = g_flags_extra;
  for (int i = 0; i < t->n; i += 1) {
    const PartDef *d = &t->p[i];
    const PartState *p = &PS[i];
    const int gone = !attached(i);
    switch (d->kind) {
    case SIM_PART_CAMERA:
      if (gone) f |= SIM_DMG_CAMERA_LOST;
      else if (norm(p->bend) > 0.02) f |= SIM_DMG_CAMERA_KNOCKED;
      break;
    case SIM_PART_ANTENNA:
      if (gone) f |= SIM_DMG_ANTENNA_LOST;
      break;
    case SIM_PART_BATTERY:
      if (gone) f |= SIM_DMG_BATTERY_EJECTED;
      break;
    case SIM_PART_PROP:
      if (gone) f |= SIM_DMG_PROP_LOST;
      else if (p->chip > 0.0) f |= SIM_DMG_PROP_CHIPPED;
      break;
    case SIM_PART_ARM:
      if (gone) f |= SIM_DMG_ARM_LOST;
      else if (norm(p->bend) > 0.0) f |= SIM_DMG_ARM_BENT;
      break;
    case SIM_PART_MOTOR:
      if (gone) f |= SIM_DMG_MOTOR_LOST;
      break;
    case SIM_PART_WING:
      if (gone) f |= SIM_DMG_WING_LOST;
      break;
    case SIM_PART_AILERON:
    case SIM_PART_ELEVATOR:
    case SIM_PART_RUDDER:
    case SIM_PART_ELEVON:
      if (gone) f |= SIM_DMG_SURFACE_LOST;
      break;
    case SIM_PART_CANOPY:
      if (gone) f |= SIM_DMG_CANOPY_LOST;
      break;
    case SIM_PART_GEAR:
      if (gone) f |= SIM_DMG_GEAR_LOST;
      break;
    case SIM_PART_FLOAT:
      if (gone) f |= SIM_DMG_FLOAT_LOST;
      break;
    case SIM_PART_HSTAB:
    case SIM_PART_FIN:
    case SIM_PART_BOOM:
      if (gone) f |= SIM_DMG_TAIL_LOST;
      break;
    default:
      break;
    }
    if (p->crush > 0.0) {
      f |= SIM_DMG_CRUSHED;
    }
  }
  return f;
}

SIM_EXPORT int sim_motor_damage(double *out) {
  if (out == 0) {
    return SIM_ERR_BAD_ARG;
  }
  for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
    out[4 * m + 0] = CRASH.motor_dead[m] ? 0.0 : CRASH.kt[m];
    out[4 * m + 1] = CRASH.imbalance[m];
    out[4 * m + 2] = CRASH.bend[m][0];
    out[4 * m + 3] = CRASH.bend[m][1];
  }
  return SIM_OK;
}

SIM_EXPORT int sim_material_info(int mat, double *out) {
  if (out == 0 || mat < 0 || mat >= SIM_SURFACES) {
    return SIM_ERR_BAD_ARG;
  }
  out[0] = SURF[mat].mu;
  out[1] = SURF[mat].e;
  out[2] = SURF[mat].k;
  out[3] = SURF[mat].hard;
  return SIM_OK;
}

SIM_EXPORT int sim_set_ground_material(int mat) {
  if (mat < 0 || mat >= SIM_SURFACES) {
    return SIM_ERR_BAD_ARG;
  }
  g_ground_mat = mat;
  return SIM_OK;
}

/* The material's own mu and e, or for the default what the caller gave. */
void crash_surface_mu_e(int mat, double *mu, double *e) {
  if (mat > SIM_SURF_DEFAULT && mat < SIM_SURFACES) {
    *mu = SURF[mat].mu;
    *e = SURF[mat].e;
  }
}

int crash_part_break(SimState *s, int part) {
  const Table *t = tab();
  if (!SIM_DAMAGE) {
    return SIM_ERR_BAD_STATE;
  }
  if (part <= 0 || part >= t->n) {
    return SIM_ERR_BAD_ARG;
  }
  if (!attached(part)) {
    return SIM_OK;
  }
  Break bk = { .part = part, .rho = 1.0, .F = 0.0, .M = 0.0, .contact_side = 1, .forced = 1 };
  for (int a = 0; a < 3; a += 1) {
    g_pre_vel[a] = s->vel[a];
    g_pre_w[a] = s->omega[a];
  }
  const double eb = break_energy(&bk);
  PS[part].energy += eb;
  detach(s, &bk);
  double pj[3], pw[3];
  live_pt(t->p[part].joint, pj);
  world_of(s, pj, pw);
  event_push(s, part, SIM_EVENT_BREAK, 1.0, 0.0, 0.0, eb, pw, 0, 0.0, g_surf);
  live_rebuild(s);
  for (int i = 0; i < t->n; i += 1) {
    PS[i].damage = part_damage(i);
  }
  effects_rebuild();
  return SIM_OK;
}

int crash_part_set_damage(SimState *s, int part, double dmg) {
  const Table *t = tab();
  if (!SIM_DAMAGE) {
    return SIM_ERR_BAD_STATE;
  }
  if (part <= 0 || part >= t->n || !finite(dmg) || !(dmg >= 0.0) || !(dmg <= 1.0)) {
    return SIM_ERR_BAD_ARG;
  }
  const PartDef *d = &t->p[part];
  PartState *p = &PS[part];
  if (!attached(part)) {
    return SIM_OK;
  }
  if (d->kind == SIM_PART_PROP) {
    if (dmg >= 1.0) {
      p->chip = 1.0;
      return crash_part_break(s, part);
    }
    p->chip = dmg;
    p->chip_evt = dmg;
  } else if (d->crush_s > 0.0) {
    p->crush = dmg * d->crush_d;
  } else if (d->kind == SIM_PART_ARM || d->kind == SIM_PART_CAMERA || d->kind == SIM_PART_ANTENNA
             || d->mat == SIM_MAT_WIRE || (d->mat == SIM_MAT_ALU && (d->kind == SIM_PART_BOOM || d->kind == SIM_PART_GEAR))) {
    /* An arm's tip up, which leans its motor's thrust inboard; a camera's
     * nose up. The axis is the horizontal one across the part's direction
     * from the CG. */
    double bmax = ARM_BEND_MAX;
    if (d->kind == SIM_PART_CAMERA || d->kind == SIM_PART_ANTENNA) bmax = KNOCK_MAX;
    else if (d->mat == SIM_MAT_WIRE) bmax = WIRE_BEND_MAX;
    else if (d->mat == SIM_MAT_ALU) bmax = ALU_BEND_MAX;
    const double c[3] = { t->cg[part][0], t->cg[part][1], 0.0 };
    const double cl = norm(c);
    double ax[3] = { 0.0, -1.0, 0.0 };
    if (d->kind != SIM_PART_CAMERA && cl > 1e-6) {
      ax[0] = c[1] / cl;
      ax[1] = -c[0] / cl;
    }
    for (int a = 0; a < 3; a += 1) p->bend[a] = dmg * bmax * ax[a];
  } else {
    p->strength = 1.0 - dmg;
  }
  p->damage = part_damage(part);
  effects_rebuild();
  (void)s;
  return SIM_OK;
}
