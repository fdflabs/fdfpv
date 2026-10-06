/*
 * post.js: the cel worlds' post processing chain.
 *
 * Three full resolution passes, one under the budget's four:
 *
 * 1. Ink. A prepass draws the scene once more into a small RGBA8 target,
 *    view normal in rg and linear depth packed in ba, and an edge pass
 *    reads it: depth steps find silhouettes and where things meet the
 *    ground, normal steps find creases, which together read as drawn
 *    lines (a hull outline only gives a silhouette). The same fetches are
 *    the frame's only antialiasing: two colour taps along each silhouette
 *    resolve it, with a coverage threshold far below the ink's, so an
 *    edge too faint to ink is still smoothed. Multisampling the composer
 *    target instead would cost 116 MB of a 120 MB budget at 1080p.
 * 2. Bloom, small and tight: enough for the gate rings and the sun to
 *    glow and pull the eye, not enough to fight the cel look.
 * 3. The grade, which is also the output: mild FPV barrel distortion, a
 *    highlight shoulder, cool blacks against warm lights, vibrance, a
 *    vignette and the sRGB transfer, done here rather than in a fourth
 *    pass.
 *
 * A sharpen pass sits at the end, enabled only while dynamic resolution
 * draws below native.
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
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/* Every full screen pass here draws the same quad. */
const QUAD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/*
 * Depth as 16 bits in two 8 bit channels, linear from near to far: 4 cm
 * steps over 0.2 to 2600 m everywhere, where a perspective depth buffer
 * would be wasted near the camera and too coarse to tell one far ridge
 * from the next. Two channels instead of a depth texture is also what
 * lets one fetch carry normal and depth.
 */
const DEPTH16_GLSL = /* glsl */ `
  vec2 packDepth16(float v) {
    float low = fract(v * 255.0);
    return vec2(v - low / 255.0, low);
  }
  float unpackDepth16(vec2 p) {
    return p.x + p.y * (1.0 / 255.0);
  }
`;

/* The prepass's vertex stage uses three's own chunks, which carry the
 * instance matrix; a bare model view transform drew every instanced mesh
 * once at its origin. */
const PREPASS_VERTEX = /* glsl */ `
  varying vec3 vNormalView;
  varying float vViewDepth;
  void main() {
    #include <beginnormal_vertex>
    #include <defaultnormal_vertex>
    #include <begin_vertex>
    #include <project_vertex>
    vNormalView = transformedNormal;
    vViewDepth = -mvPosition.z;
  }
`;

/*
 * The prepass's output: packed normal and depth, or, for things that
 * must hide what is behind them without being inked themselves (grass,
 * water, the gate ring), a normal of zero, a value no real normal encodes,
 * which the edge pass reads as "do not ink here or beside here".
 */
function prepassFragment(noInk) {
  const write = noInk
    ? 'gl_FragColor = vec4(0.0, 0.0, packDepth16(depth));'
    : 'gl_FragColor = vec4(normalize(vNormalView).xy * 0.5 + 0.5, packDepth16(depth));';
  return /* glsl */ `
    uniform float uNear;
    uniform float uFar;
    varying vec3 vNormalView;
    varying float vViewDepth;
    ${DEPTH16_GLSL}
    void main() {
      float depth = clamp((vViewDepth - uNear) / (uFar - uNear), 0.0, 1.0);
      ${write}
    }
  `;
}

/*
 * The edge pass. Its numbers:
 * uNormalBias is high enough that the roughly 42 degree facets of low
 * poly canopies and rocks (a normal step near 0.7) stay clean while real
 * corners near 90 degrees (about 1.4) ink; uAaBias, a twentieth of the
 * ink's, asks for coverage on every silhouette and ink only on bold ones.
 */
const InkShader = {
  uniforms: {
    tDiffuse: { value: null },
    tGeo: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uLineColor: { value: new THREE.Color(0x1a2230) },
    uDepthBias: { value: 0.0016 },
    uNormalBias: { value: 1.05 },
    uStrength: { value: 0.85 },
    uAaBias: { value: 0.00008 },
    uAaAmount: { value: 1.0 },
  },
  vertexShader: QUAD_VERTEX,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform sampler2D tGeo;
    uniform vec2 uResolution;
    uniform vec3 uLineColor;
    uniform float uDepthBias;
    uniform float uNormalBias;
    uniform float uStrength;
    uniform float uAaBias;
    uniform float uAaAmount;
    ${DEPTH16_GLSL}

    /* Only xy is stored; z comes back positive, which a front face has,
     * and both uses of it want a magnitude. */
    vec3 normalOf(vec2 enc) {
      vec2 xy = enc * 2.0 - 1.0;
      return vec3(xy, sqrt(max(0.0, 1.0 - dot(xy, xy))));
    }

    /* Clamped to the frame: a tap past the border would wrap round and
     * paint a false edge along it. */
    vec2 inFrame(vec2 uv) {
      return clamp(uv, vec2(0.0), vec2(1.0));
    }

    /* A sentinel (no ink) pixel: rg both zero. */
    float noInk(vec4 g) {
      return step(length(g.xy), 0.02);
    }

    void main() {
      vec2 px = 1.0 / uResolution;
      vec4 colour = texture2D(tDiffuse, vUv);

      /* The pixel and its four diagonal neighbours: a Roberts cross. */
      vec4 here = texture2D(tGeo, vUv);
      vec4 ne = texture2D(tGeo, inFrame(vUv + vec2( px.x,  px.y)));
      vec4 sw = texture2D(tGeo, inFrame(vUv + vec2(-px.x, -px.y)));
      vec4 se = texture2D(tGeo, inFrame(vUv + vec2( px.x, -px.y)));
      vec4 nw = texture2D(tGeo, inFrame(vUv + vec2(-px.x,  px.y)));
      float dHere = unpackDepth16(here.zw);
      float dNe = unpackDepth16(ne.zw);
      float dSw = unpackDepth16(sw.zw);
      float dSe = unpackDepth16(se.zw);
      float dNw = unpackDepth16(nw.zw);

      /* Depth finds silhouettes; the normal finds folds where both faces
       * are equally far. */
      float depthStep = length(vec2(dNe - dSw, dSe - dNw));
      vec3 nHere = normalOf(here.xy);
      float fold = length(normalOf(ne.xy) - normalOf(sw.xy)) + length(normalOf(se.xy) - normalOf(nw.xy));

      /* Sentinel pixels are never inked, nor their neighbours, yet their
       * depth still counts, so nothing hidden behind grass or water is
       * inked through it. */
      float sentinel = noInk(here);
      float nearSentinel = max(max(noInk(ne), noInk(sw)), max(noInk(se), noInk(nw)));

      /* A surface seen edge on has a steep depth gradient of its own; the
       * threshold grows as it turns away (and with distance), or the
       * ground gets a line across the frame. */
      float faceOn = max(abs(nHere.z), 0.12);
      float farScale = 1.0 + dHere * 260.0;
      float threshold = farScale / faceOn;

      /*
       * Coverage, from the fetches above: two colour taps ALONG the
       * silhouette, perpendicular to the depth gradient. A staircase is a
       * discontinuity along the edge, so that is where it is filtered;
       * mixing across the edge (tried first) only softened it and left a
       * period four stair behind. A sentinel's normal is meaningless, so
       * its coverage threshold ignores the facing term.
       */
      vec2 across = vec2((dNe + dSe) - (dSw + dNw), (dNe + dNw) - (dSw + dSe));
      float acrossLen = length(across);
      vec2 unit = acrossLen > 1e-8 ? across / acrossLen : vec2(0.0, 0.0);
      vec2 along = vec2(-unit.y, unit.x);
      float coverT = uAaBias * mix(threshold, farScale, sentinel);
      float cover = smoothstep(coverT, coverT * 5.0, depthStep) * uAaAmount;
      vec3 tapA = texture2D(tDiffuse, inFrame(vUv + along * px)).rgb;
      vec3 tapB = texture2D(tDiffuse, inFrame(vUv - along * px)).rgb;
      vec3 softened = mix(colour.rgb, (colour.rgb * 2.0 + tapA + tapB) * 0.25, cover);

      /* Ink, with soft thresholds: a hard edged line on a smoothed
       * silhouette is worse than none. Folds only near the camera, where
       * they read as drawing rather than as wireframe. */
      float inkT = uDepthBias * threshold;
      float silhouette = smoothstep(inkT, inkT * 1.7, depthStep);
      float closeBy = 1.0 - smoothstep(0.010, 0.055, dHere);
      float crease = smoothstep(uNormalBias, uNormalBias * 1.35, fold) * closeBy;
      float ink = clamp(max(silhouette, crease), 0.0, 1.0) * uStrength * (1.0 - max(sentinel, nearSentinel));
      /* Never on the sky, and fading out over the far distance. */
      ink *= step(dHere, 0.999) * (1.0 - smoothstep(0.16, 0.42, dHere));

      gl_FragColor = vec4(mix(softened, uLineColor, ink), colour.a);
    }
  `,
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uDistort: { value: 0.055 },
    uVignette: { value: 0.16 },
    uVibrance: { value: 0.22 },
  },
  vertexShader: QUAD_VERTEX,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uDistort;
    uniform float uVignette;
    uniform float uVibrance;

    void main() {
      /* Barrel distortion, scaled so the corners still sample inside. */
      vec2 c = vUv - 0.5;
      float rr = dot(c, c);
      vec3 rgb = texture2D(tDiffuse, 0.5 + c * (1.0 + uDistort * rr) / (1.0 + uDistort * 0.5)).rgb;

      /* A shoulder over 0.8, so skies and bloom roll off and keep hue. */
      vec3 over = max(rgb - 0.8, vec3(0.0));
      rgb = min(rgb, vec3(0.8)) + over / (1.0 + over);

      /* Cool blacks, warm lights, kept shallow so the ink stays black. */
      vec3 floorTint = vec3(0.006, 0.009, 0.021);
      rgb = rgb * (1.0 - floorTint) + floorTint;
      rgb *= vec3(1.045, 1.010, 0.965);

      /* Vibrance: most saturation added where there is least. */
      float top = max(rgb.r, max(rgb.g, rgb.b));
      float bottom = min(rgb.r, min(rgb.g, rgb.b));
      float saturation = top > 0.001 ? (top - bottom) / top : 0.0;
      float grey = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
      rgb = mix(vec3(grey), rgb, 1.0 + uVibrance * (1.0 - saturation));

      /* A wide shallow vignette. */
      rgb *= 1.0 - uVignette * smoothstep(0.18, 0.52, rr);

      /* sRGB out, three's own curve; the renderer does no tone mapping. */
      rgb = clamp(rgb, vec3(0.0), vec3(1.0));
      vec3 linearPart = rgb * 12.92;
      vec3 curvePart = 1.055 * pow(rgb, vec3(0.41666667)) - 0.055;
      gl_FragColor = vec4(mix(linearPart, curvePart, step(vec3(0.0031308), rgb)), 1.0);
    }
  `,
};

/*
 * Contrast adaptive sharpening, after AMD's CAS: five taps, weighted least
 * where the neighbourhood is already near black or white, so edges firm
 * up without haloes and flat sky stays flat. Fixed strength, so a step in
 * resolution does not change the look mid flight.
 */
const SharpenShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTexel: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: QUAD_VERTEX,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    varying vec2 vUv;
    void main() {
      vec3 mid = texture2D(tDiffuse, vUv).rgb;
      vec3 up = texture2D(tDiffuse, vUv + vec2(0.0, uTexel.y)).rgb;
      vec3 down = texture2D(tDiffuse, vUv - vec2(0.0, uTexel.y)).rgb;
      vec3 right = texture2D(tDiffuse, vUv + vec2(uTexel.x, 0.0)).rgb;
      vec3 left = texture2D(tDiffuse, vUv - vec2(uTexel.x, 0.0)).rgb;
      vec3 lo = min(mid, min(min(up, down), min(right, left)));
      vec3 hi = max(mid, max(max(up, down), max(right, left)));
      vec3 headroom = sqrt(clamp(min(lo, 1.0 - hi) / max(hi, vec3(1e-4)), 0.0, 1.0));
      vec3 w = headroom * (-1.0 / 6.5);
      gl_FragColor = vec4((mid + (up + down + right + left) * w) / (1.0 + 4.0 * w), 1.0);
    }
  `,
};

/* The sharpen pass, disabled until dynamic resolution drops below native
 * (the composer then hands the screen to the pass before it). */
export function makeSharpenPass() {
  const pass = new ShaderPass(SharpenShader);
  pass.enabled = false;
  return pass;
}

/* The sharpen pass's texel, for a buffer of width by height at `ratio`. */
export function sizeSharpenPass(pass, width, height, ratio) {
  const pixels = (n) => Math.max(1, Math.floor(n * ratio));
  pass.material.uniforms.uTexel.value.set(1 / pixels(width), 1 / pixels(height));
}

/*
 * Layers. 0 is drawn and inked. 1 is drawn but never inked (sky, water,
 * flowers, the gate ring, halo and glow). The prepass also writes depth,
 * with the no ink sentinel, for layer 2 and for PREPASS_DEPTH_LAYER, onto
 * which promoteOccluders lifts the layer 1 objects that hide what is
 * behind them, so the ink and the coverage agree with the picture: a
 * submerged trunk is no longer inked through the water, and the gate
 * ring's own edge gets coverage. The sky and the additive glow write no
 * depth and stay out: in, the sky's tessellation and the glow's flat
 * square measured worse on the very edges this exists for.
 */
const PREPASS_DEPTH_LAYER = 3;
const LAYER_0 = 1 << 0;
const LAYER_1 = 1 << 1;

/*
 * Lifts the layer 1 meshes that are occluders onto PREPASS_DEPTH_LAYER,
 * keeping layer 1 so the colour pass still draws them. An occluder is what
 * its materials say: every one writes depth and blends normally. A mesh on
 * layer 0 as well is already inked and left alone. Once per composer: the
 * world is complete before the composer is built, and anything added later
 * would miss the prepass.
 */
function promoteOccluders(scene) {
  scene.traverse((o) => {
    if (!o.isMesh || !(o.layers.mask & LAYER_1) || (o.layers.mask & LAYER_0)) {
      return;
    }
    const occludes = [o.material].flat().every((m) => m && m.depthWrite !== false && (m.blending === undefined || m.blending === THREE.NormalBlending));
    if (occludes) {
      o.layers.enable(PREPASS_DEPTH_LAYER);
    }
  });
}

/* Every target the bloom pass keeps. */
function bloomLadder(bloom) {
  return [bloom.renderTargetBright, ...(bloom.renderTargetsHorizontal || []), ...(bloom.renderTargetsVertical || [])].filter(Boolean);
}

/* Bloom's targets only ever receive full screen quads, so their default
 * depth buffers (7.6 MB measured) are dropped. */
function bloomWithoutDepth(bloom) {
  for (const target of bloomLadder(bloom)) {
    target.depthBuffer = false;
  }
}

/*
 * The chain for one world. quality is a preset (src/render/quality.js):
 * its field.outline and field.bloom, either left out meaning on, decide
 * the ink and the bloom; with no preset both are on. Returns { render,
 * setSize, sharpen, dispose, outline, bloom, grade, composer, normalTarget };
 * budget.js reads the targets to count them.
 */
export function buildComposer(renderer, scene, camera, quality) {
  const css = renderer.getSize(new THREE.Vector2());
  const ratio = renderer.getPixelRatio();
  const w = Math.max(1, Math.floor(css.x * ratio));
  const h = Math.max(1, Math.floor(css.y * ratio));
  const field = quality && quality.field ? quality.field : null;
  const inked = !field || field.outline !== false;
  const blooms = !field || field.bloom !== false;

  /*
   * The prepass's own target (writing it from the composer's would read
   * and write one framebuffer). It clears to rg zero and depth one,
   * (0, 0, 1, 0), which unpacks to exactly the far plane where nothing
   * drew. Both prepass materials share the near and far uniforms.
   */
  const prepass = inked ? {
    target: new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }),
    planes: { uNear: { value: camera.near }, uFar: { value: camera.far } },
  } : null;
  if (prepass) {
    const material = (noInk) => new THREE.ShaderMaterial({ uniforms: prepass.planes, vertexShader: PREPASS_VERTEX, fragmentShader: prepassFragment(noInk) });
    prepass.inked = material(false);
    prepass.depthOnly = material(true);
  }
  const CLEAR_TO_FAR = new THREE.Color(0, 0, 1);

  /* Half float, so the grade's shoulder and bloom's threshold see linear
   * values without crushing the sky's dark end; no multisampling (see the
   * header). */
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType }));
  composer.addPass(new RenderPass(scene, camera));
  let outline = null;
  if (inked) {
    outline = new ShaderPass(InkShader);
    outline.uniforms.tGeo.value = prepass.target.texture;
    outline.uniforms.uResolution.value.set(w, h);
    composer.addPass(outline);
  }
  /* Threshold 0.78 on linear luminance: the gate rings sit near 0.70 and
   * pass with the warm horizon, mid greens do not. */
  let bloom = null;
  if (blooms) {
    bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.28, 0.55, 0.78);
    bloomWithoutDepth(bloom);
    composer.addPass(bloom);
  }
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  const sharpen = makeSharpenPass();
  composer.addPass(sharpen);
  sizeSharpenPass(sharpen, w, h, 1);

  /*
   * The scene is drawn into the composer's read buffer; the write buffer
   * only receives quads and needs no depth (8.3 MB at 1080p). That holds
   * only while the swapping passes are even in number; an odd count swaps
   * the pair every frame and both need depth.
   */
  if (composer.passes.filter((p) => p.needsSwap).length % 2 === 0) {
    composer.writeBuffer.depthBuffer = false;
  }
  if (inked) {
    promoteOccluders(scene);
  }

  /*
   * The prepass: inked layer 0 first, then the no ink depth (layers 2 and
   * PREPASS_DEPTH_LAYER) into the same target. Sky, fog and the shadow map
   * update are off for it (its materials sample no shadow), and every bit
   * of state it touches is put back, the camera's layer mask as the raw
   * value: rebuilding it once left the colour pass looking at nothing but
   * the sky. The saved colour is kept, not allocated, since this runs every
   * frame.
   */
  const keptClear = new THREE.Color();
  function drawPrepass() {
    if (!prepass) {
      return;
    }
    const kept = {
      background: scene.background,
      fog: scene.fog,
      override: scene.overrideMaterial,
      autoClear: renderer.autoClear,
      clearAlpha: renderer.getClearAlpha(),
      shadows: renderer.shadowMap.autoUpdate,
      mask: camera.layers.mask,
    };
    renderer.getClearColor(keptClear);
    scene.background = null;
    scene.fog = null;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(prepass.target);
    renderer.setClearColor(CLEAR_TO_FAR, 0);
    prepass.planes.uNear.value = camera.near;
    prepass.planes.uFar.value = camera.far;

    scene.overrideMaterial = prepass.inked;
    camera.layers.mask = LAYER_0;
    renderer.clear();
    renderer.render(scene, camera);

    scene.overrideMaterial = prepass.depthOnly;
    camera.layers.mask = (1 << 2) | (1 << PREPASS_DEPTH_LAYER);
    renderer.autoClear = false;
    renderer.render(scene, camera);

    renderer.autoClear = kept.autoClear;
    renderer.setRenderTarget(null);
    renderer.setClearColor(keptClear, kept.clearAlpha);
    camera.layers.mask = kept.mask;
    renderer.shadowMap.autoUpdate = kept.shadows;
    scene.overrideMaterial = kept.override;
    scene.background = kept.background;
    scene.fog = kept.fog;
  }

  /*
   * Resizes the whole chain to width by height CSS pixels at the
   * renderer's current pixel ratio. The composer's ratio is set first: it
   * multiplies by the ratio it was built with otherwise, and the Render
   * scale slider once shrank the canvas while four passes stayed full size.
   */
  function setSize(width, height) {
    const now = renderer.getPixelRatio();
    composer.setPixelRatio(now);
    composer.setSize(width, height);
    sizeSharpenPass(sharpen, width, height, now);
    const bw = Math.max(1, Math.floor(width * now));
    const bh = Math.max(1, Math.floor(height * now));
    if (prepass) {
      prepass.target.setSize(bw, bh);
    }
    if (outline) {
      outline.uniforms.uResolution.value.set(bw, bh);
    }
    if (bloom) {
      bloomWithoutDepth(bloom);
    }
  }

  /*
   * Frees what the chain owns: the targets, and the pass materials too,
   * since three frees a compiled program only with its material. Bloom
   * frees its own ladder. ShaderPass.dispose is not used: it would also
   * free the full screen quad's geometry, which every pass module shares.
   */
  function dispose() {
    composer.renderTarget1.dispose();
    composer.renderTarget2.dispose();
    prepass?.target.dispose();
    bloom?.dispose();
    outline?.material.dispose();
    grade.material.dispose();
    sharpen.material.dispose();
    composer.copyPass.material.dispose();
    prepass?.inked.dispose();
    prepass?.depthOnly.dispose();
  }

  return {
    render() {
      drawPrepass();
      composer.render();
    },
    setSize,
    sharpen,
    dispose,
    outline,
    bloom,
    grade,
    composer,
    normalTarget: prepass ? prepass.target : null,
  };
}

/*
 * Gives a built world its chain, sized to the shell's canvas, and a
 * dispose that frees the chain and then the world. Returns the map.
 */
export function attachComposer(shell, map, q) {
  const post = buildComposer(shell.renderer, map.scene, shell.camera, q);
  const { w, h } = shell.resize();
  post.setSize(w, h);
  const freeWorld = map.dispose;
  map.post = post;
  map.dispose = () => {
    post.dispose();
    freeWorld();
  };
  return map;
}
