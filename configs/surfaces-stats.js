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
        "full": 897,
        "fifth": 126.1,
        "kept": 0.834
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
        "kept": 0.826
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
        "full": 204,
        "fifth": 21.1,
        "kept": 0.848
      },
      {
        "full": 246,
        "fifth": 26.5,
        "kept": 0.783
      },
      {
        "full": 313,
        "fifth": 33.4,
        "kept": 0.717
      },
      {
        "full": 422,
        "fifth": 41.4,
        "kept": 0.598
      }
    ],
    "e": [
      {
        "full": 158,
        "fifth": 33.3,
        "kept": 1.059
      },
      {
        "full": 195,
        "fifth": 41.2,
        "kept": 1.022
      },
      {
        "full": 238,
        "fifth": 53.8,
        "kept": 0.923
      },
      {
        "full": 286,
        "fifth": 67,
        "kept": 0.777
      }
    ],
    "r": [
      {
        "full": 57,
        "fifth": 9.3,
        "kept": 1.045
      },
      {
        "full": 73,
        "fifth": 11.6,
        "kept": 1.03
      },
      {
        "full": 95,
        "fifth": 15,
        "kept": 0.996
      },
      {
        "full": 124,
        "fifth": 19,
        "kept": 0.924
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
        "full": 592,
        "fifth": 105.2,
        "kept": 0.831
      },
      {
        "full": 640,
        "fifth": 115.4,
        "kept": 0.802
      },
      {
        "full": 688,
        "fifth": 126.9,
        "kept": 0.727
      },
      {
        "full": 766,
        "fifth": 139.5,
        "kept": 0.568
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
        "fifth": 100.2,
        "kept": 0.82
      },
      {
        "full": 343,
        "fifth": 111.6,
        "kept": 0.76
      },
      {
        "full": 362,
        "fifth": 123.4,
        "kept": 0.702
      }
    ],
    "r": [
      {
        "full": 149,
        "fifth": 30.8,
        "kept": 0.944
      },
      {
        "full": 171,
        "fifth": 35.5,
        "kept": 0.898
      },
      {
        "full": 195,
        "fifth": 40.5,
        "kept": 0.837
      },
      {
        "full": 219,
        "fifth": 45.9,
        "kept": 0.759
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
        "full": 445,
        "fifth": 51.4,
        "kept": 0.834
      },
      {
        "full": 497,
        "fifth": 58.9,
        "kept": 0.79
      },
      {
        "full": 563,
        "fifth": 66.5,
        "kept": 0.72
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
        "fifth": 62.6,
        "kept": 0.985
      },
      {
        "full": 369,
        "fifth": 74.7,
        "kept": 0.911
      },
      {
        "full": 436,
        "fifth": 88.7,
        "kept": 0.692
      }
    ],
    "r": [
      {
        "full": 126,
        "fifth": 19.4,
        "kept": 1.017
      },
      {
        "full": 158,
        "fifth": 23.9,
        "kept": 0.963
      },
      {
        "full": 196,
        "fifth": 29.3,
        "kept": 0.882
      },
      {
        "full": 238,
        "fifth": 35.1,
        "kept": 0.773
      }
    ]
  }
};
