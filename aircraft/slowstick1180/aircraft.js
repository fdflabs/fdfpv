/*
 * aircraft/slowstick1180/aircraft.js: the Slow Stick as data, one
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
  "id": "slowstick1180",
  "airframe": {
    "id": "slowstick1180",
    "simId": 5,
    "fixedWing": true,
    "stall": 4.43,
    "topSpeed": 10.28,
    "gear": {
      "restHeight": 0.1349,
      "restPitchDeg": 6.91
    },
    "name": "Slow Stick",
    "short": "Stick",
    "blurb": "A 1176 mm GWS Slow Stick on 2S: rudder, elevator and throttle, no ailerons. The roll stick works the rudder, it floats at a jog, and it levels itself when you let go.",
    "facts": [
      "2S",
      "1176 mm",
      "Three channels"
    ],
    "sizeMm": 1176,
    "grams": 420,
    "trackClass": "wing",
    "class": "plane",
    "roles": [],
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
    "defaultTune": "slowstick-acro",
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
      "hullR": 0.6391,
      "vHalfDown": 0.1575,
      "vHalfUp": 0.1975,
      "bodyLength": 0.952,
      "bodyWidth": 1.176,
      "bodyHeight": 0.355
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
          "tundra"
        ]
      }
    ],
    "drawn": true
  },
  "tuning": {
    "chord": 0.2776,
    "area": 0.3264,
    "margin": 0.073,
    "cg": {
      "mm": 100,
      "datum": "tuning.datum.le",
      "range": [
        95,
        105
      ],
      "source": "GWS manual, \"95-105mm (3.74\"-4.13\") from the leading edge of wing at central wing chord\"; http://www.store.gwsus.com/wp-content/uploads/download/manual/AirPlanes_Manual_GWSSLOWSTICK.pdf"
    },
    "packKg": 0.1,
    "nose": 0.286,
    "tail": -0.5,
    "throws": {
      "high": [
        0,
        15,
        30
      ],
      "low": [
        0,
        10.5,
        21
      ],
      "source": "GWS manual: elevator 15 to 20 deg, rudder 25 to 35 deg, \"Maximum control throws\", one set; low: 70 percent of high, the low rate the Timber, Radian and Radian Pro manuals state; http://www.store.gwsus.com/wp-content/uploads/download/manual/AirPlanes_Manual_GWSSLOWSTICK.pdf"
    },
    "flaps": null
  },
  "power": {
    "table": {
      "simId": 5,
      "massKg": 0.42,
      "cells": 2,
      "rCell": 0.03,
      "propIn": 11,
      "cruiseMs": 5.5,
      "flightTime": null
    },
    "options": [
      {
        "id": "stock",
        "name": "power.slowstick.stock",
        "kind": "electric",
        "voice": "wing",
        "kv": 0,
        "propIn": 11,
        "pitchIn": 8,
        "blades": 2,
        "thrustN": 2.69,
        "currentA": 6.1,
        "rpmNoLoad": 3882,
        "pitchSpeedMs": 11.175,
        "lvcV": 2.7,
        "massKg": 0.42,
        "cgShiftM": 0,
        "packs": [
          {
            "id": "2s1300",
            "cells": 2,
            "mAh": 1300,
            "massKg": 0.074,
            "source": "https://www.horizonhobby.com/product/x/SPMX133S30.html"
          }
        ],
        "pack": "2s1300",
        "source": [
          "http://www.gwsus.com/english/product/powersystem/004.htm",
          "http://www.gwsus.com/english/product/speedcontroller/009.htm",
          "http://www.gwsus.com/english/service/book/airplane/New_SlowStick_Manual.rar"
        ]
      },
      {
        "id": "2212-1047",
        "name": "power.slowstick.2212_1047",
        "kind": "electric",
        "voice": "wing",
        "kv": 1030,
        "propIn": 10,
        "pitchIn": 4.7,
        "blades": 2,
        "thrustN": 4.4522191,
        "currentA": 9.2,
        "rpmNoLoad": 5764.705882352941,
        "pitchSpeedMs": 9.749366666666667,
        "lvcV": 3,
        "massKg": 0.414,
        "cgShiftM": 0,
        "packs": [
          {
            "id": "2s1300",
            "cells": 2,
            "mAh": 1300,
            "massKg": 0.074,
            "source": "https://www.horizonhobby.com/product/x/SPMX133S30.html"
          },
          {
            "id": "2s2200",
            "cells": 2,
            "mAh": 2200,
            "massKg": 0.15,
            "source": "https://www.horizonhobby.com/product/x/SPMX223S30.html"
          }
        ],
        "pack": "2s1300",
        "source": [
          "http://www.gwsus.com/images/note%20book/gwblm003-1.jpg",
          "http://www.gwsus.com/english/service/book/airplane/New_SlowStick_Manual.rar"
        ]
      },
      {
        "id": "2212-1060",
        "name": "power.slowstick.2212_1060",
        "kind": "electric",
        "voice": "wing",
        "kv": 1030,
        "propIn": 10,
        "pitchIn": 6,
        "blades": 2,
        "thrustN": 4.10898635,
        "currentA": 7.8,
        "rpmNoLoad": 6470.588235294118,
        "pitchSpeedMs": 13.969999999999999,
        "lvcV": 3,
        "massKg": 0.414,
        "cgShiftM": 0,
        "packs": [
          {
            "id": "2s1300",
            "cells": 2,
            "mAh": 1300,
            "massKg": 0.074,
            "source": "https://www.horizonhobby.com/product/x/SPMX133S30.html"
          },
          {
            "id": "2s2200",
            "cells": 2,
            "mAh": 2200,
            "massKg": 0.15,
            "source": "https://www.horizonhobby.com/product/x/SPMX223S30.html"
          }
        ],
        "pack": "2s1300",
        "source": [
          "http://www.gwsus.com/images/note%20book/gwblm003-1.jpg",
          "http://www.gwsus.com/english/service/book/airplane/New_SlowStick_Manual.rar"
        ]
      },
      {
        "id": "2215-1060-3s",
        "name": "power.slowstick.2215_1060_3s",
        "kind": "electric",
        "voice": "wing",
        "kv": 900,
        "propIn": 10,
        "pitchIn": 6,
        "blades": 2,
        "thrustN": 6.0801229999999995,
        "currentA": 9.6,
        "rpmNoLoad": 8043.2941176470595,
        "pitchSpeedMs": 17.365472,
        "lvcV": 3,
        "massKg": 0.45899999999999996,
        "cgShiftM": 0,
        "packs": [
          {
            "id": "3s1300",
            "cells": 3,
            "mAh": 1300,
            "massKg": 0.111,
            "source": "https://www.horizonhobby.com/product/x/SPMX133S30.html"
          },
          {
            "id": "3s2200",
            "cells": 3,
            "mAh": 2200,
            "massKg": 0.225,
            "source": "https://www.horizonhobby.com/product/x/SPMX223S30.html"
          }
        ],
        "pack": "3s1300",
        "source": [
          "http://www.gwsus.com/english/product/motor/009.htm",
          "http://www.gwsus.com/english/service/book/airplane/New_SlowStick_Manual.rar"
        ]
      }
    ],
    "estimates": {
      "stock": {
        "2s1300": {
          "topSpeed": 11.05,
          "minutes": 59.8
        }
      },
      "2212-1047": {
        "2s1300": {
          "topSpeed": 10.88,
          "minutes": 57.1
        },
        "2s2200": {
          "topSpeed": 11.05,
          "minutes": 75.3
        }
      },
      "2212-1060": {
        "2s1300": {
          "topSpeed": 13.88,
          "minutes": 91.5
        },
        "2s2200": {
          "topSpeed": 14.13,
          "minutes": 120.6
        }
      },
      "2215-1060-3s": {
        "3s1300": {
          "topSpeed": 17.05,
          "minutes": 117.2
        },
        "3s2200": {
          "topSpeed": 17.43,
          "minutes": 142.5
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
        "id": "11x47sf",
        "name": "parts.prop.11x47sf",
        "apc": "11x47SF",
        "propIn": 11,
        "pitchIn": 4.7,
        "blades": 2,
        "massKg": 0.01502524725625,
        "source": [
          "https://www.apcprop.com/product/11x4-7sf/",
          "https://www.apcprop.com/files/PER3_11x47SF.dat"
        ]
      },
      {
        "id": "10x38sf",
        "name": "parts.prop.10x38sf",
        "apc": "10x38SF",
        "propIn": 10,
        "pitchIn": 3.8,
        "blades": 2,
        "massKg": 0.011906799712500001,
        "source": [
          "https://www.apcprop.com/product/10x3-8sf/",
          "https://www.apcprop.com/files/PER3_10x38SF.dat"
        ]
      }
    ],
    "anchors": {
      "prop": [
        0.31,
        0,
        0
      ],
      "belly": [
        0.02,
        0,
        -0.007
      ],
      "tail": [
        -0.56,
        0,
        -0.012
      ],
      "tank": [
        -0.01,
        0,
        -0.01
      ],
      "led": [
        [
          0.08,
          0.18,
          0.064
        ],
        [
          0.08,
          0.41,
          0.114
        ]
      ]
    }
  },
  "livery": {
    "regions": [
      {
        "id": "wing",
        "stock": "#e5402a"
      },
      {
        "id": "tail",
        "stock": "#e5402a"
      },
      {
        "id": "tape",
        "stock": "#f4f1ea"
      }
    ],
    "schemes": [
      {
        "id": "stock",
        "source": null,
        "colours": {}
      }
    ]
  },
  "tunes": [
    {
      "id": "slowstick-manual",
      "airframe": "slowstick1180",
      "name": "Manual",
      "note": "No flight controller. The roll and yaw sticks both work the rudder, which also steers the tailwheel, and the pitch stick the elevator. Let go and the dihedral levels the wings."
    },
    {
      "id": "slowstick-acro",
      "airframe": "slowstick1180",
      "name": "Acro",
      "note": "A gyro holds the plane where you leave it once it is off the ground. Sticks ask for a roll rate, flown on the rudder, and a pitch rate, and centred sticks hold the attitude. It will not roll inverted: a rudder cannot do that.",
      "wingStab": 2
    },
    {
      "id": "slowstick-stab",
      "airframe": "slowstick1180",
      "name": "Stabilised",
      "note": "A gyro holds the plane once it is off the ground. Roll stick asks for a bank up to 45 degrees, flown on the rudder, pitch stick for a pitch up to 25, and centred sticks fly level.",
      "wingStab": 1
    }
  ],
  "progress": {
    "level": null
  },
  "strings": {
    "en": {
      "carousel.note.slowstick1180": "Three channels, no ailerons. It floats at a jog and levels itself.",
      "power.slowstick.2212_1047": "GWS 2212 brushless, 10 x 4.7, 2S",
      "power.slowstick.2212_1060": "GWS 2212 brushless, 10 x 6, 2S",
      "power.slowstick.2215_1060_3s": "GWS 2215 brushless, 10 x 6, 3S",
      "power.slowstick.stock": "GWS EPS-300C geared, 11 x 8, 2S (stock)",
      "airframe.blurb.slowstick1180": "A 1176 mm GWS Slow Stick on 2S: rudder, elevator and throttle, no ailerons. The roll stick works the rudder, it floats at a jog, and it levels itself when you let go.",
      "livery.scheme.slowstick1180.stock": "Red foam"
    },
    "es": {
      "carousel.note.slowstick1180": "Tres canales, sin alerones. Flota al trote y se nivela solo.",
      "power.slowstick.2212_1047": "GWS 2212 brushless, 10 x 4.7, 2S",
      "power.slowstick.2212_1060": "GWS 2212 brushless, 10 x 6, 2S",
      "power.slowstick.2215_1060_3s": "GWS 2215 brushless, 10 x 6, 3S",
      "power.slowstick.stock": "GWS EPS-300C con reductora, 11 x 8, 2S (de serie)",
      "airframe.blurb.slowstick1180": "Un GWS Slow Stick de 1176 mm en 2S: timón de dirección, profundidad y throttle, sin alerones. El stick de roll mueve el timón, flota al paso de un trote y se nivela solo cuando lo sueltas.",
      "livery.scheme.slowstick1180.stock": "Espuma roja"
    }
  }
};
