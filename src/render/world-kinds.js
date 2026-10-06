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
 * Fields, all optional but `amp`:
 *   lufs16       the kind's loudness at 16 m, cruising, LUFS (the target)
 *   amp          the trim that meets it
 *   cruise       m/s at which it turns cruiseRpm (a road vehicle: the
 *                speed it is calibrated at)
 *   cruiseRpm    the shaft's rpm at cruise
 *   fixed        the rpm is cruiseRpm whatever the speed (a machine)
 *   gears        a road vehicle's top speed in each gear, m/s, with
 *   idleRpm, shiftRpm  its idle and the rpm it changes up at
 *   fires        firings a revolution (cylinders for a two stroke, half
 *                that for a four stroke)
 *   muffler      three resonances, Hz, and mufflerDecay their ring, s
 *   pulseDecay   the exhaust pulse's per sample decay
 *   jitter       cycle to cycle variation (Heywood 1988, 9.4), miss the
 *                share of cycles that misfire
 *   exhaust      the exhaust's level in the mix of the source
 *   knock, knockLevel  a diesel's combustion tick: the block's ring, Hz,
 *                and its level
 *   tyres        tyre and road noise level
 *   rope         a gondola cabin's rope rumble level
 *   blades, prop a propeller's blade count and level
 *   mesh, teeth  a gearbox's mesh tone, its level and the teeth on the
 *                shaft the rpm is of
 *   powerDive    winds up in a dive rather than windmilling (a munition's
 *                terminal run)
 *   whine, poles an electric motor's whine level and pole count
 *   rotors, rotorBlades  a quad's four props
 *   water        a hull's wash level
 *   ground       the ground image's pressure ratio (grass about 0.5, water
 *                0.9)
 *   bed, line, near, lufsNear  the ambience's: see THE AMBIENCE below
 *   height       where it is, metres over its ground, and where it is
 *                calibrated (else at the ear)
 *   roar, flow, bubbles, lap, hum, mainsHz, corona, bell, song, chirp,
 *   croak, buzz  the ambience's parts and their levels
 *   flowRef      a source driven by a discharge (the drive slot, m3/s):
 *                the discharge its level is given at
 *   farHz, farGain  the far bed's note and its level against a voice
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

/* Numbers a frame carries per source: id, kind, x, y, z, vx, vy, vz, and
 * a drive, what its level follows when not its speed (a breach's
 * discharge, m3/s; 0 for every other kind). */
export const SOURCE_STRIDE = 9;

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
    lufs16: -29, amp: 0.0475, cruise: 21, cruiseRpm: 20000, rotors: 1, rotorBlades: 3,
    whine: 0.02, poles: 14, ground: 0.5, farHz: 1000, farGain: 1,
  },
  hunter: {
    lufs16: -29, amp: 0.0510, cruise: 25.2, cruiseRpm: 21000, rotors: 1, rotorBlades: 3,
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

/*
 * THE VALLEY (src/maps/alps/life.js, lift.js; swiss2/props/lakeside.js).
 *
 * The levels at 16 m come from what each is in the street, not from the
 * war's mix: a dB(A) at 7.5 m from the pass by literature (a car at
 * 50 km/h about 68, a van 71, a motorbike 75, a bus or a lorry 79, a
 * modern tractor at its work 77; ISO 362 and the EU's 540/2014 limits
 * bound them),
 * less 6.6 dB to 16 m, mapped to the mix by the war's FPV quad: a 5 inch
 * class quad at 16 m is about 72 dB(A) and its kind is -29 LUFS here, so
 * LUFS = dB(A) - 101. A car on the road at 30 m is then about -45 LUFS:
 * there, under the pilot's own aircraft (-27), as a street is under a
 * drone overhead. ESTIMATED, every one: the literature is a range and a
 * model's car is no particular car.
 */
const ROAD = { pulseDecay: 0.9, jitter: 0.03, exhaust: 1, miss: 0, cruise: 14, ground: 0.6 };

Object.assign(WORLD_KINDS, {
  /* A petrol four cylinder four stroke (two firings a rev), five gears,
   * and its tyres, which at 50 km/h are most of it. */
  car: {
    ...ROAD, lufs16: -40, amp: 0.0643, fires: 2, idleRpm: 800, shiftRpm: 2900, gears: [4, 8, 13, 19, 27],
    muffler: [95, 310, 1100], mufflerDecay: [0.03, 0.01, 0.003], tyres: 1.2, farHz: 67, farGain: 1,
  },
  /* A delivery van: a four cylinder diesel, its knock and heavier tyres. */
  van: {
    ...ROAD, lufs16: -37, amp: 0.135, fires: 2, idleRpm: 750, shiftRpm: 2600, gears: [4, 8, 13, 19, 26],
    muffler: [80, 270, 950], mufflerDecay: [0.035, 0.012, 0.003], knock: 1700, knockLevel: 0.25,
    tyres: 0.8, farHz: 60, farGain: 1,
  },
  /* A motorbike: a single cylinder four stroke (half a firing a rev),
   * six gears, revving high; the bark the street knows. */
  motorbike: {
    ...ROAD, lufs16: -33, amp: 0.264, fires: 0.5, idleRpm: 1300, shiftRpm: 6500, gears: [5, 10, 15, 20, 26, 32],
    muffler: [150, 540, 1700], mufflerDecay: [0.025, 0.009, 0.003], jitter: 0.06, tyres: 0.5, farHz: 45, farGain: 1,
  },
  /* The PostAuto: a six cylinder diesel (three firings a rev), its knock,
   * its tyres; it idles at its stop and pulls away hard. */
  bus: {
    ...ROAD, lufs16: -29, amp: 0.433, fires: 3, idleRpm: 600, shiftRpm: 2000, gears: [3, 6, 10, 15, 22],
    muffler: [70, 240, 880], mufflerDecay: [0.04, 0.014, 0.004], knock: 1500, knockLevel: 0.3,
    tyres: 0.5, farHz: 55, farGain: 1,
  },
  /* The farm tractor at its work, 2.4 m/s round its field with the
   * trailer: a four cylinder diesel held at 1800 rpm. */
  tractor: {
    ...ROAD, lufs16: -31, amp: 0.497, cruise: 2.4, cruiseRpm: 1800, fixed: true, fires: 2,
    muffler: [75, 250, 900], mufflerDecay: [0.04, 0.014, 0.004], jitter: 0.05, knock: 1600, knockLevel: 0.35,
    farHz: 60, farGain: 1,
  },
  /* A gondola cabin on its rope at 5 m/s: no engine, the rope's rumble
   * through the grip, quiet. */
  cabin: { lufs16: -50, amp: 0.0458, cruise: 5, rope: 1, ground: 0.5, farHz: 70, farGain: 1 },
  /* The lift's drive in its station: an electric motor held at 1500 rpm
   * (a four pole machine on 50 Hz), its magnetostriction hum at 100 Hz
   * (8 poles' worth of whine), and its gearbox's mesh, 17 teeth on the
   * motor's shaft, 425 Hz. */
  liftdrive: {
    lufs16: -38, amp: 0.0182, cruise: 0, cruiseRpm: 1500, fixed: true, whine: 0.6, poles: 8, mesh: 0.3, teeth: 17,
    ground: 0.6, farHz: 100, farGain: 1,
  },
  /* The Swiss lake's sailing boat: no engine, its hull through the water. */
  sailboat: { height: 0, lufs16: -50, amp: 0.0893, cruise: 2.4, water: 1, ground: 0.9, farHz: 40, farGain: 1 },
});

/*
 * THE AMBIENCE (output 1, the Ambience bus; `bed` puts a kind there, in
 * its own pool of voices). What the maps say is there (src/maps/itaipu.js
 * audioBeds and audioLines, every map's lakes and rivers, the valley's
 * cattle) and what src/render/world-audio.js scatters round the listener
 * by the time of day (birds, crickets, frogs, cicadas).
 *
 * All of it is under the mix's own targets: it is the place, not an
 * event, and a bed that pulls the ear is a bed that tires it. A source as
 * big as a spillway or a town is never nearer than its `near`, metres,
 * and its level is given there (`lufsNear`); a line or an area spreads at
 * 3 dB a doubling (`line`). ESTIMATED, every level: chosen so a pilot over
 * the dam hears the spillway's three pools together at -26 LUFS at most
 * and still at -42 three kilometres off, a river at 20 m about -41, a bird 40 m off about -46,
 * all under the aircraft's -27.
 */
const BED = { bed: true, ground: 0.5, cruise: 0 };

Object.assign(WORLD_KINDS, {
  /* Itaipu's spillway, its plunge pools: a mass of falling water a few
   * hundred metres across, so never nearer than 80 m. */
  spillway: { ...BED, height: 4, line: true, near: 80, lufsNear: -31, amp: 0.618, roar: 1 },
  /* A river from its nearest point: its flow and bubbles. */
  river: { ...BED, height: 0, line: true, lufs16: -40, amp: 0.0436, flow: 1, bubbles: 70 },
  /* A lake's shore from its nearest point: small waves lapping. */
  lapping: { ...BED, height: 0, line: true, lufs16: -42, amp: 0.106, lap: 1, ground: 0.9 },
  /* A town from its middle, never nearer than 300 m: its murmur and its
   * transformers' hum. Paraguay's mains, 50 Hz (Itaipu's town is on the
   * Paraguayan bank). */
  townhum: { ...BED, height: 10, line: true, near: 300, lufsNear: -44, amp: 0.232, hum: 1, mainsHz: 50 },
  /* A 500 kV line from its nearest point: hum at twice the mains and
   * corona's crackle. */
  powerline: { ...BED, height: 25, line: true, lufs16: -45, amp: 0.0155, corona: 1, mainsHz: 50 },
  /* A cow's bell, struck as it grazes, often as it walks. */
  cowbell: { ...BED, height: 1, lufs16: -40, amp: 0.0332, bell: 1, cruise: 0.4 },
  /* A songbird in a tree. */
  birds: { ...BED, height: 5, lufs16: -38, amp: 0.0265, song: 1 },
  /* A cricket in the grass, at night. */
  crickets: { ...BED, height: 0.3, lufs16: -48, amp: 0.0120, chirp: 1 },
  /* A frog by the water, at night. */
  frogs: { ...BED, height: 0.3, lufs16: -40, amp: 0.0234, croak: 1, ground: 0.9 },
  /* Water through a breach in the dam, from the opening: the spillway's
   * roar, driven by the discharge the water hands over (WorldAudio.flow,
   * m3/s in the drive slot), its level at flowRef given at 40 m. Not a
   * bed: an event the pilot made, on the other aircraft's bus with the
   * war, never masked under a swarm. */
  breachflow: { height: 4, line: true, near: 40, lufsNear: -27, amp: 0.668, roar: 1, flowRef: 1000, ground: 0.6, farHz: 60, farGain: 1 },
  /* A cicada in a subtropical tree, by day. */
  cicada: { ...BED, height: 5, lufs16: -42, amp: 0.0125, buzz: 1 },
});

/* Every kind with every field, in one order, absent ones zero (a height
 * null: at the ear): the
 * worklet reads a dozen of them a sample, and kinds of one shape keep
 * those reads monomorphic (measured in Node: the war over Itaipu with its
 * ambience, 0.19 s a second when every kind had its own shape, 0.12). */
const FIELDS = [
  'lufs16', 'lufsNear', 'amp', 'cruise', 'cruiseRpm', 'fixed', 'powerDive', 'gears', 'idleRpm', 'shiftRpm',
  'fires', 'muffler', 'mufflerDecay', 'pulseDecay', 'jitter', 'miss', 'exhaust', 'knock', 'knockLevel',
  'blades', 'prop', 'whine', 'poles', 'mesh', 'teeth', 'rotors', 'rotorBlades', 'tyres', 'rope', 'water',
  'bed', 'line', 'near', 'height', 'ground', 'farHz', 'farGain',
  'roar', 'flowRef', 'flow', 'bubbles', 'lap', 'hum', 'mainsHz', 'corona', 'bell', 'song', 'chirp', 'croak', 'buzz',
];
for (const [name, spec] of Object.entries(WORLD_KINDS)) {
  const unknown = Object.keys(spec).filter((k) => !FIELDS.includes(k));
  if (unknown.length) {
    throw new Error(`world-kinds: ${name} has ${unknown.join(', ')}, not in FIELDS`);
  }
  const shaped = Object.fromEntries(FIELDS.map((k) => [k, k === 'height' ? null : 0]));
  WORLD_KINDS[name] = Object.assign(shaped, spec);
}

/* The kind numbers on the wire: an index into this list. Appending is
 * safe; reordering changes what an old frame means. */
export const KINDS = Object.keys(WORLD_KINDS);
export const KIND_INDEX = Object.fromEntries(KINDS.map((k, i) => [k, i]));
