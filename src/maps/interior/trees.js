/*
 * trees.js: the Interior's forest drawn from canopy.js's own trees
 * (TECH-NEEDS N2: "same data drives the drawn trees, so what you see
 * matches what the room decides").
 *
 * Every tree the room's line of sight tests is a crown drawn where it
 * stands, as big as it is, in four tiers by distance:
 *
 *   near    chunks to NEAR_M: each crown a lumpy twenty sided ball
 *           subdivided once (80 triangles), its trunk under it, casting
 *           shadows;
 *   mid     chunks to MID_M: each crown the plain twenty sided ball (20),
 *           drawn only while the tree itself is nearer than its own
 *           hand over distance (below);
 *   points  chunks from PTS_LO to PTS_HI: each tree one point, shaded in
 *           the fragment as the ellipsoid it is (its outline, its normal),
 *           by the same lit material as the balls, from its hand over
 *           distance to PTS_M's;
 *   blocks  past PTS_M to FAR_M: one point a FAR_BLOCK square of forest,
 *           four crowns' domes in one disc, made once at load.
 *
 * THE HAND OVERS ARE PER TREE, NOT PER CHUNK. A chunk is a square, and a
 * tier that ends on chunks ends in straight lines: round 0's "forest
 * block that ends in a map square" was the mid tier's crowns meeting the
 * old far points on CHUNK's grid. Now the mid balls and the points both
 * hold the trees round the hand over and the GPU picks one for each
 * tree by its own distance against a threshold jittered by its own seed
 * across a band (MID_BAND, PTS_BAND), so the edge is a soft ragged ring
 * with no line in it. A tier's chunks reach a chunk's half diagonal and
 * some relief (CHUNK_SLOP) past its hand over, so every tree the GPU
 * gives it is in it.
 *
 * THE CROWNS' LOOK is in the fragment, so the geometry the room's line
 * of sight is held to (canopy-los.js casts at the near and mid meshes on
 * the CPU) is untouched. A ball's pixel is kept only where its ray meets
 * the true ellipsoid, lobed a few decimetres in, and is lit by that
 * ellipsoid's normal, so no outline is a polygon's and no face is flat,
 * and nothing is drawn outside the crown canopyBlocks tests. A crown is
 * darker underneath and lit and yellower at its top, broken into clumps
 * of leaves (a value noise in world metres, bump and albedo, faded out
 * as it gets under a pixel), and rimmed by the low sun coming through its
 * outer leaves. Its green is its stand's: species grow in patches, so a noise
 * over the forest picks each tree's place on a palette from dark green
 * to olive and yellow green, the tree's own hash moving it a step or
 * two; a few dry crowns, and the lapacho's pink and yellow rare and
 * muted, as a tree in flower is one crown in hundreds.
 *
 * The crowns' sizes are canopy.js's ellipsoids: the ball's unit radius
 * scaled to r across and ry up, centred at cy, and scaled once more by
 * its own fit (fitOf), so its faces sit as far inside the true crown as
 * its corners stand outside: scripts/canopy-los.js measures how often the
 * drawn crowns and canopyBlocks disagree, which is only ever within a
 * few decimetres of a crown's skin.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { HALF, PLAY_HALF } from '../../share/interior/frame.js';
import {
  KIND, TREE_CELL, hash01, noise,
} from '../../share/interior/canopy.js';
import { LAND } from '../../share/interior/world.js';
import { opened } from '../../share/interior/places.js';
import { thermalKind } from '../../render/thermal.js';
import { makeLit } from '../itaipu/look/light.js';

export const CHUNK = 256;
export const NEAR_M = 300;
export const MID_M = 1200;
export const FAR_M = 14000;
/* The mid balls hand a tree to the points at MID_HAND less up to
 * MID_BAND by its seed; the points hand it to the blocks at PTS_M less
 * up to PTS_BAND, metres from the camera. */
const MID_HAND = MID_M - 200;
const MID_BAND = 160;
const PTS_M = 2600;
const PTS_BAND = 320;
/* How far a tree can stand from its chunk's middle as tierOf measures
 * it: the half diagonal and the ground's relief inside a chunk. */
const CHUNK_SLOP = 200;
const PTS_LO = MID_HAND - MID_BAND - CHUNK_SLOP;
const PTS_HI = PTS_M + CHUNK_SLOP;
const FAR_BLOCK = 16;
/* How far past the played square the blocks reach, metres. */
const FAR_MARGIN = 2500;
/* Main thread time a frame may spend making chunks' instance lists. */
const BUILD_MS = 3;
/* The instance capacity of each tier: the most crowns its reach can
 * hold at the forest's density, with room. */
const NEAR_CAP = 24000;
const MID_CAP = 90000;
const PTS_CAP = 480000;
/* The share of the standard material's specular a crown keeps. A
 * point's disc is all grazing normals at its rim, where the Fresnel sheen
 * of the bright sky is strongest: with all of it the points were frosted
 * and 0.03 brighter (sRGB) than the balls over the same forest (camp-
 * orbit-0 and -45, the band 700 to 900 m out, handed over at 600 m and at
 * 1000 m); with none the two matched to 0.01. A leaf's wax keeps a
 * little. */
const CROWN_SPEC = 0.3;

/* Crown albedos, linear, in the order a stand walks them: dark green,
 * green, fresh yellow green, olive, grey green. A forest late in
 * the dry season (BIBLE.md 2.3), semi deciduous: most crowns green, a
 * few turning. */
const PALETTE = [
  [0.03, 0.06, 0.02], [0.038, 0.074, 0.022], [0.048, 0.09, 0.024], [0.062, 0.106, 0.026],
  [0.058, 0.086, 0.03], [0.066, 0.08, 0.034], [0.046, 0.068, 0.034],
];
const DRY = [0.078, 0.07, 0.046];
const PINK = [0.16, 0.06, 0.09];
const YELLOW = [0.17, 0.13, 0.03];
const out3 = [0, 0, 0];
/* A tree's crown colour into out3. `flowers` false for a block, a
 * dozen crowns' worth: one tree in flower is no block's colour. */
function crownColour(t, flowers = true) {
  if (flowers && t.kind === KIND.broadleaf && t.tint > 0.9986) {
    return PINK;
  }
  if (flowers && t.kind === KIND.broadleaf && t.tint > 0.9978) {
    return YELLOW;
  }
  const r1 = hash01(Math.floor(t.tint * 4096), 7, 41);
  const r2 = hash01(Math.floor(t.tint * 4096), 9, 43);
  if (r1 > 0.992) {
    return DRY;
  }
  /* The stand: a noise 70 m a feature, and the region's lean a noise
   * 500 m a feature, so a slope of the forest is olive and the next a
   * darker green. */
  const stand = noise(t.x, t.z, 70, 31) * 0.7 + noise(t.x, t.z, 500, 33) * 0.3;
  const f = Math.min(0.999, Math.max(0, stand * 1.2 - 0.1 + (r1 - 0.5) * 0.8)) * PALETTE.length;
  const k = Math.floor(f);
  const a = PALETTE[k];
  const b = PALETTE[Math.min(PALETTE.length - 1, k + 1)];
  const u = f - k;
  const lum = 0.85 + 0.3 * r2;
  const palm = t.kind === KIND.palm ? 1.1 : 1;
  out3[0] = (a[0] + (b[0] - a[0]) * u) * lum * palm;
  out3[1] = (a[1] + (b[1] - a[1]) * u) * lum * palm;
  out3[2] = (a[2] + (b[2] - a[2]) * u) * lum;
  return out3;
}
/* A tree's seed for the hand overs, in [0, 1), not its colour's. */
const seedOf = (t) => hash01(Math.floor(t.tint * 65536), 3, 47);

/* A ball with lumps: an icosahedron subdivided `detail` times, each
 * vertex pushed in or out by a hash of its direction. */
function crownGeometry(THREE, detail, lump) {
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
function fitOf(geo) {
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
      vCrSeed = vec2(aShape.z, aShape.x / aShape.y);
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
`;
/* At the fragment's start: a point's outline and its normal (view
 * space) from where in the disc it is; a block's four domes. */
const CROWN_FRAG_START = /* glsl */ `
  float crUp = vCrUp;
  float crShadeK = 1.0;
  #if CROWN_MODE < 2
    /* The ball straddles the true crown, its corners out past it: each
     * pixel asks whether its ray meets the ellipsoid itself, a few
     * decimetres smaller where its lobes go in, and takes that point's
     * normal. So no outline is a polygon's and no face is flat, and what
     * is drawn stays inside the crown canopyBlocks tests. */
    vec3 crNW;
    {
      vec3 crRad = vec3(vCrR.x, vCrR.y, vCrR.x);
      vec3 crU = (vCrW - vCrC) / crRad;
      crRad -= 0.42 * crN(normalize(crU) * 2.3 + vCrC * 0.37);
      vec3 crO = (cameraPosition - vCrC) / crRad;
      vec3 crE = normalize(vCrW - cameraPosition) / crRad;
      float crA = dot(crE, crE);
      float crB = dot(crO, crE);
      float crCc = dot(crO, crO) - 1.0;
      float crDisc = crB * crB - crA * crCc;
      vec3 crP = crU;
      if (crCc > 0.0) {
        if (crDisc < 0.0) discard;
        crP = crO + crE * ((-crB - sqrt(crDisc)) / crA);
      }
      crNW = normalize(crP / crRad);
      crUp = crP.y;
    }
  #endif
  #if CROWN_MODE >= 2
    vec2 crQ = (gl_PointCoord * 2.0 - 1.0) * vec2(1.0, -1.0) * vCrHalf.z / vCrHalf.xy;
    float crR2 = dot(crQ, crQ);
    if (crR2 > 1.0) discard;
    vec3 crNrm = vec3(crQ, sqrt(1.0 - crR2));
    #if CROWN_MODE == 3
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
    #endif
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
  float crShade = mix(0.42, 1.0, smoothstep(-0.85, 0.75, crUp)) * crShadeK;
  #if CROWN_MODE < 2
    float crPx = length(fwidth(vCrW));
    float crK1 = 1.0 - smoothstep(0.4, 1.3, crPx);
    float crK2 = 1.0 - smoothstep(0.12, 0.45, crPx);
    vec4 crCG = crNG(vCrW * 0.62);
    float crC = crCG.x;
    float crL = crN(vCrW * 2.1 + 7.0);
    crShade *= mix(1.0, 0.6 + 0.8 * crC, crK1) * mix(1.0, 0.78 + 0.44 * crL, crK2);
  #endif
  diffuseColor.rgb *= crShade;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.22, 1.16, 0.76), smoothstep(0.2, 1.0, crUp) * (CROWN_MODE >= 2 ? 0.45 : 0.6));
`;
/* After the normal: the clumps' bump on the true crown's normal (a
 * ball's), or the point's own normal. The leaves are colour only: a
 * value noise's slope is nothing on its lattice's planes, and at the
 * leaves' scale their bump came out as a grid of squares. */
const CROWN_FRAG_NORMAL = /* glsl */ `
  #if CROWN_MODE < 2
    {
      vec3 crG = crCG.yzw * (0.62 * 0.9 * crK1);
      vec3 crNb = normalize(crNW - (crG - dot(crG, crNW) * crNW));
      normal = normalize((viewMatrix * vec4(crNb, 0.0)).xyz);
    }
  #else
    normal = crNrm;
  #endif
`;
/* After the lights: the low sun through the crown's outer leaves, most
 * when the camera looks toward it. */
const CROWN_FRAG_LIGHT = /* glsl */ `
  #if NUM_DIR_LIGHTS > 0
    {
      vec3 crV = normalize(vViewPosition);
      float crFwd = pow(saturate(dot(-crV, directionalLights[0].direction)), 3.0);
      float crRim = 1.0 - saturate(dot(normal, crV));
      reflectedLight.indirectDiffuse += diffuseColor.rgb * directionalLights[0].color * (0.06 + 0.8 * crFwd) * pow(crRim, 1.5) * RECIPROCAL_PI;
    }
  #endif
  reflectedLight.indirectSpecular *= CROWN_SPEC;
  reflectedLight.directSpecular *= CROWN_SPEC;
`;

function crownMaterial(THREE, mode, uniforms) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.92, metalness: 0, vertexColors: mode >= 2,
  });
  mat.defines = { ...(mat.defines || {}), CROWN_MODE: mode, CROWN_SPEC: CROWN_SPEC.toFixed(2) };
  const swap = (src, anchor, add, where) => {
    if (!src.includes(anchor)) {
      throw new Error(`interior trees: three's ${where} shader has no ${anchor} to patch`);
    }
    return src.replace(anchor, add);
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
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

function chunkKey(i, j) {
  return i * 4096 + j;
}

/*
 * The trees: { group, view(camera, target), stats(), dispose(), near }
 * (near the near tier's crown mesh, for scripts/canopy-los.js's raycast).
 * `canopy` canopy.js makeCanopy's; `world` world.js makeWorld's.
 */
export function buildTrees({
  THREE, scene, quality, canopy, world,
}) {
  const group = new THREE.Group();
  group.name = 'interior-trees';
  scene.add(group);
  const viewPx = { value: 450 };
  const nearGeo = crownGeometry(THREE, 1, 0.12);
  const midGeo = crownGeometry(THREE, 0, 0.08);
  const nearFit = fitOf(nearGeo);
  const midFit = fitOf(midGeo);
  const nearMat = crownMaterial(THREE, 0, { uCrFit: { value: nearFit } });
  const midMat = crownMaterial(THREE, 1, { uCrFit: { value: midFit }, uCrHand: { value: new THREE.Vector2(MID_HAND, MID_BAND) } });
  const ptsMat = crownMaterial(THREE, 2, {
    uCrBand: { value: new THREE.Vector4(MID_HAND, MID_BAND, PTS_M, PTS_BAND) }, uCrPx: viewPx,
  });
  const blockMat = crownMaterial(THREE, 3, {
    uCrBand: { value: new THREE.Vector4(PTS_M, PTS_BAND, FAR_M, 0) }, uCrPx: viewPx,
  });
  /* The balls are meshes, which the look's finishScene gives its one
   * sun from two cascades; the points are not, so they take it here, or
   * they would be lit twice. */
  const lit = makeLit();
  lit(ptsMat);
  lit(blockMat);
  const trunkMat = thermalKind(new THREE.MeshStandardMaterial({ color: 0x3a3631, roughness: 1, metalness: 0 }), 'vegetation');
  const midSeed = new THREE.InstancedBufferAttribute(new Float32Array(MID_CAP), 1);
  midSeed.setUsage(THREE.DynamicDrawUsage);
  midGeo.setAttribute('aSeed', midSeed);
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 1, 5, 1, true);
  trunkGeo.translate(0, 0.5, 0);
  const near = new THREE.InstancedMesh(nearGeo, nearMat, NEAR_CAP);
  const mid = new THREE.InstancedMesh(midGeo, midMat, MID_CAP);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, NEAR_CAP);
  for (const m of [near, mid, trunks]) {
    m.count = 0;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(m);
  }
  near.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NEAR_CAP * 3), 3);
  mid.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MID_CAP * 3), 3);
  near.castShadow = quality === 'high';
  trunks.castShadow = quality === 'high';
  near.receiveShadow = true;
  mid.receiveShadow = true;
  near.name = 'interior-crowns-near';
  mid.name = 'interior-crowns-mid';
  trunks.name = 'interior-trunks';

  /* A point layer: positions (the crown's middle), colours and shapes
   * (r, ry, seed), `cap` of each, drawn by `mat`. */
  function pointLayer(cap, mat, name, dynamic) {
    const geo = new THREE.BufferGeometry();
    const attrs = [['position', 3], ['color', 3], ['aShape', 3]].map(([n, k]) => {
      const a = new THREE.BufferAttribute(new Float32Array(cap * k), k);
      if (dynamic) {
        a.setUsage(THREE.DynamicDrawUsage);
      }
      geo.setAttribute(n, a);
      return a;
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.receiveShadow = true;
    pts.name = name;
    /* The disc's size in pixels needs the target's height, which only
     * the renderer knows as it draws. */
    const vp = new THREE.Vector4();
    pts.onBeforeRender = (renderer) => {
      renderer.getCurrentViewport(vp);
      viewPx.value = vp.w * 0.5;
    };
    group.add(pts);
    return { geo, pts, attrs };
  }
  const ptsLayer = pointLayer(PTS_CAP, ptsMat, 'interior-crowns-points', true);
  ptsLayer.geo.setDrawRange(0, 0);

  /* Per chunk: its trees as point data, made on demand and kept, and as
   * instance matrices once a ball tier first wants it. */
  const chunks = new Map();
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  function makeChunk(ci, cj) {
    const x0 = -HALF + ci * CHUNK;
    const z0 = -HALF + cj * CHUNK;
    const list = canopy.treesIn(x0, z0, x0 + CHUNK, z0 + CHUNK, []);
    const at = new Float32Array(list.length * 3);
    const shape = new Float32Array(list.length * 3);
    const cols = new Float32Array(list.length * 3);
    const seeds = new Float32Array(list.length);
    list.forEach((t, k) => {
      at[k * 3] = t.x;
      at[k * 3 + 1] = t.cy;
      at[k * 3 + 2] = t.z;
      seeds[k] = seedOf(t);
      shape[k * 3] = t.r;
      shape[k * 3 + 1] = t.ry;
      shape[k * 3 + 2] = seeds[k];
      const c = crownColour(t);
      cols[k * 3] = c[0];
      cols[k * 3 + 1] = c[1];
      cols[k * 3 + 2] = c[2];
    });
    const ch = {
      ci, cj, n: list.length, list, at, shape, cols, seeds, crowns: null, tier: -1, pts: false,
    };
    chunks.set(chunkKey(ci, cj), ch);
    return ch;
  }
  function chunkMatrices(ch) {
    const { list } = ch;
    ch.crowns = new Float32Array(list.length * 16);
    ch.crownsMid = new Float32Array(list.length * 16);
    ch.trunks = new Float32Array(list.length * 16);
    list.forEach((t, k) => {
      q.setFromAxisAngle(yAxis, t.tint * 6.283);
      pos.set(t.x, t.cy, t.z);
      scl.set(t.r * nearFit, t.ry * nearFit, t.r * nearFit);
      m4.compose(pos, q, scl);
      m4.toArray(ch.crowns, k * 16);
      scl.set(t.r * midFit, t.ry * midFit, t.r * midFit);
      m4.compose(pos, q, scl);
      m4.toArray(ch.crownsMid, k * 16);
      const base = t.cy - t.ry * 0.7;
      pos.set(t.x, t.ground - 0.3, t.z);
      const thick = t.kind === KIND.palm ? 1.4 : 1 + t.r * 0.25;
      scl.set(thick, base - t.ground + 0.3, thick);
      m4.compose(pos, q, scl);
      m4.toArray(ch.trunks, k * 16);
    });
  }

  /* THE BLOCKS: a point a FAR_BLOCK square that is forest (or shrub)
   * and not opened, at the block's middle jittered, as wide as a block
   * and a half so the forest closes, over the played square and its
   * margin. */
  const farHalf = Math.min(HALF, PLAY_HALF + FAR_MARGIN);
  const farPos = [];
  const farCol = [];
  const farShape = [];
  for (let z = -farHalf; z < farHalf; z += FAR_BLOCK) {
    for (let x = -farHalf; x < farHalf; x += FAR_BLOCK) {
      const bi = Math.floor((x + HALF) / FAR_BLOCK);
      const bj = Math.floor((z + HALF) / FAR_BLOCK);
      const px = x + FAR_BLOCK * (0.2 + 0.6 * hash01(bi, bj, 21));
      const pz = z + FAR_BLOCK * (0.2 + 0.6 * hash01(bi, bj, 22));
      const cls = world.landAt(px, pz);
      if (cls !== LAND.forest && cls !== LAND.shrub) {
        continue;
      }
      if (opened(px, pz, 4)) {
        continue;
      }
      /* The block's own tree for its height: the one in the square its
       * middle falls in, if any. */
      const t = canopy.treeAt(Math.floor((px + HALF) / TREE_CELL), Math.floor((pz + HALF) / TREE_CELL));
      const h = t ? t.h : 14;
      const r = cls === LAND.forest ? FAR_BLOCK * 0.72 : FAR_BLOCK * 0.4;
      const ry = Math.min(r, 0.42 * h);
      farPos.push(px, world.groundAt(px, pz) + h - ry, pz);
      const c = crownColour({
        x: px, z: pz, tint: t ? t.tint : hash01(bi, bj, 23), kind: KIND.broadleaf,
      }, false);
      farCol.push(c[0], c[1], c[2]);
      farShape.push(r, ry, hash01(bi, bj, 24));
    }
  }
  const farGeo = new THREE.BufferGeometry();
  farGeo.setAttribute('position', new THREE.Float32BufferAttribute(farPos, 3));
  farGeo.setAttribute('color', new THREE.Float32BufferAttribute(farCol, 3));
  farGeo.setAttribute('aShape', new THREE.Float32BufferAttribute(farShape, 3));
  const far = new THREE.Points(farGeo, blockMat);
  far.frustumCulled = false;
  far.receiveShadow = true;
  far.name = 'interior-crowns-far';
  {
    const vp = new THREE.Vector4();
    far.onBeforeRender = (renderer) => {
      renderer.getCurrentViewport(vp);
      viewPx.value = vp.w * 0.5;
    };
  }
  group.add(far);

  /* A chunk's distance from a camera at cam, as the tiers measure it. */
  const distOf = (ci, cj, cam) => {
    const mx = -HALF + (ci + 0.5) * CHUNK;
    const mz = -HALF + (cj + 0.5) * CHUNK;
    const my = world.groundAt(mx, mz) + 12;
    return Math.sqrt((mx - cam.x) ** 2 + (my - cam.y) ** 2 + (mz - cam.z) ** 2);
  };

  let wanted = [];
  let moved = true;
  let ballKey = '';
  let ptsKey = '';
  const last = new THREE.Vector3(Infinity, 0, 0);
  const stats = {
    chunks: 0, near: 0, mid: 0, points: 0, far: farPos.length / 3, built: 0, pending: 0, lastMs: 0,
  };

  function refillBalls(ready) {
    let n = 0;
    let m = 0;
    for (const ch of ready) {
      if (ch.tier === 0) {
        if (n + ch.n > NEAR_CAP) {
          continue;
        }
        near.instanceMatrix.array.set(ch.crowns, n * 16);
        trunks.instanceMatrix.array.set(ch.trunks, n * 16);
        near.instanceColor.array.set(ch.cols, n * 3);
        n += ch.n;
      } else if (ch.tier === 1) {
        if (m + ch.n > MID_CAP) {
          continue;
        }
        mid.instanceMatrix.array.set(ch.crownsMid, m * 16);
        mid.instanceColor.array.set(ch.cols, m * 3);
        midSeed.array.set(ch.seeds, m);
        m += ch.n;
      }
    }
    near.count = n;
    trunks.count = n;
    mid.count = m;
    for (const im of [near, mid, trunks]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) {
        im.instanceColor.needsUpdate = true;
      }
    }
    midSeed.needsUpdate = true;
    stats.near = n;
    stats.mid = m;
  }

  function refillPoints(ready) {
    const [pa, ca, sa] = ptsLayer.attrs;
    let n = 0;
    for (const ch of ready) {
      if (!ch.pts || n + ch.n > PTS_CAP) {
        continue;
      }
      pa.array.set(ch.at, n * 3);
      ca.array.set(ch.cols, n * 3);
      sa.array.set(ch.shape, n * 3);
      n += ch.n;
    }
    for (const a of ptsLayer.attrs) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * 3);
      a.needsUpdate = true;
    }
    ptsLayer.geo.setDrawRange(0, n);
    stats.points = n;
  }

  function view(camera) {
    const cam = camera.position;
    const t0 = performance.now();
    /* The chunks a tier wants for this camera, nearest tier first. */
    if (cam.distanceTo(last) > 24 || moved) {
      const reach = Math.ceil(PTS_HI / CHUNK) + 1;
      const ci0 = Math.floor((cam.x + HALF) / CHUNK);
      const cj0 = Math.floor((cam.z + HALF) / CHUNK);
      const list = [];
      const max = Math.floor((2 * HALF) / CHUNK) - 1;
      for (let cj = Math.max(0, cj0 - reach); cj <= Math.min(max, cj0 + reach); cj += 1) {
        for (let ci = Math.max(0, ci0 - reach); ci <= Math.min(max, ci0 + reach); ci += 1) {
          const d = distOf(ci, cj, cam);
          const tier = d < NEAR_M ? 0 : d < MID_M ? 1 : 2;
          const pts = d >= PTS_LO && d < PTS_HI;
          if (tier < 2 || pts) {
            list.push({
              ci, cj, tier, pts, d,
            });
          }
        }
      }
      list.sort((a, b) => a.tier - b.tier || a.d - b.d);
      wanted = list;
      last.copy(cam);
      moved = false;
    }
    let pending = 0;
    const ready = [];
    for (const w of wanted) {
      let ch = chunks.get(chunkKey(w.ci, w.cj));
      if (!ch || (w.tier < 2 && !ch.crowns)) {
        if (performance.now() - t0 > BUILD_MS) {
          pending += 1;
          continue;
        }
        ch = ch || makeChunk(w.ci, w.cj);
        if (w.tier < 2) {
          chunkMatrices(ch);
        }
        stats.built += 1;
      }
      ch.tier = w.tier;
      ch.pts = w.pts;
      ready.push(ch);
    }
    /* Refill a layer only when the chunks it draws changed. */
    let bk = '';
    let pk = '';
    for (const ch of ready) {
      if (ch.tier < 2) {
        bk += `${ch.ci},${ch.cj},${ch.tier};`;
      }
      if (ch.pts) {
        pk += `${ch.ci},${ch.cj};`;
      }
    }
    if (bk !== ballKey) {
      refillBalls(ready);
      ballKey = bk;
    }
    if (pk !== ptsKey) {
      refillPoints(ready);
      ptsKey = pk;
    }
    stats.chunks = chunks.size;
    stats.pending = pending;
    stats.lastMs = performance.now() - t0;
  }

  /* Every chunk the camera's first place wants, made now: the first frame
   * the pilot sees has its trees. */
  function settle(camera) {
    for (let k = 0; k < 400; k += 1) {
      view(camera);
      if (!stats.pending) {
        return;
      }
    }
  }

  return {
    group,
    near,
    mid,
    far,
    points: ptsLayer.pts,
    view,
    settle,
    /* The look moves the sun's light itself; the crowns are lit
     * materials. Kept for the map's call. */
    setSun() {},
    stats: () => ({ ...stats }),
    dispose() {
      for (const g of [nearGeo, midGeo, trunkGeo, farGeo, ptsLayer.geo]) {
        g.dispose();
      }
      for (const m of [nearMat, midMat, ptsMat, blockMat, trunkMat]) {
        m.dispose();
      }
      group.removeFromParent();
    },
  };
}
