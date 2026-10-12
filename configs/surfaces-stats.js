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
        "full": 846,
        "fifth": 113.7,
        "kept": 0.883
      },
      {
        "full": 896,
        "fifth": 125.2,
        "kept": 0.834
      },
      {
        "full": 938,
        "fifth": 136.1,
        "kept": 0.784
      },
      {
        "full": 970,
        "fifth": 146.6,
        "kept": 0.734
      }
    ],
    "e": [
      {
        "full": 349,
        "fifth": 72.3,
        "kept": 0.858
      },
      {
        "full": 374,
        "fifth": 80.1,
        "kept": 0.841
      },
      {
        "full": 394,
        "fifth": 87.9,
        "kept": 0.771
      },
      {
        "full": 410,
        "fifth": 95.8,
        "kept": 0.706
      }
    ],
    "r": [
      {
        "full": 322,
        "fifth": 53,
        "kept": 0.467
      },
      {
        "full": 322,
        "fifth": 53,
        "kept": 0.467
      },
      {
        "full": 322,
        "fifth": 53,
        "kept": 0.467
      },
      {
        "full": 322,
        "fifth": 53,
        "kept": 0.467
      }
    ]
  },
  "cub1400": {
    "a": [
      {
        "full": 204,
        "fifth": 23,
        "kept": 0.847
      },
      {
        "full": 246,
        "fifth": 28.4,
        "kept": 0.783
      },
      {
        "full": 313,
        "fifth": 35.3,
        "kept": 0.717
      },
      {
        "full": 422,
        "fifth": 43.3,
        "kept": 0.598
      }
    ],
    "e": [
      {
        "full": 158,
        "fifth": 33.4,
        "kept": 1.058
      },
      {
        "full": 195,
        "fifth": 41.3,
        "kept": 1.018
      },
      {
        "full": 239,
        "fifth": 54,
        "kept": 0.912
      },
      {
        "full": 287,
        "fifth": 67.1,
        "kept": 0.685
      }
    ],
    "r": [
      {
        "full": 57,
        "fifth": 9.3,
        "kept": 1.041
      },
      {
        "full": 73,
        "fifth": 11.6,
        "kept": 1.023
      },
      {
        "full": 96,
        "fifth": 15,
        "kept": 0.986
      },
      {
        "full": 124,
        "fifth": 19.1,
        "kept": 0.907
      }
    ]
  }
};
