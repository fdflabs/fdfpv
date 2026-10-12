/*
 * aircraft/slick2680/aircraft.js: the Slick 580 as data, one aircraft's rows
 * for configs/aircraft.js to assemble (docs/AIRCRAFT-FOLDER.md). Plain
 * JSON after `export default`, which scripts/aircraft-folder-selftest.js
 * holds: no expression, no import.
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
  "id": "slick2680",
  "airframe": {
    "id": "slick2680",
    "simId": 33,
    "fixedWing": true,
    "voice": "glow2",
    "stall": 13.88,
    "topSpeed": 42.54,
    "gear": {
      "restHeight": 0.4088,
      "restPitchDeg": 9.36
    },
    "name": "Slick 580",
    "short": "Slick",
    "blurb": "A 2.68 m Extreme Flight Slick 580 on a 120 cc DA-120 petrol twin, 12.5 kg of balsa and carbon in its 10th Anniversary red and white. It hangs on its 28 in prop and torque rolls like the Extra, but with thirty times the Extra's inertia: everything it does it does with momentum. Pull it into the stall at idle and the prop's gyroscope drops the right wing.",
    "facts": [
      "DA-120 petrol",
      "2680 mm",
      "IMAC and 3D"
    ],
    "sizeMm": 2680,
    "grams": 12474,
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
    "defaultTune": "slick-as3x",
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
      "propR": 0.3556,
      "hullR": 1.7277,
      "vHalfDown": 0.44,
      "vHalfUp": 0.505,
      "bodyLength": 2.497,
      "bodyWidth": 2.68,
      "bodyHeight": 0.945
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
    "chord": 0.4577,
    "area": 1.15,
    "margin": 0.185,
    "expo": 55,
    "cg": {
      "mm": 169,
      "datum": "tuning.datum.root_le",
      "range": [
        160,
        179
      ],
      "source": "EF's data sheet, \"Center of main wing tube to rear of main wing tube as starting position\": the 38 mm tube's centre at 28 percent of the drawn 570 mm root, 160 mm, to its rear, 179; the middle taken (docs/SLICK-STAGE1.md); https://extremeflightrc.com/cdn/shop/files/105.5SlickDatatSheet.pdf"
    },
    "packKg": 0.3,
    "nose": 0.48,
    "tail": -1.3,
    "throws": {
      "high": [
        37.5,
        47.5,
        45
      ],
      "low": [
        20,
        11,
        20
      ],
      "source": "EF's data sheet and 120cc build guide, in degrees: aileron 38 up and 37 down high, 20 low; elevator 45 to 50 for 3D, 10 to 12 low; rudder 45 and more high, 20 low; the middles taken (docs/SLICK-STAGE1.md); https://extremeflightrc.com/cdn/shop/files/105.5SlickDatatSheet.pdf"
    },
    "flaps": null
  },
  "power": {
    "table": {
      "simId": 33,
      "massKg": 12.474,
      "cells": 2,
      "rCell": 0.03,
      "propIn": 28,
      "cruiseMs": 22,
      "flightTime": null
    },
    "options": [
      {
        "id": "stock",
        "name": "power.slick.stock",
        "kind": "glow",
        "voice": "glow2",
        "propIn": 28,
        "pitchIn": 10,
        "blades": 2,
        "thrustN": 304.11,
        "rpmNoLoad": 7705.9,
        "pitchSpeedMs": 27.728,
        "idle": 0.1985,
        "flowFullM3s": 0.0000014066666666666668,
        "leanFrac": 0.05,
        "leanGain": 0.05,
        "massKg": 12.474,
        "cgShiftM": 0,
        "packs": [
          {
            "id": "1006cc",
            "cc": 1005.5,
            "m3": 0.0010055,
            "massKg": 0.734015,
            "source": "https://extremeflightrc.com/cdn/shop/files/105.5SlickDatatSheet.pdf"
          }
        ],
        "pack": "1006cc",
        "source": [
          "https://extremeflightrc.com/cdn/shop/files/105.5SlickDatatSheet.pdf",
          "https://www.desertaircraft.com/products/da-120",
          "https://www.falconpropellers.com/wp-content/uploads/2020/04/Falcon-Propeller-Test-Chart.pdf",
          "https://www.apcprop.com/files/PER3_22x8.dat",
          "https://hfe.aero/wp-content/uploads/2025/11/DA120-Data-Sheet.pdf"
        ]
      }
    ],
    "estimates": {
      "stock": {
        "1006cc": {
          "topSpeed": 41.66,
          "minutes": 33.2
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
        0.6093,
        0,
        0.039
      ],
      "belly": [
        0,
        0,
        -0.138
      ],
      "tail": [
        -1.5,
        0,
        0
      ],
      "tank": [
        -0.01,
        0,
        -0.04
      ],
      "led": [
        [
          0.12,
          0.3,
          -0.03
        ],
        [
          0.05,
          1.2,
          -0.01
        ]
      ]
    }
  },
  "livery": {
    "regions": [
      {
        "id": "wing",
        "stock": "#f2f2ef"
      },
      {
        "id": "fuselage",
        "stock": "#f2f2ef"
      },
      {
        "id": "nose",
        "stock": "#c8141c"
      },
      {
        "id": "tail",
        "stock": "#c8141c"
      },
      {
        "id": "trim",
        "stock": "#16181a"
      },
      {
        "id": "rays",
        "stock": "#c8141c"
      }
    ],
    "schemes": [
      {
        "id": "stock",
        "source": {
          "label": "Extreme Flight 100 in Slick 580 EXP V3, Red/White 10th Anniversary, 356RC",
          "url": "https://extremeflightrc.com/products/ef-100-slick-580-exp-v2-red-anniversary-scheme"
        },
        "colours": {}
      },
      {
        "id": "blueorange",
        "source": {
          "label": "Extreme Flight 100 in Slick 580 EXP V3, White/Blue/Orange, 356V3BW; Oracover 10, 60, 53, 52",
          "url": "https://extremeflightrc.com/products/105-5-slick-580-exp-v2-white-blue-orange"
        },
        "colours": {
          "nose": "#f26522",
          "tail": "#3d9ad6",
          "rays": "#f26522",
          "trim": "#1c2a5a"
        }
      },
      {
        "id": "cubyellow",
        "source": {
          "label": "Extreme Flight 100 in Slick 580 EXP V3, Cub Yellow/Red/Grey, 356CYV3; Oracover 30, 23, 11, 71",
          "url": "https://extremeflightrc.com/products/ef-100-slick-580-exp-v3-cub-yellow-red-grey"
        },
        "colours": {
          "wing": "#f8c300",
          "fuselage": "#f8c300",
          "nose": "#c1121f",
          "tail": "#c1121f",
          "rays": "#b9bbbc"
        }
      }
    ]
  },
  "tunes": [
    {
      "id": "slick-as3x",
      "airframe": "slick2680",
      "name": "AS3X",
      "note": "A Spektrum AR637T fitted by the builder, its AS3X rate damper on: the sticks are the surfaces at the sheet's 3D throws, and the gyro damps the bumps and the torque's kicks against the rate it turns at, fading out as the stick leaves centre. Nothing levels it and nothing caps a rate.",
      "wingStab": 3
    },
    {
      "id": "slick-manual",
      "airframe": "slick2680",
      "name": "Manual",
      "note": "No flight controller. The sticks are the ailerons, the elevator and the rudder at Extreme Flight's 3D throws. It is twelve and a half kilograms: it starts and stops turning slowly, so lead every input, and hold the torque on the ailerons when it hangs."
    },
    {
      "id": "slick-stab",
      "airframe": "slick2680",
      "name": "SAFE Select",
      "note": "The same receiver with SAFE Select on: roll stick asks for a bank up to 60 degrees, pitch stick for a pitch up to 30, centred sticks fly level, and the rudder is coordinated for you. It cannot hover or tumble: switch to AS3X for 3D.",
      "wingStab": 1
    }
  ],
  "progress": {
    "level": 12
  },
  "strings": {
    "en": {
      "carousel.note.slick2680": "A 35 percent IMAC aerobat on a 120 cc petrol twin. It hangs on the prop like the Extra, with twelve and a half kilograms of momentum behind every move.",
      "airframe.blurb.slick2680": "A 2.68 m Extreme Flight Slick 580 on a 120 cc DA-120 petrol twin, 12.5 kg of balsa and carbon in its 10th Anniversary red and white. It hangs on its 28 in prop and torque rolls like the Extra, but with thirty times the Extra's inertia: everything it does it does with momentum. Pull it into the stall at idle and the prop's gyroscope drops the right wing.",
      "power.slick.stock": "Desert Aircraft DA-120 petrol twin, 28 x 10 carbon (stock)",
      "livery.scheme.slick2680.stock": "10th Anniversary red and white",
      "livery.scheme.slick2680.blueorange": "White, blue and orange",
      "livery.scheme.slick2680.cubyellow": "Cub yellow, red and grey"
    },
    "es": {
      "carousel.note.slick2680": "Un acrobático IMAC al 35 por ciento con un bicilíndrico de nafta de 120 cc. Se cuelga de la hélice como el Extra, con doce kilos y medio de impulso detrás de cada maniobra.",
      "airframe.blurb.slick2680": "Un Extreme Flight Slick 580 de 2,68 m con un DA-120 bicilíndrico de nafta de 120 cc, 12,5 kg de balsa y carbono en el rojo y blanco de su décimo aniversario. Se cuelga de su hélice de 28 pulgadas y hace torque roll como el Extra, pero con treinta veces la inercia del Extra: todo lo hace con impulso. Entra en pérdida al ralentí y el giróscopo de la hélice deja caer el ala derecha.",
      "power.slick.stock": "Desert Aircraft DA-120 bicilíndrico de nafta, 28 x 10 de carbono (de serie)",
      "livery.scheme.slick2680.stock": "Rojo y blanco del décimo aniversario",
      "livery.scheme.slick2680.blueorange": "Blanco, azul y naranja",
      "livery.scheme.slick2680.cubyellow": "Amarillo Cub, rojo y gris"
    }
  }
};
