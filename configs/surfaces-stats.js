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
        "kept": 0.669
      }
    ],
    "e": [
      {
        "full": 281,
        "fifth": 54.1,
        "kept": 0.918
      },
      {
        "full": 303,
        "fifth": 60.4,
        "kept": 0.844
      },
      {
        "full": 320,
        "fifth": 66.7,
        "kept": 0.786
      },
      {
        "full": 334,
        "fifth": 73.2,
        "kept": 0.734
      }
    ],
    "r": [
      {
        "full": 267,
        "fifth": 43,
        "kept": 0.506
      },
      {
        "full": 267,
        "fifth": 43,
        "kept": 0.506
      },
      {
        "full": 267,
        "fifth": 43,
        "kept": 0.506
      },
      {
        "full": 267,
        "fifth": 43,
        "kept": 0.506
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
        "kept": 0.653
      },
      {
        "full": 395,
        "fifth": 39.4,
        "kept": 0.507
      }
    ],
    "e": [
      {
        "full": 139,
        "fifth": 26.2,
        "kept": 1.038
      },
      {
        "full": 172,
        "fifth": 33.5,
        "kept": 1
      },
      {
        "full": 210,
        "fifth": 45.1,
        "kept": 0.893
      },
      {
        "full": 253,
        "fifth": 57.1,
        "kept": 0.716
      }
    ],
    "r": [
      {
        "full": 52,
        "fifth": 8.1,
        "kept": 1.014
      },
      {
        "full": 66,
        "fifth": 10.2,
        "kept": 0.998
      },
      {
        "full": 87,
        "fifth": 13.3,
        "kept": 0.967
      },
      {
        "full": 113,
        "fifth": 17,
        "kept": 0.894
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
        "kept": 0.757
      },
      {
        "full": 301,
        "fifth": 61.1,
        "kept": 0.729
      },
      {
        "full": 305,
        "fifth": 62.6,
        "kept": 0.71
      },
      {
        "full": 308,
        "fifth": 64.1,
        "kept": 0.691
      }
    ],
    "r": [
      {
        "full": 211,
        "fifth": 22.1,
        "kept": 0.832
      },
      {
        "full": 217,
        "fifth": 22.8,
        "kept": 0.791
      },
      {
        "full": 226,
        "fifth": 23.9,
        "kept": 0.753
      },
      {
        "full": 235,
        "fifth": 24.9,
        "kept": 0.712
      }
    ]
  },
  "nighttimber1200": {
    "a": [
      {
        "full": 521,
        "fifth": 92.1,
        "kept": 0.791
      },
      {
        "full": 578,
        "fifth": 101.3,
        "kept": 0.746
      },
      {
        "full": 646,
        "fifth": 111.7,
        "kept": 0.638
      },
      {
        "full": 717,
        "fifth": 123,
        "kept": 0.384
      }
    ],
    "e": [
      {
        "full": 243,
        "fifth": 71.5,
        "kept": 0.813
      },
      {
        "full": 262,
        "fifth": 80.5,
        "kept": 0.755
      },
      {
        "full": 280,
        "fifth": 89.8,
        "kept": 0.691
      },
      {
        "full": 297,
        "fifth": 99.4,
        "kept": 0.625
      }
    ],
    "r": [
      {
        "full": 127,
        "fifth": 25.9,
        "kept": 0.922
      },
      {
        "full": 145,
        "fifth": 29.9,
        "kept": 0.882
      },
      {
        "full": 165,
        "fifth": 34.2,
        "kept": 0.826
      },
      {
        "full": 185,
        "fifth": 38.8,
        "kept": 0.755
      }
    ]
  },
  "timber1500": {
    "a": [
      {
        "full": 368,
        "fifth": 41.6,
        "kept": 0.853
      },
      {
        "full": 428,
        "fifth": 48.1,
        "kept": 0.811
      },
      {
        "full": 480,
        "fifth": 55,
        "kept": 0.762
      },
      {
        "full": 533,
        "fifth": 62.1,
        "kept": 0.684
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
        "kept": 0.913
      },
      {
        "full": 402,
        "fifth": 79.5,
        "kept": 0.681
      }
    ],
    "r": [
      {
        "full": 118,
        "fifth": 18,
        "kept": 1.005
      },
      {
        "full": 148,
        "fifth": 22.3,
        "kept": 0.951
      },
      {
        "full": 184,
        "fifth": 27.3,
        "kept": 0.871
      },
      {
        "full": 223,
        "fifth": 32.7,
        "kept": 0.763
      }
    ]
  }
};
