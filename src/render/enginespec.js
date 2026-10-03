/*
 * enginespec.js: which engine model an aircraft is heard as, and its own
 * numbers on that model, from the configs and nothing else. Pure data: no
 * audio, no DOM, so the shell (src/main.js), the offline renderers
 * (tools/audio/drive.js) and its selftest (npm run audio:specs) all ask the
 * same function.
 *
 *   engineSpecFor(airframeId, power, combat)
 *     -> { model, params }   for MotorAudio.setEngineSpec
 *
 * `power` is settings.power (configs/power.js powerChoice reads it, the
 * quads' motor and prop included), `combat` settings.combat (the Striker's
 * engine). Models are src/render/engine-worklet.js MODELS; params are the
 * keys its MODEL_PARAMS allows.
 *
 * Where a number comes from:
 *   blades   a quad's prop (configs/motors.js props `blades`), a plane's
 *            power option (configs/power.js `blades`); the hangar's own
 *            prop is MotorAudio.setBladeScale on top, as before
 *   poles    14, the 12N14P every quad motor here is (2207 to 3115, 22 to
 *            31 mm stators) and every outrunner on the planes; a 65 mm
 *            whoop's 0702 is 12; the F-16's fan inrunner is 4 (the
 *            worklet's edf model). ASSUMED by class: no config names them.
 *   rpmRef   a quad's hover rpm, measured in the plant at 4.0 V a cell
 *            (HOVER_RPM below, npm run audio:specs flies it again and
 *            fails when it moves); a plane's cruise rpm, three quarters
 *            of its full rpm (0.85 of the option's no load figure, the
 *            plant's own rule)
 *   washV    the induced velocity at hover, sqrt(T / (2 rho A)) with T a
 *            quarter of the weight and A the prop disc (configs/airframes.js
 *            grams and dims.propR)
 *   idleRpm  a glow engine's idle (configs/power.js `idle`, a fraction of
 *            full rpm)
 *   windRef, windGain  a glider's air, which is its whole sound
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

import { airframeById } from '../../configs/airframes.js';
import { hasMotors, motorChoice, propOption } from '../../configs/motors.js';
import { choosesPower, powerChoice, powerOption } from '../../configs/power.js';
import { combatChoice, propulsionOf } from '../../configs/combat.js';

/* Hover rpm in the plant, stock build, 4.0 V a cell: measured by
 * tools/audio/specs-selftest.js, which fails if the plant moves them. */
export const HOVER_RPM = { '5inch': 9407, '7inch': 8666, '10inch': 5049, interceptor: 6534 };

/*
 * THE WHOOP flies the five inch's plant in a hall built larger
 * (configs/airframes.js MICRO), so the RPM it reports is a five inch's.
 * What a pilot hears from a 65 mm whoop is its own motors: 0702 class
 * on 31 mm four blade props hover near 30,000 rpm, so the plant's rpm is
 * heard this many times faster (ESTIMATED from the class's published
 * hover figures; no bench of this whoop exists).
 */
export const WHOOP_RPM_SCALE = 3.2;
const WHOOP_BLADES = 4;

const RHO = 1.225;
const G = 9.80665;

function washV(grams, propR) {
  const t = ((grams / 1000) * G) / 4;
  return Math.sqrt(t / (2 * RHO * Math.PI * propR * propR));
}

export function engineSpecFor(airframeId, power, combat) {
  const af = airframeById(airframeId);
  if (!af) {
    throw new Error(`enginespec: no airframe ${airframeId}`);
  }
  if (af.combat && af.combat.propulsion) {
    const pushed = propulsionOf(af, combatChoice(af, combat && combat[af.id]));
    return { model: pushed && pushed.id === 'jet' ? 'turbojet' : 'boxer2', params: null };
  }
  if (!af.fixedWing) {
    if (af.id === 'whoop65') {
      const base = airframeById('5inch');
      return {
        model: 'quad',
        params: {
          motors: 4, blades: WHOOP_BLADES, poles: 12, rpmScale: WHOOP_RPM_SCALE,
          rpmRef: HOVER_RPM['5inch'] * WHOOP_RPM_SCALE,
          washV: washV(base.grams, base.dims.propR),
        },
      };
    }
    if (!hasMotors(af.id) || !HOVER_RPM[af.id]) {
      throw new Error(`enginespec: no motors or hover rpm for the quad ${af.id}`);
    }
    const choice = motorChoice(af.id, power);
    const prop = propOption(af.id, choice.prop);
    return {
      model: 'quad',
      params: {
        motors: 4, blades: prop.blades, poles: 14, rpmRef: HOVER_RPM[af.id],
        washV: washV(af.grams, af.dims.propR),
      },
    };
  }
  /* A plane with no power system at all (the DLG): nothing turns, so the
   * engine is silent by its own rule and the air is the whole sound, so
   * the air is set up to be heard at a glider's speeds: unity at 15 m/s
   * where a powered plane's is 40, and 15.6 dB up (ESTIMATED, set so a
   * 7 m/s glide is quiet but there, docs/AUDIO.md). */
  if (!choosesPower(af.id)) {
    return { model: 'wing', params: { windRef: 15, windGain: 6 } };
  }
  const opt = powerOption(af.id, powerChoice(af.id, power).option);
  const full = 0.85 * opt.rpmNoLoad;
  if (opt.kind === 'glow') {
    return {
      model: opt.voice === 'glow4' ? 'glow4' : 'glow2',
      params: { blades: opt.blades, rpmRef: 0.75 * full, idleRpm: opt.idle * full },
    };
  }
  if (opt.voice === 'edf') {
    return { model: 'edf', params: { blades: opt.blades, rpmRef: 0.75 * full } };
  }
  return { model: 'wing', params: { blades: opt.blades, poles: 14, rpmRef: 0.75 * full } };
}
