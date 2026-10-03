/*
 * flood.c: shallow water (Saint-Venant) on a uniform grid of square
 * cells, for water that goes where the ground lets it: the Itaipu dam's
 * spillway, its chute, the plunge pool and the river below, and every
 * opening a war tears in the dam (docs/FLOOD.md).
 *
 * THE FRAME. A cell (i, j) of a block covers x in x0 + [i, i + 1) dx
 * and z in z0 + [j, j + 1) dx, x and z the grid's plan axes (the host
 * maps them to its world), and every height is the map's y, metres up.
 *
 * BLOCKS. The grid is one block, or a fine block and a coarse one of
 * twice its cells joined along the fine block's south edge, the coarse
 * block's north (flood_add_block, flood_join): the water where little
 * happens costs a quarter. The cells are numbered block after block,
 * one array each for the whole grid. Each fine face along the join is
 * computed once, between its fine cell and the coarse cell beyond, and
 * applied to both, so what leaves one block is exactly what enters the
 * other, and water at rest across the join stays at rest. The state has no up axis: depth h, and the two plan components of
 * the unit discharge, hu along x and hv along z, m2/s. Nothing here is
 * converted from or to the plant's Z-up frame, because nothing here is
 * the plant's.
 *
 * THE SCHEME. First order finite volumes, explicit, at a fixed time step
 * the host chooses (FLOOD.md derives it from the fastest water and the
 * deepest). The flux through each face is HLL (Harten, Lax and van Leer,
 * with Davis's wave speeds and Toro's dry front speeds) between the two
 * cells' states after Audusse et al.'s hydrostatic reconstruction (SIAM
 * J. Sci. Comput. 25, 2004): each side's depth is cut to the water over
 * the higher of the two beds, and the pressure the cut takes away is
 * given back to that side alone. So water at rest over any bed stays at
 * rest, a wet cell against a dry one moves only what it has, and a wall
 * is nothing but a cell whose bed stands over the water: its face passes
 * no water and pushes back with the water's own pressure.
 *
 * Bed friction is Manning's, n per cell class (the host sets n for each),
 * applied semi implicitly after the fluxes, which damps a thin sheet's
 * velocity to zero rather than reversing it.
 *
 * LINKS are the water that goes through a structure rather than over the
 * ground: a gate, a hole, a pipe, a turbine. Each takes its discharge
 * from the mean water level over a set of upstream cells and a set of
 * downstream cells, takes that volume out of the first set (in
 * proportion to each cell's depth, so none goes dry before the rest) and
 * puts it into the second, moving at the velocity it leaves the opening
 * with, along the link's direction. The level downstream that drowns an
 * opening is the TAIL's, a third set (by default the second): the pool
 * the opening empties into, not the jet in front of it. Water over a
 * crest runs some two thirds of the head deep whatever is below, and a
 * link reading that as tailwater drowned itself (docs/FLOOD.md). An OPENING link's discharge is the
 * strips formula: each horizontal strip dz of an opening passes
 * Cd w sqrt(2 g (eta1 - max(z, eta2))) dz, integrated in closed form over
 * bands of constant width, which is the weir formula while the water is
 * under the opening's top, the large orifice formula once it is over,
 * and the drowned forms as the tailwater rises, all one continuous
 * function. A PIPE link is a pressurised burst: the head from the
 * upstream level to the burst (or to the tailwater over it) less the
 * pipe's losses, through the hole's area. A FIXED link carries the
 * discharge the host sets, while the upstream water stands over its
 * sill: a turbine at its gate opening.
 *
 * BOUNDARIES are runs of cells along an edge of the grid: a STAGE holds
 * the water outside at a level (the reservoir beyond the grid), an
 * INFLOW brings a discharge in (the river above), and a RATING lets
 * water out at Manning's normal depth for a slope (the river below).
 * Every other edge is a wall. What each boundary and link passes is
 * counted, so the volume in the grid is accounted for to rounding.
 *
 * DETERMINISM. Only + - * / and f64.sqrt, which IEEE 754 makes exact to
 * the bit on every host, a cube root by Newton's method from an integer
 * first guess, and loops in a fixed order. The same calls in the same
 * order give the same bits in Node and in every browser, and
 * flood_hash says whether they did (scripts/water-check.js).
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

#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include "libm/sim_math.h"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define FLOOD_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define FLOOD_EXPORT
#endif

/* Standard gravity, m/s2 (CGPM 1901). Water is never scaled. */
#define G 9.80665
#define HALF_G (0.5 * G)

/* A depth under this is dry: its velocity is zero and it carries no
 * momentum, m. A tenth of a millimetre, far under anything drawn. */
#define DRY 1e-4

#define CLASSES 16
#define BOUNDS_MAX 32
#define LINKS_MAX 128
#define BANDS_MAX 8
#define POOL_MAX 65536

#define TILE 16
#define BLOCKS_MAX 2

enum { SIDE_W = 0, SIDE_E = 1, SIDE_N = 2, SIDE_S = 3 };
enum { BOUND_STAGE = 1, BOUND_INFLOW = 2, BOUND_RATING = 3 };
enum { LINK_OPENING = 1, LINK_PIPE = 2, LINK_FIXED = 3 };

typedef struct {
  int nx, nz, n, off, tx, tz, toff;
  double x0, z0, dx, area;
} Block;

typedef struct {
  int blk, side, k0, k1, type;
  /* STAGE: the level outside. INFLOW: the discharge, m3/s, and each
   * cell's share of it (weights in the pool). RATING: the slope. */
  double level, q, slope;
  int w0;
  /* Volume in through this boundary since flood_init, m3 (out is
   * negative), and the last step's rate, m3/s. */
  double vol, rate;
} Bound;

typedef struct {
  double lo, hi, width, cd;
} Band;

typedef struct {
  int type, up0, nup, down0, ndown, tail0, ntail, nbands;
  /* The area of every one of its cells, m2: a link lies in one block. */
  double cell;
  Band band[BANDS_MAX];
  /* The plan direction the water leaves along, a vector whose length is
   * the share of the jet's speed that is horizontal. */
  double dirx, dirz;
  /* PIPE: the burst's elevation, the hole's area, the losses' K.
   * FIXED: the sill the upstream water must stand over, the discharge
   * and the outlet's area. */
  double z, area, loss, qset;
  /* Last step's discharge, m3/s, the volume passed, m3, and the levels
   * upstream and down the discharge was computed from, m. */
  double q, vol, eta1, eta2;
} Link;

static struct {
  Block blk[BLOCKS_MAX];
  int nblk, n, ntiles;
  /* The joined blocks, fine and coarse, or -1. */
  int fine, coarse;
  double dt;
  double *b, *h, *hu, *hv, *u, *v, *c, *rh, *ru, *rv, *fx, *fz;
  unsigned char *cls, *tileWet;
  double n2[CLASSES];
  Bound bound[BOUNDS_MAX];
  int nbound;
  Link link[LINKS_MAX];
  int nlink;
  int pool[POOL_MAX];
  double weight[POOL_MAX];
  int npool, nweight;
  double steps, courant, linkClip, clamped;
} F;

/* The cube root of x >= 0: a first guess from the exponent bits, then
 * Newton's iteration, which doubles the correct digits each time; four
 * take the guess's 5 % to under an ulp's worth. */
static double cbrt_pos(double x) {
  if (x <= 0.0) {
    return 0.0;
  }
  union { double d; uint64_t u; } g = { x };
  g.u = g.u / 3 + (uint64_t)0x2A9F7893782DA1CEULL;
  double y = g.d;
  y = (2.0 * y + x / (y * y)) / 3.0;
  y = (2.0 * y + x / (y * y)) / 3.0;
  y = (2.0 * y + x / (y * y)) / 3.0;
  y = (2.0 * y + x / (y * y)) / 3.0;
  return y;
}

/* The same first guess and two Newton steps: 1e-5 of the cube root,
 * which is all Manning's friction needs of it, and its cost per wet
 * cell every step is what the full one cost too much in. */
static inline double cbrt_rough(double x) {
  union { double d; uint64_t u; } g = { x };
  g.u = g.u / 3 + (uint64_t)0x2A9F7893782DA1CEULL;
  double y = g.d;
  y = (2.0 * y + x / (y * y)) / 3.0;
  y = (2.0 * y + x / (y * y)) / 3.0;
  return y;
}

static void freeArrays(void) {
  free(F.b); free(F.h); free(F.hu); free(F.hv); free(F.u); free(F.v); free(F.c);
  free(F.rh); free(F.ru); free(F.rv); free(F.fx); free(F.fz); free(F.cls); free(F.tileWet);
  F.b = F.h = F.hu = F.hv = F.u = F.v = F.c = F.rh = F.ru = F.rv = F.fx = F.fz = NULL;
  F.cls = F.tileWet = NULL;
}

static void freeAll(void) {
  freeArrays();
  memset(&F, 0, sizeof F);
  F.fine = F.coarse = -1;
}

/* Every array for the blocks there are, zeroed: a dry bed at 0. */
static int allocate(void) {
  freeArrays();
  size_t n = (size_t)F.n;
  F.b = calloc(n, sizeof(double));
  F.h = calloc(n, sizeof(double));
  F.hu = calloc(n, sizeof(double));
  F.hv = calloc(n, sizeof(double));
  F.u = calloc(n, sizeof(double));
  F.v = calloc(n, sizeof(double));
  F.c = calloc(n, sizeof(double));
  F.rh = calloc(n, sizeof(double));
  F.ru = calloc(n, sizeof(double));
  F.rv = calloc(n, sizeof(double));
  F.fx = calloc(n, sizeof(double));
  F.fz = calloc(n, sizeof(double));
  F.cls = calloc(n, 1);
  F.tileWet = calloc((size_t)F.ntiles, 1);
  if (!F.b || !F.h || !F.hu || !F.hv || !F.u || !F.v || !F.c || !F.rh || !F.ru || !F.rv || !F.fx || !F.fz || !F.cls || !F.tileWet) {
    freeAll();
    return -3;
  }
  return 0;
}

static int addBlock(int nx, int nz, double x0, double z0, double dx) {
  if (F.nblk >= BLOCKS_MAX || nx < 2 || nz < 2 || !(dx > 0.0)) {
    return -2;
  }
  Block *K = &F.blk[F.nblk];
  K->nx = nx; K->nz = nz; K->n = nx * nz; K->off = F.n;
  K->x0 = x0; K->z0 = z0; K->dx = dx; K->area = dx * dx;
  K->tx = (nx + TILE - 1) / TILE;
  K->tz = (nz + TILE - 1) / TILE;
  K->toff = F.ntiles;
  F.n += K->n;
  F.ntiles += K->tx * K->tz;
  int r = allocate();
  return r < 0 ? r : F.nblk++;
}

/* The block cell c is in. */
static const Block *blockOf(int c) {
  int k = F.nblk - 1;
  while (k > 0 && c < F.blk[k].off) k -= 1;
  return &F.blk[k];
}

/*
 * A grid nx by nz of dx metres from (x0, z0), stepped dt seconds at a
 * time. Every cell dry on a bed at 0 and of class 0 until the host
 * writes flood_bed, flood_cls and the state. 0 on success.
 */
FLOOD_EXPORT int flood_init(int nx, int nz, double x0, double z0, double dx, double dt) {
  freeAll();
  if (!(dt > 0.0)) {
    return -2;
  }
  F.dt = dt;
  int r = addBlock(nx, nz, x0, z0, dx);
  return r < 0 ? r : 0;
}

/*
 * A second block, after flood_init and before anything is written to the
 * state (the arrays are made again, all dry). Its cells follow block 0's.
 * Returns its index.
 */
FLOOD_EXPORT int flood_add_block(int nx, int nz, double x0, double z0, double dx) {
  if (F.nblk < 1 || F.nbound || F.nlink) {
    return -2;
  }
  return addBlock(nx, nz, x0, z0, dx);
}

/*
 * Join block `coarse` below block `fine`: twice its cells, as wide, its
 * north edge on the fine block's south edge. Anything else is refused.
 */
FLOOD_EXPORT int flood_join(int fine, int coarse) {
  if (fine < 0 || coarse < 0 || fine >= F.nblk || coarse >= F.nblk || fine == coarse || F.fine >= 0) {
    return -2;
  }
  const Block *A = &F.blk[fine], *C = &F.blk[coarse];
  if (C->dx != 2.0 * A->dx || C->x0 != A->x0 || 2 * C->nx != A->nx || C->z0 != A->z0 + A->nz * A->dx) {
    return -2;
  }
  F.fine = fine;
  F.coarse = coarse;
  return 0;
}

FLOOD_EXPORT double *flood_bed(void) { return F.b; }
FLOOD_EXPORT double *flood_h(void) { return F.h; }
FLOOD_EXPORT double *flood_hu(void) { return F.hu; }
FLOOD_EXPORT double *flood_hv(void) { return F.hv; }
FLOOD_EXPORT unsigned char *flood_cls(void) { return F.cls; }
/* The last step's water through each cell's face toward +x (fx) and
 * toward +z (fz), m2/s: a gauge across any line is their sum along it,
 * times dx, exactly what the update moved. */
FLOOD_EXPORT double *flood_fx(void) { return F.fx; }
FLOOD_EXPORT double *flood_fz(void) { return F.fz; }

/* Manning's n, s/m^(1/3), for cells of class k. */
FLOOD_EXPORT int flood_set_manning(int k, double n) {
  if (k < 0 || k >= CLASSES || n < 0.0) {
    return -2;
  }
  F.n2[k] = n * n;
  return 0;
}

/* ------------------------------------------------------- the boundaries */

static int sideLength(const Block *K, int side) {
  return side == SIDE_W || side == SIDE_E ? K->nz : K->nx;
}

static int sideCell(const Block *K, int side, int k) {
  switch (side) {
    case SIDE_W: return K->off + k * K->nx;
    case SIDE_E: return K->off + k * K->nx + K->nx - 1;
    case SIDE_N: return K->off + k;
    default: return K->off + (K->nz - 1) * K->nx + k;
  }
}

/* Whether a side of block k is the join, not an edge. */
static int joined(int k, int side) {
  return (k == F.fine && side == SIDE_S) || (k == F.coarse && side == SIDE_N);
}

/*
 * A boundary on `side` (0 west, i = 0; 1 east; 2 north, j = 0; 3 south)
 * of block `blk`, from cell k0 to k1 inclusive along it. Returns its
 * index. flood_bound is block 0's.
 */
FLOOD_EXPORT int flood_bound_in(int blk, int side, int k0, int k1, int type, double a) {
  if (blk < 0 || blk >= F.nblk || side < 0 || side > 3 || joined(blk, side)) {
    return -2;
  }
  const Block *K = &F.blk[blk];
  if (F.nbound >= BOUNDS_MAX || k0 < 0 || k1 < k0 || k1 >= sideLength(K, side)) {
    return -2;
  }
  if (type != BOUND_STAGE && type != BOUND_INFLOW && type != BOUND_RATING) {
    return -2;
  }
  if (type == BOUND_INFLOW && F.nweight + (k1 - k0 + 1) > POOL_MAX) {
    return -3;
  }
  Bound *B = &F.bound[F.nbound];
  memset(B, 0, sizeof *B);
  B->blk = blk; B->side = side; B->k0 = k0; B->k1 = k1; B->type = type;
  if (type == BOUND_STAGE) {
    B->level = a;
  } else if (type == BOUND_RATING) {
    B->slope = a;
  } else {
    B->q = a;
    /* The shares, by default each cell's conveyance at the depth it has
     * now, h^(5/3), and evenly where all are dry. */
    B->w0 = F.nweight;
    double sum = 0.0;
    for (int k = k0; k <= k1; k += 1) {
      double h = F.h[sideCell(K, side, k)];
      double w = h > DRY ? h * cbrt_pos(h) * cbrt_pos(h) : 0.0;
      F.weight[F.nweight + k - k0] = w;
      sum += w;
    }
    for (int k = k0; k <= k1; k += 1) {
      double *w = &F.weight[F.nweight + k - k0];
      *w = sum > 0.0 ? *w / sum : 1.0 / (double)(k1 - k0 + 1);
    }
    F.nweight += k1 - k0 + 1;
  }
  return F.nbound++;
}

FLOOD_EXPORT int flood_bound(int side, int k0, int k1, int type, double a) {
  return flood_bound_in(0, side, k0, k1, type, a);
}

/* A boundary's level (STAGE), discharge (INFLOW) or slope (RATING). */
FLOOD_EXPORT int flood_bound_set(int i, double a) {
  if (i < 0 || i >= F.nbound) {
    return -2;
  }
  Bound *B = &F.bound[i];
  if (B->type == BOUND_STAGE) B->level = a;
  else if (B->type == BOUND_INFLOW) B->q = a;
  else B->slope = a;
  return 0;
}

FLOOD_EXPORT double flood_bound_vol(int i) { return i >= 0 && i < F.nbound ? F.bound[i].vol : 0.0; }
FLOOD_EXPORT double flood_bound_rate(int i) { return i >= 0 && i < F.nbound ? F.bound[i].rate : 0.0; }

/* ------------------------------------------------------------- the links */

/*
 * A link of `type` from the nup cells listed at `up` to the ndown at
 * `down` (indices j nx + i). Returns its index; its bands, direction and
 * figures are set by the calls after.
 */
FLOOD_EXPORT int flood_link(int type, const int *up, int nup, const int *down, int ndown) {
  if (F.nlink >= LINKS_MAX || nup < 1 || ndown < 1 || F.npool + nup + ndown > POOL_MAX) {
    return -2;
  }
  if (type != LINK_OPENING && type != LINK_PIPE && type != LINK_FIXED) {
    return -2;
  }
  for (int k = 0; k < nup; k += 1) if (up[k] < 0 || up[k] >= F.n) return -2;
  for (int k = 0; k < ndown; k += 1) if (down[k] < 0 || down[k] >= F.n) return -2;
  const Block *K = blockOf(up[0]);
  for (int k = 0; k < nup; k += 1) if (blockOf(up[k]) != K) return -2;
  for (int k = 0; k < ndown; k += 1) if (blockOf(down[k]) != K) return -2;
  Link *L = &F.link[F.nlink];
  memset(L, 0, sizeof *L);
  L->cell = K->area;
  L->type = type;
  L->up0 = F.npool; L->nup = nup;
  memcpy(&F.pool[F.npool], up, (size_t)nup * sizeof(int));
  F.npool += nup;
  L->down0 = F.npool; L->ndown = ndown;
  memcpy(&F.pool[F.npool], down, (size_t)ndown * sizeof(int));
  F.npool += ndown;
  L->tail0 = L->down0; L->ntail = ndown;
  return F.nlink++;
}

/* The cells whose level drowns link i, in place of its downstream set. */
FLOOD_EXPORT int flood_link_tail(int i, const int *tail, int n) {
  if (i < 0 || i >= F.nlink || n < 1 || F.npool + n > POOL_MAX) return -2;
  for (int k = 0; k < n; k += 1) if (tail[k] < 0 || tail[k] >= F.n) return -2;
  Link *L = &F.link[i];
  for (int k = 0; k < n; k += 1) if (blockOf(tail[k])->area != L->cell) return -2;
  L->tail0 = F.npool; L->ntail = n;
  memcpy(&F.pool[F.npool], tail, (size_t)n * sizeof(int));
  F.npool += n;
  return 0;
}

/* An opening link's bands, n of them, as [lo, hi, width, cd] each. */
FLOOD_EXPORT int flood_link_bands(int i, const double *bands, int n) {
  if (i < 0 || i >= F.nlink || n < 0 || n > BANDS_MAX) {
    return -2;
  }
  Link *L = &F.link[i];
  for (int k = 0; k < n; k += 1) {
    const double *p = bands + 4 * k;
    if (!(p[1] >= p[0]) || p[2] < 0.0 || p[3] < 0.0) {
      return -2;
    }
    L->band[k].lo = p[0]; L->band[k].hi = p[1]; L->band[k].width = p[2]; L->band[k].cd = p[3];
  }
  L->nbands = n;
  return 0;
}

/* The plan direction the link's water leaves along (see Link). */
FLOOD_EXPORT int flood_link_dir(int i, double dx, double dz) {
  if (i < 0 || i >= F.nlink) return -2;
  F.link[i].dirx = dx;
  F.link[i].dirz = dz;
  return 0;
}

/* PIPE: burst elevation, hole area, loss K, Cd. FIXED: sill, outlet
 * area, unused, discharge. */
FLOOD_EXPORT int flood_link_pipe(int i, double z, double area, double loss, double c) {
  if (i < 0 || i >= F.nlink || area < 0.0 || loss < 0.0) return -2;
  Link *L = &F.link[i];
  L->z = z; L->area = area; L->loss = loss; L->qset = c;
  return 0;
}

FLOOD_EXPORT double flood_link_q(int i) { return i >= 0 && i < F.nlink ? F.link[i].q : 0.0; }
FLOOD_EXPORT double flood_link_vol(int i) { return i >= 0 && i < F.nlink ? F.link[i].vol : 0.0; }
/* The levels the last step's discharge came from: 0 upstream, 1 down. */
FLOOD_EXPORT double flood_link_level(int i, int side) {
  if (i < 0 || i >= F.nlink) return 0.0;
  return side ? F.link[i].eta2 : F.link[i].eta1;
}

/* The integral of sqrt(eta1 - max(z, eta2)) dz from lo to hi, z under
 * eta1: the strips formula for one band, less Cd w sqrt(2 g). */
static double stripIntegral(double eta1, double eta2, double lo, double hi) {
  if (hi > eta1) hi = eta1;
  if (!(hi > lo)) return 0.0;
  double s = 0.0;
  /* The drowned part, under the tailwater: the whole head eta1 - eta2. */
  if (eta2 > lo) {
    double top = eta2 < hi ? eta2 : hi;
    s += (top - lo) * sim_sqrt(eta1 - eta2);
    lo = top;
  }
  if (hi > lo) {
    double a = eta1 - lo;
    double c = eta1 - hi;
    s += (2.0 / 3.0) * (a * sim_sqrt(a) - c * sim_sqrt(c));
  }
  return s;
}

/* A cell set's mean level over its wet cells, the bed's highest where
 * none is wet, and the volume over `floor` in it. */
static double levelOf(int p0, int n, double *wet) {
  double sum = 0.0, top = -1e300, depth = 0.0;
  int k, count = 0;
  for (k = 0; k < n; k += 1) {
    int c = F.pool[p0 + k];
    double b = F.b[c], h = F.h[c];
    if (b > top) top = b;
    depth += h;
    if (h > DRY) {
      sum += b + h;
      count += 1;
    }
  }
  *wet = depth;
  return count ? sum / count : top;
}

/* The speed water leaves an opening at, from its discharge per metre q
 * and the opening's height a: through a contracted jet (Cc 0.61) when
 * it runs full, at critical depth over a weir, whichever is thinner. */
static double jetSpeed(double qw, double a) {
  if (!(qw > 0.0)) return 0.0;
  double yc = cbrt_pos(qw * qw / G);
  double d = 0.61 * a;
  if (yc < d) d = yc;
  return qw / d;
}

static void stepLinks(void) {
  double dt = F.dt;
  for (int i = 0; i < F.nlink; i += 1) {
    Link *L = &F.link[i];
    double up, down, tail;
    double eta1 = levelOf(L->up0, L->nup, &up);
    levelOf(L->down0, L->ndown, &down);
    double eta2 = levelOf(L->tail0, L->ntail, &tail);
    double q = 0.0, speed = 0.0;
    int flip = 0;
    L->eta1 = eta1;
    L->eta2 = eta2;
    if (L->type == LINK_OPENING) {
      /* Backward flow where the downstream side stands higher. */
      if (eta2 > eta1) {
        double t = eta1; eta1 = eta2; eta2 = t;
        flip = 1;
      }
      double wtot = 0.0, atop = 0.0, alo = 1e300;
      for (int k = 0; k < L->nbands; k += 1) {
        const Band *B = &L->band[k];
        q += B->cd * B->width * stripIntegral(eta1, eta2, B->lo, B->hi);
        if (B->width > wtot) wtot = B->width;
        if (B->hi > atop) atop = B->hi;
        if (B->lo < alo) alo = B->lo;
      }
      q *= sim_sqrt(2.0 * G);
      speed = wtot > 0.0 ? jetSpeed(q / wtot, atop - alo) : 0.0;
    } else if (L->type == LINK_PIPE) {
      /* The head over the burst, or over the tailwater drowning it. */
      double out = eta2 > L->z ? eta2 : L->z;
      if (eta1 > out) {
        speed = sim_sqrt(2.0 * G * (eta1 - out) / (1.0 + L->loss));
        q = L->qset * L->area * speed;
      }
    } else if (eta1 > L->z) {
      q = L->qset;
      speed = L->area > 0.0 ? q / L->area : 0.0;
    }
    /* The step takes at most half of what the source side holds, so no
     * cell goes negative; counted when it binds, which a check reads. */
    double avail = (flip ? down : up) * L->cell;
    double vol = q * dt;
    if (vol > 0.5 * avail) {
      vol = 0.5 * avail;
      F.linkClip += 1.0;
    }
    if (!(vol > 0.0)) {
      L->q = 0.0;
      continue;
    }
    int s0 = flip ? L->down0 : L->up0, ns = flip ? L->ndown : L->nup;
    int d0 = flip ? L->up0 : L->down0, nd = flip ? L->nup : L->ndown;
    double held = flip ? down : up;
    /* Out of the source cells in proportion to their depth (each gives
     * at most half of its own, since vol is at most half of all), their
     * velocity kept: the water that leaves takes its momentum with it. */
    double depth = vol / L->cell;
    double sum = 0.0;
    for (int k = 0; k < ns; k += 1) {
      int c = F.pool[s0 + k];
      double h = F.h[c];
      if (!(h > 0.0)) continue;
      double dh = depth * (h / held);
      double keep = (h - dh) / h;
      F.h[c] = h - dh;
      F.hu[c] *= keep;
      F.hv[c] *= keep;
      sum += dh;
    }
    double taken = sum * L->cell;
    /* Into the target cells evenly, moving along dir at the jet speed. */
    double each = sum / nd;
    double sx = (flip ? -L->dirx : L->dirx) * speed;
    double sz = (flip ? -L->dirz : L->dirz) * speed;
    for (int k = 0; k < nd; k += 1) {
      int c = F.pool[d0 + k];
      F.h[c] += each;
      F.hu[c] += each * sx;
      F.hv[c] += each * sz;
    }
    L->q = (flip ? -taken : taken) / dt;
    L->vol += flip ? -taken : taken;
  }
}

/* ----------------------------------------------------------- the fluxes */

/*
 * The face between a left and a right state, along the face's normal
 * (n) and tangent (t): hydrostatic reconstruction then HLL. Writes the
 * mass flux and the normal and tangential momentum fluxes, and the two
 * sides' pressure corrections (each added to its own side's normal
 * momentum flux).
 */
static inline void faceFlux(double hL, double unL, double utL, double bL, double cL,
                            double hR, double unR, double utR, double bR, double cR,
                            double *fh, double *fn, double *ft, double *pL, double *pR) {
  double bs = bL > bR ? bL : bR;
  double hl = hL + bL - bs;
  double hr = hR + bR - bs;
  if (hl < 0.0) hl = 0.0;
  if (hr < 0.0) hr = 0.0;
  /* A film under DRY over the higher bed is no water at all. */
  if (!(hl > DRY)) { hl = 0.0; unL = 0.0; utL = 0.0; }
  if (!(hr > DRY)) { hr = 0.0; unR = 0.0; utR = 0.0; }
  *pL = HALF_G * (hL * hL - hl * hl);
  *pR = HALF_G * (hR * hR - hr * hr);
  if (hl == 0.0 && hr == 0.0) {
    *fh = 0.0; *fn = 0.0; *ft = 0.0;
    return;
  }
  /* The side the reconstruction left whole keeps the celerity prepare
   * found for it; only a cut side needs its own. */
  double cl = hl == hL ? cL : sim_sqrt(G * hl);
  double cr = hr == hR ? cR : sim_sqrt(G * hr);
  double qnl = hl * unL, qnr = hr * unR;
  double fhl = qnl, fnl = qnl * unL + HALF_G * hl * hl, ftl = qnl * utL;
  double fhr = qnr, fnr = qnr * unR + HALF_G * hr * hr, ftr = qnr * utR;
  if (hl == hr && unL == unR && utL == utR) {
    /* One state both sides: its own flux, exactly, so water at rest
     * stays at rest to the bit on a flat bed. */
    *fh = fhl; *fn = fnl; *ft = ftl;
    return;
  }
  double sl, sr;
  if (hl == 0.0) {
    sl = unR - 2.0 * cr;
    sr = unR + cr;
  } else if (hr == 0.0) {
    sl = unL - cl;
    sr = unL + 2.0 * cl;
  } else {
    sl = unL - cl < unR - cr ? unL - cl : unR - cr;
    sr = unL + cl > unR + cr ? unL + cl : unR + cr;
  }
  if (sl >= 0.0) {
    *fh = fhl; *fn = fnl; *ft = ftl;
  } else if (sr <= 0.0) {
    *fh = fhr; *fn = fnr; *ft = ftr;
  } else {
    double inv = 1.0 / (sr - sl);
    double ss = sl * sr;
    *fh = (sr * fhl - sl * fhr + ss * (hr - hl)) * inv;
    *fn = (sr * fnl - sl * fnr + ss * (qnr - qnl)) * inv;
    *ft = (sr * ftl - sl * ftr + ss * (hr * utR - hl * utL)) * inv;
  }
}

/* Velocities from the state, and which tiles hold water or touch a
 * tile that does. A dry cell's velocity is zero and so is its
 * momentum. */
static void prepare(void) {
  memset(F.tileWet, 0, (size_t)F.ntiles);
  for (int bk = 0; bk < F.nblk; bk += 1) {
  const Block *K = &F.blk[bk];
  int nx = K->nx;
  double vmax = 0.0;
  for (int j = 0; j < K->nz; j += 1) {
    for (int i = 0; i < nx; i += 1) {
      int c = K->off + j * nx + i;
      double h = F.h[c];
      if (h > DRY) {
        double u = F.hu[c] / h, v = F.hv[c] / h;
        F.u[c] = u;
        F.v[c] = v;
        double ce = sim_sqrt(G * h);
        F.c[c] = ce;
        double s = (u < 0.0 ? -u : u) + (v < 0.0 ? -v : v) + 2.0 * ce;
        if (s > vmax) vmax = s;
        F.tileWet[K->toff + (j / TILE) * K->tx + i / TILE] = 1;
      } else {
        F.u[c] = 0.0;
        F.v[c] = 0.0;
        F.c[c] = 0.0;
        F.hu[c] = 0.0;
        F.hv[c] = 0.0;
        if (h < 0.0) {
          /* Rounding's negative depth, set to none and counted: the
           * Courant condition keeps it to the last few bits. */
          F.clamped -= h * K->area;
          F.h[c] = 0.0;
        }
      }
    }
  }
  /* 2D, unsplit: both directions' signals in one step. */
  double courant = vmax * F.dt / K->dx;
  if (courant > F.courant) F.courant = courant;
  }
}

/* Whether the tile (ti, tj) or one of its four neighbours holds water. */
static int tileLive(const Block *K, int ti, int tj) {
  const unsigned char *w = F.tileWet + K->toff;
  int tx = K->tx;
  if (w[tj * tx + ti]) return 1;
  if (ti > 0 && w[tj * tx + ti - 1]) return 1;
  if (ti + 1 < tx && w[tj * tx + ti + 1]) return 1;
  if (tj > 0 && w[(tj - 1) * tx + ti]) return 1;
  if (tj + 1 < K->tz && w[(tj + 1) * tx + ti]) return 1;
  return 0;
}

/* The faces inside the grid, x faces then z faces, tile by tile; a face
 * belongs to the tile of the cell on its low side. */
static void interiorFluxes(const Block *K) {
  int nx = K->nx, nz = K->nz;
  const double *b = F.b + K->off, *h = F.h + K->off, *u = F.u + K->off, *v = F.v + K->off, *cc = F.c + K->off;
  double *rh = F.rh + K->off, *ru = F.ru + K->off, *rv = F.rv + K->off, *fx = F.fx + K->off, *fz = F.fz + K->off;
  for (int tj = 0; tj < K->tz; tj += 1) {
    for (int ti = 0; ti < K->tx; ti += 1) {
      if (!tileLive(K, ti, tj)) continue;
      int j0 = tj * TILE, j1 = j0 + TILE < nz ? j0 + TILE : nz;
      int i0 = ti * TILE, i1 = i0 + TILE < nx ? i0 + TILE : nx;
      for (int j = j0; j < j1; j += 1) {
        for (int i = i0; i < i1; i += 1) {
          int c = j * nx + i;
          double fh, fn, ft, pL, pR;
          if (i + 1 < nx) {
            int r = c + 1;
            if (h[c] > DRY || h[r] > DRY) {
              faceFlux(h[c], u[c], v[c], b[c], cc[c], h[r], u[r], v[r], b[r], cc[r], &fh, &fn, &ft, &pL, &pR);
              fx[c] = fh;
              rh[c] -= fh; ru[c] -= fn + pL; rv[c] -= ft;
              rh[r] += fh; ru[r] += fn + pR; rv[r] += ft;
            } else {
              ru[c] -= HALF_G * h[c] * h[c];
              ru[r] += HALF_G * h[r] * h[r];
            }
          }
          if (j + 1 < nz) {
            int r = c + nx;
            if (h[c] > DRY || h[r] > DRY) {
              faceFlux(h[c], v[c], u[c], b[c], cc[c], h[r], v[r], u[r], b[r], cc[r], &fh, &fn, &ft, &pL, &pR);
              fz[c] = fh;
              rh[c] -= fh; rv[c] -= fn + pL; ru[c] -= ft;
              rh[r] += fh; rv[r] += fn + pR; ru[r] += ft;
            } else {
              rv[c] -= HALF_G * h[c] * h[c];
              rv[r] += HALF_G * h[r] * h[r];
            }
          }
        }
      }
    }
  }
}

/*
 * The join: each fine cell of the fine block's last row against the
 * coarse cell beyond its south face, half of that cell's north face. The
 * fine side takes the face's fluxes per metre as any face's; the coarse
 * side takes them over its whole face, so times dx_fine / dx_coarse.
 */
static void joinFluxes(void) {
  if (F.fine < 0) return;
  const Block *A = &F.blk[F.fine], *C = &F.blk[F.coarse];
  const double *b = F.b, *h = F.h, *u = F.u, *v = F.v, *cc = F.c;
  double share = A->dx / C->dx;
  for (int i = 0; i < A->nx; i += 1) {
    int f = A->off + (A->nz - 1) * A->nx + i;
    int g = C->off + i / 2;
    double fh, fn, ft, pL, pR;
    if (!(h[f] > DRY) && !(h[g] > DRY)) {
      F.rv[f] -= HALF_G * h[f] * h[f];
      F.rv[g] += share * HALF_G * h[g] * h[g];
      continue;
    }
    faceFlux(h[f], v[f], u[f], b[f], cc[f], h[g], v[g], u[g], b[g], cc[g], &fh, &fn, &ft, &pL, &pR);
    F.fz[f] = fh;
    F.rh[f] -= fh; F.rv[f] -= fn + pL; F.ru[f] -= ft;
    F.rh[g] += share * fh; F.rv[g] += share * (fn + pR); F.ru[g] += share * ft;
  }
}

/*
 * The grid's own edges. A wall's face pushes back with the cell's own
 * pressure and passes nothing. A boundary's face is a face to a ghost
 * cell outside, on the same bed, through faceFlux like any other.
 * `out` is the outward sign along the face's normal axis.
 */
static void edgeFace(const Block *K, int c, int side, const Bound *B, double weight, double *flow) {
  int alongX = side == SIDE_W || side == SIDE_E;
  double out = side == SIDE_E || side == SIDE_S ? 1.0 : -1.0;
  double h = F.h[c], b = F.b[c];
  double un = alongX ? F.u[c] : F.v[c];
  double ut = alongX ? F.v[c] : F.u[c];
  double *rn = alongX ? F.ru : F.rv;
  double *rt = alongX ? F.rv : F.ru;
  double fh = 0.0, fn = HALF_G * h * h, ft = 0.0;
  if (B && B->type == BOUND_STAGE) {
    double hg = B->level - b;
    if (hg < 0.0) hg = 0.0;
    double pL, pR;
    /* Inside on the left: the normal axis points outward. */
    faceFlux(h, out * un, ut, b, sim_sqrt(G * h), hg, out * un, ut, b, sim_sqrt(G * hg), &fh, &fn, &ft, &pL, &pR);
    fn += pL;
    fh *= out; ft *= out;
  } else if (B && B->type == BOUND_RATING) {
    double hg = h, ug = 0.0;
    double n2 = F.n2[F.cls[c]];
    if (h > DRY && n2 > 0.0) {
      double r = cbrt_pos(h);
      ug = r * r * sim_sqrt(B->slope / n2);
    }
    double pL, pR;
    faceFlux(h, out * un, ut, b, sim_sqrt(G * h), hg, ug, ut, b, sim_sqrt(G * hg), &fh, &fn, &ft, &pL, &pR);
    fn += pL;
    fh *= out; ft *= out;
  } else if (B && B->type == BOUND_INFLOW) {
    /* The cell's share of the discharge, per metre of face, inward. */
    double q = B->q * weight / K->dx;
    double hc = cbrt_pos(q * q / G);
    double hh = h > hc ? h : hc;
    fh = -out * q;
    fn = (hh > DRY ? q * q / hh : 0.0) + HALF_G * h * h;
    ft = 0.0;
  }
  /* The face is on the cell's outward side: its flux leaves the cell. */
  F.rh[c] -= out * fh;
  rn[c] -= out * fn;
  rt[c] -= out * ft;
  *flow -= out * fh * K->dx;
}

static void edgeFluxes(void) {
  for (int bk = 0; bk < F.nblk; bk += 1) {
  const Block *K = &F.blk[bk];
  for (int side = 0; side < 4; side += 1) {
    if (joined(bk, side)) continue;
    int len = sideLength(K, side);
    for (int k = 0; k < len; k += 1) {
      int c = sideCell(K, side, k);
      const Bound *B = NULL;
      double w = 0.0;
      for (int i = 0; i < F.nbound; i += 1) {
        const Bound *b = &F.bound[i];
        if (b->blk == bk && b->side == side && k >= b->k0 && k <= b->k1) {
          B = b;
          if (b->type == BOUND_INFLOW) w = F.weight[b->w0 + k - b->k0];
          break;
        }
      }
      double flow = 0.0;
      edgeFace(K, c, side, B, w, &flow);
      if (B) {
        ((Bound *)B)->rate += flow;
      }
    }
  }
  }
}

/* Manning's friction, semi implicit: each wet cell's discharge divided by
 * 1 + dt g n2 |u| / h^(4/3). */
static void friction(void) {
  double dt = F.dt;
  for (int c = 0; c < F.n; c += 1) {
    double h = F.h[c];
    if (!(h > DRY)) continue;
    double n2 = F.n2[F.cls[c]];
    if (n2 == 0.0) continue;
    double qx = F.hu[c], qy = F.hv[c];
    double q = sim_sqrt(qx * qx + qy * qy);
    if (q == 0.0) continue;
    double h43 = h * cbrt_rough(h);
    double k = 1.0 + dt * G * n2 * q / (h * h43);
    F.hu[c] = qx / k;
    F.hv[c] = qy / k;
  }
}

/* One step: velocities, every face's flux into the residuals, the
 * update, the links, then friction. */
static void step(void) {
  memset(F.rh, 0, (size_t)F.n * sizeof(double));
  memset(F.ru, 0, (size_t)F.n * sizeof(double));
  memset(F.rv, 0, (size_t)F.n * sizeof(double));
  memset(F.fx, 0, (size_t)F.n * sizeof(double));
  memset(F.fz, 0, (size_t)F.n * sizeof(double));
  for (int i = 0; i < F.nbound; i += 1) F.bound[i].rate = 0.0;
  prepare();
  for (int bk = 0; bk < F.nblk; bk += 1) interiorFluxes(&F.blk[bk]);
  joinFluxes();
  edgeFluxes();
  for (int bk = 0; bk < F.nblk; bk += 1) {
    const Block *K = &F.blk[bk];
    double k = F.dt / K->dx;
    for (int c = K->off; c < K->off + K->n; c += 1) {
      double rh = F.rh[c];
      if (rh == 0.0 && F.ru[c] == 0.0 && F.rv[c] == 0.0) continue;
      F.h[c] += k * rh;
      F.hu[c] += k * F.ru[c];
      F.hv[c] += k * F.rv[c];
    }
  }
  for (int i = 0; i < F.nbound; i += 1) {
    F.bound[i].vol += F.bound[i].rate * F.dt;
  }
  stepLinks();
  friction();
  F.steps += 1.0;
}

/* n steps. What went wrong, if anything did, is in flood_stat. */
FLOOD_EXPORT int flood_step(int n) {
  for (int s = 0; s < n; s += 1) {
    step();
  }
  return 0;
}

/* --------------------------------------------------------- the readings */

/* Water in the grid, m3. */
FLOOD_EXPORT double flood_volume(void) {
  double v = 0.0;
  for (int bk = 0; bk < F.nblk; bk += 1) {
    const Block *K = &F.blk[bk];
    double s = 0.0;
    for (int c = K->off; c < K->off + K->n; c += 1) s += F.h[c];
    v += s * K->area;
  }
  return v;
}

/* The figures a check or a host reads: 0 steps, 1 the largest Courant
 * number seen (and 2 resets it), 3 how often a link's take was capped
 * at half what its source held, 4 the most negative depth now, 5 the
 * volume rounding's negative depths were raised by, m3. */
FLOOD_EXPORT double flood_stat(int k) {
  switch (k) {
    case 0: return F.steps;
    case 1: return F.courant;
    case 2: { double c = F.courant; F.courant = 0.0; return c; }
    case 3: return F.linkClip;
    case 4: {
      double m = 0.0;
      for (int c = 0; c < F.n; c += 1) if (F.h[c] < m) m = F.h[c];
      return m;
    }
    case 5: return F.clamped;
    default: return 0.0;
  }
}

/* FNV-1a, 64 bit, over the state's bytes (h, hu, hv, in that order), at
 * out as two little endian words. */
FLOOD_EXPORT void flood_hash(uint32_t *out) {
  uint64_t x = 0xcbf29ce484222325ULL;
  const double *arrs[3] = { F.h, F.hu, F.hv };
  for (int a = 0; a < 3; a += 1) {
    const unsigned char *p = (const unsigned char *)arrs[a];
    size_t n = (size_t)F.n * sizeof(double);
    for (size_t i = 0; i < n; i += 1) {
      x ^= p[i];
      x *= 0x100000001b3ULL;
    }
  }
  out[0] = (uint32_t)x;
  out[1] = (uint32_t)(x >> 32);
}
