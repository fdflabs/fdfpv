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

/*
 * THE LAST SHOT'S AXIS: its lens on the crest and the wave it looks at.
 * The defenders fly out along it, so its long lens keeps them: climbing
 * out due north they crossed its narrow field 12 degrees off it and were
 * above the frame until its last second (pass 2's measure).
 */
const WAVE_CAM = crest(8.5, 20, 231);
const WAVE_AIM = [90, 246, -2300];
const WAVE_FWD = (() => {
  const d = WAVE_AIM.map((v, k) => v - WAVE_CAM[k]);
  const m = Math.hypot(...d);
  return d.map((v) => v / m);
})();
const WAVE_RIGHT = (() => {
  const h = Math.hypot(WAVE_FWD[0], WAVE_FWD[2]);
  return [-WAVE_FWD[2] / h, 0, WAVE_FWD[0] / h];
})();

/* A defender flying out along that axis from `z` metres ahead of the lens,
 * `x` to its right and `y` over it: `speed` m/s for `secs`, rising `climb`
 * metres more than the axis does, nose pitched `pitch`, from `t0` s. */
function climbOut({
  z, x, y, speed, climb, pitch, t0, secs = 6,
}) {
  const from = [0, 1, 2].map((k) => WAVE_CAM[k] + WAVE_FWD[k] * z + WAVE_RIGHT[k] * x + (k === 1 ? y : 0));
  const s = speed * secs;
  const yaw = yawTo(WAVE_FWD[0], WAVE_FWD[2]);
  return {
    keys: [
      { t: t0, p: from, yaw, pitch },
      { t: t0 + secs, p: [from[0] + WAVE_FWD[0] * s, from[1] + WAVE_FWD[1] * s + climb, from[2] + WAVE_FWD[2] * s], yaw, pitch },
    ],
    spin: [[0, 90]],
    from: t0,
  };
}

const LONE_PASS = [150, 228, -2500];

export default {
  id: '2030',
  version: 5,
  cast: CAST,
  routes: {
    /* The lone Striker, low over the water straight at the lens. */
    'lone-low': [[150, 228, -3700], [150, 228, -1900]],
    'ten-low': [[190, 250, -4300], [190, 250, -1900]],
    'wave-low': [[85, 236, -3200], [85, 236, -1900]],
    'wave-west': [[-200, 250, -3100], [-60, 250, -1900]],
    'wave-high': [[150, 266, -3600], [110, 262, -2000]],
    'wave-far': [[100, 240, -3400], [100, 240, -1900]],
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
    /* The first wave: three Strikers low over the water, head on into
     * the last shot's long lens, sky above them and the reservoir under
     * the horizon; the swarm and the high Loiterers behind them on the
     * same bearing, and a group to the west that the lens finds as it
     * widens. */
    {
      id: 'wave', kind: 'strike', route: 'wave-low', n: 2, stagger: 0.6, pass: { shot: 'wave', at: 3, point: [85, 236, -2300] }, shots: ['wave'],
    },
    {
      id: 'west', kind: 'strike', route: 'wave-west', n: 4, stagger: 0.5, pass: { shot: 'wave', at: 14.9, point: [-100.8, 250, -2250] }, shots: ['wave'],
    },
    {
      id: 'swarm', kind: 'fpv', route: 'wave-far', n: 8, pass: { shot: 'wave', at: 8, point: [100, 240, -2600] }, shots: ['wave'],
    },
    {
      id: 'high', kind: 'loiter', route: 'wave-high', n: 3, pass: { shot: 'wave', at: 13, point: [120, 263, -2400] }, shots: ['wave'],
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
      /* One Striker, head on, growing out of the haze: the lens a metre
       * over the water close under its line, so the sky is behind it from
       * the first frame (the horizon is under the frame's foot, and with
       * it the far bank's map edge) and it closes from 300 m to 60 m,
       * looming as it comes. The pass is from just past here. */
      camera: {
        type: 'telephoto', lens: 400, ease: 'lin', at: [153, 220.8, -2510], look: { agent: 'lone' },
      },
      hero: { agent: 'lone', minPx: 150 },
      out: 'smash',
    },
    {
      id: 'pass',
      min: 5,
      grade: 'steel',
      /* Low on the water, the lens held on it: it comes on, passes over
       * and to the right, and the lens whips round after it as it goes on
       * for the dam. Off its line, so the lens never looks straight up. */
      camera: {
        type: 'handheld', lens: 24, at: [144, 221.6, -2500], look: { agent: 'lone' }, amp: 0.04, drift: 3,
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
      grade: 'warm-grad',
      lines: [{ line: 'intro-4', lead: 1.5, tail: 1.2 }],
      /* Down the line of aircraft on the crest deck; nobody there. Low,
       * off the line's west end and in front of the noses, looking along
       * the row as the dolly creeps in: the whole line recedes in the
       * frame, nearest first, and the ones near the lens slide out of it
       * as it closes. Beside the row, not along it, it held one or two
       * aircraft at a time and ran past the end onto an empty deck. */
      camera: {
        type: 'dolly',
        lens: 75,
        path: [crest(LINE_AT, LINE_OFF + 2.6, CREST_Y + 0.32, -20), crest(LINE_AT, LINE_OFF + 2.2, CREST_Y + 0.3, -16.5)],
        look: [crest(LINE_AT, LINE_OFF - 0.2, CREST_Y + 0.9, 0), crest(LINE_AT, LINE_OFF - 0.2, CREST_Y + 0.9, 6)],
      },
      /* The quads only: the Striker stands on the lowest point of its
       * build, a thin part under the fuselage, so down the row it read as
       * a missile hung in the air over the quads. It has the thrown shot. */
      cast: lineCast(['strk']),
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
      /* The first wave on a long lens from the crest, head on, the
       * horizon in the frame's lower third; held long, then pulling wide
       * late as the defenders climb past it from both banks and the look
       * lifts over the contacts for the title; then the hand-off. */
      camera: {
        type: 'telephoto', lens: [540, 24], ease: 'in', at: WAVE_CAM, look: [[82.5, 236.5, -2300], [95, 262, -2300]],
      },
      hero: { agent: 'wave', minPx: 110, to: 9 },
      cast: {
        strk: { as: 'strks', ...climbOut({ z: 14, x: 2.5, y: -2.5, speed: 22, climb: 3, pitch: 0.2, t0: 10.0 }) },
        q4: climbOut({ z: 8, x: -1.8, y: -1.4, speed: 10, climb: 1.5, pitch: -0.25, t0: 10.6 }),
        q5: climbOut({ z: 6, x: 1.4, y: -1.6, speed: 9, climb: 1.5, pitch: -0.25, t0: 11.3 }),
        int3: climbOut({ z: 10, x: -3, y: -2, speed: 18, climb: 2.5, pitch: -0.25, t0: 11.9 }),
        q6: climbOut({ z: 5, x: 0.8, y: -1.2, speed: 10, climb: 1.5, pitch: -0.25, t0: 12.5 }),
        q7: climbOut({ z: 5, x: -1.1, y: -1.3, speed: 9, climb: 1.5, pitch: -0.25, t0: 13.2 }),
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
