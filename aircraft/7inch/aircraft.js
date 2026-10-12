/*
 * aircraft/7inch/aircraft.js: the Seven inch as data, one aircraft's rows
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
  "id": "7inch",
  "airframe": {
    "id": "7inch",
    "simId": 24,
    "name": "Seven inch",
    "short": "7 inch",
    "blurb": "A 979 gram 7 inch long range quad on a 6S Li-ion pack, built to carry a payload slung under its belly. The heavier the payload, the more of the stick it takes to hold it up.",
    "facts": [
      "6S Li-ion",
      "315 mm",
      "Payload"
    ],
    "sizeMm": 315,
    "grams": 979,
    "trackClass": "full",
    "topSpeed": 33.4,
    "thrustToWeight": 4.75,
    "cells": 6,
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
    "defaultTune": "betaflight-7inch",
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
    "cameraFov": 90,
    "cameraAngle": 25,
    "dims": {
      "arm": 0.1575,
      "propR": 0.0889,
      "hullR": 0.0889,
      "vHalfDown": 0.109,
      "vHalfUp": 0.085,
      "bodyLength": 0.2,
      "bodyWidth": 0.1,
      "bodyHeight": 0.045
    },
    "combat": {
      "frame": "7in",
      "payloads": [
        {
          "id": "standard",
          "warhead": "standard",
          "massKg": 0.5,
          "dragArea_m2": 0.00969,
          "cgOffset_m": [
            0.0233,
            0,
            -0.0637
          ],
          "dims": {
            "d": 0.06,
            "len": 0.26
          }
        },
        {
          "id": "wide",
          "warhead": "wide",
          "massKg": 0.75,
          "dragArea_m2": 0.01132,
          "cgOffset_m": [
            0.0133,
            0,
            -0.0712
          ],
          "dims": {
            "d": 0.075,
            "len": 0.24
          }
        },
        {
          "id": "penetrator",
          "warhead": "penetrator",
          "massKg": 0.55,
          "dragArea_m2": 0.009829,
          "cgOffset_m": [
            0.0433,
            0,
            -0.0587
          ],
          "dims": {
            "d": 0.05,
            "len": 0.32
          }
        },
        {
          "id": "emp",
          "warhead": "emp",
          "massKg": 0.4,
          "dragArea_m2": 0.007407,
          "cgOffset_m": [
            0.0033,
            0,
            -0.0662
          ],
          "dims": {
            "d": 0.065,
            "len": 0.18
          }
        }
      ],
      "accessories": [
        {
          "id": "pack2",
          "massKg": 0.429,
          "cgOffset_m": [
            -0.0017,
            0,
            0.0633
          ]
        },
        {
          "id": "cage",
          "massKg": 0.03,
          "cgOffset_m": [
            0.0833,
            0,
            -0.0167
          ]
        },
        {
          "id": "lrantenna",
          "massKg": 0.025,
          "cgOffset_m": [
            -0.0717,
            0,
            0.0613
          ]
        },
        {
          "id": "gps",
          "massKg": 0.015,
          "cgOffset_m": [
            -0.0567,
            0,
            0.0313
          ]
        }
      ]
    }
  },
  "kit": {
    "slots": [
      {
        "id": "arms",
        "options": [
          "stock",
          "cutout",
          "blade",
          "tapered"
        ]
      },
      {
        "id": "top",
        "options": [
          "stock",
          "vented",
          "armoured"
        ]
      },
      {
        "id": "mount",
        "options": [
          "stock",
          "cage",
          "plates"
        ]
      },
      {
        "id": "antenna",
        "options": [
          "stock",
          "dualt",
          "pagoda"
        ]
      }
    ],
    "drawn": true
  },
  "tuning": null,
  "power": {
    "table": null,
    "options": null,
    "estimates": null
  },
  "hangar": {
    "props": null,
    "anchors": null
  },
  "livery": {
    "regions": [
      {
        "id": "frame",
        "stock": "#1b1d1f"
      },
      {
        "id": "arms",
        "stock": "#1b1d1f"
      },
      {
        "id": "top",
        "stock": "#1b1d1f"
      },
      {
        "id": "tape",
        "stock": "#5d6038"
      },
      {
        "id": "pack",
        "stock": "#18191b"
      },
      {
        "id": "payload",
        "stock": "#4d5130"
      },
      {
        "id": "cage",
        "stock": "#3a3f2a"
      },
      {
        "id": "legs",
        "stock": "#18191b"
      },
      {
        "id": "props",
        "stock": "#232527"
      }
    ],
    "schemes": [
      {
        "id": "stock",
        "source": null,
        "colours": {}
      },
      {
        "id": "grey",
        "source": null,
        "colours": {
          "frame": "#b9bdc0",
          "arms": "#b9bdc0",
          "top": "#b9bdc0",
          "legs": "#55595e"
        }
      },
      {
        "id": "black",
        "source": null,
        "colours": {
          "frame": "#1a1a1a",
          "arms": "#1a1a1a",
          "top": "#1a1a1a",
          "payload": "#1a1a1a",
          "legs": "#1a1a1a"
        }
      },
      {
        "id": "olive",
        "source": null,
        "colours": {
          "frame": "#5a5434",
          "arms": "#5a5434",
          "top": "#5a5434",
          "payload": "#5a5434",
          "legs": "#5a5434"
        }
      },
      {
        "id": "tan",
        "source": null,
        "colours": {
          "frame": "#c2a882",
          "arms": "#c2a882",
          "top": "#c2a882",
          "payload": "#c2a882",
          "legs": "#c2a882",
          "tape": "#5a5434"
        }
      },
      {
        "id": "two_tone",
        "source": null,
        "colours": {
          "frame": "#c2a882",
          "legs": "#c2a882",
          "arms": "#5a5434",
          "top": "#5a5434",
          "payload": "#5a5434"
        }
      },
      {
        "id": "arctic",
        "source": null,
        "colours": {
          "frame": "#eef0f1",
          "arms": "#eef0f1",
          "top": "#eef0f1",
          "legs": "#eef0f1",
          "payload": "#c9ced2"
        }
      },
      {
        "id": "test",
        "source": null,
        "colours": {
          "frame": "#f2f2f2",
          "arms": "#f2f2f2",
          "top": "#e73f0e",
          "legs": "#e73f0e",
          "payload": "#e73f0e"
        }
      }
    ]
  },
  "tunes": [
    {
      "id": "betaflight-7inch",
      "airframe": "7inch",
      "name": "Factory default",
      "note": "Factory 4.5.1 on the 7 inch: 1300 kV, a 4200 mAh Li-ion pack."
    }
  ],
  "progress": {
    "level": null
  },
  "strings": {
    "en": {
      "carousel.note.7inch": "A long range quad on a Li-ion pack, built to carry a payload under its belly.",
      "airframe.blurb.7inch": "A 979 gram 7 inch long range quad on a 6S Li-ion pack, built to carry a payload slung under its belly. The heavier the payload, the more of the stick it takes to hold it up.",
      "motors.7inch.stock": "Stock motors",
      "motors.7inch.se2808_1350": "Bigger stator, 2808",
      "motors.7inch.v2808_1500": "Bigger and hotter, 2808 1500 kV",
      "props.7inch.stock": "Stock props",
      "livery.scheme.7inch.stock": "Factory carbon",
      "livery.scheme.7inch.grey": "Light grey",
      "livery.scheme.7inch.black": "Black",
      "livery.scheme.7inch.olive": "Olive drab",
      "livery.scheme.7inch.tan": "Desert tan",
      "livery.scheme.7inch.two_tone": "Two tone, olive and tan",
      "livery.scheme.7inch.arctic": "Arctic white",
      "livery.scheme.7inch.test": "Test flight orange and white"
    },
    "es": {
      "carousel.note.7inch": "Un quad de largo alcance con batería de iones de litio, hecho para llevar una carga bajo la panza.",
      "airframe.blurb.7inch": "Un dron de largo alcance de 7 pulgadas y 979 gramos con una batería Li-ion 6S, hecho para llevar una carga colgada bajo la panza. Cuanto más pesa la carga, más stick hace falta para sostenerlo.",
      "motors.7inch.stock": "Motores de serie",
      "motors.7inch.se2808_1350": "Estator más grande, 2808",
      "motors.7inch.v2808_1500": "Más grande y más caliente, 2808 1500 kV",
      "props.7inch.stock": "Hélices de serie",
      "livery.scheme.7inch.stock": "Carbono de fábrica",
      "livery.scheme.7inch.grey": "Gris claro",
      "livery.scheme.7inch.black": "Negro",
      "livery.scheme.7inch.olive": "Verde oliva",
      "livery.scheme.7inch.tan": "Arena del desierto",
      "livery.scheme.7inch.two_tone": "Dos tonos, oliva y arena",
      "livery.scheme.7inch.arctic": "Blanco ártico",
      "livery.scheme.7inch.test": "Naranja y blanco de pruebas"
    }
  }
};
