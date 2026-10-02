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

if (import.meta.url === `file://${process.argv[1]}`) {
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
