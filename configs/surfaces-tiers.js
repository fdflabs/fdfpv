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

/* WRITTEN BY scripts/surfaces-derive.js --write; do not edit. Per aircraft,
 * surface (a e r) and tier (stock sport 3d extreme): docs/SURFACES-STAGE1.md. */
export const SURFACE_TIERS = {
  "extra3d1308": {
    "offered": {
      "a": true,
      "e": true,
      "r": false
    },
    "a": [
      {
        "tier": "stock",
        "cf": 0.29,
        "throwDeg": 36.53,
        "k": 1,
        "cd": 0,
        "hinge": 1.2974,
        "servo": "d89mw",
        "n": 2,
        "dKg": 0,
        "hold": 1,
        "power": 1
      },
      {
        "tier": "sport",
        "cf": 0.3367,
        "throwDeg": 37.6867,
        "k": 1.059328,
        "cd": 0.040203,
        "hinge": 1.8968,
        "servo": "d950tw",
        "n": 2,
        "dKg": 0.086,
        "hold": 3.173511,
        "power": 1.0929
      },
      {
        "tier": "3d",
        "cf": 0.3833,
        "throwDeg": 38.8433,
        "k": 1.111995,
        "cd": 0.080407,
        "hinge": 2.6642,
        "servo": "d950tw",
        "n": 2,
        "dKg": 0.086,
        "hold": 2.312066,
        "power": 1.1824
      },
      {
        "tier": "extreme",
        "cf": 0.43,
        "throwDeg": 40,
        "k": 1.159109,
        "cd": 0.12061,
        "hinge": 3.6097,
        "servo": "d950tw",
        "n": 2,
        "dKg": 0.086,
        "hold": 1.745379,
        "power": 1.2692
      }
    ],
    "e": [
      {
        "tier": "stock",
        "cf": 0.45,
        "throwDeg": 39.67,
        "k": 1,
        "cd": 0,
        "hinge": 1.174,
        "servo": "d89mw",
        "n": 1,
        "dKg": 0,
        "hold": 1,
        "power": 1
      },
      {
        "tier": "sport",
        "cf": 0.5233,
        "throwDeg": 43.1133,
        "k": 1.044782,
        "cd": 0.017429,
        "hinge": 1.8312,
        "servo": "d950tw",
        "n": 1,
        "dKg": 0.043,
        "hold": 3.099171,
        "power": 1.1355
      },
      {
        "tier": "3d",
        "cf": 0.5967,
        "throwDeg": 46.5567,
        "k": 1.084741,
        "cd": 0.034858,
        "hinge": 2.6705,
        "servo": "d950tw",
        "n": 1,
        "dKg": 0.043,
        "hold": 2.258217,
        "power": 1.2731
      },
      {
        "tier": "extreme",
        "cf": 0.67,
        "throwDeg": 50,
        "k": 1.122627,
        "cd": 0.052287,
        "hinge": 3.7019,
        "servo": "d950tw",
        "n": 1,
        "dKg": 0.043,
        "hold": 1.725035,
        "power": 1.415
      }
    ],
    "r": [
      {
        "tier": "stock",
        "cf": 0.76,
        "throwDeg": 55.05,
        "k": 1,
        "cd": 0,
        "hinge": 2.6165,
        "servo": "d89mw",
        "n": 1,
        "dKg": 0,
        "hold": 1,
        "power": 1
      },
      {
        "tier": "sport",
        "cf": 0.7733,
        "throwDeg": 55.05,
        "k": 1.00495,
        "cd": 0.001247,
        "hinge": 2.7044,
        "servo": "d950tw",
        "n": 1,
        "dKg": 0.043,
        "hold": 4.384077,
        "power": 1.005
      },
      {
        "tier": "3d",
        "cf": 0.7867,
        "throwDeg": 55.05,
        "k": 1.009716,
        "cd": 0.002493,
        "hinge": 2.7939,
        "servo": "d950tw",
        "n": 1,
        "dKg": 0.043,
        "hold": 4.24357,
        "power": 1.0097
      },
      {
        "tier": "extreme",
        "cf": 0.8,
        "throwDeg": 55.05,
        "k": 1.014296,
        "cd": 0.00374,
        "hinge": 2.8852,
        "servo": "d950tw",
        "n": 1,
        "dKg": 0.043,
        "hold": 4.109306,
        "power": 1.0143
      }
    ]
  },
  "cub1400": {
    "offered": {
      "a": true,
      "e": true,
      "r": true
    },
    "a": [
      {
        "tier": "stock",
        "cf": 0.25,
        "throwDeg": 18,
        "k": 1,
        "cd": 0,
        "hinge": 0.2204,
        "servo": "hs55",
        "n": 2,
        "dKg": 0,
        "hold": 1,
        "power": 1
      },
      {
        "tier": "sport",
        "cf": 0.31,
        "throwDeg": 25.3333,
        "k": 0.870989,
        "cd": 0.032571,
        "hinge": 0.6476,
        "servo": "hs55",
        "n": 2,
        "dKg": 0,
        "hold": 0.435903,
        "power": 1.2258
      },
      {
        "tier": "3d",
        "cf": 0.37,
        "throwDeg": 32.6667,
        "k": 0.832498,
        "cd": 0.065143,
        "hinge": 1.4612,
        "servo": "hs65mg",
        "n": 2,
        "dKg": 0.00894,
        "hold": 0.385319,
        "power": 1.5108
      },
      {
        "tier": "extreme",
        "cf": 0.43,
        "throwDeg": 40,
        "k": 0.838704,
        "cd": 0.097714,
        "hinge": 2.9312,
        "servo": "d89mw",
        "n": 2,
        "dKg": 0.034,
        "hold": 0.650802,
        "power": 1.8638
      }
    ],
    "e": [
      {
        "tier": "stock",
        "cf": 0.4,
        "throwDeg": 15,
        "k": 1,
        "cd": 0,
        "hinge": 0.1418,
        "servo": "hs55",
        "n": 1,
        "dKg": 0,
        "hold": 1,
        "power": 1
      },
      {
        "tier": "sport",
        "cf": 0.49,
        "throwDeg": 26.6667,
        "k": 0.731189,
        "cd": 0.015107,
        "hinge": 0.6154,
        "servo": "hs55",
        "n": 1,
        "dKg": 0,
        "hold": 0.372992,
        "power": 1.2999
      },
      {
        "tier": "3d",
        "cf": 0.58,
        "throwDeg": 38.3333,
        "k": 0.678651,
        "cd": 0.030214,
        "hinge": 1.5641,
        "servo": "hs65mg",
        "n": 1,
        "dKg": 0.00447,
        "hold": 0.320055,
        "power": 1.7343
      },
      {
        "tier": "extreme",
        "cf": 0.67,
        "throwDeg": 50,
        "k": 0.68582,
        "cd": 0.045321,
        "hinge": 3.2451,
        "servo": "d89mw",
        "n": 1,
        "dKg": 0.017,
        "hold": 0.553033,
        "power": 2.2861
      }
    ],
    "r": [
      {
        "tier": "stock",
        "cf": 0.5,
        "throwDeg": 15,
        "k": 1,
        "cd": 0,
        "hinge": 0.0798,
        "servo": "hs55",
        "n": 1,
        "dKg": 0,
        "hold": 1,
        "power": 1
      },
      {
        "tier": "sport",
        "cf": 0.6,
        "throwDeg": 26.6667,
        "k": 0.720921,
        "cd": 0.007143,
        "hinge": 0.3077,
        "servo": "hs55",
        "n": 1,
        "dKg": 0,
        "hold": 0.420177,
        "power": 1.2816
      },
      {
        "tier": "3d",
        "cf": 0.7,
        "throwDeg": 38.3333,
        "k": 0.661274,
        "cd": 0.014286,
        "hinge": 0.7074,
        "servo": "hs55",
        "n": 1,
        "dKg": 0,
        "hold": 0.235523,
        "power": 1.6899
      },
      {
        "tier": "extreme",
        "cf": 0.8,
        "throwDeg": 50,
        "k": 0.660955,
        "cd": 0.021429,
        "hinge": 1.4,
        "servo": "hs65mg",
        "n": 1,
        "dKg": 0.00447,
        "hold": 0.248194,
        "power": 2.2032
      }
    ]
  },
  "slick2680": {
    "offered": {
      "a": true,
      "e": true,
      "r": true
    },
    "a": [
      {
        "tier": "stock",
        "cf": 0.32,
        "throwDeg": 37.5,
        "k": 1,
        "cd": 0,
        "hinge": 0.8228,
        "servo": "sb2290sg",
        "n": 4,
        "dKg": 0,
        "hold": 1,
        "power": 1
      },
      {
        "tier": "sport",
        "cf": 0.3567,
        "throwDeg": 38.3333,
        "k": 1.04263,
        "cd": 0.029531,
        "hinge": 1.0883,
        "servo": "sb2290sg",
        "n": 6,
        "dKg": 0.162,
        "hold": 1.153172,
        "power": 1.0658
      },
      {
        "tier": "3d",
        "cf": 0.3933,
        "throwDeg": 39.1667,
        "k": 1.081571,
        "cd": 0.059062,
        "hinge": 1.4131,
        "servo": "sb2290sg",
        "n": 6,
        "dKg": 0.162,
        "hold": 0.902827,
        "power": 1.1296
      },
      {
        "tier": "extreme",
        "cf": 0.43,
        "throwDeg": 40,
        "k": 1.117285,
        "cd": 0.088593,
        "hinge": 1.7899,
        "servo": "sb2290sg",
        "n": 8,
        "dKg": 0.324,
        "hold": 0.965897,
        "power": 1.1918
      }
    ],
    "e": [
      {
        "tier": "stock",
        "cf": 0.566,
        "throwDeg": 47.5,
        "k": 1,
        "cd": 0,
        "hinge": 1.2436,
        "servo": "sb2290sg",
        "n": 2,
        "dKg": 0,
        "hold": 1,
        "power": 1
      },
      {
        "tier": "sport",
        "cf": 0.6007,
        "throwDeg": 48.3333,
        "k": 1.020187,
        "cd": 0.007488,
        "hinge": 1.4527,
        "servo": "sb2290sg",
        "n": 4,
        "dKg": 0.162,
        "hold": 1.736086,
        "power": 1.0381
      },
      {
        "tier": "3d",
        "cf": 0.6353,
        "throwDeg": 49.1667,
        "k": 1.039205,
        "cd": 0.014976,
        "hinge": 1.6729,
        "servo": "sb2290sg",
        "n": 4,
        "dKg": 0.162,
        "hold": 1.528479,
        "power": 1.0757
      },
      {
        "tier": "extreme",
        "cf": 0.67,
        "throwDeg": 50,
        "k": 1.057194,
        "cd": 0.022464,
        "hinge": 1.9168,
        "servo": "sb2290sg",
        "n": 4,
        "dKg": 0.162,
        "hold": 1.352151,
        "power": 1.1128
      }
    ],
    "r": [
      {
        "tier": "stock",
        "cf": 0.68,
        "throwDeg": 45,
        "k": 1,
        "cd": 0,
        "hinge": 1.7674,
        "servo": "sb2290sg",
        "n": 1,
        "dKg": 0,
        "hold": 1,
        "power": 1
      },
      {
        "tier": "sport",
        "cf": 0.72,
        "throwDeg": 46.6667,
        "k": 1.013488,
        "cd": 0.004995,
        "hinge": 2.1046,
        "servo": "sb2290sg",
        "n": 3,
        "dKg": 0.162,
        "hold": 2.593083,
        "power": 1.051
      },
      {
        "tier": "3d",
        "cf": 0.76,
        "throwDeg": 48.3333,
        "k": 1.026414,
        "cd": 0.00999,
        "hinge": 2.4985,
        "servo": "sb2290sg",
        "n": 3,
        "dKg": 0.162,
        "hold": 2.246491,
        "power": 1.1024
      },
      {
        "tier": "extreme",
        "cf": 0.8,
        "throwDeg": 50,
        "k": 1.039181,
        "cd": 0.014984,
        "hinge": 2.948,
        "servo": "sb2290sg",
        "n": 3,
        "dKg": 0.162,
        "hold": 1.956633,
        "power": 1.1546
      }
    ]
  },
  "nighttimber1200": {
    "offered": {
      "a": true,
      "e": true,
      "r": true
    },
    "a": [
      {
        "tier": "stock",
        "cf": 0.383,
        "throwDeg": 28.92,
        "k": 1,
        "cd": 0,
        "hinge": 2.1453,
        "servo": "spmsa332",
        "n": 2,
        "dKg": 0,
        "hold": 1,
        "power": 1,
        "flaperon": {
          "servo": "spmsa332",
          "n": 2,
          "dKg": 0
        }
      },
      {
        "tier": "sport",
        "cf": 0.3987,
        "throwDeg": 32.6133,
        "k": 0.962476,
        "cd": 0.006366,
        "hinge": 2.8805,
        "servo": "d89mw",
        "n": 2,
        "dKg": 0.03894,
        "hold": 5.756563,
        "power": 1.0854,
        "flaperon": {
          "servo": "hs65mg",
          "n": 2,
          "dKg": 0.00694
        }
      },
      {
        "tier": "3d",
        "cf": 0.4143,
        "throwDeg": 36.3067,
        "k": 0.941531,
        "cd": 0.012732,
        "hinge": 3.7765,
        "servo": "d89mw",
        "n": 2,
        "dKg": 0.064,
        "hold": 4.755197,
        "power": 1.182,
        "flaperon": {
          "servo": "d89mw",
          "n": 2,
          "dKg": 0.032
        }
      },
      {
        "tier": "extreme",
        "cf": 0.43,
        "throwDeg": 40,
        "k": 0.930471,
        "cd": 0.019098,
        "hinge": 4.858,
        "servo": "d89mw",
        "n": 2,
        "dKg": 0.064,
        "hold": 3.979967,
        "power": 1.287,
        "flaperon": {
          "servo": "d89mw",
          "n": 2,
          "dKg": 0.032
        }
      }
    ],
    "e": [
      {
        "tier": "stock",
        "cf": 0.525,
        "throwDeg": 35.81,
        "k": 1,
        "cd": 0,
        "hinge": 4.7793,
        "servo": "spmsa332",
        "n": 1,
        "dKg": 0,
        "hold": 1,
        "power": 1
      },
      {
        "tier": "sport",
        "cf": 0.5733,
        "throwDeg": 40.54,
        "k": 1.003888,
        "cd": 0.01339,
        "hinge": 7.0029,
        "servo": "d89mw",
        "n": 1,
        "dKg": 0.016,
        "hold": 5.334637,
        "power": 1.1365
      },
      {
        "tier": "3d",
        "cf": 0.6217,
        "throwDeg": 45.27,
        "k": 1.014299,
        "cd": 0.026781,
        "hinge": 9.8745,
        "servo": "d645mw",
        "n": 1,
        "dKg": 0.051,
        "hold": 7.282576,
        "power": 1.2822
      },
      {
        "tier": "extreme",
        "cf": 0.67,
        "throwDeg": 50,
        "k": 1.030951,
        "cd": 0.040171,
        "hinge": 13.4545,
        "servo": "d950tw",
        "n": 1,
        "dKg": 0.059,
        "hold": 14.852194,
        "power": 1.4395
      }
    ],
    "r": [
      {
        "tier": "stock",
        "cf": 0.6,
        "throwDeg": 33.75,
        "k": 1,
        "cd": 0,
        "hinge": 2.0627,
        "servo": "spmsa332",
        "n": 1,
        "dKg": 0,
        "hold": 1,
        "power": 1
      },
      {
        "tier": "sport",
        "cf": 0.6667,
        "throwDeg": 39.1667,
        "k": 0.996492,
        "cd": 0.007909,
        "hinge": 3.1781,
        "servo": "d89mw",
        "n": 1,
        "dKg": 0.016,
        "hold": 5.163312,
        "power": 1.1564
      },
      {
        "tier": "3d",
        "cf": 0.7333,
        "throwDeg": 44.5833,
        "k": 1.003125,
        "cd": 0.015818,
        "hinge": 4.7077,
        "servo": "d89mw",
        "n": 1,
        "dKg": 0.016,
        "hold": 3.855632,
        "power": 1.3251
      },
      {
        "tier": "extreme",
        "cf": 0.8,
        "throwDeg": 50,
        "k": 1.016699,
        "cd": 0.023726,
        "hinge": 6.7722,
        "servo": "d89mw",
        "n": 1,
        "dKg": 0.016,
        "hold": 2.937378,
        "power": 1.5062
      }
    ]
  },
  "timber1500": {
    "offered": {
      "a": true,
      "e": true,
      "r": true
    },
    "a": [
      {
        "tier": "stock",
        "cf": 0.27,
        "throwDeg": 30,
        "k": 1,
        "cd": 0,
        "hinge": 1.823,
        "servo": "spmsa370",
        "n": 2,
        "dKg": 0,
        "hold": 1,
        "power": 1
      },
      {
        "tier": "sport",
        "cf": 0.3233,
        "throwDeg": 33.3333,
        "k": 1.039686,
        "cd": 0.025529,
        "hinge": 3.2837,
        "servo": "d89mw",
        "n": 2,
        "dKg": 0.032,
        "hold": 4.262149,
        "power": 1.1552
      },
      {
        "tier": "3d",
        "cf": 0.3767,
        "throwDeg": 36.6667,
        "k": 1.079268,
        "cd": 0.051058,
        "hinge": 5.4651,
        "servo": "d89mw",
        "n": 2,
        "dKg": 0.032,
        "hold": 2.749792,
        "power": 1.3191
      },
      {
        "tier": "extreme",
        "cf": 0.43,
        "throwDeg": 40,
        "k": 1.117846,
        "cd": 0.076587,
        "hinge": 8.5974,
        "servo": "d645mw",
        "n": 2,
        "dKg": 0.102,
        "hold": 3.298138,
        "power": 1.4905
      }
    ],
    "e": [
      {
        "tier": "stock",
        "cf": 0.44,
        "throwDeg": 20,
        "k": 1,
        "cd": 0,
        "hinge": 1.1749,
        "servo": "spmsa370",
        "n": 1,
        "dKg": 0,
        "hold": 1,
        "power": 1
      },
      {
        "tier": "sport",
        "cf": 0.5167,
        "throwDeg": 30,
        "k": 0.833634,
        "cd": 0.015078,
        "hinge": 3.1611,
        "servo": "d89mw",
        "n": 1,
        "dKg": 0.016,
        "hold": 3.341315,
        "power": 1.2505
      },
      {
        "tier": "3d",
        "cf": 0.5933,
        "throwDeg": 40,
        "k": 0.802812,
        "cd": 0.030157,
        "hinge": 6.9493,
        "servo": "d89mw",
        "n": 1,
        "dKg": 0.016,
        "hold": 1.882839,
        "power": 1.6056
      },
      {
        "tier": "extreme",
        "cf": 0.67,
        "throwDeg": 50,
        "k": 0.8121,
        "cd": 0.045235,
        "hinge": 13.205,
        "servo": "d950tw",
        "n": 1,
        "dKg": 0.059,
        "hold": 5.355415,
        "power": 2.0303
      }
    ],
    "r": [
      {
        "tier": "stock",
        "cf": 0.46,
        "throwDeg": 27,
        "k": 1,
        "cd": 0,
        "hinge": 0.801,
        "servo": "spmsa370",
        "n": 1,
        "dKg": 0,
        "hold": 1,
        "power": 1
      },
      {
        "tier": "sport",
        "cf": 0.5733,
        "throwDeg": 34.6667,
        "k": 0.979784,
        "cd": 0.009858,
        "hinge": 1.7984,
        "servo": "hs65mg",
        "n": 1,
        "dKg": 0.00347,
        "hold": 1.290924,
        "power": 1.258
      },
      {
        "tier": "3d",
        "cf": 0.6867,
        "throwDeg": 42.3333,
        "k": 0.995399,
        "cd": 0.019716,
        "hinge": 3.3794,
        "servo": "d89mw",
        "n": 1,
        "dKg": 0.016,
        "hold": 2.327741,
        "power": 1.5607
      },
      {
        "tier": "extreme",
        "cf": 0.8,
        "throwDeg": 50,
        "k": 1.021186,
        "cd": 0.029573,
        "hinge": 5.8565,
        "servo": "d89mw",
        "n": 1,
        "dKg": 0.016,
        "hold": 1.533154,
        "power": 1.8911
      }
    ]
  }
};
