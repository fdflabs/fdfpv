/*
 * parts.js: the names and layouts of the crash physics ABI, for the shell,
 * the crash suite and the tests. The PART TABLES THEMSELVES ARE NOT HERE:
 * they live in the physics module (src/native/crash_parts.h), because the
 * plant resolves contacts against them and nothing in the physics path may
 * be JavaScript. A host reads a table from the module it is flying with
 * sim_part_info and sim_part_hull, so this file and the module cannot
 * disagree about a part; what this file holds is only what the numbers in
 * src/native/sim_abi.h mean, and scripts/crash-core-selftest.js holds the
 * two against each other.
 *
 * docs/CRASH-STAGE1.md is the contract in prose.
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

/* Buffer sizes, doubles. */
export const PARTS_MAX = 24;
export const PART_PTS_MAX = 8;
export const PART_INFO_DOUBLES = 24;
export const PART_STATE_DOUBLES = 24;
export const DAMAGE_EVENT_DOUBLES = 16;
export const DAMAGE_EVENTS_MAX = 64;
export const FREE_BODIES_MAX = 12;
export const OBSTACLES_MAX = 64;
export const TREES_MAX = 32;

/* SIM_PART_*, by id. */
export const PART_KINDS = [
  'frame', 'arm', 'motor', 'prop', 'battery', 'camera', 'antenna', 'canopy',
  'fuselage', 'wing', 'hstab', 'fin', 'aileron', 'elevator', 'rudder', 'elevon',
  'gear', 'float', 'boom', 'duct',
];

/* SIM_MAT_*, by id. */
export const MATERIALS = [
  'cf-plate', 'cf-tube', 'epo', 'epp', 'nylon-gf', 'alu', 'lipo', 'pc',
  'electronics', 'wire', 'ply', 'balsa',
];

/* SIM_SURF_*, by id: what a shell passes to sim_set_ground_material and
 * sim_contact_at_mat. 'default' is today's contact. */
export const SURFACES = [
  'default', 'grass', 'dirt', 'asphalt', 'concrete', 'rock', 'snow', 'wood',
  'metal', 'pvc', 'foliage', 'water', 'sand',
];
export const SURFACE = Object.fromEntries(SURFACES.map((name, id) => [name, id]));

/* SIM_PART_ATTACHED and on, part state [0]. */
export const PART_STATUS = ['attached', 'free', 'resting', 'retired'];

/* SIM_EVENT_*, event [2]. Index 0 is unused. */
export const EVENT_TYPES = ['', 'break', 'crush', 'chip', 'bend', 'knock', 'crack', 'settle', 'water', 'tree'];

/* SIM_DMG_*, sim_damage_flags(). */
export const DAMAGE_FLAGS = {
  cameraKnocked: 1 << 0,
  cameraLost: 1 << 1,
  antennaLost: 1 << 2,
  batteryEjected: 1 << 3,
  propLost: 1 << 4,
  propChipped: 1 << 5,
  armBent: 1 << 6,
  armLost: 1 << 7,
  wingLost: 1 << 8,
  surfaceLost: 1 << 9,
  canopyLost: 1 << 10,
  gearLost: 1 << 11,
  floatLost: 1 << 12,
  tailLost: 1 << 13,
  crushed: 1 << 14,
  inTree: 1 << 15,
  inWater: 1 << 16,
  motorLost: 1 << 17,
};

/* Part info [n], sim_part_info. */
export const INFO = {
  kind: 0, parent: 1, material: 2, motor: 3, mass: 4, cg: 5, joint: 8,
  momentLimit: 11, forceLimit: 12, stiffness: 13, crushStress: 14,
  crushArea: 15, crushDepth: 16, points: 17, boxMin: 18, boxMax: 21,
};

/* Part state [n], sim_parts_state. */
export const STATE = {
  status: 0, damage: 1, pos: 2, quat: 5, vel: 9, omega: 12, body: 15,
  peak: 16, deform: 17, energy: 20, kind: 21, parent: 22,
};

/* Event [n], sim_damage_events. */
export const EVENT = {
  step: 0, part: 1, type: 2, ratio: 3, force: 4, moment: 5, energy: 6,
  point: 7, normal: 10, closing: 13, surface: 14, damage: 15,
};

/* A part's name for a person: its kind, and where it is when it has a
 * twin. The body frame's x is forward and y is left. A quad's arms, motors
 * and props are front or rear as well as left or right. */
const QUAD_CORNER = new Set(['arm', 'motor', 'prop']);
export function partLabel(kindId, cgX, cgY, quad = false) {
  const kind = PART_KINDS[kindId] ?? `kind${kindId}`;
  if (Math.abs(cgY) < 1e-3) {
    return kind;
  }
  const side = cgY > 0 ? 'left' : 'right';
  if (quad && QUAD_CORNER.has(kind)) {
    return `${kind} ${cgX > 0 ? 'front' : 'rear'} ${side}`;
  }
  return `${kind} ${side}`;
}
