/*
 * lakewaves.js: a lake drawn from the plant's own waves.
 *
 * The plant floats an aircraft on a wave field it holds itself
 * (src/native/water.c, docs/FLOATS-STAGE1.md): a sum of up to seven
 * travelling cosines, each an amplitude, a wave vector, a frequency and a
 * phase, read back through sim_water_components. The shell hands a map
 * those numbers turned into the map's frame at every reset, and the sim
 * clock, state[0], every drawn frame (src/main.js, handWaves). This file
 * is what a map draws them with, so the surface on screen is the surface
 * the floats ride:
 *
 *   makeWaves()               the uniforms one body's surface is drawn
 *                             with, set(body) and tick(t) to fill them
 *   WAVE_GLSL, WAVE_VERTEX    the sum itself, for a material to splice in
 *   injectWaves(material)     the splice, for three's own materials
 *   patchGeometry()           the dense grid the near water is drawn on
 *   placePatch(...)           where it goes this frame
 *   probeSurface(...)         the drawn height at a point, read back off
 *                             the GPU, for the check that it is the plant's
 *
 * THE SUM. Per component, theta = k . (p - o) + phase - omega t, the
 * surface z0 + sum a cos theta, its slope -sum a k sin theta. The phase
 * less omega t is taken on the CPU in doubles and reduced to one turn
 * before it is a float, since omega t runs to thousands of radians in a
 * few minutes and a float holds that to a thousandth; what the GPU adds
 * is k . (p - o), a few hundred radians at most across a lake.
 *
 * THE MESH. The chop the plant raises on a breeze is a few millimetres
 * high and ten centimetres to a metre long, which no mesh over a whole
 * lake can carry. So the lake keeps its own coarse sheet, displaced by
 * whatever it can resolve (nothing, for this chop; all of a swell), and
 * a dense patch is laid over the water where the displacement shows:
 * round the aircraft when there is one on the water, else under the
 * camera. The patch is a square grid seven centimetres a cell for seven
 * metres either way of its middle, then widening by nine percent a cell
 * to 44 m, and the coarse sheet cuts a hole where it lies. A component
 * displaces a vertex only where the grid is fine enough to draw it, and
 * fades out between 1.6 and 2.4 radians a cell: what the vertices cannot
 * carry they leave flat rather than alias. The normals are the analytic
 * slope per pixel, faded by the pixel's own footprint, so the light on
 * the water shows every component the pixel can.
 *
 * Seen from further off the patch scales up by powers of two, so its
 * triangles stay a few pixels across, and past 128 m it is not drawn.
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

/* sim_water_components' most: six wind sea components and a swell. */
export const WAVE_MAX = 7;
const TWO_PI = Math.PI * 2;

const CORE_CELL = 0.07;
const CORE_CELLS = 100;
const GROW_CELLS = 44;
const GROWTH = 1.09;
/* How far the camera may be from the patch's middle before the patch
 * doubles, and the most it doubles before it is not drawn. */
const SCALE_REACH = 8;
const SCALE_MAX = 16;

/* The patch's grid lines, from its middle out, at scale 1. */
function patchLines() {
  const out = [0];
  let x = 0;
  for (let i = 0; i < CORE_CELLS; i += 1) {
    x += CORE_CELL;
    out.push(x);
  }
  let d = CORE_CELL;
  for (let i = 0; i < GROW_CELLS; i += 1) {
    d *= GROWTH;
    x += d;
    out.push(x);
  }
  const back = out.slice(1).map((v) => -v).reverse();
  return back.concat(out);
}

export const PATCH_EDGE = patchLines().at(-1);
const PATCH_EDGE_GLSL = PATCH_EDGE.toFixed(6);

export const WAVE_GLSL = /* glsl */ `
  uniform vec4 uWaveK[${WAVE_MAX}];
  uniform vec3 uWaveO;
  uniform int uWaveN;
  uniform vec4 uPatch;
  uniform float uWaveT;
  /* The surface over the still water's height at p (map x, z) and its
   * slope, (h, dh/dx, dh/dz), with every component too short for vertices
   * res metres apart faded out, between 1.6 and 2.4 radians a cell: to
   * there a straight line between two vertices misses a cosine by under
   * half its height, less than leaving it out would. */
  vec3 waveField(vec2 p, float res) {
    vec2 q = p - uWaveO.xz;
    vec3 f = vec3(0.0);
    for (int i = 0; i < ${WAVE_MAX}; i++) {
      if (i >= uWaveN) {
        break;
      }
      vec4 c = uWaveK[i];
      float a = c.z * (1.0 - smoothstep(1.6, 2.4, length(c.xy) * res));
      float th = dot(c.xy, q) + c.w;
      f.x += a * cos(th);
      f.yz -= a * c.xy * sin(th);
    }
    return f;
  }`;

/*
 * Value noise that does not repeat, and its gradient: an integer hash of
 * the lattice cell (exact for cells under 2^24, so it holds together
 * kilometres from the origin) and a quintic blend. For what the plant's
 * waves leave out and a picture needs: the ripples too fine for any of
 * its seven components, and foam that breaks up.
 */
export const WAVE_NOISE = /* glsl */ `
  float waveHash(vec2 c) {
    uvec2 q = uvec2(ivec2(c) + ivec2(1 << 20)) * uvec2(1597334673u, 3812015801u);
    uint n = (q.x ^ q.y) * 1597334673u;
    return float(n) * (1.0 / 4294967295.0);
  }
  vec3 waveNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = p - i;
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
    float a = waveHash(i);
    float b = waveHash(i + vec2(1.0, 0.0));
    float c = waveHash(i + vec2(0.0, 1.0));
    float d = waveHash(i + vec2(1.0, 1.0));
    float k = a - b - c + d;
    return vec3(a + (b - a) * u.x + (c - a) * u.y + k * u.x * u.y,
      du * vec2((b - a) + k * u.y, (c - a) + k * u.x));
  }`;

/* After three's begin_vertex: `transformed` displaced, and where it is
 * in the map for the fragment. The patch's own cell size is aRes, the
 * patch's scale uPatch.z, and over its outer quarter it goes over to
 * the sheet's, uWaveRes, so at its edge it is displaced exactly as the
 * sheet round it is and no seam shows; any other sheet's is uWaveRes. */
export const WAVE_VERTEX = /* glsl */ `
  #ifdef WAVE_PATCH
    float waveEdge = smoothstep(0.75, 1.0, max(abs(position.x), abs(position.z)) / ${PATCH_EDGE_GLSL});
    float waveRes = mix(aRes * uPatch.z, uWaveRes, waveEdge);
  #else
    float waveRes = uWaveRes;
  #endif
  vec4 waveWorld = modelMatrix * vec4(transformed, 1.0);
  vec3 waveF = waveField(waveWorld.xz, waveRes);
  transformed.y += waveF.x;
  vWaveP = waveWorld.xz;
  vWaveY = waveWorld.y + waveF.x;`;

export const WAVE_VERTEX_DECL = /* glsl */ `
  ${WAVE_GLSL}
  #ifdef WAVE_PATCH
    attribute float aRes;
  #endif
  uniform float uWaveRes;
  varying vec2 vWaveP;
  varying float vWaveY;`;

export const WAVE_FRAGMENT_DECL = /* glsl */ `
  ${WAVE_GLSL}
  ${WAVE_NOISE}
  varying vec2 vWaveP;
  varying float vWaveY;
  /* The wavelets under the plant's shortest wave: two octaves of the
   * noise's slope, 0.35 and 0.14 m across, drifting down the wind (the
   * longest component's way) on the sim clock, a slope of a few
   * hundredths, each faded out as a pixel grows to half its cell. They
   * do not repeat, so the plant's few components do not read as a grid.
   * Light only: the surface the floats ride is the plant's alone. */
  vec2 waveDetail(vec2 p, float res) {
    if (uWaveN == 0) {
      return vec2(0.0);
    }
    vec2 dir = normalize(uWaveK[0].xy + vec2(1e-6, 0.0));
    vec2 q = p - uWaveO.xz;
    vec2 s = vec2(0.0);
    vec3 n1 = waveNoise(q / 0.35 - dir * uWaveT * 0.6);
    s += n1.yz * (0.009 / 0.35) * (1.0 - smoothstep(0.2, 0.5, res / 0.35));
    vec2 r = mat2(0.8, -0.6, 0.6, 0.8) * q;
    vec3 n2 = waveNoise(r / 0.14 + vec2(17.3, 5.1) - mat2(0.8, -0.6, 0.6, 0.8) * dir * uWaveT * 1.4);
    s += mat2(0.8, 0.6, -0.6, 0.8) * n2.yz * (0.003 / 0.14) * (1.0 - smoothstep(0.2, 0.5, res / 0.14));
    return s;
  }
  /* The slope at this pixel, every component the pixel can show: a
   * wave under four pixels long is faded out of the light, not aliased. */
  vec2 waveSlopeHere() {
    float res = max(length(dFdx(vWaveP)), length(dFdy(vWaveP)));
    return waveField(vWaveP, 2.0 * res).yz + waveDetail(vWaveP, res);
  }
  /* Whether this fragment of a coarse sheet lies under the patch, which
   * draws the water there instead. Only near the still water's height,
   * so a pool elsewhere drawn with the same material is left alone. */
  bool waveUnderPatch() {
    vec2 d = abs(vWaveP - uPatch.xy);
    return uPatch.w > 0.0 && abs(vWaveY - uWaveO.y) < 0.6 && max(d.x, d.y) < uPatch.w;
  }`;

/*
 * One body's waves, as uniforms. set(body) with the shell's body in the
 * map's frame, { y0, ox, oz, comps: [{ a, kx, kz, omega, phase }] }, or
 * null for still water; tick(t) at the sim clock, before the frame is
 * drawn. height(x, z) is the same sum on the CPU at the last tick, for
 * what rides on the water (the spray, the wake).
 */
export function makeWaves() {
  const uniforms = {
    uWaveK: { value: Array.from({ length: WAVE_MAX }, () => new THREE.Vector4()) },
    uWaveO: { value: new THREE.Vector3() },
    uWaveN: { value: 0 },
    uPatch: { value: new THREE.Vector4(0, 0, 1, -1) },
    uWaveT: { value: 0 },
  };
  const w = {
    uniforms,
    body: null,
    t: 0,
    set(body) {
      w.body = body && body.comps.length ? body : null;
      const n = w.body ? Math.min(WAVE_MAX, w.body.comps.length) : 0;
      uniforms.uWaveN.value = n;
      if (w.body) {
        uniforms.uWaveO.value.set(w.body.ox, w.body.y0, w.body.oz);
      }
      w.tick(w.t);
    },
    tick(t) {
      w.t = t;
      /* The fine ripples' drift, which needs no more than a float: it
       * wraps every ten minutes, and it is not the plant's. */
      uniforms.uWaveT.value = t % 600;
      const b = w.body;
      if (!b) {
        return;
      }
      for (let i = 0; i < uniforms.uWaveN.value; i += 1) {
        const c = b.comps[i];
        let ph = (c.phase - c.omega * t) % TWO_PI;
        if (ph < 0) {
          ph += TWO_PI;
        }
        uniforms.uWaveK.value[i].set(c.kx, c.kz, c.a, ph);
      }
    },
    height(x, z) {
      const b = w.body;
      if (!b) {
        return null;
      }
      let y = b.y0;
      for (let i = 0; i < uniforms.uWaveN.value; i += 1) {
        const k = uniforms.uWaveK.value[i];
        y += k.z * Math.cos(k.x * (x - b.ox) + k.y * (z - b.oz) + k.w);
      }
      return y;
    },
  };
  return w;
}



/* The patch at scale 1, about its middle at y 0: position, and aRes,
 * the larger of the cells either side of each vertex either way. */
export function patchGeometry() {
  const lines = patchLines();
  const n = lines.length;
  const cell = lines.map((v, i) => Math.max(i > 0 ? v - lines[i - 1] : 0, i < n - 1 ? lines[i + 1] - v : 0));
  const pos = new Float32Array(n * n * 3);
  const res = new Float32Array(n * n);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const k = j * n + i;
      pos[k * 3] = lines[i];
      pos[k * 3 + 2] = lines[j];
      res[k] = Math.max(cell[i], cell[j]);
    }
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let o = 0;
  for (let j = 0; j < n - 1; j += 1) {
    for (let i = 0; i < n - 1; i += 1) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const e = c + 1;
      idx.set([a, c, b, b, c, e], o);
      o += 6;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * n * 3).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('aRes', new THREE.BufferAttribute(res, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

/*
 * Where the patch lies this frame: round `focus` (the aircraft on the
 * water, or null for the point under the camera), scaled by the camera's
 * distance from it, snapped to its own core cells so the near vertices do
 * not swim. `box` is the body's extent in the map, { x0, x1, z0, z1 }; a
 * patch that would not touch it, or is too far to see, is switched off.
 * Sets the uniforms and each mesh's place (its y is its own offset over
 * the still water) and visibility; returns whether it is drawn.
 */
export function placePatch(waves, meshes, camera, focus, box) {
  const u = waves.uniforms.uPatch.value;
  const off = () => {
    u.w = -1;
    for (const m of meshes) {
      m.visible = false;
    }
    return false;
  };
  const b = waves.body;
  if (!b) {
    return off();
  }
  const c = camera.position;
  const fx = focus ? focus.x : c.x;
  const fz = focus ? focus.z : c.z;
  const dist = Math.hypot(c.x - fx, c.y - b.y0, c.z - fz);
  let s = 1;
  while (s <= SCALE_MAX && dist > SCALE_REACH * s) {
    s *= 2;
  }
  if (s > SCALE_MAX) {
    return off();
  }
  const edge = PATCH_EDGE * s;
  if (fx + edge < box.x0 || fx - edge > box.x1 || fz + edge < box.z0 || fz - edge > box.z1) {
    return off();
  }
  const snap = CORE_CELL * s;
  const cx = Math.round(fx / snap) * snap;
  const cz = Math.round(fz / snap) * snap;
  u.set(cx, cz, s, edge);
  for (const m of meshes) {
    m.visible = true;
    m.position.set(cx, b.y0 + (m.userData.waveLift || 0), cz);
    m.scale.set(s, 1, s);
  }
  return true;
}

/*
 * Splice the waves into one of three's own materials. Options:
 *   patch    the material draws the patch (its aRes, its place)
 *   res      else the cell size, m, the sheet it draws samples at
 *   hole     a coarse sheet: cut where the patch lies
 *   normals  light the surface by the waves' slope (default true)
 *   clip     { texture, centre, rays, outer, inner }: keep only the part
 *            of a star shaped zone (starLoops) this material's sheet
 *            covers, for a patch standing in for a sheet cut to a zone
 *   probe    write the drawn height to red instead of a colour
 * The program's cache key says which of these it carries.
 */
export function injectWaves(material, waves, opts = {}) {
  const defines = `${opts.patch ? '#define WAVE_PATCH\n' : ''}${opts.hole ? '#define WAVE_HOLE\n' : ''}`
    + `${opts.clip ? '#define WAVE_CLIP\n' : ''}${opts.probe ? '#define WAVE_PROBE\n' : ''}`
    + `${opts.normals === false ? '' : '#define WAVE_NORMALS\n'}`;
  const own = {
    uWaveRes: { value: opts.res ?? 1 },
    uStar: { value: opts.clip ? opts.clip.texture : null },
    uStarC: { value: opts.clip ? new THREE.Vector3(opts.clip.centre.x, opts.clip.centre.z, opts.clip.rays) : new THREE.Vector3() },
    uStarRows: { value: opts.clip ? new THREE.Vector2(opts.clip.outer, opts.clip.inner ?? -1) : new THREE.Vector2() },
  };
  const base = material.onBeforeCompile;
  const baseKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    base.call(material, shader, renderer);
    Object.assign(shader.uniforms, waves.uniforms, own);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `${defines}
        #include <common>
        ${WAVE_VERTEX_DECL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${WAVE_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `${defines}
        #include <common>
        ${WAVE_FRAGMENT_DECL}
        #ifdef WAVE_CLIP
          uniform sampler2D uStar;
          uniform vec3 uStarC;
          uniform vec2 uStarRows;
          ${STAR_GLSL}
        #endif`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        #ifdef WAVE_HOLE
          if (waveUnderPatch()) {
            discard;
          }
        #endif
        #ifdef WAVE_CLIP
          if (!inStarZone(vWaveP)) {
            discard;
          }
        #endif`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        #ifdef WAVE_NORMALS
          vec2 ws = waveSlopeHere();
          if (abs(vWaveY - uWaveO.y) < 0.6) {
            normal = normalize((viewMatrix * vec4(-ws.x, 1.0, -ws.y, 0.0)).xyz);
          }
        #endif`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        #ifdef WAVE_PROBE
          gl_FragColor = vec4(vWaveY, 0.0, 0.0, 1.0);
        #endif`);
    /* The cel look's rim (celmat.js) reads the interpolated normal, not
     * the lit one: on the water it is the waves' light, so it reads the
     * waved normal, and the lake's pale sheen toward the horizon breaks
     * up on them. */
    if (opts.normals !== false) {
      shader.fragmentShader = shader.fragmentShader.replace('vec3 celN = normalize(vNormal);', 'vec3 celN = normalize(normal);');
    }
  };
  material.customProgramCacheKey = () => `${baseKey()}|waves:${defines.replace(/\n/g, ',')}`;
  material.userData.waves = own;
  material.needsUpdate = true;
  return material;
}

/*
 * A star shaped zone, as a lake's shore found by rays from its middle is:
 * the loop's corner on ray k at texel (k, row), relative to the middle.
 * The zone a sheet covers is inside the `outer` loop and outside the
 * `inner` one (none if negative), exactly the fan or ring triangles
 * between the two loops' corners on each pair of rays.
 */
const STAR_GLSL = /* glsl */ `
  float starRadius(int row, vec2 d, float ang) {
    int n = int(uStarC.z);
    int k0 = int(floor(ang / 6.28318530718 * uStarC.z));
    k0 = ((k0 % n) + n) % n;
    int k1 = (k0 + 1) % n;
    vec2 a = texelFetch(uStar, ivec2(k0, row), 0).xy;
    vec2 b = texelFetch(uStar, ivec2(k1, row), 0).xy;
    vec2 e = b - a;
    float den = d.x * e.y - d.y * e.x;
    if (abs(den) < 1e-9) {
      return length(a);
    }
    return (a.x * e.y - a.y * e.x) / den;
  }
  bool inStarZone(vec2 p) {
    vec2 q = p - uStarC.xy;
    float r = length(q);
    vec2 d = q / max(r, 1e-6);
    float ang = atan(q.y, q.x);
    if (ang < 0.0) {
      ang += 6.28318530718;
    }
    if (r >= starRadius(int(uStarRows.x), d, ang)) {
      return false;
    }
    return uStarRows.y < 0.0 || r >= starRadius(int(uStarRows.y), d, ang);
  }`;

/* The texture STAR_GLSL reads: `loops` are lists of { x, z } on the same
 * rays round `centre`, one row each. */
export function starLoops(centre, loops) {
  const rays = loops[0].length;
  const data = new Float32Array(rays * loops.length * 4);
  loops.forEach((loop, row) => {
    loop.forEach((p, k) => {
      const o = (row * rays + k) * 4;
      data[o] = p.x - centre.x;
      data[o + 1] = p.z - centre.z;
    });
  });
  const tex = new THREE.DataTexture(data, rays, loops.length, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return { texture: tex, centre, rays };
}

/* A body's extent in the map, for placePatch. */
export function outlineBox(outline, pad = 0) {
  const box = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const p of outline) {
    box.x0 = Math.min(box.x0, p.x - pad);
    box.x1 = Math.max(box.x1, p.x + pad);
    box.z0 = Math.min(box.z0, p.z - pad);
    box.z1 = Math.max(box.z1, p.z + pad);
  }
  return box;
}

/*
 * The drawn height at (x, z): `mesh` (a patch or a sheet drawn with
 * injectWaves's vertex code, or surface.js's, which is the same string)
 * rendered straight down through a one texel float target with a
 * material that shares its displacement, and the texel read back. What
 * the rasteriser interpolated between the displaced vertices, so it is
 * the surface on screen, not the sum at the point. Returns null where
 * the mesh does not cover the point. For the checks: it stalls the GPU.
 */
export function probeSurface(renderer, mesh, waves, x, z) {
  let p = probeSurface.cache;
  if (!p) {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType, depthBuffer: true });
    const cam = new THREE.OrthographicCamera(-1e-3, 1e-3, 1e-3, -1e-3, 0.1, 400);
    cam.up.set(0, 0, -1);
    const scene = new THREE.Scene();
    p = { target, cam, scene, mats: new Map(), px: new Float32Array(4) };
    probeSurface.cache = p;
  }
  const patch = Boolean(mesh.geometry.getAttribute('aRes'));
  const key = `${patch}|${mesh.userData.waveRes ?? 1}`;
  if (!p.mats.has(key)) {
    const m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    p.mats.set(key, injectWaves(m, waves, { patch, res: mesh.userData.waveRes ?? 1, normals: false, probe: true }));
  }
  mesh.updateMatrixWorld();
  const probe = new THREE.Mesh(mesh.geometry, p.mats.get(key));
  probe.matrixAutoUpdate = false;
  probe.matrix.copy(mesh.matrixWorld);
  probe.matrixWorld.copy(mesh.matrixWorld);
  probe.frustumCulled = false;
  p.scene.add(probe);
  p.cam.position.set(x, waves.body.y0 + 100, z);
  p.cam.lookAt(x, waves.body.y0, z);
  p.cam.updateMatrixWorld();
  const prev = renderer.getRenderTarget();
  const prevAuto = renderer.autoClear;
  const prevColor = new THREE.Color();
  renderer.getClearColor(prevColor);
  const prevAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(p.target);
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = true;
  renderer.render(p.scene, p.cam);
  renderer.readRenderTargetPixels(p.target, 0, 0, 1, 1, p.px);
  renderer.setRenderTarget(prev);
  renderer.setClearColor(prevColor, prevAlpha);
  renderer.autoClear = prevAuto;
  p.scene.remove(probe);
  return p.px[3] > 0.5 ? p.px[0] : null;
}
