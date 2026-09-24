/*
 * paint.js: cel materials whose colour is worked out per pixel, and the two
 * instanced particle materials (steam, and water in the air).
 *
 * A hot spring's rings, a bacterial mat's runoff channels, a river's banks
 * and a canyon wall's bands are all shapes smaller than the grid they are
 * laid on, so their colour cannot live in the vertices. paintMaterial takes
 * the house celMaterial and replaces its flat diffuse colour with a GLSL
 * body that reads the world position (and any vertex attributes it names)
 * and may discard. Everything else, the banded ramp, the rim, the fog, the
 * shadows, is celMaterial's own, so a pool sits in the same light as the
 * ground it is painted on.
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
import { celMaterial } from '../../../render/celmat.js';

/* Value noise and a few helpers every paint body can call. */
export const PAINT_GLSL = /* glsl */ `
  float ysHash(vec2 p) {
    p = fract(p * vec2(127.13, 311.71));
    p += dot(p, p + 19.19);
    return fract(p.x * p.y);
  }
  float ysNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(ysHash(i), ysHash(i + vec2(1.0, 0.0)), f.x),
               mix(ysHash(i + vec2(0.0, 1.0)), ysHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float ysFbm(vec2 p) {
    return ysNoise(p) * 0.55 + ysNoise(p * 2.13 + 7.1) * 0.3 + ysNoise(p * 4.37 + 3.3) * 0.15;
  }
  vec3 ysRgb(float r, float g, float b) {
    return vec3(r, g, b);
  }
`;

/*
 * Depth bias, in polygon offset units, of each layer of surface laid
 * exactly on the ground, bottom to top. Measured on the stand in: a
 * difference of one unit between two coplanar layers still fought in
 * stripes at 250 m under SwiftShader, so the layers are four apart.
 */
export const LAYER = { sinter: 2, patch: 6, pools: 10, water: 14 };

/*
 * opts: key (required: names the program), attrs (GLSL declarations of
 * vertex attributes, each also passed on as a varying of the same name with
 * a v prefix, e.g. 'vec2 aPaint' gives vPaint... see below), uniforms,
 * glsl (helper functions), body (sets `vec3 paint` and may discard), and any
 * celMaterial option. `bias` pulls the surface toward the camera in depth
 * only (polygon offset units), for a surface that lies exactly on the
 * ground.
 *
 * Attributes are declared as 'float aFoo' or 'vec2 aFoo' and read in the
 * body as vFoo.
 */
export function paintMaterial(opts) {
  if (!opts.key) {
    throw new Error('paint: a paint material needs a key, it names the program');
  }
  const attrs = (opts.attrs ?? []).map((a) => {
    const [type, name] = a.trim().split(/\s+/);
    return { type, name, vary: `v${name.slice(1)}` };
  });
  const mat = celMaterial({ ...opts.cel, color: 0xffffff, key: `ys-paint-${opts.key}` });
  if (opts.transparent) {
    mat.transparent = true;
    mat.depthWrite = false;
  }
  if (opts.bias) {
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -1;
    mat.polygonOffsetUnits = -opts.bias;
  }
  const uniforms = opts.uniforms ?? {};
  const vDecl = attrs.map((a) => `attribute ${a.type} ${a.name};\nvarying ${a.type} ${a.vary};`).join('\n');
  const vBody = attrs.map((a) => `${a.vary} = ${a.name};`).join('\n');
  const fDecl = [
    ...attrs.map((a) => `varying ${a.type} ${a.vary};`),
    ...Object.entries(uniforms).map(([n, u]) => `uniform ${glslType(u.value)} ${n};`),
  ].join('\n');
  const inject = /* glsl */ `
    {
      vec3 paint = vec3(1.0);
      float paintAlpha = 1.0;
      ${opts.body}
      diffuseColor.rgb *= paint;
      diffuseColor.a *= paintAlpha;
    }
  `;
  const helpers = `${PAINT_GLSL}\n${opts.glsl ?? ''}`;
  const base = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    base(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${vDecl}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${vBody}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_pars_fragment>', `#include <color_pars_fragment>\n${fDecl}\n${helpers}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${inject}`);
  };
  /* The injected source is the program: see the long note on
   * customProgramCacheKey in celmat.js. Two paints with the same celmat
   * key but different bodies must never share a program. */
  const baseKey = mat.customProgramCacheKey();
  mat.customProgramCacheKey = () => `${baseKey}|${vDecl}|${fDecl}|${helpers}|${inject}`;
  mat.userData.celKey = `ys-paint-${opts.key}`;
  mat.userData.paintUniforms = uniforms;
  return mat;
}

function glslType(v) {
  if (typeof v === 'number') {
    return 'float';
  }
  if (v && v.isVector2) {
    return 'vec2';
  }
  if (v && v.isVector3) {
    return 'vec3';
  }
  if (v && v.isVector4) {
    return 'vec4';
  }
  if (v && v.isColor) {
    return 'vec3';
  }
  throw new Error('paint: uniform type not handled');
}

/*
 * THE PARTICLE MATERIALS. A puff of steam or a gout of water is a low
 * icosahedron, instanced, moved entirely in the vertex shader from
 * per instance attributes and a time uniform, so ten thousand of them cost
 * one draw and no JavaScript per frame. Shaded like scene.js's clouds: a
 * hard painted terminator keyed to the sun, a cool underside, so steam is
 * a drawn shape in the same hand as the clouds and not a soft sprite from
 * another game.
 *
 * `motion` is a GLSL body that, from the instance attributes and uTime,
 * sets `vec3 centre`, `float size` (metres, 0 hides the instance) and
 * `float alpha`, and may set `vec3 tint`.
 */
export function particleMaterial({ key, attrs, uniforms = {}, glsl = '', motion, opacity = 1, lit = 0xffffff, shade = 0xb4c2d6, sunDir }) {
  const u = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uTime: { value: 0 },
    uLit: { value: new THREE.Color(lit) },
    uShade: { value: new THREE.Color(shade) },
    uSun: { value: (sunDir ?? new THREE.Vector3(0.45, 0.62, 0.64)).clone().normalize() },
    uOpacity: { value: opacity },
    uFade: { value: new THREE.Vector2(0, 0) },
    uSquash: { value: 1 },
    uSoft: { value: opacity < 1 ? 1 : 0 },
    ...uniforms,
  };
  const uDecl = Object.entries(uniforms).map(([n, v]) => `uniform ${glslType(v.value)} ${n};`).join('\n');
  const aDecl = attrs.map((a) => `attribute ${a};`).join('\n');
  const mat = new THREE.ShaderMaterial({
    name: `ys-particles-${key}`,
    uniforms: u,
    fog: true,
    transparent: opacity < 1,
    depthWrite: opacity >= 1,
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      uniform float uTime;
      uniform vec2 uFade;
      uniform float uSquash;
      ${uDecl}
      ${aDecl}
      varying vec3 vN;
      varying vec3 vView;
      varying float vAlpha;
      varying vec3 vTint;
      ${PAINT_GLSL}
      ${glsl}
      void main() {
        vec3 centre = vec3(0.0);
        float size = 1.0;
        float alpha = 1.0;
        vec3 tint = vec3(1.0);
        ${motion}
        /* uFade (a, b): with a < b a far plume thins out as the camera
         * comes within b, where the near steam has taken over; with a > b
         * near steam thins out as the camera goes beyond b. Faded puffs
         * shrink to nothing so they cost no fill. */
        if (uFade.y > 0.0) {
          float fd = distance(centre, cameraPosition);
          float fk = uFade.x < uFade.y ? smoothstep(uFade.x, uFade.y, fd) : 1.0 - smoothstep(uFade.y, uFade.x, fd);
          alpha *= fk;
          size *= step(0.001, fk);
        }
        vAlpha = alpha;
        vTint = tint;
        vN = normalize(normal);
        vec3 transformed = centre + position * vec3(1.0, uSquash, 1.0) * size;
        vView = normalize(cameraPosition - transformed);
        vec4 mvPosition = viewMatrix * vec4(transformed, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uLit;
      uniform vec3 uShade;
      uniform vec3 uSun;
      uniform float uOpacity;
      varying vec3 vN;
      varying vec3 vView;
      varying float vAlpha;
      varying vec3 vTint;
      uniform float uSoft;
      void main() {
        if (vAlpha <= 0.003) {
          discard;
        }
        vec3 n = normalize(vN);
        /* scene.js's clouds: a painted terminator keyed to world up,
         * leaned toward the sun, so the underside of every puff is a cool
         * shadow shape and a plume reads as a stack of volumes. */
        float l = dot(n, normalize(uSun + vec3(0.0, 1.6, 0.0)));
        vec3 col = mix(uShade, uLit, smoothstep(0.02 - uSoft * 0.3, 0.1 + uSoft * 0.35, l));
        /* Soft puffs thin toward their silhouettes, so where they overlap
         * no outline shows through another and a plume is one body, not
         * a heap of glass balls. Drops of water keep a hard edge. */
        float rim = clamp(dot(n, normalize(vView)), 0.0, 1.0);
        float a = vAlpha * uOpacity * mix(1.0, smoothstep(0.0, 0.65, rim), uSoft);
        gl_FragColor = vec4(col * vTint, a);
        #include <fog_fragment>
      }
    `,
  });
  mat.userData.particles = true;
  return mat;
}

/* The shared puff: an icosahedron with smooth normals. Detail 0 is twenty
 * faces, which is what a far plume or a droplet needs; detail 1 is eighty,
 * for the big near puffs whose outline is looked at. */
const PUFFS = new Map();
export function puffGeometry(detail) {
  if (!PUFFS.has(detail)) {
    const g = new THREE.IcosahedronGeometry(1, detail);
    g.deleteAttribute('uv');
    const merged = mergeByPosition(g);
    PUFFS.set(detail, merged);
  }
  return PUFFS.get(detail);
}

/* Weld an icosahedron's split vertices so its normals come out smooth. */
function mergeByPosition(g) {
  const pos = g.getAttribute('position');
  const map = new Map();
  const verts = [];
  const index = [];
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
    let k = map.get(key);
    if (k === undefined) {
      k = verts.length / 3;
      verts.push(x, y, z);
      map.set(key, k);
    }
    index.push(k);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(verts.slice(), 3));
  out.setIndex(index);
  return out;
}

/*
 * An instanced particle mesh from a table of per instance attributes
 * ({ name: [size, Float32Array] }), with a bounding sphere the caller
 * states, because the geometry's own is the unit puff at the origin and the
 * particles are wherever the shader puts them. Layer 1 only: the colour pass
 * draws it and the ink prepass does not, so a transparent puff never stamps
 * a hard outline into the frame (see post.js on layer 1).
 */
export function particleMesh(detail, material, table, count, sphere, name) {
  const geo = new THREE.InstancedBufferGeometry();
  const puff = puffGeometry(detail);
  geo.setIndex(puff.index);
  geo.setAttribute('position', puff.getAttribute('position'));
  geo.setAttribute('normal', puff.getAttribute('normal'));
  for (const [attr, [size, data]] of Object.entries(table)) {
    geo.setAttribute(attr, new THREE.InstancedBufferAttribute(data, size));
  }
  geo.instanceCount = count;
  geo.boundingSphere = sphere;
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = name;
  mesh.layers.set(1);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  /* Transparent steam sorts after the opaque world by this; the water in
   * the air is opaque and draws with the world. */
  mesh.renderOrder = material.transparent ? 10 : 0;
  mesh.userData.particles = count;
  return mesh;
}
