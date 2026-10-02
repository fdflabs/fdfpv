/*
 * craft.js: the quad's model, and nothing else.
 *
 * It lives on its own because it is SESSION LIVED and the maps are not. The
 * shell builds one craft at boot and re-parents it into whichever map's scene
 * is active, so swapping the race field for the freestyle city does not
 * rebuild the airframe, does not recompile its four cel materials, and cannot
 * leave the shell holding a craft that belongs to a disposed scene.
 *
 * Betaflight motor order is RR FR RL FL with the front at -z, and the numbers
 * here are a real 5 inch machine: a 0.155 m body front to back, motors at
 * 0.0778 m on each axis which is a 0.220 m motor to motor diagonal, and
 * 0.0635 m prop discs which is half of five inches. src/game/collide.js
 * derives CRAFT_R from the same measurements and tests/lib/checks.js asserts
 * the two agree, because this project has shipped a scale error before.
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

import { CRAFT_ARM, CRAFT_PROP_R, CRAFT_HULL_R } from '../game/collide.js';
import { buildHeroCraft } from './herocraft.js';
import { buildWhoopCraft } from './whoopcraft.js';
import { buildSkyCraft } from './skycraft.js';
import { buildCubCraft } from './cubcraft.js';
import { buildGliderCraft } from './glidercraft.js';
import { buildBramorCraft } from './bramorcraft.js';
import { buildSlowStickCraft } from './slowstickcraft.js';
import { buildBombshellCraft } from './bombshellcraft.js';
import { buildKadetCraft } from './kadetcraft.js';
import { buildUglystikCraft } from './uglystikcraft.js';
import { buildTigermothCraft } from './tigermothcraft.js';
import { buildDlgCraft } from './dlgcraft.js';
import { buildF16Craft } from './f16craft.js';
import { buildTimberCraft } from './timbercraft.js';
import { buildP51Craft } from './p51craft.js';
import { buildZagiCraft } from './zagicraft.js';
import { buildCombatDrone } from './combatcraft.js';
import { buildStrikerCraft, buildStrikerLauncher } from './strikercraft.js';
import { bodyPosToModel } from './frame.js';
import { airframeById, currentAirframeId } from '../../configs/airframes.js';
import { combatChoice, combatFor, propulsionOf } from '../../configs/combat.js';
import { dressLivery } from './livery.js';
import { dressParts } from './partsfit.js';

/*
 * ONE BUILDER PER SILHOUETTE, NOT ONE WITH FLAGS. A five inch is four arms
 * and four open discs and what you see is the X; a whoop is a moulded tub
 * with four holes in it; a wing is one swept surface with a prop behind
 * it. They do not share a silhouette, so they do not share a builder. See
 * src/render/whoopcraft.js and src/render/bramorcraft.js.
 *
 * Exported so the ghost and the settings studio build the same machine the
 * shell flies, from the one table, rather than each keeping its own idea of
 * which id draws what.
 */
const BUILDERS = {
  whoop65: buildWhoopCraft,
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
  nrj1490: buildDlgCraft,
  p51d1450: buildP51Craft,
  zagi1219: buildZagiCraft,
  timber1500: buildTimberCraft,
  /* On floats, the same builders with the float set in place of the gear. */
  timber1500f: (opts) => buildTimberCraft({ ...opts, floats: true }),
  cub1400f: (opts) => buildCubCraft({ ...opts, floats: true }),
  /* The combat quads: one builder, its frame by airframe, and the pilot's
   * resolved choice in opts.combat (docs/COMBAT-DRONES.md section 4); a
   * caller that passes none draws what a pilot who never chose flies. */
  '7inch': combatBuilder('7inch'),
  '10inch': combatBuilder('10inch'),
  interceptor: combatBuilder('interceptor'),
  striker2500: buildFlownStriker,
};

function combatBuilder(id) {
  return (opts) => {
    const af = airframeById(id);
    return buildCombatDrone({ ...opts, frame: af.combat.frame, ...(opts.combat ?? combatChoice(af, null)) });
  };
}

/*
 * The Striker a pilot flies (docs/COMBAT-DRONES.md section 7): the war's
 * drawing, src/render/strikercraft.js, on the propulsion chosen and with
 * the whip when it is fitted. That drawing is about the war's pose point;
 * the plant's origin is the CG, so every part moves by where the drawing's
 * origin sits about the CG (the propulsion's `drawing_m`, in the body
 * frame, turned into the model's by src/render/frame.js). Its launch rail
 * is built about the CG once they have moved, as the Bramor's catapult is.
 */
function buildFlownStriker(opts) {
  const af = airframeById('striker2500');
  const choice = opts.combat ?? combatChoice(af, null);
  const craft = buildStrikerCraft({ ...opts, propulsion: propulsionOf(af, choice).id, antenna: choice.accessories.includes('whip') });
  const [ox, oy, oz] = bodyPosToModel(...propulsionOf(af, choice).drawing_m);
  for (const part of craft.group.children) {
    part.position.x += ox;
    part.position.y += oy;
    part.position.z += oz;
  }
  buildStrikerLauncher(craft, af.catapult, opts);
  return craft;
}

export function craftBuilderFor(airframeId) {
  return BUILDERS[airframeById(currentAirframeId(airframeId)).id] ?? buildHeroCraft;
}

/*
 * The published dimensions of the airframe, in metres. A FUNCTION since the
 * whoop landed, because CRAFT_ARM and CRAFT_PROP_R are live bindings that
 * move with the seated aircraft (see src/game/collide.js) and a frozen
 * object literal would have captured the five inch's numbers at import time
 * and then quietly reported them for a machine a third of the size.
 *
 * Exported so a scale check can assert what the geometry actually measures
 * against what the project claims, rather than against a number typed a
 * second time.
 */
export function craftDims() {
  const dims = airframeById(currentCraftId).dims;
  return {
    bodyLength: dims.bodyLength,
    bodyWidth: dims.bodyWidth,
    bodyHeight: dims.bodyHeight,
    /* Per axis offset of a motor, so the motor sits CRAFT_ARM from the
     * centre on the diagonal. Derived, not typed: src/game/collide.js owns
     * the arm and the prop radius, and plant.c's arm_x is the same
     * CRAFT_ARM / sqrt(2). */
    motorArm: CRAFT_ARM / Math.SQRT2,
    propRadius: CRAFT_PROP_R,
    /* The outermost radius about a motor, which is the blade on a naked
     * airframe and the duct on a ducted one. The sweep is derived from it
     * rather than from the blade, so a scale check reads the hull the
     * collider actually sweeps. */
    hullRadius: CRAFT_HULL_R,
    motorDiagonal: CRAFT_ARM * 2,
    sweepRadius: CRAFT_ARM + CRAFT_HULL_R,
  };
}

/*
 * CRAFT_DIMS stays, as the five inch's numbers, because tests/lib/checks.js
 * imports it by that name and tests/ is not this side's to edit. It is
 * correct for the aircraft the checks fly, which is the default one.
 */
export const CRAFT_DIMS = {
  bodyLength: 0.155,
  bodyWidth: 0.088,
  bodyHeight: 0.034,
  motorArm: 0.110 / Math.SQRT2,
  propRadius: 0.0635,
  hullRadius: 0.0635,
  motorDiagonal: 0.220,
  sweepRadius: 0.1735,
};

/* Which aircraft buildCraft last built. The shell asks for a rebuild by
 * name; this is what craftDims reports against in between. */
let currentCraftId = '5inch';

/* `combat` is a combat quad's resolved { payload, accessories }, which every
 * other builder ignores. With none, the pilot's own seated choice
 * (configs/combat.js combatFor), because the shell's swap passes none and
 * the flown model must be the loadout the plant flies. */
export function buildCraft(airframeId = '5inch', combat = undefined) {
  /*
   * The airframe is MODELLED at its true size and DRAWN at 1/WORLD_SCALE of
   * it, because the world it flies in is WORLD_SCALE times its own scale
   * (src/render/frame.js). That ratio is 1 now, so the drawn craft is a real
   * machine and the group scale is the identity; the seam stays because it
   * is the one place the world's ratio touches the model, and check 15
   * asserts the declared ratio reached it.
   */
  currentCraftId = airframeById(airframeId).id;
  const build = craftBuilderFor(currentCraftId);
  /* In the pilot's paint for it (src/render/livery.js), before a map's
   * look restyles it, so the look's twins take the painted colours. */
  return dressParts(dressLivery(build({
    name: 'craft',
    fog: true,
    worldScale: true,
    measure: true,
    combat: combat ?? combatFor(currentCraftId) ?? undefined,
  }), currentCraftId), currentCraftId);
}
