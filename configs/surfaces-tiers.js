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
        "hinge": 1,
        "servo": "d89mw",
        "dKg": 0,
        "power": 1
      },
      {
        "tier": "sport",
        "cf": 0.3367,
        "throwDeg": 37.6867,
        "k": 1.059328,
        "cd": 0.040203,
        "hinge": 1.3904,
        "servo": "d645mw",
        "dKg": 0.07,
        "power": 1.0929
      },
      {
        "tier": "3d",
        "cf": 0.3833,
        "throwDeg": 38.8433,
        "k": 1.111995,
        "cd": 0.080407,
        "hinge": 1.8579,
        "servo": "d950tw",
        "dKg": 0.086,
        "power": 1.1824
      },
      {
        "tier": "extreme",
        "cf": 0.43,
        "throwDeg": 40,
        "k": 1.159109,
        "cd": 0.12061,
        "hinge": 2.4074,
        "servo": "d950tw",
        "dKg": 0.086,
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
        "hinge": 1,
        "servo": "d89mw",
        "dKg": 0,
        "power": 1
      },
      {
        "tier": "sport",
        "cf": 0.5233,
        "throwDeg": 43.1133,
        "k": 1.044782,
        "cd": 0.017429,
        "hinge": 1.4699,
        "servo": "d645mw",
        "dKg": 0.035,
        "power": 1.1355
      },
      {
        "tier": "3d",
        "cf": 0.5967,
        "throwDeg": 46.5567,
        "k": 1.084741,
        "cd": 0.034858,
        "hinge": 2.0633,
        "servo": "d950tw",
        "dKg": 0.043,
        "power": 1.2731
      },
      {
        "tier": "extreme",
        "cf": 0.67,
        "throwDeg": 50,
        "k": 1.122627,
        "cd": 0.052287,
        "hinge": 2.794,
        "servo": "d950tw",
        "dKg": 0.043,
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
        "hinge": 1,
        "servo": "d89mw",
        "dKg": 0,
        "power": 1
      },
      {
        "tier": "sport",
        "cf": 0.7733,
        "throwDeg": 55.05,
        "k": 1.00495,
        "cd": 0.001247,
        "hinge": 1.0354,
        "servo": "d645mw",
        "dKg": 0.035,
        "power": 1.005
      },
      {
        "tier": "3d",
        "cf": 0.7867,
        "throwDeg": 55.05,
        "k": 1.009716,
        "cd": 0.002493,
        "hinge": 1.0714,
        "servo": "d645mw",
        "dKg": 0.035,
        "power": 1.0097
      },
      {
        "tier": "extreme",
        "cf": 0.8,
        "throwDeg": 55.05,
        "k": 1.014296,
        "cd": 0.00374,
        "hinge": 1.108,
        "servo": "d645mw",
        "dKg": 0.035,
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
        "hinge": 1,
        "servo": "hs55",
        "dKg": 0,
        "power": 1
      },
      {
        "tier": "sport",
        "cf": 0.31,
        "throwDeg": 25.3333,
        "k": 0.870989,
        "cd": 0.032571,
        "hinge": 2.164,
        "servo": "d89mw",
        "dKg": 0.034,
        "power": 1.2258
      },
      {
        "tier": "3d",
        "cf": 0.37,
        "throwDeg": 32.6667,
        "k": 0.832498,
        "cd": 0.065143,
        "hinge": 3.9752,
        "servo": "d89mw",
        "dKg": 0.034,
        "power": 1.5108
      },
      {
        "tier": "extreme",
        "cf": 0.43,
        "throwDeg": 40,
        "k": 0.838704,
        "cd": 0.097714,
        "hinge": 6.5742,
        "servo": "d645mw",
        "dKg": 0.104,
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
        "hinge": 1,
        "servo": "hs55",
        "dKg": 0,
        "power": 1
      },
      {
        "tier": "sport",
        "cf": 0.49,
        "throwDeg": 26.6667,
        "k": 0.731189,
        "cd": 0.015107,
        "hinge": 2.6678,
        "servo": "d89mw",
        "dKg": 0.017,
        "power": 1.2999
      },
      {
        "tier": "3d",
        "cf": 0.58,
        "throwDeg": 38.3333,
        "k": 0.678651,
        "cd": 0.030214,
        "hinge": 5.3731,
        "servo": "d645mw",
        "dKg": 0.052,
        "power": 1.7343
      },
      {
        "tier": "extreme",
        "cf": 0.67,
        "throwDeg": 50,
        "k": 0.68582,
        "cd": 0.045321,
        "hinge": 9.3521,
        "servo": "d950tw",
        "dKg": 0.06,
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
        "hinge": 1,
        "servo": "hs55",
        "dKg": 0,
        "power": 1
      },
      {
        "tier": "sport",
        "cf": 0.6,
        "throwDeg": 26.6667,
        "k": 0.720921,
        "cd": 0.007143,
        "hinge": 2.56,
        "servo": "d89mw",
        "dKg": 0.017,
        "power": 1.2816
      },
      {
        "tier": "3d",
        "cf": 0.7,
        "throwDeg": 38.3333,
        "k": 0.661274,
        "cd": 0.014286,
        "hinge": 5.0089,
        "servo": "d645mw",
        "dKg": 0.052,
        "power": 1.6899
      },
      {
        "tier": "extreme",
        "cf": 0.8,
        "throwDeg": 50,
        "k": 0.660955,
        "cd": 0.021429,
        "hinge": 8.5333,
        "servo": "d645mw",
        "dKg": 0.052,
        "power": 2.2032
      }
    ]
  }
};
