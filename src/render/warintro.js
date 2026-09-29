/*
 * warintro.js: "2030", the war mode's cinematic intro
 * (docs/WARFARE-PLAN.md section 7.1), played in engine on the Itaipu map.
 *
 * THE FILM IS DATA. SHOTS below is the seven shots of the plan's table:
 * each one's camera as keyframes, which voice line starts when, which
 * attackers fly which routes (src/share/war/routes.js, the function the
 * room and every screen fly them by), which of the hangar's aircraft
 * stand or fly where (the game's own builders, src/render/craft.js), the
 * title cards, the output counter and the feed's static. Times are
 * milliseconds from the shot's start; each shot's length is
 * src/share/war/intro.js SHOT_MS, which the room's briefing also sums.
 *
 * THE PLAYER. play(scene, camera, opts) stages the film's scenery in the
 * scene and returns a handle; its owner calls handle.frame(nowMs) once a
 * rendered frame, after its own camera logic and before the draw, and the
 * frame poses the camera, the attackers and the aircraft, and runs the
 * overlays. It owns no animation loop, so it cannot fight the shell's
 * camera for the frame. Any key, click or tap skips; with holdUntilMs set
 * (a room's briefing still running) the camera then circles the dam over
 * a "Briefing: N s" line until then. handle.done resolves when it is over,
 * skipped past the hold, or disposed; dispose() takes everything back out.
 *
 * SOUND. The voice (assets/audio/war/voice/<lang>/intro-N) and the music
 * (music/intro) are media elements. With the shell's MotorAudio running,
 * they go into its graph ahead of the master, so the volume and the mute
 * settings hold for them as for everything else, and the shell's own
 * music bed is paused for the length. Without it, or before a gesture has
 * started it, the elements play direct at the same volume setting, and a
 * browser that blocks them leaves the subtitles, which run on the clock
 * whatever the audio does. The subtitles are lines.json's text in the
 * page's language, shown for each file's measured length (manifest.json).
 *
 * CONTENT. The enemy is never named and wears no markings (attackers.js
 * builds them unmarked); no person is shown, harmed or otherwise: the
 * aircraft stand on their own, the thrown one is already in the air.
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

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createAttackers } from './attackers.js';
import { celMaterial } from './celmat.js';
import { createFpvFail } from './fpvfail.js';
import { craftBuilderFor } from './craft.js';
import { planAgent, poseAt } from '../share/war/routes.js';
import { SHOT_MS, INTRO_MS } from '../share/war/intro.js';
import itaipu1 from '../share/war/missions/itaipu-1.js';
import { str, currentLocale } from '../strings/index.js';

export { INTRO_MS };

/* ------------------------------------------------------------ the frame */

/* The intakes' line on the upstream face, west to east (ITAIPU-PLAN
 * section 2 frame, the mission's own numbers), and the crest's height. */
const INTAKE_W = [-202.2, -1794.2];
const INTAKE_E = [430.8, -1655.0];
const CREST_Y = 225;
const WATER_Y = 219;
const ALONG = (() => {
  const dx = INTAKE_E[0] - INTAKE_W[0];
  const dz = INTAKE_E[1] - INTAKE_W[1];
  const m = Math.hypot(dx, dz);
  return [dx / m, dz / m];
})();
/* Upstream, toward the reservoir: the crest's line turned to -z. */
const UP = [ALONG[1], -ALONG[0]];

/* A point on the crest: intake i's place (fractional), `off` metres
 * upstream of the intake line, `along` metres east along it, at y. The
 * crest's top runs from about 5 m downstream of the line to 35 m up. */
function crest(i, off, y, along = 0) {
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
const FACE_EAST = yawTo(ALONG[0], ALONG[1]);

/* The dam's middle, which the briefing's orbit circles. */
const DAM = [59, 212, -1672];

/* ------------------------------------------------------------ the cast */

/*
 * The hangar's aircraft the film stages, by name: which airframe, and
 * whether a shot turns its props where they can be seen (`spins`). Every
 * one carries its warhead slung under (section 6.3: "a warhead under
 * every belly"). Built once when the film starts, shown only in the
 * shots that list them.
 */
const CAST = {
  p51: { airframe: 'p51d1450' },
  cub: { airframe: 'cub1400' },
  q1: { airframe: '5inch' },
  q2: { airframe: '5inch' },
  q2s: { airframe: '5inch', spins: true },
  q3: { airframe: '5inch' },
  sky: { airframe: 'sky1800' },
  skys: { airframe: 'sky1800', spins: true },
  f16: { airframe: 'f16878' },
  timber: { airframe: 'timber1500' },
  float: { airframe: 'timber1500f', spins: true },
  zagi: { airframe: 'zagi1219' },
  q4: { airframe: '5inch' },
  q5: { airframe: '5inch' },
  q6: { airframe: '5inch' },
  q7: { airframe: '5inch' },
};

/* Shot 4's line on the crest: the aircraft side by side 3.2 m apart
 * along the middle of the crest's deck (its downstream parapet is a wall
 * from about 0 to 5 m upstream of the intake line, the intakes'
 * servomotor houses stand at about 30), round intake 10.5, noses toward
 * the reservoir, where the camera stands, the parapet behind them. */
const LINE = ['p51', 'cub', 'q1', 'q2', 'q3', 'sky', 'f16', 'timber'];
const LINE_AT = 10.5;
const LINE_OFF = 16;
const LINE_GAP = 3.2;
function linePlace(name) {
  return crest(LINE_AT, LINE_OFF, null, linePlaceAlong(name));
}
const standing = (name) => ({ keys: [{ t: 0, p: linePlace(name), yaw: FACE_UP }] });

/* ------------------------------------------------------------ the routes */

/* The film's own routes, in the mission's form, over the reservoir north
 * of the dam. The attackers fly them by routes.js, as in a game. */
const ROUTES = {
  /* Shot 2: the lone Striker straight over the camera, then the ten. */
  'lone-low': [[150, 236, -3700], [150, 236, -1900]],
  'ten-low': [[190, 250, -4300], [190, 250, -1900]],
  /* Shot 7: the first wave out over the water, and scouts high. */
  'wave-low': [[80, 262, -3200], [80, 262, -1900]],
  'wave-west': [[-300, 270, -3100], [-150, 270, -1900]],
  'wave-high': [[600, 420, -3600], [250, 380, -2300]],
  'wave-far': [[180, 250, -3400], [180, 250, -1900]],
};
const STAGE_MISSION = { routes: ROUTES, targets: itaipu1.targets };

/* ------------------------------------------------------------ the shots */

/*
 * Each shot:
 *   voice   the line (lines.json id) and when it starts
 *   cam     keyframes { t, p, look, fov, roll }: look is a point, or a
 *           cast member's name to follow; `cut: true` starts a new camera
 *           set up there with no move from the one before; `shake` is
 *           metres of hand held jitter
 *   cast    { name: { keys: [{ t, p, yaw, pitch, roll }], spin: [[t, rad/s]] } };
 *           a p with y null stands on the ground, WATER floats
 *   agents  [{ kind, route, n, t0, stagger }]: a group born at t0 (shot
 *           ms, before the shot is fine), each rank `stagger` ms behind
 *           the middle one, so a line abreast reads as a V
 *   titles  [{ key or text, from, to, kind }]
 *   counter { from, to }: the output counting up to 14 000 MW
 *   snow    [[t, level]]: the feed's static, fpvfail's signal()
 *   fade    [[t, black]]: to and from black
 *   grade   the shot's colour grade, one of GRADES
 */
const WATER = 'water';

export const SHOTS = [
  {
    id: 'dawn',
    voice: { line: 'intro-1', at: 2600 },
    grade: 'dawn',
    cam: [
      { t: 0, p: [70, 262, -3900], look: [60, 238, -1700], fov: 38 },
      { t: 7000, p: [66, 250, -3540], look: [60, 234, -1700], fov: 36 },
    ],
    titles: [{ text: '2030', from: 1500, to: 6200, kind: 'year' }],
    fade: [[0, 1], [1400, 1], [3200, 0], [6600, 0], [7000, 0.6]],
  },
  {
    id: 'swarm',
    voice: { line: 'intro-2', at: 3000 },
    grade: 'steel',
    cam: [
      { t: 0, p: [138, 222.4, -2920], look: [150, 236, -3400], fov: 50 },
      { t: 2600, p: [139, 222.6, -2905], look: [150, 252, -3000], fov: 52 },
      { t: 4600, p: [140, 222.8, -2890], look: [185, 250, -3500], fov: 46 },
      { t: 7600, p: [141, 223.0, -2875], look: [190, 262, -3000], fov: 50 },
      { t: 9200, p: [141.5, 223.1, -2868], look: [190, 300, -2860], fov: 58 },
      { t: 11000, p: [142, 223.2, -2860], look: [195, 262, -2450], fov: 56 },
    ],
    /* The lone one passes 13 m over the camera at 2.4 s; the ten are
     * 1.1 km out at 4 s and pass beside it at about 9 s. */
    agents: [
      { kind: 'strike', route: 'lone-low', n: 1, t0: 2400 - (780 / 38) * 1000 },
      {
        kind: 'strike', route: 'ten-low', n: 10, t0: 9000 - (1440 / 38) * 1000, stagger: 450,
      },
    ],
    fade: [[0, 0.6], [500, 0]],
  },
  {
    id: 'crest',
    voice: { line: 'intro-3', at: 2400 },
    grade: 'steel',
    cam: [
      { t: 0, p: crest(1, -190, 262), look: crest(4, 0, 205), fov: 42 },
      { t: 10000, p: crest(13, -175, 256), look: crest(16, 0, 200), fov: 42 },
    ],
    counter: { from: 900, to: 3600 },
  },
  {
    id: 'hangar',
    voice: { line: 'intro-4', at: 2000 },
    grade: 'warm',
    cam: [
      { t: 0, p: crest(LINE_AT, LINE_OFF + 3.2, CREST_Y + 0.8, -13.5), look: crest(LINE_AT, LINE_OFF - 1, CREST_Y + 0.2, -10.5), fov: 40 },
      { t: 10000, p: crest(LINE_AT, LINE_OFF + 2.8, CREST_Y + 0.9, 12.5), look: crest(LINE_AT, LINE_OFF - 1, CREST_Y + 0.25, 15.5), fov: 40 },
    ],
    cast: Object.fromEntries(LINE.map((n) => [n, standing(n)])),
  },
  {
    id: 'spinup',
    voice: { line: 'intro-5', at: 1500 },
    grade: 'warm',
    cam: [
      /* The quad's props, close. */
      {
        t: 0, p: crest(LINE_AT, LINE_OFF + 0.75, CREST_Y + 0.28, linePlaceAlong('q2') + 0.12), fov: 40, lookAt: 'q2', lookUp: 0.03,
      },
      {
        t: 2500, p: crest(LINE_AT, LINE_OFF + 0.62, CREST_Y + 0.24, linePlaceAlong('q2') + 0.05), fov: 36, lookAt: 'q2', lookUp: 0.03,
      },
      /* The Skyhunter, already thrown, climbing out over the water. */
      {
        t: 2500, cut: true, p: crest(LINE_AT, 20, CREST_Y + 1.2, 0.5), fov: 48, lookAt: 'launch',
      },
      { t: 5000, p: crest(LINE_AT, 42, CREST_Y + 4.6, -1), fov: 34, lookAt: 'launch' },
      /* The float plane taxiing on the reservoir, beside it at the water. */
      {
        t: 5000, cut: true, p: crest(6, 95, WATER_Y + 0.7, -8), fov: 42, lookAt: 'float', lookUp: 0.2,
      },
      { t: 7500, p: crest(6, 95, WATER_Y + 0.7, 4.5), fov: 42, lookAt: 'float', lookUp: 0.2 },
      /* The F-16 spooling, from behind and low. */
      {
        t: 7500, cut: true, p: crest(LINE_AT, LINE_OFF - 2.1, CREST_Y + 0.42, linePlaceAlong('f16') + 0.7), fov: 48, lookAt: 'f16', lookUp: 0.05, shake: 0.002,
      },
      {
        t: 10000, p: crest(LINE_AT, LINE_OFF - 1.8, CREST_Y + 0.4, linePlaceAlong('f16') + 0.5), fov: 46, lookAt: 'f16', lookUp: 0.05, shake: 0.012,
      },
    ],
    cast: {
      ...Object.fromEntries(LINE.filter((n) => n !== 'sky').map((n) => [n, standing(n)])),
      q2: { as: 'q2s', ...standing('q2'), spin: [[0, 0], [300, 0], [1700, 70], [2500, 90]] },
      f16: {
        keys: [
          { t: 0, p: linePlace('f16'), yaw: FACE_UP },
          { t: 9000, p: linePlace('f16'), yaw: FACE_UP },
          { t: 10000, p: crest(LINE_AT, LINE_OFF + 1.2, null, linePlaceAlong('f16')), yaw: FACE_UP },
        ],
        spin: [[7500, 5], [9000, 60], [10000, 120]],
      },
      /* Thrown at 2.3 s from the reservoir side of the crest, 13 m/s and
       * climbing at 12 degrees, chased by the camera. */
      launch: {
        as: 'skys',
        keys: [
          { t: 2300, p: crest(LINE_AT, 24, CREST_Y + 2.0, 2), yaw: FACE_UP, pitch: 0.21 },
          { t: 5000, p: crest(LINE_AT, 24 + 34, CREST_Y + 2.0 + 7.4, 2), yaw: FACE_UP, pitch: 0.21 },
        ],
        spin: [[2300, 110]],
      },
      float: {
        keys: [
          { t: 5000, p: crest(6, 106, WATER, -12), yaw: FACE_EAST },
          { t: 7500, p: crest(6, 106, WATER, 1), yaw: FACE_EAST },
        ],
        spin: [[5000, 60]],
        bob: 0.04,
      },
    },
    fade: [[0, 0.5], [250, 0]],
  },
  {
    id: 'gorge',
    voice: { line: 'intro-6', at: 2000 },
    grade: 'fpv',
    fpv: true,
    cam: [
      { t: 0, p: [-10, 142, -1200], look: [-90, 116, -940], fov: 72, roll: 0.05 },
      { t: 3000, p: [-130, 116, -930], look: [-200, 114, -640], fov: 72, roll: -0.35 },
      { t: 6000, p: [-230, 121, -760], look: [-290, 136, -470], fov: 72, roll: 0.25 },
      { t: 9000, p: [-300, 170, -640], look: [-370, 205, -390], fov: 72, roll: -0.1 },
    ],
    snow: [[0, 0], [1100, 0], [1700, 0.55], [2300, 1], [3700, 0.95], [4300, 0.5], [4700, 0.2], [5300, 0.35], [5900, 0], [9000, 0]],
    fade: [[0, 0.8], [250, 0]],
  },
  {
    id: 'wave',
    voice: { line: 'intro-7', at: 1600 },
    grade: 'steel',
    /* From the crest, tight on the wave coming in over the water, then
     * wide as the defenders climb past the camera to meet it. */
    cam: [
      { t: 0, p: crest(8.5, 20, 231), look: [90, 262, -2500], fov: 11 },
      { t: 3400, p: crest(8.5, 19.5, 231.2), look: [95, 262, -2400], fov: 14 },
      { t: 6400, p: crest(8.5, 18, 231.6), look: [100, 268, -2300], fov: 55 },
      { t: 13000, p: crest(8.5, 16, 232.4), look: [100, 276, -2200], fov: 60 },
    ],
    agents: [
      {
        kind: 'strike', route: 'wave-low', n: 6, t0: -19000, stagger: 600,
      },
      {
        kind: 'strike', route: 'wave-west', n: 4, t0: -16000, stagger: 500,
      },
      { kind: 'fpv', route: 'wave-far', n: 8, t0: -30000 },
      { kind: 'loiter', route: 'wave-high', n: 3, t0: -30000 },
    ],
    /* Rising past the lens from both banks, close enough to read at their
     * size (a quad is a quarter metre): the quads climb into the frame
     * from under it, the planes pass from behind the camera. */
    cast: {
      p51: rise(crest(8.5, 8, 233, 10), 22, 25, 0.2, 5400),
      q4: rise(crest(8.5, 23, 227.5, 3), 9, 45, -0.25, 6000),
      q5: rise(crest(8.5, 22, 227.5, -4), 8, 42, -0.25, 7000),
      zagi: rise(crest(8.5, 6, 233, -12), 20, 30, 0.2, 7400),
      q6: rise(crest(8.5, 24, 227, 6), 10, 48, -0.25, 8200),
      q7: rise(crest(8.5, 23, 227.5, -7), 9, 40, -0.25, 9400),
    },
    titles: [
      {
        key: 'war.intro.defend', sub: 'war.intro.mission', from: 7200, to: 12400, kind: 'mission',
      },
      { key: 'war.intro.music', from: 8200, to: 12400, kind: 'credit' },
    ],
    fade: [[0, 0.5], [300, 0], [12300, 0], [13000, 1]],
  },
];

/* The along offset of a line place, for the cameras that sit by one. */
function linePlaceAlong(name) {
  return (LINE.indexOf(name) - (LINE.length - 1) / 2) * LINE_GAP;
}

/* A defender climbing out north over the water from `from`: `speed` m/s,
 * `climb` metres over the shot, nose pitched `pitch` (a quad noses down to
 * fly, a plane up to climb), from `t0`. */
function rise(from, speed, climb, pitch, t0) {
  const t1 = 13000;
  const s = (speed * (t1 - t0)) / 1000;
  return {
    keys: [
      { t: t0, p: from, yaw: FACE_UP, pitch },
      { t: t1, p: [from[0] + UP[0] * s, from[1] + climb, from[2] + UP[1] * s], yaw: FACE_UP, pitch },
    ],
    spin: [[0, 90]],
    from: t0,
  };
}

/* The warhead's olive drab. */
const WARHEAD = 0x5b6140;

/*
 * Everything drawn under `root` as one draw call: its visible meshes but
 * those under `skip` merged into one geometry in root's frame, each
 * part's colour baked into its vertices, under the one cel material
 * `mat` (the way attackers.js draws a kind); sprites, lines and hidden
 * parts go. The builders' parts are a draw call each, forty for a quad,
 * and the map at Itaipu already spends up to 290 of the 300 a view
 * (ITAIPU-PLAN section 13). Textures are lost, which at a lite build's
 * plain colours is nothing.
 */
function bake(root, mat, skip = []) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const skipped = new Set();
  for (const k of skip) {
    k.traverse((o) => skipped.add(o));
  }
  const shown = (o) => {
    for (let x = o; x && x !== root; x = x.parent) {
      if (!x.visible) {
        return false;
      }
    }
    return true;
  };
  const geos = [];
  const going = [];
  const m = new THREE.Matrix4();
  root.traverse((o) => {
    if (skipped.has(o) || !(o.isMesh || o.isSprite || o.isLine || o.isPoints)) {
      return;
    }
    going.push(o);
    if (!o.isMesh || !shown(o)) {
      return;
    }
    const src = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', src.attributes.position.clone());
    if (src.attributes.normal) {
      g.setAttribute('normal', src.attributes.normal.clone());
    } else {
      g.computeVertexNormals();
    }
    if (src !== o.geometry) {
      src.dispose();
    }
    g.applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld));
    const material = Array.isArray(o.material) ? o.material[0] : o.material;
    const c = material && material.color ? material.color : new THREE.Color(0x888888);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g);
  });
  /* A skipped part under one that goes moves up to the nearest that
   * stays, where it is. */
  const gone = new Set(going);
  for (const k of skip) {
    let up = k.parent;
    while (gone.has(up)) {
      up = up.parent;
    }
    if (up !== k.parent) {
      up.attach(k);
    }
  }
  for (const o of going) {
    o.parent.remove(o);
  }
  if (!geos.length) {
    return;
  }
  const one = new THREE.Mesh(mergeGeometries(geos, false), mat);
  for (const g of geos) {
    g.dispose();
  }
  one.name = `${root.name || 'part'}-baked`;
  root.add(one);
}

/*
 * An aircraft from the game's builder, baked: one draw call, or with
 * `spins` one more per rotor, each rotor its own call so it can turn. The
 * blur discs go either way: a still one is a blur of nothing, and a
 * turning rotor under the camera's frame rate reads as a real one does on
 * video.
 */
function bakeCraft(holder, built, spins, mat) {
  for (const d of built.discs || []) {
    d.parent.remove(d);
  }
  const rotors = spins ? (built.blades || []) : [];
  for (const r of rotors) {
    bake(r, mat);
  }
  bake(holder, mat, rotors);
}

/* Each shot's start, intro ms. */
const STARTS = SHOT_MS.map((_, i) => SHOT_MS.slice(0, i).reduce((a, b) => a + b, 0));
if (SHOTS.length !== SHOT_MS.length) {
  throw new Error(`warintro: ${SHOTS.length} shots, but intro.js times ${SHOT_MS.length}`);
}

/* The colour grade over each shot: a CSS filter on the world's canvas and
 * a tint laid over it. */
const GRADES = {
  dawn: { filter: 'contrast(1.12) saturate(0.8) brightness(0.95)', tint: 'linear-gradient(180deg, rgba(255,150,70,0.22), rgba(255,120,60,0.06) 55%, rgba(20,40,70,0.18))' },
  steel: { filter: 'contrast(1.14) saturate(0.62) brightness(0.96)', tint: 'linear-gradient(180deg, rgba(40,70,90,0.18), rgba(30,50,60,0.06) 50%, rgba(10,20,30,0.22))' },
  warm: { filter: 'contrast(1.1) saturate(0.72) brightness(0.97)', tint: 'linear-gradient(180deg, rgba(255,170,90,0.12), rgba(40,60,70,0.12))' },
  /* None on the feed: the static's sync tears move the canvas, and a
   * filtered canvas that moves is refiltered every frame. */
  fpv: { filter: 'none', tint: 'none' },
};

/* The music's level against the stem the settings call music, and how far
 * it ducks under a voice line. */
const MUSIC_GAIN = 1.4;
const DUCK = 0.45;
const SUB_TAIL_MS = 500;

/* The briefing's orbit: once round the dam in ORBIT_MS. */
const ORBIT_R = 820;
const ORBIT_Y = 430;
const ORBIT_MS = 150000;

/* ---------------------------------------------------------- the player */

const smooth = (u) => u * u * (3 - 2 * u);

/* Piecewise linear over [[t, v], ...], held at the ends. */
function track(pairs, t) {
  if (!pairs || !pairs.length) {
    return 0;
  }
  if (t <= pairs[0][0]) {
    return pairs[0][1];
  }
  for (let i = 1; i < pairs.length; i += 1) {
    if (t <= pairs[i][0]) {
      const [t0, v0] = pairs[i - 1];
      const [t1, v1] = pairs[i];
      return t1 > t0 ? v0 + (v1 - v0) * ((t - t0) / (t1 - t0)) : v1;
    }
  }
  return pairs[pairs.length - 1][1];
}

/* The integral of track() from 0 to t: a spin's angle from its rate. */
function trackArea(pairs, t) {
  let a = 0;
  let prevT = 0;
  let prevV = track(pairs, 0);
  const points = pairs.map((p) => p[0]).filter((x) => x > 0 && x < t);
  for (const x of [...points, t]) {
    const v = track(pairs, x);
    a += ((prevV + v) / 2) * (x - prevT);
    prevT = x;
    prevV = v;
  }
  return a / 1000;
}

/* A shot's camera keys split at its cuts, each run a Catmull-Rom curve
 * through its positions, timed so the curve passes each key at its t. */
function cameraRuns(keys) {
  const runs = [];
  for (const k of keys) {
    if (!runs.length || k.cut) {
      runs.push([]);
    }
    runs[runs.length - 1].push(k);
  }
  return runs.map((run) => {
    const pts = run.map((k) => new THREE.Vector3(...k.p));
    const looks = run.map((k) => (Array.isArray(k.look) && !k.lookAt ? new THREE.Vector3(...k.look) : null));
    return {
      keys: run,
      from: run[0].t,
      to: run[run.length - 1].t,
      path: pts.length > 1 ? new THREE.CatmullRomCurve3(pts) : null,
      point: pts[0],
      look: looks.every(Boolean) && looks.length > 1 ? new THREE.CatmullRomCurve3(looks) : null,
      lookPoint: looks[0],
    };
  });
}

/* Where a run is at shot ms t: its curve parameter. */
function runU(run, t) {
  const ks = run.keys;
  if (ks.length < 2 || t <= ks[0].t) {
    return 0;
  }
  for (let i = 1; i < ks.length; i += 1) {
    if (t <= ks[i].t) {
      const u = (t - ks[i - 1].t) / Math.max(1, ks[i].t - ks[i - 1].t);
      return (i - 1 + u) / (ks.length - 1);
    }
  }
  return 1;
}

/* A key field interpolated over a run at t, linear between keys. */
function runField(run, t, field, dflt) {
  const pairs = run.keys.filter((k) => k[field] != null).map((k) => [k.t, k[field]]);
  return pairs.length ? track(pairs, t) : dflt;
}

function format() {
  const a = document.createElement('audio');
  return a.canPlayType(str('music.audio_webm_codecs_opus')) !== '' ? 'webm' : 'mp3';
}

/* A style written only when it changes: the overlay is set every frame,
 * and a write of the same value still costs the page a style pass. */
const written = new WeakMap();
function put(e, prop, v) {
  let w = written.get(e);
  if (!w) {
    w = {};
    written.set(e, w);
  }
  if (w[prop] !== v) {
    w[prop] = v;
    e.style[prop] = v;
  }
}

function el(tag, css, parent, text) {
  const e = document.createElement(tag);
  e.style.cssText = css;
  if (text != null) {
    e.textContent = text;
  }
  if (parent) {
    parent.appendChild(e);
  }
  return e;
}

const TITLE_FONT = 'Impact, "Oswald", "Bebas Neue", "Arial Narrow", "Helvetica Neue", var(--ui-font, sans-serif)';

/*
 * Play the intro. `scene` and `camera` are the shell's; opts:
 *   canvas       the world's canvas (the grade and the feed's static go
 *                on it), default #view
 *   audio        the shell's MotorAudio, or null
 *   ground(x, z) the ground's height, for the aircraft standing on it
 *   startMs      where in the film to start (a pilot joining a briefing
 *                late starts where the room is), default 0
 *   holdUntilMs  performance.now() the room's briefing ends, or null
 *   base         where the audio lives, default 'assets/audio/war/'
 */
export function play(scene, camera, opts = {}) {
  const canvas = opts.canvas || document.getElementById('view');
  const ground = opts.ground || (() => CREST_Y);
  const base = opts.base || 'assets/audio/war/';
  const lang = currentLocale() === 'es' ? 'es' : 'en';
  const audio = opts.audio || null;

  const root = new THREE.Group();
  root.name = 'war-intro';
  scene.add(root);
  const attackers = createAttackers();
  root.add(attackers.group);

  /* The cast, built once, hidden until a shot shows it. */
  const cast = new Map();
  const box = new THREE.Box3();
  const bakedMat = celMaterial({ color: 0xffffff });
  bakedMat.vertexColors = true;
  for (const [name, def] of Object.entries(CAST)) {
    /* Lite: the Settings studio's build, the same silhouette with no ink
     * hulls or shadow casters, so eight on the crest cost what one full
     * build does against the 300 call budget. */
    const built = craftBuilderFor(def.airframe)({
      name: `intro-${name}`, fog: true, worldScale: true, lite: true,
    });
    const holder = new THREE.Group();
    holder.add(built.group);
    /* Stand it on its lowest point: the builders' origin is the CG. */
    built.group.updateMatrixWorld(true);
    box.setFromObject(built.group);
    const size = box.getSize(new THREE.Vector3());
    built.group.position.y = -box.min.y;
    /* The warhead, slung under the belly between the gear, a tube of a
     * size to the aircraft. */
    const quad = def.airframe === '5inch';
    const len = quad ? 0.16 : Math.min(0.42, size.z * 0.22);
    const r = quad ? 0.024 : len * 0.12;
    const wh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: WARHEAD }));
    wh.position.set(0, quad ? -box.min.y - r * 0.2 : size.y * 0.24, quad ? 0.01 : -size.z * 0.05);
    holder.add(wh);
    bakeCraft(holder, built, Boolean(def.spins), bakedMat);
    holder.visible = false;
    root.add(holder);
    cast.set(name, {
      holder,
      built,
      lift: quad ? r * 1.6 : 0,
      /* Each rotor's own turn as built: a spin is added to it. */
      base: (built.blades || []).map((b) => b.rotation.y),
    });
  }
  /* A shot's name for a cast member, or the one it plays (`as`): the
   * thrown Skyhunter and the spinning quad are their turning copies. */
  const who = (name, def) => cast.get(def && def.as ? def.as : name);

  /* The shots, prepared. */
  const shots = SHOTS.map((s, i) => ({
    ...s,
    start: STARTS[i],
    ms: SHOT_MS[i],
    runs: cameraRuns(s.cam),
    plans: (s.agents || []).flatMap((g, gi) => Array.from({ length: g.n }, (_, k) => {
      const rank = Math.abs(k - (g.n - 1) / 2);
      const plan = planAgent(STAGE_MISSION, {
        id: 1000 * i + 100 * gi + k, kind: g.kind, route: g.route, t0: STARTS[i] + g.t0 + (g.stagger || 0) * rank, k, n: g.n, err: 0, target: null,
      });
      return { id: 1000 * i + 100 * gi + k, kind: g.kind, plan };
    })),
  }));

  /* ------------------------------------------------------- the overlay */
  const overlay = el('div', 'position:fixed;inset:0;z-index:9000;pointer-events:none;overflow:hidden;'
    + 'font-family:var(--ui-font, sans-serif);color:#f1ece0;', document.body);
  overlay.dataset.warIntro = '1';
  const tint = el('div', 'position:absolute;inset:0;', overlay);
  el('div', 'position:absolute;inset:0;background:radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%);', overlay);
  const barCss = 'position:absolute;left:0;right:0;height:max(0px, calc((100vh - 100vw / 2.39) / 2));background:#000;';
  el('div', `${barCss}top:0;`, overlay);
  el('div', `${barCss}bottom:0;`, overlay);
  /* The layers that fade are their own compositor layers, so a fade is
   * an opacity on the GPU and not a repaint. */
  const black = el('div', 'position:absolute;inset:0;background:#000;opacity:1;will-change:opacity;', overlay);
  const titleBox = el('div', 'position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;opacity:0;will-change:opacity;', overlay);
  const titleMain = el('div', `font-family:${TITLE_FONT};font-weight:900;text-transform:uppercase;line-height:0.95;`
    + 'text-shadow:0 0 24px rgba(0,0,0,0.55);', titleBox);
  const titleSub = el('div', `font-family:${TITLE_FONT};font-weight:700;text-transform:uppercase;letter-spacing:0.5em;`
    + 'font-size:clamp(14px, 2.2vw, 30px);margin-top:0.8em;color:#d9b36a;', titleBox);
  const credit = el('div', 'position:absolute;right:4vw;bottom:calc(max(0px, (100vh - 100vw / 2.39) / 2) + 1.2em);'
    + 'font-size:clamp(9px, 0.9vw, 12px);opacity:0;color:#cfc9bb;letter-spacing:0.04em;', overlay);
  const sub = el('div', 'position:absolute;left:8vw;right:8vw;bottom:calc(max(0px, (100vh - 100vw / 2.39) / 2) + 3.2em);'
    + 'text-align:center;font-size:clamp(15px, 1.7vw, 26px);font-weight:600;line-height:1.35;'
    + 'text-shadow:0 1px 3px #000, 0 0 12px rgba(0,0,0,0.8);opacity:0;', overlay);
  const counter = el('div', 'position:absolute;left:5vw;top:calc(max(0px, (100vh - 100vw / 2.39) / 2) + 2.4em);'
    + 'font-family:ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;letter-spacing:0.08em;opacity:0;', overlay);
  const counterLabel = el('div', 'font-size:clamp(11px, 1vw, 14px);color:#9fd8a8;text-transform:uppercase;', counter, str('war.output'));
  const counterValue = el('div', 'font-size:clamp(24px, 3vw, 44px);font-weight:800;color:#e9f5e6;', counter);
  const counterUnits = el('div', 'display:flex;gap:3px;margin-top:6px;', counter);
  const units = Array.from({ length: 20 }, () => el('div', 'width:9px;height:14px;background:#9fd8a8;opacity:0.15;', counterUnits));
  const hold = el('div', 'position:absolute;left:0;right:0;bottom:calc(max(0px, (100vh - 100vw / 2.39) / 2) + 2em);'
    + 'text-align:center;font-size:clamp(14px, 1.4vw, 20px);font-weight:700;letter-spacing:0.12em;text-transform:uppercase;'
    + 'color:#d9b36a;text-shadow:0 1px 3px #000;display:none;', overlay);
  const skipHint = el('div', 'position:absolute;right:3vw;top:calc(max(0px, (100vh - 100vw / 2.39) / 2) + 1em);'
    + 'font-size:clamp(10px, 0.9vw, 12px);letter-spacing:0.1em;text-transform:uppercase;opacity:0.55;', overlay, str('war.intro.skip'));
  const canvasFilter = canvas.style.filter;
  const fpvFail = createFpvFail(canvas);

  /* ------------------------------------------------------- the sound */
  let lines = null;
  let seconds = null;
  const ext = format();
  const voices = new Map();
  const music = new Audio(`${base}music/intro.${ext}`);
  music.preload = 'auto';
  for (let i = 1; i <= 7; i += 1) {
    const a = new Audio(`${base}voice/${lang}/intro-${i}.${ext}`);
    a.preload = 'auto';
    voices.set(`intro-${i}`, a);
  }
  const graph = audio && audio.ctx && audio.preMaster && audio.ctx.state === 'running' ? audio.ctx : null;
  const nodes = [];
  let musicGain = null;
  if (graph) {
    musicGain = graph.createGain();
    musicGain.gain.value = Math.min(1, (audio.mix ? audio.mix.music : 0.5) * MUSIC_GAIN);
    musicGain.connect(audio.preMaster);
    const voiceGain = graph.createGain();
    voiceGain.connect(audio.preMaster);
    nodes.push(musicGain, voiceGain);
    const m = graph.createMediaElementSource(music);
    m.connect(musicGain);
    nodes.push(m);
    for (const a of voices.values()) {
      const s = graph.createMediaElementSource(a);
      s.connect(voiceGain);
      nodes.push(s);
    }
    if (audio.music) {
      audio.music.pause();
    }
  } else {
    const level = audio ? (audio.enabled === false ? 0 : audio.level ?? 1) : 1;
    for (const a of [music, ...voices.values()]) {
      a.volume = Math.max(0, Math.min(1, level));
    }
  }
  const sound = { mode: graph ? 'graph' : 'element', blocked: 0, started: [] };
  const start = (a, fromS) => {
    try {
      a.currentTime = Math.max(0, fromS);
    } catch (e) {
      /* Not seekable before its metadata: it starts from the top, a
       * fraction late, which only a late joiner hears. */
    }
    const p = a.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        sound.blocked += 1;
      });
    }
  };
  const silence = () => {
    music.pause();
    for (const a of voices.values()) {
      a.pause();
    }
  };

  const text = fetch(`${base}lines.json`).then((r) => r.json()).then((j) => {
    lines = Object.fromEntries(j.lines.filter((l) => l.group === 'intro').map((l) => [l.id, l[lang] || l.en]));
  });
  const lengths = fetch(`${base}manifest.json`).then((r) => r.json()).then((j) => {
    seconds = Object.fromEntries(Object.entries(j.voice).filter(([k]) => k.endsWith(`.${lang}`)).map(([k, v]) => [k.slice(0, -lang.length - 1), v.seconds]));
  });
  /* The subtitles wait on the text; a failed fetch leaves none, loudly. */
  Promise.all([text, lengths]).catch((e) => console.warn(`warintro: no subtitles: ${e.message}`));

  /* ------------------------------------------------------- the clock */
  const startMs = Math.max(0, Math.min(INTRO_MS, opts.startMs || 0));
  let holdUntil = opts.holdUntilMs ?? null;
  let t0Wall = null;
  let lastWall = null;
  let skipped = false;
  let ended = false;
  let finished;
  const done = new Promise((resolve) => {
    finished = resolve;
  });
  const frames = SHOTS.map(() => 0);
  const voiced = new Set();
  let musicOn = false;
  const look = new THREE.Vector3();
  const upV = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  let state = {
    t: startMs, shot: -1, orbit: false, done: false,
  };

  function onInput(ev) {
    if (ended || skipped) {
      return;
    }
    if (ev.type === 'keydown' && (ev.repeat || ['Shift', 'Control', 'Alt', 'Meta'].includes(ev.key))) {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    handle.skip();
  }
  window.addEventListener('keydown', onInput, true);
  window.addEventListener('pointerdown', onInput, true);

  function place(name, def, t, shot) {
    const c = who(name, def);
    const keys = def.keys;
    if (def.from != null && t < def.from) {
      c.holder.visible = false;
      return;
    }
    c.holder.visible = true;
    let a = keys[0];
    let b = keys[keys.length - 1];
    for (let i = 1; i < keys.length; i += 1) {
      if (t <= keys[i].t) {
        a = keys[i - 1];
        b = keys[i];
        break;
      }
    }
    const u = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 1;
    const at = (k) => {
      const [x, , z] = k.p;
      if (k.p[1] === WATER) {
        return WATER_Y;
      }
      return k.p[1] == null ? ground(x, z) + c.lift : k.p[1];
    };
    const y = at(a) + (at(b) - at(a)) * u;
    c.holder.position.set(a.p[0] + (b.p[0] - a.p[0]) * u, y, a.p[2] + (b.p[2] - a.p[2]) * u);
    if (def.bob) {
      c.holder.position.y += def.bob * Math.sin((t / 1000) * 5.2);
    }
    euler.set(a.pitch ?? 0, a.yaw ?? 0, a.roll ?? 0);
    c.holder.quaternion.setFromEuler(euler);
    const spin = def.spin ? trackArea(def.spin, t) : 0;
    const { blades, propSpin } = c.built;
    for (let m = 0; blades && m < blades.length; m += 1) {
      blades[m].rotation.y = c.base[m] + spin * (propSpin ? propSpin[m] : 1);
    }
    shot.shown.add(c);
  }

  /* The camera at shot ms t of shot s. */
  function aim(s, t) {
    let run = s.runs[0];
    for (const r of s.runs) {
      if (t >= r.from) {
        run = r;
      }
    }
    const u = runU(run, t);
    if (run.path) {
      run.path.getPoint(u, camera.position);
    } else {
      camera.position.copy(run.point);
    }
    const target = run.keys[0].lookAt;
    if (target) {
      const def = s.cast[target];
      const c = who(target, def);
      c.holder.getWorldPosition(look);
      look.y += runField(run, t, 'lookUp', 0);
    } else if (run.look) {
      run.look.getPoint(u, look);
    } else {
      look.copy(run.lookPoint);
    }
    const shake = runField(run, t, 'shake', 0);
    if (shake > 0) {
      const w = t / 1000;
      camera.position.x += shake * Math.sin(w * 53.1) * Math.cos(w * 17.3);
      camera.position.y += shake * Math.sin(w * 61.7 + 1.3);
      camera.position.z += shake * Math.cos(w * 47.9 + 0.4);
    }
    const roll = runField(run, t, 'roll', 0);
    fwd.subVectors(look, camera.position).normalize();
    upV.set(0, 1, 0).applyAxisAngle(fwd, -roll);
    camera.up.copy(upV);
    camera.lookAt(look);
    camera.up.set(0, 1, 0);
    const fov = runField(run, t, 'fov', camera.fov);
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  function overlays(s, t, tIntro, nowWall) {
    const g = GRADES[s.grade] || GRADES.steel;
    put(canvas, 'filter', g.filter);
    put(tint, 'background', g.tint);
    put(black, 'opacity', String(Math.max(0, Math.min(1, track(s.fade, t)))));
    /* Titles. */
    let title = null;
    for (const x of s.titles || []) {
      if (x.kind !== 'credit' && t >= x.from && t < x.to) {
        title = x;
      }
    }
    if (title) {
      const inU = Math.min(1, (t - title.from) / 700);
      const outU = Math.min(1, (title.to - t) / 600);
      const a = smooth(Math.max(0, Math.min(inU, outU)));
      put(titleBox, 'opacity', a.toFixed(3));
      const main = title.text ?? str(title.key);
      if (titleMain.textContent !== main) {
        titleMain.textContent = main;
      }
      const year = title.kind === 'year';
      put(titleMain, 'fontSize', year ? 'clamp(64px, 13vw, 220px)' : 'clamp(40px, 7.5vw, 130px)');
      put(titleMain, 'letterSpacing', `${year ? 0.08 : 0.04}em`);
      /* The title settles from wide to its tracking as it fades in: a
       * transform, so the text is laid out and painted once. */
      put(titleMain, 'transform', `scaleX(${(1 + (1 - smooth(inU)) * 0.12).toFixed(3)})`);
      const subText = title.sub ? str(title.sub, { n: 1 }) : '';
      if (titleSub.textContent !== subText) {
        titleSub.textContent = subText;
      }
    } else {
      put(titleBox, 'opacity', '0');
    }
    const cr = (s.titles || []).find((x) => x.kind === 'credit' && t >= x.from && t < x.to);
    put(credit, 'opacity', cr ? String(Math.min(0.8, (t - cr.from) / 800, (cr.to - t) / 600)) : '0');
    if (cr && credit.textContent !== str(cr.key)) {
      credit.textContent = str(cr.key);
    }
    /* The output counter. */
    if (s.counter) {
      const u = Math.max(0, Math.min(1, (t - s.counter.from) / (s.counter.to - s.counter.from)));
      const lit = Math.round(20 * smooth(u));
      put(counter, 'opacity', String(Math.min(1, Math.max(0, (t - s.counter.from + 400) / 400), (s.ms - t) / 500)));
      const mw = lit * 700;
      const shown = str('war.output_mw', { mw: mw.toLocaleString(lang === 'es' ? 'es' : 'en').replace(/[.,]/g, ' ') });
      if (counterValue.textContent !== shown) {
        counterValue.textContent = shown;
      }
      for (let i = 0; i < 20; i += 1) {
        put(units[i], 'opacity', i < lit ? '1' : '0.15');
      }
    } else {
      put(counter, 'opacity', '0');
    }
    /* Subtitles, over each voice file's measured length. */
    let line = null;
    if (lines && seconds && s.voice) {
      const from = s.voice.at;
      const to = from + seconds[s.voice.line] * 1000 + SUB_TAIL_MS;
      if (t >= from && t < to) {
        line = lines[s.voice.line];
      }
    }
    put(sub, 'opacity', line ? '1' : '0');
    if (line && sub.textContent !== line) {
      sub.textContent = line;
    }
    /* The feed. */
    fpvFail.signal(s.snow ? track(s.snow, t) : 0);
    fpvFail.update(nowWall, Boolean(s.fpv));
  }

  function sounds(s, t, tIntro) {
    if (!musicOn) {
      musicOn = true;
      start(music, tIntro / 1000);
    }
    if (s.voice && t >= s.voice.at && !voiced.has(s.voice.line)) {
      voiced.add(s.voice.line);
      const len = seconds ? seconds[s.voice.line] * 1000 : 6000;
      /* A late joiner hears the rest of a line under way, not a line
       * started out of its shot. */
      if (t < s.voice.at + len) {
        start(voices.get(s.voice.line), (t - s.voice.at) / 1000);
        sound.started.push({ line: s.voice.line, at: tIntro });
      }
    }
    if (musicGain) {
      const speaking = [...voices.values()].some((a) => !a.paused && !a.ended);
      const want = Math.min(1, (audio.mix ? audio.mix.music : 0.5) * MUSIC_GAIN) * (speaking ? DUCK : 1);
      musicGain.gain.setTargetAtTime(want, graph.currentTime, 0.12);
    }
  }

  function orbit(nowWall) {
    const a = ((nowWall % ORBIT_MS) / ORBIT_MS) * Math.PI * 2;
    camera.position.set(DAM[0] + ORBIT_R * Math.sin(a), ORBIT_Y, DAM[2] + ORBIT_R * Math.cos(a));
    camera.up.set(0, 1, 0);
    camera.lookAt(tmp.set(DAM[0], DAM[1], DAM[2]));
    if (camera.fov !== 50) {
      camera.fov = 50;
      camera.updateProjectionMatrix();
    }
    const left = Math.max(0, Math.ceil((holdUntil - nowWall) / 1000));
    const msg = str('war.intro.briefing', { s: left });
    if (hold.textContent !== msg) {
      hold.textContent = msg;
    }
  }

  /* Out of the film: into the hold, or over. */
  function leaveFilm(nowWall) {
    silence();
    attackers.clear();
    for (const c of cast.values()) {
      c.holder.visible = false;
    }
    fpvFail.clear();
    canvas.style.filter = canvasFilter;
    titleBox.style.opacity = '0';
    sub.style.opacity = '0';
    counter.style.opacity = '0';
    credit.style.opacity = '0';
    black.style.opacity = '0';
    tint.style.background = 'none';
    skipHint.style.display = 'none';
    if (holdUntil != null && nowWall < holdUntil) {
      state.orbit = true;
      hold.style.display = 'block';
      return;
    }
    finish();
  }

  function finish() {
    if (ended) {
      return;
    }
    ended = true;
    state.done = true;
    if (audio && audio.music && graph && audio.enabled) {
      audio.music.resume();
    }
    finished();
  }

  const handle = {
    done,

    /* Once a rendered frame, after the shell's camera and before its draw.
     * nowMs is performance.now(). */
    frame(nowMs) {
      if (ended) {
        return;
      }
      if (t0Wall == null) {
        t0Wall = nowMs - startMs;
      }
      const dtS = lastWall == null ? 0 : Math.min(0.1, (nowMs - lastWall) / 1000);
      lastWall = nowMs;
      if (state.orbit) {
        if (holdUntil == null || nowMs >= holdUntil) {
          finish();
          return;
        }
        orbit(nowMs);
        return;
      }
      const tIntro = nowMs - t0Wall;
      if (skipped || tIntro >= INTRO_MS) {
        leaveFilm(nowMs);
        if (state.orbit) {
          orbit(nowMs);
        }
        return;
      }
      let i = SHOT_MS.length - 1;
      while (i > 0 && tIntro < STARTS[i]) {
        i -= 1;
      }
      const s = shots[i];
      const t = tIntro - s.start;
      state = { ...state, t: tIntro, shot: i };
      frames[i] += 1;
      /* The cast first: a camera may follow one of them. */
      s.shown = new Set();
      for (const [name, def] of Object.entries(s.cast || {})) {
        place(name, def, t, s);
      }
      for (const c of cast.values()) {
        if (!s.shown.has(c)) {
          c.holder.visible = false;
        }
      }
      const list = [];
      for (const a of s.plans) {
        if (tIntro < a.plan.t0 || tIntro > a.plan.tEnd) {
          continue;
        }
        const pose = poseAt(a.plan, tIntro);
        list.push({
          id: a.id, kind: a.kind, p: pose.p.slice(), q: pose.q.slice(),
        });
      }
      attackers.update(list, dtS);
      aim(s, t);
      overlays(s, t, tIntro, nowMs);
      sounds(s, t, tIntro);
    },

    /* Any key: out of the film, into the hold if the room is still
     * briefing. */
    skip() {
      skipped = true;
    },

    /* A room's briefing moved: its end, performance.now() ms, or null. */
    holdUntil(ms) {
      holdUntil = ms;
    },

    /* What the checks read: where the film is, per shot the frames drawn,
     * the attackers drawn now, the sound's route. */
    state() {
      return {
        ...state,
        skipped,
        frames: frames.slice(),
        drawn: attackers.drawn().counts,
        cast: [...cast.entries()].filter(([, c]) => c.holder.visible).map(([n]) => n),
        snow: fpvFail.level(performance.now()).snow,
        subtitle: sub.style.opacity === '1' ? sub.textContent : null,
        title: titleBox.style.opacity !== '0' ? titleMain.textContent : null,
        counter: counter.style.opacity !== '0' ? counterValue.textContent : null,
        hold: state.orbit ? hold.textContent : null,
        sound: {
          mode: sound.mode,
          blocked: sound.blocked,
          started: sound.started.slice(),
          music: { t: music.currentTime, paused: music.paused, duration: music.duration },
          voices: Object.fromEntries([...voices].map(([k, a]) => [k, { duration: a.duration, t: a.currentTime }])),
        },
        seconds,
        lines,
      };
    },

    dispose() {
      window.removeEventListener('keydown', onInput, true);
      window.removeEventListener('pointerdown', onInput, true);
      silence();
      for (const n of nodes) {
        n.disconnect();
      }
      for (const a of [music, ...voices.values()]) {
        a.removeAttribute('src');
        a.load();
      }
      attackers.dispose();
      scene.remove(root);
      root.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
        }
      });
      bakedMat.dispose();
      fpvFail.clear();
      fpvFail.element.remove();
      canvas.style.filter = canvasFilter;
      overlay.remove();
      finish();
    },
  };
  return handle;
}
