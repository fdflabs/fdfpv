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
        "fifth": 114.6,
        "kept": 0.883
      },
      {
        "full": 898,
        "fifth": 126.2,
        "kept": 0.834
      },
      {
        "full": 939,
        "fifth": 137,
        "kept": 0.783
      },
      {
        "full": 971,
        "fifth": 147.5,
        "kept": 0.733
      }
    ],
    "e": [
      {
        "full": 348,
        "fifth": 72.2,
        "kept": 0.892
      },
      {
        "full": 374,
        "fifth": 80.1,
        "kept": 0.826
      },
      {
        "full": 394,
        "fifth": 87.9,
        "kept": 0.77
      },
      {
        "full": 409,
        "fifth": 95.8,
        "kept": 0.708
      }
    ],
    "r": [
      {
        "full": 306,
        "fifth": 52.7,
        "kept": 0.735
      },
      {
        "full": 306,
        "fifth": 52.7,
        "kept": 0.735
      },
      {
        "full": 306,
        "fifth": 52.7,
        "kept": 0.735
      },
      {
        "full": 306,
        "fifth": 52.7,
        "kept": 0.735
      }
    ]
  },
  "cub1400": {
    "a": [
      {
        "full": 205,
        "fifth": 21.2,
        "kept": 0.848
      },
      {
        "full": 246,
        "fifth": 26.7,
        "kept": 0.784
      },
      {
        "full": 320,
        "fifth": 33.7,
        "kept": 0.717
      },
      {
        "full": 408,
        "fifth": 42.1,
        "kept": 0.582
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
        "kept": 0.762
      }
    ],
    "r": [
      {
        "full": 56,
        "fifth": 9.2,
        "kept": 1.049
      },
      {
        "full": 70,
        "fifth": 11.4,
        "kept": 1.036
      },
      {
        "full": 91,
        "fifth": 14.6,
        "kept": 1.008
      },
      {
        "full": 117,
        "fifth": 18.7,
        "kept": 0.962
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
        "kept": 0.917
      },
      {
        "full": 767,
        "fifth": 71.6,
        "kept": 0.894
      }
    ],
    "e": [
      {
        "full": 281,
        "fifth": 55.6,
        "kept": 0.756
      },
      {
        "full": 301,
        "fifth": 61.1,
        "kept": 0.726
      },
      {
        "full": 305,
        "fifth": 62.6,
        "kept": 0.706
      },
      {
        "full": 308,
        "fifth": 64.1,
        "kept": 0.687
      }
    ],
    "r": [
      {
        "full": 141,
        "fifth": 21.8,
        "kept": 0.954
      },
      {
        "full": 201,
        "fifth": 22.3,
        "kept": 0.932
      },
      {
        "full": 208,
        "fifth": 23.3,
        "kept": 0.912
      },
      {
        "full": 215,
        "fifth": 24.4,
        "kept": 0.889
      }
    ]
  },
  "nighttimber1200": {
    "a": [
      {
        "full": 591,
        "fifth": 105.2,
        "kept": 0.832
      },
      {
        "full": 642,
        "fifth": 115.3,
        "kept": 0.803
      },
      {
        "full": 690,
        "fifth": 126.9,
        "kept": 0.724
      },
      {
        "full": 771,
        "fifth": 139.4,
        "kept": 0.562
      }
    ],
    "e": [
      {
        "full": 299,
        "fifth": 89.4,
        "kept": 0.779
      },
      {
        "full": 322,
        "fifth": 100.8,
        "kept": 0.819
      },
      {
        "full": 342,
        "fifth": 113.3,
        "kept": 0.755
      },
      {
        "full": 361,
        "fifth": 125.2,
        "kept": 0.695
      }
    ],
    "r": [
      {
        "full": 144,
        "fifth": 30.6,
        "kept": 0.972
      },
      {
        "full": 164,
        "fifth": 35.2,
        "kept": 0.944
      },
      {
        "full": 185,
        "fifth": 40.1,
        "kept": 0.906
      },
      {
        "full": 206,
        "fifth": 45.4,
        "kept": 0.858
      }
    ]
  },
  "timber1500": {
    "a": [
      {
        "full": 387,
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
        "full": 560,
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
        "kept": 0.91
      },
      {
        "full": 436,
        "fifth": 90.3,
        "kept": 0.685
      }
    ],
    "r": [
      {
        "full": 123,
        "fifth": 19.3,
        "kept": 1.034
      },
      {
        "full": 154,
        "fifth": 23.8,
        "kept": 0.995
      },
      {
        "full": 189,
        "fifth": 29.1,
        "kept": 0.94
      },
      {
        "full": 228,
        "fifth": 34.9,
        "kept": 0.867
      }
    ]
  }
};
