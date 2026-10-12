/*
 * aircraft/tigermoth1803/aircraft.js: the Tiger Moth as data, one
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
  "id": "tigermoth1803",
  "airframe": {
    "id": "tigermoth1803",
    "simId": 23,
    "fixedWing": true,
    "voice": "glow2",
    "stall": 9.47,
    "topSpeed": 23.24,
    "gear": {
      "restHeight": 0.2654,
      "restPitchDeg": 8.16
    },
    "name": "Tiger Moth",
    "short": "Tiger",
    "blurb": "Great Planes' Tiger Moth, 71 in of scale de Havilland DH.82A biplane in Cub Yellow with a black cowl, on an O.S. .61 two stroke. The trainer of the 1930s: slow and gentle, its top wing stalls first and the nose drops, but its ailerons on the bottom wing yaw it the wrong way, and every turn wants the rudder with them.",
    "facts": [
      "Biplane",
      "1803 mm",
      "Two stroke .61"
    ],
    "sizeMm": 1803,
    "grams": 4649.3,
    "trackClass": "wing",
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
    "defaultTune": "tigermoth-manual",
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
      "hullR": 1.0696,
      "vHalfDown": 0.2921,
      "vHalfUp": 0.2771,
      "bodyLength": 1.4706,
      "bodyWidth": 1.8034,
      "bodyHeight": 0.5692
    }
  },
  "kit": {
    "slots": [
      {
        "id": "spinner",
        "options": [
          "stock",
          "twotone",
          "striped"
        ]
      },
      {
        "id": "exhausts",
        "options": [
          "stock",
          "stacks"
        ]
      },
      {
        "id": "wheels",
        "options": [
          "stock",
          "covered"
        ]
      }
    ],
    "drawn": true
  },
  "tuning": {
    "chord": 0.2683,
    "area": 0.87742,
    "margin": 0.038,
    "cg": {
      "mm": 70,
      "datum": "tuning.datum.bottom_le",
      "range": [
        64,
        76
      ],
      "source": "Great Planes manual p. 21, \"measure back 2-3/4\" [70mm]\" on the top of the bottom wing next to the fuselage, and \"up to 2-1/2\" [64mm] back from the leading edge or 3\" [76mm]\"; https://manuals.hobbico.com/gpm/gpma1330-manual-v1_2.pdf"
    },
    "packKg": 0.1,
    "nose": 0.205,
    "tail": -1.035,
    "throws": {
      "high": [
        16.5003,
        12.1141,
        14.5859
      ],
      "low": [
        10.91,
        9.06,
        14.59
      ],
      "source": "Great Planes manual p. 21, at the widest part of each surface: high rate ailerons 3/4 in, elevator 1 in and rudder 2 in each way, low rate 1/2, 3/4 and 2 in, on the 67 mm aileron, the 121 mm elevator and the 202 mm rudder (docs/TIGERMOTH-STAGE1.md); https://manuals.hobbico.com/gpm/gpma1330-manual-v1_2.pdf"
    },
    "flaps": null
  },
  "power": {
    "table": {
      "simId": 23,
      "massKg": 4.6493,
      "cells": 2,
      "rCell": 0.03,
      "propIn": 12,
      "cruiseMs": 14.41,
      "flightTime": null
    },
    "options": [
      {
        "id": "stock",
        "name": "power.tigermoth.stock",
        "kind": "glow",
        "voice": "glow2",
        "propIn": 12,
        "pitchIn": 6,
        "blades": 2,
        "thrustN": 36.206,
        "rpmNoLoad": 12817.6,
        "pitchSpeedMs": 27.673,
        "idle": 0.1836,
        "flowFullM3s": 4.5666666666666665e-7,
        "leanFrac": 0.05,
        "leanGain": 0.05,
        "massKg": 4.6493,
        "cgShiftM": 0,
        "packs": [
          {
            "id": "355cc",
            "cc": 355,
            "m3": 0.000355,
            "massKg": 0.310625,
            "source": "https://manuals.hobbico.com/gpm/gpma1330-manual-v1_2.pdf"
          }
        ],
        "pack": "355cc",
        "source": [
          "https://manuals.hobbico.com/gpm/gpma1330-manual-v1_2.pdf",
          "https://www.os-engines.co.jp/english/line_up/engine/air/aircraft/manual/50sx_40-91fx.pdf",
          "https://www.rcuniverse.com/forum/glow-engines-114/6767782-o-s-61-fx-engines.html",
          "https://www.apcprop.com/files/PER3_12x6.dat",
          "https://api.drum.lib.umd.edu/server/api/core/bitstreams/3ae6ca8c-b068-4d07-90dc-7f5bf6a95b3c/content"
        ]
      },
      {
        "id": "fs91",
        "name": "power.tigermoth.fs91",
        "kind": "glow",
        "voice": "glow4",
        "propIn": 14,
        "pitchIn": 7,
        "blades": 2,
        "thrustN": 36.169,
        "rpmNoLoad": 9616.470588235294,
        "pitchSpeedMs": 24.222286666666665,
        "idle": 0.24467824810374358,
        "flowFullM3s": 4.947178789938817e-7,
        "leanFrac": 0.05,
        "leanGain": 0.05,
        "massKg": 4.7393,
        "cgShiftM": 0,
        "packs": [
          {
            "id": "355cc",
            "cc": 355,
            "m3": 0.000355,
            "massKg": 0.310625,
            "source": "https://manuals.hobbico.com/gpm/gpma1330-manual-v1_2.pdf"
          }
        ],
        "pack": "355cc",
        "source": [
          "https://manuals.hobbico.com/gpm/gpma1330-manual-v1_2.pdf",
          "https://www.os-engines.co.jp/english/line_up/engine/air/single/manual/fs70-91s2_series.pdf",
          "https://www.apcprop.com/files/PER3_14x7.dat"
        ]
      }
    ],
    "estimates": {
      "stock": {
        "355cc": {
          "topSpeed": 23.13,
          "minutes": 19.9
        }
      },
      "fs91": {
        "355cc": {
          "topSpeed": 21.69,
          "minutes": 17.2
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
        "id": "13x6",
        "name": "parts.prop.13x6",
        "apc": "13x6",
        "propIn": 13,
        "pitchIn": 6,
        "blades": 2,
        "massKg": 0.04791069408125,
        "source": [
          "https://www.apcprop.com/product/13x6/",
          "https://www.apcprop.com/files/PER3_13x6.dat"
        ]
      },
      {
        "id": "12x8",
        "name": "parts.prop.12x8",
        "apc": "12x8",
        "propIn": 12,
        "pitchIn": 8,
        "blades": 2,
        "massKg": 0.04791069408125,
        "source": [
          "https://www.apcprop.com/product/12x8/",
          "https://www.apcprop.com/files/PER3_12x8.dat"
        ]
      }
    ],
    "anchors": {
      "prop": [
        0.3808,
        0,
        0.0074
      ],
      "belly": [
        0,
        0,
        -0.122
      ],
      "tail": [
        -1.035,
        0,
        -0.073
      ],
      "tank": [
        -0.01,
        0,
        -0.04
      ],
      "led": [
        [
          0.17,
          0.15,
          0.215
        ],
        [
          0.12,
          0.8,
          0.245
        ]
      ]
    }
  },
  "livery": {
    "regions": [
      {
        "id": "wing",
        "stock": "#f5b21c"
      },
      {
        "id": "fuselage",
        "stock": "#f5b21c"
      },
      {
        "id": "tail",
        "stock": "#f5b21c"
      },
      {
        "id": "cowl",
        "stock": "#17181a"
      },
      {
        "id": "bands",
        "stock": "#f5b21c"
      },
      {
        "id": "trim",
        "stock": "#17181a"
      }
    ],
    "schemes": [
      {
        "id": "stock",
        "source": {
          "label": "Great Planes, Tiger Moth ARF GPMA1330 instruction manual",
          "url": "https://manuals.hobbico.com/gpm/gpma1330-manual-v1_2.pdf"
        },
        "colours": {}
      },
      {
        "id": "raf_silver",
        "source": {
          "label": "RAF Museum, Training Aircraft Colour Schemes",
          "url": "https://www.rafmuseum.org.uk/research/online-exhibitions/taking-flight/training-aircraft-colour-schemes/"
        },
        "colours": {
          "wing": "#c9ccce",
          "fuselage": "#c9ccce",
          "tail": "#c9ccce",
          "cowl": "#b7babd",
          "bands": "#f2c200",
          "trim": "#17181a"
        }
      }
    ]
  },
  "tunes": [
    {
      "id": "tigermoth-manual",
      "airframe": "tigermoth1803",
      "name": "Manual",
      "note": "No flight controller. The sticks are the ailerons on the bottom wing, the elevator and the rudder, which also turns the tail wheel, at Great Planes' throws. Roll into a turn on the ailerons alone and the nose swings the other way first: feed in rudder with them. Pull it into the stall and the nose drops. Throttle closed, the two stroke idles."
    },
    {
      "id": "tigermoth-as3x",
      "airframe": "tigermoth1803",
      "name": "AS3X",
      "note": "A Spektrum AS3X receiver fitted in place of a plain one, which any plane can carry: the sticks are the surfaces; centred, the gyro holds the attitude you left it in, against the gusts; held, it turns at the rate you ask; past 40 percent stick it lets go, so full stick is full throw. Nothing levels it and nothing caps a rate. The adverse yaw is still yours to feed rudder against.",
      "wingStab": 3
    },
    {
      "id": "tigermoth-stab",
      "airframe": "tigermoth1803",
      "name": "Stabilised",
      "note": "A gyro holds the plane once it is off the ground. Roll stick asks for a bank up to 60 degrees, pitch stick for a pitch up to 30, centred sticks fly level, and the rudder is coordinated for you, which on a Tiger Moth is most of flying it. Throttle closed, it lowers the nose onto its glide.",
      "wingStab": 1
    }
  ],
  "progress": {
    "level": 4
  },
  "strings": {
    "en": {
      "carousel.note.tigermoth1803": "The de Havilland trainer of the 1930s as a scale biplane. Slow and gentle, but its ailerons yaw it the wrong way: fly it on the rudder.",
      "power.tigermoth.stock": "O.S. 61FX two stroke, 12 x 6 (stock)",
      "power.tigermoth.fs91": "O.S. FS-91 II Surpass four stroke, 14 x 7",
      "airframe.blurb.tigermoth1803": "Great Planes' Tiger Moth, 71 in of scale de Havilland DH.82A biplane in Cub Yellow with a black cowl, on an O.S. .61 two stroke. The trainer of the 1930s: slow and gentle, its top wing stalls first and the nose drops, but its ailerons on the bottom wing yaw it the wrong way, and every turn wants the rudder with them.",
      "livery.scheme.tigermoth1803.stock": "Great Planes Cub Yellow, black cowl",
      "livery.scheme.tigermoth1803.raf_silver": "RAF post war silver, yellow trainer bands"
    },
    "es": {
      "carousel.note.tigermoth1803": "El entrenador de de Havilland de los años 30, un biplano a escala. Lento y noble, pero sus alerones lo guiñan al revés: vuélalo con el timón de dirección.",
      "power.tigermoth.stock": "O.S. 61FX de dos tiempos, 12 x 6 (de serie)",
      "power.tigermoth.fs91": "O.S. FS-91 II Surpass de cuatro tiempos, 14 x 7",
      "airframe.blurb.tigermoth1803": "El Tiger Moth de Great Planes, 71 pulgadas de biplano de Havilland DH.82A a escala en amarillo Cub con capó negro, con un dos tiempos O.S. .61. El entrenador de los años treinta: lento y noble, su ala de arriba entra en pérdida primero y la nariz cae, pero sus alerones en el ala de abajo lo guiñan hacia el lado contrario, y cada viraje pide el timón con ellos.",
      "livery.scheme.tigermoth1803.stock": "Amarillo Cub de Great Planes, capó negro",
      "livery.scheme.tigermoth1803.raf_silver": "Plata de la RAF de posguerra, bandas amarillas de entrenador"
    }
  }
};
