/*
 * hangar-parts.js: what the hangar's Parts tab (src/ui/hangar-parts.js)
 * fits to a plane, and what each does to the plant: the prop, the add-ons
 * and the tape over a part the last crash broke. Data and plain arithmetic
 * only, the same in Node and every browser; the drawing is
 * src/render/partsfit.js, and it draws each thing where this file puts its
 * mass.
 *
 * THE CONTRACT
 *
 *   settings.parts[airframeId] = { prop, addons, damage }
 *     prop    'stock' (the power option's own prop) or an id in PROPS
 *     addons  ids in ADDONS that fit the plane, in ADDON_ORDER
 *     damage  null, or the last crash's broken parts: { boxes, parents,
 *             parts }. boxes is every part's hull box ([lo, hi], body
 *             frame, m) and parents its parent part, so the drawing can
 *             find a part and what hangs off it; parts is the
 *             broken ones, { i, kind, cg, mass, joint, state }, state
 *             'broken' until the pilot tapes it ('taped'). Repair removes
 *             the entry.
 *   normaliseParts(stored) validates a stored map: an unknown plane, prop
 *   or add-on is dropped, and a damage record with anything malformed in
 *   it is dropped whole. A plane with nothing fitted and nothing broken
 *   has no entry, so the settings of a pilot who never opened the tab are
 *   what they were.
 *
 *   partsPowerBlock(id, block) is the sim_set_power block with the chosen
 *   prop's thrust, pitch speed and current or rpm laid over it (the power
 *   option's own block untouched for the stock prop), and addonParams the
 *   sim_set_addons block (null for nothing fitted, taped or swapped). Both
 *   are between runs, like the power choice.
 *
 * A BROKEN PART THAT IS NEITHER REPAIRED NOR TAPED flies as the shell has
 * always flown the next run: whole. The record stays in the hangar until
 * the pilot deals with it, so the crash can be looked at and the repair
 * chosen, but not dealing with it costs nothing; taping it is the choice
 * to fly with the patch.
 *
 * Positions are the plant's body frame: x forward, y left, z up, metres
 * from the table's CG. Every combination this file allows moves the CG
 * under 2 cm (scripts/parts-check.js holds it): the plant moves what it
 * samples with the CG, and only the crash part table's boxes stay put.
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

import { POWER, SIM_POWER } from './power.js';
import { PART_KINDS } from './parts.js';
import { PROP_ESTIMATES } from './prop-estimates.js';
import { MOTORS, hasMotors } from './motors.js';
import { normaliseWearRecord } from './wear.js';

/* sim_abi.h's SIM_ADDON_* layout. */
export const SIM_ADDON = { MASS: 0, CG: 1, CDA: 4, DRAG: 5, WHEEL_R: 8, ROLL_K: 9 };
export const SIM_ADDON_DOUBLES = 10;

const OZ = 0.028349523125;
const APC = 'https://www.apcprop.com/product/';
const APC_DATA = 'https://www.apcprop.com/files/PER3_';

/*
 * APC's published weights, ounces, from each prop's product page, for the
 * props below and the proxies that stand in for each option's own.
 */
const APC_OZ = {
  '11x7E-3': 1.09, '11x7E': 0.81, '10x7E': 0.71, '11x55E': 0.81, '11x8E': 0.81, '12x6E': 0.95,
  '13x8E': 1.09, '12x6': 1.62, '12x7': 1.52, '12x8': 1.69, '11x6': 1.41, '11x7': 1.41, '13x6': 1.69, '7x4': 0.42, '6x4': 0.18,
  '7x3': 0.42, '5x3': 0.21, '8x4E': 0.46, '10x47SF': 0.42, '10x38SF': 0.42, '11x47SF': 0.53,
  '10x6E': 0.71, '12x8E': 0.92, '13x65E': 1.06,
};

/*
 * THE PROXY for each option's own prop: APC's own where APC makes the
 * kit's prop, else APC's nearest in diameter, pitch, blade count and
 * family (E thin electric, SF slow flyer, plain the sport glow prop).
 * E-flite's 11 x 7.5 three blade on the Timber takes APC's 11 x 7E-3,
 * GWS's EP1180 and EP1047 take APC's 11 x 8E and 10 x 4.7SF, and Cox's 7 x
 * 3.5 takes APC's 7 x 4, the nearer pitch of the two APC makes.
 */
const PROXY = {
  '11/7.5/3/electric': '11x7E-3',
  '11/7/2/electric': '11x7E',
  '11/5.5/2/electric': '11x55E',
  '12/6/2/electric': '12x6E',
  '13/8/2/electric': '13x8E',
  '13/6/2/electric': '13x65E',
  '11/8/2/electric': '11x8E',
  '10/4.7/2/electric': '10x47SF',
  '10/6/2/electric': '10x6E',
  '8/4/2/electric': '8x4E',
  '12/8/2/electric': '12x8E',
  '7/3.5/2/glow': '7x4',
  '5/3/2/glow': '5x3',
  '12/6/2/glow': '12x6',
  '11/6/2/glow': '11x6',
  '13/6/2/glow': '13x6',
  '14/7/2/glow': '14x7',
};

export function propProxy(option) {
  const key = `${option.propIn}/${option.pitchIn}/${option.blades}/${option.kind}`;
  const p = PROXY[key];
  if (!p) {
    throw new Error(`no APC proxy for ${key}`);
  }
  return p;
}

/* APC's product pages spell a decimal pitch with a hyphen. */
const APC_SLUG = { '13x65E': '13x6-5e', '11x55E': '11x5-5e', '11x47SF': '11x4-7sf', '10x38SF': '10x3-8sf', '10x47SF': '10x4-7sf' };
function apcProp(id, apc, propIn, pitchIn, blades) {
  return { id, name: `parts.prop.${id}`, apc, propIn, pitchIn, blades, massKg: APC_OZ[apc] * OZ, source: [`${APC}${APC_SLUG[apc] ?? apc.toLowerCase()}/`, `${APC_DATA}${apc}.dat`] };
}

/*
 * PROPS[airframeId]: the first is 'stock', the prop the chosen power
 * option turns (configs/power.js propIn, pitchIn, blades); the rest are
 * APC props of the same diameter or smaller, so no ground clearance the
 * gear was derived for is lost. The Radian's folding prop and the Bramor's
 * (C-Astral publishes neither) have no alternative offered.
 */
const STOCK = { id: 'stock', name: 'parts.prop.stock' };
const TIMBER_PROPS = [STOCK, apcProp('11x7e', '11x7E', 11, 7, 2), apcProp('10x7e', '10x7E', 10, 7, 2)];
const CUB_PROPS = [STOCK, apcProp('11x7e-3', '11x7E-3', 11, 7, 3), apcProp('11x55e', '11x55E', 11, 5.5, 2)];
export const PROPS = {
  timber1500: TIMBER_PROPS,
  timber1500f: TIMBER_PROPS,
  cub1400: CUB_PROPS,
  cub1400f: CUB_PROPS,
  sky1800: [STOCK, apcProp('11x7e-3', '11x7E-3', 11, 7, 3), apcProp('11x8e', '11x8E', 11, 8, 2)],
  slowstick1180: [STOCK, apcProp('11x47sf', '11x47SF', 11, 4.7, 2), apcProp('10x38sf', '10x38SF', 10, 3.8, 2)],
  bombshell1118: [STOCK, apcProp('6x4', '6x4', 6, 4, 2), apcProp('7x3', '7x3', 7, 3, 2)],
  kadet1981: [STOCK, apcProp('12x8', '12x8', 12, 8, 2), apcProp('11x7', '11x7', 11, 7, 2)],
  uglystik1567: [STOCK, apcProp('12x7', '12x7', 12, 7, 2), apcProp('12x8', '12x8', 12, 8, 2)],
  tigermoth1803: [STOCK, apcProp('13x6', '13x6', 13, 6, 2), apcProp('12x8', '12x8', 12, 8, 2)],
  extra3d1308: [STOCK, apcProp('13x8e', '13x8E', 13, 8, 2), apcProp('12x6e', '12x6E', 12, 6, 2)],
  hercules3077: [STOCK, apcProp('11x7e', '11x7E', 11, 7, 2), apcProp('12x6e', '12x6E', 12, 6, 2)],
  radian2000: [STOCK],
  bramor2300: [STOCK],
  /* A fan is its duct's: Freewing sells the one rotor for it. */
  f16878: [STOCK],
  /* FMS's four blade has no APC counterpart to anchor another prop's
   * figures on, and a two blade would change what the pilot sees turning
   * on the nose: none offered. */
  p51d1450: [STOCK],
  /* Zagi's spoon shaped carbon 5 x 5 flew 10 to 15 mph faster than four
   * other makers' 5 x 5s on the same Zagi (zagi.com's propeller page), and
   * APC's own figures cannot say by how much: none offered. */
  zagi1219: [STOCK],
};

/* The planes the tab serves: every fixed wing the picker offers. */
export const PARTS_PLANES = Object.keys(PROPS);

/*
 * WHERE THINGS GO on each plane, body frame, from the drawn models
 * (src/render/*craft.js, measured by ray against the built meshes):
 *   prop   the prop's hub
 *   belly  the underside below the CG, where a pod hangs
 *   tail   the fuselage's aft end at its bottom, where smoke leaves
 *   tank   where the smoke tank and pump ride: on the CG, as a smoke
 *          tank is fitted so the balance does not move as the oil burns,
 *          a centimetre aft where the bay is, in the fuselage (the
 *          Bramor's and the Skyhunter's pod, the Slow Stick's stick)
 *   led    one wing's light strip, from inboard to the tip under the
 *          leading edge, [x, y, z] twice; the other wing mirrors it
 */
export const ANCHORS = {
  timber1500: { prop: [0.29, 0, 0], belly: [0, 0, -0.07], tail: [-0.66, 0, -0.03], tank: [-0.01, 0, -0.03], led: [[0.053, 0.23, 0.072], [0.037, 0.70, 0.068]] },
  timber1500f: { prop: [0.29, 0, 0.027], belly: [0, 0, -0.043], tail: [-0.66, 0, -0.003], tank: [-0.01, 0, -0.003], led: [[0.054, 0.23, 0.098], [0.038, 0.70, 0.094]] },
  cub1400: { prop: [0.23, 0, 0.002], belly: [0, 0, -0.056], tail: [-0.58, 0, -0.01], tank: [-0.01, 0, -0.02], led: [[0.036, 0.21, 0.100], [0.036, 0.63, 0.107]] },
  cub1400f: { prop: [0.23, 0, 0.028], belly: [0, 0, -0.030], tail: [-0.58, 0, 0.016], tank: [-0.01, 0, 0.006], led: [[0.038, 0.21, 0.126], [0.038, 0.63, 0.133]] },
  sky1800: { prop: [-0.268, 0, 0.032], belly: [0.10, 0, -0.095], tail: [-0.25, 0, -0.07], tank: [-0.01, 0, -0.04], led: [[0.061, 0.27, 0.048], [0.061, 0.81, 0.074]] },
  radian2000: { prop: [0.293, 0, -0.008], belly: [0, 0, -0.040], tail: [-0.70, 0, 0.012], tank: [-0.01, 0, -0.01], led: [[0.040, 0.30, 0.039], [-0.028, 0.90, 0.111]] },
  /* The F-16's `prop` is its fan, inside the fuselage behind the wing. */
  f16878: { prop: [-0.24, 0, 0], belly: [0, 0, -0.061], tail: [-0.59, 0, -0.038], tank: [-0.01, 0, -0.02], led: [[0.080, 0.13, -0.006], [-0.139, 0.40, -0.006]] },
  bramor2300: { prop: [-0.35, 0, 0.087], belly: [0, 0, -0.044], tail: [-0.19, 0, 0.0], tank: [-0.01, 0, 0.0], led: [[0.008, 0.35, -0.004], [-0.276, 1.03, 0.004]] },
  slowstick1180: { prop: [0.31, 0, 0], belly: [0.02, 0, -0.007], tail: [-0.56, 0, -0.012], tank: [-0.01, 0, -0.01], led: [[0.080, 0.18, 0.064], [0.080, 0.41, 0.114]] },
  bombshell1118: { prop: [0.166, 0, -0.005], belly: [0.02, 0, -0.064], tail: [-0.60, 0, -0.03], tank: [-0.01, 0, -0.03], led: [[0.042, 0.17, 0.075], [0.042, 0.50, 0.146]] },
  kadet1981: { prop: [0.441, 0, -0.013], belly: [0, 0, -0.159], tail: [-0.93, 0, -0.13], tank: [-0.01, 0, -0.08], led: [[0.075, 0.30, 0.093], [0.075, 0.89, 0.139]] },
  uglystik1567: { prop: [0.4064, 0, -0.0043], belly: [0, 0, -0.053], tail: [-0.785, 0, -0.053], tank: [-0.01, 0, -0.03], led: [[0.117, 0.15, 0.045], [0.117, 0.70, 0.082]] },
  tigermoth1803: { prop: [0.3808, 0, 0.0074], belly: [0, 0, -0.122], tail: [-1.035, 0, -0.073], tank: [-0.01, 0, -0.04], led: [[0.17, 0.15, 0.215], [0.12, 0.80, 0.245]] },
  extra3d1308: { prop: [0.302, 0, 0], belly: [0, 0, -0.104], tail: [-0.80, 0, -0.03], tank: [-0.01, 0, -0.04], led: [[0.084, 0.20, -0.078], [0.055, 0.62, -0.074]] },
  hercules3077: { prop: [0.315, 0.3846, 0.0998], belly: [0, 0, -0.195], tail: [-1.25, 0, 0.05], tank: [-0.05, 0, -0.13], led: [[0.10, 1.40, 0.175], [0.10, 0.90, 0.17]] },
  p51d1450: { prop: [0.3578, 0, 0.0129], belly: [0, 0, -0.066], tail: [-0.77, 0, 0.004], tank: [-0.01, 0, -0.03], led: [[0.102, 0.20, -0.043], [0.074, 0.70, 0.006]] },
  zagi1219: { prop: [-0.110, 0, 0.052], belly: [0, 0, -0.012], tail: [-0.10, 0, -0.005], tank: [-0.01, 0, 0.0], led: [[0.140, 0.10, -0.004], [-0.105, 0.58, -0.002]] },
};

/* A body frame point: one mass or drag and where it is. */
const pt = (at, kg, cda = 0) => ({ at, kg, cda });

/* The led strip's length on one wing, m. */
function ledRun(id) {
  const [a, b] = ANCHORS[id].led;
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}
function mid(a, b) {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

/*
 * THE ADD-ONS. Each has `fits(id)`, `points(id)` (the masses and drag
 * areas it adds, body frame) and `source`. Where no maker publishes a
 * figure it is ESTIMATED here from what the thing is made of, and says so.
 *
 * TUNDRA TYRES, the Cub: E-flite's 108 mm (4.25 in) foam tundra wheels,
 * the Timber's own (docs/TIMBER-STAGE1.md, TIMBER_DIMS), on the Cub's
 * axles in place of its 70 mm wheels. ESTIMATED mass: 30 g a wheel on its
 * hub against 12 g, a moulded foam tyre of about 0.1 g/cc over a third of
 * its 300 cc envelope. Drag: the Timber's own rule for its tyres, a C_D of
 * 0.25 on the frontal area (diameter by width, 108 by 38 mm against the
 * Cub's 70 by 22), 0.00128 m^2 for the pair. Rolling resistance on
 * yielding ground goes as sqrt(sinkage / diameter) (plant.c, ROLLING
 * RESISTANCE BY SURFACE), so the bigger wheel rolls at sqrt(70 / 108) of
 * the smaller's at the same sinkage: 0.805, on grass and everywhere else.
 * The Timber ships on these tyres and is not offered them again.
 *
 * FPV CAMERA POD: DJI's O3 Air Unit, 36.4 g with its camera, transmission
 * module and antennas (DJI's specifications), in a printed pod under the
 * belly, ESTIMATED 15 g; 40 by 40 mm frontal at a faired body's C_D of
 * 0.30 (Hoerner, Fluid-Dynamic Drag, 3-12), 0.00048 m^2.
 *
 * LED NIGHT LIGHTS: a strip of 5050 LEDs at 60 a metre under each wing's
 * leading edge, and the controller. ESTIMATED 15 g a metre (a 10 mm flex
 * board of polyimide and copper, its LEDs and tape) plus 8 g for the
 * controller and leads. Flush on the skin, no drag worth a number.
 *
 * SMOKE SYSTEM: a pump, an electric vaporiser (a glow engine's muffler
 * does the vaporising, so on one the vaporiser is left out) and a tank of
 * smoke oil in the fuselage at the CG, and a nozzle at the tail.
 * ESTIMATED: pump 60 g, vaporiser 40 g, tank 25 g empty; 150 cc of oil,
 * 75 cc on a plane under 1 kg, at 0.85 g/cc, white oil's density; the
 * nozzle, a brass tube, 2 g with 0.0002 m^2 of drag (a 10 mm stub 20 mm
 * long at C_D 1). The oil's burn over a flight is not taken off: it flies
 * full.
 */
const TUNDRA = {
  id: 'tundra',
  fits: (id) => id === 'cub1400',
  points: () => [pt([0.075, 0, -0.1327], 2 * (0.030 - 0.012), 0.25 * 2 * (0.108 * 0.038 - 0.070 * 0.022))],
  wheelR: 0.054,
  rollK: 0.805,
  /* Where the Cub stands on them, scripts/parts-check.js --derive: the
   * plant's settled pose on the strip, as airframes.js gear holds the
   * kit's. */
  gear: { restHeight: 0.1593, restPitch: 12.61 * Math.PI / 180 },
  source: ['docs/TIMBER-STAGE1.md', 'https://www.horizonhobby.com/product/e-flite-turbo-timber-evolution-1.5m-bnf-basic-includes-floats/EFL105250.html'],
};
const POD = {
  id: 'pod',
  fits: () => true,
  points: (id) => [pt([ANCHORS[id].belly[0], 0, ANCHORS[id].belly[2] - 0.025], 0.0364 + 0.015, 0.30 * 0.040 * 0.040)],
  source: ['https://www.dji.com/o3-air-unit/specs'],
};
const LIGHTS = {
  id: 'lights',
  fits: () => true,
  points: (id) => {
    const [a, b] = ANCHORS[id].led;
    const m = mid(a, b);
    return [pt([m[0], 0, m[2]], 2 * 0.015 * ledRun(id) + 0.008)];
  },
  source: ['ESTIMATED'],
};
const SMOKE = {
  id: 'smoke',
  fits: () => true,
  points: (id, massKg) => {
    const glow = POWER[id] && POWER[id][0].kind === 'glow';
    const oil = (massKg < 1 ? 75 : 150) * 0.85 / 1000;
    return [
      pt(ANCHORS[id].tank, 0.060 + (glow ? 0 : 0.040) + 0.025 + oil),
      pt(ANCHORS[id].tail, 0.002, 0.0002),
    ];
  },
  source: ['ESTIMATED'],
};
export const ADDONS = { tundra: TUNDRA, pod: POD, lights: LIGHTS, smoke: SMOKE };
export const ADDON_ORDER = ['tundra', 'pod', 'lights', 'smoke'];

export function addonsFor(id) {
  return ADDON_ORDER.filter((a) => PROPS[id] && ADDONS[a].fits(id));
}

/*
 * TAPE, over a part the last crash broke: three wraps of 50 mm packing
 * tape round it near its joint. ESTIMATED: polypropylene film 50 um at
 * 0.905 g/cc and its adhesive, 65 g/m^2 a layer; the band goes round the
 * part's section, twice its chord plus twice its thickness from its hull
 * box. Its drag is the band's wetted area at a turbulent patch's skin
 * friction over a clean surface's, a C_f 0.005 higher, and a taped panel
 * or boom flies with a crease, 0.0005 m^2 more (ESTIMATED). A prop, a
 * motor, a pack, the camera and its antenna are only replaced: tape does
 * not fly them.
 */
export const TAPE = { width: 0.05, layers: 3, gsm: 65, dCf: 0.005, crease: 0.0005 };
const TAPE_KINDS = new Set(['wing', 'hstab', 'fin', 'aileron', 'elevator', 'rudder', 'elevon', 'boom', 'fuselage', 'canopy', 'gear', 'float', 'frame', 'arm']);
export function tapeable(kind) {
  return TAPE_KINDS.has(PART_KINDS[kind]);
}

/* The band's position on a part: a fifth of the way from its joint to
 * its centre, and the section it wraps: the part's box across its longest
 * axis. */
export function tapeBand(p) {
  const lo = p.lo;
  const hi = p.hi;
  const size = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  let axis = 0;
  for (let a = 1; a < 3; a += 1) {
    if (size[a] > size[axis]) {
      axis = a;
    }
  }
  const centre = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const at = [0, 1, 2].map((a) => p.joint[a] + 0.2 * (centre[a] - p.joint[a]));
  const others = [0, 1, 2].filter((a) => a !== axis);
  const perimeter = 2 * (size[others[0]] + size[others[1]]);
  return { axis, at, perimeter };
}

function tapePoint(p) {
  const band = tapeBand(p);
  const area = TAPE.width * band.perimeter;
  return pt(band.at, area * TAPE.layers * TAPE.gsm / 1000, TAPE.dCf * area + TAPE.crease);
}

/* ------------------------------------------------------------------ */

const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const vec3 = (v, lim = 3) => Array.isArray(v) && v.length === 3 && v.every((x) => finite(x) && Math.abs(x) <= lim);

function normaliseDamage(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.boxes) || !Array.isArray(d.parts) || d.boxes.length > 24) {
    return null;
  }
  if (!d.boxes.every((b) => Array.isArray(b) && b.length === 2 && vec3(b[0]) && vec3(b[1]))) {
    return null;
  }
  /* Parents precede children in every part table, the root's is -1. */
  if (!Array.isArray(d.parents) || d.parents.length !== d.boxes.length
    || !d.parents.every((q, i) => Number.isInteger(q) && (i === 0 ? q === -1 : q >= 0 && q < i))) {
    return null;
  }
  const seen = new Set();
  const parts = [];
  for (const p of d.parts) {
    const ok = p && Number.isInteger(p.i) && p.i > 0 && p.i < d.boxes.length && !seen.has(p.i)
      && Number.isInteger(p.kind) && p.kind >= 0 && p.kind < PART_KINDS.length
      && vec3(p.cg) && vec3(p.joint) && finite(p.mass) && p.mass >= 0 && p.mass < 10
      && (p.state === 'broken' || (p.state === 'taped' && tapeable(p.kind)));
    if (!ok) {
      return null;
    }
    seen.add(p.i);
    parts.push({ i: p.i, kind: p.kind, cg: [...p.cg], mass: p.mass, joint: [...p.joint], lo: [...d.boxes[p.i][0]], hi: [...d.boxes[p.i][1]], state: p.state });
  }
  if (!parts.length) {
    return null;
  }
  return { boxes: d.boxes.map((b) => [[...b[0]], [...b[1]]]), parents: [...d.parents], parts };
}

/* A part and every part joined under it, which leave together. */
export function partSubtree(damage, i) {
  const out = [i];
  for (let k = i + 1; k < damage.parents.length; k += 1) {
    if (out.includes(damage.parents[k])) {
      out.push(k);
    }
  }
  return out;
}

/* One plane's entry, valid, or null for nothing fitted, nothing broken
 * and nothing worn. `wear` is career and war's (configs/wear.js), left
 * out when there is none; a quad has an entry for its wear alone. */
export function normalisePlane(id, e) {
  if (!(PROPS[id] || hasMotors(id)) || !e || typeof e !== 'object' || Array.isArray(e)) {
    return null;
  }
  const props = PROPS[id] || [STOCK];
  const prop = props.some((p) => p.id === e.prop) ? e.prop : 'stock';
  const fit = addonsFor(id);
  const addons = Array.isArray(e.addons) ? fit.filter((a) => e.addons.includes(a)) : [];
  const damage = PROPS[id] ? normaliseDamage(e.damage) : null;
  const wear = normaliseWearRecord(e.wear);
  if (prop === 'stock' && !addons.length && !damage && !wear) {
    return null;
  }
  return wear ? { prop, addons, damage, wear } : { prop, addons, damage };
}

/* A stored settings.parts map, validated. */
export function normaliseParts(stored) {
  const out = {};
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return out;
  }
  for (const id of [...PARTS_PLANES, ...Object.keys(MOTORS)]) {
    const e = normalisePlane(id, stored[id]);
    if (e) {
      out[id] = e;
    }
  }
  return out;
}

export function partsEntry(settingsParts, id) {
  return normalisePlane(id, settingsParts && settingsParts[id]) ?? { prop: 'stock', addons: [], damage: null };
}

export function propOf(id, propId) {
  return (PROPS[id] || [STOCK]).find((p) => p.id === propId) ?? STOCK;
}

/* The prop the plane turns for a choice: the option's own for 'stock'. */
export function propShape(id, option, propId) {
  const p = propOf(id, propId);
  if (p.id !== 'stock') {
    return { propIn: p.propIn, pitchIn: p.pitchIn, blades: p.blades };
  }
  return { propIn: option.propIn, pitchIn: option.pitchIn, blades: option.blades };
}

/* Every mass and drag the choice adds, body frame: the add-ons, the prop's
 * mass over the option's own, and each taped part. */
export function partsPoints(id, entry, option, baseMassKg) {
  const pts = [];
  for (const a of entry.addons) {
    pts.push(...ADDONS[a].points(id, baseMassKg));
  }
  const p = propOf(id, entry.prop);
  if (p.id !== 'stock') {
    pts.push(pt(ANCHORS[id].prop, p.massKg - APC_OZ[propProxy(option)] * OZ));
  }
  for (const d of (entry.damage ? entry.damage.parts : [])) {
    if (d.state === 'taped') {
      pts.push(tapePoint(d));
    }
  }
  return pts;
}

/*
 * The sim_set_addons block for a plane's entry on a power option, or null
 * when it adds nothing (the stock prop, no add-on, nothing taped), which
 * is sim_addons_clear.
 */
export function addonParams(id, entry, option, baseMassKg) {
  const pts = partsPoints(id, entry, option, baseMassKg);
  const tundra = entry.addons.includes('tundra');
  if (!pts.length && !tundra) {
    return null;
  }
  const out = new Float64Array(SIM_ADDON_DOUBLES);
  let m = 0;
  let cda = 0;
  const mr = [0, 0, 0];
  const dr = [0, 0, 0];
  for (const q of pts) {
    m += q.kg;
    cda += q.cda;
    for (let a = 0; a < 3; a += 1) {
      mr[a] += q.kg * q.at[a];
      dr[a] += q.cda * q.at[a];
    }
  }
  out[SIM_ADDON.MASS] = m;
  for (let a = 0; a < 3; a += 1) {
    out[SIM_ADDON.CG + a] = m !== 0 ? mr[a] / m : 0;
    out[SIM_ADDON.DRAG + a] = cda > 0 ? dr[a] / cda : 0;
  }
  out[SIM_ADDON.CDA] = cda;
  out[SIM_ADDON.WHEEL_R] = tundra ? TUNDRA.wheelR : 0;
  out[SIM_ADDON.ROLL_K] = tundra ? TUNDRA.rollK : 1;
  return out;
}

/* Where the plane stands on its gear with the add-ons on: the tundra
 * tyres' pose, or null for the kit's. */
export function partsGear(id, entry) {
  return entry.addons.includes('tundra') ? TUNDRA.gear : null;
}

/*
 * The power block with the chosen prop laid over it: from `block`, the
 * option's own (configs/power.js powerBlock), the thrust, pitch speed and
 * current or full rpm configs/prop-estimates.js derives for the prop on
 * that option. The option's own prop leaves the block as it is.
 */
export function partsPowerBlock(id, optionId, propId, block) {
  const p = propOf(id, propId);
  if (p.id === 'stock') {
    return block;
  }
  const e = PROP_ESTIMATES[id] && PROP_ESTIMATES[id][optionId] && PROP_ESTIMATES[id][optionId][p.id];
  if (!e) {
    throw new Error(`no prop estimate for ${id} ${optionId} ${p.id}`);
  }
  const out = Float64Array.from(block);
  out[SIM_POWER.THRUST] = e.thrustN;
  out[SIM_POWER.PITCH_SPEED] = e.pitchSpeedMs;
  if (e.currentA != null) {
    out[SIM_POWER.CURRENT] = e.currentA;
  }
  if (e.rpmNoLoad != null) {
    out[SIM_POWER.RPM] = e.rpmNoLoad;
  }
  return out;
}

/* What the tab reads out: the mass it adds, g, its drag area, cm^2, and
 * how far it moves the CG, mm (forward and up positive). */
export function partsSummary(id, entry, option, baseMassKg) {
  const block = addonParams(id, entry, option, baseMassKg);
  if (!block) {
    return { grams: 0, dragCm2: 0, cgMm: [0, 0, 0] };
  }
  const m = block[SIM_ADDON.MASS];
  const M = baseMassKg + m;
  return {
    grams: m * 1000,
    dragCm2: block[SIM_ADDON.CDA] * 1e4,
    cgMm: [0, 1, 2].map((a) => (m * block[SIM_ADDON.CG + a] / M) * 1000),
  };
}
