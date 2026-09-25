/*
 * post.js: the photographic valley's post chain.
 *
 * The cel chain (src/render/post.js) inks edges and grades flat colour;
 * none of that belongs on a photograph. This one is:
 *
 * 1. The scene into a half float target that keeps its depth texture.
 * 2. Where there are shadows (Medium and High), ambient occlusion from
 *    that depth at half resolution, into a target of its own.
 * 3. The low cloud in the valley (clouds.js), marched over that depth at
 *    half resolution into a target of its own.
 * 4. Where the preset has it, the camera's meter (LENS below): the
 *    scene's brightness, and how much of the sun the lens sees.
 * 5. On High, bloom, kept to what a lens does: the sun and whatever the
 *    sun glints off, nothing else. The threshold is in the scene's own
 *    radiance, far above anything lit.
 * 6. One pass that is most of the look. The occlusion, then aerial
 *    perspective from the depth:
 *    light from a surface is dimmed by the air it crosses and the air
 *    adds its own, bluer the further, whiter toward the horizon, and
 *    brighter toward the sun, with the air thinning with height so a
 *    ridge across the valley and the peaks ten kilometres off are veiled
 *    by different amounts, which is the whole difference between a model
 *    and a mountain. Then the lens's glare, the metered exposure, the
 *    AgX curve and a print's contrast, the FPV camera's mild barrel,
 *    its colour fringe and a lens's vignette, the sRGB transfer and the
 *    sensor's grain.
 *    Doing the air here rather than in every material means the
 *    vegetation's and the water's materials are veiled exactly as the
 *    village is without either of them knowing. The cloud goes over
 *    the veiled scene there, brought up to full resolution with the
 *    depth as its guide.
 * 7. FXAA on the finished picture: there is no ink pass here to resolve
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
 *
 * The extinction was lifted a quarter in round 8 with the print's slope
 * below: steepened, the far ridges kept too little of the air between
 * them, and the photographs have each ridge paler than the one in front
 * (tools/swiss2-loop/contrast.py's layer, +0.06 over the photographs).
 *
 * The print steepens its lightness about pivot. Measured against the
 * photographs (contrast.py), the frames were flat: the ground's 5th to
 * 95th percentile of lightness 0.19 to 0.65 against the photographs'
 * 0.13 to 0.77, the local contrast 0.055 against 0.077, the middle value
 * the same (0.38). One slope for every frame (1.45 closed the means)
 * crushed the views that already had range, the eye level ones under
 * dark crowns and the bus in shade, and left the flattest (lake-high)
 * flat, as a printer would not. So the slope is the frame's own: spread
 * over the meter's measured spread of log2 luminance (the taps' centre
 * weighted deviation, 0.5 stops for lake-high to 1.6 into the sun),
 * between 1 and slopeMax. slope is the fixed one for a preset with no
 * meter, what spread gives the typical view's 0.75 stops.
 */
export const AIR = {
  beta: new THREE.Vector3(5.6e-5, 7.5e-5, 10.6e-5),
  scaleHeight: 1400,
  haze: new THREE.Color().setRGB(0.4, 0.44, 0.5, THREE.LinearSRGBColorSpace),
  mie: 0.5,
  exposure: 1.45,
  contrast: 0.6,
  slope: 1.45,
  spread: 1.2,
  slopeMax: 1.8,
  pivot: 0.38,
};

/*
 * The air, as GLSL both this pass and the clouds' march (clouds.js) use,
 * so a cloud is veiled by the air in front of it exactly as a wall at the
 * same distance is.
 */
export const AIR_GLSL = /* glsl */ `
  uniform vec3 uCamPos;
  uniform vec3 uSunDir;
  uniform vec3 uSunCol;
  uniform vec3 uHaze;
  uniform vec3 uBeta;
  uniform float uScaleH;
  uniform float uMie;
  /* Air thinning with height: the optical depth along the ray is the
   * integral of exp(-y / H), which has this closed form between the
   * two heights. Returns the transmittance, and the air's own light in
   * the rgb of air. */
  vec3 airT(vec3 wp, out vec3 air) {
    vec3 dv = wp - uCamPos;
    float dist = length(dv);
    vec3 dir = dv / max(dist, 1e-3);
    float h0 = max(uCamPos.y, -50.0);
    float h1 = max(wp.y, -50.0);
    float e0 = exp(-h0 / uScaleH);
    float e1 = exp(-h1 / uScaleH);
    float dh = h1 - h0;
    float od = abs(dh) > 1.0 ? dist * uScaleH * (e0 - e1) / dh : dist * e0;
    float mu = dot(dir, uSunDir);
    const float g = 0.72;
    float mie = (1.0 - g * g) / (4.0 * PI * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
    air = uHaze + uSunCol * (uMie * mie);
    return exp(-uBeta * od);
  }
  vec3 aerial(vec3 col, vec3 wp) {
    vec3 air;
    vec3 T = airT(wp, air);
    return col * T + air * (1.0 - T);
  }
  /* Light from a cloud of opacity alpha at wp, premultiplied: the air
   * in front of it adds only where the cloud hides what is behind, the
   * rest of that air being in the veil of the ground behind it. */
  vec3 airOver(vec3 light, vec3 wp, float alpha) {
    vec3 air;
    vec3 T = airT(wp, air);
    return light * T + air * (1.0 - T) * alpha;
  }
`;

/*
 * The camera. What makes a frame read as a photograph rather than a
 * render is mostly that a camera took it: it chose its exposure from the
 * scene, the sun near the frame fogged its lens, and its sensor added a
 * little noise. Each is what a phone's camera does in daylight, and no
 * more, and each preset keeps what it can afford: Low none of it, Medium
 * the exposure and the grain, High all of it.
 *
 * The exposure is metered, not set. A camera exposes a valley in shade
 * brighter than one in sun, which is the whole difference between a
 * photograph of the fall's foot and a render of it: rendered at one
 * exposure, a view in the mountains' shadow was half as bright as its
 * photograph and a view into the sun a third brighter. The meter is the
 * scene's centre weighted log mean luminance, after the air and the
 * cloud, and the exposure moves toward KEY over it by ADAPT of the way
 * (a phone goes nearly all the way; less keeps a shaded view darker than
 * a sunlit one, as a photograph does too), within the range RANGE, at
 * the pace of a camera's exposure, TAU seconds. A cut (the camera moving
 * further in one frame than anything flies, CUT metres) sets it at once:
 * a camera that has just been pointed somewhere has had its second to
 * settle, and so every fixed view of the loop is metered from its own
 * frame alone, the same on every run, whatever came before it.
 *
 * Glare is the sun's light scattered inside the lens: a veil round the
 * sun that falls off as the square of the angle to it, some parts in ten
 * thousand of the sun's light per square radian (GLARE), a lens's own
 * haze, whether the sun is in the frame or just outside it, gone when the
 * sun is behind a ridge or a cloud from where the camera stands, and cut
 * by the lens's barrel as the sun goes behind the camera. No ghosts:
 * at a coated lens's strength (its surfaces' reflectance squared, a few
 * parts in a hundred thousand of the sun) they were lost against the
 * sky and the cloud round the sun in every frame tried, and none of the
 * photographs has one.
 *
 * Chromatic aberration (ca): the red and blue images scaled by 1 - ca
 * and 1 + ca about the centre, two thirds of a pixel at the corners of a
 * frame 1600 wide. Grain (grain, the noise's deviation in display
 * values, one and a half levels in 255): a sensor's shot noise, which in
 * display values is nearly the same at every brightness, fresh every
 * frame.
 *
 * No depth of field: a phone's lens is so short that its hyperfocal
 * distance is a metre or two, and every photograph the loop is judged
 * against is sharp from its foreground grass to the peaks.
 */
export const LENS = {
  high: { meter: true, glare: true, ca: 0.0008, grain: 0.006 },
  medium: { meter: true, glare: false, ca: 0, grain: 0.006 },
  low: { meter: false, glare: false, ca: 0, grain: 0 },
};
/* KEY is the geometric mean of the loop's thirteen views' metered
 * luminance (0.086), so the valley's typical view keeps the exposure it
 * had when AIR.exposure was the whole of it, and the colour match to the
 * photographs (tools/swiss2-loop/colour.py) with it. */
const KEY = 0.09;
const ADAPT = 0.75;
const RANGE = [0.45, 2.6];
const TAU = 0.9;
const CUT = 40;
const GLARE = 1.5e-4;

/*
 * The meter's taps: a grid over the frame, each tap one texel of a small
 * target, drawn in one draw so the taps are read in parallel, and then
 * one texel that averages them and moves toward the average at the
 * exposure's pace. Its green is how much of the sun the lens sees, moved
 * at the same pace, so a glare fades as a ridge covers the sun; its blue
 * is the deviation of the taps' log2 luminance, for the print's slope.
 */
const METER_W = 16;
const METER_H = 8;

const MeterTapShader = (sunGlsl) => ({
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    #include <common>
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform highp sampler2D tDepth;
    uniform sampler2D tCloud;
    uniform mat4 uProjInv;
    uniform mat4 uCamWorld;
    ${AIR_GLSL}
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float d = texture2D(tDepth, vUv).x;
      if (d < 1.0) {
        vec4 vp = uProjInv * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
        c = aerial(c, (uCamWorld * vec4(vp.xyz / vp.w, 1.0)).xyz);
      }
      vec4 cl = texture2D(tCloud, vUv);
      c = cl.rgb + c * cl.a;
      /* The sun's disc is thousands of times the sky: clipped, as a
       * meter's cell would be. */
      float L = clamp(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-3, 30.0);
      vec2 q = (vUv - 0.5) * vec2(1.0, 1.4);
      float w = 1.0 - 0.6 * smoothstep(0.1, 0.55, length(q));
      gl_FragColor = vec4(log2(L) * w, w, log2(L) * log2(L) * w, 1.0);
    }
  `,
  reduce: /* glsl */ `
    #include <common>
    uniform sampler2D tTaps;
    uniform sampler2D tPrev;
    uniform highp sampler2D tDepth;
    uniform sampler2D tCloud;
    uniform float uBlend;
    uniform vec3 uCamPos;
    uniform vec3 uSunUv;
    ${sunGlsl}
    void main() {
      vec3 s = vec3(0.0);
      for (int j = 0; j < ${METER_H}; j++) {
        for (int i = 0; i < ${METER_W}; i++) {
          s += texelFetch(tTaps, ivec2(i, j), 0).rgb;
        }
      }
      /* The sun past the ridges and the clouds from where the camera
       * stands, and, with its disc in the frame, not behind whatever the
       * scene or the low cloud has in front of it there. */
      float vis = s2TerrainSun(uCamPos) * s2Cloud(uCamPos);
      if (uSunUv.z > 0.5) {
        vis *= step(1.0, texture2D(tDepth, uSunUv.xy).x) * texture2D(tCloud, uSunUv.xy).a;
      }
      float mean = s.x / max(s.y, 1e-4);
      float spread = sqrt(max(s.z / max(s.y, 1e-4) - mean * mean, 0.0));
      vec3 now = vec3(mean, vis, spread);
      vec3 prev = texture2D(tPrev, vec2(0.5)).rgb;
      gl_FragColor = vec4(mix(prev, now, uBlend), 1.0);
    }
  `,
});

class MeterPass extends Pass {
  constructor(camera, sun, sunDir) {
    super();
    this.needsSwap = false;
    this.camera = camera;
    this.sunDir = sunDir.clone();
    const opts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
    this.taps = new THREE.WebGLRenderTarget(METER_W, METER_H, opts);
    this.ping = [new THREE.WebGLRenderTarget(1, 1, opts), new THREE.WebGLRenderTarget(1, 1, opts)];
    this.current = 0;
    this.last = null;
    const src = MeterTapShader(sun.glsl);
    this.tapMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        tCloud: { value: null },
        uProjInv: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
        uCamPos: { value: new THREE.Vector3() },
        uSunDir: { value: sunDir.clone() },
        uSunCol: { value: new THREE.Color() },
        uHaze: { value: AIR.haze.clone() },
        uBeta: { value: AIR.beta.clone() },
        uScaleH: { value: AIR.scaleHeight },
        uMie: { value: AIR.mie },
      },
      vertexShader: src.vertexShader,
      fragmentShader: src.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.reduceMat = new THREE.ShaderMaterial({
      uniforms: {
        ...sun.uniforms,
        tTaps: { value: this.taps.texture },
        tPrev: { value: null },
        tDepth: { value: null },
        tCloud: { value: null },
        uBlend: { value: 1 },
        uCamPos: this.tapMat.uniforms.uCamPos,
        uSunUv: { value: new THREE.Vector3() },
      },
      vertexShader: src.vertexShader,
      fragmentShader: src.reduce,
      depthTest: false,
      depthWrite: false,
    });
    this.tapQuad = new FullScreenQuad(this.tapMat);
    this.reduceQuad = new FullScreenQuad(this.reduceMat);
    this.sunNdc = new THREE.Vector3();
  }

  /* The metered value this frame: r the log2 luminance, g the sun seen,
   * b the log2 luminance's spread. */
  get texture() {
    return this.ping[this.current].texture;
  }

  render(renderer, writeBuffer, readBuffer, deltaTime) {
    const cam = this.camera;
    const t = this.tapMat.uniforms;
    t.tDiffuse.value = readBuffer.texture;
    t.tDepth.value = readBuffer.depthTexture;
    t.uProjInv.value.copy(cam.projectionMatrixInverse);
    t.uCamWorld.value.copy(cam.matrixWorld);
    t.uCamPos.value.setFromMatrixPosition(cam.matrixWorld);
    const cut = this.last === null || this.last.distanceTo(t.uCamPos.value) > CUT;
    this.last = (this.last || new THREE.Vector3()).copy(t.uCamPos.value);
    renderer.setRenderTarget(this.taps);
    this.tapQuad.render(renderer);

    const r = this.reduceMat.uniforms;
    r.tDepth.value = readBuffer.depthTexture;
    r.tCloud.value = t.tCloud.value;
    r.tPrev.value = this.ping[this.current].texture;
    r.uBlend.value = cut ? 1 : 1 - Math.exp(-Math.max(0, deltaTime || 0) / TAU);
    this.sunNdc.copy(this.sunDir).add(t.uCamPos.value).project(cam);
    const inFrame = Math.abs(this.sunNdc.x) < 1 && Math.abs(this.sunNdc.y) < 1 && this.sunNdc.z < 1;
    r.uSunUv.value.set(this.sunNdc.x * 0.5 + 0.5, this.sunNdc.y * 0.5 + 0.5, inFrame ? 1 : 0);
    this.current = 1 - this.current;
    renderer.setRenderTarget(this.ping[this.current]);
    this.reduceQuad.render(renderer);
  }

  dispose() {
    this.taps.dispose();
    this.ping.forEach((p) => p.dispose());
    this.tapMat.dispose();
    this.reduceMat.dispose();
  }
}

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
    uSlope: { value: 1 },
    uDistort: { value: 0.045 },
    uVignette: { value: 0.12 },
    tAo: { value: null },
    uAoTexel: { value: new THREE.Vector2(1, 1) },
    uAo: { value: 0 },
    tCloud: { value: null },
    uCloudTexel: { value: new THREE.Vector2(1, 1) },
    uCloud: { value: 0 },
    uNearFar: { value: new THREE.Vector2(0.1, 1000) },
    tMeter: { value: null },
    uCa: { value: 0 },
    uGrain: { value: 0 },
    uFrame: { value: 0 },
    uGlare: { value: new THREE.Color(0, 0, 0) },
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
    uniform float uExposure;
    uniform float uContrast;
    uniform float uSlope;
    uniform float uDistort;
    uniform float uVignette;
    uniform sampler2D tAo;
    uniform vec2 uAoTexel;
    uniform float uAo;
    uniform sampler2D tCloud;
    uniform vec2 uCloudTexel;
    uniform float uCloud;
    uniform vec2 uNearFar;
    uniform sampler2D tMeter;
    uniform float uCa;
    uniform float uGrain;
    uniform float uFrame;
    uniform vec3 uGlare;

    ${AIR_GLSL}

    float grainHash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    float linearDepth(float d) {
      return uNearFar.x * uNearFar.y / (uNearFar.y - d * (uNearFar.y - uNearFar.x));
    }
    /*
     * The clouds' half resolution march brought up to this pixel, and
     * smoothed: of the nine half resolution texels round it, each is
     * weighted by a tent over the distance and by how near the depth it
     * was marched to (clouds.js marches each from one full resolution
     * texel) is to this pixel's own, so the march's per pixel jitter is
     * averaged away but a cloud behind a ridge does not bleed over the
     * ridge's edge.
     */
    vec4 cloudAt(vec2 uv, float d) {
      vec2 hs = 2.0 * uCloudTexel;
      vec2 f = uv / hs - 0.5;
      vec2 ic = floor(f + 0.5);
      float z = linearDepth(d);
      vec4 sum = vec4(0.0);
      float wsum = 0.0;
      for (int k = 0; k < 9; k++) {
        vec2 o = vec2(float(k - 3 * (k / 3)) - 1.0, float(k / 3) - 1.0);
        vec2 cuv = (ic + o + 0.5) * hs;
        vec2 duv0 = (floor(cuv / uCloudTexel / 2.0) * 2.0 + 0.5) * uCloudTexel;
        float zk = linearDepth(texture2D(tDepth, duv0).x);
        vec2 r = f - (ic + o);
        float bw = max(0.0, 1.6 - abs(r.x)) * max(0.0, 1.6 - abs(r.y));
        float w = bw / (0.02 + abs(zk - z) / max(z, 1.0) * 60.0);
        sum += texture2D(tCloud, cuv) * w;
        wsum += w;
      }
      return sum / max(wsum, 1e-6);
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
      #ifdef LENS_CA
        c.r = texture2D(tDiffuse, 0.5 + (duv - 0.5) * (1.0 - uCa)).r;
        c.b = texture2D(tDiffuse, 0.5 + (duv - 0.5) * (1.0 + uCa)).b;
      #endif
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
      if (uCloud > 0.0) {
        vec4 cl = cloudAt(duv, d);
        c = cl.rgb + c * cl.a;
      }
      float ev = uExposure;
      #ifdef LENS_METER
        vec3 meter = texture2D(tMeter, vec2(0.5)).rgb;
        ev *= clamp(pow(${KEY.toFixed(4)} / exp2(meter.r), ${ADAPT.toFixed(3)}), ${RANGE[0].toFixed(3)}, ${RANGE[1].toFixed(3)});
      #endif
      #ifdef LENS_GLARE
        /* The glare's angle to the sun: 2 (1 - cos) is its square, near
         * enough, down to the sun's own radius. */
        vec4 fp = uProjInv * vec4(duv * 2.0 - 1.0, 1.0, 1.0);
        vec3 ray = normalize(mat3(uCamWorld) * (fp.xyz / fp.w));
        float th2 = 2.0 * (1.0 - dot(ray, uSunDir));
        c += uGlare * (meter.g / (th2 + 2.0e-5));
      #endif
      c = agx(c * ev);
      /* AgX's own curve is a flat negative; a print's S curve on the
       * display values, which keeps black and white where they are. */
      vec3 dv = pow(c, vec3(0.4545));
      dv = mix(dv, dv * dv * (3.0 - 2.0 * dv), uContrast);
      /* The print's slope (AIR above): the lightness steepened about the
       * frames' middle value, more for a flat frame than for one with
       * range, with a soft toe and shoulder, and the colour scaled with
       * it so its saturation is what it was. */
      float l0 = max(dot(dv, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
      float slope = uSlope;
      #ifdef LENS_METER
        slope = clamp(${AIR.spread.toFixed(3)} / max(meter.b, 0.1), 1.0, ${AIR.slopeMax.toFixed(3)});
      #endif
      float l1 = ${AIR.pivot.toFixed(3)} + (l0 - ${AIR.pivot.toFixed(3)}) * slope;
      l1 = l1 < 0.14 ? 0.14 * exp((l1 - 0.14) / 0.14) : l1;
      l1 = l1 > 0.85 ? 1.0 - 0.15 * exp((0.85 - l1) / 0.15) : l1;
      dv = clamp(dv * (l1 / l0), 0.0, 1.0);
      c = pow(dv, vec3(2.2));
      c *= 1.0 - uVignette * smoothstep(0.16, 0.55, r2);
      vec3 lo = c * 12.92;
      vec3 hi = 1.055 * pow(c, vec3(0.41666667)) - 0.055;
      vec3 o = mix(lo, hi, step(vec3(0.0031308), c));
      #ifdef LENS_GRAIN
        /* Triangular noise, the sum of two uniform ones: its deviation is
         * 0.408 of its half width. */
        vec2 gp = gl_FragCoord.xy + fract(uFrame * vec2(0.61803, 0.41421)) * 517.0;
        float n = grainHash(gp) + grainHash(gp + 71.3) - 1.0;
        o += n * (uGrain / 0.408);
      #endif
      gl_FragColor = vec4(o, 1.0);
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
  constructor(camera, sun, lens, meter) {
    super();
    this.camera = camera;
    this.sun = sun;
    this.lens = lens;
    this.meter = meter;
    const defines = {};
    if (lens.meter) {
      defines.LENS_METER = '';
    }
    if (lens.glare) {
      defines.LENS_GLARE = '';
    }
    if (lens.ca > 0) {
      defines.LENS_CA = '';
    }
    if (lens.grain > 0) {
      defines.LENS_GRAIN = '';
    }
    this.material = new THREE.ShaderMaterial({
      defines,
      uniforms: THREE.UniformsUtils.clone(PhotoShader.uniforms),
      vertexShader: PhotoShader.vertexShader,
      fragmentShader: PhotoShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    const u = this.material.uniforms;
    u.uSunDir.value.copy(sun.direction);
    u.uSunCol.value.copy(sun.color);
    u.uCa.value = lens.ca;
    u.uGrain.value = lens.grain;
    this.fwd = new THREE.Vector3();
    u.uHaze.value.copy(AIR.haze);
    u.uBeta.value.copy(AIR.beta);
    u.uScaleH.value = AIR.scaleHeight;
    u.uMie.value = AIR.mie;
    u.uExposure.value = AIR.exposure;
    u.uContrast.value = AIR.contrast;
    u.uSlope.value = AIR.slope;
    this.fsQuad = new FullScreenQuad(this.material);
  }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.material.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.tDepth.value = readBuffer.depthTexture;
    u.uProjInv.value.copy(this.camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(this.camera.matrixWorld);
    u.uCamPos.value.setFromMatrixPosition(this.camera.matrixWorld);
    u.uNearFar.value.set(this.camera.near, this.camera.far);
    u.uFrame.value = (u.uFrame.value + 1) % 4096;
    if (this.meter) {
      u.tMeter.value = this.meter.texture;
    }
    if (this.lens.glare) {
      this.glare(u);
    }
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
  }

  /* The glare's strength, the lens's barrel taking it away as the sun
   * goes more than about sixty degrees off the axis. */
  glare(u) {
    this.camera.getWorldDirection(this.fwd);
    const axis = THREE.MathUtils.smoothstep(this.fwd.dot(this.sun.direction), 0.25, 0.6);
    u.uGlare.value.copy(this.sun.color).multiplyScalar(this.sun.irradiance * GLARE * axis);
  }
}

export function buildPhotoComposer(renderer, scene, camera, q, sun, clouds) {
  const lens = LENS[q.id];
  if (!lens) {
    throw new Error(`swiss2 post: no lens for the ${q.id} preset; say what it spends in src/maps/swiss2/post.js`);
  }
  if (lens.glare && !lens.meter) {
    throw new Error('swiss2 post: the glare reads the meter for how much of the sun the lens sees');
  }
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
  /* The low cloud (clouds.js), marched over the depth before the bloom
   * writes over the colour. */
  const cloud = clouds.pass(camera, q, w, h);
  composer.addPass(cloud);
  /* The meter reads the scene before the bloom adds to it: a camera
   * meters the light, not its own glow. */
  let meter = null;
  if (lens.meter) {
    meter = new MeterPass(camera, sun.at, sun.direction);
    meter.tapMat.uniforms.tCloud.value = cloud.target.texture;
    composer.addPass(meter);
  }
  let bloom = null;
  if (wantBloom) {
    bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.12, 0.6, 6.0);
    composer.addPass(bloom);
  }
  const photo = new PhotoPass(camera, sun, lens, meter);
  if (ao) {
    photo.material.uniforms.tAo.value = ao.target.texture;
    photo.material.uniforms.uAo.value = 0.85;
    photo.material.uniforms.uAoTexel.value.set(1 / ao.target.width, 1 / ao.target.height);
  }
  photo.material.uniforms.tCloud.value = cloud.target.texture;
  photo.material.uniforms.uCloud.value = 1;
  photo.material.uniforms.uCloudTexel.value.set(1 / w, 1 / h);
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
    photo.material.uniforms.uCloudTexel.value.set(1 / Math.max(1, Math.floor(width * p)), 1 / Math.max(1, Math.floor(height * p)));
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
      cloud.dispose();
      if (meter) {
        meter.dispose();
      }
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
