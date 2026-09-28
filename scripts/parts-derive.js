/*
 * parts-derive.js: the prop numbers in configs/prop-estimates.js, from
 * APC's published performance data, so each can be checked and redone.
 *
 * A prop swap on a motor or engine the pilot already chose. Every option
 * in configs/power.js turns its own prop at a known full throttle point:
 * its loaded rpm (the pitch speed over the pitch) and its static thrust
 * and current. That prop is stood in for by APC's nearest (PROXY below,
 * the kit's own where APC makes it) and the new prop is compared with it
 * on the same motor, anchored to the option's figures, so the option's
 * own prop reproduces them exactly and only the ratio comes from APC:
 *
 *   ELECTRIC. A DC motor's torque falls linearly with its speed to nothing
 *   at its no load rpm, so its line runs through the option's operating
 *   point (loaded rpm, the proxy's torque there) and (no load rpm, 0). The
 *   new prop runs where its torque meets that line. Thrust scales by APC's
 *   thrust at the new point over the proxy's at the old; the current, less
 *   the no load current nobody publishes, by the torque. The no load rpm
 *   is the motor's and does not change.
 *
 *   GLOW. An engine at full throttle near its rated speed gives about the
 *   same shaft power whatever it turns (Menon's measured curves are flat
 *   there), so the new prop runs where it absorbs the proxy's power:
 *   P = Cp rho n^3 D^5, n_new = n cbrt(Cp_old D_old^5 / (Cp_new D_new^5)),
 *   Cp from APC's torque at the rpm; the method power-derive.js uses for a
 *   new engine on a new prop, at the same power.
 *
 * Each prop's mass is APC's published weight, and a kit's own prop that
 * APC does not make takes its proxy's. Run:
 *
 *   node scripts/parts-derive.js [--cache=<dir>] [--write]
 *
 * APC's files are fetched from apcprop.com, or the Internet Archive's copy
 * when apcprop.com does not answer, or read from --cache (a directory of
 * <prop>.dat files as APC names them); they are APC's and not copied into
 * this repository. --write regenerates configs/prop-estimates.js.
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

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POWER } from '../configs/power.js';
import { PROPS, propProxy } from '../configs/hangar-parts.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const cacheArg = args.find((a) => a.startsWith('--cache='));
const cache = cacheArg ? cacheArg.slice('--cache='.length) : null;
const write = args.includes('--write');
const IN = 0.0254;

async function apcText(prop) {
  if (cache) {
    return readFile(join(cache, `${prop}.dat`), 'utf8');
  }
  for (const url of [`https://www.apcprop.com/files/PER3_${prop}.dat`, `https://web.archive.org/web/2024id_/https://www.apcprop.com/files/PER3_${prop}.dat`]) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return await res.text();
      }
    } catch {
      /* the next source */
    }
  }
  throw new Error(`APC ${prop}: no source answered`);
}

/* Each rpm block's static (V = 0) row: rpm, torque N m, thrust N. */
const tables = new Map();
async function apcStatic(prop) {
  if (tables.has(prop)) {
    return tables.get(prop);
  }
  const rows = [];
  let rpm = null;
  for (const line of (await apcText(prop)).split('\n')) {
    const m = line.match(/PROP RPM =\s+(\d+)/);
    if (m) {
      rpm = Number(m[1]);
      continue;
    }
    const f = line.trim().split(/\s+/).map(Number);
    if (rpm != null && f.length >= 15 && f[0] === 0 && Number.isFinite(f[3])) {
      rows.push({ rpm, torque: f[9], thrust: f[10] });
      rpm = null;
    }
  }
  if (rows.length < 2) {
    throw new Error(`APC ${prop}: no static rows parsed`);
  }
  tables.set(prop, rows);
  return rows;
}

/* Torque and thrust go as rpm squared between APC's rpm blocks. */
function at(rows, rpm, key) {
  const k = (r) => r[key] / (r.rpm * r.rpm);
  if (rpm <= rows[0].rpm) {
    return k(rows[0]) * rpm * rpm;
  }
  for (let i = 1; i < rows.length; i += 1) {
    if (rpm <= rows[i].rpm) {
      const a = rows[i - 1];
      const b = rows[i];
      return (k(a) + ((rpm - a.rpm) / (b.rpm - a.rpm)) * (k(b) - k(a))) * rpm * rpm;
    }
  }
  return k(rows[rows.length - 1]) * rpm * rpm;
}

/* The loaded rpm an option's figures imply: its pitch speed over its
 * prop's pitch. */
function loadedRpm(o) {
  return (o.pitchSpeedMs * 60) / (o.pitchIn * IN);
}

async function derive(o, prop) {
  const a = await apcStatic(propProxy(o));
  const b = await apcStatic(prop.apc);
  const n0 = loadedRpm(o);
  const q0 = at(a, n0, 'torque');
  let n = n0;
  if (o.kind === 'electric') {
    const nl = o.rpmNoLoad;
    let lo = 1;
    let hi = nl;
    for (let k = 0; k < 200; k += 1) {
      n = (lo + hi) / 2;
      if (q0 * ((nl - n) / (nl - n0)) > at(b, n, 'torque')) {
        lo = n;
      } else {
        hi = n;
      }
    }
  } else {
    /* Equal power: q0 n0 = q(n) n, solved by bisection on the torque's own
     * curve rather than a Cp read at one rpm. */
    let lo = 100;
    let hi = 60000;
    for (let k = 0; k < 200; k += 1) {
      n = (lo + hi) / 2;
      if (at(b, n, 'torque') * n < q0 * n0) {
        lo = n;
      } else {
        hi = n;
      }
    }
  }
  const thrustN = o.thrustN * (at(b, n, 'thrust') / at(a, n0, 'thrust'));
  const out = {
    thrustN: Number(thrustN.toFixed(4)),
    pitchSpeedMs: Number(((n * prop.pitchIn * IN) / 60).toFixed(4)),
  };
  if (o.kind === 'electric') {
    out.currentA = Number((o.currentA * (at(b, n, 'torque') / q0)).toFixed(3));
  } else {
    out.rpmNoLoad = Number((n / 0.85).toFixed(1));
  }
  return { ...out, rpm: n, n0 };
}

const table = {};
for (const [id, props] of Object.entries(PROPS)) {
  const options = POWER[id];
  for (const prop of props.slice(1)) {
    for (const o of options) {
      const d = await derive(o, prop);
      table[id] ??= {};
      table[id][o.id] ??= {};
      const { rpm, n0, ...keep } = d;
      table[id][o.id][prop.id] = keep;
      console.log(`${id} ${o.id} (${propProxy(o)} at ${n0.toFixed(0)} rpm, ${o.thrustN.toFixed(2)} N) to APC ${prop.apc}: `
        + `${rpm.toFixed(0)} rpm, ${keep.thrustN} N, pitch speed ${keep.pitchSpeedMs} m/s`
        + `${keep.currentA != null ? `, ${keep.currentA} A` : ''}`);
    }
  }
}

if (write) {
  const head = `/*
 * prop-estimates.js: GENERATED by node scripts/parts-derive.js --write; do
 * not edit. For every prop the hangar's Parts tab offers in place of an
 * option's own (configs/hangar-parts.js PROPS), on every power option of
 * that plane (configs/power.js): the static thrust, N, and the pitch speed,
 * m/s, it makes on that motor or engine at full throttle, and the static
 * current, A, of an electric motor or the full rpm over 0.85 of a glow
 * engine. From APC's published data, anchored to the option's own
 * figures; scripts/parts-derive.js says how.
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

export const PROP_ESTIMATES = ${JSON.stringify(table, null, 2).replace(/"([a-zA-Z_][a-zA-Z0-9_]*)":/g, '$1:')};
`;
  await writeFile(join(root, 'configs/prop-estimates.js'), head);
  console.log('wrote configs/prop-estimates.js');
}
