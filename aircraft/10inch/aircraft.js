/*
 * aircraft/10inch/aircraft.js: the Ten inch as data, one aircraft's rows
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
  "id": "10inch",
  "airframe": {
    "id": "10inch",
    "simId": 25,
    "name": "Ten inch",
    "short": "10 inch",
    "blurb": "A 1.8 kilo 10 inch heavy lifter on two 6S Li-ion packs, carrying more than twice the payload of the 7 inch. Slow to turn, slow to stop, and it hits like it.",
    "facts": [
      "6S2P Li-ion",
      "420 mm",
      "Heavy payload"
    ],
    "sizeMm": 420,
    "grams": 1848,
    "trackClass": "full",
    "class": "multirotor",
    "roles": [
      "combat"
    ],
    "topSpeed": 33.3,
    "thrustToWeight": 4.69,
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
    "defaultTune": "betaflight-10inch",
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
    "cameraAngle": 20,
    "dims": {
      "arm": 0.21,
      "propR": 0.127,
      "hullR": 0.127,
      "vHalfDown": 0.141,
      "vHalfUp": 0.055,
      "bodyLength": 0.24,
      "bodyWidth": 0.13,
      "bodyHeight": 0.05
    },
    "combat": {
      "frame": "10in",
      "payloads": [
        {
          "id": "standard",
          "warhead": "standard",
          "massKg": 1.2,
          "dragArea_m2": 0.01691,
          "cgOffset_m": [
            0.0284,
            0,
            -0.081
          ],
          "dims": {
            "d": 0.08,
            "len": 0.34
          }
        },
        {
          "id": "wide",
          "warhead": "wide",
          "massKg": 1.8,
          "dragArea_m2": 0.02012,
          "cgOffset_m": [
            0.0184,
            0,
            -0.091
          ],
          "dims": {
            "d": 0.1,
            "len": 0.32
          }
        },
        {
          "id": "penetrator",
          "warhead": "penetrator",
          "massKg": 1.3,
          "dragArea_m2": 0.01677,
          "cgOffset_m": [
            0.0534,
            0,
            -0.0735
          ],
          "dims": {
            "d": 0.065,
            "len": 0.42
          }
        },
        {
          "id": "emp",
          "warhead": "emp",
          "massKg": 1,
          "dragArea_m2": 0.0129,
          "cgOffset_m": [
            0.0034,
            0,
            -0.0835
          ],
          "dims": {
            "d": 0.085,
            "len": 0.24
          }
        }
      ],
      "accessories": [
        {
          "id": "cage",
          "massKg": 0.045,
          "cgOffset_m": [
            0.1034,
            0,
            -0.021
          ]
        },
        {
          "id": "lrantenna",
          "massKg": 0.035,
          "cgOffset_m": [
            -0.0866,
            0,
            0.075
          ]
        },
        {
          "id": "gps",
          "massKg": 0.02,
          "cgOffset_m": [
            -0.0666,
            0,
            0.045
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
      "id": "betaflight-10inch",
      "airframe": "10inch",
      "name": "Factory default",
      "note": "Factory 4.5.1 on the 10 inch: 900 kV, an 8400 mAh Li-ion pack."
    }
  ],
  "progress": {
    "level": null
  },
  "strings": {
    "en": {
      "carousel.note.10inch": "A heavy lifter on two Li-ion packs, built to carry a big payload a long way.",
      "airframe.blurb.10inch": "A 1.8 kilo 10 inch heavy lifter on two 6S Li-ion packs, carrying more than twice the payload of the 7 inch. Slow to turn, slow to stop, and it hits like it.",
      "motors.10inch.stock": "Stock motors",
      "motors.10inch.v3115_900": "More copper, 3115 900 kV",
      "motors.10inch.tornado_3115_970": "Hotter wind, 3115 970 kV",
      "motors.10inch.v3115_1050": "Hottest, 3115 1050 kV",
      "props.10inch.stock": "Stock props",
      "livery.scheme.10inch.stock": "Factory carbon",
      "livery.scheme.10inch.grey": "Light grey",
      "livery.scheme.10inch.black": "Black",
      "livery.scheme.10inch.olive": "Olive drab",
      "livery.scheme.10inch.tan": "Desert tan",
      "livery.scheme.10inch.two_tone": "Two tone, olive and tan",
      "livery.scheme.10inch.arctic": "Arctic white",
      "livery.scheme.10inch.test": "Test flight orange and white"
    },
    "es": {
      "carousel.note.10inch": "Un carguero pesado con dos baterías de iones de litio, hecho para llevar una carga grande muy lejos.",
      "airframe.blurb.10inch": "Un cargador pesado de 10 pulgadas y 1,8 kilos con dos baterías Li-ion 6S, que lleva más del doble de carga que el de 7 pulgadas. Lento para girar, lento para frenar, y golpea en consecuencia.",
      "motors.10inch.stock": "Motores de serie",
      "motors.10inch.v3115_900": "Más cobre, 3115 900 kV",
      "motors.10inch.tornado_3115_970": "Bobinado más caliente, 3115 970 kV",
      "motors.10inch.v3115_1050": "El más caliente, 3115 1050 kV",
      "props.10inch.stock": "Hélices de serie",
      "livery.scheme.10inch.stock": "Carbono de fábrica",
      "livery.scheme.10inch.grey": "Gris claro",
      "livery.scheme.10inch.black": "Negro",
      "livery.scheme.10inch.olive": "Verde oliva",
      "livery.scheme.10inch.tan": "Arena del desierto",
      "livery.scheme.10inch.two_tone": "Dos tonos, oliva y arena",
      "livery.scheme.10inch.arctic": "Blanco ártico",
      "livery.scheme.10inch.test": "Naranja y blanco de pruebas"
    }
  }
};
