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
  },
  "slick2680": {
    "a": [
      {
        "full": 672,
        "fifth": 60,
        "kept": 0.964
      },
      {
        "full": 704,
        "fifth": 64,
        "kept": 0.941
      },
      {
        "full": 731,
        "fifth": 67.8,
        "kept": 0.918
      },
      {
        "full": 767,
        "fifth": 71.6,
        "kept": 0.894
      }
    ],
    "e": [
      {
        "full": 298,
        "fifth": 55.6,
        "kept": 0.752
      },
      {
        "full": 301,
        "fifth": 61.1,
        "kept": 0.723
      },
      {
        "full": 305,
        "fifth": 62.6,
        "kept": 0.703
      },
      {
        "full": 308,
        "fifth": 64.1,
        "kept": 0.683
      }
    ],
    "r": [
      {
        "full": 211,
        "fifth": 22.1,
        "kept": 0.828
      },
      {
        "full": 217,
        "fifth": 22.8,
        "kept": 0.785
      },
      {
        "full": 226,
        "fifth": 23.9,
        "kept": 0.745
      },
      {
        "full": 235,
        "fifth": 24.9,
        "kept": 0.702
      }
    ]
  },
  "nighttimber1200": {
    "a": [
      {
        "full": 592,
        "fifth": 104.6,
        "kept": 0.831
      },
      {
        "full": 640,
        "fifth": 114.8,
        "kept": 0.803
      },
      {
        "full": 688,
        "fifth": 126.4,
        "kept": 0.73
      },
      {
        "full": 767,
        "fifth": 138.9,
        "kept": 0.571
      }
    ],
    "e": [
      {
        "full": 300,
        "fifth": 89.5,
        "kept": 0.867
      },
      {
        "full": 322,
        "fifth": 100.4,
        "kept": 0.809
      },
      {
        "full": 343,
        "fifth": 111.8,
        "kept": 0.749
      },
      {
        "full": 362,
        "fifth": 123.5,
        "kept": 0.691
      }
    ],
    "r": [
      {
        "full": 149,
        "fifth": 30.8,
        "kept": 0.947
      },
      {
        "full": 171,
        "fifth": 35.5,
        "kept": 0.9
      },
      {
        "full": 194,
        "fifth": 40.5,
        "kept": 0.837
      },
      {
        "full": 219,
        "fifth": 45.9,
        "kept": 0.752
      }
    ]
  },
  "timber1500": {
    "a": [
      {
        "full": 386,
        "fifth": 44.7,
        "kept": 0.873
      },
      {
        "full": 445,
        "fifth": 51.8,
        "kept": 0.834
      },
      {
        "full": 496,
        "fifth": 59.3,
        "kept": 0.79
      },
      {
        "full": 562,
        "fifth": 66.9,
        "kept": 0.718
      }
    ],
    "e": [
      {
        "full": 248,
        "fifth": 54.2,
        "kept": 0.991
      },
      {
        "full": 303,
        "fifth": 62.7,
        "kept": 0.982
      },
      {
        "full": 370,
        "fifth": 74.9,
        "kept": 0.893
      },
      {
        "full": 437,
        "fifth": 88.9,
        "kept": 0.662
      }
    ],
    "r": [
      {
        "full": 127,
        "fifth": 19.7,
        "kept": 1.011
      },
      {
        "full": 159,
        "fifth": 24.2,
        "kept": 0.954
      },
      {
        "full": 198,
        "fifth": 29.6,
        "kept": 0.866
      },
      {
        "full": 240,
        "fifth": 35.4,
        "kept": 0.747
      }
    ]
  }
};
