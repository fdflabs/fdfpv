/*
 * aircraft/timber1500/aircraft.js: the Turbo Timber as data, one
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
  "id": "timber1500",
  "airframe": {
    "id": "timber1500",
    "simId": 7,
    "fixedWing": true,
    "stall": 7.2,
    "topSpeed": 27.2,
    "gear": {
      "restHeight": 0.2115,
      "restPitchDeg": 11.81
    },
    "flaps": true,
    "name": "Turbo Timber",
    "short": "Timber",
    "blurb": "A 1555 mm E-flite Turbo Timber Evolution on 4S, a bush plane with slats and big flaps. Full flaps and it is off the strip in two metres and crawls nose high; flaps up and it is quick and aerobatic. F sets the flaps.",
    "facts": [
      "4S",
      "1555 mm",
      "STOL, flaps"
    ],
    "sizeMm": 1555,
    "grams": 1700,
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
      "vHalfDown": 0.227,
      "vHalfUp": 0.195,
      "bodyLength": 1.04,
      "bodyWidth": 1.555,
      "bodyHeight": 0.422
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
    }
  },
  "power": {
    "table": {
      "simId": 7,
      "massKg": 1.7,
      "cells": 4,
      "rCell": 0.008,
      "propIn": 11,
      "cruiseMs": 13,
      "flightTime": {
        "kind": "timer",
        "minutesLow": 4,
        "minutesHigh": 7,
        "note": "E-flite's manual timers, 4 min first flights and 7 min, on the 4S 3200; Model Aviation flew 5 to 8",
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
          "topSpeed": 27.91,
          "minutes": 39.2
        },
        "4s3200": {
          "topSpeed": 28.69,
          "minutes": 54.4
        },
        "4s4000": {
          "topSpeed": 29.04,
          "minutes": 65.2
        },
        "4s5000": {
          "topSpeed": 29.32,
          "minutes": 74.4
        }
      },
      "3s": {
        "3s2200": {
          "topSpeed": 21.58,
          "minutes": 32.3
        },
        "3s3200": {
          "topSpeed": 21.93,
          "minutes": 44.1
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
        0
      ],
      "belly": [
        0,
        0,
        -0.07
      ],
      "tail": [
        -0.66,
        0,
        -0.03
      ],
      "tank": [
        -0.01,
        0,
        -0.03
      ],
      "led": [
        [
          0.053,
          0.23,
          0.072
        ],
        [
          0.037,
          0.7,
          0.068
        ]
      ]
    }
  },
  "livery": {
    "regions": [
      {
        "id": "wing",
        "stock": "#f1f0ea"
      },
      {
        "id": "fuselage",
        "stock": "#f1f0ea"
      },
      {
        "id": "tail",
        "stock": "#f1f0ea"
      },
      {
        "id": "trim",
        "stock": "#d5271f"
      },
      {
        "id": "stripe",
        "stock": "#17191b"
      },
      {
        "id": "floats",
        "stock": "#f1f0ea",
        "floats": true
      }
    ],
    "schemes": [
      {
        "id": "stock",
        "source": {
          "label": "E-flite Turbo Timber Evolution, EFL105250",
          "url": "https://www.horizonhobby.com/product/e-flite-turbo-timber-evolution-1.5m-bnf-basic-includes-floats/EFL105250.html"
        },
        "colours": {}
      },
      {
        "id": "timber",
        "source": {
          "label": "E-flite Timber 1.5 m, EFL5250",
          "url": "https://www.horizonhobby.com/product/e-flite-timber-1.5m-bnf-basic-as3x-with-floats/EFL5250.html"
        },
        "colours": {
          "wing": "#f2f2f2",
          "fuselage": "#f2f2f2",
          "tail": "#f2f2f2",
          "floats": "#f2f2f2",
          "trim": "#b11b24",
          "stripe": "#0e1213"
        }
      },
      {
        "id": "timber_x",
        "source": {
          "label": "E-flite Timber X 1.2 m, EFL3850",
          "url": "https://www.horizonhobby.com/product/e-flite-timber-x-1.2m-bnf-basic-with-as3x-and-safe-select/EFL3850.html"
        },
        "colours": {
          "wing": "#f2f2f2",
          "fuselage": "#f2f2f2",
          "tail": "#f2f2f2",
          "floats": "#f2f2f2",
          "trim": "#85c936",
          "stripe": "#1e1e1d"
        }
      },
      {
        "id": "super",
        "source": {
          "label": "E-flite Super Timber 1.7 m, EFL02550",
          "url": "https://www.horizonhobby.com/product/e-flite-super-timber-1.7m-bnf-basic-with-as3x-and-safe-select/EFL02550.html"
        },
        "colours": {
          "wing": "#eaaa06",
          "tail": "#eaaa06",
          "trim": "#eaaa06",
          "fuselage": "#f2f2f2",
          "floats": "#f2f2f2",
          "stripe": "#1a1a1a"
        }
      },
      {
        "id": "twin",
        "source": {
          "label": "E-flite Twin Timber 1.6 m, EFL23850",
          "url": "https://www.horizonhobby.com/product/e-flite-twin-timber-1.6m-bnf-basic-with-as3x-and-safe-select/EFL23850.html"
        },
        "colours": {
          "wing": "#0e65ba",
          "trim": "#0e65ba",
          "fuselage": "#f2f2f2",
          "tail": "#f2f2f2",
          "floats": "#f2f2f2",
          "stripe": "#0f1c3c"
        }
      }
    ]
  },
  "tunes": [
    {
      "id": "timber-as3x",
      "airframe": "timber1500",
      "name": "AS3X",
      "note": "E-flite's gyro, as the Timber ships. The sticks are the surfaces; centred, the gyro holds the attitude you left it in, against the gusts; held, it turns at the rate you ask; past 40 percent stick it lets go, so full stick is full throw. Nothing levels it and nothing caps a rate. F sets the flaps.",
      "wingStab": 3
    },
    {
      "id": "timber-manual",
      "airframe": "timber1500",
      "name": "Manual",
      "note": "No flight controller. The sticks are the ailerons, the elevator and the rudder, which also steers the tailwheel. F sets the flaps, with a little down elevator mixed in as the radio would."
    },
    {
      "id": "timber-stab",
      "airframe": "timber1500",
      "name": "SAFE Select",
      "note": "E-flite's beginner bind, once it is off the ground. Roll stick asks for a bank up to 60 degrees, pitch stick for a pitch up to 30, centred sticks fly level, and the rudder is coordinated for you. F sets the flaps.",
      "wingStab": 1
    }
  ],
  "progress": {
    "level": null
  },
  "strings": {
    "en": {
      "carousel.note.timber1500": "A bush plane with slats and big flaps, off the strip in two metres.",
      "power.timber.3s": "BL10 800 kV, 11 x 7.5 three blade, 3S",
      "power.timber.stock": "BL10 800 kV, 11 x 7.5 three blade, 4S (stock)",
      "airframe.blurb.timber1500": "A 1555 mm E-flite Turbo Timber Evolution on 4S, a bush plane with slats and big flaps. Full flaps and it is off the strip in two metres and crawls nose high; flaps up and it is quick and aerobatic. F sets the flaps.",
      "livery.scheme.timber1500.stock": "White, red and black",
      "livery.scheme.timber1500.timber": "Timber 1.5 m",
      "livery.scheme.timber1500.timber_x": "Timber X, lime",
      "livery.scheme.timber1500.super": "Super Timber yellow",
      "livery.scheme.timber1500.twin": "Twin Timber blue"
    },
    "es": {
      "carousel.note.timber1500": "Un avión de monte con slats y grandes flaps: despega en dos metros.",
      "power.timber.3s": "BL10 800 kV, 11 x 7,5 tripala, 3S",
      "power.timber.stock": "BL10 800 kV, 11 x 7,5 tripala, 4S (de serie)",
      "airframe.blurb.timber1500": "Un E-flite Turbo Timber Evolution de 1555 mm en 4S, un avión de monte con slats y flaps grandes. Con flaps a fondo despega en dos metros y se arrastra con la nariz alta; con flaps arriba es rápido y acrobático. F ajusta los flaps.",
      "livery.scheme.timber1500.stock": "Blanco, rojo y negro",
      "livery.scheme.timber1500.timber": "Timber 1,5 m",
      "livery.scheme.timber1500.timber_x": "Timber X, lima",
      "livery.scheme.timber1500.super": "Super Timber amarillo",
      "livery.scheme.timber1500.twin": "Twin Timber azul"
    }
  }
};
