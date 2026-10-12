/*
 * stab-straight-derive.js: each stab selftest's Stabilised throw, "and
 * straight", derived. Every one held the cross track after 10 or 12 s
 * under a round figure no derivation gave (10 m, 15 m); the CAP's was the
 * first derived (cap580:derive throwFlight, w36-cap-straight), and this is
 * that throw for every other table, scripts/lib/throwflight.js, flown
 * exactly as the selftest throws it.
 *
 * Default: print each throw's derived cross track. --check: fail where a
 * thresholds file's stab_straight is not what the derivation gives.
 * --write: re-derive each stab_straight, the band from the plant's own
 * agreement with the derivation, flown here on dist/sim.wasm with the
 * drive's torque on its mount and off it (sim_wing_set_mount): the worst
 * cross track between the two along the curve, the same again for what
 * the model leaves out (the pack's drain, the ground's effect), and the
 * derived figure's own rounding, 0.01 m. Run it after a plant change that
 * moves a throw, then --check. npm run stab:straight.
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

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { throwFlight } from './lib/throwflight.js';
import { planeTable } from './lib/wash.js';
import { BRAMOR_CATAPULT } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const AT = [0.5, 1, 2, 3, 5, 10, 12];

/*
 * Each selftest's throw: the table, its thresholds file, the prelude that
 * seats it (tests/lib/wingpilot.js), where and how fast it leaves the hand
 * (z null: the prelude's own launch), the stick (trim: the table's
 * stab_trim_throttle, the stick stab:glide gives for level), how long, and
 * the figure it was held to before.
 */
const THROWS = {
  cub: { table: 'FW_CUB1400', file: 'tests/cub-thresholds.json', prelude: 'cubPrelude', z: 3, speed: 12, duty: 0.75, seconds: 10, note: 'ESTIMATED: the drift is the swirl\'s yaw with no right thrust against it. docs/CUB-STAGE1.md says the swirl "is what the kit\'s built in right thrust is for", but nothing gives its angle: FMS\'s manual for the 1400 mm J-3 V4 (Horizon Hobby, FMM106P Manual EN) names the 3536-850KV motor and no thrust offset, side or down, and the motor\'s mount is moulded into the foam. The table carries none (thrust_yaw 0), so this band holds the plant to its derivation, not to the real Cub, until the angle is measured off an airframe.', was: 'under 15 m off the line, a figure with no source, red at 15.7 m on the combined plant' },
  'cub:acro': { table: 'FW_CUB1400', file: 'tests/cub-thresholds.json', prelude: 'cubPrelude', z: 3, speed: 12, duty: 0.75, seconds: 10, note: 'ESTIMATED: the drift is the swirl\'s yaw with no right thrust against it. docs/CUB-STAGE1.md says the swirl "is what the kit\'s built in right thrust is for", but nothing gives its angle: FMS\'s manual for the 1400 mm J-3 V4 (Horizon Hobby, FMM106P Manual EN) names the 3536-850KV motor and no thrust offset, side or down, and the motor\'s mount is moulded into the foam. The table carries none (thrust_yaw 0), so this band holds the plant to its derivation, not to the real Cub, until the angle is measured off an airframe.', was: 'under 15 m off the line, a figure with no source, red at 15.3 m on the combined plant' },
  p51: { table: 'FW_P51D1450', file: 'tests/p51-thresholds.json', prelude: 'p51Prelude', z: 40, speed: 16, duty: 0.75, seconds: 10, was: 'under 15 m off the line, a figure with no source, red at 16.6 m on the combined plant' },
  'p51:acro': { table: 'FW_P51D1450', file: 'tests/p51-thresholds.json', prelude: 'p51Prelude', z: 40, speed: 16, duty: 0.75, seconds: 10, was: 'under 15 m off the line, a figure with no source' },
  extra: { table: 'FW_EXTRA3D1308', file: 'tests/extra-thresholds.json', prelude: 'extraPrelude', z: 30, speed: 12, duty: 'trim', seconds: 10, note: 'E-flite gives no side or down thrust (docs/EXTRA-STAGE1.md).', was: 'under 15 m off the line, a figure with no source' },
  slowstick: { table: 'FW_SLOWSTICK1180', file: 'tests/slowstick-thresholds.json', prelude: 'slowstickPrelude', z: 3, speed: 6, duty: 0.75, seconds: 10, was: 'under 10 m off the line, a figure with no source, red at 14.5 m since the swirl\'s force at speed (w36-wash-speed 24a09a0d1)' },
  bombshell: { table: 'FW_BOMBSHELL1118', file: 'tests/bombshell-thresholds.json', prelude: 'bombshellPrelude', z: 30, speed: 8.5, duty: 'trim', seconds: 10, was: 'under 10 m off the line, a figure with no source, red at 15.8 m since the swirl\'s force at speed (w36-wash-speed 24a09a0d1)' },
  skyhunter: { table: 'FW_SKY1800', file: 'tests/skyhunter-thresholds.json', prelude: 'skyPrelude', z: 3, speed: 12, duty: 0.65, seconds: 10, was: 'under 15 m off the line, a figure with no source' },
  'skyhunter:acro': { table: 'FW_SKY1800', file: 'tests/skyhunter-thresholds.json', prelude: 'skyPrelude', z: 3, speed: 12, duty: 0.65, seconds: 10, was: 'under 15 m off the line, a figure with no source' },
  zagi: { table: 'FW_ZAGI1219', file: 'tests/zagi-thresholds.json', prelude: 'zagiPrelude', z: null, duty: 0.6, seconds: 12, was: 'under 15 m off the line, a figure with no source' },
  'zagi:acro': { table: 'FW_ZAGI1219', file: 'tests/zagi-thresholds.json', prelude: 'zagiPrelude', z: 150, speed: 15, duty: 0.6, seconds: 10, was: 'under 15 m off the line, a figure with no source' },
  bramor: { table: 'FW_BRAMOR2300', file: 'tests/bramor-thresholds.json', prelude: 'bramorPrelude', z: null, duty: 0.7, seconds: 12, was: 'under 15 m off the line, a figure with no source' },
  'bramor:acro': { table: 'FW_BRAMOR2300', file: 'tests/bramor-thresholds.json', prelude: 'bramorPrelude', z: 150, speed: 17, duty: 0.7, seconds: 10, was: 'under 15 m off the line, a figure with no source' },
  wing: { table: 'FW_WING1000', file: 'tests/wing-thresholds.json', prelude: 'wingPrelude', z: 3, speed: 10, duty: 0.65, seconds: 10, was: 'under 15 m off the line, a figure with no source' },
  'wing:acro': { table: 'FW_WING1000', file: 'tests/wing-thresholds.json', prelude: 'wingPrelude', z: 3, speed: 10, duty: 0.65, seconds: 10, was: 'under 15 m off the line, a figure with no source' },
  glider: { table: 'FW_RADIAN2000', file: 'tests/glider-thresholds.json', prelude: 'airframe:GLIDER_AIRFRAME', z: 100, speed: 10, duty: 0.5, seconds: 10, was: 'under 15 m off the line, a figure with no source' },
  'glider:acro': { table: 'FW_RADIAN2000', file: 'tests/glider-thresholds.json', prelude: 'airframe:GLIDER_AIRFRAME', z: 100, speed: 12, duty: 0.5, seconds: 10, was: 'under 15 m off the line, a figure with no source' },
  timber: { table: 'FW_TIMBER1500', file: 'tests/timber-thresholds.json', prelude: 'timberPrelude', z: 3, speed: 12, duty: 'trim', seconds: 10, was: 'under 15 m off the line, a figure with no source' },
  'timber:acro': { table: 'FW_TIMBER1500', file: 'tests/timber-thresholds.json', prelude: 'timberPrelude', z: 3, speed: 12, duty: 0.75, seconds: 10, was: 'under 15 m off the line, a figure with no source' },
  tigermoth: { table: 'FW_TIGERMOTH1803', file: 'tests/tigermoth-thresholds.json', prelude: 'airframe:TIGERMOTH_AIRFRAME', z: 30, speed: 14.4, duty: 0.75, seconds: 10, was: 'under 15 m off the line, a figure with no source' },
  'tigermoth:acro': { table: 'FW_TIGERMOTH1803', file: 'tests/tigermoth-thresholds.json', prelude: 'airframe:TIGERMOTH_AIRFRAME', z: 30, speed: 14.4, duty: 0.75, seconds: 10, was: 'under 15 m off the line, a figure with no source' },
  uglystik: { table: 'FW_UGLYSTIK1567', file: 'tests/uglystik-thresholds.json', prelude: 'uglystikPrelude', z: 30, speed: 17.3, duty: 'trim', seconds: 10, note: 'Kraft: no thrust offsets (docs/UGLYSTIK-STAGE1.md).', was: 'under 15 m off the line, a figure with no source' },
  'uglystik:acro': { table: 'FW_UGLYSTIK1567', file: 'tests/uglystik-thresholds.json', prelude: 'uglystikPrelude', z: 30, speed: 17.3, duty: 0.75, seconds: 10, note: 'Kraft: no thrust offsets (docs/UGLYSTIK-STAGE1.md).', was: 'under 15 m off the line, a figure with no source' },
  f16: { table: 'FW_F16878', file: 'tests/f16-thresholds.json', prelude: 'f16Prelude', z: 30, speed: 20, duty: 0.5, seconds: 10, was: 'under 25 m off the line, a figure with no source' },
  'f16:acro': { table: 'FW_F16878', file: 'tests/f16-thresholds.json', prelude: 'f16Prelude', z: 30, speed: 20, duty: 0.5, seconds: 10, was: 'under 25 m off the line, a figure with no source' },
  kadet: { table: 'FW_KADET1981', file: 'tests/kadet-thresholds.json', prelude: 'kadetPrelude', z: 30, speed: 14.5, duty: 'trim', seconds: 10, note: 'SIG: 0 right thrust (docs/KADET-STAGE1.md).', was: 'under 18 m off the line, a figure with no source' },
  dlg: { table: 'FW_NRJ1490', file: 'tests/dlg-thresholds.json', prelude: 'airframe:DLG_AIRFRAME', z: 100, speed: 6, duty: 0, seconds: 12, was: 'under 15 m off the line, a figure with no source' },
};

/* The prelude's own launch, as the plant's state has it after it. */
const LAUNCH = {
  'zagi:acro': () => ({ z: 150, speed: 15, pitchDeg: 0, how: 'thrown level at 15 m/s, 150 m up' }),
  zagi: () => ({ z: 0.012 + 1.2, speed: 10, pitchDeg: 0, how: 'off the hand at 10 m/s, 1.21 m up (ZAGI_THROW)' }),
  bramor: () => ({ z: BRAMOR_CATAPULT.height, speed: BRAMOR_CATAPULT.speed, pitchDeg: BRAMOR_CATAPULT.pitchDeg, how: `off its catapult at ${BRAMOR_CATAPULT.speed} m/s, ${BRAMOR_CATAPULT.pitchDeg} deg up, ${BRAMOR_CATAPULT.height} m up (BRAMOR_CATAPULT)` }),
};

function throwOf(name) {
  const c = { ...THROWS[name], mode: name.endsWith(':acro') ? 'acro' : 'stabilised', key: name.endsWith(':acro') ? 'stab_straight_acro' : 'stab_straight' };
  const duty = c.duty === 'trim' ? planeTable(c.table).fw.stab_trim_throttle : c.duty;
  const l = LAUNCH[name] ? LAUNCH[name]() : { z: c.z, speed: c.speed, pitchDeg: 0, how: `thrown level at ${c.speed} m/s, ${c.z} m up` };
  return { ...c, ...l, duty, at: AT.filter((t) => t <= c.seconds) };
}

const r2 = (x) => Number(x.toFixed(2));
const up2 = (x) => Math.ceil(x * 100 - 1e-9) / 100;

/* The plant's throw, as the selftest flies it, the drive on its mount or
 * off it. */
async function plantThrow(c, mount) {
  const { loadSim } = await import('../tests/lib/simmod.js');
  const { GROUND_MU, GROUND_E } = await import('../src/game/collide.js');
  const wp = await import('../tests/lib/wingpilot.js');
  const sim = await loadSim(new Uint8Array(readFileSync(join(root, 'dist/sim.wasm'))));
  wp.must(sim.init(readFileSync(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8')), 'init');
  wp.must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, GROUND_MU, GROUND_E), 'ground');
  wp.must(sim.e.sim_wing_set_stab(c.mode === 'acro' ? 2 : 1), 'stab');
  wp.must(sim.e.sim_wing_set_mount(1), 'mount');
  wp.must(sim.reset(), 'reset');
  /* A selftest that seats it by hand: the airframe and the pack. */
  if (c.prelude.startsWith('airframe:')) {
    wp.must(sim.e.sim_set_airframe(wp[c.prelude.slice(9)]), 'airframe');
    wp.must(sim.setCellVoltage(4.1), 'cells');
  } else {
    wp[c.prelude](sim);
  }
  wp.must(sim.e.sim_wing_set_mount(mount ? 1 : 0), 'mount');
  if (THROWS[c.name].z !== null) {
    wp.must(sim.e.sim_set_pose(0, 0, c.z, 1, 0, 0, 0), 'pose');
    wp.must(sim.e.sim_wing_launch(c.speed), 'launch');
  }
  const y0 = sim.readState().state[2];
  const out = [];
  for (let ms = 0; ms < c.seconds * 1000; ms += wp.RC_STEP_MS) {
    wp.must(sim.input(ms / 1000, 0, 0, 0, c.duty), 'input');
    wp.must(sim.step(wp.RC_STEP_MS), 'step');
    const t = (ms + wp.RC_STEP_MS) / 1000;
    if (c.at.some((a) => Math.abs(a - t) < 1e-9)) {
      const s = sim.readState().state;
      const [w, x, y, z] = [s[7], s[8], s[9], s[10]];
      out.push({
        y: s[2] - y0,
        bank: Math.atan2(2 * (y * z + w * x), 1 - 2 * (x * x + y * y)) * 180 / Math.PI,
        heading: Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)) * 180 / Math.PI,
        V: Math.hypot(s[4], s[5], s[6]),
      });
    }
  }
  return out;
}

const check = process.argv.includes('--check');
const write = process.argv.includes('--write');
let bad = 0;
for (const name of Object.keys(THROWS)) {
  const c = { ...throwOf(name), name };
  const on = throwFlight(c.table, { duty: c.duty, speed: c.speed, z: c.z, pitchDeg: c.pitchDeg, seconds: c.seconds, at: c.at, mode: c.mode });
  const derived = r2(on.at(-1).y);
  const th = JSON.parse(readFileSync(join(root, c.file), 'utf8'));
  const st = th[c.key];
  const differs = !st || st.derived !== derived;
  console.log(`${name.padEnd(15)} ${c.table.padEnd(17)} ${c.how}, ${c.duty} throttle, ${c.seconds} s: cross track ${on.at(-1).y.toFixed(3)} m (${on.map((o) => `${o.t}: ${o.y.toFixed(2)} ${o.bank.toFixed(2)}`).join('  ')})${check && differs ? '  DIFFERS' : ''}`);
  if (check && differs) bad += 1;
  if (!write) continue;
  const off = throwFlight(c.table, { duty: c.duty, speed: c.speed, z: c.z, pitchDeg: c.pitchDeg, seconds: c.seconds, at: c.at, mount: false, mode: c.mode });
  const pOn = await plantThrow(c, true), pOff = await plantThrow(c, false);
  const worst = (p, d, k) => Math.max(...p.map((x, i) => Math.abs(x[k] - d[i][k])));
  const dyOn = worst(pOn, on, 'y'), dyOff = worst(pOff, off, 'y');
  const db = worst(pOn, on, 'bank'), dh = worst(pOn, on, 'heading');
  const agree = Math.max(dyOn, dyOff);
  const tol = up2(2 * agree + 0.01);
  /* The speed it settles at, by the same rule. */
  const dV = Math.max(worst(pOn, on, 'V'), worst(pOff, off, 'V'));
  const vDerived = r2(on.at(-1).V), vTol = up2(2 * dV + 0.01);
  const source = `${c.how}, ${THROWS[name].duty === 'trim' ? `${c.duty} throttle (stab_trim_throttle, the stick stab:glide gives for level)` : `${c.duty} throttle`}, every stick centred in ${c.mode === 'acro' ? 'Acro (plant_wing.c acro_sticks: the attitude held where it was thrown)' : 'Stabilised'}: the cross track after ${c.seconds} s, left positive as the plant's y. Derived (npm run stab:straight, scripts/lib/throwflight.js): the CAP's throw (cap580:derive throwFlight) for this table, the body's six rates at the plant's step on the table's own coefficients, ${planeTable(c.table).fw.thrust_static > 0 ? 'the motor spooled from the throw on its own law and its torque on the mount, right thrust where the table has it, the P factor, the jet normal force, the prop\'s gyroscope, the slipstream\'s terms with the swirl\'s force on the whole stream (scripts/lib/wash.js finSwirl, Deters, Ananda and Selig 2015, AIAA 2015-2265, fig. 22b), and' : 'no motor, so nothing turns it but the air, and'} ${c.mode === 'acro' ? 'Acro\'s attitude hold' : 'Stabilised\'s loops with ArduPilot\'s roll integrator'}: derived ${derived} m. Against the plant (w36-physics): the cross track within ${dyOn.toFixed(3)} m along the curve at ${c.at.join(', ')} s (plant ${pOn.at(-1).y.toFixed(2)} m), the bank within ${db.toFixed(3)} deg and the heading within ${dh.toFixed(3)} deg; with the drive's torque off the mount (sim_wing_set_mount(0)) within ${dyOff.toFixed(3)} m of the derived ${off.at(-1).y.toFixed(2)}. Held within ${tol} m either way: the worst agreement of the two and the same again for what the model leaves out (the pack's drain, the ground's effect), and the derived figure's rounding, 0.01 m. Was: ${c.was}.${c.note ? ` ${c.note}` : ''} The airspeed at ${c.seconds} s by the same rule: derived ${vDerived} m/s, the plant ${pOn.at(-1).V.toFixed(2)}, within ${dV.toFixed(3)} along the curve, held within ${vTol}.`;
  th[c.key] = { duty: c.duty, speed: c.speed, atS: c.seconds, derived, tol, min: r2(derived - tol), max: r2(derived + tol), unit: 'm', vDerived, vTol, vMin: r2(vDerived - vTol), vMax: r2(vDerived + vTol), source };
  const text = readFileSync(join(root, c.file), 'utf8');
  const line = `  "${c.key}": ${JSON.stringify(th[c.key], null, 1).replace(/\n\s*/g, ' ').replace('{ ', '{').replace(' }', '}')}`;
  const lines = text.replace(/\n$/, '').split('\n');
  const i = lines.findIndex((l) => l.startsWith(`  "${c.key}":`));
  if (i >= 0) {
    lines[i] = line + (lines[i].trimEnd().endsWith(',') ? ',' : '');
  } else {
    lines[lines.length - 2] = lines[lines.length - 2].replace(/,?\s*$/, ',');
    lines.splice(lines.length - 1, 0, line);
  }
  const out = `${lines.join('\n')}\n`;
  JSON.parse(out);
  writeFileSync(join(root, c.file), out);
  console.log(`  wrote ${c.file} ${c.key}: ${derived} m within ${tol} (plant ${pOn.at(-1).y.toFixed(3)}, worst ${agree.toFixed(3)})`);
}
if (check && bad) {
  console.error(`stab:straight: ${bad} stab_straight band(s) differ from the derivation; run --write and review`);
  process.exit(1);
}
if (check) console.log('stab:straight --check: every stab_straight is what the derivation gives');
