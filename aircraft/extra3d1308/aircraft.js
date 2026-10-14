/*
 * aircraft/extra3d1308/aircraft.js: the Extra 300 3D as data, one
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
  "id": "extra3d1308",
  "airframe": {
    "id": "extra3d1308",
    "simId": 29,
    "fixedWing": true,
    "stall": 8.31,
    "topSpeed": 30.3,
    "gear": {
      "restHeight": 0.2221,
      "restPitchDeg": 6.7
    },
    "name": "Extra 300 3D",
    "short": "Extra",
    "blurb": "A 1308 mm E-flite Extra 300 3D on 4S, with two and a half times its weight in thrust and control surfaces as big as it can carry. Hang it on the prop, let go of the ailerons and it torque rolls; harrier it in slow at 40 degrees, knife edge it past on the rudder.",
    "facts": [
      "4S",
      "1308 mm",
      "3D"
    ],
    "sizeMm": 1308,
    "grams": 1510,
    "trackClass": "wing",
    "class": "plane",
    "roles": [],
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
    "defaultTune": "extra-as3x",
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
      "propR": 0.1651,
      "hullR": 0.926,
      "vHalfDown": 0.2416,
      "vHalfUp": 0.208,
      "bodyLength": 1.263,
      "bodyWidth": 1.308,
      "bodyHeight": 0.4496
    }
  },
  "kit": {
    "slots": [
      {
        "id": "spinner",
        "options": [
          "stock",
          "bullet",
          "striped"
        ]
      },
      {
        "id": "canopy",
        "options": [
          "stock",
          "smoke",
          "gold"
        ]
      },
      {
        "id": "wingtips",
        "options": [
          "stock",
          "sfg"
        ]
      }
    ],
    "drawn": true
  },
  "tuning": {
    "chord": 0.2927,
    "area": 0.369,
    "margin": 0.154,
    "cg": {
      "mm": 95,
      "datum": "tuning.datum.root_le",
      "range": [
        90,
        100
      ],
      "source": "E-flite manual, \"3.5 - 4.0 in (90 - 100 mm) from leading edge of wing at the fuselage\", pp. 3 and 11; https://www.horizonhobby.com/on/demandware.static/Sites-horizon-us-Site/Sites-horizon-master/default/Manuals/EFL115500-Manual-EN.pdf"
    },
    "packKg": 0.27,
    "nose": 0.26,
    "tail": -0.83,
    "firstFlight": { "rate": "low", "expo": 15, "source": "E-flite manual p. 4: \"Take first flights in Low Rate. For landings, use high rate elevator.\"; its expo chart, \"Exponential (Low) Rates\" 15% on all three; https://www.horizonhobby.com/on/demandware.static/Sites-horizon-us-Site/Sites-horizon-master/default/Manuals/EFL115500-Manual-EN.pdf" },
    "throws": {
      "high": [
        36.53,
        39.67,
        55.05
      ],
      "low": [
        20.92,
        28.6,
        35
      ],
      "source": "E-flite manual p. 3: high 50, 60 and 100 mm, low 30, 45 and 70 mm, at the surfaces' widest chords, 84, 94 and 122 mm (docs/EXTRA-STAGE1.md); https://www.horizonhobby.com/on/demandware.static/Sites-horizon-us-Site/Sites-horizon-master/default/Manuals/EFL115500-Manual-EN.pdf"
    },
    "flaps": null
  },
  "power": {
    "table": {
      "simId": 29,
      "massKg": 1.51,
      "cells": 4,
      "rCell": 0.008,
      "propIn": 13,
      "cruiseMs": 15,
      "flightTime": {
        "kind": "timer",
        "minutesLow": 3,
        "minutesHigh": 3,
        "note": "E-flite's manual timer, '3 minutes' for first flights on the 4S 2200",
        "source": "https://www.horizonhobby.com/on/demandware.static/Sites-horizon-us-Site/Sites-horizon-master/default/Manuals/EFL115500-Manual-EN.pdf"
      }
    },
    "options": [
      {
        "id": "stock",
        "name": "power.extra.stock",
        "kind": "electric",
        "voice": "wing",
        "kv": 910,
        "propIn": 13,
        "pitchIn": 6,
        "blades": 2,
        "thrustN": 37.86,
        "currentA": 64.4,
        "rpmNoLoad": 13468,
        "pitchSpeedMs": 29.077,
        "lvcV": 3,
        "massKg": 1.51,
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
          }
        ],
        "pack": "4s2200",
        "source": [
          "https://www.horizonhobby.com/on/demandware.static/Sites-horizon-us-Site/Sites-horizon-master/default/Manuals/EFL115500-Manual-EN.pdf",
          "https://www.horizonhobby.com/product/e-flite-extra-300-3d-1.3m-bnf-basic-with-as3x-and-safe-select/EFL115500.html",
          "https://www.apcprop.com/files/PER3_13x65E.dat"
        ]
      },
      {
        "id": "3s",
        "name": "power.extra.3s",
        "kind": "electric",
        "voice": "wing",
        "kv": 910,
        "propIn": 13,
        "pitchIn": 6,
        "blades": 2,
        "thrustN": 21.296249999999993,
        "currentA": 36.224999999999994,
        "rpmNoLoad": 10101,
        "pitchSpeedMs": 21.80775,
        "lvcV": 3,
        "massKg": 1.40556,
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
          "https://www.horizonhobby.com/on/demandware.static/Sites-horizon-us-Site/Sites-horizon-master/default/Manuals/EFL115500-Manual-EN.pdf",
          "https://www.horizonhobby.com/product/e-flite-extra-300-3d-1.3m-bnf-basic-with-as3x-and-safe-select/EFL115500.html"
        ]
      }
    ],
    "estimates": {
      "stock": {
        "4s2200": {
          "topSpeed": 34.07,
          "minutes": 29.7
        },
        "4s3200": {
          "topSpeed": 35.32,
          "minutes": 41.1
        }
      },
      "3s": {
        "3s2200": {
          "topSpeed": 26.85,
          "minutes": 24.7
        },
        "3s3200": {
          "topSpeed": 27.41,
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
        "id": "13x8e",
        "name": "parts.prop.13x8e",
        "apc": "13x8E",
        "propIn": 13,
        "pitchIn": 8,
        "blades": 2,
        "massKg": 0.030900980206250005,
        "source": [
          "https://www.apcprop.com/product/13x8e/",
          "https://www.apcprop.com/files/PER3_13x8E.dat"
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
        0.302,
        0,
        0
      ],
      "belly": [
        0,
        0,
        -0.104
      ],
      "tail": [
        -0.8,
        0,
        -0.03
      ],
      "tank": [
        -0.01,
        0,
        -0.04
      ],
      "led": [
        [
          0.084,
          0.2,
          -0.078
        ],
        [
          0.055,
          0.62,
          -0.074
        ]
      ]
    }
  },
  "livery": {
    "regions": [
      {
        "id": "wing",
        "stock": "#eceef0"
      },
      {
        "id": "fuselage",
        "stock": "#eceef0"
      },
      {
        "id": "nose",
        "stock": "#f2a81d"
      },
      {
        "id": "tail",
        "stock": "#8a9096"
      },
      {
        "id": "trim",
        "stock": "#16181a"
      },
      {
        "id": "checks",
        "stock": "#f2b21d"
      }
    ],
    "schemes": [
      {
        "id": "stock",
        "source": {
          "label": "E-flite Extra 300 3D 1.3m, EFL115500",
          "url": "https://www.horizonhobby.com/product/e-flite-extra-300-3d-1.3m-bnf-basic-with-as3x-and-safe-select/EFL115500.html"
        },
        "colours": {}
      },
      {
        "id": "umx",
        "source": {
          "label": "E-flite UMX Extra 300 3D, EFLU1080: red, grey and black",
          "url": "https://www.hobbyzone.com/EFLU1080.html"
        },
        "colours": {
          "nose": "#b11b24",
          "checks": "#b11b24",
          "tail": "#6b7176",
          "wing": "#d1dae2",
          "fuselage": "#d1dae2"
        }
      }
    ]
  },
  "tunes": [
    {
      "id": "extra-as3x",
      "airframe": "extra3d1308",
      "name": "AS3X",
      "note": "A 3D gyro, as the Extra ships with one. The sticks are the surfaces at the 3D throws; centred, the gyro holds the attitude you left it in, against the torque and the gusts; held, it turns at the rate you ask; past 40 percent stick it lets go, so full stick is full throw. Nothing levels it and nothing caps a rate.",
      "wingStab": 3
    },
    {
      "id": "extra-manual",
      "airframe": "extra3d1308",
      "name": "Manual",
      "note": "No flight controller. The sticks are the ailerons, the elevator and the rudder at E-flite's 3D throws. Hang it on the prop and the torque rolls it left unless you hold it on the ailerons, which work in the slipstream at no airspeed at all."
    },
    {
      "id": "extra-stab",
      "airframe": "extra3d1308",
      "name": "SAFE Select",
      "note": "E-flite's beginner bind. Roll stick asks for a bank up to 60 degrees, pitch stick for a pitch up to 30, centred sticks fly level, and the rudder is coordinated for you. It cannot hover or tumble: switch to AS3X for 3D.",
      "wingStab": 1
    }
  ],
  "progress": {
    "level": 9
  },
  "strings": {
    "en": {
      "carousel.note.extra3d1308": "A 3D foamie with two and a half times its weight in thrust. Hang it on the prop and hold the torque on the ailerons.",
      "power.extra.3s": "4250 910 kV, 13 x 6 wood, 3S",
      "power.extra.stock": "4250 910 kV, 13 x 6 wood, 4S (stock)",
      "airframe.blurb.extra3d1308": "A 1308 mm E-flite Extra 300 3D on 4S, with two and a half times its weight in thrust and control surfaces as big as it can carry. Hang it on the prop, let go of the ailerons and it torque rolls; harrier it in slow at 40 degrees, knife edge it past on the rudder.",
      "livery.scheme.extra3d1308.stock": "Yellow, white and black",
      "livery.scheme.extra3d1308.umx": "UMX Extra, red and grey"
    },
    "es": {
      "carousel.note.extra3d1308": "Un 3D de espuma con dos veces y media su peso en empuje. Cuélgalo de la hélice y aguanta el par con los alerones.",
      "power.extra.3s": "4250 de 910 kV, 13 x 6 de madera, 3S",
      "power.extra.stock": "4250 de 910 kV, 13 x 6 de madera, 4S (de serie)",
      "airframe.blurb.extra3d1308": "Un E-flite Extra 300 3D de 1308 mm en 4S, con dos veces y media su peso en empuje y superficies de control tan grandes como puede llevar. Cuélgalo de la hélice, suelta los alerones y hace torque roll; llévalo en harrier lento a 40 grados, pásalo en cuchillo con el timón.",
      "livery.scheme.extra3d1308.stock": "Amarillo, blanco y negro",
      "livery.scheme.extra3d1308.umx": "UMX Extra, rojo y gris"
    }
  }
};
