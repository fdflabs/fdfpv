/*
 * aircraft/radian2000/aircraft.js: the Radian as data, one aircraft's
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
  "id": "radian2000",
  "airframe": {
    "id": "radian2000",
    "simId": 6,
    "fixedWing": true,
    "stall": 6.49,
    "topSpeed": 26.51,
    "name": "Radian",
    "short": "Radian",
    "blurb": "A 2 m E-flite Radian motor glider on 3S, with ailerons, elevator and rudder. Climb on the motor, fold the prop, and find the thermals over the field to stay up.",
    "facts": [
      "3S",
      "2000 mm",
      "Glider"
    ],
    "sizeMm": 2000,
    "grams": 980,
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
    "defaultTune": "radian-manual",
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
      "propR": 0.1238,
      "hullR": 1.0093,
      "vHalfDown": 0.052,
      "vHalfUp": 0.268,
      "bodyLength": 1.14,
      "bodyWidth": 2,
      "bodyHeight": 0.32
    }
  },
  "kit": {
    "slots": [
      {
        "id": "nose",
        "options": [
          "stock",
          "pointed"
        ]
      },
      {
        "id": "wingtips",
        "options": [
          "stock",
          "winglet"
        ]
      }
    ],
    "drawn": true
  },
  "tuning": {
    "chord": 0.1866,
    "area": 0.355,
    "margin": 0.228,
    "cg": {
      "mm": 63,
      "datum": "tuning.datum.root_le",
      "range": null,
      "source": "E-flite Radian manual, \"2 1/2 inches (63mm) back from leading edge at the root\", no range; https://www.horizonhobby.com/on/demandware.static/Sites-horizon-us-Site/Sites-horizon-master/default/Manuals/EFL4750-Manual-EN.pdf"
    },
    "packKg": 0.11,
    "nose": 0.26,
    "tail": -0.7,
    "throws": {
      "high": [
        15,
        24.4,
        30
      ],
      "low": [
        10.5,
        18,
        18.2
      ],
      "source": "E-flite Radian manual p. 3: elevator 12 and 9 mm, rudder 40 and 25 mm, dual rates 100/70 percent; the ailerons ESTIMATED (the Radian has none; the Radian Pro's are 15/12 mm high, 11/8 low, https://www.horizonhobby.com/on/demandware.static/Sites-horizon-us-Site/Sites-horizon-master/default/Manuals/PKZ5480-Manual_EN.pdf), their low at 70 percent; https://www.horizonhobby.com/on/demandware.static/Sites-horizon-us-Site/Sites-horizon-master/default/Manuals/EFL4750-Manual-EN.pdf"
    },
    "flaps": null
  },
  "power": {
    "table": {
      "simId": 6,
      "massKg": 0.98,
      "cells": 3,
      "rCell": 0.015,
      "propIn": 9.75,
      "cruiseMs": 7.7,
      "flightTime": null
    },
    "options": [
      {
        "id": "stock",
        "name": "power.radian.stock",
        "kind": "electric",
        "voice": "wing",
        "kv": 960,
        "propIn": 9.75,
        "pitchIn": 7.5,
        "blades": 2,
        "thrustN": 9.28,
        "currentA": 21.8,
        "rpmNoLoad": 10656,
        "pitchSpeedMs": 28.758,
        "lvcV": 3.108,
        "massKg": 0.98,
        "cgShiftM": 0,
        "packs": [
          {
            "id": "3s1300",
            "cells": 3,
            "mAh": 1300,
            "massKg": 0.113,
            "source": "https://chinahobbyline.com/products/cnhl-black-series-1300mah-11-1v-3s-130c-lipo-battery-with-xt60-plug"
          },
          {
            "id": "3s1500",
            "cells": 3,
            "mAh": 1500,
            "massKg": 0.125,
            "source": "https://chinahobbyline.com/products/cnhl-black-series-v2-0-1500mah-11-1v-3s-130c-lipo-battery-with-xt60-plug"
          },
          {
            "id": "3s1800",
            "cells": 3,
            "mAh": 1800,
            "massKg": 0.168,
            "source": "https://chinahobbyline.com/products/cnhl-1800mah-11-1v-3s-70c-lipo-battery-with-t-dean-plug"
          },
          {
            "id": "3s2200",
            "cells": 3,
            "mAh": 2200,
            "massKg": 0.18,
            "source": "https://chinahobbyline.com/products/cnhl-black-series-2200mah-3s-11-1v-30c-lipo-battery-with-ec3-plug"
          }
        ],
        "pack": "3s1300",
        "source": [
          "https://www.modelairplanenews.com/parkzone-radian-pro/",
          "https://www.modelaviation.com/eflite-night-radian",
          "https://www.horizonhobby.com/on/demandware.static/-/Sites-horizon-master/default/dw5e16af32/Manuals/EFLA1030B_Manual.pdf"
        ]
      }
    ],
    "estimates": {
      "stock": {
        "3s1300": {
          "topSpeed": 25.73,
          "minutes": 92.5
        },
        "3s1500": {
          "topSpeed": 25.82,
          "minutes": 104.7
        },
        "3s1800": {
          "topSpeed": 25.9,
          "minutes": 117.8
        },
        "3s2200": {
          "topSpeed": 25.98,
          "minutes": 141.4
        }
      }
    }
  },
  "hangar": {
    "props": [
      {
        "id": "stock",
        "name": "parts.prop.stock"
      }
    ],
    "anchors": {
      "prop": [
        0.293,
        0,
        -0.008
      ],
      "belly": [
        0,
        0,
        -0.04
      ],
      "tail": [
        -0.7,
        0,
        0.012
      ],
      "tank": [
        -0.01,
        0,
        -0.01
      ],
      "led": [
        [
          0.04,
          0.3,
          0.039
        ],
        [
          -0.028,
          0.9,
          0.111
        ]
      ]
    }
  },
  "livery": {
    "regions": [
      {
        "id": "wing",
        "stock": "#f1f1ec"
      },
      {
        "id": "fuselage",
        "stock": "#f1f1ec"
      },
      {
        "id": "tail",
        "stock": "#f1f1ec"
      },
      {
        "id": "tips",
        "stock": "#cf2a26"
      },
      {
        "id": "canopy",
        "stock": "#1b2127"
      }
    ],
    "schemes": [
      {
        "id": "stock",
        "source": null,
        "colours": {}
      },
      {
        "id": "radian",
        "source": {
          "label": "E-flite Radian decal sheet, EFL4703",
          "url": "https://www.horizonhobby.com/product/e-flite-decal-sheet-radian-bnf-basic/EFL4703.html"
        },
        "colours": {
          "wing": "#f2f2f2",
          "fuselage": "#f2f2f2",
          "tail": "#f2f2f2",
          "tips": "#e68e19",
          "canopy": "#0e1213"
        }
      },
      {
        "id": "night",
        "source": {
          "label": "E-flite Night Radian FT 2.0 m, EFL3650",
          "url": "https://www.horizonhobby.com/product/e-flite-night-radian-ft-2.0m-bnf-basic-with-as3x-and-safe-select/EFL3650.html"
        },
        "colours": {
          "wing": "#f2f2f2",
          "fuselage": "#f2f2f2",
          "tail": "#f2f2f2",
          "tips": "#b11b24"
        }
      }
    ]
  },
  "tunes": [
    {
      "id": "radian-manual",
      "airframe": "radian2000",
      "name": "Manual",
      "note": "No flight controller. The sticks are the ailerons, the elevator and the rudder; closing the throttle folds the prop."
    },
    {
      "id": "radian-as3x",
      "airframe": "radian2000",
      "name": "AS3X",
      "note": "A Spektrum AS3X receiver fitted in place of a plain one, which any plane can carry: the sticks are the surfaces; centred, the gyro holds the attitude you left it in, against the gusts; held, it turns at the rate you ask; past 40 percent stick it lets go, so full stick is full throw. Nothing levels it and nothing caps a rate. Close the throttle and it glides.",
      "wingStab": 3
    },
    {
      "id": "radian-stab",
      "airframe": "radian2000",
      "name": "Stabilised",
      "note": "A gyro holds the glider. Roll stick asks for a bank up to 60 degrees, pitch stick for a pitch up to 30, centred sticks fly level, and the rudder is coordinated for you. Close the throttle and it glides.",
      "wingStab": 1
    }
  ],
  "progress": {
    "level": 5
  },
  "strings": {
    "en": {
      "carousel.note.radian2000": "A two metre motor glider. Climb, fold the prop and hunt the thermals.",
      "power.radian.stock": "480 960 kV, 9.75 x 7.5 folding, 3S (stock)",
      "airframe.blurb.radian2000": "A 2 m E-flite Radian motor glider on 3S, with ailerons, elevator and rudder. Climb on the motor, fold the prop, and find the thermals over the field to stay up.",
      "livery.scheme.radian2000.stock": "White, red tips",
      "livery.scheme.radian2000.radian": "Radian, orange tips",
      "livery.scheme.radian2000.night": "Night Radian FT",
      "parts.prop_only.radian2000": "The Radian folds its own prop, and nobody publishes another that folds on this motor."
    },
    "es": {
      "carousel.note.radian2000": "Un motovelero de dos metros. Sube, pliega la hélice y busca las térmicas.",
      "power.radian.stock": "480 960 kV, 9,75 x 7,5 plegable, 3S (de serie)",
      "airframe.blurb.radian2000": "Un motovelero E-flite Radian de 2 m en 3S, con alerones, timón de profundidad y timón de dirección. Sube con el motor, pliega la hélice y busca las térmicas sobre el campo para mantenerte arriba.",
      "livery.scheme.radian2000.stock": "Blanco, puntas rojas",
      "livery.scheme.radian2000.radian": "Radian, puntas naranja",
      "livery.scheme.radian2000.night": "Night Radian FT",
      "parts.prop_only.radian2000": "El Radian pliega su propia hélice, y nadie publica otra plegable para este motor."
    }
  }
};
