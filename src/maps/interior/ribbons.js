/*
 * ribbons.js: what lies along a line on the Interior's land, drawn: the
 * roads (places.js ROADS) in the region's red earth, and Río Sereno and
 * its streams (hydro.js) in brown water over sandy banks.
 *
 * A RIBBON is a strip of quads along a polyline, each vertex carrying
 * how far across the strip it stands (aStrip: metres from the centre
 * line, signed, the half width of what is drawn there, and one number
 * more of the strip's own), so the shaders draw the across detail (a
 * road's ruts and verge, a river's shallows and sandbars) at any width
 * and fade the strip's edges into the ground under it.
 *
 * ROADS. Laterite, rutted by wheels, crowned between the ruts, its edge
 * ragged where the grass takes it back, and a cleared verge of dust a
 * few metres either side: from a survey's altitude a road is two or
 * three pixels, and it is the pale verge that makes it read, as it does
 * in the reference aerials. The ruts draw only when a pixel is small
 * enough to see them.
 *
 * WATER. A slow river the colour of the silt it carries, its surface
 * smooth enough to show the sky at a low angle and to throw the sun's
 * glint, rippled so neither is a mirror. The dry season's river is low:
 * sand bars stand out of it on the inside of its bends, where the
 * current is slow, and a bank of wet then dry sand runs either side of
 * the water before the grass and the gallery forest.
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

import { ROADS } from '../../share/interior/places.js';
import { RIVER, STREAMS } from '../../share/interior/hydro.js';
import { HALF } from '../../share/interior/frame.js';
import { thermalKind } from '../../render/thermal.js';

/* Metres of cleared verge either side of a road's carriageway. */
const VERGE = 3;
/* Metres of bank either side of the drawn water, and how much wider
 * than its channel the water is drawn, so it laps its banks. */
const BANK = 9;
const LAP = 8;

/*
 * Samples every `step` metres along a polyline (world [x, z]): each
 * { x, z, tx, tz (the unit tangent), f (0 to 1 along) }.
 */
function samples(points, step) {
  const pts = [];
  for (let k = 0; k + 1 < points.length; k += 1) {
    const [ax, az] = points[k];
    const [bx, bz] = points[k + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let t = 0; t < n; t += 1) {
      pts.push([ax + ((bx - ax) * t) / n, az + ((bz - az) * t) / n]);
    }
  }
  pts.push(points[points.length - 1]);
  return pts.map(([x, z], k) => {
    const [px, pz] = pts[Math.max(0, k - 1)];
    const [nx, nz] = pts[Math.min(pts.length - 1, k + 1)];
    const l = Math.hypot(nx - px, nz - pz) || 1;
    return {
      x, z, tx: (nx - px) / l, tz: (nz - pz) / l, f: k / Math.max(1, pts.length - 1),
    };
  });
}

/* A growing indexed strip mesh: position and aStrip. */
function makeStrips() {
  const pos = [];
  const strip = [];
  const index = [];
  return {
    pos,
    strip,
    index,
    /*
     * One ribbon: `across` the offsets (metres, left negative) of its
     * columns at a sample, `yAt(x, z, s)` the height, `extra(s)` aStrip's
     * third number, `half(s)` its second; `skip(s)` drops the quad
     * ending at s.
     */
    add(ss, { across, yAt, half, extra = () => 0, skip = null }) {
      let prev = -1;
      for (const s of ss) {
        const cols = across(s);
        const base = pos.length / 3;
        for (const a of cols) {
          /* A positive offset is toward (tz, -tx), a negative one the
           * other side. */
          const x = s.x + s.tz * a;
          const z = s.z - s.tx * a;
          pos.push(x, yAt(x, z, s), z);
          strip.push(a, half(s), extra(s));
        }
        if (prev >= 0 && !(skip && skip(s))) {
          for (let c = 0; c + 1 < cols.length; c += 1) {
            const a0 = prev + c;
            const b0 = base + c;
            index.push(a0, b0, b0 + 1, a0, b0 + 1, a0 + 1);
          }
        }
        prev = base;
      }
    },
  };
}

function meshOf(THREE, s, mat, name) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(s.pos, 3));
  g.setAttribute('aStrip', new THREE.Float32BufferAttribute(s.strip, 3));
  g.setIndex(s.index);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  m.name = name;
  m.castShadow = false;
  m.receiveShadow = true;
  m.renderOrder = 2;
  return m;
}

/* Value noise and the world position, for both materials. */
const NOISE = /* glsl */ `
varying vec3 vRbWorld;
varying vec3 vRbStrip;
float rbHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float rbNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(rbHash(i), rbHash(i + vec2(1.0, 0.0)), u.x),
    mix(rbHash(i + vec2(0.0, 1.0)), rbHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
/* A band of half width hw at distance d from its centre, as much of a
 * pixel of footprint fp as it covers. */
float rbBand(float d, float hw, float fp) {
  float e = max(fp, 0.02);
  return clamp((hw + e * 0.5 - abs(d)) / e, 0.0, 1.0) * min(1.0, 2.0 * hw / e + 0.1);
}
`;

function patch(m, key, fragment) {
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aStrip;\nvarying vec3 vRbWorld;\nvarying vec3 vRbStrip;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vRbWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vRbStrip = aStrip;`);
    shader.fragmentShader = fragment(shader.fragmentShader.replace('#include <common>', `#include <common>\n${NOISE}`));
  };
  m.customProgramCacheKey = () => key;
  m.name = key;
  return m;
}

/*
 * The roads' material: the colour and alpha from aStrip (across, half
 * the carriageway, the verge). No thermal kind, as the roads had none
 * before: 'ground' is Itaipu's land cover blend, which needs its own
 * uniforms.
 */
function roadMaterial(THREE) {
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  patch(m, 'interior-roads', (fs) => fs.replace('#include <map_fragment>', `#include <map_fragment>
    {
      vec2 w = vRbWorld.xz;
      vec2 dw = fwidth(w);
      float fp = max(dw.x, dw.y);
      float a = vRbStrip.x;
      float hw = vRbStrip.y;
      float verge = vRbStrip.z;
      float d = abs(a);
      /* The carriageway's edge, ragged where the grass grows back. */
      float rag = (rbNoise(w * 0.45) - 0.5) * 0.9 + (rbNoise(w * 2.3) - 0.5) * 0.35;
      float core = clamp((hw + rag - d) / max(fp, 0.25) + 0.5, 0.0, 1.0);
      vec3 earth = vec3(0.34, 0.1, 0.036) * (0.85 + 0.3 * rbNoise(w * 0.18));
      /* Two lanes' wheel tracks on a road, one pair on a track, packed
       * darker; the crown between them dusty and lighter. */
      float ruts = 0.0;
      if (hw > 2.4) {
        ruts = max(max(rbBand(d - hw * 0.3, 0.32, fp), rbBand(d - hw * 0.72, 0.32, fp)), 0.0);
      } else {
        ruts = rbBand(d - 0.8, 0.28, fp);
      }
      float crown = (1.0 - smoothstep(0.0, hw * 0.5, d)) * 0.5;
      vec3 col = earth * (1.0 + 0.18 * crown) * mix(1.0, 0.84, ruts);
      col = mix(col, vec3(0.27, 0.14, 0.08), crown * 0.35 * (1.0 - ruts));
      /* Gravel and clods, close up. */
      float near = 1.0 - smoothstep(0.03, 0.2, fp);
      col *= 1.0 + (rbNoise(w * 9.0) - 0.5) * 0.4 * near;
      /* The verge: dust and worn dry grass, thinning out. */
      float vn = rbNoise(w * 0.6 + 7.0);
      float vergeA = (1.0 - smoothstep(hw, hw + verge, d + (vn - 0.5) * 2.0)) * 0.8;
      vec3 dust = mix(vec3(0.26, 0.15, 0.085), vec3(0.2, 0.15, 0.085), vn);
      diffuseColor.rgb = mix(dust, col, core);
      diffuseColor.a = max(core, vergeA);
    }`));
  return m;
}

/*
 * The water's material: aStrip (across, the water's half width, the
 * bend: how sharply the river turns there, signed toward the inside).
 *
 * WHAT THE WATER IS AT RANGE. From a survey's altitude a silty river is
 * as much what it reflects as its own brown: Fresnel's share of the sky
 * grows from 4 per cent looking straight down to a fifth and more at the
 * survey views' 15 to 25 degrees, so the water reads brown under the
 * nadir camera and blue grey with the sky toward the horizon, and throws
 * the sun's glint where the camera looks toward it. Round 3's water was a
 * red brown (0.1, 0.07, 0.042) with the environment at 0.45, and ripples
 * tipping the normal at every pixel whatever its footprint, which a
 * camera a kilometre off averaged into a matte surface: a pinkish ribbon.
 * So the brown is a third darker and olive (a red brown under a blue sky
 * printed lavender), the environment is the sky at full (it is baked at
 * the hour's share already, look.js), and the ripples fade with the
 * pixel's footprint into a rougher surface, which is what they are when
 * too small to see; close up (low-bridge) the water stays the muddy
 * brown of the references, with its glint. The sand bars stand only in
 * the tighter bends and take at most about a quarter of the width: at up
 * to two fifths of it in every bend of a river that meanders everywhere,
 * round 3's sand left a thin dark thread inside a pale ribbon.
 *
 * Round 6: at a survey's range the water was still a thin dark thread,
 * darker than the gallery forest either side, where every reference
 * aerial shows the river lighter than its banks: the silt's own tan
 * seen through a surface that also carries the sky. The dark deep brown
 * is the water's colour under a camera close enough to see into it;
 * past a few metres a pixel the silt (siltFar) takes over, with the
 * surface at the slick's low roughness so the sky's sheen rides on the
 * tan rather than on a near black. The blue grey haze (look.js) keeps
 * the sheen from printing lavender as round 3's did.
 */
function waterMaterial(THREE) {
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.12,
    metalness: 0,
    envMapIntensity: 1,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  patch(m, 'interior-water', (fs) => fs
    .replace('#include <map_fragment>', `#include <map_fragment>
      float rbBar = 0.0;
      float rbFp = 1.0;
      {
        vec2 w = vRbWorld.xz;
        vec2 dw = fwidth(w);
        rbFp = max(dw.x, dw.y);
        float a = vRbStrip.x;
        float hw = vRbStrip.y;
        float bend = vRbStrip.z;
        float t = a / max(hw, 0.1);
        /* Deep water dark with silt, the shallows toward each side
         * lighter where the bed shows through, and plumes of muddier
         * water drawn out by the current. */
        float shallow = smoothstep(0.6, 1.0, abs(t));
        vec3 deep = vec3(0.068, 0.056, 0.035);
        vec3 shoal = vec3(0.11, 0.092, 0.06);
        float swirl = rbNoise(w * 0.008) * 0.5 + rbNoise(w * 0.03) * 0.3 + rbNoise(w * 0.11) * 0.2;
        vec3 col = mix(deep, shoal, shallow * 0.75) * (0.8 + 0.45 * swirl);
        vec3 siltFar = vec3(0.19, 0.15, 0.095) * (0.88 + 0.25 * swirl);
        col = mix(col, siltFar, smoothstep(0.3, 2.0, rbFp));
        /* Sand bars on the inside of a tighter bend (bend's sign is the
         * inside), wider where it turns harder, broken along it. */
        float inside = t * sign(bend);
        float reach = smoothstep(0.3, 1.0, abs(bend));
        float n = rbNoise(w * 0.012) * 0.65 + rbNoise(w * 0.05) * 0.35;
        float bar = smoothstep(1.0 - 0.5 * reach, 1.04 - 0.5 * reach, inside + (n - 0.5) * 0.35)
          * step(0.01, reach) * smoothstep(0.35, 0.55, n);
        rbBar = bar;
        vec3 sand = mix(vec3(0.21, 0.175, 0.13), vec3(0.16, 0.135, 0.1), rbNoise(w * 0.3));
        /* Wet sand at the bar's edge, darker. */
        sand *= mix(0.65, 1.0, smoothstep(0.0, 0.5, bar));
        diffuseColor.rgb = mix(col, sand, bar);
        /* The edge laps the bank under it. */
        diffuseColor.a = max(bar, 1.0 - smoothstep(0.8, 1.0, abs(t) + (rbNoise(w * 0.2) - 0.5) * 0.12)) * mix(0.96, 1.0, bar);
      }`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      /* Ripples too small for a pixel to hold are a rougher surface,
       * rougher in the reaches the wind catches than in the calm
       * slicks, which are what a river seen from far shows of its
       * surface. */
      {
        float slick = rbNoise(vRbWorld.xz * 0.006 + 3.7) * 0.7 + rbNoise(vRbWorld.xz * 0.02) * 0.3;
        float far = mix(0.08, 0.24, smoothstep(0.3, 0.75, slick));
        roughnessFactor = mix(mix(roughnessFactor, far, smoothstep(0.5, 6.0, rbFp)), 1.0, rbBar);
      }`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        /* Ripples: the noise's slope tips the normal a few degrees, so
         * the sky and the sun break up on the surface, faded before a
         * pixel is too big to hold one. */
        vec2 w = vRbWorld.xz;
        float e = 0.7;
        float h0 = rbNoise(w * 0.45) + 0.5 * rbNoise(w * 1.7);
        float hx = rbNoise((w + vec2(e, 0.0)) * 0.45) + 0.5 * rbNoise((w + vec2(e, 0.0)) * 1.7);
        float hz = rbNoise((w + vec2(0.0, e)) * 0.45) + 0.5 * rbNoise((w + vec2(0.0, e)) * 1.7);
        float seen = 1.0 - smoothstep(0.4, 2.5, rbFp);
        vec3 tip = vec3(h0 - hx, 0.0, h0 - hz) * 0.12 * (1.0 - rbBar) * seen;
        normal = normalize(normal + (viewMatrix * vec4(tip, 0.0)).xyz);
      }`));
  return thermalKind(m, 'water');
}

/*
 * The banks' material, aStrip (across, the bend as the water's, the
 * water's half width; the bank reaches BANK + 2 past that, buildWater's
 * bank columns). Sand where a bend's inside leaves it; on the outside of
 * a bend and along the straights a strip of wet mud going to the
 * gallery's grass and scrub. Round 3's bank was dry sand the whole way,
 * a pale border either side of the river at range.
 */
function bankMaterial(THREE) {
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1.5,
    polygonOffsetUnits: -1.5,
  });
  patch(m, 'interior-banks', (fs) => fs.replace('#include <map_fragment>', `#include <map_fragment>
    {
      vec2 w = vRbWorld.xz;
      float d = abs(vRbStrip.x);
      float bend = vRbStrip.y;
      float water = vRbStrip.z;
      float outer = water + ${(BANK + 2).toFixed(1)};
      float k = clamp((d - water) / max(outer - water, 1.0), 0.0, 1.0);
      float n = rbNoise(w * 0.08) * 0.6 + rbNoise(w * 0.4) * 0.4;
      float bars = rbNoise(w * 0.012) * 0.65 + rbNoise(w * 0.05) * 0.35;
      float beach = smoothstep(0.15, 0.6, bend * sign(vRbStrip.x)) * smoothstep(0.35, 0.6, bars);
      vec3 wet = vec3(0.07, 0.056, 0.04);
      vec3 dry = vec3(0.18, 0.155, 0.118);
      vec3 grass = vec3(0.062, 0.07, 0.034);
      vec3 sand = mix(wet, dry, smoothstep(0.0, 0.35, k));
      vec3 mud = mix(wet, grass, smoothstep(0.05, 0.4, k + (n - 0.5) * 0.4));
      diffuseColor.rgb = mix(mud, sand, beach) * (0.85 + 0.3 * n);
      diffuseColor.a = 1.0 - smoothstep(mix(0.2, 0.45, beach), 1.0, k + (n - 0.5) * 0.5);
    }`));
  return m;
}

/*
 * The roads: { mesh, triangles }. `ground(x, z)` the ground's height,
 * `skip(x, z)` true where a road is not drawn (a bridge's deck).
 */
export function buildRoads({ THREE, ground, skip }) {
  const s = makeStrips();
  for (const r of ROADS) {
    const hw = r.width / 2;
    const out = hw + VERGE;
    s.add(samples(r.points, 8), {
      across: () => [-out, -hw, hw, out],
      yAt: (x, z) => ground(x, z) + 0.08,
      half: () => hw,
      extra: () => VERGE,
      skip: (p) => skip(p.x, p.z),
    });
  }
  const mesh = meshOf(THREE, s, roadMaterial(THREE), 'interior-roads');
  return { mesh, triangles: s.index.length / 3 };
}

/*
 * How sharply a line turns at each sample, positive where the inside of
 * the turn is the positive offset's side (makeStrips): 1 at a radius of
 * `tight` metres or less, 0 on the straight; smoothed over `span`
 * samples either side.
 */
function bends(ss, tight, span) {
  const raw = ss.map((s, k) => {
    const a = ss[Math.max(0, k - 2)];
    const b = ss[Math.min(ss.length - 1, k + 2)];
    const ds = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    /* The tangent's turn onto the positive side (tz, -tx) is the
     * negative of the cross product of the two tangents. */
    const cross = a.tx * b.tz - a.tz * b.tx;
    return -cross / ds;
  });
  return raw.map((_, k) => {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, k - span); j <= Math.min(raw.length - 1, k + span); j += 1) {
      sum += raw[j];
      n += 1;
    }
    const kappa = sum / n;
    return Math.max(-1, Math.min(1, kappa * tight));
  });
}

/*
 * Río Sereno and its streams: { meshes, rivers (the plant's channels),
 * triangles }.
 */
export function buildWater({ THREE, ground }) {
  /* The river where it runs in the data's square. */
  const inSquare = RIVER.points.map(([x, z]) => Math.abs(x) < HALF && Math.abs(z) < HALF);
  const first = inSquare.indexOf(true);
  const lastIn = inSquare.lastIndexOf(true);
  const rpts = RIVER.points.slice(first, lastIn + 1);
  const rlev = RIVER.level.slice(first, lastIn + 1);
  const rwid = RIVER.width.slice(first, lastIn + 1);
  const at = (f) => Math.min(rpts.length - 1, Math.round(f * (rpts.length - 1)));
  const ss = samples(rpts, 15);
  const bend = bends(ss, 260, 4);
  const bendAt = new Map(ss.map((s, k) => [s, bend[k]]));
  const water = makeStrips();
  const banks = makeStrips();
  const halfW = (s) => (rwid[at(s.f)] + LAP) / 2;
  water.add(ss, {
    across: (s) => [-halfW(s), halfW(s)],
    yAt: (x, z, s) => rlev[at(s.f)],
    half: halfW,
    extra: (s) => bendAt.get(s),
  });
  banks.add(ss, {
    across: (s) => [-halfW(s) - BANK, -halfW(s) + 2, halfW(s) - 2, halfW(s) + BANK],
    yAt: (x, z) => ground(x, z) + 0.1,
    half: (s) => bendAt.get(s),
    extra: (s) => halfW(s) - 2,
  });
  for (const st of STREAMS) {
    const hw = Math.min(7, 2.5 + st.km2 * 0.35) / 2;
    water.add(samples(st.points, 20), {
      across: () => [-hw, hw],
      yAt: (x, z) => ground(x, z) + 0.15,
      half: () => hw,
    });
  }
  const meshes = [
    meshOf(THREE, banks, bankMaterial(THREE), 'interior-banks'),
    meshOf(THREE, water, waterMaterial(THREE), 'interior-water'),
  ];
  meshes[1].renderOrder = 3;
  const rivers = [{
    line: rpts.map(([x, z], k) => ({ x, y: rlev[k], z })),
    width: Math.min(...rwid) + 4,
  }];
  return { meshes, rivers, triangles: (banks.index.length + water.index.length) / 3 };
}
