/*
 * aircraft/bramor2300/aircraft.js: the Bramor C4EYE as data, one
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
  "id": "bramor2300",
  "airframe": {
    "id": "bramor2300",
    "simId": 8,
    "fixedWing": true,
    "stall": 13,
    "topSpeed": 28.48,
    "catapult": {
      "speed": 17,
      "pitchDeg": 20,
      "railLength": 3.1,
      "height": 1.17
    },
    "chute": true,
    "name": "Bramor C4EYE",
    "short": "Bramor",
    "blurb": "A 2.3 m C-Astral Bramor C4EYE on 6S, a survey flying wing with a camera ball in its nose. Catapult it off the rail, fly it long, bring it down under its parachute.",
    "facts": [
      "6S",
      "2300 mm",
      "Catapult"
    ],
    "sizeMm": 2300,
    "grams": 4500,
    "trackClass": "wing",
    "class": "wing",
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
    "defaultTune": "wing-stab",
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
      "propR": 0.1524,
      "hullR": 1.15,
      "vHalfDown": 0.065,
      "vHalfUp": 0.25,
      "bodyLength": 0.96,
      "bodyWidth": 2.3,
      "bodyHeight": 0.315
    }
  },
  "kit": {
    "slots": [
      {
        "id": "winglets",
        "options": [
          "stock",
          "raked",
          "split"
        ]
      }
    ],
    "drawn": true
  },
  "tuning": {
    "chord": 0.257,
    "area": 0.591,
    "margin": 0.088,
    "cg": {
      "mm": null,
      "datum": "tuning.datum.stock",
      "range": null,
      "source": "C-Astral publishes no CG and no throws; the plant's 7 percent static margin is ESTIMATED (docs/BRAMOR-STAGE1.md)"
    },
    "packKg": 1.3,
    "nose": 0.39,
    "tail": -0.35,
    "elevons": true,
    "throws": {
      "high": [
        10,
        6,
        0
      ],
      "low": [
        7,
        4.2,
        0
      ],
      "source": "high: the plant's, docs/BRAMOR-STAGE1.md; low: 70 percent of high, the low rate the Timber, Radian and Radian Pro manuals state"
    },
    "flaps": null
  },
  "power": {
    "table": {
      "simId": 8,
      "massKg": 4.5,
      "cells": 6,
      "rCell": 0.01,
      "propIn": 12,
      "cruiseMs": 16,
      "flightTime": {
        "kind": "cruise",
        "minutesLow": 180,
        "minutesHigh": 180,
        "end": "cut",
        "note": "C-Astral, 'up to 3 h' at 16 m/s on LiPo; the pack's capacity is derived from it, so this is a consistency check",
        "source": "https://www.c-astral.com/en/unmanned-systems/bramor-c4eye"
      }
    },
    "options": [
      {
        "id": "stock",
        "name": "power.bramor.stock",
        "kind": "electric",
        "voice": "wing",
        "kv": 470,
        "propIn": 12,
        "pitchIn": 8,
        "blades": 2,
        "thrustN": 22.9,
        "currentA": 19.08,
        "rpmNoLoad": 10434,
        "pitchSpeedMs": 30.036,
        "lvcV": 0,
        "massKg": 4.5,
        "cgShiftM": 0,
        "packs": [
          {
            "id": "6s10000",
            "cells": 6,
            "mAh": 10000,
            "massKg": null,
            "source": "https://www.c-astral.com/en/unmanned-systems/bramor-c4eye"
          }
        ],
        "pack": "6s10000",
        "source": [
          "https://www.c-astral.com/en/unmanned-systems/bramor-c4eye",
          "https://www.c-astral.com/media/uploads/fm/catalogue/c-astral_katalog2019-spread.pdf"
        ]
      },
      {
        "id": "500kv",
        "name": "power.bramor.500kv",
        "kind": "electric",
        "voice": "wing",
        "kv": 500,
        "propIn": 12,
        "pitchIn": 8,
        "blades": 2,
        "thrustN": 25.916704391127205,
        "currentA": 22.97178852470069,
        "rpmNoLoad": 11100,
        "pitchSpeedMs": 31.953191489361704,
        "lvcV": 0,
        "massKg": 4.54,
        "cgShiftM": -0.003083700440528634,
        "packs": [
          {
            "id": "6s10000",
            "cells": 6,
            "mAh": 10000,
            "massKg": null,
            "source": "https://www.c-astral.com/en/unmanned-systems/bramor-c4eye"
          }
        ],
        "pack": "6s10000",
        "source": [
          "https://www.c-astral.com/en/unmanned-systems/bramor-c4eye"
        ]
      }
    ],
    "estimates": {
      "stock": {
        "6s10000": {
          "topSpeed": 28.35,
          "minutes": 182.5
        }
      },
      "500kv": {
        "6s10000": {
          "topSpeed": 30.07,
          "minutes": 180.1
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
        -0.35,
        0,
        0.087
      ],
      "belly": [
        0,
        0,
        -0.044
      ],
      "tail": [
        -0.19,
        0,
        0
      ],
      "tank": [
        -0.01,
        0,
        0
      ],
      "led": [
        [
          0.008,
          0.35,
          -0.004
        ],
        [
          -0.276,
          1.03,
          0.004
        ]
      ]
    }
  },
  "livery": {
    "regions": [
      {
        "id": "airframe",
        "stock": "#a9b5c1"
      }
    ],
    "schemes": [
      {
        "id": "stock",
        "source": {
          "label": "C-Astral, Bramor C4EYE",
          "url": "https://www.c-astral.com/en/unmanned-systems/bramor-c4eye"
        },
        "colours": {}
      },
      {
        "id": "ppx",
        "source": {
          "label": "C-Astral, Bramor ppX",
          "url": "https://www.c-astral.com/en/unmanned-systems/bramor-ppx"
        },
        "colours": {
          "airframe": "#dfdcd8"
        }
      },
      {
        "id": "hivis",
        "source": {
          "label": "C-Astral, Bramor ppX high visibility option",
          "url": "https://www.c-astral.com/en/unmanned-systems/bramor-ppx"
        },
        "colours": {
          "airframe": "#e73f0e"
        }
      }
    ]
  },
  "tunes": [
    {
      "id": "wing-stab",
      "airframe": "bramor2300",
      "name": "Stabilised",
      "note": "A gyro holds the wing, as its autopilot does. Roll stick asks for a bank up to 45 degrees, pitch stick for a pitch up to 20, and centred sticks fly level.",
      "wingStab": 1
    },
    {
      "id": "wing-manual",
      "airframe": "bramor2300",
      "name": "Manual",
      "note": "No flight controller. The sticks are the elevons: 6 degrees of pitch and 10 of roll at full stick, with a little expo."
    }
  ],
  "progress": {
    "level": 6
  },
  "strings": {
    "en": {
      "carousel.note.bramor2300": "A survey flying wing. Off the catapult, home under its parachute.",
      "power.bramor.stock": "Brushless pusher, 6S (stock)",
      "power.bramor.500kv": "Uprated 500 kV pusher, 6S",
      "airframe.blurb.bramor2300": "A 2.3 m C-Astral Bramor C4EYE on 6S, a survey flying wing with a camera ball in its nose. Catapult it off the rail, fly it long, bring it down under its parachute.",
      "livery.scheme.bramor2300.stock": "C-Astral grey",
      "livery.scheme.bramor2300.ppx": "ppX white",
      "livery.scheme.bramor2300.hivis": "ppX high visibility",
      "parts.prop_only.bramor2300": "C-Astral publishes no prop for the Bramor, so it keeps the one it has."
    },
    "es": {
      "carousel.note.bramor2300": "Un ala volante de topografía. Sale de la catapulta y vuelve bajo su paracaídas.",
      "power.bramor.stock": "Brushless propulsor, 6S (de serie)",
      "power.bramor.500kv": "Propulsor reforzado de 500 kV, 6S",
      "airframe.blurb.bramor2300": "Un C-Astral Bramor C4EYE de 2,3 m en 6S, un ala volante de relevamiento con una bola de cámara en la nariz. Catapúltalo desde el riel, vuélalo lejos y bájalo con su paracaídas.",
      "livery.scheme.bramor2300.stock": "Gris C-Astral",
      "livery.scheme.bramor2300.ppx": "ppX blanco",
      "livery.scheme.bramor2300.hivis": "ppX alta visibilidad",
      "parts.prop_only.bramor2300": "C-Astral no publica ninguna hélice para el Bramor, así que se queda con la suya."
    }
  }
};
