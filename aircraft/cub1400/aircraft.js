/*
 * aircraft/cub1400/aircraft.js: the Piper Cub as data, one aircraft's
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
  "id": "cub1400",
  "airframe": {
    "id": "cub1400",
    "simId": 4,
    "fixedWing": true,
    "stall": 8.1,
    "topSpeed": 22.4,
    "gear": {
      "restHeight": 0.1463,
      "restPitchDeg": 11
    },
    "name": "Piper Cub",
    "short": "Cub",
    "blurb": "A 1400 mm Piper J-3 Cub on 3S, a taildragger with ailerons, elevator and rudder. Take off from the strip on its wheels and land it back on them.",
    "facts": [
      "3S",
      "1400 mm",
      "Taildragger"
    ],
    "sizeMm": 1400,
    "grams": 1320,
    "trackClass": "wing",
    "class": "plane",
    "roles": [],
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
    "defaultTune": "cub-acro",
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
      "propR": 0.1397,
      "hullR": 0.7,
      "vHalfDown": 0.163,
      "vHalfUp": 0.16,
      "bodyLength": 0.9,
      "bodyWidth": 1.4,
      "bodyHeight": 0.323
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
          "tundra"
        ]
      }
    ],
    "drawn": true
  },
  "tuning": {
    "chord": 0.2,
    "area": 0.28,
    "margin": 0.119,
    "cg": {
      "mm": 60,
      "datum": "tuning.datum.le",
      "range": [
        55,
        65
      ],
      "source": "FMS manual, \"(55-65mm) from the leading edge of the main wing\", p. 11; https://www.horizonhobby.com/on/demandware.static/-/Sites-horizon-master/default/dwa89b2e9b/Manuals/FMM106P%20Piper%20J-3%20Cub%20wFloats%201400mm%20V4-Manual-EN%20(2).pdf"
    },
    "packKg": 0.19,
    "nose": 0.2,
    "tail": -0.54,
    "firstFlight": { "rate": "low", "source": "FMS manual, control throws: \"Tips: On the first flight, fly the model in low rate.\" It gives no expo, so the stock expo stays; https://www.horizonhobby.com/on/demandware.static/-/Sites-horizon-master/default/dwa89b2e9b/Manuals/FMM106P%20Piper%20J-3%20Cub%20wFloats%201400mm%20V4-Manual-EN%20(2).pdf" },
    "throws": {
      "high": [
        18,
        15,
        15
      ],
      "low": [
        13.4,
        11.2,
        11.6
      ],
      "source": "FMS manual p. 10: high 16, 16, 18 mm, low 12, 12, 14 mm, on 50, 60 and 70 mm horn chords; https://www.horizonhobby.com/on/demandware.static/-/Sites-horizon-master/default/dwa89b2e9b/Manuals/FMM106P%20Piper%20J-3%20Cub%20wFloats%201400mm%20V4-Manual-EN%20(2).pdf"
    },
    "flaps": null
  },
  "power": {
    "table": {
      "simId": 4,
      "massKg": 1.32,
      "cells": 3,
      "rCell": 0.012,
      "propIn": 11,
      "cruiseMs": 12,
      "flightTime": {
        "kind": "timer",
        "minutesLow": 4,
        "minutesHigh": 6,
        "note": "FMS: a 4 minute first timer, 'approx. flying duration 6min', 3S 2200",
        "source": "https://www.fmshobby.com/products/fms-1400mm-55-1-j-3-cub-v4-pnp"
      }
    },
    "options": [
      {
        "id": "stock",
        "name": "power.cub.stock",
        "kind": "electric",
        "voice": "wing",
        "kv": 850,
        "propIn": 11,
        "pitchIn": 7,
        "blades": 2,
        "thrustN": 13.5,
        "currentA": 27,
        "rpmNoLoad": 9435,
        "pitchSpeedMs": 23.765,
        "lvcV": 3,
        "massKg": 1.32,
        "cgShiftM": 0,
        "packs": [
          {
            "id": "3s2200",
            "cells": 3,
            "mAh": 2200,
            "massKg": 0.16556,
            "source": "https://www.horizonhobby.com/product/x/SPMX22003S30.html"
          },
          {
            "id": "3s3200",
            "cells": 3,
            "mAh": 3200,
            "massKg": 0.237,
            "source": "https://www.horizonhobby.com/product/x/SPMX32003S30.html"
          }
        ],
        "pack": "3s2200",
        "source": [
          "https://www.fmshobby.com/products/fms-1400mm-55-1-j-3-cub-v4-pnp",
          "https://cdn-files.myshopline.com/file/store/1772248208561/ZTW.pdf"
        ]
      }
    ],
    "estimates": {
      "stock": {
        "3s2200": {
          "topSpeed": 23.54,
          "minutes": 35.3
        },
        "3s3200": {
          "topSpeed": 24.03,
          "minutes": 47.7
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
        "id": "11x7e-3",
        "name": "parts.prop.11x7e-3",
        "apc": "11x7E-3",
        "propIn": 11,
        "pitchIn": 7,
        "blades": 3,
        "massKg": 0.030900980206250005,
        "source": [
          "https://www.apcprop.com/product/11x7e-3/",
          "https://www.apcprop.com/files/PER3_11x7E-3.dat"
        ]
      },
      {
        "id": "11x55e",
        "name": "parts.prop.11x55e",
        "apc": "11x55E",
        "propIn": 11,
        "pitchIn": 5.5,
        "blades": 2,
        "massKg": 0.022963113731250002,
        "source": [
          "https://www.apcprop.com/product/11x5-5e/",
          "https://www.apcprop.com/files/PER3_11x55E.dat"
        ]
      }
    ],
    "anchors": {
      "prop": [
        0.23,
        0,
        0.002
      ],
      "belly": [
        0,
        0,
        -0.056
      ],
      "tail": [
        -0.58,
        0,
        -0.01
      ],
      "tank": [
        -0.01,
        0,
        -0.02
      ],
      "led": [
        [
          0.036,
          0.21,
          0.1
        ],
        [
          0.036,
          0.63,
          0.107
        ]
      ]
    }
  },
  "livery": {
    "regions": [
      {
        "id": "wing",
        "stock": "#f0be2a"
      },
      {
        "id": "fuselage",
        "stock": "#f0be2a"
      },
      {
        "id": "tail",
        "stock": "#f0be2a"
      },
      {
        "id": "trim",
        "stock": "#16181a"
      },
      {
        "id": "floats",
        "stock": "#f2f1ec",
        "floats": true
      }
    ],
    "schemes": [
      {
        "id": "stock",
        "source": {
          "label": "FMS J-3 Cub 1400 mm V4",
          "url": "https://www.fmshobby.com/products/fms-1400mm-55-1-j-3-cub-v4-pnp"
        },
        "colours": {}
      },
      {
        "id": "l4",
        "source": {
          "label": "Wikipedia, Piper J-3 Cub",
          "url": "https://en.wikipedia.org/wiki/Piper_J-3_Cub"
        },
        "colours": {
          "wing": "#5a5434",
          "fuselage": "#5a5434",
          "tail": "#5a5434",
          "trim": "#5a5434",
          "floats": "#5a5434"
        }
      },
      {
        "id": "flitfire",
        "source": {
          "label": "Wikipedia, Piper J-3 Cub",
          "url": "https://en.wikipedia.org/wiki/Piper_J-3_Cub"
        },
        "colours": {
          "wing": "#b9bdc0",
          "fuselage": "#b9bdc0",
          "tail": "#b9bdc0",
          "floats": "#b9bdc0",
          "trim": "#032257"
        }
      }
    ]
  },
  "tunes": [
    {
      "id": "cub-manual",
      "airframe": "cub1400",
      "name": "Manual",
      "note": "No flight controller. The sticks are the ailerons, the elevator and the rudder, which also steers the tailwheel."
    },
    {
      "id": "cub-acro",
      "airframe": "cub1400",
      "name": "Acro",
      "note": "A gyro holds the plane where you leave it once it is off the ground. Sticks ask for a roll and a pitch rate, centred sticks hold the attitude, and the rudder stick is the rudder alone.",
      "wingStab": 2
    },
    {
      "id": "cub-stab",
      "airframe": "cub1400",
      "name": "Stabilised",
      "note": "A gyro holds the plane once it is off the ground. Roll stick asks for a bank up to 60 degrees, pitch stick for a pitch up to 30, centred sticks fly level, and the rudder is coordinated for you.",
      "wingStab": 1
    }
  ],
  "progress": {
    "level": null
  },
  "strings": {
    "en": {
      "carousel.note.cub1400": "The classic taildragger. Off the strip on its wheels, back down on them.",
      "power.cub.stock": "3536 850 kV, 11 x 7, 3S (stock)",
      "airframe.blurb.cub1400": "A 1400 mm Piper J-3 Cub on 3S, a taildragger with ailerons, elevator and rudder. Take off from the strip on its wheels and land it back on them.",
      "livery.scheme.cub1400.stock": "Cub Yellow, black flash",
      "livery.scheme.cub1400.l4": "L-4 Grasshopper olive drab",
      "livery.scheme.cub1400.flitfire": "Flitfire silver"
    },
    "es": {
      "carousel.note.cub1400": "El clásico de patín de cola. Despega de la pista sobre sus ruedas y vuelve a ellas.",
      "power.cub.stock": "3536 850 kV, 11 x 7, 3S (de serie)",
      "airframe.blurb.cub1400": "Un Piper J-3 Cub de 1400 mm en 3S, de rueda de cola, con alerones, timón de profundidad y timón de dirección. Despega de la pista sobre sus ruedas y vuelve a aterrizarlo en ellas.",
      "livery.scheme.cub1400.stock": "Amarillo Cub, rayo negro",
      "livery.scheme.cub1400.l4": "L-4 Grasshopper verde oliva",
      "livery.scheme.cub1400.flitfire": "Flitfire plateado"
    }
  }
};
