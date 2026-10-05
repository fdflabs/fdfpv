/*
 * thermal.js: every surface's apparent temperature, for the sensor's
 * thermal modes (docs/AVIONICS-SENSORS.md, docs/AVIONICS-HUD.md section 5).
 *
 * WHAT A LONG WAVE CAMERA SEES. An uncooled microbolometer (8 to 14 um,
 * a FLIR Boson or Tau class core) sees the radiance each surface sends
 * it: the surface's own temperature times its emissivity, plus what it
 * reflects of its surroundings, mostly the cold clear sky. Nothing it
 * sees is the visible picture: a white roof and a black road side by side
 * in the sun differ by twenty degrees, a lake is cooler than the land by
 * day and warmer by night, a polished pylon shows the cold sky, glass
 * and water are opaque (a window shows the sky it reflects, never the
 * room behind it; a lake shows its skin, never its bed), and a drone's
 * motors are points of light whatever their paint. So the thermal
 * picture is the scene drawn again with every material writing a
 * temperature instead of a colour, from a physical model:
 *
 *   what it is    its kind (KIND below, a define on the material) and
 *                 the row of SURFACE that kind reads: how much the sun
 *                 heats it, how it cools at night, its emissivity; a
 *                 material that declares nothing is a built surface,
 *                 concrete or asphalt or a roof;
 *   the sun on it the direct light it receives this frame, shadows and
 *                 the angle included, read back from three's own light
 *                 loop (lights_fragment_end) over the sun's irradiance, so
 *                 a wall in the dam's shadow is cool and its sunlit face
 *                 warm without a line of geometry here, and the sun's
 *                 strength through the air at its elevation;
 *   its albedo    its solar absorptance: what it does not reflect of the
 *                 sun it absorbs. Visible reflectance stands for it (about
 *                 half the sun's energy is visible light), so white road
 *                 paint reads cooler in the sun than the asphalt round it,
 *                 as it does in a real camera; by night it plays no part;
 *   the climate   the map's (scene.userData.climate, CLIMATE below): the
 *                 air and the water by day and by night, and the clear
 *                 sky's own temperature; the time of day is the map's
 *                 scene.userData.timeOfDay and its sun's elevation, read
 *                 every thermal frame so a map whose sun moves (the
 *                 Interior's) cools into its night;
 *   the night     with the sun gone, surfaces that face the sky radiate
 *                 to it and fall below the air; walls and rock that
 *                 stored the day stay over it; the water, which stores
 *                 the most, is the warmest thing in the landscape;
 *   emissivity    each kind's own, metal by its metalness, water and
 *                 glass falling off at a grazing look: the rest of the
 *                 radiance is reflected, the sky above the horizon and
 *                 the air below it;
 *   the air       a long path through it pulls everything toward the
 *                 path's own temperature.
 *
 * Fires, engines and people are hot by what they are: the fire kind, the
 * body kind (a person or an animal: the skin's temperature through the
 * clothes, by a per vertex coupling), an emissive material heated by its
 * own emission (the night's lamps, look/night.js), an unlit material
 * brighter than white a light source, and a per vertex heat on the war's
 * engines and motors (render/attackers.js, render/strikercraft.js).
 *
 * HOW. ShaderChunk patches at import, the way celmat.js patches the toon
 * ramp, so every built in material made anywhere, now or later, carries
 * the thermal output behind one uniform test and no program changes when
 * the mode does. The uniforms are Float32Arrays shared by reference:
 * three clones a built in material's uniforms per program, but passes an
 * array value through by reference (UniformsUtils.cloneUniforms), so
 * writing THERMAL.env here reaches every program on its next draw. A
 * ShaderMaterial is outside ShaderLib and says what it is through
 * thermalShader() below; the sensor check fails on any drawn
 * ShaderMaterial that has not. A material that cannot show in a thermal
 * picture at all (the pass under a lake that tints its bed) is left out
 * of the thermal draw by thermalHide().
 *
 * The output is the temperature in hundreds of degrees Celsius in red
 * (half float targets hold it, and a fire's square still fits), so the
 * sensor's gain stage can take a mean and a spread from mipmaps.
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

/* Degrees Celsius per unit written: 0.31 is 31 C. */
export const T_SCALE = 100;

/* The kinds a material can declare (its THERMAL_KIND define). BUILT is
 * what a material that declares nothing is; WARM a lit window's pane.
 * The newer kinds are numbered from 16 so the checks' labels (LABEL
 * below) never take a blend of two common kinds for one of them. */
export const KIND = {
  built: 0,
  vegetation: 1,
  water: 2,
  hot: 4,
  ground: 7,
  motor: 8,
  warm: 9,
  body: 16,
  fire: 17,
  glass: 18,
  rock: 19,
  spray: 20,
};

/*
 * THE CLIMATES, degrees C. Air and water by day (the hour the map is
 * drawn at) and by night; skyDrop how far the clear sky's radiometric
 * temperature at the zenith is under the air, and skyTau the clear air's
 * transmittance through the 8 to 14 um window straight up. A radiation
 * thermometer pointed at a clear zenith reads 30 to 50 K under the air,
 * less the more water vapour there is (Berdahl and Martin 1984; Idso
 * 1981, the window's emissivity rising with vapour pressure); along a
 * slant the path is longer, the window shuts, and the sky warms toward
 * the air at the horizon (the path length law in thSky below).
 *
 *   itaipu    Alto Parana in December, humid subtropical summer: Foz do
 *             Iguacu's December normals (INMET, about 32 C by day, 21 C
 *             at night); the reservoir's surface 27 to 29 C through the
 *             summer (Itaipu's limnology); humid air, a warm sky.
 *   alpine    swiss2's valley at midday in summer: a valley floor near
 *             600 m, 22 C by day and 11 C at night; a glacial lake's
 *             surface 15 to 18 C; dry, thin air, the coldest sky.
 *   interior  the Interior's lowland in the afternoon: hot and dry, 34 C
 *             by day and 23 C at night; its shallow pools warm, 29 C by
 *             day, 27 C by night.
 *
 * A map names its climate on its scene (scene.userData.climate); one that
 * names none is drawn in Itaipu's, which is what every map had before.
 */
export const CLIMATE = {
  itaipu: {
    day: { air: 31, water: 27, skyDrop: 36 },
    night: { air: 22, water: 27, skyDrop: 36 },
    skyTau: 0.5,
  },
  alpine: {
    day: { air: 22, water: 17, skyDrop: 46 },
    night: { air: 11, water: 17, skyDrop: 44 },
    skyTau: 0.75,
  },
  interior: {
    day: { air: 34, water: 29, skyDrop: 40 },
    night: { air: 23, water: 27, skyDrop: 40 },
    skyTau: 0.62,
  },
};

/*
 * THE SURFACES, by the kind that reads each row. solar: degrees over the
 * air a black surface reaches square to a full sun (the sun's 1000 W/m2
 * against the surface's convective and radiative loss, 15 to 35 W/m2/K:
 * sunlit asphalt 20 to 30 K over the air, dry soil and rock 20 to 25,
 * a grass field 10 to 15, a leaf canopy 2 to 8 since transpiration
 * carries the heat away; Oke, Boundary Layer Climates, chapter 4).
 * night: degrees over the night air of a surface standing sideways (walls
 * and rock that stored the day are over it, grass and leaves a little
 * under); cool: how much further a surface facing the open sky falls by
 * radiating to it (a clear night's grass 4 to 6 K under the air). e: the
 * emissivity in the 8 to 14 um band (concrete and asphalt 0.92 to 0.95,
 * leaves 0.97 to 0.99, soil 0.92 to 0.96, glass 0.84 to 0.92, skin
 * 0.98; Salisbury and D'Aria 1992, the ASTER spectral library).
 *
 * The ground kind blends four rows by the land cover its material hands
 * over (look/ground.js's forest, field, soil, town). body is a person or
 * an animal: skin at SKIN_C, seen through clothes or hide with a coupling
 * per vertex (0 the air's, 1 bare skin), a clothed body 30 to 34 C at
 * the surface. fire: a camp fire's embers and flames, 500 to 900 C;
 * the camera's gain saturates far below either.
 */
export const SURFACE = {
  built: { solar: 30, night: 3, cool: 6, e: 0.93 },
  vegetation: { solar: 7, night: -1.5, cool: 2.5, e: 0.98 },
  forest: { solar: 7, night: -1, cool: 1.5, e: 0.98 },
  field: { solar: 15, night: -2, cool: 4, e: 0.97 },
  soil: { solar: 26, night: -1, cool: 4, e: 0.94 },
  town: { solar: 30, night: 3, cool: 5, e: 0.93 },
  rock: { solar: 24, night: 2, cool: 4, e: 0.94 },
  glass: { solar: 8, night: 1, cool: 4, e: 0.86 },
  hot: { solar: 12, night: -1, cool: 3, e: 0.9 },
  body: { solar: 5, night: 0, cool: 1.5, e: 0.98 },
  water: { e: 0.98 },
};
export const SKIN_C = 34;
export const FIRE_C = 600;
/* A lit window's pane at night: glass over a heated room, a few degrees
 * over the night air (the room's lamp does not show through it). */
const WARM_PANE_K = 6;
/* Spray and a wet film under the water's own temperature: evaporation. */
const SPRAY_COOL_K = 1;

/* Clear air's extinction length in the long wave band, metres: at two
 * kilometres a fifth of what reaches the lens is the path's own. */
const PATH_M = 9000;
/* The path's own temperature under the air at the ground: a slant path
 * of a few hundred metres averages air a few degrees cooler by the lapse
 * rate (6.5 K/km). */
const PATH_LAPSE_K = 4;

/*
 * The shared uniform values. env: x on (1 while a thermal frame draws), y
 * the air, z how much day (1 full day, 0 night: the sun's loading and
 * the night's cooling are weighed by it), w the sky at the zenith, all in
 * T_SCALE units but x and z. env2: x the water, y the sun's irradiance in
 * the scene's units (what its DirectionalLight carries, times its colour's
 * luminance), z the clear sky's window transmittance at the zenith, w the
 * path length. view: xyz the world's up in view space (per camera, set as
 * each thermal frame draws), w the own craft's motor heat 0..1.
 */
export const THERMAL = {
  env: new Float32Array([0, 0.31, 1, -0.05]),
  env2: new Float32Array([0.27, 1, 0.5, PATH_M]),
  view: new Float32Array([0, 1, 0, 0]),
};

const f = (x) => x.toFixed(4);
/* thPassive's arguments from a SURFACE row: gain, rest, cool. */
const passive = (row) => `${f(row.solar)}, ${f(row.night)}, ${f(row.cool)}`;

/* Every apparent temperature a material can arrive at, in T_SCALE units.
 * Shared by the built in output below and thermalShader's. */
const PARS = /* glsl */ `
#define TH_PARS
uniform vec4 thEnv;
uniform vec4 thEnv2;
uniform vec4 thView;
float thSun = -1.0;
float thDist = 0.0;
vec3 thN = vec3(0.0, 0.0, 1.0);
vec3 thV = vec3(0.0, 0.0, 1.0);
bool thDone = false;
#ifdef THERMAL_ATTR
  varying float vThermal;
#endif
float thLum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
/* The clear sky along a direction whose up component (the sine of its
 * elevation) is e: the window's transmittance along the slant is the
 * zenith's to the power of the air mass, and what the window does not
 * pass the air itself emits, at the air's temperature. At the zenith
 * thEnv.w; at the horizon and under it, the air. */
float thSky(float e) {
  float tz = thEnv2.z;
  float t = pow(tz, 1.0 / max(e, 0.02));
  return thEnv.y - (thEnv.y - thEnv.w) * t / tz;
}
/* A passive surface: the air, plus the sun it absorbs (gain degrees at
 * full sun on black), plus what the night does to it (rest when it faces
 * sideways, rest - cool when it faces the sky). */
float thPassive(float alb, float sun, float up, float gain, float rest, float cool) {
  float day = thEnv.z;
  float solar = gain * (1.0 - clamp(alb, 0.0, 1.0)) * clamp(sun, 0.0, 1.2) * day;
  float night = (rest - cool * max(up, 0.0)) * (1.0 - day);
  return thEnv.y + (solar + night) * 0.01;
}
/* Emissivity e: e of the surface's own radiance, the rest what it
 * reflects, the sky above the horizon or the air below it. */
float thReflect(float T, float e, vec3 n, vec3 v, vec3 up) {
  vec3 r = reflect(-v, n);
  float ru = dot(r, up);
  float env = ru > 0.0 ? thSky(ru) : thEnv.y;
  return T * e + env * (1.0 - e);
}
/* A smooth dielectric's emissivity, e0 looking straight at it, falling
 * to nothing at a grazing look as its reflectance rises (Schlick). */
float thGraze(float e0, vec3 n, vec3 v) {
  return e0 * (1.0 - pow(1.0 - abs(dot(n, v)), 5.0));
}
/* Air between the lens and the surface. */
float thPath(float T, float d) {
  float k = 1.0 - exp(-d / max(thEnv2.w, 1.0));
  return mix(T, thEnv.y - ${f(PATH_LAPSE_K / T_SCALE)}, k);
}
`;

/* After three's light loop: the direct light this fragment received over
 * the sun's irradiance (shadow and N.L included), and the geometry. */
const LIGHTS_END = /* glsl */ `
#ifdef TH_PARS
{
  float thD = thLum(material.diffuseColor);
  float thE = thLum(reflectedLight.directDiffuse);
  thSun = thD > 0.015 ? thE / (thD * RECIPROCAL_PI * max(thEnv2.y, 1e-3)) : -1.0;
  thDist = length(geometryPosition);
  thN = geometryNormal;
  thV = geometryViewDir;
}
#endif
`;

const S = SURFACE;
/* The output, at the end of every built in fragment shader: after
 * premultiplied_alpha_fragment, which every one has but a material that
 * splices it out (swiss2/vehicles' glass), and after dithering_fragment,
 * which every one has but points. Whichever comes first writes it. */
const OUTPUT = /* glsl */ `
#ifdef TH_PARS
if (thEnv.x > 0.5 && !thDone) {
  thDone = true;
  #ifndef THERMAL_KIND
    #define THERMAL_KIND 0
  #endif
  float thAlb = thLum(diffuseColor.rgb);
  float thUp = dot(thN, thView.xyz);
  /* A material with no light loop (basic, points) never sets thSun: half
   * a sun, a guess no worse than any. */
  float thS = thSun >= 0.0 ? thSun : 0.5;
  float thT = thEnv.y;
  float thEm = ${f(S.built.e)};
  /* Glass and water are opaque in the long wave band, whatever their
   * visible alpha: the camera sees their surface and nothing behind it. */
  float thAlpha = gl_FragColor.a;
  #if THERMAL_KIND == ${KIND.vegetation}
    thT = thPassive(thAlb, thS, thUp, ${passive(S.vegetation)});
    thEm = ${f(S.vegetation.e)};
  #elif THERMAL_KIND == ${KIND.water}
    thT = thEnv2.x;
    thEm = thGraze(${f(S.water.e)}, thN, thV);
    thAlpha = 1.0;
  #elif THERMAL_KIND == ${KIND.hot}
    thT = thPassive(thAlb, thS, thUp, ${passive(S.hot)});
    thEm = ${f(S.hot.e)};
    #ifdef THERMAL_ATTR
      thT += vThermal * 1.1;
    #endif
  #elif THERMAL_KIND == ${KIND.ground}
    {
      /* The ground's own land cover (forest, field, bare soil and rock,
       * town) and its wet margins, from its material: Itaipu's
       * look/ground.js names them itThCover and itThWet, a material that
       * has them otherwise defines THERMAL_COVER and THERMAL_WET. */
      #ifndef THERMAL_COVER
        #define THERMAL_COVER itThCover
        #define THERMAL_WET itThWet
      #endif
      vec4 thC = THERMAL_COVER;
      float forest = thPassive(thAlb, thS, thUp, ${passive(S.forest)});
      float field = thPassive(thAlb, thS, thUp, ${passive(S.field)});
      float soil = thPassive(thAlb, thS, thUp, ${passive(S.soil)});
      float town = thPassive(thAlb, thS, thUp, ${passive(S.town)});
      float thW = max(dot(thC, vec4(1.0)), 1e-3);
      thT = dot(thC, vec4(forest, field, soil, town)) / thW;
      thEm = dot(thC, vec4(${f(S.forest.e)}, ${f(S.field.e)}, ${f(S.soil.e)}, ${f(S.town.e)})) / thW;
      thT = mix(thT, thEnv2.x, THERMAL_WET);
    }
  #elif THERMAL_KIND == ${KIND.motor}
    thT = thPassive(thAlb, thS, thUp, ${passive(S.hot)}) + thView.w * 0.6;
    thEm = ${f(S.hot.e)};
  #elif THERMAL_KIND == ${KIND.warm}
    thT = thEnv.y + ${f(WARM_PANE_K / T_SCALE)};
    thEm = thGraze(${f(S.glass.e)}, thN, thV);
    thAlpha = 1.0;
  #elif THERMAL_KIND == ${KIND.body}
    {
      /* Skin through clothes or hide: the coupling (the thermal
       * attribute) of the skin's temperature over the air, and a little
       * sun on the cloth. */
      float thK = 0.65;
      #ifdef THERMAL_ATTR
        thK = vThermal;
      #endif
      thT = mix(thEnv.y, ${f(SKIN_C / T_SCALE)}, thK) + thPassive(thAlb, thS, thUp, ${passive(S.body)}) - thEnv.y;
      thEm = ${f(S.body.e)};
    }
  #elif THERMAL_KIND == ${KIND.fire}
    thT = ${f(FIRE_C / T_SCALE)};
    thEm = 1.0;
  #elif THERMAL_KIND == ${KIND.glass}
    thT = thPassive(thAlb, thS, thUp, ${passive(S.glass)});
    thEm = thGraze(${f(S.glass.e)}, thN, thV);
    thAlpha = 1.0;
  #elif THERMAL_KIND == ${KIND.rock}
    thT = thPassive(thAlb, thS, thUp, ${passive(S.rock)});
    thEm = ${f(S.rock.e)};
  #elif THERMAL_KIND == ${KIND.spray}
    /* Spray, a falling veil, a wet film: water a little under its own
     * temperature as it evaporates, as thin as it looks. */
    thT = thEnv2.x - ${f(SPRAY_COOL_K / T_SCALE)};
    thEm = ${f(S.water.e)};
  #else
    thT = thPassive(thAlb, thS, thUp, ${passive(S.built)});
  #endif
  #if THERMAL_KIND == ${KIND.warm} || THERMAL_KIND == ${KIND.fire}
  #elif defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG ) || defined( TOON )
    thT += min(thLum(totalEmissiveRadiance) * 0.2, 1.5);
  #else
    /* Unlit and brighter than white is a light source: a lamp's head, a
     * fixture's glow. */
    thT += min(max(thAlb - 1.0, 0.0) * 0.25, 1.5);
  #endif
  #ifdef STANDARD
    thEm *= 1.0 - 0.85 * metalnessFactor;
  #endif
  thT = thReflect(thT, thEm, thN, thV, thView.xyz);
  thT = thPath(thT, thDist);
  gl_FragColor = vec4(thT, 1.0, float(THERMAL_KIND), thAlpha);
  #ifdef PREMULTIPLIED_ALPHA
    gl_FragColor.rgb *= gl_FragColor.a;
  #endif
}
#endif
`;

/* A heat attribute (0..1 of THERMAL_ATTR's 110 degrees, or the body's
 * coupling) carried from the vertex to the fragment for a material that
 * declares one: its declaration, and its copy inside main. One literal,
 * split, so the copy line is read as the GLSL it is
 * (scripts/copy-lint.js). */
const [ATTR_PARS_VERTEX, ATTR_VERTEX] = /* glsl */ `
#ifdef THERMAL_ATTR
  attribute float thermal;
  varying float vThermal;
#endif
@@
#ifdef THERMAL_ATTR
  vThermal = thermal;
#endif
`.split('@@');

function patchChunk(name, add, where = 'after') {
  const before = THREE.ShaderChunk[name];
  if (typeof before !== 'string') {
    throw new Error(`thermal: three has no ${name} chunk; the thermal picture would silently be the visible one`);
  }
  THREE.ShaderChunk[name] = where === 'after' ? `${before}\n${add}` : `${add}\n${before}`;
}

/*
 * The chunk patches and the shared uniforms, once, at import. Every
 * built in fragment shader includes color_pars_fragment before main and
 * the output chunks at its end; every built in vertex shader includes
 * color_pars_vertex and color_vertex. A shader that has an output chunk
 * without the pars chunk (a sprite) is left alone by the TH_PARS guard.
 * Light spliced in after dithering_fragment (celmat.js's rim, finish.js's
 * paint) checks thEnv itself.
 */
patchChunk('color_pars_fragment', PARS);
patchChunk('lights_fragment_end', LIGHTS_END);
patchChunk('premultiplied_alpha_fragment', OUTPUT);
patchChunk('dithering_fragment', OUTPUT);
patchChunk('color_pars_vertex', ATTR_PARS_VERTEX);
patchChunk('color_vertex', ATTR_VERTEX);
for (const lib of Object.values(THREE.ShaderLib)) {
  lib.uniforms.thEnv = { value: THERMAL.env };
  lib.uniforms.thEnv2 = { value: THERMAL.env2 };
  lib.uniforms.thView = { value: THERMAL.view };
}

/*
 * Declare a built in material's kind (a key of KIND). Before its first
 * draw: the define is part of its program. `attr` says its geometry
 * carries a `thermal` attribute: a heat for 'hot', a coupling for 'body'.
 * `defines` adds the kind's own (the ground's THERMAL_COVER and
 * THERMAL_WET).
 */
export function thermalKind(material, kind, { attr = false, defines = null } = {}) {
  if (!(kind in KIND)) {
    throw new Error(`thermal: no kind ${kind}`);
  }
  material.defines = { ...(material.defines || {}), ...(defines || {}), THERMAL_KIND: KIND[kind] };
  if (attr) {
    material.defines.THERMAL_ATTR = '';
  }
  material.userData.thermal = kind;
  material.needsUpdate = true;
  return material;
}

/*
 * A material the thermal picture cannot see at all, left out of every
 * thermal draw: the pass under a lake that tints its bed by the water's
 * visible transmittance (swiss2/water/surface.js bedMaterial). Water is
 * opaque in the long wave band, so the bed is never in the picture, and
 * the thermal draw is the cheaper by its pass.
 */
const hidden = new Set();
export function thermalHide(material) {
  hidden.add(material);
  material.addEventListener('dispose', () => hidden.delete(material));
  material.userData.thermal = 'hidden';
  return material;
}
const wasVisible = [];

/*
 * What drew each pixel of a thermal frame, in its blue channel over its
 * green (both scaled alike by a premultiplied alpha), for the checks
 * (scripts/thermal-physics-check.js): a built in material its KIND, a
 * ShaderMaterial the label its name was given here, the clear sky
 * LABEL.sky. Nothing in the picture reads either channel.
 */
export const LABEL = { sky: -1, shader0: 32 };
const SHADER_LABEL = new Map();
export function thermalLabels() {
  return { kinds: { ...KIND }, shaders: Object.fromEntries(SHADER_LABEL), sky: LABEL.sky };
}

/*
 * A ShaderMaterial's thermal output. `glsl` runs at the end of its main,
 * in the scope of its varyings and locals and PARS's thSky, thPassive and
 * thEnv, and declares `float thT`, the temperature in T_SCALE units, and
 * optionally `float thA`, a factor on the alpha it already wrote: smoke
 * and spray are thin in the long wave band, so a thermal camera sees
 * through most of what hides a target from a visible one. `name` is what
 * it is, for the check's list.
 */
export function thermalShader(material, glsl, name) {
  if (!SHADER_LABEL.has(name)) {
    SHADER_LABEL.set(name, LABEL.shader0 + SHADER_LABEL.size);
  }
  if (!/\bfloat thT\b/.test(glsl)) {
    throw new Error(`thermal: ${name}'s thermal output declares no thT`);
  }
  const alpha = /\bfloat thA\b/.test(glsl) ? 'thA' : '1.0';
  /* An additive material adds its heat and leaves the label under it. */
  const additive = material.blending === THREE.AdditiveBlending
    || (material.blending === THREE.CustomBlending && material.blendDst === THREE.OneFactor);
  const label = additive ? '0.0, 0.0' : `1.0, ${SHADER_LABEL.get(name).toFixed(1)}`;
  const fs = material.fragmentShader;
  const end = fs.lastIndexOf('}');
  if (end < 0 || fs.includes('TH_PARS')) {
    throw new Error(`thermal: ${name}'s fragment shader has no main to end, or is patched twice`);
  }
  material.fragmentShader = `${PARS}\n${fs.slice(0, end)}
  if (thEnv.x > 0.5) {
    ${glsl}
    gl_FragColor = vec4(thT, ${label}, gl_FragColor.a * ${alpha});
  }
${fs.slice(end)}`;
  material.uniforms.thEnv = { value: THERMAL.env };
  material.uniforms.thEnv2 = { value: THERMAL.env2 };
  material.uniforms.thView = { value: THERMAL.view };
  material.userData.thermal = name;
  material.needsUpdate = true;
  return material;
}

/*
 * The climate's values into the shared uniforms: `day` 0 (night) to 1
 * (full day), `sun` the irradiance the scene's sun carries.
 */
function applyWeather(climate, day, sun) {
  const c = CLIMATE[climate] || CLIMATE.itaipu;
  const mix = (a, b) => a + (b - a) * day;
  const air = mix(c.night.air, c.day.air);
  THERMAL.env[1] = air / T_SCALE;
  THERMAL.env[2] = day;
  THERMAL.env[3] = (air - mix(c.night.skyDrop, c.day.skyDrop)) / T_SCALE;
  THERMAL.env2[0] = mix(c.night.water, c.day.water) / T_SCALE;
  THERMAL.env2[1] = Math.max(sun, 1e-3);
  THERMAL.env2[2] = c.skyTau;
}

/* The weather for a time of day, into the shared uniforms, in the default
 * climate. `sun` is the irradiance its DirectionalLight carries. The
 * SensorManager calls it when the scene changes; every thermal frame
 * reads its own scene's climate and sun again (renderThermal). */
export function setWeather(timeOfDay, sun) {
  applyWeather('itaipu', timeOfDay === 'night' ? 0 : 1, sun);
  return CLIMATE.itaipu[timeOfDay === 'night' ? 'night' : 'day'];
}

/* The scene's sun: the shadow casting DirectionalLight, found once. */
const sunOf = new WeakMap();
function sceneSun(scene) {
  let light = sunOf.get(scene);
  if (light === undefined || (light && !light.parent)) {
    light = null;
    scene.traverse((o) => {
      if (o.isDirectionalLight && o.castShadow) {
        light = o;
      }
    });
    sunOf.set(scene, light);
  }
  return light;
}
const sunDir = new THREE.Vector3();
const sunAt = new THREE.Vector3();

/*
 * The frame's weather from its scene: the climate it names, night if it
 * says so, else how high its sun stands. The sun term is the light this
 * frame's surfaces receive over what the light carries now, so it holds
 * the angle and the shadow, and over that the beam's strength through the
 * air at the sun's elevation (the direct beam's transmittance at its air
 * mass, Meinel's 0.7^(AM^0.678), over its value overhead). The day's
 * warmth gives way to the night's cooling as the sun goes down.
 */
function sceneWeather(scene) {
  const light = sceneSun(scene);
  let day = scene.userData.timeOfDay === 'night' ? 0 : 1;
  let sun = 1;
  if (light) {
    sun = light.intensity * (0.2126 * light.color.r + 0.7152 * light.color.g + 0.0722 * light.color.b);
    light.getWorldPosition(sunAt);
    light.target.getWorldPosition(sunDir);
    const el = sunAt.sub(sunDir).normalize().y;
    if (day > 0) {
      day = THREE.MathUtils.smoothstep(el, -0.05, 0.15);
      const beam = el > 0 ? (0.7 ** ((1 / Math.max(el, 0.03)) ** 0.678)) / 0.7 : 0;
      sun /= Math.max(beam, 1e-3);
    }
  }
  applyWeather(scene.userData.climate, day, sun);
}

const upView = new THREE.Vector3();

/*
 * Draw `scene` from `camera` as temperatures into `target`. The clear is
 * the cold sky at the zenith, for whatever no sky dome covers. The
 * thermal output is on only for this one render call, and the hidden
 * materials (thermalHide) are off for it.
 */
export function renderThermal(renderer, scene, camera, target) {
  sceneWeather(scene);
  upView.set(0, 1, 0).transformDirection(camera.matrixWorldInverse);
  THERMAL.view[0] = upView.x;
  THERMAL.view[1] = upView.y;
  THERMAL.view[2] = upView.z;
  const bg = scene.background;
  const fog = scene.fog;
  scene.background = null;
  scene.fog = null;
  const prevAlpha = renderer.getClearAlpha();
  renderer.getClearColor(prevClear);
  renderer.setClearColor(skyClear.setRGB(THERMAL.env[3], 1, LABEL.sky, THREE.LinearSRGBColorSpace), 1);
  THERMAL.env[0] = 1;
  wasVisible.length = 0;
  for (const m of hidden) {
    wasVisible.push(m.visible);
    m.visible = false;
  }
  try {
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, camera);
  } finally {
    let k = 0;
    for (const m of hidden) {
      m.visible = wasVisible[k];
      k += 1;
    }
    THERMAL.env[0] = 0;
    renderer.setClearColor(prevClear, prevAlpha);
    scene.background = bg;
    scene.fog = fog;
  }
}
const prevClear = new THREE.Color();
const skyClear = new THREE.Color();

/*
 * A motor's heat from its temperature (docs/AVIONICS-HUD.md section 4.1:
 * FlightTelemetry's first order model), for the own craft's MOTOR kind:
 * 0 at the air's, 1 a hundred degrees over it.
 */
export function setMotorHeat(tempC) {
  const air = THERMAL.env[1] * T_SCALE;
  THERMAL.view[3] = Math.min(1, Math.max(0, (tempC - air) / 100));
}
