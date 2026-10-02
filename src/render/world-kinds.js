/*
 * world-kinds.js: what every kind of world source is made of, for
 * src/render/world-worklet.js, and the kind numbers the main thread posts
 * (src/render/world-audio.js). Plain data, imported on both sides.
 *
 * Every number with a source says so; ESTIMATED is tuning, not measurement
 * (docs/AUDIO.md section 12). `amp` is a trim set by measurement so the
 * kind at REF_M (16 m) and its cruise reads its `lufs16` on its bus at the
 * default volume: tools/audio/world.js --calibrate measures it and
 * --check holds every kind within a decibel of it.
 *
 * Fields, all optional but `amp`, `cruise` and `cruiseRpm`:
 *   lufs16       the kind's loudness at 16 m, cruising, LUFS (the target)
 *   amp          the trim that meets it
 *   cruise       m/s at which it turns cruiseRpm
 *   cruiseRpm    the shaft's rpm at cruise
 *   fires        firings a revolution (cylinders for a two stroke, half
 *                that for a four stroke)
 *   muffler      three resonances, Hz, and mufflerDecay their ring, s
 *   pulseDecay   the exhaust pulse's per sample decay
 *   jitter       cycle to cycle variation (Heywood 1988, 9.4), miss the
 *                share of cycles that misfire
 *   exhaust      the exhaust's level in the mix of the source
 *   blades, prop a propeller's blade count and level
 *   powerDive    winds up in a dive rather than windmilling (a munition's
 *                terminal run)
 *   whine, poles an electric motor's whine level and pole count
 *   rotors, rotorBlades  a quad's four props
 *   water        a hull's wash level
 *   ground       the ground image's pressure ratio (grass about 0.5, water
 *                0.9)
 *   farHz, farGain  the far bed's note and its level against a voice
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

/* Numbers a frame carries per source: id, kind, x, y, z, vx, vy, vz. */
export const SOURCE_STRIDE = 8;

const TWO_STROKE = { pulseDecay: 0.86, jitter: 0.08, exhaust: 1 };

export const WORLD_KINDS = {
  /*
   * THE WAR (src/share/war/routes.js KIND, src/render/attackers.js).
   *
   * strike: the Striker airframe, the Shahed class. Its engine is the one
   * the player's Striker has (engine-worklet.js boxer2, docs/COMBAT-DRONES.md
   * 7.3): a 110 cc two stroke boxer twin firing together, so one pulse a
   * revolution, through the same muffler. The "moped" a Shahed is known by
   * is exactly this: a two stroke's raw firing with a two blade pusher's
   * blade pass an octave over it. Cruise rpm ESTIMATED at 0.84 of the
   * boxer's 5000 reference for 26.6 m/s.
   */
  strike: {
    ...TWO_STROKE, lufs16: -25, amp: 0.141, cruise: 26.6, cruiseRpm: 4200, fires: 1,
    muffler: [115, 420, 1500], mufflerDecay: [0.03, 0.012, 0.004], miss: 0,
    blades: 2, prop: 0.5, ground: 0.5, farHz: 70, farGain: 1,
  },
  /* decoy: built to look like a strike (attackers.js), so a smaller two
   * stroke at higher revs (ESTIMATED); its sound is the tell. */
  decoy: {
    ...TWO_STROKE, lufs16: -28, amp: 0.131, cruise: 26.6, cruiseRpm: 7200, fires: 1,
    muffler: [190, 640, 2100], mufflerDecay: [0.02, 0.008, 0.003], miss: 0.01,
    blades: 2, prop: 0.4, ground: 0.5, farHz: 120, farGain: 1,
  },
  /* scout: a 3 m twin boom pusher (an Orlan-10 class airframe): a 30 cc
   * class two stroke single, a slow cruise (ESTIMATED 6000 rpm). */
  scout: {
    ...TWO_STROKE, lufs16: -29, amp: 0.104, cruise: 10.5, cruiseRpm: 6000, fires: 1,
    muffler: [170, 610, 2000], mufflerDecay: [0.025, 0.01, 0.003], miss: 0.02,
    blades: 2, prop: 0.5, ground: 0.5, farHz: 100, farGain: 1,
  },
  /* loiter: a 1.2 m X wing tube with an electric pusher in its tail cone
   * (attackers.js, a Lancet class): the motor's whine and a two blade
   * prop, no exhaust. ESTIMATED 7000 rpm, 14 poles. */
  loiter: {
    lufs16: -30, amp: 0.0990, cruise: 19.6, cruiseRpm: 7000, blades: 2, prop: 0.6,
    whine: 0.05, poles: 14, powerDive: true, ground: 0.5, farHz: 233, farGain: 1,
  },
  /* fpv and hunter: 0.25 m quads (attackers.js), the pilot's own class:
   * four three blade props near 20,000 rpm in fast forward flight. */
  fpv: {
    lufs16: -29, amp: 0.0478, cruise: 21, cruiseRpm: 20000, rotors: 1, rotorBlades: 3,
    whine: 0.02, poles: 14, ground: 0.5, farHz: 1000, farGain: 1,
  },
  hunter: {
    lufs16: -29, amp: 0.0512, cruise: 25.2, cruiseRpm: 21000, rotors: 1, rotorBlades: 3,
    whine: 0.02, poles: 14, ground: 0.5, farHz: 1050, farGain: 1,
  },
  /* boat: a 5 m speedboat on an outboard (attackers.js): a three cylinder
   * two stroke (three firings a revolution), its exhaust out through the
   * prop's hub under water, so dull and low (ESTIMATED), and the hull's
   * wash. 5500 rpm at 9.8 m/s. */
  boat: {
    ...TWO_STROKE, lufs16: -26, amp: 0.416, cruise: 9.8, cruiseRpm: 5500, fires: 3,
    muffler: [140, 380, 900], mufflerDecay: [0.04, 0.015, 0.004], miss: 0,
    exhaust: 0.8, water: 1, ground: 0.9, farHz: 275, farGain: 1,
  },
  /* jammer: a raft with a mast, used by no mission today (itaipu-1.js):
   * a four stroke generator single at 3600 rpm (half a firing a rev) and
   * a little wash. */
  jammer: {
    ...TWO_STROKE, lufs16: -31, amp: 0.388, cruise: 3.5, cruiseRpm: 3600, fires: 0.5,
    muffler: [90, 310, 1100], mufflerDecay: [0.05, 0.02, 0.005], miss: 0,
    water: 0.3, ground: 0.9, farHz: 30, farGain: 1,
  },
};

/* The kind numbers on the wire: an index into this list. Appending is
 * safe; reordering changes what an old frame means. */
export const KINDS = Object.keys(WORLD_KINDS);
export const KIND_INDEX = Object.fromEntries(KINDS.map((k, i) => [k, i]));
