/*
 * thermal.js: every surface's apparent temperature, for the sensor's
 * thermal modes (docs/AVIONICS-SENSORS.md, docs/AVIONICS-HUD.md section 5).
 *
 * NOT A PALETTE. A thermal camera sees how warm a surface is and how well
 * it radiates, which has little to do with its colour in daylight: a white
 * roof and a black road side by side in the sun differ by twenty degrees,
 * a lake is cooler than the land by day and warmer by night, a polished
 * pylon shows the cold sky it reflects, and a drone's engine is a point of
 * light against all of it whatever its paint. So the thermal picture is the
 * scene drawn again with every material writing a temperature instead of a
 * colour, from the things the material already knows:
 *
 *   what it is    its kind (THERMAL_KIND below, a define on the material:
 *                 vegetation, water, ground by its land cover, a hot part,
 *                 a motor); a material that declares nothing is a built
 *                 surface, concrete or asphalt or a roof;
 *   the sun on it the direct light it receives this frame, shadows
 *                 included, read back from three's own light loop
 *                 (lights_fragment_end) and divided by the sun's
 *                 irradiance, so a wall in the dam's shadow is cool and
 *                 its sunlit face warm without a line of geometry here;
 *   its albedo    what it does not reflect it absorbs: the satellite's
 *                 colour under the ground is a measured reflectance
 *                 (look/ground.js), so a dark field is warmer than a pale
 *                 one for the same sun;
 *   the time      day or night (the map's scene.userData.timeOfDay): by
 *                 night the sun term is gone and surfaces that face the
 *                 sky have cooled below the air, the water and the walls
 *                 that stored the day have not;
 *   its emissivity metal (the material's metalness) and water at a
 *                 grazing look radiate poorly and reflect their
 *                 surroundings, which is mostly the cold sky;
 *   the air       a long path through it pulls everything toward the
 *                 air's own temperature.
 *
 * Fires, engines and lamps are hot by what they are: an emissive material
 * is heated by its own emission (the night's lamps and windows,
 * look/night.js), an unlit material brighter than white is a light
 * source, and the war's attackers carry a per vertex heat
 * (render/attackers.js) on their engines and motors.
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
 * ShaderMaterial that has not.
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
 * what a material that declares nothing is; WARM a lit window's pane. */
export const KIND = {
  built: 0,
  vegetation: 1,
  water: 2,
  hot: 4,
  ground: 7,
  motor: 8,
  warm: 9,
};

/*
 * The weather the model runs in: Itaipu in December (the satellite's pass,
 * look/light.js), a humid subtropical summer. Air 31 C at mid morning,
 * 22 C at night; the reservoir 27 C both, which is what makes it cool
 * against the land by day and warm against it by night. The clear sky's
 * own temperature at the zenith, the coldest thing a thermal camera ever
 * sees, warming to near the air's at the horizon.
 */
export const WEATHER = {
  day: { air: 31, water: 27, skyZenith: -14, sun: 1 },
  night: { air: 22, water: 27, skyZenith: -24, sun: 0 },
};
/* Clear air's extinction length in the long wave band, metres: at two
 * kilometres a fifth of what reaches the lens is the path's own. */
const PATH_M = 9000;

/*
 * The shared uniform values. env: x on (1 while a thermal frame draws), y
 * the air, z how much sun (0 at night), w the sky at the zenith, all in
 * T_SCALE units but x and z. env2: x the water, y the sun's irradiance in
 * the scene's units (what its DirectionalLight carries), z unused, w the
 * path length. view: xyz the world's up in view space (per camera, set as
 * each thermal frame draws), w the own craft's motor heat 0..1.
 */
export const THERMAL = {
  env: new Float32Array([0, 0.31, 1, -0.14]),
  env2: new Float32Array([0.27, 1, 0, PATH_M]),
  view: new Float32Array([0, 1, 0, 0]),
};

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
#ifdef THERMAL_ATTR
  varying float vThermal;
#endif
float thLum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
/* The clear sky along a direction whose up component is e. */
float thSky(float e) {
  return mix(thEnv.y - 0.03, thEnv.w, smoothstep(0.0, 0.5, e));
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
/* Low emissivity: e of the surface's own radiance, the rest what it
 * reflects, the sky above the horizon or the air below it. */
float thReflect(float T, float e, vec3 n, vec3 v, vec3 up) {
  vec3 r = reflect(-v, n);
  float ru = dot(r, up);
  float env = ru > 0.0 ? thSky(ru) : thEnv.y;
  return T * e + env * (1.0 - e);
}
/* Air between the lens and the surface. */
float thPath(float T, float d) {
  float k = 1.0 - exp(-d / max(thEnv2.w, 1.0));
  return mix(T, thEnv.y - 0.04, k);
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

/* The output, last in every built in fragment shader. */
const OUTPUT = /* glsl */ `
#ifdef TH_PARS
if (thEnv.x > 0.5) {
  #ifndef THERMAL_KIND
    #define THERMAL_KIND 0
  #endif
  float thAlb = thLum(diffuseColor.rgb);
  float thUp = dot(thN, thView.xyz);
  /* A material with no light loop (basic, points) never sets thSun: half
   * a sun, a guess no worse than any. */
  float thS = thSun >= 0.0 ? thSun : 0.5;
  float thT = thEnv.y;
  #if THERMAL_KIND == 1
    thT = thPassive(thAlb, thS, thUp, 7.0, -1.5, 2.5);
  #elif THERMAL_KIND == 2
    {
      float thCos = abs(dot(thN, thV));
      float thE = 0.98 - 0.62 * pow(1.0 - thCos, 5.0);
      thT = thReflect(thEnv2.x, thE, thN, thV, thView.xyz);
    }
  #elif THERMAL_KIND == 4
    thT = thPassive(thAlb, thS, thUp, 12.0, -1.0, 3.0);
    #ifdef THERMAL_ATTR
      thT += vThermal * 1.1;
    #endif
  #elif THERMAL_KIND == 7
    {
      /* itThCover is the ground's own land cover (look/ground.js):
       * forest, field, bare soil, town; itThWet its wet margins and the
       * beds under the water. */
      float forest = thPassive(thAlb, thS, thUp, 7.0, -1.0, 1.5);
      float field = thPassive(thAlb, thS, thUp, 15.0, -2.0, 4.0);
      float soil = thPassive(thAlb, thS, thUp, 26.0, -1.0, 4.0);
      float town = thPassive(thAlb, thS, thUp, 30.0, 3.0, 5.0);
      thT = dot(itThCover, vec4(forest, field, soil, town)) / max(dot(itThCover, vec4(1.0)), 1e-3);
      thT = mix(thT, thEnv2.x, itThWet);
    }
  #elif THERMAL_KIND == 8
    thT = thPassive(thAlb, thS, thUp, 12.0, -1.0, 3.0) + thView.w * 0.6;
  #elif THERMAL_KIND == 9
    /* A lit window: glass is opaque in the long wave band, so what shows
     * is the pane, a few degrees over the night air, not the lamp behind. */
    thT = thEnv.y + 0.06;
  #else
    thT = thPassive(thAlb, thS, thUp, 30.0, 3.0, 6.0);
  #endif
  #if THERMAL_KIND == 9
  #elif defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG ) || defined( TOON )
    thT += min(thLum(totalEmissiveRadiance) * 0.2, 1.5);
  #else
    /* Unlit and brighter than white is a light source: a lamp's head, a
     * window, a navigation light. */
    thT += min(max(thAlb - 1.0, 0.0) * 0.25, 1.5);
  #endif
  #ifdef STANDARD
    thT = thReflect(thT, 1.0 - 0.85 * metalnessFactor, thN, thV, thView.xyz);
  #endif
  thT = thPath(thT, thDist);
  gl_FragColor = vec4(thT, 1.0, 0.0, gl_FragColor.a);
}
#endif
`;

/* A heat attribute (0..1 of THERMAL_ATTR's 110 degrees) carried from the
 * vertex to the fragment for a material that declares one: its
 * declaration, and its copy inside main. One literal, split, so the
 * copy line is read as the GLSL it is (scripts/copy-lint.js). */
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
 * premultiplied_alpha_fragment last but one; every built in vertex shader
 * includes color_pars_vertex and color_vertex. A shader that has the
 * output chunk without the pars chunk (a sprite) is left alone by the
 * TH_PARS guard.
 */
patchChunk('color_pars_fragment', PARS);
patchChunk('lights_fragment_end', LIGHTS_END);
patchChunk('premultiplied_alpha_fragment', OUTPUT);
patchChunk('color_pars_vertex', ATTR_PARS_VERTEX);
patchChunk('color_vertex', ATTR_VERTEX);
for (const lib of Object.values(THREE.ShaderLib)) {
  lib.uniforms.thEnv = { value: THERMAL.env };
  lib.uniforms.thEnv2 = { value: THERMAL.env2 };
  lib.uniforms.thView = { value: THERMAL.view };
}

/*
 * Declare a built in material's kind ('vegetation', 'water', 'ground',
 * 'hot', 'motor'). Before its first draw: the define is part of its
 * program. `attr` says its geometry carries a `thermal` attribute.
 */
export function thermalKind(material, kind, { attr = false } = {}) {
  if (!(kind in KIND)) {
    throw new Error(`thermal: no kind ${kind}`);
  }
  material.defines = { ...(material.defines || {}), THERMAL_KIND: KIND[kind] };
  if (attr) {
    material.defines.THERMAL_ATTR = '';
  }
  material.userData.thermal = kind;
  material.needsUpdate = true;
  return material;
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
  if (!/\bfloat thT\b/.test(glsl)) {
    throw new Error(`thermal: ${name}'s thermal output declares no thT`);
  }
  const alpha = /\bfloat thA\b/.test(glsl) ? 'thA' : '1.0';
  const fs = material.fragmentShader;
  const end = fs.lastIndexOf('}');
  if (end < 0 || fs.includes('TH_PARS')) {
    throw new Error(`thermal: ${name}'s fragment shader has no main to end, or is patched twice`);
  }
  material.fragmentShader = `${PARS}\n${fs.slice(0, end)}
  if (thEnv.x > 0.5) {
    ${glsl}
    gl_FragColor = vec4(thT, 1.0, 0.0, gl_FragColor.a * ${alpha});
  }
${fs.slice(end)}`;
  material.uniforms.thEnv = { value: THERMAL.env };
  material.uniforms.thEnv2 = { value: THERMAL.env2 };
  material.uniforms.thView = { value: THERMAL.view };
  material.userData.thermal = name;
  material.needsUpdate = true;
  return material;
}

/* The weather for a map's time of day, into the shared uniforms. `sun` is
 * the irradiance its DirectionalLight carries. */
export function setWeather(timeOfDay, sun) {
  const w = timeOfDay === 'night' ? WEATHER.night : WEATHER.day;
  THERMAL.env[1] = w.air / T_SCALE;
  THERMAL.env[2] = w.sun;
  THERMAL.env[3] = w.skyZenith / T_SCALE;
  THERMAL.env2[0] = w.water / T_SCALE;
  THERMAL.env2[1] = Math.max(sun, 1e-3);
  return w;
}

const upView = new THREE.Vector3();

/*
 * Draw `scene` from `camera` as temperatures into `target`. The clear is
 * the cold sky, for whatever no sky dome covers. The thermal output is on
 * only for this one render call.
 */
export function renderThermal(renderer, scene, camera, target) {
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
  renderer.setClearColor(skyClear.setRGB(THERMAL.env[3], 1, 0, THREE.LinearSRGBColorSpace), 1);
  THERMAL.env[0] = 1;
  try {
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, camera);
  } finally {
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
