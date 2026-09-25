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
  double f_max;   /* the joint's force limit, N */
  double k;       /* contact stiffness at its surface, N/m */
  double crush_s; /* crush plateau stress, Pa, 0 for none */
  double crush_a; /* crush area, m^2 */
  double crush_d; /* crush depth before it is spent, m */
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
/* EPO and EPP at 30 to 35 g/L: the compressive plateau at 25 percent. */
#define EPO_CRUSH 200.0e3
#define EPP_CRUSH 180.0e3
/* An 11 inch nylon prop blade root, 20 x 4 mm at 150 MPa, yields at 8 N m;
 * glass filled electric props are less ductile than a quad's, and shed a
 * blade at twice it. */
#define PL_PROP_M (2.0 * 8.0)
#define PL_PROP_K 1110.0
/* Hook and loop in shear, 8 N/cm^2, over a 12 cm^2 strip. */
#define VELCRO_12 96.0
/* Two 6 x 3 mm N52 hatch magnets. */
#define MAGNET_2 20.0
/* Music wire, 1600 MPa in bending at yield; the break is the plastic
 * hinge, 1.7 times the yield moment, at the ultimate 1.3 times the yield. */
#define WIRE_M(d) (1600.0e6 * 3.14159265358979323846 * (d) * (d) * (d) / 32.0 * 2.21)

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
  /* 0 frame: plates, stack, pod. */
  { .kind = SIM_PART_FRAME, .parent = -1, .mat = SIM_MAT_CF_PLATE, .motor = -1, .wheel = -1,
    .k = 5.0e6, BOX(-0.047, 0.070, -0.019, 0.019, -0.005, 0.040) },
  /* 1..4 arms, joint at the plate's edge, radius 0.030. */
  { .kind = SIM_PART_ARM, .parent = 0, .mat = SIM_MAT_CF_PLATE, .motor = 0, .wheel = -1, .shape = SH_ARM,
    .mass = 0.012, .joint = { -0.0212132, -0.0212132, 0.002 }, .m_max = M5_ARM_M, .f_max = 4000.0, .k = M5_ARM_K,
    .npts = 8, .pts = { { 0.020, 0.0935, 0.008 }, { -0.0018, 0.0058, 0.0 } } },
  { .kind = SIM_PART_ARM, .parent = 0, .mat = SIM_MAT_CF_PLATE, .motor = 1, .wheel = -1, .shape = SH_ARM,
    .mass = 0.012, .joint = { 0.0212132, -0.0212132, 0.002 }, .m_max = M5_ARM_M, .f_max = 4000.0, .k = M5_ARM_K,
    .npts = 8, .pts = { { 0.020, 0.0935, 0.008 }, { -0.0018, 0.0058, 0.0 } } },
  { .kind = SIM_PART_ARM, .parent = 0, .mat = SIM_MAT_CF_PLATE, .motor = 2, .wheel = -1, .shape = SH_ARM,
    .mass = 0.012, .joint = { -0.0212132, 0.0212132, 0.002 }, .m_max = M5_ARM_M, .f_max = 4000.0, .k = M5_ARM_K,
    .npts = 8, .pts = { { 0.020, 0.0935, 0.008 }, { -0.0018, 0.0058, 0.0 } } },
  { .kind = SIM_PART_ARM, .parent = 0, .mat = SIM_MAT_CF_PLATE, .motor = 3, .wheel = -1, .shape = SH_ARM,
    .mass = 0.012, .joint = { 0.0212132, 0.0212132, 0.002 }, .m_max = M5_ARM_M, .f_max = 4000.0, .k = M5_ARM_K,
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
  { .kind = SIM_PART_PROP, .parent = 5, .mat = SIM_MAT_NYLON_GF, .motor = 0, .wheel = -1, .shape = SH_DISCZ,
    .mass = 0.0045, .joint = { -Q5, -Q5, 0.030 }, .m_max = M5_PROP_M, .f_max = 400.0, .k = M5_PROP_K,
    .npts = 8, .pts = { { -Q5, -Q5, 0.034 }, { 0.0635, 0.0, 0.0 } } },
  { .kind = SIM_PART_PROP, .parent = 6, .mat = SIM_MAT_NYLON_GF, .motor = 1, .wheel = -1, .shape = SH_DISCZ,
    .mass = 0.0045, .joint = { Q5, -Q5, 0.030 }, .m_max = M5_PROP_M, .f_max = 400.0, .k = M5_PROP_K,
    .npts = 8, .pts = { { Q5, -Q5, 0.034 }, { 0.0635, 0.0, 0.0 } } },
  { .kind = SIM_PART_PROP, .parent = 7, .mat = SIM_MAT_NYLON_GF, .motor = 2, .wheel = -1, .shape = SH_DISCZ,
    .mass = 0.0045, .joint = { -Q5, Q5, 0.030 }, .m_max = M5_PROP_M, .f_max = 400.0, .k = M5_PROP_K,
    .npts = 8, .pts = { { -Q5, Q5, 0.034 }, { 0.0635, 0.0, 0.0 } } },
  { .kind = SIM_PART_PROP, .parent = 8, .mat = SIM_MAT_NYLON_GF, .motor = 3, .wheel = -1, .shape = SH_DISCZ,
    .mass = 0.0045, .joint = { Q5, Q5, 0.030 }, .m_max = M5_PROP_M, .f_max = 400.0, .k = M5_PROP_K,
    .npts = 8, .pts = { { Q5, Q5, 0.034 }, { 0.0635, 0.0, 0.0 } } },
  /* 13 the 6S 1300 under the frame, its bottom at the plant's measured
   * 45 mm (configs/airframes.js), on a strap that slips at 250 N. */
  { .kind = SIM_PART_BATTERY, .parent = 0, .mat = SIM_MAT_LIPO, .motor = -1, .wheel = -1,
    .mass = 0.200, .joint = { -0.012, 0.0, -0.006 }, .m_max = 6.0, .f_max = 250.0, .k = 3.0e5,
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
  { .kind = SIM_PART_PROP, .parent = 1, .mat = SIM_MAT_PC, .motor = 0, .wheel = -1, .shape = SH_DISCZ,
    .mass = 0.0005, .joint = { -QW, -QW, 0.0035 }, .m_max = WH_PROP_M, .f_max = WH_PROP_F, .k = 800.0,
    .npts = 8, .pts = { { -QW, -QW, 0.0035 }, { 0.0155, 0.0, 0.0 } } },
  { .kind = SIM_PART_PROP, .parent = 2, .mat = SIM_MAT_PC, .motor = 1, .wheel = -1, .shape = SH_DISCZ,
    .mass = 0.0005, .joint = { QW, -QW, 0.0035 }, .m_max = WH_PROP_M, .f_max = WH_PROP_F, .k = 800.0,
    .npts = 8, .pts = { { QW, -QW, 0.0035 }, { 0.0155, 0.0, 0.0 } } },
  { .kind = SIM_PART_PROP, .parent = 3, .mat = SIM_MAT_PC, .motor = 2, .wheel = -1, .shape = SH_DISCZ,
    .mass = 0.0005, .joint = { -QW, QW, 0.0035 }, .m_max = WH_PROP_M, .f_max = WH_PROP_F, .k = 800.0,
    .npts = 8, .pts = { { -QW, QW, 0.0035 }, { 0.0155, 0.0, 0.0 } } },
  { .kind = SIM_PART_PROP, .parent = 4, .mat = SIM_MAT_PC, .motor = 3, .wheel = -1, .shape = SH_DISCZ,
    .mass = 0.0005, .joint = { QW, QW, 0.0035 }, .m_max = WH_PROP_M, .f_max = WH_PROP_F, .k = 800.0,
    .npts = 8, .pts = { { QW, QW, 0.0035 }, { 0.0155, 0.0, 0.0 } } },
  /* 9 the 1S 300 mAh in its holder, which lets go at a few newtons. */
  { .kind = SIM_PART_BATTERY, .parent = 0, .mat = SIM_MAT_LIPO, .motor = -1, .wheel = -1,
    .mass = 0.0068, .joint = { 0.0, 0.0, -0.0036 }, .m_max = 0.10, .f_max = 5.0, .k = 5.0e5,
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
    .mass = 0.09, .joint = { 0.0, 0.06, 0.0 }, .m_max = 21.0, .f_max = 400.0, .k = 3000.0,
    .crush_s = EPP_CRUSH, .crush_a = 0.0012, .crush_d = 0.10,
    .npts = 8, .pts = { { 0.12, 0.06, -0.02 }, { -0.14, 0.06, -0.02 }, { -0.06, 0.50, -0.01 }, { -0.22, 0.50, -0.01 },
                        { 0.12, 0.06, 0.02 }, { -0.14, 0.06, 0.02 }, { -0.06, 0.50, 0.01 }, { -0.22, 0.50, 0.01 } } },
  { .kind = SIM_PART_WING, .parent = 0, .mat = SIM_MAT_EPP, .motor = -1, .wheel = -1,
    .mass = 0.09, .joint = { 0.0, -0.06, 0.0 }, .m_max = 21.0, .f_max = 400.0, .k = 3000.0,
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
  { .kind = SIM_PART_BATTERY, .parent = 0, .mat = SIM_MAT_LIPO, .motor = -1, .wheel = -1,
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
    .mass = 0.225, .joint = { -0.04, 0.068, 0.045 }, .m_max = 60.0, .f_max = 600.0, .k = 3000.0,
    .crush_s = EPO_CRUSH, .crush_a = 0.0015, .crush_d = 0.12,
    .npts = 8, .pts = { { 0.0817, 0.068, 0.030 }, { -0.163, 0.068, 0.030 }, { 0.0817, 0.90, 0.070 }, { -0.088, 0.90, 0.070 },
                        { 0.0817, 0.068, 0.060 }, { -0.163, 0.068, 0.060 }, { 0.0817, 0.90, 0.098 }, { -0.088, 0.90, 0.098 } } },
  { .kind = SIM_PART_WING, .parent = 0, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.225, .joint = { -0.04, -0.068, 0.045 }, .m_max = 60.0, .f_max = 600.0, .k = 3000.0,
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
    .mass = 0.060, .joint = { -0.03, 0.0, 0.051 }, .m_max = 180.0, .f_max = 1500.0, .k = 5.0e4,
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
  { .kind = SIM_PART_BATTERY, .parent = 0, .mat = SIM_MAT_LIPO, .motor = -1, .wheel = -1,
    .mass = 0.50, .joint = { 0.10, 0.0, -0.09 }, .m_max = 8.0, .f_max = 1.5 * VELCRO_12, .k = 3.0e5,
    BOX(0.02, 0.18, -0.025, 0.025, -0.09, -0.04) },
  { .kind = SIM_PART_CANOPY, .parent = 0, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
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
    .mass = 0.040, .joint = { -0.35, 0.0, 0.020 }, .m_max = 16.0, .f_max = 300.0, .k = 2.0e4,
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
    .mass = 0.150, .joint = { -0.02, 0.048, 0.099 }, .m_max = 40.0, .f_max = 500.0, .k = 3000.0,
    .crush_s = EPO_CRUSH, .crush_a = 0.00115, .crush_d = 0.10,
    BOX(-0.1485, 0.060, 0.048, 0.70, 0.087, 0.123) },
  { .kind = SIM_PART_WING, .parent = 0, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.150, .joint = { -0.02, -0.048, 0.099 }, .m_max = 40.0, .f_max = 500.0, .k = 3000.0,
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
  { .kind = SIM_PART_BATTERY, .parent = 0, .mat = SIM_MAT_LIPO, .motor = -1, .wheel = -1,
    .mass = 0.190, .joint = { 0.12, 0.0, -0.054 }, .m_max = 4.0, .f_max = VELCRO_12, .k = 3.0e5,
    BOX(0.070, 0.175, -0.017, 0.017, -0.054, -0.020) },
  { .kind = SIM_PART_CANOPY, .parent = 0, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
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
  /* 1 the tail boom, the fuselage aft of the wing, thin foam round a tube. */
  { .kind = SIM_PART_BOOM, .parent = 0, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.030, .joint = { -0.30, 0.0, 0.035 }, .m_max = 10.0, .f_max = 250.0, .k = 1.5e4,
    BOX(-0.7795, -0.30, -0.020, 0.020, 0.010, 0.050) },
  { .kind = SIM_PART_HSTAB, .parent = 1, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.015, .joint = { -0.70, 0.0, 0.075 }, .m_max = 2.0, .f_max = 80.0, .k = 3000.0,
    BOX(-0.7395, -0.6515, -0.2385, 0.2385, 0.070, 0.080) },
  { .kind = SIM_PART_ELEVATOR, .parent = 2, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.005, .joint = { -0.7395, 0.0, 0.075 }, .m_max = PL_SURF_M, .f_max = PL_SURF_F, .k = 2000.0,
    BOX(-0.7685, -0.7395, -0.2385, 0.2385, 0.071, 0.079) },
  { .kind = SIM_PART_FIN, .parent = 1, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.012, .joint = { -0.62, 0.0, 0.045 }, .m_max = 2.0, .f_max = 80.0, .k = 3000.0,
    BOX(-0.78, -0.55, -0.004, 0.004, 0.045, 0.268) },
  { .kind = SIM_PART_RUDDER, .parent = 4, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.004, .joint = { -0.79, 0.0, 0.15 }, .m_max = PL_SURF_M, .f_max = PL_SURF_F, .k = 2000.0,
    BOX(-0.8315, -0.785, -0.004, 0.004, 0.095, 0.200) },
  /* 6, 7 the panels, polyhedral to 0.14 at the tips, 45 N m at the joiner. */
  { .kind = SIM_PART_WING, .parent = 0, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.135, .joint = { -0.03, 0.042, 0.030 }, .m_max = 45.0, .f_max = 400.0, .k = 2500.0,
    .crush_s = EPO_CRUSH, .crush_a = 0.0009, .crush_d = 0.10,
    .npts = 8, .pts = { { 0.063, 0.042, 0.021 }, { -0.137, 0.042, 0.021 }, { 0.063, 0.60, 0.050 }, { -0.137, 0.60, 0.050 },
                        { 0.063, 0.042, 0.039 }, { -0.137, 0.042, 0.039 }, { -0.030, 1.00, 0.130 }, { -0.080, 1.00, 0.140 } } },
  { .kind = SIM_PART_WING, .parent = 0, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.135, .joint = { -0.03, -0.042, 0.030 }, .m_max = 45.0, .f_max = 400.0, .k = 2500.0,
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
  { .kind = SIM_PART_BATTERY, .parent = 0, .mat = SIM_MAT_LIPO, .motor = -1, .wheel = -1,
    .mass = 0.110, .joint = { 0.12, 0.0, -0.035 }, .m_max = 3.0, .f_max = VELCRO_12, .k = 3.0e5,
    BOX(0.08, 0.17, -0.015, 0.015, -0.035, -0.005) },
  { .kind = SIM_PART_CANOPY, .parent = 0, .mat = SIM_MAT_PC, .motor = -1, .wheel = -1,
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
 * carbon, Kevlar and Vectran; the outer panels plug in on a spar, the
 * winglets are held on by magnets. A composite shell cracks rather than
 * crushes, so nothing here crushes.
 * --------------------------------------------------------------------- */
static const PartDef PARTS_BRAMOR2300[] = {
  { .kind = SIM_PART_FUSELAGE, .parent = -1, .mat = SIM_MAT_CF_PLATE, .motor = -1, .wheel = -1,
    .k = 2.0e6, BOX(-0.332, 0.4097, -0.30, 0.30, -0.065, 0.087) },
  { .kind = SIM_PART_WING, .parent = 0, .mat = SIM_MAT_CF_PLATE, .motor = -1, .wheel = -1,
    .mass = 0.50, .joint = { -0.08, 0.30, 0.008 }, .m_max = 300.0, .f_max = 2500.0, .k = 1.0e4,
    .npts = 8, .pts = { { 0.050, 0.30, -0.009 }, { -0.210, 0.30, -0.009 }, { -0.347, 1.15, 0.006 }, { -0.467, 1.15, 0.006 },
                        { 0.050, 0.30, 0.025 }, { -0.210, 0.30, 0.025 }, { -0.347, 1.15, 0.018 }, { -0.467, 1.15, 0.018 } } },
  { .kind = SIM_PART_WING, .parent = 0, .mat = SIM_MAT_CF_PLATE, .motor = -1, .wheel = -1,
    .mass = 0.50, .joint = { -0.08, -0.30, 0.008 }, .m_max = 300.0, .f_max = 2500.0, .k = 1.0e4,
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
    .mass = 0.060, .joint = { -0.36, 0.0, 0.0 }, .m_max = 22.0, .f_max = 350.0, .k = 2.0e4,
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
    .mass = 0.200, .joint = { -0.06, 0.057, 0.080 }, .m_max = 58.0, .f_max = 600.0, .k = 3000.0,
    .crush_s = EPO_CRUSH, .crush_a = 0.0017, .crush_d = 0.12,
    .npts = 8, .pts = { { 0.060, 0.057, 0.063 }, { -0.180, 0.057, 0.063 }, { 0.060, 0.7775, 0.023 }, { -0.180, 0.7775, 0.023 },
                        { 0.076, 0.057, 0.097 }, { -0.180, 0.057, 0.097 }, { 0.076, 0.70, 0.097 }, { -0.180, 0.70, 0.097 } } },
  { .kind = SIM_PART_WING, .parent = 0, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
    .mass = 0.200, .joint = { -0.06, -0.057, 0.080 }, .m_max = 58.0, .f_max = 600.0, .k = 3000.0,
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
  { .kind = SIM_PART_BATTERY, .parent = 0, .mat = SIM_MAT_LIPO, .motor = -1, .wheel = -1,
    .mass = 0.330, .joint = { 0.15, 0.0, -0.050 }, .m_max = 6.0, .f_max = 1.5 * VELCRO_12, .k = 3.0e5,
    BOX(0.090, 0.210, -0.022, 0.022, -0.050, -0.010) },
  { .kind = SIM_PART_CANOPY, .parent = 0, .mat = SIM_MAT_EPO, .motor = -1, .wheel = -1,
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
