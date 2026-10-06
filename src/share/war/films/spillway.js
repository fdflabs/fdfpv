/*
 * spillway.js: mission 2's film, "The Spillway" (docs/campaign/INTROS.md
 * section 5.2): the river as a living thing, the reservoir high against
 * the gates, the scope showing what gathers in the west arm. Data only
 * (src/share/war/film.js).
 *
 * Three departures from 5.2. The gates are not seen to open: the map
 * turns their leaves from the room's `gates` (hoist.js), but at the
 * hoist's half a metre a minute the shot's fifteen seconds move a leaf
 * 12 cm, which no lens shows, and the film does not fake a faster one;
 * the last shot's turn ends on the spill's spray over the chute, the
 * match's working gates bracketed. There is no rain, which the world does
 * not draw. Shot 5's float plane is the ten inch, a war film showing only
 * the war's aircraft (the owner, 3 October; configs/airframes.js
 * WAR_AIRFRAMES), armed on the spillway bridge's road.
 *
 * Version 2 (the stills of the first cut, 6 October): the pier shot's
 * ten inch stood inside the bridge's upstream parapet, so the whole shot
 * was a wall; the skin crane rose up the bridge's face 9 m off it; the
 * ride up the channel ended 700 m short of the gates; and the opening
 * long lens looked through the 500 kV line over the approach channel
 * (span 58 of src/share/war/itaipu-wires.js), black bands over the gates.
 *
 * THE FRAME. Scene metres, y up, -z north. The fourteen gates' upstream
 * faces run GATE_W to GATE_E (src/share/war/itaipu-targets.js gate-0 and
 * gate-13); gate(i, off, y) is a point at gate i's place (fractional),
 * off metres upstream of their line, at height y.
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

const GATE_W = [-1125.156, -959.204];
const GATE_E = [-813.196, -1070.046];
const ALONG = (() => {
  const dx = GATE_E[0] - GATE_W[0];
  const dz = GATE_E[1] - GATE_W[1];
  const m = Math.hypot(dx, dz);
  return [dx / m, dz / m];
})();
/* Upstream, toward the reservoir: the gates' line turned to -z. */
const UP = [ALONG[1], -ALONG[0]];
const RESERVOIR_Y = 219;

function gate(i, off, y) {
  const u = i / 13;
  return [
    GATE_W[0] + (GATE_E[0] - GATE_W[0]) * u + UP[0] * off,
    y,
    GATE_W[1] + (GATE_E[1] - GATE_W[1]) * u + UP[1] * off,
  ];
}

/* Where the jets off the flip buckets come down in a plume of spray
 * (the chute's axis runs from the gates to its lip near (-805, -553)). */
const PLUME = [-790, 175, -470];

/* The spillway's middle, and the angle round it (0 is +z) of upstream. */
const MID = gate(6.5, 0, 215);
const UPSTREAM_A = Math.atan2(UP[0], UP[1]);

export default {
  id: 'spillway',
  version: 2,
  cast: {
    ten: { airframe: '10inch', spins: true },
  },
  routes: {
    /* The ride up the approach channel, a Striker's line onto the gates. */
    'channel-run': [[-1150, 249, -3000], [-1060, 240, -1150]],
    /* What the scope shows gathering: a Scout circling the west arm,
     * boats coming down it, Loiterers high to the north west. */
    'scope-orbit': [[-2400, 470, -3700], [-1700, 470, -2800]],
    'scope-boats': [[-2600, 219, -3500], [-1900, 219, -2600], [-1400, 219, -1900]],
    'scope-high': [[-1700, 700, -3600], [-1300, 650, -2400]],
  },
  agents: [
    {
      id: 'rider', kind: 'strike', route: 'channel-run', n: 1, pass: { shot: 'channel', at: 0, point: [-1077.0, 241.7, -1500] }, shots: ['channel'],
    },
    {
      id: 'eyes', kind: 'scout', route: 'scope-orbit', n: 1, pass: { shot: 'scope', at: { at: 'end' }, point: [-2142.1, 470, -3368.5] }, shots: [],
    },
    {
      id: 'boats', kind: 'boat', route: 'scope-boats', n: 3, stagger: 1.5, pass: { shot: 'scope', at: { at: 'end' }, point: [-2250, 219, -3050] }, shots: [],
    },
    {
      id: 'high', kind: 'loiter', route: 'scope-high', n: 2, stagger: 1, pass: { shot: 'scope', at: { at: 'end' }, point: [-1500, 675, -3000] }, shots: [],
    },
  ],
  shots: [
    {
      id: 'water',
      min: 7,
      grade: 'steel',
      /* The reservoir's surface close, then the fourteen gates on the
       * right bank, on a long lens from the water. */
      camera: {
        type: 'telephoto', lens: 35, ease: 'io', at: gate(6.5, 300, RESERVOIR_Y + 1.5), look: [gate(6.5, 240, RESERVOIR_Y - 2), gate(6.5, 0, 221)],
      },
      fade: [[0, 1], [1.2, 0]],
      out: 'match',
    },
    {
      id: 'skin',
      min: 8,
      grade: 'steel',
      lines: [{ line: 'film-itaipu-2-1', lead: 1.5, tail: 1.0 }],
      /* At the waterline against a gate's skin, rising up it and over its
       * pier, the chute below. */
      camera: {
        type: 'crane', lens: 24, base: gate(6, 35, RESERVOIR_Y), h: [1.0, 42], look: [gate(6, 0, 221), gate(6, -170, 165)],
      },
      out: 'cut',
    },
    {
      id: 'scope',
      min: 7,
      grade: 'steel',
      lines: [{ line: 'film-itaipu-2-2', lead: 1.0, tail: 1.0 }],
      /* MIRADOR's scope: the west arm quiet, then contacts one by one. */
      camera: {
        type: 'telephoto', lens: 50, at: gate(6.5, 300, 260), look: gate(6.5, 2000, 240),
      },
      scope: {
        at: [-1350, -2450],
        r: 2500,
        groups: ['eyes', 'high', 'boats'],
        appear: [1.5, { at: 'vo.end', s: -0.5 }],
        lines: [[[-202.2, -1794.2], [430.8, -1655.0]], [GATE_W, GATE_E]],
        marks: [
          { key: 'war.scope.dam', at: [110, -1560] },
          { key: 'war.scope.spillway', at: [-970, -860] },
          { key: 'war.scope.west_arm', at: [-2550, -3750] },
          { key: 'war.scope.channel', at: [-1150, -2050] },
        ],
      },
      out: 'smash',
    },
    {
      id: 'channel',
      min: 7,
      grade: 'steel',
      lines: [{ line: 'film-itaipu-2-3', lead: 0.5, tail: 1.0 }],
      /* Riding the approach channel as a Striker would, the gates
       * growing. */
      camera: {
        type: 'drone', lens: 18, ride: { agent: 'rider' }, back: 4, up: 1.2, lag: 250, ease: 'lin',
      },
      hero: { agent: 'rider', minPx: 150 },
      out: 'cut',
    },
    {
      id: 'pier',
      min: 6,
      grade: 'warm',
      /* On a pier's nose by the gates: the ten inch, its warhead slung,
       * its props spinning up. */
      camera: {
        type: 'handheld', lens: 50, at: gate(1.66, 1.2, 225.75), look: { cast: 'ten', up: 0.15 }, amp: 0.006, drift: 2,
      },
      cast: {
        ten: { keys: [{ t: 0, p: gate(1.5, 0.4, null), yaw: UPSTREAM_A - Math.PI / 2 }], spin: [[0, 20], [2, 110]] },
      },
      out: 'cut',
    },
    {
      id: 'orbit',
      min: 15,
      grade: 'steel',
      lines: [{ line: 'film-itaipu-2-4', lead: 2.0, tail: 1.0 }],
      /* Round from the reservoir's side to the east of the gates, the
       * working gates bracketed, turning onto the spill's spray. */
      camera: {
        type: 'orbit', lens: 35, centre: MID, r: 160, h: 60, a: [UPSTREAM_A, UPSTREAM_A - Math.PI * 0.55], look: [MID, PLUME],
      },
      outline: { from: 1.0, to: { at: 'end', s: -1.5 } },
      titles: [
        {
          mission: true, from: 7.0, to: { at: 'end', s: -0.6 }, kind: 'mission',
        },
      ],
      out: 'handoff',
    },
  ],
};
