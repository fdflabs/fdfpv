/*
 * surface.js: the material every sheet of swiss2's water is drawn with.
 *
 * three's standard material, so the pipeline's sun, sky light, shadows,
 * fog and tone mapping reach the water as they reach the land, with the
 * water's physics spliced in:
 *
 *   Normals from the wave texture: on still water three scales of ripple
 *   drifting downwind, laid in long streaks along the wind and gusty
 *   patches with glassy calm between them, the rough water a pale sheen
 *   of sky and the calm a sharp mirror, which is what makes a real lake
 *   read as a lake from the air;
 *   on running water the ripples stream along the flow, faster where the
 *   bed is steeper.
 *
 *   Fresnel at water's own index: a fiftieth of the light reflected
 *   looking straight down, all of it at a grazing angle, off the sky's
 *   image based light, or off a planar mirror image of the valley when
 *   the lake is given one, bent by the ripples.
 *
 *   Depth: the water is as opaque as there is water along the ray
 *   through it, from nothing at the shore to its body colour in a few
 *   metres, and the bed shows through the shallows, tinted by the water
 *   it is seen through (bedMaterial, drawn under the sheet). Written
 *   premultiplied, reflection over body, so the reflection does not fade
 *   with the water's depth.
 *
 *   Foam: a line of it where the water thins onto the shore, white
 *   water over the rapids and at the foot of the fall, from the wave
 *   texture's height so it breaks up and moves with the water.
 *
 * The geometry carries aWater (depth in metres, distance along the flow
 * in metres, position across -1 to 1, slope of the bed) and, for running
 * water, aFlow (the flow's direction in the ground plane).
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

/* How far light seen at a point on the surface travels through the
 * water, per metre of depth, over what it travels looking straight down:
 * down to the bed along the refracted ray and back up. Seen at a slant
 * the same depth is more water, so a shallow reads clear at your feet
 * and opaque twenty metres out. */
const WATER_PATH = /* glsl */ `
  float waterPath(vec3 at) {
    float cosI = abs(normalize(at - cameraPosition).y);
    float cosR = sqrt(1.0 - (1.0 - cosI * cosI) / 1.7689);
    return 0.5 + 0.5 / max(cosR, 0.25);
  }`;

/*
 * The pass under a sheet of water that takes out of the light from its
 * bed what the water does: red first, so a pale gravel bed a metre down
 * is turquoise and two metres down is teal, and what the surface
 * reflects instead (Fresnel, at water's index), so a shallow seen at a
 * grazing angle is a mirror and not a window. It multiplies what is
 * already drawn under the water, before the sheet goes over it: the sheet
 * alone could only fade the bed toward the body colour, a grey veil,
 * never tint it. `absorb` is per metre of path, linear RGB; `options` are
 * the sheet's own, so the pass is the sheet's material and compiles to
 * the sheet's program (a program of its own added twelve GL warnings,
 * glGetProgramiv, to a run of the fixed views).
 */
export function bedMaterial(options, absorb) {
  const mat = waterMaterial(options);
  mat.userData.water.uAbsorb.value.copy(absorb);
  mat.userData.water.uBedPass.value = 1;
  mat.depthWrite = false;
  mat.blending = THREE.CustomBlending;
  mat.blendEquation = THREE.AddEquation;
  mat.blendSrc = THREE.ZeroFactor;
  mat.blendDst = THREE.SrcColorFactor;
  mat.blendSrcAlpha = THREE.ZeroFactor;
  mat.blendDstAlpha = THREE.OneFactor;
  return mat;
}

/*
 * A water material. `flow` true for running water. `colour` is the
 * body's scattering colour (linear) a few metres down, `shallow` what it
 * is over the bed's first metres and `deep` what it deepens to past
 * eighteen, `clarity` how fast it goes opaque with depth (per metre
 * looking straight down), `ripple` the strength of the normals,
 * `planar` a { texture, matrix } mirror image or null, `foamAt` a point
 * (x, z, radius, strength) that churns white, `time` and `wind` shared
 * uniforms. Returns the material; its uniforms are on userData.water.
 */
export function waterMaterial({
  waves, time, wind, flow = false, colour, shallow = colour, deep = colour, clarity = 0.4, ripple = 1, roughness = 0.04,
  planar = null, foamAt = null, envMap = null, shoreFoam = 1, width = 4,
}) {
  const mat = new THREE.MeshStandardMaterial({
    color: colour,
    roughness,
    metalness: 0,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: !flow,
    envMap,
  });
  const uniforms = {
    uWaves: { value: waves },
    uTime: time,
    uWind: wind,
    uRipple: { value: ripple },
    uClarity: { value: clarity },
    uReflect: { value: planar ? planar.texture : null },
    uReflMatrix: { value: planar ? planar.matrix : new THREE.Matrix4() },
    uFoamAt: { value: foamAt ? new THREE.Vector4(...foamAt) : new THREE.Vector4(0, 0, -1, 0) },
    uShoreFoam: { value: shoreFoam },
    uWidth: { value: width },
    uShallow: { value: shallow.clone().sub(colour) },
    uDeep: { value: deep.clone().sub(colour) },
    uAbsorb: { value: new THREE.Vector3() },
    uBedPass: { value: 0 },
  };
  mat.userData.water = uniforms;
  const defines = `${flow ? '#define WATER_FLOW\n' : ''}${planar ? '#define WATER_PLANAR\n' : ''}`;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `${defines}#include <common>
        attribute vec4 aWater;
        #ifdef WATER_FLOW
          attribute vec2 aFlow;
          varying vec2 vFlow;
        #endif
        uniform mat4 uReflMatrix;
        varying vec4 vWater;
        varying vec3 vWaterWorld;
        varying vec4 vReflCoord;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 waterWorld = modelMatrix * vec4(transformed, 1.0);
        vWaterWorld = waterWorld.xyz;
        vWater = aWater;
        vReflCoord = uReflMatrix * waterWorld;
        #ifdef WATER_FLOW
          vFlow = aFlow;
        #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `${defines}#include <common>
        uniform sampler2D uWaves;
        uniform sampler2D uReflect;
        uniform float uTime;
        uniform vec2 uWind;
        uniform float uRipple;
        uniform float uClarity;
        uniform vec4 uFoamAt;
        uniform float uShoreFoam;
        uniform float uWidth;
        uniform vec3 uShallow;
        uniform vec3 uDeep;
        uniform vec3 uAbsorb;
        uniform float uBedPass;
        varying vec4 vWater;
        varying vec3 vWaterWorld;
        varying vec4 vReflCoord;
        #ifdef WATER_FLOW
          varying vec2 vFlow;
        #endif
        ${WATER_PATH}
        vec2 waveSlope(vec2 uv) {
          vec3 n = texture2D(uWaves, uv).xyz * 2.0 - 1.0;
          return n.xy / max(n.z, 0.2);
        }`)
      .replace('#include <map_fragment>', `
        if (uBedPass > 0.5) {
          float bedCos = abs(normalize(vWaterWorld - cameraPosition).y);
          vec3 bedT = exp(-uAbsorb * max(vWater.x, 0.0) * 2.0 * waterPath(vWaterWorld));
          gl_FragColor = vec4(bedT * (0.98 - 0.98 * pow(1.0 - bedCos, 5.0)), 1.0);
          return;
        }
        /* The water's slope in the ground plane, and its foam. */
        vec2 wSlope;
        float wFoam = 0.0;
        /* How much the ripples too fine to see still rough the water:
         * from far off a windy band is a paler sheen of sky, not a
         * mirror. */
        float wSheen = 0.0;
        #ifdef WATER_FLOW
        {
          vec2 T = normalize(vFlow);
          vec2 S = vec2(-T.y, T.x);
          float speed = 0.9 + 9.0 * vWater.w;
          vec2 q = vec2(vWater.z * uWidth * 0.5, vWater.y);
          vec2 a = waveSlope(vec2(q.x / 2.3, q.y / 3.1 - uTime * speed / 3.1));
          vec2 b = waveSlope(vec2(q.x / 0.9 + 0.37, q.y / 1.3 - uTime * speed * 1.2 / 1.3));
          vec2 local = (a * 0.6 + b * 0.4) * uRipple * (0.5 + 2.0 * min(vWater.w * 4.0, 1.0));
          wSlope = S * local.x + T * local.y;
          float h1 = texture2D(uWaves, vec2(q.x / 1.7, q.y / 2.2 - uTime * speed / 2.2)).a;
          float h2 = texture2D(uWaves, vec2(q.x / 0.7 + 0.5, q.y / 0.9 - uTime * speed * 1.3 / 0.9)).a;
          float rough = smoothstep(0.08, 0.4, vWater.w);
          float bank = smoothstep(0.6, 1.0, abs(vWater.z));
          wFoam = smoothstep(0.62 - 0.2 * rough, 0.8 - 0.1 * rough, h1 * 0.6 + h2 * 0.4) * max(rough, bank * 0.12);
        }
        #else
        {
          vec2 p = vWaterWorld.xz;
          vec2 drift = uWind * uTime;
          /* Wind lies on a lake in streaks along it and in gusts that
           * rough a patch and move on, and between them the water is a
           * mirror. The streaks are the wave height read long downwind
           * and narrow across it. */
          vec2 wd = normalize(uWind + vec2(1e-4, 0.0));
          vec2 wq = vec2(dot(p, wd), dot(p, vec2(-wd.y, wd.x)));
          float streaks = texture2D(uWaves, vec2(wq.x / 3200.0, wq.y / 300.0) - vec2(uTime * 0.0009, 0.0)).a;
          float gusts = texture2D(uWaves, p / 610.0 + drift * 0.0009).a;
          float windy = smoothstep(0.5, 0.72, streaks * 0.6 + gusts * 0.4);
          vec2 s = waveSlope(p / 47.0 + drift * 0.011) * 0.45
            + waveSlope(vec2(p.y, -p.x) / 13.0 + drift * 0.023) * 0.35
            + waveSlope(p / 3.7 - drift * 0.05) * 0.2;
          /* Far water is smoother than near: a pixel there averages many
           * ripples, and the mirror image in it is sharper for it. */
          float far = smoothstep(40.0, 600.0, distance(cameraPosition, vWaterWorld));
          wSlope = s * uRipple * mix(0.05, 1.0, windy) * (1.0 - 0.6 * far);
          wSheen = windy * (0.1 + 0.25 * far);
          float h = texture2D(uWaves, p / 2.9 + drift * 0.03).a;
          float shore = 1.0 - smoothstep(0.02, 0.3, vWater.x);
          wFoam = shore * smoothstep(0.45, 0.8, h) * uShoreFoam;
          if (uFoamAt.z > 0.0) {
            float d = distance(p, uFoamAt.xy) / uFoamAt.z;
            float churn = texture2D(uWaves, p / 1.9 + vec2(0.0, uTime * 0.4)).a;
            float boil = texture2D(uWaves, p / 5.3 - vec2(uTime * 0.13, 0.0)).a;
            wFoam = max(wFoam, uFoamAt.w * (1.0 - smoothstep(0.1, 1.0, d)) * smoothstep(0.35, 0.7, churn * 0.6 + boil * 0.4 + 0.3 * (1.0 - d)));
            wSlope *= 1.0 + 3.0 * (1.0 - smoothstep(0.0, 1.0, d));
          }
        }
        #endif
        /* Glacial water is a cloud of rock flour lit from inside: bright
         * turquoise where a metre or two of it lies over pale gravel that
         * sends the light back up through it, teal over the shelf, and a
         * darker blue green where it is deep. */
        diffuseColor.rgb += uShallow * (1.0 - smoothstep(0.5, 4.0, vWater.x)) + uDeep * smoothstep(4.0, 18.0, vWater.x);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.86, 0.88), wFoam);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.65, wFoam);
        roughnessFactor = mix(roughnessFactor, 0.22, wSheen);`)
      .replace('#include <normal_fragment_begin>', `
        float faceDirection = gl_FrontFacing ? 1.0 : -1.0;
        vec3 waterN = normalize(vec3(-wSlope.x, 1.0, -wSlope.y));
        vec3 normal = normalize((viewMatrix * vec4(waterN, 0.0)).xyz);
        vec3 nonPerturbedNormal = normal;`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        material.specularColor = vec3(0.02);
        material.specularF90 = 1.0;`)
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
        #ifdef WATER_FLOW
        {
          /* A stream runs a metre down between its banks: what it
           * mirrors low toward the horizon is the far bank and its
           * grass, not the sky, and from the air a stream that mirrored
           * the sky at every grazing angle was a pale ribbon. */
          vec3 wView = normalize(vWaterWorld - cameraPosition);
          vec3 wR = reflect(wView, normalize(vec3(-wSlope.x, 1.0, -wSlope.y)));
          float wSky = smoothstep(0.25, 0.8, wR.y) * (1.0 - 0.5 * smoothstep(0.4, 1.0, abs(vWater.z)));
          radiance *= mix(0.07, 1.0, max(wSky, wFoam));
        }
        #endif
        #ifdef WATER_PLANAR
        {
          vec4 rc = vReflCoord;
          rc.xy += wSlope * 0.06 * rc.w * (1.0 - wFoam);
          vec3 mirror = texture2DProj(uReflect, rc).rgb;
          radiance = mix(mirror, radiance, max(wFoam, wSheen));
        }
        #endif`)
      .replace('#include <opaque_fragment>', `
        /* As much water as there is under the surface, and never less
         * than the light it reflects. Written so that premultiplying
         * gives body times cover plus reflection. */
        float cover = clamp(1.0 - exp(-max(vWater.x, 0.0) * uClarity * waterPath(vWaterWorld)), 0.0, 1.0);
        #ifdef WATER_FLOW
          cover *= 1.0 - 0.5 * smoothstep(0.8, 1.0, abs(vWater.z));
        #endif
        cover = max(cover, wFoam * 0.95);
        /* The light the body scatters back leaves through the surface,
         * which reflects its Fresnel share of it back down: toward the
         * horizon the water is more mirror than body. Never all mirror:
         * the wavelets too small to draw tilt toward the eye, and a
         * glacial lake stays turquoise to its far shore. */
        float wCos = clamp(dot(normal, geometryViewDir), 0.15, 1.0);
        totalDiffuse *= 1.0 - (0.02 + 0.98 * pow(1.0 - wCos, 5.0)) * (1.0 - wFoam);
        vec3 wSpec = totalSpecular;
        float glint = min(1.0, dot(wSpec, vec3(0.3, 0.59, 0.11)) * 1.5);
        float wAlpha = clamp(max(cover, glint), 0.0, 1.0);
        gl_FragColor = vec4((totalDiffuse * cover + wSpec) / max(wAlpha, 1e-3), wAlpha);`);
  };
  mat.customProgramCacheKey = () => `swiss2-water-${flow ? 'flow' : 'still'}-${planar ? 'planar' : 'env'}`;
  return mat;
}
