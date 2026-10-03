/*
 * spill.js: the spillway running (docs/ITAIPU-LOOP.md, round 1 target 3,
 * round 2 target 3).
 *
 *   The chutes: aerated water streaming down D's floors, streaked along
 *   the flow at every scale, cream white on its crests and green grey in
 *   its hollows, the piers' wakes closing behind them, and thin at the
 *   walls, where the floor shows through (the chute-running and
 *   aerial-spill-2 photographs).
 *
 *   The gates: under each radial gate a jet as deep as the opening,
 *   contracting and thinning over the ogee into the chute's sheet
 *   (aerial-spill-2).
 *
 *   The jets off the flip buckets: each bay's flow thrown in an arc that
 *   spreads, thickens and breaks into spray before it comes down in the
 *   river (aerial-spill, spill-plume).
 *
 *   The plume: where the jets land, billows of spray over the river, a
 *   few thrown high as rooster tails, grey in their own shade and thin
 *   enough at their edges that the spillway shows through, and a thinner
 *   mist that rises off them and drifts away downwind; a spray bow where
 *   the sun allows one (spill-plume, aerial-spill, chute-running).
 *
 *   The plunge pool's churn, as GLSL the river's sheet splices in
 *   (index.js withField): boiling white water where the jets land, foam
 *   torn into patches and lines downstream of it, and milky, aerated
 *   water between them.
 *
 * Nothing here is ground: the chute's floor is D's and stays the crash
 * world's, and the jets and the spray are only drawn. None of it casts a
 * shadow, and all of it is in the water's group, which the planar mirror
 * never draws.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/* How fast the chute's water is drawn running, m/s. At the foot of a
 * 90 m fall a spillway runs at 30 to 40; the pattern is drawn a little
 * slower, since at that speed its texels smear between frames. */
const CHUTE_SPEED = 22;
/* How far down the chute the water off the gates is white all through,
 * m: it leaves them a glassy green sheet that the floor's roughness and
 * the air it drags in turn white within a few tens of metres. */
const AERATED_BY = 70;

/* The jet under each radial gate. The gates stand GATE_OPEN off the sill
 * (dam/index.js SPILL.gateOpen) and their lips are JET_FROM down the
 * chute from the gate line (SPILL.gate's -6.5 plus the radial skin's sag
 * to its bottom edge, 1.7 m for RADIAL.r 21). The water leaves a gate
 * as deep as its opening, contracts to about 0.6 of it within a few
 * metres and thins as the ogee speeds it up: JET_TOP is its top over
 * the floor, [d, m]. Past the piers' ends (PIER_END, SPILL.pierEnd) the
 * lanes run into one another and the chute's own sheet, so each jet
 * fades out there by its last knot. */
const GATE_OPEN = 5;
const JET_FROM = -4.8;
const JET_TOP = [[JET_FROM, GATE_OPEN], [0, 0.6 * GATE_OPEN], [12, 2.1], [30, 1.2], [42, 0.9], [62, 0.6]];
const PIER_END = 42;

/* The flip bucket's throw: the jet leaves the lip at LAUNCH_SPEED, m/s,
 * LAUNCH_ANGLE up from level, and falls under gravity to the river. */
const LAUNCH_SPEED = 30;
const LAUNCH_ANGLE = (28 * Math.PI) / 180;
const G = 9.81;
/* The sprites of each jet, of the plume and of the mist it gives off. */
const JET = {
  count: 48, rise: 0, drift: 0, s0: 7, s1: 22, opacity: 0.5,
};
const PLUME = {
  count: 110, life: 8, rise: 60, drift: 45, s0: 12, s1: 55, opacity: 0.27,
};
const MIST = {
  count: 30, life: 40, rise: 140, drift: 200, s0: 40, s1: 120, opacity: 0.05,
};
/* The rooster tail: where each jet comes down, a few big billows thrown
 * far higher than the rest of the plume (spill-plume, chute-running). */
const TAIL = {
  count: 30, life: 11, rise: 95, drift: 40, s0: 18, s1: 70, opacity: 0.2,
};
/* The plume stands over each bay's landing in CLUMPS billows, not as one
 * even wall: between them, and through their thin edges, the spillway
 * behind shows (spill-plume). */
const CLUMPS = 7;

/*
 * THE SPILLWAY'S STATE (docs/FLOOD.md), what the flood says each frame,
 * shared by the chute, the plume and the plunge pool: per gate its lip
 * over its sill as a share of the 5 m the look was drawn for, per bay its
 * discharge as a share of what Free Flight's 5 m spill passes, how
 * far down the chute its water has reached, m, and whether that is past
 * its lip (1) or not (0). Free Flight's spill is
 * every share 1 and every front past the lip: the look as it was drawn.
 */
export const GATES = 14;
export const BAYS = 3;
export function spillState(THREE) {
  return {
    uGate: { value: new Float32Array(GATES).fill(1) },
    uBay: { value: new THREE.Vector3(1, 1, 1) },
    uFront: { value: new THREE.Vector3(1e4, 1e4, 1e4) },
    uReach: { value: new THREE.Vector3(1, 1, 1) },
  };
}
/* A gate's bay, as the dividers stand (dam/index.js SPILL.dividers). */
export function bayOf(g) {
  return g < 4 ? 0 : g < 8 ? 1 : 2;
}
const STATE_GLSL = /* glsl */ `
  uniform float uGate[${GATES}];
  uniform vec3 uBay;
  uniform vec3 uFront;
  uniform vec3 uReach;
  float bayPick(vec3 v, int b) {
    return b == 0 ? v.x : b == 1 ? v.y : v.z;
  }`;

/* A seeded generator, so the plume is the same every load. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/*
 * Each bay's end from D's floors: `floors` are chuteFloors' records (a
 * quad each, rec.chute its bay), `axis` chuteAxis. Returns per bay, west
 * to east, the lip's middle { x, y, z }, its half width across, m, the
 * time the jet off it flies, s, and where it lands in the river at
 * `riverY`.
 */
export function bays(floors, axis, riverY) {
  const down = (p) => (p[0] - axis.origin[0]) * axis.along[0] + (p[2] - axis.origin[1]) * axis.along[1];
  const by = new Map();
  for (const { rec, quad } of floors) {
    const [, , c, d] = quad;
    const at = down(d);
    const had = by.get(rec.chute);
    if (!had || at > had.d) {
      by.set(rec.chute, { d: at, c, e: d });
    }
  }
  return [...by.keys()].sort((a, b) => a - b).map((k, bay) => {
    const { c, e } = by.get(k);
    const lip = { x: (c[0] + e[0]) / 2, y: (c[1] + e[1]) / 2, z: (c[2] + e[2]) / 2 };
    const half = Math.hypot(c[0] - e[0], c[2] - e[2]) / 2;
    /* The time the jet takes to fall from the lip to the river. */
    const vx = LAUNCH_SPEED * Math.cos(LAUNCH_ANGLE);
    const vy = LAUNCH_SPEED * Math.sin(LAUNCH_ANGLE);
    const drop = lip.y - riverY;
    const t = (vy + Math.sqrt(vy * vy + 2 * G * drop)) / G;
    const reach = vx * t;
    return {
      bay,
      /* Metres down the chute's axis to the lip. */
      end: by.get(k).d,
      lip,
      half,
      fall: t,
      land: { x: lip.x + axis.along[0] * reach, y: riverY, z: lip.z + axis.along[1] * reach },
    };
  });
}

/* --------------------------------------------------------------- chute */

/*
 * The gates' lanes across the spillway from dam.json's figures (width,
 * gates, gateWidth), as dam/index.js lays its piers: `pierW` each pier's
 * width, `pitch` a gate and a pier, and each gate's [u0, u1], metres
 * across the chute from the middle of the gates.
 */
export function lanes(figures) {
  const W = figures.width / 2;
  const pierW = (figures.width - figures.gates * figures.gateWidth) / (figures.gates + 1);
  const pitch = pierW + figures.gateWidth;
  return {
    W,
    pierW,
    pitch,
    gates: Array.from({ length: figures.gates }, (_, g) => [-W + pierW + g * pitch, -W + pierW + g * pitch + figures.gateWidth]),
  };
}

/*
 * The jets under the gates, for index.js chuteGeometry to add to the
 * chutes' sheet: per gate a strip from its lip to JET_TOP's last knot,
 * JET_TOP over the floor, and the face it shows under the gate. The floor
 * is D's (`floorAt(d)`, y at d metres down the chute), `at(u, d)` is the
 * point [x, z] at u across and d down, `down` the chute's way, [x, z].
 * Returns quads, each { pts (four [x, y, z] in order round it), normal,
 * chute (per corner aChute: d, u, the lane's -1 to 1 across, 1) }.
 */
export function gateJets(lane, floorAt, at, down) {
  const top = (d) => {
    const k = JET_TOP.findIndex(([kd]) => kd >= d);
    if (k <= 0) {
      return JET_TOP[Math.max(k, 0)][1];
    }
    const [d0, h0] = JET_TOP[k - 1];
    const [d1, h1] = JET_TOP[k];
    return h0 + ((h1 - h0) * (d - d0)) / (d1 - d0);
  };
  const P = (u, d, y) => {
    const [x, z] = at(u, d);
    return [x, y, z];
  };
  const quads = [];
  for (const [u0, u1] of lane.gates) {
    const ds = JET_TOP.map(([d]) => d);
    for (let i = 0; i + 1 < ds.length; i += 1) {
      const [d0, d1] = [ds[i], ds[i + 1]];
      const y0 = floorAt(d0) + top(d0);
      const y1 = floorAt(d1) + top(d1);
      quads.push({
        pts: [P(u0, d0, y0), P(u1, d0, y0), P(u1, d1, y1), P(u0, d1, y1)],
        normal: [0, 1, 0],
        chute: [[d0, u0, -1, 1], [d0, u1, 1, 1], [d1, u1, 1, 1], [d1, u0, -1, 1]],
      });
    }
    /* Its face under the gate's lip, looking down the chute. */
    const y = floorAt(JET_FROM);
    quads.push({
      pts: [P(u0, JET_FROM, y), P(u1, JET_FROM, y), P(u1, JET_FROM, y + top(JET_FROM)), P(u0, JET_FROM, y + top(JET_FROM))],
      normal: [down[0], 0, down[1]],
      chute: [[JET_FROM, u0, -1, 1], [JET_FROM, u1, 1, 1], [JET_FROM, u1, 1, 1], [JET_FROM, u0, -1, 1]],
    });
  }
  return quads;
}

/*
 * The chutes' water: three's standard material, so the sun, the sky's
 * light and the shadows reach it as they reach the concrete beside it,
 * with the flow's colour, its roughness and how much of the floor it
 * hides spliced in. The geometry carries aChute (metres down the chute
 * from the gates; metres across the spillway from the gates' middle;
 * -1 to 1 across the bay, or the gate's lane for a jet; 1 on a jet, 0 on
 * the chute's sheet), as index.js chuteGeometry lays it. `lane` is
 * lanes(): the piers' wakes are drawn from it.
 *
 * What the photographs show (chute-running, aerial-spill-2): white water
 * streaked down the flow at every scale, cream where it is most aerated
 * and green grey between, rolls breaking across it; the jets off the
 * gates white lanes with the piers' wakes between them, which close into
 * a thin bright fin further down; and thin, glassy water at the walls
 * where the floor shows through. Far off, the metre scale boil is below
 * a pixel and would only alias into an even grain, so the pattern there
 * is the streaks'.
 */
export function chuteMaterial(THREE, {
  waves, time, envMap, lane, state,
}) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.6, metalness: 0, envMap, transparent: true,
  });
  mat.name = 'itaipu-water-chute';
  const uLanes = new THREE.Vector3(lane.W - lane.pierW / 2, lane.pitch, lane.pierW);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uWaves: { value: waves }, uTime: time, uLanes: { value: uLanes } }, state);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aChute;
        varying vec4 vChute;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vChute = aChute;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uWaves;
        uniform float uTime;
        uniform vec3 uLanes;
        varying vec4 vChute;
        ${STATE_GLSL}
        float chuteFoam;
        vec2 chuteSlope;`)
      .replace('#include <map_fragment>', `
        {
          float d = vChute.x;
          float u = vChute.y;
          float e = abs(vChute.z);
          float jet = vChute.w;
          float t = uTime * ${CHUTE_SPEED.toFixed(1)};
          float far = smoothstep(60.0, 450.0, length(vViewPosition));
          /* Streaks down the flow at two widths, the rolls that break
           * across them, and the foam in clumps a metre or two across,
           * the same scale both ways, or it hatches. */
          float s1 = texture2D(uWaves, vec2(u / 7.0, (d - t * 0.95) / 150.0)).a;
          float s2 = texture2D(uWaves, vec2(u / 2.3 + 0.41, (d - t) / 55.0)).a;
          float streak = s1 * 0.6 + s2 * 0.4;
          float roll = texture2D(uWaves, vec2(u / 45.0 + 0.31, (d - t * 1.05) / 15.0)).a;
          float clump = texture2D(uWaves, vec2(u, d - t * 1.1) / 1.9 + vec2(0.57, 0.0)).a * 0.65
            + texture2D(uWaves, vec2(u, d - t * 1.2) / 0.8 + vec2(0.13, 0.29)).a * 0.35;
          /* The broad swing of the colour, green grey to cream. */
          float tint = texture2D(uWaves, vec2(u / 90.0 + 0.7, (d - t * 0.9) / 260.0)).a;
          /* Metres from the nearest pier's line, and its wake: from the
           * pier's end the lanes either side close over it, a glassy
           * trough that narrows into a bright fin and is gone by the
           * chute's middle. */
          float fromPier = abs(fract((u + uLanes.x) / uLanes.y + 0.5) - 0.5) * uLanes.y;
          float wakeW = uLanes.z * 0.6 + 0.1 * max(d - ${PIER_END.toFixed(1)}, 0.0);
          float wake = (1.0 - smoothstep(0.35 * wakeW, wakeW, fromPier)) * smoothstep(${(PIER_END - 2).toFixed(1)}, ${(PIER_END + 6).toFixed(1)}, d)
            * (1.0 - smoothstep(110.0, 260.0, d)) * (1.0 - jet);
          float fin = (1.0 - smoothstep(0.4, 1.6 + 0.012 * d, fromPier)) * smoothstep(70.0, 120.0, d) * (1.0 - smoothstep(200.0, 330.0, d));
          float aer = mix(0.45, 1.0, smoothstep(${JET_FROM.toFixed(1)}, ${AERATED_BY.toFixed(1)}, d));
          /* The body of the flow, the metres scale streaks and rolls,
           * and the clumps on it near to. */
          float body = streak * 0.55 + roll * 0.25 + tint * 0.2;
          float fine = mix(clump, 0.5, far);
          float h = body * 0.6 + fine * 0.4;
          chuteFoam = smoothstep(0.42 - 0.3 * aer, 0.56 - 0.22 * aer, h) * mix(0.6, 1.0, aer);
          chuteFoam *= 1.0 - 0.35 * wake;
          /* A jet's water tears white where it runs along the piers. */
          chuteFoam = max(chuteFoam, jet * smoothstep(0.7, 1.0, e) * smoothstep(0.35, 0.6, clump * 0.6 + streak * 0.4));
          /* Glassy green grey water where it is thin or not yet
           * aerated, and the foam cream white on its crests and grey in
           * its hollows. Round 4 measured the running chute from the air
           * (aerial-spill-2, spill-run-1): a warm cream, sRGB (209, 200,
           * 180), 82 per cent of it near white, where v3's greener foam
           * drew (180, 183, 179) and half: the foam warmer and paler. */
          vec3 water = mix(vec3(0.06, 0.09, 0.07), vec3(0.13, 0.15, 0.12), aer);
          float lit = smoothstep(0.3, 0.72, mix(fine * 0.65 + body * 0.35, body, far)) + 0.3 * fin;
          vec3 foam = mix(vec3(0.25, 0.25, 0.21), vec3(0.64, 0.61, 0.53), clamp(lit, 0.0, 1.0));
          diffuseColor.rgb = mix(water, foam, chuteFoam);
          /* How much of the floor it hides: thin at the walls and in the
           * wakes, where only its foam is opaque, and each jet gone into
           * the chute's sheet by its end. */
          float thin = max(smoothstep(0.8, 1.0, e) * (1.0 - jet), wake);
          diffuseColor.a = 1.0 - (1.0 - chuteFoam) * thin * 0.5;
          diffuseColor.a *= 1.0 - jet * max(smoothstep(${(PIER_END + 2).toFixed(1)}, ${JET_TOP[JET_TOP.length - 1][0].toFixed(1)}, d),
            smoothstep(0.6, 1.0, e) * smoothstep(${(PIER_END - 6).toFixed(1)}, ${(PIER_END + 4).toFixed(1)}, d));
          /* The flood's state: a gate's jet as its lip stands, the bay's
           * sheet as its water runs and only as far down as it has got. */
          {
            int g = int(clamp(floor((u + uLanes.x) / uLanes.y), 0.0, ${GATES - 1}.0));
            int b = g < 4 ? 0 : g < 8 ? 1 : 2;
            float runs = smoothstep(0.0, 0.25, bayPick(uBay, b)) * (1.0 - smoothstep(bayPick(uFront, b) - 15.0, bayPick(uFront, b), d));
            float lip = smoothstep(0.0, 0.15, uGate[g]);
            diffuseColor.a *= mix(runs, lip * runs, jet);
            if (diffuseColor.a < 0.004) discard;
          }
          vec3 n1 = texture2D(uWaves, vec2(u / 45.0 + 0.31, (d - t * 1.05) / 15.0)).xyz * 2.0 - 1.0;
          vec3 n2 = texture2D(uWaves, vec2(u, d - t * 1.1) / 1.9 + vec2(0.57, 0.0)).xyz * 2.0 - 1.0;
          chuteSlope = (n1.xy / max(n1.z, 0.3)) * 0.3 + (n2.xy / max(n2.z, 0.3)) * 0.3 * (1.0 - far);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.1, 0.75, chuteFoam);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize(normal + (viewMatrix * vec4(chuteSlope.x, 0.0, chuteSlope.y, 0.0)).xyz);`);
  };
  mat.customProgramCacheKey = () => 'itaipu-chute-water';
  return mat;
}

/* --------------------------------------------------------------- spray */

/*
 * Soft sprites, one draw for all of them. `sets` are kinds of spray, each
 * { bases, count, life, rise, drift, s0, s1, opacity, seed }: `count`
 * sprites spread over the `bases` (a point, the jet's half width across
 * there and its axes), each rising `rise` metres over its own `life`
 * second cycle, spreading, growing from s0 to s1 metres, fading, and
 * carried `drift` ({ x, y }, metres over a life). Lit as a cloud is: the
 * sun on the side that faces it, the sky's light everywhere, grey in its
 * own shade, and brighter looking toward the sun, as fine spray scatters
 * light forward. A sprite never reaches down through the water: it fades
 * out toward the river's level, which a flat sprite would cut in a hard
 * line.
 */
export function sprayMesh(THREE, {
  sets, waves, time, sun, riverY, state,
}) {
  const count = sets.reduce((n, set) => n + set.count, 0);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const base = new Float32Array(count * 4);
  const seeds = new Float32Array(count * 4);
  const move = new Float32Array(count * 4);
  const carry = new Float32Array(count * 3);
  const thrown = new Float32Array(count * 4);
  const bayOfSprite = new Float32Array(count);
  const box = new THREE.Box3();
  const at = new THREE.Vector3();
  let k = 0;
  for (const set of sets) {
    const next = rng(set.seed);
    for (let n = 0; n < set.count; n += 1, k += 1) {
      const b = set.bases[n % set.bases.length];
      /* Across the jet's width where it lands, and a little either side
       * along it. */
      const c = next() * 2 - 1;
      const a = next() * 2 - 1;
      const x = b.x + b.cx * c * b.half + b.ax * a * b.half * 0.25;
      const z = b.z + b.cz * c * b.half + b.az * a * b.half * 0.25;
      base.set([x, b.y, z, b.half], k * 4);
      bayOfSprite[k] = b.bay ?? -1;
      seeds.set([next(), next(), next(), next()], k * 4);
      move.set([set.rise, set.life, set.opacity, set.s0], k * 4);
      carry.set([set.drift.x, set.drift.y, set.s1], k * 3);
      if (set.thrown) {
        thrown.set([set.thrown.x, set.thrown.z, set.thrown.y, 1], k * 4);
      }
      /* Its reach: from where it starts to as far as it drifts, spread,
       * risen and grown. */
      const r = b.half + set.s1 * 1.3;
      box.expandByPoint(at.set(x - r, b.y - r, z - r));
      box.expandByPoint(at.set(x + r, b.y + set.rise + r, z + r));
      box.expandByPoint(at.set(x + set.drift.x * 1.1 - r, b.y - r, z + set.drift.y * 1.1 - r));
      box.expandByPoint(at.set(x + set.drift.x * 1.1 + r, b.y + set.rise + r, z + set.drift.y * 1.1 + r));
    }
  }
  geo.setAttribute('aBase', new THREE.InstancedBufferAttribute(base, 4));
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  geo.setAttribute('aMove', new THREE.InstancedBufferAttribute(move, 4));
  geo.setAttribute('aCarry', new THREE.InstancedBufferAttribute(carry, 3));
  geo.setAttribute('aThrown', new THREE.InstancedBufferAttribute(thrown, 4));
  geo.setAttribute('aBay', new THREE.InstancedBufferAttribute(bayOfSprite, 1));
  geo.instanceCount = count;
  geo.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uWaves: { value: waves },
      uTime: time,
      uRiver: { value: riverY },
      uSunDir: { value: sun.direction.clone().normalize() },
      uSun: { value: sun.color.clone().multiplyScalar(sun.irradiance) },
      uSky: { value: new THREE.Color(...sun.sky) },
      ...state,
    },
    vertexShader: /* glsl */ `
      attribute vec4 aBase;
      attribute vec4 aSeed;
      attribute vec4 aMove;
      attribute vec3 aCarry;
      attribute vec4 aThrown;
      attribute float aBay;
      ${STATE_GLSL}
      uniform float uTime;
      uniform float uRiver;
      uniform vec3 uSunDir;
      varying vec2 vUv;
      varying float vFade;
      varying vec2 vSeed;
      varying float vLift;
      varying vec3 vToSun;
      varying float vForward;
      varying vec3 vRay;
      void main() {
        float age = fract(uTime / aMove.y + aSeed.x);
        vec3 p = aBase.xyz;
        float ang = aSeed.y * 6.2831853;
        /* A jet's water spreads as it flies, a plume's from the start. */
        float out_ = aBase.w * 0.35 * sqrt(aSeed.z) * mix(0.4 + 0.9 * age, 0.6 * age, aThrown.w);
        p.xz += vec2(cos(ang), sin(ang)) * out_ + aCarry.xy * age * (0.6 + 0.5 * aSeed.w);
        /* Spray thrown up fast and slowing, as it does, most of it low. */
        p.y += aMove.x * (1.0 - (1.0 - age) * (1.0 - age)) * (0.25 + 0.75 * aSeed.w * aSeed.w);
        /* A jet's water flies from the lip to the river under gravity,
         * its life the time it takes. */
        float tau = age * aMove.y;
        p += aThrown.w * vec3(aThrown.x * tau, aThrown.z * tau - ${(G / 2).toFixed(3)} * tau * tau, aThrown.y * tau);
        float size = mix(aMove.w, aCarry.z, sqrt(age)) * (0.7 + 0.6 * aSeed.z);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        mv.xy += position.xy * size;
        gl_Position = projectionMatrix * mv;
        /* Its depth taken from most of its size nearer the eye: a flat
         * sprite standing in a ball of spray is cut in a straight line by
         * the bank or the wall behind it, and the spray it stands for
         * reaches that much nearer. */
        {
          float far_ = length(mv.xyz);
          vec4 near_ = projectionMatrix * vec4(mv.xyz * max(1.0 - size * 0.7 / far_, 1.0 / far_), 1.0);
          gl_Position.z = near_.z / near_.w * gl_Position.w;
        }
        vUv = position.xy * 0.5 + 0.5;
        vFade = smoothstep(0.0, 0.08, age) * pow(1.0 - age, mix(1.3, 0.6, aThrown.w)) * aMove.z;
        /* A sprite the camera is in or near is a white screen, not
         * spray: faded out from three times its size to most of it. */
        vFade *= smoothstep(size * 0.8, size * 3.0, -mv.z);
        /* A bay's spray as its water runs, and only once its water has
         * reached its lip. */
        if (aBay >= 0.0) {
          int b = int(aBay);
          vFade *= smoothstep(0.0, 0.3, bayPick(uBay, b)) * bayPick(uReach, b);
        }
        vSeed = aSeed.zw;
        /* The corner's height over the river, for a camera not rolled. */
        vLift = p.y + position.y * size - uRiver;
        /* The sun's way in the sprite's own plane, to shade it as a
         * ball of spray, and how nearly the eye looks toward the sun. */
        vToSun = (viewMatrix * vec4(uSunDir, 0.0)).xyz;
        vForward = max(dot(normalize(p - cameraPosition), uSunDir), 0.0);
        vRay = transpose(mat3(viewMatrix)) * mv.xyz;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uWaves;
      uniform vec3 uSun;
      uniform vec3 uSky;
      uniform vec3 uSunDir;
      varying vec2 vUv;
      varying float vFade;
      varying vec2 vSeed;
      varying float vLift;
      varying vec3 vToSun;
      varying float vForward;
      varying vec3 vRay;
      void main() {
        vec2 c = vUv * 2.0 - 1.0;
        float d = dot(c, c);
        if (d > 1.0) discard;
        /* A billow: dense inside, its edge torn into smaller billows. */
        float puff = texture2D(uWaves, vUv * 0.4 + vSeed).a * 0.65 + texture2D(uWaves, vUv * 1.1 + vSeed.yx).a * 0.35;
        float a = smoothstep(0.38, 0.62, puff * 0.6 + 0.55 * (1.0 - d)) * (1.0 - smoothstep(0.55, 1.0, d)) * vFade;
        a *= smoothstep(0.0, 16.0, vLift);
        if (a < 0.004) discard;
        /* A ball's normal under this point of the sprite, roughened by
         * the billows, lit as a cloud is: white where the sun is on it,
         * grey blue in its own shade. */
        vec3 n = normalize(vec3(c + (puff - 0.5) * 0.8, sqrt(max(1.0 - d, 0.0))));
        float lit = clamp(dot(n, normalize(vToSun)) * 0.6 + 0.4, 0.0, 1.0);
        /* And greyer low down, in the shade of the spray over it. */
        float over = mix(0.55, 1.0, smoothstep(0.0, 60.0, vLift));
        vec3 col = (uSky * (0.35 + 0.5 * lit) + uSun * (0.24 * lit * lit + 0.25 * pow(vForward, 6.0))) * over;
        /* The spray's bow, where the eye looks 40.7 to 42.5 degrees from
         * the point opposite the sun: violet inside, red out, and only
         * with the sun up. Faint: it is the spray's own light split, not
         * more of it. */
        float bow = degrees(acos(clamp(dot(normalize(vRay), -uSunDir), -1.0, 1.0)));
        float k = (bow - 40.7) / 1.8;
        if (k > -0.2 && k < 1.2) {
          vec3 band = clamp(vec3(1.5 - abs(k - 1.0) * 3.0, 1.5 - abs(k - 0.5) * 3.0, 1.5 - abs(k) * 3.0), 0.0, 1.0);
          col += uSun * band * 0.08 * step(0.0, uSunDir.y);
        }
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true,
    depthWrite: false,
  });
  mat.name = 'itaipu-water-spray';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 3;
  return mesh;
}

/* The jets, and the plume and its mist over the bays' landings, in one
 * draw: the jets thrown off the lips, the plume thrown on `down` (the
 * river's way there, a unit vector in the ground plane) by the jets' own
 * momentum, the mist off it carried by the `wind` (the way it blows, a
 * unit vector). */
export function plume(THREE, list, axis, down, wind, opts) {
  const [ax, az] = axis.along;
  /* Billows round each landing, and back along the jet over its last
   * part, where the spray the air strips off it hides where it meets the
   * river: CLUMPS per bay, each a third of the bay's half width. */
  const next = rng(71);
  const bases = list.flatMap((b) => {
    const reach = Math.hypot(b.land.x - b.lip.x, b.land.z - b.lip.z);
    return Array.from({ length: CLUMPS }, () => {
      const back = 10 + reach * 0.45 * next();
      const c = (next() * 2 - 1) * 0.85 * b.half;
      return {
        x: b.land.x - ax * back + az * c, y: b.land.y, z: b.land.z - az * back - ax * c, half: b.half / 3, ax, az, cx: az, cz: -ax, bay: b.bay,
      };
    });
  });
  /* The tails where the jets come down, a third of each bay across. */
  const tails = list.map((b) => ({
    x: b.land.x - ax * 15, y: b.land.y, z: b.land.z - az * 15, half: b.half / 3, ax, az, cx: az, cz: -ax, bay: b.bay,
  }));
  /* The mist rises off the plume's downstream half. */
  const off = bases.map((b) => ({
    ...b, x: b.x + down[0] * 40, z: b.z + down[1] * 40, y: b.y + 10,
  }));
  /* Each jet: its water leaving the lip across the bay's width. */
  const vx = LAUNCH_SPEED * Math.cos(LAUNCH_ANGLE);
  const jets = list.map((b, k) => ({
    ...JET,
    life: b.fall,
    bases: [{
      x: b.lip.x, y: b.lip.y + 1.5, z: b.lip.z, half: b.half, ax: 0, az: 0, cx: az, cz: -ax, bay: b.bay,
    }],
    seed: 83 + k,
    drift: { x: 0, y: 0 },
    thrown: { x: ax * vx, z: az * vx, y: LAUNCH_SPEED * Math.sin(LAUNCH_ANGLE) },
  }));
  const mesh = sprayMesh(THREE, {
    ...opts,
    sets: [
      ...jets,
      { ...PLUME, bases, seed: 91, drift: { x: down[0] * PLUME.drift, y: down[1] * PLUME.drift } },
      { ...TAIL, bases: tails, seed: 89, drift: { x: wind[0] * TAIL.drift, y: wind[1] * TAIL.drift } },
      { ...MIST, bases: off, seed: 97, drift: { x: wind[0] * MIST.drift, y: wind[1] * MIST.drift } },
    ],
  });
  mesh.name = 'itaipu-spill-plume';
  return mesh;
}

/*
 * The plunge pool, spliced into the river's sheet (index.js withField):
 * how churned the water is at p, 0 to 1, from uItPlunge (each bay's
 * landing: x, z, half width, 1) and uItDown (the river's way there). A
 * boil where each jet lands, and downstream of the landings a widening
 * tongue of broken water that the current carries off and thins.
 */
export const PLUNGE_GLSL = /* glsl */ `
  uniform vec4 uItPlunge[3];
  uniform vec2 uItDown;
  float itPlunge(vec2 p) {
    /* The reservoir's sheet has no landings; a landing's w is its bay's
     * share of the spill (water/index.js). */
    if (max(uItPlunge[0].w, max(uItPlunge[1].w, uItPlunge[2].w)) <= 0.0) {
      return 0.0;
    }
    float churn = 0.0;
    vec2 across = vec2(-uItDown.y, uItDown.x);
    /* The boil's edge is torn, not drawn with compasses. */
    vec2 warp = vec2(texture2D(uWaves, p / 173.0 + vec2(0.21, 0.63)).a, texture2D(uWaves, p / 131.0 + vec2(0.71, 0.13)).a) - 0.5;
    for (int i = 0; i < 3; i++) {
      vec4 b = uItPlunge[i];
      vec2 r = p - b.xy + warp * b.z * 1.2;
      float al = dot(r, uItDown);
      float ac = dot(r, across);
      float boil = 1.0 - smoothstep(0.5, 1.3, length(vec2(al / (b.z * 1.5), ac / (b.z * 1.3))));
      /* The tongues of the bays spread into each other within a hundred
       * metres, as the photographs' one sheet of broken water. */
      float tongue = smoothstep(-b.z, 0.0, al) * (1.0 - smoothstep(60.0, 480.0, al))
        * (1.0 - smoothstep(b.z * 0.6 + al * 0.5, b.z * 1.7 + al * 0.95, abs(ac)));
      churn = max(churn, max(boil, tongue * (0.85 - 0.65 * smoothstep(0.0, 520.0, al))) * smoothstep(0.0, 0.3, b.w));
    }
    return churn;
  }`;
