/*
 * craft.js: which model draws which aircraft, and the flown model's
 * published dimensions.
 *
 * The flown craft is session lived: the shell builds it once and moves it
 * into whichever map's scene is up, so changing map neither rebuilds it
 * nor recompiles its materials, and the shell never holds a craft that
 * belongs to a freed scene. Models are drawn at true size; the plant's
 * motor order is Betaflight's (RR FR RL FL) with the nose toward -z.
 * src/game/collide.js owns the arm and prop measurements, and
 * tests/lib/checks.js asserts the drawn model agrees with them.
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

import { CRAFT_ARM, CRAFT_PROP_R, CRAFT_HULL_R } from '../game/collide.js';
import { buildSkyCraft } from './skycraft.js';
import { buildCubCraft } from './cubcraft.js';
import { buildGliderCraft } from './glidercraft.js';
import { buildBramorCraft } from './bramorcraft.js';
import { buildSlowStickCraft } from './slowstickcraft.js';
import { buildBombshellCraft } from './bombshellcraft.js';
import { buildKadetCraft } from './kadetcraft.js';
import { buildUglystikCraft } from './uglystikcraft.js';
import { buildTigermothCraft } from './tigermothcraft.js';
import { buildExtraCraft } from './extracraft.js';
import { buildDlgCraft } from './dlgcraft.js';
import { buildF16Craft } from './f16craft.js';
import { buildTimberCraft } from './timbercraft.js';
import { buildP51Craft } from './p51craft.js';
import { buildZagiCraft } from './zagicraft.js';
import { buildCombatDrone } from './combatcraft.js';
import { buildStrikerCraft, buildStrikerLauncher } from './strikercraft.js';
import { bodyPosToModel } from './frame.js';
import { AIRFRAMES, DEFAULT_AIRFRAME, airframeById, currentAirframeId } from '../../configs/airframes.js';
import { combatChoice, combatFor, propulsionOf } from '../../configs/combat.js';
import { dressLivery, liveryFor } from './livery.js';
import { dressParts } from './partsfit.js';
import { addNavLights } from './navlights.js';

/* A builder on floats: the same airframe with the float set for gear. */
const onFloats = (build) => (opts) => build({ ...opts, floats: true });

/*
 * A combat quad: one builder, the frame by airframe, and the pilot's
 * resolved payload and accessories in opts.combat
 * (docs/COMBAT-DRONES.md section 4); none means what a pilot who never
 * chose flies.
 */
function combatQuad(id) {
  return (opts) => {
    const af = airframeById(id);
    return buildCombatDrone({ ...opts, frame: af.combat.frame, ...(opts.combat ?? combatChoice(af, null)) });
  };
}

/*
 * The Striker as flown (docs/COMBAT-DRONES.md section 7): the war's
 * drawing on the chosen propulsion, with the whip antenna when fitted.
 * The drawing is about the war's pose point and the plant's origin is the
 * CG, so every part moves by the propulsion's drawing offset, turned from
 * the body frame into the model's; the launch rail is then built about the
 * CG, as the Bramor's catapult is.
 */
function flownStriker(opts) {
  const af = airframeById('striker2500');
  const choice = opts.combat ?? combatChoice(af, null);
  const propulsion = propulsionOf(af, choice);
  const built = buildStrikerCraft({ ...opts, propulsion: propulsion.id, antenna: choice.accessories.includes('whip') });
  const [dx, dy, dz] = bodyPosToModel(...propulsion.drawing_m);
  for (const part of built.group.children) {
    part.position.x += dx;
    part.position.y += dy;
    part.position.z += dz;
  }
  buildStrikerLauncher(built, af.catapult, opts);
  return built;
}

/*
 * One builder per silhouette, never one builder with flags: a quad's open
 * X and a wing's swept surface share nothing. Every aircraft in
 * configs/airframes.js has a row (checked when this module loads), so
 * there is no fallback model. The ghost and the Settings studio take their
 * builder from here too, so they draw the machine the shell flies.
 */
const BUILDERS = {
  sky1800: buildSkyCraft,
  cub1400: buildCubCraft,
  radian2000: buildGliderCraft,
  bramor2300: buildBramorCraft,
  slowstick1180: buildSlowStickCraft,
  bombshell1118: buildBombshellCraft,
  f16878: buildF16Craft,
  kadet1981: buildKadetCraft,
  uglystik1567: buildUglystikCraft,
  tigermoth1803: buildTigermothCraft,
  extra3d1308: buildExtraCraft,
  nrj1490: buildDlgCraft,
  p51d1450: buildP51Craft,
  zagi1219: buildZagiCraft,
  timber1500: buildTimberCraft,
  timber1500f: onFloats(buildTimberCraft),
  cub1400f: onFloats(buildCubCraft),
  '7inch': combatQuad('7inch'),
  '10inch': combatQuad('10inch'),
  interceptor: combatQuad('interceptor'),
  striker2500: flownStriker,
};

const unbuilt = AIRFRAMES.filter((af) => !BUILDERS[af.id]);
if (unbuilt.length) {
  throw new Error(`craft: ${unbuilt[0].id} has no builder`);
}

/* The builder for an id, a retired id drawing as its successor. */
export function craftBuilderFor(airframeId) {
  return BUILDERS[airframeById(currentAirframeId(airframeId)).id];
}

/* The aircraft buildCraft last built, which craftDims describes. */
let lastBuiltId = DEFAULT_AIRFRAME;

/*
 * The flown model's dimensions in metres, for scale checks against the
 * geometry. A function, since collide.js's arm and radii are live
 * bindings that follow the seated aircraft: a frozen object would keep the
 * numbers of whatever was seated at import. The motors sit CRAFT_ARM out
 * on the diagonals, so each axis's offset is CRAFT_ARM over root two
 * (plant.c's arm_x); the hull radius is the outermost reach about a motor
 * (the duct on a ducted craft), which is what the collider sweeps.
 */
export function craftDims() {
  const { bodyLength, bodyWidth, bodyHeight } = airframeById(lastBuiltId).dims;
  return {
    bodyLength,
    bodyWidth,
    bodyHeight,
    motorArm: CRAFT_ARM / Math.SQRT2,
    propRadius: CRAFT_PROP_R,
    hullRadius: CRAFT_HULL_R,
    motorDiagonal: 2 * CRAFT_ARM,
    sweepRadius: CRAFT_ARM + CRAFT_HULL_R,
  };
}

/*
 * The flown model of an aircraft, in the pilot's paint and fitted parts,
 * before any map's look restyles it. `combat` is a combat quad's resolved
 * { payload, accessories }; without it, the pilot's own choice for that
 * airframe, since the shell's swap passes none and the drawn loadout must
 * be the one the plant flies. worldScale asks the builder to apply the
 * world's ratio (src/render/frame.js), which is 1.
 */
export function buildCraft(airframeId = DEFAULT_AIRFRAME, combat = undefined) {
  lastBuiltId = airframeById(airframeId).id;
  const look = liveryFor(lastBuiltId);
  const built = craftBuilderFor(lastBuiltId)({
    kit: (look && look.kit) ?? undefined,
    lights: (look && look.lights) ?? undefined,
    name: 'craft',
    fog: true,
    worldScale: true,
    measure: true,
    combat: combat ?? combatFor(lastBuiltId) ?? undefined,
  });
  return addNavLights(dressParts(dressLivery(built, lastBuiltId, look), lastBuiltId), look && look.lights);
}
