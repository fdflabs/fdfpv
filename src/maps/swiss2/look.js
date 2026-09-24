/*
 * look.js: the photographic valley's answer to every material the alps'
 * builders ask for.
 *
 * The builders name what a surface is (src/maps/alps/look.js), and this
 * look answers with a physically based material: the village's table by
 * the same keys as villageMaterials, photographed boards, render, stone,
 * shingle and slate where the cel look has a flat colour; painted metal
 * with a clear coat where the cel look has a painted highlight; the
 * ground's own splat on anything that is ground (the strip, the range
 * beyond, the headwall, a boulder, a drift).
 *
 * The alps' geometry carries no texture coordinates worth the name: a
 * baked village is thousands of boxes whose uvs run nought to one across
 * every face whatever its size. So after the build, worldUv gives every
 * textured mesh uvs in metres, per triangle, projected along the face:
 * across a wall horizontally and up it, along a roof's eave and up its
 * slope, so boards and shingle courses run level and a texture is the
 * same size on a shed as on the church.
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

import * as THREE from 'three';

/* Metres one tile of each surface covers, read off the photographs'
 * own published sizes where they have one. */
const TILE = {
  boards: 2.0,
  render: 2.5,
  stone: 2.0,
  shingle: 1.4,
  slate: 1.6,
  asphalt: 3.0,
  gravel: 2.25,
  cobble: 2.4,
  concrete: 3.0,
  metal: 1.12,
};

/* A colour given in linear light, which is what a tint on an albedo is. */
const lin = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);

/*
 * Give a geometry uvs in metres along its own faces. Per triangle: the
 * face's normal picks a horizontal tangent (along a wall, along an eave)
 * and the direction up the face; a flat face runs x and z. An indexed
 * geometry is unindexed first, because a vertex shared by two faces at
 * an angle cannot carry both faces' coordinates.
 */
export function worldUv(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = g.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const t = new THREE.Vector3();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let k = 0; k + 2 < pos.count; k += 3) {
    a.fromBufferAttribute(pos, k);
    b.fromBufferAttribute(pos, k + 1);
    c.fromBufferAttribute(pos, k + 2);
    n.subVectors(c, b).cross(t.subVectors(a, b)).normalize();
    if (Math.abs(n.y) > 0.985) {
      t.set(1, 0, 0);
      s.set(0, 0, -1);
    } else {
      t.crossVectors(up, n).normalize();
      s.crossVectors(n, t).normalize();
    }
    for (let q = 0; q < 3; q += 1) {
      const p = q === 0 ? a : q === 1 ? b : c;
      uv[(k + q) * 2] = p.dot(t);
      uv[(k + q) * 2 + 1] = p.dot(s);
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/*
 * Weather on a wall. A new building in a render is one colour from sill
 * to eave; a real one is splashed dark and brown for the first metre
 * over the ground where rain bounces and grass grows against it, and no
 * two walls have aged alike. The wall reads its height over the ground
 * off the field's own heights (light.js hands them over after the bake,
 * through `heights`), and its world position from vS2World, which lit()
 * declares for every material it touches.
 */
const WEATHER_PARS = /* glsl */ `
  uniform highp sampler2D uS2Height;
  uniform vec3 uS2Grid;
  float s2wHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float s2wNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(s2wHash(i), s2wHash(i + vec2(1.0, 0.0)), u.x),
               mix(s2wHash(i + vec2(0.0, 1.0)), s2wHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
`;
/*
 * Three kinds of age. A wall: the rain splash dark and green along its
 * foot, grime run down from every sill, and on the weather side, where
 * the rain and the wind off the west reach it, timber silvered grey
 * (uS2Grey says how far a surface goes: boards all the way, render and
 * stone not at all). A roof: moss and lichen in the damp (as far as
 * uS2Grey says), streaks down the fall line, and courses replaced in
 * different years. Paving: worn lighter where the feet go and dark with
 * grime where they do not. One program for all three, the kind a
 * uniform, and the window trim is left out of it: a program compiled
 * for a new combination mid flight (the trim is instanced as well as
 * baked) raised the loop's views run from 14 GL_INVALID_VALUE warnings
 * to 26, and to 50 with a program per kind (PR #17 met the same).
 */
const WEATHER = { wall: 0, roof: 1, paving: 2 };
const WEATHER_BODY = /* glsl */ `
  {
    vec3 wn = inverseTransformDirection(normal, viewMatrix);
    if (uS2Kind < 0.5) {
      float wall = 1.0 - smoothstep(0.35, 0.7, abs(wn.y));
      vec2 f = (vS2World.xz + uS2Grid.x) / uS2Grid.y;
      float groundY = texture2D(uS2Height, (f + 0.5) / uS2Grid.z).r;
      float above = vS2World.y - groundY;
      float n = s2wNoise(vS2World.xz * 0.9 + vS2World.y * 0.3);
      float splash = (1.0 - smoothstep(0.05, 0.6 + 0.6 * n, above)) * wall;
      diffuseColor.rgb *= mix(vec3(1.0), vec3(0.42, 0.43, 0.34), splash);
      vec2 along = normalize(vec2(wn.z, -wn.x) + 1e-4);
      float run = s2wNoise(vec2(dot(vS2World.xz, along) * 1.9, vS2World.y * 0.07));
      diffuseColor.rgb *= 1.0 - 0.16 * smoothstep(0.55, 0.85, run) * wall;
      float age = s2wNoise(vS2World.xz / 13.0 + vec2(vS2World.y / 29.0));
      float weatherSide = smoothstep(-0.3, 0.7, dot(normalize(wn.xz + 1e-4), vec2(-0.95, 0.3))) * wall;
      float grey = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.02, 1.0, 0.97) * (0.1 + 1.1 * grey), uS2Grey * weatherSide * (0.55 + 0.45 * age));
      diffuseColor.rgb *= mix(vec3(0.86, 0.85, 0.84), vec3(1.06, 1.04, 1.0), age);
    } else if (uS2Kind < 1.5) {
      float roof = smoothstep(0.25, 0.55, wn.y);
      float m = s2wNoise(vS2World.xz * 0.45) * 0.6 + s2wNoise(vS2World.xz * 1.7 + 7.0) * 0.4;
      float moss = smoothstep(0.52, 0.78, m) * roof;
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.58, 0.74, 0.36), moss * uS2Grey);
      vec2 fall = normalize(wn.xz + 1e-4);
      vec2 across = vec2(-fall.y, fall.x);
      float streak = s2wNoise(vec2(dot(vS2World.xz, across) * 2.6, dot(vS2World.xz, fall) * 0.18));
      diffuseColor.rgb *= 1.0 - 0.28 * smoothstep(0.5, 0.9, streak) * roof;
      diffuseColor.rgb *= 0.82 + 0.34 * s2wNoise(vec2(dot(vS2World.xz, across) * 0.5, dot(vS2World.xz, fall) * 2.2));
    } else if (uS2Kind < 2.5) {
      float worn = s2wNoise(vS2World.xz / 4.0) * 0.65 + s2wNoise(vS2World.xz / 0.9) * 0.35;
      diffuseColor.rgb *= mix(vec3(0.7, 0.69, 0.66), vec3(1.12, 1.1, 1.06), smoothstep(0.3, 0.75, worn));
    }
  }
`;

function weathered(mat, heights, kind = 'wall', grey = 0) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = function onBeforeCompile(shader, renderer) {
    prev.call(this, shader, renderer);
    shader.uniforms.uS2Height = heights.texture;
    shader.uniforms.uS2Grid = heights.grid;
    shader.uniforms.uS2Kind = { value: WEATHER[kind] };
    shader.uniforms.uS2Grey = { value: grey };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uS2Kind;\nuniform float uS2Grey;\n${WEATHER_PARS}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${WEATHER_BODY}`);
  };
  mat.customProgramCacheKey = () => 's2-weathered';
  return mat;
}

/*
 * Build the look. `surfaces` are assets.js's loaded texture sets by name,
 * `ground(opts)` makes a ground material (ground.js), and `heights` is
 * where the field's heights will be for the walls' weather ({ texture,
 * grid } uniforms, filled after the bake).
 */
export function makePhotoLook({ surfaces, ground, heights }) {
  for (const [name, set] of Object.entries(surfaces)) {
    for (const t of [set.col, set.nrm, set.arm]) {
      t.repeat.set(1 / TILE[name], 1 / TILE[name]);
    }
  }
  /* A photographed surface: albedo times tint, the normal map, and the
   * arm map's green for roughness (and its red for occlusion, its blue
   * for metalness where the surface is metal). */
  const textured = (name, tint, { rough = 1, metal = 0, normal = 1, side = THREE.FrontSide, weather = false, grey = 0 } = {}) => {
    const set = surfaces[name];
    const m = new THREE.MeshStandardMaterial({
      color: tint,
      map: set.col,
      normalMap: set.nrm,
      normalScale: new THREE.Vector2(normal, normal),
      roughnessMap: set.arm,
      roughness: rough,
      aoMap: set.arm,
      aoMapIntensity: 1,
      metalnessMap: metal > 0 ? set.arm : null,
      metalness: metal,
      side,
    });
    m.userData.s2WorldUv = true;
    if (weather) {
      weathered(m, heights, weather === true ? 'wall' : weather, grey);
    }
    return m;
  };
  const plain = (color, rough, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });

  /* Old window glass is dark from outside and the sky is in it: the
   * reflection is lifted over three's physically plain one because a
   * room behind the pane is darker than the black the glass is drawn
   * as, which reads as a hole, and a pane seen from the street mostly
   * shows the sky and the eaves. */
  const glass = () => new THREE.MeshPhysicalMaterial({
    color: lin(0.02, 0.024, 0.028),
    roughness: 0.03,
    metalness: 0,
    ior: 1.5,
    specularIntensity: 1,
    envMapIntensity: 2.4,
  });

  /*
   * The buildings, by group rather than by key (src/maps/swiss2/buildings/
   * bakes them). Every key of one photographed surface is one material
   * and one draw: the key's tint rides in the vertex colour, and its
   * weather, its grey and its normal's strength in s2Finish, so a
   * shutter, a log end and a balcony board are the boards drawn once.
   * The plain paints are one material the same way, their roughness and
   * metalness per vertex. The glass and the fountain's water are
   * physical and stay their own.
   */
  const WEATHER_KIND = { ...WEATHER, none: 3 };
  const BUILDING = {
    stone: { group: 'stone', tint: [0.95, 0.95, 0.95], weather: 'wall' },
    render: { group: 'render', tint: [0.8, 0.78, 0.74], normal: 1.6, weather: 'wall' },
    trim: { group: 'render', tint: [0.72, 0.7, 0.66], normal: 0.3 },
    larchDark: { group: 'boards', tint: [0.72, 0.62, 0.55], weather: 'wall', grey: 0.55 },
    larch: { group: 'boards', tint: [1.2, 1.0, 0.82], weather: 'wall', grey: 0.7 },
    honey: { group: 'boards', tint: [2.1, 1.6, 1.0], weather: 'wall', grey: 0.5 },
    weathered: { group: 'boards', tint: [1.5, 1.45, 1.45], weather: 'wall', grey: 0.8 },
    boardLine: { group: 'boards', tint: [0.35, 0.3, 0.28] },
    shutterGreen: { group: 'boards', tint: [0.35, 1.1, 0.45], normal: 0.6 },
    shutterRed: { group: 'boards', tint: [1.9, 0.45, 0.35], normal: 0.6 },
    fence: { group: 'boards', tint: [1.35, 1.25, 1.15] },
    logEnd: { group: 'boards', tint: [3.0, 2.4, 1.6], normal: 0.4 },
    shingle: { group: 'shingle', tint: [1.0, 0.97, 0.95], weather: 'roof', grey: 1 },
    shingleDark: { group: 'shingle', tint: [0.7, 0.66, 0.62], weather: 'roof', grey: 1 },
    slate: { group: 'slate', tint: [1.15, 1.15, 1.2], weather: 'roof', grey: 0.45 },
    hangar: { group: 'metal', tint: [0.5, 0.58, 0.52], weather: 'wall' },
    hangarRoof: { group: 'metal', tint: [0.36, 0.4, 0.38] },
    asphalt: { group: 'asphalt', tint: [0.85, 0.85, 0.85] },
    gravel: { group: 'gravel', tint: [0.8, 0.82, 0.85] },
    cobble: { group: 'cobble', tint: [1.0, 1.0, 1.0], weather: 'paving' },
    concrete: { group: 'concrete', tint: [1.6, 1.6, 1.55] },
    geranium: { group: 'plain', tint: [0.62, 0.02, 0.03], rough: 0.75 },
    metal: { group: 'plain', tint: [0.55, 0.56, 0.57], rough: 0.42, metal: 0.9 },
    ink: { group: 'plain', tint: [0.03, 0.03, 0.035], rough: 0.5, metal: 0.6 },
    door: { group: 'plain', tint: [0.05, 0.06, 0.065], rough: 0.55, metal: 0.3 },
    cross: { group: 'plain', tint: [0.9, 0.62, 0.22], rough: 0.3, metal: 1 },
    paint: { group: 'plain', tint: [0.72, 0.72, 0.68], rough: 0.55 },
    signBlue: { group: 'plain', tint: [0.012, 0.06, 0.3], rough: 0.4, metal: 0.2 },
    signRed: { group: 'plain', tint: [0.55, 0.018, 0.02], rough: 0.4, metal: 0.2 },
    cone: { group: 'plain', tint: [0.85, 0.2, 0.01], rough: 0.55 },
    fuel: { group: 'plain', tint: [0.5, 0.03, 0.02], rough: 0.35, metal: 0.2 },
    glass: { group: 'glass' },
    water: { group: 'water' },
  };
  const FINISH_PARS = /* glsl */ `
    varying vec3 vS2Finish;
    #define uS2Grey vS2Finish.x
    #define uS2Kind vS2Finish.y
  `;
  const grouped = (name, { metal = 0 } = {}) => {
    const set = surfaces[name];
    const m = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      map: set.col,
      normalMap: set.nrm,
      roughnessMap: set.arm,
      roughness: 1,
      aoMap: set.arm,
      aoMapIntensity: 1,
      metalnessMap: metal > 0 ? set.arm : null,
      metalness: metal,
    });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uS2Height = heights.texture;
      shader.uniforms.uS2Grid = heights.grid;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 s2Finish;\nvarying vec3 vS2Finish;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvS2Finish = s2Finish;');
      /* three's own normal map chunk, with the key's strength on it. */
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FINISH_PARS}\n${WEATHER_PARS}`)
        .replace('#include <normal_fragment_maps>', `
          vec3 mapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
          mapN.xy *= normalScale * vS2Finish.z;
          normal = normalize(tbn * mapN);
          ${WEATHER_BODY}`);
    };
    m.customProgramCacheKey = () => 's2-building';
    return m;
  };
  const plainGroup = () => {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, metalness: 1 });
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 s2Finish;\nvarying vec3 vS2Finish;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvS2Finish = s2Finish;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vS2Finish;')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= vS2Finish.x;')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= vS2Finish.y;');
    };
    m.customProgramCacheKey = () => 's2-building-plain';
    return m;
  };
  /*
   * What a key is finished with: its group, its colour (linear) and its
   * s2Finish triple, (grey, weather kind, normal strength) on a textured
   * group and (roughness, metalness, 0) on the plain one. A key nobody
   * has said the finish of fails loudly.
   */
  const buildingFinish = (key) => {
    const b = BUILDING[key];
    if (!b) {
      throw new Error(`swiss2 look: no building finish named ${key}; say what it is made of in src/maps/swiss2/look.js`);
    }
    const finish = b.group === 'plain'
      ? [b.rough ?? 1, b.metal ?? 0, 0]
      : [b.grey ?? 0, WEATHER_KIND[b.weather ?? 'none'], b.normal ?? 1];
    return { group: b.group, tint: b.tint ?? [1, 1, 1], finish };
  };
  /* One material per group, made when the village is baked; `glass` and
   * `water` are the village table's own. */
  const buildingGroups = (mats) => ({
    boards: grouped('boards'),
    render: grouped('render'),
    stone: grouped('stone'),
    shingle: grouped('shingle'),
    slate: grouped('slate'),
    metal: grouped('metal', { metal: 0.4 }),
    asphalt: grouped('asphalt'),
    gravel: grouped('gravel'),
    cobble: grouped('cobble'),
    concrete: grouped('concrete'),
    plain: plainGroup(),
    glass: mats.glass,
    water: mats.water,
  });

  /* The village, by villageMaterials' keys. */
  const village = () => ({
    stone: textured('stone', lin(0.95, 0.95, 0.95), { weather: true }),
    render: textured('render', lin(0.8, 0.78, 0.74), { normal: 1.6, weather: true }),
    larchDark: textured('boards', lin(0.72, 0.62, 0.55), { weather: true, grey: 0.55 }),
    larch: textured('boards', lin(1.2, 1.0, 0.82), { weather: true, grey: 0.7 }),
    honey: textured('boards', lin(2.1, 1.6, 1.0), { weather: true, grey: 0.5 }),
    weathered: textured('boards', lin(1.5, 1.45, 1.45), { weather: true, grey: 0.8 }),
    boardLine: textured('boards', lin(0.35, 0.3, 0.28)),
    shingle: textured('shingle', lin(1.0, 0.97, 0.95), { weather: 'roof', grey: 1 }),
    shingleDark: textured('shingle', lin(0.7, 0.66, 0.62), { weather: 'roof', grey: 1 }),
    slate: textured('slate', lin(1.15, 1.15, 1.2), { weather: 'roof', grey: 0.45 }),
    trim: textured('render', lin(0.72, 0.7, 0.66), { normal: 0.3 }),
    glass: glass(),
    shutterGreen: textured('boards', lin(0.35, 1.1, 0.45), { normal: 0.6 }),
    shutterRed: textured('boards', lin(1.9, 0.45, 0.35), { normal: 0.6 }),
    geranium: plain(lin(0.62, 0.02, 0.03), 0.75),
    metal: plain(lin(0.55, 0.56, 0.57), 0.42, 0.9),
    ink: plain(lin(0.03, 0.03, 0.035), 0.5, 0.6),
    hangar: textured('metal', lin(0.5, 0.58, 0.52), { rough: 1, metal: 0.4, weather: true }),
    hangarRoof: textured('metal', lin(0.36, 0.4, 0.38), { rough: 1, metal: 0.4 }),
    door: plain(lin(0.05, 0.06, 0.065), 0.55, 0.3),
    cross: plain(lin(0.9, 0.62, 0.22), 0.3, 1),
    fence: textured('boards', lin(1.35, 1.25, 1.15)),
    asphalt: textured('asphalt', lin(0.85, 0.85, 0.85)),
    gravel: textured('gravel', lin(0.8, 0.82, 0.85)),
    cobble: textured('cobble', lin(1.0, 1.0, 1.0), { weather: 'paving' }),
    concrete: textured('concrete', lin(1.6, 1.6, 1.55)),
    paint: plain(lin(0.72, 0.72, 0.68), 0.55),
    signBlue: plain(lin(0.012, 0.06, 0.3), 0.4, 0.2),
    signRed: plain(lin(0.55, 0.018, 0.02), 0.4, 0.2),
    cone: plain(lin(0.85, 0.2, 0.01), 0.55),
    water: new THREE.MeshPhysicalMaterial({ color: lin(0.02, 0.04, 0.05), roughness: 0.06, metalness: 0 }),
    fuel: plain(lin(0.5, 0.03, 0.02), 0.35, 0.2),
    logEnd: textured('boards', lin(3.0, 2.4, 1.6), { normal: 0.4 }),
  });

  /*
   * Everything painted and moving is one vertex coloured bake per kind, so
   * one material draws the paint, the glass and the tyres of a car alike.
   * The colours the vehicles are built from are known (vehicles.js's
   * PAINT), so the shader finds the glass, the rubber and the chrome by
   * their vertex colour and gives each its own finish.
   */
  const FINISH_GLSL = /* glsl */ `
    uniform vec3 uS2Glass;
    uniform vec3 uS2Tyre;
    uniform vec3 uS2Chrome;
    uniform vec3 uS2Rim;
    float s2Is(vec3 c, vec3 k) {
      vec3 d = c - k;
      return 1.0 - smoothstep(0.00002, 0.0002, dot(d, d));
    }
  `;
  const finishUniforms = {
    uS2Glass: { value: new THREE.Color(0x27384b) },
    uS2Tyre: { value: new THREE.Color(0x26272b) },
    uS2Chrome: { value: new THREE.Color(0xd6d9dc) },
    uS2Rim: { value: new THREE.Color(0xb4b8bc) },
  };
  const painted = ({ rough = 0.45, clearcoat = 0.8, side = THREE.FrontSide } = {}) => {
    const m = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: rough,
      metalness: 0,
      clearcoat,
      clearcoatRoughness: 0.12,
      side,
    });
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, finishUniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FINISH_GLSL}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          float s2Glass = s2Is(vColor.rgb, uS2Glass);
          float s2Tyre = s2Is(vColor.rgb, uS2Tyre);
          float s2Chrome = max(s2Is(vColor.rgb, uS2Chrome), s2Is(vColor.rgb, uS2Rim));
          roughnessFactor = mix(roughnessFactor, 0.04, s2Glass);
          roughnessFactor = mix(roughnessFactor, 0.9, s2Tyre);
          roughnessFactor = mix(roughnessFactor, 0.22, s2Chrome);
          diffuseColor.rgb *= 1.0 - 0.75 * s2Glass;`)
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
          metalnessFactor = mix(metalnessFactor, 1.0, s2Chrome);`)
        .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
          material.clearcoat *= 1.0 - s2Tyre;`);
    };
    m.customProgramCacheKey = () => 's2-painted';
    return m;
  };

  /* What swiss2 builds from nature.js (the strip, the shore's timber and
   * gravel, the reeds, the old snow) and the paths; the forests and the
   * water are the vegetation's and the water's own. A name not here is a
   * builder asking for a surface nobody has said the finish of, and fails
   * loudly rather than drawing three's default white. */
  const byName = {
    strip: () => ground({ strip: 1 }),
    timber: () => textured('boards', lin(0.8, 0.7, 0.6)),
    'boat-hull': (opts) => textured('boards', lin(0.9, 0.7, 0.55), { side: opts.side ?? THREE.FrontSide }),
    'gravel-path': () => textured('gravel', lin(0.75, 0.72, 0.7)),
    path: () => textured('gravel', lin(0.62, 0.52, 0.42)),
    drift: () => ground({ only: 5 }),
    reeds: (opts) => plain(lin(0.1, 0.16, 0.035), 0.85, 0, { side: opts.side ?? THREE.FrontSide }),
    'reeds-deep': (opts) => plain(lin(0.07, 0.11, 0.03), 0.85, 0, { side: opts.side ?? THREE.FrontSide }),
    'reed-heads': (opts) => plain(lin(0.1, 0.06, 0.03), 0.85, 0, { side: opts.side ?? THREE.FrontSide }),
  };
  const partsByName = {
    'far-range': () => ground({}),
    paint: () => painted({}),
    lift: () => painted({ rough: 0.4, clearcoat: 0.6 }),
    windsock: (opts) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: opts.side ?? THREE.FrontSide }),
    fauna: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 }),
  };
  const ask = (table, kind, name, opts) => {
    const make = table[name];
    if (!make) {
      throw new Error(`swiss2 look: no ${kind} named ${name}; say what it is made of in src/maps/swiss2/look.js`);
    }
    return make(opts || {});
  };
  return {
    style: 'photoreal',
    material: (name, opts) => ask(byName, 'material', name, opts),
    parts: (name, opts) => ask(partsByName, 'parts material', name, opts),
    village,
    buildingFinish,
    buildingGroups,
  };
}

/*
 * After the build: give every textured mesh its metre uvs, once per
 * geometry, and pass every material through `lit`, the builders' and the
 * vegetation's and the water's alike.
 */
export function finishScene(scene, lit) {
  /* A geometry two meshes share is given its uvs once, and both are
   * pointed at the result. */
  const remap = new Map();
  scene.traverse((o) => {
    if (!o.isMesh) {
      return;
    }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.some((m) => m && m.userData.s2WorldUv)) {
      const before = o.geometry;
      if (!remap.has(before)) {
        const after = worldUv(before);
        remap.set(before, after);
        remap.set(after, after);
        if (after !== before) {
          before.dispose();
        }
      }
      o.geometry = remap.get(before);
    }
    for (const m of mats) {
      lit(m);
    }
  });
}
