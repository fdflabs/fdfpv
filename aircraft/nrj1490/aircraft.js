/*
 * aircraft/nrj1490/aircraft.js: the NRJ DLG as data, one aircraft's rows
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
  "id": "nrj1490",
  "airframe": {
    "id": "nrj1490",
    "simId": 21,
    "fixedWing": true,
    "discus": true,
    "noMotor": true,
    "stall": 4.35,
    "topSpeed": 41,
    "name": "NRJ DLG",
    "short": "DLG",
    "blurb": "A 1490 mm OA Composites NRJ, a 213 g carbon discus launch glider with no motor. Spin and throw it by the wingtip to 60 m, then work the thermals to stay up; bring it home on its belly or catch it.",
    "facts": [
      "No motor",
      "1490 mm",
      "213 g"
    ],
    "sizeMm": 1490,
    "grams": 213,
    "trackClass": "wing",
    "class": "glider",
    "roles": [],
    "cells": 1,
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
    "defaultTune": "nrj-manual",
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
      "propR": 0,
      "hullR": 0.7512,
      "vHalfDown": 0.042,
      "vHalfUp": 0.18,
      "bodyLength": 0.959,
      "bodyWidth": 1.49,
      "bodyHeight": 0.222
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
      }
    ],
    "drawn": true
  },
  "tuning": {
    "chord": 0.1378,
    "area": 0.19,
    "margin": 0.17,
    "cg": {
      "mm": 66,
      "datum": "tuning.datum.root_le",
      "range": [
        64.5,
        66.5
      ],
      "source": "OA Composites' manual, \"CG between 64.5 and 66.5mm\", 66 for the empty glider; https://www.hyperflight.co.uk/extras/NRJ-EN-instructions-2019.pdf"
    },
    "packKg": 0.015,
    "nose": 0.23,
    "tail": -0.66,
    "throws": {
      "high": [
        19,
        17.5,
        15.5
      ],
      "low": [
        13.3,
        12.25,
        10.85
      ],
      "source": "OA Composites' manual: ailerons 13 mm each way, elevator 8 to 10 mm, rudder 12 mm, on the 40, 30 and 45 mm surfaces at the horn (docs/DLG-STAGE1.md); no low rate is published, so it is 70 percent; https://www.hyperflight.co.uk/extras/NRJ-EN-instructions-2019.pdf"
    },
    "flaps": null
  },
  "power": {
    "table": {
      "simId": 21,
      "massKg": 0.213,
      "cells": 1,
      "rCell": 0.1,
      "propIn": 0,
      "cruiseMs": 5.14,
      "flightTime": null
    },
    "options": null,
    "estimates": null
  },
  "hangar": {
    "props": null,
    "anchors": null
  },
  "livery": {
    "regions": [
      {
        "id": "wing",
        "stock": "#2b2d31"
      },
      {
        "id": "stripe",
        "stock": "#e8358f"
      },
      {
        "id": "band",
        "stock": "#39b3e6"
      },
      {
        "id": "cone",
        "stock": "#3a9ad9"
      },
      {
        "id": "tail",
        "stock": "#1a1b1d"
      }
    ],
    "schemes": [
      {
        "id": "stock",
        "source": {
          "label": "Hyperflight, NRJ 1.5m DLG, \"Blue #5\"",
          "url": "https://www.hyperflight.co.uk/products.asp?code=NRJ&name=nrj-dlg"
        },
        "colours": {}
      },
      {
        "id": "red2",
        "source": {
          "label": "Lindinger, OA-Composites NRJ F3K RED #2",
          "url": "https://www.lindinger.at/en/Airplanes/Aircraft-Models/Electric-gliders-Hotliners/OA-COMPOSITES-NRJ-F3K-RED-2-CW40-CENTRIFUGAL-GLIDER/9776531"
        },
        "colours": {
          "wing": "#9a9ea3",
          "stripe": "#e8358f",
          "band": "#5a5d62",
          "cone": "#e0314a"
        }
      },
      {
        "id": "orange18",
        "source": {
          "label": "Lindinger, OA-Composites NRJ F3K ORANGE #18",
          "url": "https://www.lindinger.at/en/Airplanes/Aircraft-Models/Electric-gliders-Hotliners/OA-COMPOSITES-NRJ-F3K-ORANGE-18-EXTREME-60-SPIN-GLIDER/9776534"
        },
        "colours": {
          "stripe": "#f07a1c",
          "band": "#f3d02a",
          "cone": "#f07a1c"
        }
      }
    ]
  },
  "tunes": [
    {
      "id": "nrj-manual",
      "airframe": "nrj1490",
      "name": "Manual",
      "note": "No flight controller. The sticks are the flaperons, the elevator and the rudder; the launch preset trims the elevator down for the climb and lets go at the top."
    },
    {
      "id": "nrj-stab",
      "airframe": "nrj1490",
      "name": "Stabilised",
      "note": "A gyro holds the glider. Roll stick asks for a bank up to 50 degrees, pitch stick for a pitch up to 30, centred sticks glide level, and the rudder is coordinated for you. The launch preset holds the climb after the throw.",
      "wingStab": 1
    }
  ],
  "progress": {
    "level": 6
  },
  "strings": {
    "en": {
      "carousel.note.nrj1490": "A carbon discus launch glider with no motor. Spin it up by the wingtip, then find a thermal before the ground finds you.",
      "airframe.blurb.nrj1490": "A 1490 mm OA Composites NRJ, a 213 g carbon discus launch glider with no motor. Spin and throw it by the wingtip to 60 m, then work the thermals to stay up; bring it home on its belly or catch it.",
      "livery.scheme.nrj1490.stock": "Blue #5, pink and blue",
      "livery.scheme.nrj1490.red2": "Red #2, pink and grey",
      "livery.scheme.nrj1490.orange18": "Orange #18, sunset"
    },
    "es": {
      "carousel.note.nrj1490": "Un planeador de lanzamiento por disco en carbono, sin motor. Hazlo girar por la punta del ala y busca una térmica antes de que el suelo te encuentre.",
      "airframe.blurb.nrj1490": "Un OA Composites NRJ de 1490 mm, un planeador de lanzamiento por punta de ala de carbono de 213 g, sin motor. Gíralo y lánzalo por la punta del ala hasta 60 m, luego trabaja las térmicas para mantenerte arriba; tráelo de vuelta sobre la panza o atrápalo.",
      "livery.scheme.nrj1490.stock": "Blue #5, rosa y azul",
      "livery.scheme.nrj1490.red2": "Red #2, rosa y gris",
      "livery.scheme.nrj1490.orange18": "Orange #18, atardecer"
    }
  }
};
