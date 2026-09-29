/*
 * spill.js: the spillway running (docs/ITAIPU-LOOP.md, round 1 target 3).
 *
 *   The chutes: aerated white water streaming down D's floors, streaked
 *   along the flow and a little green grey in its troughs, a glassier
 *   sheet off the gates that whitens as it falls (the chute-running and
 *   aerial-spill-2 photographs).
 *
 *   The jets: each bay's flow thrown off its flip bucket in an arc that
 *   spreads, thickens and breaks into spray before it comes down in the
 *   river (aerial-spill, spill-plume).
 *
 *   The plume: where the jets land, a wall of spray standing over the
 *   river as wide as the jets, and a thinner mist that rises off it and
 *   drifts away downwind (spill-plume, aerial-spill, chute-running).
 *
 *   The plunge pool's churn, as GLSL the river's sheet splices in
 *   (index.js withField): boiling white water where the jets land, foam
 *   torn into streaks and swirls downstream of it, and pale, aerated
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
  count: 130, life: 7, rise: 50, drift: 20, s0: 16, s1: 45, opacity: 0.33,
};
const MIST = {
  count: 40, life: 36, rise: 110, drift: 170, s0: 40, s1: 120, opacity: 0.09,
};

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
  return [...by.keys()].sort((a, b) => a - b).map((k) => {
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
      lip,
      half,
      fall: t,
      land: { x: lip.x + axis.along[0] * reach, y: riverY, z: lip.z + axis.along[1] * reach },
    };
  });
}

/* --------------------------------------------------------------- chute */

/*
 * The chutes' water: three's standard material, so the sun, the sky's
 * light and the shadows reach it as they reach the concrete beside it,
 * with the flow's colour and its roughness spliced in. The geometry
 * carries aChute (metres down the chute from the gates, metres across
 * from the bay's middle), as index.js chuteGeometry lays it.
 */
export function chuteMaterial(THREE, { waves, time, envMap }) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.6, metalness: 0, envMap,
  });
  mat.name = 'itaipu-water-chute';
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uWaves: { value: waves }, uTime: time });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aChute;
        varying vec2 vChute;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vChute = aChute;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uWaves;
        uniform float uTime;
        varying vec2 vChute;
        float chuteFoam;
        vec2 chuteSlope;`)
      .replace('#include <map_fragment>', `
        {
          /* Metres across the bay and down the chute, the pattern
           * running down it: long streaks, the rolls that break across
           * them, and the fine boil on top. */
          float d = vChute.x;
          float u = vChute.y;
          float t = uTime * ${CHUTE_SPEED.toFixed(1)};
          float streak = texture2D(uWaves, vec2(u / 11.0, (d - t * 0.9) / 110.0)).a;
          float roll = texture2D(uWaves, vec2(u / 37.0 + 0.31, (d - t) / 17.0)).a;
          /* The foam in clumps a metre or two across, tumbling as it
           * runs: the same scale both ways, or it hatches. */
          float clump = texture2D(uWaves, vec2(u, d - t * 1.1) / 1.9 + vec2(0.57, 0.0)).a * 0.65
            + texture2D(uWaves, vec2(u, d - t * 1.2) / 0.8 + vec2(0.13, 0.29)).a * 0.35;
          float aer = mix(0.35, 1.0, smoothstep(5.0, ${AERATED_BY.toFixed(1)}, d));
          float h = clump * 0.6 + roll * 0.2 + streak * 0.2;
          chuteFoam = smoothstep(0.58 - 0.3 * aer, 0.72 - 0.2 * aer, h) * mix(0.5, 1.0, aer);
          /* Where the air is thinnest, in the streaks' troughs, the water
           * shows grey green through the foam. */
          float trough = 1.0 - smoothstep(0.3, 0.6, streak);
          vec3 water = vec3(0.16, 0.2, 0.16);
          vec3 foam = mix(vec3(0.44, 0.47, 0.42), vec3(0.62, 0.62, 0.58), smoothstep(0.45, 0.75, clump));
          diffuseColor.rgb = mix(water, foam, chuteFoam) * (1.0 - 0.2 * trough * aer);
          vec3 n1 = texture2D(uWaves, vec2(u / 37.0 + 0.31, (d - t) / 17.0)).xyz * 2.0 - 1.0;
          vec3 n2 = texture2D(uWaves, vec2(u, d - t * 1.1) / 1.9 + vec2(0.57, 0.0)).xyz * 2.0 - 1.0;
          chuteSlope = (n1.xy / max(n1.z, 0.3)) * 0.3 + (n2.xy / max(n2.z, 0.3)) * 0.3;
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.12, 0.75, chuteFoam);`)
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
  sets, waves, time, sun, riverY,
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
    },
    vertexShader: /* glsl */ `
      attribute vec4 aBase;
      attribute vec4 aSeed;
      attribute vec4 aMove;
      attribute vec3 aCarry;
      attribute vec4 aThrown;
      uniform float uTime;
      uniform float uRiver;
      uniform vec3 uSunDir;
      varying vec2 vUv;
      varying float vFade;
      varying vec2 vSeed;
      varying float vLift;
      varying vec3 vToSun;
      varying float vForward;
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
        vSeed = aSeed.zw;
        /* The corner's height over the river, for a camera not rolled. */
        vLift = p.y + position.y * size - uRiver;
        /* The sun's way in the sprite's own plane, to shade it as a
         * ball of spray, and how nearly the eye looks toward the sun. */
        vToSun = (viewMatrix * vec4(uSunDir, 0.0)).xyz;
        vForward = max(dot(normalize(p - cameraPosition), uSunDir), 0.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uWaves;
      uniform vec3 uSun;
      uniform vec3 uSky;
      varying vec2 vUv;
      varying float vFade;
      varying vec2 vSeed;
      varying float vLift;
      varying vec3 vToSun;
      varying float vForward;
      void main() {
        vec2 c = vUv * 2.0 - 1.0;
        float d = dot(c, c);
        if (d > 1.0) discard;
        float puff = texture2D(uWaves, vUv * 0.4 + vSeed).a * 0.65 + texture2D(uWaves, vUv * 1.1 + vSeed.yx).a * 0.35;
        float a = (1.0 - smoothstep(0.1, 1.0, d)) * smoothstep(0.3, 0.62, puff + 0.25 * (1.0 - d)) * vFade;
        a *= smoothstep(0.0, 16.0, vLift);
        if (a < 0.004) discard;
        /* A ball's normal under this point of the sprite. */
        vec3 n = vec3(c, sqrt(max(1.0 - d, 0.0)));
        float lit = clamp(dot(n, normalize(vToSun)) * 0.6 + 0.4, 0.0, 1.0);
        vec3 col = uSky + uSun * (0.08 + 0.2 * lit + 0.25 * pow(vForward, 6.0));
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
  /* Round each landing, and back along the jet over its last third,
   * where the spray the air strips off it hides where it meets the river. */
  const bases = list.flatMap((b) => [0, 0.2, 0.4].map((back) => {
    const reach = Math.hypot(b.land.x - b.lip.x, b.land.z - b.lip.z) * back;
    return {
      x: b.land.x - ax * (10 + reach), y: b.land.y, z: b.land.z - az * (10 + reach), half: b.half * (1 + 0.5 * (1 - back)), ax, az, cx: az, cz: -ax,
    };
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
      x: b.lip.x, y: b.lip.y + 1.5, z: b.lip.z, half: b.half, ax: 0, az: 0, cx: az, cz: -ax,
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
    /* The reservoir's sheet has no landings. */
    if (uItPlunge[0].w <= 0.0) {
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
      float boil = 1.0 - smoothstep(0.5, 1.3, length(vec2(al / (b.z * 1.1), ac / (b.z * 1.2))));
      /* The tongues of the bays spread into each other within a hundred
       * metres, as the photographs' one sheet of broken water. */
      float tongue = smoothstep(-b.z, 0.0, al) * (1.0 - smoothstep(60.0, 480.0, al))
        * (1.0 - smoothstep(b.z * 0.6 + al * 0.5, b.z * 1.7 + al * 0.95, abs(ac)));
      churn = max(churn, max(boil, tongue * (0.7 - 0.55 * smoothstep(0.0, 480.0, al))));
    }
    return churn;
  }`;
