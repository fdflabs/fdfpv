/*
 * impostor.js: trees too far off to draw as trees, drawn as pictures of
 * trees that turn to face the camera.
 *
 * At load every variant's full model is photographed from eight sides at
 * three heights (level, forty degrees and seventy five degrees down) into
 * one atlas of colour and one of normals, 128 pixels a view. A far tree
 * is one quad: it faces the camera, picks the four views nearest the
 * direction it is seen from, and blends them, so it turns smoothly as the
 * camera goes round it and flattens into its top view as the camera
 * climbs over it. The normals are the crown's own bent normals, in the
 * tree's frame, so a far forest is lit by the same sun and sky as the
 * near one and its shadowed side is on the same side.
 *
 * The quad is pulled toward the camera to the front of the tree's
 * bounding sphere and shrunk to keep its size on screen: a picture
 * standing at the trunk sinks into the hillside behind a tree on a slope.
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
import { DITHER_GLSL, LEAF_SPEC_GLSL } from './plantmat.js';

export const AZIMUTHS = 8;
export const ELEVATIONS = [0, 40, 75].map((d) => (d * Math.PI) / 180);
const PER_VARIANT = AZIMUTHS * ELEVATIONS.length;
const GRID = 16;
export const MAX_VARIANTS = Math.floor((GRID * GRID) / PER_VARIANT);

const BAKE_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vC;
void main() {
  vUv = uv;
  vN = normal;
  vC = color;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const BAKE_FRAG = /* glsl */ `
uniform sampler2D map;
uniform float uNormalPass;
uniform float uCut;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vC;
void main() {
  vec4 t = texture2D(map, vUv);
  if (t.a < uCut) discard;
  gl_FragColor = uNormalPass > 0.5 ? vec4(normalize(vN) * 0.5 + 0.5, 1.0) : vec4(t.rgb * vC, 1.0);
}
`;

function bakeMaterial(map, cut) {
  return new THREE.ShaderMaterial({
    vertexShader: BAKE_VERT,
    fragmentShader: BAKE_FRAG,
    uniforms: { map: { value: map }, uNormalPass: { value: 0 }, uCut: { value: cut } },
    vertexColors: true,
    side: THREE.DoubleSide,
  });
}

/*
 * Photograph the variants. `builds` is buildVariant's output at 'near'
 * for each, `maps` the foliage atlas and the bark map. Returns the two
 * atlases as textures, the per variant sphere (radius, centre height)
 * the quads are sized by, and dispose().
 */
export function bakeImpostors(renderer, builds, maps, frame = 128) {
  if (builds.length > MAX_VARIANTS) {
    throw new Error(`swiss2 impostors: ${builds.length} variants, the atlas holds ${MAX_VARIANTS}`);
  }
  const size = frame * GRID;
  const make = (colorSpace) => {
    const rt = new THREE.WebGLRenderTarget(size, size, {
      colorSpace,
      generateMipmaps: false,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
    });
    rt.texture.anisotropy = 4;
    return rt;
  };
  const albedo = make(THREE.SRGBColorSpace);
  const normal = make(THREE.NoColorSpace);
  const foliageMat = bakeMaterial(maps.foliage, 0.5);
  const barkMat = bakeMaterial(maps.bark, 0);
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);

  const saved = {
    target: renderer.getRenderTarget(),
    autoClear: renderer.autoClear,
    clear: renderer.getClearColor(new THREE.Color()),
    alpha: renderer.getClearAlpha(),
  };
  renderer.autoClear = false;
  const info = [];
  /* The albedo is cleared to black with no alpha, so a mip that averages
   * leaf and gap holds the leaf colour times its coverage, and the far
   * tree divides the coverage back out: cleared to a dark green, the gaps
   * bled into every far crown's edge as a dark rim. */
  const passes = [[albedo, 0, 0x000000], [normal, 1, 0x80c080]];
  for (const [rt, pass, clear] of passes) {
    renderer.setRenderTarget(rt);
    rt.scissorTest = false;
    rt.viewport.set(0, 0, size, size);
    renderer.setRenderTarget(rt);
    renderer.setClearColor(clear, 0);
    renderer.clear(true, true, true);
    foliageMat.uniforms.uNormalPass.value = pass;
    barkMat.uniforms.uNormalPass.value = pass;
    builds.forEach((b, v) => {
      scene.clear();
      scene.add(new THREE.Mesh(b.foliage, foliageMat));
      if (b.bark) {
        scene.add(new THREE.Mesh(b.bark, barkMat));
      }
      const R = b.radius;
      const centre = new THREE.Vector3(0, b.cy, 0);
      info[v] = { radius: R, cy: b.cy };
      cam.left = -R;
      cam.right = R;
      cam.top = R;
      cam.bottom = -R;
      cam.near = 0.1;
      cam.far = 4 * R;
      cam.updateProjectionMatrix();
      ELEVATIONS.forEach((el, e) => {
        for (let a = 0; a < AZIMUTHS; a += 1) {
          const az = (a / AZIMUTHS) * Math.PI * 2;
          const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
          cam.position.copy(centre).addScaledVector(dir, 2 * R);
          cam.up.set(0, 1, 0);
          cam.lookAt(centre);
          cam.updateMatrixWorld();
          const f = v * PER_VARIANT + e * AZIMUTHS + a;
          const x = (f % GRID) * frame;
          const y = Math.floor(f / GRID) * frame;
          rt.viewport.set(x, y, frame, frame);
          rt.scissor.set(x, y, frame, frame);
          rt.scissorTest = true;
          renderer.setRenderTarget(rt);
          renderer.render(scene, cam);
        }
      });
    });
    rt.scissorTest = false;
    rt.viewport.set(0, 0, size, size);
    rt.texture.generateMipmaps = true;
    renderer.setRenderTarget(rt);
    /* A render with nothing in it, to have three build the mip chain
     * once rather than after each of the 240 views. */
    scene.clear();
    renderer.render(scene, cam);
    rt.texture.generateMipmaps = false;
  }
  renderer.setRenderTarget(saved.target);
  renderer.autoClear = saved.autoClear;
  renderer.setClearColor(saved.clear, saved.alpha);
  foliageMat.dispose();
  barkMat.dispose();
  return {
    albedo: albedo.texture,
    normal: normal.texture,
    info,
    frame,
    dispose() {
      albedo.dispose();
      normal.dispose();
    },
  };
}

/* The billboard's vertex stage, shared by the far trees and their
 * shadow. Drawn, a tree faces the camera and is pulled to the front of
 * its sphere; in the shadow pass it faces the sun (uImpLight, the
 * cascade's camera being orthographic) and its band is read from the
 * viewer (uImpView), not from the light. */
function billboardVertex(shadow) {
  const el1 = ELEVATIONS[1].toFixed(5);
  const el2 = ELEVATIONS[2].toFixed(5);
  return {
    pars: `
        ${DITHER_GLSL}
        attribute vec4 aTree;
        attribute vec2 aTree2;
        uniform vec4 uVar[${MAX_VARIANTS}];
        uniform vec4 uBand;
        uniform vec3 uImpLight;
        uniform vec3 uImpView;
        varying vec2 vImpUv;
        varying vec4 vImpF;
        varying vec4 vImpW;
        varying vec2 vImpYaw;
        varying float vPlantDist;
        varying float vImpTint;`,
    body: `
        vec4 vi = uVar[int(aTree2.y + 0.5)];
        float S = aTree.w;
        vec3 centre = aTree.xyz + vec3(0.0, vi.y * S, 0.0);
        ${shadow ? `
        vec3 V = uImpLight;
        float dist = 1e5;
        vPlantDist = distance(uImpView, aTree.xyz + vec3(0.0, 10.0 * S, 0.0));` : `
        vec3 toCam = cameraPosition - centre;
        float dist = max(length(toCam), 1e-3);
        vec3 V = toCam / dist;
        vPlantDist = distance(cameraPosition, aTree.xyz + vec3(0.0, 10.0 * S, 0.0));`}
        float cy = cos(aTree2.x);
        float sy = sin(aTree2.x);
        vec3 Vo = vec3(cy * V.x - sy * V.z, V.y, sy * V.x + cy * V.z);
        float af = fract(atan(Vo.x, Vo.z) / 6.2831853 + 1.0) * ${AZIMUTHS}.0;
        float a0 = floor(af);
        float wa = af - a0;
        float a1 = mod(a0 + 1.0, ${AZIMUTHS}.0);
        float el = asin(clamp(Vo.y, 0.0, 1.0));
        float ef = el < ${el1} ? el / ${el1} : 1.0 + (el - ${el1}) / (${el2} - ${el1});
        ef = clamp(ef, 0.0, 1.999);
        float e0 = floor(ef);
        float we = ef - e0;
        float e1 = min(e0 + 1.0, 2.0);
        float fb = aTree2.y * ${PER_VARIANT}.0;
        vImpF = vec4(fb + e0 * ${AZIMUTHS}.0 + a0, fb + e0 * ${AZIMUTHS}.0 + a1, fb + e1 * ${AZIMUTHS}.0 + a0, fb + e1 * ${AZIMUTHS}.0 + a1);
        vImpW = vec4((1.0 - wa) * (1.0 - we), wa * (1.0 - we), (1.0 - wa) * we, wa * we);
        vec3 right = cross(vec3(0.0, 1.0, 0.0), V);
        float rl = length(right);
        right = rl > 1e-3 ? right / rl : vec3(1.0, 0.0, 0.0);
        vec3 upv = cross(V, right);
        float R = vi.x * S;
        float pull = min(R * 0.6, dist * 0.5);
        float k = (dist - pull) / dist;
        vec3 transformed = centre + V * pull + (position.x * right + position.y * upv) * R * k;
        ${shadow
    ? '/* A tree the models draw casts its own shadow. */\n        if (vPlantDist < 0.5 * (uBand.x + uBand.y)) {'
    : 'if (plantOut(vPlantDist, uBand)) {'}
          transformed = centre;
        }
        vImpUv = position.xy * 0.5 + 0.5;
        vImpYaw = vec2(cy, sy);
        vImpTint = 0.9 + 0.2 * fract(sin(dot(aTree.xz, vec2(12.9898, 78.233))) * 43758.5453);`,
  };
}

const IMP_FRAME_GLSL = `
        uniform sampler2D uAlbedo;
        uniform float uPad;
        varying vec2 vImpUv;
        varying vec4 vImpF;
        varying vec4 vImpW;
        vec2 impFrame(float f) {
          vec2 cell = vec2(mod(f, ${GRID}.0), floor(f / ${GRID}.0));
          return (cell + uPad + vImpUv * (1.0 - 2.0 * uPad)) / ${GRID}.0;
        }
        vec4 impAlbedo() {
          return texture2D(uAlbedo, impFrame(vImpF.x)) * vImpW.x + texture2D(uAlbedo, impFrame(vImpF.y)) * vImpW.y
            + texture2D(uAlbedo, impFrame(vImpF.z)) * vImpW.z + texture2D(uAlbedo, impFrame(vImpF.w)) * vImpW.w;
        }`;

function impostorUniforms(baked, band) {
  const vars = [];
  for (let v = 0; v < MAX_VARIANTS; v += 1) {
    const i = baked.info[v] || { radius: 1, cy: 0 };
    vars.push(new THREE.Vector4(i.radius, i.cy, 0, 0));
  }
  return {
    uAlbedo: { value: baked.albedo },
    uNormalAtlas: { value: baked.normal },
    uVar: { value: vars },
    uBand: { value: new THREE.Vector4(...band) },
    uPad: { value: 1.5 / baked.frame },
    uImpLight: { value: new THREE.Vector3(0, 1, 0) },
    uImpView: { value: new THREE.Vector3() },
  };
}

/*
 * The material far trees are drawn with: three's standard material, its
 * vertex stage replaced by the billboard and its colour and normal read
 * from the atlases. `band` is the distance band it draws in.
 */
export function impostorMaterial(baked, band, envMapIntensity = 0.85) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, envMapIntensity });
  const uniforms = impostorUniforms(baked, band);
  mat.userData.impostor = uniforms;
  const vert = billboardVertex(false);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${vert.pars}`)
      .replace('#include <begin_vertex>', vert.body);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${DITHER_GLSL}
        ${IMP_FRAME_GLSL}
        uniform sampler2D uNormalAtlas;
        uniform vec4 uBand;
        varying vec2 vImpYaw;
        varying float vPlantDist;
        varying float vImpTint;`)
      .replace('#include <clipping_planes_fragment>', `
        if (!plantKeep(plantHash(gl_FragCoord.xy), vPlantDist, uBand)) discard;
        #include <clipping_planes_fragment>`)
      .replace('#include <map_fragment>', `
        vec2 f0 = impFrame(vImpF.x);
        vec2 f1 = impFrame(vImpF.y);
        vec2 f2 = impFrame(vImpF.z);
        vec2 f3 = impFrame(vImpF.w);
        vec4 impA = impAlbedo();
        /* Mips average the coverage away: lift the alpha by how far down
         * the chain this pixel reads, so a far forest stays as dense as a
         * near one. */
        vec2 texel = fwidth(vImpUv) * float(textureSize(uAlbedo, 0).x) / ${GRID}.0;
        float lod = max(0.0, log2(max(max(texel.x, texel.y), 1e-4)));
        if (impA.a * (1.0 + 0.3 * lod) < 0.5) discard;
        diffuseColor.rgb = impA.rgb / max(impA.a, 0.05) * vImpTint;
        vec3 impN = (texture2D(uNormalAtlas, f0).xyz * vImpW.x + texture2D(uNormalAtlas, f1).xyz * vImpW.y
          + texture2D(uNormalAtlas, f2).xyz * vImpW.z + texture2D(uNormalAtlas, f3).xyz * vImpW.w) * 2.0 - 1.0;
        impN = normalize(vec3(vImpYaw.x * impN.x + vImpYaw.y * impN.z, impN.y, -vImpYaw.y * impN.x + vImpYaw.x * impN.z));
        vec3 impNormalView = normalize((viewMatrix * vec4(impN, 0.0)).xyz);`)
      .replace('#include <lights_physical_fragment>', LEAF_SPEC_GLSL)
      .replace('#include <normal_fragment_begin>', `
        float faceDirection = 1.0;
        vec3 normal = impNormalView;
        vec3 nonPerturbedNormal = normal;`);
  };
  mat.customProgramCacheKey = () => 'swiss2-impostor';
  return mat;
}

/*
 * Their shadow. A far tree with no shadow under it floats on the floor:
 * seen from the air past the models' band, every tree along the stream
 * was a dark ball on an unbroken lawn. The same billboard turned to the
 * sun and cut by the same alpha writes the shadow maps, for the trees
 * past the models' band only; `material` is the drawn impostor material,
 * whose uniforms this shares.
 */
export function impostorDepthMaterial(material) {
  const uniforms = material.userData.impostor;
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  const vert = billboardVertex(true);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${vert.pars}`)
      .replace('#include <begin_vertex>', vert.body);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${IMP_FRAME_GLSL}`)
      .replace('#include <clipping_planes_fragment>', `
        if (impAlbedo().a < 0.5) discard;
        #include <clipping_planes_fragment>`);
  };
  mat.customProgramCacheKey = () => 'swiss2-impostor-depth';
  return mat;
}

/*
 * One draw of far trees: a quad instanced over `trees` (indices into the
 * forest's arrays), with its bounding sphere round the chunk so three
 * culls it when it is out of view.
 */
export function impostorMesh(forest, indices, material, depth = null) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const a = new Float32Array(indices.length * 4);
  const b = new Float32Array(indices.length * 2);
  const box = new THREE.Box3();
  const p = new THREE.Vector3();
  let rMax = 0;
  indices.forEach((t, k) => {
    a[k * 4] = forest.x[t];
    a[k * 4 + 1] = forest.y[t];
    a[k * 4 + 2] = forest.z[t];
    a[k * 4 + 3] = forest.s[t];
    b[k * 2] = forest.yaw[t];
    b[k * 2 + 1] = forest.v[t];
    box.expandByPoint(p.set(forest.x[t], forest.y[t], forest.z[t]));
    rMax = Math.max(rMax, forest.s[t] * 32);
  });
  geo.setAttribute('aTree', new THREE.InstancedBufferAttribute(a, 4));
  geo.setAttribute('aTree2', new THREE.InstancedBufferAttribute(b, 2));
  geo.instanceCount = indices.length;
  geo.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  geo.boundingSphere.radius += rMax;
  geo.boundingBox = box.expandByScalar(rMax);
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.castShadow = Boolean(depth);
  if (depth) {
    mesh.customDepthMaterial = depth;
  }
  mesh.name = 'swiss2-impostors';
  return mesh;
}
