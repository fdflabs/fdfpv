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
 *   rc-network.de thread 388921, 2014-05-06: a Falcon 28x10 on a DA-120
 *     tachometered at 6,850 rpm.
 *   Desert Aircraft's DA-120 page (desertaircraft.com): idle "1,300" of
 *     "1,300 to 6,900" rpm.
 *   Prop masses: Biela 28x10 322 g (rc-innovations.es), Mejzlik 28x10
 *     288 g and 276 g (lindinger.at listings).
 *   Extreme Flight's 120cc build guide: the "FlowMaster 34 oz." tank.
 *   APC's 17x6E, https://www.apcprop.com/files/PER3_17x6E.dat, at 11,000
 *     rpm: the nearest pitch over diameter APC publishes (0.353 against
 *     0.357) at the same tip speed (249 m/s against 255).
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

/* The full throttle point: the Falcon 28x10's measured 6,850 rpm; HFE's
 * thrust at its simulated 6,900 taken to it by the speed squared. */
const rpmFull = 6850;
const nFull = rpmFull / 60;
const thrustFull = 73.2 * 4.4482216 * (rpmFull / 6900) ** 2;
/* APC's 17x6E at 11,000 rpm, static: Ct 0.0715, Cp 0.0198. The thrust over
 * the power coefficient carries to the 28 x 10, so its torque is
 * T D / (2 pi Ct/Cp). */
const ctOverCp = 0.0715 / 0.0198;
const torqueFull = thrustFull * D / (2 * Math.PI * ctOverCp);

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
 * load). The full throttle torque is the dyno's own at 6,850 rpm, which
 * checks the transfer above. */
const qDyno = dynoAt(1.0, rpmFull);
const qProp = (rpm) => torqueFull * (rpm / rpmFull) ** 2;
/* Each throttle's steady speed: where the engine's torque meets the prop's. */
function steadyRpm(th) {
  let lo = 2000, hi = 8000;
  if (dynoAt(th, lo) < qProp(lo)) return null;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    const q = dynoAt(th, mid);
    if (q != null && q > qProp(mid)) lo = mid; else hi = mid;
  }
  return lo;
}

/* The stick runs the throttle from the carburettor's idle stop to full.
 * Its speed at a throttle position s, of full: the dyno's crossing at
 * 20 percent and up; from the idle's 1,300 rpm at the stop to the 20
 * percent crossing straight, where HFE ran nothing (FITTED: the dyno
 * starts at 2,000 rpm). Full is the measured 6,850 by construction. */
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
console.log(`full throttle: ${rpmFull} rpm, thrust ${f(thrustFull, 1)} N (HFE 73.2 lb at 6,900), torque ${f(torqueFull, 3)} N m (dyno at ${rpmFull}: ${f(qDyno, 2)}), power ${f(powerFull / 1000, 2)} kW (HFE max 7.1)`);
console.log(`steady rpm by throttle (dyno against the prop): ${[0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((t) => `${t * 100}% ${f(steadyRpm(t), 0)}`).join(', ')}`);
console.log(`the stick's curve, rpm over full at 0, 0.1, ... 1: ${curve.map((c) => f(c)).join(' ')}`);
console.log(`the glow method's straight line there: ${curve.map((_, i) => f(idle + (1 - idle) * i / 10)).join(' ')}`);
console.log(`rotor J ${f(jProp, 5)} kg m^2 (blades ${f(0.7 * propMass * R * R / 3, 5)}), J w_f / Q_f ${f(jProp * wFull / torqueFull, 3)} s`);
console.log(`fuel: full ${f(flowFull * 60e6, 1)} cc/min, tank ${f(tank * 1e6, 0)} cc, ${f(tank / flowFull / 60, 1)} min at full`);
console.log(`spool 63/90 percent of the thrust, ms: idle to full ${stepTimes(0, 1)}, half to full ${stepTimes(0.5, 1)}, full to half ${stepTimes(1, 0.5)}, idle to half ${stepTimes(0, 0.5)}`);
console.log('\nThe Slick table\'s engine lines (plant_wing.c, FixedWingParams):');
console.log(`  .thrust_static = ${f(thrustFull, 2)}, /* N, HFE's 28x10 at 6,900 rpm to the measured 6,850, npm run da120:derive */`);
console.log(`  .pitch_speed = ${f(pitch * nFull, 3)}, /* the 10 in pitch at 6,850 rpm */`);
console.log(`  .rpm_no_load = ${f(rpmFull / 0.85, 1)}, /* 6,850 over the plant's 0.85 */`);
console.log(`  .torque_arm = ${f(torqueFull / thrustFull, 5)}, /* the prop's ${f(torqueFull, 2)} N m over its thrust, npm run da120:derive */`);
console.log('  .current_full = 0.0,    /* the engine burns fuel, not the pack */');
console.log(`  .throttle_idle = ${f(idle)}, /* DA's 1,300 rpm idle of the 6,850; throttle_rpm's first, which the tank and the drain key off */`);
console.log(`  .throttle_rpm = { ${curve.map((c) => f(c)).join(', ')} }, /* HFE's part throttle dyno against the prop, npm run da120:derive */`);
console.log(`  .tank_m3 = ${f(tank * 1e6, 1)}e-6, /* the FlowMaster 34 oz */`);
console.log(`  .flow_full = ${f(flowFull * 1e6, 4)}e-6, /* BSFC 575 g/kWh at ${f(powerFull / 1000, 2)} kW, npm run da120:derive */`);
console.log(`  .flow_idle = ${f(idle)} * (${f(flowFull * 1e6, 4)}e-6),`);
console.log('  .lean_frac = 0.05, .lean_gain = 0.05, /* the Bombshell\'s lean run, ESTIMATED */');
console.log(`  .j_prop = ${f(jProp, 5)}, /* the 28 x 10's blades and the crank, ESTIMATED, npm run da120:derive */`);
