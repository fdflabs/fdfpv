/*
 * sim.c: Stage 1 physics module entry points and the fixed-step driver.
 *
 * The module is one deterministic unit stepped at exactly 1000 Hz. Input
 * samples carry their own timestamps and are consumed by that timestamp:
 * a sample is applied before the 1 ms step containing it executes, never
 * by arrival time. How the host batches sim_step calls cannot affect the
 * trajectory; there is no frame time anywhere in this file.
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

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define SIM_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define SIM_EXPORT
#endif

#define INPUT_QUEUE_CAP 8192

typedef struct {
  long long t_us;
  double ch[4]; /* roll, pitch, yaw, throttle */
} InputSample;

static SimState S;
static int g_initialised = 0;
static double g_current_rc[4] = { 0.0, 0.0, 0.0, 0.0 };
static double g_override[SIM_MOTOR_COUNT] = { -1.0, -1.0, -1.0, -1.0 };
static InputSample g_queue[INPUT_QUEUE_CAP];
static int g_q_head = 0;
static int g_q_tail = 0;
static long long g_last_input_us = -1;
static int g_stand_on = 0;
static double g_stand_hinge[3];
/* Underside of the parked pose, metres below the CG. Matches REST_HEIGHT
 * in the shell so the hinge sits on the foam, not in the air above it.
 * Per airframe since the whoop landed: a 23 mm thick machine does not park
 * 45 mm off the deck. */
#define STAND_HINGE_Z (-PLANT.hull_hz_down)

/*
 * Ground plane, plant frame. Off unless the shell raises it, so a harness
 * replay that never calls sim_set_ground cannot see a floor.
 *
 * The hull is an OBB around the 5 inch airframe. Half extents in x and y
 * are the motor offset plus a motor-bell radius, so a side arrival contacts
 * an arm, not empty air. Down is REST_HEIGHT so a level craft at plant z = 0
 * sits on a plane at z = -0.045, matching the parked pose. Up is the prop
 * disc / camera stack, which is what an inverted craft rests on.
 */
static int g_ground_on = 0;
static double g_ground_n[3] = { 0.0, 0.0, 1.0 };
/* Seeded to the five inch's parked height and re-seated by
 * sim_set_airframe, because a static initialiser cannot read PLANT. A host
 * that raises its own ground plane overwrites this on the first call
 * anyway; it matters only to a host that never does. */
static double g_ground_d = -0.045;
static double g_ground_mu = 1.40;
static double g_ground_e = 0.0;
static int g_ground_hits = 0;
static int g_ground_projected = 0;
static int g_ground_near = 0;
/* The friction and restitution the ground contact uses this step: the
 * plane's own, or its material's once the host has named one
 * (sim_set_ground_material). With the default material they are the same
 * two doubles, so nothing a host that never names one does can move. */
static double g_gmu = 1.40;
static double g_ge = 0.0;

/* The hull half extents are the airframe's now. The five inch's are the
 * numbers that used to be here; the whoop's are a third of them, which is
 * why they could not stay a #define. */
#define CONTACT_HX (PLANT.hull_hx)
#define CONTACT_HY (PLANT.hull_hy)
#define CONTACT_HZ_DOWN (PLANT.hull_hz_down)
#define CONTACT_HZ_UP (PLANT.hull_hz_up)
#define CONTACT_CORNERS 8
#define CONTACT_ITERS 4
#define CONTACT_SLOP 0.002
#define CONTACT_BAUMGARTE 0.15
#define CONTACT_REST_VN 0.25
/*
 * The knee in the restitution curve, metres per second.
 *
 * A wall tap should push the quad off a little and let a pilot fly out
 * of it, and it should do that the SAME WAY at every speed. Two shapes
 * have been tried here and both were wrong in the way a pilot notices.
 *
 * 14 m/s of linear falloff was a steel number on a machine made of
 * nylon, carbon plate and a strapped-on lithium brick: a fast hit sprang
 * back. Dropping it to 6 fixed that and broke something worse. The
 * falloff is clamped at the bottom, so the product e * v rose to 0.225
 * m/s at 3 m/s, fell off a cliff to 0.043 by 5.7 m/s where the clamp
 * bites, and then CLIMBED again with speed. A 5 m/s tap came off three
 * times harder than a 6 m/s one. Nothing in the world behaves like that
 * and a pilot cannot learn it.
 *
 * What a structure actually does is store a bounded amount of elastic
 * energy. Below the knee the contact is elastic at the material's own
 * coefficient. Above it the compliant part of the airframe, the skin,
 * the arms, the battery strap, has bottomed out, and everything past
 * that goes into deformation and does not come back. So the SEPARATION
 * SPEED saturates while the impact keeps growing:
 *
 *   e_used = e * min(1, CONTACT_E_KNEE / closing)
 *
 * which is e * closing while slow, and e * CONTACT_E_KNEE for ever
 * after. Monotonic, no cliff, and bounded by the material: a wall caps
 * at 0.26 m/s, PVC at 0.37, bark at 0.20, the train at 0.10, so the
 * materials still differ at speed instead of collapsing together.
 *
 * The low-speed end is untouched. CONTACT_E_FLOOR still holds a gentle
 * touch off the surface: a light tap welding on was the first half of
 * this ticket and must not come back to fix the second half.
 */
#define CONTACT_E_KNEE 1.7
#define CONTACT_STATIC_VT 0.08
#define CONTACT_BIAS_MAX 1.2
#define CONTACT_POS_PUSH 0.20
/*
 * A light tap must not weld.
 *
 * Restitution used to fall off a cliff to zero below CONTACT_REST_VN,
 * which took every joule out of a 20 cm/s touch and left Coulomb
 * friction holding the hull on the face. The owner's report was that
 * tapping a wall with the base of the quad sticks. It ramps to a floor
 * now instead of to nothing, so a slow touch still leaves the surface.
 * The floor is a fraction of the material's own coefficient, so grass
 * (e = 0) still cannot bounce and only a hard face can push back.
 */
#define CONTACT_E_FLOOR 0.35
/*
 * Contact patch radius for resting spin friction, metres.
 *
 * A belly on the ground is not a point. The plane carries the weight
 * over the area between the arms, and a yaw about the normal has to
 * drag the whole of that patch. Half the motor offset is the honest
 * lever for a four-arm footprint.
 */
#define CONTACT_PATCH_R (PLANT.contact_patch_r)
/*
 * Largest impulse arm a caller may hand sim_contact_at, metres. The
 * craft sweeps 0.1735 m to a blade tip, so anything past that is not a
 * point on this airframe and must not become a moment.
 */
#define CONTACT_ARM_MAX (PLANT.contact_arm_max)
/* Lens glass, plant body metres. Mount is 0.080 forward and 0.018 up;
 * herocraft.js puts the glass another 0.024 past the mount. The hull
 * OBB stops at 0.094, so a nose-down arrival used to park the lens
 * under the plane. Projection samples this point too. */
#define CAMERA_BODY_X (PLANT.camera_x)
#define CAMERA_BODY_Y (PLANT.camera_y)
#define CAMERA_BODY_Z (PLANT.camera_z)
#define CONTACT_INVERT_UPZ -0.50
/* Halo invert-stop is props-down only. A roll or flip that is only
 * partly inverted can put a corner in the 8 mm slab with the CG still
 * a decimetre up; that must not freeze. */
#define CONTACT_INVERT_HALO_UPZ -0.90
#define CONTACT_SLIDE_STOP 0.12
#define CONTACT_OMEGA_STOP 0.35
/* cos 18 degrees: a wing this far from flat still has a corner to fall on. */
#define CONTACT_WING_REST_UPZ 0.95
#define CONTACT_NEAR 0.008
/* Inbound normal faster than this in the 8 mm halo is a live arrival,
 * not a seated props-down slide. Invert-stop on near-only used to
 * freeze a flip the moment a corner entered that slab, with the CG
 * still a decimetre up and hits still 0. */
#define CONTACT_INVERT_DIVE 0.20
/* Deepest-pen sentinel. Must be a large negative: starting at 0 made
 * every airborne hull look "near" the plane (worst stayed 0), so an
 * inverted flip in free air ran invert-stop and froze the craft. */
#define CONTACT_PEN_NONE (-1.0e9)

/*
 * The eight hull corners, rebuilt whenever the airframe changes rather than
 * written as an initialiser, because the half extents are no longer
 * compile time constants. Order is EXACTLY the order the initialiser had:
 * the contact solver iterates it and the projection reports "worst corner"
 * by index, so a reordering would silently change which corner wins a tie.
 */
static double CONTACT_CORNER[CONTACT_CORNERS][3];

static void contact_build_corners(void) {
  const double hx = CONTACT_HX, hy = CONTACT_HY;
  const double dn = -CONTACT_HZ_DOWN, up = CONTACT_HZ_UP;
  const double src[CONTACT_CORNERS][3] = {
    { -hx, -hy, dn }, { hx, -hy, dn }, { -hx, hy, dn }, { hx, hy, dn },
    { -hx, -hy, up }, { hx, -hy, up }, { -hx, hy, up }, { hx, hy, up },
  };
  for (int c = 0; c < CONTACT_CORNERS; c += 1) {
    for (int a = 0; a < 3; a += 1) {
      CONTACT_CORNER[c][a] = src[c][a];
    }
  }
}

SIM_EXPORT int sim_abi_version(void) { return SIM_ABI_VERSION; }

static void reset_dynamics(void) {
  crash_reset();
  plant_reset(&S);
  plant_wing_reset();
  bridge_reset();
  g_q_head = 0;
  g_q_tail = 0;
  g_last_input_us = -1;
  for (int i = 0; i < 4; i += 1) {
    g_current_rc[i] = 0.0;
  }
  for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
    g_override[m] = -1.0;
  }
  g_stand_on = 0;
  g_ground_on = 0;
  g_ground_hits = 0;
  g_ground_projected = 0;
  g_ground_near = 0;
}

SIM_EXPORT int sim_init(const unsigned char *diff_utf8, int len) {
  if (diff_utf8 == 0 || len < 0) {
    return SIM_ERR_BAD_ARG;
  }
  const int rc = bridge_parse_config(diff_utf8, len);
  if (rc != SIM_OK) {
    return rc;
  }
  if (!g_initialised) {
    S.cell_voltage_oc = 4.2;
  }
  g_initialised = 1;
  contact_build_corners();
  reset_dynamics();
  return SIM_OK;
}

SIM_EXPORT int sim_reset(void) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  reset_dynamics();
  return SIM_OK;
}

SIM_EXPORT int sim_set_cell_voltage(double volts) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  if (!(volts > 0.5) || !(volts < 5.0)) {
    return SIM_ERR_BAD_ARG;
  }
  S.cell_voltage_oc = volts;
  return SIM_OK;
}

SIM_EXPORT int sim_input(double t_seconds, double roll, double pitch, double yaw,
                         double throttle) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  if (!(t_seconds >= 0.0)) {
    return SIM_ERR_BAD_ARG;
  }
  const long long t_us = (long long)(t_seconds * 1e6 + 0.5);
  if (t_us < g_last_input_us) {
    return SIM_ERR_BAD_ARG;
  }
  const int next = (g_q_tail + 1) % INPUT_QUEUE_CAP;
  if (next == g_q_head) {
    return SIM_ERR_BAD_STATE;
  }
  g_queue[g_q_tail].t_us = t_us;
  g_queue[g_q_tail].ch[0] = roll;
  g_queue[g_q_tail].ch[1] = pitch;
  g_queue[g_q_tail].ch[2] = yaw;
  g_queue[g_q_tail].ch[3] = throttle;
  g_q_tail = next;
  g_last_input_us = t_us;
  return SIM_OK;
}

SIM_EXPORT int sim_rest(void) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  for (int i = 0; i < 3; i += 1) {
    S.vel[i] = 0.0;
    S.omega[i] = 0.0;
  }
  return SIM_OK;
}

/* IEEE NaN and Inf without math.h: NaN != NaN, Inf - Inf is NaN. */
static int sim_finite(double x) {
  return x == x && x - x == 0.0;
}

/* Body vector to world, plant quaternion. */
static void contact_rotate(const double v[3], double out[3]) {
  const double w = S.quat[0];
  const double x = S.quat[1];
  const double y = S.quat[2];
  const double z = S.quat[3];
  const double ux = 2.0 * (y * v[2] - z * v[1]);
  const double uy = 2.0 * (z * v[0] - x * v[2]);
  const double uz = 2.0 * (x * v[1] - y * v[0]);
  out[0] = v[0] + w * ux + (y * uz - z * uy);
  out[1] = v[1] + w * uy + (z * ux - x * uz);
  out[2] = v[2] + w * uz + (x * uy - y * ux);
}

/* World vector to body: conjugate rotation. */
static void contact_rotate_inv(const double v[3], double out[3]) {
  const double w = S.quat[0];
  const double x = -S.quat[1];
  const double y = -S.quat[2];
  const double z = -S.quat[3];
  const double ux = 2.0 * (y * v[2] - z * v[1]);
  const double uy = 2.0 * (z * v[0] - x * v[2]);
  const double uz = 2.0 * (x * v[1] - y * v[0]);
  out[0] = v[0] + w * ux + (y * uz - z * uy);
  out[1] = v[1] + w * uy + (z * ux - x * uz);
  out[2] = v[2] + w * uz + (x * uy - y * ux);
}

/* I_world^{-1} * v, diagonal inertia in the body frame. */
static void contact_iinv(const double v_world[3], double out[3]) {
  double b[3];
  contact_rotate_inv(v_world, b);
  b[0] /= PLANT.inertia[0];
  b[1] /= PLANT.inertia[1];
  b[2] /= PLANT.inertia[2];
  contact_rotate(b, out);
}

/*
 * One rigid-body impulse at offset r from the CG, against unit normal n
 * (out of the solid) and surface velocity vs. pen is positive penetration.
 * Returns 1 if an impulse was applied.
 *
 * Sequential Coulomb, Baraff's form: the normal impulse uses the effective
 * mass along n including the angular term, so a hit on an arm produces
 * spin instead of a point-mass bounce. Restitution falls with closing
 * speed so a crash dumps energy and a skip still skips. Friction cancels
 * as much tangent speed as mu * jn allows, which is a slide when it
 * saturates and a stick when it does not.
 */
static int contact_impulse(const double n[3], const double r[3], const double vs[3],
                           double e, double mu, double pen) {
  double w_world[3];
  contact_rotate(S.omega, w_world);

  double vp[3];
  vp[0] = S.vel[0] + (w_world[1] * r[2] - w_world[2] * r[1]) - vs[0];
  vp[1] = S.vel[1] + (w_world[2] * r[0] - w_world[0] * r[2]) - vs[1];
  vp[2] = S.vel[2] + (w_world[0] * r[1] - w_world[1] * r[0]) - vs[2];

  const double vn = vp[0] * n[0] + vp[1] * n[1] + vp[2] * n[2];
  if (vn >= 0.0 && !(pen > CONTACT_SLOP)) {
    return 0;
  }

  double rn[3];
  rn[0] = r[1] * n[2] - r[2] * n[1];
  rn[1] = r[2] * n[0] - r[0] * n[2];
  rn[2] = r[0] * n[1] - r[1] * n[0];
  double irn[3];
  contact_iinv(rn, irn);
  const double kn = 1.0 / PLANT.mass_kg
      + (rn[0] * irn[0] + rn[1] * irn[1] + rn[2] * irn[2]);
  if (kn < 1e-12) {
    return 0;
  }

  /* Restitution falls with closing speed, then ramps to a floor rather
   * than to zero at the bottom. The cliff at CONTACT_REST_VN is what
   * made a gentle wall tap stick: the coefficient went to nothing, the
   * normal impulse cancelled the approach exactly, and friction held
   * what was left. A hard face keeps a fraction of its own e all the
   * way down, so the hull leaves. Grass has e = 0 and is unaffected. */
  const double vin = vn < 0.0 ? -vn : 0.0;
  double e_used = e;
  if (vin > CONTACT_E_KNEE) {
    /* Saturated: the separation speed stops growing with the impact. */
    e_used = e * CONTACT_E_KNEE / vin;
  }
  if (vn > -CONTACT_REST_VN) {
    const double soft = vin / CONTACT_REST_VN;
    e_used *= CONTACT_E_FLOOR + (1.0 - CONTACT_E_FLOOR) * (soft > 0.0 ? soft : 0.0);
  }

  /* Crash physics reads the contact here, and may only lower e_used, and
   * only for a foam part crushing past its plateau: under every limit this
   * call returns having written nothing. */
  if (SIM_DAMAGE) {
    crash_contact_pre(&S, r, n, vin, kn, &e_used);
  }

  double bias = 0.0;
  if (pen > CONTACT_SLOP) {
    bias = CONTACT_BAUMGARTE * (pen - CONTACT_SLOP) / SIM_DT;
    if (bias > CONTACT_BIAS_MAX) {
      bias = CONTACT_BIAS_MAX;
    }
  }

  const double vn_in = vn < 0.0 ? vn : 0.0;
  const double vn_target = -e_used * vn_in + bias;
  double jn = (vn_target - vn) / kn;
  if (jn < 0.0) {
    return 0;
  }

  double jt[3] = { 0.0, 0.0, 0.0 };
  const double vtx = vp[0] - vn * n[0];
  const double vty = vp[1] - vn * n[1];
  const double vtz = vp[2] - vn * n[2];
  const double vt2 = vtx * vtx + vty * vty + vtz * vtz;
  if (vt2 > 1e-16 && mu > 0.0) {
    const double vtm = sim_sqrt(vt2);
    const double tx = vtx / vtm;
    const double ty = vty / vtm;
    const double tz = vtz / vtm;
    double rt[3];
    rt[0] = r[1] * tz - r[2] * ty;
    rt[1] = r[2] * tx - r[0] * tz;
    rt[2] = r[0] * ty - r[1] * tx;
    double irt[3];
    contact_iinv(rt, irt);
    const double kt = 1.0 / PLANT.mass_kg
        + (rt[0] * irt[0] + rt[1] * irt[1] + rt[2] * irt[2]);
    if (kt > 1e-12) {
      double jtm = -vtm / kt;
      const double mu_use = (vtm < CONTACT_STATIC_VT) ? mu * 1.15 : mu;
      const double jmax = mu_use * jn;
      if (jtm < -jmax) {
        jtm = -jmax;
      }
      if (jtm > jmax) {
        jtm = jmax;
      }
      jt[0] = jtm * tx;
      jt[1] = jtm * ty;
      jt[2] = jtm * tz;
    }
  }

  const double Jx = jn * n[0] + jt[0];
  const double Jy = jn * n[1] + jt[1];
  const double Jz = jn * n[2] + jt[2];
  const double invm = 1.0 / PLANT.mass_kg;
  S.vel[0] += Jx * invm;
  S.vel[1] += Jy * invm;
  S.vel[2] += Jz * invm;

  double tau[3];
  tau[0] = r[1] * Jz - r[2] * Jy;
  tau[1] = r[2] * Jx - r[0] * Jz;
  tau[2] = r[0] * Jy - r[1] * Jx;
  double dw[3];
  contact_iinv(tau, dw);
  w_world[0] += dw[0];
  w_world[1] += dw[1];
  w_world[2] += dw[2];
  contact_rotate_inv(w_world, S.omega);
  if (SIM_DAMAGE) {
    crash_contact_post(&S, r, n, vin, kn, jn, jt);
  }
  return 1;
}

static void contact_support_neg_n(const double n[3], double r[3]) {
  /* Supporting vertex of the OBB in the -n direction: the hull point that
   * meets a surface with outward normal n. */
  double nb[3];
  const double inn[3] = { -n[0], -n[1], -n[2] };
  contact_rotate_inv(inn, nb);
  if (CRASH.hull_parts) {
    /* A part has left: the support is the parts' that are still on. */
    const double *pts;
    const int *part;
    const int np = crash_samplers(&pts, &part);
    int best = 0;
    double bh = -1.0e9;
    for (int k = 0; k < np; k += 1) {
      const double h = nb[0] * pts[3 * k] + nb[1] * pts[3 * k + 1] + nb[2] * pts[3 * k + 2];
      if (h > bh) {
        bh = h;
        best = k;
      }
    }
    contact_rotate(&pts[3 * best], r);
    return;
  }
  double b[3];
  b[0] = nb[0] >= 0.0 ? CONTACT_HX : -CONTACT_HX;
  b[1] = nb[1] >= 0.0 ? CONTACT_HY : -CONTACT_HY;
  b[2] = nb[2] >= 0.0 ? CONTACT_HZ_UP : -CONTACT_HZ_DOWN;
  contact_rotate(b, r);
}

static int contact_unit3(double nx, double ny, double nz, double n[3]) {
  const double n2 = nx * nx + ny * ny + nz * nz;
  if (!(n2 > 0.97) || !(n2 < 1.03)) {
    return 0;
  }
  const double inv = 1.0 / sim_sqrt(n2);
  n[0] = nx * inv;
  n[1] = ny * inv;
  n[2] = nz * inv;
  return 1;
}

/* One hull point against the ground plane. Returns 1 if that point is in
 * the contact band (impulse may or may not have been applied). */
static int ground_hit_at(const double r[3], const double vs[3]) {
  const double px = S.pos[0] + r[0];
  const double py = S.pos[1] + r[1];
  const double pz = S.pos[2] + r[2];
  const double side = g_ground_n[0] * px + g_ground_n[1] * py + g_ground_n[2] * pz;
  const double pen = g_ground_d - side;
  if (!(pen > -CONTACT_SLOP)) {
    return 0;
  }
  const double use_p = pen > 0.0 ? pen : 0.0;
  contact_impulse(g_ground_n, r, vs, g_ge, g_gmu, use_p);
  if (pen > CONTACT_SLOP) {
    const double push = (pen - CONTACT_SLOP) * CONTACT_POS_PUSH;
    S.pos[0] += g_ground_n[0] * push;
    S.pos[1] += g_ground_n[1] * push;
    S.pos[2] += g_ground_n[2] * push;
  }
  return 1;
}

/*
 * After the impulses, no hull sample may stay below the plane. A single
 * support (turtle, a roll) leaves the other seven corners free, and
 * those sweep through the dirt as the hull rotates. Motors inverted
 * also push along world -z. Without this, the camera clips through the
 * grass and a tumble through a gate opening can score a phantom lap.
 *
 * Translation only: no torque, so the mixer couple that flips the hull
 * is not cancelled. The deepest corner is parked on the slop band; as
 * the craft rotates, a new corner becomes deepest and the CG rises.
 */
static void ground_project_sample(const double body[3], double *worst) {
  double r[3];
  contact_rotate(body, r);
  const double px = S.pos[0] + r[0];
  const double py = S.pos[1] + r[1];
  const double pz = S.pos[2] + r[2];
  const double side = g_ground_n[0] * px + g_ground_n[1] * py + g_ground_n[2] * pz;
  const double pen = g_ground_d - side;
  if (pen > *worst) {
    *worst = pen;
  }
}

static void ground_project_hull(void) {
  double worst = CONTACT_PEN_NONE;
  const double cam[3] = { CAMERA_BODY_X, CAMERA_BODY_Y, CAMERA_BODY_Z };
  if (CRASH.hull_parts) {
    const double *pts;
    const int *part;
    const int np = crash_samplers(&pts, &part);
    for (int k = 0; k < np; k += 1) {
      ground_project_sample(&pts[3 * k], &worst);
    }
  } else {
    for (int c = 0; c < CONTACT_CORNERS; c += 1) {
      ground_project_sample(CONTACT_CORNER[c], &worst);
    }
  }
  ground_project_sample(cam, &worst);
  g_ground_projected = 0;
  g_ground_near = (worst > -CONTACT_NEAR) ? 1 : 0;
  if (!(worst > CONTACT_SLOP)) {
    return;
  }
  g_ground_projected = 1;
  const double push = worst - CONTACT_SLOP;
  S.pos[0] += g_ground_n[0] * push;
  S.pos[1] += g_ground_n[1] * push;
  S.pos[2] += g_ground_n[2] * push;
  /* Only kill inbound speed when the hull was truly buried. A roll
   * drives a corner a few millimetres through as it rotates about the
   * support; zeroing vn there cancelled the linear part of a couple.
   * Turtle is the host-latched mixer path; the ABI self-test still
   * proves crashflip against this plane. */
  if (worst > 0.02) {
    const double vn = S.vel[0] * g_ground_n[0]
        + S.vel[1] * g_ground_n[1]
        + S.vel[2] * g_ground_n[2];
    if (vn < 0.0) {
      S.vel[0] -= g_ground_n[0] * vn;
      S.vel[1] -= g_ground_n[1] * vn;
      S.vel[2] -= g_ground_n[2] * vn;
    }
  }
}

/*
 * Grass is a dead thump, not a trampoline. Baumgarte can leave a 1.2 m/s
 * outbound kick even with e = 0; this removes it once the hull is seated.
 *
 * Props down (upz clearly negative): the discs grab and the hull stops
 * in place. Props up: Coulomb friction against the weight the plane is
 * carrying, which is the block's real work and is derived where it is
 * applied below. A side tumble still rolls; spin friction is belly-only
 * so a 90 deg arrival can fall over instead of welding on an arm.
 *
 * Crashflip is latched by the shell when the hull is inverted and
 * settled. The mixer path is compiled, and the contact self-test still
 * drives it, so settle must not cancel that couple while crashflip is
 * latched. A waiting inverted hull with centered sticks is seated by
 * the shell (sim_rest), not here.
 */
static void ground_settle(double upz, double vn_plant) {
  if (!g_ground_hits && !g_ground_projected) {
    /* Inverted rest can sit on the slop with no impulse and no
     * push, which used to skip settle and leave a props-down slide.
     * near is only true within CONTACT_NEAR of the plane. Starting
     * the projector's worst pen at 0 made every airborne hull look
     * near, and invert-stop froze a flip in free air. */
    if (!(upz < CONTACT_INVERT_UPZ && g_ground_near)) {
      return;
    }
  }
  if (bridge_crashflip_active()) {
    return;
  }

  const double nx = g_ground_n[0];
  const double ny = g_ground_n[1];
  const double nz = g_ground_n[2];
  double vn = S.vel[0] * nx + S.vel[1] * ny + S.vel[2] * nz;

  /* Strip an outbound kick the contact just invented (Baumgarte, a
   * residual bounce). Leave a climb the plant already had: killing
   * that every step glued a punch to the pad. */
  if (vn > 0.0 && !(vn_plant > 0.0)) {
    S.vel[0] -= nx * vn;
    S.vel[1] -= ny * vn;
    S.vel[2] -= nz * vn;
    vn = 0.0;
  }

  /* Props-down on grass: stop immediately when the hull is on the
   * plane, or when it is only in the 8 mm halo and not diving in.
   * A live flip whose lowest corner just entered that halo must keep
   * vel and omega until it actually hits. */
  if (upz < CONTACT_INVERT_UPZ) {
    const int touching = g_ground_hits || g_ground_projected;
    const int seated_halo = g_ground_near
        && upz < CONTACT_INVERT_HALO_UPZ
        && !(vn_plant < -CONTACT_INVERT_DIVE);
    if (touching || seated_halo) {
      S.vel[0] = 0.0;
      S.vel[1] = 0.0;
      S.vel[2] = 0.0;
      S.omega[0] = 0.0;
      S.omega[1] = 0.0;
      S.omega[2] = 0.0;
    }
    return;
  }

  /*
   * Tangent only. Scaling the whole velocity damped the punch while
   * the hull was still in the contact band.
   *
   * THE FRICTION HERE IS COULOMB, NOT AN EXPONENTIAL, AND THAT IS THE
   * WHOLE POINT OF THIS BLOCK. contact_impulse returns early on a hull
   * that is merely resting: vn is zero and the penetration sits inside
   * the slop, so there is no normal impulse, so the friction cone up
   * there has nothing to scale against and a belly slide had no force
   * on it at all. What used to stand in for that was a 0.97 per
   * millisecond keep, which is a 33 ms time constant: a 10 m/s belly
   * arrival stopped inside a third of a metre and the ground read as
   * glue. Carry the weight explicitly instead. The normal load a
   * resting contact supplies is the component of gravity into the
   * plane, friction is mu times that, and it can slow a slide to a
   * stop but never reverse it. At mu 1.40 on the level that is 13.7
   * m/s^2, so a 10 m/s slide runs 3.6 m and takes 0.73 s, which is
   * what a 5 inch on turf actually does.
   */
  double vtx = S.vel[0] - nx * vn;
  double vty = S.vel[1] - ny * vn;
  double vtz = S.vel[2] - nz * vn;
  /* A quad on a leg is at rest; a wing on a tip is not. Its span puts
   * the weight half a metre outside the contact, so it has to pivot down,
   * and pivoting moves the centre. The stops and the centre friction
   * below, taken every millisecond, held the centre still and ate each
   * step's gravity turn, so a tip strike perched at 50 degrees, or spun
   * in place on the impact's own rate and went over onto its back. Until
   * it lies near flat the wing is left to the corner impulses, which
   * carry their own friction at the point that is actually on the grass.
   * The quad is unchanged. */
  if (PLANT.kind == PLANT_KIND_WING && !(upz >= CONTACT_WING_REST_UPZ)) {
    return;
  }
  const double vt2 = vtx * vtx + vty * vty + vtz * vtz;
  if (vt2 < CONTACT_SLIDE_STOP * CONTACT_SLIDE_STOP) {
    S.vel[0] = nx * vn;
    S.vel[1] = ny * vn;
    S.vel[2] = nz * vn;
    if (!(vn > 0.0)) {
      S.vel[0] = 0.0;
      S.vel[1] = 0.0;
      S.vel[2] = 0.0;
    }
  } else {
    const double load = PLANT.gravity * SIM_GRAVITY * (nz > 0.0 ? nz : 0.0);
    double dv = g_gmu * load * SIM_DT;
    const double vtm = sim_sqrt(vt2);
    if (dv > vtm) {
      dv = vtm;
    }
    const double keep = (vtm - dv) / vtm;
    S.vel[0] = nx * vn + vtx * keep;
    S.vel[1] = ny * vn + vty * keep;
    S.vel[2] = nz * vn + vtz * keep;
  }

  if (upz >= 0.5) {
    /* Spin friction, the same load acting at the patch radius. A yaw
     * about the normal has no tangent velocity at the impulse point,
     * so the cone above cannot see it: a belly on the grass would spin
     * freely for ever. Torque is mu * N * r, resisted by the inertia
     * along the spin axis, and like the slide it cannot reverse. */
    const double w2 = S.omega[0] * S.omega[0]
        + S.omega[1] * S.omega[1]
        + S.omega[2] * S.omega[2];
    if (w2 < CONTACT_OMEGA_STOP * CONTACT_OMEGA_STOP) {
      S.omega[0] = 0.0;
      S.omega[1] = 0.0;
      S.omega[2] = 0.0;
    } else {
      const double wm = sim_sqrt(w2);
      const double ux = S.omega[0] / wm;
      const double uy = S.omega[1] / wm;
      const double uz = S.omega[2] / wm;
      const double i_eff = ux * ux * PLANT.inertia[0]
          + uy * uy * PLANT.inertia[1]
          + uz * uz * PLANT.inertia[2];
      const double load = PLANT.gravity * SIM_GRAVITY * PLANT.mass_kg * (nz > 0.0 ? nz : 0.0);
      const double tau = g_gmu * load * CONTACT_PATCH_R;
      double dw = (i_eff > 1e-12) ? (tau / i_eff) * SIM_DT : wm;
      if (dw > wm) {
        dw = wm;
      }
      const double keep = (wm - dw) / wm;
      S.omega[0] *= keep;
      S.omega[1] *= keep;
      S.omega[2] *= keep;
    }
  }
}

/*
 * LANDING GEAR, for an airframe that declares wheels (the Cub; every other
 * airframe has none and never enters the loop below).
 *
 * Each wheel touches at its tyre's point nearest the ground, and the ground
 * pushes there with a spring and a damper along the plane's normal, F = k pen - c vn,
 * never pulling. That is the strut and the tyre, and it is what lets the
 * aircraft stand level on three points of different heights and settle
 * onto them from a landing instead of bouncing off a rigid corner.
 * Friction is split along the wheel's own heading and across it, because a
 * wheel is the one contact whose friction is not isotropic: along its
 * heading it rolls, and costs only its rolling resistance, mu_roll N;
 * across it the tyre grips up to mu_side N. Each is an impulse that would
 * stop the point's velocity along that direction, through the same
 * effective mass the hull's contact uses, clipped at its cone. The
 * tailwheel's heading turns with the rudder, so it steers.
 *
 * The heading is the wheel's forward axis laid onto the ground plane; a
 * wheel whose axis stands nearly on end, an aircraft on its side, has no
 * rolling direction and gets the normal force alone. Order is the table's,
 * one pass per step, deterministic.
 */
static double g_wheel_load[SIM_WHEELS_MAX];

static void contact_point_vel(const double r[3], double out[3]) {
  double w[3];
  contact_rotate(S.omega, w);
  out[0] = S.vel[0] + (w[1] * r[2] - w[2] * r[1]);
  out[1] = S.vel[1] + (w[2] * r[0] - w[0] * r[2]);
  out[2] = S.vel[2] + (w[0] * r[1] - w[1] * r[0]);
}

/* 1 / (effective mass) of the body at r along the unit direction d. */
static double contact_k_along(const double r[3], const double d[3]) {
  double rd[3];
  rd[0] = r[1] * d[2] - r[2] * d[1];
  rd[1] = r[2] * d[0] - r[0] * d[2];
  rd[2] = r[0] * d[1] - r[1] * d[0];
  double ird[3];
  contact_iinv(rd, ird);
  return 1.0 / PLANT.mass_kg + (rd[0] * ird[0] + rd[1] * ird[1] + rd[2] * ird[2]);
}

/* The impulse j along the unit direction d at r. */
static void contact_push(const double r[3], const double d[3], double j) {
  const double J[3] = { j * d[0], j * d[1], j * d[2] };
  const double invm = 1.0 / PLANT.mass_kg;
  S.vel[0] += J[0] * invm;
  S.vel[1] += J[1] * invm;
  S.vel[2] += J[2] * invm;
  double w[3];
  contact_rotate(S.omega, w);
  double tau[3];
  tau[0] = r[1] * J[2] - r[2] * J[1];
  tau[1] = r[2] * J[0] - r[0] * J[2];
  tau[2] = r[0] * J[1] - r[1] * J[0];
  double dw[3];
  contact_iinv(tau, dw);
  w[0] += dw[0];
  w[1] += dw[1];
  w[2] += dw[2];
  contact_rotate_inv(w, S.omega);
}

/* Friction along d at r: the impulse that stops the point along d, at most
 * jmax either way. */
static void wheel_friction(const double r[3], const double d[3], double jmax) {
  double vp[3];
  contact_point_vel(r, vp);
  const double vd = vp[0] * d[0] + vp[1] * d[1] + vp[2] * d[2];
  const double kd = contact_k_along(r, d);
  if (!(kd > 1e-12)) {
    return;
  }
  double j = -vd / kd;
  if (j > jmax) {
    j = jmax;
  } else if (j < -jmax) {
    j = -jmax;
  }
  contact_push(r, d, j);
}

/* Returns the number of wheels carrying load this step. */
static int ground_wheels(void) {
  const double *n = g_ground_n;
  double surf[4];
  plant_plane_surfaces(surf);
  /* The wheels' axles are along body y, so each tyre is a circle in the
   * body's x z plane and its point nearest the ground is the axle less r
   * along the ground normal's part in that plane. */
  const double yb[3] = { 0.0, 1.0, 0.0 };
  double axle[3];
  contact_rotate(yb, axle);
  const double na = n[0] * axle[0] + n[1] * axle[1] + n[2] * axle[2];
  double down[3] = { n[0] - na * axle[0], n[1] - na * axle[1], n[2] - na * axle[2] };
  const double dl = sim_sqrt(down[0] * down[0] + down[1] * down[1] + down[2] * down[2]);
  if (dl > 1e-6) {
    down[0] /= dl;
    down[1] /= dl;
    down[2] /= dl;
  } else {
    down[0] = n[0];
    down[1] = n[1];
    down[2] = n[2];
  }
  int loaded = 0;
  for (int i = 0; i < PLANT.wheel_count; i += 1) {
    const WheelParams *wp = &PLANT.wheel[i];
    g_wheel_load[i] = 0.0;
    if (CRASH.active && CRASH.wheel_lost[i]) {
      continue;
    }
    double r[3];
    contact_rotate(wp->pos, r);
    r[0] -= wp->r * down[0];
    r[1] -= wp->r * down[1];
    r[2] -= wp->r * down[2];
    const double side = n[0] * (S.pos[0] + r[0]) + n[1] * (S.pos[1] + r[1]) + n[2] * (S.pos[2] + r[2]);
    const double pen = g_ground_d - side;
    if (!(pen > 0.0)) {
      continue;
    }
    double vp[3];
    contact_point_vel(r, vp);
    const double vn = vp[0] * n[0] + vp[1] * n[1] + vp[2] * n[2];
    const double fn = wp->k * pen - wp->c * vn;
    if (!(fn > 0.0)) {
      continue;
    }
    const double jn = fn * SIM_DT;
    contact_push(r, n, jn);
    g_wheel_load[i] = fn;
    loaded += 1;
    if (SIM_DAMAGE) {
      const double F[3] = { fn * n[0], fn * n[1], fn * n[2] };
      crash_force_note(&S, r, F, crash_wheel_part(i));
    }

    /* The rudder's trailing edge left, positive, turns the wheel's front to
     * the right, which is the body heading rotated by minus the angle. */
    const double delta = wp->steer * surf[3];
    const double hb[3] = { sim_cos_small(delta), -sim_sin_small(delta), 0.0 };
    double hw[3];
    contact_rotate(hb, hw);
    const double hn = hw[0] * n[0] + hw[1] * n[1] + hw[2] * n[2];
    double h[3] = { hw[0] - hn * n[0], hw[1] - hn * n[1], hw[2] - hn * n[2] };
    const double hl = sim_sqrt(h[0] * h[0] + h[1] * h[1] + h[2] * h[2]);
    if (!(hl > 0.1)) {
      continue;
    }
    h[0] /= hl;
    h[1] /= hl;
    h[2] /= hl;
    const double l[3] = {
      n[1] * h[2] - n[2] * h[1],
      n[2] * h[0] - n[0] * h[2],
      n[0] * h[1] - n[1] * h[0],
    };
    wheel_friction(r, l, wp->mu_side * jn);
    wheel_friction(r, h, wp->mu_roll * jn);
  }
  return loaded;
}

static void ground_apply(void) {
  g_ground_hits = 0;
  g_ground_projected = 0;
  g_ground_near = 0;
  g_gmu = g_ground_mu;
  g_ge = g_ground_e;
  crash_surface_mu_e(crash_ground_material(), &g_gmu, &g_ge);
  crash_set_contact_surface(crash_ground_material());
  plant_wing_set_on_wheels(0);
  for (int i = 0; i < SIM_WHEELS_MAX; i += 1) {
    g_wheel_load[i] = 0.0;
  }
  if (!g_ground_on || g_stand_on) {
    return;
  }
  /* An aircraft on its wheels is resting on them, whatever else touches:
   * a wingtip on the grass while it rocks back onto its gear must not be
   * put to sleep by the hull's settle below, which stops a slow rotation
   * outright and would hold it perched on the tip. */
  int wheels_loaded = 0;
  if (PLANT.wheel_count > 0) {
    wheels_loaded = ground_wheels() > 0;
    plant_wing_set_on_wheels(wheels_loaded);
  }
  const double vn_plant = S.vel[0] * g_ground_n[0]
      + S.vel[1] * g_ground_n[1]
      + S.vel[2] * g_ground_n[2];
  const double vs[3] = { 0.0, 0.0, 0.0 };
  /* World-z of body up. A belly landing wants a four-leg table. Anything
   * past about 60 deg is a roll, a turtle or a side arrival: one support
   * so the contact cannot cancel the motor couple. Four coplanar contacts
   * at 1 kHz locked pitch and turtle could not rotate. */
  const double qx = S.quat[1];
  const double qy = S.quat[2];
  const double upz = 1.0 - 2.0 * (qx * qx + qy * qy);

  if (upz < 0.5) {
    int hits = 0;
    if (upz < 0.0) {
      /* Inverted rest is the camera / vtx bump, through the CG, so the
       * mixer couple is free to pitch. Projection, not an arm contact,
       * keeps the free corners out of the dirt. An arm impulse here
       * became a 1 kHz weld once the hull was parked on that vertex,
       * and turtle could not rotate. */
      double r[3];
      const double bump[3] = { 0.0, 0.0, CONTACT_HZ_UP };
      contact_rotate(bump, r);
      if (CRASH.hull_parts) {
        /* The box's top is gone with the part that made it: whatever of
         * the airframe is left is what it lies on. */
        contact_support_neg_n(g_ground_n, r);
      }
      if (ground_hit_at(r, vs)) {
        hits = 1;
        for (int iter = 1; iter < CONTACT_ITERS; iter += 1) {
          if (!ground_hit_at(r, vs)) {
            break;
          }
        }
      } else if (PLANT.kind == PLANT_KIND_WING) {
        /* A wing past the vertical on its nose has its bump high in the
         * air and a corner in the dirt. Projection alone holds the corner
         * up with no impulse, so nothing stops the fall's speed and nothing
         * topples it: it stood on its nose for ever while its velocity
         * grew. The supporting vertex takes the impulse instead, as on
         * its side. A wing has no turtle couple for this to weld, and a
         * corner above the plane returns without touching anything, so a
         * wing on its back on the bump, or in the air, is as it was. */
        contact_support_neg_n(g_ground_n, r);
        for (int iter = 0; iter < CONTACT_ITERS; iter += 1) {
          if (!ground_hit_at(r, vs)) {
            break;
          }
          hits = 1;
        }
      }
    } else {
      /* Tumble on an arm, or on its side: the supporting vertex only. */
      double r[3];
      contact_support_neg_n(g_ground_n, r);
      for (int iter = 0; iter < CONTACT_ITERS; iter += 1) {
        if (!ground_hit_at(r, vs)) {
          break;
        }
        hits = 1;
      }
    }
    g_ground_hits = hits;
    ground_project_hull();
    if (!wheels_loaded) {
      ground_settle(upz, vn_plant);
    }
    return;
  }

  const double *samp = &CONTACT_CORNER[0][0];
  int nsamp = CONTACT_CORNERS;
  if (CRASH.hull_parts) {
    const int *part;
    nsamp = crash_samplers(&samp, &part);
  }
  static unsigned char hit_any[SIM_PARTS_MAX * SIM_PART_PTS_MAX];
  for (int c = 0; c < nsamp; c += 1) {
    hit_any[c] = 0;
  }
  for (int iter = 0; iter < CONTACT_ITERS; iter += 1) {
    int nuse = 0;
    for (int c = 0; c < nsamp; c += 1) {
      double r[3];
      contact_rotate(&samp[3 * c], r);
      if (ground_hit_at(r, vs)) {
        nuse += 1;
        hit_any[c] = 1;
      }
    }
    if (nuse == 0) {
      break;
    }
  }
  int hits = 0;
  for (int c = 0; c < nsamp; c += 1) {
    hits += hit_any[c];
  }

  g_ground_hits = hits;
  ground_project_hull();
  if (!wheels_loaded) {
    ground_settle(upz, vn_plant);
  }
}

/*
 * FLOATS, for an airframe that declares them (the Timber and the Cub on
 * floats; every other airframe has none and returns at the first line).
 * docs/FLOATS-STAGE1.md derives the model and every number.
 *
 * Each float is cut into SIM_FLOAT_STATIONS strips from bow to stern, and
 * each strip's keel point is held against the water surface under it,
 * which is the wave field of water.c at this step's time. A strip whose
 * keel is under the surface gets, at that point:
 *
 *   BUOYANCY, rho g times its immersed section times its length, straight
 *   up. The section is the float's V bottom to the chines and its sides
 *   above, filled to the immersion along the body's up axis and no higher
 *   than the deck.
 *   THE PLANING FORCE, along the body's up axis: the momentum the strip
 *   gives the water it pushes down. A strip of water the hull passes over
 *   carries the added mass of the section wetted there, (pi/2) rho c^2 per
 *   metre with c the half width Wagner's splash up wets, c = (pi/2) d /
 *   tan(deadrise) to the chines; going aft the hull pushes it down at the
 *   bottom's normal speed, so the force is the forward speed times that
 *   speed times the growth of the added mass over the strip (Zarnick's
 *   strip theory, steady form). Where the wetted width stops growing, at
 *   the step above all, the water has left the hull and there is no force
 *   until a strip further aft goes deeper than the deepest before it:
 *   that is what makes a step a step. With the bow down the normal speed
 *   changes sign and the force pulls the bow in, which is a nose dig.
 *   CROSSFLOW DRAG against the bottom's normal speed, 0.5 rho C (2c) w|w|,
 *   and a linear radiation damping for the waves a heaving float makes,
 *   k_rad rho B sqrt(g B) w; CROSSFLOW DRAG sideways on the immersed
 *   depth, which is what keeps a float from sliding sideways; and SKIN
 *   FRICTION along the keel on the wetted girth.
 *
 * Each float then gets its WAVE MAKING DRAG, the buoyancy it carries
 * times a coefficient that grows with the length Froude number of its
 * wetted length to wave_k, which is the hump: at low speed the hull
 * floats and makes no waves, near hull speed it makes the most it can,
 * and as the planing force lifts it out its buoyancy, and the drag with
 * it, fall away. And its WATER RUDDER at the stern, a small low aspect
 * ratio foil turned with the air rudder, working in proportion to how
 * much of its span is in the water.
 *
 * Every force is an impulse at its point through the body's effective
 * mass, contact_push, the wheels' path. On land the keel's bow, knee,
 * step and stern are skids against the ground plane, sliding at mu_ground
 * every way: a float has no wheel.
 *
 * Deterministic: sqrt, the fixed atan2 and the wave field's fixed sin
 * and cos, a fixed order of strips and floats.
 */
static double g_float_diag[10];

static double float_keel(const FloatParams *fp, double x) {
  if (x > fp->x_knee) {
    return fp->z_keel + fp->bow_rise * (x - fp->x_knee) / (fp->x_bow - fp->x_knee);
  }
  if (x >= fp->x_step) {
    return fp->z_keel;
  }
  return fp->z_keel + fp->step_h + (fp->x_step - x) * fp->aft_slope;
}

/* One force F, world frame, at the body offset r, for one step. */
static int g_float_part = -1;

static void float_force(const double r[3], const double F[3]) {
  const double fm = sim_sqrt(F[0] * F[0] + F[1] * F[1] + F[2] * F[2]);
  if (!(fm > 0.0)) {
    return;
  }
  if (SIM_DAMAGE) {
    crash_force_note(&S, r, F, g_float_part);
  }
  const double d[3] = { F[0] / fm, F[1] / fm, F[2] / fm };
  contact_push(r, d, fm * SIM_DT);
}

/* A body frame vector to world. */
static void float_to_world(double x, double y, double z, double out[3]) {
  const double b[3] = { x, y, z };
  contact_rotate(b, out);
}

/* The water's surface and velocity under a world point, in body `wb`. */
static void float_water(int wb, double t, const double p[3], double ws[6]) {
  water_sample(wb, p[0], p[1], t, ws);
}

/* The skids on land. Returns the load they carry, N. */
static double float_ground(const FloatParams *fp) {
  if (!g_ground_on || g_stand_on) {
    return 0.0;
  }
  const double *n = g_ground_n;
  double total = 0.0;
  const double xs[4] = { fp->x_bow, fp->x_knee, fp->x_step, fp->x_stern };
  for (int f = 0; f < 2; f += 1) {
    const double yf = f == 0 ? fp->y : -fp->y;
    if (CRASH.active && CRASH.float_lost[f]) {
      continue;
    }
    for (int k = 0; k < 4; k += 1) {
      double r[3];
      float_to_world(xs[k], yf, float_keel(fp, xs[k]), r);
      const double side = n[0] * (S.pos[0] + r[0]) + n[1] * (S.pos[1] + r[1]) + n[2] * (S.pos[2] + r[2]);
      const double pen = g_ground_d - side;
      if (!(pen > 0.0)) {
        continue;
      }
      double vp[3];
      contact_point_vel(r, vp);
      const double vn = vp[0] * n[0] + vp[1] * n[1] + vp[2] * n[2];
      const double fn = fp->k_ground * pen - fp->c_ground * vn;
      if (!(fn > 0.0)) {
        continue;
      }
      const double jn = fn * SIM_DT;
      contact_push(r, n, jn);
      total += fn;
      if (SIM_DAMAGE) {
        const double F[3] = { fn * n[0], fn * n[1], fn * n[2] };
        crash_force_note(&S, r, F, crash_float_part(f));
      }
      /* The keel's heading on the ground and across it, the same grip
       * both ways. */
      double hw[3];
      float_to_world(1.0, 0.0, 0.0, hw);
      const double hn = hw[0] * n[0] + hw[1] * n[1] + hw[2] * n[2];
      double h[3] = { hw[0] - hn * n[0], hw[1] - hn * n[1], hw[2] - hn * n[2] };
      const double hl = sim_sqrt(h[0] * h[0] + h[1] * h[1] + h[2] * h[2]);
      if (!(hl > 0.1)) {
        continue;
      }
      h[0] /= hl;
      h[1] /= hl;
      h[2] /= hl;
      const double l[3] = {
        n[1] * h[2] - n[2] * h[1],
        n[2] * h[0] - n[0] * h[2],
        n[0] * h[1] - n[1] * h[0],
      };
      wheel_friction(r, l, fp->mu_ground * jn);
      wheel_friction(r, h, fp->mu_ground * jn);
    }
  }
  return total;
}

static void float_apply(void) {
  const FloatParams *fp = &PLANT.floats;
  if (fp->count == 0) {
    return;
  }
  for (int i = 0; i < 10; i += 1) {
    g_float_diag[i] = 0.0;
  }
  const double ground = float_ground(fp);
  g_float_diag[6] = ground;
  int wet = 0;
  const int wb = water_body_at(S.pos[0], S.pos[1]);
  if (wb >= 0) {
    const double rho = 1000.0;
    const double g = PLANT.gravity;
    const double PI = 3.14159265358979323846;
    const double t = (double)(S.step_index + 1) * SIM_DT;
    const double L = fp->x_bow - fp->x_stern;
    const double dx = L / (double)SIM_FLOAT_STATIONS;
    const double half = 0.5 * fp->beam;
    const double hc = half * fp->tan_dr;
    const double sin_dr = fp->tan_dr / sim_sqrt(1.0 + fp->tan_dr * fp->tan_dr);
    const double rad = fp->k_rad * rho * fp->beam * sim_sqrt(g * fp->beam);
    /* The body's up axis in the world: how far a vertical immersion is
     * along it, floored so a float on its side still has a section. */
    double zb[3];
    float_to_world(0.0, 0.0, 1.0, zb);
    const double cz = zb[2] > 0.2 ? zb[2] : 0.2;
    double surf[4];
    plant_plane_surfaces(surf);
    for (int f = 0; f < 2; f += 1) {
      const double yf = f == 0 ? fp->y : -fp->y;
      if (CRASH.active && CRASH.float_lost[f]) {
        continue;
      }
      g_float_part = crash_float_part(f);
      double ma_run = 0.0;
      double d_prev = 0.0;
      double buoy = 0.0;
      double xb = 0.0;
      double usum = 0.0;
      int nwet = 0;
      for (int i = 0; i < SIM_FLOAT_STATIONS; i += 1) {
        const double x = fp->x_bow - ((double)i + 0.5) * dx;
        const double zk = float_keel(fp, x);
        double r[3];
        float_to_world(x, yf, zk, r);
        const double p[3] = { S.pos[0] + r[0], S.pos[1] + r[1], S.pos[2] + r[2] };
        double ws[6];
        float_water(wb, t, p, ws);
        const double h = ws[0] - p[2];
        if (!(h > 0.0)) {
          d_prev = 0.0;
          continue;
        }
        wet = 1;
        const double cap = fp->z_keel + fp->depth - zk;
        double d = h * cz;
        if (d > cap) {
          d = cap;
        }
        const double area = d <= hc ? d * d / fp->tan_dr : hc * hc / fp->tan_dr + fp->beam * (d - hc);
        const double girth = d <= hc ? 2.0 * d / sin_dr : 2.0 * hc / sin_dr + 2.0 * (d - hc);
        double c = 0.5 * PI * d / fp->tan_dr;
        const int chines_dry = c < half;
        if (!chines_dry) {
          c = half;
        }
        const double ma = 0.5 * PI * rho * c * c;
        /* The strip's velocity through the water, in the body frame, and
         * how fast its immersion grows where it is: the surface's own rise
         * and its slope under the strip's travel, less the strip's sink. */
        double vp[3];
        contact_point_vel(r, vp);
        const double vr[3] = { vp[0] - ws[3], vp[1] - ws[4], vp[2] - ws[5] };
        double vb[3];
        contact_rotate_inv(vr, vb);
        const double u = vb[0], v = vb[1];
        const double up = u > 0.0 ? u : 0.0;
        const double hdot = ws[5] + ws[1] * vp[0] + ws[2] * vp[1] - vp[2];
        /* The rate a slice of water under this strip is pushed down: the
         * growth of the immersion from the strip ahead to this one at the
         * forward speed, which is the trim and the keel's own rocker, and
         * the strip's own sinking. Water is pushed, never pulled. */
        const double vn = up * (d - d_prev) / dx + hdot * cz;
        d_prev = d;
        double fz = 0.0;
        if (vn > 0.0) {
          double dm = 0.0;
          if (ma > ma_run) {
            dm = up * (ma - ma_run);
          }
          if (chines_dry && hdot > 0.0) {
            /* Wagner's slam: the wetted width growing as the strip drops. */
            dm += 0.5 * PI * PI * rho * c / fp->tan_dr * hdot * cz * dx;
          }
          fz = vn * dm + 0.5 * rho * fp->c_cross * 2.0 * c * vn * vn * dx;
        }
        if (ma > ma_run) {
          ma_run = ma;
        }
        const double fy = -0.5 * rho * fp->c_side * d * v * sim_fabs(v) * dx;
        const double fx = -0.5 * rho * fp->cf * girth * u * sim_fabs(u) * dx;
        const double fb = rho * g * area * dx;
        const double fr = rad * hdot * dx;
        double Fw[3];
        float_to_world(fx, fy, fz, Fw);
        Fw[2] += fb + fr;
        float_force(r, Fw);
        buoy += fb;
        xb += fb * x;
        usum += u;
        nwet += 1;
        g_float_diag[0] += fb;
        g_float_diag[1] += fz + fr;
        g_float_diag[2] -= fx;
        g_float_diag[3] += area * dx;
      }
      g_float_diag[4 + f] = (double)nwet * dx;
      /* The wave making drag, at the float's centre of buoyancy, against
       * its run through the water. */
      if (nwet > 0 && buoy > 0.0) {
        const double um = usum / (double)nwet;
        const double fr2 = um * um / (g * (double)nwet * dx);
        const double fr4 = fr2 * fr2;
        const double f0 = fp->wave_fr0 * fp->wave_fr0;
        const double rw = fp->wave_k * fr4 / (fr4 + f0 * f0) * buoy;
        const double xc = xb / buoy;
        double r[3];
        float_to_world(xc, yf, fp->z_keel, r);
        double Fw[3];
        float_to_world(um > 0.0 ? -rw : rw, 0.0, 0.0, Fw);
        float_force(r, Fw);
        g_float_diag[2] += rw;
        g_float_diag[8] += rw;
      }
      /* The water rudder, as much of it as is in the water. */
      {
        double r[3];
        float_to_world(fp->rudder_x, yf, fp->rudder_z, r);
        const double p[3] = { S.pos[0] + r[0], S.pos[1] + r[1], S.pos[2] + r[2] };
        double ws[6];
        float_water(wb, t, p, ws);
        double frac = (ws[0] - (p[2] - 0.5 * fp->rudder_span)) / fp->rudder_span;
        if (frac > 1.0) {
          frac = 1.0;
        }
        if (frac > 0.0) {
          double vp[3];
          contact_point_vel(r, vp);
          const double vr[3] = { vp[0] - ws[3], vp[1] - ws[4], vp[2] - ws[5] };
          double vb[3];
          contact_rotate_inv(vr, vb);
          const double q2 = vb[0] * vb[0] + vb[1] * vb[1];
          if (q2 > 1e-6) {
            const double vm = sim_sqrt(q2);
            const double beta = sim_atan2(vb[1], sim_fabs(vb[0]));
            double cl = fp->rudder_a * (fp->rudder_steer * surf[3] + beta);
            if (cl > fp->rudder_clmax) cl = fp->rudder_clmax;
            if (cl < -fp->rudder_clmax) cl = -fp->rudder_clmax;
            const double ar = fp->rudder_span * fp->rudder_span / fp->rudder_area;
            const double cd = 0.02 + cl * cl / (PI * ar);
            const double qa = 0.5 * rho * q2 * fp->rudder_area * frac;
            const double fy = -qa * cl;
            const double fx = -qa * cd * vb[0] / vm;
            const double fyd = -qa * cd * vb[1] / vm;
            double Fw[3];
            float_to_world(fx, fy + fyd, 0.0, Fw);
            float_force(r, Fw);
            g_float_diag[7] += fy;
          }
        }
      }
    }
  }
  if (wet || ground > 0.0) {
    plant_wing_set_on_wheels(1);
  }
  g_float_diag[9] = (double)wb;
}

SIM_EXPORT int sim_contact(double nx, double ny, double nz,
                           double restitution, double mu,
                           double px, double py, double pz,
                           double vsx, double vsy, double vsz) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  if (!sim_finite(nx) || !sim_finite(ny) || !sim_finite(nz)
      || !sim_finite(restitution) || !sim_finite(mu)
      || !sim_finite(px) || !sim_finite(py) || !sim_finite(pz)
      || !sim_finite(vsx) || !sim_finite(vsy) || !sim_finite(vsz)) {
    return SIM_ERR_BAD_ARG;
  }
  if (!(restitution >= 0.0) || !(restitution <= 1.0)) {
    return SIM_ERR_BAD_ARG;
  }
  if (!(mu >= 0.0) || !(mu <= 2.0)) {
    return SIM_ERR_BAD_ARG;
  }
  double n[3];
  if (!contact_unit3(nx, ny, nz, n)) {
    return SIM_ERR_BAD_ARG;
  }
  S.pos[0] = px;
  S.pos[1] = py;
  S.pos[2] = pz;
  double r[3];
  contact_support_neg_n(n, r);
  const double vs[3] = { vsx, vsy, vsz };
  /* Penetration is already resolved by the host placing p on the free
   * side of the face. The impulse still sees the inbound velocity. */
  crash_set_contact_surface(SIM_SURF_DEFAULT);
  crash_batch_begin(&S);
  contact_impulse(n, r, vs, restitution, mu, 0.0);
  crash_batch_end(&S);
  return SIM_OK;
}

/*
 * Rigid-body contact with the contact point supplied by the caller.
 *
 * sim_contact derives the impulse arm from the plant's own OBB support
 * in the -n direction, and that support is always an extreme corner:
 * plus or minus every half extent at once. So a belly slapped flat on a
 * wall came out of the solver as a corner strike. The angular term is
 * about two thirds of the effective mass at that arm, so a 5 m/s tap
 * produced something near 1900 deg/s of spin, the hull rotated, another
 * corner went in on the next contact, and the craft wound itself up
 * against the surface. That is the owner's "glitching and flipping
 * around", and it is a modelling error rather than a tuning one.
 *
 * The shell knows better, because the shape it sweeps is the four prop
 * discs and it can average the ones actually in the patch: one arm in
 * gives one point and the full moment, a belly flat on the face gives
 * four and almost none. (rx, ry, rz) is the vector from the CG to that
 * point, plant frame, world axes. Everything else matches sim_contact.
 *
 * The arm is clamped to CONTACT_ARM_MAX so a host that reports nonsense
 * cannot inject an unbounded moment. Additive ABI, version unchanged:
 * no existing entry point moved or changed meaning, and a replay that
 * never calls this is bit-identical to one from before it existed.
 */
/* The material sim_contact_at_mat hands its body, for one call. */
static int g_contact_mat = SIM_SURF_DEFAULT;

SIM_EXPORT int sim_contact_at(double nx, double ny, double nz,
                              double restitution, double mu,
                              double px, double py, double pz,
                              double vsx, double vsy, double vsz,
                              double rx, double ry, double rz) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  if (!sim_finite(nx) || !sim_finite(ny) || !sim_finite(nz)
      || !sim_finite(restitution) || !sim_finite(mu)
      || !sim_finite(px) || !sim_finite(py) || !sim_finite(pz)
      || !sim_finite(vsx) || !sim_finite(vsy) || !sim_finite(vsz)
      || !sim_finite(rx) || !sim_finite(ry) || !sim_finite(rz)) {
    return SIM_ERR_BAD_ARG;
  }
  if (!(restitution >= 0.0) || !(restitution <= 1.0)) {
    return SIM_ERR_BAD_ARG;
  }
  if (!(mu >= 0.0) || !(mu <= 2.0)) {
    return SIM_ERR_BAD_ARG;
  }
  double n[3];
  if (!contact_unit3(nx, ny, nz, n)) {
    return SIM_ERR_BAD_ARG;
  }
  S.pos[0] = px;
  S.pos[1] = py;
  S.pos[2] = pz;
  crash_set_contact_surface(g_contact_mat);
  g_contact_mat = SIM_SURF_DEFAULT;
  double r[3] = { rx, ry, rz };
  const double r2 = r[0] * r[0] + r[1] * r[1] + r[2] * r[2];
  if (r2 > CONTACT_ARM_MAX * CONTACT_ARM_MAX) {
    const double scale = CONTACT_ARM_MAX / sim_sqrt(r2);
    r[0] *= scale;
    r[1] *= scale;
    r[2] *= scale;
  }
  const double vs[3] = { vsx, vsy, vsz };
  /* Penetration is already resolved by the host placing p on the free
   * side of the face. The impulse still sees the inbound velocity. */
  crash_batch_begin(&S);
  contact_impulse(n, r, vs, restitution, mu, 0.0);
  crash_batch_end(&S);
  return SIM_OK;
}

/*
 * Blade strike: the rotors lose sev of their speed, 0 to 1.
 *
 * A 5 inch that meets a wall with the discs spinning does not carry its
 * tank through the contact. Without this a wall tap changed the craft's
 * direction and nothing else, so the pilot could scrub along a surface
 * at full tilt and pay only in heading. Applied to all four rotors: the
 * mixer is already asking for whatever it wants and will spin them back
 * up at the motor's own time constant, which is the part that is felt.
 *
 * The plant is untouched otherwise. No damage model, no desync: this is
 * energy leaving through the blades, not a broken machine. Additive ABI,
 * version unchanged, and the harness never calls it.
 */
SIM_EXPORT int sim_prop_strike(double sev) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  if (!sim_finite(sev)) {
    return SIM_ERR_BAD_ARG;
  }
  if (!(sev >= 0.0) || !(sev <= 1.0)) {
    return SIM_ERR_BAD_ARG;
  }
  const double keep = 1.0 - sev;
  for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
    S.motor_omega[m] *= keep;
  }
  return SIM_OK;
}

SIM_EXPORT int sim_set_ground(int on,
                              double nx, double ny, double nz,
                              double px, double py, double pz,
                              double mu, double restitution) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  if (!on) {
    g_ground_on = 0;
    g_ground_hits = 0;
    g_ground_projected = 0;
    g_ground_near = 0;
    return SIM_OK;
  }
  if (!sim_finite(nx) || !sim_finite(ny) || !sim_finite(nz)
      || !sim_finite(px) || !sim_finite(py) || !sim_finite(pz)
      || !sim_finite(mu) || !sim_finite(restitution)) {
    return SIM_ERR_BAD_ARG;
  }
  if (!(mu >= 0.0) || !(mu <= 2.0)) {
    return SIM_ERR_BAD_ARG;
  }
  if (!(restitution >= 0.0) || !(restitution <= 1.0)) {
    return SIM_ERR_BAD_ARG;
  }
  double n[3];
  if (!contact_unit3(nx, ny, nz, n)) {
    return SIM_ERR_BAD_ARG;
  }
  g_ground_n[0] = n[0];
  g_ground_n[1] = n[1];
  g_ground_n[2] = n[2];
  g_ground_d = n[0] * px + n[1] * py + n[2] * pz;
  g_ground_mu = mu;
  g_ground_e = restitution;
  g_ground_on = 1;
  return SIM_OK;
}

SIM_EXPORT int sim_ground_contacts(void) {
  return g_ground_hits;
}

SIM_EXPORT int sim_set_crashflip(int on) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  bridge_set_crashflip(on);
  return SIM_OK;
}

SIM_EXPORT int sim_crashflip_active(void) {
  if (!g_initialised) {
    return 0;
  }
  return bridge_crashflip_active();
}

SIM_EXPORT int sim_set_pose(double px, double py, double pz,
                            double qw, double qx, double qy, double qz) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  if (!sim_finite(px) || !sim_finite(py) || !sim_finite(pz)
      || !sim_finite(qw) || !sim_finite(qx) || !sim_finite(qy) || !sim_finite(qz)) {
    return SIM_ERR_BAD_ARG;
  }
  const double n2 = qw * qw + qx * qx + qy * qy + qz * qz;
  if (!(n2 > 0.25) || !(n2 < 4.0)) {
    return SIM_ERR_BAD_ARG;
  }
  const double ninv = 1.0 / sim_sqrt(n2);
  S.pos[0] = px;
  S.pos[1] = py;
  S.pos[2] = pz;
  S.quat[0] = qw * ninv;
  S.quat[1] = qx * ninv;
  S.quat[2] = qy * ninv;
  S.quat[3] = qz * ninv;
  return SIM_OK;
}

/*
 * Scenario set up and crash readback, sim_abi.h. The part tables, the
 * judgement and the free bodies are src/native/crash.c; these are the
 * exports that need the craft's state, which is this file's.
 */
SIM_EXPORT int sim_set_velocity(double vx, double vy, double vz, double p, double q, double r) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  if (!sim_finite(vx) || !sim_finite(vy) || !sim_finite(vz)
      || !sim_finite(p) || !sim_finite(q) || !sim_finite(r)) {
    return SIM_ERR_BAD_ARG;
  }
  if (vx * vx + vy * vy + vz * vz > 150.0 * 150.0) {
    return SIM_ERR_BAD_ARG;
  }
  S.vel[0] = vx;
  S.vel[1] = vy;
  S.vel[2] = vz;
  S.omega[0] = p;
  S.omega[1] = q;
  S.omega[2] = r;
  return SIM_OK;
}

SIM_EXPORT int sim_parts_state(double *out) {
  if (out == 0) {
    return SIM_ERR_BAD_ARG;
  }
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  return crash_parts_state(&S, out);
}

SIM_EXPORT int sim_part_break(int part) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  return crash_part_break(&S, part);
}

SIM_EXPORT int sim_part_set_damage(int part, double damage) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  return crash_part_set_damage(&S, part, damage);
}

SIM_EXPORT int sim_contact_at_mat(double nx, double ny, double nz, int mat,
                                  double px, double py, double pz,
                                  double vsx, double vsy, double vsz,
                                  double rx, double ry, double rz) {
  if (mat < 0 || mat >= SIM_SURFACES) {
    return SIM_ERR_BAD_ARG;
  }
  double mu = 0.40, e = 0.15;
  crash_surface_mu_e(mat, &mu, &e);
  g_contact_mat = mat;
  const int rc = sim_contact_at(nx, ny, nz, e, mu, px, py, pz, vsx, vsy, vsz, rx, ry, rz);
  g_contact_mat = SIM_SURF_DEFAULT;
  return rc;
}

SIM_EXPORT int sim_deflect(double nx, double ny, double nz,
                           double restitution, double tangent_keep,
                           double rate_keep, double px, double py, double pz) {
  /* Kept so an old caller still compiles. The impulse is the rigid-body
   * one; tangent_keep and rate_keep are range-checked so the ABI does not
   * change meaning of the arguments, then ignored because Coulomb friction
   * and the angular term replace those two scale factors. */
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  if (!sim_finite(tangent_keep) || !sim_finite(rate_keep)) {
    return SIM_ERR_BAD_ARG;
  }
  if (!(tangent_keep >= 0.0) || !(tangent_keep <= 1.0)) {
    return SIM_ERR_BAD_ARG;
  }
  if (!(rate_keep >= 0.0) || !(rate_keep <= 1.0)) {
    return SIM_ERR_BAD_ARG;
  }
  return sim_contact(nx, ny, nz, restitution, 0.35, px, py, pz, 0.0, 0.0, 0.0);
}

static void stand_rotate_body(double bx, double by, double bz, double out[3]) {
  const double w = S.quat[0];
  const double x = S.quat[1];
  const double y = S.quat[2];
  const double z = S.quat[3];
  const double ux = 2.0 * (y * bz - z * by);
  const double uy = 2.0 * (z * bx - x * bz);
  const double uz = 2.0 * (x * by - y * bx);
  out[0] = bx + w * ux + (y * uz - z * uy);
  out[1] = by + w * uy + (z * ux - x * uz);
  out[2] = bz + w * uz + (x * uy - y * ux);
}

static void stand_pitch_only(void) {
  const double w = S.quat[0];
  const double x = S.quat[1];
  const double y = S.quat[2];
  const double z = S.quat[3];
  /* Body forward in world, then drop the lateral component so yaw and
   * roll cannot accumulate. Gyroscopic pitch leaks into roll in free
   * air; a launch block does not allow that. */
  double fx = 1.0 - 2.0 * (y * y + z * z);
  double fz = 2.0 * (x * z - w * y);
  const double f2 = fx * fx + fz * fz;
  if (f2 < 1e-16) {
    return;
  }
  const double inv = 1.0 / sim_sqrt(f2);
  fx *= inv;
  fz *= inv;
  if (fx > 1.0) {
    fx = 1.0;
  }
  if (fx < -1.0) {
    fx = -1.0;
  }
  double qw = sim_sqrt(0.5 * (1.0 + fx));
  double qy;
  if (qw > 1e-12) {
    qy = -0.5 * fz / qw;
  } else {
    qw = 0.0;
    qy = fz < 0.0 ? 1.0 : -1.0;
  }
  const double n2 = qw * qw + qy * qy;
  const double ninv = 1.0 / sim_sqrt(n2);
  S.quat[0] = qw * ninv;
  S.quat[1] = 0.0;
  S.quat[2] = qy * ninv;
  S.quat[3] = 0.0;
}

static void stand_apply(void) {
  if (PLANT.kind == PLANT_KIND_WING) {
    return; /* a wing is thrown, not stood on the line */
  }
  if (!g_stand_on) {
    return;
  }
  stand_pitch_only();
  S.vel[0] = 0.0;
  S.vel[1] = 0.0;
  S.vel[2] = 0.0;
  S.omega[0] = 0.0;
  S.omega[2] = 0.0;
  double hingeb[3];
  stand_rotate_body(-PLANT.arm_x, 0.0, STAND_HINGE_Z, hingeb);
  S.pos[0] = g_stand_hinge[0] - hingeb[0];
  S.pos[1] = g_stand_hinge[1] - hingeb[1];
  S.pos[2] = g_stand_hinge[2] - hingeb[2];
}

static void stand_capture_hinge(void) {
  double hingeb[3];
  stand_rotate_body(-PLANT.arm_x, 0.0, STAND_HINGE_Z, hingeb);
  g_stand_hinge[0] = S.pos[0] + hingeb[0];
  g_stand_hinge[1] = S.pos[1] + hingeb[1];
  g_stand_hinge[2] = S.pos[2] + hingeb[2];
}

SIM_EXPORT int sim_set_launch_stand(int on, double px, double py, double pz,
                                    double qw, double qx, double qy, double qz) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  if (!on) {
    g_stand_on = 0;
    return SIM_OK;
  }
  if (!sim_finite(px) || !sim_finite(py) || !sim_finite(pz)
      || !sim_finite(qw) || !sim_finite(qx) || !sim_finite(qy) || !sim_finite(qz)) {
    return SIM_ERR_BAD_ARG;
  }
  const double n2 = qw * qw + qx * qx + qy * qy + qz * qz;
  if (!(n2 > 0.25) || !(n2 < 4.0)) {
    return SIM_ERR_BAD_ARG;
  }
  const double ninv = 1.0 / sim_sqrt(n2);
  S.pos[0] = px;
  S.pos[1] = py;
  S.pos[2] = pz;
  S.quat[0] = qw * ninv;
  S.quat[1] = qx * ninv;
  S.quat[2] = qy * ninv;
  S.quat[3] = qz * ninv;
  S.vel[0] = 0.0;
  S.vel[1] = 0.0;
  S.vel[2] = 0.0;
  S.omega[0] = 0.0;
  S.omega[2] = 0.0;
  g_stand_on = 1;
  stand_pitch_only();
  stand_capture_hinge();
  stand_apply();
  return SIM_OK;
}

SIM_EXPORT int sim_set_angle_mode(int on) {
  bridge_set_angle_mode(on);
  return SIM_OK;
}

/* Flight style flag, see sim_internal.h. Not reset by reset_dynamics on
 * purpose: it is a mode, not dynamic state, same rule as angle mode. */
int SIM_ARCADE = 0;

SIM_EXPORT int sim_set_flight_style(int arcade) {
  SIM_ARCADE = arcade ? 1 : 0;
  return SIM_OK;
}

/* Air scale, see sim_internal.h. A mode, same rule as the flight style. */
double SIM_AIR = 1.0;

SIM_EXPORT int sim_set_air(double scale) {
  /*
   * The band is refused rather than clamped, because a host that asks for
   * air 5 has a bug and a silent clamp hides it. 0.5 to 2.0 is what the
   * shell offers and what was measured; the plant is stable outside it, the
   * machine just stops being a quadcopter.
   */
  if (!(scale >= 0.5) || !(scale <= 2.0)) {
    return SIM_ERR_BAD_ARG;
  }
  SIM_AIR = scale;
  return SIM_OK;
}

SIM_EXPORT double sim_air(void) { return SIM_AIR; }

/* Gravity scale, see sim_internal.h. A mode, same rule as the air scale. */
double SIM_GRAVITY = 1.0;

SIM_EXPORT int sim_set_gravity(double scale) {
  /* Refused rather than clamped, same argument as sim_set_air. */
  if (!(scale >= 0.5) || !(scale <= 2.5)) {
    return SIM_ERR_BAD_ARG;
  }
  SIM_GRAVITY = scale;
  return SIM_OK;
}

SIM_EXPORT double sim_gravity(void) { return SIM_GRAVITY; }

/*
 * The airframe. A MODE, not dynamic state, in exactly the sense
 * sim_set_flight_style above is one: it survives sim_reset and sim_init, the
 * shell owns asserting it, and the default is the five inch so a host that
 * never calls this gets the machine this project was built around.
 *
 * Everything that has to move with it moves here rather than being tested
 * for on the hot path: the plant's parameter pointer, the hull corners, and
 * the parked height the ground plane defaults to.
 */
SIM_EXPORT int sim_set_airframe(int id) {
  if (!plant_airframe_exists(id)) {
    return SIM_ERR_BAD_ARG;
  }
  if (id == plant_airframe()) {
    return SIM_OK;
  }
  crash_reset();
  plant_set_airframe(id);
  /* A canopy belongs to the aircraft that pulled it, and so do flaps. */
  plant_wing_chute(0);
  plant_wing_flaps_stow();
  contact_build_corners();
  /* Only if the host has not raised its own plane. A shell that has already
   * called sim_set_ground owns that number and must not have it taken back. */
  if (!g_ground_on) {
    g_ground_d = STAND_HINGE_Z;
  }
  return SIM_OK;
}

SIM_EXPORT int sim_airframe(void) { return plant_airframe(); }

SIM_EXPORT int sim_set_launch_control(int on) {
  bridge_set_launch_control(on);
  return SIM_OK;
}

SIM_EXPORT int sim_launch_control_state(void) {
  return bridge_launch_control_state();
}

SIM_EXPORT int sim_motor_override(int motor, double duty) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  if (motor < -1 || motor >= SIM_MOTOR_COUNT) {
    return SIM_ERR_BAD_ARG;
  }
  double d = duty;
  if (d > 1.0) {
    d = 1.0;
  }
  if (d < 0.0) {
    d = -1.0; /* clears */
  }
  if (motor == -1) {
    for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
      g_override[m] = d;
    }
  } else {
    g_override[motor] = d;
  }
  return SIM_OK;
}

SIM_EXPORT int sim_step(int n) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  if (n < 0) {
    return SIM_ERR_BAD_ARG;
  }
  for (int k = 0; k < n; k += 1) {
    /* Consume every sample whose timestamp falls inside this step. Each
     * consumed sample is an RC frame for the controller. */
    const long long step_end_us = (S.step_index + 1) * (1000000LL / SIM_STEP_HZ);
    int rx_new = 0;
    while (g_q_head != g_q_tail && g_queue[g_q_head].t_us < step_end_us) {
      g_current_rc[0] = g_queue[g_q_head].ch[0];
      g_current_rc[1] = g_queue[g_q_head].ch[1];
      g_current_rc[2] = g_queue[g_q_head].ch[2];
      g_current_rc[3] = g_queue[g_q_head].ch[3];
      g_q_head = (g_q_head + 1) % INPUT_QUEUE_CAP;
      rx_new = 1;
    }
    double duty[SIM_MOTOR_COUNT];
    if (PLANT.kind != PLANT_KIND_WING) {
      bridge_run(&S, g_current_rc, rx_new, duty);
      for (int m = 0; m < SIM_MOTOR_COUNT; m += 1) {
        if (g_override[m] >= 0.0) {
          duty[m] = g_override[m];
        }
      }
    }
    /*
     * Where the floor is, for the plant's ground effect. The same plane the
     * contact solver below resolves against, measured to the CG along its
     * normal; negative when no plane has been raised, which switches the
     * term off. Computed here rather than in the plant because the plane is
     * this file's, and handed over as two numbers rather than a callback so
     * plant_step stays a pure function of its state.
     */
    if (g_ground_on) {
      S.ground_h = g_ground_n[0] * S.pos[0] + g_ground_n[1] * S.pos[1]
        + g_ground_n[2] * S.pos[2] - g_ground_d;
      S.ground_n[0] = g_ground_n[0];
      S.ground_n[1] = g_ground_n[1];
      S.ground_n[2] = g_ground_n[2];
    } else {
      S.ground_h = -1.0;
    }
    /* The wing has no controller: the sticks go to its plant as they are. */
    if (PLANT.kind == PLANT_KIND_WING) {
      plant_wing_step(&S, g_current_rc);
    } else {
      plant_step(&S, duty);
    }
    crash_batch_begin(&S);
    ground_apply();
    float_apply();
    crash_step(&S, g_ground_on && !g_stand_on, g_ground_n, g_ground_d);
    crash_batch_end(&S);
    stand_apply();
    S.step_index += 1;
  }
  return SIM_OK;
}

/*
 * The fixed wings' own entry points: every airframe of PLANT_KIND_WING,
 * the flying wing, the Skyhunter, the Cub, the Radian, the Bramor, the
 * Slow Stick and the Timber. Additive, version unchanged.
 *
 * sim_wing_launch: a hand throw at speed m/s along the body's forward axis.
 * sim_wing_surfaces: the two wing trailing edge surfaces, radians, left
 * then right, positive trailing edge up, for the renderer: the elevons on
 * the flying wing, the ailerons on the Skyhunter.
 * sim_plane_surfaces: four angles, radians, for an aircraft with a tail:
 *   out[0] left aileron, positive trailing edge up
 *   out[1] right aileron, positive trailing edge up
 *   out[2] elevator, positive trailing edge up (nose up)
 *   out[3] rudder, positive trailing edge to the LEFT (nose left)
 * Full right roll reads out[1] positive and out[0] negative; full right
 * yaw stick reads out[3] negative. Both rudders move together and report
 * as one. On the flying wing out[0] and out[1] are the elevons and out[2]
 * and out[3] read zero, since it has neither surface.
 */
SIM_EXPORT int sim_wing_launch(double speed) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  if (PLANT.kind != PLANT_KIND_WING || !(speed >= 0.0) || speed > 60.0) {
    return SIM_ERR_BAD_ARG;
  }
  plant_wing_launch(&S, speed);
  return SIM_OK;
}

SIM_EXPORT int sim_wing_debug(double *out) {
  if (out == 0) {
    return SIM_ERR_BAD_ARG;
  }
  plant_wing_debug(out);
  return SIM_OK;
}

/* The wing's stabiliser: 0 off, 1 stabilised, 2 acro. Kept across
 * resets, like the airframe; the shell sets it from the tune. Additive:
 * 2 arrived after 0 and 1 and they mean what they did. */
SIM_EXPORT int sim_wing_set_stab(int mode) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  if (mode < 0 || mode > 2) {
    return SIM_ERR_BAD_ARG;
  }
  plant_wing_set_stab(mode);
  return SIM_OK;
}

SIM_EXPORT int sim_wing_stab(void) {
  return plant_wing_stab();
}

SIM_EXPORT int sim_wing_surfaces(double *out) {
  if (out == 0) {
    return SIM_ERR_BAD_ARG;
  }
  plant_wing_surfaces(out);
  return SIM_OK;
}

/*
 * The recovery parachute, on an aircraft that carries one (the Bramor).
 * sim_wing_chute(1) pulls it: the motor stops, the surfaces centre, and a
 * canopy opens over the next second or so. sim_wing_chute(0) stows it
 * again, which a reset also does; a host that relaunches from rest stows
 * it first. SIM_ERR_BAD_ARG for 1 on an aircraft without one.
 * sim_wing_chute_open: how far the canopy is open, 0 stowed to 1 full,
 * for the renderer. Additive, version unchanged.
 */
SIM_EXPORT int sim_wing_chute(int deploy) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  if (deploy != 0 && deploy != 1) {
    return SIM_ERR_BAD_ARG;
  }
  return plant_wing_chute(deploy) == 0 ? SIM_OK : SIM_ERR_BAD_ARG;
}

SIM_EXPORT double sim_wing_chute_open(void) {
  return plant_wing_chute_open();
}

/*
 * The flaps and slats, on an aircraft that has them (the Timber).
 * sim_wing_set_flaps(notch): 0 up, 1 half, 2 full, the radio's three
 * position switch; the flaps travel there at the aircraft's own rate. A
 * mode, kept across resets, which put the flaps where the notch has them;
 * an airframe change raises them. SIM_ERR_BAD_ARG for a notch past 0 on an
 * aircraft without flaps. sim_wing_flaps: their angle now, radians,
 * trailing edge down, for the renderer. sim_wing_set_slats(fitted): 1 the
 * slats on, the default, 0 off; no effect on an aircraft without them.
 * Additive, version unchanged.
 */
SIM_EXPORT int sim_wing_set_flaps(int notch) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  if (notch < 0 || notch > 2) {
    return SIM_ERR_BAD_ARG;
  }
  return plant_wing_set_flaps(notch) == 0 ? SIM_OK : SIM_ERR_BAD_ARG;
}

SIM_EXPORT double sim_wing_flaps(void) {
  return plant_wing_flaps();
}

/* The flaps where the notch has them, at once, as sim_reset puts them: for
 * a host that holds a parked aircraft by not stepping it, during which the
 * servos would have finished moving. */
SIM_EXPORT int sim_wing_flaps_settle(void) {
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  plant_wing_flaps_settle();
  return SIM_OK;
}

SIM_EXPORT int sim_wing_set_slats(int fitted) {
  if (fitted != 0 && fitted != 1) {
    return SIM_ERR_BAD_ARG;
  }
  plant_wing_set_slats(fitted);
  return SIM_OK;
}

/* The load on each wheel of an airframe with landing gear, newtons, in its
 * table's order (the Cub: left main, right main, tailwheel, prop tip); zero
 * for a wheel off the ground and for every wheel an airframe does not have.
 * Always SIM_WHEELS_MAX values. Additive, version unchanged. */
SIM_EXPORT int sim_wheel_loads(double *out) {
  if (out == 0) {
    return SIM_ERR_BAD_ARG;
  }
  for (int i = 0; i < SIM_WHEELS_MAX; i += 1) {
    out[i] = i < PLANT.wheel_count ? g_wheel_load[i] : 0.0;
  }
  return SIM_OK;
}

/*
 * What the floats did on the last step, for the gates and a renderer:
 * out[0] their buoyancy, N; out[1] the water's force along the body's up
 * axis past the buoyancy, the planing force and the damping, N; out[2]
 * the water's drag along the keels, N, positive holding the aircraft
 * back; out[3] the displaced volume, m^3; out[4], out[5] the wetted
 * length of the left and the right float, m; out[6] the load on the
 * keels on land, N; out[7] the water rudders' side force, N, body y;
 * out[8] the wave making drag, N; out[9] the index of the water body
 * under the aircraft, or -1. All zero, and out[9] zero, on an airframe
 * without floats. Additive, version unchanged.
 */
SIM_EXPORT int sim_float_state(double *out) {
  if (out == 0) {
    return SIM_ERR_BAD_ARG;
  }
  for (int i = 0; i < 10; i += 1) {
    out[i] = PLANT.floats.count ? g_float_diag[i] : 0.0;
  }
  return SIM_OK;
}

SIM_EXPORT int sim_plane_surfaces(double *out) {
  if (out == 0) {
    return SIM_ERR_BAD_ARG;
  }
  plant_plane_surfaces(out);
  return SIM_OK;
}

/* The rising air at a world position, m/s up, whichever airframe is
 * selected: the thermals of plant_wing.c. Only an airframe whose table
 * says so flies in them. For the gates, and for a shell that wants to
 * show where they are. Additive, version unchanged. */
SIM_EXPORT double sim_air_lift(double x, double y, double z) {
  const double pos[3] = { x, y, z };
  return plant_air_lift(pos);
}

/*
 * The water bodies and their waves, src/native/water.c. A world the host
 * declares, like the ground plane, in the plant's world frame; unlike the
 * ground it is kept across sim_reset, since a lake does not move when the
 * aircraft is put back, and sim_water_clear takes it away. Each declaring
 * call checks what it is handed and refuses rather than clamps. Additive,
 * version unchanged: with no body declared nothing reads any of it.
 */
SIM_EXPORT int sim_water_clear(void) {
  water_clear();
  return SIM_OK;
}

SIM_EXPORT int sim_water_add(double z0, double ox, double oy) {
  if (!sim_finite(z0) || !sim_finite(ox) || !sim_finite(oy)) {
    return SIM_ERR_BAD_ARG;
  }
  const int i = water_add(z0, ox, oy);
  return i < 0 ? SIM_ERR_BAD_STATE : i;
}

SIM_EXPORT int sim_water_vertex(int body, double x, double y) {
  if (!sim_finite(x) || !sim_finite(y)) {
    return SIM_ERR_BAD_ARG;
  }
  return water_vertex(body, x, y) < 0 ? SIM_ERR_BAD_ARG : SIM_OK;
}

/* A unit direction, or the refusal: |d| within 3 percent of one. */
static int water_unit2(double dx, double dy) {
  const double d2 = dx * dx + dy * dy;
  return sim_finite(d2) && d2 > 0.97 && d2 < 1.03;
}

SIM_EXPORT int sim_water_wind(int body, double speed, double dx, double dy, double fetch) {
  if (!sim_finite(speed) || !(speed >= 0.0) || !(speed <= 30.0)
      || !sim_finite(fetch) || !(fetch >= 0.0) || !(fetch <= 1.0e6) || !water_unit2(dx, dy)) {
    return SIM_ERR_BAD_ARG;
  }
  return water_wind(body, speed, dx, dy, fetch) < 0 ? SIM_ERR_BAD_ARG : SIM_OK;
}

SIM_EXPORT int sim_water_swell(int body, double height, double period, double dx, double dy) {
  if (!sim_finite(height) || !(height >= 0.0) || !(height <= 5.0)
      || !sim_finite(period) || !(period >= 0.5) || !(period <= 30.0) || !water_unit2(dx, dy)) {
    return SIM_ERR_BAD_ARG;
  }
  return water_swell(body, height, period, dx, dy) < 0 ? SIM_ERR_BAD_ARG : SIM_OK;
}

/*
 * The surface under (x, y) at time t, sim seconds: out[0] the body's index
 * or -1 where there is no water, out[1] the surface's height, world z,
 * out[2] and out[3] its slope along x and y, out[4..6] the water's
 * velocity. Where there is no water out[1..6] are zero. For the gates and
 * for the renderer's cross check; the plant samples the same function.
 */
SIM_EXPORT int sim_water_sample(double x, double y, double t, double *out) {
  if (out == 0) {
    return SIM_ERR_BAD_ARG;
  }
  const int b = water_body_at(x, y);
  out[0] = (double)b;
  if (b < 0) {
    for (int i = 1; i < 7; i += 1) {
      out[i] = 0.0;
    }
    return SIM_OK;
  }
  water_sample(b, x, y, t, out + 1);
  return SIM_OK;
}

/*
 * What the renderer uploads as uniforms: out[0] the count n, out[1] still
 * water z, out[2] out[3] the phase origin, out[4] out[5] the wind sea's
 * significant height and peak period, then per component a, kx, ky, omega
 * and phase, five doubles each. Room for 6 + 5 x WATER_COMP_MAX doubles.
 */
SIM_EXPORT int sim_water_components(int body, double *out) {
  const WaterBody *b = water_body(body);
  if (out == 0 || b == 0) {
    return SIM_ERR_BAD_ARG;
  }
  out[0] = (double)b->ncomp;
  out[1] = b->z0;
  out[2] = b->ox;
  out[3] = b->oy;
  out[4] = b->hs;
  out[5] = b->tp;
  for (int c = 0; c < b->ncomp; c += 1) {
    out[6 + 5 * c] = b->comp[c].a;
    out[7 + 5 * c] = b->comp[c].kx;
    out[8 + 5 * c] = b->comp[c].ky;
    out[9 + 5 * c] = b->comp[c].om;
    out[10 + 5 * c] = b->comp[c].ph;
  }
  return SIM_OK;
}

/* The fixed libm's full range sin and cos, for the wave field's JS mirror
 * to be held against. Additive; not part of the flight ABI. */
SIM_EXPORT double sim_math_sin(double x) {
  return sim_sin(x);
}

SIM_EXPORT double sim_math_cos(double x) {
  return sim_cos(x);
}

/* The fixed libm's atan2, exported so a test can hold it against the host's
 * on a grid. Additive; not part of the flight ABI. */
SIM_EXPORT double sim_math_atan2(double y, double x) {
  return sim_atan2(y, x);
}

SIM_EXPORT int sim_state_size(void) { return SIM_STATE_DOUBLES; }

SIM_EXPORT int sim_state(double *out) {
  if (out == 0) {
    return SIM_ERR_BAD_ARG;
  }
  if (!g_initialised) {
    return SIM_ERR_BAD_STATE;
  }
  out[0] = (double)S.step_index / (double)SIM_STEP_HZ;
  out[1] = S.pos[0];
  out[2] = S.pos[1];
  out[3] = S.pos[2];
  out[4] = S.vel[0];
  out[5] = S.vel[1];
  out[6] = S.vel[2];
  out[7] = S.quat[0];
  out[8] = S.quat[1];
  out[9] = S.quat[2];
  out[10] = S.quat[3];
  out[11] = S.omega[0];
  out[12] = S.omega[1];
  out[13] = S.omega[2];
  /* rad/s to RPM is a display conversion fixed by the ABI. */
  const double to_rpm = 60.0 / (2.0 * 3.14159265358979323846);
  out[14] = S.motor_omega[0] * to_rpm;
  out[15] = S.motor_omega[1] * to_rpm;
  out[16] = S.motor_omega[2] * to_rpm;
  out[17] = S.motor_omega[3] * to_rpm;
  out[18] = S.vbat_load;
  out[19] = S.pack_current;
  return SIM_OK;
}
