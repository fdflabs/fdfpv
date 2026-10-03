/*
 * flood.js: dist/flood.wasm (src/sim/water/flood.c) wrapped for a host.
 *
 * Runs unchanged in Node and the browser: the caller hands over the
 * module's bytes. Every number that decides where the water goes is
 * computed inside the module; this file only moves the host's figures in
 * and the state's views out, so nothing here can make two machines'
 * floods differ. The views are made fresh on every call, since the
 * module's memory may grow and a view made before that is detached.
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

/* The grid's edges and the kinds of boundary and link, as flood.c
 * numbers them. */
export const SIDE = { west: 0, east: 1, north: 2, south: 3 };
export const BOUND = { stage: 1, inflow: 2, rating: 3 };
export const LINK = { opening: 1, pipe: 2, fixed: 3 };

/* Standard gravity, flood.c's G. */
export const G = 9.80665;

function stubImports() {
  /* Any libc shim the toolchain asks for resolves to a function
   * returning 0; the solver calls none of them. */
  const mods = new Map();
  return new Proxy({}, {
    get(_t, name) {
      if (!mods.has(name)) {
        mods.set(name, new Proxy({}, { get: () => () => 0 }));
      }
      return mods.get(name);
    },
  });
}

function must(code, what) {
  if (code < 0) {
    throw new Error(`flood: ${what} refused (${code})`);
  }
  return code;
}

export async function loadFlood(wasmBytes) {
  const { instance } = await WebAssembly.instantiate(wasmBytes, stubImports());
  const e = instance.exports;
  if (typeof e._initialize === 'function') {
    e._initialize();
  }
  let n = 0;
  const f64 = (ptr) => new Float64Array(e.memory.buffer, ptr, n);
  /* Scratch in the module's heap for lists the host passes in. */
  const withInts = (list, fn) => {
    const p = e.malloc(Math.max(1, list.length) * 4);
    new Int32Array(e.memory.buffer, p, list.length).set(list);
    try {
      return fn(p);
    } finally {
      e.free(p);
    }
  };
  const withDoubles = (list, fn) => {
    const p = e.malloc(Math.max(1, list.length) * 8);
    new Float64Array(e.memory.buffer, p, list.length).set(list);
    try {
      return fn(p);
    } finally {
      e.free(p);
    }
  };
  return {
    e,
    init(nx, nz, x0, z0, dx, dt) {
      must(e.flood_init(nx, nz, x0, z0, dx, dt), 'init');
      n = nx * nz;
    },
    bed: () => f64(e.flood_bed()),
    h: () => f64(e.flood_h()),
    hu: () => f64(e.flood_hu()),
    hv: () => f64(e.flood_hv()),
    cls: () => new Uint8Array(e.memory.buffer, e.flood_cls(), n),
    fx: () => f64(e.flood_fx()),
    fz: () => f64(e.flood_fz()),
    setManning: (k, nValue) => must(e.flood_set_manning(k, nValue), `manning ${k}`),
    bound: (side, k0, k1, type, a) => must(e.flood_bound(side, k0, k1, type, a), 'bound'),
    boundSet: (i, a) => must(e.flood_bound_set(i, a), 'bound set'),
    boundVol: (i) => e.flood_bound_vol(i),
    boundRate: (i) => e.flood_bound_rate(i),
    link(type, up, down) {
      return withInts(up, (pu) => withInts(down, (pd) => must(e.flood_link(type, pu, up.length, pd, down.length), 'link')));
    },
    linkTail(i, tail) {
      return withInts(tail, (p) => must(e.flood_link_tail(i, p, tail.length), 'link tail'));
    },
    /* bands: [[lo, hi, width, cd]...], elevations in metres. */
    linkBands: (i, bands) => withDoubles(bands.flat(), (p) => must(e.flood_link_bands(i, p, bands.length), 'bands')),
    linkDir: (i, dx, dz) => must(e.flood_link_dir(i, dx, dz), 'link dir'),
    linkPipe: (i, z, area, loss, c) => must(e.flood_link_pipe(i, z, area, loss, c), 'link pipe'),
    linkQ: (i) => e.flood_link_q(i),
    linkVol: (i) => e.flood_link_vol(i),
    linkLevels: (i) => [e.flood_link_level(i, 0), e.flood_link_level(i, 1)],
    step: (count) => must(e.flood_step(count), 'step'),
    volume: () => e.flood_volume(),
    stat: (k) => e.flood_stat(k),
    /* The state's FNV-1a 64 as 16 hex digits. */
    hash() {
      const p = e.malloc(8);
      try {
        e.flood_hash(p);
        const w = new Uint32Array(e.memory.buffer, p, 2);
        return w[1].toString(16).padStart(8, '0') + w[0].toString(16).padStart(8, '0');
      } finally {
        e.free(p);
      }
    },
  };
}
