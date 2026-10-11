/*
 * prop-curves.js: each stock quad prop's thrust and shaft torque against
 * axial speed, from APC's own performance files, as the plant's
 * axial_curve and torque_curve tables (src/native/plant.c), each over its
 * static value. docs/PROP-CURVES.md says why and what they move.
 *
 * A prop's thrust at a fixed rotor speed falls as the air comes through
 * its disc faster. The plant measures that by mu, the axial speed over
 * the geometric pitch speed (w times the pitch over 2 pi, its k_inflow),
 * and the table is the thrust over the static thrust at mu = 0, 0.1, ...
 * 1.4, read off APC's file at the rotor speed the machine turns at full
 * throttle, interpolated linearly between APC's speed rows. The first
 * entry is 1 by construction, so the hover is untouched.
 *
 * APC's PER3 files are APC's own computation (its blade element model,
 * https://www.apcprop.com/technical-information/performance-data/), not a
 * tunnel measurement; they are fetched from apcprop.com on each run and
 * not copied into this repository. Each stock prop takes its own file
 * where APC makes it, else the file of the nearest pitch over diameter,
 * which PROPS below says.
 *
 *   node scripts/prop-curves.js
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

import { pathToFileURL } from 'node:url';

const APC = 'https://www.apcprop.com/files/PER3_';
/* apcprop.com refuses a request without a browser's user agent. */
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

/*
 * Each stock quad's prop, the APC file its curve is read from, that
 * file's pitch, and the rotor speed it is read at: the machine's own full
 * throttle on a fresh pack (motors-check's static solve), to APC's
 * nearest 1000 rpm row. Then the hangar's other props the same way.
 */
const PROPS = [
  { airframe: 'SIM_AIRFRAME_5IN', prop: 'T-Motor T5147, 5.1 x 4.7 x 3 (pitch over diameter 0.92)', file: '5x46E', pitchIn: 4.6, rpm: 29000,
    why: 'APC makes no T5147; its 5 x 4.6E has the same pitch over diameter, 0.92' },
  { airframe: 'SIM_AIRFRAME_7IN', prop: 'HQ 7 x 3.5 x 3 (0.50)', file: '7x4E', pitchIn: 4, rpm: 19000,
    why: 'APC makes no 7 x 3.5; its 7 x 4E is the nearest pitch over diameter it publishes, 0.57' },
  { airframe: 'SIM_AIRFRAME_10IN', prop: '10 x 5 x 3 (0.50)', file: '10x5E', pitchIn: 5, rpm: 11000,
    why: 'APC\'s 10 x 5E, the same size' },
  { airframe: 'SIM_AIRFRAME_INTERCEPTOR', prop: 'APC 7 x 9E', file: '7x9E', pitchIn: 9, rpm: 19000,
    why: 'its own file' },
  /* The hangar's other props (configs/motors.js), each at its own full
   * throttle on the stock motor (motorStats), printed as the arrays that
   * file holds. */
  { option: 'GF51466', prop: 'Gemfan 51466 V2, 5.1 x 3.6 x 3 (0.71)', file: '5x4E-3', pitchIn: 4, rpm: 31000,
    why: 'APC makes no 5 x 3.6; its 5 x 4E three blade is the nearest pitch over diameter it publishes, 0.80 (its 5 x 3E is 0.60)' },
  { option: 'T5143S', prop: 'T-Motor T5143S, 5.1 x 4.3 x 3 (0.84)', file: '5x43E', pitchIn: 4.3, rpm: 31000,
    why: 'APC makes no T5143S; its 5 x 4.3E is the nearest pitch over diameter it publishes, 0.86' },
];

async function rows(file, rpm) {
  const res = await fetch(`${APC}${file}.dat`, { headers: { 'user-agent': UA } });
  if (!res.ok) {
    throw new Error(`APC ${file}: HTTP ${res.status}`);
  }
  let cur = null;
  const out = [];
  for (const line of (await res.text()).split('\n')) {
    const m = line.match(/PROP RPM =\s+(\d+)/);
    if (m) {
      cur = Number(m[1]);
      continue;
    }
    const f = line.trim().split(/\s+/).map(Number);
    if (cur === rpm && f.length >= 15 && Number.isFinite(f[0]) && Number.isFinite(f[10])) {
      out.push({ v: f[0] * 0.44704, thrust: f[10], torque: f[9] });
    }
  }
  if (out.length < 5) {
    throw new Error(`APC ${file}: no rows at ${rpm} rpm`);
  }
  return out;
}

/* The value at mu, linear between APC's rows, 0 past its last. */
function at(r, key, v) {
  for (let i = 1; i < r.length; i += 1) {
    if (r[i].v >= v) {
      const a = r[i - 1];
      const b = r[i];
      return a[key] + ((v - a.v) / (b.v - a.v)) * (b[key] - a[key]);
    }
  }
  return 0;
}

export async function curves() {
  const out = [];
  for (const p of PROPS) {
    const r = await rows(p.file, p.rpm);
    const pitchSpeed = (p.pitchIn * 0.0254 * p.rpm) / 60;
    const thrust = [];
    const torque = [];
    for (let i = 0; i <= 14; i += 1) {
      const v = (i / 10) * pitchSpeed;
      thrust.push(Math.max(0, at(r, 'thrust', v) / r[0].thrust));
      torque.push(Math.max(0, at(r, 'torque', v) / r[0].torque));
    }
    thrust[0] = 1;
    torque[0] = 1;
    out.push({ ...p, pitchSpeed, thrust, torque });
  }
  return out;
}

/*
 * THE FIXED WINGS' PROPS (FixedWingParams.axial_curve and torque_curve in
 * src/native/plant_wing.c, docs/FLIGHTMODEL.md "The prop's curves"): each
 * table's thrust and shaft torque over their static values at mu = u /
 * (pitch_speed n), mu = 0, 0.1, ... 2, where pitch_speed is the prop's own
 * geometric pitch speed at full rpm (its pitch times its full rpm), the
 * axis the quads' tables and the hangar's parts already use. The curve is
 * read off APC's file at J = mu times the FILE's pitch over diameter, so a
 * stand in's shape lands on the flown prop's own pitch; at the APC speed
 * row whose tips run as fast as the flown prop's at its full rpm (rpm
 * times the flown diameter over the file's), straight between APC's rows.
 *
 * Unlike a quad's, a wing's curve goes on past the thrust's zero: the
 * prop windmills and drags (docs/FLIGHTMODEL.md "The prop's torque, from
 * the drive"). Past APC's last row, FITTED: the thrust goes on falling
 * straight at its last three rows' least squares slope in mu, and the
 * torque goes on falling straight with the thrust at the last three rows'
 * slope of Cp over its static value against Ct over its (the method of
 * scripts/cp-tail-derive.js, 1.38 to 1.83 across the fleet's sizes). The
 * plant goes on past mu = 2 along the last two entries.
 *
 * files lists APC's file and its weight: two files of either side of the
 * flown prop's pitch over diameter are taken straight between where APC
 * makes neither. A ducted fan and a jet are no prop; their tables keep
 * their own sourced straight line and are not listed.
 */
export const WINGS = [
  { table: 'FW_WING1000', prop: '6 x 4', diaIn: 6, pitchIn: 4, rpm: 17612, files: [['6x4E', 6, 4, 1]], why: 'APC\'s 6 x 4E, the same size' },
  { table: 'FW_SKY1800', prop: '11 x 5.5', diaIn: 11, pitchIn: 5.5, rpm: 11951, files: [['11x55E', 11, 5.5, 1]], why: 'APC\'s 11 x 5.5E, the same size' },
  { table: 'FW_CUB1400', prop: '11 x 7, two blade', diaIn: 11, pitchIn: 7, rpm: 8019.75, files: [['11x7E', 11, 7, 1]], why: 'APC\'s 11 x 7E, the same size' },
  { table: 'FW_CUB1400F', prop: '11 x 7, two blade', diaIn: 11, pitchIn: 7, rpm: 8019.75, files: [['11x7E', 11, 7, 1]], why: 'APC\'s 11 x 7E, the same size' },
  { table: 'FW_RADIAN2000', prop: '9.75 x 7.5 folding (pitch over diameter 0.77)', diaIn: 9.75, pitchIn: 7.5, rpm: 9057.6, files: [['9x75E', 9, 7.5, 1]], why: 'APC makes no 9.75 x 7.5 or folding blade; its 9 x 7.5E is the nearest pitch over diameter it publishes, 0.83 (its 10 x 7E is 0.70)' },
  { table: 'FW_BRAMOR2300', prop: '12 x 8 folding', diaIn: 12, pitchIn: 8, rpm: 8868.9, files: [['12x8E', 12, 8, 1]], why: 'APC makes no folding blade; its 12 x 8E, the same size' },
  { table: 'FW_SLOWSTICK1180', prop: 'GWS EP1180, 11 x 8', diaIn: 11, pitchIn: 8, rpm: 3299.7, files: [['11x8E', 11, 8, 1]], why: 'APC makes no GWS slow flyer; its 11 x 8E, the same size (its slow flyers stop at 11 x 7SF)' },
  { table: 'FW_TIMBER1500', prop: '11 x 7.5 three blade (0.68)', diaIn: 11, pitchIn: 7.5, rpm: 10064, files: [['11x7E-3', 11, 7, 1]], why: 'APC makes no 11 x 7.5 three blade; its 11 x 7E three blade is the nearest pitch over diameter it publishes, 0.64' },
  { table: 'FW_TIMBER1500F', prop: '11 x 7.5 three blade (0.68)', diaIn: 11, pitchIn: 7.5, rpm: 10064, files: [['11x7E-3', 11, 7, 1]], why: 'APC makes no 11 x 7.5 three blade; its 11 x 7E three blade is the nearest pitch over diameter it publishes, 0.64' },
  { table: 'FW_BOMBSHELL1118', prop: 'Cox 7 x 3.5 (0.50)', diaIn: 7, pitchIn: 3.5, rpm: 9350, files: [['7x3', 7, 3, 0.5], ['7x4', 7, 4, 0.5]], why: 'APC makes no 7 x 3.5; its 7 x 3 and 7 x 4 sport props, 0.43 and 0.57, either side, half each' },
  { table: 'FW_KADET1981', prop: '12 x 6', diaIn: 12, pitchIn: 6, rpm: 9499.6, files: [['12x6', 12, 6, 1]], why: 'APC\'s 12 x 6 sport prop, the same size' },
  { table: 'FW_P51D1450', prop: '14 x 8 four blade (0.57)', diaIn: 14, pitchIn: 8, rpm: 6793.2, files: [['14x8', 14, 8, 1]], why: 'APC makes no four blade 14 x 8; its 14 x 8 sport two blade, the same pitch over diameter' },
  { table: 'FW_ZAGI1219', prop: '5 x 5 carbon', diaIn: 5, pitchIn: 5, rpm: 22000, files: [['5x5E', 5, 5, 1]], why: 'APC\'s 5 x 5E, the same size' },
  { table: 'FW_UGLYSTIK1567', prop: 'APC 12 x 6', diaIn: 12, pitchIn: 6, rpm: 10895, files: [['12x6', 12, 6, 1]], why: 'its own file' },
  { table: 'FW_TIGERMOTH1803', prop: 'APC 12 x 6', diaIn: 12, pitchIn: 6, rpm: 10895, files: [['12x6', 12, 6, 1]], why: 'its own file' },
  { table: 'FW_STRIKER_PROP', prop: '30 x 14 (0.47)', diaIn: 30, pitchIn: 14, rpm: 5000, files: [['27x13E', 27, 13, 1]], why: 'APC publishes no 30 in prop; its 27 x 13E is the nearest pitch over diameter it publishes, 0.48' },
  { table: 'FW_EXTRA3D1308', prop: '13 x 6 wood (0.46)', diaIn: 13, pitchIn: 6, rpm: 11447.8, files: [['13x65E', 13, 6.5, 1]], why: 'APC makes no 13 x 6; its 13 x 6.5E, the table\'s stand in already, 0.50' },
  { table: 'FW_NIGHTTIMBER1200', prop: '13 x 4', diaIn: 13, pitchIn: 4, rpm: 11322, files: [['13x4E', 13, 4, 1]], why: 'APC\'s 13 x 4E, the same size' },
  { table: 'FW_HERCULES3077', prop: 'APC 12 x 8E', diaIn: 12, pitchIn: 8, rpm: 8208.45, files: [['12x8E', 12, 8, 1]], why: 'its own file' },
  { table: 'FW_CAP1702', prop: 'AMZ carbon 18 x 8', diaIn: 18, pitchIn: 8, rpm: 8636, files: [['18x8E', 18, 8, 1]], why: 'APC makes no carbon blade; its 18 x 8E, the same size, its bench static within a few percent of T-Motor\'s' },
  { table: 'FW_SLICK2680', prop: '28 x 10 (0.357)', diaIn: 28, pitchIn: 10, rpm: 6550, files: [['22x8', 22, 8, 1]], why: 'APC publishes no 28 x 10; its 22 x 8 is the nearest pitch over diameter it publishes, 0.364, read at the 28 in tips\' speed' },
];

const MU_N = 21;
const fileCache = new Map();

async function apcText(file) {
  if (!fileCache.has(file)) {
    const res = await fetch(`${APC}${file}.dat`, { headers: { 'user-agent': UA } });
    if (!res.ok) {
      throw new Error(`APC ${file}: HTTP ${res.status}`);
    }
    fileCache.set(file, await res.text());
  }
  return fileCache.get(file);
}

/* Every speed row of a file: J, Ct and Cp. */
function speedRows(text) {
  const out = new Map();
  let cur = null;
  for (const line of text.split('\n')) {
    const m = line.match(/PROP RPM =\s+(\d+)/);
    if (m) {
      cur = Number(m[1]);
      out.set(cur, []);
      continue;
    }
    const f = line.trim().split(/\s+/).map(Number);
    if (cur !== null && f.length >= 9 && f.slice(0, 5).every(Number.isFinite)) {
      out.get(cur).push({ J: f[1], ct: f[3], cp: f[4] });
    }
  }
  return out;
}

/* Least squares slope of y on x over the last three points. */
function tailSlope(xs, ys) {
  const n = xs.length;
  const x = xs.slice(n - 3), y = ys.slice(n - 3);
  const mx = (x[0] + x[1] + x[2]) / 3, my = (y[0] + y[1] + y[2]) / 3;
  return x.reduce((a, xi, i) => a + (xi - mx) * (y[i] - my), 0) / x.reduce((a, xi) => a + (xi - mx) ** 2, 0);
}

/* One APC speed row as the plant's curves at mu, with the FITTED tail. */
function rowCurves(r, pd) {
  const mu = r.map((x) => x.J / pd);
  const t = r.map((x) => x.ct / r[0].ct);
  const p = r.map((x) => x.cp / r[0].cp);
  const tSlope = tailSlope(mu, t);
  const pSlope = tailSlope(t, p);
  const last = r.length - 1;
  const ct = [], cp = [];
  for (let i = 0; i < MU_N; i += 1) {
    const m = i / 10;
    if (m <= mu[last]) {
      let k = 1;
      while (mu[k] < m) k += 1;
      const f = (m - mu[k - 1]) / (mu[k] - mu[k - 1]);
      ct.push(t[k - 1] + f * (t[k] - t[k - 1]));
      cp.push(p[k - 1] + f * (p[k] - p[k - 1]));
    } else {
      const c = t[last] + tSlope * (m - mu[last]);
      ct.push(c);
      cp.push(p[last] + pSlope * (c - t[last]));
    }
  }
  return { ct, cp, muEnd: mu[last] };
}

export async function wingCurves() {
  const out = [];
  for (const w of WINGS) {
    const ct = new Array(MU_N).fill(0), cp = new Array(MU_N).fill(0);
    const ends = [];
    for (const [file, dIn, pIn, weight] of w.files) {
      const all = speedRows(await apcText(file));
      const rpms = [...all.keys()].sort((a, b) => a - b);
      const rpm = w.rpm * w.diaIn / dIn;
      if (rpm < rpms[0] || rpm > rpms[rpms.length - 1]) {
        throw new Error(`${w.table}: APC ${file} has no rows at ${rpm.toFixed(0)} rpm`);
      }
      const lo = rpms.filter((x) => x <= rpm).pop(), hi = rpms.find((x) => x >= rpm);
      const f = hi === lo ? 0 : (rpm - lo) / (hi - lo);
      const a = rowCurves(all.get(lo), pIn / dIn), b = rowCurves(all.get(hi), pIn / dIn);
      for (let i = 0; i < MU_N; i += 1) {
        ct[i] += weight * (a.ct[i] + f * (b.ct[i] - a.ct[i]));
        cp[i] += weight * (a.cp[i] + f * (b.cp[i] - a.cp[i]));
      }
      ends.push(`${file} at ${rpm.toFixed(0)} rpm (rows ${lo}, ${hi}), data to mu ${Math.min(a.muEnd, b.muEnd).toFixed(2)}`);
    }
    ct[0] = 1;
    cp[0] = 1;
    const pitchSpeed = (w.pitchIn * 0.0254 * w.rpm) / 60;
    let zero = NaN;
    for (let i = 1; i < MU_N; i += 1) {
      if (ct[i - 1] > 0 && ct[i] <= 0) zero = (i - 1 + ct[i - 1] / (ct[i - 1] - ct[i])) / 10;
    }
    out.push({ ...w, ct, cp, pitchSpeed, zero, ends });
  }
  return out;
}

/* pathToFileURL, not a template: argv[1] holds a raw path, and a space
 * (the owner's "FDFPV TEMP" folder) is %20 in import.meta.url, so the
 * template never matched and the script exited 0 doing nothing. */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === 'wings') {
    const list = (v) => v.map((x) => x.toFixed(4)).join(', ');
    for (const c of await wingCurves()) {
      console.log(`[${c.table}] ${c.prop}: ${c.ends.join('; ')}; zero thrust at mu ${c.zero.toFixed(3)} (${c.why})`);
      console.log(`  .pitch_speed = ${c.pitchSpeed.toFixed(3)},`);
      console.log(`  .axial_curve = { ${list(c.ct)} },`);
      console.log(`  .torque_curve = { ${list(c.cp)} },`);
    }
    process.exit(0);
  }
  for (const c of await curves()) {
    const list = (v) => v.map((x) => x.toFixed(4)).join(', ');
    console.log(`[${c.airframe ?? c.option}] ${c.prop}: PER3_${c.file}.dat at ${c.rpm} rpm, pitch speed ${c.pitchSpeed.toFixed(1)} m/s (${c.why})`);
    if (c.option) {
      console.log(`const AXIAL_${c.option} = [${list(c.thrust)}];`);
      console.log(`const TORQUE_${c.option} = [${list(c.torque)}];`);
    } else {
      console.log(`  .axial_curve = { ${list(c.thrust)} },`);
      console.log(`  .torque_curve = { ${list(c.torque)} },`);
    }
  }
}
