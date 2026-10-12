/*
 * aircraft/sky1800/aircraft.js: the Skyhunter as data, one aircraft's
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
  "id": "sky1800",
  "airframe": {
    "id": "sky1800",
    "simId": 3,
    "fixedWing": true,
    "stall": 9.2,
    "topSpeed": 29.26,
    "name": "Skyhunter",
    "short": "Skyhunter",
    "blurb": "An 1800 mm twin boom FPV plane on 4S, with ailerons, elevator and rudder. Throw it, fly it long, land it on its skid.",
    "facts": [
      "4S",
      "1800 mm",
      "Twin boom"
    ],
    "sizeMm": 1800,
    "grams": 2100,
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
    "defaultTune": "sky-acro",
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
      "hullR": 0.9,
      "vHalfDown": 0.12,
      "vHalfUp": 0.219,
      "bodyLength": 1.225,
      "bodyWidth": 1.8,
      "bodyHeight": 0.339
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
    "chord": 0.2,
    "area": 0.36,
    "margin": 0.17,
    "cg": {
      "mm": 66.7,
      "datum": "tuning.datum.le",
      "range": null,
      "source": "Sonicmodell, \"CG: 1/3 of wing from leading edge\", no range; https://www.sonicmodell.com/product/skyhunter-1800mm-wingspan-epo-long-range-fpv-uav-platform-rc-airplane-kit-14.html"
    },
    "packKg": 0.5,
    "nose": 0.36,
    "tail": -0.75,
    "throws": {
      "high": [
        15,
        15,
        25
      ],
      "low": [
        10.5,
        10.5,
        17.5
      ],
      "source": "high: ESTIMATED, no throws published (docs/SKYHUNTER-STAGE1.md); low: 70 percent of high, the low rate the Timber, Radian and Radian Pro manuals state"
    },
    "flaps": null
  },
  "power": {
    "table": {
      "simId": 3,
      "massKg": 2.1,
      "cells": 4,
      "rCell": 0.008,
      "propIn": 11,
      "cruiseMs": 15,
      "flightTime": {
        "kind": "atLeast",
        "minutesLow": 10,
        "minutesHigh": 10,
        "note": "Model Aviation's review, 'flights lasting 10 minutes and longer', 4S 5000 at 2.10 kg",
        "source": "https://www.modelaviation.com/skyhunter"
      }
    },
    "options": [
      {
        "id": "stock",
        "name": "power.sky.stock",
        "kind": "electric",
        "voice": "wing",
        "kv": 950,
        "propIn": 11,
        "pitchIn": 5.5,
        "blades": 2,
        "thrustN": 27,
        "currentA": 43,
        "rpmNoLoad": 14060,
        "pitchSpeedMs": 27.826,
        "lvcV": 3,
        "massKg": 2.1,
        "cgShiftM": 0,
        "packs": [
          {
            "id": "4s4000",
            "cells": 4,
            "mAh": 4000,
            "massKg": 0.429,
            "source": "https://chinahobbyline.com/products/cnhl-4000mah-14-8v-4s-40c-lipo-battery-with-xt90-plug"
          },
          {
            "id": "4s5000",
            "cells": 4,
            "mAh": 5000,
            "massKg": 0.536,
            "source": "https://chinahobbyline.com/products/cnhl-5000mah-14-8v-4s-40c-lipo-battery-with-xt90-plug"
          },
          {
            "id": "4s6000",
            "cells": 4,
            "mAh": 6000,
            "massKg": 0.62,
            "source": "https://chinahobbyline.com/products/cnhl-black-series-6000mah-14-8v-4s-65c-lipo-battery-with-ec5-plug"
          },
          {
            "id": "4s16000",
            "cells": 4,
            "mAh": 16000,
            "massKg": 1.27,
            "source": "https://chinahobbyline.com/products/cnhl-16000mah-14-8v-4s-15c-lipo-battery-with-xt90-plug"
          }
        ],
        "pack": "4s5000",
        "source": [
          "https://www.modelaviation.com/skyhunter",
          "https://www.sonicmodell.com/product/skyhunter-1800mm-wingspan-epo-long-range-fpv-uav-platform-rc-airplane-kit-14.html"
        ]
      },
      {
        "id": "920-11x7",
        "name": "power.sky.920_11x7",
        "kind": "electric",
        "voice": "wing",
        "kv": 920,
        "propIn": 11,
        "pitchIn": 7,
        "blades": 2,
        "thrustN": 24.908891,
        "currentA": 45,
        "rpmNoLoad": 13616,
        "pitchSpeedMs": 34.29643466666666,
        "lvcV": 3,
        "massKg": 2.1,
        "cgShiftM": 0,
        "packs": [
          {
            "id": "4s4000",
            "cells": 4,
            "mAh": 4000,
            "massKg": 0.429,
            "source": "https://chinahobbyline.com/products/cnhl-4000mah-14-8v-4s-40c-lipo-battery-with-xt90-plug"
          },
          {
            "id": "4s5000",
            "cells": 4,
            "mAh": 5000,
            "massKg": 0.536,
            "source": "https://chinahobbyline.com/products/cnhl-5000mah-14-8v-4s-40c-lipo-battery-with-xt90-plug"
          },
          {
            "id": "4s6000",
            "cells": 4,
            "mAh": 6000,
            "massKg": 0.62,
            "source": "https://chinahobbyline.com/products/cnhl-black-series-6000mah-14-8v-4s-65c-lipo-battery-with-ec5-plug"
          },
          {
            "id": "4s16000",
            "cells": 4,
            "mAh": 16000,
            "massKg": 1.27,
            "source": "https://chinahobbyline.com/products/cnhl-16000mah-14-8v-4s-15c-lipo-battery-with-xt90-plug"
          }
        ],
        "pack": "4s5000",
        "source": [
          "https://www.sonicmodell.com/product/skyhunter-1800mm-wingspan-epo-long-range-fpv-uav-platform-rc-airplane-kit-14.html",
          "https://sunnyskyusa.com/products/sunnysky-x2820-brushless-motors"
        ]
      },
      {
        "id": "920-12x6",
        "name": "power.sky.920_12x6",
        "kind": "electric",
        "voice": "wing",
        "kv": 920,
        "propIn": 12,
        "pitchIn": 6,
        "blades": 2,
        "thrustN": 28.047018999999995,
        "currentA": 48.4,
        "rpmNoLoad": 13616,
        "pitchSpeedMs": 29.396944,
        "lvcV": 3,
        "massKg": 2.1,
        "cgShiftM": 0,
        "packs": [
          {
            "id": "4s4000",
            "cells": 4,
            "mAh": 4000,
            "massKg": 0.429,
            "source": "https://chinahobbyline.com/products/cnhl-4000mah-14-8v-4s-40c-lipo-battery-with-xt90-plug"
          },
          {
            "id": "4s5000",
            "cells": 4,
            "mAh": 5000,
            "massKg": 0.536,
            "source": "https://chinahobbyline.com/products/cnhl-5000mah-14-8v-4s-40c-lipo-battery-with-xt90-plug"
          },
          {
            "id": "4s6000",
            "cells": 4,
            "mAh": 6000,
            "massKg": 0.62,
            "source": "https://chinahobbyline.com/products/cnhl-black-series-6000mah-14-8v-4s-65c-lipo-battery-with-ec5-plug"
          },
          {
            "id": "4s16000",
            "cells": 4,
            "mAh": 16000,
            "massKg": 1.27,
            "source": "https://chinahobbyline.com/products/cnhl-16000mah-14-8v-4s-15c-lipo-battery-with-xt90-plug"
          }
        ],
        "pack": "4s5000",
        "source": [
          "https://www.sonicmodell.com/product/skyhunter-1800mm-wingspan-epo-long-range-fpv-uav-platform-rc-airplane-kit-14.html",
          "https://sunnyskyusa.com/products/sunnysky-x2820-brushless-motors"
        ]
      },
      {
        "id": "920-12x6-3s",
        "name": "power.sky.920_12x6_3s",
        "kind": "electric",
        "voice": "wing",
        "kv": 920,
        "propIn": 12,
        "pitchIn": 6,
        "blades": 2,
        "thrustN": 17.455837,
        "currentA": 29.8,
        "rpmNoLoad": 10212,
        "pitchSpeedMs": 22.047707999999997,
        "lvcV": 3,
        "massKg": 1.976,
        "cgShiftM": 0,
        "packs": [
          {
            "id": "3s5000",
            "cells": 3,
            "mAh": 5000,
            "massKg": 0.412,
            "source": "https://chinahobbyline.com/products/cnhl-5000mah-11-1v-3s-40c-lipo-battery-with-xt90-plug"
          }
        ],
        "pack": "3s5000",
        "source": [
          "https://www.sonicmodell.com/product/skyhunter-1800mm-wingspan-epo-long-range-fpv-uav-platform-rc-airplane-kit-14.html",
          "https://sunnyskyusa.com/products/sunnysky-x2820-brushless-motors"
        ]
      },
      {
        "id": "800-13x8",
        "name": "power.sky.800_13x8",
        "kind": "electric",
        "voice": "wing",
        "kv": 800,
        "propIn": 13,
        "pitchIn": 8,
        "blades": 2,
        "thrustN": 27.360553499999998,
        "currentA": 45.2,
        "rpmNoLoad": 11840,
        "pitchSpeedMs": 34.08341333333333,
        "lvcV": 3,
        "massKg": 2.1,
        "cgShiftM": 0,
        "packs": [
          {
            "id": "4s4000",
            "cells": 4,
            "mAh": 4000,
            "massKg": 0.429,
            "source": "https://chinahobbyline.com/products/cnhl-4000mah-14-8v-4s-40c-lipo-battery-with-xt90-plug"
          },
          {
            "id": "4s5000",
            "cells": 4,
            "mAh": 5000,
            "massKg": 0.536,
            "source": "https://chinahobbyline.com/products/cnhl-5000mah-14-8v-4s-40c-lipo-battery-with-xt90-plug"
          },
          {
            "id": "4s6000",
            "cells": 4,
            "mAh": 6000,
            "massKg": 0.62,
            "source": "https://chinahobbyline.com/products/cnhl-black-series-6000mah-14-8v-4s-65c-lipo-battery-with-ec5-plug"
          },
          {
            "id": "4s16000",
            "cells": 4,
            "mAh": 16000,
            "massKg": 1.27,
            "source": "https://chinahobbyline.com/products/cnhl-16000mah-14-8v-4s-15c-lipo-battery-with-xt90-plug"
          }
        ],
        "pack": "4s5000",
        "source": [
          "https://www.sonicmodell.com/product/skyhunter-1800mm-wingspan-epo-long-range-fpv-uav-platform-rc-airplane-kit-14.html",
          "https://sunnyskyusa.com/products/sunnysky-x2820-brushless-motors"
        ]
      }
    ],
    "estimates": {
      "stock": {
        "4s4000": {
          "topSpeed": 29.49,
          "minutes": 66.4
        },
        "4s5000": {
          "topSpeed": 29.82,
          "minutes": 76.9
        },
        "4s6000": {
          "topSpeed": 30.05,
          "minutes": 87.1
        },
        "4s16000": {
          "topSpeed": 30.76,
          "minutes": 157.7
        }
      },
      "920-11x7": {
        "4s4000": {
          "topSpeed": 32.84,
          "minutes": 74.2
        },
        "4s5000": {
          "topSpeed": 33.29,
          "minutes": 85.9
        },
        "4s6000": {
          "topSpeed": 33.61,
          "minutes": 97.3
        },
        "4s16000": {
          "topSpeed": 34.62,
          "minutes": 176.2
        }
      },
      "920-12x6": {
        "4s4000": {
          "topSpeed": 30.55,
          "minutes": 65.1
        },
        "4s5000": {
          "topSpeed": 30.95,
          "minutes": 75.4
        },
        "4s6000": {
          "topSpeed": 31.22,
          "minutes": 85.4
        },
        "4s16000": {
          "topSpeed": 32.08,
          "minutes": 154.7
        }
      },
      "920-12x6-3s": {
        "3s5000": {
          "topSpeed": 23.96,
          "minutes": 61.9
        }
      },
      "800-13x8": {
        "4s4000": {
          "topSpeed": 33.41,
          "minutes": 80.6
        },
        "4s5000": {
          "topSpeed": 33.86,
          "minutes": 93.3
        },
        "4s6000": {
          "topSpeed": 34.17,
          "minutes": 105.7
        },
        "4s16000": {
          "topSpeed": 35.18,
          "minutes": 191.3
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
        "id": "11x7e-3",
        "name": "parts.prop.11x7e-3",
        "apc": "11x7E-3",
        "propIn": 11,
        "pitchIn": 7,
        "blades": 3,
        "massKg": 0.030900980206250005,
        "source": [
          "https://www.apcprop.com/product/11x7e-3/",
          "https://www.apcprop.com/files/PER3_11x7E-3.dat"
        ]
      },
      {
        "id": "11x8e",
        "name": "parts.prop.11x8e",
        "apc": "11x8E",
        "propIn": 11,
        "pitchIn": 8,
        "blades": 2,
        "massKg": 0.022963113731250002,
        "source": [
          "https://www.apcprop.com/product/11x8e/",
          "https://www.apcprop.com/files/PER3_11x8E.dat"
        ]
      }
    ],
    "anchors": {
      "prop": [
        -0.268,
        0,
        0.032
      ],
      "belly": [
        0.1,
        0,
        -0.095
      ],
      "tail": [
        -0.25,
        0,
        -0.07
      ],
      "tank": [
        -0.01,
        0,
        -0.04
      ],
      "led": [
        [
          0.061,
          0.27,
          0.048
        ],
        [
          0.061,
          0.81,
          0.074
        ]
      ]
    }
  },
  "livery": {
    "regions": [
      {
        "id": "wing",
        "stock": "#d4e2ee"
      },
      {
        "id": "tail",
        "stock": "#d4e2ee"
      },
      {
        "id": "pod",
        "stock": "#d4e2ee"
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
      "id": "sky-acro",
      "airframe": "sky1800",
      "name": "Acro",
      "note": "A gyro holds the plane where you leave it. Sticks ask for a roll and a pitch rate, centred sticks hold the attitude, and the rudder stick is the rudder alone.",
      "wingStab": 2
    },
    {
      "id": "sky-stab",
      "airframe": "sky1800",
      "name": "Stabilised",
      "note": "A gyro holds the plane. Roll stick asks for a bank up to 60 degrees, pitch stick for a pitch up to 30, centred sticks fly level, and the rudder is coordinated for you.",
      "wingStab": 1
    },
    {
      "id": "sky-manual",
      "airframe": "sky1800",
      "name": "Manual",
      "note": "No flight controller. The sticks are the ailerons, the elevator and the rudder."
    }
  ],
  "progress": {
    "level": 3
  },
  "strings": {
    "en": {
      "carousel.note.sky1800": "A twin boom FPV cruiser. Throw it and fly it a long way.",
      "power.sky.800_13x8": "X2820 800 kV, 13 x 8, 4S",
      "power.sky.920_11x7": "X2820 920 kV, 11 x 7, 4S",
      "power.sky.920_12x6": "X2820 920 kV, 12 x 6, 4S",
      "power.sky.920_12x6_3s": "X2820 920 kV, 12 x 6, 3S",
      "power.sky.stock": "2820 950 kV, 11 x 5.5, 4S (stock)",
      "airframe.blurb.sky1800": "An 1800 mm twin boom FPV plane on 4S, with ailerons, elevator and rudder. Throw it, fly it long, land it on its skid.",
      "livery.scheme.sky1800.stock": "Stock foam"
    },
    "es": {
      "carousel.note.sky1800": "Un crucero FPV de doble botalón. Lánzalo y vuélalo lejos.",
      "power.sky.800_13x8": "X2820 800 kV, 13 x 8, 4S",
      "power.sky.920_11x7": "X2820 920 kV, 11 x 7, 4S",
      "power.sky.920_12x6": "X2820 920 kV, 12 x 6, 4S",
      "power.sky.920_12x6_3s": "X2820 920 kV, 12 x 6, 3S",
      "power.sky.stock": "2820 950 kV, 11 x 5,5, 4S (de serie)",
      "airframe.blurb.sky1800": "Un avión FPV de doble botalón de 1800 mm en 4S, con alerones, timón de profundidad y timón de dirección. Lánzalo a mano, vuélalo lejos, aterrízalo sobre su patín.",
      "livery.scheme.sky1800.stock": "Espuma de serie"
    }
  }
};
