/*
 * aircraft/nighttimber1200/aircraft.js: the Night Timber X as data, one
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
  "id": "nighttimber1200",
  "airframe": {
    "id": "nighttimber1200",
    "simId": 30,
    "fixedWing": true,
    "stall": 9.08,
    "topSpeed": 23.58,
    "gear": {
      "restHeight": 0.2569,
      "restPitchDeg": 4.63
    },
    "flaps": true,
    "name": "Night Timber X",
    "short": "Night Timber",
    "blurb": "A 1200 mm E-flite Night Timber X on 4S: the Timber X's STOL wing and big surfaces, with LEDs inside the airframe. Full flaps and it is off the strip in a few metres; flaps mixed into the ailerons, it hangs on the prop and torque rolls. F sets the flaps.",
    "facts": [
      "4S",
      "1200 mm",
      "STOL",
      "3D"
    ],
    "sizeMm": 1200,
    "grams": 1698,
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
    "defaultTune": "nighttimber-as3x",
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
      "hullR": 0.716,
      "vHalfDown": 0.2695,
      "vHalfUp": 0.1651,
      "bodyLength": 1.055,
      "bodyWidth": 1.2,
      "bodyHeight": 0.4346
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
    "chord": 0.2388,
    "area": 0.2866,
    "margin": 0.067,
    "expo": 0,
    "cg": {
      "mm": 89,
      "datum": "tuning.datum.root_le",
      "range": [
        86,
        105
      ],
      "source": "E-flite manual p. 8, \"89mm +/- 3mm back from the leading edge with the carbon joiner\" or \"102mm +/- 3mm ... with the steel joiner for maximum 3D performance\", without the slats (docs/NIGHTTIMBER-STAGE1.md); https://www.horizonhobby.com/on/demandware.static/Sites-horizon-us-Site/Sites-horizon-master/default/Manuals/EFL13850-Manual-EN.pdf"
    },
    "packKg": 0.27,
    "nose": 0.339,
    "tail": -0.716,
    "throws": {
      "high": [
        28.92,
        35.81,
        33.75
      ],
      "low": [
        22.13,
        28.6,
        23.82
      ],
      "source": "E-flite manual p. 3: high 45, 55 and 55 mm, low 35, 45 and 40 mm, at the surfaces' widest chords, 93, 94 and 99 mm (docs/NIGHTTIMBER-STAGE1.md); https://www.horizonhobby.com/on/demandware.static/Sites-horizon-us-Site/Sites-horizon-master/default/Manuals/EFL13850-Manual-EN.pdf"
    },
    "flaps": {
      "mix": -0.212333,
      "angles": [
        0,
        0.328206,
        0.632256
      ],
      "source": "E-flite manual pp. 3 and 4: half 30 mm, full 55 mm; the flap mix 14 percent of the elevator at half and 20 at full; https://www.horizonhobby.com/on/demandware.static/Sites-horizon-us-Site/Sites-horizon-master/default/Manuals/EFL13850-Manual-EN.pdf"
    }
  },
  "power": {
    "table": {
      "simId": 30,
      "massKg": 1.698,
      "cells": 4,
      "rCell": 0.008,
      "propIn": 13,
      "cruiseMs": 13,
      "flightTime": {
        "kind": "timer",
        "minutesLow": 4,
        "minutesHigh": 4,
        "note": "E-flite's manual timer, '4 minutes' on the 4S 2200",
        "source": "https://www.horizonhobby.com/on/demandware.static/Sites-horizon-us-Site/Sites-horizon-master/default/Manuals/EFL13850-Manual-EN.pdf"
      }
    },
    "options": [
      {
        "id": "stock",
        "name": "power.nighttimber.stock",
        "kind": "electric",
        "voice": "wing",
        "kv": 900,
        "propIn": 13,
        "pitchIn": 4,
        "blades": 2,
        "thrustN": 25.93,
        "currentA": 37.4,
        "rpmNoLoad": 13320,
        "pitchSpeedMs": 19.172,
        "lvcV": 3,
        "massKg": 1.698,
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
          "https://www.horizonhobby.com/on/demandware.static/Sites-horizon-us-Site/Sites-horizon-master/default/Manuals/EFL13850-Manual-EN.pdf",
          "https://www.horizonhobby.com/product/night-timber-x-1.2m-pnp/EFL13875.html",
          "https://www.apcprop.com/files/PER3_13x4E.dat"
        ]
      },
      {
        "id": "3s",
        "name": "power.nighttimber.3s",
        "kind": "electric",
        "voice": "wing",
        "kv": 900,
        "propIn": 13,
        "pitchIn": 4,
        "blades": 2,
        "thrustN": 14.585624999999997,
        "currentA": 21.03749999999999,
        "rpmNoLoad": 9990,
        "pitchSpeedMs": 14.378999999999998,
        "lvcV": 3,
        "massKg": 1.5935599999999999,
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
          "https://www.horizonhobby.com/on/demandware.static/Sites-horizon-us-Site/Sites-horizon-master/default/Manuals/EFL13850-Manual-EN.pdf",
          "https://www.horizonhobby.com/product/night-timber-x-1.2m-pnp/EFL13875.html"
        ]
      }
    ],
    "estimates": {
      "stock": {
        "4s2200": {
          "topSpeed": 23.18,
          "minutes": 26.8
        },
        "4s3200": {
          "topSpeed": 23.28,
          "minutes": 37.2
        }
      },
      "3s": {
        "3s2200": {
          "topSpeed": 17.24,
          "minutes": 22.1
        },
        "3s3200": {
          "topSpeed": 17.25,
          "minutes": 30.1
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
        "id": "13x65e",
        "name": "parts.prop.13x65e",
        "apc": "13x65E",
        "propIn": 13,
        "pitchIn": 6.5,
        "blades": 2,
        "massKg": 0.0300504945125,
        "source": [
          "https://www.apcprop.com/product/13x6-5e/",
          "https://www.apcprop.com/files/PER3_13x65E.dat"
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
        0.308,
        0,
        0
      ],
      "belly": [
        0,
        0,
        -0.1
      ],
      "tail": [
        -0.62,
        0,
        -0.11
      ],
      "tank": [
        -0.01,
        0,
        -0.06
      ],
      "led": [
        [
          0.07,
          0.2,
          0.05
        ],
        [
          0.07,
          0.5,
          0.06
        ]
      ]
    }
  },
  "livery": {
    "regions": [
      {
        "id": "wing",
        "stock": "#f2f2ee"
      },
      {
        "id": "fuselage",
        "stock": "#f2f2ee"
      },
      {
        "id": "tail",
        "stock": "#f2f2ee"
      },
      {
        "id": "trim",
        "stock": "#ee4a1f"
      },
      {
        "id": "stripe",
        "stock": "#17191b"
      },
      {
        "id": "grey",
        "stock": "#8d9195"
      }
    ],
    "schemes": [
      {
        "id": "stock",
        "source": {
          "label": "E-flite Night Timber X 1.2m, EFL13875",
          "url": "https://www.horizonhobby.com/product/night-timber-x-1.2m-pnp/EFL13875.html"
        },
        "colours": {}
      },
      {
        "id": "timberx",
        "source": {
          "label": "E-flite Timber X 1.2m, EFL38500: white, red and black",
          "url": "https://www.horizonhobby.com/product/timber-x-1.2m-bnf-basic-with-as3x-and-safe-select/EFL38500.html"
        },
        "colours": {
          "trim": "#d5271f",
          "grey": "#5a5f63"
        }
      }
    ]
  },
  "tunes": [
    {
      "id": "nighttimber-as3x",
      "airframe": "nighttimber1200",
      "name": "AS3X",
      "note": "E-flite's gyro, as the Night Timber ships. The sticks are the surfaces at the manual's high rates, the flaps mixed into the ailerons; centred, the gyro holds the attitude you left it in, against the torque and the gusts; held, it turns at the rate you ask; past 40 percent stick it lets go, so full stick is full throw. Nothing levels it and nothing caps a rate: hover and torque roll are yours to fly.",
      "wingStab": 3
    },
    {
      "id": "nighttimber-manual",
      "airframe": "nighttimber1200",
      "name": "Manual",
      "note": "No flight controller. The sticks are the ailerons, the flaps mixed in with them, the elevator and the rudder at E-flite's high rates. Hang it on the prop and the torque rolls it left unless you hold it on the ailerons."
    },
    {
      "id": "nighttimber-stab",
      "airframe": "nighttimber1200",
      "name": "SAFE Select",
      "note": "E-flite's beginner bind. Roll stick asks for a bank up to 60 degrees, pitch stick for a pitch up to 30, centred sticks fly level, and the rudder is coordinated for you. It cannot hover or tumble: switch to AS3X for 3D.",
      "wingStab": 1
    }
  ],
  "progress": {
    "level": 6
  },
  "strings": {
    "en": {
      "carousel.note.nighttimber1200": "The Timber X's STOL wing with LEDs inside. Full flaps for short fields; mix the flaps into the ailerons and it hangs on the prop.",
      "power.nighttimber.3s": "BL10 900 kV, 13 x 4, 3S",
      "power.nighttimber.stock": "BL10 900 kV, 13 x 4, 4S (stock)",
      "airframe.blurb.nighttimber1200": "A 1200 mm E-flite Night Timber X on 4S: the Timber X's STOL wing and big surfaces, with LEDs inside the airframe. Full flaps and it is off the strip in a few metres; flaps mixed into the ailerons, it hangs on the prop and torque rolls. F sets the flaps.",
      "livery.scheme.nighttimber1200.stock": "White, orange red and black",
      "livery.scheme.nighttimber1200.timberx": "Timber X red and white"
    },
    "es": {
      "carousel.note.nighttimber1200": "El ala STOL del Timber X con LED por dentro. Flaps a fondo para pistas cortas; mezcla los flaps con los alerones y se cuelga de la hélice.",
      "power.nighttimber.3s": "BL10 de 900 kV, 13 x 4, 3S",
      "power.nighttimber.stock": "BL10 de 900 kV, 13 x 4, 4S (de serie)",
      "airframe.blurb.nighttimber1200": "Un E-flite Night Timber X de 1200 mm en 4S: el ala STOL y las superficies grandes del Timber X, con LED dentro del fuselaje. Con flaps a fondo despega de la pista en pocos metros; con los flaps mezclados en los alerones, se cuelga de la hélice y hace torque roll. F ajusta los flaps.",
      "livery.scheme.nighttimber1200.stock": "Blanco, rojo anaranjado y negro",
      "livery.scheme.nighttimber1200.timberx": "Timber X rojo y blanco"
    }
  }
};
