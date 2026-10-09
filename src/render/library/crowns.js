/*
 * crowns.js: the asset library's lit tree crowns (docs/ASSET-LIBRARY.md),
 * first drawn as the Interior's forest (src/maps/interior/trees.js, which
 * places them and says how its tiers hand trees over).
 *
 * A crown is sized by an ellipsoid, r across and ry up, and shaped by
 * its lobes inside it (crownshape.js): heaps of foliage round a core,
 * with gaps between them at its edge. It is drawn as a lumpy twenty
 * sided ball round the ellipsoid (or, far off, one point) and cut in the
 * fragment to its lobes: a pixel is kept only where the camera's ray
 * meets one, less a few decimetres where the clumps' hollows go in, so
 * no outline is a polygon's, a gap is drawn where a map's line of sight
 * (the same lobes) is open, and nothing where it is not. It is lit by
 * the lobe's normal: darker underneath, lit and yellower at the top, broken into a
 * few big lobes and, close up, clumps of leaves, rimmed by the low sun
 * coming through its outer leaves.
 *
 * The program cache keys still say "interior": they are what the shaders
 * were compiled under when the crowns moved here, and renaming one is a
 * change of its own.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { thermalKind } from '../thermal.js';
import { hash01 } from './hash.js';
import { LOBES, TEMPLATES, LOBE_DATA } from './crownshape.js';

/* The share of the standard material's specular a crown keeps: the sky's
 * Fresnel sheen at a crown's grazing rim frosted the far forest, and
 * more on the points than the balls. Measured in one frame at the hand
 * over (camp-orbit-90 and -135, rows 300 to 480, balls and points told
 * apart by a render with each tinted), the points were 0.035 to 0.044
 * brighter (sRGB, after the metered exposure) with all of it and 0.025
 * to 0.038 with this, part of which is the points standing a little
 * farther out in each band. A leaf's wax keeps a little. */
const CROWN_SPEC = 0.3;

/* A ball with lumps: an icosahedron subdivided `detail` times, each
 * vertex pushed in or out by a hash of its direction. */
export function crownGeometry(THREE, detail, lump) {
  /* Welded, so its normals are smooth: a crown is a soft heap of leaves,
   * not a cut stone. */
  const geo = mergeVertices(new THREE.IcosahedronGeometry(1, detail).deleteAttribute('normal').deleteAttribute('uv'));
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + lump * (hash01(Math.round(x * 97), Math.round(y * 97), Math.round(z * 97) + 5) - 0.5);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/* The scale that has a unit ball's polyhedron straddle the unit sphere:
 * its faces' nearest distance to the middle d and its corners' farthest
 * c, scaled by 2 / (d + c) so both miss the sphere by the same. */
export function fitOf(geo) {
  const p = geo.attributes.position;
  const idx = geo.index.array;
  let d = Infinity;
  let c = 0;
  const v = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let k = 0; k < idx.length; k += 3) {
    for (let j = 0; j < 3; j += 1) {
      v[j][0] = p.getX(idx[k + j]);
      v[j][1] = p.getY(idx[k + j]);
      v[j][2] = p.getZ(idx[k + j]);
      c = Math.max(c, Math.hypot(v[j][0], v[j][1], v[j][2]));
    }
    const ux = v[1][0] - v[0][0];
    const uy = v[1][1] - v[0][1];
    const uz = v[1][2] - v[0][2];
    const wx = v[2][0] - v[0][0];
    const wy = v[2][1] - v[0][1];
    const wz = v[2][2] - v[0][2];
    const nx = uy * wz - uz * wy;
    const ny = uz * wx - ux * wz;
    const nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz);
    d = Math.min(d, Math.abs(nx * v[0][0] + ny * v[0][1] + nz * v[0][2]) / l);
  }
  return 2 / (d + c);
}

/* THE CROWN SHADER, patched into a MeshStandardMaterial so the balls and
 * the points take the same sun, sky, shadow and air. MODE: 0 near, 1 mid
 * (hands its trees over), 2 a tree's point, 3 a block's point. */
const CROWN_VERT_PARS = /* glsl */ `
  varying vec3 vCrW;
  varying float vCrUp;
  #if CROWN_MODE < 3
    attribute float aLobe;
    varying float vCrLobe;
  #endif
  #if CROWN_MODE < 2
    uniform float uCrFit;
    varying vec3 vCrC;
    varying vec2 vCrR;
  #endif
  #if CROWN_MODE == 1
    attribute float aSeed;
    uniform vec2 uCrHand;
  #endif
  #if CROWN_MODE >= 2
    attribute vec3 aShape;
    uniform vec4 uCrBand;
    uniform float uCrPx;
    varying vec3 vCrHalf;
    varying vec2 vCrSeed;
  #endif
`;
const CROWN_VERT = /* glsl */ `
  {
    vec4 crw = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      crw = instanceMatrix * crw;
    #endif
    vCrW = (modelMatrix * crw).xyz;
    vCrUp = position.y;
    #if CROWN_MODE < 3
      vCrLobe = aLobe;
    #endif
    #if CROWN_MODE < 2
      vCrC = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
      vCrR = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz)) / uCrFit;
    #endif
  }
  #if CROWN_MODE == 1
    {
      vec3 crc = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
      if (distance(crc, cameraPosition) >= uCrHand.x - uCrHand.y * aSeed) {
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      }
    }
  #endif
  #if CROWN_MODE >= 2
    {
      float crd = distance(vCrW, cameraPosition);
      /* A tree's point needs its ry for its ray, a block's its r over ry
       * for its normal. */
      vCrSeed = vec2(aShape.z, CROWN_MODE == 2 ? aShape.y : aShape.x / aShape.y);
      if (crd < uCrBand.x - uCrBand.y * aShape.z || crd >= uCrBand.z - uCrBand.w * aShape.z) {
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        gl_PointSize = 0.0;
      } else {
        /* The ellipsoid's outline on the screen: r across, and up the
         * screen as much of ry and r as the view's slant shows. */
        vec3 crUpV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
        float crc = dot(crUpV, normalize(mvPosition.xyz));
        float crhy = sqrt(aShape.y * aShape.y * (1.0 - crc * crc) + aShape.x * aShape.x * crc * crc);
        vCrHalf = vec3(aShape.x, crhy, max(aShape.x, crhy));
        gl_PointSize = 2.0 * vCrHalf.z * projectionMatrix[1][1] * uCrPx / -mvPosition.z;
      }
    }
  #endif
`;
const CROWN_FRAG_PARS = /* glsl */ `
  varying vec3 vCrW;
  varying float vCrUp;
  #if CROWN_MODE < 3
    varying float vCrLobe;
    uniform vec4 uCrLobes[CROWN_LOBES * CROWN_TEMPLATES];
  #endif
  #if CROWN_MODE < 2
    varying vec3 vCrC;
    varying vec2 vCrR;
  #endif
  #if CROWN_MODE >= 2
    varying vec3 vCrHalf;
    varying vec2 vCrSeed;
  #endif
  float crH(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float crN(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(crH(i), crH(i + vec3(1.0, 0.0, 0.0)), f.x), mix(crH(i + vec3(0.0, 1.0, 0.0)), crH(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(crH(i + vec3(0.0, 0.0, 1.0)), crH(i + vec3(1.0, 0.0, 1.0)), f.x), mix(crH(i + vec3(0.0, 1.0, 1.0)), crH(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z);
  }
  /* The noise and its slope in x, by differences a twelfth of a feature
   * apart: a slope from the screen's derivatives is one per 2 x 2 pixels,
   * and the bump comes out in squares. */
  vec4 crNG(vec3 x) {
    float n = crN(x);
    return vec4(n, (vec3(crN(x + vec3(0.08, 0.0, 0.0)), crN(x + vec3(0.0, 0.08, 0.0)), crN(x + vec3(0.0, 0.0, 0.08))) - n) / 0.08);
  }
  /* The camera's ray through p against the lobes of the crown centred
   * at c, radii (r, ry, r): the normal (world) and the height on the unit
   * crown where it comes in, or false where it misses. A ball holds the
   * lobes, so this cuts it to them and lights them, and nothing is drawn
   * outside the crown canopyBlocks tests; a tree's point is outlined and
   * lit the same. The ray starts at p, a metre or so off the crown, not at the
   * camera: from a kilometre away the quadratic's two terms are a
   * thousand times its answer, and float rounding loses it. The nearer
   * root, behind p when p is inside, is where the ray came in. */
  /* How much of the clumps a crown shows, by how many metres a pixel
   * covers on it: none from a few hundred metres out, so the far tiers
   * and every survey keep round 4's crowns. */
  float crClumpK = 0.0;
  /* Close up, the crown is heaped of clumps of leaves: a height field over
   * the direction from the crown's middle, in metres along its skin
   * (clumps 1.6 m across with sprays of 0.7 m on them), high where a clump
   * bulges out and low in the hollows between. Nothing finer: a value
   * noise at a leaf cluster's few decimetres printed its lattice as
   * square blocks once the hollows and the light leaned on it. */
  float crHeap(vec3 dir, vec3 c, float r) {
    /* The crown's own offset into the noise, kept small, so the hash's
     * fract keeps its bits. */
    vec3 q = dir * r + fract(c * 0.0173) * 61.0;
    return 0.65 * crN(q / 1.6) + 0.35 * crN(q / 0.7 + 7.1);
  }
  float crHeapH = 1.0;
  vec3 crHeapT = vec3(0.0);
  #if CROWN_MODE < 3
  bool crHit(vec3 p, vec3 c, vec2 rr, out vec3 nw, out float up) {
    vec3 rad = vec3(rr.x, rr.y, rr.x);
    vec3 u = (p - c) / rad;
    vec3 dir = normalize(u + vec3(0.0, 1e-4, 0.0));
    /* Close up, the clumps' hollows: at most 0.58 m inside the lobes
     * canopyBlocks tests (scripts/canopy-los.js allows the drawn crowns
     * 0.6 m), never out. */
    float crIn = 0.0;
    if (crClumpK > 0.0) {
      float h = crHeap(dir, c, rr.x);
      /* The heap's slope across the skin, for the clumps' light. */
      vec3 t1 = normalize(cross(dir, abs(dir.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
      vec3 t2 = cross(dir, t1);
      float e = 0.25 / rr.x;
      float h1 = crHeap(normalize(dir + t1 * e), c, rr.x);
      float h2 = crHeap(normalize(dir + t2 * e), c, rr.x);
      crHeapT = (t1 * (h1 - h) + t2 * (h2 - h)) / 0.25;
      crHeapH = h;
      float hollow = 1.0 - smoothstep(0.25, 0.75, h);
      crIn = crClumpK * 0.58 * hollow;
    }
    /* The crown's lobes (crownshape.js), spheres in its unit space: the
     * ray's first entry into any of them. A lobe's radius is cut by the
     * hollows' depth over the larger radius, so it never goes deeper
     * than that in metres. */
    vec3 o = u;
    vec3 e = normalize(p - cameraPosition) / rad;
    float a = dot(e, e);
    float best = 1e20;
    vec4 hit = vec4(0.0);
    int base = int(vCrLobe + 0.5) * CROWN_LOBES;
    for (int k = 0; k < CROWN_LOBES; k++) {
      vec4 lb = uCrLobes[base + k];
      float rl = max(lb.w - crIn / max(rr.x, rr.y), 0.02);
      vec3 q = o - lb.xyz;
      float b = dot(q, e);
      float d = b * b - a * (dot(q, q) - rl * rl);
      if (d < 0.0) continue;
      float t = (-b - sqrt(d)) / a;
      if (t < best) {
        best = t;
        hit = vec4(lb.xyz, rl);
      }
    }
    if (best > 1e19) return false;
    vec3 h = o + e * best;
    nw = normalize(((h - hit.xyz) / hit.w) / rad);
    /* A clump's normal leans down its heap's slope. */
    nw = normalize(nw - crHeapT * 0.6 * crClumpK);
    up = h.y;
    return true;
  }
  #endif
`;
/* At the fragment's start: where the pixel's ray meets the crown and
 * the crown's normal there (a ball's or a tree's point), or a block's
 * four domes. */
const CROWN_FRAG_START = /* glsl */ `
  float crUp = vCrUp;
  float crShadeK = 1.0;
  /* The tree's own number in [0, 1), for its top's light. */
  #if CROWN_MODE < 2
    float crTree = crH(vCrC * 0.0137);
  #else
    float crTree = vCrSeed.x;
  #endif
  #if CROWN_MODE < 2
    float crPx = length(fwidth(vCrW));
    crClumpK = 1.0 - smoothstep(0.18, 0.5, crPx);
  #endif
  #if CROWN_MODE < 3
    vec3 crNW;
    if (!crHit(CROWN_RAY_AT, CROWN_CENTRE, CROWN_RADII, crNW, crUp)) discard;
    vec3 crNrm = normalize((viewMatrix * vec4(crNW, 0.0)).xyz);
  #else
    vec2 crQ = (gl_PointCoord * 2.0 - 1.0) * vec2(1.0, -1.0) * vCrHalf.z / vCrHalf.xy;
    float crR2 = dot(crQ, crQ);
    if (crR2 > 1.0) discard;
    vec3 crNrm = vec3(crQ, sqrt(1.0 - crR2));
    {
      vec2 crO = vec2(0.42) + (vec2(vCrSeed.x, fract(vCrSeed.x * 7.3)) - 0.5) * 0.24;
      vec2 crC = vec2(crQ.x < 0.0 ? -crO.x : crO.x, crQ.y < 0.0 ? -crO.y : crO.y);
      vec2 crF = (crQ - crC) / 0.66;
      float crF2 = dot(crF, crF);
      if (crF2 < 1.0) {
        crNrm = normalize(vec3(crF, sqrt(1.0 - crF2)) + crNrm * 0.6);
      } else {
        crShadeK = 0.55;
      }
    }
    /* A sphere's normal made the ellipsoid's: up and down by r over ry,
     * so a tall crown's side faces the side and not the sky. */
    {
      vec3 crNw = (vec4(crNrm, 0.0) * viewMatrix).xyz;
      crNw.y *= vCrSeed.y;
      crNw = normalize(crNw);
      crNrm = normalize((viewMatrix * vec4(crNw, 0.0)).xyz);
      crUp = crNw.y;
    }
  #endif
`;
/* After the colour: the crown's light inside itself (dark under, lit
 * and yellow on top) and its clumps of leaves while they are over a
 * pixel. */
const CROWN_FRAG_COLOUR = /* glsl */ `
  /* The hollows between clumps, where the leaves shade each other. */
  float crCrease = mix(1.0, 0.6 + 0.4 * smoothstep(0.2, 0.7, crHeapH), crClumpK);
  float crShade = mix(0.34, 1.0, smoothstep(-0.85, 0.75, crUp)) * crShadeK * crCrease;
  #if CROWN_MODE < 2
    float crK1 = 1.0 - smoothstep(0.4, 1.3, crPx);
    float crK2 = 1.0 - smoothstep(0.12, 0.45, crPx);
    vec4 crCG = crNG(vCrW * 0.62);
    float crC = crCG.x;
    float crL = crN(vCrW * 2.1 + 7.0);
    crShade *= mix(1.0, 0.6 + 0.8 * crC, crK1) * mix(1.0, 0.78 + 0.44 * crL, crK2);
    /* A crown's few big lobes, a third of it across, lit and shaded on
     * their own: past the clumps' reach every crown was one smooth
     * ellipsoid, and from the orbits the canopy read as a tray of balls.
     * Light only; the outline canopyBlocks tests is crHit's. */
    vec4 crLb = crNG((vCrW - vCrC) / vec3(vCrR.x, vCrR.y, vCrR.x) * 1.7 + vCrC * 0.37);
    crShade *= 0.7 + 0.6 * crLb.x;
  #endif
  diffuseColor.rgb *= crShade;
  /* The top's lift: warm on the near balls, where the golden hour's
   * mocks want it, and greener and less on the tiers a survey sees, where
   * one yellow on every crown said "game"; each tree its own share. */
  #if CROWN_MODE == 0
    vec3 crTop = vec3(1.22, 1.16, 0.76);
  #elif CROWN_MODE == 1
    vec3 crTop = vec3(1.14, 1.14, 0.84);
  #else
    vec3 crTop = vec3(1.08, 1.12, 0.9);
  #endif
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * crTop, smoothstep(0.2, 1.0, crUp) * (CROWN_MODE == 0 ? 0.6 : 0.25 + 0.5 * crTree));
`;
/* After the normal: the clumps' bump on the true crown's normal (a
 * ball's), or the point's own normal. The leaves are colour only: a
 * value noise's slope is nothing on its lattice's planes, and at the
 * leaves' scale their bump came out as a grid of squares. */
const CROWN_FRAG_NORMAL = /* glsl */ `
  #if CROWN_MODE < 2
    {
      vec3 crG = crCG.yzw * (0.62 * 0.9 * crK1) + crLb.yzw * (1.7 * 0.3 / vCrR.x);
      vec3 crNb = normalize(crNW - (crG - dot(crG, crNW) * crNW));
      normal = normalize((viewMatrix * vec4(crNb, 0.0)).xyz);
    }
  #else
    normal = crNrm;
  #endif
`;
/* After the lights: less of the sky the lower on the crown, where its
 * neighbours stand round it (no tier past the near one casts shadows);
 * the low sun through the crown's outer leaves, most when the camera
 * looks toward it; and a third of the specular (CROWN_SPEC). */
const CROWN_FRAG_LIGHT = /* glsl */ `
  reflectedLight.indirectDiffuse *= mix(0.28, 1.0, smoothstep(-0.6, 0.9, crUp));
  #if NUM_DIR_LIGHTS > 0
    {
      vec3 crV = normalize(vViewPosition);
      float crFwd = pow(saturate(dot(-crV, directionalLights[0].direction)), 3.0);
      float crRim = 1.0 - saturate(dot(normal, crV));
      reflectedLight.indirectDiffuse += diffuseColor.rgb * directionalLights[0].color * (0.05 + 0.5 * crFwd) * pow(crRim, 1.5) * RECIPROCAL_PI;
    }
  #endif
  reflectedLight.indirectSpecular *= CROWN_SPEC;
  reflectedLight.directSpecular *= CROWN_SPEC;
`;

export function crownMaterial(THREE, mode, uniforms) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.92, metalness: 0, vertexColors: mode >= 2,
  });
  /* The crown's ray, middle and radii: a ball's from its instance, a
   * tree's point's from its sprite (the pixel's place on the camera
   * facing square through the crown's middle). */
  const ray = mode < 2 ? { CROWN_RAY_AT: 'vCrW', CROWN_CENTRE: 'vCrC', CROWN_RADII: 'vCrR' } : {
    CROWN_RAY_AT: '(vCrW + (vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]) * (gl_PointCoord.x * 2.0 - 1.0) + vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]) * (1.0 - gl_PointCoord.y * 2.0)) * vCrHalf.z)',
    CROWN_CENTRE: 'vCrW',
    CROWN_RADII: 'vec2(vCrHalf.x, vCrSeed.y)',
  };
  mat.defines = {
    ...(mat.defines || {}), CROWN_MODE: mode, CROWN_SPEC: CROWN_SPEC.toFixed(2), CROWN_LOBES: LOBES, CROWN_TEMPLATES: TEMPLATES, ...(mode < 3 ? ray : {}),
  };
  const lobes = {
    uCrLobes: { value: Array.from({ length: TEMPLATES * LOBES }, (_, i) => new THREE.Vector4().fromArray(LOBE_DATA, i * 4)) },
  };
  const swap = (src, anchor, add, where) => {
    if (!src.includes(anchor)) {
      throw new Error(`crowns: three's ${where} shader has no ${anchor} to patch`);
    }
    return src.replace(anchor, add);
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, mode < 3 ? lobes : {});
    let v = shader.vertexShader;
    v = swap(v, '#include <common>', `#include <common>\n${CROWN_VERT_PARS}`, 'vertex');
    if (mode >= 2) {
      v = swap(v, '#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = vec3(0.0, 1.0, 0.0);', 'vertex');
    }
    v = swap(v, '#include <project_vertex>', `#include <project_vertex>\n${CROWN_VERT}`, 'vertex');
    shader.vertexShader = v;
    let f = shader.fragmentShader;
    f = swap(f, '#include <common>', `#include <common>\n${CROWN_FRAG_PARS}`, 'fragment');
    f = swap(f, '#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${CROWN_FRAG_START}`, 'fragment');
    f = swap(f, '#include <color_fragment>', `#include <color_fragment>\n${CROWN_FRAG_COLOUR}`, 'fragment');
    f = swap(f, '#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${CROWN_FRAG_NORMAL}`, 'fragment');
    f = swap(f, '#include <lights_fragment_end>', `#include <lights_fragment_end>\n${CROWN_FRAG_LIGHT}`, 'fragment');
    shader.fragmentShader = f;
  };
  mat.customProgramCacheKey = () => `interior-crown-${mode}`;
  return thermalKind(mat, 'vegetation');
}
