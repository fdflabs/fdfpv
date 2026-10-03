/*
 * 2030.js: "2030", the war's first film (docs/WARFARE-PLAN.md section
 * 7.1), reworked on the film timeline (src/share/war/film.js) after
 * docs/campaign/INTROS.md section 5.1, with the voice lines that exist
 * (intro-1 to intro-5 and intro-7; intro-6, the signal line, stays out
 * with the signal system). Data only.
 *
 * What the rework fixes, measured on the old film (INTROS section 0):
 * its Strikers were timed from a typed 38 m/s and fly at 26.6, so the
 * pass over the lens came after the cut; here every group is placed by
 * where it must be at an anchor (film.js placeAgents). The shots were
 * typed lengths with lines at typed times; here each is as long as its
 * line in the longer language. The spin up's three cuts in one shot are
 * three shots of one camera each.
 *
 * THE FRAME. Scene metres, y up, -z north. The intakes' line on the
 * upstream face runs INTAKE_W to INTAKE_E; crest(i, off, y, along) is a
 * point at intake i's place (fractional), off metres upstream of that
 * line, along metres east along it, at height y (null: on the ground,
 * the player's ground()).
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

const INTAKE_W = [-202.2, -1794.2];
const INTAKE_E = [430.8, -1655.0];
const CREST_Y = 225;
const ALONG = (() => {
  const dx = INTAKE_E[0] - INTAKE_W[0];
  const dz = INTAKE_E[1] - INTAKE_W[1];
  const m = Math.hypot(dx, dz);
  return [dx / m, dz / m];
})();
/* Upstream, toward the reservoir: the crest's line turned to -z. */
const UP = [ALONG[1], -ALONG[0]];

export function crest(i, off, y, along = 0) {
  const u = i / 19;
  return [
    INTAKE_W[0] + (INTAKE_E[0] - INTAKE_W[0]) * u + UP[0] * off + ALONG[0] * along,
    y,
    INTAKE_W[1] + (INTAKE_E[1] - INTAKE_W[1]) * u + UP[1] * off + ALONG[1] * along,
  ];
}

/* The yaw that turns a body's nose (-z) onto the horizontal (hx, hz). */
const yawTo = (hx, hz) => Math.atan2(-hx, -hz);
const FACE_UP = yawTo(UP[0], UP[1]);
/* The player floats a cast member whose p[1] is this on the water. */
export const WATER = 'water';

/* The hangar's aircraft the film stages: which airframe, and whether the
 * film turns its props (`spins`). Only the war's aircraft (the owner, 3
 * October: "only the war ones should be shown"; configs/airframes.js
 * WAR_AIRFRAMES, which films:lint holds every film to): the Striker, the
 * seven and ten inch warhead quads, the interceptor. */
const CAST = {
  strk: { airframe: 'striker2500' },
  strks: { airframe: 'striker2500', spins: true },
  ten: { airframe: '10inch' },
  ten2: { airframe: '10inch' },
  q1: { airframe: '7inch' },
  q2: { airframe: '7inch' },
  q2s: { airframe: '7inch', spins: true },
  q3: { airframe: '7inch' },
  int: { airframe: 'interceptor' },
  ints: { airframe: 'interceptor', spins: true },
  int2: { airframe: 'interceptor' },
  int3: { airframe: 'interceptor' },
  q4: { airframe: '7inch' },
  q5: { airframe: '7inch' },
  q6: { airframe: '7inch' },
  q7: { airframe: '7inch' },
};

/* The line of aircraft on the crest deck, side by side 3.2 m apart round
 * intake 10.5, noses to the reservoir. */
const LINE = ['ten', 'q1', 'q2', 'q3', 'strk', 'int', 'ten2', 'int2'];
const LINE_AT = 10.5;
const LINE_OFF = 16;
const LINE_GAP = 3.2;
const along = (name) => (LINE.indexOf(name) - (LINE.length - 1) / 2) * LINE_GAP;
const linePlace = (name) => crest(LINE_AT, LINE_OFF, null, along(name));
const standing = (name) => ({ keys: [{ t: 0, p: linePlace(name), yaw: FACE_UP }] });
const lineCast = (except = []) => Object.fromEntries(LINE.filter((n) => !except.includes(n)).map((n) => [n, standing(n)]));

/* A defender climbing out north over the water from `from`: `speed` m/s,
 * `climb` metres over `secs`, nose pitched `pitch`, from `t0` s. */
function rise(from, speed, climb, pitch, t0, secs = 15) {
  const s = speed * secs;
  return {
    keys: [
      { t: t0, p: from, yaw: FACE_UP, pitch },
      { t: t0 + secs, p: [from[0] + UP[0] * s, from[1] + climb, from[2] + UP[1] * s], yaw: FACE_UP, pitch },
    ],
    spin: [[0, 90]],
    from: t0,
  };
}

const LONE_PASS = [150, 228, -2500];

export default {
  id: '2030',
  version: 3,
  cast: CAST,
  routes: {
    /* The lone Striker, low over the water straight at the lens. */
    'lone-low': [[150, 228, -3700], [150, 228, -1900]],
    'ten-low': [[190, 250, -4300], [190, 250, -1900]],
    'wave-low': [[80, 262, -3200], [80, 262, -1900]],
    'wave-west': [[-300, 270, -3100], [-150, 270, -1900]],
    'wave-high': [[600, 420, -3600], [250, 380, -2300]],
    'wave-far': [[180, 250, -3400], [180, 250, -1900]],
  },
  agents: [
    /* Over the lens in the pass, 6.4 m up, 2.5 s in (so on screen 1.5 s
     * before, coming); the telephoto before it sees the same one. */
    {
      id: 'lone', kind: 'strike', route: 'lone-low', n: 1, pass: {
        shot: 'pass', at: 2.5, point: LONE_PASS, seen: 1.0,
      }, shots: ['haze', 'pass'],
    },
    /* The ten in a loose V abreast, their middle 900 m out from the dam
     * at the cut. */
    {
      id: 'ten', kind: 'strike', route: 'ten-low', n: 10, stagger: 0.45, pass: { shot: 'ten', at: { at: 'end' }, point: [190, 250, -2600] }, shots: ['ten'],
    },
    /* The first wave, each group crossing the frame of the last shot's
     * long lens as it widens. */
    {
      id: 'wave', kind: 'strike', route: 'wave-low', n: 6, stagger: 0.6, pass: { shot: 'wave', at: 3, point: [80, 262, -2500] }, shots: ['wave'],
    },
    {
      id: 'west', kind: 'strike', route: 'wave-west', n: 4, stagger: 0.5, pass: { shot: 'wave', at: 13, point: [-193.8, 270, -2250] }, shots: ['wave'],
    },
    {
      id: 'swarm', kind: 'fpv', route: 'wave-far', n: 8, pass: { shot: 'wave', at: 8, point: [180, 250, -2300] }, shots: ['wave'],
    },
    {
      id: 'high', kind: 'loiter', route: 'wave-high', n: 3, pass: { shot: 'wave', at: 10, point: [290.4, 384.6, -2450] }, shots: ['wave'],
    },
  ],
  shots: [
    {
      id: 'dawn',
      min: 6,
      grade: 'dawn',
      lines: [{ line: 'intro-1', lead: 1.5, tail: 1.8 }],
      /* Skimming 3 m over the water toward the dam at dawn. */
      camera: {
        type: 'dolly', lens: 35, path: [[70, 222, -3900], [68, 222.5, -3700], [66, 223, -3500]], look: [60, 228, -1700],
      },
      titles: [{
        text: '2030', from: 1.0, to: { at: 'end', s: -0.6 }, kind: 'year',
      }],
      fade: [[0, 1], [1.2, 0]],
      out: 'dip',
    },
    {
      id: 'haze',
      min: 9,
      grade: 'steel',
      lines: [{ line: 'intro-2', lead: 1.0, tail: 0.8 }],
      /* One Striker, head on, growing out of the haze. */
      camera: {
        type: 'telephoto', lens: 400, ease: 'lin', at: [150, 224, -1950], look: { agent: 'lone' },
      },
      out: 'smash',
    },
    {
      id: 'pass',
      min: 5,
      grade: 'steel',
      /* Low on the water looking north: it passes over the lens. */
      camera: {
        type: 'handheld', lens: 24, at: [150, 221.6, -2500], look: [150, 232, -2700], amp: 0.04, drift: 3,
      },
      out: 'cut',
    },
    {
      id: 'ten',
      min: 6,
      grade: 'steel',
      /* Flying with the ten, 40 m behind and 20 m out from the end of
       * their line, looking across the V: every one wholly in frame, the
       * nearest an aircraft, not a dot (the lead, 3 Oct). */
      camera: {
        type: 'drone', lens: 32, ride: { agent: 'ten', k: 9 }, off: [20, 5, -40], lag: 0, look: { agent: 'ten', k: 6 },
      },
      hero: { agent: 'ten', minPx: 40 },
      out: 'cut',
    },
    {
      id: 'face',
      min: 10,
      grade: 'steel',
      lines: [{ line: 'intro-3', lead: 2.0, tail: 1.2 }],
      /* Up the upstream face from the waterline, over the crest, the
       * output counting up. */
      camera: {
        type: 'crane', lens: 24, base: crest(LINE_AT, 70, 219), h: [3, 70], look: [crest(LINE_AT, 0, 200), crest(LINE_AT, -400, 170)],
      },
      counter: { from: 0.9, to: { at: 'vo.end' } },
      out: 'cut',
    },
    {
      id: 'line',
      min: 9,
      grade: 'warm',
      lines: [{ line: 'intro-4', lead: 1.5, tail: 1.2 }],
      /* Along the line of aircraft on the crest deck; nobody there. */
      camera: {
        type: 'dolly',
        lens: 35,
        path: [crest(LINE_AT, LINE_OFF + 3.2, CREST_Y + 0.8, -13.5), crest(LINE_AT, LINE_OFF + 2.8, CREST_Y + 0.9, 12.5)],
        look: [crest(LINE_AT, LINE_OFF - 1, CREST_Y + 0.2, -10.5), crest(LINE_AT, LINE_OFF - 1, CREST_Y + 0.25, 15.5)],
      },
      cast: lineCast(),
      out: 'cut',
    },
    {
      id: 'props',
      min: 3,
      grade: 'warm',
      lines: [{
        line: 'intro-5', lead: 0.8, tail: 0.8, span: 3,
      }],
      /* A quad's props, close, spinning up. */
      camera: {
        type: 'handheld', lens: 35, at: crest(LINE_AT, LINE_OFF + 0.7, CREST_Y + 0.26, along('q2') + 0.09), look: { cast: 'q2', up: 0.03 }, amp: 0.01, drift: 2,
      },
      cast: {
        ...lineCast(['q2', 'strk']),
        q2: { as: 'q2s', ...standing('q2'), spin: [[0, 0], [0.3, 0], [1.7, 70], [2.5, 90]] },
      },
      out: 'smash',
    },
    {
      id: 'thrown',
      min: 3,
      grade: 'warm',
      /* Behind the Striker just off its rail on the crest, climbing out. */
      camera: {
        type: 'drone', lens: 18, ride: { cast: 'launch' }, back: 4.5, up: 1.0, lag: 250, ease: 'lin',
      },
      cast: {
        launch: {
          as: 'strks',
          keys: [
            { t: 0, p: crest(LINE_AT, 24, CREST_Y + 2.0, 2), yaw: FACE_UP, pitch: 0.21 },
            { t: 3, p: crest(LINE_AT, 24 + 40, CREST_Y + 2.0 + 8.7, 2), yaw: FACE_UP, pitch: 0.21 },
          ],
          spin: [[0, 110]],
        },
      },
      out: 'smash',
    },
    {
      id: 'fan',
      min: 3,
      grade: 'warm',
      /* The interceptor from behind and low, its props spooling. */
      camera: {
        type: 'handheld', lens: 50, at: crest(LINE_AT, LINE_OFF - 1.4, CREST_Y + 0.32, along('int') + 0.5), look: { cast: 'int', up: 0.05 }, amp: 0.008, drift: 1.5,
      },
      cast: {
        ...lineCast(['strk', 'int']),
        int: { as: 'ints', ...standing('int'), spin: [[0, 30], [3, 120]] },
      },
      out: 'cut',
    },
    {
      id: 'wave',
      min: 15,
      grade: 'steel',
      lines: [{ line: 'intro-7', lead: 2.0, tail: 1.0 }],
      /* The first wave on the horizon on a long lens, pulling wide as the
       * defenders climb past it from both banks; then the hand-off. */
      camera: {
        type: 'telephoto', lens: [200, 24], ease: 'io', at: crest(8.5, 20, 231), look: [[90, 262, -2500], [100, 280, -2150]],
      },
      cast: {
        strk: { as: 'strks', ...rise(crest(8.5, 8, 233, 10), 22, 40, 0.2, 7.4) },
        q4: rise(crest(8.5, 23, 227.5, 3), 9, 70, -0.25, 8.2),
        q5: rise(crest(8.5, 22, 227.5, -4), 8, 64, -0.25, 9.5),
        int3: rise(crest(8.5, 6, 233, -12), 20, 45, -0.25, 10.5),
        q6: rise(crest(8.5, 24, 227, 6), 10, 60, -0.25, 12.0),
        q7: rise(crest(8.5, 23, 227.5, -7), 9, 55, -0.25, 13.5),
      },
      titles: [
        {
          mission: true, from: 8.0, to: { at: 'end', s: -0.6 }, kind: 'mission',
        },
        {
          key: 'war.intro.music', from: 9.0, to: { at: 'end', s: -0.6 }, kind: 'credit',
        },
      ],
      out: 'handoff',
    },
  ],
};
