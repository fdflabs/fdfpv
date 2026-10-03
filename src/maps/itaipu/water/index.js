/*
 * water/index.js: Itaipu's water, drawn (docs/ITAIPU-PLAN.md section 5,
 * package E).
 *
 *   The reservoir at 219.0 m and the river below the dam at 103.5 m, each
 *   over its outline from water.json, in swiss2's water material
 *   (swiss2/water/surface.js): Fresnel at water's index, the sun's
 *   glitter, ripples drifting with the wind (on the river, downstream
 *   with the current), shore foam, and the body's colour deepening away
 *   from the shore; calmer than swiss2's lake, and without its patches
 *   over the bed (LOOK mottle and gust). Past the ring each body carries
 *   on over the apron (APRON_REACH), so from the air the lake fades into
 *   the haze. Each body is one sheet, its apron strips and all: one draw.
 *
 *   The spillway's three chutes running (spill.js), a sheet CHUTE_SHEET deep
 *   over package D's chute floors (the dam part's roof records of kind
 *   `spillway chute`, which are built before this part), so the water
 *   lies between D's training walls on D's floor, whatever profile D
 *   gave it. The chute is not plant water. Its floor stays D's ground,
 *   and this part makes those records' material `water` (section 5:
 *   "whose crash surface answers water while the spillway runs"), so a
 *   craft that touches the chute rides the floor, the crash world reads
 *   water there (the map's surfaceAt), and it never floats.
 *
 *   The jets off the flip buckets, the plume and mist where they land and
 *   the plunge pool's broken water (spill.js), and the churn of the draft
 *   tubes along the powerhouse's downstream face.
 *
 *   ONE planar mirror, following the body under the camera: over the
 *   reservoir the reservoir mirrors the dam and its shores, down in the
 *   canyon the river mirrors the canyon walls; the other body takes the
 *   sky's light only. At swiss2's own scales (WATER_TIERS), and drawn at
 *   most once a frame, from the scene's onBeforeRender, since the part
 *   is handed no renderer: the map's first scene draw each frame after
 *   update() draws it. Not drawn at all while none of its body is in the
 *   camera's view (inView): it draws the scene a second time, and from
 *   the chute or the switchyard that was all for water behind the camera.
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
import { sunFor } from '../look/light.js';
import {
  bays, chuteMaterial, gateJets, lanes, plume, PLUNGE_GLSL,
} from './spill.js';
import { liveFlood } from './live.js';

/* The drawn sheet of water running down the chute over D's floor, m: a
 * spillway's flow at speed is a few decimetres to a metre deep. */
const CHUTE_SHEET = 0.4;
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
/* The way the map's wind blows, from the north east. */
const WIND_TO = [Math.sin(Math.PI * 1.25), -Math.cos(Math.PI * 1.25)];
/* The river's way where the jets land: down the canyon, south. */
const PLUNGE_DOWN = [0, 1];
/* The sky's light on the spray, linear: swiss2's fall's mist's
 * (swiss2/water/index.js mistLight), under Itaipu's clearer sky. */
const SPRAY_SKY = [0.7, 0.74, 0.8];

/*
 * THE SKY IN THE WATER IS BLURRED. The ripples the sheet draws are the
 * metre scale ones; under them a breeze raises wavelets too small for a
 * pixel, whose slopes spread by a tenth of a radian or more (Cox and
 * Munk), so a real reservoir reflects the sky smeared over tens of
 * degrees: from the air its cumulus are soft, dim glows in an even blue,
 * never the sharp white shapes a mirror gives (aerial-dam,
 * reservoir-dam). The more water a pixel holds, the more of that spread
 * it averages, so the sky's image is sampled from the environment at a
 * roughness from SKY_BLUR's near to its far over SKY_BLUR_REACH, m. The
 * planar mirror is kept only where it shows what the sky cannot, the dam
 * and the shores near a camera looking along the water: past
 * MIRROR_KEEP metres, or looking down more steeply than MIRROR_KEEP_DOWN
 * (the sine of the look below level), where what it would show is the
 * sky overhead, the blurred sky takes over. The Fresnel weight is
 * three's own, from the drawn normal, so looking straight down the water
 * is its body's deep blue and toward the horizon the pale sky.
 */
const SKY_BLUR = [0.14, 0.42];
const SKY_BLUR_REACH = [40, 1200];
const MIRROR_KEEP = [200, 1400];
const MIRROR_KEEP_DOWN = [0.12, 0.35];
const MIRROR_SMEAR = [0.04, 0.005];
/* The roughness the wind's sheen reads the sky at in place of the mirror. */
const SHEEN_BLUR = 0.35;
/* The sky's roughness between the shores in the mirror close to the
 * camera: SKY_BLUR's near 0.14 still drew the cumulus as pale blots at
 * eye level (reservoir-dam). */
const MIRROR_SKY_BLUR = 0.24;

/*
 * The colours, linear. Itaipu's water is a tropical reservoir's, not a
 * glacier's: a blue green that reads blue from the air for the sky it
 * holds, green brown over its mud shallows, and the river below a greyer
 * green with the sediment the turbines stir (reservoir-dam, aerial-dam,
 * river-below). Round 4 measured them against the photographs: the
 * reservoir from the air (aerial-dam) at a mean sRGB (116, 155, 201)
 * where v3 drew (82, 113, 140), so its body and deep are two thirds
 * brighter at the same hue; the river below (river-below) at (73, 96,
 * 106) where v3 drew (68, 81, 93), so it is greener.
 */
const LOOK = {
  reservoir: {
    body: [0.03, 0.094, 0.152], shallow: [0.04, 0.07, 0.06], deep: [0.02, 0.07, 0.13], clarity: 0.9, ripple: 0.15, roughness: 0.03, mottle: 0.15, gust: 0.4,
  },
  river: {
    body: [0.03, 0.052, 0.048], shallow: [0.05, 0.047, 0.032], deep: [0.022, 0.04, 0.038], clarity: 2.5, ripple: 0.25, roughness: 0.05, mottle: 0, gust: 0.5,
  },
};

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

/*
 * The sheet over D's floors, and the jets under the gates (spill.js
 * gateJets), one geometry: per floor a quad CHUTE_SHEET over it, first
 * and in the floors' order (scripts/itaipu-water-check.js reads them
 * so), then the jets'. Each corner carries spill.js chuteMaterial's
 * aChute: metres down the chute from the gates, metres across it from
 * the gates' middle, -1 to 1 across its bay (or gate), and 1 on a jet.
 */
function chuteGeometry(THREE, floors, axis, lane) {
  const pos = [];
  const normal = [];
  const chute = [];
  const idx = [];
  const across = [axis.along[1], -axis.along[0]];
  const down = (p) => (p[0] - axis.origin[0]) * axis.along[0] + (p[2] - axis.origin[1]) * axis.along[1];
  const side = (p) => (p[0] - axis.origin[0]) * across[0] + (p[2] - axis.origin[1]) * across[1];
  /* A quad's corners, facing `n` whichever way they were listed. */
  const quad = (pts, n, attrs) => {
    const k = pos.length / 3;
    pts.forEach((p, i) => {
      pos.push(...p);
      normal.push(...n);
      chute.push(...attrs[i]);
    });
    const [a, b, , d] = pts;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const facing = cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2];
    idx.push(...(facing > 0 ? [k, k + 1, k + 3, k + 1, k + 2, k + 3] : [k, k + 3, k + 1, k + 1, k + 3, k + 2]));
  };
  for (const { quad: [a, b, c, d] } of floors) {
    const pts = [a, b, c, d].map((p) => [p[0], p[1] + CHUTE_SHEET, p[2]]);
    quad(pts, [0, 1, 0], [[a, -1], [b, 1], [c, 1], [d, -1]].map(([p, t]) => [down(p), side(p), t, 0]));
  }
  /* D's floor down the chute, from its first bay's records: the sill
   * flat to where they start. */
  const knots = floors.filter(({ rec }) => rec.chute === floors[0].rec.chute)
    .flatMap(({ quad: [a, , , d] }) => [[down(a), a[1]], [down(d), d[1]]])
    .sort((p, q) => p[0] - q[0]);
  const floorAt = (dd) => {
    const k = knots.findIndex(([kd]) => kd >= dd);
    if (k <= 0) {
      return knots[k < 0 ? knots.length - 1 : 0][1];
    }
    const [d0, y0] = knots[k - 1];
    const [d1, y1] = knots[k];
    return d1 > d0 ? y0 + ((y1 - y0) * (dd - d0)) / (d1 - d0) : y1;
  };
  const at = (u, dd) => [
    axis.origin[0] + axis.along[0] * dd + across[0] * u,
    axis.origin[1] + axis.along[1] * dd + across[1] * u,
  ];
  for (const q of gateJets(lane, floorAt, at, axis.along)) {
    quad(q.pts, q.normal, q.chute);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  g.setAttribute('aChute', new THREE.Float32BufferAttribute(chute, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/* ----------------------------------------------------- the two bodies */

/* A body's outline as a mesh at its level, holes and all, and its strips
 * past the ring: one geometry, so one draw. */
function sheet(THREE, body, half) {
  const parts = [surface(THREE, body), ...strips(body, half)];
  const pos = new Float32Array(parts.reduce((n, p) => n + p.pos.length, 0));
  const idx = [];
  let at = 0;
  for (const p of parts) {
    pos.set(p.pos, at);
    idx.push(...p.idx.map((k) => k + at / 3));
    at += p.pos.length;
  }
  return flatGeometry(THREE, pos, idx);
}

/* A body's outline at its level, holes and all, as { pos, idx }. */
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
  return { pos, idx };
}

/* The strips past the ring's edge where `body` meets it, as { pos, idx }. */
function strips(body, half) {
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
    out.push({ pos: [x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], idx: [0, 3, 1, 1, 3, 2] });
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
  uniform vec2 uItCalm;
  const float s2Sun = 1.0;
  float itMottle(float mott) {
    return mix(1.0 - 0.28 * uItCalm.x, 1.0 + 0.22 * uItCalm.x, smoothstep(0.3, 0.7, mott));
  }
  ${PLUNGE_GLSL}
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
  /* swiss2's lake's broad patches over its bed, and its gusts and slicks:
   * scaled by uItCalm (x the patches, y the gusts' contrast), since from
   * the air a big warm reservoir reads one even colour, calmed and not
   * blotched, and a turbid river shows nothing of its bed. A pattern, as
   * MAIN below. */
  const MOTT = /mix\(0\.72, 1\.22, smoothstep\(0\.3, 0\.7, mott\)\)/;
  const WINDY = 'float windy = max(0.4 * (1.0 - slick), gust);';
  /* The fragment shader's main, where the field's depth is read once. A
   * pattern, not a string: it is the shader's text, not copy. */
  const MAIN = /void main\(\) \{/;
  /* Where the sky's image is blurred (SKY_BLUR): after swiss2's glitter
   * and mirror have set `radiance`, before three's light loop spends it. */
  const LIGHTS_END = '#include <lights_fragment_end>';
  const f3 = (v) => v.toFixed(3);
  /* swiss2's planar mirror, read once at a point and mixed with the sky's
   * sharp image where the wind roughens the water (WATER_PLANAR). The mix
   * is a pattern, as MOTT. */
  const MIRROR_READ = 'vec3 mirror = texture2DProj(uReflect, rc).rgb;';
  const MIRROR_MIX = /radiance = mix\(mirror, radiance, max\(wFoam, wSheen\)\);/;
  /*
   * THE MIRROR HOLDS THE SHORES, THE SKY IS BLURRED. Near the camera the
   * mirror kept the cumulus sharp, broken by the drawn ripples into hard
   * white blots (reservoir-dam, round 4), where a real reservoir's
   * wavelets smear the sky's image over tens of degrees. So the mirror is
   * drawn without the sky (renderMirror below: no sky dome, cleared to
   * nothing), its alpha what of the dam and the shores it holds, and the
   * sky between them is the environment's blurred image (MIRROR_SKY_BLUR
   * near to SKY_BLUR's far, by distance). The mirror itself is read in
   * five taps along its vertical, over MIRROR_SMEAR's near to far of its
   * height (a fraction of the image), as wavelets stretch a reflection
   * into a streak, longest close to and at a grazing look. Where the wind
   * takes over from the mirror it hands to the blurred sky too
   * (SHEEN_BLUR), not to the environment's sharp image.
   */
  const SMEAR = `vec3 mirror;
          {
            float mFar = smoothstep(${f3(SKY_BLUR_REACH[0])}, ${f3(SKY_BLUR_REACH[1])}, distance(vWaterWorld, cameraPosition));
            vec4 mUp = vec4(0.0, mix(${f3(MIRROR_SMEAR[0])}, ${f3(MIRROR_SMEAR[1])}, mFar) * rc.w, 0.0, 0.0);
            vec4 mHeld = texture2DProj(uReflect, rc) * 0.3
              + (texture2DProj(uReflect, rc + mUp * 0.4) + texture2DProj(uReflect, rc - mUp * 0.4)) * 0.2
              + (texture2DProj(uReflect, rc + mUp) + texture2DProj(uReflect, rc - mUp)) * 0.15;
            float mRough = max(material.roughness, mix(${f3(MIRROR_SKY_BLUR)}, ${f3(SKY_BLUR[1])}, mFar));
            mirror = mHeld.rgb + (1.0 - clamp(mHeld.a, 0.0, 1.0)) * getIBLRadiance(geometryViewDir, geometryNormal, mRough);
          }`;
  const SMEAR_MIX = `{
            vec3 mWind = getIBLRadiance(geometryViewDir, geometryNormal, max(material.roughness, ${f3(SHEEN_BLUR)}));
            radiance = mix(mirror, mWind, max(wFoam, wSheen));
          }`;
  const BLUR = `#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
        {
          vec3 bLook = vWaterWorld - cameraPosition;
          float bDist = length(bLook);
          float bDown = clamp(-bLook.y / max(bDist, 1e-3), 0.0, 1.0);
          float bRough = max(material.roughness, mix(${f3(SKY_BLUR[0])}, ${f3(SKY_BLUR[1])}, smoothstep(${f3(SKY_BLUR_REACH[0])}, ${f3(SKY_BLUR_REACH[1])}, bDist)));
          vec3 bSky = getIBLRadiance(geometryViewDir, geometryNormal, bRough);
          #ifdef WATER_PLANAR
            float bKeep = (1.0 - smoothstep(${f3(MIRROR_KEEP[0])}, ${f3(MIRROR_KEEP[1])}, bDist))
              * (1.0 - smoothstep(${f3(MIRROR_KEEP_DOWN[0])}, ${f3(MIRROR_KEEP_DOWN[1])}, bDown));
            radiance = mix(bSky, radiance, bKeep);
          #else
            radiance = bSky;
          #endif
        }
        #endif
        ${LIGHTS_END}`;
  mat.onBeforeCompile = function onBeforeCompile(shader, renderer) {
    base.call(this, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    const fs = shader.fragmentShader;
    if (!fs.includes(DECL) || !fs.includes(FOAM) || !MOTT.test(fs) || !fs.includes(WINDY) || !MAIN.test(fs) || !fs.includes(LIGHTS_END)
      || !fs.includes(MIRROR_READ) || !MIRROR_MIX.test(fs)) {
      throw new Error('itaipu water: swiss2\'s water shader no longer has the lines the depth field is spliced at');
    }
    shader.fragmentShader = fs
      .replace(LIGHTS_END, BLUR)
      .replace(MIRROR_READ, SMEAR)
      .replace(MIRROR_MIX, SMEAR_MIX)
      .replace(DECL, '@DECL@')
      .replace(/\bvWater\b/g, 'iWater')
      .replace('@DECL@', `${DECL}\n${FIELD_GLSL}`)
      .replace(MAIN, (m) => `${m}\n  vec4 iWater = itWater(vWaterWorld.xz);`)
      .replace(MOTT, 'itMottle(mott)')
      .replace(WINDY, 'float windy = mix(0.4, max(0.4 * (1.0 - slick), gust), uItCalm.y);')
      .replace(FOAM, `{
          /* The plunge pool: pale, aerated water, and foam torn into
           * streaks and swirls that the current carries off. */
          float spill = itPlunge(vWaterWorld.xz);
          if (spill > 0.0) {
            vec2 sq = vWaterWorld.xz - uItDown * uTime * 4.0;
            vec2 sw = vec2(-uItDown.y, uItDown.x);
            float lace = texture2D(uWaves, vec2(dot(sq, sw) / 23.0, dot(sq, uItDown) / 61.0)).a;
            float rag = texture2D(uWaves, sq / 7.9 + vec2(uTime * 0.05, 0.0)).a;
            float fine = texture2D(uWaves, sq / 2.3 - vec2(0.0, uTime * 0.3)).a;
            /* Water full of air is milky jade, not clear: the bed and
             * the mirror are lost in it, paler where it is most churned
             * (spill-plume). */
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.1, 0.15, 0.12), vec3(0.17, 0.22, 0.17), smoothstep(0.6, 1.0, spill)),
              smoothstep(0.0, 0.5, spill) * 0.85);
            /* Far off, or seen along the water from near it, a pixel
             * holds many of the rags and the fine lace and the foam is
             * torn only at its edges: the fine terms alone alias into a
             * regular grain, and at a grazing look into a crazed web. */
            vec3 look = vWaterWorld - cameraPosition;
            float far = max(smoothstep(150.0, 900.0, length(look)), 1.0 - smoothstep(0.03, 0.12, abs(look.y) / length(look)));
            /*
             * How much of the water is white. Round 4 measured the
             * photographs (spill-plume, spill-run-5): white all through
             * only where a jet comes down, about half of it a little way
             * off in torn patches with the jade between, and further down
             * the tongue a few lines and rafts of foam on green water.
             * v3 drew the whole tongue white (edge-plunge), a field of
             * snow. So the threshold the foam's height must clear climbs
             * as the churn falls: the boil's heart (spill 1) about 85 per
             * cent foam, the tongue at the landings (0.85) a little under
             * half, at 0.6 about a tenth.
             */
            float lift = mix(lace * 0.45 + rag * 0.35 + fine * 0.2, lace * 0.7 + 0.15, far);
            float bar = 0.78 - 0.36 * spill * spill;
            float boiled = smoothstep(bar, bar + 0.08, lift);
            float ridge = 1.0 - abs(lace * 2.0 - 1.0);
            float lines = smoothstep(0.9, 0.97, ridge * 0.8 + rag * 0.2 + fine * 0.1) * 0.45 * smoothstep(0.1, 0.5, spill);
            wFoam = max(wFoam, max(boiled, lines * (1.0 - 0.5 * far)));
            wSlope *= 1.0 + 3.0 * spill * (1.0 - 0.8 * far);
          }
        }
        {
          float churn = itChurn(vWaterWorld.xz);
          if (churn > 0.0) {
            float boil = texture2D(uWaves, vWaterWorld.xz / 4.1 + vec2(uTime * 0.21, -uTime * 0.17)).a;
            float fine = texture2D(uWaves, vWaterWorld.xz / 1.3 - vec2(0.0, uTime * 0.5)).a;
            float b = boil * 0.6 + fine * 0.4;
            /* The draft tubes' boils (dam-downstream, powerhouse): the
             * tailrace is green water heaving in pale swells, sediment
             * brown from the turbines and paler for the air in it (the
             * photograph's tailrace measures sRGB (120, 131, 127)), with
             * only flecks of foam at the swells' hearts; v3's foam over
             * most of it drew a white slab along the face (round 4
             * measured 53 per cent of the powerhouse view's tailrace white
             * against the photograph's 2). */
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08, 0.11, 0.08), churn * 0.6);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.14, 0.19, 0.15), churn * smoothstep(0.4, 0.75, b) * 0.6);
            wFoam = max(wFoam, churn * smoothstep(0.74, 0.86, b + 0.08 * churn) * 0.7);
            wSlope *= 1.0 + 2.0 * churn;
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

/*
 * inView(b, camera): whether any of body `b` ({ y, lake }) is in the
 * camera's view, by rays on a VIEW_RAYS grid over the frame, each down to
 * the body's level within VIEW_REACH. Nothing in the way is asked about,
 * so it says yes to water behind a hill, and water in sight between the
 * rays is a sliver too thin for its reflection to show.
 */
const VIEW_RAYS = [12, 8];
const VIEW_REACH = 30000;
function viewTest(THREE) {
  const eye = new THREE.Vector3();
  const ray = { p: new THREE.Vector3(), d: new THREE.Vector3() };
  return (b, camera) => {
    eye.setFromMatrixPosition(camera.matrixWorld);
    if (eye.y <= b.y) {
      return false;
    }
    const [nx, ny] = VIEW_RAYS;
    for (let j = 0; j <= ny; j += 1) {
      for (let i = 0; i <= nx; i += 1) {
        ray.d.set((i / nx) * 2 - 1, (j / ny) * 2 - 1, 0.5).unproject(camera).sub(eye);
        if (ray.d.y >= 0) {
          continue;
        }
        const t = (b.y - eye.y) / ray.d.y;
        ray.p.copy(ray.d).multiplyScalar(t).add(eye);
        if (Math.hypot(ray.p.x - eye.x, ray.p.z - eye.z) < VIEW_REACH && insideWater(b.lake, ray.p.x, ray.p.z)) {
          return true;
        }
      }
    }
    return false;
  };
}

/* ------------------------------------------------------------ the part */

export async function buildPart(ctx) {
  const { THREE } = ctx;
  /* The thermal picture's kinds (src/render/thermal.js), handed in with
   * the kit so this part stays free of a three import. */
  const thermal = ctx.mats.thermal;
  const water = (mat) => (thermal ? thermal.kind(mat, 'water') : mat);
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
  /* Where the jets come down, off each bay's flip bucket. */
  const river = bodies.find((b) => b.name === 'river');
  const spill = bays(floors, axis, river.y);
  if (spill.length !== 3) {
    throw new Error(`itaipu water: ${spill.length} spillway bays; the plunge pool (spill.js PLUNGE_GLSL) is drawn for three`);
  }
  const plunge = spill.map((b) => new THREE.Vector4(b.land.x, b.land.z, b.half, 1));

  const tier = MIRROR_SCALE[ctx.quality] != null ? ctx.quality : 'high';
  const scale = MIRROR_SCALE[tier];
  const made = bodies.map((body) => {
    const look = LOOK[body.name] || LOOK.reservoir;
    const colour = new THREE.Color(...look.body);
    const sea = makeWaves();
    const to = body.name === 'river' ? [0, 1] : WIND_TO;
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
      field: sea,
    };
    const uniforms = {
      uItField: { value: fieldTex },
      uItGrid: { value: grid },
      uItLevel: { value: body.y },
      uItChurn: { value: churn },
      uItChurnN: { value: new THREE.Vector3(pn[0], pn[1], body.name === 'river' ? CHURN_REACH : 0) },
      uItCalm: { value: new THREE.Vector2(look.mottle, look.gust) },
      uItPlunge: { value: body.name === 'river' ? plunge : plunge.map(() => new THREE.Vector4()) },
      uItDown: { value: new THREE.Vector2(...PLUNGE_DOWN) },
    };
    const env = water(withField(THREE, waterMaterial(opts), uniforms));
    env.name = `itaipu-water-${body.name}`;
    /* The mirror is made when this body first has the camera over it,
     * and freed when the camera leaves for the other: one at a time. */
    const state = {
      body, env, opts, sea, uniforms, mirror: null, planar: null, meshes: [],
      lake: { kind: 'lake', outline: body.outline.map(([x, z]) => ({ x, z })) },
      y: body.y,
      outline: body.outline,
    };
    const mesh = new THREE.Mesh(sheet(THREE, body, half), env);
    mesh.name = `itaipu-water-${body.name}`;
    mesh.receiveShadow = true;
    group.add(mesh);
    state.meshes.push(mesh);
    return state;
  });
  ctx.progress(0.8);

  /* The chutes, drawn over D's floors, whose crash surface is water;
   * the jets off their flip buckets, and the plume where they land. */
  const lane = lanes(dam.find((p) => p.part === 'spillway').figures);
  const chuteMat = water(chuteMaterial(THREE, {
    waves, time, envMap, lane,
  }));
  const chute = new THREE.Mesh(chuteGeometry(THREE, floors, axis, lane), chuteMat);
  chute.name = 'itaipu-chute';
  chute.receiveShadow = true;
  group.add(chute);
  /* The look's own sun, whatever the time of day: its direction as
   * itaipu.js hands it to the parts, its light the time's
   * (look/index.js writes the scene's timeOfDay). */
  const sun = {
    direction: ctx.sunDir, ...sunFor(ctx.scene.userData.timeOfDay), sky: SPRAY_SKY,
  };
  const spray = plume(THREE, spill, axis, PLUNGE_DOWN, WIND_TO, {
    waves, time, sun, riverY: river.y,
  });
  if (thermal) {
    /* Spray a little under the water's own temperature, and thin: a
     * thermal camera sees through most of a plume. */
    thermal.shader(spray.material, 'float thT = thEnv2.x - 0.02; float thA = 0.5;', 'itaipu-water-spray');
  }
  group.add(spray);
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
  const inView = viewTest(THREE);
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
        m.planar = water(withField(THREE, waterMaterial({ ...m.opts, planar: m.mirror }), m.uniforms));
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
  /* The sky dome is not drawn into the mirror: the water's shader puts
   * the sky's blurred image where the mirror holds nothing (SMEAR). */
  const sky = ctx.scene.getObjectByName('sky');
  const hide = sky ? [group, sky] : [group];
  const clearWas = new THREE.Color();
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
    /* The mirror draws the whole scene again: not for a body the camera
     * cannot see, which then takes the sky's light as the other does. */
    const shown = inView(made[k], camera);
    for (const mesh of made[k].meshes) {
      mesh.material = shown ? made[k].planar : made[k].env;
    }
    if (!shown) {
      stats.mirrorCalls = 0;
      stats.mirrorTriangles = 0;
      return false;
    }
    const info = renderer.info.render;
    const calls = info.calls;
    const triangles = info.triangles;
    /* Cleared to no colour and no alpha, with no background drawn, so its
     * alpha is what of the scene it holds. */
    const background = scene.background;
    const alphaWas = renderer.getClearAlpha();
    renderer.getClearColor(clearWas);
    scene.background = null;
    renderer.setClearColor(0x000000, 0);
    try {
      stats.mirrorDrawn = made[k].mirror.render(renderer, scene, camera, hide);
    } finally {
      scene.background = background;
      renderer.setClearColor(clearWas, alphaWas);
    }
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
  /* The flood (live.js): Free Flight's typical spill until a war says
   * otherwise. */
  const flood = liveFlood();
  let clockMs = null;

  return {
    group,
    /* An opening in the dam (docs/DAMBREAK-CONTRACT), from the war's
     * damage: into the flood. */
    onOpening(o) {
      flood.open(o);
    },
    /* A mission's gate state ({ gate, at, open_m } each), or null for
     * no war (live.js). */
    setGates(list) {
      flood.setGates(list);
    },
    /* Each opening's discharge, m3/s, and where (world, y up). */
    flows: () => flood.flows(),
    /* Where the spillway's jets come down, for its roar
     * (src/render/world-audio.js audioBeds). */
    plunges: spill.map((b) => b.land),
    /* The sim clock's milliseconds: the ripples and the chute's flow run
     * on it, and the mirror is due again. */
    update(step) {
      time.value = step / 1000;
      due = true;
      /* In a room the animation clock is the room's (src/main.js
       * trafficMs), the clock the flood steps on. */
      clockMs = step;
      flood.advance(step);
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
      spray.geometry.dispose();
      spray.material.dispose();
      fieldTex.dispose();
      waves.dispose();
    },
    stats: () => ({
      ...stats,
      bodies: bodies.map((b) => ({ name: b.name, y: b.y, vertices: b.outline.length })),
      flood: flood.stats(clockMs),
    }),
  };
}
