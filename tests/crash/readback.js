/*
 * readback.js: what broke, read from the module, when the module can say.
 *
 * The crash core (docs/CRASH-PLAN.md Phase A items 1 and 2) adds parts,
 * damage and detached bodies to the plant and a readback for them. Until
 * that ABI is in dist/sim.wasm this returns null and the suite reports
 * "damage readback not available" for every band about what breaks,
 * rather than failing to load: a suite that only runs on a branch is a
 * suite the loop cannot baseline.
 *
 * The shape the suite reads is the same whichever ABI provides it:
 *
 *   { parts: [{ name, kind, broken, detached }], broken: [kind...] }
 *
 * `kind` is one of PART_KINDS, the vocabulary the bands are written in.
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

/* docs/CRASH-PLAN.md's part list, quad and plane. */
export const PART_KINDS = [
  'frame', 'arm', 'motor', 'prop', 'battery', 'camera', 'antenna',
  'fuselage', 'wing', 'tail', 'canopy', 'gear', 'float', 'chute',
];

/* Returns a reader, or null when the module has no damage readback. */
export function damageReader(sim) {
  void sim;
  return null;
}
