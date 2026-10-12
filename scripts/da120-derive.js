/*
 * da120-derive.js: the Slick 580's engine, a DA-120 on a 28 x 10, as the
 * plant's glow method takes an engine (docs/FLIGHTMODEL.md "The Slick's
 * DA-120"): the static thrust, the torque and the speed at full throttle,
 * the rotor's inertia, the idle, the tank, and the throttle's real curve
 * from the stick to the engine's speed, read off HFE's part throttle dyno.
 * It prints each number with its source and the FixedWingParams lines the
 * Slick's table takes, and how fast the plant's spool answers the stick
 * with them. Run with npm run da120:derive.
 *
 * Sources, each quoted in docs/FLIGHTMODEL.md:
 *   HFE International, DA120 EFI Data Sheet, HFEDCN0810 Rev A,
 *     https://hfe.aero/wp-content/uploads/2025/11/DA120-Data-Sheet.pdf:
 *     fig. 1 the full throttle power, fig. 3 the part throttle torque at
 *     20 to 100 percent throttle from 2,000 to 8,000 rpm ("All data points
 *     are +/-10%"), the propeller table's 28x10 at "6900" rpm and "73.2"
 *     lb of thrust (estimated via simulation, +/-5 percent), BSFC "575
 *     g/kWh".
 *   Falcon Propeller's test chart, its DA 120CC column,
 *     https://www.falconpropellers.com/wp-content/uploads/2020/04/Falcon-Propeller-Test-Chart.pdf:
 *     the DA-120 on Falcon's 28 x 10, measured, 6,550 rpm and 31.0 kg of
 *     static thrust: the full throttle point (the Slick lane's,
 *     docs/SLICK-STAGE1.md). HFE's simulated 6,900 rpm and 73.2 lb and a
 *     forum's tachometered 6,850 (rc-network.de thread 388921) are printed
 *     against it; measured beats derived.
 *   Desert Aircraft's DA-120 page (desertaircraft.com): idle "1,300" of
 *     "1,300 to 6,900" rpm.
 *   Prop masses: Biela 28x10 322 g (rc-innovations.es), Mejzlik 28x10
 *     288 g and 276 g (lindinger.at listings).
 *   Extreme Flight's 120cc build guide: the "FlowMaster 34 oz." tank.
 *   APC's 22x8, https://www.apcprop.com/files/PER3_22x8.dat, static Ct
 *     and Cp at 6,000 and 7,000 rpm, the Slick table's torque transfer
 *     (pitch over diameter 0.364 against 0.357); APC's 17x6E at 11,000
 *     rpm, the nearest pitch over diameter at the same tip speed, is
 *     printed against it.
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

const rho = 1.225;
const IN = 0.0254;
const D = 28 * IN, pitch = 10 * IN, R = D / 2;

/* The full throttle point: Falcon's measured 6,550 rpm and 31.0 kg. */
const rpmFull = 6550;
const nFull = rpmFull / 60;
const thrustFull = 31.0 * 9.81;
/* APC's 22x8 static, Ct and Cp straight between 6,000 and 7,000 rpm
 * (0.0665, 0.0182; 0.0678, 0.0184): their ratio carries to the 28 x 10,
 * so its torque is T D Cp / (2 pi Ct). FITTED: APC publishes no 28 x 10. */
const fr = (rpmFull - 6000) / 1000;
const ctOverCp = (0.0665 + fr * (0.0678 - 0.0665)) / (0.0182 + fr * (0.0184 - 0.0182));
const torqueFull = thrustFull * D / (2 * Math.PI * ctOverCp);
/* The alternatives, printed against it: HFE's simulated point taken to
 * 6,550 by the speed squared, and APC's 17x6E's Ct/Cp, 0.0715 / 0.0198. */
const thrustHfe = 73.2 * 4.4482216 * (rpmFull / 6900) ** 2;
const torque17x6 = thrustFull * D / (2 * Math.PI * (0.0715 / 0.0198));

/* HFE fig. 3, the part throttle torque, N m, read off the plot at each
 * 500 rpm column (a reading is within 0.1 N m of the marker; the data are
 * +/-10 percent). Rows are throttle positions, columns 2,000 to 8,000 rpm;
 * null where HFE ran no point. */
const RPM = [2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000, 6500, 7000, 7500, 8000];
const DYNO = {
  1.0: [8.0, 8.4, 8.7, 9.3, 9.6, 9.9, 10.3, 10.2, null, 10.1, 9.8, 9.4, 8.8],
  0.9: [7.3, 8.1, 8.3, 8.9, 9.0, 9.1, 9.2, 9.3, null, 9.7, 9.2, 9.0, 8.6],
  0.8: [7.2, 8.1, 8.2, 8.8, 8.9, 9.1, 9.1, 8.9, null, 9.5, 9.1, 8.7, 8.2],
  0.7: [7.2, 7.9, 8.0, 8.4, 8.4, 8.5, 8.6, 8.4, null, 8.4, 8.3, 7.9, 7.5],
  0.6: [6.9, 7.4, 7.4, 7.5, 7.4, 7.6, 7.6, 7.8, null, 7.2, 7.2, 6.5, null],
  0.5: [6.4, 6.5, 6.3, 5.9, 5.7, 5.8, 5.9, 5.8, null, 5.4, 5.0, null, null],
  0.4: [5.8, 5.9, 5.2, 4.5, 4.2, 4.1, 4.4, 3.2, null, null, null, null, null],
  0.3: [4.3, 4.9, 3.5, 2.8, 2.5, 3.1, 2.5, null, null, null, null, null, null],
  0.2: [2.4, 2.3, 1.8, 1.5, 1.5, null, null, null, null, null, null, null, null],
};
function dynoAt(th, rpm) {
  const row = DYNO[th];
  const pts = RPM.map((r, i) => [r, row[i]]).filter((p) => p[1] != null);
  for (let i = 1; i < pts.length; i += 1) {
    if (rpm <= pts[i][0]) return pts[i - 1][1] + (rpm - pts[i - 1][0]) * (pts[i][1] - pts[i - 1][1]) / (pts[i][0] - pts[i - 1][0]);
  }
  return null; /* past HFE's last point at this throttle */
}

/* The prop's static torque goes with its speed squared (the plant's spool
 * load). */
/* HFE's engine is fuel injected; Falcon's carburetted one turns the prop
 * slower, so every dyno row is scaled by the prop's torque at 6,550 over
 * the dyno's own there, inside its +/-10 percent. */
const qDyno = dynoAt(1.0, rpmFull);
const dynoScale = torqueFull / qDyno;
/* The tips' Mach number lifts a big prop's load (plant_wing.c CP_MACH,
 * APC's 22x8 rows): the load over the measured full point's own. */
const CP_MACH = [1.000, 1.011, 1.049, 1.191, 1.532, 1.941];
const cpMach = (m) => { const x = (m - 0.5) / 0.1; if (!(x > 0)) return 1; if (x >= 5) return CP_MACH[5]; const i = Math.floor(x); return CP_MACH[i] + (x - i) * (CP_MACH[i + 1] - CP_MACH[i]); };
const tip = (rpm) => Math.PI * D * rpm / 60 / 340;
const qProp = (rpm) => torqueFull * (rpm / rpmFull) ** 2 * cpMach(tip(rpm)) / cpMach(tip(rpmFull));
/* Each throttle's steady speed: where the engine's torque meets the prop's. */
function steadyRpm(th) {
  let lo = 2000, hi = 8000;
  if (dynoScale * dynoAt(th, lo) < qProp(lo)) return null;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    const q = dynoAt(th, mid);
    if (q != null && dynoScale * q > qProp(mid)) lo = mid; else hi = mid;
  }
  return lo;
}

/* The stick runs the throttle from the carburettor's idle stop to full.
 * Its speed at a throttle position s, of full: the dyno's crossing at
 * 20 percent and up; from the idle's 1,300 rpm at the stop to the 20
 * percent crossing straight, where HFE ran nothing (FITTED: the dyno
 * starts at 2,000 rpm). Full is the measured 6,550 by construction. */
const rpmIdle = 1300;
const idle = rpmIdle / rpmFull;
const curve = [];
for (let i = 0; i <= 10; i += 1) {
  const s = i / 10;
  let r;
  if (i === 0) r = rpmIdle;
  else if (i === 10) r = rpmFull;
  else if (i === 1) r = (rpmIdle + steadyRpm(0.2)) / 2;
  else r = Math.min(rpmFull, steadyRpm(Math.round(s * 10) / 10));
  curve.push(r / rpmFull);
}
/* The plant's speed is monotonic in the stick; where the dyno's +/-10
 * percent puts a higher throttle's crossing under a lower one's (80 and
 * 90 percent), the higher takes the lower's. */
for (let i = 1; i < curve.length; i += 1) curve[i] = Math.max(curve[i], curve[i - 1]);

/*
 * THE ENGINE'S MAP for the plant (FixedWingParams.engine_q): its torque,
 * N m, at the stick's idle stop and at 20, 30, ... 100 percent throttle,
 * across 1,000 to 8,000 rpm in 500s, the dyno's rows scaled as above.
 * Where HFE ran no point inside a row it is straight between its
 * neighbours; under 2,000 rpm straight on from its first two (FITTED);
 * past its last point it falls to nothing a column on, where HFE says the
 * engine stopped producing torque, and on at the closed throttle's slope. The idle stop is
 * the row HFE could not run: the torque that holds the prop's static load
 * at DA's 1,300 rpm, falling with the speed as the 20 percent row's least
 * squares slope does (FITTED: the nearest measured throttle). A closed
 * throttle's engine torque falls through zero as the speed rises, its
 * friction and pumping outgrowing what the idle's air burns, so a prop the
 * air drives faster is braked by it.
 */
const MAP_RPM = Array.from({ length: 15 }, (_, i) => 1000 + 500 * i);
const lsSlope = (() => {
  const pts = RPM.map((r, i) => [r, DYNO[0.2][i]]).filter((q) => q[1] != null);
  const mx = pts.reduce((a, q) => a + q[0], 0) / pts.length, my = pts.reduce((a, q) => a + q[1], 0) / pts.length;
  return dynoScale * pts.reduce((a, q) => a + (q[0] - mx) * (q[1] - my), 0) / pts.reduce((a, q) => a + (q[0] - mx) ** 2, 0);
})();
function rowOf(th) {
  const row = DYNO[th];
  const pts = RPM.map((r, i) => [r, row[i]]).filter((q) => q[1] != null);
  const last = pts[pts.length - 1];
  const at = (rpm) => {
    let a = pts[0], b = pts[1];
    /* Past a row's last point HFE's engine could not hold torque ("low
     * throttle cut off points were determined by the engines ability to
     * produce torque at a given speed"): nothing a column on, then the
     * closed throttle's fall. */
    if (rpm > last[0] && last[0] < 8000) {
      return rpm <= last[0] + 500 ? last[1] * (last[0] + 500 - rpm) / 500 : lsSlope / dynoScale * (rpm - last[0] - 500);
    }
    if (rpm >= last[0]) { a = pts[pts.length - 2]; b = pts[pts.length - 1]; }
    else {
      for (let i = 1; i < pts.length; i += 1) {
        if (rpm <= pts[i][0]) { a = pts[i - 1]; b = pts[i]; break; }
      }
    }
    return a[1] + (rpm - a[0]) * (b[1] - a[1]) / (b[0] - a[0]);
  };
  return MAP_RPM.map((r) => dynoScale * at(r));
}
const stopRow = MAP_RPM.map((r) => qProp(rpmIdle) + lsSlope * (r - rpmIdle));
const MAP = [stopRow, ...[0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0].map(rowOf)];
const stopZero = rpmIdle - qProp(rpmIdle) / lsSlope;

/* The rotor: 0.7 of the blades' rod inertia (the fleet's convention,
 * docs/FLIGHTMODEL.md PR 3) on the three listed 28 x 10 masses' mean,
 * plus the crank, the hub and the 5 in spinner, ESTIMATED at 0.0006 kg
 * m^2 (a 0.8 kg crank at 30 mm, the ignition's 0.1 kg rotor at 30 mm, a
 * 60 g spinner at 50 mm). */
const propMass = (0.322 + 0.288 + 0.276) / 3;
const jProp = 0.7 * propMass * R * R / 3 + 0.0006;

/* The tank and the flow: BSFC 575 g/kWh at the full throttle power, on
 * pump petrol with 40:1 oil, 0.74 kg/l (ESTIMATED, petrol's 0.72 to 0.76),
 * linear in the stick from the idle's share of it, the glow method's. */
const powerFull = torqueFull * 2 * Math.PI * nFull;
const flowFull = 575 / 1000 * powerFull / 1000 / 3600 / 0.74 / 1000; /* m^3/s */
const tank = 34 * 29.5735e-6;

/* The plant's glow spool, prop_spool at its 1 ms step: J w_f n' = Q_f (d^2
 * - n^2), d the duty the stick asks for. Times to 63 and 90 percent of the
 * thrust's change between two sticks. */
const wFull = 2 * Math.PI * nFull;
const duty = (stick) => {
  const x = stick * 10;
  const i = Math.min(9, Math.floor(x));
  return curve[i] + (x - i) * (curve[i + 1] - curve[i]);
};
function stepTimes(s0, s1) {
  const d0 = duty(s0), d1 = duty(s1);
  let n = d0;
  const t0 = d0 * d0, t1 = d1 * d1;
  let t63 = null, t90 = null;
  for (let ms = 1; ms < 10000 && t90 == null; ms += 1) {
    n += 0.001 * torqueFull * (d1 * d1 - n * n) / (jProp * wFull);
    const f = (n * n - t0) / (t1 - t0);
    if (t63 == null && f >= 0.632) t63 = ms;
    if (f >= 0.9) t90 = ms;
  }
  return `${t63}/${t90}`;
}

const f = (x, d = 4) => Number(x).toFixed(d);
console.log('da120 derive: the Slick 580\'s engine and prop, docs/FLIGHTMODEL.md');
console.log(`full throttle: ${rpmFull} rpm, thrust ${f(thrustFull, 1)} N (Falcon, measured; HFE's simulated point there ${f(thrustHfe, 1)}), torque ${f(torqueFull, 3)} N m (APC 17x6E's ratio ${f(torque17x6, 3)}; HFE's dyno at ${rpmFull}: ${f(qDyno, 2)}, scaled by ${f(dynoScale, 3)}), power ${f(powerFull / 1000, 2)} kW (HFE max 7.1)`);
console.log(`steady rpm by throttle (dyno against the prop): ${[0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((t) => `${t * 100}% ${f(steadyRpm(t), 0)}`).join(', ')}`);
console.log(`the stick's curve, rpm over full at 0, 0.1, ... 1: ${curve.map((c) => f(c)).join(' ')}`);
console.log(`the glow method's straight line there: ${curve.map((_, i) => f(idle + (1 - idle) * i / 10)).join(' ')}`);
console.log(`rotor J ${f(jProp, 5)} kg m^2 (blades ${f(0.7 * propMass * R * R / 3, 5)}), J w_f / Q_f ${f(jProp * wFull / torqueFull, 3)} s`);
console.log(`fuel: full ${f(flowFull * 60e6, 1)} cc/min, tank ${f(tank * 1e6, 0)} cc, ${f(tank / flowFull / 60, 1)} min at full`);
console.log(`spool 63/90 percent of the thrust, ms: idle to full ${stepTimes(0, 1)}, half to full ${stepTimes(0.5, 1)}, full to half ${stepTimes(1, 0.5)}, idle to half ${stepTimes(0, 0.5)}`);
console.log('\nThe Slick table\'s engine lines (plant_wing.c, FixedWingParams):');
console.log(`  .thrust_static = ${f(thrustFull, 2)}, /* N, Falcon's measured 31.0 kg on the 28 x 10, npm run da120:derive */`);
console.log(`  .pitch_speed = ${f(pitch * nFull, 3)}, /* the 10 in pitch at 6,550 rpm */`);
console.log(`  .rpm_no_load = ${f(rpmFull / 0.85, 1)}, /* 6,550 over the plant's 0.85 */`);
console.log(`  .torque_arm = ${f(torqueFull / thrustFull, 5)}, /* the prop's ${f(torqueFull, 2)} N m over its thrust, npm run da120:derive */`);
console.log('  .current_full = 0.0,    /* the engine burns fuel, not the pack */');
console.log(`  .throttle_idle = ${f(idle)}, /* DA's 1,300 rpm idle of the 6,550; throttle_rpm's first, which the tank and the drain key off */`);
console.log(`  .throttle_rpm = { ${curve.map((c) => f(c)).join(', ')} }, /* HFE's part throttle dyno against the prop, npm run da120:derive */`);
console.log(`  .tank_m3 = ${f(tank * 1e6, 1)}e-6, /* the FlowMaster 34 oz */`);
console.log(`  .flow_full = ${f(flowFull * 1e6, 4)}e-6, /* BSFC 575 g/kWh at ${f(powerFull / 1000, 2)} kW, npm run da120:derive */`);
console.log(`  .flow_idle = ${f(idle)} * (${f(flowFull * 1e6, 4)}e-6),`);
console.log('  .lean_frac = 0.05, .lean_gain = 0.05, /* the Bombshell\'s lean run, ESTIMATED */');
console.log(`  .j_prop = ${f(jProp, 5)}, /* the 28 x 10's blades and the crank, ESTIMATED, npm run da120:derive */`);
console.log(`\nthe idle stop's torque: ${f(qProp(rpmIdle), 3)} N m at 1,300 rpm, falling ${f(-lsSlope * 1000, 3)} N m a 1,000 rpm (the 20 percent row's), zero at ${f(stopZero, 0)} rpm`);
console.log('  .engine_q = {');
MAP.forEach((row, i) => console.log(`    { ${row.map((x) => f(x, 3)).join(', ')} }, /* ${i === 0 ? 'the idle stop' : `${(i + 1) * 10} percent`} */`));
console.log('  }, /* N m at 1,000 to 8,000 rpm in 500s, npm run da120:derive */');
