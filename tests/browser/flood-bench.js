/*
 * flood-bench.js: the Itaipu flood's cost in Chrome
 * (scripts/lib/flood-bench.js), for scripts/water-bench.js. See
 * flood-bench.html.
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

import { benchFlood } from '../../scripts/lib/flood-bench.js';

const URLS = {
  'flood.wasm': '/dist/flood.wasm',
  'itaipu-flood.json': '/src/maps/itaipu/water/itaipu-flood.json',
  'itaipu-flood.bin': '/src/maps/itaipu/water/itaipu-flood.bin',
  'itaipu-flood-warm-war.bin': '/src/maps/itaipu/water/itaipu-flood-warm-war.bin',
};

async function read(name) {
  const r = await fetch(URLS[name]);
  if (!r.ok) throw new Error(`${URLS[name]}: ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

benchFlood(read, () => performance.now())
  .then((result) => window.__simHarnessResolve({ ok: true, ...result }))
  .catch((e) => window.__simHarnessResolve({ ok: false, errorName: e.name, message: String(e.message) }));
