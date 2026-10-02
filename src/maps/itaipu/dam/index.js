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
 * v3 (the Itaipu loop's round 1): the buttress heads in relief down the
 * main dam's and the right wing's downstream faces, capsules, with their
 * recesses in shade; the penstocks' stiffener rings and roof flanges; the
 * spillway's piers with noses and sloped tops, and its gates radial, with
 * arms, trunnions and hoist cylinders, one instanced draw for fourteen;
 * the intake cranes' rails along the deck.
 *
 * v4 (round 2): the powerhouse's roof and the crest from the photographs.
 * The central building moved to units 8 and 9 and drawn storey by storey;
 * the road along the penstocks' feet, a transformer bank under each roof
 * gantry, the hall roof's ribs, hatches and vents, a tailrace crane at
 * each end and the outlet of the jet under the building. On the crest the
 * intake columns one per unit in the deck's middle, with collars and a
 * capital; the two intake gantries violet, clad and hung with their hoist,
 * moved to the column row's ends, each with its jib crane; the deck's
 * concrete and its slot covers.
 *
 * AND ON THEM (v2): the penstocks' exit hoods, the intake columns and two
 * intake gate cranes on the crest, street lamps and painted lines on every
 * crest road, the coping on the parapets, transmission gantries, the
 * central building and the tailrace crane on the powerhouse roof, the
 * spillway bridge's hoist house, and the concrete aged by its shader.
 * Where a footprint was flattened under a part's published foundation
 * (the spillway, the right wing) the part stands on basalt drawn down to
 * the flattened ground, and its concrete is its published height.
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

import { recordAt, SLAB_T } from '../../alps/roofs.js';

/* Section 6: the crest of every concrete part and its gantry rails. */
const CREST_Y = 225;
/* A solid's top under the roof over it (roofs.js SKIN). */
const SKIN = 0.02;
/* The most a turned face's stair of columns steps out, metres. */
const STAIR = 0.25;
const COLUMN_MIN = 0.5;
const COLUMN_MAX = 4;
/* The most a column's box may reach past its plan at an end, metres:
 * under the half metre dam-check holds a drawn face to. */
const END_STEP = 0.45;
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
/* The embankments' crest (dam.json sections: crestWidth 14), and its
 * edges' rock down the fill: how far out past the crest, and down. */
const EMBANKMENT_HALF = 7;
const EMBANKMENT_EDGE = { out: 5.6, down: 4 };
const EMBANKMENTS = ['rockfill dam', 'left bank earth dam', 'right bank earth dam'];
/* A training wall's collision skin along each face, metres. */
const WALL_SKIN = 0.5;
/* How far before its end an outer training wall's rim (junctionRims)
 * falls to the lip of the bay beside it: one cell of the hero ground. */
const END_RAMP = 10;
/* A training wall's coping, m: out past each face, over the top, and its
 * edge's depth under the top. */
const COPING = { lip: 0.2, rise: 0.25, drop: 0.35 };
/* An embankment edge's toe (below): its pieces along the lip, m; how far
 * under the lip the ground must be for one, and its foot under the
 * ground; its run across per metre down (a riprap face's 1.5), and the
 * farthest it runs. */
const TOE_STEP = 2;
const TOE_GAP = 0.25;
const TOE_RUN = 1.5;
const TOE_REACH = 80;
/* How far past a crest's edge the reservoir is looked for, m. */
const WET_PROBE = 20;

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
  /* The gates' skin plates, on the upstream face between the piers'
   * noses (the war session's reading of spill-gates: the frames are on the
   * upstream face), under the bridge's deck. */
  gate: [-6.5, -5],
  /* Where the sill's flat ends and the ogee falls away. */
  ogee: 12,
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
  crest: [1.2, 1.1, 0.94],
  face: [1.35, 1.3, 1.22],
  chute: [1.0, 0.94, 0.86],
  deck: [1.55, 1.5, 1.42],
  road: [1.1, 1.02, 0.88],
  asphalt: [0.55, 0.55, 0.56],
  shoulder: [0.7, 0.6, 0.5],
  /* The rockfill's dumped basalt, dark red brown (rockfill-road photo). */
  rock: [0.22, 0.16, 0.14],
  /* The radial gates' skin plates, rust red, and their arms and hoist
   * cylinders, orange (spill-gates photo). */
  gate: [0.2, 0.045, 0.025],
  arm: [0.4, 0.13, 0.05],
  /* White paint. The sun and the ground's bounce (BOUNCE) take a tone
   * much over this to clipped white: v2's 0.82 drew as a flat white plank
   * with no roundness (round 0's penstocks view); here the tube keeps its
   * shading and its rings, and still reads white. */
  penstock: [0.22, 0.22, 0.215],
  ring: [0.18, 0.18, 0.175],
  /* The basalt the dam stands on, where the footprint's flattened ground
   * leaves its foundation standing clear (spillway, right wing). */
  basalt: [0.52, 0.4, 0.34],
  hood: [1.25, 1.2, 1.12],
  coping: [1.75, 1.72, 1.64],
  roofSheet: [1.5, 1.5, 1.46],
  roofRib: [1.2, 1.2, 1.17],
  yellow: [2.0, 1.25, 0.08],
  white: [2.3, 2.3, 2.2],
  /* The intake gantry cranes' paint: a violet, purple in sun and blue
   * grey in shade (crest-road, dam-downstream); v2's pastel lilac read
   * as a toy and v3's [0.2, 0.18, 0.22] as grey, its green as high as
   * its red where the photographs' is well under both. */
  craneViolet: [0.17, 0.095, 0.22],
  /* Their machinery houses' corrugated cladding, a light blue grey. */
  cladding: [0.2, 0.225, 0.24],
  /* The jib cranes' weathered boarding (crest-road). */
  boards: [0.3, 0.29, 0.27],
  craneOrange: [0.5, 0.2, 0.05],
  craneRust: [0.28, 0.1, 0.05],
  steel: [0.32, 0.33, 0.34],
  glass: [0.05, 0.06, 0.07],
  draft: [0.02, 0.022, 0.02],
  /* The step up transformers' tanks and radiators, dark grey paint. */
  transformer: [0.1, 0.105, 0.11],
  /* The roof road at the penstocks' feet (penstocks photo), and the
   * generator hatches over each unit on the hall's roof. */
  roofRoad: [0.62, 0.56, 0.48],
  hatch: [0.9, 0.9, 0.87],
  /* The central building's painted concrete, a plain colour. */
  render: [0.36, 0.345, 0.32],
};

/* The penstocks' exit hoods on the face (the dam-downstream photograph):
 * a block over each penstock, HOOD.width along the dam, reaching
 * HOOD.reach out from where its flat top meets the face, and from its
 * front a cowl down the penstock HOOD.extend metres further, so only the
 * last short run of each shows white above the powerhouse roof, as in the
 * photographs. The cowl is a capsule of radius HOOD.cowl coaxial with the
 * penstock, drawn as a ten sided prism inside it and closed at its foot by
 * a faceted lip on the capsule's end, so what is drawn is what a craft
 * meets to within 0.4 m. */
const HOOD = {
  width: 16, reach: 13, top: 196, extend: 25, cowl: 7.5, sides: 10,
};
/* Street lamps along the crest roads, metres apart. */
const LAMP = { spacing: 30, height: 10, arm: 2.4, r: 0.12 };
/*
 * The white intake columns (the penstocks' air vents), one over each
 * unit's intake, on the deck just upstream of the road's parapet: the
 * aerial-dam photograph has their row down the crest's middle, in line
 * with the gantries' downstream legs, and crest-road has it beside the
 * parapet. VENT.s metres from the crest road's centre line. They stand
 * half again the lamps' height in dam-downstream and powerhouse (v3's
 * 12 m stood level with them), about ten times their width, with two
 * collars and a capital.
 */
const VENT = { r: 0.7, height: 16, s: -7 };
/*
 * The two intake gantry cranes, one just outside each end of the columns'
 * row (reservoir-dam has all the columns between them, aerial-dam the
 * east one past the last, crest-road the west one before the first), and
 * beside each on its outer side the jib crane with its cab (crest-road's
 * "Bardella" crane). `off` in units' pitches past the end unit, `jib`
 * metres further. The gantry's downstream legs stand clear of the column
 * row's line, `down` from the centre line.
 */
const INTAKE_CRANE = {
  off: 0.5, jib: 24, half: 6.5, down: -8.4, legTop: 22, houseTop: 30,
};
/* Transmission gantries over the powerhouse roof between the penstocks. */
const GANTRY = { s: [5, 19], height: 14, leg: 0.6 };
/*
 * The central building on the powerhouse roof, metres from its upstream
 * wall and over the roof. In front of units 8 and 9 (0 based, from the
 * west): aerial-dam has eight penstocks west of it and the ninth
 * showing over its roof, and powerhouse, looking east, eleven before
 * it hides the rest. About three units long in both, eleven storeys
 * (dam-downstream), its front on the road along the penstocks' feet
 * (penstocks). v3 had it 80 m long between units 13 and 14.
 */
const CENTRE = {
  units: [8, 9], length: 100, s: [30, 56], height: 36, floors: 11, spandrel: 1.4, fin: 5, plant: [16, 10, 4],
};
/* The powerhouse roof across its width, metres from its upstream wall:
 * the road along the penstocks' feet, the tailrace deck's road between
 * the tailrace cranes' legs, and the generator hall's roof with
 * a rib across it every rib[0] metres, rib[1] wide (powerhouse), drawn
 * flat: raised 0.2 m and 0.3 wide every 3.4 m they drew as a moire of
 * arcs and broken dashes past 300 m. An OSM way runs along the
 * powerhouse (the onDam roads, below) when its ends are alongMin metres
 * or more apart within alongTurn radians of the dam's axis and it has
 * points within alongReach metres of the roof. */
const ROOF = {
  road: [20, 28.5], deck: [85.6, 96.4], hall: [30, 82], rib: [6.8, 1.2], alongMin: 60, alongTurn: 0.17, alongReach: 30,
};
/* A step up transformer bank in each gap between the penstocks under
 * its gantry, lying across the roof: a capsule round a tank drawn as
 * an octagon inside it. */
const TRANSFORMER = { s: [8.5, 15.5], r: 2 };
/*
 * The buttress heads down the hollow parts' downstream faces (the
 * dam-downstream, powerlines and aerial-dam photographs): a comb of heads
 * standing proud of the face, their radius, with dark recesses between.
 * On the main dam two between every two units' hoods, RIB.pair either side
 * of the units' middle, against the hoods, with a recess 2 x (6.5 - 3.5)
 * = 6 m wide between them, the way check:dam flies out between two
 * penstocks; on the right wing one a block, 17.2 m apart,
 * recesses 5.2 m. Each is a capsule of that radius with its axis in the
 * face, which the drawn head's facets lie inside: collision is the drawn
 * shape to within 0.3 m (the check's 0.5). The heads weathered darker
 * and browner than the crest, as the photographs' (RIB.tone); RECESS is
 * the face's own tone between them, where little sky reaches.
 */
const RIB = {
  main: 3.5, pair: 6.5, wing: 6, tone: [0.58, 0.54, 0.49],
};
const RECESS = 0.3;
/* Stiffener rings on the penstocks, proud of the tube, metres, and a
 * wider flange where each enters the powerhouse roof: both inside the
 * 0.5 m the collision allows beyond the capsule. A ring has half the
 * tube's sides: its facets' 0.1 m of chord hide in its 0.3 m, and the
 * rings were most of the penstocks' triangles at 24. */
const RING = {
  pitch: 6, width: 0.5, proud: 0.3, flange: 0.45, flangeLength: 2.5, sides: 16,
};
/* The spillway's radial gates (spill-gates photo): the skin an arc of
 * RADIAL.r about its trunnion on the pier's side, the arms' beams
 * RADIAL.beam square, the hoist cylinders' radius, and the skin's ribs. */
const RADIAL = {
  r: 21, beam: 0.9, cylinder: 0.4, ribs: 6,
};
/* The radius of the capsules a radial gate's skin is solid as: 0.35 m
 * proud of its 0.3 m plate each side, inside the half metre dam-check
 * holds a face to. */
const SKIN_R = 0.5;
/* The piers downstream of the bridge fall on a slope to their hoist
 * decks; upstream their noses stand into the reservoir. */
const PIER = { slopeFrom: 7, slopeTo: 29, nose: 1.4 };

/* ------------------------------------------------------------ plan math */

/* How far (x, z) is outside a convex polygon [[x, z]...], either winding,
 * 0 inside. */
function outside(poly, x, z) {
  let area = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const sign = area > 0 ? 1 : -1;
  let d = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > 1e-9) {
      d = Math.max(d, (sign * ((b[0] - a[0]) * (a[1] - z) - (b[1] - a[1]) * (a[0] - x))) / l);
    }
  }
  return d;
}

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

/*
 * The crash physics' slabs under a roof given in world space, in
 * roofs.js roofSlabs' form ({ c, u, n, v, hu, hn, hv }, the top face the
 * plane), held SLAB_SINK under it. roofSlabs takes a face's extents along
 * its record's x, which for the dam's records, put with no turn, is the
 * world's: a face turned off the axes got a box reaching metres past its
 * edges, the spillway bridge's 114 m, a plate in the air over the open
 * bays that wrecked the owner's Timber (2026-10-01). Here each face's slab
 * is the largest rectangle in its plane, with a side along one of its
 * edges, that stays inside it: short of a corner a broken part falls onto
 * the columns under the top, where past an edge it met an invisible wall.
 */
const SLAB_SAMPLES = 33;
function insideSlabs(top) {
  const out = [];
  const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  for (const poly of top) {
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      nx += (a[1] - b[1]) * (a[2] + b[2]);
      ny += (a[2] - b[2]) * (a[0] + b[0]);
      nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    /* Wound either way; on edge it is a wall, and no record's ground. */
    const nl = Math.hypot(nx, ny, nz) * Math.sign(ny);
    if (!(Math.abs(ny) > 1e-9 * Math.abs(nl))) {
      continue;
    }
    const n = [nx / nl, ny / nl, nz / nl];
    let best = null;
    for (let i = 0; i < poly.length; i += 1) {
      const e = poly[(i + 1) % poly.length].map((q, k) => q - poly[i][k]);
      const en = dot(e, n);
      const el = Math.hypot(e[0] - n[0] * en, e[1] - n[1] * en, e[2] - n[2] * en);
      if (!(el > 1e-6)) {
        continue;
      }
      const u = [0, 1, 2].map((k) => (e[k] - n[k] * en) / el);
      const v = [u[1] * n[2] - u[2] * n[1], u[2] * n[0] - u[0] * n[2], u[0] * n[1] - u[1] * n[0]];
      const P = poly.map((p) => [dot(p, u), dot(p, v)]);
      const U0 = Math.min(...P.map((p) => p[0]));
      const U1 = Math.max(...P.map((p) => p[0]));
      /* The face's v range across it at U: low edge convex, high edge
       * concave, so a rectangle over [Ua, Ub] fits between the higher of
       * the two lows and the lower of the two highs. */
      const span = (U) => {
        let lo = Infinity;
        let hi = -Infinity;
        for (let k = 0; k < P.length; k += 1) {
          const [ua, va] = P[k];
          const [ub, vb] = P[(k + 1) % P.length];
          if (ua === ub || U < Math.min(ua, ub) || U > Math.max(ua, ub)) {
            continue;
          }
          const w = va + ((vb - va) * (U - ua)) / (ub - ua);
          lo = Math.min(lo, w);
          hi = Math.max(hi, w);
        }
        return [lo, hi];
      };
      const eps = (U1 - U0) * 1e-6;
      const Us = Array.from({ length: SLAB_SAMPLES }, (_, k) => U0 + eps + ((U1 - U0 - 2 * eps) * k) / (SLAB_SAMPLES - 1));
      const S = Us.map(span);
      for (let a = 0; a < Us.length; a += 1) {
        for (let b = a + 1; b < Us.length; b += 1) {
          const lo = Math.max(S[a][0], S[b][0]);
          const hi = Math.min(S[a][1], S[b][1]);
          const area = (Us[b] - Us[a]) * (hi - lo);
          if (hi > lo && (!best || area > best.area)) {
            best = {
              area, u, v, ua: Us[a], ub: Us[b], lo, hi,
            };
          }
        }
      }
    }
    if (!best) {
      continue;
    }
    const { u, v } = best;
    const um = (best.ua + best.ub) / 2;
    const vm = (best.lo + best.hi) / 2;
    const nm = dot(poly[0], n) - SLAB_T / 2 - SLAB_SINK;
    out.push({
      c: [0, 1, 2].map((k) => u[k] * um + v[k] * vm + n[k] * nm),
      u,
      n,
      v,
      hu: (best.ub - best.ua) / 2,
      hn: SLAB_T / 2,
      hv: (best.hi - best.lo) / 2,
    });
  }
  return out;
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
 * (the powerhouse roof, the chute, the next buttress, all at 0.35 or
 * more) as much again and more, and the photographs are lit by a lower
 * sun than the scene's 65.8 degrees, so their downstream faces carry
 * light this one does not: 1.2 on a vertical face, twice that on one
 * turned down. v1 had 0.55 and its downstream walls read black against
 * the dam-downstream and powerhouse photographs, where the shaded
 * concrete is about half as bright as the sunlit.
 */
const BOUNCE = /* glsl */ `
  reflectedLight.indirectDiffuse += 7.0 * 0.5 * (1.0 - itdN.y) * vec3(1.0, 0.94, 0.86) * BRDF_Lambert(material.diffuseColor);
`;

/*
 * The dam's concrete: swiss2's photographed concrete, tinted per vertex,
 * aged in world space so its 3 m tile never repeats across a kilometre of
 * face (the dam-downstream and spill-gates photographs):
 *   - blotches a few tens of metres across, each pour its own grey;
 *   - the lift joints every 2.4 m and the block joints every 15.4 m (the
 *     main dam's 69 blocks over 1 064 m) as fine dark lines;
 *   - rain run down every steep face in long dark streaks, heaviest
 *     under the crest band where the parapet's drains let it go;
 *   - efflorescence: lime leached white out of the lift joints and run
 *     down a few metres under them, in patches;
 *   - rust run brown from the steelwork on the face;
 *   - the water's marks, green black at the tailwater and a dark band
 *     at the reservoir's line.
 * vS2World is declared by the look's light (look/light.js inject), which
 * every material in the scene goes through.
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
    float y = vS2World.y;
    float far = smoothstep(150.0, 900.0, length(vViewPosition));
    float blot = itdNoise(vS2World.xz / 29.0 + y / 37.0) * 0.6 + itdNoise(vS2World.xz / 7.0 - y / 11.0) * 0.4;
    diffuseColor.rgb *= 0.82 + 0.3 * blot;
    float lift = abs(fract(y / 2.4) - 0.5) * 2.4;
    float block = abs(fract(h / 15.42) - 0.5) * 15.42;
    float joint = max(1.0 - smoothstep(0.03, 0.09, 1.2 - lift), 1.0 - smoothstep(0.03, 0.1, 7.71 - block));
    diffuseColor.rgb *= 1.0 - 0.28 * joint * steep * (1.0 - far);
    float run = itdNoise(vec2(h * 0.45, y * 0.03)) * 0.65 + itdNoise(vec2(h * 1.9 + 17.0, y * 0.07)) * 0.35;
    float underCrest = 0.55 + 0.45 * smoothstep(150.0, 215.0, y);
    diffuseColor.rgb *= 1.0 - 0.45 * smoothstep(0.46, 0.8, run) * steep * underCrest;
    float drip = fract(y / 2.4);
    float patchy = smoothstep(0.62, 0.86, itdNoise(vec2(h * 0.35 + 3.0, floor(y / 2.4) * 0.7)));
    float runs = smoothstep(0.35, 0.8, itdNoise(vec2(h * 2.3 + 9.0, y * 0.05)));
    float efflor = patchy * runs * smoothstep(0.35, 1.0, drip) * steep * (1.0 - 0.7 * far);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.9, 0.84) * (0.55 + 0.45 * blot), 0.45 * efflor);
    float rust = smoothstep(0.78, 0.95, itdNoise(vec2(h * 0.9 + 41.0, y * 0.04))) * steep * smoothstep(140.0, 160.0, y);
    diffuseColor.rgb *= mix(vec3(1.0), vec3(1.05, 0.78, 0.6), rust * 0.5);
    diffuseColor.rgb *= mix(vec3(0.42, 0.46, 0.38), vec3(1.0), smoothstep(103.5, 109.0, y));
    diffuseColor.rgb *= 1.0 - 0.3 * steep * (1.0 - smoothstep(0.0, 2.2, abs(y - 220.0)));
  }
`;

/* The same bounce on the dam's painted steel and its plain paints. */
function bounced(mat, key) {
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nvec3 itdN = inverseTransformDirection(normal, viewMatrix);')
      .replace('#include <aomap_fragment>', `${BOUNCE}\n#include <aomap_fragment>`);
  };
  mat.customProgramCacheKey = () => `itaipu-dam-${key}`;
  return mat;
}

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

/*
 * The chute floor the spillway is built with, for package E's water on
 * it: dam.json's surface model profile from 90 m down the chute, and
 * before that the published sill at the gates eased over the ogee (the
 * surface model reads 216.9 at the gates, the bridge's smear, section
 * 6's note). `spill` is dam.json's spillway entry. Returns the knots
 * [[d, y]...] (d metres down the chute axis from the middle of the gates)
 * and y(d).
 */
export function chuteFloor(spill) {
  const chute = spill.sections.find((s) => s.at === 'chute');
  const dem = chute.floor.filter(([d]) => d >= 90);
  const knots = [[SPILL.upstream, spill.figures.sillY], [SPILL.ogee, spill.figures.sillY], [40, 196.6], [60.4, 193.8], ...dem];
  return { knots, y: linear(knots) };
}

/*
 * The spillway laid out in its chute's frame from dam.json's entry `sp`:
 * C (u across, east; d down the chute from the middle of the gates), the
 * half width W, the piers' width and their centres pierU, and the
 * training walls, the outer two and the dividers, by index k from the
 * west: wallU(k) their faces' u, wallEnd(k) the d they run to (the
 * longer of the bays beside them).
 */
function spillLayout(sp) {
  const chute = sp.sections.find((s) => s.at === 'chute');
  const [c0, c1] = chute.axis;
  const C = frameOf(c0, [c1[1] - c0[1], -(c1[0] - c0[0])]);
  const W = SPILL.width / 2;
  const pierW = (SPILL.width - SPILL.gates * SPILL.gateWidth) / (SPILL.gates + 1);
  const pierU = Array.from({ length: SPILL.gates + 1 }, (_, k) => -W + pierW / 2 + k * (pierW + SPILL.gateWidth));
  const walls = [0, ...SPILL.dividers, SPILL.gates];
  const wallU = (k) => {
    const u = pierU[walls[k]];
    const half = k === 0 || k === walls.length - 1 ? pierW / 2 : SPILL.dividerWidth / 2;
    return [u - half, u + half];
  };
  const wallEnd = (k) => Math.max(k > 0 ? SPILL.bayEnds[k - 1] : 0, k < SPILL.bayEnds.length ? SPILL.bayEnds[k] : 0);
  return {
    C, W, pierW, pierU, walls, wallU, wallEnd,
  };
}

/*
 * THE CONCRETE'S RIMS, for the ground beside it (terrain/conform.js).
 * The ground is a 10 m grid; a part's walls and floors are not on it, so
 * a cell straddling a wall draws a triangle from the hillside outside it
 * to the flattened footprint inside, over the wall's top and into what
 * it holds (the owner, 1 October: the hill's teeth over the chute's west
 * wall). Each rim is the outline of a part's concrete in plan, every
 * corner with the height of the drawn concrete's top there, the height
 * the ground may meet it at, and `floor`, the flattened ground the part
 * was built on less the 2 m bottomOf hides (dam.json groundY, or the
 * least of the spillway's groundProfile). For the parts that stand where
 * the water meets the banks:
 *
 *   spillway    round its outer training walls' outer faces (their tops,
 *               the chute floor's profile 8 m up), across the chute's
 *               end at the bays' lips (the floor's profile), and over the
 *               outer piers (225 under the bridge, down their slope to the
 *               hoist decks); its upstream edge in the reservoir at the
 *               sill between the outer piers. An outer wall's last END_RAMP falls to the lip
 *               beside its end, so the hill round the wall's end is cut
 *               to the lip and does not stand over the bay;
 *   powerhouse  its plan at its roof, 148, over the tailrace.
 *
 * Returns [{ part, ring: [[x, z, y]...], floor }].
 */
export function junctionRims(dam) {
  const part = (name) => {
    const e = dam.find((p) => p.part === name);
    if (!e) {
      throw new Error(`itaipu dam: dam.json has no part "${name}"`);
    }
    return e;
  };
  const sp = part('spillway');
  const {
    C, W, pierW, walls, wallU, wallEnd,
  } = spillLayout(sp);
  const floor = chuteFloor(sp).y;
  const knots = chuteFloor(sp).knots.map(([d]) => d);
  const wallTop = (d) => floor(d) + SPILL.wallHeight;
  /* An outer wall's top from the bridge to its end, as [d, y]: the outer
   * pier's (the bridge, its slope, its hoist deck), then the wall's, and
   * over its last END_RAMP down to the lip of the bay beside its end. */
  const side = (end) => [
    [SPILL.upstream, CREST_Y], [PIER.slopeFrom, CREST_Y], [PIER.slopeTo, SPILL.pierLow], [SPILL.pierEnd - 0.01, SPILL.pierLow],
    ...[SPILL.pierEnd, ...knots.filter((d) => d > SPILL.pierEnd && d < end - END_RAMP), end - END_RAMP].map((d) => [d, wallTop(d)]),
    [end, floor(end)],
  ];
  const last = walls.length - 1;
  const uv = [];
  for (const [d, y] of side(wallEnd(0))) {
    uv.push([-W, d, y]);
  }
  /* Across the ends, west to east, at the chute floor's height: each
   * bay's lip, and back up a divider's face to where the next bay ends
   * short of it. */
  for (let k = 0; k < last; k += 1) {
    const end = wallEnd(k);
    const bay = SPILL.bayEnds[k];
    const [, wallOut] = wallU(k);
    const [nextIn, nextOut] = wallU(k + 1);
    for (const d of [end, ...knots.filter((q) => q < end && q > bay).reverse(), bay]) {
      uv.push([wallOut, d, floor(d)]);
    }
    uv.push([nextIn, bay, floor(bay)]);
    if (k + 1 < last) {
      uv.push([nextOut, bay, floor(bay)]);
    }
  }
  for (const [d, y] of side(wallEnd(last)).reverse()) {
    uv.push([W, d, y]);
  }
  /* The upstream edge: the outer piers at their tops, the sill between. */
  uv.push([W - pierW, SPILL.upstream, CREST_Y], [W - pierW, SPILL.upstream, sp.figures.sillY]);
  uv.push([-W + pierW, SPILL.upstream, sp.figures.sillY], [-W + pierW, SPILL.upstream, CREST_Y]);
  const spillFloor = Math.min(...sp.groundProfile.map(([, y]) => y)) - 2;

  const ph = part('powerhouse');
  const secs = sectionsOf(ph.axis, 34);
  const phRing = [
    ...secs.map((s) => offset(s, -POWERHOUSE.halfWidth)),
    ...secs.slice().reverse().map((s) => offset(s, POWERHOUSE.halfWidth)),
  ].map(([x, z]) => [x, z, ph.figures.roofY]);

  return [
    { part: 'spillway', ring: uv.map(([u, d, y]) => [...C.at(u, d), y]), floor: spillFloor },
    { part: 'powerhouse', ring: phRing, floor: ph.groundY - 2 },
  ];
}

/* The embankments' crest roads with their rock edges in plan, one
 * outline [[x, z]...] each: where the ground is the earth dam's fill
 * under a drawn road, which the cut round the concrete
 * (terrain/conform.js) leaves standing where an embankment meets it. */
export function embankmentCrests(dam) {
  const half = EMBANKMENT_HALF + EMBANKMENT_EDGE.out;
  return EMBANKMENTS.map((name) => {
    const e = dam.find((p) => p.part === name);
    if (!e) {
      throw new Error(`itaipu dam: dam.json has no part "${name}"`);
    }
    const secs = sectionsOf(e.axis);
    return [...secs.map((sec) => offset(sec, -half)), ...secs.slice().reverse().map((sec) => offset(sec, half))];
  });
}

/* The embankments' crests as drawn, for the ground under them
 * (terrain/conform.js fillUnder): each axis as the drawing's section
 * points, the road's height and half width, and its rock edges' reach
 * out and fall. */
export function embankmentSection(dam) {
  return {
    axes: EMBANKMENTS.map((name) => {
      const e = dam.find((p) => p.part === name);
      if (!e) {
        throw new Error(`itaipu dam: dam.json has no part "${name}"`);
      }
      return sectionsOf(e.axis).map((sec) => sec.p);
    }),
    crestY: CREST_Y,
    half: EMBANKMENT_HALF,
    edge: EMBANKMENT_EDGE,
  };
}

/* The bank strips (the embankments' wet edges and toes) as one indexed
 * geometry: each strip a run of columns [crest edge, lip, foot], each
 * vertex's normal the mean of the quads round it, facing up, so the
 * ground's material shades it smooth, as it shades the terrain. */
function bankGeometry(THREE, strips) {
  const pos = [];
  const idx = [];
  for (const st of strips) {
    const base = pos.length / 3;
    for (const col of st) {
      for (const p of col) {
        pos.push(p[0], p[1], p[2]);
      }
    }
    for (let i = 0; i + 1 < st.length; i += 1) {
      for (let r = 0; r < 2; r += 1) {
        const a = base + i * 3 + r;
        const b = base + (i + 1) * 3 + r;
        idx.push(a, b, b + 1, a, b + 1, a + 1);
      }
    }
  }
  /* Each triangle up facing, whichever way its strip runs. */
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
    const ny = (pos[b * 3 + 2] - pos[a * 3 + 2]) * (pos[c * 3] - pos[a * 3]) - (pos[b * 3] - pos[a * 3]) * (pos[c * 3 + 2] - pos[a * 3 + 2]);
    if (ny < 0) {
      idx[t + 1] = c;
      idx[t + 2] = b;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/* A frame round a direction: two unit vectors square to it and each other. */
function basisOf(d) {
  const len = Math.hypot(d[0], d[1], d[2]);
  const w = [d[0] / len, d[1] / len, d[2] / len];
  const ref = Math.abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let u = [w[1] * ref[2] - w[2] * ref[1], w[2] * ref[0] - w[0] * ref[2], w[0] * ref[1] - w[1] * ref[0]];
  const ul = Math.hypot(u[0], u[1], u[2]);
  u = [u[0] / ul, u[1] / ul, u[2] / ul];
  const v = [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]];
  return { w, u, v, len };
}

const push = (out, P, N, col) => {
  out.p.push(P[0], P[1], P[2]);
  out.n.push(N[0], N[1], N[2]);
  out.c.push(col[0], col[1], col[2]);
};

/* A cylinder from A to B of radius r, n sides, smooth, open, into flat
 * arrays of positions, normals and colours. */
function tube(A, B, r, n, col, out) {
  const { w, u, v, len } = basisOf([B[0] - A[0], B[1] - A[1], B[2] - A[2]]);
  for (let i = 0; i < n; i += 1) {
    const pts = [];
    for (const [k, l] of [[i, 0], [i + 1, 0], [i + 1, len], [i, len]]) {
      const a = (k / n) * Math.PI * 2;
      const N = [0, 1, 2].map((q) => u[q] * Math.cos(a) + v[q] * Math.sin(a));
      pts.push([[0, 1, 2].map((q) => A[q] + w[q] * l + N[q] * r), N]);
    }
    for (const q of [pts[0], pts[1], pts[2], pts[0], pts[2], pts[3]]) {
      push(out, q[0], q[1], col);
    }
  }
}

/* The flat ring between radii r0 and r1 about C, square to `d` and facing
 * along it (or against it, `face` -1), its n sides where tube's are. */
function annulus(C, d, r0, r1, n, col, face, out) {
  const { w, u, v } = basisOf(d);
  const N = w.map((q) => q * face);
  const at = (k, r) => {
    const a = (k / n) * Math.PI * 2;
    return [0, 1, 2].map((q) => C[q] + (u[q] * Math.cos(a) + v[q] * Math.sin(a)) * r);
  };
  for (let i = 0; i < n; i += 1) {
    const quad = [at(i, r0), at(i + 1, r0), at(i + 1, r1), at(i, r1)];
    const tris = face > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const j of tris) {
      push(out, quad[j], N, col);
    }
  }
}

/* A proud ring on a tube: its outside from `from` to `to` metres along
 * A to B, at radius r1 over the tube's r0, and its two faces. */
function collar(A, B, from, to, r0, r1, n, col, out) {
  const d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  const P = (m) => [A[0] + (d[0] * m) / len, A[1] + (d[1] * m) / len, A[2] + (d[2] * m) / len];
  tube(P(from), P(to), r1, n, col, out);
  annulus(P(from), d, r0, r1, n, col, -1, out);
  annulus(P(to), d, r0, r1, n, col, 1, out);
}

/* Several three geometries as one, non indexed, position and normal. */
function mergeGeometries(THREE, list) {
  const p = [];
  const n = [];
  for (const g of list) {
    const h = g.index ? g.toNonIndexed() : g;
    p.push(...h.getAttribute('position').array);
    n.push(...h.getAttribute('normal').array);
    h.dispose();
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  return out;
}

/* ------------------------------------------------------------ damage */

/* What a target can be (docs/WARFARE-PLAN.md section 8). */
export const TARGET_STATES = ['ok', 'smoke', 'fire', 'destroyed'];
/* Particles per target in the one shared smoke and fire buffer, and the
 * most a target's puffs spread about each of its centres, metres. */
const PUFFS = 32;
const SPREAD = 60;

/*
 * Smoke and fire over every target, in one Points draw: each target owns
 * PUFFS particles of one buffer from the build on, so setting a state is
 * writing its 32 entries and nothing is made or freed in flight. Each
 * puff rises and spreads on a loop of its own from its seed, in the
 * vertex shader, off the sim's clock (update(step)): smoke drifts with
 * the north east breeze (itaipu.js WIND) and fades, fire is short lived
 * flecks low over the target. Size 0 draws nothing.
 */
function makeDamage(THREE, ids, targets) {
  const n = ids.length * PUFFS;
  const centre = new Float32Array(n * 3);
  const seed = new Float32Array(n * 4);
  const look = new Float32Array(n * 4);
  let h = 20260929;
  const rnd = () => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    return h / 4294967296;
  };
  ids.forEach((id, k) => {
    for (let i = 0; i < PUFFS; i += 1) {
      const j = k * PUFFS + i;
      centre.set(targets[id].at, j * 3);
      seed.set([rnd(), rnd(), rnd(), rnd()], j * 4);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(centre, 3));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 4));
  /* Not Float32BufferAttribute, which copies: set() writes `look`. */
  const lookAttr = new THREE.BufferAttribute(look, 4);
  g.setAttribute('aLook', lookAttr);
  const uniforms = { uTime: { value: 0 }, uScale: { value: 600 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uScale;
      attribute vec4 aSeed;
      attribute vec4 aLook;
      varying float vFire;
      varying float vFade;
      varying float vDark;
      void main() {
        float fire = step(aLook.x, aSeed.w);
        float life = mix(7.0, 1.3, fire);
        float ph = fract(aSeed.x + uTime / life);
        float r = aLook.y;
        vec3 p = position;
        p.x += (aSeed.y - 0.5) * r * (0.5 + ph) + ph * mix(18.0, 1.0, fire) * 0.7;
        p.z += (aSeed.z - 0.5) * r * (0.5 + ph) + ph * mix(18.0, 1.0, fire) * 0.7;
        p.y += ph * mix(42.0, 9.0, fire) + mix(2.0, 0.5, fire);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = mix(7.0 + ph * 26.0, 7.0 * (1.0 - 0.6 * ph), fire) * aLook.z;
        gl_PointSize = size * uScale / max(-mv.z, 1.0);
        vFire = fire;
        vFade = 1.0 - ph;
        vDark = aLook.w;
      }`,
    fragmentShader: /* glsl */ `
      varying float vFire;
      varying float vFade;
      varying float vDark;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float a = 1.0 - smoothstep(0.2, 0.5, length(c));
        vec3 smoke = mix(vec3(0.5, 0.49, 0.47), vec3(0.09, 0.085, 0.08), vDark);
        vec3 col = mix(smoke, vec3(4.0, 1.7, 0.45), vFire);
        float alpha = a * vFade * mix(0.6, 0.95, vFire);
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(col, alpha);
      }`,
  });
  mat.name = 'itaipu-dam-damage';
  const points = new THREE.Points(g, mat);
  points.name = 'itaipu-dam-damage';
  points.frustumCulled = false;
  points.renderOrder = 10;
  points.onBeforeRender = (renderer, scene, camera) => {
    uniforms.uScale.value = renderer.getContext().drawingBufferHeight * camera.projectionMatrix.elements[5] * 0.5;
  };
  /* A state as [fire share, smoke darkness, size]: that share of the
   * puffs are fire, the rest smoke that darkens with the damage; size 0
   * draws nothing. */
  const LOOK = {
    ok: [0, 0, 0],
    smoke: [0, 0.25, 1],
    fire: [0.45, 0.6, 1],
    destroyed: [0.25, 1, 1.4],
  };
  const index = new Map(ids.map((id, k) => [id, k]));
  const pos = g.getAttribute('position');
  return {
    points,
    /* `target` is the entry as the map holds it when the state is set,
     * which a later part may have replaced (the war part's yard): its
     * puffs spread over its `fires` when it has them, else round `at`,
     * each centre's spread at most SPREAD whatever its reach. */
    set(id, state, target) {
      const k = index.get(id);
      const [share, dark, size] = LOOK[state];
      const fires = target.fires && target.fires.length ? target.fires : [target.at];
      const r = Math.min(target.r, SPREAD);
      for (let i = 0; i < PUFFS; i += 1) {
        pos.array.set(fires[i % fires.length], (k * PUFFS + i) * 3);
      }
      pos.addUpdateRange(k * PUFFS * 3, PUFFS * 3);
      pos.needsUpdate = true;
      for (let i = 0; i < PUFFS; i += 1) {
        /* aLook: x the seed at and over which a puff is fire (over 1 for
         * none), y the spread, z the size, w the smoke's darkness. */
        look.set([share > 0 ? 1 - share : 2, r, size, dark], (k * PUFFS + i) * 4);
      }
      lookAttr.addUpdateRange(k * PUFFS * 4, PUFFS * 4);
      lookAttr.needsUpdate = true;
    },
    update(step) {
      uniforms.uTime.value = step / 1000;
    },
  };
}

/* ------------------------------------------------------------ the build */

export async function buildPart(ctx) {
  const started = performance.now();
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
  /* The embankments' toes (below): drawn only, so not among the faces
   * scripts/dam-check.js holds to the solids. */
  const toes = [];
  /* The reservoir's side of the embankments' crests, drawn as the bank. */
  const bankStrips = [];
  const figures = {};
  const sites = {};
  /* The war mode's targets (docs/WARFARE-PLAN.md section 8), by id, and
   * what each one's damage darkens: a colour range of one of the meshes. */
  const targets = {};
  const darken = {};

  const addBox = (x0, y0, z0, x1, y1, z1) => {
    const i = ctx.colliders.addBox('wall', x0, y0, z0, x1, y1, z1);
    solids.push(i);
    boxes.push([x0, y0, z0, x1, y1, z1, i]);
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
   * COLUMN_MAX; with `ends` (true, or 'start' or 'end' along dir alone),
   * for a prism whose end is in the open, a column whose box reaches more
   * than END_STEP past the plan is cut narrower until it does not (a
   * pier's end over the chute stood 0.7 m out). Not for every prism: the
   * dam's runs of blocks end against each other, and cutting all their
   * ends cost 4 952 solids the static set has not got. Returns the
   * collider indices.
   */
  const prismBoxes = (poly, y0, topAt, dir = null, ends = false) => {
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
    const boxOver = (a, c) => {
      const q = clipAxis(poly, k, a, c);
      if (q.length < 3) {
        return null;
      }
      const qx = q.map((p) => p[0]);
      const qz = q.map((p) => p[1]);
      const b = [Math.min(...qx), Math.min(...qz), Math.max(...qx), Math.max(...qz)];
      return { q, b, over: Math.max(...[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]].map(([x, z]) => outside(poly, x, z))) };
    };
    /* Which slices may be cut: all, or those of the half at the end
     * `ends` names, 'start' or 'end' along dir. */
    const along = Math.sign(k === 0 ? ex : ez);
    const cut = (a, c) => ends === true
      || (ends === 'start' && along * ((a + c) / 2 - (lo + hi) / 2) < 0)
      || (ends === 'end' && along * ((a + c) / 2 - (lo + hi) / 2) > 0);
    const slices = [];
    for (let i = 0; i < n; i += 1) {
      const a = lo + i * step;
      const c = lo + (i + 1) * step;
      const first = boxOver(a, c);
      const m = first && cut(a, c) ? Math.ceil(first.over / END_STEP - 1e-9) : 1;
      for (let j = 0; j < Math.max(1, m); j += 1) {
        slices.push(m > 1 ? boxOver(a + ((c - a) * j) / m, a + ((c - a) * (j + 1)) / m) : first);
      }
    }
    for (const slice of slices) {
      if (!slice) {
        continue;
      }
      const { q, b } = slice;
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

  /* A roof record over world faces [[x, y, z]...], each convex, and its
   * slabs inside the faces `slabTop` gives (by default the same). */
  const addRoof = (top, kind, material = 'concrete', slabTop = top) => {
    const rec = recordAt({
      top, dy: 1, hw: 0, hd: 0, open: true, kind,
    }, 'itaipu-dam', 0, 0, 0, 0);
    rec.material = material;
    rec.solids = [];
    rec.eaves = [];
    rec.slabs = insideSlabs(slabTop);
    ctx.roofs.push(rec);
    records.push(rec);
    return rec;
  };
  /* A flat top's record and the columns under it, which it lets a craft
   * standing on it through (roofs.js cover), with its neighbours' along
   * the same run so a craft on a record's edge is not caught on the next. */
  const flatRuns = [];
  const flatBlock = (poly, y0, y, kind, run, dir = null, ends = false) => {
    const rec = addRoof([poly.map(([x, z]) => [x, y, z])], kind);
    const ids = prismBoxes(poly, y0, () => y, dir, ends);
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
  /* A planar top's record: a quad's two triangles, each exactly planar.
   * Its slab is the quad's when the quad is a plane (a triangle's largest
   * rectangle is half of it), else each triangle's. */
  const slopeRoof = (A, B, C, D, kind, material = 'concrete') => {
    const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const m = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const off = ((D[0] - A[0]) * m[0] + (D[1] - A[1]) * m[1] + (D[2] - A[2]) * m[2]) / Math.hypot(m[0], m[1], m[2]);
    const top = [[A, B, C], [A, C, D]];
    return addRoof(top, kind, material, Math.abs(off) < 0.01 ? [[A, B, C, D]] : top);
  };

  const concrete = new Mesher();
  const road = new Mesher();
  const metal = new Mesher();
  const up = [0, 1, 0];
  const face = (name, kind, pts) => faces.push({ name, kind, pts });

  /* Where a part stops: its published foundation, or 2 m under the
   * ground package A flattened its footprint to, whichever is lower, the
   * 2 m hiding the terrain's triangles along the footprint's edge. That
   * ground is dam.json's, not the terrain at the plan's corners, which
   * reach past the footprint onto the tailrace: the spillway's is its
   * groundProfile at `ds`, its points' metres down the chute from the
   * middle of the gates, and every other part's is its groundY. */
  const bottomOf = (e, ds) => {
    const g = e.groundProfile ? Math.min(...ds.map(linear(e.groundProfile))) : e.groundY;
    if (!Number.isFinite(g)) {
      throw new Error(`itaipu dam: ${e.part} has no groundY or groundProfile in dam.json`);
    }
    return Math.min(e.baseY ?? Infinity, g - 2);
  };

  /*
   * A gravity section swept along an axis: [s, y] points from the
   * upstream foot over the crest to the downstream foot, the same count
   * at every section. Draws every face but the underside, and the ends;
   * a face wholly under rockY is the basalt it stands on, and the face
   * from profile point `recess` to the next is the floor of the buttress
   * heads' recesses, in their shade.
   */
  const sweep = (secs, profileAt, col, rockY = -Infinity, recess = -1) => {
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
        const rock = prof[i][1] <= rockY + 1e-6 && prof[i + 1][1] <= rockY + 1e-6;
        const tone = i === recess ? c.map((v) => v * RECESS) : c;
        concrete.quad(a[i], b[i], b[i + 1], a[i + 1], rock ? shade(TONE.basalt, k, 0.12) : tone, out);
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

  /* A crest's parapets: capsules along both edges, CHUNK long at most,
   * the first and last let in by their radius so their caps end where
   * the drawn wall does instead of standing 0.55 m past it. */
  const parapets = (secs, sUp, sDown) => {
    const last = secs.length - 2;
    for (const s of [sUp, sDown]) {
      for (let k = 0; k <= last; k += 1) {
        let [ax, az] = offset(secs[k], s);
        let [bx, bz] = offset(secs[k + 1], s);
        const l = Math.hypot(bx - ax, bz - az);
        const ux = (bx - ax) / l;
        const uz = (bz - az) / l;
        if (k === 0) {
          ax += ux * PARAPET_R;
          az += uz * PARAPET_R;
        }
        if (k === last) {
          bx -= ux * PARAPET_R;
          bz -= uz * PARAPET_R;
        }
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
      const y1 = CREST_Y + 2 * PARAPET_R - 0.12;
      const y2 = CREST_Y + 2 * PARAPET_R;
      const c = shade(TONE.crest, k, 0.05);
      const m = secs[k].m;
      concrete.quad([a0[0], y0, a0[1]], [b0[0], y0, b0[1]], [b0[0], y1, b0[1]], [a0[0], y1, a0[1]], c, [-m[0], 0, -m[1]]);
      concrete.quad([a1[0], y0, a1[1]], [b1[0], y0, b1[1]], [b1[0], y1, b1[1]], [a1[0], y1, a1[1]], c, [m[0], 0, m[1]]);
      /* The coping: a cap 5 cm proud of each face, a shade lighter. */
      const c0 = offset(secs[k], s - t / 2 - 0.05);
      const c1 = offset(secs[k], s + t / 2 + 0.05);
      const d0 = offset(secs[k + 1], s - t / 2 - 0.05);
      const d1 = offset(secs[k + 1], s + t / 2 + 0.05);
      const cc = TONE.coping;
      concrete.quad([c0[0], y1, c0[1]], [d0[0], y1, d0[1]], [d0[0], y2, d0[1]], [c0[0], y2, c0[1]], cc, [-m[0], 0, -m[1]]);
      concrete.quad([c1[0], y1, c1[1]], [d1[0], y1, d1[1]], [d1[0], y2, d1[1]], [c1[0], y2, c1[1]], cc, [m[0], 0, m[1]]);
      concrete.quad([c0[0], y2, c0[1]], [d0[0], y2, d0[1]], [d1[0], y2, d1[1]], [c1[0], y2, c1[1]], cc, up);
      concrete.quad([c0[0], y1, c0[1]], [d0[0], y1, d0[1]], [d1[0], y1, d1[1]], [c1[0], y1, c1[1]], cc, [0, -1, 0]);
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

  /* Painted lines along a crest road: a double yellow on its middle sc
   * and a white line inside each edge, half its width from the middle. */
  const markings = (secs, sc, half) => {
    const line = (s0, s1, col) => {
      for (let k = 0; k + 1 < secs.length; k += 1) {
        const a0 = offset(secs[k], s0);
        const a1 = offset(secs[k], s1);
        const b0 = offset(secs[k + 1], s0);
        const b1 = offset(secs[k + 1], s1);
        const y = CREST_Y + 0.035;
        road.quad([a0[0], y, a0[1]], [b0[0], y, b0[1]], [b1[0], y, b1[1]], [a1[0], y, a1[1]], col, up);
      }
    };
    line(sc - 0.26, sc - 0.14, TONE.yellow);
    line(sc + 0.14, sc + 0.26, TONE.yellow);
    line(sc - half + 0.3, sc - half + 0.45, TONE.white);
    line(sc + half - 0.45, sc + half - 0.3, TONE.white);
  };

  /* Lamps: [x, y, z, yaw] at their foot, the arm reaching toward -s of
   * the section they stand on (over the road), and their colliders. */
  const lamps = [];
  const lampsAlong = (secs, s, y, spacing = LAMP.spacing) => {
    const len = secs[secs.length - 1].t;
    for (let t = spacing / 2; t < len; t += spacing) {
      let k = 0;
      while (k + 2 < secs.length && secs[k + 1].t < t) {
        k += 1;
      }
      const a = secs[k];
      const b = secs[k + 1];
      const f = (t - a.t) / (b.t - a.t);
      const p = [a.p[0] + (b.p[0] - a.p[0]) * f, a.p[1] + (b.p[1] - a.p[1]) * f];
      const m = b.m;
      const foot = [p[0] + m[0] * s, y, p[1] + m[1] * s];
      const top = [foot[0], y + LAMP.height, foot[2]];
      const tip = [foot[0] - m[0] * LAMP.arm, y + LAMP.height, foot[2] - m[1] * LAMP.arm];
      addCapsule('pole', foot, top, LAMP.r);
      addCapsule('pole', top, tip, LAMP.r);
      /* The lamp's arm is its local +x: turn +x onto -m. */
      lamps.push([foot[0], y, foot[2], Math.atan2(m[1], -m[0])]);
    }
  };

  /* A box in a frame (t along, s across, y up), drawn into `mesh`. */
  const frameBox = (mesh, fr, t0, t1, s0, s1, y0, y1, col) => {
    const c = [[t0, s0], [t1, s0], [t1, s1], [t0, s1]].map(([t, s2]) => fr.at(t, s2));
    const top = c.map(([x, z]) => [x, y1, z]);
    const bot = c.map(([x, z]) => [x, y0, z]);
    mesh.poly(top, col, up);
    const mid = fr.at((t0 + t1) / 2, (s0 + s1) / 2);
    for (let i = 0; i < 4; i += 1) {
      const j = (i + 1) % 4;
      mesh.quad(bot[i], bot[j], top[j], top[i], col, [(c[i][0] + c[j][0]) / 2 - mid[0], 0, (c[i][1] + c[j][1]) / 2 - mid[1]]);
    }
    return c;
  };
  /* A rod of square section `half` across from P to Q, world points, drawn
   * only: cables, braces and ropes too thin for a collider to matter. */
  const strut = (mesh, P, Q, half, col) => {
    const { w, u, v } = basisOf([Q[0] - P[0], Q[1] - P[1], Q[2] - P[2]]);
    const at = (E, i) => {
      const a = i === 0 || i === 3 ? -half : half;
      const b = i < 2 ? -half : half;
      return [0, 1, 2].map((q) => E[q] + u[q] * a + v[q] * b);
    };
    for (let i = 0; i < 4; i += 1) {
      const j = (i + 1) % 4;
      const m = [0, 1, 2].map((q) => (at(P, i)[q] + at(P, j)[q]) / 2 - P[q]);
      mesh.quad(at(P, i), at(P, j), at(Q, j), at(Q, i), col, m);
    }
    mesh.poly([0, 1, 2, 3].map((i) => at(Q, i)), col, w);
  };
  /* A portal crane in a frame: four legs, two sills and the machinery
   * house on top, drawn in steel, its legs as boxes and its house as a
   * block with a roof a quad can land on. */
  const crane = (fr, t0, t1, s0, s1, y0, legTop, houseTop, col) => {
    const L = 1.4;
    for (const t of [t0, t1 - L]) {
      for (const s2 of [s0, s1 - L]) {
        const c = frameBox(metal, fr, t, t + L, s2, s2 + L, y0, legTop, col);
        prismBoxes(c, y0, () => legTop + SKIN, fr.a, true);
      }
      frameBox(metal, fr, t, t + L, s0, s1, legTop - 1.6, legTop, col);
    }
    frameBox(metal, fr, t0 - 0.5, t1 + 0.5, s0 - 0.5, s1 + 0.5, legTop, houseTop, col);
    const poly = [fr.at(t0 - 0.5, s0 - 0.5), fr.at(t1 + 0.5, s0 - 0.5), fr.at(t1 + 0.5, s1 + 0.5), fr.at(t0 - 0.5, s1 + 0.5)];
    const run = [];
    flatBlock(poly, legTop, houseTop, 'crane', run, fr.a, true);
    closeRun(run);
  };

  /*
   * A buttress head (RIB) down a face from `top` to `toe`, world points on
   * it, `faceOut` the face's outward normal: the capsule of radius r whose
   * axis runs down the face from `top`, let down until its cap is a metre
   * under the crest, to r short of the toe, so its cap ends there. Drawn
   * as the capsule's outer half, five facets round, its head rounded and
   * its foot tapered to the toe, every facet inside the capsule; its
   * sides, which see little sky, a shade darker.
   */
  const ribs = [];
  const rib = (name, top, toe, faceOut, r, col) => {
    const d = [toe[0] - top[0], toe[1] - top[1], toe[2] - top[2]];
    const len = Math.hypot(d[0], d[1], d[2]);
    const e = d.map((v) => v / len);
    const lift = Math.max(0, (top[1] + r - (CREST_Y - 1)) / -e[1]);
    if (!(len - lift - r > r)) {
      throw new Error(`itaipu dam: a ${name} is too short for its radius`);
    }
    const along = (P, m) => [P[0] + e[0] * m, P[1] + e[1] * m, P[2] + e[2] * m];
    const A = along(top, lift);
    const B = along(toe, -r);
    const k = faceOut[0] * e[0] + faceOut[1] * e[1] + faceOut[2] * e[2];
    let o = [faceOut[0] - e[0] * k, faceOut[1] - e[1] * k, faceOut[2] - e[2] * k];
    const ol = Math.hypot(o[0], o[1], o[2]);
    o = o.map((v) => v / ol);
    const side = [e[1] * o[2] - e[2] * o[1], e[2] * o[0] - e[0] * o[2], e[0] * o[1] - e[1] * o[0]];
    const radial = (phi) => [0, 1, 2].map((q) => Math.cos(phi) * side[q] + Math.sin(phi) * o[q]);
    const at = (C, dir, psi, phi) => {
      const w = radial(phi);
      return [0, 1, 2].map((q) => C[q] + dir[q] * r * Math.sin(psi) + w[q] * r * Math.cos(psi));
    };
    const FACETS = 5;
    const shadeOf = (i) => col.map((v, q) => v * RIB.tone[q] * [0.72, 0.88, 1, 0.88, 0.72][i]);
    const wall = (P, c, outDir) => {
      if (P.length === 4) {
        concrete.quad(P[0], P[1], P[2], P[3], c, outDir);
      } else {
        concrete.tri(P[0], P[1], P[2], c, outDir);
      }
      face(name, 'wall', P);
    };
    for (let i = 0; i < FACETS; i += 1) {
      const p0 = (i * Math.PI) / FACETS;
      const p1 = ((i + 1) * Math.PI) / FACETS;
      wall([at(A, e, 0, p0), at(B, e, 0, p0), at(B, e, 0, p1), at(A, e, 0, p1)], shadeOf(i), radial((p0 + p1) / 2));
      /* The head: rings at 30 and 60 degrees over its end, then its tip. */
      const w = radial((p0 + p1) / 2);
      const back = e.map((v) => -v);
      const psi = [0, Math.PI / 6, Math.PI / 3, Math.PI / 2];
      for (let j = 0; j + 1 < psi.length; j += 1) {
        const q0 = psi[j];
        const q1 = psi[j + 1];
        const m = (q0 + q1) / 2;
        const outDir = [0, 1, 2].map((q) => back[q] * Math.sin(m) + w[q] * Math.cos(m));
        const pts = j + 2 < psi.length
          ? [at(A, back, q0, p0), at(A, back, q0, p1), at(A, back, q1, p1), at(A, back, q1, p0)]
          : [at(A, back, q0, p0), at(A, back, q0, p1), at(A, back, q1, 0)];
        wall(pts, shadeOf(i).map((v) => v * 0.92), outDir);
      }
      /* The foot tapers to a point on the face at the toe, chords of the
       * capsule's end. */
      const m = Math.PI / 4;
      wall([at(B, e, 0, p0), at(B, e, 0, p1), at(B, e, Math.PI / 2, 0)], shadeOf(i).map((v) => v * 0.92), [0, 1, 2].map((q) => e[q] * Math.sin(m) + w[q] * Math.cos(m)));
    }
    const index = addCapsule('wall', A, B, r);
    ribs.push({ a: A, b: B, r, index });
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
    sweep(secs, (sec) => mainProfile(sec.t), (k) => shade(TONE.face, Math.round(secs[k].t / blockLen)), -Infinity, 3);
    for (let k = 0; k + 1 < secs.length; k += 1) {
      const t0 = secs[k].t;
      const t1 = secs[k + 1].t;
      /* The crest and the column under it, the upstream face with it. */
      const poly = [F.at(t0, sUp(t0)), F.at(t1, sUp(t1)), F.at(t1, MAIN.crestDown), F.at(t0, MAIN.crestDown)];
      /* Its first and last blocks meet the right wing and the diversion
       * at an angle, their ends in the open. */
      flatBlock(poly, mainBase, CREST_Y, 'crest', crestRun, F.a, (k === 0 && 'start') || (k + 2 === secs.length && 'end'));
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
    /* The intake cranes' rails along the deck, one under each row of
     * their legs (crest-road photo). */
    for (let k = 0; k + 1 < crestSecs.length; k += 1) {
      const t0 = crestSecs[k].t;
      const t1 = crestSecs[k + 1].t;
      for (const sAt of [(t) => sUp(t) + 1.7, () => INTAKE_CRANE.down - 0.7]) {
        const P = (t, ds) => {
          const [x, z] = F.at(t, sAt(t) + ds);
          return [x, CREST_Y + 0.03, z];
        };
        road.quad(P(t0, -0.15), P(t1, -0.15), P(t1, 0.15), P(t0, 0.15), TONE.steel, up);
      }
      /* The intake deck upstream of the road's parapet, the road's own
       * weathered concrete (crest-road), not the dam's pale top. */
      const D = (t, s2) => {
        const [x, z] = F.at(t, s2);
        return [x, CREST_Y + 0.015, z];
      };
      road.quad(D(t0, sUp(t0) + 0.3), D(t1, sUp(t1) + 0.3), D(t1, -5.6), D(t0, -5.6), shade(TONE.road, k, 0.04), up);
    }
  }
  closeRun(crestRun);
  {
    const whole = [{ p: F.at(tStart, 0), m: F.n, t: 0 }, { p: F.at(tEnd, 0), m: F.n, t: tEnd - tStart }];
    markings(whole, (MAIN.crestDown - 0.6 - 5) / 2, (MAIN.crestDown - 0.6 + 5) / 2);
    lampsAlong(whole, MAIN.crestDown - 0.3, CREST_Y + 2 * PARAPET_R);
  }
  /* The buttress heads, a pair between every two units and on at the
   * same pitch to the dam's ends. */
  {
    const unitT = ph.units.map((u) => F.local(...u)[0]);
    const pitch = ph.figures.unitSpacing;
    const at = [];
    for (let k = 0; k + 1 < unitT.length; k += 1) {
      at.push((unitT[k] + unitT[k + 1]) / 2);
    }
    for (let t = unitT[0] - pitch / 2; t > tStart + RIB.pair + RIB.main + 2; t -= pitch) {
      at.push(t);
    }
    for (let t = unitT[unitT.length - 1] + pitch / 2; t < tEnd - RIB.pair - RIB.main - 2; t += pitch) {
      at.push(t);
    }
    for (const t of at.flatMap((m) => [m - RIB.pair, m + RIB.pair])) {
      const [st, yt] = toeOf(t);
      const ds = st - MAIN.crestDown;
      const dy = yt - MAIN.bandY;
      const l = Math.hypot(ds, dy);
      const top = F.at(t, MAIN.crestDown);
      const toe = F.at(t, st);
      rib('main dam buttress', [top[0], MAIN.bandY, top[1]], [toe[0], yt, toe[1]], [F.n[0] * (-dy / l), ds / l, F.n[1] * (-dy / l)], RIB.main, shade(TONE.face, 8000 + Math.round(t)));
    }
  }
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
  /* Drawn at the capsule's radius, with the stiffener rings and the
   * flange at the roof RING.proud and RING.flange over it, once the hoods
   * have said where each leaves the face (drawPenstocks). */
  const penstockTris = { p: [], n: [], c: [] };
  const penRanges = [];
  const drawPenstocks = () => penEnds.forEach(([A, B], k) => {
    const from = penstockTris.c.length;
    const len = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
    tube(A, B, penR, 32, TONE.penstock, penstockTris);
    const sA = F.local(A[0], A[2])[1];
    const sB = F.local(B[0], B[2])[1];
    const out = ((hoodFront[k] - sA) / (sB - sA)) * len;
    const roof = ((ph.figures.roofY - A[1]) / (B[1] - A[1])) * len;
    for (let m = out + 1.5; m + RING.width < roof - RING.flangeLength; m += RING.pitch) {
      collar(A, B, m, m + RING.width, penR, penR + RING.proud, RING.sides, TONE.ring, penstockTris);
    }
    collar(A, B, roof - RING.flangeLength, roof + 0.5, penR, penR + RING.flange, 32, TONE.penstock, penstockTris);
    penRanges.push([from, penstockTris.c.length]);
  });
  /* Each penstock's target: a capsule round its drawn length, from where
   * it leaves its hood to where it enters the powerhouse roof, 8 m about
   * its axis (its 5.25 m and a margin, and 34 - 16 = 18 m clear of the
   * next one's), and `at` a point on its drawn surface, on top of it where
   * it runs at 165 m. Made once the hoods are placed (penstockTargets). */
  const penstockTargets = () => penEnds.forEach(([A, B], k) => {
    const f = (165 - A[1]) / (B[1] - A[1]);
    const P = [A[0] + (B[0] - A[0]) * f, 165, A[2] + (B[2] - A[2]) * f];
    const d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const l = Math.hypot(d[0], d[1], d[2]);
    const w = [d[0] / l, d[1] / l, d[2] / l];
    const u = [-w[0] * w[1], 1 - w[1] * w[1], -w[2] * w[1]];
    const ul = Math.hypot(u[0], u[1], u[2]);
    const sA = F.local(A[0], A[2])[1];
    const sB = F.local(B[0], B[2])[1];
    const along = (f2) => [A[0] + (B[0] - A[0]) * f2, A[1] + (B[1] - A[1]) * f2, A[2] + (B[2] - A[2]) * f2];
    targets[`penstock-${k}`] = {
      shape: 'capsule',
      a: along((hoodFront[k] - sA) / (sB - sA)),
      b: along((ph.figures.roofY - A[1]) / (B[1] - A[1])),
      at: [P[0] + (u[0] / ul) * penR, P[1] + (u[1] / ul) * penR, P[2] + (u[2] / ul) * penR],
      r: 8,
      part: 'penstock',
      colliders: [penIndex[k]],
    };
    darken[`penstock-${k}`] = { mesh: 'penstocks', range: penRanges[k] };
  });

  /* ---- the hoods over the penstocks' exits: a flat topped block on the
   * face, its top high enough that the penstock leaves through its front */
  const hoodRun = [];
  /* Where each penstock leaves its hood, metres downstream of the crest. */
  const hoodFront = [];
  ph.units.forEach(([ux, uz], k) => {
    const [t] = F.local(ux, uz);
    const slope = faceDrop / faceRun(t);
    const faceS = (y) => MAIN.crestDown + (MAIN.bandY - y) / slope;
    const faceY = (s2) => MAIN.bandY - (s2 - MAIN.crestDown) * slope;
    const [A, B] = penEnds[k];
    const [, sA] = F.local(A[0], A[2]);
    const [, sB] = F.local(B[0], B[2]);
    const penY = (s2) => A[1] + ((B[1] - A[1]) * (s2 - sA)) / (sB - sA);
    let top = HOOD.top;
    for (let i = 0; i < 4; i += 1) {
      top = Math.max(HOOD.top, penY(faceS(top) + HOOD.reach) + penR + 1);
    }
    const s1 = faceS(top);
    const s2 = s1 + HOOD.reach;
    const t0 = t - HOOD.width / 2;
    const t1 = t + HOOD.width / 2;
    const col = shade(TONE.hood, 7000 + k, 0.05);
    const P = (tt, ss, y) => {
      const [x, z] = F.at(tt, ss);
      return [x, y, z];
    };
    const foot = faceY(s2);
    concrete.poly([P(t0, s1, top), P(t1, s1, top), P(t1, s2, top), P(t0, s2, top)], col, up);
    concrete.quad(P(t0, s2, foot), P(t1, s2, foot), P(t1, s2, top), P(t0, s2, top), col, [F.n[0], 0, F.n[1]]);
    concrete.tri(P(t0, s1, top), P(t0, s2, top), P(t0, s2, foot), col, [-F.a[0], 0, -F.a[1]]);
    concrete.tri(P(t1, s1, top), P(t1, s2, top), P(t1, s2, foot), col, [F.a[0], 0, F.a[1]]);
    flatBlock([F.at(t0, s1), F.at(t1, s1), F.at(t1, s2), F.at(t0, s2)], mainBase, top, 'hood', hoodRun, F.a);
    face('penstock hood front', 'wall', [P(t0, s2, foot), P(t1, s2, foot), P(t1, s2, top), P(t0, s2, top)]);
    face('penstock hood top', 'roof', [P(t0, s1, top), P(t1, s1, top), P(t1, s2, top), P(t0, s2, top)]);
    /* The cowl, from just inside the block's front down the penstock. */
    const len = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
    const e = [(B[0] - A[0]) / len, (B[1] - A[1]) / len, (B[2] - A[2]) / len];
    const along = (m) => [A[0] + e[0] * m, A[1] + e[1] * m, A[2] + e[2] * m];
    const m0 = ((s2 - sA) / (sB - sA)) * len;
    const R = HOOD.cowl;
    const rIn = penR + 0.05;
    const lip = Math.sqrt(R * R - rIn * rIn);
    const exit = m0 + HOOD.extend;
    const C0 = along(m0 - 2);
    const C1 = along(exit - lip);
    const X = along(exit);
    hoodFront[k] = F.local(X[0], X[2])[1];
    let side = [e[2], 0, -e[0]];
    const sl = Math.hypot(side[0], side[2]);
    side = side.map((v) => v / sl);
    const upv = [side[1] * e[2] - side[2] * e[1], side[2] * e[0] - side[0] * e[2], side[0] * e[1] - side[1] * e[0]];
    const upOut = upv[1] > 0 ? upv : upv.map((v) => -v);
    const radial = (phi) => [0, 1, 2].map((q) => side[q] * Math.cos(phi) + upOut[q] * Math.sin(phi));
    const ring = (C, ax, rr, phi) => {
      const w = radial(phi);
      return [0, 1, 2].map((q) => C[q] + e[q] * ax + w[q] * rr);
    };
    /* A facet wholly under the face is inside the dam, and not drawn. */
    const buried = (pts) => pts.every(([x, y, z]) => y < faceY(F.local(x, z)[1]) - 0.5);
    const cowlCol = col.map((v, q) => v * RIB.tone[q]);
    const rings = [[0, R], [Math.sqrt(R * R - ((R + rIn) / 2) ** 2), (R + rIn) / 2], [lip, rIn]];
    for (let j = 0; j < HOOD.sides; j += 1) {
      const p0 = Math.PI / 2 + ((j - 0.5) * 2 * Math.PI) / HOOD.sides;
      const p1 = p0 + (2 * Math.PI) / HOOD.sides;
      const mid = radial((p0 + p1) / 2);
      const lit = 0.75 + 0.25 * Math.max(0, mid[1]);
      const skin = [ring(C0, 0, R, p0), ring(C1, 0, R, p0), ring(C1, 0, R, p1), ring(C0, 0, R, p1)];
      if (!buried(skin)) {
        concrete.quad(...skin, cowlCol.map((v) => v * lit), mid);
        face('penstock hood cowl', 'wall', skin);
      }
      for (let i = 0; i + 1 < rings.length; i += 1) {
        const [a0, r0] = rings[i];
        const [a1, r1] = rings[i + 1];
        const q = [ring(C1, a0, r0, p0), ring(C1, a1, r1, p0), ring(C1, a1, r1, p1), ring(C1, a0, r0, p1)];
        if (buried(q)) {
          continue;
        }
        const n = [0, 1, 2].map((c) => mid[c] + e[c] * ((a0 + a1) / 2 / R));
        concrete.quad(...q, cowlCol.map((v) => v * lit * 0.9), n);
        face('penstock hood cowl', 'wall', q);
      }
    }
    addCapsule('wall', C0, C1, R);
  });
  closeRun(hoodRun);
  drawPenstocks();
  penstockTargets();
  let penstockMesh;
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(penstockTris.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(penstockTris.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(penstockTris.c, 3));
    g.computeBoundingSphere();
    const mat = bounced(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.55, metalness: 0 }), 'penstock');
    penstockMesh = new THREE.Mesh(g, mat);
    penstockMesh.name = 'itaipu-dam-penstocks';
    penstockMesh.castShadow = true;
    penstockMesh.receiveShadow = true;
  }

  /* ---- the intake columns, one over each unit's intake, a unit's pitch
   * apart from the first unit's */
  const vents = [];
  {
    const t0 = F.local(...ph.units[0])[0];
    const pitch = ph.figures.unitSpacing;
    for (let k = 0; k < ph.units.length; k += 1) {
      const t = t0 + k * pitch;
      const [x, z] = F.at(t, VENT.s);
      /* Its cap ends at the dome's top, not a radius over it. */
      addCapsule('pole', [x, CREST_Y, z], [x, CREST_Y + VENT.height - VENT.r, z], VENT.r);
      /* The steel covers over its stoplog and gate slots in the deck. */
      for (const [a, b] of [[2.2, 3.4], [6, 7.6]]) {
        const C = (tt, ss) => {
          const [cx, cz] = F.at(tt, sUp(t) + ss);
          return [cx, CREST_Y + 0.04, cz];
        };
        road.quad(C(t - 5, a), C(t + 5, a), C(t + 5, b), C(t - 5, b), TONE.steel.map((v) => v * 0.6), up);
      }
      /* An intake: dam.json's point is on the crest road's centre line,
       * the intake itself is its gate in the upstream face, 8.2 m wide and
       * 19.3 m tall on a 177.6 m sill: its target the middle of that gate,
       * on the face; its colliders the face's columns within its reach
       * (intakeColliders); its damage the frame and its column. */
      const intake = need('intakes').figures;
      const mid = intake.sillY + intake.gateHeight / 2;
      const [ix, iz] = F.at(t, sUp(t));
      targets[`intake-${k}`] = {
        at: [ix, mid, iz], r: 12, part: 'intake', colliders: [],
      };
      const from = metal.c.length;
      const hw = intake.gateWidth / 2;
      const P = (tt, y) => {
        const [x, z] = F.at(tt, sUp(tt) - 0.05);
        return [x, y, z];
      };
      const outward = [-F.n[0], 0, -F.n[1]];
      metal.quad(P(t - hw - 0.8, intake.sillY - 0.8), P(t + hw + 0.8, intake.sillY - 0.8), P(t + hw + 0.8, intake.sillY + intake.gateHeight + 0.8), P(t - hw - 0.8, intake.sillY + intake.gateHeight + 0.8), TONE.steel, outward);
      const Q = (tt, y) => {
        const [x, z] = F.at(tt, sUp(tt) - 0.1);
        return [x, y, z];
      };
      metal.quad(Q(t - hw, intake.sillY), Q(t + hw, intake.sillY), Q(t + hw, intake.sillY + intake.gateHeight), Q(t - hw, intake.sillY + intake.gateHeight), TONE.draft, outward);
      darken[`intake-${k}`] = [{ mesh: 'intake-columns', instance: vents.length }, { mesh: 'steel', range: [from, metal.c.length] }];
      vents.push([x, CREST_Y, z]);
    }
  }
  /* ---- the intake gantry cranes and their jib cranes on the upstream
   * deck (INTAKE_CRANE, crest-road photo), in the main dam's frame */
  const P3 = (tt, ss, y) => {
    const [x, z] = F.at(tt, ss);
    return [x, y, z];
  };
  const alongA = [F.a[0], 0, F.a[1]];
  const acrossN = [F.n[0], 0, F.n[1]];
  const neg = (v) => v.map((q) => -q);
  /* A box in the frame's collider: columns under its footprint. The world
   * box round it stood 0.6 m out of a turned cab's sides. */
  const boxOf = (t0, t1, s0, s1, y0, y1) => {
    const c = [[t0, s0], [t1, s0], [t1, s1], [t0, s1]].map(([t, s2]) => F.at(t, s2));
    return prismBoxes(c, y0, () => y1 + SKIN, F.a, true);
  };
  /* A crane's machinery house, drawn: its panels, a band of the frame's
   * paint round its foot and its eaves, the panels' ribs every 0.9 m and
   * a post at each corner, all within 0.35 m of the box. Its collider is
   * the caller's. */
  const cladHouse = (t0, t1, s0, s1, y0, y1, frameCol, panelCol) => {
    frameBox(metal, F, t0, t1, s0, s1, y0, y1, panelCol);
    const rib = panelCol.map((v) => v * 0.7);
    const band = Math.min(0.9, (y1 - y0) / 6);
    const sides = [
      [(u, y, d) => P3(t0 - d, u, y), s0, s1, neg(alongA)],
      [(u, y, d) => P3(t1 + d, u, y), s0, s1, alongA],
      [(u, y, d) => P3(u, s0 - d, y), t0, t1, neg(acrossN)],
      [(u, y, d) => P3(u, s1 + d, y), t0, t1, acrossN],
    ];
    for (const [at, u0, u1, out] of sides) {
      for (const [ya, yb] of [[y0, y0 + band], [y1 - band, y1]]) {
        metal.quad(at(u0, ya, 0.05), at(u1, ya, 0.05), at(u1, yb, 0.05), at(u0, yb, 0.05), frameCol, out);
      }
      for (let u = u0 + 0.6; u < u1 - 0.4; u += 0.9) {
        metal.quad(at(u - 0.08, y0 + band, 0.03), at(u + 0.08, y0 + band, 0.03), at(u + 0.08, y1 - band, 0.03), at(u - 0.08, y1 - band, 0.03), rib, out);
      }
    }
    for (const tc of [t0, t1]) {
      for (const sc of [s0, s1]) {
        frameBox(metal, F, tc - 0.35, tc + 0.35, sc - 0.35, sc + 0.35, y0, y1, frameCol);
      }
    }
  };
  /* An intake gantry crane at t: four legs, the girders round the top of
   * its portal, its clad house, the hoist block hung in the middle on its
   * ropes, and the ropes crossed down each end of the portal. */
  const intakeGantry = (t) => {
    const IC = INTAKE_CRANE;
    const L = 1.4;
    const g = 2.4;
    const t0 = t - IC.half;
    const t1 = t + IC.half;
    const s0 = sUp(t) + 1;
    const s1 = IC.down;
    const sm = (s0 + s1) / 2;
    const yL = CREST_Y + IC.legTop;
    const yH = CREST_Y + IC.houseTop;
    const col = TONE.craneViolet;
    for (const tt of [t0, t1 - L]) {
      for (const ss of [s0, s1 - L]) {
        frameBox(metal, F, tt, tt + L, ss, ss + L, CREST_Y, yL, col);
        boxOf(tt, tt + L, ss, ss + L, CREST_Y, yL);
      }
    }
    for (const tt of [t0, t1 - L]) {
      frameBox(metal, F, tt, tt + L, s0, s1, yL - g, yL, col);
      addCapsule('wall', P3(tt + L / 2, s0 + 1.2, yL - 1.2), P3(tt + L / 2, s1 - 1.2, yL - 1.2), 1.2);
    }
    for (const ss of [s0, s1 - L]) {
      frameBox(metal, F, t0, t1, ss, ss + L, yL - g, yL, col);
      addCapsule('wall', P3(t0 + 1.2, ss + L / 2, yL - 1.2), P3(t1 - 1.2, ss + L / 2, yL - 1.2), 1.2);
    }
    /* The owner's plate on each end girder. */
    for (const [tt, out] of [[t0 - 0.03, neg(alongA)], [t1 + 0.03, alongA]]) {
      metal.quad(P3(tt, sm - 2.5, yL - 2), P3(tt, sm + 2.5, yL - 2), P3(tt, sm + 2.5, yL - 0.7), P3(tt, sm - 2.5, yL - 0.7), TONE.coping, out);
    }
    const ht = [t0 - 0.5, t1 + 0.5];
    const hs = [s0 - 0.5, s1 + 0.5];
    cladHouse(ht[0], ht[1], hs[0], hs[1], yL, yH, col, TONE.cladding);
    const run = [];
    flatBlock([F.at(ht[0], hs[0]), F.at(ht[1], hs[0]), F.at(ht[1], hs[1]), F.at(ht[0], hs[1])], yL, yH, 'crane', run, F.a, true);
    closeRun(run);
    const block = [yL - 12.5, yL - 8];
    frameBox(metal, F, t - 0.45, t + 0.45, sm - 0.9, sm + 0.9, block[0], block[1], TONE.draft);
    for (const ds of [-0.6, 0.6]) {
      strut(metal, P3(t, sm + ds, yL), P3(t, sm + ds, block[1]), 0.05, TONE.steel);
    }
    /* The hook block's own box: a capsule round it stood 1 m under it
     * and 0.6 m off its sides. */
    boxOf(t - 0.45, t + 0.45, sm - 0.9, sm + 0.9, block[0], block[1]);
    for (const tt of [t0 + L / 2, t1 - L / 2]) {
      strut(metal, P3(tt, s0 + L, yL - g), P3(tt, s1 - L - 6, CREST_Y + 0.2), 0.04, TONE.steel);
      strut(metal, P3(tt, s1 - L, yL - g), P3(tt, s0 + L + 6, CREST_Y + 0.2), 0.04, TONE.steel);
    }
  };
  /* A jib crane at t on the deck's upstream edge: a portal of four legs,
   * its clad house with windows along the road, the jib out over the
   * reservoir with its rope, and the operator's cab under the jib's root. */
  const jibCrane = (t) => {
    const col = TONE.craneRust;
    const L = 1.1;
    const s0 = sUp(t) + 1.5;
    const s1 = s0 + 8;
    const t0 = t - 3.5;
    const t1 = t + 3.5;
    const yL = CREST_Y + 5;
    const yH = CREST_Y + 11.5;
    const yB = yH + 1.6;
    for (const tt of [t0, t1 - L]) {
      for (const ss of [s0, s1 - L]) {
        frameBox(metal, F, tt, tt + L, ss, ss + L, CREST_Y, yL, col);
        boxOf(tt, tt + L, ss, ss + L, CREST_Y, yL);
      }
    }
    cladHouse(t0, t1, s0, s1, yL, yH, col, TONE.boards);
    const run = [];
    flatBlock([F.at(t0, s0), F.at(t1, s0), F.at(t1, s1), F.at(t0, s1)], yL, yH, 'crane', run, F.a, true);
    closeRun(run);
    for (const [tt, out] of [[t0 - 0.06, neg(alongA)], [t1 + 0.06, alongA]]) {
      for (let i = 0; i < 3; i += 1) {
        for (let j = 0; j < 2; j += 1) {
          const sa = s0 + 1.6 + i * 1.7;
          const ya = yL + 1.2 + j * 1.6;
          metal.quad(P3(tt, sa, ya), P3(tt, sa + 1.3, ya), P3(tt, sa + 1.3, ya + 1.3), P3(tt, sa, ya + 1.3), TONE.glass, out);
        }
      }
    }
    frameBox(metal, F, t - 0.8, t + 0.8, s0 - 10, s1 + 0.5, yH, yB, col);
    addCapsule('wall', P3(t, s0 - 8.8, yH + 0.8), P3(t, s1 - 0.7, yH + 0.8), 1.2);
    frameBox(metal, F, t - 1.4, t + 1.4, s0 - 2.6, s0, yL + 0.5, yL + 3.3, col);
    metal.quad(P3(t - 1.2, s0 - 2.64, yL + 1.6), P3(t + 1.2, s0 - 2.64, yL + 1.6), P3(t + 1.2, s0 - 2.64, yL + 3), P3(t - 1.2, s0 - 2.64, yL + 3), TONE.glass, neg(acrossN));
    boxOf(t - 1.4, t + 1.4, s0 - 2.6, s0, yL + 0.5, yL + 3.3);
    strut(metal, P3(t, s0 - 9, yH), P3(t, s0 - 9, CREST_Y + 3), 0.03, TONE.steel);
    frameBox(metal, F, t - 0.3, t + 0.3, s0 - 9.3, s0 - 8.7, CREST_Y + 2.4, CREST_Y + 3, TONE.draft);
  };
  {
    const pitch = ph.figures.unitSpacing;
    const unitT = ph.units.map((u) => F.local(...u)[0]);
    sites.intakeGantries = [];
    for (const [t, out] of [[unitT[0] - INTAKE_CRANE.off * pitch, -1], [unitT[unitT.length - 1] + INTAKE_CRANE.off * pitch, 1]]) {
      intakeGantry(t);
      jibCrane(t + out * INTAKE_CRANE.jib);
      /* Where it stands on the crest (the spawns and their check read it):
       * its middle along the road, in world metres, and t in the main
       * dam's frame. */
      const [x, z] = F.at(t, (sUp(t) + 1 + INTAKE_CRANE.down) / 2);
      sites.intakeGantries.push({ t, x, z, jibT: t + out * INTAKE_CRANE.jib });
    }
  }

  /* ---- the powerhouse roof, in the main dam's frame (the powerhouse's
   * axis runs within 0.6 degrees of it): transmission gantries and step
   * up transformers between the penstocks, the road along their feet,
   * the central building, the tailrace cranes, the generator hall's
   * roof with its hatches and vents, and the downstream wall's openings. */
  {
    const roofY = ph.figures.roofY;
    const units = ph.units.map((u) => F.local(...u)[0]);
    const pitch = ph.figures.unitSpacing;
    for (let k = 0; k + 1 < units.length; k += 1) {
      const t = (units[k] + units[k + 1]) / 2;
      const base = sPh(t);
      const [sa, sb] = GANTRY.s;
      const y1 = roofY + GANTRY.height;
      for (const s2 of [sa, sb]) {
        frameBox(metal, F, t - GANTRY.leg, t + GANTRY.leg, base + s2 - GANTRY.leg, base + s2 + GANTRY.leg, roofY, y1, TONE.steel);
        const [x, z] = F.at(t, base + s2);
        addCapsule('pole', [x, roofY, z], [x, y1, z], GANTRY.leg);
      }
      frameBox(metal, F, t - 0.5, t + 0.5, base + sa - 1, base + sb + 1, y1 - 1.2, y1, TONE.steel);
      const [xa, za] = F.at(t, base + sa);
      const [xb, zb] = F.at(t, base + sb);
      addCapsule('pole', [xa, y1 - 0.6, za], [xb, y1 - 0.6, zb], GANTRY.leg);
      /* The insulator strings hanging from the beam. */
      for (const f of [0.25, 0.5, 0.75]) {
        const ss = base + sa + (sb - sa) * f;
        frameBox(metal, F, t - 0.15, t + 0.15, ss - 0.15, ss + 0.15, y1 - 4, y1 - 1.2, TONE.coping);
      }
      /* The transformer bank under it: an octagonal tank lying across
       * the roof inside its capsule, its radiators along both sides and
       * three bushings on top. */
      const r = TRANSFORMER.r;
      const R = r * 1.05;
      const yA = roofY + r;
      const [ta, tb] = TRANSFORMER.s.map((v) => base + v);
      addCapsule('wall', P3(t, ta, yA), P3(t, tb, yA), r);
      const oct = (ss, i) => {
        const phi = ((i + 0.5) * Math.PI) / 4;
        return P3(t + Math.cos(phi) * R, ss, yA + Math.sin(phi) * R);
      };
      const e0 = ta - 0.9;
      const e1 = tb + 0.9;
      for (let i = 0; i < 8; i += 1) {
        const mid = ((i + 1) * Math.PI) / 4;
        metal.quad(oct(e0, i), oct(e1, i), oct(e1, i + 1), oct(e0, i + 1), TONE.transformer, [F.a[0] * Math.cos(mid), Math.sin(mid), F.a[1] * Math.cos(mid)]);
      }
      metal.poly([0, 1, 2, 3, 4, 5, 6, 7].map((i) => oct(e0, i)), TONE.transformer, neg(acrossN));
      metal.poly([0, 1, 2, 3, 4, 5, 6, 7].map((i) => oct(e1, i)), TONE.transformer, acrossN);
      for (const q of [-1, 1]) {
        frameBox(metal, F, t + q * 2 - 0.225, t + q * 2 + 0.225, ta, tb, yA - 0.9, yA + 0.9, TONE.transformer.map((v) => v * 1.5));
      }
      for (const d of [-0.9, 0, 0.9]) {
        strut(metal, P3(t + d, (ta + tb) / 2 + 1.5, yA + R * 0.9), P3(t + d, (ta + tb) / 2 + 1.5, yA + R + 2.6), 0.14, TONE.craneRust);
      }
    }
    /*
     * The roads OpenStreetMap puts on the powerhouse (`onDam`, which the
     * town leaves to the dam, town/roads.js). A way running along the
     * powerhouse is one of its two roads and is drawn as that road over
     * the length its points span: the one along the penstocks' feet
     * (ROOF.road, penstocks photo) or the tailrace deck's between the
     * cranes' legs (ROOF.deck, powerhouse photo), whichever its points
     * lie nearer. Drawn where OSM has them, the feet road would lie 10 m
     * up the dam's face and the deck road on the hall's roof: the ways
     * and the powerhouse's footprint disagree by that much. Any other way
     * with most of its points on the roof is draped on it where OSM has it.
     * What each way became is in survey().sites.onDamRoads.
     */
    const tA = Math.max(phT0, tStart) + 1;
    const tB = phT1 - 1;
    const onRoof = (t, sr) => t >= tA && t <= tB && sr >= 0 && sr <= 2 * POWERHOUSE.halfWidth;
    const spans = { feet: [Infinity, -Infinity], deck: [Infinity, -Infinity] };
    const draped = [];
    sites.onDamRoads = [];
    /* A straight way (its ends within alongTurn of the axis) runs along
     * the powerhouse when it is alongMin long, or continues one that is:
     * OSM splits a road where its tags change. */
    const ways = (ctx.data['osm/roads.json']?.features ?? []).filter((w) => w.onDam).map((f) => {
      const pts = f.points.map(([x, z]) => {
        const [t, s2] = F.local(x, z);
        return [t, s2 - sPh(Math.min(tB, Math.max(tA, t)))];
      });
      const [a, b] = [pts[0], pts[pts.length - 1]];
      const run = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ends = [f.points[0], f.points[f.points.length - 1]].map((q) => q.join());
      return {
        f, pts, run, ends, straight: Math.abs(b[1] - a[1]) < run * Math.sin(ROOF.alongTurn),
      };
    });
    const longEnds = new Set(ways.filter((w) => w.straight && w.run > ROOF.alongMin).flatMap((w) => w.ends));
    for (const { f, pts, run, ends, straight } of ways) {
      const along = straight && (run > ROOF.alongMin || ends.some((e) => longEnds.has(e)));
      const R = ROOF.alongReach;
      const near = pts.filter(([t, sr]) => t >= tA - R && t <= tB + R && sr > -R && sr < 2 * POWERHOUSE.halfWidth + R);
      let as = 'off';
      if (along && near.length >= 2) {
        const meanS = near.reduce((m, q) => m + q[1], 0) / near.length;
        as = Math.abs(meanS - (ROOF.road[0] + ROOF.road[1]) / 2) <= Math.abs(meanS - (ROOF.deck[0] + ROOF.deck[1]) / 2) ? 'feet' : 'deck';
        const ts = pts.map(([t]) => Math.min(tB, Math.max(tA, t)));
        spans[as] = [Math.min(spans[as][0], ...ts), Math.max(spans[as][1], ...ts)];
      } else if (pts.filter(([t, sr]) => onRoof(t, sr)).length * 2 >= pts.length) {
        /* Mostly on the roof: a point just off its edge (a ramp's head)
         * is held on the edge. */
        as = 'draped';
        const W = 2 * POWERHOUSE.halfWidth;
        draped.push({ f, pts: pts.map(([t, sr]) => [Math.min(tB, Math.max(tA, t)), Math.min(W - 0.5, Math.max(0.5, sr))]) });
      }
      sites.onDamRoads.push({ id: f.id, as });
    }
    const strip = (s0, s1, col, lift = 0.02, span = [tA, tB]) => {
      const [ta, tb] = span;
      const n = Math.max(1, Math.ceil((tb - ta) / CHUNK));
      for (let i = 0; i < n; i += 1) {
        const t0 = ta + ((tb - ta) * i) / n;
        const t1 = ta + ((tb - ta) * (i + 1)) / n;
        const P = (tt, ss) => {
          const [x, z] = F.at(tt, sPh(tt) + ss);
          return [x, roofY + lift, z];
        };
        road.quad(P(t0, s0), P(t1, s0), P(t1, s1), P(t0, s1), col, up);
      }
    };
    /* A road across the roof from s0 to s1 over `span`: its white edge
     * lines, and down its middle a dashed white line or a double yellow. */
    const roofRoad = ([s0, s1], span, middle) => {
      if (!(span[1] - span[0] > 1)) {
        return;
      }
      strip(s0, s1, TONE.roofRoad, 0.02, span);
      strip(s0 + 0.3, s0 + 0.45, TONE.white, 0.03, span);
      strip(s1 - 0.45, s1 - 0.3, TONE.white, 0.03, span);
      const sc = (s0 + s1) / 2;
      if (middle === 'yellow') {
        strip(sc - 0.26, sc - 0.14, TONE.yellow, 0.03, span);
        strip(sc + 0.14, sc + 0.26, TONE.yellow, 0.03, span);
        return;
      }
      for (let t = span[0]; t + 3 < span[1]; t += 9) {
        const P = (tt, ss) => {
          const [x, z] = F.at(tt, sPh(tt) + ss);
          return [x, roofY + 0.03, z];
        };
        road.quad(P(t, sc - 0.075), P(t + 3, sc - 0.075), P(t + 3, sc + 0.075), P(t, sc + 0.075), TONE.white, up);
      }
    };
    roofRoad(ROOF.road, spans.feet, 'dashed');
    roofRoad(ROOF.deck, spans.deck, 'yellow');
    for (const { f, pts } of draped) {
      const half = f.width / 2;
      for (let i = 0; i + 1 < pts.length; i += 1) {
        const [t0, q0] = pts[i];
        const [t1, q1] = pts[i + 1];
        const l = Math.hypot(t1 - t0, q1 - q0);
        if (l < 1e-6) {
          continue;
        }
        /* Square to the segment in the frame, and a half width past each
         * end so the joints close. */
        const [nt, ns] = [-((q1 - q0) / l) * half, ((t1 - t0) / l) * half];
        const [et, es] = [((t1 - t0) / l) * half, ((q1 - q0) / l) * half];
        const P = (t, sr) => {
          const [x, z] = F.at(t, sPh(t) + sr);
          return [x, roofY + 0.04, z];
        };
        road.quad(P(t0 - et + nt, q0 - es + ns), P(t1 + et + nt, q1 + es + ns), P(t1 + et - nt, q1 + es - ns), P(t0 - et - nt, q0 - es - ns), TONE.roofRoad, up);
      }
    }
    const r0 = ROOF.road[0];
    for (const t of units) {
      const base = sPh(t);
      const P = (tt, ss, y) => P3(tt, base + ss, y);
      road.quad(P(t - 8, 0.5, roofY + 0.04), P(t + 8, 0.5, roofY + 0.04), P(t + 8, r0 - 0.5, roofY + 0.04), P(t - 8, r0 - 0.5, roofY + 0.04), TONE.coping, up);
      for (let tt = t - 8; tt <= t + 8 + 1e-6; tt += 4) {
        strut(metal, P(tt, r0 - 0.7, roofY), P(tt, r0 - 0.7, roofY + 1.1), 0.05, TONE.yellow);
      }
      strut(metal, P(t - 8, r0 - 0.7, roofY + 1), P(t + 8, r0 - 0.7, roofY + 1), 0.035, TONE.yellow);
    }
    /* The central building (CENTRE): a core behind its floor slabs, the
     * windows in a band under each slab, fins down every face, and the
     * plant room on its roof. */
    {
      const t = (units[CENTRE.units[0]] + units[CENTRE.units[1]]) / 2;
      const h = CENTRE.length / 2;
      const base = sPh(t);
      const top = roofY + CENTRE.height;
      const [s0, s1] = CENTRE.s.map((v) => base + v);
      const in0 = 0.5;
      frameBox(concrete, F, t - h + in0, t + h - in0, s0 + in0, s1 - in0, roofY, top, TONE.concrete);
      const storey = CENTRE.height / CENTRE.floors;
      /* Each storey a light spandrel over a band of glass (dam-downstream:
       * the two about equal, the facade light between dark stripes). The
       * spandrels and fins are plain paint with the bounce (the steel's
       * material): the dam's weathered concrete streaked them as dark as
       * the glass, and the roads' unbounced one drew them black in shade. */
      const slab = TONE.render;
      const glass = TONE.glass.map((v) => v * 1.8);
      for (let k = 0; k < CENTRE.floors; k += 1) {
        const y = roofY + k * storey;
        const y2 = y + storey;
        frameBox(metal, F, t - h, t + h, s0, s1, y2 - CENTRE.spandrel, y2, slab);
        const g0 = y + 0.1;
        const g1 = y2 - CENTRE.spandrel;
        const d = in0 - 0.03;
        const sides = [
          [(u, yy) => P3(t - h + d, u, yy), s0 + in0, s1 - in0, neg(alongA)],
          [(u, yy) => P3(t + h - d, u, yy), s0 + in0, s1 - in0, alongA],
          [(u, yy) => P3(u, s0 + d, yy), t - h + in0, t + h - in0, neg(acrossN)],
          [(u, yy) => P3(u, s1 - d, yy), t - h + in0, t + h - in0, acrossN],
        ];
        for (const [at, u0, u1, out] of sides) {
          metal.quad(at(u0, g0), at(u1, g0), at(u1, g1), at(u0, g1), glass, out);
        }
      }
      const finCol = TONE.render.map((v) => v * 0.9);
      for (let tf = t - h + CENTRE.fin; tf < t + h - 1; tf += CENTRE.fin) {
        for (const [a, b] of [[s0, s0 + in0], [s1 - in0, s1]]) {
          frameBox(metal, F, tf - 0.15, tf + 0.15, a, b, roofY, top, finCol);
        }
      }
      for (let sf = s0 + CENTRE.fin; sf < s1 - 1; sf += CENTRE.fin) {
        for (const [a, b] of [[t - h, t - h + in0], [t + h - in0, t + h]]) {
          frameBox(metal, F, a, b, sf - 0.15, sf + 0.15, roofY, top, finCol);
        }
      }
      const poly = [F.at(t - h, s0), F.at(t + h, s0), F.at(t + h, s1), F.at(t - h, s1)];
      const run = [];
      flatBlock(poly, roofY, top, 'central building', run, F.a);
      closeRun(run);
      const [p0, p1] = [t - CENTRE.plant[0] / 2, t + CENTRE.plant[0] / 2];
      const [q0, q1] = [(s0 + s1 - CENTRE.plant[1]) / 2, (s0 + s1 + CENTRE.plant[1]) / 2];
      const pTop = top + CENTRE.plant[2];
      frameBox(concrete, F, p0, p1, q0, q1, top, pTop, TONE.concrete);
      const plantRun = [];
      flatBlock([F.at(p0, q0), F.at(p1, q0), F.at(p1, q1), F.at(p0, q1)], top, pTop, 'central building', plantRun, F.a);
      closeRun(plantRun);
      /* The steel pergola over the plant room (dam-downstream). */
      for (const tt of [p0 - 3, p1 + 3]) {
        for (const ss of [q0 - 2, q1 + 2]) {
          strut(metal, P3(tt, ss, top), P3(tt, ss, pTop + 1.5), 0.1, TONE.craneOrange);
        }
        strut(metal, P3(tt, q0 - 2, pTop + 1.5), P3(tt, q1 + 2, pTop + 1.5), 0.1, TONE.craneOrange);
      }
      for (let tt = p0 - 3; tt <= p1 + 3 + 1e-6; tt += 2.75) {
        strut(metal, P3(tt, q0 - 2, pTop + 1.6), P3(tt, q1 + 2, pTop + 1.6), 0.06, TONE.craneOrange);
      }
      face('central building front', 'wall', [P3(t - h, s1, roofY), P3(t + h, s1, roofY), P3(t + h, s1, top), P3(t - h, s1, top)]);
      /* The glazed top storey of the downstream wall under its west half
       * (dam-downstream), mullions every 2 m. */
      const w = sPh(t) + 2 * POWERHOUSE.halfWidth + 0.04;
      const wT = [t - h, t];
      metal.quad(P3(wT[0], w, 141), P3(wT[1], w, 141), P3(wT[1], w, 146.5), P3(wT[0], w, 146.5), TONE.glass, acrossN);
      for (let tt = wT[0] + 1; tt < wT[1]; tt += 2) {
        metal.quad(P3(tt - 0.08, w + 0.02, 141), P3(tt + 0.08, w + 0.02, 141), P3(tt + 0.08, w + 0.02, 146.5), P3(tt - 0.08, w + 0.02, 146.5), TONE.steel, acrossN);
      }
    }
    /* The tailrace cranes on the downstream deck, one past each end unit
     * (aerial-dam, dam-downstream-2). */
    for (const t of [units[0] - 0.7 * pitch, units[units.length - 1] + 0.7 * pitch]) {
      const base = sPh(t);
      crane(F, t - 7, t + 7, base + 84, base + 98, roofY, roofY + 20, roofY + 26, TONE.craneRust);
    }
    /* The generator hall's roof: its sheet, a raised rib across it every
     * 3.4 m (powerhouse photo), a raised hatch over each unit and two
     * vents beside it; the tailrace deck's road. */
    const [h0, h1] = ROOF.hall;
    strip(h0, h1, TONE.roofSheet);
    for (let t = tA + ROOF.rib[0] / 2; t + ROOF.rib[1] < tB; t += ROOF.rib[0]) {
      const base = sPh(t);
      const R0 = F.at(t, base + h0);
      const R1 = F.at(t + ROOF.rib[1], base + h0);
      const R2 = F.at(t + ROOF.rib[1], base + h1);
      const R3 = F.at(t, base + h1);
      road.quad([R0[0], roofY + 0.03, R0[1]], [R1[0], roofY + 0.03, R1[1]], [R2[0], roofY + 0.03, R2[1]], [R3[0], roofY + 0.03, R3[1]], TONE.roofRib, up);
    }
    for (const t of units) {
      const base = sPh(t);
      frameBox(road, F, t - 5, t + 5, base + 62, base + 72, roofY, roofY + 0.3, TONE.hatch);
      for (const q of [-1, 1]) {
        frameBox(road, F, t + q * 11 - 0.6, t + q * 11 + 0.6, base + 75.4, base + 76.6, roofY, roofY + 0.4, TONE.steel);
      }
    }
    /* The draft tubes' dark mouths along the downstream wall, and over
     * the one under the central building's west end the outlet the jet
     * in dam-downstream, dam-downstream-2 and aerial-dam leaves (the jet
     * itself is water's, water/). */
    for (const t of units) {
      for (let q = -1; q <= 1; q += 2) {
        const tt = t + q * 8;
        const ss = sPh(tt) + 2 * POWERHOUSE.halfWidth + 0.05;
        const a = F.at(tt - 5, ss);
        const b = F.at(tt + 5, ss);
        metal.quad([a[0], 103.6, a[1]], [b[0], 103.6, b[1]], [b[0], 114, b[1]], [a[0], 114, a[1]], TONE.draft, acrossN);
      }
    }
    {
      const t = units[CENTRE.units[0] - 1];
      const w = sPh(t) + 2 * POWERHOUSE.halfWidth;
      metal.quad(P3(t - 2.5, w + 0.05, 115), P3(t + 2.5, w + 0.05, 115), P3(t + 2.5, w + 0.05, 120), P3(t - 2.5, w + 0.05, 120), TONE.draft, acrossN);
      frameBox(concrete, F, t - 3.3, t + 3.3, w, w + 0.45, 120, 120.8, TONE.concrete);
    }
    sites.gantries = { s: GANTRY.s, height: GANTRY.height };
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
    /* The clear gap between neighbours, surface to surface, the least
     * along their length: the segments' least distance less both radii. */
    const segDist = ([A, B], [C2, D]) => {
      let best = Infinity;
      for (let i = 0; i <= 40; i += 1) {
        const f = i / 40;
        const p = [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f];
        const v = [D[0] - C2[0], D[1] - C2[1], D[2] - C2[2]];
        const l2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
        const g = Math.max(0, Math.min(1, ((p[0] - C2[0]) * v[0] + (p[1] - C2[1]) * v[1] + (p[2] - C2[2]) * v[2]) / l2));
        best = Math.min(best, Math.hypot(p[0] - C2[0] - v[0] * g, p[1] - C2[1] - v[1] * g, p[2] - C2[2] - v[2] * g));
      }
      return best;
    };
    let least = Infinity;
    for (let k = 0; k + 1 < penEnds.length; k += 1) {
      least = Math.min(least, segDist(penEnds[k], penEnds[k + 1]) - 2 * penR);
    }
    figures.penstockGap = least;
  }
  /* `exitY`: the axis's height where it leaves its hood's cowl. */
  sites.penstocks = penEnds.map(([a, b], k) => ({
    a, b, r: penR, index: penIndex[k], exitY: targets[`penstock-${k}`].a[1],
  }));
  sites.face = {
    crestDown: MAIN.crestDown, bandY: MAIN.bandY, roofY: ph.figures.roofY, n: F.n, a: F.a,
  };
  /* The buttress heads, main dam's and the right wing's: capsules. */
  sites.buttresses = ribs;

  /* ================================================== gravity parts */
  /* `openEnd`: the last block's end is in the open, not against the next
   * part's concrete (the left wing's, against the rockfill dam's earth). */
  const gravity = (e, section, name, colour, ribR = 0, openEnd = false) => {
    const secs = sectionsOf(e.axis);
    const base = bottomOf(e);
    const toe = section.crestDown + (section.bandY - base) * section.slope;
    /* Where the ground A flattened the footprint to is lower than the
     * published foundation, what stands under the foundation is drawn as
     * the basalt the dam is founded on, not as more dam. */
    const found = e.baseY != null && e.baseY > base + 0.5 ? e.baseY : base;
    const sF = section.crestDown + (section.bandY - found) * section.slope;
    const prof = found > base
      ? () => [[section.up, base], [section.up, found], [section.up, CREST_Y], [section.crestDown, CREST_Y], [section.crestDown, section.bandY], [sF, found], [toe, base]]
      : () => [[section.up, base], [section.up, CREST_Y], [section.crestDown, CREST_Y], [section.crestDown, section.bandY], [toe, base]];
    sweep(secs, prof, (k) => shade(colour, 1000 * name.length + k), found > base ? found : -Infinity, ribR ? prof().findIndex(([s2, y]) => s2 === section.crestDown && y === section.bandY) : -1);
    /* A buttress head in the middle of every block, RIB. */
    for (let b = 0; ribR && b < e.figures.blocks; b += 1) {
      const t = ((b + 0.5) * secs[secs.length - 1].t) / e.figures.blocks;
      let k = 0;
      while (k + 2 < secs.length && secs[k + 1].t < t) {
        k += 1;
      }
      const p = secs[k].p;
      const q = secs[k + 1].p;
      const l = dist(p, q);
      const f = (t - secs[k].t) / (secs[k + 1].t - secs[k].t);
      const sec = { p: [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f], m: [-(q[1] - p[1]) / l, (q[0] - p[0]) / l] };
      const [tx, tz] = offset(sec, section.crestDown);
      const [bx, bz] = offset(sec, toe);
      const ds = toe - section.crestDown;
      const dy = base - section.bandY;
      const n = Math.hypot(ds, dy);
      rib(`${name} buttress`, [tx, section.bandY, tz], [bx, base, bz], [sec.m[0] * (-dy / n), ds / n, sec.m[1] * (-dy / n)], ribR, shade(colour, 9500 + b));
    }
    const run = [];
    for (let k = 0; k + 1 < secs.length; k += 1) {
      const a = secs[k];
      const b = secs[k + 1];
      const poly = [offset(a, section.up), offset(b, section.up), offset(b, section.crestDown), offset(a, section.crestDown)];
      flatBlock(poly, base, CREST_Y, `${name} crest`, run, [b.p[0] - a.p[0], b.p[1] - a.p[1]], openEnd && k + 2 === secs.length && 'end');
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
    markings(secs, 0, 4);
    lampsAlong(secs, section.crestDown - 0.3, CREST_Y + 2 * PARAPET_R);
    return {
      length: secs[secs.length - 1].t, base, found, secs,
    };
  };
  const rightLateral = need('right lateral dam');
  const diversion = need('diversion structure');
  const leftLateral = need('left lateral dam');
  const rl = gravity(rightLateral, BUTTRESS, 'right lateral dam', TONE.face, RIB.wing);
  const dv = gravity(diversion, GRAVITY, 'diversion', TONE.concrete);
  const ll = gravity(leftLateral, GRAVITY, 'left lateral dam', TONE.concrete, 0, true);
  figures.rightLateralLength = rl.length;
  figures.rightLateralMaxHeight = CREST_Y - rl.found;
  figures.rightLateralBasalt = rl.found - rl.base;
  figures.diversionLength = dv.length;
  figures.diversionMaxHeight = CREST_Y - dv.found;
  figures.leftLateralLength = ll.length;

  /* ================================================== the spillway */
  const sp = need('spillway');
  /* The gates' steel behind their skins, gate 0's, and where each gate's
   * copy of it stands (one instanced draw, made with the meshes). */
  const gear = new Mesher();
  const gearAt = [];
  {
    /* u across (east), d down the chute from the middle of the gates. */
    const {
      C, W, pierW, pierU, walls, wallU, wallEnd,
    } = spillLayout(sp);
    /* The floor: chuteFloor, the published sill eased onto the surface
     * model's profile. */
    const cf = chuteFloor(sp);
    const floor = cf.y;
    const knots = cf.knots.slice(1).map(([d]) => d);
    const base = bottomOf(sp, [SPILL.upstream, 483, ...sp.footprint.map(([x, z]) => C.local(x, z)[1])]);
    const at3 = (u, d, y) => {
      const [x, z] = C.at(u, d);
      return [x, y, z];
    };
    const plan = (u0, u1, d0, d1) => [C.at(u0, d0), C.at(u1, d0), C.at(u1, d1), C.at(u0, d1)];
    /*
     * The spillway's concrete stands on its published foundation, 181.3 m
     * at the gates (225 less its 43.7 m), and the chute's floor slab and
     * walls a few metres into the rock under them. Package A flattened
     * the whole footprint to 108.7 m, the plunge pool's level, so what
     * fills it under the concrete is drawn as the basalt the chute was
     * cut in (the chute-dry photograph's walls), not as more dam.
     */
    const rockAt = (d) => Math.min(sp.baseY, floor(Math.max(d, SPILL.ogee)) - 4);
    /* A box in the chute's frame, drawn: its four sides and its top,
     * which is flat, or a plane given at its two d ends; its sides under
     * the rock line basalt. */
    const block = (mesh, u0, u1, d0, d1, y0, yA, yB, col, rock = true) => {
      const P = [[u0, d0, yA], [u1, d0, yA], [u1, d1, yB], [u0, d1, yB]];
      const top = P.map(([u, d, y]) => at3(u, d, y));
      const bot = P.map(([u, d]) => at3(u, d, y0));
      const cut = P.map(([u, d, y]) => at3(u, d, rock ? Math.min(y, Math.max(y0, rockAt(d))) : y0));
      mesh.poly(top, col, up);
      const cu = C.at((u0 + u1) / 2, (d0 + d1) / 2);
      for (let i = 0; i < 4; i += 1) {
        const j = (i + 1) % 4;
        const m = [(top[i][0] + top[j][0]) / 2 - cu[0], 0, (top[i][2] + top[j][2]) / 2 - cu[1]];
        concrete.quad(bot[i], bot[j], cut[j], cut[i], shade(TONE.basalt, 9000 + i + 7 * d0, 0.12), m);
        mesh.quad(cut[i], cut[j], top[j], top[i], col, m);
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
    block(concrete, -W, W, SPILL.upstream, SPILL.ogee, base, sp.figures.sillY, sp.figures.sillY, TONE.chute);
    /* Its floor is ground, as the chute's is from the ogee down: the
     * bays under the gates and the bridge were drawn with nothing under
     * them but the flattened footprint 90 m down. A record, no solids:
     * the piers stand on it and its upstream face is under the water. */
    addRoof([plan(-W, W, SPILL.upstream, SPILL.ogee).map(([x, z]) => [x, sp.figures.sillY, z])], 'spillway sill');
    /* The bridge: its deck the road over the gates. */
    const deckRun = [];
    {
      const [d0, d1] = SPILL.deck;
      const top = block(concrete, -W, W, d0, d1, SPILL.deckUnder, CREST_Y, CREST_Y, TONE.deck, false);
      flatBlock(plan(-W, W, d0, d1), SPILL.deckUnder, CREST_Y, 'spillway bridge', deckRun, null, true);
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
      markings(secs, (d0 + d1) / 2, (d1 - d0) / 2 - 1);
      lampsAlong(secs, d1 - 0.6, CREST_Y + 2 * PARAPET_R);
      /* The bridge's hoist, a machinery house on the upstream edge
       * (aerial-spill-2 photograph), over no road lane a quad needs. */
      crane(C, 132, 146, d0 - 0.2, d0 + 3.4, CREST_Y, CREST_Y + 3, CREST_Y + 11, TONE.craneOrange);
      const m = C.at(0, 0);
      sites.spillwayBridge = {
        x: m[0], z: m[1], y: CREST_Y, dir: C.a,
      };
    }
    /* The piers: their noses into the reservoir and their tops under the
     * bridge at 225, falling on a slope from PIER.slopeFrom to their hoist
     * decks, flat to their ends (spill-gates photo). The slope's columns
     * are held under it by as much as its fall across a column, 1.5 m, so
     * a capsule along each of its top edges, just inside, takes the rest
     * of its sides. */
    const yLow = SPILL.pierLow;
    const [s0, s1] = [PIER.slopeFrom, PIER.slopeTo];
    const fall = (CREST_Y - yLow) / (s1 - s0);
    const edgeR = 0.5;
    const edgeDrop = edgeR * Math.sqrt(1 + fall * fall);
    const rockNose = Math.max(base, rockAt(SPILL.upstream));
    for (const [k, u] of pierU.entries()) {
      const u0 = u - pierW / 2;
      const u1 = u + pierW / 2;
      const col = shade(TONE.concrete, 2000 + k);
      const nose = [];
      for (let i = 0; i <= 4; i += 1) {
        const a = Math.PI * (1 + i / 4);
        nose.push([u + (pierW / 2) * Math.cos(a), SPILL.upstream + (pierW / 2) * PIER.nose * Math.sin(a)]);
      }
      concrete.poly(nose.map(([nu, nd]) => at3(nu, nd, CREST_Y)), col, up);
      const o = C.at(u, SPILL.upstream);
      for (let i = 0; i + 1 < nose.length; i += 1) {
        const [ua, da] = nose[i];
        const [ub, db] = nose[i + 1];
        const c = C.at((ua + ub) / 2, (da + db) / 2);
        const m = [c[0] - o[0], 0, c[1] - o[1]];
        concrete.quad(at3(ua, da, base), at3(ub, db, base), at3(ub, db, rockNose), at3(ua, da, rockNose), shade(TONE.basalt, 9050 + k, 0.12), m);
        concrete.quad(at3(ua, da, rockNose), at3(ub, db, rockNose), at3(ub, db, CREST_Y), at3(ua, da, CREST_Y), col, m);
        face('spillway pier nose', 'wall', [at3(ua, da, 205), at3(ub, db, 205), at3(ub, db, CREST_Y), at3(ua, da, CREST_Y)]);
      }
      const run = [];
      flatBlock(nose.map(([nu, nd]) => C.at(nu, nd)), base, CREST_Y, 'spillway pier', run, null, true);
      block(concrete, u0, u1, SPILL.upstream, s0, base, CREST_Y, CREST_Y, col);
      flatBlock(plan(u0, u1, SPILL.upstream, s0), base, CREST_Y, 'spillway pier', run);
      closeRun(run);
      const top = block(concrete, u0, u1, s0, s1, base, CREST_Y, yLow, col);
      slopeRoof(top[0], top[1], top[2], top[3], 'spillway pier slope');
      prismBoxes(plan(u0, u1, s0, s1), base, planeTop(top[0], top[1], top[3]));
      for (const side of [u0 + edgeR, u1 - edgeR]) {
        addCapsule('wall', at3(side, s0, CREST_Y - edgeDrop), at3(side, s1, yLow - edgeDrop), edgeR);
      }
      face('spillway pier slope', 'roof', top);
      block(concrete, u0, u1, s1, SPILL.pierEnd, base, yLow, yLow, col);
      const lowRun = [];
      flatBlock(plan(u0, u1, s1, SPILL.pierEnd), base, yLow, 'spillway pier', lowRun, C.n, 'end');
      closeRun(lowRun);
      for (const side of [u0, u1]) {
        face('spillway pier side', 'wall', [at3(side, s0, 205), at3(side, s1, 205), at3(side, s1, yLow), at3(side, s0, CREST_Y)]);
        face('spillway pier side', 'wall', [at3(side, s1, 205), at3(side, SPILL.pierEnd, 205), at3(side, SPILL.pierEnd, yLow), at3(side, s1, yLow)]);
      }
    }
    figures.spillwayPiers = pierU.length;
    /*
     * The gates: radial (tainter) gates held part open, each a skin plate
     * on an arc of RADIAL.r about its trunnions on the piers' sides, the
     * arc's middle where v2's flat plate stood, so each gate's target,
     * colliders and reach are v2's. Behind the skin its ribs and two
     * girders, and on each side two arms back to the trunnion, a brace
     * between them and the hoist cylinder from the pier's slope. The skin
     * is drawn per gate, so a destroyed one chars alone; the steel behind
     * it is the same for all fourteen, one instanced draw (gear).
     */
    const gateBottom = sp.figures.sillY + SPILL.gateOpen;
    const gateTop = sp.figures.sillY + sp.figures.gateHeight;
    const R = RADIAL.r;
    const tY = (gateBottom + gateTop) / 2;
    const tD = SPILL.gate[0] + R;
    const aMax = Math.asin((gateTop - tY) / R);
    const ROWS = 8;
    /* The point at radius rr from the trunnion, al up from its level, at u. */
    const arc = (u, rr, al) => at3(u, tD - rr * Math.cos(al), tY + rr * Math.sin(al));
    const radialOut = (al) => [-C.n[0] * Math.cos(al), Math.sin(al), -C.n[1] * Math.cos(al)];
    const gearFaces = [];
    const across = [C.a[0], 0, C.a[1]];
    /* A beam of square section, `half` across, from P to Q, its sides
     * square to `side` and to itself; its long faces checked as `name`. */
    const beam = (P, Q, half, side, col, name) => {
      const d = [Q[0] - P[0], Q[1] - P[1], Q[2] - P[2]];
      const l = Math.hypot(d[0], d[1], d[2]);
      const w = d.map((v) => v / l);
      const k2 = side[0] * w[0] + side[1] * w[1] + side[2] * w[2];
      let a = [side[0] - w[0] * k2, side[1] - w[1] * k2, side[2] - w[2] * k2];
      const al = Math.hypot(a[0], a[1], a[2]);
      a = a.map((v) => v / al);
      const b = [w[1] * a[2] - w[2] * a[1], w[2] * a[0] - w[0] * a[2], w[0] * a[1] - w[1] * a[0]];
      const corner = (E, i) => {
        const sa = i === 0 || i === 3 ? -half : half;
        const sb = i < 2 ? -half : half;
        return [0, 1, 2].map((q) => E[q] + a[q] * sa + b[q] * sb);
      };
      for (let i = 0; i < 4; i += 1) {
        const j = (i + 1) % 4;
        const pts = [corner(P, i), corner(P, j), corner(Q, j), corner(Q, i)];
        const m = [0, 1, 2].map((q) => (pts[0][q] + pts[1][q]) / 2 - P[q]);
        gear.quad(pts[0], pts[1], pts[2], pts[3], col, m);
        if (name) {
          gearFaces.push([name, pts]);
        }
      }
      gear.poly([0, 1, 2, 3].map((i) => corner(P, i)), col, w.map((v) => -v));
      gear.poly([0, 1, 2, 3].map((i) => corner(Q, i)), col, w);
    };
    const aArm = aMax * 0.6;
    const armIn = R - 1.5;
    const gateR = Math.min(12.5, (SPILL.gateWidth + pierW) / 2);
    for (let g = 0; g < SPILL.gates; g += 1) {
      const u0 = pierU[g] + pierW / 2;
      const u1 = pierU[g + 1] - pierW / 2;
      const from = metal.c.length;
      for (let i = 0; i < ROWS; i += 1) {
        const a0 = -aMax + (2 * aMax * i) / ROWS;
        const a1 = -aMax + (2 * aMax * (i + 1)) / ROWS;
        const skin = [arc(u0, R, a0), arc(u1, R, a0), arc(u1, R, a1), arc(u0, R, a1)];
        metal.quad(...skin, TONE.gate, radialOut((a0 + a1) / 2));
        metal.quad(arc(u0, R - 0.3, a0), arc(u1, R - 0.3, a0), arc(u1, R - 0.3, a1), arc(u0, R - 0.3, a1), TONE.gate, radialOut((a0 + a1) / 2).map((v) => -v));
        face('spillway gate', 'wall', skin);
      }
      for (const [al, dir] of [[aMax, 1], [-aMax, -1]]) {
        const o = [C.n[0] * Math.sin(al) * dir, Math.cos(al) * dir, C.n[1] * Math.sin(al) * dir];
        metal.quad(arc(u0, R, al), arc(u1, R, al), arc(u1, R - 0.3, al), arc(u0, R - 0.3, al), TONE.gate, o);
      }
      /* The skin's solid is a stack of capsules across the bay along its
       * arc: the flat slab of columns it had stood 1.6 m upstream of the
       * drawn skin at its top and foot, where the arc has curved away,
       * and cost more solids. Each capsule's cap ends at the skin's edge,
       * so the opening under the gate stays open. */
      const ids = [];
      const rr = R - 0.15;
      const a0 = -aMax + SKIN_R / rr;
      const a1 = aMax - SKIN_R / rr;
      /* Neighbours 4 % closer than touching, so no seam between them. */
      const rows = Math.ceil((rr * (a1 - a0)) / (1.92 * SKIN_R)) + 1;
      for (let i = 0; i < rows; i += 1) {
        const al = a0 + ((a1 - a0) * i) / (rows - 1);
        ids.push(addCapsule('wall', arc(u0, rr, al), arc(u1, rr, al), SKIN_R));
      }
      /* gate-0 is the westernmost: u runs east. */
      /* On its upstream face; its reach at most half the gates' pitch,
       * so neighbours' spheres never overlap. */
      targets[`gate-${g}`] = {
        at: arc((u0 + u1) / 2, R, 0), r: gateR, part: 'gate', colliders: ids,
      };
      darken[`gate-${g}`] = [{ mesh: 'steel', range: [from, metal.c.length] }, { mesh: 'gate-gear', instance: g }];
      for (const [side, us] of [[u0, u0 + 1], [u1, u1 - 1]]) {
        const T = arc(us, 0, 0);
        const ends = [aArm, -aArm].map((al) => arc(us, armIn, al));
        const brace = [arc(us, armIn * 0.55, aArm), arc(us, armIn * 0.55, -aArm)];
        const pivot = at3(us, 9.5, CREST_Y - 4);
        const rodEnd = arc(us, R - 0.9, aMax * 0.9);
        for (const E of ends) {
          addCapsule('wall', T, E, 0.55);
        }
        addCapsule('wall', brace[0], brace[1], 0.4);
        /* The trunnion's beam is 1.3 m square: a capsule as wide, whose
         * cap past T stood 0.95 m into the bay with nothing drawn there. */
        addCapsule('wall', arc(side, 0, 0), T, 0.65);
        addCapsule('wall', pivot, rodEnd, RADIAL.cylinder + 0.05);
        if (g > 0) {
          continue;
        }
        for (const E of ends) {
          beam(T, E, RADIAL.beam / 2, across, TONE.arm, 'spillway gate arm');
        }
        beam(brace[0], brace[1], 0.3, across, TONE.arm, 'spillway gate arm');
        beam(arc(side, 0, 0), T, 0.65, up, TONE.steel, 'spillway gate trunnion');
        const mid = [0, 1, 2].map((q) => pivot[q] + (rodEnd[q] - pivot[q]) * 0.6);
        beam(pivot, mid, RADIAL.cylinder * 0.9, across, TONE.arm, 'spillway hoist cylinder');
        beam(mid, rodEnd, 0.14, across, TONE.steel, null);
      }
      if (g > 0) {
        continue;
      }
      for (let j = 0; j < RADIAL.ribs; j += 1) {
        const ur = u0 + ((j + 0.5) * (u1 - u0)) / RADIAL.ribs;
        for (let i = 0; i < ROWS; i += 1) {
          const a0 = -aMax + (2 * aMax * i) / ROWS;
          const a1 = -aMax + (2 * aMax * (i + 1)) / ROWS;
          for (const du of [-0.12, 0.12]) {
            gear.quad(arc(ur + du, R - 0.3, a0), arc(ur + du, R - 1.2, a0), arc(ur + du, R - 1.2, a1), arc(ur + du, R - 0.3, a1), TONE.gate, [C.a[0] * du, 0, C.a[1] * du]);
          }
          gear.quad(arc(ur - 0.12, R - 1.2, a0), arc(ur + 0.12, R - 1.2, a0), arc(ur + 0.12, R - 1.2, a1), arc(ur - 0.12, R - 1.2, a1), TONE.gate, radialOut((a0 + a1) / 2).map((v) => -v));
        }
      }
      for (const al of [aArm, -aArm]) {
        beam(arc(u0 + 0.2, R - 0.9, al), arc(u1 - 0.2, R - 0.9, al), 0.6, up, TONE.gate, null);
      }
    }
    const [ox, oz] = C.at(pierU[0], 0);
    for (const u of pierU.slice(0, SPILL.gates)) {
      const [x, z] = C.at(u, 0);
      gearAt.push([x - ox, 0, z - oz]);
      for (const [name, pts] of gearFaces) {
        face(name, 'wall', pts.map((q) => [q[0] + x - ox, q[1], q[2] + z - oz]));
      }
    }
    figures.spillwayGates = SPILL.gates;
    figures.spillwayGateWidth = pierU[1] - pierU[0] - pierW;
    figures.spillwayGateHeight = gateTop - sp.figures.sillY;
    figures.spillwaySill = sp.figures.sillY;
    figures.spillwayWidth = 2 * W;

    /* The chutes: the floor between the walls, per bay, as ground; each
     * bay's end the flip into the plunge pool. */
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
      const eR = Math.max(base, yEnd - 3);
      concrete.quad(e0, e1, at3(u1, end, eR), at3(u0, end, eR), shade(TONE.basalt, 9100 + b, 0.12), m);
      concrete.quad(at3(u0, end, eR), at3(u1, end, eR), at3(u1, end, yEnd), at3(u0, end, yEnd), TONE.chute, m);
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
      const end = wallEnd(k);
      const ds = [SPILL.pierEnd, ...knots.filter((d) => d > SPILL.pierEnd && d < end), end];
      for (let i = 0; i + 1 < ds.length; i += 1) {
        const d0 = ds[i];
        const d1 = ds[i + 1];
        const yA = floor(d0) + SPILL.wallHeight;
        const yB = floor(d1) + SPILL.wallHeight;
        const top = block(concrete, u0, u1, d0, d1, base, yA, yB, shade(TONE.concrete, 4000 + 50 * k + i, 0.05));
        /* The coping: a paler cap proud of the wall and over both its
         * faces, whose shadow line finishes the top where the bank meets
         * it (terrain/conform.js). Drawn only: under half a metre, its
         * wall's solids and record stand for it. */
        {
          const [c0, c1] = [u0 - COPING.lip, u1 + COPING.lip];
          const [hA, hB] = [yA + COPING.rise, yB + COPING.rise];
          concrete.poly([at3(c0, d0, hA), at3(c1, d0, hA), at3(c1, d1, hB), at3(c0, d1, hB)], TONE.coping, up);
          for (const [cu, sign] of [[c0, -1], [c1, 1]]) {
            concrete.quad(at3(cu, d0, yA - COPING.drop), at3(cu, d1, yB - COPING.drop), at3(cu, d1, hB), at3(cu, d0, hA), TONE.coping, [C.a[0] * sign, 0, C.a[1] * sign]);
          }
        }
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
    figures.spillwayMaxHeight = CREST_Y - sp.baseY;
    figures.spillwayBasalt = sp.baseY - base;
  }

  /* ================================================== embankment crests */
  /* Which side of a crest the reservoir wets: its edge and toe are drawn
   * in the ground's material there, the bank beside them (look/ground.js
   * riprap at the water), the dark dumped basalt on the dry side. */
  const reservoir = (ctx.data['water.json'] || []).find((b) => b.name === 'reservoir');
  const wet = (x, z) => {
    if (!reservoir) {
      return false;
    }
    const o = reservoir.outline;
    let odd = false;
    for (let j = 0, k = o.length - 1; j < o.length; k = j, j += 1) {
      if ((o[j][1] > z) !== (o[k][1] > z) && x < o[j][0] + ((z - o[j][1]) * (o[k][0] - o[j][0])) / (o[k][1] - o[j][1])) {
        odd = !odd;
      }
    }
    return odd;
  };
  for (const name of EMBANKMENTS) {
    const e = need(name);
    const secs = sectionsOf(e.axis);
    const run = [];
    const strips = { [-1]: null, 1: null };
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
        const f0 = offset(a, side * (EMBANKMENT_HALF + EMBANKMENT_EDGE.out));
        const f1 = offset(b, side * (EMBANKMENT_HALF + EMBANKMENT_EDGE.out));
        const yEdge = CREST_Y - EMBANKMENT_EDGE.down;
        const reach = offset(a, side * (EMBANKMENT_HALF + EMBANKMENT_EDGE.out + WET_PROBE));
        const isWet = wet(reach[0], reach[1]);
        if (!isWet) {
          concrete.quad([e0[0], CREST_Y, e0[1]], [e1[0], CREST_Y, e1[1]], [f1[0], yEdge, f1[1]], [f0[0], yEdge, f0[1]], TONE.rock, up);
        }
        /* Ground where it is drawn: a craft off the road's edge lands on
         * the edge, not on the terrain up to a metre under it. */
        slopeRoof([e0[0], CREST_Y, e0[1]], [e1[0], CREST_Y, e1[1]], [f1[0], yEdge, f1[1]], [f0[0], yEdge, f0[1]], `${name} edge`, 'rock');
        /* The toe: where the ground under the edge's lip is still lower
         * than it after the fill under the crest (terrain/conform.js), the
         * fill's riprap face on down from the lip at TOE_RUN across to one
         * down, to where it meets the ground, so the lip never hangs over
         * a void. The 10 m ground cannot stand at the road's 221 m within
         * a few metres of the spillway's 199 m sill, where the right
         * bank's road meets the west pier. Drawn only. */
        const out = [(side * a.m[0]) / Math.hypot(a.m[0], a.m[1]), (side * a.m[1]) / Math.hypot(a.m[0], a.m[1])];
        const foot = (p) => {
          let s = 0;
          while (s < TOE_REACH && yEdge - s / TOE_RUN > ctx.ground(p[0] + out[0] * s, p[1] + out[1] * s) - TOE_GAP) {
            s += TOE_STEP / 4;
          }
          return [p[0] + out[0] * s, yEdge - s / TOE_RUN, p[1] + out[1] * s];
        };
        const n = Math.max(1, Math.ceil(dist(f0, f1) / TOE_STEP));
        const along = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
        const needs = [];
        for (let i = 0; i < n; i += 1) {
          const p0 = along(f0, f1, i / n);
          const p1 = along(f0, f1, (i + 1) / n);
          needs.push(Math.min(ctx.ground(...p0), ctx.ground(...p1)) < yEdge - TOE_GAP);
          if (needs[i]) {
            const pts = [[p0[0], yEdge, p0[1]], [p1[0], yEdge, p1[1]], foot(p1), foot(p0)];
            toes.push({ name: `${name} toe`, pts });
            if (!isWet) {
              concrete.quad(pts[0], pts[1], pts[2], pts[3], TONE.rock, [out[0], TOE_RUN, out[1]]);
            }
          }
        }
        /* On the reservoir's side the edge and its toe are the bank: one
         * strip of columns (the crest's edge, the lip, the toe's foot or
         * the lip again where none is needed, so a toe tapers into the
         * bank where the ground comes up to it) in the ground's own
         * material (bankStrips, below), riprap at the water as the
         * reservoir's banks are, smooth across its pieces. */
        if (!isWet) {
          strips[side] = null;
          continue;
        }
        if (!strips[side]) {
          strips[side] = [];
          bankStrips.push(strips[side]);
        }
        for (let i = strips[side].length ? 1 : 0; i <= n; i += 1) {
          const e = along(e0, e1, i / n);
          const f = along(f0, f1, i / n);
          const toe = needs[i - 1] || needs[i];
          strips[side].push([[e[0], CREST_Y, e[1]], [f[0], yEdge, f[1]], toe ? foot(f) : [f[0], yEdge, f[1]]]);
        }
      }
    }
    closeRun(run);
    drawRoad(secs, -EMBANKMENT_HALF, -4, TONE.shoulder);
    drawRoad(secs, -4, 4, TONE.asphalt);
    drawRoad(secs, 4, EMBANKMENT_HALF, TONE.shoulder);
    markings(secs, 0, 4);
    lampsAlong(secs, EMBANKMENT_HALF - 0.4, CREST_Y, 40);
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

  /* ================================================== the switchyard */
  /*
   * The right bank switchyard, OSM way 32302779 (48 ha): the war package
   * builds the yard itself (docs/WARFARE-PLAN.md section 8); here only its
   * target, on the ground at the outline's area centroid, and the outline.
   */
  {
    const yard = (ctx.data['osm/power.json']?.substations ?? []).find((f) => f.id === 'w32302779');
    if (!yard) {
      throw new Error('itaipu dam: osm/power.json has no substation w32302779, the right bank switchyard');
    }
    let a = 0;
    let cx = 0;
    let cz = 0;
    const o = yard.outer;
    for (let i = 0; i < o.length; i += 1) {
      const [x0, z0] = o[i];
      const [x1, z1] = o[(i + 1) % o.length];
      const c = x0 * z1 - x1 * z0;
      a += c;
      cx += (x0 + x1) * c;
      cz += (z0 + z1) * c;
    }
    cx /= 3 * a;
    cz /= 3 * a;
    /* A placeholder: the war part (src/maps/itaipu/war, PR #199) builds
     * the yard and puts its own target in this id's place, its transformer
     * rows' middle and a reach over all of them, with their solids and
     * fires. The outline's area centroid here is within 20 m of that. */
    targets['yard-right'] = {
      at: [cx, ctx.ground(cx, cz), cz], r: 60, part: 'yard', colliders: [], outline: o.map((q) => q.slice()),
    };
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
  const metalMat = bounced(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.6, metalness: 0.15 }), 'steel');
  const meshes = [[concrete, concreteMat, 'concrete'], [road, roadMat, 'roads'], [metal, metalMat, 'steel']];
  const drawn = {};
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
    drawn[name] = mesh;
    triangles += m.triangles;
  }
  if (bankStrips.length) {
    const mesh = new THREE.Mesh(bankGeometry(THREE, bankStrips), ctx.groundMaterial);
    mesh.name = 'itaipu-dam-bank';
    mesh.receiveShadow = true;
    group.add(mesh);
    drawn.bank = mesh;
    triangles += bankStrips.reduce((t, st) => t + 4 * (st.length - 1), 0);
  }
  group.add(penstockMesh);
  drawn.penstocks = penstockMesh;
  triangles += penstockTris.p.length / 9;
  /* The lamps and the intake columns, one instanced draw each. */
  const instanced = (geo, mat, list, name, turn) => {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    list.forEach((e, k) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn ? e[3] : 0);
      m4.compose(new THREE.Vector3(e[0], e[1], e[2]), q, one);
      mesh.setMatrixAt(k, m4);
    });
    mesh.computeBoundingSphere();
    mesh.name = `itaipu-dam-${name}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const white = new THREE.Color(1, 1, 1);
    list.forEach((_, k) => mesh.setColorAt(k, white));
    group.add(mesh);
    drawn[name] = mesh;
    triangles += (geo.getAttribute('position').count / 3) * list.length;
  };
  {
    const pole = new THREE.CylinderGeometry(LAMP.r * 0.7, LAMP.r, LAMP.height, 8, 1, true).translate(0, LAMP.height / 2, 0);
    const arm = new THREE.BoxGeometry(LAMP.arm, 0.12, 0.12).translate(LAMP.arm / 2, LAMP.height - 0.1, 0);
    const head = new THREE.BoxGeometry(0.7, 0.18, 0.32).translate(LAMP.arm, LAMP.height - 0.25, 0);
    const mat = bounced(new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.42, 0.44, 0.45, THREE.LinearSRGBColorSpace), roughness: 0.45, metalness: 0.3 }), 'lamp');
    instanced(mergeGeometries(THREE, [pole, arm, head]), mat, lamps, 'lamps', true);
  }
  {
    /* The shaft on a round plinth, two collars, the capital and its
     * domed cap (crest-road), all within 0.3 m of the capsule. */
    const H = VENT.height;
    const r = VENT.r;
    const plinth = new THREE.CylinderGeometry(r + 0.3, r + 0.3, 0.4, 16).translate(0, 0.2, 0);
    const shaft = new THREE.CylinderGeometry(r, r, H, 16, 1, true).translate(0, H / 2, 0);
    const collars = [0.5, 0.72].map((f) => new THREE.CylinderGeometry(r + 0.12, r + 0.12, 0.5, 16).translate(0, H * f, 0));
    const capital = new THREE.CylinderGeometry(r + 0.22, r + 0.1, 0.8, 16).translate(0, H - 0.7, 0);
    const dome = new THREE.CylinderGeometry(0.25, r + 0.1, 0.3, 16).translate(0, H - 0.15, 0);
    /* White paint at the penstocks' tone (TONE.penstock): v3's 0.75, and
     * 0.5, drew clipped flat white with no roundness under the bounce,
     * where the photographs' columns shade grey round their sides. */
    const mat = bounced(new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.28, 0.28, 0.275, THREE.LinearSRGBColorSpace), roughness: 0.5, metalness: 0.1 }), 'column');
    instanced(mergeGeometries(THREE, [plinth, shaft, ...collars, capital, dome]), mat, vents, 'intake-columns', false);
  }
  instanced(gear.geometry(THREE), metalMat, gearAt, 'gate-gear', false);

  /* ---- the targets' states: smoke and fire over them, and a destroyed
   * part drawn charred, its colours put back when it is anything else. */
  /* An intake's colliders: the dam's boxes its sphere reaches, the
   * upstream face's columns round its gate. */
  for (const t of Object.values(targets)) {
    if (t.part !== 'intake') {
      continue;
    }
    const [x, y, z] = t.at;
    for (const b of boxes) {
      const dx = Math.max(b[0] - x, 0, x - b[3]);
      const dy = Math.max(b[1] - y, 0, y - b[4]);
      const dz = Math.max(b[2] - z, 0, z - b[5]);
      if (dx * dx + dy * dy + dz * dz <= t.r * t.r) {
        t.colliders.push(b[6]);
      }
    }
  }
  const targetIds = Object.keys(targets).sort();
  for (const t of Object.values(targets)) {
    Object.freeze(t.at);
    Object.freeze(t.colliders);
    Object.freeze(t);
  }
  Object.freeze(targets);
  const damage = makeDamage(THREE, targetIds, targets);
  if (ctx.mats.thermal) {
    /* Fire flecks at six hundred degrees; the smoke a little over the
     * air and thin in the long wave band (src/render/thermal.js). */
    ctx.mats.thermal.shader(damage.points.material, 'float thT = mix(thEnv.y + 0.08, 6.0, vFire); float thA = mix(0.25, 1.0, vFire);', 'itaipu-dam-damage');
  }
  group.add(damage.points);
  const states = Object.fromEntries(targetIds.map((id) => [id, 'ok']));
  const CHAR = 0.16;
  const kept = new Map();
  const char = (id, on) => {
    for (const [j, d] of [darken[id] ?? []].flat().entries()) {
      charOne(`${id}#${j}`, d, on);
    }
  };
  const charOne = (key, d, on) => {
    const mesh = drawn[d.mesh];
    if (d.instance != null) {
      mesh.setColorAt(d.instance, new THREE.Color(on ? CHAR : 1, on ? CHAR : 1, on ? CHAR : 1));
      mesh.instanceColor.needsUpdate = true;
      return;
    }
    const attr = mesh.geometry.getAttribute('color');
    const [a, b] = d.range;
    if (!kept.has(key)) {
      kept.set(key, attr.array.slice(a, b));
    }
    const orig = kept.get(key);
    for (let i = a; i < b; i += 1) {
      attr.array[i] = on ? orig[i - a] * CHAR : orig[i - a];
    }
    attr.addUpdateRange(a, b - a);
    attr.needsUpdate = true;
  };
  /* `table` is the map's targets as they are now (itaipu.js passes
   * map.targets), so an entry another part put in place of one of these
   * burns where that entry says. */
  const setTargetState = (id, state, table = targets) => {
    if (!(id in table) || !(id in targets)) {
      throw new Error(`itaipu dam: no target ${id}`);
    }
    if (!TARGET_STATES.includes(state)) {
      throw new Error(`itaipu dam: a target is ${TARGET_STATES.join(', ')}, not ${state}`);
    }
    if (states[id] === state) {
      return;
    }
    if ((states[id] === 'destroyed') !== (state === 'destroyed')) {
      char(id, state === 'destroyed');
    }
    states[id] = state;
    damage.set(id, state, table[id]);
    /* No draw at all while nothing burns. */
    damage.points.visible = targetIds.some((t) => states[t] !== 'ok');
  };
  damage.points.visible = false;
  ctx.progress(1);
  const buildMs = performance.now() - started;

  const counts = () => ({
    buildMs,
    solids: solids.length,
    boxes: boxes.length,
    capsules: capsules.length,
    roofs: records.length,
    meshes: group.children.length,
    targets: targetIds.length,
    burning: targetIds.filter((id) => states[id] !== 'ok').length,
    triangles,
    mainTriangles,
  });
  return {
    group,
    update(step) {
      damage.update(step);
    },
    dispose() {},
    stats: counts,
    /* The war mode's targets (docs/WARFARE-PLAN.md section 8), frozen:
     * { id: { at: [x, y, z], r, part, colliders, shape?, a?, b? } }.
     *   - A target is a sphere of radius r about `at` unless `shape` is
     *     'capsule' (the penstocks): then it is every point within r of
     *     the segment a to b, and `at` a point on the part for a camera
     *     or a marker. Targets of one kind never overlap.
     *   - intake-0..19: the gate in the upstream face; gate-0..13, west to
     *     east: the spillway gate's upstream face, r at most 12.5, half
     *     the gates' pitch; penstock-0..19: capsules; yard-right: a
     *     placeholder the war part (PR #199) replaces with the real yard.
     *   - `colliders`: the static collider indices a hit on it is (none
     *     for the yard's placeholder). */
    targets,
    setTargetState,
    targetState: (id) => states[id],
    /* What scripts/dam-check.js measures: the drawn faces the collision
     * must hold, the figures as built, where to fly (sites, with the
     * buttress heads' capsules), and the part's own collider indices. */
    survey: () => ({
      ...counts(),
      faces,
      toes,
      figures,
      sites,
      solidIndices: solids.slice(),
      records: records.slice(),
      colliders: ctx.colliders,
    }),
  };
}
