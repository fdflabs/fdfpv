/*
 * aircraft/cub1400f/aircraft.js: the Piper Cub, floats as data, one
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
  "id": "cub1400f",
  "airframe": {
    "id": "cub1400f",
    "simId": 10,
    "tunesOf": "cub1400",
    "fixedWing": true,
    "stall": 8.73,
    "topSpeed": 20.2,
    "gear": {
      "restHeight": 0.2171,
      "restPitchDeg": 0.43
    },
    "floats": {
      "restHeight": 0.1765,
      "restPitchDeg": 0.64
    },
    "name": "Piper Cub, floats",
    "short": "Cub floats",
    "blurb": "The 1400 mm Piper J-3 Cub on floats, on 3S. Full throttle and the stick back to get it on the step, rotate at flying speed, and land it back on the lake nose up. The water rudders steer it on the water.",
    "facts": [
      "3S",
      "1400 mm",
      "Floats"
    ],
    "sizeMm": 1400,
    "grams": 1532,
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
    "defaultTune": "cub-manual",
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
      "vHalfDown": 0.2186,
      "vHalfUp": 0.1864,
      "bodyLength": 0.9,
      "bodyWidth": 1.4,
      "bodyHeight": 0.405
    }
  },
  "kit": {
    "slots": null,
    "drawn": false
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
    "flaps": null,
    "float": true
  },
  "power": {
    "table": {
      "simId": 10,
      "massKg": 1.532,
      "cells": 3,
      "rCell": 0.012,
      "propIn": 11,
      "cruiseMs": 12,
      "flightTime": {
        "kind": "timer",
        "minutesLow": 4,
        "minutesHigh": 6,
        "note": "FMS, as the Cub on wheels",
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
          "topSpeed": 21.59,
          "minutes": 24.5
        },
        "3s3200": {
          "topSpeed": 22.1,
          "minutes": 33.5
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
        0.028
      ],
      "belly": [
        0,
        0,
        -0.03
      ],
      "tail": [
        -0.58,
        0,
        0.016
      ],
      "tank": [
        -0.01,
        0,
        0.006
      ],
      "led": [
        [
          0.038,
          0.21,
          0.126
        ],
        [
          0.038,
          0.63,
          0.133
        ]
      ]
    }
  },
  "livery": null,
  "tunes": [],
  "progress": {
    "level": null
  },
  "strings": {
    "en": {
      "carousel.note.cub1400f": "The Cub on floats, flown off the lake and landed back on it nose up.",
      "power.cub.stock": "3536 850 kV, 11 x 7, 3S (stock)",
      "airframe.blurb.cub1400f": "The 1400 mm Piper J-3 Cub on floats, on 3S. Full throttle and the stick back to get it on the step, rotate at flying speed, and land it back on the lake nose up. The water rudders steer it on the water."
    },
    "es": {
      "carousel.note.cub1400f": "El Cub con flotadores: despega del lago y vuelve a posarse en él con el morro arriba.",
      "power.cub.stock": "3536 850 kV, 11 x 7, 3S (de serie)",
      "airframe.blurb.cub1400f": "El Piper J-3 Cub de 1400 mm sobre flotadores, en 3S. Acelerador a fondo y stick atrás para que planee, rota a velocidad de vuelo y aterrízalo de vuelta en el lago con la nariz arriba. Los timones de agua lo guían en el agua."
    }
  }
};
