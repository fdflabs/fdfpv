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
        "full": 617,
        "fifth": 80,
        "kept": 0.75
      },
      {
        "full": 661,
        "fifth": 88.3,
        "kept": 0.683
      },
      {
        "full": 699,
        "fifth": 96.2,
        "kept": 0.609
      },
      {
        "full": 729,
        "fifth": 103.7,
        "kept": 0.533
      }
    ],
    "e": [
      {
        "full": 220,
        "fifth": 37.3,
        "kept": 0.86
      },
      {
        "full": 238,
        "fifth": 42.3,
        "kept": 0.77
      },
      {
        "full": 253,
        "fifth": 47.3,
        "kept": 0.686
      },
      {
        "full": 287,
        "fifth": 52.4,
        "kept": 0.609
      }
    ],
    "r": [
      {
        "full": 218,
        "fifth": 34.3,
        "kept": 0.442
      },
      {
        "full": 218,
        "fifth": 34.3,
        "kept": 0.442
      },
      {
        "full": 218,
        "fifth": 34.3,
        "kept": 0.442
      },
      {
        "full": 218,
        "fifth": 34.3,
        "kept": 0.442
      }
    ]
  },
  "cub1400": {
    "a": [
      {
        "full": 177,
        "fifth": 17.3,
        "kept": 0.732
      },
      {
        "full": 223,
        "fifth": 21.5,
        "kept": 0.63
      },
      {
        "full": 281,
        "fifth": 26.8,
        "kept": 0.496
      },
      {
        "full": 349,
        "fifth": 33.1,
        "kept": 0.115
      }
    ],
    "e": [
      {
        "full": 107,
        "fifth": 13.8,
        "kept": 0.994
      },
      {
        "full": 132,
        "fifth": 19.7,
        "kept": 0.945
      },
      {
        "full": 160,
        "fifth": 29.6,
        "kept": 0.793
      },
      {
        "full": 194,
        "fifth": 39.5,
        "kept": 0.593
      }
    ],
    "r": [
      {
        "full": 42,
        "fifth": 6.1,
        "kept": 0.927
      },
      {
        "full": 54,
        "fifth": 7.9,
        "kept": 0.916
      },
      {
        "full": 72,
        "fifth": 10.5,
        "kept": 0.892
      },
      {
        "full": 94,
        "fifth": 13.6,
        "kept": 0.825
      }
    ]
  }
};
