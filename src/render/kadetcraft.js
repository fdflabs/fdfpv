/*
 * kadetcraft.js: the SIG Kadet Senior's model, and nothing else.
 *
 * Its own file for the reason cubcraft.js is. The Kadet Senior is Claude
 * McCullough's 78 in balsa trainer for SIG Manufacturing (kit RC-58): a
 * three channel high wing on a flat bottomed section with generous
 * dihedral, "will not be suitable for aileron control and in fact, does
 * not need it" (the SIG building and flying instructions), a tricycle gear
 * with a steerable nose wheel, and a stick built fuselage whose rear half
 * is an open truss. This one flies on an O.S. FS-52 Surpass four stroke
 * on a 12 x 6, and it is covered in two transparent films, so the framework
 * shows through: see filmmat.js, and docs/KADET-STAGE1.md for every number
 * below with its source.
 *
 * SIG publishes the span, 78 in, the area, 1150 sq in, the length, 62 in,
 * the balance point, 3 7/8 in behind the leading edge at the main spar,
 * the throws and every stick of wood in the kit. The outline beyond that
 * is ESTIMATED off SIG's box art photograph, a side view of the kit's
 * prototype, scaled by the 62 in length. Numbers here are REAL INCHES:
 *
 *   wing        a constant 14.74 in chord (1150 / 78), sheeted tips rounded
 *               over their last 3 in, a flat bottomed section about 13
 *               percent thick at 2 degrees of incidence, straight dihedral
 *               with one tip 6 in over a flat panel (the manual's step 18):
 *               4.6 degrees a side. Ribs every 2.5 in, a 1/4 x 1/2 main
 *               spar pair at the balance point, a 3/16 x 3/8 rear pair, a
 *               1/2 in square leading edge, a 1 3/8 in trailing edge, the
 *               centre section sheeted
 *   fuselage    a box of 1/4 in sticks, the nose and cabin sides sheeted
 *               with 3/32 in balsa back to the wing's trailing edge, the
 *               rear an open truss of uprights and diagonals; a carved
 *               balsa cowl; cabin windows and a windshield
 *   tail        a 28 in stabiliser of 3/8 in square frame with diagonal
 *               braces, its elevator the aft 3 in in two halves round the
 *               rudder; a fin of 5/16 in frame with ribs and diagonals,
 *               its rudder the aft 3.5 in down to the fuselage's bottom
 *   engine      the O.S. FS-52 Surpass upright, its head and rocker cover
 *               standing out of the cowl, on a 12 x 6 with a spinner
 *   gear        5/32 in wire: a steerable nose leg on the firewall and a
 *               torsion bar main gear under the cabin, 3 in and 3 1/2 in
 *               wheels (ESTIMATED)
 *
 * THE ORIGIN IS THE CENTRE OF GRAVITY: SIG's 3 7/8 in behind the wing's
 * leading edge, and 0.5 in over the thrust line, ESTIMATED from the wing
 * above and the engine and radio below. Stations are inches aft of the
 * prop's plane, turned into the craft frame's z by st(); heights are
 * inches over the thrust line, turned by ht().
 *
 * THE COVERING. Top Flite's transparent MonoKote in two colours, laid out
 * the way SIG's box art lays out its two: the wing and the stabiliser
 * transparent yellow with red tips and a red stripe on the wing's top (the
 * manual asks for a mark on the top so the pilot can tell it from the
 * bottom); the fuselage, the fin and the rudder transparent red, with a
 * yellow nose and a yellow flash up the fin's leading edge. Each covered
 * part carries a map drawn from the kit's own wood (film...() below):
 * the film's colour where it spans a bay, lighter where wood is under it,
 * and the wood's share in the alpha, which the film material turns into
 * light through the bays and shadows of the frame when the sun is behind.
 *
 * The contract with the shell is cubcraft.js's: group, discs, blades,
 * leds, cameraMount, stator, propSpin, four slots long, and
 * setSurfaces(leftAileron, rightAileron, elevator, rudder) in radians. The
 * Kadet has no ailerons, so the first two are read and ignored, as the
 * plant reports them zero. Elevator positive trailing edge up; rudder
 * positive trailing edge to the LEFT, and the nose wheel turns with it,
 * its front the way the rudder's trailing edge goes.
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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { celMaterial, outlineHull } from './celmat.js';
import { filmMaterial, filmMap, filmMapOf } from './filmmat.js';
import { WORLD_SCALE } from './frame.js';

const R = (inches) => inches * 0.0254;

/* Stations: the wing's leading edge, its chord, and the CG. */
const LE_S = 13.5;
const CHORD_IN = 1150 / 78;
const CG_S = LE_S + 3.875;
const CG_H = 0.5;
const st = (s) => R(s - CG_S);
const ht = (h) => R(h - CG_H);

/* The wing: HALF the tip, TIP_IN where the sheeted tip starts to round. */
const HALF = 39.0;
const TIP_IN = 36.0;
const DIHEDRAL = Math.atan(3 / 39);
const ROOT_Y = 3.4;
const INCIDENCE = (1.5 * Math.PI) / 180;
const WING_T = 0.13;
const RIB_PITCH = 2.5;
const CENTRE_SHEET = 3.5;
const MAIN_SPAR = [3.625, 4.125];
const REAR_SPAR = [9.3, 9.5];
const LE_STICK = 0.5;
const TE_STOCK = 1.375;

/* The tail, inches. */
const STAB_HALF = 15.5;
const STAB_LE_S = 53.0;
const ELEV_HINGE_S = 58.0;
const STAB_TE_S = 61.0;
const STAB_Y = -1.0;
const STAB_T = 0.375;
const ELEV_GAP = 0.9;
const FIN_ROOT_S = 49.2;
const FIN_ROOT_H = -0.6;
const FIN_TOP = 10.2;
const FIN_TOP_LE_S = 55.1;
const RUDDER_S = 57.5;
const RUDDER_TE_S = 61.0;
const RUDDER_BOTTOM = -4.5;
const FIN_T = 0.3125;

/* The nose: the prop's plane and the firewall 4 1/8 in behind the spinner
 * backplate (the manual's step 29). */
const PROP_S = 0.0;
const FIREWALL_S = 4.2;
const PROP_R = R(6);
const SPINNER_R = R(1.125);
const THRUST_H = 0.0;

/* The gear, ESTIMATED off the box art: axle stations and heights, inches. */
const NOSE_S = 5.5;
const NOSE_H = -9.97;
const NOSE_R = R(3.25 / 2);
/* Where the nose leg leaves its bearing on the firewall's front, under the cowl. */
const NOSE_TOP_S = 3.6;
const MAIN_S = 21.0;
const MAIN_H = -9.72;
const MAIN_TRACK = 13.0;
const MAIN_R = R(3.75 / 2);
const WHEEL_W = R(0.9);
const WIRE_R = R(5 / 64);

/*
 * The fuselage: station, half width, top and bottom over the thrust line,
 * and squareness, off the box art. The cowl rounds the nose; the cabin
 * runs from the windshield up to the wing; behind the wing the top falls
 * to the stabiliser's saddle and the sides pull in to the tail post.
 */
const FUSE_END_S = 57.3;
const FUSE = [
  [0.9, 1.05, 1.0, -1.9, 2.6],
  [2.0, 1.65, 1.6, -3.3, 3.0],
  [FIREWALL_S, 1.85, 1.9, -4.1, 4.0],
  [8.0, 1.875, 2.1, -4.7, 5.0],
  [11.0, 1.875, 2.4, -5.3, 5.0],
  [LE_S, 1.875, ROOT_Y, -5.7, 5.0],
  [LE_S + CHORD_IN, 1.875, ROOT_Y - CHORD_IN * Math.tan(INCIDENCE), -6.0, 5.0],
  [36.0, 1.72, 2.2, -6.0, 5.0],
  [44.0, 1.35, 0.9, -5.7, 5.0],
  [51.0, 0.90, STAB_Y, -5.2, 5.0],
  [FUSE_END_S, 0.50, STAB_Y, -4.6, 5.0],
];
function fuseAt(s) {
  const last = FUSE[FUSE.length - 1];
  const t = Math.min(Math.max(s, FUSE[0][0]), last[0]);
  for (let i = 0; i + 1 < FUSE.length; i += 1) {
    const a = FUSE[i];
    const b = FUSE[i + 1];
    if (t <= b[0]) {
      const u = (t - a[0]) / (b[0] - a[0]);
      const k = i < 2 ? u * u * (3 - 2 * u) : u;
      const lerp = (j) => a[j] + (b[j] - a[j]) * k;
      const top = lerp(2);
      const bottom = lerp(3);
      return { w: R(lerp(1)), h: R((top - bottom) / 2), yc: ht((top + bottom) / 2), e: lerp(4) };
    }
  }
  throw new Error(`kadetcraft: station ${s} is off the fuselage`);
}
function fusePoint(s, a) {
  const { w, h, yc, e } = fuseAt(s);
  const sn = Math.sin(a);
  const cs = Math.cos(a);
  const p = 2 / e;
  return new THREE.Vector3(
    Math.sign(sn) * w * Math.abs(sn) ** p,
    yc + Math.sign(cs) * h * Math.abs(cs) ** p,
    st(s),
  );
}
const FUSE_STATIONS = [0.9, 1.4, 2.0, 3.0, FIREWALL_S, 6.0, 8.0, 11.0, LE_S, 18.0, 23.0, LE_S + CHORD_IN,
  32.0, 36.0, 40.0, 44.0, 48.0, 51.0, 54.0, FUSE_END_S];
const FUSE_STATIONS_LITE = [0.9, 2.0, FIREWALL_S, 11.0, LE_S, LE_S + CHORD_IN, 44.0, FUSE_END_S];

/* NACA four digit half thickness. */
function naca(t, thick) {
  return 5 * thick * (
    0.2969 * Math.sqrt(t) - 0.1260 * t - 0.3516 * t * t + 0.2843 * t * t * t - 0.1015 * t * t * t * t
  );
}

/*
 * A loft of closed sections that carries texture coordinates: each section
 * is a list of { p, uv }, skinned in order and capped, faced outward by
 * the sign of its volume. `smooth` lists pairs of section indices that are
 * the same point drawn twice for the texture's sake (a seam), whose normals
 * are averaged so the seam does not show as a crease.
 */
function loftUV(sections, smooth = []) {
  const n = sections[0].length;
  const pos = [];
  const uv = [];
  for (const sec of sections) {
    for (const { p, uv: t } of sec) {
      pos.push(p.x, p.y, p.z);
      uv.push(t[0], t[1]);
    }
  }
  const idx = [];
  for (let s = 0; s + 1 < sections.length; s += 1) {
    const a = s * n;
    const b = (s + 1) * n;
    for (let j = 0; j + 1 < n; j += 1) {
      idx.push(a + j, a + j + 1, b + j, a + j + 1, b + j + 1, b + j);
    }
  }
  const cap = (sec, base, flip) => {
    const c = new THREE.Vector3();
    for (const { p } of sec) {
      c.add(p);
    }
    c.multiplyScalar(1 / n);
    const centre = pos.length / 3;
    pos.push(c.x, c.y, c.z);
    uv.push(sec[0].uv[0], sec[0].uv[1]);
    for (let j = 0; j + 1 < n; j += 1) {
      idx.push(centre, flip ? base + j + 1 : base + j, flip ? base + j : base + j + 1);
    }
  };
  cap(sections[0], 0, true);
  cap(sections[sections.length - 1], (sections.length - 1) * n, false);
  let vol = 0;
  const v = (i) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  for (let i = 0; i < idx.length; i += 3) {
    vol += v(idx[i]).dot(v(idx[i + 1]).cross(v(idx[i + 2])));
  }
  if (vol < 0) {
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const nrm = geo.getAttribute('normal');
  for (let s = 0; s < sections.length; s += 1) {
    for (const [i, j] of smooth) {
      const a = s * n + i;
      const b = s * n + j;
      const m = new THREE.Vector3(nrm.getX(a) + nrm.getX(b), nrm.getY(a) + nrm.getY(b), nrm.getZ(a) + nrm.getZ(b)).normalize();
      nrm.setXYZ(a, m.x, m.y, m.z);
      nrm.setXYZ(b, m.x, m.y, m.z);
    }
  }
  return geo;
}

/* Cosine spaced chord fractions, 0 to 1. */
function chordTs(n) {
  const ts = [];
  for (let i = 0; i < n; i += 1) {
    ts.push(0.5 * (1 - Math.cos((Math.PI * i) / (n - 1))));
  }
  return ts;
}

/*
 * The planform at |x| inches out: a constant chord, and outboard of TIP_IN
 * the sheeted tip, its leading edge swept back on a quarter ellipse and its
 * trailing edge rounded a little, as the box art's tips are.
 */
function chordLE(ax) {
  if (ax <= TIP_IN) {
    return { le: 0, te: CHORD_IN };
  }
  const u = Math.min(0.995, (ax - TIP_IN) / (HALF - TIP_IN));
  const f = Math.sqrt(1 - u * u);
  return { le: 0.55 * CHORD_IN * (1 - f), te: CHORD_IN - 0.2 * CHORD_IN * (1 - f) };
}
/* A flat bottomed section, 13 percent: the bottom flat from 15 percent of
 * the chord back, the nose rounded under it. */
const upper = (t) => 2 * naca(t, WING_T) * 0.92;
const lower = (t) => -0.35 * naca(t, WING_T) * Math.max(0, 1 - t / 0.15);
/* A point on the wing's skin: x inches out, t chord fraction, side +1 top
 * and -1 bottom. The section is laid on its panel, so it tilts with the
 * dihedral. */
function wingAt(x) {
  const ax = Math.abs(x);
  const { le, te } = chordLE(ax);
  const c = te - le;
  const y0 = ROOT_Y + ax * Math.tan(DIHEDRAL);
  return (t, side) => {
    const s = LE_S + le + t * c;
    const n = CHORD_IN * (side > 0 ? upper(t) : lower(t)) * (c / CHORD_IN) ** 0.5;
    const drop = (s - LE_S) * Math.tan(INCIDENCE);
    return new THREE.Vector3(
      R(x - Math.sign(x) * n * Math.sin(DIHEDRAL)),
      ht(y0 - drop + n * Math.cos(DIHEDRAL)),
      st(s),
    );
  };
}
/* The texture's u across the span and v along the chord in inches from
 * the root's leading edge: the top in v 0 to 0.5, the bottom 0.5 to 1. */
const wingU = (x) => (x + HALF) / (2 * HALF);
function wingSection(x, n) {
  const at = wingAt(x);
  const ax = Math.abs(x);
  const { le, te } = chordLE(ax);
  const ts = chordTs(n);
  const sec = ts.map((t) => ({ p: at(t, 1), uv: [wingU(x), 0.5 * (le + t * (te - le)) / CHORD_IN] }));
  for (let i = n - 1; i >= 0; i -= 1) {
    sec.push({ p: at(ts[i], -1), uv: [wingU(x), 0.5 + 0.5 * (le + ts[i] * (te - le)) / CHORD_IN] });
  }
  return sec;
}
function wingGeometry(lite) {
  const n = lite ? 9 : 14;
  const half = lite
    ? [0, 12, 24, TIP_IN, 37.8, HALF]
    : [0, 6, 12, 18, 24, 30, TIP_IN, 37.0, 37.8, 38.4, 38.8, HALF];
  const xs = [...half.slice(1).reverse().map((x) => -x), ...half];
  return loftUV(xs.map((x) => wingSection(x, n)), [[0, 2 * n - 1]]);
}

/*
 * THE FRAMEWORK, drawn into each covered part's map in the part's own
 * inches: which wood is under the film at a point, 0 an open bay to 1
 * solid, and the film's colour there. `band(d, w)` is 1 inside a strip w
 * wide about d = 0 with a half texel of softening, so a stick of wood
 * stays its real width at any texture size.
 */
const YELLOW = [1.0, 0.86, 0.10];
const RED = [0.84, 0.07, 0.08];
const BALSA = [0.95, 0.88, 0.72];

/*
 * THE FOUR FILMS BY REGION (src/render/livery.js), sRGB 0 to 1: the wing's
 * and stabiliser's own film and its trim (the tips, the stripe), the
 * fuselage's and fin's own film and its trim (the nose, the flash). Stock
 * is the box art's, SIG's yellow and red crossed over, and a region on its
 * stock colour paints with these very numbers, so the stock maps are the
 * maps this model has always had, texel for texel.
 */
const STOCK_FILMS = { wing: YELLOW, wing_trim: RED, fuselage: RED, fuse_trim: YELLOW };
const toHex = (c) => (Math.round(c[0] * 255) << 16) | (Math.round(c[1] * 255) << 8) | Math.round(c[2] * 255);
export const KADET_FILM_STOCK = Object.fromEntries(Object.entries(STOCK_FILMS).map(([k, c]) => [k, toHex(c)]));
function filmsFor(colours = {}) {
  return Object.fromEntries(Object.entries(STOCK_FILMS).map(([k, c]) => {
    const hex = colours[k];
    if (hex === undefined || hex === null || hex === KADET_FILM_STOCK[k]) {
      return [k, c];
    }
    return [k, [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => v / 255)];
  }));
}
function band(d, w, soft) {
  const x = Math.abs(d) - w / 2;
  return x <= -soft ? 1 : x >= soft ? 0 : 0.5 - x / (2 * soft);
}
/* A seam between the two films, d inches past it toward b, cut clean
 * but not stepped by the map's texels. */
function seam(a, b, d) {
  const f = Math.min(1, Math.max(0, 0.5 + d / 0.12));
  return a.map((c, i) => c + (b[i] - c) * f);
}
/* The film as the viewer's side lights it: over a bay the dark inside of
 * the part shows through it, over wood the wood lights it from behind. */
function filmLit(film, wood) {
  const bay = film.map((c) => c * 0.72);
  const over = film.map((c, i) => c * (0.55 + 0.45 * BALSA[i]) * 1.08);
  return [0, 1, 2].map((i) => bay[i] + (over[i] - bay[i]) * wood);
}
const wingPaint = (films) => (u, v) => {
  const x = u * 2 * HALF - HALF;
  const ax = Math.abs(x);
  const top = v < 0.5;
  const c = (top ? v : v - 0.5) * 2 * CHORD_IN;
  const soft = 0.04;
  let wood = 0;
  /* Ribs every 2.5 in out from the root. Drawn 0.22 in wide, not a rib's
   * 1/16 in edge: against the light a rib's whole depth stands in the bay
   * seen at any slant, and a thinner line fades out of the map's mips. */
  if (ax < TIP_IN + 0.1) {
    const k = Math.round(ax / RIB_PITCH);
    wood = Math.max(wood, band(ax - k * RIB_PITCH, 0.22, soft));
  }
  wood = Math.max(wood, band(c - (MAIN_SPAR[0] + MAIN_SPAR[1]) / 2, MAIN_SPAR[1] - MAIN_SPAR[0], soft));
  wood = Math.max(wood, band(c - (REAR_SPAR[0] + REAR_SPAR[1]) / 2, REAR_SPAR[1] - REAR_SPAR[0] + 0.02, soft));
  wood = Math.max(wood, c < LE_STICK ? 1 : 0, c > CHORD_IN - TE_STOCK ? 1 : 0);
  /* The centre section: 1/8 in sheet ahead of the main spar, 3/32 behind,
   * and the 2 in glass tape over the joint. Thin balsa passes some light. */
  if (ax < CENTRE_SHEET) {
    wood = Math.max(wood, 0.86);
  }
  /* The sheeted tips. */
  if (ax > TIP_IN) {
    wood = Math.max(wood, 0.86);
  }
  /* Transparent red on the tips outboard of the second rib in, and on
   * the top a red stripe diagonally across each panel. */
  let film = seam(films.wing, films.wing_trim, ax - (TIP_IN - 2 * RIB_PITCH - 0.5));
  if (top) {
    const d = (ax - 16) - (c - 3) * 0.55;
    film = seam(film, films.wing_trim, 1.2 - Math.abs(d));
  }
  return [...filmLit(film, wood), wood];
};

/*
 * The stabiliser and elevator as one flat plate at the tail, its map in
 * its own planform inches: u across its span, v along its chord from the
 * stabiliser's leading edge. The frame is 3/8 in square round the edge,
 * a 3/8 x 3/4 centre rib, 1/4 x 3/8 diagonal braces; the elevator a 1/4 x
 * 3/8 leading edge, a 3/4 in trailing edge, E-1 ribs and diagonals.
 */
const STAB_CHORD = STAB_TE_S - STAB_LE_S;
const stabPaint = (films) => (u, v) => {
  const x = (u - 0.5) * 2 * STAB_HALF;
  const ax = Math.abs(x);
  const c = v * STAB_CHORD;
  const hinge = ELEV_HINGE_S - STAB_LE_S;
  const soft = 0.03;
  let wood = 0;
  if (c < hinge) {
    wood = Math.max(wood, c < 0.375 ? 1 : 0, c > hinge - 0.375 ? 1 : 0, ax > STAB_HALF - 0.375 ? 1 : 0);
    wood = Math.max(wood, ax < 0.375 ? 1 : 0);
    /* Two diagonal braces a side, a W across the fixed part. */
    for (const [x0, x1] of [[0.4, 7.75], [7.75, STAB_HALF - 0.4]]) {
      if (ax > x0 && ax < x1) {
        const f = (ax - x0) / (x1 - x0);
        const cd = x0 < 1 ? f * hinge : (1 - f) * hinge;
        wood = Math.max(wood, band(c - cd, 0.30, soft));
      }
    }
  } else {
    const ce = c - hinge;
    const ec = STAB_TE_S - ELEV_HINGE_S;
    wood = Math.max(wood, ce < 0.375 ? 1 : 0, ce > ec - 0.5 ? 1 : 0, ax > STAB_HALF - 0.3 ? 1 : 0, ax < ELEV_GAP + 0.3 ? 1 : 0);
    const k = Math.round(ax / 3.2);
    wood = Math.max(wood, band(ax - k * 3.2, 0.14, soft));
    const d = ((ax / 3.2) % 1) * ec - ce;
    wood = Math.max(wood, band(d * 0.8, 0.12, soft));
  }
  const film = ax > STAB_HALF - 3.0 ? films.wing_trim : films.wing;
  return [...filmLit(film, wood), wood];
};

/*
 * The fin and rudder in their own side view inches: u along the stations
 * from FIN_ROOT_S to RUDDER_TE_S, v up from RUDDER_BOTTOM to FIN_TOP. The
 * fin is a 5/16 in frame with 3/16 x 5/16 ribs and 1/8 x 5/16 diagonals;
 * the rudder a 5/16 in leading edge, a 3/4 in trailing edge, straight ribs
 * R-2, R-4, R-6 and diagonal ones between them.
 */
const TAIL_SPAN_S = RUDDER_TE_S - FIN_ROOT_S;
const TAIL_SPAN_H = FIN_TOP - RUDDER_BOTTOM;
function finLE(h) {
  const f = (h - FIN_ROOT_H) / (FIN_TOP - FIN_ROOT_H);
  return FIN_ROOT_S + (FIN_TOP_LE_S - FIN_ROOT_S) * Math.min(1, Math.max(0, f));
}
const tailPaint = (films) => (u, v) => {
  const s = FIN_ROOT_S + u * TAIL_SPAN_S;
  const h = RUDDER_BOTTOM + v * TAIL_SPAN_H;
  const soft = 0.03;
  let wood = 0;
  let film = films.fuselage;
  if (s < RUDDER_S) {
    const le = finLE(h);
    const d = s - le;
    wood = Math.max(wood, d < 0.6 ? 1 : 0, s > RUDDER_S - 0.3125 ? 1 : 0, h > FIN_TOP - 0.3125 ? 1 : 0, h < FIN_ROOT_H + 0.3 ? 1 : 0);
    for (const hr of [3.5, 7.0]) {
      wood = Math.max(wood, band(h - hr, 0.1875, soft));
    }
    const span = RUDDER_S - le;
    const cells = [[FIN_ROOT_H, 3.5, 1], [3.5, 7.0, -1], [7.0, FIN_TOP, 1]];
    for (const [h0, h1, dir] of cells) {
      if (h > h0 && h < h1) {
        const f = (h - h0) / (h1 - h0);
        const sd = le + span * (dir > 0 ? f : 1 - f);
        wood = Math.max(wood, band(s - sd, 0.16, soft));
      }
    }
    /* The yellow flash up the leading edge. */
    if (d < 1.4) {
      film = films.fuse_trim;
    }
  } else {
    const d = s - RUDDER_S;
    const rc = RUDDER_TE_S - RUDDER_S;
    wood = Math.max(wood, d < 0.3125 ? 1 : 0, d > rc - 0.75 ? 1 : 0, h > FIN_TOP - 0.3125 ? 1 : 0, h < RUDDER_BOTTOM + 0.3125 ? 1 : 0);
    const k = Math.round((h - RUDDER_BOTTOM) / 2.45);
    wood = Math.max(wood, band(h - RUDDER_BOTTOM - k * 2.45, 0.1875, soft));
    const cell = ((h - RUDDER_BOTTOM) / 2.45) % 1;
    wood = Math.max(wood, band((cell * rc - d) * 0.8, 0.15, soft));
  }
  return [...filmLit(film, wood), wood];
};

/*
 * The fuselage's map: u along the stations 0 to FUSE_END_S, v the angle
 * round the section over a turn, 0 on top and 0.5 underneath, the right
 * side 0.25. Longerons of 1/4 in square along the four corners, uprights
 * and diagonals of 1/4 in square in the cabin and 1/8 x 1/4 in behind it,
 * the sides sheeted with 3/32 in from the firewall to the wing's trailing
 * edge, the bottom sheeted across its grain, crosspieces over the top.
 */
const UPRIGHTS = [28.2, 32.6, 37.0, 41.4, 45.8, 50.2, 54.2, FUSE_END_S - 0.3];
/*
 * The fuselage map's v round a section, unrolled face by face so that it
 * runs linearly with the skin: the top from its middle, 0, to the right
 * corner, 0.125; the right side down to 0.375; the bottom to 0.625; the
 * left side up to 0.875; the top back to its middle, 1. Along a face the
 * coordinate is the point's height over the section's middle over the
 * half height (on a side) or its offset over the half width (on the top
 * and bottom), which is k at each corner, the superellipse's 45 degree
 * point. An angle would run nonlinearly along a side of a squared section
 * and bend every straight line drawn on it.
 */
function cornerOf(s) {
  return Math.SQRT1_2 ** (2 / fuseAt(s).e);
}
function fuseV(s, a) {
  const p = 2 / fuseAt(s).e;
  const k = cornerOf(s);
  const sn = Math.sin(a);
  const cs = Math.cos(a);
  const eta = Math.sign(cs) * Math.abs(cs) ** p;
  const xi = Math.sign(sn) * Math.abs(sn) ** p;
  if (Math.abs(sn) <= Math.abs(cs)) {
    if (cs > 0) {
      return xi >= 0 ? 0.125 * xi / k : 0.875 + 0.125 * (xi + k) / k;
    }
    return 0.375 + 0.25 * (k - xi) / (2 * k);
  }
  return sn > 0 ? 0.125 + 0.25 * (k - eta) / (2 * k) : 0.625 + 0.25 * (eta + k) / (2 * k);
}
function faceOf(s, v) {
  const k = cornerOf(s);
  if (v < 0.125) return { side: false, top: true, coord: (v / 0.125) * k };
  if (v < 0.375) return { side: true, coord: k - ((v - 0.125) / 0.25) * 2 * k };
  if (v < 0.625) return { side: false, top: false, coord: k - ((v - 0.375) / 0.25) * 2 * k };
  if (v < 0.875) return { side: true, coord: -k + ((v - 0.625) / 0.25) * 2 * k };
  return { side: false, top: true, coord: -k + ((v - 0.875) / 0.125) * k };
}
const fusePaint = (films) => (u, v) => {
  const s = u * FUSE_END_S;
  const face = faceOf(s, v);
  const k = cornerOf(s);
  const side = face.side;
  const soft = 0.03;
  /* Where on the face: its height over the half height up a side, or its
   * offset over the half width across the top or the bottom. */
  const eta = face.coord;
  let wood = 0;
  let film = seam(films.fuse_trim, films.fuselage, s - 10);
  if (s < FIREWALL_S + 0.2) {
    wood = 1;
  } else if (!side && !face.top) {
    /* The bottom: sheeted, and light only faintly through it; yellow as
     * far back as the sides' yellow reaches it. */
    wood = 0.9;
    film = seam(films.fuse_trim, films.fuselage, s - 46);
  } else if (side) {
    const { h } = fuseAt(s);
    const hIn = h / 0.0254;
    wood = Math.max(wood, band((k - Math.abs(eta)) * hIn, 0.5, soft));
    if (s < LE_S + CHORD_IN) {
      wood = Math.max(wood, 0.88);
    } else {
      for (let i = 0; i + 1 < UPRIGHTS.length; i += 1) {
        const s0 = UPRIGHTS[i];
        const s1 = UPRIGHTS[i + 1];
        wood = Math.max(wood, band(s - s0, i === 0 ? 0.25 : 0.2, soft));
        if (s > s0 && s < s1) {
          const f = (s - s0) / (s1 - s0);
          const want = i % 2 === 0 ? k * (-1 + 2 * f) : k * (1 - 2 * f);
          wood = Math.max(wood, band((eta - want) * hIn * 0.7, 0.2, soft));
        }
      }
      wood = Math.max(wood, band(s - (FUSE_END_S - 0.2), 0.4, soft));
    }
    /* The yellow nose runs back along the lower side as the box art's
     * black does, under a straight line from the windshield's foot, 2.2 in
     * over the thrust line at station 10, to the bottom at station 46. */
    const { yc } = fuseAt(s);
    const hOver = (yc + eta * h) / 0.0254 + CG_H;
    const line = 2.2 - (2.2 + 5.7) * Math.min(1, Math.max(0, (s - 10) / 36));
    film = seam(films.fuse_trim, films.fuselage, hOver - line);
  } else {
    const { w } = fuseAt(s);
    const wIn = w / 0.0254;
    wood = Math.max(wood, band((k - Math.abs(eta)) * wIn, 0.5, soft));
    if (s < LE_S + CHORD_IN) {
      wood = Math.max(wood, 0.9);
    } else {
      for (const s0 of UPRIGHTS) {
        wood = Math.max(wood, band(s - s0, 0.25, soft));
      }
    }
  }
  return [...filmLit(film, wood), wood];
}

/*
 * The maps, drawn once per set of films and shared by every model built in
 * them: they are the same wood. Each map is painted from the two films it
 * shows, so it is keyed by those.
 *
 * THE STOCK MAPS ARE THE PAINTERS' OWN, kept for the session, so the stock
 * aircraft is the one it has always been, texel for texel. ANY OTHER FILMS
 * are laid on a FIELD instead: per texel, how much wood is under the film
 * and how far toward the map's second film it is, read once per map off
 * the painter run with a white first film and a black second. filmLit is
 * linear in the film, so the field recolours to any pair in a few
 * milliseconds where the painter takes a hundred and fifty, which is what
 * lets the hangar show a film under the cursor as it moves. A painted set
 * is kept among the last few, and one dropped is disposed (three uploads
 * it again if a model still wears it).
 */
const MAP_FILMS = { wing: ['wing', 'wing_trim'], stab: ['wing', 'wing_trim'], tail: ['fuselage', 'fuse_trim'], fuse: ['fuselage', 'fuse_trim'] };
const MAP_SIZE = { wing: [2048, 512], stab: [512, 256], tail: [256, 256], fuse: [2048, 512] };
const PAINTERS = { wing: wingPaint, stab: stabPaint, tail: tailPaint, fuse: fusePaint };
const PROBE = { wing: [1, 1, 1], wing_trim: [0, 0, 0], fuselage: [1, 1, 1], fuse_trim: [0, 0, 0] };
/* filmLit's factor on the film per channel for this much wood. */
const litOf = (wood, i) => 0.72 + wood * ((0.55 + 0.45 * BALSA[i]) * 1.08 - 0.72);
const MAPS = new Map();
const FIELDS = new Map();
const PAINTED_KEPT = 3;
function fieldFor(name, lite) {
  const key = `${name}${lite ? '-lite' : ''}`;
  let f = FIELDS.get(key);
  if (f) {
    return f;
  }
  const d = lite ? 2 : 1;
  const [w, h] = MAP_SIZE[name].map((n) => n / d);
  const paint = PAINTERS[name](PROBE);
  const wood = new Float32Array(w * h);
  const sel = new Float32Array(w * h);
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      const [r, , , a] = paint((i + 0.5) / w, (j + 0.5) / h);
      const k = j * w + i;
      wood[k] = a;
      sel[k] = 1 - r / litOf(a, 0);
    }
  }
  f = { w, h, wood, sel };
  FIELDS.set(key, f);
  return f;
}
function mapFor(name, lite, films) {
  const [first, second] = MAP_FILMS[name];
  const stock = films[first] === STOCK_FILMS[first] && films[second] === STOCK_FILMS[second];
  const key = `${name}${lite ? '-lite' : ''}|${stock ? 'stock' : [films[first], films[second]].map(toHex).join(',')}`;
  let tex = MAPS.get(key);
  if (tex) {
    if (!stock) {
      MAPS.delete(key);
      MAPS.set(key, tex);
    }
    return tex;
  }
  if (stock) {
    const d = lite ? 2 : 1;
    const [w, h] = MAP_SIZE[name].map((n) => n / d);
    tex = filmMap(w, h, PAINTERS[name](films));
  } else {
    const f = fieldFor(name, lite);
    const a = films[first];
    const b = films[second];
    const data = new Uint8Array(f.w * f.h * 4);
    const byte = (x) => Math.round(Math.min(1, Math.max(0, x)) * 255);
    for (let k = 0; k < f.w * f.h; k += 1) {
      const wood = f.wood[k];
      const t = f.sel[k];
      for (let i = 0; i < 3; i += 1) {
        data[k * 4 + i] = byte((a[i] + (b[i] - a[i]) * t) * litOf(wood, i));
      }
      data[k * 4 + 3] = byte(wood);
    }
    tex = filmMapOf(data, f.w, f.h);
  }
  MAPS.set(key, tex);
  const painted = [...MAPS.keys()].filter((k) => !k.endsWith('|stock'));
  while (painted.length > PAINTED_KEPT * 4) {
    const old = painted.shift();
    MAPS.get(old).dispose();
    MAPS.delete(old);
  }
  return tex;
}

function fuseGeometry(lite) {
  const around = lite ? 24 : 64;
  const ss = lite ? FUSE_STATIONS_LITE : FUSE_STATIONS;
  return loftUV(ss.map((s) => {
    const ring = [];
    for (let i = 0; i <= around; i += 1) {
      const a = (2 * Math.PI * i) / around;
      ring.push({ p: fusePoint(s, a), uv: [s / FUSE_END_S, i === around ? 1 : fuseV(s, a)] });
    }
    return ring;
  }), [[0, around]]);
}

/*
 * A flat plate of a tail surface: a symmetric section thick t in inches,
 * over a planform given as a list of stations, each { a, b, c, uv },
 * where a and b are the plate's leading and trailing edge points in the
 * craft frame and `across` the direction its thickness is laid along.
 */
function plateGeometry(rows, thickIn, across, uvOf, n) {
  const ts = chordTs(n);
  return loftUV(rows.map(({ a, b, key }) => {
    const sec = ts.map((t) => ({
      p: new THREE.Vector3().lerpVectors(a, b, t).addScaledVector(across, R(thickIn) * naca(t, 0.12) / 0.12 + 1e-5),
      uv: uvOf(key, t),
    }));
    for (let i = n - 1; i >= 0; i -= 1) {
      sec.push({
        p: new THREE.Vector3().lerpVectors(a, b, ts[i]).addScaledVector(across, -R(thickIn) * naca(ts[i], 0.12) / 0.12 - 1e-5),
        uv: uvOf(key, ts[i]),
      });
    }
    return sec;
  }), [[0, 2 * n - 1]]);
}

/* The stabiliser's planform at x inches: its leading edge rounded at the
 * outer corners, the trailing edge straight. */
function stabLE(ax) {
  const r = 2.0;
  if (ax <= STAB_HALF - r) {
    return STAB_LE_S;
  }
  const u = Math.min(0.999, (ax - (STAB_HALF - r)) / r);
  return STAB_LE_S + r * (1 - Math.sqrt(1 - u * u));
}
const stabY = () => ht(STAB_Y + STAB_T / 2);
function stabGeometry(lite, n) {
  const half = lite ? [0, 10, 13.5, STAB_HALF - 0.02] : [0, 4, 8, 12, 13.5, 14.5, 15.1, STAB_HALF - 0.02];
  const xs = [...half.slice(1).reverse().map((x) => -x), ...half];
  const uvOf = (x, t) => {
    const le = stabLE(Math.abs(x));
    return [(x + STAB_HALF) / (2 * STAB_HALF), (le - STAB_LE_S + t * (ELEV_HINGE_S - le)) / STAB_CHORD];
  };
  return plateGeometry(xs.map((x) => ({
    a: new THREE.Vector3(R(x), stabY(), st(stabLE(Math.abs(x)))),
    b: new THREE.Vector3(R(x), stabY(), st(ELEV_HINGE_S)),
    key: x,
  })), STAB_T, new THREE.Vector3(0, 1, 0), uvOf, n);
}
/* The elevator's trailing edge at x inches out, its outer inch rounded
 * off, and the stations its halves are lofted at. */
const elevTE = (ax) => STAB_TE_S - (ax > STAB_HALF - 1 ? (ax - STAB_HALF + 1) ** 2 * 0.8 : 0);
const ELEV_STATIONS = [ELEV_GAP, 4, 8, 12, 14.5, STAB_HALF - 0.02];
function elevatorHalf(sign, lite, n) {
  const half = lite ? [ELEV_GAP, 8, STAB_HALF - 0.02] : ELEV_STATIONS;
  const xs = sign > 0 ? half : half.slice().reverse().map((x) => -x);
  const uvOf = (x, t) => [(x + STAB_HALF) / (2 * STAB_HALF), (ELEV_HINGE_S - STAB_LE_S + t * (STAB_TE_S - ELEV_HINGE_S)) / STAB_CHORD];
  return plateGeometry(xs.map((x) => ({
    a: new THREE.Vector3(R(x), stabY(), st(ELEV_HINGE_S)),
    b: new THREE.Vector3(R(x), stabY(), st(elevTE(Math.abs(x)))),
    key: x,
  })), STAB_T * 0.7, new THREE.Vector3(0, 1, 0), uvOf, n);
}
/* The elevator's joiner, a wire under the rudder between the halves. */

function tailUV(s, h) {
  return [(s - FIN_ROOT_S) / TAIL_SPAN_S, (h - RUDDER_BOTTOM) / TAIL_SPAN_H];
}
function finGeometry(lite, n) {
  const base = STAB_Y + STAB_T;
  const hs = lite ? [base, 5, FIN_TOP - 0.6, FIN_TOP - 0.02] : [base, 2.5, 5, 7.5, 9.2, FIN_TOP - 0.3, FIN_TOP - 0.02];
  const top = (h) => (h > FIN_TOP - 0.8 ? 0.8 * (1 - Math.sqrt(Math.max(0, 1 - ((h - (FIN_TOP - 0.8)) / 0.8) ** 2))) : 0);
  /* The dorsal, the fin's leading edge carried down to the fuselage top. */
  const rows = [];
  const dorsal = [FIN_ROOT_H - 0.25, FIN_ROOT_H + 0.4];
  for (const h of [...dorsal, ...hs.filter((x) => x > dorsal[1] + 0.2)]) {
    const le = finLE(h) + top(h);
    rows.push({ a: new THREE.Vector3(0, ht(h), st(le)), b: new THREE.Vector3(0, ht(h), st(RUDDER_S)), key: h, le });
  }
  const uvOf = (h, t) => {
    const le = finLE(h) + top(h);
    return tailUV(le + t * (RUDDER_S - le), h);
  };
  return plateGeometry(rows, FIN_T, new THREE.Vector3(1, 0, 0), uvOf, n);
}
function rudderGeometry(lite, n) {
  const hs = lite
    ? [RUDDER_BOTTOM + 0.02, 0, 5, FIN_TOP - 0.02]
    : [RUDDER_BOTTOM + 0.02, -2, 0, 2.5, 5, 7.5, 9.4, FIN_TOP - 0.3, FIN_TOP - 0.02];
  const round = (h) => (h > FIN_TOP - 0.8 ? 0.8 * (1 - Math.sqrt(Math.max(0, 1 - ((h - (FIN_TOP - 0.8)) / 0.8) ** 2))) : 0);
  const uvOf = (h, t) => tailUV(RUDDER_S + t * (RUDDER_TE_S - round(h) - RUDDER_S), h);
  return plateGeometry(hs.map((h) => ({
    a: new THREE.Vector3(0, ht(h), st(RUDDER_S)),
    b: new THREE.Vector3(0, ht(h), st(RUDDER_TE_S - round(h))),
    key: h,
  })), FIN_T * 0.8, new THREE.Vector3(1, 0, 0), uvOf, n);
}

/* A round rod from a to b. */
function rod(a, b, r, seg) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  const m = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return g;
}

/* A 12 x 6 blade: a wide wooden sport prop's outline. */
function bladeGeometry(segments) {
  const r = PROP_R;
  const s = new THREE.Shape();
  s.moveTo(0.006, 0.010);
  s.bezierCurveTo(0.020, -0.020, 0.018, -r * 0.55, 0.009, -r * 0.97);
  s.lineTo(-0.004, -r * 0.96);
  s.bezierCurveTo(-0.014, -r * 0.45, -0.011, -0.015, -0.005, 0.010);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: false, curveSegments: segments });
}

function merged(parts, keepUv = false) {
  for (const g of parts) {
    if (!keepUv && g.getAttribute('uv')) {
      g.deleteAttribute('uv');
    }
  }
  const geo = mergeGeometries(parts, false);
  if (!geo) {
    throw new Error('kadetcraft: merge failed');
  }
  return geo;
}

/*
 * The gear and the attitude it sits the aircraft at: the ground line
 * tangent under the nose wheel's and the mains' circles, solved in the
 * level craft frame, nose down positive when the nose wheel sits lower.
 */
const MAIN_AXLE = [R(MAIN_TRACK / 2), ht(MAIN_H), st(MAIN_S)];
const NOSE_AXLE = [0, ht(NOSE_H), st(NOSE_S)];
const REST_PITCH = Math.atan2((MAIN_AXLE[1] - MAIN_R) - (NOSE_AXLE[1] - NOSE_R), MAIN_AXLE[2] - NOSE_AXLE[2]);
const restContact = (axle, r) => [
  axle[0],
  axle[1] - r * Math.cos(REST_PITCH),
  axle[2] + r * Math.sin(REST_PITCH),
];
const REST_CG_HEIGHT = (() => {
  const c = restContact(MAIN_AXLE, MAIN_R);
  return -(Math.cos(REST_PITCH) * c[1] - Math.sin(REST_PITCH) * c[2]);
})();

const WING_TOP = Math.max(...[36, 37.8, HALF - 0.1].flatMap((x) => chordTs(14).map((t) => wingAt(x)(t, 1).y)));
const UP = Math.max(ht(FIN_TOP), WING_TOP);
const DOWN = -Math.min(MAIN_AXLE[1] - MAIN_R, NOSE_AXLE[1] - NOSE_R);
/* The elevator's outer trailing corner at its loft's stations, since its
 * tip is rounded and the corner of its plan is not drawn. */
const REACH = Math.max(R(HALF), st(RUDDER_TE_S), ...ELEV_STATIONS.map((x) => Math.hypot(R(x), st(elevTE(x)))));
export const KADET_DIMS = {
  span: 2 * R(HALF),
  chord: R(CHORD_IN),
  dihedralDeg: (DIHEDRAL * 180) / Math.PI,
  stabSpan: 2 * R(STAB_HALF),
  finHeight: R(FIN_TOP - STAB_Y),
  gearTrack: R(MAIN_TRACK),
  propR: PROP_R,
  thrustY: ht(THRUST_H),
  noseZ: st(PROP_S) - 0.034,
  tailZ: st(RUDDER_TE_S),
  length: R(RUDDER_TE_S - PROP_S) + 0.034,
  reach: REACH,
  vHalfUp: UP,
  vHalfDown: DOWN,
  wing: {
    le: st(LE_S), te: st(LE_S + CHORD_IN), half: R(HALF), rootY: ht(ROOT_Y), tipY: ht(ROOT_Y + HALF * Math.tan(DIHEDRAL)),
  },
  wheels: {
    mainLeft: { axle: [-MAIN_AXLE[0], MAIN_AXLE[1], MAIN_AXLE[2]], r: MAIN_R, width: WHEEL_W },
    mainRight: { axle: [...MAIN_AXLE], r: MAIN_R, width: WHEEL_W },
    nose: { axle: [...NOSE_AXLE], r: NOSE_R, width: WHEEL_W },
  },
  contact: {
    mainLeft: [-MAIN_AXLE[0], MAIN_AXLE[1] - MAIN_R, MAIN_AXLE[2]],
    mainRight: [MAIN_AXLE[0], MAIN_AXLE[1] - MAIN_R, MAIN_AXLE[2]],
    nose: [0, NOSE_AXLE[1] - NOSE_R, NOSE_AXLE[2]],
  },
  rest: {
    pitch: REST_PITCH,
    pitchDeg: (REST_PITCH * 180) / Math.PI,
    cgHeight: REST_CG_HEIGHT,
    contact: {
      mainLeft: restContact([-MAIN_AXLE[0], MAIN_AXLE[1], MAIN_AXLE[2]], MAIN_R),
      mainRight: restContact(MAIN_AXLE, MAIN_R),
      nose: restContact(NOSE_AXLE, NOSE_R),
    },
  },
  dims: {
    arm: 0,
    propR: PROP_R,
    hullR: REACH,
    vHalfDown: DOWN,
    vHalfUp: UP,
    bodyLength: R(RUDDER_TE_S - PROP_S) + 0.034,
    bodyWidth: 2 * R(HALF),
    bodyHeight: UP + DOWN,
  },
};

/* The FPV camera on the cowl's top behind the engine's rocker cover. */
const CAM_S = 9.0;
export const KADET_MOUNT_FORWARD = -st(CAM_S);
export const KADET_MOUNT_UP = fuseAt(CAM_S).yc + fuseAt(CAM_S).h + 0.014;

/* A glow engine turns counter clockwise seen from the front, which is
 * clockwise from behind: cubcraft.js's sense. */
export const KADET_PROP_SPIN = [1, 0, 0, 0];

/* How far the nose wheel turns per radian of rudder, the steering arm's
 * throw against the rudder horn's (docs/KADET-STAGE1.md). */
export const KADET_NOSE_STEER = 0.6;

export function buildKadetCraft(opts = {}) {
  const fog = opts.fog !== false;
  const lite = Boolean(opts.lite);
  const inkOn = !lite;
  const shade = !lite;
  const cel = (o) => celMaterial({ fog, cloudShadow: 0, ...o });
  const film = (name, o = {}) => filmMaterial({
    fog, cloudShadow: 0, color: 0xffffff, rim: 0.26, spec: 0.34, specWidth: 0.012,
    map: mapFor(name, lite, STOCK_FILMS), key: `kadet-film-${name}${lite ? '-lite' : ''}`, glow: 2.0, ...o,
  });
  const group = new THREE.Group();
  group.name = opts.name ?? 'kadet-craft';
  if (opts.worldScale) {
    group.scale.setScalar(1 / WORLD_SCALE);
  }
  const hull = (mesh, t, c) => {
    if (inkOn) {
      outlineHull(mesh, t, c);
    }
    return mesh;
  };
  const seg = lite ? 8 : 14;
  const rodSeg = lite ? 4 : 6;

  const wingFilm = film('wing');
  const fuseFilm = film('fuse');
  const stabFilm = film('stab');
  const tailFilm = film('tail');
  const metal = cel({ color: 0xc2c6ca, rim: 0.30, spec: 0.75, specWidth: 0.022 });
  const tyre = cel({ color: 0x1b1b1d, rim: 0.30, spec: 0.20 });
  const hub = cel({ color: 0xd8d4c8, rim: 0.28, spec: 0.35 });
  const glass = cel({ color: 0x3a5064, rim: 0.40, spec: 0.60, specWidth: 0.020, specColor: 0xf3ead4 });
  const frame = cel({ color: 0xc8a676, rim: 0.28, spec: 0.20 });
  const stator = cel({ color: 0x9a9ea2, rim: 0.28, spec: 0.55, specWidth: 0.02 });
  const engineBlack = cel({ color: 0x202022, rim: 0.26, spec: 0.35 });
  const camBody = cel({ color: 0x141c16, rim: 0.26, spec: 0.35 });
  const lens = cel({
    color: 0x101610,
    rim: 0.40,
    spec: 0.95,
    specWidth: 0.03,
    specColor: 0xf3ead4,
    side: THREE.DoubleSide,
  });
  const ring = cel({ color: 0xb8b09e, rim: 0.28, spec: 0.55 });
  const propMat = cel({ color: 0x8a5a2c, rim: 0.26, spec: 0.30 });
  const spinnerMat = cel({ color: 0xc8161a, rim: 0.30, spec: 0.50, specWidth: 0.016 });
  const antenna = cel({ color: 0x1a241c, rim: 0.22 });
  const ink = 0x0c0c0e;

  if (opts.measure) {
    const d = KADET_DIMS;
    const body = new THREE.Mesh(new THREE.BoxGeometry(d.span, d.vHalfUp + d.vHalfDown, d.length), metal);
    body.position.set(0, (d.vHalfUp - d.vHalfDown) / 2, (d.tailZ + d.noseZ) / 2);
    body.visible = false;
    body.castShadow = false;
    group.add(body);
  }

  /* The fuselage in its film, centred on its own middle for the outline. */
  {
    const geo = fuseGeometry(lite);
    geo.computeBoundingBox();
    const c = geo.boundingBox.getCenter(new THREE.Vector3());
    geo.translate(-c.x, -c.y, -c.z);
    const fuse = new THREE.Mesh(geo, fuseFilm);
    fuse.position.copy(c);
    fuse.name = 'kadet-fuselage';
    fuse.castShadow = shade;
    hull(fuse, 1.015, ink);
    group.add(fuse);
  }

  /* The wing in its film. */
  {
    const wing = new THREE.Mesh(wingGeometry(lite), wingFilm);
    wing.name = 'kadet-wing';
    wing.castShadow = shade;
    group.add(wing);
  }

  /* The stabiliser and the fin, fixed. */
  {
    const n = lite ? 5 : 7;
    const stab = new THREE.Mesh(stabGeometry(lite, n), stabFilm);
    stab.name = 'kadet-stab';
    stab.castShadow = shade;
    group.add(stab);
    const fin = new THREE.Mesh(finGeometry(lite, n), tailFilm);
    fin.name = 'kadet-fin';
    fin.castShadow = shade;
    group.add(fin);
  }

  /* The glass: the windshield from the cowl up to the wing, and the two
   * windows a side in their die cut ply frames, as the kit builds them. */
  {
    const parts = [];
    const pane = (s0, s1, h0, h1, sign) => {
      const out = 0.0015;
      const p = (s, h) => {
        const { w } = fuseAt(s);
        return new THREE.Vector3(sign * (w + out), ht(h), st(s));
      };
      const g = new THREE.BufferGeometry();
      const v = [p(s0, h0), p(s1, h0), p(s1, h1), p(s0, h1)];
      g.setFromPoints([v[0], v[1], v[2], v[0], v[2], v[3]]);
      g.computeVertexNormals();
      if (g.getAttribute('normal').getX(0) * sign < 0) {
        g.setFromPoints([v[0], v[2], v[1], v[0], v[3], v[2]]);
        g.computeVertexNormals();
      }
      return g;
    };
    for (const sign of [-1, 1]) {
      parts.push(pane(12.2, 19.5, 0.0, 2.9, sign));
      parts.push(pane(20.2, 26.0, 0.0, 2.7, sign));
    }
    /* The windshield: a raked panel from the cowl's top to the wing's
     * leading edge, across the fuselage. */
    const ws = [];
    const wsN = lite ? 4 : 8;
    for (let i = 0; i <= wsN; i += 1) {
      const f = i / wsN;
      const x = (f - 0.5) * 2 * R(1.86);
      ws.push([new THREE.Vector3(x, ht(2.25), st(8.4)), new THREE.Vector3(x, ht(ROOT_Y - 0.05), st(LE_S + 0.3))]);
    }
    const wsPos = [];
    for (let i = 0; i < wsN; i += 1) {
      const [a0, b0] = ws[i];
      const [a1, b1] = ws[i + 1];
      wsPos.push(a0, b0, a1, a1, b0, b1);
    }
    const wsGeo = new THREE.BufferGeometry().setFromPoints(wsPos);
    wsGeo.computeVertexNormals();
    parts.push(wsGeo);
    const glassMesh = new THREE.Mesh(merged(parts), glass);
    glassMesh.material.side = THREE.DoubleSide;
    glassMesh.name = 'kadet-glass';
    group.add(glassMesh);
  }

  /* The window frames: the die cut ply round each window. */
  {
    const parts = [];
    for (const sign of [-1, 1]) {
      const { w } = fuseAt(19.9);
      for (const [s0, s1] of [[12.0, 12.25], [19.75, 20.05], [26.1, 26.35]]) {
        const b = new THREE.BoxGeometry(0.004, R(3.1), R(s1 - s0));
        b.translate(sign * (w + 0.002), ht(1.45), st((s0 + s1) / 2));
        parts.push(b);
      }
    }
    const frames = new THREE.Mesh(merged(parts), frame);
    frames.name = 'kadet-window-frames';
    group.add(frames);
  }

  /* The gear: 5/32 in wire. The mains a torsion bar from the grooved
   * block under the cabin down and out to each axle; the nose leg down
   * from its bearing on the firewall with a coil above the fork. */
  const noseSteer = new THREE.Group();
  {
    const parts = [];
    const floor = fuseAt(MAIN_S).yc - fuseAt(MAIN_S).h;
    for (const sign of [-1, 1]) {
      const axle = new THREE.Vector3(sign * (MAIN_AXLE[0] - WHEEL_W / 2 - 0.002), MAIN_AXLE[1], MAIN_AXLE[2]);
      const root = new THREE.Vector3(sign * R(1.4), floor + 0.002, st(MAIN_S - 0.4));
      parts.push(rod(root, axle, WIRE_R, rodSeg));
      parts.push(rod(axle, new THREE.Vector3(sign * (MAIN_AXLE[0] + WHEEL_W / 2 + 0.004), MAIN_AXLE[1], MAIN_AXLE[2]), WIRE_R, rodSeg));
    }
    parts.push(rod(new THREE.Vector3(-R(1.4), floor + 0.002, st(MAIN_S - 0.4)), new THREE.Vector3(R(1.4), floor + 0.002, st(MAIN_S - 0.4)), WIRE_R, rodSeg));
    const wire = new THREE.Mesh(merged(parts), metal);
    wire.name = 'kadet-wire';
    wire.castShadow = shade;
    group.add(wire);

    /* The nose leg turns about its own vertical axis, so it lives in a
     * group pivoted there. */
    noseSteer.position.set(0, 0, NOSE_AXLE[2]);
    group.add(noseSteer);
    const top = fuseAt(NOSE_TOP_S).yc - fuseAt(NOSE_TOP_S).h + 0.02;
    const legParts = [
      rod(new THREE.Vector3(0, top, st(NOSE_TOP_S) - NOSE_AXLE[2]), new THREE.Vector3(0, NOSE_AXLE[1] + NOSE_R + 0.012, 0), WIRE_R, rodSeg),
    ];
    const coilY = NOSE_AXLE[1] + NOSE_R + 0.03;
    legParts.push(new THREE.TorusGeometry(0.009, WIRE_R, 4, lite ? 8 : 12).rotateX(Math.PI / 2).translate(0, coilY, 0));
    for (const sign of [-1, 1]) {
      legParts.push(rod(new THREE.Vector3(0, NOSE_AXLE[1] + NOSE_R + 0.012, 0),
        new THREE.Vector3(sign * (WHEEL_W / 2 + 0.003), NOSE_AXLE[1] + NOSE_R + 0.012, 0), WIRE_R, rodSeg));
      legParts.push(rod(new THREE.Vector3(sign * (WHEEL_W / 2 + 0.003), NOSE_AXLE[1] + NOSE_R + 0.012, 0),
        new THREE.Vector3(sign * (WHEEL_W / 2 + 0.003), NOSE_AXLE[1], 0), WIRE_R, rodSeg));
    }
    const leg = new THREE.Mesh(merged(legParts), metal);
    leg.name = 'kadet-nose-leg';
    leg.castShadow = shade;
    noseSteer.add(leg);
  }

  /* The wheels: tyres, one draw for the mains and the nose wheel's own in
   * the steering group, and their hubs. */
  {
    const wheel = (r, x, y, z) => {
      const t = new THREE.TorusGeometry(r - 0.009, 0.009, lite ? 5 : 8, lite ? 16 : 24);
      t.rotateY(Math.PI / 2);
      t.scale(WHEEL_W / 0.018, 1, 1);
      t.translate(x, y, z);
      return t;
    };
    const hubOf = (r, x, y, z) => {
      const h = new THREE.CylinderGeometry(r - 0.016, r - 0.016, WHEEL_W * 0.7, seg);
      h.rotateZ(Math.PI / 2);
      h.translate(x, y, z);
      return h;
    };
    const tyres = [];
    const hubs = [];
    for (const sign of [-1, 1]) {
      tyres.push(wheel(MAIN_R, sign * MAIN_AXLE[0], MAIN_AXLE[1], MAIN_AXLE[2]));
      hubs.push(hubOf(MAIN_R, sign * MAIN_AXLE[0], MAIN_AXLE[1], MAIN_AXLE[2]));
    }
    const mainTyres = new THREE.Mesh(merged(tyres), tyre);
    mainTyres.name = 'kadet-tyres';
    mainTyres.castShadow = shade;
    group.add(mainTyres);
    group.add(Object.assign(new THREE.Mesh(merged(hubs), hub), { name: 'kadet-hubs' }));
    const noseTyre = new THREE.Mesh(wheel(NOSE_R, 0, NOSE_AXLE[1], 0), tyre);
    noseTyre.name = 'tyre-nose';
    noseTyre.castShadow = shade;
    noseSteer.add(noseTyre);
    noseSteer.add(new THREE.Mesh(hubOf(NOSE_R, 0, NOSE_AXLE[1], 0), hub));
  }

  /*
   * The engine: the O.S. FS-52 Surpass upright at its size off O.S.'s
   * drawing: the crankcase in the cowl, the finned cylinder and the head
   * with its rocker cover standing out of the cowl's top, the push rod
   * tube down its front, the silencer on the right.
   */
  {
    const metalParts = [];
    const blackParts = [];
    const cylS = 2.3;
    const up = (h) => ht(THRUST_H) + R(h);
    const barrel = new THREE.CylinderGeometry(R(0.62), R(0.62), R(1.4), seg);
    barrel.translate(0, up(1.5), st(cylS));
    metalParts.push(barrel);
    const fins = lite ? 3 : 7;
    for (let i = 0; i < fins; i += 1) {
      const f = new THREE.CylinderGeometry(R(0.82), R(0.82), R(0.05), seg);
      f.translate(0, up(1.0 + (i * 1.0) / fins), st(cylS));
      metalParts.push(f);
    }
    const head = new THREE.BoxGeometry(R(1.5), R(0.55), R(1.35));
    head.translate(0, up(2.45), st(cylS));
    metalParts.push(head);
    const rocker = new THREE.BoxGeometry(R(1.2), R(0.3), R(1.0));
    rocker.translate(0, up(2.87), st(cylS));
    blackParts.push(rocker);
    const plug = new THREE.CylinderGeometry(R(0.14), R(0.14), R(0.4), 6);
    plug.rotateZ(Math.PI / 2);
    plug.translate(R(0.8), up(2.45), st(cylS));
    metalParts.push(plug);
    const pushrod = rod(new THREE.Vector3(0, up(0.6), st(cylS - 0.72)), new THREE.Vector3(0, up(2.3), st(cylS - 0.72)), R(0.1), 6);
    metalParts.push(pushrod);
    const header = rod(new THREE.Vector3(R(0.6), up(2.3), st(cylS + 0.2)), new THREE.Vector3(R(2.1), up(0.6), st(cylS + 1.0)), R(0.18), 6);
    metalParts.push(header);
    const silencer = new THREE.CylinderGeometry(R(0.55), R(0.55), R(2.6), seg);
    silencer.rotateX(Math.PI / 2);
    silencer.translate(R(2.25), up(0.2), st(cylS + 1.8));
    metalParts.push(silencer);
    const engMetal = new THREE.Mesh(merged(metalParts), stator);
    engMetal.name = 'kadet-engine';
    engMetal.castShadow = shade;
    group.add(engMetal);
    const engBlack = new THREE.Mesh(merged(blackParts), engineBlack);
    engBlack.name = 'kadet-rocker';
    engBlack.castShadow = shade;
    group.add(engBlack);
  }

  /* The moving surfaces: the elevator in two halves joined under the
   * rudder, and the rudder, each in its film. */
  const n = lite ? 4 : 6;
  const hinged = (geo, a, b, material) => {
    const axis = new THREE.Vector3().subVectors(b, a).normalize();
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    geo.translate(-mid.x, -mid.y, -mid.z);
    const pivot = new THREE.Group();
    pivot.position.copy(mid);
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = shade;
    pivot.add(mesh);
    return { pivot, axis, mesh };
  };
  const eh = (x) => new THREE.Vector3(R(x), stabY(), st(ELEV_HINGE_S));
  const elevGeo = mergeGeometries([elevatorHalf(-1, lite, n), elevatorHalf(1, lite, n),
    (() => {
      const j = rod(eh(-ELEV_GAP - 0.2), eh(ELEV_GAP + 0.2), R(1 / 16), rodSeg);
      j.translate(0, 0, R(0.4));
      j.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(j.getAttribute('position').count * 2), 2));
      return j;
    })()], false);
  const elevator = hinged(elevGeo, eh(-STAB_HALF), eh(STAB_HALF), stabFilm);
  const rudder = hinged(rudderGeometry(lite, n),
    new THREE.Vector3(0, ht(RUDDER_BOTTOM), st(RUDDER_S)),
    new THREE.Vector3(0, ht(FIN_TOP), st(RUDDER_S)),
    tailFilm);
  const surfaces = { elevator, rudder };
  for (const [name, s] of Object.entries(surfaces)) {
    s.pivot.name = name;
    group.add(s.pivot);
  }

  const cameraMount = new THREE.Group();
  cameraMount.position.set(0, KADET_MOUNT_UP, -KADET_MOUNT_FORWARD);
  cameraMount.name = 'kadet-camera-mount';
  group.add(cameraMount);
  {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.019, 0.019, 0.019), camBody);
    housing.position.set(0, 0, 0.006);
    housing.castShadow = shade;
    hull(housing, 1.08, ink);
    cameraMount.add(housing);
    const barrelC = new THREE.Mesh(new THREE.CylinderGeometry(0.0078, 0.0084, 0.012, lite ? 8 : 14), camBody);
    barrelC.rotation.x = Math.PI / 2;
    barrelC.position.set(0, 0, -0.010);
    cameraMount.add(barrelC);
    const glassDisc = new THREE.Mesh(new THREE.CircleGeometry(0.0070, lite ? 10 : 18), lens);
    glassDisc.rotation.y = Math.PI;
    glassDisc.position.set(0, 0, -0.0162);
    cameraMount.add(glassDisc);
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.0076, 0.0013, lite ? 4 : 6, lite ? 10 : 14), ring);
    bezel.position.set(0, 0, -0.0156);
    cameraMount.add(bezel);
  }

  /* The video antenna, a whip off the deck behind the wing. Named: it is
   * wire, not aircraft, and scripts/craft-check.js leaves it out. */
  {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.09, lite ? 5 : 8), antenna);
    const s = 31.0;
    mast.position.set(0, fuseAt(s).yc + fuseAt(s).h + 0.042, st(s) + 0.012);
    mast.rotation.x = 0.35;
    mast.name = 'antenna';
    group.add(mast);
  }

  /*
   * The prop and spinner. The mount turns the rotor's y onto the craft's
   * forward axis, as cubcraft.js does, so rotor.rotation.y is the spin the
   * shell drives.
   */
  const discs = [];
  const blades = [];
  const leds = [];
  {
    const propMount = new THREE.Group();
    propMount.position.set(0, ht(THRUST_H), st(PROP_S));
    propMount.rotation.x = -Math.PI / 2;
    group.add(propMount);
    const prof = [];
    const m = lite ? 4 : 8;
    const back = -0.012;
    prof.push(new THREE.Vector2(0.0001, back));
    for (let i = 0; i <= m; i += 1) {
      const u = i / m;
      prof.push(new THREE.Vector2(Math.max(0.0004, SPINNER_R * Math.sqrt(Math.max(0, 1 - u * u))), back + 0.001 + 0.045 * u));
    }
    const spinner = new THREE.Mesh(new THREE.LatheGeometry(prof, lite ? 10 : 18), spinnerMat);
    spinner.name = 'spinner';
    spinner.castShadow = shade;
    propMount.add(spinner);

    const rotor = new THREE.Group();
    propMount.add(rotor);
    const bladeGeo = bladeGeometry(lite ? 5 : 8);
    bladeGeo.rotateX(-Math.PI / 2);
    bladeGeo.rotateZ((14 * Math.PI) / 180);
    const bladeMesh = new THREE.Mesh(mergeGeometries([bladeGeo, bladeGeo.clone().rotateY(Math.PI)], false), propMat);
    bladeMesh.castShadow = shade;
    rotor.add(bladeMesh);
    blades.push(rotor);

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(PROP_R, PROP_R, 0.0012, lite ? 16 : 32),
      new THREE.MeshBasicMaterial({ color: 0x5a3e24, transparent: true, opacity: 0.12, depthWrite: false, fog }),
    );
    disc.renderOrder = 1;
    propMount.add(disc);
    discs.push(disc);
  }
  for (let k = 1; k < 4; k += 1) {
    const none = new THREE.Group();
    group.add(none);
    blades.push(none);
    const noDisc = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, fog }),
    );
    noDisc.visible = false;
    group.add(noDisc);
    discs.push(noDisc);
  }

  /* Four lamps on the four slots, skycraft.js's arrangement: sakura on
   * the left tip and the cowl, mint on the right tip and the deck. */
  const lampAt = [
    { p: wingAt(-37.5)(0.5, 1), front: true },
    { p: wingAt(37.5)(0.5, 1), front: false },
    { p: fusePoint(3.0, 0), front: true },
    { p: fusePoint(40.0, 0), front: false },
  ];
  for (const at of lampAt) {
    const base = at.front ? 0xe8a8b8 : 0x7dffb4;
    const ledMat = new THREE.MeshBasicMaterial({ color: base, fog });
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.004, 0.014), ledMat);
    led.position.copy(at.p);
    led.position.y += 0.002;
    group.add(led);
    leds.push({ mesh: led, mat: ledMat, front: at.front, base });
  }

  /*
   * The paint: four films, each region's colour a film the maps are drawn
   * in, on the livery contract src/render/livery.js states. The film
   * material is the same material with another map, so nothing recompiles.
   */
  let films = STOCK_FILMS;
  const filmMats = { wing: wingFilm, stab: stabFilm, tail: tailFilm, fuse: fuseFilm };
  const livery = {
    stock: () => ({ ...KADET_FILM_STOCK }),
    set(colours = {}) {
      films = filmsFor(colours);
      for (const [name, mat] of Object.entries(filmMats)) {
        mat.map = mapFor(name, lite, films);
      }
    },
    read: () => Object.fromEntries(Object.entries(films).map(([k, c]) => [k, toHex(c)])),
  };

  /* Radians: left aileron, right aileron, elevator, rudder; the first two
   * are the ailerons the Kadet has not got. Each hinge axis points +x or
   * +y, so each turns by the negated angle (cubcraft.js). The nose wheel
   * turns about the craft's vertical with the rudder: trailing edge left,
   * positive, turns its front left, which is a positive turn about +y. */
  const q = new THREE.Quaternion();
  function setSurfaces(leftRad, rightRad, elevRad = 0, rudRad = 0) {
    elevator.pivot.quaternion.copy(q.setFromAxisAngle(elevator.axis, -elevRad));
    rudder.pivot.quaternion.copy(q.setFromAxisAngle(rudder.axis, -rudRad));
    noseSteer.rotation.y = KADET_NOSE_STEER * rudRad;
  }
  setSurfaces(0, 0, 0, 0);

  return {
    group,
    discs,
    blades,
    leds,
    cameraMount,
    stator,
    propSpin: KADET_PROP_SPIN,
    setSurfaces,
    livery,
  };
}
