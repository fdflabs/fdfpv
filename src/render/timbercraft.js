/*
 * timbercraft.js: the Timber's model, and nothing else.
 *
 * Its own file for the reason cubcraft.js is: a bush plane is not a Cub.
 * It is a boxy foam fuselage under a cantilever high wing with drooped
 * tips, big slotted flaps inboard and ailerons outboard, fixed slats along
 * the leading edge with a slot behind them, a long nose with a turbine's
 * exhaust stacks drawn on it, fat foam tundra tyres on sprung blade legs,
 * a small tailwheel under the rudder and a three blade prop.
 *
 * The subject is the E-flite Turbo Timber Evolution 1.5 m, drawn in the
 * spirit of its white, red and black scheme with no marks on it. E-flite
 * publishes the span, 1555 mm, the length, 1040 mm, the wing area,
 * 36.1 dm2, the CG, 60 mm behind the leading edge at the root, the flap
 * throws (20 mm half, 35 mm full at the trailing edge), the prop, an
 * 11 x 7.5 three blade, and the wheels, 4.25 in foam (108 mm). The rest is
 * taken off Horizon Hobby's product photographs, the side views at rest
 * above all, in proportion to the published length, and is ESTIMATED to
 * about ten percent; docs/TIMBER-STAGE1.md says which:
 *
 *   span            1.555 m, flat to 0.70 m out each side and drooped
 *                   down 40 mm over the last 77.5 mm, the Timber's tips
 *   wing            a constant 0.240 m chord, a 14 percent semi symmetric
 *                   section at 1.5 deg of incidence, its leading edge
 *                   0.265 m behind the spinner's tip on the cabin's roof
 *   flaps           slotted, from the fuselage's side to 0.334 m out, the
 *                   aft 27 percent, hung on external hinges under the
 *                   wing so that lowered they open a slot
 *   ailerons        from 0.340 to 0.700 m out, the aft 27 percent
 *   slats           fixed, from 0.10 to 0.69 m out each side, a curved
 *                   plate the nose's shape standing 16 mm ahead of it
 *   tail            a 0.56 m stabiliser on the thrust line, 0.15 m of
 *                   chord at the root and 0.11 at the tip, its elevator
 *                   the aft 40 percent; a swept fin whose rudder runs
 *                   from the fuselage's bottom to the fin's top
 *   gear            a 0.30 m track on 108 mm foam tyres on sprung blade
 *                   legs, a 30 mm tailwheel steered by the rudder
 *   prop            11 x 7.5 three blade tractor, a 0.2794 m disc,
 *                   clockwise seen from the cockpit, behind a 44 mm
 *                   spinner
 *   length          1.040 m spinner tip to rudder trailing edge
 *
 * THE ORIGIN IS THE CENTRE OF GRAVITY: 60 mm behind the wing's leading
 * edge at the root, E-flite's figure, at the height of the thrust line.
 * Stations below are metres aft of the spinner's tip and turn into the
 * craft frame's z through st(); heights are metres above the thrust line.
 *
 * The aircraft rests on three wheels, and TIMBER_DIMS carries them the way
 * CUB_DIMS carries the Cub's: each wheel's axle and radius, the lowest
 * drawn point of each with the craft level, and the three point attitude
 * they make, which is the 11 deg the photographs show it sitting at.
 *
 * The contract with the shell is cubcraft.js's: group, discs, blades,
 * leds, cameraMount, stator, propSpin, four slots long, and
 * setSurfaces(leftAileron, rightAileron, elevator, rudder) in radians,
 * ailerons and elevator positive trailing edge up and the rudder positive
 * trailing edge to the LEFT, the tailwheel turning with it. On top of it,
 * setFlaps(rad): both flaps, positive trailing edge down, as
 * sim_wing_flaps reports them.
 *
 * ON FLOATS, opts.floats: the E-flite float set the Evolution ships with,
 * in place of the main gear, docs/FLOATS-STAGE1.md. The floats hang the
 * CG 26.6 mm lower, and the craft frame's origin is the CG, so everything
 * above is drawn that much higher in the group and the float set, from
 * src/render/floatset.js, is drawn in the new frame; TIMBER_FLOATS is its
 * geometry, the plant's (src/native/plant.c, SIM_AIRFRAME_TIMBER1500F),
 * and TIMBER_FLOAT_DIMS the drawn machine's reach. The water rudders turn
 * with setSurfaces' rudder.
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

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { celMaterial, outlineHull } from './celmat.js';
import { WORLD_SCALE } from './frame.js';
import { buildFloatSet } from './floatset.js';

/*
 * The aircraft, in metres, in the Three.js craft frame: x right, y up, z
 * aft, origin at the CG. Stations are metres aft of the spinner's tip.
 */
const LE_S = 0.265;
const CHORD = 0.240;
const CG_S = LE_S + 0.060;
const st = (s) => s - CG_S;

const HALF = 0.7775;
/* Where the tip starts to droop, and how far it has dropped at the end. */
const DROOP_IN = 0.700;
const DROOP = 0.040;
/* The root chord line's leading edge over the thrust line, on the cabin's
 * roof, and the incidence that lowers the trailing edge. */
const WING_Y = 0.080;
const INCIDENCE = (1.5 * Math.PI) / 180;
const WING_T = 0.14;
const WING_M = 0.035;
const WING_P = 0.30;

const FLAP_IN = 0.052;
const FLAP_OUT = 0.334;
const AIL_IN = 0.340;
const AIL_OUT = 0.700;
const HINGE = 0.73;
/* The flap's external hinge: under the lower surface at this chord, this
 * far below it. Lowered about it, the flap drops and moves aft. */
const FLAP_PIVOT_T = 0.77;
const FLAP_PIVOT_DROP = 0.010;

const SLAT_IN = 0.10;
const SLAT_OUT = 0.69;
const SLAT_T = 0.004;

/* The tail. */
const STAB_HALF = 0.280;
const STAB_LE_S = 0.840;
const STAB_ROOT = 0.150;
const STAB_TIP = 0.110;
const ELEV_HINGE_S = 0.930;
const STAB_Y = 0.006;
const STAB_T = 0.08;
const RUDDER_S = 0.975;
const RUDDER_TE_S = 1.040;
const RUDDER_BOTTOM = -0.036;
const TAIL_TOP = 0.195;
const FIN_T = 0.08;

/* The nose: the prop's plane, the spinner. */
const PROP_S = 0.035;
const PROP_R = 0.1397;
const SPINNER_R = 0.022;
const SPINNER_BASE_S = 0.047;

/* The gear. */
const MAIN_X = 0.150;
const MAIN_S = 0.268;
const MAIN_Y = -0.173;
const MAIN_R = 0.054;
const MAIN_W = 0.038;
const TAIL_PIVOT_S = 0.955;
const TAIL_WHEEL_S = 0.975;
const TAIL_WHEEL_Y = -0.065;
const TAIL_WHEEL_R = 0.015;

/* The flap's travel, E-flite's 20 and 35 mm at the trailing edge over its
 * 65 mm chord, for the preview and the dims; the plant has its own copy. */
const FLAP_CHORD = (1 - HINGE) * CHORD;
const FLAP_HALF = Math.asin(0.020 / FLAP_CHORD);
const FLAP_FULL = Math.asin(0.035 / FLAP_CHORD);

function chordLE(ax) {
  /* A rounded corner at the tip's leading edge over its last 25 mm. */
  const tipIn = HALF - 0.025;
  if (ax <= tipIn) {
    return { c: CHORD, le: st(LE_S) };
  }
  const u = Math.min(0.995, (ax - tipIn) / (HALF - tipIn));
  const f = 0.55 + 0.45 * Math.sqrt(1 - u * u);
  return { c: CHORD * f, le: st(LE_S) + CHORD * (1 - f) };
}
/* The chord line's height at span station ax: flat, then the droop, which
 * steepens toward the tip as the Timber's does. */
function wingLift(ax) {
  if (ax <= DROOP_IN) {
    return WING_Y;
  }
  const u = (ax - DROOP_IN) / (HALF - DROOP_IN);
  return WING_Y - DROOP * u * u;
}

/* The NACA four digit thickness, half of it, at chord fraction t. */
function naca(t, thick) {
  return 5 * thick * (
    0.2969 * Math.sqrt(t) - 0.1260 * t - 0.3516 * t * t + 0.2843 * t * t * t - 0.1015 * t * t * t * t
  );
}
function camber(t) {
  return t < WING_P
    ? (WING_M / (WING_P * WING_P)) * (2 * WING_P * t - t * t)
    : (WING_M / ((1 - WING_P) * (1 - WING_P))) * (1 - 2 * WING_P + 2 * WING_P * t - t * t);
}

/*
 * A closed airfoil section, skycraft.js's: a loop over the top from chord
 * fraction f0 to f1 and back under, cosine spaced.
 */
function section(at, f0, f1, n) {
  const ts = [];
  for (let i = 0; i < n; i += 1) {
    ts.push(f0 + (f1 - f0) * 0.5 * (1 - Math.cos((Math.PI * i) / (n - 1))));
  }
  const loop = ts.map((t) => at(t, 1));
  const stop = f0 === 0 ? 1 : 0;
  for (let i = n - 1; i >= stop; i -= 1) {
    loop.push(at(ts[i], -1));
  }
  return loop;
}

function wingAt(x) {
  const ax = Math.abs(x);
  const { c, le } = chordLE(ax);
  const y0 = wingLift(ax);
  const slope = Math.tan(INCIDENCE);
  return (t, side) => new THREE.Vector3(
    x,
    y0 + c * (camber(t) + side * naca(t, WING_T)) - t * c * slope,
    le + t * c,
  );
}

/* A symmetric tail section in the (y, z) plane at span station x. */
function stabAt(x, le, c) {
  return (t, side) => new THREE.Vector3(x, STAB_Y + side * c * naca(t, STAB_T), le + t * c);
}
/* A symmetric fin section in the (x, z) plane at height y. */
function finAt(y, le, c) {
  return (t, side) => new THREE.Vector3(side * c * naca(t, FIN_T), y, le + t * c);
}

/*
 * Skin a run of closed sections into one indexed geometry, capped at both
 * ends, cubcraft.js's loft: the signed volume of the closed result decides
 * which way the triangles face.
 */
function loft(sections) {
  const n = sections[0].length;
  const pos = [];
  for (const sec of sections) {
    for (const p of sec) {
      pos.push(p.x, p.y, p.z);
    }
  }
  const idx = [];
  for (let s = 0; s + 1 < sections.length; s += 1) {
    const a = s * n;
    const b = (s + 1) * n;
    for (let j = 0; j < n; j += 1) {
      const k = (j + 1) % n;
      idx.push(a + j, a + k, b + j, a + k, b + k, b + j);
    }
  }
  const cap = (sec, base, flip) => {
    const c = new THREE.Vector3();
    for (const p of sec) {
      c.add(p);
    }
    c.multiplyScalar(1 / n);
    const centre = pos.length / 3;
    pos.push(c.x, c.y, c.z);
    for (let j = 0; j < n; j += 1) {
      const k = (j + 1) % n;
      idx.push(centre, flip ? base + k : base + j, flip ? base + j : base + k);
    }
  };
  cap(sections[0], 0, true);
  cap(sections[sections.length - 1], (sections.length - 1) * n, false);

  let vol = 0;
  const v = (i) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  for (let i = 0; i < idx.length; i += 3) {
    vol += v(idx[i]).dot(v(idx[i + 1]).cross(v(idx[i + 2])));
  }
  if (vol < 0) {
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/*
 * A panel of paint laid on a surface a hair proud of it: point(u, v) for u
 * and v in 0..1 gives the surface, out(p) the outward direction there. The
 * panel is stood off along the surface's own normal, and its winding is
 * checked against outward rather than reasoned about.
 */
function paint(point, nu, nv, out, lift = 0.0008) {
  const pos = [];
  const e = 1e-4;
  for (let i = 0; i <= nu; i += 1) {
    for (let j = 0; j <= nv; j += 1) {
      const u = i / nu;
      const v = j / nv;
      const p = point(u, v);
      const du = point(Math.min(1, u + e), v).sub(point(Math.max(0, u - e), v));
      const dv = point(u, Math.min(1, v + e)).sub(point(u, Math.max(0, v - e)));
      const nrm = du.cross(dv).normalize();
      if (nrm.dot(out(p)) < 0) {
        nrm.negate();
      }
      p.addScaledVector(nrm, lift);
      pos.push(p.x, p.y, p.z);
    }
  }
  const row = nv + 1;
  const idx = [];
  for (let i = 0; i < nu; i += 1) {
    for (let j = 0; j < nv; j += 1) {
      const a = i * row + j;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const v3 = (i) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  const mid = Math.floor(idx.length / 6) * 3;
  const [p0, p1, p2] = [v3(idx[mid]), v3(idx[mid + 1]), v3(idx[mid + 2])];
  const nrm = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0));
  if (nrm.dot(out(p0)) < 0) {
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/* Paint on the wing's upper (side 1) or lower (side -1) skin, spanwise
 * from x0 to x1 and chordwise from t0 to t1. */
function wingPaint(x0, x1, t0, t1, side, nu, nv) {
  return paint(
    (u, v) => wingAt(x0 + (x1 - x0) * u)(t0 + (t1 - t0) * v, side),
    nu, nv, () => new THREE.Vector3(0, side, 0),
  );
}

/*
 * The wing, tip to tip in one loft, cut at the flaps' and ailerons' hinge
 * the way skycraft.js cuts it: the step from a full section to a cut one at
 * the same station is the cut out's side wall.
 */
function wingGeometry(lite) {
  const n = lite ? 8 : 12;
  const eps = 0.0005;
  const half = [
    [0, 1], [FLAP_IN - eps, 1], [FLAP_IN + eps, HINGE], [0.20, HINGE], [FLAP_OUT, HINGE],
    [0.50, HINGE], [AIL_OUT - eps, HINGE], [AIL_OUT + eps, 1],
  ];
  const tip = lite ? [0.735, HALF - 0.012, HALF] : [0.720, 0.740, 0.758, HALF - 0.012, HALF - 0.004, HALF];
  for (const x of tip) {
    half.push([x, 1]);
  }
  const stations = [
    ...half.slice(1).reverse().map(([x, f]) => [-x, f]),
    ...half,
  ];
  return loft(stations.map(([x, f]) => section(wingAt(x), 0, f, n)));
}

/*
 * A hinged surface, cubcraft.js's: the geometry moved so the pivot sits on
 * the hinge and turns about the hinge's own axis, pointing +x for a
 * horizontal hinge and +y for a vertical one, so a NEGATIVE turn lifts the
 * trailing edge or swings it left.
 */
function hinged(geo, a, b, material, shade) {
  const axis = new THREE.Vector3().subVectors(b, a).normalize();
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  geo.translate(-mid.x, -mid.y, -mid.z);
  const pivot = new THREE.Group();
  pivot.position.copy(mid);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = shade;
  pivot.add(mesh);
  return { pivot, axis, mesh };
}

/* The span stations of a trailing edge surface from x0 to x1 on the side
 * sign picks, ordered so the hinge axis points +x. */
function spanRun(x0, x1, n, sign) {
  const xs = [];
  for (let i = 0; i <= n; i += 1) {
    xs.push(sign * (x0 + ((x1 - x0) * i) / n));
  }
  if (sign < 0) {
    xs.reverse();
  }
  return xs;
}

function aileron(sign, material, shade, lite) {
  const xs = spanRun(AIL_IN, AIL_OUT, 2, sign);
  const geo = loft(xs.map((x) => section(wingAt(x), HINGE, 1, lite ? 4 : 6)));
  const hingePoint = (x) => wingAt(x)(HINGE, 1).add(wingAt(x)(HINGE, -1)).multiplyScalar(0.5);
  return hinged(geo, hingePoint(xs[0]), hingePoint(xs[xs.length - 1]), material, shade);
}

/*
 * A slotted flap: the wing's aft 27 percent, turning about a hinge line
 * that stands under the lower surface on the external brackets, so that
 * lowered it drops away from the wing and opens the slot the air goes
 * through. Its leading edge is rounded into the cove the way the real one
 * is, which the wing's own section does not do, so it is drawn a little
 * forward of the hinge cut and tucked under it.
 */
function flap(sign, material, shade, lite) {
  const xs = spanRun(FLAP_IN + 0.002, FLAP_OUT - 0.002, 2, sign);
  const geo = loft(xs.map((x) => section(wingAt(x), HINGE - 0.02, 1, lite ? 5 : 7)));
  const pivotAt = (x) => {
    const p = wingAt(x)(FLAP_PIVOT_T, -1);
    p.y -= FLAP_PIVOT_DROP;
    return p;
  };
  return hinged(geo, pivotAt(xs[0]), pivotAt(xs[xs.length - 1]), material, shade);
}

/*
 * The slats: a curved plate the shape of the wing's own nose, from 12
 * percent of the chord on top round to 2 percent underneath, stood 16 mm
 * ahead of it and 5 mm down, so a slot opens between the two that is
 * widest at the nose and closes toward the plate's trailing edge over the
 * wing's top, as the real one's does. 4 mm thick.
 */
const SLAT_FWD = 0.016;
const SLAT_DOWN = 0.005;
function slatAt(x) {
  const w = wingAt(x);
  const centre = w(0.07, 1).add(w(0.07, -1)).multiplyScalar(0.5);
  return (t, side) => {
    /* t runs 0 to 1 over the plate from its top edge round to its bottom
     * edge; side 1 is the outer skin, -1 the inner. */
    const a = t < 0.75 ? 0.12 * (1 - t / 0.75) : 0.02 * ((t - 0.75) / 0.25);
    const skin = w(Math.max(0.0005, a), t < 0.75 ? 1 : -1);
    if (side < 0) {
      const dir = new THREE.Vector3().subVectors(skin, centre).setX(0).normalize();
      skin.addScaledVector(dir, -SLAT_T);
    }
    skin.z -= SLAT_FWD;
    skin.y -= SLAT_DOWN;
    return skin;
  };
}
function slatGeometry(sign, lite) {
  const xs = spanRun(SLAT_IN, SLAT_OUT, lite ? 2 : 4, sign);
  const n = lite ? 6 : 9;
  return loft(xs.map((x) => {
    const at = slatAt(x);
    const loop = [];
    for (let i = 0; i < n; i += 1) {
      loop.push(at(i / (n - 1), 1));
    }
    for (let i = n - 1; i >= 0; i -= 1) {
      loop.push(at(i / (n - 1), -1));
    }
    return loop;
  }));
}

/*
 * The stabiliser's planform at |x|: a straight taper with the leading edge
 * swept and the hinge line straight, the tips rounded over their last
 * 30 mm. Inboard of 20 mm the elevator is cut forward to 40 mm behind its
 * hinge, which is the notch the rudder swings in.
 */
function stabPlan(ax) {
  const u = Math.min(1, ax / STAB_HALF);
  const c = STAB_ROOT + (STAB_TIP - STAB_ROOT) * u;
  const te0 = STAB_LE_S + STAB_ROOT;
  const te = te0 - 0.004 * u;
  let le = te - c;
  const tipIn = STAB_HALF - 0.030;
  let teNow = te;
  if (ax > tipIn) {
    const w = Math.min(0.995, (ax - tipIn) / (STAB_HALF - tipIn));
    const f = Math.sqrt(1 - w * w);
    le = ELEV_HINGE_S - (ELEV_HINGE_S - le) * f;
    teNow = ELEV_HINGE_S + (te - ELEV_HINGE_S) * f;
  }
  const notch = Math.min(1, Math.max(0, (ax - 0.012) / 0.012));
  teNow = Math.min(teNow, ELEV_HINGE_S + 0.040 + (teNow - ELEV_HINGE_S - 0.040) * notch);
  return { le: st(le), hinge: st(ELEV_HINGE_S), te: st(teNow) };
}

function stabGeometry(n) {
  const xs = [-STAB_HALF, -0.268, -0.250, -0.14, 0, 0.14, 0.250, 0.268, STAB_HALF];
  return loft(xs.map((x) => {
    const p = stabPlan(Math.abs(x));
    return section(stabAt(x, p.le, p.hinge - p.le), 0, 1, n);
  }));
}

/* One elevator half, from the notch out; sign picks the side. */
function elevatorHalf(sign, n) {
  const xs = [0.012, 0.018, 0.024, 0.14, 0.250, 0.268, STAB_HALF - 0.002].map((x) => sign * x);
  if (sign < 0) {
    xs.reverse();
  }
  return loft(xs.map((x) => {
    const p = stabPlan(Math.abs(x));
    return section(stabAt(x, p.hinge, p.te - p.hinge), 0, 1, n);
  }));
}

/*
 * The fin and rudder's outline at height y: the fin's leading edge swept
 * from the turtledeck up to the top, the top edge level and rounded into
 * the rudder, whose trailing edge is vertical from the fuselage's bottom
 * to the top. Every section keeps at least 6 mm of fin ahead of the hinge.
 */
function tailOutline(y) {
  const top = TAIL_TOP;
  const rootY = 0.026;
  const leRoot = 0.800;
  const leTop = 0.950;
  let le = leRoot + ((y - rootY) / (top - rootY)) * (leTop - leRoot);
  le = Math.min(le, RUDDER_S - 0.006);
  let te = RUDDER_TE_S;
  const round0 = top - 0.030;
  if (y > round0) {
    const u = Math.min(0.995, (y - round0) / (top - round0));
    te = RUDDER_S + (RUDDER_TE_S - RUDDER_S) * Math.sqrt(1 - u * u);
  }
  return { le: st(le), hinge: st(RUDDER_S), te: st(Math.max(te, RUDDER_S + 0.004)) };
}

function finGeometry(n) {
  const ys = [0.012, 0.026, 0.060, 0.110, 0.150, 0.175, 0.188, TAIL_TOP];
  return loft(ys.map((y) => {
    const o = tailOutline(y);
    const le = y < 0.026 ? tailOutline(0.026).le : o.le;
    return section(finAt(y, le, o.hinge - le), 0, 1, n);
  }));
}
function rudderGeometry(n) {
  const ys = [RUDDER_BOTTOM, RUDDER_BOTTOM + 0.006, 0.0, 0.060, 0.120, 0.165, 0.180, 0.190, TAIL_TOP];
  return loft(ys.map((y) => {
    const o = tailOutline(y);
    return section(finAt(y, o.hinge, o.te - o.hinge), 0, 1, n);
  }));
}

/*
 * The fuselage, as rounded box sections along the stations: half width,
 * top, bottom and squareness. The cowl behind the spinner, deepening to
 * the firewall; the windscreen's rake up to the wing; the cabin under the
 * wing, as deep as a box; and the turtledeck falling away behind the wing
 * to the tail post the rudder hangs on.
 */
const FUSE = [
  [0.045, 0.036, 0.028, -0.030, 2.4],
  [0.070, 0.044, 0.034, -0.042, 2.6],
  [0.120, 0.050, 0.038, -0.054, 2.8],
  [0.190, 0.055, 0.040, -0.066, 3.2],
  [0.262, 0.057, 0.074, -0.070, 3.6],
  [0.505, 0.057, 0.072, -0.070, 3.6],
  [0.560, 0.052, 0.052, -0.066, 3.2],
  [0.720, 0.038, 0.034, -0.054, 2.8],
  [0.880, 0.022, 0.020, -0.042, 2.4],
  [RUDDER_S, 0.010, 0.012, -0.036, 2.2],
];
function fuseAt(s) {
  const last = FUSE[FUSE.length - 1];
  const t = Math.min(Math.max(s, FUSE[0][0]), last[0]);
  for (let i = 0; i + 1 < FUSE.length; i += 1) {
    const a = FUSE[i];
    const b = FUSE[i + 1];
    if (t <= b[0]) {
      const u = (t - a[0]) / (b[0] - a[0]);
      /* The windscreen is a straight rake, everything else eases. */
      const k = i === 3 ? u : u * u * (3 - 2 * u);
      const lerp = (j) => a[j] + (b[j] - a[j]) * k;
      const top = lerp(2);
      const bottom = lerp(3);
      return { w: lerp(1), h: (top - bottom) / 2, yc: (top + bottom) / 2, e: lerp(4) };
    }
  }
  throw new Error(`timbercraft: station ${s} is off the fuselage`);
}
/* A point on the fuselage's skin at station s, angle a from the top
 * towards +x, stood off it by out. */
function fusePoint(s, a, out = 0) {
  const { w, h, yc, e } = fuseAt(s);
  const sn = Math.sin(a);
  const cs = Math.cos(a);
  const p = 2 / e;
  return new THREE.Vector3(
    Math.sign(sn) * (w + out) * Math.abs(sn) ** p,
    yc + Math.sign(cs) * (h + out) * Math.abs(cs) ** p,
    st(s),
  );
}
/* The angle on the section at s whose height is v of the half height up
 * from the section's middle, on the side sign picks. */
function fuseAngle(s, v, sign) {
  const { e } = fuseAt(s);
  return sign * Math.acos(Math.sign(v) * Math.abs(v) ** (e / 2));
}
function fuseStations(lite) {
  return lite
    ? [0.045, 0.070, 0.120, 0.190, 0.262, 0.505, 0.560, 0.720, 0.880, RUDDER_S]
    : [0.045, 0.052, 0.062, 0.080, 0.100, 0.120, 0.155, 0.190, 0.226, 0.262, 0.505, 0.530, 0.560,
      0.640, 0.720, 0.800, 0.880, RUDDER_S];
}
function fuseGeometry(lite) {
  const around = lite ? 16 : 28;
  return loft(fuseStations(lite).map((s) => {
    const ring = [];
    for (let i = 0; i < around; i += 1) {
      ring.push(fusePoint(s, (2 * Math.PI * i) / around));
    }
    return ring;
  }));
}

/*
 * A point on the skin as the LOFT draws it: straight between its stations,
 * not the eased curve fuseAt gives between them, which dips inside the
 * lofted skin and would bury a panel laid on it.
 */
function skinPoint(ss, s, a, out) {
  let i = 0;
  while (i + 2 < ss.length && s > ss[i + 1]) {
    i += 1;
  }
  const u = (s - ss[i]) / (ss[i + 1] - ss[i]);
  return fusePoint(ss[i], a, out).lerp(fusePoint(ss[i + 1], a, out), u).setZ(st(s));
}
/* Paint on the fuselage from station s0 to s1, between the two angles
 * band(s) returns. */
function skinPanel(lite, s0, s1, ns, band, na, out = 0.0008) {
  const ss = fuseStations(lite);
  return paint((u, v) => {
    const s = s0 + (s1 - s0) * u;
    const [a0, a1] = band(s);
    return skinPoint(ss, s, a0 + (a1 - a0) * v, out);
  }, ns, na, (p) => new THREE.Vector3(p.x, p.y - fuseAt(p.z + CG_S).yc, 0), 0);
}

/* A round rod from a to b, flattened across the flow by flat, for legs
 * and springs. */
function rod(a, b, r, seg, flat = 1) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg);
  g.scale(1 / flat, 1, flat);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  const m = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return g;
}

/* An 11 x 7.5 blade, broad and square tipped as the three blade is. */
function bladeGeometry(segments) {
  const r = PROP_R;
  const s = new THREE.Shape();
  s.moveTo(0.0045, 0.008);
  s.bezierCurveTo(0.0190, -0.020, 0.0165, -r * 0.55, 0.0100, -r * 0.97);
  s.lineTo(-0.0060, -r * 0.965);
  s.bezierCurveTo(-0.0130, -r * 0.45, -0.0105, -0.010, -0.0035, 0.008);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.0024, bevelEnabled: false, curveSegments: segments });
}

/* mergeGeometries wants one attribute set; lofts carry no uv. */
function merged(parts) {
  for (const g of parts) {
    if (g.getAttribute('uv')) {
      g.deleteAttribute('uv');
    }
    if (g.index === null) {
      g.setIndex([...Array(g.getAttribute('position').count).keys()]);
    }
  }
  const geo = mergeGeometries(parts, false);
  if (!geo) {
    throw new Error('timbercraft: merge failed');
  }
  return geo;
}

/*
 * The wheels' drawn lowest points in the level craft frame, and the three
 * point attitude they make, cubcraft.js's way: the ground line tangent
 * under both wheel circles in the craft's side plane, solved by bisection.
 */
const MAIN_AXLE = [MAIN_X, MAIN_Y, st(MAIN_S)];
const TAIL_AXLE = [0, TAIL_WHEEL_Y, st(TAIL_WHEEL_S)];
function restPitch() {
  const dy = TAIL_AXLE[1] - MAIN_AXLE[1];
  const dz = TAIL_AXLE[2] - MAIN_AXLE[2];
  const f = (p) => Math.cos(p) * dy - Math.sin(p) * dz - (TAIL_WHEEL_R - MAIN_R);
  let lo = 0;
  let hi = Math.PI / 4;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}
const REST_PITCH = restPitch();
const restContact = (axle, r) => [
  axle[0],
  axle[1] - r * Math.cos(REST_PITCH),
  axle[2] + r * Math.sin(REST_PITCH),
];
const REST_CG_HEIGHT = (() => {
  const c = restContact(MAIN_AXLE, MAIN_R);
  return -(Math.cos(REST_PITCH) * c[1] - Math.sin(REST_PITCH) * c[2]);
})();

/*
 * Exported numbers, so the airframe table and the scale check are held
 * against the drawn machine, in CUB_DIMS's shape: hullR the furthest reach
 * in plan, the drooped tip's trailing corner, vHalfUp the fin's top,
 * vHalfDown the main tyres' bottoms.
 */
const UP = TAIL_TOP;
const DOWN = -(MAIN_Y - MAIN_R);
export const TIMBER_DIMS = {
  span: 2 * HALF,
  chord: CHORD,
  stabSpan: 2 * STAB_HALF,
  gearTrack: 2 * MAIN_X,
  propR: PROP_R,
  noseZ: st(0),
  tailZ: st(RUDDER_TE_S),
  length: RUDDER_TE_S,
  vHalfUp: UP,
  vHalfDown: DOWN,
  flapHalf: FLAP_HALF,
  flapFull: FLAP_FULL,
  /* The wheels: axle centres and radii in the craft frame, level. */
  wheels: {
    mainLeft: { axle: [-MAIN_AXLE[0], MAIN_AXLE[1], MAIN_AXLE[2]], r: MAIN_R, width: MAIN_W },
    mainRight: { axle: [...MAIN_AXLE], r: MAIN_R, width: MAIN_W },
    tail: { axle: [...TAIL_AXLE], r: TAIL_WHEEL_R, width: 0.010 },
  },
  /* The lowest drawn point of each wheel with the craft level. */
  contact: {
    mainLeft: [-MAIN_AXLE[0], MAIN_AXLE[1] - MAIN_R, MAIN_AXLE[2]],
    mainRight: [MAIN_AXLE[0], MAIN_AXLE[1] - MAIN_R, MAIN_AXLE[2]],
    tail: [0, TAIL_AXLE[1] - TAIL_WHEEL_R, TAIL_AXLE[2]],
  },
  rest: {
    pitch: REST_PITCH,
    pitchDeg: (REST_PITCH * 180) / Math.PI,
    cgHeight: REST_CG_HEIGHT,
    contact: {
      mainLeft: restContact([-MAIN_AXLE[0], MAIN_AXLE[1], MAIN_AXLE[2]], MAIN_R),
      mainRight: restContact(MAIN_AXLE, MAIN_R),
      tail: restContact(TAIL_AXLE, TAIL_WHEEL_R),
    },
  },
  dims: {
    arm: 0,
    propR: PROP_R,
    hullR: Math.hypot(HALF, st(LE_S + CHORD)),
    vHalfDown: DOWN,
    vHalfUp: UP,
    bodyLength: RUDDER_TE_S,
    bodyWidth: 2 * HALF,
    bodyHeight: UP + DOWN,
  },
};

/*
 * THE FLOATS, body frame of the aircraft on them (x forward, y left, z up,
 * the CG with the floats on at the origin), the plant's numbers exactly:
 * src/native/plant.c SIM_AIRFRAME_TIMBER1500F, docs/FLOATS-STAGE1.md. The
 * struts leave the decks at `front` and `rear` for the belly where the
 * main gear's legs were and under the cabin.
 */
export const TIMBER_FLOAT_DZ = 0.0266;
export const TIMBER_FLOATS = {
  y: 0.18, xBow: 0.33, xKnee: 0.14, xStep: -0.05, xStern: -0.39,
  zKeel: -0.2484, bowRise: 0.060, stepH: 0.010, aftSlope: 0.1405,
  depth: 0.075, beam: 0.085, tanDr: 0.26795,
  rudder: { x: -0.38, chord: 0.035, span: 0.05 },
  struts: { front: 0.12, rear: -0.02 },
};
/* The drawn machine on its floats: the keels are its lowest point and the
 * fin's top is the CG's drop higher; the tip still reaches furthest. */
export const TIMBER_FLOAT_DIMS = {
  vHalfDown: -TIMBER_FLOATS.zKeel,
  vHalfUp: TAIL_TOP + TIMBER_FLOAT_DZ,
  rest: { pitch: (2.52 * Math.PI) / 180, pitchDeg: 2.52, cgHeight: 0.2074 },
};

/*
 * The camera mount: the FPV camera on top of the cowl, just ahead of the
 * windscreen, looking over the nose through the prop. 205 mm ahead of the
 * CG and 49 mm above it.
 */
const CAM_S = 0.120;
export const TIMBER_MOUNT_FORWARD = -st(CAM_S);
export const TIMBER_MOUNT_UP = fuseAt(CAM_S).yc + fuseAt(CAM_S).h + 0.011;
export const TIMBER_FLOAT_MOUNT_UP = TIMBER_MOUNT_UP + TIMBER_FLOAT_DZ;

/*
 * A tractor turning clockwise seen from the cockpit. The prop mount turns
 * the rotor's y onto the craft's forward axis, -z, so +1 is clockwise from
 * behind, as the Cub's. Slots 1 to 3 spin nothing.
 */
export const TIMBER_PROP_SPIN = [1, 0, 0, 0];

export function buildTimberCraft(opts = {}) {
  const fog = opts.fog !== false;
  const lite = Boolean(opts.lite);
  const onFloats = Boolean(opts.floats);
  const inkOn = !lite;
  const shade = !lite;
  const cel = (o) => celMaterial({ fog, cloudShadow: 0, ...o });
  const group = new THREE.Group();
  group.name = opts.name ?? 'timber-craft';
  if (opts.worldScale) {
    group.scale.setScalar(1 / WORLD_SCALE);
  }
  const hull = (mesh, t, c) => {
    if (inkOn) {
      outlineHull(mesh, t, c);
    }
    return mesh;
  };
  const seg = lite ? 8 : 14;
  const rodSeg = lite ? 4 : 8;

  const white = cel({ color: 0xf1f0ea, rim: 0.28, spec: 0.30, specWidth: 0.014 });
  const whiteDim = cel({ color: 0xdedcd4, rim: 0.28, spec: 0.26, specWidth: 0.014 });
  const red = cel({ color: 0xd5271f, rim: 0.28, spec: 0.34, specWidth: 0.016 });
  const redDim = cel({ color: 0xbc1f19, rim: 0.28, spec: 0.30, specWidth: 0.016 });
  const black = cel({ color: 0x17191b, rim: 0.30, spec: 0.45, specWidth: 0.016, specColor: 0xd8e0e8 });
  const foam = cel({ color: 0x232426, rim: 0.22, spec: 0.08, specWidth: 0.010 });
  const metal = cel({ color: 0xc2c5c8, rim: 0.30, spec: 0.75, specWidth: 0.022 });
  const glass = cel({ color: 0x8c9aa3, rim: 0.40, spec: 0.55, specWidth: 0.020, specColor: 0xf3ead4 });
  const stator = cel({ color: 0x2a2c2e, rim: 0.24, spec: 0.20 });
  const camBody = cel({ color: 0x141c16, rim: 0.26, spec: 0.35 });
  const lens = cel({
    color: 0x101610,
    rim: 0.40,
    spec: 0.95,
    specWidth: 0.03,
    specColor: 0xf3ead4,
    side: THREE.DoubleSide,
  });
  const ring = cel({ color: 0xb8b09e, rim: 0.28, spec: 0.55 });
  const propMat = cel({ color: 0x25282a, rim: 0.26, spec: 0.30 });
  const antenna = cel({ color: 0x1a241c, rim: 0.22 });
  const ink = 0x0c120e;

  /* The measurement box, hidden, on herocraft.js's contract with check 15. */
  if (opts.measure) {
    const d = TIMBER_DIMS;
    const body = new THREE.Mesh(new THREE.BoxGeometry(d.span, d.vHalfUp + d.vHalfDown, d.length), white);
    body.position.set(0, (d.vHalfUp - d.vHalfDown) / 2, (d.tailZ + d.noseZ) / 2);
    body.visible = false;
    body.castShadow = false;
    group.add(body);
  }

  /* The fuselage, centred on its own middle so the hull thickens it evenly. */
  {
    const geo = fuseGeometry(lite);
    geo.computeBoundingBox();
    const c = geo.boundingBox.getCenter(new THREE.Vector3());
    geo.translate(-c.x, -c.y, -c.z);
    const fuse = new THREE.Mesh(geo, white);
    fuse.position.copy(c);
    fuse.name = 'timber-fuselage';
    fuse.castShadow = shade;
    hull(fuse, 1.016, ink);
    group.add(fuse);
  }

  /* Every fixed white part in one draw: the wing, the stabiliser, the fin
   * and the slats. */
  {
    const n = lite ? 5 : 7;
    const parts = [wingGeometry(lite), stabGeometry(n), finGeometry(n)];
    for (const sign of [-1, 1]) {
      /* The flap and aileron hinge brackets under the wing. */
      for (const x of [0.12, 0.26, 0.44, 0.62]) {
        const a = wingAt(sign * x)(FLAP_PIVOT_T - 0.08, -1);
        const b = wingAt(sign * x)(FLAP_PIVOT_T, -1);
        b.y -= FLAP_PIVOT_DROP;
        parts.push(rod(a, b, 0.0020, 4, 2.5));
      }
      /* The slats' three brackets each side. */
      for (const x of [0.14, 0.40, 0.66]) {
        const at = slatAt(sign * x);
        parts.push(rod(wingAt(sign * x)(0.01, -1), at(0.85, -1), 0.0018, 4));
      }
    }
    const airframe = new THREE.Mesh(merged(parts), white);
    airframe.name = 'timber-airframe';
    airframe.castShadow = shade;
    group.add(airframe);
  }

  /*
   * The red, one draw: the wing's top from 0.30 m out to the tip and the
   * drooped tips underneath, the stabiliser's middle, the belly's long
   * sweep from the cabin to the tail, and the pinstripe along the cowl.
   */
  {
    const parts = [];
    const nu = lite ? 3 : 6;
    for (const sign of [-1, 1]) {
      parts.push(slatGeometry(sign, lite));
      const x0 = sign * 0.300;
      const x1 = sign * (HALF - 0.004);
      parts.push(wingPaint(x0, sign * (DROOP_IN - 0.004), 0.004, HINGE - 0.012, 1, nu, lite ? 3 : 6));
      parts.push(wingPaint(sign * (DROOP_IN + 0.004), x1, 0.012, 0.985, 1, lite ? 2 : 4, lite ? 3 : 6));
      parts.push(wingPaint(sign * (DROOP_IN + 0.004), x1, 0.012, 0.985, -1, lite ? 2 : 4, lite ? 3 : 6));
      /* The belly band, the lower third of the side from the cabin aft,
       * rising at the tail where the fin carries it on. */
      parts.push(skinPanel(lite, 0.300, RUDDER_S - 0.004, lite ? 6 : 14, (s) => {
        const v = -0.30 + 0.45 * Math.max(0, (s - 0.60) / (RUDDER_S - 0.60));
        return [fuseAngle(s, v, sign), sign * Math.PI * 0.999];
      }, lite ? 2 : 4));
    }
    /* The stabiliser's red middle, top and bottom, clear of the hinge. */
    const stabPaint = (side) => paint((u, v) => {
      const x = -0.24 + 0.48 * u;
      const p = stabPlan(Math.abs(x));
      const c = p.hinge - p.le;
      return stabAt(x, p.le, c)(0.12 + 0.80 * v, side);
    }, lite ? 4 : 8, lite ? 2 : 3, () => new THREE.Vector3(0, side, 0));
    parts.push(stabPaint(1), stabPaint(-1));
    const redMesh = new THREE.Mesh(merged(parts), red);
    redMesh.name = 'timber-red';
    redMesh.castShadow = shade;
    group.add(redMesh);
  }

  /*
   * The black, one draw: the cowl's top back to the windscreen, the
   * lightning stripe on each side, and the gear's springs' blocks.
   */
  {
    const parts = [];
    parts.push(skinPanel(lite, 0.047, 0.190, lite ? 3 : 6, (s) => [fuseAngle(s, 0.45, -1), fuseAngle(s, 0.45, 1)], lite ? 6 : 10));
    for (const sign of [-1, 1]) {
      /* A bolt: a band from under the windows' front back past the wing,
       * jogging down behind the cabin and running out toward the tail. */
      const top = (s) => (s < 0.40 ? 0.05 : s < 0.46 ? 0.05 - 0.40 * (s - 0.40) / 0.06 : -0.35 + 0.30 * (s - 0.46) / 0.30);
      parts.push(skinPanel(lite, 0.200, 0.760, lite ? 6 : 16, (s) => {
        const t = top(s);
        const w = 0.13 * (1 - Math.max(0, (s - 0.46) / 0.30) * 0.85);
        return [fuseAngle(s, Math.max(-0.95, t), sign), fuseAngle(s, Math.max(-0.97, t - w), sign)];
      }, 2));
    }
    const blackMesh = new THREE.Mesh(merged(parts), black);
    blackMesh.name = 'timber-black';
    group.add(blackMesh);
  }

  /* The glass, one draw: the windscreen and the two windows each side. */
  {
    const parts = [];
    parts.push(skinPanel(lite, 0.195, 0.258, lite ? 2 : 4, () => [-1.05, 1.05], lite ? 6 : 12));
    for (const sign of [-1, 1]) {
      for (const [s0, s1] of [[0.272, 0.365], [0.375, 0.470]]) {
        parts.push(skinPanel(lite, s0, s1, 2, (s) => [fuseAngle(s, 0.88, sign), fuseAngle(s, 0.18, sign)], 3));
      }
    }
    const glassMesh = new THREE.Mesh(merged(parts), glass);
    glassMesh.name = 'timber-glass';
    group.add(glassMesh);
  }

  /*
   * The tyres, one draw: fat foam tundra tyres, a torus whose outermost
   * ring has a vertex straight under the axle (tubular segments a multiple
   * of four), so the lowest vertex is the axle less the radius, exactly.
   * Not on floats, which take the main gear's place.
   */
  if (!onFloats) {
    const parts = [];
    const tube = MAIN_W / 2;
    for (const sign of [-1, 1]) {
      const tyre = new THREE.TorusGeometry(MAIN_R - tube, tube, lite ? 6 : 10, lite ? 16 : 24);
      tyre.rotateY(Math.PI / 2);
      tyre.translate(sign * MAIN_X, MAIN_Y, st(MAIN_S));
      parts.push(tyre);
      const side = new THREE.CylinderGeometry(MAIN_R - tube, MAIN_R - tube, MAIN_W * 0.9, lite ? 12 : 20);
      side.rotateZ(Math.PI / 2);
      side.translate(sign * MAIN_X, MAIN_Y, st(MAIN_S));
      parts.push(side);
    }
    const tyres = new THREE.Mesh(merged(parts), foam);
    tyres.name = 'timber-tyres';
    tyres.castShadow = shade;
    group.add(tyres);
  }

  /*
   * Metal and white plastic, one draw: the gear's blade legs, the hubs,
   * the bungee springs between the legs and their wire, the exhaust
   * stacks each side of the cowl, and the tailwheel's spring.
   */
  {
    const parts = [];
    for (const sign of [-1, 1]) {
      const root = new THREE.Vector3(sign * 0.040, -0.066, st(0.240));
      const axle = new THREE.Vector3(sign * (MAIN_X - MAIN_W / 2 - 0.004), MAIN_Y, st(MAIN_S));
      if (!onFloats) {
        parts.push(rod(root, axle, 0.0075, rodSeg, 2.4));
        const hub = new THREE.CylinderGeometry(0.016, 0.016, MAIN_W + 0.003, seg);
        hub.rotateZ(Math.PI / 2);
        hub.translate(sign * MAIN_X, MAIN_Y, st(MAIN_S));
        parts.push(hub);
        /* The bungee: from the leg's middle to the block under the belly. */
        const mid = new THREE.Vector3().lerpVectors(root, axle, 0.55);
        const block = new THREE.Vector3(0, -0.105, st(0.250));
        parts.push(rod(new THREE.Vector3().lerpVectors(mid, block, 0.15), new THREE.Vector3().lerpVectors(mid, block, 0.55), 0.0040, rodSeg));
        parts.push(rod(mid, block, 0.0008, 3));
        parts.push(rod(block, new THREE.Vector3(sign * 0.030, -0.069, st(0.250)), 0.0008, 3));
      }
      /* The exhaust stack: a short tube out of the cowl's side, raked aft. */
      const s0 = 0.100;
      const out = fusePoint(s0, sign * Math.PI / 2, 0.004);
      parts.push(rod(new THREE.Vector3(out.x - sign * 0.006, out.y + 0.004, st(s0)),
        new THREE.Vector3(out.x + sign * 0.006, out.y + 0.001, st(s0 + 0.060)), 0.0085, seg));
    }
    if (!onFloats) {
      parts.push(new THREE.BoxGeometry(0.014, 0.010, 0.012).translate(0, -0.105, st(0.250)));
    }
    parts.push(rod(new THREE.Vector3(0, fuseAt(0.955).yc - fuseAt(0.955).h + 0.002, st(0.945)),
      new THREE.Vector3(0, TAIL_WHEEL_Y + 0.030, st(TAIL_PIVOT_S)), 0.0018, lite ? 4 : 6));
    const metalMesh = new THREE.Mesh(merged(parts), metal);
    metalMesh.name = 'timber-metal';
    metalMesh.castShadow = shade;
    group.add(metalMesh);
  }

  /* The moving surfaces. The elevator is both halves on one pivot. */
  const n = lite ? 4 : 5;
  const leftAil = aileron(-1, red, shade, lite);
  const rightAil = aileron(1, red, shade, lite);
  const leftFlap = flap(-1, whiteDim, shade, lite);
  const rightFlap = flap(1, whiteDim, shade, lite);
  const eh = (x) => new THREE.Vector3(x, STAB_Y, st(ELEV_HINGE_S));
  const elevator = hinged(merged([elevatorHalf(-1, n), elevatorHalf(1, n)]),
    eh(-STAB_HALF), eh(STAB_HALF), redDim, shade);
  const rudder = hinged(rudderGeometry(n),
    new THREE.Vector3(0, RUDDER_BOTTOM, st(RUDDER_S)),
    new THREE.Vector3(0, TAIL_TOP, st(RUDDER_S)),
    whiteDim, shade);

  /* The tailwheel on its own vertical pivot, trailing 20 mm behind it, and
   * turning with the rudder. */
  const tailwheel = (() => {
    const pivot = new THREE.Group();
    pivot.position.set(0, TAIL_WHEEL_Y + 0.030, st(TAIL_PIVOT_S));
    const trail = TAIL_WHEEL_S - TAIL_PIVOT_S;
    const forkParts = [
      rod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.006, -0.030, trail), 0.0014, lite ? 4 : 6),
      new THREE.CylinderGeometry(0.0055, 0.0055, 0.010, lite ? 6 : 10).rotateZ(Math.PI / 2)
        .translate(0, -0.030, trail),
    ];
    const fork = new THREE.Mesh(merged(forkParts), metal);
    fork.castShadow = shade;
    pivot.add(fork);
    const tyreGeo = new THREE.TorusGeometry(TAIL_WHEEL_R - 0.0045, 0.0045, 6, 12);
    tyreGeo.rotateY(Math.PI / 2);
    tyreGeo.translate(0, -0.030, trail);
    const tyre = new THREE.Mesh(tyreGeo, black);
    tyre.name = 'tyre-tail';
    tyre.castShadow = shade;
    pivot.add(tyre);
    return { pivot, axis: new THREE.Vector3(0, 1, 0) };
  })();

  const surfaces = {
    'aileron-left': leftAil,
    'aileron-right': rightAil,
    'flap-left': leftFlap,
    'flap-right': rightFlap,
    elevator,
    rudder,
    tailwheel,
  };
  for (const [name, s] of Object.entries(surfaces)) {
    s.pivot.name = name;
    group.add(s.pivot);
  }

  /* The camera on the cowl's top, ahead of the windscreen. */
  const cameraMount = new THREE.Group();
  cameraMount.position.set(0, TIMBER_MOUNT_UP, -TIMBER_MOUNT_FORWARD);
  cameraMount.name = 'timber-camera-mount';
  group.add(cameraMount);
  {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.020, 0.020), camBody);
    housing.position.set(0, 0, 0.006);
    housing.castShadow = shade;
    hull(housing, 1.08, ink);
    cameraMount.add(housing);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0080, 0.0086, 0.012, lite ? 8 : 14), camBody);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0, -0.010);
    cameraMount.add(barrel);
    const glassDisc = new THREE.Mesh(new THREE.CircleGeometry(0.0072, lite ? 10 : 18), lens);
    glassDisc.rotation.y = Math.PI;
    glassDisc.position.set(0, 0, -0.0162);
    cameraMount.add(glassDisc);
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.0078, 0.0013, lite ? 4 : 6, lite ? 10 : 14), ring);
    bezel.position.set(0, 0, -0.0156);
    cameraMount.add(bezel);
  }

  /* The video antenna, a whip off the turtledeck behind the wing. NAMED,
   * because it is wire and not aircraft: scripts/craft-check.js leaves it
   * out. */
  {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.080, lite ? 5 : 8), antenna);
    const s = 0.600;
    mast.position.set(0, fuseAt(s).yc + fuseAt(s).h + 0.036, st(s) + 0.012);
    mast.rotation.x = 0.35;
    mast.name = 'antenna';
    group.add(mast);
  }

  /*
   * The motor behind the spinner, the spinner, and the three blade prop,
   * on cubcraft.js's mount: rotor.rotation.y is the spin the shell drives.
   */
  const discs = [];
  const blades = [];
  const leds = [];
  {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.010, seg), stator);
    can.rotation.x = Math.PI / 2;
    can.position.set(0, 0, st(0.050));
    group.add(can);

    const propMount = new THREE.Group();
    propMount.position.set(0, 0, st(PROP_S));
    propMount.rotation.x = -Math.PI / 2;
    group.add(propMount);

    const back = -(SPINNER_BASE_S - PROP_S);
    const len = PROP_S;
    const prof = [];
    const m = lite ? 4 : 7;
    prof.push(new THREE.Vector2(0.0001, back));
    for (let i = 0; i <= m; i += 1) {
      const u = i / m;
      const r = Math.max(0.0012, SPINNER_R * Math.sqrt(1 - u * u));
      prof.push(new THREE.Vector2(r, back + 0.004 + (len - back - 0.004) * u));
    }
    const spinner = new THREE.Mesh(new THREE.LatheGeometry(prof, lite ? 10 : 16), propMat);
    spinner.name = 'spinner';
    spinner.castShadow = shade;
    propMount.add(spinner);

    const rotor = new THREE.Group();
    propMount.add(rotor);
    /* Three blades a third of a turn apart, each pitched so its leading
     * edge, the one it turns toward, stands forward. */
    const bladeGeo = bladeGeometry(lite ? 5 : 8);
    bladeGeo.rotateX(-Math.PI / 2);
    bladeGeo.rotateZ((16 * Math.PI) / 180);
    const three = [0, 1, 2].map((i) => bladeGeo.clone().rotateY((i * 2 * Math.PI) / 3));
    const bladeMesh = new THREE.Mesh(mergeGeometries(three, false), propMat);
    bladeMesh.castShadow = shade;
    rotor.add(bladeMesh);
    blades.push(rotor);

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(PROP_R, PROP_R, 0.0012, lite ? 16 : 32),
      new THREE.MeshBasicMaterial({
        color: 0x4a4d50,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        fog,
      }),
    );
    disc.renderOrder = 1;
    propMount.add(disc);
    discs.push(disc);
  }
  for (let k = 1; k < 4; k += 1) {
    const none = new THREE.Group();
    group.add(none);
    blades.push(none);
    const noDisc = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, fog }),
    );
    noDisc.visible = false;
    group.add(noDisc);
    discs.push(noDisc);
  }

  /*
   * The lights, the kit's LEDs on the four slots the pose driver walks: the
   * navigation lights in the drooped tips' leading edges, red left and
   * green right, the red beacon on the turtledeck behind the wing, and the
   * white landing light in the left wing's leading edge.
   */
  const tipLamp = (sign) => {
    const p = wingAt(sign * (HALF - 0.012))(0.04, 1);
    p.y -= 0.004;
    return p;
  };
  const lampAt = [
    { p: tipLamp(-1), base: 0xff3a30, front: true },
    { p: tipLamp(1), base: 0x3aff7a, front: false },
    { p: fusePoint(0.600, 0, 0.004), base: 0xff2a20, front: false },
    { p: wingAt(-0.22)(0.0, 1).add(new THREE.Vector3(0, -0.006, -0.012)), base: 0xfff4dc, front: true },
  ];
  for (const at of lampAt) {
    const ledMat = new THREE.MeshBasicMaterial({ color: at.base, fog });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 8, 6), ledMat);
    led.position.copy(at.p);
    group.add(led);
    leds.push({ mesh: led, mat: ledMat, front: at.front, base: at.base });
  }

  /*
   * Pose the surfaces. Radians: left aileron, right aileron, elevator,
   * rudder. Ailerons and elevator positive trailing edge up, rudder
   * positive trailing edge to the left, and the tailwheel with it. Every
   * axis points +x or +y (see hinged), and about either a negative turn
   * carries an aft point up or to -x, so each turns by the negated angle.
   * The flaps are the other way round: positive is trailing edge DOWN, the
   * way a flap is lowered, so they turn by the angle itself.
   */
  const q = new THREE.Quaternion();
  function setSurfaces(leftRad, rightRad, elevRad = 0, rudRad = 0) {
    leftAil.pivot.quaternion.copy(q.setFromAxisAngle(leftAil.axis, -leftRad));
    rightAil.pivot.quaternion.copy(q.setFromAxisAngle(rightAil.axis, -rightRad));
    elevator.pivot.quaternion.copy(q.setFromAxisAngle(elevator.axis, -elevRad));
    rudder.pivot.quaternion.copy(q.setFromAxisAngle(rudder.axis, -rudRad));
    tailwheel.pivot.quaternion.copy(q.setFromAxisAngle(tailwheel.axis, -rudRad));
  }
  function setFlaps(rad) {
    leftFlap.pivot.quaternion.copy(q.setFromAxisAngle(leftFlap.axis, rad));
    rightFlap.pivot.quaternion.copy(q.setFromAxisAngle(rightFlap.axis, rad));
  }

  /*
   * On floats: everything drawn so far is the aircraft about its own CG,
   * and the floats lower the CG TIMBER_FLOAT_DZ, so it all goes up that
   * much in a group of its own and the float set is drawn in the new frame
   * under it, the struts to the belly where the gear's legs were and under
   * the cabin.
   */
  let floatSet = null;
  if (onFloats) {
    const lifted = new THREE.Group();
    lifted.name = 'timber-on-floats';
    lifted.position.y = TIMBER_FLOAT_DZ;
    while (group.children.length) {
      lifted.add(group.children[0]);
    }
    group.add(lifted);
    const f = TIMBER_FLOATS;
    const belly = (x) => {
      const at = fuseAt(CG_S - x);
      return at.yc - at.h + 0.004 + TIMBER_FLOAT_DZ;
    };
    floatSet = buildFloatSet({
      f,
      struts: f.struts,
      roots: (sign, which) => {
        const x = f.struts[which];
        return new THREE.Vector3(sign * 0.036, belly(x), -x);
      },
      rudder: f.rudder,
      mats: { hull: white, stripe: red, trim: black, metal },
      stripe: true,
      lite,
      shade,
    });
    group.add(floatSet.group);
  }
  const setAll = (leftRad, rightRad, elevRad = 0, rudRad = 0) => {
    setSurfaces(leftRad, rightRad, elevRad, rudRad);
    if (floatSet) {
      floatSet.setRudder(rudRad);
    }
  };
  setAll(0, 0, 0, 0);
  setFlaps(0);

  return {
    group,
    discs,
    blades,
    leds,
    cameraMount,
    stator,
    propSpin: TIMBER_PROP_SPIN,
    setSurfaces: setAll,
    setFlaps,
  };
}
