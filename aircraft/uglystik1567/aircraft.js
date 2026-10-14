/*
 * aircraft/uglystik1567/aircraft.js: the Ugly Stik as data, one
 * aircraft's rows for configs/aircraft.js to assemble
 * (docs/AIRCRAFT-FOLDER.md). Plain JSON after `export default`, which
 * scripts/aircraft-folder-selftest.js holds: no expression, no import.
 *
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

export default {
  "id": "uglystik1567",
  "airframe": {
    "id": "uglystik1567",
    "simId": 19,
    "fixedWing": true,
    "voice": "glow2",
    "stall": 9.48,
    "topSpeed": 28.29,
    "gear": {
      "restHeight": 0.2024,
      "restPitchDeg": -2.06
    },
    "name": "Ugly Stik",
    "short": "Stik",
    "blurb": "Phil Kraft's Das Ugly Stik, 62 in of slab sided balsa in RCM's red with white panels and black crosses, on an O.S. .61 two stroke. The sport plane after the trainer: it rolls on its strip ailerons, loops round at full throttle, flies on its back with a push and goes where you point it until you tell it otherwise.",
    "facts": [
      "Two stroke .61",
      "1567 mm",
      "Four channels"
    ],
    "sizeMm": 1567,
    "grams": 2721.6,
    "trackClass": "wing",
    "class": "plane",
    "roles": [],
    "cells": 2,
    "packVoltages": [
      4.2,
      3.8,
      3.5
    ],
    "packLabels": {
      "4.2": "Charged",
      "3.8": "Half",
      "3.5": "Nearly empty"
    },
    "defaultTune": "uglystik-manual",
    "gravityBase": 1,
    "rates": {
      "type": "ACTUAL",
      "roll": {
        "rcRate": 7,
        "srate": 67,
        "expo": 0
      },
      "pitch": {
        "rcRate": 7,
        "srate": 67,
        "expo": 0
      },
      "yaw": {
        "rcRate": 7,
        "srate": 67,
        "expo": 0
      },
      "throttleCap": 100
    },
    "cameraFov": 100,
    "cameraAngle": 5,
    "dims": {
      "arm": 0,
      "propR": 0.1524,
      "hullR": 0.8844,
      "vHalfDown": 0.2032,
      "vHalfUp": 0.1735,
      "bodyLength": 1.3061,
      "bodyWidth": 1.5682,
      "bodyHeight": 0.3767
    }
  },
  "kit": {
    "slots": [
      {
        "id": "spinner",
        "options": [
          "stock",
          "bullet"
        ]
      },
      {
        "id": "wheels",
        "options": [
          "stock",
          "pants"
        ]
      }
    ],
    "drawn": true
  },
  "tuning": {
    "chord": 0.3256,
    "area": 0.51055,
    "margin": 0.101,
    "cg": {
      "mm": 119.1,
      "datum": "tuning.datum.root_le",
      "range": null,
      "source": "RCM plan 939, its C.G. mark 4.69 in behind the leading edge, and Kraft's \"It should balance approximately on the main spar\", no range; https://outerzone.co.uk/plan_details.asp?ID=6801"
    },
    "packKg": 0.1,
    "nose": 0.2985,
    "tail": -0.785,
    "throws": {
      "high": [
        12.5969,
        12.9765,
        14.627
      ],
      "low": [
        8.8,
        9.1,
        10.2
      ],
      "source": "RCM plan 939's \"Control Surface Travel Limits (measured at trailing edge)\": ailerons 5/16 in up and 1/4 down on the 1.29 in strip aileron, their mean, elevator 3/8 in on its 1.67 in, rudder 1 in on its 3.96 in (docs/UGLYSTIK-STAGE1.md), one set; low: 70 percent of high, the low rate the Timber, Radian and Radian Pro manuals state; https://outerzone.co.uk/plan_details.asp?ID=6801"
    },
    "flaps": null
  },
  "power": {
    "table": {
      "simId": 19,
      "massKg": 2.7216,
      "cells": 2,
      "rCell": 0.03,
      "propIn": 12,
      "cruiseMs": 17.33,
      "flightTime": null
    },
    "options": [
      {
        "id": "stock",
        "name": "power.uglystik.stock",
        "kind": "glow",
        "voice": "glow2",
        "propIn": 12,
        "pitchIn": 6,
        "blades": 2,
        "thrustN": 36.206,
        "rpmNoLoad": 12817.6,
        "pitchSpeedMs": 27.673,
        "idle": 0.1836,
        "flowFullM3s": 4.5666666666666665e-7,
        "leanFrac": 0.05,
        "leanGain": 0.05,
        "massKg": 2.7216,
        "cgShiftM": 0,
        "packs": [
          {
            "id": "355cc",
            "cc": 355,
            "m3": 0.000355,
            "massKg": 0.310625,
            "source": "https://outerzone.co.uk/plan_details.asp?ID=6801"
          }
        ],
        "pack": "355cc",
        "source": [
          "https://outerzone.co.uk/plan_details.asp?ID=6801",
          "https://www.os-engines.co.jp/english/line_up/engine/air/aircraft/manual/50sx_40-91fx.pdf",
          "https://www.rcuniverse.com/forum/glow-engines-114/6767782-o-s-61-fx-engines.html",
          "https://www.apcprop.com/files/PER3_12x6.dat",
          "https://api.drum.lib.umd.edu/server/api/core/bitstreams/3ae6ca8c-b068-4d07-90dc-7f5bf6a95b3c/content"
        ]
      },
      {
        "id": "fx46",
        "name": "power.uglystik.fx46",
        "kind": "glow",
        "voice": "glow2",
        "propIn": 11,
        "pitchIn": 6,
        "blades": 2,
        "thrustN": 30.506,
        "rpmNoLoad": 13636.470588235294,
        "pitchSpeedMs": 29.44114,
        "idle": 0.21568458286601674,
        "flowFullM3s": 3.4192629815745396e-7,
        "leanFrac": 0.05,
        "leanGain": 0.05,
        "massKg": 2.5466,
        "cgShiftM": 0,
        "packs": [
          {
            "id": "355cc",
            "cc": 355,
            "m3": 0.000355,
            "massKg": 0.310625,
            "source": "https://outerzone.co.uk/plan_details.asp?ID=6801"
          }
        ],
        "pack": "355cc",
        "source": [
          "https://www.os-engines.co.jp/english/line_up/engine/air/aircraft/manual/50sx_40-91fx.pdf",
          "https://www.apcprop.com/files/PER3_11x6.dat"
        ]
      }
    ],
    "estimates": {
      "stock": {
        "355cc": {
          "topSpeed": 28.28,
          "minutes": 20.6
        }
      },
      "fx46": {
        "355cc": {
          "topSpeed": 28.22,
          "minutes": 28.3
        }
      }
    }
  },
  "hangar": {
    "props": [
      {
        "id": "stock",
        "name": "parts.prop.stock"
      },
      {
        "id": "12x7",
        "name": "parts.prop.12x7",
        "apc": "12x7",
        "propIn": 12,
        "pitchIn": 7,
        "blades": 2,
        "massKg": 0.043091275150000004,
        "source": [
          "https://www.apcprop.com/product/12x7/",
          "https://www.apcprop.com/files/PER3_12x7.dat"
        ]
      },
      {
        "id": "12x8",
        "name": "parts.prop.12x8",
        "apc": "12x8",
        "propIn": 12,
        "pitchIn": 8,
        "blades": 2,
        "massKg": 0.04791069408125,
        "source": [
          "https://www.apcprop.com/product/12x8/",
          "https://www.apcprop.com/files/PER3_12x8.dat"
        ]
      }
    ],
    "anchors": {
      "prop": [
        0.4064,
        0,
        -0.0043
      ],
      "belly": [
        0,
        0,
        -0.053
      ],
      "tail": [
        -0.785,
        0,
        -0.053
      ],
      "tank": [
        -0.01,
        0,
        -0.03
      ],
      "led": [
        [
          0.117,
          0.15,
          0.045
        ],
        [
          0.117,
          0.7,
          0.082
        ]
      ]
    }
  },
  "livery": {
    "regions": [
      {
        "id": "wing",
        "stock": "#c8161a"
      },
      {
        "id": "fuselage",
        "stock": "#c8161a"
      },
      {
        "id": "tail",
        "stock": "#c8161a"
      },
      {
        "id": "panels",
        "stock": "#f2efe6"
      },
      {
        "id": "crosses",
        "stock": "#141416"
      }
    ],
    "schemes": [
      {
        "id": "stock",
        "source": {
          "label": "RCM, Das Ugly Stik, plan 939, May 1985 (Outerzone oz6801)",
          "url": "https://outerzone.co.uk/plan_details.asp?ID=6801"
        },
        "colours": {}
      }
    ]
  },
  "tunes": [
    {
      "id": "uglystik-manual",
      "airframe": "uglystik1567",
      "name": "Manual",
      "note": "No flight controller. The sticks are the ailerons, the elevator and the rudder, which also steers the nose wheel, at RCM's travel limits. It goes where you point it and stays there: it holds a bank, loops round at full throttle and flies on its back with half the stick pushed. Throttle closed, the two stroke idles."
    },
    {
      "id": "uglystik-as3x",
      "airframe": "uglystik1567",
      "name": "AS3X",
      "note": "A Spektrum AS3X receiver fitted in place of a plain one, which any plane can carry: the sticks are the surfaces; centred, the gyro holds the attitude you left it in, against the gusts; held, it turns at the rate you ask; past 40 percent stick it lets go, so full stick is full throw. Nothing levels it and nothing caps a rate.",
      "wingStab": 3
    },
    {
      "id": "uglystik-stab",
      "airframe": "uglystik1567",
      "name": "Stabilised",
      "note": "A gyro holds the plane once it is off the ground. Roll stick asks for a bank up to 60 degrees, pitch stick for a pitch up to 30, centred sticks fly level, and the rudder is coordinated for you. Throttle closed, it lowers the nose onto its glide.",
      "wingStab": 1
    }
  ],
  "progress": {
    "level": 3
  },
  "strings": {
    "en": {
      "carousel.note.uglystik1567": "Phil Kraft's sport plane, the step after the trainer. It goes where you point it: rolls, loops, flies on its back with a push.",
      "power.uglystik.stock": "O.S. 61FX two stroke, 12 x 6 (stock)",
      "power.uglystik.fx46": "O.S. 46FX two stroke, 11 x 6",
      "airframe.blurb.uglystik1567": "Phil Kraft's Das Ugly Stik, 62 in of slab sided balsa in RCM's red with white panels and black crosses, on an O.S. .61 two stroke. The sport plane after the trainer: it rolls on its strip ailerons, loops round at full throttle, flies on its back with a push and goes where you point it until you tell it otherwise.",
      "livery.scheme.uglystik1567.stock": "RCM red, white panels, black crosses"
    },
    "es": {
      "carousel.note.uglystik1567": "El avión deportivo de Phil Kraft, el paso siguiente al entrenador. Va a donde lo apuntas: hace toneles, rizos y vuela invertido empujando un poco.",
      "power.uglystik.stock": "O.S. 61FX de dos tiempos, 12 x 6 (de serie)",
      "power.uglystik.fx46": "O.S. 46FX de dos tiempos, 11 x 6",
      "airframe.blurb.uglystik1567": "El Das Ugly Stik de Phil Kraft, 62 pulgadas de balsa de lados planos en el rojo de RCM con paneles blancos y cruces negras, con un dos tiempos O.S. .61. El avión deportivo después del entrenador: alabea con sus alerones de tira, rizan a fondo de acelerador, vuela invertido con un empujón y va adonde lo apuntas hasta que le digas otra cosa.",
      "livery.scheme.uglystik1567.stock": "Rojo de RCM, paneles blancos, cruces negras"
    }
  }
};
