/*
 * itaipu-1.js: Defend Itaipu, mission 1 (docs/WARFARE-PLAN.md section
 * 4.2). Data, shared by the room (edge/rooms/war.js) and every client;
 * src/share/war/routes.js flies it.
 *
 * PLACEHOLDERS. Every position here is a stand in until package M builds
 * the targets (section 8) and package G tunes the waves by flying
 * (phase 2). The intakes are spaced evenly along the line section 8 gives
 * for dam.json's intake points, (-202.2, -1794.2) to (430.8, -1655.0), at
 * the crest's 225 m where their servomotor houses stand; the right bank
 * switchyard is at the OSM centroid (-2128, -434) at 225 m, the war
 * heightfield's floor there (src/share/war/itaipu-height.bin). The
 * routes are straight lines drawn over that heightfield: the reservoir to
 * the north, the gorge up the river from the south. None of it has been
 * flown.
 *
 * Output is 14 000 MW, twenty units of 700: each intake carries one. The
 * switchyard carries 2 800 on top of the intakes' count, so a hit there
 * alone is a fifth of the plant; the output never goes below zero.
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

const INTAKE_W = [-202.2, -1794.2];
const INTAKE_E = [430.8, -1655.0];
const CREST_Y = 225;

const targets = {};
for (let i = 0; i < 20; i += 1) {
  const u = i / 19;
  targets[`intake-${i}`] = {
    mw: 700,
    at: [INTAKE_W[0] + (INTAKE_E[0] - INTAKE_W[0]) * u, CREST_Y, INTAKE_W[1] + (INTAKE_E[1] - INTAKE_W[1]) * u],
    r: 12,
  };
}
targets['yard-right'] = { mw: 2800, at: [-2128, 225, -434], r: 40 };

export default {
  id: 'itaipu-1',
  map: 'itaipu',
  targets,
  output: 14000,
  floorMw: 7000,
  rack: 3,
  /* Seconds after the go. */
  waves: [
    { at: 20, kind: 'scout', n: 1, route: 'reservoir-orbit' },
    { at: 60, kind: 'strike', n: 3, route: 'reservoir-west', target: 'yard-right', spread: 60 },
    { at: 90, kind: 'fpv', n: 6, route: 'gorge', target: 'intake-7', spread: 20 },
    { at: 120, kind: 'loiter', n: 2, route: 'reservoir-high', target: 'intake-12', spread: 30 },
    { at: 150, kind: 'boat', n: 2, route: 'reservoir-surface', target: 'intake-3', spread: 20 },
    { at: 170, kind: 'hunter', n: 2, route: 'gorge' },
    { at: 200, kind: 'jammer', n: 1, route: 'reservoir-jam' },
    { at: 230, kind: 'strike', n: 4, route: 'reservoir-low', target: 'intake-15', spread: 30 },
  ],
  /* Checked against the war heightfield (src/share/war/itaipu-height.bin):
   * every flight clears the floor until its last run onto its target, and
   * the boats and the jammer sail on the water, 219 m. */
  routes: {
    'reservoir-orbit': [[200, 470, -7000], [100, 470, -3500]],
    'reservoir-low': [[300, 250, -5000], [300, 250, -2400]],
    'reservoir-west': [[-1500, 280, -5000], [-1800, 280, -2000]],
    gorge: [[-1100, 210, 3600], [-1100, 210, 900], [-600, 260, -1000]],
    'reservoir-high': [[1400, 700, -7500], [400, 600, -3200]],
    'reservoir-surface': [[800, 219, -5000], [300, 219, -2400]],
    'reservoir-jam': [[2500, 219, -4000], [1500, 219, -3000]],
  },
};
