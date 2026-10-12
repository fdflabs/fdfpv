/*
 * aircraft/timber1500f/aircraft.js: the Turbo Timber, floats as data, one
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
  "id": "timber1500f",
  "airframe": {
    "id": "timber1500f",
    "simId": 9,
    "tunesOf": "timber1500",
    "fixedWing": true,
    "stall": 7.68,
    "topSpeed": 25.3,
    "gear": {
      "restHeight": 0.2464,
      "restPitchDeg": 0.48
    },
    "floats": {
      "restHeight": 0.2074,
      "restPitchDeg": 2.52
    },
    "flaps": true,
    "name": "Turbo Timber, floats",
    "short": "Timber floats",
    "blurb": "The Turbo Timber on its floats, on 4S. Half flaps, stick back until the floats get on the step, then let it run and rotate; land it back on the lake with full flaps and the stick held back. The water rudders steer it on the water.",
    "facts": [
      "4S",
      "1555 mm",
      "Floats"
    ],
    "sizeMm": 1555,
    "grams": 1934,
    "trackClass": "wing",
    "cells": 4,
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
    "defaultTune": "timber-as3x",
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
      "hullR": 0.7981,
      "vHalfDown": 0.2484,
      "vHalfUp": 0.2216,
      "bodyLength": 1.04,
      "bodyWidth": 1.555,
      "bodyHeight": 0.47
    }
  },
  "kit": {
    "slots": null,
    "drawn": false
  },
  "tuning": {
    "chord": 0.2322,
    "area": 0.361,
    "margin": 0.191,
    "cg": {
      "mm": 60,
      "datum": "tuning.datum.root_le",
      "range": [
        55,
        65
      ],
      "source": "E-flite manual, \"60mm +/-5mm back from the leading edge of the wing, measured at the wing root\", pp. 3 and 13; https://www.horizonhobby.com/on/demandware.static/-/Sites-horizon-master/default/dw442b6efc/Manuals/EFL105250-Manual-EN.pdf"
    },
    "packKg": 0.33,
    "nose": 0.255,
    "tail": -0.56,
    "firstFlight": { "rate": "low", "expo": 5, "source": "E-flite manual: \"Take first flights in Low Rate. For landings, use high rate elevator.\"; its exponential chart, Low Rate 5% on all three (High Rate 10%); https://www.horizonhobby.com/on/demandware.static/-/Sites-horizon-master/default/dw442b6efc/Manuals/EFL105250-Manual-EN.pdf" },
    "throws": {
      "high": [
        30,
        20,
        27
      ],
      "low": [
        22.2,
        14.9,
        17.6
      ],
      "source": "E-flite manual pp. 3 and 14: high 33, 20, 30 mm, low 25, 15, 20 mm, on 64.8, 60 and 65 mm horn chords; https://www.horizonhobby.com/on/demandware.static/-/Sites-horizon-master/default/dw442b6efc/Manuals/EFL105250-Manual-EN.pdf"
    },
    "flaps": {
      "mix": -0.183531,
      "angles": [
        0,
        0.3137649722243307,
        0.570583797925496
      ],
      "source": "E-flite manual p. 3: half 20 mm, full 35 mm; \"Flap/Down-Elevator Compensation 16% 30%\"; https://www.horizonhobby.com/on/demandware.static/-/Sites-horizon-master/default/dw442b6efc/Manuals/EFL105250-Manual-EN.pdf"
    },
    "float": true
  },
  "power": {
    "table": {
      "simId": 9,
      "massKg": 1.934,
      "cells": 4,
      "rCell": 0.008,
      "propIn": 11,
      "cruiseMs": 13,
      "flightTime": {
        "kind": "timer",
        "minutesLow": 4,
        "minutesHigh": 7,
        "note": "E-flite, as the Timber on wheels",
        "source": "https://www.horizonhobby.com/on/demandware.static/-/Sites-horizon-master/default/dw442b6efc/Manuals/EFL105250-Manual-EN.pdf"
      }
    },
    "options": [
      {
        "id": "stock",
        "name": "power.timber.stock",
        "kind": "electric",
        "voice": "wing",
        "kv": 800,
        "propIn": 11,
        "pitchIn": 7.5,
        "blades": 3,
        "thrustN": 25,
        "currentA": 44,
        "rpmNoLoad": 11840,
        "pitchSpeedMs": 31.953,
        "lvcV": 3.4,
        "massKg": 1.7,
        "cgShiftM": 0,
        "packs": [
          {
            "id": "4s2200",
            "cells": 4,
            "mAh": 2200,
            "massKg": 0.27,
            "source": "https://www.horizonhobby.com/product/x/SPMX224S30.html"
          },
          {
            "id": "4s3200",
            "cells": 4,
            "mAh": 3200,
            "massKg": 0.325,
            "source": "https://www.horizonhobby.com/product/x/SPMX32004S30.html"
          },
          {
            "id": "4s4000",
            "cells": 4,
            "mAh": 4000,
            "massKg": 0.375,
            "source": "https://www.horizonhobby.com/product/x/SPMX40004S30.html"
          },
          {
            "id": "4s5000",
            "cells": 4,
            "mAh": 5000,
            "massKg": 0.486,
            "source": "https://www.horizonhobby.com/product/x/SPMX50004S30.html"
          }
        ],
        "pack": "4s3200",
        "source": [
          "https://www.horizonhobby.com/on/demandware.static/-/Sites-horizon-master/default/dw442b6efc/Manuals/EFL105250-Manual-EN.pdf",
          "https://www.horizonhobby.com/product/e-flite-turbo-timber-evolution-1.5m-bnf-basic-includes-floats/EFL105250.html"
        ]
      },
      {
        "id": "3s",
        "name": "power.timber.3s",
        "kind": "electric",
        "voice": "wing",
        "kv": 800,
        "propIn": 11,
        "pitchIn": 7.5,
        "blades": 3,
        "thrustN": 14.062499999999995,
        "currentA": 24.74999999999999,
        "rpmNoLoad": 8880,
        "pitchSpeedMs": 23.964749999999995,
        "lvcV": 3.4,
        "massKg": 1.612,
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
        "pack": "3s3200",
        "source": [
          "https://www.horizonhobby.com/product/e-flite-turbo-timber-evolution-1.5m-bnf-basic-includes-floats/EFL105250.html",
          "https://www.modelaviation.com/turbo-timber-bnf"
        ]
      }
    ],
    "estimates": {
      "stock": {
        "4s2200": {
          "topSpeed": 25.72,
          "minutes": 28.1
        },
        "4s3200": {
          "topSpeed": 26.52,
          "minutes": 39.3
        },
        "4s4000": {
          "topSpeed": 26.88,
          "minutes": 47.4
        },
        "4s5000": {
          "topSpeed": 27.17,
          "minutes": 54.7
        }
      },
      "3s": {
        "3s2200": {
          "topSpeed": 19.94,
          "minutes": 22.8
        },
        "3s3200": {
          "topSpeed": 20.3,
          "minutes": 31.5
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
        "id": "10x7e",
        "name": "parts.prop.10x7e",
        "apc": "10x7E",
        "propIn": 10,
        "pitchIn": 7,
        "blades": 2,
        "massKg": 0.02012816141875,
        "source": [
          "https://www.apcprop.com/product/10x7e/",
          "https://www.apcprop.com/files/PER3_10x7E.dat"
        ]
      }
    ],
    "anchors": {
      "prop": [
        0.29,
        0,
        0.027
      ],
      "belly": [
        0,
        0,
        -0.043
      ],
      "tail": [
        -0.66,
        0,
        -0.003
      ],
      "tank": [
        -0.01,
        0,
        -0.003
      ],
      "led": [
        [
          0.054,
          0.23,
          0.098
        ],
        [
          0.038,
          0.7,
          0.094
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
      "carousel.note.timber1500f": "The Timber on floats: onto the step, off the lake, back down on it.",
      "power.timber.3s": "BL10 800 kV, 11 x 7.5 three blade, 3S",
      "power.timber.stock": "BL10 800 kV, 11 x 7.5 three blade, 4S (stock)",
      "airframe.blurb.timber1500f": "The Turbo Timber on its floats, on 4S. Half flaps, stick back until the floats get on the step, then let it run and rotate; land it back on the lake with full flaps and the stick held back. The water rudders steer it on the water."
    },
    "es": {
      "carousel.note.timber1500f": "El Timber con flotadores: al redán, fuera del lago y de vuelta a él.",
      "power.timber.3s": "BL10 800 kV, 11 x 7,5 tripala, 3S",
      "power.timber.stock": "BL10 800 kV, 11 x 7,5 tripala, 4S (de serie)",
      "airframe.blurb.timber1500f": "El Turbo Timber sobre flotadores, en 4S. Medio flap, stick atrás hasta que los flotadores planeen, luego déjalo correr y rota; aterrízalo de vuelta en el lago con flaps a fondo y el stick atrás. Los timones de agua lo guían en el agua."
    }
  }
};
