/*
 * aircraft/interceptor/aircraft.js: the Interceptor as data, one
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
  "id": "interceptor",
  "airframe": {
    "id": "interceptor",
    "simId": 26,
    "name": "Interceptor",
    "short": "Interceptor",
    "blurb": "An 880 gram stretched X 7 inch speed build on a 6S LiPo and 9 inch pitch two blades: the fastest quad here, built to run a strike drone down and ram it. Half a minute of full throttle in the pack.",
    "facts": [
      "6S LiPo",
      "312 mm",
      "201 km/h"
    ],
    "sizeMm": 312,
    "grams": 880,
    "trackClass": "full",
    "class": "multirotor",
    "roles": [
      "race",
      "combat",
      "interceptor"
    ],
    "topSpeed": 55.9,
    "thrustToWeight": 8.33,
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
    "defaultTune": "betaflight-interceptor",
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
    "cameraFov": 95,
    "cameraAngle": 45,
    "dims": {
      "arm": 0.1562,
      "propR": 0.0889,
      "hullR": 0.0889,
      "vHalfDown": 0.075,
      "vHalfUp": 0.057,
      "bodyLength": 0.16,
      "bodyWidth": 0.06,
      "bodyHeight": 0.045
    },
    "combat": {
      "frame": "interceptor",
      "payloads": [
        {
          "id": "proximity",
          "warhead": "standard",
          "massKg": 0.2,
          "dragArea_m2": 0.004506,
          "cgOffset_m": [
            0.0184,
            0,
            -0.0523
          ],
          "dims": {
            "d": 0.045,
            "len": 0.16
          }
        }
      ],
      "accessories": [
        {
          "id": "lrantenna",
          "massKg": 0.02,
          "cgOffset_m": [
            -0.0766,
            0,
            0.0602
          ]
        },
        {
          "id": "gps",
          "massKg": 0.015,
          "cgOffset_m": [
            -0.0666,
            0,
            0.0532
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
        "id": "armour",
        "stock": "#2a2b2b"
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
        "id": "legs",
        "stock": "#18191b"
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
          "armour": "#b9bdc0",
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
          "armour": "#1a1a1a",
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
          "armour": "#5a5434",
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
          "armour": "#c2a882",
          "payload": "#c2a882",
          "legs": "#c2a882"
        }
      },
      {
        "id": "two_tone",
        "source": null,
        "colours": {
          "frame": "#c2a882",
          "armour": "#c2a882",
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
          "armour": "#eef0f1",
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
          "armour": "#e73f0e",
          "legs": "#e73f0e",
          "payload": "#e73f0e"
        }
      }
    ]
  },
  "tunes": [
    {
      "id": "betaflight-interceptor",
      "airframe": "interceptor",
      "name": "Factory default",
      "note": "Factory 4.5.1 on the interceptor: 1500 kV, an 1800 mAh LiPo."
    }
  ],
  "progress": {
    "level": null
  },
  "strings": {
    "en": {
      "carousel.note.interceptor": "The fastest quad here: a stretched 7 inch speed build that runs a strike drone down and rams it.",
      "airframe.blurb.interceptor": "An 880 gram stretched X 7 inch speed build on a 6S LiPo and 9 inch pitch two blades: the fastest quad here, built to run a strike drone down and ram it. Half a minute of full throttle in the pack.",
      "motors.interceptor.stock": "Stock motors",
      "motors.interceptor.v2808_1500": "Hotter wind, V2808 1500 kV",
      "motors.interceptor.xing2_2809_1600": "Burst, 2809 1600 kV, runs hot",
      "props.interceptor.stock": "Stock props",
      "livery.scheme.interceptor.stock": "Factory carbon",
      "livery.scheme.interceptor.grey": "Light grey",
      "livery.scheme.interceptor.black": "Black",
      "livery.scheme.interceptor.olive": "Olive drab",
      "livery.scheme.interceptor.tan": "Desert tan",
      "livery.scheme.interceptor.two_tone": "Two tone, olive and tan",
      "livery.scheme.interceptor.arctic": "Arctic white",
      "livery.scheme.interceptor.test": "Test flight orange and white"
    },
    "es": {
      "carousel.note.interceptor": "El quad más rápido: un 7 pulgadas estirado de velocidad que alcanza a un dron de ataque y lo embiste.",
      "airframe.blurb.interceptor": "Un dron de velocidad de 7 pulgadas en X alargada y 880 gramos, con LiPo 6S y hélices bipala de 9 de paso: el dron más rápido de aquí, hecho para alcanzar un dron de ataque y embestirlo. Medio minuto de throttle a fondo en la batería.",
      "motors.interceptor.stock": "Motores de serie",
      "motors.interceptor.v2808_1500": "Bobinado más caliente, V2808 1500 kV",
      "motors.interceptor.xing2_2809_1600": "Ráfaga, 2809 1600 kV, se calienta",
      "props.interceptor.stock": "Hélices de serie",
      "livery.scheme.interceptor.stock": "Carbono de fábrica",
      "livery.scheme.interceptor.grey": "Gris claro",
      "livery.scheme.interceptor.black": "Negro",
      "livery.scheme.interceptor.olive": "Verde oliva",
      "livery.scheme.interceptor.tan": "Arena del desierto",
      "livery.scheme.interceptor.two_tone": "Dos tonos, oliva y arena",
      "livery.scheme.interceptor.arctic": "Blanco ártico",
      "livery.scheme.interceptor.test": "Naranja y blanco de pruebas"
    }
  }
};
