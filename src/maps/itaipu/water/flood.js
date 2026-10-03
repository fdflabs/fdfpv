/*
 * flood.js: the Itaipu flood, the solver (src/sim/water/flood.js) set up
 * on the map's bed (bed.js) with its boundaries, its gates and its
 * turbines, stepped on the war room's clock (docs/FLOOD.md).
 *
 * THE CLOCK. The flood steps DT_MS at a time. Step 0 is the first step
 * after the warm up (WARM_STEPS from still water with the spillway and
 * the turbines running, the same on every client, so step 0 is the same
 * running river everywhere). An opening whose room time is `at`, counted
 * from the war's start, is applied before step ceil(at / DT_MS): every
 * client applies every opening between the same two steps, so the same
 * openings give the same water to the bit.
 *
 * THE OPENINGS (docs/DAMBREAK-CONTRACT, the lead's): { id, target, kind,
 * at, sill, width_m, height_m, normal }. A gate's opening replaces its
 * link's bands with the hole: from the sill up height_m, width_m wide,
 * at OPENING_CD; a gate standing open has the band under its lip at
 * GATE_CD. Intakes and penstocks come in the extend phase.
 *
 * Every number here is from a source named beside it; water is never
 * scaled.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import {
  BOUND, LINK, SIDE, loadFlood,
} from '../../../sim/water/flood.js';
import { MANNING, floodBed } from './bed.js';

/* The step, ms: a Courant number under 0.3 on the chute's fastest water
 * (some 40 m/s) on the grid's 5.1 m cells (docs/FLOOD.md). */
export const DT_MS = 20;
/* Warm up from still water to the river the turbines run: the wave
 * off the tailrace reaches the grid's south edge in some two minutes,
 * and the river lets out what the turbines give, to 0.04 %, with every
 * station's level still to the millimetre, from 2100 s (measured 2
 * October); 2400 s. */
export const WARM_STEPS = 120000;

/* A radial gate's underflow, the strips formula's Cd: the contraction
 * under a gate lip, Cc 0.61 (Henderson, Open Channel Flow, 1966, 6.2). */
export const GATE_CD = 0.61;
/* A gate gone to its sill, the flow over the ogee crest it stood on:
 * USBR, Design of Small Dams (1987), fig. 9-23, C 2.18 m^0.5/s for a
 * high crest, so Cd = C / ((2/3) sqrt(2 g)) = 0.74. */
export const OPENING_CD = 0.74;
/* A hole torn in a gate's leaf above its sill: a sharp edged notch,
 * Rehbock's Cd 0.611 + 0.075 H / P with the notch's crest high over its
 * approach (Henderson 1966, 6.3); 0.61. */
export const HOLE_CD = 0.61;
/* The turbines' discharge, m3/s: 20 Francis units of 715 MW at their
 * rated flow, 690 m3/s each (Itaipu Binacional, Hidreletrica de Itaipu:
 * Aspectos de Engenharia, 2009, ISBN 978-85-61885-02-1, as cited by the
 * Portuguese Wikipedia's Usina Hidreletrica de Itaipu; 715 MW at 690
 * m3/s and 93 % is a head of 113 m, against the published 118 m design
 * head). It enters across the tailrace where it crosses the grid. */
export const TURBINE_Q = 20 * 690;

/*
 * THE WARMED STATE (the lead, 2 October): the turbines running for
 * WARM_STEPS from still water, written once in Node (scripts/water-
 * itaipu.js --write, checked against a rerun) and loaded with the solver
 * on the first opening, so every client starts on the same running
 * river. Its wet cells only: a Uint32 count, then per cell its index
 * (Uint32) and h, hu, hv (Float64), little endian.
 */
export function packState(f) {
  const h = f.h(); const hu = f.hu(); const hv = f.hv();
  const wet = [];
  for (let k = 0; k < h.length; k += 1) if (h[k] > 0 || hu[k] !== 0 || hv[k] !== 0) wet.push(k);
  const bin = new Uint8Array(4 + wet.length * 28);
  const view = new DataView(bin.buffer);
  view.setUint32(0, wet.length, true);
  wet.forEach((k, m) => {
    const o = 4 + m * 28;
    view.setUint32(o, k, true);
    view.setFloat64(o + 4, h[k], true);
    view.setFloat64(o + 12, hu[k], true);
    view.setFloat64(o + 20, hv[k], true);
  });
  return bin;
}

export function loadState(f, bytes) {
  const bin = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const count = view.getUint32(0, true);
  if (bin.length !== 4 + count * 28) {
    throw new Error(`flood state: ${bin.length} bytes for ${count} cells`);
  }
  const h = f.h(); const hu = f.hu(); const hv = f.hv();
  h.fill(0); hu.fill(0); hv.fill(0);
  for (let m = 0; m < count; m += 1) {
    const o = 4 + m * 28;
    const k = view.getUint32(o, true);
    if (k >= h.length) throw new Error(`flood state: cell ${k} past the grid's ${h.length}`);
    h[k] = view.getFloat64(o + 4, true);
    hu[k] = view.getFloat64(o + 12, true);
    hv[k] = view.getFloat64(o + 20, true);
  }
}

/* The blocks' outer edges' runs of still water, by body: [{ blk,
 * side, k0, k1, body }]. The join (the fine block's south, the coarse
 * block's north) is no edge. */
function edgeRuns(bed, grid) {
  const runs = [];
  grid.blocks.forEach(({ nx, nz, off }, blk) => {
    const cell = (side, k) => off + (side === SIDE.west ? k * nx : side === SIDE.east ? k * nx + nx - 1 : side === SIDE.north ? k : (nz - 1) * nx + k);
    for (const side of [SIDE.west, SIDE.east, SIDE.north, SIDE.south]) {
      if ((blk === 0 && side === SIDE.south) || (blk === 1 && side === SIDE.north)) continue;
      const len = side === SIDE.west || side === SIDE.east ? nz : nx;
      let k = 0;
      while (k < len) {
        const body = bed.wet[cell(side, k)];
        let e = k;
        while (e + 1 < len && bed.wet[cell(side, e + 1)] === body) e += 1;
        if (body >= 0) runs.push({
          blk, side, k0: k, k1: e, body,
        });
        k = e + 1;
      }
    }
  });
  return runs;
}

/*
 * The flood on `bed` (bed.js floodBed's, from the map's ground), from
 * still water. { f, bed, gates: [link index], bounds: [{ run, index,
 * kind }], openGate(i, opening), ... }. The baseline (the lead, 2
 * October) is the turbines running and the spillway's gates shut;
 * `gates` true stands them at their 5 m, for a mission that opens them.
 * `turbines` false with the gates shut is the lake at rest.
 */
export async function makeFlood(wasm, bed, { turbines = true, gates = false } = {}) {
  const { grid } = bed;
  const f = await loadFlood(wasm);
  const [B0, B1] = grid.blocks;
  f.init(B0.nx, B0.nz, B0.x0, B0.z0, B0.dx, DT_MS / 1000);
  f.join(0, f.addBlock(B1.nx, B1.nz, B1.x0, B1.z0, B1.dx));
  f.bed().set(bed.b);
  f.cls().set(bed.cls);
  MANNING.forEach((n, k) => f.setManning(k, n));
  const h = f.h();
  for (let k = 0; k < bed.b.length; k += 1) {
    const q = bed.wet[k];
    h[k] = q >= 0 ? Math.max(0, bed.level[q] - bed.b[k]) : 0;
  }
  const runs = edgeRuns(bed, grid);
  const river = bed.names.indexOf('river');
  /* The tailrace crosses the fine block's east edge. */
  const turbine = (r) => r.body === river && r.blk === 0 && r.side === SIDE.east;
  const riverIn = runs.filter(turbine);
  const inLength = riverIn.reduce((s, r) => s + r.k1 - r.k0 + 1, 0);
  const bounds = [];
  for (const r of runs) {
    if (r.body === river && r.blk === 0 && r.side === SIDE.north) {
      /* Up the tailrace, toward the powerhouse's face: a wall. */
      continue;
    }
    if (turbine(r)) {
      const q = turbines ? (TURBINE_Q * (r.k1 - r.k0 + 1)) / inLength : 0;
      bounds.push({ run: r, kind: 'turbines', index: f.boundIn(r.blk, r.side, r.k0, r.k1, BOUND.inflow, q) });
      continue;
    }
    bounds.push({ run: r, kind: bed.names[r.body], index: f.boundIn(r.blk, r.side, r.k0, r.k1, BOUND.stage, bed.level[r.body]) });
  }
  /* Each gate's link: the flow under its lip while it runs, and through
   * a hole torn in its leaf under the water. A hole open to the sky is
   * not the link's (openGate). */
  const lip = bed.gates.map((g) => (gates ? g.open : 0));
  const holes = bed.gates.map(() => null);
  /* The openings applied, id to gate, the gauges read for them, and
   * the ids of openings with no place here yet. */
  const opened = new Map();
  const gauges = new Map();
  const unplaced = new Set();
  const bandsOf = (k) => {
    const g = bed.gates[k];
    const out = [];
    const lipTop = g.sill + lip[k];
    const o = holes[k];
    if (lip[k] > 0) {
      /* What is left of the leaf over the lip. */
      const cut = o && o.sky && o.sill < lipTop ? Math.min(o.width, g.width) : 0;
      if (g.width - cut > 0) out.push([g.sill, lipTop, g.width - cut, GATE_CD]);
    }
    if (o && !o.sky) {
      const lo = Math.max(o.sill, lipTop);
      const hi = Math.min(o.sill + o.height, g.sill + g.height);
      if (hi > lo) out.push([lo, hi, Math.min(o.width, g.width), HOLE_CD]);
    }
    return out;
  };
  const links = bed.gates.map((g, k) => {
    const i = f.link(LINK.opening, g.up, g.down);
    f.linkTail(i, g.tail);
    f.linkBands(i, bandsOf(k));
    f.linkDir(i, g.dir[0], g.dir[1]);
    return i;
  });
  return {
    f,
    bed,
    grid,
    bounds,
    links,
    /* What the boundaries have let in, m3 (out negative). */
    boundaryVolume: () => bounds.reduce((s, b) => s + f.boundVol(b.index), 0),
    /*
     * An opening (the contract's) through gate g: its hole from `sill` (a
     * height) up `height` metres, `width` wide, its middle `across`
     * metres across the bay from the bay's middle. A hole whose top is
     * over the reservoir's level is open to the sky, a notch: the gate's
     * own cells across its width come down to its sill (never under the
     * concrete's) and the water finds its own way through, the shallow
     * water equations' critical flow over what is left. A hole under the
     * water is an orifice in the leaf, the link's. A bigger opening of
     * the same gate replaces the one before; the cells it cut stay cut.
     */
    openGate(g, {
      sill, width, height, across = 0,
    }) {
      const gate = bed.gates[g];
      const reservoir = bed.level[bed.names.indexOf('reservoir')];
      const sky = sill + height >= reservoir;
      holes[g] = {
        sill, width, height, across, sky,
      };
      let cut = 0;
      if (sky) {
        const b = f.bed();
        for (const c of gate.wall) {
          if (Math.abs(c.u - across) <= width / 2) {
            const y = Math.max(sill, c.floor);
            if (y < b[c.k]) {
              b[c.k] = y;
              cut += 1;
            }
          }
        }
      }
      f.linkBands(links[g], bandsOf(g));
      return { gate, sky, cut };
    },
    bands: bandsOf,
    /* Back to the bed and the gates as they were built, no opening
     * applied (src/sim/water/host.js rewinds through it). */
    reset() {
      f.bed().set(bed.b);
      opened.clear();
      for (let g = 0; g < holes.length; g += 1) {
        holes[g] = null;
        f.linkBands(links[g], bandsOf(g));
      }
    },
    /*
     * A contract opening (docs/DAMBREAK-CONTRACT): a gate's, by its
     * target's id, its sill [x, y, z] the hole's foot (y a height, x and
     * z where along the gate's face its middle is). False for an opening
     * this flood has no place for yet: intakes and penstocks come in the
     * extend phase, and are counted, not dropped.
     */
    apply(o) {
      const m = /^gate-(\d+)$/.exec(o && o.target ? o.target : '');
      const g = m ? Number(m[1]) : -1;
      const sill = o && Array.isArray(o.sill) ? o.sill : null;
      if (o.kind !== 'gate' || !(g >= 0 && g < bed.gates.length) || !sill || !(o.width_m > 0) || !(o.height_m > 0)) {
        unplaced.add(o.id);
        return false;
      }
      const gate = bed.gates[g];
      const [u] = bed.frame.local(sill[0], sill[2]);
      this.openGate(g, {
        sill: sill[1], width: o.width_m, height: o.height_m, across: u - gate.middle,
      });
      opened.set(o.id, g);
      return true;
    },
    /* Each applied opening's discharge, m3/s, gauged 20 m down its bay
     * on the last step, and where it is (world, y up): the world's sound
     * of it (src/render/world-audio.js flow). */
    flows() {
      const out = [];
      for (const [id, g] of opened) {
        if (!gauges.has(g)) gauges.set(g, this.bayGauge(g, 20));
        const gate = bed.gates[g];
        /* key: the opening's number for the world's sound, stable while it
         * flows; a gate's is its own (intakes and penstocks will take
         * their own ranges). The gauge reads a little under 0 while the
         * flow through a fresh hole sloshes; the sound is 0 there. */
        out.push({
          id, key: g, x: gate.at[0], y: gate.sill + gate.height / 2, z: gate.at[1], q: Math.max(0, this.gaugeQ(gauges.get(g))),
        });
      }
      return out;
    },
    unplaced: () => [...unplaced],
    /* A gauge: the faces between the cells `side(k)` calls 0 (upstream)
     * and those it calls 1, each with the sign water crossing it toward
     * 1 has. gaugeQ reads the last step's discharge across it, m3/s. */
    gauge(cells, side) {
      const out = [];
      const set = new Map(cells.map((k) => [k, side(k)]));
      for (const [k, s] of set) {
        for (const [m, axis] of [[k + 1, 0], [k + grid.nx, 1]]) {
          if (axis === 0 && (k % grid.nx) + 1 >= grid.nx) continue;
          const t = set.get(m);
          if (t === undefined || t === s) continue;
          out.push([k, axis, s === 0 ? 1 : -1]);
        }
      }
      return out;
    },
    gaugeQ(faces) {
      const fx = f.fx(); const fz = f.fz();
      let s = 0;
      for (const [k, axis, sign] of faces) s += sign * (axis === 0 ? fx[k] : fz[k]);
      return s * grid.dx;
    },
    /* Gate g's bay cut across `d` metres down the chute. */
    bayGauge(g, d) {
      const cells = bed.gates[g].bay;
      const of = new Map(cells.map((c) => [c.k, c.d]));
      return this.gauge(cells.map((c) => c.k), (k) => (of.get(k) < d ? 0 : 1));
    },
    /* The cell under world (x, z), or -1 off the grid. */
    cellAt(x, z) {
      const [u, d] = bed.frame.local(x, z);
      const K = d < grid.blocks[1].z0 ? grid.blocks[0] : grid.blocks[1];
      const i = Math.floor((u - K.x0) / K.dx);
      const j = Math.floor((d - K.z0) / K.dx);
      return i < 0 || j < 0 || i >= K.nx || j >= K.nz ? -1 : K.off + j * K.nx + i;
    },
    /* The level, the depth and the current (world x and z) at the cell
     * under world (x, z). */
    at(x, z) {
      const k = this.cellAt(x, z);
      if (k < 0) return null;
      const d = f.h()[k];
      const b = f.bed()[k];
      const vu = d > 1e-4 ? f.hu()[k] / d : 0;
      const vd = d > 1e-4 ? f.hv()[k] / d : 0;
      return {
        eta: d + b, h: d, u: grid.a[0] * vu + grid.n[0] * vd, v: grid.a[1] * vu + grid.n[1] * vd, b,
      };
    },
  };
}

export { floodBed };
