/*
 * post.js: the photographic valley's post chain.
 *
 * The cel chain (src/render/post.js) inks edges and grades flat colour;
 * none of that belongs on a photograph. This one is:
 *
 * 1. The scene into a half float target that keeps its depth texture.
 * 2. Where there are shadows (Medium and High), ambient occlusion from
 *    that depth at half resolution, into a target of its own.
 * 3. On High, bloom, kept to what a lens does: the sun and whatever the
 *    sun glints off, nothing else. The threshold is in the scene's own
 *    radiance, far above anything lit.
 * 4. One pass that is most of the look. The occlusion, then aerial
 *    perspective from the depth:
 *    light from a surface is dimmed by the air it crosses and the air
 *    adds its own, bluer the further, whiter toward the horizon, and
 *    brighter toward the sun, with the air thinning with height so a
 *    ridge across the valley and the peaks ten kilometres off are veiled
 *    by different amounts, which is the whole difference between a model
 *    and a mountain. Then exposure, the AgX curve and a print's
 *    contrast, the FPV camera's mild barrel and a lens's vignette, and
 *    the sRGB transfer.
 *    Doing the air here rather than in every material means the
 *    vegetation's and the water's materials are veiled exactly as the
 *    village is without either of them knowing.
 * 5. FXAA on the finished picture: there is no ink pass here to resolve
 *    silhouettes, and a photograph has no staircases.
 *
 * The object it returns has the shape post.js's does (render, setSize,
 * dispose, composer), so the shell and the cost ledger read it the same
 * way.
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
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

/*
 * The air. Extinction at the valley floor per metre, per channel: blue is
 * scattered most, which is what turns the far range blue before the
 * horizon takes it to white. The haze colour is the photographed sky's
 * own horizon, so a far ridge fades into the sky behind it rather than
 * into a grey of its own.
 */
export const AIR = {
  beta: new THREE.Vector3(4.5e-5, 6.0e-5, 8.5e-5),
  scaleHeight: 1400,
  haze: new THREE.Color().setRGB(0.4, 0.44, 0.5, THREE.LinearSRGBColorSpace),
  mie: 0.5,
  exposure: 1.7,
  contrast: 0.6,
};

const PhotoShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uProjInv: { value: new THREE.Matrix4() },
    uCamWorld: { value: new THREE.Matrix4() },
    uCamPos: { value: new THREE.Vector3() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color(1, 1, 1) },
    uHaze: { value: new THREE.Color(1, 1, 1) },
    uBeta: { value: new THREE.Vector3() },
    uScaleH: { value: 1000 },
    uMie: { value: 1 },
    uExposure: { value: 1 },
    uContrast: { value: 0 },
    uDistort: { value: 0.045 },
    uVignette: { value: 0.12 },
    tAo: { value: null },
    uAoTexel: { value: new THREE.Vector2(1, 1) },
    uAo: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    #include <common>
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform highp sampler2D tDepth;
    uniform mat4 uProjInv;
    uniform mat4 uCamWorld;
    uniform vec3 uCamPos;
    uniform vec3 uSunDir;
    uniform vec3 uSunCol;
    uniform vec3 uHaze;
    uniform vec3 uBeta;
    uniform float uScaleH;
    uniform float uMie;
    uniform float uExposure;
    uniform float uContrast;
    uniform float uDistort;
    uniform float uVignette;
    uniform sampler2D tAo;
    uniform vec2 uAoTexel;
    uniform float uAo;

    /* Air thinning with height: the optical depth along the ray is the
     * integral of exp(-y / H), which has this closed form between the
     * two heights. */
    vec3 aerial(vec3 col, vec3 wp) {
      vec3 dv = wp - uCamPos;
      float dist = length(dv);
      vec3 dir = dv / max(dist, 1e-3);
      float h0 = max(uCamPos.y, -50.0);
      float h1 = max(wp.y, -50.0);
      float e0 = exp(-h0 / uScaleH);
      float e1 = exp(-h1 / uScaleH);
      float dh = h1 - h0;
      float od = abs(dh) > 1.0 ? dist * uScaleH * (e0 - e1) / dh : dist * e0;
      vec3 T = exp(-uBeta * od);
      float mu = dot(dir, uSunDir);
      const float g = 0.72;
      float mie = (1.0 - g * g) / (4.0 * PI * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
      vec3 air = uHaze + uSunCol * (uMie * mie);
      return col * T + air * (1.0 - T);
    }

    /*
     * AgX (Sobotka's, as three r160 ships it), not ACES. The Hill ACES
     * fit pushes a saturated mid tone further out and turns a bright green
     * meadow into a lawn in a game; AgX desaturates toward white as a
     * value climbs, which is what film and a camera's sensor do, so a lit
     * field and a cloud roll off instead of clipping to a hue.
     */
    vec3 agxContrast(vec3 x) {
      vec3 x2 = x * x;
      vec3 x4 = x2 * x2;
      return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
    }
    vec3 agx(vec3 c) {
      const mat3 toRec2020 = mat3(vec3(0.6274, 0.0691, 0.0164), vec3(0.3293, 0.9195, 0.0880), vec3(0.0433, 0.0113, 0.8956));
      const mat3 fromRec2020 = mat3(vec3(1.6605, -0.1246, -0.0182), vec3(-0.5876, 1.1329, -0.1006), vec3(-0.0728, -0.0083, 1.1187));
      const mat3 inset = mat3(vec3(0.856627153315983, 0.137318972929847, 0.11189821299995), vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903), vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859));
      const mat3 outset = mat3(vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826), vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294), vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405));
      c = inset * (toRec2020 * c);
      c = clamp((log2(max(c, 1e-10)) + 12.47393) / 16.5, 0.0, 1.0);
      c = outset * agxContrast(c);
      c = pow(max(vec3(0.0), c), vec3(2.2));
      return clamp(fromRec2020 * c, 0.0, 1.0);
    }

    void main() {
      vec2 uv = vUv - 0.5;
      float r2 = dot(uv, uv);
      vec2 duv = 0.5 + uv * (1.0 + uDistort * r2) / (1.0 + uDistort * 0.5);
      vec3 c = texture2D(tDiffuse, duv).rgb;
      float d = texture2D(tDepth, duv).x;
      if (d < 1.0) {
        vec4 vp = uProjInv * vec4(duv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
        vp /= vp.w;
        if (uAo > 0.0) {
          /* Four taps a half texel out on the diagonals: the half
           * resolution occlusion's spiral noise averaged away. */
          float ao = 0.25 * (texture2D(tAo, duv + uAoTexel * vec2(0.5, 0.5)).r
            + texture2D(tAo, duv + uAoTexel * vec2(-0.5, 0.5)).r
            + texture2D(tAo, duv + uAoTexel * vec2(0.5, -0.5)).r
            + texture2D(tAo, duv + uAoTexel * vec2(-0.5, -0.5)).r);
          c *= mix(1.0, ao, uAo);
        }
        c = aerial(c, (uCamWorld * vec4(vp.xyz, 1.0)).xyz);
      }
      c = agx(c * uExposure);
      /* AgX's own curve is a flat negative; a print's S curve on the
       * display values, which keeps black and white where they are. */
      vec3 dv = pow(c, vec3(0.4545));
      dv = mix(dv, dv * dv * (3.0 - 2.0 * dv), uContrast);
      c = pow(dv, vec3(2.2));
      c *= 1.0 - uVignette * smoothstep(0.16, 0.55, r2);
      vec3 lo = c * 12.92;
      vec3 hi = 1.055 * pow(c, vec3(0.41666667)) - 0.055;
      gl_FragColor = vec4(mix(lo, hi, step(vec3(0.0031308), c)), 1.0);
    }
  `,
};

/*
 * Ambient occlusion from the depth alone, at half resolution into a
 * target of its own: where a wall meets the ground, under an eave, in a
 * window's reveal, the sky sees less of the surface, and without it a
 * building stands on the meadow like a cut out. Sixteen samples on a
 * spiral turned per pixel, the horizon's cosine against a normal
 * rebuilt from the depth, a metre and a half out, faded away beyond a
 * couple of hundred metres where it would only be noise. It does not
 * swap the composer's buffers, so the scene's colour and depth are where
 * the next pass expects them.
 */
const AoShader = {
  vertexShader: PhotoShader.vertexShader,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform highp sampler2D tDepth;
    uniform mat4 uProjInv;
    uniform vec2 uProjScale;
    uniform vec2 uTexel;
    uniform float uRadius;
    uniform float uIntensity;
    vec3 viewAt(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      vec4 p = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
      return p.xyz / p.w;
    }
    void main() {
      /* On the centre of a full resolution texel: a half resolution pixel
       * centre sits on a texel boundary, and a neighbour one texel off
       * could land on the same texel, which read as a flat face toward
       * the camera everywhere and hid every corner. */
      vec2 uv0 = (floor(vUv / uTexel) + 0.5) * uTexel;
      float d0 = texture2D(tDepth, uv0).x;
      if (d0 >= 1.0) {
        gl_FragColor = vec4(1.0);
        return;
      }
      vec3 P = viewAt(uv0);
      float fade = 1.0 - smoothstep(60.0, 260.0, -P.z);
      if (fade <= 0.0) {
        gl_FragColor = vec4(1.0);
        return;
      }
      vec3 pr = viewAt(uv0 + vec2(uTexel.x, 0.0));
      vec3 pl = viewAt(uv0 - vec2(uTexel.x, 0.0));
      vec3 pu = viewAt(uv0 + vec2(0.0, uTexel.y));
      vec3 pd = viewAt(uv0 - vec2(0.0, uTexel.y));
      vec3 dx = abs(pr.z - P.z) < abs(P.z - pl.z) ? pr - P : P - pl;
      vec3 dy = abs(pu.z - P.z) < abs(P.z - pd.z) ? pu - P : P - pd;
      vec3 N = normalize(cross(dx, dy));
      vec2 r = uProjScale * (0.5 * uRadius / -P.z);
      r = min(r, vec2(0.12));
      float spin = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
      float occ = 0.0;
      float taken = 0.0;
      for (int i = 0; i < 16; i++) {
        float t = (float(i) + 0.5) / 16.0;
        float a = float(i) * 2.3999632 + spin;
        vec2 at = uv0 + vec2(cos(a), sin(a)) * r * sqrt(t);
        /* Off the frame the depth clamps to the edge row, which is not
         * geometry, and read as an occluder it greyed the bottom of every
         * frame. */
        if (at.x < 0.0 || at.y < 0.0 || at.x > 1.0 || at.y > 1.0) {
          continue;
        }
        vec3 v = viewAt(at) - P;
        float len = length(v);
        occ += max(0.0, dot(v / max(len, 1e-4), N) - 0.15) * (1.0 - smoothstep(0.6, 1.0, len / uRadius));
        taken += 1.0;
      }
      float ao = clamp(1.0 - uIntensity * occ / max(taken, 1.0) * fade, 0.0, 1.0);
      gl_FragColor = vec4(ao, ao, ao, 1.0);
    }
  `,
};

class AoPass extends Pass {
  constructor(camera, w, h) {
    super();
    this.needsSwap = false;
    this.camera = camera;
    this.target = new THREE.WebGLRenderTarget(Math.max(1, w >> 1), Math.max(1, h >> 1), { depthBuffer: false });
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: null },
        uProjInv: { value: new THREE.Matrix4() },
        uProjScale: { value: new THREE.Vector2() },
        uTexel: { value: new THREE.Vector2(1 / w, 1 / h) },
        uRadius: { value: 2.0 },
        uIntensity: { value: 4.5 },
      },
      vertexShader: AoShader.vertexShader,
      fragmentShader: AoShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }

  setSize(w, h) {
    this.target.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.material.uniforms.uTexel.value.set(1 / w, 1 / h);
  }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.material.uniforms;
    u.tDepth.value = readBuffer.depthTexture;
    u.uProjInv.value.copy(this.camera.projectionMatrixInverse);
    u.uProjScale.value.set(this.camera.projectionMatrix.elements[0], this.camera.projectionMatrix.elements[5]);
    renderer.setRenderTarget(this.target);
    this.fsQuad.render(renderer);
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
  }
}

class PhotoPass extends Pass {
  constructor(camera, sunDir, sunColor) {
    super();
    this.camera = camera;
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(PhotoShader.uniforms),
      vertexShader: PhotoShader.vertexShader,
      fragmentShader: PhotoShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    const u = this.material.uniforms;
    u.uSunDir.value.copy(sunDir);
    u.uSunCol.value.copy(sunColor);
    u.uHaze.value.copy(AIR.haze);
    u.uBeta.value.copy(AIR.beta);
    u.uScaleH.value = AIR.scaleHeight;
    u.uMie.value = AIR.mie;
    u.uExposure.value = AIR.exposure;
    u.uContrast.value = AIR.contrast;
    this.fsQuad = new FullScreenQuad(this.material);
  }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.material.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.tDepth.value = readBuffer.depthTexture;
    u.uProjInv.value.copy(this.camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(this.camera.matrixWorld);
    u.uCamPos.value.setFromMatrixPosition(this.camera.matrixWorld);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
  }
}

export function buildPhotoComposer(renderer, scene, camera, q, sun) {
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const dpr = renderer.getPixelRatio();
  const w = Math.max(1, Math.floor(size.x * dpr));
  const h = Math.max(1, Math.floor(size.y * dpr));
  const wantBloom = !q.field || q.field.bloom !== false;

  const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
  target.depthTexture = new THREE.DepthTexture(w, h);
  const composer = new EffectComposer(renderer, target);
  /* Its own depth texture for the second target. The composer clones the
   * first target for the second, and in r160 a cloned DepthTexture keeps
   * the original's image source, which three turns into the same GL
   * texture: the air pass then read the depth attached to the target it
   * was drawing into, and the driver refused every draw as a feedback
   * loop. */
  composer.renderTarget2.depthTexture = new THREE.DepthTexture(w, h);
  composer.addPass(new RenderPass(scene, camera));

  /* Occlusion wherever there is a shadow map to go with it: Low has
   * neither. */
  let ao = null;
  if (q.shadows) {
    ao = new AoPass(camera, w, h);
    composer.addPass(ao);
  }
  let bloom = null;
  if (wantBloom) {
    bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.12, 0.6, 6.0);
    composer.addPass(bloom);
  }
  const photo = new PhotoPass(camera, sun.direction, sun.color);
  if (ao) {
    photo.material.uniforms.tAo.value = ao.target.texture;
    photo.material.uniforms.uAo.value = 0.85;
    photo.material.uniforms.uAoTexel.value.set(1 / ao.target.width, 1 / ao.target.height);
  }
  composer.addPass(photo);
  const fxaa = new ShaderPass(FXAAShader);
  fxaa.material.uniforms.resolution.value.set(1 / w, 1 / h);
  composer.addPass(fxaa);

  function setSize(width, height) {
    const p = renderer.getPixelRatio();
    composer.setPixelRatio(p);
    composer.setSize(width, height);
    fxaa.material.uniforms.resolution.value.set(1 / Math.max(1, Math.floor(width * p)), 1 / Math.max(1, Math.floor(height * p)));
    if (ao) {
      photo.material.uniforms.uAoTexel.value.set(1 / ao.target.width, 1 / ao.target.height);
    }
  }

  return {
    render() {
      composer.render();
    },
    setSize,
    /* The pass materials as well as the targets: three frees a compiled
     * program only when the material that owns it is disposed. The
     * FullScreenQuads are not disposed, for post.js's reason: their
     * geometry is shared by every quad in the session. */
    dispose() {
      for (const rt of [composer.renderTarget1, composer.renderTarget2]) {
        if (rt.depthTexture) {
          rt.depthTexture.dispose();
        }
        rt.dispose();
      }
      if (bloom) {
        bloom.dispose();
      }
      photo.material.dispose();
      if (ao) {
        ao.dispose();
      }
      fxaa.material.dispose();
      composer.copyPass.material.dispose();
    },
    outline: null,
    bloom,
    grade: photo,
    composer,
    normalTarget: null,
  };
}
