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
        "kept": 0.893
      },
      {
        "full": 374,
        "fifth": 80.1,
        "kept": 0.826
      },
      {
        "full": 394,
        "fifth": 87.9,
        "kept": 0.771
      },
      {
        "full": 409,
        "fifth": 95.8,
        "kept": 0.709
      }
    ],
    "r": [
      {
        "full": 319,
        "fifth": 52.8,
        "kept": 0.553
      },
      {
        "full": 319,
        "fifth": 52.8,
        "kept": 0.553
      },
      {
        "full": 319,
        "fifth": 52.8,
        "kept": 0.553
      },
      {
        "full": 319,
        "fifth": 52.8,
        "kept": 0.553
      }
    ]
  },
  "cub1400": {
    "a": [
      {
        "full": 203,
        "fifth": 21.1,
        "kept": 0.848
      },
      {
        "full": 245,
        "fifth": 26.7,
        "kept": 0.781
      },
      {
        "full": 315,
        "fifth": 33.6,
        "kept": 0.716
      },
      {
        "full": 409,
        "fifth": 42,
        "kept": 0.583
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
        "kept": 0.773
      }
    ],
    "r": [
      {
        "full": 57,
        "fifth": 9.3,
        "kept": 1.044
      },
      {
        "full": 72,
        "fifth": 11.5,
        "kept": 1.024
      },
      {
        "full": 95,
        "fifth": 14.7,
        "kept": 0.981
      },
      {
        "full": 123,
        "fifth": 18.8,
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
        "full": 157,
        "fifth": 21.9,
        "kept": 0.865
      },
      {
        "full": 212,
        "fifth": 22.4,
        "kept": 0.817
      },
      {
        "full": 221,
        "fifth": 23.4,
        "kept": 0.781
      },
      {
        "full": 230,
        "fifth": 24.5,
        "kept": 0.743
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
        "full": 643,
        "fifth": 115.3,
        "kept": 0.801
      },
      {
        "full": 691,
        "fifth": 126.9,
        "kept": 0.718
      },
      {
        "full": 774,
        "fifth": 139.4,
        "kept": 0.55
      }
    ],
    "e": [
      {
        "full": 299,
        "fifth": 89.4,
        "kept": 0.776
      },
      {
        "full": 322,
        "fifth": 100.8,
        "kept": 0.82
      },
      {
        "full": 342,
        "fifth": 113.3,
        "kept": 0.755
      },
      {
        "full": 361,
        "fifth": 125.2,
        "kept": 0.696
      }
    ],
    "r": [
      {
        "full": 149,
        "fifth": 30.8,
        "kept": 0.934
      },
      {
        "full": 171,
        "fifth": 35.5,
        "kept": 0.886
      },
      {
        "full": 194,
        "fifth": 40.5,
        "kept": 0.822
      },
      {
        "full": 217,
        "fifth": 45.9,
        "kept": 0.741
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
        "full": 558,
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
        "kept": 0.684
      }
    ],
    "r": [
      {
        "full": 126,
        "fifth": 19.4,
        "kept": 1.015
      },
      {
        "full": 158,
        "fifth": 23.9,
        "kept": 0.961
      },
      {
        "full": 196,
        "fifth": 29.3,
        "kept": 0.881
      },
      {
        "full": 237,
        "fifth": 35.1,
        "kept": 0.777
      }
    ]
  }
};
