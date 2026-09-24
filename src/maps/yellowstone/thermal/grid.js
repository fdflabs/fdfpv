/*
 * grid.js: surfaces laid on the terrain's own triangles, so they cannot
 * float over it or sink into it.
 *
 * The contract's terrain is a grid of samples with its origin at
 * (-50000, -50000) and cells of 10, 30, 60 ... 960 m, each cell drawn as two
 * triangles split on the diagonal from (i, j + 1) to (i + 1, j), which is
 * the split src/maps/alps/terrain.js reads its ground on. A grid of
 * 10 / k metres on the same origin with the same split REFINES every one of
 * those levels: each of its triangles lies inside one terrain triangle,
 * because every coarse cell edge and every coarse diagonal (x + z constant)
 * is also a line of the fine grid. So a vertex placed at heightAt(x, z) on
 * such a grid makes a triangle that lies exactly in the drawn terrain's
 * plane. A river, a sinter flat or a mat of bacteria built this way sits on
 * the ground to the float precision and needs only a depth bias against
 * fighting, never a lift that shows as a gap.
 *
 * That holds for the level whose heights heightAt returns. The engine draws
 * coarser levels further out with other heights, so these surfaces belong
 * to a region only while the engine draws its finest level there (see the
 * interface note in docs/YELLOWSTONE-PLAN.md).
 *
 * No Three.js here: this returns typed arrays, so the selftest can measure
 * the drape under Node.
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

export const ORIGIN = -50000;

/*
 * A set of grid cells, keyed by their integer indices on a grid of `step`
 * metres from ORIGIN. `step` must divide 10 exactly (10, 5, 2.5, 2, 1) or
 * the refinement argument above fails.
 */
export class CellSet {
  constructor(step) {
    if (!(step > 0) || Math.abs(10 / step - Math.round(10 / step)) > 1e-9) {
      throw new Error(`grid: step ${step} does not divide 10 m, the drape would not be exact`);
    }
    this.step = step;
    this.cells = new Set();
  }

  /* Cell indices of a world coordinate. */
  index(v) {
    return Math.floor((v - ORIGIN) / this.step);
  }

  coord(i) {
    return ORIGIN + i * this.step;
  }

  add(i, j) {
    this.cells.add(i * 1048576 + j);
  }

  /* Every cell that touches the box. */
  addBox(x0, z0, x1, z1) {
    const i0 = this.index(x0);
    const i1 = this.index(x1);
    const j0 = this.index(z0);
    const j1 = this.index(z1);
    for (let i = i0; i <= i1; i += 1) {
      for (let j = j0; j <= j1; j += 1) {
        this.add(i, j);
      }
    }
  }

  /* Every cell whose centre is within r of (x, z), plus a cell of margin. */
  addDisc(x, z, r) {
    const rr = r + this.step;
    const i0 = this.index(x - rr);
    const i1 = this.index(x + rr);
    const j0 = this.index(z - rr);
    const j1 = this.index(z + rr);
    for (let i = i0; i <= i1; i += 1) {
      for (let j = j0; j <= j1; j += 1) {
        const cx = this.coord(i) + this.step / 2 - x;
        const cz = this.coord(j) + this.step / 2 - z;
        if (cx * cx + cz * cz <= rr * rr) {
          this.add(i, j);
        }
      }
    }
  }

  get size() {
    return this.cells.size;
  }
}

/*
 * The mesh of a cell set. `vertex(x, z)` returns the vertex's y and fills
 * any per vertex attributes: it is called once per distinct grid node and
 * must return a height at or above heightAt(x, z) for the no sink property
 * to hold (equal is the exact drape). `attrs` names the extra float
 * attributes and their sizes; vertex() writes them into the `out` object it
 * is handed, as arrays of that size.
 *
 * Returns { position, index, attrs: { name: Float32Array }, triangles }.
 */
export function buildCells(set, vertex, attrs = {}) {
  const step = set.step;
  const nodes = new Map();
  const pos = [];
  const extra = {};
  for (const name of Object.keys(attrs)) {
    extra[name] = [];
  }
  const out = {};
  const node = (i, j) => {
    const key = i * 1048576 + j;
    let k = nodes.get(key);
    if (k !== undefined) {
      return k;
    }
    const x = ORIGIN + i * step;
    const z = ORIGIN + j * step;
    for (const name of Object.keys(attrs)) {
      out[name] = null;
    }
    const y = vertex(x, z, out);
    k = pos.length / 3;
    pos.push(x, y, z);
    for (const [name, size] of Object.entries(attrs)) {
      const v = out[name];
      for (let c = 0; c < size; c += 1) {
        extra[name].push(v ? v[c] : 0);
      }
    }
    nodes.set(key, k);
    return k;
  };
  const index = [];
  for (const key of set.cells) {
    const i = Math.floor(key / 1048576);
    const j = key - i * 1048576;
    const a = node(i, j);
    const b = node(i + 1, j);
    const c = node(i, j + 1);
    const d = node(i + 1, j + 1);
    /* The terrain's split: (i, j + 1) to (i + 1, j), wound to face up. */
    index.push(a, c, b, c, d, b);
  }
  const attrsOut = {};
  for (const name of Object.keys(attrs)) {
    attrsOut[name] = new Float32Array(extra[name]);
  }
  return {
    position: new Float32Array(pos),
    index: pos.length / 3 > 65535 ? new Uint32Array(index) : new Uint16Array(index),
    attrs: attrsOut,
    triangles: index.length / 3,
  };
}

/*
 * Ground read on a sampled grid the way the contract says the terrain is
 * drawn: the two triangles of the cell, split on the (i, j + 1) to (i + 1, j)
 * diagonal. The stand in ground and the selftest use it; the engine has its
 * own.
 */
export function triangleHeight(sample, cell, x, z) {
  const u = (x - ORIGIN) / cell;
  const v = (z - ORIGIN) / cell;
  const i = Math.floor(u);
  const j = Math.floor(v);
  const fu = u - i;
  const fv = v - j;
  const h00 = sample(i, j);
  const h10 = sample(i + 1, j);
  const h01 = sample(i, j + 1);
  if (fu + fv <= 1) {
    return h00 + (h10 - h00) * fu + (h01 - h00) * fv;
  }
  const h11 = sample(i + 1, j + 1);
  return h11 + (h01 - h11) * (1 - fu) + (h10 - h11) * (1 - fv);
}
