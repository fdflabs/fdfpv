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
        "fifth": 95.8,
        "kept": 0.83
      },
      {
        "full": 768,
        "fifth": 105.6,
        "kept": 0.778
      },
      {
        "full": 808,
        "fifth": 114.8,
        "kept": 0.724
      },
      {
        "full": 842,
        "fifth": 123.7,
        "kept": 0.669
      }
    ],
    "e": [
      {
        "full": 281,
        "fifth": 54.1,
        "kept": 0.907
      },
      {
        "full": 303,
        "fifth": 60.4,
        "kept": 0.843
      },
      {
        "full": 320,
        "fifth": 66.7,
        "kept": 0.785
      },
      {
        "full": 334,
        "fifth": 73.2,
        "kept": 0.731
      }
    ],
    "r": [
      {
        "full": 267,
        "fifth": 42.9,
        "kept": 0.514
      },
      {
        "full": 267,
        "fifth": 42.9,
        "kept": 0.514
      },
      {
        "full": 267,
        "fifth": 42.9,
        "kept": 0.514
      },
      {
        "full": 267,
        "fifth": 42.9,
        "kept": 0.514
      }
    ]
  },
  "cub1400": {
    "a": [
      {
        "full": 195,
        "fifth": 19,
        "kept": 0.816
      },
      {
        "full": 240,
        "fifth": 23.9,
        "kept": 0.733
      },
      {
        "full": 293,
        "fifth": 30.2,
        "kept": 0.652
      },
      {
        "full": 396,
        "fifth": 37.5,
        "kept": 0.509
      }
    ],
    "e": [
      {
        "full": 139,
        "fifth": 26.2,
        "kept": 1.039
      },
      {
        "full": 172,
        "fifth": 33.4,
        "kept": 1.001
      },
      {
        "full": 210,
        "fifth": 45,
        "kept": 0.896
      },
      {
        "full": 253,
        "fifth": 57.1,
        "kept": 0.747
      }
    ],
    "r": [
      {
        "full": 52,
        "fifth": 8.1,
        "kept": 1.017
      },
      {
        "full": 66,
        "fifth": 10.3,
        "kept": 1.004
      },
      {
        "full": 87,
        "fifth": 13.4,
        "kept": 0.975
      },
      {
        "full": 113,
        "fifth": 17.1,
        "kept": 0.907
      }
    ]
  },
  "slick2680": {
    "a": [
      {
        "full": 673,
        "fifth": 60.1,
        "kept": 0.964
      },
      {
        "full": 704,
        "fifth": 64,
        "kept": 0.941
      },
      {
        "full": 732,
        "fifth": 67.9,
        "kept": 0.918
      },
      {
        "full": 767,
        "fifth": 71.7,
        "kept": 0.894
      }
    ],
    "e": [
      {
        "full": 298,
        "fifth": 55.6,
        "kept": 0.757
      },
      {
        "full": 301,
        "fifth": 61.1,
        "kept": 0.73
      },
      {
        "full": 305,
        "fifth": 62.6,
        "kept": 0.71
      },
      {
        "full": 308,
        "fifth": 64.1,
        "kept": 0.692
      }
    ],
    "r": [
      {
        "full": 210,
        "fifth": 21.9,
        "kept": 0.843
      },
      {
        "full": 216,
        "fifth": 22.7,
        "kept": 0.803
      },
      {
        "full": 225,
        "fifth": 23.7,
        "kept": 0.766
      },
      {
        "full": 234,
        "fifth": 24.8,
        "kept": 0.726
      }
    ]
  },
  "nighttimber1200": {
    "a": [
      {
        "full": 520,
        "fifth": 92.7,
        "kept": 0.79
      },
      {
        "full": 577,
        "fifth": 101.7,
        "kept": 0.744
      },
      {
        "full": 649,
        "fifth": 112.1,
        "kept": 0.632
      },
      {
        "full": 716,
        "fifth": 123.4,
        "kept": 0.381
      }
    ],
    "e": [
      {
        "full": 243,
        "fifth": 71.5,
        "kept": 0.827
      },
      {
        "full": 262,
        "fifth": 80.5,
        "kept": 0.755
      },
      {
        "full": 280,
        "fifth": 89.8,
        "kept": 0.69
      },
      {
        "full": 297,
        "fifth": 99.4,
        "kept": 0.623
      }
    ],
    "r": [
      {
        "full": 127,
        "fifth": 26,
        "kept": 0.919
      },
      {
        "full": 146,
        "fifth": 29.9,
        "kept": 0.877
      },
      {
        "full": 166,
        "fifth": 34.2,
        "kept": 0.82
      },
      {
        "full": 186,
        "fifth": 38.9,
        "kept": 0.747
      }
    ]
  },
  "timber1500": {
    "a": [
      {
        "full": 368,
        "fifth": 41.2,
        "kept": 0.853
      },
      {
        "full": 428,
        "fifth": 47.8,
        "kept": 0.811
      },
      {
        "full": 480,
        "fifth": 54.7,
        "kept": 0.762
      },
      {
        "full": 533,
        "fifth": 61.8,
        "kept": 0.685
      }
    ],
    "e": [
      {
        "full": 228,
        "fifth": 47.2,
        "kept": 1.019
      },
      {
        "full": 279,
        "fifth": 55.1,
        "kept": 1.002
      },
      {
        "full": 340,
        "fifth": 66.5,
        "kept": 0.914
      },
      {
        "full": 402,
        "fifth": 79.5,
        "kept": 0.695
      }
    ],
    "r": [
      {
        "full": 117,
        "fifth": 17.9,
        "kept": 1.008
      },
      {
        "full": 148,
        "fifth": 22.1,
        "kept": 0.956
      },
      {
        "full": 183,
        "fifth": 27.1,
        "kept": 0.877
      },
      {
        "full": 222,
        "fifth": 32.5,
        "kept": 0.77
      }
    ]
  }
};
