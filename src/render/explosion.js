/*
 * explosion.js: the war mode's explosions, drawn (docs/WARFARE-PLAN.md
 * sections 4.3 and 6.3). A defender's warhead, an attacker killed, an
 * attacker reaching its target: each is a white core, an orange fireball
 * that swells and blackens, a shockwave ring, burning debris arcing down,
 * a glow that lights the ground around it for a moment, and smoke that
 * hangs about three seconds.
 *
 * IN THE PICTURE, NOT OVER IT. Everything here is geometry in the scene,
 * drawn by whatever camera renders it, so it goes through the post chain
 * (src/render/post.js: the bloom takes the fireball's HDR core) and is in
 * the FPV feed, the chase view, the crash cam's replay and an exported
 * movie alike. The pilot's own screen flash is the same: a clip space quad
 * in the scene, not a DOM layer.
 *
 * FOUR DRAW CALLS AT MOST, however many go off. Itaipu's views stand near
 * 290 of their 300 calls (ITAIPU-PLAN section 13), so the whole effect is
 * two pools of camera facing quads, one InstancedBufferGeometry each: the
 * additive one (core, fireball, ring, embers, glow) and the blended one
 * (smoke), the smoke pool's quads once more for the flipbook's depth
 * (DEPTH_FRAG: without it the air veiled a fireball by what was behind
 * it), plus the screen flash while it shows. Each particle's shape
 * (a noisy puff, a soft glow, a ring, a frame of the flipbook) is picked
 * in the fragment shader. The pools are fixed; a full one takes the
 * oldest slot. Nothing is allocated per frame.
 *
 * THE FIREBALL AND ITS SMOKE ARE A SIMULATION, played as a flipbook:
 * JangaFX's EmberGen mid air explosion (CC0), rendered offline in
 * Blender into one sheet by tools/explosions/render.py, whose header says
 * what the three channels hold. One quad in each pool plays it, the
 * same frame in both: the fire's light in the additive pool, its smoke's
 * shade and opacity in the blended one. Each explosion is mirrored or not
 * and tilted a little at random, so two side by side are not twins; it is
 * never turned far, because the plume rises. Until the sheet has loaded
 * (it is fetched once, when the first layer is made), an explosion is
 * made of the puffs below instead, cut from one small noise texture made
 * here: never an empty sky.
 *
 * A REAL POINT LIGHT IS NOT USED ON PURPOSE: adding one to the scene
 * changes the light count of every lit material in the map, which
 * recompiles them all (a hitch at the worst moment) and adds a light to
 * every fragment for the rest of the flight. The light is faked by a
 * large, faint additive glow round the fireball for its first half
 * second, which reads as the ground and air lit orange.
 *
 * AT RANGE a particle is never drawn smaller than an angle of its own
 * (minAng, radians), so a kill a kilometre off is still a visible flash
 * and a smudge of smoke, not a pixel.
 *
 * Render only, on the wall clock: nothing here reaches a plant or the room.
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

import * as THREE from 'three';
import { thermalShader } from './thermal.js';

/* The pools. A standard explosion takes about 60 hot and 24 smoke slots,
 * so ten at once fit with room to spare. */
const HOT = 768;
const SMOKE = 320;
const GRAVITY = 9.81;
/* The longest anything lives, seconds: the smoke. A replay throws an
 * explosion again at its age when the playhead lands inside this. */
export const EXPLOSION_S = 6.2;
/* The largest size play() is asked for (a swarm's), so a size can be
 * kept as a fraction of it (src/replay/paper.js boom). */
export const SIZE_MAX = 4;

/* Shapes, in the shader: the last two are the flipbook, as rendered and
 * mirrored. */
const PUFF = 0;
const GLOW = 1;
const RING = 2;
const SIM = 3;
const SIM_MIRROR = 4;

/* The sheet, as tools/explosions/render.py printed it: frames left to
 * right and top to bottom, and the point of a cell that is put where the
 * explosion went off (the fire's middle over its first second), from the
 * cell's top left. */
const SHEET = {
  url: new URL('../../assets/explosions/midair.webp', import.meta.url).href,
  cols: 8,
  rows: 8,
  frames: 64,
  originU: 0.662,
  originV: 0.656,
};

/* Fetched once for every layer made: until it has decoded, sheet.ready is
 * false and play() throws the puffs. A sheet that cannot load is said so
 * on the console and the puffs stay. */
const sheet = { tex: null, ready: false, loading: null, renderers: new Set() };
const sheetU = { value: null };
function loadSheet(renderer) {
  if (renderer) {
    if (sheet.ready) {
      renderer.initTexture(sheet.tex);
    } else {
      sheet.renderers.add(renderer);
    }
  }
  if (sheet.loading) {
    return;
  }
  const blank = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat);
  blank.needsUpdate = true;
  sheetU.value = blank;
  sheet.loading = fetch(SHEET.url)
    .then((res) => {
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return res.blob();
    })
    /* Data, not a picture: no colour management, and no premultiplying
     * (the image has no alpha, but a decoder that is told nothing may
     * still touch it). */
    .then((blob) => createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }))
    .then((bitmap) => {
      const tex = new THREE.Texture(bitmap);
      tex.colorSpace = THREE.NoColorSpace;
      tex.flipY = false;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.generateMipmaps = true;
      tex.needsUpdate = true;
      sheet.tex = tex;
      sheetU.value = tex;
      /* Up to the GPU now, in the menus, rather than at the first
       * explosion: sixteen megabytes and its mipmaps are a hitch. */
      for (const r of sheet.renderers) {
        r.initTexture(tex);
      }
      sheet.renderers.clear();
      sheet.ready = true;
    })
    .catch((e) => {
      console.warn(`explosion: the flipbook ${SHEET.url} did not load, the explosions stay procedural: ${e.message || e}`);
    });
}

/* What one explosion of size 1 is made of: the column hangs about four
 * seconds, so a pilot whose own warhead it was still sees it from the
 * chase view once the goggles have gone to snow. Sizes are metres, speeds m/s,
 * lives seconds. A defender's warhead is size 1.6; a swarm's goes up with
 * the kills. */
const LOOK = {
  core: { size: [10, 32], life: 0.22, minAng: 0.16 },
  light: { size: 150, life: 0.7, alpha: 0.32, minAng: 0.3 },
  fire: { n: 18, spread: 3.5, speed: [6, 16], size: [7, 26], life: [0.9, 1.5], minAng: 0.035 },
  ring: { size: [4, 95], life: 0.55, alpha: 0.5, minAng: 0.01 },
  ember: { n: 26, speed: [14, 34], size: [0.7, 1.6], life: [1.4, 2.6], minAng: 0.004 },
  black: { n: 10, spread: 4, speed: [3, 8], size: [9, 30], life: [2.4, 3.6], delay: [0.12, 0.35], minAng: 0.02 },
  column: { n: 11, rise: [4, 8], size: [10, 44], life: [3.8, 5.2], delay: [0.3, 0.9], minAng: 0.02 },
  /* The flipbook: a cell's side in metres, the seconds it plays over, the
   * most it is tilted either way (radians), and its pace: the sheet is at
   * (age / life) to this power, so the fireball plays faster than the
   * simulation's own 4.1 s (1.3 times over the first second) and the smoke
   * slower, hanging as the puffs' column did. */
  sim: { size: 70, life: 5, tilt: 0.12, pace: 0.7, minAng: 0.09 },
};

/* The fireball's colour over its life: white hot, yellow, orange, a deep
 * red as it dies. Linear, and above 1 at first so the bloom takes it. */
const FIRE_RAMP = [
  [0.0, [3.2, 2.4, 1.3]],
  [0.1, [2.6, 1.2, 0.3]],
  [0.3, [1.8, 0.55, 0.08]],
  [0.6, [0.8, 0.18, 0.03]],
  [1.0, [0.18, 0.04, 0.02]],
];

function rampAt(u, out) {
  let k = 1;
  while (k < FIRE_RAMP.length - 1 && FIRE_RAMP[k][0] < u) {
    k += 1;
  }
  const [u0, c0] = FIRE_RAMP[k - 1];
  const [u1, c1] = FIRE_RAMP[k];
  const a = Math.min(1, Math.max(0, (u - u0) / (u1 - u0)));
  out[0] = c0[0] + (c1[0] - c0[0]) * a;
  out[1] = c0[1] + (c1[1] - c0[1]) * a;
  out[2] = c0[2] + (c1[2] - c0[2]) * a;
}

/* A tileable value noise puff, 64 x 64, alpha only: the one texture
 * every puff is cut from, rotated per particle so no two look alike. */
function puffTexture() {
  const n = 64;
  const g = 8;
  const lattice = new Float32Array(g * g);
  let s = 12345;
  for (let i = 0; i < lattice.length; i += 1) {
    s = (s * 1103515245 + 12345) >>> 0;
    lattice[i] = (s >>> 8) / 16777216;
  }
  const at = (x, y) => lattice[((y % g + g) % g) * g + ((x % g + g) % g)];
  const smooth = (t) => t * t * (3 - 2 * t);
  const noise = (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
    return a + (b - a) * fy;
  };
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const u = (x + 0.5) / n;
      const v = (y + 0.5) / n;
      let f = 0;
      let amp = 0.5;
      let freq = 2;
      for (let o = 0; o < 4; o += 1) {
        f += amp * noise(u * freq * (g / 2), v * freq * (g / 2));
        amp *= 0.5;
        freq *= 2;
      }
      const i = (y * n + x) * 4;
      const c = Math.round(Math.min(1, Math.max(0, f)) * 255);
      data[i] = c;
      data[i + 1] = c;
      data[i + 2] = c;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

const VERT = /* glsl */ `
attribute vec4 iPos;    // xyz, size (m)
attribute vec4 iColor;  // rgb (linear), alpha
attribute vec4 iMisc;   // rotation, shape, minimum angle (rad), seed (the flipbook's: how far through it, 0 to 1)
varying vec2 vUv;
varying vec4 vColor;
varying float vShape;
varying float vSeed;
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos.xyz, 1.0);
  float d = max(-mv.z, 0.0);
  float s = max(iPos.w, d * iMisc.z);
  vec2 p = position.xy;
  vUv = p + 0.5;
  if (iMisc.y > 2.5) {
    // The flipbook: the quad moved so its anchor (simU, simV) is on iPos,
    // and turned about it; mirrored, the picture and the point both.
    float m = iMisc.y > 3.5 ? 1.0 : 0.0;
    vec2 o = vec2(simU - 0.5, 0.5 - simV);
    o.x = mix(o.x, -o.x, m);
    vUv.x = mix(vUv.x, 1.0 - vUv.x, m);
    p -= o;
    // Brought toward the camera by up to a third of its size and shrunk
    // to look the same, so the flat picture does not cut a straight edge
    // through the wall it went off against.
    float pull = min(0.33 * s, 0.5 * d);
    s *= (d - pull) / max(d, 0.001);
    mv.z += pull;
  }
  float c = cos(iMisc.x);
  float sn = sin(iMisc.x);
  vec2 q = vec2(c * p.x - sn * p.y, sn * p.x + c * p.y);
  mv.xy += q * s;
  // A particle the camera is inside is faded rather than cut by the near
  // plane: the pilot's own fireball fills the screen, it does not flicker.
  // The flipbook is one flat picture, never round the camera, so it fades
  // only as it reaches the lens: the pilot's own, 6 m ahead, fills the
  // goggles rather than vanishing.
  float nearFade = iMisc.y > 2.5 ? smoothstep(0.5, 2.5, d) : smoothstep(0.15, 1.2, d / max(s, 0.001) + 0.35);
  vColor = vec4(iColor.rgb, iColor.a * nearFade);
  vShape = iMisc.y;
  vSeed = iMisc.w;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D map;
uniform sampler2D sheet;
uniform float additive;
varying vec2 vUv;
varying vec4 vColor;
varying float vShape;
varying float vSeed;
// One frame of the flipbook at uv in its cell (v up).
vec3 cell(float f, vec2 uv) {
  vec2 c = vec2(mod(f, simCols), floor(f / simCols));
  return texture2D(sheet, (c + vec2(uv.x, 1.0 - uv.y)) / vec2(simCols, simRows)).rgb;
}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  vec3 rgb = vColor.rgb;
  float a;
  // The flipbook's fire, 0 to 1, for the thermal picture.
  float fire = 0.0;
  if (vShape > 2.5) {
    // The two frames either side of this moment, blended, so it does not
    // step at a frame's rate when it plays slowly.
    float ft = vSeed * (simFrames - 1.0);
    float f0 = floor(ft);
    vec3 t = mix(cell(f0, vUv), cell(min(f0 + 1.0, simFrames - 1.0), vUv), ft - f0);
    if (additive > 0.5) {
      // The fire's light, stored as its square root, coloured by how
      // bright it is: a deep red at the edges, orange, the hottest white
      // and over 1 for the bloom. Over the first stretch of the sheet it
      // is whiter and brighter, as the puffs' ramp starts white hot
      // (FIRE_RAMP): a pilot 6 m from their own warhead is in the
      // brightest of it, not in an orange haze.
      float k = t.r * t.r;
      fire = k;
      a = k * sqrt(k);
      float w = 1.0 - smoothstep(0.0, 0.4, vSeed);
      rgb *= mix(vec3(3.0, 0.2 + 2.4 * k, 1.8 * k * k), vec3(3.2, 2.4, 1.1), w) * (1.0 + w);
    } else {
      // The smoke's opacity, and its shade under the sheet's sun.
      a = t.b;
      rgb *= 0.35 + 0.65 * t.g;
    }
  } else if (r >= 1.0) {
    discard;
  } else if (vShape < 0.5) {
    float n = texture2D(map, vUv * 0.7 + vec2(vSeed, vSeed * 1.7)).r;
    float body = 1.0 - smoothstep(0.35, 1.0, r + (n - 0.5) * 0.55);
    a = body * (0.8 + 0.6 * n);
  } else if (vShape < 1.5) {
    a = pow(1.0 - r, 2.2);
  } else {
    float w = (r - 0.86) / 0.07;
    a = exp(-w * w);
  }
  a = clamp(a * vColor.a, 0.0, 1.0);
  if (a < 0.003) discard;
  // Additive: colour times coverage, blended One, One with the alpha
  // left as it was (createPool). Blended smoke: straight alpha.
  gl_FragColor = additive > 0.5 ? vec4(rgb * a, 1.0) : vec4(rgb, a);
}
`;

/*
 * THE FLIPBOOK'S DEPTH. The pools are transparent and write no depth, so
 * the photographic chain's air (src/maps/swiss2/post.js aerial) veiled a
 * fireball by whatever was behind it: under the horizon by the far water
 * and land, a kilometre and more of haze, and over it by nothing, the sky
 * being left alone. Where a fireball crossed the far horizon that drew a
 * pale band across the fire. This pass draws no colour: it writes the
 * flipbook quad's depth where the fire or the smoke is solid, so the air
 * veils it at its own distance, above the horizon and below alike. Its
 * soft rim, under DEPTH_COVER, keeps the background's depth.
 */
const DEPTH_COVER = 0.45;
const DEPTH_FRAG = /* glsl */ `
uniform sampler2D sheet;
varying vec2 vUv;
varying vec4 vColor;
varying float vShape;
varying float vSeed;
vec3 cell(float f, vec2 uv) {
  vec2 c = vec2(mod(f, simCols), floor(f / simCols));
  return texture2D(sheet, (c + vec2(uv.x, 1.0 - uv.y)) / vec2(simCols, simRows)).rgb;
}
void main() {
  if (vShape < 2.5) discard;
  float ft = vSeed * (simFrames - 1.0);
  float f0 = floor(ft);
  vec3 t = mix(cell(f0, vUv), cell(min(f0 + 1.0, simFrames - 1.0), vUv), ft - f0);
  float cover = max(t.b, t.r * t.r) * clamp(vColor.a, 0.0, 1.0);
  if (cover < ${DEPTH_COVER.toFixed(2)}) discard;
  gl_FragColor = vec4(0.0);
}
`;

/* The sheet's layout, into both shaders. */
const SIM_DEFS = /* glsl */ `
const float simCols = ${SHEET.cols.toFixed(1)};
const float simRows = ${SHEET.rows.toFixed(1)};
const float simFrames = ${SHEET.frames.toFixed(1)};
const float simU = ${SHEET.originU.toFixed(4)};
const float simV = ${SHEET.originV.toFixed(4)};
`;

/* One pool of camera facing quads: its geometry, the particles' state on
 * the CPU, and the attributes they are written into each frame. */

function createPool(cap, additive, tex) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.getAttribute('position'));
  const aPos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
  const aColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
  const aMisc = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
  for (const a of [aPos, aColor, aMisc]) {
    a.setUsage(THREE.DynamicDrawUsage);
  }
  geo.setAttribute('iPos', aPos);
  geo.setAttribute('iColor', aColor);
  geo.setAttribute('iMisc', aMisc);
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    vertexShader: `${SIM_DEFS}\n${VERT}`,
    fragmentShader: `${SIM_DEFS}\n${FRAG}`,
    uniforms: { map: { value: tex }, sheet: sheetU, additive: { value: additive ? 1 : 0 } },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: additive ? THREE.CustomBlending : THREE.NormalBlending,
    /* The additive pool's light added, its alpha not: Itaipu's water
     * mirror (src/maps/itaipu/water/index.js SMEAR) is drawn without the
     * sky and reads its alpha as how much of the shores it holds, so a
     * glow that wrote alpha took the blurred sky out from under itself,
     * a dark half disc in the water under a fresh low explosion. */
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  /* In a thermal picture the fire adds its heat, two hundred degrees for
   * each unit of its light up to eight hundred, and the smoke is a thin
   * veil a little over the air's (src/render/thermal.js). The flipbook's
   * fire is eight hundred where it is a third of the sheet's brightest
   * and over, less at its edges: one quad has to carry what eighteen
   * overlapping puffs added up. */
  thermalShader(
    mat,
    additive
      ? 'float thT = vShape > 2.5 ? min(1.0, 3.0 * fire) * 8.0 * clamp(vColor.a, 0.0, 1.0) : a * min(thLum(vColor.rgb), 4.0) * 2.0;'
      : 'float thT = thEnv.y + 0.1; float thA = 0.3;',
    additive ? 'explosion-hot' : 'explosion-smoke',
  );
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = additive ? 6 : 5;
  mesh.name = additive ? 'explosion-hot' : 'explosion-smoke';
  /* Per particle, struct of arrays: position, velocity, age (negative
   * while it waits), life, size from and to, colour kind, alpha, shape,
   * min angle, drag, gravity, rotation and its rate, seed, and the
   * explosion's scale. */
  const P = {
    cap,
    live: new Uint8Array(cap),
    x: new Float32Array(cap * 3),
    v: new Float32Array(cap * 3),
    age: new Float32Array(cap),
    life: new Float32Array(cap),
    s0: new Float32Array(cap),
    s1: new Float32Array(cap),
    kind: new Uint8Array(cap),
    alpha: new Float32Array(cap),
    shape: new Uint8Array(cap),
    minAng: new Float32Array(cap),
    drag: new Float32Array(cap),
    grav: new Float32Array(cap),
    rot: new Float32Array(cap),
    spin: new Float32Array(cap),
    seed: new Float32Array(cap),
    next: 0,
    count: 0,
  };
  return { mesh, geo, mat, quad, aPos, aColor, aMisc, P };
}

/* Colour kinds: how a particle's colour and alpha move over its life. */
const K_CORE = 0;
const K_FIRE = 1;
const K_RING = 2;
const K_EMBER = 3;
const K_LIGHT = 4;
const K_BLACK = 5;
const K_GREY = 6;
const K_SIM_FIRE = 7;
const K_SIM_SMOKE = 8;

const rand = (lo, hi) => lo + Math.random() * (hi - lo);

/*
 * The explosions' layer. Returns { group, play(p, size, ageS), flash(level),
 * update(dtS), stats(), clear(), dispose() }. play throws one at p (world,
 * [x, y, z]) of `size` (1 an attacker's, 1.6 a warhead's, more for a
 * swarm), already ageS old (a replay's jump); update steps them on the
 * frame's seconds; flash(level) whites out this pilot's own screen.
 * `renderer`, if given, has the flipbook uploaded as soon as it arrives.
 */
export function createExplosions({ renderer = null } = {}) {
  loadSheet(renderer);
  const group = new THREE.Group();
  group.name = 'explosions';
  const tex = puffTexture();
  const hot = createPool(HOT, true, tex);
  const smoke = createPool(SMOKE, false, tex);
  group.add(smoke.mesh, hot.mesh);
  /* The smoke pool's quads again, for their depth (DEPTH_FRAG): every
   * flipbook has one quad there, as big as its fire's and in the same
   * place. Drawn after both pools, so neither is held back by it. */
  const depthMat = new THREE.ShaderMaterial({
    vertexShader: `${SIM_DEFS}\n${VERT}`,
    fragmentShader: `${SIM_DEFS}\n${DEPTH_FRAG}`,
    uniforms: { sheet: sheetU },
    transparent: true,
    colorWrite: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
  });
  thermalShader(depthMat, 'float thT = 0.0;', 'explosion-depth');
  const depthMesh = new THREE.Mesh(smoke.geo, depthMat);
  depthMesh.frustumCulled = false;
  depthMesh.renderOrder = 7;
  depthMesh.visible = false;
  depthMesh.name = 'explosion-depth';
  group.add(depthMesh);

  /* The pilot's own screen flash: a quad in clip space, drawn last over
   * everything the camera sees, through the post chain. */
  const flashMat = new THREE.ShaderMaterial({
    vertexShader: 'void main() { gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); }',
    fragmentShader: 'uniform vec3 color; uniform float level; void main() { gl_FragColor = vec4(color * level, 1.0); }',
    uniforms: { color: { value: new THREE.Color(1.0, 0.82, 0.55) }, level: { value: 0 } },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  thermalShader(flashMat, 'float thT = level * 2.0;', 'explosion-flash');
  const flashMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), flashMat);
  flashMesh.frustumCulled = false;
  flashMesh.renderOrder = 999;
  flashMesh.visible = false;
  flashMesh.name = 'explosion-flash';
  group.add(flashMesh);
  let flashAge = 0;
  let flashLife = 0;
  let flashPeak = 0;

  const stats = {
    booms: 0, fire: 0, smoke: 0, flashes: 0, hotLive: 0, smokeLive: 0, dropped: 0, updateMs: 0,
  };

  function spawn(pool, o) {
    const P = pool.P;
    const i = P.next;
    P.next = (P.next + 1) % P.cap;
    if (P.live[i]) {
      stats.dropped += 1;
    } else {
      P.count += 1;
    }
    P.live[i] = 1;
    P.x[i * 3] = o.x;
    P.x[i * 3 + 1] = o.y;
    P.x[i * 3 + 2] = o.z;
    P.v[i * 3] = o.vx;
    P.v[i * 3 + 1] = o.vy;
    P.v[i * 3 + 2] = o.vz;
    P.age[i] = o.age;
    P.life[i] = o.life;
    P.s0[i] = o.s0;
    P.s1[i] = o.s1;
    P.kind[i] = o.kind;
    P.alpha[i] = o.alpha;
    P.shape[i] = o.shape;
    P.minAng[i] = o.minAng;
    P.drag[i] = o.drag;
    P.grav[i] = o.grav;
    P.rot[i] = Math.random() * Math.PI * 2;
    P.spin[i] = o.spin;
    P.seed[i] = Math.random();
    if (o.age > 0) {
      move(P, i, o.age);
    }
    return i;
  }

  /* One reusable spawn record, so play allocates nothing. */
  const o = {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, s0: 1, s1: 1, kind: 0, alpha: 1, shape: 0, minAng: 0, drag: 0, grav: 0, spin: 0,
  };
  function at(p, spread, speed, up) {
    /* A direction on the sphere, lifted by `up` so the ball rises. */
    const u = Math.random() * 2 - 1;
    const t = Math.random() * Math.PI * 2;
    const h = Math.sqrt(1 - u * u);
    const dx = h * Math.cos(t);
    const dy = u * 0.8 + up;
    const dz = h * Math.sin(t);
    const r = Math.random() * spread;
    o.x = p[0] + dx * r;
    o.y = p[1] + dy * r;
    o.z = p[2] + dz * r;
    o.vx = dx * speed;
    o.vy = dy * speed;
    o.vz = dz * speed;
  }

  function play(p, size = 1, ageS = 0) {
    const s = Math.max(0.3, Math.min(SIZE_MAX, size));
    const age0 = ageS;
    stats.booms += 1;
    /* The white core. */
    Object.assign(o, {
      x: p[0], y: p[1], z: p[2], vx: 0, vy: 0, vz: 0, age: age0, life: LOOK.core.life, s0: LOOK.core.size[0] * s, s1: LOOK.core.size[1] * s,
      kind: K_CORE, alpha: 1, shape: GLOW, minAng: LOOK.core.minAng, drag: 0, grav: 0, spin: 0,
    });
    spawn(hot, o);
    /* The light it throws on everything round it. */
    Object.assign(o, {
      life: LOOK.light.life, s0: LOOK.light.size * s, s1: LOOK.light.size * s * 1.2, kind: K_LIGHT, alpha: LOOK.light.alpha, minAng: LOOK.light.minAng,
    });
    spawn(hot, o);
    /* The shockwave. */
    Object.assign(o, {
      life: LOOK.ring.life, s0: LOOK.ring.size[0] * s, s1: LOOK.ring.size[1] * s, kind: K_RING, alpha: LOOK.ring.alpha, shape: RING, minAng: LOOK.ring.minAng,
    });
    spawn(hot, o);
    if (sheet.ready) {
      flipbook(p, s, age0);
    } else {
      puffs(p, s, age0);
    }
    /* Burning debris: small hot glows on ballistic arcs. */
    const e = LOOK.ember;
    for (let k = 0; k < e.n; k += 1) {
      at(p, 1.5 * s, rand(e.speed[0], e.speed[1]) * Math.sqrt(s), 0.45);
      o.age = age0;
      o.life = rand(e.life[0], e.life[1]);
      o.s0 = e.size[1] * s;
      o.s1 = e.size[0] * s;
      o.kind = K_EMBER;
      o.alpha = 1;
      o.shape = GLOW;
      o.minAng = e.minAng;
      o.drag = 0.35;
      o.grav = GRAVITY;
      o.spin = 0;
      spawn(hot, o);
    }
  }

  /* The fireball and its smoke as the simulation: one quad in each pool,
   * on the same frame, mirrored and tilted alike. */
  function flipbook(p, s, age0) {
    const L = LOOK.sim;
    const mirror = Math.random() < 0.5;
    const tilt = rand(-L.tilt, L.tilt);
    /* Longer for a bigger one, but inside EXPLOSION_S, which the replays
     * keep a boom for (src/replay/paperscene.js, warrec.js BOOM_LIFE_MS). */
    const life = Math.min(EXPLOSION_S - 0.2, L.life * (0.8 + 0.2 * s));
    Object.assign(o, {
      x: p[0], y: p[1], z: p[2], vx: 0, vy: 0, vz: 0, age: age0, life, s0: L.size * s, s1: L.size * s,
      kind: K_SIM_FIRE, alpha: 1, shape: mirror ? SIM_MIRROR : SIM, minAng: L.minAng, drag: 0, grav: 0, spin: 0,
    });
    hot.P.rot[spawn(hot, o)] = tilt;
    o.kind = K_SIM_SMOKE;
    smoke.P.rot[spawn(smoke, o)] = tilt;
    stats.fire += 1;
    stats.smoke += 1;
  }

  /* The fireball and its smoke as puffs, while the sheet loads. */
  function puffs(p, s, age0) {
    /* The fireball: puffs thrown out and braked hard, swelling. */
    const f = LOOK.fire;
    const nFire = Math.round(f.n * Math.min(2, Math.sqrt(s)));
    for (let k = 0; k < nFire; k += 1) {
      at(p, f.spread * s, rand(f.speed[0], f.speed[1]) * Math.sqrt(s), 0.25);
      o.age = age0 - k * 0.006;
      o.life = rand(f.life[0], f.life[1]) * (0.8 + 0.2 * s);
      o.s0 = f.size[0] * s * rand(0.7, 1.2);
      o.s1 = f.size[1] * s * rand(0.7, 1.2);
      o.kind = K_FIRE;
      /* Eighteen of them overlap: at full each, the sum is white. */
      o.alpha = 0.55;
      o.shape = PUFF;
      o.minAng = f.minAng;
      o.drag = 3.2;
      o.grav = -2.5;
      o.spin = rand(-0.8, 0.8);
      spawn(hot, o);
    }
    stats.fire += nFire;
    /* The fireball going black, then the column that hangs. */
    const b = LOOK.black;
    for (let k = 0; k < b.n; k += 1) {
      at(p, b.spread * s, rand(b.speed[0], b.speed[1]) * Math.sqrt(s), 0.4);
      o.age = age0 - rand(b.delay[0], b.delay[1]);
      o.life = rand(b.life[0], b.life[1]);
      o.s0 = b.size[0] * s;
      o.s1 = b.size[1] * s;
      o.kind = K_BLACK;
      o.alpha = 0.95;
      o.shape = PUFF;
      o.minAng = b.minAng;
      o.drag = 1.6;
      o.grav = -1.2;
      o.spin = rand(-0.3, 0.3);
      spawn(smoke, o);
    }
    const c = LOOK.column;
    for (let k = 0; k < c.n; k += 1) {
      at(p, 3 * s, 1.5, 0);
      o.vy = rand(c.rise[0], c.rise[1]) * Math.sqrt(s);
      o.age = age0 - rand(c.delay[0], c.delay[1]);
      o.life = rand(c.life[0], c.life[1]);
      o.s0 = c.size[0] * s;
      o.s1 = c.size[1] * s;
      o.kind = K_GREY;
      o.alpha = 1;
      o.shape = PUFF;
      o.minAng = c.minAng;
      o.drag = 0.25;
      o.grav = 0;
      o.spin = rand(-0.2, 0.2);
      spawn(smoke, o);
    }
    stats.smoke += b.n + c.n;
  }

  const col = [0, 0, 0];
  function colourOf(kind, u, out) {
    switch (kind) {
      case K_CORE:
        out[0] = 8;
        out[1] = 7;
        out[2] = 5.5;
        return 1 - u * u;
      case K_LIGHT:
        out[0] = 1.6;
        out[1] = 0.6;
        out[2] = 0.18;
        return (1 - u) * (1 - u);
      case K_RING:
        out[0] = 1.5;
        out[1] = 1.0;
        out[2] = 0.6;
        return 1 - u;
      case K_FIRE:
        rampAt(u, out);
        return u < 0.08 ? u / 0.08 : 1 - (u - 0.08) / 0.92;
      case K_SIM_FIRE:
        /* The sheet's light, over 1 for the bloom; in quickly, and out
         * over the last tenth, where the simulation has gone grey. */
        out[0] = 1.4;
        out[1] = 1.4;
        out[2] = 1.4;
        return Math.min(1, u / 0.01) * (u < 0.9 ? 1 : (1 - u) / 0.1);
      case K_SIM_SMOKE:
        /* The smoke lit and in shadow are this times the sheet's shade. */
        out[0] = 0.09;
        out[1] = 0.088;
        out[2] = 0.085;
        return u < 0.85 ? 1 : (1 - u) / 0.15;
      case K_EMBER:
        out[0] = 5;
        out[1] = 1.9 - u * 1.2;
        out[2] = 0.35;
        return 1 - u * u;
      case K_BLACK: {
        const g = 0.006 + 0.02 * u;
        out[0] = g;
        out[1] = g * 0.95;
        out[2] = g * 0.9;
        return u < 0.1 ? u / 0.1 : (u < 0.5 ? 1 : 1 - (u - 0.5) / 0.5);
      }
      default: {
        /* Held dense for most of its life, so it reads against a bright
         * sky, then thinned away. */
        const g = 0.018 + 0.04 * u;
        out[0] = g;
        out[1] = g;
        out[2] = g * 1.02;
        return u < 0.12 ? u / 0.12 : (u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4);
      }
    }
  }

  /* Particle i of pool P moved on by t seconds: ballistic with drag, in
   * closed form, so a throw at an age (a replay's jump) lands where the
   * frames would have put it. */
  function move(P, i, t) {
    const k = P.drag[i];
    const damp = k > 0 ? Math.exp(-k * t) : 1;
    const travel = k > 0 ? (1 - damp) / k : t;
    const j = i * 3;
    P.x[j] += P.v[j] * travel;
    P.x[j + 1] += P.v[j + 1] * travel - 0.5 * P.grav[i] * t * t;
    P.x[j + 2] += P.v[j + 2] * travel;
    P.v[j] *= damp;
    P.v[j + 1] = P.v[j + 1] * damp - P.grav[i] * t;
    P.v[j + 2] *= damp;
    P.rot[i] += P.spin[i] * t;
  }

  /* Steps a pool by dt and writes its live particles into the
   * attributes, packed from 0. */
  function stepPool(pool, dt) {
    const P = pool.P;
    const pos = pool.aPos.array;
    const colr = pool.aColor.array;
    const misc = pool.aMisc.array;
    let w = 0;
    for (let i = 0; i < P.cap; i += 1) {
      if (!P.live[i]) {
        continue;
      }
      let a = P.age[i] + dt;
      if (a >= P.life[i]) {
        P.live[i] = 0;
        P.count -= 1;
        continue;
      }
      P.age[i] = a;
      if (a < 0) {
        continue;
      }
      move(P, i, Math.min(dt, a));
      const j = i * 3;
      const u = a / P.life[i];
      const grow = 1 - (1 - u) * (1 - u) * (1 - u);
      const alpha = colourOf(P.kind[i], u, col) * P.alpha[i];
      const o4 = w * 4;
      pos[o4] = P.x[j];
      pos[o4 + 1] = P.x[j + 1];
      pos[o4 + 2] = P.x[j + 2];
      pos[o4 + 3] = P.s0[i] + (P.s1[i] - P.s0[i]) * grow;
      colr[o4] = col[0];
      colr[o4 + 1] = col[1];
      colr[o4 + 2] = col[2];
      colr[o4 + 3] = alpha;
      misc[o4] = P.rot[i];
      misc[o4 + 1] = P.shape[i];
      misc[o4 + 2] = P.minAng[i];
      /* A flipbook's seed is how far through the sheet it is. */
      misc[o4 + 3] = P.shape[i] >= SIM ? u ** LOOK.sim.pace : P.seed[i];
      w += 1;
    }
    pool.geo.instanceCount = w;
    pool.mesh.visible = w > 0;
    if (w > 0) {
      for (const attr of [pool.aPos, pool.aColor, pool.aMisc]) {
        attr.clearUpdateRanges();
        attr.addUpdateRange(0, w * 4);
        attr.needsUpdate = true;
      }
    }
    return w;
  }

  function update(dtS) {
    const t0 = performance.now();
    const dt = Math.min(0.1, Math.max(0, dtS));
    stats.hotLive = stepPool(hot, dt);
    stats.smokeLive = stepPool(smoke, dt);
    depthMesh.visible = smoke.mesh.visible && sheet.ready;
    stats.updateMs = performance.now() - t0;
    if (flashMesh.visible) {
      flashAge += dt;
      const u = flashAge / flashLife;
      if (u >= 1) {
        flashMesh.visible = false;
      } else {
        /* Up hard in the first frames, then away over the rest. */
        flashMat.uniforms.level.value = flashPeak * (u < 0.06 ? u / 0.06 : (1 - u) ** 1.6);
      }
    }
  }

  /* This pilot's own screen whited out, level 0 to 1. */
  function flash(level = 1, life = 0.9) {
    flashAge = 0;
    flashLife = life;
    flashPeak = 1.6 * Math.max(0, Math.min(1, level));
    flashMesh.visible = true;
    stats.flashes += 1;
  }

  function clear() {
    for (const pool of [hot, smoke]) {
      pool.P.live.fill(0);
      pool.P.count = 0;
      pool.geo.instanceCount = 0;
      pool.mesh.visible = false;
    }
    depthMesh.visible = false;
    flashMesh.visible = false;
    stats.hotLive = 0;
    stats.smokeLive = 0;
  }

  function dispose() {
    for (const pool of [hot, smoke]) {
      pool.geo.dispose();
      pool.quad.dispose();
      pool.mat.dispose();
    }
    depthMat.dispose();
    flashMesh.geometry.dispose();
    flashMat.dispose();
    tex.dispose();
    group.clear();
  }

  return {
    group,
    play,
    flash,
    update,
    clear,
    dispose,
    /* For the checks: what was thrown and what lives now; draw calls this
     * layer adds this frame; the pools' sizes, which never change; and
     * whether the flipbook has loaded. */
    stats: () => ({
      ...stats,
      flipbook: sheet.ready,
      calls: (hot.mesh.visible ? 1 : 0) + (smoke.mesh.visible ? 1 : 0) + (depthMesh.visible ? 1 : 0) + (flashMesh.visible ? 1 : 0),
      pool: HOT + SMOKE,
    }),
  };
}
