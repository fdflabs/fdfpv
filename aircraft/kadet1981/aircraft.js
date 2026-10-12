/*
 * aircraft/kadet1981/aircraft.js: the Kadet Senior as data, one
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
  "id": "kadet1981",
  "airframe": {
    "id": "kadet1981",
    "simId": 12,
    "fixedWing": true,
    "voice": "glow4",
    "stall": 7.15,
    "topSpeed": 23.12,
    "gear": {
      "restHeight": 0.3072,
      "restPitchDeg": 0
    },
    "name": "Kadet Senior",
    "short": "Kadet",
    "blurb": "A 78 in SIG Kadet Senior, the classic balsa trainer in transparent yellow and red film, on an O.S. FS-52 four stroke: rudder, elevator and throttle, no ailerons, and a nose wheel that steers. The roll stick works the rudder and it levels itself when you let go. Fly it against the sun to see its ribs.",
    "facts": [
      "Four stroke .52",
      "1981 mm",
      "Three channels"
    ],
    "sizeMm": 1981,
    "grams": 2721.6,
    "trackClass": "wing",
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
    "defaultTune": "kadet-manual",
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
      "hullR": 1.1677,
      "vHalfDown": 0.3072,
      "vHalfUp": 0.2464,
      "bodyLength": 1.5834,
      "bodyWidth": 1.9812,
      "bodyHeight": 0.5536
    }
  },
  "kit": {
    "slots": [
      {
        "id": "spinner",
        "options": [
          "stock",
          "bullet",
          "flat"
        ]
      },
      {
        "id": "wheels",
        "options": [
          "stock",
          "pants"
        ]
      },
      {
        "id": "canopy",
        "options": [
          "stock",
          "smoke",
          "gold"
        ]
      }
    ],
    "drawn": true
  },
  "tuning": {
    "chord": 0.374487,
    "area": 0.741934,
    "margin": 0.268,
    "cg": {
      "mm": 98.4,
      "datum": "tuning.datum.spar",
      "range": null,
      "source": "SIG, \"Center of Gravity 3 7/8 inch At Main Spar\", no range (the kit manual: \"shown on the plan\"); https://sigmfg.com/products/kadet-senior-kit"
    },
    "packKg": 0.1,
    "nose": 0.335,
    "tail": -0.95,
    "throws": {
      "high": [
        0,
        14.4775,
        14.4775
      ],
      "low": [
        0,
        10.1,
        10.1
      ],
      "source": "SIG kit manual p. 24: elevator 3/4 in up and down, rudder 7/8 in each way, one set; low: 70 percent of high, the low rate the Timber, Radian and Radian Pro manuals state; https://cdn.shopify.com/s/files/1/2281/6393/files/sigrc58kadetsenior.pdf"
    },
    "flaps": null
  },
  "power": {
    "table": {
      "simId": 12,
      "massKg": 2.7216,
      "cells": 2,
      "rCell": 0.03,
      "propIn": 12,
      "cruiseMs": 10,
      "flightTime": {
        "kind": "mixed",
        "minutesLow": 19.4,
        "minutesHigh": 19.4,
        "note": "O.S.'s 'around 12 minutes' on 220 cc for the FSa-56II, the FS-52S's successor, is 19.4 min on SIG's 355 cc",
        "source": "https://www.os-engines.co.jp/english/line_up/engine/air/single/img/manual/34330.pdf"
      }
    },
    "options": [
      {
        "id": "stock",
        "name": "power.kadet.stock",
        "kind": "glow",
        "voice": "glow4",
        "propIn": 12,
        "pitchIn": 6,
        "blades": 2,
        "thrustN": 27.83,
        "rpmNoLoad": 11176,
        "pitchSpeedMs": 24.129,
        "idle": 0.2421,
        "flowFullM3s": 3.05e-7,
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
            "source": "https://sigmfg.com/products/kadet-senior-kit"
          },
          {
            "id": "237cc",
            "cc": 237,
            "m3": 0.000237,
            "massKg": 0.207375,
            "source": "https://cdn.shopify.com/s/files/1/2281/6393/files/sigrc58kadetsenior.pdf"
          }
        ],
        "pack": "355cc",
        "source": [
          "https://sigmfg.com/products/kadet-senior-kit",
          "https://www.os-engines.co.jp/english/line_up/engine/air/single/img/manual/34330.pdf",
          "https://api.drum.lib.umd.edu/server/api/core/bitstreams/3ae6ca8c-b068-4d07-90dc-7f5bf6a95b3c/content"
        ]
      },
      {
        "id": "fsa56",
        "name": "power.kadet.fsa56",
        "kind": "glow",
        "voice": "glow4",
        "propIn": 12,
        "pitchIn": 6,
        "blades": 2,
        "thrustN": 29.64,
        "rpmNoLoad": 11522.35294117647,
        "pitchSpeedMs": 24.876759999999997,
        "idle": 0.2450479885644272,
        "flowFullM3s": 3.05e-7,
        "leanFrac": 0.05,
        "leanGain": 0.05,
        "massKg": 2.7066,
        "cgShiftM": 0,
        "packs": [
          {
            "id": "355cc",
            "cc": 355,
            "m3": 0.000355,
            "massKg": 0.310625,
            "source": "https://sigmfg.com/products/kadet-senior-kit"
          },
          {
            "id": "237cc",
            "cc": 237,
            "m3": 0.000237,
            "massKg": 0.207375,
            "source": "https://cdn.shopify.com/s/files/1/2281/6393/files/sigrc58kadetsenior.pdf"
          }
        ],
        "pack": "355cc",
        "source": [
          "https://www.os-engines.co.jp/english/line_up/engine/air/single/catalog/34330.html",
          "https://www.os-engines.co.jp/english/line_up/engine/air/single/img/manual/34330.pdf",
          "https://www.apcprop.com/files/PER3_12x6.dat"
        ]
      },
      {
        "id": "fs64",
        "name": "power.kadet.fs64",
        "kind": "glow",
        "voice": "glow4",
        "propIn": 13,
        "pitchIn": 6,
        "blades": 2,
        "thrustN": 34.217,
        "rpmNoLoad": 11502.35294117647,
        "pitchSpeedMs": 24.833579999999998,
        "idle": 0.245474071801166,
        "flowFullM3s": 3.4771244051665536e-7,
        "leanFrac": 0.05,
        "leanGain": 0.05,
        "massKg": 2.7296,
        "cgShiftM": 0,
        "packs": [
          {
            "id": "355cc",
            "cc": 355,
            "m3": 0.000355,
            "massKg": 0.310625,
            "source": "https://sigmfg.com/products/kadet-senior-kit"
          },
          {
            "id": "237cc",
            "cc": 237,
            "m3": 0.000237,
            "massKg": 0.207375,
            "source": "https://cdn.shopify.com/s/files/1/2281/6393/files/sigrc58kadetsenior.pdf"
          }
        ],
        "pack": "355cc",
        "source": [
          "https://www.os-engines.co.jp/english/line_up/engine/air/single/catalog/3AY00.html",
          "https://www.apcprop.com/files/PER3_13x6.dat"
        ]
      },
      {
        "id": "electric",
        "name": "power.kadet.electric",
        "kind": "electric",
        "voice": "wing",
        "kv": 530,
        "propIn": 13,
        "pitchIn": 8,
        "blades": 2,
        "thrustN": 34.359,
        "currentA": 37.69,
        "rpmNoLoad": 10760,
        "pitchSpeedMs": 30.97445333333333,
        "lvcV": 3,
        "massKg": 2.908975,
        "cgShiftM": 0,
        "packs": [
          {
            "id": "5s5000",
            "cells": 5,
            "mAh": 5000,
            "massKg": 0.657,
            "source": "https://chinahobbyline.com/products/cnhl-5000mah-14-8v-4s-40c-lipo-battery-with-xt90-plug"
          }
        ],
        "pack": "5s5000",
        "source": [
          "https://cdn.shopify.com/s/files/1/2281/6393/files/sigrc96egarfkadetseniorsporteg.pdf",
          "https://web.archive.org/web/2023id_/https://www.maxxprod.com/pdf/HC5018-530.pdf",
          "https://www.apcprop.com/files/PER3_13x8E.dat"
        ]
      }
    ],
    "estimates": {
      "stock": {
        "355cc": {
          "topSpeed": 23.03,
          "minutes": 39.6
        },
        "237cc": {
          "topSpeed": 23.04,
          "minutes": 26.9
        }
      },
      "fsa56": {
        "355cc": {
          "topSpeed": 23.78,
          "minutes": 40.9
        },
        "237cc": {
          "topSpeed": 23.79,
          "minutes": 27.9
        }
      },
      "fs64": {
        "355cc": {
          "topSpeed": 24.56,
          "minutes": 37.2
        },
        "237cc": {
          "topSpeed": 24.57,
          "minutes": 25.3
        }
      },
      "electric": {
        "5s5000": {
          "topSpeed": 27.35,
          "minutes": 99
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
      },
      {
        "id": "11x7",
        "name": "parts.prop.11x7",
        "apc": "11x7",
        "propIn": 11,
        "pitchIn": 7,
        "blades": 2,
        "massKg": 0.03997282760625,
        "source": [
          "https://www.apcprop.com/product/11x7/",
          "https://www.apcprop.com/files/PER3_11x7.dat"
        ]
      }
    ],
    "anchors": {
      "prop": [
        0.441,
        0,
        -0.013
      ],
      "belly": [
        0,
        0,
        -0.159
      ],
      "tail": [
        -0.93,
        0,
        -0.13
      ],
      "tank": [
        -0.01,
        0,
        -0.08
      ],
      "led": [
        [
          0.075,
          0.3,
          0.093
        ],
        [
          0.075,
          0.89,
          0.139
        ]
      ]
    }
  },
  "livery": {
    "regions": [
      {
        "id": "wing",
        "stock": "#ffdb1a",
        "film": true
      },
      {
        "id": "wing_trim",
        "stock": "#d61214",
        "film": true,
        "finish": false
      },
      {
        "id": "fuselage",
        "stock": "#d61214",
        "film": true
      },
      {
        "id": "fuse_trim",
        "stock": "#ffdb1a",
        "film": true,
        "finish": false
      }
    ],
    "schemes": [
      {
        "id": "stock",
        "source": null,
        "colours": {}
      },
      {
        "id": "sig_kit",
        "source": {
          "label": "SIG Kadet Senior kit RC-58",
          "url": "https://sigmfg.com/products/kadet-senior-kit"
        },
        "colours": {
          "wing": "#b21527",
          "wing_trim": "#0e1213",
          "fuselage": "#b21527",
          "fuse_trim": "#0e1213"
        }
      },
      {
        "id": "sport_red",
        "source": {
          "label": "SIG Kadet Senior Sport ARF",
          "url": "https://sigmfg.com/products/sig-kadet-senior-sport-arf"
        },
        "colours": {
          "wing": "#f2f2f2",
          "wing_trim": "#b21527",
          "fuselage": "#b21527",
          "fuse_trim": "#f2f2f2"
        }
      },
      {
        "id": "sport_blue",
        "source": {
          "label": "SIG Kadet Senior Sport ARF",
          "url": "https://sigmfg.com/products/sig-kadet-senior-sport-arf"
        },
        "colours": {
          "wing": "#f2f2f2",
          "wing_trim": "#335a9a",
          "fuselage": "#335a9a",
          "fuse_trim": "#f2f2f2"
        }
      }
    ]
  },
  "tunes": [
    {
      "id": "kadet-manual",
      "airframe": "kadet1981",
      "name": "Manual",
      "note": "No flight controller. The roll and yaw sticks both work the rudder, which also steers the nose wheel, and the pitch stick the elevator. Let go and the dihedral levels the wings. Throttle closed, the four stroke idles."
    },
    {
      "id": "kadet-as3x",
      "airframe": "kadet1981",
      "name": "AS3X",
      "note": "A Spektrum AS3X receiver fitted in place of a plain one: the sticks are the elevator and the rudder; in pitch and yaw, centred, the gyro holds the attitude you left it in, against the gusts; held, it turns at the rate you ask; past 40 percent stick it lets go, so full stick is full throw. Nothing levels it and nothing caps a rate.",
      "wingStab": 3
    },
    {
      "id": "kadet-stab",
      "airframe": "kadet1981",
      "name": "Stabilised",
      "note": "A gyro holds the plane once it is off the ground. Roll stick asks for a bank up to 45 degrees, flown on the rudder, pitch stick for a pitch up to 20, and centred sticks fly level. Throttle closed, it lowers the nose onto its glide.",
      "wingStab": 1
    }
  ],
  "progress": {
    "level": 2
  },
  "strings": {
    "en": {
      "carousel.note.kadet1981": "The classic balsa trainer in see through film, on a four stroke. Hands off, it levels itself.",
      "power.kadet.electric": "SIG's electric: Himax 5018 530 kV, 5S 5000",
      "power.kadet.fs64": "O.S. FS-64V four stroke, 13 x 6",
      "power.kadet.fsa56": "O.S. FSa-56II four stroke, 12 x 6",
      "power.kadet.stock": "O.S. FS-52S four stroke, 12 x 6 (stock)",
      "airframe.blurb.kadet1981": "A 78 in SIG Kadet Senior, the classic balsa trainer in transparent yellow and red film, on an O.S. FS-52 four stroke: rudder, elevator and throttle, no ailerons, and a nose wheel that steers. The roll stick works the rudder and it levels itself when you let go. Fly it against the sun to see its ribs.",
      "livery.scheme.kadet1981.stock": "Yellow and red film",
      "livery.scheme.kadet1981.sig_kit": "SIG kit, red and black",
      "livery.scheme.kadet1981.sport_red": "Senior Sport, red",
      "livery.scheme.kadet1981.sport_blue": "Senior Sport, blue"
    },
    "es": {
      "carousel.note.kadet1981": "El entrenador clásico de balsa con entelado translúcido y motor de cuatro tiempos. Suelta los mandos y se nivela solo.",
      "power.kadet.electric": "El eléctrico de SIG: Himax 5018 530 kV, 5S 5000",
      "power.kadet.fs64": "O.S. FS-64V de cuatro tiempos, 13 x 6",
      "power.kadet.fsa56": "O.S. FSa-56II de cuatro tiempos, 12 x 6",
      "power.kadet.stock": "O.S. FS-52S de cuatro tiempos, 12 x 6 (de serie)",
      "airframe.blurb.kadet1981": "Un SIG Kadet Senior de 78 pulgadas, el clásico entrenador de balsa con film amarillo y rojo transparente, con un cuatro tiempos O.S. FS-52: timón de dirección, profundidad y acelerador, sin alerones, y una rueda de nariz que dirige. El stick de alabeo mueve el timón y se nivela solo cuando lo sueltas. Vuélalo contra el sol para ver sus costillas.",
      "livery.scheme.kadet1981.stock": "Film amarillo y rojo",
      "livery.scheme.kadet1981.sig_kit": "Kit de SIG, rojo y negro",
      "livery.scheme.kadet1981.sport_red": "Senior Sport, rojo",
      "livery.scheme.kadet1981.sport_blue": "Senior Sport, azul"
    }
  }
};
