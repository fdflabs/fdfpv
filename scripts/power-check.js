/*
 * power-check.js: every plane's power system against its data,
 * docs/POWER-STAGE1.md. For each fixed wing in configs/power.js:
 *
 *   P1 the stock option through sim_set_power flies a trace bit identical
 *      to the plant's own table, so configs/power.js and the C agree;
 *   P2 its flight time at cruise on the stock pack, to LOW BATTERY and to
 *      the ESC's cutoff (or to a dry tank), against the maker's stated
 *      flight time where there is one;
 *   P3 the largest pack flies longer than the stock pack and is heavier;
 *   P4 late in the pack the voltage and the power fade: the loaded voltage
 *      and the full throttle climb are lower at 12 percent than fresh;
 *   P5 LOW BATTERY fires, through the OSD's own Betaflight test
 *      (src/ui/fpvhud.js), when the filtered pack voltage crosses 3.5 V a
 *      cell and not before;
 *   P6 a glow engine leans, quits when its tank is dry and the aircraft
 *      glides on;
 *   P7 each alternative changes the top speed and the climb the way its
 *      thrust and pitch speed say it must.
 *
 * Run with npm run power:check, or name airframes: node
 * scripts/power-check.js timber1500 kadet1981.
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

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { attitude, must, RC_STEP_MS } from '../tests/lib/wingpilot.js';
import { POWER, TABLE, powerBlock } from '../configs/power.js';
import { FpvOsd } from '../src/ui/fpvhud.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}${detail ? `  (${detail})` : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}
const f1 = (x) => x.toFixed(1);
const f2 = (x) => x.toFixed(2);

const sim = await loadSim(new Uint8Array(await readFile(join(root, 'dist/sim.wasm'))));
must(sim.init(await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8')), 'init');

/* Seat an airframe on a full pack with a choice, or the table's own. */
function seat(id, option, pack) {
  must(sim.e.sim_set_airframe(TABLE[id].simId), 'sim_set_airframe');
  must(sim.setCellVoltage(4.2), 'sim_set_cell_voltage');
  if (option == null) {
    must(sim.clearPower(), 'sim_power_clear');
  } else {
    must(sim.setPower(powerBlock(id, option, pack)), `sim_set_power ${id} ${option} ${pack}`);
  }
}

/*
 * The OSD's battery logic, the shell's own class, fed as the shell feeds
 * it: the plant state and pack every frame. Only the pieces feed() and
 * batteryState() read are set up; nothing is drawn.
 */
function osdFor(cells) {
  const o = Object.create(FpvOsd.prototype);
  o.stats = { feeds: 0, feedMs: 0 };
  o.configSeen = null;
  o.buf = new Uint16Array(30 * 16);
  o.resetRun();
  return {
    feed(st, power) {
      o.feed({}, { st, cells, restVolts: 4.2 * cells, power, armed: true, config: '', link: null });
      return { batt: o.batt, vFilt: o.vFilt, mah: o.mah };
    },
    /* The warning the OSD puts under the crosshair this frame. */
    warning(cellsNow) {
      o.buildWarnings({ launchState: 0 }, { armed: true, flown: true, crashFlip: false, cells: cellsNow }, true);
      return o.values.warning;
    },
  };
}

/*
 * Level flight, the way a pilot or an autopilot's TECS flies it. At cruise
 * the pitch stick holds the airspeed and the throttle holds the height, so
 * a heavier or a tiring aircraft asks for more throttle rather than
 * sinking. At full throttle (`full`) the pitch stick holds the height and
 * the speed is what the motor gives. The roll stick holds the wings level.
 * `until` ends it; `every` is called each 4 ms step with the state.
 */
function cruise({ speed, seconds, until = null, every = null, throttle0 = 0.5, start = null, full = false }) {
  if (start !== false) {
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_set_pose(0, 0, 200, 1, 0, 0, 0), 'sim_set_pose');
    must(sim.e.sim_wing_launch(speed), 'sim_wing_launch');
  }
  const t0 = start === false ? sim.readState().state[0] * 1000 : 0;
  const z0 = sim.readState().state[3];
  let thr = throttle0;
  let trim = 0;
  let ms = 0;
  const total = seconds * 1000;
  for (; ms < total; ms += RC_STEP_MS) {
    const s = sim.readState().state;
    const { pitch, bank } = attitude(s);
    const v = Math.hypot(s[4], s[5], s[6]);
    let pt;
    if (full) {
      trim = Math.max(-0.2, Math.min(0.2, trim + 0.00002 * -s[6]));
      pt = Math.max(-0.2, Math.min(0.2, 0.05 * -s[6] + trim));
      thr = 1;
    } else {
      trim = Math.max(-0.3, Math.min(0.6, trim + 0.00002 * (v - speed)));
      pt = Math.max(-0.3, Math.min(0.6, 0.04 * (v - speed) + trim));
      thr = Math.max(0, Math.min(1, thr + 0.0002 * -s[6] + 0.000005 * (z0 - s[3])));
    }
    const pitchStick = Math.max(-1, Math.min(1, 2.5 * (pt - pitch) + 0.25 * s[12]));
    const roll = Math.max(-1, Math.min(1, -1.2 * bank - 0.12 * s[11]));
    must(sim.input((t0 + ms) / 1000, roll, pitchStick, 0, thr), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    if (every) {
      every(sim.readState().state, ms, thr);
    }
    if (until && until(ms)) {
      break;
    }
  }
  return { ms, thr };
}

/* Full throttle at a held airspeed for `seconds` from where the aircraft
 * is: the mean climb rate over the last half. */
function climbFromHere(speed, seconds = 8) {
  const t0 = sim.readState().state[0] * 1000;
  let trim = 0;
  let sum = 0;
  let n = 0;
  for (let ms = 0; ms < seconds * 1000; ms += RC_STEP_MS) {
    const s = sim.readState().state;
    const { pitch, bank } = attitude(s);
    const v = Math.hypot(s[4], s[5], s[6]);
    trim = Math.max(-1, Math.min(1.2, trim + 0.00002 * (v - speed)));
    const pt = Math.max(-0.5, Math.min(1.2, 0.04 * (v - speed) + trim));
    const pitchStick = Math.max(-1, Math.min(1, 2.5 * (pt - pitch) + 0.25 * s[12]));
    const roll = Math.max(-1, Math.min(1, -1.2 * bank - 0.12 * s[11]));
    must(sim.input((t0 + ms) / 1000, roll, pitchStick, 0, 1), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    if (ms >= seconds * 500) {
      sum += s[6];
      n += 1;
    }
  }
  return sum / n;
}

/* Full throttle, level, from a throw at `speed`: the speed it settles at. */
function topSpeed(speed) {
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_set_pose(0, 0, 300, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(speed), 'sim_wing_launch');
  let trim = 0;
  let v = speed;
  for (let ms = 0; ms < 40000; ms += RC_STEP_MS) {
    const s = sim.readState().state;
    const { pitch, bank } = attitude(s);
    v = Math.hypot(s[4], s[5], s[6]);
    trim = Math.max(-0.3, Math.min(0.3, trim + 0.00002 * -s[6]));
    const pt = Math.max(-0.3, Math.min(0.3, 0.05 * -s[6] + trim));
    const pitchStick = Math.max(-1, Math.min(1, 2.5 * (pt - pitch) + 0.25 * s[12]));
    const roll = Math.max(-1, Math.min(1, -1.2 * bank - 0.12 * s[11]));
    must(sim.input(ms / 1000, roll, pitchStick, 0, 1), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
  }
  return v;
}

/* A scripted 30 s flight's state trace, hashed. */
function traceHash() {
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_set_pose(0, 0, 100, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(12), 'sim_wing_launch');
  const h = createHash('sha256');
  for (let ms = 0; ms < 30000; ms += RC_STEP_MS) {
    const thr = ms < 10000 ? 1 : (ms < 20000 ? 0.5 : 0.8);
    const roll = ms > 12000 && ms < 13000 ? 0.4 : 0;
    must(sim.input(ms / 1000, roll, 0.1, 0, thr), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    h.update(sim.readStateBytes().bytes);
  }
  return h.digest('hex').slice(0, 16);
}

/*
 * Level flight until the flight is over, OSD fed every 20 ms: at the
 * cruise speed on the throttle, or at full throttle (`full`). Over is a dry
 * tank or a flat pack, or for an electric motor whose ESC's soft cutoff
 * never lets the pack go flat, the OSD's LOW BATTERY, which is when a
 * pilot lands: `until` says which.
 */
function flightTime(id, option, pack, speed, cells, { full = false, until = 'cut' } = {}) {
  seat(id, option, pack);
  const osd = osdFor(cells);
  const r = { warnS: null, warnPackV: null, prevPackV: null, loadedPackV: null, cutS: null, leanS: null, maxRpmLean: 0 };
  let lastFilt = null;
  cruise({
    speed,
    full,
    seconds: 5 * 3600,
    every: (st, ms) => {
      if (ms % 20 !== 0) {
        return;
      }
      const pw = sim.powerState();
      const o = osd.feed(st, pw);
      if (r.warnS == null && o.batt !== 'ok') {
        r.warnS = ms / 1000;
        r.warnPackV = o.vFilt;
        r.prevPackV = lastFilt;
        r.loadedPackV = st[18];
      }
      lastFilt = o.vFilt;
      if (pw.lean && r.leanS == null) {
        r.leanS = ms / 1000;
        r.rpmAtLean = st[14];
        r.leanWarning = osd.warning(cells);
      }
      if (!pw.running && r.outWarning == null) {
        r.outWarning = osd.warning(cells);
      }
      if (pw.lean) {
        r.maxRpmLean = Math.max(r.maxRpmLean, st[14]);
      }
      if (r.cutS == null && !pw.running) {
        r.cutS = ms / 1000;
      }
    },
    until: () => (until === 'warn' ? r.warnS != null : r.cutS != null),
  });
  return r;
}

const only = process.argv.slice(2);
const ids = Object.keys(POWER).filter((id) => only.length === 0 || only.includes(id));

for (const id of ids) {
  const t = TABLE[id];
  const opts = POWER[id];
  const stock = opts[0];
  console.log(`\n${id}: ${opts.length} options, cruise ${t.cruiseMs} m/s`);

  /* P1 */
  seat(id, null);
  const tableHash = traceHash();
  seat(id, stock.id, stock.pack);
  const stockHash = traceHash();
  check('P1 the stock option is the plant\'s table', tableHash === stockHash, `${tableHash} and ${stockHash}`);

  const cellsOf = (o, p) => (o.kind === 'electric' ? o.packs.find((k) => k.id === p).cells : t.cells);

  /*
   * P2, against what the maker's figure is. The end of a flight is LOW
   * BATTERY for an electric motor, the cut for the Bramor's autopilot, a
   * dry tank for a glow engine.
   *   timer:   a flight timer the manual sets, which lands with the pack
   *            to spare, so even flown flat out the pack outlasts it.
   *   atLeast: "10 minutes and longer": cruise lasts at least that.
   *   mixed:   a time for mixed throttle, which lies between the time at
   *            full throttle and the time at cruise.
   *   cruise:  an endurance at the cruise speed: within 5 percent.
   */
  const stated = t.flightTime;
  const end = stock.kind === 'glow' || (stated && stated.end === 'cut') ? 'cut' : 'warn';
  const cells0 = cellsOf(stock, stock.pack);
  const ft = flightTime(id, stock.id, stock.pack, t.cruiseMs, cells0, { until: end });
  const ftFull = flightTime(id, stock.id, stock.pack, t.cruiseMs, cells0, { until: end, full: true });
  const minutes = (x) => (x == null ? 'never' : `${f1(x / 60)} min`);
  const endOf = (r) => (end === 'cut' ? r.cutS : r.warnS);
  const endName = stock.kind === 'glow' ? 'a dry tank' : (end === 'cut' ? 'the cut' : 'LOW BATTERY');
  const tCruise = endOf(ft);
  const tFull = endOf(ftFull);
  if (stated) {
    const lo = stated.minutesLow * 60;
    const hi = stated.minutesHigh * 60;
    const holds = {
      timer: [`even flat out the pack outlasts the maker's ${stated.minutesHigh} min timer`, () => tFull >= hi],
      atLeast: [`cruise lasts the maker's ${stated.minutesLow} min or more`, () => tCruise >= lo],
      mixed: [`the maker's ${stated.minutesLow} min lies between full throttle and cruise`, () => tFull <= hi && tCruise >= lo],
      cruise: [`cruise lasts the maker's ${stated.minutesLow} min, within 5 percent`, () => Math.abs(tCruise - lo) <= 0.05 * lo],
    }[stated.kind];
    check(`P2 ${holds[0]}`, tCruise != null && tFull != null && holds[1](),
      `${minutes(tFull)} at full throttle, ${minutes(tCruise)} at cruise at ${t.cruiseMs} m/s, to ${endName}; maker: ${stated.note}`);
  } else {
    check(`P2 the stock ${stock.kind === 'glow' ? 'tank' : 'pack'} runs out, sooner at full throttle (no maker figure)`,
      tCruise != null && tFull != null && tFull < tCruise,
      `${minutes(tFull)} at full throttle, ${minutes(tCruise)} at cruise at ${t.cruiseMs} m/s, to ${endName}`);
  }

  if (stock.kind === 'electric') {
    /* P3 */
    const big = stock.packs.filter((p) => p.cells === cells0).reduce((x, p) => (p.mAh > x.mAh ? p : x));
    if (big.id !== stock.pack) {
      /* The heavier aircraft flown at the same lift coefficient, as a
       * pilot flies the same attitude: the cruise speed by the root of
       * the weight. */
      const mBig = powerBlock(id, stock.id, big.id)[1];
      const vBig = t.cruiseMs * Math.sqrt(mBig / t.massKg);
      const ftBig = flightTime(id, stock.id, big.id, vBig, big.cells, { until: end });
      check(`P3 the ${big.mAh} mAh pack flies longer and weighs more`, endOf(ftBig) > tCruise && mBig > t.massKg,
        `${minutes(endOf(ftBig))} against ${minutes(tCruise)} at cruise, ${f2(mBig)} kg against ${f2(t.massKg)} kg`);
    } else {
      check('P3 the stock pack is the largest offered', true, `${big.mAh} mAh`);
    }

    /* P4: fresh, then late in the pack. */
    seat(id, stock.id, stock.pack);
    cruise({ speed: t.cruiseMs, seconds: 5 });
    const vFresh = sim.readState().state[18];
    const climbFresh = climbFromHere(t.cruiseMs);
    seat(id, stock.id, stock.pack);
    cruise({ speed: t.cruiseMs, seconds: 5 * 3600, until: () => sim.powerState().soc < 0.12 });
    const vLate = sim.readState().state[18];
    const climbLate = climbFromHere(t.cruiseMs);
    check('P4 late in the pack the voltage sags and the climb fades',
      vLate < vFresh && climbLate < climbFresh,
      `cruise ${f2(vFresh)} V fresh, ${f2(vLate)} V at 12 percent; full throttle climb ${f2(climbFresh)} m/s fresh, ${f2(climbLate)} m/s late`);

    /* P5: batteryUpdateVoltageState's test, the filtered pack against
     * 3.5 V a cell less the 10 mV hysteresis, crossed on that frame. */
    const warnAt = 3.5 * cells0 - 0.01;
    check('P5 LOW BATTERY fires as the filtered pack crosses 3.5 V a cell',
      ft.warnS != null && ft.warnPackV <= warnAt && ft.prevPackV > warnAt,
      ft.warnS == null ? 'never fired' : `at ${minutes(ft.warnS)}: ${ft.warnPackV.toFixed(4)} V filtered against ${warnAt.toFixed(2)}, ${ft.prevPackV.toFixed(4)} the frame before, ${ft.loadedPackV.toFixed(3)} V loaded`);
  } else {
    /* P6 */
    check('P6 the engine leans, speeds up, then quits on a dry tank',
      ft.leanS != null && ft.cutS != null && ft.leanS < ft.cutS && ft.maxRpmLean > ft.rpmAtLean,
      `lean at ${minutes(ft.leanS)}, dry at ${minutes(ft.cutS)}, ${Math.round(ft.rpmAtLean)} rpm as it leans, ${Math.round(ft.maxRpmLean)} at the peak`);
    check('P6 the OSD warns LOW FUEL in the lean run and ENGINE OUT when it quits',
      ft.leanWarning === 'LOW FUEL' && ft.outWarning === 'ENGINE OUT',
      `"${ft.leanWarning}", then "${ft.outWarning}"`);
    /* And it glides: 20 s more with the throttle where it was. */
    let minZ = Infinity;
    let vMin = Infinity;
    const z0 = sim.readState().state[3];
    cruise({
      speed: t.cruiseMs,
      seconds: 20,
      start: false,
      every: (st) => {
        minZ = Math.min(minZ, st[3]);
        vMin = Math.min(vMin, Math.hypot(st[4], st[5], st[6]));
      },
    });
    const st = sim.readState().state;
    const sink = (z0 - st[3]) / 20;
    check('P6 dead stick: no thrust, and it glides down',
      st[14] === 0 && sink > 0 && sink < 3 && vMin > 0.8 * airframeById(id).stall,
      `rpm ${st[14]}, sink ${f2(sink)} m/s over 20 s, slowest ${f1(vMin)} m/s against a ${airframeById(id).stall} m/s stall`);
  }

  /* P7 */
  seat(id, stock.id, stock.pack);
  const topStock = topSpeed(t.cruiseMs);
  cruise({ speed: t.cruiseMs, seconds: 5 });
  const climbStock = climbFromHere(t.cruiseMs);
  for (const o of opts.slice(1)) {
    seat(id, o.id, o.pack);
    const top = topSpeed(t.cruiseMs);
    cruise({ speed: t.cruiseMs, seconds: 5 });
    const climb = climbFromHere(t.cruiseMs);
    const mass = powerBlock(id, o.id, o.pack)[1];
    /*
     * What the data imply, through the plant's own thrust law at full
     * throttle, T(V) = Ts (1 - V / Vp): more thrust than stock at the stock
     * top speed is a higher top speed, and more thrust per kilogram at the
     * climb speed is a better climb (the drag at a speed barely moves with
     * the mass). Within 3 percent the data imply nothing and nothing is
     * asserted, only reported.
     */
    const thrustAt = (a, v) => a.thrustN * (1 - v / a.pitchSpeedMs);
    const dTop = thrustAt(o, topStock) - thrustAt(stock, topStock);
    const dTopRef = 0.03 * stock.thrustN;
    const perKg = (a, m) => thrustAt(a, t.cruiseMs) / m;
    const dClimb = perKg(o, mass) - perKg(stock, t.massKg);
    const dClimbRef = 0.03 * perKg(stock, t.massKg);
    const parts = [];
    let ok = true;
    if (Math.abs(dTop) > dTopRef) {
      const faster = dTop > 0;
      ok = ok && (faster ? top > topStock : top < topStock);
      parts.push(faster ? 'faster' : 'slower');
    }
    if (Math.abs(dClimb) > dClimbRef) {
      const better = dClimb > 0;
      ok = ok && (better ? climb > climbStock : climb < climbStock);
      parts.push(better ? 'climbs better' : 'climbs worse');
    }
    check(`P7 ${o.id}: ${parts.length ? parts.join(' and ') : 'the data imply no change'}`, ok,
      `${f1(o.thrustN)} N static, ${f1(o.pitchSpeedMs)} m/s pitch speed, ${f2(mass)} kg; top ${f1(top)} against ${f1(topStock)} m/s, climb ${f2(climb)} against ${f2(climbStock)} m/s`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
