/*
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

/* WRITTEN BY scripts/surfaces-gates.js --write-stats; do not edit. Per aircraft,
 * surface (a e r) and tier (stock sport 3d extreme): the full stick rate,
 * deg/s; a fifth of a stick's, deg/s; the speed kept in 2 s of full stick. */
export const SURFACE_STATS = {
  "extra3d1308": {
    "a": [
      {
        "full": 720,
        "fifth": 95.1,
        "kept": 0.83
      },
      {
        "full": 767,
        "fifth": 104.8,
        "kept": 0.778
      },
      {
        "full": 807,
        "fifth": 114.1,
        "kept": 0.724
      },
      {
        "full": 841,
        "fifth": 123,
        "kept": 0.668
      }
    ],
    "e": [
      {
        "full": 281,
        "fifth": 54.1,
        "kept": 0.909
      },
      {
        "full": 303,
        "fifth": 60.5,
        "kept": 0.833
      },
      {
        "full": 320,
        "fifth": 66.8,
        "kept": 0.773
      },
      {
        "full": 334,
        "fifth": 73.2,
        "kept": 0.717
      }
    ],
    "r": [
      {
        "full": 268,
        "fifth": 43,
        "kept": 0.496
      },
      {
        "full": 268,
        "fifth": 43,
        "kept": 0.496
      },
      {
        "full": 268,
        "fifth": 43,
        "kept": 0.496
      },
      {
        "full": 268,
        "fifth": 43,
        "kept": 0.496
      }
    ]
  },
  "cub1400": {
    "a": [
      {
        "full": 196,
        "fifth": 20.8,
        "kept": 0.815
      },
      {
        "full": 240,
        "fifth": 25.7,
        "kept": 0.733
      },
      {
        "full": 293,
        "fifth": 32,
        "kept": 0.652
      },
      {
        "full": 395,
        "fifth": 39.4,
        "kept": 0.507
      }
    ],
    "e": [
      {
        "full": 140,
        "fifth": 26.3,
        "kept": 1.037
      },
      {
        "full": 172,
        "fifth": 33.5,
        "kept": 0.997
      },
      {
        "full": 211,
        "fifth": 45.2,
        "kept": 0.887
      },
      {
        "full": 253,
        "fifth": 57.2,
        "kept": 0.708
      }
    ],
    "r": [
      {
        "full": 52,
        "fifth": 8.2,
        "kept": 1.014
      },
      {
        "full": 66,
        "fifth": 10.3,
        "kept": 0.998
      },
      {
        "full": 87,
        "fifth": 13.4,
        "kept": 0.966
      },
      {
        "full": 113,
        "fifth": 17.1,
        "kept": 0.891
      }
    ]
  }
};
