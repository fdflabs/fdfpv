/*
 * cp-tail-derive.js: where a prop's power goes past its zero thrust, the
 * method scripts/prop-curves.js wings takes past each file's last row
 * (docs/FLIGHTMODEL.md "The prop's torque, from the drive" and "The
 * prop's curves"). APC's performance files stop at the
 * row where the thrust is gone, and there the prop still takes about a
 * fifth of its static power. Over the last three rows Cp over its static
 * value falls straight with Ct over its; extended, Cp is zero where the
 * air turns the prop with nothing driving it, the windmill. For each prop
 * below, at the rpm given, it prints Cp over its static value at Ct over
 * its static value 0, 0.1, ... 1 (the plant's power table before the prop
 * curves was the 11 x 7E's, CP_OF_CT), the slope of the last three rows
 * and the Ct over its static value the windmill extends to.
 *
 * APC's PER3 files are APC's own computation (its blade element model,
 * https://www.apcprop.com/technical-information/performance-data/); they
 * are fetched from apcprop.com on each run and not copied here, as
 * scripts/prop-curves.js does.
 *
 *   npm run cp:tail
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

const APC = 'https://www.apcprop.com/files/PER3_';
/* apcprop.com refuses a request without a browser's user agent. */
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

/* The old CP_OF_CT's prop first, then the fleet's sizes either side of it. */
const PROPS = [
  ['11x7E', 9000], ['8x4E', 12000], ['11x55E', 11000], ['12x6', 9000], ['12x6E', 10000],
  ['12x8E', 9000], ['13x65E', 10000], ['13x8E', 9000],
];

function rows(text, rpm) {
  let at = null;
  const out = [];
  for (const line of text.split('\n')) {
    const m = /PROP RPM =\s+(\d+)/.exec(line);
    if (m) { at = Number(m[1]); continue; }
    const c = line.trim().split(/\s+/).map(Number);
    if (at === rpm && c.length >= 9 && c.every(Number.isFinite)) out.push({ J: c[1], ct: c[3], cp: c[4] });
  }
  return out;
}

for (const [file, rpm] of PROPS) {
  const res = await fetch(`${APC}${file}.dat`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  const r = rows(await res.text(), rpm);
  const t = r.map((x) => x.ct / r[0].ct);
  const p = r.map((x) => x.cp / r[0].cp);
  const pAt = (c) => {
    for (let i = 1; i < r.length; i += 1) {
      if ((t[i - 1] - c) * (t[i] - c) <= 0) return p[i - 1] + (c - t[i - 1]) * (p[i] - p[i - 1]) / (t[i] - t[i - 1]);
    }
    return NaN;
  };
  const last = [r.length - 3, r.length - 2, r.length - 1];
  const mt = last.reduce((a, i) => a + t[i], 0) / 3, mp = last.reduce((a, i) => a + p[i], 0) / 3;
  const slope = last.reduce((a, i) => a + (t[i] - mt) * (p[i] - mp), 0) / last.reduce((a, i) => a + (t[i] - mt) ** 2, 0);
  const p0 = mp - slope * mt;
  const table = Array.from({ length: 11 }, (_, i) => pAt(i / 10).toFixed(3)).join(' ');
  console.log(`${file.padEnd(7)} at ${rpm}: Cp/Cp0 at Ct/Ct0 0, 0.1, ... 1: ${table}; last rows J ${r[last[0]].J} to ${r[last[2]].J}: slope ${slope.toFixed(3)}, Cp/Cp0 ${p0.toFixed(3)} at no thrust, windmill at Ct/Ct0 ${(-p0 / slope).toFixed(3)}`);
}
