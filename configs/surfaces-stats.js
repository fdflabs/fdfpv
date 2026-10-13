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
        "full": 847,
        "fifth": 114.7,
        "kept": 0.883
      },
      {
        "full": 898,
        "fifth": 126.2,
        "kept": 0.835
      },
      {
        "full": 939,
        "fifth": 137,
        "kept": 0.784
      },
      {
        "full": 971,
        "fifth": 147.5,
        "kept": 0.734
      }
    ],
    "e": [
      {
        "full": 348,
        "fifth": 72.2,
        "kept": 0.879
      },
      {
        "full": 374,
        "fifth": 80.1,
        "kept": 0.825
      },
      {
        "full": 394,
        "fifth": 87.8,
        "kept": 0.778
      },
      {
        "full": 409,
        "fifth": 95.7,
        "kept": 0.72
      }
    ],
    "r": [
      {
        "full": 320,
        "fifth": 52.8,
        "kept": 0.561
      },
      {
        "full": 320,
        "fifth": 52.8,
        "kept": 0.561
      },
      {
        "full": 320,
        "fifth": 52.8,
        "kept": 0.561
      },
      {
        "full": 320,
        "fifth": 52.8,
        "kept": 0.561
      }
    ]
  },
  "cub1400": {
    "a": [
      {
        "full": 203,
        "fifth": 21.1,
        "kept": 0.85
      },
      {
        "full": 244,
        "fifth": 26.7,
        "kept": 0.782
      },
      {
        "full": 313,
        "fifth": 33.6,
        "kept": 0.717
      },
      {
        "full": 409,
        "fifth": 42,
        "kept": 0.586
      }
    ],
    "e": [
      {
        "full": 158,
        "fifth": 33.3,
        "kept": 1.059
      },
      {
        "full": 194,
        "fifth": 40,
        "kept": 1.026
      },
      {
        "full": 237,
        "fifth": 49.8,
        "kept": 0.936
      },
      {
        "full": 285,
        "fifth": 62.9,
        "kept": 0.779
      }
    ],
    "r": [
      {
        "full": 57,
        "fifth": 9.3,
        "kept": 1.043
      },
      {
        "full": 73,
        "fifth": 11.5,
        "kept": 1.022
      },
      {
        "full": 95,
        "fifth": 14.7,
        "kept": 0.974
      },
      {
        "full": 124,
        "fifth": 18.8,
        "kept": 0.887
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
        "fifth": 68,
        "kept": 0.917
      },
      {
        "full": 767,
        "fifth": 71.7,
        "kept": 0.894
      }
    ],
    "e": [
      {
        "full": 281,
        "fifth": 55.6,
        "kept": 0.759
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
        "full": 158,
        "fifth": 21.9,
        "kept": 0.852
      },
      {
        "full": 213,
        "fifth": 22.4,
        "kept": 0.799
      },
      {
        "full": 222,
        "fifth": 23.4,
        "kept": 0.761
      },
      {
        "full": 231,
        "fifth": 24.5,
        "kept": 0.721
      }
    ]
  },
  "nighttimber1200": {
    "a": [
      {
        "full": 591,
        "fifth": 105.2,
        "kept": 0.831
      },
      {
        "full": 643,
        "fifth": 115.3,
        "kept": 0.801
      },
      {
        "full": 691,
        "fifth": 127,
        "kept": 0.719
      },
      {
        "full": 772,
        "fifth": 139.5,
        "kept": 0.55
      }
    ],
    "e": [
      {
        "full": 299,
        "fifth": 89.4,
        "kept": 0.791
      },
      {
        "full": 322,
        "fifth": 100.8,
        "kept": 0.817
      },
      {
        "full": 342,
        "fifth": 113.3,
        "kept": 0.752
      },
      {
        "full": 361,
        "fifth": 125.2,
        "kept": 0.692
      }
    ],
    "r": [
      {
        "full": 149,
        "fifth": 30.8,
        "kept": 0.927
      },
      {
        "full": 171,
        "fifth": 35.5,
        "kept": 0.873
      },
      {
        "full": 195,
        "fifth": 40.5,
        "kept": 0.8
      },
      {
        "full": 219,
        "fifth": 45.9,
        "kept": 0.706
      }
    ]
  },
  "timber1500": {
    "a": [
      {
        "full": 386,
        "fifth": 44.4,
        "kept": 0.873
      },
      {
        "full": 446,
        "fifth": 51.3,
        "kept": 0.835
      },
      {
        "full": 497,
        "fifth": 58.7,
        "kept": 0.792
      },
      {
        "full": 557,
        "fifth": 66,
        "kept": 0.729
      }
    ],
    "e": [
      {
        "full": 247,
        "fifth": 54.1,
        "kept": 0.99
      },
      {
        "full": 303,
        "fifth": 63,
        "kept": 0.985
      },
      {
        "full": 369,
        "fifth": 74.7,
        "kept": 0.911
      },
      {
        "full": 436,
        "fifth": 90.3,
        "kept": 0.685
      }
    ],
    "r": [
      {
        "full": 126,
        "fifth": 19.4,
        "kept": 1.012
      },
      {
        "full": 158,
        "fifth": 23.9,
        "kept": 0.954
      },
      {
        "full": 196,
        "fifth": 29.3,
        "kept": 0.865
      },
      {
        "full": 238,
        "fifth": 35.1,
        "kept": 0.747
      }
    ]
  }
};
