/*
 * bridge.js: the Friendship Bridge (Ponte da Amizade, Puente de la
 * Amistad), the one structure drawn in the ring (docs/ITAIPU-PLAN.md
 * section 7): a mesh with no colliders, since the ring has none and the
 * bridge stands 9.5 km down the river, past the collider grid's reach.
 *
 * It is a concrete deck arch: the road on a deck carried by columns off
 * one arch that springs from the canyon's walls. OpenStreetMap maps only
 * part of it as the bridge (284 m, way 26122712) and none of its
 * structure, so the rest is read off the ground along that way's line:
 * the deck runs level from rim to rim, where the canyon's walls reach
 * RIM over the river's water in the DEM; the arch springs where they
 * reach SPRING over it and rises to just under the deck. The deck's width
 * is the way's own.
 *
 * Pure: no THREE. It says what to draw through the sink's face and bar.
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

/* Metres over the river's lowest ground along the line. */
const RIM = 48;
const SPRING = 12;
/* The deck's depth, the arch ribs' width and depth, their spacing either
 * side of the middle, and the columns' pitch. Metres. */
const DECK = 1.6;
const RIB_W = 2.2;
const RIB_D = 3.2;
const RIB_OFF = 4.5;
const PITCH = 22;
const STEP = 5;
/*
 * Tints on the photographed render, in the kit's one render finish with
 * no weather (`trim`): a weathered key reads the ground's height off the
 * hero's grid, which the ring is off, and the kit's concrete group drew
 * the bridge black out here (seen, not explained: the render group with
 * the same mesh draws it grey).
 */
const CONCRETE = [0.62, 0.61, 0.58];
const DECK_TOP = [0.3, 0.3, 0.31];

/*
 * The bridge along road feature `f` (its two points), over `ground`,
 * drawn with `sink`. Returns its measures, for the checks.
 */
export function buildBridge(f, ground, sink) {
  const [a, b] = [f.points[0], f.points[f.points.length - 1]];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / len;
  const uz = (b[1] - a[1]) / len;
  const at = (s) => [a[0] + ux * s, a[1] + uz * s];
  const g = (s) => ground(...at(s));
  /* The river: the lowest ground along the mapped part. */
  let low = 0;
  for (let s = 0; s <= len; s += STEP) {
    if (g(s) < g(low)) {
      low = s;
    }
  }
  const water = g(low);
  const reach = (from, dir, above) => {
    let s = from;
    while (g(s) < water + above && Math.abs(s - from) < 2000) {
      s += dir * STEP;
    }
    return s;
  };
  const s0 = reach(low, -1, RIM);
  const s1 = reach(low, 1, RIM);
  const deckY = (g(s0) + g(s1)) / 2;
  const sp0 = reach(low, -1, SPRING);
  const sp1 = reach(low, 1, SPRING);
  const springY = (g(sp0) + g(sp1)) / 2;
  const crownY = deckY - DECK - 1.5;
  const hw = f.width / 2;
  const px = -uz;
  const pz = ux;
  const P = (s, off, y) => {
    const [x, z] = at(s);
    return [x + px * off, y, z + pz * off];
  };
  const opts = { where: 'ring' };
  const up = [0, 1, 0];
  /* The deck: its top, its underside, its sides and parapets. */
  sink.face('trim', DECK_TOP, [P(s0, -hw, deckY), P(s1, -hw, deckY), P(s1, hw, deckY), P(s0, hw, deckY)], up, opts);
  sink.face('trim', CONCRETE, [P(s0, -hw, deckY - DECK), P(s1, -hw, deckY - DECK), P(s1, hw, deckY - DECK), P(s0, hw, deckY - DECK)], [0, -1, 0], opts);
  for (const side of [-1, 1]) {
    const n = [px * side, 0, pz * side];
    sink.face('trim', CONCRETE, [P(s0, side * hw, deckY - DECK), P(s1, side * hw, deckY - DECK), P(s1, side * hw, deckY + 1), P(s0, side * hw, deckY + 1)], n, opts);
    sink.bar('trim', CONCRETE, P(s0, side * (hw - 0.15), deckY + 0.5), P(s1, side * (hw - 0.15), deckY + 0.5), 0.15, opts, 0.5);
  }
  /* The arch: two ribs, a parabola from springing to crown. */
  const span = sp1 - sp0;
  const mid = (sp0 + sp1) / 2;
  const archY = (s) => {
    const q = (2 * (s - mid)) / span;
    return springY + (crownY - springY) * (1 - q * q);
  };
  const segs = 24;
  for (const side of [-1, 1]) {
    for (let k = 0; k < segs; k += 1) {
      const sA = sp0 + (span * k) / segs;
      const sB = sp0 + (span * (k + 1)) / segs;
      sink.bar('trim', CONCRETE, P(sA, side * RIB_OFF, archY(sA)), P(sB, side * RIB_OFF, archY(sB)), RIB_W / 2, opts, RIB_D / 2);
    }
  }
  /* The columns: off the arch within its span, off the ground outside it. */
  let columns = 0;
  for (let s = s0 + PITCH / 2; s < s1; s += PITCH) {
    const foot = s > sp0 && s < sp1 ? archY(s) + RIB_D / 2 : g(s);
    if (deckY - DECK - foot < 1) {
      continue;
    }
    for (const side of [-1, 1]) {
      sink.bar('trim', CONCRETE, P(s, side * RIB_OFF, foot - 0.5), P(s, side * RIB_OFF, deckY - DECK), 0.7, opts);
    }
    columns += 2;
  }
  return {
    length: s1 - s0, deckY, water, span, springY, crownY, columns,
  };
}
