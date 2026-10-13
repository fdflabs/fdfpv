/*
 * aircraft/striker2500/aircraft.js: the Striker as data, one aircraft's
 * rows for configs/aircraft.js to assemble (docs/AIRCRAFT-FOLDER.md).
 * Plain JSON after `export default`, which
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
  "id": "striker2500",
  "airframe": {
    "id": "striker2500",
    "simId": 27,
    "fixedWing": true,
    "stall": 13.53,
    "topSpeed": 34.2,
    "catapult": {
      "speed": 19,
      "pitchDeg": 15,
      "railLength": 3,
      "height": 1.2
    },
    "voice": "glow2",
    "name": "Striker",
    "short": "Striker",
    "blurb": "The raid's own pusher delta, 2.5 m across, on a 110 cc boxer twin or a small turbojet, with a warhead in its nose. Shoot it off the rail, fly it fast and level, put it into the target. It is stable and heavy, not aerobatic, and the jet takes seconds to spool.",
    "facts": [
      "Pusher delta",
      "2500 mm",
      "Warhead"
    ],
    "sizeMm": 2500,
    "grams": 13824.9,
    "thrustToWeight": 2.09,
    "trackClass": "wing",
    "class": "wing",
    "roles": [
      "combat"
    ],
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
    "defaultTune": "striker-stab",
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
      "propR": 0.381,
      "hullR": 1.5733,
      "vHalfDown": 0.2514,
      "vHalfUp": 0.4006,
      "bodyLength": 2.67,
      "bodyWidth": 2.502,
      "bodyHeight": 0.652
    },
    "combat": {
      "frame": "striker",
      "propulsion": [
        {
          "id": "prop",
          "simId": 27,
          "grams": 13824.9,
          "thrustToWeight": 2.09,
          "stall": 13.53,
          "topSpeed": 34.2,
          "voice": "glow2",
          "cgDz_m": 0,
          "drawing_m": [
            0.146,
            0,
            0.0196
          ]
        },
        {
          "id": "jet",
          "simId": 28,
          "grams": 13492,
          "thrustToWeight": 1.06,
          "stall": 14.07,
          "topSpeed": 66.3,
          "voice": "edf",
          "cgDz_m": 0.0097,
          "drawing_m": [
            0.146,
            0,
            0.0099
          ]
        }
      ],
      "payloads": [
        {
          "id": "standard",
          "warhead": "standard",
          "massKg": 1.5,
          "dragArea_m2": 0,
          "cgOffset_m": [
            1.196,
            0,
            0.0196
          ],
          "dims": {
            "d": 0.26,
            "len": 0.3
          }
        },
        {
          "id": "wide",
          "warhead": "wide",
          "massKg": 2.2,
          "dragArea_m2": 0,
          "cgOffset_m": [
            1.186,
            0,
            0.0196
          ],
          "dims": {
            "d": 0.28,
            "len": 0.28
          }
        },
        {
          "id": "penetrator",
          "warhead": "penetrator",
          "massKg": 1.8,
          "dragArea_m2": 0,
          "cgOffset_m": [
            1.246,
            0,
            0.0196
          ],
          "dims": {
            "d": 0.16,
            "len": 0.4
          }
        },
        {
          "id": "emp",
          "warhead": "emp",
          "massKg": 1.1,
          "dragArea_m2": 0,
          "cgOffset_m": [
            1.156,
            0,
            0.0196
          ],
          "dims": {
            "d": 0.26,
            "len": 0.22
          }
        }
      ],
      "accessories": [
        {
          "id": "whip",
          "massKg": 0.06,
          "cgOffset_m": [
            0.446,
            0,
            0.2196
          ]
        }
      ],
      "ballast": {
        "at_m": [
          1.426,
          0,
          0.0196
        ]
      }
    }
  },
  "kit": {
    "slots": [
      {
        "id": "nose",
        "options": [
          "stock",
          "dome"
        ]
      },
      {
        "id": "fins",
        "options": [
          "stock",
          "swept"
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
        "id": "fuselage",
        "stock": "#a6b6c6"
      },
      {
        "id": "wing",
        "stock": "#a6b6c6"
      },
      {
        "id": "fins",
        "stock": "#a6b6c6"
      },
      {
        "id": "nose_cap",
        "stock": "#b8c6d4"
      },
      {
        "id": "nose_band",
        "stock": "#26282a"
      },
      {
        "id": "engine",
        "stock": "#9aa0a6"
      }
    ],
    "schemes": [
      {
        "id": "stock",
        "source": null,
        "colours": {}
      },
      {
        "id": "black",
        "source": null,
        "colours": {
          "fuselage": "#1a1a1a",
          "wing": "#1a1a1a",
          "fins": "#1a1a1a",
          "nose_cap": "#1a1a1a",
          "nose_band": "#5a5d62",
          "engine": "#2e3034"
        }
      },
      {
        "id": "olive",
        "source": null,
        "colours": {
          "fuselage": "#5a5434",
          "wing": "#5a5434",
          "fins": "#5a5434",
          "nose_cap": "#5a5434"
        }
      },
      {
        "id": "tan",
        "source": null,
        "colours": {
          "fuselage": "#c2a882",
          "wing": "#c2a882",
          "fins": "#c2a882",
          "nose_cap": "#c2a882"
        }
      },
      {
        "id": "two_tone",
        "source": null,
        "colours": {
          "fuselage": "#c2a882",
          "nose_cap": "#c2a882",
          "wing": "#5a5434",
          "fins": "#5a5434"
        }
      },
      {
        "id": "arctic",
        "source": null,
        "colours": {
          "fuselage": "#eef0f1",
          "wing": "#eef0f1",
          "nose_cap": "#eef0f1",
          "fins": "#c9ced2",
          "nose_band": "#3b3f44"
        }
      },
      {
        "id": "test",
        "source": null,
        "colours": {
          "fuselage": "#f2f2f2",
          "wing": "#f2f2f2",
          "fins": "#e73f0e",
          "nose_cap": "#e73f0e",
          "nose_band": "#0e1213"
        }
      }
    ]
  },
  "tunes": [
    {
      "id": "striker-stab",
      "airframe": "striker2500",
      "name": "Stabilised",
      "note": "A gyro holds the delta. Roll stick asks for a bank up to 45 degrees, pitch stick for a pitch up to 20, and centred sticks fly level. The yaw stick is the fins' small rudders.",
      "wingStab": 1
    },
    {
      "id": "striker-manual",
      "airframe": "striker2500",
      "name": "Manual",
      "note": "No flight controller. The sticks are the elevons and the fins' rudders. A warhead in the nose makes it nose heavy and wants up elevon; without one it is light in pitch."
    }
  ],
  "progress": {
    "level": null
  },
  "strings": {
    "en": {
      "carousel.note.striker2500": "The raid's own pusher delta, on a piston engine or a turbojet, a warhead in its nose. Off the rail, fast and level, into the target.",
      "airframe.blurb.striker2500": "The raid's own pusher delta, 2.5 m across, on a 110 cc boxer twin or a small turbojet, with a warhead in its nose. Shoot it off the rail, fly it fast and level, put it into the target. It is stable and heavy, not aerobatic, and the jet takes seconds to spool.",
      "livery.scheme.striker2500.stock": "Factory light grey",
      "livery.scheme.striker2500.black": "Black",
      "livery.scheme.striker2500.olive": "Olive drab",
      "livery.scheme.striker2500.tan": "Desert tan",
      "livery.scheme.striker2500.two_tone": "Two tone, olive and tan",
      "livery.scheme.striker2500.arctic": "Arctic white",
      "livery.scheme.striker2500.test": "Test flight orange and white"
    },
    "es": {
      "carousel.note.striker2500": "El delta de empuje de la incursión, con motor de pistón o turborreactor y una ojiva en el morro. Sale del riel, rápido y nivelado, directo al blanco.",
      "airframe.blurb.striker2500": "El delta propulsor propio de la incursión, de 2,5 m de envergadura, con un bóxer bicilíndrico de 110 cc o un pequeño turborreactor, y una ojiva en la nariz. Dispáralo desde el riel, vuélalo rápido y nivelado, mételo en el blanco. Es estable y pesado, no acrobático, y el reactor tarda segundos en acelerar.",
      "livery.scheme.striker2500.stock": "Gris claro de fábrica",
      "livery.scheme.striker2500.black": "Negro",
      "livery.scheme.striker2500.olive": "Verde oliva",
      "livery.scheme.striker2500.tan": "Arena del desierto",
      "livery.scheme.striker2500.two_tone": "Dos tonos, oliva y arena",
      "livery.scheme.striker2500.arctic": "Blanco ártico",
      "livery.scheme.striker2500.test": "Naranja y blanco de pruebas"
    }
  }
};
