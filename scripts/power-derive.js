/*
 * power-derive.js: the derived numbers in configs/power.js, from their
 * published inputs, so each can be checked and redone. docs/POWER-STAGE1.md
 * says why each method is used where it is.
 *
 *   ELECTRIC, a motor on a prop with no bench table: the static full
 *   throttle operating point where the motor's torque, from its kV, Rm and
 *   Io on the pack's nominal 3.7 V a cell, meets the prop's, from APC's
 *   published performance data (static row, interpolated in rpm). Out come
 *   the rpm, the thrust and the current.
 *
 *   GLOW, another engine on the stock engine's aircraft: the stock engine's
 *   measured rpm on its prop, moved to the one the new engine's rated power
 *   turns the new prop at, prop power going as Cp rho n^3 D^5 and thrust as
 *   Ct rho n^2 D^4, Ct and Cp from APC's data for both props. Anchored to
 *   the stock figures so the stock option is exactly the plant's table.
 *
 * APC's files are fetched from apcprop.com on each run (they are APC's, and
 * not copied into this repository). Run: node scripts/power-derive.js
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

/* Each rpm block's static (V = 0) row: rpm, Ct, Cp, torque N m, thrust N. */
async function apcStatic(prop) {
  const res = await fetch(`${APC}${prop}.dat`);
  if (!res.ok) {
    throw new Error(`APC ${prop}: HTTP ${res.status}`);
  }
  const text = await res.text();
  const rows = [];
  let rpm = null;
  for (const line of text.split('\n')) {
    const m = line.match(/PROP RPM =\s+(\d+)/);
    if (m) {
      rpm = Number(m[1]);
      continue;
    }
    const f = line.trim().split(/\s+/).map(Number);
    if (rpm != null && f.length >= 15 && f[0] === 0 && Number.isFinite(f[3])) {
      rows.push({ rpm, ct: f[3], cp: f[4], torque: f[9], thrust: f[10] });
      rpm = null;
    }
  }
  if (rows.length < 2) {
    throw new Error(`APC ${prop}: no static rows parsed`);
  }
  return rows;
}

function interp(rows, rpm, key) {
  if (rpm <= rows[0].rpm) {
    return rows[0][key] * (rpm / rows[0].rpm) ** 2;
  }
  for (let i = 1; i < rows.length; i += 1) {
    if (rpm <= rows[i].rpm) {
      const a = rows[i - 1];
      const b = rows[i];
      /* Torque and thrust go as rpm squared between the blocks. */
      const ka = a[key] / a.rpm ** 2;
      const kb = b[key] / b.rpm ** 2;
      return (ka + ((rpm - a.rpm) / (b.rpm - a.rpm)) * (kb - ka)) * rpm * rpm;
    }
  }
  const z = rows[rows.length - 1];
  return z[key] * (rpm / z.rpm) ** 2;
}

async function electric(name, { kv, rm, io, cells, prop }) {
  const rows = await apcStatic(prop);
  const v = 3.7 * cells;
  const kt = 60 / (2 * Math.PI * kv);
  let lo = 100;
  let hi = kv * v;
  for (let k = 0; k < 100; k += 1) {
    const n = (lo + hi) / 2;
    const i = (v - n / kv) / rm;
    const qm = (i - io) * kt;
    if (qm > interp(rows, n, 'torque')) {
      lo = n;
    } else {
      hi = n;
    }
  }
  const n = lo;
  const i = (v - n / kv) / rm;
  console.log(`${name}: APC ${prop} on ${cells}S (${v.toFixed(1)} V), kV ${kv}, Rm ${rm}, Io ${io}: `
    + `${n.toFixed(0)} rpm, ${interp(rows, n, 'thrust').toFixed(3)} N, ${i.toFixed(2)} A, `
    + `${interp(rows, n, 'torque').toFixed(4)} N m`);
}

async function glow(name, { stockProp, stockRpm, stockThrust, stockPowerW, prop, dStockIn, dIn, powerW }) {
  const a = await apcStatic(stockProp);
  const b = await apcStatic(prop);
  const cpA = interp(a, stockRpm, 'torque') / stockRpm ** 2;
  /* Same shaft power shape: P = k n^3 for each prop, k from APC's torque. */
  let n = stockRpm;
  for (let k = 0; k < 60; k += 1) {
    const cpB = interp(b, n, 'torque') / (n * n);
    n = stockRpm * Math.cbrt((powerW / stockPowerW) * (cpA / cpB));
  }
  const tA = interp(a, stockRpm, 'thrust');
  const tB = interp(b, n, 'thrust');
  console.log(`${name}: APC ${stockProp} to ${prop} (${dStockIn} to ${dIn} in), ${powerW} W over ${stockPowerW} W: `
    + `${n.toFixed(0)} rpm, thrust ${(stockThrust * (tB / tA)).toFixed(3)} N (APC ${tA.toFixed(2)} to ${tB.toFixed(2)} N)`);
}

/* Bombshell, BMJR's electric: Himax HC2816-1220 (Himax/MaxxProd sheet: Rm
 * 0.058, Io 1.4 A) on 3S, on APC's 8x4E, the smallest prop in Himax's
 * 8x4 to 11x4.7 range; BMJR names no prop. */
await electric('bombshell1118 electric', { kv: 1220, rm: 0.058, io: 1.4, cells: 3, prop: '8x4E' });
/* Kadet Senior, SIG's favourite electric (the Sport ARF manual): Himax
 * HC5018-530 (Rm 0.033, Io 1.8 A) on 5S, APC 13x8E, the smallest prop on
 * Himax's chart (SIG's 12x8E is under it). */
await electric('kadet1981 electric', { kv: 530, rm: 0.033, io: 1.8, cells: 5, prop: '13x8E' });
/* Kadet Senior, O.S. four strokes against the stock FS-52S (0.9 bhp, 671
 * W, turning the 12x6 at the measured 9,500 rpm, 27.83 N): the FSa-56II
 * (1.0 ps, 735.5 W) on the same 12x6, and the FS-64V (1.14 ps, 838.5 W) on
 * its sport 13x6. */
await glow('kadet1981 FSa-56II', { stockProp: '12x6', stockRpm: 9500, stockThrust: 27.83, stockPowerW: 671, prop: '12x6', dStockIn: 12, dIn: 12, powerW: 735.5 });
await glow('kadet1981 FS-64V', { stockProp: '12x6', stockRpm: 9500, stockThrust: 27.83, stockPowerW: 671, prop: '13x6', dStockIn: 12, dIn: 13, powerW: 838.5 });
/* Bombshell, a Cox .049 with Cox's own RC throttle (Fly RC's review of the
 * Sure-Start .049: 18,000 rpm on Cox's 5x3), thrust from APC's 5x3. */
{
  const rows = await apcStatic('5x3');
  console.log(`bombshell1118 Cox RC .049: APC 5x3 at 18000 rpm: ${interp(rows, 18000, 'thrust').toFixed(3)} N`);
}
