/*
 * wing-ge-selftest.js: the fixed wings' ground effect (plant_wing.c GROUND
 * EFFECT) against what it promises.
 *
 * 1. Above its height, nothing: every fixed wing flies the same 400 ms,
 *    level at a CL of 0.5, its wing a span and a metre up and over 0.758
 *    of its span all the way, with the ground raised under it and with no
 *    ground, and both traces hash to the one the plant flew before the
 *    term existed (PINS, recorded on w34-3d-batchlat 734368a90; --pin
 *    prints them from a given build). The tables that do not take the
 *    term are flown too.
 * 2. Near the ground, the term the derivations predict: one 1 ms step
 *    from the same state, 3 deg nose up and flying level, where the lift
 *    curve is still straight, with the ground raised under the wing at a
 *    quarter of the span (or the next of 0.35, 0.45, 0.55 that clears the
 *    wheels) and with none; the change in the vertical speed is the lift
 *    scripts/lib/groundeffect.js gives, within 3 percent, and the change
 *    in the pitch rate its pitching moment, within 5. A biplane's terms
 *    are its two wings' (biplaneGroundTerms), its moment with the couple
 *    of their uneven upwash at each wing's aerodynamic centre.
 *
 * Usage: node scripts/wing-ge-selftest.js [--pin path/to/sim.wasm]
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

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { GROUND_MU, GROUND_E } from '../src/game/collide.js';
import { GE_HB_MAX, biplaneGroundTerms, groundTerms } from './lib/groundeffect.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pinAt = process.argv.indexOf('--pin');
const wasmPath = pinAt > 0 ? process.argv[pinAt + 1] : join(root, 'dist/sim.wasm');
const wasmBytes = new Uint8Array(await readFile(wasmPath));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const wingC = readFileSync(join(root, 'src/native/plant_wing.c'), 'utf8');
const plantC = readFileSync(join(root, 'src/native/plant.c'), 'utf8');

/* Every fixed wing: [name, airframe id, the suffix of its FW_ table and
 * its SIM_AIRFRAME_ entry]. */
const PLANES = [
  ['wing', 2, 'WING1000'], ['sky', 3, 'SKY1800'], ['cub', 4, 'CUB1400'], ['slowstick', 5, 'SLOWSTICK1180'],
  ['radian', 6, 'RADIAN2000'], ['timber', 7, 'TIMBER1500'], ['bramor', 8, 'BRAMOR2300'], ['timberf', 9, 'TIMBER1500F'],
  ['cubf', 10, 'CUB1400F'], ['bombshell', 11, 'BOMBSHELL1118'], ['kadet', 12, 'KADET1981'], ['p51', 15, 'P51D1450'],
  ['f16', 16, 'F16878'], ['zagi', 17, 'ZAGI1219'], ['uglystik', 19, 'UGLYSTIK1567'], ['nrj', 21, 'NRJ1490'],
  ['tigermoth', 23, 'TIGERMOTH1803'], ['strikerprop', 27, 'STRIKER_PROP'], ['strikerjet', 28, 'STRIKER_JET'],
  ['extra', 29, 'EXTRA3D1308'], ['nighttimber', 30, 'NIGHTTIMBER1200'], ['hercules', 31, 'HERCULES3077'],
  ['cap580', 32, 'CAP1702'], ['slick', 33, 'SLICK2680'],
].map(([name, id, suffix]) => ({ name, id, table: `FW_${suffix}`, frame: `SIM_AIRFRAME_${suffix}` }));
/* The traces of part 1 on the build before the term. A table's start
 * height is its wing's (ge_wing), so a table that takes the term later is
 * re-pinned from the build before it at its new height: the Hercules and
 * the Tiger Moth from batch/2026-10-12 f93dd7f87 (were ebba6d702410187f
 * and 4ab14916f3d11e9d with no wing point). The F-16 re-pinned for its
 * measured lateral derivatives (w36-f16-hilat; was e31ccb8e492d3f50),
 * the ground's term unchanged. The Extra, CAP and Slick re-pinned for
 * their fuselages' measured crossflow drag (w36-3d-sideforce 84c873e57;
 * were b293b09e73f99993, 2e4df1c22374a4e2 and 1eec01c5f11adf28), the
 * ground's term unchanged. Sixteen tables re-pinned for the seated
 * pack's thrust and the tail's measured wash on one plant (w36-physics:
 * w36-seat-voltage and w36-wash-speed), the ground's term unchanged; the
 * wing, Skyhunter, Bramor, F-16, Zagi, NRJ and the two Strikers did not
 * move. The Night Timber re-pinned for its fuselage's measured crossflow
 * drag (w37-physics-servo; was f34bb151437c1dde), the ground's term
 * unchanged. Twelve re-pinned for their fuselages' crossflow drag on
 * their drawn sections (w38-fuselage-side, NACA TN 3038 through
 * scripts/lib/crossflow.js), the ground's term unchanged: the Skyhunter,
 * Cub, Radian, Timber, Timber floats, Cub floats, Bombshell, Kadet, P-51,
 * Ugly Stik, Tiger Moth and Hercules (were 67c0dfd1d6dce1d1,
 * b8541ee8b370c6f4, 08b9109d261f83b5, 42cf55e4be2ce1de, 1714bd0bf5b41596,
 * 6df7666ef3a9b593, cb55e508b565c328, 2af0141678d16393, 3f5b18c3d6fd6773,
 * 7eed8ee1f43b5c98, 1617c025e09104fb and 4405e5e3b684abe5). Re-pinned for
 * the fuselage's share of the weathercock on Munk's sin 2 beta
 * (w38-fuselage-side, NACA TR 184), the ground's term unchanged: sky (was
 * a0e9654872f117b8), cub (was 53b0ed725308b1a0), radian (was
 * 7a89ca11e112bfe3), timber (was 6f4dc161dc2c4d5b), bramor (was
 * 639bbf37df657ca7), timberf (was 7d1a5eba1683439d), cubf (was
 * 94d5decb25853be4), bombshell (was a4517d5f8efe5d1f), kadet (was
 * 72ca1f7516cee3ba), p51 (was 03e3300de3a1086a), f16 (was
 * 68bf198f7585f9e2), uglystik (was 72067e8d4610b92d), tigermoth (was
 * 6bfa8b2e5b0b0234), strikerprop (was ac1ebe1d9baba2ed), strikerjet (was
 * 2c30dccda291887d), extra (was 3507628f2a5cfd82), nighttimber (was
 * 964632c1e2defb8e), hercules (was 17e4cfd6a556458f), cap580 (was
 * 8abf9aeac1ba645b), slick (was d7e7790e169321bc). The Extra, CAP and
 * Slick again on the combined plant with w38-hover-yaw's wash and their
 * AS3X re-derived on it, the ground's term unchanged (were
 * 2fca4407efd2d224, 8e66909096631404 and 5449163f8a43d393). Re-pinned for
 * the fuselage's crossflow drag at its own centre of pressure
 * (w38-crossflow-moment, side_x, Allen and Perkins), the ground's term
 * unchanged: sky (was 98dbc41182defb65), cub (was a800a9bacc6ca86e),
 * radian (was 4e0c156e7201c5a5), timber (was c56e0195572eefd8), timberf
 * (was 59bac20e4dbc5e49), cubf (was ae4a533ae8390f4f), bombshell (was
 * 50dcf037afd32e48), kadet (was 038828363ad67d9c), p51 (was
 * 4fed22c5316b798f), f16 (was 0b2d44b8ed4affdd), uglystik (was
 * 69d7b779b2222825), tigermoth (was dfbcb81229d100c0), extra (was
 * 130ee96df4d170a5), nighttimber (was 2b1e8e70189de507), hercules (was
 * 75408e31a83e82dd), cap580 (was ca753897fc920c72), slick (was
 * eb98eb5f61ba0c32). Re-pinned for the F-16's measured side force
 * (w38-physics-2, cy_tab, NASA TP-1538 table III) and its AS3X re-derived
 * on it, the ground's term unchanged: f16 (was 75a6cac5f8258f81).
 * Re-pinned for the stalled wing's plate force in the plane of symmetry
 * (w38-physics-2, plant_wing.c THE PLATE'S FORCE IN A SIDESLIP), the
 * ground's term unchanged: bramor (was 8191b109670108ee), cap580 (was
 * f77ccae2a596aa22). */
const PINS = {
  wing: 'ad4d4675b539f7ac',
  sky: '6ec975f7afcb036b',
  cub: '7f26c298362cc8e0',
  slowstick: '731483e6eb017e98',
  radian: '80300ab2345b8d8f',
  timber: '4b2f4b3fb5f79720',
  bramor: '997e5371cc805783',
  timberf: '8d8de74bcbab6724',
  cubf: '7d63c9e2c78386ee',
  bombshell: '65e981219dac8893',
  kadet: '0a09240a3d188fec',
  p51: '960d687d68dd1fc2',
  f16: 'd5f224c3b1ec6518',
  zagi: 'abccd77d1b7b9034',
  uglystik: '0e6442ae5529b6b8',
  nrj: '31151485dea980a5',
  tigermoth: 'ab1925996216026f',
  strikerprop: 'cc5c73165bbbee13',
  strikerjet: '3a313d5090f2f3fb',
  extra: 'e2126e2b566fa933',
  nighttimber: 'c6d1310b299055bc',
  hercules: 'eb28e3fc65379972',
  cap580: '344350ea67641586',
  slick: '1172512292cfbb69',
};

/* A table's field: a number or a sum of products of numbers and WING_PI. */
function field(body, name) {
  const m = new RegExp(`\\n\\s*\\.${name} = ([^,\\n]*),`).exec(body);
  if (!m) return 0;
  const ex = m[1].replace(/\/\*.*$/, '').trim();
  if (!/^[-+*/.\d\s()WING_PI]+$/.test(ex)) throw new Error(`${name}: ${ex}`);
  return Function('WING_PI', `return (${ex});`)(Math.PI);
}
const vec = (body, name) => {
  const m = new RegExp(`\\.${name} = \\{([^}]*)\\}`).exec(body);
  return m ? m[1].split(',').map(Number) : [0, 0, 0];
};
/* A table's pair, each a number or a product with WING_PI, as field. */
const pair = (body, name) => {
  const m = new RegExp(`\\.${name} = \\{([^}]*)\\}`).exec(body);
  return m ? m[1].split(',').map((x) => field(`\n  .v = ${x.trim()},`, 'v')) : [0, 0];
};
function tableOf(plane) {
  const body = new RegExp(`const FixedWingParams ${plane.table} = \\{([\\s\\S]*?)\\n\\};`).exec(wingC)[1];
  const pbody = new RegExp(`\\[${plane.frame}\\] = \\{([\\s\\S]*?)\\n\\},`).exec(plantC)[1];
  const t = {
    on: /\.ground_effect = 1/.test(body),
    b: field(body, 'span'), S: field(body, 'area'), c: field(body, 'chord'),
    cla: field(body, 'cl_alpha'), cma: field(body, 'cm_alpha'), slipCma: field(body, 'slip_cm_a'), hi: /\.hi_alpha = 1/.test(body), aw: field(body, 'ge_cla_wing') || field(body, 'cl_alpha_wing') || field(body, 'cl_alpha'),
    claStall: field(body, 'cl_alpha_wing') || field(body, 'cl_alpha'),
    dd: field(body, 'tail_deda'), clmax: field(body, 'cl_max'), azl: field(body, 'alpha_zl'),
    wing: vec(body, 'ge_wing'), tail: vec(body, 'ge_tail'), wing2: vec(body, 'ge_wing2'),
    bipW: pair(body, 'bip_w'), bipR: pair(body, 'bip_r'), bipDstall: pair(body, 'bip_dstall'), bipX: pair(body, 'bip_x'), armAc: field(body, 'stall_arm_ac'),
    m: Number(/\.mass_kg = ([\d.]+)/.exec(pbody)[1]), iyy: Number(/\.inertia = \{ [\d.]+, ([\d.]+)/.exec(pbody)[1]), rho: Number(/\.rho = ([\d.]+)/.exec(pbody)[1]),
  };
  /* Level at a CL of 0.5. */
  t.v = Math.sqrt(2 * t.m * 9.80665 / (t.rho * t.S * 0.5));
  return t;
}

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) passed += 1; else failed += 1;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
const must = (c, w) => { if (c !== SIM_OK) throw new Error(`${w}: ${c}`); };

async function flight(plane, ground) {
  const sim = await loadSim(wasmBytes);
  must(sim.init(configText), 'init');
  must(sim.e.sim_set_airframe(plane.id), 'airframe');
  must(sim.setCellVoltage(4.1), 'volts');
  if (ground) must(sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, GROUND_MU, GROUND_E), 'ground');
  return sim;
}
/* The wing's quarter chord's height: the CG's plus its offset turned by
 * the attitude onto world z. */
function wingH(s, w) {
  const qw = s[7], x = s[8], y = s[9], z = s[10];
  return s[3] + 2 * (x * z - qw * y) * w[0] + 2 * (y * z + qw * x) * w[1] + (1 - 2 * (x * x + y * y)) * w[2];
}

const pins = {};
for (const plane of PLANES) {
  const t = tableOf(plane);
  console.log(`${plane.name}${t.on ? '' : ', which does not take the term'}`);
  /* 1. Above its height. */
  const hashes = [];
  let low = Infinity;
  for (const ground of [true, false]) {
    const sim = await flight(plane, ground);
    must(sim.e.sim_set_pose(0, 0, t.b + 1 - t.wing[2], 1, 0, 0, 0), 'pose');
    must(sim.e.sim_wing_launch(t.v), 'launch');
    const h = createHash('sha256');
    for (let i = 0; i < 400; i += 1) {
      must(sim.input((i + 1) / 1000, 0, 0, 0, 0.5), 'input');
      must(sim.step(1), 'step');
      h.update(sim.readStateBytes().bytes);
      low = Math.min(low, wingH(sim.readState().state, t.wing) / t.b);
    }
    hashes.push(h.digest('hex').slice(0, 16));
  }
  pins[plane.name] = hashes[1];
  if (pinAt > 0) continue;
  check(`over ${GE_HB_MAX.toFixed(3)} of the span (lowest ${low.toFixed(3)}) the ground changes nothing`, low > GE_HB_MAX && hashes[0] === hashes[1], `${hashes[0]} ${hashes[1]}`);
  check('and the trace is the one flown before the term', hashes[1] === PINS[plane.name], `${hashes[1]} pinned ${PINS[plane.name]}`);
  if (!t.on) continue;
  /* 2. Near the ground: one step, the ground at hb of the span under the
   * wing against none, the lowest of a quarter, 0.35, 0.45 and 0.55 that
   * keeps the wheels, the floats and the hull clear of it. */
  const th = -1.5 * Math.PI / 180;
  const once = async (hb) => {
    const out = { dvz: [], dq: [], alphaBody: 0, contacts: 0 };
    for (const ground of [true, false]) {
      const sim = await flight(plane, ground);
      const hw = hb * t.b - (-Math.sin(2 * th) * t.wing[0] + Math.cos(2 * th) * t.wing[2]);
      must(sim.e.sim_set_pose(0, 0, hw, Math.cos(th), 0, Math.sin(th), 0), 'pose');
      must(sim.e.sim_wing_launch(t.v), 'launch');
      must(sim.e.sim_set_velocity(t.v, 0, 0, 0, 0, 0), 'velocity');
      const s0 = sim.readState().state;
      out.alphaBody = -Math.asin(2 * (s0[7] * s0[9] - s0[8] * s0[10]));
      must(sim.input(0.001, 0, 0, 0, 0), 'input');
      must(sim.step(1), 'step');
      out.contacts += sim.e.sim_ground_contacts();
      const p = sim.e.malloc(4 * 8);
      must(sim.e.sim_wheel_loads(p), 'wheel loads');
      out.contacts += Array.from(new Float64Array(sim.e.memory.buffer, p, 4)).filter((f) => f !== 0).length;
      sim.e.free(p);
      const fl = sim.e.malloc(10 * 8);
      must(sim.e.sim_float_state(fl), 'floats');
      const fs = new Float64Array(sim.e.memory.buffer, fl, 10);
      out.contacts += fs[0] !== 0 || fs[1] !== 0 || fs[6] !== 0 ? 1 : 0;
      sim.e.free(fl);
      const s1 = sim.readState().state;
      out.dvz.push(s1[6] - s0[6]);
      out.dq.push(s1[12] - s0[12]);
    }
    return out;
  };
  let hb = 0, run = null;
  for (const h of [0.25, 0.35, 0.45, 0.55]) {
    hb = h;
    run = await once(h);
    if (run.contacts === 0) break;
  }
  const { dvz, dq, alphaBody, contacts } = run;
  /* The wing's own lift at the plant's stall angle holds its term. */
  const geo = { b: t.b, S: t.S, aw: t.aw, dd: t.dd, clmax: t.clmax * (t.aw / t.claStall), wing: [t.wing[0], t.wing[2]], tail: t.tail[0] < 0 ? [t.tail[0], t.tail[2]] : null };
  const biplane = t.bipW[0] > 0;
  /* The bottom wing's height at the attitude the top wing's is set at. */
  const h2 = hb * t.b + (-Math.sin(2 * th) * (t.wing2[0] - t.wing[0]) + Math.cos(2 * th) * (t.wing2[2] - t.wing[2]));
  const g = biplane
    ? biplaneGroundTerms({ ...geo, cla: t.claStall, clmax: t.clmax, bipW: t.bipW, bipR: t.bipR, bipDstall: t.bipDstall, wing2: [t.wing2[0], t.wing2[2]] }, [hb * t.b, h2], alphaBody, alphaBody - t.azl)
    : groundTerms(geo, hb * t.b, alphaBody, alphaBody - t.azl);
  const couple = biplane ? t.cla * [0, 1].reduce((a, i) => a + t.bipW[i] / t.bipR[i] * (t.armAc + t.bipX[i]) * g.bipDa[i], 0) : 0;
  const tailCl = (t.cla - t.aw) / (1 - t.dd);
  const dCl = t.cla * g.dAlpha + tailCl * g.dTail;
  const predicted = 0.5 * t.rho * t.v * t.v * t.S * dCl / t.m * 0.001;
  const flown = dvz[0] - dvz[1];
  /* The tail's moment per rad of its own angle: its lift share at its arm,
   * or a hi_alpha table's slip_cm_a over (1 - d eps / d alpha). */
  const tailCm = t.hi ? t.slipCma / (1 - t.dd) : tailCl * t.tail[0] / t.c;
  const dCm = t.cma * g.dAlpha + tailCm * g.dTail + couple;
  const qPred = -0.5 * t.rho * t.v * t.v * t.S * t.c * dCm / t.iyy * 0.001;
  const qFlown = dq[0] - dq[1];
  const fx = (v) => [].concat(v).map((x) => x.toFixed(3)).join(' ');
  check(`at ${hb} of the span the lift rises as groundeffect.js has it`, contacts === 0 && Math.abs(flown / predicted - 1) < 0.03,
    `contacts ${contacts}, alpha ${(alphaBody * 180 / Math.PI).toFixed(2)} deg, sigma ${fx(g.sigma)}, R ${fx(g.R)}, dCL ${dCl.toFixed(4)} (wing ${(t.cla * g.dAlpha).toFixed(4)}, tail ${(tailCl * g.dTail).toFixed(4)}), dvz ${flown.toExponential(3)} against ${predicted.toExponential(3)}`);
  check('and its pitching moment as groundeffect.js has it', Math.abs(qFlown / qPred - 1) < 0.05,
    `dCm ${dCm.toFixed(4)} (wing ${(t.cma * g.dAlpha).toFixed(4)}, tail ${(tailCm * g.dTail).toFixed(4)}${biplane ? `, the wings' couple ${couple.toFixed(4)}` : ''}), dq ${qFlown.toExponential(3)} against ${qPred.toExponential(3)}`);
}
if (pinAt > 0) {
  console.log(JSON.stringify(pins, null, 2));
} else {
  console.log(`${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}
