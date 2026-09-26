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
/* Whoop 0702 on its moulded mount, two M1.4 screws in PP. */
#define WH_MOTOR_M 0.25
/* A press fit 1 mm shaft prop: a few newtons pull it off, and its PC
 * blades flex rather than snap. Set so the 300 g a wall at a brisk walk
 * gives (R-WHOOP) leaves it on, which is what whoops do. */
#define WH_PROP_F 6.0
#define WH_PROP_M 0.10
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
 * WHOOP, SIM_AIRFRAME_WHOOP65, whoopcraft.js at true scale (the shell draws
 * it 3.43 times larger on the five inch's plant; see the doc). 23.4 g. The
 * ducts are moulded with the frame, so they are the root.
 * --------------------------------------------------------------------- */
#define QW 0.0229809704566899
static const PartDef PARTS_WHOOP65[] = {
  { .kind = SIM_PART_FRAME, .parent = -1, .mat = SIM_MAT_PC, .motor = -1, .wheel = -1,
    .k = 1.0e5, BOX(-0.041, 0.041, -0.041, 0.041, -0.0017, 0.0055) },
  { .kind = SIM_PART_MOTOR, .parent = 0, .mat = SIM_MAT_ALU, .motor = 0, .wheel = -1,
    .mass = 0.0019, .joint = { -QW, -QW, 0.0 }, .m_max = WH_MOTOR_M, .f_max = 30.0, .k = 5.0e5,
    BOX(-QW - 0.004, -QW + 0.004, -QW - 0.004, -QW + 0.004, 0.0, 0.006) },
  { .kind = SIM_PART_MOTOR, .parent = 0, .mat = SIM_MAT_ALU, .motor = 1, .wheel = -1,
    .mass = 0.0019, .joint = { QW, -QW, 0.0 }, .m_max = WH_MOTOR_M, .f_max = 30.0, .k = 5.0e5,
    BOX(QW - 0.004, QW + 0.004, -QW - 0.004, -QW + 0.004, 0.0, 0.006) },
  { .kind = SIM_PART_MOTOR, .parent = 0, .mat = SIM_MAT_ALU, .motor = 2, .wheel = -1,
    .mass = 0.0019, .joint = { -QW, QW, 0.0 }, .m_max = WH_MOTOR_M, .f_max = 30.0, .k = 5.0e5,
    BOX(-QW - 0.004, -QW + 0.004, QW - 0.004, QW + 0.004, 0.0, 0.006) },
  { .kind = SIM_PART_MOTOR, .parent = 0, .mat = SIM_MAT_ALU, .motor = 3, .wheel = -1,
    .mass = 0.0019, .joint = { QW, QW, 0.0 }, .m_max = WH_MOTOR_M, .f_max = 30.0, .k = 5.0e5,
    BOX(QW - 0.004, QW + 0.004, QW - 0.004, QW + 0.004, 0.0, 0.006) },
  /* 5..8 31 mm PC tri blades on 1 mm shafts, inside the ducts. */
  { .kind = SIM_PART_PROP, .parent = 1, .mat = SIM_MAT_PC, .motor = 0, .wheel = -1, .shape = SH_DISCZ, .blades = 3,
    .mass = 0.0005, .joint = { -QW, -QW, 0.0035 }, .m_max = WH_PROP_M, .f_max = WH_PROP_F, .k = 800.0,
    .npts = 8, .pts = { { -QW, -QW, 0.0035 }, { 0.0155, 0.0, 0.0 } } },
  { .kind = SIM_PART_PROP, .parent = 2, .mat = SIM_MAT_PC, .motor = 1, .wheel = -1, .shape = SH_DISCZ, .blades = 3,
    .mass = 0.0005, .joint = { QW, -QW, 0.0035 }, .m_max = WH_PROP_M, .f_max = WH_PROP_F, .k = 800.0,
    .npts = 8, .pts = { { QW, -QW, 0.0035 }, { 0.0155, 0.0, 0.0 } } },
  { .kind = SIM_PART_PROP, .parent = 3, .mat = SIM_MAT_PC, .motor = 2, .wheel = -1, .shape = SH_DISCZ, .blades = 3,
    .mass = 0.0005, .joint = { -QW, QW, 0.0035 }, .m_max = WH_PROP_M, .f_max = WH_PROP_F, .k = 800.0,
    .npts = 8, .pts = { { -QW, QW, 0.0035 }, { 0.0155, 0.0, 0.0 } } },
  { .kind = SIM_PART_PROP, .parent = 4, .mat = SIM_MAT_PC, .motor = 3, .wheel = -1, .shape = SH_DISCZ, .blades = 3,
    .mass = 0.0005, .joint = { QW, QW, 0.0035 }, .m_max = WH_PROP_M, .f_max = WH_PROP_F, .k = 800.0,
    .npts = 8, .pts = { { QW, QW, 0.0035 }, { 0.0155, 0.0, 0.0 } } },
  /* 9 the 1S 300 mAh in its holder, which slides at a few newtons and is
   * free once it has slid its own drawn 33 mm length out of the holder. */
  { .kind = SIM_PART_BATTERY, .parent = 0, .mat = SIM_MAT_LIPO, .motor = -1, .wheel = -1,
    .mass = 0.0068, .joint = { 0.0, 0.0, -0.0036 }, .m_max = 0.10, .f_max = 5.0, .k = 5.0e5,
    .slip_d = 0.033,
    BOX(-0.0195, 0.0135, -0.0079, 0.0079, -0.010, -0.0036) },
  /* 10 canopy, two M1.4 screws in PP 10 mm apart, 20 N each. */
  { .kind = SIM_PART_CANOPY, .parent = 0, .mat = SIM_MAT_PC, .motor = -1, .wheel = -1,
    .mass = 0.0015, .joint = { 0.0, 0.0, 0.006 }, .m_max = 0.30, .f_max = 20.0, .k = 5.0e4,
    BOX(-0.012, 0.030, -0.012, 0.012, 0.0055, 0.018) },
  /* 11 nano camera in the canopy. */
  { .kind = SIM_PART_CAMERA, .parent = 10, .mat = SIM_MAT_ELECTRONICS, .motor = -1, .wheel = -1,
    .mass = 0.0015, .joint = { 0.020, 0.0, 0.012 }, .m_max = 0.02, .f_max = 8.0, .k = 1.0e4,
    BOX(0.017, 0.026, -0.0045, 0.0045, 0.007, 0.016) },
  /* 12 the whip antenna. */
  { .kind = SIM_PART_ANTENNA, .parent = 0, .mat = SIM_MAT_WIRE, .motor = -1, .wheel = -1,
    .mass = 0.0003, .joint = { -0.009, 0.0018, 0.006 }, .m_max = 0.02, .f_max = 3.0, .k = 200.0,
    .npts = 2, .pts = { { -0.009, 0.0018, 0.006 }, { -0.009, 0.0018, 0.0285 } } },
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
 * SKYHUNTER 1800, SIM_AIRFRAME_SKY1800, skycraft.js. 2.10 kg, EPO, two
 * carbon booms, a pusher. The drawn prop is at x -0.268 and the camera at
 * (0.365, -0.005); the plant has -0.12 and (0.42, 0.02). Parts are drawn.
 * --------------------------------------------------------------------- */
static const PartDef PARTS_SKY1800[] = {
  /* 0 the pod. */
  { .kind = SIM_PART_FUSELAGE, .parent = -1, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .k = 3.0e5, .crush_s = EPO_CRUSH, .crush_a = 0.0110, .crush_d = 0.12,
    BOX(-0.235, 0.385, -0.068, 0.068, -0.1195, 0.060) },
  /* 1, 2 the panels on two spars, 60 N m at the root. */
  { .kind = SIM_PART_WING, .parent = 0, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.225, .joint = { -0.04, 0.068, 0.045 }, CARBON_SPAR(0.004), .m_max = 60.0, .m_max_z = SLAB_M(EPO_TENSILE, 0.2447, 0.030), .f_max = 600.0, .k = 3000.0,
    .crush_s = EPO_CRUSH, .crush_a = 0.0015, .crush_d = 0.12,
    .npts = 8, .pts = { { 0.0817, 0.068, 0.030 }, { -0.163, 0.068, 0.030 }, { 0.0817, 0.90, 0.070 }, { -0.088, 0.90, 0.070 },
                        { 0.0817, 0.068, 0.060 }, { -0.163, 0.068, 0.060 }, { 0.0817, 0.90, 0.098 }, { -0.088, 0.90, 0.098 } } },
  { .kind = SIM_PART_WING, .parent = 0, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.225, .joint = { -0.04, -0.068, 0.045 }, CARBON_SPAR(0.004), .m_max = 60.0, .m_max_z = SLAB_M(EPO_TENSILE, 0.2447, 0.030), .f_max = 600.0, .k = 3000.0,
    .crush_s = EPO_CRUSH, .crush_a = 0.0015, .crush_d = 0.12,
    .npts = 8, .pts = { { 0.0817, -0.068, 0.030 }, { -0.163, -0.068, 0.030 }, { 0.0817, -0.90, 0.070 }, { -0.088, -0.90, 0.070 },
                        { 0.0817, -0.068, 0.060 }, { -0.163, -0.068, 0.060 }, { 0.0817, -0.90, 0.098 }, { -0.088, -0.90, 0.098 } } },
  /* 3, 4 ailerons. */
  { .kind = SIM_PART_AILERON, .parent = 1, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.020, .joint = { -0.12, 0.61, 0.06 }, .m_max = PL_SURF_M, .f_max = PL_SURF_F, .k = 2000.0,
    BOX(-0.16, -0.10, 0.40, 0.82, 0.050, 0.075) },
  { .kind = SIM_PART_AILERON, .parent = 2, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.020, .joint = { -0.12, -0.61, 0.06 }, .m_max = PL_SURF_M, .f_max = PL_SURF_F, .k = 2000.0,
    BOX(-0.16, -0.10, -0.82, -0.40, 0.050, 0.075) },
  /* 5 the booms, two 12 mm carbon tubes, as one part: 2 x 1000 MPa x
   * pi (d^4 - di^4) / (32 d) for 12/10 mm, less the clamp. */
  { .kind = SIM_PART_BOOM, .parent = 0, .mat = SIM_MAT_CF_TUBE, .motor = -1, .wheel = -1,
    .mass = 0.060, .joint = { -0.03, 0.0, 0.051 }, CARBON_SPAR(0.006), .m_max = 180.0, .f_max = 1500.0, .k = 5.0e4,
    BOX(-0.80, -0.02, -0.238, 0.238, 0.045, 0.057) },
  /* 6 the stabiliser across the booms, 7 the elevator. */
  { .kind = SIM_PART_HSTAB, .parent = 5, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.040, .joint = { -0.75, 0.0, 0.051 }, .m_max = 4.0, .f_max = 150.0, .k = 3000.0,
    BOX(-0.785, -0.705, -0.228, 0.228, 0.045, 0.057) },
  { .kind = SIM_PART_ELEVATOR, .parent = 6, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.015, .joint = { -0.785, 0.0, 0.051 }, .m_max = PL_SURF_M, .f_max = PL_SURF_F, .k = 2000.0,
    BOX(-0.835, -0.785, -0.228, 0.228, 0.046, 0.056) },
  /* 8, 9 the fins on the booms' ends, 10, 11 their rudders. */
  { .kind = SIM_PART_FIN, .parent = 5, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.015, .joint = { -0.74, 0.232, 0.05 }, .m_max = 2.0, .f_max = 100.0, .k = 3000.0,
    BOX(-0.790, -0.690, 0.228, 0.236, 0.029, 0.219) },
  { .kind = SIM_PART_FIN, .parent = 5, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.015, .joint = { -0.74, -0.232, 0.05 }, .m_max = 2.0, .f_max = 100.0, .k = 3000.0,
    BOX(-0.790, -0.690, -0.236, -0.228, 0.029, 0.219) },
  { .kind = SIM_PART_RUDDER, .parent = 8, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.006, .joint = { -0.79, 0.232, 0.12 }, .m_max = PL_SURF_M, .f_max = PL_SURF_F, .k = 2000.0,
    BOX(-0.840, -0.790, 0.228, 0.236, 0.035, 0.210) },
  { .kind = SIM_PART_RUDDER, .parent = 9, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.006, .joint = { -0.79, -0.232, 0.12 }, .m_max = PL_SURF_M, .f_max = PL_SURF_F, .k = 2000.0,
    BOX(-0.840, -0.790, -0.236, -0.228, 0.035, 0.210) },
  /* 12 the motor on its pylon at the pod's tail, 13 the 11x5.5 pusher. */
  { .kind = SIM_PART_MOTOR, .parent = 0, .mat = SIM_MAT_ALU, .motor = 0, .wheel = -1,
    .mass = 0.110, .joint = { -0.235, 0.0, 0.032 }, .m_max = PL_MOTOR_M, .f_max = 500.0, .k = 1.0e6,
    BOX(-0.260, -0.235, -0.018, 0.018, 0.014, 0.050) },
  { .kind = SIM_PART_PROP, .parent = 12, .mat = SIM_MAT_NYLON_GF, .motor = 0, .wheel = -1, .shape = SH_DISCX,
    .mass = 0.020, .joint = { -0.262, 0.0, 0.032 }, .m_max = PL_PROP_M, .f_max = 300.0, .k = PL_PROP_K,
    .npts = 8, .pts = { { -0.268, 0.0, 0.032 }, { 0.1397, 0.0, 0.0 } } },
  /* 14 a 4S 5000 in the bay on hook and loop, 15 the hatch on magnets. */
  { .kind = SIM_PART_BATTERY, .parent = 0, .mat = SIM_MAT_LIPO, .motor = -1, .wheel = -1, IN_BAY,
    .mass = 0.50, .joint = { 0.10, 0.0, -0.09 }, .m_max = 8.0, .f_max = 1.5 * VELCRO_12, .k = 3.0e5,
    BOX(0.02, 0.18, -0.025, 0.025, -0.09, -0.04) },
  { .kind = SIM_PART_CANOPY, .parent = 0, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1, IN_BAY,
    .mass = 0.030, .joint = { 0.21, 0.0, 0.043 }, .m_max = 1.0, .f_max = MAGNET_2, .k = 2.0e4,
    BOX(0.092, 0.325, -0.05, 0.05, 0.030, 0.060) },
  { .kind = SIM_PART_CAMERA, .parent = 0, .mat = SIM_MAT_ELECTRONICS, .motor = -1, .wheel = -1,
    .mass = 0.015, .joint = { 0.35, -0.005, -0.005 }, .m_max = FPV_CAM_M, .f_max = FPV_CAM_F, .k = 3.0e4,
    BOX(0.345, 0.385, -0.017, 0.007, -0.017, 0.007) },
  { .kind = SIM_PART_ANTENNA, .parent = 0, .mat = SIM_MAT_WIRE, .motor = -1, .wheel = -1,
    .mass = 0.005, .joint = { -0.150, -0.020, 0.055 }, .m_max = FPV_ANT_M, .f_max = FPV_ANT_F, .k = 1.0e3,
    .npts = 2, .pts = { { -0.150, -0.020, 0.055 }, { -0.150, -0.020, 0.145 } } },
};

/* ------------------------------------------------------------------------
 * PIPER CUB 1400, SIM_AIRFRAME_CUB1400, cubcraft.js. 1.32 kg, EPO, a strut
 * braced two piece wing on an 8/6 mm carbon joiner. Wheels: 0 left main,
 * 1 right main, 2 tailwheel, 3 the prop tip's skid.
 * --------------------------------------------------------------------- */
static const PartDef PARTS_CUB1400[] = {
  /* 0 the fuselage forward of the tail, and the cowl that crushes. */
  { .kind = SIM_PART_FUSELAGE, .parent = -1, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .k = 3.0e5, .crush_s = EPO_CRUSH, .crush_a = 0.0068, .crush_d = 0.10,
    BOX(-0.35, 0.220, -0.0475, 0.0475, -0.056, 0.098) },
  /* 1 the aft fuselage, a hollow EPO box 60 x 70 x 6 mm: Z 2.67e-5 at
   * 0.6 MPa. */
  { .kind = SIM_PART_BOOM, .parent = 0, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.040, .joint = { -0.35, 0.0, 0.020 }, FOAM_SECTION(0.035), .m_max = 16.0, .f_max = 300.0, .k = 2.0e4,
    BOX(-0.604, -0.35, -0.030, 0.030, -0.030, 0.070) },
  { .kind = SIM_PART_HSTAB, .parent = 1, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.020, .joint = { -0.54, 0.0, 0.043 }, .m_max = 3.0, .f_max = 120.0, .k = 3000.0,
    BOX(-0.542, -0.482, -0.189, 0.189, 0.037, 0.049) },
  { .kind = SIM_PART_ELEVATOR, .parent = 2, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.008, .joint = { -0.542, 0.0, 0.043 }, .m_max = PL_SURF_M, .f_max = PL_SURF_F, .k = 2000.0,
    BOX(-0.604, -0.542, -0.189, 0.189, 0.038, 0.048) },
  { .kind = SIM_PART_FIN, .parent = 1, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.012, .joint = { -0.56, 0.0, 0.040 }, .m_max = 2.0, .f_max = 100.0, .k = 3000.0,
    BOX(-0.578, -0.52, -0.004, 0.004, 0.040, 0.160) },
  { .kind = SIM_PART_RUDDER, .parent = 4, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.006, .joint = { -0.578, 0.0, 0.09 }, .m_max = PL_SURF_M, .f_max = PL_SURF_F, .k = 2000.0,
    BOX(-0.640, -0.578, -0.004, 0.004, 0.006, 0.160) },
  /* 6, 7 the panels, strut braced, 40 N m at the root. */
  { .kind = SIM_PART_WING, .parent = 0, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.150, .joint = { -0.02, 0.048, 0.099 }, CARBON_SPAR(0.004), .m_max = 40.0, .m_max_z = SLAB_M(EPO_TENSILE, 0.2085, 0.036), .f_max = 500.0, .k = 3000.0,
    .crush_s = EPO_CRUSH, .crush_a = 0.00115, .crush_d = 0.10,
    BOX(-0.1485, 0.060, 0.048, 0.70, 0.087, 0.123) },
  { .kind = SIM_PART_WING, .parent = 0, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.150, .joint = { -0.02, -0.048, 0.099 }, CARBON_SPAR(0.004), .m_max = 40.0, .m_max_z = SLAB_M(EPO_TENSILE, 0.2085, 0.036), .f_max = 500.0, .k = 3000.0,
    .crush_s = EPO_CRUSH, .crush_a = 0.00115, .crush_d = 0.10,
    BOX(-0.1485, 0.060, -0.70, -0.048, 0.087, 0.123) },
  { .kind = SIM_PART_AILERON, .parent = 6, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.010, .joint = { -0.09, 0.50, 0.10 }, .m_max = PL_SURF_M, .f_max = PL_SURF_F, .k = 2000.0,
    BOX(-0.1485, -0.090, 0.36, 0.645, 0.093, 0.110) },
  { .kind = SIM_PART_AILERON, .parent = 7, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.010, .joint = { -0.09, -0.50, 0.10 }, .m_max = PL_SURF_M, .f_max = PL_SURF_F, .k = 2000.0,
    BOX(-0.1485, -0.090, -0.645, -0.36, 0.093, 0.110) },
  /* 10 the motor on its firewall, 11 the 11x7 and spinner. */
  { .kind = SIM_PART_MOTOR, .parent = 0, .mat = SIM_MAT_ALU, .motor = 0, .wheel = -1,
    .mass = 0.100, .joint = { 0.200, 0.0, 0.002 }, .m_max = PL_MOTOR_M, .f_max = 400.0, .k = 1.0e6,
    NOSE_CRUSH(0.0068, 0.10), BOX(0.200, 0.226, -0.018, 0.018, -0.016, 0.020) },
  { .kind = SIM_PART_PROP, .parent = 10, .mat = SIM_MAT_NYLON_GF, .motor = 0, .wheel = 3, .shape = SH_DISCX,
    .mass = 0.020, .joint = { 0.226, 0.0, 0.002 }, .m_max = PL_PROP_M, .f_max = 300.0, .k = PL_PROP_K,
    .npts = 8, .pts = { { 0.230, 0.0, 0.002 }, { 0.1397, 0.0, 0.0 } } },
  /* 12 the 3S 2200 at 0.12 ahead on hook and loop, 13 the cabin hatch. */
  { .kind = SIM_PART_BATTERY, .parent = 0, .mat = SIM_MAT_LIPO, .motor = -1, .wheel = -1, IN_BAY,
    .mass = 0.190, .joint = { 0.12, 0.0, -0.054 }, .m_max = 4.0, .f_max = VELCRO_12, .k = 3.0e5,
    BOX(0.070, 0.175, -0.017, 0.017, -0.054, -0.020) },
  { .kind = SIM_PART_CANOPY, .parent = 0, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1, IN_BAY,
    .mass = 0.020, .joint = { -0.02, 0.0, 0.090 }, .m_max = 0.5, .f_max = MAGNET_2, .k = 2.0e4,
    BOX(-0.10, 0.06, -0.045, 0.045, 0.080, 0.100) },
  /* 14, 15 the mains on 3.2 mm wire, 16 the tailwheel on 1.5 mm. */
  { .kind = SIM_PART_GEAR, .parent = 0, .mat = SIM_MAT_WIRE, .motor = -1, .wheel = 0,
    .mass = 0.030, .joint = { 0.09, 0.03, -0.05 }, .m_max = WIRE_M(0.0032), .f_max = 600.0, .k = 1200.0,
    BOX(0.060, 0.090, 0.03, 0.130, -0.1677, -0.05) },
  { .kind = SIM_PART_GEAR, .parent = 0, .mat = SIM_MAT_WIRE, .motor = -1, .wheel = 1,
    .mass = 0.030, .joint = { 0.09, -0.03, -0.05 }, .m_max = WIRE_M(0.0032), .f_max = 600.0, .k = 1200.0,
    BOX(0.060, 0.090, -0.130, -0.03, -0.1677, -0.05) },
  { .kind = SIM_PART_GEAR, .parent = 1, .mat = SIM_MAT_WIRE, .motor = -1, .wheel = 2,
    .mass = 0.006, .joint = { -0.586, 0.0, -0.021 }, .m_max = WIRE_M(0.0015), .f_max = 100.0, .k = 300.0,
    BOX(-0.608, -0.584, -0.004, 0.004, -0.039, -0.021) },
  { .kind = SIM_PART_CAMERA, .parent = 0, .mat = SIM_MAT_ELECTRONICS, .motor = -1, .wheel = -1,
    .mass = 0.012, .joint = { 0.155, 0.0, 0.057 }, .m_max = FPV_CAM_M, .f_max = FPV_CAM_F, .k = 3.0e4,
    BOX(0.150, 0.177, -0.010, 0.010, 0.047, 0.067) },
  /* Not drawn: where an FPV Cub carries its whip, behind the cabin. */
  { .kind = SIM_PART_ANTENNA, .parent = 0, .mat = SIM_MAT_WIRE, .motor = -1, .wheel = -1,
    .mass = 0.004, .joint = { -0.16, 0.0, 0.07 }, .m_max = FPV_ANT_M, .f_max = FPV_ANT_F, .k = 1.0e3,
    .npts = 2, .pts = { { -0.16, 0.0, 0.07 }, { -0.16, 0.0, 0.14 } } },
};

/* ------------------------------------------------------------------------
 * RADIAN PRO 2000, SIM_AIRFRAME_RADIAN2000, glidercraft.js. 0.98 kg, EPO,
 * a carbon tube joining the panels, a folding prop.
 * --------------------------------------------------------------------- */
static const PartDef PARTS_RADIAN2000[] = {
  { .kind = SIM_PART_FUSELAGE, .parent = -1, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .k = 3.0e5, .crush_s = EPO_CRUSH, .crush_a = 0.0040, .crush_d = 0.08,
    BOX(-0.30, 0.2945, -0.042, 0.042, -0.052, 0.070) },
  /* 1 the tail boom, the fuselage aft of the wing, thin foam round a tube.
   * Bounded below by flight, as the Bramor's winglets are: the tail at a
   * lift coefficient of 1.0 at 22 m/s and 3.8 g on what it carries put 7.5
   * N m through it, 11.3 at the ultimate factor of 1.5, so it holds at
   * least 12 (crash:core, THE LOADS OF NORMAL FLIGHT; it was a chosen 10). */
  { .kind = SIM_PART_BOOM, .parent = 0, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.030, .joint = { -0.30, 0.0, 0.035 }, FOAM_SECTION(0.020), .m_max = 12.0, .f_max = 250.0, .k = 1.5e4,
    BOX(-0.7795, -0.30, -0.020, 0.020, 0.010, 0.050) },
  { .kind = SIM_PART_HSTAB, .parent = 1, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.015, .joint = { -0.70, 0.0, 0.075 }, .m_max = 2.0, .f_max = 80.0, .k = 3000.0,
    BOX(-0.7395, -0.6515, -0.2385, 0.2385, 0.070, 0.080) },
  { .kind = SIM_PART_ELEVATOR, .parent = 2, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.005, .joint = { -0.7395, 0.0, 0.075 }, .m_max = PL_SURF_M, .f_max = PL_SURF_F, .k = 2000.0,
    BOX(-0.7685, -0.7395, -0.2385, 0.2385, 0.071, 0.079) },
  /* The fin, bounded below the same way: its 0.038 m^2 (GLIDER-STAGE1) at
   * 1.0 and 22 m/s is 1.5 N m at its root, 2.26 at 1.5; it was a chosen 2. */
  { .kind = SIM_PART_FIN, .parent = 1, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.012, .joint = { -0.62, 0.0, 0.045 }, .m_max = 2.4, .f_max = 80.0, .k = 3000.0,
    BOX(-0.78, -0.55, -0.004, 0.004, 0.045, 0.268) },
  { .kind = SIM_PART_RUDDER, .parent = 4, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.004, .joint = { -0.79, 0.0, 0.15 }, .m_max = PL_SURF_M, .f_max = PL_SURF_F, .k = 2000.0,
    BOX(-0.8315, -0.785, -0.004, 0.004, 0.095, 0.200) },
  /* 6, 7 the panels, polyhedral to 0.14 at the tips, 45 N m at the joiner. */
  { .kind = SIM_PART_WING, .parent = 0, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.135, .joint = { -0.03, 0.042, 0.030 }, CARBON_SPAR(0.0045), .m_max = 45.0, .m_max_z = SLAB_M(EPO_TENSILE, 0.200, 0.018), .f_max = 400.0, .k = 2500.0,
    .crush_s = EPO_CRUSH, .crush_a = 0.0009, .crush_d = 0.10,
    .npts = 8, .pts = { { 0.063, 0.042, 0.021 }, { -0.137, 0.042, 0.021 }, { 0.063, 0.60, 0.050 }, { -0.137, 0.60, 0.050 },
                        { 0.063, 0.042, 0.039 }, { -0.137, 0.042, 0.039 }, { -0.030, 1.00, 0.130 }, { -0.080, 1.00, 0.140 } } },
  { .kind = SIM_PART_WING, .parent = 0, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.135, .joint = { -0.03, -0.042, 0.030 }, CARBON_SPAR(0.0045), .m_max = 45.0, .m_max_z = SLAB_M(EPO_TENSILE, 0.200, 0.018), .f_max = 400.0, .k = 2500.0,
    .crush_s = EPO_CRUSH, .crush_a = 0.0009, .crush_d = 0.10,
    .npts = 8, .pts = { { 0.063, -0.042, 0.021 }, { -0.137, -0.042, 0.021 }, { 0.063, -0.60, 0.050 }, { -0.137, -0.60, 0.050 },
                        { 0.063, -0.042, 0.039 }, { -0.137, -0.042, 0.039 }, { -0.030, -1.00, 0.130 }, { -0.080, -1.00, 0.140 } } },
  { .kind = SIM_PART_AILERON, .parent = 6, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.008, .joint = { -0.10, 0.75, 0.08 }, .m_max = PL_SURF_M, .f_max = PL_SURF_F, .k = 2000.0,
    BOX(-0.137, -0.087, 0.55, 0.95, 0.060, 0.110) },
  { .kind = SIM_PART_AILERON, .parent = 7, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.008, .joint = { -0.10, -0.75, 0.08 }, .m_max = PL_SURF_M, .f_max = PL_SURF_F, .k = 2000.0,
    BOX(-0.137, -0.087, -0.95, -0.55, 0.060, 0.110) },
  { .kind = SIM_PART_MOTOR, .parent = 0, .mat = SIM_MAT_ALU, .motor = 0, .wheel = -1,
    .mass = 0.070, .joint = { 0.26, 0.0, -0.008 }, .m_max = PL_MOTOR_M, .f_max = 400.0, .k = 1.0e6,
    NOSE_CRUSH(0.0040, 0.08), BOX(0.255, 0.285, -0.015, 0.015, -0.023, 0.007) },
  /* 11 the folding 9.75x7.5: its blades fold back and survive more. */
  { .kind = SIM_PART_PROP, .parent = 10, .mat = SIM_MAT_NYLON_GF, .motor = 0, .wheel = -1, .shape = SH_DISCX,
    .mass = 0.020, .joint = { 0.285, 0.0, -0.008 }, .m_max = 2.0 * PL_PROP_M, .f_max = 300.0, .k = PL_PROP_K,
    .npts = 8, .pts = { { 0.293, 0.0, -0.008 }, { 0.1238, 0.0, 0.0 } } },
  { .kind = SIM_PART_BATTERY, .parent = 0, .mat = SIM_MAT_LIPO, .motor = -1, .wheel = -1, IN_BAY,
    .mass = 0.110, .joint = { 0.12, 0.0, -0.035 }, .m_max = 3.0, .f_max = VELCRO_12, .k = 3.0e5,
    BOX(0.08, 0.17, -0.015, 0.015, -0.035, -0.005) },
  { .kind = SIM_PART_CANOPY, .parent = 0, .mat = SIM_MAT_PC, .motor = -1, .wheel = -1, IN_BAY,
    .mass = 0.015, .joint = { 0.17, 0.0, 0.05 }, .m_max = 0.5, .f_max = MAGNET_2, .k = 2.0e4,
    BOX(0.067, 0.2725, -0.040, 0.040, 0.030, 0.071) },
  { .kind = SIM_PART_CAMERA, .parent = 0, .mat = SIM_MAT_ELECTRONICS, .motor = -1, .wheel = -1,
    .mass = 0.010, .joint = { 0.22, 0.0, 0.035 }, .m_max = FPV_CAM_M, .f_max = FPV_CAM_F, .k = 3.0e4,
    BOX(0.215, 0.240, -0.010, 0.010, 0.025, 0.045) },
  { .kind = SIM_PART_ANTENNA, .parent = 0, .mat = SIM_MAT_WIRE, .motor = -1, .wheel = -1,
    .mass = 0.004, .joint = { -0.05, 0.0, 0.06 }, .m_max = FPV_ANT_M, .f_max = FPV_ANT_F, .k = 1.0e3,
    .npts = 2, .pts = { { -0.05, 0.0, 0.06 }, { -0.05, 0.0, 0.13 } } },
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
 * SLOW STICK, SIM_AIRFRAME_SLOWSTICK1180, slowstickcraft.js. 0.42 kg: a 10
 * mm square aluminium stick, a one piece foam wing on a saddle, sheet foam
 * tail, wire gear. Wheels as the Cub's.
 * --------------------------------------------------------------------- */
static const PartDef PARTS_SLOWSTICK1180[] = {
  /* 0 the stick forward of the tail, with the gearbox's mount. 10 mm
   * square 6061 tube, 0.8 mm wall: Z 8.37e-8 at 276 MPa is 23 N m. */
  { .kind = SIM_PART_FUSELAGE, .parent = -1, .mat = SIM_MAT_ALU, .motor = -1, .wheel = -1,
    .k = 5.0e4, BOX(-0.25, 0.286, -0.005, 0.005, -0.0075, 0.0025) },
  { .kind = SIM_PART_BOOM, .parent = 0, .mat = SIM_MAT_ALU, .motor = -1, .wheel = -1,
    .mass = 0.012, .joint = { -0.25, 0.0, -0.0025 }, .m_max = 23.0, .f_max = 800.0, .k = 2.0e4,
    BOX(-0.610, -0.25, -0.005, 0.005, -0.0075, 0.0025) },
  { .kind = SIM_PART_HSTAB, .parent = 1, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.009, .joint = { -0.50, 0.0, 0.005 }, .m_max = 1.0, .f_max = 40.0, .k = 1500.0,
    BOX(-0.537, -0.46, -0.20, 0.20, 0.0025, 0.0075) },
  { .kind = SIM_PART_ELEVATOR, .parent = 2, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.004, .joint = { -0.537, 0.0, 0.005 }, .m_max = 0.5, .f_max = 20.0, .k = 1500.0,
    BOX(-0.60, -0.537, -0.22, 0.22, 0.0025, 0.0075) },
  { .kind = SIM_PART_FIN, .parent = 1, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.004, .joint = { -0.50, 0.0, 0.0075 }, .m_max = 0.8, .f_max = 30.0, .k = 1500.0,
    BOX(-0.54, -0.452, -0.0025, 0.0025, 0.0075, 0.1975) },
  { .kind = SIM_PART_RUDDER, .parent = 4, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.003, .joint = { -0.54, 0.0, 0.10 }, .m_max = 0.5, .f_max = 20.0, .k = 1500.0,
    BOX(-0.632, -0.54, -0.0025, 0.0025, 0.0075, 0.1975) },
  /* 6 the one piece wing on its saddle, which lets go before the foam. */
  { .kind = SIM_PART_WING, .parent = 0, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.100, .joint = { -0.04, 0.0, 0.0275 }, .m_max = 6.0, .f_max = 60.0, .k = 2000.0,
    .crush_s = EPO_CRUSH, .crush_a = 0.0010, .crush_d = 0.10,
    .npts = 8, .pts = { { 0.100, 0.0, 0.0275 }, { -0.2033, 0.0, 0.0435 }, { 0.100, 0.488, 0.130 }, { -0.2033, 0.588, 0.150 },
                        { 0.100, -0.488, 0.130 }, { -0.2033, -0.588, 0.150 }, { 0.100, 0.0, 0.055 }, { -0.2033, 0.0, 0.065 } } },
  { .kind = SIM_PART_MOTOR, .parent = 0, .mat = SIM_MAT_ALU, .motor = 0, .wheel = -1,
    .mass = 0.070, .joint = { 0.286, 0.0, -0.0075 }, .m_max = 4.0, .f_max = 150.0, .k = 5.0e5,
    BOX(0.258, 0.300, -0.012, 0.012, -0.030, 0.005) },
  { .kind = SIM_PART_PROP, .parent = 7, .mat = SIM_MAT_NYLON_GF, .motor = 0, .wheel = 3, .shape = SH_DISCX,
    .mass = 0.012, .joint = { 0.305, 0.0, -0.0025 }, .m_max = 0.6 * PL_PROP_M, .f_max = 150.0, .k = 900.0,
    .npts = 8, .pts = { { 0.310, 0.0, -0.0025 }, { 0.1397, 0.0, 0.0 } } },
  { .kind = SIM_PART_BATTERY, .parent = 0, .mat = SIM_MAT_LIPO, .motor = -1, .wheel = -1,
    .mass = 0.100, .joint = { 0.155, 0.0, -0.0075 }, .m_max = 1.5, .f_max = 0.6 * VELCRO_12, .k = 3.0e5,
    BOX(0.119, 0.191, -0.015, 0.015, -0.0245, -0.0075) },
  /* 10, 11 the mains on 2 mm wire, 12 the tailwheel on 1.2 mm. */
  { .kind = SIM_PART_GEAR, .parent = 0, .mat = SIM_MAT_WIRE, .motor = -1, .wheel = 0,
    .mass = 0.012, .joint = { 0.105, 0.0, -0.0075 }, .m_max = WIRE_M(0.002), .f_max = 150.0, .k = 300.0,
    BOX(0.105, 0.195, 0.0, 0.090, -0.1625, -0.0075) },
  { .kind = SIM_PART_GEAR, .parent = 0, .mat = SIM_MAT_WIRE, .motor = -1, .wheel = 1,
    .mass = 0.012, .joint = { 0.105, 0.0, -0.0075 }, .m_max = WIRE_M(0.002), .f_max = 150.0, .k = 300.0,
    BOX(0.105, 0.195, -0.090, 0.0, -0.1625, -0.0075) },
  { .kind = SIM_PART_GEAR, .parent = 1, .mat = SIM_MAT_WIRE, .motor = -1, .wheel = 2,
    .mass = 0.004, .joint = { -0.568, 0.0, -0.0075 }, .m_max = WIRE_M(0.0012), .f_max = 40.0, .k = 210.0,
    BOX(-0.581, -0.555, -0.004, 0.004, -0.072, -0.0075) },
  { .kind = SIM_PART_CAMERA, .parent = 0, .mat = SIM_MAT_ELECTRONICS, .motor = -1, .wheel = -1,
    .mass = 0.008, .joint = { 0.21, 0.0, 0.0065 }, .m_max = 0.4, .f_max = 30.0, .k = 3.0e4,
    BOX(0.205, 0.232, -0.009, 0.009, 0.0065, 0.0265) },
  { .kind = SIM_PART_ANTENNA, .parent = 0, .mat = SIM_MAT_WIRE, .motor = -1, .wheel = -1,
    .mass = 0.003, .joint = { -0.10, 0.0, 0.0025 }, .m_max = FPV_ANT_M, .f_max = FPV_ANT_F, .k = 1.0e3,
    .npts = 2, .pts = { { -0.10, 0.0, 0.0025 }, { -0.10, 0.0, 0.0725 } } },
};

/* ------------------------------------------------------------------------
 * TURBO TIMBER EVOLUTION 1500, SIM_AIRFRAME_TIMBER1500, timbercraft.js.
 * 1.70 kg, EPO, a two piece wing on a 10/8 mm carbon joiner: Z 5.80e-8 at
 * 1000 MPa, 58 N m. The flaps and slats ride on the panels.
 * --------------------------------------------------------------------- */
static const PartDef PARTS_TIMBER1500[] = {
  { .kind = SIM_PART_FUSELAGE, .parent = -1, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .k = 3.0e5, .crush_s = EPO_CRUSH, .crush_a = 0.0095, .crush_d = 0.10,
    BOX(-0.36, 0.280, -0.057, 0.057, -0.070, 0.074) },
  { .kind = SIM_PART_BOOM, .parent = 0, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.060, .joint = { -0.36, 0.0, 0.0 }, FOAM_SECTION(0.045), .m_max = 22.0, .f_max = 350.0, .k = 2.0e4,
    BOX(-0.650, -0.36, -0.035, 0.035, -0.040, 0.050) },
  { .kind = SIM_PART_HSTAB, .parent = 1, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.030, .joint = { -0.56, 0.0, 0.006 }, .m_max = 4.0, .f_max = 150.0, .k = 3000.0,
    BOX(-0.605, -0.515, -0.28, 0.28, 0.000, 0.012) },
  { .kind = SIM_PART_ELEVATOR, .parent = 2, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.012, .joint = { -0.605, 0.0, 0.006 }, .m_max = PL_SURF_M, .f_max = PL_SURF_F, .k = 2000.0,
    BOX(-0.665, -0.605, -0.28, 0.28, 0.001, 0.011) },
  { .kind = SIM_PART_FIN, .parent = 1, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.015, .joint = { -0.60, 0.0, 0.05 }, .m_max = 3.0, .f_max = 120.0, .k = 3000.0,
    BOX(-0.650, -0.540, -0.005, 0.005, 0.050, 0.195) },
  { .kind = SIM_PART_RUDDER, .parent = 4, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.012, .joint = { -0.650, 0.0, 0.08 }, .m_max = PL_SURF_M, .f_max = PL_SURF_F, .k = 2000.0,
    BOX(-0.715, -0.650, -0.005, 0.005, -0.036, 0.195) },
  { .kind = SIM_PART_WING, .parent = 0, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.200, .joint = { -0.06, 0.057, 0.080 }, CARBON_SPAR(0.005), .m_max = 58.0, .m_max_z = SLAB_M(EPO_TENSILE, 0.240, 0.034), .f_max = 600.0, .k = 3000.0,
    .crush_s = EPO_CRUSH, .crush_a = 0.0017, .crush_d = 0.12,
    .npts = 8, .pts = { { 0.060, 0.057, 0.063 }, { -0.180, 0.057, 0.063 }, { 0.060, 0.7775, 0.023 }, { -0.180, 0.7775, 0.023 },
                        { 0.076, 0.057, 0.097 }, { -0.180, 0.057, 0.097 }, { 0.076, 0.70, 0.097 }, { -0.180, 0.70, 0.097 } } },
  { .kind = SIM_PART_WING, .parent = 0, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.200, .joint = { -0.06, -0.057, 0.080 }, CARBON_SPAR(0.005), .m_max = 58.0, .m_max_z = SLAB_M(EPO_TENSILE, 0.240, 0.034), .f_max = 600.0, .k = 3000.0,
    .crush_s = EPO_CRUSH, .crush_a = 0.0017, .crush_d = 0.12,
    .npts = 8, .pts = { { 0.060, -0.057, 0.063 }, { -0.180, -0.057, 0.063 }, { 0.060, -0.7775, 0.023 }, { -0.180, -0.7775, 0.023 },
                        { 0.076, -0.057, 0.097 }, { -0.180, -0.057, 0.097 }, { 0.076, -0.70, 0.097 }, { -0.180, -0.70, 0.097 } } },
  { .kind = SIM_PART_AILERON, .parent = 6, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.015, .joint = { -0.115, 0.52, 0.08 }, .m_max = PL_SURF_M, .f_max = PL_SURF_F, .k = 2000.0,
    BOX(-0.180, -0.115, 0.340, 0.700, 0.070, 0.090) },
  { .kind = SIM_PART_AILERON, .parent = 7, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.015, .joint = { -0.115, -0.52, 0.08 }, .m_max = PL_SURF_M, .f_max = PL_SURF_F, .k = 2000.0,
    BOX(-0.180, -0.115, -0.700, -0.340, 0.070, 0.090) },
  { .kind = SIM_PART_MOTOR, .parent = 0, .mat = SIM_MAT_ALU, .motor = 0, .wheel = -1,
    .mass = 0.180, .joint = { 0.255, 0.0, 0.0 }, .m_max = PL_MOTOR_M, .f_max = 500.0, .k = 1.0e6,
    NOSE_CRUSH(0.0095, 0.10), BOX(0.255, 0.285, -0.020, 0.020, -0.020, 0.020) },
  { .kind = SIM_PART_PROP, .parent = 10, .mat = SIM_MAT_NYLON_GF, .motor = 0, .wheel = 3, .shape = SH_DISCX,
    .mass = 0.025, .joint = { 0.285, 0.0, 0.0 }, .m_max = PL_PROP_M, .f_max = 300.0, .k = PL_PROP_K,
    .npts = 8, .pts = { { 0.290, 0.0, 0.0 }, { 0.1397, 0.0, 0.0 } } },
  { .kind = SIM_PART_BATTERY, .parent = 0, .mat = SIM_MAT_LIPO, .motor = -1, .wheel = -1, IN_BAY,
    .mass = 0.330, .joint = { 0.15, 0.0, -0.050 }, .m_max = 6.0, .f_max = 1.5 * VELCRO_12, .k = 3.0e5,
    BOX(0.090, 0.210, -0.022, 0.022, -0.050, -0.010) },
  { .kind = SIM_PART_CANOPY, .parent = 0, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1, IN_BAY,
    .mass = 0.030, .joint = { -0.05, 0.0, 0.065 }, .m_max = 0.8, .f_max = MAGNET_2, .k = 2.0e4,
    BOX(-0.18, 0.063, -0.050, 0.050, 0.055, 0.074) },
  /* 14, 15 the mains on 4 mm wire, 16 the tailwheel on 1.5 mm. */
  { .kind = SIM_PART_GEAR, .parent = 0, .mat = SIM_MAT_WIRE, .motor = -1, .wheel = 0,
    .mass = 0.060, .joint = { 0.07, 0.03, -0.07 }, .m_max = WIRE_M(0.004), .f_max = 800.0, .k = 1500.0,
    BOX(0.03, 0.08, 0.03, 0.169, -0.232, -0.07) },
  { .kind = SIM_PART_GEAR, .parent = 0, .mat = SIM_MAT_WIRE, .motor = -1, .wheel = 1,
    .mass = 0.060, .joint = { 0.07, -0.03, -0.07 }, .m_max = WIRE_M(0.004), .f_max = 800.0, .k = 1500.0,
    BOX(0.03, 0.08, -0.169, -0.03, -0.232, -0.07) },
  { .kind = SIM_PART_GEAR, .parent = 1, .mat = SIM_MAT_WIRE, .motor = -1, .wheel = 2,
    .mass = 0.008, .joint = { -0.64, 0.0, -0.04 }, .m_max = WIRE_M(0.0015), .f_max = 100.0, .k = 350.0,
    BOX(-0.665, -0.635, -0.006, 0.006, -0.086, -0.04) },
  { .kind = SIM_PART_CAMERA, .parent = 0, .mat = SIM_MAT_ELECTRONICS, .motor = -1, .wheel = -1,
    .mass = 0.012, .joint = { 0.195, 0.0, 0.049 }, .m_max = FPV_CAM_M, .f_max = FPV_CAM_F, .k = 3.0e4,
    BOX(0.190, 0.217, -0.010, 0.010, 0.039, 0.059) },
  { .kind = SIM_PART_ANTENNA, .parent = 0, .mat = SIM_MAT_WIRE, .motor = -1, .wheel = -1,
    .mass = 0.004, .joint = { -0.20, 0.0, 0.06 }, .m_max = FPV_ANT_M, .f_max = FPV_ANT_F, .k = 1.0e3,
    .npts = 2, .pts = { { -0.20, 0.0, 0.06 }, { -0.20, 0.0, 0.13 } } },
};

/* ------------------------------------------------------------------------
 * BUZZARD BOMBSHELL, SIM_AIRFRAME_BOMBSHELL1118, bombshellcraft.js. 0.56 kg
 * of balsa under doped tissue, docs/BOMBSHELL-STAGE1.md: nothing foam, so
 * nothing crushes. Balsa splits along its grain and a joint that cracks
 * loses its strength (crash.c's default, "cracks"); the one piece wing sits
 * on the cabin under rubber bands, which let it go before its spar breaks
 * as often as not, and each panel then breaks off the centre section on
 * its spar. A Cox .049 on two screws through the firewall, wire gear, a
 * wire skid.
 * --------------------------------------------------------------------- */
/* Balsa, 150 to 175 kg/m^3 (the kit's medium grade). The Wood Handbook
 * (FPL-GTR-190, 2010, Table 5-5a) gives balsa at 12 percent moisture a
 * modulus of rupture of 21.6 MPa (modulus 3.4 GPa) at specific gravity
 * 0.16, about 184 kg/m^3; along the grain it goes as the density (Gibson
 * and Ashby, Cellular Solids, ch. 10), so 17.6 to 20.5 MPa at the kit's
 * grade, and 20 MPa is its upper end. A stick b wide and h deep breaks at
 * 20 MPa b h^2 / 6. */
#define BALSA_MOR 20.0e6
#define BALSA_M(b, h) (BALSA_MOR * (b) * (h) * (h) / 6.0)
static const PartDef PARTS_BOMBSHELL1118[] = {
  /* 0 the fuselage forward of the wing's trailing edge: the cabin, the
   * nose and the firewall, 1/16 in balsa sides and bottom. */
  { .kind = SIM_PART_FUSELAGE, .parent = -1, .mat = SIM_MAT_BALSA, .motor = -1, .wheel = -1,
    .k = 1.5e5, BOX(-0.13, 0.155, -0.027, 0.027, -0.066, 0.064) },
  /* 1 the fuselage aft of the wing, a tapering box of 1/16 in sheet on
   * 1/8 in square longerons, judged at its weakest section, the
   * stabiliser's leading edge, 22 x 33 mm: the longerons, the sides and
   * the bottom make Z 1.8e-6 m^3, 36 N m at balsa's rupture, and half of
   * it for the glue joints and the sheet's cross grain: 18 N m. */
  { .kind = SIM_PART_BOOM, .parent = 0, .mat = SIM_MAT_BALSA, .motor = -1, .wheel = -1,
    .mass = 0.035, .joint = { -0.13, 0.0, 0.0 }, .m_max = 18.0, .f_max = 200.0, .k = 2.0e4,
    .npts = 8, .pts = { { -0.13, 0.026, -0.058 }, { -0.13, -0.026, -0.058 }, { -0.13, 0.026, 0.057 }, { -0.13, -0.026, 0.057 },
                        { -0.652, 0.0045, -0.020 }, { -0.652, -0.0045, -0.020 }, { -0.652, 0.0045, 0.0 }, { -0.652, -0.0045, 0.0 } } },
  /* 2 the stabiliser, a 3/16 x 5/16 in leading edge and 3/16 x 3/8 in
   * trailing edge frame glued on the deck: 1.0 and 1.4 N m, 2.4
   * together. */
  { .kind = SIM_PART_HSTAB, .parent = 1, .mat = SIM_MAT_BALSA, .motor = -1, .wheel = -1,
    .mass = 0.012, .joint = { -0.58, 0.0, 0.001 }, .m_max = BALSA_M(0.0048, 0.0079) + BALSA_M(0.0048, 0.0095),
    .f_max = 50.0, .k = 2000.0, BOX(-0.615, -0.496, -0.206, 0.206, 0.0, 0.004) },
  /* 3 the elevator on tissue and thread hinges, which tear. */
  { .kind = SIM_PART_ELEVATOR, .parent = 2, .mat = SIM_MAT_BALSA, .motor = -1, .wheel = -1,
    .mass = 0.004, .joint = { -0.615, 0.0, 0.002 }, .m_max = 0.4, .f_max = 20.0, .k = 1500.0,
    BOX(-0.652, -0.615, -0.19, 0.19, 0.0, 0.004) },
  /* 4 the fin, a 3/16 x 3/8 in post glued to the deck, 1.4 N m. */
  { .kind = SIM_PART_FIN, .parent = 1, .mat = SIM_MAT_BALSA, .motor = -1, .wheel = -1,
    .mass = 0.006, .joint = { -0.52, 0.0, 0.005 }, .m_max = BALSA_M(0.0048, 0.0095), .f_max = 40.0, .k = 1500.0,
    BOX(-0.563, -0.477, -0.003, 0.003, 0.0, 0.124) },
  /* 5 the rudder, on the same hinges as the elevator. */
  { .kind = SIM_PART_RUDDER, .parent = 4, .mat = SIM_MAT_BALSA, .motor = -1, .wheel = -1,
    .mass = 0.004, .joint = { -0.563, 0.0, 0.06 }, .m_max = 0.4, .f_max = 20.0, .k = 1500.0,
    BOX(-0.652, -0.563, -0.003, 0.003, 0.0, 0.12) },
  /* 6 the wing's centre section, sheeted and glassed, on the cabin under
   * four #32 rubber bands: each about 5 N stretched on its dowels, so 20
   * N hold it down and 20 N over half the chord's 95 mm, 1.9 N m, tip it
   * off its saddle. No band's tension is published; a #32 band, 3 x 1/8 x
   * 1/32 in, looped from dowel to dowel over the drawn 0.19 m chord is
   * stretched about three times, where natural rubber carries about 0.9
   * MPa (Ogden's 1972 fit to Treloar's data), 2.2 N a strand, two strands
   * a band: 4.4 N, 18 N for the four. */
  { .kind = SIM_PART_WING, .parent = 0, .mat = SIM_MAT_BALSA, .motor = -1, .wheel = -1,
    .mass = 0.020, .joint = { -0.03, 0.0, 0.064 }, .m_max = 1.9, .f_max = 20.0, .k = 2000.0,
    BOX(-0.128, 0.063, -0.04, 0.04, 0.062, 0.084) },
  /* 7, 8 the panels on the centre section, the spar 3/16 in square, the
   * leading edge 1/4 in square and the trailing edge 1 x 1/8 in: 0.37,
   * 0.87 and 0.87 N m at balsa's rupture, 2.1 N m together. Fore and aft
   * the trailing edge's plank is on edge, 6.9 N m, 8.1 together: each
   * stick about its own axis, a lower bound, the ribs' frame left out. */
  { .kind = SIM_PART_WING, .parent = 6, .mat = SIM_MAT_BALSA, .motor = -1, .wheel = -1,
    .mass = 0.045, .joint = { -0.03, 0.04, 0.070 },
    .m_max = BALSA_M(0.0048, 0.0048) + BALSA_M(0.0064, 0.0064) + BALSA_M(0.0254, 0.0032),
    .m_max_z = BALSA_M(0.0048, 0.0048) + BALSA_M(0.0064, 0.0064) + BALSA_M(0.0032, 0.0254), .f_max = 80.0, .k = 2000.0,
    .npts = 8, .pts = { { 0.063, 0.04, 0.063 }, { -0.128, 0.04, 0.058 }, { 0.063, 0.379, 0.094 }, { -0.128, 0.379, 0.090 },
                        { 0.063, 0.04, 0.085 }, { -0.128, 0.04, 0.075 }, { 0.030, 0.559, 0.175 }, { -0.090, 0.559, 0.170 } } },
  { .kind = SIM_PART_WING, .parent = 6, .mat = SIM_MAT_BALSA, .motor = -1, .wheel = -1,
    .mass = 0.045, .joint = { -0.03, -0.04, 0.070 },
    .m_max = BALSA_M(0.0048, 0.0048) + BALSA_M(0.0064, 0.0064) + BALSA_M(0.0254, 0.0032),
    .m_max_z = BALSA_M(0.0048, 0.0048) + BALSA_M(0.0064, 0.0064) + BALSA_M(0.0032, 0.0254), .f_max = 80.0, .k = 2000.0,
    .npts = 8, .pts = { { 0.063, -0.04, 0.063 }, { -0.128, -0.04, 0.058 }, { 0.063, -0.379, 0.094 }, { -0.128, -0.379, 0.090 },
                        { 0.063, -0.04, 0.085 }, { -0.128, -0.04, 0.075 }, { 0.030, -0.559, 0.175 }, { -0.090, -0.559, 0.170 } } },
  /* 9 the Cox Texaco .049, 45 g with its tank, on two #2 screws through
   * the 1/8 in ply firewall: the screws pull out of the ply at about 200
   * N each on the 20 mm between them, 4 N m. The Wood Handbook's withdrawal
   * equation (8-10a, p = 108.2 G^2 D L) for a 2.18 mm screw in 3.2 mm of
   * birch, G 0.62, gives 290 N, and says a screw shorter than its table's
   * holds less, so 200 N is under that bound, not measured. */
  { .kind = SIM_PART_MOTOR, .parent = 0, .mat = SIM_MAT_ALU, .motor = 0, .wheel = -1,
    .mass = 0.045, .joint = { 0.107, 0.0, -0.005 }, .m_max = 4.0, .f_max = 200.0, .k = 1.0e6,
    BOX(0.107, 0.160, -0.010, 0.010, -0.015, 0.047) },
  /* 10 Cox's grey 7 x 3.5, unfilled nylon: a 12 x 3 mm root at 150 MPa
   * yields at 2.7 N m, and a tough unfilled prop sheds a blade at twice
   * that. */
  { .kind = SIM_PART_PROP, .parent = 9, .mat = SIM_MAT_NYLON_GF, .motor = 0, .wheel = 3, .shape = SH_DISCX,
    .mass = 0.006, .joint = { 0.162, 0.0, -0.0053 }, .m_max = 2.0 * 2.7, .f_max = 100.0, .k = 700.0,
    .npts = 8, .pts = { { 0.170, 0.0, -0.0053 }, { 0.0889, 0.0, 0.0 } } },
  /* 11 BMJR's 3S 850 for the radio, in the cabin on hook and loop. */
  { .kind = SIM_PART_BATTERY, .parent = 0, .mat = SIM_MAT_LIPO, .motor = -1, .wheel = -1,
    .mass = 0.070, .joint = { 0.10, 0.0, -0.04 }, .m_max = 2.0, .f_max = 0.6 * VELCRO_12, .k = 3.0e5,
    BOX(0.07, 0.13, -0.015, 0.015, -0.055, -0.03) },
  /* 12, 13 the mains on 1/16 in wire, 14 the skid on 1/16 in. */
  { .kind = SIM_PART_GEAR, .parent = 0, .mat = SIM_MAT_WIRE, .motor = -1, .wheel = 0,
    .mass = 0.006, .joint = { 0.03, 0.018, -0.065 }, .m_max = WIRE_M(0.0016), .f_max = 80.0, .k = 473.0,
    BOX(0.03, 0.08, 0.0, 0.098, -0.146, -0.065) },
  { .kind = SIM_PART_GEAR, .parent = 0, .mat = SIM_MAT_WIRE, .motor = -1, .wheel = 1,
    .mass = 0.006, .joint = { 0.03, -0.018, -0.065 }, .m_max = WIRE_M(0.0016), .f_max = 80.0, .k = 473.0,
    BOX(0.03, 0.08, -0.098, 0.0, -0.146, -0.065) },
  { .kind = SIM_PART_GEAR, .parent = 1, .mat = SIM_MAT_WIRE, .motor = -1, .wheel = 2,
    .mass = 0.002, .joint = { -0.567, 0.0, -0.024 }, .m_max = WIRE_M(0.0016), .f_max = 30.0, .k = 153.0,
    BOX(-0.590, -0.565, -0.003, 0.003, -0.046, -0.024) },
  { .kind = SIM_PART_CAMERA, .parent = 0, .mat = SIM_MAT_ELECTRONICS, .motor = -1, .wheel = -1,
    .mass = 0.010, .joint = { 0.11, 0.0, 0.020 }, .m_max = FPV_CAM_M, .f_max = FPV_CAM_F, .k = 3.0e4,
    BOX(0.100, 0.125, -0.0095, 0.0095, 0.021, 0.041) },
  { .kind = SIM_PART_ANTENNA, .parent = 0, .mat = SIM_MAT_WIRE, .motor = -1, .wheel = -1,
    .mass = 0.003, .joint = { -0.193, 0.0, 0.040 }, .m_max = FPV_ANT_M, .f_max = FPV_ANT_F, .k = 1.0e3,
    .npts = 2, .pts = { { -0.193, 0.0, 0.040 }, { -0.19, 0.0, 0.105 } } },
};

/*
 * The two aircraft on floats are built in crash.c from the wheeled tables
 * above: their gear taken off, every part raised by the CG drop the floats
 * cause (the plant's own 0.0264 and 0.0266), and two floats added from the
 * plant's float geometry, each on two music wire struts. That keeps one
 * copy of each airframe's numbers.
 */
/* Each float hangs on a fore and an aft strut 0.14 m apart, braced
 * corner to corner with 1 mm music wire, as a model float set is: a
 * braced truss, so a pitching load is taken by a bracing wire in tension,
 * 2000 MPa on 0.785 mm^2, 1570 N, on the struts' spacing; a strut alone
 * would buckle at Euler's 348 N (3 mm wire, 0.15 m). */
#define BRACE_WIRE (2000.0e6 * 3.14159265358979323846 * 0.0005 * 0.0005)
#define FLOAT_STRUT_M (BRACE_WIRE * 0.14)
#define FLOAT_STRUT_F (2.0 * BRACE_WIRE)

#endif /* CRASH_PARTS_H */
