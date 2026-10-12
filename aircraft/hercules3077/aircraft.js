/*
 * aircraft/hercules3077/aircraft.js: the C-130 Hercules as data, one
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
  "id": "hercules3077",
  "airframe": {
    "id": "hercules3077",
    "simId": 31,
    "fixedWing": true,
    "ramp": true,
    "voice": "wing",
    "stall": 9.67,
    "topSpeed": 28.64,
    "gear": {
      "restHeight": 0.2604,
      "restPitchDeg": 0
    },
    "name": "C-130 Hercules",
    "short": "Hercules",
    "blurb": "A 3 m AeroTetris balsa C-130H on four electric motors, in USAF grey. Heavy and slow to answer: fly it on a long approach. Press O to open the ramp and P to drop a load under its parachute.",
    "facts": [
      "Four motors",
      "3077 mm",
      "6.7 kg"
    ],
    "sizeMm": 3077,
    "grams": 6728,
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
    "defaultTune": "hercules-manual",
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
    "cameraAngle": 0,
    "dims": {
      "arm": 0,
      "propR": 0.1524,
      "hullR": 1.557,
      "vHalfDown": 0.2604,
      "vHalfUp": 0.6194,
      "bodyLength": 2.25,
      "bodyWidth": 3.077,
      "bodyHeight": 0.8798
    }
  },
  "kit": {
    "slots": [
      {
        "id": "spinner",
        "options": [
          "stock",
          "twotone"
        ]
      },
      {
        "id": "canopy",
        "options": [
          "stock",
          "smoke"
        ]
      }
    ],
    "drawn": false
  },
  "tuning": {
    "chord": 0.3564,
    "area": 1.0486,
    "margin": 0.16,
    "cg": {
      "mm": 145,
      "datum": "tuning.datum.root_le",
      "range": [
        145,
        173.5
      ],
      "source": "AeroTetris, \"CG (16%): 923.8 mm\" and \"CG (8%): 952.3 mm\" from the nose of the C-130H's fuselage, the 16 percent static margin taken; the wing's root leading edge 778.8 mm from the nose on the drawn planform (docs/HERCULES-STAGE1.md); https://aerotetris.com/models/c130-3077.php"
    },
    "packKg": 1.64,
    "nose": 0.92,
    "tail": -1.2,
    "throws": {
      "high": [
        15,
        15,
        25
      ],
      "low": [
        10.5,
        10.5,
        17.5
      ],
      "source": "ESTIMATED: AeroTetris ships no manual; a scale model's usual 15 deg of aileron and elevator and 25 of rudder, well inside the full size's (docs/HERCULES-STAGE1.md); https://aerotetris.com/models/c130-3077.php"
    },
    "flaps": null
  },
  "power": {
    "table": {
      "simId": 31,
      "massKg": 6.728,
      "cells": 3,
      "rCell": 0.0015,
      "propIn": 12,
      "cruiseMs": 15.46,
      "flightTime": null
    },
    "options": [
      {
        "id": "stock",
        "name": "power.hercules.stock",
        "kind": "electric",
        "voice": "wing",
        "kv": 870,
        "propIn": 12,
        "pitchIn": 8,
        "blades": 2,
        "thrustN": 81.3,
        "currentA": 147.1,
        "rpmNoLoad": 9657,
        "pitchSpeedMs": 27.799,
        "lvcV": 3,
        "massKg": 6.728,
        "cgShiftM": 0,
        "packs": [
          {
            "id": "3s5000x4",
            "cells": 3,
            "mAh": 20000,
            "massKg": 1.64,
            "source": "https://www.modelairplanenews.com/video-electric-11-foot-c-130/"
          }
        ],
        "pack": "3s5000x4",
        "source": [
          "https://www.horizonhobby.com/product/power-25-brushless-outrunner-motor-870kv/EFLM4025A.html",
          "https://aerotetris.com/models/c130-3077.php",
          "https://www.apcprop.com/files/PER3_12x8E.dat"
        ]
      }
    ],
    "estimates": {
      "stock": {
        "3s5000x4": {
          "topSpeed": 32.32,
          "minutes": 81.5
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
        "id": "11x7e",
        "name": "parts.prop.11x7e",
        "apc": "11x7E",
        "propIn": 11,
        "pitchIn": 7,
        "blades": 2,
        "massKg": 0.022963113731250002,
        "source": [
          "https://www.apcprop.com/product/11x7e/",
          "https://www.apcprop.com/files/PER3_11x7E.dat"
        ]
      },
      {
        "id": "12x6e",
        "name": "parts.prop.12x6e",
        "apc": "12x6E",
        "propIn": 12,
        "pitchIn": 6,
        "blades": 2,
        "massKg": 0.02693204696875,
        "source": [
          "https://www.apcprop.com/product/12x6e/",
          "https://www.apcprop.com/files/PER3_12x6E.dat"
        ]
      }
    ],
    "anchors": {
      "prop": [
        0.315,
        0.3846,
        0.0998
      ],
      "belly": [
        0,
        0,
        -0.195
      ],
      "tail": [
        -1.25,
        0,
        0.05
      ],
      "tank": [
        -0.05,
        0,
        -0.13
      ],
      "led": [
        [
          0.1,
          1.4,
          0.175
        ],
        [
          0.1,
          0.9,
          0.17
        ]
      ]
    }
  },
  "livery": {
    "regions": [
      {
        "id": "fuselage",
        "stock": "#61686c"
      },
      {
        "id": "wing",
        "stock": "#61686c"
      },
      {
        "id": "tail",
        "stock": "#61686c"
      },
      {
        "id": "radome",
        "stock": "#3e4347"
      },
      {
        "id": "spinners",
        "stock": "#61686c"
      },
      {
        "id": "props",
        "stock": "#1c1d1f"
      },
      {
        "id": "trim",
        "stock": "#2b2e31"
      }
    ],
    "schemes": [
      {
        "id": "stock",
        "source": {
          "label": "USAF SIG, Authentic Decals 72-51, C-130 Hercules USAF cargo versions: \"painted in overall AMC Battle Grey (FS36173)\"",
          "url": "https://usaf-sig.org/index.php/references/reviews/118-decal-reviews/431-authentic-decals-72-51-c-130-hercules-usaf-cargo-versions"
        },
        "colours": {}
      }
    ]
  },
  "tunes": [
    {
      "id": "hercules-manual",
      "airframe": "hercules3077",
      "name": "Manual",
      "note": "No flight controller. The sticks are the ailerons, the elevator and the rudder, which also steers the nose wheel. It is heavy: it answers late and keeps going, so lead every turn and fly a long, flat approach with power on."
    },
    {
      "id": "hercules-as3x",
      "airframe": "hercules3077",
      "name": "AS3X",
      "note": "A Spektrum AR637T receiver fitted by the builder, its AS3X on: the sticks are the surfaces; centred, the gyro holds the attitude you left it in, against the gusts; held, it turns at the rate you ask; past 40 percent stick it lets go, so full stick is full throw. Nothing levels it.",
      "wingStab": 3
    },
    {
      "id": "hercules-stab",
      "airframe": "hercules3077",
      "name": "SAFE Select",
      "note": "The same receiver with SAFE Select on: roll stick asks for a bank up to 45 degrees, pitch stick for a pitch up to 20, centred sticks fly level.",
      "wingStab": 1
    }
  ],
  "progress": {
    "level": 8
  },
  "strings": {
    "en": {
      "carousel.note.hercules3077": "A 3 m balsa C-130 on four motors. Heavy and slow to answer: lead every turn. O opens the ramp, P drops a load.",
      "power.hercules.stock": "Four Power 25 870 kV, 12 x 8E, four 3S 5000 (stock)",
      "airframe.blurb.hercules3077": "A 3 m AeroTetris balsa C-130H on four electric motors, in USAF grey. Heavy and slow to answer: fly it on a long approach. Press O to open the ramp and P to drop a load under its parachute.",
      "livery.scheme.hercules3077.stock": "USAF AMC grey"
    },
    "es": {
      "carousel.note.hercules3077": "Un C-130 de balsa de 3 m con cuatro motores. Pesado y lento en responder: anticipa cada viraje. La O abre la rampa, la P lanza una carga.",
      "power.hercules.stock": "Cuatro Power 25 de 870 kV, 12 x 8E, cuatro 3S 5000 (de serie)",
      "airframe.blurb.hercules3077": "Un C-130H de balsa de AeroTetris de 3 m con cuatro motores eléctricos, en gris de la USAF. Pesado y lento en responder: vuélalo con una aproximación larga. Pulsa O para abrir la rampa y P para lanzar una carga bajo su paracaídas.",
      "livery.scheme.hercules3077.stock": "Gris AMC de la USAF"
    }
  }
};
