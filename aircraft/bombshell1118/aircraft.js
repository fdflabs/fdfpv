/*
 * aircraft/bombshell1118/aircraft.js: the Buzzard Bombshell as data, one
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
  "id": "bombshell1118",
  "airframe": {
    "id": "bombshell1118",
    "simId": 11,
    "fixedWing": true,
    "stall": 6.49,
    "topSpeed": 12.52,
    "gear": {
      "restHeight": 0.1318,
      "restPitchDeg": 8.5
    },
    "name": "Buzzard Bombshell",
    "short": "Bombshell",
    "blurb": "A 44 in BMJR Buzzard Bombshell, the 1940 free flight classic in balsa and red tissue, on a Cox .049 glow engine: rudder, elevator and throttle, no ailerons. The roll stick works the rudder, it levels itself when you let go, and it climbs in thermals.",
    "facts": [
      "Glow .049",
      "1118 mm",
      "Three channels"
    ],
    "sizeMm": 1118,
    "grams": 559.9,
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
    "defaultTune": "bombshell-manual",
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
      "propR": 0.0889,
      "hullR": 0.6733,
      "vHalfDown": 0.144,
      "vHalfUp": 0.1793,
      "bodyLength": 0.818,
      "bodyWidth": 1.1176,
      "bodyHeight": 0.3233
    }
  },
  "kit": {
    "slots": [
      {
        "id": "spinner",
        "options": [
          "stock",
          "bullet"
        ]
      },
      {
        "id": "wheels",
        "options": [
          "stock",
          "covered"
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
    "drawn": true
  },
  "tuning": {
    "chord": 0.1905,
    "area": 0.212903,
    "margin": 0.288,
    "cg": {
      "mm": 62.9,
      "datum": "tuning.datum.le",
      "range": [
        55.2,
        81.9
      ],
      "source": "the plan's \"BALANCE POINT RANGE\" bracket, which carries no number, measured at 29 to 43 percent of the chord (docs/BOMBSHELL-STAGE1.md); https://outerzone.co.uk/plan_details.asp?ID=2180"
    },
    "packKg": 0.07,
    "nose": 0.107,
    "tail": -0.58,
    "throws": {
      "high": [
        0,
        15,
        20
      ],
      "low": [
        0,
        10.5,
        14
      ],
      "source": "high: ESTIMATED, no throws published (docs/BOMBSHELL-STAGE1.md); low: 70 percent of high, the low rate the Timber, Radian and Radian Pro manuals state"
    },
    "flaps": null
  },
  "power": {
    "table": {
      "simId": 11,
      "massKg": 0.5599,
      "cells": 3,
      "rCell": 0.03,
      "propIn": 7,
      "cruiseMs": 8,
      "flightTime": null
    },
    "options": [
      {
        "id": "stock",
        "name": "power.bombshell.stock",
        "kind": "glow",
        "voice": "glow2",
        "propIn": 7,
        "pitchIn": 3.5,
        "blades": 2,
        "thrustN": 2.824,
        "rpmNoLoad": 11000,
        "pitchSpeedMs": 13.854,
        "idle": 0.4,
        "flowFullM3s": 3.0666666666666663e-8,
        "leanFrac": 0.05,
        "leanGain": 0.05,
        "massKg": 0.5599,
        "cgShiftM": 0,
        "packs": [
          {
            "id": "8.4cc",
            "cc": 8.4,
            "m3": 0.0000084,
            "massKg": 0.007350000000000001,
            "source": "https://coxengines.ca/public/files/049%20Texaco.pdf"
          },
          {
            "id": "5.1cc",
            "cc": 5.1,
            "m3": 0.0000051,
            "massKg": 0.0044624999999999995,
            "source": "https://www.antiquemodeler.org/images/Rulebook/2025%20Final%20-%20Jan%2017%202025.pdf"
          }
        ],
        "pack": "8.4cc",
        "source": [
          "https://bmjrmodels.com/product/buzzard-bombshell/",
          "https://coxengines.ca/public/files/049%20Texaco.pdf",
          "https://api.drum.lib.umd.edu/server/api/core/bitstreams/3ae6ca8c-b068-4d07-90dc-7f5bf6a95b3c/content"
        ]
      },
      {
        "id": "cox-rc",
        "name": "power.bombshell.cox_rc",
        "kind": "glow",
        "voice": "glow2",
        "propIn": 5,
        "pitchIn": 3,
        "blades": 2,
        "thrustN": 3.572,
        "rpmNoLoad": 21176.470588235294,
        "pitchSpeedMs": 22.86,
        "idle": 0.37777777777777777,
        "flowFullM3s": 3.516666666666667e-8,
        "leanFrac": 0.05,
        "leanGain": 0.05,
        "massKg": 0.5599,
        "cgShiftM": 0,
        "packs": [
          {
            "id": "8.4cc",
            "cc": 8.4,
            "m3": 0.0000084,
            "massKg": 0.007350000000000001,
            "source": "https://coxengines.ca/public/files/049%20Texaco.pdf"
          },
          {
            "id": "5.1cc",
            "cc": 5.1,
            "m3": 0.0000051,
            "massKg": 0.0044624999999999995,
            "source": "https://www.antiquemodeler.org/images/Rulebook/2025%20Final%20-%20Jan%2017%202025.pdf"
          }
        ],
        "pack": "8.4cc",
        "source": [
          "https://www.coxengines.ca/public/files/review.pdf",
          "https://www.apcprop.com/files/PER3_5x3.dat",
          "https://api.drum.lib.umd.edu/server/api/core/bitstreams/3ae6ca8c-b068-4d07-90dc-7f5bf6a95b3c/content"
        ]
      },
      {
        "id": "electric",
        "name": "power.bombshell.electric",
        "kind": "electric",
        "voice": "wing",
        "kv": 1220,
        "propIn": 8,
        "pitchIn": 4,
        "blades": 2,
        "thrustN": 10.039,
        "currentA": 17.05,
        "rpmNoLoad": 14511.764705882353,
        "pitchSpeedMs": 20.887266666666665,
        "lvcV": 3,
        "massKg": 0.61943708028125,
        "cgShiftM": 0,
        "packs": [
          {
            "id": "3s850",
            "cells": 3,
            "mAh": 850,
            "massKg": null,
            "source": "https://bmjrmodels.com/product/buzzard-bombshell/"
          }
        ],
        "pack": "3s850",
        "source": [
          "https://bmjrmodels.com/product/buzzard-bombshell/",
          "https://web.archive.org/web/2023id_/https://www.maxxprod.com/pdf/HC2816-xxxx.pdf",
          "https://www.apcprop.com/files/PER3_8x4E.dat"
        ]
      }
    ],
    "estimates": {
      "stock": {
        "8.4cc": {
          "topSpeed": 11.84,
          "minutes": 6.5
        },
        "5.1cc": {
          "topSpeed": 11.84,
          "minutes": 4
        }
      },
      "cox-rc": {
        "8.4cc": {
          "topSpeed": 16.67,
          "minutes": 7.4
        },
        "5.1cc": {
          "topSpeed": 16.67,
          "minutes": 4.6
        }
      },
      "electric": {
        "3s850": {
          "topSpeed": 23.45,
          "minutes": 53.8
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
        "id": "6x4",
        "name": "parts.prop.6x4",
        "apc": "6x4",
        "propIn": 6,
        "pitchIn": 4,
        "blades": 2,
        "massKg": 0.0051029141625000005,
        "source": [
          "https://www.apcprop.com/product/6x4/",
          "https://www.apcprop.com/files/PER3_6x4.dat"
        ]
      },
      {
        "id": "7x3",
        "name": "parts.prop.7x3",
        "apc": "7x3",
        "propIn": 7,
        "pitchIn": 3,
        "blades": 2,
        "massKg": 0.011906799712500001,
        "source": [
          "https://www.apcprop.com/product/7x3/",
          "https://www.apcprop.com/files/PER3_7x3.dat"
        ]
      }
    ],
    "anchors": {
      "prop": [
        0.166,
        0,
        -0.005
      ],
      "belly": [
        0.02,
        0,
        -0.064
      ],
      "tail": [
        -0.6,
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
          0.042,
          0.17,
          0.075
        ],
        [
          0.042,
          0.5,
          0.146
        ]
      ]
    }
  },
  "livery": {
    "regions": [
      {
        "id": "wing",
        "stock": "#c8161a"
      },
      {
        "id": "fuselage",
        "stock": "#17171a"
      },
      {
        "id": "tail",
        "stock": "#17171a"
      },
      {
        "id": "swoop",
        "stock": "#c8161a"
      }
    ],
    "schemes": [
      {
        "id": "stock",
        "source": {
          "label": "BMJR Models, Buzzard Bombshell",
          "url": "https://bmjrmodels.com/product/buzzard-bombshell/"
        },
        "colours": {}
      },
      {
        "id": "baby",
        "source": {
          "label": "Outerzone oz2180, Baby Bombshell, Flying Models 1992",
          "url": "https://outerzone.co.uk/plan_details.asp?ID=2180"
        },
        "colours": {
          "wing": "#f0db2c",
          "fuselage": "#0e65ba",
          "tail": "#032257",
          "swoop": "#b11b24"
        }
      },
      {
        "id": "kittur",
        "source": {
          "label": "Outerzone oz5360, a builder's Bombshell",
          "url": "https://outerzone.co.uk/plan_details.asp?ID=5360"
        },
        "colours": {
          "wing": "#f2f2f2",
          "fuselage": "#d1dae2",
          "tail": "#f2f2f2",
          "swoop": "#032257"
        }
      },
      {
        "id": "class_a",
        "source": {
          "label": "Outerzone oz6289, a Class A Baby Bombshell",
          "url": "https://outerzone.co.uk/plan_details.asp?ID=6289"
        },
        "colours": {
          "wing": "#ca8462",
          "fuselage": "#c98d64",
          "tail": "#f2f2f2",
          "swoop": "#4e4653"
        }
      }
    ]
  },
  "tunes": [
    {
      "id": "bombshell-manual",
      "airframe": "bombshell1118",
      "name": "Manual",
      "note": "No flight controller. The roll and yaw sticks both work the rudder and the pitch stick the elevator; the tail skid does not steer. Let go and the polyhedral levels the wings. Throttle closed, the engine idles."
    },
    {
      "id": "bombshell-as3x",
      "airframe": "bombshell1118",
      "name": "AS3X",
      "note": "A Spektrum AS3X receiver fitted in place of a plain one: the sticks are the elevator and the rudder; in pitch and yaw, centred, the gyro holds the attitude you left it in, against the gusts; held, it turns at the rate you ask; past 40 percent stick it lets go, so full stick is full throw. Nothing levels it and nothing caps a rate. Throttle closed, the engine idles.",
      "wingStab": 3
    },
    {
      "id": "bombshell-stab",
      "airframe": "bombshell1118",
      "name": "Stabilised",
      "note": "A gyro holds the plane once it is off the ground. Roll stick asks for a bank up to 45 degrees, flown on the rudder, pitch stick for a pitch up to 12, and centred sticks fly level.",
      "wingStab": 1
    }
  ],
  "progress": {
    "level": 4
  },
  "strings": {
    "en": {
      "carousel.note.bombshell1118": "A 1940 free flight classic in balsa and tissue, on a glow engine.",
      "power.bombshell.cox_rc": "Cox RC .049 with its own throttle, 5 x 3",
      "power.bombshell.electric": "BMJR's electric: Himax 2816 1220 kV, 3S 850",
      "power.bombshell.stock": "Cox Texaco .049 two stroke, 7 x 3.5 (stock)",
      "airframe.blurb.bombshell1118": "A 44 in BMJR Buzzard Bombshell, the 1940 free flight classic in balsa and red tissue, on a Cox .049 glow engine: rudder, elevator and throttle, no ailerons. The roll stick works the rudder, it levels itself when you let go, and it climbs in thermals.",
      "livery.scheme.bombshell1118.stock": "BMJR red and black",
      "livery.scheme.bombshell1118.baby": "Baby Bombshell, 1992",
      "livery.scheme.bombshell1118.kittur": "White and blue",
      "livery.scheme.bombshell1118.class_a": "Salmon and tan"
    },
    "es": {
      "carousel.note.bombshell1118": "Un clásico de vuelo libre de 1940 en balsa y papel, con motor glow.",
      "power.bombshell.cox_rc": "Cox RC .049 con su propio acelerador, 5 x 3",
      "power.bombshell.electric": "El eléctrico de BMJR: Himax 2816 1220 kV, 3S 850",
      "power.bombshell.stock": "Cox Texaco .049 de dos tiempos, 7 x 3,5 (de serie)",
      "airframe.blurb.bombshell1118": "Un BMJR Buzzard Bombshell de 44 pulgadas, el clásico de vuelo libre de 1940 en balsa y papel rojo, con un motor glow Cox .049: timón de dirección, profundidad y acelerador, sin alerones. El stick de alabeo mueve el timón, se nivela solo cuando lo sueltas y sube en las térmicas.",
      "livery.scheme.bombshell1118.stock": "BMJR rojo y negro",
      "livery.scheme.bombshell1118.baby": "Baby Bombshell, 1992",
      "livery.scheme.bombshell1118.kittur": "Blanco y azul",
      "livery.scheme.bombshell1118.class_a": "Salmón y canela"
    }
  }
};
