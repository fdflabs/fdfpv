/*
 * aircraft/zagi1219/aircraft.js: the Zagi HP as data, one aircraft's rows
 * for configs/aircraft.js to assemble (docs/AIRCRAFT-FOLDER.md). Plain
 * JSON after `export default`, which scripts/aircraft-folder-selftest.js
 * holds: no expression, no import.
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
  "id": "zagi1219",
  "airframe": {
    "id": "zagi1219",
    "simId": 17,
    "fixedWing": true,
    "stall": 7.36,
    "topSpeed": 36.8,
    "name": "Zagi HP",
    "short": "Zagi",
    "blurb": "A 48 in Zagi HP on 3S, the EPP flying wing that taught a generation to fly on the slope and in combat. Throw it hard, and go easy on the elevons: it rolls fast and it answers the smallest touch in pitch. No rudder. It glides a long way and slides in on its belly.",
    "facts": [
      "3S",
      "1219 mm",
      "Flying wing"
    ],
    "sizeMm": 1219,
    "grams": 722.9,
    "trackClass": "wing",
    "cells": 3,
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
    "defaultTune": "zagi-manual",
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
      "propR": 0.0635,
      "hullR": 0.6657,
      "vHalfDown": 0.012,
      "vHalfUp": 0.1267,
      "bodyLength": 0.4707,
      "bodyWidth": 1.2192,
      "bodyHeight": 0.1387
    }
  },
  "kit": {
    "slots": [
      {
        "id": "winglets",
        "options": [
          "stock",
          "raked",
          "split"
        ]
      },
      {
        "id": "nose",
        "options": [
          "stock",
          "bubble"
        ]
      }
    ],
    "drawn": true
  },
  "tuning": {
    "chord": 0.21335338,
    "area": 0.26012851,
    "margin": 0.099,
    "cg": {
      "mm": 203.2,
      "datum": "tuning.datum.root_le",
      "range": null,
      "source": "Zagi HP manual, \"designed to balance at 8\" measured back from the nose\", the \"suggested starting point\", moved back in 1/8 in steps \"until it is almost unflyable (too elevator sensitive)\", no range; https://web.archive.org/web/20151216152823/http://www.zagi.com/pdf/Zagi-HP-w.pdf"
    },
    "packKg": 0.185,
    "nose": 0.19,
    "tail": -0.1,
    "elevons": true,
    "throws": {
      "high": [
        14.4775,
        14.4775,
        0
      ],
      "low": [
        10.1,
        10.1,
        0
      ],
      "source": "Zagi manuals: the elevon throw \"3/8\" in each direction measured 1\" from the tip\" on either stick, one set, on the 1.5 in elevon (docs/ZAGI-STAGE1.md); low: 70 percent of high, the low rate the Timber, Radian and Radian Pro manuals state; https://web.archive.org/web/20151216152823/http://www.zagi.com/pdf/Zagi-HP-w.pdf"
    },
    "flaps": null
  },
  "power": {
    "table": {
      "simId": 17,
      "massKg": 0.7229,
      "cells": 3,
      "rCell": 0.008,
      "propIn": 5,
      "cruiseMs": 10.3,
      "flightTime": null
    },
    "options": [
      {
        "id": "stock",
        "name": "power.zagi.stock",
        "kind": "electric",
        "voice": "wing",
        "kv": 3100,
        "propIn": 5,
        "pitchIn": 5,
        "blades": 2,
        "thrustN": 7.295,
        "currentA": 30,
        "rpmNoLoad": 25882,
        "pitchSpeedMs": 46.567,
        "lvcV": 3,
        "massKg": 0.7229,
        "cgShiftM": 0,
        "packs": [
          {
            "id": "3s1300",
            "cells": 3,
            "mAh": 1300,
            "massKg": 0.113,
            "source": "https://chinahobbyline.com/products/cnhl-black-series-1300mah-11-1v-3s-130c-lipo-battery-with-xt60-plug"
          },
          {
            "id": "3s1500",
            "cells": 3,
            "mAh": 1500,
            "massKg": 0.125,
            "source": "https://chinahobbyline.com/products/cnhl-black-series-v2-0-1500mah-11-1v-3s-130c-lipo-battery-with-xt60-plug"
          },
          {
            "id": "3s2200",
            "cells": 3,
            "mAh": 2200,
            "massKg": 0.18,
            "source": "https://chinahobbyline.com/products/cnhl-black-series-2200mah-3s-11-1v-30c-lipo-battery-with-ec3-plug"
          }
        ],
        "pack": "3s2200",
        "source": [
          "https://web.archive.org/web/2019/https://zagi.com/product/brushless-motor/",
          "https://web.archive.org/web/2019/https://zagi.com/product/battery-for-hp-and-hp60/",
          "https://web.archive.org/web/20151216152823/http://www.zagi.com/pdf/Zagi-HP-w.pdf"
        ]
      }
    ],
    "estimates": {
      "stock": {
        "3s1300": {
          "topSpeed": 34.93,
          "minutes": 64.4
        },
        "3s1500": {
          "topSpeed": 35.19,
          "minutes": 72.3
        },
        "3s2200": {
          "topSpeed": 35.76,
          "minutes": 94.3
        }
      }
    }
  },
  "hangar": {
    "props": [
      {
        "id": "stock",
        "name": "parts.prop.stock"
      }
    ],
    "anchors": {
      "prop": [
        -0.11,
        0,
        0.052
      ],
      "belly": [
        0,
        0,
        -0.012
      ],
      "tail": [
        -0.1,
        0,
        -0.005
      ],
      "tank": [
        -0.01,
        0,
        0
      ],
      "led": [
        [
          0.14,
          0.1,
          -0.004
        ],
        [
          -0.105,
          0.58,
          -0.002
        ]
      ]
    }
  },
  "livery": {
    "regions": [
      {
        "id": "wing",
        "stock": "#f0561e"
      },
      {
        "id": "trim",
        "stock": "#f0561e"
      },
      {
        "id": "winglets",
        "stock": "#17191b"
      },
      {
        "id": "canopy",
        "stock": "#34383c"
      }
    ],
    "schemes": [
      {
        "id": "stock",
        "source": {
          "label": "Zagi, Zagi HP product photograph",
          "url": "https://web.archive.org/web/2019/https://zagi.com/product/hp/"
        },
        "colours": {}
      },
      {
        "id": "combat",
        "source": {
          "label": "Zagi, Zagi 5C product photograph",
          "url": "https://web.archive.org/web/2017/https://zagi.com/category/kits/"
        },
        "colours": {
          "wing": "#f0db2c",
          "trim": "#17191b"
        }
      }
    ]
  },
  "tunes": [
    {
      "id": "zagi-manual",
      "airframe": "zagi1219",
      "name": "Manual",
      "note": "No flight controller. The sticks are the elevons, 14.5 degrees each way on both: it rolls fast, and a small touch of up is a lot, so be gentle in pitch. No rudder: it turns on the bank alone."
    },
    {
      "id": "zagi-as3x",
      "airframe": "zagi1219",
      "name": "AS3X",
      "note": "A Spektrum AS3X receiver fitted in place of a plain one: the sticks are the elevons; in roll and pitch, centred, the gyro holds the attitude you left it in, against the gusts; held, it turns at the rate you ask; past 40 percent stick it lets go, so full stick is full throw. Nothing levels it and nothing caps a rate. No rudder.",
      "wingStab": 3
    },
    {
      "id": "zagi-stab",
      "airframe": "zagi1219",
      "name": "Stabilised",
      "note": "A gyro holds the wing. Roll stick asks for a bank up to 60 degrees, pitch stick for a pitch up to 30, and centred sticks fly level. It has no rudder: the yaw stick does nothing.",
      "wingStab": 1
    }
  ],
  "progress": {
    "level": 4
  },
  "strings": {
    "en": {
      "carousel.note.zagi1219": "The EPP flying wing of the slopes and combat. Throw it, roll it fast, touch the pitch gently, slide it in on its belly.",
      "power.zagi.stock": "Zagi 3100 kV inrunner, 5 x 5 carbon pusher, 3S (stock)",
      "airframe.blurb.zagi1219": "A 48 in Zagi HP on 3S, the EPP flying wing that taught a generation to fly on the slope and in combat. Throw it hard, and go easy on the elevons: it rolls fast and it answers the smallest touch in pitch. No rudder. It glides a long way and slides in on its belly.",
      "livery.scheme.zagi1219.stock": "Zagi HP orange",
      "livery.scheme.zagi1219.combat": "5C combat yellow and black"
    },
    "es": {
      "carousel.note.zagi1219": "El ala volante de EPP de las laderas y el combate. Lánzala, gírala rápido, toca el cabeceo con suavidad y aterrízala de panza.",
      "power.zagi.stock": "Zagi inrunner 3100 kV, hélice propulsora de carbono 5 x 5, 3S (de serie)",
      "airframe.blurb.zagi1219": "Un Zagi HP de 48 pulgadas en 3S, el ala volante de EPP que enseñó a volar a una generación en la ladera y en combate. Lánzalo fuerte y ve suave con los elevones: alabea rápido y responde al toque más pequeño en cabeceo. Sin timón. Planea lejos y se desliza sobre la panza.",
      "livery.scheme.zagi1219.stock": "Zagi HP naranja",
      "livery.scheme.zagi1219.combat": "5C de combate amarillo y negro"
    }
  }
};
