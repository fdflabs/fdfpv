/*
 * dam/index.js: the dam, the spillway and the powerhouse as solids
 * (docs/ITAIPU-PLAN.md section 6, package D).
 *
 * Every concrete structure is built along its crest road's centre line
 * (dam.json `axis`) from Itaipu Binacional's figures, and down to its
 * published foundation (`baseY`) or the flattened footprint (`groundY`),
 * whichever is lower, so the footprint's cliff is always filled:
 *
 *   main dam         1 064 m, crest 225, from 29: the upstream face on the
 *                    OpenStreetMap footprint's upstream edge, the crest,
 *                    the vertical band under it, and the downstream face
 *                    falling onto the powerhouse at 148
 *   powerhouse       968 m by 99 m on its own axis, roof 148, down to 36
 *                    (148 less its published 112 m)
 *   penstocks        20, 10.5 m, one per unit, lying on the downstream face
 *   right lateral    998 m buttress dam, crest 225, from 160.5
 *   diversion        170 m gravity dam, from 63
 *   left lateral     100 m between the diversion and the rockfill dam
 *   spillway         362 m wide on the right bank: 15 piers, 14 gates
 *                    20 x 21.34 m on a 199.16 m sill, the bridge on top,
 *                    and three chutes 483 m long down the floor profile
 *   embankments      terrain (package A burns them in); here only their
 *                    crest roads, as flat ground a plane can land on
 *
 * HOW IT COLLIDES (section 6, collision model). The shell has capsules,
 * spheres and world aligned boxes. A top a craft can stand on is a roof
 * record (src/maps/alps/roofs.js), a plane over a convex plan, which the
 * plant meets as ground: the crest, the powerhouse roof, the bridge, the
 * chute floor, and the downstream faces too, which are 42 to 62 degrees,
 * well inside what the plant's ground catches (a face rising 0.15 m in one
 * 1 ms step is offered, so 62 degrees holds to 80 m/s). A vertical face
 * is a wall: the solid under a flat top, cut across the world axis it runs
 * along into columns (prismBoxes) whose stair is at most STAIR, each held
 * SKIN under the top. The penstocks and the crest parapets are capsules,
 * the one shape that takes a turned cylinder exactly.
 *
 * Everything the plant is given is fixed when the map is built and read
 * with + - * / afterwards (CLAUDE.md, determinism).
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

import { recordAt, roofSlabs } from '../../alps/roofs.js';

/* Section 6: the crest of every concrete part and its gantry rails. */
const CREST_Y = 225;
/* A solid's top under the roof over it (roofs.js SKIN). */
const SKIN = 0.02;
/* The most a turned face's stair of columns steps out, metres. */
const STAIR = 0.25;
const COLUMN_MIN = 0.5;
const COLUMN_MAX = 4;
/* Axis metres per roof record and per run of columns: long records
 * register in every 8 m cell of their bounding box. */
const CHUNK = 32;
/* How far a record's crash slab (roofs.js roofSlabs) sits under its top.
 * The crest is many records edge to edge in one plane, and the crash
 * physics is handed every roof's slab but the one the craft is on: a
 * neighbour's slab flush with the ground plane was a step the wheels met
 * rolling over the joint, and bent the Timber's gear every 15 m. Under
 * it by more than a wheel's contact sinks, the slab still catches a
 * broken part that falls on it. */
const SLAB_SINK = 0.05;
/* The parapets along a crest road: 1.1 m of concrete (crest-road photo). */
const PARAPET_R = 0.55;

/* Main dam section, metres from the crest road's centre line, downstream
 * positive: the crest's downstream edge and the vertical band under it,
 * before the face falls to the powerhouse (the dam-downstream photo). */
const MAIN = { crestDown: 9, bandY: 212 };
const POWERHOUSE = { halfWidth: 49.5 };
/* The gravity parts' section: the crest 28 m across the derived
 * footprint, and a downstream face at 0.75 horizontal to 1 vertical,
 * the usual for a gravity dam (the pages publish no face slope). */
const GRAVITY = { up: -20, crestDown: 8, bandY: 215, slope: 0.75 };
/* The right wing's section from its footprint: the crest road 5 m from
 * the upstream edge, the buttresses' faces reaching the footprint's
 * downstream edge 29 m out at groundY. */
const BUTTRESS = { up: -5, crestDown: 6, bandY: 221, slope: 0.53 };
/* The embankments' crest (dam.json sections: crestWidth 14). */
const EMBANKMENT_HALF = 7;
/* A training wall's collision skin along each face, metres. */
const WALL_SKIN = 0.5;

/* The spillway: the published 362 m, 15 piers and 14 gates 20 m wide,
 * so a pier is (362 - 14 x 20) / 15 across. Three chutes of 4, 4 and 6
 * gates from the west (the aerial-spill-2 photograph; the footprint
 * steps in where the second divider stands), ending where the footprint
 * ends each (west 483, the published length). */
const SPILL = {
  width: 362,
  gates: 14,
  gateWidth: 20,
  gateHeight: 21.34,
  sill: 199.16,
  /* The gates stand part open, the spillway running (section 5). */
  gateOpen: 5,
  upstream: -8,
  deck: [-7, 7],
  deckUnder: 222.8,
  gate: [10.5, 12],
  pierEnd: 42,
  /* The piers' hoist decks downstream of the bridge, flat. */
  pierLow: 213,
  dividers: [4, 8],
  bayEnds: [483, 456, 423],
  wallHeight: 8,
  dividerWidth: 3,
};

/* Linear colours (vertex colour times the photograph). */
const TONE = {
  concrete: [1.45, 1.41, 1.33],
  crest: [1.6, 1.56, 1.48],
  face: [1.35, 1.3, 1.22],
  chute: [1.0, 0.94, 0.86],
  deck: [1.55, 1.5, 1.42],
  road: [1.3, 1.27, 1.2],
  asphalt: [0.55, 0.55, 0.56],
  shoulder: [0.7, 0.6, 0.5],
  rock: [0.45, 0.33, 0.27],
  gate: [0.36, 0.1, 0.04],
  penstock: [0.82, 0.82, 0.8],
};

/* ------------------------------------------------------------ plan math */

function dist(p, q) {
  return Math.hypot(q[0] - p[0], q[1] - p[1]);
}

/* A frame along a direction: t along it, s across it, +s downstream for
 * every axis dam.json gives (they run west to east along the crest). */
function frameOf(o, dir) {
  const l = Math.hypot(dir[0], dir[1]);
  const a = [dir[0] / l, dir[1] / l];
  const n = [-a[1], a[0]];
  return {
    a,
    n,
    at: (t, s) => [o[0] + a[0] * t + n[0] * s, o[1] + a[1] * t + n[1] * s],
    local: (x, z) => {
      const dx = x - o[0];
      const dz = z - o[1];
      return [dx * a[0] + dz * a[1], dx * n[0] + dz * n[1]];
    },
  };
}

/* Piecewise linear f over knots [[x, y]...], held flat past the ends. */
function linear(knots) {
  return (x) => {
    if (x <= knots[0][0]) {
      return knots[0][1];
    }
    for (let i = 1; i < knots.length; i += 1) {
      if (x <= knots[i][0]) {
        const [x0, y0] = knots[i - 1];
        const [x1, y1] = knots[i];
        return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
      }
    }
    return knots[knots.length - 1][1];
  };
}

/*
 * Sections along a polyline axis, every CHUNK metres and at every vertex,
 * each { p, m, t }: the point, the offset direction (the mitre at a
 * vertex, scaled so an offset s lands s from both segments' lines, the
 * segment's normal between) and the distance along. Vertices closer
 * than 2 m to the one before are dropped: dam.json's axes carry the
 * crest road's own kinks.
 */
function sectionsOf(axis, chunk = CHUNK) {
  const pts = [axis[0]];
  for (const p of axis.slice(1)) {
    if (dist(pts[pts.length - 1], p) >= 2) {
      pts.push(p);
    }
  }
  const last = axis[axis.length - 1];
  if (pts[pts.length - 1] !== last) {
    pts[pts.length - 1] = last;
  }
  const normal = (p, q) => {
    const l = dist(p, q);
    return [-(q[1] - p[1]) / l, (q[0] - p[0]) / l];
  };
  const out = [];
  let t = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const nPrev = i > 0 ? normal(pts[i - 1], pts[i]) : null;
    const nNext = i < pts.length - 1 ? normal(pts[i], pts[i + 1]) : null;
    let m = nNext || nPrev;
    if (nPrev && nNext) {
      const u = [nPrev[0] + nNext[0], nPrev[1] + nNext[1]];
      const l = Math.hypot(u[0], u[1]);
      const k = 1 / ((u[0] / l) * nNext[0] + (u[1] / l) * nNext[1]);
      m = [(u[0] / l) * k, (u[1] / l) * k];
    }
    out.push({ p: pts[i], m, t });
    if (!nNext) {
      break;
    }
    const len = dist(pts[i], pts[i + 1]);
    const n = Math.max(1, Math.round(len / chunk));
    for (let k = 1; k < n; k += 1) {
      const f = k / n;
      out.push({ p: [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f], m: nNext, t: t + len * f });
    }
    t += len;
  }
  return out;
}

const offset = (sec, s) => [sec.p[0] + sec.m[0] * s, sec.p[1] + sec.m[1] * s];

/* A convex polygon [[x, z]...] clipped to lo <= coordinate k <= hi. */
function clipAxis(poly, k, lo, hi) {
  let out = poly;
  for (const [v, sign] of [[lo, 1], [hi, -1]]) {
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i += 1) {
      const a = src[i];
      const b = src[(i + 1) % src.length];
      const da = (a[k] - v) * sign;
      const db = (b[k] - v) * sign;
      if (da >= 0) {
        out.push(a);
      }
      if ((da >= 0) !== (db >= 0)) {
        const f = da / (da - db);
        out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      }
    }
    if (out.length < 3) {
      return [];
    }
  }
  return out;
}

/* ------------------------------------------------------------ the mesh */

/*
 * Triangles by material, with normals, metre uvs and linear colours. A
 * face is wound toward `out` whatever order its corners come in, so the
 * builders say which way is outside rather than keep a winding.
 */
class Mesher {
  constructor() {
    this.p = [];
    this.n = [];
    this.uv = [];
    this.c = [];
  }

  tri(A, B, C, col, out) {
    const ux = B[0] - A[0];
    const uy = B[1] - A[1];
    const uz = B[2] - A[2];
    const vx = C[0] - A[0];
    const vy = C[1] - A[1];
    const vz = C[2] - A[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-7) {
      return;
    }
    let P = [A, B, C];
    if (out && nx * out[0] + ny * out[1] + nz * out[2] < 0) {
      P = [A, C, B];
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    nx /= l;
    ny /= l;
    nz /= l;
    /* Metres along the face: a flat face runs x and -z, a steep one
     * along its horizontal and up. */
    let tx = 1;
    let tz = 0;
    const flat = Math.abs(ny) > 0.7;
    if (!flat) {
      const h = Math.hypot(nx, nz);
      tx = nz / h;
      tz = -nx / h;
    }
    for (const q of P) {
      this.p.push(q[0], q[1], q[2]);
      this.n.push(nx, ny, nz);
      if (flat) {
        this.uv.push(q[0], -q[2]);
      } else {
        this.uv.push(q[0] * tx + q[2] * tz, q[1]);
      }
      this.c.push(col[0], col[1], col[2]);
    }
  }

  quad(A, B, C, D, col, out) {
    this.tri(A, B, C, col, out);
    this.tri(A, C, D, col, out);
  }

  /* A convex polygon, fanned. */
  poly(P, col, out) {
    for (let i = 1; i + 1 < P.length; i += 1) {
      this.tri(P[0], P[i], P[i + 1], col, out);
    }
  }

  get triangles() {
    return this.p.length / 9;
  }

  geometry(THREE) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/* A block's own shade: no two pours of concrete came out one grey. */
function shade(tone, k, spread = 0.07) {
  const h = Math.sin(k * 12.9898 + 78.233) * 43758.5453;
  const f = 1 + spread * (2 * (h - Math.floor(h)) - 1);
  return [tone[0] * f, tone[1] * f, tone[2] * f];
}

/* ------------------------------------------------------------ materials */

/*
 * The light the sunlit ground throws back onto a face turned from the
 * sky: the environment is the sky alone, so a wall in the shade had only
 * the sky's thin share and drew black. A vertical face sees half the
 * ground, lit at the sun's 65.8 degrees (look/light.js) with swiss2's
 * SUN_IRRADIANCE 3.51, at the red earth's albedo of about 0.2:
 * 0.5 x 0.2 x 3.51 x 0.91 = 0.32, and the sunlit concrete round it
 * (the powerhouse roof, the chute, the next buttress) about as much
 * again: 0.55 on a vertical face, twice that on one turned down.
 */
const BOUNCE = /* glsl */ `
  reflectedLight.indirectDiffuse += 1.1 * 0.5 * (1.0 - itdN.y) * vec3(1.0, 0.93, 0.84) * BRDF_Lambert(material.diffuseColor);
`;

/*
 * The dam's concrete: swiss2's photographed concrete, tinted per vertex,
 * aged in world space so its 3 m tile never repeats across a kilometre of
 * face: blotches a few tens of metres across, rain run down every steep
 * face in long dark streaks with the lime leached pale between them, and
 * the water's marks, green black at the tailwater and a dark band at the
 * reservoir's line. vS2World is declared by the look's light
 * (look/light.js inject), which every material in the scene goes through.
 */
const AGE_PARS = /* glsl */ `
  vec3 itdN = vec3(0.0, 1.0, 0.0);
  float itdHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float itdNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(itdHash(i), itdHash(i + vec2(1.0, 0.0)), u.x),
               mix(itdHash(i + vec2(0.0, 1.0)), itdHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
`;
const AGE_BODY = /* glsl */ `
  {
    vec3 wn = inverseTransformDirection(normal, viewMatrix);
    itdN = wn;
    float steep = 1.0 - smoothstep(0.5, 0.85, abs(wn.y));
    vec2 along = normalize(vec2(wn.z, -wn.x) + 1e-5);
    float h = dot(vS2World.xz, along);
    float blot = itdNoise(vS2World.xz / 29.0 + vS2World.y / 37.0) * 0.6 + itdNoise(vS2World.xz / 7.0 - vS2World.y / 11.0) * 0.4;
    diffuseColor.rgb *= 0.8 + 0.34 * blot;
    float run = itdNoise(vec2(h * 0.45, vS2World.y * 0.03)) * 0.65 + itdNoise(vec2(h * 1.9 + 17.0, vS2World.y * 0.07)) * 0.35;
    diffuseColor.rgb *= 1.0 - 0.42 * smoothstep(0.48, 0.82, run) * steep;
    float leach = smoothstep(0.68, 0.9, itdNoise(vec2(h * 0.8 + 5.0, vS2World.y * 0.018)));
    diffuseColor.rgb *= 1.0 + 0.22 * leach * steep;
    diffuseColor.rgb *= mix(vec3(0.42, 0.46, 0.38), vec3(1.0), smoothstep(103.5, 109.0, vS2World.y));
    diffuseColor.rgb *= 1.0 - 0.3 * steep * (1.0 - smoothstep(0.0, 2.2, abs(vS2World.y - 220.0)));
  }
`;

function concreteMaterial(THREE, set, key) {
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    map: set.col,
    normalMap: set.nrm,
    roughnessMap: set.arm,
    roughness: 1,
    aoMap: set.arm,
    aoMapIntensity: 1,
    metalness: 0,
  });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${AGE_PARS}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${AGE_BODY}`)
      .replace('#include <aomap_fragment>', `${BOUNCE}\n#include <aomap_fragment>`);
  };
  m.customProgramCacheKey = () => `itaipu-dam-${key}`;
  return m;
}

/* ------------------------------------------------------------ the build */

export async function buildPart(ctx) {
  const { THREE } = ctx;
  const byPart = Object.fromEntries(ctx.data['dam.json'].map((e) => [e.part, e]));
  const need = (name) => {
    const e = byPart[name];
    if (!e) {
      throw new Error(`itaipu dam: dam.json has no part "${name}"`);
    }
    return e;
  };

  /* ---- what the part adds to the map, kept for stats() and survey() */
  const solids = [];
  const boxes = [];
  const capsules = [];
  const records = [];
  const faces = [];
  const figures = {};
  const sites = {};

  const addBox = (x0, y0, z0, x1, y1, z1) => {
    const i = ctx.colliders.addBox('wall', x0, y0, z0, x1, y1, z1);
    solids.push(i);
    boxes.push([x0, y0, z0, x1, y1, z1]);
    return i;
  };
  const addCapsule = (kind, a, b, r) => {
    const i = ctx.colliders.ax.length;
    ctx.colliders.add(kind, a[0], a[1], a[2], b[0], b[1], b[2], r);
    solids.push(i);
    capsules.push({ a, b, r, i });
    return i;
  };

  /*
   * The solid under a flat or planar top over a convex plan, as world
   * boxes: cut across the world axis that `dir`, the way its long faces
   * run (by default its longest edge), runs along, into columns just
   * narrow enough that those faces step at most STAIR, each column's top
   * held SKIN under the top over it, and runs of equal
   * columns merged. Its ends step as far as a column is wide, at most
   * COLUMN_MAX. Returns the collider indices.
   */
  const prismBoxes = (poly, y0, topAt, dir = null) => {
    let ex = dir ? dir[0] : 1;
    let ez = dir ? dir[1] : 0;
    let best = 0;
    for (let i = 0; i < poly.length && !dir; i += 1) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const l = dist(a, b);
      if (l > best) {
        best = l;
        ex = b[0] - a[0];
        ez = b[1] - a[1];
      }
    }
    const k = Math.abs(ex) >= Math.abs(ez) ? 0 : 1;
    const turn = k === 0 ? Math.abs(ez / ex) : Math.abs(ex / ez);
    const w = Math.min(COLUMN_MAX, Math.max(COLUMN_MIN, STAIR / Math.max(turn, 1e-9)));
    const lo = Math.min(...poly.map((p) => p[k]));
    const hi = Math.max(...poly.map((p) => p[k]));
    const n = Math.max(1, Math.ceil((hi - lo) / w - 1e-9));
    const step = (hi - lo) / n;
    const out = [];
    let run = null;
    const flush = () => {
      if (run) {
        out.push(addBox(run[0], y0, run[1], run[2], run[4], run[3]));
      }
      run = null;
    };
    for (let i = 0; i < n; i += 1) {
      const q = clipAxis(poly, k, lo + i * step, lo + (i + 1) * step);
      if (q.length < 3) {
        continue;
      }
      const qx = q.map((p) => p[0]);
      const qz = q.map((p) => p[1]);
      const b = [Math.min(...qx), Math.min(...qz), Math.max(...qx), Math.max(...qz)];
      /* Under the top over the column's own plan: where the column's
       * box reaches past the plan (at most its stair) the top may stand
       * that stair's rise proud, a few centimetres on these slopes. */
      const top = Math.min(...q.map(([x, z]) => topAt(x, z))) - SKIN;
      if (!(top > y0 + 0.05)) {
        flush();
        continue;
      }
      const o = 1 - k;
      if (run && Math.abs(run[o] - b[o]) < 1e-6 && Math.abs(run[o + 2] - b[o + 2]) < 1e-6 && Math.abs(run[4] - top) < 1e-6) {
        run[k + 2] = b[k + 2];
        continue;
      }
      flush();
      run = [...b, top];
    }
    flush();
    return out;
  };

  /* A roof record over world faces [[x, y, z]...], each convex. */
  const addRoof = (top, kind, material = 'concrete') => {
    const rec = recordAt({
      top, dy: 1, hw: 0, hd: 0, open: true, kind,
    }, 'itaipu-dam', 0, 0, 0, 0);
    rec.material = material;
    rec.solids = [];
    rec.eaves = [];
    rec.slabs = roofSlabs(rec).map((b) => ({
      ...b, c: [b.c[0] - b.n[0] * SLAB_SINK, b.c[1] - b.n[1] * SLAB_SINK, b.c[2] - b.n[2] * SLAB_SINK],
    }));
    ctx.roofs.push(rec);
    records.push(rec);
    return rec;
  };
  /* A flat top's record and the columns under it, which it lets a craft
   * standing on it through (roofs.js cover), with its neighbours' along
   * the same run so a craft on a record's edge is not caught on the next. */
  const flatRuns = [];
  const flatBlock = (poly, y0, y, kind, run, dir = null) => {
    const rec = addRoof([poly.map(([x, z]) => [x, y, z])], kind);
    const ids = prismBoxes(poly, y0, () => y, dir);
    if (run) {
      run.push({ rec, ids });
    }
    return { rec, ids };
  };
  const closeRun = (run) => {
    run.forEach((r, k) => {
      for (const j of [k - 1, k, k + 1]) {
        if (run[j]) {
          r.rec.solids.push(...run[j].ids);
        }
      }
    });
    flatRuns.push(run);
  };
  /* A planar top's record: a quad's two triangles, each exactly planar. */
  const slopeRoof = (A, B, C, D, kind) => addRoof([[A, B, C], [A, C, D]], kind);

  const concrete = new Mesher();
  const road = new Mesher();
  const metal = new Mesher();
  const up = [0, 1, 0];
  const face = (name, kind, pts) => faces.push({ name, kind, pts });

  /* The ground under a plan: the lowest of its corners and middle, for
   * the parts with no published foundation. */
  const lowest = (pts) => Math.min(...pts.map(([x, z]) => ctx.ground(x, z)));
  const bottomOf = (e, pts) => Math.min(e.baseY ?? Infinity, (e.groundY ?? Infinity) - 2, lowest(pts) - 2);

  /*
   * A gravity section swept along an axis: [s, y] points from the
   * upstream foot over the crest to the downstream foot, the same count
   * at every section. Draws every face but the underside, and the ends.
   */
  const sweep = (secs, profileAt, col) => {
    const P = secs.map((sec, k) => profileAt(sec, k).map(([s, y]) => {
      const [x, z] = offset(sec, s);
      return [x, y, z];
    }));
    for (let k = 0; k + 1 < secs.length; k += 1) {
      const a = P[k];
      const b = P[k + 1];
      const c = col(k);
      for (let i = 0; i + 1 < a.length; i += 1) {
        const sec = secs[k];
        const prof = profileAt(sec, k);
        const ds = prof[i + 1][0] - prof[i][0];
        const dy = prof[i + 1][1] - prof[i][1];
        const outS = -dy;
        const outY = ds;
        const out = [sec.m[0] * outS, outY, sec.m[1] * outS];
        concrete.quad(a[i], b[i], b[i + 1], a[i + 1], c, out);
      }
    }
    for (const [k, dir] of [[0, -1], [secs.length - 1, 1]]) {
      const i1 = Math.min(k + 1, secs.length - 1);
      const i0 = Math.max(k - 1, 0);
      const along = [(secs[i1].p[0] - secs[i0].p[0]) * dir, 0, (secs[i1].p[1] - secs[i0].p[1]) * dir];
      concrete.poly(P[k], col(k), along);
    }
    return P;
  };

  /* A crest's parapets: capsules along both edges, CHUNK long at most. */
  const parapets = (secs, sUp, sDown) => {
    for (const s of [sUp, sDown]) {
      for (let k = 0; k + 1 < secs.length; k += 1) {
        const [ax, az] = offset(secs[k], s);
        const [bx, bz] = offset(secs[k + 1], s);
        addCapsule('wall', [ax, CREST_Y + PARAPET_R, az], [bx, CREST_Y + PARAPET_R, bz], PARAPET_R);
      }
    }
  };
  /* The parapet walls drawn: a low wall along the same line. */
  const drawParapet = (secs, s, t = 0.5) => {
    for (let k = 0; k + 1 < secs.length; k += 1) {
      const a0 = offset(secs[k], s - t / 2);
      const a1 = offset(secs[k], s + t / 2);
      const b0 = offset(secs[k + 1], s - t / 2);
      const b1 = offset(secs[k + 1], s + t / 2);
      const y0 = CREST_Y;
      const y1 = CREST_Y + 2 * PARAPET_R;
      const c = TONE.crest;
      const m = secs[k].m;
      concrete.quad([a0[0], y0, a0[1]], [b0[0], y0, b0[1]], [b0[0], y1, b0[1]], [a0[0], y1, a0[1]], c, [-m[0], 0, -m[1]]);
      concrete.quad([a1[0], y0, a1[1]], [b1[0], y0, b1[1]], [b1[0], y1, b1[1]], [a1[0], y1, a1[1]], c, [m[0], 0, m[1]]);
      concrete.quad([a0[0], y1, a0[1]], [b0[0], y1, b0[1]], [b1[0], y1, b1[1]], [a1[0], y1, a1[1]], c, up);
    }
  };
  /* The road's surface along a crest, s0 to s1, a hair over its record. */
  const drawRoad = (secs, s0, s1, tone) => {
    for (let k = 0; k + 1 < secs.length; k += 1) {
      const a0 = offset(secs[k], s0);
      const a1 = offset(secs[k], s1);
      const b0 = offset(secs[k + 1], s0);
      const b1 = offset(secs[k + 1], s1);
      const y = CREST_Y + 0.02;
      road.quad([a0[0], y, a0[1]], [b0[0], y, b0[1]], [b1[0], y, b1[1]], [a1[0], y, a1[1]], tone, up);
    }
  };

  /* ================================================== the main dam */
  /* dam.json names it "main dam and connecting blocks" (section 6's row). */
  const main = ctx.data['dam.json'].find((e) => e.part.startsWith('main dam'));
  const ph = need('powerhouse');
  const O = [-352.9, -1826.5];
  const F = frameOf(O, [636.7 - O[0], -1610.5 - O[1]]);
  /* The crest line is straight within 1.7 m from the right wing to the
   * diversion: its published 1 064 m ends at the diversion's first node. */
  const tEnd = F.local(...main.axis[main.axis.length - 1])[0];
  const tStart = tEnd - main.figures.crestLength;
  /* The upstream face on the footprint's upstream edge (OSM way
   * 32236291's nodes from the west corner to the east one). */
  const upKnots = [[-348.5, -1864.3], [34.5, -1773.4], [495.7, -1670.4]].map(([x, z]) => F.local(x, z));
  const sUp = linear(upKnots);
  /* The powerhouse's upstream wall, 49.5 m upstream of its axis. */
  const phAxis = ph.axis.map(([x, z]) => F.local(x, z));
  const phT0 = phAxis[0][0];
  const phT1 = phAxis[phAxis.length - 1][0];
  const sPhAxis = linear(phAxis);
  const sPh = (t) => sPhAxis(t) - POWERHOUSE.halfWidth;
  const mainBase = main.baseY;
  const faceRun = (t) => sPh(Math.min(phT1, Math.max(phT0, t))) - MAIN.crestDown;
  const faceDrop = MAIN.bandY - ph.figures.roofY;
  /* Where the face meets the ground past the powerhouse's ends: on at
   * the same slope down to the foundation. */
  const toeOf = (t) => {
    if (t >= phT0 - 1e-6 && t <= phT1 + 1e-6) {
      return [sPh(t), ph.figures.roofY];
    }
    const slope = faceRun(t) / faceDrop;
    return [MAIN.crestDown + (MAIN.bandY - mainBase) * slope, mainBase];
  };
  const mainProfile = (t) => {
    const [st, yt] = toeOf(t);
    return [[sUp(t), mainBase], [sUp(t), CREST_Y], [MAIN.crestDown, CREST_Y], [MAIN.crestDown, MAIN.bandY], [st, yt], [st, mainBase]];
  };
  /* Three sweeps, the powerhouse's ends breaking the face. */
  const tKnots = [tStart, phT0, ...upKnots.map((k) => k[0]), ...phAxis.map((k) => k[0]), phT1, tEnd]
    .filter((t) => t >= tStart && t <= tEnd).sort((a, b) => a - b);
  const mainSpans = [[tStart, phT0 - 1e-3], [phT0, phT1], [phT1 + 1e-3, tEnd]];
  const blockLen = main.figures.crestLength / main.figures.blocks;
  let mainTriangles = concrete.triangles;
  const crestRun = [];
  for (const [ta, tb] of mainSpans) {
    const ts = [ta];
    for (const k of tKnots) {
      if (k > ta + 1e-3 && k < tb - 1e-3) {
        ts.push(k);
      }
    }
    ts.push(tb);
    const fine = [];
    for (let i = 0; i + 1 < ts.length; i += 1) {
      const n = Math.max(1, Math.ceil((ts[i + 1] - ts[i]) / blockLen));
      for (let k = 0; k < n; k += 1) {
        fine.push(ts[i] + ((ts[i + 1] - ts[i]) * k) / n);
      }
    }
    fine.push(tb);
    const secs = fine.map((t) => ({ p: F.at(t, 0), m: F.n, t }));
    sweep(secs, (sec) => mainProfile(sec.t), (k) => shade(TONE.face, Math.round(secs[k].t / blockLen)));
    for (let k = 0; k + 1 < secs.length; k += 1) {
      const t0 = secs[k].t;
      const t1 = secs[k + 1].t;
      /* The crest and the column under it, the upstream face with it. */
      const poly = [F.at(t0, sUp(t0)), F.at(t1, sUp(t1)), F.at(t1, MAIN.crestDown), F.at(t0, MAIN.crestDown)];
      flatBlock(poly, mainBase, CREST_Y, 'crest', crestRun, F.a);
      /* The downstream face, the ground a craft meets it as. */
      const [s0, y0] = toeOf(t0);
      const [s1, y1] = toeOf(t1);
      const A = F.at(t0, MAIN.crestDown);
      const B = F.at(t1, MAIN.crestDown);
      const C = F.at(t1, s1);
      const D = F.at(t0, s0);
      slopeRoof([A[0], MAIN.bandY, A[1]], [B[0], MAIN.bandY, B[1]], [C[0], y1, C[1]], [D[0], y0, D[1]], 'face');
      face('main dam upstream face', 'wall', [[...F.at(t0, sUp(t0)), 216], [...F.at(t1, sUp(t1)), 216], [...F.at(t1, sUp(t1)), CREST_Y], [...F.at(t0, sUp(t0)), CREST_Y]].map(([x, z, y]) => [x, y, z]));
      face('main dam downstream band', 'wall', [[A[0], MAIN.bandY, A[1]], [B[0], MAIN.bandY, B[1]], [B[0], CREST_Y, B[1]], [A[0], CREST_Y, A[1]]]);
      face('main dam crest', 'roof', poly.map(([x, z]) => [x, CREST_Y, z]));
      face('main dam downstream face', 'roof', [[A[0], MAIN.bandY, A[1]], [B[0], MAIN.bandY, B[1]], [C[0], y1, C[1]], [D[0], y0, D[1]]]);
    }
    const crestSecs = secs;
    parapets(crestSecs, -5.3, MAIN.crestDown - 0.3);
    drawParapet(crestSecs, -5.3);
    drawParapet(crestSecs, MAIN.crestDown - 0.3);
    drawRoad(crestSecs, -5, MAIN.crestDown - 0.6, TONE.road);
  }
  closeRun(crestRun);
  mainTriangles = concrete.triangles - mainTriangles;
  figures.mainCrestLength = tEnd - tStart;
  figures.mainMaxHeight = CREST_Y - mainBase;
  figures.mainBlocks = Math.round((tEnd - tStart) / blockLen);
  /* The road's middle, between its parapets. */
  const mid = F.at((tStart + tEnd) / 2, (MAIN.crestDown - 5.6) / 2);
  sites.mainCrest = {
    x: mid[0], z: mid[1], y: CREST_Y, dir: F.a, across: F.n,
  };
  const upAt = F.at(400, sUp(400));
  sites.upstreamFace = {
    x: upAt[0], z: upAt[1], y: 222, dir: F.n,
  };

  /* ================================================== the powerhouse */
  const phBase = ph.figures.roofY - ph.figures.maxHeight;
  {
    const secs = sectionsOf(ph.axis, 34);
    /* Its axis gives the downstream 99 m; the sections run exactly the
     * published length (the axis was extended to it by package A). */
    const prof = () => [[-POWERHOUSE.halfWidth, phBase], [-POWERHOUSE.halfWidth, ph.figures.roofY], [POWERHOUSE.halfWidth, ph.figures.roofY], [POWERHOUSE.halfWidth, phBase]];
    sweep(secs, prof, (k) => shade(TONE.concrete, 500 + k, 0.05));
    const roofRun = [];
    for (let k = 0; k + 1 < secs.length; k += 1) {
      const poly = [offset(secs[k], -POWERHOUSE.halfWidth), offset(secs[k + 1], -POWERHOUSE.halfWidth), offset(secs[k + 1], POWERHOUSE.halfWidth), offset(secs[k], POWERHOUSE.halfWidth)];
      flatBlock(poly, phBase, ph.figures.roofY, 'powerhouse roof', roofRun, [secs[k + 1].p[0] - secs[k].p[0], secs[k + 1].p[1] - secs[k].p[1]]);
      const a = offset(secs[k], POWERHOUSE.halfWidth);
      const b = offset(secs[k + 1], POWERHOUSE.halfWidth);
      face('powerhouse downstream wall', 'wall', [[a[0], 104, a[1]], [b[0], 104, b[1]], [b[0], ph.figures.roofY, b[1]], [a[0], ph.figures.roofY, a[1]]]);
      face('powerhouse roof', 'roof', poly.map(([x, z]) => [x, ph.figures.roofY, z]));
    }
    closeRun(roofRun);
    figures.powerhouseLength = secs[secs.length - 1].t;
    figures.powerhouseWidth = 2 * POWERHOUSE.halfWidth;
    figures.powerhouseRoofY = ph.figures.roofY;
    figures.powerhouseMaxHeight = ph.figures.roofY - phBase;
    const at = offset(secs[Math.floor(secs.length / 2)], 25);
    const dir = [secs[1].p[0] - secs[0].p[0], secs[1].p[1] - secs[0].p[1]];
    const l = Math.hypot(dir[0], dir[1]);
    sites.powerhouseRoof = {
      x: at[0], z: at[1], y: ph.figures.roofY, dir: [dir[0] / l, dir[1] / l],
    };
  }

  /* ================================================== the penstocks */
  /*
   * One per unit, on its line from the crest to the unit (dam.json). Each
   * comes out of the face at 185 m at a shallower angle than the face, so
   * it stands clear of it by its radius and a half metre where the face
   * meets the powerhouse, and goes on down into the powerhouse roof. The
   * rest of its published 142.2 m runs inside the dam and the powerhouse.
   */
  const pen = need('penstocks');
  const penR = pen.figures.innerDiameter / 2;
  const penEnds = [];
  for (const [ux, uz] of ph.units) {
    const [t] = F.local(ux, uz);
    const slope = faceDrop / faceRun(t);
    const out = (penR + 0.5) * Math.sqrt(1 + slope * slope);
    const sE = MAIN.crestDown + (MAIN.bandY - 185) / slope;
    const sT = sPh(t);
    const k = (185 - (ph.figures.roofY + out)) / (sT - sE);
    const sIn = sE - 6;
    const sFoot = sT + (out + 5) / k;
    const A = F.at(t, sIn);
    const B = F.at(t, sFoot);
    penEnds.push([[A[0], 185 + 6 * k, A[1]], [B[0], ph.figures.roofY - 5, B[1]]]);
  }
  const penIndex = penEnds.map(([A, B]) => addCapsule('wall', A, B, penR));
  let penstockMesh;
  {
    const geo = new THREE.CylinderGeometry(penR, penR, 1, 28, 1, true);
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(...TONE.penstock, THREE.LinearSRGBColorSpace), roughness: 0.5, metalness: 0.1 });
    const mesh = new THREE.InstancedMesh(geo, mat, penEnds.length);
    const q = new THREE.Quaternion();
    const Y = new THREE.Vector3(0, 1, 0);
    const d = new THREE.Vector3();
    const m4 = new THREE.Matrix4();
    penEnds.forEach(([A, B], k) => {
      d.set(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
      const len = d.length();
      q.setFromUnitVectors(Y, d.normalize());
      m4.compose(new THREE.Vector3((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2), q, new THREE.Vector3(1, len, 1));
      mesh.setMatrixAt(k, m4);
    });
    mesh.computeBoundingSphere();
    mesh.name = 'itaipu-dam-penstocks';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    penstockMesh = mesh;
  }
  figures.penstocks = penEnds.length;
  figures.penstockDiameter = 2 * penR;
  figures.units = ph.units.length;
  {
    const gaps = [];
    for (let k = 0; k + 1 < penEnds.length; k += 1) {
      gaps.push(dist([penEnds[k][1][0], penEnds[k][1][2]], [penEnds[k + 1][1][0], penEnds[k + 1][1][2]]));
    }
    figures.unitSpacing = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  }
  sites.penstocks = penEnds.map(([a, b], k) => ({ a, b, r: penR, index: penIndex[k] }));
  sites.face = {
    crestDown: MAIN.crestDown, bandY: MAIN.bandY, roofY: ph.figures.roofY, n: F.n, a: F.a,
  };

  /* ================================================== gravity parts */
  const gravity = (e, section, name, colour) => {
    const secs = sectionsOf(e.axis);
    const pts = secs.flatMap((s) => [offset(s, section.up), offset(s, section.crestDown)]);
    const base = bottomOf(e, pts.concat(e.footprint || []));
    const toe = section.crestDown + (section.bandY - base) * section.slope;
    const prof = () => [[section.up, base], [section.up, CREST_Y], [section.crestDown, CREST_Y], [section.crestDown, section.bandY], [toe, base]];
    sweep(secs, prof, (k) => shade(colour, 1000 * name.length + k));
    const run = [];
    for (let k = 0; k + 1 < secs.length; k += 1) {
      const a = secs[k];
      const b = secs[k + 1];
      const poly = [offset(a, section.up), offset(b, section.up), offset(b, section.crestDown), offset(a, section.crestDown)];
      flatBlock(poly, base, CREST_Y, `${name} crest`, run, [b.p[0] - a.p[0], b.p[1] - a.p[1]]);
      const A = offset(a, section.crestDown);
      const B = offset(b, section.crestDown);
      const C = offset(b, toe);
      const D = offset(a, toe);
      slopeRoof([A[0], section.bandY, A[1]], [B[0], section.bandY, B[1]], [C[0], base, C[1]], [D[0], base, D[1]], `${name} face`);
      const u0 = offset(a, section.up);
      const u1 = offset(b, section.up);
      face(`${name} upstream face`, 'wall', [[u0[0], 216, u0[1]], [u1[0], 216, u1[1]], [u1[0], CREST_Y, u1[1]], [u0[0], CREST_Y, u0[1]]]);
      face(`${name} crest`, 'roof', poly.map(([x, z]) => [x, CREST_Y, z]));
    }
    closeRun(run);
    parapets(secs, section.up + 0.8, section.crestDown - 0.3);
    drawParapet(secs, section.up + 0.8);
    drawParapet(secs, section.crestDown - 0.3);
    drawRoad(secs, -4, 4, TONE.road);
    return { length: secs[secs.length - 1].t, base, secs };
  };
  const rightLateral = need('right lateral dam');
  const diversion = need('diversion structure');
  const leftLateral = need('left lateral dam');
  const rl = gravity(rightLateral, BUTTRESS, 'right lateral dam', TONE.face);
  const dv = gravity(diversion, GRAVITY, 'diversion', TONE.concrete);
  const ll = gravity(leftLateral, GRAVITY, 'left lateral dam', TONE.concrete);
  figures.rightLateralLength = rl.length;
  figures.rightLateralMaxHeight = CREST_Y - rl.base;
  figures.diversionLength = dv.length;
  figures.diversionMaxHeight = CREST_Y - dv.base;
  figures.leftLateralLength = ll.length;

  /* ================================================== the spillway */
  const sp = need('spillway');
  {
    const chute = sp.sections.find((s) => s.at === 'chute');
    const [c0, c1] = chute.axis;
    /* u across (east), d down the chute from the middle of the gates. */
    const C = frameOf(c0, [c1[1] - c0[1], -(c1[0] - c0[0])]);
    const W = SPILL.width / 2;
    const pierW = (SPILL.width - SPILL.gates * SPILL.gateWidth) / (SPILL.gates + 1);
    const pierU = Array.from({ length: SPILL.gates + 1 }, (_, k) => -W + pierW / 2 + k * (pierW + SPILL.gateWidth));
    /* The floor: the published sill at the gates, then the surface
     * model's profile from where it falls below the sill (it reads
     * 216.9 at the gates, the bridge's smear, section 6's note), eased
     * over the ogee. */
    const dem = chute.floor.filter(([d, y]) => d >= 90);
    const floor = linear([[SPILL.upstream, sp.figures.sillY], [SPILL.gate[1], sp.figures.sillY], [40, 196.6], [60.4, 193.8], ...dem]);
    const knots = [SPILL.gate[1], 40, 60.4, ...dem.map(([d]) => d)];
    const pts = [];
    for (const u of [-W, W]) {
      for (const d of [SPILL.upstream, 200, 483]) {
        pts.push(C.at(u, d));
      }
    }
    const base = bottomOf(sp, pts.concat(sp.footprint));
    const at3 = (u, d, y) => {
      const [x, z] = C.at(u, d);
      return [x, y, z];
    };
    const plan = (u0, u1, d0, d1) => [C.at(u0, d0), C.at(u1, d0), C.at(u1, d1), C.at(u0, d1)];
    /* A box in the chute's frame, drawn: its four sides and its top,
     * which is flat, or a plane given at its two d ends. */
    const block = (mesh, u0, u1, d0, d1, y0, yA, yB, col) => {
      const P = [[u0, d0, yA], [u1, d0, yA], [u1, d1, yB], [u0, d1, yB]];
      const top = P.map(([u, d, y]) => at3(u, d, y));
      const bot = P.map(([u, d]) => at3(u, d, y0));
      mesh.poly(top, col, up);
      const cu = C.at((u0 + u1) / 2, (d0 + d1) / 2);
      for (let i = 0; i < 4; i += 1) {
        const j = (i + 1) % 4;
        const m = [(top[i][0] + top[j][0]) / 2 - cu[0], 0, (top[i][2] + top[j][2]) / 2 - cu[1]];
        mesh.quad(bot[i], bot[j], top[j], top[i], col, m);
      }
      return top;
    };
    const planeTop = (A, B, D) => {
      /* y = a x + b z + c through three points. */
      const ux = B[0] - A[0];
      const uy = B[1] - A[1];
      const uz = B[2] - A[2];
      const vx = D[0] - A[0];
      const vy = D[1] - A[1];
      const vz = D[2] - A[2];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const a = -nx / ny;
      const b = -nz / ny;
      const c = A[1] - a * A[0] - b * A[2];
      return (x, z) => a * x + b * z + c;
    };

    /* The approach under the bridge and the ogee to the gates. */
    block(concrete, -W, W, SPILL.upstream, SPILL.gate[1], base, sp.figures.sillY, sp.figures.sillY, TONE.chute);
    /* The bridge: its deck the road over the gates. */
    const deckRun = [];
    {
      const [d0, d1] = SPILL.deck;
      const top = block(concrete, -W, W, d0, d1, SPILL.deckUnder, CREST_Y, CREST_Y, TONE.deck);
      flatBlock(plan(-W, W, d0, d1), SPILL.deckUnder, CREST_Y, 'spillway bridge', deckRun);
      closeRun(deckRun);
      face('spillway bridge deck', 'roof', top);
      const a = C.at(-W, d0);
      const b = C.at(W, d0);
      face('spillway bridge upstream edge', 'wall', [[a[0], SPILL.deckUnder, a[1]], [b[0], SPILL.deckUnder, b[1]], [b[0], CREST_Y, b[1]], [a[0], CREST_Y, a[1]]]);
      const secs = [{ p: C.at(-W, 0), m: C.n, t: 0 }, { p: C.at(W, 0), m: C.n, t: SPILL.width }];
      parapets(secs, d0 + 0.6, d1 - 0.6);
      drawParapet(secs, d0 + 0.6);
      drawParapet(secs, d1 - 0.6);
      drawRoad(secs, d0 + 1, d1 - 1, TONE.road);
      const m = C.at(0, 0);
      sites.spillwayBridge = {
        x: m[0], z: m[1], y: CREST_Y, dir: C.a,
      };
    }
    /* The piers: under the bridge to 225, then their hoist decks falling
     * down the chute. */
    for (const [k, u] of pierU.entries()) {
      const u0 = u - pierW / 2;
      const u1 = u + pierW / 2;
      const hi = [SPILL.upstream, SPILL.gate[1] + 2];
      block(concrete, u0, u1, hi[0], hi[1], base, CREST_Y, CREST_Y, shade(TONE.concrete, 2000 + k));
      const run = [];
      flatBlock(plan(u0, u1, hi[0], hi[1]), base, CREST_Y, 'spillway pier', run);
      closeRun(run);
      const yLow = SPILL.pierLow;
      block(concrete, u0, u1, hi[1], SPILL.pierEnd, base, yLow, yLow, shade(TONE.concrete, 2100 + k));
      const lowRun = [];
      flatBlock(plan(u0, u1, hi[1], SPILL.pierEnd), base, yLow, 'spillway pier', lowRun, C.n);
      closeRun(lowRun);
      for (const side of [u0, u1]) {
        face('spillway pier side', 'wall', [at3(side, hi[1], 205), at3(side, SPILL.pierEnd, 205), at3(side, SPILL.pierEnd, yLow), at3(side, hi[1], yLow)]);
      }
    }
    figures.spillwayPiers = pierU.length;
    /* The gates, radial in the photographs, drawn as their skin plates
     * held part open. */
    const gateBottom = sp.figures.sillY + SPILL.gateOpen;
    const gateTop = sp.figures.sillY + sp.figures.gateHeight;
    for (let g = 0; g < SPILL.gates; g += 1) {
      const u0 = pierU[g] + pierW / 2;
      const u1 = pierU[g + 1] - pierW / 2;
      block(metal, u0, u1, SPILL.gate[0], SPILL.gate[1], gateBottom, gateTop, gateTop, TONE.gate);
      prismBoxes(plan(u0, u1, SPILL.gate[0], SPILL.gate[1]), gateBottom, () => gateTop);
      face('spillway gate', 'wall', [at3(u0, SPILL.gate[1], gateBottom), at3(u1, SPILL.gate[1], gateBottom), at3(u1, SPILL.gate[1], gateTop), at3(u0, SPILL.gate[1], gateTop)]);
    }
    figures.spillwayGates = SPILL.gates;
    figures.spillwayGateWidth = pierU[1] - pierU[0] - pierW;
    figures.spillwayGateHeight = gateTop - sp.figures.sillY;
    figures.spillwaySill = sp.figures.sillY;
    figures.spillwayWidth = 2 * W;

    /* The chutes: the floor between the walls, per bay, as ground; each
     * bay's end the flip into the plunge pool. */
    const walls = [0, ...SPILL.dividers, SPILL.gates];
    const wallU = (k) => {
      const u = pierU[walls[k]];
      const half = k === 0 || k === walls.length - 1 ? pierW / 2 : SPILL.dividerWidth / 2;
      return [u - half, u + half];
    };
    let longest = 0;
    for (let b = 0; b < SPILL.bayEnds.length; b += 1) {
      const u0 = wallU(b)[1];
      const u1 = wallU(b + 1)[0];
      const end = SPILL.bayEnds[b];
      longest = Math.max(longest, end);
      const ds = [...knots.filter((d) => d < end), end];
      for (let i = 0; i + 1 < ds.length; i += 1) {
        const d0 = ds[i];
        const d1 = ds[i + 1];
        const top = [at3(u0, d0, floor(d0)), at3(u1, d0, floor(d0)), at3(u1, d1, floor(d1)), at3(u0, d1, floor(d1))];
        concrete.poly(top, shade(TONE.chute, 3000 + 40 * b + i, 0.05), up);
        const rec = slopeRoof(top[0], top[1], top[2], top[3], 'spillway chute');
        rec.chute = b;
        face('spillway chute floor', 'roof', top);
      }
      /* The end face, and the columns behind it a craft coming up the
       * river meets. */
      const yEnd = floor(end);
      const e0 = at3(u0, end, base);
      const e1 = at3(u1, end, base);
      const m = [C.n[0], 0, C.n[1]];
      concrete.quad(e0, e1, at3(u1, end, yEnd), at3(u0, end, yEnd), TONE.chute, m);
      const lip = [at3(u0, end - 2, floor(end - 2)), at3(u1, end - 2, floor(end - 2)), at3(u1, end, yEnd)];
      prismBoxes(plan(u0, u1, end - 2, end), base, planeTop(...lip));
      face('spillway chute end', 'wall', [at3(u0, end, Math.max(base, 104)), at3(u1, end, Math.max(base, 104)), at3(u1, end, yEnd), at3(u0, end, yEnd)]);
      if (b === 0) {
        const s = C.at((u0 + u1) / 2, 150);
        sites.chute = {
          x: s[0], z: s[1], y: floor(150), dir: C.n, bay: b, slope: (floor(140) - floor(160)) / 20,
        };
      }
    }
    figures.spillwayLength = longest;
    /* The training walls: the outer ones and the two dividers, 8 m over
     * the floor they stand beside, each to the longer bay's end. Their
     * tops fall with the floor along a line turned 20 degrees off the
     * world's z, so a column across a whole wall's thickness would have
     * its top held under the wall's by the fall across that thickness,
     * most of a metre where the chute is steepest: each wall is two skins
     * a WALL_SKIN thick along its faces, and a cap across its end. */
    for (let k = 0; k < walls.length; k += 1) {
      const [u0, u1] = wallU(k);
      const ends = [k > 0 ? SPILL.bayEnds[k - 1] : 0, k < SPILL.bayEnds.length ? SPILL.bayEnds[k] : 0];
      const end = Math.max(...ends);
      const ds = [SPILL.pierEnd, ...knots.filter((d) => d > SPILL.pierEnd && d < end), end];
      for (let i = 0; i + 1 < ds.length; i += 1) {
        const d0 = ds[i];
        const d1 = ds[i + 1];
        const yA = floor(d0) + SPILL.wallHeight;
        const yB = floor(d1) + SPILL.wallHeight;
        const top = block(concrete, u0, u1, d0, d1, base, yA, yB, shade(TONE.concrete, 4000 + 50 * k + i, 0.05));
        slopeRoof(top[0], top[1], top[2], top[3], 'spillway wall');
        const topAt = planeTop(top[0], top[1], top[3]);
        prismBoxes(plan(u0, u0 + WALL_SKIN, d0, d1), base, topAt, C.n);
        prismBoxes(plan(u1 - WALL_SKIN, u1, d0, d1), base, topAt, C.n);
        if (i + 2 === ds.length) {
          prismBoxes(plan(u0, u1, d1 - WALL_SKIN, d1), base, topAt, C.a);
        }
        for (const side of [u0, u1]) {
          face('spillway training wall', 'wall', [at3(side, d0, floor(d0) + 1), at3(side, d1, floor(d1) + 1), at3(side, d1, yB), at3(side, d0, yA)]);
        }
      }
    }
    figures.spillwayChutes = SPILL.bayEnds.length;
    figures.spillwayMaxHeight = CREST_Y - base;
  }

  /* ================================================== embankment crests */
  for (const name of ['rockfill dam', 'left bank earth dam', 'right bank earth dam']) {
    const e = need(name);
    const secs = sectionsOf(e.axis);
    const run = [];
    for (let k = 0; k + 1 < secs.length; k += 1) {
      const a = secs[k];
      const b = secs[k + 1];
      const poly = [offset(a, -EMBANKMENT_HALF), offset(b, -EMBANKMENT_HALF), offset(b, EMBANKMENT_HALF), offset(a, EMBANKMENT_HALF)];
      run.push({ rec: addRoof([poly.map(([x, z]) => [x, CREST_Y, z])], `${name} crest`, 'asphalt'), ids: [] });
      /* The crest's edges down the fill, so the 10 m terrain's rounded
       * ridge never shows over the road's flat edge. */
      for (const side of [-1, 1]) {
        const e0 = offset(a, side * EMBANKMENT_HALF);
        const e1 = offset(b, side * EMBANKMENT_HALF);
        const f0 = offset(a, side * (EMBANKMENT_HALF + 5.6));
        const f1 = offset(b, side * (EMBANKMENT_HALF + 5.6));
        concrete.quad([e0[0], CREST_Y, e0[1]], [e1[0], CREST_Y, e1[1]], [f1[0], CREST_Y - 4, f1[1]], [f0[0], CREST_Y - 4, f0[1]], TONE.rock, up);
      }
    }
    closeRun(run);
    drawRoad(secs, -EMBANKMENT_HALF, -4, TONE.shoulder);
    drawRoad(secs, -4, 4, TONE.asphalt);
    drawRoad(secs, 4, EMBANKMENT_HALF, TONE.shoulder);
    figures[`${name} crest`] = secs[secs.length - 1].t;
    if (name === 'rockfill dam') {
      /* The straight run of the crest road, clear of the curve. */
      const k = secs.findIndex((s) => s.t > 1250);
      const a = secs[k];
      const b = secs[k + 1];
      const d = [b.p[0] - a.p[0], b.p[1] - a.p[1]];
      const l = Math.hypot(d[0], d[1]);
      sites.rockfillCrest = {
        x: a.p[0], z: a.p[1], y: CREST_Y, dir: [d[0] / l, d[1] / l],
      };
    }
  }

  /* ================================================== the meshes */
  const kit = ctx.mats.surfaces;
  const group = new THREE.Group();
  group.name = 'itaipu-dam';
  const concreteMat = concreteMaterial(THREE, kit.concrete, 'concrete');
  /* The crest roads are concrete (crest-road photo), the embankments'
   * asphalt: one photograph, the asphalt a darker tone of it. */
  const roadMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, map: kit.concrete.col, normalMap: kit.concrete.nrm, roughnessMap: kit.concrete.arm, roughness: 1,
  });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.6, metalness: 0.35 });
  const meshes = [[concrete, concreteMat, 'concrete'], [road, roadMat, 'roads'], [metal, metalMat, 'steel']];
  let triangles = 0;
  for (const [m, mat, name] of meshes) {
    if (!m.triangles) {
      continue;
    }
    const mesh = new THREE.Mesh(m.geometry(THREE), mat);
    mesh.name = `itaipu-dam-${name}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    triangles += m.triangles;
  }
  group.add(penstockMesh);
  triangles += penEnds.length * 28 * 2;
  ctx.progress(1);

  const counts = () => ({
    solids: solids.length,
    boxes: boxes.length,
    capsules: capsules.length,
    roofs: records.length,
    meshes: group.children.length,
    triangles,
    mainTriangles,
  });
  return {
    group,
    update() {},
    dispose() {},
    stats: counts,
    /* What scripts/dam-check.js measures: the drawn faces the collision
     * must hold, the figures as built, where to fly, and the part's own
     * collider indices. */
    survey: () => ({
      ...counts(),
      faces,
      figures,
      sites,
      solidIndices: solids.slice(),
      colliders: ctx.colliders,
    }),
  };
}
