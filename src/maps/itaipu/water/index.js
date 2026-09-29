/*
 * water/index.js: Itaipu's water, drawn (docs/ITAIPU-PLAN.md section 5,
 * package E).
 *
 *   The reservoir at 219.0 m and the river below the dam at 103.5 m, each
 *   over its outline from water.json, in swiss2's water material
 *   (swiss2/water/surface.js): Fresnel at water's index, the sun's
 *   glitter, ripples drifting with the wind (on the river, downstream
 *   with the current), shore foam, and the body's colour deepening away
 *   from the shore. Past the ring each body carries on over the apron
 *   (APRON_REACH), so from the air the lake fades into the haze.
 *
 *   The spillway's three chutes running white, a sheet CHUTE_SHEET deep
 *   over package D's chute floors (the dam part's roof records of kind
 *   `spillway chute`, which are built before this part), so the water
 *   lies between D's training walls on D's floor, whatever profile D
 *   gave it. The chute is not plant water. Its floor stays D's ground,
 *   and this part makes those records' material `water` (section 5:
 *   "whose crash surface answers water while the spillway runs"), so a
 *   craft that touches the chute rides the floor, the crash world reads
 *   water there (the map's surfaceAt), and it never floats.
 *
 *   White water where the chute plunges into the river, and the churn
 *   of the draft tubes along the powerhouse's downstream face.
 *
 *   ONE planar mirror, following the body under the camera: over the
 *   reservoir the reservoir mirrors the dam and its shores, down in the
 *   canyon the river mirrors the canyon walls; the other body takes the
 *   sky's light only. At swiss2's own scales (WATER_TIERS), and drawn at
 *   most once a frame, from the scene's onBeforeRender, since the part
 *   is handed no renderer: the map's first scene draw each frame after
 *   update() draws it.
 *
 *   The plant's waves (src/render/lakewaves.js), once the shell hands
 *   them over (setWaves, updateWaves, from the map): each body's
 *   surface lit by the slope of its own waves.
 *
 * WHY THE DEPTH IS NOT THE GROUND'S. The pipeline lowered the terrain
 * inside every outline to a bed three metres under the water (section 4),
 * so under the water the ground says every body is three metres deep. That
 * is right for the shore, where the drawn ground rises through the water,
 * and is what the foam and the shallows are drawn from; away from it the
 * water deepens with the distance from dry ground (DEEPEN per metre),
 * which is what a drowned valley does. Both come from one texture over the
 * hero at the terrain's 10 m (field()), read per pixel, so the shore's
 * line is the drawn terrain's and not a mesh's.
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

import { insideWater } from '../../../game/water.js';

/* The drawn sheet of water running down the chute over D's floor, m: a
 * spillway's flow at speed is a few decimetres to a metre deep. */
const CHUTE_SHEET = 0.4;
/* The roughness the chute's water is drawn with, as a bed slope (the
 * stream shader's measure of white water): the whole chute runs white at
 * speed, its level reach included, not only where the floor is steep. */
const CHUTE_ROUGH = 0.32;
/* D's roof records for the chute floors (dam/index.js slopeRoof). */
const CHUTE_KIND = 'spillway chute';

/* How far past the ring a body's water is carried over the apron, and
 * past either end of where it meets the edge. */
const APRON_REACH = 30000;
const APRON_WIDEN = 200;

/* The depth field's cell, m: the hero terrain's own. */
const FIELD_CELL = 10;
/* How much deeper the water gets per metre from dry ground. */
const DEEPEN = 0.08;
/* How far the distance to dry ground is counted, m. */
const FIELD_REACH = 3000;

/* swiss2's WATER_TIERS mirror scales (swiss2/water/index.js), so this
 * mirror costs what swiss2's lake's does: a fraction of the drawing
 * buffer's size, none on Low. */
const MIRROR_SCALE = { high: 0.5, medium: 0.34, low: 0 };
/* Past this from a body's shore the camera's view of it is a sliver the
 * sky's light carries: swiss2's MIRROR_REACH. */
const MIRROR_REACH = 2000;

/* The churn along the powerhouse's downstream face: from the face out
 * this far, m. The face is half the powerhouse's published width off its
 * axis (dam.json figures.width). */
const CHURN_REACH = 170;
/* The white water where the chute's jet comes down, m round the foot. */
const PLUNGE_R = 170;

/*
 * The colours, linear. Itaipu's water is a tropical reservoir's, not a
 * glacier's: a blue green that reads blue from the air for the sky it
 * holds, green brown over its mud shallows, and the river below a greyer
 * green with the sediment the turbines stir (reservoir-dam, aerial-dam,
 * river-below).
 */
const LOOK = {
  reservoir: {
    body: [0.02, 0.075, 0.085], shallow: [0.05, 0.1, 0.075], deep: [0.012, 0.05, 0.07], clarity: 0.9, ripple: 0.35, roughness: 0.035,
  },
  river: {
    body: [0.035, 0.07, 0.062], shallow: [0.06, 0.085, 0.065], deep: [0.028, 0.06, 0.058], clarity: 1.2, ripple: 0.55, roughness: 0.05,
  },
};
/* A spillway at speed is air as much as water: white, a little green
 * grey in its troughs (chute-running). */
const CHUTE_BODY = [0.55, 0.58, 0.55];

/* ----------------------------------------------------------- the chute */

/* The chute's axis from dam.json, as D lays its floors out along it: the
 * point at the gates and the unit vector down the chute. */
export function chuteAxis(dam) {
  const spill = dam.find((p) => p.part === 'spillway');
  const chute = spill && (spill.sections || []).find((s) => s.at === 'chute');
  if (!chute) {
    throw new Error('itaipu water: dam.json has no spillway chute section');
  }
  const [a, b] = chute.axis;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return { origin: a, along: [(b[0] - a[0]) / len, (b[1] - a[1]) / len], length: len };
}

/*
 * D's chute floor records among `roofs`, each as its quad: corners
 * [x, y, z] in D's order (across at the upper end, then back at the
 * lower), the floor's height at each from the record's own plane.
 */
export function chuteFloors(roofs) {
  return roofs.filter((r) => r.kind === CHUTE_KIND).map((rec) => {
    if (rec.c !== 1 || rec.s !== 0 || rec.faces.length !== 2) {
      throw new Error('itaipu water: a spillway chute record is not the two world triangles dam/index.js slopeRoof makes');
    }
    const [f0, f1] = rec.faces;
    const at = (f, [x, z]) => [x + rec.tx, rec.ty + f.a * x + f.b * z + f.d, z + rec.tz];
    return { rec, quad: [at(f0, f0.pts[0]), at(f0, f0.pts[1]), at(f0, f0.pts[2]), at(f1, f1.pts[2])] };
  });
}

/* The sheet over D's floors: per floor a quad CHUTE_SHEET over it, with
 * the stream material's aWater (depth, metres down the chute, across -1
 * to 1, the roughness as a slope) and aFlow. */
function chuteGeometry(THREE, floors, axis) {
  const pos = [];
  const water = [];
  const flow = [];
  const idx = [];
  const down = (p) => (p[0] - axis.origin[0]) * axis.along[0] + (p[2] - axis.origin[1]) * axis.along[1];
  for (const { quad } of floors) {
    const [a, b, c, d] = quad;
    const run = Math.max(1e-6, down(d) - down(a));
    const slope = Math.max(CHUTE_ROUGH, Math.min(0.8, (a[1] - d[1]) / run));
    const k = pos.length / 3;
    for (const [p, t] of [[a, -1], [b, 1], [c, 1], [d, -1]]) {
      pos.push(p[0], p[1] + CHUTE_SHEET, p[2]);
      water.push(CHUTE_SHEET, down(p), t, slope);
      flow.push(axis.along[0], axis.along[1]);
    }
    /* Up facing whichever way D wound it. */
    const ux = b[0] - a[0];
    const uz = b[2] - a[2];
    const vx = d[0] - a[0];
    const vz = d[2] - a[2];
    idx.push(...(uz * vx - ux * vz > 0 ? [k, k + 1, k + 3, k + 1, k + 2, k + 3] : [k, k + 3, k + 1, k + 1, k + 3, k + 2]));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('aWater', new THREE.Float32BufferAttribute(water, 4));
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/* ----------------------------------------------------- the two bodies */

/* A body's outline as a mesh at its level, holes and all. */
function surface(THREE, body) {
  const pts = body.outline.map(([x, z]) => new THREE.Vector2(x, z));
  const holes = (body.holes || []).map((h) => h.map(([x, z]) => new THREE.Vector2(x, z)));
  const tris = THREE.ShapeUtils.triangulateShape(pts, holes);
  const all = pts.concat(...holes);
  const pos = new Float32Array(all.length * 3);
  all.forEach((p, k) => {
    pos[k * 3] = p.x;
    pos[k * 3 + 1] = body.y;
    pos[k * 3 + 2] = p.y;
  });
  const idx = [];
  for (const [a, b, c] of tris) {
    /* Up facing whichever way the outline winds. */
    const cross = (all[b].x - all[a].x) * (all[c].y - all[a].y) - (all[b].y - all[a].y) * (all[c].x - all[a].x);
    idx.push(...(cross < 0 ? [a, b, c] : [a, c, b]));
  }
  return flatGeometry(THREE, pos, idx);
}

/* The strips past the ring's edge where `body` meets it. */
function strips(THREE, body, half) {
  const out = [];
  for (const [axis, sign] of [['x', -1], ['x', 1], ['z', -1], ['z', 1]]) {
    const along = body.outline.filter((p) => Math.abs((axis === 'x' ? p[0] : p[1]) - sign * half) < 1)
      .map((p) => (axis === 'x' ? p[1] : p[0]));
    if (!along.length) {
      continue;
    }
    const a0 = Math.max(-half, Math.min(...along) - APRON_WIDEN);
    const a1 = Math.min(half, Math.max(...along) + APRON_WIDEN);
    const d0 = sign * half;
    const d1 = sign * (half + APRON_REACH);
    const [x0, x1, z0, z1] = axis === 'x' ? [Math.min(d0, d1), Math.max(d0, d1), a0, a1] : [a0, a1, Math.min(d0, d1), Math.max(d0, d1)];
    const y = body.y;
    out.push(flatGeometry(THREE, new Float32Array([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1]), [0, 3, 1, 1, 3, 2]));
  }
  return out;
}

/* A flat sheet of water: its normals up, and the aWater the material
 * declares, which the depth field replaces per pixel (withField). */
function flatGeometry(THREE, pos, idx) {
  const n = pos.length / 3;
  const normal = new Float32Array(n * 3);
  for (let k = 0; k < n; k += 1) {
    normal[k * 3 + 1] = 1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  g.setAttribute('aWater', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/*
 * The depth field over the hero at FIELD_CELL: per sample the ground's
 * height and the distance to the nearest dry sample, m (dry: outside
 * every body's outline, or ground at or over the body's level there).
 * Returns { data (RG float, (n x n)), n, x0, extent }.
 */
export function field(bodies, ground, half) {
  const n = Math.round((2 * half) / FIELD_CELL) + 1;
  const x0 = -half;
  const dist = new Float32Array(n * n);
  const data = new Float32Array(n * n * 2);
  /* Which body each sample is in, by scanlines across each outline. */
  const within = new Int8Array(n * n).fill(-1);
  bodies.forEach((b, k) => {
    const o = b.outline;
    for (let j = 0; j < n; j += 1) {
      const z = x0 + j * FIELD_CELL;
      const xs = [];
      for (let i = 0, m = o.length - 1; i < o.length; m = i, i += 1) {
        if ((o[i][1] > z) !== (o[m][1] > z)) {
          xs.push(o[i][0] + ((z - o[i][1]) * (o[m][0] - o[i][0])) / (o[m][1] - o[i][1]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let h = 0; h + 1 < xs.length; h += 2) {
        const i0 = Math.max(0, Math.ceil((xs[h] - x0) / FIELD_CELL));
        const i1 = Math.min(n - 1, Math.floor((xs[h + 1] - x0) / FIELD_CELL));
        for (let i = i0; i <= i1; i += 1) {
          within[j * n + i] = k;
        }
      }
    }
  });
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const c = j * n + i;
      const g = ground(x0 + i * FIELD_CELL, x0 + j * FIELD_CELL);
      data[c * 2] = g;
      const k = within[c];
      dist[c] = k >= 0 && g < bodies[k].y ? FIELD_REACH : 0;
    }
  }
  /* A two pass chamfer distance, 10 m and 14.1 m steps. */
  const D = FIELD_CELL;
  const E = FIELD_CELL * Math.SQRT2;
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const c = j * n + i;
      let v = dist[c];
      if (i > 0) v = Math.min(v, dist[c - 1] + D);
      if (j > 0) {
        v = Math.min(v, dist[c - n] + D);
        if (i > 0) v = Math.min(v, dist[c - n - 1] + E);
        if (i + 1 < n) v = Math.min(v, dist[c - n + 1] + E);
      }
      dist[c] = v;
    }
  }
  for (let j = n - 1; j >= 0; j -= 1) {
    for (let i = n - 1; i >= 0; i -= 1) {
      const c = j * n + i;
      let v = dist[c];
      if (i + 1 < n) v = Math.min(v, dist[c + 1] + D);
      if (j + 1 < n) {
        v = Math.min(v, dist[c + n] + D);
        if (i + 1 < n) v = Math.min(v, dist[c + n + 1] + E);
        if (i > 0) v = Math.min(v, dist[c + n - 1] + E);
      }
      dist[c] = v;
      data[c * 2 + 1] = v;
    }
  }
  return {
    data, n, x0, extent: 2 * half,
  };
}

/*
 * swiss2's still water with the depth this map has: every vWater the
 * sheet's fragment shader reads becomes the field's (the level less the
 * ground, and DEEPEN per metre from dry ground), so the shore's foam and
 * the shallows follow the drawn terrain, per pixel. Outside the hero the
 * water is open and deep. swiss2's light gives its water s2Sun, the sun
 * through the valley's terrain and clouds; nothing stands between
 * Itaipu's sun and its water but the shadow maps, so it is 1 here. The
 * churn is the draft tubes' boil along the powerhouse's face.
 */
const FIELD_GLSL = /* glsl */ `
  uniform sampler2D uItField;
  uniform vec3 uItGrid;
  uniform float uItLevel;
  uniform vec4 uItChurn;
  uniform vec3 uItChurnN;
  const float s2Sun = 1.0;
  vec4 itWater(vec2 p) {
    vec2 g = (p - uItGrid.xy) / uItGrid.z;
    if (g.x < 0.0 || g.y < 0.0 || g.x > 1.0 || g.y > 1.0) {
      return vec4(60.0, 0.0, 0.0, 0.0);
    }
    float n = float(textureSize(uItField, 0).x);
    vec2 f = texture2D(uItField, (g * (n - 1.0) + 0.5) / n).rg;
    float d = uItLevel - f.r;
    return vec4(d <= 0.0 ? d : d + ${DEEPEN.toFixed(3)} * f.g, 0.0, 0.0, 0.0);
  }
  float itChurn(vec2 p) {
    if (uItChurnN.z <= 0.0) {
      return 0.0;
    }
    vec2 ab = uItChurn.zw - uItChurn.xy;
    float t = clamp(dot(p - uItChurn.xy, ab) / dot(ab, ab), 0.0, 1.0);
    float out_ = dot(p - uItChurn.xy, uItChurnN.xy);
    float along = t * length(ab);
    if (out_ < -5.0 || out_ > uItChurnN.z || t <= 0.0 || t >= 1.0) {
      return 0.0;
    }
    /* A boil in front of each unit, 34 m apart, spreading and fading
     * downstream. */
    float unit = abs(fract(along / 34.0) - 0.5) * 2.0;
    float fall = 1.0 - smoothstep(0.1, 1.0, out_ / uItChurnN.z);
    return fall * mix(0.55, 1.0, smoothstep(0.3, 0.9, 1.0 - unit + out_ / uItChurnN.z));
  }`;

function withField(THREE, mat, uniforms) {
  const base = mat.onBeforeCompile;
  const baseKey = mat.customProgramCacheKey();
  const DECL = 'varying vec4 vWater;';
  const FOAM = 'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.86, 0.88), wFoam);';
  /* The fragment shader's main, where the field's depth is read once. A
   * pattern, not a string: it is the shader's text, not copy. */
  const MAIN = /void main\(\) \{/;
  mat.onBeforeCompile = function onBeforeCompile(shader, renderer) {
    base.call(this, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    const fs = shader.fragmentShader;
    if (!fs.includes(DECL) || !fs.includes(FOAM) || !MAIN.test(fs)) {
      throw new Error('itaipu water: swiss2\'s water shader no longer has the lines the depth field is spliced at');
    }
    shader.fragmentShader = fs
      .replace(DECL, '@DECL@')
      .replace(/\bvWater\b/g, 'iWater')
      .replace('@DECL@', `${DECL}\n${FIELD_GLSL}`)
      .replace(MAIN, (m) => `${m}\n  vec4 iWater = itWater(vWaterWorld.xz);`)
      .replace(FOAM, `{
          float churn = itChurn(vWaterWorld.xz);
          if (churn > 0.0) {
            float boil = texture2D(uWaves, vWaterWorld.xz / 4.1 + vec2(uTime * 0.21, -uTime * 0.17)).a;
            float fine = texture2D(uWaves, vWaterWorld.xz / 1.3 - vec2(0.0, uTime * 0.5)).a;
            wFoam = max(wFoam, churn * smoothstep(0.3, 0.62, boil * 0.6 + fine * 0.4 + 0.25 * churn));
            wSlope *= 1.0 + 2.5 * churn;
          }
        }
        ${FOAM}`);
  };
  mat.customProgramCacheKey = () => `itaipu-field|${baseKey}`;
  return mat;
}

/* The shortest distance from (x, z) to an outline's edges, m. */
function toShore(outline, x, z) {
  let best = Infinity;
  for (let i = 0, k = outline.length - 1; i < outline.length; k = i, i += 1) {
    const [ax, az] = outline[k];
    const ex = outline[i][0] - ax;
    const ez = outline[i][1] - az;
    const l2 = ex * ex + ez * ez;
    let t = l2 > 0 ? ((x - ax) * ex + (z - az) * ez) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - (ax + t * ex);
    const dz = z - (az + t * ez);
    best = Math.min(best, dx * dx + dz * dz);
  }
  return Math.sqrt(best);
}

/*
 * The body the mirror follows for a camera at (x, y, z): the one under
 * it, else the nearest within MIRROR_REACH of its shore, and only one the
 * camera is above. -1 for none. `bodies` are { y, outline, lake }.
 */
export function mirrorBody(bodies, x, y, z) {
  let best = -1;
  let bestD = MIRROR_REACH;
  bodies.forEach((b, k) => {
    if (y <= b.y) {
      return;
    }
    const d = insideWater(b.lake, x, z) ? 0 : toShore(b.outline, x, z);
    if (d < bestD) {
      best = k;
      bestD = d;
    }
  });
  return best;
}

/* ------------------------------------------------------------ the part */

export async function buildPart(ctx) {
  const { THREE } = ctx;
  const [{ waterMaterial }, { planarMirror }, { waveTexture }, { makeWaves }] = await Promise.all([
    import('../../swiss2/water/surface.js'),
    import('../../swiss2/water/lake.js'),
    import('../../swiss2/water/waves.js'),
    import('../../../render/lakewaves.js'),
  ]);
  const group = new THREE.Group();
  group.name = 'itaipu-water';
  const half = ctx.manifest.frame.ring[1];
  const heroHalf = ctx.manifest.frame.hero[1];
  const bodies = ctx.data['water.json'];
  const dam = ctx.data['dam.json'];
  const envMap = ctx.mats.envMap;
  const waves = waveTexture(512);
  const time = { value: 0 };
  ctx.progress(0.1);

  /* The depth field, one texture both bodies read. */
  const f = field(bodies, ctx.ground, heroHalf);
  const half16 = new Uint16Array(f.data.length);
  for (let k = 0; k < f.data.length; k += 1) {
    half16[k] = THREE.DataUtils.toHalfFloat(f.data[k]);
  }
  const fieldTex = new THREE.DataTexture(half16, f.n, f.n, THREE.RGFormat, THREE.HalfFloatType);
  fieldTex.minFilter = THREE.LinearFilter;
  fieldTex.magFilter = THREE.LinearFilter;
  fieldTex.generateMipmaps = false;
  fieldTex.needsUpdate = true;
  const grid = new THREE.Vector3(f.x0, f.x0, f.extent);
  ctx.progress(0.6);

  /* The tailrace: the powerhouse's downstream face, and the chute's foot. */
  const power = dam.find((p) => p.part === 'powerhouse');
  const pa = power.axis[0];
  const pb = power.axis[power.axis.length - 1];
  const pl = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
  /* Downstream is +z, the canyon's side of the axis. */
  let pn = [-(pb[1] - pa[1]) / pl, (pb[0] - pa[0]) / pl];
  if (pn[1] < 0) {
    pn = [-pn[0], -pn[1]];
  }
  const face = power.figures.width / 2;
  const churn = new THREE.Vector4(pa[0] + pn[0] * face, pa[1] + pn[1] * face, pb[0] + pn[0] * face, pb[1] + pn[1] * face);
  const axis = chuteAxis(dam);
  const floors = chuteFloors(ctx.roofs);
  if (!floors.length) {
    throw new Error(`itaipu water: no ${CHUTE_KIND} roof records; the dam part must be built before the water`);
  }
  /* Where the jets come down: past the longest bay's flip bucket. */
  const reach = Math.max(...floors.map(({ quad }) => (quad[3][0] - axis.origin[0]) * axis.along[0] + (quad[3][2] - axis.origin[1]) * axis.along[1]));
  const foot = { x: axis.origin[0] + axis.along[0] * (reach + 40), z: axis.origin[1] + axis.along[1] * (reach + 40) };

  const tier = MIRROR_SCALE[ctx.quality] != null ? ctx.quality : 'high';
  const scale = MIRROR_SCALE[tier];
  const made = bodies.map((body) => {
    const look = LOOK[body.name] || LOOK.reservoir;
    const colour = new THREE.Color(...look.body);
    const sea = makeWaves();
    const to = body.name === 'river' ? [0, 1] : [Math.sin(Math.PI * 1.25), -Math.cos(Math.PI * 1.25)];
    const opts = {
      waves,
      time,
      /* The ripples drift with the wind on the reservoir (the map's, from
       * the north east) and with the current down the river. */
      wind: { value: new THREE.Vector2(to[0], to[1]).normalize() },
      colour,
      shallow: new THREE.Color(...look.shallow),
      deep: new THREE.Color(...look.deep),
      clarity: look.clarity,
      ripple: look.ripple,
      roughness: look.roughness,
      envMap,
      shoreFoam: 0.6,
      foamAt: body.name === 'river' ? [foot.x, foot.z, PLUNGE_R, 1] : null,
      field: sea,
    };
    const uniforms = {
      uItField: { value: fieldTex },
      uItGrid: { value: grid },
      uItLevel: { value: body.y },
      uItChurn: { value: churn },
      uItChurnN: { value: new THREE.Vector3(pn[0], pn[1], body.name === 'river' ? CHURN_REACH : 0) },
    };
    const env = withField(THREE, waterMaterial(opts), uniforms);
    env.name = `itaipu-water-${body.name}`;
    /* The mirror is made when this body first has the camera over it,
     * and freed when the camera leaves for the other: one at a time. */
    const state = {
      body, env, opts, sea, uniforms, mirror: null, planar: null, meshes: [],
      lake: { kind: 'lake', outline: body.outline.map(([x, z]) => ({ x, z })) },
      y: body.y,
      outline: body.outline,
    };
    for (const geo of [surface(THREE, body), ...strips(THREE, body, half)]) {
      const mesh = new THREE.Mesh(geo, env);
      mesh.name = `itaipu-water-${body.name}`;
      mesh.receiveShadow = true;
      group.add(mesh);
      state.meshes.push(mesh);
    }
    return state;
  });
  ctx.progress(0.8);

  /* The chutes, drawn over D's floors, whose crash surface is water. */
  const q0 = floors[0].quad;
  const bayWidth = Math.hypot(q0[1][0] - q0[0][0], q0[1][2] - q0[0][2]);
  const chuteMat = waterMaterial({
    waves, time, wind: { value: new THREE.Vector2(axis.along[0], axis.along[1]) }, flow: true, colour: new THREE.Color(...CHUTE_BODY), clarity: 6, ripple: 1.2, roughness: 0.35, envMap, width: bayWidth,
  });
  chuteMat.name = 'itaipu-water-chute';
  const chute = new THREE.Mesh(chuteGeometry(THREE, floors, axis), chuteMat);
  chute.name = 'itaipu-chute';
  chute.receiveShadow = true;
  group.add(chute);
  const records = floors.map(({ rec }) => rec);
  for (const rec of records) {
    rec.material = 'water';
  }

  /* THE MIRROR. The body under the camera, drawn once a frame. */
  const stats = {
    tier, mirrorScale: scale, mirrorBody: -1, mirrorDrawn: false, mirrorCalls: 0, mirrorTriangles: 0, mirrorsLive: 0,
    chuteFloors: records.length, fieldSize: f.n,
  };
  const eye = new THREE.Vector3();
  const choose = (k) => {
    made.forEach((m, j) => {
      if (j !== k && m.mirror) {
        m.mirror.dispose();
        m.mirror = null;
        m.planar.dispose();
        m.planar = null;
      }
      const want = j === k && scale > 0;
      if (want && !m.mirror) {
        m.mirror = planarMirror(m.y, scale);
        m.planar = withField(THREE, waterMaterial({ ...m.opts, planar: m.mirror }), m.uniforms);
        m.planar.name = m.env.name;
        if (ctx.mats.lit) {
          ctx.mats.lit(m.planar);
        }
      }
      for (const mesh of m.meshes) {
        mesh.material = want ? m.planar : m.env;
      }
    });
    stats.mirrorsLive = made.filter((m) => m.mirror).length;
  };
  const hide = [group];
  const renderMirror = (renderer, scene, camera) => {
    camera.updateMatrixWorld();
    eye.setFromMatrixPosition(camera.matrixWorld);
    const k = scale > 0 ? mirrorBody(made, eye.x, eye.y, eye.z) : -1;
    if (k !== stats.mirrorBody) {
      choose(k);
      stats.mirrorBody = k;
    }
    stats.mirrorDrawn = false;
    if (k < 0) {
      return false;
    }
    const info = renderer.info.render;
    const calls = info.calls;
    const triangles = info.triangles;
    stats.mirrorDrawn = made[k].mirror.render(renderer, scene, camera, hide);
    stats.mirrorCalls = info.calls - calls;
    stats.mirrorTriangles = info.triangles - triangles;
    return stats.mirrorDrawn;
  };
  let due = false;
  /* What the mirror was last drawn with, for the check's timing. */
  const seen = { renderer: null, scene: null, camera: null };
  const scene = ctx.scene;
  const before = scene.onBeforeRender;
  scene.onBeforeRender = function onBeforeRender(renderer, s, camera, target) {
    before.call(this, renderer, s, camera, target);
    if (!due || !camera.isPerspectiveCamera) {
      return;
    }
    due = false;
    seen.renderer = renderer;
    seen.scene = s;
    seen.camera = camera;
    renderMirror(renderer, s, camera);
  };
  ctx.progress(1);

  return {
    group,
    /* The sim clock's milliseconds: the ripples and the chute's flow run
     * on it, and the mirror is due again. */
    update(step) {
      time.value = step / 1000;
      due = true;
    },
    /* The shell's waves, in the map's frame, in view.water's order
     * (src/main.js handWaves): each drawn body takes the one whose still
     * water is at its level. Empty for still water. */
    setWaves(handed) {
      for (const m of made) {
        m.sea.set((handed || []).find((b) => Math.abs(b.y0 - m.y) < 0.5) || null);
      }
      stats.waves = made.map((m) => m.sea.uniforms.uWaveN.value);
    },
    /* The sim clock, s, every drawn frame. */
    updateWaves(t) {
      for (const m of made) {
        m.sea.tick(t);
      }
    },
    /* For scripts/itaipu-water-check.js, which times the mirror alone. */
    renderMirror,
    seen,
    records,
    dispose() {
      scene.onBeforeRender = before;
      for (const m of made) {
        if (m.mirror) {
          m.mirror.dispose();
          m.planar.dispose();
        }
        m.env.dispose();
      }
      chuteMat.dispose();
      fieldTex.dispose();
      waves.dispose();
    },
    stats: () => ({
      ...stats,
      bodies: bodies.map((b) => ({ name: b.name, y: b.y, vertices: b.outline.length })),
    }),
  };
}
