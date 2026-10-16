/*
 * aircraft/f16878/aircraft.js: the F-16 Falcon as data, one aircraft's
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
  "id": "f16878",
  "airframe": {
    "id": "f16878",
    "simId": 16,
    "fixedWing": true,
    "retracts": true,
    "voice": "edf",
    "stall": 11.98,
    "topSpeed": 45.83,
    "gear": {
      "restHeight": 0.14,
      "restPitchDeg": 0
    },
    "name": "F-16 Falcon",
    "short": "F-16",
    "blurb": "An 878 mm Freewing F-16 Fighting Falcon on a 70 mm ducted fan and 6S: ailerons, all moving stabilators, a rudder and a steerable nose wheel. The fan takes a moment to spool and its thrust falls away with speed, so it keeps its energy and wants a long, planned approach. G raises and lowers the retracts.",
    "facts": [
      "70 mm EDF",
      "878 mm",
      "6S"
    ],
    "sizeMm": 878,
    "grams": 2116,
    "trackClass": "wing",
    "class": "plane",
    "roles": [],
    "cells": 6,
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
    "defaultTune": "f16-acro",
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
      "propR": 0.0345,
      "hullR": 0.71,
      "vHalfDown": 0.14,
      "vHalfUp": 0.265,
      "bodyLength": 1.306,
      "bodyWidth": 0.878,
      "bodyHeight": 0.405
    }
  },
  "kit": {
    "slots": [
      {
        "id": "nose",
        "options": [
          "stock",
          "radome"
        ]
      },
      {
        "id": "fincap",
        "options": [
          "stock",
          "chute"
        ]
      },
      {
        "id": "exhaust",
        "options": [
          "stock",
          "titanium"
        ]
      }
    ],
    "drawn": true
  },
  "tuning": {
    "chord": 0.2856,
    "area": 0.21484,
    "margin": 0.115,
    "cg": {
      "mm": 90,
      "datum": "tuning.datum.root_le",
      "range": null,
      "source": "Freewing V3 manual p. 9, \"90mm (3-1/2\")\" from the wing's leading edge at the root, no range; https://www.freewing-model.com/download/freewing-70mm-f-16-v3-70mm-manual.pdf"
    },
    "packKg": 0.566,
    "nose": 0.6,
    "tail": -0.55,
    "throws": {
      "high": [
        21.5,
        25,
        30
      ],
      "low": [
        13.975,
        20,
        25.5
      ],
      "source": "high: the full size F-16's surface limits (NASA TP-1538), Freewing's high rate, 100 percent; low: the manual's own dual rates p. 11, \"D/R Rate: 65%\", \"80%\", \"85%\" of it; https://www.freewing-model.com/download/freewing-70mm-f-16-v3-70mm-manual.pdf"
    },
    "flaps": null
  },
  "power": {
    "table": {
      "simId": 16,
      "massKg": 2.116,
      "cells": 6,
      "rCell": 0.006,
      "propIn": 2.716535433070866,
      "cruiseMs": 20,
      "flightTime": {
        "kind": "mixed",
        "minutesLow": 4,
        "minutesHigh": 4,
        "note": "Model Aviation's review of the V2 6S Pro on a 6S 4000, flown as a jet is: 'Flight duration: 4 minutes'",
        "source": "https://www.modelaviation.com/freewing-f-16"
      }
    },
    "options": [
      {
        "id": "stock",
        "name": "power.f16.stock",
        "kind": "electric",
        "voice": "edf",
        "kv": 2210,
        "propIn": 2.716535433070866,
        "pitchIn": 0,
        "blades": 12,
        "thrustN": 23.536,
        "currentA": 70,
        "rpmNoLoad": 49062,
        "pitchSpeedMs": 76.87,
        "lvcV": 3.15,
        "fan": {
          "tauS": 0.08,
          "escStartS": 0.3
        },
        "massKg": 2.116,
        "cgShiftM": 0,
        "packs": [
          {
            "id": "6s4000",
            "cells": 6,
            "mAh": 4000,
            "massKg": 0.566,
            "source": "https://motionrc.com/products/admiral-4000mah-6s-22-2v-40c-lipo-battery-with-ec5-connector-epr40006e"
          },
          {
            "id": "6s4500",
            "cells": 6,
            "mAh": 4500,
            "massKg": 0.652,
            "source": "https://motionrc.com/products/admiral-4500mah-6s-22-2v-40c-lipo-battery-with-ec5-connector-epr45006e"
          }
        ],
        "pack": "6s4000",
        "source": [
          "https://www.freewing-model.com/freewing-f-16-falcon-v3-6s-high-performance-70mm-edf-jet-pnp-fj21115p.html",
          "https://www.freewing-model.com/download/freewing-70mm-f-16-v3-70mm-manual.pdf",
          "https://www.rc-castle.com/index.php?route=product/product&product_id=7558",
          "https://ntrs.nasa.gov/api/citations/20230017299/downloads/Weinstein_SciTech2024_Final.pdf"
        ]
      },
      {
        "id": "4s",
        "name": "power.f16.4s",
        "kind": "electric",
        "voice": "edf",
        "kv": 2850,
        "propIn": 2.716535433070866,
        "pitchIn": 0,
        "blades": 12,
        "thrustN": 13.835140755040003,
        "currentA": 47.322283046115004,
        "rpmNoLoad": 37615.8354,
        "pitchSpeedMs": 58.936229000000004,
        "lvcV": 3.15,
        "fan": {
          "tauS": 0.08,
          "escStartS": 0.3
        },
        "massKg": 1.8,
        "cgShiftM": 0,
        "packs": [
          {
            "id": "4s4000",
            "cells": 4,
            "mAh": 4000,
            "massKg": 0.386,
            "source": "https://motionrc.com/products/admiral-4000mah-4s-14-8v-40c-lipo-battery-with-xt60-connector-multi-pack-2-batteries-adm6024-002"
          }
        ],
        "pack": "4s4000",
        "source": [
          "https://freewing-model.com/freewing-f-16-v2-4s-standard-70mm-edf-jet-pnp-rc-airplane.html",
          "https://www.rc-castle.com/index.php?route=product/product&product_id=7558",
          "https://ntrs.nasa.gov/api/citations/20230017299/downloads/Weinstein_SciTech2024_Final.pdf"
        ]
      }
    ],
    "estimates": {
      "stock": {
        "6s4000": {
          "topSpeed": 40.34,
          "minutes": 20.7
        },
        "6s4500": {
          "topSpeed": 40.9,
          "minutes": 22
        }
      },
      "4s": {
        "4s4000": {
          "topSpeed": 32.02,
          "minutes": 17.4
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
        -0.24,
        0,
        0
      ],
      "belly": [
        0,
        0,
        -0.061
      ],
      "tail": [
        -0.59,
        0,
        -0.038
      ],
      "tank": [
        -0.01,
        0,
        -0.02
      ],
      "led": [
        [
          0.08,
          0.13,
          -0.006
        ],
        [
          -0.139,
          0.4,
          -0.006
        ]
      ]
    }
  },
  "livery": {
    "regions": [
      {
        "id": "dark",
        "stock": "#4d5357"
      },
      {
        "id": "medium",
        "stock": "#7f878c"
      },
      {
        "id": "light",
        "stock": "#a9b0b4"
      },
      {
        "id": "canopy",
        "stock": "#8a7440"
      }
    ],
    "schemes": [
      {
        "id": "stock",
        "source": {
          "label": "Freewing F-16 Falcon V3 6S High Performance, FJ21115P",
          "url": "https://www.freewing-model.com/freewing-f-16-falcon-v3-6s-high-performance-70mm-edf-jet-pnp-fj21115p.html"
        },
        "colours": {}
      },
      {
        "id": "arctic",
        "source": {
          "label": "Freewing F-16 V3 Arctic Camo, FJ21125P",
          "url": "https://motionrc.com/products/freewing-f-16-v3-arctic-camo-high-performance-70mm-edf-jet-pnp-fj21125p"
        },
        "colours": {
          "dark": "#3b3f44",
          "medium": "#c9ced2",
          "light": "#eef0f1"
        }
      }
    ]
  },
  "tunes": [
    {
      "id": "f16-manual",
      "airframe": "f16878",
      "name": "Manual",
      "note": "No flight controller. The sticks work the ailerons, the all moving stabilators and the rudder, which also steers the nose wheel. The fan spools behind the throttle stick and stops when it is closed."
    },
    {
      "id": "f16-acro",
      "airframe": "f16878",
      "name": "Acro",
      "note": "A gyro holds the jet where you leave it once it is off the ground. Sticks ask for a roll rate up to 300 degrees a second and a pitch rate up to 120, and centred sticks hold the attitude, inverted too.",
      "wingStab": 2
    },
    {
      "id": "f16-stab",
      "airframe": "f16878",
      "name": "Stabilised",
      "note": "A gyro holds the jet once it is off the ground. Roll stick asks for a bank up to 60 degrees, pitch stick for a pitch up to 30, and centred sticks fly level. Throttle closed, it lowers the nose onto its glide. The fan still takes a moment to spool.",
      "wingStab": 1
    }
  ],
  "progress": {
    "level": 11
  },
  "strings": {
    "en": {
      "carousel.note.f16878": "A 70 mm ducted fan jet. The fan spools behind the stick and it keeps its speed: plan the approach.",
      "power.f16.stock": "Freewing 70 mm 12 blade fan, 2957 2210 kV, 6S (stock)",
      "power.f16.4s": "Freewing 70 mm 12 blade fan, 2849 2850 kV, 4S (the Standard)",
      "airframe.blurb.f16878": "An 878 mm Freewing F-16 Fighting Falcon on a 70 mm ducted fan and 6S: ailerons, all moving stabilators, a rudder and a steerable nose wheel. The fan takes a moment to spool and its thrust falls away with speed, so it keeps its energy and wants a long, planned approach. G raises and lowers the retracts.",
      "livery.scheme.f16878.stock": "Three tone gray, Freewing",
      "livery.scheme.f16878.arctic": "Arctic camo, Freewing"
    },
    "es": {
      "carousel.note.f16878": "Un reactor de turbina eléctrica de 70 mm. La turbina tarda en acelerar y el avión conserva su velocidad: planifica la aproximación.",
      "power.f16.stock": "Turbina Freewing de 70 mm y 12 palas, 2957 2210 kV, 6S (de serie)",
      "power.f16.4s": "Turbina Freewing de 70 mm y 12 palas, 2849 2850 kV, 4S (la Standard)",
      "airframe.blurb.f16878": "Un Freewing F-16 Fighting Falcon de 878 mm con turbina eléctrica de 70 mm y 6S: alerones, estabilizadores de una pieza, timón y rueda de nariz orientable. La turbina tarda un momento en acelerar y su empuje cae con la velocidad, así que conserva su energía y pide una aproximación larga y planeada. G sube y baja el tren retráctil.",
      "livery.scheme.f16878.stock": "Gris de tres tonos, Freewing",
      "livery.scheme.f16878.arctic": "Camuflaje ártico, Freewing"
    }
  }
};
