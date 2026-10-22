/*
 * crash_parts.h: every airframe's part table, the data half of crash.c.
 * docs/CRASH-STAGE1.md derives each number and names its source; the
 * comments here say only where a number came from in one line.
 *
 * Body frame, metres, the plant's: x forward, y left, z up, origin at the
 * airframe's CG. Positions are the drawn models' (the craft builders in
 * src/render), converted the way src/render/frame.js does it; where a drawn
 * model and the plant disagree the drawn one is used for a part, and the doc
 * lists each disagreement. The root's mass and centre of mass are NOT written here:
 * crash.c computes them as the residual, so the masses sum to the airframe's
 * mass and the CG stays at the origin by construction.
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

#ifndef CRASH_PARTS_H
#define CRASH_PARTS_H

/* How a part's hull points are written. SH_PTS: as listed. SH_ARM: a strip
 * along the motor's diagonal, pts[0] = {r0, r1, half width} radially from the
 * CG, pts[1] = {z0, z1}. SH_DISCZ and SH_DISCX: an octagon of radius pts[1][0]
 * round the centre pts[0], in the body x y plane (a quad's rotor) or the body
 * y z plane (a plane's prop). */
#define SH_PTS 0
#define SH_ARM 1
#define SH_DISCZ 2
#define SH_DISCX 3

typedef struct {
  int kind;       /* SIM_PART_* */
  int parent;     /* table index, -1 for the root (index 0) */
  int mat;        /* SIM_MAT_* */
  int motor;      /* the motor it is or carries, -1 */
  int wheel;      /* the PlantParams wheel it carries, -1 */
  int shape;      /* SH_* */
  double mass;    /* kg; ignored for the root */
  double joint[3];
  double m_max;   /* the joint's bending moment limit, N m */
  double m_max_z; /* a panel's limit about body z, in its own plane (its
                   * chord is its depth that way), N m; 0 for a part as
                   * strong every way (crash.c, joint_m_lim) */
  double f_max;   /* the joint's force limit, N */
  double bay[3];  /* a part seated in a bay or a recess of its parent: the
                   * way out, body frame, unit; zero for none (crash.c, A
                   * PART IN A BAY) */
  double k;       /* contact stiffness at its surface, N/m */
  double crush_s; /* crush plateau stress, Pa, 0 for none */
  double crush_a; /* crush area, m^2 */
  double crush_d; /* crush depth before it is spent, m */
  double crush_n[3]; /* the side it crushes on, outward, body unit: met
                      * within 60 degrees of it; zero for a part that
                      * crushes every way (crash.c, crush_area) */
  double slip_d;  /* a strap's travel: how far the part slides and stretches
                   * in it at its force limit before it is free, m; 0 for a
                   * joint that lets go at its limit (crash.c, A PACK SLIDES
                   * IN ITS STRAP) */
  int blades;     /* a prop's blade count, 0 for two */
  double sect_c;  /* the section it bends on, a panel's carbon spar or a foam
                   * boom's own walls: its outer fibre's distance from the
                   * neutral axis, m (crash.c, A PART RINGS); 0 for a part too
                   * stiff to ring within a contact */
  double sect_eos; /* that section's flexural modulus over the bending
                    * strength m_max was taken at, so E I = eos m_max c */
  int sect_joint;  /* 1 when that section is a separate member seated in the
                    * airframe (a spar plugged in, a tube clamped), 0 when it
                    * is moulded in one piece with it: how its ring is damped
                    * (crash.c, A RING'S DAMPING) */
  int npts;
  double pts[SIM_PART_PTS_MAX][3];
} PartDef;

#define BOX(x0, x1, y0, y1, z0, z1) \
  .npts = 8, .pts = { { x0, y0, z0 }, { x1, y0, z0 }, { x0, y1, z0 }, { x1, y1, z0 }, \
                      { x0, y0, z1 }, { x1, y0, z1 }, { x0, y1, z1 }, { x1, y1, z1 } }

/*
 * MATERIAL LIMITS, each derived in docs/CRASH-STAGE1.md from the section the
 * drawn model gives and the material's published strength.
 */
/* Five inch arm, 16 x 7.6 mm quasi isotropic CF plate: Z = b h^2 / 6 =
 * 1.540e-7 m^3 at 600 MPa times 0.8 for the clamp's screw holes. */
#define M5_ARM_M 73.9
/* The same arm bent in its own plane, a blow from the side (a gate post
 * met by the motor end): its depth that way is its 16 mm width, Z = h b^2
 * / 6 = 3.243e-7 m^3, 2.1 times as strong, as R-ARM's own derivation has
 * it (1,100 N sideways against 470 N from above). */
#define M5_ARM_MZ 155.6
/* Its tip stiffness, 3 E I / L^3: E 50 GPa, I 5.853e-10 m^4, L 0.0635 m. */
#define M5_ARM_K 3.43e5
/* 5 inch tri blade root, 12 x 2.5 mm, PA66 GF30 conditioned 200 MPa: the
 * blade yields at 2.5 N m. Race props are ductile, polycarbonate or glass
 * nylon, and fly on bent: the blades shear off the hub at about three times
 * the yield (plastic hinge and strain hardening), which is the joint's
 * limit; from the yield up they chip (CHIP_ONSET in crash.c). */
#define M5_PROP_M (3.0 * 2.5)
#define M5_PROP_K 1690.0
/* 2207 motor on four M3 in an aluminium base: two screws' pull out, 1.5 kN
 * each, on the 16 mm pattern. */
#define M5_MOTOR_M 48.0
/* EPO and EPP at 30 to 35 g/L: the compressive plateau at 25 percent. EPO
 * is a polystyrene and polyethylene bead copolymer, NOVA's ARCEL class:
 * ARCEL 730 (70/30) crushes at 26 to 31 psi at 25 percent over 30 to 35
 * g/L, 179 to 214 kPa (NOVA, "ARCEL 730 Property Comparison",
 * AC0111-1158). */
#define EPO_CRUSH 200.0e3
#define EPP_CRUSH 180.0e3
/* An 11 inch nylon prop blade root, 20 x 4 mm at 150 MPa, yields at 8 N m;
 * glass filled electric props are less ductile than a quad's, and shed a
 * blade at twice it. */
#define PL_PROP_M (2.0 * 8.0)
#define PL_PROP_K 1110.0
/* A five inch met on its nose or its top, as it meets a wall at speed,
 * pitched well forward: the plates do not crush, the four aluminium
 * standoffs between them rack. Each is a 5 mm tube on its 3 mm bore,
 * plastic moment 276 MPa (6061, as ALU_BEND_ONSET) x (D^3 - d^3) / 6 = 4.5
 * N m, and racks at 4 Mp / h over its 30 mm, 600 N: four hold 2.4 kN. The
 * camera cage and stack on them are softer and left out. The travel is
 * R-ARM's upper crush distance, 40 mm. From below the bottom plate and the
 * pack bear it, and from the side the arms (crush_n). */
#define M5_NOSE_F 2400.0
#define M5_NOSE_D 0.040
/* A five inch pack's strap travel: the strap crosses the pack's middle, so
 * the pack is free once it has slid half its drawn 72 mm length out from
 * under it. The webbing's own stretch is left out: nylon harness webbing
 * stretches 20 to 30 percent, polyester 5 to 15, but at 11 kN (Wikipedia,
 * "Webbing"), and at a strap's 250 N it adds little to the slide. */
#define M5_STRAP_D 0.036
/* Hook and loop in shear, 8 N/cm^2, over a 12 cm^2 strip. */
#define VELCRO_12 96.0
/* Two 6 x 3 mm hatch magnets in pull: a 6 x 3 mm N45 disc holds about
 * 990 g on steel, 9.7 N (supermagnete S-06-03-N), N52 a little more. Slid
 * sideways the same disc lets go at about 200 g, 1.9 N, which a hatch
 * seated in its recess does not see. */
#define MAGNET_2 20.0
/* Music wire, 1600 MPa in bending at yield; the break is the plastic
 * hinge, 1.7 times the yield moment, at the ultimate 1.3 times the yield. */
#define WIRE_M(d) (1600.0e6 * 3.14159265358979323846 * (d) * (d) * (d) / 32.0 * 2.21)

/* The sections a part rings on (crash.c, A PART RINGS). A pultruded carbon
 * spar or tube, r its outer radius: flexural modulus 127 GPa over the 1,000
 * MPa the limits take (TAP Plastics, minimum properties). A foam boom's own
 * section, c its half depth: bead foam's flexural modulus at 30 g/L, E =
 * 0.82 rho - 4.9 MPa = 19.7 MPa (Negussey and Anasthas 2001, simple bending
 * of EPS), an upper bound for EPO, which NOVA's "ARCEL versus EPS" sheet
 * draws as more flexible than EPS at every density; over EPO's 0.6 MPa the
 * boom limits take. ARCEL 730's tensile strength is 0.465 to 0.58 MPa over
 * 30 to 35 g/L (the same NOVA sheet), so 0.6 is its top, about 36 g/L; it
 * is kept there while the modulus is a bound from above, since a stiffer
 * boom rings harder on the same kick and the two bounds lean the same way
 * only together (docs/CRASH-STAGE1.md, round 5). Every carbon spar and
 * tube in these tables is a separate member, plugged into the fuselage or
 * clamped in it with screws, and every foam boom is the fuselage moulded
 * on past the wing, so the section says which a ring is (sect_joint). */
#define CARBON_SPAR(r) .sect_c = (r), .sect_eos = 127.0, .sect_joint = 1
#define FOAM_EOS (19.7 / 0.6)
/* That modulus in Pa: a foam part's crush plateau over it is the strain it
 * stands elastically before the plateau (EPO 200 kPa over 19.7 MPa, 1.0
 * percent), how far a curved face gives before it starts to crush
 * (crash.c, THE PATCH GROWS AS THE FOAM GOES IN). */
#define FOAM_E 19.7e6
/* FOAM SPRINGS BACK (owner, 2026-09-28; crash.c, crush_kept). The share of
 * a crush a bead foam part keeps once unloaded. ARPRO EPP 30 g/L's
 * compression set is 7 percent after 25 percent strain and 12 percent after
 * 50 (R-FOAM), and ASTM D3575 Suffix B states set as a percent of the
 * ORIGINAL THICKNESS, not of the crush: 7/25 = 0.28 and 12/50 = 0.24 of
 * what was crushed, 0.26 their middle. */
#define FOAM_SET 0.26
/* The strain the plateau starts at, the datasheet's first crush point: 10
 * percent (R-FOAM). A crush shallower than that over its patch's width
 * keeps less than FOAM_SET of it, a scuff, and marks nothing. */
#define FOAM_ONSET 0.10
#define FOAM_SECTION(c) .sect_c = (c), .sect_eos = FOAM_EOS, .sect_joint = 0
/* A composite shell's own section, carbon skins on a honeycomb core, c its
 * half depth: woven carbon laminate's 70 GPa over its 600 MPa (DragonPlate,
 * R-ARM; Easy Composites' sheet, 45 to 55 GPa at 571 to 880 MPa, is the
 * softer end, so this bounds the frequency from above as the spar's does). */
#define SHELL_EOS (70.0 / 0.6)
/* The Bramor's shells are plug in wings, seated members like the spars. */
#define SHELL_SECTION(c) .sect_c = (c), .sect_eos = SHELL_EOS, .sect_joint = 1
/* The same box bent in its own plane: its top and bottom skins, which are
 * its flanges flapwise (Z about s c t for a skin s thick over the chord c
 * at the depth t), are its webs fore and aft (Z about 2 s c^2 / 6), so it
 * holds c / (3 t) times its flapwise limit. */
#define SHELL_IN(m, c, t) ((m) * (c) / (3.0 * (t)))

/* A PANEL IN ITS OWN PLANE. A wing panel's limit is its flapwise one, the
 * spar's; bent in its own plane, fore and aft (a tip caught in the grass, a
 * belly stopped under a panel still going), its depth is its chord and the
 * foam slab carries it: sigma t c^2 / 6 over the root's chord c and depth t
 * as drawn. The slab cracks first (EPO at 2.4 percent strain, 0.465 MPa over
 * bead foam's 19.7 MPa, where the carbon spar at the section's middle is
 * still at a tenth of its own), so this bounds it from below and the spar's
 * share is left out. EPO's tensile strength is the low end of NOVA's ARCEL
 * 730 sheet, 0.465 to 0.58 MPa over 30 to 35 g/L; EPP's is JSP ARPRO's 55.5
 * psi at 30 g/L, 0.38 MPa (docs/CRASH-STAGE1.md, round 3). */
#define EPO_TENSILE 0.465e6
#define EPP_TENSILE 0.38e6
#define SLAB_M(sigma, c, t) ((sigma) * (t) * (c) * (c) / 6.0)

/* A foam plane's pack in its bay and its hatch in its recess, both open
 * upward: only a pull out through the top is its hook and loop's or its
 * magnets'. */
#define IN_BAY .bay = { 0.0, 0.0, 1.0 }

/* A tractor's motor sits in the foam nose on its firewall: struck head on,
 * it is the nose behind it that crushes, over the nose's section. */
#define NOSE_CRUSH(area, depth) .crush_s = EPO_CRUSH, .crush_a = (area), .crush_d = (depth)

/* Joints of the plane parts that recur. */
#define PL_MOTOR_M 10.0  /* a 3 mm ply or moulded firewall, four screws */
#define PL_SURF_F 40.0   /* a foam or tape hinge line pulling out */
#define PL_SURF_M 1.0
#define FPV_CAM_M 0.8    /* a TPU mount's side screws, the camera leaves */
#define FPV_CAM_F 60.0
#define FPV_ANT_M 1.0   /* a whip in a TPU mount flexes a long way before it tears out */
#define FPV_ANT_F 40.0

/* ------------------------------------------------------------------------
 * 5 INCH, SIM_AIRFRAME_5IN, herocraft.js. 0.71 kg. Motors in Betaflight
 * order at +-0.07778 on each axis: 0 rear right, 1 front right, 2 rear
 * left, 3 front left.
 * --------------------------------------------------------------------- */
#define Q5 0.0777817459305202
static const PartDef PARTS_5IN[] = {
  /* 0 frame: plates, stack, pod. Its nose and top crush (M5_NOSE_F) over
   * its drawn 38 by 45 mm section. */
  { .kind = SIM_PART_FRAME, .parent = -1, .mat = SIM_MAT_CF_PLATE, .motor = -1, .wheel = -1,
    .k = 5.0e6, .crush_s = M5_NOSE_F / 1.71e-3, .crush_a = 1.71e-3, .crush_d = M5_NOSE_D,
    .crush_n = { 0.7071068, 0.0, 0.7071068 }, BOX(-0.047, 0.070, -0.019, 0.019, -0.005, 0.040) },
  /* 1..4 arms, joint at the plate's edge, radius 0.030. */
  { .kind = SIM_PART_ARM, .parent = 0, .mat = SIM_MAT_CF_PLATE, .motor = 0, .wheel = -1, .shape = SH_ARM,
    .mass = 0.012, .joint = { -0.0212132, -0.0212132, 0.002 }, .m_max = M5_ARM_M, .m_max_z = M5_ARM_MZ,
    .f_max = 4000.0, .k = M5_ARM_K,
    .npts = 8, .pts = { { 0.020, 0.0935, 0.008 }, { -0.0018, 0.0058, 0.0 } } },
  { .kind = SIM_PART_ARM, .parent = 0, .mat = SIM_MAT_CF_PLATE, .motor = 1, .wheel = -1, .shape = SH_ARM,
    .mass = 0.012, .joint = { 0.0212132, -0.0212132, 0.002 }, .m_max = M5_ARM_M, .m_max_z = M5_ARM_MZ,
    .f_max = 4000.0, .k = M5_ARM_K,
    .npts = 8, .pts = { { 0.020, 0.0935, 0.008 }, { -0.0018, 0.0058, 0.0 } } },
  { .kind = SIM_PART_ARM, .parent = 0, .mat = SIM_MAT_CF_PLATE, .motor = 2, .wheel = -1, .shape = SH_ARM,
    .mass = 0.012, .joint = { -0.0212132, 0.0212132, 0.002 }, .m_max = M5_ARM_M, .m_max_z = M5_ARM_MZ,
    .f_max = 4000.0, .k = M5_ARM_K,
    .npts = 8, .pts = { { 0.020, 0.0935, 0.008 }, { -0.0018, 0.0058, 0.0 } } },
  { .kind = SIM_PART_ARM, .parent = 0, .mat = SIM_MAT_CF_PLATE, .motor = 3, .wheel = -1, .shape = SH_ARM,
    .mass = 0.012, .joint = { 0.0212132, 0.0212132, 0.002 }, .m_max = M5_ARM_M, .m_max_z = M5_ARM_MZ,
    .f_max = 4000.0, .k = M5_ARM_K,
    .npts = 8, .pts = { { 0.020, 0.0935, 0.008 }, { -0.0018, 0.0058, 0.0 } } },
  /* 5..8 motors, 2207 with leads, on their arm. */
  { .kind = SIM_PART_MOTOR, .parent = 1, .mat = SIM_MAT_ALU, .motor = 0, .wheel = -1,
    .mass = 0.033, .joint = { -Q5, -Q5, 0.0 }, .m_max = M5_MOTOR_M, .f_max = 3000.0, .k = 2.0e6,
    BOX(-Q5 - 0.014, -Q5 + 0.014, -Q5 - 0.014, -Q5 + 0.014, 0.0, 0.026) },
  { .kind = SIM_PART_MOTOR, .parent = 2, .mat = SIM_MAT_ALU, .motor = 1, .wheel = -1,
    .mass = 0.033, .joint = { Q5, -Q5, 0.0 }, .m_max = M5_MOTOR_M, .f_max = 3000.0, .k = 2.0e6,
    BOX(Q5 - 0.014, Q5 + 0.014, -Q5 - 0.014, -Q5 + 0.014, 0.0, 0.026) },
  { .kind = SIM_PART_MOTOR, .parent = 3, .mat = SIM_MAT_ALU, .motor = 2, .wheel = -1,
    .mass = 0.033, .joint = { -Q5, Q5, 0.0 }, .m_max = M5_MOTOR_M, .f_max = 3000.0, .k = 2.0e6,
    BOX(-Q5 - 0.014, -Q5 + 0.014, Q5 - 0.014, Q5 + 0.014, 0.0, 0.026) },
  { .kind = SIM_PART_MOTOR, .parent = 4, .mat = SIM_MAT_ALU, .motor = 3, .wheel = -1,
    .mass = 0.033, .joint = { Q5, Q5, 0.0 }, .m_max = M5_MOTOR_M, .f_max = 3000.0, .k = 2.0e6,
    BOX(Q5 - 0.014, Q5 + 0.014, Q5 - 0.014, Q5 + 0.014, 0.0, 0.026) },
  /* 9..12 props, 5 inch tri blades, discs at z 0.034. */
  { .kind = SIM_PART_PROP, .parent = 5, .mat = SIM_MAT_NYLON_GF, .motor = 0, .wheel = -1, .shape = SH_DISCZ, .blades = 3,
    .mass = 0.0045, .joint = { -Q5, -Q5, 0.030 }, .m_max = M5_PROP_M, .f_max = 400.0, .k = M5_PROP_K,
    .npts = 8, .pts = { { -Q5, -Q5, 0.034 }, { 0.0635, 0.0, 0.0 } } },
  { .kind = SIM_PART_PROP, .parent = 6, .mat = SIM_MAT_NYLON_GF, .motor = 1, .wheel = -1, .shape = SH_DISCZ, .blades = 3,
    .mass = 0.0045, .joint = { Q5, -Q5, 0.030 }, .m_max = M5_PROP_M, .f_max = 400.0, .k = M5_PROP_K,
    .npts = 8, .pts = { { Q5, -Q5, 0.034 }, { 0.0635, 0.0, 0.0 } } },
  { .kind = SIM_PART_PROP, .parent = 7, .mat = SIM_MAT_NYLON_GF, .motor = 2, .wheel = -1, .shape = SH_DISCZ, .blades = 3,
    .mass = 0.0045, .joint = { -Q5, Q5, 0.030 }, .m_max = M5_PROP_M, .f_max = 400.0, .k = M5_PROP_K,
    .npts = 8, .pts = { { -Q5, Q5, 0.034 }, { 0.0635, 0.0, 0.0 } } },
  { .kind = SIM_PART_PROP, .parent = 8, .mat = SIM_MAT_NYLON_GF, .motor = 3, .wheel = -1, .shape = SH_DISCZ, .blades = 3,
    .mass = 0.0045, .joint = { Q5, Q5, 0.030 }, .m_max = M5_PROP_M, .f_max = 400.0, .k = M5_PROP_K,
    .npts = 8, .pts = { { Q5, Q5, 0.034 }, { 0.0635, 0.0, 0.0 } } },
  /* 13 the 6S 1300 under the frame, its bottom at the plant's measured
   * 45 mm (configs/airframes.js), on a strap that slips at 250 N and lets
   * it go only after M5_STRAP_D of slide. */
  { .kind = SIM_PART_BATTERY, .parent = 0, .mat = SIM_MAT_LIPO, .motor = -1, .wheel = -1,
    .mass = 0.200, .joint = { -0.012, 0.0, -0.006 }, .m_max = 6.0, .f_max = 250.0, .k = 3.0e5,
    .slip_d = M5_STRAP_D,
    BOX(-0.048, 0.024, -0.018, 0.018, -0.045, -0.006) },
  /* 14 the FPV camera in its TPU mount, glass at the plant's 0.104. */
  { .kind = SIM_PART_CAMERA, .parent = 0, .mat = SIM_MAT_ELECTRONICS, .motor = -1, .wheel = -1,
    .mass = 0.010, .joint = { 0.085, 0.0, 0.018 }, .m_max = FPV_CAM_M, .f_max = FPV_CAM_F, .k = 3.0e4,
    BOX(0.080, 0.104, -0.0095, 0.0095, 0.0085, 0.0275) },
  /* 15 the video antenna in its TPU mount at the back. */
  { .kind = SIM_PART_ANTENNA, .parent = 0, .mat = SIM_MAT_WIRE, .motor = -1, .wheel = -1,
    .mass = 0.004, .joint = { -0.036, 0.012, 0.024 }, .m_max = FPV_ANT_M, .f_max = FPV_ANT_F, .k = 1.0e3,
    .npts = 2, .pts = { { -0.036, 0.012, 0.024 }, { -0.031, 0.016, 0.066 } } },
};

/* ------------------------------------------------------------------------
 * FLYING WING 1000, SIM_AIRFRAME_WING1000. No drawn model is left (the
 * shell seats the Bramor for it); the plant's hull, prop and camera and
 * WING-STAGE1's layout. EPP, a 6 mm carbon rod joining the panels. 0.65 kg.
 * --------------------------------------------------------------------- */
static const PartDef PARTS_WING1000[] = {
  { .kind = SIM_PART_FUSELAGE, .parent = -1, .mat = SIM_MAT_EPP, .motor = -1, .wheel = -1,
    .k = 2.0e5, .crush_s = EPP_CRUSH, .crush_a = 0.0036, .crush_d = 0.06,
    BOX(-0.10, 0.22, -0.06, 0.06, -0.035, 0.035) },
  /* 1, 2 the panels, swept, the rod joiner's 21 N m. */
  { .kind = SIM_PART_WING, .parent = 0, .mat = SIM_MAT_EPP, .motor = -1, .wheel = -1,
    .mass = 0.09, .joint = { 0.0, 0.06, 0.0 }, CARBON_SPAR(0.003), .m_max = 21.0, .m_max_z = SLAB_M(EPP_TENSILE, 0.26, 0.04), .f_max = 400.0, .k = 3000.0,
    .crush_s = EPP_CRUSH, .crush_a = 0.0012, .crush_d = 0.10,
    .npts = 8, .pts = { { 0.12, 0.06, -0.02 }, { -0.14, 0.06, -0.02 }, { -0.06, 0.50, -0.01 }, { -0.22, 0.50, -0.01 },
                        { 0.12, 0.06, 0.02 }, { -0.14, 0.06, 0.02 }, { -0.06, 0.50, 0.01 }, { -0.22, 0.50, 0.01 } } },
  { .kind = SIM_PART_WING, .parent = 0, .mat = SIM_MAT_EPP, .motor = -1, .wheel = -1,
    .mass = 0.09, .joint = { 0.0, -0.06, 0.0 }, CARBON_SPAR(0.003), .m_max = 21.0, .m_max_z = SLAB_M(EPP_TENSILE, 0.26, 0.04), .f_max = 400.0, .k = 3000.0,
    .crush_s = EPP_CRUSH, .crush_a = 0.0012, .crush_d = 0.10,
    .npts = 8, .pts = { { 0.12, -0.06, -0.02 }, { -0.14, -0.06, -0.02 }, { -0.06, -0.50, -0.01 }, { -0.22, -0.50, -0.01 },
                        { 0.12, -0.06, 0.02 }, { -0.14, -0.06, 0.02 }, { -0.06, -0.50, 0.01 }, { -0.22, -0.50, 0.01 } } },
  /* 3, 4 elevons on the panels' trailing edges. */
  { .kind = SIM_PART_ELEVON, .parent = 1, .mat = SIM_MAT_EPP, .motor = -1, .wheel = -1,
    .mass = 0.012, .joint = { -0.16, 0.25, 0.0 }, .m_max = PL_SURF_M, .f_max = PL_SURF_F, .k = 2000.0,
    BOX(-0.24, -0.13, 0.10, 0.45, -0.008, 0.008) },
  { .kind = SIM_PART_ELEVON, .parent = 2, .mat = SIM_MAT_EPP, .motor = -1, .wheel = -1,
    .mass = 0.012, .joint = { -0.16, -0.25, 0.0 }, .m_max = PL_SURF_M, .f_max = PL_SURF_F, .k = 2000.0,
    BOX(-0.24, -0.13, -0.45, -0.10, -0.008, 0.008) },
  { .kind = SIM_PART_MOTOR, .parent = 0, .mat = SIM_MAT_ALU, .motor = 0, .wheel = -1,
    .mass = 0.06, .joint = { -0.09, 0.0, 0.0 }, .m_max = PL_MOTOR_M, .f_max = 400.0, .k = 1.0e6,
    BOX(-0.12, -0.09, -0.015, 0.015, -0.015, 0.015) },
  /* 6 a 6x4 pusher. */
  { .kind = SIM_PART_PROP, .parent = 5, .mat = SIM_MAT_NYLON_GF, .motor = 0, .wheel = -1, .shape = SH_DISCX,
    .mass = 0.008, .joint = { -0.125, 0.0, 0.0 }, .m_max = 3.0, .f_max = 200.0, .k = 1500.0,
    .npts = 8, .pts = { { -0.13, 0.0, 0.0 }, { 0.0762, 0.0, 0.0 } } },
  { .kind = SIM_PART_BATTERY, .parent = 0, .mat = SIM_MAT_LIPO, .motor = -1, .wheel = -1, IN_BAY,
    .mass = 0.20, .joint = { 0.06, 0.0, -0.02 }, .m_max = 4.0, .f_max = VELCRO_12, .k = 3.0e5,
    BOX(0.0, 0.12, -0.02, 0.02, -0.02, 0.015) },
  { .kind = SIM_PART_CAMERA, .parent = 0, .mat = SIM_MAT_ELECTRONICS, .motor = -1, .wheel = -1,
    .mass = 0.010, .joint = { 0.19, 0.0, 0.02 }, .m_max = FPV_CAM_M, .f_max = FPV_CAM_F, .k = 3.0e4,
    BOX(0.185, 0.21, -0.01, 0.01, 0.01, 0.03) },
  { .kind = SIM_PART_ANTENNA, .parent = 0, .mat = SIM_MAT_WIRE, .motor = -1, .wheel = -1,
    .mass = 0.004, .joint = { -0.06, 0.0, 0.035 }, .m_max = FPV_ANT_M, .f_max = FPV_ANT_F, .k = 1.0e3,
    .npts = 2, .pts = { { -0.06, 0.0, 0.035 }, { -0.06, 0.0, 0.085 } } },
};

/* ------------------------------------------------------------------------
 * BRAMOR C4EYE 2300, SIM_AIRFRAME_BRAMOR2300, bramorcraft.js. 4.5 kg of
 * carbon and Kevlar skins on a non-metallic honeycomb, no structural metal;
 * the outer panels slide onto a carbon guide rod and click in, the 20 g
 * Kevlar winglets are held on by magnets (UST 011, pp. 22 and 25). A
 * composite shell cracks rather than crushes, so nothing here crushes. A
 * panel rings on its shell, 17 mm its root's half depth; its 300 N m is
 * chosen, since neither the skins nor the rod is published.
 * --------------------------------------------------------------------- */
static const PartDef PARTS_BRAMOR2300[] = {
  { .kind = SIM_PART_FUSELAGE, .parent = -1, .mat = SIM_MAT_CF_PLATE, .motor = -1, .wheel = -1,
    .k = 2.0e6, BOX(-0.332, 0.4097, -0.30, 0.30, -0.065, 0.087) },
  { .kind = SIM_PART_WING, .parent = 0, .mat = SIM_MAT_CF_PLATE, .motor = -1, .wheel = -1,
    .mass = 0.50, .joint = { -0.08, 0.30, 0.008 }, SHELL_SECTION(0.017), .m_max = 300.0, .m_max_z = SHELL_IN(300.0, 0.26, 0.034), .f_max = 2500.0, .k = 1.0e4,
    .npts = 8, .pts = { { 0.050, 0.30, -0.009 }, { -0.210, 0.30, -0.009 }, { -0.347, 1.15, 0.006 }, { -0.467, 1.15, 0.006 },
                        { 0.050, 0.30, 0.025 }, { -0.210, 0.30, 0.025 }, { -0.347, 1.15, 0.018 }, { -0.467, 1.15, 0.018 } } },
  { .kind = SIM_PART_WING, .parent = 0, .mat = SIM_MAT_CF_PLATE, .motor = -1, .wheel = -1,
    .mass = 0.50, .joint = { -0.08, -0.30, 0.008 }, SHELL_SECTION(0.017), .m_max = 300.0, .m_max_z = SHELL_IN(300.0, 0.26, 0.034), .f_max = 2500.0, .k = 1.0e4,
    .npts = 8, .pts = { { 0.050, -0.30, -0.009 }, { -0.210, -0.30, -0.009 }, { -0.347, -1.15, 0.006 }, { -0.467, -1.15, 0.006 },
                        { 0.050, -0.30, 0.025 }, { -0.210, -0.30, 0.025 }, { -0.347, -1.15, 0.018 }, { -0.467, -1.15, 0.018 } } },
  { .kind = SIM_PART_ELEVON, .parent = 1, .mat = SIM_MAT_CF_PLATE, .motor = -1, .wheel = -1,
    .mass = 0.040, .joint = { -0.35, 0.78, 0.01 }, .m_max = 3.0, .f_max = 150.0, .k = 5000.0,
    BOX(-0.46, -0.28, 0.45, 1.10, 0.000, 0.020) },
  { .kind = SIM_PART_ELEVON, .parent = 2, .mat = SIM_MAT_CF_PLATE, .motor = -1, .wheel = -1,
    .mass = 0.040, .joint = { -0.35, -0.78, 0.01 }, .m_max = 3.0, .f_max = 150.0, .k = 5000.0,
    BOX(-0.46, -0.28, -1.10, -0.45, 0.000, 0.020) },
  /* 5, 6 the winglets, Kevlar on magnets. */
  { .kind = SIM_PART_FIN, .parent = 1, .mat = SIM_MAT_PC, .motor = -1, .wheel = -1,
    .mass = 0.020, .joint = { -0.40, 1.14, 0.014 }, .m_max = 1.5, .f_max = 15.0, .k = 3000.0,
    BOX(-0.557, -0.353, 1.135, 1.15, 0.014, 0.25) },
  { .kind = SIM_PART_FIN, .parent = 2, .mat = SIM_MAT_PC, .motor = -1, .wheel = -1,
    .mass = 0.020, .joint = { -0.40, -1.14, 0.014 }, .m_max = 1.5, .f_max = 15.0, .k = 3000.0,
    BOX(-0.557, -0.353, -1.15, -1.135, 0.014, 0.25) },
  { .kind = SIM_PART_MOTOR, .parent = 0, .mat = SIM_MAT_ALU, .motor = 0, .wheel = -1,
    .mass = 0.20, .joint = { -0.32, 0.0, 0.087 }, .m_max = 25.0, .f_max = 800.0, .k = 1.0e6,
    BOX(-0.345, -0.320, -0.025, 0.025, 0.062, 0.112) },
  /* 8 the folding 12x8 pusher. */
  { .kind = SIM_PART_PROP, .parent = 7, .mat = SIM_MAT_NYLON_GF, .motor = 0, .wheel = -1, .shape = SH_DISCX,
    .mass = 0.030, .joint = { -0.345, 0.0, 0.087 }, .m_max = 2.0 * PL_PROP_M, .f_max = 400.0, .k = PL_PROP_K,
    .npts = 8, .pts = { { -0.350, 0.0, 0.087 }, { 0.1524, 0.0, 0.0 } } },
  /* 9 the 1.3 kg Li-ion pack under a latched hatch. */
  { .kind = SIM_PART_BATTERY, .parent = 0, .mat = SIM_MAT_LIPO, .motor = -1, .wheel = -1,
    .mass = 1.30, .joint = { 0.05, 0.0, -0.05 }, .m_max = 40.0, .f_max = 400.0, .k = 3.0e5,
    BOX(-0.05, 0.15, -0.045, 0.045, -0.050, 0.030) },
  /* 10 the chute bay lid, held down by the canopy's own pack. */
  { .kind = SIM_PART_CANOPY, .parent = 0, .mat = SIM_MAT_CF_PLATE, .motor = -1, .wheel = -1,
    .mass = 0.040, .joint = { 0.09, 0.0, 0.065 }, .m_max = 2.0, .f_max = 30.0, .k = 2.0e4,
    BOX(0.010, 0.170, -0.05, 0.05, 0.060, 0.072) },
  /* 11 the gimbal ball. */
  { .kind = SIM_PART_CAMERA, .parent = 0, .mat = SIM_MAT_ELECTRONICS, .motor = -1, .wheel = -1,
    .mass = 0.25, .joint = { 0.33, 0.0, -0.012 }, .m_max = 6.0, .f_max = 300.0, .k = 1.0e5,
    BOX(0.3097, 0.4117, -0.05, 0.05, -0.062, 0.038) },
  { .kind = SIM_PART_ANTENNA, .parent = 0, .mat = SIM_MAT_WIRE, .motor = -1, .wheel = -1,
    .mass = 0.006, .joint = { -0.060, -0.041, 0.070 }, .m_max = FPV_ANT_M, .f_max = FPV_ANT_F, .k = 1.0e3,
    .npts = 2, .pts = { { -0.060, -0.041, 0.070 }, { -0.060, -0.041, 0.110 } } },
};

/* ------------------------------------------------------------------------
 * STRIKER, SIM_AIRFRAME_STRIKER_PROP and SIM_AIRFRAME_STRIKER_JET,
 * strikercraft.js, docs/COMBAT-DRONES.md section 7. A giant scale glass
 * and carbon shell over foam: a 0.34 m tube, a cranked delta on a carbon
 * spar in two panels, fins screwed to the tips, the warhead's bay under
 * the nose cap. A composite shell cracks rather than crushes, as the
 * Bramor's does, so nothing here crushes. Positions are the drawing's
 * about each variant's CG (scripts/combat-derive.js); the two differ in
 * the engine at the tail.
 * --------------------------------------------------------------------- */
static const PartDef PARTS_STRIKER_PROP[] = {
  /* 0 the fuselage tube from the nose to the tail cone, the tank, the
   * spar box, the skid and the rest: the residual. */
  { .kind = SIM_PART_FUSELAGE, .parent = -1, .mat = SIM_MAT_CF_PLATE, .motor = -1, .wheel = -1,
    .k = 2.0e6, BOX(-0.874, 1.546, -0.17, 0.17, -0.1504, 0.1896) },
  /* 1, 2 the panels on their carbon spar, from the fuselage's side to the
   * fin, 64 mm deep at the root and 26 at the tip. 600 N m, chosen: a 6 g
   * pull loads a panel's root to about 180. */
  { .kind = SIM_PART_WING, .parent = 0, .mat = SIM_MAT_CF_PLATE, .motor = -1, .wheel = -1,
    .mass = 1.10, .joint = { -0.054, 0.17, -0.0504 }, SHELL_SECTION(0.032), .m_max = 600.0, .m_max_z = SHELL_IN(600.0, 1.54, 0.064), .f_max = 5000.0, .k = 1.0e4,
    .npts = 8, .pts = { { 0.706, 0.17, -0.0824 }, { -0.834, 0.17, -0.0824 }, { -0.594, 1.235, -0.0634 }, { -0.834, 1.235, -0.0634 },
                        { 0.706, 0.17, -0.0184 }, { -0.834, 0.17, -0.0184 }, { -0.594, 1.235, -0.0374 }, { -0.834, 1.235, -0.0374 } } },
  { .kind = SIM_PART_WING, .parent = 0, .mat = SIM_MAT_CF_PLATE, .motor = -1, .wheel = -1,
    .mass = 1.10, .joint = { -0.054, -0.17, -0.0504 }, SHELL_SECTION(0.032), .m_max = 600.0, .m_max_z = SHELL_IN(600.0, 1.54, 0.064), .f_max = 5000.0, .k = 1.0e4,
    .npts = 8, .pts = { { 0.706, -0.17, -0.0824 }, { -0.834, -0.17, -0.0824 }, { -0.594, -1.235, -0.0634 }, { -0.834, -1.235, -0.0634 },
                        { 0.706, -0.17, -0.0184 }, { -0.834, -0.17, -0.0184 }, { -0.594, -1.235, -0.0374 }, { -0.834, -1.235, -0.0374 } } },
  /* 3, 4 the elevons, 0.15 m of chord from 0.32 to 1.12 m out. */
  { .kind = SIM_PART_ELEVON, .parent = 1, .mat = SIM_MAT_CF_PLATE, .motor = -1, .wheel = -1,
    .mass = 0.15, .joint = { -0.684, 0.72, -0.0504 }, .m_max = 5.0, .f_max = 250.0, .k = 5000.0,
    BOX(-0.834, -0.684, 0.32, 1.12, -0.0614, -0.0394) },
  { .kind = SIM_PART_ELEVON, .parent = 2, .mat = SIM_MAT_CF_PLATE, .motor = -1, .wheel = -1,
    .mass = 0.15, .joint = { -0.684, -0.72, -0.0504 }, .m_max = 5.0, .f_max = 250.0, .k = 5000.0,
    BOX(-0.834, -0.684, -1.12, -0.32, -0.0614, -0.0394) },
  /* 5, 6 the fins with their rudders and servos, screwed to the tips. */
  { .kind = SIM_PART_FIN, .parent = 1, .mat = SIM_MAT_CF_PLATE, .motor = -1, .wheel = -1,
    .mass = 0.26, .joint = { -0.754, 1.235, -0.0504 }, .m_max = 15.0, .f_max = 300.0, .k = 3000.0,
    .npts = 8, .pts = { { -0.554, 1.235, -0.1704 }, { -0.874, 1.235, -0.1704 }, { -0.734, 1.235, 0.2496 }, { -0.954, 1.235, 0.2496 },
                        { -0.554, 1.251, -0.1704 }, { -0.874, 1.251, -0.1704 }, { -0.734, 1.251, 0.2496 }, { -0.954, 1.251, 0.2496 } } },
  { .kind = SIM_PART_FIN, .parent = 2, .mat = SIM_MAT_CF_PLATE, .motor = -1, .wheel = -1,
    .mass = 0.26, .joint = { -0.754, -1.235, -0.0504 }, .m_max = 15.0, .f_max = 300.0, .k = 3000.0,
    .npts = 8, .pts = { { -0.554, -1.235, -0.1704 }, { -0.874, -1.235, -0.1704 }, { -0.734, -1.235, 0.2496 }, { -0.954, -1.235, 0.2496 },
                        { -0.554, -1.251, -0.1704 }, { -0.874, -1.251, -0.1704 }, { -0.734, -1.251, 0.2496 }, { -0.954, -1.251, 0.2496 } } },
  /* 7 the boxer twin and its mount on four standoffs from the firewall,
   * 8 the 30 x 14 beech pusher: its blade root 40 by 12 mm, Z 9.6e-7 m^3
   * at 100 MPa, 96 N m. */
  { .kind = SIM_PART_MOTOR, .parent = 0, .mat = SIM_MAT_ALU, .motor = 0, .wheel = -1,
    .mass = 3.30, .joint = { -0.874, 0.0, 0.0196 }, .m_max = 150.0, .f_max = 3000.0, .k = 1.0e6,
    BOX(-1.034, -0.874, -0.21, 0.21, -0.0404, 0.1196) },
  { .kind = SIM_PART_PROP, .parent = 7, .mat = SIM_MAT_PLY, .motor = 0, .wheel = -1, .shape = SH_DISCX,
    .mass = 0.32, .joint = { -1.094, 0.0, 0.0196 }, .m_max = 96.0, .f_max = 1500.0, .k = 3000.0,
    .npts = 8, .pts = { { -1.124, 0.0, 0.0196 }, { 0.381, 0.0, 0.0 } } },
  /* 9 the ignition, receiver and servo packs, strapped in the bay
   * under the avionics; 10 the nose cap over the warhead bay on its
   * latches, which a nose in takes off first; 11 the FPV camera in it. */
  { .kind = SIM_PART_BATTERY, .parent = 0, .mat = SIM_MAT_LIPO, .motor = -1, .wheel = -1, IN_BAY,
    .mass = 0.60, .joint = { 0.946, 0.0, -0.0304 }, .m_max = 10.0, .f_max = 400.0, .k = 3.0e5,
    BOX(0.866, 1.026, -0.06, 0.06, -0.0904, 0.0196) },
  { .kind = SIM_PART_CANOPY, .parent = 0, .mat = SIM_MAT_CF_PLATE, .motor = -1, .wheel = -1, .bay = { 1.0, 0.0, 0.0 },
    .mass = 0.45, .joint = { 1.206, 0.0, 0.0196 }, .m_max = 20.0, .f_max = 400.0, .k = 2.0e4,
    BOX(1.206, 1.546, -0.17, 0.17, -0.1504, 0.1896) },
  { .kind = SIM_PART_CAMERA, .parent = 10, .mat = SIM_MAT_ELECTRONICS, .motor = -1, .wheel = -1,
    .mass = 0.05, .joint = { 1.496, 0.0, 0.0196 }, .m_max = FPV_CAM_M, .f_max = FPV_CAM_F, .k = 3.0e4,
    BOX(1.466, 1.526, -0.02, 0.02, -0.0004, 0.0396) },
};

static const PartDef PARTS_STRIKER_JET[] = {
  /* 0 the fuselage tube from the nose to the tail cone, the tank, the
   * spar box, the skid and the rest: the residual. */
  { .kind = SIM_PART_FUSELAGE, .parent = -1, .mat = SIM_MAT_CF_PLATE, .motor = -1, .wheel = -1,
    .k = 2.0e6, BOX(-0.874, 1.546, -0.17, 0.17, -0.1601, 0.1799) },
  /* 1, 2 the panels on their carbon spar, from the fuselage's side to the
   * fin, 64 mm deep at the root and 26 at the tip. 600 N m, chosen: a 6 g
   * pull loads a panel's root to about 180. */
  { .kind = SIM_PART_WING, .parent = 0, .mat = SIM_MAT_CF_PLATE, .motor = -1, .wheel = -1,
    .mass = 1.10, .joint = { -0.054, 0.17, -0.0601 }, SHELL_SECTION(0.032), .m_max = 600.0, .m_max_z = SHELL_IN(600.0, 1.54, 0.064), .f_max = 5000.0, .k = 1.0e4,
    .npts = 8, .pts = { { 0.706, 0.17, -0.0921 }, { -0.834, 0.17, -0.0921 }, { -0.594, 1.235, -0.0731 }, { -0.834, 1.235, -0.0731 },
                        { 0.706, 0.17, -0.0281 }, { -0.834, 0.17, -0.0281 }, { -0.594, 1.235, -0.0471 }, { -0.834, 1.235, -0.0471 } } },
  { .kind = SIM_PART_WING, .parent = 0, .mat = SIM_MAT_CF_PLATE, .motor = -1, .wheel = -1,
    .mass = 1.10, .joint = { -0.054, -0.17, -0.0601 }, SHELL_SECTION(0.032), .m_max = 600.0, .m_max_z = SHELL_IN(600.0, 1.54, 0.064), .f_max = 5000.0, .k = 1.0e4,
    .npts = 8, .pts = { { 0.706, -0.17, -0.0921 }, { -0.834, -0.17, -0.0921 }, { -0.594, -1.235, -0.0731 }, { -0.834, -1.235, -0.0731 },
                        { 0.706, -0.17, -0.0281 }, { -0.834, -0.17, -0.0281 }, { -0.594, -1.235, -0.0471 }, { -0.834, -1.235, -0.0471 } } },
  /* 3, 4 the elevons, 0.15 m of chord from 0.32 to 1.12 m out. */
  { .kind = SIM_PART_ELEVON, .parent = 1, .mat = SIM_MAT_CF_PLATE, .motor = -1, .wheel = -1,
    .mass = 0.15, .joint = { -0.684, 0.72, -0.0601 }, .m_max = 5.0, .f_max = 250.0, .k = 5000.0,
    BOX(-0.834, -0.684, 0.32, 1.12, -0.0711, -0.0491) },
  { .kind = SIM_PART_ELEVON, .parent = 2, .mat = SIM_MAT_CF_PLATE, .motor = -1, .wheel = -1,
    .mass = 0.15, .joint = { -0.684, -0.72, -0.0601 }, .m_max = 5.0, .f_max = 250.0, .k = 5000.0,
    BOX(-0.834, -0.684, -1.12, -0.32, -0.0711, -0.0491) },
  /* 5, 6 the fins with their rudders and servos, screwed to the tips. */
  { .kind = SIM_PART_FIN, .parent = 1, .mat = SIM_MAT_CF_PLATE, .motor = -1, .wheel = -1,
    .mass = 0.26, .joint = { -0.754, 1.235, -0.0601 }, .m_max = 15.0, .f_max = 300.0, .k = 3000.0,
    .npts = 8, .pts = { { -0.554, 1.235, -0.1801 }, { -0.874, 1.235, -0.1801 }, { -0.734, 1.235, 0.2399 }, { -0.954, 1.235, 0.2399 },
                        { -0.554, 1.251, -0.1801 }, { -0.874, 1.251, -0.1801 }, { -0.734, 1.251, 0.2399 }, { -0.954, 1.251, 0.2399 } } },
  { .kind = SIM_PART_FIN, .parent = 2, .mat = SIM_MAT_CF_PLATE, .motor = -1, .wheel = -1,
    .mass = 0.26, .joint = { -0.754, -1.235, -0.0601 }, .m_max = 15.0, .f_max = 300.0, .k = 3000.0,
    .npts = 8, .pts = { { -0.554, -1.235, -0.1801 }, { -0.874, -1.235, -0.1801 }, { -0.734, -1.235, 0.2399 }, { -0.954, -1.235, 0.2399 },
                        { -0.554, -1.251, -0.1801 }, { -0.874, -1.251, -0.1801 }, { -0.734, -1.251, 0.2399 }, { -0.954, -1.251, 0.2399 } } },
  /* 7 the turbojet in its nacelle on two straps over the tail. No prop
   * part: the wheels are inside the case. */
  { .kind = SIM_PART_MOTOR, .parent = 0, .mat = SIM_MAT_ALU, .motor = 0, .wheel = -1,
    .mass = 1.81, .joint = { -0.854, 0.0, 0.0899 }, .m_max = 60.0, .f_max = 1500.0, .k = 1.0e6,
    BOX(-1.214, -0.694, -0.12, 0.12, -0.0101, 0.2299) },
  /* 8 the ignition, receiver and servo packs, strapped in the bay
   * under the avionics; 9 the nose cap over the warhead bay on its
   * latches, which a nose in takes off first; 10 the FPV camera in it. */
  { .kind = SIM_PART_BATTERY, .parent = 0, .mat = SIM_MAT_LIPO, .motor = -1, .wheel = -1, IN_BAY,
    .mass = 0.60, .joint = { 0.946, 0.0, -0.0401 }, .m_max = 10.0, .f_max = 400.0, .k = 3.0e5,
    BOX(0.866, 1.026, -0.06, 0.06, -0.1001, 0.0099) },
  { .kind = SIM_PART_CANOPY, .parent = 0, .mat = SIM_MAT_CF_PLATE, .motor = -1, .wheel = -1, .bay = { 1.0, 0.0, 0.0 },
    .mass = 0.45, .joint = { 1.206, 0.0, 0.0099 }, .m_max = 20.0, .f_max = 400.0, .k = 2.0e4,
    BOX(1.206, 1.546, -0.17, 0.17, -0.1601, 0.1799) },
  { .kind = SIM_PART_CAMERA, .parent = 9, .mat = SIM_MAT_ELECTRONICS, .motor = -1, .wheel = -1,
    .mass = 0.05, .joint = { 1.496, 0.0, 0.0099 }, .m_max = FPV_CAM_M, .f_max = FPV_CAM_F, .k = 3.0e4,
    BOX(1.466, 1.526, -0.02, 0.02, -0.0101, 0.0299) },
};

#endif /* CRASH_PARTS_H */
